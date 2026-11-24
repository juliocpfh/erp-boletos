import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

// Conferência dos boletos de 24/11/2026 (item A5): descrição do boleto e o limite de 100 letras do C6. Dados fictícios.
function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', complemento: '', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-03-01', vigencia_inicio: '2026-03-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true, taxa_boleto: 350,
    desconto_pontualidade_percentual: 10, multa_percentual: 10, juros_mensal_percentual: 1, conta_condominio: 'Por conta do inquilino' }, 'j');
  R.gerarCobrancas(d, '2026-11', 'j');
  const cb = R.boletoDoMes(d, c.id, '2026-11');
  return { d, c, cb };
}
const ressarcir = (d, c, valor) => {
  R.inserir(d, 'ressarcimentos', { contrato_id: c.id, competencia_condominio: '2026-11', descricao: 'Fundo de obras', valor, data_pagamento: '2026-11-05', competencia_abatimento: '2026-11' }, 'j');
  R.aplicarRessarcimentos(d, c, '2026-11', 'j');
};

test('descrição curta fica por extenso e sem excesso', () => {
  const { d, c, cb } = base();
  ressarcir(d, c, 5000);
  const b = R.dadosBoleto(d, cb);
  assert.equal(b.descricao, 'ALUGUEL RS2.000,00\nCOM BONF. RS1.800,00\nTARIFA COBRANÇA RS3,50 RESSARCIMENTO CONDOMÍNIO -RS50,00');
  assert.equal(b.excesso, 0);
});

test('aluguel + IPTU + seguro + tarifa + ressarcimento: encurta a tarifa e o ressarcimento; o que ainda sobra é informado', () => {
  const { d, c, cb } = base();
  Object.assign(cb, { iptu: 12345, iptu_parcela: 'IPTU 2026 parc. 9/10', seguro: 3000, seguro_parcela: 'Seguro parc. 3/12' });
  ressarcir(d, c, 5000);
  const b = R.dadosBoleto(d, cb);
  // antes: 120 letras, e o C6 cortava justamente o ressarcimento (que fica no fim), sem aviso na tela
  assert.equal(b.descricao, 'ALUGUEL RS2.000,00\nCOM BONF. RS1.800,00\nIPTU RS123,45 SEGURO3/12 RS30,00 TARIFA RS3,50 RESSARC. COND. -RS50,00');
  // ainda 110 letras: encurtar mais muda o formato (tirar o "RS", mudar a ordem): decisão do dono (relatório de 24/11)
  assert.equal(b.excesso, 10);
  // sem a tarifa, cabe
  cb.taxa_boleto = 0;
  assert.equal(R.dadosBoleto(d, cb).excesso, 0);
  assert.match(R.dadosBoleto(d, cb).descricao, /RESSARC\. COND\. -RS50,00$/);
});

test('com ajustes do mês de motivo comprido não cabe: o excesso é informado (a tela avisa o que o banco corta)', () => {
  const { d, c, cb } = base();
  Object.assign(cb, { iptu: 12345, iptu_parcela: 'IPTU 2026 parc. 9/10', seguro: 3000, seguro_parcela: 'Seguro parc. 3/12' });
  ressarcir(d, c, 5000);
  R.adicionarAjuste(d, cb.id, 8000, 'Conserto da torneira da cozinha', 'j');
  const b = R.dadosBoleto(d, cb);
  assert.ok(b.excesso > 0);
  assert.equal(b.excesso, b.descricao.length - R.LIMITE_DESCRICAO_BOLETO);
  // o valor do boleto não muda com o texto
  assert.equal(b.valor, R.totais(cb).a_pagar_sem_desconto);
});
