// Kit de teste: o que ele abre no computador (site, nuvem local, versão PC) e o fim de tudo. Cada processo aberto fica
// guardado pelo PID e só ele é parado no fim (nunca pelo nome: em 24/11 duas sessões derrubaram os servidores uma da outra).
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WIN = process.platform === 'win32';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.xlsx': 'application/octet-stream', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' };

/** Processos abertos pelo kit (filhos) e outras coisas a fechar (servidor do site, navegador). */
const processos = new Set();
const fechamentos = [];

/** Guarda um processo filho para ser parado no fim (pelo PID). */
export function guardarProcesso(filho, nome) {
  filho.nomeNoKit = nome;
  processos.add(filho);
  filho.once('exit', () => processos.delete(filho));
  return filho;
}
/** Para um PID e os processos que ele abriu (só esses: no Windows, taskkill /T pelo número). */
export function pararPid(pid) {
  if (!pid) return;
  try {
    if (WIN) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(pid, 'SIGKILL');
  } catch { /* já tinha saído */ }
}
export const aoFechar = (fn) => fechamentos.push(fn);

let fechado = false;
/** Fecha tudo o que o kit abriu (fim, erro, Ctrl+C, limite total). Pode ser chamada mais de uma vez. */
export async function fecharTudo() {
  if (fechado) return;
  fechado = true;
  for (const fn of fechamentos.reverse()) {
    try { await Promise.race([fn(), new Promise((r) => setTimeout(r, 10000))]); } catch { /* segue fechando o resto */ }
  }
  for (const p of [...processos]) if (p.exitCode === null) pararPid(p.pid);
}
/** No 'exit' do Node não dá para esperar: para os filhos na hora. */
export function fecharTudoJa() {
  for (const p of [...processos]) if (p.exitCode === null) pararPid(p.pid);
}

/** Porta livre escolhida pelo sistema (ao acaso). */
export function portaLivre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

/**
 * Site estático (docs/) num servidor dentro do próprio kit, em porta livre. ``extras``: caminho → arquivo (ex.: a versão PC
 * gerada na pasta temporária). /__kit/vazio é uma página em branco do mesmo endereço, para pôr o banco na pasta interna.
 */
export function servirSite(raizDocs, extras = {}) {
  const raiz = path.resolve(raizDocs);
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__kit/vazio') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('<!doctype html><meta charset="utf-8"><title>kit</title>'); return; }
    const extra = extras[url.pathname];
    let alvo = extra || path.normalize(path.join(raiz, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!extra && url.pathname.startsWith('/offline/')) alvo = ''; // só a versão PC gerada agora (a de docs/offline pode estar velha)
    if (!alvo || (!extra && !alvo.startsWith(raiz + path.sep)) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) { res.writeHead(404); res.end('não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(alvo).pipe(res);
  });
  return new Promise((resolve, reject) => {
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      aoFechar(() => new Promise((r) => { srv.closeAllConnections?.(); srv.close(() => r()); }));
      resolve({ porta: srv.address().port, extras });
    });
  });
}

/** Espera um texto na saída de um processo (ex.: "Nuvem de teste em"), com limite. */
function esperarSaida(filho, texto, ms, log) {
  return new Promise((resolve, reject) => {
    let junto = '';
    const t = setTimeout(() => reject(new Error(`não abriu em ${ms / 1000} s (veja ${log})`)), ms);
    const ver = (b) => { junto += String(b); if (junto.includes(texto)) { clearTimeout(t); resolve(); } };
    filho.stdout.on('data', ver);
    filho.stderr.on('data', ver);
    filho.once('exit', (c) => { clearTimeout(t); reject(new Error(`saiu com código ${c} antes de abrir (veja ${log})`)); });
  });
}

/**
 * Nuvem local (nuvem/local.mjs) com banco novo numa pasta temporária e o Gmail simulado, em porta livre; o banco do kit
 * entra pela carga inicial (POST /api/dados/importar, como o primeiro acesso), já com o administrador do kit.
 */
export async function abrirNuvem(raiz, pasta, banco, email) {
  const porta = await portaLivre();
  fs.mkdirSync(pasta, { recursive: true });
  const log = path.join(pasta, 'nuvem.log');
  const saida = fs.createWriteStream(log);
  const filho = guardarProcesso(spawn(process.execPath, [path.join('nuvem', 'local.mjs')], {
    cwd: raiz, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORTA: String(porta), NUVEM_DB: path.join(pasta, 'cofre.sqlite'), NUVEM_ARQUIVOS: path.join(pasta, 'arquivos'), ZERAR: '1', SIMULAR_GMAIL: '1', EMAIL_TESTE: email },
  }), 'nuvem local');
  filho.stdout.pipe(saida);
  filho.stderr.pipe(saida);
  await esperarSaida(filho, 'Nuvem de teste em', 20000, log);
  const origem = `http://localhost:${porta}`;
  const r = await fetch(`${origem}/api/dados/importar`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sistema': 'imoveis', Origin: origem }, body: JSON.stringify({ dados: banco }) });
  if (!r.ok) throw new Error(`a nuvem local recusou o banco do kit: ${r.status} ${await r.text()}`);
  return { porta, origem, pid: filho.pid, log };
}

/**
 * Versão PC numa pasta temporária (nunca em docs/offline/): roda uma cópia de tools/gerar-offline.mjs que grava em
 * ``destino`` e, depois, deixa o arquivo em LF com os resumos da CSP refeitos. No Windows o Git põe CRLF nos arquivos e o
 * gerador calcula o resumo com o "\r", mas o navegador lê o script sem ele: a CSP barrava tudo (a do GitHub, Linux, abre).
 */
export async function gerarVersaoPc(raiz, pasta) {
  fs.mkdirSync(pasta, { recursive: true });
  const destino = path.join(pasta, 'administracao-imoveis.html');
  let fonte = fs.readFileSync(path.join(raiz, 'tools', 'gerar-offline.mjs'), 'utf8');
  const trocas = [
    [/const RAIZ = path\.resolve\(path\.dirname\(fileURLToPath\(import\.meta\.url\)\), '\.\.'\);/, `const RAIZ = ${JSON.stringify(raiz)};`],
    [/import \{ hashDasFontes, DESTINO \} from '\.\/fontes-offline\.mjs';/, `import { hashDasFontes } from ${JSON.stringify(pathToFileURL(path.join(raiz, 'tools', 'fontes-offline.mjs')).href)};\nconst DESTINO = ${JSON.stringify(destino)};`],
  ];
  for (const [de, para] of trocas) {
    if (!de.test(fonte)) throw new Error(`tools/gerar-offline.mjs mudou (não achei ${de}): ajuste gerarVersaoPc em tools/kit-teste/servidores.mjs`);
    fonte = fonte.replace(de, para);
  }
  const copia = path.join(pasta, 'gerar-offline-kit.mjs');
  fs.writeFileSync(copia, fonte);
  const filho = guardarProcesso(spawn(process.execPath, [copia], { cwd: raiz, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false }), 'versão PC');
  let texto = '';
  filho.stdout.on('data', (b) => { texto += b; });
  filho.stderr.on('data', (b) => { texto += b; });
  const codigo = await new Promise((r) => filho.once('exit', r));
  if (codigo !== 0 || !fs.existsSync(destino)) throw new Error(`a versão PC não foi gerada (código ${codigo}): ${texto.slice(-600)}`);
  // LF e os resumos da CSP de novo, sobre o texto como o navegador lê
  let html = fs.readFileSync(destino, 'utf8').replace(/\r\n?/g, '\n');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const resumos = scripts.map((js) => `'sha256-${crypto.createHash('sha256').update(js, 'utf8').digest('base64')}'`).join(' ');
  if (!/script-src [^;]*;/.test(html)) throw new Error('a versão PC não tem script-src na CSP');
  html = html.replace(/script-src [^;]*;/, `script-src ${resumos};`);
  fs.writeFileSync(destino, html);
  return destino;
}

/** Um comando de teste do Node (ex.: tests/links-parametros.test.mjs) como processo guardado. */
export function rodarTesteNode(raiz, arquivo) {
  const filho = guardarProcesso(spawn(process.execPath, ['--test', arquivo], { cwd: raiz, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }), arquivo);
  let texto = '';
  filho.stdout.on('data', (b) => { texto += b; });
  filho.stderr.on('data', (b) => { texto += b; });
  return new Promise((r) => filho.once('exit', (codigo) => r({ ok: codigo === 0, texto })));
}
