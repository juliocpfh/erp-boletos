import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

// Conferência dos boletos de 24/11/2026 (item A5): por que um ressarcimento de condomínio lançado pode não entrar no boleto
// esperado. Dados fictícios (CPF de teste).
function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', complemento: '', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-03-01', vigencia_inicio: '2026-03-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, multa_percentual: 10, juros_mensal_percentual: 1, conta_condominio: 'Por conta do inquilino', ...extra }, 'j');
  return { d, loja, c };
}
// como o formulário grava: mês do abatimento em branco = calculado pela data do pagamento; depois aplica no boleto
function lancar(d, c, extra = {}) {
  const dados = { contrato_id: c.id, competencia_condominio: '2026-11', descricao: 'Fundo de obras', valor: 5000, data_pagamento: '2026-11-05', ...extra };
  if (!dados.competencia_abatimento) dados.competencia_abatimento = R.competenciaDoAbatimento(c, dados.data_pagamento);
  const r = R.inserir(d, 'ressarcimentos', dados, 'j');
  R.aplicarRessarcimentos(d, c, r.competencia_abatimento, 'j');
  return r;
}
function trocaDeTitular(d, c, data) {
  const { id, ...resto } = c; // eslint-disable-line no-unused-vars
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Pedro Novo', contrato_anterior_id: c.id, data_entrada: data, vigencia_inicio: data, garantia_na_troca: 'nova' }, 'j');
  R.inserir(d, 'aditivos', { contrato_id: novo.id, imovel_id: novo.imovel_id, tipo: 'Troca de titular', data: '2026-11-25', assunto: 'Troca', texto: 'termo', arquivo: 'termo.pdf' }, 'j');
  R.transferirHeranca(d, novo.id, 'j', '2026-12-02');
  return novo;
}

test('mês do abatimento: aluguel que vence no mês seguinte → o boleto do próprio mês do pagamento (vence no mês seguinte)', () => {
  const { c } = base();
  // condomínio pago em 05/11/2026 → boleto do aluguel de 11/2026, que vence em 10/12/2026
  assert.equal(R.competenciaDoAbatimento(c, '2026-11-05'), '2026-11');
  assert.equal(R.competenciaDoAbatimento(c, '2026-11-30'), '2026-11');
  // aluguel que vence no próprio mês: o boleto de 12/2026, que vence em 10/12/2026 (o mesmo vencimento)
  assert.equal(R.competenciaDoAbatimento({ ...c, cobranca_mes_seguinte: false }, '2026-11-05'), '2026-12');
  // contrato antigo sem o campo gravado: vale "vence no mês seguinte", como no resto do sistema
  const { cobranca_mes_seguinte, ...semCampo } = c; // eslint-disable-line no-unused-vars
  assert.equal(R.competenciaDoAbatimento(semCampo, '2026-11-05'), '2026-11');
});

test('ressarcimento lançado antes de gerar o boleto entra quando o boleto é gerado; depois, entra no boleto já gerado', () => {
  const { d, c } = base();
  lancar(d, c);
  R.gerarCobrancas(d, '2026-11', 'j');
  const nov = R.boletoDoMes(d, c.id, '2026-11');
  assert.equal(nov.ressarcimento, 5000);
  assert.equal(R.totais(nov).a_pagar_pontual, 180000 - 5000, 'R$ 1.800,00 em dia − R$ 50,00');
  lancar(d, c, { descricao: 'Chamada extra (obra)', valor: 2000 });
  assert.equal(nov.ressarcimento, 7000, 'os dois no mesmo boleto');
  assert.match(nov.ressarcimento_descricao, /Fundo de obras.*; Chamada extra/);
  assert.match(R.dadosBoleto(d, nov).descricao, /RESSARC.* -RS70,00/);
});

test('ressarcimento continua no boleto depois do recálculo, do "Alterar valores" e de gerar outro mês', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  const nov = R.boletoDoMes(d, c.id, '2026-11');
  lancar(d, c);
  R.recalcularCobrancas(d, () => true, 'j');
  assert.equal(nov.ressarcimento, 5000);
  R.atualizar(d, 'cobrancas', nov.id, { iptu: 9000, editado_manual: true, campos_manuais: ['iptu'] }, 'j');
  R.recalcularCobrancas(d, () => true, 'j');
  assert.deepEqual([nov.iptu, nov.ressarcimento], [9000, 5000]);
  // boleto alterado à mão antes de 24/11 (sem a lista dos campos): o recálculo não mexe, mas o ressarcimento novo entra
  R.atualizar(d, 'cobrancas', nov.id, { campos_manuais: null }, 'j');
  lancar(d, c, { valor: 1000, descricao: 'Pintura de fachada' });
  assert.equal(nov.ressarcimento, 6000);
  R.gerarCobrancas(d, '2026-12', 'j');
  assert.equal(R.boletoDoMes(d, c.id, '2026-12').ressarcimento, 0, 'não repete no mês seguinte');
});

test('excluir o ressarcimento tira do boleto; boleto pago não muda', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  const nov = R.boletoDoMes(d, c.id, '2026-11');
  const r = lancar(d, c);
  R.excluir(d, 'ressarcimentos', r.id, 'j');
  R.aplicarRessarcimentos(d, c, '2026-11', 'j'); // o que a tela faz depois de excluir (TABELAS_EXCLUSAO.ressarcimentos.depois)
  assert.equal(nov.ressarcimento, 0);
  lancar(d, c);
  R.registrarPagamento(d, nov.id, '2026-12-05', null, 'j');
  R.inserir(d, 'ressarcimentos', { contrato_id: c.id, competencia_condominio: '2026-11', descricao: 'Outra', valor: 1000, data_pagamento: '2026-11-06', competencia_abatimento: '2026-11' }, 'j');
  R.aplicarRessarcimentos(d, c, '2026-11', 'j');
  assert.equal(nov.ressarcimento, 5000, 'pago: fica como foi pago (o formulário pede outro mês)');
});

test('Desfazer pelo Histórico a mudança do ressarcimento: o boleto em aberto volta junto (reaplicarRessarcimentos)', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  R.gerarCobrancas(d, '2026-12', 'j');
  const nov = R.boletoDoMes(d, c.id, '2026-11');
  const dez = R.boletoDoMes(d, c.id, '2026-12');
  const r = lancar(d, c);
  R.atualizar(d, 'ressarcimentos', r.id, { valor: 8000 }, 'j');
  R.aplicarRessarcimentos(d, c, '2026-11', 'j');
  assert.equal(nov.ressarcimento, 8000);
  const i = d.historico.findLastIndex((h) => h.tabela === 'ressarcimentos' && h.detalhes && h.detalhes.valor);
  R.desfazerAlteracoes(d, [`${i}:valor`], 'admin');
  assert.equal(r.valor, 5000);
  assert.equal(nov.ressarcimento, 8000, 'sem reaplicar, o boleto ficava com o valor desfeito (era o erro)');
  R.reaplicarRessarcimentos(d, c.id, 'admin');
  assert.equal(nov.ressarcimento, 5000);
  // mês do abatimento trocado e desfeito: sai de 12/2026 e volta para 11/2026
  R.atualizar(d, 'ressarcimentos', r.id, { competencia_abatimento: '2026-12' }, 'j');
  R.aplicarRessarcimentos(d, c, '2026-11', 'j');
  R.aplicarRessarcimentos(d, c, '2026-12', 'j');
  assert.deepEqual([nov.ressarcimento, dez.ressarcimento], [0, 5000]);
  const k = d.historico.findLastIndex((h) => h.tabela === 'ressarcimentos' && h.detalhes && h.detalhes.competencia_abatimento);
  R.desfazerAlteracoes(d, [`${k}:competencia_abatimento`], 'admin');
  R.reaplicarRessarcimentos(d, c.id, 'admin');
  assert.deepEqual([nov.ressarcimento, dez.ressarcimento], [5000, 0]);
});

test('boleto em acordo não recebe o ressarcimento e o alerta pede outro mês', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  const nov = R.boletoDoMes(d, c.id, '2026-11');
  nov.acordo_id = 99; nov.situacao = 'Em acordo';
  lancar(d, c);
  assert.equal(nov.ressarcimento, 0);
  assert.match(R.alertaRessarcimentoEmAcordo(d, c).texto, /está em acordo/);
});

test('saída: ressarcimento para um mês depois da saída não tem boleto → vira crédito do cálculo final (decisão de 24/11)', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-20' }, 'j');
  lancar(d, c, { data_pagamento: '2026-12-05' }); // abateria no boleto de 12/2026
  assert.equal(R.boletoDoMes(d, c.id, '2026-12'), null);
  assert.deepEqual(R.semBoletoNoMes(d, c, '2026-12'), { motivo: 'saida', data: '2026-11-20' });
  assert.equal(R.semBoletoNoMes(d, c, '2026-11'), null, 'o de 11/2026 existe');
  // antes era um aviso; desde a decisão do dono de 24/11/2026 é crédito no cálculo final (tests/decisoes-24-11.test.mjs)
  assert.equal(R.alertaRessarcimentoEmAcordo(d, c), null);
  assert.equal(R.creditosDaSaida(d, c).total, 5000);
  // escolhendo o boleto de 11/2026 (em aberto), abate e o aviso some
  const r = d.ressarcimentos[0];
  R.atualizar(d, 'ressarcimentos', r.id, { competencia_abatimento: '2026-11' }, 'j');
  R.reaplicarRessarcimentos(d, c.id, 'j');
  assert.equal(R.boletoDoMes(d, c.id, '2026-11').ressarcimento, 5000);
  assert.equal(R.alertaRessarcimentoEmAcordo(d, c), null);
});

test('troca de titular: ressarcimento do boleto que passou ao novo titular fica com quem pagou (crédito, decisão de 24/11)', () => {
  const { d, c } = base();
  for (const m of ['2026-10', '2026-11', '2026-12']) R.gerarCobrancas(d, m, 'j');
  lancar(d, c, { competencia_condominio: '2026-12', data_pagamento: '2026-12-05' });
  const dez = R.boletoDoMes(d, c.id, '2026-12');
  assert.equal(dez.ressarcimento, 5000, 'antes da troca, no boleto de 12/2026');
  const novo = trocaDeTitular(d, c, '2026-12-01');
  assert.equal(dez.contrato_id, novo.id, 'o boleto de 12/2026 passa ao novo titular');
  // o lançamento continua no contrato de Maria e o boleto (agora de Pedro) é recalculado sem ele: o valor é crédito de Maria
  // na devolução da garantia (decisão do dono de 24/11/2026; antes era um aviso nos dois contratos)
  assert.equal(dez.ressarcimento, 0);
  assert.equal(R.semBoletoNoMes(d, c, '2026-12').motivo, 'troca');
  assert.equal(R.creditosDaSaida(d, c).total, 5000);
  assert.equal(R.alertaRessarcimentoEmAcordo(d, novo), null);
  // lançado no novo titular, abate no boleto dele
  lancar(d, novo, { competencia_condominio: '2026-12', data_pagamento: '2026-12-05' });
  assert.equal(dez.ressarcimento, 5000);
});

test('mês antes da entrada também não tem boleto', () => {
  const { d, c } = base({ data_entrada: '2026-11-10', vigencia_inicio: '2026-11-10' });
  assert.equal(R.semBoletoNoMes(d, c, '2026-10').motivo, 'entrada');
  assert.equal(R.semBoletoNoMes(d, c, '2026-11'), null);
});
