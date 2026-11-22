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
  // as duas que existem e a da assinatura digital (criada pelo --certificado, também apagada quando existe)
  assert.equal(apagar.filter((a) => a.startsWith('/Delete')).length, 3);
  assert.ok(apagar.some((a) => a === `/Delete /F /TN ${P.TAREFA_ASSINATURA.nome}`));
});

test('assinatura digital no programa: --assinar sem certificado sai na hora sem ir à internet; com ele, assina a fila', async () => {
  const fs2 = await import('node:fs'); const os = await import('node:os'); const path2 = await import('node:path');
  const env = { IMOVEIS_CONFIG: fs2.mkdtempSync(path2.join(os.tmpdir(), 'imoveis-cert-')) };
  const ditos = [];
  let chamou = false;
  const assinar = async () => { chamou = true; return { assinados: 2, erros: ['Carta · Ana: certificado vencido'] }; };
  assert.equal(await P.rodadaDeAssinatura({ env, dizer: (t) => ditos.push(t), assinar, lerLig: () => ({ site: 'https://x', cracha: 'ap1_x' }) }), 0);
  assert.equal(chamou, false, 'sem certificado: nem chama a nuvem');
  fs2.writeFileSync(path2.join(env.IMOVEIS_CONFIG, 'certificado.json'), JSON.stringify({ pfx: 'cifrado', senha: 'cifrada', nome: 'ANK TESTE LTDA', cnpj: '11.222.333/0001-81', validade: '2099-01-01' }));
  assert.equal(await P.rodadaDeAssinatura({ env, dizer: (t) => ditos.push(t), assinar, lerLig: () => ({ site: 'https://x', cracha: 'ap1_x' }), lerCert: () => ({ nome: 'ANK TESTE LTDA' }) }), 0);
  assert.equal(chamou, true);
  assert.match(ditos.at(-1), /2 documento\(s\) assinado\(s\); não assinados: Carta · Ana: certificado vencido/);
  assert.equal(await P.rodadaDeAssinatura({ env, dizer: (t) => ditos.push(t), assinar, lerLig: () => null }), 1, 'computador desligado do sistema');
  fs2.rmSync(env.IMOVEIS_CONFIG, { recursive: true, force: true });
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

test('registro no Windows: na instalação, em cada rodada do .exe (programa já instalado) e só pelo .exe', async () => {
  const env = { IMOVEIS_CONFIG: cfgTemp(), SystemRoot: 'C:\\Windows' };
  const chamadas = []; const rodar = (a) => { chamadas.push(a); return { status: 0 }; };
  assert.equal(P.garantirRegistro({ env, rodar, exe: null }), 'sem programa instalado', 'pelo Node não registra');
  assert.equal(P.garantirRegistro({ env, rodar, exe: { versao: 'x' } }), 'sem programa instalado', 'sem o .exe instalado não aponta para o arquivo baixado');
  assert.equal(chamadas.length, 0);
  fs.mkdirSync(P.pastaInstalada(env), { recursive: true });
  fs.writeFileSync(path.join(P.pastaInstalada(env), P.NOME_EXE), 'programa');
  assert.equal(P.garantirRegistro({ env, rodar, exe: { versao: 'x' } }), 'registrado');
  assert.equal(chamadas.length, P.comandosDoRegistro('C:\\x', env, { kb: 1 }).length, 'os dois botões e Aplicativos instalados');
  for (const n of [P.NOME_VBS, P.NOME_VBS_PASTA, P.NOME_VBS_DESINSTALAR, P.NOME_VBS_JANELA, P.NOME_ICONE]) assert.ok(fs.existsSync(path.join(P.pastaInstalada(env), n)), n);
  // o ícone (casinha): um .ico de verdade, com a entrada de 256 px e a de 16 px, gravado em cada rodada
  const ico = fs.readFileSync(path.join(P.pastaInstalada(env), P.NOME_ICONE));
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2)], [0, 1], 'cabeçalho de .ico');
  const lados = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + 16 * i] || 256);
  assert.ok(lados.includes(16) && lados.includes(32) && lados.includes(256), `tamanhos ${lados}`);
  assert.ok(chamadas.some((a) => a.includes('DisplayIcon') && a.at(-2).endsWith(`${P.NOME_ICONE},0`)), 'Aplicativos instalados mostra a casinha');
  const tamanho = chamadas.find((a) => a.includes('EstimatedSize'));
  assert.equal(tamanho[tamanho.indexOf('/d') + 1], '1', 'tamanho em KB, arredondado para cima');
  assert.equal(fs.readFileSync(path.join(P.pastaInstalada(env), P.NOME_VBS_PASTA), 'latin1'), P.textoVbsPasta(), 'grava o .vbs ao lado do .exe');
  assert.match(P.garantirRegistro({ env, rodar: () => ({ status: 1 }), exe: { versao: 'x' } }), /^falhou/);
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

// Desinstalar como qualquer programa (pedido do dono de 17/11): Configurações do Windows → Aplicativos instalados e o botão do
// sistema (endereço imoveis-desinstalar:). Nada é registrado nem apagado de verdade no Windows: reg, schtasks e as janelas são
// de mentira; só as pastas temporárias do teste são mexidas.
const eco = (args) => JSON.parse(spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', ...args], { encoding: 'utf8' }).stdout);
const valorDe = (cmds, nome) => { const a = cmds.find((x) => x.includes('/v') && x[x.indexOf('/v') + 1] === nome); return a && a[a.indexOf('/d') + 1]; };

/** Um registro do Windows de mentira: guarda as chaves que o reg add cria; query e delete valem para a chave e as de dentro. */
const registroFalso = () => {
  const chaves = new Map();
  const dentro = (k, c) => k === c || k.startsWith(`${c}\\`);
  const rodar = (a) => {
    const [op, chave] = a;
    if (op === 'add') {
      const nome = a.includes('/ve') ? '' : a[a.indexOf('/v') + 1];
      if (!chaves.has(chave)) chaves.set(chave, new Map());
      chaves.get(chave).set(nome, a[a.indexOf('/d') + 1]);
      return { status: 0 };
    }
    if (op === 'query') return { status: [...chaves.keys()].some((k) => dentro(k, chave)) ? 0 : 1 };
    if (op === 'delete') { for (const k of [...chaves.keys()]) if (dentro(k, chave)) chaves.delete(k); return { status: 0 }; }
    return { status: 1 };
  };
  return { chaves, rodar };
};
/** O schtasks de mentira: as tarefas criadas ficam num conjunto. `trancadas` = as que o Windows não deixa apagar. */
const tarefasFalsas = (trancadas = []) => {
  const tarefas = new Set();
  const rodar = (a) => {
    const nome = a[a.indexOf('/TN') + 1];
    if (a[0] === '/Create') { tarefas.add(nome); return { status: 0 }; }
    if (a[0] === '/Query') return { status: tarefas.has(nome) ? 0 : 1 };
    if (a[0] === '/Delete') { if (trancadas.includes(nome)) return { status: 1 }; tarefas.delete(nome); return { status: 0 }; }
    return { status: 1 };
  };
  return { tarefas, rodar };
};

test('Aplicativos instalados: chave por usuário, nome com acento, aspas no caminho com espaço e "Desinstalar" chamando --desinstalar', () => {
  const cmds = P.comandosDeAplicativos(PASTA_PROG, { versao: '2026-11-17 abc1234', kb: 92161.2 });
  assert.equal(P.CHAVE_DESINSTALAR, 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AdministracaoDeImoveis');
  for (const a of cmds) { assert.equal(a[0], 'add'); assert.equal(a[1], P.CHAVE_DESINSTALAR, 'HKCU: sem administrador'); assert.equal(a.at(-1), '/f', 'idempotente'); }
  const exe = `${PASTA_PROG}\\Administracao-de-Imoveis.exe`;
  assert.equal(valorDe(cmds, 'DisplayName'), 'Administração de Imóveis');
  assert.equal(valorDe(cmds, 'DisplayVersion'), '2026-11-17 abc1234');
  assert.equal(valorDe(cmds, 'Publisher'), 'Administração de Imóveis');
  assert.equal(valorDe(cmds, 'DisplayIcon'), `${PASTA_PROG}\\icone.ico,0`, 'a casinha ao lado do .exe');
  assert.equal(valorDe(cmds, 'InstallLocation'), PASTA_PROG);
  assert.equal(valorDe(cmds, 'UninstallString'), `"${exe}" --desinstalar`, 'o caminho com espaço entre aspas');
  for (const n of ['NoModify', 'NoRepair']) { const a = cmds.find((x) => x.includes(n)); assert.deepEqual(a.slice(4, 8), ['/t', 'REG_DWORD', '/d', '1']); }
  assert.equal(valorDe(cmds, 'EstimatedSize'), '92162', 'em KB');
  assert.equal(valorDe(P.comandosDeAplicativos(PASTA_PROG), 'EstimatedSize'), undefined, 'sem o tamanho, não grava');
  // as aspas e os acentos chegam inteiros ao reg.exe (que lê a linha de comando com a mesma regra do Node)
  for (const n of ['UninstallString', 'DisplayName']) { const a = cmds.find((x) => x.includes(n)); assert.deepEqual(eco(a), a, n); }
});

test('protocolo imoveis-desinstalar: chama o .vbs sem nada do endereço, e o .vbs só roda --desinstalar (que pergunta)', () => {
  const cmds = P.comandosDoProtocoloDesinstalar(PASTA_PROG, { SystemRoot: 'C:\\Windows' });
  assert.equal(P.CHAVE_PROTOCOLO_DESINSTALAR, 'HKCU\\Software\\Classes\\imoveis-desinstalar');
  for (const a of cmds) {
    assert.ok(a[1].startsWith(P.CHAVE_PROTOCOLO_DESINSTALAR), 'HKCU: sem administrador'); assert.equal(a.at(-1), '/f');
    assert.ok(!a.join(' ').includes('%'), 'sem %1: o endereço não entra no comando');
  }
  assert.deepEqual(cmds[1], ['add', P.CHAVE_PROTOCOLO_DESINSTALAR, '/v', 'URL Protocol', '/d', '', '/f']);
  const comando = cmds.find((a) => a[1].endsWith('\\shell\\open\\command'));
  assert.equal(comando[comando.indexOf('/d') + 1], `"C:\\Windows\\System32\\wscript.exe" "${PASTA_PROG}\\desinstalar.vbs"`);
  assert.deepEqual(eco(comando), comando);
  const vbs = P.textoVbsDesinstalar();
  assert.ok(/^[\x00-\x7f]*$/.test(vbs), 'só letras sem acento');
  assert.ok(vbs.includes(`\\${P.NOME_EXE}"" --desinstalar", 1, False`), 'roda o .exe da mesma pasta só com --desinstalar');
  assert.ok(!/WScript\.Arguments/.test(vbs), 'não repassa argumento nenhum');
  const janela = P.textoVbsJanela();
  assert.ok(/^[\x00-\x7f]*$/.test(janela) && /MsgBox\(/.test(janela), 'a janela do Windows: MsgBox, sem acento no arquivo');
  // os textos das janelas vão como argumento do wscript: sem aspas
  for (const t of [P.TEXTO_CONFIRMAR, P.TEXTO_PRONTO]) assert.ok(!t.includes('"'), t);
  assert.match(P.TEXTO_CONFIRMAR, /^Desinstalar Administração de Imóveis\?/);
  assert.match(P.TEXTO_CONFIRMAR, /Usuários → Aparelhos ligados → Desligar/);
  assert.match(P.TEXTO_PRONTO, /^Pronto: programa desinstalado/);
});

test('registro idempotente: rodar de novo dá o mesmo registro, sem chave nem valor repetido', () => {
  const env = { IMOVEIS_CONFIG: cfgTemp(), SystemRoot: 'C:\\Windows' };
  fs.mkdirSync(P.pastaInstalada(env), { recursive: true });
  fs.writeFileSync(path.join(P.pastaInstalada(env), P.NOME_EXE), 'x'.repeat(3000));
  const r = registroFalso();
  const foto = () => JSON.stringify([...r.chaves].map(([k, v]) => [k, [...v]]));
  assert.equal(P.garantirRegistro({ env, rodar: r.rodar, exe: { versao: 'v1' } }), 'registrado');
  const antes = foto();
  assert.equal(P.garantirRegistro({ env, rodar: r.rodar, exe: { versao: 'v1' } }), 'registrado');
  assert.equal(foto(), antes);
  const cmds = P.comandosDoRegistro(P.pastaInstalada(env), env, { versao: 'v1', kb: 3 });
  const pares = cmds.map((a) => `${a[1]}|${a.includes('/ve') ? '' : a[a.indexOf('/v') + 1]}`);
  assert.equal(new Set(pares).size, pares.length, 'cada valor uma vez');
  assert.ok(cmds.every((a) => a.at(-1) === '/f'), 'reg add /f troca o que havia');
  assert.equal(r.chaves.get(P.CHAVE_DESINSTALAR).get('EstimatedSize'), '3');
  assert.equal(r.chaves.get(P.CHAVE_DESINSTALAR).get('DisplayVersion'), 'v1');
  // programa novo: a mesma chave, com a versão trocada
  P.garantirRegistro({ env, rodar: r.rodar, exe: { versao: 'v2' } });
  assert.equal(r.chaves.get(P.CHAVE_DESINSTALAR).get('DisplayVersion'), 'v2');
  assert.deepEqual([...r.chaves.keys()].filter((k) => !k.includes('\\shell') && !k.endsWith('DefaultIcon')).sort(), [...P.CHAVES_DO_PROGRAMA].sort());
});

/** Um computador de teste: crachá, config.json, pasta do backup seguro com arquivos e o programa instalado e registrado. */
const computadorDeTeste = ({ backupDentro = false } = {}) => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'programa-pc-'));
  const prog = path.join(cfg, 'programa');
  const backup = backupDentro ? path.join(prog, 'backup') : fs.mkdtempSync(path.join(os.tmpdir(), 'backup-seguro-'));
  const inquilino = path.join(backup, 'Arquivos dos imoveis', 'Casa 1', 'Inquilinos');
  fs.mkdirSync(inquilino, { recursive: true });
  fs.writeFileSync(path.join(inquilino, 'contrato.pdf'), 'contrato');
  fs.writeFileSync(path.join(backup, 'chave-do-backup.json'), '{}');
  fs.mkdirSync(path.join(backup, 'copias-diarias'), { recursive: true });
  fs.writeFileSync(path.join(backup, 'copias-diarias', 'imoveis-dados-2026-11-17.bkp'), 'cifrado');
  fs.writeFileSync(path.join(cfg, 'config.json'), JSON.stringify({ site: 'https://erp.exemplo.com.br', pasta: backup }));
  fs.writeFileSync(path.join(cfg, 'cracha.dat'), 'cracha');
  fs.mkdirSync(prog, { recursive: true });
  for (const n of P.ARQUIVOS_DO_PROGRAMA) fs.writeFileSync(path.join(prog, n), n);
  const env = { IMOVEIS_CONFIG: cfg, SystemRoot: 'C:\\Windows' };
  const r = registroFalso(); const t = tarefasFalsas();
  assert.equal(P.garantirRegistro({ env, rodar: r.rodar, exe: { versao: 'v1' } }), 'registrado');
  P.criarTarefas(prog, { rodar: t.rodar, dizer: () => {} });
  const fotoDoBackup = () => {
    const lista = [];
    const andar = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) andar(p); else lista.push(`${path.relative(backup, p)}=${fs.readFileSync(p, 'utf8')}`); } };
    andar(backup);
    return lista.sort().join('\n');
  };
  return { cfg, prog, backup, env, r, t, fotoDoBackup };
};
const desinstalarNoTeste = async (pc, { args = ['--desinstalar'], resposta = true, t = pc.t, elevar = () => {} } = {}) => {
  const linhas = []; const perguntas = []; const avisos = [];
  const codigo = await P.executar(args, { env: pc.env, dizer: (x) => linhas.push(x), pausar: async () => {}, rodarReg: pc.r.rodar, rodarTarefas: t.rodar,
    perguntar: async (texto) => { perguntas.push(texto); return resposta; }, avisar: (texto) => { avisos.push(texto); return 'ok'; }, elevar,
    garantir: () => { throw new Error('desinstalar não registra'); }, atualizar: async () => { throw new Error('desinstalar não atualiza'); } });
  return { codigo, texto: linhas.join('\n'), perguntas, avisos };
};

test('--desinstalar pergunta antes; com Não, nada muda', async () => {
  const pc = computadorDeTeste();
  const antes = pc.fotoDoBackup();
  const r = await desinstalarNoTeste(pc, { resposta: false });
  assert.equal(r.codigo, 0);
  assert.deepEqual(r.perguntas, [P.TEXTO_CONFIRMAR]);
  assert.match(r.texto, /Nada foi desinstalado/);
  assert.equal(pc.t.tarefas.size, 3);
  for (const c of P.CHAVES_DO_PROGRAMA) assert.ok(pc.r.chaves.has(c), c);
  assert.ok(P.ARQUIVOS_DO_PROGRAMA.every((n) => fs.existsSync(path.join(pc.prog, n))));
  assert.equal(pc.fotoDoBackup(), antes);
});

test('--desinstalar com Sim tira tarefas, botões, Aplicativos instalados e o programa; nunca o backup, os arquivos nem o crachá', async () => {
  const pc = computadorDeTeste();
  const antes = pc.fotoDoBackup();
  fs.writeFileSync(path.join(pc.prog, 'anotacao-da-pessoa.txt'), 'não é do programa');
  const r = await desinstalarNoTeste(pc);
  assert.equal(r.codigo, 0, r.texto);
  assert.equal(pc.t.tarefas.size, 0, 'as três tarefas');
  assert.equal(pc.r.chaves.size, 0, 'os dois protocolos e a chave de Aplicativos instalados');
  assert.ok(P.ARQUIVOS_DO_PROGRAMA.every((n) => !fs.existsSync(path.join(pc.prog, n))), 'os arquivos do programa');
  assert.ok(fs.existsSync(path.join(pc.prog, 'anotacao-da-pessoa.txt')), 'o que não é do programa fica (e a pasta com ele)');
  assert.equal(pc.fotoDoBackup(), antes, 'o backup e a cópia aberta ficam como estavam');
  assert.equal(fs.readFileSync(path.join(pc.cfg, 'cracha.dat'), 'utf8'), 'cracha');
  assert.ok(fs.existsSync(path.join(pc.cfg, 'config.json')));
  assert.deepEqual(r.avisos, [P.TEXTO_PRONTO], 'no fim, a janela "Pronto: programa desinstalado"');
  // sem nada sobrando, a pasta programa sai
  const pc2 = computadorDeTeste();
  assert.equal((await desinstalarNoTeste(pc2)).codigo, 0);
  assert.ok(!fs.existsSync(pc2.prog));
  assert.ok(fs.existsSync(path.join(pc2.backup, 'Arquivos dos imoveis', 'Casa 1', 'Inquilinos', 'contrato.pdf')));
  // rodar de novo (já desinstalado) não reclama
  const deNovo = await desinstalarNoTeste(pc2);
  assert.equal(deNovo.codigo, 0);
  assert.match(deNovo.texto, /não estava/);
});

test('--desinstalar não apaga a pasta do programa se o backup estiver dentro dela (nem o contrário)', async () => {
  const pc = computadorDeTeste({ backupDentro: true });
  const antes = pc.fotoDoBackup();
  assert.equal(P.pastaQuePodeApagar(pc.env), null);
  assert.equal((await desinstalarNoTeste(pc)).codigo, 0);
  assert.equal(pc.fotoDoBackup(), antes);
  assert.ok(P.ARQUIVOS_DO_PROGRAMA.every((n) => fs.existsSync(path.join(pc.prog, n))), 'nem os arquivos do programa');
  // a pasta do backup seguro é a própria pasta do crachá (o programa ficaria dentro dela)
  const env = { IMOVEIS_CONFIG: cfgTemp() };
  fs.writeFileSync(path.join(env.IMOVEIS_CONFIG, 'config.json'), JSON.stringify({ pasta: env.IMOVEIS_CONFIG }));
  assert.equal(P.pastaQuePodeApagar(env), null);
  const normal = { IMOVEIS_CONFIG: cfgTemp() };
  assert.equal(P.pastaQuePodeApagar(normal), path.resolve(P.pastaInstalada(normal)));
});

test('--desinstalar com tarefa que o Windows não deixa apagar: pede administrador e, se ficar, mantém Aplicativos instalados e o programa', async () => {
  const pc = computadorDeTeste();
  const trancada = P.TAREFAS[1].nome;
  const t = tarefasFalsas([trancada]); for (const x of P.TAREFAS) t.tarefas.add(x.nome);
  const pedidos = [];
  const r = await desinstalarNoTeste(pc, { t, elevar: (exe, args) => pedidos.push(args) });
  assert.equal(r.codigo, 1);
  assert.deepEqual(pedidos, [['--desinstalar', '--elevado']]);
  assert.deepEqual([...t.tarefas], [trancada]);
  assert.ok(pc.r.chaves.has(P.CHAVE_DESINSTALAR), 'para tentar de novo por Aplicativos instalados');
  assert.ok(fs.existsSync(path.join(pc.prog, P.NOME_EXE)));
  assert.match(r.avisos[0], /^Não terminou/);
  // a cópia como administrador só apaga as tarefas, sem perguntar de novo
  const t2 = tarefasFalsas(); for (const x of P.TAREFAS) t2.tarefas.add(x.nome);
  const el = await desinstalarNoTeste(pc, { args: ['--desinstalar', '--elevado'], t: t2 });
  assert.equal(el.codigo, 0);
  assert.deepEqual(el.perguntas, []);
  assert.equal(t2.tarefas.size, 0);
});

test('--desinstalar com argumento a mais (o que viesse de um endereço) não desinstala nem pergunta; --simular só mostra', async () => {
  const pc = computadorDeTeste();
  for (const lixo of [['imoveis-desinstalar:confirmar'], ['--sim'], ['C:\\Windows'], ['--atualizar']]) {
    const r = await desinstalarNoTeste(pc, { args: ['--desinstalar', ...lixo] });
    assert.equal(r.codigo, 2, lixo.join(' '));
    assert.deepEqual(r.perguntas, []);
  }
  assert.equal(pc.t.tarefas.size, 3);
  assert.equal(pc.r.chaves.size, 13, 'nada saiu do registro (4 chaves de cada um dos três botões + Aplicativos)');
  const sim = await desinstalarNoTeste(pc, { args: ['--desinstalar', '--simular'] });
  assert.equal(sim.codigo, 0);
  assert.deepEqual(sim.perguntas, []);
  for (const c of P.CHAVES_DO_PROGRAMA) assert.ok(sim.texto.includes(`reg delete ${c} /f`), c);
  assert.match(sim.texto, /Não mexeria na pasta do backup seguro/);
  assert.equal(pc.r.chaves.size, 13);
  assert.equal(pc.t.tarefas.size, 3);
});
