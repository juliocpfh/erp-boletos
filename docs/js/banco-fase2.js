// Banco, fase 2 (cliente do site): extrato, saldo, boletos pagos, DDA, pagamentos agendados e comprovante gerado pela ponte.
// Tudo passa por `chamarPonte(contaId, metodo, caminho, corpo)` de banco.js, que fala JSON com a ponte local
// (`caminho` é relativo a /contas/<conta>; a senha da ponte e a URL ficam em config_banco). Sem DOM: roda no Node também.
// Em `?teste` (pasta interna do navegador) a ponte é simulada aqui mesmo, com os dados fictícios de simulado-banco.js.
//
// Rotas da ponte usadas (ponte-c6/rotas-fase2.mjs):
//   GET  /extrato?de&ate                  GET /saldo                GET /boletos/pagos?de&ate&por     GET /dda
//   POST /pagamentos/decodificar          GET /pagamentos/:grupo/itens    DELETE /pagamentos/:grupo/itens
//   POST /pagamentos/:grupo/enviar        GET /comprovante/:reference?data&formato=json
// Os valores vêm no formato do C6 (amount em texto "1500.00" ou número em reais); quem grava no banco do ERP
// (conciliacao.js / importarExtrato) converte para centavos.

import { chamarPonte } from './banco.js';
import * as K from './c6-comum.js';

let SIM = null; // dados fictícios do `?teste` (simulado-banco.js): só carregam no modo de teste

/** Fala com a ponte; em `?teste` responde a ponte simulada deste arquivo (dados fictícios de simulado-banco.js). */
const ponte = async (contaId, metodo, caminho, corpo) => {
  if (!emTeste()) return chamarPonte(contaId, metodo, caminho, corpo);
  if (!SIM) {
    SIM = await import('./simulado-banco.js');
    gruposTeste.set(SIM.GRUPO_ITENS.group_id, SIM.GRUPO_ITENS.items.map((i) => ({ ...i })));
  }
  return ponteSimulada(contaId, metodo, caminho, corpo);
};

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
  return ponte(contaId, 'GET', `/extrato${consulta({ de: data(de, 'data inicial'), ate: data(ate, 'data final') })}`);
}

/** Saldo → { conta_id, date, available, locked, future, limit{…}, total_available, … } (números em reais, como o C6). */
export const saldoDaConta = (contaId) => ponte(contaId, 'GET', '/saldo');

/** Boletos com pagamento no período → { conta_id, de, ate, por, boletos: [...] }. por = 'payment_date' (padrão) | 'credit_date'. */
export async function boletosPagos(contaId, de, ate, por = 'payment_date') {
  return ponte(contaId, 'GET', `/boletos/pagos${consulta({ de: data(de, 'data inicial'), ate: data(ate, 'data final'), por })}`);
}

/** Boletos a pagar que chegaram pelo DDA → { conta_id, items: [{ content, amount, beneficiary_name, due_date, overdue, … }] }. */
export const ddaDaConta = (contaId) => ponte(contaId, 'GET', '/dda');

/**
 * Manda os pagamentos para o banco LER (ainda não paga) → { conta_id, group_id }.
 * itens: [{ content (código de barras/linha digitável, Pix copia e cola ou chave Pix), amount (reais, 2 casas), description (≤100), transaction_date ('AAAA-MM-DD', opcional) }]
 */
export async function decodificarPagamentos(contaId, itens) {
  if (!Array.isArray(itens) || !itens.length) throw new Error('Informe pelo menos um pagamento.');
  return ponte(contaId, 'POST', '/pagamentos/decodificar', { items: itens });
}

/** Itens de um grupo, com o que o banco leu (beneficiário, vencimento, status READ_DATA/DECODE_ERROR/SCHEDULED…) → { conta_id, group_id, items }. */
export async function itensDoGrupo(contaId, groupId) { return ponte(contaId, 'GET', `/pagamentos/${grupo(groupId)}/itens`); }

/** Tira itens de um grupo antes de enviar → { conta_id, group_id, removidos }. ids: lista de ids dos itens. */
export async function removerItensDoGrupo(contaId, groupId, ids) {
  const lista = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (!lista.length) throw new Error('Informe os itens a remover.');
  return ponte(contaId, 'DELETE', `/pagamentos/${grupo(groupId)}/itens`, lista);
}

/** Envia o grupo para aprovação no aplicativo/Web Banking do C6 → { conta_id, group_id, enviado: true }. Depois disso o grupo não muda mais. */
export async function enviarGrupoParaAprovacao(contaId, groupId, uploaderName) {
  const nome = String(uploaderName ?? '').trim();
  if (!nome) throw new Error('Informe o nome de quem está enviando.');
  return ponte(contaId, 'POST', `/pagamentos/${grupo(groupId)}/enviar`, { uploader_name: nome });
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
  const r = await ponte(contaId, 'GET', `/comprovante/${encodeURIComponent(ref)}${consulta({ data: data_, formato: 'json' })}`);
  if (!r?.pdf_base64) throw new Error('A ponte não devolveu o PDF do comprovante.');
  const blob = new Blob([bytesDoBase64(r.pdf_base64)], { type: 'application/pdf' });
  blob.nome = r.nome || `comprovante-${ref}.pdf`;
  blob.origem = r.origem || 'ponte';
  blob.lancamento = r.lancamento || null;
  return blob;
}

// --------------------------------------------------------------------------
// Modo de teste (`?teste`): ponte simulada dentro do site, com os dados fictícios de simulado-banco.js
// --------------------------------------------------------------------------
/** A página está em `?teste` (pasta interna do navegador, sem ponte)? No Node (testes) não há `location`: vai à ponte de verdade. */
const emTeste = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('teste');

const noMes = (data, mes) => `${mes}-${String(data).slice(8, 10)}`;
const gruposTeste = new Map(); // começa com o grupo fictício de simulado-banco.js, posto ao carregá-lo (ponte)
let seqTeste = 0;
const idTeste = () => `TESTE${String(++seqTeste).padStart(4, '0')}${Date.now().toString(36).toUpperCase()}`.slice(0, 26);
const erroTeste = (m) => { throw new Error(m); };

/** PDF mínimo de uma página com um texto (igual ao que a ponte gera, só que sem fonte embutida). */
function pdfDeTexto(linhas) {
  const txt = linhas.map((l, n) => `BT /F1 11 Tf 40 ${800 - n * 16} Td (${String(l).replace(/[()\\]/g, ' ')}) Tj ET`).join('\n');
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${txt.length}>>stream\n${txt}\nendstream`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  let pdf = '%PDF-1.4\n';
  const pos = [];
  objs.forEach((o, i) => { pos.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

/** Extrato fictício no período: os lançamentos de novembro/2026 repetem-se em cada mês pedido (o mesmo de c6-simulado.mjs, em c6-comum). */
const extratoTeste = (contaId, de, ate) => K.lancamentosNoPeriodo((SIM.EXTRATO[contaId] || { entries: [] }).entries, de, ate).map((e) => ({ ...e, conta_id: contaId }));

/** Boletos pagos fictícios: os pagamentos de novembro/2026 trazidos para o mês pedido. */
function boletosPagosTeste(contaId, de, ate, por) {
  const mes = de.slice(0, 7);
  return ((SIM.BOLETOS_PAGOS[contaId] || { content: [] }).content).map((b) => ({ ...b, due_date: noMes(b.due_date, mes),
    payments: (b.payments || []).map((p) => ({ ...p, payment_date: p.payment_date ? noMes(p.payment_date, mes) : p.payment_date, credit_date: p.credit_date ? noMes(p.credit_date, mes) : p.credit_date })) }))
    .filter((b) => (b.payments || []).some((p) => { const dt = p[por] || p.payment_date || p.credit_date; return dt && dt >= de && dt <= ate; }));
}

/** Responde como a ponte responderia (ponte-c6/rotas-fase2.mjs), só com os dados fictícios. */
async function ponteSimulada(contaId, metodo, caminho, corpo) {
  const url = new URL(String(caminho), 'http://teste.local');
  const q = Object.fromEntries(url.searchParams);
  const partes = url.pathname.split('/').filter(Boolean);
  const m = String(metodo).toUpperCase();
  if (!SIM.EXTRATO[contaId]) erroTeste(`A conta "${contaId}" não está configurada na ponte (no modo de teste só existem ank e jck).`);
  if (m === 'GET' && partes[0] === 'extrato') return { conta_id: contaId, de: q.de, ate: q.ate, lancamentos: extratoTeste(contaId, q.de, q.ate) };
  if (m === 'GET' && partes[0] === 'saldo') return { ...(SIM.SALDO[contaId] || SIM.SALDO.ank), conta_id: contaId, date: new Date().toISOString().slice(0, 10) };
  if (m === 'GET' && partes[0] === 'boletos' && partes[1] === 'pagos') return { conta_id: contaId, de: q.de, ate: q.ate, por: q.por || 'payment_date', boletos: boletosPagosTeste(contaId, q.de, q.ate, q.por || 'payment_date') };
  if (m === 'GET' && partes[0] === 'dda') return { conta_id: contaId, ...(SIM.DDA[contaId] || { items: [] }) };
  if (partes[0] === 'pagamentos') {
    if (m === 'POST' && partes[1] === 'decodificar') {
      const group_id = idTeste();
      // como a ponte: cada item é conferido antes (validarItem, c6-comum) e um item ruim recusa o pedido inteiro
      const items = Array.isArray(corpo && corpo.items) && corpo.items.length ? corpo.items.map((it, i) => K.validarItem(it, i + 1)) : erroTeste('Informe pelo menos um pagamento.');
      gruposTeste.set(group_id, items.map((it) => K.itemLidoSimulado(contaId, it, { id: idTeste(), group_id, hoje: new Date().toISOString().slice(0, 10) })));
      return { conta_id: contaId, group_id };
    }
    const grupoId = decodeURIComponent(partes[1] || '');
    const itens = gruposTeste.get(grupoId);
    if (!itens) erroTeste('Grupo de pagamentos não encontrado.');
    if (m === 'GET' && partes[2] === 'itens') return { conta_id: contaId, group_id: grupoId, items: itens.map((i) => ({ ...i })) };
    if (m === 'DELETE' && partes[2] === 'itens') {
      const ids = new Set((Array.isArray(corpo) ? corpo : []).map((x) => (typeof x === 'object' ? x.id : x)));
      gruposTeste.set(grupoId, itens.filter((i) => !ids.has(i.id)));
      return { conta_id: contaId, group_id: grupoId, removidos: itens.length - gruposTeste.get(grupoId).length };
    }
    if (m === 'POST' && partes[2] === 'enviar') { for (const it of itens) if (it.status === 'READ_DATA') it.status = 'SCHEDULED'; return { conta_id: contaId, group_id: grupoId, enviado: true }; }
  }
  if (m === 'GET' && partes[0] === 'comprovante') {
    const ref = decodeURIComponent(partes[1] || '');
    const dia = q.data || new Date().toISOString().slice(0, 10);
    const l = extratoTeste(contaId, `${dia.slice(0, 7)}-01`, `${dia.slice(0, 7)}-31`).find((x) => x.reference === ref || (x.local_reference && x.local_reference === ref));
    if (!l) erroTeste(`Não achei o lançamento ${ref} no extrato (modo de teste).`);
    const pdf = pdfDeTexto(['Comprovante de movimentacao bancaria (TESTE, sem valor)', `Conta: ${contaId.toUpperCase()} (C6 Bank)`, `Data do lancamento: ${l.entry_date}`,
      `Tipo: ${l.operation_type === 'INCOMING' ? 'Entrada' : 'Saida'} - ${l.transaction_type}`, `Valor: R$ ${l.amount}`, `Titulo: ${l.title || ''}`, `Descricao: ${l.description || ''}`, `Referencia (C6): ${l.reference}`]);
    return { conta_id: contaId, reference: ref, nome: `comprovante-${ref.replace(/[^A-Za-z0-9_-]/g, '')}.pdf`, origem: 'ponte', pdf_base64: btoa(pdf.replace(/[^\x00-\xff]/g, '?')), lancamento: l };
  }
  return erroTeste(`Rota não existe na ponte simulada: ${m} ${url.pathname}`);
}
