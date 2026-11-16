// Programa do PC num arquivo só (.exe para Windows, sem instalar o Node): tools/gerar-exe.mjs empacota este arquivo com o Node
// dentro (Node "single executable application"). Faz, por argumento, tudo o que os .cmd e o .vbs desta pasta faziam:
// instalar (copia o programa para %LOCALAPPDATA%\Administracao de Imoveis\programa, liga o computador com e-mail e senha, cria
// as tarefas do Windows e roda a primeira atualização), ligar, atualizar, só os arquivos, desinstalar. Dois cliques = instalar.
// Sem assinatura de código por enquanto (decisão do dono, proposta de licença, item 11): o Windows mostra o aviso azul uma vez.
// A atualização em si é a de atualizador.mjs (`principal`); o crachá, o de ligar.mjs. Ajuda: Administracao-de-Imoveis.exe --ajuda
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { EXE, principal } from './atualizador.mjs';
import { pastaConfig } from './ligar.mjs';

export const NOME_EXE = 'Administracao-de-Imoveis.exe';
export const NOME_VBS = 'rodar-escondido.vbs';
/** As mesmas tarefas (e os mesmos nomes) de instalar-tarefa.cmd: criar de novo troca as antigas, que chamavam o Node. */
export const TAREFAS = [
  { nome: 'Imoveis - atualizador da versao PC', quando: ['/SC', 'DAILY', '/ST', '20:00'], args: '--atualizar', texto: 'todo dia às 20h: dados, versão PC e arquivos' },
  { nome: 'Imoveis - atualizador da versao PC (ao entrar)', quando: ['/SC', 'ONLOGON', '/DELAY', '0002:00'], args: '--atualizar', texto: 'ao entrar no Windows: dados, versão PC e arquivos' },
  { nome: 'Imoveis - copia dos arquivos (de hora em hora)', quando: ['/SC', 'HOURLY'], args: '--arquivos', escondida: true, texto: 'de hora em hora, sem janela: só os arquivos' },
];

/** Onde o programa fica instalado (ao lado do crachá, fora do OneDrive). */
export const pastaInstalada = (env = process.env) => path.join(pastaConfig(env), 'programa');

/**
 * Roda o programa sem a janela preta (tarefa de hora em hora). Fica ao lado do .exe e acha o caminho sozinho: o arquivo não
 * leva o nome da pasta (nome de usuário com acento estragaria um .vbs).
 */
export const textoVbs = () => [
  "' Gerado pelo programa Administracao de Imoveis: roda o programa sem abrir a janela preta (tarefa de hora em hora).",
  'Dim pasta, args, i',
  'pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)',
  'args = ""',
  'For i = 0 To WScript.Arguments.Count - 1',
  '  args = args & " " & WScript.Arguments(i)',
  'Next',
  `CreateObject("WScript.Shell").Run """" & pasta & "\\${NOME_EXE}""" & args, 0, False`,
  '',
].join('\r\n');

/** Os argumentos do schtasks para criar cada tarefa. `pasta` = onde estão o .exe e o .vbs. */
export function comandosDeCriar(pasta) {
  const exe = path.win32.join(pasta, NOME_EXE); const vbs = path.win32.join(pasta, NOME_VBS);
  return TAREFAS.map((t) => ({ ...t, comando: ['/Create', '/F', ...t.quando, '/TN', t.nome, '/TR', t.escondida ? `wscript.exe "${vbs}" ${t.args}` : `"${exe}" ${t.args}`] }));
}

const schtasks = (args) => spawnSync('schtasks.exe', args, { windowsHide: true, encoding: 'latin1' });
const tarefaExiste = (nome, rodar = schtasks) => rodar(['/Query', '/TN', nome]).status === 0;

/** Cria as tarefas; devolve as que falharam. `rodar` troca nos testes e no --simular. */
export function criarTarefas(pasta, { rodar = schtasks, dizer = console.log } = {}) {
  const falharam = [];
  for (const t of comandosDeCriar(pasta)) {
    const ok = rodar(t.comando).status === 0;
    dizer(`  ${ok ? 'criada ' : 'FALHOU '} ${t.nome} (${t.texto})`);
    if (!ok) falharam.push(t);
  }
  return falharam;
}

export function apagarTarefas({ rodar = schtasks, dizer = console.log } = {}) {
  for (const t of TAREFAS) {
    if (!tarefaExiste(t.nome, rodar)) { dizer(`  não havia ${t.nome}`); continue; }
    dizer(`  ${rodar(['/Delete', '/F', '/TN', t.nome]).status === 0 ? 'apagada' : 'FALHOU '} ${t.nome}`);
  }
}

/** Abre o programa de novo com permissão de administrador (o Windows pergunta "Deseja permitir?") e espera terminar. */
function rodarComoAdministrador(exe, args) {
  const lista = args.map((a) => `'${a}'`).join(',');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `Start-Process -FilePath $env:IMOVEIS_EXE_ELEVAR -ArgumentList ${lista} -Verb RunAs -Wait`], { env: { ...process.env, IMOVEIS_EXE_ELEVAR: exe }, windowsHide: true, encoding: 'utf8' });
  return r.status === 0;
}

export const AJUDA = (versao) => `Administração de Imóveis — programa do computador${versao ? ` (versão ${versao})` : ''}

Mantém a pasta do backup seguro em dia com a nuvem: dados cifrados, versão PC e a pasta "Arquivos dos imoveis".

Uso:
  ${NOME_EXE}                 (dois cliques) instala: liga o computador, cria as tarefas do Windows e atualiza
  ${NOME_EXE} --ligar         liga de novo com e-mail e senha (depois de Desligar ou de 90 dias parado) e atualiza
  ${NOME_EXE} --atualizar     atualiza agora: dados, versão PC e arquivos
  ${NOME_EXE} --arquivos      atualiza agora só a pasta "Arquivos dos imoveis"
  ${NOME_EXE} --instalar      só copia o programa e cria as tarefas (20h, ao entrar e de hora em hora)
  ${NOME_EXE} --desinstalar   apaga as tarefas do Windows (o computador continua ligado até Desligar em Usuários)
  ${NOME_EXE} --versao        mostra a versão
  ${NOME_EXE} --ajuda         mostra este texto
  --simular                   junto de --instalar ou --desinstalar: só mostra o que faria, sem mexer em nada

O resultado de cada atualização fica em ultima-atualizacao.txt, na pasta do backup seguro.`;

const COMANDOS = ['--ligar', '--atualizar', '--arquivos', '--instalar', '--desinstalar', '--versao', '--ajuda'];

function esperarEnter(texto = 'Aperte Enter para fechar.') {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return Promise.resolve();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((ok) => { rl.question(`\n${texto} `, () => { rl.close(); ok(); }); });
}

/** Copia o programa para a pasta instalada (se já não está rodando de lá) e grava o .vbs. Devolve a pasta. */
function copiarPrograma(env, dizer) {
  const pasta = pastaInstalada(env); const destino = path.join(pasta, NOME_EXE);
  fs.mkdirSync(pasta, { recursive: true });
  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(destino).toLowerCase()) {
    try { fs.copyFileSync(process.execPath, destino); } catch (e) {
      throw new Error(`Não consegui copiar o programa para ${pasta} (${e.code || e.message}). Se uma atualização está rodando agora, espere um minuto e abra de novo.`);
    }
    dizer(`Programa copiado para ${pasta} (o arquivo baixado pode ser apagado depois).`);
  }
  fs.writeFileSync(path.join(pasta, NOME_VBS), textoVbs(), 'latin1');
  return pasta;
}

/** Copia o programa e cria as tarefas. `true` se as três tarefas ficaram criadas. */
function instalar({ env, simular, elevado, dizer }) {
  if (simular) {
    const pasta = pastaInstalada(env);
    dizer(`[simulação: nada foi copiado nem criado]\nCopiaria o programa para ${pasta} e criaria as tarefas:`);
    for (const t of comandosDeCriar(pasta)) dizer(`  schtasks ${t.comando.map((a) => (/\s/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ')}`);
    return true;
  }
  if (!EXE) throw new Error(`Instalar só funciona no programa ${NOME_EXE} (gerado por tools/gerar-exe.mjs). Pelo Node, use instalar-tarefa.cmd.`);
  const pasta = copiarPrograma(env, dizer);
  dizer('Criando as tarefas do Windows:');
  let falharam = criarTarefas(pasta, { dizer });
  if (falharam.length && !elevado) {
    // a tarefa "ao entrar" costuma pedir permissão de administrador
    dizer('\nO Windows pede permissão de administrador para criar essa tarefa: responda "Sim" na janela que vai abrir.');
    rodarComoAdministrador(path.join(pasta, NOME_EXE), ['--instalar', '--elevado']);
    falharam = TAREFAS.filter((t) => !tarefaExiste(t.nome));
    dizer(falharam.length ? '' : 'Tarefas criadas com a permissão de administrador.');
  }
  if (falharam.length) {
    dizer(`Faltou criar: ${falharam.map((t) => t.nome).join('; ')}.\nFeche esta janela, clique com o botão direito no programa → "Executar como administrador" e repita.`);
    return false;
  }
  return true;
}

/**
 * O programa inteiro. Devolve o código de saída (0 = certo). `dizer`, `env` e `atualizar` trocam nos testes.
 */
export async function executar(args = [], { env = process.env, dizer = console.log, atualizar = principal, pausar = esperarEnter } = {}) {
  const versao = EXE?.versao || '';
  const tem = (a) => args.includes(a);
  const simular = tem('--simular'); const elevado = tem('--elevado');
  const pedidos = args.filter((a) => COMANDOS.includes(a) || a === '-h' || a === '/?');
  const estranhos = args.filter((a) => !pedidos.includes(a) && a !== '--simular' && a !== '--elevado');
  if (estranhos.length || pedidos.length > 1) {
    dizer(`Não entendi: ${(estranhos.length ? estranhos : pedidos).join(' ')}\n\n${AJUDA(versao)}`);
    return 2;
  }
  const pedido = pedidos[0] || '';
  try {
    if (pedido === '--ajuda' || pedido === '-h' || pedido === '/?') { dizer(AJUDA(versao)); return 0; }
    if (pedido === '--versao') { dizer(versao || 'rodando pelo Node (sem versão)'); return 0; }
    if (pedido === '--atualizar') return (await atualizar([])) ? 0 : 1;
    if (pedido === '--arquivos') return (await atualizar(['--arquivos'])) ? 0 : 1;
    if (pedido === '--ligar') {
      const ok = await atualizar(['--ligar']);
      await pausar();
      return ok ? 0 : 1;
    }
    if (pedido === '--desinstalar') {
      if (simular) { dizer(`[simulação: nada foi apagado]\nApagaria as tarefas:\n${TAREFAS.map((t) => `  ${t.nome}`).join('\n')}`); return 0; }
      dizer('Apagando as tarefas do Windows:');
      apagarTarefas({ dizer });
      const sobraram = TAREFAS.filter((t) => tarefaExiste(t.nome));
      if (sobraram.length && !elevado) {
        dizer('\nO Windows pede permissão de administrador para apagar: responda "Sim" na janela que vai abrir.');
        rodarComoAdministrador(process.execPath, ['--desinstalar', '--elevado']);
      }
      const ficou = TAREFAS.filter((t) => tarefaExiste(t.nome));
      dizer(ficou.length ? `Não consegui apagar: ${ficou.map((t) => t.nome).join('; ')}.` : `Pronto: as atualizações automáticas pararam. O computador continua ligado ao sistema: para desligar, no sistema, Usuários → Aparelhos ligados → Desligar. O programa fica em ${pastaInstalada(env)} (pode apagar a pasta "programa").`);
      if (!elevado) await pausar();
      return ficou.length ? 1 : 0;
    }
    if (pedido === '--instalar') {
      const ok = instalar({ env, simular, elevado, dizer });
      if (!elevado && !simular) await pausar();
      return ok ? 0 : 1;
    }
    // dois cliques: instala tudo
    dizer(`Administração de Imóveis — programa do computador${versao ? ` (versão ${versao})` : ''}\n`);
    dizer('Este programa mantém a pasta do backup seguro em dia com a nuvem, sozinho (todo dia às 20h, ao entrar no Windows e,\npara os arquivos, de hora em hora). Passos: 1) criar as tarefas do Windows; 2) ligar este computador; 3) primeira atualização.\n');
    dizer('Passo 1 de 3');
    const tarefas = instalar({ env, simular, elevado, dizer });
    if (simular) return 0;
    dizer('\nPasso 2 de 3: ligar este computador (se ainda não está ligado, abre uma página no navegador: e-mail e senha do sistema\ne a pasta do backup seguro) e Passo 3 de 3: primeira atualização. Pode levar alguns minutos.');
    const ok = await atualizar([]);
    dizer(ok && tarefas ? '\nPronto. Daqui em diante é sozinho. Para conferir: ultima-atualizacao.txt na pasta do backup seguro, e no sistema, Usuários → Aparelhos ligados.'
      : '\nNão terminou: veja o aviso acima, resolva e abra o programa de novo (pode repetir quantas vezes precisar).');
    await pausar();
    return ok && tarefas ? 0 : 1;
  } catch (e) {
    dizer(`Falhou: ${e.message}`);
    if (!elevado && !pedido) await pausar();
    return 1;
  }
}

// no .exe quem chama é a entrada gerada por tools/gerar-exe.mjs; pelo Node: node programa.mjs --ajuda
if (!EXE && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) executar(process.argv.slice(2)).then((c) => { process.exitCode = c; });
