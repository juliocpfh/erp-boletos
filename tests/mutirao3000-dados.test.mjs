// Mutirão 3000 (16/11/2026), frente "banco de dados e sincronia": cada teste refaz a prova de um erro da lista
// (faixa de códigos, exclusão tudo ou nada, boletos e extrato em dobro, restauração, conflitos…) contra o cofre de verdade
// (nuvem/cofre.mjs com o SQLite do Node) e a sincronia do site (docs/js/nuvem.js). Dados fictícios.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as N from '../docs/js/nuvem.js';
import * as R from '../docs/js/regras.js';
import * as K from '../nuvem/cofre.mjs';
import { r2Falso } from './r2-falso.mjs';

function sqlFalso() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    exec(q, ...p) {
      if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; }
      const l = db.prepare(q).all(...p).map((x) => ({ ...x }));
      return { toArray: () => l };
    },
  };
}
const transacaoDe = (sql) => (fn) => { sql.db.exec('BEGIN'); try { const r = fn(); sql.db.exec('COMMIT'); return r; } catch (e) { sql.db.exec('ROLLBACK'); throw e; } };
function novoCofre(relogio) { const sql = sqlFalso(); return new K.Cofre(sql, transacaoDe(sql), relogio); }
function novoCofreDO() { const sql = sqlFalso(); return new K.CofreDO({ storage: { sql, transactionSync: transacaoDe(sql) } }, { DADOS: r2Falso() }); }

const TABELAS = Object.entries(R.bancoVazio()).filter(([k, v]) => Array.isArray(v) && k !== 'historico').map(([k]) => k);
function aparelho(cofre, email, guardado = new Map()) {
  const ap = { email, internet: true, guardado, escritos: 0, falharEm: null };
  ap.api = async (metodo, rota, corpo) => {
    if (!ap.internet) throw new N.ErroNuvem('Sem internet.', 0);
    const r = await cofre.fetch(new Request(`https://cofre/${rota}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: { 'X-Email-Conferido': email } }));
    const dados = await r.json();
    if (!r.ok) throw new N.ErroNuvem(dados.erro, r.status, dados);
    return dados;
  };
  ap.guardar = {
    ler: async (k) => structuredClone(guardado.get(k)),
    gravar: async (k, v) => { if (ap.falharEm === k) { ap.falharEm = null; throw new Error('aba fechada'); } ap.escritos += JSON.stringify(v ?? null).length; guardado.set(k, structuredClone(v)); },
    apagar: async (k) => { guardado.delete(k); },
  };
  ap.sinc = new N.Sincronia({ api: ap.api, guardar: ap.guardar, normalizar: R.normalizar, tabelas: TABELAS });
  return ap;
}
const DONO = 'dono@exemplo.com.br'; const SOCIA = 'socia@exemplo.com.br';
function usuarios(d, papelSocia = 'admin') {
  R.inserir(d, 'usuarios', { login: DONO, nome: 'Dono', papel: 'admin', ativo: true }, 't');
  R.inserir(d, 'usuarios', { login: 'socia', email: SOCIA, nome: 'Sócia', papel: papelSocia, ativo: true }, 't');
}
async function doisAparelhos(d) {
  const cofre = novoCofreDO();
  const a = aparelho(cofre, DONO); const b = aparelho(cofre, SOCIA);
  await a.sinc.iniciar(); await a.sinc.importar(d); await b.sinc.iniciar(); await b.sinc.sincronizar(); await a.sinc.sincronizar();
  return { cofre, a, b };
}
const tudo = async (cofre) => (await cofre.fetch(new Request('https://cofre/tudo', { headers: { 'X-Email-Conferido': DONO } }))).json();
function baseContrato(papelSocia = 'admin') {
  const d = R.bancoVazio(); usuarios(d, papelSocia);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', complemento: '', cidade: 'Curitiba', cep: '80010-000' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07', prazo_meses: 30, aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true, taxa_boleto: 350, multa_percentual: 10, juros_mensal_percentual: 1, indice_correcao: 'IGP-M', conta_iptu: 'Não tem', conta_seguro: 'Não tem' }, 'j');
  return { d: R.normalizar(d), loja, c, ank };
}
const baseSimples = () => { const d = R.bancoVazio(); usuarios(d); R.inserir(d, 'imoveis', { nome: 'Apto 1', cep: '80010-000' }, 't'); return R.normalizar(d); };

test('item 1: gravação maior que a faixa pede uma faixa do tamanho dela (com internet) ou é recusada (sem internet)', async () => {
  assert.equal(N.MAX_FAIXA, K.MAX_FAIXA);
  const { cofre, a, b } = await doisAparelhos(baseSimples());
  const lancar = (n) => (x) => { for (let i = 0; i < n; i += 1) R.inserir(x, 'despesas', { descricao: `d${i}`, valor: 100 }, 'dono', null, { historico: false }); };
  // sem internet: recusa com o aviso, nada entra na fila
  a.internet = false;
  await assert.rejects(a.sinc.alterar(lancar(1100)), /Conecte à internet/);
  assert.equal(a.sinc.pendentesQtd(), 0);
  // com internet: reserva a faixa grande antes e grava sem invadir a da sócia
  a.internet = true;
  await a.sinc.alterar(lancar(1100));
  await b.sinc.alterar((x) => R.inserir(x, 'despesas', { descricao: 'B', valor: 5 }, 'socia'));
  await b.sinc.sincronizar(); await a.sinc.sincronizar();
  assert.deepEqual(a.sinc.recusas, []);
  const t = await tudo(cofre);
  assert.equal(t.despesas.length, 1101, 'as 1.100 do dono e a da sócia');
  assert.equal(new Set(t.despesas.map((x) => x.id)).size, 1101);
});

test('item 4: dois aparelhos gerando os boletos do mesmo mês: a nuvem recusa o segundo (contrato, mês)', async () => {
  const { d, c } = baseContrato('operador');
  const { cofre, a, b } = await doisAparelhos(d);
  b.internet = false;
  await a.sinc.alterar((x) => R.gerarCobrancas(x, '2026-08', 'dono')); await a.sinc.sincronizar();
  await b.sinc.alterar((x) => R.gerarCobrancas(x, '2026-08', 'socia'));
  b.internet = true; await b.sinc.sincronizar(); await a.sinc.sincronizar();
  const t = await tudo(cofre);
  assert.equal(t.cobrancas.filter((x) => x.contrato_id === c.id && x.competencia === '2026-08').length, 1);
  assert.match(b.sinc.recusas[0].erro, /boleto do aluguel deste contrato neste mês já existe/);
  assert.equal(b.sinc.atual().cobrancas.filter((x) => x.competencia === '2026-08').length, 1, 'a tela da sócia fica com o da nuvem');
});

test('item 2: exclusão do contrato é tudo ou nada; um boleto mexido em outro aparelho segura a exclusão inteira', async () => {
  const { d, c } = baseContrato('operador');
  R.gerarCobrancas(d, '2026-07', 'j'); R.gerarCobrancas(d, '2026-08', 'j');
  const { cofre, a, b } = await doisAparelhos(d);
  const [b1, b2] = a.sinc.atual().cobrancas.filter((x) => x.contrato_id === c.id);
  await b.sinc.alterar((x) => R.atualizar(x, 'cobrancas', b1.id, { observacoes: 'ligou' }, 'socia')); await b.sinc.sincronizar();
  await a.sinc.alterar((x) => R.excluirContrato(x, c.id, 'dono')); await a.sinc.sincronizar();
  let t = await tudo(cofre);
  assert.equal(t.contratos.length, 1, 'o contrato fica');
  assert.deepEqual(t.cobrancas.map((x) => x.id).sort(), [b1.id, b2.id].sort(), 'nenhum boleto foi apagado');
  assert.equal(t._nuvem.conflitos.length, 1, 'um conflito só');
  const cf = t._nuvem.conflitos[0];
  assert.equal(cf.tipo, 'lote');
  assert.equal(cf.tabela, 'contratos');
  assert.ok(!cf.proposto.ops, 'aos aparelhos vai só o resumo');
  // o administrador escolhe excluir: sai tudo junto, com o histórico
  await a.sinc.resolver(cf.id, 'excluir');
  t = await tudo(cofre);
  assert.equal(t.contratos.length, 0);
  assert.equal(t.cobrancas.length, 0, 'sem boleto órfão');
  assert.ok(t.historico.some((h) => h.acao === 'Exclusão' && h.tabela === 'contratos'));
});

test('item 2: escolhendo "manter", nada da exclusão vale', async () => {
  const { d, c } = baseContrato('operador');
  R.gerarCobrancas(d, '2026-07', 'j'); R.gerarCobrancas(d, '2026-08', 'j');
  const { cofre, a, b } = await doisAparelhos(d);
  const [b1] = a.sinc.atual().cobrancas;
  await b.sinc.alterar((x) => R.atualizar(x, 'cobrancas', b1.id, { observacoes: 'ligou' }, 'socia')); await b.sinc.sincronizar();
  await a.sinc.alterar((x) => R.excluirContrato(x, c.id, 'dono')); await a.sinc.sincronizar();
  await a.sinc.resolver((await tudo(cofre))._nuvem.conflitos[0].id, 'manter');
  const t = await tudo(cofre);
  assert.equal(t.contratos.length, 1); assert.equal(t.cobrancas.length, 2);
  assert.equal(t._nuvem.conflitos.length, 0);
  assert.equal(a.sinc.atual().cobrancas.length, 2, 'a tela do dono volta a mostrar o contrato e os boletos');
});

test('itens 5 a 8: extrato, reajuste, cálculo final, leitura e guia feitos em dois aparelhos não ficam em dobro', () => {
  const c = novoCofre();
  c.importar({ formato: 'imoveis-v1', usuarios: [{ id: 1, login: DONO, papel: 'admin', ativo: true }, { id: 2, login: SOCIA, papel: 'operador', ativo: true }], contratos: [{ id: 1 }],
    movimentacoes_banco: [], correcoes: [], encerramentos: [], leituras: [], guias_impostos: [], cobrancas: [] }, DONO);
  let n = 0;
  const lote = (email, ops) => c.aplicar({ id: `aparelho-${String(n += 1).padStart(6, '0')}`, ops }, email);
  const ins = (tabela, id, dados) => ({ op: 'inserir', tabela, id, dados: { id, ...dados } });
  const casos = [
    ['movimentacoes_banco', { conta_id: 'ank', id_externo: 'C6-123', valor: 150000 }, /lançamento do extrato/],
    ['correcoes', { contrato_id: 1, data_vigencia: '2026-06-01', valor_novo: 148500 }, /correção do aluguel/],
    ['encerramentos', { contrato_id: 1, saldo: 0 }, /cálculo final/],
    ['leituras', { contrato_id: 1, momento: 'Entrada do inquilino', agua: '100' }, /leitura dos relógios/],
    ['guias_impostos', { emitente_id: 1, imposto: 'PIS', periodo: '2026-10', valor: 1234 }, /guia deste imposto/],
  ];
  for (const [tabela, dados, msg] of casos) {
    lote(DONO, [ins(tabela, 1, dados)]);
    assert.throws(() => lote(SOCIA, [ins(tabela, 1001, { ...dados })]), (e) => e.status === 409 && msg.test(e.message), tabela);
    assert.equal(c.tudo()[tabela].length, 1, tabela);
  }
  // o que não conta não é barrado: leitura de outro momento, boleto do complemento da caução, lançamento sem código do banco
  lote(DONO, [ins('cobrancas', 1, { contrato_id: 1, competencia: '2026-08' }), ins('cobrancas', 2, { contrato_id: 1, competencia: '2026-08', caucao_complemento: 5000 })]);
  lote(DONO, [ins('leituras', 2, { contrato_id: 1, momento: 'Outra', agua: '1' }), ins('leituras', 3, { contrato_id: 1, momento: 'Outra', agua: '2' })]);
  lote(DONO, [ins('movimentacoes_banco', 2, { conta_id: 'ank', id_externo: '' }), ins('movimentacoes_banco', 3, { conta_id: 'ank', id_externo: '' })]);
  // excluído e feito de novo no mesmo lote: vale
  lote(DONO, [{ op: 'excluir', tabela: 'encerramentos', id: 1 }, ins('encerramentos', 5, { contrato_id: 1, saldo: 10 })]);
  assert.deepEqual(c.tudo().encerramentos.map((x) => x.id), [5]);
});

test('item 3: o que espera a confirmação (apagar anexos) só sai depois que a nuvem aceita o lote; recusado não apaga', async () => {
  const { d } = baseContrato('operador');
  const { a, b } = await doisAparelhos(d);
  a.internet = false;
  await a.sinc.alterar((x) => R.inserir(x, 'despesas', { descricao: 'x', valor: 1 }, 'dono'));
  await a.sinc.guardarAposConfirmar(a.sinc.ultimoLote, { soltos: [{ pasta: 'p', nome: 'recibo.pdf' }] });
  assert.deepEqual(await a.sinc.prontosAposConfirmar(), { confirmados: [], recusados: [] }, 'sem internet: espera');
  a.internet = true; await a.sinc.sincronizar();
  assert.deepEqual((await a.sinc.prontosAposConfirmar()).confirmados, [{ soltos: [{ pasta: 'p', nome: 'recibo.pdf' }] }]);
  assert.deepEqual(await a.sinc.prontosAposConfirmar(), { confirmados: [], recusados: [] }, 'uma vez só');
  // lote recusado (boleto repetido): o anexo não é apagado
  b.internet = false;
  await a.sinc.alterar((x) => R.gerarCobrancas(x, '2026-08', 'dono')); await a.sinc.sincronizar();
  await b.sinc.alterar((x) => R.gerarCobrancas(x, '2026-08', 'socia'));
  await b.sinc.guardarAposConfirmar(b.sinc.ultimoLote, { soltos: [{ pasta: 'p', nome: 'boleto.pdf' }] });
  b.internet = true; await b.sinc.sincronizar();
  assert.deepEqual(await b.sinc.prontosAposConfirmar(), { confirmados: [], recusados: [{ soltos: [{ pasta: 'p', nome: 'boleto.pdf' }] }] });
});
