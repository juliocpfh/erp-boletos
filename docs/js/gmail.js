// E-mail pela conta Gmail da empresa, do lado do site: pergunta à nuvem se o envio está ligado e manda o e-mail
// (rotas /api/email/… do Worker, nuvem/gmail.mjs). Só existe na nuvem: no ?teste, na versão PC e no GitHub Pages sem o Worker
// não há /api/ e `emailLigado` devolve false (a tela oferece "Copiar texto" / "Abrir no Gmail").
// O registro do envio (histórico, data) é da tela: aqui só se fala com a nuvem. Não importe nada de telas/.
import * as C from './calculos.js';
import { limiteDeTempo } from './nuvem.js';

export const MAX_BYTES_ANEXOS = 20 * 1024 * 1024; // igual a MAX_BYTES_ANEXOS de nuvem/gmail.mjs
const TEMPO_ESTADO = 10000;
const TEMPO_ENVIO = 120000;
const SEM_INTERNET = 'Sem internet: o e-mail não foi enviado. Use Copiar texto ou Abrir no Gmail.';

const cfg = { base: 'api/', buscar: (...a) => fetch(...a), online: () => globalThis.navigator?.onLine !== false };
let estadoGuardado = null; // { ligado, remetente } da primeira resposta desta abertura

/** Só para os testes: troca o fetch / o endereço da API e esquece a resposta guardada. */
export function configurarEmail(opcoes = {}) { Object.assign(cfg, opcoes); estadoGuardado = null; }

const ehJson = (r) => (r.headers.get('content-type') || '').includes('json');
const local = () => globalThis.location && !/^https?:$/.test(globalThis.location.protocol); // versão PC (file://)

/**
 * { ligado, remetente } do envio pelo Gmail. Consulta a nuvem uma vez por abertura (a resposta boa fica guardada);
 * sem a nuvem, sem internet ou fora do login responde { ligado: false } sem guardar (tenta de novo na próxima vez).
 */
export async function estadoEmail() {
  if (estadoGuardado) return estadoGuardado;
  if (local()) return { ligado: false, remetente: null };
  try {
    const r = await cfg.buscar(`${cfg.base}email/estado`, { cache: 'no-store', credentials: 'same-origin', signal: limiteDeTempo(TEMPO_ESTADO) });
    if (!r.ok || r.redirected || !ehJson(r)) return { ligado: false, remetente: null };
    const d = await r.json();
    estadoGuardado = { ligado: d.ligado === true, remetente: typeof d.remetente === 'string' ? d.remetente : null };
    return estadoGuardado;
  } catch { return { ligado: false, remetente: null }; }
}

/** O botão "Enviar pelo sistema" pode aparecer? (só na nuvem, com o Gmail ligado no Worker) */
export async function emailLigado() {
  return (await estadoEmail()).ligado;
}

/**
 * Situação completa para a caixa "E-mail pelo Gmail" (Sistema → Comunicação E-mail), sempre perguntada de novo:
 * { ligado, remetente, origem ('conta' | 'segredo' | 'simulado' | null), conta, cliente, retorno, ligado_em?, ilegivel? }.
 * Sem a nuvem ou sem resposta: null.
 */
export async function situacaoGmail() {
  if (local()) return null;
  try {
    const r = await cfg.buscar(`${cfg.base}email/estado`, { cache: 'no-store', credentials: 'same-origin', signal: limiteDeTempo(TEMPO_ESTADO) });
    if (!r.ok || r.redirected || !ehJson(r)) return null;
    const d = await r.json();
    estadoGuardado = { ligado: d.ligado === true, remetente: typeof d.remetente === 'string' ? d.remetente : null };
    return d && typeof d === 'object' ? d : null;
  } catch { return null; }
}

/** POST de ligar/desligar (só administrador; a nuvem confere). Erro vira C.ErroUsuario com a mensagem da nuvem. */
async function pedirGmail(rota) {
  if (local() || !cfg.online()) throw new C.ErroUsuario('Sem internet: tente de novo quando a conexão voltar.');
  let r;
  try {
    r = await cfg.buscar(`${cfg.base}email/google/${rota}`, {
      method: 'POST', cache: 'no-store', credentials: 'same-origin', signal: limiteDeTempo(TEMPO_ESTADO),
      headers: { 'Content-Type': 'application/json', 'X-Sistema': 'imoveis' }, body: '{}',
    });
  } catch { throw new C.ErroUsuario('Sem internet: tente de novo quando a conexão voltar.'); }
  if (r.redirected || !ehJson(r)) throw new C.ErroUsuario('Seu acesso pela internet venceu. Recarregue a página para entrar de novo (código no e-mail).');
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new C.ErroUsuario(d.erro || `Erro ${r.status} na nuvem.`);
  estadoGuardado = null;
  return d;
}

/** "Conectar o Gmail": o endereço da tela de permissão do Google (a tela leva o navegador para lá). */
export async function enderecoParaConectar() {
  const { url } = await pedirGmail('conectar');
  if (typeof url !== 'string' || !url.startsWith('https://accounts.google.com/')) throw new C.ErroUsuario('A nuvem não devolveu o endereço do Google.');
  return url;
}

/** "Desconectar": apaga a autorização na nuvem e a retira no Google. Devolve { havia, revogado, segredo_antigo }. */
export const desconectarGmail = () => pedirGmail('desconectar');

/** Blob → base64 (sem o "data:…," do começo), aos pedaços para não estourar a pilha. */
export async function base64DoBlob(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Envia pela conta da empresa. `para` e `cco`: um e-mail ou vários separados por vírgula (até 5);
 * `anexos`: [{ nome, blob }]; `html` (opcional): a versão com formatação, com `imagens` [{ cid, tipo, base64 }] (a logo). Devolve { ok: true, id } (id da mensagem no Gmail).
 * Erro esperado (sem internet, e-mail inválido, anexos grandes, Gmail não ligado) lança C.ErroUsuario com a mensagem.
 */
export async function enviarEmail({ para, cco = '', assunto, texto, anexos = [], html = '', imagens = [] } = {}) {
  if (!String(para || '').trim()) throw new C.ErroUsuario('Informe o e-mail do destinatário.');
  const total = anexos.reduce((s, a) => s + (a?.blob?.size || 0), 0);
  if (total > MAX_BYTES_ANEXOS) throw new C.ErroUsuario(`Anexos passam de ${MAX_BYTES_ANEXOS / 1048576} MB.`);
  if (local() || !cfg.online()) throw new C.ErroUsuario(SEM_INTERNET);
  const lista = [];
  for (const a of anexos) {
    if (!a?.blob) throw new C.ErroUsuario(`Anexo sem arquivo: ${a?.nome || ''}`);
    lista.push({ nome: String(a.nome || a.blob.name || 'anexo'), tipo: a.blob.type || 'application/octet-stream', base64: await base64DoBlob(a.blob) });
  }
  let r;
  try {
    r = await cfg.buscar(`${cfg.base}email/enviar`, {
      method: 'POST', cache: 'no-store', credentials: 'same-origin', signal: limiteDeTempo(TEMPO_ENVIO),
      headers: { 'Content-Type': 'application/json', 'X-Sistema': 'imoveis' },
      body: JSON.stringify({ para: String(para), cco: String(cco || ''), assunto: String(assunto || ''), texto: String(texto || ''), anexos: lista, ...(html ? { html: String(html), imagens } : {}) }),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new C.ErroUsuario('A nuvem demorou demais para responder. Confira na pasta Enviados do Gmail antes de mandar de novo.');
    throw new C.ErroUsuario(SEM_INTERNET);
  }
  // o login do Access venceu: o Cloudflare devolve a página de login em vez do JSON
  if (r.redirected || !ehJson(r)) throw new C.ErroUsuario('Seu acesso pela internet venceu. Recarregue a página para entrar de novo (código no e-mail). O e-mail não foi enviado.');
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new C.ErroUsuario(d.erro || `O e-mail não foi enviado (erro ${r.status}).`);
  return { ok: true, id: String(d.id || '') };
}

// ---------------------------------------------------------------------------
// E-mails agendados (nuvem/agendados.mjs): fora do horário comercial o e-mail fica guardado na nuvem e sai sozinho na hora
// marcada (cron do Worker), mesmo com os aparelhos desligados. Só existe na nuvem com o Gmail ligado (podeAgendar).
// ---------------------------------------------------------------------------
const SEM_NUVEM = 'Agendar só funciona no sistema na nuvem, com o Gmail ligado.';

/** Dá para agendar aqui? (nuvem com o Gmail ligado; na versão PC, no ?teste e sem internet, não) */
export async function podeAgendar() {
  if (local() || !cfg.online()) return false;
  return (await estadoEmail()).ligado;
}

async function pedirAgendados(rota, { metodo = 'POST', corpo, tempo = TEMPO_ESTADO } = {}) {
  if (local() || !cfg.online()) throw new C.ErroUsuario(SEM_NUVEM);
  let r;
  try {
    r = await cfg.buscar(`${cfg.base}email/${rota}`, {
      method: metodo, cache: 'no-store', credentials: 'same-origin', signal: limiteDeTempo(tempo),
      ...(metodo === 'POST' ? { headers: { 'Content-Type': 'application/json', 'X-Sistema': 'imoveis' }, body: JSON.stringify(corpo || {}) } : {}),
    });
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new C.ErroUsuario('A nuvem demorou demais para responder. Confira em Envios agendados antes de tentar de novo.');
    throw new C.ErroUsuario('Sem internet: tente de novo quando a conexão voltar.');
  }
  if (r.redirected || !ehJson(r)) throw new C.ErroUsuario('Seu acesso pela internet venceu. Recarregue a página para entrar de novo (código no e-mail).');
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new C.ErroUsuario(d.erro || `Erro ${r.status} na nuvem.`);
  return d;
}

/**
 * Agenda um e-mail. Os mesmos campos de `enviarEmail` e mais: `quando` (instante ISO), `registro` (o que vai para
 * envios_email quando sair: chave, contrato_id, cobranca_id…, `usuario`, `efeito`) e `descricao` (para a lista).
 * Devolve { ok, id, quando }.
 */
export async function agendarEmail({ para, cco = '', assunto, texto, anexos = [], html = '', imagens = [], quando, registro = {}, descricao = '' } = {}) {
  if (!String(para || '').trim()) throw new C.ErroUsuario('Informe o e-mail do destinatário.');
  const total = anexos.reduce((s, a) => s + (a?.blob?.size || 0), 0);
  if (total > MAX_BYTES_ANEXOS) throw new C.ErroUsuario(`Anexos passam de ${MAX_BYTES_ANEXOS / 1048576} MB.`);
  const lista = [];
  for (const a of anexos) {
    if (!a?.blob) throw new C.ErroUsuario(`Anexo sem arquivo: ${a?.nome || ''}`);
    lista.push({ nome: String(a.nome || a.blob.name || 'anexo'), tipo: a.blob.type || 'application/octet-stream', base64: await base64DoBlob(a.blob) });
  }
  const d = await pedirAgendados('agendar', { tempo: TEMPO_ENVIO, corpo: { para: String(para), cco: String(cco || ''), assunto: String(assunto || ''), texto: String(texto || ''), anexos: lista, ...(html ? { html: String(html), imagens } : {}), quando: String(quando), registro, descricao: String(descricao || '') } });
  return { ok: true, id: String(d.id || ''), quando: String(d.quando || quando) };
}

/**
 * Lista da nuvem: [{ id, quando, situacao ('agendado' | 'enviando' | 'enviado' | 'falhou' | 'cancelado'), por, criado_em, para,
 * assunto, descricao, anexos, tentativas, erro, enviado_em, cancelado_em, registro_id, contrato_id, chave }]. Sem a nuvem: null.
 */
export async function listaAgendados() {
  if (local() || !cfg.online()) return null;
  try { return (await pedirAgendados('agendados', { metodo: 'GET' })).agendados || []; } catch { return null; }
}

/** Muda a hora (também "Tentar de novo" de um que falhou). Devolve o agendado como na lista. */
export const mudarAgendado = async (id, quando) => (await pedirAgendados('agendados/mudar', { corpo: { id, quando } })).agendado;

/** Cancela. Devolve { agendado, registro } (o registro preparado ao agendar, para desfazer o que foi marcado). */
export const cancelarAgendado = (id) => pedirAgendados('agendados/cancelar', { corpo: { id } });
