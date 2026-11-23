// Programa do PC num arquivo só (.exe para Windows, sem instalar o Node): tools/gerar-exe.mjs empacota este arquivo com o Node
// dentro (Node "single executable application"). Faz, por argumento, tudo o que os .cmd e o .vbs desta pasta faziam:
// instalar (copia o programa para %LOCALAPPDATA%\Administracao de Imoveis\programa, liga o computador com e-mail e senha, cria
// as tarefas do Windows e roda a primeira atualização), ligar, atualizar, só os arquivos, desinstalar. Dois cliques = instalar.
// Em --atualizar (20h e ao entrar no Windows) o próprio programa se atualiza sozinho pela release do GitHub (se-atualizar.mjs).
// Sem assinatura de código por enquanto (decisão do dono, proposta de licença, item 11): o Windows mostra o aviso azul uma vez.
// A atualização em si é a de atualizador.mjs (`principal`); o crachá, o de ligar.mjs. Ajuda: Administracao-de-Imoveis.exe --ajuda
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { ARQUIVO_REGISTRO, EXE, PASTA_COPIA, principal } from './atualizador.mjs';
import { ICONE_ICO, NOME_ICONE } from './icone.mjs';
import { receberDoSistema } from './certificado-local.mjs';
import { assinarFila, informarNuvem, janelaDoCertificado, lerCertificado, resumoDoCertificado } from './certificado.mjs';

export { NOME_ICONE };import { ARQUIVO_CONFIG, lerLigacao, pastaConfig } from './ligar.mjs';
import { NOME_NOVO, NOME_TRAVA, NOME_VELHO, seAtualizar } from './se-atualizar.mjs';

export const NOME_EXE = 'Administracao-de-Imoveis.exe';
export const NOME_VBS = 'rodar-escondido.vbs';
export const NOME_VBS_PASTA = 'abrir-pasta.vbs';
/**
 * Botão "Abrir a pasta no Explorer" do sistema (Sistema → Backup seguro): o link `imoveis-pasta:abrir` chama este
 * programa, registrado por usuário (sem administrador) em HKCU\Software\Classes\imoveis-pasta. Segurança: o comando registrado
 * não leva o endereço (sem %1), o .vbs não repassa argumento nenhum e --abrir-pasta ignora o resto: um site qualquer só
 * consegue abrir a pasta da cópia aberta deste computador, nunca outro caminho nem outro comando.
 */
export const PROTOCOLO = 'imoveis-pasta';
export const CHAVE_PROTOCOLO = `HKCU\\Software\\Classes\\${PROTOCOLO}`;
/**
 * Botão "Desinstalar o programa deste computador" do sistema (pedido do dono de 17/11): o link `imoveis-desinstalar:confirmar`
 * chama desinstalar.vbs, que roda o programa com --desinstalar e nada mais. Quem desinstala é a pessoa: o programa sempre
 * pergunta antes numa janela do Windows (Sim/Não), então nenhum site consegue desinstalar sem um clique em Sim.
 */
export const PROTOCOLO_DESINSTALAR = 'imoveis-desinstalar';
export const CHAVE_PROTOCOLO_DESINSTALAR = `HKCU\\Software\\Classes\\${PROTOCOLO_DESINSTALAR}`;
export const NOME_VBS_DESINSTALAR = 'desinstalar.vbs';
/**
 * Botão "Anexar o certificado digital" do sistema (pedido do dono de 22/11): o link `imoveis-certificado:abrir` chama
 * certificado.vbs, que roda o programa escondido com --certificado-sistema e nada mais; ele só aceita o arquivo e a senha vindos
 * do próprio site, neste computador (certificado-local.mjs).
 */
export const PROTOCOLO_CERTIFICADO = 'imoveis-certificado';
export const CHAVE_PROTOCOLO_CERTIFICADO = `HKCU\\Software\\Classes\\${PROTOCOLO_CERTIFICADO}`;
export const NOME_VBS_CERTIFICADO = 'certificado.vbs';
/** A janela de pergunta do Windows (MsgBox), usada só pelo próprio programa ao desinstalar. */
export const NOME_VBS_JANELA = 'janela.vbs';
/** Configurações do Windows → Aplicativos → Aplicativos instalados: registro por usuário (sem administrador). */
export const CHAVE_DESINSTALAR = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AdministracaoDeImoveis';
export const NOME_NO_WINDOWS = 'Administração de Imóveis';
/** O que o programa grava na pasta `programa` (ao desinstalar, só isto é apagado; a pasta sai se ficar vazia). */
export const ARQUIVOS_DO_PROGRAMA = [NOME_EXE, NOME_VBS, NOME_VBS_PASTA, NOME_VBS_DESINSTALAR, NOME_VBS_CERTIFICADO, NOME_VBS_JANELA, NOME_ICONE, NOME_NOVO, NOME_VELHO, NOME_TRAVA];
export const TEXTO_CONFIRMAR = `Desinstalar ${NOME_NO_WINDOWS}?|As cópias e a pasta de arquivos continuam no computador.|Para cortar o acesso deste computador ao sistema, use Usuários → Aparelhos ligados → Desligar.`;
export const TEXTO_PRONTO = 'Pronto: programa desinstalado.|As cópias na pasta do backup seguro e a pasta Arquivos dos imoveis continuam no computador.|Para cortar o acesso deste computador ao sistema, use Usuários → Aparelhos ligados → Desligar.';
/** As mesmas tarefas (e os mesmos nomes) de instalar-tarefa.cmd: criar de novo troca as antigas, que chamavam o Node. */
export const TAREFAS = [
  { nome: 'Imoveis - atualizador da versao PC', quando: ['/SC', 'DAILY', '/ST', '20:00'], args: '--atualizar', texto: 'todo dia às 20h: dados, versão PC, arquivos e o próprio programa' },
  { nome: 'Imoveis - atualizador da versao PC (ao entrar)', quando: ['/SC', 'ONLOGON', '/DELAY', '0002:00'], args: '--atualizar', texto: 'ao entrar no Windows: dados, versão PC, arquivos e o próprio programa' },
  { nome: 'Imoveis - copia dos arquivos (de hora em hora)', quando: ['/SC', 'HOURLY'], args: '--arquivos', escondida: true, texto: 'de hora em hora, sem janela: só os arquivos' },
];
/** Assinatura digital (2026-11-21): criada ao instalar o certificado, pelo sistema ou pelo --certificado (só quem instala o certificado precisa dela); sai ao desinstalar. */
export const TAREFA_ASSINATURA = { nome: 'Imoveis - assinatura digital (a cada minuto)', quando: ['/SC', 'MINUTE', '/MO', '1'], args: '--assinar', escondida: true, texto: 'a cada minuto, sem janela: assina os documentos da fila' };

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

/**
 * O que o link imoveis-desinstalar: chama: roda o programa com --desinstalar (com a janela, para a pessoa ver o andamento) e
 * nada mais: não repassa os argumentos que o Windows possa acrescentar. Quem pergunta "Desinstalar?" é o próprio programa.
 */
export const textoVbsDesinstalar = () => [
  "' Gerado pelo programa Administracao de Imoveis: botao \"Desinstalar o programa deste computador\" do sistema (endereco imoveis-desinstalar:).",
  "' Nao repassa nada do endereco: o programa sempre pergunta antes (Sim/Nao) numa janela do Windows.",
  'Dim pasta',
  'pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)',
  `CreateObject("WScript.Shell").Run """" & pasta & "\\${NOME_EXE}"" --desinstalar", 1, False`,
  '',
].join('\r\n');

/** O que o link imoveis-certificado: chama: roda o programa escondido com --certificado-sistema, sem repassar nada do endereço. */
export const textoVbsCertificado = () => [
  "' Gerado pelo programa Administracao de Imoveis: botao \"Anexar o certificado digital\" do sistema (endereco imoveis-certificado:).",
  "' Nao repassa nada do endereco: o programa so aceita o certificado vindo do proprio site, neste computador.",
  'Dim pasta',
  'pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)',
  `CreateObject("WScript.Shell").Run """" & pasta & "\\${NOME_EXE}"" --certificado-sistema", 0, False`,
  '',
].join('\r\n');

/**
 * A janela do Windows (MsgBox) que o programa abre ao desinstalar: texto (| = quebra de linha), botões e título vêm do
 * programa; devolve o botão clicado (1 = OK, 6 = Sim, 7 = Não). Não fica registrada em lugar nenhum: só o programa a chama.
 */
export const textoVbsJanela = () => [
  "' Gerado pelo programa Administracao de Imoveis: janela de pergunta do Windows (usada pelo programa ao desinstalar).",
  'If WScript.Arguments.Count < 3 Then WScript.Quit 0',
  'WScript.Quit MsgBox(Replace(WScript.Arguments(0), "|", vbCrLf), CInt(WScript.Arguments(1)), WScript.Arguments(2))',
  '',
].join('\r\n');

const pastaWindows = (env = process.env) => env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
/** wscript.exe pelo caminho inteiro (o Windows não procura o programa na pasta de quem chamou o link). */
const wscript = (env = process.env) => path.win32.join(pastaWindows(env), 'System32', 'wscript.exe');

/** Os argumentos do reg.exe para um endereço próprio (protocolo) que chama um .vbs, sem nada do endereço (sem %1). */
function comandosDeUmProtocolo(chave, descricao, vbs, icone, env) {
  return [
    ['add', chave, '/ve', '/d', descricao, '/f'],
    ['add', chave, '/v', 'URL Protocol', '/d', '', '/f'],
    ['add', `${chave}\\DefaultIcon`, '/ve', '/d', `"${icone}",0`, '/f'],
    // o nome que o Chrome mostra na pergunta "Abrir …?" (sem ele, apareceria o do wscript)
    ['add', `${chave}\\shell\\open`, '/v', 'FriendlyAppName', '/d', 'Administracao de Imoveis', '/f'],
    // sem %1: o endereço chamado não entra no comando
    ['add', `${chave}\\shell\\open\\command`, '/ve', '/d', `"${wscript(env)}" "${vbs}"`, '/f'],
  ];
}

/** Os argumentos do reg.exe para registrar o protocolo imoveis-pasta: (por usuário, sem administrador). `pasta` = a do .exe. */
export function comandosDoProtocolo(pasta, env = process.env) {
  return comandosDeUmProtocolo(CHAVE_PROTOCOLO, 'URL:Abrir a pasta Arquivos dos imoveis', path.win32.join(pasta, NOME_VBS_PASTA), path.win32.join(pasta, NOME_ICONE), env);
}

/** O mesmo para imoveis-desinstalar: (o botão "Desinstalar o programa deste computador"). */
export function comandosDoProtocoloDesinstalar(pasta, env = process.env) {
  return comandosDeUmProtocolo(CHAVE_PROTOCOLO_DESINSTALAR, 'URL:Desinstalar o programa Administracao de Imoveis', path.win32.join(pasta, NOME_VBS_DESINSTALAR), path.win32.join(pasta, NOME_ICONE), env);
}

/** O mesmo para imoveis-certificado: (o botão "Anexar o certificado digital"). */
export function comandosDoProtocoloCertificado(pasta, env = process.env) {
  return comandosDeUmProtocolo(CHAVE_PROTOCOLO_CERTIFICADO, 'URL:Anexar o certificado digital da empresa', path.win32.join(pasta, NOME_VBS_CERTIFICADO), path.win32.join(pasta, NOME_ICONE), env);
}

/**
 * Os argumentos do reg.exe para o programa aparecer em Configurações do Windows → Aplicativos → Aplicativos instalados (por
 * usuário, sem administrador). `versao` = a do .exe; `kb` = o tamanho dele (EstimatedSize é em KB). "Desinstalar" lá roda o
 * .exe com --desinstalar, que pergunta antes. O ícone é o icone.ico ao lado do .exe (casinha; o .exe em si tem o do Node).
 */
export function comandosDeAplicativos(pasta, { versao = '', kb = 0 } = {}) {
  const exe = path.win32.join(pasta, NOME_EXE);
  const texto = (nome, valor) => ['add', CHAVE_DESINSTALAR, '/v', nome, '/t', 'REG_SZ', '/d', valor, '/f'];
  const numero = (nome, valor) => ['add', CHAVE_DESINSTALAR, '/v', nome, '/t', 'REG_DWORD', '/d', String(valor), '/f'];
  return [
    texto('DisplayName', NOME_NO_WINDOWS),
    texto('DisplayVersion', versao || 'sem versão'),
    texto('Publisher', NOME_NO_WINDOWS),
    texto('DisplayIcon', `${path.win32.join(pasta, NOME_ICONE)},0`),
    texto('InstallLocation', pasta),
    texto('UninstallString', `"${exe}" --desinstalar`),
    numero('NoModify', 1),
    numero('NoRepair', 1),
    ...(kb > 0 ? [numero('EstimatedSize', Math.ceil(kb))] : []),
  ];
}

/** Tudo o que o programa registra no Windows: os três botões do sistema e a entrada em Aplicativos instalados. */
export function comandosDoRegistro(pasta, env = process.env, info = {}) {
  return [...comandosDoProtocolo(pasta, env), ...comandosDoProtocoloDesinstalar(pasta, env), ...comandosDoProtocoloCertificado(pasta, env), ...comandosDeAplicativos(pasta, info)];
}

/** As chaves que o desinstalar tira (o que comandosDoRegistro cria). */
export const CHAVES_DO_PROGRAMA = [CHAVE_PROTOCOLO, CHAVE_PROTOCOLO_DESINSTALAR, CHAVE_PROTOCOLO_CERTIFICADO, CHAVE_DESINSTALAR];

const reg = (args) => spawnSync('reg.exe', args, { windowsHide: true, encoding: 'latin1' });

/** O tamanho do .exe instalado em KB (0 se não achou). */
const kbDoExe = (pasta) => { try { return Math.ceil(fs.statSync(path.join(pasta, NOME_EXE)).size / 1024); } catch { return 0; } };

/** Grava os .vbs (sem acento: .vbs em latin1) e o ícone ao lado do .exe. */
function gravarVbs(pasta) {
  fs.writeFileSync(path.join(pasta, NOME_ICONE), ICONE_ICO());
  fs.writeFileSync(path.join(pasta, NOME_VBS), textoVbs(), 'latin1');
  fs.writeFileSync(path.join(pasta, NOME_VBS_PASTA), textoVbsPasta(), 'latin1');
  fs.writeFileSync(path.join(pasta, NOME_VBS_DESINSTALAR), textoVbsDesinstalar(), 'latin1');
  fs.writeFileSync(path.join(pasta, NOME_VBS_CERTIFICADO), textoVbsCertificado(), 'latin1');
  fs.writeFileSync(path.join(pasta, NOME_VBS_JANELA), textoVbsJanela(), 'latin1');
}

/** Registra tudo (idempotente: reg add /f troca o que havia). `true` se deu certo. `rodar` troca nos testes. */
export function registrarNoWindows(pasta, { rodar = reg, env = process.env, versao = EXE?.versao || '' } = {}) {
  return comandosDoRegistro(pasta, env, { versao, kb: kbDoExe(pasta) }).every((a) => rodar(a).status === 0);
}

/** Tira uma chave do registro (desinstalar). Devolve 'apagado' | 'não havia' | 'falhou'. */
export function apagarChave(chave, { rodar = reg } = {}) {
  if (rodar(['query', chave]).status !== 0) return 'não havia';
  return rodar(['delete', chave, '/f']).status === 0 ? 'apagado' : 'falhou';
}
export const apagarProtocolo = ({ rodar = reg } = {}) => apagarChave(CHAVE_PROTOCOLO, { rodar });

/**
 * Em cada rodada do .exe (para quem já tinha o programa instalado e trocou pelo novo): grava os .vbs e registra os botões do
 * sistema e a entrada em Aplicativos instalados, apontando para o programa instalado. Rodando pelo Node, ou sem o programa
 * instalado, não faz nada. Devolve 'registrado' | 'sem programa instalado' | 'falhou: …'.
 */
export function garantirRegistro({ env = process.env, rodar = reg, exe = EXE } = {}) {
  if (!exe) return 'sem programa instalado';
  const pasta = pastaInstalada(env);
  if (!fs.existsSync(path.join(pasta, NOME_EXE))) return 'sem programa instalado';
  try {
    gravarVbs(pasta);
    return registrarNoWindows(pasta, { rodar, env, versao: exe.versao || '' }) ? 'registrado' : 'falhou: o Windows não aceitou o registro';
  } catch (e) { return `falhou: ${e.message}`; }
}

/** A pasta do backup seguro guardada em config.json (ao ligar o computador), ou ''. */
function pastaDoBackup(env = process.env) {
  try { return String(JSON.parse(fs.readFileSync(path.join(pastaConfig(env), ARQUIVO_CONFIG), 'utf8')).pasta || ''); } catch { return ''; }
}

/**
 * O programa se atualiza sozinho (se-atualizar.mjs) e anota o resultado no fim de ultima-atualizacao.txt (pasta do backup
 * seguro). Devolve { situacao, texto }. Pelo Node ou fora da pasta instalada, não mexe em nada ('pulado').
 */
export async function atualizarPrograma({ env = process.env, exe = EXE, trocar = seAtualizar } = {}) {
  const pasta = pastaInstalada(env);
  // para o teste de ponta a ponta no Windows: a "release" pode ser um servidor deste computador (nunca outro endereço)
  const local = /^http:\/\/127\.0\.0\.1:\d{2,5}\/$/.test(env.IMOVEIS_URL_RELEASE || '') ? { url: env.IMOVEIS_URL_RELEASE } : {};
  const r = await trocar({ pasta, exe: path.join(pasta, NOME_EXE), atual: exe?.versao || '', ...local });
  const base = pastaDoBackup(env);
  if (base && r.situacao !== 'pulado') { try { fs.appendFileSync(path.join(base, ARQUIVO_REGISTRO), `  programa do PC: ${r.texto}\n`); } catch { /* sem pasta */ } }
  return r;
}

/**
 * A pasta `programa` que o desinstalar pode limpar, ou null: tem de ser exatamente <pasta do crachá>\programa e não pode
 * conter nem estar dentro da pasta do backup seguro (o backup e os arquivos dos inquilinos nunca são apagados).
 */
export function pastaQuePodeApagar(env = process.env) {
  const pasta = path.resolve(pastaInstalada(env));
  if (path.basename(pasta) !== 'programa' || path.dirname(pasta) !== path.resolve(pastaConfig(env))) return null;
  const backup = pastaDoBackup(env);
  if (backup) {
    const b = path.resolve(backup).toLowerCase(); const p = pasta.toLowerCase();
    if (b === p || b.startsWith(p + path.sep) || p.startsWith(b + path.sep)) return null;
  }
  return pasta;
}

/**
 * Apaga da pasta `programa` só os arquivos do programa (ARQUIVOS_DO_PROGRAMA) e a pasta, se ficar vazia. O .exe em uso não se
 * apaga sozinho: quando é ele que está rodando, um PowerShell escondido espera o programa fechar e apaga depois.
 */
export function apagarPastaDoPrograma(pasta, env = process.env) {
  if (!fs.existsSync(pasta)) return;
  if (path.resolve(path.dirname(process.execPath)).toLowerCase() === path.resolve(pasta).toLowerCase()) {
    const script = '$p=$env:IMOVEIS_PASTA; Wait-Process -Id $env:IMOVEIS_PID -Timeout 600 -ErrorAction SilentlyContinue; '
      + 'for($i=0;$i -lt 30;$i++){ foreach($n in $env:IMOVEIS_ARQUIVOS.Split("|")){ Remove-Item -LiteralPath (Join-Path $p $n) -Force -ErrorAction SilentlyContinue }; '
      + 'if(-not (Get-ChildItem -LiteralPath $p -Force -ErrorAction SilentlyContinue)){ Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue }; '
      + 'if(-not (Test-Path -LiteralPath $p)){ break }; Start-Sleep -Seconds 1 }';
    spawn(path.win32.join(pastaWindows(env), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', script],
      { env: { ...process.env, IMOVEIS_PASTA: pasta, IMOVEIS_PID: String(process.pid), IMOVEIS_ARQUIVOS: ARQUIVOS_DO_PROGRAMA.join('|') }, detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  for (const n of ARQUIVOS_DO_PROGRAMA) fs.rmSync(path.join(pasta, n), { force: true });
  try { fs.rmdirSync(pasta); } catch { /* sobrou algo que não é do programa: a pasta fica */ }
}

/**
 * Janela do Windows (MsgBox por janela.vbs, gravado na pasta `programa`). Com `simNao`: Sim/Não com o Não marcado, devolve
 * 'sim' | 'não' | 'sem janela' (não abriu); sem: só OK, devolve 'ok' | 'sem janela'.
 */
export function janelaDoWindows(texto, { simNao = false, env = process.env } = {}) {
  try {
    const pasta = pastaInstalada(env);
    fs.mkdirSync(pasta, { recursive: true });
    const vbs = path.join(pasta, NOME_VBS_JANELA);
    fs.writeFileSync(vbs, textoVbsJanela(), 'latin1');
    // 4 = Sim/Não, 32 = pergunta, 256 = Não marcado; 64 = informação; 4096 = na frente das outras janelas
    const botoes = (simNao ? 4 + 32 + 256 : 64) + 4096;
    const r = spawnSync(wscript(env), [vbs, texto.replace(/"/g, "'"), String(botoes), NOME_NO_WINDOWS]);
    if (simNao) return r.status === 6 ? 'sim' : r.status === 7 ? 'não' : 'sem janela';
    return r.status === 1 ? 'ok' : 'sem janela';
  } catch { return 'sem janela'; }
}

/** Pergunta "Desinstalar?" na janela do Windows; se ela não abriu, na janela preta (S e Enter). `true` = Sim. */
async function confirmarNoWindows(texto, env = process.env) {
  const r = janelaDoWindows(texto, { simNao: true, env });
  if (r !== 'sem janela') return r === 'sim';
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resposta = await new Promise((ok) => { rl.question(`\n${texto.replace(/\|/g, '\n')}\nDigite S e Enter para desinstalar (qualquer outra coisa cancela): `, (x) => { rl.close(); ok(x); }); });
  return /^\s*s/i.test(resposta);
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
  const base = pastaDoBackup(env);
  if (!base || !path.isAbsolute(base)) return 1;
  const alvo = [path.join(base, PASTA_COPIA), base].find((p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
  if (!alvo) return 1;
  abrir(alvo, env);
  return 0;
}

/** Os argumentos do schtasks para criar cada tarefa. `pasta` = onde estão o .exe e o .vbs. */
export function comandosDeCriar(pasta, lista = TAREFAS) {
  const exe = path.win32.join(pasta, NOME_EXE); const vbs = path.win32.join(pasta, NOME_VBS);
  return lista.map((t) => ({ ...t, comando: ['/Create', '/F', ...t.quando, '/TN', t.nome, '/TR', t.escondida ? `wscript.exe "${vbs}" ${t.args}` : `"${exe}" ${t.args}`] }));
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

/** A tarefa de cada minuto (quem instalou o programa antes do certificado ainda não a tem). Devolve se ficou criada. */
export function criarTarefaDaAssinatura(env = process.env, { rodar = schtasks } = {}) {
  const [t] = comandosDeCriar(pastaInstalada(env), [TAREFA_ASSINATURA]);
  return rodar(t.comando).status === 0;
}

export function apagarTarefas({ rodar = schtasks, dizer = console.log } = {}) {
  // a da assinatura só existe onde o certificado foi instalado: sem ela, nada a dizer
  if (tarefaExiste(TAREFA_ASSINATURA.nome, rodar)) dizer(`  ${rodar(['/Delete', '/F', '/TN', TAREFA_ASSINATURA.nome]).status === 0 ? 'apagada' : 'FALHOU '} ${TAREFA_ASSINATURA.nome}`);
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
  ${NOME_EXE} --atualizar     atualiza agora: dados, versão PC, arquivos e o próprio programa (se saiu versão nova)
  ${NOME_EXE} --arquivos      atualiza agora só a pasta "Arquivos dos imoveis"
  ${NOME_EXE} --certificado   instala (ou troca) o certificado digital A1 da empresa (.pfx e a senha, guardados só aqui, cifrados)
                              (o jeito normal é pelo sistema: Sistema → Empresas → Anexar o certificado digital)
  ${NOME_EXE} --assinar       assina agora os documentos da fila (a tarefa faz isso a cada minuto, com o certificado instalado)
  ${NOME_EXE} --instalar      só copia o programa e cria as tarefas (20h, ao entrar e de hora em hora)
  ${NOME_EXE} --desinstalar   pergunta antes e desinstala: tarefas, botões do sistema, Aplicativos instalados e a pasta "programa"
                              (o backup e os arquivos ficam; o computador continua ligado até Desligar em Usuários)
  ${NOME_EXE} --abrir-pasta   abre no Explorer a pasta "Arquivos dos imoveis" (é o que o botão do sistema chama)
  ${NOME_EXE} --versao       mostra a versão
  ${NOME_EXE} --ajuda         mostra este texto
  --simular                   junto de --instalar ou --desinstalar: só mostra o que faria, sem mexer em nada

O programa se atualiza sozinho (às 20h e ao entrar no Windows): baixa a versão nova do GitHub, confere o arquivo e troca;
a nova vale a partir da rodada seguinte. O resultado de cada atualização fica em ultima-atualizacao.txt, na pasta do
backup seguro.`;

const COMANDOS = ['--ligar', '--atualizar', '--arquivos', '--certificado', '--certificado-sistema', '--assinar', '--instalar', '--desinstalar', '--versao', '--ajuda'];

function esperarEnter(texto = 'Aperte Enter para fechar.') {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return Promise.resolve();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((ok) => { rl.question(`\n${texto} `, () => { rl.close(); ok(); }); });
}

/** Copia o programa para a pasta instalada (se já não está rodando de lá) e grava os .vbs. Devolve a pasta. */
function copiarPrograma(env, dizer) {
  const pasta = pastaInstalada(env); const destino = path.join(pasta, NOME_EXE);
  fs.mkdirSync(pasta, { recursive: true });
  if (path.resolve(process.execPath).toLowerCase() !== path.resolve(destino).toLowerCase()) {
    try { fs.copyFileSync(process.execPath, destino); } catch (e) {
      throw new Error(`Não consegui copiar o programa para ${pasta} (${e.code || e.message}). Se uma atualização está rodando agora, espere um minuto e abra de novo.`);
    }
    dizer(`Programa copiado para ${pasta} (o arquivo baixado pode ser apagado depois).`);
  }
  gravarVbs(pasta);
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
    dizer('Registraria os botões "Abrir a pasta no Explorer", "Desinstalar o programa deste computador" e "Anexar o certificado digital" (endereços imoveis-pasta:, imoveis-desinstalar: e imoveis-certificado:) e a entrada em Aplicativos instalados do Windows, só para este usuário:');
    for (const a of comandosDoRegistro(pasta, env, { versao: EXE?.versao || '' })) dizer(`  reg ${comoDigitado(a)}`);
    return true;
  }
  if (!EXE) throw new Error(`Instalar só funciona no programa ${NOME_EXE} (gerado por tools/gerar-exe.mjs). Pelo Node, use instalar-tarefa.cmd.`);
  const pasta = copiarPrograma(env, dizer);
  dizer(registrarNoWindows(pasta, { rodar: rodarReg, env }) ? 'Programa registrado no Windows (Aplicativos instalados) e botões do sistema ligados neste computador.'
    : 'Aviso: não consegui registrar o programa no Windows (Aplicativos instalados e botões do sistema; o resto continua normal).');
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

const NOMES_DAS_CHAVES = { [CHAVE_PROTOCOLO]: 'Botão "Abrir a pasta no Explorer"', [CHAVE_PROTOCOLO_DESINSTALAR]: 'Botão "Desinstalar o programa deste computador"', [CHAVE_PROTOCOLO_CERTIFICADO]: 'Botão "Anexar o certificado digital"', [CHAVE_DESINSTALAR]: 'Aplicativos instalados do Windows' };
const comoFicou = (r) => (r === 'apagado' ? 'tirado' : r === 'não havia' ? 'não estava' : 'FALHOU ao tirar');

/**
 * --desinstalar (Configurações do Windows → Aplicativos instalados → Desinstalar, o botão do sistema ou à mão): pergunta antes
 * numa janela do Windows (Sim/Não); com Sim, tira os botões do sistema, as tarefas, a entrada em Aplicativos instalados e, por
 * fim, os arquivos do programa da pasta `programa`. Nunca mexe na pasta do backup seguro, na cópia aberta dos arquivos, no
 * crachá nem em config.json (o computador continua ligado até Desligar em Usuários → Aparelhos ligados).
 * Com --elevado (a cópia aberta como administrador por esta mesma rotina): só apaga as tarefas, sem perguntar de novo.
 */
async function desinstalar({ env, dizer, simular, elevado, rodarReg, rodarTarefas, perguntar, avisar, apagarPasta, elevar, pausar }) {
  if (simular) {
    dizer(`[simulação: nada foi apagado]\nPerguntaria antes (Sim/Não) numa janela do Windows. Com Sim, apagaria as tarefas:\n${TAREFAS.map((t) => `  ${t.nome}`).join('\n')}\nTiraria do registro do Windows (só deste usuário):\n${CHAVES_DO_PROGRAMA.map((c) => `  reg delete ${c} /f`).join('\n')}`);
    const pasta = pastaQuePodeApagar(env);
    dizer(pasta ? `E apagaria de ${pasta} só os arquivos do programa (${ARQUIVOS_DO_PROGRAMA.join(', ')}).` : 'A pasta do programa não seria apagada (fica junto da pasta do backup seguro).');
    dizer('Não mexeria na pasta do backup seguro, na pasta "Arquivos dos imoveis", no crachá nem em config.json.');
    return 0;
  }
  if (elevado) { apagarTarefas({ dizer, rodar: rodarTarefas }); return TAREFAS.some((t) => tarefaExiste(t.nome, rodarTarefas)) ? 1 : 0; }
  if (!(await perguntar(TEXTO_CONFIRMAR, env))) { dizer('Nada foi desinstalado.'); return 0; }
  dizer('Desinstalando o programa deste computador:');
  for (const chave of CHAVES_DO_PROGRAMA.filter((c) => c !== CHAVE_DESINSTALAR)) dizer(`  ${NOMES_DAS_CHAVES[chave]}: ${comoFicou(apagarChave(chave, { rodar: rodarReg }))}.`);
  dizer('Apagando as tarefas do Windows:');
  apagarTarefas({ dizer, rodar: rodarTarefas });
  if (TAREFAS.some((t) => tarefaExiste(t.nome, rodarTarefas))) {
    dizer('\nO Windows pede permissão de administrador para apagar: responda "Sim" na janela que vai abrir.');
    elevar(process.execPath, ['--desinstalar', '--elevado']);
  }
  const ficou = TAREFAS.filter((t) => tarefaExiste(t.nome, rodarTarefas));
  if (ficou.length) {
    // a entrada em Aplicativos instalados fica, para tentar de novo por lá
    const texto = `Não consegui apagar: ${ficou.map((t) => t.nome).join('; ')}. Tente de novo em Configurações do Windows → Aplicativos → Aplicativos instalados → ${NOME_NO_WINDOWS} → Desinstalar.`;
    dizer(texto);
    if (avisar(`Não terminou.|${texto}`, env) !== 'ok') await pausar();
    return 1;
  }
  dizer(`  ${NOMES_DAS_CHAVES[CHAVE_DESINSTALAR]}: ${comoFicou(apagarChave(CHAVE_DESINSTALAR, { rodar: rodarReg }))}.`);
  const pasta = pastaQuePodeApagar(env);
  dizer(`\n${TEXTO_PRONTO.replace(/\|/g, '\n')}`);
  const viu = avisar(TEXTO_PRONTO, env) === 'ok';
  // por último: os arquivos do programa (o .exe em uso sai depois que este programa fechar)
  if (pasta) apagarPasta(pasta, env);
  if (!viu) await pausar();
  return 0;
}

/**
 * O programa inteiro. Devolve o código de saída (0 = certo). Trocam nos testes: `dizer`, `env`, `atualizar`, `garantir`
 * (registro no Windows em cada rodada), `rodarReg` (o reg.exe), `rodarTarefas` (o schtasks.exe), `abrir` (o Explorer),
 * `perguntar` e `avisar` (as janelas do Windows), `apagarPasta` (os arquivos do programa) e `elevar` (pedir administrador).
 */
export async function executar(args = [], { env = process.env, dizer = console.log, atualizar = principal, pausar = esperarEnter,
  garantir = garantirRegistro, rodarReg = reg, rodarTarefas = schtasks, abrir = abrirExplorer, perguntar = confirmarNoWindows,
  avisar = (texto, e) => janelaDoWindows(texto, { env: e }), apagarPasta = apagarPastaDoPrograma, elevar = rodarComoAdministrador,
  programa = () => atualizarPrograma({ env }), lerLig = lerLigacao, lerCert = lerCertificado, assinarFilaFn = assinarFila, janelaCert = janelaDoCertificado, receberCert = receberDoSistema, informar = informarNuvem } = {}) {
  // o botão do sistema (imoveis-pasta:): abre só a pasta configurada; qualquer outro argumento (até o endereço) é ignorado
  if (args.includes('--abrir-pasta')) return abrirPasta({ env, abrir });
  const versao = EXE?.versao || '';
  const tem = (a) => args.includes(a);
  // quem já tinha o programa e trocou pelo .exe novo ganha os botões do sistema e a entrada em Aplicativos na rodada seguinte
  const emDia = () => { const r = garantir({ env, rodar: rodarReg }); if (r.startsWith('falhou')) dizer(`Aviso: o programa não foi registrado no Windows (botões do sistema e Aplicativos instalados: ${r}).`); };
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
    if (pedido === '--atualizar') {
      emDia();
      const ok = await atualizar([]);
      // depois dos dados (que nunca esperam o download do programa); falhar aqui não muda o resultado dos dados
      try { const p = await programa(); if (p.situacao !== 'pulado') dizer(`Programa do PC: ${p.texto}.`); } catch (e) { dizer(`Programa do PC: não deu para conferir a versão nova (${e.message}).`); }
      return ok ? 0 : 1;
    }
    if (pedido === '--arquivos') { emDia(); return (await atualizar(['--arquivos'])) ? 0 : 1; }
    if (pedido === '--ligar') {
      emDia();
      const ok = await atualizar(['--ligar']);
      await pausar();
      return ok ? 0 : 1;
    }
    if (pedido === '--assinar') return await rodadaDeAssinatura({ env, dizer, lerLig, lerCert, assinar: assinarFilaFn, versao });
    if (pedido === '--certificado-sistema') {
      // chamado pelo botão do sistema, sem janela: quem conversa com a pessoa é o site
      let lig = null;
      try { lig = lerLig(env); } catch { /* crachá que não abre nesta conta do Windows: o site manda ligar de novo */ }
      // a nuvem fica sabendo antes da resposta à tela: a caixa do certificado já mostra o certo quando a janela fecha
      const r = await receberCert({ env, ligacao: lig, relerLigacao: () => lerLig(env),
        aoInstalar: async (l) => { const tarefa = !EXE || criarTarefaDaAssinatura(env, { rodar: rodarTarefas }); if (l) await informar(l, resumoDoCertificado(env), { versao }); return tarefa; },
        aoRemover: async (l) => { if (l) await informar(l, null, { versao }); } });
      if (r.situacao === 'removido') return 0;
      if (r.situacao !== 'instalado') return 0;
      return await rodadaDeAssinatura({ env, dizer, lerLig, lerCert, assinar: assinarFilaFn, versao });
    }
    if (pedido === '--certificado') {
      if (!lerLig(env)) { dizer('Primeiro ligue este computador ao sistema: abra o programa com dois cliques (e-mail e senha do sistema).'); await pausar(); return 1; }
      dizer('Abrindo a página do certificado no navegador (só neste computador): escolha o arquivo .pfx da empresa e digite a senha dele.');
      const c = await janelaCert({ env });
      dizer(`Certificado instalado: ${c.nome}${c.cnpj ? `, CNPJ ${c.cnpj}` : ''}, válido até ${String(c.validade || '').split('-').reverse().join('/')}.`);
      // a tarefa de cada minuto (quem instalou antes desta versão ainda não a tem); sem ela, só assina quando abrir o programa
      if (EXE && !criarTarefaDaAssinatura(env, { rodar: rodarTarefas })) dizer(`Aviso: não consegui criar a tarefa "${TAREFA_ASSINATURA.nome}". Clique com o botão direito no programa → "Executar como administrador" e repita.`);
      const r = await rodadaDeAssinatura({ env, dizer, lerLig, lerCert, assinar: assinarFilaFn, versao });
      await pausar();
      return r;
    }
    if (pedido === '--desinstalar') return await desinstalar({ env, dizer, simular, elevado, rodarReg, rodarTarefas, perguntar, avisar, apagarPasta, elevar, pausar });
    if (pedido === '--instalar') {
      const ok = instalar({ env, simular, elevado, dizer, rodarReg });
      if (!elevado && !simular) await pausar();
      return ok ? 0 : 1;
    }
    // dois cliques: instala tudo
    dizer(`Administração de Imóveis — programa do computador${versao ? ` (versão ${versao})` : ''}\n`);
    dizer('Este programa mantém a pasta do backup seguro em dia com a nuvem, sozinho (todo dia às 20h, ao entrar no Windows e,\npara os arquivos, de hora em hora), e se atualiza sozinho quando sai uma versão nova. Passos: 1) criar as tarefas do Windows; 2) ligar este computador; 3) primeira atualização.\n');
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

/**
 * Uma rodada da assinatura digital (--assinar, a cada minuto): sem certificado, sai na hora (0) sem ir à internet; com ele,
 * assina a fila da nuvem. Devolve 0 (ok) ou 1 (falhou: sem internet, computador desligado do sistema).
 */
export async function rodadaDeAssinatura({ env = process.env, dizer = console.log, lerLig = lerLigacao, lerCert = lerCertificado, assinar = assinarFila, versao = '' } = {}) {
  if (!resumoDoCertificado(env)) return 0;
  const lig = lerLig(env);
  if (!lig) { dizer('Assinatura digital: este computador não está ligado ao sistema.'); return 1; }
  try {
    const r = await assinar(lig, lerCert(env), { versao });
    if (r.assinados || r.erros.length) dizer(`Assinatura digital: ${r.assinados} documento(s) assinado(s)${r.erros.length ? `; não assinados: ${r.erros.join('; ')}` : ''}.`);
    return 0;
  } catch (e) { dizer(`Assinatura digital: ${e.message}`); return 1; }
}

// no .exe quem chama é a entrada gerada por tools/gerar-exe.mjs; pelo Node: node programa.mjs --ajuda
if (!EXE && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) executar(process.argv.slice(2)).then((c) => { process.exitCode = c; });
