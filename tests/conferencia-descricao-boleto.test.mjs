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
  assert.equal(b.descricao, 'ALUGUEL 2.000,00\nCOM BONF. 1.800,00\nTARIFA COBRANÇA 3,50 RESSARCIMENTO CONDOMÍNIO -50,00');
  assert.equal(b.excesso, 0);
});

test('aluguel + IPTU + seguro + tarifa + ressarcimento: sem o "RS" e encurtando a tarifa e o ressarcimento, cabe nas 100 letras', () => {
  const { d, c, cb } = base();
  Object.assign(cb, { iptu: 12345, iptu_parcela: 'IPTU 2026 parc. 9/10', seguro: 3000, seguro_parcela: 'Seguro parc. 3/12' });
  ressarcir(d, c, 5000);
  const b = R.dadosBoleto(d, cb);
  // antes: 120 letras com "RS", e o C6 cortava justamente o ressarcimento (que fica no fim). Decisão do dono de 24/11/2026:
  // tirar o "RS" dos valores → 98 letras
  assert.equal(b.descricao, 'ALUGUEL 2.000,00\nCOM BONF. 1.800,00\nIPTU 123,45 SEGURO3/12 30,00 TARIFA 3,50 RESSARC. COND. -50,00');
  assert.equal(b.descricao.length, 98);
  assert.equal(b.excesso, 0);
  // o e-mail do boleto leva "R$" e por extenso (não precisa caber em 100 letras)
  assert.equal(R.dadosBoleto(d, cb, { moeda: 'R$ ' }).descricao,
    'ALUGUEL R$ 2.000,00\nCOM BONF. R$ 1.800,00\nIPTU R$ 123,45 SEGURO3/12 R$ 30,00 TARIFA COBRANÇA R$ 3,50 RESSARCIMENTO CONDOMÍNIO -R$ 50,00');
});

test('instruções do boleto no C6 (4 linhas de 80): quebra entre palavras, nunca no meio de um valor', () => {
  const linha = 'IPTU 123,45 SEGURO3/12 30,00 TARIFA 3,50 CONSERTO DA TORNEIRA DA COZINHA 80,00 RESSARC. COND. -50,00';
  // antes (slice de 80): "… COZINHA 80,00 RES" e o resto perdido; agora a linha acaba num espaço e o resto vai para a seguinte
  assert.deepEqual(R.quebrarLinhas([linha], 80), ['IPTU 123,45 SEGURO3/12 30,00 TARIFA 3,50 CONSERTO DA TORNEIRA DA COZINHA 80,00', 'RESSARC. COND. -50,00']);
  // valor que cairia na divisa (ex.: "1.800,00" entre a letra 78 e a 85) passa inteiro para a linha seguinte
  const divisa = `${'X'.repeat(76)} 1.800,00 FIM`;
  assert.deepEqual(R.quebrarLinhas([divisa], 80), ['X'.repeat(76), '1.800,00 FIM']);
  for (const l of R.quebrarLinhas([linha, divisa, 'curta'], 80)) assert.ok(l.length <= 80);
  // linhas vazias somem; palavra maior que a linha (raro) é cortada
  assert.deepEqual(R.quebrarLinhas(['', '  ', 'A B'], 80), ['A B']);
  assert.deepEqual(R.quebrarLinhas(['Y'.repeat(85)], 80), ['Y'.repeat(80), 'Y'.repeat(5)]);
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
