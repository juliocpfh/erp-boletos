// Ponte do C6 em modo simulado: sobe numa porta livre, confere /saude, senha, CORS, emissão, consulta, listagem, alteração,
// pagamento fictício, negativação, cancelamento, webhook e o roteiro. Não fala com o banco. Dados fictícios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as P from '../ponte-c6/servidor.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-c6-'));
const env = { CONTAS: 'ank,jck', SIMULADO: '1', PONTE_SENHA: 'segredo', ORIGENS: 'http://localhost:8000,*', PASTA_CONTAS: path.join(tmp, 'contas'),
  PASTA_NOTIFICACOES: path.join(tmp, 'notificacoes'), PASTA_REGISTROS: path.join(tmp, 'registros') };
const cfg = P.carregarConfig(env);
const servidor = P.criarServidor(cfg);
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${servidor.address().port}`;
test.after(() => { servidor.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const chamar = async (metodo, caminho, corpo = null, cabecalhos = {}) => {
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers: { 'X-Senha-Ponte': 'segredo', Origin: 'http://localhost:8000', ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...cabecalhos }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, cors: r.headers.get('access-control-allow-origin'), dados: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};

const REF = 'B00000007ABCDEFGHIJ0000000';
const PEDIDO = { external_reference_id: REF, amount: 3644.45, due_date: '2026-03-10', description: 'ALUGUEL RS3.644,45',
  payer: { name: 'Maria Exemplo', tax_id: '52998224725', address: { address: 'Rua das Flores, 45', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', zip_code: '80010000' } },
  payment_method: { bank_slip: { your_number: '7' }, pix: { key: 'chave', type: 'EVP' } },
  payer_notification: [{ channel: 'EMAIL', destination: 'maria@exemplo.com.br', notification_date: 'DUE_DATE' }] };

test('configuração: contas, ambiente, o que falta e os testes do roteiro', () => {
  assert.deepEqual(Object.keys(cfg.contas), ['ank', 'jck']);
  assert.equal(cfg.contas.ank.url_base, 'https://baas-api-sandbox.c6bank.info');
  assert.deepEqual(cfg.origens, ['http://localhost:8000']); // "*" nunca entra
  assert.equal(cfg.exposta, false);
  // produção
  const prod = P.carregarConfig({ ...env, SIMULADO: '', C6_JCK_AMBIENTE: 'producao' });
  assert.equal(prod.contas.jck.ambiente, 'producao');
  assert.equal(prod.contas.jck.url_base, 'https://baas-api.c6bank.info');
  // regras de segurança: simulado × produção; exposição sem EXPOR=1; exposta sem senha
  assert.throws(() => P.carregarConfig({ ...env, C6_JCK_AMBIENTE: 'producao' }), /SIMULADO=1 não pode valer com uma conta em produção/);
  assert.throws(() => P.carregarConfig({ ...env, PONTE_HOST: '0.0.0.0' }), /EXPOR=1/);
  assert.throws(() => P.carregarConfig({ ...env, PONTE_HOST: '0.0.0.0', EXPOR: '1', PONTE_SENHA: '' }), /sem PONTE_SENHA/);
  assert.equal(P.carregarConfig({ ...env, PONTE_HOST: '0.0.0.0', EXPOR: '1' }).exposta, true);
  // registros sem dados pessoais nem segredos
  assert.equal(P.mascarar('{"tax_id":"52998224725","cnpj":"11222333000181","access_token":"abc.def","x":"Bearer abc.def"}'), '{"tax_id":"529*****725","cnpj":"11*********181","access_token":"(oculto)","x":"Bearer (oculto)"}');
  assert.deepEqual(P.faltamNaConta(cfg.contas.ank), ['client_id', 'client_secret', 'certificado (arquivo .crt/.pem)', 'chave privada (arquivo .key/.pem)']);
  assert.equal(P.testeDoRoteiro('POST', '/v2/bank_slips'), 'BP_01');
  assert.equal(P.testeDoRoteiro('PATCH', '/v2/bank_slips/X'), 'BP_02');
  assert.equal(P.testeDoRoteiro('GET', '/v2/bank_slips/X'), 'BP_03');
  assert.equal(P.testeDoRoteiro('GET', '/v2/bank_slips/X/pdf'), 'BP_04');
  assert.equal(P.testeDoRoteiro('PUT', '/v2/bank_slips/X/cancel'), 'BP_05');
  assert.equal(P.testeDoRoteiro('GET', '/v2/bank_slips?due_date_from=1'), 'BP_06');
  assert.equal(P.testeDoRoteiro('POST', '/v1/auth/'), 'AT_01');
});

test('/saude sem chaves: simulado, lista o que falta por conta; senha e CORS', async () => {
  const s = await chamar('GET', '/saude');
  assert.equal(s.status, 200);
  assert.equal(s.cors, 'http://localhost:8000');
  assert.equal(s.dados.ponte, true);
  assert.equal(s.dados.simulado, true);
  assert.equal(s.dados.contas.ank.configurado, false);
  assert.match(s.dados.contas.ank.faltam.join(' '), /client_id/);
  assert.equal(s.dados.contas.jck.ambiente, 'sandbox');
  assert.equal(s.dados.exposta, false);
  assert.deepEqual(s.dados.servicos, ['boletos', 'notificacoes']);
  // sem a senha: /saude só diz o essencial; as outras rotas recusam
  const semSenha = await fetch(`${base}/saude`);
  assert.equal(semSenha.status, 200);
  assert.deepEqual(await semSenha.json(), { ponte: true, configurado: true, simulado: true, exposta: false, senha_exigida: true }); // simulado conta como configurada
  assert.equal((await fetch(`${base}/contas`)).status, 401);
  const outraOrigem = await fetch(`${base}/saude`, { headers: { 'X-Senha-Ponte': 'segredo', Origin: 'http://malicioso.example' } });
  assert.equal(outraOrigem.headers.get('access-control-allow-origin'), null);
  const preflight = await fetch(`${base}/contas/ank/boletos`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8000' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-senha-ponte/i);
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
  const conta = await chamar('GET', '/contas/ank/saude');
  assert.equal(conta.dados.id, 'ank');
  const nada = await chamar('GET', '/contas/xyz/saude');
  assert.equal(nada.status, 404);
});

test('simulado: emite (idempotente, formato da OpenAPI), consulta, lista, altera, paga, negativa, cancela e guarda o webhook', async () => {
  const ruim = await chamar('POST', '/contas/ank/boletos', { ...PEDIDO, external_reference_id: 'curto' });
  assert.equal(ruim.status, 400);
  const semCampo = await chamar('POST', '/contas/ank/boletos', { ...PEDIDO, description: undefined });
  assert.equal(semCampo.status, 400);
  assert.match(semCampo.dados.erro, /description/);
  const e = await chamar('POST', '/contas/ank/boletos', PEDIDO);
  assert.equal(e.status, 201);
  // a emissão devolve só id, referência, valor, vencimento e payment_method (como o C6)
  assert.deepEqual(Object.keys(e.dados).sort(), ['ambiente', 'amount', 'due_date', 'external_reference_id', 'id', 'payment_method', 'simulado']);
  assert.equal(e.dados.ambiente, 'sandbox');
  assert.equal(e.dados.amount, 3644.45);
  const bs = e.dados.payment_method.bank_slip;
  assert.deepEqual(Object.keys(bs).sort(), ['bar_code', 'billing_scheme', 'billing_type', 'digitable_line', 'number', 'order', 'originator_id', 'our_number'].filter((k) => k !== 'order'));
  assert.equal(bs.billing_scheme, '21');
  assert.equal(bs.number, '7');
  assert.match(bs.digitable_line, /^\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}$/);
  assert.match(bs.bar_code, /^336\d{41}$/);
  assert.match(bs.our_number, /^\d{10}$/);
  assert.deepEqual(Object.keys(e.dados.payment_method.pix).sort(), ['image_content', 'mime_type', 'qr_code', 'reference']);
  assert.match(e.dados.payment_method.pix.qr_code, /^00020126.*br\.gov\.bcb\.pix/);
  assert.match(Buffer.from(e.dados.payment_method.pix.image_content, 'base64').toString('utf8'), /<svg/);
  const repetido = await chamar('POST', '/contas/ank/boletos', PEDIDO);
  assert.equal(repetido.status, 200);
  assert.equal(repetido.dados.payment_method.bank_slip.digitable_line, bs.digitable_line);
  // consulta: traz status, emission_date, denial_info e payer_notification com status
  const outraConta = await chamar('GET', `/contas/jck/boletos/${REF}`);
  assert.equal(outraConta.status, 404);
  const c = await chamar('GET', `/contas/ank/boletos/${REF}`);
  assert.equal(c.status, 200);
  assert.equal(c.dados.status, 'CREATED');
  assert.match(c.dados.emission_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(c.dados.denial_info, null);
  assert.deepEqual(c.dados.payer_notification, [{ channel: 'EMAIL', destination: 'maria@exemplo.com.br', notification_date: 'DUE_DATE', status: 'SCHEDULED', sent_at: null }]);
  // listagem: content[] + paginação
  const lista = await chamar('GET', '/contas/ank/boletos?due_date_from=2026-03-01&due_date_to=2026-03-31&status=CREATED');
  assert.equal(lista.dados.content.length, 1);
  assert.equal(lista.dados.total_pages, 1);
  assert.equal(lista.dados.page, 0);
  assert.equal((await chamar('GET', '/contas/ank/boletos?due_date_from=2026-03-01&status=PAID')).dados.content.length, 0);
  // alteração parcial (PATCH)
  const alt = await chamar('POST', `/contas/ank/boletos/${REF}/alterar`, { amount: 3744.45, due_date: '2026-03-15' });
  assert.equal(alt.status, 200);
  assert.equal(alt.dados.amount, 3744.45);
  assert.equal(alt.dados.due_date, '2026-03-15');
  const semMudanca = await chamar('POST', `/contas/ank/boletos/${REF}/alterar`, {});
  assert.equal(semMudanca.status, 400);
  const pdf = await chamar('GET', `/contas/ank/boletos/${REF}/pdf`);
  assert.equal(pdf.status, 501);
  // negativação: agenda e cancela
  const negRuim = await chamar('POST', `/contas/ank/boletos/${REF}/negativar`, {});
  assert.equal(negRuim.status, 400);
  const neg = await chamar('POST', `/contas/ank/boletos/${REF}/negativar`, { deadline: 30 });
  assert.equal(neg.status, 201);
  assert.deepEqual(Object.keys(neg.dados).sort(), ['ambiente', 'denial_date', 'external_reference_id', 'id', 'status']);
  assert.equal(neg.dados.status, 'SCHEDULED');
  assert.equal(neg.dados.denial_date, '2026-04-14'); // 15/03 + 30 dias
  const cNeg = await chamar('GET', `/contas/ank/boletos/${REF}`);
  assert.deepEqual(cNeg.dados.denial_info, { status: 'SCHEDULED', denial_date: '2026-04-14', can_cancel: true });
  const cancNeg = await chamar('POST', `/contas/ank/boletos/${REF}/negativar/cancelar`, {});
  assert.equal(cancNeg.status, 200);
  assert.equal(cancNeg.dados.denial_info.status, 'SCHEDULED_CANCELLATION');
  // pagamento fictício: payments[] como na listagem
  const pago = await chamar('POST', `/contas/ank/simulado/pagar/${REF}`, { payment_date: '2026-03-09', credit_date: '2026-03-10' });
  assert.equal(pago.status, 200);
  assert.equal(pago.dados.status, 'PAID');
  assert.equal(pago.dados.payments.length, 1);
  assert.equal(pago.dados.payments[0].amount, '3744.45');
  assert.equal(pago.dados.payments[0].payment_date, '2026-03-09');
  assert.equal(pago.dados.payments[0].credit_date, '2026-03-10');
  assert.equal(pago.dados.payments[0].payment_type, 'PIX');
  const naoCancela = await chamar('POST', `/contas/ank/boletos/${REF}/cancelar`, {});
  assert.equal(naoCancela.status, 409);
  const REF2 = 'B00000008ABCDEFGHIJ0000000';
  const e2 = await chamar('POST', '/contas/ank/boletos', { ...PEDIDO, external_reference_id: REF2 });
  assert.equal(e2.status, 201);
  const canc = await chamar('POST', `/contas/ank/boletos/${REF2}/cancelar`, {});
  assert.equal(canc.status, 200);
  assert.equal(canc.dados.status, 'CANCELED');
  assert.equal(canc.dados.payer_notification[0].status, 'CANCELED');
  // webhook: sem senha, guarda o aviso
  const wh = await fetch(`${base}/webhook/c6/ank`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'BANK_SLIP_PIX', status: 'PAID', information: JSON.stringify({ external_reference_id: REF, amount: 3744.45 }) }) });
  assert.equal(wh.status, 204);
  const avisos = await chamar('GET', '/contas/ank/notificacoes');
  assert.equal(avisos.dados.notificacoes.length, 1);
  assert.equal(avisos.dados.notificacoes[0].aviso.status, 'PAID');
  // roteiro: no modo simulado nada vai ao banco, então não há registros; a rota responde mesmo assim
  const rot = await chamar('GET', '/roteiro');
  assert.equal(rot.status, 200);
  assert.match(rot.dados.texto, /AT_01 – Geração do token/);
  assert.equal(rot.dados.testes.BP_02, 'Atualizar cobrança Bolepix');
});

test('lerEnv lê o .env sem sobrescrever o ambiente', () => {
  const arq = path.join(tmp, '.env');
  fs.writeFileSync(arq, '# comentário\nCONTAS=ank\nPONTE_SENHA="com espaço"\nSIMULADO=1\n');
  const e = P.lerEnv(arq, { CONTAS: 'jck' });
  assert.equal(e.CONTAS, 'jck');
  assert.equal(e.PONTE_SENHA, 'com espaço');
  assert.equal(e.SIMULADO, '1');
});

test('5 senhas erradas seguidas bloqueiam o IP por 15 minutos (último teste: bloqueia esta máquina)', async () => {
  assert.equal(P.bloqueado('10.0.0.9'), 0);
  for (let i = 0; i < 4; i += 1) P.registrarTentativa('10.0.0.9', false);
  assert.equal(P.bloqueado('10.0.0.9'), 0);
  P.registrarTentativa('10.0.0.9', false);
  assert.equal(P.bloqueado('10.0.0.9'), 15);
  assert.equal(P.bloqueado('10.0.0.9', Date.now() + 16 * 60000), 0); // passou o tempo
  // pela rede: senha errada 5 vezes → 429 até para a senha certa
  for (let i = 0; i < 5; i += 1) assert.equal((await fetch(`${base}/contas`, { headers: { 'X-Senha-Ponte': 'errada' } })).status, 401);
  const r = await chamar('GET', '/contas');
  assert.equal(r.status, 429);
  assert.match(r.dados.erro, /15 minuto/);
});
