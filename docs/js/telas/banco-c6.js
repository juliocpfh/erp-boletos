// Banco (C6): caixa de configuração em Dados e backup (ponte, senha, contas por empresa), botões "Emitir no C6" e a caixa
// do boleto emitido (linha digitável, Pix copia-e-cola, QR Code, avisos ao pagador, negativação, consultar e cancelar).
// As ações ficam em telas/acoes.js. A conta que emite: padrão (ANK) ou escolhida boleto a boleto (opção em Empresas).
import { podeUsuario } from '../app.js';
import * as B from '../banco.js';
import { dataBr, dataHoraBr, reais } from '../calculos.js';
import { esc } from '../formularios.js';
import * as M from '../mapa-c6.js';
import * as R from '../regras.js';
import { botao, buscar, d, etiqueta, item, opera, ordenar } from './comum.js';

/** Botão que não funciona ainda, com a explicação no ``title`` (passe o mouse). */
export const botaoInativo = (texto, titulo, cls = 'secundario pequeno') => `<button type="button" class="${cls}" disabled title="${esc(titulo)}">${texto}</button>`;

/** "Emitir no C6": ativo quando a integração está pronta; senão desabilitado explicando o que falta. Só para quem opera. */
export function botaoEmitirC6(cb, cls = 'secundario pequeno') {
  if (!opera() || !R.aCobrar(cb) || R.emitidoNoBanco(cb)) return '';
  const texto = cb.banco && cb.banco.situacao === 'erro' ? 'Tentar emitir no C6 de novo' : cb.banco && cb.banco.situacao === 'cancelado' ? 'Emitir no C6 de novo' : 'Emitir no C6';
  return B.pontePronta(d()) ? botao('emitirBoletoC6', texto, { id: cb.id }, cls) : botaoInativo(texto, B.motivoIndisponivel(d()), cls);
}

/** Botões da tela Boletos: "Emitir todos em aberto do mês" e "Conferir pagamentos no banco". */
export function botoesMesC6(comp) {
  if (!opera()) return '';
  const n = R.boletosParaEmitir(d(), comp).length;
  const texto = `Emitir no C6 todos em aberto do mês${n ? ` (${n})` : ''}`;
  const emitidos = d().cobrancas.some((cb) => cb.competencia === comp && R.emitidoNoBanco(cb));
  if (!B.pontePronta(d())) return `${botaoInativo(texto, B.motivoIndisponivel(d()), 'secundario')} ${botaoInativo('Conferir pagamentos no banco', B.motivoIndisponivel(d()), 'secundario')}`;
  return `${n ? botao('emitirBoletosMesC6', texto, { comp }, 'secundario', `Emitir ${n} boleto(s) em aberto no C6?`) : botaoInativo(texto, 'Nenhum boleto em aberto sem emissão neste mês', 'secundario')}
    ${emitidos ? botao('conferirPagamentosC6', 'Conferir pagamentos no banco', { comp }, 'secundario') : botaoInativo('Conferir pagamentos no banco', 'Nenhum boleto deste mês foi emitido no C6', 'secundario')}`;
}

const ROTULO = { emitido: ['emitido no C6', 'info'], pago: ['pago no C6', 'ok'], cancelado: ['cancelado no C6', 'neutra'], erro: ['erro na emissão', 'perigo'] };

/** Etiqueta curta da situação no banco com o apelido da conta (lista de boletos e página do inquilino). Vazia se nunca foi emitido. */
export function etiquetaBanco(cb) {
  if (!cb.banco || !cb.banco.situacao) return '';
  const [texto, tipo] = ROTULO[cb.banco.situacao] || [cb.banco.situacao, 'neutra'];
  const conta = cb.banco.conta_id ? R.contaBanco(d(), cb.banco.conta_id) : null;
  return etiqueta(`${R.aguardandoCredito(cb) ? 'pago, aguardando crédito' : texto}${conta ? ` · ${conta.apelido}` : cb.banco.conta_id ? ` · ${cb.banco.conta_id}` : ''}${cb.banco.ambiente === 'sandbox' ? ' · teste' : ''}`, R.aguardandoCredito(cb) ? 'aviso' : tipo);
}

/** Linha da lista de boletos: etiqueta + copiar a linha digitável e o Pix, ou o botão de emitir. */
export function resumoBancoLinha(cb) {
  const partes = [etiquetaBanco(cb)];
  if (R.emitidoNoBanco(cb) && cb.banco.linha_digitavel) partes.push(botao('copiar', 'Copiar linha digitável', { texto: cb.banco.linha_digitavel }));
  if (R.emitidoNoBanco(cb) && cb.banco.pix_copia_cola) partes.push(botao('copiar', 'Copiar Pix', { texto: cb.banco.pix_copia_cola }));
  partes.push(botaoEmitirC6(cb));
  return partes.filter(Boolean).join(' ');
}

const MOMENTO_TXT = { ISSUE_DATE: 'na emissão', BEFORE_DUE_DATE: 'um dia antes do vencimento', DUE_DATE: 'no vencimento', AFTER_DUE_DATE: 'um dia depois do vencimento' };
const NOTIF_TXT = { PENDING: ['pendente', 'neutra'], SCHEDULED: ['agendada', 'info'], SENT: ['enviada', 'ok'], FAILED: ['falhou', 'perigo'], CANCELED: ['cancelada', 'neutra'] };
const NEG_TXT = { SCHEDULED: ['negativação agendada', 'aviso'], IN_PROGRESS: ['negativação em andamento', 'aviso'], DENIAL_SUCCESS: ['pagador negativado', 'perigo'], FAILED_TO_DENIAL: ['negativação falhou', 'perigo'],
  SCHEDULED_CANCELLATION: ['cancelamento da negativação agendado', 'info'], CANCELLATION_IN_PROGRESS: ['cancelando a negativação', 'info'], DENIAL_CANCELED: ['negativação cancelada', 'neutra'], FAILED_TO_CANCEL: ['falhou ao cancelar a negativação', 'perigo'] };

/** Avisos ao pagador (e-mail/SMS) e a situação de entrega de cada um, como o banco informa na consulta. */
function tabelaNotificacoes(b) {
  if (!b.notificacoes || !b.notificacoes.length) return '';
  return `<h3>Avisos ao inquilino pelo banco</h3><table class="boleto-banco"><tr><th>Canal</th><th>Para</th><th>Quando</th><th>Situação</th></tr>
    ${b.notificacoes.map((n) => { const [t, tipo] = NOTIF_TXT[n.situacao] || [n.situacao || '-', 'neutra']; return `<tr><td>${esc(n.canal === 'SMS' ? 'SMS' : 'E-mail')}</td><td>${esc(n.destino || '-')}</td><td>${esc(MOMENTO_TXT[n.momento] || n.momento || '-')}</td><td>${etiqueta(t, tipo)}${n.enviada_em ? `<br><span class="suave">${dataHoraBr(n.enviada_em)}</span>` : ''}</td></tr>`; }).join('')}</table>`;
}

/** Negativação do pagador no birô de crédito: situação (``denial_info``) e botões (só administrador, conta com a opção ligada). */
function blocoNegativacao(cb, conta) {
  const b = cb.banco;
  const neg = b.negativacao;
  const podeNeg = podeUsuario('admin') && conta && conta.negativacao && conta.negativacao.ativa && b.situacao === 'emitido';
  if (!neg && !podeNeg) return '';
  const c = buscar('contratos', cb.contrato_id);
  const [t, tipo] = neg ? (NEG_TXT[neg.situacao] || [neg.situacao || 'negativação', 'neutra']) : ['', ''];
  return `<h3>Negativação no birô de crédito</h3>
    ${neg ? `<p>${etiqueta(t, tipo)}${neg.data ? ` · prevista para ${dataBr(neg.data)}` : ''}${neg.dias_atraso ? ` (${neg.dias_atraso} dias de atraso)` : ''}${neg.erro ? ` <span class="suave">${esc(neg.erro)}</span>` : ''}
      ${podeUsuario('admin') && neg.pode_cancelar ? ` ${botao('cancelarNegativacaoC6', 'Cancelar negativação', { id: cb.id }, 'secundario pequeno', `Cancelar a negativação de ${c.inquilino_nome} no birô de crédito?`)}` : ''}</p>`
    : `<p class="suave">Agenda a inclusão de <b>${esc(c.inquilino_nome)}</b> no birô de crédito se o boleto não for pago até <b>${conta.negativacao.dias_atraso} dias</b> depois do vencimento (${dataBr(cb.vencimento)}). Só o administrador, com confirmação dupla.</p>
      <p>${botao('negativarC6', 'Negativar no birô de crédito', { id: cb.id }, 'perigo pequeno', `Negativar ${c.inquilino_nome} no birô de crédito se não pagar em ${conta.negativacao.dias_atraso} dias após o vencimento? Esta é a 1ª de 2 confirmações.`)}</p>`}`;
}

/** Caixa do boleto no banco (página do boleto). */
export function caixaBancoC6(cb) {
  if (cb.data_pagamento && !cb.banco) return '';
  const b = cb.banco;
  const motivo = B.motivoIndisponivel(d());
  const titulo = '<h2>Boleto com Pix no C6</h2>';
  if (!b || b.situacao === 'erro' || b.situacao === 'cancelado') {
    const sugerida = R.contaSugerida(d(), cb);
    const contas = R.configBanco(d()).contas;
    return `<div class="cartao" id="banco-c6">${titulo}
      ${b && b.situacao === 'erro' ? `<div class="alerta perigo"><b>A última emissão falhou</b> (${esc(dataHoraBr(b.erro_em || Date.now()))}): ${esc(b.erro || '')}</div>` : ''}
      ${b && b.situacao === 'cancelado' ? `<div class="alerta info">Boleto anterior cancelado no banco${b.cancelado_em ? ` em ${esc(dataHoraBr(b.cancelado_em))}` : ''}${b.linha_digitavel ? ` (linha digitável ${esc(b.linha_digitavel)})` : ''}. Pode emitir de novo.</div>` : ''}
      ${cb.situacao === 'Carência' ? '<p class="suave">Boleto em carência: nada a cobrar.</p>'
    : motivo ? `<p class="suave">${esc(motivo)}. Enquanto isso, use os dados abaixo para emitir no site do banco.</p>`
      : `<p class="suave">Emite o boleto (valor cheio, desconto até o vencimento, multa e juros como no demonstrativo) com QR Code Pix no C6, pela ponte${sugerida ? `, na conta <b>${esc(sugerida.apelido)}</b>` : contas.length > 1 ? '; o sistema pergunta por qual conta' : ''}. O banco avisa o inquilino por e-mail/SMS conforme a configuração da conta e do contrato.</p>`}
      <p class="acoes">${botaoEmitirC6(cb, 'botao')}</p></div>`;
  }
  const conta = b.conta_id ? R.contaBanco(d(), b.conta_id) : null;
  const div = R.divergenciaBancaria(cb);
  const linha = (rotulo, valor) => (valor ? `<tr><td class="suave">${rotulo}</td><td class="copia-cola"><b>${esc(valor)}</b></td><td class="n">${botao('copiar', 'Copiar', { texto: valor })}</td></tr>` : '');
  const qr = B.imagemQrPix(cb);
  const semPix = b.situacao === 'emitido' && !b.pix_copia_cola;
  return `<div class="cartao" id="banco-c6"><div class="cabecalho">${titulo}<div>${etiquetaBanco(cb)}${semPix ? ` ${etiqueta('sem Pix', 'aviso')}` : ''}</div></div>
    ${semPix ? `<div class="alerta aviso"><b>O boleto saiu sem o Pix</b>${conta && conta.chave_pix ? `: a ponte não tem a chave Pix desta conta (C6_${esc(String(conta.id).toUpperCase())}_CHAVE_PIX). O inquilino paga só pela linha digitável; para ter o QR Code, configure a chave na ponte e emita de novo.` : ': a conta não tem chave Pix cadastrada (Dados e backup → Banco C6).'}</div>` : ''}
    ${R.aguardandoCredito(cb) ? '<div class="alerta info"><b>O inquilino pagou</b> e o banco ainda está confirmando o crédito. Consulte de novo mais tarde para registrar o pagamento aqui.</div>' : ''}
    ${b.situacao === 'pago' && !cb.data_pagamento ? `<div class="alerta aviso"><b>O banco informou o pagamento</b>${b.pago_em ? ` em ${dataBr(b.pago_em)}` : ''}${b.valor_pago ? ` (${reais(b.valor_pago)})` : ''}, mas ele ainda não está registrado aqui. ${opera() ? botao('consultarBoletoC6', 'Registrar o pagamento', { id: cb.id }, 'pequeno') : 'Peça a um operador para registrar.'}</div>` : ''}
    ${div ? `<div class="alerta aviso"><b>Atenção:</b> o boleto no banco está com ${reais(div.no_banco)}${div.vencimento_banco !== div.vencimento_sistema ? `, vencendo em ${dataBr(div.vencimento_banco)}` : ''}, e o sistema calcula ${reais(div.no_sistema)}${div.vencimento_banco !== div.vencimento_sistema ? ` para ${dataBr(div.vencimento_sistema)}` : ''}.${opera() ? ` ${botao('alterarBoletoC6', 'Atualizar o boleto no banco com os valores do sistema', { id: cb.id }, 'pequeno', 'Alterar no C6 o valor, o vencimento e a descrição deste boleto para os do sistema?')}` : ''} Se o banco não aceitar, cancele no banco e emita de novo.</div>` : ''}
    <div class="grade">${item('Conta', conta ? `${esc(conta.apelido)} (${esc((buscar('emitentes', conta.emitente_id) || {}).nome || '')})` : esc(b.conta_id || '-'))}${item('Ambiente', b.ambiente === 'producao' ? 'Produção' : etiqueta('Sandbox (teste): não vale como cobrança', 'aviso'))}
      ${item('Emitido em', b.emitido_em ? dataHoraBr(b.emitido_em) : '-')}${b.pago_em ? item('Pago em (banco)', `${dataBr(b.pago_em)}${b.credito_em && b.credito_em !== b.pago_em ? `<br><span class="suave">creditado em ${dataBr(b.credito_em)}</span>` : ''}`) : ''}
      ${item('Valor no banco', reais(b.valor))}${item('Vencimento no banco', b.vencimento ? dataBr(b.vencimento) : '-')}
      ${item('Situação no banco', `${esc(b.situacao_banco || b.situacao)}${b.consultado_em ? `<br><span class="suave">consultado em ${dataHoraBr(b.consultado_em)}</span>` : ''}`)}</div>
    <table class="boleto-banco codigos">${linha('Linha digitável', b.linha_digitavel)}${linha('Código de barras', b.codigo_barras)}${linha('Nosso número', b.nosso_numero)}${linha('Pix copia e cola', b.pix_copia_cola)}${linha('Referência', b.id_externo)}</table>
    ${qr ? `<div class="qr-pix"><img src="${qr}" alt="QR Code do Pix" width="180" height="180"><div class="suave">QR Code do Pix: o inquilino lê com o app do banco.</div></div>` : ''}
    ${tabelaNotificacoes(b)}
    ${blocoNegativacao(cb, conta)}
    ${opera() ? `<div class="acoes">${botao('consultarBoletoC6', 'Consultar situação no banco', { id: cb.id })}
      ${b.situacao === 'emitido' ? botao('cancelarBoletoC6', 'Cancelar no banco', { id: cb.id }, 'perigo pequeno', 'Cancelar este boleto no C6? O inquilino não conseguirá mais pagar por ele; depois dá para emitir outro.') : ''}
      ${b.situacao === 'emitido' && b.simulado ? botao('pagarSimuladoC6', 'Simular pagamento (teste)', { id: cb.id }, 'secundario pequeno') : ''}
      ${b.situacao !== 'cancelado' && !b.simulado ? botao('abrirPdfC6', 'Abrir PDF do boleto', { id: cb.id }) : ''}</div>` : ''}</div>`;
}

// --------------------------------------------------------------------------
// Configuração (Dados e backup e Empresas, só administrador)
// --------------------------------------------------------------------------
const marcado = (v) => (v ? 'checked' : '');

/** Empresas: qual conta emite os boletos (sempre a padrão, ou escolher boleto a boleto). */
export function caixaContaDosBoletos() {
  if (!podeUsuario('admin')) return '';
  const cfg = R.configBanco(d());
  const emissora = R.contaEmissora(d());
  const nomeEmp = (x) => esc((buscar('emitentes', x.emitente_id) || {}).nome || x.apelido);
  return `<div class="cartao" id="conta-boletos"><h2>Emissão de boletos no banco (C6)</h2>
    ${cfg.contas.length ? `<form data-form="modoContaBoleto" class="formulario">
      <div class="largo"><label class="check-mini"><input type="radio" name="modo" value="padrao" ${cfg.modo_conta_boleto !== 'escolher' ? 'checked' : ''}> Sempre pela empresa padrão:</label>
        <select name="conta_padrao_id" style="width:auto;margin-left:8px">${cfg.contas.map((x) => `<option value="${esc(x.id)}" ${(emissora || {}).id === x.id ? 'selected' : ''}>${nomeEmp(x)} (conta ${esc(x.apelido)})</option>`).join('')}</select></div>
      <div class="largo"><label class="check-mini"><input type="radio" name="modo" value="escolher" ${cfg.modo_conta_boleto === 'escolher' ? 'checked' : ''}> Escolher a empresa boleto a boleto</label>
        <div class="ajuda">Ao emitir, o sistema pergunta sempre a conta, mesmo quando o imóvel tem uma só empresa (ela já vem marcada; senão, a padrão). Em "Emitir todos do mês", pergunta uma vez para o lote.</div></div>
      <div class="acoes" style="align-self:end"><button class="secundario">Salvar</button></div></form>
      <p class="suave">Decisão de 2026-11-05: por orientação do contador, os boletos saem pela ANK e a JCK recebe o repasse depois; a opção de escolher um a um fica disponível.</p>`
    : '<p class="suave">Nenhuma conta bancária cadastrada ainda: cadastre as contas em <a href="#/dados?ir=banco">Dados e backup → Banco (C6)</a>.</p>'}</div>`;
}

export function caixaConfigBanco() {
  if (!podeUsuario('admin')) return '';
  const cfg = B.configuracaoBanco(d());
  const emitentes = ordenar(d().emitentes.filter((e) => e.ativo !== false), 'nome');
  const nomeEmp = (id) => esc((buscar('emitentes', id) || {}).nome || '(empresa excluída)');
  const situacao = cfg.contas.length ? (cfg.ativo ? (B.ponteLocal().configurada ? etiqueta('Ativa', 'ok') : etiqueta('Ativa · falta a ponte neste computador', 'aviso')) : etiqueta('Desligada', 'neutra')) : etiqueta('Aguardando as chaves da API do C6', 'aviso');
  const padrao = R.CONTA_BANCO_PADRAO;
  const emissora = R.contaEmissora(d());
  const resumoNotif = (x) => { const canais = Object.entries(R.CANAIS_NOTIFICACAO).filter(([k]) => x.notificar[k]).map(([, [, r]]) => r); const quando = Object.entries(R.MOMENTOS_NOTIFICACAO).filter(([k]) => x.notificar[k]).map(([, [, r]]) => r); return canais.length && quando.length ? `${canais.join(' e ')}: ${quando.join(', ')}` : 'não avisa'; };
  return `<div class="cartao" id="banco"><div class="cabecalho"><h2>Banco (C6) — boleto com Pix</h2><div>${situacao}</div></div>
    <p>Emite os boletos (com QR Code Pix) direto na conta do C6, pelo botão <b>Emitir no C6</b> da tela Boletos. Como o banco exige certificado digital, o site fala com uma <b>ponte</b>: um programinha que roda no computador de quem emite (pasta <code>ponte-c6</code> do programa, veja o README dela). As chaves do banco ficam só na ponte, nunca aqui.</p>
    <p class="suave">Até as chaves chegarem, a ponte pode rodar em <b>modo simulado</b>: os botões funcionam e devolvem boletos fictícios, para treinar. Qual empresa emite os boletos (padrão ${emissora ? esc(emissora.apelido) : 'ANK'}, ou escolher um a um) se define em <a href="#/empresas?ir=conta-boletos">Empresas</a>.</p>
    <form data-form="configBanco" class="formulario">
      <div><label>Endereço da ponte (neste computador)</label><input name="ponte_url" value="${esc(B.ponteLocal().configurada ? B.ponteLocal().ponte_url : '')}" placeholder="http://localhost:8765"><div class="ajuda">Mostrado quando a ponte é ligada (node servidor.mjs)</div></div>
      <div><label>Senha da ponte (neste computador)</label><input type="password" name="senha_ponte" value="${esc(B.ponteLocal().senha_ponte)}" autocomplete="off"><div class="ajuda">A mesma de PONTE_SENHA no .env da ponte</div></div>
      <div class="largo ajuda">O endereço e a senha ficam <b>só neste computador</b> (não vão para o arquivo de dados nem para o OneDrive): informe nos dois campos em cada computador que vai usar o banco.${B.ponteLocal().configurada ? '' : ' <b>Ainda não informados aqui.</b>'}</div>
      <div class="check"><label class="check-mini"><input type="checkbox" name="ativo" value="1" ${marcado(cfg.ativo)} ${cfg.contas.length ? '' : 'disabled title="Cadastre uma conta antes"'}> Integração ativa (liga os botões "Emitir no C6")</label></div>
      <div class="acoes" style="align-self:end"><button class="secundario">Salvar</button> ${botao('testarPonteC6', 'Testar conexão', {}, 'secundario')}${B.ponteLocal().configurada ? ` ${botao('esquecerPonteC6', 'Esquecer a ponte neste computador', {}, 'perigo', 'Apagar o endereço e a senha da ponte guardados neste computador? Os botões do banco param de funcionar aqui até informar os dois de novo.')}` : ''}</div></form>
    <div id="saude-ponte"></div>
    <h3>Contas bancárias (uma por empresa)</h3>
    <div class="rolagem"><table><tr><th>Identificador na ponte</th><th>Apelido</th><th>Empresa dona da conta</th><th>Ambiente</th><th>Chave Pix</th><th>Avisos ao inquilino</th><th>Negativação</th><th></th></tr>
      ${cfg.contas.map((x) => `<tr><td><code>${esc(x.id)}</code></td><td><b>${esc(x.apelido)}</b>${(emissora || {}).id === x.id ? ` ${etiqueta('padrão dos boletos', 'info')}` : ''}</td><td>${nomeEmp(x.emitente_id)}</td><td>${x.ambiente === 'producao' ? 'Produção' : etiqueta('Sandbox (teste)', 'aviso')}<br><span class="suave">carteira ${esc(R.carteiraDaConta(x))}</span></td>
        <td>${x.chave_pix ? esc(x.chave_pix) : '<span class="suave">sem Pix</span>'}</td><td>${esc(resumoNotif(x))}</td><td>${x.negativacao.ativa ? `${x.negativacao.dias_atraso} dias de atraso` : '<span class="suave">desligada</span>'}</td>
        <td class="n nw">${botao('testarContaC6', 'Testar conexão', { conta: x.id })} ${botao('editarContaBanco', 'Editar', { conta: x.id })} ${botao('excluirContaBanco', 'Tirar', { conta: x.id }, 'perigo pequeno', `Tirar a conta "${x.apelido}" da integração?`)}</td></tr>`).join('')
    || '<tr><td colspan="8" class="suave">Nenhuma conta cadastrada. Cadastre abaixo uma conta por empresa (ex.: ANK e JCK), com o mesmo identificador usado no .env da ponte (CONTAS=ank,jck).</td></tr>'}</table></div>
    <details id="nova-conta-banco" class="caixa-historico"><summary><b>Incluir ou alterar uma conta</b> <span class="suave">· clique para expandir</span></summary>
    <form data-form="contaBanco" class="formulario" style="margin-top:10px">
      <div><label>Identificador na ponte</label><input name="id" placeholder="ank" required pattern="[A-Za-z0-9_\\-]+"><div class="ajuda">Só letras e números; igual ao da ponte</div></div>
      <div><label>Apelido</label><input name="apelido" placeholder="ANK"></div>
      <div><label>Empresa dona da conta</label><select name="emitente_id" required><option value=""></option>${emitentes.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}</select></div>
      <div><label>Ambiente</label><select name="ambiente"><option value="sandbox">Sandbox (teste do banco)</option><option value="producao">Produção (cobranças de verdade)</option></select></div>
      <div><label>Carteira (billing_scheme)</label><input name="carteira" placeholder="automática" inputmode="numeric"><div class="ajuda">Em branco: 21 no sandbox, 15 em produção</div></div>
      <div><label>Chave Pix aleatória da conta (para o QR Code)</label><input name="chave_pix" placeholder="chave aleatória cadastrada no C6"><div class="ajuda">Só chave aleatória (EVP). Em branco: boleto sem Pix</div></div>
      <div><label>Baixar sozinho após o vencimento (dias)</label><input name="dias_baixa" type="number" min="0" value="${padrao.dias_baixa}"><div class="ajuda">0 = o boleto fica aberto até cancelar</div></div>
      <div><label>Desconto de pontualidade vale até (dias antes do vencimento)</label><input name="desconto_dias_antes" type="number" min="0" value="${padrao.desconto_dias_antes}"><div class="ajuda">0 = até o dia do vencimento</div></div>
      <div><label>Tipo do desconto na API</label><select name="tipo_desconto">${Object.values(M.TIPOS_ENCARGO.desconto).map((t) => `<option ${t === padrao.tipo_desconto ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="ajuda">Confirmar no sandbox no 1º boleto de teste</div></div>
      <div class="largo"><label>Instruções fixas no boleto (opcional, uma por linha, até 4 de 80 letras)</label><textarea name="instrucoes" rows="2" placeholder="Ex.: Após o vencimento, pagar somente pelo Pix"></textarea></div>
      <div class="largo"><label>Avisos automáticos ao inquilino pelo banco</label><div class="acoes">
        ${Object.entries(R.CANAIS_NOTIFICACAO).map(([k, [, r]]) => `<label class="check-mini"><input type="checkbox" name="notificar_${k}" value="1" ${marcado(padrao.notificar[k])}> ${r}</label>`).join('')} <span class="suave">·</span>
        ${Object.entries(R.MOMENTOS_NOTIFICACAO).map(([k, [, r]]) => `<label class="check-mini"><input type="checkbox" name="notificar_${k}" value="1" ${marcado(padrao.notificar[k])}> ${r}</label>`).join('')}</div>
        <div class="ajuda">Usa o e-mail e o telefone do cadastro do inquilino. Cada contrato pode não receber ou escolher (campo "Avisos do banco" no cadastro do inquilino)</div></div>
      <div class="largo"><label>Negativação no birô de crédito</label><div class="acoes"><label class="check-mini"><input type="checkbox" name="negativacao_ativa" value="1"> Mostrar o botão "Negativar" na página do boleto (só administrador)</label>
        após <input name="negativacao_dias" type="number" min="1" value="${padrao.negativacao.dias_atraso}" style="width:80px"> dias de atraso</div></div>
      <div class="acoes" style="align-self:end"><button class="secundario">Salvar conta</button></div></form></details>
    <p class="suave" style="margin-top:10px">Como ligar quando as chaves chegarem: <code>documentacao/GUIA_DE_MODIFICACAO.md</code> ("Ligar o boleto com Pix do C6") e <code>ponte-c6/README.md</code>.</p></div>`;
}

/** Desenha o resultado de /saude na caixa (texto em português, sem jargão). */
export function htmlSaude(s, contaId = null) {
  if (!s || !s.ponte) return '<div class="alerta perigo">A ponte respondeu algo inesperado.</div>';
  const contas = s.contas || {};
  const certificado = (c) => (c.certificado_valido_ate ? ` · certificado válido até ${dataBr(c.certificado_valido_ate)}${c.certificado_dias !== null && c.certificado_dias <= 30 ? ` ${etiqueta(c.certificado_dias < 0 ? 'vencido' : `vence em ${c.certificado_dias} dia(s)`, 'perigo')}` : ''}` : '');
  const escopos = (c) => (c.escopos && c.escopos.length ? ` · escopos: ${esc(c.escopos.join(' '))}` : '');
  const linhaConta = (c) => `<li><b>${esc(c.id)}</b> (${c.ambiente === 'producao' ? 'produção' : 'sandbox'}): ${c.simulado ? etiqueta('modo simulado', 'aviso') : c.configurado ? `${etiqueta('chaves ok', 'ok')} · token ${c.token === 'ok' ? etiqueta('ok', 'ok') : c.token === 'falhou' ? `${etiqueta('falhou', 'perigo')} ${esc(c.erro_token || '')}` : etiqueta('não testado', 'neutra')}${escopos(c)}` : `${etiqueta('faltam as chaves', 'aviso')} ${esc((c.faltam || []).join(', '))}`}${certificado(c)}${(c.avisos || []).map((a) => ` <span class="suave">${esc(a)}</span>`).join('')}</li>`;
  const cfg = B.configuracaoBanco(d());
  const semNaPonte = contaId ? [] : cfg.contas.filter((x) => !contas[x.id]).map((x) => x.id);
  return `<div class="alerta ${s.simulado ? 'aviso' : s.configurado ? 'ok' : 'info'}"><b>Ponte respondeu</b>${s.versao ? ` (versão ${esc(s.versao)})` : ''}${s.simulado ? ': <b>modo simulado</b>, os boletos emitidos são fictícios' : s.configurado ? ': pronta para falar com o banco' : ': ainda falta configurar'}${s.senha_exigida === false ? ' · <b>sem senha na ponte</b> (defina PONTE_SENHA no .env)' : ''}.
    <ul style="margin:6px 0 0">${Object.values(contas).map(linhaConta).join('') || '<li>Nenhuma conta na ponte: defina CONTAS=ank,jck no .env dela.</li>'}</ul>
    ${semNaPonte.length ? `<p style="margin:6px 0 0">Contas cadastradas aqui mas não na ponte: <b>${semNaPonte.map(esc).join(', ')}</b>.</p>` : ''}</div>`;
}
