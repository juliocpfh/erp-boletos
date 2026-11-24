import assert from 'node:assert/strict';
import test from 'node:test';
import * as CR from '../docs/js/config-regras.js';
import * as REC from '../docs/js/recibos.js';
import * as R from '../docs/js/regras.js';

// Decisões do dono de 24/11/2026 (relatório CONFERENCIA_BOLETOS_24_11.md, "Para o dono decidir" 1, 2 e 4). Dados fictícios.
function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', complemento: '', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-03-01', vigencia_inicio: '2026-03-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, multa_percentual: 10, juros_mensal_percentual: 1, conta_condominio: 'Por conta do inquilino',
    garantia_tipo: 'Caução', caucao_valor: 300000, ...extra }, 'j');
  return { d, loja, c };
}
function lancar(d, c, extra = {}) {
  const dados = { contrato_id: c.id, competencia_condominio: '2026-11', descricao: 'Fundo de obras', valor: 5000, data_pagamento: '2026-11-05', ...extra };
  if (!dados.competencia_abatimento) dados.competencia_abatimento = R.competenciaDoAbatimento(c, dados.data_pagamento);
  const r = R.inserir(d, 'ressarcimentos', dados, 'j');
  R.aplicarRessarcimentos(d, c, r.competencia_abatimento, 'j');
  return r;
}
function trocaDeTitular(d, c, data, extra = {}) {
  const { id, ...resto } = c; // eslint-disable-line no-unused-vars
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Pedro Novo', contrato_anterior_id: c.id, data_entrada: data, vigencia_inicio: data, garantia_na_troca: 'nova', ...extra }, 'j');
  R.inserir(d, 'aditivos', { contrato_id: novo.id, imovel_id: novo.imovel_id, tipo: 'Troca de titular', data: '2026-11-25', assunto: 'Troca', texto: 'termo', arquivo: 'termo.pdf' }, 'j');
  R.transferirHeranca(d, novo.id, 'j', '2026-12-02');
  return novo;
}

// ------------------------------------------------------------------ 1. troca de titular
test('1. troca de titular: o ressarcimento fica com Maria (crédito na devolução da garantia) e Pedro paga o boleto cheio', () => {
  const { d, c } = base();
  for (const m of ['2026-10', '2026-11', '2026-12']) R.gerarCobrancas(d, m, 'j');
  lancar(d, c, { competencia_condominio: '2026-12', data_pagamento: '2026-12-05' });
  const novo = trocaDeTitular(d, c, '2026-12-01');
  const dez = R.boletoDoMes(d, novo.id, '2026-12');
  assert.equal(dez.ressarcimento, 0, 'o boleto de Pedro é cobrado cheio');
  assert.equal(R.totais(dez).a_pagar_pontual, 180000);
  // o crédito é de Maria e vem preenchido na devolução da garantia
  const cred = R.creditosDaSaida(d, c);
  assert.equal(cred.total, 5000);
  assert.match(cred.itens[0].texto, /^Ressarcimento do condomínio: Fundo de obras \(condomínio 12\/2026, pago em 05\/12\/2026\): R\$\s?50,00$/);
  assert.deepEqual(R.acertoDoCredito(d, c), { tipo: 'devolucao', registro: null, possivel: true });
  assert.equal(R.situacaoDoCredito(d, c, d.ressarcimentos[0]), 'a_incluir');
  assert.equal(R.alertaRessarcimentoEmAcordo(d, c), null, 'nada a fazer até a devolução: o crédito já vem nela');
  assert.equal(R.alertaRessarcimentoEmAcordo(d, novo), null, 'o aviso no contrato de Pedro saiu (a regra está decidida)');
  // garantia de R$ 3.000,00 → Maria recebe R$ 3.050,00
  const dev = R.salvarDevolucaoGarantia(d, c.id, { data: '2026-12-03', garantia_valor: 300000, indice_percentual: 0, debitos: 0,
    creditos: cred.total, creditos_descricao: cred.itens.map((x) => x.texto).join('\n') }, 'j');
  assert.equal(dev.saldo, 305000);
  assert.deepEqual(dev.ressarcimentos_creditados, [d.ressarcimentos[0].id]);
  assert.equal(R.situacaoDoCredito(d, c, d.ressarcimentos[0]), 'incluido');
  // recibo da devolução mostra o crédito
  const rec = REC.montarRecibo(d, 'devolucao_garantia', { contrato: c, id: dev.id }, '2026-12-03');
  const linhas = rec.tabela.map((x) => x[0]);
  assert.ok(linhas.includes('(+) Créditos do locatário'));
  assert.equal(rec.tabela.at(-1)[0], '= Valor devolvido');
  assert.match(rec.tabela.at(-1)[1], /3\.050,00/);
  assert.match(rec.paragrafos[1], /somados os créditos/);
});

test('1. troca de titular: devolução feita sem o crédito avisa; sem garantia em dinheiro, avisa para devolver à parte', () => {
  const { d, c } = base();
  for (const m of ['2026-11', '2026-12']) R.gerarCobrancas(d, m, 'j');
  lancar(d, c, { competencia_condominio: '2026-12', data_pagamento: '2026-12-05' });
  trocaDeTitular(d, c, '2026-12-01');
  R.salvarDevolucaoGarantia(d, c.id, { data: '2026-12-03', garantia_valor: 300000, indice_percentual: 0, debitos: 0 }, 'j');
  assert.equal(R.situacaoDoCredito(d, c, d.ressarcimentos[0]), 'fora');
  assert.match(R.alertaRessarcimentoEmAcordo(d, c).texto, /devolução da garantia \(troca de titular\) foi feita sem ele/);
  // Maria saiu por troca de titular (fim de vínculo): o aviso aparece também nos alertas dela
  assert.ok(R.alertasDoInquilino(d, c, '2026-12-10').some((a) => /foi feita sem ele/.test(a.texto)));

  const f = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  for (const m of ['2026-11', '2026-12']) R.gerarCobrancas(f.d, m, 'j');
  lancar(f.d, f.c, { competencia_condominio: '2026-12', data_pagamento: '2026-12-05' });
  trocaDeTitular(f.d, f.c, '2026-12-01', { garantia_tipo: 'Fiador' });
  assert.equal(R.situacaoDoCredito(f.d, f.c, f.d.ressarcimentos[0]), 'a_parte');
  assert.match(R.alertaRessarcimentoEmAcordo(f.d, f.c).texto, /não há garantia em dinheiro a devolver na troca. Devolva o valor a Maria Exemplo à parte/);
});

// ------------------------------------------------------------------ 2. pago depois da saída
test('2. ressarcimento pago depois da saída: crédito no cálculo final (débitos R$ 300,00 → deve R$ 250,00; sem débito → devolve R$ 50,00)', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  R.gerarCobrancas(d, '2026-11', 'j');
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-20' }, 'j');
  const r = lancar(d, c, { data_pagamento: '2026-12-05' }); // iria para o boleto de 12/2026, que não existe
  assert.equal(R.semBoletoNoMes(d, c, '2026-12').motivo, 'saida');
  const cred = R.creditosDaSaida(d, c);
  assert.equal(cred.total, 5000);
  assert.equal(R.situacaoDoCredito(d, c, r), 'a_incluir');
  assert.equal(R.alertaRessarcimentoEmAcordo(d, c), null, 'antes era o aviso "não foi abatido em nenhum boleto"');
  assert.deepEqual(R.calcularEncerramento(0, 0, 30000, 0, 0, 5000).saldo, -25000);
  assert.deepEqual(R.calcularEncerramento(0, 0, 0, 0, 0, 5000).saldo, 5000);
  assert.equal(R.calcularEncerramento(300000, 0, 30000).saldo, 270000, 'sem créditos, como antes');
  const e = R.encerrarContrato(d, c.id, { data_saida: '2026-11-20', leitura_agua: '100', leitura_energia: '200', garantia_valor: 0, indice_percentual: 0, debitos: 30000,
    debitos_descricao: 'Reparo da pintura: R$ 300,00', creditos: 5000, creditos_descricao: cred.itens[0].texto, fci_credito: 0, fci_danos: 0 }, 'j', '2026-12-10');
  assert.equal(e.saldo, -25000);
  assert.deepEqual(e.ressarcimentos_creditados, [r.id]);
  assert.equal(R.situacaoDoCredito(d, c, r), 'incluido');
  // termo de quitação e e-mail do acerto: a linha do crédito, somada ao saldo
  const linhas = REC.linhasDoAcerto(e);
  const k = linhas.findIndex((x) => x[0] === '(+) Créditos do locatário');
  assert.ok(k > 0);
  assert.match(linhas[k][1], /50,00/);
  assert.match(linhas[k + 1][0], /Ressarcimento do condomínio: Fundo de obras/);
  assert.match(linhas.at(-1)[0], /Saldo a pagar/);
  assert.match(linhas.at(-1)[1], /250,00/);
});

test('2. cálculo final feito antes do ressarcimento: avisa que o crédito ficou de fora', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  R.gerarCobrancas(d, '2026-11', 'j');
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-20' }, 'j');
  R.encerrarContrato(d, c.id, { data_saida: '2026-11-20', leitura_agua: '100', leitura_energia: '200', garantia_valor: 0, indice_percentual: 0, debitos: 0, fci_credito: 0, fci_danos: 0 }, 'j', '2026-11-25');
  const r = lancar(d, c, { data_pagamento: '2026-12-05' });
  assert.equal(R.situacaoDoCredito(d, c, r), 'fora');
  assert.match(R.alertaCreditoRessarcimento(d, c).texto, /cálculo final da saída foi feita sem ele. Desfaça e refaça o cálculo final/);
  assert.ok(R.alertasDoInquilino(d, c, '2026-12-10').some((a) => /foi feita sem ele/.test(a.texto)));
});

// ------------------------------------------------------------------ 4. seguro proporcional
function comSeguro(extra = {}) {
  const b = base(extra);
  R.inserir(b.d, 'seguros', { contrato_id: b.c.id, imovel_id: b.c.imovel_id, vigencia_inicio: '2026-03-01', vigencia_fim: '2027-02-28', valor_total: 36000, num_parcelas: 12, primeira_competencia: '2026-03' }, 'j');
  return b;
}

test('4. seguro no mês da saída: proporcional aos dias, como o aluguel (R$ 30,00 e saída em 15/11 → R$ 15,00)', () => {
  const { d, c } = comSeguro();
  R.gerarCobrancas(d, '2026-10', 'j');
  assert.equal(R.boletoDoMes(d, c.id, '2026-10').seguro, 3000, 'mês inteiro: parcela inteira');
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-15' }, 'j');
  R.gerarCobrancas(d, '2026-11', 'j');
  const nov = R.boletoDoMes(d, c.id, '2026-11');
  assert.deepEqual([nov.dias_cobrados, nov.dias_mes, nov.aluguel, nov.seguro], [15, 30, 100000, 1500]);
  assert.match(nov.seguro_parcela, /parc\. 9\/12 proporcional 15\/30 dias de R\$\s?30,00/);
  assert.match(R.dadosBoleto(d, nov).descricao, /SEGURO9\/12 RS15,00/);
  // saída mudada depois de gerar o boleto: o recálculo acompanha (20/30 = R$ 20,00); saída no último dia = parcela inteira
  // (teste trazido da PR #378)
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-20' }, 'j');
  R.recalcularCobrancas(d, () => true, 'j');
  assert.equal(nov.seguro, 2000);
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-30' }, 'j');
  R.recalcularCobrancas(d, () => true, 'j');
  assert.deepEqual([nov.seguro, nov.seguro_parcela.includes('proporcional')], [3000, false]);
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-15' }, 'j');
  R.recalcularCobrancas(d, () => true, 'j');
  // as parcelas seguintes não são cobradas de ninguém (decisão do dono: ficam com a empresa)
  R.gerarCobrancas(d, '2026-12', 'j');
  assert.equal(R.boletoDoMes(d, c.id, '2026-12'), null);
});

test('4. seguro no mês da entrada: proporcional (entrada em 15/02/2027 = 16/30; pelos dias reais, 14/28)', () => {
  const { d, c } = base({ data_entrada: '2027-02-15', vigencia_inicio: '2027-02-15' });
  R.inserir(d, 'seguros', { contrato_id: c.id, imovel_id: c.imovel_id, vigencia_inicio: '2027-02-15', vigencia_fim: '2028-02-14', valor_total: 36000, num_parcelas: 12, primeira_competencia: '2027-02' }, 'j');
  R.gerarCobrancas(d, '2027-02', 'j');
  const fev = R.boletoDoMes(d, c.id, '2027-02');
  assert.deepEqual([fev.dias_cobrados, fev.dias_mes, fev.seguro], [16, 30, 1600]);
  R.gerarCobrancas(d, '2027-03', 'j');
  assert.equal(R.boletoDoMes(d, c.id, '2027-03').seguro, 3000);
  // regra "pelos dias reais do mês": o seguro acompanha (14/28 = R$ 15,00)
  R.salvarRegrasSistema(d, { proporcional: 'dias_reais' }, 'admin');
  try {
    R.recalcularCobrancas(d, () => true, 'j');
    assert.deepEqual([fev.dias_cobrados, fev.dias_mes, fev.seguro], [14, 28, 1500]);
  } finally { CR.usarRegras(null); }
});

test('4. troca de titular: a apólice passa ao novo e a parcela do mês fica inteira com quem tem a apólice (sem proporcional)', () => {
  const { d, c } = comSeguro();
  for (const m of ['2026-10', '2026-11']) R.gerarCobrancas(d, m, 'j');
  const novo = trocaDeTitular(d, c, '2026-12-01');
  R.gerarCobrancas(d, '2026-12', 'j');
  const dez = R.boletoDoMes(d, novo.id, '2026-12');
  assert.equal(dez.seguro, 3000);
  assert.doesNotMatch(dez.seguro_parcela, /proporcional/);
});
