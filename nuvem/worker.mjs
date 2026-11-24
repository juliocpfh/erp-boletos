// Worker do Cloudflare: guarda o banco (imoveis-dados.json) e os anexos no R2, no lugar da pasta do OneDrive.
// Só entra quem passou pelo Cloudflare Access (lista de e-mails no painel) e tem usuário ativo com esse e-mail no sistema (o cofre confere). Não fala com o C6 (a ponte continua no computador).
// Rotas (todas em /api/): saude · dados/… (o cofre: tudo, mudancas, lote, resolver, faixa, contador, importar; cofre.mjs)
// · arquivos/<caminho> (GET/PUT/DELETE) · lista/<pasta>/ · lista-tudo/<pasta>/ (tudo de uma vez, em partes) · mover · apagar
// · icone-192.png / icone-512.png (GET: ícone do aplicativo, o da logo ou o padrão) · icone/192 e icone/512 (PUT) · icone (DELETE)
// · email/estado (GET) e email/enviar (POST): e-mail pela conta Gmail da empresa (gmail.mjs; documentacao/LIGAR_GMAIL.md).
//   email/google/conectar (POST, administrador: devolve o endereço da permissão do Google), email/google/retorno (GET: a volta
//   do Google, no mesmo navegador já logado no Access; troca o código e guarda a autorização cifrada no cofre) e
//   email/google/desconectar (POST, administrador: apaga e revoga). gmail-conta.mjs guarda.
// · aparelho/… (sem o login do Access: política Bypass só neste caminho): o programa do PC entra com e-mail e senha
//   (aparelho/entrar) e depois só LÊ com o crachá do aparelho (Authorization: Bearer ap1_…): saude, dados/tudo, dados/mudancas,
//   lista/, lista-tudo/, arquivos/, modelos/, backups/ e programa (a versão PC). aparelhos.mjs; atualizador-pc/README.md.
// · dados/aparelhos (GET) e dados/desligar-aparelho (POST): "Aparelhos ligados" em Usuários (com o login do Access);
//   dados/verificador-aparelho (POST): o site manda o verificador da senha para ligar o programa do PC (aparelhos.mjs).
// · dados/chave-backup (POST, administrador): a chave pública do backup seguro, para os backups diários saírem cifrados (cifrar-backup.mjs).
// · dados/backup-seguro (GET) e dados/backup-seguro-feito (POST, administrador): quando foi a última cópia do backup seguro e por quem.
// · dados/acessos (GET, administrador): o registro de acessos (tela Acessos). O Worker anota no cofre quem abriu, anexou,
//   apagou ou moveu arquivos, baixou backups, mandou e-mail e usou a ficha pela internet (anotarAcesso); o cofre anota
//   sozinho dados/tudo, a carga/substituição e a entrada do programa do PC.
// · contatos/… (link, lista, encerrar): o comunicado com confirmação de contatos (contatos-publico.mjs; página em /contatos no
//   endereço da ficha).
// · aceite-reserva/… (link, ler, encerrar): o termo de aceite da reserva (aceite-reserva.mjs; página em /reserva no endereço
//   da ficha).
// · ficha-online/… (link, pdf, lista, atualizar): a ficha cadastral pela internet (ficha-publica.mjs). O endereço da ficha
//   (HOST_FICHA, ficha.ankjck.com.br) não passa pelo login: lá só respondem a página e as rotas /api/publico/ da ficha.
// Detalhes e decisões: documentacao/ESTUDO_DADOS_NUVEM.md.

import { crachaValido, ERRO_ENTRAR, hashDoCracha } from './aparelhos.mjs';
import { avisar } from './avisos-ficha.mjs';
import { SO_SE_NOVO, atenderEquipe, atenderFicha, lerAteLimite } from './ficha-publica.mjs';
import { atenderEquipeContatos } from './contatos-publico.mjs';
import { atenderEquipeAceite } from './aceite-reserva.mjs';
import { ErroAssinatura, atenderAparelhoAssinaturas, atenderEquipeAssinaturas } from './assinaturas.mjs';
import {
  ErroEmail, MAX_BYTES_ANEXOS, MAX_PEDIDO, cifrarToken, clienteConfigurado, contaGuardada, decifrarToken, enderecoDeRetorno, enviarEmail,
  esquecerToken, estadoEmail, hashHex, pkce, revogarToken, sorteado, trocarCodigo, urlDeAutorizacao, validarEnvio,
} from './gmail.mjs';
import { atenderVendas, ehEnderecoDeVendas } from './painel-vendas.mjs';
import { guardarVersaoAnterior, paraLixeira } from './lixeira.mjs';
export { CofreDO } from './cofre.mjs'; // o Cloudflare exige a classe do Durable Object no arquivo principal
export { CofreLicencasDO } from './cofre-licencas.mjs'; // licenças (painel de vendas, HOST_VENDAS): separado dos dados
const RAIZES = ['arquivos', 'modelos', 'backups']; // pastas que existem na pasta de hoje
const SO_LEITURA = ['backups']; // backups só o cofre grava
const MAX_DADOS = 30 * 1024 * 1024; // carga inicial do banco inteiro
const MAX_ARQUIVO = 50 * 1024 * 1024;
const POR_PEDIDO = 200; // arquivos movidos por pedido (limite de chamadas do plano grátis)
const POR_PEDIDO_LIXEIRA = 250; // arquivos levados à lixeira por pedido (3 chamadas ao R2 cada)
const MOVER_JUNTOS = 3; // arquivos movidos ao mesmo tempo: cada um segura 2 ligações (ler e gravar) e o Worker só abre 6 de cada vez
const LISTA_TUDO_POR_PEDIDO = 5000; // arquivos por resposta de lista-tudo (5 chamadas ao R2 por pedido)
const VALIDADE_PAPEL = 60 * 1000; // ms: o papel conferido no cofre vale por 1 min (o Painel faz muitos pedidos de anexos seguidos)
const EXTENSOES_PROIBIDAS = /\.(html?|xht(ml)?|svgz?|xml|xsl|xslt|mht|mhtml|m?js|jse|exe|com|bat|cmd|ps1|psm1|vbs|vbe|wsf|wsh|hta|lnk|scr|msi|msp|dll|cpl|pif|reg|jar|url|scf|inf|chm|application|appx|msix|gadget|iso|img|vhdx?)$/i; // igual a nomeAnexavel (docs/js/armazenamento.js)
/** Nome que não pode ser gravado (página, script ou programa); pontos e espaços no fim não escondem a extensão. */
const nomeProibido = (nome) => EXTENSOES_PROIBIDAS.test(String(nome || '').replace(/[. ]+$/, ''));
const ERRO_TIPO = 'Este tipo de arquivo não pode ser anexado (página, script ou programa: .html, .svg, .xml, .js, .exe…). Salve como PDF ou imagem e anexe de novo.';
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
  if (!equipe || !aud) { console.error('Worker sem configuração de login (ACCESS_EQUIPE, ACCESS_AUD)'); throw new ErroHttp(503, 'O login ainda não foi configurado neste endereço.'); }
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
  // Chave de serviço (atualizador-pc/): o Access assina um token sem e-mail, com o Client ID em `common_name`;
  // SERVICOS (segredo do Worker: "<client id>=<e-mail>,…") diz com qual usuário do sistema ela entra (os papéis valem iguais)
  const servico = !dados.email && !!dados.common_name;
  const email = String(dados.email || (servico ? emailDoServico(env, dados.common_name) : '')).toLowerCase();
  // a chave de serviço (transição do programa do PC) só lê, como o crachá: gravar e apagar exigem o login de uma pessoa
  if (servico && !['GET', 'HEAD'].includes(request.method)) throw new ErroHttp(403, 'A chave de serviço só lê: para gravar, entre no site.');
  // EMAILS é opcional (trava extra): quem manda é a lista do Access e o cadastro de usuários do sistema
  if (!email || !naListaDeEmails(env, email)) throw new ErroHttp(403, 'Este e-mail não tem acesso ao sistema.');
  return email;
}

/** EMAILS (opcional) é uma trava extra; vazia, vale só o cadastro de usuários. */
function naListaDeEmails(env, email) {
  const emails = String(env.EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return !emails.length || emails.includes(String(email || '').trim().toLowerCase());
}

/** E-mail ligado a uma chave de serviço do Access (variável SERVICOS), ou '' se a chave não está cadastrada. */
export function emailDoServico(env, clientId) {
  for (const par of String(env.SERVICOS || '').split(',')) {
    const [id, email] = par.split('=').map((x) => (x || '').trim());
    if (id && email && id === String(clientId).trim()) return email;
  }
  return '';
}

/** Pedido que grava precisa do cabeçalho X-Sistema (força a checagem do navegador contra outros sites) e da mesma origem. */
function conferirGravacao(request, env) {
  if (request.headers.get('X-Sistema') !== 'imoveis') throw new ErroHttp(403, 'Pedido recusado.');
  const origem = request.headers.get('Origin');
  const permitida = String(env.ORIGEM || 'https://erp.ankjck.com.br');
  if (origem && origem !== permitida) throw new ErroHttp(403, 'Pedido recusado (origem).');
}

/** Corpo do pedido, lido aos pedaços e contado (lerAteLimite): não confia só no tamanho declarado. */
async function lerCorpo(request, maximo) {
  const corpo = await lerAteLimite(request, maximo);
  if (!corpo) throw new ErroHttp(413, `Arquivo grande demais (máximo ${Math.round(maximo / 1048576)} MB).`);
  return corpo;
}

// ---------------------------------------------------------------------------
// Dados: repassa ao cofre (Durable Object), com o e-mail já conferido; o Worker não lê o conteúdo (limite de 10 ms)
// ---------------------------------------------------------------------------
const ROTAS_COFRE = { tudo: 'GET', mudancas: 'GET', conflitos: 'GET', lote: 'POST', resolver: 'POST', faixa: 'POST', contador: 'POST', importar: 'POST', aparelhos: 'GET', 'desligar-aparelho': 'POST', 'verificador-aparelho': 'POST', 'chave-backup': 'POST', 'backup-seguro': 'GET', 'backup-seguro-feito': 'POST', acessos: 'GET' };
const cofreDe = (env) => env.COFRE.get(env.COFRE.idFromName('principal')); // um cofre só: as filas entram uma por vez

async function repassarAoCofre(request, env, rota, email, url, origem = 'site') {
  if (ROTAS_COFRE[rota] !== request.method) throw new ErroHttp(404, 'Não encontrado.');
  if (!env.COFRE) throw new ErroHttp(503, 'Worker sem o cofre ligado (binding COFRE).');
  let corpo;
  if (request.method === 'POST') {
    conferirGravacao(request, env);
    corpo = await lerCorpo(request, rota === 'importar' ? MAX_DADOS : 8 * 1024 * 1024);
  }
  return cofreDe(env).fetch(new Request(`https://cofre/${rota}${url.search}`, {
    method: request.method, body: corpo, headers: { 'Content-Type': 'application/json', 'X-Email-Conferido': email, 'X-Ip': ipDe(request), 'X-Origem': origem },
  }));
}

// ---------------------------------------------------------------------------
// Registro de acessos: juntados aqui e mandados ao cofre em grupos (uma ida ao cofre a cada ACESSOS_POR_ENVIO, ou depois de
// ESPERA_ACESSOS, ou na hora quando é importante), sem segurar a resposta (waitUntil). Sem ctx (testes, nuvem local), na hora.
// ---------------------------------------------------------------------------
const ipDe = (request) => request.headers.get('CF-Connecting-IP') || '';
export const ACESSOS_POR_ENVIO = 25;
const ESPERA_ACESSOS = 15000;
let acessosJuntos = []; let juntosDesde = 0;
export const esquecerAcessos = () => { acessosJuntos = []; juntosDesde = 0; };

/**
 * O que entra no registro: arquivos (abrir, anexar, apagar), backups (lista e baixar), mover, apagar pasta, e-mail e ficha pela
 * internet. Devolve [rota anotada, importante] ou null. Abrir modelos e ícones e as listas de anexos (pedidas a cada tela) não entram.
 */
export function rotaDoRegistro(rota, metodo) {
  if (rota.startsWith('arquivos/')) return [`${metodo === 'GET' || metodo === 'HEAD' ? '' : `${metodo} `}${rota}`, metodo !== 'GET'];
  if (rota.startsWith('backups/')) return [rota, true];
  if (/^lista(-tudo)?\/backups(\/|$)/.test(rota)) return [rota, false];
  if (rota === 'mover' || rota === 'apagar') return [rota, true];
  if (rota === 'email/enviar') return [rota, true];
  if (rota.startsWith('email/google/')) return [rota, true]; // ligar e desligar o Gmail (só o caminho: o código do Google não entra)
  if (rota.startsWith('ficha-online/')) return [`${metodo === 'GET' ? '' : `${metodo} `}${rota}`, metodo !== 'GET'];
  if (rota.startsWith('contatos/')) return [`${metodo === 'GET' ? '' : `${metodo} `}${rota}`, metodo !== 'GET'];
  if (rota.startsWith('aceite-reserva/')) return [`${metodo === 'GET' ? '' : `${metodo} `}${rota}`, metodo !== 'GET'];
  return null;
}

/** Anota o acesso (se a rota é das registradas) com o tamanho da resposta ou do envio. */
export function anotarAcesso(env, ctx, request, rota, email, resposta, origem = 'site', bytesEnviados = null) {
  if (!env.COFRE || !email || !resposta) return undefined;
  const r = rotaDoRegistro(rota, request.method);
  if (!r) return undefined;
  const tamanho = bytesEnviados ?? (Number(resposta.headers.get('Content-Length')) || (resposta.status === 304 ? 0 : null));
  acessosJuntos.push({ em: new Date().toISOString(), email, rota: decodeURIComponentSeguro(r[0]), bytes: tamanho, ip: ipDe(request), origem, resultado: resposta.status });
  if (!juntosDesde) juntosDesde = Date.now();
  if (ctx?.waitUntil && !r[1] && acessosJuntos.length < ACESSOS_POR_ENVIO && Date.now() - juntosDesde < ESPERA_ACESSOS) return undefined;
  const lote = acessosJuntos.splice(0); juntosDesde = 0;
  const p = cofreDe(env).fetch(new Request('https://cofre/registrar-acessos', { method: 'POST', body: JSON.stringify({ acessos: lote }), headers: { 'Content-Type': 'application/json' } }))
    .then((x) => { if (!x.ok) console.error('registro de acessos', x.status); }).catch((e) => console.error('registro de acessos', e));
  if (ctx?.waitUntil) { ctx.waitUntil(p); return undefined; }
  return p;
}
const decodeURIComponentSeguro = (t) => { try { return decodeURIComponent(t); } catch { return t; } };

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

/** O arquivo guardado no navegador ainda é o mesmo? (If-None-Match com a etiqueta de agora, com ou sem W/, ou "*") */
const mesmaEtiqueta = (se, etiqueta) => !!se && se.split(',').map((x) => x.trim().replace(/^W\//, '')).some((x) => x === '*' || x === etiqueta);
const CACHE_ANEXO = 'private, no-store'; // documentos pessoais: o navegador não guarda em disco (o site busca sempre de novo)

async function lerArquivo(env, chave, request = null) {
  const se = request ? request.headers.get('If-None-Match') : null;
  if (se) { // só o navegador que já tem o arquivo manda isso: confere pela etiqueta, sem baixar do R2
    const cab = await env.DADOS.head(chave);
    if (cab && mesmaEtiqueta(se, cab.httpEtag)) return new Response(null, { status: 304, headers: { ETag: cab.httpEtag, 'Cache-Control': CACHE_ANEXO } });
  }
  const obj = await env.DADOS.get(chave);
  if (!obj) return json(404, { erro: 'Arquivo não encontrado.' });
  const nome = nomeDe(chave);
  const ext = (nome.match(/\.([a-z0-9]+)$/i) || [])[1];
  const tipo = (ext && TIPOS_ABRIR[ext.toLowerCase()]) || '';
  return new Response(obj.body, {
    headers: {
      'Content-Type': tipo || 'application/octet-stream',
      'Content-Disposition': `${tipo ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Content-Length': String(obj.size), ETag: obj.httpEtag, 'Cache-Control': CACHE_ANEXO,
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}

async function gravarArquivo(request, env, chave, email) {
  conferirGravacao(request, env);
  if (SO_LEITURA.includes(raizDe(chave))) throw new ErroHttp(403, 'Os backups não podem ser alterados.');
  if (nomeProibido(nomeDe(chave))) throw new ErroHttp(415, ERRO_TIPO);
  const corpo = await lerCorpo(request, MAX_ARQUIVO);
  const seNovo = request.headers.get('If-None-Match') === '*';
  // por cima de um arquivo que já existe: a versão de antes vai para a lixeira (item 24; o R2 não guarda versões)
  if (!seNovo) await guardarVersaoAnterior(env.DADOS, chave, { por: email });
  // "só se novo" numa chamada só ao R2: dois aparelhos com o mesmo nome ao mesmo tempo, um grava e o outro recebe o 412
  const gravado = await env.DADOS.put(chave, corpo, { ...(seNovo ? SO_SE_NOVO() : {}), customMetadata: { por: email } });
  if (!gravado) throw new ErroHttp(412, 'Já existe um arquivo com esse nome.');
  return json(200, { ok: true, nome: nomeDe(chave), tamanho: corpo.byteLength });
}

async function apagarArquivo(request, env, chave, email = '') {
  conferirGravacao(request, env);
  if (SO_LEITURA.includes(raizDe(chave))) throw new ErroHttp(403, 'Os backups não podem ser alterados.');
  await paraLixeira(env.DADOS, chave, { por: email }); // fica DIAS_LIXEIRA dias em lixeira/ (lixeira.mjs)
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
 * Tudo que há dentro de uma pasta, com as subpastas (caminho relativo e tamanho), numa resposta só: o Painel confere os
 * arquivos de todos os lançamentos sem pedir pasta por pasta. Pasta grande vai em partes: `mais: true` e `cursor` para continuar.
 */
async function listarPastaInteira(env, chave, cursorInicial) {
  const prefixo = `${chave}/`;
  const arquivos = [];
  let cursor = cursorInicial || undefined; let truncado = false;
  do {
    const r = await env.DADOS.list({ prefix: prefixo, cursor, limit: 1000 });
    for (const o of r.objects) arquivos.push({ caminho: o.key.slice(prefixo.length), tamanho: o.size, alterado: o.uploaded ? new Date(o.uploaded).toISOString() : '' }); // alterado: a cópia aberta do PC vê arquivo trocado com o mesmo tamanho
    truncado = !!r.truncated; cursor = truncado ? r.cursor : undefined;
  } while (cursor && arquivos.length < LISTA_TUDO_POR_PEDIDO);
  return json(200, { arquivos, mais: truncado, cursor: truncado ? cursor : undefined });
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
  // o nome novo passa pela mesma regra do PUT (senão um .txt viraria .html, que o PUT recusa)
  if (destinos.some((d) => nomeProibido(nomeDe(d.novo)))) throw new ErroHttp(415, ERRO_TIPO);
  // o que já existe no destino: uma listagem (em vez de perguntar arquivo por arquivo); arquivo só, uma pergunta
  const noDestino = arquivoSo ? ((await env.DADOS.head(para)) ? [para] : []) : (await listarTudo(env, `${para}/`)).map((o) => o.key);
  const ocupados = new Set(noDestino);
  const existentes = new Set(destinos.filter((d) => ocupados.has(d.novo)).map((d) => d.novo));
  if (existentes.size && !pedido.juntar) throw new ErroHttp(409, 'Já existe uma pasta ou arquivo com esse nome no destino.');
  let movidos = 0; const sobraram = [];
  const moverUm = async (d) => {
    const obj = await env.DADOS.get(d.key);
    if (!obj) return;
    // o conteúdo passa direto da leitura para a gravação (sem carregar o arquivo inteiro na memória do Worker)
    await env.DADOS.put(d.novo, obj.body, { httpMetadata: obj.httpMetadata, customMetadata: obj.customMetadata });
    await env.DADOS.delete(d.key);
    movidos += 1;
  };
  const aMover = [];
  for (const d of destinos) {
    if (existentes.has(d.novo)) sobraram.push(d.rel.replace(/^\//, '') || nomeDe(d.key));
    else aMover.push(d);
  }
  for (let i = 0; i < aMover.length; i += MOVER_JUNTOS) await Promise.all(aMover.slice(i, i + MOVER_JUNTOS).map(moverUm));
  return json(200, { ok: true, movidos, sobraram, mais: itens.length > POR_PEDIDO });
}

/**
 * Anexos seguem o papel do usuário no sistema (o cofre sabe): ler = qualquer usuário ativo; gravar/apagar/mover = operador ou admin.
 * A resposta "pode" fica guardada por VALIDADE_PAPEL (só neste Worker em memória; o "não pode" não é guardado): um usuário
 * desativado ou rebaixado continua mexendo nos anexos por até 1 minuto (os dados, pelo cofre, param na hora).
 */
const papeisConferidos = new Map(); // "email|nivel" → vale até (ms)
export const esquecerPapeis = () => papeisConferidos.clear();
async function exigirPapel(env, email, nivel) {
  if (env.MODO_TESTE === '1' && !env.COFRE) return; // testes dos anexos sem cofre
  if (!env.COFRE) throw new ErroHttp(503, 'Worker sem o cofre ligado (binding COFRE).');
  const chave = `${email}|${nivel}`;
  if ((papeisConferidos.get(chave) || 0) > Date.now()) return;
  const r = await cofreDe(env).fetch(new Request(`https://cofre/papel?nivel=${nivel}`, { headers: { 'X-Email-Conferido': email } }));
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new ErroHttp(r.status, e.erro || 'Sem permissão.'); }
  papeisConferidos.set(chave, Date.now() + VALIDADE_PAPEL);
}

/** Apaga uma pasta inteira (todos os arquivos com esse começo), em partes: responde `mais: true` para o site repetir. */
async function apagarPasta(request, env, email = '') {
  conferirGravacao(request, env);
  let pedido;
  try { pedido = JSON.parse(new TextDecoder().decode(await lerCorpo(request, 64 * 1024))); } catch { throw new ErroHttp(400, 'Pedido inválido.'); }
  const chave = caminhoSeguro(pedido?.caminho, { pasta: true });
  if (SO_LEITURA.includes(raizDe(chave))) throw new ErroHttp(403, 'Os backups não podem ser alterados.');
  if (!chave.includes('/')) throw new ErroHttp(403, 'As pastas principais não podem ser apagadas.');
  // cada arquivo vai para a lixeira (copia e apaga: 3 chamadas ao R2), em partes de POR_PEDIDO_LIXEIRA (o site repete com `mais`)
  const r = await env.DADOS.list({ prefix: `${chave}/`, limit: POR_PEDIDO_LIXEIRA });
  const chaves = r.objects.map((o) => o.key);
  for (let i = 0; i < chaves.length; i += MOVER_JUNTOS) await Promise.all(chaves.slice(i, i + MOVER_JUNTOS).map((k) => paraLixeira(env.DADOS, k, { por: email })));
  return json(200, { ok: true, apagados: chaves.length, mais: !!r.truncated });
}

/** Leituras que o site e o crachá do aparelho fazem igual (só GET); null = não é uma delas. */
async function lerRecurso(env, rota, email, url, request = null) {
  if (rota.startsWith('lista/')) {
    const chave = caminhoSeguro(rota.slice(6), { pasta: true });
    await exigirPapel(env, email, raizDe(chave) === 'backups' ? 'admin' : 'consulta'); // nomes, datas e tamanhos dos backups: só o administrador
    return listarPasta(env, chave);
  }
  if (rota.startsWith('lista-tudo/')) {
    const chave = caminhoSeguro(rota.slice(11), { pasta: true });
    await exigirPapel(env, email, raizDe(chave) === 'backups' ? 'admin' : 'consulta');
    return listarPastaInteira(env, chave, url.searchParams.get('cursor'));
  }
  if (rota.startsWith('arquivos/') || rota.startsWith('modelos/') || rota.startsWith('backups/')) {
    const chave = caminhoSeguro(rota);
    await exigirPapel(env, email, raizDe(chave) === 'backups' ? 'admin' : 'consulta'); // backups têm o banco inteiro (com as senhas de todos)
    return lerArquivo(env, chave, request);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Programa do PC (crachá do aparelho, aparelhos.mjs). O Access deixa passar /api/aparelho/ sem login (política Bypass só nesse
// caminho, nuvem/README.md); aqui nada passa sem crachá, exceto a entrada com e-mail e senha (limite de tentativas no cofre).
// O crachá só lê, com UMA exceção: devolver o PDF assinado da fila da assinatura digital (assinaturas.mjs, 21/11/2026). As outras
// rotas continuam exigindo o login do Access mesmo que o Bypass fique largo demais por engano.
// ---------------------------------------------------------------------------
/** A versão PC que o GitHub gera a cada merge na main (repositório público): o Worker busca lá, o atualizador não passa pelo Access. */
export const URL_PROGRAMA = 'https://raw.githubusercontent.com/juliocpfh/erp-boletos/main/docs/offline/administracao-imoveis.html';
const ROTAS_DADOS_APARELHO = ['tudo', 'mudancas'];
const crachasConferidos = new Map(); // hash do crachá → { email, ate }: 1 minuto, como o papel (desligar vale em até 1 min)
export const esquecerCrachas = () => { crachasConferidos.clear(); crachasRecusados.clear(); };

async function conferirCracha(request, env) {
  const m = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '');
  if (!m || !crachaValido(m[1])) throw new ErroHttp(401, 'Este computador não está ligado ao sistema (falta o crachá do aparelho).');
  const hash = await hashDoCracha(m[1]);
  const guardado = crachasConferidos.get(hash);
  if (guardado && guardado.ate > Date.now()) return guardado.email;
  if ((crachasRecusados.get(hash) || 0) > Date.now()) throw new ErroHttp(401, 'Este computador não está mais ligado ao sistema. Ligue de novo com o e-mail e a senha.');
  limitarIp(request, 'cracha');
  // a versão do programa do PC (atualizador-pc/se-atualizar.mjs): só o formato "AAAA-MM-DD commit"; outra coisa é ignorada
  const versao = /^\d{4}-\d{2}-\d{2} [0-9a-z-]{1,40}$/.exec(request.headers.get('X-Programa-Versao') || '')?.[0] || '';
  const r = await cofreDe(env).fetch(new Request('https://cofre/aparelho/conferir', { method: 'POST', body: JSON.stringify({ cracha: m[1], versao }), headers: { 'Content-Type': 'application/json' } }));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (crachasRecusados.size > 1000) crachasRecusados.clear();
    if (r.status === 401) crachasRecusados.set(hash, Date.now() + VALIDADE_PAPEL);
    throw new ErroHttp(r.status, d.erro || 'Crachá do aparelho recusado.');
  }
  if (!naListaDeEmails(env, d.email)) throw new ErroHttp(403, 'Este e-mail não tem acesso ao sistema.');
  if (crachasConferidos.size > 200) crachasConferidos.clear();
  crachasConferidos.set(hash, { email: d.email, ate: Date.now() + VALIDADE_PAPEL });
  return d.email;
}

/** A versão PC, buscada no GitHub; com If-None-Match igual, 304 (o atualizador só baixa quando muda). */
async function versaoPc(request, env, buscar) {
  const se = request.headers.get('If-None-Match');
  const r = await buscar(env.URL_PROGRAMA || URL_PROGRAMA, { method: request.method, headers: se ? { 'If-None-Match': se } : {} });
  const etag = r.headers.get('ETag') || '';
  if (r.status === 304) return new Response(null, { status: 304, headers: { ETag: etag || se } });
  if (!r.ok) throw new ErroHttp(502, `A versão PC não está disponível agora (GitHub respondeu ${r.status}).`);
  return new Response(request.method === 'HEAD' ? null : r.body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="administracao-imoveis.html"', ETag: etag, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/**
 * /api/aparelho/ é público (sem o Access): antes de ir ao cofre (um só, atende um pedido por vez), limite por endereço de
 * internet neste Worker (em memória: cada instância conta a sua). Passou, 429 sem incomodar o cofre.
 */
export const LIMITE_APARELHO = { entrar: 30, cracha: 60, janela: 60000 };
const pedidosPorIp = new Map(); // "tipo|ip" → { n, desde }
export const esquecerPedidosPorIp = () => pedidosPorIp.clear();
function limitarIp(request, tipo) {
  const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
  const chave = `${tipo}|${ip}`; const agora = Date.now();
  if (pedidosPorIp.size > 5000) pedidosPorIp.clear();
  const c = pedidosPorIp.get(chave);
  if (!c || agora - c.desde > LIMITE_APARELHO.janela) { pedidosPorIp.set(chave, { n: 1, desde: agora }); return; }
  c.n += 1;
  if (c.n > LIMITE_APARELHO[tipo]) throw new ErroHttp(429, 'Muitos pedidos deste endereço. Espere um minuto e tente de novo.');
}
const crachasRecusados = new Map(); // hash do crachá → até quando (crachá inventado não volta ao cofre por 1 minuto)

async function atenderAparelho(request, env, rota, url, buscar, ctx = null) {
  if (!env.COFRE) throw new ErroHttp(503, 'Worker sem o cofre ligado (binding COFRE).');
  const m = request.method;
  if (rota === 'entrar') {
    limitarIp(request, 'entrar');
    if (m !== 'POST') throw new ErroHttp(405, 'Método não aceito.');
    let pedido;
    try { pedido = JSON.parse(new TextDecoder().decode(await lerCorpo(request, 4096))); } catch (e) { throw e instanceof ErroHttp ? e : new ErroHttp(400, 'Pedido inválido.'); }
    if (!pedido || typeof pedido !== 'object' || !naListaDeEmails(env, pedido.email)) throw new ErroHttp(401, ERRO_ENTRAR);
    return cofreDe(env).fetch(new Request('https://cofre/aparelho/entrar', {
      method: 'POST', body: JSON.stringify({ email: pedido.email, senha: pedido.senha, computador: pedido.computador }),
      headers: { 'Content-Type': 'application/json', 'X-Ip': request.headers.get('CF-Connecting-IP') || '' },
    }));
  }
  // fila da assinatura digital: o programa do PC busca os pendentes e devolve o PDF assinado (a única gravação do crachá)
  if (rota === 'assinaturas' || rota.startsWith('assinaturas/')) {
    const email = await conferirCracha(request, env);
    let r;
    try { r = await atenderAparelhoAssinaturas(request, env, rota.slice('assinaturas/'.length), email); } catch (e) { r = respostaDoErro(e); }
    if (m !== 'GET' || rota !== 'assinaturas') await anotarAcesso(env, ctx, request, rota, email, r, 'pc');
    return r;
  }
  if (m !== 'GET' && m !== 'HEAD') throw new ErroHttp(405, 'O crachá do aparelho só lê: para gravar, use o site.');
  const email = await conferirCracha(request, env);
  if (rota === 'programa') return versaoPc(request, env, buscar);
  if (m !== 'GET') throw new ErroHttp(405, 'Método não aceito.');
  if (rota === 'saude') return json(200, { ok: true, email });
  if (rota.startsWith('dados/') && ROTAS_DADOS_APARELHO.includes(rota.slice(6))) return repassarAoCofre(request, env, rota.slice(6), email, url, 'pc');
  let lido;
  try { lido = (await lerRecurso(env, rota, email, url, request)) || json(404, { erro: 'Não encontrado.' }); } catch (e) { lido = respostaDoErro(e); }
  await anotarAcesso(env, ctx, request, rota, email, lido, 'pc');
  return lido;
}

// ---------------------------------------------------------------------------
// Ícone do aplicativo instalado (a logo enquadrada pelo administrador), em sistema/ (fora de RAIZES: as rotas genéricas não chegam)
// ---------------------------------------------------------------------------
const TAMANHOS_ICONE = ['192', '512'];
const MAX_ICONE = 1024 * 1024;
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function lerIcone(env, tam) {
  const obj = await env.DADOS.get(`sistema/icone-${tam}.png`);
  if (!obj) return new Response(null, { status: 302, headers: { Location: `/icones/erp-${tam}.png`, 'Cache-Control': 'no-cache' } });
  return new Response(obj.body, { headers: { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' } });
}

async function gravarIcone(request, env, tam, email) {
  conferirGravacao(request, env);
  let corpo;
  try { corpo = await lerCorpo(request, MAX_ICONE); } catch (e) { throw e instanceof ErroHttp ? new ErroHttp(400, e.message) : e; }
  const b = new Uint8Array(corpo);
  if (b.length < 24 || ASSINATURA_PNG.some((x, i) => b[i] !== x)) throw new ErroHttp(400, 'O ícone precisa ser uma imagem PNG.');
  // IHDR: comprimento (4) + "IHDR" (4) logo após a assinatura; largura e altura em 4 bytes cada (big-endian)
  const v = new DataView(corpo);
  const ihdr = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (ihdr !== 'IHDR' || v.getUint32(16) !== Number(tam) || v.getUint32(20) !== Number(tam)) throw new ErroHttp(400, `O ícone precisa ter ${tam}×${tam} pixels.`);
  await env.DADOS.put(`sistema/icone-${tam}.png`, corpo, { customMetadata: { por: email } });
  return json(200, { ok: true });
}

async function apagarIcone(request, env) {
  conferirGravacao(request, env);
  await env.DADOS.delete(TAMANHOS_ICONE.map((t) => `sistema/icone-${t}.png`));
  return json(200, { ok: true });
}

// ---------------------------------------------------------------------------
// E-mail pela conta Gmail da empresa (gmail.mjs): qualquer usuário ativo envia; nada é gravado aqui (o site registra o envio)
// ---------------------------------------------------------------------------
const simularGmail = (env, url) => env.SIMULAR_GMAIL === '1' && ['localhost', '127.0.0.1'].includes(url.hostname); // só no computador

async function rotaEnviarEmail(request, env, email, url, buscar) {
  conferirGravacao(request, env);
  const simular = simularGmail(env, url);
  const conta = simular ? null : await contaGuardada(env); // a ligada pelo botão (cifrada no cofre); sem ela, o segredo antigo
  if (!estadoEmail(env, { simular, conta }).ligado) throw new ErroHttp(503, 'O envio pelo Gmail ainda não foi ligado.');
  const corpo = await lerAteLimite(request, MAX_PEDIDO);
  if (!corpo) throw new ErroHttp(413, `Anexos passam de ${MAX_BYTES_ANEXOS / 1048576} MB.`);
  let pedido;
  try { pedido = JSON.parse(new TextDecoder().decode(corpo)); } catch { throw new ErroHttp(400, 'Pedido inválido.'); }
  // registro no cofre antes de mandar (quem, para quem, assunto e nomes dos anexos; limite por dia): sem o registro, não manda
  const v = validarEnvio(pedido);
  if (env.COFRE) {
    const reg = await cofreDe(env).fetch(new Request('https://cofre/registrar-email', { method: 'POST', body: JSON.stringify({ para: [...v.para, ...v.cco], assunto: v.assunto, anexos: v.anexos.map((a) => a.nome) }), headers: { 'Content-Type': 'application/json', 'X-Email-Conferido': email } }));
    if (!reg.ok) { const e = await reg.json().catch(() => ({})); throw new ErroHttp(reg.status, e.erro || 'Não foi possível registrar o envio.'); }
  }
  const r = await enviarEmail(env, pedido, { buscar, simular, conta });
  console.log(`e-mail enviado por ${email} (${r.id})`); // só quem e o código: o conteúdo não fica no registro
  return json(200, r);
}

/** Situação do envio (todos os papéis): ligado, remetente, de onde vem (botão ou segredo antigo), a conta e o endereço de retorno. */
async function rotaEstadoEmail(env, url) {
  const simular = simularGmail(env, url);
  const conta = simular ? null : await contaGuardada(env);
  const e = estadoEmail(env, { simular, conta });
  return json(200, {
    ligado: e.ligado, remetente: e.remetente, origem: e.origem, conta: e.conta, cliente: e.cliente, retorno: enderecoDeRetorno(env, url),
    ...(conta?.refresh ? { ligado_em: conta.ligado_em } : {}), ...(conta?.ilegivel ? { ilegivel: true } : {}),
  });
}

// "Conectar o Gmail" (fluxo OAuth 2.0 de aplicativo da Web, com state de uso único e PKCE; gmail.mjs e gmail-conta.mjs).
// A volta do Google (email/google/retorno) passa pelo Access como qualquer página do site: o navegador do administrador já
// está logado, então o redirecionamento chega com o login dele (se o login venceu, o Access pede o código e depois volta).
async function pedirAoCofre(env, rota, email, corpo = {}) {
  if (!env.COFRE) throw new ErroHttp(503, 'Worker sem o cofre ligado (binding COFRE).');
  const r = await cofreDe(env).fetch(new Request(`https://cofre/${rota}`, { method: 'POST', body: JSON.stringify(corpo), headers: { 'Content-Type': 'application/json', 'X-Email-Conferido': email } }));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroHttp(r.status, d.erro || 'Erro no cofre da nuvem.');
  return d;
}

/** Começa: guarda o pedido (hash do state + verificador PKCE) no cofre e devolve o endereço da permissão do Google. */
async function conectarGmail(env, email, url) {
  if (!clienteConfigurado(env)) throw new ErroHttp(503, 'Faltam o GMAIL_CLIENT_ID e o GMAIL_CLIENT_SECRET nos segredos do Cloudflare (documentacao/LIGAR_GMAIL.md).');
  const state = sorteado();
  const { verificador, desafio } = await pkce();
  await pedirAoCofre(env, 'gmail/estado-novo', email, { hash: await hashHex(state), verificador });
  return json(200, { url: urlDeAutorizacao(env, { state, desafio, retorno: enderecoDeRetorno(env, url) }) });
}

/** Avisos da volta (o site mostra o texto de cada um em Sistema → Comunicação E-mail; FORMATOS_PARAMETRO.gmail em calculos.js). */
export const AVISOS_VOLTA_GMAIL = ['ligado', 'cancelado', 'recusado', 'sem-permissao', 'credencial', 'retorno', 'sem-rede', 'erro'];
const voltarParaTela = (env, url, codigo) => new Response(null, {
  status: 303,
  headers: { Location: `${String(env.ORIGEM || url.origin).trim().replace(/\/+$/, '')}/#/sistema-email?gmail=${AVISOS_VOLTA_GMAIL.includes(codigo) ? codigo : 'erro'}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
});

/** A volta do Google: gasta o state (uma vez, do mesmo administrador, em 10 min), troca o código e guarda a autorização cifrada. */
async function retornoDoGoogle(env, email, url, buscar) {
  const p = url.searchParams;
  const state = p.get('state') || '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return voltarParaTela(env, url, 'recusado');
  let verificador;
  try { ({ verificador } = await pedirAoCofre(env, 'gmail/estado-usar', email, { hash: await hashHex(state) })); } catch { return voltarParaTela(env, url, 'recusado'); }
  if (p.get('error')) return voltarParaTela(env, url, p.get('error') === 'access_denied' ? 'cancelado' : 'erro');
  const code = p.get('code') || '';
  if (!code || code.length > 2048) return voltarParaTela(env, url, 'erro');
  try {
    const conta = await trocarCodigo(env, { code, verificador, retorno: enderecoDeRetorno(env, url) }, buscar);
    await pedirAoCofre(env, 'gmail/guardar', email, { cifrado: await cifrarToken(env, conta.refresh), conta: conta.email });
    esquecerToken();
    console.log(`Gmail ligado por ${email}`); // só quem: a conta e a autorização não vão para o registro
    return voltarParaTela(env, url, 'ligado');
  } catch (e) {
    if (!(e instanceof ErroEmail)) console.error('ligar o Gmail', e?.message || e);
    return voltarParaTela(env, url, e instanceof ErroEmail ? e.codigo : 'erro');
  }
}

/** Desconectar: apaga a autorização do cofre e a revoga no Google (se o Google não responder, aqui ela já sumiu). */
async function desconectarGmail(env, email, buscar) {
  const { conta } = await pedirAoCofre(env, 'gmail/apagar', email);
  const refresh = conta ? await decifrarToken(env, conta.cifrado) : null;
  const revogado = refresh ? await revogarToken(refresh, buscar) : false;
  esquecerToken();
  return json(200, { ok: true, havia: !!conta, revogado, segredo_antigo: !!String(env.GMAIL_REFRESH_TOKEN || '').trim() });
}

// ---------------------------------------------------------------------------
/**
 * Avisos da ficha pela internet sem segurar a resposta: no Cloudflare continuam depois dela (waitUntil); nos testes e no
 * computador, a resposta espera o aviso. Erro no aviso só vai para o registro.
 */
export const avisador = (ctx = null, buscar = fetch) => (env, registro, evento, detalhe) => {
  const p = avisar(env, registro, evento, detalhe, { buscar }).catch((e) => console.error('aviso da ficha', e));
  if (ctx && ctx.waitUntil) { ctx.waitUntil(p); return undefined; }
  return p;
};

export async function atender(request, env, buscar = fetch, ctx = null) {
  const url = new URL(request.url);
  const rota = url.pathname.replace(/^\/api\/?/, '');
  if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return json(404, { erro: 'Não encontrado.' });
  try {
    if (!env.DADOS) throw new ErroHttp(503, 'Worker sem o R2 ligado (binding DADOS).');
    if (request.method === 'OPTIONS') throw new ErroHttp(405, 'Método não aceito.'); // sem CORS: só o próprio site chama
    if (rota.startsWith('aparelho/')) return await atenderAparelho(request, env, rota.slice(9), url, buscar, ctx); // programa do PC: crachá, sem Access
    const email = await conferirLogin(request, env, buscar);
    // as rotas do registro de acessos (rotaDoRegistro) ficam anotadas com o resultado, também quando recusadas
    let resposta;
    try { resposta = await atenderComLogin(request, env, rota, email, url, buscar, ctx); } catch (e) { resposta = respostaDoErro(e); }
    // tamanho: o que foi enviado (anexo, e-mail) ou o que foi baixado (Content-Length da resposta)
    await anotarAcesso(env, ctx, request, rota, email, resposta, 'site', request.method === 'GET' ? null : Number(request.headers.get('Content-Length')) || null);
    return resposta;
  } catch (e) {
    return respostaDoErro(e);
  }
}

/** Erro → resposta JSON (ErroHttp, ErroEmail; o resto vira 500 sem detalhes). */
function respostaDoErro(e) {
  if (e instanceof ErroHttp) return json(e.status, { erro: e.message, ...e.extra });
  if (e instanceof ErroEmail) return json(e.status, { erro: e.message });
  if (e instanceof ErroAssinatura) return json(e.status, { erro: e.message });
  console.error(e);
  return json(500, { erro: 'Erro no servidor da nuvem.' });
}

/** As rotas do site depois do login do Access conferido. */
async function atenderComLogin(request, env, rota, email, url, buscar, ctx) {
  const m = request.method;
  if (rota === 'saude' && m === 'GET') return json(200, { ok: true, email, teste: env.MODO_TESTE === '1' });
  const icone = rota.match(/^icone-(192|512)\.png$/);
  if (icone && m === 'GET') return await lerIcone(env, icone[1]);
  const novoIcone = rota.match(/^icone\/(192|512)$/);
  if (novoIcone && m === 'PUT') { await exigirPapel(env, email, 'admin'); return await gravarIcone(request, env, novoIcone[1], email); }
  if (rota === 'icone' && m === 'DELETE') { await exigirPapel(env, email, 'admin'); return await apagarIcone(request, env); }
  if (rota === 'email/estado' && m === 'GET') { await exigirPapel(env, email, 'consulta'); return await rotaEstadoEmail(env, url); }
  if (rota === 'email/enviar' && m === 'POST') { await exigirPapel(env, email, 'operador'); return await rotaEnviarEmail(request, env, email, url, buscar); }
  if (rota === 'email/google/conectar' && m === 'POST') { conferirGravacao(request, env); await exigirPapel(env, email, 'admin'); return await conectarGmail(env, email, url); }
  if (rota === 'email/google/retorno' && m === 'GET') return await retornoDoGoogle(env, email, url, buscar);
  if (rota === 'email/google/desconectar' && m === 'POST') { conferirGravacao(request, env); await exigirPapel(env, email, 'admin'); return await desconectarGmail(env, email, buscar); }
  if (rota.startsWith('dados/')) return await repassarAoCofre(request, env, rota.slice(6), email, url);
  if (rota.startsWith('ficha-online/')) {
    if (m !== 'GET') conferirGravacao(request, env);
    await exigirPapel(env, email, 'operador');
    return await atenderEquipe(request, env, rota.slice(13), email, { avisar: avisador(ctx, buscar) });
  }
  if (rota.startsWith('contatos/')) { // comunicado com confirmação de contatos (contatos-publico.mjs)
    if (m !== 'GET') conferirGravacao(request, env);
    await exigirPapel(env, email, 'operador');
    return await atenderEquipeContatos(request, env, rota.slice(9), email);
  }
  if (rota.startsWith('aceite-reserva/')) { // termo de aceite da reserva (aceite-reserva.mjs)
    if (m !== 'GET') conferirGravacao(request, env);
    await exigirPapel(env, email, 'operador');
    return await atenderEquipeAceite(request, env, rota.slice('aceite-reserva/'.length), email);
  }
  if (rota === 'assinaturas' || rota.startsWith('assinaturas/')) { // fila da assinatura digital (assinaturas.mjs)
    return await atenderEquipeAssinaturas(request, env, rota.slice('assinaturas/'.length), email, { exigir: (nivel) => exigirPapel(env, email, nivel), conferirGravacao: () => conferirGravacao(request, env) });
  }
  if (rota === 'apagar' && m === 'POST') { await exigirPapel(env, email, 'operador'); return await apagarPasta(request, env, email); }
  if (rota === 'mover' && m === 'POST') { await exigirPapel(env, email, 'operador'); return await mover(request, env); }
  if (m === 'GET') { const lido = await lerRecurso(env, rota, email, url, request); if (lido) return lido; }
  if (rota.startsWith('arquivos/') || rota.startsWith('modelos/') || rota.startsWith('backups/')) {
    const chave = caminhoSeguro(rota);
    await exigirPapel(env, email, 'operador');
    if (m === 'PUT') return await gravarArquivo(request, env, chave, email);
    if (m === 'DELETE') return await apagarArquivo(request, env, chave, email);
  }
  return json(404, { erro: 'Não encontrado.' });
}

/** O endereço da ficha (ficha.ankjck.com.br) é outro aplicativo: sem login, só a ficha. */
export const ehEnderecoDaFicha = (request, env) => new URL(request.url).hostname === String(env.HOST_FICHA || 'ficha.ankjck.com.br');

export default {
  fetch: (request, env, ctx) => (ehEnderecoDaFicha(request, env) ? atenderFicha(request, env, { avisar: avisador(ctx) })
    : ehEnderecoDeVendas(request, env) ? atenderVendas(request, env, { conferirLogin })
      : atender(request, env, fetch, ctx)),
};
