// Programa do PC num arquivo só (atualizador-pc/programa.mjs, o que vai dentro do .exe gerado por tools/gerar-exe.mjs):
// argumentos, ajuda, as tarefas do Windows (mesmos nomes de instalar-tarefa.cmd, para trocar as antigas) e o .vbs que roda
// sem janela. Nada é criado de verdade: o schtasks é de mentira.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as P from '../atualizador-pc/programa.mjs';

const rodarPrograma = async (args, extra = {}) => {
  const linhas = []; const chamadas = [];
  const codigo = await P.executar(args, { env: { IMOVEIS_CONFIG: 'C:\\cfg' }, dizer: (t) => linhas.push(t), pausar: async () => {}, atualizar: async (a) => { chamadas.push(a); return extra.ok ?? true; } });
  return { codigo, texto: linhas.join('\n'), chamadas };
};

test('ajuda, versão e argumento estranho', async () => {
  const ajuda = await rodarPrograma(['--ajuda']);
  assert.equal(ajuda.codigo, 0);
  for (const a of ['--ligar', '--atualizar', '--arquivos', '--instalar', '--desinstalar', '--versao', '--simular']) assert.ok(ajuda.texto.includes(a), a);
  assert.equal((await rodarPrograma(['--versao'])).codigo, 0);
  const estranho = await rodarPrograma(['--bobagem']);
  assert.equal(estranho.codigo, 2);
  assert.match(estranho.texto, /Não entendi: --bobagem/);
  assert.equal((await rodarPrograma(['--ligar', '--arquivos'])).codigo, 2, 'um pedido por vez');
});

test('atualizar, só arquivos e ligar chamam a rotina do atualizador; falha vira código 1', async () => {
  assert.deepEqual((await rodarPrograma(['--atualizar'])).chamadas, [[]]);
  assert.deepEqual((await rodarPrograma(['--arquivos'])).chamadas, [['--arquivos']]);
  assert.deepEqual((await rodarPrograma(['--ligar'])).chamadas, [['--ligar']]);
  assert.equal((await rodarPrograma(['--arquivos'], { ok: false })).codigo, 1);
});

test('tarefas do Windows: mesmos nomes e horários de instalar-tarefa.cmd, apontando para o .exe instalado', () => {
  const cmd = fs.readFileSync(path.join(import.meta.dirname, '..', 'atualizador-pc', 'instalar-tarefa.cmd'), 'utf8');
  const tarefas = P.comandosDeCriar('C:\\cfg\\programa');
  assert.equal(tarefas.length, 3);
  for (const t of tarefas) {
    assert.ok(cmd.includes(`/TN "${t.nome}"`), `nome igual ao do .cmd: ${t.nome}`);
    assert.ok(cmd.includes(t.quando.join(' ')), `quando igual ao do .cmd: ${t.quando.join(' ')}`);
    assert.equal(t.comando[t.comando.indexOf('/TN') + 1], t.nome);
  }
  const tr = (i) => tarefas[i].comando.at(-1);
  assert.equal(tr(0), '"C:\\cfg\\programa\\Administracao-de-Imoveis.exe" --atualizar');
  assert.equal(tr(1), '"C:\\cfg\\programa\\Administracao-de-Imoveis.exe" --atualizar');
  assert.equal(tr(2), 'wscript.exe "C:\\cfg\\programa\\rodar-escondido.vbs" --arquivos', 'a de hora em hora roda sem janela');
});

test('criar e apagar tarefas: diz o que falhou e não apaga o que não existe', () => {
  const feitos = [];
  const falharam = P.criarTarefas('C:\\cfg\\programa', { dizer: () => {}, rodar: (a) => { feitos.push(a); return { status: a.includes('ONLOGON') ? 1 : 0 }; } });
  assert.equal(feitos.length, 3);
  assert.deepEqual(falharam.map((t) => t.nome), ['Imoveis - atualizador da versao PC (ao entrar)'], 'a de "ao entrar" pede administrador');
  const apagar = [];
  P.apagarTarefas({ dizer: () => {}, rodar: (a) => { apagar.push(a.join(' ')); return { status: a[0] === '/Query' && a[2].includes('hora em hora') ? 1 : 0 }; } });
  assert.equal(apagar.filter((a) => a.startsWith('/Delete')).length, 2);
});

test('simular não mexe em nada e mostra os comandos; o .vbs não leva o caminho (nome de usuário com acento)', async () => {
  const sim = await rodarPrograma(['--instalar', '--simular']);
  assert.equal(sim.codigo, 0);
  assert.match(sim.texto, /nada foi copiado nem criado/);
  assert.match(sim.texto, /schtasks \/Create \/F \/SC HOURLY/);
  assert.match((await rodarPrograma(['--desinstalar', '--simular'])).texto, /nada foi apagado/);
  const semExe = await rodarPrograma(['--instalar']);
  assert.equal(semExe.codigo, 1, 'pelo Node não instala (só o .exe)');
  const vbs = P.textoVbs();
  assert.ok(/^[\x00-\x7f]*$/.test(vbs), 'só letras sem acento');
  assert.ok(vbs.includes(`\\${P.NOME_EXE}"""`) && vbs.includes(', 0, False'), 'roda o .exe da mesma pasta, escondido');
});

// Botão "Abrir a pasta no Explorer" (endereço imoveis-pasta:, pedido do dono de 17/11). Nada é registrado de verdade: o
// reg.exe e o Explorer são de mentira.
const PASTA_PROG = 'C:\\Users\\Maria Exemplo\\AppData\\Local\\Administracao de Imoveis\\programa';
const cfgTemp = (pasta) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'programa-pc-'));
  if (pasta !== undefined) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ site: 'https://erp.exemplo.com.br', pasta }));
  return dir;
};

test('protocolo imoveis-pasta: registrado só para este usuário, chamando o .vbs sem nada do endereço', () => {
  const cmds = P.comandosDoProtocolo(PASTA_PROG, { SystemRoot: 'C:\\Windows' });
  assert.equal(P.CHAVE_PROTOCOLO, 'HKCU\\Software\\Classes\\imoveis-pasta');
  for (const a of cmds) {
    assert.equal(a[0], 'add'); assert.ok(a[1].startsWith('HKCU\\Software\\Classes\\imoveis-pasta'), 'HKCU: sem administrador'); assert.equal(a.at(-1), '/f');
    assert.ok(!a.join(' ').includes('%'), 'sem %1: o endereço não entra no comando');
  }
  assert.deepEqual(cmds[1], ['add', P.CHAVE_PROTOCOLO, '/v', 'URL Protocol', '/d', '', '/f']);
  const comando = cmds.find((a) => a[1].endsWith('\\shell\\open\\command'));
  assert.equal(comando[comando.indexOf('/d') + 1], `"C:\\Windows\\System32\\wscript.exe" "${PASTA_PROG}\\abrir-pasta.vbs"`, 'caminho com espaço entre aspas');
  // as aspas chegam inteiras ao programa chamado (o reg.exe lê a linha de comando com a mesma regra do Node)
  const eco = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', ...comando], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(eco.stdout), comando);
  const vbs = P.textoVbsPasta();
  assert.ok(/^[\x00-\x7f]*$/.test(vbs), 'só letras sem acento');
  assert.ok(vbs.includes(`\\${P.NOME_EXE}"" --abrir-pasta", 0, True)`), 'roda o .exe da mesma pasta, escondido, só com --abrir-pasta');
  assert.ok(!/WScript\.Arguments/.test(vbs), 'não repassa argumento nenhum');
});

test('--abrir-pasta abre só a pasta configurada e ignora o que vem no endereço', async () => {
  const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-seguro-'));
  const abertas = [];
  const abrir = (p) => abertas.push(p);
  const rodar = (args, env) => P.executar(args, { env, dizer: () => {}, pausar: async () => {}, abrir, atualizar: async () => { throw new Error('não atualiza'); } });
  // ainda sem a cópia: abre a pasta do backup seguro
  assert.equal(await rodar(['--abrir-pasta'], { IMOVEIS_CONFIG: cfgTemp(backup) }), 0);
  assert.deepEqual(abertas, [backup]);
  fs.mkdirSync(path.join(backup, 'Arquivos dos imoveis'));
  abertas.length = 0;
  const env = { IMOVEIS_CONFIG: cfgTemp(backup) };
  for (const lixo of [[], ['imoveis-pasta:abrir'], ['imoveis-pasta:C:\\Windows\\System32'], ['"C:\\Windows" & calc.exe'], ['--desinstalar'], ['..\\..\\Windows']]) {
    assert.equal(await rodar(['--abrir-pasta', ...lixo], env), 0, lixo.join(' '));
    assert.equal(await rodar([...lixo, '--abrir-pasta'], env), 0, lixo.join(' '));
  }
  assert.equal(abertas.length, 12);
  assert.ok(abertas.every((p) => p === path.join(backup, 'Arquivos dos imoveis')), 'sempre a mesma pasta');
  // computador não ligado, pasta relativa ou que sumiu: não abre nada (o .vbs avisa)
  abertas.length = 0;
  for (const e of [cfgTemp(), cfgTemp('relativa\\pasta'), cfgTemp(path.join(backup, 'nao-existe')), cfgTemp('')]) assert.equal(await rodar(['--abrir-pasta'], { IMOVEIS_CONFIG: e }), 1);
  assert.deepEqual(abertas, []);
});

test('registro do protocolo: na instalação, em cada rodada do .exe (programa já instalado) e só pelo .exe', async () => {
  const env = { IMOVEIS_CONFIG: cfgTemp(), SystemRoot: 'C:\\Windows' };
  const chamadas = []; const rodar = (a) => { chamadas.push(a); return { status: 0 }; };
  assert.equal(P.garantirProtocolo({ env, rodar, exe: null }), 'sem programa instalado', 'pelo Node não registra');
  assert.equal(P.garantirProtocolo({ env, rodar, exe: { versao: 'x' } }), 'sem programa instalado', 'sem o .exe instalado não aponta para o arquivo baixado');
  assert.equal(chamadas.length, 0);
  fs.mkdirSync(P.pastaInstalada(env), { recursive: true });
  fs.writeFileSync(path.join(P.pastaInstalada(env), P.NOME_EXE), 'programa');
  assert.equal(P.garantirProtocolo({ env, rodar, exe: { versao: 'x' } }), 'registrado');
  assert.equal(chamadas.length, P.comandosDoProtocolo('C:\\x', env).length);
  assert.equal(fs.readFileSync(path.join(P.pastaInstalada(env), P.NOME_VBS_PASTA), 'latin1'), P.textoVbsPasta(), 'grava o .vbs ao lado do .exe');
  assert.match(P.garantirProtocolo({ env, rodar: () => ({ status: 1 }), exe: { versao: 'x' } }), /^falhou/);
  // as rodadas normais pedem o registro; ajuda e versão não
  const pedidos = [];
  const exec = (args) => P.executar(args, { env, dizer: () => {}, pausar: async () => {}, atualizar: async () => true, garantir: () => { pedidos.push(args[0]); return 'registrado'; } });
  for (const a of ['--atualizar', '--arquivos', '--ligar', '--ajuda', '--versao']) await exec([a]);
  assert.deepEqual(pedidos, ['--atualizar', '--arquivos', '--ligar']);
  // --simular mostra os comandos do reg
  const linhas = [];
  await P.executar(['--instalar', '--simular'], { env, dizer: (t) => linhas.push(t), pausar: async () => {} });
  assert.match(linhas.join('\n'), /reg add HKCU\\Software\\Classes\\imoveis-pasta\\shell\\open\\command \/ve \/d/);
  assert.match(linhas.join('\n'), /"URL Protocol" \/d "" \/f/);
});

test('desinstalar tira o protocolo (e não reclama se não havia)', async () => {
  const feitos = [];
  assert.equal(P.apagarProtocolo({ rodar: (a) => { feitos.push(a.join(' ')); return { status: 1 }; } }), 'não havia');
  assert.deepEqual(feitos, ['query HKCU\\Software\\Classes\\imoveis-pasta']);
  feitos.length = 0;
  assert.equal(P.apagarProtocolo({ rodar: (a) => { feitos.push(a.join(' ')); return { status: 0 }; } }), 'apagado');
  assert.deepEqual(feitos, ['query HKCU\\Software\\Classes\\imoveis-pasta', 'delete HKCU\\Software\\Classes\\imoveis-pasta /f']);
  assert.equal(P.apagarProtocolo({ rodar: (a) => ({ status: a[0] === 'query' ? 0 : 1 }) }), 'falhou');
  const sim = []; await P.executar(['--desinstalar', '--simular'], { env: { IMOVEIS_CONFIG: 'C:\\cfg' }, dizer: (t) => sim.push(t), pausar: async () => {} });
  assert.match(sim.join('\n'), /reg delete HKCU\\Software\\Classes\\imoveis-pasta \/f/);
});
