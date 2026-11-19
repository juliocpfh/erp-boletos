// Regras especiais (pedido do dono de 18/11/2026): grupos de regras com nome que alguns contratos seguem no lugar das regras do
// sistema (tabela perfis_regras, campo contratos.perfil_regras_id; `regra(chave, contrato)` em config-regras.js).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as CR from '../docs/js/config-regras.js';
import * as R from '../docs/js/regras.js';

const banco = () => R.normalizar(R.bancoVazio());
/** Banco com a "Regra especial A" (proporcional pelos dias reais, multa e juros só sobre o aluguel) e dois contratos. */
function cenario() {
  const d = banco();
  const p = R.salvarPerfilRegras(d, null, { nome: 'Regra especial A', valores: { proporcional: 'dias_reais', base_multa: 'aluguel', multa_padrao: 2, reajuste_inicio: 'mes_seguinte' } }, 'admin');
  const comum = R.inserir(d, 'contratos', { inquilino_nome: 'Inquilino Comum', data_entrada: '2026-03-20', vigencia_inicio: '2026-03-20' }, 'admin');
  const especial = R.inserir(d, 'contratos', { inquilino_nome: 'Inquilino Especial', data_entrada: '2026-03-20', vigencia_inicio: '2026-03-20', perfil_regras_id: p.id }, 'admin');
  return { d, p, comum, especial };
}

test('a regra especial guarda só o que difere das regras do sistema, e só as regras que podem mudar por contrato', () => {
  const { d, p } = cenario();
  try {
    // multa de 2% é a do sistema: não fica guardada (acompanha o sistema)
    assert.deepEqual(p.valores, { proporcional: 'dias_reais', base_multa: 'aluguel', reajuste_inicio: 'mes_seguinte' });
    // regra da rotina da empresa (backup) não entra numa regra especial
    const q = R.salvarPerfilRegras(d, p.id, { nome: 'Regra especial A', valores: { ...p.valores, dias_copias_backup: 9 } }, 'admin');
    assert.equal('dias_copias_backup' in q.valores, false);
    assert.ok(CR.podePorContrato('multa_padrao'));
    assert.equal(CR.podePorContrato('dia_gerar_boletos'), false);
    assert.equal(CR.podePorContrato('ressarcimento_na_nf'), false);
    assert.equal(R.diferencasDoPerfil(d, p).length, 3);
  } finally { CR.usarRegras(null); }
});

test('nome obrigatório, sem repetir e diferente de "Regras do sistema"', () => {
  const { d } = cenario();
  try {
    assert.throws(() => R.salvarPerfilRegras(d, null, { nome: ' ' }, 'admin'), /Dê um nome/);
    assert.throws(() => R.salvarPerfilRegras(d, null, { nome: 'regra especial a' }, 'admin'), /Já existe/);
    assert.throws(() => R.salvarPerfilRegras(d, null, { nome: 'Regras do sistema' }, 'admin'), /escolha outro nome/);
  } finally { CR.usarRegras(null); }
});

test('cada contrato segue as suas regras: proporcional, multa, reajuste', () => {
  const { comum, especial } = cenario();
  try {
    // entrada em 15/02/2027, aluguel R$ 1.800,00: o sistema conta 16/30 (R$ 960,00); a regra especial 14/28 (R$ 900,00)
    const p = { competencia: '2027-02', aluguelMensal: 180000, entrada: '2027-02-15', saida: null };
    assert.equal(C.calcularCobranca({ ...p, contrato: comum }).aluguel, 96000);
    assert.equal(C.calcularCobranca({ ...p, contrato: especial }).aluguel, 90000);
    // multa e juros: o boleto do especial (pelo contrato_id) só sobre o aluguel; o comum sobre o boleto inteiro
    const cb = { aluguel: 200000, desconto: 20000, iptu: 20000, seguro: 10000, taxa_boleto: 0 };
    assert.equal(C.totaisCobranca({ ...cb, contrato_id: comum.id }).base_multa, 230000);
    assert.equal(C.totaisCobranca({ ...cb, contrato_id: especial.id }).base_multa, 200000);
    // reajuste: entrada em 20/03/2026 → comum em 03/2027; especial ("mês seguinte") em 04/2027
    assert.equal(R.competenciaDoReajuste(comum, 1), '2027-03');
    assert.equal(R.competenciaDoReajuste(especial, 1), '2027-04');
    // sem contrato: as regras do sistema
    assert.equal(R.regra('proporcional'), 'mes_30');
    assert.equal(R.regra('proporcional', especial), 'dias_reais');
  } finally { CR.usarRegras(null); }
});

test('o que a regra especial não muda acompanha as regras do sistema, mesmo mudando depois', () => {
  const { d, especial } = cenario();
  try {
    assert.equal(R.regra('multa_padrao', especial), 2);
    R.salvarRegrasSistema(d, { multa_padrao: 3 }, 'admin');
    assert.equal(R.regra('multa_padrao', especial), 3);
    assert.equal(R.regra('proporcional', especial), 'dias_reais');
  } finally { CR.usarRegras(null); }
});

test('trocar a regra do contrato vale na hora (também para os boletos, pelo contrato_id)', () => {
  const { d, comum, p } = cenario();
  try {
    const cb = { aluguel: 200000, desconto: 0, iptu: 20000, contrato_id: comum.id };
    assert.equal(C.totaisCobranca(cb).base_multa, 220000);
    R.atualizar(d, 'contratos', comum.id, { perfil_regras_id: p.id }, 'admin', 'Regras do contrato');
    assert.equal(C.totaisCobranca(cb).base_multa, 200000);
    assert.equal(R.nomeDasRegras(d, comum), 'Regra especial A');
  } finally { CR.usarRegras(null); }
});

test('Novo contrato preenchido pela regra especial escolhida', () => {
  const d = banco();
  try {
    const p = R.salvarPerfilRegras(d, null, { nome: 'Comercial', valores: { multa_padrao: 10, juros_padrao: 1, prazo_residencial_padrao: 12 } }, 'admin');
    const v = R.padroesNovoContrato(p.id);
    assert.equal(v.multa_percentual, 10);
    assert.equal(v.prazo_meses, 12);
    assert.equal(v.perfil_regras_id, p.id);
    assert.equal(R.padroesNovoContrato().multa_percentual, 2);
    // os avisos do contrato seguem a regra escolhida no formulário
    R.salvarPerfilRegras(d, p.id, { nome: 'Comercial', valores: { multa_padrao: 10, bonificacao_limite_aviso: 20 } }, 'admin');
    const dados = { bonificacao: true, desconto_pontualidade_percentual: 15 };
    assert.equal(R.avisosLegaisDoContrato(dados).length, 1);
    assert.equal(R.avisosLegaisDoContrato({ ...dados, perfil_regras_id: p.id }).length, 0);
  } finally { CR.usarRegras(null); }
});

test('troca de titular leva a regra especial; excluir a regra volta os contratos às regras do sistema', () => {
  const { d, p, especial } = cenario();
  try {
    assert.equal(R.condicoesDoContrato(d, especial).perfil_regras_id, p.id);
    assert.equal(R.excluirPerfilRegras(d, p.id, 'admin'), 1);
    assert.equal(R.buscar(d, 'contratos', especial.id).perfil_regras_id, null);
    assert.equal(R.regra('proporcional', especial), 'mes_30');
    assert.equal(d.perfis_regras.length, 0);
  } finally { CR.usarRegras(null); }
});

test('banco antigo ganha a tabela; regra especial estragada vale o sistema', () => {
  const d = R.bancoVazio();
  delete d.perfis_regras;
  R.normalizar(d);
  try {
    assert.deepEqual(d.perfis_regras, []);
    d.perfis_regras.push({ id: 1, nome: 'X', valores: { proporcional: 'inventado', base_multa: 'aluguel' } });
    d.contratos.push({ id: 7, inquilino_nome: 'Y', perfil_regras_id: 1 });
    CR.usarRegras(d);
    assert.equal(R.regra('proporcional', { contrato_id: 7 }), 'mes_30');
    assert.equal(R.regra('base_multa', { contrato_id: 7 }), 'aluguel');
  } finally { CR.usarRegras(null); }
});
