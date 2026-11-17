import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as CR from '../docs/js/config-regras.js';
import * as R from '../docs/js/regras.js';

// Mutirão 3000 (16/11/2026), frente regras e cálculos. Dados fictícios.
function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua A, 1', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, taxa_boleto: 0, multa_percentual: 2, juros_mensal_percentual: 1, cobrar_iptu: false, ...extra }, 'j');
  return { d, loja, c, ank };
}

test('[2][3] débitos da saída: a dívida em acordo entra uma vez só (pelas parcelas)', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-07', 'j'); R.gerarCobrancas(d, '2026-08', 'j');
  const ids = d.cobrancas.map((x) => x.id);
  R.fazerAcordo(d, { contrato_id: c.id, ids, total: 420000, parcelas: 2, primeiro_vencimento: '2026-11-20' }, 'j', '2026-11-16');
  const deb = R.debitosDaSaida(d, c, '2026-11-16');
  assert.equal(deb.itens.length, 2);
  assert.ok(deb.itens.every((x) => R.ehParcelaAcordo(x.cobranca)));
  assert.equal(deb.total, 420000);
});

test('[5][6] débitos da saída: vencido com multa e juros; não vencido pelo valor em dia', () => {
  const { d, c } = base({ data_entrada: '2026-01-01', data_saida: '2026-11-15' });
  R.gerarCobrancas(d, '2026-09', 'j'); R.gerarCobrancas(d, '2026-11', 'j');
  const deb = R.debitosDaSaida(d, c, '2026-11-16');
  const set = deb.itens.find((x) => x.cobranca.competencia === '2026-09');
  const nov = deb.itens.find((x) => x.cobranca.competencia === '2026-11');
  assert.equal(set.valor, C.liquidar(set.cobranca, '2026-11-16').valor_devido);
  assert.ok(set.valor > 200000, 'com multa e juros');
  assert.equal(nov.valor, R.totais(nov.cobranca).a_pagar_pontual);
});

test('[4] complemento da caução não entra nos débitos da saída', () => {
  const { d, c } = base({ garantia_tipo: 'Caução', caucao_valor: 540000, caucao_meses: 3, comprovante_caucao: 'c.pdf', caucao_data: '2025-06-07',
    caucao_pago_em: '2025-06-07', data_entrada: '2025-06-07', vigencia_inicio: '2025-06-07' });
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-06-01', indice: 'IPCA', percentual: 4.5, valor_anterior: 200000, valor_novo: 209000 }, 'j');
  const [b] = R.gerarBoletosCaucao(d, c.id, 'j', null, { vencimento: '2026-07-10' });
  assert.ok(!R.cobrancasEmAberto(d, c.id).some((x) => x.id === b.id));
  assert.equal(R.debitosDaSaida(d, c, '2026-11-16').total, 0);
});

test('[7][8] novo valor negociado recalcula os boletos em aberto do mês escolhido em diante, e a bonificação nova não volta no tempo', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-11', 'j'); R.gerarCobrancas(d, '2026-12', 'j');
  R.registrarRenovacao(d, c.id, { data: '2026-11-20', vale_desde: '2026-12', tipo: 'Novo valor negociado', novo_valor: 250000, novo_percentual: 5 }, 'j');
  const b12 = R.boletoDoMes(d, c.id, '2026-12'); const b11 = R.boletoDoMes(d, c.id, '2026-11');
  assert.equal(b12.aluguel, 250000);
  assert.equal(b12.desconto, 12500);
  assert.equal(b11.aluguel, 200000);
  R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'j');
  assert.equal(b11.desconto, 20000, 'o boleto de antes continua com 10%');
  assert.equal(b12.desconto, 12500);
  // sem o mês: a data no dia 1º vale o próprio mês; em outro dia, o seguinte
  assert.equal(R.valeDesdeDaRenovacao({ data: '2026-12-01' }), '2026-12');
  assert.equal(R.valeDesdeDaRenovacao({ data: '2026-12-15' }), '2027-01');
  // excluir a renovação devolve a bonificação de antes
  R.excluirRenovacao(d, d.renovacoes[0].id, 'j');
  assert.equal(R.percentualBonificacao(R.buscar(d, 'contratos', c.id)), 10);
});

test('[9][10] FCI dos boletos que entram no acordo continua FCI nas parcelas (fundo e fora da multa)', () => {
  const { d, c } = base({ fci_percentual: 5 });
  R.gerarCobrancas(d, '2026-07', 'j');
  const cb = d.cobrancas[0];
  assert.ok(cb.fci > 0);
  const { parcelas } = R.fazerAcordo(d, { contrato_id: c.id, ids: [cb.id], total: R.totais(cb).a_pagar_sem_desconto, parcelas: 1, primeiro_vencimento: '2026-11-20' }, 'j', '2026-11-16');
  const p = parcelas[0];
  assert.equal(p.fci, cb.fci);
  assert.equal(R.totais(p).a_pagar_sem_desconto, R.totais(cb).a_pagar_sem_desconto);
  assert.equal(R.totais(p).base_multa, R.totais(p).a_pagar_sem_desconto - cb.fci);
  R.registrarPagamento(d, p.id, '2026-11-20', null, 'j', { pagouEmDia: true });
  assert.equal(R.saldoFci(d, c).total, cb.fci);
});

test('[11] índice negativo: o aluguel fica igual', () => {
  const { d, c } = base({ data_entrada: '2025-06-07', vigencia_inicio: '2025-06-07', indice_correcao: 'IGP-M' });
  R.inserir(d, 'indices_acumulados', { indice: 'IGP-M', mes_ref: '2026-05', percentual: -1.5 }, 'j');
  const r = R.calcularReajuste(d, c, '2026-06');
  assert.equal(r.percentual, 0);
  assert.equal(r.novo, 200000);
  assert.equal(r.indiceNegativo, -1.5);
  const x = R.aplicarReajuste(d, c.id, '2026-06', 'j');
  assert.equal(x.percentual_indice, -1.5);
  assert.equal(R.aluguelAtual(d, c, '2026-07-01'), 200000);
});

test('[12] índice acumulado velho não é usado: fica faltando', () => {
  const { d, c } = base({ data_entrada: '2025-06-07', vigencia_inicio: '2025-06-07', indice_correcao: 'IPCA' });
  R.inserir(d, 'indices_acumulados', { indice: 'IPCA', mes_ref: '2025-05', percentual: 5.32 }, 'j');
  const r = R.calcularReajuste(d, c, '2026-06');
  assert.equal(r.percentual, null);
  assert.deepEqual(r.faltando, ['IPCA']);
  assert.equal(r.usados[0].ultimo.mes_ref, '2025-05');
});

test('[40] boleto pago de mês depois da saída gera aviso', () => {
  const { d, c } = base({ data_entrada: '2026-01-01' });
  for (const m of ['2026-10', '2026-11']) { R.gerarCobrancas(d, m, 'j'); const cb = R.boletoDoMes(d, c.id, m); R.registrarPagamento(d, cb.id, '2026-11-05', null, 'j', { pagouEmDia: true }); }
  R.informarSaida(d, c.id, '2026-10-15', 'j', '2026-11-16');
  assert.ok(R.alertasBoletosSemOcupacao(d).some((a) => /11\/2026 foi pago/.test(a.texto)));
});

test('[46][47] acordo e complemento da caução não geram boleto de R$ 0,00', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-07', 'j');
  assert.throws(() => R.fazerAcordo(d, { contrato_id: c.id, ids: [d.cobrancas[0].id], total: 2, parcelas: 3, primeiro_vencimento: '2026-11-20' }, 'j', '2026-11-16'), C.ErroUsuario);
  const b = base({ garantia_tipo: 'Caução', caucao_valor: 539998, caucao_meses: 3, comprovante_caucao: 'c.pdf', caucao_data: '2025-06-07', caucao_pago_em: '2025-06-07', data_entrada: '2025-06-07', vigencia_inicio: '2025-06-07' });
  R.inserir(b.d, 'correcoes', { contrato_id: b.c.id, data_vigencia: '2026-06-01', indice: 'IPCA', percentual: 0, valor_anterior: 200000, valor_novo: 200000 }, 'j');
  assert.throws(() => R.gerarBoletosCaucao(b.d, b.c.id, 'j', null, { parcelas: 3 }), C.ErroUsuario);
});

test('[50] data inexistente não é válida', () => {
  assert.equal(C.dataValida('2026-02-31'), '');
  assert.equal(C.dataValida('2026-02-28'), '2026-02-28');
  assert.equal(C.dataValida('2028-02-29'), '2028-02-29');
  CR.usarRegras(null);
});
