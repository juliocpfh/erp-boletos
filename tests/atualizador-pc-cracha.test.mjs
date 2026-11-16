// Programa do PC com o crachá do aparelho (atualizador-pc/ligar.mjs + atualizador.mjs) contra o Worker e o cofre de verdade
// (nuvem/worker.mjs, cofre.mjs, aparelhos.mjs): a página de ligar (só 127.0.0.1, endereço com segredo), e-mail e senha
// conferidos na nuvem, crachá guardado cifrado (aqui uma cifra de mentira; a do Windows tem teste próprio, só no Windows),
// e as atualizações (dados, versão PC, cópia aberta) só com o crachá. Dados fictícios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as A from '../atualizador-pc/atualizador.mjs';
import * as L from '../atualizador-pc/ligar.mjs';
import { resumoSenha } from '../docs/js/auth.js';
import * as B from '../docs/js/backup-seguro.js';
import { CofreDO } from '../nuvem/cofre.mjs';
import * as W from '../nuvem/worker.mjs';
import { r2Falso } from './r2-falso.mjs';

const SITE = 'https://erp.exemplo.com.br';
const SENHA = 'senha do dono 2026';
const proteger = (t) => `P:${Buffer.from(t).toString('base64')}`; // cifra de mentira (a do Windows só existe no Windows)
const abrir = (t) => Buffer.from(t.slice(2), 'base64').toString();

async function nuvem() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const r2 = r2Falso();
  const dobj = new CofreDO({ storage: { sql, transactionSync: tx } }, { DADOS: r2 });
  dobj.cofre.importar({ formato: 'imoveis-v1', imoveis: [{ id: 1, nome: 'Sala 101' }], usuarios: [
    { id: 1, login: 'dono@exemplo.com.br', email: 'dono@exemplo.com.br', nome: 'Dono Exemplo', papel: 'admin', ativo: true, senha_sal: 's1', senha_hash: await resumoSenha(SENHA, 's1', 1000), senha_iteracoes: 1000 },
  ] }, 'dono@exemplo.com.br');
  await r2.put('arquivos/Sala 101/contrato.pdf', 'pdf de teste');
  W.esquecerPapeis(); W.esquecerCrachas();
  const env = { ACCESS_EQUIPE: 'exemplo.cloudflareaccess.com', ACCESS_AUD: 'aud', ORIGEM: SITE, DADOS: r2, COFRE: { idFromName: (n) => n, get: () => ({ fetch: (req) => dobj.fetch(req) }) } };
  const github = async (url, op = {}) => (op.headers?.['If-None-Match'] === '"v1"' ? new Response(null, { status: 304 }) : new Response(op.method === 'HEAD' ? null : '<!doctype html><html>versão PC</html>', { headers: { ETag: '"v1"' } }));
  const pedidos = [];
  // o "fetch" do atualizador: tudo que vai para o site cai no Worker (sem Access: só /api/aparelho/ responde)
  const buscar = async (url, op = {}) => { pedidos.push(`${op.method || 'GET'} ${new URL(url).pathname}`); return W.atender(new Request(url, op), env, github); };
  return { dobj, buscar, pedidos };
}

function pastaDoBackup() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-cracha-'));
  return pasta;
}

test('ligar o computador: página só deste computador, senha conferida na nuvem, crachá guardado cifrado e nunca a senha', async () => {
  const { buscar } = await nuvem();
  const pasta = pastaDoBackup();
  fs.writeFileSync(path.join(pasta, A.ARQUIVO_CHAVE), JSON.stringify(await B.criarChave('senha do backup de teste')));
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'config-pc-'));
  const env = { IMOVEIS_CONFIG: config, COMPUTERNAME: 'ESCRITORIO-01' };
  const vistos = {};
  const lig = await L.janelaDeLigar({
    site: SITE, env, buscar, proteger, escolherPasta: () => pasta,
    abrirNavegador: (url) => { vistos.fluxo = navegar(url); },
  });
  await vistos.fluxo; // a página responde depois de guardar: espera o "navegador" ler a resposta
  async function navegar(url) {
    {
      const base = new URL(url);
      const pagina = await (await fetch(url)).text();
      vistos.pagina = pagina;
      assert.equal((await fetch(`${base.origin}/outro-endereco`)).status, 404, 'sem o segredo do endereço não há página');
      const post = (rota, corpo, cab = {}) => fetch(`${url}/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cab }, body: JSON.stringify(corpo) });
      vistos.outroSite = (await post('ligar', {}, { Origin: 'https://site-estranho.exemplo' })).status;
      vistos.pasta = (await (await post('pasta', {})).json()).pasta;
      vistos.semPasta = (await (await post('ligar', { email: 'dono@exemplo.com.br', senha: SENHA, computador: 'X', pasta: os.tmpdir() })).json()).erro;
      vistos.errada = (await (await post('ligar', { email: 'dono@exemplo.com.br', senha: 'senha errada', computador: 'X', pasta })).json()).erro;
      vistos.ok = (await (await post('ligar', { email: 'dono@exemplo.com.br', senha: SENHA, computador: 'ESCRITORIO-01', pasta })).json()).texto;
    }
  }
  assert.match(vistos.pagina, /value="ESCRITORIO-01"/, 'nome do computador já vem preenchido');
  assert.equal(vistos.outroSite, 403, 'outro site aberto no navegador não liga nada');
  assert.equal(vistos.pasta, pasta);
  assert.match(vistos.semPasta, /não é a do backup seguro/);
  assert.equal(vistos.errada, 'E-mail ou senha errados.');
  assert.match(vistos.ok, /Pronto: ESCRITORIO-01 está ligado ao sistema com o acesso de Dono Exemplo/);
  assert.deepEqual([lig.computador, lig.login, lig.pasta, lig.cracha], ['ESCRITORIO-01', 'dono@exemplo.com.br', pasta, undefined]);

  // guardado: o crachá só cifrado, a senha em lugar nenhum
  const guardados = fs.readdirSync(config).map((n) => fs.readFileSync(path.join(config, n), 'utf8')).join('\n');
  assert.ok(!guardados.includes(SENHA));
  const lido = L.lerLigacao(env, { abrir });
  assert.match(lido.cracha, /^ap1_/);
  assert.ok(!guardados.includes(lido.cracha), 'o crachá não fica legível no disco');
  L.esquecerLigacao(env);
  assert.equal(L.lerLigacao(env, { abrir }), null);
  fs.rmSync(pasta, { recursive: true, force: true }); fs.rmSync(config, { recursive: true, force: true });
});

test('atualizar com o crachá: dados cifrados, versão PC pelo ETag e cópia aberta, sem .env nem chave de serviço', async () => {
  const { dobj, buscar, pedidos } = await nuvem();
  const pasta = pastaDoBackup();
  fs.writeFileSync(path.join(pasta, A.ARQUIVO_CHAVE), JSON.stringify(await B.criarChave('senha do backup de teste')));
  const { cracha } = await L.entrarNaNuvem(SITE, { email: 'dono@exemplo.com.br', senha: SENHA, computador: 'ESCRITORIO-01' }, buscar);
  const cfg = A.carregarConfig({}, { site: SITE, pasta, cracha });
  const r = await A.atualizar(cfg, { buscar, hoje: '2026-11-15' });
  assert.deepEqual(r, { dados: 'imoveis-dados-2026-11-15.bkp', programa: 'atualizado' });
  const { dados } = await B.decifrar(fs.readFileSync(path.join(pasta, A.PASTA_DIARIO, r.dados)), 'senha do backup de teste');
  assert.equal(JSON.parse(new TextDecoder().decode(dados)).imoveis[0].nome, 'Sala 101');
  assert.equal(fs.readFileSync(path.join(pasta, A.PASTA_PROGRAMA, 'versao.txt'), 'utf8'), '"v1"');
  assert.equal((await A.atualizar(cfg, { buscar, hoje: '2026-11-16' })).programa, 'em dia', 'mesma versão: não baixa de novo');
  const copia = await A.atualizarCopia(cfg, { buscar });
  assert.equal(copia.baixados, 1);
  assert.equal(fs.readFileSync(path.join(pasta, A.PASTA_COPIA, 'Sala 101', 'contrato.pdf'), 'utf8'), 'pdf de teste');
  assert.ok(pedidos.filter((p) => !p.endsWith('/entrar')).every((p) => p.includes('/api/aparelho/')), 'tudo pelo caminho do aparelho');

  // desligado em Usuários: o programa avisa o que fazer
  dobj.cofre.sql.exec('UPDATE aparelhos SET desligado_em = ?', new Date().toISOString());
  W.esquecerCrachas();
  await assert.rejects(A.atualizar(cfg, { buscar, hoje: '2026-11-17' }), /não está mais ligado ao sistema/);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('sem a regra Bypass no Access, ligar explica o que falta', async () => {
  const access = async () => new Response('<html>login do Access</html>', { status: 302, headers: { 'content-type': 'text/html' } });
  await assert.rejects(L.entrarNaNuvem(SITE, { email: 'a@exemplo.com.br', senha: 'x', computador: 'PC' }, access), /falta a regra "Bypass" do caminho \/api\/aparelho/);
});

test('cifra do Windows (DPAPI): abre de volta só nesta conta', { skip: process.platform !== 'win32' }, () => {
  const t = 'ap1_crachaDeTesteQueNaoValeNada_0123456789abcd';
  const c = L.protegerNoWindows(t);
  assert.ok(!c.includes(t));
  assert.equal(L.abrirNoWindows(c), t);
});
