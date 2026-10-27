// Administração: backup seguro, empresas emitentes, histórico de alterações e Dados e backup.
import { alterar, aviso, E, login, mostrar, podeUsuario } from '../app.js';
import * as S from '../armazenamento.js';
import * as B from '../backup-seguro.js';
import { dataBr } from '../calculos.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { CADASTROS } from './cadastros.js';
import { botao, d, etiqueta, item, link, opera, ordenar, tabelaHistorico } from './comum.js';

// --------------------------------------------------------------------------
// Backup seguro do administrador
// --------------------------------------------------------------------------
const tamanho = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const FORM_RESTAURAR = `<form data-form="restaurarSeguro" class="formulario">
    <div><label>Arquivo de backup (.bkp)</label><input type="file" name="arquivo" accept="${B.EXTENSAO}"></div>
    <div><label>Senha do backup</label><input type="password" name="senha" autocomplete="off"></div>
    <div class="check"><button>Abrir e baixar o ZIP</button></div></form>
  <p class="suave">O backup aberto vira um ZIP igual ao do "Exportar tudo". Para voltar os dados: escolha a pasta dos dados (pode ser uma pasta nova e vazia), crie o administrador se pedir e use <b>Dados e backup → Importar ZIP</b>.
    Os usuários e senhas antigos voltam junto. Se o programa também deu problema, abra a cópia dele que fica na pasta do backup seguro, em <b>${B.PASTA_PROGRAMA}</b>.</p>`;

export function telaRestaurarBackup() {
  return `<main><div id="mensagens"></div><div class="cartao login" style="max-width:640px">
    <h1>Restaurar backup seguro</h1>
    <p>Use em caso de erro geral: escolha um arquivo da pasta do backup seguro (<b>${B.PASTA_SEMANAL}</b> tem os completos, com anexos; <b>${B.PASTA_DIARIO}</b> tem a cópia do banco de cada dia) e digite a senha do backup.</p>
    ${FORM_RESTAURAR}
    <p><a href="#/">Voltar</a></p></div></main>`;
}

export async function telaBackupSeguro() {
  if (!podeUsuario('admin')) return '<h1>Acesso só para administradores</h1>';
  if (!E.seguro || !E.seguro.chave) {
    const nova = E.pastaSeguraNova;
    const chaveExistente = nova ? await B.lerChave(nova) : null;
    return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Backup seguro</h1>
      ${E.seguro && E.seguro.desconectado ? `<div class="alerta aviso">A pasta <b>${esc(E.seguro.dir.name)}</b> já está configurada, mas o navegador pede para liberar o acesso de novo. ${botao('reconectarSeguro', 'Reconectar', {}, 'pequeno')}</div>` : ''}
      <div class="cartao"><h2>1. Escolha a pasta segura</h2>
        <p>Use uma pasta <b>fora</b> da pasta dos dados e que só você acesse (por exemplo, no seu OneDrive pessoal ou num HD externo). Ela fica ligada só a <b>este computador</b>: os outros usuários não veem nem gravam nela.</p>
        <p>${botao('escolherPastaSegura', nova ? `Pasta escolhida: ${esc(nova.name)} (trocar)` : 'Escolher a pasta segura', {}, nova ? 'secundario' : '')}</p></div>
      ${nova ? `<div class="cartao"><h2>2. ${chaveExistente ? 'Digite a senha do backup' : 'Crie a senha do backup'}</h2>
        ${chaveExistente ? `<p>Esta pasta já tem backups seguros (chave criada em ${new Date(chaveExistente.criada_em).toLocaleDateString('pt-BR')}). Digite a senha para ligar este computador a ela.</p>`
    : '<div class="alerta aviso"><b>Guarde esta senha em local seguro.</b> Ela é pedida só para restaurar. Sem ela, nenhum backup pode ser aberto, nem por você nem pelo suporte. Use pelo menos 8 caracteres.</div>'}
        <form data-form="configurarSeguro" class="formulario">
          <div><label>Senha do backup</label><input type="password" name="senha" autocomplete="new-password"></div>
          ${chaveExistente ? '' : '<div><label>Repita a senha</label><input type="password" name="senha2" autocomplete="new-password"></div>'}
          <div class="check"><button>${chaveExistente ? 'Conectar' : 'Criar e fazer o primeiro backup'}</button></div></form></div>` : ''}
      <div class="cartao"><h2>Restaurar</h2>${FORM_RESTAURAR}</div>`;
  }
  const lista = await B.listarBackups(E.seguro.dir);
  const ultimo = (pasta) => lista.find((x) => x.pasta === pasta);
  const quando = (x) => (x ? new Date(x.alterado).toLocaleString('pt-BR') : 'nenhum ainda');
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Backup seguro</h1>
    ${E.seguroErro ? `<div class="alerta erro">A última cópia falhou: ${esc(E.seguroErro)}</div>` : ''}
    <div class="cartao"><div class="grade">
      ${item('Pasta segura (só neste computador)', esc(E.seguro.dir.name))}
      ${item('Última cópia do banco', quando(ultimo(B.PASTA_DIARIO)))}
      ${item('Último backup completo', quando(ultimo(B.PASTA_SEMANAL)))}
      ${item('Guarda', `${B.MANTER_DIARIOS} cópias diárias, ${B.MANTER_SEMANAIS} completos semanais e 1 completo por mês durante ${B.MANTER_MENSAIS} meses`)}</div>
      <p class="suave">A cada alteração no sistema feita <b>neste computador</b>, a cópia do dia é atualizada. As alterações feitas em outros computadores entram na próxima vez que o sistema for aberto aqui.
        O completo semanal é feito sozinho quando o sistema é aberto e já passou uma semana do último. Os arquivos são cifrados: sem a senha do backup ninguém consegue abrir.</p>
      <div class="acoes">${botao('backupCompletoAgora', 'Fazer backup completo agora', {}, '')}
        ${botao('desconectarSeguro', 'Desligar neste computador', {}, 'perigo pequeno', 'Desligar o backup seguro neste computador? Os arquivos já gravados continuam na pasta.')}</div></div>
    <div class="cartao"><h2>Restaurar</h2>${FORM_RESTAURAR}</div>
    <div class="cartao"><h2>Arquivos na pasta segura</h2><div class="rolagem"><table><tr><th>Arquivo</th><th>Tipo</th><th>Gravado em</th><th class="n">Tamanho</th></tr>
      ${lista.slice(0, 40).map((x) => `<tr><td>${esc(x.pasta)}/${esc(x.nome)}</td><td>${esc(x.tipo)}</td><td>${new Date(x.alterado).toLocaleString('pt-BR')}</td><td class="n">${tamanho(x.tamanho)}</td></tr>`).join('')
      || '<tr><td colspan="4" class="suave">Nenhum backup ainda.</td></tr>'}</table></div></div>`;
}

// --------------------------------------------------------------------------
// Empresas, histórico e dados
// --------------------------------------------------------------------------
export function telaEmpresas() {
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><div class="cabecalho"><h1>Empresas que emitem as NFs</h1>${podeUsuario('admin') ? link('#/novo/emitentes', 'Nova empresa', 'botao') : ''}</div>
    <div class="cartao rolagem"><table><tr><th>Nome</th><th>Razão social</th><th>CNPJ</th><th>Representante (contratos)</th><th>Aba no Excel</th><th>Situação</th><th></th></tr>
    ${ordenar(d().emitentes, 'nome').map((e) => `<tr><td><b>${esc(e.nome)}</b></td><td>${esc(e.razao_social)}</td><td>${esc(e.cnpj || '-')}</td><td>${e.representante_nome ? esc(e.representante_nome) : '<span class="suave">falta</span>'}</td><td>${esc(e.aba_modelo || e.nome.split(/\s+/)[0])}</td><td>${e.ativo ? etiqueta('Ativa', 'ok') : etiqueta('Inativa', 'neutra')}</td><td class="n">${podeUsuario('admin') ? link(`#/editar/emitentes/${e.id}`, 'Editar') : ''}</td></tr>`).join('')
    || '<tr><td colspan="7" class="suave">Nenhuma empresa cadastrada.</td></tr>'}</table>
    <p class="suave">Em cada imóvel você define quais empresas emitem a NF e o percentual de cada uma (ex.: 50% / 50%).</p></div>
    <div class="cartao"><h2>Logo da empresa</h2>
      <p class="suave">Aparece no topo de todas as páginas do sistema e como marca-d'água nos contratos, vistorias e cartas. Envie em boa resolução (PNG ou SVG, de preferência com 1.000 pixels de largura ou mais).</p>
      ${d().logo && larguraLogo(d().logo) && larguraLogo(d().logo) < 800 ? `<div class="alerta aviso">A logo atual está em baixa resolução (${larguraLogo(d().logo)} pixels de largura): a marca-d'água sai serrilhada. Envie a logo de novo em "Trocar logo".</div>` : ''}
      ${d().logo ? `<p><img class="logo-previa" src="${esc(d().logo)}" alt="Logo atual"></p>` : '<p class="suave">Nenhuma logo enviada.</p>'}
      ${podeUsuario('admin') ? `<form data-form="logo" class="acoes"><input type="file" name="arquivo" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="max-width:360px"><button class="secundario">${d().logo ? 'Trocar logo' : 'Enviar logo'}</button>
        ${d().logo ? botao('removerLogo', 'Remover logo', {}, 'perigo pequeno', 'Remover a logo?') : ''}</form>` : ''}</div>
    <div class="cartao"><h2>Ressarcimento de taxas do condomínio</h2>
      <p>Taxas do proprietário pagas pelo inquilino no condomínio (fundo de obras etc.) voltam para ele no boleto do aluguel. ${d().ressarcimento_abate_nf
    ? '<b>Hoje: o ressarcimento sai do valor da NF</b> (a NF fica com o aluguel menos a taxa) e não conta de novo como gasto.' : '<b>Hoje: a NF sai com o aluguel cheio</b> e o ressarcimento conta como gasto do imóvel nos Resultados.'}</p>
      <p class="suave">Confirme com o contador qual forma usar. A mudança vale para os boletos gerados ou recalculados daqui em diante.</p>
      ${podeUsuario('admin') ? botao('ressarcimentoNaNf', d().ressarcimento_abate_nf ? 'Passar a emitir a NF com o aluguel cheio' : 'Passar a abater o ressarcimento da NF', { valor: d().ressarcimento_abate_nf ? '' : '1' }, 'secundario pequeno', 'Mudar a forma da NF nos ressarcimentos de condomínio?') : ''}</div>
    <div class="cartao"><h2>Numeração das NFs</h2>
      <p>Próximo número: <b>${R.numeroFatura(d().proxima_fatura)}</b>. As empresas de um mesmo pagamento recebem o mesmo número.</p>
      ${podeUsuario('admin') ? `<form data-form="proximaFatura" class="acoes"><input type="number" name="numero" min="1" value="${d().proxima_fatura}" style="width:140px"><button class="secundario">Alterar próximo número</button></form>` : ''}</div>`;
}

/** Desfaz as alterações escolhidas no Histórico (só administrador) e recalcula os boletos em aberto ligados a elas. */
export async function desfazerItens(itens) {
  if (!podeUsuario('admin')) throw new Error('Só o administrador desfaz alterações.');
  let recalculados = 0;
  await alterar((db) => {
    for (const { tabela, id } of R.desfazerAlteracoes(db, itens, login())) {
      const cfg = CADASTROS[tabela];
      if (cfg && cfg.recalcular) recalculados += R.recalcularCobrancas(db, cfg.recalcular(R.buscar(db, tabela, id), db), login());
    }
  });
  aviso(recalculados ? `Desfeito. ${recalculados} boleto(s) em aberto recalculado(s).` : 'Desfeito.');
  await mostrar();
}

export function telaHistorico(q) {
  let lista = d().historico;
  if (q.usuario) lista = lista.filter((h) => h.usuario === q.usuario);
  if (q.tabela) lista = lista.filter((h) => h.tabela === q.tabela);
  if (q.de) lista = lista.filter((h) => h.quando.slice(0, 10) >= q.de);
  if (q.ate) lista = lista.filter((h) => h.quando.slice(0, 10) <= q.ate);
  if (q.texto) {
    const t = q.texto.toLocaleLowerCase('pt-BR');
    lista = lista.filter((h) => `${h.descricao || ''} ${JSON.stringify(h.detalhes || {})}`.toLocaleLowerCase('pt-BR').includes(t));
  }
  const usuarios = [...new Set(d().historico.map((h) => h.usuario))].sort();
  const filtrando = Object.values(q).some(Boolean);
  // administrador: desfaz alterações de cadastro, sempre da mais recente para a mais antiga de cada campo
  const desfazer = podeUsuario('admin') ? { pode: R.alteracoesDesfaziveis(d()), indice: new Map(d().historico.map((h, i) => [h, i])) } : null;
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Histórico de alterações</h1>
    <details class="cartao" open><summary><b>Histórico</b> <span class="suave">· ${lista.length} registro(s)${filtrando ? ' com o filtro aplicado' : ''}</span></summary>
    <form class="formulario" data-form="filtroHistorico" style="margin-top:12px">
      <div><label>Usuário</label><select name="usuario"><option value=""></option>${usuarios.map((u) => `<option ${q.usuario === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
      <div><label>Tipo de registro</label><select name="tabela"><option value=""></option>${Object.entries(R.TABELAS).map(([k, v]) => `<option value="${k}" ${q.tabela === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>De</label><input type="date" name="de" value="${esc(q.de || '')}"></div><div><label>Até</label><input type="date" name="ate" value="${esc(q.ate || '')}"></div>
      <div><label>Contém o texto</label><input name="texto" value="${esc(q.texto || '')}"></div>
      <div class="check"><button>Filtrar</button> <a href="#/historico">Limpar</a></div></form>
    ${desfazer ? `<p class="suave">Administrador: o botão ↶ volta o campo ao valor anterior. Cada campo volta uma alteração por vez, da mais recente para a mais antiga; depois de desfazer a última, aparece o botão na anterior. Boletos, pagamentos, NFs e usuários não entram (use os botões próprios).</p>
      <p>${botao('desfazerMarcados', '↶ Desfazer os marcados', {}, 'secundario pequeno')}</p>` : ''}
    ${tabelaHistorico(lista.slice(-500).reverse(), desfazer)}<p class="suave">Mostrando até 500 registros mais recentes.</p></details>`;
}

export async function telaDados() {
  const conflitos = await S.copiasEmConflito(E.pasta);
  let modeloProprio = false;
  try {
    await (await E.pasta.getDirectoryHandle(S.PASTA_MODELOS)).getFileHandle(S.MODELO_FATURA);
    modeloProprio = true;
  } catch { /* usa o modelo padrão */ }
  return `<div class="cabecalho"><h1>Dados e backup</h1><div class="acoes">${link('#/empresas', 'Empresas', 'botao secundario')}${link('#/historico', 'Histórico de alterações', 'botao secundario')}</div></div>
    ${conflitos.length ? `<div class="alerta perigo">O OneDrive criou cópia(s) em conflito: <b>${conflitos.map(esc).join(', ')}</b>. Isso acontece quando dois computadores gravam ao mesmo tempo. Confira se falta alguma alteração recente e, depois de conferir, apague a cópia na pasta.</div>` : ''}
    <div class="cartao"><div class="grade">
      ${item('Pasta dos dados', esc(E.pasta.name))}${item('Banco criado em', new Date(d().criado_em).toLocaleString('pt-BR'))}
      ${item('Última atualização', d().atualizado_em ? `${new Date(d().atualizado_em).toLocaleString('pt-BR')} por ${esc(d().atualizado_por)}` : '-')}
      ${item('Versão do arquivo', `revisão ${d().revisao}`)}</div>
      <p class="suave">Tudo é gravado na hora no arquivo <b>${S.ARQUIVO_BANCO}</b> desta pasta. Uma cópia por dia fica em <b>${S.PASTA_BACKUPS}</b> (30 dias). Os anexos ficam em <b>${S.PASTA_ARQUIVOS}</b>, separados por imóvel e inquilino.</p>
      <p>${botao('escolherPasta', 'Trocar de pasta')}</p></div>
    <div class="cartao"><h2>Versão para usar sem internet</h2>
      ${window.VERSAO_OFFLINE ? `<p>${etiqueta(`Você está na versão sem internet de ${dataBr(window.VERSAO_OFFLINE)}`, 'info')}</p>` : ''}
      <p>Um único arquivo com o programa inteiro. Guarde no computador (por exemplo, junto da pasta dos dados) e abra com dois cliques no Chrome ou no Edge: funciona sem internet e mesmo se o site do programa sair do ar. Os dados são os mesmos: escolha a mesma pasta.</p>
      <p class="suave">Quando o programa receber melhorias, baixe o arquivo de novo para ter a versão nova.</p>
      ${window.VERSAO_OFFLINE ? '' : '<p><a class="botao secundario" href="offline/administracao-imoveis.html" download="Administração de Imóveis.html">Baixar a versão sem internet</a></p>'}</div>
    ${podeUsuario('admin') ? `<div class="cartao"><h2>Backup seguro (só administrador)</h2>
      <p>Segunda pasta, só no computador do administrador: recebe uma cópia protegida por senha a cada alteração e um backup completo (banco + anexos) por semana.</p>
      <p>${E.seguro && E.seguro.chave ? etiqueta(`Ligado neste computador · pasta ${E.seguro.dir.name}`, 'ok') : E.seguro && E.seguro.desconectado ? etiqueta('Desconectado: falta liberar a pasta', 'aviso') : etiqueta('Não configurado neste computador', 'neutra')}
      ${link('#/backup-seguro', 'Abrir o backup seguro')}</p></div>` : ''}
    <div class="cartao"><h2>Exportar tudo em ZIP</h2><p>Banco de dados e todos os anexos num único arquivo, para guardar ou levar para outro computador.</p>${opera() ? botao('exportar', 'Baixar ZIP com todos os dados', {}, '') : ''}
      <p style="margin-top:14px">Para ler ou imprimir: todos os cadastros numa planilha Excel (uma aba por cadastro, mais o histórico de alterações) e num PDF (uma ficha por registro). Os anexos não entram e estes arquivos não servem para importar.</p>
      ${opera() ? botao('exportarPlanilhaPdf', 'Baixar todos os dados em planilha e PDF', {}, 'secundario') : ''}
      <p style="margin-top:14px">As regras de negócio do programa (reajuste, caução, NF, IPTU etc.) num arquivo de texto.</p>
      ${botao('baixarRegras', 'Baixar regras do sistema (TXT)', {}, 'secundario')}</div>
    ${podeUsuario('admin') ? `<div class="cartao"><h2>Importar ZIP</h2>
      <div class="alerta aviso">A importação <b>substitui o banco de dados desta pasta</b> pelo do ZIP e acrescenta os anexos. Antes, uma cópia do banco atual é guardada em ${S.PASTA_BACKUPS}.</div>
      <form data-form="importar" class="acoes"><input type="file" name="zip" accept=".zip" style="max-width:380px"><label class="check" style="padding:0"><input type="checkbox" name="confirmo" value="1"> Entendo que os dados atuais serão substituídos</label><button class="perigo">Importar</button></form></div>` : ''}
    ${opera() ? `<div class="cartao"><h2>Conferir arquivos</h2><p>Ao abrir o Painel, o sistema confere se cada arquivo ligado a um lançamento (comprovantes, documentos assinados, aditivos, cartas, apólices, fotos da vistoria) está na pasta.
      O que estiver em outra pasta volta sozinho para o lugar; o que sumiu aparece como alerta no Painel e na página do inquilino, para anexar de novo.</p>
      ${botao('conferirArquivos', 'Conferir arquivos agora')}</div>` : ''}
    ${podeUsuario('admin') ? `<div class="cartao"><h2>Arquivos sem lançamento</h2><p>Ao excluir um lançamento (aditivo, comprovante, depósito, apólice, vistoria, documento assinado), o arquivo anexado é apagado junto.
      Os que sobraram de exclusões antigas podem ser apagados aqui: o sistema mostra a lista antes de apagar. As fichas e documentos anexados à mão em "Arquivos do inquilino" não entram.</p>
      ${botao('limparAnexosSoltos', 'Procurar arquivos sem lançamento')}</div>` : ''}
    <div class="cartao"><h2>Modelos de contrato</h2><p>Textos usados no botão <b>Gerar contrato</b> do inquilino (residencial, não residencial e os que você criar).</p>${link('#/modelos-contrato', 'Ver e editar os modelos')}</div>
    <div class="cartao"><h2>Modelo Excel da NF</h2>
      <p>${modeloProprio ? `${etiqueta('Modelo próprio', 'ok')} usando o arquivo enviado (${S.PASTA_MODELOS}/${S.MODELO_FATURA}).` : 'Usando o modelo padrão, igual à planilha LOJA1 (abas ANK e JCK).'}</p>
      <p class="suave">Para trocar, envie um .xlsx com uma aba por empresa no mesmo desenho. Os dados são preenchidos nas mesmas células da planilha original (B3 a B6, L4, L5, E10, L10, E11, E12, G16, F22, K22).</p>
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
  if (!podeUsuario('admin')) throw new Error('Só administradores podem alterar a logo.');
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
