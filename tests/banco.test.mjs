// Integração com o banco (C6, boleto com Pix): configuração por conta, pedido de emissão e gravação da resposta.
// Dados fictícios (CPF de teste 529.982.247-25, CNPJ 11.222.333/0001-81).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as M from '../docs/js/mapa-c6.js';
import * as R from '../docs/js/regras.js';

function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'teste');
  const jck = R.inserir(d, 'emitentes', { nome: 'JCK ADMINISTRADORA', razao_social: 'JCK ADMINISTRADORA LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'teste');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1 - Nilo Brandão', endereco: 'Rua Professor Nilo Brandão, 117', complemento: 'Loja 1', bairro: 'São Lourenço', cidade: 'Curitiba', uf: 'PR', cep: '82200-100' }, 'teste');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo da Silva', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com.br', inquilino_telefone: '(41) 99999-0000',
    inquilino_endereco: 'Rua das Flores, 45, Centro, Curitiba/PR, CEP 80010-000', data_entrada: '2026-01-10', vigencia_inicio: '2026-01-10', aluguel_inicial: 364445,
    dia_vencimento: 10, cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 10, taxa_boleto: 0, multa_percentual: 10, juros_mensal_percentual: 1 }, 'teste');
  return { d, ank, jck, loja, c };
}

function comContas(d, ank, jck) {
  R.salvarContaBanco(d, { id: 'ANK', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox', chave_pix: 'chave-aleatoria-ank', dias_baixa: 30, instrucoes: 'Após o vencimento, pagar só pelo Pix' }, 'teste');
  R.salvarContaBanco(d, { id: 'jck', apelido: 'JCK', emitente_id: jck.id, ambiente: 'producao', chave_pix: '', dias_baixa: 0, notificar_email: '1', notificar_sms: '', notificar_emissao: '1', notificar_antes: '', notificar_vencimento: '', notificar_depois: '' }, 'teste');
  R.salvarConfigBanco(d, { ativo: true }, 'teste');
}

test('o mapa da API é o mesmo no site e na ponte', () => {
  assert.equal(fs.readFileSync(new URL('../docs/js/mapa-c6.js', import.meta.url), 'utf8'), fs.readFileSync(new URL('../ponte-c6/mapa-c6.mjs', import.meta.url), 'utf8'));
});

test('normalizar cria config_banco com contas e o campo banco nos boletos antigos', () => {
  const d = { formato: 'imoveis-v1', cobrancas: [{ id: 1, contrato_id: 1, competencia: '2026-02', vencimento: '2026-03-10', aluguel: 1000, desconto: 0 }], contratos: [], imoveis: [] };
  R.normalizar(d);
  assert.deepEqual(d.config_banco, { ...R.CONFIG_BANCO_PADRAO, ...R.CONFIG_BANCO_FASE2, contas: [] }); // base + campos da fase 2
  assert.equal(d.cobrancas[0].banco, null);
  // senha e endereço da ponte gravados por uma versão anterior saem do JSON compartilhado
  d.config_banco.senha_ponte = 'segredo'; d.config_banco.ponte_url = 'http://x';
  R.normalizar(d);
  assert.equal(d.config_banco.senha_ponte, undefined);
  assert.equal(d.config_banco.ponte_url, undefined);
  // banco antigo com conta incompleta ganha os campos novos (inclusive os objetos de notificação e negativação)
  d.config_banco.contas = [{ id: 'ank', emitente_id: 1, notificar: { sms: false } }];
  R.normalizar(d);
  assert.equal(d.config_banco.contas[0].ambiente, 'sandbox');
  assert.equal(d.config_banco.contas[0].dias_baixa, 30);
  assert.deepEqual(d.config_banco.contas[0].notificar, { ...R.CONTA_BANCO_PADRAO.notificar, sms: false });
  assert.deepEqual(d.config_banco.contas[0].negativacao, { ativa: false, dias_atraso: 30 });
  assert.equal(R.bancoAtivo(d), false);
  assert.match(R.motivoBancoInativo(d), /desligada/);
});

test('sem contas: integração indisponível com a explicação de aguardar as chaves', () => {
  const { d } = base();
  assert.equal(R.bancoAtivo(d), false);
  assert.match(R.motivoBancoInativo(d), /Aguardando as chaves da API do C6/);
  assert.throws(() => R.salvarConfigBanco(d, { ativo: true }, 'teste'), /pelo menos uma conta/);
  assert.equal(R.contaEmissora(d), null);
});

test('contas por empresa: id normalizado, uma empresa por conta, padrão (ANK), carteira e exclusão', () => {
  const { d, ank, jck } = base();
  comContas(d, ank, jck);
  const cfg = R.configBanco(d);
  assert.deepEqual(cfg.contas.map((x) => x.id), ['ank', 'jck']);
  assert.equal(cfg.conta_padrao_id, 'ank');
  assert.equal(cfg.modo_conta_boleto, 'padrao');
  assert.equal(cfg.ativo, true);
  assert.equal(cfg.ponte_url, undefined); // endereço e senha da ponte ficam só no navegador
  assert.equal(R.bancoAtivo(d), true);
  assert.equal(R.carteiraDaConta(cfg.contas[0]), '21');
  assert.equal(R.carteiraDaConta(cfg.contas[1]), '15');
  assert.equal(R.carteiraDaConta({ ...cfg.contas[1], carteira: '17' }), '17');
  assert.deepEqual(cfg.contas[0].notificar, R.CONTA_BANCO_PADRAO.notificar); // padrão: tudo ligado
  assert.deepEqual(cfg.contas[1].notificar, { email: true, sms: false, emissao: true, antes: false, vencimento: false, depois: false });
  assert.throws(() => R.salvarContaBanco(d, { id: 'outra', emitente_id: ank.id }, 'teste'), /já está ligada à conta "ank"/);
  assert.throws(() => R.salvarContaBanco(d, { id: 'x', emitente_id: 999 }, 'teste'), /empresa dona/);
  // histórico sem as contas (que têm o próprio registro)
  const h = d.historico.find((x) => x.descricao === 'Configuração do banco (C6) alterada');
  assert.equal(h.detalhes.config_banco.para.contas, undefined);
  assert.equal(h.detalhes.config_banco.para.ativo, true);
  // negativação por conta
  R.salvarContaBanco(d, { id: 'ank', emitente_id: ank.id, negativacao_ativa: '1', negativacao_dias: '45' }, 'teste');
  assert.deepEqual(R.contaBanco(d, 'ank').negativacao, { ativa: true, dias_atraso: 45 });
  assert.equal(R.contaBanco(d, 'ank').chave_pix, 'chave-aleatoria-ank'); // o que não veio no formulário fica como estava
  R.excluirContaBanco(d, 'ank', 'teste');
  assert.equal(R.configBanco(d).conta_padrao_id, 'jck');
  R.excluirContaBanco(d, 'jck', 'teste');
  assert.equal(R.configBanco(d).ativo, false);
});

test('conta dos boletos: sempre a padrão; no modo "escolher", pergunta SEMPRE (pré-marcada a da empresa do imóvel quando é uma só, senão a padrão)', () => {
  const { d, ank, jck, loja } = base();
  comContas(d, ank, jck);
  R.gerarCobrancas(d, '2026-02', 'teste');
  const cb = d.cobrancas[0];
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: jck.id, percentual: 100 }, 'teste');
  assert.equal(R.contaSugerida(d, cb).id, 'ank'); // modo padrão: ANK mesmo com o imóvel da JCK
  R.salvarConfigBanco(d, { modo_conta_boleto: 'escolher' }, 'teste');
  assert.equal(R.contaSugerida(d, cb), null); // pergunta mesmo com uma só empresa no imóvel (pedido do dono)
  assert.equal(R.contaPreMarcada(d, cb).id, 'jck'); // ... já marcada a única empresa do imóvel
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 50 }, 'teste');
  assert.deepEqual(R.contasDoImovel(d, cb).map((x) => x.id), ['ank', 'jck']);
  assert.equal(R.contaSugerida(d, cb), null); // precisa perguntar
  assert.equal(R.contaPreMarcada(d, cb).id, 'ank'); // vem marcada a padrão
  R.salvarConfigBanco(d, { modo_conta_boleto: 'padrao', conta_padrao_id: 'jck' }, 'teste');
  assert.equal(R.contaEmissora(d).id, 'jck');
  assert.throws(() => R.salvarConfigBanco(d, { conta_padrao_id: 'nao-existe' }, 'teste'), /conta padrão/);
});

test('pedidoBoletoC6: valor cheio, desconto até o vencimento, multa e juros em %, pagador, Pix, avisos e referência de 26 caracteres', () => {
  const { d, ank, jck } = base();
  comContas(d, ank, jck);
  R.gerarCobrancas(d, '2026-02', 'teste'); // mês cheio: aluguel 3.644,45, desconto 364,45
  const cb = d.cobrancas[0];
  const conta = R.contaBanco(d, 'ank');
  const ref = R.referenciaExterna(cb, 1762300000000);
  assert.match(ref, /^[A-Z0-9]{26}$/);
  assert.equal(ref.startsWith('B00000001'), true);
  const p = R.pedidoBoletoC6(d, cb, conta, ref);
  assert.equal(p.external_reference_id, ref);
  assert.equal(p.amount, 3644.45); // número em reais, valor cheio
  assert.equal(p.due_date, '2026-03-10');
  assert.equal(p.payer.name, 'Maria Exemplo da Silva');
  assert.equal(p.payer.tax_id, '52998224725');
  assert.equal(p.payer.email, 'maria@exemplo.com.br');
  assert.deepEqual(p.payer.address, { address: 'Rua das Flores, 45', neighborhood: 'Centro', city: 'Curitiba', state: 'PR', zip_code: '80010000' });
  assert.equal(p.description, 'ALUGUEL RS3.644,45 COM BONF. RS3.280,00');
  assert.ok(p.description.length <= 100);
  assert.equal(p.days_after_due_date, 30);
  assert.equal(p.origin, 'ADM-IMOVEIS');
  assert.deepEqual(p.fees, { fine_type: 'PERCENTAGE', fine_value: 10, fine_deadline: 0, interest_type: 'MONTHLY_PERCENTAGE', interest_value: 1, interest_deadline: 0,
    discount_type: 'VALUE_PER_DAY', first_discount_value: 364.45, first_discount_deadline: 0 });
  assert.deepEqual(p.payment_method.pix, { key: 'chave-aleatoria-ank', type: 'EVP' });
  assert.equal(p.payment_method.bank_slip.billing_scheme, '21');
  assert.equal(p.payment_method.bank_slip.your_number, '1');
  assert.deepEqual(p.payment_method.bank_slip.instructions, ['Após o vencimento, pagar só pelo Pix', 'ALUGUEL RS3.644,45', 'COM BONF. RS3.280,00']);
  // avisos automáticos: e-mail e SMS × 4 momentos = 8
  assert.equal(p.payer_notification.length, 8);
  assert.deepEqual(p.payer_notification[0], { channel: 'EMAIL', destination: 'maria@exemplo.com.br', notification_date: 'ISSUE_DATE' });
  assert.deepEqual(p.payer_notification[4], { channel: 'SMS', destination: '41999990000', notification_date: 'ISSUE_DATE' });
  // conta JCK: sem Pix, carteira 15, só e-mail na emissão, não baixa sozinho
  const p2 = R.pedidoBoletoC6(d, cb, R.contaBanco(d, 'jck'), ref);
  assert.equal(p2.payment_method.pix, undefined);
  assert.equal(p2.payment_method.bank_slip.billing_scheme, '15');
  assert.equal(p2.days_after_due_date, 0);
  assert.deepEqual(p2.payer_notification, [{ channel: 'EMAIL', destination: 'maria@exemplo.com.br', notification_date: 'ISSUE_DATE' }]);
  // desconto configurável: até 3 dias antes, outro tipo
  R.salvarContaBanco(d, { id: 'ank', emitente_id: ank.id, desconto_dias_antes: '3', tipo_desconto: 'MONTHLY_PERCENTAGE' }, 'teste');
  const p3 = R.pedidoBoletoC6(d, cb, R.contaBanco(d, 'ank'), ref);
  assert.equal(p3.fees.first_discount_deadline, 3);
  assert.equal(p3.fees.discount_type, 'MONTHLY_PERCENTAGE');
});

test('avisos ao pagador: exceção por contrato (não notificar / escolher) e sem contato não manda o canal', () => {
  const { d, ank, jck, c } = base();
  comContas(d, ank, jck);
  R.gerarCobrancas(d, '2026-02', 'teste');
  const cb = d.cobrancas[0];
  const conta = R.contaBanco(d, 'ank');
  c.notificacao_banco = 'Não notificar';
  assert.equal(R.pedidoBoletoC6(d, cb, conta).payer_notification, undefined);
  c.notificacao_banco = 'Escolher';
  Object.assign(c, { notif_email: false, notif_sms: true, notif_emissao: false, notif_antes: true, notif_vencimento: true, notif_depois: false });
  assert.deepEqual(R.pedidoBoletoC6(d, cb, conta).payer_notification, [{ channel: 'SMS', destination: '41999990000', notification_date: 'BEFORE_DUE_DATE' }, { channel: 'SMS', destination: '41999990000', notification_date: 'DUE_DATE' }]);
  c.notificacao_banco = 'Usar o padrão da conta';
  c.inquilino_telefone = '';
  assert.equal(R.pedidoBoletoC6(d, cb, conta).payer_notification.length, 4); // só e-mail
});

test('pedidoBoletoC6 com FCI: multa e juros em valor (não incidem sobre o FCI)', () => {
  const { d, ank, jck } = base();
  comContas(d, ank, jck);
  R.gerarCobrancas(d, '2026-02', 'teste');
  const cb = d.cobrancas[0];
  R.atualizar(d, 'cobrancas', cb.id, { fci: 10000 }, 'teste', 'fci');
  const p = R.pedidoBoletoC6(d, cb, R.contaBanco(d, 'ank'));
  assert.equal(p.amount, 3744.45);
  assert.equal(p.fees.fine_type, 'FIXED_VALUE');
  assert.equal(p.fees.fine_value, 364.45); // 10% de 3.644,45, sem o FCI
  assert.equal(p.fees.interest_type, 'VALUE_PER_DAY');
  assert.equal(p.fees.interest_value, 1.21);
});

test('pedidoBoletoC6: endereço do imóvel completa o do inquilino; exige CPF/CNPJ e cidade/CEP', () => {
  const { d, ank, jck, c } = base();
  comContas(d, ank, jck);
  R.gerarCobrancas(d, '2026-02', 'teste');
  const cb = d.cobrancas[0];
  c.inquilino_endereco = 'Rua Qualquer, 10';
  const p = R.pedidoBoletoC6(d, cb, R.contaBanco(d, 'ank'));
  assert.deepEqual(p.payer.address, { address: 'Rua Qualquer, 10', neighborhood: 'São Lourenço', city: 'Curitiba', state: 'PR', zip_code: '82200100' });
  c.inquilino_cpf = '';
  assert.throws(() => R.pedidoBoletoC6(d, cb, R.contaBanco(d, 'ank')), /CPF\/CNPJ/);
  c.inquilino_cpf = '11.222.333/0001-81';
  c.inquilino_endereco = '';
  R.buscar(d, 'imoveis', c.imovel_id).cep = '';
  assert.throws(() => R.pedidoBoletoC6(d, cb, R.contaBanco(d, 'ank')), /endereço/);
  assert.throws(() => R.pedidoBoletoC6(d, cb, null), /Escolha a conta/);
});

test('centavos ↔ reais da API', () => {
  assert.equal(R.centavosParaReais(364445), 3644.45);
  assert.equal(R.centavosParaReais(5), 0.05);
  assert.equal(R.centavosParaReais(10), 0.1);
  assert.equal(R.reaisParaCentavos('3644.45'), 364445);
  assert.equal(R.reaisParaCentavos(3644.45), 364445);
  assert.equal(R.reaisParaCentavos(0.1 + 0.2), 30);
  assert.equal(R.reaisParaCentavos('150,00'), 15000);
});

/** Resposta da emissão (POST), como na OpenAPI: só id, referência, valor, vencimento e payment_method. */
const RESPOSTA_EMISSAO = {
  id: 'f3b1', external_reference_id: 'B00000001ABCDEFGHIJ0000000', amount: 3644.45, due_date: '2026-03-10',
  payment_method: { bank_slip: { originator_id: '9', billing_scheme: '21', billing_type: 'HYBRID', digitable_line: '33690.00001 00000.000002 00000.000003 1 00000000364445', bar_code: '33691000000003644450000000000000000000000000', our_number: '1234567890', number: '1' },
    pix: { qr_code: '00020126580014br.gov.bcb.pix0136abc5204000053039865406364.455802BR5903ANK6008CURITIBA62070503***6304ABCD', image_content: 'iVBORw0KGgo=', mime_type: 'image/png', reference: 'TX1' } },
};
/** Consulta (GET): a emissão mais status, emission_date, denial_info e payer_notification. */
const CONSULTA = { ...RESPOSTA_EMISSAO, status: 'CREATED', emission_date: '2026-02-20', description: 'ALUGUEL', denial_info: null,
  payer_notification: [{ channel: 'EMAIL', destination: 'maria@exemplo.com.br', notification_date: 'ISSUE_DATE', status: 'SENT', sent_at: '2026-02-20T10:00:00Z' }] };

test('registrarBoletoBancario grava linha digitável, código de barras, Pix e QR; consulta traz avisos; histórico registrado', () => {
  const { d, ank, jck } = base();
  comContas(d, ank, jck);
  R.gerarCobrancas(d, '2026-02', 'teste');
  const cb = d.cobrancas[0];
  const b = R.registrarBoletoBancario(d, cb.id, { ...RESPOSTA_EMISSAO, ambiente: 'sandbox', simulado: true }, 'teste', { conta_id: 'ank', ambiente: 'sandbox' });
  assert.equal(cb.banco.situacao, 'emitido');
  assert.equal(cb.banco.provedor, 'c6');
  assert.equal(cb.banco.conta_id, 'ank');
  assert.equal(cb.banco.ambiente, 'sandbox');
  assert.equal(cb.banco.id_externo, 'B00000001ABCDEFGHIJ0000000');
  assert.equal(cb.banco.nosso_numero, '1234567890');
  assert.equal(cb.banco.linha_digitavel, RESPOSTA_EMISSAO.payment_method.bank_slip.digitable_line);
  assert.equal(cb.banco.codigo_barras, RESPOSTA_EMISSAO.payment_method.bank_slip.bar_code);
  assert.equal(cb.banco.pix_copia_cola, RESPOSTA_EMISSAO.payment_method.pix.qr_code);
  assert.equal(cb.banco.pix_qr_base64, 'iVBORw0KGgo=');
  assert.equal(cb.banco.pix_qr_mime, 'image/png');
  assert.equal(cb.banco.valor, 364445);
  assert.equal(cb.banco.simulado, true);
  assert.ok(cb.banco.emitido_em);
  assert.equal(b, cb.banco);
  assert.equal(R.emitidoNoBanco(cb), true);
  assert.equal(R.divergenciaBancaria(cb), null);
  assert.equal(R.boletosParaEmitir(d, '2026-02').length, 0);
  const h = d.historico.at(-1);
  assert.equal(h.tabela, 'cobrancas');
  assert.match(h.descricao, /emitido no C6 .*sandbox/);
  R.registrarBoletoBancario(d, cb.id, CONSULTA, 'teste');
  assert.deepEqual(cb.banco.notificacoes, [{ canal: 'EMAIL', destino: 'maria@exemplo.com.br', momento: 'ISSUE_DATE', situacao: 'SENT', enviada_em: '2026-02-20T10:00:00Z' }]);
  assert.ok(cb.banco.consultado_em);
});

test('consulta: aguardando confirmação continua emitido; pago vira "pago" com as datas do payments[]; pagamento no sistema só pelo usuário', () => {
  const { d, ank, jck } = base();
  comContas(d, ank, jck);
  R.gerarCobrancas(d, '2026-02', 'teste');
  const cb = d.cobrancas[0];
  R.registrarBoletoBancario(d, cb.id, RESPOSTA_EMISSAO, 'teste', { conta_id: 'ank', ambiente: 'sandbox' });
  R.registrarBoletoBancario(d, cb.id, { ...CONSULTA, status: 'WAITING_CONFIRMATION' }, 'teste');
  assert.equal(cb.banco.situacao, 'emitido');
  assert.equal(R.aguardandoCredito(cb), true);
  R.registrarBoletoBancario(d, cb.id, { ...CONSULTA, status: 'PAID', payments: [{ amount: '3280.00', external_payment_id: 'p1', payment_date: '2026-03-09', credit_date: '2026-03-10', payment_type: 'PIX' }] }, 'teste');
  assert.equal(cb.banco.situacao, 'pago');
  assert.equal(cb.banco.pago_em, '2026-03-09');
  assert.equal(cb.banco.credito_em, '2026-03-10');
  assert.equal(cb.banco.valor_pago, 328000);
  assert.equal(cb.data_pagamento, null); // o sistema não registra sozinho
  assert.equal(R.situacaoBancaria('CANCELED'), 'cancelado');
  assert.equal(R.situacaoBancaria('CANCELLED'), 'cancelado');
  assert.equal(R.situacaoBancaria(''), 'emitido');
});

test('erro na emissão, cancelamento e reemissão; boleto alterado depois de emitido diverge e o PATCH alinha', () => {
  const { d, ank, jck } = base();
  comContas(d, ank, jck);
  R.gerarCobrancas(d, '2026-02', 'teste');
  const cb = d.cobrancas[0];
  R.registrarErroBancario(d, cb.id, 'O banco respondeu 400: payer.address.zip_code inválido', 'teste', { conta_id: 'ank', ambiente: 'sandbox' });
  assert.equal(cb.banco.situacao, 'erro');
  assert.match(cb.banco.erro, /zip_code/);
  assert.equal(R.emitidoNoBanco(cb), false);
  assert.equal(R.boletosParaEmitir(d, '2026-02').length, 1);
  R.registrarBoletoBancario(d, cb.id, RESPOSTA_EMISSAO, 'teste', { conta_id: 'ank', ambiente: 'sandbox' });
  assert.equal(cb.banco.erro, null);
  // ajuste do mês depois de emitido: o banco cobra o valor antigo
  R.atualizar(d, 'cobrancas', cb.id, { outros: 10000 }, 'teste', 'ajuste');
  const div = R.divergenciaBancaria(cb);
  assert.deepEqual([div.no_banco, div.no_sistema], [364445, 374445]);
  assert.deepEqual(R.alteracaoBoletoC6(d, cb), { amount: 3744.45, due_date: '2026-03-10', description: 'ALUGUEL RS3.644,45 COM BONF. RS3.280,00 COBRANÇA ADICIONAL RS100,00' });
  R.registrarBoletoBancario(d, cb.id, { ...CONSULTA, amount: 3744.45 }, 'teste');
  assert.equal(R.divergenciaBancaria(cb), null);
  R.registrarCancelamentoBancario(d, cb.id, 'teste', { status: 'CANCELED' });
  assert.equal(cb.banco.situacao, 'cancelado');
  assert.equal(cb.banco.linha_digitavel, RESPOSTA_EMISSAO.payment_method.bank_slip.digitable_line); // fica para consulta
  assert.equal(R.emitidoNoBanco(cb), false);
  assert.doesNotThrow(() => R.excluirContaBanco(d, 'ank', 'teste')); // sem boleto aberto na conta, pode sair
  // reemissão depois do cancelamento: a data de emissão é a nova e a anterior fica guardada
  const emitidoAntes = cb.banco.emitido_em;
  cb.banco.emitido_em = '2026-02-20T10:00:00.000Z';
  R.registrarBoletoBancario(d, cb.id, { ...RESPOSTA_EMISSAO, external_reference_id: 'B00000001ZZZZZZZZZZ0000000' }, 'teste', { conta_id: 'jck' });
  assert.notEqual(cb.banco.emitido_em, '2026-02-20T10:00:00.000Z');
  assert.ok(cb.banco.emitido_em > '2026-02-20T10:00:00.000Z');
  assert.equal(cb.banco.consultado_em, null);
  assert.equal(cb.banco.emissoes_anteriores.length, 1);
  assert.deepEqual([cb.banco.emissoes_anteriores[0].emitido_em, cb.banco.emissoes_anteriores[0].id_externo], ['2026-02-20T10:00:00.000Z', 'B00000001ABCDEFGHIJ0000000']);
  assert.ok(cb.banco.emissoes_anteriores[0].cancelado_em);
  assert.ok(emitidoAntes);
  // consulta do boleto reemitido não mexe na data de emissão
  const emitidoNovo = cb.banco.emitido_em;
  R.registrarBoletoBancario(d, cb.id, { ...CONSULTA, external_reference_id: 'B00000001ZZZZZZZZZZ0000000' }, 'teste');
  assert.deepEqual([cb.banco.emitido_em, cb.banco.emissoes_anteriores.length], [emitidoNovo, 1]);
  assert.ok(cb.banco.consultado_em);
  assert.throws(() => R.excluirContaBanco(d, 'jck', 'teste'), /em aberto no banco/);
});

test('negativação: só com a conta ligada; guarda status e data; cancelamento', () => {
  const { d, ank, jck } = base();
  comContas(d, ank, jck);
  R.gerarCobrancas(d, '2026-02', 'teste');
  const cb = d.cobrancas[0];
  R.registrarBoletoBancario(d, cb.id, RESPOSTA_EMISSAO, 'teste', { conta_id: 'ank', ambiente: 'sandbox' });
  assert.deepEqual(R.pedidoNegativacaoC6(45), { deadline: 45 });
  assert.throws(() => R.registrarNegativacao(d, cb.id, { status: 'SCHEDULED' }, 'teste', 30), /desligada/);
  R.salvarContaBanco(d, { id: 'ank', emitente_id: ank.id, negativacao_ativa: '1', negativacao_dias: '30' }, 'teste');
  R.registrarNegativacao(d, cb.id, { id: 'f3b1', external_reference_id: cb.banco.id_externo, status: 'SCHEDULED', denial_date: '2026-04-09' }, 'teste', 30);
  assert.equal(cb.banco.negativacao.situacao, 'SCHEDULED');
  assert.equal(cb.banco.negativacao.data, '2026-04-09');
  assert.equal(cb.banco.negativacao.dias_atraso, 30);
  // a consulta traz denial_info e atualiza
  R.registrarBoletoBancario(d, cb.id, { ...CONSULTA, denial_info: { status: 'IN_PROGRESS', denial_date: '2026-04-09', can_cancel: false } }, 'teste');
  assert.equal(cb.banco.negativacao.situacao, 'IN_PROGRESS');
  assert.equal(cb.banco.negativacao.pode_cancelar, false);
  R.registrarCancelamentoNegativacao(d, cb.id, 'teste');
  assert.equal(cb.banco.negativacao.situacao, M.STATUS_NEGATIVACAO.cancelamento_agendado);
});

test('conferência de pagamentos: período de até 60 dias e casamento da listagem pela referência', () => {
  const { d, ank, jck } = base();
  comContas(d, ank, jck);
  R.gerarCobrancas(d, '2026-02', 'teste');
  const cb = d.cobrancas[0];
  assert.deepEqual(R.periodoConferenciaC6(d, '2026-02', '2026-03-20'), { de: '2026-02-28', ate: '2026-03-20' });
  assert.deepEqual(R.periodoConferenciaC6(d, '2026-02', '2026-06-20'), { de: '2026-02-28', ate: '2026-04-28' });
  R.registrarBoletoBancario(d, cb.id, RESPOSTA_EMISSAO, 'teste', { conta_id: 'ank' });
  const { casados, desconhecidos } = R.casarListagemC6(d, [{ ...CONSULTA, status: 'PAID' }, { external_reference_id: 'OUTRO', status: 'PAID' }], 'ank');
  assert.equal(casados.length, 1);
  assert.equal(casados[0].cb.id, cb.id);
  assert.equal(desconhecidos.length, 1);
  assert.equal(R.casarListagemC6(d, [CONSULTA], 'jck').casados.length, 0);
});

test('partesDoEndereco entende o endereço em uma linha do cadastro', () => {
  assert.deepEqual(R.partesDoEndereco('Av. Sete de Setembro, 1234, apto 12, Batel, Curitiba/PR, CEP 80240-000'),
    { address: 'Av. Sete de Setembro, 1234, apto 12', neighborhood: 'Batel', city: 'Curitiba', state: 'PR', zip_code: '80240000' });
  assert.deepEqual(R.partesDoEndereco('Rua Sem Cidade, 5'), { address: 'Rua Sem Cidade, 5', neighborhood: '', city: '', state: '', zip_code: '' });
  assert.equal(R.partesDoEndereco(''), null);
});
