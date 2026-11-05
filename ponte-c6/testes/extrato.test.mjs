import assert from 'node:assert/strict';
import test from 'node:test';
import { janelas, somarDias, diasEntre, centavosDoTexto, reaisBr } from '../c6-datas.mjs';
import { extrato, saldo, semRepetidos, ordenarLancamentos, DIAS_JANELA_EXTRATO } from '../c6-extrato.mjs';
import { criarC6Simulado } from '../c6-simulado.mjs';

/** c6 de teste que anota as chamadas e responde com o que `responder` devolver. */
const c6Falso = (responder, conta = 'ank') => {
  const chamadas = [];
  return { conta, chamadas, async chamar(metodo, caminho, opts = {}) { chamadas.push({ metodo, caminho, ...opts }); return responder(metodo, caminho, opts); } };
};

test('janelas: divide o período em pedaços seguidos de até N dias, sem furo nem sobreposição', () => {
  const j = janelas('2026-01-01', '2026-03-15', 30);
  assert.deepEqual(j, [
    { de: '2026-01-01', ate: '2026-01-30' },
    { de: '2026-01-31', ate: '2026-03-01' },
    { de: '2026-03-02', ate: '2026-03-15' },
  ]);
  for (const w of j) assert.ok(diasEntre(w.de, w.ate) <= 29, 'cada janela tem no máximo 30 dias corridos');
  for (let i = 1; i < j.length; i++) assert.equal(j[i].de, somarDias(j[i - 1].ate, 1));
  assert.deepEqual(janelas('2026-05-10', '2026-05-10', 30), [{ de: '2026-05-10', ate: '2026-05-10' }]);
  assert.deepEqual(janelas('2026-01-01', '2026-03-01', 60), [{ de: '2026-01-01', ate: '2026-03-01' }]);
  assert.throws(() => janelas('2026-02-30', '2026-03-01', 30), /não existe/);
  assert.throws(() => janelas('2026-03-02', '2026-03-01', 30), /não pode ser depois/);
  assert.throws(() => janelas('05/11/2026', '2026-11-05', 30), /AAAA-MM-DD/);
});

test('extrato: 75 dias viram 3 consultas de até 30 dias ao C6, e os lançamentos saem com conta_id', async () => {
  const c6 = c6Falso((m, caminho, { query }) => ({ status: 200, corpo: { entries: [{ reference: `${query.start_date}`, entry_date: query.start_date, created_at: `${query.start_date}T10:00:00`, amount: '1.00', operation_type: 'INCOMING', transaction_type: 'OTHER', title: 't', description: 'd' }] } }), 'jck');
  const r = await extrato(c6, { de: '2026-01-01', ate: '2026-03-16' });
  assert.equal(c6.chamadas.length, 3);
  assert.equal(c6.chamadas[0].caminho, '/v1/statement/');
  assert.deepEqual(c6.chamadas[0].query, { start_date: '2026-01-01', end_date: '2026-01-30' });
  assert.deepEqual(c6.chamadas[2].query, { start_date: '2026-03-02', end_date: '2026-03-16' });
  for (const w of c6.chamadas) assert.ok(diasEntre(w.query.start_date, w.query.end_date) < DIAS_JANELA_EXTRATO);
  assert.equal(r.conta_id, 'jck');
  assert.equal(r.lancamentos.length, 3);
  assert.ok(r.lancamentos.every((l) => l.conta_id === 'jck'));
  assert.equal(r.lancamentos[0].amount, '1.00', 'campos do C6 ficam como vieram');
});

test('extrato: lançamentos repetidos (mesma reference) entram uma vez só e a ordem é por data e hora', async () => {
  const a = { reference: 'A', entry_date: '2026-11-05', created_at: '2026-11-05T10:00:00', amount: '1.00' };
  const b = { reference: 'B', entry_date: '2026-11-03', created_at: '2026-11-03T09:00:00', amount: '2.00' };
  const c = { reference: 'C', entry_date: '2026-11-05', created_at: '2026-11-05T08:00:00', amount: '3.00' };
  // duas janelas que devolvem o mesmo "A" (o banco pode repetir na borda)
  let n = 0;
  const c6 = c6Falso(() => ({ status: 200, corpo: { entries: n++ === 0 ? [a, b] : [a, c, { ...a, amount: '999.00' }] } }));
  const r = await extrato(c6, { de: '2026-10-20', ate: '2026-11-30' });
  assert.equal(c6.chamadas.length, 2);
  assert.deepEqual(r.lancamentos.map((l) => l.reference), ['B', 'C', 'A']);
  assert.equal(r.lancamentos.find((l) => l.reference === 'A').amount, '1.00', 'mantém o primeiro');
  assert.equal(semRepetidos([{ reference: null }, { reference: null }]).length, 2, 'sem reference não descarta');
  assert.deepEqual(ordenarLancamentos([c, a]).map((l) => l.reference), ['C', 'A']);
});

test('extrato: erro do banco vira Error em português com o status', async () => {
  const c6 = c6Falso(() => ({ status: 401, corpo: { message: 'Unauthorized' } }));
  await assert.rejects(extrato(c6, { de: '2026-11-01', ate: '2026-11-05' }), (e) => e.status === 401 && /respondeu 401/.test(e.message));
  await assert.rejects(extrato(c6, { de: '2025-01-01', ate: '2026-11-05' }), /até 366 dias/);
});

test('extrato simulado: novembro/2026 tem 8 lançamentos na ANK e 4 na JCK; a TED aparece nas duas', async () => {
  const ank = await extrato(criarC6Simulado({ conta: 'ank' }), { de: '2026-11-01', ate: '2026-11-30' });
  const jck = await extrato(criarC6Simulado({ conta: 'jck' }), { de: '2026-11-01', ate: '2026-11-30' });
  assert.equal(ank.lancamentos.length, 8);
  assert.equal(jck.lancamentos.length, 4);
  const ted = ank.lancamentos.find((l) => l.transaction_type === 'TRANSFER');
  const tedJck = jck.lancamentos.find((l) => l.transaction_type === 'TRANSFER');
  assert.equal(ted.operation_type, 'OUTGOING');
  assert.equal(tedJck.operation_type, 'INCOMING');
  assert.equal(ted.amount, tedJck.amount);
  assert.equal(ted.entry_date, tedJck.entry_date);
  for (const l of ank.lancamentos) for (const k of ['reference', 'created_at', 'entry_date', 'amount', 'title', 'description', 'operation_type', 'transaction_type']) assert.ok(l[k], `${k} obrigatório pelo YAML`);
  assert.equal(centavosDoTexto(ank.lancamentos[0].amount), 121950);
  assert.equal(reaisBr(121950), '1.219,50');
  // outro mês: mesmos lançamentos, referências diferentes (nada se repete na importação)
  const dez = await extrato(criarC6Simulado({ conta: 'ank' }), { de: '2026-12-01', ate: '2026-12-31' });
  assert.equal(dez.lancamentos.length, 8);
  assert.ok(dez.lancamentos.every((l) => l.reference.endsWith('-202612')));
  // período que cruza dois meses: 2 janelas, 16 lançamentos, nenhum repetido
  const dois = await extrato(criarC6Simulado({ conta: 'ank' }), { de: '2026-11-01', ate: '2026-12-31' });
  assert.equal(dois.lancamentos.length, 16);
  assert.equal(new Set(dois.lancamentos.map((l) => l.reference)).size, 16);
});

test('saldo simulado: formato BalanceResponse com conta_id', async () => {
  const s = await saldo(criarC6Simulado({ conta: 'ank' }));
  assert.equal(s.conta_id, 'ank');
  assert.equal(s.currency_code, 'BRL');
  assert.equal(typeof s.available, 'number');
  assert.ok(s.limit && typeof s.limit.total === 'number');
  assert.match(s.date, /^\d{4}-\d{2}-\d{2}$/);
});
