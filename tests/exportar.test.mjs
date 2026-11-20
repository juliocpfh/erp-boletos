import assert from 'node:assert/strict';
import test from 'node:test';
import * as X from '../docs/js/exportar.js';
import * as R from '../docs/js/regras.js';

test('exportar em planilha e PDF: todas as tabelas, sem senha, valores legíveis', () => {
  const d = R.bancoVazio();
  R.inserir(d, 'usuarios', { login: 'adm', nome: 'Adm', papel: 'admin', ativo: true, senha_sal: 'x', senha_hash: 'y', sessoes: ['token-de-teste'] }, 'adm');
  R.inserir(d, 'contratos', { inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', aluguel_inicial: 135000, data_entrada: '2026-06-07', multa_percentual: 10 }, 'adm');
  const lista = X.dadosParaExportar(d);
  assert.ok(lista.some((t) => t.tabela === 'imoveis'), 'tabela vazia também entra');
  assert.equal(lista.at(-1).tabela, 'historico');
  const u = lista.find((t) => t.tabela === 'usuarios');
  assert.ok(!u.colunas.some((c) => /senha/.test(c.nome)), 'senha não sai');
  assert.ok(!u.colunas.some((c) => c.nome === 'sessoes'), 'tokens de sessão não saem');
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

test('texto das regras do sistema tem as seções principais e não traz dado de pessoa', async () => {
  const { REGRAS_TEXTO } = await import('../docs/js/regras-texto.js');
  for (const t of ['REAJUSTE DO ALUGUEL', 'GARANTIAS', 'NOTAS FISCAIS', 'IPTU', 'IMPOSTOS']) assert.ok(REGRAS_TEXTO.includes(t), t);
  assert.ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(REGRAS_TEXTO));
});

test('planilha de todos os dados: valores em centavos fora dos formulários saem em reais; regras mudadas no formato delas (mutirão 19/11)', () => {
  // impressos-007: dívida do acordo, FCI e diferença do pagamento a menos
  for (const nome of ['divida_na_data', 'fci_usado', 'fci_devolver', 'fci_credito', 'fci_danos', 'diferenca_devida']) {
    assert.equal(X.ehDinheiro(nome), true, nome);
  }
  assert.equal(X.valorCelula('divida_na_data', 1256736), 12567.36);
  assert.equal(X.valorTexto('divida_na_data', 1256736), 'R$ 12.567,36');
  for (const nome of ['diferenca_no_boleto', 'fci_indice', 'fci_percentual', 'fci_data', 'acordo_parcela_de']) assert.equal(X.ehDinheiro(nome), false, nome);
  // toda coluna em centavos do boleto é dinheiro (nenhuma sai com o número cru)
  const crus = ['aluguel', 'desconto', 'valor_pago', 'multa', 'juros', 'valor_nf', 'iptu', 'outros', 'diferenca_devida'].filter((n) => !X.ehDinheiro(n, 'cobrancas'));
  assert.deepEqual(crus, []);
  // admin-012: multa de 5% não vira "R$ 0,05"
  const d = R.bancoVazio();
  R.inserir(d, 'config_regras', { chave: 'multa_padrao', valor: 5 }, 'adm');
  R.inserir(d, 'config_regras', { chave: 'tarifa_padrao', valor: 350 }, 'adm');
  const regras = X.dadosParaExportar(d).find((t) => t.tabela === 'config_regras');
  assert.ok(regras.colunas.every((c) => !c.dinheiro), 'nenhuma coluna das regras é dinheiro');
  const multa = regras.registros.find((r) => r.chave === 'multa_padrao');
  assert.match(multa.valor, /^5(,0+)?\s?%$/);
  assert.ok(multa.regra && multa.regra.length > 3, 'leva o nome da regra');
  assert.equal(regras.registros.find((r) => r.chave === 'tarifa_padrao').valor, 'R$ 3,50');
  assert.equal(X.valorCelula('valor', 25, 'config_regras'), 25);
  assert.equal(d.config_regras[0].valor, 5, 'o banco não muda');
  // impressos-025: títulos com acento para os campos calculados
  assert.equal(X.rotuloCampo('divida_na_data', 'acordos'), 'Dívida na data');
  assert.equal(X.rotuloCampo('numero', 'faturas'), 'Número');
  assert.equal(X.rotuloCampo('fci_devolver', 'encerramentos'), 'FCI a devolver');
  assert.equal(X.rotuloCampo('valor_nf', 'cobrancas'), 'Valor da NF');
});
