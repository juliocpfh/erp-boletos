// Programa do PC num arquivo só (atualizador-pc/programa.mjs, o que vai dentro do .exe gerado por tools/gerar-exe.mjs):
// argumentos, ajuda, as tarefas do Windows (mesmos nomes de instalar-tarefa.cmd, para trocar as antigas) e o .vbs que roda
// sem janela. Nada é criado de verdade: o schtasks é de mentira.
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
