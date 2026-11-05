// Banco: extrato das contas (#/banco), destino das movimentações, comprovantes, caixa do imóvel, "Pagar pelo banco" (#/contas) e pagamentos (#/banco/pagamentos).
// Regras em conciliacao.js (Z); conversa com a ponte do C6 em banco-fase2.js (P). Nada aqui paga sozinho: o banco só valida e
// manda para aprovação no aplicativo do C6; a confirmação final vem pelo extrato.
import { alterar, aviso, E, ir, janela, login, mostrar, podeUsuario } from '../app.js';
import * as S from '../armazenamento.js';
import * as P from '../banco-fase2.js';
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import * as Z from '../conciliacao.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao, buscar, caixaArquivos, d, etiqueta, idPastaAno, idPastaContador, link, opera, ordenar, PASTA_CONTADOR, pastaDoEscopo } from './comum.js';

// --------------------------------------------------------------------------
// Configuração e atalhos
// --------------------------------------------------------------------------
const TITULO_AGUARDANDO = 'Aguardando as chaves da API do C6';
const config = () => d().config_banco || {};
const contas = () => config().contas || [];
const contaDe = (id) => contas().find((c) => c.id === id) || null;
const bancoAtivo = () => !!config().ativo && contas().length > 0;
const movs = () => d().movimentacoes_banco || [];
const pagamentos = () => d().pagamentos_banco || [];
const nomeConta = (id) => { const c = contaDe(id); return c ? c.apelido || String(c.id).toUpperCase() : String(id || '').toUpperCase(); };
const emitenteDaConta = (id) => { const c = contaDe(id); return c && c.emitente_id ? buscar('emitentes', c.emitente_id) : null; };
const pastaContador = () => config().pasta_contador || PASTA_CONTADOR;
/** Rótulo de uma lista [{ id, rotulo }] (ou de um objeto { id: rotulo }). */
const rotuloDe = (lista, id) => (Array.isArray(lista) ? ((lista.find((x) => x.id === id) || {}).rotulo || id) : (lista[id] || id));
const idsDe = (lista) => (Array.isArray(lista) ? lista.map((x) => x.id) : Object.keys(lista));
const ROTULO_CURTO = { aluguel_boleto: 'Boleto nosso', conta_imovel: 'Conta do imóvel', transferencia_entre_contas: 'Transferência', tarifa: 'Tarifa', imposto: 'Imposto', receita_outra: 'Outra receita', despesa_outra: 'Outra despesa', ignorar: 'Ignorada' };
const SEM_COMPROVANTE = ['ignorar'];
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const mov = (id) => { const m = movs().find((x) => x.id === Number(id)); if (!m) throw new Error('Movimentação não encontrada.'); return m; };
const valorHtml = (m) => `<span class="mov-${m.tipo}">${m.tipo === 'entrada' ? '+' : '−'} ${reais(m.valor)}</span>`;
const precisaComprovante = (m) => m.classificacao && !SEM_COMPROVANTE.includes(m.classificacao);
const temComprovante = (m) => !!(m.comprovante || m.comprovante_contador);

/** Botão que fala com a ponte: desligado (com o motivo) enquanto o banco não está configurado em Dados e backup. */
const botaoPonte = (acao, texto, dados = {}, cls = 'secundario pequeno') => (bancoAtivo() ? botao(acao, texto, dados, cls)
  : `<button type="button" class="${cls}" disabled title="${TITULO_AGUARDANDO}">${texto}</button>`);

/** Estado só da tela (não vai para o banco de dados): saldos consultados, conferência de boletos e grupo de pagamento preparado. */
const estado = { saldos: {}, conferencia: null, grupo: null };

const avisoNaoConfigurado = () => `<div class="alerta aviso" id="banco-nao-configurado"><b>O banco ainda não está ligado.</b> As chaves da API do C6 são configuradas em <a href="#/dados">Dados e backup</a> (caixa "Banco (C6)").
  Até lá, os botões que falam com o banco ficam desligados; o que já foi importado continua aqui.</div>`;

// --------------------------------------------------------------------------
// Tela #/banco
// --------------------------------------------------------------------------
export function telaBanco(rota) {
  if (rota.partes[1] === 'pagamentos') return telaPagamentosBanco();
  const lista = contas();
  const contasVistas = [...new Set([...lista.map((c) => c.id), ...movs().map((m) => m.conta_id)])];
  if (!contasVistas.length) {
    return `<h1>Banco</h1>${avisoNaoConfigurado()}
      <div class="cartao"><h2>O que esta tela faz</h2><p>${AJUDA_BANCO}</p>
      <p class="acoes">${link('#/dados', 'Ir para Dados e backup', 'botao')} ${link('#/banco/pagamentos', 'Pagamentos pelo banco')}</p></div>`;
  }
  const conta = contasVistas.includes(rota.q.conta) ? rota.q.conta : config().conta_padrao_id && contasVistas.includes(config().conta_padrao_id) ? config().conta_padrao_id : contasVistas[0];
  const mes = /^\d{4}-\d{2}$/.test(rota.q.mes || '') ? rota.q.mes : C.competenciaDe(C.hojeIso());
  const filtro = rota.q.filtro || 'todas';
  const imovelFiltro = rota.q.imovel ? buscar('imoveis', Number(rota.q.imovel)) : null;
  const url = (q) => `#/banco?${new URLSearchParams({ conta, mes, ...(filtro !== 'todas' ? { filtro } : {}), ...(imovelFiltro ? { imovel: imovelFiltro.id } : {}), ...q })}`;
  const doMes = movs().filter((m) => m.conta_id === conta && (imovelFiltro ? m.imovel_id === imovelFiltro.id : String(m.data).slice(0, 7) === mes))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);
  const filtradas = doMes.filter((m) => (filtro === 'sem_destino' ? !m.classificacao : filtro === 'sem_comprovante' ? precisaComprovante(m) && !temComprovante(m) : true));
  const soma = (tipo) => doMes.filter((m) => m.tipo === tipo).reduce((t, m) => t + m.valor, 0);
  const semDestino = doMes.filter((m) => !m.classificacao).length;
  const semComprovante = doMes.filter((m) => precisaComprovante(m) && !temComprovante(m)).length;
  const saldo = estado.saldos[conta];
  const filtroLink = (k, t) => `<a class="botao ${filtro === k ? '' : 'secundario'} pequeno" href="${url({ filtro: k })}">${t}</a>`;
  return `<div class="cabecalho"><h1>Banco</h1><div class="acoes">${link('#/banco/pagamentos', 'Pagamentos pelo banco', 'botao secundario')}</div></div>
    ${bancoAtivo() ? '' : avisoNaoConfigurado()}
    <div class="abas">${contasVistas.map((id) => `<a href="${url({ conta: id })}" class="${id === conta ? 'ativo' : ''}">${esc(nomeConta(id))} · conta no C6</a>`).join('')}</div>
    <div class="cabecalho"><h2>${imovelFiltro ? `Movimentações de ${esc(imovelFiltro.nome)}` : `Extrato de ${compBr(mes)}`}</h2>
      <div class="acoes">${imovelFiltro ? link(`#/banco?conta=${conta}&mes=${mes}`, 'Ver por mês', 'botao secundario')
    : `${link(url({ mes: C.somarMeses(mes, -1) }), `← ${compBr(C.somarMeses(mes, -1))}`, 'botao secundario')}
      <form data-form="irMesBanco" class="acoes"><input type="hidden" name="conta" value="${esc(conta)}"><input type="month" name="mes" value="${mes}" style="width:160px"><button class="secundario">Ir</button></form>
      ${link(url({ mes: C.somarMeses(mes, 1) }), `${compBr(C.somarMeses(mes, 1))} →`, 'botao secundario')}`}</div></div>
    <div class="acoes" style="margin-bottom:12px">${opera() ? botaoPonte('buscarExtrato', `Buscar extrato de ${compBr(mes)} no banco`, { conta, mes }, 'botao') : ''} ${botaoPonte('saldoBanco', 'Ver saldo', { conta })}
      ${saldo ? `<span>Saldo em ${esc(nomeConta(conta))}: <b>${reais(saldo.valor)}</b> <span class="suave">(${esc(saldo.quando)})</span></span>` : ''}</div>
    <div class="numeros">
      <div class="cartao"><div class="grande mov-entrada">${reais(soma('entrada'))}</div>entradas</div>
      <div class="cartao"><div class="grande mov-saida">${reais(soma('saida'))}</div>saídas</div>
      <div class="cartao"><div class="grande ${semDestino ? 'texto-aviso' : ''}">${semDestino}</div>sem destino</div>
      <div class="cartao"><div class="grande ${semComprovante ? 'texto-aviso' : ''}">${semComprovante}</div>sem comprovante</div></div>
    <div class="acoes" style="margin-bottom:8px">${filtroLink('todas', `Todas (${doMes.length})`)} ${filtroLink('sem_destino', `Só sem destino (${semDestino})`)} ${filtroLink('sem_comprovante', `Só sem comprovante (${semComprovante})`)}</div>
    <div class="cartao rolagem" id="movimentacoes"><table class="cobrancas responsiva banco"><tr><th>Data</th><th>Movimentação</th><th class="n">Valor</th><th>Destino</th><th>Comprovante</th><th></th></tr>
      ${filtradas.map(linhaMovimentacao).join('') || `<tr><td colspan="6" class="suave">${doMes.length ? 'Nenhuma movimentação com este filtro.' : `Nenhuma movimentação importada em ${compBr(mes)}. Clique em "Buscar extrato".`}</td></tr>`}</table>
      <p class="suave">${AJUDA_BANCO}</p></div>
    ${imovelFiltro ? '' : caixaConferirBoletos(conta, mes)}`;
}

const AJUDA_BANCO = 'Busque o extrato uma vez por mês (ou quando quiser). Cada linha precisa de um destino: um imóvel e a conta dele (água, luz, gás, condomínio, IPTU), um boleto de aluguel recebido, um imposto, tarifa do banco ou transferência entre as nossas contas. O comprovante é guardado em PDF com um nome padrão (data, empresa, imóvel, conta e valor) na pasta do imóvel (Contas pagas/ano) e numa cópia para o contador (_Contador/Empresa/AAAA-MM).';

function descreverSugestao(s) {
  const i = s.imovel_id ? buscar('imoveis', s.imovel_id) : null;
  const cb = s.cobranca_id ? buscar('cobrancas', s.cobranca_id) : null;
  const c = cb ? buscar('contratos', cb.contrato_id) : null;
  return [ROTULO_CURTO[s.classificacao] || rotuloDe(Z.CLASSIFICACOES, s.classificacao), i ? i.nome : '', cb ? `boleto ${compBr(cb.competencia)}${c ? ` de ${c.inquilino_nome}` : ''}` : ''].filter(Boolean).join(' · ');
}

function destinoHtml(m, sugestao) {
  if (!m.classificacao) {
    return `${etiqueta('sem destino', 'aviso')}${sugestao && sugestao.classificacao ? `<br><span class="banco-sugestao">parece: ${esc(descreverSugestao(sugestao))}</span>${opera() ? ` ${botao('usarSugestao', 'Usar sugestão', { id: m.id })}` : ''}` : ''}`;
  }
  const partes = [etiqueta(ROTULO_CURTO[m.classificacao] || rotuloDe(Z.CLASSIFICACOES, m.classificacao), m.classificacao === 'ignorar' ? 'neutra' : 'destino')];
  const i = m.imovel_id ? buscar('imoveis', m.imovel_id) : null;
  if (i) partes.push(`<a href="#/imovel/${i.id}">${esc(i.nome)}</a>`);
  const desp = m.despesa_id ? buscar('despesas', m.despesa_id) : null;
  if (desp) partes.push(`<a href="#/contas/${desp.imovel_id}">${esc(desp.tipo)} de ${compBr(desp.competencia)}</a>`);
  const cb = m.cobranca_id ? buscar('cobrancas', m.cobranca_id) : null;
  if (cb) { const c = buscar('contratos', cb.contrato_id); partes.push(`<a href="#/cobranca/${cb.id}">boleto ${compBr(cb.competencia)}${c ? ` · ${esc(c.inquilino_nome)}` : ''}</a> ${cb.data_pagamento ? etiqueta('pago', 'ok') : etiqueta('boleto em aberto', 'aviso')}`); }
  if (m.pagamento_banco_id) partes.push(etiqueta('pago pelo sistema', 'info'));
  if (m.observacoes) partes.push(`<span class="suave">${esc(m.observacoes)}</span>`);
  return partes.join('<br>');
}

/** Onde está o comprovante desta movimentação: na pasta do imóvel (Contas pagas/ano) ou só na do contador. */
function escopoDoComprovante(m) {
  if (m.comprovante && m.imovel_id) return { escopo: 'contasano', id: idPastaAno(m.imovel_id, Number(String(m.data).slice(0, 4))), nome: m.comprovante };
  const e = emitenteDaConta(m.conta_id);
  if (m.comprovante_contador && e) return { escopo: 'contador', id: idPastaContador(e.id, String(m.data).slice(0, 7)), nome: m.comprovante_contador };
  return null;
}

function comprovanteHtml(m) {
  const onde = escopoDoComprovante(m);
  if (onde) return `✓ <a href="#" data-acao="abrirArquivo" data-escopo="${onde.escopo}" data-id="${onde.id}" data-nome="${esc(onde.nome)}" title="Abrir o PDF">${esc(onde.nome)}</a>${m.comprovante_origem === 'manual' ? ` <span class="suave">(anexado do PC)</span>` : ''}`;
  if (temComprovante(m)) return `✓ ${esc(m.comprovante || m.comprovante_contador)}`;
  if (!m.classificacao) return '<span class="suave">dê o destino antes</span>';
  if (!precisaComprovante(m)) return '<span class="suave">—</span>';
  return opera() ? botao('nomearComprovante', 'Nomear e guardar', { id: m.id }) : etiqueta('sem comprovante', 'aviso');
}

function linhaMovimentacao(m) {
  const sugestao = m.classificacao ? null : Z.sugerirClassificacao(d(), m);
  const cbId = m.cobranca_id || (sugestao && sugestao.cobranca_id) || null;
  const cb = cbId ? buscar('cobrancas', cbId) : null;
  const acoes = [];
  if (opera()) {
    if (!m.classificacao) acoes.push(botao('darDestino', 'Dar destino', { id: m.id }));
    else acoes.push(botao('desvincularMov', 'Desfazer destino', { id: m.id }, 'secundario pequeno', 'Desfazer o destino desta movimentação?'));
    if (m.tipo === 'entrada' && cb && !cb.data_pagamento) acoes.push(botao('confirmarBoletoPeloBanco', `É o pagamento do boleto ${compBr(cb.competencia)}`, { id: m.id, cobranca: cb.id }, 'botao pequeno'));
  }
  return `<tr class="${m.classificacao === 'ignorar' ? 'mov-ignorada' : ''}"><td class="nw">${dataBr(m.data)}</td>
    <td><b>${esc(m.titulo || m.descricao || '(sem descrição)')}</b>${m.titulo && m.descricao ? `<br><span class="suave">${esc(m.descricao)}</span>` : ''}${m.categoria_banco ? `<br>${etiqueta(m.categoria_banco, 'neutra')}` : ''}</td>
    <td class="n nw">${valorHtml(m)}</td><td>${destinoHtml(m, sugestao)}</td><td>${comprovanteHtml(m)}</td><td class="n nw">${acoes.join(' ')}</td></tr>`;
}

/** Caixa "Conferir boletos pagos no banco": o C6 lista os boletos que recebeu; o sistema casa com os em aberto e dá baixa só nos marcados. */
function caixaConferirBoletos(conta, mes) {
  const conf = estado.conferencia && estado.conferencia.conta === conta && estado.conferencia.mes === mes ? estado.conferencia : null;
  const linha = (s, n) => {
    const cb = buscar('cobrancas', s.cobranca_id);
    const c = cb ? buscar('contratos', cb.contrato_id) : null;
    const i = c ? buscar('imoveis', c.imovel_id) : null;
    if (!cb) return '';
    const previsto = R.previstoNoPagamento(cb, s.data_credito).valor_devido;
    return `<tr><td class="centro"><input type="checkbox" name="pag" value="${n}" ${cb.data_pagamento ? 'disabled' : 'checked'}></td>
      <td><a href="#/cobranca/${cb.id}"><b>${esc(i ? i.nome : '')}</b> · ${esc(c ? c.inquilino_nome : '')}</a><br><span class="suave">boleto ${compBr(cb.competencia)} · vence ${dataBr(cb.vencimento)}</span></td>
      <td class="nw">${dataBr(s.data_credito)}</td><td class="n">${reais(s.valor)}${previsto !== s.valor ? `<br><span class="texto-aviso">previsto ${reais(previsto)}</span>` : ''}</td>
      <td>${cb.data_pagamento ? etiqueta('já estava pago', 'neutra') : previsto === s.valor ? etiqueta('bate certinho', 'ok') : etiqueta('valor diferente', 'aviso')}</td></tr>`;
  };
  return `<div class="cartao" id="conferir-boletos" data-caixa="conferir-boletos"><h2>Conferir boletos pagos no banco</h2>
    <p class="suave">O banco informa quais boletos nossos foram pagos em ${compBr(mes)}. O sistema mostra os que ainda estão em aberto aqui; você marca e confirma, e cada um fica "Pago" com a data em que o dinheiro entrou.</p>
    ${opera() ? `<p class="acoes">${botaoPonte('conferirBoletosBanco', `Buscar boletos pagos em ${compBr(mes)}`, { conta, mes })}</p>` : ''}
    ${conf ? (conf.sugestoes.length ? `<form data-form="registrarPagamentosBanco"><input type="hidden" name="conta" value="${esc(conta)}"><input type="hidden" name="mes" value="${mes}">
      <div class="rolagem"><table class="responsiva"><tr><th></th><th>Boleto</th><th>Crédito em</th><th class="n">Valor recebido</th><th>Conferência</th></tr>${conf.sugestoes.map(linha).join('')}</table></div>
      ${opera() ? '<div class="acoes"><button>Registrar os pagamentos marcados</button></div>' : ''}</form>`
    : `<p class="suave">Nenhum boleto pago no banco em ${compBr(mes)} corresponde a um boleto em aberto aqui (${conf.recebidos} informado(s) pelo banco).</p>`) : ''}</div>`;
}

// --------------------------------------------------------------------------
// Tela #/banco/pagamentos
// --------------------------------------------------------------------------
const AVISO_APROVACAO = '<div class="alerta info"><b>O pagamento só acontece depois que você aprovar no aplicativo do C6.</b> Aqui o sistema prepara o pagamento e o banco confere o código; o dinheiro só sai quando alguém autorizado aprova no app. A confirmação final aparece no extrato.</div>';

function linhaPagamento(p) {
  const i = p.imovel_id ? buscar('imoveis', p.imovel_id) : null;
  const m = p.movimentacao_id ? movs().find((x) => x.id === p.movimentacao_id) : null;
  const acoes = [];
  if (opera()) {
    if (p.grupo_id && !['pago', 'cancelado'].includes(p.situacao)) acoes.push(botaoPonte('atualizarSituacaoPagamento', 'Atualizar situação', { conta: p.conta_id, grupo: p.grupo_id }));
    if (['rascunho', 'validado'].includes(p.situacao)) acoes.push(botao('cancelarPagamentoBanco', 'Cancelar', { id: p.id }, 'secundario pequeno', 'Cancelar este pagamento? Nada foi enviado ao banco.'));
    if (['enviado_aprovacao', 'agendado'].includes(p.situacao)) acoes.push(botao('confirmarPagamentoPeloExtrato', 'Confirmar pelo extrato', { id: p.id }, 'botao pequeno'));
  }
  return `<tr><td>${i ? `<a href="#/contas/${i.id}"><b>${esc(i.nome)}</b></a><br>` : ''}${esc(p.tipo_conta || '')}${p.competencia ? ` de ${compBr(p.competencia)}` : ''}${p.observacoes ? `<br><span class="suave">${esc(p.observacoes)}</span>` : ''}</td>
    <td>${esc(nomeConta(p.conta_id))}</td><td class="n nw"><b>${reais(p.valor)}</b></td><td class="nw">${dataBr(p.data_pagamento)}</td>
    <td>${p.beneficiario ? `${esc(p.beneficiario)}<br>` : ''}${p.vencimento ? `<span class="suave">vence ${dataBr(p.vencimento)}</span><br>` : ''}<span class="codigo-barras suave">${esc(String(p.codigo || '').slice(0, 48))}${String(p.codigo || '').length > 48 ? '…' : ''}</span></td>
    <td>${etiquetaSituacao(p)}${p.erro ? `<br><span class="texto-aviso">${esc(p.erro)}</span>` : ''}${p.pago_em ? `<br><span class="suave">pago em ${dataBr(p.pago_em)}</span>` : ''}${m ? `<br><span class="suave">extrato: ${dataBr(m.data)} · ${esc(m.descricao)}</span>` : ''}</td>
    <td class="n nw">${acoes.join(' ')}</td></tr>`;
}

const etiquetaSituacao = (p) => etiqueta(rotuloDe(Z.SITUACOES_PAGAMENTO, p.situacao), { pago: 'ok', erro: 'perigo', cancelado: 'neutra', enviado_aprovacao: 'aviso', agendado: 'info', validado: 'info' }[p.situacao] || 'neutra');

function telaPagamentosBanco() {
  const lista = [...pagamentos()].sort((a, b) => b.id - a.id);
  const ordem = idsDe(Z.SITUACOES_PAGAMENTO);
  const grupos = ordem.map((s) => [s, lista.filter((p) => p.situacao === s)]).filter(([, l]) => l.length);
  return `<p class="suave"><a href="#/banco">← Banco</a></p><h1>Pagamentos pelo banco</h1>${AVISO_APROVACAO}
    ${bancoAtivo() ? '' : avisoNaoConfigurado()}
    <p class="suave">Para preparar um pagamento, abra as contas do imóvel (página do imóvel → "Contas pagas por nós") e use a caixa "Pagar pelo banco". Depois de aprovado no app, busque o extrato do mês e clique em "Confirmar pelo extrato".</p>
    ${grupos.map(([s, l]) => `<div class="cartao rolagem" id="pagamentos-${s}"><h2>${esc(rotuloDe(Z.SITUACOES_PAGAMENTO, s))} <span class="suave">(${l.length})</span></h2>
      <table class="cobrancas responsiva"><tr><th>Conta do imóvel</th><th>Paga por</th><th class="n">Valor</th><th>Pagar em</th><th>Beneficiário / código</th><th>Situação</th><th></th></tr>${l.map(linhaPagamento).join('')}</table></div>`).join('')
    || '<div class="cartao"><p class="suave">Nenhum pagamento preparado ainda.</p></div>'}`;
}

// --------------------------------------------------------------------------
// Caixa "Pagar pelo banco" (tela de contas do imóvel) e caixa "Banco" (página do imóvel)
// --------------------------------------------------------------------------
export function caixaPagarPeloBanco(i, comp) {
  const permitidas = R.contasPermitidas(d(), i.id, comp);
  const hoje = C.hojeIso();
  const lista = contas();
  const sugerida = contaSugerida(i.id);
  const grupo = estado.grupo && estado.grupo.imovel_id === i.id ? estado.grupo : null;
  const meus = pagamentos().filter((p) => p.imovel_id === i.id).sort((a, b) => b.id - a.id).slice(0, 10);
  const linha = (tipo, n) => `<tr><td><b>${esc(tipo)}</b><input type="hidden" name="tipo_${n}" value="${esc(tipo)}"></td>
    <td><input name="codigo_${n}" class="codigo-barras" placeholder="código de barras, linha digitável ou Pix copia e cola" autocomplete="off"></td>
    <td><input name="valor_${n}" data-dinheiro inputmode="decimal" placeholder="0,00" style="width:120px"></td>
    <td><input type="date" name="data_${n}" value="${hoje}" style="width:auto"></td></tr>`;
  const itemGrupo = (it) => `<tr><td>${esc(it.description || '')}</td><td>${esc(it.beneficiary_name || '-')}${it.bank_name ? `<br><span class="suave">${esc(it.bank_name)}</span>` : ''}</td>
    <td class="nw">${it.due_date ? dataBr(it.due_date) : '-'}</td><td class="n">${reais(C.centavos(String(it.amount).replace('.', ',')))}</td>
    <td>${it.status === 'READ_DATA' ? etiqueta('validado pelo banco', 'ok') : it.status === 'SCHEDULED' ? etiqueta('enviado', 'info') : etiqueta(it.error_message || it.status || 'erro', 'perigo')}</td></tr>`;
  return `<div class="cartao" id="pagar-banco" data-caixa="pagar-banco"><h2>Pagar pelo banco (C6)</h2>${AVISO_APROVACAO}
    ${bancoAtivo() ? '' : avisoNaoConfigurado()}
    ${!opera() ? '' : `<form data-form="pagarPeloBanco"><input type="hidden" name="imovel" value="${i.id}"><input type="hidden" name="competencia" value="${comp}">
      <div class="acoes" style="margin-bottom:10px"><label style="margin:0">Conta que paga</label><select name="conta" style="width:auto">${lista.map((c) => `<option value="${esc(c.id)}" ${c.id === sugerida ? 'selected' : ''}>${esc(nomeConta(c.id))}</option>`).join('') || '<option value="">(nenhuma conta configurada)</option>'}</select>
        <span class="suave">Mês da conta: <b>${compBr(comp)}</b> (troque no formulário acima)</span></div>
      ${permitidas.tipos.length ? `<div class="rolagem"><table><tr><th>Conta</th><th>Código de barras ou Pix copia e cola</th><th>Valor</th><th>Pagar em</th></tr>${R.TIPOS_DESPESA.filter((t) => permitidas.tipos.includes(t)).map((t) => linha(t, R.TIPOS_DESPESA.indexOf(t))).join('')}</table></div>
      <p class="suave">Preencha só as contas que quer pagar. "Preparar pagamento" manda os códigos ao banco, que confere o beneficiário e o vencimento e mostra aqui. Nada é pago nesta etapa.</p>
      <div class="acoes">${bancoAtivo() ? '<button>Preparar pagamento</button>' : `<button disabled title="${TITULO_AGUARDANDO}">Preparar pagamento</button>`}</div>`
    : `<p class="suave">Em ${compBr(comp)} o inquilino paga todas as contas, conforme o contrato: não há conta nossa para pagar neste mês.</p>`}</form>`}
    ${grupo ? `<h3>Pagamento preparado · ${esc(nomeConta(grupo.conta))}</h3><div class="rolagem"><table class="responsiva"><tr><th>Conta</th><th>Beneficiário</th><th>Vencimento</th><th class="n">Valor</th><th>Banco disse</th></tr>${grupo.itens.map(itemGrupo).join('')}</table></div>
      <p class="acoes">${podeUsuario('admin') ? botaoPonte('enviarGrupoAprovacao', 'Enviar para aprovação no app do C6', { grupo: grupo.grupoId }, 'botao') : '<span class="suave">Só o administrador envia para aprovação.</span>'}
      ${botao('descartarGrupo', 'Descartar', { grupo: grupo.grupoId }, 'secundario pequeno', 'Descartar este pagamento preparado? Nada foi enviado ao banco.')}</p>` : ''}
    ${meus.length ? `<h3>Pagamentos deste imóvel</h3><div class="rolagem"><table class="cobrancas responsiva"><tr><th>Conta do imóvel</th><th>Paga por</th><th class="n">Valor</th><th>Pagar em</th><th>Beneficiário / código</th><th>Situação</th><th></th></tr>${meus.map(linhaPagamento).join('')}</table></div>` : ''}
    <p class="suave">${link('#/banco/pagamentos', 'Ver todos os pagamentos pelo banco')}</p></div>`;
}

/** Conta sugerida para pagar as contas do imóvel: a da empresa com maior participação; senão a padrão ou a primeira. */
function contaSugerida(imovelId) {
  const parts = R.participacoesDo(d(), imovelId).sort((a, b) => b.percentual - a.percentual);
  for (const p of parts) { const c = contas().find((x) => x.emitente_id === p.emitente_id); if (c) return c.id; }
  return config().conta_padrao_id || (contas()[0] || {}).id || '';
}

export function caixaBancoImovel(i) {
  const ano = Number(C.hojeIso().slice(0, 4));
  const todas = movs().filter((m) => m.imovel_id === i.id).sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);
  const doAno = todas.filter((m) => String(m.data).slice(0, 4) === String(ano));
  const soma = (tipo) => doAno.filter((m) => m.tipo === tipo).reduce((t, m) => t + m.valor, 0);
  const meus = pagamentos().filter((p) => p.imovel_id === i.id && !['pago', 'cancelado'].includes(p.situacao));
  return `<div class="cartao" id="banco" data-caixa="banco"><div class="cabecalho"><h2>Banco: movimentações e comprovantes</h2>${link(`#/banco?imovel=${i.id}`, 'Ver no Banco')}</div>
    <p class="suave">Entradas e saídas do extrato ligadas a este imóvel em ${ano}: ${doAno.length ? `<b class="mov-entrada">+ ${reais(soma('entrada'))}</b> · <b class="mov-saida">− ${reais(soma('saida'))}</b>` : 'nenhuma ainda'}.
      ${todas.length > doAno.length ? `Outros anos: ${todas.length - doAno.length} movimentação(ões), veja no Banco.` : ''}</p>
    ${doAno.length ? `<div class="rolagem"><table class="responsiva"><tr><th>Data</th><th>Conta</th><th>O que é</th><th class="n">Valor</th><th>Comprovante</th></tr>
      ${doAno.slice(0, 50).map((m) => `<tr><td class="nw">${dataBr(m.data)}</td><td>${esc(nomeConta(m.conta_id))}</td><td>${esc(m.titulo || m.descricao || '')}<br>${destinoHtml(m, null)}</td><td class="n nw">${valorHtml(m)}</td><td>${comprovanteHtml(m)}</td></tr>`).join('')}</table></div>` : ''}
    ${meus.length ? `<p>${meus.length} pagamento(s) pelo banco em andamento: ${meus.map((p) => `${esc(p.tipo_conta)} ${reais(p.valor)} ${etiquetaSituacao(p)}`).join(' · ')} ${link('#/banco/pagamentos', 'Ver')}</p>` : ''}
    ${caixaArquivos('contasano', idPastaAno(i.id, ano), `Comprovantes de ${ano}`, `comprovantes-${ano}`, 'PDFs dos comprovantes guardados pela tela Banco (pasta "Contas pagas/ano" do imóvel). Para anexar, use "Nomear e guardar" na linha da movimentação.', true, false)}</div>`;
}

// --------------------------------------------------------------------------
// Comprovantes: salvar nas duas pastas e registrar
// --------------------------------------------------------------------------
async function guardarComprovante(m, nomeBase, blob, origem) {
  const base = S.limparNome(semAcento(nomeBase).replace(/\.pdf$/i, '').trim());
  if (!base || base === 'sem nome') throw new Error('Dê um nome ao comprovante.');
  const arquivo = () => new File([blob], `${base}.pdf`, { type: 'application/pdf' });
  const ano = Number(String(m.data).slice(0, 4));
  const comp = String(m.data).slice(0, 7);
  const i = m.imovel_id ? buscar('imoveis', m.imovel_id) : null;
  const e = emitenteDaConta(m.conta_id);
  let comprovante = null;
  let contador = null;
  if (i) comprovante = await S.salvarArquivo(await pastaDoEscopo('contasano', idPastaAno(i.id, ano)), arquivo());
  if (e && config().copiar_para_contador !== false) contador = await S.salvarArquivo(await pastaDoEscopo('contador', idPastaContador(e.id, comp)), arquivo());
  if (!comprovante && !contador) throw new Error('Não há pasta para guardar: a movimentação não tem imóvel e a conta não está ligada a uma empresa (Dados e backup → Banco).');
  await alterar((db) => Z.registrarComprovante(db, m.id, { nome_arquivo: base, comprovante, comprovante_contador: contador, origem }, login()));
  aviso(`Comprovante guardado${comprovante ? ` em ${i.nome} › Contas pagas › ${ano}` : ''}${contador ? `${comprovante ? ' e' : ''} em ${pastaContador()} › ${e.nome} › ${comp}` : ''}.`);
}

// --------------------------------------------------------------------------
// Janelas
// --------------------------------------------------------------------------
const opcoes = (lista, atual, vazio = '') => `${vazio ? `<option value="">${esc(vazio)}</option>` : ''}${lista.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(atual ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;

/** Contas do imóvel já lançadas que ainda não têm movimentação do extrato ligada. */
const despesasSemExtrato = (imovelId) => R.despesasDo(d(), imovelId).filter((x) => x.valor > 0 && !movs().some((m) => m.despesa_id === x.id)).slice(0, 24);

/** Boletos em aberto do imóvel; o de mesmo valor na data da movimentação vem primeiro. */
function boletosAbertos(imovelId, m) {
  const cs = d().contratos.filter((c) => !imovelId || c.imovel_id === imovelId).map((c) => c.id);
  return d().cobrancas.filter((cb) => cs.includes(cb.contrato_id) && !cb.data_pagamento && cb.situacao !== 'Carência')
    .map((cb) => ({ cb, previsto: R.previstoNoPagamento(cb, m.data).valor_devido }))
    .sort((a, b) => (a.previsto === m.valor ? -1 : b.previsto === m.valor ? 1 : 0) || String(b.cb.vencimento).localeCompare(String(a.cb.vencimento))).slice(0, 30);
}

async function janelaDestino(m) {
  const s = Z.sugerirClassificacao(d(), m);
  const imoveis = ordenar(d().imoveis, 'nome').map((i) => [i.id, i.nome]);
  const classes = (Array.isArray(Z.CLASSIFICACOES) ? Z.CLASSIFICACOES : Object.entries(Z.CLASSIFICACOES).map(([id, rotulo]) => ({ id, rotulo }))).map((x) => [x.id, x.rotulo]);
  const inicial = s.classificacao || (m.tipo === 'entrada' ? 'aluguel_boleto' : 'conta_imovel');
  const html = `<p><b>${dataBr(m.data)}</b> · ${esc(m.titulo || '')} ${esc(m.descricao || '')} · <b>${valorHtml(m)}</b>${esc(nomeConta(m.conta_id)) ? ` <span class="suave">(${esc(nomeConta(m.conta_id))})</span>` : ''}</p>
    ${s.classificacao ? `<p class="suave">Sugestão: ${esc(descreverSugestao(s))}${s.motivo ? ` (${esc(s.motivo)})` : ''}.</p>` : ''}
    <p><label>O que é esta movimentação</label><select name="classificacao" style="width:100%">${opcoes(classes, inicial)}</select></p>
    <p data-campo="imovel"><label>Imóvel</label><select name="imovel" style="width:100%">${opcoes(imoveis, s.imovel_id, '— sem imóvel')}</select></p>
    <p data-campo="despesa"><label>Conta do imóvel já lançada (opcional)</label><select name="despesa" style="width:100%"></select>
      <span class="suave">Se a conta ainda não foi lançada, deixe em branco: lance depois em "Contas pagas por nós".</span></p>
    <p data-campo="boleto"><label>Boleto do inquilino</label><select name="boleto" style="width:100%"></select>
      <span class="suave">Escolher o boleto só liga a movimentação; para dar baixa, use depois "É o pagamento do boleto…".</span></p>
    <p><label>Observações</label><textarea name="observacoes" rows="2" style="width:100%"></textarea></p>`;
  const r = await janela({ titulo: 'Dar destino à movimentação', html, sim: 'Salvar destino', ligar(dlg) {
    const sel = (n) => dlg.querySelector(`[name="${n}"]`);
    const campo = (n) => dlg.querySelector(`[data-campo="${n}"]`);
    const encher = () => {
      const imovelId = Number(sel('imovel').value) || null;
      sel('despesa').innerHTML = opcoes(imovelId ? despesasSemExtrato(imovelId).map((x) => [x.id, `${x.tipo} de ${compBr(x.competencia)} · ${reais(x.valor)} · paga em ${dataBr(x.data_pagamento)}${x.valor === m.valor ? ' ★ mesmo valor' : ''}`]) : [], (imovelId ? despesasSemExtrato(imovelId).find((x) => x.valor === m.valor) || {} : {}).id, '— nenhuma');
      const bs = boletosAbertos(imovelId, m);
      sel('boleto').innerHTML = opcoes(bs.map(({ cb, previsto }) => { const c = buscar('contratos', cb.contrato_id); return [cb.id, `${compBr(cb.competencia)} · ${c ? c.inquilino_nome : ''} · vence ${dataBr(cb.vencimento)} · ${reais(previsto)}${previsto === m.valor ? ' ★ mesmo valor' : ''}`]; }),
        s.cobranca_id || (bs.find((x) => x.previsto === m.valor) || { cb: {} }).cb.id, '— nenhum');
    };
    const mostrarCampos = () => {
      const k = sel('classificacao').value;
      campo('imovel').hidden = ['tarifa', 'transferencia_entre_contas', 'ignorar'].includes(k);
      campo('despesa').hidden = k !== 'conta_imovel';
      campo('boleto').hidden = k !== 'aluguel_boleto';
    };
    sel('imovel').addEventListener('change', encher);
    sel('classificacao').addEventListener('change', mostrarCampos);
    encher();
    mostrarCampos();
  } });
  if (!r) return null;
  const v = (k) => (r[k] || [''])[0];
  const classificacao = v('classificacao');
  const escondeImovel = ['tarifa', 'transferencia_entre_contas', 'ignorar'].includes(classificacao);
  return { classificacao, imovel_id: escondeImovel ? null : Number(v('imovel')) || null, despesa_id: classificacao === 'conta_imovel' ? Number(v('despesa')) || null : null,
    cobranca_id: classificacao === 'aluguel_boleto' ? Number(v('boleto')) || null : null, observacoes: String(v('observacoes') || '').trim() };
}

async function janelaComprovante(m) {
  const i = m.imovel_id ? buscar('imoveis', m.imovel_id) : null;
  const e = emitenteDaConta(m.conta_id);
  const pastas = [i ? `${i.nome} › Contas pagas › ${String(m.data).slice(0, 4)}` : '', e && config().copiar_para_contador !== false ? `${pastaContador()} › ${e.nome} › ${String(m.data).slice(0, 7)}` : ''].filter(Boolean);
  let arquivoEl = null;
  const html = `<p>${esc(m.titulo || m.descricao || '')} · ${dataBr(m.data)} · ${valorHtml(m)}</p>
    <p><label>Nome do arquivo</label><input name="nome" value="${esc(Z.nomePadraoComprovante(d(), m))}" style="width:100%"><span class="suave">Sem acento; o ".pdf" é colocado sozinho.</span></p>
    <p>Vai para: ${pastas.length ? pastas.map((p) => `<b>${esc(p)}</b>`).join(' e ') : '<span class="texto-aviso">nenhuma pasta (dê um imóvel à movimentação ou ligue a conta a uma empresa)</span>'}</p>
    <p><label><input type="radio" name="origem" value="ponte" ${bancoAtivo() ? 'checked' : `disabled title="${TITULO_AGUARDANDO}"`}> Gerar o PDF pelo banco (ponte)</label>
      <label><input type="radio" name="origem" value="manual" ${bancoAtivo() ? '' : 'checked'}> Anexar um PDF do computador</label></p>
    <p data-campo="arquivo" ${bancoAtivo() ? 'hidden' : ''}><input type="file" name="arquivo" accept="application/pdf,.pdf"></p>`;
  const r = await janela({ titulo: 'Nomear e guardar o comprovante', html, sim: 'Guardar', ligar(dlg) {
    arquivoEl = dlg.querySelector('[name="arquivo"]');
    const campo = dlg.querySelector('[data-campo="arquivo"]');
    dlg.querySelectorAll('[name="origem"]').forEach((el) => el.addEventListener('change', () => { campo.hidden = dlg.querySelector('[name="origem"]:checked').value !== 'manual'; }));
  } });
  if (!r) return null;
  const origem = (r.origem || ['manual'])[0];
  const nome = (r.nome || [''])[0];
  const arquivo = arquivoEl && arquivoEl.files && arquivoEl.files[0];
  return { origem, nome, arquivo };
}

// --------------------------------------------------------------------------
// Botões (data-acao) e formulários (data-form)
// --------------------------------------------------------------------------
export const ACOES_BANCO = {
  async buscarExtrato({ conta, mes }) {
    if (!opera()) throw new Error('Seu usuário não pode importar o extrato.');
    if (!bancoAtivo()) throw new Error(`${TITULO_AGUARDANDO}: configure o banco em Dados e backup.`);
    const [de, fim] = C.limitesCompetencia(mes);
    const ate = fim < C.hojeIso() ? fim : C.hojeIso();
    const r = await P.extratoDaConta(conta, de, ate);
    const res = await alterar((db) => Z.importarExtrato(db, conta, r.lancamentos || [], login()));
    const novas = Array.isArray(res.novas) ? res.novas.length : Number(res.novas) || 0;
    aviso(`${nomeConta(conta)}: ${novas} movimentação(ões) nova(s), ${Number(res.repetidas) || 0} já estavam.`);
    await mostrar();
  },

  async saldoBanco({ conta }) {
    if (!bancoAtivo()) throw new Error(TITULO_AGUARDANDO);
    const s = await P.saldoDaConta(conta);
    const valor = s.saldo_centavos ?? C.centavos(String(s.total_available ?? s.available ?? s.saldo ?? '0').replace('.', ','));
    estado.saldos[conta] = { valor, quando: `consultado ${new Date().toLocaleString('pt-BR')}` };
    await mostrar();
  },

  async darDestino({ id }) {
    const m = mov(id);
    const destino = await janelaDestino(m);
    if (!destino) return;
    await alterar((db) => Z.vincularMovimentacao(db, m.id, destino, login()));
    const cb = destino.cobranca_id ? buscar('cobrancas', destino.cobranca_id) : null;
    aviso(cb && !cb.data_pagamento ? 'Destino salvo. Para dar baixa no boleto, clique em "É o pagamento do boleto…" na mesma linha.' : 'Destino salvo.');
    await mostrar();
  },

  async usarSugestao({ id }) {
    const m = mov(id);
    const s = Z.sugerirClassificacao(d(), m);
    if (!s.classificacao) throw new Error('Não há sugestão para esta movimentação.');
    await alterar((db) => Z.vincularMovimentacao(db, m.id, { classificacao: s.classificacao, imovel_id: s.imovel_id, despesa_id: s.despesa_id, cobranca_id: s.cobranca_id, observacoes: '' }, login()));
    aviso('Destino salvo pela sugestão.');
    await mostrar();
  },

  async desvincularMov({ id }) {
    const m = mov(id);
    await alterar((db) => Z.desvincularMovimentacao(db, m.id, login()));
    await mostrar();
  },

  async nomearComprovante({ id }) {
    const m = mov(id);
    const r = await janelaComprovante(m);
    if (!r) return;
    let blob;
    if (r.origem === 'ponte') {
      if (!bancoAtivo()) throw new Error(TITULO_AGUARDANDO);
      try {
        blob = await P.baixarComprovantePonte(m.conta_id, m.id_externo);
      } catch (e) {
        throw new Error(`Não consegui gerar o comprovante pelo banco agora (${e.message}). Você pode anexar o PDF do computador: clique de novo em "Nomear e guardar" e escolha "Anexar um PDF".`);
      }
    } else {
      if (!r.arquivo || !r.arquivo.size) throw new Error('Escolha o arquivo PDF do comprovante.');
      if (!/\.pdf$/i.test(r.arquivo.name) && r.arquivo.type !== 'application/pdf') throw new Error('O comprovante precisa ser um PDF.');
      blob = r.arquivo;
    }
    await guardarComprovante(m, r.nome, blob, r.origem);
    await mostrar();
  },

  async confirmarBoletoPeloBanco({ id, cobranca }) {
    const m = mov(id);
    const cb = buscar('cobrancas', Number(cobranca));
    if (!cb) throw new Error('Boleto não encontrado.');
    if (cb.data_pagamento) throw new Error('Este boleto já está pago.');
    const c = buscar('contratos', cb.contrato_id);
    const previsto = R.previstoNoPagamento(cb, m.data).valor_devido;
    const r = await janela({ titulo: 'Confirmar o pagamento do boleto', sim: 'Confirmar pagamento', forte: previsto !== m.valor,
      html: `<p>Boleto de <b>${compBr(cb.competencia)}</b> de <b>${esc(c ? c.inquilino_nome : '')}</b>, vencimento ${dataBr(cb.vencimento)}.</p>
        <p>Recebido <b>${reais(m.valor)}</b> em <b>${dataBr(m.data)}</b> · previsto para esta data: <b>${reais(previsto)}</b>
        ${previsto === m.valor ? etiqueta('bate certinho', 'ok') : `${etiqueta('valor diferente', 'aviso')}<br><span class="suave">Se preferir informar a justificativa e o valor da NF, confirme na tela Boletos.</span>`}</p>
        <p class="suave">O boleto fica "Pago" com a data em que o dinheiro entrou e esta movimentação fica ligada a ele.</p>` });
    if (!r) return;
    await alterar((db) => Z.confirmarPagamentoPeloBanco(db, cb.id, { data_credito: m.data, valor: m.valor, movimentacao_id: m.id, external_reference_id: (cb.banco || {}).id_externo || null }, login()));
    aviso(`Pagamento do boleto de ${compBr(cb.competencia)} confirmado.`);
    await mostrar();
  },

  async conferirBoletosBanco({ conta, mes }) {
    if (!bancoAtivo()) throw new Error(TITULO_AGUARDANDO);
    const [de, fim] = C.limitesCompetencia(mes);
    const r = await P.boletosPagos(conta, de, fim < C.hojeIso() ? fim : C.hojeIso());
    const pagos = Array.isArray(r) ? r : (r && (r.content || r.boletos || r.itens)) || [];
    estado.conferencia = { conta, mes, recebidos: pagos.length, sugestoes: Z.conciliarBoletos(d(), conta, pagos) };
    aviso(`${pagos.length} boleto(s) pago(s) segundo o banco; ${estado.conferencia.sugestoes.length} correspondem a boletos em aberto aqui.`, 'info');
    await mostrar();
  },

  async enviarGrupoAprovacao({ grupo }) {
    if (!podeUsuario('admin')) throw new Error('Só o administrador envia pagamentos para aprovação.');
    const g = estado.grupo;
    if (!g || g.grupoId !== grupo) throw new Error('Este pagamento preparado não está mais aqui. Prepare de novo.');
    const validos = g.itens.filter((it) => it.status === 'READ_DATA');
    if (!validos.length) throw new Error('Nenhum item foi validado pelo banco. Confira os códigos e prepare de novo.');
    const total = validos.reduce((t, it) => t + C.centavos(String(it.amount).replace('.', ',')), 0);
    const r = await janela({ titulo: 'Enviar para aprovação no app do C6', sim: 'Enviar para aprovação', forte: true,
      html: `<p>Conta que paga: <b>${esc(nomeConta(g.conta))}</b></p><ul>${validos.map((it) => `<li>${esc(it.description || '')} · ${esc(it.beneficiary_name || '')} · <b>${reais(C.centavos(String(it.amount).replace('.', ',')))}</b>${it.due_date ? ` · vence ${dataBr(it.due_date)}` : ''}</li>`).join('')}</ul>
        <p>Total: <b>${reais(total)}</b> em ${validos.length} pagamento(s).</p>
        ${g.itens.length > validos.length ? `<p class="texto-aviso">${g.itens.length - validos.length} item(ns) com erro ficam de fora.</p>` : ''}
        <p class="suave">Depois de enviado, o pagamento só acontece quando você aprovar no aplicativo do C6.</p>` });
    if (!r) return;
    const comErro = g.itens.filter((it) => it.status !== 'READ_DATA').map((it) => it.id);
    if (comErro.length) await P.removerItensDoGrupo(g.conta, g.grupoId, comErro);
    await P.enviarGrupoParaAprovacao(g.conta, g.grupoId, E.usuario ? E.usuario.nome : login());
    const { items } = await P.itensDoGrupo(g.conta, g.grupoId);
    const idsValidos = g.ids.filter((id) => validos.some((it) => new RegExp(`erp-${id}\\b`).test(it.description || '')));
    await alterar((db) => Z.registrarGrupoEnviado(db, idsValidos.length ? idsValidos : g.ids, g.grupoId, items || [], login()));
    estado.grupo = null;
    aviso('Enviado ao banco. Agora aprove no aplicativo do C6; depois busque o extrato e confirme o pagamento.', 'aviso');
    await mostrar();
  },

  async descartarGrupo({ grupo }) {
    const g = estado.grupo;
    if (g && g.grupoId === grupo) {
      await alterar((db) => g.ids.forEach((id) => { const p = R.buscar(db, 'pagamentos_banco', id); if (p && ['rascunho', 'validado', 'erro'].includes(p.situacao)) Z.cancelarPagamento(db, id, login()); }));
      estado.grupo = null;
    }
    await mostrar();
  },

  async atualizarSituacaoPagamento({ conta, grupo }) {
    if (!bancoAtivo()) throw new Error(TITULO_AGUARDANDO);
    const { items } = await P.itensDoGrupo(conta, grupo);
    const n = await alterar((db) => Z.atualizarSituacaoPagamentos(db, items || [], login()));
    aviso(n ? `${n} pagamento(s) com situação atualizada.` : 'Nada mudou no banco. Lembre: a confirmação final do pagamento sai no extrato.', n ? 'ok' : 'info');
    await mostrar();
  },

  async cancelarPagamentoBanco({ id }) {
    await alterar((db) => Z.cancelarPagamento(db, Number(id), login()));
    await mostrar();
  },

  async confirmarPagamentoPeloExtrato({ id }) {
    const p = pagamentos().find((x) => x.id === Number(id));
    if (!p) throw new Error('Pagamento não encontrado.');
    const ligadas = new Set(pagamentos().map((x) => x.movimentacao_id).filter(Boolean));
    const candidatas = movs().filter((m) => m.conta_id === p.conta_id && m.tipo === 'saida' && m.valor === p.valor && !ligadas.has(m.id) && !m.pagamento_banco_id)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));
    if (!candidatas.length) throw new Error(`Nenhuma saída de ${reais(p.valor)} na conta ${nomeConta(p.conta_id)}. Busque o extrato do mês na tela Banco e tente de novo.`);
    const r = await janela({ titulo: 'Qual saída do extrato é este pagamento?', sim: 'Confirmar pagamento',
      html: `<p>${esc(p.tipo_conta || '')} · <b>${reais(p.valor)}</b> · pagar em ${dataBr(p.data_pagamento)}</p>
        ${candidatas.map((m, n) => `<p><label><input type="radio" name="mov" value="${m.id}" ${n === 0 ? 'checked' : ''}> ${dataBr(m.data)} · ${esc(m.titulo || '')} ${esc(m.descricao || '')} · ${reais(m.valor)}${m.classificacao ? ` ${etiqueta(ROTULO_CURTO[m.classificacao] || m.classificacao, 'neutra')}` : ''}</label></p>`).join('')}` });
    if (!r || !r.mov) return;
    await alterar((db) => Z.marcarPagoPeloExtrato(db, p.id, Number(r.mov[0]), login()));
    aviso('Pagamento confirmado pelo extrato.');
    await mostrar();
  },
};

export const FORMULARIOS_BANCO = {
  async irMesBanco(form) {
    const f = Object.fromEntries(new FormData(form));
    ir(`#/banco?conta=${encodeURIComponent(f.conta)}&mes=${f.mes || C.competenciaDe(C.hojeIso())}`);
  },

  async registrarPagamentosBanco(form) {
    if (!opera()) throw new Error('Seu usuário não pode confirmar pagamentos.');
    const conf = estado.conferencia;
    const marcados = [...form.querySelectorAll('input[name="pag"]:checked')].map((el) => conf && conf.sugestoes[Number(el.value)]).filter(Boolean);
    if (!marcados.length) throw new Error('Marque pelo menos um boleto.');
    const total = marcados.reduce((t, s) => t + s.valor, 0);
    if (!confirm(`Registrar o pagamento de ${marcados.length} boleto(s), ${reais(total)} no total, com as datas em que o dinheiro entrou?`)) return;
    let n = 0;
    await alterar((db) => {
      for (const s of marcados) {
        const cb = R.buscar(db, 'cobrancas', s.cobranca_id);
        if (!cb || cb.data_pagamento) continue;
        const m = (db.movimentacoes_banco || []).find((x) => x.conta_id === conf.conta && x.tipo === 'entrada' && x.valor === s.valor && x.data === s.data_credito && !x.cobranca_id);
        Z.confirmarPagamentoPeloBanco(db, cb.id, { ...s, movimentacao_id: m ? m.id : null }, login());
        n += 1;
      }
    });
    estado.conferencia = null;
    aviso(`${n} pagamento(s) registrado(s).`);
    await mostrar();
  },

  async pagarPeloBanco(form) {
    if (!opera()) throw new Error('Seu usuário não pode preparar pagamentos.');
    if (!bancoAtivo()) throw new Error(`${TITULO_AGUARDANDO}: configure o banco em Dados e backup.`);
    const f = Object.fromEntries(new FormData(form));
    const i = buscar('imoveis', Number(f.imovel));
    if (!i) throw new Error('Imóvel não encontrado.');
    if (!f.conta) throw new Error('Escolha a conta que paga.');
    const itens = R.TIPOS_DESPESA.map((t, n) => ({ tipo_conta: f[`tipo_${n}`] || t, codigo: String(f[`codigo_${n}`] || '').trim(), valor: String(f[`valor_${n}`] || '').trim() ? C.centavos(f[`valor_${n}`]) : 0, data_pagamento: f[`data_${n}`] || C.hojeIso() }))
      .filter((x) => x.codigo || x.valor)
      .map((x) => ({ ...x, conta_id: f.conta, imovel_id: i.id, competencia: f.competencia }));
    if (!itens.length) throw new Error('Preencha o código e o valor de pelo menos uma conta.');
    for (const x of itens) {
      if (!x.codigo) throw new Error(`${x.tipo_conta}: informe o código de barras ou o Pix copia e cola.`);
      if (!(x.valor > 0)) throw new Error(`${x.tipo_conta}: informe o valor.`);
      if (x.data_pagamento < C.hojeIso()) throw new Error(`${x.tipo_conta}: a data de pagamento não pode ser no passado.`);
    }
    const ids = await alterar((db) => Z.prepararPagamentos(db, itens, login()));
    const itensC6 = itens.map((x, k) => ({ content: x.codigo, amount: (x.valor / 100).toFixed(2), description: `${i.nome} ${x.tipo_conta} ${compBr(x.competencia)} (erp-${ids[k]})`.slice(0, 100), transaction_date: x.data_pagamento }));
    let grupoId;
    let items = [];
    try {
      ({ group_id: grupoId } = await P.decodificarPagamentos(f.conta, itensC6));
      ({ items } = await P.itensDoGrupo(f.conta, grupoId));
    } catch (e) {
      throw new Error(`Os pagamentos ficaram como rascunho, mas o banco não respondeu: ${e.message}`);
    }
    await alterar((db) => Z.atualizarSituacaoPagamentos(db, items || [], login()));
    estado.grupo = { conta: f.conta, grupoId, ids, itens: items || [], imovel_id: i.id };
    const erros = (items || []).filter((it) => it.status !== 'READ_DATA').length;
    aviso(erros ? `${erros} item(ns) com erro: confira o código. Os demais estão validados.` : `${(items || []).length} pagamento(s) validado(s) pelo banco. Confira e envie para aprovação.`, erros ? 'aviso' : 'ok');
    await mostrar();
  },
};
