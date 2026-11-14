// Regras do sistema escolhidas pelo administrador (config-regras.js, tabela config_regras): padrão = regra do dono, gravar,
// versões, arquivo das regras e o efeito de cada regra nas contas.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as CR from '../docs/js/config-regras.js';
import * as Z from '../docs/js/conciliacao.js';
import * as R from '../docs/js/regras.js';

/** Banco novo, já normalizado (as regras em uso passam a ser as dele). */
const banco = () => R.normalizar(R.bancoVazio());
/** Roda ``fn`` com as regras ``valores`` e volta ao padrão do sistema no fim. */
function comRegras(valores, fn) {
  const d = banco();
  R.salvarRegrasSistema(d, valores, 'admin');
  try { return fn(d); } finally { CR.usarRegras(null); }
}

test('sem nada escolhido valem as regras do dono (padrão do sistema), iguais ao comportamento antigo', () => {
  const d = banco();
  assert.deepEqual(R.regrasDe(d), { ...CR.PADRAO_SISTEMA });
  assert.equal(R.regra('dia_gerar_boletos'), R.DIA_GERAR_BOLETOS);
  assert.equal(R.regra('meses_documentos_ficha'), R.MESES_DOCUMENTOS_REPROVADA);
  assert.equal(R.regra('dias_alerta_banco'), R.DIAS_ALERTA_BANCO);
  assert.equal(R.regra('dias_extrato_recente'), R.DIAS_EXTRATO_RECENTE);
  assert.equal(R.regra('dias_sem_imovel'), R.DIAS_SEM_IMOVEL);
  assert.equal(R.regra('meses_depois_de_alugar'), R.MESES_DEPOIS_DE_ALUGAR);
  assert.equal(R.regra('dias_antecipacao_banco'), Z.DIAS_ANTECIPACAO);
  assert.deepEqual(R.reguaCobranca(), R.REGUA_COBRANCA);
  assert.equal(R.regra('multa_padrao'), 2);
  assert.equal(R.regra('juros_padrao'), 1);
  // toda regra tem explicação, consequência e lei (pedido do dono, 2026-11-12)
  for (const def of CR.DEFINICOES_REGRAS) {
    for (const k of ['rotulo', 'explica', 'consequencia', 'lei']) assert.ok(def[k] && def[k].length > 5, `${def.chave}.${k}`);
    assert.ok(CR.GRUPOS_REGRAS.some(([g]) => g === def.grupo), def.chave);
    assert.deepEqual(CR.limparValorRegra(def.chave, def.padrao), def.padrao, def.chave);
  }
});

test('gravar uma regra: só a diferença do padrão vira linha, com histórico; voltar ao padrão apaga a linha', () => {
  const d = banco();
  const antes = d.historico.length;
  assert.equal(R.salvarRegrasSistema(d, { multa_padrao: 5 }, 'admin'), 1);
  assert.deepEqual(d.config_regras.map((x) => [x.chave, x.valor]), [['multa_padrao', 5]]);
  assert.equal(R.regra('multa_padrao'), 5);
  assert.ok(d.historico.length > antes);
  // mudar outra mantém a primeira
  R.mudarRegraSistema(d, 'juros_padrao', 0.5, 'admin');
  assert.equal(R.regra('multa_padrao'), 5);
  assert.equal(R.regra('juros_padrao'), 0.5);
  // gravar o próprio padrão apaga a linha
  R.mudarRegraSistema(d, 'multa_padrao', 2, 'admin');
  assert.deepEqual(d.config_regras.map((x) => x.chave), ['juros_padrao']);
  assert.equal(R.voltarRegrasAoPadrao(d, 'admin'), 1);
  assert.equal(d.config_regras.length, 0);
  assert.deepEqual(R.regrasDe(d), { ...CR.PADRAO_SISTEMA });
  CR.usarRegras(null);
});

test('valor errado é recusado com a mensagem da regra; linha estragada no banco vale o padrão', () => {
  const d = banco();
  assert.throws(() => R.salvarRegrasSistema(d, { dia_gerar_boletos: 31 }, 'admin'), /máximo é 28/);
  assert.throws(() => R.salvarRegrasSistema(d, { reajuste_inicio: 'outro' }, 'admin'), /escolha uma das opções/);
  assert.throws(() => R.salvarRegrasSistema(d, { regua_cobranca: [{ dias: 1, passo: 'a' }, { dias: 1, passo: 'b' }] }, 'admin'), /mesmo número de dias/);
  assert.throws(() => R.salvarRegrasSistema(d, { feriados_locais: ['32/01'] }, 'admin'), /Feriado inválido/);
  assert.equal(d.config_regras.length, 0);
  d.config_regras.push({ id: 1, chave: 'dia_gerar_boletos', valor: 'abc' }, { id: 2, chave: 'nao_existe', valor: 1 });
  assert.deepEqual(R.regrasDe(d), { ...CR.PADRAO_SISTEMA });
});

test('versões salvas e arquivo das regras: guardar, mudar e recuperar', () => {
  const d = banco();
  R.salvarRegrasSistema(d, { multa_padrao: 3, regua_cobranca: [{ dias: 5, passo: 'Ligar' }] }, 'admin');
  const v = R.salvarVersaoRegras(d, 'Regras de novembro', 'admin');
  assert.equal(v.valores.multa_padrao, 3);
  assert.throws(() => R.salvarVersaoRegras(d, '  ', 'admin'), /Dê um nome/);
  const arquivo = JSON.stringify(CR.arquivoDasRegras(d, 'admin'));
  R.voltarRegrasAoPadrao(d, 'admin');
  assert.equal(R.regra('multa_padrao'), 2);
  R.restaurarVersaoRegras(d, v.id, 'admin');
  assert.equal(R.regra('multa_padrao'), 3);
  assert.deepEqual(R.regra('regua_cobranca'), [{ dias: 5, passo: 'Ligar' }]);
  R.voltarRegrasAoPadrao(d, 'admin');
  R.salvarRegrasSistema(d, CR.lerArquivoDasRegras(arquivo), 'admin');
  assert.equal(R.regra('multa_padrao'), 3);
  assert.throws(() => CR.lerArquivoDasRegras('{"formato":"outro"}'), /não é um arquivo de regras/);
  assert.throws(() => CR.lerArquivoDasRegras('isso não é json'), /não é um arquivo de regras/);
  // regras e versões não se desfazem pelo Histórico (têm botões próprios)
  assert.ok(Object.keys(R.TABELAS).includes('config_regras') && Object.keys(R.TABELAS).includes('versoes_regras'));
  CR.usarRegras(null);
});

test('reajuste: "mês seguinte" só muda para entrada depois do dia 1º', () => {
  const c20 = { data_entrada: '2026-03-20', vigencia_inicio: '2026-03-20' };
  const c01 = { data_entrada: '2026-03-01', vigencia_inicio: '2026-03-01' };
  assert.equal(R.competenciaDoReajuste(c20, 1), '2027-03'); // padrão: o mês de entrada conta como 1º
  comRegras({ reajuste_inicio: 'mes_seguinte' }, () => {
    assert.equal(R.competenciaDoReajuste(c20, 1), '2027-04');
    assert.equal(R.competenciaDoReajuste(c01, 1), '2027-03');
  });
});

test('caução: base bonificada (padrão) ou cheia; sem acompanhar o reajuste não há complemento', () => {
  const d = banco();
  const c = { id: 1, aluguel_inicial: 200000, desconto_pontualidade_percentual: 10, caucao_meses: 3 };
  assert.equal(R.caucaoSugerida(d, c), 540000); // 3 × R$ 1.800,00
  comRegras({ caucao_base: 'cheio' }, (d2) => assert.equal(R.caucaoSugerida(d2, c), 600000)); // 3 × R$ 2.000,00
  comRegras({ caucao_acompanha: false }, (d2) => assert.equal(R.complementoCaucao(d2, { ...c, garantia_tipo: 'Caução', caucao_valor: 540000 }), null));
});

test('régua de cobrança escolhida pelo administrador', () => {
  assert.equal(R.passoDaRegua(12), 'Ligar para o inquilino');
  comRegras({ regua_cobranca: [{ dias: 3, passo: 'WhatsApp' }, { dias: 15, passo: 'Carta' }] }, () => {
    assert.equal(R.passoDaRegua(2), '');
    assert.equal(R.passoDaRegua(12), 'WhatsApp');
    assert.equal(R.passoDaRegua(40), 'Carta');
  });
});

test('feriado da cidade passa o vencimento ao dia útil seguinte', () => {
  // ter 20/01/2026: dia útil normal
  assert.equal(C.limitePagamento('2026-01-20'), '2026-01-20');
  comRegras({ feriados_locais: ['01-20', '2026-01-21'] }, () => {
    assert.equal(C.limitePagamento('2026-01-20'), '2026-01-22');
    assert.equal(C.limitePagamento('2027-01-20'), '2027-01-21'); // 21/01 só era feriado em 2026
    assert.equal(C.vencido('2026-01-20', '2026-01-22'), false);
  });
});

test('multa e juros só sobre o aluguel; no C6 vão em reais', () => {
  const cb = { aluguel: 200000, desconto: 20000, iptu: 20000, seguro: 10000, taxa_boleto: 0 };
  assert.equal(C.totaisCobranca(cb).base_multa, 230000);
  comRegras({ base_multa: 'aluguel' }, () => {
    assert.equal(C.totaisCobranca(cb).base_multa, 200000);
    const pago = C.liquidar({ ...cb, vencimento: '2026-11-10', multa_percentual: 2, juros_mensal_percentual: 1 }, '2026-11-20');
    assert.equal(pago.multa, 4000); // 2% de R$ 2.000,00
    assert.equal(pago.juros, 66 * 10); // R$ 0,66 por dia × 10
  });
});

test('proporcional em mês de 30 dias só no mês incompleto', () => {
  const p = { competencia: '2027-02', aluguelMensal: 180000, entrada: '2027-02-15', saida: null };
  assert.equal(C.calcularCobranca(p).aluguel, 90000); // 14/28 de R$ 1.800,00
  comRegras({ proporcional: 'mes_30' }, () => {
    assert.equal(C.calcularCobranca(p).aluguel, 84000); // 14/30
    assert.equal(C.calcularCobranca({ ...p, entrada: '2027-02-01' }).aluguel, 180000); // mês inteiro: cheio
  });
});

test('Novo contrato vem com os valores das regras', () => {
  assert.deepEqual(R.padroesNovoContrato(), { multa_percentual: 2, juros_mensal_percentual: 1, bonificacao: true, cobranca_mes_seguinte: true,
    conta_iptu: 'Por conta do inquilino', conta_seguro: 'Por conta do inquilino', prazo_meses: 30 });
  comRegras({ bonificacao_percentual_padrao: 10, tarifa_padrao: 350, fci_percentual_padrao: 5, fci_indice_padrao: 'Poupança', indice_padrao: 'IPCA' }, () => {
    assert.deepEqual(R.padroesNovoContrato(), { multa_percentual: 2, juros_mensal_percentual: 1, bonificacao: true, cobranca_mes_seguinte: true,
      conta_iptu: 'Por conta do inquilino', conta_seguro: 'Por conta do inquilino', desconto_pontualidade_percentual: 10, taxa_boleto: 350,
      fci_percentual: 5, fci_indice: 'Poupança', indice_correcao: 'IPCA', prazo_meses: 30 });
  });
});

test('avisos legais ao salvar o contrato (avisam, não proíbem)', () => {
  const ok = { finalidade: 'Residencial', prazo_tipo: 'Determinado', prazo_meses: 30, bonificacao: true, desconto_pontualidade_percentual: 10,
    multa_percentual: 2, juros_mensal_percentual: 1, aluguel_inicial: 200000, garantia_tipo: 'Caução', caucao_meses: 3, caucao_valor: 540000 };
  assert.deepEqual(R.avisosLegaisDoContrato(ok), []);
  const avisos = R.avisosLegaisDoContrato({ ...ok, prazo_meses: 24, desconto_pontualidade_percentual: 15, multa_percentual: 12, juros_mensal_percentual: 2, caucao_valor: 600000 });
  assert.equal(avisos.length, 5);
  assert.match(avisos[0], /arts\. 46 e 47/);
  assert.match(avisos[4], /art\. 38, §2º/);
  assert.equal(R.avisosLegaisDoContrato({ ...ok, finalidade: 'Não residencial', prazo_meses: 24 }).length, 0);
  const fiador = R.avisosLegaisDoContrato({ ...ok, garantia_tipo: 'Fiador + depósito', deposito_valor: 180000 });
  assert.equal(fiador.length, 1);
  assert.match(fiador[0], /art\. 37/);
  comRegras({ aviso_fiador_deposito: false, bonificacao_limite_aviso: 20 }, () => {
    assert.deepEqual(R.avisosLegaisDoContrato({ ...ok, garantia_tipo: 'Fiador + depósito', deposito_valor: 180000, desconto_pontualidade_percentual: 15 }), []);
  });
});

test('boleto do C6: multa em % sobre o boleto (padrão) ou em reais quando é só sobre o aluguel', () => {
  const montar = () => {
    const d = R.bancoVazio();
    const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 9', endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'j');
    const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Inquilino Teste', inquilino_cpf: '529.982.247-25', data_entrada: '2026-09-01',
      vigencia_inicio: '2026-09-01', aluguel_inicial: 200000, desconto_pontualidade_percentual: 10, bonificacao: true, dia_vencimento: 5,
      cobranca_mes_seguinte: true, taxa_boleto: 350, multa_percentual: 2, juros_mensal_percentual: 1, cobrar_iptu: false, conta_seguro: 'Não tem', cobrar_seguro: false }, 'j');
    R.gerarCobrancas(d, '2026-10', 'j');
    return R.dadosBoleto(d, R.boletoDoMes(d, c.id, '2026-10'));
  };
  assert.equal(montar().multa_valor, null); // padrão: 2% sobre o boleto todo (R$ 2.003,50)
  comRegras({ base_multa: 'aluguel' }, () => {
    const b = montar();
    assert.equal(b.multa_valor, 4000); // 2% de R$ 2.000,00, sem a tarifa
    assert.equal(b.juros_ao_dia, 66);
  });
});

test('regras que ficavam fora de "Regras do sistema" (ressarcimento na NF, tolerância do boleto): o valor antigo continua valendo e passa para as regras ao salvar', () => {
  try {
    // banco antigo: ressarcimento abatendo a NF (Empresas) e tolerância de 5 dias (Dados e backup → Banco)
    const d = R.bancoVazio();
    d.ressarcimento_abate_nf = true;
    d.config_banco = { tolerancia_dias: 5 };
    R.normalizar(d);
    assert.equal(R.regra('ressarcimento_na_nf'), true);
    assert.equal(R.regra('tolerancia_boleto_dias'), 5);
    assert.equal(d.config_regras.length, 0, 'abrir o banco não grava nada (o operador não pode gravar regras na nuvem)');
    assert.deepEqual(CR.regrasAntigasDe(d), { ressarcimento_na_nf: true, tolerancia_boleto_dias: 5 });
    // mudar OUTRA regra mantém as duas: viram linhas próprias e os campos antigos saem
    R.mudarRegraSistema(d, 'dia_gerar_boletos', 25, 'admin');
    assert.deepEqual(d.config_regras.map((r) => [r.chave, r.valor]).sort(), [['dia_gerar_boletos', 25], ['ressarcimento_na_nf', true], ['tolerancia_boleto_dias', 5]]);
    assert.equal(d.ressarcimento_abate_nf, false);
    assert.equal('tolerancia_dias' in d.config_banco, false);
    R.normalizar(d);
    assert.equal(R.regra('ressarcimento_na_nf'), true);
    assert.equal(R.regra('tolerancia_boleto_dias'), 5);
    // voltar ao padrão vale também para elas (o valor antigo não "ressuscita")
    R.voltarRegrasAoPadrao(d, 'admin');
    R.normalizar(d);
    assert.equal(R.regra('ressarcimento_na_nf'), false);
    assert.equal(R.regra('tolerancia_boleto_dias'), 3);
    // tolerância antiga igual ao padrão (3) ou estragada não vira escolha
    const d2 = R.bancoVazio();
    d2.config_banco = { tolerancia_dias: 3 };
    assert.deepEqual(CR.regrasAntigasDe(R.normalizar(d2)), {});
    d2.config_banco.tolerancia_dias = 'x';
    assert.deepEqual(CR.regrasAntigasDe(d2), {});
  } finally { CR.usarRegras(null); }
});

test('ressarcimento na NF: mudar a regra acerta os boletos em aberto com ressarcimento (os pagos não mudam)', () => {
  try {
    const d = banco();
    d.cobrancas.push({ id: 1, contrato_id: 1, competencia: '2026-09', ressarcimento: 15000, ressarcimento_na_nf: false, data_pagamento: null, banco: null },
      { id: 2, contrato_id: 1, competencia: '2026-08', ressarcimento: 15000, ressarcimento_na_nf: false, data_pagamento: '2026-09-10', banco: null },
      { id: 3, contrato_id: 1, competencia: '2026-10', ressarcimento: 0, ressarcimento_na_nf: false, data_pagamento: null, banco: null });
    R.mudarRegraSistema(d, 'ressarcimento_na_nf', true, 'admin');
    assert.deepEqual(d.cobrancas.map((cb) => cb.ressarcimento_na_nf), [true, false, false]);
    R.mudarRegraSistema(d, 'ressarcimento_na_nf', false, 'admin');
    assert.deepEqual(d.cobrancas.map((cb) => cb.ressarcimento_na_nf), [false, false, false]);
  } finally { CR.usarRegras(null); }
});
