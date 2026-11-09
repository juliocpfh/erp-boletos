// Datas 'AAAA-MM-DD' sem fuso: soma de dias, validação e divisão de um período em janelas
// (o C6 limita o extrato a 30 dias e a lista de boletos a 60 dias por consulta).
// somarDias, validarData, janelas e centavosDoTexto vêm de c6-comum.mjs (cópia idêntica de docs/js/c6-comum.js, usado pelo site; C19).
import { somarDias, validarData, janelas as janelasComum, centavosDoTexto } from './c6-comum.mjs';

export { somarDias, validarData, centavosDoTexto };

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

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
  return janelasComum(de, ate, dias);
}

/** 150000 → "1.500,00" (para textos em português). */
export function reaisBr(centavos) {
  const n = Math.abs(Math.round(centavos));
  const inteiro = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${centavos < 0 ? '-' : ''}${inteiro},${String(n % 100).padStart(2, '0')}`;
}

/** '2026-11-05' → '05/11/2026'. */
export const dataBr = (iso) => (RE_DATA.test(String(iso)) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : String(iso ?? ''));
