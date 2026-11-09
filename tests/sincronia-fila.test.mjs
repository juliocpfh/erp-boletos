// Fila de gravação da nuvem (docs/js/nuvem.js) contra o cofre de verdade (nuvem/cofre.mjs, SQLite do Node): duas abas do
// mesmo navegador, tabelas ainda vazias, lote grande, mudanças recusadas guardadas, internet ruim e o peso de cada gravação.
// Revisão de 09/11/2026 (itens 1 a 8). Dados fictícios.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as N from '../docs/js/nuvem.js';
import * as R from '../docs/js/regras.js';
import * as K from '../nuvem/cofre.mjs';
import { r2Falso } from './r2-falso.mjs';

function novoCofreDO() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  return new K.CofreDO({ storage: { sql, transactionSync: tx } }, { DADOS: r2Falso() });
}

/** API indo direto ao cofre com o e-mail; `estado.internet` liga e desliga; `estado.antes(metodo, rota, corpo)` pode falhar ou segurar. */
function apiPara(cofre, email, estado = { internet: true }) {
  return async (metodo, rota, corpo) => {
    if (!estado.internet) throw new N.ErroNuvem('Sem internet.', 0);
    if (estado.antes) await estado.antes(metodo, rota, corpo);
    const r = await cofre.fetch(new Request(`https://cofre/${rota}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: { 'X-Email-Conferido': email } }));
    const dados = await r.json();
    if (!r.ok) throw new N.ErroNuvem(dados.erro, r.status, dados);
    return dados;
  };
}
/** Cópia local em memória (o IndexedDB das abas de um navegador). */
const guardarMemoria = (m = new Map()) => ({ m, ler: async (k) => structuredClone(m.get(k)), gravar: async (k, v) => { m.set(k, structuredClone(v)); }, apagar: async (k) => { m.delete(k); } });
/** Trava entre abas (imita navigator.locks: uma de cada vez, sem reentrar). */
function travaComum() {
  let fila = Promise.resolve();
  return (fn) => { const r = fila.then(() => fn()); fila = r.catch(() => {}); return r; };
}
const TABELAS = Object.entries(R.bancoVazio()).filter(([k, v]) => Array.isArray(v) && k !== 'historico').map(([k]) => k);

const DONO = 'dono@exemplo.com.br'; const SOCIA = 'socia@exemplo.com.br'; const OPER = 'oper@exemplo.com.br'; const LEITOR = 'leitor@exemplo.com.br';
function bancoInicial() {
  const d = R.bancoVazio();
  R.inserir(d, 'usuarios', { login: DONO, nome: 'Dono', papel: 'admin', ativo: true }, 'teste');
  R.inserir(d, 'usuarios', { login: 'socia', email: SOCIA, nome: 'Sócia', papel: 'admin', ativo: true }, 'teste');
  R.inserir(d, 'usuarios', { login: OPER, nome: 'Operador', papel: 'operador', ativo: true }, 'teste');
  R.inserir(d, 'usuarios', { login: 'leitor', email: LEITOR, nome: 'Leitor', papel: 'consulta', ativo: true }, 'teste');
  R.inserir(d, 'imoveis', { nome: 'Apto 604', cep: '80010-000' }, 'teste');
  d.proxima_fatura = 157;
  return d;
}
/** Uma Sincronia (aba ou aparelho). */
const sincronia = (api, guardar, extra = {}) => new N.Sincronia({ api, guardar, normalizar: R.normalizar, agrupar: 1, tabelas: TABELAS, ...extra });
async function nuvemCom(banco = bancoInicial()) {
  const cofre = novoCofreDO();
  const s = sincronia(apiPara(cofre, DONO), guardarMemoria());
  await s.iniciar(); await s.importar(banco); await s.sincronizar();
  return cofre;
}
const nomes = (lista) => lista.map((i) => `${i.id}:${i.nome}`).join(', ');

test('item 1: duas abas do mesmo navegador cadastrando: códigos diferentes, os dois registros chegam à nuvem', async () => {
  const cofre = await nuvemCom();
  const api = apiPara(cofre, DONO); const guardar = guardarMemoria(); const trava = travaComum();
  const abaA = sincronia(api, guardar, { trava });
  await abaA.iniciar(); await abaA.sincronizar();
  const abaB = sincronia(api, guardar, { trava }); // a 2ª aba abre depois (Ctrl+clique)
  await abaB.iniciar(); await abaB.sincronizar();
  // 10h: aba A cadastra a "Sala A"; 10h05: aba B (que já viu a Sala A) cadastra a "Loja B"
  const a = await abaA.alterar((d) => R.inserir(d, 'imoveis', { nome: 'Sala A', cep: '80000-001' }, DONO));
  await abaA.sincronizar();
  await abaB.sincronizar();
  const b = await abaB.alterar((d) => R.inserir(d, 'imoveis', { nome: 'Loja B', cep: '80000-002' }, DONO));
  assert.notEqual(a.id, b.id, 'cada aba pega o próximo código da faixa que as duas dividem');
  await abaB.sincronizar(); await abaA.sincronizar();
  assert.equal(nomes(cofre.cofre.tudo().imoveis), `1:Apto 604, ${a.id}:Sala A, ${b.id}:Loja B`);
  assert.equal(nomes(abaA.atual().imoveis), `1:Apto 604, ${a.id}:Sala A, ${b.id}:Loja B`);
  assert.equal(abaB.recusas.length + cofre.cofre.tudo()._nuvem.conflitos.length, 0);
});

test('item 1: duas abas sem internet, uma depois da outra, sem sincronizar: a fila e a faixa da outra aba valem', async () => {
  const cofre = await nuvemCom();
  const estado = { internet: true };
  const api = apiPara(cofre, DONO, estado); const guardar = guardarMemoria(); const trava = travaComum();
  const abaA = sincronia(api, guardar, { trava }); await abaA.iniciar(); await abaA.sincronizar();
  const abaB = sincronia(api, guardar, { trava }); await abaB.iniciar(); await abaB.sincronizar();
  estado.internet = false;
  const a = await abaA.alterar((d) => R.inserir(d, 'imoveis', { nome: 'Sala A' }, DONO));
  const b = await abaB.alterar((d) => R.inserir(d, 'imoveis', { nome: 'Loja B' }, DONO));
  assert.notEqual(a.id, b.id);
  assert.deepEqual(abaB.atual().imoveis.map((i) => i.nome), ['Apto 604', 'Sala A', 'Loja B'], 'a aba B vê o que a A gravou sem internet');
  estado.internet = true;
  await abaA.sincronizar(); await abaB.sincronizar();
  assert.deepEqual(cofre.cofre.tudo().imoveis.map((i) => i.nome), ['Apto 604', 'Sala A', 'Loja B']);
  assert.equal(abaA.recusas.length + abaB.recusas.length, 0);
});

test('item 1: gravação que deixaria dois registros com o mesmo código numa tabela é recusada antes de ir para a fila', async () => {
  const cofre = await nuvemCom();
  const s = sincronia(apiPara(cofre, DONO), guardarMemoria());
  await s.iniciar();
  await assert.rejects(s.alterar((d) => { d.imoveis.push({ ...d.imoveis[0], nome: 'Cópia' }); }), (e) => e.esperado && /mesmo código/.test(e.message));
  assert.equal(s.pendentes.length, 0, 'nada entrou na fila');
  assert.equal(s.atual().imoveis.length, 1, 'a tela continua como estava');
  assert.throws(() => N.diferencas({ imoveis: [{ id: 1 }] }, { imoveis: [{ id: 1 }, { id: 1, nome: 'x' }] }), /mesmo código/);
});

test('item 2: mudança "raiz" com nome de tabela vinda da nuvem é ignorada (não troca a tabela inteira)', async () => {
  const d = { usuarios: [{ id: 1, login: 'dono', ativo: true }], emitentes: [], listas: { tipos: ['Água'] } };
  N.aplicarMudanca(d, { tipo: 'raiz', dados: { campo: 'usuarios', valor: [{ id: 1, login: 'dono', ativo: false }] } });
  N.aplicarMudanca(d, { tipo: 'raiz', dados: { campo: 'emitentes', valor: [{ id: 1, nome: 'Empresa trocada' }] } });
  N.aplicarMudanca(d, { tipo: 'raiz', dados: { campo: 'fichas', valor: [{ id: 1, nome: 'Ficha (teste)' }] } }, new Set(['fichas']));
  N.aplicarMudanca(d, { tipo: 'raiz', dados: { campo: 'historico', valor: [] } });
  assert.deepEqual(d.usuarios, [{ id: 1, login: 'dono', ativo: true }]);
  assert.deepEqual(d.emitentes, []);
  assert.equal(d.fichas, undefined);
  assert.equal(d.historico, undefined, 'campos do servidor também não');
  N.aplicarMudanca(d, { tipo: 'raiz', dados: { campo: 'listas', valor: { tipos: ['Luz'] } } });
  assert.deepEqual(d.listas, { tipos: ['Luz'] }, 'campo de verdade da raiz continua valendo');
  // pelo caminho de verdade: a mudança chega no puxar e a cópia do aparelho não é trocada
  const cofre = await nuvemCom();
  const real = apiPara(cofre, DONO);
  let falsa = null;
  const api = async (m, rota, corpo) => {
    const r = await real(m, rota, corpo);
    if (falsa && rota.startsWith('mudancas')) { r.mudancas.push({ seq: r.seq, tipo: 'raiz', dados: falsa }); falsa = null; }
    return r;
  };
  const s = sincronia(api, guardarMemoria());
  await s.iniciar(); await s.sincronizar();
  falsa = { campo: 'usuarios', valor: [{ id: 3, login: OPER, ativo: true, papel: 'admin' }] };
  await s.sincronizar();
  assert.equal(s.atual().usuarios.length, 4, 'a lista de usuários continua a da nuvem');
  assert.equal(s.base.usuarios.length, 4);
});

test('item 3: tabela sem nenhum registro ainda (ex.: fichas) também ganha faixa: dois aparelhos sem internet não repetem código', async () => {
  const cofre = novoCofreDO();
  const estA = { internet: true }; const estB = { internet: true };
  const a = sincronia(apiPara(cofre, DONO, estA), guardarMemoria());
  const b = sincronia(apiPara(cofre, SOCIA, estB), guardarMemoria());
  await a.iniciar();
  const velho = bancoInicial(); delete velho.fichas; delete velho.seq.fichas; // levado à nuvem antes de existir a tabela
  await a.importar(velho);
  await b.iniciar(); await b.sincronizar(); await a.sincronizar();
  assert.ok(a.faixas.fichas && b.faixas.fichas, 'as duas cópias reservaram códigos de fichas');
  estA.internet = false; estB.internet = false;
  const fa = await a.alterar((d) => R.inserir(d, 'fichas', { nome: 'Fulano (teste)', imovel_id: 1 }, DONO));
  const fb = await b.alterar((d) => R.inserir(d, 'fichas', { nome: 'Beltrana (teste)', imovel_id: 1 }, SOCIA));
  assert.notEqual(fa.id, fb.id);
  estA.internet = true; estB.internet = true;
  await a.sincronizar(); await b.sincronizar(); await a.sincronizar();
  assert.deepEqual(cofre.cofre.tudo().fichas.map((f) => f.nome).sort(), ['Beltrana (teste)', 'Fulano (teste)']);
  assert.equal(a.recusas.length + b.recusas.length, 0);
});

test('item 3: usuário de consulta não pede faixa a cada conferência (a nuvem recusa uma vez, e chega)', async () => {
  const cofre = await nuvemCom();
  const idas = [];
  const real = apiPara(cofre, LEITOR);
  const l = sincronia(async (m, rota, c) => { idas.push(rota); return real(m, rota, c); }, guardarMemoria());
  await l.iniciar(); await l.sincronizar(); await l.sincronizar(); await l.sincronizar();
  assert.equal(idas.filter((r) => r === 'faixa').length, 1);
});

test('item 4: lote grande (extrato de 1.100 lançamentos) vai em partes abaixo do limite da nuvem e chega inteiro', async () => {
  const cofre = await nuvemCom();
  const lotes = [];
  const real = apiPara(cofre, DONO);
  const s = sincronia(async (m, rota, c) => { if (rota === 'lote') lotes.push(c); return real(m, rota, c); }, guardarMemoria());
  await s.iniciar(); await s.sincronizar();
  await s.alterar((d) => { for (let i = 0; i < 1100; i += 1) R.inserir(d, 'movimentacoes_banco', { id_externo: `fitid-${i}`, data: '2026-10-15', valor_centavos: 135000 + i, tipo: 'entrada', descricao: `PIX recebido ${i}` }, DONO); });
  assert.equal(s.pendentes.at(-1).ops.length, 2200, 'um lote na fila (uma gravação)');
  await s.sincronizar();
  assert.ok(lotes.length >= 3 && lotes.every((l) => l.ops.length <= 1000 && l.ops.length < K.MAX_OPS), `partes: ${lotes.map((l) => l.ops.length)}`);
  assert.equal(new Set(lotes.map((l) => l.id)).size, lotes.length, 'cada parte com o seu código');
  assert.equal(cofre.cofre.tudo().movimentacoes_banco.length, 1100);
  assert.deepEqual([s.recusas.length, s.pendentes.length], [0, 0]);
  assert.equal(cofre.cofre.tudo().historico.filter((h) => h.tabela === 'movimentacoes_banco').length, 1100, 'histórico inteiro, sem repetir');
  // reenviar as mesmas partes (internet caiu antes da resposta) não aplica de novo
  for (const l of lotes) await real('POST', 'lote', l);
  assert.equal(cofre.cofre.tudo().movimentacoes_banco.length, 1100);
});

test('item 4: as partes são sempre as mesmas (reenvio seguro); o número da NF vai na 1ª; parte recusada não leva as outras', async () => {
  const ops = [...Array.from({ length: 1500 }, (_, i) => ({ op: 'historico', entrada: { n: i } })), { op: 'raiz', campo: 'proxima_fatura', antes: 1, depois: 2 }];
  const lote = { id: 'apteste-aba-000001', ops, em: '2026-11-09T10:00:00.000Z' };
  const p1 = N.dividirLote(lote); const p2 = N.dividirLote(structuredClone(lote));
  assert.deepEqual(p1.map((p) => [p.id, p.ops.length]), p2.map((p) => [p.id, p.ops.length]));
  assert.deepEqual(p1[0].ops[0], { op: 'raiz', campo: 'proxima_fatura', antes: 1, depois: 2 });
  assert.equal(p1.reduce((s, p) => s + p.ops.length, 0), 1501);
  assert.deepEqual(N.dividirLote({ id: 'apteste-aba-000002', ops: ops.slice(0, 10) }).map((p) => p.id), ['apteste-aba-000002'], 'lote pequeno vai como sempre');
  // a 2ª parte é recusada: a 1ª e a 3ª valem e a recusada fica guardada
  const cofre = await nuvemCom();
  const real = apiPara(cofre, DONO);
  const s = sincronia(async (m, rota, c) => { if (rota === 'lote' && c.id.endsWith('-p2')) throw new N.ErroNuvem('Recusado no teste.', 403); return real(m, rota, c); }, guardarMemoria());
  await s.iniciar(); await s.sincronizar();
  await s.alterar((d) => { for (let i = 0; i < 1100; i += 1) R.inserir(d, 'movimentacoes_banco', { id_externo: `x-${i}`, valor_centavos: 100 + i }, DONO); });
  await s.sincronizar();
  assert.equal(s.recusas.length, 1);
  assert.match(s.recusas[0].id, /-p2$/);
  assert.equal(s.pendentes.length, 0);
  assert.equal(s.atual().movimentacoes_banco.length, cofre.cofre.tudo().movimentacoes_banco.length, 'a tela mostra o que vale na nuvem');
});

test('item 5: mudança recusada fica guardada no aparelho com o que era e o motivo; dá para ler e esquecer', async () => {
  const cofre = await nuvemCom();
  const guardar = guardarMemoria();
  const l = sincronia(apiPara(cofre, LEITOR), guardar);
  await l.iniciar(); await l.sincronizar();
  await l.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Leitor tentou' }, LEITOR));
  await l.sincronizar();
  assert.equal(l.recusas.length, 1);
  const [r] = l.recusas;
  assert.match(r.erro, /não pode/);
  assert.ok(r.id && r.em && r.mudancas === 2);
  const ops = await l.lerRecusa(r.id);
  assert.deepEqual(ops.find((o) => o.op === 'alterar'), { op: 'alterar', tabela: 'imoveis', id: 1, campos: { nome: { antes: 'Apto 604', depois: 'Leitor tentou' } } });
  // recarregou a página: continua lá
  const l2 = sincronia(apiPara(cofre, LEITOR), guardar); await l2.iniciar();
  assert.deepEqual(l2.recusas.map((x) => x.id), [r.id]);
  await l2.esquecerRecusa(r.id);
  assert.deepEqual([l2.recusas.length, guardar.m.has(`recusa:${r.id}`), (await guardar.ler('recusas')).length], [0, false, 0]);
  // aviso antigo (antes desta versão: só a quantidade) continua aparecendo e some no "limpar"
  await guardar.gravar('recusas', [{ lote: 'ap1-ab-000009', em: '2026-11-01T10:00:00.000Z', erro: 'Antigo', mudancas: 3 }]);
  const l3 = sincronia(apiPara(cofre, LEITOR), guardar); await l3.iniciar();
  assert.equal(await l3.lerRecusa('ap1-ab-000009'), null);
  await l3.esquecerRecusas();
  assert.equal(l3.recusas.length, 0);
});

test('item 5: duas abas recusando o mesmo lote guardam um aviso só', async () => {
  const cofre = await nuvemCom();
  const api = apiPara(cofre, LEITOR); const guardar = guardarMemoria(); const trava = travaComum();
  const a = sincronia(api, guardar, { trava }); await a.iniciar(); await a.sincronizar();
  const b = sincronia(api, guardar, { trava }); await b.iniciar(); await b.sincronizar();
  await a.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Leitor tentou' }, LEITOR));
  await Promise.all([a.sincronizar(), b.sincronizar()]);
  assert.equal((await guardar.ler('recusas')).length, 1);
});

test('item 6: internet ruim (pedido pendurado): a gravação seguinte entra na fila do aparelho na hora, sem esperar a nuvem', async () => {
  const cofre = await nuvemCom();
  const estado = { internet: true };
  const guardar = guardarMemoria();
  const s = sincronia(apiPara(cofre, DONO, estado), guardar, { trava: travaComum() });
  await s.iniciar(); await s.sincronizar();
  let soltar; const pendurado = new Promise((ok) => { soltar = ok; });
  estado.antes = async (m) => { if (m === 'POST') { await pendurado; throw new N.ErroNuvem('A nuvem demorou demais para responder.', 0); } };
  await s.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: '1ª gravação' }, DONO));
  const passada = s.sincronizar(); // fica esperando a nuvem
  await new Promise((ok) => { setImmediate(ok); });
  let gravou = false;
  const segunda = s.alterar((d) => R.inserir(d, 'imoveis', { nome: '2ª gravação' }, DONO)).then(() => { gravou = true; });
  for (let i = 0; i < 20 && !gravou; i += 1) await new Promise((ok) => { setImmediate(ok); });
  assert.equal(gravou, true, 'a 2ª gravação terminou com o pedido ainda pendurado');
  assert.equal((await guardar.ler('pendentes')).length, 2, 'e já está guardada no aparelho');
  soltar(); await passada; await segunda;
  estado.antes = null;
  await s.sincronizar();
  assert.equal(s.pendentes.length, 0);
  assert.deepEqual(cofre.cofre.tudo().imoveis.map((i) => i.nome), ['1ª gravação', '2ª gravação']);
});

test('item 6: duas abas enviando ao mesmo tempo (fora da trava): nada aplica duas vezes e nada se perde', async () => {
  const cofre = await nuvemCom();
  const estado = { internet: true };
  const api = apiPara(cofre, DONO, estado); const guardar = guardarMemoria(); const trava = travaComum();
  const a = sincronia(api, guardar, { trava }); await a.iniciar(); await a.sincronizar();
  const b = sincronia(api, guardar, { trava }); await b.iniciar(); await b.sincronizar();
  estado.internet = false;
  for (const nome of ['Um', 'Dois', 'Três']) await a.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome }, DONO));
  await b.alterar((d) => R.inserir(d, 'imoveis', { nome: 'Sala da aba B' }, DONO));
  estado.internet = true;
  await Promise.all([a.sincronizar(), b.sincronizar()]);
  await a.sincronizar(); await b.sincronizar();
  const tudo = cofre.cofre.tudo();
  assert.deepEqual(tudo.imoveis.map((i) => i.nome), ['Três', 'Sala da aba B']);
  assert.equal(tudo.historico.filter((h) => h.detalhes?.nome?.para === 'Dois').length, 1, 'lote reenviado pela outra aba não repete');
  for (const s of [a, b]) { assert.equal(s.pendentes.length, 0); assert.deepEqual(s.atual().imoveis.map((i) => i.nome), ['Três', 'Sala da aba B']); }
  assert.equal((await guardar.ler('pendentes')).length, 0);
});

test('item 6: a base desta aba trocada no meio do puxar pela mais nova que outra aba gravou: nada se aplica duas vezes', async () => {
  const cofre = await nuvemCom();
  const outro = sincronia(apiPara(cofre, SOCIA), guardarMemoria()); await outro.iniciar();
  const real = apiPara(cofre, DONO);
  let trocar = null;
  const s = sincronia(async (m, rota, c) => { const r = await real(m, rota, c); if (trocar && rota.startsWith('mudancas')) { trocar(); trocar = null; } return r; }, guardarMemoria());
  await s.iniciar(); await s.sincronizar();
  await outro.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Da sócia' }, SOCIA)); await outro.sincronizar();
  const nova = cofre.cofre.tudo(); // a base que a outra aba puxou e gravou (releBase a traz para esta)
  trocar = () => { s.base = nova; s.invalidar(); };
  await s.sincronizar();
  assert.equal(s.atual().historico.filter((h) => h.detalhes?.nome?.para === 'Da sócia').length, 1);
  assert.equal(s.atual().imoveis[0].nome, 'Da sócia');
});

test('item 7: a gravação não copia as entradas do histórico, e a tela usa o "depois" sem remontar o banco', async () => {
  const d = R.normalizar(bancoInicial());
  const c = N.copiar(d);
  assert.notEqual(c.historico, d.historico);
  assert.equal(c.historico[0], d.historico[0], 'entradas do histórico são as mesmas (só crescem)');
  assert.notEqual(c.imoveis[0], d.imoveis[0], 'registros são copiados');
  assert.deepEqual(Object.keys(c), Object.keys(d), 'mesma ordem dos campos (o arquivo da pasta não muda de forma)');
  const cofre = await nuvemCom();
  const estado = { internet: true };
  const s = sincronia(apiPara(cofre, DONO, estado), guardarMemoria());
  await s.iniciar(); await s.sincronizar();
  estado.internet = false;
  s.atual();
  let montagens = 0; const montar = s.montar.bind(s);
  s.montar = () => { montagens += 1; return montar(); };
  const sala = await s.alterar((x) => R.inserir(x, 'imoveis', { nome: 'Sala 2' }, DONO));
  await s.alterar((x) => R.atualizar(x, 'imoveis', 1, { nome: 'Apto 604 B' }, DONO));
  await s.alterar((x) => R.desfazerAlteracoes(x, [`${x.historico.length - 1}:nome`], DONO));
  await s.alterar((x) => R.excluir(x, 'imoveis', sala.id, DONO));
  const vista = s.atual();
  assert.equal(montagens, 0, 'nenhuma remontagem do banco inteiro');
  // a vista aproveitada é igual à que seria remontada (base + fila + normalizar)
  const refeita = s.normalizar(montar());
  for (const k of new Set([...Object.keys(vista), ...Object.keys(refeita)])) assert.equal(N.canon(vista[k]), N.canon(refeita[k]), k);
  assert.equal(vista.historico.at(-2).desfaz, vista.historico.length - 3, 'desfazer marca a entrada que ele mesmo criou');
  assert.deepEqual(vista.imoveis.map((i) => i.nome), ['Apto 604']);
});

test('item 7: chegou mudança de outro aparelho no meio da gravação: a tela remonta (não perde o que chegou)', async () => {
  const cofre = await nuvemCom();
  const outro = sincronia(apiPara(cofre, SOCIA), guardarMemoria()); await outro.iniciar();
  const guardar = guardarMemoria();
  const s = sincronia(apiPara(cofre, DONO), guardar);
  await s.iniciar(); await s.sincronizar();
  await outro.alterar((d) => R.inserir(d, 'imoveis', { nome: 'Da sócia' }, SOCIA)); await outro.sincronizar();
  const gravar = guardar.gravar;
  guardar.gravar = async (k, v) => { if (k === 'pendentes') { guardar.gravar = gravar; await s.puxar(); } return gravar(k, v); };
  await s.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Do dono' }, DONO));
  assert.deepEqual(s.atual().imoveis.map((i) => i.nome), ['Do dono', 'Da sócia']);
});

test('item 8: conferência de 30 em 30 s sem novidade não remonta nem normaliza o banco', async () => {
  const cofre = await nuvemCom();
  let normalizacoes = 0;
  const s = new N.Sincronia({ api: apiPara(cofre, DONO), guardar: guardarMemoria(), normalizar: (d) => { normalizacoes += 1; return R.normalizar(d); }, agrupar: 1, tabelas: TABELAS });
  s.aoMudar = () => s.atual(); // como aoMudarNuvem (app.js)
  await s.iniciar(); await s.sincronizar(); s.atual();
  normalizacoes = 0;
  for (let i = 0; i < 10; i += 1) await s.sincronizar();
  assert.equal(normalizacoes, 0);
});
