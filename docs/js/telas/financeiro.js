// Financeiro: inadimplência, contas pagas por nós, resultados por imóvel e impostos esperados por empresa.
import * as C from '../calculos.js';
import { compBr, dataBr, pct, reais } from '../calculos.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao, buscar, d, etiqueta, link, opera } from './comum.js';

/** Inadimplência: quem está devendo, há quantos dias, quanto hoje; e quem costuma atrasar. */
export function telaInadimplencia() {
  const hoje = C.hojeIso();
  const r = R.inadimplencia(d(), hoje);
  const imovelDe = (c) => (buscar('imoveis', c.imovel_id) || {}).nome || '';
  return `<div class="cabecalho"><h1>Inadimplência</h1>${link('#/cobrancas', 'Ver boletos')}</div>
    <div class="numeros">
      <div class="cartao"><div class="grande">${r.devedores.length}</div>inquilino(s) em atraso</div>
      <div class="cartao"><div class="grande">${r.devedores.reduce((s, x) => s + x.boletos.length, 0)}</div>boleto(s) vencido(s)</div>
      <div class="cartao"><div class="grande">${reais(r.total)}</div>em aberto (valor do boleto)</div>
      <div class="cartao"><div class="grande">${reais(r.totalHoje)}</div>hoje, com multa e juros</div></div>
    <div class="cartao rolagem"><h2>Em atraso agora</h2><table><tr><th>Imóvel / inquilino</th><th>Boletos vencidos</th><th class="n">Dias (mais antigo)</th><th class="n">Em aberto</th><th class="n">Hoje, com multa e juros</th></tr>
      ${r.devedores.map((x) => `<tr class="${x.diasMax > R.DIAS_VERMELHO ? 'fora' : ''}"><td><a href="#/contrato/${x.contrato.id}"><b>${esc(imovelDe(x.contrato))}</b></a><br>${esc(x.contrato.inquilino_nome)}${x.contrato.inquilino_telefone ? `<br><span class="suave">${esc(x.contrato.inquilino_telefone)}</span>` : ''}${R.geraNf(x.contrato) ? '' : `<br>${etiqueta('boleto de controle', 'controle')}`}</td>
        <td>${x.boletos.map((b) => `<a href="#/cobranca/${b.cobranca.id}">${compBr(b.cobranca.competencia)}</a> <span class="suave">venceu ${dataBr(b.cobranca.vencimento)} · ${b.dias} dia(s)</span>`).join('<br>')}</td>
        <td class="n"><b>${x.diasMax}</b></td><td class="n">${reais(x.total)}</td><td class="n"><b>${reais(x.totalHoje)}</b></td></tr>`).join('')
      || '<tr><td colspan="5" class="suave">Nenhum boleto vencido em aberto. 🎉</td></tr>'}</table>
      <p class="suave">Mais de ${R.DIAS_VERMELHO} dias em vermelho. "Hoje" é o que o banco cobraria se pagasse hoje (sem desconto, com multa e juros). Quem está aqui também aparece nos Alertas do Painel.</p></div>
    <div class="cartao rolagem"><h2>Quem costuma atrasar (últimos 12 meses)</h2><table><tr><th>Imóvel / inquilino</th><th class="n">Pagos com atraso</th><th class="n">Atraso médio</th><th class="n">Maior atraso</th></tr>
      ${r.historico.map((x) => `<tr><td><a href="#/contrato/${x.contrato.id}"><b>${esc(imovelDe(x.contrato))}</b></a><br>${esc(x.contrato.inquilino_nome)}</td>
        <td class="n">${x.atrasados} de ${x.pagos}</td><td class="n">${x.mediaDias} dia(s)</td><td class="n">${x.maiorAtraso} dia(s)</td></tr>`).join('')
      || '<tr><td colspan="4" class="suave">Ninguém pagou com atraso nos últimos 12 meses.</td></tr>'}</table>
      <p class="suave">Conta os boletos pagos depois do vencimento (quem marcou "pagou em dia" não conta).</p></div>`;
}

/** Contas que nós pagamos num imóvel: lançar o mês de uma vez e ver os lançamentos. */
/** Mês sugerido para lançar contas: o atual, ou o mais recente (até 2 meses atrás) que tenha conta nossa. */
function mesComContas(imovelId) {
  const atual = C.competenciaDe(C.hojeIso());
  for (let k = 0; k <= R.MESES_DEPOIS_DE_ALUGAR; k += 1) {
    const m = C.somarMeses(atual, -k);
    if (R.contasPermitidas(d(), imovelId, m).tipos.length) return m;
  }
  return atual;
}

export function telaContas(rota) {
  const i = buscar('imoveis', rota.partes[1]);
  if (!i) return '<h1>Imóvel não encontrado</h1>';
  const comp = rota.q.comp || mesComContas(i.id);
  const ultimos = R.ultimosValores(d(), i.id);
  const permitidas = R.contasPermitidas(d(), i.id, comp);
  const doMes = R.despesasDo(d(), i.id).filter((x) => x.competencia === comp);
  const hoje = C.hojeIso();
  const lista = R.despesasDo(d(), i.id).slice(0, 60);
  const linha = (tipo, n) => {
    const u = ultimos[tipo];
    const ja = doMes.filter((x) => x.tipo === tipo).reduce((t, x) => t + x.valor, 0);
    if (!permitidas.tipos.includes(tipo)) return '';
    return `<tr><td><b>${esc(tipo)}</b><input type="hidden" name="tipo_${n}" value="${esc(tipo)}"></td>
      <td><input name="valor_${n}" data-dinheiro inputmode="decimal" placeholder="${u ? F.dinheiroTexto(u.valor) : '0,00'}" style="width:130px"></td>
      <td><input type="date" name="data_${n}" value="${hoje}" style="width:auto"></td>
      <td><input name="obs_${n}" placeholder="${tipo === 'Outra' ? 'qual conta? (ex.: taxa de lixo)' : 'opcional'}"></td>
      <td class="suave nw">${u ? `último: ${reais(u.valor)} (${compBr(u.competencia)})` : ''}${ja ? `<br><b>já lançado neste mês: ${reais(ja)}</b>` : ''}</td></tr>`;
  };
  return `<p class="suave"><a href="#/resultados">← Resultados</a> · <a href="#/imovel/${i.id}">${esc(i.nome)}</a></p>
    <h1>Contas pagas por nós · ${esc(i.nome)}</h1>
    <div class="alerta ${permitidas.tipos.length ? 'info' : 'aviso'}">${{
    vago: `<b>Imóvel vago em ${compBr(comp)}:</b> as contas são nossas.`,
    alugou: `<b>Alugado há pouco</b> (entrada de ${esc(permitidas.contrato ? permitidas.contrato.inquilino_nome : '')} em ${permitidas.contrato ? dataBr(permitidas.contrato.data_entrada) : ''}): até ${R.MESES_DEPOIS_DE_ALUGAR} meses depois de alugar, dá para lançar as contas do período vago que chegam atrasadas.`,
    incluso: `<b>Pelo contrato do inquilino</b>, estas contas estão incluídas no aluguel e são nossas: ${esc(permitidas.tipos.join(', '))}.`,
    inquilino: `<b>Em ${compBr(comp)} o inquilino paga todas as contas</b>, conforme o contrato. Não há conta nossa para lançar neste mês.`,
  }[permitidas.motivo]}
      O IPTU pago por nós é lançado na caixa do IPTU do imóvel (já abate dos resultados).</div>
    <form class="cartao" data-form="lancarContas">
      <input type="hidden" name="imovel" value="${i.id}">
      <div class="acoes" style="margin-bottom:10px"><label style="margin:0">Mês da conta</label><input type="month" name="competencia" value="${comp}" style="width:auto" data-trocar-mes="${i.id}">
        ${permitidas.tipos.length ? '<button type="button" class="secundario pequeno" data-acao="repetirContas">Repetir os últimos valores</button>' : ''}</div>
      <div class="rolagem"><table><tr><th>Conta</th><th>Valor pago</th><th>Pago em</th><th>Observação</th><th></th></tr>
        ${R.TIPOS_DESPESA.map(linha).join('')}</table></div>
      <p class="suave">Preencha só as contas pagas. Verificou e não há conta no mês? Informe 0,00 e escreva na observação (ex.: "verificado, sem conta em aberto"): fica registrado e conta como lançado no fechamento. Entram nos Resultados pela data do pagamento. "Repetir os últimos valores" copia o último valor de cada conta (bom para condomínio e valores fixos).</p>
      ${permitidas.tipos.length ? '<div class="acoes"><button>Lançar</button></div>' : ''}</form>
    <div class="cartao"><h2>Lançamentos</h2><div class="rolagem"><table><tr><th>Mês</th><th>Conta</th><th class="n">Valor</th><th>Pago em</th><th>Observação</th><th></th></tr>
      ${lista.map((x) => `<tr><td>${compBr(x.competencia)}</td><td>${esc(x.tipo)}</td><td class="n">${reais(x.valor)}</td><td>${dataBr(x.data_pagamento)}</td><td>${esc(x.observacoes || '')}</td>
        <td class="n">${opera() ? botao('excluir', '×', { tabela: 'despesas', id: x.id }, 'x-excluir', `Excluir ${x.tipo} de ${compBr(x.competencia)} (${reais(x.valor)})?`) : ''}</td></tr>`).join('')
      || '<tr><td colspan="6" class="suave">Nenhuma conta lançada.</td></tr>'}</table></div></div>`;
}

/** Abas da página Resultados. */
const abasResultados = (atual) => `<div class="abas">${[['resultados', '#/resultados', 'Resultados por imóvel'], ['impostos', '#/impostos', 'Impostos']]
  .map(([k, h, t]) => `<a href="${h}" class="${k === atual ? 'ativo' : ''}">${t}</a>`).join('')}</div>`;

/**
 * Impostos: guia esperada por empresa no mês, pelo faturamento das NFs emitidas (PIS/COFINS mensal; IRPJ e CSLL
 * trimestrais, acumulando mês a mês). O contador faz o cálculo oficial: o valor dele fica ao lado.
 */
export function telaImpostos(comp) {
  const lista = R.impostosDoMes(d(), comp);
  const tri = R.trimestreDe(comp);
  const nTri = Number(tri.slice(-1));
  const meses = R.mesesDoTrimestre(comp);
  const nomeMes = (m) => compBr(m);
  const guiaLinha = (e, g) => {
    const dif = g.contador ? g.contador.valor - g.aPagar : null;
    return `<tr><td><b>${esc(g.imposto)}</b><br><span class="suave">${g.mensal ? `guia mensal de ${compBr(comp)}` : `guia do ${nTri}º trimestre (${nomeMes(meses[0])} a ${nomeMes(meses[2])})`}</span></td>
      <td class="n">${reais(g.base)}${g.mensal ? '' : `<br><span class="suave">${meses.filter((m) => m <= comp).length} de 3 meses</span>`}</td>
      <td class="n">${pct(g.aliquota)}</td>
      <td class="n"><b>${reais(g.esperado)}</b>${g.mensal ? '' : `<br>${etiqueta(meses[2] === comp ? 'guia completa' : 'parcial: acumula até ' + compBr(meses[2]), meses[2] === comp ? 'ok' : 'info')}`}
        ${g.adicional ? `<br><span class="suave">inclui adicional de ${reais(g.adicional)} (10% do lucro presumido acima de R$ 60.000,00)</span>` : ''}
        ${g.lc224 ? `<br><span class="suave">LC 224: presunção de 35,2% sobre ${reais(Math.abs(g.lc224))} ${g.lc224 > 0 ? 'acima do limite' : '(acerto do ano: devolve)'}</span>` : ''}
        <br><span class="suave">vence até ${dataBr(g.vencimento)}</span>
        ${g.transportado ? `<br><span class="suave">+ ${reais(g.transportado)} de guia(s) anterior(es) abaixo de R$ 10,00</span><br>a pagar: <b>${reais(g.aPagar)}</b>` : ''}
        ${g.abaixoDoMinimo ? `<br>${etiqueta('abaixo de R$ 10,00: não se paga; passa para a próxima guia', 'aviso')}` : ''}
        ${!g.mensal && meses[2] === comp && g.esperado >= 200000 ? '<br><span class="suave">pode pagar em até 3 cotas (mín. R$ 1.000,00 cada; 2ª e 3ª com juros)</span>' : ''}</td>
      <td class="nw">${opera() ? `<form data-form="guiaImposto" class="acoes" data-emitente="${e.id}" data-imposto="${esc(g.imposto)}" data-periodo="${g.periodo}">
        <input name="valor" inputmode="decimal" data-dinheiro placeholder="valor do contador" value="${g.contador ? reais(g.contador.valor, false) : ''}" style="width:150px"><button class="secundario pequeno">Salvar</button></form>`
    : (g.contador ? reais(g.contador.valor) : '-')}</td>
      <td class="n">${dif === null ? '<span class="suave">-</span>' : dif === 0 ? etiqueta('igual', 'ok') : `<span class="${Math.abs(dif) > 100 ? 'texto-aviso' : 'suave'}">${dif > 0 ? '+' : '-'} ${reais(Math.abs(dif))}</span>`}</td></tr>`;
  };
  return `<h1>Resultados financeiros</h1>${abasResultados('impostos')}
    <div class="cabecalho"><h2>Impostos de ${compBr(comp)}</h2>
      <div class="acoes"><a class="botao secundario" href="#/impostos?mes=${C.somarMeses(comp, -1)}">← ${compBr(C.somarMeses(comp, -1))}</a>
      <form data-form="irImpostos" class="acoes"><input type="month" name="mes" value="${comp}" style="width:160px"><button class="secundario">Ir</button></form>
      <a class="botao secundario" href="#/impostos?mes=${C.somarMeses(comp, 1)}">${compBr(C.somarMeses(comp, 1))} →</a></div></div>
    <p class="suave">Guia esperada, calculada pelo faturamento das NFs emitidas (data de emissão; NFs canceladas não entram). Atualiza sozinha a cada NF emitida.
      PIS/COFINS (${pct(3.65)}): guia mensal, vence no dia 25 do mês seguinte. IRPJ (${pct(4.8)}) e CSLL (${pct(2.88)}): 15% e 9% sobre o lucro presumido (32% do faturamento), guia trimestral (1º trimestre: NFs de janeiro a março; 2º: abril a junho; 3º: julho a setembro; 4º: outubro a dezembro), acumulando mês a mês até a guia completa no último mês do trimestre; vence no último dia útil do mês seguinte ao trimestre.
      IRPJ tem adicional de 10% sobre o lucro presumido acima de R$ 60.000,00 no trimestre (faturamento acima de R$ 187.500,00). Desde 2026 (LC 224/2025), a presunção é de 35,2% na parte do faturamento do ano acima de R$ 5 milhões, controlada por trimestre (R$ 1.250.000,00; IRPJ desde janeiro e CSLL desde abril de 2026). Vencimentos em fim de semana ou feriado nacional vêm para o dia útil anterior. Guia abaixo de R$ 10,00 não se paga: o valor passa para a guia seguinte do mesmo imposto até somar R$ 10,00 (Lei 9.430/96, art. 68).
      O contador faz o cálculo oficial: informe o valor da guia dele ao lado para comparar.</p>
    ${lista.map((x) => `<div class="cartao rolagem"><div class="cabecalho"><h2>${esc(x.empresa.nome)}</h2>
        <span>Faturamento de NF em ${compBr(comp)}: <b>${reais(x.faturamento.valor)}</b> <span class="suave">(${x.faturamento.notas} NF(s))</span></span></div>
      <p class="suave">${nTri}º trimestre até agora: ${x.porMes.map((m) => `${compBr(m.mes)} ${reais(m.valor)}`).join(' + ')} = <b>${reais(x.trimestre)}</b></p>
      <table><tr><th>Imposto</th><th class="n">Base (faturamento)</th><th class="n">Alíquota</th><th class="n">Guia esperada</th><th>Valor do contador</th><th class="n">Diferença</th></tr>
        ${x.guias.map((g) => guiaLinha(x.empresa, g)).join('')}
        <tr class="total"><td colspan="3">Total a pagar no mês${meses[2] === comp ? '' : ' (IRPJ e CSLL ainda parciais)'}</td><td class="n">${reais(x.guias.reduce((t, g) => t + (g.abaixoDoMinimo ? 0 : g.aPagar), 0))}</td>
          <td>${x.guias.some((g) => g.contador) ? reais(x.guias.reduce((t, g) => t + (g.contador ? g.contador.valor : 0), 0)) : ''}</td><td></td></tr></table></div>`).join('')
      || '<div class="cartao"><p class="suave">Nenhuma empresa cadastrada. Cadastre em Dados e backup → Empresas.</p></div>'}`;
}

export function telaResultados(q) {
  const hoje = C.hojeIso();
  const ate = q.ate || hoje;
  const de = q.de || C.somarDias(C.somarMesesData(ate, -12), 1);
  // imóveis só com boleto de controle vão para o fim, sem posição no ranking
  const lista = R.resultadosFinanceiros(d(), de, ate).sort((a, b) => a.controle - b.controle);
  const ano = Number(hoje.slice(0, 4));
  const atalhos = [
    ['Últimos 12 meses', C.somarDias(C.somarMesesData(hoje, -12), 1), hoje],
    ['Este ano', `${ano}-01-01`, hoje],
    ['Ano passado', `${ano - 1}-01-01`, `${ano - 1}-12-31`],
    ['Últimos 5 anos', C.somarDias(C.somarAnos(hoje, -5), 1), hoje],
  ].map(([t, a, b]) => link(`#/resultados?de=${a}&ate=${b}`, t, a === de && b === ate ? 'botao pequeno' : 'botao secundario pequeno')).join(' ');
  const tot = (k) => lista.filter((x) => !x.controle).reduce((s, x) => s + x[k], 0);
  const pctTxt = (v) => (v === null ? '<span class="suave">informe o valor</span>' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`);
  const maior = Math.max(0, ...lista.map((x) => x.retornoAnual || 0));
  return `<h1>Resultados financeiros</h1>${abasResultados('resultados')}
    <form class="cartao acoes" data-form="filtroResultados"><label style="margin:0">De</label><input type="date" name="de" value="${de}" style="width:160px"><label style="margin:0">até</label><input type="date" name="ate" value="${ate}" style="width:160px"><button class="secundario">Ver</button>
      ${atalhos} ${botao('excelResultados', 'Exportar Excel', { de, ate }, 'pequeno')}</form>
    <div class="cartao rolagem"><table class="compacta"><tr><th>#</th><th>Imóvel</th><th class="n" title="Valor do imóvel + reformas até a data">Imóvel + reformas</th><th class="n" title="Aluguel recebido (valor das NFs) + NFs avulsas">Receita</th><th class="n" title="IPTU pago pelo proprietário + contas pagas por nós">Despesas</th><th class="n">Resultado</th><th class="n">Retorno ao ano</th></tr>
      ${lista.map((x, n) => `<tr class="${x.controle ? 'linha-controle' : ''}"><td>${x.retornoAnual !== null && !x.controle ? n + 1 : ''}</td>
        <td><a href="#/imovel/${x.imovel.id}" title="${x.mesesPagos} pagamento(s) no período"><b>${esc(x.imovel.nome)}</b></a>${x.controle ? ` ${etiqueta('controle: não conta', 'controle')}` : ''}</td>
        <td class="n nw">${x.base ? reais(x.base) : '<span class="suave">-</span>'}${x.reformasPeriodo ? `<br><span class="suave">reformas ${reais(x.reformasPeriodo)}</span>` : ''}</td>
        <td class="n nw">${reais(x.receita)}${x.avulsas ? `<br><span class="suave">avulsas ${reais(x.avulsas)}</span>` : ''}</td>
        <td class="n nw">${x.iptu || x.contas ? `- ${reais(x.iptu + x.contas)}` : '-'}${x.iptu && x.contas ? `<br><span class="suave">IPTU ${reais(x.iptu)}</span>` : ''}${x.contas ? `<br><a class="suave" href="#/contas/${x.imovel.id}">contas ${reais(x.contas)}</a>` : x.iptu ? '<br><span class="suave">IPTU</span>' : ''}
          ${opera() && R.contasPermitidas(d(), x.imovel.id, mesComContas(x.imovel.id)).tipos.length ? `<br>${link(`#/contas/${x.imovel.id}`, '+ contas', 'link-botao destaque-contas')}` : ''}</td>
        <td class="n nw"><b>${reais(x.resultado)}</b></td><td class="n nw"><b>${pctTxt(x.retornoAnual)}</b>${x.retornoAnual ? `<div class="barra"><span style="width:${Math.max(2, (x.retornoAnual / maior) * 100).toFixed(0)}%"></span></div>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="suave">Nenhum imóvel.</td></tr>'}
      <tr class="total"><td></td><td>Total</td><td class="n nw">${reais(tot('base'))}</td><td class="n nw">${reais(tot('receita'))}</td><td class="n nw">- ${reais(tot('iptu') + tot('contas'))}</td><td class="n nw">${reais(tot('resultado'))}</td>
        <td class="n nw">${tot('base') ? pctTxt((tot('resultado') * 12 / (lista[0] ? lista[0].meses : 12) / tot('base')) * 100) : '-'}</td></tr></table>
    <p class="suave">Receita = valor da NF de cada boleto pago no período (sem IPTU, seguro e tarifa, que são repasses) + NFs avulsas do imóvel; boletos de controle não entram. Despesas = IPTU pago pelo proprietário + contas pagas por nós, pela data do pagamento (lance em "+ contas"). Retorno ao ano = resultado convertido para 12 meses ÷ (valor do imóvel + reformas até a data). Passe o mouse nos títulos para ver o que cada coluna soma; o Excel traz tudo separado.</p></div>`;
}
