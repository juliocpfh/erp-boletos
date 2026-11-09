// Dados na nuvem, lado do sistema: cópia local, fila de envio (funciona sem internet) e o que mudou em cada gravação.
// O sistema continua com o banco inteiro na memória (telas e regras iguais); a cada `alterar` compara antes e depois
// e manda só as diferenças ao cofre (nuvem/cofre.mjs). Estudo e decisões: documentacao/ESTUDO_DADOS_NUVEM.md, DECISOES.md 2026-11-06.

/** Igual a RAIZ_DO_SERVIDOR de nuvem/cofre.mjs (tests/sincronia.test.mjs confere): campos que o aparelho não envia. */
export const RAIZ_DO_SERVIDOR = ['formato', 'revisao', 'atualizado_em', 'atualizado_por', 'seq', 'revisao_so_sessao', 'historico', '_nuvem'];
/** Contador que só anda com internet (número da NF): gravação que o muda vai na hora e espera a resposta. */
export const CONTADORES = ['proxima_fatura'];
/** Sessões lembradas por usuário (vários navegadores/computadores); igual a MAX_SESSOES de nuvem/cofre.mjs, que junta as listas dos aparelhos. */
export const MAX_SESSOES = 10;
const FAIXA = 1000; // códigos reservados por tabela para este aparelho
const RESERVA_MINIMA = 200; // abaixo disso, pede uma faixa nova quando tiver internet

/** Erro que o usuário entende (aparece na tela, não vai ao console), como C.ErroUsuario. */
export class ErroNuvem extends Error {
  constructor(mensagem, status = 0, extra = {}) { super(mensagem); this.esperado = true; this.status = status; this.extra = extra; }
}

/** JSON com as chaves em ordem (igual a canon de cofre.mjs). */
export function canon(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
}
/**
 * Iguais? Primeiro o JSON.stringify (nativo, rápido; `depois` é um clone de `antes`, então as chaves vêm na mesma ordem);
 * só se der diferente é que a comparação com as chaves em ordem (`canon`) decide. Uma gravação compara o banco inteiro.
 */
const igual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b) || canon(a) === canon(b);
const ehTabela = (v) => Array.isArray(v) && v.every((r) => r && typeof r === 'object' && Number.isSafeInteger(r.id));
/** Intervalo (ms) em que várias gravações seguidas (duplo clique, arrumações do Painel) vão numa sincronia só. */
export const AGRUPAR_ENVIO = 300;
/**
 * Lote grande vai à nuvem em partes de até PARTE_MAXIMA mudanças e PARTE_BYTES (o cofre aceita até 2000 mudanças e 8 MB por
 * pedido, MAX_OPS de nuvem/cofre.mjs): um extrato de 1.100 lançamentos dá 2.200 mudanças numa gravação só.
 */
export const PARTE_MAXIMA = 1000;
export const PARTE_BYTES = 4 * 1024 * 1024;
const NOMES_PROIBIDOS = ['__proto__', 'constructor', 'prototype'];
const seqDe = (d) => Number(d?._nuvem?.seq || 0);

/**
 * Cópia do banco para uma gravação mexer: tudo copiado, menos as entradas do histórico, que são as mesmas (a lista é nova).
 * O histórico só cresce e uma gravação só mexe na entrada que ela mesma criou (desfazer marca `desfaz` na última, regras.js);
 * copiar as milhares de entradas a cada clique era 2/3 do custo da cópia. A ordem dos campos fica a mesma.
 */
export function copiar(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.historico)) return structuredClone(d);
  const { historico, ...resto } = d;
  const copia = structuredClone(resto);
  const c = {};
  for (const k of Object.keys(d)) c[k] = k === 'historico' ? historico.slice() : copia[k];
  return c;
}

/**
 * O que mudou de `antes` para `depois`, no formato do lote do cofre.
 * Tabelas: inserir / alterar (campo a campo, com antes e depois) / excluir (com o registro como estava).
 * Fora das tabelas: raiz. Histórico: só as entradas novas (o histórico só cresce).
 * Dois registros com o mesmo código numa tabela mudada: lança (o 2º viraria "alterar" do 1º e o apagaria na nuvem).
 */
export function diferencas(antes, depois) {
  const ops = [];
  const chaves = new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})]);
  for (const k of chaves) {
    if (k === 'historico') {
      const a = antes?.historico || []; const b = depois?.historico || [];
      for (const h of b.slice(a.length)) ops.push({ op: 'historico', entrada: h });
      continue;
    }
    if (RAIZ_DO_SERVIDOR.includes(k)) continue;
    const va = antes?.[k]; const vb = depois?.[k];
    if (igual(va, vb)) continue; // tabela (ou campo) que não mudou: uma comparação só, sem olhar registro a registro
    if (ehTabela(va ?? []) && ehTabela(vb ?? []) && (Array.isArray(va) || Array.isArray(vb))) {
      const porId = new Map((va || []).map((r) => [r.id, r]));
      const novos = new Set();
      for (const r of vb || []) {
        if (novos.has(r.id)) throw new ErroNuvem(`Dois registros com o mesmo código (${r.id}) em ${k}: nada foi gravado. Recarregue a página e faça de novo.`);
        novos.add(r.id);
        const velho = porId.get(r.id);
        if (!velho) { ops.push({ op: 'inserir', tabela: k, id: r.id, dados: r }); continue; }
        if (igual(velho, r)) continue;
        const campos = {};
        for (const c of new Set([...Object.keys(velho), ...Object.keys(r)])) {
          if (igual(velho[c], r[c])) continue;
          campos[c] = c in r && r[c] !== undefined ? { antes: velho[c], depois: r[c] } : { antes: velho[c] }; // sem "depois" = campo apagado
        }
        ops.push({ op: 'alterar', tabela: k, id: r.id, campos });
      }
      for (const r of va || []) if (!novos.has(r.id)) ops.push({ op: 'excluir', tabela: k, id: r.id, base: r });
      continue;
    }
    ops.push({ op: 'raiz', campo: k, antes: va, depois: vb });
  }
  return ops;
}

/** Aplica um lote num banco em memória (a mesma coisa que o cofre faz, sem conferir conflitos). */
export function aplicarOps(d, ops) {
  for (const o of ops) {
    if (o.op === 'historico') (d.historico ||= []).push(o.entrada);
    else if (o.op === 'raiz') { if (o.depois === undefined) delete d[o.campo]; else d[o.campo] = structuredClone(o.depois); }
    else if (o.op === 'inserir') { const t = (d[o.tabela] ||= []); if (!t.some((r) => r.id === o.id)) t.push(structuredClone(o.dados)); }
    else if (o.op === 'excluir') d[o.tabela] = (d[o.tabela] || []).filter((r) => r.id !== o.id);
    else if (o.op === 'alterar') {
      const r = (d[o.tabela] || []).find((x) => x.id === o.id);
      if (!r) continue;
      for (const [c, v] of Object.entries(o.campos)) { if ('depois' in v) r[c] = structuredClone(v.depois); else delete r[c]; }
    }
  }
  return d;
}

/**
 * Campo da raiz que na verdade é uma tabela (lista de registros com código), um campo do servidor ou um nome proibido:
 * mudança "raiz" com esse nome não vale (trocaria a tabela inteira, passando por cima das regras de quem pode mudar cada uma).
 * `tabelas`: nomes das tabelas que o sistema conhece (mesmo as ainda vazias ou que esta cópia ainda não tem).
 */
const raizProibida = (d, campo, valor, tabelas) => typeof campo !== 'string' || RAIZ_DO_SERVIDOR.includes(campo) || NOMES_PROIBIDOS.includes(campo)
  || !!tabelas?.has?.(campo) || (Array.isArray(d[campo]) && ehTabela(d[campo])) || (Array.isArray(valor) && valor.length > 0 && ehTabela(valor));

/** Aplica no banco local uma mudança que veio da fila da nuvem (GET dados/mudancas). */
export function aplicarMudanca(d, m, tabelas = null) {
  if (m.tipo === 'registro') {
    const t = (d[m.tabela] ||= []);
    const i = t.findIndex((r) => r.id === m.id);
    if (i >= 0) t[i] = m.dados; else t.push(m.dados);
  } else if (m.tipo === 'exclusao') d[m.tabela] = (d[m.tabela] || []).filter((r) => r.id !== m.id);
  else if (m.tipo === 'raiz') {
    const campo = m.dados?.campo;
    if (raizProibida(d, campo, m.dados?.valor, tabelas)) return d; // o cofre recusa; um cofre antigo aceitava: aqui não vale
    if (!('valor' in m.dados)) delete d[campo]; else d[campo] = m.dados.valor;
  } else if (m.tipo === 'historico') (d.historico ||= []).push(m.dados);
  return d;
}

const ehContador = (o) => o.op === 'raiz' && CONTADORES.includes(o.campo);

/**
 * Partes de um lote para mandar à nuvem (lote pequeno: ele mesmo). Por que qualquer corte serve: no cofre cada mudança vale
 * por si (um registro inserido, um campo alterado, um registro excluído, uma entrada do histórico, um campo da raiz) e
 * `diferencas` dá uma só por registro, então uma parte nunca depende de outra para ser aceita; a ordem das mudanças é a mesma
 * do lote (o histórico continua na ordem), e as partes vão uma depois da outra. O corte depende só do lote, então reenviar dá
 * as mesmas partes com os mesmos códigos (`<lote>-p1`, `-p2`…) e a nuvem reconhece as que já recebeu. O número da NF
 * (contador) vai sempre na 1ª parte: se ele for recusado (outro aparelho usou o número), nada do resto foi aplicado.
 */
export function dividirLote(l, { maximo = PARTE_MAXIMA, bytes = PARTE_BYTES } = {}) {
  const pesos = l.ops.map((o) => JSON.stringify(o).length);
  if (l.ops.length <= maximo && pesos.reduce((s, p) => s + p, 0) <= bytes) return [l];
  const ordem = [...l.ops.keys()].sort((a, b) => Number(ehContador(l.ops[b])) - Number(ehContador(l.ops[a])) || a - b);
  const partes = []; let atual = []; let peso = 0;
  for (const i of ordem) {
    if (atual.length && (atual.length >= maximo || peso + pesos[i] > bytes)) { partes.push(atual); atual = []; peso = 0; }
    atual.push(l.ops[i]); peso += pesos[i];
  }
  if (atual.length) partes.push(atual);
  return partes.map((ops, i) => ({ id: `${l.id}-p${i + 1}`, ops, em: l.em }));
}

/** Faixas de códigos de duas cópias (memória e aparelho): por tabela vale a mais nova (fim maior) e, na mesma, a mais adiantada. */
export function juntarFaixas(a = {}, b = {}) {
  const r = { ...a };
  for (const [t, f] of Object.entries(b || {})) {
    if (!f || !Number.isSafeInteger(f.proximo) || !Number.isSafeInteger(f.fim)) continue;
    const x = r[t];
    if (!x || f.fim > x.fim) r[t] = { ...f };
    else if (f.fim === x.fim && f.proximo > x.proximo) r[t] = { ...x, proximo: f.proximo };
  }
  return r;
}

/** Os códigos dos lotes de uma fila, para ver se ela mudou (cada lote tem código único e não muda depois de criado). */
const idsDaFila = (fila) => fila.map((l) => l.id).join(' ');

/**
 * Falha passageira (sem internet ou tempo esgotado, login do Access vencido, pedido demorado (408), muitos pedidos (429),
 * nuvem fora do ar): o lote ou o anexo fica na fila e vai depois. A mesma regra vale para os anexos (pasta-nuvem.js).
 */
export const passageiro = (e) => !e.status || e.status === 401 || e.status === 408 || e.status === 429 || e.status >= 500;
/** Tempo máximo de cada pedido à nuvem (ms): pedido pendurado travaria a fila e a numeração da NF. Anexo (PUT) tem mais. */
export const TEMPO_LIMITE = 30000;
export const TEMPO_LIMITE_ANEXO = 120000;
/** Sinal que cancela o pedido depois de `ms` (navegador sem suporte: sem limite). */
export const limiteDeTempo = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);
/** Erro de rede ou tempo esgotado → ErroNuvem com status 0 (passageiro). */
export const erroDeRede = (e) => new ErroNuvem(e?.name === 'TimeoutError' ? 'A nuvem demorou demais para responder. Tente de novo.' : 'Sem internet.', 0);

/** Registros e campos que os lotes deste aparelho mexem (para separar o que volta da nuvem do que é de outro). */
function chavesDosLotes(lotes) {
  const chaves = new Set(); let historico = 0;
  for (const l of lotes) for (const o of l.ops) {
    if (o.op === 'historico') historico += 1;
    else if (o.op === 'raiz') chaves.add(`raiz:${o.campo}`);
    else chaves.add(`${o.tabela}:${o.id}`);
  }
  return { chaves, historico };
}

const aleatorio = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Sincronia de um aparelho com o cofre.
 * - `base`: o banco como está na nuvem até `base._nuvem.seq`; `pendentes`: lotes deste aparelho ainda não confirmados.
 * - O que a tela vê (`atual()`) = base + pendentes, com `seq` apontando para a faixa de códigos deste aparelho.
 * - Abas do mesmo navegador dividem a cópia local (fila, faixas, base): `trava` deixa uma de cada vez mexer nela, por pouco
 *   tempo (ler e gravar no aparelho). Os pedidos à nuvem ficam fora da trava: internet ruim não segura as gravações.
 * @param {object} o
 * @param {(metodo: string, rota: string, corpo?: any) => Promise<any>} o.api  chama /api/dados/<rota>; erro HTTP = ErroNuvem com `status`; sem internet = ErroNuvem com status 0
 * @param {{ler: (k: string) => Promise<any>, gravar: (k: string, v: any) => Promise<void>, apagar?: (k: string) => Promise<void>}} o.guardar  cópia local (IndexedDB)
 * @param {string[]} [o.tabelas]  tabelas que o sistema conhece (bancoVazio de regras.js): ganham faixa de códigos mesmo vazias
 */
export class Sincronia {
  /** `trava(fn)`: uma aba de cada vez mexe na fila (navigator.locks no navegador); sem ela, roda direto. */
  constructor({ api, guardar, aoMudar = () => {}, trava = (fn) => fn(), normalizar = (d) => d, agrupar = AGRUPAR_ENVIO, tabelas = [] }) {
    this.api = api; this.guardar = guardar; this.aoMudar = aoMudar; this.trava = trava; this.normalizar = normalizar;
    this.agrupar = agrupar; this.tabelas = new Set(tabelas);
    this.base = null; this.pendentes = []; this.faixas = {}; this.recusas = []; this.conflitos = [];
    this.aparelho = null; this.n = 0; this.online = true; this.enviando = null; this.vista = null; this.externo = false;
    this.envioMarcado = null; this.semFaixas = false;
    this.geracao = 0; // anda toda vez que a vista deixa de valer (base, fila ou faixas mudaram)
    this.normalizarMexeuNoHistorico = false;
    this.puxando = Promise.resolve(); // um puxar de cada vez (dois aplicariam as mesmas mudanças duas vezes)
    this.aba = aleatorio().slice(0, 6);
  }

  async iniciar() {
    this.aparelho = (await this.guardar.ler('aparelho')) || `ap${aleatorio()}`;
    await this.guardar.gravar('aparelho', this.aparelho);
    this.n = Number(await this.guardar.ler('n')) || 0;
    const guardada = await this.guardar.ler('base');
    // a base já baixada nesta página com a cópia trancada (tela de login depois de Sair) vale: é gravada agora que abriu,
    // em vez de baixar o banco inteiro de novo
    const baixada = this.base;
    if (guardada && !(baixada && seqDe(baixada) > seqDe(guardada))) this.base = guardada;
    this.pendentes = (await this.guardar.ler('pendentes')) || [];
    this.faixas = juntarFaixas({}, (await this.guardar.ler('faixas')) || {});
    this.recusas = (await this.guardar.ler('recusas')) || [];
    this.conflitos = this.base?._nuvem?.conflitos || [];
    this.invalidar();
    if (this.base && this.base !== guardada) await this.gravarBase({ forcar: true });
    if (!this.base) {
      try { await this.baixarTudo(); } catch (e) {
        if (e.status === 404) return null; // nuvem vazia: primeiro acesso (carga inicial)
        throw e.status === 0 ? new ErroNuvem('Sem internet: este aparelho ainda não tem cópia dos dados. Conecte para abrir pela primeira vez.') : e;
      }
    }
    this.sincronizar().catch(() => {});
    return this.atual();
  }

  /** A vista deixou de valer: a próxima `atual()` monta de novo. */
  invalidar() { this.vista = null; this.geracao += 1; }

  /** O banco que a tela usa (base + o que ainda não foi enviado), já com `normalizar` (campos e tabelas novos). */
  atual() {
    if (!this.base) return null;
    if (!this.vista) {
      const d = this.montar();
      const entradas = d.historico?.length;
      this.vista = this.normalizar(d);
      this.normalizarMexeuNoHistorico = this.vista?.historico?.length !== entradas; // migração que registra no histórico
    }
    return this.vista;
  }

  /** Base + fila deste aparelho, como está na nuvem (sem `normalizar`). */
  montar() {
    const d = copiar(this.base);
    for (const l of this.pendentes) aplicarOps(d, l.ops);
    d.seq = this.seqDaVista();
    return d;
  }

  /** `seq` da tela: o da nuvem, com o próximo código de cada faixa deste aparelho. */
  seqDaVista() {
    const seq = { ...(this.base?.seq || {}) };
    for (const [t, f] of Object.entries(this.faixas)) if (f.proximo <= f.fim) seq[t] = f.proximo - 1;
    return seq;
  }

  /**
   * Depois de pôr o lote na fila, o `depois` da gravação já é o que `montar` + `normalizar` dariam: vira a vista, sem copiar e
   * remontar o banco inteiro de novo. Não vale se algo mudou no meio (chegou mudança da nuvem, outra aba mexeu na fila) ou se
   * `normalizar` registra no histórico (a ordem das entradas sairia outra): aí monta de novo.
   */
  trocarVista(depois, geracao) {
    if (geracao !== this.geracao || this.normalizarMexeuNoHistorico) { this.invalidar(); return; }
    for (const k of RAIZ_DO_SERVIDOR) { // campos do servidor ficam como na nuvem (montar copia da base)
      if (k === 'historico' || k === 'seq') continue;
      if (k in this.base) depois[k] = structuredClone(this.base[k]); else delete depois[k];
    }
    depois.seq = this.seqDaVista();
    this.vista = this.normalizar(depois);
  }

  /**
   * Tabelas: as que o sistema conhece, as da nuvem e as da tela (normalizar cria as novas). `comTela` = false: sem montar a
   * tela só para isso (no puxar ela costuma estar pronta).
   */
  tabelasConhecidas({ comTela = true } = {}) {
    const t = new Set(this.tabelas);
    const pareceTabela = (v) => Array.isArray(v) && (!v.length || (v[0] && typeof v[0] === 'object' && Number.isSafeInteger(v[0].id)));
    for (const d of [this.base, comTela ? this.atual() : this.vista]) {
      for (const [k, v] of Object.entries(d || {})) if (!RAIZ_DO_SERVIDOR.includes(k) && pareceTabela(v)) t.add(k);
    }
    return t;
  }

  /**
   * As correções que `normalizar` fez (campo novo, tabela nova, migração) vão à nuvem como uma gravação deste aparelho,
   * senão só existiriam na tela. Chamar depois de entrar, por quem pode gravar (usuário de consulta teria a mudança recusada).
   * Dois aparelhos mandando a mesma correção não dão conflito (a nuvem ignora o que "já está assim"). Devolve quantas mudanças foram.
   */
  async enviarAjustes() {
    if (!this.base) return 0;
    const ops = diferencas(this.montar(), this.atual()).filter((o) => !ehContador(o));
    if (!ops.length) return 0;
    await this.enfileirar(ops);
    this.enviarDepois();
    return ops.length;
  }

  pendentesQtd() { return this.pendentes.reduce((s, l) => s + l.ops.length, 0); }

  /** Baixa o banco inteiro (um puxar de cada vez). */
  baixarTudo() {
    const r = this.puxando.then(() => this.baixarTudoAgora());
    this.puxando = r.catch(() => {});
    return r;
  }

  async baixarTudoAgora() {
    const d = await this.api('GET', 'tudo');
    this.base = d;
    this.conflitos = d._nuvem?.conflitos || [];
    this.invalidar();
    await this.gravarBase({ forcar: true }); // o banco inteiro agora é o mais novo que há
  }

  /**
   * Grava a base no aparelho. Sem `forcar`, não troca uma mais nova que outra aba já gravou (`base-seq`): os pedidos à nuvem
   * ficam fora da trava, então uma aba pode terminar de puxar depois de outra que puxou mais.
   */
  async gravarBase({ forcar = false } = {}) {
    const base = this.base; const seq = seqDe(base);
    await this.trava(async () => {
      if (!forcar && (Number(await this.guardar.ler('base-seq')) || 0) > seq) return;
      await this.guardar.gravar('base', base);
      await this.guardar.gravar('base-seq', seq);
    });
  }

  /** Grava uma mudança feita na tela: `fn(copia)` como em alterar (app.js). Sem internet, entra na fila. */
  async alterar(fn) {
    if (!this.base) throw new ErroNuvem('Os dados ainda não foram carregados.');
    let comContador = false;
    // a trava vale do "ler a fila" ao "gravar a fila": outra aba no meio daria o mesmo código a registros novos
    const resultado = await this.trava(async () => {
      await this.releFila();
      const geracao = this.geracao;
      const antes = this.atual();
      const depois = copiar(antes);
      const r = fn(depois);
      const ops = diferencas(antes, depois);
      if (ops.some(ehContador)) { comContador = true; return undefined; }
      const faixas = canon(this.faixas);
      this.avancarFaixas(depois.seq || {});
      if (!ops.length) {
        if (canon(this.faixas) !== faixas) { await this.guardar.gravar('faixas', this.faixas); if (this.vista) this.vista.seq = this.seqDaVista(); }
        return r;
      }
      this.pendentes.push(this.novoLote(ops));
      await this.gravarFila();
      this.trocarVista(depois, geracao);
      return r;
    });
    if (comContador) return this.alterarComContador(fn);
    this.enviarDepois();
    return resultado;
  }

  /**
   * Gravação que dá número de NF: só com internet. Envia a fila, pega o que mudou, refaz `fn` sobre o mais novo e espera a
   * resposta; se outro aparelho usou o número no meio do caminho (409), refaz com o seguinte (até 3 vezes).
   */
  async alterarComContador(fn) {
    for (let tentativa = 1; ; tentativa += 1) {
      try { await this.sincronizar({ exigirInternet: true }); } catch (e) {
        throw passageiro(e) ? new ErroNuvem('A NF só é numerada com internet. Conecte e tente de novo.') : e;
      }
      const { resultado, lote } = await this.trava(async () => {
        await this.releFila();
        if (this.pendentes.length) throw new ErroNuvem('Ainda há mudanças esperando para ir à nuvem. Tente de novo em instantes.');
        const antes = this.atual();
        const depois = copiar(antes);
        const r = fn(depois);
        const ops = diferencas(antes, depois);
        this.avancarFaixas(depois.seq || {});
        const l = this.novoLote(ops);
        await this.guardar.gravar('n', this.n);
        await this.guardar.gravar('faixas', this.faixas); // os códigos usados aqui não voltam para outra gravação
        return { resultado: r, lote: l };
      });
      const [primeira, ...resto] = dividirLote(lote); // o número da NF vai na 1ª parte
      try {
        await this.api('POST', 'lote', primeira);
      } catch (e) {
        if (e.status === 409 && e.extra?.contador && tentativa < 3) continue;
        if (e.status === 0) throw new ErroNuvem('A NF só é numerada com internet. Conecte e tente de novo.');
        throw e;
      }
      if (resto.length) { // número já dado: o resto da gravação (muito grande) vai pela fila, como uma gravação comum
        await this.trava(async () => {
          await this.releFila();
          this.pendentes.push(...resto);
          await this.gravarFila();
        });
        this.invalidar();
        this.enviarDepois();
      }
      await this.puxar(chavesDosLotes([lote]));
      this.aoMudar(false);
      return resultado;
    }
  }

  novoLote(ops) {
    this.n += 1;
    // a aba entra no código do lote: duas abas do mesmo aparelho nunca geram o mesmo (a nuvem trataria o 2º como repetido)
    return { id: `${this.aparelho}-${this.aba}-${String(this.n).padStart(6, '0')}`, ops, em: new Date().toISOString() };
  }

  /**
   * Outra aba deste aparelho pode ter mexido na fila ou nas faixas: relê (sempre dentro da trava). A vista só é refeita se a
   * fila mudou (a conferência de 30 em 30 s quase nunca acha novidade); faixa nova só acerta o `seq`. Lote que sumiu da fila
   * foi confirmado por outra aba, que gravou antes uma base com ele: se essa base é mais nova que a desta aba, vale ela.
   */
  async releFila() {
    const p = await this.guardar.ler('pendentes');
    const f = await this.guardar.ler('faixas');
    this.n = Math.max(this.n, Number(await this.guardar.ler('n')) || 0);
    let mudou = false;
    if (Array.isArray(p) && idsDaFila(p) !== idsDaFila(this.pendentes)) {
      const sumiu = this.pendentes.some((l) => !p.some((x) => x.id === l.id));
      this.pendentes = p; mudou = true;
      if (sumiu) await this.releBase();
    }
    if (f && typeof f === 'object') {
      const juntas = juntarFaixas(this.faixas, f);
      if (canon(juntas) !== canon(this.faixas)) {
        this.faixas = juntas;
        if (!mudou && this.vista) this.vista.seq = this.seqDaVista();
      }
    }
    if (mudou) this.invalidar();
  }

  /** Base gravada no aparelho por outra aba, se for mais nova que a desta. */
  async releBase() {
    if ((Number(await this.guardar.ler('base-seq')) || 0) <= seqDe(this.base)) return;
    const b = await this.guardar.ler('base');
    if (b && seqDe(b) > seqDe(this.base)) { this.base = b; this.conflitos = b._nuvem?.conflitos || []; }
  }

  /** Grava a fila, o contador de lotes e as faixas (sempre dentro da trava). */
  async gravarFila() {
    await this.guardar.gravar('n', this.n);
    await this.guardar.gravar('pendentes', this.pendentes);
    await this.guardar.gravar('faixas', this.faixas);
  }

  async enfileirar(ops) {
    await this.trava(async () => {
      await this.releFila();
      this.pendentes.push(this.novoLote(ops));
      await this.gravarFila();
    });
    this.invalidar();
  }

  /** Depois de `inserir`, a posição de cada faixa anda junto com o `seq` local. */
  avancarFaixas(seq) {
    for (const [t, n] of Object.entries(seq)) {
      const f = this.faixas[t];
      if (f && Number(n) >= f.proximo) this.faixas[t] = { ...f, proximo: Number(n) + 1 };
    }
  }

  /**
   * Marca uma sincronia para daqui a pouco: gravações seguidas (duplo clique, arrumações do Painel ao abrir) vão numa passada
   * só, em vez de uma ida à nuvem por gravação. Cada gravação continua sendo um lote (um recusado não leva os outros).
   */
  enviarDepois() {
    if (this.envioMarcado) return;
    this.envioMarcado = setTimeout(() => { this.envioMarcado = null; this.sincronizar().catch(() => {}); }, this.agrupar);
    this.envioMarcado.unref?.(); // no Node (testes) não segura o processo; no navegador não existe
  }

  /**
   * Envia a fila (em ordem) e traz o que os outros mudaram. Sem internet: para e tenta de novo depois (nada se perde).
   * Lote (ou parte) recusado pela nuvem (sem permissão, código repetido…) sai da fila e vira aviso em `recusas`, com as mudanças.
   */
  async sincronizar({ exigirInternet = false } = {}) {
    if (this.envioMarcado) { clearTimeout(this.envioMarcado); this.envioMarcado = null; } // esta passada já leva a fila
    // uma passada de cada vez nesta aba; quem chega no meio espera e faz a sua (para pegar o que mudou depois que a outra começou)
    while (this.enviando) await this.enviando.catch(() => {});
    this.enviando = this.passada();
    try {
      await this.enviando;
    } catch (e) {
      if (passageiro(e) && !exigirInternet) return;
      throw e.status === 0 ? new ErroNuvem('Sem internet no momento.') : e;
    } finally {
      this.enviando = null;
      const externo = this.externo; this.externo = false;
      this.aoMudar(externo); // a faixa do topo se atualiza; `externo` = chegou mudança de outro aparelho
    }
  }

  async passada() {
    try {
      const lotes = await this.trava(async () => { await this.releFila(); return [...this.pendentes]; });
      const meus = chavesDosLotes(lotes); // o que volta no puxar e é deste aparelho não é "mudança de outro"
      // envia em ordem, fora da trava (reenviar é seguro: a nuvem reconhece o lote repetido); o lote só sai da fila depois que a
      // base nova (com ele) chegar no puxar: se a internet cair entre um e outro, ele vai de novo
      const enviados = new Set(); const recusadas = []; let falha = null;
      for (const l of lotes) {
        try {
          for (const parte of dividirLote(l)) {
            try { await this.api('POST', 'lote', parte); } catch (e) {
              if (passageiro(e)) throw e;
              recusadas.push({ lote: l, parte, erro: e.message }); // as outras partes (e os outros lotes) continuam
            }
          }
          enviados.add(l.id);
        } catch (e) { falha = e; break; }
      }
      // recusa: sai da fila na hora (lote inteiro recusado não volta na base) e fica guardada para ver em Conflitos
      if (recusadas.length) await this.guardarRecusas(recusadas, enviados);
      if (falha) throw falha;
      this.externo = (await this.puxar(meus)) || this.externo;
      if (enviados.size) await this.tirarDaFila(enviados);
      await this.garantirFaixas();
      this.online = true;
    } catch (e) {
      if (passageiro(e)) this.online = false;
      throw e;
    }
  }

  /** Tira lotes da fila (dentro da trava, relendo antes: outra aba pode ter posto lotes novos). */
  async tirarDaFila(ids) {
    await this.trava(async () => {
      await this.releFila();
      const antes = this.pendentes.length;
      this.pendentes = this.pendentes.filter((x) => !ids.has(x.id));
      if (this.pendentes.length === antes) return;
      await this.guardar.gravar('pendentes', this.pendentes);
      this.invalidar();
    });
  }

  /**
   * Guarda as partes recusadas (as mudanças em `recusa:<código>`, a lista em `recusas`), uma vez só mesmo se outra aba recusou a
   * mesma. Lote todo recusado sai da fila na hora (`enviados`, se não teve parte aceita, deixa de esperar o puxar).
   */
  async guardarRecusas(recusadas, enviados) {
    await this.trava(async () => {
      const lista = (await this.guardar.ler('recusas')) || this.recusas;
      const ja = new Set(lista.map((r) => r.id || r.lote));
      for (const { lote, parte, erro } of recusadas) {
        if (ja.has(parte.id)) continue;
        ja.add(parte.id);
        await this.guardar.gravar(`recusa:${parte.id}`, parte.ops);
        lista.push({ id: parte.id, lote: lote.id, em: lote.em, erro, mudancas: parte.ops.length });
      }
      this.recusas = lista;
      await this.guardar.gravar('recusas', lista);
      await this.releFila();
      const inteiros = new Set(recusadas.filter(({ lote }) => recusadas.filter((x) => x.lote === lote).length === dividirLote(lote).length).map(({ lote }) => lote.id));
      for (const id of inteiros) enviados.delete(id);
      const antes = this.pendentes.length;
      this.pendentes = this.pendentes.filter((x) => !inteiros.has(x.id));
      if (this.pendentes.length !== antes) { await this.guardar.gravar('pendentes', this.pendentes); this.invalidar(); }
    });
  }

  /** As mudanças de uma recusa (null se não estão mais no aparelho, ou se foi recusada antes de esta versão guardá-las). */
  async lerRecusa(id) {
    if (!this.recusas.some((r) => (r.id || r.lote) === id)) return null;
    return (await this.guardar.ler(`recusa:${id}`)) || null;
  }

  async esquecerRecusa(id) {
    await this.trava(async () => {
      const lista = ((await this.guardar.ler('recusas')) || this.recusas).filter((r) => (r.id || r.lote) !== id);
      await this.guardar.apagar?.(`recusa:${id}`);
      this.recusas = lista;
      await this.guardar.gravar('recusas', lista);
    });
  }

  async esquecerRecusas() {
    await this.trava(async () => {
      const lista = (await this.guardar.ler('recusas')) || this.recusas;
      for (const r of lista) await this.guardar.apagar?.(`recusa:${r.id || r.lote}`);
      this.recusas = [];
      await this.guardar.gravar('recusas', []);
    });
  }

  /**
   * Traz da nuvem o que mudou desde a última vez (ou tudo de novo, se o aparelho ficou parado demais).
   * Devolve true se chegou algo de outro aparelho (fora das chaves `meus`, que são deste).
   * A cópia local (cifrada, o banco inteiro) só é regravada se chegou alguma coisa: a conferência de 30 em 30 s quase sempre volta vazia.
   */
  puxar(meus = { chaves: new Set(), historico: 0 }) {
    const r = this.puxando.then(() => this.puxarAgora(meus));
    this.puxando = r.catch(() => {});
    return r;
  }

  async puxarAgora(meus) {
    let externo = false; let historicoMeu = meus.historico; let mudou = false;
    const tabelas = this.tabelasConhecidas({ comTela: false });
    for (let volta = 0; volta < 1000; volta += 1) {
      const desde = seqDe(this.base);
      const r = await this.api('GET', `mudancas?desde=${desde}`);
      // no meio do pedido, a base desta aba foi trocada pela mais nova que outra aba gravou (releBase): o que veio já está nela
      // (aplicar de novo repetiria o histórico); pede outra vez a partir dela
      if (seqDe(this.base) !== desde) continue;
      if (r.refazer) { await this.baixarTudoAgora(); externo = true; mudou = false; break; } // baixarTudo já gravou a cópia
      // a base muda aqui: a vista deixa de valer já (uma gravação no meio deste puxar não pode virar a vista)
      if (r.mudancas.length || Number(r.seq) !== desde) { mudou = true; this.invalidar(); }
      for (const m of r.mudancas) {
        aplicarMudanca(this.base, m, tabelas);
        if (m.tipo === 'historico') { if (historicoMeu > 0) historicoMeu -= 1; else externo = true; }
        else if (m.tipo === 'registro' || m.tipo === 'exclusao') { if (!meus.chaves.has(`${m.tabela}:${m.id}`)) externo = true; }
        else if (m.tipo === 'raiz') { if (!meus.chaves.has(`raiz:${m.dados?.campo}`)) externo = true; }
        else externo = true; // conflito, escolha, nova carga
      }
      for (const k of ['revisao', 'atualizado_em', 'atualizado_por']) if (r[k] !== undefined) this.base[k] = r[k];
      this.base._nuvem = { ...(this.base._nuvem || {}), seq: r.seq, conflitos: r.conflitos };
      this.conflitos = r.conflitos || [];
      if (!r.mais) break;
    }
    if (!mudou) return externo;
    await this.gravarBase();
    return externo;
  }

  /**
   * Reserva códigos para cada tabela (para criar registros sem internet sem repetir com outro aparelho), inclusive as que ainda
   * não têm nenhum registro (tabela nova: dois aparelhos sem internet criariam o código 1). Usuário de consulta não cria
   * registros: a nuvem recusa (403) e não se pede mais nesta sessão.
   */
  async garantirFaixas() {
    if (this.semFaixas) return;
    const novas = {};
    try {
      for (const t of this.tabelasConhecidas()) {
        const f = this.faixas[t];
        if (f && f.fim - f.proximo + 1 >= RESERVA_MINIMA) continue;
        let r;
        try { r = await this.api('POST', 'faixa', { tabela: t, quantidade: FAIXA }); } catch (e) {
          if (e.status === 403) { this.semFaixas = true; break; }
          throw e;
        }
        novas[t] = { proximo: r.inicio, fim: r.fim };
      }
    } finally {
      // o que já veio fica, mesmo se a internet cair no meio
      if (Object.keys(novas).length) {
        await this.trava(async () => {
          await this.releFila();
          this.faixas = juntarFaixas(this.faixas, novas);
          await this.guardar.gravar('faixas', this.faixas);
        });
        if (this.vista) this.vista.seq = this.seqDaVista();
      }
    }
  }

  async resolver(conflito, escolha) {
    await this.api('POST', 'resolver', { conflito, escolha });
    await this.puxar();
    this.aoMudar(false);
  }

  /** Primeira carga (nuvem vazia): o banco inteiro vai de uma vez. */
  async importar(d, { substituir = false } = {}) {
    await this.api('POST', 'importar', { dados: d, substituir });
    await this.trava(async () => { this.pendentes = []; await this.guardar.gravar('pendentes', []); });
    await this.baixarTudo();
    await this.garantirFaixas();
    return this.atual();
  }
}

// ---------------------------------------------------------------------------
// No navegador: chamada à API (mesmo endereço do site) e cópia local no IndexedDB
// ---------------------------------------------------------------------------
export function apiDoSite(base = 'api/dados/', { limite = TEMPO_LIMITE, buscar = (...a) => fetch(...a) } = {}) {
  return async (metodo, rota, corpo) => {
    let r;
    try {
      r = await buscar(`${base}${rota}`, {
        method: metodo, cache: 'no-store', credentials: 'same-origin', signal: limiteDeTempo(limite),
        headers: metodo === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Sistema': 'imoveis' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch (e) {
      throw erroDeRede(e);
    }
    // o login do Access venceu: o Cloudflare devolve a página de login (outro endereço) em vez do JSON
    if (r.redirected || r.type === 'opaqueredirect' || !(r.headers.get('content-type') || '').includes('json')) {
      throw new ErroNuvem('Seu acesso pela internet venceu. Recarregue a página para entrar de novo (código no e-mail).', 401);
    }
    const dados = await r.json();
    if (!r.ok) throw new ErroNuvem(dados.erro || `Erro ${r.status} na nuvem.`, r.status, dados);
    return dados;
  };
}

/** A nuvem está ligada neste endereço? (no GitHub Pages, sem o Worker, /api/ não existe). */
export async function nuvemDisponivel(base = 'api/') {
  return (await saudeDaNuvem(base)) !== null;
}

/** { email } de quem passou pelo login da internet (Access), ou null sem internet / sem a nuvem. */
export async function saudeDaNuvem(base = 'api/') {
  try {
    const r = await fetch(`${base}saude`, { cache: 'no-store', credentials: 'same-origin', signal: limiteDeTempo(10000) });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null;
    return await r.json();
  } catch { return null; }
}

/** Trava entre abas do mesmo aparelho (Web Locks); navegador sem suporte: roda direto. */
export const travaDoNavegador = (fn) => (globalThis.navigator?.locks ? navigator.locks.request('imoveis-nuvem-fila', fn) : fn());

/** Cópia local no IndexedDB. A conexão fica aberta (abrir e fechar a cada leitura custava a cada gravação e a cada 30 s). */
export function guardarNoNavegador(nome = 'imoveis-nuvem', { indexedDB: idb = globalThis.indexedDB } = {}) {
  let aberto = null; // Promise com a conexão; some se o navegador a fechar (outra aba atualizando, memória) e abre de novo
  const abrir = () => {
    if (aberto) return aberto;
    aberto = new Promise((ok, erro) => {
      const req = idb.open(nome, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('dados');
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); aberto = null; };
        db.onclose = () => { aberto = null; };
        ok(db);
      };
      req.onerror = () => { aberto = null; erro(req.error); };
    });
    return aberto;
  };
  const transacao = (db, modo, fn) => new Promise((ok, erro) => {
    const tx = db.transaction('dados', modo);
    const req = fn(tx.objectStore('dados'));
    tx.oncomplete = () => ok(req?.result);
    tx.onerror = () => erro(tx.error);
    tx.onabort = () => erro(tx.error);
  });
  const op = async (modo, fn) => {
    try {
      return await transacao(await abrir(), modo, fn);
    } catch (e) {
      // conexão que o navegador fechou por trás (InvalidStateError): abre outra e tenta uma vez
      if (e?.name !== 'InvalidStateError') throw e;
      aberto = null;
      return transacao(await abrir(), modo, fn);
    }
  };
  return {
    ler: (k) => op('readonly', (s) => s.get(k)),
    gravar: (k, v) => op('readwrite', (s) => s.put(v, k)),
    apagar: (k) => op('readwrite', (s) => s.delete(k)),
  };
}
