import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as K from '../docs/js/contratos.js';
import * as R from '../docs/js/regras.js';

// FCI (fundo de conservação do imóvel): exemplo do usuário, aluguel R$ 2.000,00, bonificado R$ 1.800,00 (10%), FCI 5% = R$ 90,00
function base(extra = {}) {
  const d = R.bancoVazio();
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 9', endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Inquilino Teste', inquilino_cpf: '529.982.247-25', data_entrada: '2026-09-16',
    vigencia_inicio: '2026-09-16', aluguel_inicial: 200000, desconto_pontualidade_percentual: 10, bonificacao: true, dia_vencimento: 5,
    cobranca_mes_seguinte: true, taxa_boleto: 0, multa_percentual: 2, juros_mensal_percentual: 1, cobrar_iptu: false, conta_seguro: 'Não tem',
    cobrar_seguro: false, fci_percentual: 5, fci_indice: 'Poupança', ...extra }, 'j');
  return { d, c };
}
const texto = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : '')).join('\n');

test('FCI no boleto: % do aluguel bonificado, proporcional aos dias, fora da NF, da multa e dos juros', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-09', 'j');
  R.gerarCobrancas(d, '2026-10', 'j');
  const set = R.boletoDoMes(d, c.id, '2026-09');
  const out = R.boletoDoMes(d, c.id, '2026-10');
  assert.equal(set.fci, 4500, 'entrada em 16/09: 15 de 30 dias → bonificado R$ 900,00 → FCI R$ 45,00');
  assert.equal(out.fci, 9000, 'mês cheio: 5% de R$ 1.800,00');
  const t = R.totais(out);
  assert.equal(t.a_pagar_pontual, 189000, 'R$ 1.800,00 + R$ 90,00');
  assert.equal(t.a_pagar_sem_desconto, 209000);
  assert.equal(t.base_multa, 200000, 'multa e juros sem o FCI');
  const atraso = C.liquidar(out, '2026-11-15'); // 10 dias depois do vencimento de 05/11
  assert.equal(atraso.multa, 4000, '2% de R$ 2.000,00 (sem o FCI)');
  assert.equal(atraso.juros, 660, '1% a.m. de R$ 2.000,00 = R$ 0,66 ao dia × 10');
  assert.equal(atraso.valor_nf, 200000 + 4000 + 660, 'NF sem o FCI');
  assert.equal(C.liquidar(out, '2026-11-05').valor_nf, 180000, 'em dia: NF = aluguel bonificado, sem o FCI');
  const b = R.dadosBoleto(d, out);
  assert.match(b.descricao, /FCI RS90,00/);
  assert.equal(b.multa_valor, 4000);
  assert.equal(b.juros_ao_dia, 66);
});

test('FCI em branco não cobra; carência sem aluguel não tem FCI', () => {
  const { d, c } = base({ fci_percentual: null });
  R.gerarCobrancas(d, '2026-10', 'j');
  assert.equal(R.boletoDoMes(d, c.id, '2026-10').fci, 0);
  assert.equal(R.temFci(c), false);
  const x = base({ carencia_meses: 1, carencia_inicio: '2026-10' });
  R.gerarCobrancas(x.d, '2026-10', 'j');
  assert.equal(R.boletoDoMes(x.d, x.c.id, '2026-10').fci, 0);
});

test('saldo do FCI: só pagos, corrigido a partir do mês seguinte, nunca abaixo do pago', () => {
  const { d, c } = base();
  for (const comp of ['2026-10', '2026-11']) R.gerarCobrancas(d, comp, 'j');
  Object.assign(R.boletoDoMes(d, c.id, '2026-10'), { data_pagamento: '2026-11-05' });
  assert.equal(R.saldoFci(d, c).total, 9000, 'o boleto de novembro ainda não foi pago');
  // pago em novembro: começa em dezembro (0,6%); janeiro não saiu, então fevereiro ainda não conta
  const s = R.saldoFci(d, c, { '2026-11': 0.5, '2026-12': 0.6, '2027-02': 0.7 });
  assert.equal(s.depositos[0].corrigido, 9054, '90 × 1,006 = R$ 90,54');
  assert.equal(s.corrigido, 9054);
  assert.equal(s.ate, '2026-12');
  // deflação (IGP-M negativo): o mês conta, mas o saldo não fica abaixo do pago
  assert.equal(R.saldoFci(d, c, { '2026-12': -1 }).corrigido, 9000);
});

test('saída: o FCI paga só os danos; sobra volta ao inquilino, dano além do FCI vira débito', () => {
  assert.deepEqual(R.calcularEncerramento(540000, 0, 0, 120000, 80000), { garantia_corrigida: 540000, fci_usado: 80000, fci_devolver: 40000, saldo: 580000 });
  assert.deepEqual(R.calcularEncerramento(540000, 0, 100000, 120000, 150000), { garantia_corrigida: 540000, fci_usado: 120000, fci_devolver: 0, saldo: 410000 });
  assert.equal(R.calcularEncerramento(540000, 0, 0).saldo, 540000, 'sem FCI, como antes');
});

test('cláusulas do FCI no contrato só com o FCI ativado; modelos gravados recebem as cláusulas', () => {
  const { d, c } = base();
  const modelo = K.modelosDe(d).find((m) => m.nome === 'Residencial').texto;
  const com = texto(K.montarContrato(modelo, K.dadosDoContrato(d, c, { data: '2026-09-01' })));
  assert.match(com, /FUNDO DE CONSERVAÇÃO DO IMÓVEL \(FCI\)/);
  assert.match(com, /correspondente a 5% \(cinco por cento\) do valor do aluguel com bonificação/);
  assert.match(com, /pela variação do índice de rendimento mensal da caderneta de poupança/);
  assert.match(com, /não constitui garantia locatícia/);
  const sem = texto(K.montarContrato(modelo, K.dadosDoContrato(d, { ...c, fci_percentual: null }, { data: '2026-09-01' })));
  assert.doesNotMatch(sem, /FCI/);
  d.modelos_contrato.push({ id: 1, nome: 'Residencial', padrao: 'Residencial', texto: 'X\n\n## RENOVAÇÃO DO CONTRATO\n\nY' });
  R.normalizar(d);
  R.normalizar(d);
  assert.equal(d.modelos_contrato[0].texto.split('[se fci]').length, 2, 'entra uma vez só');
  assert.ok(d.modelos_contrato[0].texto.indexOf('[se fci]') < d.modelos_contrato[0].texto.indexOf('## RENOVAÇÃO'));
});
