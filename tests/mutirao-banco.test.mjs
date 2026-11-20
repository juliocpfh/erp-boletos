// Mutirão 3000, frente banco (C6): emissão sem 2º boleto, tempo esgotado = "pode ter sido emitido", desconto travado em produção,
// conciliação (acordo/carência, transferência, Pix atrasado com o valor do desconto) e boleto pago aqui ainda aberto no C6.
// Dados fictícios: aluguel R$ 1.350, bonificação 10%, tarifa R$ 3,50 → cheio R$ 1.353,50, em dia R$ 1.218,50.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as R from '../docs/js/regras.js';
import * as Z from '../docs/js/conciliacao.js';
import * as P from '../ponte-c6/servidor.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mutirao-banco-'));
test.after(() => { P.trocarTransporteParaTeste(null); fs.rmSync(tmp, { recursive: true, force: true }); });

function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const jck = R.inserir(d, 'emitentes', { nome: 'JCK', razao_social: 'JCK LTDA', cnpj: '', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua A, 117', cidade: 'Curitiba', uf: 'PR', cep: '80000-000', bairro: 'Centro' }, 'j');
  const sala = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Sala 2', endereco: 'Rua B, 10', cidade: 'Curitiba', uf: 'PR', cep: '80000-001', bairro: 'Centro' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: sala.id, emitente_id: jck.id, percentual: 100 }, 'j');
  const comum = { inquilino_cpf: '529.982.247-25', data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, taxa_boleto: 350, multa_percentual: 10, juros_mensal_percentual: 1 };
  const a = R.inserir(d, 'contratos', { ...comum, imovel_id: loja.id, inquilino_nome: 'Ana Teste' }, 'j');
  const b = R.inserir(d, 'contratos', { ...comum, imovel_id: sala.id, inquilino_nome: 'Bruno Teste' }, 'j');
  d.config_banco = { ativo: true, provedor: 'c6', conta_padrao_id: 'ank', contas: [{ id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox' }, { id: 'jck', apelido: 'JCK', emitente_id: jck.id, ambiente: 'sandbox' }] };
  R.normalizar(d);
  R.gerarCobrancas(d, '2026-07', 'j');
  const cbA = d.cobrancas.find((x) => x.contrato_id === a.id);
  const cbB = d.cobrancas.find((x) => x.contrato_id === b.id);
  return { d, a, b, cbA, cbB };
}
const pix = (reference, data, valor, descricao = 'PIX RECEBIDO') => ({ reference, entry_date: data, created_at: `${data}T10:00:00`, amount: (valor / 100).toFixed(2), operation_type: 'INCOMING', transaction_type: 'CREDIT_PIX_PAYMENT_RECEIVED', title: 'Pix recebido', description: descricao });

// ---------------------------------------------------------------- itens 1 e 4: a mesma referência em toda nova tentativa
test('1/4: a emissão fica pendente antes da ponte; outra aba é barrada; a nova tentativa sem resposta usa a MESMA referência', () => {
  const { d, cbA } = base();
  const conta = R.contaBanco(d, 'ank');
  const t0 = Date.parse('2026-11-16T10:00:00Z');
  const e1 = R.iniciarEmissaoBancaria(d, cbA.id, conta, 'julio', t0);
  assert.equal(e1.repetir, false);
  assert.match(e1.referencia, /^[A-Z0-9]{26}$/);
  // outra aba (ou outra pessoa) 30 s depois: barrada
  assert.throws(() => R.iniciarEmissaoBancaria(d, cbA.id, conta, 'maria', t0 + 30000), /está sendo emitido agora/);
  // tempo esgotado: pode ter sido emitido; a próxima tentativa reaproveita a referência (a ponte confere no banco antes)
  R.registrarErroBancario(d, cbA.id, 'O banco não respondeu a tempo', 'julio', { conta_id: 'ank', incerto: true });
  assert.equal(cbA.emissao_pendente.incerto, true);
  const e2 = R.iniciarEmissaoBancaria(d, cbA.id, conta, 'julio', t0 + 40000);
  assert.deepEqual([e2.referencia, e2.repetir], [e1.referencia, true]);
  assert.equal(R.pedidoBoletoC6(d, cbA, conta, e2.referencia).external_reference_id, e1.referencia);
  // a resposta chega: a pendência sai
  R.registrarBoletoBancario(d, cbA.id, { external_reference_id: e1.referencia, status: 'CREATED', amount: 1353.5 }, 'julio', { conta_id: 'ank' });
  assert.equal(cbA.emissao_pendente, null);
  assert.throws(() => R.iniciarEmissaoBancaria(d, cbA.id, conta, 'julio', t0 + 60000), /já foi emitido/);
});

test('1/4: recusa clara do banco tira a pendência (a próxima é uma emissão nova)', () => {
  const { d, cbA } = base();
  const conta = R.contaBanco(d, 'ank');
  const e1 = R.iniciarEmissaoBancaria(d, cbA.id, conta, 'julio', Date.parse('2026-11-16T10:00:00Z'));
  R.registrarErroBancario(d, cbA.id, 'O banco respondeu 400: due_date inválida', 'julio', { conta_id: 'ank' });
  assert.equal(cbA.emissao_pendente, null);
  assert.equal(cbA.banco.situacao, 'erro');
  const e2 = R.iniciarEmissaoBancaria(d, cbA.id, conta, 'julio', Date.parse('2026-11-16T10:05:00Z'));
  assert.notEqual(e2.referencia, e1.referencia);
});

// ---------------------------------------------------------------- itens 26 e 45
test('26/45: falha ao emitir de novo um cancelado aparece no boleto; consultar logo após cancelar não vira reemissão', () => {
  const { d, cbA } = base();
  const ref = 'B0000000AAAAAAAAAAAAAAAAAA';
  R.registrarBoletoBancario(d, cbA.id, { external_reference_id: ref, status: 'CREATED', amount: 1353.5 }, 'j', { conta_id: 'ank' });
  R.registrarCancelamentoBancario(d, cbA.id, 'j');
  R.registrarBoletoBancario(d, cbA.id, { external_reference_id: ref, status: 'CREATED', amount: 1353.5 }, 'j');
  assert.equal(cbA.banco.situacao, 'cancelado');
  assert.equal((cbA.banco.emissoes_anteriores || []).length, 0);
  R.registrarErroBancario(d, cbA.id, 'O banco respondeu 400: due_date inválida', 'j', { conta_id: 'ank' });
  assert.deepEqual([cbA.banco.situacao, cbA.banco.erro], ['erro', 'O banco respondeu 400: due_date inválida']);
});

// ---------------------------------------------------------------- ponte: itens 1, 2 e 21
function ponte() {
  const crt = path.join(tmp, 'c.crt'); const key = path.join(tmp, 'c.key');
  fs.writeFileSync(crt, 'x'); fs.writeFileSync(key, 'x');
  const senha = 'frase de teste com mais de vinte';
  const cfg = { porta: 8765, host: '127.0.0.1', origens: [], senha, simulado: false, pagamentos: false, software: { nome: 't', versao: '1' }, pastaNotificacoes: path.join(tmp, 'n'), pastaRegistros: '', sem_atraso: true, pausas_tentativas: [0, 0], hosts: [],
    contas: { ank: { id: 'ank', ambiente: 'sandbox', client_id: 'a', client_secret: 'b', certificado: crt, chave: key, url_base: 'https://x', valor_maximo: 50000, versao_boleto: 'v2', chave_pix: '' } } };
  const chamar = (metodo, url, corpo) => new Promise((ok) => {
    const req = new EventEmitter(); req.method = metodo; req.url = url; req.headers = { 'x-senha-ponte': senha, host: '127.0.0.1:8765' }; req.socket = { remoteAddress: '1' };
    const res = { status: 0, setHeader() {}, writeHead(s) { this.status = s; }, end(b) { ok({ status: this.status, corpo: b ? JSON.parse(String(b)) : null }); } };
    P.tratar(cfg, req, res);
    setImmediate(() => { if (corpo) req.emit('data', Buffer.from(JSON.stringify(corpo))); req.emit('end'); });
  });
  return { chamar };
}
const PEDIDO = { external_reference_id: 'B00000001ABCDEFGH000000000', amount: 1500, due_date: '2099-12-10', description: 'Aluguel',
  payer: { name: 'Fulano', tax_id: '52998224725', address: { address: 'Rua A, 1', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', zip_code: '80000000' } }, payment_method: { bank_slip: {} } };

test('2: emissão sem resposta a tempo vira 504 "pode ter sido emitido" (não "erro interno"); 1: com repetir, a ponte confere antes e devolve o que já existe', async () => {
  const { chamar } = ponte();
  P.trocarTransporteParaTeste(async (url) => { if (url.includes('/auth')) return { status: 200, dados: { access_token: 't', expires_in: 600 } }; throw Object.assign(new Error('O banco não respondeu a tempo.'), { code: 'TEMPO_ESGOTADO' }); });
  const r = await chamar('POST', '/contas/ank/boletos', PEDIDO);
  assert.equal(r.status, 504);
  assert.match(r.corpo.erro, /PODE ter chegado/);
  assert.equal(r.corpo.detalhes.incerto, true);
  // nova tentativa com a mesma referência: o banco já tem → devolve a existente, sem POST
  const pedidos = [];
  P.trocarTransporteParaTeste(async (url, o) => {
    if (url.includes('/auth')) return { status: 200, dados: { access_token: 't', expires_in: 600 } };
    pedidos.push(`${o.metodo} ${url}`);
    return { status: 200, dados: { external_reference_id: PEDIDO.external_reference_id, status: 'CREATED', amount: 1500 } };
  });
  const r2 = await chamar('POST', '/contas/ank/boletos', { ...PEDIDO, repetir: true });
  assert.equal(r2.status, 200);
  assert.equal(r2.corpo.ja_existia, true);
  assert.ok(pedidos.every((p) => p.startsWith('GET')), pedidos.join(', '));
  // o banco não tem (404): emite
  pedidos.length = 0;
  P.trocarTransporteParaTeste(async (url, o) => {
    if (url.includes('/auth')) return { status: 200, dados: { access_token: 't', expires_in: 600 } };
    pedidos.push(o.metodo);
    return o.metodo === 'GET' ? { status: 404, dados: { title: 'Not Found' } } : { status: 201, dados: { external_reference_id: PEDIDO.external_reference_id } };
  });
  assert.equal((await chamar('POST', '/contas/ank/boletos', { ...PEDIDO, repetir: true })).status, 201);
  assert.deepEqual(pedidos, ['GET', 'POST']);
});

test('21: CEP com 9 números é recusado na ponte (não é cortado)', async () => {
  const { chamar } = ponte();
  let enviado = null;
  P.trocarTransporteParaTeste(async (url, o) => { if (url.includes('/auth')) return { status: 200, dados: { access_token: 't', expires_in: 600 } }; enviado = o.corpo; return { status: 201, dados: {} }; });
  const r = await chamar('POST', '/contas/ank/boletos', { ...PEDIDO, payer: { ...PEDIDO.payer, address: { ...PEDIDO.payer.address, zip_code: '800000001' } } });
  assert.equal(r.status, 400);
  assert.match(r.corpo.erro, /CEP/);
  assert.equal(enviado, null);
});

test('44: certificado recusado e sem internet viram explicação em português', () => {
  assert.match(P.erroDeConexao(Object.assign(new Error('error:1C800064:Provider routines::bad decrypt'), { code: 'ERR_OSSL_BAD_DECRYPT' })).message, /certificado do C6 foi recusado/);
  assert.match(P.erroDeConexao(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })).message, /internet/);
});

// ---------------------------------------------------------------- item 6
test('6: pagamento com a referência de um boleto em acordo nunca vai para o boleto de outro inquilino', () => {
  const { d, cbA, cbB } = base();
  const pont = R.totais(cbA).a_pagar_pontual;
  cbA.banco = { id_externo: 'B0000000AAAAAAAAAAAAAAAAAA', conta_id: 'ank', situacao: 'emitido' };
  cbA.situacao = 'Em acordo';
  const sug = Z.conciliarBoletos(d, 'ank', [{ external_reference_id: 'B0000000AAAAAAAAAAAAAAAAAA', status: 'PAID', payments: [{ amount: (pont / 100).toFixed(2), payment_date: cbA.vencimento, credit_date: cbA.vencimento, external_payment_id: 'p1', payment_type: 'PIX' }] }]);
  assert.equal(sug.length, 1);
  assert.equal(sug[0].cobranca_id, cbA.id);
  assert.notEqual(sug[0].cobranca_id, cbB.id);
  assert.match(sug[0].alerta, /em acordo/);
  assert.equal(Z.prontoParaRegistrar(d, sug[0]), false);
});

// ---------------------------------------------------------------- itens 7 e 8
test('7: casado só pelo valor (boleto feito fora do sistema) nunca vem marcado; 8: boleto já pago à mão não esconde o de outro inquilino', () => {
  const { d, cbA, cbB } = base();
  const pont = R.totais(cbA).a_pagar_pontual;
  const sug = Z.conciliarBoletos(d, 'ank', [{ external_reference_id: 'XYZ00000000000000000000000', payments: [{ amount: (pont / 100).toFixed(2), payment_date: cbA.vencimento, credit_date: cbA.vencimento, payment_type: 'PIX' }] }]);
  assert.ok(sug.length >= 1 && sug.every((s) => !Z.prontoParaRegistrar(d, s)));
  R.registrarPagamento(d, cbA.id, cbA.vencimento, pont, 'j');
  const { novas: [mov] } = Z.importarExtrato(d, 'ank', [pix('r9', cbA.vencimento, pont, 'PIX RECEBIDO BRUNO TESTE')], 'j', { hoje: '2026-09-01' });
  const s = Z.sugerirDestino(d, mov);
  assert.equal(s.cobranca_id, null, 'duas opções: quem escolhe é o usuário');
  assert.deepEqual(s.candidatos.sort(), [cbA.id, cbB.id].sort());
  assert.equal(s.confianca, 'baixa');
});

// ---------------------------------------------------------------- item 22
test('22: aluguel recebido na JCK não vira "transferência" só porque a ANK pagou um fornecedor do mesmo valor no mesmo dia', () => {
  const { d, cbB } = base();
  const v = R.totais(cbB).a_pagar_pontual;
  Z.importarExtrato(d, 'ank', [{ reference: 's1', entry_date: '2026-08-10', created_at: '2026-08-10T09:00:00', amount: (v / 100).toFixed(2), operation_type: 'OUTGOING', transaction_type: 'DEBIT_PIX_PAYMENT_REALIZED', title: 'Pix enviado', description: 'PIX ENVIADO MARCENARIA SILVA' }], 'j', { hoje: '2026-09-01' });
  const { novas: [m] } = Z.importarExtrato(d, 'jck', [pix('e1', '2026-08-10', v, 'PIX RECEBIDO BRUNO TESTE')], 'j', { hoje: '2026-09-01' });
  const s = Z.sugerirDestino(d, m);
  assert.equal(s.classificacao, 'boleto'); // Ana e Bruno têm o mesmo valor: os dois boletos são as opções
  assert.ok(s.cobranca_id === cbB.id || (s.candidatos || []).includes(cbB.id));
  // a transferência de verdade cita a outra empresa: continua alta
  const { novas: [t1] } = Z.importarExtrato(d, 'ank', [{ reference: 's2', entry_date: '2026-08-12', created_at: '2026-08-12T09:00:00', amount: '500.00', operation_type: 'OUTGOING', transaction_type: 'DEBIT_PIX_PAYMENT_REALIZED', title: 'Pix enviado', description: 'PIX ENVIADO JCK LTDA' }], 'j', { hoje: '2026-09-01' });
  Z.importarExtrato(d, 'jck', [pix('e2', '2026-08-12', 50000, 'PIX RECEBIDO ANK LTDA')], 'j', { hoje: '2026-09-01' });
  const st = Z.sugerirDestino(d, t1);
  // cita a outra empresa: transferência; a outra ponta (sem o mesmo código do Pix) só como candidata (decisão de 17/11/2026)
  assert.deepEqual([st.classificacao, st.par_movimentacao_id, (st.candidatosPar || []).length], ['transferencia', null, 1]);
});

// ---------------------------------------------------------------- item 10 (decisão do dono, 16/11/2026)
// decisão nova do dono (2026-11-20): não existe pagamento em parte. O Pix do valor com desconto pago depois do vencimento é
// recusado (antes, de 16/11 a 19/11, ficava pago e a diferença ia ao boleto seguinte); nada é gravado e o dinheiro fica sem destino
test('10 (20/11): Pix do valor com desconto pago 20 dias atrasado é recusado: o boleto continua em aberto, nada vai ao seguinte', () => {
  const { d, cbA, a } = base();
  R.gerarCobrancas(d, '2026-08', 'j');
  const prox = d.cobrancas.find((x) => x.contrato_id === a.id && x.competencia === '2026-08');
  const pont = R.totais(cbA).a_pagar_pontual;
  const { novas: [mov] } = Z.importarExtrato(d, 'ank', [pix('r7', '2026-08-30', pont, 'PIX ANA')], 'j', { hoje: '2026-09-05' });
  const devido = R.previstoNoPagamento(cbA, '2026-08-30').valor_devido;
  const recusa = (e) => e instanceof C.ErroUsuario && e.message.includes(`menor que o devido (${C.reais(devido)})`) && /Não existe pagamento em parte/.test(e.message);
  assert.throws(() => Z.confirmarPagamentoPeloBanco(d, cbA.id, mov.id, 'j'), recusa);
  assert.throws(() => Z.confirmarPagamentoPeloBanco(d, cbA.id, mov.id, 'j', { diferencaNoProximo: true }), recusa);
  assert.deepEqual([cbA.data_pagamento, cbA.situacao, cbA.diferenca_devida ?? null], [null, 'Em aberto', null]);
  assert.equal(prox.outros || 0, 0, 'nada no boleto seguinte');
  assert.equal(mov.classificacao ?? null, null, 'o dinheiro fica no extrato sem destino');
  // a proposta automática também não casa esse Pix com o boleto
  assert.ok(!Z.conciliarMovimentacoes(d, [mov]).some((x) => x.cobranca_id === cbA.id));
});

test('10: boleto pelo código de barras creditado até 3 dias úteis depois do vencimento, pelo valor do desconto, é em dia', () => {
  const { d, cbA } = base(); // vence seg 10/08/2026
  const pont = R.totais(cbA).a_pagar_pontual;
  const { novas: [mov] } = Z.importarExtrato(d, 'ank', [{ reference: 'b1', entry_date: '2026-08-13', created_at: '2026-08-13T08:00:00', amount: (pont / 100).toFixed(2), operation_type: 'INCOMING', transaction_type: 'OTHER', title: 'Liquidacao de boleto', description: 'LIQUIDACAO BOLETO ANA TESTE' }], 'j', { hoje: '2026-09-01' });
  const r = Z.confirmarPagamentoPeloBanco(d, cbA.id, mov.id, 'j');
  assert.equal(r.divergente, false);
  assert.deepEqual([cbA.situacao, cbA.pagou_em_dia], ['Paga em dia', true]);
});

// ---------------------------------------------------------------- item 46
test('46: boleto pago com atraso e creditado no dia seguinte casa e não dá divergência (juros até o dia em que pagou)', () => {
  const { d, cbA } = base();
  const pagoBanco = R.previstoNoPagamento(cbA, '2026-08-14').valor_devido; // sex 14/08, crédito seg 17/08
  const { novas: [m] } = Z.importarExtrato(d, 'ank', [{ reference: 'r1', entry_date: '2026-08-17', created_at: '2026-08-17T08:00:00', amount: (pagoBanco / 100).toFixed(2), operation_type: 'INCOMING', transaction_type: 'OTHER', title: 'Liquidacao de boleto', description: 'LIQUIDACAO BOLETO ANA TESTE' }], 'j', { hoje: '2026-09-01' });
  assert.ok(Z.conciliarMovimentacoes(d, [m]).some((x) => x.cobranca_id === cbA.id));
  const r = Z.confirmarPagamentoPeloBanco(d, cbA.id, m.id, 'j');
  assert.equal(r.divergente, false);
  assert.deepEqual([cbA.data_pagamento, cbA.data_pagou, cbA.situacao], ['2026-08-17', '2026-08-14', 'Paga com atraso']);
});

// ---------------------------------------------------------------- item 23
test('23: pagamento registrado à mão com o boleto aberto no C6 vira alerta no Painel', () => {
  const { d, cbA } = base();
  R.registrarBoletoBancario(d, cbA.id, { external_reference_id: 'B0000000AAAAAAAAAAAAAAAAAA', status: 'CREATED', amount: 1353.5 }, 'j', { conta_id: 'ank' });
  assert.equal(R.pagosAquiAbertosNoBanco(d).length, 0);
  R.registrarPagamento(d, cbA.id, cbA.vencimento, R.totais(cbA).a_pagar_pontual, 'j');
  assert.deepEqual(R.pagosAquiAbertosNoBanco(d).map((x) => x.id), [cbA.id]);
  const al = R.alertaBanco(d, '2026-08-11');
  assert.match(al.texto, /pago\(s\) aqui e ainda em aberto no C6/);
  assert.equal(al.link, `#/cobranca/${cbA.id}`);
  // cancelado no banco: o alerta some
  R.registrarCancelamentoBancario(d, cbA.id, 'j');
  assert.equal(R.pagosAquiAbertosNoBanco(d).length, 0);
});
