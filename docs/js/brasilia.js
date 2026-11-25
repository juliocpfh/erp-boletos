// Datas no horário de Brasília e prazos dados fora do expediente (sem imports: a nuvem usa o mesmo arquivo).
// `toISOString().slice(0, 10)` é a data de Londres: depois das 21h de Brasília já dá o dia seguinte (24/11 às 21h47 → 25/11).

export const FUSO = 'America/Sao_Paulo';
const MS_DIA = 86400000;
const formatoData = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const formatoHora = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' });

/**
 * Data de Brasília ('AAAA-MM-DD') de um instante (Date, número ou texto ISO com hora). Texto só com a data volta como está.
 * Ex.: '2026-11-25T00:47:00.000Z' (24/11 às 21h47 em Brasília) → '2026-11-24'. Vazio ou inválido → ''.
 */
export function dataDeBrasilia(instante) {
  if (instante === null || instante === undefined || instante === '') return '';
  if (typeof instante === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(instante)) return instante;
  const d = instante instanceof Date ? instante : new Date(instante);
  return Number.isNaN(d.getTime()) ? '' : formatoData.format(d);
}

/** Hora cheia de Brasília (0 a 23). Ex.: 24/11 às 21h45 → 21. */
export const horaDeBrasilia = (agora = new Date()) => Number(formatoHora.format(agora)) % 24;

const somar = (data, dias) => {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d) + dias * MS_DIA).toISOString().slice(0, 10); // conta só de datas: sem fuso
};

/** Fim do expediente aceito: hora inteira de 1 a 24 (24 = o dia inteiro conta); fora disso, 18. */
export const horaDoExpediente = (h) => (Number.isInteger(Number(h)) && Number(h) >= 1 && Number(h) <= 24 ? Number(h) : 18);

/**
 * Dia em que começa a contar um prazo dado agora (decisão do dono de 24/11/2026): no expediente, hoje; a partir da hora do fim
 * do expediente, amanhã. Ex.: com 18h, 24/11 às 10h → '2026-11-24'; 24/11 às 21h45 → '2026-11-25'.
 */
export function inicioDoPrazo(agora = new Date(), fimExpediente = 18) {
  const hoje = dataDeBrasilia(agora);
  return horaDeBrasilia(agora) >= horaDoExpediente(fimExpediente) ? somar(hoje, 1) : hoje;
}

/** Último dia de um prazo de `dias` corridos dado agora. Ex.: 7 dias, 24/11 às 10h → '2026-12-01'; às 21h45 → '2026-12-02'. */
export const ultimoDiaDoPrazo = (dias, agora = new Date(), fimExpediente = 18) => somar(inicioDoPrazo(agora, fimExpediente), dias);

/** Instante (ISO) do fim do dia em Brasília: o link vale o último dia inteiro. Ex.: '2026-12-02' → '2026-12-03T02:59:59.999Z'. */
export const fimDoDiaEmBrasilia = (data) => new Date(Date.parse(`${data}T23:59:59.999-03:00`)).toISOString();

/** Validade (ISO) de um link de `dias` corridos criado agora: o fim do último dia do prazo. */
export const validadeDoLink = (dias, agora = new Date(), fimExpediente = 18) => fimDoDiaEmBrasilia(ultimoDiaDoPrazo(dias, agora, fimExpediente));
