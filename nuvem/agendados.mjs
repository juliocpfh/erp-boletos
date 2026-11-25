// E-mails agendados (pedido do dono de 25/11/2026): fora do horário comercial o site pergunta "Agendar para <próximo horário>"
// e o e-mail fica guardado aqui, pronto (destinatário, assunto, texto, HTML e anexos), até a hora marcada. Um Cron Trigger do
// Worker (wrangler.toml, a cada 5 minutos) chama `rodarAgendados`, que manda pelo gmail.mjs mesmo com todos os aparelhos
// desligados, e o cofre grava o envio em `envios_email` como os envios de hoje (data de Brasília do envio de verdade).
// Onde fica: a lista numa tabela própria do cofre (`envios_agendados`, fora dos registros: não vai para o JSON nem para os
// aparelhos) e o e-mail montado no R2 (`sistema/agendados/<id>.json`, fora de RAIZES: nenhuma rota de anexos chega lá).
// Rotas do site (com o login do Access): email/agendar (POST, operador), email/agendados (GET), email/agendados/mudar e
// email/agendados/cancelar (POST, operador). No computador: GET /__agendados/rodar em nuvem/local.mjs roda o cron na hora.
import { contaGuardada, enviarEmail, MAX_ASSUNTO, validarEnvio } from './gmail.mjs';
import { proximoHorarioComercial } from '../docs/js/brasilia.js';
import { feriados } from '../docs/js/calculos.js';

export const PASTA = 'sistema/agendados/';
export const MAX_ABERTOS = 500; // agendados esperando ao mesmo tempo
export const PRAZO_MAXIMO_DIAS = 60; // agendar até 60 dias à frente
export const POR_RODADA = 20; // e-mails por rodada do cron (5 em 5 minutos)
export const MAX_TENTATIVAS = 3; // Gmail fora do ar ou no limite: tenta de novo 10 minutos depois, até 3 vezes
export const ESPERA_NOVA_TENTATIVA = 10 * 60 * 1000;
export const PRESO_MS = 15 * 60 * 1000; // "saindo" há mais que isso (o Worker caiu no meio): vira falha, sem mandar de novo
export const GUARDAR_DIAS = 90; // enviados e cancelados saem da lista depois disso
export const DIAS_NA_LISTA = 7; // enviados e cancelados aparecem na tela por 7 dias
// limite diário de e-mails (o do sistema, MAX_EMAILS_DIA, ou o do Gmail): reagenda para o próximo dia de horário comercial;
// só vira falha depois de DIAS_LIMITE dias assim (pedido de 25/11/2026)
export const DIAS_LIMITE = 3;
export const AVISO_LIMITE = 'Reagendado: limite diário do Gmail';
const MAX_REGISTRO = 20000; // o registro de envios_email que o site prepara (sem o texto do e-mail)
const MAX_DESCRICAO = 300;
const RE_ID = /^[0-9a-f]{32}$/;
export const SITUACOES = ['agendado', 'enviando', 'enviado', 'falhou', 'cancelado'];
export const ERRO_PRESO = 'O envio começou e não terminou (a nuvem caiu no meio). Confira na pasta "Enviados" do Gmail antes de mandar de novo.';

const texto = (v) => (v === undefined || v === null ? '' : String(v));
const hojeBrasilia = (agora) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);

/** Erro com status, para o Worker devolver { erro }. */
export class ErroAgendado extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

/** Hora marcada aceita: instante ISO entre agora (1 minuto de folga) e PRAZO_MAXIMO_DIAS dias. Devolve o ISO arrumado. */
export function quandoValido(quando, agora = new Date()) {
  const t = Date.parse(texto(quando));
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(texto(quando)) || !Number.isFinite(t)) throw new ErroAgendado(400, 'Hora do envio inválida.');
  if (t < agora.getTime() - 60000) throw new ErroAgendado(400, 'A hora do envio já passou: escolha uma hora daqui para a frente.');
  if (t > agora.getTime() + PRAZO_MAXIMO_DIAS * 86400000) throw new ErroAgendado(400, `Dá para agendar até ${PRAZO_MAXIMO_DIAS} dias à frente.`);
  return new Date(t).toISOString();
}

/** Registro de envios_email preparado pelo site: objeto simples, sem id, até MAX_REGISTRO caracteres. */
function registroValido(registro) {
  if (registro === undefined || registro === null) return {};
  if (typeof registro !== 'object' || Array.isArray(registro)) throw new ErroAgendado(400, 'Registro do envio inválido.');
  const r = { ...registro };
  delete r.id;
  if (JSON.stringify(r).length > MAX_REGISTRO) throw new ErroAgendado(400, 'Registro do envio grande demais.');
  for (const k of Object.keys(r)) if (!/^[a-z][a-z0-9_]{0,59}$/.test(k)) throw new ErroAgendado(400, 'Registro do envio inválido.');
  return r;
}

/** Lado do cofre (Durable Object): a lista dos agendados e o que acontece com cada um. */
export class EnviosAgendados {
  /**
   * @param {import('./cofre.mjs').Cofre} cofre  usa o sql, o relógio, o exigir (papel), o registrarEmail e o aplicar do cofre
   * @param {new (status: number, mensagem: string) => Error} Erro  ErroCofre (sem importar cofre.mjs: um importaria o outro)
   */
  constructor(cofre, Erro) {
    this.c = cofre; this.Erro = Erro;
    cofre.sql.exec(`CREATE TABLE IF NOT EXISTS envios_agendados (id TEXT PRIMARY KEY, quando TEXT NOT NULL, situacao TEXT NOT NULL, por TEXT NOT NULL,
      criado_em TEXT NOT NULL, para TEXT NOT NULL, assunto TEXT, descricao TEXT, anexos TEXT, registro TEXT NOT NULL, tamanho INTEGER,
      tentativas INTEGER NOT NULL DEFAULT 0, erro TEXT, enviando_em TEXT, enviado_em TEXT, gmail_id TEXT, registro_id INTEGER,
      cancelado_em TEXT, cancelado_por TEXT, mudado_em TEXT, mudado_por TEXT, limite_desde TEXT);
      CREATE INDEX IF NOT EXISTS envios_agendados_quando ON envios_agendados (situacao, quando);`);
    // cofre criado antes da coluna limite_desde (só na nuvem de teste): acrescenta
    if (!cofre.q('PRAGMA table_info(envios_agendados)').some((c) => c.name === 'limite_desde')) cofre.sql.exec('ALTER TABLE envios_agendados ADD COLUMN limite_desde TEXT');
  }

  agora() { return this.c.relogio(); }
  /** As conferências comuns lançam ErroAgendado; no cofre vira ErroCofre (senão o cofre responderia 500 em vez de 400). */
  conferir(fn) {
    try { return fn(); } catch (e) { if (e instanceof ErroAgendado) throw new this.Erro(e.status, e.message); throw e; }
  }
  linha(id) { return this.c.q('SELECT * FROM envios_agendados WHERE id = ?', texto(id))[0] || null; }

  /** O que a tela mostra (sem o registro inteiro: só o contrato e a etapa). */
  paraTela(l) {
    let reg = {};
    try { reg = JSON.parse(l.registro || '{}'); } catch { /* registro estragado: fica sem os detalhes */ }
    let anexos = [];
    try { anexos = JSON.parse(l.anexos || '[]'); } catch { /* idem */ }
    return { id: l.id, quando: l.quando, situacao: l.situacao, por: l.por, criado_em: l.criado_em, para: l.para, assunto: l.assunto, descricao: l.descricao,
      anexos, tentativas: l.tentativas, erro: l.erro, enviado_em: l.enviado_em, cancelado_em: l.cancelado_em, cancelado_por: l.cancelado_por,
      registro_id: l.registro_id, contrato_id: reg.contrato_id ?? null, chave: reg.chave ?? null };
  }

  /** Guarda um agendado (o e-mail montado já está no R2: o Worker grava antes). */
  novo({ id, quando, para = [], assunto = '', descricao = '', anexos = [], registro, tamanho = 0 } = {}, email) {
    this.c.exigir(email, 'operador');
    if (!RE_ID.test(texto(id))) throw new this.Erro(400, 'Pedido inválido.');
    const q = this.conferir(() => quandoValido(quando, this.agora()));
    const reg = this.conferir(() => registroValido(registro));
    const abertos = Number(this.c.q("SELECT COUNT(*) AS n FROM envios_agendados WHERE situacao IN ('agendado', 'enviando', 'falhou')")[0].n);
    if (abertos >= MAX_ABERTOS) throw new this.Erro(429, `Já há ${MAX_ABERTOS} e-mails agendados esperando: cancele alguns antes de agendar mais.`);
    this.c.sql.exec('INSERT INTO envios_agendados (id, quando, situacao, por, criado_em, para, assunto, descricao, anexos, registro, tamanho) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, q, 'agendado', String(email).toLowerCase(), this.agora().toISOString(), (Array.isArray(para) ? para : [para]).map(String).join(', ').slice(0, 2000),
      texto(assunto).slice(0, MAX_ASSUNTO), texto(descricao).slice(0, MAX_DESCRICAO), JSON.stringify((Array.isArray(anexos) ? anexos : []).map((a) => texto(a).slice(0, 200)).slice(0, 30)),
      JSON.stringify(reg), Math.max(0, Math.floor(Number(tamanho) || 0)));
    return { ok: true, agendado: this.paraTela(this.linha(id)) };
  }

  /** Os que esperam ou falharam, e os enviados e cancelados dos últimos DIAS_NA_LISTA dias (todos da equipe). */
  lista(email) {
    this.c.exigir(email, 'consulta');
    const desde = new Date(this.agora().getTime() - DIAS_NA_LISTA * 86400000).toISOString();
    const linhas = this.c.q("SELECT * FROM envios_agendados WHERE situacao IN ('agendado', 'enviando', 'falhou') OR COALESCE(enviado_em, cancelado_em, criado_em) >= ? ORDER BY quando", desde);
    return { agendados: linhas.map((l) => this.paraTela(l)) };
  }

  /** Muda a hora (também "Tentar de novo" de um que falhou). */
  mudar({ id, quando } = {}, email) {
    this.c.exigir(email, 'operador');
    const l = this.linha(id);
    if (!l) throw new this.Erro(404, 'Este envio agendado não existe mais.');
    if (!['agendado', 'falhou'].includes(l.situacao)) throw new this.Erro(409, l.situacao === 'enviando' ? 'Este e-mail está saindo agora: não dá para mudar.' : `Este e-mail já foi ${l.situacao}.`);
    const q = this.conferir(() => quandoValido(quando, this.agora()));
    this.c.sql.exec("UPDATE envios_agendados SET quando = ?, situacao = 'agendado', tentativas = 0, erro = NULL, limite_desde = NULL, mudado_em = ?, mudado_por = ? WHERE id = ?", q, this.agora().toISOString(), String(email).toLowerCase(), l.id);
    return { ok: true, agendado: this.paraTela(this.linha(l.id)) };
  }

  /** Cancela (o Worker apaga o e-mail montado do R2). Devolve o registro preparado, para o site desfazer o que marcou ao agendar. */
  cancelar({ id } = {}, email) {
    this.c.exigir(email, 'operador');
    const l = this.linha(id);
    if (!l) throw new this.Erro(404, 'Este envio agendado não existe mais.');
    if (l.situacao === 'cancelado') return { ok: true, agendado: this.paraTela(l), repetido: true };
    if (!['agendado', 'falhou'].includes(l.situacao)) throw new this.Erro(409, l.situacao === 'enviando' ? 'Este e-mail está saindo agora: não dá para cancelar.' : 'Este e-mail já foi enviado.');
    this.c.sql.exec("UPDATE envios_agendados SET situacao = 'cancelado', cancelado_em = ?, cancelado_por = ? WHERE id = ?", this.agora().toISOString(), String(email).toLowerCase(), l.id);
    return { ok: true, agendado: this.paraTela(this.linha(l.id)), registro: JSON.parse(l.registro || '{}') };
  }

  /** Valor de uma regra do sistema (registros de config_regras), ou o padrão. */
  regra(chave, padrao) {
    for (const r of this.c.q("SELECT dados FROM registros WHERE tabela = 'config_regras'")) {
      try { const x = JSON.parse(r.dados); if (x.chave === chave && x.valor !== undefined && x.valor !== null) return x.valor; } catch { /* linha estragada */ }
    }
    return padrao;
  }

  /** Horas do horário comercial pelas regras do sistema (as mesmas de calculos.js horasComerciais) e os feriados. */
  horas() {
    const locais = (Array.isArray(this.regra('feriados_locais', [])) ? this.regra('feriados_locais', []) : []).map(String);
    return {
      inicio: this.regra('inicio_expediente_hora', 8), fim: this.regra('fim_expediente_hora', 18), sabadoFim: this.regra('fim_expediente_sabado_hora', 12),
      ehFeriado: (x) => feriados(Number(x.slice(0, 4))).has(x) || locais.some((f) => (f.length === 5 ? x.slice(5) === f : x === f)),
    };
  }

  /** Início do próximo dia de horário comercial depois de hoje. Ex.: limite batido no sábado às 8h → segunda às 8h. */
  proximoDiaComercial(agora) {
    const amanha = new Date(Date.parse(`${hojeBrasilia(agora)}T00:00:00-03:00`) + 86400000);
    const p = proximoHorarioComercial(amanha, this.horas());
    return p.quando || amanha;
  }

  /**
   * Limite diário de e-mails batido: volta a "agendado" para o próximo dia de horário comercial, com o aviso na lista.
   * Depois de DIAS_LIMITE dias nisso, vira falha. Devolve true se reagendou.
   */
  limiteDoDia(l, agora, motivo) {
    const desde = Date.parse(l.limite_desde || '') || agora.getTime();
    if (agora.getTime() - desde >= DIAS_LIMITE * 86400000) {
      this.falhar(l.id, `Não saiu: limite diário de e-mails por ${DIAS_LIMITE} dias seguidos (${motivo})`);
      return false;
    }
    this.c.sql.exec("UPDATE envios_agendados SET situacao = 'agendado', quando = ?, erro = ?, limite_desde = ? WHERE id = ?",
      this.proximoDiaComercial(agora).toISOString(), AVISO_LIMITE, new Date(desde).toISOString(), l.id);
    return true;
  }

  falhar(id, erro) {
    this.c.sql.exec("UPDATE envios_agendados SET situacao = 'falhou', erro = ? WHERE id = ?", texto(erro).slice(0, 500), id);
  }

  /**
   * Cron: os que chegaram na hora (até POR_RODADA), já marcados como "saindo" (outra rodada não pega de novo). Quem agendou
   * precisa continuar podendo mandar e-mail, e o envio conta no limite do dia dele (registrarEmail), como o "Enviar agora".
   */
  vencidos(agora = this.agora()) {
    const preso = new Date(agora.getTime() - PRESO_MS).toISOString();
    for (const l of this.c.q("SELECT id FROM envios_agendados WHERE situacao = 'enviando' AND enviando_em < ?", preso)) this.falhar(l.id, ERRO_PRESO);
    const linhas = this.c.q("SELECT * FROM envios_agendados WHERE situacao = 'agendado' AND quando <= ? ORDER BY quando LIMIT ?", agora.toISOString(), POR_RODADA);
    const prontos = [];
    for (const l of linhas) {
      try {
        let anexos = [];
        try { anexos = JSON.parse(l.anexos || '[]'); } catch { /* sem os nomes */ }
        this.c.registrarEmail({ para: l.para.split(', '), assunto: l.assunto, anexos }, l.por);
      } catch (e) {
        if (e?.status === 429) this.limiteDoDia(l, agora, e.message);
        else this.falhar(l.id, `Não saiu: ${e.message}`);
        continue;
      }
      this.c.sql.exec("UPDATE envios_agendados SET situacao = 'enviando', enviando_em = ?, tentativas = tentativas + 1 WHERE id = ?", agora.toISOString(), l.id);
      prontos.push({ id: l.id, por: l.por });
    }
    return { vencidos: prontos };
  }

  /**
   * Cron: o resultado de um envio. Saiu → grava em envios_email (lote com o código do agendado: repetido não entra duas vezes)
   * com a data de Brasília do envio. Falhou com o Gmail fora do ar ou no limite (`transitorio`) → tenta de novo em 10 minutos,
   * até MAX_TENTATIVAS; senão fica "falhou" com o motivo (a tela e o Painel mostram). Devolve { apagar } (o e-mail montado sai do R2).
   */
  resultado({ id, ok, gmail_id = '', erro = '', transitorio = false, limite = false } = {}, agora = this.agora()) {
    const l = this.linha(id);
    if (!l || l.situacao !== 'enviando') return { ok: true, ignorado: true, apagar: false };
    if (!ok) {
      if (limite) return { ok: true, apagar: false, de_novo: this.limiteDoDia(l, agora, erro || 'limite do Gmail') };
      if (transitorio && l.tentativas < MAX_TENTATIVAS) {
        this.c.sql.exec("UPDATE envios_agendados SET situacao = 'agendado', quando = ?, erro = ? WHERE id = ?", new Date(agora.getTime() + ESPERA_NOVA_TENTATIVA).toISOString(), texto(erro).slice(0, 500), l.id);
        return { ok: true, apagar: false, de_novo: true };
      }
      this.falhar(l.id, erro || 'O Gmail não aceitou o e-mail.');
      return { ok: true, apagar: false };
    }
    let reg = {};
    try { reg = JSON.parse(l.registro || '{}'); } catch { /* sem o registro: grava o básico */ }
    const usuario = texto(reg.usuario) || l.por;
    delete reg.usuario;
    let registroId = null; let aviso = null;
    try {
      const { inicio } = this.c.transacao(() => this.c.reservarFaixa('envios_email', 1));
      registroId = inicio;
      const dados = { id: inicio, ...reg, data: hojeBrasilia(agora), como: 'enviado', gmail_id: texto(gmail_id) || null, agendado_id: l.id, agendado_para: l.quando, enviado_em: agora.toISOString() };
      const historico = { quando: agora.toISOString(), usuario, acao: 'Inclusão', tabela: 'envios_email', registro_id: inicio,
        descricao: `E-mail agendado "${texto(l.assunto)}" enviado pela nuvem para ${l.para}`, detalhes: null, imovel_id: null, contrato_id: reg.contrato_id ?? null };
      const r = this.c.aplicar({ id: `agendado-${l.id}`, em: agora.toISOString(), ops: [{ op: 'inserir', tabela: 'envios_email', id: inicio, dados }, { op: 'historico', entrada: historico }] }, l.por);
      if (r?.repetido) registroId = null;
    } catch (e) {
      aviso = `Enviado, mas o registro do envio não entrou no sistema (${e.message}).`;
      console.error('agendado: registro do envio', e);
    }
    this.c.sql.exec("UPDATE envios_agendados SET situacao = 'enviado', enviado_em = ?, gmail_id = ?, registro_id = ?, erro = ? WHERE id = ?",
      agora.toISOString(), texto(gmail_id) || null, registroId, aviso, l.id);
    return { ok: true, apagar: true, registro_id: registroId };
  }

  /** Faxina (alarme diário): enviados e cancelados há mais de GUARDAR_DIAS dias saem da lista. */
  faxina(agora = this.agora()) {
    const antes = new Date(agora.getTime() - GUARDAR_DIAS * 86400000).toISOString();
    this.c.sql.exec("DELETE FROM envios_agendados WHERE situacao IN ('enviado', 'cancelado') AND COALESCE(enviado_em, cancelado_em) < ?", antes);
  }
}

// ---------------------------------------------------------------------------
// Lado do Worker: rotas do site e a rodada do cron
// ---------------------------------------------------------------------------
const cofreDe = (env) => env.COFRE.get(env.COFRE.idFromName('principal'));

async function pedirAoCofre(env, rota, { email = '', corpo, metodo = 'POST' } = {}) {
  if (!env.COFRE) throw new ErroAgendado(503, 'Worker sem o cofre ligado (binding COFRE).');
  const r = await cofreDe(env).fetch(new Request(`https://cofre/${rota}`, {
    method: metodo, ...(metodo === 'POST' ? { body: JSON.stringify(corpo || {}) } : {}),
    headers: { 'Content-Type': 'application/json', ...(email ? { 'X-Email-Conferido': email } : {}) },
  }));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroAgendado(r.status, d.erro || 'Erro no cofre da nuvem.');
  return d;
}

/** Código sorteado do agendado (32 caracteres hexadecimais). */
export const novoId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * POST email/agendar: { para, cco, assunto, texto, html, imagens, anexos (base64), quando, registro, descricao }. Confere o
 * e-mail como o "Enviar agora" (validarEnvio), guarda o montado no R2 e a linha no cofre. Devolve { ok, id, quando }.
 */
export async function agendar(env, pedido, email) {
  if (!pedido || typeof pedido !== 'object') throw new ErroAgendado(400, 'Pedido inválido.');
  const v = validarEnvio(pedido);
  const quando = quandoValido(pedido.quando);
  const registro = registroValido(pedido.registro);
  const id = novoId();
  const montado = JSON.stringify(v);
  await env.DADOS.put(`${PASTA}${id}.json`, montado, { httpMetadata: { contentType: 'application/json' }, customMetadata: { por: email } });
  try {
    await pedirAoCofre(env, 'agendados/novo', { email, corpo: { id, quando, para: [...v.para, ...v.cco], assunto: v.assunto, descricao: texto(pedido.descricao), anexos: v.anexos.map((a) => a.nome), registro, tamanho: montado.length } });
  } catch (e) {
    await env.DADOS.delete(`${PASTA}${id}.json`).catch(() => {});
    throw e;
  }
  return { ok: true, id, quando };
}

export const listaDeAgendados = (env, email) => pedirAoCofre(env, 'agendados/lista', { email, metodo: 'GET' });

export const mudarAgendado = (env, { id, quando } = {}, email) => pedirAoCofre(env, 'agendados/mudar', { email, corpo: { id: texto(id), quando: texto(quando) } });

export async function cancelarAgendado(env, { id } = {}, email) {
  const r = await pedirAoCofre(env, 'agendados/cancelar', { email, corpo: { id: texto(id) } });
  if (RE_ID.test(texto(id))) await env.DADOS.delete(`${PASTA}${id}.json`).catch(() => {});
  return r;
}

/**
 * A rodada do cron (a cada 5 minutos, `scheduled` em worker.mjs): manda os que chegaram na hora. `simular`: só no computador
 * (nuvem/local.mjs com SIMULAR_GMAIL=1). Devolve { enviados, falhas, de_novo }.
 */
export async function rodarAgendados(env, { agora = new Date(), simular = false, buscar = fetch, registrar = console.log } = {}) {
  const feito = { enviados: 0, falhas: 0, de_novo: 0 };
  if (!env?.COFRE || !env?.DADOS) return feito;
  const { vencidos = [] } = await pedirAoCofre(env, 'agendados/vencidos', { corpo: { agora: agora.toISOString() } });
  if (!vencidos.length) return feito;
  const conta = simular ? null : await contaGuardada(env);
  for (const x of vencidos) {
    let resultado;
    try {
      const obj = await env.DADOS.get(`${PASTA}${x.id}.json`);
      if (!obj) throw new ErroAgendado(404, 'O e-mail guardado não foi encontrado na nuvem.');
      const pedido = JSON.parse(await obj.text());
      const r = await enviarEmail(env, pedido, { buscar, simular, conta, registrar });
      resultado = { id: x.id, ok: true, gmail_id: r.id };
    } catch (e) {
      // Gmail fora do ar (502) ou no limite (429): tenta de novo; o resto (Gmail desligado, autorização vencida) fica como falha
      resultado = { id: x.id, ok: false, erro: e.message || 'Erro no envio.', transitorio: e.status === 502, limite: e.status === 429 };
    }
    const r = await pedirAoCofre(env, 'agendados/resultado', { corpo: { ...resultado, agora: agora.toISOString() } });
    if (resultado.ok) feito.enviados += 1; else if (r.de_novo) feito.de_novo += 1; else feito.falhas += 1;
    if (r.apagar) await env.DADOS.delete(`${PASTA}${x.id}.json`).catch(() => {});
    registrar(`agendado ${x.id}: ${resultado.ok ? 'enviado' : r.de_novo ? 'tenta de novo' : 'falhou'}`); // sem o conteúdo
  }
  return feito;
}
