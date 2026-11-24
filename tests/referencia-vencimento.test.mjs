// Campos de mês que escolhem um boleto mostram referência e vencimento juntos (pedido do dono de 24/11/2026).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as A from '../docs/js/alertas.js';
import * as F from '../docs/js/formularios.js';
import * as R from '../docs/js/regras.js';

test('referência e vencimento: pelo cadastro, pelo boleto gerado e no próprio mês', () => {
  const d = R.bancoVazio();
  const c = R.inserir(d, 'contratos', { inquilino_nome: 'Maria Exemplo', data_entrada: '2026-06-07', dia_vencimento: 10, cobranca_mes_seguinte: true }, 'teste');
  assert.equal(R.referenciaEVencimento(d, c, '2026-11'), 'Referência 11/2026 – vence 10/12/2026');
  // contrato ainda no formulário (sem id), vence no próprio mês
  assert.equal(R.referenciaEVencimento(d, { dia_vencimento: 5, cobranca_mes_seguinte: false }, '2026-11'), 'Referência 11/2026 – vence 05/11/2026');
  // boleto já gerado com outro vencimento: vale o do boleto
  d.cobrancas.push({ id: 99, contrato_id: c.id, competencia: '2026-11', vencimento: '2026-12-14' });
  assert.equal(R.referenciaEVencimento(d, c, '2026-11'), 'Referência 11/2026 – vence 14/12/2026');
  assert.equal(R.referenciaEVencimento(d, c, ''), '');
  assert.equal(R.referenciaEVencimento(d, c, '11/2026'), '');
});

test('alerta da reserva diz o vencimento do boleto', () => {
  assert.match(A.alertaReserva(50000, 50000, '2026-11', '2026-10-05', '2026-12-10').texto, /referência 11\/2026 \(vence 10\/12\/2026\)/);
  assert.match(A.alertaReserva(50000, 50000, '2026-11', '2026-10-05').texto, /referência 11\/2026\.$/);
});

test('os campos de mês do boleto dizem que é o mês de referência e mostram o boleto abaixo', () => {
  const campos = [...F.CONTRATO, ...F.RENOVACAO];
  for (const nome of ['reserva_competencia', 'carencia_inicio', 'vale_desde']) {
    const c = campos.find((x) => x.nome === nome);
    assert.match(c.rotulo, /mês de referência/, nome);
    assert.ok(c.autoMsg, `${nome} sem a linha do boleto`);
  }
});
