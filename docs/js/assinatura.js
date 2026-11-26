// Assinatura digital, do lado do site (pedido do dono de 21/11/2026; parte 3 de 4): manda o PDF conferido para a fila da
// nuvem (/api/assinaturas, nuvem/assinaturas.mjs), mostra a situação e baixa o assinado. Quem assina é o programa do PC, com o
// certificado A1 e-CNPJ da ANK (atualizador-pc/assinar-pdf.mjs). Só existe na nuvem: no ?teste e na versão PC não há /api/.
// Ligada pela regra `assinatura_digital` (o botão fica na caixa do certificado, Sistema → Empresas): desligada, nada muda (os e-mails levam o PDF sem assinatura).
// Não importe nada de telas/.
import * as C from './calculos.js';
import { limiteDeTempo } from './nuvem.js';

const cfg = { base: 'api/', buscar: (...a) => fetch(...a) };
/** Só para os testes: troca o fetch / o endereço da API. */
export function configurarAssinatura(opcoes = {}) { Object.assign(cfg, opcoes); filaGuardada = null; }

/** Documentos que a pessoa preenche (a ficha): quem assina é ela, não a empresa. */
export const SEM_ASSINATURA_DA_EMPRESA = ['ficha', 'ficha_fiador'];

/** Dias antes do vencimento do certificado em que o aviso de renovação começa (na caixa do certificado e no Painel). */
export const AVISO_CERTIFICADO_DIAS = 30;

const diaDaqui = (agora) => { const d = new Date(agora); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Dias do dia de hoje até `iso` (negativo = já passou). Ex.: hoje 22/11/2026, validade 22/12/2026 → 30. */
const diasAte = (iso, agora) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${diaDaqui(agora)}T12:00:00Z`)) / 86400000);

/**
 * O certificado anexado, pelo que o programa do PC contou à nuvem (`pc` da fila). Devolve { anexado, texto, cor, aviso }.
 * Ex.: válido até 22/12/2026, hoje 22/11/2026 → anexado, aviso "vence em 22/12/2026 (faltam 30 dias): renove…".
 */
export function situacaoDoCertificado(pc, agora = Date.now()) {
  if (!pc) return { anexado: null, texto: 'Nenhum computador com o programa do PC olhou a fila de assinatura ainda. Anexe o certificado no computador que vai assinar.', cor: 'neutra', aviso: '' };
  // o PC olha a fila (a tarefa de cada minuto roda) mas não conta o certificado: é o programa de antes de 22/11/2026
  if (pc.certificado === undefined) return { anexado: null, texto: `O programa do PC${pc.computador ? ` do computador ${pc.computador}` : ''} está desatualizado e ainda não sabe mostrar o certificado aqui. Ele se atualiza sozinho em até 1 hora (ou ao reiniciar o computador); depois disso, o certificado aparece nesta caixa.`, cor: 'aviso', aviso: '' };
  const c = pc.certificado;
  if (!c) return { anexado: false, texto: `Nenhum certificado anexado${pc.computador ? ` (último computador: ${pc.computador})` : ''}.`, cor: 'neutra', aviso: '' };
  const dias = diasAte(c.validade, agora);
  const quem = `${c.nome}${c.cnpj ? `, CNPJ ${c.cnpj}` : ''}`;
  const onde = `${pc.computador ? `no computador ${pc.computador}` : 'no programa do PC'}${c.instalado_em ? `, desde ${C.dataBrDe(c.instalado_em)}` : ''}`;
  const validade = dias < 0 ? `venceu em ${C.dataBr(c.validade)}` : `válido até ${C.dataBr(c.validade)} (${dias === 0 ? 'vence hoje' : `faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}`})`;
  const aviso = dias < 0 ? `O certificado digital da empresa venceu em ${C.dataBr(c.validade)}: os documentos não são mais assinados. Renove com a certificadora e anexe o novo em Sistema → Empresas.`
    : dias <= AVISO_CERTIFICADO_DIAS ? `O certificado digital da empresa vence em ${C.dataBr(c.validade)} (${dias === 0 ? 'hoje' : `faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}`}): renove com a certificadora e anexe o novo em Sistema → Empresas.` : '';
  return { anexado: true, texto: `Anexado: ${quem}, ${validade}, ${onde}.`, cor: dias < 0 ? 'perigo' : aviso ? 'aviso' : 'ok', aviso, nome: c.nome, validade: c.validade, dias };
}

/** O PC parou de olhar a fila há mais que isto: o aviso pede para ligar o computador (o programa olha a cada minuto). */
export const PC_PARADO_MS = 10 * 60 * 1000;

/**
 * Chave do documento na fila (o mesmo documento conferido de novo troca o pedido, não duplica). Ex.: recibo da garantia do
 * contrato 12 → "recibo:garantia:c12"; termo do acordo 3 do contrato 12 → "recibo:acordo:c12:3"; ficha 5 → "recibo:reserva:f5".
 */
export function chaveDoRecibo(tipo, alvo) {
  const quem = alvo.ficha ? `f${alvo.ficha.id}` : `c${alvo.contrato.id}`;
  const extra = alvo.id || alvo.acordo || (alvo.notificacao && alvo.notificacao.id) || (alvo.fiador ? `fiador${alvo.fiador}` : '');
  return `recibo:${tipo}:${quem}${extra ? `:${extra}` : ''}`;
}

/**
 * Documentos de texto longo (pedido de 24/11/2026): contrato, termo aditivo e carta de reajuste. A chave tem o começo fixo
 * do documento (``prefixoDoDocumento``) e um resumo do texto: mudou o texto, muda a chave (o assinado antes não vale mais para
 * a página). Ex.: contrato 12 → "doc:contrato:c12:v1a2b3c4d"; aditivo 5 do contrato 12 → "doc:aditivo:c12:a5:v…";
 * carta de reajuste de 11/2026 → "doc:carta_reajuste:c12:2026-11:v…".
 */

export function prefixoDoDocumento(tipo, { contrato, id, comp } = {}) {
  return `doc:${tipo}:c${contrato.id}${id ? `:a${id}` : ''}${comp ? `:${comp}` : ''}:`;
}

/** Resumo curto (FNV-1a, 32 bits) do texto do documento. Ex.: 'abc' → '1a47e90b'. */
export function resumoDoTexto(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export const chaveDoDocumento = (tipo, alvo, conteudo) => `${prefixoDoDocumento(tipo, alvo)}v${resumoDoTexto(conteudo)}`;

/** Pedidos de todas as versões do documento (pelo começo da chave), o mais novo primeiro. */
export const pedidosDoDocumento = (dados, prefixo) => (dados?.pedidos || []).filter((p) => String(p.chave || '').startsWith(prefixo))
  .sort((a, b) => String(b.pedido_em).localeCompare(String(a.pedido_em)));

/**
 * O que vai no e-mail: o pedido desta versão (``chave``) ou, sem como saber a versão (o contrato no e-mail não sabe o modelo
 * nem as testemunhas escolhidas na página), o mais novo de qualquer versão. { pedido, ok, motivo }; pedido null = nada a anexar.
 */
export function assinadoParaEmail(dados, prefixo, chave = null) {
  const p = chave ? pedidoDe(dados, chave) : pedidosDoDocumento(dados, prefixo)[0] || null;
  if (!p) return { pedido: null, ok: false, motivo: '' };
  if (p.situacao === 'assinado') return { pedido: p, ok: true, motivo: '' };
  return { pedido: p, ok: false, motivo: p.situacao === 'erro' ? `o PC não conseguiu assinar (${p.erro})` : 'ainda na fila do PC para assinar' };
}

const ehJson = (r) => (r.headers.get('content-type') || '').includes('json');
const local = () => globalThis.location && !/^https?:$/.test(globalThis.location.protocol);

async function pedir(caminho, opcoes = {}, tempo = 20000) {
  if (local() || globalThis.navigator?.onLine === false) throw new C.ErroUsuario('A assinatura digital só funciona pela internet.');
  let r;
  try { r = await cfg.buscar(`${cfg.base}${caminho}`, { cache: 'no-store', credentials: 'same-origin', signal: limiteDeTempo(tempo), ...opcoes }); } catch (e) {
    throw new C.ErroUsuario(e?.name === 'TimeoutError' ? 'A nuvem demorou demais para responder. Tente de novo.' : 'Sem internet: tente de novo quando a conexão voltar.');
  }
  if (r.redirected) throw new C.ErroUsuario('Seu acesso pela internet venceu. Recarregue a página para entrar de novo.');
  return r;
}

let filaGuardada = null; // { em, dados } (vale alguns segundos: uma tela com vários recibos consulta uma vez)

/** A fila: { pedidos: [{ id, chave, titulo, situacao, pedido_em, assinado_em, erro, … }], pc: { visto_em } | null }. */
export async function fila({ fresca = false } = {}) {
  if (!fresca && filaGuardada && Date.now() - filaGuardada.em < 15000) return filaGuardada.dados;
  const r = await pedir('assinaturas');
  if (!r.ok || !ehJson(r)) throw new C.ErroUsuario(`Não consegui ler a fila de assinatura (erro ${r.status}).`);
  const dados = await r.json();
  filaGuardada = { em: Date.now(), dados };
  return dados;
}

/** O pedido do documento (pela chave), ou null. */
export const pedidoDe = (dados, chave) => (dados?.pedidos || []).find((p) => p.chave === chave) || null;

/** Manda o PDF conferido para a fila. ``meta``: { titulo, chave, contrato, nome }. Devolve o pedido. */
export async function pedirAssinatura(blob, meta) {
  const q = new URLSearchParams({ titulo: meta.titulo || 'Documento', chave: meta.chave || '', nome: meta.nome || 'documento.pdf', ...(meta.contrato ? { contrato: String(meta.contrato) } : {}) });
  const r = await pedir(`assinaturas?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Sistema': 'imoveis' }, body: blob }, 60000);
  const d = ehJson(r) ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw new C.ErroUsuario(d.erro || `O documento não foi para a fila (erro ${r.status}).`);
  filaGuardada = null;
  return d.pedido;
}

/** O PDF assinado (Blob). */
export async function baixarAssinado(id) {
  const r = await pedir(`assinaturas/${encodeURIComponent(id)}.pdf?assinado=1`, {}, 60000);
  if (!r.ok) { const d = ehJson(r) ? await r.json().catch(() => ({})) : {}; throw new C.ErroUsuario(d.erro || `Não consegui baixar o PDF assinado (erro ${r.status}).`); }
  return new Blob([await r.arrayBuffer()], { type: 'application/pdf' });
}

/** Cancela o pedido (tira da fila). */
export async function cancelarAssinatura(id) {
  const r = await pedir(`assinaturas/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-Sistema': 'imoveis' } });
  if (!r.ok) throw new C.ErroUsuario(`Não consegui tirar da fila (erro ${r.status}).`);
  filaGuardada = null;
}

/**
 * Situação para mostrar. Ex.: pendente com o PC parado há 2 h → { texto: 'Aguardando a assinatura do PC (o PC não olha a fila
 * desde 05/12/2026 às 08:10: ligue o computador com o certificado)', cor: 'aviso' }.
 */
export function situacaoDoPedido(p, pc, agora = Date.now()) {
  if (!p) return { texto: 'Ainda não enviado para assinar.', cor: 'neutra' };
  if (p.situacao === 'assinado') return { texto: `Assinado digitalmente em ${C.dataHoraBr(p.assinado_em)}.`, cor: 'ok' };
  if (p.situacao === 'erro') return { texto: `O PC não conseguiu assinar: ${p.erro}`, cor: 'perigo' };
  const parado = !pc || agora - Date.parse(pc.visto_em) > PC_PARADO_MS;
  return { texto: `Aguardando a assinatura do PC (enviado em ${C.dataHoraBr(p.pedido_em)})${parado ? `. O PC com o certificado não olha a fila ${pc ? `desde ${C.dataHoraBr(pc.visto_em)}` : 'ainda'}: ligue o computador.` : '.'}`, cor: 'aviso' };
}

/** Aviso do Painel: quantos esperam com o PC parado (ou com erro). Ex.: "3 documentos na fila para assinatura digital…". */
export function avisoDaFila(dados, agora = Date.now()) {
  const pend = (dados?.pedidos || []).filter((p) => p.situacao === 'pendente');
  const erros = (dados?.pedidos || []).filter((p) => p.situacao === 'erro');
  const parado = !dados?.pc || agora - Date.parse(dados.pc.visto_em) > PC_PARADO_MS;
  const out = [];
  if (pend.length && parado) out.push(`${pend.length} ${pend.length === 1 ? 'documento está' : 'documentos estão'} na fila para assinatura digital: ligue o PC com o certificado.`);
  if (erros.length) out.push(`${erros.length} ${erros.length === 1 ? 'documento não foi assinado' : 'documentos não foram assinados'} pelo PC (${erros[0].erro}).`);
  return out;
}
