// Etapa 4 (docs/js/migracao.js): leva uma pasta de dados fictícia para a nuvem de teste (Worker + cofre + R2 de mentira)
// e confere; repetir pula o que já subiu; a pasta não é alterada. Dados fictícios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { levarParaNuvem } from '../docs/js/migracao.js';
import * as N from '../docs/js/nuvem.js';
import { AnexosNuvem } from '../docs/js/pasta-nuvem.js';
import * as R from '../docs/js/regras.js';
import { CofreDO } from '../nuvem/cofre.mjs';
import { atender } from '../nuvem/worker.mjs';
import { PastaDisco } from './pasta-disco.mjs';
import { r2Falso } from './r2-falso.mjs';

function nuvemDeTeste() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const R2 = r2Falso();
  const cofre = new CofreDO({ storage: { sql, transactionSync: tx } }, { DADOS: R2 });
  const env = { MODO_TESTE: '1', EMAIL_TESTE: 'dono@exemplo.com.br', ORIGEM: 'http://localhost:8787', DADOS: R2, COFRE: { idFromName: (n) => n, get: () => ({ fetch: (q) => cofre.fetch(q) }) } };
  const estado = { internet: true, quedaApos: Infinity };
  const buscar = async (url, op = {}) => {
    if (!estado.internet || estado.quedaApos-- <= 0) throw new TypeError('Failed to fetch');
    return atender(new Request(new URL(url, 'http://localhost:8787/'), { ...op, headers: { Origin: 'http://localhost:8787', ...op.headers } }), env);
  };
  const api = async (metodo, rota, corpo) => {
    const r = await buscar(`http://localhost:8787/api/dados/${rota}`, { method: metodo, headers: metodo === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Sistema': 'imoveis' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const d = await r.json();
    if (!r.ok) throw new N.ErroNuvem(d.erro, r.status, d);
    return d;
  };
  const mem = () => { const m = new Map(); return { ler: async (k) => m.get(k), gravar: async (k, v) => { m.set(k, v); }, apagar: async (k) => { m.delete(k); } }; };
  return { R2, estado, sinc: new N.Sincronia({ api, guardar: mem() }), anexos: new AnexosNuvem({ base: 'http://localhost:8787/api/', buscar, guardar: mem() }) };
}

function pastaFicticia() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'pasta-dados-'));
  const d = R.bancoVazio();
  R.inserir(d, 'usuarios', { login: 'dono@exemplo.com.br', nome: 'Dono', papel: 'admin', ativo: true }, 'teste');
  R.inserir(d, 'imoveis', { nome: 'Apto 604', endereco: 'Rua das Flores, 45' }, 'teste');
  R.inserir(d, 'contratos', { imovel_id: 1, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', valor: 364445 }, 'teste');
  d.proxima_fatura = 157;
  fs.writeFileSync(path.join(raiz, 'imoveis-dados.json'), JSON.stringify(d, null, 1));
  const anexo = (rel, conteudo) => { const c = path.join(raiz, ...rel.split('/')); fs.mkdirSync(path.dirname(c), { recursive: true }); fs.writeFileSync(c, conteudo); };
  anexo('arquivos/Apto 604/Inquilinos/Maria Exemplo/contrato assinado.pdf', '%PDF contrato');
  anexo('arquivos/Apto 604/IPTU/2026/guia.pdf', '%PDF guia');
  anexo('arquivos/Apto 604/Anúncio/foto 1.jpg', Buffer.alloc(3000, 7));
  anexo('modelos/fatura-modelo.xlsx', 'xlsx');
  anexo('backups/imoveis-dados-2026-11-05.json', '{}'); // backups da pasta não vão
  return raiz;
}

test('leva banco e anexos para a nuvem e confere tudo; a pasta não muda', async () => {
  const raiz = pastaFicticia();
  const antes = fs.readFileSync(path.join(raiz, 'imoveis-dados.json'), 'utf8');
  const { R2, sinc, anexos } = nuvemDeTeste();
  assert.equal(await sinc.iniciar(), null, 'nuvem vazia');
  const fases = new Set();
  const r = await levarParaNuvem(new PastaDisco(raiz), { anexos, sinc, aoAndar: (p) => fases.add(p.fase) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.total, r.pulados, r.recusados.length, r.diferencas.length, r.faltando.length], [4, 0, 0, 0, 0]);
  assert.deepEqual([...fases], ['anexos', 'dados', 'conferencia']);
  assert.deepEqual([...R2.m.keys()].filter((k) => !k.startsWith('backups/')).sort(), [
    'arquivos/Apto 604/Anúncio/foto 1.jpg', 'arquivos/Apto 604/IPTU/2026/guia.pdf', 'arquivos/Apto 604/Inquilinos/Maria Exemplo/contrato assinado.pdf', 'modelos/fatura-modelo.xlsx']);
  assert.ok(![...R2.m.keys()].includes('backups/imoveis-dados-2026-11-05.json'), 'backup da pasta não vai');
  assert.equal(sinc.atual().contratos[0].inquilino_nome, 'Maria Exemplo');
  assert.equal(sinc.atual().proxima_fatura, 157);
  assert.equal(fs.readFileSync(path.join(raiz, 'imoveis-dados.json'), 'utf8'), antes, 'a pasta não foi alterada');
  // de novo, sem confirmar: a nuvem já tem dados
  await assert.rejects(levarParaNuvem(new PastaDisco(raiz), { anexos, sinc }), /já tem dados/);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test('internet cai no meio: avisa; clicar de novo pula o que já subiu e termina', async () => {
  const raiz = pastaFicticia();
  const { estado, sinc, anexos } = nuvemDeTeste();
  await sinc.iniciar();
  estado.quedaApos = 5; // alguns pedidos e cai
  await assert.rejects(levarParaNuvem(new PastaDisco(raiz), { anexos, sinc }), /caiu/);
  estado.quedaApos = Infinity;
  const r = await levarParaNuvem(new PastaDisco(raiz), { anexos, sinc });
  assert.equal(r.ok, true);
  assert.ok(r.pulados >= 1, 'o que já tinha subido foi pulado');
  fs.rmSync(raiz, { recursive: true, force: true });
});

test('pasta sem o arquivo de dados: avisa para escolher a pasta certa', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'pasta-errada-'));
  const { sinc, anexos } = nuvemDeTeste();
  await assert.rejects(levarParaNuvem(new PastaDisco(raiz), { anexos, sinc }), /não tem o arquivo/);
  fs.rmSync(raiz, { recursive: true, force: true });
});
