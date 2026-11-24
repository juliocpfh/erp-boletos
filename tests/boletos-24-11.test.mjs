import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

// Pedidos do dono de 24/11/2026 nos boletos. Dados fictícios.
function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', complemento: '', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-03-01', vigencia_inicio: '2026-03-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, multa_percentual: 10, juros_mensal_percentual: 1, conta_condominio: 'Por conta do inquilino', ...extra }, 'j');
  R.gerarCobrancas(d, '2026-11', 'j');
  return { d, loja, c, cb: R.boletoDoMes(d, c.id, '2026-11') };
}

test('ajuste do mês: vários abatimentos e cobranças no mesmo boleto, cada um com o motivo, e tirar um deixa os outros', () => {
  const { d, cb } = base();
  const antes = R.totais(cb).a_pagar_pontual; // R$ 1.800,00 em dia
  R.adicionarAjuste(d, cb.id, 8000, 'Conserto da torneira', 'j');
  R.adicionarAjuste(d, cb.id, -15000, 'Reforma do banheiro', 'j');
  R.adicionarAjuste(d, cb.id, -3000, 'Acerto da água', 'j');
  assert.equal(cb.outros, -10000, '+ R$ 80,00 − R$ 150,00 − R$ 30,00 = − R$ 100,00');
  assert.equal(R.totais(cb).a_pagar_pontual, antes - 10000);
  assert.deepEqual(R.partesDosOutros(cb).map((p) => p.valor), [8000, -15000, -3000]);
  const desc = R.dadosBoleto(d, cb).descricao;
  assert.match(desc, /CONSERTO DA TORNEIRA RS80,00/);
  assert.match(desc, /REFORMA DO BANHEIRO -RS150,00/);
  assert.match(desc, /ACERTO DA ÁGUA -RS30,00/);
  const [, reforma] = R.ajustesDoBoleto(cb);
  R.retirarAjuste(d, cb.id, reforma.id, 'j');
  assert.equal(cb.outros, 5000);
  assert.deepEqual(R.ajustesDoBoleto(cb).map((a) => a.motivo), ['Conserto da torneira', 'Acerto da água']);
  assert.match(d.historico.at(-1).descricao, /retirado: ressarcimento de R\$\s?150,00 \(Reforma do banheiro\)/);
});

test('ajuste do mês: ressarcimentos que passam do boleto são recusados; boleto pago não recebe ajuste', () => {
  const { d, cb } = base();
  R.adicionarAjuste(d, cb.id, -150000, 'Reforma', 'j');
  assert.throws(() => R.adicionarAjuste(d, cb.id, -60000, 'Pintura', 'j'), /passam do boleto/);
  assert.equal(cb.outros, -150000, 'nada mudou');
  R.registrarPagamento(d, cb.id, '2026-12-05', null, 'j');
  assert.throws(() => R.adicionarAjuste(d, cb.id, 1000, 'x', 'j'), /já foi pago/);
});

test('ajuste do mês: boleto antigo, de um ajuste só, vira o 1º da lista e recebe outro', () => {
  const { d, cb } = base();
  cb.outros = -15000; cb.outros_descricao = 'Reforma do banheiro'; // como era gravado antes de 24/11/2026
  assert.deepEqual(R.ajustesDoBoleto(cb), [{ id: 1, valor: -15000, motivo: 'Reforma do banheiro' }]);
  R.adicionarAjuste(d, cb.id, -2000, 'Lâmpada', 'j');
  assert.equal(cb.outros, -17000);
  assert.equal(cb.outros_descricao, 'Reforma do banheiro; Lâmpada');
});

test('boleto alterado à mão: o seguro lançado depois entra; o valor digitado fica', () => {
  const { d, c, loja, cb } = base();
  // IPTU digitado à mão (como em "Alterar valores")
  R.atualizar(d, 'cobrancas', cb.id, { iptu: 5000, editado_manual: true, campos_manuais: ['iptu'] }, 'j');
  R.inserir(d, 'seguros', { contrato_id: c.id, imovel_id: loja.id, vigencia_inicio: '2026-11-01', vigencia_fim: '2027-10-31', valor_total: 36000, num_parcelas: 12, primeira_competencia: '2026-11' }, 'j');
  R.recalcularCobrancas(d, (x) => x.contrato_id === c.id, 'j');
  assert.equal(cb.seguro, 3000, 'o seguro entrou');
  assert.equal(cb.iptu, 5000, 'o IPTU digitado ficou');
});

test('boleto alterado à mão antes de 24/11: fica como está, mas avisa que o seguro não entrou', () => {
  const { d, c, loja, cb } = base();
  R.atualizar(d, 'cobrancas', cb.id, { editado_manual: true }, 'j');
  R.inserir(d, 'seguros', { contrato_id: c.id, imovel_id: loja.id, vigencia_inicio: '2026-11-01', vigencia_fim: '2027-10-31', valor_total: 36000, num_parcelas: 12, primeira_competencia: '2026-11' }, 'j');
  R.recalcularCobrancas(d, (x) => x.contrato_id === c.id, 'j');
  assert.equal(cb.seguro, 0);
  assert.deepEqual(R.divergenciasDoManual(d, cb).map((x) => [x.campo, x.cadastro, x.boleto]), [['seguro', 3000, 0]]);
  const a = R.alertasBoletosManuais(d);
  assert.equal(a.length, 1);
  assert.match(a[0].texto, /Seguro obrigatório R\$\s?30,00 no cadastro e R\$\s?0,00 no boleto/);
});

test('demonstrativo: cada taxa do condomínio numa linha, agrupada pelo mês do condomínio', () => {
  const { d, c, cb } = base();
  for (const [descricao, valor] of [['Fundo de reserva', 10092], ['Extraordinárias', 35318]]) {
    R.inserir(d, 'ressarcimentos', { contrato_id: c.id, competencia_condominio: '2026-10', descricao, valor, data_pagamento: '2026-10-30', competencia_abatimento: '2026-11' }, 'j');
  }
  R.aplicarRessarcimentos(d, c, '2026-11', 'j');
  assert.equal(cb.ressarcimento, 45410);
  assert.deepEqual(R.taxasNoBoleto(d, cb), [{ mes: '2026-10', itens: [{ descricao: 'Extraordinárias', valor: 35318 }, { descricao: 'Fundo de reserva', valor: 10092 }] }]);
  // boleto antigo, com o abatido diferente do lançado: fica a linha única de antes
  cb.ressarcimento = 1000;
  assert.deepEqual(R.taxasNoBoleto(d, cb), []);
});
