import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as A from '../docs/js/alertas.js';

test('converte valores digitados em centavos', () => {
  assert.equal(C.centavos('1.234,56'), 123456);
  assert.equal(C.centavos('R$ 1.350,00'), 135000);
  assert.equal(C.centavos('1350.5'), 135050);
  assert.equal(C.centavos(''), 0);
  assert.equal(C.numero('8,5%'), 8.5);
  assert.throws(() => C.centavos('abc'));
  assert.equal(C.reais(123456), 'R$ 1.234,56');
});

test('aluguel proporcional: entrou dia 7 num mês de 30 dias', () => {
  const dias = C.diasOcupados('2026-06', '2026-06-07');
  assert.equal(dias, 24);
  assert.equal(C.aluguelProporcional(150000, dias, 30), 120000);
  assert.equal(C.diasOcupados('2026-07', '2025-01-01', '2026-07-10'), 10);
  assert.equal(C.diasOcupados('2026-08', '2025-01-01', '2026-07-10'), 0);
  assert.deepEqual(C.periodoServico('2026-06', '2026-06-07'), ['2026-06-07', '2026-06-30']);
});

test('desconto em % e em R$ andam juntos', () => {
  assert.equal(C.descontoPorPercentual(135000, 10), 13500);
  assert.equal(C.percentualPorDesconto(135000, 13500), 10);
});

test('parcelas somam o total e a sobra fica na primeira', () => {
  assert.deepEqual(C.parcelas(100000, 3), [33334, 33333, 33333]);
  assert.deepEqual(C.parcelaNaCompetencia(100000, 10, '2026-02', '2026-11'), [10, 10000]);
  assert.deepEqual(C.parcelaNaCompetencia(100000, 10, '2026-02', '2026-12'), [null, 0]);
});

test('competências, vencimento e aniversário', () => {
  assert.equal(C.somarMeses('2026-12', 1), '2027-01');
  assert.equal(C.vencimentoDaCompetencia('2026-07', 10), '2026-08-10');
  assert.equal(C.vencimentoDaCompetencia('2026-07', 10, false), '2026-07-10');
  assert.equal(C.vencimentoDaCompetencia('2026-01', 31), '2026-02-28');
  assert.equal(C.somarAnos('2024-02-29', 1), '2025-02-28');
});

test('correção e aluguel vigente', () => {
  assert.equal(C.aplicarCorrecao(135000, 4.5), 141075);
  const hist = [{ data_vigencia: '2026-03-01', valor_novo: 141075 }];
  assert.equal(C.aluguelVigente(135000, hist, '2026-02-28'), 135000);
  assert.equal(C.aluguelVigente(135000, hist, '2026-03-01'), 141075);
});

test('cobrança do mês de entrada com IPTU, seguro e taxa', () => {
  const r = C.calcularCobranca({ competencia: '2026-06', aluguelMensal: 150000, entrada: '2026-06-07',
    descontoPercentual: 10, iptu: 8000, seguro: 2550, taxaBoleto: 350 });
  assert.equal(r.aluguel, 120000);
  assert.equal(r.desconto, 12000);
  assert.equal(r.total_sem_desconto, 130900);
  assert.equal(r.a_pagar_pontual, 118900);
});

test('reserva abate a cobrança sem passar do valor', () => {
  const r = C.calcularCobranca({ competencia: '2026-07', aluguelMensal: 20000, entrada: '2026-01-01', reservaDisponivel: 30000 });
  assert.equal(r.reserva_utilizada, 20000);
  assert.equal(r.a_pagar_pontual, 0);
});

test('multa e juros separados, pro rata dia', () => {
  assert.deepEqual(C.multaEJuros(100000, '2026-08-10', '2026-08-25', 10, 1), { dias: 15, multa: 10000, juros: 500 });
  assert.deepEqual(C.multaEJuros(100000, '2026-08-10', '2026-08-10', 10, 1), { dias: 0, multa: 0, juros: 0 });
});

test('liquidação e valor da nota fiscal', () => {
  const cb = { aluguel: 135000, desconto: 13500, iptu: 10000, seguro: 3000, taxa_boleto: 500, outros: 0,
    reserva_utilizada: 0, vencimento: '2026-08-10', multa_percentual: 10, juros_mensal_percentual: 1 };
  const emDia = C.liquidar(cb, '2026-08-10');
  assert.equal(emDia.valor_devido, 135000);
  assert.equal(emDia.valor_nf, 121500);
  const atraso = C.liquidar(cb, '2026-08-20');
  assert.equal(atraso.multa, 14850);
  assert.equal(atraso.juros, 495);
  assert.equal(atraso.valor_devido, 148500 + 14850 + 495);
  assert.equal(atraso.valor_nf, 135000 + 14850 + 495);
});

test('divisão da fatura entre as empresas', () => {
  assert.deepEqual(C.dividir(135000, [50, 50]), [67500, 67500]);
  assert.deepEqual(C.dividir(121501, [50, 50]), [60751, 60750]);
});

test('alertas de correção, seguro e reserva', () => {
  assert.equal(A.alertaCorrecao('2025-11-01', '2026-09-15', []), null);
  assert.equal(A.alertaCorrecao('2025-11-01', '2026-10-05', []).nivel, 'aviso');
  assert.equal(A.alertaCorrecao('2025-11-01', '2026-11-20', []).nivel, 'perigo');
  assert.equal(A.alertaCorrecao('2025-11-01', '2026-11-20', ['2026-11-01']), null);
  assert.match(A.alertaSeguro('2025-11-01', '2026-10-05', [{ vigencia_fim: '2026-10-31' }]).texto, /vence/);
  assert.equal(A.alertaSeguro('2025-03-01', '2026-10-05', [{ vigencia_fim: '2027-03-01' }]), null);
  assert.match(A.alertaReserva(50000, 50000, '2026-11', '2026-10-05').texto, /500,00.*11\/2026/);
  assert.equal(A.alertaReserva(50000, 0, '2026-11', '2026-10-05'), null);
});
