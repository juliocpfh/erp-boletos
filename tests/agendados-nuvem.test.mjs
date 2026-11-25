// E-mails agendados na nuvem (nuvem/agendados.mjs): rotas do Worker (/api/email/agendar, agendados, mudar, cancelar), a rodada
// do cron (rodarAgendados) com o cofre de verdade (node:sqlite) e o registro em envios_email com a data de Brasília.
// Relógio parado (mock de Date) e Gmail simulado ou de mentira; dados fictícios, nada vai ao Google.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as AG from '../nuvem/agendados.mjs';
import { CofreDO } from '../nuvem/cofre.mjs';
import * as G from '../nuvem/gmail.mjs';
import * as W from '../nuvem/worker.mjs';
import { r2Falso } from './r2-falso.mjs';

const BASE = 'http://localhost:8787';
const AGORA = '2026-11-24T20:00:00.000Z'; // 17h de 24/11 em Brasília (fora do horário: o site agenda)
const SEGREDOS = { GMAIL_CLIENT_ID: 'id-teste', GMAIL_CLIENT_SECRET: 'segredo-teste', GMAIL_REFRESH_TOKEN: 'refresh-teste', GMAIL_REMETENTE: 'administracao@exemplo.com.br' };
const respostaJson = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });
const calado = () => {};

function montar() {
  W.esquecerPapeis();
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const r2 = r2Falso();
  const dobj = new CofreDO({ storage: { sql, transactionSync: tx } }, { DADOS: r2 });
  const usuario = (id, email, papel) => ({ id, login: email, email, nome: `Pessoa ${id}`, papel, ativo: true });
  dobj.cofre.importar({ formato: 'imoveis-v1', imoveis: [], envios_email: [], usuarios: [usuario(1, 'dono@exemplo.com.br', 'admin'), usuario(2, 'operador@exemplo.com.br', 'operador'), usuario(3, 'leitor@exemplo.com.br', 'consulta')] }, 'dono@exemplo.com.br');
  const env = { ORIGEM: BASE, MODO_TESTE: '1', SIMULAR_GMAIL: '1', DADOS: r2, COFRE: { idFromName: (n) => n, get: () => ({ fetch: (req) => dobj.fetch(req) }) } };
  const pedir = (metodo, caminho, corpo, email = 'operador@exemplo.com.br') => W.atender(new Request(`${BASE}/api/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    headers: metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: BASE, 'Content-Type': 'application/json' } : {},
  }), { ...env, EMAIL_TESTE: email });
  const agendar = async (quando, extra = {}, email) => {
    const r = await pedir('POST', 'email/agendar', { para: ['inquilino@exemplo.com.br'], assunto: 'Boleto de dezembro', texto: 'Segue o boleto.', quando, descricao: 'Boleto 12/2026',
      registro: { contrato_id: 7, chave: 'boleto_envio', para: 'inquilino@exemplo.com.br', assunto: 'Boleto de dezembro', usuario: 'Operador' }, ...extra }, email);
    return { status: r.status, corpo: await r.json() };
  };
  const lista = async (email) => (await (await pedir('GET', 'email/agendados', undefined, email)).json()).agendados;
  const envios = () => dobj.cofre.q("SELECT dados FROM registros WHERE tabela = 'envios_email' ORDER BY id").map((l) => JSON.parse(l.dados));
  const rodar = (agora, op = {}) => AG.rodarAgendados(env, { agora: new Date(agora), simular: true, registrar: calado, ...op });
  return { dobj, r2, env, pedir, agendar, lista, envios, rodar };
}

/** Relógio parado em AGORA (só o Date: os timers continuam de verdade). */
function pararRelogio(t) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(AGORA) });
  t.after(() => t.mock.timers.reset());
}

test('agendar pela rota do Worker: guarda o e-mail montado no R2 e a linha no cofre; a lista mostra', async (t) => {
  pararRelogio(t);
  const n = montar();
  const { status, corpo } = await n.agendar('2026-11-25T00:20:00.000Z');
  assert.equal(status, 200, JSON.stringify(corpo));
  assert.match(corpo.id, /^[0-9a-f]{32}$/);
  assert.equal(corpo.quando, '2026-11-25T00:20:00.000Z');
  const guardado = JSON.parse(await (await n.r2.get(`${AG.PASTA}${corpo.id}.json`)).text());
  assert.deepEqual(guardado.para, ['inquilino@exemplo.com.br']);
  assert.equal(guardado.assunto, 'Boleto de dezembro');
  const l = await n.lista('leitor@exemplo.com.br'); // a consulta vê a lista
  assert.equal(l.length, 1);
  assert.equal(l[0].situacao, 'agendado');
  assert.equal(l[0].por, 'operador@exemplo.com.br');
  assert.equal(l[0].contrato_id, 7);
  assert.equal(l[0].descricao, 'Boleto 12/2026');
  assert.ok(!JSON.stringify(n.dobj.cofre.tudo()).includes(corpo.id), 'os agendados não vão para o banco (JSON)');
});

test('papel consulta não agenda; hora no passado, longe demais ou sem e-mail válido é recusada', async (t) => {
  pararRelogio(t);
  const n = montar();
  assert.equal((await n.agendar('2026-11-25T00:20:00.000Z', {}, 'leitor@exemplo.com.br')).status, 403);
  const passado = await n.agendar('2026-11-24T19:00:00.000Z');
  assert.equal(passado.status, 400);
  assert.match(passado.corpo.erro, /já passou/);
  assert.equal((await n.agendar('2027-03-01T12:00:00.000Z')).status, 400, 'mais de 60 dias');
  assert.equal((await n.agendar('amanhã')).status, 400);
  assert.equal((await n.agendar('2026-11-25T00:20:00.000Z', { para: ['nao-e-email'] })).status, 400);
  assert.equal((await n.agendar('2026-11-25T00:20:00.000Z', { registro: [1] })).status, 400);
  assert.equal(n.r2.m.size, 0, 'nada ficou no R2');
  assert.equal((await n.lista()).length, 0);
  // sem o cabeçalho do sistema, nem mudar nem cancelar
  const sem = await W.atender(new Request(`${BASE}/api/email/agendados/cancelar`, { method: 'POST', body: '{}' }), { ...n.env, EMAIL_TESTE: 'operador@exemplo.com.br' });
  assert.equal(sem.status, 403);
});

test('cron: manda só o vencido, grava em envios_email com a data de Brasília e não repete', async (t) => {
  pararRelogio(t);
  const n = montar();
  const a = (await n.agendar('2026-11-25T00:20:00.000Z')).corpo.id; // 21h20 de 24/11 em Brasília
  const b = (await n.agendar('2026-11-25T11:00:00.000Z')).corpo.id; // 8h de 25/11
  const feito = await n.rodar('2026-11-25T00:30:00.000Z'); // 21h30 de 24/11 em Brasília
  assert.deepEqual(feito, { enviados: 1, falhas: 0, de_novo: 0 });
  const [e] = n.envios();
  assert.equal(n.envios().length, 1);
  assert.equal(e.data, '2026-11-24', 'data de Brasília do envio de verdade (UTC já é 25/11)');
  assert.equal(e.como, 'enviado');
  assert.equal(e.agendado_id, a);
  assert.equal(e.agendado_para, '2026-11-25T00:20:00.000Z');
  assert.equal(e.enviado_em, '2026-11-25T00:30:00.000Z');
  assert.match(e.gmail_id, /^simulado-/);
  assert.equal(e.contrato_id, 7);
  assert.equal(e.chave, 'boleto_envio');
  assert.equal(e.usuario, undefined, 'o usuário vai para o histórico, não para o registro');
  const h = n.dobj.cofre.q('SELECT dados FROM historico').map((l) => JSON.parse(l.dados)).find((x) => x.tabela === 'envios_email');
  assert.equal(h.usuario, 'Operador');
  assert.equal(h.registro_id, e.id);
  assert.equal(h.contrato_id, 7);
  // o montado saiu do R2; o futuro continua lá
  assert.equal(await n.r2.get(`${AG.PASTA}${a}.json`), null);
  assert.ok(await n.r2.get(`${AG.PASTA}${b}.json`));
  const l = await n.lista();
  assert.equal(l.find((x) => x.id === a).situacao, 'enviado');
  assert.equal(l.find((x) => x.id === a).registro_id, e.id);
  assert.equal(l.find((x) => x.id === b).situacao, 'agendado');
  // de novo na mesma hora (o cron rodou duas vezes): nada sai, nada repete
  assert.deepEqual(await n.rodar('2026-11-25T00:30:00.000Z'), { enviados: 0, falhas: 0, de_novo: 0 });
  assert.equal(n.envios().length, 1);
  // resultado repetido do mesmo envio (o Worker caiu antes da resposta) é ignorado
  assert.equal(n.dobj.agendados.resultado({ id: a, ok: true, gmail_id: 'x' }).ignorado, true);
  // na hora do segundo, sai o segundo
  assert.equal((await n.rodar('2026-11-25T11:05:00.000Z')).enviados, 1);
  assert.equal(n.envios().length, 2);
  assert.equal(n.envios()[1].data, '2026-11-25');
});

test('cancelar apaga do R2 e some dos vencidos; mudar a hora vale na rodada', async (t) => {
  pararRelogio(t);
  const n = montar();
  const a = (await n.agendar('2026-11-25T00:20:00.000Z')).corpo.id;
  const b = (await n.agendar('2026-11-25T00:25:00.000Z')).corpo.id;
  const c = await n.pedir('POST', 'email/agendados/cancelar', { id: a });
  assert.equal(c.status, 200);
  const cc = await c.json();
  assert.equal(cc.agendado.situacao, 'cancelado');
  assert.equal(cc.registro.contrato_id, 7, 'devolve o registro para o site desfazer o que marcou');
  assert.equal(await n.r2.get(`${AG.PASTA}${a}.json`), null);
  assert.equal((await n.pedir('POST', 'email/agendados/cancelar', { id: a })).status, 200, 'cancelar de novo não dá erro');
  assert.equal((await n.pedir('POST', 'email/agendados/cancelar', { id: a }, 'leitor@exemplo.com.br')).status, 403, 'consulta não cancela');
  // mudar: o b passa para as 8h do dia seguinte
  assert.equal((await n.pedir('POST', 'email/agendados/mudar', { id: b, quando: '2026-11-24T10:00:00.000Z' })).status, 400, 'hora que já passou');
  assert.equal((await n.pedir('POST', 'email/agendados/mudar', { id: b, quando: '2026-11-25T11:00:00.000Z' }, 'leitor@exemplo.com.br')).status, 403);
  const m = await n.pedir('POST', 'email/agendados/mudar', { id: b, quando: '2026-11-25T11:00:00.000Z' });
  assert.equal(m.status, 200);
  assert.equal((await m.json()).agendado.quando, '2026-11-25T11:00:00.000Z');
  assert.equal((await n.pedir('POST', 'email/agendados/mudar', { id: a, quando: '2026-11-25T11:00:00.000Z' })).status, 409, 'cancelado não muda');
  assert.equal((await n.pedir('POST', 'email/agendados/mudar', { id: 'f'.repeat(32), quando: '2026-11-25T11:00:00.000Z' })).status, 404);
  assert.deepEqual(await n.rodar('2026-11-25T00:30:00.000Z'), { enviados: 0, falhas: 0, de_novo: 0 }, 'nem o cancelado nem o mudado saem');
  assert.equal(n.envios().length, 0);
  assert.equal((await n.rodar('2026-11-25T11:00:00.000Z')).enviados, 1);
  assert.equal(n.envios().length, 1);
  assert.equal((await n.pedir('POST', 'email/agendados/cancelar', { id: b })).status, 409, 'já enviado não cancela');
});

test('falha do Gmail: autorização vencida fica "falhou" com o motivo; "Tentar de novo" (mudar) volta a agendar', async (t) => {
  pararRelogio(t);
  const n = montar();
  const a = (await n.agendar('2026-11-25T00:20:00.000Z')).corpo.id;
  Object.assign(n.env, SEGREDOS);
  G.esquecerToken();
  const pedidos = [];
  const buscar = async (url) => { pedidos.push(String(url)); return respostaJson(400, { error: 'invalid_grant' }); };
  assert.deepEqual(await n.rodar('2026-11-25T00:30:00.000Z', { simular: false, buscar }), { enviados: 0, falhas: 1, de_novo: 0 });
  assert.ok(pedidos[0].startsWith('https://oauth2.googleapis.com/token'));
  const [l] = await n.lista();
  assert.equal(l.situacao, 'falhou');
  assert.match(l.erro, /autorização do Gmail venceu/);
  assert.equal(n.envios().length, 0);
  assert.ok(await n.r2.get(`${AG.PASTA}${a}.json`), 'o e-mail montado fica para tentar de novo');
  assert.deepEqual(await n.rodar('2026-11-25T00:35:00.000Z', { simular: false, buscar }), { enviados: 0, falhas: 0, de_novo: 0 }, 'falhou não sai sozinho');
  const m = await (await n.pedir('POST', 'email/agendados/mudar', { id: a, quando: '2026-11-25T11:00:00.000Z' })).json();
  assert.equal(m.agendado.situacao, 'agendado');
  assert.equal(m.agendado.erro, null, 'o motivo da falha antiga sai');
  assert.equal(m.agendado.tentativas, 0);
  assert.equal((await n.rodar('2026-11-25T11:00:00.000Z')).enviados, 1);
});

test('Gmail fora do ar (502): tenta de novo 10 minutos depois, até 3 vezes, e então fica "falhou"', async (t) => {
  pararRelogio(t);
  const n = montar();
  (await n.agendar('2026-11-25T00:20:00.000Z'));
  Object.assign(n.env, SEGREDOS);
  G.esquecerToken();
  const buscar = async (url) => (String(url).startsWith('https://oauth2.googleapis.com/token') ? respostaJson(200, { access_token: 'acesso', expires_in: 3599 }) : respostaJson(503, { error: { message: 'fora' } }));
  const op = { simular: false, buscar };
  assert.deepEqual(await n.rodar('2026-11-25T00:30:00.000Z', op), { enviados: 0, falhas: 0, de_novo: 1 });
  let [l] = await n.lista();
  assert.equal(l.situacao, 'agendado');
  assert.equal(l.quando, '2026-11-25T00:40:00.000Z');
  assert.equal(l.tentativas, 1);
  assert.match(l.erro, /Gmail está com problema/);
  assert.equal((await n.rodar('2026-11-25T00:35:00.000Z', op)).de_novo, 0, 'antes dos 10 minutos não tenta');
  assert.equal((await n.rodar('2026-11-25T00:40:00.000Z', op)).de_novo, 1);
  assert.deepEqual(await n.rodar('2026-11-25T00:50:00.000Z', op), { enviados: 0, falhas: 1, de_novo: 0 }, 'terceira tentativa: desiste');
  [l] = await n.lista();
  assert.equal(l.situacao, 'falhou');
  assert.equal(l.tentativas, 3);
  assert.equal(n.envios().length, 0);
});

test('"enviando" preso há mais de 15 minutos vira falha e não é mandado de novo', async (t) => {
  pararRelogio(t);
  const n = montar();
  const a = (await n.agendar('2026-11-25T00:20:00.000Z')).corpo.id;
  const v = n.dobj.agendados.vencidos(new Date('2026-11-25T00:30:00.000Z')); // o Worker caiu depois de pegar
  assert.deepEqual(v.vencidos.map((x) => x.id), [a]);
  assert.deepEqual(await n.rodar('2026-11-25T00:40:00.000Z'), { enviados: 0, falhas: 0, de_novo: 0 }, 'ainda dentro dos 15 minutos');
  assert.equal((await n.lista())[0].situacao, 'enviando');
  await n.rodar('2026-11-25T00:46:00.000Z');
  const [l] = await n.lista();
  assert.equal(l.situacao, 'falhou');
  assert.equal(l.erro, AG.ERRO_PRESO);
  assert.equal(n.envios().length, 0);
});

test('as rotas internas do cron não passam pelo Worker', async (t) => {
  pararRelogio(t);
  const n = montar();
  for (const rota of ['dados/agendados/vencidos', 'dados/agendados/resultado', 'agendados/vencidos']) {
    const r = await n.pedir('POST', rota, { agora: '2026-11-25T00:30:00.000Z' }, 'dono@exemplo.com.br');
    assert.ok([403, 404, 405].includes(r.status), `${rota}: ${r.status}`);
  }
});
