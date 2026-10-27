// Regras de cálculo da cobrança mensal de aluguel.
// Valores em dinheiro são sempre CENTAVOS inteiros (R$ 1.350,00 = 135000).
// Percentuais são números comuns (10 = 10%). Datas são textos "AAAA-MM-DD".

/** Arredonda para o inteiro mais próximo, meio para cima (também para negativos). */
export function arred(x) {
  const s = x < 0 ? -1 : 1;
  return s * Math.round(Math.abs(x) + 1e-7);
}

/** Converte texto digitado ("1.234,56", "R$ 10", "1234.5") em centavos. */
export function centavos(texto) {
  if (texto === null || texto === undefined || texto === '') return 0;
  if (typeof texto === 'number') return arred(texto * 100);
  let t = String(texto).replace(/R\$|\s/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // "1.350" = mil trezentos e cinquenta reais
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido: ${texto}`);
  return arred(n * 100);
}

/**
 * Índice acumulado a partir das variações de cada mês (em %): multiplica (1 + mês) e tira 1.
 * Ex.: 0,27% e -0,01% → 0,2600%. Quatro casas, como nas cartas de reajuste.
 */
export function acumuladoDosMeses(mensais) {
  const fator = mensais.reduce((f, v) => f * (1 + v / 100), 1);
  return Math.round((fator - 1) * 1e6) / 1e4;
}

/** Converte texto de percentual ("10", "8,5", "1,25%") em número. */
export function numero(texto) {
  if (texto === null || texto === undefined || texto === '') return 0;
  if (typeof texto === 'number') return texto;
  let t = String(texto).replace(/%|\s/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`Número inválido: ${texto}`);
  return n;
}

export function reais(c, comSimbolo = true) {
  const v = (c || 0) / 100;
  const t = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return comSimbolo ? `R$ ${t}` : t;
}

export function pct(n) {
  return `${(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
}

// --------------------------------------------------------------------------
// Datas e competências ("AAAA-MM", o mês de uso do imóvel)
// --------------------------------------------------------------------------
const MS_DIA = 86400000;

export function paraData(iso) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function iso(data) {
  return data.toISOString().slice(0, 10);
}

export function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function diasEntre(a, b) {
  return Math.round((paraData(b) - paraData(a)) / MS_DIA);
}

export function somarDias(isoData, dias) {
  return iso(new Date(paraData(isoData).getTime() + dias * MS_DIA));
}

export function dataBr(isoData) {
  if (!isoData) return '-';
  const [a, m, d] = isoData.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function compBr(comp) {
  return comp ? `${comp.slice(5, 7)}/${comp.slice(0, 4)}` : '-';
}

export function competenciaDe(isoData) {
  return isoData.slice(0, 7);
}

export function somarMeses(comp, meses) {
  const [a, m] = comp.split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function mesesEntre(inicio, fim) {
  const [a1, m1] = inicio.split('-').map(Number);
  const [a2, m2] = fim.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

/** Data somada de meses (31/01 + 1 mês = 28 ou 29/02). */
export function somarMesesData(isoData, meses) {
  const alvo = somarMeses(isoData.slice(0, 7), meses);
  return `${alvo}-${String(Math.min(Number(isoData.slice(8, 10)), diasNoMes(alvo))).padStart(2, '0')}`;
}

/** Fim do contrato: o mesmo dia, X meses depois, como nos contratos (05/09/2026 + 30 meses = 05/03/2029). */
export function fimDoPrazo(inicio, meses) {
  return somarMesesData(inicio, meses);
}

/** Meses entre o início e o fim do contrato (o inverso de fimDoPrazo; aceita também o fim um dia antes). */
export function mesesDoPrazo(inicio, fim) {
  if (!inicio || !fim) return null;
  const m = mesesEntre(inicio.slice(0, 7), fim.slice(0, 7));
  for (const x of [m, m + 1, m - 1]) if (x > 0 && (fimDoPrazo(inicio, x) === fim || somarDias(fimDoPrazo(inicio, x), -1) === fim)) return x;
  return Math.max(1, m);
}

export function diasNoMes(comp) {
  const [a, m] = comp.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

export function limitesCompetencia(comp) {
  return [`${comp}-01`, `${comp}-${String(diasNoMes(comp)).padStart(2, '0')}`];
}

export function somarAnos(isoData, anos) {
  const [a, m, d] = isoData.split('-').map(Number);
  const alvo = `${String(a + anos).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
  return `${alvo}-${String(Math.min(d, diasNoMes(alvo))).padStart(2, '0')}`;
}

/** Vencimento da cobrança de uma competência. Dia inexistente vira o último dia do mês. */
export function vencimentoDaCompetencia(comp, dia, mesSeguinte = true) {
  const alvo = mesSeguinte ? somarMeses(comp, 1) : comp;
  return `${alvo}-${String(Math.min(dia, diasNoMes(alvo))).padStart(2, '0')}`;
}

// --------------------------------------------------------------------------
// Aluguel proporcional e desconto de pontualidade
// --------------------------------------------------------------------------

/** Dias da competência em que o inquilino ocupou o imóvel (entrada e saída contam). */
export function diasOcupados(comp, entrada, saida) {
  const [ini, fim] = periodoServico(comp, entrada, saida);
  return ini > fim ? 0 : diasEntre(ini, fim) + 1;
}

/** Período de ocupação dentro da competência (ex.: 07/06 a 30/06 no mês de entrada). */
export function periodoServico(comp, entrada, saida) {
  let [ini, fim] = limitesCompetencia(comp);
  if (entrada && entrada > ini) ini = entrada;
  if (saida && saida < fim) fim = saida;
  return [ini, fim];
}

export function aluguelProporcional(mensal, dias, diasMes) {
  if (dias >= diasMes) return mensal;
  return arred((mensal * dias) / diasMes);
}

export function descontoPorPercentual(base, percentual) {
  return arred((base * (percentual || 0)) / 100);
}

export function percentualPorDesconto(base, valor) {
  if (!base) return 0;
  return Math.round(((valor * 100) / base) * 10000) / 10000;
}

/**
 * Percentual de bonificação a partir do aluguel bonificado digitado, sem arredondar,
 * para que o desconto recalculado dê exatamente o valor digitado.
 */
export function percentualPorBonificado(base, bonificado) {
  if (!base) return 0;
  return ((base - bonificado) * 100) / base;
}

// --------------------------------------------------------------------------
// Parcelamentos (IPTU e seguro)
// --------------------------------------------------------------------------

/** Divide um total em parcelas; a diferença de centavos fica na primeira. */
export function parcelas(total, quantidade) {
  quantidade = Math.trunc(quantidade || 0);
  if (quantidade <= 0) return [];
  const base = arred(total / quantidade);
  const lista = Array(quantidade).fill(base);
  lista[0] = total - base * (quantidade - 1);
  return lista;
}

/** [número da parcela, valor] cobrado na competência, ou [null, 0]. */
export function parcelaNaCompetencia(total, quantidade, primeiraComp, comp) {
  if (!primeiraComp || !quantidade) return [null, 0];
  const i = mesesEntre(primeiraComp, comp);
  const lista = parcelas(total, quantidade);
  return i >= 0 && i < lista.length ? [i + 1, lista[i]] : [null, 0];
}

// --------------------------------------------------------------------------
// Correção do aluguel
// --------------------------------------------------------------------------
export function aplicarCorrecao(valor, percentual) {
  return arred(valor * (1 + (percentual || 0) / 100));
}

/** Aluguel numa data, aplicando as correções com data_vigencia até essa data. */
export function aluguelVigente(inicial, correcoes, dataRef) {
  let valor = inicial;
  [...correcoes]
    .sort((a, b) => a.data_vigencia.localeCompare(b.data_vigencia))
    .forEach((c) => { if (c.data_vigencia <= dataRef) valor = c.valor_novo; });
  return valor;
}

// --------------------------------------------------------------------------
// Composição da cobrança
// --------------------------------------------------------------------------
export function totaisCobranca({ aluguel, desconto, iptu = 0, seguro = 0, taxa_boleto = 0, outros = 0, ressarcimento = 0, fci = 0 }, reservaDisponivel = 0) {
  const encargos = iptu + seguro + taxa_boleto + outros + (fci || 0);
  // ressarcimento ao inquilino (ex.: taxa extraordinária do condomínio que ele pagou e é do proprietário)
  const totalSemDesconto = aluguel + encargos - (ressarcimento || 0);
  const totalPontual = totalSemDesconto - desconto;
  const reserva = Math.min(reservaDisponivel, Math.max(totalPontual, 0));
  return {
    encargos,
    total_sem_desconto: totalSemDesconto,
    total_pontual: totalPontual,
    reserva_utilizada: reserva,
    a_pagar_pontual: totalPontual - reserva,
    a_pagar_sem_desconto: Math.max(totalSemDesconto - reserva, 0),
    // multa e juros por atraso não incidem sobre o FCI (fundo de conservação do imóvel)
    base_multa: Math.max(totalSemDesconto - reserva - (fci || 0), 0),
  };
}

export function calcularCobranca({ competencia, aluguelMensal, entrada, saida, descontoPercentual = 0, iptu = 0,
  seguro = 0, taxaBoleto = 0, outros = 0, reservaDisponivel = 0 }) {
  const diasMes = diasNoMes(competencia);
  const dias = diasOcupados(competencia, entrada, saida);
  const aluguel = aluguelProporcional(aluguelMensal, dias, diasMes);
  const desconto = descontoPorPercentual(aluguel, descontoPercentual);
  const itens = { aluguel, desconto, iptu, seguro, taxa_boleto: taxaBoleto, outros };
  return {
    competencia, dias_cobrados: dias, dias_mes: diasMes, aluguel_mensal: aluguelMensal, ...itens,
    ...totaisCobranca(itens, reservaDisponivel),
  };
}

// --------------------------------------------------------------------------
// Pagamento: multa, juros e nota fiscal
// --------------------------------------------------------------------------

/** Juros por dia de atraso, em centavos, como o banco calcula: % ao mês ÷ 30, centavos truncados. */
export function jurosAoDia(base, jurosMesPct) {
  return Math.floor((base * (jurosMesPct || 0)) / 100 / 30 + 1e-7);
}

/** Multa fixa sobre o valor em aberto e juros simples pro rata dia (mês de 30 dias). */
export function multaEJuros(base, vencimento, pagamento, multaPct, jurosMesPct) {
  const dias = diasEntre(vencimento, pagamento);
  if (dias <= 0) return { dias: 0, multa: 0, juros: 0 };
  return {
    dias,
    multa: arred((base * (multaPct || 0)) / 100),
    juros: jurosAoDia(base, jurosMesPct) * dias,
  };
}

/**
 * Base da nota fiscal / fatura: só o aluguel.
 * Pontual: aluguel com o desconto. Em atraso: aluguel cheio + multa + juros.
 * IPTU, seguro e tarifa de cobrança não entram.
 */
export function valorNotaFiscal(aluguel, desconto, multa = 0, juros = 0, pontual = true) {
  return pontual ? aluguel - desconto : aluguel + multa + juros;
}

/**
 * Quanto pagar e o valor da nota fiscal, com multa e juros contados até ``pagamento`` (o dia em que o inquilino pagou).
 * Em dia: com o desconto. Atrasado: valor cheio + multa + juros, como o banco cobra no próprio boleto.
 */
export function liquidar(cobranca, pagamento) {
  const t = totaisCobranca(cobranca, cobranca.reserva_utilizada || 0);
  const { dias, multa, juros } = multaEJuros(t.base_multa, cobranca.vencimento, pagamento,
    cobranca.multa_percentual, cobranca.juros_mensal_percentual);
  const pontual = dias === 0;
  return {
    dias_atraso: dias, pontual, multa, juros,
    valor_devido: pontual ? t.a_pagar_pontual : t.a_pagar_sem_desconto + multa + juros,
    // o ressarcimento só sai da NF quando a empresa decidiu assim (opção em Empresas)
    valor_nf: valorNotaFiscal(cobranca.aluguel, cobranca.desconto, multa, juros, pontual) - (cobranca.ressarcimento_na_nf ? cobranca.ressarcimento || 0 : 0),
  };
}

/** Divide um valor pelos percentuais; a sobra de centavos fica com a última parte. */
export function dividir(total, percentuais) {
  const partes = percentuais.map((p) => arred((total * p) / 100));
  const soma = percentuais.reduce((a, b) => a + b, 0);
  if (partes.length && Math.abs(soma - 100) < 1e-9) {
    partes[partes.length - 1] = total - partes.slice(0, -1).reduce((a, b) => a + b, 0);
  }
  return partes;
}

// --------------------------------------------------------------------------
// Estado (UF) pelo CEP: faixas dos Correios (ex.: 82210-050 → PR)
// --------------------------------------------------------------------------
const FAIXAS_CEP = [
  [1000, 19999, 'SP'], [20000, 28999, 'RJ'], [29000, 29999, 'ES'], [30000, 39999, 'MG'], [40000, 48999, 'BA'], [49000, 49999, 'SE'],
  [50000, 56999, 'PE'], [57000, 57999, 'AL'], [58000, 58999, 'PB'], [59000, 59999, 'RN'], [60000, 63999, 'CE'], [64000, 64999, 'PI'],
  [65000, 65999, 'MA'], [66000, 68899, 'PA'], [68900, 68999, 'AP'], [69000, 69299, 'AM'], [69300, 69399, 'RR'], [69400, 69899, 'AM'],
  [69900, 69999, 'AC'], [70000, 72799, 'DF'], [72800, 72999, 'GO'], [73000, 73699, 'DF'], [73700, 76799, 'GO'], [76800, 76999, 'RO'],
  [77000, 77999, 'TO'], [78000, 78899, 'MT'], [79000, 79999, 'MS'], [80000, 87999, 'PR'], [88000, 89999, 'SC'], [90000, 99999, 'RS'],
];

/** UF do CEP pelos 5 primeiros números; '' se o CEP estiver incompleto. */
export function ufDoCep(cep) {
  const n = String(cep || '').replace(/\D/g, '');
  if (n.length !== 8) return '';
  const p = Number(n.slice(0, 5));
  const f = FAIXAS_CEP.find(([de, ate]) => p >= de && p <= ate);
  return f ? f[2] : '';
}
