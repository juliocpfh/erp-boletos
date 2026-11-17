// Dados 47 (mutirão 3000): ao gravar (inserir/atualizar), os campos de dinheiro precisam estar em centavos inteiros.
// Os campos de dinheiro de cada tabela são os do tipo "dinheiro" no formulário do cadastro (TABELAS não diz o tipo).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as R from '../docs/js/regras.js';

const banco = () => { const d = R.bancoVazio(); R.normalizar(d); return d; };

test('campos de dinheiro: tirados dos formulários de cada cadastro (sem os virtuais)', () => {
  const m = R.camposDeDinheiro();
  assert.equal(m.cobrancas.get('aluguel'), 'Aluguel');
  assert.ok(m.cobrancas.has('outros') && m.cobrancas.has('reserva_utilizada'));
  assert.ok(m.contratos.has('aluguel_inicial') && m.contratos.has('caucao_valor'));
  assert.ok(!m.contratos.has('aluguel_bonificado'), 'virtual: não é gravado');
  assert.ok(m.iptus.has('valor_parcela') && m.avulsas.has('valor') && m.fichas.has('renda_mensal'));
  assert.equal(m.indices_acumulados, undefined, 'tabela sem formulário de dinheiro não é conferida (o "valor" ali é um %)');
});

test('inserir: texto ou número quebrado num campo de centavos é recusado com aviso simples e nada é gravado', () => {
  const d = banco();
  const antes = JSON.stringify({ cobrancas: d.cobrancas, seq: d.seq, historico: d.historico.length });
  for (const ruim of ['10,5', 10.5, Number.NaN, Infinity, '1050']) {
    assert.throws(() => R.inserir(d, 'cobrancas', { contrato_id: 1, competencia: '2026-11', aluguel: ruim }, 'teste', 'Boleto'), C.ErroUsuario, String(ruim));
  }
  assert.throws(() => R.inserir(d, 'cobrancas', { aluguel: '10,5' }, 'teste', 'x'), /Valor inválido em "Aluguel" \(Boleto\): "10,5"\. Use reais com centavos, ex\.: 1\.250,50\. Nada foi gravado\./);
  assert.equal(JSON.stringify({ cobrancas: d.cobrancas, seq: d.seq, historico: d.historico.length }), antes, 'nada mudou');
});

test('inserir: centavos inteiros (também negativos, como o ajuste do mês) e vazios passam', () => {
  const d = banco();
  const cb = R.inserir(d, 'cobrancas', { contrato_id: 1, competencia: '2026-11', aluguel: 180000, desconto: 0, outros: -15000, iptu: null, seguro: undefined, fci: '' }, 'teste', 'Boleto');
  assert.equal(cb.aluguel, 180000);
  assert.equal(d.cobrancas.length, 1);
  // campos que não são dinheiro não são conferidos
  R.inserir(d, 'contratos', { inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', aluguel_inicial: 200000, observacoes: '10,5' }, 'teste', 'Contrato');
  // tabela sem campo de dinheiro no formulário: como antes (ex.: carga do extrato)
  R.inserir(d, 'movimentacoes_banco', { valor: 12345, data: '2026-11-10' }, 'teste', '', { historico: false });
});

test('atualizar: confere só o que muda (registro antigo com valor fora do formato não trava outra alteração)', () => {
  const d = banco();
  const cb = R.inserir(d, 'cobrancas', { contrato_id: 1, competencia: '2026-11', aluguel: 180000 }, 'teste', 'Boleto');
  assert.throws(() => R.atualizar(d, 'cobrancas', cb.id, { aluguel: '1.800,00' }, 'teste', 'x'), C.ErroUsuario);
  assert.equal(cb.aluguel, 180000, 'não gravou');
  R.atualizar(d, 'cobrancas', cb.id, { aluguel: 190000 }, 'teste', 'x');
  assert.equal(cb.aluguel, 190000);
  // dado antigo (de antes da conferência) com texto: outra alteração passa, e reenviar o mesmo valor também
  cb.iptu = '10,5';
  R.atualizar(d, 'cobrancas', cb.id, { observacoes: 'ok', iptu: '10,5' }, 'teste', 'x');
  assert.equal(cb.observacoes, 'ok');
  R.atualizar(d, 'cobrancas', cb.id, { iptu: 1050 }, 'teste', 'corrigido');
  assert.equal(cb.iptu, 1050);
});

test('normalizar e dados antigos: um banco com valor fora do formato continua abrindo', () => {
  const d = banco();
  d.cobrancas.push({ id: 1, contrato_id: 1, competencia: '2026-10', aluguel: '1800,00' });
  assert.doesNotThrow(() => R.normalizar(d));
});
