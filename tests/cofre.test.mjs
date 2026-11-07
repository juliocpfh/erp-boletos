// Cofre da nuvem (nuvem/cofre.mjs) com SQLite do Node no lugar do Durable Object: carga inicial, cópia completa,
// fila de mudanças de vários aparelhos, conflito de campo (nada vale até escolher), exclusão disputada, faixas de códigos,
// contador da NF, papéis (consulta/operador/admin), segredos barrados, lote repetido e backup do dia. Dados fictícios.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Cofre, CofreDO, backupDoDia, canon, MAX_FAIXA } from '../nuvem/cofre.mjs';
import { r2Falso } from './r2-falso.mjs';

/** Mesmo formato do ctx.storage.sql do Cloudflare: exec(consulta, ...valores).toArray(). */
function sqlFalso() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    exec(q, ...p) {
      if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; }
      const linhas = db.prepare(q).all(...p).map((l) => ({ ...l }));
      return { toArray: () => linhas };
    },
  };
}
function transacaoDe(sql) {
  return (fn) => {
    sql.db.exec('BEGIN');
    try { const r = fn(); sql.db.exec('COMMIT'); return r; } catch (e) { sql.db.exec('ROLLBACK'); throw e; }
  };
}
let hora = new Date('2026-11-06T10:00:00-03:00');
const novoCofre = () => { const sql = sqlFalso(); return new Cofre(sql, transacaoDe(sql), () => hora); };

const DONO = 'dono@exemplo.com.br'; const SOCIO = 'socio@exemplo.com.br'; const OPERADOR = 'operador@exemplo.com.br'; const CONSULTA = 'consulta@exemplo.com.br';
const bancoExemplo = () => ({
  formato: 'imoveis-v1', revisao: 7, atualizado_em: '2026-11-05T10:00:00.000Z', proxima_fatura: 157, seq: { contratos: 25, recebimentos: 0 },
  logo: 'data:image/png;base64,AAAA', config_banco: { ativo: false, senha_ponte: 'nunca-na-nuvem' }, listas: { tipos: ['Condomínio'] },
  usuarios: [
    { id: 1, login: DONO, papel: 'admin', ativo: true, senha_hash: 'h1' },
    { id: 2, login: 'socio', email: SOCIO, papel: 'admin', ativo: true },
    { id: 3, login: OPERADOR, papel: 'operador', ativo: true, senha_hash: 'h3' },
    { id: 4, login: CONSULTA, papel: 'consulta', ativo: true },
  ],
  contratos: [{ id: 20, imovel_id: 14, valor: 364445, vencimento_dia: 10 }, { id: 22, imovel_id: 7, valor: 250000, vencimento_dia: 5 }],
  recebimentos: [],
  historico: [{ quando: '2026-11-05T10:00:00.000Z', usuario: DONO, acao: 'Inclusão', tabela: 'contratos', registro_id: 20 }],
});
const carregado = () => { const c = novoCofre(); c.importar(bancoExemplo(), DONO); return c; };
let nLote = 0;
const lote = (ops, aparelho = 'pc') => ({ id: `${aparelho}-lote-${String(nLote += 1).padStart(4, '0')}`, ops });
const contrato = (c, id) => c.tudo().contratos.find((x) => x.id === id);

test('carga inicial e cópia completa voltam no formato do arquivo, sem segredos', () => {
  const c = carregado();
  const d = c.tudo();
  assert.equal(d.formato, 'imoveis-v1');
  assert.equal(d.revisao, 7);
  assert.equal(d.proxima_fatura, 157);
  assert.deepEqual(d.contratos, bancoExemplo().contratos);
  assert.deepEqual(d.recebimentos, [], 'tabela vazia continua existindo');
  assert.equal(d.seq.contratos, 25, 'mantém o maior código já usado');
  assert.equal(d.historico.length, 1);
  assert.equal(d.config_banco.senha_ponte, undefined, 'senha da ponte nunca fica na nuvem');
  assert.ok(d._nuvem.seq > 0);
  assert.throws(() => c.importar(bancoExemplo(), DONO), (e) => e.status === 409, 'não sobrescreve sem confirmar');
  assert.throws(() => c.importar(bancoExemplo(), OPERADOR, { substituir: true }), (e) => e.status === 403, 'só o admin substitui');
  assert.throws(() => novoCofre().importar({ formato: 'outro' }, DONO), (e) => e.status === 400);
});

test('mudanças de um aparelho chegam aos outros pela fila; lote repetido não aplica de novo', () => {
  const c = carregado();
  const inicio = c.tudo()._nuvem.seq;
  const l = lote([
    { op: 'alterar', tabela: 'contratos', id: 20, campos: { valor: { antes: 364445, depois: 370000 } } },
    { op: 'inserir', tabela: 'contratos', id: 26, dados: { id: 26, imovel_id: 9, valor: 180000 } },
    { op: 'excluir', tabela: 'contratos', id: 22, base: { id: 22, imovel_id: 7, valor: 250000, vencimento_dia: 5 } },
    { op: 'raiz', campo: 'listas', antes: { tipos: ['Condomínio'] }, depois: { tipos: ['Condomínio', 'Água'] } },
    { op: 'historico', entrada: { quando: hora.toISOString(), usuario: 'nome-que-o-aparelho-diz', acao: 'Alteração' } },
  ]);
  const r = c.aplicar(l, DONO);
  assert.equal(r.ok, true);
  assert.deepEqual(r.conflitos, []);
  assert.equal(c.aplicar(l, DONO).repetido, true, 'internet caiu antes da resposta: reenviar não duplica');
  const d = c.tudo();
  assert.equal(contrato(c, 20).valor, 370000);
  assert.ok(contrato(c, 26));
  assert.equal(contrato(c, 22), undefined);
  assert.deepEqual(d.listas.tipos, ['Condomínio', 'Água']);
  assert.equal(d.historico.at(-1).email_nuvem, DONO, 'histórico guarda quem gravou de verdade');
  assert.equal(d.revisao, 8);
  const m = c.mudancas(inicio);
  assert.deepEqual(m.mudancas.map((x) => x.tipo), ['registro', 'registro', 'exclusao', 'raiz', 'historico']);
  assert.equal(m.mudancas[0].dados.valor, 370000, 'leva o registro inteiro já atualizado');
  assert.equal(c.mudancas(m.seq).mudancas.length, 0);
});

test('mesmo campo mudado em dois aparelhos: volta ao valor anterior e nada vale até alguém escolher', () => {
  const c = carregado();
  // os dois viram R$ 3.644,45; o celular muda para 3.700,00 e a data; o PC muda para 3.650,00
  c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 20, campos: { valor: { antes: 364445, depois: 370000 }, vencimento_dia: { antes: 10, depois: 15 } } }], 'celular'), DONO);
  const r = c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 20, campos: { valor: { antes: 364445, depois: 365000 } } }], 'pc'), SOCIO);
  assert.equal(r.conflitos.length, 1);
  assert.equal(contrato(c, 20).valor, 364445, 'fica com o valor anterior');
  assert.equal(contrato(c, 20).vencimento_dia, 15, 'o campo sem disputa vale normalmente');
  const [cf] = c.conflitosAbertos();
  assert.deepEqual([cf.campo, cf.atual, cf.por_atual, cf.proposto, cf.por_proposto], ['valor', 370000, DONO, 365000, SOCIO]);
  // enquanto não escolhem, nova mudança no mesmo campo vira mais uma proposta e não vale
  c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 20, campos: { valor: { antes: 364445, depois: 380000 } } }], 'pc'), SOCIO);
  assert.equal(contrato(c, 20).valor, 364445);
  assert.equal(c.conflitosAbertos().length, 2);
  assert.throws(() => c.resolver({ conflito: cf.id, escolha: 'atual' }, CONSULTA), (e) => e.status === 403);
  c.resolver({ conflito: cf.id, escolha: 'atual' }, DONO);
  assert.equal(contrato(c, 20).valor, 370000, 'a escolha vale em todos os aparelhos');
  assert.equal(c.conflitosAbertos().length, 0, 'fecha todas as propostas do mesmo campo');
  assert.throws(() => c.resolver({ conflito: cf.id, escolha: 'atual' }, DONO), (e) => e.status === 404);
});

test('exclusão de registro que outro mudou e mudança em registro que outro excluiu esperam a escolha', () => {
  const c = carregado();
  const base22 = { id: 22, imovel_id: 7, valor: 250000, vencimento_dia: 5 };
  c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 22, campos: { valor: { antes: 250000, depois: 260000 } } }]), DONO);
  const r = c.aplicar(lote([{ op: 'excluir', tabela: 'contratos', id: 22, base: base22 }]), SOCIO);
  assert.equal(r.conflitos[0].tipo, 'exclusao');
  assert.ok(contrato(c, 22), 'não exclui');
  c.resolver({ conflito: r.conflitos[0].id, escolha: 'excluir' }, DONO);
  assert.equal(contrato(c, 22), undefined);
  // agora alguém que estava sem internet muda o 22 já excluído
  const r2 = c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 22, campos: { vencimento_dia: { antes: 5, depois: 8 } } }]), OPERADOR);
  assert.equal(r2.conflitos[0].tipo, 'excluido');
  c.resolver({ conflito: r2.conflitos[0].id, escolha: 'recriar' }, DONO);
  assert.deepEqual(contrato(c, 22), { id: 22, imovel_id: 7, valor: 260000, vencimento_dia: 8 }, 'volta com a mudança proposta');
});

test('faixas de códigos: dois aparelhos sem internet nunca repetem; código repetido é recusado', () => {
  const c = carregado();
  const a = c.faixa({ tabela: 'contratos', quantidade: 100 }, DONO);
  const b = c.faixa({ tabela: 'contratos', quantidade: 100 }, SOCIO);
  assert.deepEqual([a.inicio, a.fim, b.inicio, b.fim], [26, 125, 126, 225]);
  assert.equal(c.faixa({ tabela: 'contratos', quantidade: 99999 }, DONO).fim - 226 + 1, MAX_FAIXA);
  assert.equal(c.tudo().seq.contratos, 225 + MAX_FAIXA, 'quem ainda não usa faixa começa depois das reservadas');
  const nova = c.faixa({ tabela: 'tabela_nova' }, DONO);
  assert.equal(nova.inicio, 1);
  c.aplicar(lote([{ op: 'inserir', tabela: 'contratos', id: a.inicio, dados: { id: a.inicio, valor: 1 } }]), DONO);
  assert.throws(() => c.aplicar(lote([{ op: 'inserir', tabela: 'contratos', id: a.inicio, dados: { id: a.inicio, valor: 2 } }]), SOCIO), (e) => e.status === 409);
  assert.equal(contrato(c, a.inicio).valor, 1, 'lote com erro não aplica nada (tudo ou nada)');
});

test('número da NF: só pelo contador, um de cada vez, nunca repete', () => {
  const c = carregado();
  assert.deepEqual([c.contador({ nome: 'proxima_fatura' }, DONO).numero, c.contador({ nome: 'proxima_fatura' }, SOCIO).numero], [157, 158]);
  assert.equal(c.tudo().proxima_fatura, 159);
  // pelo lote: só se o número que o aparelho viu ainda for o atual; senão o lote inteiro volta
  c.aplicar(lote([{ op: 'raiz', campo: 'proxima_fatura', antes: 159, depois: 160 }]), DONO);
  assert.throws(() => c.aplicar(lote([{ op: 'historico', entrada: { nf: 159 } }, { op: 'raiz', campo: 'proxima_fatura', antes: 159, depois: 160 }]), SOCIO), (e) => e.status === 409 && e.extra.contador);
  assert.equal(c.tudo().proxima_fatura, 160);
  assert.equal(c.tudo().historico.filter((h) => h.nf).length, 0, 'nada do lote recusado ficou');
  assert.throws(() => c.contador({ nome: 'outro' }, DONO), (e) => e.status === 400);
  assert.throws(() => c.contador({ nome: 'proxima_fatura' }, CONSULTA), (e) => e.status === 403);
});

test('papéis: consulta só lê; operador não mexe em usuários (só a própria senha) nem na ordem das caixas; e-mail sem usuário não entra', () => {
  const c = carregado();
  assert.throws(() => c.aplicar(lote([{ op: 'historico', entrada: { a: 1 } }]), CONSULTA), (e) => e.status === 403);
  assert.equal(c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 4, campos: { sessoes: { antes: undefined, depois: ['t1'] } } }]), CONSULTA).ok, true, 'consulta registra a própria sessão');
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 1, campos: { sessoes: { antes: undefined, depois: ['t1'] } } }]), CONSULTA), (e) => e.status === 403, 'mas não a de outro');
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 3, campos: { papel: { antes: 'operador', depois: 'admin' } } }]), OPERADOR), (e) => e.status === 403, 'não se promove');
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 1, campos: { senha_hash: { antes: 'h1', depois: 'x' } } }]), OPERADOR), (e) => e.status === 403, 'não troca a senha de outro');
  assert.throws(() => c.aplicar(lote([{ op: 'inserir', tabela: 'usuarios', id: 9, dados: { id: 9, login: 'novo', papel: 'admin' } }]), OPERADOR), (e) => e.status === 403);
  assert.throws(() => c.aplicar(lote([{ op: 'raiz', campo: 'ordem_caixas', antes: undefined, depois: { painel: [] } }]), OPERADOR), (e) => e.status === 403);
  assert.equal(c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 3, campos: { senha_hash: { antes: 'h3', depois: 'nova' } } }]), OPERADOR).ok, true, 'troca a própria senha');
  assert.throws(() => c.tudo() && c.exigir('estranho@exemplo.com.br', 'consulta'), (e) => e.status === 403);
  // usuário desativado deixa de entrar
  c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 3, campos: { ativo: { antes: true, depois: false } } }]), DONO);
  assert.throws(() => c.exigir(OPERADOR, 'consulta'), (e) => e.status === 403);
});

test('entradas perigosas: segredos removidos, nomes que mexem no JavaScript barrados, tamanho limitado', () => {
  const c = carregado();
  c.aplicar(lote([{ op: 'alterar', tabela: 'contratos', id: 20, campos: { obs: { antes: undefined, depois: { texto: 'ok', ponte_url: 'http://x', senha_ponte: 's' } } } }]), DONO);
  assert.deepEqual(contrato(c, 20).obs, { texto: 'ok' });
  for (const op of [
    { op: 'alterar', tabela: 'contratos', id: 20, campos: { __proto__x: { antes: 1, depois: 2 }, ['__proto__']: { antes: 1, depois: 2 } } },
    { op: 'alterar', tabela: 'contratos', id: 20, campos: { constructor: { antes: 1, depois: 2 } } },
    { op: 'inserir', tabela: 'Contratos; DROP TABLE registros', id: 1, dados: { id: 1 } },
    { op: 'inserir', tabela: 'historico', id: 1, dados: { id: 1 } },
    { op: 'inserir', tabela: 'contratos', id: -1, dados: { id: -1 } },
    { op: 'inserir', tabela: 'contratos', id: 1.5, dados: { id: 1.5 } },
    { op: 'alterar', tabela: 'contratos', id: 20, campos: { id: { antes: 20, depois: 21 } } },
    { op: 'inserir', tabela: 'contratos', id: 900, dados: { id: 900, enorme: 'x'.repeat(1024 * 1024 + 10) } },
    { op: 'desconhecida' },
  ]) assert.throws(() => c.aplicar(lote([op]), DONO), (e) => [400, 413].includes(e.status), JSON.stringify(op).slice(0, 80));
  assert.ok(c.tudo().contratos.length === 2 && !('constructor' in contrato(c, 20) && contrato(c, 20).constructor !== Object));
  assert.throws(() => c.aplicar({ id: 'curto', ops: [] }, DONO), (e) => e.status === 400);
  assert.throws(() => c.aplicar({ id: 'lote-grande-0001', ops: Array(2001).fill({ op: 'historico', entrada: {} }) }, DONO), (e) => e.status === 400);
  assert.equal(canon({ b: 1, a: [1, { d: 2, c: 3 }] }), canon({ a: [1, { c: 3, d: 2 }], b: 1 }));
});

test('aparelho parado há muito tempo ou depois de nova carga baixa tudo de novo', () => {
  const c = carregado();
  const seq = c.tudo()._nuvem.seq;
  c.aplicar(lote([{ op: 'historico', entrada: { a: 1 } }]), DONO);
  assert.equal(c.mudancas(seq).refazer, undefined);
  assert.equal(c.mudancas(seq + 999).refazer, true, 'aparelho com fila de outro cofre');
  c.importar(bancoExemplo(), DONO, { substituir: true });
  assert.equal(c.mudancas(seq).refazer, true);
  hora = new Date('2027-03-01T10:00:00-03:00');
  c.aplicar(lote([{ op: 'historico', entrada: { a: 2 } }]), DONO);
  c.limpar();
  assert.equal(c.mudancas(seq).refazer, true, 'fila de mais de 60 dias foi limpa');
  hora = new Date('2026-11-06T10:00:00-03:00');
});

test('Durable Object: rotas, e-mail obrigatório, backup do dia no R2 e cópia antes de substituir', async () => {
  const sql = sqlFalso();
  const ctx = { storage: { sql, transactionSync: transacaoDe(sql) } };
  const env = { DADOS: r2Falso() };
  const dobj = new CofreDO(ctx, env);
  const chamar = (rota, corpo, email = DONO, metodo = corpo ? 'POST' : 'GET') => dobj.fetch(new Request(`https://cofre${rota}`, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined, headers: email ? { 'X-Email-Conferido': email } : {} }));
  assert.equal((await chamar('/tudo', null, '')).status, 401);
  assert.equal((await chamar('/tudo')).status, 404, 'vazio');
  assert.equal((await chamar('/importar', { dados: bancoExemplo() })).status, 200);
  assert.equal((await (await chamar('/papel?nivel=operador', null, OPERADOR)).json()).papel, 'operador');
  assert.equal((await chamar('/papel?nivel=operador', null, CONSULTA)).status, 403);
  assert.ok([...env.DADOS.m.keys()].some((k) => /^backups\/imoveis-dados-\d{4}-\d{2}-\d{2}\.json$/.test(k)), 'backup do dia');
  const r = await (await chamar('/lote', lote([{ op: 'historico', entrada: { a: 1 } }]))).json();
  assert.equal(r.ok, true);
  assert.equal((await chamar('/importar', { dados: bancoExemplo(), substituir: true })).status, 200);
  assert.ok([...env.DADOS.m.keys()].some((k) => k.endsWith('-antes-da-substituicao.json')), 'cópia antes de trocar tudo');
  assert.equal((await chamar('/qualquer', { a: 1 })).status, 404);
  const d = await (await chamar('/tudo', null, CONSULTA)).json();
  assert.equal(d.contratos.length, 2);
  assert.equal(await backupDoDia(dobj.cofre, env.DADOS, new Date()), false, 'um por dia (o cofre gravou o de hoje, pelo relógio de verdade)');
});
