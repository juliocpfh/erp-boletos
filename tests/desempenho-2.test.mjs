// Desempenho, parte 2 (mutirão de 16/11/2026): o que ficou mais rápido tem de dar exatamente o mesmo resultado de antes.
// Dados fictícios (CPF de teste 529.982.247-25).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as N from '../docs/js/nuvem.js';
import * as R from '../docs/js/regras.js';

test('abertura com a nuvem: /api/saude vai ao site uma vez só (nuvemDisponivel e depois saudeDaNuvem)', async () => {
  const antes = globalThis.fetch;
  const pedidos = [];
  globalThis.fetch = async (url) => { pedidos.push(String(url)); return new Response(JSON.stringify({ email: 'equipe@exemplo.com.br' }), { headers: { 'content-type': 'application/json' } }); };
  try {
    assert.equal(await N.nuvemDisponivel(), true);
    assert.deepEqual(await N.saudeDaNuvem(), { email: 'equipe@exemplo.com.br' });
    assert.equal(pedidos.length, 1, 'a resposta da conferência é reaproveitada');
    await N.saudeDaNuvem(); // depois disso, pede de novo (a resposta guardada vale uma vez)
    assert.equal(pedidos.length, 2);
  } finally { globalThis.fetch = antes; }
});

test('reajustes de um contrato só (página do contrato): os mesmos da lista de todos, sem calcular os dos outros', () => {
  const d = R.bancoVazio();
  const i = R.inserir(d, 'imoveis', { nome: 'Casa', endereco: 'Rua A, 1' }, 'j');
  const j = R.inserir(d, 'imoveis', { nome: 'Sala', endereco: 'Rua B, 2' }, 'j');
  const a = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ana Teste', data_entrada: '2023-11-10', vigencia_inicio: '2023-11-10', aluguel_inicial: 200000, dia_vencimento: 10, indice_correcao: 'IPCA' }, 'j');
  const b = R.inserir(d, 'contratos', { imovel_id: j.id, inquilino_nome: 'Bia Teste', data_entrada: '2024-02-05', vigencia_inicio: '2024-02-05', aluguel_inicial: 150000, dia_vencimento: 5, indice_correcao: 'IGP-M' }, 'j');
  const todos = R.reajustesAbertos(d, '2026-10-24');
  for (const c of [a, b]) {
    const so = R.reajustesAbertos(d, '2026-10-24', { contratoId: c.id });
    assert.ok(so.length > 0);
    assert.deepEqual(so, todos.filter((r) => r.contrato.id === c.id));
  }
});

test('IPTU com a base montada uma vez para a tela: o mesmo resultado de cada conta sozinha', () => {
  const d = R.bancoVazio();
  const i = R.inserir(d, 'imoveis', { nome: 'Casa', endereco: 'Rua A, 1' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ana Teste', data_entrada: '2026-03-15', vigencia_inicio: '2026-03-15', aluguel_inicial: 200000, dia_vencimento: 10, cobrar_iptu: true }, 'j');
  R.inserir(d, 'iptus', { imovel_id: i.id, ano: 2026, valor_total: 120000, num_parcelas: 10, primeira_competencia: '2026-02' }, 'j');
  R.inserir(d, 'iptus', { imovel_id: i.id, ano: 2025, valor_total: 90000, pago_avista: true, valor_avista: 85000, data_quitacao: '2025-02-10' }, 'j');
  R.gerarCobrancas(d, '2026-04', 'j');
  R.gerarCobrancas(d, '2026-05', 'j');
  assert.ok(d.cobrancas.some((cb) => cb.contrato_id === c.id));
  const baseDe = R.basesIptu(d);
  for (const p of d.iptus) {
    assert.deepEqual(R.parcelasIptu(d, p, baseDe(p.imovel_id)), R.parcelasIptu(d, p));
    assert.deepEqual(R.totaisIptu(d, p, baseDe(p.imovel_id)), R.totaisIptu(d, p));
    assert.deepEqual(R.mesesIptuAvista(d, p, baseDe(p.imovel_id)), R.mesesIptuAvista(d, p));
    assert.deepEqual(R.mapaIptuAvista(d, p, baseDe(p.imovel_id)), R.mapaIptuAvista(d, p));
  }
});
