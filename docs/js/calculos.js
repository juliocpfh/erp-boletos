// Regras de cálculo da cobrança mensal de aluguel.
// Valores em dinheiro são sempre CENTAVOS inteiros (R$ 1.350,00 = 135000).
// Percentuais são números comuns (10 = 10%). Datas são textos "AAAA-MM-DD".
import { feriadosLocais, regra } from './config-regras.js';
import { dataDeBrasilia, inicioDoPrazo, proximoHorarioComercial, rotuloDoHorario, ultimoDiaDoPrazo, validadeDoLink } from './brasilia.js';

export { dataDeBrasilia, horaDeBrasilia, inicioDoPrazo, proximoHorarioComercial, rotuloDoHorario, ultimoDiaDoPrazo, validadeDoLink } from './brasilia.js';

/**
 * Erro "do usuário": o que ele digitou ou pediu não serve (senha errada, valor acima do limite, código de barras curto).
 * A tela mostra a mensagem como qualquer erro, mas não registra no console (não é defeito do programa).
 */
export class ErroUsuario extends Error {
  constructor(mensagem) { super(mensagem); this.name = 'ErroUsuario'; this.esperado = true; }
}

/**
 * Número com a palavra no singular ou no plural: plural(1, 'dia') → "1 dia"; plural(3, 'dia') → "3 dias";
 * plural(2, 'cadastro incompleto', 'cadastros incompletos') → "2 cadastros incompletos". Sem o plural, junta "s".
 */
export function plural(n, singular, varios = `${singular}s`) {
  return `${n} ${Math.abs(Number(n)) === 1 ? singular : varios}`;
}

/** "é hoje", "falta 1 dia", "faltam 5 dias" (n = dias que faltam; 0 = hoje). */
export const faltamDias = (n) => (Number(n) === 0 ? 'é hoje' : `${Number(n) === 1 ? 'falta' : 'faltam'} ${plural(n, 'dia')}`);

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
  // formato americano ("2,300.00": vírgula antes do ponto) virava R$ 2,30 sem aviso (decisão do dono, 2026-11-16: recusar)
  if (/,.*\./.test(t)) throw new ErroUsuario(`Valor "${texto}" no formato errado. Use 2.300,00 (ponto no milhar, vírgula nos centavos).`);
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // "1.350" = mil trezentos e cinquenta reais
  const n = Number(t);
  if (!Number.isFinite(n)) throw new ErroUsuario(`Valor inválido: ${texto}`);
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

/** Hora do fim do expediente (regra `fim_expediente_hora`, padrão 18): prazo dado a partir dela começa a contar amanhã. */
export const fimDoExpediente = () => regra('fim_expediente_hora');
/** Dia em que começa um prazo dado agora, pela regra do expediente. Ex.: 24/11 às 21h45 → '2026-11-25'; às 10h → '2026-11-24'. */
export const inicioDoPrazoAgora = (agora = new Date()) => inicioDoPrazo(agora, fimDoExpediente());
/** Último dia de um prazo de `dias` corridos dado agora (regra do expediente). Ex.: 7 dias às 21h45 de 24/11 → '2026-12-02'. */
export const prazoDadoAgora = (dias, agora = new Date()) => ultimoDiaDoPrazo(dias, agora, fimDoExpediente());
/** Validade (ISO, fim do último dia em Brasília) de um link de `dias` criado agora. */
export const validadeDoLinkAgora = (dias, agora = new Date()) => validadeDoLink(dias, agora, fimDoExpediente());
/** Data de Brasília de um instante, em dd/mm/aaaa. Ex.: '2026-11-25T00:47:00Z' → '24/11/2026'. */
export const dataBrDe = (instante) => dataBr(dataDeBrasilia(instante));
/** Nome do dia da semana pelo getUTCDay (0 = domingo). */
export const DIAS_DA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/** Data de hoje em Brasília ('AAAA-MM-DD'): a data dos registros de envio (às 21h30 de 24/11 → '2026-11-24'). */
export const hojeBrasilia = (agora = new Date()) => dataDeBrasilia(agora);
/** Feriado nacional ou da cidade (regras do sistema): o horário comercial não vale nesse dia. */
export const ehFeriado = (data) => feriados(Number(data.slice(0, 4))).has(data) || feriadosLocais(Number(data.slice(0, 4))).includes(data);
/** Horas do horário comercial pelas regras do sistema (inicio_expediente_hora, fim_expediente_hora, fim_expediente_sabado_hora). */
export const horasComerciais = () => ({ inicio: regra('inicio_expediente_hora'), fim: regra('fim_expediente_hora'), sabadoFim: regra('fim_expediente_sabado_hora'), ehFeriado });
/**
 * Situação do horário comercial agora: { dentro, quando (Date), rotulo }. Ex.: sexta 27/11/2026 às 21h30 →
 * { dentro: false, rotulo: 'amanhã (sábado), 28/11, às 8h' }; quarta às 10h → { dentro: true }.
 */
export function horarioComercialAgora(agora = new Date()) {
  const p = proximoHorarioComercial(agora, horasComerciais());
  return { dentro: p.dentro, quando: p.quando, rotulo: p.dentro ? '' : rotuloDoHorario(p.data, p.hora, agora) };
}
/** Texto curto do horário comercial das regras: "segunda a sexta, das 8h às 18h, e sábado, das 8h às 12h". */
export function textoHorarioComercial() {
  const h = horasComerciais();
  const sab = Number(h.sabadoFim) > Number(h.inicio) ? `, e sábado, das ${h.inicio}h às ${h.sabadoFim}h` : ' (sábado sem expediente)';
  return `segunda a sexta, das ${h.inicio}h às ${h.fim}h${sab}`;
}

/** Data e hora locais para nomes de arquivo: 'AAAA-MM-DD-HH-MM' (às 20:57 de 16/11/2026 → '2026-11-16-20-57'; não a hora UTC). */
export function carimboLocal(agora = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}-${p(agora.getHours())}-${p(agora.getMinutes())}`;
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

/** Tamanho de arquivo em texto: 1.572.864 bytes → "1,5 MB"; 3.000 → "3 KB" (mínimo 1 KB; nada: "0 KB"); 2 GB → "2,0 GB". */
export function tamanhoTexto(bytes) {
  const b = Number(bytes) || 0;
  if (b <= 0) return '0 KB';
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1).replace('.', ',')} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
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
  // 20/11 (Consciência Negra) é feriado nacional só desde 2024 (Lei 14.759/2023)
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', ...(ano >= 2024 ? ['11-20'] : []), '12-25'].map((x) => `${ano}-${x}`);
  const lista = new Set([...fixos, ...[-48, -47, -2, 60].map((n) => somarDias(pascoa, n))]);
  FERIADOS.set(ano, lista);
  return lista;
}

/**
 * Dia útil para o banco: nem sábado, nem domingo, nem feriado nacional, nem feriado da cidade cadastrado nas regras do sistema
 * (um calendário só para vencimentos e prazos: vistoria, contestação da saída). Ex.: 08/09 feriado local → 06/09/2027 + 2 dias úteis = 10/09.
 */
export function diaUtil(isoData) {
  const dia = paraData(isoData).getUTCDay();
  const ano = Number(isoData.slice(0, 4));
  const x = isoData.slice(0, 10);
  return dia !== 0 && dia !== 6 && !feriados(ano).has(x) && !feriadosLocais(ano).includes(x);
}

/** Soma dias úteis (sem sábado, domingo e feriado nacional). Ex.: sexta 13/11/2026 + 5 → segunda 23/11/2026 (20/11 é feriado nacional). */
export function somarDiasUteis(isoData, dias) {
  let x = isoData;
  for (let n = 0; n < dias;) { x = somarDias(x, 1); if (diaUtil(x)) n += 1; }
  return x;
}

/** Prazo do inquilino para apontar defeito na vistoria de entrada: 5 dias úteis da entrega das chaves (cláusula da vistoria). */
export const PRAZO_VISTORIA_ENTRADA = 5;
export const limiteVistoriaEntrada = (entrada) => somarDiasUteis(entrada, PRAZO_VISTORIA_ENTRADA);

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
  // feriados da cidade cadastrados nas regras do sistema também passam ao dia útil seguinte (ex.: vence 20/01, feriado → 21/01)
  let x = proximoDiaUtil(vencimento);
  while (feriadosLocais(Number(x.slice(0, 4))).includes(x)) x = proximoDiaUtil(somarDias(x, 1));
  return x;
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

/**
 * Divide um total em parcelas. Quando os centavos não dividem, as primeiras ficam mais caras e a última menor
 * (decisão de 2026-11-15). Ex.: R$ 1.200,05 em 10 = nove de R$ 120,01 e a última de R$ 119,96. A soma sempre fecha.
 * Se a última ficaria zerada ou negativa (total minúsculo), a sobra vai centavo a centavo para as primeiras.
 */
export function parcelas(total, quantidade) {
  quantidade = Math.trunc(quantidade || 0);
  if (quantidade <= 0) return [];
  const cheia = Math.ceil(total / quantidade);
  const ultima = total - cheia * (quantidade - 1);
  if (ultima > 0) {
    const lista = Array(quantidade).fill(cheia);
    lista[quantidade - 1] = ultima;
    return lista;
  }
  const base = Math.floor(total / quantidade);
  const sobra = total - base * quantidade;
  return Array.from({ length: quantidade }, (_, k) => base + (k < sobra ? 1 : 0));
}

/**
 * A divisão de antes de 15/11/2026 (a diferença de centavos fica na primeira parcela). Continua valendo para os parcelamentos
 * que já estavam em andamento (IPTU até 2026 e seguro com a 1ª parcela antes de PARCELAS_NOVAS_DESDE), para nenhum boleto em
 * aberto mudar de valor e o total cobrado fechar. Ex.: R$ 1.200,05 em 10 = a 1ª de R$ 119,96 e nove de R$ 120,01.
 */
export function parcelasAntigas(total, quantidade) {
  quantidade = Math.trunc(quantidade || 0);
  if (quantidade <= 0) return [];
  const base = arred(total / quantidade);
  const lista = Array(quantidade).fill(base);
  lista[0] = total - base * (quantidade - 1);
  return lista;
}

/** Competência da 1ª parcela a partir da qual o parcelamento usa a divisão nova (última menor); antes dela, a antiga. Não mude. */
export const PARCELAS_NOVAS_DESDE = '2026-12';
/** As parcelas de um parcelamento cuja 1ª parcela é da competência ``primeiraComp``: divisão antiga ou nova, pelo corte. */
export const parcelasDesde = (total, quantidade, primeiraComp) => (String(primeiraComp || '') < PARCELAS_NOVAS_DESDE ? parcelasAntigas : parcelas)(total, quantidade);

/** [número da parcela, valor] cobrado na competência, ou [null, 0]. */
export function parcelaNaCompetencia(total, quantidade, primeiraComp, comp) {
  if (!primeiraComp || !quantidade) return [null, 0];
  const i = mesesEntre(primeiraComp, comp);
  const lista = parcelasDesde(total, quantidade, primeiraComp);
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
// ``ctx``: o boleto (com contrato_id) ou o contrato, para valer a regra especial do contrato (`regra(chave, ctx)`, config-regras.js)
export function totaisCobranca(cobranca, reservaDisponivel = 0, ctx = cobranca) {
  const { aluguel, desconto, iptu = 0, seguro = 0, taxa_boleto = 0, outros = 0, ressarcimento = 0, fci = 0, multas_notificacao = [], diferencas_cobradas = [], encargos_cobranca = [] } = cobranca;
  // multa da notificação ao inquilino (vai em `outros`): sem multa nem juros de atraso sobre ela (decisão do dono, 2026-11-17);
  // nem sobre a diferença de um pagamento em parte antigo levada a este boleto, que já traz multa e juros dentro (mutirão 19/11);
  // nem sobre os honorários e as despesas de cobrança da parcela do acordo (`encargos_cobranca`, 24/11/2026)
  const multaNotif = [...(multas_notificacao || []), ...(diferencas_cobradas || []), ...(encargos_cobranca || [])].reduce((s, e) => s + (Number(e && e.valor) || 0), 0);
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
    // nunca negativo (ex.: ressarcimento maior que o boleto): igual ao "sem desconto", para quem atrasa não pagar mais que quem paga em dia
    a_pagar_pontual: Math.max(totalPontual - reserva, 0),
    a_pagar_sem_desconto: Math.max(totalSemDesconto - reserva, 0),
    // multa e juros por atraso não incidem sobre o FCI (fundo de conservação do imóvel) nem sobre a multa da notificação (nem a diferença antiga)
    // (boleto de R$ 2.000,00 + multa da notificação de R$ 1.500,00 → base R$ 2.000,00); regra `base_multa`: boleto inteiro
    // (padrão) ou só o aluguel cheio (ex.: aluguel R$ 2.000,00 + IPTU R$ 200,00 → base R$ 2.200,00 ou R$ 2.000,00).
    // Nem sobre a tarifa do boleto (advogado e dono, 24/11/2026, item 2.1): aluguel R$ 1.900,00 + tarifa R$ 8,50 = boleto de
    // R$ 1.908,50; multa de 2% sobre R$ 1.900,00 = R$ 38,00 (e não R$ 38,17), juros também sobre R$ 1.900,00
    base_multa: regra('base_multa', ctx) === 'aluguel'
      ? Math.max(Math.min(aluguel - (ressarcimento || 0), totalSemDesconto - (fci || 0) - taxa_boleto - multaNotif) - reserva, 0)
      : Math.max(totalSemDesconto - reserva - (fci || 0) - taxa_boleto - multaNotif, 0),
  };
}

/**
 * Dias ocupados no mês comercial de 30 dias (decisão do dono, 17/11/2026: "considere todos os meses como 30 dias"): o dia 31
 * não conta e o último dia do mês completa 30 (em fevereiro, 28 ou 29 valem 30). Entrar no último dia do mês (31/01, 28/02,
 * 30/04) conta 1 dia. Ex.: entrada 15/02 → 16/30; saída 27/02 → 27/30; saída 28/02 (ano não bissexto) → 30/30;
 * entrada 02/01 → 29/30; entrada 31/01 → 1/30. Mês inteiro = 30.
 */
export function diasComerciais(comp, entrada, saida, { continuacao = false } = {}) {
  const [ini, fim] = periodoServico(comp, entrada, saida);
  if (ini > fim) return 0;
  const ultimo = diasNoMes(comp);
  const dia = (x) => Number(x.slice(8, 10));
  // continuação (troca de titular ou renovação no meio do mês: o anterior sai na véspera): quem entra paga o que falta para
  // fechar 30/30 (decisão do dono, 21/11/2026, saida-016). Ex.: troca em 28/02 → anterior 27/30, novo 3/30 (e não 1/30);
  // troca em 31/03 → anterior 30/30, novo 0/30; troca em 15/12 → 14/30 + 16/30, como antes.
  const s = continuacao && ini === entrada && dia(ini) > 1 ? Math.min(dia(ini) - 1, 30) + 1
    : dia(ini) === ultimo ? 30 : Math.min(dia(ini), 30);
  const e = dia(fim) === ultimo ? 30 : Math.min(dia(fim), 30);
  return Math.max(0, Math.min(30, e - s + 1));
}

/**
 * Meses completos de moradia pelo mês comercial de 30 dias (`diasComerciais`), da entrada à saída (as duas contam).
 * Ex.: 10/01/2025 a 09/01/2026 → 21 + 11 × 30 + 9 = 360 dias → 12 meses; 10/01/2025 a 20/02/2025 → 41 dias → 1 mês.
 */
export function mesesDeMoradia(entrada, saida) {
  if (!entrada || !saida || saida < entrada) return 0;
  let dias = 0;
  for (let comp = entrada.slice(0, 7); comp <= saida.slice(0, 7); comp = somarMeses(comp, 1)) dias += diasComerciais(comp, entrada, saida);
  return Math.floor(dias / 30);
}

export function calcularCobranca({ competencia, aluguelMensal, entrada, saida, descontoPercentual = 0, iptu = 0,
  seguro = 0, seguroProporcional = false, taxaBoleto = 0, outros = 0, reservaDisponivel = 0, contrato = null }) {
  const diasReais = diasOcupados(competencia, entrada, saida);
  // regra `proporcional`: mês comercial de 30 dias (padrão desde 17/11/2026, `diasComerciais`) ou dias reais do mês (14/28)
  const comercial = regra('proporcional', contrato) === 'mes_30' && diasReais < diasNoMes(competencia);
  const dias = comercial ? diasComerciais(competencia, entrada, saida, { continuacao: !!(contrato && contrato.contrato_anterior_id) }) : diasReais;
  const diasMes = comercial ? 30 : diasNoMes(competencia);
  const aluguel = aluguelProporcional(aluguelMensal, dias, diasMes);
  const desconto = descontoPorPercentual(aluguel, descontoPercentual);
  // seguro no mês da entrada e no da saída: pelos mesmos dias do aluguel (decisão do dono de 24/11/2026; 15/30 de R$ 30,00 = R$ 15,00)
  const seguroDoMes = seguroProporcional ? aluguelProporcional(seguro, dias, diasMes) : seguro;
  const itens = { aluguel, desconto, iptu, seguro: seguroDoMes, taxa_boleto: taxaBoleto, outros };
  return {
    competencia, dias_cobrados: dias, dias_mes: diasMes, aluguel_mensal: aluguelMensal, ...itens,
    ...totaisCobranca(itens, reservaDisponivel, contrato),
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
    // o ressarcimento só sai da NF quando a empresa decidiu assim (opção em Empresas); o ajuste do mês só entra quando
    // marcado no boleto (decisão do dono, 21/11/2026, mensal-009: ex.: TV vendida junto entra, vidro quebrado não)
    valor_nf: valorNotaFiscal(cobranca.aluguel, cobranca.desconto, multa, juros, pontual) - (cobranca.ressarcimento_na_nf ? cobranca.ressarcimento || 0 : 0)
      + ajusteNaNf(cobranca),
  };
}

/**
 * Parte do ``outros`` do boleto que entra na NF quando "O ajuste entra na NF" está marcado: só os ajustes do mês. A multa de
 * notificação (``multas_notificacao``, decisão de 17/11/2026) e a diferença de pagamento antigo presa ao boleto
 * (``diferencas_cobradas``) somam em ``outros``, mas ficam sempre fora da NF. Ex.: ajuste + R$ 100,00 (TV vendida junto) e multa
 * de R$ 1.500,00 → outros R$ 1.600,00, na NF só R$ 100,00.
 */
export function ajusteNaNf(cobranca) {
  if (!cobranca.outros_na_nf) return 0;
  const fixos = [...(cobranca.multas_notificacao || []), ...(cobranca.diferencas_cobradas || []), ...(cobranca.encargos_cobranca || [])].reduce((s, e) => s + (e.valor || 0), 0);
  return (cobranca.outros || 0) - fixos;
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
// Ordem das listas (para .sort): pelo campo "data" ('AAAA-MM-DD'); no mesmo dia, pela ordem em que foram lançados (id)
// --------------------------------------------------------------------------
/** A mais recente primeiro; no mesmo dia, a lançada por último. */
export const maisRecentePrimeiro = (a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id;

/** A mais antiga primeiro; no mesmo dia, a lançada primeiro. */
export const maisAntigoPrimeiro = (a, b) => String(a.data).localeCompare(String(b.data)) || a.id - b.id;

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

/** 'AAAA-MM-DD' válido (dia que existe no mês: 31/02 não), senão o padrão. */
export function dataValida(texto, padrao = '') {
  const t = String(texto || '');
  return DATA_RE.test(t) && Number(t.slice(8, 10)) <= diasNoMes(t.slice(0, 7)) ? t : padrao;
}

/** Formato aceito de cada parâmetro conhecido do endereço; os demais passam como estão (as telas escapam o texto). */
const FORMATOS_PARAMETRO = {
  comp: COMPETENCIA_RE, mes: COMPETENCIA_RE,
  data: DATA_RE,
  de: /^(\d{4}-\d{2}-\d{2}|[a-z]+)$/, ate: DATA_RE, // "de" também é a tela de origem (de=iptu, de=inquilinos)
  imovel: /^\d+$/, contrato: /^\d+$/, pessoa: /^\d+$/, modelo: /^-?\d+$/, numero: /^\d+$/, ano: /^\d{4}$/,
  cobranca: /^\d+$/, acordo: /^\d+$/, // registro da cobrança (passo, despesa e prova): o boleto ou o acordo de onde veio
  ficha: /^\d+$/, fiador: /^\d$/, custo: /^\d+$/, airbnb: /^\d+$/, id: /^\d+$/, troca: /^\d+$/,
  ids: /^\d+(,\d+)*$/, numeros: /^\d+(,\d+)*$/,
  ordem: /^[a-z_]+$/, filtro: /^[a-z_]+$/, tipo: /^[\wÀ-ÿ -]+$/, todos: /^[01]$/, nf: /^[01]$/,
  ir: /^[\w-]+$/, voltar: /^#\/[\w/?&=.,-]*$/,
  q: /^[^\r\n<>]{1,100}$/, // texto da busca global (a tela ainda passa por esc())
  situacao: /^(Reprovada|Desistiu)$/, // "Reprovar (com o motivo)" na ficha: abre o Editar já com a situação
  pagina: /^\d{1,5}$/, // página de uma lista longa (Histórico)
  quem: /^[^\s<>"']{3,200}$/, antes: /^\d{1,12}$/, // tela Acessos: e-mail da pessoa e "ver os mais antigos"
  tema: /^[a-z_]{1,30}$/, prazo: /^\d{1,2}$/, anterior: /^\d+$/, // nova notificação ao inquilino: modelo do texto, prazo em dias úteis e a que ela reitera
  ver: /^[a-z]{1,20}$/, chave: /^[cfsr]\d{1,10}$/, // Comunicações: a parte da tela (novo, modelos) e a pessoa do aceite (c|s|r<contrato>: inquilino, solidário, representante; f<fiador>)
  perfil: /^(\d+|novo)$/, regras: /^\d+$/, // Regras do sistema: a regra especial aberta; Novo contrato: preencher com uma regra especial
  exemplo: /^1$/, // Modelos de documentos: o PDF de exemplo do modelo (pessoa fictícia)
  gmail: /^[a-z-]{1,20}$/, // Sistema → Comunicação E-mail: aviso da volta do Google ao conectar o Gmail (AVISOS_VOLTA_GMAIL de nuvem/worker.mjs)
};

/** Parâmetros conhecidos que vieram fora do formato (sanearParametros os tira). Ex.: { comp: '2026-13', contrato: '7' } → ['comp']. */
export function parametrosDescartados(q) {
  return Object.entries(q || {}).filter(([k, v]) => FORMATOS_PARAMETRO[k] && !FORMATOS_PARAMETRO[k].test(String(v))).map(([k]) => k);
}

/** Devolve só os parâmetros no formato esperado (os conhecidos fora do formato somem; a tela usa o padrão). */
export function sanearParametros(q) {
  const limpo = {};
  for (const [k, v] of Object.entries(q || {})) {
    const re = FORMATOS_PARAMETRO[k];
    if (!re || re.test(String(v))) limpo[k] = String(v);
  }
  return limpo;
}
