import assert from 'node:assert/strict';
import test from 'node:test';
import { criarC6Simulado, c6SimuladoDaConta, PNG_1X1 } from '../c6-simulado.mjs';
import { codigoDeBarrasDaLinha } from '../c6-pagamentos.mjs';

const PEDIDO = {
  amount: 1219.5,
  due_date: '2026-12-10',
  description: 'Aluguel 12/2026 - Loja 1',
  external_reference_id: 'ANK0000000000000000000099Z',
  payer: { name: 'Maria Exemplo', tax_id: '52998224725', address: { address: 'Rua das Flores, 100', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', zip_code: '80010000' } },
  payment_method: { bank_slip: { billing_scheme: '21', your_number: '77' }, pix: { key: '123e4567-e89b-12d3-a456-426614174000', type: 'EVP' } },
};

test('Bolepix simulado: emitir → consultar → PDF → listar por vencimento → cancelar', async () => {
  const c6 = criarC6Simulado({ conta: 'ank' });
  const e = await c6.chamar('POST', '/v2/bank_slips', { corpo: PEDIDO });
  assert.equal(e.status, 201);
  const b = e.corpo;
  assert.match(b.id, /^[0-9A-Z]{26}$/);
  assert.equal(b.external_reference_id, PEDIDO.external_reference_id);
  assert.equal(b.amount, 1219.5);
  const bs = b.payment_method.bank_slip;
  assert.equal(bs.bar_code.length, 44);
  assert.match(bs.bar_code, /^\d{44}$/);
  assert.equal(bs.bar_code.slice(0, 3), '336');
  assert.equal(bs.bar_code.slice(9, 19), '0000121950', 'valor em centavos no código de barras');
  assert.equal(codigoDeBarrasDaLinha(bs.digitable_line), bs.bar_code, 'linha digitável bate com o código de barras');
  assert.match(bs.our_number, /^\d{1,10}$/);
  assert.equal(bs.number, '77');
  assert.equal(bs.billing_scheme, '21');
  assert.ok(b.payment_method.pix.qr_code.startsWith('000201'));
  assert.equal(b.payment_method.pix.image_content, PNG_1X1);
  assert.equal(Buffer.from(PNG_1X1, 'base64').subarray(1, 4).toString(), 'PNG');
  assert.equal(b.payment_method.pix.mime_type, 'image/png');
  assert.ok(b.payment_method.pix.reference);

  const repetido = await c6.chamar('POST', '/v2/bank_slips', { corpo: PEDIDO });
  assert.equal(repetido.status, 409, 'external_reference_id não se repete');
  const faltando = await c6.chamar('POST', '/v2/bank_slips', { corpo: { amount: 10 } });
  assert.equal(faltando.status, 400);

  const g = await c6.chamar('GET', `/v2/bank_slips/${PEDIDO.external_reference_id}`, {});
  assert.equal(g.status, 200);
  assert.equal(g.corpo.status, 'CREATED');
  assert.equal(g.corpo.payments, undefined, 'consulta não traz payments');
  assert.equal(g.corpo.payer.name, 'Maria Exemplo');

  const pdf = await c6.chamar('GET', `/v2/bank_slips/${b.id}/pdf`, { aceitar: 'application/pdf' });
  assert.equal(pdf.status, 200);
  assert.ok(Buffer.isBuffer(pdf.corpo));
  assert.equal(pdf.corpo.subarray(0, 5).toString('latin1'), '%PDF-');

  const lista = await c6.chamar('GET', '/v2/bank_slips', { query: { due_date_from: '2026-12-01', due_date_to: '2026-12-31' } });
  assert.equal(lista.status, 200);
  assert.equal(lista.corpo.total_elements, 1);
  assert.equal(lista.corpo.content[0].id, b.id);
  const grande = await c6.chamar('GET', '/v2/bank_slips', { query: { due_date_from: '2026-01-01', due_date_to: '2026-12-31' } });
  assert.equal(grande.status, 400, 'mais de 60 dias');

  const patch = await c6.chamar('PATCH', `/v2/bank_slips/${b.id}`, { corpo: { description: 'Nova descrição' } });
  assert.equal(patch.corpo.description, 'Nova descrição');
  const cancel = await c6.chamar('PUT', `/v2/bank_slips/${b.id}/cancel`, {});
  assert.equal(cancel.status, 204);
  assert.equal((await c6.chamar('GET', `/v2/bank_slips/${b.id}`, {})).corpo.status, 'CANCELED');
  assert.equal((await c6.chamar('GET', '/v2/bank_slips/NAOEXISTE', {})).status, 404);
});

test('simulado: autenticação fictícia, extrato de mais de 30 dias é recusado, rota desconhecida → 404, instância por conta', async () => {
  const c6 = c6SimuladoDaConta('jck');
  assert.equal(c6SimuladoDaConta('jck'), c6, 'mesma instância');
  assert.notEqual(c6SimuladoDaConta('ank'), c6);
  const auth = await c6.chamar('POST', '/v1/auth/', { corpo: 'grant_type=client_credentials' });
  assert.equal(auth.status, 200);
  assert.equal(auth.corpo.token_type, 'Bearer');
  assert.equal(auth.corpo.expires_in, 600);
  const longo = await c6.chamar('GET', '/v1/statement/', { query: { start_date: '2026-01-01', end_date: '2026-03-01' } });
  assert.equal(longo.status, 400);
  const semData = await c6.chamar('GET', '/v1/statement/', {});
  assert.equal(semData.status, 400);
  // query string embutida no caminho também funciona
  const ok = await c6.chamar('GET', '/v1/statement/?start_date=2026-11-01&end_date=2026-11-30', {});
  assert.equal(ok.status, 200);
  assert.equal(ok.corpo.entries.length, 4);
  const nada = await c6.chamar('GET', '/v9/nada', {});
  assert.equal(nada.status, 404);
  assert.match(nada.corpo.message, /não existe/);
});
