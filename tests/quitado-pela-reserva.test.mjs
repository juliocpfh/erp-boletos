import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

// Boleto do aluguel quitado inteiro pela reserva (decisão do dono, 25/11/2026). Dados fictícios.
// Aluguel R$ 2.000,00 com 10% de bonificação (R$ 1.800,00 em dia) e reserva de R$ 2.000,00: julho quitado pela reserva,
// sobram R$ 200,00 para agosto (R$ 1.600,00 a pagar).
function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua A, 1', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-07-01', vigencia_inicio: '2026-07-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: false,
    desconto_pontualidade_percentual: 10, taxa_boleto: 0, multa_percentual: 2, juros_mensal_percentual: 1, cobrar_iptu: false,
    reserva_valor: 200000, reserva_data: '2026-06-20', ...extra }, 'j');
  return { d, c };
}

test('reserva que cobre o boleto inteiro: "Quitado pela reserva", fora de a cobrar, multa, notificação e banco', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-07', 'j');
  R.gerarCobrancas(d, '2026-08', 'j');
  const jul = R.boletoDoMes(d, c.id, '2026-07');
  const ago = R.boletoDoMes(d, c.id, '2026-08');
  assert.equal(jul.reserva_utilizada, 180000);
  assert.equal(R.totais(jul).a_pagar_pontual, 0);
  assert.equal(jul.situacao, 'Quitado pela reserva');
  assert.ok(R.cobertoPelaReserva(jul) && R.quitadoPelaReserva(jul));
  assert.equal(R.aCobrar(jul), false);
  // agosto: sobram R$ 200,00 da reserva, R$ 1.600,00 a pagar, em aberto
  assert.equal(ago.reserva_utilizada, 20000);
  assert.equal(R.totais(ago).a_pagar_pontual, 160000);
  assert.equal(ago.situacao, 'Em aberto');
  assert.equal(R.aCobrar(ago), true);
  // passado o vencimento: não é atraso, não tem 2ª via, não vai ao banco
  assert.equal(R.boletosEmAtraso(d, c.id, '2026-07-25').some((x) => x.id === jul.id), false);
  assert.equal(R.segundaVia(d, jul, '2026-07-25'), null);
  assert.throws(() => R.pedidoBoletoC6(d, jul, { id: 1 }), /quitado em dia/);
  // nada de NF antes de registrar a quitação (como antes)
  assert.equal(R.pendentesDeFatura(d).some((p) => p.registro.id === jul.id), false);
});

test('registrar a quitação dá a NF do aluguel em dia, sem multa, mesmo depois do vencimento; desfazer volta ao quitado', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-07', 'j');
  const jul = R.boletoDoMes(d, c.id, '2026-07');
  R.registrarPagamento(d, jul.id, '2026-07-20', null, 'j');
  const pago = R.buscar(d, 'cobrancas', jul.id);
  assert.equal(pago.situacao, 'Quitado pela reserva');
  assert.equal(pago.valor_pago, 0);
  assert.equal(pago.multa, 0);
  assert.equal(pago.juros, 0);
  assert.equal(pago.valor_nf, 180000);
  assert.equal(pago.pagou_em_dia, false);
  assert.ok(R.quitadoPelaReserva(pago));
  assert.ok(R.pendentesDeFatura(d).some((p) => p.registro.id === jul.id));
  R.estornarPagamento(d, jul.id, 'j');
  const volta = R.buscar(d, 'cobrancas', jul.id);
  assert.equal(volta.data_pagamento, null);
  assert.equal(volta.situacao, 'Quitado pela reserva');
});

test('desfazer a reserva volta o boleto ao normal (em aberto, a cobrar)', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-07', 'j');
  const jul = R.boletoDoMes(d, c.id, '2026-07');
  assert.equal(jul.situacao, 'Quitado pela reserva');
  R.atualizar(d, 'contratos', c.id, { reserva_valor: 50000 }, 'j');
  R.realocarReserva(d, R.buscar(d, 'contratos', c.id), 'j');
  let x = R.buscar(d, 'cobrancas', jul.id);
  assert.equal(x.reserva_utilizada, 50000);
  assert.equal(x.situacao, 'Em aberto');
  assert.equal(R.aCobrar(x), true);
  assert.equal(R.totais(x).a_pagar_pontual, 130000);
  R.atualizar(d, 'contratos', c.id, { reserva_valor: 200000 }, 'j');
  R.realocarReserva(d, R.buscar(d, 'contratos', c.id), 'j');
  x = R.buscar(d, 'cobrancas', jul.id);
  assert.equal(x.situacao, 'Quitado pela reserva');
});

test('banco antigo: boleto "Em aberto" com R$ 0,00 a pagar pela reserva vira "Quitado pela reserva" no normalizar', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-07', 'j');
  const jul = R.boletoDoMes(d, c.id, '2026-07');
  jul.situacao = 'Em aberto';
  R.normalizar(d);
  assert.equal(R.boletoDoMes(d, c.id, '2026-07').situacao, 'Quitado pela reserva');
});

test('no vencimento a quitação pela reserva é registrada sozinha, com a data do vencimento, uma vez só', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-07', 'j');
  R.gerarCobrancas(d, '2026-08', 'j');
  const jul = R.boletoDoMes(d, c.id, '2026-07');
  // antes do vencimento (10/07): nada
  assert.deepEqual(R.registrarQuitacoesPelaReserva(d, '2026-07-09', 'sistema'), []);
  assert.equal(R.buscar(d, 'cobrancas', jul.id).data_pagamento, null);
  // no dia ou depois: registrada com a data do vencimento, NF do aluguel em dia na fila; agosto (R$ 1.600,00 a pagar) não entra
  const feitos = R.registrarQuitacoesPelaReserva(d, '2026-07-15', 'sistema');
  assert.deepEqual(feitos.map((x) => x.id), [jul.id]);
  const x = R.buscar(d, 'cobrancas', jul.id);
  assert.equal(x.data_pagamento, '2026-07-10');
  assert.equal(x.situacao, 'Quitado pela reserva');
  assert.equal(x.valor_nf, 180000);
  assert.equal(x.multa, 0);
  assert.ok(R.pendentesDeFatura(d).some((p) => p.registro.id === jul.id && p.data === '2026-07-10'));
  // de novo (outra aba, outro aparelho, outra abertura): nada mais
  assert.deepEqual(R.registrarQuitacoesPelaReserva(d, '2026-08-20', 'sistema'), []);
  assert.equal(d.cobrancas.filter((cb) => cb.data_pagamento).length, 1);
});
