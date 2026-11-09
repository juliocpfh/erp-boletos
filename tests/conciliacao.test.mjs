import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as R from '../docs/js/regras.js';
import * as Z from '../docs/js/conciliacao.js';

// Dados fictícios (CPF e CNPJ de teste); duas empresas com conta no C6 (ank e jck).
function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const jck = R.inserir(d, 'emitentes', { nome: 'JCK ADMINISTRADORA', razao_social: 'JCK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Prof. Nilo Brandão, 117', complemento: 'Loja 1', cidade: 'Curitiba',
    sanepar_matricula: '123456', copel_uc: '7890', inscricao_iptu: '01.234.567' }, 'julio');
  const sobre = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Sobreloja Água', endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'julio');
  for (const e of [ank, jck]) R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: e.id, percentual: 50 }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: sobre.id, emitente_id: jck.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    inquilino_telefone: '41 90000-0000', data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07', aluguel_inicial: 135000,
    dia_vencimento: 10, cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 10, taxa_boleto: 350,
    multa_percentual: 10, juros_mensal_percentual: 1, cobrar_iptu: true, reserva_valor: 50000 }, 'julio');
  const iptu = R.inserir(d, 'iptus', { imovel_id: loja.id, ano: 2026, valor_total: 100000, num_parcelas: 10, primeira_competencia: '2026-02' }, 'julio');
  d.config_banco = { ativo: true, provedor: 'c6', ponte_url: 'http://localhost:8765', senha_ponte: 'x', conta_padrao_id: 'ank',
    contas: [{ id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox' }, { id: 'jck', apelido: 'JCK', emitente_id: jck.id, ambiente: 'sandbox' }] };
  R.normalizar(d);
  R.gerarCobrancas(d, '2026-06', 'julio'); // junho usa a reserva
  R.gerarCobrancas(d, '2026-07', 'julio'); // boleto 2: vence 10/08/2026, em dia R$ 1.318,50
  return { d, ank, jck, loja, sobre, c, iptu, cb2: d.cobrancas[1] };
}

// Lançamentos no formato do extrato do C6 (entries[] de saldo-extrato.yaml)
const entrada = (reference, entry_date, amount, extra = {}) => ({ reference, local_reference: `L${reference}`, created_at: `${entry_date}T10:00:00`, entry_date, amount,
  operation_type: 'INCOMING', transaction_type: 'CREDIT_PIX_PAYMENT_RECEIVED', title: 'Pix Recebido', description: 'PIX RECEBIDO MARIA EXEMPLO', end_to_end_id: `E${reference}`, ...extra });
const saida = (reference, entry_date, amount, description, extra = {}) => ({ reference, created_at: `${entry_date}T10:00:00`, entry_date, amount,
  operation_type: 'OUTGOING', transaction_type: 'PAYMENT', title: 'Pagamento', description, ...extra });
const importar = (d, conta, lancs, opts) => Z.importarExtrato(d, conta, lancs, 'julio', opts);

test('importação do extrato: converte "1500.00" em centavos, nunca repete o reference na mesma conta e grava até onde importou', () => {
  const { d } = base();
  const lancs = [saida('r1', '2026-11-05', '123.45', 'PAGAMENTO BOLETO SANEPAR MATR 123456'), entrada('r2', '2026-08-10', '1318.50'), saida('r3', '2026-11-03', '1500.00', 'TARIFA PACOTE')];
  const antes = d.historico.length;
  const r = importar(d, 'ank', lancs, { de: '2026-11-01', ate: '2026-11-05' });
  assert.equal(r.novas.length, 3);
  assert.equal(r.repetidas, 0);
  assert.deepEqual(r.novas.map((m) => [m.valor, m.tipo, m.categoria_banco]), [[12345, 'saida', 'PAYMENT'], [131850, 'entrada', 'CREDIT_PIX_PAYMENT_RECEIVED'], [150000, 'saida', 'PAYMENT']]);
  assert.equal(r.novas[0].id_externo, 'r1');
  assert.equal(r.novas[0].classificacao, null);
  assert.equal(d.historico.filter((h) => h.acao === 'Inclusão' && h.tabela === 'movimentacoes_banco').length - 0, 3);
  assert.ok(d.historico.length >= antes + 4);
  assert.equal(R.extratoImportadoAte(d, 'ank'), '2026-11-05');
  const r2 = importar(d, 'ank', lancs);
  assert.deepEqual([r2.novas.length, r2.repetidas], [0, 3]);
  assert.equal(d.movimentacoes_banco.length, 3);
  // o mesmo reference na outra conta é outra movimentação (contas separadas)
  const r3 = importar(d, 'jck', [lancs[2]]);
  assert.equal(r3.novas.length, 1);
  assert.throws(() => importar(d, 'xyz', lancs), /não está configurada/);
  // formato já normalizado pela ponte: valor negativo vira saída
  const r4 = importar(d, 'jck', [{ id_externo: 'p1', data: '2026-11-04', valor_centavos: -5000, descricao: 'TED PARA ANK ADMINISTRADORA', categoria: 'TRANSFER' }]);
  assert.deepEqual([r4.novas[0].valor, r4.novas[0].tipo, r4.novas[0].categoria_banco], [5000, 'saida', 'TRANSFER']);
  assert.throws(() => importar(d, 'ank', [{ amount: '1.00', entry_date: '2026-11-01' }]), /reference/);
});

test('centavos do C6 e janelas de 30 dias para o extrato', () => {
  assert.equal(Z.centavosDoC6('1500.00'), 150000);
  assert.equal(Z.centavosDoC6('0.10'), 10);
  assert.equal(Z.centavosDoC6(123.45), 12345);
  assert.throws(() => Z.centavosDoC6('abc'), /inválido/);
  assert.equal(Z.reaisParaC6(131850), 1318.5);
  assert.deepEqual(Z.janelasDe30Dias('2026-10-01', '2026-10-31'), [{ de: '2026-10-01', ate: '2026-10-30' }, { de: '2026-10-31', ate: '2026-10-31' }]);
  assert.deepEqual(Z.janelasDe30Dias('2026-10-01', '2026-10-30'), [{ de: '2026-10-01', ate: '2026-10-30' }]);
  assert.deepEqual(Z.janelasDe30Dias('2026-10-05', '2026-10-01'), []);
});

test('nome padrão do comprovante: sem acento, sem caracteres proibidos, pelo modelo configurável', () => {
  const { d, loja, sobre, cb2 } = base();
  const [mov] = importar(d, 'ank', [saida('r1', '2026-11-05', '123.45', 'PAGAMENTO SANEPAR')]).novas;
  Z.vincularMovimentacao(d, mov.id, { classificacao: 'conta_imovel', imovel_id: sobre.id, tipo_despesa: 'Água', competencia: '2026-11' }, 'julio');
  assert.equal(Z.nomeComprovante(d, mov), '2026-11-05 ANK Sobreloja Agua Agua 123,45.pdf');
  assert.equal(Z.nomePadraoComprovante(d, mov), Z.nomeComprovante(d, mov));
  assert.equal(Z.nomeComprovante(d, mov, { modelo: '{mes} {imovel} {tipo}', extensao: '' }), '2026-11 Sobreloja Agua Agua');
  d.config_banco.modelo_nome_comprovante = '{empresa}-{data}-{valor}';
  assert.equal(Z.nomeComprovante(d, mov), 'ANK-2026-11-05-123,45.pdf');
  d.config_banco.modelo_nome_comprovante = '{data} {empresa} {imovel} {tipo} {valor}';
  // sem imóvel: "Geral"; tarifa
  const [tar] = importar(d, 'jck', [saida('t1', '2026-11-03', '15.00', 'TARIFA PACOTE: SERVIÇOS/MÊS?*')]).novas;
  Z.vincularMovimentacao(d, tar.id, { classificacao: 'tarifa' }, 'julio');
  assert.equal(Z.nomeComprovante(d, tar), '2026-11-03 JCK Geral Tarifa 15,00.pdf');
  assert.equal(Z.nomeSemAcento('Serviços: mês?*/ "x" <y>'), 'Servicos mes x y');
  // aluguel recebido
  const [rec] = importar(d, 'ank', [entrada('e1', '2026-08-10', '1318.50')]).novas;
  Z.confirmarPagamentoPeloBanco(d, cb2.id, rec.id, 'julio');
  assert.equal(Z.nomeComprovante(d, rec), '2026-08-10 ANK Loja 1 Aluguel Maria Exemplo 1.318,50.pdf');
  // limite de 120 caracteres (mais a extensão)
  loja.nome = 'L'.repeat(200);
  assert.equal(Z.nomeComprovante(d, rec).length, 124);
  assert.equal(Z.nomeComprovante(d, { conta_id: 'ank', valor: 100, data: '2026-01-01', classificacao: null, titulo: 'Pix Enviado' }), '2026-01-01 ANK Geral Pix Enviado 1,00.pdf');
});

test('sugestão de destino: palavras da descrição com o imóvel pela matrícula, boleto pelo valor, tarifa, transferência e memória', () => {
  const { d, loja, cb2 } = base();
  const { novas } = importar(d, 'ank', [
    saida('r1', '2026-11-05', '123.45', 'PAGAMENTO BOLETO SANEPAR MATR 123456'),
    entrada('r2', '2026-08-10', '1318.50'),
    saida('r3', '2026-11-03', '15.00', 'TARIFA PACOTE DE SERVICOS'),
    saida('r4', '2026-11-04', '500.00', 'TED PARA JCK ADMINISTRADORA', { transaction_type: 'TRANSFER' }),
    saida('r5', '2026-11-06', '98.00', 'PAGAMENTO COPEL UC 7890'),
    saida('r6', '2026-11-07', '100.00', 'IPTU PREFEITURA CURITIBA INSC 01.234.567 PARC 1'),
    saida('r7', '2026-11-08', '77.00', 'DEB AUTOM INTERNET FIBRA 88'),
  ]);
  const [agua, pix, tarifa, ted, luz, iptu, net] = novas;
  let s = Z.sugerirDestino(d, agua);
  assert.deepEqual([s.classificacao, s.imovel_id, s.tipo_despesa, s.confianca], ['conta_imovel', loja.id, 'Água', 'media']);
  s = Z.sugerirDestino(d, pix);
  assert.deepEqual([s.classificacao, s.cobranca_id, s.imovel_id, s.confianca], ['boleto', cb2.id, loja.id, 'alta']);
  assert.equal(Z.sugerirClassificacao(d, tarifa).classificacao, 'tarifa');
  // transferência: cita a outra empresa (sem a outra ponta no extrato da JCK)
  assert.deepEqual([Z.sugerirDestino(d, ted).classificacao, Z.sugerirDestino(d, ted).confianca], ['transferencia', 'alta']);
  // com a outra ponta importada na JCK, a sugestão traz o par
  const [par] = importar(d, 'jck', [{ ...entrada('j1', '2026-11-04', '500.00', { transaction_type: 'TRANSFER', description: 'TED RECEBIDA ANK ADMINISTRADORA', title: 'Transferência recebida' }) }]).novas;
  assert.equal(Z.sugerirDestino(d, ted).par_movimentacao_id, par.id);
  s = Z.sugerirDestino(d, luz);
  assert.deepEqual([s.classificacao, s.imovel_id, s.tipo_despesa], ['conta_imovel', loja.id, 'Luz']);
  s = Z.sugerirDestino(d, iptu);
  assert.deepEqual([s.classificacao, s.imovel_id, s.iptu.n, s.confianca], ['iptu', loja.id, 1, 'alta']);
  // a parcela citada na descrição vale mais que a primeira em aberto com o mesmo valor (todas de R$ 100,00)
  for (const [desc, n] of [['IPTU PREFEITURA CURITIBA INSC 01.234.567 PARCELA 3/10', 3], ['IPTU PREF CURITIBA 01.234.567 PARC 04', 4], ['IPTU 01.234.567 3ª PARCELA', 3], ['IPTU 01.234.567 2A PARC', 2]]) {
    const [m] = importar(d, 'ank', [saida(`p${n}${desc.length}`, '2026-11-09', '100.00', desc)]).novas;
    s = Z.sugerirDestino(d, m);
    assert.deepEqual([s.classificacao, s.iptu.n, s.confianca], ['iptu', n, 'alta'], desc);
    assert.match(s.motivo, /parcela citada/);
  }
  assert.deepEqual([Z.parcelaCitada('PARCELA 3/10'), Z.parcelaCitada('PARC. 07'), Z.parcelaCitada('3ª PARCELA'), Z.parcelaCitada('COTA UNICA'), Z.parcelaCitada('IPTU PREFEITURA')], [3, 7, 3, 0, null]);
  // parcela citada já paga: cai na regra do valor (primeira em aberto)
  R.marcarIptuPago(d, d.iptus[0].id, 5, '2026-06-10', 'julio');
  const [paga] = importar(d, 'ank', [saida('p5x', '2026-11-09', '100.00', 'IPTU 01.234.567 PARCELA 5/10')]).novas;
  assert.equal(Z.sugerirDestino(d, paga).iptu.n, 1);
  s = Z.sugerirDestino(d, net);
  assert.deepEqual([s.classificacao, s.imovel_id, s.tipo_despesa, s.confianca], ['conta_imovel', null, 'Internet', 'baixa'], 'palavra sem imóvel conhecido: sugestão fraca');
});

test('sugestão por memória: repete o destino da última movimentação com a mesma descrição (sem números)', () => {
  const { d, sobre } = base();
  const { novas: [a, b] } = importar(d, 'jck', [saida('r1', '2026-10-05', '77.00', 'DEB AUTOM FIBRANET 1234'), saida('r2', '2026-11-05', '79.00', 'DEB AUTOM FIBRANET 5678')]);
  assert.equal(Z.sugerirDestino(d, b).confianca, 'baixa');
  Z.vincularMovimentacao(d, a.id, { classificacao: 'conta_imovel', imovel_id: sobre.id, tipo_despesa: 'Internet', competencia: '2026-10' }, 'julio');
  const s = Z.sugerirDestino(d, b);
  assert.deepEqual([s.classificacao, s.imovel_id, s.tipo_despesa, s.confianca], ['conta_imovel', sobre.id, 'Internet', 'media']);
});

test('conciliação de boletos pela listagem do C6: por external_reference_id e por valor + data (em dia, com encargos, dois iguais)', () => {
  const { d, c, cb2 } = base();
  // pago em dia, creditado depois do vencimento
  let sug = Z.conciliarBoletos(d, 'ank', [{ external_reference_id: null, payments: [{ amount: '1318.50', external_payment_id: 'p1', payment_date: '2026-08-10', credit_date: '2026-08-11', payment_type: 'PIX' }] }]);
  assert.equal(sug.length, 1);
  assert.deepEqual([sug[0].cobranca_id, sug[0].data_credito, sug[0].valor, sug[0].certeza, sug[0].pagouEmDia, sug[0].external_payment_id], [cb2.id, '2026-08-11', 131850, 'exata', true, 'p1']);
  // atrasado: valor cheio + multa + juros em 20/08 (R$ 1.603,65) casa pelo previsto
  sug = Z.conciliarBoletos(d, 'ank', [{ amount: '1603.65', payment_date: '2026-08-20', credit_date: '2026-08-20' }]);
  assert.deepEqual([sug[0].cobranca_id, sug[0].certeza, sug[0].pagouEmDia], [cb2.id, 'exata', false]);
  // valor em dia mas 5 dias depois do vencimento (tolerância 3): não casa
  assert.equal(Z.conciliarBoletos(d, 'ank', [{ amount: '1318.50', payment_date: '2026-08-15', credit_date: '2026-08-15' }]).length, 0);
  assert.equal(Z.conciliarBoletos(d, 'ank', [{ amount: '1318.50', payment_date: '2026-08-15', credit_date: '2026-08-15' }], { dias: 10 }).length, 1);
  // external_reference_id vence o valor
  cb2.banco = { id_externo: 'ANK00000000000000000000002', nosso_numero: '123' };
  sug = Z.conciliarBoletos(d, 'ank', [{ external_reference_id: 'ANK00000000000000000000002', payments: [{ amount: '1000.00', payment_date: '2026-08-10', credit_date: '2026-08-10' }] }]);
  assert.deepEqual([sug[0].cobranca_id, sug[0].certeza, sug[0].valor], [cb2.id, 'exata', 100000]);
  // dois boletos com o mesmo valor em aberto: ambos "provável" (nunca automático)
  const c2 = R.inserir(d, 'contratos', { ...c, id: undefined, inquilino_nome: 'João Teste', inquilino_cpf: '529.982.247-25', imovel_id: d.imoveis[1].id, reserva_valor: 0, cobrar_iptu: false }, 'julio');
  R.gerarCobrancas(d, '2026-07', 'julio');
  const cbJ = d.cobrancas.find((x) => x.contrato_id === c2.id);
  assert.equal(R.totais(cbJ).a_pagar_pontual, 121850);
  cbJ.aluguel = cb2.aluguel; cbJ.desconto = cb2.desconto; cbJ.iptu = cb2.iptu; // força o mesmo valor
  sug = Z.conciliarBoletos(d, 'ank', [{ amount: '1318.50', payment_date: '2026-08-10', credit_date: '2026-08-10' }]);
  assert.deepEqual(sug.map((x) => x.certeza), ['provavel', 'provavel']);
  // boleto já pago com o id conhecido: nada a sugerir
  R.registrarPagamento(d, cb2.id, '2026-08-10', null, 'julio');
  assert.equal(Z.conciliarBoletos(d, 'ank', [{ external_reference_id: 'ANK00000000000000000000002', payments: [{ amount: '1318.50', payment_date: '2026-08-10', credit_date: '2026-08-10' }] }]).length, 0);
});

test('conciliação pelo extrato: só entradas casam; nosso número do boleto vence o valor', () => {
  const { d, cb2 } = base();
  const { novas: [ent, sai] } = importar(d, 'ank', [entrada('e1', '2026-08-10', '1318.50'), saida('s1', '2026-08-10', '1318.50', 'PAGAMENTO')]);
  let sug = Z.conciliarMovimentacoes(d, [ent, sai]);
  assert.deepEqual(sug.map((x) => [x.movimentacao_id, x.cobranca_id, x.certeza]), [[ent.id, cb2.id, 'exata']]);
  cb2.banco = { id_externo: 'X', nosso_numero: '777' };
  const [nn] = importar(d, 'jck', [{ id_externo: 'n1', data: '2026-08-12', valor_centavos: 99999, tipo: 'entrada', descricao: 'LIQUIDACAO BOLETO', categoria: 'BOLETO', nosso_numero: '777' }]).novas;
  sug = Z.conciliarMovimentacoes(d, [nn]);
  assert.deepEqual([sug[0].cobranca_id, sug[0].certeza], [cb2.id, 'exata']);
});

test('confirmar pagamento pelo banco: grava data de crédito, liga os dois lados, não duplica e o estorno limpa tudo', () => {
  const { d, cb2, loja } = base();
  const { novas: [ent, ent2] } = importar(d, 'ank', [entrada('e1', '2026-08-11', '1318.50'), entrada('e2', '2026-08-12', '1300.00')]);
  const r = Z.confirmarPagamentoPeloBanco(d, cb2.id, ent.id, 'julio');
  assert.equal(r.divergente, false);
  const cb = R.buscar(d, 'cobrancas', cb2.id);
  assert.deepEqual([cb.data_pagamento, cb.valor_pago, cb.situacao, cb.pagou_em_dia, cb.movimentacao_id], ['2026-08-11', 131850, 'Paga em dia', true, ent.id]);
  const mov = R.buscar(d, 'movimentacoes_banco', ent.id);
  assert.deepEqual([mov.classificacao, mov.cobranca_id, mov.imovel_id], ['boleto', cb2.id, loja.id]);
  // segunda confirmação (já pago) lança; movimentação já usada lança
  assert.throws(() => Z.confirmarPagamentoPeloBanco(d, cb2.id, ent2.id, 'julio'), /já está pago/);
  assert.throws(() => Z.confirmarPagamentoPeloBanco(d, d.cobrancas[0].id, ent.id, 'julio'), /já tem destino/);
  R.estornarPagamento(d, cb2.id, 'julio');
  // estorno limpou os dois lados
  assert.equal(R.buscar(d, 'cobrancas', cb2.id).movimentacao_id, null);
  assert.deepEqual([R.buscar(d, 'movimentacoes_banco', ent.id).classificacao, R.buscar(d, 'movimentacoes_banco', ent.id).cobranca_id], [null, null]);
  // ordem do plano (mov, boleto) e via vincularMovimentacao
  assert.equal(Z.confirmarPagamentoPeloExtrato(d, ent.id, cb2.id, 'julio').divergente, false);
  R.estornarPagamento(d, cb2.id, 'julio');
  // divergente: devolve sem gravar; com valor da NF e justificativa grava nf_manual
  // creditado em 12/08 (depois do vencimento) com valor estranho: o previsto é com multa e juros até 12/08; se o inquilino pagou em dia, a tela marca
  let dv = Z.vincularMovimentacao(d, ent2.id, { classificacao: 'boleto', cobranca_id: cb2.id }, 'julio');
  assert.deepEqual([dv.divergente, dv.previsto, dv.recebido], [true, 159981, 130000]);
  dv = Z.vincularMovimentacao(d, ent2.id, { classificacao: 'boleto', cobranca_id: cb2.id, pagouEmDia: true }, 'julio');
  assert.deepEqual([dv.divergente, dv.previsto, dv.recebido], [true, 131850, 130000]);
  assert.equal(R.buscar(d, 'cobrancas', cb2.id).data_pagamento, null);
  assert.equal(R.buscar(d, 'movimentacoes_banco', ent2.id).classificacao, null);
  Z.confirmarPagamentoPeloBanco(d, cb2.id, ent2.id, 'julio', { pagouEmDia: true, valorNf: 130000, justificativa: 'Inquilino pagou a menos; acerto no mês seguinte' });
  const pago = R.buscar(d, 'cobrancas', cb2.id);
  assert.deepEqual([pago.valor_pago, pago.nf_manual, pago.valor_nf, pago.movimentacao_id], [130000, true, 130000, ent2.id]);
  assert.throws(() => Z.desvincularMovimentacao(d, ent2.id, 'julio'), /Desfaça o pagamento do boleto/);
  // uma saída não confirma boleto
  const [sai] = importar(d, 'ank', [saida('s1', '2026-08-10', '1318.50', 'X')]).novas;
  R.estornarPagamento(d, cb2.id, 'julio');
  assert.throws(() => Z.confirmarPagamentoPeloBanco(d, cb2.id, sai.id, 'julio'), /entrada/);
});

test('confirmar pagamento pela listagem do Bolepix (sem extrato): usa credit_date e guarda o pagamento do C6 no boleto', () => {
  const { d, cb2 } = base();
  const pag = { amount: '1318.50', external_payment_id: 'p1', payment_date: '2026-08-10', credit_date: '2026-08-11', payment_type: 'PIX' };
  const r = Z.confirmarPagamentoPeloBanco(d, cb2.id, pag, 'julio');
  assert.equal(r.divergente, false);
  const cb = R.buscar(d, 'cobrancas', cb2.id);
  assert.deepEqual([cb.data_pagamento, cb.pagou_em_dia, cb.situacao, cb.pagamento_c6.external_payment_id, cb.pagamento_c6.credit_date], ['2026-08-11', true, 'Paga em dia', 'p1', '2026-08-11']);
  assert.throws(() => Z.confirmarPagamentoPeloBanco(d, cb2.id, pag, 'julio'), /já está pago/);
  R.estornarPagamento(d, cb2.id, 'julio');
  assert.equal(R.buscar(d, 'cobrancas', cb2.id).pagamento_c6, null);
  // atrasado: pagou em 20/08 (multa e juros até lá), creditado em 21/08
  const r2 = Z.confirmarPagamentoPeloBanco(d, cb2.id, { amount: '1603.65', payment_date: '2026-08-20', credit_date: '2026-08-21' }, 'julio');
  assert.equal(r2.divergente, false);
  assert.deepEqual([R.buscar(d, 'cobrancas', cb2.id).data_pagou, R.buscar(d, 'cobrancas', cb2.id).situacao, R.buscar(d, 'cobrancas', cb2.id).multa], ['2026-08-20', 'Paga com atraso', 14535]);
});

test('destino "conta do imóvel": cria a conta ligada, respeita quem paga pelo contrato e o desfazer exclui a conta e devolve os arquivos', () => {
  const { d, loja, sobre, ank } = base();
  const { novas: [a, b] } = importar(d, 'ank', [saida('r1', '2026-11-05', '123.45', 'SANEPAR'), saida('r2', '2026-11-06', '98.00', 'COPEL')]);
  // Loja 1 ocupada por Maria desde 06/2026 (a água é dela pelo contrato): mesmo assim a conta nossa entra (débito antigo, troca de titular...)
  Z.vincularMovimentacao(d, a.id, { classificacao: 'conta_imovel', imovel_id: loja.id, tipo_despesa: 'Água', competencia: '2026-11' }, 'julio');
  assert.equal(R.buscar(d, 'movimentacoes_banco', a.id).classificacao, 'conta_imovel');
  Z.desvincularMovimentacao(d, a.id, 'julio');
  assert.deepEqual([R.buscar(d, 'movimentacoes_banco', a.id).classificacao, d.despesas.length], [null, 0]);
  assert.throws(() => Z.vincularMovimentacao(d, a.id, { classificacao: 'conta_imovel', imovel_id: sobre.id }, 'julio'), /Escolha a conta/);
  Z.vincularMovimentacao(d, a.id, { classificacao: 'conta_imovel', imovel_id: sobre.id, tipo_despesa: 'Água', competencia: '2026-11', observacoes: 'conta do mês' }, 'julio');
  const mov = R.buscar(d, 'movimentacoes_banco', a.id);
  const de = R.buscar(d, 'despesas', mov.despesa_id);
  assert.deepEqual([de.imovel_id, de.tipo, de.competencia, de.valor, de.data_pagamento, de.movimentacao_id], [sobre.id, 'Água', '2026-11', 12345, '2026-11-05', a.id]);
  assert.deepEqual([mov.classificacao, mov.imovel_id, mov.classificada_por, mov.despesa_criada], ['conta_imovel', sobre.id, 'julio', true]);
  assert.throws(() => Z.vincularMovimentacao(d, a.id, { classificacao: 'tarifa' }, 'julio'), /já tem destino/);
  // comprovante guardado nas duas pastas
  Z.registrarComprovante(d, a.id, { comprovante: '2026-11-05 ANK Sobreloja Agua Agua 123,45.pdf', comprovante_contador: '2026-11-05 ANK Sobreloja Agua Agua 123,45.pdf', origem: 'banco' }, 'julio');
  assert.equal(R.buscar(d, 'despesas', de.id).comprovante, '2026-11-05 ANK Sobreloja Agua Agua 123,45.pdf');
  const refs = R.arquivosReferenciados(d).filter((x) => x.nome.includes('Agua'));
  assert.deepEqual(refs.map((x) => [x.escopo, x.id]), [['contasano', R.idPastaAno(sobre.id, 2026)], ['contador', R.idContador(ank.id, '2026-11')]]);
  assert.deepEqual(Z.escopoDoComprovante(d, mov), { escopo: 'contasano', id: sobre.id * 10000 + 2026 });
  assert.deepEqual(Z.escopoContador(d, mov), { escopo: 'contador', id: ank.id * 1000000 + 202611 });
  const r = Z.desvincularMovimentacao(d, a.id, 'julio');
  assert.equal(r.arquivos.length, 2);
  assert.equal(d.despesas.length, 0, 'a conta criada pela movimentação é excluída');
  assert.deepEqual([R.buscar(d, 'movimentacoes_banco', a.id).classificacao, R.buscar(d, 'movimentacoes_banco', a.id).comprovante], [null, null]);
  assert.equal(R.arquivosReferenciados(d).length, 0);
  // ligar a uma conta já lançada: no desfazer ela só perde o vínculo
  const [lanc] = R.lancarDespesas(d, sobre.id, '2026-11', [{ tipo: 'Luz', valor: 9800, data_pagamento: '2026-11-01' }], 'julio');
  Z.vincularMovimentacao(d, b.id, { classificacao: 'conta_imovel', despesa_id: lanc.id }, 'julio');
  assert.deepEqual([R.buscar(d, 'despesas', lanc.id).movimentacao_id, R.buscar(d, 'despesas', lanc.id).data_pagamento], [b.id, '2026-11-06']);
  Z.desvincularMovimentacao(d, b.id, 'julio');
  assert.equal(d.despesas.length, 1);
  assert.equal(R.buscar(d, 'despesas', lanc.id).movimentacao_id, null);
});

test('destino IPTU marca a parcela paga pelo proprietário e o desfazer devolve; transferência liga o par; imposto grava a guia', () => {
  const { d, loja, iptu, ank } = base();
  const { novas: [m1, m2, ted] } = importar(d, 'ank', [saida('i1', '2026-02-10', '100.00', 'IPTU PREFEITURA'), saida('i2', '2026-03-10', '100.00', 'IPTU PREFEITURA'), saida('t1', '2026-11-04', '500.00', 'TED PARA JCK', { transaction_type: 'TRANSFER' })]);
  assert.throws(() => Z.vincularMovimentacao(d, m1.id, { classificacao: 'iptu', iptu_id: iptu.id, iptu_parcela: 99 }, 'julio'), /parcela/);
  Z.vincularMovimentacao(d, m1.id, { classificacao: 'iptu', iptu_id: iptu.id, iptu_parcela: 1 }, 'julio');
  assert.equal(R.buscar(d, 'iptus', iptu.id).pagas[1], '2026-02-10');
  assert.deepEqual([R.buscar(d, 'movimentacoes_banco', m1.id).imovel_id, R.buscar(d, 'movimentacoes_banco', m1.id).iptu_parcela], [loja.id, 1]);
  assert.throws(() => Z.vincularMovimentacao(d, m2.id, { classificacao: 'iptu', iptu_id: iptu.id, iptu_parcela: 1 }, 'julio'), /já está marcada como paga/);
  // parcela toda do inquilino (Maria desde 06/2026 com IPTU no boleto): 7ª parcela (competência 08/2026) não é do proprietário
  assert.throws(() => Z.vincularMovimentacao(d, m2.id, { classificacao: 'iptu', iptu_id: iptu.id, iptu_parcela: 7 }, 'julio'), /toda do inquilino/);
  Z.registrarComprovante(d, m1.id, { comprovante: 'iptu.pdf' }, 'julio');
  assert.deepEqual(R.arquivosReferenciados(d)[0], { escopo: 'iptuano', id: R.idPastaAno(loja.id, 2026), nome: 'iptu.pdf' });
  assert.match(R.rotulosDosArquivos(d).get(`iptuano:${R.idPastaAno(loja.id, 2026)}|iptu.pdf`), /comprovante do banco ANK: IPTU 2026 1ª parcela \(10\/02\/2026, R\$ 100,00\)/);
  Z.desvincularMovimentacao(d, m1.id, 'julio');
  assert.equal(R.buscar(d, 'iptus', iptu.id).pagas[1], undefined);
  // transferência: a outra ponta na JCK
  const [par] = importar(d, 'jck', [entrada('j1', '2026-11-05', '500.00', { transaction_type: 'TRANSFER', description: 'TED RECEBIDA ANK' })]).novas;
  Z.vincularMovimentacao(d, ted.id, { classificacao: 'transferencia' }, 'julio');
  assert.deepEqual([R.buscar(d, 'movimentacoes_banco', ted.id).par_movimentacao_id, R.buscar(d, 'movimentacoes_banco', par.id).classificacao, R.buscar(d, 'movimentacoes_banco', par.id).par_movimentacao_id], [par.id, 'transferencia', ted.id]);
  Z.desvincularMovimentacao(d, ted.id, 'julio');
  assert.deepEqual([R.buscar(d, 'movimentacoes_banco', par.id).classificacao, R.buscar(d, 'movimentacoes_banco', par.id).par_movimentacao_id], [null, null]);
  // imposto com guia
  R.salvarGuiaImposto(d, ank.id, 'PIS/COFINS', '2026-10', 36500, 'julio');
  const g = d.guias_impostos[0];
  const [darf] = importar(d, 'ank', [saida('d1', '2026-11-25', '365.00', 'DARF RECEITA FEDERAL')]).novas;
  assert.equal(Z.sugerirDestino(d, darf).classificacao, 'imposto');
  Z.vincularMovimentacao(d, darf.id, { classificacao: 'imposto', guia_imposto_id: g.id }, 'julio');
  assert.deepEqual([R.buscar(d, 'guias_impostos', g.id).paga_em, R.buscar(d, 'guias_impostos', g.id).movimentacao_id], ['2026-11-25', darf.id]);
  Z.desvincularMovimentacao(d, darf.id, 'julio');
  assert.equal(R.buscar(d, 'guias_impostos', g.id).paga_em, null);
  // ignorar e outro
  const [ign] = importar(d, 'ank', [saida('x1', '2026-11-25', '1.00', 'X')]).novas;
  Z.vincularMovimentacao(d, ign.id, { classificacao: 'ignorar' }, 'julio');
  assert.equal(Z.movimentacoesDo(d, { conta_id: 'ank', mes: '2026-11', filtro: 'pendentes' }).length, 2, 'a TED e o DARF voltaram a ficar sem destino; a ignorada não conta');
  assert.equal(Z.movimentacoesDo(d, { conta_id: 'ank', filtro: 'sem_comprovante' }).length, 0);
  assert.throws(() => Z.vincularMovimentacao(d, darf.id, { classificacao: 'inventada' }, 'julio'), /Escolha o destino/);
});

test('consulta: movimentações por conta, mês, imóvel e filtro; resumo da conta; conta sugerida do imóvel', () => {
  const { d, loja, sobre } = base();
  importar(d, 'ank', [saida('r1', '2026-11-05', '10.00', 'A'), entrada('r2', '2026-11-06', '20.00'), saida('r3', '2026-10-30', '5.00', 'B')], { ate: '2026-11-06' });
  importar(d, 'jck', [saida('j1', '2026-11-05', '7.00', 'C')]);
  assert.deepEqual(Z.movimentacoesDo(d, { conta_id: 'ank', mes: '2026-11' }).map((m) => m.id_externo), ['r2', 'r1']);
  assert.deepEqual(Z.movimentacoesDo(d, { filtro: 'saidas' }).map((m) => m.id_externo), ['j1', 'r1', 'r3'], 'data mais nova primeiro; na mesma data, a mais recente');
  assert.deepEqual(Z.movimentacoesDo(d, { filtro: 'entradas' }).map((m) => m.id_externo), ['r2']);
  const r = Z.resumoBanco(d, 'ank', '2026-11');
  assert.deepEqual(r, { entradas: 2000, saidas: 1000, total: 2, pendentes: 2, semComprovante: 0, importadoAte: '2026-11-06' });
  assert.equal(Z.contaSugeridaDoImovel(d, sobre.id), 'jck');
  assert.equal(Z.contaSugeridaDoImovel(d, loja.id), 'ank', 'empate 50/50: conta padrão');
  assert.equal(Z.empresaDaConta(d, 'jck').nome, 'JCK ADMINISTRADORA');
  assert.equal(Z.contaDo(d, 'xx'), null);
});

test('pagamentos pelo banco: preparar (validações), aprovar, lote enviado, situação do C6, pago cria a conta do imóvel, cancelar', () => {
  const { d, loja, sobre, iptu } = base();
  const linha = '34191090080012345678901234567890123456789012345'; // 47 dígitos fictícios
  const dados = { conta_id: 'jck', imovel_id: sobre.id, origem: { tipo: 'avulso' }, tipo_conta: 'Luz', competencia: '2026-11', forma: 'boleto', codigo_barras: linha,
    beneficiario: { nome: 'COPEL', documento: '11.222.333/0001-81' }, valor: 20000, vencimento: '2026-11-15', data_pagamento: '2026-11-10' };
  assert.throws(() => Z.prepararPagamentos(d, [dados], 'ana'), /desligados/);
  d.config_banco.permitir_pagamentos = true;
  assert.throws(() => Z.prepararPagamentos(d, [{ ...dados, valor: 0 }], 'ana'), /Informe o valor/);
  d.config_banco.limite_pagamento = 10000;
  assert.throws(() => Z.prepararPagamentos(d, [dados], 'ana'), /limite por pagamento/);
  assert.throws(() => Z.prepararPagamentos(d, [dados], 'ana'), C.ErroUsuario, 'erro do usuário: a tela mostra, mas não vai ao console');
  d.config_banco.limite_pagamento = 0;
  assert.throws(() => Z.prepararPagamentos(d, [{ ...dados, codigo_barras: '123456789012345678901234567890' }], 'ana'), /30 dígitos/);
  assert.throws(() => Z.prepararPagamentos(d, [{ ...dados, conta_id: 'zzz' }], 'ana'), /não está configurada/);
  assert.throws(() => Z.prepararPagamentos(d, [{ ...dados, imovel_id: loja.id }], 'ana'), /o inquilino paga Luz/);
  assert.throws(() => Z.prepararPagamentos(d, [{ ...dados, forma: 'pix', codigo_barras: null }], 'ana'), /Pix/);
  assert.equal(d.pagamentos_banco.length, 0, 'nada foi gravado pelas tentativas inválidas');
  const [p] = Z.prepararPagamentos(d, [dados], 'ana');
  assert.deepEqual([p.situacao, p.referencia, p.content.length, p.amount, p.transaction_date, p.criado_por, p.imovel_id], ['rascunho', `erp-${p.id}`, 44, 200, '2026-11-10', 'ana', sobre.id]);
  assert.equal(p.content, Z.codigoDeBarras(linha));
  assert.equal(p.content.slice(0, 4), '3419');
  assert.ok(p.description.length <= 100 && p.description.includes('Sobreloja Agua') && p.description.includes(`erp-${p.id}`));
  assert.deepEqual(Z.itemC6(d, p), { content: p.content, amount: 200, description: p.description, transaction_date: '2026-11-10' });
  // só o administrador aprova (a tela confere o papel); só de rascunho
  assert.throws(() => Z.registrarGrupoEnviado(d, [p.id], 'g1', [], 'julio') && Z.aprovarPagamento(d, p.id, 'julio'), /não pode ser aprovado/);
  const { d: d2 } = base();
  d2.config_banco.permitir_pagamentos = true;
  const [q] = Z.prepararPagamentos(d2, [dados], 'ana');
  Z.aprovarPagamento(d2, q.id, 'julio');
  assert.deepEqual([q.situacao, q.aprovado_por, !!q.aprovado_em], ['aguardando_aprovacao', 'julio', true]);
  assert.throws(() => Z.aprovarPagamento(d2, q.id, 'julio'), /não pode ser aprovado de novo/);
  // mesmo código + valor já preparado e aprovado: recusa o repetido
  assert.throws(() => Z.prepararPagamentos(d2, [dados], 'ana'), /pagamento igual/);
  // lote enviado ao C6 (POST /decode + GET items): item lido com sucesso → agendado (aguardando aprovação no app)
  const itens = [{ id: 'it-1', content: q.content, amount: 200, description: q.description, bank_code: '341', bank_name: 'Itaú', beneficiary_name: 'COPEL DISTRIBUICAO', due_date: '2026-11-15', overdue: false, product_type: 'BOLETO', status: 'READ_DATA', error_message: null, transaction_date: '2026-11-10' }];
  Z.registrarGrupoEnviado(d2, [q.id], 'grupo-1', itens, 'julio');
  assert.deepEqual([q.situacao, q.grupo_id, q.id_externo, q.beneficiario.nome, q.beneficiario.documento, !!q.enviado_em], ['agendado', 'grupo-1', 'it-1', 'COPEL DISTRIBUICAO', '11.222.333/0001-81', true]);
  assert.throws(() => Z.cancelarPagamento(d2, q.id, 'julio'), /enviado ao banco/);
  // situação consultada depois: ainda agendado (nada muda), depois PROCESSED → pago → conta do imóvel criada com data e vínculo
  assert.equal(Z.atualizarSituacaoPagamentos(d2, [{ ...itens[0], status: 'SCHEDULED' }], 'julio').length, 0);
  const mudados = Z.atualizarSituacaoPagamentos(d2, [{ ...itens[0], status: 'PROCESSED', transaction_date: '2026-11-10' }, { id: 'desconhecido', status: 'ERROR' }], 'julio');
  assert.equal(mudados.length, 1);
  assert.deepEqual([q.situacao, q.pago_em], ['pago', '2026-11-10']);
  const de = R.buscar(d2, 'despesas', q.despesa_id);
  assert.deepEqual([de.imovel_id, de.tipo, de.competencia, de.valor, de.data_pagamento, de.pagamento_banco_id], [sobre.id, 'Luz', '2026-11', 20000, '2026-11-10', q.id]);
  assert.throws(() => Z.cancelarPagamento(d2, q.id, 'julio'), /já foi pago/);
  assert.throws(() => Z.atualizarPagamento(d2, q.id, { situacao: 'rascunho' }, 'julio'), /não pode passar/);
  assert.equal(Z.pagamentosDo(d2, { imovel_id: sobre.id, situacao: 'pago' }).length, 1);
  // erro do banco → pode cancelar; cancelado não volta
  const [e] = Z.prepararPagamentos(d2, [{ ...dados, valor: 5000, forma: 'pix', codigo_barras: null, chave_pix: 'financeiro@exemplo.com.br' }], 'ana');
  assert.equal(e.content, 'financeiro@exemplo.com.br');
  Z.aprovarPagamento(d2, e.id, 'julio');
  Z.registrarGrupoEnviado(d2, [e.id], 'grupo-2', [{ id: 'it-2', content: e.content, amount: 50, status: 'DECODE_ERROR', error_message: 'Chave Pix inválida' }], 'julio');
  assert.deepEqual([e.situacao, e.erro], ['erro', 'Chave Pix inválida']);
  Z.cancelarPagamento(d2, e.id, 'julio', { motivo: 'chave errada' });
  assert.equal(e.situacao, 'cancelado');
  assert.throws(() => Z.atualizarPagamento(d2, e.id, { situacao: 'agendado' }, 'julio'), /não pode passar/);
  // depois do cancelado, o mesmo pagamento pode ser preparado de novo
  assert.equal(Z.prepararPagamentos(d2, [{ ...dados, valor: 5000, forma: 'pix', codigo_barras: null, chave_pix: 'financeiro@exemplo.com.br' }], 'ana').length, 1);
  // IPTU: ao pagar, a parcela fica marcada
  const [pi] = Z.prepararPagamentos(d2, [{ conta_id: 'ank', imovel_id: loja.id, origem: { tipo: 'iptu', id: iptu.id, n: 1 }, forma: 'boleto', codigo_barras: '8'.repeat(48), valor: 10000, data_pagamento: '2026-02-10' }], 'ana');
  assert.deepEqual([pi.tipo_conta, pi.content.length], ['IPTU', 44]);
  Z.marcarPagamentoEnviado(d2, pi.id, { id_externo: 'it-3' }, 'julio');
  Z.atualizarPagamento(d2, pi.id, { situacao: 'pago', pago_em: '2026-02-10' }, 'julio');
  assert.equal(R.buscar(d2, 'iptus', iptu.id).pagas[1], '2026-02-10');
  assert.deepEqual(R.pastaDoComprovante(d2, pi), { escopo: 'iptuano', id: R.idPastaAno(loja.id, 2026) });
  assert.throws(() => Z.prepararPagamentos(d2, [{ conta_id: 'ank', imovel_id: loja.id, origem: { tipo: 'iptu', id: iptu.id, n: 1 }, forma: 'boleto', codigo_barras: '7'.repeat(44), valor: 10000 }], 'ana'), /já está paga/);
});

test('pagamento confirmado pela saída do extrato: vira pago na data da movimentação e a movimentação fica classificada pela origem', () => {
  const { d, sobre, jck } = base();
  d.config_banco.permitir_pagamentos = true;
  const [lanc] = R.lancarDespesas(d, sobre.id, '2026-11', [{ tipo: 'Água', valor: 12345, data_pagamento: '2026-11-05' }], 'julio');
  const [p] = Z.prepararPagamentos(d, [{ conta_id: 'jck', origem: { tipo: 'despesa', id: lanc.id }, forma: 'boleto', codigo_barras: '1'.repeat(44), valor: 12345, data_pagamento: '2026-11-06' }], 'ana');
  assert.deepEqual([p.imovel_id, p.tipo_conta, p.competencia, p.despesa_id], [sobre.id, 'Água', '2026-11', lanc.id]);
  Z.aprovarPagamento(d, p.id, 'julio');
  Z.marcarPagamentoEnviado(d, p.id, { id_externo: 'it-9' }, 'julio');
  const { novas: [mov, outra] } = importar(d, 'jck', [saida('s1', '2026-11-06', '123.45', 'PAGAMENTO BOLETO SANEPAR'), saida('s2', '2026-11-06', '123.46', 'OUTRO')]);
  const s = Z.sugerirDestino(d, mov);
  assert.deepEqual([s.classificacao, s.pagamento_banco_id, s.imovel_id, s.confianca], ['conta_imovel', p.id, sobre.id, 'alta']);
  assert.throws(() => Z.marcarPagoPeloExtrato(d, p.id, outra.id, 'julio'), /diferente do pagamento/);
  Z.conciliarPagamentoComExtrato(d, p.id, mov.id, 'julio');
  assert.deepEqual([p.situacao, p.pago_em, p.movimentacao_id], ['pago', '2026-11-06', mov.id]);
  const m = R.buscar(d, 'movimentacoes_banco', mov.id);
  assert.deepEqual([m.classificacao, m.imovel_id, m.pagamento_banco_id, m.despesa_id], ['conta_imovel', sobre.id, p.id, lanc.id]);
  assert.deepEqual([R.buscar(d, 'despesas', lanc.id).data_pagamento, R.buscar(d, 'despesas', lanc.id).pagamento_banco_id, R.buscar(d, 'despesas', lanc.id).movimentacao_id], ['2026-11-06', p.id, mov.id]);
  assert.throws(() => Z.desvincularMovimentacao(d, mov.id, 'julio'), /paga pelo banco/);
  // comprovante do pagamento vai para as mesmas pastas
  Z.registrarComprovante(d, p.id, { comprovante: 'pag.pdf', comprovante_contador: 'pag.pdf' }, 'julio', 'pagamentos_banco');
  const refs = R.arquivosReferenciados(d);
  assert.deepEqual(refs.map((x) => [x.escopo, x.id]), [['contasano', R.idPastaAno(sobre.id, 2026)], ['contador', R.idContador(jck.id, '2026-11')]]);
  assert.match(R.rotulosDosArquivos(d).get(`contador:${R.idContador(jck.id, '2026-11')}|pag.pdf`), /cópia para o contador \(JCK 11\/2026\)/);
  assert.equal(R.buscar(d, 'despesas', lanc.id).comprovante, 'pag.pdf');
});

test('comprovante único: a pasta do contador é a do mês do dinheiro (não da competência) e o nome vai para o pagamento, a movimentação e a conta', () => {
  const { d, sobre, jck } = base();
  d.config_banco.permitir_pagamentos = true;
  // conta de 12/2026 paga pelo banco em 28/11/2026: a pasta do contador é 2026-11
  const [p] = Z.prepararPagamentos(d, [{ conta_id: 'jck', imovel_id: sobre.id, origem: { tipo: 'avulso', id: null, n: null }, tipo_conta: 'Condomínio', competencia: '2026-12', forma: 'boleto', codigo_barras: '2'.repeat(47), valor: 45000, data_pagamento: '2026-11-28' }], 'ana');
  assert.deepEqual(Z.escopoContador(d, p), { escopo: 'contador', id: R.idContador(jck.id, '2026-11') }, 'sem movimentação: a data do pagamento');
  Z.aprovarPagamento(d, p.id, 'julio');
  Z.marcarPagamentoEnviado(d, p.id, { id_externo: 'it-1' }, 'julio');
  const { novas: [mov] } = importar(d, 'jck', [saida('s1', '2026-11-28', '450.00', 'PIX CONDOMINIO EDIFICIO EXEMPLO')]);
  Z.marcarPagoPeloExtrato(d, p.id, mov.id, 'julio');
  const pago = R.buscar(d, 'pagamentos_banco', p.id);
  assert.equal(pago.competencia, '2026-12');
  assert.deepEqual(Z.escopoContador(d, pago), Z.escopoContador(d, R.buscar(d, 'movimentacoes_banco', mov.id)), 'pagamento e movimentação na mesma pasta do contador');
  assert.equal(R.mesDoDinheiro(d, pago), '2026-11');
  assert.deepEqual(Z.escopoDoComprovante(d, pago), Z.escopoDoComprovante(d, R.buscar(d, 'movimentacoes_banco', mov.id)));
  // pagamento sem movimentação ligada mas com data futura e competência anterior: vale a data do pagamento
  assert.equal(R.mesDoDinheiro(null, { competencia: '2026-10', data_pagamento: '2026-11-03' }), '2026-11');
  // o comprovante registrado no pagamento aparece na movimentação e na conta lançada
  Z.registrarComprovante(d, pago.id, { nome_arquivo: 'x', comprovante: 'cond.pdf', comprovante_contador: 'cond.pdf', origem: 'ponte' }, 'julio', 'pagamentos_banco');
  const m = R.buscar(d, 'movimentacoes_banco', mov.id);
  assert.deepEqual([m.comprovante, m.comprovante_contador, m.comprovante_origem], ['cond.pdf', 'cond.pdf', 'ponte']);
  assert.equal(R.buscar(d, 'despesas', pago.despesa_id).comprovante, 'cond.pdf');
  assert.deepEqual(Z.irmaoDoComprovante(d, pago, 'pagamentos_banco').x.id, mov.id);
  assert.deepEqual(Z.irmaoDoComprovante(d, m).x.id, pago.id);
  // um arquivo só nas referências (os dois registros apontam para o mesmo PDF)
  const refs = R.arquivosReferenciados(d).filter((x) => x.nome === 'cond.pdf');
  assert.deepEqual(refs.map((x) => [x.escopo, x.id]), [['contasano', R.idPastaAno(sobre.id, 2026)], ['contador', R.idContador(jck.id, '2026-11')]]);
  // pelo lado da movimentação também copia para o pagamento
  Z.registrarComprovante(d, mov.id, { comprovante: 'cond2.pdf', comprovante_contador: 'cond2.pdf', origem: 'manual' }, 'julio');
  assert.deepEqual([R.buscar(d, 'pagamentos_banco', p.id).comprovante, R.buscar(d, 'pagamentos_banco', p.id).comprovante_origem], ['cond2.pdf', 'manual']);
});

test('transferência entre as nossas contas tem comprovante: um só, na pasta do contador da conta de ORIGEM no mês da movimentação, sem pasta de imóvel', () => {
  const { d, ank } = base();
  const [ted] = importar(d, 'ank', [saida('t1', '2026-11-30', '2000.00', 'TED PARA JCK ADMINISTRADORA', { transaction_type: 'TRANSFER' })]).novas;
  const [rec] = importar(d, 'jck', [entrada('j1', '2026-12-01', '2000.00', { transaction_type: 'TRANSFER', description: 'TED RECEBIDA ANK ADMINISTRADORA', title: 'Transferência recebida' })]).novas;
  Z.vincularMovimentacao(d, ted.id, { classificacao: 'transferencia' }, 'julio');
  assert.equal(R.buscar(d, 'movimentacoes_banco', rec.id).par_movimentacao_id, ted.id);
  assert.equal(Z.movimentacoesDo(d, { filtro: 'sem_comprovante' }).length, 2, 'as duas pontas pedem comprovante');
  assert.equal(R.pendenciasBancoDoMes(d, '2026-11', '2026-12-05').semComprovante, 1);
  const origem = { escopo: 'contador', id: R.idContador(ank.id, '2026-11') };
  assert.deepEqual(Z.escopoContador(d, R.buscar(d, 'movimentacoes_banco', ted.id)), origem);
  assert.deepEqual(Z.escopoContador(d, R.buscar(d, 'movimentacoes_banco', rec.id)), origem, 'a ponta que recebe usa a pasta da conta de origem (e o mês dela)');
  assert.equal(Z.escopoDoComprovante(d, R.buscar(d, 'movimentacoes_banco', rec.id)), null);
  assert.equal(Z.contaDeOrigem(d, R.buscar(d, 'movimentacoes_banco', rec.id)), 'ank');
  assert.equal(Z.nomeComprovante(d, R.buscar(d, 'movimentacoes_banco', ted.id)), '2026-11-30 ANK Geral Transferencia 2.000,00.pdf');
  assert.match(Z.nomeComprovante(d, R.buscar(d, 'movimentacoes_banco', rec.id)), /ANK Geral Transferencia 2\.000,00\.pdf$/, 'nome com a empresa de origem');
  Z.registrarComprovante(d, ted.id, { comprovante_contador: '2026-11-30 ANK Geral Transferencia 2.000,00.pdf', origem: 'ponte' }, 'julio');
  assert.equal(R.buscar(d, 'movimentacoes_banco', rec.id).comprovante_contador, '2026-11-30 ANK Geral Transferencia 2.000,00.pdf', 'a outra ponta divide o mesmo PDF');
  assert.equal(Z.movimentacoesDo(d, { filtro: 'sem_comprovante' }).length, 0);
  assert.equal(R.arquivosReferenciados(d).filter((x) => /Transferencia/.test(x.nome)).length, 1, 'um arquivo só');
  assert.match(R.rotulosDosArquivos(d).get(`contador:${origem.id}|2026-11-30 ANK Geral Transferencia 2.000,00.pdf`), /cópia para o contador \(ANK 11\/2026\)/);
  const { arquivos } = Z.desvincularMovimentacao(d, ted.id, 'julio');
  assert.deepEqual(arquivos, [{ ...origem, nome: '2026-11-30 ANK Geral Transferencia 2.000,00.pdf' }]);
  assert.equal(R.buscar(d, 'movimentacoes_banco', rec.id).comprovante_contador, null, 'desfazer limpa as duas pontas');
});

test('código de barras: 44, 47 e 48 dígitos passam (com pontos e espaços), 46 e letras falham; linha digitável vira código de 44', () => {
  assert.equal(Z.validarCodigoBarras('34191.09008 00123.456789 01234.567890 1 23456789012345').length, 47);
  assert.equal(Z.validarCodigoBarras('8'.repeat(44)).length, 44);
  assert.equal(Z.validarCodigoBarras('8'.repeat(48)).length, 48);
  assert.throws(() => Z.validarCodigoBarras('8'.repeat(46)), /46 dígitos: esperava 44, 47 ou 48/);
  assert.throws(() => Z.validarCodigoBarras('8'.repeat(46)), C.ErroUsuario);
  assert.throws(() => Z.validarCodigoBarras('abc'), /Informe o código/);
  assert.throws(() => Z.validarCodigoBarras(''), /Informe/);
  // boleto: AAABC.CCCCX DDDDD.DDDDDY EEEEE.EEEEEZ K UUUUVVVVVVVVVV → AAAB K UUUUVVVVVVVVVV CCCCC DDDDDDDDDD EEEEEEEEEE
  const linha = '2379' + '3' + '3812' + '8' + '6000000000' + '1' + '0000000000' + '1' + '5' + '12345678901234';
  assert.equal(Z.codigoDeBarras(linha), '2379' + '5' + '12345678901234' + '33812' + '6000000000' + '0000000000');
  // arrecadação (48): 4 blocos de 11 + 1 DV cada → os 11 de cada bloco
  const arr = ['12345678901', 'A', '23456789012', 'B', '34567890123', 'C', '45678901234', 'D'].join('').replace(/[A-D]/g, '9');
  assert.equal(Z.codigoDeBarras(arr), '12345678901234567890123456789012345678901234');
});

test('fechamento tem a etapa "banco" (sem destino + extrato não buscado) e o Painel só avisa com o banco ligado', () => {
  const { d } = base();
  const hoje = '2026-12-05';
  let e = R.etapasFechamento(d, '2026-11', hoje).find((x) => x.chave === 'banco');
  assert.ok(e, 'etapa existe');
  assert.deepEqual([e.pendentes, e.contas.map((c) => c.semImportar)], [2, [true, true]]);
  assert.match(e.detalhe, /ANK: extrato ainda não buscado · JCK: extrato ainda não buscado/);
  importar(d, 'ank', [saida('r1', '2026-11-05', '10.00', 'A'), saida('r2', '2026-11-06', '5.00', 'B')], { ate: '2026-11-30', hoje });
  importar(d, 'jck', [saida('j1', '2026-11-05', '7.00', 'C')], { ate: '2026-11-30', hoje });
  e = R.etapasFechamento(d, '2026-11', hoje).find((x) => x.chave === 'banco');
  assert.deepEqual([e.pendentes, e.feito], [3, false]);
  assert.match(e.detalhe, /ANK: 2 sem destino · JCK: 1 sem destino/);
  assert.equal(R.etapasFechamento(d, '2026-11', hoje).findIndex((x) => x.chave === 'banco'), R.etapasFechamento(d, '2026-11', hoje).findIndex((x) => x.chave === 'pagamentos') + 1);
  for (const m of d.movimentacoes_banco) Z.vincularMovimentacao(d, m.id, { classificacao: 'tarifa' }, 'julio');
  e = R.etapasFechamento(d, '2026-11', hoje).find((x) => x.chave === 'banco');
  assert.deepEqual([e.pendentes, e.feito], [0, true]);
  // alerta do Painel: sem destino há mais de 7 dias; comprovantes não baixados
  const { d: d2 } = base();
  importar(d2, 'ank', [saida('r1', '2026-11-05', '10.00', 'A')]);
  let a = R.todosAlertas(d2, '2026-11-20').find((x) => x.tipo === 'Banco');
  assert.ok(a);
  assert.match(a.texto, /1 movimentação\(ões\) do extrato sem destino há mais de 7 dias/);
  assert.equal(R.todosAlertas(d2, '2026-11-08').find((x) => x.tipo === 'Banco'), undefined, 'ainda dentro do prazo');
  d2.config_banco.ativo = false;
  assert.equal(R.todosAlertas(d2, '2026-11-20').find((x) => x.tipo === 'Banco'), undefined);
  assert.equal(R.etapasFechamento(d2, '2026-11', '2026-12-05').find((x) => x.chave === 'banco'), undefined);
  // pagamento enviado sem confirmação depois da data
  const { d: d3 } = base();
  d3.config_banco.permitir_pagamentos = true;
  const [p] = Z.prepararPagamentos(d3, [{ conta_id: 'ank', forma: 'boleto', codigo_barras: '1'.repeat(44), valor: 100, data_pagamento: '2026-11-10', tipo_conta: 'Outra' }], 'ana');
  Z.aprovarPagamento(d3, p.id, 'julio');
  Z.marcarPagamentoEnviado(d3, p.id, { id_externo: 'x' }, 'julio');
  a = R.todosAlertas(d3, '2026-11-12').find((x) => x.tipo === 'Banco');
  assert.deepEqual([a.nivel, /enviado\(s\) ao banco sem confirmação/.test(a.texto)], ['aviso', true]);
  assert.deepEqual(Z.pendenciasBanco(d3, '2026-11', '2026-11-12').pagamentosPendentes, 1);
});

test('normalizar em banco antigo cria as tabelas e a configuração da fase 2 sem mexer na da base; movimentações não se desfazem pelo histórico', () => {
  const d = R.bancoVazio();
  delete d.movimentacoes_banco;
  delete d.pagamentos_banco;
  d.config_banco = { ativo: true, provedor: 'c6', ponte_url: 'http://x', senha_ponte: 's', conta_padrao_id: 'ank', contas: [{ id: 'ank', apelido: 'ANK', emitente_id: 1 }], tolerancia_dias: 5 };
  d.movimentacoes_banco = [{ id: 1, conta_id: 'ank', id_externo: 'a', data: '2026-11-05', valor: -1000, tipo: 'entrada', descricao: 'X' }];
  d.pagamentos_banco = [{ id: 1, conta_id: 'ank', situacao: 'rascunho', valor: 100 }];
  d.despesas.push({ id: 1, imovel_id: 1, tipo: 'Água', competencia: '2026-11', valor: 100, data_pagamento: '2026-11-05', movimentacao_id: 99 });
  R.normalizar(d);
  assert.deepEqual([d.config_banco.pasta_contador, d.config_banco.modelo_nome_comprovante, d.config_banco.tolerancia_dias, d.config_banco.permitir_pagamentos, d.config_banco.limite_pagamento, d.config_banco.ultima_importacao, d.config_banco.copiar_para_contador],
    ['_Contador', '{data} {empresa} {imovel} {tipo} {valor}', 5, false, 0, {}, true]);
  assert.deepEqual([d.config_banco.ativo, d.config_banco.ponte_url, d.config_banco.contas.length], [true, undefined, 1], 'endereço e senha da ponte não ficam no banco compartilhado');
  assert.deepEqual([d.movimentacoes_banco[0].valor, d.movimentacoes_banco[0].tipo, d.movimentacoes_banco[0].classificacao, d.movimentacoes_banco[0].comprovante], [1000, 'saida', null, null]);
  assert.equal(d.pagamentos_banco[0].referencia, 'erp-1');
  assert.equal(d.despesas[0].movimentacao_id, null, 'movimentação que sumiu: a conta perde o vínculo');
  R.normalizar(d); // de novo: idempotente
  assert.equal(d.movimentacoes_banco[0].valor, 1000);
  // sem config_banco nenhum: cria só os campos novos
  const d2 = R.normalizar(R.bancoVazio());
  assert.deepEqual([d2.config_banco.ativo, d2.config_banco.pasta_contador, d2.movimentacoes_banco, d2.pagamentos_banco], [false, '_Contador', [], []] /* a base cria config_banco com ativo:false */);
  // histórico: alteração em movimentação não aparece em "desfazer"
  const { d: d3 } = base();
  const [m] = importar(d3, 'ank', [saida('r1', '2026-11-05', '10.00', 'A')]).novas;
  Z.vincularMovimentacao(d3, m.id, { classificacao: 'tarifa' }, 'julio');
  assert.equal(R.alteracoesDesfaziveis(d3).size, 0);
  // ids das pastas
  assert.equal(R.idContador(1, '2026-11'), 1202611);
  assert.deepEqual(R.decodificarIdContador(1202611), { emitenteId: 1, comp: '2026-11' });
  assert.deepEqual(R.decodificarIdContador(R.idContador(12, '2027-01')), { emitenteId: 12, comp: '2027-01' });
  assert.equal(R.idPastaAno(3, 2026), 32026);
  // configuração da fase 2 gravada com histórico, sem a senha
  Z.salvarConfigBanco2(d3, { pasta_contador: 'Contador Ébano', tolerancia_dias: '4', permitir_pagamentos: true, limite_pagamento: 500000, senha_ponte: 'nova' }, 'julio');
  assert.deepEqual([d3.config_banco.pasta_contador, d3.config_banco.tolerancia_dias, d3.config_banco.permitir_pagamentos, d3.config_banco.limite_pagamento, d3.config_banco.senha_ponte], ['Contador Ebano', 4, true, 500000, undefined] /* senha da ponte nunca fica no banco */);
  assert.equal(JSON.stringify(d3.historico.at(-1).detalhes).includes('nova'), false);
  assert.throws(() => Z.salvarConfigBanco2(d3, { modelo_nome_comprovante: 'sem campos' }, 'julio'), /entre chaves/);
});

test('destino Airbnb (dividido entre os imóveis vagos) e reforma: lançam no lugar certo e se desfazem', () => {
  const { d, loja, sobre } = base();
  const studio = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Studio 12', endereco: 'Rua Y, 2', cidade: 'Curitiba' }, 'julio');
  const { novas } = importar(d, 'ank', [entrada('A1', '2026-10-05', '1850.00', { description: 'AIRBNB PAYMENTS UK' }), saida('S1', '2026-10-20', '2300.00', 'LOJA DE MATERIAIS')]);
  const [air, mat] = novas;
  assert.equal(Z.sugerirDestino(d, air).classificacao, 'airbnb');
  assert.throws(() => Z.vincularMovimentacao(d, air.id, { classificacao: 'airbnb', divisao: [{ imovel_id: sobre.id, valor: 121000 }] }, 'julio'), /soma R\$ 1\.210,00/);
  assert.throws(() => Z.vincularMovimentacao(d, air.id, { classificacao: 'airbnb', divisao: [{ imovel_id: loja.id, valor: 185000 }] }, 'julio'), /não estava vago/);
  Z.vincularMovimentacao(d, air.id, { classificacao: 'airbnb', competencia_air: '2026-10',
    divisao: [{ imovel_id: sobre.id, valor: 121000 }, { imovel_id: studio.id, valor: 64000 }] }, 'julio');
  assert.deepEqual(d.ganhos_airbnb.map((g) => [g.imovel_id, g.valor, g.data_recebimento, g.movimentacao_id]),
    [[sobre.id, 121000, '2026-10-05', air.id], [studio.id, 64000, '2026-10-05', air.id]]);
  assert.equal(R.airbnbDoMes(d, '2026-10').total, 185000);
  Z.desvincularMovimentacao(d, air.id, 'julio');
  assert.deepEqual([d.ganhos_airbnb.length, R.buscar(d, 'movimentacoes_banco', air.id).classificacao], [0, null]);
  assert.throws(() => Z.vincularMovimentacao(d, mat.id, { classificacao: 'reforma', imovel_id: loja.id }, 'julio'), /o que foi feito/);
  Z.vincularMovimentacao(d, mat.id, { classificacao: 'reforma', imovel_id: loja.id, descricao_reforma: 'piso da cozinha' }, 'julio');
  assert.deepEqual(d.reformas.map((r) => [r.imovel_id, r.valor, r.data, r.descricao]), [[loja.id, 230000, '2026-10-20', 'piso da cozinha']]);
  assert.equal(R.resultadosFinanceiros(d, '2026-10-01', '2026-10-31').find((x) => x.imovel.id === loja.id).reformasPeriodo, 230000);
  Z.desvincularMovimentacao(d, mat.id, 'julio');
  assert.equal(d.reformas.length, 0);
});

test('pagamento ligado ao banco não se desfaz pelo Histórico nem pelo "desfazer" da parcela do IPTU (só pela tela Banco)', () => {
  const { d, loja, iptu } = base();
  // conta do imóvel paga à mão: o Histórico desfaz a data normalmente
  const [solta] = R.lancarDespesas(d, loja.id, '2026-11', [{ tipo: 'Água', valor: 5000 }], 'julio');
  R.atualizar(d, 'despesas', solta.id, { data_pagamento: '2026-11-03' }, 'julio', 'paga à mão');
  const iSolta = d.historico.length - 1;
  assert.ok(R.alteracoesDesfaziveis(d).has(`${iSolta}:data_pagamento`));
  // conta ligada ao extrato: a data de pagamento some da lista do Histórico e o desfazer é barrado com mensagem clara
  const [ligada] = R.lancarDespesas(d, loja.id, '2026-11', [{ tipo: 'Luz', valor: 12345 }], 'julio');
  const [mov] = importar(d, 'ank', [saida('c10a', '2026-11-05', '123.45', 'COPEL')]).novas;
  Z.vincularMovimentacao(d, mov.id, { classificacao: 'conta_imovel', imovel_id: loja.id, despesa_id: ligada.id }, 'julio');
  const iLigada = d.historico.findLastIndex((h) => h.tabela === 'despesas' && h.registro_id === ligada.id && h.detalhes && h.detalhes.data_pagamento);
  assert.equal(R.buscar(d, 'despesas', ligada.id).data_pagamento, '2026-11-05');
  assert.ok(!R.alteracoesDesfaziveis(d).has(`${iLigada}:data_pagamento`), 'ligada ao extrato: fora da lista');
  assert.throws(() => R.desfazerAlteracoes(d, [`${iLigada}:data_pagamento`], 'julio'), (e) => e instanceof C.ErroUsuario && /tela Banco/.test(e.message));
  assert.equal(R.buscar(d, 'despesas', ligada.id).data_pagamento, '2026-11-05', 'nada mudou');
  // desfeito o destino na tela Banco, a conta se solta pelo caminho certo
  Z.desvincularMovimentacao(d, mov.id, 'julio');
  assert.equal(R.buscar(d, 'despesas', ligada.id).movimentacao_id, null);
  // guia paga pelo extrato
  R.salvarGuiaImposto(d, d.emitentes[0].id, 'PIS/COFINS', '2026-10', 36500, 'julio');
  const g = d.guias_impostos[0];
  const [darf] = importar(d, 'ank', [saida('c10b', '2026-11-25', '365.00', 'DARF')]).novas;
  Z.vincularMovimentacao(d, darf.id, { classificacao: 'imposto', guia_imposto_id: g.id }, 'julio');
  const iGuia = d.historico.findLastIndex((h) => h.tabela === 'guias_impostos' && h.detalhes && h.detalhes.paga_em);
  assert.ok(!R.alteracoesDesfaziveis(d).has(`${iGuia}:paga_em`));
  assert.throws(() => R.desfazerAlteracoes(d, [`${iGuia}:paga_em`], 'julio'), /ligada ao extrato/);
  // parcela do IPTU com destino no extrato: o botão "desfazer" da parcela e o Histórico são barrados; desfazer o destino libera
  R.marcarIptuPago(d, iptu.id, 2, '2026-03-10', 'julio'); // parcela 2 paga à mão: continua desfazível
  const [pIptu] = importar(d, 'ank', [saida('c10c', '2026-11-09', '100.00', 'IPTU 01.234.567 PARCELA 3/10')]).novas;
  Z.vincularMovimentacao(d, pIptu.id, { classificacao: 'iptu', iptu_id: iptu.id, iptu_parcela: 3 }, 'julio');
  assert.equal(R.buscar(d, 'iptus', iptu.id).pagas[3], '2026-11-09');
  assert.ok(R.iptuPagoPeloBanco(d, iptu.id, 3));
  assert.ok(!R.iptuPagoPeloBanco(d, iptu.id, 2));
  assert.throws(() => R.marcarIptuPago(d, iptu.id, 3, '', 'julio'), (e) => e instanceof C.ErroUsuario && /paga pelo banco/.test(e.message));
  R.marcarIptuPago(d, iptu.id, 2, '', 'julio'); // a paga à mão desfaz
  assert.equal(R.buscar(d, 'iptus', iptu.id).pagas[2], undefined);
  const iPagas = d.historico.findLastIndex((h) => h.tabela === 'iptus' && h.detalhes && h.detalhes.pagas && h.detalhes.pagas.para && h.detalhes.pagas.para[3] && !h.detalhes.pagas.de[3]);
  assert.ok(iPagas > 0);
  assert.ok(!R.alteracoesDesfaziveis(d).has(`${iPagas}:pagas`));
  assert.throws(() => R.desfazerAlteracoes(d, [`${iPagas}:pagas`], 'julio'), /paga pelo banco/);
  Z.desvincularMovimentacao(d, pIptu.id, 'julio');
  assert.equal(R.buscar(d, 'iptus', iptu.id).pagas[3], undefined, 'pela tela Banco desfaz');
  // conta paga por pagamento pelo C6 (sem extrato ainda): também barrado
  d.config_banco.permitir_pagamentos = true;
  const [p] = Z.prepararPagamentos(d, [{ conta_id: 'ank', origem: { tipo: 'despesa', id: solta.id }, forma: 'boleto', codigo_barras: '1'.repeat(44), valor: 5000, data_pagamento: '2026-11-06' }], 'ana');
  Z.aprovarPagamento(d, p.id, 'julio');
  Z.marcarPagamentoEnviado(d, p.id, { id_externo: 'it-c10' }, 'julio');
  Z.atualizarPagamento(d, p.id, { situacao: 'pago', pago_em: '2026-11-06' }, 'julio');
  const iPago = d.historico.findLastIndex((h) => h.tabela === 'despesas' && h.registro_id === solta.id && h.detalhes && h.detalhes.data_pagamento);
  assert.throws(() => R.desfazerAlteracoes(d, [`${iPago}:data_pagamento`], 'julio'), /paga pelo banco \(pagamento nº/);
});

test('C3: pagamento enviado que o C6 não confirma nem recusa: o administrador marca "Foi cancelado no C6" (noBanco) e o alerta some', () => {
  const { d, sobre } = base();
  d.config_banco.permitir_pagamentos = true;
  const dados = { conta_id: 'jck', imovel_id: sobre.id, origem: { tipo: 'avulso' }, tipo_conta: 'Luz', competencia: '2026-11', forma: 'boleto', codigo_barras: '7'.repeat(44),
    beneficiario: { nome: 'COPEL' }, valor: 20000, vencimento: '2026-11-15', data_pagamento: '2026-11-10' };
  const [p] = Z.prepararPagamentos(d, [dados], 'ana');
  Z.aprovarPagamento(d, p.id, 'julio');
  Z.registrarGrupoEnviado(d, [p.id], 'g-c3', [{ id: 'it-c3', content: p.content, amount: 200, status: 'SCHEDULED' }], 'julio');
  assert.equal(p.situacao, 'agendado');
  assert.match(R.alertaBanco(d, '2026-11-20').texto, /1 pagamento\(s\) enviado\(s\) ao banco sem confirmação.*Foi cancelado no C6/);
  // sem o aval de que o C6 cancelou, não cancela; com ele, passa a cancelado com o motivo e sai do alerta
  assert.throws(() => Z.cancelarPagamento(d, p.id, 'julio'), /enviado ao banco/);
  Z.cancelarPagamento(d, p.id, 'julio', { noBanco: true, motivo: 'cancelado no C6: pelo gerente' });
  assert.deepEqual([p.situacao, p.erro], ['cancelado', 'cancelado no C6: pelo gerente']);
  assert.equal(R.alertaBanco(d, '2026-11-20'), null);
  assert.equal(Z.SITUACOES_PAGAMENTO.aguardando_aprovacao, 'Aprovado no sistema, envio ao banco pendente');
});

// D5: arquivo OFX exportado pelo app do C6 (trecho fictício no formato real: SGML 1.02)
const OFX_TESTE = `OFXHEADER: 100
DATA: OFXSGML
VERSION: 102
<OFX>
  <SIGNONMSGSRSV1><SONRS><FI><ORG>BANCO C6 S.A.</ORG><FID>336</FID></FI></SONRS></SIGNONMSGSRSV1>
  <BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL</CURDEF>
    <BANKACCTFROM><BANKID>336</BANKID><ACCTID>123456789</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
    <BANKTRANLIST><DTSTART>20260901071529[-3:BRT]</DTSTART><DTEND>20260930205632[-3:BRT]</DTEND>
      <STMTTRN>
        <FITID>111</FITID>
        <TRNAMT>-215.00</TRNAMT>
        <DTPOSTED>20260930205632[-3:BRT]</DTPOSTED>
        <TRNTYPE>DEBIT</TRNTYPE>
        <REFNUM>E3187249520260930235672592QNCkdA</REFNUM>
        <MEMO>TRANSF ENVIADA PIX</MEMO>
      </STMTTRN>
      <STMTTRN>
        <FITID>222</FITID>
        <TRNAMT>1318.50</TRNAMT>
        <DTPOSTED>20260910083428[-3:BRT]</DTPOSTED>
        <TRNTYPE>CREDIT</TRNTYPE>
        <REFNUM>01M25HJ18FY3CKSB2P2B5QJT46</REFNUM>
        <MEMO>Ref. Liq. Boleto Comp Externo</MEMO>
      </STMTTRN>
      <STMTTRN>
        <FITID>222</FITID>
        <TRNAMT>1318.50</TRNAMT>
        <DTPOSTED>20260910083428[-3:BRT]</DTPOSTED>
        <TRNTYPE>CREDIT</TRNTYPE>
        <MEMO>repetido no arquivo</MEMO>
      </STMTTRN>
    </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

test('D5: lerOfx lê o arquivo do app do C6 e importarExtrato aceita os lançamentos sem repetir', () => {
  const r = Z.lerOfx(OFX_TESTE);
  assert.equal(r.banco, 'BANCO C6 S.A.');
  assert.equal(r.conta, '123456789');
  assert.equal(r.de, '2026-09-01');
  assert.equal(r.ate, '2026-09-30');
  assert.equal(r.lancamentos.length, 2); // o FITID repetido entra uma vez
  assert.deepEqual(r.lancamentos[0], { id_externo: '111', data: '2026-09-30', valor_centavos: -21500, tipo: 'saida', descricao: 'TRANSF ENVIADA PIX', categoria: 'DEBIT', end_to_end_id: 'E3187249520260930235672592QNCkdA', local_reference: null, fonte: 'ofx' });
  assert.equal(r.lancamentos[1].local_reference, '01M25HJ18FY3CKSB2P2B5QJT46');
  assert.equal(Z.centavosDoOfx('1.234,56'), 123456);
  assert.throws(() => Z.lerOfx('<html>não é ofx</html>'), /não é um OFX/);
  const { d } = base();
  const imp = Z.importarExtrato(d, 'ank', r.lancamentos, 'julio', { de: r.de, ate: r.ate });
  assert.equal(imp.novas.length, 2);
  assert.equal(imp.novas[1].valor, 131850);
  assert.equal(imp.novas[1].tipo, 'entrada');
  assert.equal(R.extratoImportadoAte(d, 'ank'), '2026-09-30');
  // o mesmo arquivo de novo: nada entra em dobro
  assert.equal(Z.importarExtrato(d, 'ank', Z.lerOfx(OFX_TESTE).lancamentos, 'julio').repetidas, 2);
  // o texto com acento quebrado em UTF-8 é relido como Windows-1252
  const bytes = new Uint8Array([69, 77, 73, 83, 83, 195, 79]); // "EMISSÃO" em 1252 (Ã = 0xC3)
  assert.equal(Z.textoDoOfx(bytes), 'EMISSÃO');
});

test('D10: descreverDestino descreve o destino em texto puro para a planilha do contador', () => {
  const { d, loja, cb2 } = base();
  assert.equal(Z.descreverDestino(d, { classificacao: null }), '');
  assert.equal(Z.descreverDestino(d, { classificacao: 'boleto', cobranca_id: cb2.id }), 'Aluguel recebido · boleto 07/2026 · Maria Exemplo');
  assert.equal(Z.descreverDestino(d, { classificacao: 'tarifa', observacoes: 'pacote mensal' }), 'Tarifa do banco · pacote mensal');
  assert.equal(Z.descreverDestino(d, { classificacao: 'conta_imovel', imovel_id: loja.id }), 'Conta do imóvel · Loja 1');
});
