// Pintura na saída (decisão do dono, 24/11/2026): pintura nova na entrada → orçamento inteiro; sem pintura nova → só o que
// faltava da vida da pintura (regra pintura_vida_meses, 48 meses desde 24/11/2026; era 36); vistoria antiga sem a informação → sem sugestão.
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

// entrada em 10/01/2025: a saída no dia 09 do mês completa os meses comerciais (ex.: 12 → 09/01/2026)
const saidaCom = (meses) => new Date(Date.UTC(2025, meses, 9)).toISOString().slice(0, 10);

test('sem pintura nova: só a vida que faltava dos 48 meses (12, 24, 47 e 48 meses)', () => {
  for (const [meses, valor, conta] of [[12, 180000, '36/48'], [24, 120000, '24/48'], [47, 5000, '1/48'], [48, 0, '0/48']]) {
    const { d, c } = banco(false, saidaCom(meses));
    const s = K.sugestaoPintura(d, c, 240000);
    assert.equal(s.caso, 'antiga');
    assert.equal(s.meses, meses, `saída em ${c.data_saida}`);
    assert.equal(s.vida, 48);
    assert.equal(s.valor, valor, `${meses} meses`);
    assert.ok(s.texto.includes(`× ${conta} = `), s.texto);
  }
  // o exemplo do dono: R$ 2.400,00 e 24 meses → R$ 1.200,00 (com a vida de 36 meses eram R$ 1.600,00)
  const dois = banco(false, saidaCom(24));
  assert.match(K.sugestaoPintura(dois.d, dois.c, 240000).texto, /R\$ 2\.400,00 × 24\/48 = R\$ 1\.200,00/);
  const longo = banco(false, '2030-03-15');
  assert.equal(K.sugestaoPintura(longo.d, longo.c, 240000).valor, 0);
  const { d, c } = banco(false);
  assert.equal(K.sugestaoPintura(d, c, null).valor, null); // sem o orçamento, sem conta
});

test('pintura nova na entrada: orçamento inteiro com qualquer tempo de moradia', () => {
  for (const meses of [12, 24, 47, 48, 60]) {
    const { d, c } = banco(true, saidaCom(meses));
    assert.equal(K.sugestaoPintura(d, c, 240000).valor, 240000, `${meses} meses`);
  }
});

test('vistoria antiga sem a informação: sem sugestão, com aviso', () => {
  const { d, c } = banco(undefined);
  const s = K.sugestaoPintura(d, c, 240000);
  assert.equal(s.caso, 'sem_info');
  assert.equal(s.valor, null);
  assert.match(s.texto, /confira a vistoria de entrada/);
});

test('regra configurável com padrão de 48 meses, a lei e o prazo do outro orçamento', () => {
  const r = DEFINICOES_REGRAS.find((x) => x.chave === 'pintura_vida_meses');
  assert.equal(r.padrao, 48);
  assert.match(r.explica, /24\/48 = R\$ 1\.200,00/);
  assert.match(r.explica, /antes da devolução das chaves/);
  assert.match(r.lei, /contravistoria/);
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
