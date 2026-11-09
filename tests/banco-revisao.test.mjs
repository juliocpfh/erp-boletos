// Revisão do banco (C6) de 09/11/2026: cada teste reproduz um problema achado (dados fictícios: CPF 529.982.247-25,
// CNPJ 11.222.333/0001-81) e confere a correção. Nada vai ao banco.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as K from '../docs/js/c6-comum.js';
import * as F2 from '../docs/js/banco-fase2.js';
import * as R from '../docs/js/regras.js';
import * as Z from '../docs/js/conciliacao.js';

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
  R.inserir(d, 'iptus', { imovel_id: loja.id, ano: 2026, valor_total: 100000, num_parcelas: 10, primeira_competencia: '2026-02' }, 'julio');
  d.config_banco = { ativo: true, provedor: 'c6', conta_padrao_id: 'ank',
    contas: [{ id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox' }, { id: 'jck', apelido: 'JCK', emitente_id: jck.id, ambiente: 'sandbox' }] };
  R.normalizar(d);
  R.gerarCobrancas(d, '2026-06', 'julio');
  R.gerarCobrancas(d, '2026-07', 'julio'); // boleto 07/2026: vence 10/08/2026, em dia R$ 1.318,50
  return { d, ank, jck, loja, sobre, c, cb2: d.cobrancas[1] };
}

// Lançamentos no formato do extrato do C6 (entries[] de saldo-extrato.yaml)
const entrada = (reference, entry_date, amount, extra = {}) => ({ reference, local_reference: `L${reference}`, created_at: `${entry_date}T10:00:00`, entry_date, amount,
  operation_type: 'INCOMING', transaction_type: 'CREDIT_PIX_PAYMENT_RECEIVED', title: 'Pix Recebido', description: 'PIX RECEBIDO MARIA EXEMPLO', end_to_end_id: `E${reference}`, ...extra });
const saida = (reference, entry_date, amount, description, extra = {}) => ({ reference, created_at: `${entry_date}T10:00:00`, entry_date, amount,
  operation_type: 'OUTGOING', transaction_type: 'PAYMENT', title: 'Pagamento', description, ...extra });

// --------------------------------------------------------------------------
// Item 4: valores como R$ 19,99 recusados ("no máximo 2 casas decimais"); o simulador do site não conferia os itens
// --------------------------------------------------------------------------
test('item 4: nenhum valor em centavos é recusado por "2 casas decimais" (19,99 × 100 = 1998,9999… no computador)', () => {
  const BARRAS = '8366000000100000000000000000000000000000000'.padEnd(44, '0');
  const recusados = [];
  for (let c = 1; c <= 100000; c += 1) {
    try { K.validarItem({ content: BARRAS, amount: Z.reaisParaC6(c) }); } catch (e) { if (/casas decimais/.test(e.message)) recusados.push(c); }
  }
  assert.deepEqual(recusados, [], 'R$ 0,01 a R$ 1.000,00: todos passam');
  assert.equal(K.validarItem({ content: BARRAS, amount: 19.99 }).amount, 19.99);
  assert.equal(K.validarItem({ content: BARRAS, amount: 1.15 }).amount, 1.15);
  assert.equal(K.validarItem({ content: BARRAS, amount: 0.1 + 0.2 }).amount, 0.3, 'o resto do ponto flutuante some');
  assert.throws(() => K.validarItem({ content: BARRAS, amount: 1.234 }), /2 casas/);
  assert.throws(() => K.validarItem({ content: BARRAS, amount: 19.995 }), /2 casas/);
});

test('item 4: os leitores de valor em reais são um só (c6-comum): C6 "1500.00", OFX "-215.00" e "1.234,56", item do pagamento', () => {
  assert.deepEqual([K.centavosDoTexto('1500.00'), K.centavosDoTexto('1.234,56'), K.centavosDoTexto('-215.00'), K.centavosDoTexto('19.99'), K.centavosDoTexto(' 1 234,56 ')], [150000, 123456, -21500, 1999, 123456]);
  assert.deepEqual([Z.centavosDoOfx('-215.00'), Z.centavosDoOfx('3298.53'), Z.centavosDoOfx('1.234,56'), Z.centavosDoOfx('')], [-21500, 329853, 123456, 0]);
  assert.throws(() => Z.centavosDoOfx('abc'), /Valor inválido no arquivo OFX/);
  assert.equal(Z.centavosDoC6('19.99'), 1999);
});

test('item 4: em ?teste o simulador do site confere os itens como a ponte (validarItem) e lê R$ 19,99', async () => {
  globalThis.location = { search: '?teste' };
  try {
    const BARRAS = '83660000001' + '9'.repeat(33);
    const { group_id } = await F2.decodificarPagamentos('ank', [{ content: BARRAS, amount: 19.99, description: 'Luz Loja 1' }]);
    const { items } = await F2.itensDoGrupo('ank', group_id);
    assert.deepEqual([items[0].status, items[0].amount, items[0].content], ['READ_DATA', 19.99, BARRAS]);
    await assert.rejects(F2.decodificarPagamentos('ank', [{ content: BARRAS, amount: 1.234 }]), /2 casas/);
    await assert.rejects(F2.decodificarPagamentos('ank', [{ content: 'nada disso', amount: 10 }]), /Não reconheci/);
    // o extrato fictício do site é o mesmo redatado da ponte (lancamentosNoPeriodo de c6-comum)
    const ex = await F2.extratoDaConta('ank', '2026-12-01', '2026-12-31');
    assert.ok(ex.lancamentos.length > 0);
    assert.ok(ex.lancamentos.every((l) => l.conta_id === 'ank' && l.entry_date.startsWith('2026-12') && /-202612$/.test(l.reference)));
  } finally {
    delete globalThis.location;
  }
});

// --------------------------------------------------------------------------
// Itens 8 e 5: "importado até" fora de config_banco (o operador importa na nuvem) e nunca o dia de hoje (o fim do dia se perdia)
// --------------------------------------------------------------------------
/** Cofre da nuvem com o SQLite do Node (igual a tests/cofre.test.mjs). */
async function cofreDeTeste() {
  const { DatabaseSync } = await import('node:sqlite');
  const { Cofre } = await import('../nuvem/cofre.mjs');
  const db = new DatabaseSync(':memory:');
  const sql = { db, exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  return new Cofre(sql, tx, () => new Date('2026-11-09T10:00:00-03:00'));
}

test('item 8: o operador importa o extrato na nuvem (antes o lote inteiro era recusado: "Só o administrador muda config_banco")', async () => {
  const { diferencas } = await import('../docs/js/nuvem.js');
  const c = await cofreDeTeste();
  const DONO = 'dono@exemplo.com.br'; const OP = 'operador@exemplo.com.br';
  const d0 = R.bancoVazio();
  d0.usuarios = [{ id: 1, login: DONO, papel: 'admin', ativo: true }, { id: 2, login: OP, papel: 'operador', ativo: true }];
  d0.config_banco = { ...d0.config_banco, contas: [{ id: 'ank', apelido: 'ANK', emitente_id: 1 }] };
  R.normalizar(d0);
  c.importar(d0, DONO);
  const antes = R.normalizar(c.tudo(OP));
  const depois = structuredClone(antes);
  Z.importarExtrato(depois, 'ank', [{ id_externo: 'x1', data: '2026-11-03', valor_centavos: 150000, tipo: 'entrada', descricao: 'PIX RECEBIDO' }], OP, { de: '2026-11-01', ate: '2026-11-08', hoje: '2026-11-09' });
  const ops = diferencas(antes, depois);
  assert.ok(!ops.some((o) => o.op === 'raiz' && o.campo === 'config_banco'), 'importar não mexe em config_banco');
  c.aplicar({ id: 'aparelho-op-lote-0001', ops }, OP);
  const nuvem = c.tudo();
  assert.equal(nuvem.movimentacoes_banco.length, 1, 'a movimentação chegou à nuvem');
  assert.equal(R.extratoImportadoAte(nuvem, 'ank'), '2026-11-08');
});

test('item 8: "importado até" fica na raiz (extrato_importado_ate, por conta); normalizar copia o que estava em config_banco.ultima_importacao', () => {
  const { d } = base();
  const cfgAntes = structuredClone(d.config_banco);
  Z.importarExtrato(d, 'ank', [saida('a1', '2026-11-05', '123.45', 'SANEPAR')], 'julio', { de: '2026-11-01', ate: '2026-11-15', hoje: '2026-11-20' });
  assert.deepEqual(d.config_banco, cfgAntes, 'config_banco não muda ao importar');
  assert.deepEqual(d.extrato_importado_ate, { ank: '2026-11-15' });
  assert.equal(R.extratoImportadoAte(d, 'ank'), '2026-11-15');
  assert.equal(R.extratoImportadoAte(d, 'jck'), null);
  // banco antigo: a data estava em config_banco.ultima_importacao
  const velho = R.bancoVazio();
  velho.config_banco.ultima_importacao = { ank: '2026-10-31', jck: '2026-10-15' };
  R.normalizar(velho);
  assert.deepEqual(velho.extrato_importado_ate, { ank: '2026-10-31', jck: '2026-10-15' });
  assert.deepEqual(velho.config_banco.ultima_importacao, { ank: '2026-10-31', jck: '2026-10-15' }, 'o campo antigo fica como estava');
  velho.extrato_importado_ate.ank = '2026-11-08';
  R.normalizar(velho);
  assert.equal(velho.extrato_importado_ate.ank, '2026-11-08', 'a data mais nova não volta para a antiga');
  // sem importação nenhuma, normalizar não cria o campo (nada a mandar à nuvem)
  const novo = R.normalizar(R.bancoVazio());
  assert.equal(novo.extrato_importado_ate, undefined);
});

test('item 5: buscar o extrato até hoje grava "importado até" = ontem (o que entra à tarde não se perde no fechamento)', () => {
  const { d } = base();
  // segunda 30/11/2026, 10h: "Buscar extrato de 11/2026" (de 01/11 até hoje)
  Z.importarExtrato(d, 'ank', [saida('a1', '2026-11-05', '123.45', 'SANEPAR')], 'julio', { de: '2026-11-01', ate: '2026-11-30', hoje: '2026-11-30' });
  Z.importarExtrato(d, 'jck', [], 'julio', { de: '2026-11-01', ate: '2026-11-30', hoje: '2026-11-30' });
  assert.deepEqual(d.extrato_importado_ate, { ank: '2026-11-29', jck: '2026-11-29' });
  // em 02/12 o Fechamento de novembro ainda pede o extrato das duas contas
  let p = R.pendenciasBancoDoMes(d, '2026-11', '2026-12-02');
  assert.deepEqual(p.contasSemImportar, ['ank', 'jck']);
  // buscando de novo em 01/12, novembro fica completo
  Z.importarExtrato(d, 'ank', [saida('a1', '2026-11-05', '123.45', 'SANEPAR'), saida('a2', '2026-11-30', '39.90', 'TARIFA PACOTE')], 'julio', { de: '2026-11-01', ate: '2026-11-30', hoje: '2026-12-01' });
  p = R.pendenciasBancoDoMes(d, '2026-11', '2026-12-02');
  assert.deepEqual(p.contasSemImportar, ['jck']);
  assert.equal(d.movimentacoes_banco.length, 2, 'a tarifa da tarde de 30/11 entrou; a de 05/11 não repetiu');
  // arquivo OFX que vai até hoje: o mesmo cuidado
  Z.importarExtrato(d, 'jck', [], 'julio', { de: '2026-12-01', ate: '2026-12-03', hoje: '2026-12-03' });
  assert.equal(R.extratoImportadoAte(d, 'jck'), '2026-12-02');
  // só o dia de hoje (ex.: dezembro buscado em 01/12): nenhum dia completo, nada muda
  Z.importarExtrato(d, 'ank', [], 'julio', { de: '2026-12-01', ate: '2026-12-01', hoje: '2026-12-01' });
  assert.equal(R.extratoImportadoAte(d, 'ank'), '2026-11-30');
});

// --------------------------------------------------------------------------
// Item 7: o mesmo lançamento pelo arquivo OFX e depois pela API entrava em dobro (o FITID não é o reference da API)
// --------------------------------------------------------------------------
const ofx = (stmttrns) => `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>123</ACCTID></BANKACCTFROM><BANKTRANLIST><DTSTART>20261101</DTSTART><DTEND>20261115</DTEND>
${stmttrns.map(([fitid, valor, data, memo, refnum]) => `<STMTTRN><FITID>${fitid}</FITID><TRNAMT>${valor}</TRNAMT><DTPOSTED>${data.replace(/-/g, '')}100000[-3:BRT]</DTPOSTED><TRNTYPE>${valor.startsWith('-') ? 'DEBIT' : 'CREDIT'}</TRNTYPE>${refnum ? `<REFNUM>${refnum}</REFNUM>` : ''}<MEMO>${memo}</MEMO></STMTTRN>`).join('\n')}
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('item 7: OFX e depois a API do mesmo lançamento: não entra em dobro; a linha fica com o reference da API (o comprovante pela ponte acha)', () => {
  const { d, sobre } = base();
  const r1 = Z.importarExtrato(d, 'ank', Z.lerOfx(ofx([['7781234', '-123.45', '2026-11-05', 'PAGAMENTO BOLETO SANEPAR', '01JGHAMYWRSAW41GAMFKEG17VA']])).lancamentos, 'julio', { de: '2026-11-01', ate: '2026-11-15', hoje: '2026-11-20' });
  assert.equal(r1.novas[0].fonte, 'ofx');
  Z.vincularMovimentacao(d, r1.novas[0].id, { classificacao: 'conta_imovel', imovel_id: sobre.id, tipo_despesa: 'Água', competencia: '2026-10' }, 'julio');
  // chaves do C6 chegam: "Buscar extrato de 11/2026 no banco" traz o mesmo lançamento pela API
  const api = [saida('019aeec0-a61a-8043-4a46-2f191aebdf9a', '2026-11-05', '123.45', 'PAGAMENTO BOLETO SANEPAR', { local_reference: '01JGHAMYWRSAW41GAMFKEG17VA' })];
  const r2 = Z.importarExtrato(d, 'ank', api, 'julio', { de: '2026-11-01', ate: '2026-11-30', hoje: '2026-12-01' });
  assert.deepEqual([r2.novas.length, r2.repetidas], [0, 1]);
  assert.equal(d.movimentacoes_banco.length, 1, 'o mesmo dinheiro numa linha só');
  const m = d.movimentacoes_banco[0];
  assert.deepEqual([m.id_externo, m.id_ofx, m.classificacao], ['019aeec0-a61a-8043-4a46-2f191aebdf9a', '7781234', 'conta_imovel'], 'o destino continua; o identificador passa a ser o da API');
  assert.equal(Z.referenciaNoBanco(m), '019aeec0-a61a-8043-4a46-2f191aebdf9a');
  assert.equal(d.despesas.filter((x) => x.imovel_id === sobre.id).length, 1, 'uma conta de água só');
  // o mesmo arquivo OFX de novo, ou a API de novo: nada entra
  assert.equal(Z.importarExtrato(d, 'ank', Z.lerOfx(ofx([['7781234', '-123.45', '2026-11-05', 'PAGAMENTO BOLETO SANEPAR', '01JGHAMYWRSAW41GAMFKEG17VA']])).lancamentos, 'julio', { hoje: '2026-12-01' }).repetidas, 1);
  assert.equal(Z.importarExtrato(d, 'ank', api, 'julio', { hoje: '2026-12-01' }).repetidas, 1);
  assert.equal(d.movimentacoes_banco.length, 1);
});

test('item 7: sem referência em comum, OFX × API casa por conta + data + valor + descrição; dois lançamentos iguais de verdade continuam dois', () => {
  const { d } = base();
  // dois Pix iguais no mesmo dia (dois inquilinos pagando R$ 50,00): no OFX e depois na API
  Z.importarExtrato(d, 'ank', Z.lerOfx(ofx([['f1', '50.00', '2026-11-05', 'PIX RECEBIDO JOAO TESTE'], ['f2', '50.00', '2026-11-05', 'PIX RECEBIDO JOAO TESTE'], ['f3', '-210.80', '2026-11-05', 'PAGAMENTO BOLETO COPEL']])).lancamentos, 'julio', { hoje: '2026-11-20' });
  assert.equal(d.movimentacoes_banco.length, 3);
  // o que ainda só veio pelo OFX: o comprovante pela ponte procura pela referência local, se houver, senão pelo FITID
  assert.equal(Z.referenciaNoBanco(d.movimentacoes_banco[0]), 'f1');
  const api = [entrada('019a0000-0000-7000-8000-000000000001', '2026-11-05', '50.00', { description: 'PIX RECEBIDO JOAO TESTE', local_reference: null, end_to_end_id: null }),
    entrada('019a0000-0000-7000-8000-000000000002', '2026-11-05', '50.00', { description: 'PIX RECEBIDO JOAO TESTE', local_reference: null, end_to_end_id: null }),
    saida('019a0000-0000-7000-8000-000000000003', '2026-11-05', '210.80', 'PAGAMENTO BOLETO COPEL UC 7654321'),
    saida('019a0000-0000-7000-8000-000000000004', '2026-11-06', '210.80', 'PAGAMENTO BOLETO COPEL UC 7654321')];
  const r = Z.importarExtrato(d, 'ank', api, 'julio', { hoje: '2026-11-20' });
  assert.deepEqual([r.novas.length, r.repetidas], [1, 3], 'só o de 06/11 é novo');
  assert.equal(d.movimentacoes_banco.length, 4);
  assert.ok(d.movimentacoes_banco.slice(0, 3).every((m) => /^019a0000-/.test(m.id_externo) && m.id_ofx), 'cada linha do OFX ganhou o reference de uma da API');
  // dois lançamentos iguais da mesma origem nunca se juntam
  const { d: d2 } = base();
  const r3 = Z.importarExtrato(d2, 'ank', [api[0], api[1]], 'julio', { hoje: '2026-11-20' });
  assert.equal(r3.novas.length, 2);
  // o mesmo valor e a mesma data em outra conta não é o mesmo lançamento
  assert.equal(Z.importarExtrato(d, 'jck', [api[2]], 'julio', { hoje: '2026-11-20' }).novas.length, 1);
});

// --------------------------------------------------------------------------
// Itens 1 e 9: um pagamento quitava dois boletos; as duas conferências de boletos pagos passam a usar a mesma regra
// --------------------------------------------------------------------------
test('item 1: entrada de um boleto já pago à mão é LIGADA a ele (não vira o pagamento do boleto do mês seguinte)', () => {
  const { d, cb2 } = base();
  // boleto 07/2026 (vence 10/08, R$ 1.318,50) pago à mão na tela Boletos em 10/08/2026
  R.registrarPagamento(d, cb2.id, '2026-08-10', 131850, 'julio');
  R.gerarCobrancas(d, '2026-08', 'julio');
  const cb3 = d.cobrancas.find((x) => x.competencia === '2026-08'); // vence 10/09, mesmo valor
  // o extrato de agosto, buscado depois, traz a entrada de 10/08
  const { novas: [mov] } = Z.importarExtrato(d, 'ank', [entrada('r1', '2026-08-10', '1318.50')], 'julio', { hoje: '2026-09-01' });
  const s = Z.sugerirDestino(d, mov);
  assert.deepEqual([s.classificacao, s.cobranca_id, s.ligar], ['boleto', cb2.id, true], 'propõe ligar ao boleto 07/2026 já pago');
  assert.match(s.motivo, /já está pago/);
  const r = Z.vincularMovimentacao(d, mov.id, { classificacao: 'boleto', cobranca_id: s.cobranca_id }, 'julio');
  assert.equal(r.ligada, true);
  assert.deepEqual([cb2.movimentacao_id, R.buscar(d, 'movimentacoes_banco', mov.id).cobranca_id, cb3.data_pagamento], [mov.id, cb2.id, null], 'só liga: o de 08/2026 continua em aberto');
  assert.equal(cb2.valor_pago, 131850);
  // outra entrada igual em 10/08 não liga ao mesmo boleto de novo
  const { novas: [outra] } = Z.importarExtrato(d, 'ank', [entrada('r2', '2026-08-10', '1318.50')], 'julio', { hoje: '2026-09-01' });
  assert.notEqual((Z.sugerirDestino(d, outra) || {}).ligar, true);
  assert.throws(() => Z.ligarMovimentacaoAoBoleto(d, outra.id, cb2.id, 'julio'), /já está ligado a outra entrada/);
});

test('item 1: só casa boleto que vence até 45 dias depois da entrada', () => {
  const { d } = base();
  R.gerarCobrancas(d, '2026-08', 'julio');
  R.gerarCobrancas(d, '2026-09', 'julio');
  const cb3 = d.cobrancas.find((x) => x.competencia === '2026-08'); // vence 10/09
  const cb4 = d.cobrancas.find((x) => x.competencia === '2026-09'); // vence 10/10
  const { novas: [mov] } = Z.importarExtrato(d, 'ank', [entrada('r1', '2026-08-20', '1318.50')], 'julio', { hoje: '2026-09-01' });
  const casa = Z.conciliarMovimentacoes(d, [mov]).map((x) => x.cobranca_id);
  assert.deepEqual(casa, [cb3.id], `20/08: o de 10/09 (21 dias) casa; o de 10/10 (51 dias) não (era ${cb4.id})`);
  assert.equal(Z.DIAS_ANTECIPACAO, 45);
});

test('item 1/9: listagem do banco — um pagamento que casa com dois boletos não vem marcado; boleto já pago à mão não chama outro', () => {
  const { d, cb2 } = base();
  R.gerarCobrancas(d, '2026-08', 'julio');
  const cb3 = d.cobrancas.find((x) => x.competencia === '2026-08');
  // boleto 07/2026 emitido fora do sistema (referência desconhecida aqui), pago em 10/08
  const listagem = [{ external_reference_id: 'ABC123EMITIDONOSITEC6XXXXX', payments: [{ amount: '1318.50', payment_date: '2026-08-10', credit_date: '2026-08-11', external_payment_id: 'p1', payment_type: 'PIX' }] }];
  const sug = Z.conciliarBoletos(d, 'ank', listagem);
  assert.deepEqual(sug.map((s) => [s.cobranca_id, s.alternativas]), [[cb2.id, 2], [cb3.id, 2]]);
  assert.ok(sug.every((s) => !Z.prontoParaRegistrar(d, s)), 'nenhuma caixa marcada: quem escolhe é o usuário');
  // pago à mão com a data do crédito: a listagem só confirma (já estava pago) e não propõe o de 08/2026
  R.registrarPagamento(d, cb2.id, '2026-08-11', 131850, 'julio');
  const sug2 = Z.conciliarBoletos(d, 'ank', listagem);
  assert.deepEqual(sug2.map((s) => [s.cobranca_id, s.jaPago]), [[cb2.id, true]]);
  assert.equal(Z.prontoParaRegistrar(d, sug2[0]), false);
  // ainda sem crédito (WAITING_CONFIRMATION, sem credit_date): não vem marcado
  const espera = Z.conciliarBoletos(d, 'ank', [{ external_reference_id: 'X', status: 'WAITING_CONFIRMATION', payments: [{ amount: '1318.50', payment_date: '2026-09-09' }] }]);
  assert.deepEqual(espera.map((s) => [s.cobranca_id, s.aguardandoCredito]), [[cb3.id, true]]);
  assert.equal(Z.prontoParaRegistrar(d, espera[0]), false);
});

test('item 1/9: registrar o pagamento informado pelo banco liga a linha do extrato quando ela existe (as duas conferências usam esta)', () => {
  const { d, cb2 } = base();
  cb2.banco = { conta_id: 'ank', id_externo: 'B00000002REF0000000000000', situacao: 'pago' };
  const { novas: [mov] } = Z.importarExtrato(d, 'ank', [entrada('r1', '2026-08-11', '1318.50')], 'julio', { hoje: '2026-09-01' });
  const [s] = Z.conciliarBoletos(d, 'ank', [{ external_reference_id: 'B00000002REF0000000000000', payments: [{ amount: '1318.50', payment_date: '2026-08-10', credit_date: '2026-08-11', external_payment_id: 'p1', payment_type: 'PIX' }] }]);
  assert.deepEqual([s.cobranca_id, s.certeza, s.alternativas, Z.prontoParaRegistrar(d, s)], [cb2.id, 'exata', 1, true]);
  const r = Z.registrarPagamentoDoBanco(d, 'ank', s, 'julio');
  assert.equal(r.divergente, false);
  assert.deepEqual([cb2.data_pagamento, cb2.movimentacao_id, R.buscar(d, 'movimentacoes_banco', mov.id).classificacao], ['2026-08-11', mov.id, 'boleto']);
  // sem a linha do extrato: registra e guarda o pagamento do C6 no boleto
  const { d: d2, cb2: b2 } = base();
  const [s2] = Z.conciliarBoletos(d2, 'ank', [{ external_reference_id: 'X', payments: [{ amount: '1318.50', payment_date: '2026-08-10', credit_date: '2026-08-11', external_payment_id: 'p2', payment_type: 'PIX' }] }]);
  Z.registrarPagamentoDoBanco(d2, 'ank', s2, 'julio');
  assert.deepEqual([b2.data_pagamento, b2.movimentacao_id || null, b2.pagamento_c6.external_payment_id], ['2026-08-11', null, 'p2']);
  // a data em que pagou vale também com a linha do extrato: pagou atrasado em 12/08, crédito em 13/08 → multa e juros até 12/08
  const { d: d3, cb2: b3 } = base();
  const previsto = R.previstoNoPagamento(b3, '2026-08-12').valor_devido;
  Z.importarExtrato(d3, 'ank', [entrada('r9', '2026-08-13', (previsto / 100).toFixed(2))], 'julio', { hoje: '2026-09-01' });
  const r3 = Z.registrarPagamentoDoBanco(d3, 'ank', { cobranca_id: b3.id, valor: previsto, data_pagamento: '2026-08-12', data_credito: '2026-08-13' }, 'julio');
  assert.equal(r3.divergente, false, 'previsto calculado até o dia em que pagou');
  assert.ok(b3.movimentacao_id);
});

test('item 9: itens do lote casados com os pagamentos por uma função só (id, código + valor, ordem)', () => {
  const pags = [{ id: 1, id_externo: 'it-b', content: 'AAA', valor: 1999 }, { id: 2, id_externo: null, content: 'BBB', valor: 500 }, { id: 3, id_externo: null, content: 'CCC', valor: 700 }];
  const itens = [{ id: 'it-a', content: 'BBB', amount: 5 }, { id: 'it-b', content: 'outro', amount: 19.99 }, { id: 'it-c', content: 'CCC-lido', amount: 7 }];
  assert.deepEqual(Z.casarItensDoGrupo(pags, itens).map((it) => it && it.id), ['it-b', 'it-a', 'it-c']);
  assert.deepEqual(Z.casarItensDoGrupo([{ id: 9, content: 'Z', valor: 100 }], []), [null]);
});

test('item 1/9: confirmado na janela da tela Boletos, o pagamento liga a linha do extrato que já estava importada', () => {
  const { d, cb2 } = base();
  const { novas: [mov] } = Z.importarExtrato(d, 'ank', [entrada('r1', '2026-08-11', '1318.50')], 'julio', { hoje: '2026-09-01' });
  assert.equal(Z.ligarEntradaDoBoleto(d, cb2.id, 'ank', 'julio'), null, 'em aberto: nada a ligar');
  R.registrarPagamento(d, cb2.id, '2026-08-11', 131850, 'julio', { pagouEmDia: true });
  assert.equal(Z.ligarEntradaDoBoleto(d, cb2.id, 'jck', 'julio'), null, 'outra conta: não é este dinheiro');
  assert.equal(Z.ligarEntradaDoBoleto(d, cb2.id, 'ank', 'julio').id, mov.id);
  assert.deepEqual([cb2.movimentacao_id, R.buscar(d, 'movimentacoes_banco', mov.id).classificacao], [mov.id, 'boleto']);
});

test('item 9: a listagem de boletos lida pelo site avisa quando o banco tem mais do que as 10 páginas lidas', async () => {
  const B = await import('../docs/js/banco.js');
  const { d } = base();
  await B.salvarPonteLocal({ ponte_url: 'http://localhost:8765', senha_ponte: 'frase longa combinada com a ponte' });
  const f = async (url) => { const p = Number(new URL(url).searchParams.get('page')); return new Response(JSON.stringify({ content: Array.from({ length: 100 }, (_, i) => ({ id: `p${p}-${i}` })), total_pages: 12, total_elements: 1150 }), { status: 200 }); };
  const todos = await B.listarTodosBoletos(d, 'ank', { payment_date_from: '2026-11-01', payment_date_to: '2026-11-30' }, { fetch: f });
  assert.deepEqual([todos.length, todos.incompleto, todos.total], [1000, true, 1150]);
  const uma = async () => new Response(JSON.stringify({ content: [{ id: 'a' }], total_pages: 1 }), { status: 200 });
  const curta = await B.listarTodosBoletos(d, 'ank', { payment_date_from: '2026-11-01', payment_date_to: '2026-11-30' }, { fetch: uma });
  assert.deepEqual([curta.length, curta.incompleto], [1, undefined]);
  await B.esquecerPonteLocal();
});
