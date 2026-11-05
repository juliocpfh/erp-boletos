// Ponte do C6 em modo simulado: sobe numa porta livre, confere /saude, senha, CORS, emissão, consulta, listagem, alteração,
// pagamento fictício, negativação, cancelamento, webhook e o roteiro. Não fala com o banco. Dados fictícios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as P from '../ponte-c6/servidor.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-c6-'));
const TOKEN_WH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const env = { CONTAS: 'ank,jck', SIMULADO: '1', PONTE_SENHA: 'frase-longa-de-teste-com-mais-de-20', ORIGENS: 'http://localhost:8000,*', PASTA_CONTAS: path.join(tmp, 'contas'),
  PASTA_NOTIFICACOES: path.join(tmp, 'notificacoes'), PASTA_REGISTROS: path.join(tmp, 'registros'), C6_ANK_CHAVE_PIX: 'chave-da-conta-ank', C6_ANK_WEBHOOK_TOKEN: TOKEN_WH, C6_ANK_VALOR_MAXIMO: '10000' };
const cfg = P.carregarConfig(env);
cfg.sem_atraso = true; // sem esperar o atraso progressivo nos testes
const servidor = P.criarServidor(cfg);
await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${servidor.address().port}`;
test.after(() => { servidor.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const chamar = async (metodo, caminho, corpo = null, cabecalhos = {}) => {
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers: { 'X-Senha-Ponte': 'frase-longa-de-teste-com-mais-de-20', Origin: 'http://localhost:8000', ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...cabecalhos }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, cors: r.headers.get('access-control-allow-origin'), dados: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};

const REF = 'B00000007ABCDEFGHIJ0000000';
const PEDIDO = { external_reference_id: REF, amount: 3644.45, due_date: '2026-03-10', description: 'ALUGUEL RS3.644,45',
  payer: { name: 'Maria Exemplo', tax_id: '52998224725', email: 'maria@exemplo.com.br', phone: '41999990000', address: { address: 'Rua das Flores, 45', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', zip_code: '80010000' } },
  payment_method: { bank_slip: { your_number: '7' }, pix: { key: 'chave-do-navegador', type: 'EVP' } }, campo_desconhecido: 'some',
  payer_notification: [{ channel: 'EMAIL', destination: 'maria@exemplo.com.br', notification_date: 'DUE_DATE' }, { channel: 'SMS', destination: '41999990000', notification_date: 'ISSUE_DATE' }] };

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
  assert.throws(() => P.carregarConfig({ ...env, PONTE_HOST: '0.0.0.0', EXPOR: '1', PONTE_SENHA: '' }), /pelo menos 20 caracteres/);
  assert.throws(() => P.carregarConfig({ ...env, PONTE_SENHA: 'curta' }), /pelo menos 20 caracteres/);
  assert.throws(() => P.carregarConfig({ ...env, C6_ANK_WEBHOOK_TOKEN: 'xyz' }), /32 caracteres hexadecimais/);
  assert.equal(P.carregarConfig({ ...env, PONTE_HOST: '0.0.0.0', EXPOR: '1' }).exposta, true);
  assert.equal(cfg.contas.ank.valor_maximo, 10000);
  assert.equal(cfg.contas.jck.valor_maximo, 50000);
  // CPF/CNPJ com dígito verificador
  assert.equal(P.documentoValido('52998224725'), true);
  assert.equal(P.documentoValido('11222333000181'), true);
  assert.equal(P.documentoValido('52998224726'), false);
  assert.equal(P.documentoValido('11111111111'), false);
  // registros sem dados pessoais nem segredos
  assert.equal(P.mascarar('{"tax_id":"52998224725","cnpj":"11222333000181","access_token":"abc.def","x":"Bearer abc.def","email":"maria@exemplo.com.br"}'), '{"tax_id":"529*****725","cnpj":"11*********181","access_token":"(oculto)","x":"Bearer (oculto)","email":"m***@exemplo.com.br"}');
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
  assert.doesNotMatch(JSON.stringify(s.dados), /\/tmp\//); // nunca caminhos de disco
  assert.equal(s.dados.contas.ank.certificado, 'faltando');
  assert.equal(s.dados.contas.ank.webhook, true);
  assert.equal(s.dados.contas.jck.webhook, false);
  assert.match(s.dados.faixa, /MODO SIMULADO/);
  assert.equal(s.dados.contas.jck.ambiente, 'sandbox');
  assert.equal(s.dados.exposta, false);
  assert.deepEqual(s.dados.servicos, ['boletos', 'notificacoes']);
  // sem a senha: /saude só diz o essencial; as outras rotas recusam
  const semSenha = await fetch(`${base}/saude`);
  assert.equal(semSenha.status, 200);
  assert.deepEqual(await semSenha.json(), { ponte: true, configurado: true, simulado: true, exposta: false, senha_exigida: true }); // simulado conta como configurada
  assert.equal((await fetch(`${base}/contas`)).status, 401);
  const outraOrigem = await fetch(`${base}/saude`, { headers: { 'X-Senha-Ponte': 'frase-longa-de-teste-com-mais-de-20', Origin: 'http://malicioso.example' } });
  assert.equal(outraOrigem.headers.get('access-control-allow-origin'), null);
  const preflight = await fetch(`${base}/contas/ank/boletos`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:8000' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-senha-ponte/i);
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
  assert.match(preflight.headers.get('access-control-allow-methods'), /DELETE/);
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
  const cpfRuim = await chamar('POST', '/contas/ank/boletos', { ...PEDIDO, payer: { ...PEDIDO.payer, tax_id: '52998224726' } });
  assert.equal(cpfRuim.status, 400);
  assert.match(cpfRuim.dados.erro, /CPF\/CNPJ/);
  const caro = await chamar('POST', '/contas/ank/boletos', { ...PEDIDO, amount: 10000.01 });
  assert.equal(caro.status, 400);
  assert.match(caro.dados.erro, /máximo da conta ank/);
  const avisoErrado = await chamar('POST', '/contas/ank/boletos', { ...PEDIDO, payer_notification: [{ channel: 'EMAIL', destination: 'outro@exemplo.com', notification_date: 'DUE_DATE' }] });
  assert.equal(avisoErrado.status, 400);
  assert.match(avisoErrado.dados.erro, /e-mail do próprio pagador/);
  // o que a ponte manda ao banco: só campos conhecidos, chave Pix da conta, sem "phone"
  const seguro = P.montarPedidoSeguro(PEDIDO, cfg.contas.ank);
  assert.equal(seguro.campo_desconhecido, undefined);
  assert.equal(seguro.payer.phone, undefined);
  assert.deepEqual(seguro.payment_method.pix, { key: 'chave-da-conta-ank', type: 'EVP' });
  assert.equal(seguro.payment_method.bank_slip.billing_scheme, '21');
  assert.deepEqual(seguro.payer_notification[1], { channel: 'SMS', destination: '41999990000', notification_date: 'ISSUE_DATE' });
  // conta sem chave Pix: boleto sai sem Pix mesmo que o site mande
  assert.equal(P.montarPedidoSeguro(PEDIDO, cfg.contas.jck).payment_method.pix, undefined);
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
  assert.deepEqual(c.dados.payer_notification[0], { channel: 'EMAIL', destination: 'maria@exemplo.com.br', notification_date: 'DUE_DATE', status: 'SCHEDULED', sent_at: null });
  assert.equal(c.dados.payment_method.pix.qr_code.includes('br.gov.bcb.pix'), true);
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
  // webhook: sem senha, mas só na URL com o segredo da conta; guarda só a referência a reconsultar
  const corpoWh = JSON.stringify({ service: 'BANK_SLIP_PIX', status: 'PAID', information: JSON.stringify({ external_reference_id: REF, amount: 3744.45, payer: { name: 'Maria', tax_id: '52998224725' } }) });
  assert.equal((await fetch(`${base}/webhook/c6/ank`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpoWh })).status, 404);
  assert.equal((await fetch(`${base}/webhook/c6/ank/${'0'.repeat(32)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpoWh })).status, 404);
  assert.equal((await fetch(`${base}/webhook/c6/jck/${TOKEN_WH}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpoWh })).status, 404); // jck sem token
  const wh = await fetch(`${base}/webhook/c6/ank/${TOKEN_WH}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpoWh });
  assert.equal(wh.status, 204);
  const grande = await fetch(`${base}/webhook/c6/ank/${TOKEN_WH}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(70 * 1024) }) }).catch(() => ({ status: 413 }));
  assert.ok([413, 400].includes(grande.status) || grande.status === undefined);
  const avisos = await chamar('GET', '/contas/ank/notificacoes');
  assert.equal(avisos.dados.notificacoes.length, 1);
  assert.deepEqual(Object.keys(avisos.dados.notificacoes[0]).sort(), ['conta', 'external_reference_id', 'recebida_em', 'reconsultar', 'status']);
  assert.equal(avisos.dados.notificacoes[0].external_reference_id, REF);
  assert.doesNotMatch(fs.readFileSync(path.join(tmp, 'notificacoes', fs.readdirSync(path.join(tmp, 'notificacoes'))[0]), 'utf8'), /52998224725|Maria/);
  // fase 2 montada no servidor (modo simulado): saldo e extrato; pagamentos desligados sem PAGAMENTOS=1
  const saldo = await chamar('GET', '/contas/ank/saldo');
  assert.equal(saldo.status, 200);
  assert.equal(saldo.dados.conta_id, 'ank');
  assert.ok('available' in saldo.dados);
  const ext = await chamar('GET', '/contas/jck/extrato?de=2026-11-01&ate=2026-11-30');
  assert.equal(ext.status, 200);
  assert.ok(Array.isArray(ext.dados.lancamentos) && ext.dados.lancamentos.length > 0);
  const pagosF2 = await chamar('GET', '/contas/ank/boletos/pagos?de=2026-11-01&ate=2026-11-30');
  assert.equal(pagosF2.status, 200);
  assert.ok(Array.isArray(pagosF2.dados.boletos));
  const dda = await chamar('GET', '/contas/ank/dda');
  assert.equal(dda.status, 200);
  const pg = await chamar('POST', '/contas/ank/pagamentos/decodificar', { items: [{ content: '33691991800000005000000003048720009765974213', amount: 50, description: 'teste' }] });
  assert.equal(pg.status, 403);
  cfg.pagamentos = true;
  const pg2 = await chamar('POST', '/contas/ank/pagamentos/decodificar', { items: [{ content: '33691991800000005000000003048720009765974213', amount: 50, description: 'teste' }] });
  assert.equal(pg2.status, 201);
  const rem = await chamar('DELETE', `/contas/ank/pagamentos/${pg2.dados.group_id}/itens`, ['nao-existe']);
  assert.ok([200, 400, 404].includes(rem.status)); // DELETE com corpo chega à rota
  cfg.pagamentos = false;
  const comp = await fetch(`${base}/contas/jck/comprovante/${encodeURIComponent(ext.dados.lancamentos[0].reference)}?data=${ext.dados.lancamentos[0].entry_date}`, { headers: { 'X-Senha-Ponte': env.PONTE_SENHA, Origin: 'http://localhost:8000' } });
  assert.equal(comp.status, 200);
  assert.equal(comp.headers.get('content-type'), 'application/pdf');
  assert.equal(comp.headers.get('x-comprovante-origem'), 'ponte');
  // roteiro: no modo simulado nada vai ao banco, então não há registros; a rota responde mesmo assim
  const rot = await chamar('GET', '/roteiro');
  assert.equal(rot.status, 200);
  assert.match(rot.dados.texto, /AT_01 – Geração do token/);
  assert.equal(rot.dados.testes.BP_02, 'Atualizar cobrança Bolepix');
  assert.equal((await fetch(`${base}/roteiro`)).status, 401); // só com a senha
  // retenção dos registros: arquivo velho some, novo fica
  fs.mkdirSync(path.join(tmp, 'registros'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'registros', '2020-01-01.jsonl'), '{}\n');
  fs.writeFileSync(path.join(tmp, 'registros', `${new Date().toISOString().slice(0, 10)}.jsonl`), '{}\n');
  assert.equal(P.apagarAntigos(cfg, 30), 1);
  assert.equal(fs.existsSync(path.join(tmp, 'registros', '2020-01-01.jsonl')), false);
});

test('lerEnv lê o .env sem sobrescrever o ambiente', () => {
  const arq = path.join(tmp, '.env');
  fs.writeFileSync(arq, '# comentário\nCONTAS=ank\nPONTE_SENHA="com espaço"\nSIMULADO=1\n');
  const e = P.lerEnv(arq, { CONTAS: 'jck' });
  assert.equal(e.CONTAS, 'jck');
  assert.equal(e.PONTE_SENHA, 'com espaço');
  assert.equal(e.SIMULADO, '1');
});

test('senhas erradas: atraso progressivo e, na 10ª seguida, bloqueio do IP por 15 minutos (último teste: bloqueia esta máquina)', async () => {
  assert.equal(P.bloqueado('10.0.0.9'), 0);
  assert.equal(P.atrasoDe('10.0.0.9'), 0);
  P.registrarTentativa('10.0.0.9', false);
  assert.equal(P.atrasoDe('10.0.0.9'), 1);
  for (let i = 0; i < 4; i += 1) P.registrarTentativa('10.0.0.9', false);
  assert.equal(P.atrasoDe('10.0.0.9'), 8); // 1, 2, 4, 8, 8…
  for (let i = 0; i < 4; i += 1) P.registrarTentativa('10.0.0.9', false);
  assert.equal(P.bloqueado('10.0.0.9'), 0);
  P.registrarTentativa('10.0.0.9', false);
  assert.equal(P.bloqueado('10.0.0.9'), 15);
  assert.equal(P.bloqueado('10.0.0.9', Date.now() + 16 * 60000), 0); // passou o tempo
  // pela rede: senha errada 10 vezes → 429 até para a senha certa
  for (let i = 0; i < 10; i += 1) assert.equal((await fetch(`${base}/contas`, { headers: { 'X-Senha-Ponte': 'errada' } })).status, 401);
  const r = await chamar('GET', '/contas');
  assert.equal(r.status, 429);
  assert.match(r.dados.erro, /15 minuto/);
});
