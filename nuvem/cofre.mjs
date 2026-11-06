// Cofre dos dados na nuvem (Durable Object com SQLite): recebe as filas de mudanças de cada aparelho, uma por vez, em ordem.
// Cada registro (contrato, boleto…) é uma linha; cada campo sabe quem o mudou por último. Mesmo campo mudado em dois aparelhos
// sem se verem = conflito: o campo fica com o valor anterior até alguém escolher (DECISOES.md, 2026-11-06).
// Também: faixas de códigos por aparelho (sem internet não repete), contador da NF (só com internet), backup diário no R2.
// A lógica fica em `Cofre` (recebe `sql` e `transacao`) para os testes rodarem no Node com node:sqlite.

export const FORMATO = 'imoveis-v1';
export const MAX_OPS = 2000;
export const MAX_REGISTRO = 1024 * 1024; // um registro (a logo tem ~270 KB)
export const MAX_FAIXA = 1000;
export const DIAS_LOG = 60; // aparelho parado há mais tempo baixa tudo de novo
export const MANTER_BACKUPS = 30;
/** Campos da raiz que só o servidor controla (o aparelho não manda; mudam a cada gravação e dariam conflito à toa). */
export const RAIZ_DO_SERVIDOR = ['formato', 'revisao', 'atualizado_em', 'atualizado_por', 'seq', 'revisao_so_sessao', 'historico', '_nuvem'];
/** Contadores que só andam com internet, um de cada vez, aqui (número da NF). */
export const CONTADORES = ['proxima_fatura'];
/** Segredos que nunca ficam nos dados (regra 8 do CLAUDE.md; normalizar também apaga). */
const SEGREDOS = ['senha_ponte', 'ponte_url'];
/** O que o operador pode mudar no próprio usuário (trocar a senha); o resto de "usuarios" é do administrador. */
const USUARIO_PROPRIO = ['senha_sal', 'senha_hash', 'senha_iteracoes', 'sessoes', 'pendente'];
const NIVEL = { consulta: 1, operador: 2, admin: 3 };
const NOMES_PROIBIDOS = ['__proto__', 'constructor', 'prototype'];

export class ErroCofre extends Error {
  constructor(status, mensagem, extra = {}) { super(mensagem); this.status = status; this.extra = extra; }
}

/** JSON com as chaves em ordem: dois valores iguais dão o mesmo texto. */
export function canon(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
}
const igual = (a, b) => canon(a) === canon(b);

function semSegredos(v) {
  if (!v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(semSegredos);
  const r = {};
  for (const [k, x] of Object.entries(v)) if (!SEGREDOS.includes(k) && !NOMES_PROIBIDOS.includes(k)) r[k] = semSegredos(x);
  return r;
}

const nomeTabela = (t) => {
  if (typeof t !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(t) || t === 'historico' || RAIZ_DO_SERVIDOR.includes(t)) throw new ErroCofre(400, `Tabela inválida: ${String(t).slice(0, 40)}`);
  return t;
};
const nomeCampo = (c) => {
  if (typeof c !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,59}$/.test(c) || NOMES_PROIBIDOS.includes(c)) throw new ErroCofre(400, `Campo inválido: ${String(c).slice(0, 60)}`);
  return c;
};
const codigo = (id) => {
  if (!Number.isSafeInteger(id) || id < 1) throw new ErroCofre(400, 'Código do registro inválido.');
  return id;
};
const texto = (v) => {
  const t = JSON.stringify(v ?? null);
  if (t.length > MAX_REGISTRO) throw new ErroCofre(413, 'Registro grande demais.');
  return t;
};

export class Cofre {
  /**
   * @param {{exec: (q: string, ...p: any[]) => {toArray: () => any[]}}} sql  ctx.storage.sql no Cloudflare
   * @param {(fn: () => any) => any} transacao  ctx.storage.transactionSync no Cloudflare
   * @param {() => Date} relogio
   */
  constructor(sql, transacao, relogio = () => new Date()) {
    this.sql = sql; this.transacao = transacao; this.relogio = relogio;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS registros (tabela TEXT NOT NULL, id INTEGER NOT NULL, dados TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}', ordem INTEGER NOT NULL, PRIMARY KEY (tabela, id));
      CREATE TABLE IF NOT EXISTS tabelas (nome TEXT PRIMARY KEY, proximo INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS raiz (campo TEXT PRIMARY KEY, valor TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}');
      CREATE TABLE IF NOT EXISTS historico (n INTEGER PRIMARY KEY AUTOINCREMENT, dados TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, tabela TEXT, id INTEGER, dados TEXT, por TEXT, em TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lotes (lote TEXT PRIMARY KEY, resposta TEXT NOT NULL, em TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conflitos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, tabela TEXT NOT NULL, reg_id TEXT NOT NULL, campo TEXT NOT NULL,
        atual TEXT, por_atual TEXT, proposto TEXT, por_proposto TEXT, em TEXT NOT NULL, resolvido_em TEXT, escolha TEXT, resolvido_por TEXT);
      CREATE TABLE IF NOT EXISTS excluidos (tabela TEXT NOT NULL, id INTEGER NOT NULL, dados TEXT NOT NULL, por TEXT, em TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS controle (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);`);
  }

  q(consulta, ...p) { return this.sql.exec(consulta, ...p).toArray(); }
  agora() { return this.relogio().toISOString(); }
  vazio() { return !this.q('SELECT 1 AS x FROM registros LIMIT 1').length && !this.q('SELECT 1 AS x FROM raiz LIMIT 1').length; }
  ultimoSeq() { return Number(this.q('SELECT MAX(seq) AS m FROM log')[0]?.m || 0); } // limpar() nunca apaga a última linha
  controle(chave, valor) {
    if (valor === undefined) return this.q('SELECT valor FROM controle WHERE chave = ?', chave)[0]?.valor ?? null;
    this.sql.exec('INSERT INTO controle (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', chave, String(valor));
    return valor;
  }
  registrarLog(tipo, tabela, id, dados, por) {
    this.sql.exec('INSERT INTO log (tipo, tabela, id, dados, por, em) VALUES (?, ?, ?, ?, ?, ?)', tipo, tabela, id, dados === undefined ? null : texto(dados), por, this.agora());
  }

  // -------------------------------------------------------------------------
  // Quem é e o que pode (papel do usuário do sistema ligado ao e-mail do Access)
  // -------------------------------------------------------------------------
  papelDe(email) {
    const e = String(email || '').toLowerCase();
    const usuarios = this.q("SELECT dados FROM registros WHERE tabela = 'usuarios'").map((r) => JSON.parse(r.dados));
    if (!usuarios.length) return 'admin'; // cofre vazio: quem passou pelo Access faz a primeira carga
    const u = usuarios.find((x) => x.ativo !== false && [x.login, x.email].some((v) => String(v || '').toLowerCase() === e));
    return u ? { papel: u.papel, id: u.id } : null;
  }
  exigir(email, nivel) {
    const p = this.papelDe(email);
    const papel = typeof p === 'string' ? p : p?.papel;
    if (!papel) throw new ErroCofre(403, 'Este e-mail não está ligado a nenhum usuário ativo do sistema (cadastre o e-mail em Usuários).');
    if ((NIVEL[papel] || 0) < NIVEL[nivel]) throw new ErroCofre(403, 'Seu usuário não pode fazer isso.');
    return { papel, id: typeof p === 'string' ? null : p.id };
  }

  // -------------------------------------------------------------------------
  // Carga inicial e cópia completa
  // -------------------------------------------------------------------------
  importar(d, email, { substituir = false } = {}) {
    if (!d || typeof d !== 'object' || d.formato !== FORMATO) throw new ErroCofre(400, 'Não é um banco deste sistema.');
    if (!this.vazio()) {
      if (!substituir) throw new ErroCofre(409, 'A nuvem já tem dados. Para trocar tudo, confirme a substituição.');
      this.exigir(email, 'admin');
    }
    return this.transacao(() => {
      if (!this.vazio()) {
        for (const t of ['registros', 'tabelas', 'raiz', 'historico', 'conflitos', 'excluidos']) this.sql.exec(`DELETE FROM ${t}`);
      }
      let n = 0;
      for (const [chave, valor] of Object.entries(d)) {
        if (chave === 'historico') {
          for (const h of Array.isArray(valor) ? valor : []) this.sql.exec('INSERT INTO historico (dados) VALUES (?)', texto(semSegredos(h)));
        } else if (Array.isArray(valor) && valor.every((r) => r && typeof r === 'object' && Number.isSafeInteger(r.id))) {
          const t = nomeTabela(chave);
          let maior = Number(d.seq?.[t] || 0);
          for (const r of valor) {
            this.sql.exec('INSERT INTO registros (tabela, id, dados, ordem) VALUES (?, ?, ?, ?)', t, codigo(r.id), texto(semSegredos(r)), n += 1);
            maior = Math.max(maior, r.id);
          }
          this.sql.exec('INSERT INTO tabelas (nome, proximo) VALUES (?, ?)', t, maior + 1);
        } else if (!RAIZ_DO_SERVIDOR.includes(chave)) {
          this.sql.exec('INSERT INTO raiz (campo, valor) VALUES (?, ?)', nomeCampo(chave), texto(semSegredos(valor)));
        }
      }
      this.controle('revisao', Number(d.revisao || 0));
      for (const k of ['atualizado_em', 'atualizado_por']) if (typeof d[k] === 'string') this.controle(k, d[k]);
      this.registrarLog('importacao', null, null, undefined, email);
      return { ok: true, seq: this.ultimoSeq() };
    });
  }

  /** O banco inteiro no formato do arquivo de hoje (o sistema abre igual), com o ponto da fila em `_nuvem.seq`. */
  tudo() {
    if (this.vazio()) throw new ErroCofre(404, 'Ainda não há dados na nuvem.');
    const d = { formato: FORMATO, revisao: Number(this.controle('revisao') || 0), atualizado_em: this.controle('atualizado_em'), atualizado_por: this.controle('atualizado_por') };
    for (const r of this.q('SELECT campo, valor FROM raiz')) d[r.campo] = JSON.parse(r.valor);
    d.seq = {}; // o maior código já usado ou reservado em faixa: quem ainda não usa faixa não repete código
    for (const t of this.q('SELECT nome, proximo FROM tabelas ORDER BY nome')) { d[t.nome] = []; d.seq[t.nome] = Number(t.proximo) - 1; }
    for (const r of this.q('SELECT tabela, id, dados FROM registros ORDER BY ordem')) {
      (d[r.tabela] ||= []).push(JSON.parse(r.dados));
      d.seq[r.tabela] = Math.max(d.seq[r.tabela] || 0, r.id);
    }
    d.historico = this.q('SELECT dados FROM historico ORDER BY n').map((r) => JSON.parse(r.dados));
    d._nuvem = { seq: this.ultimoSeq(), conflitos: this.conflitosAbertos() };
    return d;
  }

  /** O que mudou desde `desde` (para o aparelho se atualizar). Parado demais: { refazer: true } e ele baixa tudo. */
  mudancas(desde, limite = 2000) {
    const d = Number(desde);
    if (!Number.isSafeInteger(d) || d < 0) throw new ErroCofre(400, 'Parâmetro "desde" inválido.');
    const menor = Number(this.q('SELECT MIN(seq) AS m FROM log')[0]?.m || 0);
    const ultimo = this.ultimoSeq();
    if (d > ultimo || (menor && d < menor - 1) || this.q("SELECT 1 AS x FROM log WHERE seq > ? AND tipo = 'importacao' LIMIT 1", d).length) return { refazer: true, seq: ultimo };
    const linhas = this.q('SELECT seq, tipo, tabela, id, dados, por, em FROM log WHERE seq > ? ORDER BY seq LIMIT ?', d, limite);
    return {
      seq: linhas.length ? linhas[linhas.length - 1].seq : d,
      mais: linhas.length === limite,
      mudancas: linhas.map((l) => ({ seq: l.seq, tipo: l.tipo, tabela: l.tabela, id: l.id, dados: l.dados === null ? null : JSON.parse(l.dados), por: l.por, em: l.em })),
      conflitos: this.conflitosAbertos(),
    };
  }

  conflitosAbertos() {
    return this.q('SELECT id, tipo, tabela, reg_id, campo, atual, por_atual, proposto, por_proposto, em FROM conflitos WHERE resolvido_em IS NULL ORDER BY id')
      .map((c) => ({ ...c, atual: c.atual === null ? null : JSON.parse(c.atual), proposto: c.proposto === null ? null : JSON.parse(c.proposto) }));
  }

  // -------------------------------------------------------------------------
  // Fila de mudanças de um aparelho
  // -------------------------------------------------------------------------
  /**
   * lote = { id: 'aparelho-n', ops: [ {op:'inserir', tabela, id, dados} | {op:'alterar', tabela, id, campos:{c:{antes, depois}}}
   *   | {op:'excluir', tabela, id, base} | {op:'raiz', campo, antes, depois} | {op:'historico', entrada} ] }
   * Repetir o mesmo lote (internet caiu antes da resposta) devolve a mesma resposta, sem aplicar de novo.
   */
  aplicar(lote, email) {
    if (!lote || typeof lote.id !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(lote.id)) throw new ErroCofre(400, 'Lote sem identificação.');
    const ja = this.q('SELECT resposta FROM lotes WHERE lote = ?', lote.id)[0];
    if (ja) return { ...JSON.parse(ja.resposta), repetido: true };
    if (!Array.isArray(lote.ops) || lote.ops.length > MAX_OPS) throw new ErroCofre(400, `Lote inválido (até ${MAX_OPS} mudanças).`);
    if (this.vazio()) throw new ErroCofre(409, 'A nuvem ainda não tem dados: faça a carga inicial.');
    const quem = this.exigir(email, 'operador');
    return this.transacao(() => {
      const resultados = []; const novosConflitos = [];
      for (const op of lote.ops) resultados.push(this.aplicarOp(op, email, quem, novosConflitos));
      if (lote.ops.length) {
        this.controle('revisao', Number(this.controle('revisao') || 0) + 1);
        this.controle('atualizado_em', this.agora());
        this.controle('atualizado_por', email);
      }
      const resposta = { ok: true, seq: this.ultimoSeq(), resultados, conflitos: novosConflitos };
      this.sql.exec('INSERT INTO lotes (lote, resposta, em) VALUES (?, ?, ?)', lote.id, JSON.stringify(resposta), this.agora());
      return resposta;
    });
  }

  aplicarOp(op, email, quem, novosConflitos) {
    if (!op || typeof op !== 'object') throw new ErroCofre(400, 'Mudança inválida.');
    if (op.op === 'historico') {
      if (!op.entrada || typeof op.entrada !== 'object' || Array.isArray(op.entrada)) throw new ErroCofre(400, 'Histórico inválido.');
      const entrada = { ...semSegredos(op.entrada), email_nuvem: email }; // quem gravou de verdade (o login do Access)
      this.sql.exec('INSERT INTO historico (dados) VALUES (?)', texto(entrada));
      this.registrarLog('historico', null, null, entrada, email);
      return { ok: true };
    }
    if (op.op === 'raiz') return this.mudarRaiz(op, email, quem, novosConflitos);
    const tabela = nomeTabela(op.tabela);
    const id = codigo(op.id);
    if (tabela === 'usuarios' && quem.papel !== 'admin') {
      const soSenha = op.op === 'alterar' && id === quem.id && Object.keys(op.campos || {}).every((c) => USUARIO_PROPRIO.includes(c));
      if (!soSenha) throw new ErroCofre(403, 'Só o administrador muda usuários (cada um pode trocar a própria senha).');
    }
    const atual = this.q('SELECT dados, meta FROM registros WHERE tabela = ? AND id = ?', tabela, id)[0];
    if (op.op === 'inserir') {
      const dados = semSegredos(op.dados);
      if (!dados || typeof dados !== 'object' || Array.isArray(dados) || dados.id !== id) throw new ErroCofre(400, 'Registro novo inválido.');
      for (const c of Object.keys(dados)) nomeCampo(c);
      if (atual) {
        if (igual(JSON.parse(atual.dados), dados)) return { ok: true, repetido: true };
        throw new ErroCofre(409, `Código ${id} já usado em ${tabela} (aparelho sem faixa de códigos?).`);
      }
      if (!this.q('SELECT 1 AS x FROM tabelas WHERE nome = ?', tabela).length) this.sql.exec('INSERT INTO tabelas (nome, proximo) VALUES (?, ?)', tabela, id + 1);
      const meta = Object.fromEntries(Object.keys(dados).map((c) => [c, { por: email, em: this.agora() }]));
      this.sql.exec('INSERT INTO registros (tabela, id, dados, meta, ordem) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM registros))', tabela, id, texto(dados), JSON.stringify(meta));
      this.sql.exec('UPDATE tabelas SET proximo = MAX(proximo, ?) WHERE nome = ?', id + 1, tabela);
      this.registrarLog('registro', tabela, id, dados, email);
      return { ok: true };
    }
    if (op.op === 'excluir') {
      if (!atual) return { ok: true, ja_excluido: true };
      const dados = JSON.parse(atual.dados);
      if (op.base !== undefined && !igual(dados, semSegredos(op.base))) {
        // outro aparelho mudou o registro depois que este o viu: não exclui até alguém escolher
        novosConflitos.push(this.abrirConflito('exclusao', tabela, id, '*', dados, this.ultimoAutor(atual.meta), null, email));
        return { ok: false, conflito: true };
      }
      this.excluirRegistro(tabela, id, dados, email);
      return { ok: true };
    }
    if (op.op === 'alterar') {
      const campos = op.campos && typeof op.campos === 'object' ? Object.entries(op.campos) : [];
      if (!campos.length) return { ok: true };
      if (campos.some(([c]) => c === 'id')) throw new ErroCofre(400, 'O código do registro não muda.');
      if (!atual) {
        const apagado = this.q('SELECT por FROM excluidos WHERE tabela = ? AND id = ? ORDER BY rowid DESC LIMIT 1', tabela, id)[0];
        if (!apagado) throw new ErroCofre(404, `Registro ${tabela} ${id} não existe.`);
        const proposta = Object.fromEntries(campos.map(([c, v]) => [nomeCampo(c), semSegredos(v?.depois)]));
        novosConflitos.push(this.abrirConflito('excluido', tabela, id, '*', null, apagado.por, proposta, email));
        return { ok: false, conflito: true };
      }
      const dados = JSON.parse(atual.dados); const meta = JSON.parse(atual.meta || '{}');
      let mudou = false; let conflito = false;
      for (const [c, v] of campos) {
        nomeCampo(c);
        const antes = semSegredos(v?.antes); const depois = semSegredos(v?.depois);
        const aberto = this.q("SELECT id FROM conflitos WHERE resolvido_em IS NULL AND tipo = 'campo' AND tabela = ? AND reg_id = ? AND campo = ?", tabela, String(id), c)[0];
        if (aberto) { // campo já em disputa: vira mais uma proposta, nada vale até a escolha
          novosConflitos.push(this.abrirConflito('campo', tabela, id, c, dados[c], meta[c]?.por || null, depois, email));
          conflito = true; continue;
        }
        if (igual(dados[c], depois)) continue; // já está assim
        if (igual(dados[c], antes)) {
          if (!v || !('depois' in v)) delete dados[c]; else dados[c] = depois; // sem "depois" = campo apagado
          meta[c] = { por: email, em: this.agora() };
          mudou = true; continue;
        }
        // mudado aqui e lá: o campo volta ao valor que este aparelho viu e espera a escolha
        novosConflitos.push(this.abrirConflito('campo', tabela, id, c, dados[c], meta[c]?.por || null, depois, email));
        dados[c] = antes; meta[c] = { por: email, em: this.agora(), disputa: true };
        mudou = true; conflito = true;
      }
      if (mudou) {
        this.sql.exec('UPDATE registros SET dados = ?, meta = ? WHERE tabela = ? AND id = ?', texto(dados), JSON.stringify(meta), tabela, id);
        this.registrarLog('registro', tabela, id, dados, email);
      }
      return conflito ? { ok: false, conflito: true } : { ok: true };
    }
    throw new ErroCofre(400, `Tipo de mudança desconhecido: ${String(op.op).slice(0, 20)}`);
  }

  mudarRaiz(op, email, quem, novosConflitos) {
    const campo = nomeCampo(op.campo);
    if (RAIZ_DO_SERVIDOR.includes(campo)) return { ok: true, ignorado: true };
    if (CONTADORES.includes(campo)) throw new ErroCofre(400, 'O número da NF só anda pelo contador da nuvem (com internet).');
    if (campo === 'ordem_caixas' && quem.papel !== 'admin') throw new ErroCofre(403, 'Só o administrador muda a ordem das caixas.');
    const linha = this.q('SELECT valor, meta FROM raiz WHERE campo = ?', campo)[0];
    const atual = linha ? JSON.parse(linha.valor) : undefined;
    const antes = semSegredos(op.antes); const depois = semSegredos(op.depois);
    if (igual(atual, depois)) return { ok: true };
    const aberto = this.q("SELECT id FROM conflitos WHERE resolvido_em IS NULL AND tabela = '_raiz' AND campo = ?", campo)[0];
    if (aberto || !igual(atual, antes)) {
      novosConflitos.push(this.abrirConflito('campo', '_raiz', 0, campo, atual, linha ? JSON.parse(linha.meta || '{}').por || null : null, depois, email));
      if (!aberto && linha) this.gravarRaiz(campo, antes, email);
      return { ok: false, conflito: true };
    }
    this.gravarRaiz(campo, depois, email);
    return { ok: true };
  }

  gravarRaiz(campo, valor, email) {
    this.sql.exec('INSERT INTO raiz (campo, valor, meta) VALUES (?, ?, ?) ON CONFLICT(campo) DO UPDATE SET valor = excluded.valor, meta = excluded.meta', campo, texto(valor), JSON.stringify({ por: email, em: this.agora() }));
    this.registrarLog('raiz', null, null, { campo, valor }, email);
  }

  excluirRegistro(tabela, id, dados, email) {
    this.sql.exec('INSERT INTO excluidos (tabela, id, dados, por, em) VALUES (?, ?, ?, ?, ?)', tabela, id, texto(dados), email, this.agora());
    this.sql.exec('DELETE FROM registros WHERE tabela = ? AND id = ?', tabela, id);
    this.registrarLog('exclusao', tabela, id, undefined, email);
  }

  ultimoAutor(metaTexto) {
    const meta = JSON.parse(metaTexto || '{}');
    return Object.values(meta).sort((a, b) => String(b?.em).localeCompare(String(a?.em)))[0]?.por || null;
  }

  abrirConflito(tipo, tabela, id, campo, atual, porAtual, proposto, porProposto) {
    this.sql.exec('INSERT INTO conflitos (tipo, tabela, reg_id, campo, atual, por_atual, proposto, por_proposto, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      tipo, tabela, String(id), campo, atual === undefined ? null : texto(atual), porAtual, proposto === undefined ? null : texto(proposto), porProposto, this.agora());
    const novo = this.q('SELECT MAX(id) AS id FROM conflitos')[0].id;
    this.registrarLog('conflito', tabela, Number(id) || null, { conflito: novo, tipo, campo }, porProposto);
    return { id: novo, tipo, tabela, reg_id: String(id), campo };
  }

  /**
   * Escolha de um conflito: { conflito, escolha }.
   * campo: 'atual' | 'proposto' (para todos os conflitos abertos do mesmo campo de uma vez) · exclusao: 'excluir' | 'manter'
   * · excluido: 'manter_excluido' | 'recriar' (volta o registro apagado com a mudança proposta).
   */
  resolver({ conflito, escolha } = {}, email) {
    this.exigir(email, 'operador');
    return this.transacao(() => {
      const c = this.q('SELECT * FROM conflitos WHERE id = ? AND resolvido_em IS NULL', Number(conflito))[0];
      if (!c) throw new ErroCofre(404, 'Conflito não encontrado ou já resolvido.');
      const fechar = (ids) => { for (const i of ids) this.sql.exec('UPDATE conflitos SET resolvido_em = ?, escolha = ?, resolvido_por = ? WHERE id = ?', this.agora(), String(escolha), email, i); };
      const id = Number(c.reg_id);
      if (c.tipo === 'campo') {
        if (!['atual', 'proposto'].includes(escolha)) throw new ErroCofre(400, 'Escolha "atual" ou "proposto".');
        const valor = JSON.parse((escolha === 'atual' ? c.atual : c.proposto) ?? 'null');
        if (c.tabela === '_raiz') this.gravarRaiz(c.campo, valor, email);
        else {
          const r = this.q('SELECT dados, meta FROM registros WHERE tabela = ? AND id = ?', c.tabela, id)[0];
          if (r) {
            const dados = JSON.parse(r.dados); const meta = JSON.parse(r.meta || '{}');
            dados[c.campo] = valor; meta[c.campo] = { por: email, em: this.agora() };
            this.sql.exec('UPDATE registros SET dados = ?, meta = ? WHERE tabela = ? AND id = ?', texto(dados), JSON.stringify(meta), c.tabela, id);
            this.registrarLog('registro', c.tabela, id, dados, email);
          }
        }
        fechar(this.q('SELECT id FROM conflitos WHERE resolvido_em IS NULL AND tipo = ? AND tabela = ? AND reg_id = ? AND campo = ?', c.tipo, c.tabela, c.reg_id, c.campo).map((x) => x.id));
      } else if (c.tipo === 'exclusao') {
        if (!['excluir', 'manter'].includes(escolha)) throw new ErroCofre(400, 'Escolha "excluir" ou "manter".');
        const r = this.q('SELECT dados FROM registros WHERE tabela = ? AND id = ?', c.tabela, id)[0];
        if (escolha === 'excluir' && r) this.excluirRegistro(c.tabela, id, JSON.parse(r.dados), email);
        fechar([c.id]);
      } else if (c.tipo === 'excluido') {
        if (!['manter_excluido', 'recriar'].includes(escolha)) throw new ErroCofre(400, 'Escolha "manter_excluido" ou "recriar".');
        if (escolha === 'recriar' && !this.q('SELECT 1 AS x FROM registros WHERE tabela = ? AND id = ?', c.tabela, id).length) {
          const ap = this.q('SELECT dados FROM excluidos WHERE tabela = ? AND id = ? ORDER BY rowid DESC LIMIT 1', c.tabela, id)[0];
          const dados = { ...JSON.parse(ap.dados), ...JSON.parse(c.proposto || '{}'), id };
          this.sql.exec('INSERT INTO registros (tabela, id, dados, ordem) VALUES (?, ?, ?, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM registros))', c.tabela, id, texto(dados));
          this.registrarLog('registro', c.tabela, id, dados, email);
        }
        fechar([c.id]);
      }
      this.registrarLog('resolvido', c.tabela, id || null, { conflito: c.id, escolha }, email);
      return { ok: true, seq: this.ultimoSeq() };
    });
  }

  /** Faixa de códigos novos de uma tabela para um aparelho usar mesmo sem internet (nunca repete entre aparelhos). */
  faixa({ tabela, quantidade = 200 } = {}, email) {
    this.exigir(email, 'operador');
    const t = nomeTabela(tabela);
    const qtd = Math.min(MAX_FAIXA, Math.max(1, Math.floor(Number(quantidade) || 0)));
    return this.transacao(() => {
      const maior = Number(this.q('SELECT MAX(id) AS m FROM registros WHERE tabela = ?', t)[0]?.m || 0);
      const proximo = Math.max(Number(this.q('SELECT proximo FROM tabelas WHERE nome = ?', t)[0]?.proximo || 1), maior + 1);
      this.sql.exec('INSERT INTO tabelas (nome, proximo) VALUES (?, ?) ON CONFLICT(nome) DO UPDATE SET proximo = excluded.proximo', t, proximo + qtd);
      return { tabela: t, inicio: proximo, fim: proximo + qtd - 1 };
    });
  }

  /** Próximo número de um contador (NF): só com internet, um pedido de cada vez, nunca repete. */
  contador({ nome } = {}, email) {
    this.exigir(email, 'operador');
    if (!CONTADORES.includes(nome)) throw new ErroCofre(400, 'Contador desconhecido.');
    return this.transacao(() => {
      const linha = this.q('SELECT valor FROM raiz WHERE campo = ?', nome)[0];
      const numero = Number(linha ? JSON.parse(linha.valor) : 1) || 1;
      this.gravarRaiz(nome, numero + 1, email);
      return { numero, seq: this.ultimoSeq() };
    });
  }

  /** Limpa o que já não precisa: fila com mais de DIAS_LOG dias e lotes repetidos antigos. */
  limpar() {
    const limite = new Date(this.relogio().getTime() - DIAS_LOG * 86400000).toISOString();
    this.sql.exec('DELETE FROM log WHERE em < ? AND seq < (SELECT MAX(seq) FROM log)', limite);
    this.sql.exec('DELETE FROM lotes WHERE em < ?', limite);
  }
}

// ---------------------------------------------------------------------------
// Durable Object (Cloudflare): um só cofre ("principal") para o banco inteiro
// ---------------------------------------------------------------------------
export function hojeBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

/** Cópia completa no R2 uma vez por dia (horário de Brasília), guardando as 30 mais recentes. */
export async function backupDoDia(cofre, r2, agora = new Date(), forcarNome = '') {
  const dia = hojeBrasilia(agora);
  if (!forcarNome && cofre.controle('ultimo_backup') === dia) return false;
  if (cofre.vazio()) return false;
  const nome = `backups/imoveis-dados-${forcarNome ? `${dia}-${forcarNome}` : dia}.json`;
  await r2.put(nome, JSON.stringify(cofre.tudo()), { httpMetadata: { contentType: 'application/json' } });
  if (forcarNome) return true;
  cofre.controle('ultimo_backup', dia);
  const nomes = [];
  let cursor;
  do {
    const r = await r2.list({ prefix: 'backups/imoveis-dados-', cursor });
    nomes.push(...r.objects.map((o) => o.key).filter((k) => /^backups\/imoveis-dados-\d{4}-\d{2}-\d{2}\.json$/.test(k)));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  nomes.sort();
  const velhos = nomes.slice(0, Math.max(0, nomes.length - MANTER_BACKUPS));
  if (velhos.length) await r2.delete(velhos);
  return true;
}

const resposta = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** Só o Worker chama (binding COFRE); o e-mail vem dele, já conferido no login do Access. */
export class CofreDO {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.cofre = new Cofre(ctx.storage.sql, (fn) => ctx.storage.transactionSync(fn));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const email = request.headers.get('X-Email-Conferido') || '';
    const corpo = async () => { try { return await request.json(); } catch { throw new ErroCofre(400, 'Pedido inválido.'); } };
    try {
      if (!email) throw new ErroCofre(401, 'Sem login.');
      const c = this.cofre; const rota = url.pathname;
      let r;
      if (rota === '/papel' && request.method === 'GET') r = c.exigir(email, url.searchParams.get('nivel') === 'operador' ? 'operador' : 'consulta');
      else if (rota === '/tudo' && request.method === 'GET') { c.exigir(email, 'consulta'); r = c.tudo(); }
      else if (rota === '/mudancas' && request.method === 'GET') { c.exigir(email, 'consulta'); r = c.mudancas(url.searchParams.get('desde')); }
      else if (rota === '/conflitos' && request.method === 'GET') { c.exigir(email, 'consulta'); r = { conflitos: c.conflitosAbertos() }; }
      else if (rota === '/lote' && request.method === 'POST') r = c.aplicar(await corpo(), email);
      else if (rota === '/resolver' && request.method === 'POST') r = c.resolver(await corpo(), email);
      else if (rota === '/faixa' && request.method === 'POST') r = c.faixa(await corpo(), email);
      else if (rota === '/contador' && request.method === 'POST') r = c.contador(await corpo(), email);
      else if (rota === '/importar' && request.method === 'POST') {
        const pedido = await corpo();
        if (!c.vazio()) await backupDoDia(c, this.env.DADOS, new Date(), 'antes-da-substituicao');
        r = c.importar(pedido.dados, email, { substituir: pedido.substituir === true });
      } else throw new ErroCofre(404, 'Não encontrado.');
      if (request.method === 'POST' && this.env.DADOS) { await backupDoDia(c, this.env.DADOS); c.limpar(); }
      return resposta(200, r);
    } catch (e) {
      if (e instanceof ErroCofre) return resposta(e.status, { erro: e.message, ...e.extra });
      console.error(e);
      return resposta(500, { erro: 'Erro no cofre da nuvem.' });
    }
  }
}
