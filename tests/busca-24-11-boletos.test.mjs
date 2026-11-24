import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as Z from '../docs/js/conciliacao.js';
import * as R from '../docs/js/regras.js';

// Busca de 24/11/2026, lote 1 (boletos, NF e banco). Dados fictícios (CPF e CNPJ de teste).
function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', complemento: '', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-03-01', vigencia_inicio: '2026-03-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, multa_percentual: 10, juros_mensal_percentual: 1, conta_condominio: 'Por conta do inquilino' }, 'j');
  R.gerarCobrancas(d, '2026-11', 'j');
  return { d, ank, loja, c, cb: R.boletoDoMes(d, c.id, '2026-11') };
}

test('BOL-01: "O ajuste entra na NF" leva só o ajuste; a multa da notificação fica fora da NF', () => {
  const { d, c, cb } = base();
  R.adicionarAjuste(d, cb.id, 10000, 'TV vendida junto', 'j');
  R.atualizar(d, 'cobrancas', cb.id, { outros_na_nf: true }, 'j');
  assert.equal(C.liquidar(cb, '2026-12-05').valor_nf, 190000); // R$ 1.800,00 + R$ 100,00
  R.inserir(d, 'notificacoes', { contrato_id: c.id, data: '2026-11-20', multa_valor: 150000, multa_data: '2026-11-25', multa_cobranca_id: null, situacao: 'Multa gerada' }, 'j');
  R.sincronizarMultas(d, c.id, 'j');
  assert.equal(cb.outros, 160000, 'a multa soma no boleto');
  assert.equal(C.ajusteNaNf(cb), 10000);
  assert.equal(C.liquidar(cb, '2026-12-05').valor_nf, 190000, 'a multa de R$ 1.500,00 não entra na NF');
  R.registrarPagamento(d, cb.id, '2026-12-05', null, 'j');
  assert.equal(cb.valor_nf, 190000);
  const nf = R.baseDaFatura(d, 'cobranca', cb);
  assert.match(nf.observacoes, /Inclui TV vendida junto: R\$\s?100,00/);
  assert.doesNotMatch(nf.observacoes, /Multa/);
});

test('BOL-01: sem a marca, nada do ajuste entra na NF (como antes)', () => {
  const { d, cb } = base();
  R.adicionarAjuste(d, cb.id, 10000, 'Vidro quebrado', 'j');
  assert.equal(C.ajusteNaNf(cb), 0);
  assert.equal(C.liquidar(cb, '2026-12-05').valor_nf, 180000);
});

test('BOL-02: recálculo não exclui o boleto feito à mão no banco (PDF anexado) e avisa para cancelar no banco', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-12', 'j');
  const dez = R.boletoDoMes(d, c.id, '2026-12');
  R.anexarBoletoPdf(d, dez.id, 'boleto-banco-2026-12.pdf', 'j');
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-20' }, 'j');
  R.recalcularCobrancas(d, (x) => x.contrato_id === c.id, 'j');
  assert.ok(R.boletoDoMes(d, c.id, '2026-12'), 'o boleto continua no sistema');
  const al = R.alertasBoletosSemOcupacao(d).find((a) => a.link === `#/cobranca/${dez.id}`);
  assert.ok(al);
  assert.equal(al.nivel, 'perigo');
  assert.match(al.texto, /emitido à mão no banco .*cancele no banco/);
});

test('BOL-03: recálculo não exclui o boleto alterado à mão (com campos_manuais): fica com o alerta, como antes de 24/11', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-12', 'j');
  const dez = R.boletoDoMes(d, c.id, '2026-12');
  R.atualizar(d, 'cobrancas', dez.id, { aluguel: 150000, editado_manual: true, campos_manuais: ['aluguel'] }, 'j');
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-20' }, 'j');
  R.recalcularCobrancas(d, (x) => x.contrato_id === c.id, 'j');
  assert.ok(R.boletoDoMes(d, c.id, '2026-12'), 'o boleto alterado à mão continua');
  assert.ok(R.alertasBoletosSemOcupacao(d).some((a) => /alterado à mão.*confira e exclua/.test(a.texto)));
  // o boleto comum do mesmo caso continua sendo excluído
  const b = base();
  R.gerarCobrancas(b.d, '2026-12', 'j');
  R.atualizar(b.d, 'contratos', b.c.id, { data_saida: '2026-11-20' }, 'j');
  R.recalcularCobrancas(b.d, (x) => x.contrato_id === b.c.id, 'j');
  assert.ok(!R.boletoDoMes(b.d, b.c.id, '2026-12'));
});

test('BOL-07: PDF do banco desatualizado também quando muda a bonificação, a multa ou os juros', () => {
  const { d, cb } = base();
  R.anexarBoletoPdf(d, cb.id, 'boleto.pdf', 'j');
  assert.equal(R.boletoPdfDesatualizado(cb), '');
  R.atualizar(d, 'cobrancas', cb.id, { desconto: 10000, multa_percentual: 2 }, 'j');
  const t = R.boletoPdfDesatualizado(cb);
  assert.match(t, /valor até o vencimento era R\$\s?1\.800,00 e agora é R\$\s?1\.900,00/);
  assert.match(t, /a multa era 10%/);
  // anexo de antes (sem os campos novos): só o valor cheio e o vencimento, como antes
  const v = base();
  R.anexarBoletoPdf(v.d, v.cb.id, 'boleto.pdf', 'j');
  R.atualizar(v.d, 'cobrancas', v.cb.id, { boleto_pdf_pontual: null, boleto_pdf_multa: null, boleto_pdf_juros: null, desconto: 10000 }, 'j');
  assert.equal(R.boletoPdfDesatualizado(v.cb), '');
});

function baseBanco() {
  const { d, ank, loja, c } = base();
  d.config_banco = { ativo: true, provedor: 'c6', conta_padrao_id: 'ank', contas: [{ id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox' }] };
  R.normalizar(d);
  return { d, loja, c, cb: R.boletoDoMes(d, c.id, '2026-11') };
}

test('BAN-01: Pix do boleto pago depois do limite com o valor do desconto não casa', () => {
  const { d, cb } = baseBanco();
  cb.banco = { conta_id: 'ank', id_externo: 'ABCDEFGHIJKLMNOPQRSTUVWX12', situacao: 'emitido' };
  const pontual = R.totais(cb).a_pagar_pontual;
  const lista = (dia) => [{ external_reference_id: 'ABCDEFGHIJKLMNOPQRSTUVWX12', status: 'PAID', payments: [{ amount: (pontual / 100).toFixed(2), payment_date: dia, credit_date: dia, payment_type: 'PIX', external_payment_id: 'p1' }] }];
  // vencimento 10/12/2026 (quinta): pago em 15/12 com o valor do desconto → não é em dia, nada é proposto como exato
  const [s] = Z.conciliarBoletos(d, 'ank', lista('2026-12-15'));
  assert.ok(!s || !s.cobranca || s.previsto > pontual, 'não propõe o valor do desconto depois do limite');
  if (s) assert.equal(Z.prontoParaRegistrar(d, s), false);
  // pago no próprio vencimento: casa normalmente
  const [ok] = Z.conciliarBoletos(d, 'ank', lista('2026-12-10'));
  assert.equal(ok.previsto, pontual);
});

test('BAN-03: "Desfazer pagamento" tira também o comprovante da entrada do extrato', () => {
  const { d, cb } = baseBanco();
  const valor = R.totais(cb).a_pagar_pontual;
  const { novas: [m] } = Z.importarExtrato(d, 'ank', [{ reference: 'r1', entry_date: '2026-12-10', amount: (valor / 100).toFixed(2), operation_type: 'INCOMING', transaction_type: 'CREDIT_PIX_PAYMENT_RECEIVED', title: 'Pix', description: 'PIX RECEBIDO' }], 'j', { hoje: '2026-12-20' });
  Z.vincularMovimentacao(d, m.id, { classificacao: 'boleto', cobranca_id: cb.id }, 'j');
  Z.registrarComprovante(d, m.id, { comprovante: 'aluguel.pdf', comprovante_contador: 'aluguel.pdf' }, 'j');
  assert.ok(R.arquivosReferenciados(d).some((x) => x.nome === 'aluguel.pdf'));
  R.estornarPagamento(d, cb.id, 'j');
  const mm = R.buscar(d, 'movimentacoes_banco', m.id);
  assert.equal(mm.classificacao, null);
  assert.equal(mm.comprovante, null);
  assert.equal(mm.comprovante_contador, null);
  assert.equal(R.arquivosReferenciados(d).some((x) => x.nome === 'aluguel.pdf'), false, 'o arquivo fica sem uso e a tela o apaga');
});
