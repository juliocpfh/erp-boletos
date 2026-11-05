import assert from 'node:assert/strict';
import test from 'node:test';
import { listarPagos, DIAS_JANELA_BOLETOS, TAMANHO_PAGINA } from '../c6-boletos-listar.mjs';
import { diasEntre } from '../c6-datas.mjs';
import { criarC6Simulado } from '../c6-simulado.mjs';

test('listarPagos: janelas de até 60 dias e paginação até total_pages, size 100 desde page 0', async () => {
  const chamadas = [];
  // cada janela tem 250 boletos → 3 páginas (100, 100, 50)
  const c6 = { conta: 'ank', async chamar(m, caminho, { query }) {
    chamadas.push({ caminho, query });
    const inicio = query.page * query.size;
    const content = Array.from({ length: Math.max(0, Math.min(query.size, 250 - inicio)) }, (_, i) => ({ id: `${query.payment_date_from}-${inicio + i}`, payments: [] }));
    return { status: 200, corpo: { content, total_elements: 250, total_pages: 3, page: query.page, size: query.size } };
  } };
  const lista = await listarPagos(c6, { de: '2026-01-01', ate: '2026-04-30', por: 'payment_date' });
  const janelas = [...new Set(chamadas.map((c) => `${c.query.payment_date_from}..${c.query.payment_date_to}`))];
  assert.deepEqual(janelas, ['2026-01-01..2026-03-01', '2026-03-02..2026-04-30']);
  for (const c of chamadas) {
    assert.equal(c.caminho, '/v2/bank_slips');
    assert.equal(c.query.size, TAMANHO_PAGINA);
    assert.ok(diasEntre(c.query.payment_date_from, c.query.payment_date_to) < DIAS_JANELA_BOLETOS);
  }
  assert.deepEqual(chamadas.slice(0, 3).map((c) => c.query.page), [0, 1, 2]);
  assert.equal(chamadas.length, 6, '3 páginas × 2 janelas');
  assert.equal(lista.length, 500);
  assert.equal(new Set(lista.map((b) => b.id)).size, 500);
});

test('listarPagos: filtro por credit_date e recusa filtro desconhecido', async () => {
  const chamadas = [];
  const c6 = { async chamar(m, c, { query }) { chamadas.push(query); return { status: 200, corpo: { content: [], total_pages: 0 } }; } };
  await listarPagos(c6, { de: '2026-11-01', ate: '2026-11-30', por: 'credit_date' });
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].credit_date_from, '2026-11-01');
  assert.equal(chamadas[0].credit_date_to, '2026-11-30');
  assert.equal(chamadas[0].payment_date_from, undefined);
  await assert.rejects(listarPagos(c6, { de: '2026-11-01', ate: '2026-11-30', por: 'qualquer' }), /desconhecido/);
  await assert.rejects(listarPagos(c6, { de: '2026-11-30', ate: '2026-11-01' }), /não pode ser depois/);
});

test('listarPagos no simulado: boletos da ANK com payments[] no formato do C6; JCK não emite', async () => {
  const ank = await listarPagos(criarC6Simulado({ conta: 'ank' }), { de: '2026-11-01', ate: '2026-11-30' });
  assert.equal(ank.length, 3);
  const b = ank[0];
  assert.equal(b.status, 'PAID');
  assert.equal(b.payment_method.bank_slip.our_number, '0000003048');
  assert.equal(b.payment_method.bank_slip.bar_code.length, 44);
  assert.match(b.payments[0].amount, /^\d+\.\d{2}$/);
  assert.equal(b.payments[0].payment_type, 'PIX');
  assert.match(b.payments[0].external_payment_id, /^[A-Z0-9]{26}$/);
  // por data de crédito: o boleto que ainda espera confirmação não tem credit_date
  const credito = await listarPagos(criarC6Simulado({ conta: 'ank' }), { de: '2026-11-01', ate: '2026-11-30', por: 'credit_date' });
  assert.equal(credito.length, 2);
  // paginação do próprio simulado (size pequeno não é usado pelo módulo, mas o simulado respeita)
  const r = await criarC6Simulado({ conta: 'ank' }).chamar('GET', '/v2/bank_slips', { query: { payment_date_from: '2026-11-01', payment_date_to: '2026-11-30', page: 1, size: 2 } });
  assert.equal(r.corpo.total_pages, 2);
  assert.equal(r.corpo.content.length, 1);
  const jck = await listarPagos(criarC6Simulado({ conta: 'jck' }), { de: '2026-11-01', ate: '2026-11-30' });
  assert.equal(jck.length, 0);
});
