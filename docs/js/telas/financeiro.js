// Financeiro: visão geral do mês (extratos), resultado bruto e líquido por imóvel (custos e Airbnb lançados ali), impostos, inadimplência e contas pagas por nós.
import * as C from '../calculos.js';
import * as Z from '../conciliacao.js';
import { compBr, dataBr, pct, reais } from '../calculos.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { caixaPagarPeloBanco } from './banco.js';
import { botao, buscar, d, etiqueta, link, naoEncontrado, opera } from './comum.js';

/** Inadimplência: quem está devendo, há quantos dias, quanto hoje; e quem costuma atrasar. */
export function telaInadimplencia() {
  const hoje = C.hojeIso();
  const r = R.inadimplencia(d(), hoje);
  const imovelDe = (c) => (buscar('imoveis', c.imovel_id) || {}).nome || '';
  return `<h1>Financeiro</h1>${abasFinanceiro('inadimplencia')}<div class="cabecalho"><h2>Inadimplência</h2>${link('#/cobrancas', 'Ver boletos')}</div>
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

/** Coluna "Banco" dos lançamentos: movimentação do extrato ligada à conta (com o comprovante) ou "sem extrato". */
function bancoDaDespesa(x) {
  const m = (d().movimentacoes_banco || []).find((y) => y.despesa_id === x.id || (x.movimentacao_id && y.id === x.movimentacao_id));
  const peloBanco = x.pagamento_banco_id || (d().pagamentos_banco || []).some((p) => p.despesa_id === x.id && p.situacao === 'pago');
  if (!m) return `${peloBanco ? etiqueta('pelo banco', 'info') : `<a class="suave" href="#/banco?imovel=${x.imovel_id}">sem extrato</a>`}`;
  const nome = m.comprovante || m.comprovante_contador;
  return `${peloBanco ? `${etiqueta('pelo banco', 'info')} ` : ''}<a href="#/banco?conta=${esc(m.conta_id)}&mes=${String(m.data).slice(0, 7)}">${dataBr(m.data)}</a>${nome ? `<br><span class="suave" title="${esc(nome)}">📎 comprovante</span>` : `<br>${etiqueta('sem comprovante', 'aviso')}`}`;
}

export function telaContas(rota) {
  const i = buscar('imoveis', rota.partes[1]);
  if (!i) return naoEncontrado('Imóvel não encontrado', '#/imoveis', 'Ver os imóveis');
  const comp = C.competenciaValida(rota.q.comp, mesComContas(i.id));
  const ultimos = R.ultimosValores(d(), i.id);
  const permitidas = R.contasPermitidas(d(), i.id, comp);
  const doMes = R.despesasDo(d(), i.id).filter((x) => x.competencia === comp);
  const hoje = C.hojeIso();
  const lista = R.despesasDo(d(), i.id).slice(0, 60);
  const linha = (tipo, n) => {
    const u = ultimos[tipo];
    const ja = doMes.filter((x) => x.tipo === tipo).reduce((t, x) => t + x.valor, 0);
    const doInquilino = permitidas.motivo !== 'vago' && permitidas.motivo !== 'alugou' && !permitidas.tipos.includes(tipo);
    return `<tr><td><b>${esc(tipo)}</b><input type="hidden" name="tipo_${n}" value="${esc(tipo)}">${doInquilino ? '<br><span class="suave">pelo contrato, do inquilino</span>' : ''}</td>
      <td><input name="valor_${n}" data-dinheiro inputmode="decimal" placeholder="${u ? F.dinheiroTexto(u.valor) : '0,00'}" style="width:130px"></td>
      <td><input type="date" name="venc_${n}" style="width:auto"></td>
      <td><input type="date" name="data_${n}" value="${hoje}" style="width:auto"></td>
      <td><input name="obs_${n}" placeholder="${tipo === 'Outra' ? 'qual conta? (ex.: taxa de lixo)' : 'opcional'}"></td>
      <td class="suave nw">${u ? `último: ${reais(u.valor)} (${compBr(u.competencia)})` : ''}${ja ? `<br><b>já lançado neste mês: ${reais(ja)}</b>` : ''}</td></tr>`;
  };
  return `<p class="suave"><a href="#/resultados">← Financeiro</a> · <a href="#/imovel/${i.id}">${esc(i.nome)}</a></p>
    <h1>Contas pagas por nós · ${esc(i.nome)}</h1>
    <div class="alerta ${permitidas.motivo === 'alugou' ? 'aviso' : 'info'}">${{
    vago: `<b>Imóvel vago em ${compBr(comp)}:</b> as contas são nossas.`,
    alugou: `<b>Alugado há pouco</b> (entrada de ${esc(permitidas.contrato ? permitidas.contrato.inquilino_nome : '')} em ${permitidas.contrato ? dataBr(permitidas.contrato.data_entrada) : ''}): até ${R.MESES_DEPOIS_DE_ALUGAR} meses depois de alugar, dá para lançar as contas do período vago que chegam atrasadas.`,
    incluso: `<b>Pelo contrato do inquilino</b>, estas contas estão incluídas no aluguel e são nossas: ${esc(permitidas.tipos.join(', '))}.`,
    inquilino: `<b>Em ${compBr(comp)}, pelo contrato, o inquilino paga as contas.</b> Lance aqui só o que for nosso (ex.: débito antigo, troca de titular).`,
  }[permitidas.motivo]}
      O IPTU pago por nós é lançado na caixa do IPTU do imóvel (já abate dos resultados).</div>
    <form class="cartao" data-form="lancarContas">
      <input type="hidden" name="imovel" value="${i.id}">
      <div class="acoes" style="margin-bottom:10px"><label style="margin:0">Mês da conta</label><input type="month" name="competencia" value="${esc(comp)}" style="width:auto" data-trocar-mes="${i.id}">
        <button type="button" class="secundario pequeno" data-acao="repetirContas">Repetir os últimos valores</button></div>
      <div class="rolagem"><table class="responsiva"><tr><th>Conta</th><th>Valor pago</th><th>Vencimento</th><th>Pago em</th><th>Observação</th><th></th></tr>
        ${R.TIPOS_DESPESA.map(linha).join('')}</table></div>
      <p class="suave">Preencha só as contas pagas. Verificou e não há conta no mês? Informe 0,00 e escreva na observação (ex.: "verificado, sem conta em aberto"): fica registrado e conta como lançado no fechamento. Entram nos Resultados pela data do pagamento. "Repetir os últimos valores" copia o último valor de cada conta (bom para condomínio e valores fixos).</p>
      <div class="acoes"><button>Lançar</button></div></form>
    ${caixaPagarPeloBanco(i, comp)}
    <div class="cartao"><h2>Lançamentos</h2><div class="rolagem"><table class="responsiva"><tr><th>Mês</th><th>Conta</th><th class="n">Valor</th><th>Vencimento</th><th>Pago em</th><th>Observação</th><th>Banco</th><th></th></tr>
      ${lista.map((x) => `<tr><td>${compBr(x.competencia)}</td><td>${esc(x.tipo)}</td><td class="n">${reais(x.valor)}</td><td>${x.vencimento ? dataBr(x.vencimento) : '-'}</td><td>${dataBr(x.data_pagamento)}</td><td>${esc(x.observacoes || '')}</td><td>${bancoDaDespesa(x)}</td>
        <td class="n">${opera() ? botao('excluir', '×', { tabela: 'despesas', id: x.id }, 'x-excluir', `Excluir ${x.tipo} de ${compBr(x.competencia)} (${reais(x.valor)})?`) : ''}</td></tr>`).join('')
      || '<tr><td colspan="8" class="suave">Nenhuma conta lançada.</td></tr>'}</table></div>
      <p class="suave">Coluna "Banco": a movimentação do extrato ligada a esta conta e o comprovante guardado (tela Banco). "pelo banco" = paga pelo sistema via C6.</p></div>`;
}

/** Abas da página Financeiro. */
const abasFinanceiro = (atual) => `<div class="abas">${[['financeiro', '#/financeiro', 'Visão geral'], ['resultados', '#/resultados', 'Resultado bruto'], ['liquido', '#/liquido', 'Resultado líquido'],
  ['impostos', '#/impostos', 'Impostos'], ['inadimplencia', '#/inadimplencia', 'Inadimplência']]
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
  return `<h1>Financeiro</h1>${abasFinanceiro('impostos')}
    <div class="cabecalho"><h2>Impostos de ${compBr(comp)}</h2>
      <div class="acoes"><a class="botao secundario" href="#/impostos?mes=${C.somarMeses(comp, -1)}">← ${compBr(C.somarMeses(comp, -1))}</a>
      <form data-form="irImpostos" class="acoes"><input type="month" name="mes" value="${esc(comp)}" style="width:160px"><button class="secundario">Ir</button></form>
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

/** Período da tela (de/até do endereço; padrão: últimos 12 meses) e os atalhos de período para a rota ``base``. */
function periodo(q, base) {
  const hoje = C.hojeIso();
  // as datas vêm do endereço (#/resultados?de=…&ate=…): só valem no formato AAAA-MM-DD
  const ate = C.dataValida(q.ate, hoje);
  const de = C.dataValida(q.de, C.somarDias(C.somarMesesData(ate, -12), 1));
  const ano = Number(hoje.slice(0, 4));
  const atalhos = [
    ['Últimos 12 meses', C.somarDias(C.somarMesesData(hoje, -12), 1), hoje],
    ['Este ano', `${ano}-01-01`, hoje],
    ['Ano passado', `${ano - 1}-01-01`, `${ano - 1}-12-31`],
    ['Últimos 5 anos', C.somarDias(C.somarAnos(hoje, -5), 1), hoje],
  ].map(([t, a, b]) => link(`#/${base}?de=${a}&ate=${b}`, t, a === de && b === ate ? 'botao pequeno' : 'botao secundario pequeno')).join(' ');
  const form = `<form class="cartao acoes" data-form="filtroResultados" data-base="${base}"><label style="margin:0">De</label><input type="date" name="de" value="${esc(de)}" style="width:160px"><label style="margin:0">até</label><input type="date" name="ate" value="${esc(ate)}" style="width:160px"><button class="secundario">Ver</button>
      ${atalhos} ${botao('excelResultados', 'Exportar Excel', { de, ate }, 'pequeno')}</form>`;
  return { de, ate, form };
}

const pctTxt = (v) => (v === null ? '<span class="suave">informe o valor do imóvel</span>' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`);
const menos = (v) => (v ? `- ${reais(v)}` : '<span class="suave">-</span>');

/** Quadro para lançar um custo (conta paga por nós) num imóvel, com os últimos lançamentos. */
function painelCusto(i, voltar) {
  const s = R.situacaoCustos(d(), i.id);
  const hoje = C.hojeIso();
  const lista = R.despesasDo(d(), i.id).slice(0, 12);
  return `<div class="cartao" id="lancar"><div class="cabecalho"><h2>Custo pago por nós · ${esc(i.nome)}</h2>${link(voltar, 'Fechar')}</div>
    ${s.rotulo ? `<p>${etiqueta(s.rotulo, s.classe)}</p>` : '<p class="suave">Pelo contrato, o inquilino paga as contas: lance aqui só o que for nosso (ex.: débito antigo, troca de titular).</p>'}
    ${opera() ? `<form data-form="lancarCusto" class="grade-lancar"><input type="hidden" name="imovel" value="${i.id}">
      <label>Conta<select name="tipo">${R.TIPOS_DESPESA.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label>Mês de referência<input type="month" name="competencia" value="${C.competenciaDe(hoje)}"></label>
      <label>Vencimento<input type="date" name="vencimento"></label>
      <label>Pago em<input type="date" name="data_pagamento" value="${hoje}"></label>
      <label>Valor pago<input name="valor" data-dinheiro inputmode="decimal" placeholder="0,00"></label>
      <label>Observação<input name="observacoes" placeholder="opcional"></label>
      <div><button>Lançar</button></div></form>` : ''}
    <div class="rolagem"><table class="responsiva compacta"><tr><th>Mês</th><th>Conta</th><th>Vencimento</th><th>Pago em</th><th class="n">Valor</th><th>Observação</th><th></th></tr>
      ${lista.map((x) => `<tr><td>${compBr(x.competencia)}</td><td>${esc(x.tipo)}</td><td>${x.vencimento ? dataBr(x.vencimento) : '<span class="suave">-</span>'}</td><td>${dataBr(x.data_pagamento)}</td><td class="n">${reais(x.valor)}</td><td>${esc(x.observacoes || '')}</td>
        <td class="n">${opera() && !x.movimentacao_id && !x.pagamento_banco_id ? botao('excluir', '×', { tabela: 'despesas', id: x.id }, 'x-excluir', `Excluir ${x.tipo} de ${compBr(x.competencia)} (${reais(x.valor)})?`) : x.movimentacao_id ? '<span class="suave">extrato</span>' : ''}</td></tr>`).join('')
      || '<tr><td colspan="7" class="suave">Nenhum custo lançado.</td></tr>'}</table></div>
    <p class="suave">Entra nos resultados pela data do pagamento. Vindo do extrato do banco, o custo já chega lançado (Financeiro → Visão geral → destino "Conta do imóvel"). <a href="#/contas/${i.id}">Lançar o mês inteiro de uma vez</a>.</p></div>`;
}

/** Quadro para lançar um ganho do Airbnb num imóvel vago, com os últimos lançamentos. */
function painelAirbnb(i, voltar) {
  const hoje = C.hojeIso();
  const lista = R.ganhosAirbnbDo(d(), i.id).slice(0, 12);
  return `<div class="cartao" id="lancar"><div class="cabecalho"><h2>Ganho do Airbnb · ${esc(i.nome)}</h2>${link(voltar, 'Fechar')}</div>
    ${opera() ? `<form data-form="lancarAirbnb" class="grade-lancar"><input type="hidden" name="imovel" value="${i.id}">
      <label>Recebido em<input type="date" name="data_recebimento" value="${hoje}"></label>
      <label>Mês de referência<input type="month" name="competencia" value="${C.competenciaDe(hoje)}"></label>
      <label>Valor recebido<input name="valor" data-dinheiro inputmode="decimal" placeholder="0,00"></label>
      <label>Observação<input name="observacoes" placeholder="ex.: reserva 2 noites"></label>
      <div><button>Lançar</button></div></form>` : ''}
    <div class="rolagem"><table class="responsiva compacta"><tr><th>Recebido em</th><th>Mês</th><th class="n">Valor</th><th>Observação</th><th></th></tr>
      ${lista.map((g) => `<tr><td>${dataBr(g.data_recebimento)}</td><td>${compBr(g.competencia)}</td><td class="n">${reais(g.valor)}</td><td>${esc(g.observacoes || '')}</td>
        <td class="n">${opera() && !g.movimentacao_id ? botao('excluir', '×', { tabela: 'ganhos_airbnb', id: g.id }, 'x-excluir', `Excluir o ganho do Airbnb de ${dataBr(g.data_recebimento)} (${reais(g.valor)})?`) : g.movimentacao_id ? '<span class="suave">extrato</span>' : ''}</td></tr>`).join('')
      || '<tr><td colspan="5" class="suave">Nenhum ganho lançado.</td></tr>'}</table></div>
    <p class="suave">A NF do Airbnb é uma só por mês, sem imóvel, com a soma dos ganhos de todos os imóveis (gerada em Financeiro → Visão geral depois da virada do mês). Estes lançamentos são o nosso controle de quanto entrou em cada imóvel.</p></div>`;
}

/** Resultado bruto por imóvel: aluguel, Airbnb, IPTU e custos (lançados aqui mesmo). */
export function telaResultados(q) {
  const { de, ate, form } = periodo(q, 'resultados');
  // imóveis só com boleto de controle vão para o fim, sem posição no ranking
  const lista = R.resultadosFinanceiros(d(), de, ate).sort((a, b) => a.controle - b.controle);
  const tot = (k) => lista.filter((x) => !x.controle).reduce((s, x) => s + x[k], 0);
  const maior = Math.max(0, ...lista.map((x) => x.retornoAnual || 0));
  const aqui = `#/resultados?de=${de}&ate=${ate}`;
  const situacoes = new Map(lista.map((x) => [x.imovel.id, R.situacaoCustos(d(), x.imovel.id)]));
  const painelI = q.custo ? buscar('imoveis', q.custo) : q.airbnb ? buscar('imoveis', q.airbnb) : null;
  const painel = painelI ? (q.custo ? painelCusto(painelI, aqui) : painelAirbnb(painelI, aqui)) : '';
  const totalBase = tot('base');
  return `<h1>Financeiro</h1>${abasFinanceiro('resultados')}${form}
    <div class="numeros">
      <div class="cartao"><div class="grande">${reais(tot('receita'))}</div>receita (aluguel ${reais(tot('aluguel') + tot('avulsas'))} + Airbnb ${reais(tot('airbnb'))})</div>
      <div class="cartao"><div class="grande">- ${reais(tot('iptu') + tot('contas'))}</div>IPTU ${reais(tot('iptu'))} + custos ${reais(tot('contas'))}</div>
      <div class="cartao"><div class="grande">${reais(tot('resultado'))}</div>resultado bruto${totalBase ? ` · ${pctTxt((tot('resultado') * 12 / (lista[0] ? lista[0].meses : 12) / totalBase) * 100)} ao ano` : ''}</div></div>
    ${painel}
    <div class="cartao rolagem"><table class="compacta responsiva tabela-resultados"><tr><th>#</th><th>Imóvel</th><th class="n" title="Valor do imóvel + reformas até a data">Imóvel + reformas</th><th class="n" title="Aluguel recebido (valor das NFs) + NFs avulsas do imóvel">Aluguel</th><th class="n" title="Ganhos do Airbnb lançados no imóvel (só imóvel vago)">Airbnb</th><th class="n" title="IPTU pago pelo proprietário">IPTU</th><th class="n" title="Contas pagas por nós (água, luz, gás, condomínio, internet, outra)">Custos</th><th class="n">Resultado</th><th class="n">Retorno ao ano</th></tr>
      ${lista.map((x, n) => {
    const s = situacoes.get(x.imovel.id);
    return `<tr class="${x.controle ? 'linha-controle' : ''}"><td>${x.retornoAnual !== null && !x.controle ? n + 1 : ''}</td>
        <td class="col-imovel"><a href="#/imovel/${x.imovel.id}" title="${x.mesesPagos} pagamento(s) no período"><b>${esc(x.imovel.nome)}</b></a>${x.controle ? ` ${etiqueta('controle: não conta', 'controle')}` : ''}${s.rotulo ? `<br>${etiqueta(s.rotulo, s.classe)}` : ''}</td>
        <td class="n nw">${x.base ? reais(x.base) : '<span class="suave">-</span>'}${x.reformasPeriodo ? `<br><span class="suave">reformas ${reais(x.reformasPeriodo)}</span>` : ''}</td>
        <td class="n nw">${x.aluguel + x.avulsas ? reais(x.aluguel + x.avulsas) : '<span class="suave">-</span>'}${x.avulsas ? `<br><span class="suave">avulsas ${reais(x.avulsas)}</span>` : ''}</td>
        <td class="n nw">${x.airbnb ? `<a href="${aqui}&airbnb=${x.imovel.id}&ir=lancar">${reais(x.airbnb)}</a>` : '<span class="suave">-</span>'}${opera() && s.airbnb ? `<br>${link(`${aqui}&airbnb=${x.imovel.id}&ir=lancar`, '+ Airbnb', 'link-botao')}` : ''}</td>
        <td class="n nw">${menos(x.iptu)}</td>
        <td class="n nw">${x.contas ? `<a href="${aqui}&custo=${x.imovel.id}&ir=lancar">- ${reais(x.contas)}</a>` : '<span class="suave">-</span>'}${opera() ? `<br>${link(`${aqui}&custo=${x.imovel.id}&ir=lancar`, '+ custo', `link-botao${s.motivo === 'alugou' || s.motivo === 'vago' ? ' destaque-contas' : ''}`)}` : ''}</td>
        <td class="n nw"><b>${reais(x.resultado)}</b></td><td class="n nw"><b>${pctTxt(x.retornoAnual)}</b>${x.retornoAnual ? `<div class="barra"><span style="width:${Math.max(2, (x.retornoAnual / maior) * 100).toFixed(0)}%"></span></div>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="9" class="suave">Nenhum imóvel.</td></tr>'}
      <tr class="total"><td></td><td>Total</td><td class="n nw">${reais(totalBase)}</td><td class="n nw">${reais(tot('aluguel') + tot('avulsas'))}</td><td class="n nw">${reais(tot('airbnb'))}</td><td class="n nw">${menos(tot('iptu'))}</td><td class="n nw">${menos(tot('contas'))}</td><td class="n nw">${reais(tot('resultado'))}</td>
        <td class="n nw">${totalBase ? pctTxt((tot('resultado') * 12 / (lista[0] ? lista[0].meses : 12) / totalBase) * 100) : '-'}</td></tr></table>
    <p class="suave">Aluguel = valor da NF de cada boleto pago no período (sem IPTU, seguro e tarifa, que são repasses) + NFs avulsas do imóvel; boletos de controle não entram. Airbnb = ganhos lançados em cada imóvel vago ("+ Airbnb" ou pelo extrato do banco). Custos = contas pagas por nós ("+ custo", em qualquer imóvel), pela data do pagamento. Retorno ao ano = resultado convertido para 12 meses ÷ (valor do imóvel + reformas até a data). Impostos e reformas: aba Resultado líquido.</p></div>`;
}

/** Resultado líquido por imóvel: resultado bruto − impostos = líquido; reformas à parte, abatidas no fim (lucro depois das reformas). */
export function telaLiquido(q) {
  const { de, ate, form } = periodo(q, 'liquido');
  const lista = R.resultadosFinanceiros(d(), de, ate).filter((x) => !x.controle).sort((a, b) => (b.retornoLiquido ?? -Infinity) - (a.retornoLiquido ?? -Infinity));
  const tot = (k) => lista.reduce((s, x) => s + x[k], 0);
  const meses = lista[0] ? lista[0].meses : 12;
  const est = tot('impostosEstimados');
  return `<h1>Financeiro</h1>${abasFinanceiro('liquido')}${form}
    <div class="numeros">
      <div class="cartao"><div class="grande">${reais(tot('resultado'))}</div>resultado bruto (receita − IPTU − custos)</div>
      <div class="cartao"><div class="grande">- ${reais(tot('impostos'))}</div>impostos ${est ? etiqueta(est === tot('impostos') ? 'estimados' : `${reais(est)} estimados`, 'aviso') : etiqueta('confirmados pelo contador', 'ok')}</div>
      <div class="cartao"><div class="grande">${reais(tot('liquido'))}</div>líquido${tot('base') ? ` · ${pctTxt((tot('liquido') * 12 / meses / tot('base')) * 100)} ao ano` : ''}</div>
      <div class="cartao"><div class="grande">${reais(tot('lucro'))}</div>lucro depois das reformas (${reais(tot('reformasPeriodo'))})</div></div>
    <div class="cartao rolagem"><table class="compacta responsiva tabela-resultados"><tr><th>Imóvel</th><th class="n">Receita</th><th class="n">IPTU</th><th class="n">Custos</th><th class="n" title="Rateados pela NF de cada recebimento (Airbnb: pelos ganhos do imóvel)">Impostos</th><th class="n">Líquido</th><th class="n">Retorno líquido ao ano</th><th class="n col-reforma" title="Reformas pagas no período: separadas, abatem só no fim">Reformas</th><th class="n">Lucro depois das reformas</th></tr>
      ${lista.map((x) => `<tr><td class="col-imovel"><a href="#/imovel/${x.imovel.id}"><b>${esc(x.imovel.nome)}</b></a></td>
        <td class="n nw">${reais(x.receita)}${x.airbnb ? `<br><span class="suave">Airbnb ${reais(x.airbnb)}</span>` : ''}</td>
        <td class="n nw">${menos(x.iptu)}</td><td class="n nw">${menos(x.contas)}</td>
        <td class="n nw">${menos(x.impostos)}${x.impostosEstimados ? `<br><span class="suave">${x.impostosEstimados === x.impostos ? 'estimado' : `${reais(x.impostosEstimados)} estimado`}</span>` : ''}</td>
        <td class="n nw"><b>${reais(x.liquido)}</b></td><td class="n nw">${pctTxt(x.retornoLiquido)}</td>
        <td class="n nw col-reforma">${x.reformasPeriodo ? etiqueta(`- ${reais(x.reformasPeriodo)}`, 'aviso') : '<span class="suave">-</span>'}</td>
        <td class="n nw"><b>${reais(x.lucro)}</b></td></tr>`).join('') || '<tr><td colspan="9" class="suave">Nenhum imóvel.</td></tr>'}
      <tr class="total"><td>Total</td><td class="n nw">${reais(tot('receita'))}</td><td class="n nw">${menos(tot('iptu'))}</td><td class="n nw">${menos(tot('contas'))}</td><td class="n nw">${menos(tot('impostos'))}</td><td class="n nw">${reais(tot('liquido'))}</td>
        <td class="n nw">${tot('base') ? pctTxt((tot('liquido') * 12 / meses / tot('base')) * 100) : '-'}</td><td class="n nw col-reforma">${menos(tot('reformasPeriodo'))}</td><td class="n nw">${reais(tot('lucro'))}</td></tr></table>
    <p class="suave">Líquido = receita − IPTU − custos − impostos. Impostos: o valor de cada NF × a parte do faturamento da empresa que foi para PIS/COFINS, IRPJ e CSLL no mês da NF (pela guia do contador, quando informada em Impostos; senão a esperada); recebimento ainda sem NF: ${pct(R.aliquotaImpostos())} estimado. A NF do Airbnb (uma só no mês) é dividida pelos ganhos lançados em cada imóvel. "Estimado" vira confirmado sozinho quando as três guias do mês (PIS/COFINS do mês, IRPJ e CSLL do trimestre) têm o valor do contador. Reformas ficam à parte e só abatem no fim: no lucro presumido o imposto é sobre o faturamento, então a reforma não diminui o imposto. Boletos de controle não entram.</p></div>`;
}

/** Visão geral do mês: dinheiro que entrou e saiu nos extratos, o que falta dar destino, NF do Airbnb, impostos e o líquido do mês. */
export function telaFinanceiro(q) {
  const hoje = C.hojeIso();
  const atual = C.competenciaDe(hoje);
  const mes = C.competenciaValida(q.mes, atual);
  const [ini, fim] = C.limitesCompetencia(mes);
  const movs = (d().movimentacoes_banco || []).filter((m) => String(m.data).slice(0, 7) === mes);
  const conta = (m) => !['transferencia', 'ignorar'].includes(m.classificacao);
  const entradas = movs.filter((m) => m.tipo === 'entrada' && conta(m)).reduce((t, m) => t + m.valor, 0);
  const saidas = movs.filter((m) => m.tipo === 'saida' && conta(m)).reduce((t, m) => t + m.valor, 0);
  const semDestino = movs.filter((m) => !m.classificacao).sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.id - b.id);
  const res = R.resultadosFinanceiros(d(), ini, fim).filter((x) => !x.controle);
  const tot = (k) => res.reduce((s, x) => s + x[k], 0);
  // NF do Airbnb: do próprio mês, se já passou; no mês corrente, a do mês anterior
  const mesAir = mes < atual ? mes : C.somarMeses(mes, -1);
  const air = R.airbnbDoMes(d(), mesAir);
  const impostos = R.impostosDoMes(d(), mes);
  const nomeConta = (id) => { const c = ((d().config_banco || {}).contas || []).find((x) => x.id === id); return c ? (c.apelido || c.id) : id; };
  const sugestao = (m) => { try { return Z.sugerirDestino(d(), m); } catch { return null; } };
  return `<h1>Financeiro</h1>${abasFinanceiro('financeiro')}
    <div class="cabecalho"><h2>Movimento de ${compBr(mes)}</h2>
      <div class="acoes"><a class="botao secundario" href="#/financeiro?mes=${C.somarMeses(mes, -1)}">← ${compBr(C.somarMeses(mes, -1))}</a>
      <form data-form="irFinanceiro" class="acoes"><input type="month" name="mes" value="${esc(mes)}" style="width:160px"><button class="secundario">Ir</button></form>
      ${mes < atual ? `<a class="botao secundario" href="#/financeiro?mes=${C.somarMeses(mes, 1)}">${compBr(C.somarMeses(mes, 1))} →</a>` : ''}</div></div>
    <div class="numeros">
      <div class="cartao"><div class="grande">${reais(entradas)}</div>entradas nos extratos</div>
      <div class="cartao"><div class="grande">${reais(saidas)}</div>saídas nos extratos</div>
      <div class="cartao"><div class="grande">${reais(tot('liquido'))}</div>líquido do mês ${tot('impostosEstimados') ? etiqueta('estimado', 'aviso') : ''}</div>
      <div class="cartao"><div class="grande">${semDestino.length}</div>movimentação(ões) sem destino</div></div>
    <div class="cartao"><h2>Movimentações do extrato sem destino</h2>
      ${semDestino.length ? `<div class="rolagem"><table class="responsiva compacta"><tr><th>Data</th><th>Conta</th><th>Descrição no extrato</th><th class="n">Valor</th><th>Destino</th></tr>
        ${semDestino.map((m) => { const s = sugestao(m); return `<tr><td class="nw">${dataBr(m.data)}<br><span class="suave">${m.tipo === 'entrada' ? 'entrada' : 'saída'}</span></td><td>${esc(nomeConta(m.conta_id))}</td><td>${esc(m.titulo || '')} ${esc(m.descricao || '')}</td>
          <td class="n nw ${m.tipo === 'saida' ? 'texto-aviso' : ''}">${m.tipo === 'saida' ? '- ' : ''}${reais(m.valor)}</td>
          <td>${s && s.classificacao ? `<span class="suave">parece: ${esc(Z.CLASSIFICACOES[s.classificacao] || s.classificacao)}</span><br>` : ''}${opera() ? `${s && s.classificacao ? `${botao('usarSugestao', 'Usar sugestão', { id: m.id })} ` : ''}${botao('darDestino', 'Dar destino', { id: m.id })}` : ''}</td></tr>`; }).join('')}</table></div>`
    : `<p class="suave">${movs.length ? 'Todas as movimentações do mês têm destino. ✓' : `Nenhuma movimentação do banco em ${compBr(mes)} (busque o extrato na tela <a href="#/banco?mes=${mes}">Banco</a>).`}</p>`}
      <p class="suave">Cada destino lança no lugar certo: aluguel no boleto, Airbnb dividido entre os imóveis vagos, conta do imóvel nos custos, reforma no imóvel, IPTU na parcela, imposto na guia. Tudo aparece nos resultados. Extrato completo e comprovantes: <a href="#/banco?mes=${mes}">tela Banco</a>.</p></div>
    <div class="cartao"><div class="cabecalho"><h2>NF do Airbnb de ${compBr(mesAir)}</h2>${air.numerada ? etiqueta(`NF nº ${R.numeroFatura(air.numerada)}`, 'ok') : air.nf ? etiqueta(air.divergente ? 'soma mudou: gere de novo' : 'aguardando número', air.divergente ? 'aviso' : 'info') : air.total ? etiqueta('a gerar', 'aviso') : ''}</div>
      ${air.total ? `<p>Uma NF só, sem imóvel, com a soma dos ganhos: <b>${reais(air.total)}</b> = ${air.porImovel.map((x) => `${esc(x.imovel.nome)} ${reais(x.valor)}`).join(' + ')}.</p>` : `<p class="suave">Nenhum ganho do Airbnb lançado com referência a ${compBr(mesAir)}.</p>`}
      ${air.nf && air.nf.valor !== air.total ? `<p class="texto-aviso">A NF está com ${reais(air.nf.valor)}, mas os ganhos somam ${reais(air.total)}.</p>` : ''}
      ${opera() && !air.numerada && (air.total || air.nf) && mesAir < atual && (!air.nf || air.divergente) ? botao('gerarNfAirbnb', air.nf ? 'Acertar a NF do Airbnb' : 'Gerar a NF do Airbnb', { mes: mesAir }, 'pequeno') : ''}
      ${air.nf && !air.numerada ? ` ${link('#/faturas', 'Numerar na tela NF')}` : ''}
      <p class="suave">Gerada depois da virada do mês, com os dados padrão do Airbnb; entra na numeração das NFs do fechamento.</p></div>
    <div class="cartao"><div class="cabecalho"><h2>Impostos de ${compBr(mes)}</h2>${link(`#/impostos?mes=${mes}`, 'Ver as guias')}</div>
      ${impostos.map((x) => { const confirmadas = x.guias.filter((g) => g.contador).length; return `<p><b>${esc(x.empresa.nome)}</b>: guia esperada ${reais(x.guias.reduce((t, g) => t + (g.abaixoDoMinimo ? 0 : g.aPagar), 0))} ${confirmadas === x.guias.length ? etiqueta('confirmada pelo contador', 'ok') : etiqueta(confirmadas ? `${confirmadas} de ${x.guias.length} guias do contador` : 'estimada', 'aviso')}</p>`; }).join('') || '<p class="suave">Nenhuma empresa cadastrada.</p>'}
      <p class="suave">Os resultados usam a estimativa até você informar o valor da guia do contador em Impostos; aí se corrigem sozinhos.</p></div>
    <div class="cartao"><h2>Resultado de ${compBr(mes)}</h2>
      <table class="compacta"><tr><td>Receita (aluguel ${reais(tot('aluguel') + tot('avulsas'))} + Airbnb ${reais(tot('airbnb'))})</td><td class="n nw">${reais(tot('receita'))}</td></tr>
        <tr><td>IPTU</td><td class="n nw">${menos(tot('iptu'))}</td></tr><tr><td>Custos</td><td class="n nw">${menos(tot('contas'))}</td></tr>
        <tr><td>Impostos${tot('impostosEstimados') ? ' (estimado)' : ''}</td><td class="n nw">${menos(tot('impostos'))}</td></tr>
        <tr class="total"><td>Líquido</td><td class="n nw">${reais(tot('liquido'))}</td></tr>
        <tr><td>Reformas (à parte)</td><td class="n nw">${menos(tot('reformasPeriodo'))}</td></tr>
        <tr class="total"><td>Lucro depois das reformas</td><td class="n nw">${reais(tot('lucro'))}</td></tr></table>
      <p class="suave">Pelo dia em que o dinheiro entrou ou saiu. Por imóvel: abas Resultado bruto e Resultado líquido.</p></div>`;
}
