// Tela Gestão (#/gestao?mes=AAAA-MM): os números do mês para o dono (gestao.js), cada um com a lista que o compõe
// (?filtro=…), comparados com o mês anterior, e o "Relatório em PDF" de uma página. Carregada só quando usada (ADIADOS do sw.js).
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import * as K from '../contratos.js';
import { esc } from '../formularios.js';
import * as G from '../gestao.js';
import * as R from '../regras.js';
import { botao, buscar, d, etiqueta, link } from './comum.js';
import { pdfDoDocumento } from './documentos.js';
import { abasFinanceiro } from './financeiro.js';

const pctTexto = (n) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const nomeImovel = (c) => (buscar('imoveis', c.imovel_id) || {}).nome || '';
const inquilino = (c) => `<a href="#/contrato/${c.id}"><b>${esc(nomeImovel(c))}</b></a><br>${esc(c.inquilino_nome || '')}`;

/**
 * Comparação com o mês anterior: "out/2026: 3 (▲ 1)". ``piorSeSobe``: subir é ruim (inadimplência, vagos) e fica em
 * laranja; null quando subir não é bom nem ruim (reajustes, contratos a vencer).
 */
function comparar(atual, antes, mesAntes, fmt = String, piorSeSobe = null) {
  const dif = atual - antes;
  const seta = dif > 0 ? `▲ ${fmt(dif)}` : dif < 0 ? `▼ ${fmt(-dif)}` : 'igual';
  const pior = piorSeSobe === null || !dif ? false : (dif > 0) === piorSeSobe;
  return `<div class="suave">${compBr(mesAntes)}: ${fmt(antes)} <span class="${pior ? 'texto-aviso' : dif && piorSeSobe !== null ? 'texto-ok' : ''}">(${seta})</span></div>`;
}

/** Cartão de um número: o número grande, o que é, a comparação e o botão da lista. */
const cartao = (grande, texto, extra, href, rotulo = 'Ver a lista') => `<div class="cartao"><div class="grande">${grande}</div>${texto}${extra}
  <div style="margin-top:6px">${link(href, rotulo)}</div></div>`;

/** Os números da tela e do PDF, já em texto: [chave, título, valor do mês, valor do mês anterior, explicação]. */
function linhasDoResumo(g) {
  const b = g.boletos; const a = g.boletosAnterior;
  return [
    ['inadimplencia', 'Inadimplência (boletos que vencem no mês)', `${pctTexto(b.pct)} · ${reais(b.emAtraso)}`, `${pctTexto(a.pct)} · ${reais(a.emAtraso)}`, `em atraso hoje, do valor dos boletos do mês (${reais(b.previsto)})`],
    ['atrasados', 'Inquilinos com boleto do mês em atraso', String(b.inquilinos), String(a.inquilinos), `em atraso hoje, de qualquer mês: ${g.emAtrasoHoje.inquilinos} (${reais(g.emAtrasoHoje.total)})`],
    ['recebido', 'Recebido x previsto (boletos que vencem no mês)', `${reais(b.recebido)} de ${reais(b.previstoEmDia)}`, `${reais(a.recebido)} de ${reais(a.previstoEmDia)}`, `previsto = valor pago em dia; entrou no mês (todos os boletos pagos nele): ${reais(b.entrou)}`],
    ['nfs', 'NFs emitidas', `${g.nfs.qtd} · ${reais(g.nfs.valor)}`, `${g.nfsAnterior.qtd} · ${reais(g.nfsAnterior.valor)}`, g.nfs.aguardando ? `${g.nfs.aguardando} pagamento(s) do mês aguardando número` : 'nenhum pagamento do mês aguardando número'],
    ['vagos', 'Imóveis vagos', `${g.vagos.length} de ${g.imoveis}`, String(g.vagosAnterior), g.vagos.length ? `vago há mais tempo: ${esc(g.vagos[0].imovel.nome)}${g.vagos[0].dias !== null ? ` (${g.vagos[0].dias} dias)` : ''}` : 'todos alugados'],
    ['vencer', `Contratos que vencem em até ${G.JANELA_VENCIMENTO} dias`, String(g.vencer.aVencer), String(g.vencerAnterior), g.vencer.vencidos ? `${g.vencer.vencidos} já venceram sem renovação` : 'nenhum vencido sem renovação'],
    ['reajustes', `Reajustes do aluguel de ${compBr(g.mes)}`, `${g.reajustes.lista.length} (${g.reajustes.feitos} aplicados)`, String(g.reajustesAnterior.lista.length), `${compBr(g.proximo)}: ${g.reajustesProximo.lista.length} reajuste(s)`],
    ['caucao', 'Caução e depósito guardados (hoje)', reais(g.caucao.total), '-', `${g.caucao.inquilinos} inquilino(s); aplicado ${reais(g.caucao.aplicado)}`],
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Listas que compõem cada número (?filtro=…)
// ---------------------------------------------------------------------------------------------------------------------
const nada = (n, texto) => `<tr><td colspan="${n}" class="suave">${texto}</td></tr>`;

function listaInadimplencia(g) {
  const l = [...g.boletos.atrasados].sort((x, y) => y.dias - x.dias);
  return `<h2>Boletos que vencem em ${compBr(g.mes)} e estão em atraso hoje (${l.length})</h2><div class="rolagem"><table><tr><th>Imóvel / inquilino</th><th>Boleto</th><th class="n">Dias de atraso</th><th class="n">Valor do boleto</th><th class="n">Hoje, com multa e juros</th></tr>
    ${l.map((x) => `<tr><td>${inquilino(x.contrato)}</td><td><a href="#/cobranca/${x.cobranca.id}">${R.ehParcelaAcordo(x.cobranca) ? esc(`acordo ${x.cobranca.acordo_parcela || ''}`.trim()) : compBr(x.cobranca.competencia)}</a> <span class="suave">venceu ${dataBr(x.cobranca.vencimento)}</span></td>
      <td class="n">${x.dias}</td><td class="n">${reais(x.valor)}</td><td class="n">${reais(x.hojeValor)}</td></tr>`).join('') || nada(5, 'Nenhum boleto do mês em atraso. 🎉')}</table></div>
    <p class="suave">Para cobrar ou fazer acordo, use a aba ${link('#/inadimplencia', 'Inadimplência', '')} (lá estão todos os atrasados, de qualquer mês).</p>`;
}

function listaRecebido(g, nfs) {
  const b = g.boletos;
  const grupos = [['Pagos', b.pagos], ['Em atraso', b.atrasados.map((x) => x.cobranca)], ['A vencer', b.aVencer], ['Descontados da garantia ou de contrato encerrado', b.outros]];
  const linha = (cb) => { const c = buscar('contratos', cb.contrato_id) || {}; const t = R.totais(cb); const fs = nfs.nfs('cobranca', cb.id);
    return `<tr><td>${c.id ? inquilino(c) : ''}</td><td><a href="#/cobranca/${cb.id}">${R.ehParcelaAcordo(cb) ? esc(`acordo ${cb.acordo_parcela || ''}`.trim()) : compBr(cb.competencia)}</a> <span class="suave">vence ${dataBr(cb.vencimento)}</span></td>
      <td class="n">${reais(t.a_pagar_pontual)}</td><td class="n">${cb.data_pagamento ? `${reais(cb.valor_pago || 0)}<br><span class="suave">${dataBr(cb.data_pagamento)}</span>` : '-'}</td>
      <td>${fs.length ? fs.map((f) => `nº ${R.numeroFatura(f.numero)}`).join(', ') : cb.data_pagamento && cb.valor_nf > 0 && R.geraNf(c) ? etiqueta('aguardando número', 'aviso') : '<span class="suave">-</span>'}</td></tr>`; };
  return `<h2>Boletos que vencem em ${compBr(g.mes)} (${b.boletos.length})</h2><div class="rolagem"><table><tr><th>Imóvel / inquilino</th><th>Boleto</th><th class="n">Previsto (em dia)</th><th class="n">Pago</th><th>NF</th></tr>
    ${grupos.filter(([, l]) => l.length).map(([titulo, l]) => `<tr class="grupo-mes"><th colspan="5">${titulo} (${l.length})</th></tr>${l.map(linha).join('')}`).join('') || nada(5, 'Nenhum boleto vence neste mês.')}</table></div>
    <p class="suave">Previsto: o que entraria com todos pagando em dia (com a bonificação). Ficam fora o complemento da caução, a carência e o boleto trocado por acordo (as parcelas do acordo entram no mês em que vencem).</p>`;
}

function listaVagos(g) {
  return `<h2>Imóveis vagos em ${dataBr(g.dia)} (${g.vagos.length})</h2><div class="rolagem"><table><tr><th>Imóvel</th><th>Vago desde</th><th class="n">Dias vago</th><th>Próximo inquilino</th></tr>
    ${g.vagos.map((x) => `<tr><td><a href="#/imovel/${x.imovel.id}"><b>${esc(x.imovel.nome)}</b></a></td><td>${x.desde ? dataBr(x.desde) : '<span class="suave">nunca alugado</span>'}</td>
      <td class="n">${x.dias !== null ? x.dias : '-'}</td><td>${x.proximo ? `<a href="#/contrato/${x.proximo.id}">${esc(x.proximo.inquilino_nome)}</a> <span class="suave">entra em ${dataBr(x.proximo.data_entrada)}</span>` : '<span class="suave">-</span>'}</td></tr>`).join('') || nada(4, 'Nenhum imóvel vago.')}</table></div>`;
}

function listaVencer(g) {
  return `<h2>Contratos que vencem até ${dataBr(C.somarDias(g.dia, G.JANELA_VENCIMENTO))} (${g.vencer.lista.length})</h2><div class="rolagem"><table><tr><th>Imóvel / inquilino</th><th>Fim do contrato</th><th class="n">Faltam</th></tr>
    ${g.vencer.lista.map((x) => `<tr><td>${inquilino(x.contrato)}</td><td>${dataBr(x.fim)}</td><td class="n">${x.faltam < 0 ? etiqueta(`venceu há ${-x.faltam} dia(s)`, 'aviso') : `${x.faltam} dia(s)`}</td></tr>`).join('') || nada(3, 'Nenhum contrato vence nos próximos dias.')}</table></div>
    <p class="suave">Contratos de prazo determinado, sem saída informada. Para renovar (nova data ou prazo indeterminado, com o novo valor), abra o inquilino.</p>`;
}

function listaReajustes(g) {
  const tabela = (r) => `<h3>Aluguel de ${compBr(r.mes)} (${r.lista.length})</h3><div class="rolagem"><table><tr><th>Imóvel / inquilino</th><th>Reajuste</th><th>Situação</th></tr>
    ${r.lista.map((x) => `<tr><td>${inquilino(x.contrato)}</td><td>${x.anos}º ano</td><td>${x.corrigido ? etiqueta(`aplicado: ${reais(x.corrigido.valor_novo)}`, 'ok') : etiqueta('a aplicar', 'aviso')}</td></tr>`).join('') || nada(3, 'Nenhum reajuste.')}</table></div>`;
  return `<h2>Reajustes</h2>${tabela(g.reajustes)}${tabela(g.reajustesProximo)}<p class="suave">Para aplicar a correção e gerar a carta, use a tela ${link('#/reajustes', 'Reajustes', '')}.</p>`;
}

const LISTAS = { inadimplencia: listaInadimplencia, recebido: listaRecebido, vagos: listaVagos, vencer: listaVencer, reajustes: listaReajustes };

// ---------------------------------------------------------------------------------------------------------------------
// Tela e PDF
// ---------------------------------------------------------------------------------------------------------------------
export function telaGestao(q) {
  const hoje = C.hojeIso();
  const atual = C.competenciaDe(hoje);
  const pedido = C.competenciaValida(q.mes, atual);
  const mes = pedido > atual ? atual : pedido;
  const nfs = R.indiceFaturas(d()); // uma vez por desenho (lista do recebido e NFs aguardando número)
  const g = G.numerosDaGestao(d(), mes, hoje, nfs);
  const b = g.boletos; const a = g.boletosAnterior;
  const aqui = (filtro) => `#/gestao?mes=${mes}&filtro=${filtro}&ir=lista`;
  const lista = LISTAS[q.filtro];
  return `<h1>Gestão</h1>${abasFinanceiro('gestao')}
    <div class="cabecalho"><h2>Números de ${compBr(mes)}</h2>
      <div class="acoes"><a class="botao secundario" href="#/gestao?mes=${g.anterior}">← ${compBr(g.anterior)}</a>
      <form data-form="ir" data-ir="gestao" class="acoes"><input type="month" name="mes" value="${esc(mes)}" max="${atual}" style="width:160px"><button class="secundario">Ir</button></form>
      ${mes < atual ? `<a class="botao secundario" href="#/gestao?mes=${g.proximo}">${compBr(g.proximo)} →</a>` : ''}
      ${botao('relatorioGestao', 'Relatório em PDF', { mes }, '')}</div></div>
    <div class="numeros numeros-largos">
      ${cartao(pctTexto(b.pct), `inadimplência · ${reais(b.emAtraso)} de ${reais(b.previsto)}`, comparar(b.pct, a.pct, g.anterior, pctTexto, true), aqui('inadimplencia'))}
      ${cartao(b.inquilinos, 'inquilino(s) com boleto do mês em atraso', comparar(b.inquilinos, a.inquilinos, g.anterior, String, true), aqui('inadimplencia'))}
      ${cartao(g.emAtrasoHoje.inquilinos, `em atraso hoje, de qualquer mês · ${reais(g.emAtrasoHoje.total)}`, '', '#/inadimplencia', 'Ver na Inadimplência')}
      ${cartao(reais(b.recebido), `recebido de ${reais(b.previstoEmDia)} previsto (${pctTexto(b.pctRecebido)})`, comparar(b.pctRecebido, a.pctRecebido, g.anterior, pctTexto, false), aqui('recebido'))}
      ${cartao(g.nfs.qtd, `NF(s) emitida(s) · ${reais(g.nfs.valor)}${g.nfs.aguardando ? `<br>${etiqueta(`${g.nfs.aguardando} aguardando número`, 'aviso')}` : ''}`, comparar(g.nfs.qtd, g.nfsAnterior.qtd, g.anterior), `#/faturas?mes=${mes}`, 'Ver as NFs')}
      ${cartao(g.vagos.length, `imóvel(is) vago(s) de ${g.imoveis}${g.vagos[0] && g.vagos[0].dias !== null ? `<br><span class="suave">o mais antigo há ${g.vagos[0].dias} dias</span>` : ''}`, comparar(g.vagos.length, g.vagosAnterior, g.anterior, String, true), aqui('vagos'))}
      ${cartao(g.vencer.aVencer, `contrato(s) vencem em até ${G.JANELA_VENCIMENTO} dias${g.vencer.vencidos ? `<br>${etiqueta(`${g.vencer.vencidos} já venceram`, 'aviso')}` : ''}`, comparar(g.vencer.aVencer, g.vencerAnterior, g.anterior), aqui('vencer'))}
      ${cartao(g.reajustes.lista.length, `reajuste(s) em ${compBr(mes)} (${g.reajustes.feitos} aplicados)<br><span class="suave">${compBr(g.proximo)}: ${g.reajustesProximo.lista.length}</span>`, comparar(g.reajustes.lista.length, g.reajustesAnterior.lista.length, g.anterior), aqui('reajustes'))}
      ${cartao(reais(g.caucao.total), `caução e depósito guardados hoje · ${g.caucao.inquilinos} inquilino(s)`, '', '#/garantias', 'Ver onde está')}
    </div>
    ${lista ? `<div class="cartao" id="lista">${lista(g, nfs)}<p>${link(`#/gestao?mes=${mes}`, 'Fechar a lista')}</p></div>` : ''}
    <p class="suave">Inadimplência e recebido contam os boletos pelo mês do vencimento, com a situação de hoje (um boleto de ${compBr(g.anterior)} pago hoje deixa de contar como atraso). Vagos e contratos a vencer: em ${dataBr(g.dia)}${mes < atual ? ' (último dia do mês)' : ' (hoje)'}; no mês anterior, no último dia dele. A caução é a de hoje.</p>`;
}

/** Folha do relatório (uma página): empresa, título, a tabela dos números com o mês anterior, e a data. */
function relatorioHtml(g) {
  const e = (d().emitentes || []).find((x) => x.ativo !== false) || {};
  return `<div class="carta relatorio-gestao">
    ${d().logo ? `<p class="ct-capa"><img src="${esc(d().logo)}" alt="Logo"></p>` : ''}
    ${e.nome ? `<p style="text-align:center"><b>${esc(e.razao_social || e.nome)}</b></p>` : ''}
    <h2 style="text-align:center;margin:14px 0">RESUMO DE GESTÃO · ${esc(compBr(g.mes).toLocaleUpperCase('pt-BR'))}</h2>
    <table class="carta-tabela" style="width:100%;font-size:13px"><tr><th style="text-align:left">Número</th><th class="n">${esc(compBr(g.mes))}</th><th class="n">${esc(compBr(g.anterior))}</th></tr>
      ${linhasDoResumo(g).map(([, titulo, agora, antes, obs]) => `<tr><td style="white-space:normal">${esc(titulo)}<br><span style="color:#555;font-size:12px">${obs}</span></td><td class="n nw"><b>${esc(agora)}</b></td><td class="n nw">${esc(antes)}</td></tr>`).join('')}</table>
    <p style="font-size:12px;color:#555">Inadimplência e recebido: boletos pelo mês do vencimento, com a situação de ${dataBr(g.hoje)}. Vagos e contratos a vencer: em ${dataBr(g.dia)} (mês anterior: ${dataBr(g.diaAnterior)}). Caução: hoje.</p>
    <p class="carta-data">${esc(K.dataPorExtenso(g.hoje, { zero: false }))}.</p></div>`;
}

/** PDF do resumo do mês (desenhado fora da tela, como os recibos): { blob, nome }. */
export async function pdfDaGestao(mes) {
  const hoje = C.hojeIso();
  const g = G.numerosDaGestao(d(), C.competenciaValida(mes, C.competenciaDe(hoje)), hoje);
  const caixa = document.createElement('div');
  caixa.className = 'impressao';
  caixa.style.cssText = 'position:absolute;left:-10000px;top:0;width:860px';
  caixa.innerHTML = relatorioHtml(g);
  document.body.append(caixa);
  try {
    return { blob: await pdfDoDocumento(caixa.querySelector('.carta'), [], { margemLado: 15 }), nome: `Resumo de gestao ${g.mes}.pdf` };
  } finally {
    caixa.remove();
  }
}

/** Para os testes: a folha do relatório e as linhas do resumo. */
export const _relatorioHtml = (mes, hoje = C.hojeIso()) => relatorioHtml(G.numerosDaGestao(d(), mes, hoje));
export { linhasDoResumo };
