// Mutirão de correções, lado do site (sincronia e funcionamento sem internet): número da NF quando a resposta da nuvem se perde,
// limite de tempo do banco inteiro, fila de anexos dividida entre abas, anexo reenviado que já tinha chegado e a cópia aberta
// baixando vários arquivos de cada vez. O aplicativo instalável (sw.js) está em tests/sw.test.mjs. Dados fictícios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as CA from '../docs/js/copia-aberta.js';
import * as N from '../docs/js/nuvem.js';
import { AnexosNuvem } from '../docs/js/pasta-nuvem.js';
import * as R from '../docs/js/regras.js';
import * as K from '../nuvem/cofre.mjs';
import { atender } from '../nuvem/worker.mjs';
import { PastaDisco } from './pasta-disco.mjs';
import { r2Falso } from './r2-falso.mjs';

function novoCofreDO() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  return new K.CofreDO({ storage: { sql, transactionSync: tx } }, { DADOS: r2Falso() });
}

const DONO = 'dono@exemplo.com.br'; const SOCIA = 'socia@exemplo.com.br';

/**
 * Um aparelho com a API indo direto ao cofre. `ap.falha(metodo, rota)` decide o que acontece com cada pedido:
 * 'perde' = a nuvem recebe e grava, mas a resposta não chega (status em `ap.statusDaPerda`); 'cai' = o pedido nem chega.
 */
function aparelho(cofre, email) {
  const guardado = new Map();
  const ap = { email, guardado, idas: [], falha: () => null, statusDaPerda: 0 };
  ap.api = async (metodo, rota, corpo) => {
    const nome = `${metodo} ${rota.split('?')[0]}`;
    ap.idas.push(nome);
    const falha = ap.falha(metodo, rota.split('?')[0]);
    if (falha === 'cai') throw new N.ErroNuvem('Sem internet.', 0);
    const r = await cofre.fetch(new Request(`https://cofre/${rota}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: { 'X-Email-Conferido': email } }));
    const dados = await r.json();
    if (falha === 'perde') throw new N.ErroNuvem(ap.statusDaPerda ? 'Erro na nuvem.' : 'A nuvem demorou demais para responder. Tente de novo.', ap.statusDaPerda);
    if (!r.ok) throw new N.ErroNuvem(dados.erro, r.status, dados);
    return dados;
  };
  ap.guardar = { ler: async (k) => structuredClone(guardado.get(k)), gravar: async (k, v) => { guardado.set(k, structuredClone(v)); } };
  ap.sinc = new N.Sincronia({ api: ap.api, guardar: ap.guardar });
  ap.sinc.esperaReenvio = 0;
  return ap;
}

async function cenario() {
  const cofre = novoCofreDO();
  const d = R.bancoVazio();
  R.inserir(d, 'usuarios', { login: DONO, nome: 'Dono', papel: 'admin', ativo: true }, 'teste');
  R.inserir(d, 'usuarios', { login: 'socia', email: SOCIA, nome: 'Sócia', papel: 'admin', ativo: true }, 'teste');
  R.inserir(d, 'imoveis', { nome: 'Apto 604', cep: '80010-000' }, 'teste');
  d.proxima_fatura = 157;
  const a = aparelho(cofre, DONO); const b = aparelho(cofre, SOCIA);
  assert.equal(await a.sinc.iniciar(), null);
  await a.sinc.importar(d);
  await b.sinc.iniciar();
  return { cofre, a, b };
}

/** Emite uma NF: usa o número, anda o contador e cria um registro (como a NF de verdade, que entra numa tabela). */
const emitirNF = (quem) => (d) => {
  const n = d.proxima_fatura; d.proxima_fatura = n + 1;
  R.inserir(d, 'imoveis', { nome: `NF ${n}`, cep: '80010-000' }, quem);
  return n;
};
const nfs = (s) => s.atual().imoveis.filter((i) => i.nome.startsWith('NF ')).map((i) => i.nome);
const lotes = (ap) => ap.idas.filter((x) => x === 'POST lote').length;

test('NF: a nuvem gravou mas a resposta se perdeu: o mesmo lote é reenviado, a nuvem reconhece e a NF sai uma vez só', async () => {
  const { a, b } = await cenario();
  let perdas = 1;
  a.falha = (m, rota) => (m === 'POST' && rota === 'lote' && perdas-- > 0 ? 'perde' : null);
  a.idas.length = 0;
  assert.equal(await a.sinc.alterar(emitirNF(DONO)), 157);
  assert.equal(lotes(a), 2, 'o 1º envio perdeu a resposta; o 2º (mesmo lote) foi reconhecido como repetido');
  assert.equal(a.sinc.atual().proxima_fatura, 158);
  assert.deepEqual(nfs(a.sinc), ['NF 157']);
  assert.equal(a.sinc.pendentesQtd(), 0);
  await b.sinc.sincronizar();
  assert.deepEqual(nfs(b.sinc), ['NF 157'], 'no outro aparelho também uma só');
  assert.equal(await b.sinc.alterar(emitirNF(SOCIA)), 158, 'e a próxima segue a numeração');
});

test('NF: nenhuma resposta chega (erro 503 em todos os envios), mas a nuvem gravou: conferindo o que mudou, segue sem erro e sem repetir', async () => {
  const { a, b } = await cenario();
  a.statusDaPerda = 503;
  a.falha = (m, rota) => (m === 'POST' && rota === 'lote' ? 'perde' : null);
  a.idas.length = 0;
  assert.equal(await a.sinc.alterar(emitirNF(DONO)), 157);
  assert.equal(lotes(a), 1 + N.REENVIOS_CONTADOR);
  assert.equal(a.sinc.atual().proxima_fatura, 158);
  assert.deepEqual(nfs(a.sinc), ['NF 157']);
  await b.sinc.sincronizar();
  assert.deepEqual(nfs(b.sinc), ['NF 157']);
  assert.equal(b.sinc.atual().proxima_fatura, 158);
});

test('NF: o pedido nunca chegou à nuvem: avisa para conferir, nada fica gravado nem na fila, e repetir depois dá o mesmo número uma vez só', async () => {
  const { a, b } = await cenario();
  a.falha = (m, rota) => (m === 'POST' && rota === 'lote' ? 'cai' : null);
  await assert.rejects(a.sinc.alterar(emitirNF(DONO)), (e) => /confira na lista de NFs/.test(e.message) && e.extra?.incerto === true && e.esperado === true);
  assert.equal(a.sinc.atual().proxima_fatura, 157, 'a tela mostra o que está na nuvem');
  assert.deepEqual(nfs(a.sinc), []);
  assert.equal(a.sinc.pendentesQtd(), 0, 'a NF nunca vai pela fila');
  a.falha = () => null;
  assert.equal(await a.sinc.alterar(emitirNF(DONO)), 157);
  await b.sinc.sincronizar();
  assert.deepEqual(nfs(b.sinc), ['NF 157']);
});

test('NF: a nuvem gravou, a resposta se perdeu e a internet caiu de vez: avisa para conferir; quando a internet volta a NF aparece, uma só', async () => {
  const { a, b } = await cenario();
  let enviou = false;
  a.falha = (m, rota) => { if (m === 'POST' && rota === 'lote') { enviou = true; return 'perde'; } return enviou && m === 'GET' ? 'cai' : null; };
  await assert.rejects(a.sinc.alterar(emitirNF(DONO)), /confira na lista de NFs/);
  assert.equal(a.sinc.pendentesQtd(), 0);
  a.falha = () => null;
  await a.sinc.sincronizar();
  assert.deepEqual(nfs(a.sinc), ['NF 157'], 'conferindo, a NF está lá: não é para emitir de novo');
  assert.equal(a.sinc.atual().proxima_fatura, 158);
  await b.sinc.sincronizar();
  assert.deepEqual(nfs(b.sinc), ['NF 157']);
});

test('NF: gravada e confirmada, mas a internet cai antes de buscar a base nova: a tela já mostra a NF e nada duplica quando volta', async () => {
  const { a, b } = await cenario();
  let gravou = false;
  a.falha = (m, rota) => { if (m === 'POST' && rota === 'lote') { gravou = true; return null; } return gravou && m === 'GET' ? 'cai' : null; };
  assert.equal(await a.sinc.alterar(emitirNF(DONO)), 157);
  assert.equal(a.sinc.atual().proxima_fatura, 158, 'a tela não volta ao número antigo');
  assert.deepEqual(nfs(a.sinc), ['NF 157']);
  assert.ok(a.sinc.pendentesQtd() > 0, 'o lote fica na fila só até a base nova chegar');
  a.falha = () => null;
  await a.sinc.sincronizar();
  assert.equal(a.sinc.pendentesQtd(), 0);
  assert.equal(a.sinc.recusas.length, 0, 'a nuvem reconheceu o lote repetido');
  await b.sinc.sincronizar();
  assert.deepEqual(nfs(b.sinc), ['NF 157']);
  assert.equal(b.sinc.atual().proxima_fatura, 158);
  assert.equal(b.sinc.atual().historico.filter((h) => JSON.stringify(h).includes('NF 157')).length, 1, 'uma entrada só no histórico');
});

test('NF: outro aparelho usou o número enquanto a resposta se perdia: o reenvio é recusado e a NF sai com o número seguinte', async () => {
  const { a, b } = await cenario();
  // o 1º envio de `a` nem chega; antes do reenvio, `b` emite a 157
  let primeira = true;
  a.falha = (m, rota) => { if (m === 'POST' && rota === 'lote' && primeira) { primeira = false; return 'cai'; } return null; };
  const apiReal = a.sinc.api; let bEmitiu = false;
  a.sinc.api = async (m, rota, corpo) => {
    if (m === 'POST' && rota === 'lote' && !primeira && !bEmitiu) { bEmitiu = true; assert.equal(await b.sinc.alterar(emitirNF(SOCIA)), 157); }
    return apiReal(m, rota, corpo);
  };
  assert.equal(await a.sinc.alterar(emitirNF(DONO)), 158);
  await b.sinc.sincronizar();
  assert.deepEqual(nfs(b.sinc).sort(), ['NF 157', 'NF 158']);
  assert.equal(b.sinc.atual().proxima_fatura, 159);
});

test('limite de tempo: baixar o banco inteiro e a carga têm mais tempo que os outros pedidos (a carga, conforme o tamanho)', async () => {
  assert.equal(N.limiteDoPedido('GET', 'mudancas?desde=3'), N.TEMPO_LIMITE);
  assert.equal(N.limiteDoPedido('POST', 'lote', 5000000), N.TEMPO_LIMITE, 'o lote (e a NF) continuam com o limite curto');
  assert.equal(N.limiteDoPedido('GET', 'tudo'), 120000);
  assert.equal(N.limiteDoPedido('POST', 'importar', 0), 120000);
  assert.equal(N.limiteDoPedido('POST', 'importar', 5000000), 320000, '5 MB: 120 s + 1 s a cada 25 KB');
  assert.equal(N.limiteDoPedido('POST', 'importar', 500000000), N.TEMPO_LIMITE_MAXIMO, 'até 10 minutos');
  // apiDoSite usa esse limite: com 20 ms de limite comum, `mudancas` desiste e `tudo` (80 ms) espera a resposta de 50 ms
  const lento = (url, op) => new Promise((ok, erro) => {
    const t = setTimeout(() => ok(new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } })), 50);
    op.signal?.addEventListener('abort', () => { clearTimeout(t); erro(op.signal.reason); });
  });
  const api = N.apiDoSite('api/dados/', { limite: 20, buscar: lento });
  const vivo = setInterval(() => {}, 1000);
  try {
    await assert.rejects(api('GET', 'mudancas?desde=0'), /demorou/);
    assert.deepEqual(await api('GET', 'tudo'), { ok: true });
    assert.deepEqual(await api('POST', 'importar', { dados: {} }), { ok: true });
  } finally { clearInterval(vivo); }
});

// ---------------------------------------------------------------------------
// Anexos: fila dividida entre abas e reenvio do que já tinha chegado
// ---------------------------------------------------------------------------
const BASE = 'http://localhost:8787/api/';
function navegador() {
  const R2 = r2Falso();
  const env = { MODO_TESTE: '1', ORIGEM: 'http://localhost:8787', DADOS: R2 };
  const estado = { internet: true, perderResposta: 0, idas: [] };
  const buscar = async (url, op = {}) => {
    if (!estado.internet) throw new TypeError('Failed to fetch');
    estado.idas.push(`${op.method || 'GET'} ${decodeURIComponent(new URL(url).pathname)}`);
    const r = await atender(new Request(url, { ...op, headers: { Origin: 'http://localhost:8787', ...op.headers } }), env);
    if (op.method === 'PUT' && estado.perderResposta > 0) { estado.perderResposta -= 1; throw new TypeError('Failed to fetch'); }
    return r;
  };
  const guardado = new Map();
  const guardar = { ler: async (k) => guardado.get(k), gravar: async (k, v) => { guardado.set(k, v); }, apagar: async (k) => { guardado.delete(k); } };
  // a trava entre abas: uma de cada vez
  let vez = Promise.resolve(); let dentro = 0; let maximo = 0;
  const trava = (fn) => { const r = vez.then(async () => { dentro += 1; maximo = Math.max(maximo, dentro); try { return await fn(); } finally { dentro -= 1; } }); vez = r.catch(() => {}); return r; };
  const aba = () => new AnexosNuvem({ base: BASE, buscar, guardar, trava });
  return { R2, estado, guardado, aba, maximoNaTrava: () => maximo };
}
const noR2 = async (R2, chave) => (await R2.get(chave))?.text();

test('anexos sem internet em duas abas: a fila do aparelho é relida antes de cada mudança, uma aba não apaga o anexo da outra', async () => {
  const nav = navegador();
  const a = nav.aba(); const b = nav.aba();
  await a.carregarFila(); await b.carregarFila(); // as duas abertas, fila vazia na memória das duas
  nav.estado.internet = false;
  await a.gravar(['arquivos', 'Apto 604', 'contrato.pdf'], new Blob(['DA ABA A']));
  await b.gravar(['arquivos', 'Apto 604', 'vistoria.pdf'], new Blob(['DA ABA B'])); // antes: gravava a fila só com o dela
  assert.deepEqual(nav.guardado.get('fila-anexos').map((f) => f.partes.at(-1)), ['contrato.pdf', 'vistoria.pdf']);
  // mover a pasta numa aba leva os dois; apagar um numa aba não some com o outro
  await a.gravar(['arquivos', 'Apto 604', 'rascunho.pdf'], new Blob(['X']));
  nav.estado.internet = true;
  await b.apagar(['arquivos', 'Apto 604', 'rascunho.pdf']);
  assert.deepEqual(nav.guardado.get('fila-anexos').map((f) => f.partes.at(-1)), ['contrato.pdf', 'vistoria.pdf']);
  assert.ok(![...nav.guardado.keys()].some((k) => k.startsWith('anexo:') && nav.guardado.get(k).size === 1), 'o arquivo apagado saiu do aparelho');
  // as duas abas enviam ao mesmo tempo: cada arquivo chega uma vez, sem cópia "(deste aparelho)" e sem aviso
  await Promise.all([a.enviarFila(), b.enviarFila()]);
  assert.equal(await noR2(nav.R2, 'arquivos/Apto 604/contrato.pdf'), 'DA ABA A');
  assert.equal(await noR2(nav.R2, 'arquivos/Apto 604/vistoria.pdf'), 'DA ABA B');
  assert.deepEqual([...nav.R2.m.keys()].filter((k) => k.includes('deste aparelho')), []);
  assert.deepEqual([...a.avisos, ...b.avisos], []);
  assert.deepEqual(nav.guardado.get('fila-anexos'), []);
  assert.ok(![...nav.guardado.keys()].some((k) => k.startsWith('anexo:')), 'nada sobrou guardado no aparelho');
  assert.equal(nav.maximoNaTrava(), 1, 'uma aba de cada vez mexe na fila');
});

test('anexo da fila que já tinha chegado (a resposta se perdeu): no reenvio é reconhecido como o mesmo arquivo, sem duplicar nem avisar', async () => {
  const nav = navegador();
  const a = nav.aba();
  nav.estado.internet = false;
  await a.gravar(['arquivos', 'Apto 604', 'recibo.pdf'], new Blob(['RECIBO']));
  nav.estado.internet = true; nav.estado.perderResposta = 1;
  await a.enviarFila(); // chega à nuvem, mas a resposta se perde: continua na fila
  assert.equal(await a.pendentes(), 1);
  assert.equal(await noR2(nav.R2, 'arquivos/Apto 604/recibo.pdf'), 'RECIBO');
  await a.enviarFila(); // 412 (já existe): é o mesmo arquivo
  assert.equal(await a.pendentes(), 0);
  assert.deepEqual([...nav.R2.m.keys()], ['arquivos/Apto 604/recibo.pdf']);
  assert.deepEqual(a.avisos, []);
  // mesmo nome e mesmo tamanho, conteúdo diferente (outro aparelho): aí sobe com outro nome e avisa, como antes
  nav.estado.internet = false;
  await a.gravar(['arquivos', 'Apto 604', 'guia.pdf'], new Blob(['DESTE!']));
  await nav.R2.put('arquivos/Apto 604/guia.pdf', 'OUTRO!');
  nav.estado.internet = true;
  await a.enviarFila();
  assert.equal(await noR2(nav.R2, 'arquivos/Apto 604/guia.pdf'), 'OUTRO!');
  assert.equal(await noR2(nav.R2, 'arquivos/Apto 604/guia (deste aparelho).pdf'), 'DESTE!');
  assert.match(a.avisos[0], /deste aparelho/);
});

test('anexo da fila: a internet cai na conferência do arquivo que já existe: continua na fila, sem cópia', async () => {
  const nav = navegador();
  const a = nav.aba();
  nav.estado.internet = false;
  await a.gravar(['arquivos', 'Apto 604', 'recibo.pdf'], new Blob(['RECIBO']));
  await nav.R2.put('arquivos/Apto 604/recibo.pdf', 'RECIBO');
  nav.estado.internet = true;
  const buscar = a.buscar;
  a.buscar = async (url, op = {}) => { if ((op.method || 'GET') === 'GET') throw new TypeError('Failed to fetch'); return buscar(url, op); };
  await a.enviarFila();
  assert.equal(await a.pendentes(), 1);
  assert.deepEqual([...nav.R2.m.keys()], ['arquivos/Apto 604/recibo.pdf']);
  a.buscar = buscar;
  await a.enviarFila();
  assert.equal(await a.pendentes(), 0);
  assert.deepEqual(a.avisos, []);
});

// ---------------------------------------------------------------------------
// Cópia aberta: vários arquivos de cada vez
// ---------------------------------------------------------------------------
test('cópia aberta: baixa até 5 arquivos ao mesmo tempo, todos chegam, o registro é salvo a cada 50 e o que falha fica para depois', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'copia-paralela-')); const dir = new PastaDisco(raiz);
  const nuvem = Array.from({ length: 130 }, (_, i) => ({ caminho: `Casa ${i % 7}/Inquilinos/doc ${i}.pdf`, tamanho: String(i).length, alterado: '1' }));
  let juntos = 0; let maximo = 0; const andamento = []; const registros = [];
  const ler = async (c) => {
    juntos += 1; maximo = Math.max(maximo, juntos);
    await new Promise((ok) => setTimeout(ok, 2));
    juntos -= 1;
    if (c.endsWith('doc 77.pdf')) throw new Error('caiu');
    return new Blob([c.match(/doc (\d+)/)[1]]);
  };
  const aoAndar = ({ feitos, total }) => {
    andamento.push(feitos); assert.equal(total, 130);
    if (feitos % 50 === 1 && feitos > 1) registros.push(Object.keys(JSON.parse(fs.readFileSync(path.join(raiz, CA.ARQUIVO_COPIA), 'utf8')).arquivos).length);
  };
  const r = await CA.atualizarCopia(dir, { listar: async () => nuvem, ler, aoAndar });
  assert.deepEqual(r, { baixados: 129, apagados: 0, falhas: 1, total: 129 });
  assert.equal(maximo, 5, 'cinco de cada vez');
  assert.deepEqual(andamento, Array.from({ length: 130 }, (_, i) => i + 1), 'o andamento conta um a um');
  assert.equal(registros.length, 2, 'registro salvo aos 50 e aos 100');
  assert.ok(registros[0] >= 49 && registros[1] >= 99);
  assert.equal(fs.readFileSync(path.join(raiz, CA.PASTA_COPIA, 'Casa 3', 'Inquilinos', 'doc 129.pdf'), 'utf8'), '129');
  const reg = JSON.parse(fs.readFileSync(path.join(raiz, CA.ARQUIVO_COPIA), 'utf8'));
  assert.equal(Object.keys(reg.arquivos).length, 129);
  assert.equal(reg.falhas, 1);
  assert.ok(!('Casa 0/Inquilinos/doc 77.pdf' in reg.arquivos), 'o que falhou não entra no registro');
  // na vez seguinte só o que faltou
  const pedidos = [];
  const r2 = await CA.atualizarCopia(dir, { listar: async () => nuvem, ler: async (c) => { pedidos.push(c); return new Blob(['77']); } });
  assert.deepEqual(pedidos, ['Casa 0/Inquilinos/doc 77.pdf']);
  assert.deepEqual(r2, { baixados: 1, apagados: 0, falhas: 0, total: 130 });
});
