import assert from 'node:assert/strict';
import test from 'node:test';
import * as CR from '../docs/js/config-regras.js';
import { anexosProntos, dadosDoEmail } from '../docs/js/email-dados.js';
import { modeloEmail, montarEmail } from '../docs/js/modelos-email.js';
import * as G from '../docs/js/regua-email.js';
import * as R from '../docs/js/regras.js';

// Régua de cobrança por e-mail (pedido do dono em 2026-11-16): o sistema prepara, o administrador autoriza. Dados fictícios.
function base(extra = {}) {
  const d = R.bancoVazio();
  R.normalizar(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com',
    data_entrada: '2026-10-01', vigencia_inicio: '2026-10-01', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 8, multa_percentual: 2, juros_mensal_percentual: 1, ...extra }, 'julio');
  R.gerarCobrancas(d, '2026-11', 'julio');
  return { d, c, cb: R.boletoDoMes(d, c.id, '2026-11') };
}
const etapas = (d, cb, dias) => dias.map((h) => G.etapaDoBoleto(cb, h));

test('régua padrão: 3 dias antes, no dia, 3 e 10 dias depois; nada é enviado sozinho (envio desligado)', () => {
  assert.deepEqual(CR.PADRAO_SISTEMA.regua_email_dias, [-3, 0, 3, 10]);
  assert.equal(CR.PADRAO_SISTEMA.regua_envio, false);
  assert.deepEqual(CR.limparValorRegra('regua_email_dias', [10, -3, 3, 0, 3]), [-3, 0, 3, 10]);
  assert.deepEqual(CR.limparValorRegra('regua_email_dias', []), []);
  assert.throws(() => CR.limparValorRegra('regua_email_dias', [90]), /máximo/);
});

test('etapa de cada dia: vence qui 10/12/2026; cobrança de atraso só depois dos 3 dias úteis do banco', () => {
  const { d, cb } = base();
  assert.equal(cb.vencimento, '2026-12-10');
  assert.equal(G.inicioDaCobranca(cb), '2026-12-16');
  assert.deepEqual(etapas(d, cb, ['2026-12-06', '2026-12-07', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-13', '2026-12-15', '2026-12-16', '2026-12-19', '2026-12-20', '2027-01-19', '2027-01-20']),
    [null, -3, -3, 0, null, null, null, 3, 3, 10, 10, null]);
  // vencimento no sábado: "no dia" é a segunda-feira (último dia para pagar sem multa); o lembrete de antes vai até a sexta
  const sab = { ...cb, vencimento: '2026-10-10' };
  assert.deepEqual(['2026-10-07', '2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13'].map((h) => G.etapaDoBoleto(sab, h)), [-3, -3, -3, -3, 0]);
});

test('fila: um e-mail por boleto na etapa de hoje; pago, em acordo, recusado ou enviado sai', () => {
  const { d, c, cb } = base();
  let fila = G.filaRegua(d, '2026-12-08');
  assert.equal(fila.length, 1);
  assert.deepEqual([fila[0].dias, fila[0].modelo, fila[0].para, fila[0].valor], [-3, 'cobranca_antes', 'maria@exemplo.com', R.totais(cb).a_pagar_pontual]);
  // "Não enviar" no lembrete de antes: não volta; no dia do vencimento vem a etapa seguinte
  G.registrarDecisao(d, { cobranca_id: cb.id, contrato_id: c.id, dias: -3, situacao: 'recusado' }, 'admin', '2026-12-08');
  assert.equal(G.filaRegua(d, '2026-12-09').length, 0);
  assert.equal(G.filaRegua(d, '2026-12-10')[0].dias, 0);
  assert.throws(() => G.registrarDecisao(d, { cobranca_id: cb.id, contrato_id: c.id, dias: -3, situacao: 'enviado' }, 'admin'), /já foi decidido/);
  // atraso: valor de hoje com multa e juros
  fila = G.filaRegua(d, '2026-12-16');
  assert.equal(fila[0].dias, 3);
  assert.ok(fila[0].valor > R.totais(cb).a_pagar_sem_desconto);
  G.registrarDecisao(d, { cobranca_id: cb.id, contrato_id: c.id, dias: 3, situacao: 'enviado', para: 'maria@exemplo.com' }, 'admin', '2026-12-16');
  assert.equal(G.filaRegua(d, '2026-12-17').length, 0);
  assert.equal(G.filaRegua(d, '2026-12-20')[0].dias, 10);
  // pago: sai da fila
  R.registrarPagamento(d, cb.id, '2026-12-19', null, 'julio');
  assert.equal(G.filaRegua(d, '2026-12-20').length, 0);
});

test('fila: aguardando crédito no banco, boleto pago no banco, contrato encerrado e sem e-mail', () => {
  const { d, cb } = base({ inquilino_email: '' });
  assert.match(G.filaRegua(d, '2026-12-08')[0].avisos.join(' '), /Sem e-mail/);
  cb.banco = { situacao: 'emitido', situacao_banco: 'WAITING_CONFIRMATION' };
  assert.equal(G.filaRegua(d, '2026-12-16').length, 0, 'pagou e o banco ainda não creditou: sem cobrança de atraso');
  cb.banco = { situacao: 'pago' };
  assert.equal(G.filaRegua(d, '2026-12-08').length, 0);
  cb.banco = null;
  R.atualizar(d, 'contratos', cb.contrato_id, { ativo: false }, 'julio');
  assert.equal(G.filaRegua(d, '2026-12-08').length, 0);
});

test('fila: entrada no extrato ainda sem destino com o valor do boleto avisa (pode ser o pagamento)', () => {
  const { d, cb } = base();
  d.movimentacoes_banco.push({ id: 1, tipo: 'entrada', valor: R.totais(cb).a_pagar_pontual, data: '2026-12-11', classificacao: null });
  assert.match(G.filaRegua(d, '2026-12-16')[0].avisos.join(' '), /entrada de .* em 11\/12\/2026 ainda sem destino/);
});

test('regra regua_email_dias vazia: nada é preparado; dias escolhidos pelo administrador valem', () => {
  const { d, cb } = base();
  R.salvarRegrasSistema(d, { regua_email_dias: [] }, 'admin');
  try {
    assert.equal(G.filaRegua(d, '2026-12-08').length, 0);
    R.salvarRegrasSistema(d, { regua_email_dias: [-5, 1] }, 'admin');
    assert.equal(G.etapaDoBoleto(cb, '2026-12-05'), -5);
    assert.equal(G.etapaDoBoleto(cb, '2026-12-11'), null);
    assert.equal(G.etapaDoBoleto(cb, '2026-12-16'), 1);
  } finally { CR.usarRegras(null); }
});

test('textos da régua: valor em dia, multa, juros, Pix e linha digitável; anexa boleto do C6 e QR Code', () => {
  const { d, c, cb } = base();
  cb.banco = { situacao: 'emitido', id_externo: 'ref-1', pix_copia_cola: '00020126PIXTESTE', linha_digitavel: '33690.00000 00000.000000 00000.000000 1 00000000000000', pix_qr_base64: 'iVBORw0KGgo=' };
  const alvo = { contrato: c, cobranca: cb };
  const antes = montarEmail(modeloEmail(d, 'cobranca_antes'), dadosDoEmail(d, alvo, {}, '2026-12-07'));
  assert.match(antes.assunto, /boleto do aluguel de 11\/2026 \(Rua Exemplo, 1\) vence em 10\/12\/2026/);
  assert.match(antes.texto, /no valor de R\$ 1\.242,00 \(já com a bonificação de pontualidade\)/);
  assert.match(antes.texto, /R\$ 1\.350,00, mais multa de 2% e juros de 1% ao mês/);
  assert.match(antes.texto, /PIX COPIA E COLA\n00020126PIXTESTE/);
  assert.match(antes.texto, /LINHA DIGITÁVEL DO BOLETO\n33690/);
  const atraso = montarEmail(modeloEmail(d, 'cobranca_atraso'), dadosDoEmail(d, alvo, {}, '2026-12-16'));
  assert.match(atraso.texto, /\(6 dia\(s\) de atraso\)/);
  assert.match(atraso.texto, /Valor para pagamento hoje \(16\/12\/2026\): R\$ 1\.379,70 \(R\$ 1\.350,00 \+ multa de R\$ 27,00 \+ juros de R\$ 2,70\)/);
  for (const e of [antes, atraso, montarEmail(modeloEmail(d, 'cobranca_dia'), dadosDoEmail(d, alvo, {}, '2026-12-10'))]) {
    assert.doesNotMatch(e.texto + e.assunto, /\[preencher|\[se |\[fim\]|\{[a-z_]+\}/i);
  }
  assert.deepEqual(anexosProntos(d, modeloEmail(d, 'cobranca_dia'), alvo).map((a) => [a.tipo, a.qual, a.nome]),
    [['boleto', 'pdf', 'boleto-2026-11.pdf'], ['boleto', 'pix', 'pix-2026-11.png']]);
  // sem emissão no banco: sem anexo e sem os códigos no texto
  cb.banco = null;
  assert.deepEqual(anexosProntos(d, modeloEmail(d, 'cobranca_dia'), alvo), []);
  assert.doesNotMatch(montarEmail(modeloEmail(d, 'cobranca_dia'), dadosDoEmail(d, alvo, {}, '2026-12-10')).texto, /PIX|LINHA/);
});

test('tabela nova regua_emails existe no banco e na nuvem', async () => {
  const { TABELAS_CONHECIDAS } = await import('../nuvem/cofre.mjs');
  assert.ok('regua_emails' in R.TABELAS);
  assert.ok(TABELAS_CONHECIDAS.includes('regua_emails'));
  assert.ok(Array.isArray(R.bancoVazio().regua_emails));
});
