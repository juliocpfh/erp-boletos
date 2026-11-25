// Reserva, carência e "novo valor vale a partir de" perguntados pelo mês do vencimento do boleto (pedido do dono de 24/11/2026,
// como o ressarcimento e o seguro): a tela pergunta o mês em que o boleto vence e grava a referência. Dados de teste fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bancoComUsuarios, carregarSite, entrarComo } from './tela-falsa.mjs';

const T = await carregarSite();
const { E, R, F } = { ...T, F: await import('../docs/js/formularios.js') };
const { CADASTROS } = await import('../docs/js/telas/cadastros.js');

/** Contrato com entrada em 07/06/2026, dia 05; ``seguinte``: o aluguel vence no mês seguinte. */
function contrato(seguinte) {
  const d = bancoComUsuarios(R, E);
  entrarComo(E, 'admin');
  const c = R.inserir(d, 'contratos', { inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07',
    aluguel_inicial: 150000, dia_vencimento: 5, cobranca_mes_seguinte: seguinte, reserva_valor: 50000, reserva_competencia: '2026-12', carencia_meses: 2, carencia_inicio: '2026-07' }, 'teste');
  return { d, c };
}

/** Dados do formulário do contrato como chegam ao ``ajustar`` (só o que interessa aqui). */
const dadosDoContrato = (c, extra) => ({ inquilino_nome: c.inquilino_nome, data_entrada: c.data_entrada, aluguel_inicial: c.aluguel_inicial, bonificacao: false,
  dia_vencimento: c.dia_vencimento, cobranca_mes_seguinte: c.cobranca_mes_seguinte, prazo_tipo: 'Indeterminado', reserva_valor: c.reserva_valor, carencia_meses: c.carencia_meses, ...extra });

test('a tela pergunta o mês do vencimento nos três campos (o gravado continua a referência)', () => {
  contrato(true);
  const contratoTela = CADASTROS.contratos.campos(null, {});
  const renovacaoTela = CADASTROS.renovacoes.campos();
  for (const [lista, gravado, tela] of [[contratoTela, 'reserva_competencia', 'vencimento_reserva'], [contratoTela, 'carencia_inicio', 'vencimento_carencia'], [renovacaoTela, 'vale_desde', 'vencimento_vale_desde']]) {
    assert.equal(lista.some((x) => x.nome === gravado), false, `${gravado} não aparece mais na tela`);
    const campo = lista.find((x) => x.nome === tela);
    assert.match(campo.rotulo, /boleto que vence em \(mês do vencimento\)/, tela);
    assert.ok(campo.autoMsg, `${tela} sem a frase do boleto`);
  }
  // exportação e histórico continuam com a referência
  assert.ok(F.CONTRATO.some((x) => x.nome === 'reserva_competencia') && F.RENOVACAO.some((x) => x.nome === 'vale_desde'));
});

for (const seguinte of [true, false]) {
  const nome = seguinte ? 'vence no mês seguinte' : 'vence no próprio mês';
  // ex. da PR: reserva no boleto que vence em 05/01/2027 = referência 12/2026 (mês seguinte) ou 01/2027 (próprio mês)
  const ref = (mes) => (seguinte ? R.competenciaDoMesVencimento({ cobranca_mes_seguinte: true }, mes) : mes);

  test(`contrato (${nome}): reserva e carência gravam a referência do boleto escolhido`, () => {
    const { c } = contrato(seguinte);
    assert.equal(ref('2027-01'), seguinte ? '2026-12' : '2027-01');
    // abrir para editar: o dado já gravado aparece pelo mês do vencimento (nada é migrado)
    const tela = CADASTROS.contratos.valores(c);
    assert.equal(tela.vencimento_reserva, seguinte ? '2027-01' : '2026-12');
    assert.equal(tela.vencimento_carencia, seguinte ? '2026-08' : '2026-07');
    // salvar sem mexer: grava o mesmo de antes
    const igual = dadosDoContrato(c, { vencimento_reserva: tela.vencimento_reserva, vencimento_carencia: tela.vencimento_carencia });
    const erros = {};
    CADASTROS.contratos.ajustar(igual, erros, c, { campos: [] }, {});
    assert.deepEqual(erros, {});
    assert.equal(igual.reserva_competencia, '2026-12');
    assert.equal(igual.carencia_inicio, '2026-07');
    assert.equal('vencimento_reserva' in igual || 'vencimento_carencia' in igual, false, 'o campo da tela não é gravado');
    // novo mês digitado: boleto que vence em 01/2027 e carência desde o que vence em 09/2026
    const novo = dadosDoContrato(c, { vencimento_reserva: '2027-01', vencimento_carencia: '2026-09' });
    CADASTROS.contratos.ajustar(novo, {}, c, { campos: [] }, {});
    assert.equal(novo.reserva_competencia, ref('2027-01'));
    assert.equal(novo.carencia_inicio, ref('2026-09'));
    // em branco continua em branco (primeiro aluguel / mês de entrada)
    const branco = dadosDoContrato(c, { vencimento_reserva: null, vencimento_carencia: null });
    CADASTROS.contratos.ajustar(branco, {}, c, { campos: [] }, {});
    assert.equal(branco.reserva_competencia, null);
    assert.equal(branco.carencia_inicio, null);
  });

  test(`contrato (${nome}): o "vence no mês seguinte" que está no formulário manda na conversão`, () => {
    const { c } = contrato(seguinte);
    const dados = dadosDoContrato(c, { cobranca_mes_seguinte: !seguinte, vencimento_reserva: '2027-01' });
    CADASTROS.contratos.ajustar(dados, {}, c, { campos: [] }, {});
    assert.equal(dados.reserva_competencia, seguinte ? '2027-01' : '2026-12');
  });

  test(`renovação (${nome}): o novo valor vale a partir do boleto que vence no mês digitado`, () => {
    const { c } = contrato(seguinte);
    const q = { contrato: String(c.id) };
    const dados = { data: '2026-11-20', tipo: 'Novo valor negociado', novo_valor: 160000, novo_percentual: null, vencimento_vale_desde: '2027-01' };
    const erros = {};
    CADASTROS.renovacoes.ajustar(dados, erros, null, { campos: [] }, q);
    assert.deepEqual(erros, {});
    assert.equal(dados.vale_desde, ref('2027-01'));
    assert.equal('vencimento_vale_desde' in dados, false);
    // já gravada: aparece pelo mês do vencimento
    assert.equal(CADASTROS.renovacoes.valores({ contrato_id: c.id, vale_desde: '2026-12' }).vencimento_vale_desde, seguinte ? '2027-01' : '2026-12');
    // antes da entrada: recusado no próprio campo
    const antes = { data: '2026-11-20', tipo: 'Novo valor negociado', novo_valor: 160000, novo_percentual: null, vencimento_vale_desde: '2026-05' };
    const e2 = {};
    CADASTROS.renovacoes.ajustar(antes, e2, null, { campos: [] }, q);
    assert.match(e2.vencimento_vale_desde || '', /anterior à entrada/);
    // em branco: o mês da data (dia 1º) ou o seguinte, como antes
    const branco = { data: '2026-11-20', tipo: 'Novo valor negociado', novo_valor: 160000, novo_percentual: null, vencimento_vale_desde: null };
    CADASTROS.renovacoes.ajustar(branco, {}, null, { campos: [] }, q);
    assert.equal(branco.vale_desde, '2026-12');
  });
}
