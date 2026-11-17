// O programa do PC se atualiza sozinho (atualizador-pc/se-atualizar.mjs): confere o aviso de versão nova da release do GitHub,
// baixa, confere tamanho, SHA-256 e que abre, e só então troca o programa instalado. Nada vai à internet: o GitHub é de mentira
// e o "programa" é um arquivo qualquer numa pasta temporária.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as P from '../atualizador-pc/programa.mjs';
import * as U from '../atualizador-pc/se-atualizar.mjs';

const VELHA = '2026-11-17 aaa1111';
const NOVA = '2026-11-20 bbb2222';

/** Um "programa" com a cara de um .exe (começa com MZ) e o tamanho mínimo aceito. */
const programaFalso = (marca) => { const b = Buffer.alloc(U.TAMANHO_MIN + 10, marca); b.write('MZ', 0, 'latin1'); return b; };
const aviso = (bytes, extra = {}) => JSON.stringify({ versao: NOVA, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), tamanho: bytes.length, ...extra });

function cenario({ manifesto, baixado, status = 200 } = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'programa-'));
  const exe = path.join(pasta, P.NOME_EXE);
  fs.writeFileSync(exe, programaFalso('v'));
  const novo = baixado ?? programaFalso('n');
  const pedidos = [];
  const buscar = async (url) => {
    pedidos.push(url);
    if (url.endsWith(U.NOME_MANIFESTO)) return new Response(manifesto ?? aviso(novo), { status });
    if (url.endsWith(U.NOME_BAIXAR)) {
      // em pedaços, como vem da internet
      const pedacos = [novo.subarray(0, 1000), novo.subarray(1000)];
      return new Response(new ReadableStream({ start(c) { for (const p of pedacos) c.enqueue(p); c.close(); } }));
    }
    return new Response('', { status: 404 });
  };
  const opcoes = { pasta, exe, atual: VELHA, rodando: exe, buscar, rodarVersao: () => NOVA };
  return { pasta, exe, novo, pedidos, opcoes };
}
const sobras = (pasta) => fs.readdirSync(pasta).filter((n) => n !== P.NOME_EXE).sort();

test('versão: troca só para uma diferente e de dia igual ou mais novo; aviso de versão conferido', () => {
  assert.equal(U.eMaisNova(NOVA, VELHA), true);
  assert.equal(U.eMaisNova(VELHA, VELHA), false, 'a mesma');
  assert.equal(U.eMaisNova('2026-11-10 ccc3333', VELHA), false, 'nunca volta para uma mais velha');
  assert.equal(U.eMaisNova('2026-11-17 ddd4444', VELHA), true, 'mesmo dia, outra publicação');
  assert.equal(U.eMaisNova('qualquer coisa', VELHA), false);
  assert.equal(U.eMaisNova(NOVA, ''), true, 'sem versão conhecida: aceita a publicada');
  const ok = U.lerManifesto(aviso(programaFalso('n')));
  assert.equal(ok.versao, NOVA);
  assert.throws(() => U.lerManifesto('<html>'), /legível/);
  assert.throws(() => U.lerManifesto(aviso(programaFalso('n'), { sha256: 'abc' })), /conferência/);
  assert.throws(() => U.lerManifesto(aviso(programaFalso('n'), { tamanho: 10 })), /tamanho/);
  assert.throws(() => U.lerManifesto(aviso(programaFalso('n'), { versao: '1.0' })), /versão válida/);
});

test('versão nova: baixa, confere e troca o programa instalado; o antigo sai na rodada seguinte', async () => {
  const { pasta, exe, novo, opcoes } = cenario();
  const r = await U.seAtualizar(opcoes);
  assert.equal(r.situacao, 'atualizado', r.texto);
  assert.match(r.texto, /de 2026-11-17 aaa1111 para 2026-11-20 bbb2222/);
  assert.ok(fs.readFileSync(exe).equals(novo), 'o programa no lugar é o novo');
  assert.deepEqual(sobras(pasta), [U.NOME_VELHO], 'o antigo fica ao lado até a próxima rodada (estava em uso)');
  // a próxima rodada já é o programa novo: apaga o antigo e está em dia
  const depois = await U.seAtualizar({ ...opcoes, atual: NOVA });
  assert.equal(depois.situacao, 'em dia');
  assert.deepEqual(sobras(pasta), []);
});

test('arquivo que não confere não troca nada (alterado, incompleto, maior, não é programa, não abre)', async () => {
  const casos = [
    ['alterado no caminho', (c) => ({ baixado: Buffer.concat([c.slice(0, -1), Buffer.from('x')]), manifesto: aviso(c) }), /não confere/],
    ['incompleto', (c) => ({ baixado: c.subarray(0, c.length - 5), manifesto: aviso(c) }), /incompleto/],
    ['maior', (c) => ({ baixado: Buffer.concat([c, Buffer.from('mais')]), manifesto: aviso(c) }), /maior/],
    ['não é programa', (c) => { const b = Buffer.from(c); b.write('XX', 0, 'latin1'); return { baixado: b, manifesto: aviso(b) }; }, /não é um programa/],
  ];
  for (const [nome, montar, erro] of casos) {
    const c = programaFalso('n');
    const { pasta, exe, opcoes } = cenario(montar(c));
    const r = await U.seAtualizar(opcoes);
    assert.equal(r.situacao, 'falhou', nome);
    assert.match(r.texto, erro, nome);
    assert.match(r.texto, /continua na versão 2026-11-17 aaa1111/);
    assert.ok(fs.readFileSync(exe).equals(programaFalso('v')), `${nome}: o programa antigo continua`);
    assert.deepEqual(sobras(pasta), [], `${nome}: o baixado foi apagado`);
  }
  const { pasta, exe, opcoes } = cenario();
  const r = await U.seAtualizar({ ...opcoes, rodarVersao: () => '' });
  assert.match(r.texto, /não abriu direito/);
  assert.ok(fs.readFileSync(exe).equals(programaFalso('v')));
  assert.deepEqual(sobras(pasta), []);
});

test('em dia, sem aviso publicado, GitHub fora e versão mais velha: não baixa o programa', async () => {
  for (const [manifesto, status, situacao] of [[undefined, 404, 'em dia'], [undefined, 500, 'falhou'], [JSON.stringify({ versao: VELHA, sha256: 'a'.repeat(64), tamanho: U.TAMANHO_MIN }), 200, 'em dia'],
    [JSON.stringify({ versao: '2026-11-01 eee5555', sha256: 'a'.repeat(64), tamanho: U.TAMANHO_MIN }), 200, 'em dia']]) {
    const { pedidos, opcoes, exe } = cenario({ manifesto, status });
    const r = await U.seAtualizar(opcoes);
    assert.equal(r.situacao, situacao, `${status} ${manifesto}`);
    assert.ok(!pedidos.some((u) => u.endsWith(U.NOME_BAIXAR)), 'não baixou o programa');
    assert.ok(fs.readFileSync(exe).equals(programaFalso('v')));
  }
});

test('só o programa instalado se atualiza (pelo Node ou de Downloads não mexe); uma troca por vez', async () => {
  const { pedidos, opcoes, pasta } = cenario();
  assert.equal((await U.seAtualizar({ ...opcoes, rodando: path.join(os.tmpdir(), 'Downloads', 'Instalar.exe') })).situacao, 'pulado');
  assert.equal((await U.seAtualizar({ ...opcoes, atual: '' })).situacao, 'pulado');
  assert.deepEqual(pedidos, [], 'nem confere a versão');
  fs.writeFileSync(path.join(pasta, U.NOME_TRAVA), 'x');
  const r = await U.seAtualizar(opcoes);
  assert.equal(r.situacao, 'pulado');
  assert.match(r.texto, /outra atualização/);
  // trava esquecida por uma rodada que morreu no meio: passa por cima depois de 30 minutos
  const depois = await U.seAtualizar({ ...opcoes, agora: () => Date.now() + U.VALIDADE_TRAVA + 60000 });
  assert.equal(depois.situacao, 'atualizado');
  assert.ok(!fs.existsSync(path.join(pasta, U.NOME_TRAVA)));
});

test('--atualizar: dados primeiro, depois o programa; falha do programa não muda o resultado dos dados', async () => {
  const ordem = []; const linhas = [];
  const rodar = (programa, ok = true) => P.executar(['--atualizar'], { env: { IMOVEIS_CONFIG: 'C:\\cfg' }, dizer: (t) => linhas.push(t), pausar: async () => {},
    garantir: () => 'sem programa instalado', atualizar: async () => { ordem.push('dados'); return ok; }, programa });
  assert.equal(await rodar(async () => { ordem.push('programa'); return { situacao: 'atualizado', texto: 'atualizado de A para B' }; }), 0);
  assert.deepEqual(ordem, ['dados', 'programa']);
  assert.ok(linhas.includes('Programa do PC: atualizado de A para B.'));
  assert.equal(await rodar(async () => { throw new Error('sem internet'); }), 0, 'dados ok: continua 0');
  assert.match(linhas.at(-1), /não deu para conferir a versão nova \(sem internet\)/);
  assert.equal(await rodar(async () => ({ situacao: 'em dia', texto: 'x' }), false), 1, 'dados falharam: 1');
  ordem.length = 0;
  await P.executar(['--arquivos'], { env: { IMOVEIS_CONFIG: 'C:\\cfg' }, dizer: () => {}, garantir: () => 'x', atualizar: async () => true, programa: async () => { ordem.push('programa'); return {}; } });
  assert.deepEqual(ordem, [], 'a de hora em hora (só arquivos) não mexe no programa');
});

test('o resultado vai para ultima-atualizacao.txt; o desinstalar leva também os arquivos da troca', async () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));
  fs.writeFileSync(path.join(cfg, 'config.json'), JSON.stringify({ pasta: backup }));
  fs.writeFileSync(path.join(backup, 'ultima-atualizacao.txt'), '2026-11-20T23:00:00.000Z ok dados=x\n');
  const env = { IMOVEIS_CONFIG: cfg };
  let pedido;
  const r = await P.atualizarPrograma({ env, exe: { versao: VELHA }, trocar: async (o) => { pedido = o; return { situacao: 'em dia', texto: `versão ${VELHA} (a mais nova)` }; } });
  assert.equal(r.situacao, 'em dia');
  assert.equal(pedido.exe, path.join(cfg, 'programa', P.NOME_EXE), 'o programa instalado');
  assert.equal(pedido.atual, VELHA);
  assert.equal(fs.readFileSync(path.join(backup, 'ultima-atualizacao.txt'), 'utf8'), `2026-11-20T23:00:00.000Z ok dados=x\n  programa do PC: versão ${VELHA} (a mais nova)\n`);
  await P.atualizarPrograma({ env, exe: null, trocar: async () => ({ situacao: 'pulado', texto: 'pelo Node' }) });
  assert.ok(!fs.readFileSync(path.join(backup, 'ultima-atualizacao.txt'), 'utf8').includes('pelo Node'), 'pulado não anota');
  for (const n of [U.NOME_NOVO, U.NOME_VELHO, U.NOME_TRAVA]) assert.ok(P.ARQUIVOS_DO_PROGRAMA.includes(n), n);
});
