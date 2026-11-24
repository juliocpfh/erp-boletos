// Pintura na saída (decisão do dono, 24/11/2026): pintura nova na entrada → orçamento inteiro; sem pintura nova → só o que
// faltava da vida da pintura (regra pintura_vida_meses, 36 meses); vistoria antiga sem a informação → sem sugestão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../docs/js/calculos.js';
import * as K from '../docs/js/contratos.js';
import { DEFINICOES_REGRAS } from '../docs/js/config-regras.js';
import * as X from '../docs/js/exportar.js';

const banco = (pintura, saida = '2026-01-09') => {
  const c = { id: 1, inquilino_nome: 'Fulano de Teste', imovel_id: 1, data_entrada: '2025-01-10', data_saida: saida };
  const v = { id: 1, contrato_id: 1, imovel_id: 1, tipo: 'Entrada', data: '2025-01-08', itens: [] };
  if (pintura !== undefined) v.pintura_nova = pintura;
  return { d: { contratos: [c], vistorias: [v] }, c };
};

test('meses de moradia pelo mês comercial', () => {
  assert.equal(C.mesesDeMoradia('2025-01-10', '2026-01-09'), 12);
  assert.equal(C.mesesDeMoradia('2025-01-10', '2025-02-20'), 1);
  assert.equal(C.mesesDeMoradia('2025-01-01', '2025-02-28'), 2); // 28/02 completa 30
  assert.equal(C.mesesDeMoradia('2025-03-01', '2025-02-28'), 0);
});

test('pintura nova na entrada: orçamento inteiro', () => {
  const { d, c } = banco(true);
  const s = K.sugestaoPintura(d, c, 240000);
  assert.equal(s.caso, 'nova');
  assert.equal(s.valor, 240000);
});

test('sem pintura nova: só a vida que faltava (12 meses → R$ 1.600,00; 36 ou mais → nada)', () => {
  const { d, c } = banco(false);
  const s = K.sugestaoPintura(d, c, 240000);
  assert.equal(s.caso, 'antiga');
  assert.equal(s.meses, 12);
  assert.equal(s.valor, 160000);
  assert.match(s.texto, /R\$ 2\.400,00 × 24\/36 = R\$ 1\.600,00/);
  const longo = banco(false, '2028-03-15');
  assert.equal(K.sugestaoPintura(longo.d, longo.c, 240000).valor, 0);
  assert.equal(K.sugestaoPintura(d, c, null).valor, null); // sem o orçamento, sem conta
});

test('vistoria antiga sem a informação: sem sugestão, com aviso', () => {
  const { d, c } = banco(undefined);
  const s = K.sugestaoPintura(d, c, 240000);
  assert.equal(s.caso, 'sem_info');
  assert.equal(s.valor, null);
  assert.match(s.texto, /confira a vistoria de entrada/);
});

test('regra configurável com padrão de 36 meses e a lei', () => {
  const r = DEFINICOES_REGRAS.find((x) => x.chave === 'pintura_vida_meses');
  assert.equal(r.padrao, 36);
  assert.match(r.lei, /art\. 23, III/);
});

test('pendência de pintura já vem marcada', () => {
  assert.ok(K.ehPintura('Sala – Paredes e teto (pintura, manchas, fissuras, furos) (Marcas de uso)'));
  assert.ok(!K.ehPintura('Sala – Porta (Avaria: riscada)'));
});

test('Histórico e planilha: orçamento da pintura em reais, com nome em português', () => {
  assert.equal(X.valorTexto('orcamento_valor', 240000), 'R$ 2.400,00');
  assert.equal(X.rotuloCampo('orcamento_valor'), 'Orçamento inteiro da pintura');
  assert.equal(X.rotuloCampo('pintura_nova', 'vistorias'), 'Pintura nova na entrada');
});
