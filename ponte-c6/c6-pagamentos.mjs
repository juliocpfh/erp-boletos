// Agendamento de pagamentos no C6 (API 1.1.0, documentacao/c6-openapi/agendamento-de-pagamentos.yaml).
// A API NÃO paga: valida os itens e manda um lote para alguém aprovar no Web Banking / aplicativo do C6.
//
// `c6` = objeto autenticado de uma conta, com `chamar(metodo, caminho, { query, corpo }) → { status, corpo }`.
//
// decodificar(c6, itens)                 → { group_id }          POST /v1/schedule_payments/decode  { items: [{ content, amount, description, transaction_date }] }
// itensDoGrupo(c6, groupId)              → { group_id, items }   GET  /v1/schedule_payments/{group_id}/items
// removerItens(c6, groupId, ids)         → { group_id, removidos } DELETE /v1/schedule_payments/{group_id}/items  corpo [{ id }]
// removerItem(c6, groupId, itemId)       → { group_id, removidos: 1 } DELETE /v1/schedule_payments/{group_id}/items/{item_id}
// enviarParaAprovacao(c6, groupId, nome) → { group_id, enviado: true } POST /v1/schedule_payments/submit { group_id, uploader_name }
// dda(c6)                                → { items }             GET  /v1/schedule_payments/query
//
// Antes de chamar o banco, cada item passa por validarItem():
//   content     = código de barras (44 dígitos) OU BR Code / Pix copia e cola (começa com "000201") OU chave Pix
//                 (CPF 11 dígitos, CNPJ 14, telefone +55…, e-mail, chave aleatória EVP). Linha digitável de boleto
//                 (47 dígitos) ou de arrecadação (48) é convertida para o código de barras de 44.
//   amount      = número > 0 com até 2 casas decimais (em reais, como o C6 pede)
//   description = até 100 caracteres (aparece na tela de aprovação)
//   transaction_date = 'AAAA-MM-DD' (opcional; sem ela o banco paga hoje)

import { validarData } from './c6-datas.mjs';
import { erroDoC6 } from './c6-extrato.mjs';

const RE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}$/;
const RE_TELEFONE = /^\+[1-9][0-9]\d{5,14}$/;
const RE_EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Só os dígitos de uma linha digitável colada com pontos e espaços. */
export const soDigitos = (texto) => String(texto ?? '').replace(/\D/g, '');

/**
 * Linha digitável (47 dígitos, boleto bancário; 48, arrecadação/concessionária) → código de barras de 44 dígitos.
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

/** Que tipo de "content" é: 'codigo_barras' | 'br_code' | 'chave_pix' | null. Linhas digitáveis contam como código de barras. */
export function tipoDoContent(content) {
  const t = String(content ?? '').trim();
  if (!t) return null;
  if (t.startsWith('000201')) return t.length >= 32 && t.length <= 396 ? 'br_code' : null;
  const d = soDigitos(t);
  if (/^[\d.\s]+$/.test(t) && [44, 47, 48].includes(d.length)) return 'codigo_barras';
  if (/^\d{11}$/.test(t) || /^\d{14}$/.test(t) || RE_TELEFONE.test(t) || RE_EMAIL.test(t) || RE_EVP.test(t.toLowerCase())) return 'chave_pix';
  return null;
}

/** Normaliza o `content`: código de barras sempre com 44 dígitos; BR Code e chave Pix como vieram (sem espaços nas pontas). */
export function normalizarContent(content) {
  const tipo = tipoDoContent(content);
  const t = String(content ?? '').trim();
  if (tipo === 'codigo_barras') return codigoDeBarrasDaLinha(t);
  if (tipo === 'br_code' || tipo === 'chave_pix') return tipo === 'chave_pix' && RE_EVP.test(t.toLowerCase()) ? t.toLowerCase() : t;
  throw new Error(`Não reconheci o que pagar: "${t.slice(0, 40)}". Use o código de barras (44 dígitos) ou a linha digitável do boleto, o Pix copia e cola ou uma chave Pix (CPF/CNPJ, telefone +55…, e-mail ou chave aleatória).`);
}

/** Valida e devolve o item no formato do C6: { content, amount, description?, transaction_date? }. Lança Error em português. */
export function validarItem(item, posicao = 1) {
  if (!item || typeof item !== 'object') throw new Error(`Item ${posicao}: pagamento vazio.`);
  const content = normalizarContent(item.content);
  const amount = typeof item.amount === 'string' ? Number(item.amount.replace(',', '.')) : item.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw new Error(`Item ${posicao}: o valor precisa ser um número maior que zero (recebi "${item.amount}").`);
  if (Math.round(amount * 100) !== amount * 100) throw new Error(`Item ${posicao}: o valor precisa ter no máximo 2 casas decimais (recebi ${amount}).`);
  if (amount > 5000000) throw new Error(`Item ${posicao}: valor acima do limite de R$ 5.000.000,00.`);
  const pronto = { content, amount };
  if (item.description != null && item.description !== '') {
    const description = String(item.description).trim();
    if (description.length > 100) throw new Error(`Item ${posicao}: a descrição tem ${description.length} caracteres; o máximo é 100.`);
    pronto.description = description;
  }
  if (item.transaction_date != null && item.transaction_date !== '') pronto.transaction_date = validarData(String(item.transaction_date), `data de pagamento do item ${posicao}`);
  return pronto;
}

const validarGrupo = (groupId) => {
  const g = String(groupId ?? '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(g)) throw new Error(`Identificador do grupo de pagamentos inválido: "${g}".`);
  return g;
};

export async function decodificar(c6, itens) {
  if (!Array.isArray(itens) || !itens.length) throw new Error('Informe pelo menos um pagamento.');
  const items = itens.map((it, i) => validarItem(it, i + 1));
  const r = await c6.chamar('POST', '/v1/schedule_payments/decode', { corpo: { items } });
  if (r.status !== 201 && r.status !== 200) throw erroDoC6(r, 'enviar os pagamentos para leitura');
  if (!r.corpo?.group_id) throw new Error('O banco não devolveu o identificador do grupo de pagamentos.');
  return { group_id: r.corpo.group_id };
}

export async function itensDoGrupo(c6, groupId) {
  const g = validarGrupo(groupId);
  const r = await c6.chamar('GET', `/v1/schedule_payments/${encodeURIComponent(g)}/items`, {});
  if (r.status !== 200) throw erroDoC6(r, 'consultar os itens do grupo de pagamentos');
  return { group_id: g, items: Array.isArray(r.corpo?.items) ? r.corpo.items : [] };
}

export async function removerItens(c6, groupId, ids) {
  const g = validarGrupo(groupId);
  const lista = (Array.isArray(ids) ? ids : [ids]).map((x) => (x && typeof x === 'object' ? x.id : x)).map((x) => String(x ?? '').trim()).filter(Boolean);
  if (!lista.length) throw new Error('Informe os itens a remover.');
  const r = await c6.chamar('DELETE', `/v1/schedule_payments/${encodeURIComponent(g)}/items`, { corpo: lista.map((id) => ({ id })) });
  if (r.status !== 204 && r.status !== 200) throw erroDoC6(r, 'remover itens do grupo de pagamentos');
  return { group_id: g, removidos: lista.length };
}

export async function removerItem(c6, groupId, itemId) {
  const g = validarGrupo(groupId);
  const id = String(itemId ?? '').trim();
  if (!id) throw new Error('Informe o item a remover.');
  const r = await c6.chamar('DELETE', `/v1/schedule_payments/${encodeURIComponent(g)}/items/${encodeURIComponent(id)}`, {});
  if (r.status !== 204 && r.status !== 200) throw erroDoC6(r, 'remover o item do grupo de pagamentos');
  return { group_id: g, removidos: 1 };
}

export async function enviarParaAprovacao(c6, groupId, uploaderName) {
  const g = validarGrupo(groupId);
  const uploader_name = String(uploaderName ?? '').trim();
  if (!uploader_name) throw new Error('Informe o nome de quem está enviando o lote (uploader_name).');
  const r = await c6.chamar('POST', '/v1/schedule_payments/submit', { corpo: { group_id: g, uploader_name } });
  if (r.status !== 204 && r.status !== 200) throw erroDoC6(r, 'enviar o grupo de pagamentos para aprovação');
  return { group_id: g, enviado: true };
}

export async function dda(c6) {
  const r = await c6.chamar('GET', '/v1/schedule_payments/query', {});
  if (r.status !== 200) throw erroDoC6(r, 'consultar o DDA');
  return { items: Array.isArray(r.corpo?.items) ? r.corpo.items : [] };
}
