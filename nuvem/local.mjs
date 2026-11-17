// Nuvem de teste no próprio computador (imita o Cloudflare): o site (docs/) e a /api/ do Worker, com o cofre num SQLite local.
// Uso: node nuvem/local.mjs  →  http://localhost:8787  (sem login do Access: MODO_TESTE só vale em localhost)
//      PORTA=8787 EMAIL_TESTE=dono@exemplo.com.br NUVEM_DB=nuvem/.local/cofre.sqlite
//      SIMULAR_GMAIL=1 → o envio de e-mail aparece ligado e só escreve aqui no console (nada vai ao Google);
//      com GMAIL_CLIENT_ID e GMAIL_CLIENT_SECRET (credencial "Aplicativo da Web" com o retorno http://localhost:8787/api/email/google/retorno),
//      o botão "Conectar o Gmail" (Dados e backup) liga de verdade e envia; GMAIL_REFRESH_TOKEN (jeito antigo) também vale.
// Os dados ficam em nuvem/.local/ (fora do git): o cofre em cofre.sqlite e os anexos e backups em arquivos/ (r2-disco.mjs).
// ZERAR=1 apaga os dois antes de abrir (começa do zero, sem banco apontando para anexo que não existe).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { CofreDO } from './cofre.mjs';
import { r2EmDisco } from './r2-disco.mjs';
import { atenderFicha } from './ficha-publica.mjs';
import { atender, avisador } from './worker.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(AQUI, '..', 'docs');
const PORTA = Number(process.env.PORTA || 8787);
const arquivoDb = process.env.NUVEM_DB || path.join(AQUI, '.local', 'cofre.sqlite');
const pastaR2 = process.env.NUVEM_ARQUIVOS || path.join(path.dirname(arquivoDb), 'arquivos');
if (process.env.ZERAR === '1') { fs.rmSync(arquivoDb, { force: true }); fs.rmSync(pastaR2, { recursive: true, force: true }); }
fs.mkdirSync(path.dirname(arquivoDb), { recursive: true });

const db = new DatabaseSync(arquivoDb);
const sql = { exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const R2 = r2EmDisco(pastaR2);
const cofre = new CofreDO({ storage: { sql, transactionSync: tx } }, { DADOS: R2 });
const env = {
  MODO_TESTE: '1', EMAIL_TESTE: process.env.EMAIL_TESTE || 'teste@exemplo.com.br', ORIGEM: `http://localhost:${PORTA}`,
  URL_FICHA: `http://localhost:${PORTA}/ficha`, // aqui a página da ficha fica em /ficha (lá, em ficha.ankjck.com.br)
  SIMULAR_GMAIL: process.env.SIMULAR_GMAIL === '1' ? '1' : '',
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(GMAIL|VAPID)_[A-Z_]+$/.test(k))),
  DADOS: R2, COFRE: { idFromName: (n) => n, get: () => ({ fetch: (req) => cofre.fetch(req) }) },
};
let semInternet = false; // GET /__internet?ligar=0 simula queda (testes no navegador)

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.xlsx': 'application/octet-stream', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  // só este computador pelo nome certo: um site que faz o próprio nome apontar para 127.0.0.1 ("DNS rebinding") chega com o
  // Host dele e é recusado (aqui o login é de mentira, MODO_TESTE)
  if (![`localhost:${PORTA}`, `127.0.0.1:${PORTA}`].includes(String(req.headers.host || '').toLowerCase())) { res.writeHead(421); res.end('endereço não reconhecido'); return; }
  try {
    if (url.pathname === '/__internet') { semInternet = url.searchParams.get('ligar') === '0'; res.end(semInternet ? 'sem internet' : 'com internet'); return; }
    // ficha pela internet: a página (/ficha) e as rotas públicas, como no endereço da ficha
    if (url.pathname === '/ficha' || url.pathname.startsWith('/api/publico/')) {
      if (semInternet) { req.socket.destroy(); return; }
      const corpo = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(await Array.fromAsync(req));
      const r = await atenderFicha(new Request(url, { method: req.method, headers: req.headers, body: corpo }), env, { avisar: avisador() });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (semInternet) { req.socket.destroy(); return; }
      const corpo = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(await Array.fromAsync(req));
      const r = await atender(new Request(url, { method: req.method, headers: req.headers, body: corpo }), env);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const alvo = path.normalize(path.join(DOCS, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!alvo.startsWith(DOCS + path.sep) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) { res.writeHead(404); res.end('não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(alvo).pipe(res);
  } catch (e) {
    console.error(e);
    res.writeHead(500); res.end('erro');
  }
}).listen(PORTA, '127.0.0.1', () => console.log(`Nuvem de teste em http://localhost:${PORTA} (e-mail ${env.EMAIL_TESTE}; dados em ${arquivoDb})`));
