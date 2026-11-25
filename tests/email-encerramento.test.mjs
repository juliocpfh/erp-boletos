// E-mail do encerramento do contrato (24/11/2026): o texto vem do saldo do cálculo final. Antes dizia "Não há valores
// pendentes" mesmo com saldo a pagar (simulação de 24/11: saldo de R$ 1.270,60).
import assert from 'node:assert/strict';
import test from 'node:test';
import { anexosProntos, dadosDoEmail } from '../docs/js/email-dados.js';
import { MODELOS_EMAIL, atualizarTextoEmail, modeloEmail, montarEmail } from '../docs/js/modelos-email.js';
import * as R from '../docs/js/regras.js';

function comSaida(debitos, garantia = 180000, extra = {}) {
  const d = R.bancoVazio();
  R.normalizar(d);
  R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true,
    conta_deposito: 'Banco 336 (C6) · Ag. 0001 · C/C 1234-5' }, 'j');
  R.normalizar(d);
  const i = R.inserir(d, 'imoveis', { nome: 'Flores 3', endereco: 'Rua das Flores, 120', cidade: 'Curitiba', uf: 'PR' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com',
    aluguel_inicial: 200000, dia_vencimento: 10, data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01', prazo_meses: 30, cobranca_mes_seguinte: true,
    multa_percentual: 10, juros_mensal_percentual: 1, garantia_tipo: 'Caução', caucao_valor: garantia, data_saida: '2026-10-31' }, 'j');
  const e = R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2026-10-31', garantia_valor: garantia, garantia_corrigida: garantia,
    debitos, saldo: garantia - debitos, ...extra }, 'j');
  return { d, c, e };
}
const texto = (d, c) => montarEmail(modeloEmail(d, 'saida_encerramento'), dadosDoEmail(d, { contrato: c }, {}, '2026-11-20')).texto;

test('saldo a pagar em aberto: diz o valor e como pagar, nunca "Não há valores pendentes"', () => {
  const { d, c, e } = comSaida(307060);
  let t = texto(d, c);
  assert.match(t, /Fica pendente o saldo a pagar de R\$ 1\.270,60\. Deposite ou faça o Pix na conta abaixo/);
  assert.match(t, /Banco 336 \(C6\)/);
  assert.match(t, /Saldo a pagar: R\$ 1\.270,60/); // o acerto vai no texto
  assert.doesNotMatch(t, /Não há valores pendentes/);
  assert.doesNotMatch(t, /\[preencher|\[se |\[fim\]|\[senão\]/);
  // com o boleto do saldo: segue o boleto
  R.gerarBoletoDoSaldo(d, e.id, '2026-11-30', 'j', '2026-11-20');
  t = texto(d, c);
  assert.match(t, /Fica pendente o saldo a pagar de R\$ 1\.270,60\. Segue o boleto, com vencimento em 30\/11\/2026\./);
  assert.doesNotMatch(t, /Deposite ou faça o Pix/);
  // pago: agora sim, nada pendente
  R.atualizar(d, 'encerramentos', e.id, { garantia_devolvida_em: '2026-11-25' }, 'j');
  t = texto(d, c);
  assert.match(t, /Recebemos em 25\/11\/2026 o pagamento do saldo de R\$ 1\.270,60 e encerramos o contrato/);
  assert.match(t, /Não há valores pendentes/);
});

test('saldo a devolver: diz o valor; devolvido, "Devolvemos" e nada pendente', () => {
  const { d, c, e } = comSaida(50000);
  let t = texto(d, c);
  assert.match(t, /Temos a devolver a você o saldo de R\$ 1\.300,00/);
  assert.doesNotMatch(t, /Não há valores pendentes|\[preencher/);
  R.atualizar(d, 'encerramentos', e.id, { garantia_devolvida_em: '2026-11-25' }, 'j');
  t = texto(d, c);
  assert.match(t, /Devolvemos R\$ 1\.300,00 em 25\/11\/2026 e encerramos o contrato/);
  assert.match(t, /Não há valores pendentes/);
});

test('saldo zero: "Não há valores pendentes" e a frase começa com maiúscula', () => {
  const { d, c } = comSaida(180000);
  const t = texto(d, c);
  assert.match(t, /Encerramos o contrato do imóvel/);
  assert.match(t, /Não há valores pendentes/);
  assert.doesNotMatch(t, /saldo a pagar|devolver a você/);
});

test('modelo já editado pelo dono: só os dois trechos antigos mudam, a edição fica; aplicar de novo não muda nada', () => {
  const antigo = 'Olá, {nome}, tudo certo?\n\n[se devolver]Devolvemos {saldo} em {data_devolucao} e [fim]encerramos o contrato do imóvel da {imovel}. Segue o termo de entrega, acerto final e quitação[se devolver], com o comprovante[fim]: responda com ele assinado, por favor (pode ser pelo gov.br).\n\nNão há valores pendentes, salvo contas de consumo e tributos do período que ainda cheguem: mandaremos com a conta ou a guia.\n\nAbraço do Julio.';
  const novo = atualizarTextoEmail('saida_encerramento', antigo);
  assert.match(novo, /^Olá, \{nome\}, tudo certo\?/);
  assert.match(novo, /Abraço do Julio\.$/);
  assert.match(novo, /\[se saldo_pendente\]Encerramos/);
  assert.match(novo, /Fica pendente o saldo a pagar/);
  assert.equal(atualizarTextoEmail('saida_encerramento', novo), novo);
  // o padrão já vem com o texto novo e não é mexido
  const padrao = MODELOS_EMAIL.find((m) => m.chave === 'saida_encerramento').texto;
  assert.equal(atualizarTextoEmail('saida_encerramento', padrao), padrao);
  // com o gravado: o e-mail sai com o saldo pendente
  const { d, c } = comSaida(307060);
  d.modelos_email.push({ id: 1, chave: 'saida_encerramento', assunto: 'Contrato encerrado – {imovel}', texto: antigo });
  const t = texto(d, c);
  assert.match(t, /Fica pendente o saldo a pagar de R\$ 1\.270,60/);
  assert.match(t, /Abraço do Julio\./);
  assert.doesNotMatch(t, /Não há valores pendentes/);
});

test('boleto do saldo emitido no C6 entra nos anexos do encerramento; pago, sai', () => {
  const { d, c, e } = comSaida(307060);
  const cb = R.gerarBoletoDoSaldo(d, e.id, '2026-11-30', 'j', '2026-11-20');
  R.atualizar(d, 'cobrancas', cb.id, { banco: { situacao: 'emitido', conta_id: 'jck', id_externo: 'X1', linha_digitavel: '33690.00000 00000.000000 00000.000000 1 00000000127060', pix_copia_cola: '000201PIX', pix_qr_base64: 'AAAA' } }, 'j');
  const tipos = () => anexosProntos(d, modeloEmail(d, 'saida_encerramento'), { contrato: c }).filter((a) => a.tipo === 'boleto').map((a) => a.qual);
  assert.deepEqual(tipos(), ['pdf', 'pix']);
  assert.match(texto(d, c), /Linha digitável: 33690/);
  R.atualizar(d, 'encerramentos', e.id, { garantia_devolvida_em: '2026-11-25' }, 'j');
  R.atualizar(d, 'cobrancas', cb.id, { data_pagamento: '2026-11-25' }, 'j');
  assert.deepEqual(tipos(), []);
});
