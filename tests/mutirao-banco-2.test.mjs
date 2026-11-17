// Mutirão 3000, frente banco (parte 2): ponte (token renovado na fase 2, recusas em português, encargos conferidos), pagamentos
// repetidos, lote casado pelo código, destinos do extrato e consulta do boleto. Dados fictícios (CPF 529.982.247-25).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import * as R from '../docs/js/regras.js';
import * as Z from '../docs/js/conciliacao.js';
import * as P from '../ponte-c6/servidor.mjs';
import { erroDoC6 } from '../ponte-c6/c6-extrato.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mutirao-banco-2-'));
test.after(() => { P.trocarTransporteParaTeste(null); fs.rmSync(tmp, { recursive: true, force: true }); });

function ponte() {
  const crt = path.join(tmp, 'c.crt'); const key = path.join(tmp, 'c.key');
  fs.writeFileSync(crt, 'x'); fs.writeFileSync(key, 'x');
  const senha = 'frase de teste com mais de vinte';
  const cfg = { porta: 8765, host: '127.0.0.1', origens: [], senha, simulado: false, pagamentos: false, software: { nome: 't', versao: '1' }, pastaNotificacoes: path.join(tmp, 'n'), pastaRegistros: '', sem_atraso: true, pausas_tentativas: [0, 0], hosts: [],
    contas: { ank: { id: 'ank2', ambiente: 'sandbox', client_id: 'a', client_secret: 'b', certificado: crt, chave: key, url_base: 'https://y', valor_maximo: 50000, versao_boleto: 'v2', chave_pix: '' } } };
  cfg.contas.ank.id = 'ank';
  const chamar = (metodo, url, corpo) => new Promise((ok) => {
    const req = new EventEmitter(); req.method = metodo; req.url = url; req.headers = { 'x-senha-ponte': senha, host: '127.0.0.1:8765' }; req.socket = { remoteAddress: '1' };
    const res = { status: 0, setHeader() {}, writeHead(s) { this.status = s; }, end(b) { ok({ status: this.status, corpo: b ? JSON.parse(String(b)) : null }); } };
    P.tratar(cfg, req, res);
    setImmediate(() => { if (corpo) req.emit('data', Buffer.from(JSON.stringify(corpo))); req.emit('end'); });
  });
  return { chamar };
}

test('15/16: extrato com o token recusado pede outro e repete; recusa do banco vira texto em português (o JSON fica nos detalhes)', async () => {
  const { chamar } = ponte();
  let tokens = 0;
  let extratos = 0;
  P.trocarTransporteParaTeste(async (url) => {
    if (url.includes('/auth')) { tokens += 1; return { status: 200, dados: { access_token: `t${tokens}`, expires_in: 600 } }; }
    extratos += 1;
    return extratos === 1 ? { status: 401, dados: { title: 'Unauthorized', detail: 'invalid token' } } : { status: 200, dados: { entries: [] } };
  });
  const r = await chamar('GET', '/contas/ank/extrato?de=2026-11-01&ate=2026-11-10');
  assert.equal(r.status, 200);
  assert.equal(extratos, 2);
  const e = erroDoC6({ status: 401, corpo: { title: 'Unauthorized', detail: 'invalid token' } }, 'buscar o extrato');
  assert.match(e.message, /client_id e o client_secret/);
  assert.doesNotMatch(e.message, /Unauthorized|\{/);
  assert.match(erroDoC6({ status: 503, corpo: {} }, 'consultar o saldo').message, /O banco respondeu 503 .*tente daqui a pouco/);
});

test('50: na ponte, desconto igual ou maior que o valor e prazo do desconto maior que os dias até o vencimento são recusados', () => {
  assert.throws(() => P.encargosSeguros({ first_discount_value: 1500 }, 1500, '2099-01-10'), /não pode ser igual ou maior/);
  assert.throws(() => P.encargosSeguros({ first_discount_value: 100, first_discount_deadline: 5 }, 1500, new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)), /faltam só/);
  assert.deepEqual(P.encargosSeguros({ first_discount_value: 135, first_discount_deadline: 0, discount_type: 'VALUE_PER_DAY' }, 1353.5, '2099-01-10'), { first_discount_value: 135, first_discount_deadline: 0, discount_type: 'VALUE_PER_DAY' });
});

function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  const jck = R.inserir(d, 'emitentes', { nome: 'JCK', cnpj: '', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua A, 117', cidade: 'Curitiba', uf: 'PR', cep: '80000-000', bairro: 'Centro' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  R.inserir(d, 'contratos', { inquilino_cpf: '529.982.247-25', data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 10, taxa_boleto: 350, multa_percentual: 10, juros_mensal_percentual: 1, imovel_id: loja.id, inquilino_nome: 'Ana Teste' }, 'j');
  d.config_banco = { ativo: true, provedor: 'c6', conta_padrao_id: 'ank', permitir_pagamentos: true, limite_pagamento: 0, contas: [{ id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox' }, { id: 'jck', apelido: 'JCK', emitente_id: jck.id, ambiente: 'sandbox' }] };
  R.normalizar(d); R.gerarCobrancas(d, '2026-07', 'j');
  return { d, loja, cb: d.cobrancas[0] };
}
const avulso = (comp, data) => ({ conta_id: 'ank', imovel_id: null, origem: { tipo: 'avulso' }, tipo_conta: 'Outra', competencia: comp, forma: 'pix', chave_pix: 'fornecedor@exemplo.com', valor: 20000, data_pagamento: data });

test('28/29: pagamento recorrente de outro mês vale; o mesmo rascunho duas vezes não', () => {
  const { d } = base();
  const [p] = Z.prepararPagamentos(d, [avulso('2026-10', '2026-10-20')], 'j');
  assert.throws(() => Z.prepararPagamentos(d, [avulso('2026-10', '2026-10-20')], 'j'), /Já existe um pagamento igual/, 'rascunho igual');
  p.situacao = 'pago'; p.pago_em = '2026-10-20';
  assert.equal(Z.prepararPagamentos(d, [avulso('2026-11', '2026-11-20')], 'j').length, 1, 'novembro: outro mês, vale');
  const outro = { ...avulso('2026-12', '2026-12-20'), valor: 30000 };
  assert.throws(() => Z.prepararPagamentos(d, [outro, outro], 'j'), /duas vezes/);
});

test('32: itens do lote com o código em maiúsculas e fora de ordem não se trocam', () => {
  const a = { id: 1, content: 'aaaa@exemplo.com', valor: 10000 }; const b = { id: 2, content: 'bbbb@exemplo.com', valor: 20000 };
  const itens = [{ id: 'X', content: 'BBBB@EXEMPLO.COM', amount: 200, status: 'READ_DATA' }, { id: 'Y', content: 'AAAA@EXEMPLO.COM', amount: 100, status: 'DECODE_ERROR' }];
  const r = Z.casarItensDoGrupo([a, b], itens);
  assert.deepEqual(r.map((x) => x && x.id), ['Y', 'X']);
});

test('38/39/40: IPTU e imposto só com saída; conta lançada só com o mesmo valor; transferência não liga par já ligado', () => {
  const { d, loja } = base();
  const mk = (conta, ref, tipo, valor = '500.00') => Z.importarExtrato(d, conta, [{ reference: ref, entry_date: '2026-10-10', created_at: '2026-10-10T12:00:00', amount: valor, operation_type: tipo, transaction_type: 'TRANSFER', title: 'TED', description: `TED ${ref}` }], 'j', { hoje: '2026-11-01' }).novas[0];
  const ent = mk('ank', 'e1', 'INCOMING', '77.00');
  assert.throws(() => Z.vincularMovimentacao(d, ent.id, { classificacao: 'imposto' }, 'j'), /entrada no extrato não pode ser imposto/);
  const [de] = R.lancarDespesas(d, loja.id, '2026-10', [{ tipo: 'Água', valor: 12345, data_pagamento: '2026-10-10' }], 'j');
  const sai = mk('ank', 's9', 'OUTGOING', '999.00');
  assert.throws(() => Z.vincularMovimentacao(d, sai.id, { classificacao: 'conta_imovel', despesa_id: de.id }, 'j'), /é de R\$ 123,45/);
  const a = mk('ank', 'a1', 'OUTGOING'); const b = mk('jck', 'b1', 'INCOMING'); const c = mk('ank', 'c1', 'OUTGOING');
  Z.vincularMovimentacao(d, a.id, { classificacao: 'transferencia', par_movimentacao_id: b.id }, 'j');
  assert.throws(() => Z.vincularMovimentacao(d, c.id, { classificacao: 'transferencia', par_movimentacao_id: b.id }, 'j'), /já está ligada a outra transferência/);
});

test('18: devolução de Pix recebida não é aluguel nem transferência', () => {
  const { d, cb } = base();
  const v = (R.totais(cb).a_pagar_pontual / 100).toFixed(2);
  const { novas: [dv] } = Z.importarExtrato(d, 'ank', [{ reference: 'd1', entry_date: '2026-08-09', created_at: '2026-08-09T11:00:00', amount: v, operation_type: 'INCOMING', transaction_type: 'CREDIT_PIX_DEVOLUTION_RECEIVED', title: 'Devolução Pix', description: 'DEVOLUCAO PIX FORNECEDOR' }], 'j', { hoje: '2026-09-01' });
  assert.equal(Z.sugerirDestino(d, dv).classificacao, 'devolucao');
  assert.equal(Z.conciliarMovimentacoes(d, [dv]).length, 0);
  Z.vincularMovimentacao(d, dv.id, { classificacao: 'devolucao' }, 'j');
  assert.equal(R.buscar(d, 'movimentacoes_banco', dv.id).classificacao, 'devolucao');
});

test('37: com duas entradas iguais no dia, nenhuma é ligada pelo nome do inquilino; só pelo código do pagamento (decisão de 17/11/2026)', () => {
  const { d, cb } = base();
  const v = R.totais(cb).a_pagar_pontual;
  const pix = (ref, desc, e2e) => ({ reference: ref, entry_date: '2026-08-10', created_at: '2026-08-10T10:00:00', amount: (v / 100).toFixed(2), operation_type: 'INCOMING', transaction_type: 'CREDIT_PIX_PAYMENT_RECEIVED', title: 'Pix', description: desc, end_to_end_id: e2e });
  const { novas: [bruno, ana] } = Z.importarExtrato(d, 'ank', [pix('x1', 'PIX RECEBIDO BRUNO TESTE', 'E33600000202608101000BRUNO001'), pix('x2', 'PIX RECEBIDO ANA TESTE', 'E33600000202608101000ANA00002')], 'j', { hoje: '2026-09-01' });
  assert.equal(Z.entradaDoRecebimento(d, { conta_id: 'ank', valor: v, data: '2026-08-10', nome: 'Ana Teste' }), null, 'pelo nome, nenhuma');
  assert.equal(Z.entradaDoRecebimento(d, { conta_id: 'ank', valor: v }), null, 'sem código, nenhuma');
  assert.equal(Z.entradaDoRecebimento(d, { conta_id: 'ank', valor: v, ids: ['E33600000202608101000ANA00002'] }).id, ana.id, 'pelo código do Pix, a dele');
  void bruno;
});

test('9/27/47: consulta com dois pagamentos, negativação em date/errors e data do aviso', () => {
  const { d, cb } = base();
  const ref = 'B0000000AAAAAAAAAAAAAAAAAA';
  R.registrarBoletoBancario(d, cb.id, { external_reference_id: ref, status: 'CREATED', amount: 1353.5 }, 'j', { conta_id: 'ank' });
  R.registrarNegativacao.length; // (só administrador agenda; aqui a resposta já com a data)
  cb.banco.negativacao = { situacao: 'SCHEDULED', data: '2026-09-09', pode_cancelar: true };
  R.registrarBoletoBancario(d, cb.id, { external_reference_id: ref, status: 'PAID', amount: 1353.5, denial_info: { status: 'FAILED_TO_DENIAL', can_cancel: false, errors: [{ type: 'X', message: 'Dados do credor inválidos' }] },
    payer_notification: [{ channel: 'EMAIL', destination: 'ana@exemplo.com', notification_date: '2026-08-01', status: 'SENT' }],
    payments: [{ amount: '1218.50', payment_date: '2026-08-10', credit_date: '2026-08-10' }, { amount: '1218.50', payment_date: '2026-08-10', credit_date: '2026-08-11' }] }, 'j');
  assert.equal(cb.banco.negativacao.data, '2026-09-09', 'a data guardada não some');
  assert.equal(cb.banco.negativacao.erro, 'Dados do credor inválidos');
  assert.equal(cb.banco.notificacoes[0].data, '2026-08-01');
  assert.deepEqual([cb.banco.pagamentos_no_banco, cb.banco.valor_pago_total], [2, 243700]);
  const sug = Z.conciliarBoletos(d, 'ank', [{ external_reference_id: ref, status: 'PAID', payments: [{ amount: '1218.50', payment_date: '2026-08-10', credit_date: '2026-08-10', payment_type: 'PIX' }, { amount: '1218.50', payment_date: '2026-08-10', credit_date: '2026-08-11', payment_type: 'BANK_SLIP' }] }]);
  assert.equal(sug.length, 2);
  assert.match(sug[1].alerta, /pago 2 vezes/);
  assert.equal(Z.prontoParaRegistrar(d, sug[1]), false);
});

test('34/35: OFX com fuso vira a data de Brasília; OFX × API com descrições diferentes e um só candidato não entra em dobro', () => {
  const { d } = base();
  assert.equal(Z.lerOfx('<OFX><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261011023000[0:GMT]<TRNAMT>10.00<FITID>X1<MEMO>PIX</STMTTRN></BANKTRANLIST>').lancamentos[0].data, '2026-10-10');
  assert.equal(Z.lerOfx('<OFX><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261011<TRNAMT>10.00<FITID>X1<MEMO>PIX</STMTTRN></BANKTRANLIST>').lancamentos[0].data, '2026-10-11');
  Z.importarExtrato(d, 'ank', Z.lerOfx('<OFX><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261010120000[-3:BRT]<TRNAMT>1218.50<FITID>F1<MEMO>PIX RECEBIDO</STMTTRN></BANKTRANLIST>').lancamentos, 'j', { hoje: '2026-11-01' });
  const r = Z.importarExtrato(d, 'ank', [{ reference: '11111111-2222-3333-4444-555555555555', entry_date: '2026-10-10', created_at: '2026-10-10T12:00:00', amount: '1218.50', operation_type: 'INCOMING', transaction_type: 'CREDIT_PIX_PAYMENT_RECEIVED', title: 'Pix', description: 'Transferencia recebida de ANA TESTE' }], 'j', { hoje: '2026-11-01' });
  assert.deepEqual([r.novas.length, d.movimentacoes_banco.length], [0, 1]);
});

test('33: OFX de outra conta (ACCTID) é recusado', () => {
  const { d } = base();
  const ofx = (conta, fitid) => `<OFX><BANKACCTFROM><ACCTID>${conta}</BANKACCTFROM><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261010<TRNAMT>10.00<FITID>${fitid}<MEMO>PIX</STMTTRN></BANKTRANLIST>`;
  const a = Z.lerOfx(ofx('1234567', 'A1'));
  Z.importarExtrato(d, 'ank', a.lancamentos, 'j', { contaDoArquivo: a.conta, hoje: '2026-11-01' });
  assert.throws(() => Z.importarExtrato(d, 'jck', a.lancamentos, 'j', { contaDoArquivo: a.conta, hoje: '2026-11-01' }), /é a conta ANK/);
  const b = Z.lerOfx(ofx('7654321', 'B1'));
  assert.throws(() => Z.importarExtrato(d, 'ank', b.lancamentos, 'j', { contaDoArquivo: b.conta, hoje: '2026-11-01' }), /é a de nº 1234567/);
  assert.equal(Z.importarExtrato(d, 'jck', b.lancamentos, 'j', { contaDoArquivo: b.conta, hoje: '2026-11-01' }).novas.length, 1);
});
