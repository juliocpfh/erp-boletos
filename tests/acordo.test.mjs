import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

// Acordo de dívida e régua de cobrança (rotina D8, dono em 2026-11-07).
function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com',
    data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    taxa_boleto: 350, multa_percentual: 10, juros_mensal_percentual: 1 }, 'julio');
  for (const comp of ['2026-06', '2026-07']) R.gerarCobrancas(d, comp, 'julio');
  return { d, c, julho: R.boletoDoMes(d, c.id, '2026-07') };
}

test('régua de cobrança: só aviso do próximo passo pelos dias de atraso', () => {
  assert.equal(R.passoDaRegua(0), '');
  assert.equal(R.passoDaRegua(1), 'Mandar o lembrete por e-mail');
  assert.equal(R.passoDaRegua(9), 'Mandar o lembrete por e-mail');
  assert.equal(R.passoDaRegua(10), 'Ligar para o inquilino');
  assert.equal(R.passoDaRegua(40), 'Avaliar a negativação');
  const { d } = base();
  R.registrarPagamento(d, R.boletoDoMes(d, d.contratos[0].id, '2026-06').id, '2026-07-10', null, 'julio');
  const x = R.inadimplencia(d, '2026-09-19').devedores[0];
  assert.equal(x.diasMax, 40);
  assert.equal(x.passo, 'Avaliar a negativação');
  assert.match(R.todosAlertas(d, '2026-09-19').find((a) => a.tipo === 'Inadimplência').texto, /Próximo passo: avaliar a negativação\.$/);
});

test('acordo: R$ 1.353,50 vencido há 40 dias vira 3 boletos de R$ 500,00; o original sai da inadimplência', () => {
  const { d, c, julho } = base();
  R.registrarPagamento(d, R.boletoDoMes(d, c.id, '2026-06').id, '2026-07-10', null, 'julio');
  const hoje = '2026-09-19';
  assert.equal(R.totais(julho).a_pagar_sem_desconto, 135350, 'aluguel R$ 1.350,00 + tarifa R$ 3,50');
  const dados = { contrato_id: c.id, ids: [julho.id], total: 150000, parcelas: 3, primeiro_vencimento: '2026-12-10', observacoes: 'por telefone' };
  const p = R.previaAcordo(d, dados, hoje);
  assert.deepEqual(p.boletos.map((b) => [b.vencimento, b.valor, b.nf, b.outros]),
    [['2026-12-10', 50000, 49884, 116], ['2027-01-10', 50000, 49883, 117], ['2027-02-10', 50000, 49883, 117]],
    'a tarifa (R$ 3,50) fica fora da NF; o resto (aluguel + multa e juros do acordo) vai na NF');
  assert.equal(p.foraDaNf, 350);
  const { acordo, parcelas } = R.fazerAcordo(d, dados, 'julio', hoje);
  assert.equal(julho.situacao, 'Em acordo');
  assert.equal(julho.acordo_id, acordo.id);
  assert.equal(parcelas.length, 3);
  assert.deepEqual(parcelas.map((x) => [x.competencia, x.acordo_parcela]), [['2026-11', '1/3'], ['2026-12', '2/3'], ['2027-01', '3/3']]);
  assert.equal(R.inadimplencia(d, hoje).devedores.length, 0, 'original em acordo e parcelas ainda não vencidas');
  assert.ok(!R.todosAlertas(d, hoje).some((a) => a.tipo === 'Inadimplência'));
  // a parcela não é o aluguel do mês: o boleto de nov/2026 é gerado normalmente
  assert.equal(R.boletoDoMes(d, c.id, '2026-11'), null);
  R.gerarCobrancas(d, '2026-11', 'julio');
  assert.ok(R.boletoDoMes(d, c.id, '2026-11') && !R.ehParcelaAcordo(R.boletoDoMes(d, c.id, '2026-11')));
  // texto do boleto no banco e lembrete
  assert.match(R.dadosBoleto(d, parcelas[0]).descricao, /^ACORDO 1\/3 RS500,00\nREF\. 07\/2026$/);
  assert.match(R.textoLembrete(d, parcelas[0], '2026-12-01').texto, /parcela 1\/3 do acordo \(07\/2026\)/);
  // parcela paga em dia: NF com a parte do aluguel, período do aluguel de julho
  R.registrarPagamento(d, parcelas[0].id, '2026-12-10', null, 'julio');
  assert.equal(parcelas[0].valor_nf, 49884);
  const b = R.baseDaFatura(d, 'cobranca', parcelas[0]);
  assert.deepEqual([b.periodo_inicio, b.periodo_fim], ['2026-07-01', '2026-07-31']);
  assert.match(b.observacoes, /Parcela do acordo 1\/3 \(07\/2026\)/);
  // parcela atrasada: o inquilino volta para a lista
  const x = R.inadimplencia(d, '2027-01-25').devedores[0];
  assert.ok(x.boletos.some((y) => y.cobranca.id === parcelas[1].id));
  assert.ok(!x.boletos.some((y) => y.cobranca.id === julho.id));
});

test('acordo: não desfaz com parcela paga; desfeito, o original volta a ser cobrado', () => {
  const { d, c, julho } = base();
  const hoje = '2026-09-19';
  const { acordo, parcelas } = R.fazerAcordo(d, { contrato_id: c.id, ids: [julho.id], total: 140000, parcelas: 2, primeiro_vencimento: '2026-10-10' }, 'julio', hoje);
  R.registrarPagamento(d, parcelas[0].id, '2026-10-10', null, 'julio');
  assert.throws(() => R.desfazerAcordo(d, acordo.id, 'julio', hoje), /já foi paga/);
  R.estornarPagamento(d, parcelas[0].id, 'julio');
  R.desfazerAcordo(d, acordo.id, 'julio', hoje);
  assert.equal(julho.situacao, 'Em aberto');
  assert.equal(julho.acordo_id, null);
  assert.equal(d.cobrancas.filter((x) => x.acordo_parcela_de === acordo.id).length, 0);
  assert.ok(acordo.desfeito_em);
  assert.ok(R.inadimplencia(d, hoje).devedores[0].boletos.some((y) => y.cobranca.id === julho.id));
});

test('acordo: barra boleto não vencido, de outro inquilino, emitido no C6 ou com valor/data inválidos', () => {
  const { d, c, julho } = base();
  const hoje = '2026-09-19';
  const ok = { contrato_id: c.id, ids: [julho.id], total: 140000, parcelas: 2, primeiro_vencimento: '2026-10-10' };
  assert.throws(() => R.previaAcordo(d, ok, '2026-08-01'), /não está vencido/);
  assert.throws(() => R.previaAcordo(d, { ...ok, total: 0 }, hoje), /valor total/);
  assert.throws(() => R.previaAcordo(d, { ...ok, primeiro_vencimento: '2026-09-01' }, hoje), /primeiro boleto/);
  assert.throws(() => R.previaAcordo(d, { ...ok, parcelas: 30 }, hoje), /de 1 a 24/);
  julho.banco = { situacao: 'emitido' };
  assert.throws(() => R.previaAcordo(d, ok, hoje), /cancele no banco/);
});
