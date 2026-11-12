// Gera o GMAIL_REFRESH_TOKEN (autorização para o sistema enviar e-mails pela conta Gmail da empresa). Roda uma vez, no computador.
// Uso: node tools/gmail-token.mjs
//      (pede o Client ID e o Client Secret da credencial OAuth "App para computador"; ou GMAIL_CLIENT_ID e GMAIL_CLIENT_SECRET no ambiente)
// Abre o navegador na página de autorização do Google (só o escopo gmail.send: enviar, sem ler a caixa), recebe a resposta
// num servidor só deste computador (127.0.0.1) e mostra o refresh token para gravar no Worker. Passo a passo: documentacao/LIGAR_GMAIL.md.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import readline from 'node:readline/promises';

const ESCOPO = 'https://www.googleapis.com/auth/gmail.send';
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(texto)).trim(); } finally { rl.close(); }
}

function abrirNavegador(url) {
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* o endereço também aparece na tela */ }
}

const clientId = process.env.GMAIL_CLIENT_ID || await perguntar('Client ID: ');
const clientSecret = process.env.GMAIL_CLIENT_SECRET || await perguntar('Client Secret: ');
if (!clientId || !clientSecret) { console.error('Faltou o Client ID ou o Client Secret.'); process.exit(1); }

const verificador = b64url(crypto.randomBytes(32)); // PKCE: só este programa consegue trocar o código
const desafio = b64url(crypto.createHash('sha256').update(verificador).digest());
const estado = b64url(crypto.randomBytes(16));

const servidor = http.createServer();
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const retorno = `http://127.0.0.1:${servidor.address().port}/`;

const autorizar = new URL('https://accounts.google.com/o/oauth2/v2/auth');
autorizar.search = new URLSearchParams({
  client_id: clientId, redirect_uri: retorno, response_type: 'code', scope: ESCOPO,
  access_type: 'offline', prompt: 'consent', state: estado, code_challenge: desafio, code_challenge_method: 'S256',
}).toString();

console.log('\nAbrindo o navegador. Entre com a conta Gmail que vai enviar os e-mails e clique em Permitir.');
console.log('Se não abrir sozinho, copie este endereço no navegador:\n');
console.log(autorizar.href, '\n');
abrirNavegador(autorizar.href);

const codigo = await new Promise((ok, falha) => {
  servidor.on('request', (req, res) => {
    const u = new URL(req.url, retorno);
    if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
    const erro = u.searchParams.get('error');
    const c = u.searchParams.get('code');
    const certo = !erro && c && u.searchParams.get('state') === estado;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<p style="font:16px sans-serif">${certo ? 'Pronto. Pode fechar esta aba e voltar ao terminal.' : 'Não deu certo. Volte ao terminal.'}</p>`);
    if (certo) ok(c); else falha(new Error(erro ? `O Google respondeu: ${erro}` : 'Resposta inesperada (state diferente).'));
  });
  setTimeout(() => falha(new Error('Passaram 10 minutos sem resposta. Rode de novo.')), 10 * 60 * 1000).unref();
}).finally(() => servidor.close());

const r = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: codigo, code_verifier: verificador, redirect_uri: retorno, grant_type: 'authorization_code' }).toString(),
});
const dados = await r.json().catch(() => ({}));
if (!r.ok || !dados.refresh_token) {
  console.error('\nO Google não devolveu o refresh token:', dados.error_description || dados.error || r.status);
  process.exit(1);
}
console.log('\nGMAIL_REFRESH_TOKEN (guarde como segredo do Worker; não mande por e-mail nem cole no sistema):\n');
console.log(dados.refresh_token, '\n');
if (dados.scope && !dados.scope.split(' ').includes(ESCOPO)) console.warn('Atenção: a autorização veio sem a permissão de enviar (gmail.send).');
