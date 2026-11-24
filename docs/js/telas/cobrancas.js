// Boletos: lista do mês (#/cobrancas), página do boleto (#/cobranca/ID), baixa em lote, ajuste do mês e demonstrativo.
import * as AJ from '../ajuda.js';
import * as C from '../calculos.js';
import { rotuloDocumento } from '../contratos.js';
import { compBr, dataBr, pct, reais } from '../calculos.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { filaRegua } from '../regua-email.js';
import { botoesMesC6, caixaBancoC6, resumoBancoLinha } from './banco-c6.js';
import { ACEITA_DOCUMENTOS, arquivoSumiu, botao, buscar, d, endereco, etiqueta, item, link, memoria, multaJurosTexto, opera, situacao } from './comum.js';
import { ultimoEnvio } from './emails.js';
import { AVISO_CONTROLE, seloControle, situacaoBoleto } from './contrato.js';
import { linkComprovante } from './cadastros.js';
import { caixaProvasBoleto } from './cobranca-provas.js';
import { nomeArquivoDoc } from './documentos.js';
import { formNfExterna } from './faturas.js';

// --------------------------------------------------------------------------
// Cobranças do mês
// --------------------------------------------------------------------------
/**
 * Boleto pago a mais (entrou de novo) e devolução ao inquilino (decisão do dono, 17/11/2026): as linhas do extrato ligadas a ele,
 * o que ainda falta devolver e o lembrete de que a NF não muda. Ex.: recebido R$ 4.000,00 de R$ 2.000,00 → "falta devolver R$ 2.000,00".
 */
function pagoAMaisHtml(cb) {
  const linhas = (d().movimentacoes_banco || []).filter((m) => m.cobranca_id === cb.id && (m.pago_a_mais || m.classificacao === 'devolucao_inquilino'));
  if (!linhas.length && !cb.valor_a_mais && !cb.valor_devolvido) return '';
  const falta = cb.valor_a_mais ? R.pagoAMaisDo(cb) : 0;
  const lista = linhas.sort((a, b) => String(a.data).localeCompare(String(b.data))).map((m) => `<li><a href="#/banco?conta=${esc(m.conta_id)}&mes=${String(m.data).slice(0, 7)}">${dataBr(m.data)} · ${m.pago_a_mais ? 'entrou de novo (a mais)' : 'devolvido ao inquilino'} · ${reais(m.valor)}</a></li>`).join('');
  return `<div class="alerta ${falta ? 'aviso' : 'info'}"><b>${falta ? `Pago a mais: falta devolver ${reais(falta)} ao inquilino` : 'Pago a mais e devolvido'}</b> (devido ${reais(R.devidoDoPago(cb))}). A NF não muda.
    ${lista ? `<ul style="margin:6px 0 0">${lista}</ul>` : ''}${falta ? `<p class="suave">Quando devolver, dê à saída do extrato o destino "Devolução ao inquilino" (tela Banco). Devolveu por fora do extrato (outra conta, dinheiro)? Marque aqui:</p>
    ${opera() ? `<form data-form="devolvidoAMao" data-id="${cb.id}" class="acoes"><input type="date" name="data" value="${C.hojeIso()}" aria-label="Dia da devolução"><button class="secundario pequeno">Devolvi ${reais(falta)}</button></form>` : ''}` : ''}</div>`;
}

/**
 * Pagamento em parte de antes de 2026-11-20 (dado antigo; desde então o pagamento a menos é recusado): quanto faltou e onde foi
 * cobrado. Ex.: pagou R$ 2.000,00 de R$ 2.700,00 → "Faltaram R$ 700,00: cobrados no boleto de 09/2026" (com o link). No boleto
 * de destino, de onde vieram as diferenças que ele cobra.
 */
function diferencaHtml(cb) {
  const partes = [];
  if (cb.diferenca_devida > 0) {
    const destino = cb.diferenca_no_boleto && buscar('cobrancas', cb.diferenca_no_boleto);
    const c = buscar('contratos', cb.contrato_id);
    const onde = destino ? `cobrados no boleto de ${link(`#/cobranca/${destino.id}`, compBr(destino.competencia))}${destino.data_pagamento ? ` (pago em ${dataBr(destino.data_pagamento)})` : ''}`
      : c && c.ativo === false ? 'sem boleto: entram nos débitos do cálculo final da saída' : 'aguardando o próximo boleto do aluguel (entram quando ele for gerado)';
    partes.push(`<b>Faltaram ${reais(cb.diferenca_devida)}</b>: ${onde}.`);
  }
  for (const e of cb.diferencas_cobradas || []) {
    const origem = buscar('cobrancas', e.cobranca_id);
    partes.push(`Este boleto cobra ${reais(e.valor)} que faltaram no boleto de ${origem ? link(`#/cobranca/${origem.id}`, compBr(origem.competencia)) : 'um mês anterior'} (pagamento em parte antigo): fica preso a ele, sem multa e juros por cima.`);
  }
  return partes.length ? `<div class="alerta aviso">${partes.join('<br>')}</div>` : '';
}

/**
 * Confirmação do pagamento: data contábil (entrada no banco, vira a data da NF), "pagou em dia" (compensou depois,
 * sem multa e juros) e, se atrasou de verdade, o dia em que pagou (multa e juros até esse dia, como o banco cobra).
 */
function formPagamento(cb) {
  const emDia = `<label class="check-mini" title="Pagou até o vencimento e o banco só compensou depois: sem multa e juros, com desconto"><input type="checkbox" name="em_dia" value="1"> pagou em dia</label>`;
  const caucao = R.ehComplementoCaucao(cb);
  const contrato = buscar('contratos', cb.contrato_id);
  // cada rótulo com o seu campo e os botões Hoje/Ontem num bloco (no celular, um por linha)
  return `<form data-form="pagamento" data-id="${cb.id}" class="pagamento"><div class="campo-pagamento"><label>Dia em que o dinheiro entrou na conta</label> <input type="date" name="data" value="${C.hojeIso()}">${F.atalhosData()}</div>
    ${caucao ? '' : `<div class="campo-pagamento"><label>Pagou em (se atrasou)</label> <input type="date" name="pagou" title="Opcional: dia em que o inquilino pagou. Em branco: o dia em que o dinheiro entrou">${F.atalhosData()}</div>`}
    <div class="campo-pagamento"><label>Valor recebido (opcional)</label> <input name="valor" inputmode="decimal" data-dinheiro placeholder="0,00">${caucao ? '' : emDia}</div><button>Confirmar pagamento</button></form>
    ${caucao ? `<p class="suave">Complemento da caução: sem NF e sem multa e juros. Só vale o valor exato do boleto (${reais(R.totais(cb).a_pagar_pontual)}); ao confirmar, a caução é corrigida.</p>`
    : `<p class="suave">${R.geraNf(contrato) ? 'O dia em que o dinheiro entrou na conta é a data de emissão da NF, e pode ser alguns dias depois do pagamento.' : 'Boleto de controle (inquilino sem NF): o pagamento só fica registrado.'} Marque "pagou em dia" quando o inquilino pagou até o vencimento (${dataBr(cb.vencimento)}${C.limitePagamento(cb.vencimento) !== cb.vencimento ? `, que não é dia útil: vale até ${dataBr(C.limitePagamento(cb.vencimento))}` : ''}) e o banco compensou depois: sem multa e juros. Se atrasou de verdade, o banco já cobra multa e juros no boleto${R.geraNf(contrato) ? ' e a NF sai com esse valor a mais' : ''}; informe o dia em que pagou para os juros baterem com o banco. Valor menor que o devido não é aceito: não existe pagamento em parte (para quitar, faça um acordo).</p>`}`;
}

/** Valor recebido diferente do previsto: descritivo do cálculo, justificativa e o valor da NF (vem o calculado, em vermelho, e precisa ser alterado). */
function formNfDivergente(cb, p) {
  const r = R.previstoNoPagamento(cb, p.data, p);
  const dif = p.valor - r.valor_devido;
  const ress = (cb.ressarcimento_na_nf && cb.ressarcimento ? ` − ressarcimento ${reais(cb.ressarcimento)}` : '') + (C.ajusteNaNf(cb) ? ` ${C.ajusteNaNf(cb) > 0 ? '+' : '−'} ajuste ${reais(Math.abs(C.ajusteNaNf(cb)))}` : '');
  const conta = r.pontual ? `aluguel ${reais(cb.aluguel)} − desconto ${reais(cb.desconto)}${ress}` : `aluguel ${reais(cb.aluguel)} + multa ${reais(r.multa)} + juros ${reais(r.juros)}${ress} (${C.plural(r.dias_atraso, 'dia')} de atraso, sem desconto)`;
  const aMais = dif > 0;
  return `<div class="alerta aviso"><b>Valor recebido diferente do previsto.</b> ${aMais ? `Pagou ${reais(dif)} a mais: confirmando com a NF no valor calculado, a diferença fica anotada como <b>a devolver ao inquilino</b>. Só altere a NF se o valor a mais fizer parte do aluguel.` : 'Confira o cálculo e informe o valor da NF (cálculo manual).'} Nada foi salvo ainda.</div>
    <div class="grade">${item('Dinheiro entrou na conta em (data da NF)', dataBr(p.data))}${item('Pagou em', dataBr(p.pagouEmDia ? cb.vencimento : p.dataPagou || p.data))}
      ${item('Previsto', reais(r.valor_devido))}${item('Recebido', `<b>${reais(p.valor)}</b>`)}${item('Diferença', `<b>${dif > 0 ? '+' : '−'}${reais(Math.abs(dif))}</b>`)}</div>
    <p><b>Cálculo da NF:</b> ${conta} = <b>${reais(r.valor_nf)}</b>. IPTU, seguro, tarifa e FCI não entram${cb.outros_na_nf ? '' : ', nem o ajuste do mês'}${(cb.multas_notificacao || []).length || (cb.diferencas_cobradas || []).length ? ' (a multa da notificação e a diferença antiga ficam sempre fora)' : ''}.</p>
    <form data-form="pagamentoNf" data-id="${cb.id}" class="formulario">
      <div class="largo"><label>Justificativa da divergência${aMais ? ' (opcional se a NF ficar no valor calculado)' : ''}</label><textarea name="justificativa" rows="2">${esc(p.justificativa)}</textarea><div class="ajuda">Fica só no sistema (histórico do boleto)</div></div>
      <div><label>Valor da NF</label><input name="valor_nf" inputmode="decimal" data-dinheiro value="${F.dinheiroTexto(r.valor_nf)}" data-calculado="${F.dinheiroTexto(r.valor_nf)}" class="valor-calculado">
        <div class="ajuda">${aMais ? 'Veio o valor calculado: deixe assim para anotar a diferença a devolver' : 'Veio o valor calculado: altere para o valor do cálculo manual'}</div></div>
      ${dif < 0 ? `<div class="largo alerta perigo">Pagou a menos: não existe pagamento em parte. Ao confirmar, o pagamento é recusado e o boleto continua em aberto (para quitar, faça um acordo).</div>` : ''}
      <div class="acoes" style="align-self:end"><button>Confirmar pagamento</button>${botao('cancelarPagamentoDivergente', 'Cancelar', {}, 'secundario')}</div></form>`;
}

const nomeI = (x) => (x.i ? x.i.nome : '');

/** Ordenações da lista de boletos (o padrão é a data de vencimento). */
const ORDENS_BOLETO = {
  vencimento: (a, b) => a.cb.vencimento.localeCompare(b.cb.vencimento) || nomeI(a).localeCompare(nomeI(b), 'pt-BR'),
  imovel: (a, b) => nomeI(a).localeCompare(nomeI(b), 'pt-BR'),
  inquilino: (a, b) => a.c.inquilino_nome.localeCompare(b.c.inquilino_nome, 'pt-BR'),
  valor: (a, b) => b.t.a_pagar_pontual - a.t.a_pagar_pontual,
};

/**
 * Baixa em lote separada por vencimento: só dá para confirmar juntos boletos que vencem no mesmo dia. Grupo já vencido pode ser
 * confirmado como "pagaram em dia" (o banco compensou depois) ou "pagaram atrasado em <dia>" (multa e juros até esse dia, no valor previsto).
 */
function caixaBaixaLote(lista, hoje) {
  const abertos = lista.filter((x) => R.aCobrar(x.cb));
  if (!abertos.length) return '';
  const grupos = [...new Set(abertos.map((x) => x.cb.vencimento))].sort().map((v) => [v, abertos.filter((x) => x.cb.vencimento === v)]);
  return `<details class="cartao baixa-lote"><summary><b>Baixa em lote</b> <span class="suave">· ${abertos.length} em aberto, separada por vencimento · clique para expandir</span></summary>
    ${grupos.map(([v, xs]) => `<form data-form="baixaLote" class="grupo-baixa">
      <div class="cabecalho"><div><b>Vencimento ${dataBr(v)}</b> ${C.vencido(v, hoje) ? etiqueta('vencido', 'perigo') : ''} <span class="suave">${xs.length} em aberto · ${reais(xs.reduce((t, x) => t + x.t.a_pagar_pontual, 0))}</span></div>
        <label class="check-mini"><input type="checkbox" data-marcar-grupo> marcar todos deste vencimento</label></div>
      <div class="lista-baixa">${xs.map((x) => `<label class="check-mini"><input type="checkbox" name="ids" value="${x.cb.id}"> ${esc(x.i.nome)} · ${esc(x.c.inquilino_nome)} · ${reais(x.t.a_pagar_pontual)}</label>`).join('')}</div>
      <div class="acoes">entraram em <input type="date" name="data" value="${hoje}" style="width:auto">${F.atalhosData()}
        ${C.vencido(v, hoje) ? `<label class="check-mini" title="Pagaram depois do vencimento: multa e juros até o dia em que pagaram"><input type="checkbox" name="atrasado" value="1" data-mostra="pagou-${v}"> pagaram atrasado, em</label> <input type="date" name="pagou" value="${hoje}" style="width:auto" data-grupo-mostra="pagou-${v}" hidden>` : ''}
        <button class="pequeno">Confirmar os marcados</button></div></form>`).join('')}
    <p class="suave">Sem "pagaram atrasado", a baixa é como pagos em dia (sem multa e juros). Valor recebido diferente do previsto: confirme um a um, pelo botão da linha.</p></details>`;
}

/** Filtros da tela de Boletos (parâmetro ``filtro``): os três primeiros olham todos os meses; "pagos" e "todos" só o mês escolhido. */
const FILTROS_BOLETO = {
  todos: { titulo: '', todosMeses: false, f: () => true },
  abertos: { titulo: 'Boletos em aberto', todosMeses: true, f: (x) => R.aCobrar(x.cb) },
  vencidos: { titulo: 'Boletos vencidos e não pagos', todosMeses: true, f: (x, hoje) => R.aCobrar(x.cb) && C.vencido(x.cb.vencimento, hoje) },
  // (pago com NF de R$ 0,00, ex.: carência só com IPTU e seguro, não espera NF: a mesma condição da fila da tela NF)
  semnf: { titulo: 'Boletos pagos ainda sem NF', todosMeses: true, f: (x) => x.cb.data_pagamento && R.geraNf(x.c) && !R.ehComplementoCaucao(x.cb) && (x.cb.valor_nf || 0) > 0 && !x.fs.length },
  pagos: { titulo: 'Boletos pagos', todosMeses: false, f: (x) => !!x.cb.data_pagamento },
};

/** Botão "E-mails da régua" no alto de Boletos (pedido do dono em 17/11/2026; antes ficava em Financeiro), com quantos esperam a autorização. */
function botaoRegua() {
  if (!opera()) return '';
  const n = filaRegua(d()).length;
  return link('#/regua', `E-mails da régua${n ? ` (${n})` : ''}`, 'botao secundario');
}

export function telaCobrancas(comp, ordemPedida = 'vencimento', filtroPedido = 'todos', buscaPedida = '') {
  const ordem = Object.hasOwn(ORDENS_BOLETO, String(ordemPedida)) ? ordemPedida : 'vencimento'; // a ordem vem do endereço: só as conhecidas
  const filtro = Object.hasOwn(FILTROS_BOLETO, String(filtroPedido)) ? filtroPedido : 'todos';
  const F_ = FILTROS_BOLETO[filtro];
  const busca = R.textoDeBusca(String(buscaPedida || '').slice(0, 80));
  const hoje = C.hojeIso();
  const url = (q) => `#/cobrancas?${new URLSearchParams({ comp, ordem, ...(filtro !== 'todos' ? { filtro } : {}), ...(busca ? { busca: String(buscaPedida).trim() } : {}), ...q })}`;
  // a página do boleto volta para esta lista (filtro, busca e ordem), não para o mês inteiro
  memoria.ultimaListaBoletos = { url: url({}), titulo: filtro !== 'todos' ? `${F_.titulo}${F_.todosMeses ? '' : ` de ${compBr(comp)}`}` : `Boletos de ${compBr(comp)}${busca ? ` (busca: ${String(buscaPedida).trim()})` : ''}` };
  // as NFs de cada boleto saem de um índice montado uma vez por desenho, e cada boleto é montado uma vez só
  const nfs = R.indiceFaturas(d());
  // boleto cujo contrato não está mais no banco (dado antigo ou exclusão pela metade) não derruba a tela: fica fora da lista, com aviso
  const semContrato = [];
  const montar = (cb) => {
    const c = buscar('contratos', cb.contrato_id);
    if (!c) { semContrato.push(cb); return null; }
    return { cb, c, i: buscar('imoveis', c.imovel_id), t: R.totais(cb), fs: nfs.nfs('cobranca', cb.id) };
  };
  const todasMontadas = d().cobrancas.map(montar).filter(Boolean);
  const avisoSemContrato = semContrato.length ? `<div class="alerta aviso">${semContrato.length} boleto(s) com contrato não encontrado no cadastro não aparecem na lista (${semContrato.slice(0, 8).map((cb) => `${compBr(cb.competencia)}, código ${Number(cb.id)}`).join('; ')}${semContrato.length > 8 ? '…' : ''}). Avise o suporte.</div>` : '';
  const doMes = todasMontadas.filter((x) => x.cb.competencia === comp);
  const todas = F_.todosMeses ? todasMontadas : doMes;
  const lista = todas.filter((x) => F_.f(x, hoje) && (!busca || [x.c.inquilino_nome, x.c.inquilino_apelido, x.i && x.i.nome].some((t) => R.textoDeBusca(t).includes(busca))))
    .sort(ORDENS_BOLETO[ordem] || ORDENS_BOLETO.vencimento);
  // contagem de cada filtro (todos os meses nos três primeiros, o mês nos outros) para os botões
  const conta = (k) => (FILTROS_BOLETO[k].todosMeses ? todasMontadas : doMes).filter((x) => FILTROS_BOLETO[k].f(x, hoje)).length;
  const filtros = `${avisoSemContrato}<div class="acoes barra-nf" style="margin-bottom:8px">${Object.entries(FILTROS_BOLETO).map(([k, x]) => `<a class="botao ${filtro === k ? '' : 'secundario'} pequeno" href="${url({ filtro: k })}">${k === 'todos' ? `Todos de ${compBr(comp)}` : `${x.titulo.replace('Boletos ', '').replace(/^./, (m) => m.toUpperCase())}`} (${conta(k)})</a>`).join(' ')}
    <form data-form="ir" data-ir="cobrancas" class="acoes" style="flex-wrap:nowrap"><input type="hidden" name="comp" value="${esc(comp)}"><input type="hidden" name="ordem" value="${esc(ordem)}">${filtro !== 'todos' ? `<input type="hidden" name="filtro" value="${esc(filtro)}">` : ''}<input name="busca" value="${esc(String(buscaPedida || ''))}" placeholder="Inquilino ou imóvel" style="width:200px"><button class="secundario pequeno">Buscar</button>${busca ? `<a class="botao secundario pequeno" href="${url({ busca: '' }).replace(/&busca=[^&]*/, '')}">Limpar</a>` : ''}</form></div>`;
  if (filtro !== 'todos') {
    // lista de trabalho (em aberto, vencidos, sem NF, pagos): sem as caixas do mês (gerar boletos, caução, recálculo)
    const soma = (f) => lista.filter((x) => R.geraNf(x.c)).reduce((s, x) => s + f(x), 0);
    return `<div class="cabecalho"><h1>${F_.titulo}${F_.todosMeses ? ' <span class="suave">· todos os meses</span>' : ` de ${compBr(comp)}`}</h1>
        <div class="acoes">${link(url({ filtro: 'todos' }), `← Boletos de ${compBr(comp)}`, 'botao secundario')} ${botaoRegua()}</div></div>
      ${filtros}
      ${filtro === 'vencidos' ? `<p class="suave">Aqui entram todos os boletos vencidos e não pagos, também os de inquilinos que já saíram (com o cálculo final feito). A tela ${link('#/inadimplencia', 'Inadimplência', '')} mostra só os inquilinos em cobrança, por isso os números podem ser diferentes.</p>` : ''}
      ${filtro === 'semnf' && lista.length && opera() ? `<div class="alerta info">${C.plural(lista.length, 'pagamento aguardando', 'pagamentos aguardando')} número de NF. ${link('#/faturas', 'Numerar na tela NF', 'botao pequeno')}</div>` : ''}
      ${opera() && ['abertos', 'vencidos'].includes(filtro) ? caixaBaixaLote(lista, hoje) : ''}
      ${tabelaBoletos(lista, hoje, ordem, url, { comp: true, totalLinha: lista.length ? `<tr class="total"><td></td><td colspan="2">Total</td><td class="n">${reais(soma((x) => x.t.a_pagar_pontual))}</td><td></td><td></td><td></td><td class="n">${reais(soma((x) => x.cb.valor_nf || 0))}</td><td></td></tr>` : '' })}`;
  }
  // contratos do mês sem boleto: olha todos os boletos do mês (não só os que a busca deixou na tela); a troca de titular que
  // espera o termo assinado não gera boleto de propósito e tem aviso próprio
  const semBoleto = d().contratos.filter((c) => c.ativo !== false && c.imovel_id && C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0 && !doMes.some((x) => x.c.id === c.id && !R.ehBoletoAvulso(x.cb)));
  const aguardaTermo = semBoleto.filter((c) => R.trocaAguardaAditivo(d(), c));
  const faltando = semBoleto.filter((c) => !R.trocaAguardaAditivo(d(), c));
  const caucoes = R.complementosCaucaoPendentes(d(), comp);
  // só os pagamentos deste mês que esperam número (os de outros meses aparecem nos meses deles e na tela NF)
  const pend = R.pendentesDeFatura(d(), nfs).filter((p) => p.tipo === 'cobranca' && p.registro.competencia === comp);
  // boleto de controle (inquilino sem NF) e boleto em acordo (não se cobra mais: valem as parcelas) não entram nas somas
  const soma = (f) => lista.filter((x) => R.geraNf(x.c) && !R.emAcordo(x.cb)).reduce((s, x) => s + f(x), 0);
  const controle = lista.filter((x) => !R.geraNf(x.c)).length;
  const emAcordo = lista.filter((x) => R.geraNf(x.c) && R.emAcordo(x.cb)).length;
  const foraDaSoma = [controle && `${controle} boleto(s) de controle`, emAcordo && `${emAcordo} em acordo`].filter(Boolean).join(' e ');
  // reajuste neste aluguel: corrigir antes e mandar a carta junto com este boleto (o índice sai no começo do mês)
  const reajustes = new Map(lista.filter((x) => !R.ehBoletoAvulso(x.cb)).map((x) => [x.c.id, R.reajusteNaCompetencia(d(), x.c, comp)]).filter(([, r]) => r && r.faltaCarta));
  const semCorrecao = [...reajustes.values()].filter((r) => !r.corrigido).length;
  return `<div class="cabecalho"><h1>Boletos de ${compBr(comp)}</h1>
      <div class="acoes"><a class="botao secundario" href="${url({ comp: C.somarMeses(comp, -1) })}">← ${compBr(C.somarMeses(comp, -1))}</a>
      <form data-form="ir" data-ir="cobrancas" class="acoes mes-boletos"><input type="hidden" name="ordem" value="${esc(ordem)}"><input type="month" name="comp" value="${esc(comp)}" class="campo-mes" placeholder="MM/AAAA"><button class="secundario">Ir</button></form>
      <a class="botao secundario" href="${url({ comp: C.somarMeses(comp, 1) })}">${compBr(C.somarMeses(comp, 1))} →</a> ${botaoRegua()}</div></div>
    <p class="suave">O mês de referência é o mês do aluguel (o boleto do aluguel de novembro vence em dezembro). Ao receber, clique em "Confirmar pagamento" na linha e informe a data. Depois, numere as NFs: a numeração segue a ordem das datas de pagamento.</p>
    ${filtros}
    ${reajustes.size ? `<div class="alerta aviso"><b>Reajuste</b> ${reajustes.size} inquilino(s) têm o aluguel de ${compBr(comp)} corrigido: envie a carta de reajuste junto com o boleto deste mês (botão "Gerar carta" na linha).${semCorrecao ? ` <b>${semCorrecao} ainda sem a correção aplicada</b>: informe o índice e aplique a correção (os boletos em aberto são recalculados).` : ''} ${link('#/reajustes', 'Ver reajustes')}</div>` : ''}
    ${faltando.length && opera() ? `<div class="alerta aviso">${C.plural(faltando.length, 'contrato', 'contratos')} ainda sem boleto neste mês: ${faltando.map((c) => esc(c.inquilino_nome)).join(', ')}. ${botao('gerarCobrancas', `Gerar boletos de ${compBr(comp)}`, { comp }, 'pequeno')}</div>` : ''}
    ${aguardaTermo.length && opera() ? `<div class="alerta aviso">${aguardaTermo.map((c) => `${link(`#/contrato/${c.id}?ir=aditivos`, esc(c.inquilino_nome))}: falta anexar o termo da troca de titular assinado para gerar o boleto (até lá, o contrato é de ${esc((R.contratoHerdado(d(), c) || {}).inquilino_nome || 'quem sai')}).`).join('<br>')}</div>` : ''}
    ${caucoes.length && opera() ? `<div class="alerta aviso"><b>Complemento da caução</b> (aluguel corrigido) ainda sem boleto: gere na tela Reajustes, em "Caução a completar" (boleto separado, sem tarifa e sem NF).
      ${caucoes.map((x) => `<div class="acoes" style="margin-top:6px">${esc(x.contrato.inquilino_nome)}: caução de ${reais(x.atual)} para ${reais(x.necessaria)}
        ${link(`#/reajustes?contrato=${x.contrato.id}`, `Completar ${reais(x.complemento)} em Reajustes`, 'botao pequeno')}</div>`).join('')}</div>` : ''}
    ${opera() && lista.some((x) => !x.cb.data_pagamento) ? `<p class="acoes">${botao('recalcularMes', `Recalcular boletos em aberto de ${compBr(comp)} pelo cadastro`, { comp }, 'secundario pequeno', 'Recalcular os boletos em aberto deste mês com os valores atuais do cadastro? Nos boletos alterados à mão, os valores digitados ficam; o resto é recalculado.')}</p>` : ''}
    ${pend.length && opera() ? `<div class="alerta info">${C.plural(pend.length, 'pagamento', 'pagamentos')} de ${compBr(comp)} aguardando número de NF. ${link('#/faturas', 'Numerar na tela NF', 'botao pequeno')}</div>` : ''}
    ${opera() ? caixaBaixaLote(lista, hoje) : ''}
    ${lista.length ? `<p class="acoes">${botoesMesC6(comp)}</p>` : ''}
    ${tabelaBoletos(lista, hoje, ordem, url, { comp: false, mes: comp, reajustes, vazio: !todas.length && !busca ? mesSemBoletos(comp, faltando) : '', totalLinha: lista.length ? `<tr class="total"><td></td><td colspan="2">Total${foraDaSoma ? ` <span class="suave">(sem ${foraDaSoma})</span>` : ''}</td><td class="n">${reais(soma((x) => x.t.a_pagar_pontual))}</td><td></td><td></td><td></td><td class="n">${reais(soma((x) => x.cb.valor_nf || 0))}</td><td></td></tr>` : '' })}`;
}

/** Mês sem nenhum boleto: o próximo passo (cadastrar o contrato ou gerar os boletos do mês). */
function mesSemBoletos(comp, faltando) {
  const titulo = `Nenhum boleto gerado para ${compBr(comp)}.`;
  if (!d().contratos.length) {
    return AJ.proximoPasso(titulo, `O boleto sai do contrato do inquilino: cadastre ${d().imoveis.length ? 'o contrato' : 'o imóvel e depois o contrato'} primeiro.`,
      [opera() && (d().imoveis.length ? ['#/novo/contratos', 'Cadastrar o contrato'] : ['#/novo/imoveis', 'Cadastrar o primeiro imóvel'])]);
  }
  if (faltando.length) {
    return AJ.proximoPasso(titulo, `${faltando.length} contrato(s) têm aluguel neste mês. Clique no botão: o sistema calcula o valor de cada boleto (aluguel, IPTU, seguro e descontos), e você confere antes de mandar.`,
      [opera() && botao('gerarCobrancas', `Gerar boletos de ${compBr(comp)}`, { comp }, 'pequeno')]);
  }
  return AJ.proximoPasso(titulo, 'Nenhum contrato tem aluguel neste mês (ex.: inquilino que entra depois ou que já saiu). Veja outro mês nas setas acima.');
}

/**
 * Tabela dos boletos (lista do mês e listas filtradas). ``opcoes.comp``: mostra a competência na 1ª coluna (listas de vários meses);
 * ``opcoes.reajustes``: Map contrato → reajuste do mês (só na lista do mês). O pagamento é confirmado numa janela (botão da linha).
 */
function tabelaBoletos(lista, hoje, ordem, url, opcoes = {}) {
  const { reajustes = new Map(), totalLinha = '' } = opcoes;
  const envios = enviosDosBoletos();
  const comp = opcoes.mes || (lista.length ? lista[0].cb.competencia : C.competenciaDe(hoje)); // lista vazia: o mês da tela
  // botões de impressão em cima e embaixo da lista; no celular, só embaixo, e os "selecionados" numa barra presa no pé
  // da tela que aparece ao marcar um boleto (atualizarBarraLote, app.js)
  const todos = opcoes.comp ? '' : `<a class="botao secundario" href="#/imprimir/demonstrativos?comp=${esc(comp)}">Imprimir todos os demonstrativos do mês</a>`;
  const selecionados = `${botao('imprimirDemonstrativos', 'Imprimir demonstrativos selecionados', { comp }, 'botao')}
      ${opera() ? botao('excluirBoletosSelecionados', 'Excluir boletos selecionados', { comp }, 'perigo') : ''}`;
  const impressao = `${selecionados} ${todos}`;
  return `${lista.length ? `<div class="acoes barra-nf lote-topo">${impressao} <a class="botao secundario" href="#/faturas">Tela NF</a></div>
      <div class="acoes barra-nf">${link('#/inadimplencia', 'Inadimplência')} <label class="suave" for="ordem-boletos">Ordenar por:</label> <select id="ordem-boletos" data-ordem-boletos="${esc(url({ ordem: '' }).replace(/&ordem=&?/, '&').replace(/[?&]$/, ''))}" style="width:auto">${[['vencimento', 'Data de vencimento'], ['imovel', 'Nome do imóvel'], ['inquilino', 'Nome do inquilino'], ['valor', 'Valor (maior para menor)']]
    .map(([k, t]) => `<option value="${k}" ${ordem === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>` : ''}
    <div class="cartao rolagem"><table class="cobrancas responsiva">
      <tr><th><input type="checkbox" data-marcar-todas="boleto" title="Selecionar todos"></th><th>Imóvel / inquilino</th><th>Vencimento</th><th class="n">Pontual</th><th class="n">Após vencimento</th><th>Situação</th><th>Multa e juros</th><th class="n">Valor NF</th><th>NF</th></tr>
      ${lista.map(({ cb, c, i, t, fs }) => `<tr class="${R.geraNf(c) ? '' : 'linha-controle'}">
        <td><label class="check-mini"><input type="checkbox" data-boleto="${cb.id}" title="Selecionar (imprimir o demonstrativo ou excluir)"><span class="so-celular suave"> marcar (imprimir ou excluir)</span></label></td>
        <td><a href="#/cobranca/${cb.id}"><b>${esc(i.nome)}</b></a>${opcoes.comp ? ` <span class="suave nw">${compBr(cb.competencia)}</span>` : ''}<br>${esc(c.inquilino_nome)}${R.geraNf(c) ? '' : `<br>${seloControle()}`}
          ${cb.dias_cobrados < cb.dias_mes ? `<br>${etiqueta(`proporcional ${cb.dias_cobrados}/${cb.dias_mes} dias`, 'info')}` : ''}
          ${cb.reserva_utilizada > 0 ? `<br>${etiqueta(`usa reserva ${reais(cb.reserva_utilizada)}`, 'aviso')}` : ''}
          ${cb.carencia ? `<br>${etiqueta('carência', 'aviso')}` : ''}
          ${R.ehComplementoCaucao(cb) ? `<br>${etiqueta('complemento da caução · sem NF', 'info')}` : ''}
          ${R.ehSaldoSaida(cb) ? `<br>${etiqueta('saldo do cálculo final da saída · sem NF', 'info')}` : ''}
          ${R.ehParcelaAcordo(cb) ? `<br>${etiqueta(`acordo ${cb.acordo_parcela || ''} · ${cb.acordo_referente || ''}`.replace(/  +/g, ' '), 'info')}` : ''}
          ${reajustes.has(c.id) && !R.ehBoletoAvulso(cb) ? `<br>${etiqueta(reajustes.get(c.id).corrigido ? 'reajuste: mandar a carta com este boleto' : 'reajuste: falta aplicar a correção', reajustes.get(c.id).corrigido ? 'aviso' : 'perigo')} ${link(`#/imprimir/carta?contrato=${c.id}&comp=${esc(cb.competencia)}`, 'Gerar carta', 'botao pequeno')}` : ''}</td>
        <td>${dataBr(cb.vencimento)}
          ${!cb.data_pagamento ? `<br>${botao('copiar', 'Copiar texto do boleto', { texto: R.dadosBoleto(d(), cb).descricao })}` : ''}
          ${resumoBancoLinha(cb) ? `<br>${resumoBancoLinha(cb)}` : ''}${seloPdfEmail(cb, envios)}</td>
        <td class="n">${reais(t.a_pagar_pontual)}<span class="so-celular suave"> · após o vencimento ${reais(t.a_pagar_sem_desconto)}</span></td>
        <td class="n suave so-pc">${reais(t.a_pagar_sem_desconto)}<br>${R.semMultaJuros(cb) ? 'sem multa e juros' : `+ multa ${pct(cb.multa_percentual)}<br>+ juros ${pct(cb.juros_mensal_percentual)} a.m.`}</td>
        <td>${situacaoBoleto(cb, hoje)}${R.aCobrar(cb) && opera() ? `<br>${botao('pagarBoleto', 'Confirmar pagamento', { id: cb.id }, 'pequeno')}<br>${botao('lembrete', C.vencido(cb.vencimento, hoje) ? 'Cobrar' : 'Lembrete', { id: cb.id }, 'secundario pequeno')}` : ''}</td>
        <td>${multaJurosTexto(cb)}</td>
        <td class="n">${cb.valor_nf !== null ? reais(cb.valor_nf) : ''}</td>
        <td>${fs.length ? link(`#/imprimir/faturas?numero=${fs[0].numero}`, `Nº ${R.numeroFatura(fs[0].numero)}`) : !R.geraNf(c) || R.ehComplementoCaucao(cb) || R.ehSaldoSaida(cb) || (cb.data_pagamento && !(cb.valor_nf > 0)) ? etiqueta('sem NF', 'controle') : (cb.data_pagamento ? '<span class="suave">aguardando nº</span>' : '')}
          ${cb.data_pagamento ? `<br><span class="suave">entrou em ${dataBr(cb.data_pagamento)}${cb.dias_atraso ? ` (${C.plural(cb.dias_atraso, 'dia')} de atraso)` : ''}<br>recebido ${reais(cb.valor_pago)}</span>${opera() && !fs.length ? `<br>${botao('estornar', 'Desfazer pagamento', { id: cb.id }, 'secundario pequeno', 'Desfazer este pagamento?')}` : ''}` : ''}</td></tr>`).join('')
      || (opcoes.vazio ? `<tr><td colspan="9">${opcoes.vazio}</td></tr>` : `<tr><td colspan="9" class="suave">${opcoes.comp ? 'Nenhum boleto nesta situação.' : `Nenhum boleto gerado para ${compBr(comp)}.`}</td></tr>`)}
      ${totalLinha}
    </table></div>
    ${lista.length ? `<div class="acoes barra-lote" data-barra-lote><span class="contagem-lote" data-contagem-lote></span>${selecionados}</div>
      ${todos ? `<div class="acoes">${todos}</div>` : ''}` : ''}`;
}

/** Vencimento em sábado, domingo ou feriado: o valor em dia vale até o próximo dia útil (decisão do dono, 09/11/2026). */
const prazoNaoUtil = (cb) => {
  const limite = C.limitePagamento(cb.vencimento);
  return limite !== cb.vencimento ? ` <span class="suave">(não é dia útil: vale até ${dataBr(limite)})</span>` : '';
};

export function demonstrativo(cb) {
  const c = buscar('contratos', cb.contrato_id);
  const i = buscar('imoveis', c.imovel_id);
  const t = R.totais(cb);
  const linha = (txt, v) => `<tr><td>${txt}</td><td class="n">${v}</td></tr>`;
  // o que fica fora da base de multa e juros: o FCI, a multa da notificação e a diferença de um pagamento em parte antigo
  const semJuros = [cb.fci && 'o FCI', (cb.multas_notificacao || []).length && 'a multa da notificação', (cb.diferencas_cobradas || []).length && 'a diferença do boleto anterior'].filter(Boolean);
  if (R.ehComplementoCaucao(cb)) {
    // em aberto: a caução de hoje (parcela paga fora da ordem já está nela); paga: o que estava antes dela
    const caucaoAntes = cb.data_pagamento ? cb.caucao_anterior : R.valorGarantia(d(), c);
    return `<div class="demonstrativo"><div class="cabecalho"><div><h2 style="margin:0">Demonstrativo do boleto: complemento da caução</h2><div class="suave">Aluguel corrigido a partir de ${compBr(cb.competencia)}</div></div>
      <div style="text-align:right"><div class="suave">Vencimento</div><div class="maior"><b>${dataBr(cb.vencimento)}</b></div></div></div>
    <div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>
    <p><b>Inquilino:</b> ${esc(c.inquilino_nome)}${c.inquilino_cpf ? ` · ${rotuloDocumento(c.inquilino_cpf)} ${esc(c.inquilino_cpf)}` : ''}${c.inquilino_telefone ? ` · ${esc(c.inquilino_telefone)}` : ''}</p>
    <table><tr><th>Descrição</th><th class="n">Valor</th></tr>
      ${linha('Caução já depositada', reais(caucaoAntes))}
      ${cb.caucao_parcela ? `${linha(`Parcela ${esc(cb.caucao_parcela)} do complemento`, reais(cb.caucao_complemento))}
      ${linha('Caução depois desta parcela', reais(caucaoAntes + (cb.caucao_complemento || 0)))}
      ${cb.caucao_necessaria > 0 ? linha(`Caução necessária${c.caucao_meses ? ` (${c.caucao_meses} ${c.caucao_meses === 1 ? 'aluguel' : 'aluguéis'})` : ''}`, reais(cb.caucao_necessaria)) : ''}`
        : linha(`Nova caução${c.caucao_meses ? ` (${c.caucao_meses} ${c.caucao_meses === 1 ? 'aluguel' : 'aluguéis'})` : ''}`, reais(caucaoAntes + (cb.caucao_complemento || 0)))}
      <tr class="total"><td>Depósito adicional a pagar até ${dataBr(cb.vencimento)}</td><td class="n maior">${reais(t.a_pagar_pontual)}</td></tr>
      <tr><td colspan="2" class="suave">Após o vencimento: sem multa e juros.</td></tr></table>
    ${cb.data_pagamento ? `<p><b>Pago em ${dataBr(cb.data_pagamento)}</b>${cb.dias_atraso ? ` com ${C.plural(cb.dias_atraso, 'dia')} de atraso` : ''} · recebido ${reais(cb.valor_pago)}</p>` : ''}
    ${cb.observacoes ? `<p class="pre">${esc(cb.observacoes)}</p>` : ''}</div>`;
  }
  if (R.ehSaldoSaida(cb)) {
    // saldo devedor do cálculo final da saída (2026-11-20): a conta do acerto (garantia − débitos) e o valor a pagar
    const e = buscar('encerramentos', cb.saldo_saida_de);
    return `<div class="demonstrativo"><div class="cabecalho"><div><h2 style="margin:0">Demonstrativo do boleto: saldo do acerto final</h2><div class="suave">Saída em ${dataBr((e && e.data_saida) || c.data_saida)}</div></div>
      <div style="text-align:right"><div class="suave">Vencimento</div><div class="maior"><b>${dataBr(cb.vencimento)}</b></div></div></div>
    <div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>
    <p><b>Inquilino:</b> ${esc(c.inquilino_nome)}${c.inquilino_cpf ? ` · ${rotuloDocumento(c.inquilino_cpf)} ${esc(c.inquilino_cpf)}` : ''}${c.inquilino_telefone ? ` · ${esc(c.inquilino_telefone)}` : ''}</p>
    <table><tr><th>Descrição</th><th class="n">Valor</th></tr>
      ${e && (e.garantia_corrigida || e.garantia_valor || 0) - (e.debitos || 0) === e.saldo ? `${linha('Garantia corrigida', reais(e.garantia_corrigida || e.garantia_valor || 0))}${linha('(-) Débitos do cálculo final', `- ${reais(e.debitos || 0)}`)}` : ''}
      <tr class="total"><td>Saldo a pagar até ${dataBr(cb.vencimento)}${prazoNaoUtil(cb)}</td><td class="n maior">${reais(t.a_pagar_pontual)}</td></tr>
      <tr><td colspan="2" class="suave">Após o vencimento: sem multa e juros.</td></tr></table>
    ${e && e.debitos_descricao ? `<p class="pre suave">${esc(e.debitos_descricao)}</p>` : ''}
    ${cb.data_pagamento ? `<p><b>Pago em ${dataBr(cb.data_pagamento)}</b>${cb.dias_atraso ? ` com ${C.plural(cb.dias_atraso, 'dia')} de atraso` : ''} · recebido ${reais(cb.valor_pago)}</p>` : ''}</div>`;
  }
  if (R.ehParcelaAcordo(cb)) {
    return `<div class="demonstrativo"><div class="cabecalho"><div><h2 style="margin:0">Demonstrativo do boleto: acordo${cb.acordo_parcela ? ` (parcela ${esc(cb.acordo_parcela)})` : ''}</h2><div class="suave">Referente a ${esc(cb.acordo_referente || '')}</div></div>
      <div style="text-align:right"><div class="suave">Vencimento</div><div class="maior"><b>${dataBr(cb.vencimento)}</b></div></div></div>
    <div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>
    <p><b>Inquilino:</b> ${esc(c.inquilino_nome)}${c.inquilino_cpf ? ` · ${rotuloDocumento(c.inquilino_cpf)} ${esc(c.inquilino_cpf)}` : ''}${c.inquilino_telefone ? ` · ${esc(c.inquilino_telefone)}` : ''}</p>
    <table><tr><th>Descrição</th><th class="n">Valor</th></tr>
      ${linha(`Parcela${cb.acordo_parcela ? ` ${esc(cb.acordo_parcela)}` : ''} do acordo dos boletos em atraso (${esc(cb.acordo_referente || '')})`, reais(t.total_sem_desconto))}
      <tr class="total"><td>Valor a pagar até ${dataBr(cb.vencimento)}${prazoNaoUtil(cb)}</td><td class="n maior">${reais(t.a_pagar_pontual)}</td></tr>
      <tr><td colspan="2" class="suave">Após o vencimento: + multa de ${pct(cb.multa_percentual)} + juros de ${pct(cb.juros_mensal_percentual)} ao mês, pro rata dia.</td></tr></table>
    ${cb.data_pagamento ? `<p><b>Pago em ${dataBr(cb.data_pagamento)}</b>${cb.dias_atraso ? ` com ${C.plural(cb.dias_atraso, 'dia')} de atraso` : ''} · recebido ${reais(cb.valor_pago)}</p>` : ''}</div>`;
  }
  return `<div class="demonstrativo"><div class="cabecalho"><div><h2 style="margin:0">Demonstrativo do boleto de aluguel</h2><div class="suave">Mês de referência ${compBr(cb.competencia)}</div></div>
      <div style="text-align:right"><div class="suave">Vencimento</div><div class="maior"><b>${dataBr(cb.vencimento)}</b></div></div></div>
    <div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>
    <p><b>Inquilino:</b> ${esc(c.inquilino_nome)}${c.inquilino_cpf ? ` · ${rotuloDocumento(c.inquilino_cpf)} ${esc(c.inquilino_cpf)}` : ''}${c.inquilino_telefone ? ` · ${esc(c.inquilino_telefone)}` : ''}</p>
    <table><tr><th>Descrição</th><th class="n">Valor</th></tr>
      ${cb.carencia ? linha('Aluguel: carência (não cobrado neste mês)', reais(0)) : linha(`Aluguel${cb.dias_cobrados < cb.dias_mes ? ` proporcional: ${cb.dias_cobrados} de ${cb.dias_mes} dias de ${reais(cb.aluguel_mensal)}` : ''}`, `${reais(cb.aluguel)}${cb.desconto ? ` <span class="suave">(Bonif. ${reais(cb.aluguel - cb.desconto)})</span>` : ''}`)}
      ${cb.iptu ? linha(`IPTU${cb.iptu_parcela ? ` (${esc(cb.iptu_parcela)})` : ''}`, reais(cb.iptu)) : ''}
      ${cb.seguro ? linha(`Seguro obrigatório${cb.seguro_parcela ? ` (${esc(cb.seguro_parcela)})` : ''}`, reais(cb.seguro)) : ''}
      ${cb.taxa_boleto ? linha('Tarifa de emissão do boleto', reais(cb.taxa_boleto)) : ''}
      ${cb.fci ? linha(`FCI: fundo de conservação do imóvel${c.fci_percentual ? ` (${pct(c.fci_percentual)} do aluguel bonificado)` : ''}, devolvido corrigido na saída`, reais(cb.fci)) : ''}
      ${R.partesDosOutros(cb).map((p) => (p.valor > 0 ? linha(`Cobrança adicional${p.texto ? `: ${esc(p.texto)}` : ''}`, reais(p.valor))
    : linha(`(-) Ressarcimento${p.texto ? `: ${esc(p.texto)}` : ''}`, `- ${reais(-p.valor)}`))).join('')}
      <tr class="total"><td>Total sem desconto</td><td class="n">${reais(t.total_sem_desconto)}</td></tr>
      ${cb.desconto ? linha('(-) Desconto de pontualidade, se pago até o vencimento', `- ${reais(cb.desconto)}`) : ''}
      ${cb.reserva_utilizada ? linha('(-) Reserva paga na visita, abatida neste mês', `- ${reais(cb.reserva_utilizada)}`) : ''}
      ${linhasRessarcimento(cb, linha)}
      <tr class="total"><td>Valor a pagar até ${dataBr(cb.vencimento)}${prazoNaoUtil(cb)}</td><td class="n maior">${reais(t.a_pagar_pontual)}</td></tr>
      <tr><td colspan="2" class="suave">Após o vencimento: ${reais(t.a_pagar_sem_desconto)} + multa de ${pct(cb.multa_percentual)} + juros de ${pct(cb.juros_mensal_percentual)} ao mês, pro rata dia${semJuros.length ? ` (sobre ${reais(t.base_multa)}: ${semJuros.join(' e ')} não ${semJuros.length > 1 ? 'têm' : 'tem'} multa nem juros)` : ''}.</td></tr></table>
    ${cb.data_pagamento ? `<p><b>Pago em ${dataBr(cb.data_pagamento)}</b>${cb.pagou_em_dia ? ' (pagou até o vencimento; compensado depois)' : ''}${cb.dias_atraso ? ` com ${C.plural(cb.dias_atraso, 'dia')} de atraso${cb.data_pagou ? ` (pagou em ${dataBr(cb.data_pagou)})` : ''}: multa ${pct(cb.multa_percentual)} = ${reais(cb.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(cb.juros)}` : ''} · recebido ${reais(cb.valor_pago)}</p>` : ''}
    ${cb.observacoes ? `<p class="pre">${esc(cb.observacoes)}</p>` : ''}</div>`;
}

/**
 * Ressarcimento das taxas do condomínio no demonstrativo: um título e, para cada mês do condomínio, uma linha por taxa.
 * Ex.: "Condomínio 10/2026" / "Extraordinárias - R$ 353,18" / "Fundo de reserva - R$ 100,92". Boleto antigo (o lançado não
 * soma o abatido): uma linha só, como antes.
 */
function linhasRessarcimento(cb, linha) {
  if (!cb.ressarcimento) return '';
  const grupos = R.taxasNoBoleto(d(), cb);
  if (!grupos.length) return linha(`(-) Ressarcimento de taxa do condomínio (${esc(cb.ressarcimento_descricao || '')})`, `- ${reais(cb.ressarcimento)}`);
  return `<tr><td colspan="2"><b>(-) Ressarcimento de taxas do condomínio</b> <span class="suave">(pagas pelo inquilino, são do proprietário)</span></td></tr>
    ${grupos.map((g) => `<tr><td style="padding-left:14px">Condomínio ${compBr(g.mes)}</td><td></td></tr>
      ${g.itens.map((x) => linha(`<span style="padding-left:28px;display:inline-block">${esc(x.descricao)}</span>`, `- ${reais(x.valor)}`)).join('')}`).join('')}`;
}

/**
 * Ajustes do mês: cobranças adicionais (+) e ressarcimentos (−), quantos precisar (pedido do dono de 24/11/2026), cada um com o
 * motivo e o botão de tirar. Multa de notificação e diferença presa ao boleto aparecem, mas saem só pelo caminho delas.
 */
function caixaAjuste(cb) {
  if (!opera() || cb.data_pagamento || R.ehBoletoAvulso(cb) || R.emAcordo(cb)) return '';
  const ajustes = R.ajustesDoBoleto(cb);
  const fixos = [...(cb.multas_notificacao || []), ...(cb.diferencas_cobradas || [])];
  const valor = (v) => (v < 0 ? `− ${reais(-v)}` : `+ ${reais(v)}`);
  const lista = ajustes.length || fixos.length ? `<table class="ajustes-do-mes">
      ${ajustes.map((a) => `<tr><td>${a.valor < 0 ? 'Ressarcimento' : 'Cobrança adicional'}: ${esc(a.motivo || '')}</td><td class="n">${valor(a.valor)}</td>
        <td>${botao('tirarAjuste', 'Tirar', { id: cb.id, ajuste: a.id }, 'perigo pequeno', `Tirar este ajuste (${a.valor < 0 ? 'ressarcimento' : 'cobrança adicional'} de ${reais(Math.abs(a.valor))})?`)}</td></tr>`).join('')}
      ${fixos.map((e) => `<tr><td>${esc(e.texto)} <span class="suave">(sai pelo caminho dela, não por aqui)</span></td><td class="n">${valor(e.valor)}</td><td></td></tr>`).join('')}
    </table>` : '';
  return `<div class="cartao"><h2>Ajuste deste mês</h2>
    <p class="suave">Para corrigir o valor do boleto: cobrar algo a mais ou devolver/descontar um valor (reforma, acerto do mês anterior etc.). Pode lançar quantos precisar; cada um fica registrado no histórico do inquilino.</p>
    ${lista}
    <form data-form="ajuste" data-id="${cb.id}" class="acoes">
      <select name="tipo" style="width:auto"><option value="adicional">Cobrança adicional (+)</option><option value="ressarcimento">Ressarcimento (−)</option></select>
      <input name="valor" inputmode="decimal" placeholder="Valor" style="width:130px">
      <input name="motivo" placeholder="Motivo (ex.: reforma do banheiro)" style="flex:1;min-width:220px">
      <button class="secundario">${ajustes.length ? 'Acrescentar outro ajuste' : 'Salvar ajuste'}</button></form></div>`;
}

function caixaBoleto(cb) {
  const b = R.dadosBoleto(d(), cb);
  const linha = (rotulo, valor, copia = valor) => `<tr><td class="suave">${rotulo}</td><td><b>${esc(valor)}</b></td><td class="n">${botao('copiar', 'Copiar', { texto: copia })}</td></tr>`;
  const num = (c) => C.reais(c, false);
  return `<div class="cartao boleto"><h2>Dados para emitir o boleto no banco</h2>
    <table>${linha('Pagador', `${b.pagador}${b.documento_pagador ? ` · ${b.documento_pagador}` : ''}`, b.pagador)}
    ${linha('Nº do documento', b.numero_documento)}${linha('Vencimento', dataBr(b.vencimento))}
    ${linha('Valor do documento', reais(b.valor), num(b.valor))}
    ${b.desconto ? linha(`Desconto se pago até ${dataBr(b.vencimento)}`, `${reais(b.desconto)} (fica ${reais(b.valor_com_desconto)})`, num(b.desconto)) : ''}
    ${b.multa_valor !== null ? linha('Multa após o vencimento (em valor, R$)', `${reais(b.multa_valor)} (${pct(b.multa_percentual)} sem o FCI)`, num(b.multa_valor)) : linha('Multa após o vencimento', pct(b.multa_percentual), String(b.multa_percentual).replace('.', ','))}
    ${linha('Juros (mora) ao dia', reais(b.juros_ao_dia), num(b.juros_ao_dia))}</table>
    <h3>Descrição</h3><div class="acoes"><pre class="descricao-boleto">${esc(b.descricao)}</pre>${botao('copiar', 'Copiar descrição', { texto: b.descricao }, '')}</div>
    ${b.excesso ? `<div class="alerta aviso">A descrição tem ${b.descricao.length} letras e o C6 aceita ${R.LIMITE_DESCRICAO_BOLETO}: o banco corta as últimas ${b.excesso} ("${esc(b.descricao.replace(/\n/g, ' ').slice(-b.excesso))}"). ${R.ajustesDoBoleto(cb).length ? 'Encurte o motivo dos ajustes do mês ou confira' : 'Confira'} a descrição no banco.</div>` : ''}</div>`;
}

/** Último e-mail do boleto (modelo boleto_envio) de cada boleto: Map id → { data, como }, montado uma vez por desenho da lista. */
function enviosDosBoletos() {
  const m = new Map();
  for (const x of d().envios_email || []) {
    if (x.chave !== 'boleto_envio' || !x.cobranca_id) continue;
    const ja = m.get(x.cobranca_id);
    // vale o mais novo; no mesmo dia, "enviado" vence "aberto no Gmail"
    if (!ja || String(x.data) > String(ja.data) || (x.data === ja.data && x.como === 'enviado')) m.set(x.cobranca_id, x);
  }
  return m;
}

/** Na lista: o boleto tem o PDF do banco anexado? Já foi mandado por e-mail? */
function seloPdfEmail(cb, envios) {
  const e = envios.get(cb.id);
  const pdf = cb.boleto_pdf ? etiqueta('📎 PDF do banco', R.boletoPdfDesatualizado(cb) ? 'aviso' : 'ok') : '';
  const mail = e ? etiqueta(`✉ ${e.como === 'enviado' ? 'enviado' : 'aberto no Gmail'} em ${dataBr(e.data)}`, e.como === 'enviado' ? 'ok' : 'info') : '';
  return pdf || mail ? `<br>${[pdf, mail].filter(Boolean).join(' ')}` : '';
}

/**
 * Boleto emitido à mão no banco (pedido do dono em 2026-11-24, enquanto a API do C6 não sai): anexar o PDF que o banco gerou
 * (abrir, trocar, tirar) e mandar ao inquilino por e-mail, com o descritivo, o mês, o vencimento e os valores.
 */
function caixaPdfBanco(cb) {
  if (!cb.boleto_pdf && (cb.data_pagamento || !opera())) return '';
  const pasta = R.pastaDoBoletoPdf(cb);
  const sumiu = cb.boleto_pdf && arquivoSumiu('contrato', pasta, cb.boleto_pdf);
  const mudou = R.boletoPdfDesatualizado(cb);
  const escolher = (texto, classe = 'botao secundario') => (opera() ? `<label class="${classe}" style="cursor:pointer">${texto}<input type="file" hidden accept="${ACEITA_DOCUMENTOS}" data-acao-arquivo="anexarBoletoPdf" data-id="${cb.id}"></label>` : '');
  const u = ultimoEnvio('boleto_envio', { contrato: cb.contrato_id, cobranca: cb.id });
  const anexo = !cb.boleto_pdf ? `<p class="suave">Ainda sem o PDF. Emita o boleto no banco com os dados abaixo, baixe o PDF e anexe aqui.</p><p class="acoes">${escolher('📎 Anexar o PDF do boleto', 'botao')}</p>`
    : sumiu ? `<p class="alerta aviso">O arquivo ${esc(cb.boleto_pdf)} sumiu da pasta: anexe de novo.</p><p class="acoes">${escolher('📎 Anexar de novo', 'botao')}</p>`
    : `<p class="acoes"><a href="#" class="botao secundario" data-acao="abrirArquivo" data-escopo="contrato" data-id="${pasta}" data-nome="${esc(cb.boleto_pdf)}" title="${esc(cb.boleto_pdf)}">📎 Abrir o PDF do boleto</a>
        ${escolher('Trocar o PDF')}
        ${opera() ? botao('removerBoletoPdf', 'Tirar o PDF', { id: cb.id }, 'secundario', `Tirar o PDF "${cb.boleto_pdf}" deste boleto? O arquivo é apagado da pasta (o boleto continua).`) : ''}</p>
      ${mudou ? `<p class="alerta aviso">O boleto mudou depois que o PDF foi anexado: ${esc(mudou)}. Emita de novo no banco e troque o PDF.</p>` : ''}`;
  const envio = opera() && !cb.data_pagamento ? `<p class="acoes">${botao('enviarBoletoEmail', '✉ Enviar boleto por e-mail', { id: cb.id }, cb.boleto_pdf && !sumiu ? '' : 'secundario')}
      ${u ? `<span class="suave">${u.como === 'enviado' ? 'Enviado' : 'Aberto no Gmail'} em ${dataBr(u.data)}${u.para ? ` para ${esc(u.para)}` : ''}</span>` : '<span class="suave">E-mail curto com o descritivo, o mês, o vencimento e os valores, com o PDF anexado.</span>'}</p>` : '';
  return `<div class="cartao" id="pdf-banco"><h2>Boleto emitido no banco (PDF)</h2>${anexo}${envio}</div>`;
}

/** Etapas do acordo (registrado, termo assinado com o anexo, parcelas pagas). */
function etapasAcordo(a) {
  const termo = (x) => (x.chave !== 'termo' || a.desfeito_em ? '' : ` ${link(`#/imprimir/recibo?tipo=acordo&contrato=${a.contrato_id}&id=${a.id}`, '🧾 Termo para assinar', 'botao secundario mini')} ${linkComprovante(a.contrato_id, a.termo_assinado || null, { tabela: 'acordos', id: a.id, campo: 'termo_assinado', tipo: 'termo-acordo-assinado', data: a.data })
    .replace('📎 comprovante', '📎 termo assinado').replace('anexar comprovante', 'anexar o termo assinado').replace('Sem comprovante: buscar no banco e anexar', 'Anexar o termo do acordo assinado')}`);
  return `<ol style="margin:4px 0 6px 18px">${R.etapasDoAcordo(d(), a).map((x) => `<li>${x.feito ? '✅' : '⬜'} ${esc(x.titulo)} <span class="suave">${esc(x.detalhe)}</span>${termo(x)}</li>`).join('')}</ol>`;
}

/** Acordo de dívida (D8): no boleto original, de qual acordo ele faz parte; na parcela, a que ela se refere. Os dois com os boletos do acordo e "Desfazer". */
function caixaAcordo(cb) {
  const a = R.buscar(d(), 'acordos', cb.acordo_id || cb.acordo_parcela_de);
  if (!a || (!R.emAcordo(cb) && !R.ehParcelaAcordo(cb))) return '';
  const parcelas = R.parcelasDoAcordo(d(), a);
  const lista = (l) => l.map((x) => `${link(`#/cobranca/${x.id}`, R.ehParcelaAcordo(x) && x.acordo_parcela_de === a.id ? (x.acordo_parcela || 'boleto') : compBr(x.competencia))} ${reais(R.totais(x).a_pagar_sem_desconto)} · vence ${dataBr(x.vencimento)}${x.data_pagamento ? ` · pago em ${dataBr(x.data_pagamento)}` : ''}`).join('<br>');
  // parcela dentro de um acordo mais novo: só desfaz depois dele (o texto diz qual)
  const depois = !a.desfeito_em && R.acordoPosterior(d(), a);
  const podeDesfazer = opera() && !a.desfeito_em && !depois && !parcelas.some((x) => x.data_pagamento || R.emitidoNoBanco(x) || R.quitadoNaSaida(x));
  return `<div class="alerta info nao-imprimir"><b>Acordo de ${dataBr(a.data)}</b> com ${esc(R.buscar(d(), 'contratos', a.contrato_id).inquilino_nome)}: ${esc(a.referente)}
    (${reais(a.divida_na_data)} na data) em ${a.parcelas} boleto(s), total ${reais(a.valor_total)}.${a.observacoes ? ` <i>${esc(a.observacoes)}</i>` : ''}
    <br><b>Etapas do acordo:</b>${etapasAcordo(a)}
    <br><b>Boletos do acordo:</b><br>${lista(parcelas)}
    <br><b>Boletos que ele substituiu:</b><br>${lista(R.origensDoAcordo(d(), a))}
    ${podeDesfazer ? `<br>${botao('desfazerAcordo', 'Desfazer o acordo', { id: a.id }, 'secundario pequeno', 'Desfazer o acordo? Os boletos do acordo serão excluídos e os originais voltam a ser cobrados.')}` : ''}
    ${depois ? `<br><span class="suave">Para desfazer este acordo, desfaça antes o ${link(`#/cobranca/${depois.parcela.id}`, `acordo de ${dataBr(depois.acordo.data)}`)}, que inclui a parcela ${esc(depois.parcela.acordo_parcela || 'única')}.</span>` : ''}</div>`;
}

/** Texto do aviso do boleto alterado à mão: o que ficou digitado e o que não bate com o cadastro. */
function avisoDoManual(cb) {
  const rotulos = { aluguel: 'aluguel', desconto: 'bonificação', iptu: 'IPTU', seguro: 'seguro', taxa_boleto: 'taxa do boleto', fci: 'FCI', multa_percentual: 'multa', juros_mensal_percentual: 'juros' };
  const dif = R.divergenciasDoManual(d(), cb);
  if (Array.isArray(cb.campos_manuais)) {
    return cb.campos_manuais.length ? `Valores digitados à mão (${cb.campos_manuais.map((k) => rotulos[k] || k).join(', ')}): ficam como estão; o resto continua sendo calculado pelo cadastro.` : 'Boleto alterado à mão.';
  }
  return `Valores alterados à mão: este boleto não é recalculado sozinho quando o cadastro muda.${dif.length ? ` <b>Não bate com o cadastro:</b> ${dif.map((x) => `${x.rotulo} ${reais(x.cadastro)} no cadastro e ${reais(x.boleto)} no boleto`).join('; ')}.` : ''}`;
}

export function telaCobranca(cb) {
  const c = buscar('contratos', cb.contrato_id);
  const fs = R.faturasDe(d(), 'cobranca', cb.id, false);
  const validas = fs.filter((f) => f.situacao === 'Emitida');
  const sim = cb.data_pagamento ? null : C.liquidar(cb, C.hojeIso());
  // volta para a última lista de boletos aberta (filtro, busca e ordem de onde a pessoa veio); sem ela, o mês do boleto
  const volta = memoria.ultimaListaBoletos || null;
  const irmas = R.parcelasIrmasDoComplemento(d(), cb).filter((x) => !x.data_pagamento);
  return `<div class="nao-imprimir"><p class="suave"><a href="${esc(volta ? volta.url : `#/cobrancas?comp=${cb.competencia}`)}">← ${esc(volta ? volta.titulo : `Boletos de ${compBr(cb.competencia)}`)}</a> · <a href="#/contrato/${c.id}">${esc(c.inquilino_nome)}</a></p>
    <div class="cabecalho"><h1>Boleto ${R.ehComplementoCaucao(cb) ? 'do complemento da caução' : R.ehSaldoSaida(cb) ? 'do saldo da saída' : R.ehParcelaAcordo(cb) ? `do acordo ${esc(cb.acordo_parcela || '')}` : compBr(cb.competencia)} ${situacaoBoleto(cb, C.hojeIso())}</h1><div class="acoes">
      <button class="secundario" data-acao="imprimir">Imprimir demonstrativo</button>${botao('baixarPdfTela', 'Baixar PDF', { seletor: '.demonstrativo', nome: nomeArquivoDoc(R.ehComplementoCaucao(cb) ? 'Demonstrativo complemento caução' : 'Demonstrativo boleto', c, cb.competencia) }, 'secundario')}
      ${opera() && !cb.data_pagamento && !R.emAcordo(cb) && !R.ehParcelaAcordo(cb) ? `${R.ehComplementoCaucao(cb) || R.ehSaldoSaida(cb) ? '' : link(`#/editar/cobrancas/${cb.id}`, 'Alterar valores', 'botao secundario')} ${botao('excluir', 'Excluir', { tabela: 'cobrancas', id: cb.id }, 'perigo', cb.boleto_pdf ? 'Este boleto foi emitido à mão no banco (PDF anexado) e continua valendo lá: cancele no banco antes. Excluir o boleto do sistema (o PDF sai junto)?' : irmas.length ? `Excluir este boleto? ${C.plural(irmas.length, 'A outra parcela', 'As outras parcelas')} do complemento da caução em aberto ${irmas.length === 1 ? 'sai junto' : 'saem juntas'} e o complemento volta a "Caução a completar" (tela Reajustes), para gerar de novo.` : 'Excluir este boleto?')}` : ''}</div></div>
    ${cb.editado_manual && !cb.data_pagamento ? `<div class="alerta ${R.divergenciasDoManual(d(), cb).length ? 'aviso' : 'info'}">${avisoDoManual(cb)} ${opera() ? botao('recalcularBoleto', 'Voltar a calcular pelo cadastro', { id: cb.id }, 'secundario pequeno', 'Recalcular este boleto pelo cadastro? Os valores digitados à mão serão substituídos (o ajuste do mês fica).') : ''}</div>` : ''}</div>
    ${R.geraNf(c) ? '' : `<div class="alerta controle nao-imprimir"><b>Boleto de controle.</b> Este inquilino ${AVISO_CONTROLE}</div>`}
    ${caixaAcordo(cb)}
    ${demonstrativo(cb)}
    <div class="nao-imprimir">${caixaAjuste(cb)}<div class="cartao" id="pagamento"><h2>Pagamento</h2>${diferencaHtml(cb)}
      ${!cb.data_pagamento && memoria.pagamentoDivergente && memoria.pagamentoDivergente.id === cb.id ? formNfDivergente(cb, memoria.pagamentoDivergente) : cb.data_pagamento ? `<div class="grade">${item('Pago em', dataBr(cb.data_pagamento))}${item('Situação', `${esc(cb.situacao)}${cb.dias_atraso ? ` (${C.plural(cb.dias_atraso, 'dia')})` : ''}`)}
        ${R.semMultaJuros(cb) ? '' : `${item(`Multa (${pct(cb.multa_percentual)})`, reais(cb.multa))}${item(`Juros (${pct(cb.juros_mensal_percentual)} ao mês)`, reais(cb.juros))}`}
        ${item('Valor recebido', reais(cb.valor_pago))}${R.ehComplementoCaucao(cb) || !R.geraNf(c) ? '' : item('Valor da nota fiscal', `<span class="maior">${reais(cb.valor_nf)}</span>${cb.nf_manual ? ` ${etiqueta('digitado à mão', 'aviso')}` : ''}`)}</div>
        ${pagoAMaisHtml(cb)}
        ${cb.nf_manual ? '<p class="suave">Valor recebido diferente do previsto: a NF saiu com o valor digitado à mão (a justificativa está no histórico).</p>' : R.ehSaldoSaida(cb) ? '<p class="suave">Saldo do cálculo final da saída: não gera NF (o aluguel de cada mês tem o boleto e a NF dele) e não tem multa e juros (os débitos do cálculo já os trazem). Depois de pago, marque o saldo como cobrado no roteiro da saída.</p>' : R.ehComplementoCaucao(cb) ? '<p class="suave">Complemento da caução: não gera NF. Ao confirmar o pagamento, a caução foi corrigida (veja Garantia, na página do inquilino).</p>' : !R.geraNf(c) ? '<p class="suave">Boleto de controle (inquilino sem NF): o pagamento só fica registrado.</p>' : !(cb.valor_nf > 0) ? '<p class="suave">Sem NF: este boleto não tem aluguel na nota (ex.: mês de carência só com IPTU e seguro).</p>' : `<p class="suave">Nota fiscal = ${cb.dias_atraso ? `aluguel ${reais(cb.aluguel)} + multa ${reais(cb.multa)} + juros ${reais(cb.juros)} (pagou atrasado, sem desconto)` : `aluguel ${reais(cb.aluguel)} - desconto ${reais(cb.desconto)} (pagou em dia)`}. IPTU, seguro, tarifa, FCI e ajuste do mês não entram.</p>`}
        ${opera() ? botao('estornar', 'Desfazer pagamento', { id: cb.id }, 'perigo pequeno', validas.length ? 'Desfazer o pagamento? A NF será cancelada e o número não será reaproveitado.' : 'Desfazer o pagamento?') : ''}`
      : R.emAcordo(cb) ? '<p class="suave">Boleto em acordo: não se cobra mais. O pagamento é registrado nos boletos do acordo.</p>'
      : `<p>Se for pago hoje (${dataBr(C.hojeIso())}): <b>${reais(sim.valor_devido)}</b>${sim.pontual ? '' : R.semMultaJuros(cb) ? ` (${C.plural(sim.dias_atraso, 'dia')} de atraso, sem multa e juros)` : ` (${C.plural(sim.dias_atraso, 'dia')} de atraso: multa ${pct(cb.multa_percentual)} = ${reais(sim.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(sim.juros)})`}${R.ehComplementoCaucao(cb) ? ' · sem NF (complemento da caução)' : R.ehSaldoSaida(cb) ? ' · sem NF (saldo da saída)' : !R.geraNf(c) ? ' · sem NF (boleto de controle)' : ` · nota fiscal ${reais(sim.valor_nf)}`}</p>
        ${R.segundaVia(d(), cb, C.hojeIso()) ? `<p class="acoes">${botao('segundaVia', '2ª via com o valor de hoje', { id: cb.id }, 'secundario')}<span class="suave">Valor com multa e juros até hoje e o texto pronto para o inquilino (não emite boleto novo no banco).</span></p>` : ''}
        ${opera() && R.aCobrar(cb) ? formPagamento(cb) : ''}
        ${opera() ? `<p class="acoes" style="margin-top:10px">${botao('lembrete', C.vencido(cb.vencimento, C.hojeIso()) ? 'Cobrar o inquilino (texto pronto)' : 'Lembrar o inquilino (texto pronto)', { id: cb.id }, 'secundario')}<span class="suave">E-mail, WhatsApp ou copiar; o texto muda se já venceu.</span></p>` : ''}`}</div>
    ${caixaProvasBoleto(cb)}
    ${R.emAcordo(cb) ? '' : caixaBancoC6(cb)}
    ${R.emAcordo(cb) ? '' : caixaPdfBanco(cb)}
    ${R.emAcordo(cb) ? '' : caixaBoleto(cb)}
    <div class="cartao rolagem"><h2>NFs</h2><table class="responsiva"><tr><th>Nº</th><th>Empresa</th><th>Emissão</th><th>Período</th><th class="n">%</th><th class="n">Valor</th><th>Situação</th></tr>
      ${fs.map((f) => `<tr><td>${R.numeroFatura(f.numero)}</td><td>${esc(buscar('emitentes', f.emitente_id).nome)}</td><td>${dataBr(f.emissao)}</td><td>${dataBr(f.periodo_inicio)} a ${dataBr(f.periodo_fim)}</td><td class="n">${pct(f.percentual)}</td><td class="n">${reais(f.valor)}</td><td>${etiqueta(f.situacao, f.situacao === 'Emitida' ? 'ok' : 'perigo')}</td></tr>`).join('')
      || `<tr><td colspan="7" class="suave">${!R.geraNf(c) ? 'Este inquilino não emite NF (só controle do pagamento).' : R.ehComplementoCaucao(cb) ? 'Complemento da caução: não gera NF.' : cb.data_pagamento && !(cb.valor_nf > 0) ? 'Sem NF (valor da NF R$ 0,00: não há aluguel na nota).' : cb.data_pagamento ? 'Aguardando numeração (tela NF).' : 'Confirme o pagamento para gerar a NF.'}</td></tr>`}</table>
      ${cb.data_pagamento && cb.valor_nf > 0 && !validas.length && R.geraNf(c) && !R.ehComplementoCaucao(cb) && opera() ? `<p>${formNfExterna('cobranca', cb.id, cb.data_pagamento)}</p>` : ''}
      ${validas.length ? `<p class="acoes">${link(`#/imprimir/faturas?numero=${validas[0].numero}`, 'Ver / imprimir NF', 'botao')} ${botao('excel', 'Baixar Excel', { numero: validas[0].numero })}</p>` : ''}</div></div>`;
}
