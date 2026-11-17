// Banco 19 (decisão do dono, 17/11/2026): o inquilino pagou a mais e a empresa devolve a diferença. A devolução fica ligada ao boleto,
// o valor pago dele volta ao devido e a NF não muda. E a decisão do mesmo dia: só o identificador igual liga (end_to_end_id do Pix).
// Dados fictícios (CPF 529.982.247-25, CNPJ 11.222.333/0001-81), valores em centavos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as R from '../docs/js/regras.js';
import * as Z from '../docs/js/conciliacao.js';
import * as M from '../docs/js/mapa-c6.js';

function base({ reserva = 0 } = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua A, 117', cidade: 'Curitiba', uf: 'PR', cep: '80000-000', bairro: 'Centro' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { inquilino_cpf: '529.982.247-25', data_entrada: '2026-09-01', vigencia_inicio: '2026-09-01', aluguel_inicial: 200000, dia_vencimento: 10,
    cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 0, taxa_boleto: 0, multa_percentual: 10, juros_mensal_percentual: 1, imovel_id: loja.id, inquilino_nome: 'Ana Teste', reserva_valor: reserva }, 'j');
  d.config_banco = { ativo: true, provedor: 'c6', conta_padrao_id: 'ank', contas: [{ id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox' }] };
  R.normalizar(d);
  R.gerarCobrancas(d, '2026-09', 'j');
  R.gerarCobrancas(d, '2026-10', 'j');
  return { d, c, loja, cb9: d.cobrancas.find((x) => x.competencia === '2026-09'), cb: d.cobrancas.find((x) => x.competencia === '2026-10') };
}
const E2E_1 = 'E33600000202611100930ANATESTE001';
const E2E_2 = 'E33600000202611101015ANATESTE002';
const pix = (ref, data, valor, e2e, extra = {}) => ({ reference: ref, entry_date: data, created_at: `${data}T10:00:00`, amount: (valor / 100).toFixed(2), operation_type: 'INCOMING',
  transaction_type: 'CREDIT_PIX_PAYMENT_RECEIVED', title: 'Pix Recebido', description: 'PIX RECEBIDO ANA TESTE', end_to_end_id: e2e, ...extra });
const devolucao = (ref, data, valor, e2e) => ({ reference: ref, entry_date: data, created_at: `${data}T15:00:00`, amount: (valor / 100).toFixed(2), operation_type: 'OUTGOING',
  transaction_type: M.EXTRATO_TIPOS.devolucao_enviada, title: 'Devolução Pix', description: 'DEVOLUCAO PIX ANA TESTE', ...(e2e ? { end_to_end_id: e2e } : {}) });

/** O exemplo do dono: boleto de 10/2026 de R$ 2.000,00 pago duas vezes; devolvidos R$ 2.000,00 por Pix. */
function pagoDuasVezes() {
  const x = base();
  const { d, cb } = x;
  assert.equal(R.totais(cb).a_pagar_pontual, 200000);
  const { novas: [p1, p2] } = Z.importarExtrato(d, 'ank', [pix('a1', '2026-11-10', 200000, E2E_1), pix('a2', '2026-11-10', 200000, E2E_2)], 'j', { hoje: '2026-11-20' });
  Z.vincularMovimentacao(d, p1.id, { classificacao: 'boleto', cobranca_id: cb.id }, 'j');
  return { ...x, p1, p2 };
}

test('exemplo do dono: pago duas vezes (R$ 4.000,00, NF R$ 2.000,00), devolução de R$ 2.000,00 → boleto com R$ 2.000,00 pagos, devolução ligada, NF igual', () => {
  const { d, cb, p1, p2, loja } = pagoDuasVezes();
  assert.deepEqual([cb.valor_pago, cb.valor_nf, cb.movimentacao_id], [200000, 200000, p1.id]);
  // o 2º Pix: sem o código do boleto não é proposto sozinho; o usuário escolhe "pagou de novo (a mais)"
  const s2 = Z.sugerirDestino(d, p2);
  assert.equal((s2 || {}).cobranca_id ?? null, null);
  assert.throws(() => Z.vincularMovimentacao(d, p2.id, { classificacao: 'boleto', cobranca_id: cb.id }, 'j'), /pagou de novo \(a mais\)/);
  const r2 = Z.vincularMovimentacao(d, p2.id, { classificacao: 'boleto', cobranca_id: cb.id, pago_a_mais: true }, 'j');
  assert.equal(r2.aMais, true);
  assert.deepEqual([cb.valor_pago, cb.valor_a_mais, cb.valor_nf, R.devidoDoPago(cb), R.pagoAMaisDo(cb)], [400000, 200000, 200000, 200000, 200000]);
  assert.deepEqual([R.buscar(d, 'movimentacoes_banco', p2.id).classificacao, R.buscar(d, 'movimentacoes_banco', p2.id).pago_a_mais], ['boleto', true]);
  // a devolução enviada traz o end_to_end_id do Pix devolvido: proposta pronta (o usuário confirma)
  const { novas: [dv] } = Z.importarExtrato(d, 'ank', [devolucao('d1', '2026-11-12', 200000, E2E_2)], 'j', { hoje: '2026-11-20' });
  const s = Z.sugerirDestino(d, dv);
  assert.deepEqual([s.classificacao, s.cobranca_id, s.imovel_id, s.confianca, s.peloId], ['devolucao_inquilino', cb.id, loja.id, 'alta', true]);
  assert.match(s.motivo, /recebido R\$ 4\.000,00, devido R\$ 2\.000,00/);
  const nfAntes = JSON.stringify(d.faturas);
  const r = Z.vincularMovimentacao(d, dv.id, { classificacao: s.classificacao, cobranca_id: s.cobranca_id }, 'j');
  assert.deepEqual([r.devolvido, r.antes, r.novo, r.devido], [true, 400000, 200000, 200000]);
  assert.deepEqual([cb.valor_pago, cb.valor_devolvido, cb.valor_nf, cb.situacao], [200000, 200000, 200000, 'Paga em dia'], 'volta ao devido; a NF não muda');
  assert.equal(JSON.stringify(d.faturas), nfAntes, 'nenhuma NF mexida');
  const m = R.buscar(d, 'movimentacoes_banco', dv.id);
  assert.deepEqual([m.classificacao, m.cobranca_id, m.imovel_id], ['devolucao_inquilino', cb.id, loja.id]);
  assert.equal(Z.descreverDestino(d, m), 'Devolução ao inquilino · Loja 1 · boleto 10/2026 · Ana Teste');
  assert.match(R.rotuloDoComprovante(d, m), /devolução a Ana Teste \(boleto 10\/2026\)/);
  assert.match(Z.nomeComprovante(d, m), /Devolucao Ana Teste/);
  assert.ok(d.historico.some((h) => h.tabela === 'cobrancas' && /Devolução ao inquilino de R\$ 2\.000,00.*R\$ 4\.000,00 → R\$ 2\.000,00.*A NF não muda/.test(h.descricao || h.detalhes || JSON.stringify(h))));
});

test('devolução que deixaria o pago abaixo do devido: pergunta antes (nada gravado); confirmada, grava e registra no histórico', () => {
  const { d, cb, p2 } = pagoDuasVezes();
  Z.vincularMovimentacao(d, p2.id, { classificacao: 'boleto', cobranca_id: cb.id, pago_a_mais: true }, 'j');
  const { novas: [dv] } = Z.importarExtrato(d, 'ank', [devolucao('d1', '2026-11-12', 250000, null)], 'j', { hoje: '2026-11-20' });
  const r = Z.vincularMovimentacao(d, dv.id, { classificacao: 'devolucao_inquilino', cobranca_id: cb.id }, 'j');
  assert.deepEqual([r.abaixoDoDevido, r.antes, r.novo, r.devido], [true, 400000, 150000, 200000]);
  assert.deepEqual([cb.valor_pago, R.buscar(d, 'movimentacoes_banco', dv.id).classificacao], [400000, null], 'nada gravado');
  Z.vincularMovimentacao(d, dv.id, { classificacao: 'devolucao_inquilino', cobranca_id: cb.id, abaixoDoDevido: true }, 'j');
  assert.equal(cb.valor_pago, 150000);
  assert.ok(d.historico.some((h) => /ABAIXO do devido/.test(JSON.stringify(h))));
  // maior que o recebido: recusa
  const { novas: [dv2] } = Z.importarExtrato(d, 'ank', [devolucao('d2', '2026-11-13', 900000, null)], 'j', { hoje: '2026-11-20' });
  assert.throws(() => Z.vincularMovimentacao(d, dv2.id, { classificacao: 'devolucao_inquilino', cobranca_id: cb.id, abaixoDoDevido: true }, 'j'), /maior que o recebido/);
});

test('desfazer: a devolução volta o pago; o pagamento a mais só sai depois da devolução; desfazer o pagamento solta tudo', () => {
  const { d, cb, p1, p2 } = pagoDuasVezes();
  Z.vincularMovimentacao(d, p2.id, { classificacao: 'boleto', cobranca_id: cb.id, pago_a_mais: true }, 'j');
  const { novas: [dv] } = Z.importarExtrato(d, 'ank', [devolucao('d1', '2026-11-12', 200000, E2E_2)], 'j', { hoje: '2026-11-20' });
  Z.vincularMovimentacao(d, dv.id, { classificacao: 'devolucao_inquilino', cobranca_id: cb.id }, 'j');
  assert.throws(() => Z.desvincularMovimentacao(d, p2.id, 'j'), /desfaça antes o destino da devolução/);
  assert.throws(() => Z.desvincularMovimentacao(d, p1.id, 'j'), /Desfazer pagamento/, 'o pagamento em si desfaz-se pelo boleto');
  Z.desvincularMovimentacao(d, dv.id, 'j');
  assert.deepEqual([cb.valor_pago, cb.valor_devolvido, R.buscar(d, 'movimentacoes_banco', dv.id).classificacao], [400000, null, null]);
  Z.desvincularMovimentacao(d, p2.id, 'j');
  assert.deepEqual([cb.valor_pago, cb.valor_a_mais, R.buscar(d, 'movimentacoes_banco', p2.id).pago_a_mais], [200000, null, false]);
  // de novo: a mais + devolução, e "Desfazer pagamento" do boleto deixa as três linhas sem destino
  Z.vincularMovimentacao(d, p2.id, { classificacao: 'boleto', cobranca_id: cb.id, pago_a_mais: true }, 'j');
  Z.vincularMovimentacao(d, dv.id, { classificacao: 'devolucao_inquilino', cobranca_id: cb.id }, 'j');
  R.estornarPagamento(d, cb.id, 'j');
  assert.deepEqual([cb.valor_pago, cb.valor_a_mais, cb.valor_devolvido], [null, null, null]);
  assert.deepEqual([p1, p2, dv].map((m) => R.buscar(d, 'movimentacoes_banco', m.id).classificacao), [null, null, null]);
  assert.equal(R.buscar(d, 'movimentacoes_banco', p2.id).pago_a_mais, false);
});

test('sem o end_to_end_id do Pix devolvido: só o aviso, o usuário escolhe o boleto (candidatos pelo que foi pago a mais, nada marcado)', () => {
  const { d, cb, p2 } = pagoDuasVezes();
  Z.vincularMovimentacao(d, p2.id, { classificacao: 'boleto', cobranca_id: cb.id, pago_a_mais: true }, 'j');
  const { novas: [dv] } = Z.importarExtrato(d, 'ank', [devolucao('d1', '2026-11-12', 200000, null)], 'j', { hoje: '2026-11-20' });
  const s = Z.sugerirDestino(d, dv);
  assert.deepEqual([s.classificacao, s.cobranca_id, s.candidatos, s.semIdentificacao, s.confianca], ['devolucao_inquilino', null, [cb.id], true, 'baixa']);
  assert.match(s.motivo, /escolha à mão o boleto/);
  // o Pix devolvido ainda sem destino: o aviso pede para ligá-lo antes ao boleto
  const x = pagoDuasVezes();
  const { novas: [dv2] } = Z.importarExtrato(x.d, 'ank', [devolucao('d1', '2026-11-12', 200000, E2E_2)], 'j', { hoje: '2026-11-20' });
  const s2 = Z.sugerirDestino(x.d, dv2);
  assert.deepEqual([s2.classificacao, s2.cobranca_id], ['devolucao_inquilino', null]);
  assert.match(s2.motivo, /ainda não tem destino/);
  // devolução recebida (o dinheiro voltou para nós) continua "Devolução de Pix ou estorno"; entrada nunca é devolução ao inquilino
  const { novas: [volta] } = Z.importarExtrato(d, 'ank', [{ ...pix('v1', '2026-11-14', 5000, null), transaction_type: M.EXTRATO_TIPOS.devolucao_recebida, description: 'DEVOLUCAO PIX RECEBIDA' }], 'j', { hoje: '2026-11-20' });
  assert.equal(Z.sugerirDestino(d, volta).classificacao, 'devolucao');
  assert.throws(() => Z.vincularMovimentacao(d, volta.id, { classificacao: 'devolucao_inquilino', cobranca_id: cb.id }, 'j'), /entrada no extrato não pode ser devolução ao inquilino/);
});

test('reserva não muda: a devolução da reserva (ficha reprovada) é lembrada e não passa por boleto; o boleto com reserva abatida tem o devido sem ela', () => {
  const { d, cb9: cb } = base({ reserva: 50000 });
  // reserva aprovada: abatida no 1º aluguel, NF com o aluguel cheio
  assert.equal(cb.reserva_utilizada, 50000);
  const pontual = R.totais(cb).a_pagar_pontual;
  assert.equal(pontual, 150000);
  R.registrarPagamento(d, cb.id, cb.vencimento, 200000, 'j', { valorNf: 200001, justificativa: 'pagou sem descontar a reserva' });
  assert.deepEqual([R.devidoDoPago(cb), R.pagoAMaisDo(cb)], [150000, 50000], 'pagou R$ 2.000,00 sem descontar a reserva: R$ 500,00 a mais');
  // ficha reprovada de outra pessoa com reserva de R$ 500,00 a devolver: a devolução sem código lembra a reserva
  R.inserir(d, 'fichas', { inquilino_nome: 'Bruno Teste', situacao: 'Reprovada', reserva_valor: 50000 }, 'j');
  const { novas: [dv] } = Z.importarExtrato(d, 'ank', [devolucao('d1', '2026-11-12', 50000, null)], 'j', { hoje: '2026-11-20' });
  const s = Z.sugerirDestino(d, dv);
  assert.equal(s.cobranca_id, null, 'nada escolhido sozinho');
  assert.match(s.motivo, /devolução da reserva de Bruno Teste/);
  // escolhida "Devolução de Pix ou estorno" (a reserva se registra na ficha): o boleto não muda
  Z.vincularMovimentacao(d, dv.id, { classificacao: 'devolucao' }, 'j');
  assert.deepEqual([cb.valor_pago, cb.valor_devolvido ?? null], [200000, null]);
});

test('mapa do C6: os tipos de devolução do extrato estão no mapa (igual no site e na ponte)', () => {
  assert.deepEqual(M.EXTRATO_TIPOS, { devolucao_enviada: 'DEBIT_PIX_DEVOLUTION_SENT', devolucao_recebida: 'CREDIT_PIX_DEVOLUTION_RECEIVED', estorno: 'PAYMENT_REVERSAL' });
  assert.equal(fs.readFileSync(new URL('../docs/js/mapa-c6.js', import.meta.url), 'utf8'), fs.readFileSync(new URL('../ponte-c6/mapa-c6.mjs', import.meta.url), 'utf8'));
  assert.ok(Z.ehDevolucaoEnviada({ tipo: 'saida', categoria_banco: 'DEBIT_PIX_DEVOLUTION_SENT', descricao: 'Pix' }));
  assert.ok(!Z.ehDevolucaoEnviada({ tipo: 'entrada', categoria_banco: 'CREDIT_PIX_DEVOLUTION_RECEIVED' }));
});
