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
import { comNovasTentativas } from './c6-tentativas.mjs';

export const DIAS_JANELA_EXTRATO = 30;
export const MAX_DIAS_EXTRATO = 366; // proteção: ninguém pede mais de um ano de uma vez

const contaDe = (c6) => c6?.conta ?? c6?.conta_id ?? null;

/**
 * O que a recusa do banco quer dizer, em português simples (o texto original, em inglês, fica só em ``corpo``/``detalhes``).
 * Recusa de dados (400/422) leva o detalhe do banco, que diz qual campo corrigir.
 */
export function explicarRecusa(status, corpo) {
  const detalhe = corpo && typeof corpo === 'object' ? [corpo.title, corpo.detail].filter(Boolean).join(': ') : String(corpo ?? '').slice(0, 200);
  if (status === 401) return 'o banco não aceitou a autenticação (mesmo com um token novo): confira o client_id e o client_secret da conta na ponte.';
  if (status === 403) return 'o banco negou a permissão: a chave da API desta conta não tem acesso a este serviço. Peça ao C6 para liberar (o "Testar conexão" mostra o que falta).';
  if (status === 404) return 'o banco não encontrou o que foi pedido.';
  if (status === 409) return 'o banco diz que isso já existe ou mudou de situação: atualize e confira antes de tentar de novo.';
  if (status === 400 || status === 422) return `o banco recusou os dados${detalhe ? ` (detalhe do banco: ${detalhe.slice(0, 200)})` : ''}.`;
  if (status === 429) return 'o banco está recebendo pedidos demais: espere um minuto e tente de novo.';
  if (status >= 500) return 'o banco está com problema agora: tente daqui a pouco.';
  return 'resposta inesperada do banco.';
}

/** Erro HTTP do C6 → Error em português com o status e o que o banco quis dizer (o corpo original fica em ``corpo``). */
export function erroDoC6(resposta, oQue) {
  const e = new Error(`O banco respondeu ${resposta.status} ao ${oQue}: ${explicarRecusa(resposta.status, resposta.corpo)}`.slice(0, 500));
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
    // consulta: se o banco estiver ocupado (429, 502, 503, 504) ou não responder a tempo, tenta de novo (c6-tentativas.mjs)
    const r = await comNovasTentativas('GET', () => c6.chamar('GET', '/v1/statement/', { query: { start_date: j.de, end_date: j.ate } }), { pausas: c6.pausas });
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
