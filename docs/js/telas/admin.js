// Administração: backup seguro, empresas emitentes, histórico de alterações e Dados e backup.
import { alterar, aviso, conferirBackupDaEmpresa, DIAS_BACKUP_EMPRESA, E, janela, login, mostrar, podeUsuario } from '../app.js';
import * as S from '../armazenamento.js';
import * as AJ from '../ajuda.js';
import * as AI from '../arquivo-impresso.js';
import * as B from '../backup-seguro.js';
import { dataBr, dataHoraBr, ErroUsuario, reais } from '../calculos.js';
import * as CA from '../copia-aberta.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { caixaConfigBanco, caixaContaDosBoletos } from './banco-c6.js';
import { caixaConfigBanco2 } from './banco.js';
import { CADASTROS } from './cadastros.js';
import { botao, buscarComLimite, carregarParte, d, etiqueta, item, link, opera, ordenar, tabelaHistorico } from './comum.js';
import { caixaGmailHtml } from './emails.js';
import { caixaIcone } from './icone.js';

// --------------------------------------------------------------------------
// Backup seguro do administrador
// --------------------------------------------------------------------------
const tamanho = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const FORM_RESTAURAR = `<form data-form="restaurarSeguro" class="formulario">
    <div><label>Arquivo de backup (.bkp)</label><input type="file" name="arquivo" accept="${B.EXTENSAO}"></div>
    <div><label>Senha do backup</label><input type="password" name="senha" autocomplete="off"></div>
    ${S.suportado() ? '<div><label>O que fazer</label><select name="destino"><option value="pasta">Abrir numa pasta nova do computador (o sistema abre com esses dados)</option><option value="zip">Só baixar o ZIP</option></select></div>' : '<input type="hidden" name="destino" value="zip">'}
    <div class="check"><button>Abrir o backup</button></div></form>
  <p class="suave">${S.suportado() ? `<b>Abrir numa pasta:</b> escolha uma pasta nova e vazia; o sistema grava ali os dados (e os anexos, se o backup for completo) e abre. Só para desastre (dados da nuvem perdidos): com o site só fora do ar, use o aplicativo instalado, que envia sozinho depois. Na pasta, para levar de volta à nuvem, <b>Dados e backup → Substituir os dados da nuvem pelos de uma pasta</b> leva o que fez para a nuvem (para só voltar o banco a um dia, <b>Backups da nuvem</b> é mais simples).`
    : 'Neste aparelho só dá para baixar o ZIP: abrir o backup numa pasta (e levar de volta à nuvem) se faz no computador, no Chrome ou no Edge.'}
    <b>ZIP:</b> igual ao do "Exportar tudo", para guardar. Para voltar os dados com ele: com os dados numa pasta do computador, "Importar ZIP" em Dados e backup; na nuvem (onde não há "Importar ZIP"), use "Backups da nuvem" ou abra o backup numa pasta nova do computador e depois "Substituir os dados da nuvem pelos de uma pasta". Os usuários e senhas voltam junto.</p>`;

export function telaRestaurarBackup() {
  return `<main><div id="mensagens"></div><div class="cartao login" style="max-width:640px">
    <h1>Restaurar backup seguro</h1>
    <p>Use só em caso de desastre (dados perdidos). Site fora do ar ou sem internet: abra pelo aplicativo instalado, que guarda os dados neste aparelho e envia sozinho quando voltar. Para restaurar, escolha um arquivo da pasta do backup seguro (<b>${B.PASTA_DIARIO}</b> tem a cópia do banco de cada dia; <b>${B.PASTA_HORAS}</b>, a de cada hora dos últimos dias, para voltar a antes de um erro; <b>${B.PASTA_SEMANAL}</b> tem os completos, com anexos) e digite a senha do backup.</p>
    ${FORM_RESTAURAR}
    <p><a href="#/">Voltar</a></p></div></main>`;
}

export async function telaBackupSeguro() {
  if (!podeUsuario('admin')) return '<h1>Acesso só para administradores</h1>';
  if (!E.seguro || !E.seguro.chave) {
    const nova = E.pastaSeguraNova;
    const chaveExistente = nova ? await B.lerChave(nova) : null;
    return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Backup seguro</h1>
      ${E.nuvem && E.backupEmpresa?.feito_em ? `<div class="alerta ${B.avisoDaEmpresa(E.backupEmpresa, Date.now(), DIAS_BACKUP_EMPRESA) ? 'aviso' : 'ok'}"><b>Backup seguro da empresa:</b> última cópia em ${esc(ultimaCopiaDaEmpresa())}, feita por outro computador. Basta um computador com o backup ligado: ligue neste só se ele for passar a ser o computador do backup (ou um segundo, de reserva).</div>` : ''}
      ${E.seguro && E.seguro.desconectado ? `<div class="alerta aviso">A pasta <b>${esc(E.seguro.dir.name)}</b> já está configurada, mas o navegador pede para liberar o acesso de novo. ${botao('reconectarSeguro', 'Reconectar', {}, 'pequeno')}</div>` : ''}
      <div class="cartao"><h2>1. Escolha a pasta segura</h2>
        <p>Use uma pasta <b>fora</b> da pasta dos dados e que só você acesse (por exemplo, num HD externo ou numa pasta só sua). Ela fica ligada só a <b>este computador</b>: os outros usuários não veem nem gravam nela.</p>
        <p>${!E.teste && !S.suportado() ? '<span class="alerta aviso" style="display:block">Faça isto no computador (Chrome ou Edge): este navegador não deixa o sistema gravar numa pasta.</span>'
    : botao('escolherPastaSegura', nova ? `Pasta escolhida: ${esc(nova.name)} (trocar)` : 'Escolher a pasta segura', {}, nova ? 'secundario' : '')}</p></div>
      ${nova ? `<div class="cartao"><h2>2. ${chaveExistente ? 'Digite a senha do backup' : 'Crie a senha do backup'}</h2>
        ${chaveExistente ? `<p>Esta pasta já tem backups seguros (chave criada em ${new Date(chaveExistente.criada_em).toLocaleDateString('pt-BR')}). Digite a senha para ligar este computador a ela.</p>`
    : '<div class="alerta aviso"><b>Guarde esta senha em local seguro.</b> Ela é pedida só para restaurar. Sem ela, nenhum backup pode ser aberto, nem por você nem pelo suporte. Use pelo menos 12 caracteres (uma frase curta serve).</div>'}
        <form data-form="configurarSeguro" class="formulario">
          <div><label>Senha do backup</label><input type="password" name="senha" autocomplete="new-password"></div>
          ${chaveExistente ? '' : '<div><label>Repita a senha</label><input type="password" name="senha2" autocomplete="new-password"></div>'}
          <div class="check"><button>${chaveExistente ? 'Conectar' : 'Criar e fazer o primeiro backup'}</button></div></form></div>` : ''}
      <div class="cartao"><h2>Restaurar</h2>${FORM_RESTAURAR}</div>`;
  }
  const lista = await B.listarBackups(E.seguro.dir);
  const copia = await CA.situacaoCopia(E.seguro.dir);
  const ultimo = (pasta) => lista.find((x) => x.pasta === pasta);
  const quando = (x) => (x ? dataHoraBr(x.alterado) : 'nenhum ainda');
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Backup seguro</h1>
    ${E.seguroErro ? `<div class="alerta erro">A última cópia falhou: ${esc(E.seguroErro)}</div>` : ''}
    <div class="cartao"><div class="grade">
      ${item('Pasta segura (só neste computador)', esc(E.seguro.dir.name))}
      ${item('Última cópia dos dados', quando(ultimo(B.PASTA_DIARIO)))}
      ${item('Último backup completo', quando(ultimo(B.PASTA_SEMANAL)))}
      ${item('Guarda', `${B.MANTER_DIARIOS} cópias diárias, ${B.MANTER_SEMANAIS} completos semanais e 1 completo por mês durante ${B.MANTER_MENSAIS} meses`)}</div>
      <p class="suave">${E.nuvem ? 'A cada alteração que chega a <b>este computador</b> (feita aqui ou em outro aparelho), a cópia do dia é atualizada: é a segunda camada do backup, fora da nuvem.' : 'A cada alteração no sistema feita <b>neste computador</b>, a cópia do dia é atualizada. As alterações feitas em outros computadores entram na próxima vez que o sistema for aberto aqui.'}
        O completo semanal é feito sozinho quando o sistema é aberto e já passou uma semana do último. Os arquivos são cifrados: sem a senha do backup ninguém consegue abrir.</p>
      <div class="acoes">${botao('backupCompletoAgora', 'Fazer backup completo agora', { status: 'Fazendo o backup completo…' }, '')}
        ${botao('desconectarSeguro', 'Desligar neste computador', {}, 'perigo pequeno', 'Desligar o backup seguro neste computador? Os arquivos já gravados continuam na pasta.')}</div>
      <div id="progresso-backup" aria-live="polite"></div></div>
    <div class="cartao"><h2>Cópia aberta dos arquivos</h2>
      <p>Na pasta segura, a subpasta <b>${CA.PASTA_COPIA}</b> tem os arquivos do sistema <b>sem cifrar</b>, como no sistema (imóvel → Inquilinos → pessoa), para abrir, imprimir e copiar direto no Windows. É só para consulta: o que for posto ou mudado lá não vai para o sistema (anexe sempre pelo sistema).</p>
      ${E.nuvem ? `<div class="grade">
        ${item('Arquivos na cópia', copia ? String(copia.total) : 'ainda não feita')}
        ${item('Atualizada em', copia ? `${dataHoraBr(copia.atualizado_em)} (${copia.por === 'atualizador' ? 'pelo atualizador do PC' : 'por este computador'})` : '-')}
        ${copia && copia.falhas ? item('Ficaram para a próxima', `${copia.falhas} arquivo(s) não baixaram`) : ''}</div>
      <p class="suave">Atualiza sozinha: logo depois de anexar, apagar ou mover arquivos neste computador, e de hora em hora pelo atualizador do PC (o que foi anexado no celular ou por outra pessoa).</p>
      <div class="acoes">${botao('atualizarCopiaAberta', 'Atualizar a pasta agora', { status: 'Atualizando a pasta…' }, 'secundario')}</div>
      ${caixaAbrirPasta(copia)}` : '<p class="suave">Só com os dados na nuvem (com a pasta dos dados no computador, os arquivos já estão nela).</p>'}</div>
    ${E.nuvem ? caixaDesinstalarPrograma() : ''}
    <div class="cartao"><h2>Restaurar</h2>${FORM_RESTAURAR}</div>
    <div class="cartao"><h2>Arquivos na pasta segura</h2><div class="rolagem"><table><tr><th>Arquivo</th><th>Tipo</th><th>Gravado em</th><th class="n">Tamanho</th></tr>
      ${lista.slice(0, 40).map((x) => `<tr><td>${esc(x.pasta)}/${esc(x.nome)}</td><td>${esc(x.tipo)}</td><td>${dataHoraBr(x.alterado)}</td><td class="n">${tamanho(x.tamanho)}</td></tr>`).join('')
      || '<tr><td colspan="4" class="suave">Nenhum backup ainda.</td></tr>'}</table></div></div>`;
}

/** Computador (não celular nem tablet): o mesmo critério do visualizador de anexos. */
const noComputador = () => !window.matchMedia?.('(max-width: 760px), (hover: none) and (pointer: coarse)').matches;
const noWindows = () => /Windows/.test(navigator.userAgent);

/**
 * "Desinstalar o programa deste computador" (pedido do dono de 17/11): o link chama o endereço imoveis-desinstalar:, que o
 * programa do PC registra no Windows (atualizador-pc/programa.mjs, PROTOCOLO_DESINSTALAR) e que só abre a pergunta do Windows
 * "Desinstalar?" (Sim/Não; o que vem no endereço é ignorado): nenhum site desinstala sem a pessoa clicar em Sim. O mesmo de
 * Configurações do Windows → Aplicativos → Aplicativos instalados. Só no computador com Windows.
 */
function caixaDesinstalarPrograma() {
  if (!noComputador() || !noWindows()) return '';
  return `<div class="cartao" id="programa-do-pc"><h2>Programa deste computador</h2>
    <p class="suave">O programa do PC (Administração de Imóveis) mantém a pasta segura em dia sozinho e também <b>se atualiza sozinho</b> quando sai uma versão nova (todo dia às 20h e ao entrar no Windows). A versão de cada computador aparece em ${link('#/usuarios', 'Usuários → Aparelhos ligados', '')}. Para tirá-lo deste computador:</p>
    <div class="acoes"><a class="botao perigo pequeno" href="imoveis-desinstalar:confirmar">Desinstalar o programa deste computador</a></div>
    <p class="suave">Pede confirmação no Windows. Depois, se quiser cortar o acesso deste computador, use ${link('#/usuarios', 'Usuários → Aparelhos ligados → Desligar', '')}.
      A pasta segura e a pasta <b>${CA.PASTA_COPIA}</b> continuam no computador. Também dá para desinstalar em Configurações do Windows → Aplicativos → Aplicativos instalados.</p></div>`;
}

/**
 * "Anexar o certificado digital" (pedido do dono de 22/11): a janela (telas/certificado.js) entrega o .pfx e a senha direto
 * ao programa deste computador; nada vai para a nuvem. Só o administrador, na nuvem, num computador com Windows.
 */
function caixaCertificado() {
  if (!E.nuvem || !podeUsuario('admin')) return '';
  // pelo mouse, não pela largura: com zoom de 200% ou janela estreita o computador continua sendo computador
  const aqui = noWindows() && !window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;
  return `<div class="cartao" id="certificado-digital"><h2>Certificado digital da empresa</h2>
    <p>Anexe o certificado A1 (.pfx ou .p12) e digite a senha: o programa do PC guarda os dois cifrados e passa a assinar os recibos e termos sozinho.</p>
    ${aqui ? `<div class="acoes">${botao('anexarCertificado', 'Anexar o certificado digital', {}, '')}</div>
      <p class="suave">Faça no computador que vai assinar, com o programa do PC instalado. O navegador pergunta se pode abrir o programa e falar com este computador: responda Abrir e Permitir. O arquivo e a senha não vão para a nuvem nem para os backups.</p>`
    : '<p class="suave">Abra esta tela no computador com Windows que vai assinar (o certificado fica guardado só nele).</p>'}
    <p class="suave">Assinatura digital: <b>${R.regra('assinatura_digital') ? 'ligada' : 'desligada'}</b> (${link('#/regras', 'Regras do sistema', '')}).</p></div>`;
}

/**
 * "Abrir a pasta no Explorer" (pedido do dono de 17/11): o navegador não abre pastas do computador, então o link chama o
 * endereço imoveis-pasta:, que o programa do PC registra no Windows (atualizador-pc/programa.mjs, PROTOCOLO) e que sempre
 * abre a pasta da cópia aberta configurada nele (o que vem no endereço é ignorado). Só no computador com Windows; o caminho
 * inteiro vem do registro da cópia, gravado pelo programa do PC (`caminho_no_pc`): sem ele, só o nome da pasta.
 */
function caixaAbrirPasta(copia) {
  if (!noComputador()) return '';
  const caminho = copia?.caminho || '';
  const windows = noWindows();
  return `<div class="abrir-pasta">
    <div class="acoes">${windows ? '<a class="botao" href="imoveis-pasta:abrir">Abrir a pasta no Explorer</a>' : ''}
      ${caminho ? botao('copiar', 'Copiar o caminho', { texto: caminho }, 'secundario') : ''}</div>
    ${windows ? '<p class="suave">Na primeira vez o Chrome pergunta se pode abrir o programa: marque "Sempre permitir" e clique em Abrir. Precisa do programa do PC atualizado.</p>' : ''}
    <p class="suave">Onde fica: ${caminho ? `<b>${esc(caminho)}</b>` : `pasta do backup seguro (<b>${esc(E.seguro.dir.name)}</b>) → <b>${CA.PASTA_COPIA}</b> (o caminho completo aparece aqui depois que o programa do PC atualizar a pasta)`}</p></div>`;
}

const AVISO_SEGURO_DISPENSADO = 'imoveis-aviso-backup-seguro';
/** Nome do usuário pelo e-mail que a nuvem guardou (ou o próprio e-mail). */
const nomePorEmail = (email) => (email && d().usuarios.find((u) => [u.email, u.login].some((x) => String(x || '').toLowerCase() === email))?.nome) || email || '';
/** Texto da última cópia do backup seguro da empresa: "18/11/2026, 15:02 (Julio)". */
export const ultimaCopiaDaEmpresa = (e = E.backupEmpresa) => (e?.feito_em ? `${dataHoraBr(e.feito_em).slice(0, 17)}${e.feito_por ? ` (${nomePorEmail(e.feito_por)})` : ''}` : '');
/**
 * Painel: lembra o administrador do backup seguro. Na nuvem o aviso é da empresa (pedido do dono em 2026-11-18): basta um
 * computador com o backup ligado e cópia nos últimos 3 dias (DIAS_BACKUP_EMPRESA) para ninguém mais ser lembrado; parado há
 * mais tempo, avisa os administradores (também no celular). Sem a nuvem, continua por computador. Dispensável por computador.
 */
export function avisoBackupSeguro() {
  if (!podeUsuario('admin') || E.seguro || window.VERSAO_OFFLINE) return '';
  const dispensado = (chave) => { try { return !!localStorage.getItem(chave); } catch { return false; } };
  if (E.nuvem) {
    conferirBackupDaEmpresa();
    const a = B.avisoDaEmpresa(E.backupEmpresa, Date.now(), DIAS_BACKUP_EMPRESA);
    if (!a) return '';
    if (a.tipo === 'parado') {
      const chave = `${AVISO_SEGURO_DISPENSADO}-${a.desde}`;
      if (dispensado(chave)) return '';
      return `<div class="alerta aviso"><b>Backup seguro parado:</b> a última cópia foi em ${esc(ultimaCopiaDaEmpresa())}, há mais de ${DIAS_BACKUP_EMPRESA} dias. Abra o sistema no computador do backup seguro (ou ligue o backup neste computador).
        ${S.suportado() ? link('#/backup-seguro', 'Ligar neste computador', 'botao pequeno') : ''} ${botao('dispensarAvisoSeguro', 'Não avisar desta vez', { chave }, 'secundario pequeno')}</div>`;
    }
  }
  if (!S.suportado() || dispensado(AVISO_SEGURO_DISPENSADO)) return '';
  return `<div class="alerta aviso"><b>Backup seguro</b> não está ligado ${E.nuvem ? 'em nenhum computador da empresa: sem ele, não há cópia dos dados fora da nuvem' : 'neste computador: sem ele, não há uma segunda cópia dos dados, fora da pasta que o sistema usa'} (reserva para um desastre).
    ${link('#/backup-seguro', 'Ligar o backup seguro', 'botao pequeno')} ${botao('dispensarAvisoSeguro', 'Não avisar neste aparelho', {}, 'secundario pequeno')}</div>`;
}
export const dispensarAvisoSeguro = (chave) => { try { localStorage.setItem(String(chave || '').startsWith(AVISO_SEGURO_DISPENSADO) ? chave : AVISO_SEGURO_DISPENSADO, '1'); } catch { /* sem armazenamento */ } };

// --------------------------------------------------------------------------
// Empresas, histórico e dados
// --------------------------------------------------------------------------
export function telaEmpresas() {
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><div class="cabecalho"><h1>Empresas que emitem as NFs</h1>${podeUsuario('admin') ? link('#/novo/emitentes', 'Nova empresa', 'botao') : ''}</div>
    <div class="cartao rolagem"><table><tr><th>Nome</th><th>Razão social</th><th>CNPJ</th><th>Representante (contratos)</th><th>Aba no Excel</th><th>Situação</th><th></th></tr>
    ${ordenar(d().emitentes, 'nome').map((e) => `<tr><td><b>${esc(e.nome)}</b></td><td>${esc(e.razao_social)}</td><td>${esc(e.cnpj || '-')}</td><td>${e.representante_nome ? esc(e.representante_nome) : '<span class="suave">falta</span>'}</td><td>${esc(e.aba_modelo || e.nome.split(/\s+/)[0])}</td><td>${e.ativo ? etiqueta('Ativa', 'ok') : etiqueta('Inativa', 'neutra')}</td><td class="n">${podeUsuario('admin') ? link(`#/editar/emitentes/${e.id}`, 'Editar') : ''}</td></tr>`).join('')
    || '<tr><td colspan="7" class="suave">Nenhuma empresa cadastrada.</td></tr>'}</table>
    <p class="suave">Em cada imóvel você define quais empresas emitem a NF e o percentual de cada uma (ex.: 50% / 50%).</p></div>
    <div class="cartao" id="logo-empresa"><h2>Logo da empresa</h2>
      <p class="suave">Aparece no topo de todas as páginas do sistema e como marca-d'água nos contratos, vistorias e cartas. Envie em boa resolução (PNG ou SVG, de preferência com 1.000 pixels de largura ou mais).</p>
      ${d().logo && larguraLogo(d().logo) && larguraLogo(d().logo) < 800 ? `<div class="alerta aviso">A logo atual está em baixa resolução (${larguraLogo(d().logo)} pixels de largura): a marca-d'água sai serrilhada. Envie a logo de novo em "Trocar logo".</div>` : ''}
      ${d().logo ? `<p><img class="logo-previa" src="${esc(d().logo)}" alt="Logo atual"></p>` : '<p class="suave">Nenhuma logo enviada.</p>'}
      ${podeUsuario('admin') ? `<form data-form="logo" class="acoes"><input type="file" name="arquivo" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="max-width:360px"><button class="secundario">${d().logo ? 'Trocar logo' : 'Enviar logo'}</button>
        ${d().logo ? botao('removerLogo', 'Remover logo', {}, 'perigo pequeno', 'Remover a logo?') : ''}</form>` : ''}</div>
    ${caixaIcone()}
    ${caixaContaDosBoletos()}`;
}

/** Desfaz as alterações escolhidas no Histórico (só administrador) e recalcula os boletos em aberto ligados a elas. */
export async function desfazerItens(itens) {
  if (!podeUsuario('admin')) throw new ErroUsuario('Só o administrador desfaz alterações. Peça a ele, se precisar.');
  // nuvem: o Desfazer usa a posição no histórico, que só fica igual em todos os aparelhos depois de enviada
  if (E.nuvem && itens.some((x) => Number(String(x).split(':')[0]) >= (E.nuvem.base?.historico?.length || 0))) {
    throw Object.assign(new Error('Esta alteração ainda não foi para a nuvem. Espere a faixa do topo mostrar "tudo enviado" e desfaça de novo.'), { esperado: true });
  }
  // antes de desfazer: a janela mostra em palavras tudo o que volta junto e os boletos em aberto que serão recalculados, com
  // o valor de antes e depois (decisão do dono de 2026-11-17, item 39); só desfaz se a pessoa confirmar
  const { rotuloCampo, valorTexto } = await carregarParte(() => import('../exportar.js'));
  const previa = R.previaDoDesfazer(d(), itens, (db, lista) => aplicarDesfazer(db, lista), { rotuloCampo, valorTexto });
  const html = `<p>Volta${previa.campos.length > 1 ? 'm' : ''} junto:</p><ul>${previa.campos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    ${previa.boletos.length ? `<p>Boletos em aberto recalculados (valor do boleto, sem o desconto):</p><ul>${previa.boletos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
      : '<p class="suave">Nenhum boleto em aberto muda.</p>'}`;
  if (!(await janela({ titulo: 'Desfazer esta alteração?', html, sim: 'Desfazer' }))) return;
  let recalculados = 0;
  await alterar((db) => { recalculados = aplicarDesfazer(db, itens); });
  aviso(recalculados ? `Desfeito. ${recalculados} boleto(s) em aberto recalculado(s).` : 'Desfeito.');
  await mostrar();
}

/** Desfaz no banco ``db`` e recalcula os boletos em aberto ligados ao que voltou (o mesmo da edição do cadastro). */
function aplicarDesfazer(db, itens) {
  let recalculados = 0;
  for (const { tabela, id } of R.desfazerAlteracoes(db, itens, login())) {
    const cfg = CADASTROS[tabela];
    const r = R.buscar(db, tabela, id);
    if (cfg && cfg.recalcular && r) recalculados += R.recalcularCobrancas(db, cfg.recalcular(r, db), login());
    // multa de notificação desfeita (ou refeita): sai do boleto em aberto ou volta para o próximo
    if (tabela === 'notificacoes' && r) recalculados += R.sincronizarMultas(db, r.contrato_id, login());
  }
  return recalculados;
}

/** Registros por página no Histórico (eram 500 numa página só: 19 mil elementos, 1,3 s no celular para virar cartões). */
export const HISTORICO_POR_PAGINA = 100;
/** Texto de busca de cada entrada (descrição e detalhes, como antes): montado uma vez por entrada, não a cada filtro. */
const textosHistorico = new WeakMap();
const textoDaEntrada = (h) => {
  let t = textosHistorico.get(h);
  if (t === undefined) { t = `${h.descricao || ''} ${JSON.stringify(h.detalhes || {})}`.toLocaleLowerCase('pt-BR'); textosHistorico.set(h, t); }
  return t;
};

export function telaHistorico(q) {
  // "De" depois de "Até": as datas são trocadas sozinhas (antes aparecia só "0 registro(s)", sem dizer por quê)
  const trocadas = q.de && q.ate && q.de > q.ate;
  if (trocadas) q = { ...q, de: q.ate, ate: q.de };
  let lista = d().historico;
  if (q.usuario) lista = lista.filter((h) => h.usuario === q.usuario);
  if (q.tabela) lista = lista.filter((h) => h.tabela === q.tabela);
  if (q.de) lista = lista.filter((h) => h.quando.slice(0, 10) >= q.de);
  if (q.ate) lista = lista.filter((h) => h.quando.slice(0, 10) <= q.ate);
  if (q.texto) {
    const t = q.texto.toLocaleLowerCase('pt-BR');
    lista = lista.filter((h) => textoDaEntrada(h).includes(t));
  }
  const usuarios = [...new Set(d().historico.map((h) => h.usuario))].sort();
  const { pagina: _pagina, ...filtros } = q;
  const filtrando = Object.values(filtros).some(Boolean);
  // páginas de HISTORICO_POR_PAGINA, a 1 é a mais recente
  const paginas = Math.max(1, Math.ceil(lista.length / HISTORICO_POR_PAGINA));
  const pagina = Math.min(paginas, Math.max(1, Number(q.pagina) || 1));
  const fim = lista.length - (pagina - 1) * HISTORICO_POR_PAGINA;
  const mostrados = lista.slice(Math.max(0, fim - HISTORICO_POR_PAGINA), fim).reverse();
  // administrador: desfaz alterações de cadastro, sempre da mais recente para a mais antiga de cada campo; só a parte do
  // histórico desde o registro mais antigo da página é olhada (o que pode ser desfeito nele depende só do que veio depois)
  let desfazer = null;
  if (podeUsuario('admin')) {
    const naPagina = new Set(mostrados);
    const indice = new Map();
    d().historico.forEach((h, i) => { if (naPagina.has(h)) indice.set(h, i); });
    const desde = indice.size ? Math.min(...indice.values()) : d().historico.length;
    desfazer = { pode: R.alteracoesDesfaziveis(d(), desde), indice };
  }
  const irPara = (n, texto) => link(`#/historico?${new URLSearchParams({ ...filtros, pagina: String(n) })}`, texto);
  const navegar = paginas > 1 ? `<p class="acoes">${pagina > 1 ? `${irPara(1, '« Mais recentes')} ${irPara(pagina - 1, '‹ Anteriores')}` : ''}
    <span class="suave">Página ${pagina} de ${paginas} (registros ${lista.length - fim + 1} a ${lista.length - fim + mostrados.length} de ${lista.length}, do mais recente para o mais antigo)</span>
    ${pagina < paginas ? `${irPara(pagina + 1, 'Mais antigos ›')} ${irPara(paginas, 'Os primeiros »')}` : ''}</p>` : '';
  // só os tipos de registro que aparecem no histórico (tabela sem uso, como a antiga "recebimentos", não entra no filtro)
  const usadas = new Set(d().historico.map((h) => h.tabela));
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Histórico de alterações</h1>
    <details class="cartao" open><summary><b>Histórico</b> <span class="suave">· ${lista.length} registro(s)${filtrando ? ' com o filtro aplicado' : ''}</span></summary>
    ${trocadas ? `<div class="alerta info">A data "De" estava depois da "Até": mostrando de ${dataBr(q.de)} até ${dataBr(q.ate)}.</div>` : ''}
    <form class="formulario" data-form="ir" data-ir="historico" style="margin-top:12px">
      <div><label>Usuário</label><select name="usuario"><option value=""></option>${usuarios.map((u) => `<option ${q.usuario === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
      <div><label>Tipo de registro</label><select name="tabela"><option value=""></option>${Object.entries(R.TABELAS).filter(([k]) => k === q.tabela || usadas.has(k)).map(([k, v]) => `<option value="${k}" ${q.tabela === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>De</label><input type="date" name="de" value="${esc(q.de || '')}"></div><div><label>Até</label><input type="date" name="ate" value="${esc(q.ate || '')}"></div>
      <div><label>Contém o texto</label><input name="texto" value="${esc(q.texto || '')}"></div>
      <div class="check"><button>Filtrar</button> <a href="#/historico">Limpar</a></div></form>
    ${desfazer ? `<p class="suave">Administrador: o botão ↶ volta a alteração inteira (todos os campos dela juntos). Antes, uma janela mostra o que volta e os boletos em aberto que serão recalculados, com o valor de antes e depois. Volta uma alteração por vez, da mais recente para a mais antiga; depois de desfazer a última, aparece o botão na anterior. Boletos, pagamentos, NFs e usuários não entram (use os botões próprios).</p>
      <p>${botao('desfazerMarcados', '↶ Desfazer os marcados', {}, 'secundario pequeno')}</p>` : ''}
    ${navegar}${tabelaHistorico(mostrados, desfazer)}${navegar}</details>`;
}

/**
 * Data da versão do sistema em uso (a página guardada no aparelho) e, com internet, a publicada no site.
 * Se a publicada for mais nova, mostra o botão "Atualizar agora" (o aplicativo instalado guarda as telas no aparelho).
 */
async function versaoDoSistema() {
  const fmt = (dt) => dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const emUso = new Date(document.lastModified);
  if (location.protocol === 'file:' || Number.isNaN(emUso.getTime())) return `versão PC${window.VERSAO_OFFLINE ? ` de ${dataBr(window.VERSAO_OFFLINE)}` : ''}`;
  let publicada = null;
  let semResposta = false;
  try {
    const r = await buscarComLimite('index.html', { method: 'HEAD', cache: 'no-store', credentials: 'include' });
    const lm = r.ok && r.headers.get('last-modified');
    if (lm) publicada = new Date(lm);
  } catch (e) { semResposta = !!(e && e.semResposta); /* sem internet: mostra só a em uso */ }
  const nova = publicada && publicada.getTime() - emUso.getTime() > 60000;
  if (semResposta) return `${fmt(emUso)} <span class="suave">(a conferência da versão publicada ficou sem resposta, tente de novo)</span>`;
  return `${fmt(emUso)}${nova ? ` <span class="etiqueta aviso">há versão nova de ${fmt(publicada)}</span> ${botao('atualizarSistema', 'Atualizar agora')}`
    : publicada ? ' <span class="etiqueta ok">atualizada</span>' : ''}`;
}

/** Na nuvem: quando o último ZIP com tudo foi baixado (registro "Exportação" do Histórico) e um lembrete se faz tempo. */
function lembreteZipNuvem() {
  // só conta o ZIP baixado por um administrador: o do operador sai sem as senhas dos outros usuários (não serve num desastre)
  const admins = new Set(d().usuarios.filter((u) => u.papel === 'admin').map((u) => u.login));
  const ultimo = d().historico.filter((h) => h.acao === 'Exportação' && /ZIP/.test(h.descricao || '') && admins.has(h.usuario)).at(-1);
  const dias = ultimo ? Math.floor((Date.now() - new Date(ultimo.quando).getTime()) / 86400000) : null;
  const texto = ultimo ? `Último ZIP com todos os dados baixado em ${dataBr(ultimo.quando.slice(0, 10))} (há ${dias} dia${dias === 1 ? '' : 's'}).` : 'Nenhum ZIP com todos os dados foi baixado ainda.';
  const lembrar = podeUsuario('admin') && (!ultimo || dias > LEMBRETE_ZIP_DIAS);
  return `<p class="suave">${texto} ${lembrar ? etiqueta('vale baixar uma cópia para o seu computador (abaixo, "Exportar tudo em ZIP")', 'aviso') : ''}</p>`;
}
const LEMBRETE_ZIP_DIAS = 7;
/** O ZIP com tudo: na pasta, quem opera; na nuvem, só o administrador (o aparelho dos outros não recebe as senhas de todos). */
const zipPermitido = () => (E.nuvem ? podeUsuario('admin') : opera());

/** Quantas tabelas aparecem em "Tamanho dos dados" (as com mais registros); as outras ficam em "ver todas". */
const MAIORES_TABELAS = 8;
const milhar = (n) => Number(n).toLocaleString('pt-BR');

/**
 * Tamanho dos dados (pedido do dono de 17/11): o banco inteiro em MB, as tabelas com mais registros, o histórico e os anexos
 * ligados a lançamentos; o botão mede a pasta dos anexos (na nuvem numa ida, na pasta percorrendo as subpastas).
 */
function caixaTamanho() {
  const t = R.tamanhoDoBanco(d());
  const linha = (x) => `<tr><td>${esc(x.nome)}</td><td class="n">${milhar(x.registros)}</td><td class="n">${tamanho(x.bytes)}</td></tr>`;
  const cabeca = '<tr><th>Tabela</th><th class="n">Registros</th><th class="n">Tamanho</th></tr>';
  const comDados = t.tabelas.filter((x) => x.registros);
  return `<div class="cartao" id="tamanho-dados"><h2>Tamanho dos dados</h2><div class="grade">
      ${item('Dados (sem os anexos)', tamanho(t.bytes))}${item('Registros', milhar(t.registros))}
      ${item('Histórico de alterações', `${milhar(t.historico.registros)} linha(s) · ${tamanho(t.historico.bytes)}`)}
      ${item('Anexos ligados a lançamentos', milhar(t.anexos))}</div>
    <div class="rolagem"><table class="compacta">${cabeca}${comDados.slice(0, MAIORES_TABELAS).map(linha).join('') || '<tr><td colspan="3" class="suave">Nenhum registro ainda.</td></tr>'}</table></div>
    ${comDados.length > MAIORES_TABELAS ? `<details><summary class="suave">Ver as outras ${comDados.length - MAIORES_TABELAS} tabela(s)</summary><div class="rolagem"><table class="compacta">${cabeca}${comDados.slice(MAIORES_TABELAS).map(linha).join('')}</table></div></details>` : ''}
    <p class="suave">${E.nuvem ? 'Na nuvem, cada aparelho guarda uma cópia deste tamanho.' : `É o tamanho do arquivo ${S.ARQUIVO_BANCO}.`} Os anexos (PDFs e fotos) ficam à parte, na pasta dos arquivos: o botão conta quantos são e quanto ocupam${E.nuvem ? ' (precisa de internet)' : ''}.</p>
    <p>${botao('medirAnexos', 'Medir a pasta dos anexos', { status: 'Contando os anexos…' })}</p></div>`;
}

/** `q.gmail`: aviso da volta do Google ao conectar o Gmail (caixaGmailHtml). */
export async function telaDados(q = {}) {
  // cópias em conflito são coisa do OneDrive (modo pasta): na nuvem não existem
  const conflitos = E.nuvem ? [] : await S.copiasEmConflito(E.pasta);
  let modeloProprio = false;
  try {
    await (await E.pasta.getDirectoryHandle(S.PASTA_MODELOS)).getFileHandle(S.MODELO_FATURA);
    modeloProprio = true;
  } catch { /* usa o modelo padrão */ }
  return `<div class="cabecalho"><h1>Dados e backup</h1><div class="acoes">${link('#/empresas', 'Empresas', 'botao secundario')}${link('#/regras', 'Regras do sistema', 'botao secundario')}${AI.ligado() ? link('#/arquivo-impresso', 'Arquivo impresso', 'botao secundario') : ''}${link('#/historico', 'Histórico de alterações', 'botao secundario')}${podeUsuario('admin') ? link('#/teste-pdfs', 'Teste dos PDFs (temporário)', 'botao secundario') : ''}</div></div>
    ${conflitos.length ? `<div class="alerta perigo">O OneDrive criou cópia(s) em conflito: <b>${conflitos.map(esc).join(', ')}</b>. Isso acontece quando dois computadores gravam ao mesmo tempo. Confira se falta alguma alteração recente e, depois de conferir, apague a cópia na pasta.</div>` : ''}
    ${opera() ? AJ.caixaReabrirPassos(d(), E.usuario?.login || '', { backupLigado: !!(E.seguro && E.seguro.chave) }) : ''}
    <div class="cartao"><div class="grade">
      ${item('Pasta dos dados', E.nuvem ? 'na nuvem' : esc(E.pasta.name))}${item('Sistema em uso desde', dataHoraBr(d().criado_em))}
      ${item('Última atualização', d().atualizado_em ? `${dataHoraBr(d().atualizado_em)} por ${esc(d().atualizado_por)}` : '-')}
      ${item('Alterações gravadas', `${d().revisao}`)}
      ${item('Versão do sistema', await versaoDoSistema())}</div>
      ${E.nuvem ? '' : `<p class="suave">Tudo é gravado na hora no arquivo <b>${S.ARQUIVO_BANCO}</b> desta pasta. Uma cópia por dia fica em <b>${S.PASTA_BACKUPS}</b> (30 dias). Os anexos ficam em <b>${S.PASTA_ARQUIVOS}</b>, separados por imóvel e inquilino.</p>`}
      ${E.nuvem ? `<p class="suave">Tudo é gravado na nuvem (servidores da empresa Cloudflare), com backup diário de 30 dias. Sem internet, as mudanças ficam neste aparelho e sobem quando a conexão voltar.</p>
      ${lembreteZipNuvem()}
      ${podeUsuario('admin') ? `<p>${link('#/backups-nuvem', 'Backups da nuvem (baixar ou voltar para um dia)', 'botao secundario pequeno')} ${link('#/acessos', 'Acessos (quem baixou, abriu ou mandou o quê)', 'botao secundario pequeno')}</p>
      <details id="avancado-nuvem"><summary class="suave">Avançado: substituir os dados da nuvem pelos de uma pasta</summary>
        <div class="alerta perigo" style="margin-top:8px"><b>Só para voltar a uma pasta do computador</b> (ex.: a pasta do OneDrive de antes da nuvem, ou uma pasta aberta de um backup). Tudo o que está na nuvem é trocado pelo que está na pasta: o que foi lançado depois, por qualquer aparelho, <b>se perde</b> (fica uma cópia de antes nos backups da nuvem). Para desfazer um dia ruim, prefira "Backups da nuvem".</div>
        <p>${botao('levarParaNuvem', 'Substituir os dados da nuvem pelos de uma pasta', { substituir: '1' }, 'perigo pequeno')}</p><div id="progresso-nuvem"></div></details>` : ''}` : `<p>${botao('escolherPasta', 'Trocar de pasta')}</p>`}</div>
    ${caixaTamanho()}
    ${podeUsuario('admin') ? `<div class="cartao"><h2>Backup seguro (só administrador)</h2>
      <p>Segunda pasta, só no computador do administrador: recebe uma cópia protegida por senha a cada alteração e um backup completo (dados + anexos) por semana, sozinha, sem pedir nada. É a reserva para um desastre (ex.: perder a conta da nuvem).${E.nuvem ? ' É a segunda camada, fora da nuvem: vale ter.' : ''}</p>
      ${E.nuvem ? '<p><b>Sem internet ou com o site fora do ar:</b> abra o sistema pelo ícone do aplicativo instalado (ou pelo endereço de sempre no Chrome). Ele abre com os dados da última vez que este aparelho esteve conectado, você trabalha normalmente e as alterações sobem sozinhas quando a conexão voltar.</p>' : ''}
      ${window.VERSAO_OFFLINE ? `<p>${etiqueta(`Você está na versão PC de ${dataBr(window.VERSAO_OFFLINE)}`, 'info')}</p>` : ''}
      <p>${E.seguro && E.seguro.chave ? etiqueta(`Ligado neste computador · pasta ${E.seguro.dir.name}`, 'ok') : E.seguro && E.seguro.desconectado ? etiqueta('Desconectado: falta liberar a pasta', 'aviso') : etiqueta('Não configurado neste aparelho', 'neutra')}
      ${link('#/backup-seguro', 'Abrir o backup seguro')}</p>
      ${E.nuvem && E.backupEmpresa ? `<p>Na empresa: ${E.backupEmpresa.feito_em ? `${etiqueta(`última cópia em ${ultimaCopiaDaEmpresa()}`, B.avisoDaEmpresa(E.backupEmpresa, Date.now(), DIAS_BACKUP_EMPRESA) ? 'aviso' : 'ok')} <span class="suave">(basta um computador com o backup ligado; parado há mais de ${DIAS_BACKUP_EMPRESA} dias, o Painel avisa os administradores)</span>` : etiqueta('nenhum computador com o backup seguro ligado', 'aviso')}</p>` : ''}</div>` : ''}
    ${caixaCertificado()}
    ${caixaConfigBanco()}
    ${caixaConfigBanco2()}
    <div class="cartao"><h2>Exportar tudo em ZIP</h2><p>Todos os dados e todos os anexos num único arquivo, ${E.nuvem ? 'para guardar. Para voltar com ele: descompacte numa pasta do computador e use "Avançado: substituir os dados da nuvem pelos de uma pasta" (acima); para voltar o banco a um dia, use os Backups da nuvem.' : 'para guardar ou levar para outro computador.'}${E.nuvem && !podeUsuario('admin') ? ' <span class="suave">Na nuvem, só o administrador baixa o ZIP com tudo (só o aparelho dele recebe as senhas de todos os usuários).</span>' : ''}</p>${zipPermitido() ? botao('exportar', 'Baixar ZIP com todos os dados', { status: 'Montando o ZIP…' }, '') : ''}<div id="progresso-exportar" aria-live="polite"></div>
      <p style="margin-top:14px">Para ler ou imprimir: todos os cadastros numa planilha Excel (uma aba por cadastro, mais o histórico de alterações) e num PDF (uma ficha por registro). Os anexos não entram e estes arquivos não servem para importar.</p>
      ${opera() ? botao('exportarPlanilhaPdf', 'Baixar todos os dados em planilha e PDF', { status: 'Montando a planilha e o PDF…' }, 'secundario') : ''}
      <p style="margin-top:14px">As regras de negócio do programa (reajuste, caução, NF, IPTU etc.) num arquivo de texto para ler, com a lista das regras em uso hoje no fim. Para mudar as regras (multa, juros, caução, régua de cobrança, prazos), use ${link('#/regras', 'Regras do sistema', '')}.</p>
      ${botao('baixarRegras', 'Baixar as regras para ler (TXT)', {}, 'secundario')}</div>
    ${podeUsuario('admin') && !E.nuvem ? `<div class="cartao"><h2>Importar ZIP</h2>
      <div class="alerta aviso">A importação <b>substitui os dados desta pasta</b> pelos do ZIP e acrescenta os anexos. Antes, uma cópia dos dados atuais é guardada em ${S.PASTA_BACKUPS}.</div>
      <form data-form="importar" class="acoes"><input type="file" name="zip" accept=".zip" style="max-width:380px"><label class="check" style="padding:0"><input type="checkbox" name="confirmo" value="1"> Entendo que os dados atuais serão substituídos</label><button class="perigo">Importar</button></form></div>` : ''}
    ${opera() ? `<div class="cartao"><h2>Conferir arquivos</h2><p>Ao abrir o Painel, o sistema confere se cada arquivo ligado a um lançamento (comprovantes, documentos assinados, aditivos, cartas, apólices, fotos da vistoria) está na pasta.
      O que estiver em outra pasta volta sozinho para o lugar; o que sumiu aparece como alerta no Painel e na página do inquilino, para anexar de novo.</p>
      ${botao('conferirArquivos', 'Conferir arquivos agora', { status: 'Conferindo os arquivos…' })}</div>` : ''}
    ${podeUsuario('admin') ? `<div class="cartao"><h2>Compactar os anexos</h2><p>Fotos e PDFs escaneados são compactados sozinhos ao anexar (${link('#/regras', 'Regras do sistema', '')} → "Compactar anexos"${R.regra('compactar_anexos') ? '' : ', hoje desligada'}). Ex.: foto do RG de 4 MB → cerca de 400 KB; PDF escaneado de 10 páginas com 12 MB → cerca de 1,5 MB.
      Este botão faz o mesmo com os que já estavam no sistema, trocando cada um no lugar, com o mesmo nome. O original não é guardado. PDF com assinatura digital (gov.br, ICP-Brasil, banco) e PDF com texto ficam como estão; documento mandado pelo link da ficha só entra depois de conferido (a conferência fica guardada na ficha).</p>
      ${botao('compactarAnexos', 'Compactar os anexos que já estão no sistema', { status: 'Procurando os anexos…' }, 'secundario', 'Compactar agora as fotos e os PDFs escaneados já anexados? O arquivo original não é guardado (PDF assinado nunca é mexido). Pode levar alguns minutos: deixe esta tela aberta até o fim.')}</div>` : ''}
    ${podeUsuario('admin') ? `<div class="cartao"><h2>Dados de uma pessoa (LGPD)</h2><p>Pelo CPF: onde a pessoa aparece e um arquivo com tudo dela (quando ela pedir). Dez anos depois do fim do último contrato, apagar tudo dela de uma vez.</p>
      <p class="acoes">${link('#/pessoa', 'Dados de uma pessoa', 'botao secundario pequeno')} ${link('#/pessoas-antigas', 'Pessoas com mais de 10 anos do fim do contrato', 'botao secundario pequeno')}</p></div>` : ''}
    ${podeUsuario('admin') ? `<div class="cartao"><h2>Arquivos sem lançamento</h2><p>Ao excluir um lançamento (aditivo, comprovante, depósito, apólice, vistoria, documento assinado), o arquivo anexado é apagado junto.
      Os que sobraram de exclusões antigas podem ser apagados aqui: o sistema mostra a lista antes de apagar. As fichas e documentos anexados à mão em "Arquivos do inquilino" não entram.</p>
      ${botao('limparAnexosSoltos', 'Procurar arquivos sem lançamento', { status: 'Procurando arquivos sem lançamento…' })}</div>` : ''}
    <div class="cartao"><h2>Modelos de contrato</h2><p>Textos usados nos botões <b>Gerar contrato</b> (residencial, não residencial e os que você criar) e <b>Gerar termo aditivo</b> (troca do vencimento e troca de inquilino) do inquilino.</p>${link('#/modelos-contrato', 'Ver e editar os modelos')}</div>
    <div class="cartao"><h2>Modelos de e-mail</h2><p>Um e-mail para cada etapa da ficha, da entrada e da saída do inquilino, a régua de cobrança (lembretes antes e no dia do vencimento, boleto em atraso), as notificações ao inquilino, o novo valor do aluguel, os termos aditivos e o informe anual do Imposto de Renda (botão <b>✉ E-mail</b> em cada etapa).</p>${link('#/modelos-email', 'Ver e editar os modelos de e-mail')}</div>
    ${await caixaGmailHtml(q.gmail)}
    <div class="cartao"><h2>Modelo Excel da NF</h2>
      <p>${modeloProprio ? `${etiqueta('Modelo próprio', 'ok')} usando o arquivo enviado (${S.PASTA_MODELOS}/${S.MODELO_FATURA}).` : 'Usando o modelo padrão do sistema (uma NF por empresa, com os dados do cadastro de Empresas).'}</p>
      <p class="suave">Para trocar, envie um .xlsx com uma aba por empresa no mesmo desenho. Os dados são preenchidos nas mesmas células da planilha original (peça ao técnico se precisar do detalhe).</p>
      ${opera() ? `<form data-form="modeloExcel" class="acoes"><input type="file" name="modelo" accept=".xlsx" style="max-width:380px"><button class="secundario">Enviar modelo</button>${modeloProprio ? botao('removerModelo', 'Voltar ao modelo padrão', {}, 'perigo pequeno', 'Voltar ao modelo padrão?') : ''}</form>` : ''}</div>`;
}

// --------------------------------------------------------------------------
// Envio de formulários
// --------------------------------------------------------------------------
/**
 * Logo em boa resolução (até 1400×700, PNG em data URL guardada no próprio banco): a mesma imagem vira a marca-d'água
 * de 14 cm dos contratos, então precisa ser nítida. SVG é desenhado já no tamanho máximo.
 */
const LOGO_MAX = { largura: 1400, altura: 700 };

/** Largura em pixels da logo guardada (lida do cabeçalho do PNG); 0 se não der para saber. */
function larguraLogo(dataUrl) {
  try {
    const b = atob(String(dataUrl).split(',')[1].slice(0, 40));
    return b.slice(1, 4) === 'PNG' ? ((b.charCodeAt(16) << 24) | (b.charCodeAt(17) << 16) | (b.charCodeAt(18) << 8) | b.charCodeAt(19)) : 0;
  } catch { return 0; }
}

export async function reduzirImagem(arquivo) {
  if (!podeUsuario('admin')) throw new ErroUsuario('Só o administrador troca a logo. Peça a ele, se precisar.');
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('Não consegui abrir a imagem. Use PNG, JPG, SVG ou WEBP.'));
      i.src = url;
    });
    const svg = /svg/i.test(arquivo.type);
    const largura = img.naturalWidth || 400;
    const altura = img.naturalHeight || 120;
    const escala = Math.min(svg ? Infinity : 1, LOGO_MAX.largura / largura, LOGO_MAX.altura / altura);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(largura * escala));
    cv.height = Math.max(1, Math.round(altura * escala));
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
