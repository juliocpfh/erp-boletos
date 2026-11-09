import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as R from '../docs/js/regras.js';

// Correções da revisão de 09/11/2026 nos boletos (reserva, saída, dia útil, acordo, IPTU). Dados fictícios.
function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const jck = R.inserir(d, 'emitentes', { nome: 'JCK', razao_social: 'JCK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', complemento: '', cidade: 'Curitiba' }, 'julio');
  for (const e of [ank, jck]) R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: e.id, percentual: 50 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07', aluguel_inicial: 135000,
    dia_vencimento: 10, cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 10, taxa_boleto: 350,
    multa_percentual: 10, juros_mensal_percentual: 1, cobrar_iptu: true, reserva_valor: 50000, ...extra }, 'julio');
  R.inserir(d, 'iptus', { imovel_id: loja.id, ano: 2026, valor_total: 100000, num_parcelas: 10, primeira_competencia: '2026-02' }, 'julio');
  return { d, loja, c };
}
const doMes = (d, c, comp) => R.boletoDoMes(d, c.id, comp);

test('reserva sem mês marcado e carência: vai para o 1º aluguel depois da carência', () => {
  // entrada 07/06/2026, 1 mês de carência (junho), reserva de R$ 500,00 sem mês marcado ("usa no primeiro aluguel")
  const { d, c } = base({ carencia_meses: 1 });
  assert.equal(R.competenciaReserva(c), '2026-07');
  for (const comp of ['2026-06', '2026-07', '2026-08']) R.gerarCobrancas(d, comp, 'julio');
  const [jun, jul, ago] = ['2026-06', '2026-07', '2026-08'].map((m) => doMes(d, c, m));
  assert.deepEqual([jun.situacao, jun.carencia, jun.aluguel, jun.reserva_utilizada], ['Carência', true, 0, 0]);
  assert.equal(jul.reserva_utilizada, 50000, 'julho, o 1º aluguel, usa a reserva');
  assert.equal(R.totais(jul).a_pagar_pontual, 131850 - 50000);
  assert.equal(ago.reserva_utilizada, 0);
  assert.equal(R.saldoReserva(d, c), 0);
  // gerado fora de ordem (julho antes de junho): o resultado é o mesmo
  const b = base({ carencia_meses: 1 });
  for (const comp of ['2026-08', '2026-07', '2026-06']) R.gerarCobrancas(b.d, comp, 'julio');
  assert.deepEqual(['2026-06', '2026-07', '2026-08'].map((m) => doMes(b.d, b.c, m).reserva_utilizada), [0, 50000, 0]);
});

test('carência que cobra IPTU: o boleto da carência é cobrado e a reserva fica para o 1º aluguel', () => {
  const { d, c } = base({ carencia_meses: 1, carencia_cobrar_iptu: true });
  for (const comp of ['2026-06', '2026-07']) R.gerarCobrancas(d, comp, 'julio');
  const [jun, jul] = ['2026-06', '2026-07'].map((m) => doMes(d, c, m));
  assert.deepEqual([jun.situacao, jun.iptu, jun.reserva_utilizada, R.aCobrar(jun)], ['Em aberto', 8000, 0, true], 'IPTU de 24/30 dias cobrado');
  assert.equal(R.totais(jun).a_pagar_pontual, 8000);
  assert.equal(jul.reserva_utilizada, 50000);
  // o recálculo não muda nada
  R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'julio');
  assert.deepEqual([jun.situacao, jun.reserva_utilizada, jul.reserva_utilizada], ['Em aberto', 0, 50000]);
});

test('reserva com mês marcado: continua começando exatamente nele, com ou sem carência', () => {
  const { d, c } = base({ carencia_meses: 1, reserva_competencia: '2026-08' });
  assert.equal(R.competenciaReserva(c), '2026-08');
  for (const comp of ['2026-06', '2026-07', '2026-08']) R.gerarCobrancas(d, comp, 'julio');
  assert.deepEqual(['2026-06', '2026-07', '2026-08'].map((m) => doMes(d, c, m).reserva_utilizada), [0, 0, 50000]);
  // sem carência e sem mês marcado: o mês de entrada, como antes
  const b = base();
  assert.equal(R.competenciaReserva(b.c), '2026-06');
});

test('reserva calculada num lugar só: conta o FCI e o ressarcimento do boleto, e some quando o contrato deixa de ter reserva', () => {
  // reserva de R$ 3.000,00, maior que o boleto: o boleto de junho fica zerado contando o FCI (fora da conta antiga do boleto)
  const { d, c } = base({ reserva_valor: 300000, fci_percentual: 5, cobrar_iptu: false, taxa_boleto: 0 });
  R.gerarCobrancas(d, '2026-06', 'julio');
  const jun = doMes(d, c, '2026-06');
  assert.ok(jun.fci > 0);
  assert.equal(R.totais(jun).a_pagar_pontual, 0, 'a reserva cobre o aluguel e o FCI');
  assert.equal(jun.reserva_utilizada, R.totais({ ...jun, reserva_utilizada: 0 }).total_pontual);
  R.gerarCobrancas(d, '2026-07', 'julio');
  const jul = doMes(d, c, '2026-07');
  assert.equal(jul.reserva_utilizada, R.totais({ ...jul, reserva_utilizada: 0 }).total_pontual, 'o que sobra vai para julho (cobre o boleto)');
  assert.equal(R.saldoReserva(d, c), 300000 - jun.reserva_utilizada - jul.reserva_utilizada);
  // tira a reserva do contrato: o recálculo tira dos boletos em aberto
  R.atualizar(d, 'contratos', c.id, { reserva_valor: 0 }, 'julio');
  assert.equal(R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'julio'), 2, 'cada boleto conta uma vez');
  assert.deepEqual(d.cobrancas.map((x) => x.reserva_utilizada), [0, 0]);
});
