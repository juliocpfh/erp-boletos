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

// Pedido do dono de 22/11/2026: liga e desliga junto do certificado (Sistema → Empresas), fora da tela das regras.
test('assinatura digital fora da tela das regras: não aparece lá e salvar as regras não a desliga', async () => {
  const R = await import('../docs/js/regras.js');
  assert.ok(!CR.REGRAS_NA_TELA.some((x) => x.chave === 'assinatura_digital'), 'fora da tela das regras');
  assert.ok(!CR.buscarRegras('assinatura digital').includes('assinatura_digital'), 'nem na busca das regras');
  assert.equal(CR.REGRAS_NA_TELA.length, CR.DEFINICOES_REGRAS.length - 1, 'só ela saiu');
  const d = R.bancoVazio();
  R.mudarRegraSistema(d, 'assinatura_digital', true, 'teste');
  assert.equal(CR.regrasDe(d).assinatura_digital, true);
  // o formulário das regras manda só o que está na tela (sem a assinatura): ela continua ligada
  const daTela = Object.fromEntries(CR.REGRAS_NA_TELA.map((x) => [x.chave, CR.regrasDe(d)[x.chave]]));
  R.salvarRegrasSistema(d, { ...daTela, dias_ficha_parada: 3 }, 'teste');
  assert.equal(CR.regrasDe(d).assinatura_digital, true, 'continua ligada depois de salvar as regras');
  assert.equal(CR.regrasDe(d).dias_ficha_parada, 3, 'a regra mudada na tela foi salva');
  R.voltarRegrasAoPadrao(d, 'teste');
  assert.equal(CR.regrasDe(d).assinatura_digital, true, '"Voltar tudo ao padrão" das regras também não a desliga');
  R.mudarRegraSistema(d, 'assinatura_digital', false, 'teste');
  assert.equal(CR.regrasDe(d).assinatura_digital, false, 'desliga pelo botão');
  assert.ok(d.historico.some((h) => /Assinatura digital/.test(h.descricao)), 'fica no Histórico');
});

test('situação do certificado e aviso de renovação: 30 dias antes, no dia e depois de vencer', () => {
  const hoje = new Date(2026, 10, 22, 21, 30).getTime(); // 22/11/2026 às 21h30 daqui
  const pc = (validade) => ({ computador: 'PC DA ANK', certificado: { nome: 'ANK TESTE', cnpj: '11.222.333/0001-81', validade, instalado_em: '2026-11-22T20:00:00.000Z' } });
  assert.equal(AS.situacaoDoCertificado(undefined, hoje).anexado, null);
  assert.equal(AS.situacaoDoCertificado({ visto_em: 'x' }, hoje).anexado, null, 'programa antigo: não se sabe');
  assert.equal(AS.situacaoDoCertificado({ certificado: null, computador: 'PC' }, hoje).anexado, false);
  const longe = AS.situacaoDoCertificado(pc('2027-11-22'), hoje);
  assert.equal(longe.cor, 'ok');
  assert.equal(longe.aviso, '');
  assert.match(longe.texto, /Anexado: ANK TESTE, CNPJ 11\.222\.333\/0001-81, válido até 22\/11\/2027 \(faltam 365 dias\), no computador PC DA ANK, desde 22\/11\/2026/);
  assert.equal(AS.situacaoDoCertificado(pc('2026-12-23'), hoje).aviso, '', '31 dias: ainda sem aviso');
  assert.match(AS.situacaoDoCertificado(pc('2026-12-22'), hoje).aviso, /vence em 22\/12\/2026 \(faltam 30 dias\): renove/);
  assert.match(AS.situacaoDoCertificado(pc('2026-11-22'), hoje).texto, /vence hoje/);
  const vencido = AS.situacaoDoCertificado(pc('2026-11-21'), hoje);
  assert.equal(vencido.cor, 'perigo');
  assert.match(vencido.aviso, /venceu em 21\/11\/2026: os documentos não são mais assinados/);
});
