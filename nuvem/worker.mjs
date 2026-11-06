// Worker do Cloudflare: guarda o banco (imoveis-dados.json) e os anexos no R2, no lugar da pasta do OneDrive.
// Só entra quem passou pelo Cloudflare Access (e-mail na lista EMAILS). Não fala com o C6 (a ponte continua no computador).
// Rotas (todas em /api/): saude · dados/… (o cofre: tudo, mudancas, lote, resolver, faixa, contador, importar; cofre.mjs)
// · arquivos/<caminho> (GET/PUT/DELETE) · lista/<pasta>/ · mover.
// Detalhes e decisões: documentacao/ESTUDO_DADOS_NUVEM.md.

export { CofreDO } from './cofre.mjs'; // o Cloudflare exige a classe do Durable Object no arquivo principal
const RAIZES = ['arquivos', 'modelos', 'backups']; // pastas que existem na pasta de hoje
const SO_LEITURA = ['backups']; // backups só o cofre grava
const MAX_DADOS = 30 * 1024 * 1024; // carga inicial do banco inteiro
const MAX_ARQUIVO = 50 * 1024 * 1024;
const POR_PEDIDO = 200; // arquivos movidos por pedido (limite de chamadas do plano grátis)
const EXTENSOES_PROIBIDAS = /\.(html?|xhtml|svg|xml|mht|mhtml|m?js)$/i; // igual a nomeAnexavel (docs/js/armazenamento.js)
const TIPOS_ABRIR = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

class ErroHttp extends Error {
  constructor(status, mensagem, extra = {}) { super(mensagem); this.status = status; this.extra = extra; }
}

const json = (status, dados, cabecalhos = {}) => new Response(JSON.stringify(dados), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cabecalhos },
});

/**
 * Caminho dentro do R2 a partir do pedaço do endereço ("arquivos/Imóvel%201/foto.jpg").
 * Cada parte: sem "." ou "..", sem barra invertida nem caracteres de controle, até 200 caracteres.
 */
export function caminhoSeguro(trecho, { pasta = false } = {}) {
  const partes = String(trecho || '').split('/');
  if (pasta && partes[partes.length - 1] === '') partes.pop();
  if (!partes.length) throw new ErroHttp(400, 'Caminho vazio.');
  const limpas = partes.map((p) => {
    let t;
    try { t = decodeURIComponent(p); } catch { throw new ErroHttp(400, 'Caminho inválido.'); }
    // eslint-disable-next-line no-control-regex
    if (!t || t === '.' || t === '..' || t.length > 200 || /[\\\x00-\x1f\x7f]/.test(t) || t.includes('/')) throw new ErroHttp(400, 'Caminho inválido.');
    return t;
  });
  if (!RAIZES.includes(limpas[0])) throw new ErroHttp(404, 'Pasta desconhecida.');
  const chave = limpas.join('/');
  if (new TextEncoder().encode(chave).length > 900) throw new ErroHttp(400, 'Caminho longo demais.');
  return chave;
}

const raizDe = (chave) => chave.split('/')[0];
const nomeDe = (chave) => chave.slice(chave.lastIndexOf('/') + 1);

// ---------------------------------------------------------------------------
// Login: Cloudflare Access (JWT no cabeçalho Cf-Access-Jwt-Assertion), conferido aqui também
// ---------------------------------------------------------------------------
const b64url = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(t.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const textoB64 = (t) => JSON.parse(new TextDecoder().decode(b64url(t)));
let chavesCache = { equipe: '', ate: 0, chaves: [] };

async function chavesAccess(equipe, buscar) {
  if (chavesCache.equipe === equipe && chavesCache.ate > Date.now()) return chavesCache.chaves;
  const r = await buscar(`https://${equipe}/cdn-cgi/access/certs`);
  if (!r.ok) throw new ErroHttp(503, 'Não foi possível conferir o login (Access).');
  const { keys = [] } = await r.json();
  chavesCache = { equipe, ate: Date.now() + 60 * 60 * 1000, chaves: keys };
  return keys;
}

/** Confere o login e devolve o e-mail. Sem Access configurado, recusa (exceto MODO_TESTE=1, só para os testes locais). */
export async function conferirLogin(request, env, buscar = fetch) {
  // Modo de teste (sem login) só vale no próprio computador: publicado por engano com MODO_TESTE=1, continua pedindo login
  if (env.MODO_TESTE === '1' && ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname)) return env.EMAIL_TESTE || 'teste@exemplo.com.br';
  const equipe = String(env.ACCESS_EQUIPE || '').trim(); // ex.: ankjck.cloudflareaccess.com
  const aud = String(env.ACCESS_AUD || '').trim();
  const emails = String(env.EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!equipe || !aud || !emails.length) throw new ErroHttp(503, 'Worker sem configuração de login (ACCESS_EQUIPE, ACCESS_AUD, EMAILS).');
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
  const partes = token.split('.');
  if (partes.length !== 3) throw new ErroHttp(401, 'Entre de novo (login do Access).');
  let cab, dados;
  try { cab = textoB64(partes[0]); dados = textoB64(partes[1]); } catch { throw new ErroHttp(401, 'Login inválido.'); }
  if (cab.alg !== 'RS256') throw new ErroHttp(401, 'Login inválido.');
  const jwk = (await chavesAccess(equipe, buscar)).find((k) => k.kid === cab.kid);
  if (!jwk) { chavesCache.ate = 0; throw new ErroHttp(401, 'Login inválido.'); }
  const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, b64url(partes[2]), new TextEncoder().encode(`${partes[0]}.${partes[1]}`));
  const agora = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(dados.aud) ? dados.aud : [dados.aud];
  if (!ok || !auds.includes(aud) || dados.iss !== `https://${equipe}` || !(dados.exp > agora) || (dados.nbf && dados.nbf > agora + 60)) throw new ErroHttp(401, 'Login inválido ou vencido.');
  const email = String(dados.email || '').toLowerCase();
  if (!emails.includes(email)) throw new ErroHttp(403, 'Este e-mail não tem acesso ao sistema.');
  return email;
}

/** Pedido que grava precisa do cabeçalho X-Sistema (força a checagem do navegador contra outros sites) e da mesma origem. */
function conferirGravacao(request, env) {
  if (request.headers.get('X-Sistema') !== 'imoveis') throw new ErroHttp(403, 'Pedido recusado.');
  const origem = request.headers.get('Origin');
  const permitida = String(env.ORIGEM || 'https://erp.ankjck.com.br');
  if (origem && origem !== permitida) throw new ErroHttp(403, 'Pedido recusado (origem).');
}

async function lerCorpo(request, maximo) {
  const declarado = Number(request.headers.get('Content-Length') || 0);
  if (declarado > maximo) throw new ErroHttp(413, `Arquivo grande demais (máximo ${Math.round(maximo / 1048576)} MB).`);
  const corpo = await request.arrayBuffer();
  if (corpo.byteLength > maximo) throw new ErroHttp(413, `Arquivo grande demais (máximo ${Math.round(maximo / 1048576)} MB).`);
  return corpo;
}

// ---------------------------------------------------------------------------
// Dados: repassa ao cofre (Durable Object), com o e-mail já conferido; o Worker não lê o conteúdo (limite de 10 ms)
// ---------------------------------------------------------------------------
const ROTAS_COFRE = { tudo: 'GET', mudancas: 'GET', conflitos: 'GET', lote: 'POST', resolver: 'POST', faixa: 'POST', contador: 'POST', importar: 'POST' };

async function repassarAoCofre(request, env, rota, email, url) {
  if (ROTAS_COFRE[rota] !== request.method) throw new ErroHttp(404, 'Não encontrado.');
  if (!env.COFRE) throw new ErroHttp(503, 'Worker sem o cofre ligado (binding COFRE).');
  let corpo;
  if (request.method === 'POST') {
    conferirGravacao(request, env);
    corpo = await lerCorpo(request, rota === 'importar' ? MAX_DADOS : 8 * 1024 * 1024);
  }
  const cofre = env.COFRE.get(env.COFRE.idFromName('principal')); // um cofre só: as filas entram uma por vez
  return cofre.fetch(new Request(`https://cofre/${rota}${url.search}`, {
    method: request.method, body: corpo, headers: { 'Content-Type': 'application/json', 'X-Email-Conferido': email },
  }));
}

// ---------------------------------------------------------------------------
// Arquivos (anexos, modelo da NF, backups)
// ---------------------------------------------------------------------------
async function listarTudo(env, prefixo, delimitador) {
  const objetos = []; const pastas = [];
  let cursor;
  do {
    const r = await env.DADOS.list({ prefix: prefixo, delimiter: delimitador, cursor, limit: 1000 });
    objetos.push(...r.objects); pastas.push(...(r.delimitedPrefixes || []));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return delimitador ? { objetos, pastas } : objetos;
}

async function lerArquivo(env, chave) {
  const obj = await env.DADOS.get(chave);
  if (!obj) return json(404, { erro: 'Arquivo não encontrado.' });
  const nome = nomeDe(chave);
  const ext = (nome.match(/\.([a-z0-9]+)$/i) || [])[1];
  const tipo = (ext && TIPOS_ABRIR[ext.toLowerCase()]) || '';
  return new Response(obj.body, {
    headers: {
      'Content-Type': tipo || 'application/octet-stream',
      'Content-Disposition': `${tipo ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Content-Length': String(obj.size), ETag: obj.httpEtag, 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}

async function gravarArquivo(request, env, chave, email) {
  conferirGravacao(request, env);
  if (SO_LEITURA.includes(raizDe(chave))) throw new ErroHttp(403, 'Os backups não podem ser alterados.');
  if (EXTENSOES_PROIBIDAS.test(nomeDe(chave))) throw new ErroHttp(415, 'Este tipo de arquivo não pode ser anexado (página ou script: .html, .svg, .xml, .js). Salve como PDF ou imagem e anexe de novo.');
  const corpo = await lerCorpo(request, MAX_ARQUIVO);
  const seNovo = request.headers.get('If-None-Match') === '*';
  const gravado = seNovo && (await env.DADOS.head(chave)) ? null : await env.DADOS.put(chave, corpo, { customMetadata: { por: email } });
  if (!gravado) throw new ErroHttp(412, 'Já existe um arquivo com esse nome.');
  return json(200, { ok: true, nome: nomeDe(chave), tamanho: corpo.byteLength });
}

async function apagarArquivo(request, env, chave) {
  conferirGravacao(request, env);
  if (SO_LEITURA.includes(raizDe(chave))) throw new ErroHttp(403, 'Os backups não podem ser alterados.');
  await env.DADOS.delete(chave);
  return json(200, { ok: true });
}

/** Conteúdo de uma pasta: subpastas e arquivos (nome e tamanho), como `listar`/`subpastas` da pasta. */
async function listarPasta(env, chave) {
  const prefixo = `${chave}/`;
  const { objetos, pastas } = await listarTudo(env, prefixo, '/');
  const porNome = (a, b) => a.localeCompare(b, 'pt-BR');
  return json(200, {
    pastas: pastas.map((p) => p.slice(prefixo.length, -1)).sort(porNome),
    arquivos: objetos.map((o) => ({ nome: o.key.slice(prefixo.length), tamanho: o.size })).sort((a, b) => porNome(a.nome, b.nome)),
  });
}

/**
 * Move uma pasta (ou um arquivo) para outro lugar: { de, para, juntar }.
 * Sem "juntar", recusa se o destino já tiver algo; com "juntar", move o que não existe no destino e devolve o que sobrou.
 * O R2 não tem "mover": copia e apaga, um arquivo por vez (se cair no meio, repetir termina o serviço).
 * O plano grátis deixa ~1000 chamadas ao R2 por pedido: move até POR_PEDIDO arquivos e responde `mais: true` para o site repetir.
 */
async function mover(request, env) {
  conferirGravacao(request, env);
  let pedido;
  try { pedido = JSON.parse(new TextDecoder().decode(await lerCorpo(request, 64 * 1024))); } catch { throw new ErroHttp(400, 'Pedido inválido.'); }
  const de = caminhoSeguro(pedido?.de, { pasta: true });
  const para = caminhoSeguro(pedido?.para, { pasta: true });
  if ([de, para].some((c) => SO_LEITURA.includes(raizDe(c)))) throw new ErroHttp(403, 'Os backups não podem ser alterados.');
  if (de === para) return json(200, { ok: true, movidos: 0, sobraram: [] });
  if (para.startsWith(`${de}/`)) throw new ErroHttp(400, 'Não dá para mover uma pasta para dentro dela mesma.'); // ver destinoPerigoso
  const arquivoSo = await env.DADOS.head(de);
  const itens = arquivoSo ? [{ key: de, rel: '' }] : (await listarTudo(env, `${de}/`)).map((o) => ({ key: o.key, rel: o.key.slice(de.length) }));
  if (!itens.length) throw new ErroHttp(404, 'Nada para mover.');
  const destinos = itens.slice(0, POR_PEDIDO).map((i) => ({ ...i, novo: `${para}${i.rel}` }));
  const existentes = new Set();
  for (const d of destinos) if (await env.DADOS.head(d.novo)) existentes.add(d.novo);
  if (existentes.size && !pedido.juntar) throw new ErroHttp(409, 'Já existe uma pasta ou arquivo com esse nome no destino.');
  let movidos = 0; const sobraram = [];
  for (const d of destinos) {
    if (existentes.has(d.novo)) { sobraram.push(d.rel.replace(/^\//, '') || nomeDe(d.key)); continue; }
    const obj = await env.DADOS.get(d.key);
    if (!obj) continue;
    await env.DADOS.put(d.novo, await obj.arrayBuffer(), { httpMetadata: obj.httpMetadata, customMetadata: obj.customMetadata });
    await env.DADOS.delete(d.key);
    movidos += 1;
  }
  return json(200, { ok: true, movidos, sobraram, mais: itens.length > POR_PEDIDO });
}

/** Anexos seguem o papel do usuário no sistema (o cofre sabe): ler = qualquer usuário ativo; gravar/apagar/mover = operador ou admin. */
async function exigirPapel(env, email, nivel) {
  if (env.MODO_TESTE === '1' && !env.COFRE) return; // testes dos anexos sem cofre
  if (!env.COFRE) throw new ErroHttp(503, 'Worker sem o cofre ligado (binding COFRE).');
  const r = await env.COFRE.get(env.COFRE.idFromName('principal')).fetch(new Request(`https://cofre/papel?nivel=${nivel}`, { headers: { 'X-Email-Conferido': email } }));
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new ErroHttp(r.status, e.erro || 'Sem permissão.'); }
}

// ---------------------------------------------------------------------------
export async function atender(request, env, buscar = fetch) {
  const url = new URL(request.url);
  const rota = url.pathname.replace(/^\/api\/?/, '');
  if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return json(404, { erro: 'Não encontrado.' });
  try {
    if (!env.DADOS) throw new ErroHttp(503, 'Worker sem o R2 ligado (binding DADOS).');
    if (request.method === 'OPTIONS') throw new ErroHttp(405, 'Método não aceito.'); // sem CORS: só o próprio site chama
    const email = await conferirLogin(request, env, buscar);
    const m = request.method;
    if (rota === 'saude' && m === 'GET') return json(200, { ok: true, email, teste: env.MODO_TESTE === '1' });
    if (rota.startsWith('dados/')) return await repassarAoCofre(request, env, rota.slice(6), email, url);
    if (rota === 'mover' && m === 'POST') { await exigirPapel(env, email, 'operador'); return await mover(request, env); }
    if (rota.startsWith('lista/') && m === 'GET') { await exigirPapel(env, email, 'consulta'); return await listarPasta(env, caminhoSeguro(rota.slice(6), { pasta: true })); }
    if (rota.startsWith('arquivos/') || rota.startsWith('modelos/') || rota.startsWith('backups/')) {
      const chave = caminhoSeguro(rota);
      await exigirPapel(env, email, m === 'GET' ? 'consulta' : 'operador');
      if (m === 'GET') return await lerArquivo(env, chave);
      if (m === 'PUT') return await gravarArquivo(request, env, chave, email);
      if (m === 'DELETE') return await apagarArquivo(request, env, chave);
    }
    return json(404, { erro: 'Não encontrado.' });
  } catch (e) {
    if (e instanceof ErroHttp) return json(e.status, { erro: e.message, ...e.extra });
    console.error(e);
    return json(500, { erro: 'Erro no servidor da nuvem.' });
  }
}

export default { fetch: (request, env) => atender(request, env) };
