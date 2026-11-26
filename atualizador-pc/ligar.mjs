// Ligar este computador ao sistema (crachá do aparelho, decisão do dono de 15/11/2026): uma página simples, só neste computador
// (http://127.0.0.1, aberta no navegador), pede e-mail, senha e a pasta do backup seguro. A conta da senha (PBKDF2, igual à do
// site) é feita aqui: a nuvem manda o sal e as voltas, recebe só o resumo, confere e devolve o crachá (a senha não sai deste
// computador nem fica guardada); o crachá fica cifrado pelo Windows (DPAPI, só esta conta deste computador abre).
// Onde fica: %LOCALAPPDATA%\Administracao de Imoveis\ (config.json com o site e a pasta; cracha.dat cifrado). Fora do OneDrive.
// Uso: node atualizador.mjs --ligar (no .exe: dois cliques ou --ligar). Passo a passo em README.md.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const SITE_PADRAO = 'https://erp.ankjck.com.br';
export const ARQUIVO_CONFIG = 'config.json';
export const ARQUIVO_CRACHA = 'cracha.dat';
const ARQUIVO_CHAVE = 'chave-do-backup.json'; // igual a atualizador.mjs

export class ErroNaoLigado extends Error {}

/** Pasta das configurações deste computador (IMOVEIS_CONFIG troca, nos testes). */
export const pastaConfig = (env = process.env) => env.IMOVEIS_CONFIG || path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Administracao de Imoveis');

// ---------------------------------------------------------------------------
// Cifra do Windows (DPAPI, ProtectedData com a conta do usuário). O texto vai pela entrada padrão, nunca na linha de comando.
// ---------------------------------------------------------------------------
function powershell(script, entrada = '') {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { input: entrada, encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) throw new Error(`O Windows não conseguiu cifrar/abrir o crachá (${(r.stderr || r.error?.message || '').trim().slice(0, 200)}).`);
  return r.stdout.trim();
}
const PS_ENTRADA = '$t = [Console]::In.ReadToEnd().Trim(); Add-Type -AssemblyName System.Security;';
export const protegerNoWindows = (texto) => powershell(`${PS_ENTRADA} [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($t), $null, 'CurrentUser'))`, texto);
export const abrirNoWindows = (b64) => powershell(`${PS_ENTRADA} [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($t), $null, 'CurrentUser'))`, b64);

// ---------------------------------------------------------------------------
// O que fica guardado
// ---------------------------------------------------------------------------
/** { site, pasta, computador, login, aparelho, ligado_em, cracha } ou null (não ligado). */
export function lerLigacao(env = process.env, { abrir = abrirNoWindows } = {}) {
  const dir = pastaConfig(env);
  const cfgArq = path.join(dir, ARQUIVO_CONFIG); const crachaArq = path.join(dir, ARQUIVO_CRACHA);
  if (!fs.existsSync(cfgArq) || !fs.existsSync(crachaArq)) return null;
  const cfg = JSON.parse(fs.readFileSync(cfgArq, 'utf8'));
  return { ...cfg, cracha: abrir(fs.readFileSync(crachaArq, 'utf8').trim()) };
}

export function guardarLigacao(lig, env = process.env, { proteger = protegerNoWindows } = {}) {
  const dir = pastaConfig(env);
  fs.mkdirSync(dir, { recursive: true });
  const { cracha, ...resto } = lig;
  fs.writeFileSync(path.join(dir, ARQUIVO_CRACHA), proteger(cracha)); // primeiro o crachá: sem ele, config.json sozinho não vale
  fs.writeFileSync(path.join(dir, ARQUIVO_CONFIG), JSON.stringify(resto, null, 2));
}

export function esquecerLigacao(env = process.env) {
  for (const n of [ARQUIVO_CRACHA, ARQUIVO_CONFIG]) { try { fs.unlinkSync(path.join(pastaConfig(env), n)); } catch { /* não havia */ } }
}

// ---------------------------------------------------------------------------
// Falar com a nuvem
// ---------------------------------------------------------------------------
const MAX_ITERACOES = 2000000; // igual a nuvem/aparelhos.mjs: a nuvem não manda este computador fazer uma conta sem fim
const MIN_ITERACOES = 150000; // as voltas mais fracas que o sistema grava (docs/js/auth.js): um "site" que peça menos quer um resumo fácil de quebrar
export const TEMPO_LIGAR = 30000; // tempo-limite de cada pedido à nuvem

/** O resumo da senha (PBKDF2-SHA256, 256 bits, em hex): a mesma conta de docs/js/auth.js, feita neste computador. */
export const resumoDaSenha = (senha, sal, iteracoes) => new Promise((ok, falha) => {
  crypto.pbkdf2(String(senha), String(sal), iteracoes, 32, 'sha256', (e, bytes) => (e ? falha(e) : ok(bytes.toString('hex'))));
});

/**
 * E-mail e senha → crachá, em dois pedidos à mesma rota: 1) só o e-mail → a nuvem diz o sal e as voltas; 2) o e-mail e o resumo
 * da senha calculado aqui. A senha em si nunca vai para a nuvem. Erros com texto para a pessoa.
 */
export async function entrarNaNuvem(site, { email, senha, computador }, buscar = fetch) {
  if (!email || !senha) throw new Error('Informe o e-mail e a senha do sistema.');
  const pedir = async (corpo) => {
    let r;
    try {
      r = await buscar(`${site}/api/aparelho/entrar`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(TEMPO_LIGAR) });
    } catch { throw new Error('Sem internet (ou o site não respondeu). Confira a conexão e tente de novo.'); }
    if (!(r.headers.get('content-type') || '').includes('json')) {
      throw new Error(`A nuvem ainda não deixa o programa entrar (resposta ${r.status}): falta a regra "Bypass" do caminho /api/aparelho no Cloudflare Access (nuvem/README.md, "Programa do PC").`);
    }
    let d;
    try { d = await r.json(); } catch { throw new Error('Sem internet (ou o site não respondeu). Confira a conexão e tente de novo.'); }
    if (!r.ok) throw new Error(d.erro || `A nuvem recusou (${r.status}).`);
    return d;
  };
  const { desafio } = await pedir({ email, computador });
  const voltas = Number(desafio?.iteracoes);
  if (!desafio?.sal || !Number.isSafeInteger(voltas) || voltas < MIN_ITERACOES || voltas > MAX_ITERACOES) {
    throw new Error('A nuvem respondeu de um jeito que este programa não entende: baixe a versão nova do programa e tente de novo.');
  }
  return pedir({ email, senha: `pbkdf2:${await resumoDaSenha(senha, desafio.sal, voltas)}`, computador });
}

/** Abre a janela do Windows para escolher a pasta; '' se a pessoa cancelou. */
export function escolherPastaNoWindows(inicial = '') {
  const script = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog;
    $d.Description = 'Escolha a pasta do backup seguro (a que tem o arquivo chave-do-backup.json)'; $d.ShowNewFolderButton = $false;
    $i = [Console]::In.ReadToEnd().Trim(); if ($i -and (Test-Path $i)) { $d.SelectedPath = $i };
    $f = New-Object System.Windows.Forms.Form; $f.TopMost = $true;
    if ($d.ShowDialog($f) -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $d.SelectedPath }`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script], { input: inicial, encoding: 'utf8', windowsHide: false });
  return (r.stdout || '').trim();
}

export function conferirPasta(pasta) {
  const p = String(pasta || '').trim();
  if (!p) throw new Error('Escolha a pasta do backup seguro.');
  if (!fs.existsSync(path.join(p, ARQUIVO_CHAVE))) throw new Error(`Esta pasta não é a do backup seguro (falta o arquivo ${ARQUIVO_CHAVE}). Ligue o backup seguro no sistema (Sistema → Backup seguro) e escolha a mesma pasta aqui.`);
  return p;
}

// ---------------------------------------------------------------------------
// A página de ligar (só neste computador)
// ---------------------------------------------------------------------------
const pagina = (seg, padrao) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ligar este computador</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:Segoe UI,Arial,sans-serif;background:#f3f4f6;color:#111;margin:0;padding:24px}main{max-width:520px;margin:auto;background:#fff;border-radius:10px;padding:24px;box-shadow:0 2px 8px #0002}
label{display:block;margin:14px 0 4px;font-weight:600}input{width:100%;box-sizing:border-box;padding:9px;font-size:15px;border:1px solid #bbb;border-radius:6px}
.linha{display:flex;gap:8px}.linha input{flex:1}button{padding:10px 16px;font-size:15px;border:0;border-radius:6px;background:#1d4ed8;color:#fff;cursor:pointer}
button.sec{background:#e5e7eb;color:#111}#msg{margin-top:16px;padding:10px;border-radius:6px;display:none}.erro{background:#fee2e2;display:block!important}.ok{background:#dcfce7;display:block!important}small{color:#555}</style></head>
<body><main><h1>Ligar este computador ao sistema</h1>
<p>Entre com o <b>mesmo e-mail e senha do sistema</b>. A senha não fica guardada: o computador recebe um crachá que só <b>lê</b> os dados, e que pode ser desligado em Usuários → Aparelhos ligados.</p>
<form id="f"><label>E-mail</label><input name="email" type="email" autocomplete="username" required value="${padrao.email}">
<label>Senha do sistema</label><input name="senha" type="password" autocomplete="current-password" required>
<label>Nome deste computador</label><input name="computador" required maxlength="60" value="${padrao.computador}"><small>Como vai aparecer em Usuários → Aparelhos ligados.</small>
<label>Pasta do backup seguro</label><div class="linha"><input name="pasta" required value="${padrao.pasta}"><button type="button" class="sec" id="escolher">Escolher…</button></div>
<small>A pasta que você escolheu no sistema em Sistema → Backup seguro (tem o arquivo chave-do-backup.json).</small>
<p><button id="ligar">Ligar</button></p></form><div id="msg"></div></main>
<script>
const seg = ${JSON.stringify(seg)}; const f = document.getElementById('f'); const msg = document.getElementById('msg');
const mostrar = (t, c) => { msg.textContent = t; msg.className = c; };
const pedir = async (rota, corpo) => { const r = await fetch('/' + seg + '/' + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) }); const d = await r.json(); if (!r.ok) throw new Error(d.erro); return d; };
document.getElementById('escolher').onclick = async () => { try { const d = await pedir('pasta', { inicial: f.pasta.value }); if (d.pasta) f.pasta.value = d.pasta; } catch (e) { mostrar(e.message, 'erro'); } };
f.onsubmit = async (ev) => { ev.preventDefault(); const b = document.getElementById('ligar'); b.disabled = true; mostrar('Conferindo…', 'ok');
  try { const d = await pedir('ligar', Object.fromEntries(new FormData(f))); f.remove(); mostrar(d.texto, 'ok'); } catch (e) { mostrar(e.message, 'erro'); b.disabled = false; } };
</script></body></html>`;

const escAttr = (t) => String(t || '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Sobe a página em 127.0.0.1 (porta sorteada, endereço com um segredo sorteado: outro site aberto no navegador não acha nem
 * manda nada para ela), abre no navegador e espera ligar. Devolve a ligação guardada. `abrirNavegador`, `buscar`, `proteger` e
 * `escolherPasta` trocam nos testes.
 */
export function janelaDeLigar({ site = SITE_PADRAO, env = process.env, padrao = {}, buscar = fetch, proteger = protegerNoWindows,
  abrirNavegador = abrirNoNavegador, escolherPasta = escolherPastaNoWindows, aoAbrir = () => {} } = {}) {
  const seg = crypto.randomBytes(18).toString('hex');
  const valores = { email: escAttr(padrao.email), computador: escAttr(padrao.computador || env.COMPUTERNAME || os.hostname()), pasta: escAttr(padrao.pasta) };
  return new Promise((resolver, recusar) => {
    let porta = 0; let feito = false;
    const servidor = http.createServer(async (req, res) => {
      const responder = (status, dados, tipo = 'application/json; charset=utf-8') => {
        res.writeHead(status, { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
        res.end(typeof dados === 'string' ? dados : JSON.stringify(dados));
      };
      // só este computador e só a página daqui (Host certo contra "DNS rebinding"; Origin certa contra outros sites)
      const daqui = `127.0.0.1:${porta}`;
      if (req.headers.host !== daqui || (req.headers.origin && req.headers.origin !== `http://${daqui}`)) return responder(403, { erro: 'Recusado.' });
      if (req.method === 'GET' && req.url === `/${seg}`) return responder(200, pagina(seg, valores), 'text/html; charset=utf-8');
      if (req.method !== 'POST' || !String(req.headers['content-type'] || '').startsWith('application/json')) return responder(404, { erro: 'Não encontrado.' });
      let corpo;
      try {
        const partes = []; let tam = 0;
        for await (const p of req) { tam += p.length; if (tam > 8192) throw new Error('grande'); partes.push(p); }
        corpo = JSON.parse(Buffer.concat(partes).toString('utf8'));
      } catch { return responder(400, { erro: 'Pedido inválido.' }); }
      try {
        if (req.url === `/${seg}/pasta`) return responder(200, { pasta: escolherPasta(String(corpo.inicial || '')) });
        if (req.url === `/${seg}/ligar` && !feito) {
          const pasta = conferirPasta(corpo.pasta);
          const computador = String(corpo.computador || '').trim();
          const d = await entrarNaNuvem(site, { email: String(corpo.email || '').trim(), senha: String(corpo.senha || ''), computador }, buscar);
          const lig = { site, pasta, computador: d.computador || computador, login: d.login, aparelho: d.id, ligado_em: new Date().toISOString(), cracha: d.cracha };
          guardarLigacao(lig, env, { proteger });
          feito = true;
          responder(200, { texto: `Pronto: ${lig.computador} está ligado ao sistema com o acesso de ${d.nome || d.login}. Pode fechar esta página. A primeira atualização começa agora.` });
          setTimeout(() => servidor.close(), 200);
          const { cracha, ...semCracha } = lig; // eslint-disable-line no-unused-vars
          return resolver(semCracha);
        }
        return responder(404, { erro: 'Não encontrado.' });
      } catch (e) { return responder(400, { erro: e.message }); }
    });
    servidor.on('error', recusar);
    servidor.listen(0, '127.0.0.1', () => {
      porta = servidor.address().port;
      const url = `http://127.0.0.1:${porta}/${seg}`;
      aoAbrir(url);
      abrirNavegador(url);
    });
  });
}

export function abrirNoNavegador(url) {
  if (process.platform === 'win32') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}
