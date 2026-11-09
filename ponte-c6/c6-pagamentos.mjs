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

import { erroDoC6 } from './c6-extrato.mjs';
// O que vale num item (tipoDoContent, normalizarContent, validarItem), só os dígitos e linha digitável → código de barras:
// c6-comum.mjs (cópia idêntica de docs/js/c6-comum.js; o simulador do site em ?teste confere os itens com as mesmas funções).
import { soDigitos, codigoDeBarrasDaLinha, tipoDoContent, normalizarContent, validarItem } from './c6-comum.mjs';

export { soDigitos, codigoDeBarrasDaLinha, tipoDoContent, normalizarContent, validarItem };

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
