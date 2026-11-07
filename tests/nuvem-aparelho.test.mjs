// O aparelho na nuvem como app.js o monta (abrirNuvem/entrar/sair): cópia cifrada (cofrinho.js) por baixo da Sincronia (nuvem.js),
// contra o cofre de verdade (nuvem/cofre.mjs). Gravar e receber (alterarAgora/aoMudar), ajustes do normalizar, sair tranca,
// login lembrado vencido, dois usuários no mesmo aparelho, 401/408 com reenvio. app.js em si não roda no Node (usa window/document
// já ao carregar: `window.addEventListener('storage', …)`, `setInterval`); aqui vai a camada logo abaixo dele. Dados fictícios.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as C from '../docs/js/cofrinho.js';
import * as N from '../docs/js/nuvem.js';
import * as R from '../docs/js/regras.js';
import * as K from '../nuvem/cofre.mjs';
import { r2Falso } from './r2-falso.mjs';

const IT = 1000; // iterações baixas só para o teste ser rápido
const DONO = 'dono@exemplo.com.br'; const SOCIA = 'socia@exemplo.com.br'; const LEITOR = 'leitor@exemplo.com.br';

function novoCofreDO() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  return new K.CofreDO({ storage: { sql, transactionSync: tx } }, { DADOS: r2Falso() });
}

/** O IndexedDB do aparelho (cru): um Map, legível no teste. */
const cruFalso = () => { const m = new Map(); return { m, ler: async (k) => m.get(k), gravar: async (k, v) => { m.set(k, v); }, apagar: async (k) => { m.delete(k); } }; };
const legivel = (cru) => JSON.stringify([...cru.m.entries()].filter(([k]) => !['acesso', 'chave-sessao', 'embrulhos'].includes(k)), (k, v) => (v instanceof Uint8Array ? `[${v.length} bytes]` : v));

/**
 * Um aparelho como app.js o monta: cru → Cofrinho → guardarCifrado → Sincronia (com normalizar). `entrar(login, senha)` e `sair()`
 * fazem o que destrancarNuvem/sair fazem com a cópia; `avisos` guarda o que aoMudar recebeu (externo?).
 */
function aparelho(cofre, email, { cru = cruFalso(), falhar = null } = {}) {
  const ap = { email, internet: true, cru, avisos: [], falhar };
  ap.cofrinho = new C.Cofrinho(cru);
  ap.guardar = C.guardarCifrado(cru, () => ap.cofrinho.chave);
  ap.api = async (metodo, rota, corpo) => {
    if (!ap.internet) throw new N.ErroNuvem('Sem internet.', 0);
    if (ap.falhar) { const e = ap.falhar(metodo, rota); if (e) throw e; }
    const r = await cofre.fetch(new Request(`https://cofre/${rota}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: { 'X-Email-Conferido': email } }));
    const dados = await r.json();
    if (!r.ok) throw new N.ErroNuvem(dados.erro, r.status, dados);
    return dados;
  };
  ap.novaSincronia = () => { ap.sinc = new N.Sincronia({ api: ap.api, guardar: ap.guardar, normalizar: R.normalizar, aoMudar: (x) => ap.avisos.push(x), agrupar: 5 }); return ap.sinc; };
  ap.novaSincronia();
  ap.entrar = (login, senha, ate = Date.now() + 3600e3) => ap.cofrinho.entrar(login, senha, ate, IT);
  ap.sair = () => ap.cofrinho.sair();
  return ap;
}

function bancoInicial() {
  const d = R.bancoVazio();
  R.inserir(d, 'usuarios', { login: DONO, nome: 'Dono', papel: 'admin', ativo: true, senha_hash: 'h' }, 'teste');
  R.inserir(d, 'usuarios', { login: 'socia', email: SOCIA, nome: 'Sócia', papel: 'admin', ativo: true, senha_hash: 'h' }, 'teste');
  R.inserir(d, 'usuarios', { login: 'leitor', email: LEITOR, nome: 'Leitor', papel: 'consulta', ativo: true, senha_hash: 'h' }, 'teste');
  R.inserir(d, 'imoveis', { nome: 'Apto 604', cep: '80010-000' }, 'teste');
  R.inserir(d, 'contratos', { imovel_id: 1, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', data_entrada: '2026-01-10', aluguel_inicial: 150000, dia_vencimento: 10 }, 'teste');
  return d;
}
async function cenario() {
  const cofre = novoCofreDO();
  const a = aparelho(cofre, DONO); const b = aparelho(cofre, SOCIA);
  await a.entrar('dono', 'senha do dono 123');
  assert.equal(await a.sinc.iniciar(), null, 'nuvem vazia');
  await a.sinc.importar(bancoInicial());
  await b.entrar('socia', 'senha da socia 123');
  await b.sinc.iniciar();
  return { cofre, a, b };
}
const imovel = (s, id = 1) => s.atual().imoveis.find((x) => x.id === id);

test('gravar como alterarAgora faz: a tela vê na hora, a cópia no aparelho fica cifrada e o outro aparelho recebe com o aviso "externo"', async () => {
  const { a, b } = await cenario();
  const r = await a.sinc.alterar((d) => R.atualizar(d, 'contratos', 1, { inquilino_nome: 'Maria Exemplo Nova' }, DONO));
  assert.ok(r, 'devolve o resultado da função, como alterar(fn) na tela');
  assert.equal(a.sinc.atual().contratos[0].inquilino_nome, 'Maria Exemplo Nova', 'E.d = E.nuvem.atual() já mostra');
  await a.sinc.sincronizar();
  assert.equal(a.sinc.pendentesQtd(), 0);
  assert.doesNotMatch(legivel(a.cru), /Maria|529\.982/, 'no IndexedDB nada dos inquilinos em texto');
  assert.equal(a.avisos.at(-1), false, 'quem gravou não recebe "mudança de outro aparelho"');
  await b.sinc.sincronizar();
  assert.equal(b.sinc.atual().contratos[0].inquilino_nome, 'Maria Exemplo Nova');
  assert.equal(b.avisos.at(-1), true, 'o outro aparelho recebe externo=true (redesenha a tela)');
  assert.doesNotMatch(legivel(b.cru), /Maria|529\.982/);
});

test('ajustes do normalizar (ajustesParaNuvem): o administrador manda; o usuário de consulta teria a mudança recusada', async () => {
  const cofre = novoCofreDO();
  const a = aparelho(cofre, DONO); const l = aparelho(cofre, LEITOR);
  await a.entrar('dono', 'senha do dono 123');
  await a.sinc.iniciar();
  const d = bancoInicial();
  d.imoveis[0].anuncio_link = 'https://exemplo.com/anuncio'; // formato antigo (migração em normalizar)
  await a.sinc.importar(d);
  await l.entrar('leitor', 'senha do leitor 123');
  await l.sinc.iniciar();
  assert.equal(imovel(l.sinc).anuncio_descricao, 'https://exemplo.com/anuncio', 'a tela do leitor já vê migrado');
  // por isso app.js só chama enviarAjustes para admin: o leitor seria recusado e ficaria com aviso
  assert.ok((await l.sinc.enviarAjustes()) > 0);
  await l.sinc.sincronizar();
  assert.equal(l.sinc.recusas.length, 1);
  assert.equal(l.sinc.pendentesQtd(), 0);
  assert.ok((await a.sinc.enviarAjustes()) > 0);
  await a.sinc.sincronizar();
  assert.equal(a.sinc.recusas.length, 0);
  assert.equal(await a.sinc.enviarAjustes(), 0, 'depois de enviado, nada a corrigir');
  await l.sinc.sincronizar();
  assert.equal(l.sinc.atual().imoveis[0].anuncio_link, undefined, 'a nuvem ficou no formato novo');
});

test('sair tranca a cópia: sem internet o aparelho não abre; entrando de novo com a senha, a fila gravada sem internet continua lá', async () => {
  const { a } = await cenario();
  a.internet = false;
  await a.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Feito sem internet' }, DONO));
  assert.equal(await a.cru.ler('aguardando-dados'), 1, 'quantos lotes esperam fica aberto');
  await a.sair();
  assert.equal(await a.guardar.ler('base'), undefined, 'trancado: ler não abre');
  // recarregou a página (Sincronia nova) ainda trancado e sem internet
  await assert.rejects(a.novaSincronia().iniciar(), /Conecte para abrir pela primeira vez/);
  // o login lembrado venceu: daSessao não devolve a chave
  assert.equal(await a.cofrinho.daSessao(true), null);
  // entrou com a senha: a mesma cópia e a mesma fila
  await a.entrar('dono', 'senha do dono 123');
  await a.novaSincronia().iniciar();
  assert.equal(imovel(a.sinc).nome, 'Feito sem internet');
  assert.equal(a.sinc.pendentes.length, 1, 'um lote (a alteração e a entrada do histórico)');
  a.internet = true;
  await a.sinc.sincronizar();
  assert.equal(a.sinc.pendentesQtd(), 0);
});

test('login lembrado: a chave da sessão abre a cópia ao recarregar; vencida, tranca e apaga a chave', async () => {
  const { a } = await cenario();
  const outraAba = new C.Cofrinho(a.cru);
  assert.ok(await outraAba.daSessao(true), 'outra aba do mesmo aparelho abre com a chave lembrada');
  await a.entrar('dono', 'senha do dono 123', Date.now() - 1); // sessão já vencida
  assert.equal(await new C.Cofrinho(a.cru).daSessao(true), null);
  assert.equal(await a.cru.ler('chave-sessao'), undefined);
});

test('dois usuários no mesmo aparelho: quem nunca entrou só entra sem fila pendente; depois ganha chave nova e baixa tudo de novo', async () => {
  const { cofre, a } = await cenario();
  a.internet = false;
  await a.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: 'Do dono, sem internet' }, DONO));
  await a.sair();
  const socia = aparelho(cofre, SOCIA, { cru: a.cru }); // o mesmo computador
  await assert.rejects(socia.entrar('socia', 'senha da socia 123'), /ainda não foram para a nuvem/);
  // o dono volta com internet e envia; aí a sócia entra
  a.internet = true;
  await a.entrar('dono', 'senha do dono 123');
  await a.novaSincronia().iniciar();
  await a.sinc.sincronizar();
  assert.equal(a.sinc.pendentesQtd(), 0);
  await a.sair();
  const r = await socia.entrar('socia', 'senha da socia 123');
  assert.equal(r.nova, true, 'chave nova: a cópia do dono fica ilegível');
  await socia.sinc.iniciar(); // baixa tudo de novo
  assert.equal(imovel(socia.sinc).nome, 'Do dono, sem internet');
  // o dono, com a chave aberta pela sócia na sessão, entra sem perder nada (ganha a mesma chave)
  const r2 = await a.entrar('dono', 'senha do dono 123');
  assert.equal(r2.nova, false);
});

test('401 (login do Access venceu) e 408 (pedido demorado): fica na fila, offline; quando volta, reenvia e nada duplica', async () => {
  const { a, b } = await cenario();
  for (const status of [401, 408]) {
    a.falhar = (m) => (m === 'POST' ? new N.ErroNuvem('falha', status) : null);
    await a.sinc.alterar((d) => R.atualizar(d, 'imoveis', 1, { nome: `Com ${status}` }, DONO));
    await a.sinc.sincronizar();
    assert.equal(a.sinc.online, false, `${status}: sem nuvem no momento`);
    assert.ok(a.sinc.pendentesQtd() > 0);
    assert.equal(a.sinc.recusas.length, 0, `${status} não é recusa`);
    a.falhar = null;
    await a.sinc.sincronizar();
    assert.equal(a.sinc.online, true);
    assert.equal(a.sinc.pendentesQtd(), 0);
  }
  await b.sinc.sincronizar();
  assert.equal(imovel(b.sinc).nome, 'Com 408');
  const h = b.sinc.atual().historico.filter((x) => x.detalhes?.nome?.para === 'Com 401');
  assert.equal(h.length, 1, 'o lote reenviado não aplica duas vezes');
});
