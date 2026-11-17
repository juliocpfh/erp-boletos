// Mutirão da ponte do C6 (modo simulado, nada vai ao banco): nova tentativa só nas consultas, extrato guardado para os
// comprovantes, avisos lidos só do dia pedido em diante, limpeza diária, um token por vez, conexões por conta e o tempo de
// espera do site nas consultas demoradas. Dados fictícios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as P from '../ponte-c6/servidor.mjs';
import { comNovasTentativas, PAUSAS_MS, STATUS_PASSAGEIROS } from '../ponte-c6/c6-tentativas.mjs';
import { extrato } from '../ponte-c6/c6-extrato.mjs';
import { listarPagos } from '../ponte-c6/c6-boletos-listar.mjs';
import { rotasFase2 } from '../ponte-c6/rotas-fase2.mjs';
import { c6SimuladoDaConta } from '../ponte-c6/c6-simulado.mjs';
import * as B from '../docs/js/banco.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mutirao-ponte-'));
test.after(() => { P.trocarTransporteParaTeste(null); fs.rmSync(tmp, { recursive: true, force: true }); });

const tempoEsgotado = () => Object.assign(new Error('O banco não respondeu a tempo.'), { code: 'TEMPO_ESGOTADO' });

/** C6 simulado que, antes de responder de verdade, devolve (ou lança) o que estiver na fila `antes`; conta as chamadas. */
function c6ComFalhas(conta, antes = []) {
  const real = c6SimuladoDaConta(conta);
  const c6 = { conta, pausas: [0, 0], chamadas: [], async chamar(metodo, caminho, opcoes) {
    c6.chamadas.push(`${metodo} ${caminho}`);
    const f = antes.shift();
    if (f instanceof Error) throw f;
    return f || real.chamar(metodo, caminho, opcoes);
  } };
  return c6;
}

// ---------------------------------------------------------------- item 3: nova tentativa só em consulta
test('nova tentativa: só GET, até 2 vezes, pausas de 1 s e 3 s, para 429/502/503/504 e tempo esgotado', async () => {
  assert.deepEqual(PAUSAS_MS, [1000, 3000]);
  assert.deepEqual(STATUS_PASSAGEIROS, [429, 502, 503, 504]);
  const pausas = [];
  const esperar = async (ms) => { pausas.push(ms); };
  const fila = (...respostas) => { let n = 0; const f = async () => { const r = respostas[Math.min(n, respostas.length - 1)]; n += 1; if (r instanceof Error) throw r; return r; }; f.vezes = () => n; return f; };

  // GET: 503, 429 e depois 200 → três chamadas, pausas de 1 s e 3 s
  let f = fila({ status: 503 }, { status: 429 }, { status: 200, corpo: 'ok' });
  assert.deepEqual(await comNovasTentativas('GET', f, { esperar }), { status: 200, corpo: 'ok' });
  assert.equal(f.vezes(), 3);
  assert.deepEqual(pausas, [1000, 3000]);

  // GET sempre 504 → para na 3ª chamada e devolve a resposta ruim como veio
  f = fila({ status: 504 });
  assert.equal((await comNovasTentativas('GET', f, { esperar })).status, 504);
  assert.equal(f.vezes(), 3);

  // GET com 400, 404 ou 500: não é passageiro, não repete
  for (const status of [400, 401, 404, 500]) { f = fila({ status }); assert.equal((await comNovasTentativas('GET', f, { esperar })).status, status); assert.equal(f.vezes(), 1); }

  // emissão, alteração, baixa e pagamento NUNCA se repetem, nem com 503 nem com tempo esgotado
  for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    f = fila({ status: 503 });
    assert.equal((await comNovasTentativas(metodo, f, { esperar })).status, 503);
    assert.equal(f.vezes(), 1, `${metodo} não repete`);
    f = fila(tempoEsgotado());
    await assert.rejects(comNovasTentativas(metodo, f, { esperar }), /não respondeu a tempo/);
    assert.equal(f.vezes(), 1, `${metodo} não repete no tempo esgotado`);
  }

  // GET com tempo esgotado: tenta de novo; se esgotar, o erro sai marcado e uma camada de fora não repete tudo
  f = fila(tempoEsgotado(), { status: 200 });
  assert.equal((await comNovasTentativas('GET', f, { esperar })).status, 200);
  assert.equal(f.vezes(), 2);
  f = fila(tempoEsgotado());
  const fora = fila();
  const deFora = async () => { fora.n = (fora.n || 0) + 1; return comNovasTentativas('GET', f, { esperar }); };
  await assert.rejects(comNovasTentativas('GET', deFora, { esperar }), (e) => e.tentativasEsgotadas === true && e.status === 504);
  assert.equal(f.vezes(), 3);
  assert.equal(fora.n, 1);

  // erro que não é de tempo (ex.: defeito) sai na hora
  f = fila(new TypeError('defeito'));
  await assert.rejects(comNovasTentativas('GET', f, { esperar }), TypeError);
  assert.equal(f.vezes(), 1);
});

test('extrato e lista de boletos pagos: o banco ocupado nas primeiras chamadas não derruba a consulta', async () => {
  const limpo = await extrato(c6SimuladoDaConta('ank'), { de: '2026-11-01', ate: '2026-11-30' });
  const c6 = c6ComFalhas('ank', [{ status: 503, corpo: { title: 'ocupado' } }, tempoEsgotado()]);
  const r = await extrato(c6, { de: '2026-11-01', ate: '2026-11-30' });
  assert.equal(r.lancamentos.length, limpo.lancamentos.length);
  assert.ok(r.lancamentos.length > 0);
  assert.equal(c6.chamadas.length, 3); // duas falhas e a que deu certo

  // três falhas seguidas: desiste com o erro do banco (uma janela = 3 chamadas, não mais)
  const ruim = c6ComFalhas('ank', [{ status: 503, corpo: {} }, { status: 503, corpo: {} }, { status: 503, corpo: {} }]);
  await assert.rejects(extrato(ruim, { de: '2026-11-01', ate: '2026-11-30' }), /O banco respondeu 503/);
  assert.equal(ruim.chamadas.length, 3);

  const pagosLimpo = await listarPagos(c6SimuladoDaConta('ank'), { de: '2026-11-01', ate: '2026-11-30' });
  const c6b = c6ComFalhas('ank', [{ status: 429, corpo: {} }, { status: 502, corpo: {} }]);
  const pagos = await listarPagos(c6b, { de: '2026-11-01', ate: '2026-11-30' });
  assert.deepEqual(pagos.map((b) => b.id), pagosLimpo.map((b) => b.id));
  assert.ok(c6b.chamadas.length >= 3 && c6b.chamadas.every((c) => c.startsWith('GET ')));
});

test('chamarC6: consulta repete com o banco ocupado; emissão e baixa não repetem; dois pedidos juntos pedem um token só', async () => {
  const cfg = { software: { nome: 'teste', versao: '0' }, pastaRegistros: '', pausas_tentativas: [0, 0] };
  const conta = { id: 'mutirao', ambiente: 'sandbox', url_base: 'https://banco.invalid', client_id: 'x', client_secret: 'y' };
  const chamadas = [];
  let respostas = [];
  P.trocarTransporteParaTeste(async (url, { metodo = 'GET' } = {}) => {
    const caminho = new URL(url).pathname;
    chamadas.push(`${metodo} ${caminho}`);
    if (caminho.startsWith('/v1/auth')) { await new Promise((ok) => setTimeout(ok, 20)); return { status: 200, tipo: 'application/json', dados: { access_token: `tk${chamadas.length}`, expires_in: 300, scope: '' } }; }
    const r = respostas.shift() || { status: 200, dados: { ok: true } };
    if (r instanceof Error) throw r;
    return { tipo: 'application/json', ...r };
  });
  const contar = (trecho) => chamadas.filter((c) => c.startsWith(trecho)).length;

  // item 5: dois pedidos simultâneos, sem token guardado → um POST /auth só, o mesmo token para os dois
  const [a, b] = await Promise.all([P.obterToken(conta, false, cfg), P.obterToken(conta, false, cfg)]);
  assert.equal(a, b);
  assert.equal(contar('POST /v1/auth'), 1);
  assert.equal(await P.obterToken(conta, false, cfg), a); // ainda vale: não pede outro
  assert.equal(contar('POST /v1/auth'), 1);

  // consulta: 503, tempo esgotado e então 200
  respostas = [{ status: 503, dados: {} }, tempoEsgotado(), { status: 200, dados: { id: 'B1' } }];
  assert.equal((await P.chamarC6(cfg, conta, 'GET', '/v2/bank_slips/B1')).dados.id, 'B1');
  assert.equal(contar('GET /v2/bank_slips/B1'), 3);

  // consulta que nunca responde: 3 tentativas e um erro claro (504), não "erro interno"
  respostas = [tempoEsgotado(), tempoEsgotado(), tempoEsgotado()];
  await assert.rejects(P.chamarC6(cfg, conta, 'GET', '/v2/bank_slips/B2'), (e) => e instanceof P.ErroHttp && e.status === 504);
  assert.equal(contar('GET /v2/bank_slips/B2'), 3);

  // emissão com o banco ocupado: UMA chamada, erro para o usuário decidir (nunca repete sozinha)
  respostas = [{ status: 503, dados: {} }];
  await assert.rejects(P.chamarC6(cfg, conta, 'POST', '/v2/bank_slips', { amount: 1 }), /O banco respondeu 503/);
  assert.equal(contar('POST /v2/bank_slips'), 1);
  // emissão sem resposta a tempo: uma chamada só
  respostas = [tempoEsgotado()];
  await assert.rejects(P.chamarC6(cfg, conta, 'POST', '/v2/bank_slips', { amount: 1 }), /não respondeu a tempo/);
  assert.equal(contar('POST /v2/bank_slips'), 2);
  // baixa (PUT) e alteração (PATCH): idem
  respostas = [{ status: 504, dados: {} }, { status: 502, dados: {} }];
  await assert.rejects(P.chamarC6(cfg, conta, 'PUT', '/v2/bank_slips/B1/cancel'), /504/);
  await assert.rejects(P.chamarC6(cfg, conta, 'PATCH', '/v2/bank_slips/B1', { amount: 2 }), /502/);
  assert.equal(contar('PUT /v2/bank_slips/B1/cancel'), 1);
  assert.equal(contar('PATCH /v2/bank_slips/B1'), 1);

  // token recusado (401) em dois pedidos ao mesmo tempo: os dois refazem com UM token novo
  const antes = contar('POST /v1/auth');
  respostas = [{ status: 401, dados: {} }, { status: 401, dados: {} }];
  await Promise.all([P.chamarC6(cfg, conta, 'GET', '/v2/bank_slips/B3'), P.chamarC6(cfg, conta, 'GET', '/v2/bank_slips/B4')]);
  assert.equal(contar('POST /v1/auth'), antes + 1);
  P.trocarTransporteParaTeste(null);
});

// ---------------------------------------------------------------- item 4: extrato guardado para os comprovantes
test('comprovantes: vários do mesmo dia usam uma consulta só ao extrato; a guarda vence e o que não está nela é buscado de novo', async () => {
  let agora = 1000000;
  const c6 = c6ComFalhas('ank');
  const rotas = rotasFase2({ c6DaConta: (id) => (id === 'ank' ? c6 : null), relogio: () => agora });
  const pedir = async (url) => {
    const [caminho, qs = ''] = url.split('?');
    const rota = rotas.find((r) => r.metodo === 'GET' && r.caminho.test(caminho));
    const params = rota.caminho.exec(caminho).groups;
    return rota.handler({ url, method: 'GET' }, { conta: params.conta, params, query: Object.fromEntries(new URLSearchParams(qs)) });
  };
  const lanc = (await extrato(c6SimuladoDaConta('ank'), { de: '2026-11-01', ate: '2026-11-30' })).lancamentos;
  const doDia = lanc.filter((l) => l.entry_date === lanc[0].entry_date);
  const dia = doDia[0].entry_date;

  // 5 comprovantes do mesmo dia (repetindo os lançamentos do dia) → 1 consulta ao banco
  for (let i = 0; i < 5; i += 1) {
    const r = await pedir(`/contas/ank/comprovante/${doDia[i % doDia.length].reference}?data=${dia}&formato=json`);
    assert.equal(r.status, 200);
    assert.ok(r.corpo.pdf_base64.length > 100);
  }
  assert.equal(c6.chamadas.length, 1);
  // pedidos ao mesmo tempo também dividem a mesma consulta
  agora += 200000;
  const juntos = await Promise.all([1, 2, 3].map(() => pedir(`/contas/ank/comprovante/${doDia[0].reference}?data=${dia}&formato=json`)));
  assert.deepEqual(juntos.map((r) => r.status), [200, 200, 200]);
  assert.equal(c6.chamadas.length, 2); // a guarda anterior venceu (200 s depois): uma consulta nova, e só uma

  // referência que não está no extrato guardado: confere no banco de novo antes de dizer que não achou
  const nao = await pedir(`/contas/ank/comprovante/nao-existe?data=${dia}`);
  assert.equal(nao.status, 404);
  assert.equal(c6.chamadas.length, 3);

  // a rota /extrato não usa a guarda: sempre vai ao banco
  await pedir(`/contas/ank/extrato?de=${dia}&ate=${dia}`);
  await pedir(`/contas/ank/extrato?de=${dia}&ate=${dia}`);
  assert.equal(c6.chamadas.length, 5);

  // erro do banco não fica guardado: o comprovante seguinte tenta de novo e dá certo
  agora += 200000;
  const c6ruim = c6ComFalhas('ank', [{ status: 500, corpo: {} }]);
  const rotasRuim = rotasFase2({ c6DaConta: () => c6ruim, relogio: () => agora });
  const rotaC = rotasRuim.find((r) => r.padrao.endsWith('/comprovante/:reference'));
  const pedirRuim = () => rotaC.handler({ url: `/contas/ank/comprovante/${doDia[0].reference}`, method: 'GET' }, { conta: 'ank', query: { data: dia, formato: 'json' } });
  assert.equal((await pedirRuim()).status, 502);
  assert.equal((await pedirRuim()).status, 200);
});

// ---------------------------------------------------------------- item 5: avisos e limpeza
test('avisos do banco: com "desde", só os arquivos do dia em diante são abertos; conta de nome parecido não se mistura', async () => {
  const pasta = path.join(tmp, 'notificacoes');
  fs.mkdirSync(pasta, { recursive: true });
  const linha = (quando, ref) => `${JSON.stringify({ recebida_em: quando, conta: 'ank', external_reference_id: ref, status: 'PAID', reconsultar: true })}\n`;
  fs.writeFileSync(path.join(pasta, 'ank-2026-11-01.jsonl'), linha('2026-11-01T10:00:00.000Z', 'A1'));
  fs.writeFileSync(path.join(pasta, 'ank-2026-11-03.jsonl'), linha('2026-11-03T09:00:00.000Z', 'A3') + linha('2026-11-03T15:00:00.000Z', 'A3B'));
  fs.writeFileSync(path.join(pasta, 'ank-2026-11-05.jsonl'), linha('2026-11-05T08:00:00.000Z', 'A5'));
  fs.writeFileSync(path.join(pasta, 'ank.jsonl'), linha('2026-01-01T08:00:00.000Z', 'ANTIGO')); // arquivo antigo, sem data no nome
  fs.writeFileSync(path.join(pasta, 'ank-2-2026-11-05.jsonl'), linha('2026-11-05T08:00:00.000Z', 'OUTRA')); // conta "ank-2"
  const cfg = { pastaNotificacoes: pasta };
  const refs = (lista) => lista.map((n) => n.external_reference_id);

  assert.deepEqual(refs(P.lerNotificacoes(cfg, 'ank')), ['A1', 'A3', 'A3B', 'A5', 'ANTIGO']);
  assert.deepEqual(refs(P.lerNotificacoes(cfg, 'ank-2')), ['OUTRA']);
  assert.deepEqual(refs(P.lerNotificacoes(cfg, 'ank', '2026-11-03')), ['A3', 'A3B', 'A5', 'ANTIGO']);
  assert.deepEqual(refs(P.lerNotificacoes(cfg, 'ank', '2026-11-03T12:00:00.000Z')), ['A3', 'A3B', 'A5', 'ANTIGO']); // a hora quem filtra é a rota
  assert.deepEqual(refs(P.lerNotificacoes(cfg, 'ank', 'qualquer coisa')), ['A1', 'A3', 'A3B', 'A5', 'ANTIGO']);

  // prova de que o arquivo de antes do "desde" nem é aberto: no lugar dele há uma pasta (abrir daria erro)
  fs.rmSync(path.join(pasta, 'ank-2026-11-01.jsonl'));
  fs.mkdirSync(path.join(pasta, 'ank-2026-11-01.jsonl'));
  assert.deepEqual(refs(P.lerNotificacoes(cfg, 'ank', '2026-11-04')), ['A5', 'ANTIGO']);
  assert.throws(() => P.lerNotificacoes(cfg, 'ank'));
  fs.rmSync(path.join(pasta, 'ank-2026-11-01.jsonl'), { recursive: true });

  // pela rota da ponte (modo simulado): desde com hora filtra dentro do dia
  const env = { CONTAS: 'ank,jck', SIMULADO: '1', PONTE_SENHA: 'frase-longa-de-teste-com-mais-de-20', PASTA_CONTAS: path.join(tmp, 'contas'), PASTA_NOTIFICACOES: pasta, PASTA_REGISTROS: path.join(tmp, 'registros') };
  const servidor = P.criarServidor(P.carregarConfig(env));
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  try {
    const r = await fetch(`http://127.0.0.1:${servidor.address().port}/contas/ank/notificacoes?desde=${encodeURIComponent('2026-11-03T12:00:00.000Z')}`, { headers: { 'X-Senha-Ponte': env.PONTE_SENHA } });
    assert.equal(r.status, 200);
    assert.deepEqual(refs((await r.json()).notificacoes), ['A3B', 'A5']);
  } finally { servidor.close(); }
});

test('limpeza dos registros antigos repete sozinha (uma vez por dia) sem segurar a ponte aberta', async () => {
  const pasta = path.join(tmp, 'registros-limpeza');
  fs.mkdirSync(pasta, { recursive: true });
  const cfg = { pastaRegistros: pasta, pastaNotificacoes: '', retencao_registros_dias: 30 };
  const relogio = P.agendarLimpeza(cfg, 15);
  try {
    assert.equal(relogio.hasRef(), false);
    // o arquivo velho aparece DEPOIS de a ponte subir: só a limpeza repetida o apaga
    fs.writeFileSync(path.join(pasta, '2020-01-01.jsonl'), '{}\n');
    fs.writeFileSync(path.join(pasta, `${new Date().toISOString().slice(0, 10)}.jsonl`), '{}\n');
    for (let i = 0; i < 100 && fs.existsSync(path.join(pasta, '2020-01-01.jsonl')); i += 1) await new Promise((ok) => setTimeout(ok, 20));
    assert.deepEqual(fs.readdirSync(pasta), [`${new Date().toISOString().slice(0, 10)}.jsonl`]);
  } finally { clearInterval(relogio); }
});

// ---------------------------------------------------------------- item 1: conexões por conta
test('conexões com o banco: um par de agentes por conta, guardado; refeito quando o certificado muda', () => {
  const cert = path.join(tmp, 'certificado.crt');
  const chave = path.join(tmp, 'chave.key');
  fs.writeFileSync(cert, 'certificado de mentira 1');
  fs.writeFileSync(chave, 'chave de mentira');
  const conta = { id: 'agentes', certificado: cert, chave, senha_chave: '' };
  const a = P.agentesDaConta(conta);
  assert.equal(a.consultas.options.keepAlive, true); // consulta reaproveita a conexão
  assert.equal(a.escritas.options.keepAlive, false); // emissão/baixa/pagamento: uma conexão por chamada
  assert.equal(String(a.consultas.options.cert), 'certificado de mentira 1');
  assert.equal(P.agentesDaConta(conta), a); // guardado: não relê os arquivos nem cria outro
  // outra conta tem os seus
  assert.notEqual(P.agentesDaConta({ ...conta, id: 'agentes2' }), a);
  // certificado renovado (data do arquivo mudou): agentes novos, com o certificado novo
  fs.writeFileSync(cert, 'certificado de mentira 2');
  fs.utimesSync(cert, new Date(), new Date(Date.now() + 5000));
  const b = P.agentesDaConta(conta);
  assert.notEqual(b, a);
  assert.equal(String(b.consultas.options.cert), 'certificado de mentira 2');
  assert.equal(P.agentesDaConta(conta), b);
  b.consultas.destroy(); b.escritas.destroy();
});

// ---------------------------------------------------------------- item 2: tempo de espera do site
test('site: extrato, comprovante e listas de boletos esperam 5 minutos pela ponte; o resto, 30 s', async () => {
  const longo = B.TEMPO_LIMITE_LONGO_MS;
  assert.equal(longo, 300000);
  for (const c of ['/extrato?de=2026-01-01&ate=2026-12-31', 'extrato', '/boletos/pagos?de=2026-11-01&ate=2026-11-30&por=payment_date', '/boletos?due_date_from=2026-11-01&due_date_to=2026-11-30', '/boletos', '/comprovante/01ABC?data=2026-11-03&formato=json']) {
    assert.equal(B.tempoLimiteDaRota('GET', c), longo, c);
  }
  // emissão e alteração: 90 s (a ponte espera o token, a conferência de repetição e o banco, 25 s cada)
  for (const c of ['/boletos', '/boletos/B0001/alterar']) assert.equal(B.tempoLimiteDaRota('POST', c), 90000, `POST ${c}`);
  for (const [m, c] of [['GET', '/boletos/B0001'], ['GET', '/boletos/B0001/pdf'], ['POST', '/boletos/B0001/cancelar'], ['GET', '/saldo'], ['GET', '/saude'], ['GET', '/dda'], ['POST', '/pagamentos/decodificar'], ['GET', '/pagamentos/G1/itens'], ['GET', '/notificacoes?desde=2026-11-01']]) {
    assert.equal(B.tempoLimiteDaRota(m, c), 30000, `${m} ${c}`);
  }
});
