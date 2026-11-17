// Poupança da garantia em dinheiro (caução ou depósito): rendimento pelo aniversário de cada depósito (puro) e as taxas
// diárias do Banco Central (série 195 do SGS: depósitos a partir de 04/05/2012, rentabilidade no período).
// Lei 8.245/91, art. 38, § 2º: a caução fica em caderneta de poupança e os rendimentos são do locatário.
import * as C from './calculos.js';

/** Série diária da poupança no Banco Central: cada dia traz o % do período que começa nele e termina no mesmo dia do mês seguinte. */
export const SERIE_POUPANCA = 195;

/** Dia em que o depósito começa a render: os feitos nos dias 29, 30 e 31 aniversariam no dia 1º do mês seguinte. */
export function inicioPoupanca(data) {
  return Number(data.slice(8, 10)) > 28 ? `${C.somarMeses(data.slice(0, 7), 1)}-01` : data;
}

/**
 * Inícios dos meses completos de poupança de um depósito até ``ate`` (o mês incompleto não rende, como no banco).
 * Ex.: depósito em 10/01/2025, até 01/12/2026 → 22 períodos, de 10/01/2025 a 10/10/2026 (o de 10/11 a 10/12 não fechou).
 */
export function periodosPoupanca(data, ate) {
  const ini = inicioPoupanca(data);
  const out = [];
  for (let k = 0; C.somarMesesData(ini, k + 1) <= ate; k += 1) out.push(C.somarMesesData(ini, k));
  return out;
}

/**
 * Garantia corrigida pela poupança: cada depósito ({ data, valor } em centavos) rende nos seus aniversários até ``ate``,
 * pelas taxas do dia ({ 'AAAA-MM-DD': % }). Depósito depois de ``ate`` fica de fora; sem data, entra sem rendimento.
 * Ex.: R$ 3.600,00 em 10/01/2025 e R$ 200,00 em 15/01/2026, até 01/12/2026, a 0,60% ao mês →
 * 3.600 × 1,006^22 = R$ 4.106,37 e 200 × 1,006^10 = R$ 212,33: R$ 3.800,00 viram R$ 4.318,70 (13,65%).
 * Devolve { depositos: [{ data, valor, meses, corrigido }], total, corrigido, rendimento, percentual, falta: [dias sem taxa] }.
 */
export function corrigirPelaPoupanca(movimentos, ate, taxas = {}) {
  const falta = new Set();
  const depositos = (movimentos || []).filter((m) => m.valor && (!m.data || m.data <= ate)).map((m) => {
    const periodos = m.data ? periodosPoupanca(m.data, ate) : [];
    let fator = 1;
    for (const p of periodos) {
      if (Number.isFinite(taxas[p])) fator *= 1 + taxas[p] / 100;
      else falta.add(p);
    }
    return { data: m.data || null, valor: m.valor, meses: periodos.length, corrigido: C.arred(m.valor * fator) };
  });
  const total = depositos.reduce((s, x) => s + x.valor, 0);
  const corrigido = depositos.reduce((s, x) => s + x.corrigido, 0);
  return { depositos, total, corrigido, rendimento: corrigido - total, percentual: percentualDaCorrecao(total, corrigido), falta: [...falta].sort() };
}

/**
 * % (4 casas, como o campo do formulário) que leva ``total`` a ``corrigido``: entre os vizinhos, o que chega mais perto
 * em centavos. Ex.: R$ 3.800,00 → R$ 4.318,70 = 13,65%.
 */
export function percentualDaCorrecao(total, corrigido) {
  if (!(total > 0)) return 0;
  const base = Math.round((corrigido / total - 1) * 1e6) / 1e4;
  const erro = (p) => Math.abs(C.arred(total * (1 + p / 100)) - corrigido);
  return [base, base - 0.0001, base + 0.0001].map((p) => Math.round(p * 1e4) / 1e4).sort((a, b) => erro(a) - erro(b))[0];
}

/** Taxas já trazidas nesta sessão ({ 'AAAA-MM-DD': % }): a tela é desenhada de novo a cada ação. */
const trazidas = {};
/** Períodos já consultados nesta sessão ([de, ate]): pedido dentro de um deles não vai de novo ao Banco Central. */
const consultados = [];

/**
 * Taxas diárias da poupança de ``de`` a ``ate`` ('AAAA-MM-DD') no Banco Central: { 'AAAA-MM-DD': % } (com as já trazidas nesta
 * sessão). O Banco Central aceita até 10 anos por consulta nas séries diárias: vai em partes de 5 anos. Tenta 3 vezes (ele às
 * vezes recusa). Consulta só o período pedido (as taxas guardadas no banco já tiraram o que não falta: taxasDosDias).
 */
export async function taxasPoupanca(de, ate, buscar = fetch) {
  if (consultados.some(([a, b]) => a <= de && b >= ate)) return trazidas;
  const br = (x) => `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}`;
  for (let ini = de; ini <= ate; ini = C.somarDias(C.somarAnos(ini, 5), 1)) {
    const fim = [C.somarAnos(ini, 5), ate].sort()[0];
    let lista = null;
    for (let n = 1; n <= 3 && !lista; n += 1) {
      try {
        const resp = await buscar(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SERIE_POUPANCA}/dados?formato=json&dataInicial=${br(ini)}&dataFinal=${br(fim)}`);
        if (resp.ok) lista = await resp.json();
      } catch { /* sem internet ou Banco Central ocupado */ }
      if (!lista && n < 3) await new Promise((ok) => { setTimeout(ok, 1500 * n); });
    }
    if (!Array.isArray(lista)) throw new Error('Não deu para consultar a poupança no Banco Central agora (sem internet ou o site deles está ocupado).');
    for (const x of lista) {
      const taxa = Number(x.valor);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(x.data || '') && Number.isFinite(taxa)) trazidas[`${x.data.slice(6, 10)}-${x.data.slice(3, 5)}-${x.data.slice(0, 2)}`] = taxa;
    }
  }
  consultados.push([de, ate]);
  return trazidas;
}

/** Dias de taxa que a conta usa: o início de cada mês completo de cada depósito com data até ``ate`` (periodosPoupanca), em ordem. */
export function diasDaPoupanca(movimentos, ate) {
  const dias = new Set();
  for (const m of movimentos || []) if (m.valor && m.data && m.data <= ate) for (const p of periodosPoupanca(m.data, ate)) dias.add(p);
  return [...dias].sort();
}

/**
 * Taxas já guardadas no banco (tabela ``taxas_poupanca``, um registro por mês com { 'AAAA-MM-DD': % }; pedido do dono de
 * 17/11): o mesmo cálculo dá sempre o mesmo resultado e não depende da internet. Devolve { 'AAAA-MM-DD': % }.
 */
export function taxasGuardadas(d) {
  const out = {};
  for (const r of (d && d.taxas_poupanca) || []) {
    for (const [dia, t] of Object.entries((r && r.taxas) || {})) if (Number.isFinite(t) && !(dia in out)) out[dia] = t;
  }
  return out;
}

/**
 * Taxas para os ``dias``: as guardadas valem; só as que faltam vão ao Banco Central, numa consulta do primeiro ao último dia
 * que falta. ``guardar(novas)`` recebe as trazidas que ainda não estavam guardadas (todas as do período consultado, para a
 * próxima conta não precisar da internet); se falhar, ficam só nesta sessão. Devolve { 'AAAA-MM-DD': % }.
 * Ex.: guardadas de 01/2025 a 09/2026 e depósito de 10/01/2025 até 01/12/2026 → só consulta de 10/10/2026 a 10/10/2026.
 */
export async function taxasDosDias(dias, { guardadas = {}, buscar = fetch, guardar = null } = {}) {
  const faltam = dias.filter((p) => !Number.isFinite(guardadas[p]));
  if (!faltam.length) return guardadas;
  const trazidas = await taxasPoupanca(faltam[0], faltam[faltam.length - 1], buscar);
  const novas = {};
  for (const [dia, t] of Object.entries(trazidas)) if (!Number.isFinite(guardadas[dia])) novas[dia] = t;
  if (guardar && Object.keys(novas).length) {
    try { await guardar(novas); } catch { /* sem permissão para gravar (consulta) ou sem internet: fica só nesta sessão */ }
  }
  return { ...novas, ...guardadas };
}

/**
 * Garantia corrigida pela poupança do Banco Central até ``ate``: usa as taxas guardadas (``guardadas``, taxasGuardadas) e
 * busca só as que faltam (taxasDosDias, que entrega as novas a ``guardar``). Sem depósito com data até ``ate``, não consulta.
 */
export async function poupancaDaGarantia(movimentos, ate, buscar = fetch, { guardadas = {}, guardar = null } = {}) {
  const taxas = await taxasDosDias(diasDaPoupanca(movimentos, ate), { guardadas, buscar, guardar });
  return corrigirPelaPoupanca(movimentos, ate, taxas);
}

/**
 * Página Empresas: a garantia de cada inquilino corrigida pela poupança até ``ate`` e o corrigido de cada aplicação,
 * na proporção do valor aplicado. ``garantias`` = R.garantiasPorEmpresa (só os depósitos com data até ``ate``; mês
 * incompleto não rende). Ex.: caução de R$ 3.800,00 que vale R$ 4.318,70 hoje; R$ 2.000,00 aplicados na ANK →
 * R$ 2.273,00 corrigidos na ANK. Devolve { contratos: Map(id → { total, corrigido }), lugares: [{ chave, corrigido,
 * itens: [corrigido] }], semAplicar: [corrigido da falta], aplicado, falta: [dias sem taxa] }.
 */
export function corrigirGarantiasPorEmpresa(garantias, ate, taxas = {}) {
  const contratos = new Map();
  const falta = new Set();
  const doContrato = (x) => {
    if (!contratos.has(x.contrato.id)) {
      const r = corrigirPelaPoupanca(x.movimentos, ate, taxas);
      r.falta.forEach((p) => falta.add(p));
      contratos.set(x.contrato.id, { total: r.total, corrigido: r.corrigido });
    }
    return contratos.get(x.contrato.id);
  };
  const proporcional = (valor, r) => (r.total > 0 ? C.arred((valor * r.corrigido) / r.total) : valor);
  let aplicado = 0;
  const lugares = garantias.lugares.map((l) => {
    const itens = l.itens.map((x) => proporcional(x.valor, doContrato(x)));
    const corrigido = itens.reduce((s, v) => s + v, 0);
    aplicado += corrigido;
    return { chave: l.chave, corrigido, itens };
  });
  const semAplicar = garantias.semAplicar.map((x) => proporcional(x.falta, doContrato(x)));
  return { contratos, lugares, semAplicar, aplicado, faltaAplicar: semAplicar.reduce((s, v) => s + v, 0), falta: [...falta].sort() };
}

/** Taxas guardadas e, só as que faltam, do Banco Central (taxasDosDias); depois corrige (corrigirGarantiasPorEmpresa). */
export async function garantiasCorrigidasHoje(garantias, ate, buscar = fetch, { guardadas = {}, guardar = null } = {}) {
  const movimentos = [...garantias.lugares.flatMap((l) => l.itens), ...garantias.semAplicar].flatMap((x) => x.movimentos);
  const taxas = await taxasDosDias(diasDaPoupanca(movimentos, ate), { guardadas, buscar, guardar });
  return corrigirGarantiasPorEmpresa(garantias, ate, taxas);
}
