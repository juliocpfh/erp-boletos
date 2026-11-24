import assert from 'node:assert/strict';
import test from 'node:test';
import * as CR from '../docs/js/config-regras.js';
import * as Z from '../docs/js/conciliacao.js';
import * as G from '../docs/js/regua-email.js';
import * as R from '../docs/js/regras.js';

// Decisão do dono de 24/11/2026: a tolerância do extrato (`tolerancia_boleto_dias`) pode ser diferente por tipo de contrato, pela
// regra especial. Ex.: "Comercial" com 6 dias úteis; os demais com os 3 da empresa. Dados fictícios.
function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const perfil = R.inserir(d, 'perfis_regras', { nome: 'Comercial', valores: { tolerancia_boleto_dias: 6 } }, 'julio');
  const contrato = (nome, aluguel, extra = {}) => {
    const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome, endereco: `Rua Exemplo, ${nome}`, cidade: 'Curitiba' }, 'julio');
    R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: ank.id, percentual: 100 }, 'julio');
    return R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: `Inquilino ${nome}`, inquilino_cpf: '529.982.247-25', data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07',
      aluguel_inicial: aluguel, dia_vencimento: 10, cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 10, multa_percentual: 10, juros_mensal_percentual: 1, ...extra }, 'julio');
  };
  const com = contrato('Loja', 135000, { perfil_regras_id: perfil.id });
  const res = contrato('Casa', 120000);
  d.config_banco = { ativo: true, provedor: 'c6', conta_padrao_id: 'ank', contas: [{ id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox' }] };
  R.normalizar(d);
  R.gerarCobrancas(d, '2026-07', 'julio');
  const cbCom = R.boletoDoMes(d, com.id, '2026-07');
  const cbRes = R.boletoDoMes(d, res.id, '2026-07');
  cbCom.banco = { conta_id: 'ank', id_externo: 'COMERCIAL0000000000000001', nosso_numero: '0000111111', situacao: 'emitido' };
  cbRes.banco = { conta_id: 'ank', id_externo: 'RESIDENCIAL00000000000001', nosso_numero: '0000222222', situacao: 'emitido' };
  return { d, perfil, com, res, cbCom, cbRes };
}
/** Entrada pelo valor em dia em ``data``; ``numero``: o nosso número citado na descrição (sem ele, só valor e data). */
function entrada(d, cb, data, numero = null) {
  const { novas: [m] } = Z.importarExtrato(d, 'ank', [{ reference: `r-${cb.id}-${data}`, entry_date: data, amount: (R.totais(cb).a_pagar_pontual / 100).toFixed(2), operation_type: 'INCOMING',
    transaction_type: 'OTHER', title: 'Liquidacao de boleto', description: numero ? `LIQUIDACAO BOLETO ${numero}` : 'LIQUIDACAO BOLETO' }], 'julio', { hoje: '2026-12-20' });
  return m;
}

test.afterEach(() => CR.usarRegras(null));

test('a tolerância do boleto pode ser escolhida na regra especial e cada boleto segue a do seu contrato', () => {
  const { cbCom, cbRes, com, res } = base();
  assert.ok(CR.podePorContrato('tolerancia_boleto_dias'));
  assert.equal(R.regra('tolerancia_boleto_dias'), 3);
  assert.equal(R.regra('tolerancia_boleto_dias', com), 6);
  assert.equal(R.regra('tolerancia_boleto_dias', res), 3);
  assert.equal(Z.diasCompensacaoBoleto(cbCom), 6, 'pelo boleto (só tem o contrato_id)');
  assert.equal(Z.diasCompensacaoBoleto(cbRes), 3);
});

test('vence 10/08 e entra 17/08 pelo valor em dia: o comercial (6) é pago em dia pela sugestão e pelo botão; o residencial (3), não', () => {
  const { d, cbCom, cbRes } = base();
  assert.equal(cbCom.vencimento, '2026-08-10');
  assert.equal(cbRes.vencimento, '2026-08-10');
  const mCom = entrada(d, cbCom, '2026-08-17', '111111');
  const mRes = entrada(d, cbRes, '2026-08-17', '222222');
  const sCom = Z.sugerirDestino(d, mCom);
  assert.equal(sCom.cobranca_id, cbCom.id);
  assert.equal(sCom.pagouEmDia, true);
  const sRes = Z.sugerirDestino(d, mRes);
  assert.ok(!sRes || !sRes.pagouEmDia, 'o residencial não sai como em dia');
  const r = Z.confirmarPagamentoPeloBanco(d, cbCom.id, mCom.id, 'julio');
  assert.equal(r.divergente, false);
  assert.equal(R.buscar(d, 'cobrancas', cbCom.id).pagou_em_dia, true);
  assert.throws(() => Z.confirmarPagamentoPeloBanco(d, cbRes.id, mRes.id, 'julio'), /menor/);
  assert.equal(R.buscar(d, 'cobrancas', cbRes.id).data_pagamento, null);
});

test('conferência do extrato só pelo valor e pela data (e pela listagem do banco): cada boleto pelo número do seu contrato', () => {
  const { d, cbCom, cbRes } = base();
  const [mCom, mRes] = [entrada(d, cbCom, '2026-08-17'), entrada(d, cbRes, '2026-08-17')];
  const casa = Z.conciliarMovimentacoes(d, [mCom, mRes]);
  assert.deepEqual(casa.filter((x) => x.movimentacao_id === mCom.id).map((x) => [x.cobranca_id, x.pagouEmDia]), [[cbCom.id, true]]);
  assert.deepEqual(casa.filter((x) => x.movimentacao_id === mRes.id).map((x) => x.cobranca_id), [], 'residencial fora do prazo, pelo valor do desconto: não casa');
  // número passado à mão continua valendo para todos
  assert.equal(Z.conciliarMovimentacoes(d, [mRes], { dias: 6 }).length, 1);
  // listagem do banco só com a data do crédito
  const lista = (cb) => [{ amount: (R.totais(cb).a_pagar_pontual / 100).toFixed(2), credit_date: '2026-08-17' }];
  assert.equal(Z.conciliarBoletos(d, 'ank', lista(cbCom)).filter((x) => x.cobranca_id === cbCom.id).length, 1);
  assert.equal(Z.conciliarBoletos(d, 'ank', lista(cbRes)).filter((x) => x.cobranca_id === cbRes.id).length, 0);
});

test('régua por e-mail: a cobrança de atraso começa pelo número de cada contrato (vence qui 10/12/2026: comercial 21/12, residencial 16/12)', () => {
  const { cbCom, cbRes } = base();
  assert.equal(G.inicioDaCobranca({ ...cbCom, vencimento: '2026-12-10' }), '2026-12-21');
  assert.equal(G.inicioDaCobranca({ ...cbRes, vencimento: '2026-12-10' }), '2026-12-16');
});
