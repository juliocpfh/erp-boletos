// Lista de boletos (Bolepix 1.2.0, documentacao/c6-openapi/bolepix.yaml) — para a conciliação dos pagos.
//
// listarPagos(c6, { de, ate, por: 'payment_date' | 'credit_date' }) → content[] (cada item como o C6 devolve, com payments[])
//   GET /v2/bank_slips?{por}_from&{por}_to&page&size, janelas de até 60 dias (limite do C6),
//   paginando desde page=0 com size=100 até total_pages; repete por `id` são descartados.
//   `por` = 'payment_date' (dia em que o inquilino pagou) ou 'credit_date' (dia em que o dinheiro entrou na conta).
//   Também aceita 'due_date' (boletos por vencimento, pagos ou não).

import { janelas, validarData, diasEntre } from './c6-datas.mjs';
import { erroDoC6 } from './c6-extrato.mjs';

export const DIAS_JANELA_BOLETOS = 60;
export const TAMANHO_PAGINA = 100;
export const MAX_DIAS_BOLETOS = 366;
const MAX_PAGINAS = 1000; // proteção contra total_pages maluco
const FILTROS = ['payment_date', 'credit_date', 'due_date'];

export async function listarPagos(c6, { de, ate, por = 'payment_date', status = null } = {}) {
  validarData(de, 'data inicial');
  validarData(ate, 'data final');
  if (de > ate) throw new Error(`A data inicial (${de}) não pode ser depois da data final (${ate}).`);
  if (diasEntre(de, ate) > MAX_DIAS_BOLETOS) throw new Error(`Peça os boletos de até ${MAX_DIAS_BOLETOS} dias por vez.`);
  if (!FILTROS.includes(por)) throw new Error(`Filtro "${por}" desconhecido; use ${FILTROS.join(', ')}.`);
  const vistos = new Set();
  const content = [];
  for (const j of janelas(de, ate, DIAS_JANELA_BOLETOS)) {
    for (let page = 0, totalPaginas = 1; page < totalPaginas && page < MAX_PAGINAS; page++) {
      const query = { [`${por}_from`]: j.de, [`${por}_to`]: j.ate, page, size: TAMANHO_PAGINA };
      if (status) query.status = status;
      const r = await c6.chamar('GET', '/v2/bank_slips', { query });
      if (r.status !== 200) throw erroDoC6(r, `listar os boletos de ${j.de} a ${j.ate} (página ${page})`);
      const itens = Array.isArray(r.corpo?.content) ? r.corpo.content : [];
      for (const b of itens) {
        const chave = b.id ?? b.external_reference_id ?? null;
        if (chave != null) { if (vistos.has(chave)) continue; vistos.add(chave); }
        content.push(b);
      }
      totalPaginas = Number.isInteger(r.corpo?.total_pages) ? r.corpo.total_pages : (itens.length < TAMANHO_PAGINA ? page + 1 : page + 2);
      if (!itens.length) break;
    }
  }
  return content;
}
