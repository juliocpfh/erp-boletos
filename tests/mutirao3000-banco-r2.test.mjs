// Mutirão 3000, 2ª rodada, frente banco (C6): conciliação pelo identificador do Pix e do boleto, extrato em CSV com a conferência
// do saldo, avisos do banco e painel de saúde. Dados fictícios: aluguel R$ 1.350, bonificação 10%, tarifa R$ 3,50 → em dia R$ 1.218,50.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';
import * as Z from '../docs/js/conciliacao.js';

function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua A, 117', cidade: 'Curitiba', uf: 'PR', cep: '80000-000', bairro: 'Centro' }, 'j');
  const sala = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Sala 2', endereco: 'Rua B, 10', cidade: 'Curitiba', uf: 'PR', cep: '80000-001', bairro: 'Centro' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: sala.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const comum = { inquilino_cpf: '529.982.247-25', data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, taxa_boleto: 350, multa_percentual: 10, juros_mensal_percentual: 1 };
  const a = R.inserir(d, 'contratos', { ...comum, imovel_id: loja.id, inquilino_nome: 'Ana Teste' }, 'j');
  const b = R.inserir(d, 'contratos', { ...comum, imovel_id: sala.id, inquilino_nome: 'Bruno Teste' }, 'j');
  d.config_banco = { ativo: true, provedor: 'c6', conta_padrao_id: 'ank', contas: [{ id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox' }] };
  R.normalizar(d);
  R.gerarCobrancas(d, '2026-07', 'j');
  const cbA = d.cobrancas.find((x) => x.contrato_id === a.id);
  const cbB = d.cobrancas.find((x) => x.contrato_id === b.id);
  return { d, cbA, cbB };
}
/** Resposta da emissão do C6 (bolepix.yaml): referência, nosso número e a referência do Pix. */
const emissao = (ref, nosso, pixRef) => ({ id: `ID${ref}`.slice(0, 26), external_reference_id: ref, amount: 1353.5, due_date: '2026-08-10', status: 'CREATED',
  payment_method: { bank_slip: { our_number: nosso, digitable_line: '33690.00000 00000.000000 00000.000000 1 00000000000000' }, pix: { qr_code: '000201', reference: pixRef } } });
const pix = (reference, data, valor, extra = {}) => ({ reference, entry_date: data, created_at: `${data}T10:00:00`, amount: (valor / 100).toFixed(2), operation_type: 'INCOMING', transaction_type: 'CREDIT_QRCODE_PIX_PAYMENT_RECEIVED', title: 'Pix recebido', description: 'PIX RECEBIDO', ...extra });

// ---------------------------------------------------------------- 2: conciliação pelo identificador
test('2: a emissão guarda a referência do Pix e o nosso número; a consulta guarda os ids dos pagamentos', () => {
  const { d, cbA } = base();
  R.registrarBoletoBancario(d, cbA.id, emissao('B0000000AAAAAAAAAAAAAAAAAA', '0000123456', '123e4567-e89b-12d3-a456-426614174000'), 'j', { conta_id: 'ank' });
  assert.equal(cbA.banco.pix_referencia, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(cbA.banco.nosso_numero, '0000123456');
  assert.deepEqual(cbA.banco.ids_pagamento, []);
  // consulta com o pagamento (payments[] juntado pela ponte): o id do pagamento fica, a referência do Pix não se perde
  R.registrarBoletoBancario(d, cbA.id, { external_reference_id: 'B0000000AAAAAAAAAAAAAAAAAA', status: 'PAID', payments: [{ amount: '1218.50', external_payment_id: '01KVG41MYPFJRCJE4AVK9NCFQ1', payment_date: '2026-08-10', credit_date: '2026-08-10', payment_type: 'PIX' }] }, 'j');
  assert.deepEqual(cbA.banco.ids_pagamento, ['01KVG41MYPFJRCJE4AVK9NCFQ1']);
  assert.equal(cbA.banco.pix_referencia, '123e4567-e89b-12d3-a456-426614174000');
  assert.deepEqual(Z.identificadoresDoBoleto(cbA).sort(), ['01KVG41MYPFJRCJE4AVK9NCFQ1', '123456', '123E4567E89B12D3A456426614174000', 'B0000000AAAAAAAAAAAAAAAAAA'].sort());
});

test('2: dois boletos do mesmo valor: a entrada que cita a referência do Pix do Bruno vai para o Bruno, com certeza (antes do valor e da data)', () => {
  const { d, cbA, cbB } = base();
  R.registrarBoletoBancario(d, cbA.id, emissao('B0000000AAAAAAAAAAAAAAAAAA', '0000123456', '11111111-1111-4111-8111-111111111111'), 'j', { conta_id: 'ank' });
  R.registrarBoletoBancario(d, cbB.id, emissao('B0000000BBBBBBBBBBBBBBBBBB', '0000123457', '22222222-2222-4222-8222-222222222222'), 'j', { conta_id: 'ank' });
  const pont = R.totais(cbA).a_pagar_pontual;
  assert.equal(pont, R.totais(cbB).a_pagar_pontual);
  // sem identificador: dois boletos com o mesmo valor, quem escolhe é o usuário
  const { novas: [semId] } = Z.importarExtrato(d, 'ank', [pix('r1', '2026-08-10', pont)], 'j', { hoje: '2026-09-01' });
  const s1 = Z.sugerirDestino(d, semId);
  assert.equal(s1.cobranca_id, null);
  assert.equal(s1.confianca, 'baixa');
  // com a referência do Pix na descrição: é o do Bruno
  const { novas: [comId] } = Z.importarExtrato(d, 'ank', [pix('r2', '2026-08-10', pont, { description: 'Pix QR Code ref 22222222-2222-4222-8222-222222222222' })], 'j', { hoje: '2026-09-01' });
  const s2 = Z.sugerirDestino(d, comId);
  assert.equal(s2.cobranca_id, cbB.id);
  assert.equal(s2.confianca, 'alta');
  assert.match(s2.motivo, /código do banco/);
  // pelo nosso número citado sem os zeros (liquidação do boleto pelo código de barras)
  const { novas: [porNosso] } = Z.importarExtrato(d, 'ank', [pix('r3', '2026-08-10', pont, { transaction_type: 'PAYMENT', title: 'Liquidação de boleto', description: 'LIQUIDACAO BOLETO NN 123456' })], 'j', { hoje: '2026-09-01' });
  assert.equal(Z.sugerirDestino(d, porNosso).cobranca_id, cbA.id);
  // pelo id do Pix (end to end) guardado num pagamento informado pelo banco
  cbB.banco.ids_pagamento = ['E1234567820260810ABCDEFGHIJK'];
  const { novas: [porE2e] } = Z.importarExtrato(d, 'ank', [pix('r4', '2026-08-10', pont, { end_to_end_id: 'E1234567820260810ABCDEFGHIJK' })], 'j', { hoje: '2026-09-01' });
  assert.equal(Z.sugerirDestino(d, porE2e).cobranca_id, cbB.id);
});

test('2: identificador de boleto em acordo nunca cai na busca por valor; palavra comum nunca é identificador', () => {
  const { d, cbA, cbB } = base();
  R.registrarBoletoBancario(d, cbA.id, emissao('B0000000AAAAAAAAAAAAAAAAAA', '0000123456', '11111111-1111-4111-8111-111111111111'), 'j', { conta_id: 'ank' });
  cbA.situacao = 'Em acordo';
  const pont = R.totais(cbB).a_pagar_pontual;
  const { novas: [m] } = Z.importarExtrato(d, 'ank', [pix('r1', '2026-08-10', pont, { description: 'Pix ref 11111111-1111-4111-8111-111111111111' })], 'j', { hoje: '2026-09-01' });
  const s = Z.sugerirDestino(d, m);
  assert.ok(!s || s.cobranca_id !== cbB.id, 'não vai para o boleto do Bruno só pelo valor');
  assert.deepEqual(Z.identificadoresDaMov({ descricao: 'PIX RECEBIDO TRANSFERENCIA', titulo: 'Pix recebido' }), []);
});

test('2: com dois Pix iguais no mesmo dia, o pagamento do banco liga a entrada com o mesmo id do pagamento', () => {
  const { d, cbA } = base();
  R.registrarBoletoBancario(d, cbA.id, emissao('B0000000AAAAAAAAAAAAAAAAAA', '0000123456', '11111111-1111-4111-8111-111111111111'), 'j', { conta_id: 'ank' });
  const pont = R.totais(cbA).a_pagar_pontual;
  Z.importarExtrato(d, 'ank', [pix('r1', '2026-08-10', pont, { local_reference: '01JGHAMYWRSAW41GAMFKEG17VA' }), pix('r2', '2026-08-10', pont, { local_reference: '01KVG41MYPFJRCJE4AVK9NCFQ1' })], 'j', { hoje: '2026-09-01' });
  const r = Z.registrarPagamentoDoBanco(d, 'ank', { cobranca_id: cbA.id, valor: pont, data_credito: '2026-08-10', data_pagamento: '2026-08-10', external_payment_id: '01KVG41MYPFJRCJE4AVK9NCFQ1', payment_type: 'PIX' }, 'j');
  assert.equal(r.divergente, false);
  const ligada = d.movimentacoes_banco.find((m) => m.cobranca_id === cbA.id);
  assert.equal(ligada.id_externo, 'r2');
});
