import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as CR from '../docs/js/config-regras.js';
import * as Z from '../docs/js/conciliacao.js';
import * as G from '../docs/js/regua-email.js';
import * as R from '../docs/js/regras.js';

// Decisão do dono de 24/11/2026 (pergunta 9 da busca de 24/11, REG-03 e BAN-02): a tolerância do boleto conta em dias úteis a
// partir do último dia para pagar, e o mesmo número vale na sugestão do extrato, no botão "É o pagamento do boleto" e no início
// da cobrança de atraso da régua por e-mail. Dados fictícios.
function base(tolerancia) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07',
    aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 10, taxa_boleto: 350, multa_percentual: 10, juros_mensal_percentual: 1 }, 'julio');
  d.config_banco = { ativo: true, provedor: 'c6', conta_padrao_id: 'ank', contas: [{ id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox' }] };
  if (tolerancia !== undefined) d.config_banco.tolerancia_dias = tolerancia; // vira a regra `tolerancia_boleto_dias` no normalizar
  R.normalizar(d);
  R.gerarCobrancas(d, '2026-07', 'julio');
  const cb = R.boletoDoMes(d, c.id, '2026-07');
  cb.banco = { conta_id: 'ank', id_externo: 'ABCDEFGHIJKLMNOPQRSTUVWX12', nosso_numero: '0000987654', situacao: 'emitido' };
  return { d, c, cb };
}
/** Entrada do extrato pelo valor em dia, citando o nosso número, creditada em ``data``. */
function entrada(d, cb, data) {
  const { novas: [m] } = Z.importarExtrato(d, 'ank', [{ reference: `r-${data}`, entry_date: data, amount: (R.totais(cb).a_pagar_pontual / 100).toFixed(2), operation_type: 'INCOMING',
    transaction_type: 'OTHER', title: 'Liquidacao de boleto', description: 'LIQUIDACAO BOLETO 987654' }], 'julio', { hoje: '2026-12-20' });
  return m;
}

test.afterEach(() => CR.usarRegras(null));

test('REG-03: a regra explica dias úteis desde o último dia para pagar, com o exemplo do sábado 10/10/2026 (feriado 12/10) até 16/10', () => {
  const def = CR.DEFINICOES_REGRAS.find((x) => x.chave === 'tolerancia_boleto_dias');
  assert.match(def.rotulo, /dias úteis/);
  assert.match(def.explica, /dias úteis/);
  assert.match(def.explica, /10\/10\/2026/);
  assert.match(def.explica, /16\/10\/2026/);
  assert.doesNotMatch(def.explica, /entrou dia 13/);
  // a conta do sistema bate com o exemplo do texto
  assert.equal(C.somarDiasUteis(C.limitePagamento('2026-10-10'), 3), '2026-10-16');
});

test('BAN-02: regra em 6, vence 10/08 e entra 17/08 pelo valor em dia: "Usar sugestão" e "É o pagamento do boleto" dão o mesmo (pago em dia)', () => {
  const { d, cb } = base(6);
  assert.equal(R.regra('tolerancia_boleto_dias'), 6);
  assert.equal(cb.vencimento, '2026-08-10');
  const m = entrada(d, cb, '2026-08-17');
  const s = Z.sugerirDestino(d, m);
  assert.equal(s.classificacao, 'boleto');
  assert.equal(s.pagouEmDia, true);
  const r = Z.confirmarPagamentoPeloBanco(d, cb.id, m.id, 'julio');
  assert.equal(r.divergente, false);
  const pago = R.buscar(d, 'cobrancas', cb.id);
  assert.equal(pago.pagou_em_dia, true);
  assert.equal(pago.valor_pago, R.totais(cb).a_pagar_pontual);
});

test('BAN-02: regra em 0, entrada no dia útil seguinte ao vencimento pelo valor em dia: a sugestão e o botão recusam os dois', () => {
  const { d, cb } = base(0);
  assert.equal(R.regra('tolerancia_boleto_dias'), 0);
  const m = entrada(d, cb, '2026-08-11');
  const s = Z.sugerirDestino(d, m);
  assert.ok(!s || s.classificacao !== 'boleto' || !s.pagouEmDia, 'a sugestão não dá como em dia');
  assert.throws(() => Z.confirmarPagamentoPeloBanco(d, cb.id, m.id, 'julio'), /menor/);
  assert.equal(Z.devidoNoCredito(cb, m.valor, m.data).emDia, false);
});

test('padrão (3 dias úteis) continua igual: vence 10/08, entra 13/08 em dia, 14/08 já não', () => {
  const { d, cb } = base();
  assert.equal(R.regra('tolerancia_boleto_dias'), 3);
  assert.equal(Z.devidoNoCredito(cb, R.totais(cb).a_pagar_pontual, '2026-08-13').emDia, true);
  assert.equal(Z.devidoNoCredito(cb, R.totais(cb).a_pagar_pontual, '2026-08-14').emDia, false);
  assert.deepEqual(Z.datasPossiveisDoPagamento('2026-08-14'), ['2026-08-14', '2026-08-13', '2026-08-12', '2026-08-11']);
  CR.usarRegras(d);
  assert.equal(G.inicioDaCobranca({ vencimento: '2026-12-10' }), '2026-12-16');
});

test('q9b: o início da cobrança de atraso da régua por e-mail usa a mesma regra (6 → vence qui 10/12/2026, começa seg 21/12)', () => {
  const { d } = base(6);
  CR.usarRegras(d);
  assert.equal(G.inicioDaCobranca({ vencimento: '2026-12-10' }), C.somarDiasUteis('2026-12-10', 7));
  assert.equal(G.inicioDaCobranca({ vencimento: '2026-12-10' }), '2026-12-21');
  assert.equal(G.dataDaEtapa({ vencimento: '2026-12-10' }, 3), '2026-12-21');
});
