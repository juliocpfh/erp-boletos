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
});
