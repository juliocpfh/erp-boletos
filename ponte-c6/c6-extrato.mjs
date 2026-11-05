// Extrato e saldo de uma conta no C6 (API "Saldo & Extrato" 2.0.1, documentacao/c6-openapi/saldo-extrato.yaml).
//
// `c6` é um objeto já autenticado para UMA conta, com `chamar(metodo, caminho, { query, corpo, aceitar })`
// que devolve `{ status, corpo }` (corpo já em objeto quando é JSON; Buffer quando é PDF) e, se quiser,
// `conta` (id da conta: 'ank', 'jck'…) — usado para carimbar `conta_id` em cada lançamento.
//
// extrato(c6, { de, ate }) → { conta_id, de, ate, lancamentos: [ ...entry do C6 inalterada, conta_id ] }
//   - divide o período em janelas de até 30 dias (limite do C6), chama GET /v1/statement/?start_date&end_date
//   - junta `entries[]`, tira repetidos por `reference` (chave oficial de de-duplicação), ordena por entry_date e created_at
// saldo(c6) → { conta_id, ...BalanceResponse } (GET /v1/statement/balance)

import { janelas, validarData, diasEntre } from './c6-datas.mjs';

export const DIAS_JANELA_EXTRATO = 30;
export const MAX_DIAS_EXTRATO = 366; // proteção: ninguém pede mais de um ano de uma vez

const contaDe = (c6) => c6?.conta ?? c6?.conta_id ?? null;

/** Erro HTTP do C6 → Error em português com o status e o que o banco respondeu. */
export function erroDoC6(resposta, oQue) {
  const detalhe = typeof resposta.corpo === 'string' ? resposta.corpo : JSON.stringify(resposta.corpo ?? '');
  const e = new Error(`O banco respondeu ${resposta.status} ao ${oQue}. ${detalhe}`.trim().slice(0, 500));
  e.status = resposta.status;
  e.corpo = resposta.corpo;
  return e;
}

/** Ordena por data contábil e, dentro do dia, pela hora de criação (texto ISO ordena certo). */
export const ordenarLancamentos = (lista) => [...lista].sort((a, b) =>
  String(a.entry_date).localeCompare(String(b.entry_date)) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.reference).localeCompare(String(b.reference)));

/** Remove lançamentos repetidos (mesmo `reference`), mantendo o primeiro. Sem `reference` não se descarta nada. */
export function semRepetidos(lista) {
  const vistos = new Set();
  return lista.filter((e) => {
    if (e.reference == null || e.reference === '') return true;
    if (vistos.has(e.reference)) return false;
    vistos.add(e.reference);
    return true;
  });
}

export async function extrato(c6, { de, ate }) {
  validarData(de, 'data inicial');
  validarData(ate, 'data final');
  if (de > ate) throw new Error(`A data inicial (${de}) não pode ser depois da data final (${ate}).`);
  if (diasEntre(de, ate) > MAX_DIAS_EXTRATO) throw new Error(`Peça o extrato de até ${MAX_DIAS_EXTRATO} dias por vez.`);
  const conta_id = contaDe(c6);
  const todos = [];
  for (const j of janelas(de, ate, DIAS_JANELA_EXTRATO)) {
    const r = await c6.chamar('GET', '/v1/statement/', { query: { start_date: j.de, end_date: j.ate } });
    if (r.status !== 200) throw erroDoC6(r, `buscar o extrato de ${j.de} a ${j.ate}`);
    const entries = Array.isArray(r.corpo?.entries) ? r.corpo.entries : [];
    for (const e of entries) todos.push({ ...e, conta_id });
  }
  return { conta_id, de, ate, lancamentos: ordenarLancamentos(semRepetidos(todos)) };
}

export async function saldo(c6) {
  const r = await c6.chamar('GET', '/v1/statement/balance', {});
  if (r.status !== 200) throw erroDoC6(r, 'consultar o saldo');
  return { conta_id: contaDe(c6), ...(r.corpo ?? {}) };
}
