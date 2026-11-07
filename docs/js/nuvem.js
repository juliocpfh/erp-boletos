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
const igual = (a, b) => canon(a) === canon(b);
const ehTabela = (v) => Array.isArray(v) && v.every((r) => r && typeof r === 'object' && Number.isSafeInteger(r.id));

/**
 * O que mudou de `antes` para `depois`, no formato do lote do cofre.
 * Tabelas: inserir / alterar (campo a campo, com antes e depois) / excluir (com o registro como estava).
 * Fora das tabelas: raiz. Histórico: só as entradas novas (o histórico só cresce).
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
    if (ehTabela(va ?? []) && ehTabela(vb ?? []) && (Array.isArray(va) || Array.isArray(vb))) {
      const porId = new Map((va || []).map((r) => [r.id, r]));
      const novos = new Set();
      for (const r of vb || []) {
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
    if (!igual(va, vb)) ops.push({ op: 'raiz', campo: k, antes: va, depois: vb });
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

/** Aplica no banco local uma mudança que veio da fila da nuvem (GET dados/mudancas). */
export function aplicarMudanca(d, m) {
  if (m.tipo === 'registro') {
    const t = (d[m.tabela] ||= []);
    const i = t.findIndex((r) => r.id === m.id);
    if (i >= 0) t[i] = m.dados; else t.push(m.dados);
  } else if (m.tipo === 'exclusao') d[m.tabela] = (d[m.tabela] || []).filter((r) => r.id !== m.id);
  else if (m.tipo === 'raiz') { if (!('valor' in m.dados)) delete d[m.dados.campo]; else d[m.dados.campo] = m.dados.valor; }
  else if (m.tipo === 'historico') (d.historico ||= []).push(m.dados);
  return d;
}

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
 * @param {object} o
 * @param {(metodo: string, rota: string, corpo?: any) => Promise<any>} o.api  chama /api/dados/<rota>; erro HTTP = ErroNuvem com `status`; sem internet = ErroNuvem com status 0
 * @param {{ler: (k: string) => Promise<any>, gravar: (k: string, v: any) => Promise<void>, apagar?: (k: string) => Promise<void>}} o.guardar  cópia local (IndexedDB)
 */
export class Sincronia {
  /** `trava(fn)`: uma aba de cada vez mexe na fila (navigator.locks no navegador); sem ela, roda direto. */
  constructor({ api, guardar, aoMudar = () => {}, trava = (fn) => fn(), normalizar = (d) => d }) {
    this.api = api; this.guardar = guardar; this.aoMudar = aoMudar; this.trava = trava; this.normalizar = normalizar;
    this.base = null; this.pendentes = []; this.faixas = {}; this.recusas = []; this.conflitos = [];
    this.aparelho = null; this.n = 0; this.online = true; this.enviando = null; this.vista = null; this.externo = false;
    this.aba = aleatorio().slice(0, 6);
  }

  async iniciar() {
    this.aparelho = (await this.guardar.ler('aparelho')) || `ap${aleatorio()}`;
    await this.guardar.gravar('aparelho', this.aparelho);
    this.n = Number(await this.guardar.ler('n')) || 0;
    this.base = await this.guardar.ler('base');
    this.pendentes = (await this.guardar.ler('pendentes')) || [];
    this.faixas = (await this.guardar.ler('faixas')) || {};
    this.recusas = (await this.guardar.ler('recusas')) || [];
    this.conflitos = this.base?._nuvem?.conflitos || [];
    this.vista = null;
    if (!this.base) {
      try { await this.baixarTudo(); } catch (e) {
        if (e.status === 404) return null; // nuvem vazia: primeiro acesso (carga inicial)
        throw e.status === 0 ? new ErroNuvem('Sem internet: este aparelho ainda não tem cópia dos dados. Conecte para abrir pela primeira vez.') : e;
      }
    }
    this.sincronizar().catch(() => {});
    return this.atual();
  }

  /** O banco que a tela usa (base + o que ainda não foi enviado), já com `normalizar` (campos e tabelas novos). */
  atual() {
    if (!this.base) return null;
    if (!this.vista) this.vista = this.normalizar(this.montar());
    return this.vista;
  }

  /** Base + fila deste aparelho, como está na nuvem (sem `normalizar`). */
  montar() {
    const d = structuredClone(this.base);
    for (const l of this.pendentes) aplicarOps(d, l.ops);
    d.seq = { ...(d.seq || {}) };
    for (const [t, f] of Object.entries(this.faixas)) if (f.proximo <= f.fim) d.seq[t] = f.proximo - 1;
    return d;
  }

  /**
   * As correções que `normalizar` fez (campo novo, tabela nova, migração) vão à nuvem como uma gravação deste aparelho,
   * senão só existiriam na tela. Chamar depois de entrar, por quem pode gravar (usuário de consulta teria a mudança recusada).
   * Dois aparelhos mandando a mesma correção não dão conflito (a nuvem ignora o que "já está assim"). Devolve quantas mudanças foram.
   */
  async enviarAjustes() {
    if (!this.base) return 0;
    const ops = diferencas(this.montar(), this.atual()).filter((o) => !(o.op === 'raiz' && CONTADORES.includes(o.campo)));
    if (!ops.length) return 0;
    await this.enfileirar(ops);
    this.enviarDepois();
    return ops.length;
  }

  pendentesQtd() { return this.pendentes.reduce((s, l) => s + l.ops.length, 0); }

  async baixarTudo() {
    const d = await this.api('GET', 'tudo');
    this.base = d;
    this.conflitos = d._nuvem?.conflitos || [];
    this.vista = null;
    await this.guardar.gravar('base', d);
  }

  /** Grava uma mudança feita na tela: `fn(copia)` como em alterar (app.js). Sem internet, entra na fila. */
  async alterar(fn) {
    const antes = this.atual();
    if (!antes) throw new ErroNuvem('Os dados ainda não foram carregados.');
    const depois = structuredClone(antes);
    const resultado = fn(depois);
    const ops = diferencas(antes, depois);
    this.avancarFaixas(depois.seq || {});
    if (!ops.length) { await this.guardar.gravar('faixas', this.faixas); this.vista = null; return resultado; }
    if (ops.some((o) => o.op === 'raiz' && CONTADORES.includes(o.campo))) return this.alterarComContador(fn);
    await this.enfileirar(ops);
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
      if (this.pendentes.length) throw new ErroNuvem('Ainda há mudanças esperando para ir à nuvem. Tente de novo em instantes.');
      const antes = this.atual();
      const depois = structuredClone(antes);
      const resultado = fn(depois);
      this.avancarFaixas(depois.seq || {});
      await this.trava(async () => { await this.releFila(); });
      const lote = this.novoLote(diferencas(antes, depois));
      try {
        await this.api('POST', 'lote', lote);
      } catch (e) {
        if (e.status === 409 && e.extra?.contador && tentativa < 3) continue;
        if (e.status === 0) throw new ErroNuvem('A NF só é numerada com internet. Conecte e tente de novo.');
        throw e;
      }
      await this.guardar.gravar('n', this.n);
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

  /** Outra aba deste aparelho pode ter mexido na fila: relê antes de mexer (sempre dentro da trava). */
  async releFila() {
    const p = await this.guardar.ler('pendentes');
    if (Array.isArray(p)) this.pendentes = p;
    this.n = Math.max(this.n, Number(await this.guardar.ler('n')) || 0);
    this.vista = null;
  }

  async enfileirar(ops) {
    await this.trava(async () => {
      await this.releFila();
      this.pendentes.push(this.novoLote(ops));
      this.vista = null;
      await this.guardar.gravar('n', this.n);
      await this.guardar.gravar('pendentes', this.pendentes);
      await this.guardar.gravar('faixas', this.faixas);
    });
  }

  /** Depois de `inserir`, a posição de cada faixa anda junto com o `seq` local. */
  avancarFaixas(seq) {
    for (const [t, n] of Object.entries(seq)) {
      const f = this.faixas[t];
      if (f && Number(n) >= f.proximo) f.proximo = Number(n) + 1;
    }
  }

  enviarDepois() { setTimeout(() => this.sincronizar().catch(() => {}), 0); }

  /**
   * Envia a fila (em ordem) e traz o que os outros mudaram. Sem internet: para e tenta de novo depois (nada se perde).
   * Lote recusado pela nuvem (sem permissão, código repetido…) sai da fila e vira aviso em `recusas`.
   */
  async sincronizar({ exigirInternet = false } = {}) {
    // uma passada de cada vez; quem chega no meio espera e faz a sua (para pegar o que mudou depois que a outra começou)
    while (this.enviando) await this.enviando.catch(() => {});
    this.enviando = this.trava(async () => {
      await this.releFila();
      try {
        // envia em ordem; o lote só sai da fila depois que a base nova (com ele) chegar no puxar:
        // se a internet cair entre um e outro, reenviar é seguro (a nuvem reconhece o lote repetido)
        const enviados = new Set();
        const meus = chavesDosLotes(this.pendentes); // o que volta no puxar e é deste aparelho não é "mudança de outro"
        for (const l of [...this.pendentes]) {
          try {
            await this.api('POST', 'lote', l);
            enviados.add(l.id);
          } catch (e) {
            if (passageiro(e)) throw e;
            // recusado (sem permissão, código repetido, número de NF mudou…): sai da fila e vira aviso
            this.recusas.push({ lote: l.id, em: l.em, erro: e.message, mudancas: l.ops.length });
            await this.guardar.gravar('recusas', this.recusas);
            this.pendentes = this.pendentes.filter((x) => x.id !== l.id);
            await this.guardar.gravar('pendentes', this.pendentes);
            this.vista = null;
          }
        }
        this.externo = (await this.puxar(meus)) || this.externo;
        if (enviados.size) {
          this.pendentes = this.pendentes.filter((x) => !enviados.has(x.id));
          this.vista = null;
          await this.guardar.gravar('pendentes', this.pendentes);
        }
        await this.garantirFaixas();
        this.online = true;
      } catch (e) {
        if (passageiro(e)) this.online = false;
        throw e;
      }
    });
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

  /** Traz da nuvem o que mudou desde a última vez (ou tudo de novo, se o aparelho ficou parado demais). */
  /** Devolve true se chegou algo de outro aparelho (fora das chaves `meus`, que são deste). */
  async puxar(meus = { chaves: new Set(), historico: 0 }) {
    let externo = false; let historicoMeu = meus.historico;
    for (let volta = 0; volta < 1000; volta += 1) {
      const r = await this.api('GET', `mudancas?desde=${Number(this.base._nuvem?.seq || 0)}`);
      if (r.refazer) { await this.baixarTudo(); externo = true; break; }
      for (const m of r.mudancas) {
        aplicarMudanca(this.base, m);
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
    this.vista = null;
    await this.guardar.gravar('base', this.base);
    return externo;
  }

  /** Reserva códigos para cada tabela (para criar registros sem internet sem repetir com outro aparelho). */
  async garantirFaixas() {
    const d = this.base;
    let mudou = false;
    for (const [t, v] of Object.entries(d)) {
      if (t === 'historico' || RAIZ_DO_SERVIDOR.includes(t) || !Array.isArray(v) || !ehTabela(v)) continue;
      const f = this.faixas[t];
      if (f && f.fim - f.proximo + 1 >= RESERVA_MINIMA) continue;
      let r;
      try { r = await this.api('POST', 'faixa', { tabela: t, quantidade: FAIXA }); } catch (e) {
        if (e.status === 403) break; // usuário de consulta não cria registros
        throw e;
      }
      this.faixas[t] = { proximo: r.inicio, fim: r.fim };
      mudou = true;
    }
    if (mudou) { this.vista = null; await this.guardar.gravar('faixas', this.faixas); }
  }

  async resolver(conflito, escolha) {
    await this.api('POST', 'resolver', { conflito, escolha });
    await this.puxar();
    this.aoMudar(false);
  }

  async esquecerRecusas() { this.recusas = []; await this.guardar.gravar('recusas', this.recusas); }

  /** Primeira carga (nuvem vazia): o banco inteiro vai de uma vez. */
  async importar(d, { substituir = false } = {}) {
    await this.api('POST', 'importar', { dados: d, substituir });
    this.pendentes = []; await this.guardar.gravar('pendentes', []);
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

export function guardarNoNavegador(nome = 'imoveis-nuvem') {
  const abrir = () => new Promise((ok, erro) => {
    const req = indexedDB.open(nome, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('dados');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
  const op = async (modo, fn) => {
    const db = await abrir();
    return new Promise((ok, erro) => {
      const tx = db.transaction('dados', modo);
      const req = fn(tx.objectStore('dados'));
      tx.oncomplete = () => { db.close(); ok(req?.result); };
      tx.onerror = () => { db.close(); erro(tx.error); };
    });
  };
  return {
    ler: (k) => op('readonly', (s) => s.get(k)),
    gravar: (k, v) => op('readwrite', (s) => s.put(v, k)),
    apagar: (k) => op('readwrite', (s) => s.delete(k)),
  };
}
