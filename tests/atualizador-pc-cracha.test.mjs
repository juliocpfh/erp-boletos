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

test('atualizador: todo pedido tem tempo-limite; cópia aberta baixa 5 de cada vez, guarda as primeiras falhas e não roda duas vezes ao mesmo tempo', async () => {
  const pasta = pastaDoBackup();
  const cfg = { site: SITE, pasta, cracha: `ap1_${'A'.repeat(43)}` };
  const nomes = Array.from({ length: 23 }, (_, i) => `Sala 101/arquivo ${String(i + 1).padStart(2, '0')}.pdf`);
  const ruins = new Set(nomes.filter((_, i) => i % 3 === 0)); // 8 falham
  let juntos = 0; let maximo = 0; const semPrazo = []; let soltar; const primeiroPedido = new Promise((ok) => { soltar = ok; });
  const buscar = async (url, op = {}) => {
    const u = new URL(url);
    if (!(op.signal instanceof AbortSignal)) semPrazo.push(u.pathname);
    if (u.pathname.includes('/lista-tudo/')) return new Response(JSON.stringify({ arquivos: nomes.map((caminho) => ({ caminho, tamanho: 3, alterado: '1' })), mais: false }), { headers: { 'content-type': 'application/json' } });
    const c = decodeURIComponent(u.pathname.split('/arquivos/')[1]);
    juntos += 1; maximo = Math.max(maximo, juntos);
    soltar();
    await new Promise((ok) => { setTimeout(ok, 5); });
    juntos -= 1;
    if (ruins.has(c)) return c.endsWith('01.pdf') ? Promise.reject(Object.assign(new Error('abortado'), { name: 'TimeoutError' })) : new Response('{}', { status: 503 });
    return new Response('pdf');
  };
  const erros = [];
  const rodada = A.atualizarCopia(cfg, { buscar, erros });
  await primeiroPedido;
  assert.ok(fs.existsSync(path.join(pasta, A.ARQUIVO_TRAVA)), 'a trava fica na pasta enquanto roda');
  assert.deepEqual(await A.atualizarCopia(cfg, { buscar }), { ocupada: true }, 'outra rodada ao mesmo tempo não mexe em nada');
  assert.deepEqual(await rodada, { baixados: 15, apagados: 0, falhas: 8, total: 15 });
  assert.equal(maximo, A.BAIXAR_JUNTOS, 'cinco de cada vez');
  assert.deepEqual(semPrazo, [], 'nenhum pedido sem tempo-limite');
  assert.equal(erros.length, A.MAX_ERROS_REGISTRO, 'só as 5 primeiras falhas');
  assert.deepEqual(erros[0], { caminho: 'Sala 101/arquivo 01.pdf', motivo: 'demorou mais de 120 segundos' });
  assert.equal(erros[1].motivo, 'resposta 503');
  assert.match(A.linhasDeErros(erros), /^ {2}falhou: Sala 101\/arquivo 01\.pdf: demorou mais de 120 segundos\n {2}falhou: /);
  assert.ok(!fs.existsSync(path.join(pasta, A.ARQUIVO_TRAVA)), 'terminou: solta a trava');
  assert.ok(!fs.readdirSync(path.join(pasta, A.PASTA_COPIA, 'Sala 101')).some((n) => n.endsWith('.parte')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(pasta, A.ARQUIVO_COPIA), 'utf8')).falhas, 8);

  // trava de uma rodada que morreu (computador desligado no meio): nova, espera; velha, passa por cima
  fs.writeFileSync(path.join(pasta, A.ARQUIVO_TRAVA), `1 ${new Date(Date.now() - 60000).toISOString()}\n`);
  assert.deepEqual(await A.atualizarCopia(cfg, { buscar }), { ocupada: true });
  fs.writeFileSync(path.join(pasta, A.ARQUIVO_TRAVA), `1 ${new Date(Date.now() - A.VALIDADE_TRAVA - 60000).toISOString()}\n`);
  ruins.clear();
  assert.deepEqual(await A.atualizarCopia(cfg, { buscar }), { baixados: 8, apagados: 0, falhas: 0, total: 23 }, 'as que falharam voltam na rodada seguinte');
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('atualizador: a versão PC é gravada inteira (.parte e troca) e os pedidos dos dados e do programa têm tempo-limite', async () => {
  const { buscar: nuvemBuscar } = await nuvem();
  const pasta = pastaDoBackup();
  fs.writeFileSync(path.join(pasta, A.ARQUIVO_CHAVE), JSON.stringify(await B.criarChave('senha do backup de teste')));
  const semPrazo = [];
  const buscar = (url, op = {}) => { if (!(op.signal instanceof AbortSignal)) semPrazo.push(`${op.method || 'GET'} ${new URL(url).pathname}`); return nuvemBuscar(url, op); };
  const { cracha } = await L.entrarNaNuvem(SITE, { email: 'dono@exemplo.com.br', senha: SENHA, computador: 'PC' }, buscar);
  assert.equal((await A.atualizar(A.carregarConfig({}, { site: SITE, pasta, cracha }), { buscar, hoje: '2026-11-15' })).programa, 'atualizado');
  assert.deepEqual(semPrazo, []);
  assert.deepEqual(fs.readdirSync(path.join(pasta, A.PASTA_PROGRAMA)).sort(), [A.ARQUIVO_PROGRAMA, 'versao.txt'], 'sem .parte sobrando');
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('ligar: a senha não vai para a nuvem (só o resumo calculado aqui, igual ao do site) e resposta estranha é recusada', async () => {
  const { buscar } = await nuvem();
  const corpos = [];
  const espiao = (url, op = {}) => { corpos.push(String(op.body)); return buscar(url, op); };
  const d = await L.entrarNaNuvem(SITE, { email: 'dono@exemplo.com.br', senha: SENHA, computador: 'PC' }, espiao);
  assert.match(d.cracha, /^ap1_/);
  assert.equal(corpos.length, 2, 'dois pedidos: o sal e o resumo');
  assert.ok(corpos.every((c) => !c.includes(SENHA)), 'a senha não sai do computador');
  assert.equal(JSON.parse(corpos[1]).senha, `pbkdf2:${await resumoSenha(SENHA, 's1', 1000)}`);
  assert.equal(await L.resumoDaSenha('senha de teste 2026', 'sal', 150000), await resumoSenha('senha de teste 2026', 'sal', 150000), 'mesma conta de docs/js/auth.js');
  await assert.rejects(L.entrarNaNuvem(SITE, { email: 'dono@exemplo.com.br', senha: 'senha errada', computador: 'PC' }, buscar), /E-mail ou senha errados/);
  const resposta = (d2) => async () => new Response(JSON.stringify(d2), { headers: { 'content-type': 'application/json' } });
  for (const ruim of [{}, { desafio: { sal: 's', iteracoes: 5 } }, { desafio: { sal: 's', iteracoes: 9e9 } }, { desafio: { iteracoes: 600000 } }]) {
    await assert.rejects(L.entrarNaNuvem(SITE, { email: 'a@exemplo.com.br', senha: 'x', computador: 'PC' }, resposta(ruim)), /baixe a versão nova do programa/);
  }
});
