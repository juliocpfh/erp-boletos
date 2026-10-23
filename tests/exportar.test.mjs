import assert from 'node:assert/strict';
import test from 'node:test';
import * as X from '../docs/js/exportar.js';
import * as R from '../docs/js/regras.js';

test('exportar em planilha e PDF: todas as tabelas, sem senha, valores legíveis', () => {
  const d = R.bancoVazio();
  R.inserir(d, 'usuarios', { login: 'adm', nome: 'Adm', papel: 'admin', ativo: true, senha_sal: 'x', senha_hash: 'y' }, 'adm');
  R.inserir(d, 'contratos', { inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', aluguel_inicial: 135000, data_entrada: '2026-06-07', multa_percentual: 10 }, 'adm');
  const lista = X.dadosParaExportar(d);
  assert.ok(lista.some((t) => t.tabela === 'imoveis'), 'tabela vazia também entra');
  assert.equal(lista.at(-1).tabela, 'historico');
  const u = lista.find((t) => t.tabela === 'usuarios');
  assert.ok(!u.colunas.some((c) => /senha/.test(c.nome)), 'senha não sai');
  const c = lista.find((t) => t.tabela === 'contratos');
  assert.equal(c.colunas[0].nome, 'id');
  assert.equal(X.valorCelula('aluguel_inicial', 135000), 1350);
  assert.equal(X.valorTexto('aluguel_inicial', 135000), 'R$ 1.350,00');
  assert.equal(X.valorCelula('multa_percentual', 10), 10);
  assert.equal(X.valorCelula('data_entrada', '2026-06-07'), '07/06/2026');
  assert.equal(X.valorCelula('competencia', '2026-06'), '06/2026');
  assert.equal(X.valorCelula('ativo', true), 'Sim');
  assert.equal(X.ehDinheiro('valor_pago'), true);
  assert.equal(X.ehDinheiro('iptu_parcela'), false);
  const usados = new Set();
  assert.equal(X.nomeAba('Depósito da caução / garantia', usados), 'Depósito da caução - garantia');
  assert.equal(X.nomeAba('Depósito da caução / garantia', usados), 'Depósito da caução - garant (2)');
});
