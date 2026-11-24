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

test('[44][50] depósito para completar acima do que falta e datas que não existem são recusados', () => {
  const b = base({ garantia_tipo: 'Caução', caucao_valor: 540000, caucao_meses: 3, comprovante_caucao: 'c.pdf', caucao_data: '2025-06-07', caucao_pago_em: '2025-06-07', data_entrada: '2025-06-07', vigencia_inicio: '2025-06-07' });
  R.inserir(b.d, 'correcoes', { contrato_id: b.c.id, data_vigencia: '2026-06-01', indice: 'IPCA', percentual: 4.5, valor_anterior: 200000, valor_novo: 209000 }, 'j');
  const falta = R.garantiaADepositar(b.d, b.c, 'caucao', '2026-07-01').falta;
  assert.ok(falta > 0);
  assert.throws(() => R.registrarDepositoGarantia(b.d, b.c.id, 'caucao', { data: '2026-07-01', valor: falta * 10 }, 'j'), C.ErroUsuario);
  R.registrarDepositoGarantia(b.d, b.c.id, 'caucao', { data: '2026-07-01', valor: falta }, 'j');
  assert.throws(() => R.validarFciPrevios([{ data: '2026-02-31', valor: 9000 }]));
  const r = base({ reserva_valor: 50000 });
  assert.throws(() => R.marcarReservaAbatida(r.d, r.c.id, { competencia: '2026-13', valor: 50000 }, 'j'));
});

test('[48] pagar de novo um boleto já pago é recusado', () => {
  const { d } = base();
  R.gerarCobrancas(d, '2026-07', 'j');
  const cb = d.cobrancas[0];
  R.registrarPagamento(d, cb.id, '2026-08-10', null, 'j', { pagouEmDia: true });
  assert.throws(() => R.registrarPagamento(d, cb.id, '2026-09-30', null, 'j'), C.ErroUsuario);
  assert.equal(cb.data_pagamento, '2026-08-10');
});

test('[49][43] inadimplência: vermelho a partir de 5 dias; complemento da caução fica de fora', () => {
  const { d } = base();
  R.gerarCobrancas(d, '2026-10', 'j');
  const cb = d.cobrancas[0];
  const a = R.todosAlertas(d, C.somarDias(cb.vencimento, 5)).find((x) => x.tipo === 'Inadimplência');
  assert.equal(a.nivel, 'perigo');
  const b = base({ garantia_tipo: 'Caução', caucao_valor: 540000, caucao_meses: 3, comprovante_caucao: 'c.pdf', caucao_data: '2025-06-07', caucao_pago_em: '2025-06-07', data_entrada: '2025-06-07', vigencia_inicio: '2025-06-07' });
  R.inserir(b.d, 'correcoes', { contrato_id: b.c.id, data_vigencia: '2026-06-01', indice: 'IPCA', percentual: 4.5, valor_anterior: 200000, valor_novo: 209000 }, 'j');
  R.gerarBoletosCaucao(b.d, b.c.id, 'j', null, { vencimento: '2026-07-10' });
  assert.equal(R.inadimplencia(b.d, '2026-11-16').devedores.length, 0);
});

test('[13][14] ressarcimento maior que o boleto: em dia nunca negativo e aviso da sobra', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-07', 'j');
  const cb = d.cobrancas[0];
  R.inserir(d, 'ressarcimentos', { contrato_id: c.id, descricao: 'Fundo de obras', valor: 250000, competencia_condominio: '2026-06', competencia_abatimento: '2026-07', data_pagamento: '2026-07-05' }, 'j');
  R.aplicarRessarcimentos(d, c, '2026-07', 'j');
  assert.equal(R.totais(cb).a_pagar_pontual, 0);
  assert.equal(R.totais(cb).a_pagar_sem_desconto, 0);
  assert.match(R.alertaRessarcimentoEmAcordo(d, c).texto, /sobram R\$ 700,00/);
});

test('[15] boleto quitado em dia pela reserva não vai ao C6', () => {
  const { d } = base({ reserva_valor: 180000, data_entrada: '2026-07-01', vigencia_inicio: '2026-07-01' });
  R.gerarCobrancas(d, '2026-07', 'j');
  assert.throws(() => R.pedidoBoletoC6(d, d.cobrancas[0], { id: 1 }), /quitado em dia/);
});

test('[17] FCI do mês incompleto pelos dias reais também com o mês de 30 dias', () => {
  const { d, c } = base({ data_entrada: '2027-02-15', vigencia_inicio: '2027-02-15', fci_percentual: 5 });
  d.config_regras = [{ chave: 'proporcional', valor: 'mes_30' }];
  CR.usarRegras(d);
  try {
    const cb = R.montarCobranca(d, c, '2027-02');
    const real = C.aluguelProporcional(200000, 14, 28);
    assert.equal(cb.fci, C.arred(((real - C.descontoPorPercentual(real, 10)) * 5) / 100));
  } finally { CR.usarRegras(null); }
});

test('saida-016: troca de titular fecha sempre 30/30 (quem entra paga o que falta)', () => {
  const soma = (troca, vespera, comp) => C.diasComerciais(comp, null, vespera) + C.diasComerciais(comp, troca, null, { continuacao: true });
  assert.equal(C.diasComerciais('2027-02', '2027-02-28', null, { continuacao: true }), 3); // anterior 27/30, novo 3/30
  assert.equal(soma('2027-02-28', '2027-02-27', '2027-02'), 30);
  assert.equal(soma('2027-03-31', '2027-03-30', '2027-03'), 30); // novo 0/30
  assert.equal(soma('2026-12-15', '2026-12-14', '2026-12'), 30); // 14 + 16, como antes
  assert.equal(soma('2027-02-15', '2027-02-14', '2027-02'), 30);
  // inquilino novo (sem contrato anterior) continua como em 17/11: entrada no último dia de fevereiro = 1/30
  assert.equal(C.diasComerciais('2027-02', '2027-02-28', null), 1);
  // no boleto: o herdeiro que entra em 28/02 paga 3/30; o que entra em 31/03 não tem boleto em março
  const { d, c } = base({ data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01' });
  d.config_regras = [{ chave: 'proporcional', valor: 'mes_30' }];
  CR.usarRegras(d);
  try {
    const novo = { ...c, id: 999, contrato_anterior_id: c.id, heranca_transferida: true, data_entrada: '2027-02-28', data_saida: null }; // termo da troca já assinado
    assert.equal(R.montarCobranca(d, novo, '2027-02').dias_cobrados, 3);
    const dia31 = { ...novo, data_entrada: '2027-03-31' };
    assert.equal(R.montarCobranca(d, dia31, '2027-03'), null);
    assert.equal(R.semDiaAPagar(dia31, '2027-03'), true);
    assert.equal(R.montarCobranca(d, dia31, '2027-04').dias_cobrados, 30);
  } finally { CR.usarRegras(null); }
});

test('[19] devolução pela conta: reparte a garantia menos os débitos', () => {
  assert.equal(R.garantiaADevolverNaSaida({ garantia_corrigida: 594000, debitos: 100000 }), 494000);
  assert.equal(R.garantiaADevolverNaSaida({ garantia_corrigida: 500000, debitos: 0, fci_danos: 150000, fci_usado: 120000 }), 470000);
});

test('[20][21][22] calendário: acordo e carência neutros, parcelas do acordo aparecem', () => {
  const { d, c } = base({ carencia_meses: 1 });
  R.gerarCobrancas(d, '2026-06', 'j'); R.gerarCobrancas(d, '2026-07', 'j');
  const jul = R.boletoDoMes(d, c.id, '2026-07');
  R.fazerAcordo(d, { contrato_id: c.id, ids: [jul.id], total: 200000, parcelas: 2, primeiro_vencimento: '2026-11-20' }, 'j', '2026-11-16');
  const boletos = (m) => R.eventosDoMes(d, m, '2026-11-16').filter((e) => e.tipo === 'Boleto');
  assert.ok(boletos('2026-08').every((e) => e.situacao !== 'perigo'));
  assert.ok(boletos('2026-08').some((e) => e.estado === 'em acordo'));
  assert.ok(boletos('2026-11').some((e) => /acordo 1\/2/.test(e.texto)));
  assert.ok(boletos('2026-12').some((e) => /acordo 2\/2/.test(e.texto)));
  assert.deepEqual(R.situacaoNoCalendario({ situacao: 'Carência', vencimento: '2026-07-10' }, '2026-11-16'), ['neutra', 'carência']);
});

test('[25] com a saída informada não há alerta de renovação', () => {
  const { d, c } = base({ vigencia_fim: '2026-12-31', data_saida: '2026-12-15' });
  assert.ok(!R.alertasContrato(d, c, '2026-11-16').some((a) => /renovação/.test(a.texto)));
});

test('[35][36][37] feriados locais nos prazos, 20/11 só desde 2024 e valor em formato americano recusado', () => {
  const d = R.bancoVazio();
  d.config_regras = [{ chave: 'feriados_locais', valor: ['09-08'] }];
  CR.usarRegras(d);
  try { assert.equal(C.somarDiasUteis('2027-09-06', 2), '2027-09-10'); } finally { CR.usarRegras(null); }
  assert.equal(C.feriados(2023).has('2023-11-20'), false);
  assert.equal(C.feriados(2024).has('2024-11-20'), true);
  assert.throws(() => C.centavos('1,350.00'), /Use 2\.300,00/);
  assert.equal(C.centavos('1.350,00'), 135000);
});

test('[39] declaração anual avisa os aluguéis pagos sem NF (boleto de controle)', () => {
  const { d, c } = base({ gerar_nf: false, data_entrada: '2026-01-01' });
  for (const m of ['2026-01', '2026-02']) { R.gerarCobrancas(d, m, 'j'); const cb = R.boletoDoMes(d, c.id, m); R.registrarPagamento(d, cb.id, cb.vencimento, null, 'j', { pagouEmDia: true }); }
  const r = R.declaracaoAnual(d, c.id, 2026);
  assert.equal(r.total, 0);
  assert.equal(r.semNf.length, 2);
});

test('[41] IPTU à vista: o resultado do mês não desconta o que o inquilino ainda vai devolver', () => {
  const { d, loja } = base({ data_entrada: '2025-01-01', cobrar_iptu: true });
  R.inserir(d, 'iptus', { imovel_id: loja.id, ano: 2026, valor_total: 100000, num_parcelas: 10, primeiro_vencimento_boleto: '2026-03', pago_avista: true, valor_avista: 90000, data_quitacao: '2026-02-10', cobranca_inquilino: 'Parcelas normais nos meses em que ocupar' }, 'j');
  const r = R.resultadosFinanceiros(d, '2026-02-01', '2026-02-28').find((x) => x.imovel.id === loja.id);
  assert.ok(r.iptu >= 0);
});

test('[27][28] fechamento confere os boletos pelo vencimento, com as parcelas do acordo', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-07', 'j');
  R.fazerAcordo(d, { contrato_id: c.id, ids: [d.cobrancas[0].id], total: 200000, parcelas: 1, primeiro_vencimento: '2026-11-20' }, 'j', '2026-11-16');
  const e = R.etapasFechamento(d, '2026-11', '2026-11-25').find((x) => x.chave === 'pagamentos');
  assert.equal(e.pendentes, 1);
});

test('[segurança 11] ficha reprovada: no prazo, os dados pessoais saem da ficha, do histórico e dos e-mails', () => {
  const d = R.bancoVazio();
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Ana Exemplo', inquilino_cpf: '529.982.247-25', inquilino_rg: '12.345.678-9', inquilino_email: 'ana@exemplo.com',
    renda_valor: 500000, endereco: 'Rua B, 2', fiador1_nome: 'Beto Exemplo', fiador1_cpf: '529.982.247-25', reserva_valor: 50000, reserva_data: '2026-07-01',
    comprovante_reserva: 'reserva.pdf', aluguel_inicial: 200000 }, 'j');
  R.atualizar(d, 'fichas', f.id, { situacao: 'Reprovada', decisao_data: '2026-07-10', decisao_motivo: 'renda insuficiente', inquilino_telefone: '41 99999-0000' }, 'j', 'Reprovada');
  d.envios_email = [{ id: 1, ficha_id: f.id, para: 'ana@exemplo.com', assunto: 'Ficha' }];
  R.registrar(d, 'j', 'Inclusão', 'envios_email', 1, 'E-mail "Ficha" enviado para ana@exemplo.com', { para: 'ana@exemplo.com' });
  assert.equal(R.fichasComDadosVencidos(d, '2026-11-17').length, 0, 'os documentos saem antes');
  R.atualizar(d, 'fichas', f.id, { documentos_apagados_em: '2026-10-10' }, 'j', 'docs');
  assert.equal(R.fichasComDadosVencidos(d, '2026-11-17').length, 1);
  R.apagarDadosPessoaisDaFicha(d, f.id, 'j', '2026-11-17');
  const x = R.buscar(d, 'fichas', f.id);
  for (const k of ['inquilino_cpf', 'inquilino_rg', 'inquilino_email', 'renda_valor', 'endereco', 'fiador1_nome', 'fiador1_cpf', 'inquilino_telefone']) assert.equal(x[k], null, k);
  assert.equal(x.inquilino_nome, 'Ana Exemplo');
  assert.equal(x.situacao, 'Reprovada');
  assert.equal(x.decisao_motivo, 'renda insuficiente');
  assert.equal(x.reserva_valor, 50000);
  assert.equal(x.comprovante_reserva, 'reserva.pdf');
  assert.equal(x.dados_apagados_em, '2026-11-17');
  const texto = JSON.stringify(d.historico);
  for (const t of ['529.982.247-25', '12.345.678-9', 'ana@exemplo.com', 'Rua B', 'Beto', '99999']) assert.ok(!texto.includes(t), t);
  assert.equal(d.envios_email[0].para, null);
  assert.equal(R.fichasComDadosVencidos(d, '2026-11-17').length, 0);
});

test('[e2e 30] NF do mês incompleto: quantidade 16/30, unitário do mês inteiro e total proporcional', async () => {
  const FT = await import('../docs/js/fatura.js');
  assert.deepEqual(FT.quantidadeDaFatura({ valor: 106667, dias: 16, dias_mes: 30 }), { proporcional: true, quantidade: '16/30', unitario: 200000 });
  assert.deepEqual(FT.quantidadeDaFatura({ valor: 96000, dias: 16, dias_mes: 30 }), { proporcional: true, quantidade: '16/30', unitario: 180000 });
  assert.deepEqual(FT.quantidadeDaFatura({ valor: 180000 }), { proporcional: false, quantidade: '1', unitario: 180000 });
  // a NF numerada guarda os dias do boleto
  const { d, c } = base({ data_entrada: '2026-11-15', vigencia_inicio: '2026-11-15' });
  R.gerarCobrancas(d, '2026-11', 'j');
  const cb = R.boletoDoMes(d, c.id, '2026-11');
  R.registrarPagamento(d, cb.id, cb.vencimento, null, 'j', { pagouEmDia: true });
  R.numerarFaturas(d, 'j');
  const f = d.faturas[0];
  assert.equal(`${f.dias}/${f.dias_mes}`, '16/30');
  assert.equal(FT.quantidadeDaFatura(f).quantidade, '16/30');
});

test('mensal-009: ajuste do mês fica fora da NF; marcado "entra na NF", soma e vai nas observações', () => {
  const { d, c } = base({ data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01' });
  R.gerarCobrancas(d, '2026-06', 'j');
  const cb = R.boletoDoMes(d, c.id, '2026-06');
  const semAjuste = C.liquidar(cb, cb.vencimento).valor_nf;
  R.atualizar(d, 'cobrancas', cb.id, { outros: 30000, outros_descricao: 'vidro quebrado' }, 'j');
  assert.equal(C.liquidar(R.buscar(d, 'cobrancas', cb.id), cb.vencimento).valor_nf, semAjuste, 'fora da NF');
  R.atualizar(d, 'cobrancas', cb.id, { outros_na_nf: true, outros_descricao: 'TV vendida junto' }, 'j');
  const x = R.buscar(d, 'cobrancas', cb.id);
  assert.equal(C.liquidar(x, cb.vencimento).valor_nf, semAjuste + 30000, 'entra na NF');
  const base2 = R.baseDaFatura(d, 'cobranca', { ...x, valor_nf: semAjuste + 30000 });
  assert.match(base2.observacoes, /Inclui TV vendida junto: R\$ 300,00/);
});

test('saida-007: adiar a saída recalcula o último boleto em aberto e leva a vistoria marcada junto', () => {
  const { d, c } = base({ data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01', aluguel_inicial: 300000, desconto_pontualidade_percentual: 0, cobranca_mes_seguinte: true });
  d.config_regras = [{ chave: 'proporcional', valor: 'mes_30' }];
  CR.usarRegras(d);
  try {
    R.informarSaida(d, c.id, '2026-12-10', 'j', '2026-11-21');
    R.gerarCobrancas(d, '2026-12', 'j');
    const cb = R.boletoDoMes(d, c.id, '2026-12');
    assert.equal(cb.aluguel, 100000); // 10/30 de R$ 3.000,00
    R.marcarVistoriaSaida(d, c.id, '2026-12-11', '10:00', 'j', '2026-11-21');
    R.informarSaida(d, c.id, '2026-12-15', 'j', '2026-11-21');
    R.recalcularCobrancas(d, (x) => x.contrato_id === c.id, 'j'); // a tela recalcula junto (mudarContrato)
    assert.equal(R.buscar(d, 'cobrancas', cb.id).aluguel, 150000, '15/30 = R$ 1.500,00');
    assert.equal(c.vistoria_saida_data, '2026-12-16', 'a vistoria anda os mesmos 5 dias');
    assert.equal(c.vistoria_saida_hora, '10:00');
    assert.ok(d.historico.some((h) => /\(era 10\/12\/2026\); vistoria de saída passa a 16\/12\/2026/.test(h.descricao)));
  } finally { CR.usarRegras(null); }
});
