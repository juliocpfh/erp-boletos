// Registro de acessos da nuvem (mutirão 3000, 2ª rodada, frente lgpd): o que fica anotado, quem vê e a faxina pelo prazo da
// regra `dias_registro_acessos`. Dados fictícios.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Cofre, CofreDO, DIAS_ACESSOS } from '../nuvem/cofre.mjs';
import * as W from '../nuvem/worker.mjs';
import { definicaoRegra } from '../docs/js/config-regras.js';
import { r2Falso } from './r2-falso.mjs';

function sqlFalso() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    exec(q, ...p) {
      if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; }
      const linhas = db.prepare(q).all(...p).map((l) => ({ ...l }));
      return { toArray: () => linhas };
    },
  };
}
const tx = (sql) => (fn) => { sql.db.exec('BEGIN'); try { const r = fn(); sql.db.exec('COMMIT'); return r; } catch (e) { sql.db.exec('ROLLBACK'); throw e; } };
const DONO = 'dono@exemplo.com.br'; const OPERADOR = 'operador@exemplo.com.br'; const CONSULTA = 'consulta@exemplo.com.br';
const banco = () => ({
  formato: 'imoveis-v1', proxima_fatura: 1,
  usuarios: [{ id: 1, login: DONO, papel: 'admin', ativo: true }, { id: 3, login: OPERADOR, papel: 'operador', ativo: true }, { id: 4, login: CONSULTA, papel: 'consulta', ativo: true }],
  historico: [],
});

test('o prazo do registro de acessos é o mesmo da regra configurável', () => {
  const def = definicaoRegra('dias_registro_acessos');
  assert.deepEqual({ padrao: def.padrao, min: def.min, max: def.max }, DIAS_ACESSOS);
});

test('cofre: anota, só o administrador lista, resumo por pessoa e faxina pelo prazo da regra', () => {
  let hora = new Date('2026-11-17T10:00:00-03:00');
  const sql = sqlFalso(); const c = new Cofre(sql, tx(sql), () => hora);
  c.importar(banco(), DONO);
  c.anotarAcesso({ email: OPERADOR, rota: 'arquivos/Apto 1/rg.pdf', bytes: 400000, ip: '203.0.113.7' });
  c.anotarAcesso({ email: CONSULTA, rota: 'backups/imoveis-dados-2026-11-16.json', bytes: 300, resultado: 403 });
  assert.throws(() => c.listarAcessos({}, OPERADOR), /não pode/);
  const l = c.listarAcessos({}, DONO);
  assert.equal(l.acessos.length, 2);
  assert.equal(l.acessos[0].email, CONSULTA, 'o mais novo primeiro');
  assert.deepEqual(l.resumo.map((x) => [x.email, x.bytes, x.recusados]), [[OPERADOR, 400000, 0], [CONSULTA, 300, 1]]);
  assert.equal(c.listarAcessos({ email: OPERADOR }, DONO).acessos.length, 1);
  assert.equal(c.listarAcessos({ de: '2026-11-18' }, DONO).acessos.length, 0);
  assert.equal(c.listarAcessos({ ate: '2026-11-17' }, DONO).acessos.length, 2);
  assert.equal(l.dias, 180);
  // 181 dias depois: o padrão (180) apaga
  hora = new Date('2027-05-17T10:00:00-03:00');
  c.anotarAcesso({ email: DONO, rota: 'dados/tudo', bytes: 10 });
  c.limpar();
  assert.deepEqual(c.listarAcessos({}, DONO).acessos.map((x) => x.rota), ['dados/tudo']);
  // regra de 30 dias escolhida pelo administrador
  c.aplicar({ id: 'lote-regra-000001', ops: [{ op: 'inserir', tabela: 'config_regras', id: 1, dados: { id: 1, chave: 'dias_registro_acessos', valor: 30 } }] }, DONO);
  assert.equal(c.diasAcessos(), 30);
  hora = new Date('2027-06-20T10:00:00-03:00');
  c.limpar();
  assert.equal(c.listarAcessos({}, DONO).acessos.length, 0);
  // valor fora dos limites vale o padrão
  c.aplicar({ id: 'lote-regra-000002', ops: [{ op: 'alterar', tabela: 'config_regras', id: 1, campos: { valor: { antes: 30, depois: 5 } } }] }, DONO);
  assert.equal(c.diasAcessos(), 180);
});

function nuvem() {
  const sql = sqlFalso(); const r2 = r2Falso();
  const dobj = new CofreDO({ storage: { sql, transactionSync: tx(sql) } }, { DADOS: r2 });
  dobj.cofre.importar(banco(), DONO);
  const COFRE = { idFromName: (x) => x, get: () => ({ fetch: (req) => dobj.fetch(req) }) };
  const env = (email) => ({ MODO_TESTE: '1', EMAIL_TESTE: email, ORIGEM: 'http://localhost', DADOS: r2, COFRE, SIMULAR_GMAIL: '1', GMAIL_REMETENTE: 'empresa@exemplo.com.br' });
  const pedir = (email, metodo, rota, { corpo, cab = {}, ctx = null } = {}) => W.atender(new Request(`http://localhost/api/${rota}`, {
    method: metodo, body: corpo, headers: { 'X-Sistema': 'imoveis', 'CF-Connecting-IP': '203.0.113.9', ...(typeof corpo === 'string' ? { 'Content-Type': 'application/json' } : {}), ...cab },
  }), env(email), fetch, ctx);
  W.esquecerPapeis(); W.esquecerCrachas(); W.esquecerPedidosPorIp(); W.esquecerAcessos();
  const anotados = () => dobj.cofre.q('SELECT email, rota, bytes, ip, origem, resultado FROM acessos ORDER BY n');
  return { r2, dobj, pedir, anotados };
}

test('worker: banco inteiro, anexos, backups, e-mail e ficha pela internet ficam no registro; listas de anexos não', async () => {
  const { pedir, anotados } = nuvem();
  assert.equal((await pedir(OPERADOR, 'PUT', 'arquivos/Apto 1/Inquilinos/Fulano/rg.pdf', { corpo: new Uint8Array(1234), cab: { 'Content-Length': '1234' } })).status, 200);
  assert.equal((await pedir(CONSULTA, 'GET', 'arquivos/Apto 1/Inquilinos/Fulano/rg.pdf')).status, 200);
  assert.equal((await pedir(CONSULTA, 'GET', 'lista/arquivos/Apto 1/')).status, 200);
  assert.equal((await pedir(CONSULTA, 'GET', 'backups/imoveis-dados-2026-11-16.json')).status, 403);
  assert.equal((await pedir(CONSULTA, 'GET', 'dados/tudo')).status, 200);
  const corpo = JSON.stringify({ para: 'inquilino@exemplo.com', assunto: 'Boleto', texto: 'Olá' });
  assert.equal((await pedir(OPERADOR, 'POST', 'email/enviar', { corpo, cab: { 'Content-Length': String(corpo.length) } })).status, 200);
  await pedir(OPERADOR, 'GET', 'ficha-online/lista');
  const a = anotados();
  const rotas = a.map((x) => `${x.email} ${x.rota} ${x.resultado}`);
  assert.deepEqual(rotas, [
    `${OPERADOR} PUT arquivos/Apto 1/Inquilinos/Fulano/rg.pdf 200`,
    `${CONSULTA} arquivos/Apto 1/Inquilinos/Fulano/rg.pdf 200`,
    `${CONSULTA} backups/imoveis-dados-2026-11-16.json 403`,
    `${CONSULTA} dados/tudo 200`,
    `${OPERADOR} email/enviar 200`,
    `${OPERADOR} ficha-online/lista ${a.at(-1).resultado}`,
  ]);
  assert.equal(a[0].bytes, 1234, 'o tamanho enviado');
  assert.equal(a[1].bytes, 1234, 'o tamanho baixado');
  assert.ok(a[3].bytes > 100, 'o tamanho do banco');
  assert.equal(a[1].ip, '203.0.113.9');
  assert.ok(a.every((x) => x.origem === 'site'));
  // a tela: só o administrador
  assert.equal((await pedir(OPERADOR, 'GET', 'dados/acessos')).status, 403);
  const tela = await (await pedir(DONO, 'GET', 'dados/acessos?email=consulta%40exemplo.com.br')).json();
  assert.equal(tela.acessos.length, 3);
});

test('worker no Cloudflare: os acessos comuns esperam juntar (uma ida ao cofre), os importantes vão na hora', async () => {
  const { pedir, anotados, r2 } = nuvem();
  await r2.put('arquivos/a.pdf', 'x');
  const esperas = []; const ctx = { waitUntil: (p) => esperas.push(p) };
  for (let i = 0; i < W.ACESSOS_POR_ENVIO - 1; i += 1) await pedir(CONSULTA, 'GET', 'arquivos/a.pdf', { ctx });
  await Promise.all(esperas);
  assert.equal(anotados().length, 0, 'ainda juntando');
  await pedir(CONSULTA, 'GET', 'arquivos/a.pdf', { ctx });
  await Promise.all(esperas);
  assert.equal(anotados().length, W.ACESSOS_POR_ENVIO, 'o grupo foi de uma vez');
  await pedir(OPERADOR, 'DELETE', 'arquivos/a.pdf', { ctx });
  await Promise.all(esperas);
  assert.equal(anotados().at(-1).rota, 'DELETE arquivos/a.pdf', 'apagar vai na hora');
});

test('programa do PC: entrar (certo ou errado) fica anotado com a origem "pc"', async () => {
  const { dobj, pedir } = nuvem();
  const r = await pedir(DONO, 'POST', 'aparelho/entrar', { corpo: JSON.stringify({ email: OPERADOR, senha: `pbkdf2:${'0'.repeat(64)}`, computador: 'ESCRITORIO' }) });
  assert.equal(r.status, 401);
  const desafio = await pedir(DONO, 'POST', 'aparelho/entrar', { corpo: JSON.stringify({ email: OPERADOR, computador: 'ESCRITORIO' }) });
  assert.equal(desafio.status, 200);
  const a = dobj.cofre.q('SELECT email, rota, origem, resultado FROM acessos');
  assert.deepEqual(a, [{ email: OPERADOR, rota: 'aparelho/entrar (ESCRITORIO)', origem: 'pc', resultado: 401 }], 'o 1º passo (pedir o sal) não conta');
});
