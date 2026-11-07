// Código comum ao site (docs/js/c6-comum.js) e à ponte do C6 (ponte-c6/c6-comum.mjs): datas 'AAAA-MM-DD' sem fuso, divisão de
// um período em janelas de consulta, dinheiro no formato do C6 e linha digitável → código de barras. Só funções puras, sem imports.
// ATENÇÃO: os dois arquivos precisam ser IGUAIS (a ponte é copiada sozinha para o computador do usuário); tests/banco.test.mjs confere,
// como faz com mapa-c6. Mexeu num, copie para o outro.

/** '2026-01-30' + 2 → '2026-02-01' (dias pode ser negativo). */
export function somarDias(data, dias) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Divide [de, ate] em janelas seguidas de no máximo `dias` dias corridos cada (contando o 1º e o último dia); período vazio
 * ou invertido → []. Ex.: janelas('2026-10-01', '2026-10-31', 30) → [01/10–30/10, 31/10–31/10].
 */
export function janelas(de, ate, dias) {
  const lista = [];
  if (!de || !ate || de > ate || !(dias >= 1)) return lista;
  for (let inicio = de; inicio <= ate; inicio = somarDias(inicio, dias)) {
    const fim = somarDias(inicio, dias - 1);
    lista.push({ de: inicio, ate: fim < ate ? fim : ate });
  }
  return lista;
}

/** "1500.00" (texto do C6, ponto decimal) → 150000 centavos inteiros; aceita número e vírgula. Lança se estiver em branco ou não for valor. */
export function centavosDoTexto(valor) {
  if (valor === null || valor === undefined || valor === '') throw new Error('Valor do banco em branco.');
  const n = typeof valor === 'number' ? valor : Number(String(valor).trim().replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`Valor do banco inválido: "${valor}".`);
  return Math.round(n * 100 + (n < 0 ? -1e-7 : 1e-7));
}

/** Só os dígitos de uma linha digitável colada com pontos e espaços. */
export const soDigitos = (texto) => String(texto ?? '').replace(/\D/g, '');

/**
 * Linha digitável (47 dígitos, boleto bancário; 48, arrecadação/concessionária) → código de barras de 44 dígitos (44 volta como está).
 * 47: AAABC.CCCCX DDDDD.DDDDDY EEEEE.EEEEEZ K UUUUVVVVVVVVVV → AAAB K UUUUVVVVVVVVVV CCCCC DDDDDDDDDD EEEEEEEEEE
 * 48: 4 blocos de 11 dígitos + 1 dígito verificador cada → os 4 blocos de 11 seguidos.
 */
export function codigoDeBarrasDaLinha(linha) {
  const d = soDigitos(linha);
  if (d.length === 44) return d;
  if (d.length === 47) return d.slice(0, 4) + d.slice(32, 33) + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
  if (d.length === 48) return d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
  throw new Error(`Código de barras ou linha digitável inválido: esperava 44, 47 ou 48 dígitos e recebi ${d.length}.`);
}
