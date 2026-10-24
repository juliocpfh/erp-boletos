// Reajuste anual do aluguel (#/reajustes): índices acumulados, reajustes em aberto e feitos, caução a completar e carta de reajuste.
import * as C from '../calculos.js';
import { compBr, dataBr, pct, reais } from '../calculos.js';
import * as K from '../contratos.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao, buscar, d, etiqueta, link, opera } from './comum.js';

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const dataExtenso = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;

/** Botões do reajuste de um contrato numa competência (gerar carta, marcar enviada, aplicar correção). */
export function botoesReajuste(c, r, naCarta = false) {
  // reajuste de ano anterior: só a correção (sem carta)
  const carta = !r.comCarta || (!r.faltaCarta && !r.carta) ? '' : `${naCarta ? '' : link(`#/imprimir/carta?contrato=${c.id}&comp=${r.competencia}`, 'Gerar carta', 'botao pequeno')}
    ${opera() ? botao('cartaEnviada', r.carta ? `carta enviada em ${dataBr(r.carta.enviada_em)} ✓` : 'Marcar carta enviada', { contrato: c.id, comp: r.competencia, enviada: r.carta ? '' : '1' }, r.carta ? 'link-botao' : 'secundario pequeno', r.carta ? 'Desfazer o envio da carta?' : '') : ''}`;
  if (r.corrigido) return `${etiqueta(`corrigido: ${reais(r.corrigido.valor_novo)}`, 'ok')} ${carta}`;
  if (!opera()) return carta;
  // sem o índice cadastrado (ex.: reajuste de ano anterior): digita o % ou o novo valor
  const k = r.calculo || R.calcularReajuste(d(), c, r.competencia);
  return `${carta}
    ${k.percentual !== null ? botao('aplicarReajuste', 'Aplicar correção', { contrato: c.id, comp: r.competencia }, 'secundario pequeno', `Registrar a correção do aluguel de ${compBr(r.competencia)} no contrato? Os boletos em aberto são recalculados.`)
    : `<form data-form="aplicarReajusteManual" data-contrato="${c.id}" data-comp="${r.competencia}" data-atual="${k.atual}" data-bonif="${R.percentualBonificacao(c)}" class="acoes"><input name="percentual" placeholder="%" inputmode="decimal" style="width:70px" title="Percentual da correção: calcula o novo valor ao lado">
      <span class="suave">→</span> <input name="valor_novo" placeholder="novo valor" inputmode="decimal" style="width:110px" title="Novo aluguel cheio (calculado pelo %; pode arredondar)"><span class="suave nw" data-bonificado></span><button class="secundario pequeno">Aplicar correção</button></form>`}`;
}

/** Caução do reajuste já aplicado (tela Reajustes): boletos do complemento ou o botão para gerar/confirmar. */
function caucaoDoReajuste(c, correcao) {
  if (!R.temCaucao(c)) return '<span class="suave">-</span>';
  const boletos = R.boletosCaucaoDa(d(), correcao);
  if (boletos.length) return boletos.map((x) => `${link(`#/cobranca/${x.id}`, `${x.caucao_parcela ? `${x.caucao_parcela} · ` : ''}${reais(x.caucao_complemento)}`, '')} ${x.data_pagamento ? etiqueta(`pago ${dataBr(x.data_pagamento)}`, 'ok') : `<span class="suave">vence ${dataBr(x.vencimento)}</span>`}`).join('<br>');
  const x = R.complementoCaucao(d(), c);
  if (!x || x.correcao.id !== correcao.id) return R.correcoesGarantiaDo(d(), c.id).some((g) => g.data >= correcao.data_vigencia) ? etiqueta('caução corrigida', 'ok') : '<span class="suave">-</span>';
  return etiqueta('a completar (ver "Caução a completar")', 'aviso');
}

/** Tela Reajustes: caução a completar depois de reajuste ou de novo valor negociado (o único lugar para o complemento). */
function caixaCaucaoACompletar(q) {
  const lista = R.caucoesACompletar(d());
  const acao = ({ contrato: c, x, abertos }) => {
    if (abertos.length) return abertos.map((cb) => `${link(`#/cobranca/${cb.id}`, `${cb.caucao_parcela ? `${cb.caucao_parcela} · ` : ''}${reais(cb.caucao_complemento)}`, '')} <span class="suave">vence ${dataBr(cb.vencimento)}</span>`).join('<br>');
    if (x.necessaria === null) return '<span class="suave">informe no contrato a quantos aluguéis a caução equivale</span>';
    if (!opera()) return '';
    return x.complemento > 0 ? `${botao('gerarBoletoCaucao', 'Gerar boleto de complemento', { contrato: c.id }, 'pequeno')} ${botao('complementoDepositado', 'Registrar depósito', { contrato: c.id }, 'secundario pequeno')}`
      : botao('confirmarCaucao', `Confirmar caução (${reais(x.atual)} já cobre)`, { contrato: c.id }, 'secundario pequeno');
  };
  return `<div class="cartao rolagem" id="caucao" data-caixa="Caução a completar"><h2>Caução a completar (${lista.length})</h2>
    <p class="suave">Depois do reajuste ou de um novo valor negociado, a caução passa a aluguéis × aluguel corrigido com bonificação. O complemento é tratado só aqui: boleto (com o vencimento que quiser e parcelas; sem tarifa e sem NF; cada parcela paga soma na caução) ou depósito já feito pelo inquilino.</p>
    <table><tr><th>Imóvel / inquilino</th><th>Por causa de</th><th class="n">Caução atual</th><th class="n">Necessária</th><th class="n">Complemento</th><th>Boleto ou depósito</th></tr>
    ${lista.map((y) => { const c = y.contrato; const i = buscar('imoveis', c.imovel_id); const x = y.x;
    const motivo = x ? (x.correcao.indice === 'Negociado' ? `novo valor negociado (${dataBr(x.correcao.data_vigencia)})` : `reajuste de ${compBr(x.competencia)}`) : 'boleto em aberto';
    return `<tr class="${String(c.id) === q.contrato ? 'amarelo' : ''}"><td><a href="#/contrato/${c.id}"><b>${esc(i ? i.nome : '')}</b></a><br>${esc(c.inquilino_nome)}</td><td>${motivo}</td>
      <td class="n">${reais(R.valorGarantia(d(), c))}</td><td class="n">${x && x.necessaria !== null ? reais(x.necessaria) : '-'}</td><td class="n"><b>${x && x.complemento > 0 ? reais(x.complemento) : y.abertos.length ? reais(y.abertos.reduce((t, cb) => t + cb.caucao_complemento, 0)) : '-'}</b></td>
      <td class="nw">${acao(y)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="suave">Nenhuma caução a completar.</td></tr>'}</table></div>`;
}

/** Reajustes: índices acumulados informados por vocês e os contratos que corrigem nos próximos meses. */
export function telaReajustes(q) {
  const atual = C.competenciaDe(C.hojeIso());
  const todos = q.todos === '1';
  // em aberto: de qualquer ano; já reajustados: os 3 últimos (ou todo o histórico)
  const lista = R.reajustesAbertos(d());
  const feitos = R.reajustesFeitos(d());
  const ultimaDo = (c) => R.correcoesDo(d(), c.id).pop();
  // índices em grade compacta: uma linha por mês (12 mais recentes), uma coluna por índice
  const colunas = [...new Set(d().indices_acumulados.map((x) => x.indice))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const meses = [...new Set(d().indices_acumulados.map((x) => x.mes_ref))].sort().reverse().slice(0, 12);
  const celula = (mes, nome) => {
    const x = d().indices_acumulados.find((y) => y.mes_ref === mes && y.indice === nome);
    return x ? `${pct(x.percentual)}${opera() ? ` ${botao('excluir', '×', { tabela: 'indices_acumulados', id: x.id }, 'link-botao excluir-mini', `Excluir ${x.indice} de ${compBr(mes)}?`)}` : ''}` : '<span class="suave">-</span>';
  };
  const nomesIndices = [...new Set(R.lista(d(), 'indices').flatMap((n) => n.replace(/\(.*\)/, '').split('/').map((x) => x.trim())).filter(Boolean))];
  return `<h1>Reajustes do aluguel</h1>
    <p class="suave">O aluguel é corrigido no 13º mês do contrato e a cada 12 meses depois. O mês de entrada conta como o 1º mês, seja qual for o dia em que o inquilino entrou. O índice acumulado até o mês anterior sai no começo do mês do reajuste: aí aplique a correção e mande a carta junto com o boleto do próprio aluguel corrigido (ex.: aluguel de 11/2026, índice até 10/2026, boleto emitido no fim de novembro com vencimento em dezembro).</p>
    <div class="cartao"><h2>Índices acumulados em 12 meses</h2>
      <p class="suave">Informe o acumulado de 12 meses de cada índice, com o mês até onde ele vai. O reajuste de um aluguel usa o mais recente até o mês anterior ao corrigido.</p>
      ${opera() ? `<form data-form="indiceAcumulado" class="acoes"><select name="indice" style="width:auto">${nomesIndices.map((n) => `<option>${esc(n)}</option>`).join('')}</select>
        <input type="month" name="mes_ref" value="${C.somarMeses(atual, -1)}" style="width:170px" title="Mês até onde vai o acumulado"><input name="percentual" placeholder="% acumulado" inputmode="decimal" style="width:130px"><button class="pequeno">Incluir</button></form>
        <div data-indice-msg class="suave">Escolha o índice e o mês: IGP-M, IPCA, INPC e IGP-DI vêm do Banco Central para você conferir. Os outros (ex.: IVAR) são digitados.</div>` : ''}
      ${meses.length ? `<table class="indices-compacta"><tr><th>Acumulado até</th>${colunas.map((n) => `<th class="n">${esc(n)}</th>`).join('')}</tr>
      ${meses.map((m) => `<tr><td>${compBr(m)}</td>${colunas.map((n) => `<td class="n nw">${celula(m, n)}</td>`).join('')}</tr>`).join('')}</table>` : '<p class="suave">Nenhum índice informado.</p>'}</div>
    <div class="cartao rolagem" data-caixa="Reajustes"><h2>Reajustes em aberto (${lista.length})</h2>
      <p class="suave">Todos os reajustes do aluguel e da caução, de qualquer ano, são aplicados aqui (na página do inquilino fica só o histórico). De anos anteriores não há carta; sem o índice daquele mês cadastrado, digite o % ou o novo valor. Ao aplicar, o sistema pergunta o vencimento e as parcelas do boleto do complemento da caução.</p>
      <table><tr><th>Aluguel de</th><th>Imóvel / inquilino</th><th>Índice</th><th class="n">Atual (bonificado)</th><th class="n">Novo (bonificado)</th><th>Caução</th><th>Carta e correção</th></tr>
      ${lista.map((r) => { const k = r.calculo; const c = r.contrato; const i = buscar('imoveis', c.imovel_id);
    const caucao = r.corrigido ? caucaoDoReajuste(c, r.corrigido) : R.temCaucao(c) && R.garantiaDepositada(c) && c.caucao_meses > 0 && k.novoBonificado !== null
      ? `${reais(R.valorGarantia(d(), c))} → <b>${reais(c.caucao_meses * k.novoBonificado)}</b>` : '<span class="suave">-</span>';
    return `<tr class="${String(c.id) === q.contrato ? 'amarelo' : ''}"><td><b>${compBr(r.competencia)}</b><br><span class="suave">${r.comCarta ? `carta com o boleto deste aluguel (vence em ${dataBr(R.vencimentoDoReajuste(d(), c, r.competencia))})` : 'ano anterior: sem carta'}</span></td>
        <td><a href="#/contrato/${c.id}"><b>${esc(i ? i.nome : '')}</b></a><br>${esc(c.inquilino_nome)} · ${r.anos} ano(s)</td>
        <td>${esc(k.indiceContrato || 'não informado')}${k.escolhido ? `<br><span class="suave">usa ${esc(k.escolhido.indice)} até ${compBr(k.escolhido.registro.mes_ref)}: ${pct(k.percentual)}</span>` : k.faltando.length ? `<br>${etiqueta(`falta ${k.faltando.join(' e ')}`, 'perigo')}` : ''}</td>
        <td class="n">${reais(k.atual)}${k.bonificacao ? ` <span class="suave">(${reais(k.atualBonificado)})</span>` : ''}</td>
        <td class="n">${k.novo !== null ? `<b>${reais(k.novo)}</b>${k.bonificacao ? ` <span class="suave">(${reais(k.novoBonificado)})</span>` : ''}` : '-'}</td>
        <td class="nw">${caucao}</td>
        <td class="nw">${botoesReajuste(c, r)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="suave">Nenhum reajuste em aberto.</td></tr>'}</table>
      <p class="suave">Valores: aluguel cheio e, entre parênteses, o valor bonificado (só aparece quando o contrato tem bonificação).</p></div>
    ${caixaCaucaoACompletar(q)}
    <div class="cartao rolagem" data-caixa="Já reajustados"><div class="cabecalho"><h2>Já reajustados${todos ? '' : ' (os 3 últimos)'}</h2>
      ${feitos.length > 3 ? link(`#/reajustes${todos ? '' : '?todos=1'}`, todos ? 'Mostrar só os 3 últimos' : `Mostrar todos (${feitos.length})`, 'botao secundario pequeno') : ''}</div>
      <table><tr><th>Vale a partir de</th><th>Imóvel / inquilino</th><th>Índice</th><th class="n">Anterior</th><th class="n">Novo</th><th>Caução</th><th>Carta</th><th></th></tr>
      ${(todos ? feitos : feitos.slice(0, 3)).map(({ correcao: x, contrato: c }) => { const i = buscar('imoveis', c.imovel_id); const r = R.reajusteNaCompetencia(d(), c, x.data_vigencia.slice(0, 7));
    return `<tr class="${String(c.id) === q.contrato ? 'amarelo' : ''}"><td class="nw">${dataBr(x.data_vigencia)}</td><td><a href="#/contrato/${c.id}"><b>${esc(i ? i.nome : '')}</b></a><br>${esc(c.inquilino_nome)}</td>
        <td>${esc(x.indice || '-')} ${pct(x.percentual)}</td><td class="n">${reais(x.valor_anterior)}</td><td class="n"><b>${reais(x.valor_novo)}</b></td>
        <td class="nw">${caucaoDoReajuste(c, x)}</td><td class="nw">${r && r.comCarta ? botoesReajuste(c, r) : '<span class="suave">-</span>'}</td>
        <td class="n">${opera() && ultimaDo(c) === x ? botao('desfazerReajuste', 'Desfazer correção', { id: x.id }, 'perigo pequeno', `Desfazer a correção de ${dataBr(x.data_vigencia)} de ${c.inquilino_nome}? O aluguel volta a ${reais(x.valor_anterior)}, os boletos em aberto são recalculados e os boletos da caução ainda não pagos deste reajuste são excluídos.`) : ''}</td></tr>`; }).join('')
      || '<tr><td colspan="8" class="suave">Nenhum reajuste aplicado ainda.</td></tr>'}</table>
      <p class="suave">"Desfazer correção" aparece só na correção mais recente de cada inquilino; com boleto da caução já pago, desfaça o pagamento antes.</p></div>`;
}

/** Carta de reajuste com a logo: felicitações por mais um ano e os novos valores. */
export function cartaReajuste(c, comp) {
  const i = buscar('imoveis', c.imovel_id);
  const r = R.reajusteNaCompetencia(d(), c, comp);
  const k = R.calcularReajuste(d(), c, comp);
  const empresa = K.locadorasDoContrato(d(), c)[0] || { nome: '' };
  const anterior = C.somarMeses(comp, -1);
  const vencNovo = C.vencimentoDaCompetencia(comp, c.dia_vencimento || 10, c.cobranca_mes_seguinte !== false);
  if (k.percentual === null) {
    return `<div class="alerta perigo nao-imprimir">Falta informar o índice acumulado de ${esc(k.faltando.join(' e ') || 'o índice do contrato')} até ${compBr(anterior)}. ${link('#/reajustes', 'Informar em Reajustes')}</div>`;
  }
  // caução: acompanha o aluguel corrigido (aluguéis × aluguel com bonificação); só aparece quando falta depositar
  let caucao = R.temCaucao(c) && c.caucao_meses > 0 ? { meses: c.caucao_meses, aluguel: k.novoBonificado, nova: c.caucao_meses * k.novoBonificado, atual: R.valorGarantia(d(), c) } : null;
  if (caucao && !(caucao.nova > caucao.atual)) caucao = null;
  return `<div class="carta">
    ${d().logo ? `${K.marcaDagua(d().logo)}<p><img class="carta-logo" src="${esc(d().logo)}" alt="Logo"></p>` : ''}
    <p class="carta-data">${esc((i && i.cidade) || 'Curitiba')}, ${dataExtenso(C.hojeIso())}.</p>
    <p>Prezado(a) <b>${esc(c.inquilino_nome)}</b>,<br>Imóvel: <b>${esc(i ? `${i.nome} - ${R.enderecoCompleto(i)}` : '')}</b></p>
    <p>Com o aluguel de <b>${MESES[Number(comp.slice(5, 7)) - 1]} de ${comp.slice(0, 4)}</b> completamos <b>${r ? r.anos : ''} ano${r && r.anos > 1 ? 's' : ''}</b> de parceria. Agradecemos a confiança e a pontualidade, e é uma satisfação ter você conosco.</p>
    <p>Conforme a cláusula de reajuste anual do contrato, o aluguel será corrigido pelo <b>${esc(k.escolhido.indice)}</b> acumulado nos últimos 12 meses: <b>${esc(k.escolhido.indice)} ${pct(k.percentual)}</b>.</p>
    <table class="carta-tabela"><tr><th></th><th class="n">Atual</th><th class="n">A partir do aluguel de ${compBr(comp)}</th></tr>
      <tr><td>Aluguel</td><td class="n">${reais(k.atual)}</td><td class="n"><b>${reais(k.novo)}</b></td></tr>
      ${k.bonificacao ? `<tr><td>Aluguel com bonificação (pagamento em dia)</td><td class="n">${reais(k.atualBonificado)}</td><td class="n"><b>${reais(k.novoBonificado)}</b></td></tr>` : ''}</table>
    <p>O novo valor será cobrado a partir do boleto do aluguel de <b>${compBr(comp)}</b>, com vencimento em <b>${dataBr(vencNovo)}</b>.${caucao ? '' : ' As demais condições do contrato permanecem as mesmas.'}</p>
    ${caucao ? `<p>Conforme o contrato, a caução dada em garantia equivale a <b>${caucao.meses} aluguéis</b> e acompanha o valor do aluguel corrigido. Por isso é necessário um depósito adicional:</p>
    <table class="carta-tabela"><tr><td>Caução já depositada</td><td class="n">${reais(caucao.atual)}</td></tr>
      <tr><td>Caução necessária (${caucao.meses} × aluguel atualizado)</td><td class="n">${reais(caucao.nova)}</td></tr>
      <tr><td><b>Depósito adicional</b></td><td class="n"><b>${reais(caucao.nova - caucao.atual)}</b></td></tr></table>
    <p>O depósito adicional será cobrado em <b>boleto separado</b>, com vencimento em <b>${dataBr(vencNovo)}</b>. As demais condições do contrato permanecem as mesmas.</p>` : ''}
    <p>Seguimos à sua disposição para sanar qualquer dúvida.</p>
    <p>Atenciosamente,<br><b>${esc(empresa.nome)}</b></p></div>`;
}
