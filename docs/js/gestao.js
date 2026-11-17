// Painel de Gestão (números do mês para o dono): inadimplência, imóveis vagos, contratos a vencer, reajustes, recebido x previsto,
// NFs e caução guardada, com o mês anterior para comparar. Só junta funções de regras.js (nenhuma regra de negócio nova aqui).
// Carregado só quando a tela Gestão abre (telas/gestao.js, ADIADOS do sw.js).
import * as C from './calculos.js';
import * as R from './regras.js';

/** Contratos que vencem "logo": até este número de dias depois do dia de referência. */
export const JANELA_VENCIMENTO = 90;

/** Dia de referência do mês: hoje, no mês corrente; num mês que já passou, o último dia dele. */
export const diaDoMes = (mes, hoje) => (mes >= C.competenciaDe(hoje) ? hoje : C.limitesCompetencia(mes)[1]);

/** Valor sobre o total em %, com uma casa (0 quando não há total). Ex.: R$ 500,00 de R$ 4.000,00 → 12,5. */
export const percentual = (parte, total) => (total > 0 ? Math.round((parte * 1000) / total) / 10 : 0);

const vazioBoletos = () => ({ boletos: [], previsto: 0, previstoEmDia: 0, pagos: [], recebido: 0, atrasados: [], emAtraso: 0,
  aVencer: [], outros: [], entrou: 0, entrouQtd: 0 });

/**
 * Boletos dos meses pelo mês do vencimento (uma passada só pelos boletos). Fora: complemento da caução (é garantia), carência
 * sem valor e o boleto trocado por um acordo (valem as parcelas, cada uma no mês dela). Cada boleto cai em: pago, em atraso
 * (está na inadimplência de hoje, ``R.inadimplencia``), a vencer (``R.aCobrar`` e ainda não ``C.vencido``) ou outro
 * (descontado da garantia na saída, ou de contrato encerrado: vai no cálculo final). ``entrou``: o que foi pago no mês (pela
 * data do pagamento), de qualquer vencimento.
 */
function boletosDosMeses(d, meses, hoje, atrasados) {
  const por = new Map(meses.map((m) => [m, vazioBoletos()]));
  for (const cb of d.cobrancas) {
    if (R.ehComplementoCaucao(cb)) continue;
    const pagoEm = por.get(String(cb.data_pagamento || '').slice(0, 7));
    if (pagoEm) { pagoEm.entrou += cb.valor_pago || 0; pagoEm.entrouQtd += 1; }
    const x = por.get(String(cb.vencimento || '').slice(0, 7));
    if (!x || cb.situacao === 'Carência' || R.emAcordo(cb)) continue;
    const t = R.totais(cb);
    x.boletos.push(cb);
    x.previsto += t.a_pagar_sem_desconto;
    x.previstoEmDia += t.a_pagar_pontual;
    if (cb.data_pagamento) { x.pagos.push(cb); x.recebido += cb.valor_pago || 0; } else if (atrasados.has(cb.id)) { x.atrasados.push(atrasados.get(cb.id)); x.emAtraso += t.a_pagar_sem_desconto; } else if (R.aCobrar(cb) && !C.vencido(cb.vencimento, hoje)) x.aVencer.push(cb);
    else x.outros.push(cb);
  }
  for (const x of por.values()) {
    x.inquilinos = new Set(x.atrasados.map((b) => b.contrato.id)).size;
    x.pct = percentual(x.emAtraso, x.previsto);
    x.pctRecebido = percentual(x.recebido, x.previstoEmDia);
  }
  return por;
}

/** Imóveis vagos no dia (``R.imovelVago``), do vago há mais tempo ao mais recente (nunca alugado no fim). */
export function vagosNoDia(d, dia) {
  return d.imoveis.map((imovel) => ({ imovel, ...R.imovelVago(d, imovel.id, dia) })).filter((x) => 'desde' in x)
    .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1) || a.imovel.nome.localeCompare(b.imovel.nome, 'pt-BR'));
}

/**
 * Contratos que vencem até ``JANELA_VENCIMENTO`` dias depois do dia, e os que já venceram sem renovação: os mesmos do alerta
 * "Vigência do contrato" (prazo determinado, sem saída informada, sem troca de titular agendada; fim por ``R.fimDoContrato``).
 * Devolve { lista: [{ contrato, fim, faltam }] (faltam < 0: venceu), aVencer, vencidos }.
 */
export function contratosAVencer(d, dia) {
  const lista = [];
  for (const c of d.contratos) {
    if (!c.imovel_id || c.prazo_tipo === 'Indeterminado' || c.data_saida || !R.contratoAtivo(c, dia) || R.herancaAgendada(d, c, dia)) continue;
    const fim = R.fimDoContrato(d, c) || c.vigencia_fim;
    if (!fim) continue;
    const faltam = C.diasEntre(dia, fim);
    if (faltam <= JANELA_VENCIMENTO) lista.push({ contrato: c, fim, faltam });
  }
  lista.sort((a, b) => a.faltam - b.faltam || a.contrato.inquilino_nome.localeCompare(b.contrato.inquilino_nome, 'pt-BR'));
  return { lista, aVencer: lista.filter((x) => x.faltam >= 0).length, vencidos: lista.filter((x) => x.faltam < 0).length };
}

/** Reajustes do mês (``R.reajustesDoMes``) com quantos já foram aplicados. */
const reajustes = (d, mes, hoje) => { const lista = R.reajustesDoMes(d, mes, hoje); return { mes, lista, feitos: lista.filter((r) => r.corrigido).length }; };

/** NFs emitidas no mês (não canceladas, pela data de emissão, ``R.indiceFaturamento``): quantas (números) e a soma. */
function nfsDoMes(indice, mes) {
  const numeros = new Set();
  let valor = 0;
  for (const meses of indice.values()) {
    const x = meses.get(mes);
    if (!x) continue;
    valor += x.valor;
    for (const n of x.numeros) numeros.add(n);
  }
  return { qtd: numeros.size, valor };
}

/**
 * Todos os números da tela Gestão do mês ``mes`` ('AAAA-MM'), com o mês anterior para comparar. Inadimplência e recebido são
 * pelo mês do vencimento e pela situação de hoje (um boleto de outubro pago hoje deixa de contar como atraso de outubro);
 * vagos e contratos a vencer, no dia de referência (hoje ou o último dia do mês); caução guardada, hoje.
 * ``nfs``: ``R.indiceFaturas(d)`` já montado no desenho (senão é montado aqui, uma vez).
 */
export function numerosDaGestao(d, mes, hoje = C.hojeIso(), nfs = R.indiceFaturas(d)) {
  const anterior = C.somarMeses(mes, -1);
  const proximo = C.somarMeses(mes, 1);
  const dia = diaDoMes(mes, hoje);
  const diaAnterior = diaDoMes(anterior, hoje);
  const inad = R.inadimplencia(d, hoje, { historico: false });
  const atrasados = new Map();
  for (const x of inad.devedores) for (const b of x.boletos) atrasados.set(b.cobranca.id, { contrato: x.contrato, ...b });
  const boletos = boletosDosMeses(d, [mes, anterior], hoje, atrasados);
  const faturamento = R.indiceFaturamento(d);
  const aguardando = R.pendentesDeFatura(d, nfs).filter((p) => String(p.data || '').slice(0, 7) === mes);
  const g = R.garantiasPorEmpresa(d);
  const vencer = contratosAVencer(d, dia);
  return {
    mes, anterior, proximo, dia, diaAnterior, hoje,
    boletos: boletos.get(mes), boletosAnterior: boletos.get(anterior),
    emAtrasoHoje: { inquilinos: inad.devedores.length, total: inad.total, totalHoje: inad.totalHoje, devedores: inad.devedores },
    vagos: vagosNoDia(d, dia), vagosAnterior: vagosNoDia(d, diaAnterior).length, imoveis: d.imoveis.length,
    vencer, vencerAnterior: contratosAVencer(d, diaAnterior).aVencer,
    reajustes: reajustes(d, mes, hoje), reajustesProximo: reajustes(d, proximo, hoje), reajustesAnterior: reajustes(d, anterior, hoje),
    nfs: { ...nfsDoMes(faturamento, mes), aguardando: aguardando.length }, nfsAnterior: nfsDoMes(faturamento, anterior),
    caucao: { total: g.total, aplicado: g.aplicado, inquilinos: new Set([...g.lugares.flatMap((l) => l.itens.map((x) => x.contrato.id)), ...g.semAplicar.map((x) => x.contrato.id)]).size },
  };
}
