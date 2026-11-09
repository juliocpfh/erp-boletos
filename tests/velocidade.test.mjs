import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as F from '../docs/js/formularios.js';
import * as R from '../docs/js/regras.js';

// Atalhos de velocidade (revisão de 09/11/2026): cada um tem de dar exatamente o mesmo resultado do cálculo antigo.

test('índice das NFs por origem: o mesmo que faturasDe, com a origem gravada como número ou texto (dados antigos)', () => {
  const d = R.bancoVazio();
  const nf = (id, origem_tipo, origem_id, situacao = 'Emitida') => d.faturas.push({ id, numero: id, origem_tipo, origem_id, situacao, emitente_id: 1, valor: 100, emissao: '2026-10-05' });
  nf(3, 'cobranca', 5); nf(1, 'cobranca', 5); nf(2, 'cobranca', '5'); nf(4, 'cobranca', 5, 'Cancelada'); nf(5, 'avulsa', 5); nf(6, 'cobranca', 7, 'Cancelada');
  const idx = R.indiceFaturas(d);
  for (const [tipo, id] of [['cobranca', 5], ['cobranca', '5'], ['avulsa', 5], ['cobranca', 7], ['cobranca', 9], ['avulsa', '5']]) {
    assert.deepEqual(idx.nfs(tipo, id).map((f) => f.id), R.faturasDe(d, tipo, id).map((f) => f.id), `${tipo} ${typeof id} ${id}`);
  }
  assert.deepEqual(idx.nfs('cobranca', 5).map((f) => f.id), [1, 3], 'pela ordem do id, só as emitidas');
});

test('pagamentos à espera de NF: com o índice montado uma vez, o mesmo resultado (boleto com NF gravada como texto continua esperando)', () => {
  const d = R.bancoVazio();
  const i = R.inserir(d, 'imoveis', { nome: 'Casa' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', data_entrada: '2026-01-01', aluguel_inicial: 100000, dia_vencimento: 10 }, 'j');
  for (const m of ['2026-01', '2026-02', '2026-03']) R.gerarCobrancas(d, m, 'j');
  for (const cb of d.cobrancas) R.registrarPagamento(d, cb.id, cb.vencimento, null, 'j');
  const [jan, fev] = d.cobrancas;
  d.faturas.push({ id: 1, numero: 1, origem_tipo: 'cobranca', origem_id: jan.id, situacao: 'Emitida', emitente_id: 1, valor: 1, emissao: '2026-02-10' });
  d.faturas.push({ id: 2, numero: 2, origem_tipo: 'cobranca', origem_id: String(fev.id), situacao: 'Emitida', emitente_id: 1, valor: 1, emissao: '2026-03-10' });
  assert.deepEqual(R.pendentesDeFatura(d).map((p) => p.registro.competencia), ['2026-02', '2026-03']);
  assert.deepEqual(R.pendentesDeFatura(d, R.indiceFaturas(d)), R.pendentesDeFatura(d));
  assert.ok(c);
});

test('faturamento das NFs por empresa e mês: o índice dá o mesmo que procurar NF por NF', () => {
  const d = R.bancoVazio();
  let id = 0;
  const nf = (emitente_id, emissao, valor, numero, situacao = 'Emitida') => d.faturas.push({ id: (id += 1), numero, origem_tipo: 'cobranca', origem_id: id, situacao, emitente_id, valor, emissao });
  nf(1, '2026-10-05', 100000, 1); nf(1, '2026-10-20', 50000, 1); nf(1, '2026-10-21', 70000, 2, 'Cancelada'); nf(2, '2026-10-05', 30000, 3);
  nf(1, '2026-11-01', 12345, 4); nf('1', '2026-10-05', 999, 5); nf(1, null, 10, 6);
  const idx = R.indiceFaturamento(d);
  for (const e of [1, 2, '1', 3]) for (const m of ['2026-10', '2026-11', '2026-12', '']) assert.deepEqual(R.faturamentoNf(d, e, m, idx), R.faturamentoNf(d, e, m), `${typeof e} ${e} ${m}`);
  assert.deepEqual(R.faturamentoNf(d, 1, '2026-10', idx), { valor: 150000, notas: 1 });
});

test('contas que podemos lançar: os períodos de entrada e saída dão o mesmo que olhar o mês dia a dia', () => {
  // o cálculo antigo, dia a dia
  const ocupado = (d, imovelId, dia) => d.contratos.some((c) => c.imovel_id === imovelId && c.data_entrada && c.data_entrada <= dia && (c.data_saida ? c.data_saida >= dia : c.ativo !== false));
  const vagoDiaADia = (d, imovelId, comp) => { const [ini, fim] = C.limitesCompetencia(comp); for (let x = ini; x <= fim; x = C.somarDias(x, 1)) if (!ocupado(d, imovelId, x)) return true; return false; };
  const casos = [
    [],
    [['2026-10-01', null]],
    [['2026-10-02', null]],
    [['2026-09-15', '2026-10-30']],
    [['2026-09-15', '2026-10-14'], ['2026-10-15', null]], // sai num dia, o próximo entra no seguinte: sem buraco
    [['2026-09-15', '2026-10-14'], ['2026-10-16', null]], // um dia vazio
    [['2026-01-01', '2026-12-31'], ['2026-10-05', '2026-10-06']],
    [['2026-10-10', '2026-10-31'], ['2026-09-01', '2026-10-12']],
    [['2026-10-01', null, false]], // inativo sem saída não ocupa
    [['2026-10-01', '2026-10-31', false]],
    [['2026-11-01', null]],
    [['2026-10-20', '2026-10-05']], // saída antes da entrada (dado errado)
    [['2026-10-01', '2026-10-31'], [null, null]],
  ];
  for (const [k, contratos] of casos.entries()) {
    const d = R.bancoVazio();
    const i = R.inserir(d, 'imoveis', { nome: `Casa ${k}` }, 'j');
    for (const [entrada, saida, ativo = true] of contratos) d.contratos.push({ id: d.contratos.length + 1, imovel_id: i.id, inquilino_nome: 'X', data_entrada: entrada, data_saida: saida, ativo });
    for (const comp of ['2026-09', '2026-10', '2026-11']) {
      assert.equal(R.contasPermitidas(d, i.id, comp).motivo === 'vago', vagoDiaADia(d, i.id, comp), `caso ${k}, ${comp}`);
    }
  }
});

test('formatadores criados uma vez: o mesmo texto do toLocaleString', () => {
  for (const c of [0, 1, -1, 5, 99, 100, 123456, -123456, 100000000, 1234567891, 0.5, null, undefined, NaN]) {
    const v = (c || 0) / 100;
    assert.equal(C.reais(c), `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    assert.equal(C.reais(c, false), v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    if (c !== null && c !== undefined) assert.equal(F.dinheiroTexto(c), (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  for (const n of [0, 1, 10, 2.5, 0.0333, 1.123456, 12345.6789, -3, null, '8,5']) {
    assert.equal(C.pct(n), `${(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`);
    if (n !== null) assert.equal(F.pctTexto(n), Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false }));
  }
  assert.equal(C.reais(123456), 'R$ 1.234,56');
  assert.equal(F.pctTexto(12345.5), '12345,5');
});
