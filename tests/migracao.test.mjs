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
  // atraso: ms por pedido de anexo (para ver vários ao mesmo tempo); recusar/cair: trecho do caminho de um PUT
  const estado = { internet: true, quedaApos: Infinity, atraso: 0, emAndamento: 0, pico: 0, pedidos: [], recusar: null, cair: null };
  const buscar = async (url, op = {}) => {
    if (!estado.internet || estado.quedaApos-- <= 0) throw new TypeError('Failed to fetch');
    const u = decodeURIComponent(new URL(url, 'http://localhost:8787/').pathname);
    if (u.startsWith('/api/dados/')) return atender(new Request(new URL(url, 'http://localhost:8787/'), { ...op, headers: { Origin: 'http://localhost:8787', ...op.headers } }), env);
    estado.pedidos.push(`${op.method || 'GET'} ${u}`);
    estado.emAndamento += 1; estado.pico = Math.max(estado.pico, estado.emAndamento);
    try {
      if (estado.atraso) await new Promise((ok) => { setTimeout(ok, estado.atraso); });
      if (op.method === 'PUT' && estado.cair && u.includes(estado.cair)) { estado.caiuEm = estado.pedidos.length; throw new TypeError('Failed to fetch'); }
      if (op.method === 'PUT' && estado.recusar && u.includes(estado.recusar)) return new Response(JSON.stringify({ erro: 'Tipo de arquivo recusado.' }), { status: 415, headers: { 'Content-Type': 'application/json' } });
      return await atender(new Request(new URL(url, 'http://localhost:8787/'), { ...op, headers: { Origin: 'http://localhost:8787', ...op.headers } }), env);
    } finally { estado.emAndamento -= 1; }
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

function pastaFicticia({ extras = 0 } = {}) {
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
  for (let i = 1; i <= extras; i += 1) anexo(`arquivos/Apto 604/Comprovantes/comprovante ${String(i).padStart(2, '0')}.pdf`, `%PDF ${'x'.repeat(i * 10)}`);
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

test('envia 4 ao mesmo tempo; cada pasta é listada uma vez só; o andamento sobe certo até o fim', async () => {
  const raiz = pastaFicticia({ extras: 12 });
  const { estado, sinc, anexos } = nuvemDeTeste();
  await sinc.iniciar();
  estado.atraso = 15;
  const andamento = [];
  const r = await levarParaNuvem(new PastaDisco(raiz), { anexos, sinc, aoAndar: (p) => { if (p.fase === 'anexos') andamento.push(p); } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.total, 16);
  assert.equal(estado.pico, 4, 'no máximo (e de fato) 4 ao mesmo tempo');
  const listas = estado.pedidos.filter((p) => p.startsWith('GET /api/lista/'));
  const enviados = listas.slice(0, listas.length / 2); // metade no envio, metade na conferência
  assert.equal(new Set(enviados).size, enviados.length, `nenhuma lista pedida em dobro: ${enviados}`);
  assert.equal(enviados.length, 5, 'Inquilinos/Maria, IPTU/2026, Anúncio, Comprovantes, modelos');
  for (let i = 1; i < andamento.length; i += 1) {
    assert.ok(andamento[i].feitos >= andamento[i - 1].feitos && andamento[i].bytes >= andamento[i - 1].bytes, 'andamento nunca volta');
  }
  assert.equal(andamento.at(-1).feitos, 16);
  assert.equal(andamento.at(-1).bytes, andamento.at(-1).totalBytes);
  assert.ok(!estado.pedidos.some((p) => p.startsWith('GET /api/arquivos/')), 'a conferência não baixa os arquivos');
  // de novo (substituindo): tudo pulado, nenhum envio
  estado.pedidos = [];
  const r2 = await levarParaNuvem(new PastaDisco(raiz), { anexos, sinc, substituir: true });
  assert.deepEqual([r2.ok, r2.pulados], [true, 16]);
  assert.ok(!estado.pedidos.some((p) => p.startsWith('PUT ')), 'nada reenviado');
  fs.rmSync(raiz, { recursive: true, force: true });
});

test('arquivo recusado pela nuvem: os outros sobem e o recusado aparece no relatório', async () => {
  const raiz = pastaFicticia({ extras: 6 });
  const { estado, sinc, anexos } = nuvemDeTeste();
  await sinc.iniciar();
  estado.atraso = 5; estado.recusar = 'comprovante 03';
  const r = await levarParaNuvem(new PastaDisco(raiz), { anexos, sinc });
  assert.deepEqual(r.recusados, [{ caminho: 'arquivos/Apto 604/Comprovantes/comprovante 03.pdf', motivo: 'Tipo de arquivo recusado.' }]);
  assert.deepEqual(r.faltando, ['arquivos/Apto 604/Comprovantes/comprovante 03.pdf']);
  assert.equal(r.ok, false);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test('internet cai num envio com outros em andamento: espera os outros, não começa novo, avisa; de novo termina', async () => {
  const raiz = pastaFicticia({ extras: 12 });
  const { estado, sinc, anexos } = nuvemDeTeste();
  await sinc.iniciar();
  estado.atraso = 15; estado.cair = 'comprovante 02';
  await assert.rejects(levarParaNuvem(new PastaDisco(raiz), { anexos, sinc }), (e) => e.esperado && /A internet caiu no arquivo arquivos\/Apto 604\/Comprovantes\/comprovante 02\.pdf\. Clique de novo: o que já subiu é pulado\./.test(e.message));
  assert.equal(estado.emAndamento, 0, 'os envios em andamento terminaram antes do aviso');
  assert.ok(estado.caiuEm, 'caiu no meio');
  assert.deepEqual(estado.pedidos.slice(estado.caiuEm), [], 'nenhum envio novo começou depois da queda');
  assert.equal(sinc.atual()?.contratos?.length ?? 0, 0, 'o banco não foi enviado');
  estado.cair = null;
  const r = await levarParaNuvem(new PastaDisco(raiz), { anexos, sinc });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(r.pulados >= 1 && r.pulados < 16, `pulou o que já tinha subido (${r.pulados})`);
  fs.rmSync(raiz, { recursive: true, force: true });
});

test('pasta sem o arquivo de dados: avisa para escolher a pasta certa', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'pasta-errada-'));
  const { sinc, anexos } = nuvemDeTeste();
  await assert.rejects(levarParaNuvem(new PastaDisco(raiz), { anexos, sinc }), /não tem o arquivo/);
  fs.rmSync(raiz, { recursive: true, force: true });
});
