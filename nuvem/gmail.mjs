// Envio de e-mail pela conta Gmail da empresa (Gmail API, escopo gmail.send), chamado pelo Worker (rotas /api/email/…).
// Monta a mensagem (MIME) aqui mesmo, sem bibliotecas: só fetch, btoa e TextEncoder (roda no Worker e no Node 22).
// Segredos do Worker: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_REMETENTE, GMAIL_NOME, GMAIL_CCO (opcional).
// Não grava nada: o registro do envio é feito pelo site. Passo a passo para ligar: documentacao/LIGAR_GMAIL.md.

export const MAX_DESTINATARIOS = 5;
export const MAX_ASSUNTO = 200;
export const MAX_TEXTO = 50000;
export const MAX_ANEXOS = 10;
export const MAX_BYTES_ANEXOS = 20 * 1024 * 1024; // total dos anexos (já decodificados)
/** Pedido inteiro (anexos em base64 crescem 1/3, mais o texto e o JSON). */
export const MAX_PEDIDO = Math.ceil(MAX_BYTES_ANEXOS * 4 / 3) + 1024 * 1024;
const LIMITE_RAW = 4 * 1024 * 1024; // acima disso a mensagem vai pelo envio de arquivo (upload), que aceita até 35 MB
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const URL_ENVIO = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const URL_ENVIO_GRANDE = 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media';

/** Erro com a mensagem para o usuário (o Worker devolve { erro } com esse status). */
export class ErroEmail extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

const texto = (v) => (v === undefined || v === null ? '' : String(v));
const segredo = (env, k) => texto(env?.[k]).trim();

/** O envio está ligado (os segredos estão no Worker)? */
export function estadoEmail(env, { simular = false } = {}) {
  const ligado = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_REMETENTE'].every((k) => segredo(env, k));
  if (simular) return { ligado: true, remetente: segredo(env, 'GMAIL_REMETENTE') || 'administracao@exemplo.com.br', simulado: true };
  return { ligado, remetente: ligado ? segredo(env, 'GMAIL_REMETENTE') : null };
}

// ---------------------------------------------------------------------------
// Validação do pedido
// ---------------------------------------------------------------------------
const RE_EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\x00-\x1f\x7f]/;
const RE_TIPO = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/i;
const RE_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export const emailValido = (e) => typeof e === 'string' && e.length <= 254 && RE_EMAIL.test(e) && !e.includes('..');

/** Lista de e-mails ("a@x.com, b@y.com"; aceita também ";"). Vazio → []. */
export function listaDeEmails(valor, { campo = 'destinatário', maximo = MAX_DESTINATARIOS } = {}) {
  const lista = (Array.isArray(valor) ? valor : texto(valor).split(/[,;]/)).map((e) => texto(e).trim()).filter(Boolean);
  for (const e of lista) if (!emailValido(e)) throw new ErroEmail(400, `E-mail do ${campo} inválido: ${e.slice(0, 80)}`);
  if (lista.length > maximo) throw new ErroEmail(400, `No máximo ${maximo} e-mails no ${campo}.`);
  return [...new Set(lista.map((e) => e.toLowerCase()))].map((l) => lista.find((e) => e.toLowerCase() === l));
}

/** Nome de anexo sem caminho, aspas nem caracteres de controle (até 150 caracteres, mantendo a extensão). */
export function nomeDeAnexo(nome) {
  // eslint-disable-next-line no-control-regex
  let n = texto(nome).normalize('NFC').replace(/[\x00-\x1f\x7f"\\/:*?<>|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').trim();
  if (n.length > 150) {
    const ext = (n.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0];
    n = n.slice(0, 150 - ext.length).trim() + ext;
  }
  return n || 'anexo';
}

/** Confere e arruma o pedido do site. Lança ErroEmail com a mensagem para o usuário. */
export function validarEnvio(pedido) {
  if (!pedido || typeof pedido !== 'object') throw new ErroEmail(400, 'Pedido inválido.');
  const para = listaDeEmails(pedido.para, { campo: 'destinatário' });
  if (!para.length) throw new ErroEmail(400, 'Informe o e-mail do destinatário.');
  const cco = listaDeEmails(pedido.cco, { campo: 'cópia oculta' });
  const assunto = texto(pedido.assunto).trim();
  if (!assunto) throw new ErroEmail(400, 'Escreva o assunto do e-mail.');
  if (CONTROLE.test(assunto)) throw new ErroEmail(400, 'O assunto não pode ter quebra de linha.');
  if (assunto.length > MAX_ASSUNTO) throw new ErroEmail(400, `O assunto passa de ${MAX_ASSUNTO} caracteres.`);
  const corpo = texto(pedido.texto);
  if (!corpo.trim()) throw new ErroEmail(400, 'Escreva o texto do e-mail.');
  if (corpo.length > MAX_TEXTO) throw new ErroEmail(400, `O texto passa de ${MAX_TEXTO.toLocaleString('pt-BR')} caracteres.`);
  const brutos = pedido.anexos === undefined || pedido.anexos === null ? [] : pedido.anexos;
  if (!Array.isArray(brutos)) throw new ErroEmail(400, 'Anexos inválidos.');
  if (brutos.length > MAX_ANEXOS) throw new ErroEmail(400, `No máximo ${MAX_ANEXOS} anexos por e-mail.`);
  let total = 0;
  const anexos = brutos.map((a) => {
    const base64 = texto(a?.base64);
    if (!base64 || base64.length % 4 !== 0 || !RE_BASE64.test(base64)) throw new ErroEmail(400, `Anexo inválido: ${nomeDeAnexo(a?.nome)}`);
    const tamanho = (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    total += tamanho;
    const tipo = RE_TIPO.test(texto(a?.tipo)) ? texto(a.tipo).toLowerCase() : 'application/octet-stream';
    return { nome: nomeDeAnexo(a?.nome), tipo, base64, tamanho };
  });
  if (total > MAX_BYTES_ANEXOS) throw new ErroEmail(413, `Anexos passam de ${MAX_BYTES_ANEXOS / 1048576} MB.`);
  return { para, cco, assunto, texto: corpo, anexos };
}

// ---------------------------------------------------------------------------
// Mensagem (MIME)
// ---------------------------------------------------------------------------
/** Bytes em base64 (aos pedaços: String.fromCharCode com tudo de uma vez estoura a pilha). */
export function base64DeBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const utf8 = (t) => new TextEncoder().encode(t);
const ascii = (t) => /^[\x20-\x7e]*$/.test(t);
const linhas76 = (b64) => b64.replace(/.{76}/g, '$&\r\n').replace(/\r\n$/, '');

/** Texto de cabeçalho em UTF-8 (RFC 2047, "=?UTF-8?B?…?="), em pedaços de até 75 caracteres; texto ASCII simples fica como está. */
export function codificarCabecalho(t) {
  if (ascii(t) && !/=\?/.test(t)) return t;
  const pedacos = []; let atual = '';
  for (const ch of t) { // por caractere: um acento nunca fica partido entre dois pedaços
    if (utf8(atual + ch).length > 45) { pedacos.push(atual); atual = ''; }
    atual += ch;
  }
  if (atual) pedacos.push(atual);
  return pedacos.map((p) => `=?UTF-8?B?${base64DeBytes(utf8(p))}?=`).join('\r\n ');
}

/** "Nome" <email> (nome com acento vai codificado). */
export function enderecoComNome(nome, email) {
  const n = texto(nome).replace(/[\r\n"\\]/g, ' ').trim();
  if (!n) return email;
  return `${ascii(n) ? `"${n}"` : codificarCabecalho(n)} <${email}>`;
}

const fronteira = () => `----=_imoveis_${base64DeBytes(crypto.getRandomValues(new Uint8Array(18))).replace(/[+/=]/g, 'x')}`;

/**
 * Mensagem completa em texto (só ASCII). `anexos`: { nome, tipo, base64 }.
 * Recusa quebra de linha em qualquer cabeçalho (injeção de cabeçalho: "Bcc:" escondido no assunto).
 */
export function montarMime({ de, nome = '', para = [], cco = [], assunto, texto: corpo = '', anexos = [], fronteira: f = fronteira() }) {
  for (const v of [de, nome, assunto, ...para, ...cco]) if (CONTROLE.test(texto(v))) throw new ErroEmail(400, 'Cabeçalho do e-mail com quebra de linha.');
  for (const e of [de, ...para, ...cco]) if (!emailValido(e)) throw new ErroEmail(400, `E-mail inválido: ${texto(e).slice(0, 80)}`);
  if (!para.length) throw new ErroEmail(400, 'Informe o e-mail do destinatário.');
  const cab = [
    `From: ${enderecoComNome(nome, de)}`,
    `To: ${para.join(', ')}`,
    ...(cco.length ? [`Bcc: ${cco.join(', ')}`] : []),
    `Subject: ${codificarCabecalho(texto(assunto))}`,
    'MIME-Version: 1.0',
  ];
  const textoCrlf = texto(corpo).replace(/\r\n|\r|\n/g, '\r\n');
  const parteTexto = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', linhas76(base64DeBytes(utf8(textoCrlf)))];
  if (!anexos.length) return [...cab, ...parteTexto, ''].join('\r\n');
  const partes = [...cab, `Content-Type: multipart/mixed; boundary="${f}"`, '', 'This is a multi-part message in MIME format.', '', `--${f}`, ...parteTexto];
  for (const a of anexos) {
    const n = nomeDeAnexo(a.nome);
    const simples = n.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/[";\\]/g, '') || 'anexo';
    const tipo = RE_TIPO.test(texto(a.tipo)) ? a.tipo : 'application/octet-stream';
    const codificado = encodeURIComponent(n).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    partes.push(`--${f}`,
      `Content-Type: ${tipo}; name="${simples}"`,
      `Content-Disposition: attachment; filename="${simples}"; filename*=UTF-8''${codificado}`,
      'Content-Transfer-Encoding: base64', '', linhas76(a.base64));
  }
  partes.push(`--${f}--`, '');
  return partes.join('\r\n');
}

const base64url = (t) => btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---------------------------------------------------------------------------
// Google: troca o refresh token por um access token (guardado em memória até perto de vencer) e envia
// ---------------------------------------------------------------------------
let tokenGuardado = { chave: '', valor: '', ate: 0 };
export const esquecerToken = () => { tokenGuardado = { chave: '', valor: '', ate: 0 }; };

const semRede = () => new ErroEmail(502, 'Não foi possível falar com o Gmail agora. Tente de novo daqui a pouco.');

export async function tokenDeAcesso(env, buscar = fetch, agora = Date.now()) {
  const chave = `${segredo(env, 'GMAIL_CLIENT_ID')}|${segredo(env, 'GMAIL_REFRESH_TOKEN')}`;
  if (tokenGuardado.chave === chave && tokenGuardado.ate > agora) return tokenGuardado.valor;
  let r;
  try {
    r = await buscar(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: segredo(env, 'GMAIL_CLIENT_ID'), client_secret: segredo(env, 'GMAIL_CLIENT_SECRET'),
        refresh_token: segredo(env, 'GMAIL_REFRESH_TOKEN'), grant_type: 'refresh_token',
      }).toString(),
    });
  } catch { throw semRede(); }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok || !dados.access_token) {
    if (dados.error === 'invalid_grant') throw new ErroEmail(503, 'A autorização do Gmail venceu ou foi retirada. É preciso gerar um token novo (documentacao/LIGAR_GMAIL.md).');
    if (dados.error === 'invalid_client' || dados.error === 'unauthorized_client') throw new ErroEmail(503, 'O código do aplicativo do Google (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET) está errado.');
    throw new ErroEmail(502, 'O Google não liberou o envio agora. Tente de novo daqui a pouco.');
  }
  const segundos = Number(dados.expires_in) > 0 ? Number(dados.expires_in) : 3600;
  tokenGuardado = { chave, valor: dados.access_token, ate: agora + Math.max(0, segundos - 120) * 1000 };
  return dados.access_token;
}

function erroDoGmail(status, dados) {
  const motivo = dados?.error?.errors?.[0]?.reason || dados?.error?.status || '';
  const detalhe = texto(dados?.error?.message).slice(0, 200);
  if (status === 429 || /rateLimit|dailyLimit|userRateLimit|RESOURCE_EXHAUSTED/i.test(motivo)) return new ErroEmail(429, 'Limite de envios do Gmail atingido. Tente de novo mais tarde.');
  if (status === 403 && /insufficient|PERMISSION_DENIED/i.test(motivo + detalhe)) return new ErroEmail(503, 'A autorização do Gmail não permite enviar e-mails. Gere o token de novo (documentacao/LIGAR_GMAIL.md).');
  if (status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|disabled/i.test(motivo + detalhe)) return new ErroEmail(503, 'A Gmail API não está ativada no projeto do Google Cloud.');
  if (status >= 500) return new ErroEmail(502, 'O Gmail está com problema agora. Tente de novo daqui a pouco.');
  return new ErroEmail(502, `O Gmail recusou o e-mail${detalhe ? ` (${detalhe})` : ''}.`);
}

/**
 * Envia. `pedido` como chega do site ({ para, cco, assunto, texto, anexos: [{ nome, tipo, base64 }] }).
 * Devolve { ok: true, id }. `simular`: só no computador (nuvem/local.mjs com SIMULAR_GMAIL=1), não fala com o Google.
 */
export async function enviarEmail(env, pedido, { buscar = fetch, simular = false, registrar = console.log } = {}) {
  const v = validarEnvio(pedido);
  const estado = estadoEmail(env, { simular });
  if (!estado.ligado) throw new ErroEmail(503, 'O envio pelo Gmail ainda não foi ligado.');
  const fixa = listaDeEmails(segredo(env, 'GMAIL_CCO'), { campo: 'cópia oculta (GMAIL_CCO)', maximo: MAX_DESTINATARIOS });
  const cco = [...new Set([...v.cco, ...fixa].map((e) => e.toLowerCase()))].filter((e) => !v.para.some((p) => p.toLowerCase() === e));
  const mime = montarMime({ de: estado.remetente, nome: segredo(env, 'GMAIL_NOME'), para: v.para, cco, assunto: v.assunto, texto: v.texto, anexos: v.anexos });
  if (simular) {
    registrar(`[gmail simulado] para ${v.para.join(', ')}${cco.length ? ` (cco ${cco.join(', ')})` : ''}: "${v.assunto}", ${v.anexos.length} anexo(s), ${mime.length} bytes`);
    return { ok: true, id: `simulado-${Date.now().toString(36)}` };
  }
  const tentar = async () => {
    const token = await tokenDeAcesso(env, buscar);
    const grande = mime.length > LIMITE_RAW;
    try {
      return await buscar(grande ? URL_ENVIO_GRANDE : URL_ENVIO, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': grande ? 'message/rfc822' : 'application/json' },
        body: grande ? mime : JSON.stringify({ raw: base64url(mime) }),
      });
    } catch { throw semRede(); }
  };
  let r = await tentar();
  if (r.status === 401) { esquecerToken(); r = await tentar(); } // token revogado antes da hora: pega outro uma vez
  const dados = await r.json().catch(() => ({}));
  if (!r.ok || !dados.id) throw erroDoGmail(r.status, dados);
  return { ok: true, id: dados.id };
}
