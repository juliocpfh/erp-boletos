// Programa do PC num arquivo só (.exe para Windows, sem instalar o Node): tools/gerar-exe.mjs empacota este arquivo com o Node
// dentro (Node "single executable application"). Faz, por argumento, tudo o que os .cmd e o .vbs desta pasta faziam:
// instalar (copia o programa para %LOCALAPPDATA%\Administracao de Imoveis\programa, liga o computador com e-mail e senha, cria
// as tarefas do Windows e roda a primeira atualização), ligar, atualizar, só os arquivos, desinstalar. Dois cliques = instalar.
// Sem assinatura de código por enquanto (decisão do dono, proposta de licença, item 11): o Windows mostra o aviso azul uma vez.
// A atualização em si é a de atualizador.mjs (`principal`); o crachá, o de ligar.mjs. Ajuda: Administracao-de-Imoveis.exe --ajuda
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { EXE, PASTA_COPIA, principal } from './atualizador.mjs';
import { ARQUIVO_CONFIG, pastaConfig } from './ligar.mjs';

export const NOME_EXE = 'Administracao-de-Imoveis.exe';
export const NOME_VBS = 'rodar-escondido.vbs';
export const NOME_VBS_PASTA = 'abrir-pasta.vbs';
/**
 * Botão "Abrir a pasta no Explorer" do sistema (Dados e backup → Backup seguro): o link `imoveis-pasta:abrir` chama este
 * programa, registrado por usuário (sem administrador) em HKCU\Software\Classes\imoveis-pasta. Segurança: o comando registrado
 * não leva o endereço (sem %1), o .vbs não repassa argumento nenhum e --abrir-pasta ignora o resto: um site qualquer só
 * consegue abrir a pasta da cópia aberta deste computador, nunca outro caminho nem outro comando.
 */
export const PROTOCOLO = 'imoveis-pasta';
export const CHAVE_PROTOCOLO = `HKCU\\Software\\Classes\\${PROTOCOLO}`;
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

/**
 * O que o link imoveis-pasta: chama: roda o programa sem janela com --abrir-pasta e nada mais (não repassa os argumentos que
 * o Windows possa acrescentar). Se o programa não achou a pasta, avisa numa janelinha. Só letras sem acento (.vbs em latin1).
 */
export const textoVbsPasta = () => [
  "' Gerado pelo programa Administracao de Imoveis: botao \"Abrir a pasta no Explorer\" do sistema (endereco imoveis-pasta:).",
  "' Nao repassa nada do endereco: sempre abre a pasta da copia aberta configurada neste computador.",
  'Dim pasta, r',
  'pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)',
  `r = CreateObject("WScript.Shell").Run("""" & pasta & "\\${NOME_EXE}"" --abrir-pasta", 0, True)`,
  'If r <> 0 Then MsgBox "Nao achei a pasta da copia aberta (Arquivos dos imoveis) neste computador. Abra o programa ' +
    `${NOME_EXE} (dois cliques) para ligar o computador e fazer a primeira atualizacao.", 48, "Administracao de Imoveis"`,
  '',
].join('\r\n');

const pastaWindows = (env = process.env) => env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
/** wscript.exe pelo caminho inteiro (o Windows não procura o programa na pasta de quem chamou o link). */
const wscript = (env = process.env) => path.win32.join(pastaWindows(env), 'System32', 'wscript.exe');

/** Os argumentos do reg.exe para registrar o protocolo imoveis-pasta: (por usuário, sem administrador). `pasta` = a do .exe. */
export function comandosDoProtocolo(pasta, env = process.env) {
  const vbs = path.win32.join(pasta, NOME_VBS_PASTA); const exe = path.win32.join(pasta, NOME_EXE);
  return [
    ['add', CHAVE_PROTOCOLO, '/ve', '/d', 'URL:Abrir a pasta Arquivos dos imoveis', '/f'],
    ['add', CHAVE_PROTOCOLO, '/v', 'URL Protocol', '/d', '', '/f'],
    ['add', `${CHAVE_PROTOCOLO}\\DefaultIcon`, '/ve', '/d', `"${exe}",0`, '/f'],
    // o nome que o Chrome mostra na pergunta "Abrir …?" (sem ele, apareceria o do wscript)
    ['add', `${CHAVE_PROTOCOLO}\\shell\\open`, '/v', 'FriendlyAppName', '/d', 'Administracao de Imoveis', '/f'],
    // sem %1: o endereço chamado não entra no comando
    ['add', `${CHAVE_PROTOCOLO}\\shell\\open\\command`, '/ve', '/d', `"${wscript(env)}" "${vbs}"`, '/f'],
  ];
}

const reg = (args) => spawnSync('reg.exe', args, { windowsHide: true, encoding: 'latin1' });

/** Registra o protocolo (idempotente: reg add /f troca o que havia). `true` se deu certo. `rodar` troca nos testes. */
export function registrarProtocolo(pasta, { rodar = reg, env = process.env } = {}) {
  return comandosDoProtocolo(pasta, env).every((a) => rodar(a).status === 0);
}

/** Tira o protocolo (desinstalar). Devolve 'apagado' | 'não havia' | 'falhou'. */
export function apagarProtocolo({ rodar = reg } = {}) {
  if (rodar(['query', CHAVE_PROTOCOLO]).status !== 0) return 'não havia';
  return rodar(['delete', CHAVE_PROTOCOLO, '/f']).status === 0 ? 'apagado' : 'falhou';
}

/**
 * Em cada rodada do .exe (para quem já tinha o programa instalado e trocou pelo novo): grava o .vbs e registra o protocolo
 * apontando para o programa instalado. Rodando pelo Node, ou sem o programa instalado, não faz nada.
 * Devolve 'registrado' | 'sem programa instalado' | 'falhou: …'.
 */
export function garantirProtocolo({ env = process.env, rodar = reg, exe = EXE } = {}) {
  if (!exe) return 'sem programa instalado';
  const pasta = pastaInstalada(env);
  if (!fs.existsSync(path.join(pasta, NOME_EXE))) return 'sem programa instalado';
  try {
    fs.writeFileSync(path.join(pasta, NOME_VBS_PASTA), textoVbsPasta(), 'latin1');
    return registrarProtocolo(pasta, { rodar, env }) ? 'registrado' : 'falhou: o Windows não aceitou o registro';
  } catch (e) { return `falhou: ${e.message}`; }
}

/** O Explorer pelo caminho inteiro, com a pasta como um argumento só (sem passar por cmd). */
function abrirExplorer(pasta, env = process.env) {
  spawn(path.win32.join(pastaWindows(env), 'explorer.exe'), [pasta], { detached: true, stdio: 'ignore' }).unref();
}

/**
 * --abrir-pasta: abre o Explorer na pasta "Arquivos dos imoveis" da pasta do backup seguro guardada em config.json (ao ligar o
 * computador); ainda sem a cópia, na pasta do backup seguro. Não usa nada de fora (argumentos, endereço). 0 = abriu.
 */
export function abrirPasta({ env = process.env, abrir = abrirExplorer } = {}) {
  let base = '';
  try { base = String(JSON.parse(fs.readFileSync(path.join(pastaConfig(env), ARQUIVO_CONFIG), 'utf8')).pasta || ''); } catch { /* não ligado */ }
  if (!base || !path.isAbsolute(base)) return 1;
  const alvo = [path.join(base, PASTA_COPIA), base].find((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
  if (!alvo) return 1;
  abrir(alvo, env);
  return 0;
}

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
  ${NOME_EXE} --desinstalar   apaga as tarefas do Windows e o botão "Abrir a pasta no Explorer" (o computador continua ligado até Desligar em Usuários)
  ${NOME_EXE} --abrir-pasta   abre no Explorer a pasta "Arquivos dos imoveis" (é o que o botão do sistema chama)
  ${NOME_EXE} --versao       mostra a versão
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
  fs.writeFileSync(path.join(pasta, NOME_VBS_PASTA), textoVbsPasta(), 'latin1');
  return pasta;
}

/** Um comando como se digitaria (para o --simular): argumento com espaço ou vazio vai entre aspas. */
const comoDigitado = (args) => args.map((a) => (/\s|^$/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');

/** Copia o programa e cria as tarefas. `true` se as três tarefas ficaram criadas. */
function instalar({ env, simular, elevado, dizer, rodarReg }) {
  if (simular) {
    const pasta = pastaInstalada(env);
    dizer(`[simulação: nada foi copiado nem criado]\nCopiaria o programa para ${pasta} e criaria as tarefas:`);
    for (const t of comandosDeCriar(pasta)) dizer(`  schtasks ${comoDigitado(t.comando)}`);
    dizer('Registraria o botão "Abrir a pasta no Explorer" (endereço imoveis-pasta:, só para este usuário):');
    for (const a of comandosDoProtocolo(pasta, env)) dizer(`  reg ${comoDigitado(a)}`);
    return true;
  }
  if (!EXE) throw new Error(`Instalar só funciona no programa ${NOME_EXE} (gerado por tools/gerar-exe.mjs). Pelo Node, use instalar-tarefa.cmd.`);
  const pasta = copiarPrograma(env, dizer);
  dizer(registrarProtocolo(pasta, { rodar: rodarReg, env }) ? 'Botão "Abrir a pasta no Explorer" do sistema ligado neste computador.'
    : 'Aviso: não consegui ligar o botão "Abrir a pasta no Explorer" (o resto continua normal).');
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
 * O programa inteiro. Devolve o código de saída (0 = certo). `dizer`, `env`, `atualizar`, `garantir` (registro do protocolo em
 * cada rodada), `rodarReg` (o reg.exe) e `abrir` (o Explorer) trocam nos testes.
 */
export async function executar(args = [], { env = process.env, dizer = console.log, atualizar = principal, pausar = esperarEnter,
  garantir = garantirProtocolo, rodarReg = reg, abrir = abrirExplorer } = {}) {
  // o botão do sistema (imoveis-pasta:): abre só a pasta configurada; qualquer outro argumento (até o endereço) é ignorado
  if (args.includes('--abrir-pasta')) return abrirPasta({ env, abrir });
  const versao = EXE?.versao || '';
  const tem = (a) => args.includes(a);
  // quem já tinha o programa e trocou pelo .exe novo ganha o botão "Abrir a pasta no Explorer" na rodada seguinte
  const emDia = () => { const r = garantir({ env, rodar: rodarReg }); if (r.startsWith('falhou')) dizer(`Aviso: o botão "Abrir a pasta no Explorer" não foi ligado (${r}).`); };
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
    if (pedido === '--atualizar') { emDia(); return (await atualizar([])) ? 0 : 1; }
    if (pedido === '--arquivos') { emDia(); return (await atualizar(['--arquivos'])) ? 0 : 1; }
    if (pedido === '--ligar') {
      emDia();
      const ok = await atualizar(['--ligar']);
      await pausar();
      return ok ? 0 : 1;
    }
    if (pedido === '--desinstalar') {
      if (simular) { dizer(`[simulação: nada foi apagado]\nApagaria as tarefas:\n${TAREFAS.map((t) => `  ${t.nome}`).join('\n')}\nE o botão "Abrir a pasta no Explorer":\n  reg delete ${CHAVE_PROTOCOLO} /f`); return 0; }
      if (!elevado) {
        const p = apagarProtocolo({ rodar: rodarReg });
        dizer(`Botão "Abrir a pasta no Explorer": ${p === 'apagado' ? 'desligado' : p === 'não havia' ? 'não estava ligado' : 'FALHOU ao desligar'}.`);
      }
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
      const ok = instalar({ env, simular, elevado, dizer, rodarReg });
      if (!elevado && !simular) await pausar();
      return ok ? 0 : 1;
    }
    // dois cliques: instala tudo
    dizer(`Administração de Imóveis — programa do computador${versao ? ` (versão ${versao})` : ''}\n`);
    dizer('Este programa mantém a pasta do backup seguro em dia com a nuvem, sozinho (todo dia às 20h, ao entrar no Windows e,\npara os arquivos, de hora em hora). Passos: 1) criar as tarefas do Windows; 2) ligar este computador; 3) primeira atualização.\n');
    dizer('Passo 1 de 3');
    const tarefas = instalar({ env, simular, elevado, dizer, rodarReg });
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
