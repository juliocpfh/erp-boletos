import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as R from '../docs/js/regras.js';

// Rotina de entrada do inquilino, troca de titular com data futura e reajuste com valores digitados.
function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, taxa_boleto: 350, multa_percentual: 10, juros_mensal_percentual: 1, reserva_valor: 50000 }, 'julio');
  return { d, loja, c };
}

test('troca de titular com data futura: o anterior paga até a véspera; garantia, seguro e boletos passam só no dia', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 243000, caucao_meses: 2, caucao_data: '2026-06-07' });
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-06-08', valor: 243000, arquivo: 'cau.pdf' }, 'julio');
  R.inserir(d, 'seguros', { imovel_id: c.imovel_id, contrato_id: c.id, seguradora: 'Seg', vigencia_inicio: '2026-06-07', vigencia_fim: '2027-06-07', valor_total: 12000, num_parcelas: 12, primeira_competencia: '2026-06' }, 'julio');
  for (const comp of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']) R.gerarCobrancas(d, comp, 'julio');
  const { id, ...resto } = c;
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Novo Titular', contrato_anterior_id: c.id, data_entrada: '2026-12-15', vigencia_inicio: '2026-12-15',
    comprovante_caucao: null, caucao_por_depositos: null }, 'julio');
  const r = R.transferirHeranca(d, novo.id, 'julio', '2026-10-28');
  assert.equal(r.agendada, true);
  assert.equal(c.data_saida, '2026-12-14', 'fim do vínculo na véspera');
  assert.equal(novo.heranca_transferida, undefined, 'a troca ainda não foi feita');
  assert.equal(novo.data_base_correcao, '2026-06-07');
  assert.equal(R.herancaAgendada(d, novo, '2026-10-28'), '2026-12-15');
  assert.equal(R.garantiaDepositada(c), true, 'a garantia continua no anterior');
  assert.equal(R.segurosDoContrato(d, c.id).length, 1, 'o seguro continua no anterior');
  assert.ok(!R.alertasContrato(d, novo, '2026-10-28').some((a) => /caução|Comprovante|Reserva/.test(a.tipo)), 'sem alerta de garantia no novo antes da data');
  R.gerarCobrancas(d, '2026-12', 'julio');
  assert.equal(R.boletoDoMes(d, c.id, '2026-12').dias_cobrados, 14, 'anterior: 1 a 14/12');
  assert.equal(R.boletoDoMes(d, novo.id, '2026-12').dias_cobrados, 17, 'novo: 15 a 31/12');
  R.gerarCobrancas(d, '2027-01', 'julio');
  assert.equal(R.boletoDoMes(d, c.id, '2027-01'), null);
  assert.ok(R.boletoDoMes(d, novo.id, '2027-01'));
  // no dia, a troca é feita: garantia e seguro passam ao novo
  const r2 = R.transferirHeranca(d, novo.id, 'julio', '2026-12-15');
  assert.ok(!r2.agendada);
  assert.equal(novo.heranca_transferida, '2026-12-15');
  assert.equal(R.garantiaDepositada(novo), true);
  assert.equal(R.segurosDoContrato(d, novo.id).length, 1);
  assert.equal(R.herancaAgendada(d, novo, '2026-12-15'), null);
});

test('rotina de entrada: etapas pelo que já está registrado, marca à mão com data, não se aplica e alerta das contas', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Fiador', conta_agua: 'Por conta do inquilino', conta_energia: 'Por conta do inquilino', conta_gas: 'Não tem',
    conta_condominio: 'Incluso no aluguel', conta_seguro: 'Por conta do inquilino' });
  const hoje = '2026-07-01';
  let rot = R.rotinaEntrada(d, c, hoje);
  assert.deepEqual(rot.map((e) => e.chave), ['reserva', 'contrato_gerado', 'contrato_assinado', 'garantia', 'vistoria_gerada', 'chaves_gerado',
    'vistoria_assinada', 'chaves_assinado', 'agua', 'energia', 'seguro'], 'sem gás e condomínio; sem aditivo');
  assert.equal(rot.find((e) => e.chave === 'agua').titulo, 'Transferência da água (Sanepar)');
  assert.equal(rot.find((e) => e.chave === 'garantia').titulo, 'Assinatura do fiador');
  assert.equal(rot.find((e) => e.chave === 'reserva').situacao, 'andamento', 'reserva sem comprovante');
  // documento assinado conta sozinho; protocolo concluído também
  R.marcarDocumento(d, c.id, 'doc_contrato_em', '2026-06-05', 'julio', 'contrato.pdf');
  R.inserir(d, 'titularidades', { imovel_id: c.imovel_id, contrato_id: c.id, concessionaria: 'Sanepar', tipo: 'Para o inquilino', situacao: 'Solicitado', data: '2026-06-10', protocolo: '123' }, 'julio');
  R.inserir(d, 'titularidades', { imovel_id: c.imovel_id, contrato_id: c.id, concessionaria: 'Copel', tipo: 'Para o inquilino', situacao: 'Concluído', data: '2026-06-12' }, 'julio');
  R.marcarEtapaEntrada(d, c.id, 'garantia', { data: '2026-06-05' }, 'julio');
  R.marcarEtapaEntrada(d, c.id, 'chaves_gerado', { pular: true }, 'julio');
  assert.throws(() => R.marcarEtapaEntrada(d, c.id, 'vistoria_assinada', { data: '2026-06-05' }, 'julio'), /anexe/);
  rot = R.rotinaEntrada(d, c, hoje);
  const e = (k) => rot.find((x) => x.chave === k);
  assert.equal(e('contrato_assinado').situacao, 'feita');
  assert.equal(e('contrato_assinado').data, '2026-06-05');
  assert.equal(e('contrato_gerado').situacao, 'feita', 'assinado: já foi gerado');
  assert.equal(e('garantia').data, '2026-06-05');
  assert.equal(e('garantia').manual, true);
  assert.equal(e('chaves_gerado').situacao, 'pulada');
  assert.equal(e('agua').situacao, 'andamento');
  assert.equal(e('energia').situacao, 'feita');
  assert.equal(e('energia').data, '2026-06-12');
  const alerta = R.alertasContrato(d, c, hoje).find((a) => a.tipo === 'Rotina de entrada');
  assert.match(alerta.texto, /água \(Sanepar\)/);
  assert.doesNotMatch(alerta.texto, /Copel/);
  // gerado ao baixar ou imprimir: marca uma vez
  assert.equal(R.marcarGeradoNaRotina(d, c.id, 'chaves_gerado', 'julio', '2026-06-01'), false, 'já marcada como não se aplica');
  R.marcarEtapaEntrada(d, c.id, 'chaves_gerado', {}, 'julio');
  assert.equal(R.marcarGeradoNaRotina(d, c.id, 'chaves_gerado', 'julio', '2026-06-01'), true);
  assert.equal(R.marcarGeradoNaRotina(d, c.id, 'chaves_gerado', 'julio', '2026-06-02'), false);
  assert.equal(R.rotinaEntrada(d, c, hoje).find((x) => x.chave === 'chaves_gerado').data, '2026-06-01');
  R.marcarEtapaEntrada(d, c.id, 'garantia', {}, 'julio');
  assert.equal(R.rotinaEntrada(d, c, hoje).find((x) => x.chave === 'garantia').situacao, 'pendente', 'desfeita');
  // depois de 6 meses da entrada, sem alerta
  assert.equal(R.alertasContrato(d, c, '2027-03-01').find((a) => a.tipo === 'Rotina de entrada'), undefined);
});

test('rotina do novo titular: documentos, garantia e vistoria herdados; termo aditivo da troca como etapa', () => {
  const { d, c } = base();
  R.marcarDocumento(d, c.id, 'doc_contrato_em', '2026-06-05', 'julio', 'contrato.pdf');
  const { id, ...resto } = c;
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Novo Titular', contrato_anterior_id: c.id, data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', doc_contrato_em: null }, 'julio');
  const rot = R.rotinaEntrada(d, novo, '2026-11-01');
  const e = (k) => rot.find((x) => x.chave === k);
  assert.equal(e('reserva'), undefined, 'reserva é do contrato anterior');
  assert.equal(e('contrato_assinado').texto, 'herdado de Maria Exemplo');
  assert.equal(e('aditivo').situacao, 'pendente');
  assert.equal(e('vistoria_gerada').situacao, 'feita');
});

test('reajuste com índice arredondado ou aluguel digitado: guarda o índice do contrato e o % calculado', () => {
  const { d, c } = base();
  c.indice_correcao = 'IGP-M';
  R.inserir(d, 'indices_acumulados', { indice: 'IGP-M', mes_ref: '2027-05', percentual: 4.37 }, 'julio');
  const x = R.aplicarReajuste(d, c.id, '2027-06', 'julio', { percentual: 4.5 });
  assert.equal(x.indice, 'IGP-M');
  assert.equal(x.percentual, 4.5);
  assert.equal(x.percentual_indice, 4.37);
  assert.equal(x.valor_novo, 141075);
  R.desfazerReajuste(d, x.id, 'julio');
  const y = R.aplicarReajuste(d, c.id, '2027-06', 'julio', { valor_novo: 141000 });
  assert.equal(y.valor_novo, 141000);
  assert.equal(y.percentual, 4.4444);
  R.desfazerReajuste(d, y.id, 'julio');
  const z = R.aplicarReajuste(d, c.id, '2027-06', 'julio');
  assert.equal(z.percentual_indice, null, 'pelo índice: não é digitado');
  assert.equal(z.valor_novo, 140900);
});

test('aluguel cheio a partir do bonificado digitado (no centavo)', () => {
  assert.equal(C.cheioPorBonificado(150000, 10), 166667);
  assert.equal(166667 - C.descontoPorPercentual(166667, 10), 150000);
  assert.equal(C.cheioPorBonificado(140000, 0), 140000);
  for (const b of [123456, 99999, 250001]) {
    const v = C.cheioPorBonificado(b, 7.5);
    assert.ok(Math.abs(v - C.descontoPorPercentual(v, 7.5) - b) <= 1);
  }
});

test('rotina: documento registrado como perdido conta como concluído; com assinatura faltante continua faltando', () => {
  const { d, c } = base();
  R.marcarDocumentoPerdido(d, c.id, 'doc_contrato_em', '2026-06-20', 'julio');
  const parte = R.partesDoContrato(d, c).map(R.textoParte)[0];
  R.anexarDocumentoParcial(d, c.id, 'doc_vistoria_em', { data: '2026-06-08', arquivo: 'vist.pdf', falta: [parte] }, 'julio', true);
  const rot = R.rotinaEntrada(d, c, '2026-07-01');
  const e = (k) => rot.find((x) => x.chave === k);
  assert.equal(e('contrato_assinado').situacao, 'feita');
  assert.equal(e('contrato_assinado').texto, 'registrado como perdido');
  assert.equal(e('contrato_gerado').situacao, 'feita', 'perdido: o contrato já foi gerado');
  assert.equal(e('vistoria_assinada').situacao, 'andamento');
  assert.match(e('vistoria_assinada').texto, /falta assinatura/);
  assert.equal(e('vistoria_gerada').situacao, 'feita', 'anexada: a vistoria já foi gerada');
  assert.equal(e('chaves_gerado').situacao, 'pendente');
});

test('rotina: documento perdido no titular anterior fecha a etapa do novo; assinado depois vale mais; recusa da perda volta a cobrar', () => {
  const { d, c } = base();
  const { id, ...resto } = c;
  const meio = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Titular Meio', contrato_anterior_id: c.id, data_entrada: '2026-07-07' }, 'julio');
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Novo Titular', contrato_anterior_id: meio.id, data_entrada: '2026-08-07' }, 'julio');
  const etapa = (k) => R.rotinaEntrada(d, novo, '2026-08-10').find((x) => x.chave === k);
  assert.equal(etapa('contrato_assinado').situacao, 'andamento', 'sem perda: continua pedindo para marcar no anterior');
  R.marcarDocumentoPerdido(d, c.id, 'doc_contrato_em', '2026-06-20', 'ana', false);
  assert.deepEqual([etapa('contrato_assinado').situacao, etapa('contrato_assinado').data, etapa('contrato_assinado').texto], ['feita', '2026-06-20', 'registrado como perdido em Maria Exemplo']);
  assert.equal(R.perdaHerdada(d, c, 'doc_contrato_em'), null, 'no próprio contrato não é herdada');
  R.analisarDocumento(d, c.id, 'doc_contrato_em', 'perdido', false, 'julio');
  assert.equal(etapa('contrato_assinado').situacao, 'andamento', 'perda recusada');
  R.marcarDocumentoPerdido(d, c.id, 'doc_contrato_em', '2026-06-20', 'julio');
  c.doc_contrato_em = '2026-06-25';
  assert.equal(R.perdaHerdada(d, novo, 'doc_contrato_em'), null);
  assert.equal(etapa('contrato_assinado').data, '2026-06-25');
});
