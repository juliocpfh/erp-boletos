// Mutirão de 19–20/11/2026, lotes A, B e H (boletos e pagamentos) e mensal-039, com a decisão nova do dono de 2026-11-20:
// não existe boleto pago em parte ("ou paga inteiro ou não paga"); quem paga a menos fica em aberto e quita por acordo.
// Os pagamentos em parte de antes (dados antigos, "Paga em parte" com diferenca_devida) continuam coerentes.
// Dados fictícios: aluguel R$ 1.350,00 (sem bonificação), tarifa R$ 3,50, multa 10%, juros 1% ao mês.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as R from '../docs/js/regras.js';

function base({ nf = true } = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    taxa_boleto: 350, multa_percentual: 10, juros_mensal_percentual: 1, ...(nf ? {} : { gerar_nf: false }) }, 'julio');
  for (const comp of ['2026-06', '2026-07', '2026-08']) R.gerarCobrancas(d, comp, 'julio');
  return { d, c, loja, boleto: (comp) => R.boletoDoMes(d, c.id, comp) };
}

/** Pagamento em parte de ANTES de 20/11 (o sistema não grava mais assim): entrou ``recebido`` e a diferença ficou devendo. */
function pagoEmParteAntigo(d, cb, data, recebido) {
  R.registrarPagamento(d, cb.id, data, null, 'julio');
  const falta = cb.valor_pago - recebido;
  Object.assign(cb, { valor_pago: recebido, situacao: 'Paga em parte', diferenca_devida: falta, diferenca_no_boleto: null });
  R.aplicarDiferencasPendentes(d, cb.contrato_id, 'julio');
  return falta;
}

const recusaParte = (e) => e instanceof C.ErroUsuario && /Não existe pagamento em parte: o boleto continua em aberto/.test(e.message);

test('decisão de 20/11: valor recebido menor que o devido é recusado (com NF, sem NF, com justificativa); zero e negativo também', () => {
  const { d, boleto } = base();
  const jun = boleto('2026-06');
  const devido = R.previstoNoPagamento(jun, '2026-07-10').valor_devido; // R$ 1.353,50 em dia
  assert.throws(() => R.registrarPagamento(d, jun.id, '2026-07-10', 200000 - 70000, 'julio'), recusaParte);
  assert.throws(() => R.registrarPagamento(d, jun.id, '2026-07-10', devido - 1, 'julio', { valorNf: 100000, justificativa: 'pagou só uma parte' }), recusaParte);
  assert.throws(() => R.registrarPagamento(d, jun.id, '2026-07-10', 0, 'julio'), /Informe o valor que entrou na conta/);
  assert.throws(() => R.registrarPagamento(d, jun.id, '2026-07-10', -10000, 'julio'), /Informe o valor que entrou na conta/);
  assert.deepEqual([jun.data_pagamento, jun.situacao, jun.diferenca_devida ?? null], [null, 'Em aberto', null], 'nada gravado');
  // a mensagem diz quanto entrou, quanto devia e o caminho (acordo)
  assert.throws(() => R.registrarPagamento(d, jun.id, '2026-07-10', 100000, 'julio'), (e) => e.message.startsWith(`O valor recebido (${C.reais(100000)}) é menor que o devido (${C.reais(devido)}).`) && /faça um acordo/.test(e.message));
  // o valor exato (ou sem valor: o previsto) passa
  R.registrarPagamento(d, jun.id, '2026-07-10', devido, 'julio');
  assert.equal(jun.situacao, 'Paga em dia');
  assert.equal(typeof R.levarDiferencaAoProximo, 'undefined', 'não existe mais o caminho que criava "Paga em parte"');
});

test('mensal-006: boleto de controle (inquilino sem NF) pago a menos também é recusado (antes ficava "Paga em dia" e a diferença sumia)', () => {
  const { d, boleto } = base({ nf: false });
  const set = boleto('2026-08');
  assert.throws(() => R.registrarPagamento(d, set.id, '2026-09-10', 50000, 'julio'), recusaParte);
  assert.equal(set.data_pagamento, null);
});

test('mensal-016: complemento da caução só pelo valor exato do boleto', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 360000, caucao_data: '2026-06-01', comprovante_caucao: 'c.pdf' });
  const cb = R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2026-11', vencimento: '2026-12-10', dias_cobrados: 30, dias_mes: 30, aluguel_mensal: 0, aluguel: 0, desconto: 0,
    iptu: 0, seguro: 0, taxa_boleto: 0, outros: 8100, outros_descricao: 'Complemento da caução (1/2)', reserva_utilizada: 0, carencia: false, ressarcimento: 0,
    caucao_complemento: 8100, caucao_anterior: 360000, caucao_nova: 368100, caucao_vigencia: '2026-11-01', caucao_parcela: '1/2', multa_percentual: 0, juros_mensal_percentual: 0,
    situacao: 'Em aberto', data_pagamento: null, valor_pago: null }, 'julio');
  assert.throws(() => R.registrarPagamento(d, cb.id, '2026-12-05', 1000, 'julio'), /só é pago pelo valor exato do boleto \(R\$ 81,00\); entrou R\$ 10,00/);
  assert.throws(() => R.registrarPagamento(d, cb.id, '2026-12-05', 9000, 'julio'), /valor exato/);
  assert.equal(cb.data_pagamento, null);
  R.registrarPagamento(d, cb.id, '2026-12-05', 8100, 'julio');
  assert.equal(R.valorGarantia(d, c), 368100, 'a caução sobe só o que entrou: R$ 81,00');
});

test('mensal-041: parcela do complemento da caução — com outra parcela paga é barrada; em aberto, as outras saem juntas', () => {
  const { d, c } = base();
  const parcela = (n, venc) => R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: venc.slice(0, 7), vencimento: venc, aluguel: 0, desconto: 0, outros: 8100,
    caucao_complemento: 8100, caucao_vigencia: '2026-11-01', caucao_parcela: `${n}/2`, multa_percentual: 0, juros_mensal_percentual: 0, situacao: 'Em aberto', data_pagamento: null }, 'julio');
  const p1 = parcela(1, '2026-12-10'); const p2 = parcela(2, '2027-01-10');
  assert.equal(R.motivoNaoExcluirParcelaCaucao(d, p2), null);
  R.excluir(d, 'cobrancas', p2.id, 'julio', 'teste');
  assert.equal(R.excluirParcelasIrmas(d, p2, 'julio'), 1);
  assert.ok(!R.buscar(d, 'cobrancas', p1.id), 'a 1ª saiu junto: o complemento volta a "Caução a completar"');
  const q1 = parcela(1, '2026-12-10'); const q2 = parcela(2, '2027-01-10');
  q1.data_pagamento = '2026-12-10';
  assert.match(R.motivoNaoExcluirParcelaCaucao(d, q2), /parcela 1\/2 já foi paga \(10\/12\/2026\).*Desfaça antes o pagamento/);
});

test('dados antigos — mensal-025: o ajuste do mês não apaga a diferença presa ao boleto; mensal-039: ela sai da base de multa e juros', () => {
  const { d, boleto } = base();
  const jun = boleto('2026-06'); const jul = boleto('2026-07');
  const falta = pagoEmParteAntigo(d, jun, '2026-07-10', 100000);
  assert.equal(jul.outros, falta);
  // desde 24/11/2026 o ajuste é uma lista à parte: a diferença presa continua no total, e "Tirar" não a apaga
  R.ajustarBoleto(d, jul.id, 0, '', 'julio');
  assert.equal(jul.outros, falta, '"Tirar ajuste" não apaga a diferença');
  R.ajustarBoleto(d, jul.id, 5000, 'reforma do banheiro', 'julio');
  assert.equal(jul.outros, falta + 5000);
  assert.match(jul.outros_descricao, /reforma do banheiro/);
  assert.ok(jul.outros_descricao.includes(R.textoDiferenca(jun)));
  // base de multa e juros: sem a diferença (que já tem multa e juros dentro) e sem a tarifa do boleto (24/11/2026)
  const t = R.totais(jul);
  assert.equal(t.base_multa, t.total_sem_desconto - falta - (jul.taxa_boleto || 0));
});

test('dados antigos — mensal-026 e saida-002: excluir o boleto que recebeu a diferença a solta; ela vai ao próximo boleto gerado', () => {
  const { d, c, boleto } = base();
  const jun = boleto('2026-06'); const jul = boleto('2026-07');
  const falta = pagoEmParteAntigo(d, jun, '2026-07-10', 100000);
  R.excluir(d, 'cobrancas', jul.id, 'julio', 'teste');
  assert.equal(jun.diferenca_no_boleto, null, 'volta a esperar um boleto');
  assert.equal(R.diferencaPendente(d, jun), true);
  // o próximo em aberto (08/2026) recebe ao gerar de novo
  R.gerarCobrancas(d, '2026-07', 'julio');
  assert.equal(boleto('2026-07').outros, falta);
  assert.equal(jun.diferenca_no_boleto, boleto('2026-07').id);
  // dado antigo cujo destino sumiu antes desta correção (apontando para um boleto que não existe): também é pendente
  jun.diferenca_no_boleto = 9999;
  assert.equal(R.diferencaPendente(d, jun), true);
  assert.ok(R.debitosDaSaida(d, c, '2026-09-01').itens.some((x) => x.texto.startsWith('Diferença do boleto 06/2026 (pago em parte), ainda não cobrada')));
});

test('dados antigos — saida-001/002: informar a saída apaga o boleto seguinte e a diferença (e a multa da notificação) entram nos débitos', () => {
  const { d, c, boleto } = base();
  const jul = boleto('2026-07');
  R.registrarPagamento(d, boleto('2026-06').id, '2026-07-10', null, 'julio');
  const falta = pagoEmParteAntigo(d, jul, '2026-08-10', 100000);
  assert.equal(jul.diferenca_no_boleto, boleto('2026-08').id);
  // multa de notificação gerada e ainda sem boleto
  R.inserir(d, 'notificacoes', { contrato_id: c.id, data: '2026-07-01', assunto: 'Ar-condicionado', situacao: 'Multa gerada', multa_valor: 150000, multa_data: '2026-07-20', multa_cobranca_id: null }, 'julio');
  R.informarSaida(d, c.id, '2026-07-31', 'julio', '2026-08-05');
  R.recalcularCobrancas(d, (x) => x.contrato_id === c.id, 'julio'); // a tela recalcula depois de salvar a data
  assert.ok(!boleto('2026-08'), 'boleto de 08/2026 apagado (nenhum dia ocupado)');
  const deb = R.debitosDaSaida(d, c, '2026-08-05');
  const linhas = deb.itens.filter((x) => !x.cobranca).map((x) => [x.valor, x.texto.split(':')[0]]);
  assert.deepEqual(linhas, [[falta, 'Diferença do boleto 07/2026 (pago em parte), ainda não cobrada'], [150000, 'Multa por descumprimento da notificação de 01/07/2026, ainda não cobrada']]);
  assert.ok(deb.total >= falta + 150000);
});

test('dados antigos — mensal-027: desfazer o pagamento em parte só tira a diferença se ela ainda está no boleto seguinte', () => {
  const { d, boleto } = base();
  const jun = boleto('2026-06'); const jul = boleto('2026-07');
  const falta = pagoEmParteAntigo(d, jun, '2026-07-10', 100000);
  // dado antigo sem a lista (de antes desta correção) e com o ajuste já trocado à mão: não sobra desconto indevido
  Object.assign(jul, { diferencas_cobradas: undefined, outros: 5000, outros_descricao: 'reforma do banheiro' });
  R.estornarPagamento(d, jun.id, 'julio');
  assert.deepEqual([jul.outros, jul.outros_descricao], [5000, 'reforma do banheiro']);
  assert.ok(falta > 0);
});

test('dados antigos — normalizar: o boleto que já recebeu a diferença passa a guardá-la (diferencas_cobradas), sem mexer no valor', () => {
  const { d, boleto } = base();
  const jun = boleto('2026-06'); const jul = boleto('2026-07');
  const falta = pagoEmParteAntigo(d, jun, '2026-07-10', 100000);
  delete jul.diferencas_cobradas;
  R.normalizar(d);
  assert.deepEqual(jul.diferencas_cobradas, [{ cobranca_id: jun.id, valor: falta, texto: 'Diferença do boleto 06/2026 (pago em parte)' }]);
  assert.equal(jul.outros, falta);
  R.normalizar(d);
  assert.equal(jul.diferencas_cobradas.length, 1, 'não repete');
});

test('dados antigos — saida-004: na troca de titular a diferença de quem sai fica com ele (débitos) e o novo recebe o boleto limpo', () => {
  const { d, c, boleto } = base();
  R.registrarPagamento(d, boleto('2026-06').id, '2026-07-10', null, 'julio');
  const jul = boleto('2026-07');
  const falta = pagoEmParteAntigo(d, jul, '2026-08-10', 100000);
  const ago = boleto('2026-08');
  assert.equal(ago.outros, falta);
  const { id, ...resto } = c; // eslint-disable-line no-unused-vars
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Pedro Novo', inquilino_cpf: '529.982.247-25', contrato_anterior_id: c.id, data_entrada: '2026-08-01', vigencia_inicio: '2026-08-01' }, 'julio');
  R.inserir(d, 'aditivos', { contrato_id: novo.id, imovel_id: novo.imovel_id, tipo: 'Troca de titular', data: '2026-07-25', assunto: 'Troca', texto: 'termo', arquivo: 'termo.pdf' }, 'julio');
  R.transferirHeranca(d, novo.id, 'julio', '2026-08-05');
  assert.equal(ago.contrato_id, novo.id, 'o boleto de 08/2026 passa ao novo titular');
  assert.deepEqual([ago.outros, ago.diferencas_cobradas], [0, []], 'sem a diferença de quem saiu');
  assert.equal(jul.diferenca_no_boleto, null);
  assert.ok(R.debitosDaSaida(d, c, '2026-08-05').itens.some((x) => x.valor === falta && /Diferença do boleto 07\/2026/.test(x.texto)), 'nos débitos de quem saiu');
});

test('saida-003: a devolução da garantia na troca de titular marca o boleto descontado; excluir a devolução o libera', () => {
  const { d, c, boleto } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 270000, caucao_data: '2026-06-01', comprovante_caucao: 'c.pdf' });
  const { id, ...resto } = c; // eslint-disable-line no-unused-vars
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Pedro Novo', contrato_anterior_id: c.id, data_entrada: '2026-09-01', vigencia_inicio: '2026-09-01', garantia_na_troca: 'nova' }, 'julio');
  assert.ok(novo);
  const jul = boleto('2026-07');
  const dados = { data: '2026-09-05', garantia_valor: 270000, indice_percentual: 0, debitos: 135350, debitos_descricao: `Aluguel 07/2026 em aberto: ${C.reais(135350)}` };
  const dev = R.salvarDevolucaoGarantia(d, c.id, dados, 'julio');
  assert.deepEqual([jul.situacao, jul.quitado_devolucao, R.aCobrar(jul)], ['Descontado da garantia', dev.id, false]);
  R.excluir(d, 'devolucoes_garantia', dev.id, 'julio', 'teste');
  R.liberarBoletosDaDevolucao(d, dev.id, 'julio');
  assert.deepEqual([jul.situacao, jul.quitado_devolucao, R.aCobrar(jul)], ['Em aberto', null, true]);
});

test('fios-002: o termo de quitação assinado da saída é de um lançamento (a limpeza não o apaga); toda lista de rótulos está nos usados', () => {
  const { d, c } = base();
  R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2026-10-20', termo_assinado: 'comprovante-termo-quitacao-assinado-2026-10-20.pdf' }, 'julio');
  const usados = new Set(R.arquivosReferenciados(d).map((x) => `${x.escopo}:${x.id}|${x.nome}`));
  assert.ok(usados.has(`contrato:${c.id}|comprovante-termo-quitacao-assinado-2026-10-20.pdf`));
  for (const k of R.rotulosDosArquivos(d).keys()) assert.ok(usados.has(k), `rotulado mas fora dos usados: ${k}`);
});

test('entrada-035: datas da rotina de entrada não podem ser depois de hoje; contra-vistoria não antes da entrada', () => {
  const { d, c } = base();
  assert.throws(() => R.registrarContraVistoria(d, c.id, { data: '2030-12-31', arquivo: 'cv.pdf' }, 'julio', '2026-11-20'), /depois de hoje/);
  assert.throws(() => R.registrarContraVistoria(d, c.id, { data: '2026-05-10', arquivo: 'cv.pdf' }, 'julio', '2026-11-20'), /antes da entrada do inquilino \(01\/06\/2026\)/);
  R.registrarContraVistoria(d, c.id, { data: '2026-06-05', arquivo: 'cv.pdf' }, 'julio', '2026-11-20');
  assert.throws(() => R.marcarDocumento(d, c.id, 'doc_contrato_em', '2030-01-01', 'julio', 'c.pdf', '2026-11-20'), /depois de hoje/);
});

test('entrada-021: reserva já devolvida (ficha reprovada e reaberta) não vai para o contrato', () => {
  const { d, loja } = base();
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Ana Ficha', inquilino_tipo: 'Pessoa física', situacao: 'Aprovada', imoveis_ids: [loja.id], reserva_valor: 100000, reserva_data: '2026-11-17', devolucao_data: '2026-11-19', devolucao_valor: 100000 }, 'julio');
  assert.equal(R.dadosDaFicha(d, f).reserva_valor, undefined);
});

test('mensal-008/H: valores do pagamento e do boleto pago com NF de R$ 0,00 (carência) aceitos só quando o devido é zero', () => {
  const { d, c } = base();
  Object.assign(c, { carencia_meses: 1, carencia_inicio: '2026-09', carencia_cobrar_iptu: false, taxa_boleto: 0 });
  R.gerarCobrancas(d, '2026-09', 'julio');
  const set = R.boletoDoMes(d, c.id, '2026-09');
  R.registrarPagamento(d, set.id, '2026-10-01', 0, 'julio');
  assert.equal(set.valor_nf, 0);
  assert.equal(R.pendentesDeFatura(d).filter((p) => p.registro.id === set.id).length, 0);
});
