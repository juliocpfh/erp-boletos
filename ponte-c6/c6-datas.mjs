// Datas 'AAAA-MM-DD' sem fuso: soma de dias, validação e divisão de um período em janelas
// (o C6 limita o extrato a 30 dias e a lista de boletos a 60 dias por consulta).

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Confere 'AAAA-MM-DD' (e que a data existe). Lança Error em português. */
export function validarData(texto, nome = 'data') {
  if (typeof texto !== 'string' || !RE_DATA.test(texto)) throw new Error(`A ${nome} precisa estar no formato AAAA-MM-DD (recebi "${texto}").`);
  const d = new Date(`${texto}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== texto) throw new Error(`A ${nome} "${texto}" não existe no calendário.`);
  return texto;
}

/** '2026-01-30' + 2 → '2026-02-01' (dias pode ser negativo). */
export function somarDias(data, dias) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Dias corridos entre duas datas (ate - de); 0 quando iguais. */
export const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

/** Hoje no fuso do computador, 'AAAA-MM-DD'. */
export function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Divide [de, ate] em janelas seguidas de no máximo `dias` dias corridos cada (contando o 1º e o último dia).
 * janelas('2026-01-01', '2026-03-15', 30) → [{de:'2026-01-01', ate:'2026-01-30'}, {de:'2026-01-31', ate:'2026-03-01'}, {de:'2026-03-02', ate:'2026-03-15'}]
 */
export function janelas(de, ate, dias) {
  validarData(de, 'data inicial');
  validarData(ate, 'data final');
  if (de > ate) throw new Error(`A data inicial (${de}) não pode ser depois da data final (${ate}).`);
  if (!(dias >= 1)) throw new Error('O tamanho da janela precisa ser de pelo menos 1 dia.');
  const lista = [];
  for (let inicio = de; inicio <= ate; inicio = somarDias(inicio, dias)) {
    const fim = somarDias(inicio, dias - 1);
    lista.push({ de: inicio, ate: fim < ate ? fim : ate });
  }
  return lista;
}

/** "1500.00" (texto do C6) → 150000 centavos inteiros. Aceita número também. */
export function centavosDoTexto(valor) {
  const n = typeof valor === 'number' ? valor : Number(String(valor ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`Valor inválido: "${valor}".`);
  return Math.round(n * 100);
}

/** 150000 → "1.500,00" (para textos em português). */
export function reaisBr(centavos) {
  const n = Math.abs(Math.round(centavos));
  const inteiro = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${centavos < 0 ? '-' : ''}${inteiro},${String(n % 100).padStart(2, '0')}`;
}

/** '2026-11-05' → '05/11/2026'. */
export const dataBr = (iso) => (RE_DATA.test(String(iso)) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : String(iso ?? ''));
