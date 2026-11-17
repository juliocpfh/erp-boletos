// Cofre das licenças (nuvem/cofre-licencas.mjs) com SQLite do Node no lugar do Durable Object, e o painel de vendas
// (nuvem/painel-vendas.mjs): papéis vendedor/gerente, gerar, listar, revogar, cortesia, reenviar, equipe, ativação e
// renovação pelo sistema do cliente, certificado conferido com a chave pública, login do Access no endereço do painel.
// Empresas, e-mails e CNPJ fictícios.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { CofreLicencas, CofreLicencasDO, pedirAoCofreDeLicencas } from '../nuvem/cofre-licencas.mjs';
import * as L from '../nuvem/licencas.mjs';
import { ambienteDoLogin, atenderVendas, ehEnderecoDeVendas, PAGINA } from '../nuvem/painel-vendas.mjs';
import worker from '../nuvem/worker.mjs';

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
const transacaoDe = (sql) => (fn) => {
  sql.db.exec('BEGIN');
  try { const r = fn(); sql.db.exec('COMMIT'); return r; } catch (e) { sql.db.exec('ROLLBACK'); throw e; }
};

const DONO = 'dono@exemplo.com.br'; const CARLOS = 'carlos@exemplo.com.br'; const ANA = 'ana@exemplo.com.br'; const MARIA = 'maria@exemplo.com.br';
const CNPJ = '11.222.333/0001-81';
let agora = new Date('2027-01-10T13:00:00-03:00');
const par = await L.gerarParDeChaves();
const novo = (extra = {}) => { const sql = sqlFalso(); return new CofreLicencas(sql, transacaoDe(sql), { gerentes: `${DONO}, outro-gerente@exemplo.com.br`, chavePrivada: JSON.stringify(par.privada), relogio: () => agora, ...extra }); };
const comVendedores = () => {
  const c = novo();
  c.gravarMembro(DONO, { email: CARLOS, nome: 'Carlos', papel: 'vendedor', planos: ['anual', 'anual2', 'teste'] });
  c.gravarMembro(DONO, { email: ANA, nome: 'Ana', papel: 'vendedor' });
  return c;
};

const pedido = (rota, { email = DONO, corpo, method = corpo === undefined ? 'GET' : 'POST', empresa } = {}) => new Request(`https://licencas/${rota}`, {
  method, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: { 'X-Email-Conferido': email, ...(empresa ? { 'X-Empresa': empresa } : {}) },
});
const resposta = async (c, rota, op) => { const r = await c.atender(pedido(rota, op)); return { status: r.status, dados: await r.json() }; };

test('papéis: gerente vem do segredo, vendedor da equipe; quem não está não entra', () => {
  const c = comVendedores();
  assert.equal(c.papel(DONO), 'gerente');
  assert.equal(c.papel('Outro-Gerente@exemplo.com.br'), 'gerente');
  assert.equal(c.papel(CARLOS), 'vendedor');
  assert.equal(c.papel('estranho@exemplo.com.br'), '');
  assert.throws(() => c.gravarMembro(CARLOS, { email: 'novo@exemplo.com.br' }), /Só o gerente/);
  assert.throws(() => c.gravarMembro(DONO, { email: DONO }), /GERENTES_VENDAS/);
  assert.throws(() => c.gravarMembro(DONO, { email: 'sem-arroba' }), /E-mail inválido/);
  assert.throws(() => c.gravarMembro(DONO, { email: 'x@exemplo.com.br', planos: ['vitalicio'] }), /Plano desconhecido/);
  c.gravarMembro(DONO, { email: ANA, ativo: false });
  assert.equal(c.papel(ANA), '', 'vendedor desativado não entra');
  assert.deepEqual(c.equipe(DONO).map((m) => m.email), [DONO, 'outro-gerente@exemplo.com.br', ANA, CARLOS]);
  assert.throws(() => c.equipe(CARLOS), /Só o gerente/);
  assert.equal(c.historico(DONO).filter((h) => h.acao === 'equipe').length, 3);
});

test('gerar: vendedor só os planos liberados e sem mudar limites; chave fica com quem gerou', () => {
  const c = comVendedores();
  let n = 0;
  const f = c.gerar(CARLOS, { plano: 'anual2', cliente: 'Silva Patrimonial', email: 'MARIA@exemplo.com.br', observacao: 'pedido 1043' });
  n += 1;
  assert.match(f.chave, /^IMOV-/);
  assert.equal(f.vendedor, CARLOS);
  assert.equal(f.criada, '2027-01-10');
  assert.equal(f.usar_ate, '2027-04-10');
  assert.equal(f.email, MARIA);
  assert.throws(() => c.gerar(CARLOS, { plano: 'mensal' }), /não está liberado/);
  assert.throws(() => c.gerar(CARLOS, { plano: 'anual', limites: { imoveis: 100 } }), /Só o gerente muda os limites/);
  assert.throws(() => c.gerar(CARLOS, { plano: 'anual', email: 'errado' }), /E-mail do cliente inválido/);
  assert.throws(() => c.gerar('estranho@exemplo.com.br', { plano: 'anual' }), /não tem acesso/);
  assert.equal(c.gerar(DONO, { plano: 'anual', limites: { imoveis: 100 } }).limites.imoveis, 100); n += 1;
  c.gerar(ANA, { plano: 'mensal' }); n += 1;
  assert.equal(c.lista(DONO).chaves.length, n, 'gerente vê todas');
  assert.deepEqual(c.lista(CARLOS).chaves.map((x) => x.chave), [f.chave], 'vendedor vê só as dele');
  assert.equal(c.lista(CARLOS).chaves[0].estado, 'livre');
});

test('gerar: sorteio repetido tenta outra chave (nunca sobrescreve uma ficha)', () => {
  let vez = 0;
  const c = novo({ aleatorio: (b) => { b.fill(vez < 2 ? 0 : 7); vez += 1; return b; } });
  const a = c.gerar(DONO, { plano: 'anual' });
  const b = c.gerar(DONO, { plano: 'anual' });
  assert.notEqual(a.chave, b.chave);
  const preso = novo({ aleatorio: (x) => x.fill(0) });
  preso.gerar(DONO, { plano: 'anual' });
  assert.throws(() => preso.gerar(DONO, { plano: 'anual' }), /Não foi possível sortear/);
});

test('ativar pelo sistema do cliente: certificado confere com a chave pública; 2ª vez é recusada', async () => {
  const c = comVendedores();
  const f = c.gerar(CARLOS, { plano: 'anual2', cliente: 'Silva Patrimonial' });
  agora = new Date('2027-01-20T10:00:00-03:00');
  const r = await resposta(c, 'cliente/ativar', { email: MARIA, empresa: 'silva', corpo: { chave: f.chave.toLowerCase().replace(/-/g, ' '), nome: 'Silva Patrimonial Ltda', cnpjs: [CNPJ] } });
  assert.equal(r.status, 200, r.dados.erro);
  assert.equal(r.dados.licenca.ate, '2029-01-20');
  assert.equal(r.dados.situacao.estado, 'ativa');
  assert.equal(r.dados.licenca.chaves, undefined, 'a lista de chaves não volta ao cliente');
  const cert = await L.conferirCertificado(r.dados.certificado, par.publica, '2027-01-20', { empresa: 'silva' });
  assert.equal(cert.ok, true);
  assert.equal(cert.dados.ate, '2029-01-20');
  const outra = await resposta(c, 'cliente/ativar', { email: 'joao@exemplo.com.br', empresa: 'souza', corpo: { chave: f.chave, nome: 'Souza', cnpjs: [CNPJ] } });
  assert.equal(outra.status, 409);
  assert.match(outra.dados.erro, /já foi usada pela empresa Silva Patrimonial Ltda em 20\/01\/2027/);
  const dnv = await resposta(c, 'cliente/ativar', { email: MARIA, empresa: 'silva', corpo: { chave: c.gerar(DONO, { plano: 'anual' }).chave, nome: 'Silva', cnpjs: [CNPJ] } });
  assert.match(dnv.dados.erro, /já tem licença: use Renovar/);
  const lista = c.lista(CARLOS);
  assert.equal(lista.chaves[0].estado, 'usada');
  assert.equal(lista.chaves[0].empresa_nome, 'Silva Patrimonial Ltda');
  assert.deepEqual(lista.licencas.map((x) => x.empresa), ['silva'], 'vendedor vê a licença que vendeu');
  assert.deepEqual(c.lista(ANA).licencas, [], 'e não as dos outros');
  assert.equal(c.historico(DONO, { empresa: 'silva' })[0].acao, 'ativar');
});

test('renovar pelo sistema do cliente soma o prazo; certificado atualizado pega a cortesia e a revogação', async () => {
  const c = comVendedores();
  agora = new Date('2027-01-20T10:00:00-03:00');
  await c.ativar({ chave: c.gerar(DONO, { plano: 'anual2' }).chave, empresa: 'silva', nome: 'Silva', cnpjs: [CNPJ], por: MARIA });
  agora = new Date('2029-01-05T10:00:00-03:00');
  const nova = c.gerar(CARLOS, { plano: 'anual' });
  agora = new Date('2029-01-10T10:00:00-03:00');
  const r = await resposta(c, 'cliente/renovar', { email: MARIA, empresa: 'silva', corpo: { chave: nova.chave } });
  assert.equal(r.status, 200, r.dados.erro);
  assert.equal(r.dados.licenca.ate, '2030-01-20');
  assert.equal((await resposta(c, 'cliente/renovar', { email: MARIA, empresa: 'silva', corpo: { chave: nova.chave } })).status, 409);
  // cortesia e vencimento
  assert.throws(() => c.cortesia(CARLOS, { empresa: 'silva', dias: 30, motivo: 'x' }), /Só o gerente/);
  assert.equal(c.cortesia(DONO, { empresa: 'silva', dias: 30, motivo: 'atraso no suporte' }).licenca.ate, '2030-02-19');
  const cert = await resposta(c, 'cliente/certificado', { email: MARIA, empresa: 'silva' });
  assert.equal((await L.conferirCertificado(cert.dados.certificado, par.publica, '2030-02-18')).dados.ate, '2030-02-19');
  // revogar a licença: só leitura
  assert.throws(() => c.revogar(DONO, { empresa: 'silva' }), /motivo/);
  c.revogar(DONO, { empresa: 'silva', motivo: 'pagamento estornado' });
  const rev = await resposta(c, 'cliente/certificado', { email: MARIA, empresa: 'silva' });
  assert.deepEqual([rev.dados.situacao.estado, rev.dados.situacao.pode_gravar], ['revogada', false]);
  assert.equal((await L.conferirCertificado(rev.dados.certificado, par.publica, '2029-01-11')).situacao.estado, 'revogada');
  assert.equal((await resposta(c, 'cliente/certificado', { email: MARIA, empresa: 'souza' })).status, 404);
});

test('revogar chave não usada (gerente); chave usada pede revogar a licença', async () => {
  const c = comVendedores();
  agora = new Date('2027-01-10T10:00:00-03:00');
  const f = c.gerar(CARLOS, { plano: 'anual' });
  assert.throws(() => c.revogar(CARLOS, { chave: f.chave, motivo: 'e-mail errado' }), /Só o gerente/);
  c.revogar(DONO, { chave: f.chave, motivo: 'e-mail errado' });
  assert.equal(c.lista(CARLOS).chaves[0].estado, 'revogada');
  const r = await resposta(c, 'cliente/ativar', { email: MARIA, empresa: 'silva', corpo: { chave: f.chave, nome: 'Silva', cnpjs: [CNPJ] } });
  assert.match(r.dados.erro, /cancelada/);
  const usada = c.gerar(CARLOS, { plano: 'anual' });
  await c.ativar({ chave: usada.chave, empresa: 'silva', nome: 'Silva', cnpjs: [CNPJ], por: MARIA });
  assert.throws(() => c.revogar(DONO, { chave: usada.chave, motivo: 'x' }), /revogue a licença da empresa/);
  assert.equal(c.historico(DONO, { chave: f.chave })[0].acao, 'revogar chave');
});

test('chave não usada vence em 90 dias e a lista mostra; filtro "vence nos próximos 60 dias"', async () => {
  const c = comVendedores();
  agora = new Date('2027-01-10T10:00:00-03:00');
  const f = c.gerar(CARLOS, { plano: 'anual' });
  const g = c.gerar(CARLOS, { plano: 'anual' });
  agora = new Date('2027-04-11T10:00:00-03:00');
  assert.equal(c.lista(CARLOS).chaves.find((x) => x.chave === f.chave).estado, 'vencida');
  assert.equal((await resposta(c, 'cliente/ativar', { email: MARIA, empresa: 'silva', corpo: { chave: f.chave, nome: 'Silva', cnpjs: [CNPJ] } })).status, 409);
  agora = new Date('2027-01-20T10:00:00-03:00');
  await c.ativar({ chave: g.chave, empresa: 'silva', nome: 'Silva', cnpjs: [CNPJ], por: MARIA });
  c.casa(DONO, { empresa: 'ankjck', nome: 'ANK/JCK', cnpjs: [CNPJ] });
  assert.throws(() => c.casa(DONO, { empresa: 'ankjck', nome: 'ANK/JCK' }), /já tem licença/);
  agora = new Date('2027-11-01T10:00:00-03:00');
  assert.deepEqual(c.lista(DONO, { filtro: 'vence60' }).licencas.map((x) => x.empresa), []);
  agora = new Date('2027-12-01T10:00:00-03:00');
  const v = c.lista(DONO, { filtro: 'vence60' }).licencas;
  assert.deepEqual(v.map((x) => x.empresa), ['silva'], 'a da casa nunca aparece');
  assert.equal(v[0].situacao.aviso, 60);
  assert.equal(c.lista(DONO).licencas.find((x) => x.empresa === 'ankjck').situacao.estado, 'ativa');
});

test('reenviar: texto do e-mail com a chave e os limites; vendedor só as dele', () => {
  const c = comVendedores();
  agora = new Date('2027-01-10T10:00:00-03:00');
  const f = c.gerar(CARLOS, { plano: 'anual2', cliente: 'Silva Patrimonial', email: MARIA });
  const m = c.reenviar(CARLOS, { chave: f.chave });
  assert.equal(m.para, MARIA);
  assert.match(m.texto, new RegExp(f.chave));
  assert.match(m.texto, /até 20 imóveis, 20 inquilinos com contrato ativo, 4 usuários e 2 empresas/);
  assert.match(m.texto, /até 10\/04\/2027/);
  assert.throws(() => c.reenviar(ANA, { chave: f.chave }), /não encontrada/);
  assert.equal(c.reenviar(DONO, { chave: f.chave, para: 'outro@exemplo.com.br' }).para, 'outro@exemplo.com.br');
  assert.throws(() => c.reenviar(CARLOS, { chave: c.gerar(CARLOS, { plano: 'anual' }).chave }), /Informe o e-mail/);
});

test('sem a chave de assinatura a ativação nem começa (a chave do cliente não é gasta)', async () => {
  const c = novo({ chavePrivada: '' });
  const f = c.gerar(DONO, { plano: 'anual' });
  const r = await resposta(c, 'cliente/ativar', { email: MARIA, empresa: 'silva', corpo: { chave: f.chave, nome: 'Silva', cnpjs: [CNPJ] } });
  assert.equal(r.status, 503);
  assert.equal(c.ficha(f.chave).usada_por, null);
});

test('rotas do cofre: sem login, pedido inválido, rota desconhecida', async () => {
  const c = comVendedores();
  assert.equal((await resposta(c, 'eu', { email: '' })).status, 401);
  assert.equal((await resposta(c, 'eu', { email: CARLOS })).dados.papel, 'vendedor');
  assert.equal((await resposta(c, 'eu', { email: 'estranho@exemplo.com.br' })).status, 403);
  assert.equal((await resposta(c, 'planos', { email: CARLOS })).dados.limites.imoveis, 20);
  const r = await c.atender(new Request('https://licencas/gerar', { method: 'POST', body: '{x', headers: { 'X-Email-Conferido': DONO } }));
  assert.equal(r.status, 400);
  assert.equal((await resposta(c, 'gerar', { corpo: [1] })).status, 400);
  assert.equal((await resposta(c, 'apagar-tudo', { corpo: {} })).status, 404);
  assert.equal((await resposta(c, 'cliente/qualquer', { empresa: 'silva' })).status, 404);
  assert.equal((await resposta(c, 'gerar', { email: CARLOS, corpo: { plano: 'anual' } })).status, 200);
});

// ---------------------------------------------------------------------------
// Painel de vendas e Durable Object
// ---------------------------------------------------------------------------
const doFalso = () => {
  const sql = sqlFalso();
  const obj = new CofreLicencasDO({ storage: { sql, transactionSync: transacaoDe(sql) } }, { GERENTES_VENDAS: DONO, LICENCA_CHAVE_PRIVADA: JSON.stringify(par.privada) });
  return { idFromName: (n) => n, get: () => obj };
};
const loginFalso = (email) => async (req, env) => {
  if (env.ACCESS_AUD !== 'aud-vendas') throw Object.assign(new Error('Worker sem configuração de login.'), { status: 503 });
  if (!email) throw Object.assign(new Error('Entre de novo.'), { status: 401 });
  return email;
};
const env = { HOST_VENDAS: 'vendas.exemplo.com.br', ACCESS_AUD: 'aud-sistema', ACCESS_AUD_VENDAS: 'aud-vendas', EMAILS: DONO, SERVICOS: 'id=x@y' };
const noPainel = (caminho, op = {}) => new Request(`https://vendas.exemplo.com.br${caminho}`, op);
const post = (caminho, corpo, cab = {}) => noPainel(caminho, { method: 'POST', body: JSON.stringify(corpo), headers: { 'X-Sistema': 'vendas', 'Content-Type': 'application/json', ...cab } });

test('painel: endereço próprio, login com o AUD do painel, página com CSP e sem texto do servidor por innerHTML', async () => {
  assert.equal(ehEnderecoDeVendas(noPainel('/'), env), true);
  assert.equal(ehEnderecoDeVendas(new Request('https://erp.exemplo.com.br/api/saude'), env), false);
  const a = ambienteDoLogin(env);
  assert.deepEqual([a.ACCESS_AUD, a.EMAILS, a.SERVICOS], ['aud-vendas', '', ''], 'sem a lista do sistema nem chaves de serviço');
  const e = { ...env, LICENCAS: doFalso() };
  const pag = await atenderVendas(noPainel('/'), e, { conferirLogin: loginFalso(DONO) });
  assert.equal(pag.status, 200);
  const csp = pag.headers.get('Content-Security-Policy');
  const nonce = /'nonce-([0-9a-f]+)'/.exec(csp)[1];
  const html = await pag.text();
  assert.ok(html.includes(`<script nonce="${nonce}">`));
  assert.ok(!html.includes('{{NONCE}}'));
  assert.ok(!/style="/.test(PAGINA), 'sem estilo solto (a CSP barraria)');
  assert.ok(!/innerHTML/.test(PAGINA));
  assert.equal((await atenderVendas(noPainel('/'), e, { conferirLogin: loginFalso('') })).status, 401);
  assert.equal((await atenderVendas(noPainel('/'), { ...e, ACCESS_AUD_VENDAS: '' }, { conferirLogin: loginFalso(DONO) })).status, 503, 'sem AUD do painel, fechado');
});

test('painel: repassa ao cofre das licenças com o e-mail do login; grava só com X-Sistema e da mesma origem; rotas cliente/ não passam', async () => {
  const e = { ...env, LICENCAS: doFalso() };
  const como = (email) => ({ conferirLogin: loginFalso(email) });
  const eu = await atenderVendas(noPainel('/api/eu'), e, como(DONO));
  assert.equal((await eu.json()).papel, 'gerente');
  assert.equal((await atenderVendas(post('/api/gerar', { plano: 'anual' }, { 'X-Sistema': '' }), e, como(DONO))).status, 403);
  assert.equal((await atenderVendas(post('/api/gerar', { plano: 'anual' }, { Origin: 'https://outro.site' }), e, como(DONO))).status, 403);
  const g = await atenderVendas(post('/api/gerar', { plano: 'anual' }, { Origin: 'https://vendas.exemplo.com.br' }), e, como(DONO));
  assert.equal(g.status, 200);
  const { ficha } = await g.json();
  assert.equal(ficha.vendedor, DONO, 'quem gerou vem do login, não do pedido');
  assert.equal((await atenderVendas(post('/api/cliente/ativar', { chave: ficha.chave }), e, como(DONO))).status, 404);
  assert.equal((await atenderVendas(noPainel('/api/cliente/certificado'), e, como(DONO))).status, 404);
  assert.equal((await atenderVendas(noPainel('/api/lista'), e, como('estranho@exemplo.com.br'))).status, 403);
  const lista = await (await atenderVendas(noPainel('/api/lista?filtro=vence60'), e, como(DONO))).json();
  assert.equal(lista.chaves.length, 1);
  assert.equal((await atenderVendas(noPainel('/qualquer'), e, como(DONO))).status, 404);
  assert.equal((await pedirAoCofreDeLicencas({}, 'eu', { email: DONO })).status, 503, 'sem o binding LICENCAS');
});

test('worker: o endereço do painel vai para o painel (fechado sem o Access configurado); o resto segue igual', async () => {
  const e = { ...env, ACCESS_AUD_VENDAS: '', LICENCAS: doFalso() };
  const r = await worker.fetch(noPainel('/api/eu'), e, {});
  assert.equal(r.status, 503);
  const erro = (await r.json()).erro;
  assert.match(erro, /login ainda não foi configurado/);
  assert.doesNotMatch(erro, /ACCESS_/, 'a resposta pública não revela nomes de variáveis internas');
  const sistema = await worker.fetch(new Request('https://erp.exemplo.com.br/api/saude'), { HOST_VENDAS: 'vendas.exemplo.com.br' }, {});
  assert.equal(sistema.status, 503, 'o sistema continua pedindo o R2 e o login como antes');
});
