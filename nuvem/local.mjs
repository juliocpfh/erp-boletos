// Nuvem de teste no próprio computador (imita o Cloudflare): o site (docs/) e a /api/ do Worker, com o cofre num SQLite local.
// Uso: node nuvem/local.mjs  →  http://localhost:8787  (sem login do Access: MODO_TESTE só vale em localhost)
//      PORTA=8787 EMAIL_TESTE=dono@exemplo.com.br NUVEM_DB=nuvem/.local/cofre.sqlite
// Os dados ficam em nuvem/.local/ (fora do git). Anexos e backups ficam só na memória (somem ao fechar).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { r2Falso } from '../tests/r2-falso.mjs';
import { CofreDO } from './cofre.mjs';
import { atender } from './worker.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(AQUI, '..', 'docs');
const PORTA = Number(process.env.PORTA || 8787);
const arquivoDb = process.env.NUVEM_DB || path.join(AQUI, '.local', 'cofre.sqlite');
fs.mkdirSync(path.dirname(arquivoDb), { recursive: true });

const db = new DatabaseSync(arquivoDb);
const sql = { exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const R2 = r2Falso();
const cofre = new CofreDO({ storage: { sql, transactionSync: tx } }, { DADOS: R2 });
const env = {
  MODO_TESTE: '1', EMAIL_TESTE: process.env.EMAIL_TESTE || 'teste@exemplo.com.br', ORIGEM: `http://localhost:${PORTA}`,
  DADOS: R2, COFRE: { idFromName: (n) => n, get: () => ({ fetch: (req) => cofre.fetch(req) }) },
};
let semInternet = false; // GET /__internet?ligar=0 simula queda (testes no navegador)

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.xlsx': 'application/octet-stream', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  try {
    if (url.pathname === '/__internet') { semInternet = url.searchParams.get('ligar') === '0'; res.end(semInternet ? 'sem internet' : 'com internet'); return; }
    if (url.pathname.startsWith('/api/')) {
      if (semInternet) { req.socket.destroy(); return; }
      const corpo = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(await Array.fromAsync(req));
      const r = await atender(new Request(url, { method: req.method, headers: req.headers, body: corpo }), env);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    const alvo = path.normalize(path.join(DOCS, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!alvo.startsWith(DOCS) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) { res.writeHead(404); res.end('não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(alvo).pipe(res);
  } catch (e) {
    console.error(e);
    res.writeHead(500); res.end('erro');
  }
}).listen(PORTA, '127.0.0.1', () => console.log(`Nuvem de teste em http://localhost:${PORTA} (e-mail ${env.EMAIL_TESTE}; dados em ${arquivoDb})`));
