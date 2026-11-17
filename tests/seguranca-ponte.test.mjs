// Segurança da ponte do C6 (mutirão de 16/11): senha do exemplo, Host (DNS rebinding), CF-Connecting-IP falso, limite diário
// de boletos, limites do lote de pagamentos e o nome de quem envia o lote. Modo simulado, sem falar com o banco.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as P from '../ponte-c6/servidor.mjs';
import { conferirLimitesDoLote, nomeDeQuemEnvia } from '../ponte-c6/rotas-fase2.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-seg-'));
const SENHA = 'frase-longa-de-teste-com-mais-de-20';
const env = { CONTAS: 'ank', SIMULADO: '1', PONTE_SENHA: SENHA, ORIGENS: 'http://localhost:8000', PASTA_CONTAS: path.join(tmp, 'contas'),
  PASTA_NOTIFICACOES: path.join(tmp, 'n'), PASTA_REGISTROS: '', C6_ANK_CHAVE_PIX: 'chave-da-conta-ank', BOLETOS_POR_DIA: '3', HOSTS: 'banco.exemplo.com.br' };
const cfg = P.carregarConfig(env);
cfg.sem_atraso = true;
const servidor = P.criarServidor(cfg);
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const porta = servidor.address().port;
test.after(() => { servidor.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

/** Pedido cru (o fetch não deixa trocar o Host). */
const pedir = (metodo, caminho, cabecalhos = {}, corpo = null) => new Promise((ok, falhar) => {
  const texto = corpo ? JSON.stringify(corpo) : null;
  const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: metodo,
    headers: { Host: `127.0.0.1:${porta}`, ...(texto ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(texto) } : {}), ...cabecalhos } }, (res) => {
    const partes = []; res.on('data', (p) => partes.push(p));
    res.on('end', () => { const t = Buffer.concat(partes).toString('utf8'); let dados = t; try { dados = JSON.parse(t); } catch { /* texto */ } ok({ status: res.statusCode, cabecalhos: res.headers, dados }); });
  });
  req.on('error', falhar);
  if (texto) req.write(texto);
  req.end();
});

test('a ponte não sobe com a senha do exemplo publicado, e o exemplo vem sem senha', () => {
  assert.throws(() => P.carregarConfig({ ...env, PONTE_SENHA: 'troque-esta-frase-longa-de-senha' }), /senha do exemplo/);
  const exemplo = fs.readFileSync(new URL('../ponte-c6/.env.exemplo', import.meta.url), 'utf8');
  assert.match(exemplo, /^PONTE_SENHA=$/m);
  assert.doesNotMatch(exemplo, /^ORIGENS=.*github\.io/m);
  // sem ORIGENS, o padrão não inclui o github.io (que é de todos os projetos da conta)
  const semOrigens = P.carregarConfig({ ...env, ORIGENS: '' });
  assert.ok(semOrigens.origens.includes('https://erp.ankjck.com.br'));
  assert.ok(!semOrigens.origens.some((o) => o.includes('github.io')));
});

test('Host de outro site (DNS rebinding) é recusado; o local e o de HOSTS passam; Private-Network só para origem da lista', async () => {
  P.zerarTentativas();
  assert.equal((await pedir('GET', '/saude', { Host: 'site-malicioso.example' })).status, 421);
  assert.equal((await pedir('GET', '/saude', { Host: `site-malicioso.example:${porta}` })).status, 421);
  assert.equal((await pedir('GET', '/saude')).status, 200);
  assert.equal((await pedir('GET', '/saude', { Host: `localhost:${porta}` })).status, 200);
  assert.equal((await pedir('GET', '/saude', { Host: 'banco.exemplo.com.br' })).status, 200);
  const estranha = await pedir('OPTIONS', '/contas/ank/boletos', { Origin: 'https://site-malicioso.example' });
  assert.equal(estranha.cabecalhos['access-control-allow-private-network'], undefined);
  const daLista = await pedir('OPTIONS', '/contas/ank/boletos', { Origin: 'http://localhost:8000' });
  assert.equal(daLista.cabecalhos['access-control-allow-private-network'], 'true');
});

test('CF-Connecting-IP mandado pelo cliente não evita o bloqueio (só vale pelo Tunnel)', async () => {
  P.zerarTentativas();
  const status = [];
  for (let i = 0; i < 12; i++) status.push((await pedir('GET', '/contas', { 'X-Senha-Ponte': `errada-${i}`, 'CF-Connecting-IP': `203.0.113.${i}` })).status);
  assert.ok(status.includes(429), `esperava 429 entre ${status.join(',')}`);
  P.zerarTentativas();
});

test('limite geral de senhas erradas somando vários endereços', () => {
  P.zerarTentativas();
  const t = Date.now();
  for (let i = 0; i < 50; i++) P.registrarTentativa(`198.51.100.${i}`, false, t);
  assert.ok(P.bloqueioGeral(t + 1000) > 0);
  P.zerarTentativas();
  assert.equal(P.bloqueioGeral(), 0);
});

test('limite de boletos novos por dia e por conta (BOLETOS_POR_DIA)', async () => {
  P.zerarTentativas(); P.zerarLimiteDiario();
  const base = { amount: 100, due_date: '2026-12-10', description: 'ALUGUEL',
    payer: { name: 'Maria Exemplo', tax_id: '52998224725', address: { address: 'Rua das Flores, 45', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', zip_code: '80010000' } },
    payment_method: { bank_slip: { your_number: '7' } } };
  const status = [];
  for (let i = 0; i < 4; i++) {
    const r = await pedir('POST', '/contas/ank/boletos', { 'X-Senha-Ponte': SENHA }, { ...base, external_reference_id: `B0000000${i}ABCDEFGHIJ0000000`.slice(0, 26) });
    status.push(r.status);
  }
  assert.deepEqual(status, [201, 201, 201, 429]);
});

test('lote de pagamentos: quantidade, valor de cada um e soma com teto por conta', () => {
  const lim = { valor_maximo: 1000, lote_maximo: 1500, max_itens: 2 };
  assert.doesNotThrow(() => conferirLimitesDoLote([{ amount: 999.99 }, { amount: 500 }], lim));
  assert.throws(() => conferirLimitesDoLote([{ amount: 1 }, { amount: 1 }, { amount: 1 }], lim), /máximo nesta ponte é 2/);
  assert.throws(() => conferirLimitesDoLote([{ amount: 4999999.99 }], lim), /acima do máximo/);
  assert.throws(() => conferirLimitesDoLote([{ amount: 900 }, { amount: 900 }], lim), /soma do lote/);
  // a configuração lê o teto da conta
  assert.equal(P.carregarConfig({ ...env, C6_ANK_LOTE_MAXIMO: '1234' }).contas.ank.lote_maximo, 1234);
});

test('o nome de quem envia o lote sempre começa pelo nome fixo da ponte', () => {
  assert.equal(nomeDeQuemEnvia('administracao-imoveis', 'Dono'), 'administracao-imoveis - Dono');
  assert.equal(nomeDeQuemEnvia('ponte', `  <b>${'x'.repeat(80)}`).length, 'ponte - '.length + 40);
  assert.throws(() => nomeDeQuemEnvia('ponte', '   '), /uploader_name/);
});

test('comparação da senha sem depender do tamanho (SHA-256 + timingSafeEqual)', () => {
  assert.equal(P.textosIguais('abc', 'abc'), true);
  assert.equal(P.textosIguais('abc', 'abcd'), false);
  assert.equal(P.textosIguais('', 'x'), false);
});
