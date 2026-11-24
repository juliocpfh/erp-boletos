import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as R from '../docs/js/regras.js';

// Conferência dos boletos de 24/11/2026 (item A5): o que entra e sai do boleto, na ordem em que a equipe faz as coisas
// (lançar antes ou depois de gerar, editar, excluir). Dados fictícios (CPF e CNPJ de teste). Relatório em
// documentacao/CONFERENCIA_BOLETOS_24_11.md.
function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', complemento: '', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-03-01', vigencia_inicio: '2026-03-01', prazo_meses: 30, aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, multa_percentual: 10, juros_mensal_percentual: 1, taxa_boleto: 350, cobrar_iptu: true,
    conta_seguro: 'Por conta do inquilino', ...extra }, 'j');
  return { d, loja, c, boleto: (m) => R.boletoDoMes(d, c.id, m) };
}
// o que a tela faz ao salvar seguro ou IPTU (CADASTROS.*.recalcular): recalcula os boletos em aberto
const recalcular = (d, c) => R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'j');

test('aluguel cheio, bonificação e tarifa: R$ 2.000,00 − 10% + R$ 3,50', () => {
  const { d, boleto } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  const cb = boleto('2026-11');
  assert.deepEqual([cb.aluguel, cb.desconto, cb.taxa_boleto, cb.vencimento], [200000, 20000, 350, '2026-12-10']);
  assert.equal(R.totais(cb).a_pagar_pontual, 180350);
  assert.equal(R.totais(cb).a_pagar_sem_desconto, 200350);
});

test('proporcional pelo mês comercial de 30 dias: entrada em 15/02 = 16/30; saída em 20/11 = 20/30', () => {
  const { d, c, boleto } = base({ data_entrada: '2027-02-15', vigencia_inicio: '2027-02-15' });
  R.gerarCobrancas(d, '2027-02', 'j');
  const fev = boleto('2027-02');
  assert.deepEqual([fev.dias_cobrados, fev.dias_mes], [16, 30]);
  assert.equal(fev.aluguel, Math.round(200000 * 16 / 30));
  assert.equal(C.diasComerciais('2026-11', '2026-03-01', '2026-11-20'), 20);
  R.atualizar(d, 'contratos', c.id, { data_saida: '2027-03-20' }, 'j');
  R.gerarCobrancas(d, '2027-03', 'j');
  assert.deepEqual([boleto('2027-03').dias_cobrados, boleto('2027-03').dias_mes], [20, 30]);
});

test('seguro lançado DEPOIS de gerar o boleto entra pelo recálculo (o que a tela faz ao salvar a apólice)', () => {
  const { d, c, boleto } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  const cb = boleto('2026-11');
  assert.equal(cb.seguro, 0);
  R.inserir(d, 'seguros', { contrato_id: c.id, imovel_id: c.imovel_id, vigencia_inicio: '2026-11-01', vigencia_fim: '2027-10-31', valor_total: 36000, num_parcelas: 12, primeira_competencia: '2026-11' }, 'j');
  recalcular(d, c);
  assert.deepEqual([cb.seguro, cb.seguro_parcela], [3000, 'Seguro parc. 1/12']);
  // primeira parcela para o mês seguinte: não entra em 11/2026
  const s = d.seguros[0];
  R.atualizar(d, 'seguros', s.id, { primeira_competencia: '2026-12' }, 'j');
  recalcular(d, c);
  assert.equal(cb.seguro, 0);
  R.gerarCobrancas(d, '2026-12', 'j');
  assert.equal(boleto('2026-12').seguro, 3000);
});

test('seguro: contrato com "Incluso no aluguel" (cobrar_seguro falso) não cobra; boleto pago não muda', () => {
  const { d, c, boleto } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  R.registrarPagamento(d, boleto('2026-11').id, '2026-12-05', null, 'j', { pagouEmDia: true });
  R.inserir(d, 'seguros', { contrato_id: c.id, imovel_id: c.imovel_id, vigencia_inicio: '2026-11-01', vigencia_fim: '2027-10-31', valor_total: 36000, num_parcelas: 12, primeira_competencia: '2026-11' }, 'j');
  recalcular(d, c);
  assert.equal(boleto('2026-11').seguro, 0, 'pago fica como foi pago');
  R.atualizar(d, 'contratos', c.id, { cobrar_seguro: false }, 'j');
  R.gerarCobrancas(d, '2026-12', 'j');
  assert.equal(boleto('2026-12').seguro, 0);
});

test('IPTU lançado depois de gerar entra pelo recálculo; no mês da saída é proporcional aos dias reais', () => {
  const { d, c, loja, boleto } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  R.inserir(d, 'iptus', { imovel_id: loja.id, ano: 2026, valor_total: 100000, num_parcelas: 10, primeira_competencia: '2026-02' }, 'j');
  recalcular(d, c);
  assert.deepEqual([boleto('2026-11').iptu, boleto('2026-11').iptu_parcela], [10000, 'IPTU 2026 parc. 10/10']);
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-15' }, 'j');
  recalcular(d, c);
  // 15 de 30 dias reais: R$ 50,00 (o IPTU usa os dias ocupados do mês)
  assert.equal(boleto('2026-11').iptu, 5000);
});

test('carência: aluguel zero; IPTU só se o contrato manda cobrar; a reserva não entra no boleto da carência', () => {
  const { d, loja, c, boleto } = base({ carencia_meses: 1, carencia_inicio: '2026-11', carencia_cobrar_iptu: true, reserva_valor: 50000, reserva_competencia: '2026-11' });
  R.inserir(d, 'iptus', { imovel_id: loja.id, ano: 2026, valor_total: 100000, num_parcelas: 10, primeira_competencia: '2026-02' }, 'j');
  R.gerarCobrancas(d, '2026-11', 'j');
  R.gerarCobrancas(d, '2026-12', 'j');
  const nov = boleto('2026-11');
  assert.deepEqual([nov.carencia, nov.aluguel, nov.iptu, nov.reserva_utilizada], [true, 0, 10000, 0]);
  assert.equal(boleto('2026-12').reserva_utilizada, 50000, 'a reserva vai para o 1º boleto depois da carência');
  assert.ok(c);
});

test('reserva: abate no boleto do mês dela; boleto excluído e gerado de novo continua com a reserva', () => {
  const { d, boleto } = base({ reserva_valor: 50000, reserva_competencia: '2026-11' });
  R.gerarCobrancas(d, '2026-11', 'j');
  assert.equal(boleto('2026-11').reserva_utilizada, 50000);
  assert.equal(R.totais(boleto('2026-11')).a_pagar_pontual, 180350 - 50000);
  R.excluir(d, 'cobrancas', boleto('2026-11').id, 'j');
  R.gerarCobrancas(d, '2026-11', 'j');
  assert.equal(boleto('2026-11').reserva_utilizada, 50000);
});

test('ajustes do mês ficam no recálculo e saem da NF conforme "outros_na_nf"', () => {
  const { d, c, boleto } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  const cb = boleto('2026-11');
  R.adicionarAjuste(d, cb.id, 8000, 'Conserto', 'j');
  R.adicionarAjuste(d, cb.id, -3000, 'Acerto', 'j');
  R.atualizar(d, 'contratos', c.id, { taxa_boleto: 500 }, 'j');
  recalcular(d, c);
  assert.deepEqual([cb.outros, cb.taxa_boleto], [5000, 500]);
  assert.equal(R.totais(cb).a_pagar_pontual, 180000 + 500 + 5000);
});

test('pagamento: em dia com desconto; a menos é recusado; atrasado soma multa e juros', () => {
  const { d, boleto } = base();
  R.gerarCobrancas(d, '2026-10', 'j');
  R.gerarCobrancas(d, '2026-11', 'j');
  const out = boleto('2026-10');
  assert.throws(() => R.registrarPagamento(d, out.id, '2026-11-09', 150000, 'j'), /menor que o devido/);
  assert.equal(out.data_pagamento, null, 'continua em aberto');
  R.registrarPagamento(d, out.id, '2026-11-09', 180350, 'j');
  assert.equal(out.valor_pago, 180350);
  const nov = boleto('2026-11');
  const previsto = R.previstoNoPagamento(nov, '2026-12-20');
  // R$ 2.003,50 + 10% de multa (sobre R$ 2.003,50) + juros de 1% ao mês por 10 dias
  assert.equal(previsto.multa, Math.round(200350 * 0.10));
  assert.ok(previsto.juros > 0);
  assert.equal(previsto.valor_devido, 200350 + previsto.multa + previsto.juros);
});

test('pagamento: vencimento em dia não útil vale até o próximo dia útil (C.vencido)', () => {
  // 10/01/2027 é domingo: pago na segunda, 11/01, está em dia
  assert.equal(C.vencido('2027-01-10', '2027-01-11'), false);
  assert.equal(C.vencido('2027-01-10', '2027-01-12'), true);
});

test('multa da notificação vai ao próximo boleto em aberto e sai se o boleto for excluído (volta a esperar)', () => {
  const { d, c, boleto } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  // notificação já enviada e multa decidida (a criação e o envio têm testes próprios em notificacoes.test.mjs)
  R.inserir(d, 'notificacoes', { contrato_id: c.id, data: '2026-11-02', data_limite: '2026-11-09', assunto: 'Barulho', situacao: 'Enviada', multa_valor: 20000, multa_data: '2026-11-20', multa_cobranca_id: null }, 'j');
  R.sincronizarMultas(d, c.id, 'j');
  const nov = boleto('2026-11');
  assert.equal(nov.outros, 20000);
  assert.ok((nov.multas_notificacao || []).length === 1);
  R.excluir(d, 'cobrancas', nov.id, 'j');
  R.gerarCobrancas(d, '2026-11', 'j');
  assert.equal(boleto('2026-11').outros, 20000, 'o boleto gerado de novo recebe a multa');
});

test('NF do boleto pago em dia: aluguel bonificado; tarifa e ressarcimento fora da NF (regra padrão)', () => {
  const { d, c, boleto } = base({ conta_condominio: 'Por conta do inquilino' });
  R.gerarCobrancas(d, '2026-11', 'j');
  R.inserir(d, 'ressarcimentos', { contrato_id: c.id, competencia_condominio: '2026-11', descricao: 'Fundo de obras', valor: 5000, data_pagamento: '2026-11-05', competencia_abatimento: '2026-11' }, 'j');
  R.aplicarRessarcimentos(d, c, '2026-11', 'j');
  const cb = boleto('2026-11');
  R.registrarPagamento(d, cb.id, '2026-12-05', null, 'j', { pagouEmDia: true });
  assert.equal(cb.valor_pago, 180350 - 5000);
  assert.equal(cb.ressarcimento_na_nf, false);
  // NF = aluguel com bonificação quando pago em dia (decisão de 16/10/2026), sem tarifa e sem o ressarcimento (regra padrão)
  assert.equal(cb.valor_nf, 180000);
});

test('demonstrativo do boleto: mostra cada parte e o total bate com o boleto', async () => {
  const { d, c, boleto } = base({ conta_condominio: 'Por conta do inquilino' });
  R.gerarCobrancas(d, '2026-11', 'j');
  const cb = boleto('2026-11');
  R.adicionarAjuste(d, cb.id, 8000, 'Conserto', 'j');
  R.inserir(d, 'ressarcimentos', { contrato_id: c.id, competencia_condominio: '2026-11', descricao: 'Fundo de obras', valor: 5000, data_pagamento: '2026-11-05', competencia_abatimento: '2026-11' }, 'j');
  R.aplicarRessarcimentos(d, c, '2026-11', 'j');
  const b = R.dadosBoleto(d, cb);
  assert.equal(b.valor, 200000 + 350 + 8000 - 5000);
  assert.equal(b.valor_com_desconto, b.valor - 20000);
  assert.match(b.descricao, /CONSERTO RS80,00/);
  assert.match(b.descricao, /RESSARC.* -RS50,00/);
});

test('seguro no mês da saída é proporcional aos dias, como o IPTU; o mês de entrada fica com a parcela inteira (decisão de 24/11)', () => {
  const { d, c, boleto } = base({ data_entrada: '2026-03-10', vigencia_inicio: '2026-03-10', data_saida: '2026-11-15' });
  R.inserir(d, 'seguros', { contrato_id: c.id, imovel_id: c.imovel_id, vigencia_inicio: '2026-03-01', vigencia_fim: '2027-02-28', valor_total: 36000, num_parcelas: 12, primeira_competencia: '2026-03' }, 'j');
  R.gerarCobrancas(d, '2026-03', 'j');
  R.gerarCobrancas(d, '2026-11', 'j');
  // entrada em 10/03: parcela inteira (R$ 30,00)
  assert.equal(boleto('2026-03').seguro, 3000);
  // saída em 15/11: R$ 30,00 × 15/30 = R$ 15,00
  const nov = boleto('2026-11');
  assert.equal(nov.seguro, 1500);
  assert.equal(nov.seguro_parcela, 'Seguro parc. 9/12 proporcional 15/30 dias de R$\u00a030,00'.replace('\u00a0', C.reais(1).includes('\u00a0') ? '\u00a0' : ' '));
  assert.match(R.dadosBoleto(d, nov).descricao, /SEGURO9\/12 RS15,00/);
  // saída marcada depois de gerado: o recálculo deixa o seguro proporcional
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-20' }, 'j');
  recalcular(d, c);
  assert.equal(nov.seguro, 2000, 'R$ 30,00 × 20/30');
  // mês cheio: parcela inteira
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-30' }, 'j');
  recalcular(d, c);
  assert.equal(nov.seguro, 3000);
});
