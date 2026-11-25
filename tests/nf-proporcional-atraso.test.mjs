// NF do aluguel proporcional (entrada no meio do mês), decisão do dono de 24/11: pago em dia, "16/30 × aluguel bonificado";
// pago com atraso, uma linha só "1 × total" e a conta nas observações. Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';
import { quantidadeDaFatura } from '../docs/js/fatura.js';

function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 't');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', complemento: '', cidade: 'Curitiba' }, 't');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 't');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-11-15', vigencia_inicio: '2026-11-15', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, multa_percentual: 10, juros_mensal_percentual: 1, conta_condominio: 'Por conta do inquilino', ...extra }, 't');
  R.gerarCobrancas(d, '2026-11', 't');
  return { d, c, cb: R.boletoDoMes(d, c.id, '2026-11') };
}
const nf = (d) => d.faturas[0];

test('proporcional pago em dia: 16/30 × R$ 1.800,00 = R$ 960,00, sem conta nas observações', () => {
  const { d, cb } = base();
  assert.equal(cb.dias_cobrados, 16); assert.equal(cb.dias_mes, 30);
  R.registrarPagamento(d, cb.id, '2026-12-09', null, 't', { dataPagou: '2026-12-09' });
  R.numerarFaturas(d, 't');
  assert.equal(nf(d).valor, 96000);
  assert.deepEqual(quantidadeDaFatura(nf(d)), { proporcional: true, quantidade: '16/30', unitario: 180000 });
  assert.ok(!/Aluguel proporcional/.test(nf(d).observacoes || ''));
});

test('proporcional pago com atraso: linha "1 × R$ 1.182,44" e a conta nas observações', () => {
  const { d, cb } = base();
  R.registrarPagamento(d, cb.id, '2027-01-05', null, 't', { dataPagou: '2027-01-05' });
  R.numerarFaturas(d, 't');
  assert.equal(nf(d).valor, 118244);
  assert.deepEqual(quantidadeDaFatura(nf(d)), { proporcional: false, quantidade: '1', unitario: 118244 });
  assert.equal(nf(d).observacoes, 'Aluguel proporcional 16/30 × R$ 2.000,00 = R$ 1.066,67 + multa e juros por atraso R$ 115,77 = R$ 1.182,44');
});

test('mês inteiro pago com atraso: sem a conta do proporcional', () => {
  const { d, c } = base({ data_entrada: '2026-03-01', vigencia_inicio: '2026-03-01' });
  const cb = R.boletoDoMes(d, c.id, '2026-11');
  R.registrarPagamento(d, cb.id, '2027-01-05', null, 't', { dataPagou: '2027-01-05' });
  R.numerarFaturas(d, 't');
  assert.ok(!/Aluguel proporcional/.test(nf(d).observacoes || ''));
});

test('conta só sai quando as partes somam o valor da NF', () => {
  assert.equal(R.contaDoProporcionalAtrasado({ dias_cobrados: 16, dias_mes: 30, aluguel: 106667, aluguel_mensal: 200000, multa: 10667, juros: 910, valor_nf: 120000 }), '');
  assert.equal(R.contaDoProporcionalAtrasado({ dias_cobrados: 16, dias_mes: 30, aluguel: 106667, aluguel_mensal: 200000, multa: 0, juros: 0, dias_atraso: 2, valor_nf: 106667 }),
    'Aluguel proporcional 16/30 × R$ 2.000,00 = R$ 1.066,67 (pago depois do vencimento, sem o desconto de pontualidade)');
});
