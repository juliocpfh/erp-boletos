// Regras de cálculo da cobrança mensal de aluguel.
// Valores em dinheiro são sempre CENTAVOS inteiros (R$ 1.350,00 = 135000).
// Percentuais são números comuns (10 = 10%). Datas são textos "AAAA-MM-DD".

/**
 * Erro "do usuário": o que ele digitou ou pediu não serve (senha errada, valor acima do limite, código de barras curto).
 * A tela mostra a mensagem como qualquer erro, mas não registra no console (não é defeito do programa).
 */
export class ErroUsuario extends Error {
  constructor(mensagem) { super(mensagem); this.name = 'ErroUsuario'; this.esperado = true; }
}

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

// formatadores criados uma vez (criar um a cada chamada custa ~60 vezes mais); a saída é a mesma do toLocaleString
const FMT_REAIS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FMT_PCT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });

export function reais(c, comSimbolo = true) {
  const t = FMT_REAIS.format((c || 0) / 100);
  return comSimbolo ? `R$ ${t}` : t;
}

export function pct(n) {
  const x = n || 0;
  // número: o formatador; outro tipo (texto em dado antigo) fica como o toLocaleString dele devolvia
  return `${typeof x === 'number' ? FMT_PCT.format(x) : x.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
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

// o toLocaleString('pt-BR') sem opções usa ano, mês, dia, hora, minuto e segundo: o formatador com essas opções dá o mesmo texto
const FMT_DATA_HORA = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });

/** Data e hora de um instante (texto ISO, número ou Date), igual ao toLocaleString('pt-BR'): "09/11/2026, 19:37:05". Inválido: "Invalid Date", como ele. */
export function dataHoraBr(quando) {
  const dt = new Date(quando);
  return Number.isNaN(dt.getTime()) ? String(dt) : FMT_DATA_HORA.format(dt);
}

/** Data e hora de agora: "09/11/2026, 19:37:05". */
export const agoraBr = () => dataHoraBr(Date.now());

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

// --------------------------------------------------------------------------
// Dias úteis (bancos): sábado, domingo e feriado nacional não contam
// --------------------------------------------------------------------------
const FERIADOS = new Map();

/** Feriados nacionais em que os bancos não abrem (fixos e móveis pela Páscoa: Carnaval, Sexta-feira Santa, Corpus Christi). */
export function feriados(ano) {
  if (FERIADOS.has(ano)) return FERIADOS.get(ano);
  // domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
  const a = ano % 19; const b = Math.floor(ano / 100); const c = ano % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((x) => `${ano}-${x}`);
  const lista = new Set([...fixos, ...[-48, -47, -2, 60].map((n) => somarDias(pascoa, n))]);
  FERIADOS.set(ano, lista);
  return lista;
}

/** Dia útil para o banco: nem sábado, nem domingo, nem feriado nacional. */
export function diaUtil(isoData) {
  const dia = paraData(isoData).getUTCDay();
  return dia !== 0 && dia !== 6 && !feriados(Number(isoData.slice(0, 4))).has(isoData.slice(0, 10));
}

/** Dia útil igual ou anterior à data (vencimento de tributo federal que cai em dia sem expediente bancário antecipa). */
export function diaUtilAteh(isoData) {
  let x = isoData;
  while (!diaUtil(x)) x = somarDias(x, -1);
  return x;
}

/** Dia útil igual ou seguinte à data. */
export function proximoDiaUtil(isoData) {
  let x = isoData;
  while (!diaUtil(x)) x = somarDias(x, 1);
  return x;
}

/**
 * Último dia para pagar o boleto em dia (sem multa e juros, com a bonificação): o vencimento ou, se ele cai em sábado,
 * domingo ou feriado nacional, o próximo dia útil (decisão do dono, 09/11/2026). Ex.: sáb 10/10/2026 → ter 13/10/2026.
 */
export function limitePagamento(vencimento) {
  return proximoDiaUtil(vencimento);
}

/** Boleto vencido em ``hoje``: só depois do último dia para pagar em dia (``limitePagamento``). */
export function vencido(vencimento, hoje) {
  return !!vencimento && hoje > limitePagamento(vencimento);
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

/**
 * Aluguel cheio que, com a bonificação de ``percentual``, dá o bonificado digitado (no centavo, quando existe).
 * Ex.: bonificado R$ 1.500,00 com 10% → cheio R$ 1.666,67 (desconto R$ 166,67).
 */
export function cheioPorBonificado(bonificado, percentual) {
  if (!(percentual > 0) || percentual >= 100) return bonificado;
  const base = arred(bonificado / (1 - percentual / 100));
  for (const v of [base, base - 1, base + 1, base - 2, base + 2]) if (v - descontoPorPercentual(v, percentual) === bonificado) return v;
  return base;
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

/**
 * Multa fixa sobre o valor em aberto e juros simples pro rata dia (mês de 30 dias). Vencimento em dia não útil: pago até o
 * próximo dia útil não tem multa nem juros; depois dele, o atraso conta desde o vencimento, como fazem os bancos.
 * Ex.: vence sáb 10/10/2026 → pago ter 13/10 em dia; pago qua 14/10 = 4 dias de juros.
 */
export function multaEJuros(base, vencimento, pagamento, multaPct, jurosMesPct) {
  if (!vencido(vencimento, pagamento)) return { dias: 0, multa: 0, juros: 0 };
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

// --------------------------------------------------------------------------
// Textos
// --------------------------------------------------------------------------
/** Texto sem acento ("Água São João" → "Agua Sao Joao"); maiúsculas, espaços e o resto ficam como estão. Vazio/nulo → ''. */
export const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Texto para nome de arquivo ou id: sem acento, minúsculas, o que não for letra ou número vira "-" (ex.: "Apólice Nº 1" → "apolice-n-1"). */
export const paraNomeDeArquivo = (t) => semAcento(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// --------------------------------------------------------------------------
// Parâmetros do endereço (#/tela?comp=…&ordem=…): só valem no formato esperado
// Quem monta o endereço pode ser qualquer pessoa (um link mandado por WhatsApp): o que não estiver
// no formato é descartado e a tela usa o padrão. Isso impede texto estranho de chegar ao HTML.
// --------------------------------------------------------------------------
const COMPETENCIA_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATA_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** 'AAAA-MM' válido, senão o padrão. */
export function competenciaValida(texto, padrao) {
  return COMPETENCIA_RE.test(String(texto || '')) ? String(texto) : padrao;
}

/** 'AAAA-MM-DD' válido, senão o padrão. */
export function dataValida(texto, padrao = '') {
  return DATA_RE.test(String(texto || '')) ? String(texto) : padrao;
}

/** Formato aceito de cada parâmetro conhecido do endereço; os demais passam como estão (as telas escapam o texto). */
const FORMATOS_PARAMETRO = {
  comp: COMPETENCIA_RE, mes: COMPETENCIA_RE,
  data: DATA_RE,
  de: /^(\d{4}-\d{2}-\d{2}|[a-z]+)$/, ate: DATA_RE, // "de" também é a tela de origem (de=iptu, de=inquilinos)
  imovel: /^\d+$/, contrato: /^\d+$/, pessoa: /^\d+$/, substitui: /^\d+$/, modelo: /^\d+$/, numero: /^\d+$/, ano: /^\d{4}$/,
  vincular: /^\d+$/, ficha: /^\d+$/, custo: /^\d+$/, airbnb: /^\d+$/, id: /^\d+$/,
  ids: /^\d+(,\d+)*$/, numeros: /^\d+(,\d+)*$/,
  ordem: /^[a-z_]+$/, filtro: /^[a-z_]+$/, tipo: /^[\wÀ-ÿ -]+$/, todos: /^[01]$/, nf: /^[01]$/,
  ir: /^[\w-]+$/, voltar: /^#\/[\w/?&=.,-]*$/,
  q: /^[^\r\n<>]{1,100}$/, // texto da busca global (a tela ainda passa por esc())
};

/** Devolve só os parâmetros no formato esperado (os conhecidos fora do formato somem; a tela usa o padrão). */
export function sanearParametros(q) {
  const limpo = {};
  for (const [k, v] of Object.entries(q || {})) {
    const re = FORMATOS_PARAMETRO[k];
    if (!re || re.test(String(v))) limpo[k] = String(v);
  }
  return limpo;
}
