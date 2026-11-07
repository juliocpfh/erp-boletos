// Sincronia do sistema com a nuvem (docs/js/nuvem.js) contra o cofre de verdade (nuvem/cofre.mjs, SQLite do Node):
// dois aparelhos usando as regras do sistema (regras.js), com e sem internet. Dados fictícios.
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

/** Um aparelho: cópia local em memória e a API indo direto ao cofre, com a internet que o teste liga e desliga. */
function aparelho(cofre, email, normalizar) {
  const guardado = new Map();
  const ap = { email, internet: true, falharPuxar: false, guardado };
  ap.api = async (metodo, rota, corpo) => {
    if (!ap.internet || (ap.falharPuxar && rota.startsWith('mudancas'))) throw new N.ErroNuvem('Sem internet.', 0);
    const r = await cofre.fetch(new Request(`https://cofre/${rota}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: { 'X-Email-Conferido': email } }));
    const dados = await r.json();
    if (!r.ok) throw new N.ErroNuvem(dados.erro, r.status, dados);
    return dados;
  };
  ap.guardar = { ler: async (k) => structuredClone(guardado.get(k)), gravar: async (k, v) => { guardado.set(k, structuredClone(v)); } };
  ap.sinc = new N.Sincronia({ api: ap.api, guardar: ap.guardar, normalizar });
  return ap;
}

const DONO = 'dono@exemplo.com.br'; const SOCIA = 'socia@exemplo.com.br'; const LEITOR = 'leitor@exemplo.com.br';
function bancoInicial() {
  const d = R.bancoVazio();
  R.inserir(d, 'usuarios', { login: DONO, nome: 'Dono', papel: 'admin', ativo: true }, 'teste');
  R.inserir(d, 'usuarios', { login: 'socia', email: SOCIA, nome: 'Sócia', papel: 'admin', ativo: true }, 'teste');
  R.inserir(d, 'usuarios', { login: 'leitor', email: LEITOR, nome: 'Leitor', papel: 'consulta', ativo: true }, 'teste');
  R.inserir(d, 'imoveis', { nome: 'Apto 604', cep: '80010-000' }, 'teste');
  d.proxima_fatura = 157;
  return d;
}
async function cenario() {
  const cofre = novoCofreDO();
  const a = aparelho(cofre, DONO); const b = aparelho(cofre, SOCIA);
  assert.equal(await a.sinc.iniciar(), null, 'nuvem vazia');
  await a.sinc.importar(bancoInicial());
  await b.sinc.iniciar();
  return { cofre, a, b };
}
const imovel = (s, id = 1) => s.atual().imoveis.find((x) => x.id === id);

test('a lista de campos do servidor é a mesma no sistema e no cofre', () => {
  assert.deepEqual(N.RAIZ_DO_SERVIDOR, K.RAIZ_DO_SERVIDOR);
  assert.deepEqual(N.CONTADORES, K.CONTADORES);
  assert.equal(N.MAX_SESSOES, K.MAX_SESSOES);
  const x = { b: [1, { d: 1, c: 2 }], a: 'x' };
  assert.equal(N.canon(x), K.canon(x));
});

test('diferenças: inserir, alterar campo a campo, apagar campo, excluir, raiz e histórico; aplicar refaz o mesmo banco', () => {
  const antes = bancoInicial();
  const depois = structuredClone(antes);
  R.inserir(depois, 'imoveis', { nome: 'Sala 2' }, 'teste');
  R.atualizar(depois, 'imoveis', 1, { nome: 'Apto 604 B' }, 'teste');
  delete depois.imoveis[0].cep;
  depois.usuarios = depois.usuarios.filter((u) => u.id !== 3);
  depois.listas = { tipos: ['Água'] };
  depois.revisao = 99; // do servidor: não vai
  const ops = N.diferencas(antes, depois);
  assert.deepEqual(ops.map((o) => o.op).sort(), ['alterar', 'excluir', 'historico', 'historico', 'inserir', 'raiz']);
  const alt = ops.find((o) => o.op === 'alterar');
  assert.deepEqual(alt.campos.nome, { antes: 'Apto 604', depois: 'Apto 604 B' });
  assert.ok(!('depois' in alt.campos.cep), 'campo apagado vai sem "depois"');
  const refeito = N.aplicarOps(structuredClone(antes), ops);
  for (const k of Object.keys(depois)) if (!N.RAIZ_DO_SERVIDOR.includes(k)) assert.equal(N.canon(refeito[k]), N.canon(depois[k]), k);
  assert.deepEqual(N.diferencas(antes, structuredClone(antes)), [], 'sem mudança, sem lote');
});

test('com internet: o que um aparelho grava aparece no outro', async () => {
  const { a, b } = await cenario();
  await a.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Apto 604 reformado' }, DONO));
  await a.sinc.sincronizar();
  assert.equal(a.sinc.pendentesQtd(), 0);
  await b.sinc.sincronizar();
  assert.equal(imovel(b.sinc).nome, 'Apto 604 reformado');
  assert.ok(b.sinc.atual().historico.some((h) => h.email_nuvem === DONO), 'histórico com o e-mail de quem gravou');
  // aviso "chegou mudança de outro aparelho": só no outro, não em quem gravou
  const avisosA = []; const avisosB = [];
  a.sinc.aoMudar = (x) => avisosA.push(x); b.sinc.aoMudar = (x) => avisosB.push(x);
  await a.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'De novo' }, DONO));
  await a.sinc.sincronizar();
  await b.sinc.sincronizar();
  assert.equal(avisosA.includes(true), false);
  assert.equal(avisosB.at(-1), true);
  assert.equal(b.sinc.atual().atualizado_por, DONO, 'última atualização acompanha');
});

test('sem internet: grava na fila, guarda no aparelho (sobrevive a recarregar a página) e envia quando volta', async () => {
  const { cofre, a, b } = await cenario();
  a.internet = false;
  await a.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Feito sem internet' }, DONO));
  assert.equal(imovel(a.sinc).nome, 'Feito sem internet', 'a tela já mostra');
  assert.ok(a.sinc.pendentesQtd() > 0);
  // recarregou a página ainda sem internet: a fila continua lá
  const a2 = new N.Sincronia({ api: a.api, guardar: a.guardar });
  await a2.iniciar();
  assert.equal(imovel(a2).nome, 'Feito sem internet');
  a.internet = true;
  await a2.sincronizar();
  assert.equal(a2.pendentesQtd(), 0);
  await b.sinc.sincronizar();
  assert.equal(imovel(b.sinc).nome, 'Feito sem internet');
  assert.ok(cofre);
});

test('dois aparelhos sem internet criando registros: códigos diferentes (faixas), os dois chegam', async () => {
  const { a, b } = await cenario();
  a.internet = false; b.internet = false;
  const ia = await a.sinc.alterar((d) => R.inserir(d, 'imoveis', { nome: 'Sala do PC' }, DONO));
  const ib = await b.sinc.alterar((d) => R.inserir(d, 'imoveis', { nome: 'Sala do celular' }, SOCIA));
  assert.notEqual(ia.id, ib.id);
  a.internet = true; b.internet = true;
  await a.sinc.sincronizar(); await b.sinc.sincronizar(); await a.sinc.sincronizar();
  for (const s of [a.sinc, b.sinc]) assert.deepEqual(s.atual().imoveis.map((x) => x.nome).sort(), ['Apto 604', 'Sala do PC', 'Sala do celular']);
});

test('mesmo campo nos dois sem internet: volta ao anterior, os dois veem o conflito e a escolha vale para todos', async () => {
  const { a, b } = await cenario();
  a.internet = false; b.internet = false;
  await a.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Nome do Dono' }, DONO));
  await b.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Nome da Sócia' }, SOCIA));
  a.internet = true; b.internet = true;
  await a.sinc.sincronizar(); await b.sinc.sincronizar(); await a.sinc.sincronizar();
  for (const s of [a.sinc, b.sinc]) {
    assert.equal(imovel(s).nome, 'Apto 604', 'nenhum vale até escolher');
    assert.equal(s.conflitos.length, 1);
  }
  const [c] = a.sinc.conflitos;
  assert.deepEqual([c.atual, c.proposto], ['Nome do Dono', 'Nome da Sócia']);
  await a.sinc.resolver(c.id, 'proposto');
  await b.sinc.sincronizar();
  for (const s of [a.sinc, b.sinc]) { assert.equal(imovel(s).nome, 'Nome da Sócia'); assert.equal(s.conflitos.length, 0); }
});

test('número da NF: só com internet, dois aparelhos nunca pegam o mesmo número', async () => {
  const { a, b } = await cenario();
  const darNumero = (quem) => (d) => { const n = d.proxima_fatura; d.proxima_fatura = n + 1; R.registrar(d, quem, 'Alteração', 'faturas', null, `NF ${n}`); return n; };
  // b ainda acha que o próximo é 157, mas a usa antes: b refaz com o novo
  const na = await a.sinc.alterar(darNumero(DONO));
  const nb = await b.sinc.alterar(darNumero(SOCIA));
  assert.deepEqual([na, nb], [157, 158]);
  await a.sinc.sincronizar();
  assert.equal(a.sinc.atual().proxima_fatura, 159);
  a.internet = false;
  await assert.rejects(a.sinc.alterar(darNumero(DONO)), /com internet/);
  assert.equal(a.sinc.atual().proxima_fatura, 159, 'sem internet nada muda');
});

test('mudança recusada pela nuvem sai da fila, vira aviso e a tela volta ao que vale', async () => {
  const { cofre } = await cenario();
  const leitor = aparelho(cofre, LEITOR);
  await leitor.sinc.iniciar();
  await leitor.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Leitor tentou' }, LEITOR));
  await leitor.sinc.sincronizar();
  assert.equal(imovel(leitor.sinc).nome, 'Apto 604');
  assert.equal(leitor.sinc.recusas.length, 1);
  assert.match(leitor.sinc.recusas[0].erro, /não pode/);
  // mas a própria sessão (entrar/sair) ele grava
  await leitor.sinc.alterar((d) => { d.usuarios.find((u) => u.id === 3).sessoes = ['tok']; });
  await leitor.sinc.sincronizar();
  assert.equal(leitor.sinc.recusas.length, 1);
  assert.deepEqual(leitor.sinc.atual().usuarios.find((u) => u.id === 3).sessoes, ['tok']);
});

test('internet cai depois de enviar e antes de receber: nada some e nada duplica', async () => {
  const { a, b } = await cenario();
  a.falharPuxar = true;
  await a.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Enviado no limite' }, DONO));
  await a.sinc.sincronizar();
  assert.equal(imovel(a.sinc).nome, 'Enviado no limite', 'continua na tela (ainda na fila)');
  assert.ok(a.sinc.pendentesQtd() > 0);
  a.falharPuxar = false;
  await a.sinc.sincronizar();
  assert.equal(a.sinc.pendentesQtd(), 0);
  await b.sinc.sincronizar();
  assert.equal(b.sinc.atual().historico.filter((h) => String(h.descricao || '').includes('Enviado no limite') || h.detalhes?.nome?.para === 'Enviado no limite').length <= 1, true);
  assert.equal(imovel(b.sinc).nome, 'Enviado no limite');
});

test('normalizar roda na nuvem: a tela vê a migração e quem pode gravar manda a correção aos outros, sem conflito', async () => {
  const cofre = novoCofreDO();
  const a = aparelho(cofre, DONO, R.normalizar); const c = aparelho(cofre, SOCIA, R.normalizar); const b = aparelho(cofre, LEITOR);
  await a.sinc.iniciar();
  const d = bancoInicial();
  d.imoveis[0].anuncio_link = 'https://exemplo.com/anuncio'; // formato antigo: hoje é anuncio_descricao
  await a.sinc.importar(d);
  assert.equal(imovel(a.sinc).anuncio_descricao, 'https://exemplo.com/anuncio', 'a tela já vê o dado migrado');
  assert.equal(imovel(a.sinc).anuncio_link, undefined);
  await b.sinc.iniciar(); await c.sinc.iniciar();
  assert.equal(imovel(b.sinc).anuncio_link, 'https://exemplo.com/anuncio', 'na nuvem ainda está no formato antigo');
  // os dois aparelhos que podem gravar mandam a mesma correção: vale uma vez, sem conflito nem recusa
  assert.ok((await a.sinc.enviarAjustes()) > 0);
  assert.ok((await c.sinc.enviarAjustes()) > 0);
  await a.sinc.sincronizar(); await c.sinc.sincronizar(); await a.sinc.sincronizar();
  for (const s of [a.sinc, c.sinc]) { assert.equal(s.pendentesQtd(), 0); assert.equal(s.recusas.length, 0); assert.equal(s.conflitos.length, 0); }
  assert.equal(await a.sinc.enviarAjustes(), 0, 'nada mais a corrigir');
  await b.sinc.sincronizar();
  assert.equal(imovel(b.sinc).anuncio_descricao, 'https://exemplo.com/anuncio', 'quem não normaliza recebe o dado já migrado');
  assert.equal(imovel(b.sinc).anuncio_link, undefined);
  // gravação sobre a vista normalizada manda só o que mudou
  await a.sinc.alterar((x) => R.atualizar(x, 'imoveis', 1, { nome: 'Apto 604 anunciado' }, DONO));
  await a.sinc.sincronizar(); await b.sinc.sincronizar();
  assert.equal(imovel(b.sinc).nome, 'Apto 604 anunciado');
  assert.equal(a.sinc.conflitos.length, 0);
});

test('a mesma pessoa entra em dois aparelhos: as sessões se juntam, sem conflito; sair num tira só a dele', async () => {
  const { a } = await cenario();
  const pc = aparelho(novoCofreDO(), DONO); // só para ter um segundo Sincronia do mesmo e-mail contra o mesmo cofre
  pc.api = a.api; pc.sinc = new N.Sincronia({ api: a.api, guardar: pc.guardar });
  await pc.sinc.iniciar();
  const entrar = (s, token) => s.alterar((d) => { const u = d.usuarios.find((x) => x.id === 1); u.sessoes = [...(u.sessoes || []), token].slice(-N.MAX_SESSOES); });
  // os dois entram sem ver um ao outro (cada um acha que a lista está vazia)
  await entrar(a.sinc, 'tok-celular'); await entrar(pc.sinc, 'tok-pc');
  await a.sinc.sincronizar(); await pc.sinc.sincronizar(); await a.sinc.sincronizar();
  for (const s of [a.sinc, pc.sinc]) {
    assert.deepEqual([...s.atual().usuarios.find((x) => x.id === 1).sessoes].sort(), ['tok-celular', 'tok-pc']);
    assert.equal(s.conflitos.length, 0); assert.equal(s.recusas.length, 0);
  }
  // o celular sai (tira o próprio token) enquanto o PC, sem ver isso, entra de novo: fica só o que vale
  a.internet = false; pc.internet = false;
  await a.sinc.alterar((d) => { const u = d.usuarios.find((x) => x.id === 1); u.sessoes = u.sessoes.filter((t) => t !== 'tok-celular'); });
  await entrar(pc.sinc, 'tok-pc-2');
  a.internet = true; pc.internet = true;
  await pc.sinc.sincronizar(); await a.sinc.sincronizar(); await pc.sinc.sincronizar();
  for (const s of [a.sinc, pc.sinc]) {
    assert.deepEqual([...s.atual().usuarios.find((x) => x.id === 1).sessoes].sort(), ['tok-pc', 'tok-pc-2']);
    assert.equal(s.conflitos.length, 0);
  }
});

test('falhas passageiras (sem internet, tempo esgotado, 401, 408, 429, 5xx) ficam na fila; 403/404/412 são recusas', async () => {
  for (const s of [0, 401, 408, 429, 500, 503]) assert.equal(N.passageiro(new N.ErroNuvem('x', s)), true, String(s));
  for (const s of [400, 403, 404, 409, 412]) assert.equal(N.passageiro(new N.ErroNuvem('x', s)), false, String(s));
  // pedido que nunca responde: o tempo limite cancela e vira erro passageiro (status 0)
  const pendurado = (url, op) => new Promise((_, erro) => { op.signal.addEventListener('abort', () => erro(op.signal.reason)); });
  const api = N.apiDoSite('api/dados/', { limite: 30, buscar: pendurado });
  await assert.rejects(api('GET', 'tudo'), (e) => e.status === 0 && /demorou/.test(e.message));
  // 429 (muitos pedidos): o lote continua na fila e a tela segue mostrando a mudança
  const { a } = await cenario();
  const apiReal = a.sinc.api;
  a.sinc.api = async (m, rota, corpo) => { if (m === 'POST') throw new N.ErroNuvem('Muitos pedidos.', 429); return apiReal(m, rota, corpo); };
  await a.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Com 429' }, DONO));
  await a.sinc.sincronizar();
  assert.equal(a.sinc.pendentesQtd() > 0, true);
  assert.equal(a.sinc.recusas.length, 0);
  assert.equal(imovel(a.sinc).nome, 'Com 429');
  a.sinc.api = apiReal;
  await a.sinc.sincronizar();
  assert.equal(a.sinc.pendentesQtd(), 0);
});

test('voltar para um backup: o administrador substitui os dados pelos do dia e os outros aparelhos baixam tudo de novo', async () => {
  const { a, b } = await cenario();
  const ontem = structuredClone(a.sinc.atual()); // o que o backup do dia teria (formato de tudo(), com _nuvem e seq)
  await a.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Mudado hoje' }, DONO));
  await a.sinc.sincronizar(); await b.sinc.sincronizar();
  assert.equal(imovel(b.sinc).nome, 'Mudado hoje');
  await a.sinc.importar(ontem, { substituir: true });
  assert.equal(imovel(a.sinc).nome, 'Apto 604');
  await b.sinc.sincronizar();
  assert.equal(imovel(b.sinc).nome, 'Apto 604', 'o outro aparelho recebeu a versão restaurada');
  assert.equal(b.sinc.pendentesQtd(), 0);
});

test('velocidade: a conferência sem novidade não regrava a cópia local, e gravações seguidas vão numa sincronia só', async () => {
  const { a, b } = await cenario();
  const gravacoesDeBase = []; const idas = [];
  const gravarReal = a.guardar.gravar; const apiReal = a.sinc.api;
  a.guardar.gravar = async (k, v) => { if (k === 'base') gravacoesDeBase.push(k); return gravarReal(k, v); };
  a.sinc.api = async (m, rota, corpo) => { idas.push(`${m} ${rota.split('?')[0]}`); return apiReal(m, rota, corpo); };
  a.sinc.guardar = a.guardar;
  // conferência de 30 em 30 s sem nada novo: nenhuma gravação da cópia (cifrar o banco inteiro à toa)
  await a.sinc.sincronizar(); await a.sinc.sincronizar();
  assert.equal(gravacoesDeBase.length, 0);
  // chegou algo de outro aparelho: aí grava
  await b.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Da sócia' }, SOCIA)); await b.sinc.sincronizar();
  await a.sinc.sincronizar();
  assert.equal(gravacoesDeBase.length, 1);
  // três gravações seguidas (duplo clique, arrumações do Painel): uma ida só para buscar o que mudou, três lotes
  a.sinc.agrupar = 20; idas.length = 0;
  for (const nome of ['Um', 'Dois', 'Três']) await a.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome }, DONO));
  assert.ok(a.sinc.envioMarcado, 'envio marcado para daqui a pouco');
  await new Promise((ok) => setTimeout(ok, 200));
  assert.equal(a.sinc.pendentesQtd(), 0, 'foi sozinho');
  assert.equal(idas.filter((x) => x === 'POST lote').length, 3, 'cada gravação continua sendo um lote');
  assert.equal(idas.filter((x) => x === 'GET mudancas').length, 1, 'uma passada só');
  await b.sinc.sincronizar();
  assert.equal(imovel(b.sinc).nome, 'Três');
});

test('aparelho novo sem internet e sem cópia: avisa que precisa conectar', async () => {
  const { cofre } = await cenario();
  const c = aparelho(cofre, DONO);
  c.internet = false;
  await assert.rejects(c.sinc.iniciar(), /Conecte para abrir pela primeira vez/);
});
