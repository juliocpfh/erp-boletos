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
  // boleto do saldo da saída e parcela de acordo no mesmo mês do aluguel (saída em 15/12, saldo vencendo em 01/2027 = competência 2026-12)
  lote(DONO, [ins('cobrancas', 3, { contrato_id: 1, competencia: '2026-12' })]);
  lote(SOCIA, [ins('cobrancas', 1003, { contrato_id: 1, competencia: '2026-12', saldo_saida_de: 5 }), ins('cobrancas', 1004, { contrato_id: 1, competencia: '2026-12', acordo_parcela_de: 7 })]);
  assert.equal(c.tudo().cobrancas.filter((x) => x.competencia === '2026-12').length, 3);
  // o saldo já na nuvem não barra o aluguel do mês, mas um 2º aluguel do mês continua barrado
  lote(DONO, [ins('cobrancas', 4, { contrato_id: 1, competencia: '2027-01', saldo_saida_de: 5 })]);
  lote(SOCIA, [ins('cobrancas', 1005, { contrato_id: 1, competencia: '2027-01' })]);
  assert.throws(() => lote(DONO, [ins('cobrancas', 6, { contrato_id: 1, competencia: '2026-12' })]), (e) => e.status === 409);
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

test('itens 9 e 10: voltar para um backup segura a fila dos outros aparelhos e mantém os usuários de hoje', async () => {
  const d = R.bancoVazio(); usuarios(d, 'operador'); R.inserir(d, 'imoveis', { nome: 'Apto 1', cep: '80010-000' }, 't');
  const { cofre, a, b } = await doisAparelhos(R.normalizar(d));
  const backup = await tudo(cofre);
  await a.sinc.alterar((x) => R.atualizar(x, 'usuarios', 2, { ativo: false }, 'dono')); await a.sinc.sincronizar();
  b.internet = false;
  await b.sinc.alterar((x) => { R.atualizar(x, 'imoveis', 1, { nome: 'Apto 1 - errado' }, 'socia'); R.inserir(x, 'despesas', { descricao: 'x', valor: 1 }, 'socia'); });
  await a.sinc.importar(backup, { substituir: true, manterUsuarios: true });
  assert.equal(a.sinc.atual().usuarios.find((u) => u.id === 2).ativo, false, 'a sócia desativada continua desativada');
  b.internet = true; await b.sinc.sincronizar().catch(() => {});
  await a.sinc.sincronizar();
  assert.equal(a.sinc.atual().imoveis[0].nome, 'Apto 1', 'a mudança feita antes da volta não entrou');
  assert.equal(a.sinc.atual().despesas.length, 0);
});

test('item 9: depois da volta, o aparelho que já viu a carga nova grava normalmente', async () => {
  const { cofre, a, b } = await doisAparelhos(baseSimples());
  await a.sinc.importar(await tudo(cofre), { substituir: true });
  await b.sinc.sincronizar();
  await b.sinc.alterar((x) => R.atualizar(x, 'imoveis', 1, { nome: 'Novo nome' }, 'socia')); await b.sinc.sincronizar();
  assert.deepEqual(b.sinc.recusas, []);
  assert.equal((await tudo(cofre)).imoveis[0].nome, 'Novo nome');
});

test('itens 12 e 13: subchaves diferentes do mesmo campo (parcelas do IPTU, extrato de cada conta) se juntam sem conflito', () => {
  const c = novoCofre();
  c.importar({ formato: 'imoveis-v1', usuarios: [{ id: 1, login: DONO, papel: 'admin', ativo: true }, { id: 2, login: SOCIA, papel: 'operador', ativo: true }], iptus: [{ id: 1, ano: 2026, pagas: {} }], extrato_importado_ate: {} }, DONO);
  c.aplicar({ id: 'aaaaaaaa-1', ops: [{ op: 'alterar', tabela: 'iptus', id: 1, campos: { pagas: { antes: {}, depois: { 1: '2026-02-10' } } } }] }, DONO);
  const r = c.aplicar({ id: 'bbbbbbbb-1', ops: [{ op: 'alterar', tabela: 'iptus', id: 1, campos: { pagas: { antes: {}, depois: { 2: '2026-03-10' } } } }] }, SOCIA);
  assert.equal(r.conflitos.length, 0);
  assert.deepEqual(c.tudo().iptus[0].pagas, { 1: '2026-02-10', 2: '2026-03-10' });
  c.aplicar({ id: 'aaaaaaaa-2', ops: [{ op: 'raiz', campo: 'extrato_importado_ate', antes: {}, depois: { ank: '2026-11-10' } }] }, DONO);
  c.aplicar({ id: 'bbbbbbbb-2', ops: [{ op: 'raiz', campo: 'extrato_importado_ate', antes: {}, depois: { jck: '2026-11-12' } }] }, SOCIA);
  assert.deepEqual(c.tudo().extrato_importado_ate, { ank: '2026-11-10', jck: '2026-11-12' });
  // a mesma parcela com datas diferentes continua sendo conflito
  const r2 = c.aplicar({ id: 'bbbbbbbb-3', ops: [{ op: 'alterar', tabela: 'iptus', id: 1, campos: { pagas: { antes: {}, depois: { 1: '2026-02-11' } } } }] }, SOCIA);
  assert.equal(r2.conflitos.length, 1);
  assert.deepEqual(K.juntarSubchaves({ a: 1 }, {}, { a: 1, b: 2 }), { b: 2 }, 'subchave apagada aqui sai');
});

test('itens 31, 32, 34, 43 e 49: faxina, código repetido na importação, nulo da tela e lote muito antigo', () => {
  let agora = new Date('2026-11-16T12:00:00Z');
  const c = novoCofre(() => agora);
  const ini = { formato: 'imoveis-v1', usuarios: [{ id: 1, login: DONO, papel: 'admin', ativo: true }, { id: 9, login: 'z', papel: 'consulta', ativo: true, senha_hash: 'HASH', sessoes: ['t'] }], imoveis: [{ id: 1, nome: 'Apto' }], cobrancas: [{ id: 900, contrato_id: 1, competencia: '2026-01' }] };
  c.importar(ini, DONO);
  // 43: a tela tinha `banco: null` (normalizar) e a nuvem nem tinha o campo: exclui sem conflito
  const r = c.aplicar({ id: 'aaaaaaaa-43', ops: [{ op: 'excluir', tabela: 'cobrancas', id: 900, base: { id: 900, contrato_id: 1, competencia: '2026-01', banco: null } }] }, DONO);
  assert.deepEqual(r.conflitos, []);
  assert.equal(c.tudo().cobrancas.length, 0);
  // 31: usuário apagado fica guardado sem senha e sai depois de 180 dias
  c.aplicar({ id: 'aaaaaaaa-31', ops: [{ op: 'excluir', tabela: 'usuarios', id: 9 }] }, DONO);
  const guardado = JSON.parse(c.q("SELECT dados FROM excluidos WHERE tabela = 'usuarios'")[0].dados);
  assert.equal(guardado.senha_hash, undefined); assert.equal(guardado.sessoes, undefined); assert.equal(guardado.login, 'z');
  // 32: conflito resolvido sai depois de 90 dias
  c.aplicar({ id: 'bbbbbbbb-32', ops: [{ op: 'alterar', tabela: 'imoveis', id: 1, campos: { nome: { antes: 'outro', depois: 'B' } } }] }, DONO);
  c.resolver({ conflito: c.conflitosAbertos()[0].id, escolha: 'atual' }, DONO);
  agora = new Date('2027-06-01T12:00:00Z'); c.limpar();
  assert.equal(c.q('SELECT COUNT(*) AS n FROM excluidos')[0].n, 0);
  assert.equal(c.q('SELECT COUNT(*) AS n FROM conflitos')[0].n, 0);
  // 49: lote parado mais de 60 dias no aparelho é recusado
  assert.throws(() => c.aplicar({ id: 'aparelhoX-000001', em: '2027-03-01T12:00:00Z', ops: [{ op: 'historico', entrada: { descricao: 'Pagamento registrado' } }] }, DONO), (e) => e.status === 409 && /60 dias/.test(e.message));
  // 34: código repetido na importação: 400 dizendo onde, nada trocado
  assert.throws(() => c.importar({ formato: 'imoveis-v1', usuarios: [{ id: 1, login: DONO, papel: 'admin', ativo: true }], despesas: [{ id: 5 }, { id: 5 }] }, DONO, { substituir: true }), (e) => e.status === 400 && /código 5 em despesas/.test(e.message));
  assert.equal(c.tudo().imoveis.length, 1);
});

test('item 17: excluir o contrato do novo titular devolve ao anterior o seguro herdado', () => {
  const { d, loja, c } = baseContrato();
  const n = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Novo', contrato_anterior_id: c.id, data_entrada: '2026-09-01', vigencia_inicio: '2026-09-01', aluguel_inicial: 135000 }, 'j');
  const s = R.inserir(d, 'seguros', { imovel_id: loja.id, contrato_id: c.id, vigencia_inicio: '2026-01-01', vigencia_fim: '2027-01-01', arquivo_apolice: 'apolice.pdf' }, 'j');
  R.atualizar(d, 'seguros', s.id, { contrato_id: n.id, herdado_de: c.id }, 'j', 'herdar');
  R.excluirContrato(d, n.id, 'j');
  const x = R.buscar(d, 'seguros', s.id);
  assert.equal(x.contrato_id, c.id); assert.equal(x.herdado_de, null);
  assert.ok(R.arquivosReferenciados(d).some((a) => a.nome === 'apolice.pdf'), 'o arquivo da apólice continua em uso');
});

test('item 20: rotina de abertura tira o destino que foi excluído das movimentações do banco, com histórico', () => {
  const d = R.bancoVazio();
  R.inserir(d, 'movimentacoes_banco', { conta_id: 'ank', id_externo: 'X', data: '2026-10-01', valor: 100, tipo: 'saida', classificacao: 'iptu', iptu_id: 77, iptu_parcela: 1, cobranca_id: 88 }, 'j');
  const dn = R.normalizar(d);
  assert.equal(R.rotinaDeAbertura(dn, 'j', { soConferir: true }), 1);
  const h = dn.historico.length;
  R.rotinaDeAbertura(dn, 'j');
  const m = dn.movimentacoes_banco[0];
  assert.deepEqual([m.iptu_id, m.iptu_parcela, m.cobranca_id, m.classificacao], [null, null, null, null]);
  assert.equal(dn.historico.length, h + 1);
  assert.equal(R.rotinaDeAbertura(dn, 'j', { soConferir: true }), 0);
});

test('itens 38, 45 e 47: códigos novos nunca repetem, tabela enorme não quebra, data impossível não passa', async () => {
  const d = R.bancoVazio(); d.seq = {};
  d.fiadores.push({ id: 1, contrato_id: 5, nome: 'Já migrado' }); d.contratos.push({ id: 6, inquilino_nome: 'Y', fiador_nome: 'Antigo' });
  R.normalizar(d);
  assert.deepEqual(d.fiadores.map((f) => f.id).sort(), [1, 2]);
  const e = R.bancoVazio(); e.despesas.push({ id: 1 }, { id: 5 }); e.seq.despesas = 4;
  assert.equal(R.inserir(e, 'despesas', { valor: 1 }, 'j').id, 6);
  const g = R.bancoVazio(); for (let i = 1; i <= 200000; i += 1) g.despesas.push({ id: i });
  assert.equal(R.inserir(g, 'despesas', { valor: 1 }, 'j').id, 200001);
  const C = await import('../docs/js/calculos.js');
  assert.equal(C.dataValida('2026-02-31'), '');
  assert.equal(C.dataValida('2028-02-29'), '2028-02-29');
});

test('itens 26, 27 e 51: importar ZIP guarda o anexo trocado; ZIP sai mesmo com anexo ilegível; só 5 cópias "antes"', async () => {
  const fs = await import('node:fs'); const path = await import('node:path'); const os = await import('node:os');
  const S = await import('../docs/js/armazenamento.js');
  const { PastaDisco } = await import('./pasta-disco.mjs');
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'zip26-'));
  try {
    fs.mkdirSync(path.join(raiz, 'arquivos', 'Apto 1'), { recursive: true });
    fs.writeFileSync(path.join(raiz, 'arquivos', 'Apto 1', 'contrato assinado.pdf'), 'VERSAO NOVA ASSINADA');
    const d = R.bancoVazio(); R.inserir(d, 'usuarios', { login: 'dono', papel: 'admin', ativo: true }, 't');
    const backups = path.join(raiz, 'backups'); fs.mkdirSync(backups);
    for (let i = 0; i < 6; i += 1) fs.writeFileSync(path.join(backups, `antes-da-importacao-2026-01-0${i + 1}T10-00-00-000Z.json`), '{}');
    const ent = (t) => ({ dir: false, async: async (k) => (k === 'string' ? t : new Blob([t])) });
    const JSZip = { loadAsync: async (m) => ({ files: m, file: (n) => m[n] }) };
    await S.importarZip(JSZip, new PastaDisco(raiz), { 'imoveis-dados.json': ent(JSON.stringify(d)), 'arquivos/Apto 1/contrato assinado.pdf': ent('VERSAO VELHA') }, d);
    const guardadas = fs.readdirSync(backups).filter((n) => n.startsWith('antes-da-importacao-'));
    const pastaGuarda = guardadas.find((n) => !n.endsWith('.json'));
    assert.equal(fs.readFileSync(path.join(backups, pastaGuarda, 'arquivos', 'Apto 1', 'contrato assinado.pdf'), 'utf8'), 'VERSAO NOVA ASSINADA');
    assert.equal(guardadas.filter((n) => n.endsWith('.json')).length, S.MANTER_ANTES_IMPORTACAO);
  } finally { fs.rmSync(raiz, { recursive: true, force: true }); }
  // 27: um anexo que some no meio fica na lista "não incluídos"
  const nomes = [];
  class Zip { file(n) { nomes.push(n); } async generateAsync() { return new Blob(['zip']); } }
  const ruim = { kind: 'directory', async *entries() {
    yield ['bom.pdf', { kind: 'file', getFile: async () => new File(['x'], 'bom.pdf') }];
    yield ['sumiu.pdf', { kind: 'file', getFile: async () => { throw new DOMException('não encontrado', 'NotFoundError'); } }];
  } };
  const pastaFalsa = { getDirectoryHandle: async (n) => { if (n === 'arquivos') return ruim; throw new DOMException('', 'NotFoundError'); } };
  await S.exportarZip(Zip, pastaFalsa, { formato: 'imoveis-v1' });
  assert.ok(nomes.includes('NAO-INCLUIDOS.txt'));
});

test('itens 21 e 23: dois aparelhos anexando o mesmo nome não se apagam; anexo que sumiu da fila vira aviso', async () => {
  const S = await import('../docs/js/armazenamento.js');
  const { AnexosNuvem } = await import('../docs/js/pasta-nuvem.js');
  const { atender } = await import('../nuvem/worker.mjs');
  const R2 = r2Falso(); const env = { MODO_TESTE: '1', ORIGEM: 'http://localhost:8787', DADOS: R2 }; const est = { internet: true };
  const buscar = async (url, op = {}) => { if (!est.internet) throw new TypeError('Failed to fetch'); return atender(new Request(url, { ...op, headers: { Origin: 'http://localhost:8787', ...op.headers } }), env); };
  const novo = () => { const g = new Map(); const c = new AnexosNuvem({ base: 'http://localhost:8787/api/', buscar, guardar: { ler: async (k) => g.get(k), gravar: async (k, v) => { g.set(k, v); }, apagar: async (k) => { g.delete(k); } } }); c.g = g; return c; };
  const pasta = async (cli) => S.subpasta(await cli.raiz().getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true }), ['Apto 1']);
  const a = novo(); const b = novo();
  const da = await pasta(a); const db = await pasta(b);
  await S.listar(db); // a lista da pasta fica guardada no aparelho B
  const na = await S.salvarArquivo(da, new File(['DO DONO'], 'comprovante.pdf'), { compactar: false });
  const nb = await S.salvarArquivo(db, new File(['DA SOCIA'], 'comprovante.pdf'), { compactar: false });
  assert.equal(na, 'comprovante.pdf'); assert.equal(nb, 'comprovante (2).pdf');
  assert.equal(await (await a.ler(['arquivos', 'Apto 1', 'comprovante.pdf'])).text(), 'DO DONO');
  // 23: sem internet, o arquivo guardado sumiu do aparelho antes de subir
  est.internet = false;
  await S.salvarArquivo(da, new File(['RECIBO'], 'recibo.pdf'), { compactar: false });
  for (const k of [...a.g.keys()]) if (k.startsWith('anexo:')) a.g.delete(k);
  est.internet = true; a.avisos = [];
  await a.enviarFila();
  assert.equal(a.naoEnviados.length, 1);
  assert.match(a.avisos[0], /sumiu deste aparelho/);
});

test('item 40: fila, contador e faixas gravados juntos: falha no meio não deixa o aparelho sem poder incluir', async () => {
  const cofre = novoCofreDO(); const g = new Map();
  let a = aparelho(cofre, DONO, g); await a.sinc.iniciar(); await a.sinc.importar(baseSimples()); await a.sinc.sincronizar();
  let falhar = false;
  const comVarios = (ap) => { ap.guardar.gravarVarios = async (obj) => { if (falhar) { falhar = false; throw new Error('aba fechada'); } for (const [k, v] of Object.entries(obj)) g.set(k, structuredClone(v)); }; };
  comVarios(a);
  a.internet = false;
  await a.sinc.alterar((x) => R.inserir(x, 'despesas', { descricao: 'primeira', valor: 1 }, 'dono'));
  falhar = true;
  await assert.rejects(a.sinc.alterar((x) => R.inserir(x, 'despesas', { descricao: 'segunda', valor: 1 }, 'dono')), /aba fechada/);
  a = aparelho(cofre, DONO, g); comVarios(a); a.internet = false; await a.sinc.iniciar().catch(() => {});
  await a.sinc.alterar((x) => R.inserir(x, 'despesas', { descricao: 'terceira', valor: 1 }, 'dono'));
  const ids = a.sinc.atual().despesas.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(a.sinc.atual().despesas.map((x) => x.descricao), ['primeira', 'terceira']);
});
