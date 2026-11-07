// Atualizador da versão PC (atualizador-pc/atualizador.mjs): baixa os dados da nuvem com a chave de serviço e grava na pasta
// do backup seguro no MESMO formato cifrado que o sistema usa (abre com docs/js/backup-seguro.js e a senha do backup);
// baixa a versão PC só quando o site publicou uma mais nova; guarda 60 cópias diárias. Dados fictícios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as A from '../atualizador-pc/atualizador.mjs';
import * as B from '../docs/js/backup-seguro.js';

const SENHA = 'senha do backup de teste';
const banco = { formato: 'imoveis-v1', revisao: 7, usuarios: [{ id: 1, login: 'dono' }], contratos: [{ id: 1, inquilino_nome: 'Maria Exemplo', cpf: '529.982.247-25' }] };

function pastaDeTeste() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-seguro-'));
  return pasta;
}

/** Um site falso: /api/dados/tudo só com a chave de serviço certa; a versão PC com data de publicação. */
function siteFalso({ publicada = 'Sat, 07 Nov 2026 12:41:50 GMT' } = {}) {
  const site = { publicada, pedidos: [] };
  site.buscar = async (url, op = {}) => {
    const u = new URL(url); site.pedidos.push(`${op.method || 'GET'} ${u.pathname}`);
    const chaveOk = op.headers?.['CF-Access-Client-Id'] === 'id-teste' && op.headers?.['CF-Access-Client-Secret'] === 'segredo-teste';
    if (!chaveOk) return new Response('<html>login do Access</html>', { status: 302, headers: { 'content-type': 'text/html' } });
    if (u.pathname === '/api/dados/tudo') return new Response(JSON.stringify(banco), { headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/offline/administracao-imoveis.html') return new Response(op.method === 'HEAD' ? null : `<!doctype html><html>versão de ${site.publicada}</html>`, { headers: { 'content-type': 'text/html', 'last-modified': site.publicada } });
    return new Response('não achei', { status: 404 });
  };
  return site;
}

test('grava os dados de hoje cifrados na pasta do backup seguro, e o sistema abre com a senha do backup', async () => {
  const pasta = pastaDeTeste();
  fs.writeFileSync(path.join(pasta, A.ARQUIVO_CHAVE), JSON.stringify(await B.criarChave(SENHA)));
  const cfg = { site: 'https://erp.exemplo.com.br', clientId: 'id-teste', clientSecret: 'segredo-teste', pasta };
  const site = siteFalso();
  const r = await A.atualizar(cfg, { buscar: site.buscar, hoje: '2026-11-07' });
  assert.equal(r.dados, 'imoveis-dados-2026-11-07.bkp');
  assert.equal(r.programa, 'atualizado');
  const bytes = fs.readFileSync(path.join(pasta, A.PASTA_DIARIO, r.dados));
  assert.doesNotMatch(bytes.toString('latin1'), /Maria|529\.982/, 'nada legível sem a senha');
  const { info, dados } = await B.decifrar(bytes, SENHA);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(dados)), banco);
  assert.equal(info.tipo, 'diario'); assert.equal(info.origem, 'atualizador-pc'); assert.equal(info.revisao, 7);
  await assert.rejects(B.decifrar(bytes, 'senha errada'), /Senha do backup incorreta/);
  // a versão PC foi gravada com a data de publicação; na próxima vez, mesma data = não baixa de novo
  assert.match(fs.readFileSync(path.join(pasta, A.PASTA_PROGRAMA, A.ARQUIVO_PROGRAMA), 'utf8'), /versão de Sat, 07 Nov 2026/);
  site.pedidos.length = 0;
  assert.equal((await A.atualizar(cfg, { buscar: site.buscar, hoje: '2026-11-08' })).programa, 'em dia');
  assert.deepEqual(site.pedidos, ['GET /api/dados/tudo', 'HEAD /offline/administracao-imoveis.html']);
  // site publicou versão nova: baixa
  site.publicada = 'Sun, 08 Nov 2026 10:00:00 GMT';
  assert.equal((await A.atualizar(cfg, { buscar: site.buscar, hoje: '2026-11-08' })).programa, 'atualizado');
  assert.match(fs.readFileSync(path.join(pasta, A.PASTA_PROGRAMA, A.ARQUIVO_PROGRAMA), 'utf8'), /08 Nov 2026/);
  assert.match(fs.readFileSync(path.join(pasta, A.ARQUIVO_REGISTRO), 'utf8'), /ok dados=imoveis-dados-2026-11-08/);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('chave de serviço errada, pasta sem chave do backup e configuração incompleta dão erro claro', async () => {
  const pasta = pastaDeTeste();
  const cfg = { site: 'https://erp.exemplo.com.br', clientId: 'id-teste', clientSecret: 'segredo-teste', pasta };
  await assert.rejects(A.atualizar(cfg, { buscar: siteFalso().buscar }), /não é uma pasta de backup seguro/);
  fs.writeFileSync(path.join(pasta, A.ARQUIVO_CHAVE), JSON.stringify(await B.criarChave(SENHA)));
  await assert.rejects(A.atualizar({ ...cfg, clientSecret: 'outro' }, { buscar: siteFalso().buscar }), /não aceitou a chave de serviço/);
  assert.throws(() => A.carregarConfig({ SITE: 'https://x' }), /Falta no .env: ACCESS_CLIENT_ID, ACCESS_CLIENT_SECRET, PASTA_BACKUP/);
  assert.equal(A.carregarConfig({ ACCESS_CLIENT_ID: 'a', ACCESS_CLIENT_SECRET: 'b', PASTA_BACKUP: pasta, SITE: 'https://erp.exemplo.com.br/' }).site, 'https://erp.exemplo.com.br');
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('guarda as mesmas 60 cópias diárias do backup seguro', () => {
  assert.equal(A.MANTER_DIARIOS, B.MANTER_DIARIOS);
  const nomes = Array.from({ length: 63 }, (_, i) => `imoveis-dados-2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}.bkp`);
  assert.deepEqual(A.diariosParaApagar(nomes), B.diariosParaApagar(nomes));
  assert.equal(A.diariosParaApagar(nomes).length, 3);
});
