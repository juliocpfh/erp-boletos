import assert from 'node:assert/strict';
import test from 'node:test';
import * as P from '../c6-pagamentos.mjs';
import { criarC6Simulado } from '../c6-simulado.mjs';

const BARRAS = '33691991800000005000000003048720009765974213';
const LINHA_47 = '33690.00009 03048.720001 92241.282133 5 96900000012345';

test('content: reconhece código de barras, linha digitável, BR Code e chaves Pix; recusa o resto', () => {
  assert.equal(P.tipoDoContent(BARRAS), 'codigo_barras');
  assert.equal(P.tipoDoContent(LINHA_47), 'codigo_barras');
  assert.equal(P.tipoDoContent('000201040414123456789012342658001BR.GOV.BCB.PIX0136123e4567-e12b-12d1-a456-4266554400006304AD38'), 'br_code');
  assert.equal(P.tipoDoContent('52998224725'), 'chave_pix', 'CPF');
  assert.equal(P.tipoDoContent('11222333000181'), 'chave_pix', 'CNPJ');
  assert.equal(P.tipoDoContent('+5541999998888'), 'chave_pix', 'telefone');
  assert.equal(P.tipoDoContent('financeiro@exemplo.com.br'), 'chave_pix', 'e-mail');
  assert.equal(P.tipoDoContent('123e4567-e89b-12d3-a456-426614174000'), 'chave_pix', 'EVP');
  assert.equal(P.tipoDoContent('abc'), null);
  assert.equal(P.tipoDoContent('1234567890'), null, '10 dígitos não é nada');
  assert.equal(P.tipoDoContent(''), null);
  assert.equal(P.tipoDoContent('0002'), null, 'BR Code curto demais');
});

test('linha digitável de 47 dígitos vira código de barras de 44; a de 48 (concessionária) também', () => {
  const barras = P.codigoDeBarrasDaLinha(LINHA_47);
  assert.equal(barras.length, 44);
  assert.equal(barras, '33695969000000123450000003048720009224128213', 'exemplo do YAML do C6 (bolepix.yaml)');
  // arrecadação: 4 blocos de 11 + DV
  const linha48 = '82620000001' + '5' + '12345678901' + '2' + '23456789012' + '3' + '34567890123' + '4';
  assert.equal(P.codigoDeBarrasDaLinha(linha48), '82620000001' + '12345678901' + '23456789012' + '34567890123');
  assert.equal(P.codigoDeBarrasDaLinha(BARRAS), BARRAS, '44 fica como está');
  assert.throws(() => P.codigoDeBarrasDaLinha('123'), /44, 47 ou 48/);
  assert.equal(P.normalizarContent(LINHA_47), barras);
  assert.equal(P.normalizarContent(' 52998224725 '), '52998224725');
  assert.throws(() => P.normalizarContent('xyz'), /Não reconheci/);
});

test('validarItem: valor com 2 casas e maior que zero, descrição até 100, data AAAA-MM-DD', () => {
  assert.deepEqual(P.validarItem({ content: BARRAS, amount: 123.45, description: 'Água Loja 1', transaction_date: '2026-11-12' }),
    { content: BARRAS, amount: 123.45, description: 'Água Loja 1', transaction_date: '2026-11-12' });
  assert.deepEqual(P.validarItem({ content: LINHA_47, amount: '10,5' }), { content: P.codigoDeBarrasDaLinha(LINHA_47), amount: 10.5 });
  assert.throws(() => P.validarItem({ content: BARRAS, amount: 0 }), /maior que zero/);
  assert.throws(() => P.validarItem({ content: BARRAS, amount: -5 }), /maior que zero/);
  assert.throws(() => P.validarItem({ content: BARRAS, amount: 1.234 }), /2 casas/);
  assert.throws(() => P.validarItem({ content: BARRAS, amount: 'abc' }), /maior que zero/);
  assert.throws(() => P.validarItem({ content: BARRAS, amount: 10, description: 'x'.repeat(101) }), /máximo é 100/);
  assert.throws(() => P.validarItem({ content: BARRAS, amount: 10, transaction_date: '12/11/2026' }), /AAAA-MM-DD/);
  assert.throws(() => P.validarItem({ content: 'nada', amount: 10 }, 3), /Não reconheci/);
  assert.throws(() => P.validarItem(null, 2), /Item 2/);
  // 19,99 × 100 = 1998,9999… no computador: antes ~9% dos valores (R$ 19,99, R$ 1,15…) eram recusados
  for (const amount of [19.99, 1.15, 0.29, 4.35, 1234.57]) assert.equal(P.validarItem({ content: BARRAS, amount }).amount, amount);
});

test('decodificar valida ANTES de chamar o banco; com itens bons manda { items } e devolve group_id', async () => {
  const chamadas = [];
  const c6 = { conta: 'ank', async chamar(m, c, o) { chamadas.push({ m, c, o }); return { status: 201, corpo: { group_id: 'G1' } }; } };
  await assert.rejects(P.decodificar(c6, [{ content: 'ruim', amount: 1 }]), /Não reconheci/);
  await assert.rejects(P.decodificar(c6, []), /pelo menos um/);
  assert.equal(chamadas.length, 0, 'nada chegou ao banco');
  const r = await P.decodificar(c6, [{ content: LINHA_47, amount: 10, description: 'Luz' }, { content: '52998224725', amount: 20.5 }]);
  assert.deepEqual(r, { group_id: 'G1' });
  assert.equal(chamadas[0].m, 'POST');
  assert.equal(chamadas[0].c, '/v1/schedule_payments/decode');
  assert.deepEqual(chamadas[0].o.corpo, { items: [{ content: P.codigoDeBarrasDaLinha(LINHA_47), amount: 10, description: 'Luz' }, { content: '52998224725', amount: 20.5 }] });
});

test('fluxo completo no simulado: decodificar → itens → remover um → enviar para aprovação; DDA', async () => {
  const c6 = criarC6Simulado({ conta: 'ank' });
  const { group_id } = await P.decodificar(c6, [
    { content: BARRAS, amount: 123.45, description: 'Agua Loja 1', transaction_date: '2026-11-12' },
    { content: 'erro@exemplo.com.br', amount: 10 },
    { content: '+5541999998888', amount: 50 },
  ]);
  assert.match(group_id, /^[0-9A-Z]{26}$/);
  let { items } = await P.itensDoGrupo(c6, group_id);
  assert.equal(items.length, 3);
  assert.equal(items[0].status, 'READ_DATA');
  assert.equal(items[0].product_type, 'BOLETO');
  assert.equal(items[0].bank_code, '336');
  assert.equal(items[1].status, 'DECODE_ERROR');
  assert.match(items[1].error_message, /not possible to find key/);
  assert.equal(items[2].product_type, 'PIX');

  const rem = await P.removerItem(c6, group_id, items[1].id);
  assert.deepEqual(rem, { group_id, removidos: 1 });
  ({ items } = await P.itensDoGrupo(c6, group_id));
  assert.equal(items.length, 2);

  const rem2 = await P.removerItens(c6, group_id, [{ id: items[1].id }]);
  assert.equal(rem2.removidos, 1);
  ({ items } = await P.itensDoGrupo(c6, group_id));
  assert.equal(items.length, 1);

  await assert.rejects(P.enviarParaAprovacao(c6, group_id, ''), /uploader_name/);
  const env = await P.enviarParaAprovacao(c6, group_id, 'Zé da Silva');
  assert.deepEqual(env, { group_id, enviado: true });
  ({ items } = await P.itensDoGrupo(c6, group_id));
  assert.equal(items[0].status, 'SCHEDULED');

  await assert.rejects(P.itensDoGrupo(c6, 'NAOEXISTE'), (e) => e.status === 404);
  await assert.rejects(P.itensDoGrupo(c6, 'id com espaço'), /inválido/);

  const d = await P.dda(c6);
  assert.equal(d.items.length, 2);
  assert.equal(d.items[0].content.length, 44);
  assert.equal(typeof d.items[0].amount, 'number');

  // grupo fixo do JSON
  const fixo = await P.itensDoGrupo(c6, '01J3NCKY6Q99QC4D7T733D35QD');
  assert.equal(fixo.items.length, 3);
});
