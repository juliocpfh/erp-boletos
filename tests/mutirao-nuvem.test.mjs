// Mutirão de correções da nuvem (Worker, cofre e ficha pela internet): disputas entre pedidos ao mesmo tempo (link renovado,
// limite de arquivos e de envios, "só se novo"), corpo do pedido contado aos pedaços, mover em blocos, 304 dos anexos,
// lista dos links em blocos e índices do cofre criados também em cofre que já existia. Dados fictícios.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Cofre } from '../nuvem/cofre.mjs';
import * as FP from '../nuvem/ficha-publica.mjs';
import * as W from '../nuvem/worker.mjs';
import { r2Falso } from './r2-falso.mjs';

const ERP = 'http://localhost:8787';
const FICHA = 'https://ficha.ankjck.com.br';
const PASTA = 'arquivos/Fichas em analise/Maria Souza (ficha 14-11-2026)';
const FORMULARIO = [{ nome: 'inquilino_nome', rotulo: 'Nome completo', tipo: 'texto', obrig: true }];
const PDF = new TextEncoder().encode('%PDF-1.4 teste');
const REGISTRO = 'publico/fichas/7/interessado.json';

function ambiente() {
  const env = { MODO_TESTE: '1', EMAIL_TESTE: 'dono@exemplo.com.br', ORIGEM: ERP, URL_FICHA: `${FICHA}/`, HOST_FICHA: 'ficha.ankjck.com.br', DADOS: r2Falso() };
  const sistema = (metodo, caminho, corpo, cab = {}) => W.atender(new Request(`${ERP}/api/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : typeof corpo === 'string' || corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo),
    headers: { ...(metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: ERP } : {}), ...cab },
  }), env);
  const publico = (chave, metodo, caminho, corpo) => FP.atenderFicha(new Request(`${FICHA}/api/publico/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : typeof corpo === 'string' || corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo),
    headers: { 'X-Ficha-Token': chave, ...(metodo !== 'GET' ? { 'X-Ficha': '1', Origin: FICHA } : {}) },
  }), env);
  const criar = async (fichaId = 7) => {
    const r = await sistema('POST', 'ficha-online/link', { ficha_id: fichaId, pessoa: 'interessado', pasta: PASTA, formulario: FORMULARIO, valores: {}, contexto: { nome: `Pessoa ${fichaId}`, documentos: ['Holerite'] } });
    assert.equal(r.status, 200);
    return (await r.json()).url.split('#')[1];
  };
  const registro = () => JSON.parse(new TextDecoder().decode(env.DADOS.m.get(REGISTRO).dados));
  const mudar = async (fn) => { const r = registro(); fn(r); await env.DADOS.put(REGISTRO, JSON.stringify(r)); };
  const naPasta = () => [...env.DADOS.m.keys()].filter((k) => k.startsWith(`${PASTA}/`));
  return { env, sistema, publico, criar, registro, mudar, naPasta };
}

test('corpo do pedido: contado aos pedaços, para ao passar do máximo mesmo sem Content-Length', async () => {
  let enviados = 0; let cancelado = false;
  const fluxo = new ReadableStream({
    pull(c) { enviados += 1; c.enqueue(new Uint8Array(1024)); if (enviados > 500) c.close(); },
    cancel() { cancelado = true; },
  });
  const grande = new Request(`${ERP}/x`, { method: 'POST', body: fluxo, duplex: 'half' });
  assert.equal(grande.headers.get('Content-Length'), null);
  assert.equal(await FP.lerAteLimite(grande, 10 * 1024), null);
  assert.ok(cancelado, 'a leitura é cancelada');
  assert.ok(enviados < 20, `não lê o resto (leu ${enviados} pedaços)`);
  const certo = await FP.lerAteLimite(new Request(`${ERP}/x`, { method: 'POST', body: new Uint8Array([1, 2, 3]) }), 10);
  assert.deepEqual([...new Uint8Array(certo)], [1, 2, 3]);
  const mentiu = new Request(`${ERP}/x`, { method: 'POST', body: new Uint8Array(40).fill(7), headers: { 'Content-Length': '5' } });
  assert.equal(await FP.lerAteLimite(mentiu, 20), null, 'tamanho declarado menor que o real não passa');
  const curto = await FP.lerAteLimite(new Request(`${ERP}/x`, { method: 'POST', body: new Uint8Array(12).fill(7), headers: { 'Content-Length': '5' } }), 20);
  assert.equal(curto.byteLength, 12, 'dentro do máximo, vem inteiro mesmo com o tamanho declarado errado');
  assert.equal((await FP.lerAteLimite(new Request(`${ERP}/x`), 10)).byteLength, 0, 'pedido sem corpo');
  const ctx = ambiente();
  const r = await ctx.sistema('POST', 'mover', new Uint8Array(70 * 1024).fill(0x20));
  assert.equal(r.status, 400, 'pedido de mover grande demais é recusado (como antes: "Pedido inválido")');
});

test('anexo "só se novo": dois aparelhos com o mesmo nome ao mesmo tempo, um grava e o outro recebe 412', async () => {
  const ctx = ambiente();
  const [a, b] = await Promise.all(['um', 'dois'].map((t) => ctx.sistema('PUT', 'arquivos/Sala/contrato.pdf', t, { 'If-None-Match': '*' })));
  assert.deepEqual([a.status, b.status].sort(), [200, 412]);
  assert.equal(new TextDecoder().decode(ctx.env.DADOS.m.get('arquivos/Sala/contrato.pdf').dados), a.status === 200 ? 'um' : 'dois');
  assert.equal((await ctx.sistema('PUT', 'arquivos/Sala/contrato.pdf', 'tres')).status, 200, 'sem o cabeçalho, troca como antes');
  assert.equal(ctx.env.DADOS.m.get('arquivos/Sala/contrato.pdf').customMetadata.por, 'dono@exemplo.com.br');
});

test('anexo: nunca guardado no navegador (no-store); 304 se o pedido trouxer a etiqueta do mesmo arquivo', async () => {
  const ctx = ambiente();
  await ctx.sistema('PUT', 'arquivos/Sala/a.pdf', PDF);
  const r = await ctx.sistema('GET', 'arquivos/Sala/a.pdf');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Cache-Control'), 'private, no-store', 'documento pessoal não fica guardado no navegador');
  const etiqueta = r.headers.get('ETag');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), PDF);
  for (const se of [etiqueta, `W/${etiqueta}`, `"outra", ${etiqueta}`]) {
    const igual = await ctx.sistema('GET', 'arquivos/Sala/a.pdf', undefined, { 'If-None-Match': se });
    assert.equal(igual.status, 304, se);
    assert.equal(igual.headers.get('ETag'), etiqueta);
    assert.equal((await igual.arrayBuffer()).byteLength, 0);
  }
  await ctx.sistema('PUT', 'arquivos/Sala/a.pdf', 'trocado');
  const trocado = await ctx.sistema('GET', 'arquivos/Sala/a.pdf', undefined, { 'If-None-Match': etiqueta });
  assert.equal(trocado.status, 200, 'arquivo trocado: vem o novo');
  assert.equal(await trocado.text(), 'trocado');
  assert.equal((await ctx.sistema('GET', 'arquivos/Sala/nada.pdf', undefined, { 'If-None-Match': etiqueta })).status, 404);
});

test('mover: lista o destino uma vez, não pergunta arquivo por arquivo, e leva conteúdo e dados do arquivo', async () => {
  const ctx = ambiente();
  const R2 = ctx.env.DADOS;
  for (let n = 0; n < 7; n += 1) await R2.put(`arquivos/De/sub/f${n}.pdf`, `conteudo ${n}`, { customMetadata: { por: `p${n}` }, httpMetadata: { contentType: 'application/pdf' } });
  await R2.put('arquivos/Para/sub/f3.pdf', 'já estava');
  const chamadas = { head: 0, list: 0 }; let juntos = 0; let maximo = 0;
  const { head, list, get, put } = R2;
  R2.head = (...a) => { chamadas.head += 1; return head(...a); };
  R2.list = (...a) => { chamadas.list += 1; return list(...a); };
  R2.get = async (...a) => { juntos += 1; maximo = Math.max(maximo, juntos); return get(...a); };
  R2.put = async (...a) => { const r = await put(...a); juntos -= 1; return r; };
  const mover = (corpo) => ctx.sistema('POST', 'mover', corpo);
  assert.equal((await mover({ de: 'arquivos/De', para: 'arquivos/Para' })).status, 409, 'destino ocupado, sem juntar');
  assert.equal(R2.m.size, 8, 'nada mudou');
  chamadas.head = 0; chamadas.list = 0;
  const j = await (await mover({ de: 'arquivos/De', para: 'arquivos/Para', juntar: true })).json();
  assert.deepEqual([j.movidos, j.sobraram, j.mais], [6, ['sub/f3.pdf'], false]);
  assert.deepEqual(chamadas, { head: 1, list: 2 }, 'uma pergunta (é arquivo só?) e duas listagens (origem e destino)');
  assert.ok(maximo > 1 && maximo <= 3, `em blocos pequenos ao mesmo tempo (máximo ${maximo})`);
  assert.equal(new TextDecoder().decode(R2.m.get('arquivos/Para/sub/f5.pdf').dados), 'conteudo 5');
  assert.deepEqual(R2.m.get('arquivos/Para/sub/f5.pdf').customMetadata, { por: 'p5' });
  assert.deepEqual(R2.m.get('arquivos/Para/sub/f5.pdf').httpMetadata, { contentType: 'application/pdf' });
  assert.equal(new TextDecoder().decode(R2.m.get('arquivos/Para/sub/f3.pdf').dados), 'já estava');
  assert.deepEqual([...R2.m.keys()].filter((k) => k.startsWith('arquivos/De/')), ['arquivos/De/sub/f3.pdf'], 'o que sobrou fica na origem');
  // arquivo só: destino ocupado recusa; livre, move
  await R2.put('arquivos/x.pdf', 'x');
  assert.equal((await mover({ de: 'arquivos/x.pdf', para: 'arquivos/Para/sub/f3.pdf' })).status, 409);
  assert.equal((await (await mover({ de: 'arquivos/x.pdf', para: 'arquivos/y.pdf' })).json()).movidos, 1);
  assert.equal(new TextDecoder().decode(R2.m.get('arquivos/y.pdf').dados), 'x');
});

test('link renovado: o ponteiro antigo só sai depois do novo, e o que chegou no meio não se perde', async () => {
  const ctx = ambiente();
  const R2 = ctx.env.DADOS;
  const antiga = await ctx.criar();
  const hashAntigo = ctx.registro().hash;
  // no meio da renovação (depois de ler o registro, antes de gravar), a pessoa manda um documento pelo link antigo
  const { put } = R2; const ordem = []; let entrou = false;
  R2.put = async (chave, valor, op) => {
    if (chave === REGISTRO && !entrou) {
      entrou = true;
      assert.equal((await ctx.publico(antiga, 'PUT', 'ficha/arquivo?documento=Holerite&nome=h.pdf', PDF)).status, 200);
    }
    const r = await put(chave, valor, op);
    if (chave.startsWith('publico/')) ordem.push(`${r ? 'grava' : 'recusa'} ${chave === REGISTRO ? 'registro' : 'ponteiro'}`);
    return r;
  };
  const { delete: apagar } = R2;
  R2.delete = async (chaves) => { for (const k of [].concat(chaves)) if (k.startsWith('publico/tokens/')) ordem.push('apaga ponteiro antigo'); return apagar(chaves); };
  const nova = await ctx.criar();
  R2.put = put; R2.delete = apagar;
  assert.deepEqual(ordem, ['grava registro', 'recusa registro', 'grava registro', 'grava ponteiro', 'apaga ponteiro antigo']);
  const reg = ctx.registro();
  assert.equal(reg.arquivos.length, 1, 'o documento que chegou durante a renovação continua no registro');
  assert.equal(ctx.naPasta().length, 1);
  assert.notEqual(reg.hash, hashAntigo);
  assert.ok(!R2.m.has(`publico/tokens/${hashAntigo}`), 'ponteiro antigo apagado');
  assert.ok(R2.m.has(`publico/tokens/${reg.hash}`));
  assert.equal((await ctx.publico(antiga, 'GET', 'ficha')).status, 404, 'o link antigo não vale mais');
  assert.equal((await ctx.publico(nova, 'GET', 'ficha')).status, 200);
  assert.match(reg.eventos.at(-1).texto, /link renovado/);
  // dois links criados ao mesmo tempo para a mesma pessoa: sobra um registro inteiro, com o ponteiro certo
  const outro = ambiente();
  const [c1, c2] = await Promise.all([outro.criar(), outro.criar()]);
  const final = outro.registro();
  const validas = [];
  for (const c of [c1, c2]) if ((await outro.publico(c, 'GET', 'ficha')).status === 200) validas.push(c);
  assert.equal(validas.length, 1, 'só o último link vale');
  assert.equal(await FP.hashDaChave(validas[0]), final.hash);
  assert.deepEqual([...outro.env.DADOS.m.keys()].filter((k) => k.startsWith('publico/tokens/')), [`publico/tokens/${final.hash}`], 'sem ponteiro sobrando');
});

test('limite de arquivos do link: vale também para envios ao mesmo tempo, e quem perde não deixa arquivo solto', async () => {
  const ctx = ambiente();
  const chave = await ctx.criar();
  await ctx.mudar((r) => { r.arquivos = Array.from({ length: FP.MAX_ARQUIVOS - 1 }, (_, n) => ({ documento: 'Holerite', arquivo: `a${n}.pdf`, em: '2026-11-14T10:00:00.000Z', tamanho: 1, tipo: 'pdf' })); });
  const respostas = await Promise.all([1, 2, 3, 4].map((n) => ctx.publico(chave, 'PUT', `ficha/arquivo?documento=Holerite&nome=h${n}.pdf`, PDF)));
  assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 429, 429, 429]);
  assert.equal(ctx.registro().arquivos.length, FP.MAX_ARQUIVOS);
  assert.equal(ctx.naPasta().length, 1, 'só o arquivo aceito ficou na pasta da ficha');
  assert.equal(ctx.naPasta()[0].slice(PASTA.length + 1), ctx.registro().arquivos.at(-1).arquivo);
  assert.equal((await ctx.publico(chave, 'PUT', 'ficha/arquivo?documento=Holerite', PDF)).status, 429);
  assert.equal(ctx.naPasta().length, 1);
});

test('arquivo do link: registro que não aceita (disputa perdida 4 vezes) devolve 409 e apaga o arquivo', async () => {
  const ctx = ambiente();
  const R2 = ctx.env.DADOS;
  const chave = await ctx.criar();
  const { put } = R2;
  // outro pedido muda o registro toda vez, logo antes da gravação deste
  R2.put = async (k, valor, op) => {
    if (k === REGISTRO && op?.onlyIf) await put(REGISTRO, new TextDecoder().decode(R2.m.get(REGISTRO).dados));
    return put(k, valor, op);
  };
  const r = await ctx.publico(chave, 'PUT', 'ficha/arquivo?documento=Holerite&nome=h.pdf', PDF);
  R2.put = put;
  assert.equal(r.status, 409);
  assert.equal(ctx.naPasta().length, 0, 'sem arquivo órfão');
  assert.equal(ctx.registro().arquivos.length, 0);
  // dois arquivos do mesmo documento no mesmo dia nunca se sobrepõem
  const dois = await Promise.all([1, 2].map(() => ctx.publico(chave, 'PUT', 'ficha/arquivo?documento=Holerite&nome=h.pdf', PDF)));
  assert.deepEqual(dois.map((x) => x.status), [200, 200]);
  assert.equal(ctx.naPasta().length, 2);
  assert.deepEqual(ctx.registro().arquivos.map((a) => a.arquivo).sort(), ctx.naPasta().map((k) => k.slice(PASTA.length + 1)).sort());
});

test('limite de envios do link: vale também para envios ao mesmo tempo', async () => {
  const ctx = ambiente();
  const chave = await ctx.criar();
  await ctx.mudar((r) => { r.respostas = Array.from({ length: FP.MAX_ENVIOS - 1 }, () => ({ em: '2026-11-14T10:00:00.000Z', valores: { inquilino_nome: 'M' }, declaracao: true })); });
  const respostas = await Promise.all([1, 2, 3].map(() => ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'Maria' }, declaracao: true })));
  assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 429, 429]);
  assert.equal(ctx.registro().respostas.length, FP.MAX_ENVIOS);
});

test('lista dos links: lê em blocos ao mesmo tempo, na mesma ordem, e limpa os vencidos há mais de 90 dias', async () => {
  const ctx = ambiente();
  const R2 = ctx.env.DADOS;
  for (let n = 1; n <= 25; n += 1) await ctx.criar(n);
  const velho = JSON.parse(new TextDecoder().decode(R2.m.get('publico/fichas/13/interessado.json').dados));
  velho.vence_em = new Date(Date.now() - (FP.DIAS_GUARDA + 1) * 86400000).toISOString();
  await R2.put('publico/fichas/13/interessado.json', JSON.stringify(velho));
  await R2.put('publico/fichas/13/interessado.pdf', PDF);
  const { get } = R2; let juntos = 0; let maximo = 0;
  R2.get = async (...a) => { juntos += 1; maximo = Math.max(maximo, juntos); await new Promise((ok) => { setTimeout(ok, 1); }); juntos -= 1; return get(...a); };
  const r = await ctx.sistema('GET', 'ficha-online/lista');
  R2.get = get;
  assert.equal(r.status, 200);
  const { links } = await r.json();
  assert.equal(links.length, 24);
  assert.ok(maximo > 1 && maximo <= 10, `blocos de até 10 (máximo ${maximo})`);
  const esperada = Array.from({ length: 25 }, (_, n) => n + 1).filter((n) => n !== 13).sort((a, b) => String(a).localeCompare(String(b)));
  assert.deepEqual(links.map((l) => l.ficha_id), esperada, 'mesma ordem de antes (a da listagem)');
  assert.equal(links[0].nome, 'Pessoa 1');
  assert.equal(links[0].hash, undefined);
  assert.deepEqual([...R2.m.keys()].filter((k) => k.startsWith('publico/fichas/13/') || k === `publico/tokens/${velho.hash}`), [], 'registro, PDF e ponteiro do vencido saíram');
  const uma = await (await ctx.sistema('GET', 'ficha-online/lista?ficha=7')).json();
  assert.equal(uma.links.length, 1);
  assert.equal(uma.links[0].contexto.nome, 'Pessoa 7');
});

// ---------------------------------------------------------------------------
// Cofre
// ---------------------------------------------------------------------------
function sqlDe(db) {
  return {
    exec(q, ...p) {
      if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; }
      const linhas = db.prepare(q).all(...p).map((l) => ({ ...l }));
      return { toArray: () => linhas };
    },
  };
}
const transacaoDe = (db) => (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const DONO = 'dono@exemplo.com.br';
const indices = (db) => db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name IN ('registros_ordem', 'conflitos_abertos') ORDER BY name").all().map((l) => ({ ...l }));

test('cofre: os índices novos entram em cofre que já existia (sem repetir) e as consultas passam a usá-los', () => {
  const db = new DatabaseSync(':memory:');
  const c = new Cofre(sqlDe(db), transacaoDe(db), () => new Date('2026-11-15T10:00:00Z'));
  c.importar({ formato: 'imoveis-v1', usuarios: [{ id: 1, login: DONO, papel: 'admin', ativo: true }], contratos: [{ id: 20, valor: 100000 }] }, DONO);
  // cofre "antigo": como estava antes desta mudança, sem os dois índices
  db.exec('DROP INDEX registros_ordem; DROP INDEX conflitos_abertos;');
  assert.deepEqual(indices(db), []);
  const reaberto = new Cofre(sqlDe(db), transacaoDe(db), () => new Date('2026-11-15T10:00:00Z'));
  assert.deepEqual(indices(db).map((i) => i.name), ['conflitos_abertos', 'registros_ordem']);
  assert.match(indices(db)[0].sql, /WHERE resolvido_em IS NULL/);
  new Cofre(sqlDe(db), transacaoDe(db)); // abrir de novo não dá erro nem duplica
  assert.equal(indices(db).length, 2);
  assert.deepEqual(reaberto.tudo().contratos, [{ id: 20, valor: 100000 }], 'os dados continuam lá');
  const plano = (q, ...p) => db.prepare(`EXPLAIN QUERY PLAN ${q}`).all(...p).map((l) => l.detail).join(' | ');
  assert.match(plano('SELECT MAX(ordem) AS m FROM registros'), /registros_ordem/);
  assert.match(plano('SELECT tabela, id, dados FROM registros ORDER BY ordem'), /registros_ordem/);
  assert.match(plano("SELECT id FROM conflitos WHERE resolvido_em IS NULL AND tipo = 'campo' AND tabela = ? AND reg_id = ? AND campo = ?", 'contratos', '20', 'valor'), /conflitos_abertos/);
});

test('cofre: registros novos seguem em ordem, com a maior ordem lida uma vez por lote (e relida depois de lote desfeito)', () => {
  const db = new DatabaseSync(':memory:');
  const sql = sqlDe(db); let leituras = 0;
  const contando = { exec(q, ...p) { if (/MAX\(ordem\)/.test(q)) leituras += 1; return sql.exec(q, ...p); } };
  const c = new Cofre(contando, transacaoDe(db), () => new Date('2026-11-15T10:00:00Z'));
  c.importar({ formato: 'imoveis-v1', usuarios: [{ id: 1, login: DONO, papel: 'admin', ativo: true }], contratos: [{ id: 20, valor: 100000 }, { id: 21, valor: 1 }] }, DONO);
  const inserir = (id) => ({ op: 'inserir', tabela: 'contratos', id, dados: { id, valor: id * 100 } });
  c.aplicar({ id: 'pc-lote-0001', ops: [30, 31, 32, 33].map(inserir) }, DONO);
  assert.equal(leituras, 1, 'uma leitura da maior ordem para o lote inteiro');
  assert.throws(() => c.aplicar({ id: 'pc-lote-0002', ops: [inserir(40), inserir(41), { op: 'inserir', tabela: 'contratos', id: 30, dados: { id: 30, valor: 9 } }] }, DONO), (e) => e.status === 409);
  c.aplicar({ id: 'pc-lote-0003', ops: [inserir(25), inserir(50)] }, DONO);
  const ordens = db.prepare("SELECT id, ordem FROM registros WHERE tabela = 'contratos' ORDER BY ordem").all().map((l) => [l.id, l.ordem]);
  assert.deepEqual(ordens.map((o) => o[0]), [20, 21, 30, 31, 32, 33, 25, 50], 'na ordem em que entraram');
  const numeros = ordens.map((o) => o[1]);
  assert.equal(new Set(numeros).size, numeros.length, 'sem ordem repetida');
  assert.equal(numeros.at(-1) - numeros.at(-3), 2, 'o lote desfeito não deixou buraco nem número velho');
  assert.deepEqual(c.tudo().contratos.map((x) => x.id), [20, 21, 30, 31, 32, 33, 25, 50]);
});
