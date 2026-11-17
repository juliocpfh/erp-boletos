import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';
import * as F from '../docs/js/formularios.js';
import * as C from '../docs/js/calculos.js';
import * as K from '../docs/js/contratos.js';

// Erros achados no teste de ponta a ponta (mutirão de 16/11/2026, frente e2e).
function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com',
    data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    taxa_boleto: 350, multa_percentual: 10, juros_mensal_percentual: 1 }, 'julio');
  for (const comp of ['2026-06', '2026-07', '2026-08']) R.gerarCobrancas(d, comp, 'julio');
  return { d, c };
}

test('item 1: caução combinada e nunca depositada não volta no cálculo final', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 270000, caucao_data: '2026-06-01' });
  assert.equal(R.valorGarantia(d, c), 270000, 'o combinado continua sendo o valor da caução');
  assert.equal(R.garantiaRecebida(d, c), 0, 'nada depositado: nada a devolver');
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-06-05', valor: 100000, arquivo: null }, 'julio');
  assert.equal(R.garantiaRecebida(d, c), 100000, 'um depósito de R$ 1.000,00');
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-06-06', valor: 170000, arquivo: 'c.pdf' }, 'julio');
  assert.equal(R.garantiaRecebida(d, c), 270000);
});

test('item 2: o boleto descontado da garantia no cálculo final sai da cobrança e volta se o cálculo for desfeito', () => {
  const { d, c } = base();
  const ago = R.boletoDoMes(d, c.id, '2026-08');
  const jul = R.boletoDoMes(d, c.id, '2026-07');
  R.registrarPagamento(d, R.boletoDoMes(d, c.id, '2026-06').id, '2026-07-10', null, 'julio');
  R.registrarPagamento(d, jul.id, '2026-08-10', null, 'julio');
  c.data_saida = '2026-08-31';
  const e = R.encerrarContrato(d, c.id, { data_saida: '2026-08-31', garantia_valor: 0, indice_percentual: 0, debitos: 135350,
    debitos_descricao: 'Aluguel 08/2026 em aberto: R$ 1.353,50', leitura_agua: '10', leitura_energia: '20' }, 'julio');
  assert.equal(ago.quitado_saida, e.id);
  assert.equal(ago.situacao, 'Descontado da garantia');
  assert.equal(R.aCobrar(ago), false, 'não aparece mais em vencidos nem com "Cobrar"');
  assert.equal(R.roteiroSaida(d, c).find((x) => x.chave === 'boleto').feito, true, 'etapa "Último boleto" fechada');
  R.recalcularCobrancas(d, () => true, 'julio');
  assert.equal(ago.situacao, 'Descontado da garantia', 'o recálculo não volta a situação');
  R.excluir(d, 'encerramentos', e.id, 'julio');
  R.liberarBoletosDaSaida(d, e.id, 'julio');
  assert.equal(ago.quitado_saida, null);
  assert.equal(ago.situacao, 'Em aberto');
  assert.equal(R.aCobrar(ago), true);
});

test('item 3: na troca de titular, as parcelas do acordo de quem saiu ficam com ele', () => {
  const { d, c } = base();
  const jul = R.boletoDoMes(d, c.id, '2026-07');
  const { parcelas } = R.fazerAcordo(d, { contrato_id: c.id, ids: [jul.id], total: 150000, parcelas: 3, primeiro_vencimento: '2026-10-10' }, 'julio', '2026-09-19');
  const { id, ...resto } = c;
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Pedro Novo', contrato_anterior_id: c.id, data_entrada: '2026-10-01', vigencia_inicio: '2026-10-01' }, 'julio');
  R.inserir(d, 'aditivos', { contrato_id: novo.id, imovel_id: novo.imovel_id, tipo: 'Troca de titular', data: '2026-09-20', assunto: 'Troca', texto: 'termo', arquivo: 'termo.pdf' }, 'j');
  assert.ok(R.resumoDaHeranca(d, novo).some((t) => /Parcelas do acordo .*\(3\): continuam no nome de Maria Exemplo/.test(t)));
  R.transferirHeranca(d, novo.id, 'julio', '2026-10-05');
  assert.deepEqual(parcelas.map((p) => p.contrato_id), [c.id, c.id, c.id], 'a dívida é de quem saiu');
  assert.equal(R.herancaIncompleta(d, novo), null, 'e não ficam "faltando passar"');
});

test('item 4: pagamento a menos deixa a diferença devendo no próximo boleto; desfeito, ela sai', () => {
  const { d, c } = base();
  const jun = R.boletoDoMes(d, c.id, '2026-06');
  const jul = R.boletoDoMes(d, c.id, '2026-07');
  const r = R.registrarPagamento(d, jun.id, '2026-07-10', 100000, 'julio', { valorNf: 99000, justificativa: 'pagou só uma parte' });
  const falta = r.valor_devido - 100000;
  R.levarDiferencaAoProximo(d, jun.id, falta, 'julio');
  assert.equal(jun.situacao, 'Paga em parte');
  assert.equal(jun.diferenca_devida, falta);
  assert.equal(jun.diferenca_no_boleto, jul.id);
  assert.equal(jul.outros, falta);
  assert.match(jul.outros_descricao, /Diferença do boleto 06\/2026/);
  R.estornarPagamento(d, jun.id, 'julio');
  assert.equal(jul.outros, 0);
  assert.equal(jul.outros_descricao, '');
  assert.equal(jun.diferenca_devida, null);
  // sem próximo boleto em aberto: a diferença espera o boleto ser gerado
  const ago = R.boletoDoMes(d, c.id, '2026-08');
  R.registrarPagamento(d, jul.id, '2026-08-10', null, 'julio');
  R.registrarPagamento(d, ago.id, '2026-09-10', 50000, 'julio', { valorNf: 49000, justificativa: 'parte' });
  R.levarDiferencaAoProximo(d, ago.id, 85350, 'julio');
  assert.equal(ago.diferenca_no_boleto, null);
  R.gerarCobrancas(d, '2026-09', 'julio');
  const set = R.boletoDoMes(d, c.id, '2026-09');
  assert.equal(set.outros, 85350);
  assert.equal(ago.diferenca_no_boleto, set.id);
  // pago o boleto que recebeu a diferença, o pagamento em parte não se desfaz sozinho
  R.registrarPagamento(d, set.id, '2026-10-10', null, 'julio');
  assert.throws(() => R.estornarPagamento(d, ago.id, 'julio'), /já foi cobrada no boleto de 09\/2026/);
});

test('itens 5 e 8: com o cálculo final salvo, a saída e os reparos não se desfazem pelo Histórico', () => {
  const { d, c } = base();
  R.informarSaida(d, c.id, '2026-08-31', 'julio', '2026-09-05');
  assert.match(R.motivoNaoDesfazer(d, 'contratos', c, 'data_saida'), /Desfazer a saída/);
  R.encerrarContrato(d, c.id, { data_saida: '2026-08-31', garantia_valor: 0, indice_percentual: 0, debitos: 0, leitura_agua: '1', leitura_energia: '2' }, 'julio');
  assert.match(R.motivoNaoDesfazer(d, 'contratos', c, 'ativo'), /cálculo final/);
  assert.match(R.motivoNaoDesfazer(d, 'vistorias', { id: 1, contrato_id: c.id }, 'reparos'), /desfaça antes o cálculo final/);
  const pode = [...R.alteracoesDesfaziveis(d)].map((k) => d.historico[Number(k.split(':')[0])]);
  assert.ok(!pode.some((h) => h.tabela === 'contratos' && h.registro_id === c.id && 'data_saida' in h.detalhes), 'o ↶ não aparece na data de saída');
});

test('itens 6 e 15-18: aluguel, seguro, IPTU e reforma maiores que zero; valor do imóvel nunca negativo', () => {
  const ler = (campos, valores) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(valores)) fd.set(k, v);
    return F.ler(campos, fd).erros;
  };
  assert.equal(ler(F.CONTRATO.filter((x) => x.nome === 'aluguel_inicial'), { aluguel_inicial: '-500,00' }).aluguel_inicial, 'Informe um valor maior que zero');
  assert.equal(ler(F.CONTRATO.filter((x) => x.nome === 'aluguel_inicial'), { aluguel_inicial: '0,00' }).aluguel_inicial, 'Informe um valor maior que zero');
  assert.equal(ler(F.CONTRATO.filter((x) => x.nome === 'aluguel_inicial'), { aluguel_inicial: '1.500,00' }).aluguel_inicial, undefined);
  assert.equal(ler(F.SEGURO.filter((x) => x.nome === 'valor_total'), { valor_total: '-600,00' }).valor_total, 'Informe um valor maior que zero');
  assert.equal(ler(F.IPTU.filter((x) => x.nome === 'valor_total'), { valor_total: '-1.000,00' }).valor_total, 'Informe um valor maior que zero');
  assert.equal(ler(F.REFORMA.filter((x) => x.nome === 'valor'), { valor: '-1.000,00' }).valor, 'Informe um valor maior que zero');
  assert.equal(ler(F.IMOVEL.filter((x) => x.nome === 'valor_imovel'), { valor_imovel: '-100.000,00' }).valor_imovel, 'O valor não pode ser negativo');
  assert.equal(ler(F.IMOVEL.filter((x) => x.nome === 'valor_imovel'), { valor_imovel: '' }).valor_imovel, undefined, 'em branco continua valendo');
});

test('item 9: etapa das chaves da saída só fecha com o termo (saídas de antes de 13/11/2026 fecham pelo cálculo final)', () => {
  const { d, c } = base();
  R.informarSaida(d, c.id, '2026-11-14', 'julio', '2026-11-20');
  R.encerrarContrato(d, c.id, { data_saida: '2026-11-14', garantia_valor: 0, indice_percentual: 0, debitos: 0, leitura_agua: '1', leitura_energia: '2' }, 'julio');
  const chaves = () => R.roteiroSaida(d, c, '2026-11-20').find((x) => x.chave === 'chaves');
  assert.equal(chaves().feito, false);
  assert.match(chaves().detalhe, /falta anexar o termo/);
  c.data_saida = '2026-10-31';
  assert.equal(chaves().feito, true, 'saída antiga: acertada sem termo');
  assert.match(chaves().detalhe, /acertada sem termo/);
});

test('item 11: nome do arquivo com a data e a hora daqui', () => {
  assert.equal(C.carimboLocal(new Date(2026, 10, 16, 20, 57)), '2026-11-16-20-57');
});

test('item 12: "Reprovar (com o motivo)" passa a situação pelo endereço', () => {
  assert.deepEqual(C.sanearParametros({ situacao: 'Reprovada' }), { situacao: 'Reprovada' });
  assert.deepEqual(C.sanearParametros({ situacao: '<b>x' }), {});
});

test('item 24: sem endereço da sede, o endereço da empresa vale (e não avisa)', () => {
  const { d, c } = base();
  const e = d.emitentes[0];
  Object.assign(e, { representante_nome: 'Fulano', endereco: 'Rua A, 10', endereco_sede: '' });
  assert.ok(!K.pendenciasDoContrato(d, c).some((x) => /endereço da sede/.test(x)));
  e.endereco = '';
  assert.ok(K.pendenciasDoContrato(d, c).some((x) => /endereço da sede/.test(x)));
});
