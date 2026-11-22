// Assinatura digital do lado do site (docs/js/assinatura.js, parte 3): a chave de cada documento na fila, o texto da situação,
// o aviso do Painel e o caminho até a nuvem (com um fetch de mentira). Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as AS from '../docs/js/assinatura.js';
import * as CR from '../docs/js/config-regras.js';

test('chave do documento na fila: o mesmo documento dá a mesma chave na página do recibo e no e-mail', () => {
  const c = { id: 12 }; const f = { id: 5 };
  assert.equal(AS.chaveDoRecibo('garantia', { contrato: c }), 'recibo:garantia:c12');
  assert.equal(AS.chaveDoRecibo('reserva', { ficha: f }), 'recibo:reserva:f5');
  assert.equal(AS.chaveDoRecibo('acordo', { contrato: c, acordo: 3, id: 3 }), 'recibo:acordo:c12:3');
  // a notificação: na página vem o id; no e-mail, o registro
  assert.equal(AS.chaveDoRecibo('notificacao', { contrato: c, id: 9 }), AS.chaveDoRecibo('notificacao', { contrato: c, notificacao: { id: 9 } }));
  assert.ok(AS.SEM_ASSINATURA_DA_EMPRESA.includes('ficha'), 'a ficha é da pessoa, não da empresa');
});

test('situação e aviso do Painel: PC parado há mais de 10 minutos pede para ligar; erro do PC aparece', () => {
  const agora = Date.parse('2026-12-05T13:00:00Z');
  const pc = { visto_em: '2026-12-05T12:59:00Z' };
  const pend = { id: 'a1', situacao: 'pendente', pedido_em: '2026-12-05T12:58:00Z' };
  assert.equal(AS.situacaoDoPedido(null, pc, agora).texto, 'Ainda não enviado para assinar.');
  assert.match(AS.situacaoDoPedido(pend, pc, agora).texto, /^Aguardando a assinatura do PC \(enviado em .*\)\.$/);
  assert.match(AS.situacaoDoPedido(pend, { visto_em: '2026-12-05T08:10:00Z' }, agora).texto, /não olha a fila desde .*: ligue o computador/);
  assert.match(AS.situacaoDoPedido(pend, null, agora).texto, /não olha a fila ainda/);
  assert.equal(AS.situacaoDoPedido({ situacao: 'assinado', assinado_em: '2026-12-05T13:32:00Z' }, pc, agora).cor, 'ok');
  assert.match(AS.situacaoDoPedido({ situacao: 'erro', erro: 'A senha do certificado não confere.' }, pc, agora).texto, /senha do certificado/);
  // Painel
  assert.deepEqual(AS.avisoDaFila({ pedidos: [pend], pc }, agora), [], 'PC olhando: sem aviso');
  assert.deepEqual(AS.avisoDaFila({ pedidos: [pend, { ...pend, id: 'a2' }, { ...pend, id: 'a3' }], pc: { visto_em: '2026-12-05T10:00:00Z' } }, agora),
    ['3 documentos estão na fila para assinatura digital: ligue o PC com o certificado.']);
  assert.match(AS.avisoDaFila({ pedidos: [{ situacao: 'erro', erro: 'Certificado vencido.' }], pc }, agora)[0], /1 documento não foi assinado pelo PC \(Certificado vencido\.\)/);
});

test('regra "assinatura digital": existe, começa desligada e explica a consequência e a lei', () => {
  const r = CR.DEFINICOES_REGRAS.find((x) => x.chave === 'assinatura_digital');
  assert.equal(r.padrao, false, 'desligada até instalar o certificado no PC');
  assert.match(r.lei, /2\.200-2/);
  assert.ok(r.consequencia && r.explica);
});

test('caminho até a nuvem: manda o PDF com a chave, lê a fila, baixa o assinado; erro da nuvem vira mensagem', async () => {
  const pedidos = [];
  const buscar = async (url, op = {}) => {
    pedidos.push({ url, metodo: op.method || 'GET', cab: op.headers || {} });
    if (op.method === 'POST') return new Response(JSON.stringify({ ok: true, pedido: { id: 'abc12345', situacao: 'pendente' } }), { headers: { 'content-type': 'application/json' } });
    if (url.endsWith('.pdf?assinado=1')) return new Response(new Uint8Array([37, 80, 68, 70]), { headers: { 'content-type': 'application/pdf' } });
    if (url.endsWith('assinaturas/zzzzzzzz')) return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ pedidos: [{ id: 'abc12345', chave: 'recibo:garantia:c12', situacao: 'assinado' }], pc: null }), { headers: { 'content-type': 'application/json' } });
  };
  AS.configurarAssinatura({ base: 'http://x/api/', buscar });
  const p = await AS.pedirAssinatura(new Blob(['%PDF-1.3']), { titulo: 'Recibo da garantia', chave: 'recibo:garantia:c12', nome: 'recibo.pdf', contrato: 12 });
  assert.equal(p.id, 'abc12345');
  assert.match(pedidos[0].url, /assinaturas\?titulo=Recibo\+da\+garantia&chave=recibo%3Agarantia%3Ac12&nome=recibo\.pdf&contrato=12$/);
  assert.equal(pedidos[0].cab['X-Sistema'], 'imoveis');
  const f = await AS.fila();
  assert.equal(AS.pedidoDe(f, 'recibo:garantia:c12').situacao, 'assinado');
  assert.equal((await AS.baixarAssinado('abc12345')).size, 4);
  await assert.rejects(() => AS.cancelarAssinatura('zzzzzzzz'), /Não consegui tirar da fila/);
  AS.configurarAssinatura({ base: 'api/', buscar: (...a) => fetch(...a) });
});
