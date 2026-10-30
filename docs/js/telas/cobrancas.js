// Boletos: lista do mês (#/cobrancas), página do boleto (#/cobranca/ID), baixa em lote, ajuste do mês e demonstrativo.
import * as C from '../calculos.js';
import { compBr, dataBr, pct, reais } from '../calculos.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao, buscar, d, endereco, etiqueta, item, link, memoria, multaJurosTexto, opera, situacao } from './comum.js';
import { AVISO_CONTROLE, seloControle, situacaoBoleto } from './contrato.js';
import { nomeArquivoDoc } from './documentos.js';
import { formNfExterna } from './faturas.js';

// --------------------------------------------------------------------------
// Cobranças do mês
// --------------------------------------------------------------------------
/**
 * Confirmação do pagamento: data contábil (entrada no banco, vira a data da NF), "pagou em dia" (compensou depois,
 * sem multa e juros) e, se atrasou de verdade, o dia em que pagou (multa e juros até esse dia, como o banco cobra).
 */
function formPagamento(cb, compacto) {
  const emDia = `<label class="check-mini" title="Pagou até o vencimento e o banco só compensou depois: sem multa e juros, com desconto"><input type="checkbox" name="em_dia" value="1"> pagou em dia</label>`;
  if (compacto) {
    return `<form data-form="pagamento" data-id="${cb.id}" class="pagamento"><input type="date" name="data" value="${C.hojeIso()}" title="Data contábil: dia em que o dinheiro entrou na conta (é a data da NF)"><input name="valor" placeholder="valor pago" title="Opcional: valor efetivamente recebido" inputmode="decimal" data-dinheiro>${emDia}<button class="pequeno">Confirmar</button></form>`;
  }
  return `<form data-form="pagamento" data-id="${cb.id}" class="pagamento"><label>Data contábil (entrada na conta)</label><input type="date" name="data" value="${C.hojeIso()}">
    <label>Pagou em (se atrasou)</label><input type="date" name="pagou" title="Opcional: dia em que o inquilino pagou. Em branco: a data contábil">
    <label>Valor recebido (opcional)</label><input name="valor" inputmode="decimal" data-dinheiro placeholder="0,00">${emDia}<button>Confirmar pagamento</button></form>
    <p class="suave">A data contábil é a data de emissão da NF, e pode ser alguns dias depois do pagamento. Marque "pagou em dia" quando o inquilino pagou até o vencimento (${dataBr(cb.vencimento)}) e o banco compensou depois: sem multa e juros. Se atrasou de verdade, o banco já cobra multa e juros no boleto e a NF sai com esse valor a mais; informe o dia em que pagou para os juros baterem com o banco.</p>`;
}

/** Valor recebido diferente do previsto: descritivo do cálculo, justificativa e o valor da NF (vem o calculado, em vermelho, e precisa ser alterado). */
function formNfDivergente(cb, p) {
  const r = R.previstoNoPagamento(cb, p.data, p);
  const dif = p.valor - r.valor_devido;
  const ress = cb.ressarcimento_na_nf && cb.ressarcimento ? ` − ressarcimento ${reais(cb.ressarcimento)}` : '';
  const conta = r.pontual ? `aluguel ${reais(cb.aluguel)} − desconto ${reais(cb.desconto)}${ress}` : `aluguel ${reais(cb.aluguel)} + multa ${reais(r.multa)} + juros ${reais(r.juros)}${ress} (${r.dias_atraso} dia(s) de atraso, sem desconto)`;
  return `<div class="alerta aviso"><b>Valor recebido diferente do previsto.</b> Confira o cálculo e informe o valor da NF (cálculo manual). Nada foi salvo ainda.</div>
    <div class="grade">${item('Data contábil (data da NF)', dataBr(p.data))}${item('Pagou em', dataBr(p.pagouEmDia ? cb.vencimento : p.dataPagou || p.data))}
      ${item('Previsto', reais(r.valor_devido))}${item('Recebido', `<b>${reais(p.valor)}</b>`)}${item('Diferença', `<b>${dif > 0 ? '+' : '−'}${reais(Math.abs(dif))}</b>`)}</div>
    <p><b>Cálculo da NF:</b> ${conta} = <b>${reais(r.valor_nf)}</b>. IPTU, seguro, tarifa, FCI e ajuste do mês não entram.</p>
    <form data-form="pagamentoNf" data-id="${cb.id}" class="formulario">
      <div class="largo"><label>Justificativa da divergência</label><textarea name="justificativa" rows="2">${esc(p.justificativa)}</textarea><div class="ajuda">Fica só no sistema (histórico do boleto)</div></div>
      <div><label>Valor da NF</label><input name="valor_nf" inputmode="decimal" data-dinheiro value="${F.dinheiroTexto(r.valor_nf)}" data-calculado="${F.dinheiroTexto(r.valor_nf)}" class="valor-calculado">
        <div class="ajuda">Veio o valor calculado: altere para o valor do cálculo manual</div></div>
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

/** Baixa em lote separada por vencimento: só dá para confirmar juntos boletos que vencem no mesmo dia. */
function caixaBaixaLote(lista, hoje) {
  const abertos = lista.filter((x) => !x.cb.data_pagamento && x.cb.situacao !== 'Carência');
  if (!abertos.length) return '';
  const grupos = [...new Set(abertos.map((x) => x.cb.vencimento))].sort().map((v) => [v, abertos.filter((x) => x.cb.vencimento === v)]);
  return `<details class="cartao baixa-lote"><summary><b>Baixa em lote (pagos em dia)</b> <span class="suave">· ${abertos.length} em aberto, separada por vencimento · clique para expandir</span></summary>
    ${grupos.map(([v, xs]) => `<form data-form="baixaLote" class="grupo-baixa">
      <div class="cabecalho"><div><b>Vencimento ${dataBr(v)}</b> ${v < hoje ? etiqueta('vencido', 'perigo') : ''} <span class="suave">${xs.length} em aberto · ${reais(xs.reduce((t, x) => t + x.t.a_pagar_pontual, 0))}</span></div>
        <label class="check-mini"><input type="checkbox" data-marcar-grupo> marcar todos deste vencimento</label></div>
      <div class="lista-baixa">${xs.map((x) => `<label class="check-mini"><input type="checkbox" name="ids" value="${x.cb.id}"> ${esc(x.i.nome)} · ${esc(x.c.inquilino_nome)} · ${reais(x.t.a_pagar_pontual)}</label>`).join('')}</div>
      <div class="acoes">entraram em <input type="date" name="data" value="${hoje}" style="width:auto"><button class="pequeno">Confirmar os marcados como pagos em dia</button></div></form>`).join('')}
    <p class="suave">Sem multa e juros. Quem pagou atrasado, confirme na própria linha da tabela.</p></details>`;
}

export function telaCobrancas(comp, ordem = 'vencimento') {
  const hoje = C.hojeIso();
  const lista = d().cobrancas.filter((x) => x.competencia === comp).map((cb) => {
    const c = buscar('contratos', cb.contrato_id);
    return { cb, c, i: buscar('imoveis', c.imovel_id), t: R.totais(cb), fs: R.faturasDe(d(), 'cobranca', cb.id) };
  }).sort(ORDENS_BOLETO[ordem] || ORDENS_BOLETO.vencimento);
  const faltando = d().contratos.filter((c) => c.ativo !== false && c.imovel_id && C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0 && !lista.some((x) => x.c.id === c.id && !R.ehComplementoCaucao(x.cb)));
  const caucoes = R.complementosCaucaoPendentes(d(), comp);
  const pend = R.pendentesDeFatura(d());
  // boleto de controle (inquilino sem NF) não entra nas somas
  const soma = (f) => lista.filter((x) => R.geraNf(x.c)).reduce((s, x) => s + f(x), 0);
  const controle = lista.filter((x) => !R.geraNf(x.c)).length;
  // reajuste neste aluguel: corrigir antes e mandar a carta junto com este boleto (o índice sai no começo do mês)
  const reajustes = new Map(lista.filter((x) => !R.ehComplementoCaucao(x.cb)).map((x) => [x.c.id, R.reajusteNaCompetencia(d(), x.c, comp)]).filter(([, r]) => r && r.faltaCarta));
  const semCorrecao = [...reajustes.values()].filter((r) => !r.corrigido).length;
  // botões de impressão em cima e embaixo da lista
  const impressao = `${botao('imprimirDemonstrativos', 'Imprimir demonstrativos selecionados', { comp }, 'botao')}
      <a class="botao secundario" href="#/imprimir/demonstrativos?comp=${comp}">Imprimir todos os demonstrativos do mês</a>
      ${opera() ? botao('excluirBoletosSelecionados', 'Excluir boletos selecionados', { comp }, 'perigo') : ''}`;
  return `<div class="cabecalho"><h1>Boletos de ${compBr(comp)}</h1>
      <div class="acoes"><a class="botao secundario" href="#/cobrancas?comp=${C.somarMeses(comp, -1)}&ordem=${ordem}">← ${compBr(C.somarMeses(comp, -1))}</a>
      <form data-form="irMes" class="acoes"><input type="month" name="comp" value="${comp}" style="width:160px"><button class="secundario">Ir</button></form>
      <a class="botao secundario" href="#/cobrancas?comp=${C.somarMeses(comp, 1)}&ordem=${ordem}">${compBr(C.somarMeses(comp, 1))} →</a></div></div>
    <p class="suave">Competência é o mês de uso do imóvel. Ao receber, informe a data do pagamento e clique em Confirmar. Depois, numere as NFs: a numeração segue a ordem das datas de pagamento.</p>
    ${reajustes.size ? `<div class="alerta aviso"><b>Reajuste</b> ${reajustes.size} inquilino(s) têm o aluguel de ${compBr(comp)} corrigido: envie a carta de reajuste junto com o boleto deste mês (botão "Gerar carta" na linha).${semCorrecao ? ` <b>${semCorrecao} ainda sem a correção aplicada</b>: informe o índice e aplique a correção (os boletos em aberto são recalculados).` : ''} ${link('#/reajustes', 'Ver reajustes')}</div>` : ''}
    ${faltando.length && opera() ? `<div class="alerta aviso">${faltando.length} contrato(s) ainda sem boleto neste mês: ${faltando.map((c) => esc(c.inquilino_nome)).join(', ')}. ${botao('gerarCobrancas', `Gerar boletos de ${compBr(comp)}`, { comp }, 'pequeno')}</div>` : ''}
    ${caucoes.length && opera() ? `<div class="alerta aviso"><b>Complemento da caução</b> (aluguel corrigido) ainda sem boleto: gere na tela Reajustes, em "Caução a completar" (boleto separado, sem tarifa e sem NF).
      ${caucoes.map((x) => `<div class="acoes" style="margin-top:6px">${esc(x.contrato.inquilino_nome)}: caução de ${reais(x.atual)} para ${reais(x.necessaria)}
        ${link(`#/reajustes?contrato=${x.contrato.id}`, `Completar ${reais(x.complemento)} em Reajustes`, 'botao pequeno')}</div>`).join('')}</div>` : ''}
    ${opera() && lista.some((x) => !x.cb.data_pagamento) ? `<p class="acoes">${botao('recalcularMes', `Recalcular boletos em aberto de ${compBr(comp)} pelo cadastro`, { comp }, 'secundario pequeno', 'Recalcular os boletos em aberto deste mês com os valores atuais do cadastro? Boletos alterados à mão não mudam.')}</p>` : ''}
    ${pend.length && opera() ? `<div class="alerta info">${pend.length} pagamento(s) aguardando número de NF. ${botao('numerar', 'Numerar NFs agora', {}, 'pequeno')}</div>` : ''}
    ${opera() ? caixaBaixaLote(lista, hoje) : ''}
    ${lista.length ? `<div class="acoes barra-nf">${impressao} <a class="botao secundario" href="#/faturas">Ver NFs</a></div>
      <div class="acoes barra-nf">${link('#/inadimplencia', 'Inadimplência')} <label class="suave" for="ordem-boletos">Ordenar por:</label> <select id="ordem-boletos" data-ordem-boletos="${comp}" style="width:auto">${[['vencimento', 'Data de vencimento'], ['imovel', 'Nome do imóvel'], ['inquilino', 'Nome do inquilino'], ['valor', 'Valor (maior para menor)']]
    .map(([k, t]) => `<option value="${k}" ${(ORDENS_BOLETO[ordem] ? ordem : 'vencimento') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>` : ''}
    <div class="cartao rolagem"><table class="cobrancas">
      <tr><th><input type="checkbox" data-marcar-todas="boleto" title="Selecionar todos"></th><th>Imóvel / inquilino</th><th>Vencimento</th><th class="n">Pontual</th><th class="n">Após vencimento</th><th>Situação</th><th>Multa e juros</th><th class="n">Valor NF</th><th>NF</th></tr>
      ${lista.map(({ cb, c, i, t, fs }) => `<tr class="${R.geraNf(c) ? '' : 'linha-controle'}">
        <td><input type="checkbox" data-boleto="${cb.id}" title="Selecionar (imprimir o demonstrativo ou excluir)"></td>
        <td><a href="#/cobranca/${cb.id}"><b>${esc(i.nome)}</b></a><br>${esc(c.inquilino_nome)}${R.geraNf(c) ? '' : `<br>${seloControle()}`}
          ${cb.dias_cobrados < cb.dias_mes ? `<br>${etiqueta(`proporcional ${cb.dias_cobrados}/${cb.dias_mes} dias`, 'info')}` : ''}
          ${cb.reserva_utilizada > 0 ? `<br>${etiqueta(`usa reserva ${reais(cb.reserva_utilizada)}`, 'aviso')}` : ''}
          ${cb.carencia ? `<br>${etiqueta('carência', 'aviso')}` : ''}
          ${R.ehComplementoCaucao(cb) ? `<br>${etiqueta('complemento da caução · sem NF', 'info')}` : ''}
          ${reajustes.has(c.id) && !R.ehComplementoCaucao(cb) ? `<br>${etiqueta(reajustes.get(c.id).corrigido ? 'reajuste: mandar a carta com este boleto' : 'reajuste: falta aplicar a correção', reajustes.get(c.id).corrigido ? 'aviso' : 'perigo')} ${link(`#/imprimir/carta?contrato=${c.id}&comp=${comp}`, 'Gerar carta', 'botao pequeno')}` : ''}</td>
        <td>${dataBr(cb.vencimento)}
          ${!cb.data_pagamento ? `<br>${botao('copiar', 'Copiar texto do boleto', { texto: R.dadosBoleto(d(), cb).descricao })}` : ''}</td>
        <td class="n">${reais(t.a_pagar_pontual)}</td>
        <td class="n suave">${reais(t.a_pagar_sem_desconto)}<br>${R.ehComplementoCaucao(cb) ? 'sem multa e juros' : `+ multa ${pct(cb.multa_percentual)}<br>+ juros ${pct(cb.juros_mensal_percentual)} a.m.`}</td>
        <td>${cb.data_pagamento || cb.situacao === 'Carência' ? situacaoBoleto(cb, hoje) : `${situacaoBoleto(cb, hoje)}${opera() ? `<br>${formPagamento(cb, true)}` : ''}`}</td>
        <td>${multaJurosTexto(cb)}</td>
        <td class="n">${cb.valor_nf !== null ? reais(cb.valor_nf) : '-'}</td>
        <td>${fs.length ? link(`#/imprimir/faturas?numero=${fs[0].numero}`, `Nº ${R.numeroFatura(fs[0].numero)}`) : !R.geraNf(c) || R.ehComplementoCaucao(cb) ? etiqueta('sem NF', 'controle') : (cb.data_pagamento ? '<span class="suave">aguardando nº</span>' : '-')}
          ${cb.data_pagamento ? `<br><span class="suave">entrou em ${dataBr(cb.data_pagamento)}${cb.dias_atraso ? ` (${cb.dias_atraso} dias de atraso)` : ''}<br>recebido ${reais(cb.valor_pago)}</span>${opera() && !fs.length ? `<br>${botao('estornar', 'Desfazer pagamento', { id: cb.id }, 'secundario pequeno', 'Desfazer este pagamento?')}` : ''}` : ''}</td></tr>`).join('')
      || `<tr><td colspan="9" class="suave">Nenhum boleto gerado para ${compBr(comp)}.</td></tr>`}
      ${lista.length ? `<tr class="total"><td></td><td colspan="2">Total${controle ? ` <span class="suave">(sem ${controle} boleto(s) de controle)</span>` : ''}</td><td class="n">${reais(soma((x) => x.t.a_pagar_pontual))}</td><td></td><td></td><td></td><td class="n">${reais(soma((x) => x.cb.valor_nf || 0))}</td><td></td></tr>` : ''}
    </table></div>
    ${lista.length ? `<div class="acoes">${impressao}</div>` : ''}`;
}

export function demonstrativo(cb) {
  const c = buscar('contratos', cb.contrato_id);
  const i = buscar('imoveis', c.imovel_id);
  const t = R.totais(cb);
  const linha = (txt, v) => `<tr><td>${txt}</td><td class="n">${v}</td></tr>`;
  if (R.ehComplementoCaucao(cb)) {
    return `<div class="demonstrativo"><div class="cabecalho"><div><h2 style="margin:0">Demonstrativo do boleto: complemento da caução</h2><div class="suave">Aluguel corrigido a partir de ${compBr(cb.competencia)}</div></div>
      <div style="text-align:right"><div class="suave">Vencimento</div><div class="maior"><b>${dataBr(cb.vencimento)}</b></div></div></div>
    <div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>
    <p><b>Inquilino:</b> ${esc(c.inquilino_nome)}${c.inquilino_cpf ? ` · CPF/CNPJ ${esc(c.inquilino_cpf)}` : ''}${c.inquilino_telefone ? ` · ${esc(c.inquilino_telefone)}` : ''}</p>
    <table><tr><th>Descrição</th><th class="n">Valor</th></tr>
      ${linha('Caução já depositada', reais(cb.caucao_anterior))}
      ${linha(`Nova caução${c.caucao_meses ? ` (${c.caucao_meses} aluguéis)` : ''}`, reais(cb.caucao_nova))}
      <tr class="total"><td>Depósito adicional a pagar até ${dataBr(cb.vencimento)}</td><td class="n maior">${reais(t.a_pagar_pontual)}</td></tr>
      <tr><td colspan="2" class="suave">Após o vencimento: sem multa e juros.</td></tr></table>
    ${cb.data_pagamento ? `<p><b>Pago em ${dataBr(cb.data_pagamento)}</b>${cb.dias_atraso ? ` com ${cb.dias_atraso} dia(s) de atraso` : ''} · recebido ${reais(cb.valor_pago)}</p>` : ''}
    ${cb.observacoes ? `<p class="pre">${esc(cb.observacoes)}</p>` : ''}</div>`;
  }
  return `<div class="demonstrativo"><div class="cabecalho"><div><h2 style="margin:0">Demonstrativo do boleto de aluguel</h2><div class="suave">Competência ${compBr(cb.competencia)}</div></div>
      <div style="text-align:right"><div class="suave">Vencimento</div><div class="maior"><b>${dataBr(cb.vencimento)}</b></div></div></div>
    <div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>
    <p><b>Inquilino:</b> ${esc(c.inquilino_nome)}${c.inquilino_cpf ? ` · CPF/CNPJ ${esc(c.inquilino_cpf)}` : ''}${c.inquilino_telefone ? ` · ${esc(c.inquilino_telefone)}` : ''}</p>
    <table><tr><th>Descrição</th><th class="n">Valor</th></tr>
      ${cb.carencia ? linha('Aluguel: carência (não cobrado neste mês)', reais(0)) : linha(`Aluguel${cb.dias_cobrados < cb.dias_mes ? ` proporcional: ${cb.dias_cobrados} de ${cb.dias_mes} dias de ${reais(cb.aluguel_mensal)}` : ''}`, `${reais(cb.aluguel)}${cb.desconto ? ` <span class="suave">(Bonif. ${reais(cb.aluguel - cb.desconto)})</span>` : ''}`)}
      ${cb.iptu ? linha(`IPTU${cb.iptu_parcela ? ` (${esc(cb.iptu_parcela)})` : ''}`, reais(cb.iptu)) : ''}
      ${cb.seguro ? linha(`Seguro obrigatório${cb.seguro_parcela ? ` (${esc(cb.seguro_parcela)})` : ''}`, reais(cb.seguro)) : ''}
      ${cb.taxa_boleto ? linha('Tarifa de emissão do boleto', reais(cb.taxa_boleto)) : ''}
      ${cb.fci ? linha(`FCI: fundo de conservação do imóvel${c.fci_percentual ? ` (${pct(c.fci_percentual)} do aluguel bonificado)` : ''}, devolvido corrigido na saída`, reais(cb.fci)) : ''}
      ${cb.outros > 0 ? linha(`Cobrança adicional${cb.outros_descricao ? `: ${esc(cb.outros_descricao)}` : ''}`, reais(cb.outros)) : ''}
      ${cb.outros < 0 ? linha(`(-) Ressarcimento${cb.outros_descricao ? `: ${esc(cb.outros_descricao)}` : ''}`, `- ${reais(-cb.outros)}`) : ''}
      <tr class="total"><td>Total sem desconto</td><td class="n">${reais(t.total_sem_desconto)}</td></tr>
      ${cb.desconto ? linha('(-) Desconto de pontualidade, se pago até o vencimento', `- ${reais(cb.desconto)}`) : ''}
      ${cb.reserva_utilizada ? linha('(-) Reserva paga na visita, abatida neste mês', `- ${reais(cb.reserva_utilizada)}`) : ''}
      ${cb.ressarcimento ? linha(`(-) Ressarcimento de taxa do condomínio (${esc(cb.ressarcimento_descricao || '')})`, `- ${reais(cb.ressarcimento)}`) : ''}
      <tr class="total"><td>Valor a pagar até ${dataBr(cb.vencimento)}</td><td class="n maior">${reais(t.a_pagar_pontual)}</td></tr>
      <tr><td colspan="2" class="suave">Após o vencimento: ${reais(t.a_pagar_sem_desconto)} + multa de ${pct(cb.multa_percentual)} + juros de ${pct(cb.juros_mensal_percentual)} ao mês, pro rata dia${cb.fci ? ` (sobre ${reais(t.base_multa)}: o FCI não tem multa nem juros)` : ''}.</td></tr></table>
    ${cb.data_pagamento ? `<p><b>Pago em ${dataBr(cb.data_pagamento)}</b>${cb.pagou_em_dia ? ' (pagou até o vencimento; compensado depois)' : ''}${cb.dias_atraso ? ` com ${cb.dias_atraso} dia(s) de atraso${cb.data_pagou ? ` (pagou em ${dataBr(cb.data_pagou)})` : ''}: multa ${pct(cb.multa_percentual)} = ${reais(cb.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(cb.juros)}` : ''} · recebido ${reais(cb.valor_pago)}</p>` : ''}
    ${cb.observacoes ? `<p class="pre">${esc(cb.observacoes)}</p>` : ''}</div>`;
}

/** Ajuste do mês: cobrança adicional ou ressarcimento (reforma, acerto etc.). Fica no histórico. */
function caixaAjuste(cb) {
  if (!opera() || cb.data_pagamento || R.ehComplementoCaucao(cb)) return '';
  const tipo = cb.outros < 0 ? 'ressarcimento' : 'adicional';
  return `<div class="cartao"><h2>Ajuste deste mês</h2>
    <p class="suave">Para corrigir o valor do boleto: cobrar algo a mais ou devolver/descontar um valor (reforma, acerto do mês anterior etc.). Fica registrado no histórico do inquilino.</p>
    <form data-form="ajuste" data-id="${cb.id}" class="acoes">
      <select name="tipo" style="width:auto"><option value="adicional" ${tipo === 'adicional' ? 'selected' : ''}>Cobrança adicional (+)</option><option value="ressarcimento" ${tipo === 'ressarcimento' ? 'selected' : ''}>Ressarcimento (−)</option></select>
      <input name="valor" inputmode="decimal" placeholder="Valor" value="${cb.outros ? esc(F.dinheiroTexto(Math.abs(cb.outros))) : ''}" style="width:130px">
      <input name="motivo" placeholder="Motivo (ex.: reforma do banheiro)" value="${esc(cb.outros_descricao || '')}" style="flex:1;min-width:220px">
      <button class="secundario">Salvar ajuste</button>
      ${cb.outros ? botao('tirarAjuste', 'Tirar ajuste', { id: cb.id }, 'perigo pequeno', 'Tirar o ajuste deste boleto?') : ''}</form></div>`;
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
    <h3>Descrição</h3><div class="acoes"><pre class="descricao-boleto">${esc(b.descricao)}</pre>${botao('copiar', 'Copiar descrição', { texto: b.descricao }, '')}</div></div>`;
}

export function telaCobranca(cb) {
  const c = buscar('contratos', cb.contrato_id);
  const fs = R.faturasDe(d(), 'cobranca', cb.id, false);
  const validas = fs.filter((f) => f.situacao === 'Emitida');
  const sim = cb.data_pagamento ? null : C.liquidar(cb, C.hojeIso());
  return `<div class="nao-imprimir"><p class="suave"><a href="#/cobrancas?comp=${cb.competencia}">← Boletos de ${compBr(cb.competencia)}</a> · <a href="#/contrato/${c.id}">${esc(c.inquilino_nome)}</a></p>
    <div class="cabecalho"><h1>Boleto ${R.ehComplementoCaucao(cb) ? 'do complemento da caução' : compBr(cb.competencia)} ${situacao(cb.situacao)}</h1><div class="acoes">
      <button class="secundario" data-acao="imprimir">Imprimir demonstrativo</button>${botao('baixarPdfTela', 'Baixar PDF', { seletor: '.demonstrativo', nome: nomeArquivoDoc(R.ehComplementoCaucao(cb) ? 'Demonstrativo complemento caução' : 'Demonstrativo boleto', c, cb.competencia) }, 'secundario')}
      ${opera() && !cb.data_pagamento ? `${R.ehComplementoCaucao(cb) ? '' : link(`#/editar/cobrancas/${cb.id}`, 'Alterar valores', 'botao secundario')} ${botao('excluir', 'Excluir', { tabela: 'cobrancas', id: cb.id }, 'perigo', 'Excluir este boleto?')}` : ''}</div></div>
    ${cb.editado_manual && !cb.data_pagamento ? `<div class="alerta info">Valores alterados à mão: este boleto não é recalculado sozinho quando o cadastro muda. ${opera() ? botao('recalcularBoleto', 'Voltar a calcular pelo cadastro', { id: cb.id }, 'secundario pequeno', 'Recalcular este boleto pelo cadastro? Os valores digitados à mão serão substituídos (o ajuste do mês fica).') : ''}</div>` : ''}</div>
    ${R.geraNf(c) ? '' : `<div class="alerta controle nao-imprimir"><b>Boleto de controle.</b> Este inquilino ${AVISO_CONTROLE}</div>`}
    ${demonstrativo(cb)}
    <div class="nao-imprimir">${caixaAjuste(cb)}<div class="cartao" id="pagamento"><h2>Pagamento</h2>
      ${!cb.data_pagamento && memoria.pagamentoDivergente && memoria.pagamentoDivergente.id === cb.id ? formNfDivergente(cb, memoria.pagamentoDivergente) : cb.data_pagamento ? `<div class="grade">${item('Pago em', dataBr(cb.data_pagamento))}${item('Situação', `${esc(cb.situacao)}${cb.dias_atraso ? ` (${cb.dias_atraso} dias)` : ''}`)}
        ${R.ehComplementoCaucao(cb) ? '' : `${item(`Multa (${pct(cb.multa_percentual)})`, reais(cb.multa))}${item(`Juros (${pct(cb.juros_mensal_percentual)} ao mês)`, reais(cb.juros))}`}
        ${item('Valor recebido', reais(cb.valor_pago))}${R.ehComplementoCaucao(cb) ? '' : item('Valor da nota fiscal', `<span class="maior">${reais(cb.valor_nf)}</span>${cb.nf_manual ? ` ${etiqueta('digitado à mão', 'aviso')}` : ''}`)}</div>
        ${cb.nf_manual ? '<p class="suave">Valor recebido diferente do previsto: a NF saiu com o valor digitado à mão (a justificativa está no histórico).</p>' : R.ehComplementoCaucao(cb) ? '<p class="suave">Complemento da caução: não gera NF. Ao confirmar o pagamento, a caução foi corrigida (veja Garantia, na página do inquilino).</p>' : `<p class="suave">Nota fiscal = ${cb.dias_atraso ? `aluguel ${reais(cb.aluguel)} + multa ${reais(cb.multa)} + juros ${reais(cb.juros)} (pagou atrasado, sem desconto). ` : `aluguel ${reais(cb.aluguel)} - desconto ${reais(cb.desconto)} (pagou em dia)`}. IPTU, seguro, tarifa, FCI e ajuste do mês não entram.</p>`}
        ${opera() ? botao('estornar', 'Desfazer pagamento', { id: cb.id }, 'perigo pequeno', validas.length ? 'Desfazer o pagamento? A NF será cancelada e o número não será reaproveitado.' : 'Desfazer o pagamento?') : ''}`
      : `<p>Se for pago hoje (${dataBr(C.hojeIso())}): <b>${reais(sim.valor_devido)}</b>${sim.pontual ? '' : R.ehComplementoCaucao(cb) ? ` (${sim.dias_atraso} dias de atraso, sem multa e juros)` : ` (${sim.dias_atraso} dias de atraso: multa ${pct(cb.multa_percentual)} = ${reais(sim.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(sim.juros)})`}${R.ehComplementoCaucao(cb) ? ' · sem NF (complemento da caução)' : ` · nota fiscal ${reais(sim.valor_nf)}`}</p>
        ${opera() && cb.situacao !== 'Carência' ? formPagamento(cb, false) : ''}`}</div>
    ${caixaBoleto(cb)}
    <div class="cartao"><h2>NFs</h2><table><tr><th>Nº</th><th>Empresa</th><th>Emissão</th><th>Período</th><th class="n">%</th><th class="n">Valor</th><th>Situação</th></tr>
      ${fs.map((f) => `<tr><td>${R.numeroFatura(f.numero)}</td><td>${esc(buscar('emitentes', f.emitente_id).nome)}</td><td>${dataBr(f.emissao)}</td><td>${dataBr(f.periodo_inicio)} a ${dataBr(f.periodo_fim)}</td><td class="n">${pct(f.percentual)}</td><td class="n">${reais(f.valor)}</td><td>${etiqueta(f.situacao, f.situacao === 'Emitida' ? 'ok' : 'perigo')}</td></tr>`).join('')
      || `<tr><td colspan="7" class="suave">${!R.geraNf(c) ? 'Este inquilino não emite NF (só controle do pagamento).' : R.ehComplementoCaucao(cb) ? 'Complemento da caução: não gera NF.' : cb.data_pagamento ? 'Aguardando numeração (tela NF).' : 'Confirme o pagamento para gerar a NF.'}</td></tr>`}</table>
      ${cb.data_pagamento && !validas.length && R.geraNf(c) && !R.ehComplementoCaucao(cb) && opera() ? `<p>${formNfExterna('cobranca', cb.id, cb.data_pagamento)}</p>` : ''}
      ${validas.length ? `<p class="acoes">${link(`#/imprimir/faturas?numero=${validas[0].numero}`, 'Ver / imprimir NF', 'botao')} ${botao('excel', 'Baixar Excel', { numero: validas[0].numero })}</p>` : ''}</div></div>`;
}
