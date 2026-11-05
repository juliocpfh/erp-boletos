// Banco, fase 2 (cliente do site): extrato, saldo, boletos pagos, DDA, pagamentos agendados e comprovante gerado pela ponte.
// Tudo passa por `chamarPonte(contaId, metodo, caminho, corpo)` de banco.js, que fala JSON com a ponte local
// (`caminho` é relativo a /contas/<conta>; a senha da ponte e a URL ficam em config_banco). Sem DOM: roda no Node também.
//
// Rotas da ponte usadas (ponte-c6/rotas-fase2.mjs):
//   GET  /extrato?de&ate                  GET /saldo                GET /boletos/pagos?de&ate&por     GET /dda
//   POST /pagamentos/decodificar          GET /pagamentos/:grupo/itens    DELETE /pagamentos/:grupo/itens
//   POST /pagamentos/:grupo/enviar        GET /comprovante/:reference?data&formato=json
// Os valores vêm no formato do C6 (amount em texto "1500.00" ou número em reais); quem grava no banco do ERP
// (conciliacao.js / importarExtrato) converte para centavos.

import { chamarPonte } from './banco.js';

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const data = (d, nome) => {
  if (!RE_DATA.test(String(d ?? ''))) throw new Error(`A ${nome} precisa estar no formato AAAA-MM-DD.`);
  return d;
};
const consulta = (params) => {
  const pares = Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return pares.length ? `?${pares.join('&')}` : '';
};
const grupo = (g) => {
  const t = String(g ?? '').trim();
  if (!t) throw new Error('Informe o grupo de pagamentos.');
  return encodeURIComponent(t);
};

/** Extrato de uma conta entre duas datas → { conta_id, de, ate, lancamentos: [entry do C6 + conta_id] }. */
export async function extratoDaConta(contaId, de, ate) {
  return chamarPonte(contaId, 'GET', `/extrato${consulta({ de: data(de, 'data inicial'), ate: data(ate, 'data final') })}`);
}

/** Saldo → { conta_id, date, available, locked, future, limit{…}, total_available, … } (números em reais, como o C6). */
export const saldoDaConta = (contaId) => chamarPonte(contaId, 'GET', '/saldo');

/** Boletos com pagamento no período → { conta_id, de, ate, por, boletos: [...] }. por = 'payment_date' (padrão) | 'credit_date'. */
export async function boletosPagos(contaId, de, ate, por = 'payment_date') {
  return chamarPonte(contaId, 'GET', `/boletos/pagos${consulta({ de: data(de, 'data inicial'), ate: data(ate, 'data final'), por })}`);
}

/** Boletos a pagar que chegaram pelo DDA → { conta_id, items: [{ content, amount, beneficiary_name, due_date, overdue, … }] }. */
export const ddaDaConta = (contaId) => chamarPonte(contaId, 'GET', '/dda');

/**
 * Manda os pagamentos para o banco LER (ainda não paga) → { conta_id, group_id }.
 * itens: [{ content (código de barras/linha digitável, Pix copia e cola ou chave Pix), amount (reais, 2 casas), description (≤100), transaction_date ('AAAA-MM-DD', opcional) }]
 */
export async function decodificarPagamentos(contaId, itens) {
  if (!Array.isArray(itens) || !itens.length) throw new Error('Informe pelo menos um pagamento.');
  return chamarPonte(contaId, 'POST', '/pagamentos/decodificar', { items: itens });
}

/** Itens de um grupo, com o que o banco leu (beneficiário, vencimento, status READ_DATA/DECODE_ERROR/SCHEDULED…) → { conta_id, group_id, items }. */
export async function itensDoGrupo(contaId, groupId) { return chamarPonte(contaId, 'GET', `/pagamentos/${grupo(groupId)}/itens`); }

/** Tira itens de um grupo antes de enviar → { conta_id, group_id, removidos }. ids: lista de ids dos itens. */
export async function removerItensDoGrupo(contaId, groupId, ids) {
  const lista = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (!lista.length) throw new Error('Informe os itens a remover.');
  return chamarPonte(contaId, 'DELETE', `/pagamentos/${grupo(groupId)}/itens`, lista);
}

/** Envia o grupo para aprovação no aplicativo/Web Banking do C6 → { conta_id, group_id, enviado: true }. Depois disso o grupo não muda mais. */
export async function enviarGrupoParaAprovacao(contaId, groupId, uploaderName) {
  const nome = String(uploaderName ?? '').trim();
  if (!nome) throw new Error('Informe o nome de quem está enviando.');
  return chamarPonte(contaId, 'POST', `/pagamentos/${grupo(groupId)}/enviar`, { uploader_name: nome });
}

/** Bytes de um texto em base64 (sem DOM: atob existe no navegador e no Node 16+). */
export function bytesDoBase64(b64) {
  const bin = atob(String(b64 ?? ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Comprovante gerado pela ponte para um lançamento do extrato → Blob (application/pdf) com `nome` e `lancamento` anexados.
 * `data` = dia do lançamento (entry_date), ajuda a ponte a achar o lançamento sem varrer 90 dias.
 */
export async function baixarComprovantePonte(contaId, reference, data_ = null) {
  const ref = String(reference ?? '').trim();
  if (!ref) throw new Error('Informe a referência do lançamento.');
  const r = await chamarPonte(contaId, 'GET', `/comprovante/${encodeURIComponent(ref)}${consulta({ data: data_, formato: 'json' })}`);
  if (!r?.pdf_base64) throw new Error('A ponte não devolveu o PDF do comprovante.');
  const blob = new Blob([bytesDoBase64(r.pdf_base64)], { type: 'application/pdf' });
  blob.nome = r.nome || `comprovante-${ref}.pdf`;
  blob.origem = r.origem || 'ponte';
  blob.lancamento = r.lancamento || null;
  return blob;
}
