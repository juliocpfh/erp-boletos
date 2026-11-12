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

/** Blob → base64 (sem o "data:…," do começo), aos pedaços para não estourar a pilha. */
export async function base64DoBlob(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Envia pela conta da empresa. `para` e `cco`: um e-mail ou vários separados por vírgula (até 5);
 * `anexos`: [{ nome, blob }]. Devolve { ok: true, id } (id da mensagem no Gmail).
 * Erro esperado (sem internet, e-mail inválido, anexos grandes, Gmail não ligado) lança C.ErroUsuario com a mensagem.
 */
export async function enviarEmail({ para, cco = '', assunto, texto, anexos = [] } = {}) {
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
      body: JSON.stringify({ para: String(para), cco: String(cco || ''), assunto: String(assunto || ''), texto: String(texto || ''), anexos: lista }),
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
