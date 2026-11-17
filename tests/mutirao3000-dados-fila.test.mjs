// Mutirão 3000, 2ª rodada, frente dados, parte 3: fila e log entre o aparelho e a nuvem (itens 30, 33, 41 e 44 da lista dados.md)
// e desempenho da gravação e da abertura na nuvem (itens 11, 13, 14, 15 e 16 da lista desempenho.md). Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as N from '../docs/js/nuvem.js';
import * as R from '../docs/js/regras.js';

/** Aparelho com uma "nuvem" que responde o que o teste quiser a cada lote. */
function aparelho(responder) {
  const guardado = new Map([['base', { ...R.bancoVazio(), _nuvem: { seq: 1 } }], ['base-seq', 1]]);
  const enviados = [];
  const api = async (metodo, rota, corpo) => {
    if (rota === 'faixa') return { inicio: 1, fim: 1000 };
    if (rota.startsWith('mudancas')) return { mudancas: [], seq: 1, conflitos: [] };
    if (rota === 'lote') { enviados.push(corpo); return responder(corpo); }
    return {};
  };
  const guardar = { ler: async (k) => structuredClone(guardado.get(k)), gravar: async (k, v) => { guardado.set(k, structuredClone(v)); }, apagar: async (k) => { guardado.delete(k); } };
  const s = new N.Sincronia({ api, guardar, normalizar: R.normalizar, tabelas: ['imoveis'], agrupar: 1e9 });
  return { s, guardado, enviados };
}

test('item 30: gravação em partes leva o histórico junto com cada parte', () => {
  // cada lançamento com a sua linha do histórico: a linha vai na mesma parte do registro
  const ops = [];
  for (let i = 1; i <= 1100; i += 1) ops.push({ op: 'historico', entrada: { acao: 'Inclusão', tabela: 'despesas', registro_id: i, descricao: `Despesa ${i}` } });
  for (let i = 1; i <= 1100; i += 1) ops.push({ op: 'inserir', tabela: 'despesas', id: i, dados: { id: i, valor: 100 } });
  const partes = N.dividirLote({ id: 'ap-aba-000001', ops, em: '2026-11-17T10:00:00Z' });
  assert.ok(partes.length >= 2 && partes.every((p) => p.ops.length <= N.PARTE_MAXIMA));
  for (const p of partes) {
    const registros = new Set(p.ops.filter((o) => o.op === 'inserir').map((o) => o.id));
    const linhas = p.ops.filter((o) => o.op === 'historico').map((o) => o.entrada.registro_id);
    assert.deepEqual(new Set(linhas), registros, `${p.id}: as linhas dos registros desta parte, e só elas`);
  }
  assert.equal(partes.reduce((s, p) => s + p.ops.length, 0), 2200, 'nada a mais nem a menos');
  // importação (lançamentos sem linha própria e uma linha no fim): cada parte antes da última ganha uma linha curta
  const imp = [...ops.slice(1100), { op: 'historico', entrada: { acao: 'Inclusão', descricao: 'Importados 1100 lançamentos', usuario: 'ana', quando: '2026-11-17T10:00:00Z' } }];
  const p2 = N.dividirLote({ id: 'ap-aba-000002', ops: imp, em: '2026-11-17T10:00:00Z' });
  assert.equal(p2.length, 2);
  assert.deepEqual(p2[0].ops.at(-1).entrada, { quando: '2026-11-17T10:00:00Z', usuario: 'ana', acao: 'Gravação em partes', descricao: 'Importados 1100 lançamentos (parte 1 de 2: 1000 mudança(s))' });
  assert.equal(p2[1].ops.at(-1).entrada.descricao, 'Importados 1100 lançamentos');
  assert.deepEqual(N.dividirLote({ id: 'ap-aba-000003', ops: imp }).map((p) => p.ops.length), p2.map((p) => p.ops.length), 'o corte é sempre o mesmo (reenvio seguro)');
});

test('item 41: sem internet, cada clique grava só o lote novo (não a fila inteira); a fila do formato antigo é aproveitada', async () => {
  const offline = () => { throw new N.ErroNuvem('Sem internet.', 0); };
  const { s, guardado } = aparelho(offline);
  // fila deixada pela versão anterior (formato antigo, tudo numa chave só)
  guardado.set('pendentes', [{ id: 'apvelho-aba-000001', em: '2026-11-16T10:00:00Z', ops: [{ op: 'inserir', tabela: 'imoveis', id: 900, dados: { id: 900, nome: 'Da versão anterior' } }] }]);
  const gravar = s.guardar.gravar; let bytes = 0;
  s.guardar.gravar = async (k, v) => { bytes += JSON.stringify(v ?? null).length; return gravar(k, v); };
  await s.iniciar();
  assert.equal(s.pendentes.length, 1, 'a fila antiga continua valendo');
  // uma importação grande sem internet…
  await s.alterar((d) => { for (let i = 0; i < 500; i += 1) R.inserir(d, 'imoveis', { nome: `Importado ${i}` }, 'ana'); });
  assert.ok(!guardado.has('pendentes'), 'a fila antiga passou para o formato novo');
  // …e depois três cliques pequenos: cada um grava pouco (antes, a fila inteira a cada clique)
  const medidas = [];
  for (const nome of ['A', 'B', 'C']) { bytes = 0; await s.alterar((d) => R.atualizar(d, 'imoveis', 900, { nome }, 'ana')); medidas.push(bytes); }
  assert.ok(medidas.every((b) => b < 5000), `bytes por clique: ${medidas}`);
  assert.deepEqual(guardado.get('fila').map((m) => m.mudancas), [1, 1000, 2, 2, 2]);
  // outra aba (ou a página reaberta) lê a mesma fila
  const outra = new N.Sincronia({ api: offline, guardar: s.guardar, normalizar: R.normalizar, tabelas: ['imoveis'], agrupar: 1e9 });
  await outra.iniciar();
  assert.deepEqual(outra.pendentes.map((l) => l.ops.length), s.pendentes.map((l) => l.ops.length));
  assert.equal(outra.atual().imoveis.find((i) => i.id === 900).nome, 'C');
  for (const x of [s, outra]) if (x.envioMarcado) clearTimeout(x.envioMarcado);
});

test('item 44: a mudança recusada porque o registro veio de uma gravação também recusada aparece ligada a ela', async () => {
  let criado = null;
  const { s } = aparelho((parte) => {
    const ins = parte.ops.find((o) => o.op === 'inserir');
    if (ins) { criado = ins; throw new N.ErroNuvem(`Código ${ins.id} já usado em imoveis.`, 409); }
    const alt = parte.ops.find((o) => o.op === 'alterar');
    if (alt) throw new N.ErroNuvem(`Registro ${alt.tabela} ${alt.id} não existe.`, 404);
    return { ok: true };
  });
  await s.iniciar();
  const i = await s.alterar((d) => R.inserir(d, 'imoveis', { nome: 'Apto' }, 'ana'));
  await s.alterar((d) => R.atualizar(d, 'imoveis', i.id, { nome: 'Apto 101' }, 'ana'));
  await s.sincronizar();
  assert.equal(criado.id, i.id);
  assert.equal(s.recusas.length, 2);
  const [primeira, segunda] = s.recusas;
  assert.equal(primeira.causa, undefined);
  assert.equal(segunda.causa, primeira.id, 'a 2ª foi recusada por causa da 1ª');
  if (s.envioMarcado) clearTimeout(s.envioMarcado);
});
