// Envio de e-mail pela conta Gmail da empresa (Gmail API, escopo gmail.send), chamado pelo Worker (rotas /api/email/…).
// Monta a mensagem (MIME) aqui mesmo, sem bibliotecas: só fetch, btoa, TextEncoder e WebCrypto (roda no Worker e no Node 22).
// Ligar: botão "Conectar o Gmail" (Dados e backup), fluxo OAuth 2.0 de aplicativo da Web com PKCE. O Worker troca o código pelo
// refresh token e o guarda CIFRADO no cofre (AES-GCM, chave tirada do GMAIL_CLIENT_SECRET por HKDF; tabela própria em
// gmail-conta.mjs): nunca no JSON do banco nem no navegador. Segredos do Worker: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
// GMAIL_REMETENTE e GMAIL_NOME (opcionais: sem remetente, sai pela própria conta ligada), GMAIL_CCO (opcional).
// GMAIL_REFRESH_TOKEN (jeito antigo, tools/gmail-token.mjs) continua valendo enquanto ninguém conectar pelo botão.
// Não grava o envio: o registro é do cofre (registrar-email) e do site. Passo a passo: documentacao/LIGAR_GMAIL.md.

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

const URL_AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const URL_REVOGAR = 'https://oauth2.googleapis.com/revoke';
/** Só enviar (não lê a caixa). "openid email" só para saber qual conta foi ligada (o e-mail vem na resposta do Google). */
export const ESCOPO_ENVIO = 'https://www.googleapis.com/auth/gmail.send';
export const ESCOPOS = ['openid', 'email', ESCOPO_ENVIO];
/** Caminho do endereço de retorno (o "URI de redirecionamento autorizado" da credencial no Google Cloud). */
export const CAMINHO_RETORNO = '/api/email/google/retorno';
/** O pedido de ligação (state) vale por 10 minutos e uma vez só (gmail-conta.mjs). */
export const VALIDADE_ESTADO = 10 * 60 * 1000;

/** Erro com a mensagem para o usuário (o Worker devolve { erro } com esse status). `codigo`: o aviso na volta do Google. */
export class ErroEmail extends Error {
  constructor(status, mensagem, codigo = 'erro') { super(mensagem); this.status = status; this.codigo = codigo; }
}

const texto = (v) => (v === undefined || v === null ? '' : String(v));
const segredo = (env, k) => texto(env?.[k]).trim();

/** A credencial do Google (Aplicativo da Web) está nos segredos do Worker? */
export const clienteConfigurado = (env) => !!(segredo(env, 'GMAIL_CLIENT_ID') && segredo(env, 'GMAIL_CLIENT_SECRET'));

/** Endereço de retorno que o administrador cola no Google Cloud (ex.: https://erp.ankjck.com.br/api/email/google/retorno). */
export const enderecoDeRetorno = (env, url = null) => `${texto(env?.ORIGEM || url?.origin || 'https://erp.ankjck.com.br').trim().replace(/\/+$/, '')}${CAMINHO_RETORNO}`;

/**
 * O envio está ligado? `conta`: a conta ligada pelo botão, já decifrada ({ refresh, email }, de contaGuardada); ela vale
 * antes do segredo antigo GMAIL_REFRESH_TOKEN. Remetente: GMAIL_REMETENTE ou, sem ele, a própria conta ligada.
 * `origem`: 'conta' (botão), 'segredo' (jeito antigo) ou null. `cliente`: GMAIL_CLIENT_ID e GMAIL_CLIENT_SECRET no Worker.
 */
export function estadoEmail(env, { simular = false, conta = null } = {}) {
  if (simular) return { ligado: true, remetente: segredo(env, 'GMAIL_REMETENTE') || 'administracao@exemplo.com.br', simulado: true, origem: 'simulado', conta: null, cliente: true };
  const cliente = clienteConfigurado(env);
  const pelaConta = !!conta?.refresh;
  const antigo = !pelaConta && !!segredo(env, 'GMAIL_REFRESH_TOKEN');
  const remetente = segredo(env, 'GMAIL_REMETENTE') || (pelaConta ? texto(conta.email).trim() : '');
  const ligado = cliente && (pelaConta || antigo) && !!remetente;
  return { ligado, remetente: ligado ? remetente : null, origem: pelaConta ? 'conta' : antigo ? 'segredo' : null, conta: pelaConta ? (texto(conta.email) || null) : null, cliente };
}

// ---------------------------------------------------------------------------
// Refresh token guardado no cofre, cifrado (AES-GCM 256; chave por HKDF-SHA256 do GMAIL_CLIENT_SECRET com sal sorteado)
// Trocar o Client Secret no Google = o guardado não abre mais: a tela pede "Conectar o Gmail" de novo.
// ---------------------------------------------------------------------------
const enc = new TextEncoder();
const INFO_CHAVE = enc.encode('erp-imoveis/gmail-refresh/v1');
const b64u = (bytes) => base64DeBytes(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function deB64u(t) {
  const s = atob(String(t).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(t).length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
const RE_CIFRADO = /^g1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{24,5000})$/;
export const cifradoValido = (t) => typeof t === 'string' && RE_CIFRADO.test(t);

async function chaveDoToken(env, sal) {
  const base = segredo(env, 'GMAIL_CLIENT_SECRET');
  if (!base) throw new ErroEmail(503, 'Falta o GMAIL_CLIENT_SECRET nos segredos do Cloudflare (documentacao/LIGAR_GMAIL.md).');
  const k = await crypto.subtle.importKey('raw', enc.encode(base), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: sal, info: INFO_CHAVE }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Refresh token → "g1.<sal>.<iv>.<cifrado>" (só isso vai ao cofre). */
export async function cifrarToken(env, token) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: INFO_CHAVE }, await chaveDoToken(env, sal), enc.encode(texto(token))));
  return `g1.${b64u(sal)}.${b64u(iv)}.${b64u(cifrado)}`;
}

/** O contrário de cifrarToken; null se não abre (outro Client Secret, texto mexido). */
export async function decifrarToken(env, cifrado) {
  const m = RE_CIFRADO.exec(texto(cifrado));
  if (!m || !clienteConfigurado(env)) return null;
  try {
    const aberto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64u(m[2]), additionalData: INFO_CHAVE }, await chaveDoToken(env, deB64u(m[1])), deB64u(m[3]));
    return new TextDecoder().decode(aberto) || null;
  } catch { return null; }
}

const cofreDe = (env) => env.COFRE.get(env.COFRE.idFromName('principal'));

/**
 * A conta ligada pelo botão, lida do cofre e decifrada: { refresh, email, ligado_em, ligado_por } ou null (nenhuma, sem cofre
 * ou cofre fora). `ilegivel: true` (refresh null): está guardada, mas não abre (o Client Secret mudou): conectar de novo.
 */
export async function contaGuardada(env) {
  if (!env?.COFRE) return null;
  let dados;
  try {
    const r = await cofreDe(env).fetch(new Request('https://cofre/gmail/conta'));
    if (!r.ok) return null;
    dados = await r.json();
  } catch { return null; }
  const c = dados?.conta;
  if (!c || !c.cifrado) return null;
  const refresh = await decifrarToken(env, c.cifrado);
  return { refresh, email: c.email || null, ligado_em: c.ligado_em || null, ligado_por: c.ligado_por || null, ilegivel: !refresh };
}

// ---------------------------------------------------------------------------
// "Entrar com o Google": endereço de autorização (state + PKCE), troca do código, revogação
// ---------------------------------------------------------------------------
/** Texto sorteado em base64url (32 bytes = 43 caracteres). */
export const sorteado = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
export const hashHex = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(texto(t))))].map((b) => b.toString(16).padStart(2, '0')).join('');
/** PKCE (RFC 7636): o verificador fica no cofre com o state; ao Google vai só o desafio (SHA-256). */
export async function pkce() {
  const verificador = sorteado();
  return { verificador, desafio: b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verificador)))) };
}

/** Endereço da tela de permissão do Google ("escolher a conta → Permitir"). */
export function urlDeAutorizacao(env, { state, desafio, retorno }) {
  const p = new URLSearchParams({
    client_id: segredo(env, 'GMAIL_CLIENT_ID'), redirect_uri: retorno, response_type: 'code', scope: ESCOPOS.join(' '),
    access_type: 'offline', prompt: 'consent', state, code_challenge: desafio, code_challenge_method: 'S256',
  });
  return `${URL_AUTORIZAR}?${p.toString()}`;
}

/** O e-mail da conta, do id_token que veio direto do Google (TLS, sem intermediário: OpenID Connect 3.1.3.7 dispensa a assinatura). */
function emailDoIdToken(env, idToken) {
  try {
    const dados = JSON.parse(new TextDecoder().decode(deB64u(texto(idToken).split('.')[1] || '')));
    const auds = Array.isArray(dados.aud) ? dados.aud : [dados.aud];
    if (!auds.includes(segredo(env, 'GMAIL_CLIENT_ID')) || !['accounts.google.com', 'https://accounts.google.com'].includes(dados.iss)) return null;
    if (dados.email_verified === false || !emailValido(dados.email)) return null;
    return String(dados.email).toLowerCase();
  } catch { return null; }
}

/** Revoga a autorização no Google (Desconectar). Devolve se o Google confirmou; falha de rede não impede apagar aqui. */
export async function revogarToken(token, buscar = fetch) {
  if (!texto(token)) return false;
  try {
    const r = await buscar(URL_REVOGAR, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: texto(token) }).toString() });
    return r.ok;
  } catch { return false; }
}

/**
 * Troca o código da volta do Google pelo refresh token. Devolve { refresh, email }. Recusa se a pessoa desmarcou a permissão
 * de enviar (o Google deixa escolher por caixa) ou se não veio o refresh token. Lança ErroEmail com `codigo` para o aviso.
 */
export async function trocarCodigo(env, { code, verificador, retorno }, buscar = fetch) {
  let r;
  try {
    r = await buscar(URL_TOKEN, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: texto(code), client_id: segredo(env, 'GMAIL_CLIENT_ID'), client_secret: segredo(env, 'GMAIL_CLIENT_SECRET'),
        redirect_uri: retorno, grant_type: 'authorization_code', code_verifier: texto(verificador),
      }).toString(),
    });
  } catch { throw new ErroEmail(502, 'Não foi possível falar com o Google agora.', 'sem-rede'); }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (dados.error === 'invalid_client' || dados.error === 'unauthorized_client') throw new ErroEmail(503, 'Client ID ou Client Secret errados.', 'credencial');
    if (dados.error === 'redirect_uri_mismatch') throw new ErroEmail(400, 'Endereço de retorno diferente do cadastrado no Google Cloud.', 'retorno');
    throw new ErroEmail(400, 'O Google recusou o código (vencido ou já usado).', 'erro');
  }
  const escopos = texto(dados.scope).split(/\s+/);
  if (!escopos.includes(ESCOPO_ENVIO)) {
    await revogarToken(dados.refresh_token || dados.access_token, buscar);
    throw new ErroEmail(400, 'A permissão de enviar e-mails não foi marcada.', 'sem-permissao');
  }
  if (!dados.refresh_token) throw new ErroEmail(502, 'O Google não mandou a autorização permanente.', 'erro');
  const email = emailDoIdToken(env, dados.id_token);
  if (!email) { await revogarToken(dados.refresh_token, buscar); throw new ErroEmail(502, 'O Google não disse qual conta foi ligada.', 'erro'); }
  return { refresh: dados.refresh_token, email };
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
  // versão HTML (opcional, ao lado do texto) e as imagens dela (a logo), pelo cid: <img src="cid:logo">
  const html = texto(pedido.html);
  if (html.length > MAX_TEXTO * 2) throw new ErroEmail(400, 'A versão HTML do e-mail é grande demais.');
  const brutasImg = Array.isArray(pedido.imagens) ? pedido.imagens : [];
  if (brutasImg.length > 3) throw new ErroEmail(400, 'No máximo 3 imagens no corpo do e-mail.');
  const imagens = html ? brutasImg.map((a) => {
    const base64 = texto(a?.base64);
    const cid = texto(a?.cid);
    if (!/^[a-z0-9-]{1,30}$/.test(cid) || !/^image\/(png|jpeg)$/.test(texto(a?.tipo)) || !base64 || base64.length % 4 !== 0 || !RE_BASE64.test(base64)) throw new ErroEmail(400, 'Imagem do e-mail inválida.');
    total += (base64.length / 4) * 3;
    return { cid, tipo: texto(a.tipo), base64 };
  }) : [];
  if (total > MAX_BYTES_ANEXOS) throw new ErroEmail(413, `Anexos passam de ${MAX_BYTES_ANEXOS / 1048576} MB.`);
  return { para, cco, assunto, texto: corpo, anexos, html, imagens };
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
export function montarMime({ de, nome = '', para = [], cco = [], assunto, texto: corpo = '', anexos = [], html = '', imagens = [], fronteira: f = fronteira() }) {
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
  const soTexto = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', linhas76(base64DeBytes(utf8(textoCrlf)))];
  // com HTML: multipart/alternative (texto e HTML); com imagens, o HTML vai num multipart/related junto delas
  let parteTexto = soTexto;
  if (html) {
    const fa = `${f}_alt`; const fr = `${f}_rel`;
    const parteHtml = ['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', linhas76(base64DeBytes(utf8(texto(html).replace(/\r\n|\r|\n/g, '\r\n'))))];
    const comImagens = imagens.length ? [`Content-Type: multipart/related; boundary="${fr}"`, '', `--${fr}`, ...parteHtml,
      ...imagens.flatMap((im) => [`--${fr}`, `Content-Type: ${im.tipo}`, 'Content-Transfer-Encoding: base64', `Content-ID: <${im.cid}>`,
        `Content-Disposition: inline; filename="${im.cid}.${im.tipo === 'image/png' ? 'png' : 'jpg'}"`, '', linhas76(im.base64)]),
      `--${fr}--`, ''] : parteHtml;
    parteTexto = [`Content-Type: multipart/alternative; boundary="${fa}"`, '', `--${fa}`, ...soTexto, `--${fa}`, ...comImagens, `--${fa}--`, ''];
  }
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

/** Access token (renovado sozinho a partir do refresh token: o da conta ligada pelo botão ou, sem ela, o segredo antigo). */
export async function tokenDeAcesso(env, buscar = fetch, agora = Date.now(), refresh = segredo(env, 'GMAIL_REFRESH_TOKEN')) {
  const chave = `${segredo(env, 'GMAIL_CLIENT_ID')}|${refresh}`;
  if (tokenGuardado.chave === chave && tokenGuardado.ate > agora) return tokenGuardado.valor;
  let r;
  try {
    r = await buscar(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: segredo(env, 'GMAIL_CLIENT_ID'), client_secret: segredo(env, 'GMAIL_CLIENT_SECRET'),
        refresh_token: refresh, grant_type: 'refresh_token',
      }).toString(),
    });
  } catch { throw semRede(); }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok || !dados.access_token) {
    if (dados.error === 'invalid_grant') throw new ErroEmail(503, 'A autorização do Gmail venceu ou foi retirada. O administrador precisa clicar em "Conectar o Gmail" de novo (Dados e backup → E-mail pelo Gmail).');
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
  if (status === 403 && /insufficient|PERMISSION_DENIED/i.test(motivo + detalhe)) return new ErroEmail(503, 'A autorização do Gmail não permite enviar e-mails. Clique em "Conectar o Gmail" de novo e marque a permissão de enviar e-mails.');
  if (status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|disabled/i.test(motivo + detalhe)) return new ErroEmail(503, 'A Gmail API não está ativada no projeto do Google Cloud.');
  if (status >= 500) return new ErroEmail(502, 'O Gmail está com problema agora. Tente de novo daqui a pouco.');
  return new ErroEmail(502, `O Gmail recusou o e-mail${detalhe ? ` (${detalhe})` : ''}.`);
}

/**
 * Envia. `pedido` como chega do site ({ para, cco, assunto, texto, anexos: [{ nome, tipo, base64 }] }).
 * Devolve { ok: true, id }. `simular`: só no computador (nuvem/local.mjs com SIMULAR_GMAIL=1), não fala com o Google.
 * `conta`: a conta ligada (contaGuardada); sem passar, é lida do cofre aqui.
 */
export async function enviarEmail(env, pedido, { buscar = fetch, simular = false, registrar = console.log, conta } = {}) {
  const v = validarEnvio(pedido);
  const ligada = conta !== undefined ? conta : simular ? null : await contaGuardada(env);
  const estado = estadoEmail(env, { simular, conta: ligada });
  if (!estado.ligado) throw new ErroEmail(503, 'O envio pelo Gmail ainda não foi ligado.');
  const fixa = listaDeEmails(segredo(env, 'GMAIL_CCO'), { campo: 'cópia oculta (GMAIL_CCO)', maximo: MAX_DESTINATARIOS });
  const cco = [...new Set([...v.cco, ...fixa].map((e) => e.toLowerCase()))].filter((e) => !v.para.some((p) => p.toLowerCase() === e));
  const mime = montarMime({ de: estado.remetente, nome: segredo(env, 'GMAIL_NOME'), para: v.para, cco, assunto: v.assunto, texto: v.texto, anexos: v.anexos, html: v.html, imagens: v.imagens });
  if (simular) {
    registrar(`[gmail simulado] para ${v.para.join(', ')}${cco.length ? ` (cco ${cco.join(', ')})` : ''}: "${v.assunto}", ${v.anexos.length} anexo(s), ${mime.length} bytes`);
    return { ok: true, id: `simulado-${Date.now().toString(36)}` };
  }
  const tentar = async () => {
    const token = await tokenDeAcesso(env, buscar, Date.now(), ligada?.refresh || segredo(env, 'GMAIL_REFRESH_TOKEN'));
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
