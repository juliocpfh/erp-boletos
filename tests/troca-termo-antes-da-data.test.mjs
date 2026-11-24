import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

// Pedido do dono de 24/11/2026: termo da troca de titular anexado antes da data, depois de gerados os boletos. Os boletos do
// anterior dos meses depois da troca passam ao novo titular assim que o termo é anexado (como a janela "todo o vínculo será
// herdado" promete); antes só passavam no dia da troca e "Gerar boletos" nesse meio-tempo cobrava os dois (R$ 3.600,00).
// Pessoas fictícias; CPF e CNPJ de teste.
function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  const casa = R.inserir(d, 'imoveis', { nome: 'Casa 3', endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: casa.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'João Souza', inquilino_cpf: '529.982.247-25',
    data_entrada: '2025-01-10', vigencia_inicio: '2025-01-10', vigencia_fim: '2027-07-10', prazo_meses: 30, aluguel_inicial: 180000, dia_vencimento: 10,
    indice_correcao: 'IPCA', garantia_tipo: 'Fiador', finalidade: 'Residencial' }, 'j');
  return { d, c };
}
function novo(d, c, entrada) {
  return R.inserir(d, 'contratos', { imovel_id: c.imovel_id, contrato_anterior_id: c.id, inquilino_nome: 'Maria Lima', inquilino_cpf: '529.982.247-25',
    data_entrada: entrada, vigencia_inicio: entrada, aluguel_inicial: 180000, dia_vencimento: 10, indice_correcao: 'IPCA', garantia_tipo: 'Fiador', finalidade: 'Residencial' }, 'j');
}
const anexarTermo = (d, n, hoje) => {
  R.inserir(d, 'aditivos', { contrato_id: n.id, tipo: 'Troca de titular', data: hoje, arquivo: 'termo.pdf' }, 'j');
  return R.transferirHeranca(d, n.id, 'j', hoje);
};
const doMes = (d, comp) => d.cobrancas.filter((x) => x.competencia === comp && !R.ehBoletoAvulso(x)).map((x) => [R.buscar(d, 'contratos', x.contrato_id).inquilino_nome, x.aluguel]).sort();

test('troca em 01/12: boleto de dezembro de João gerado em 20/11 passa a Maria ao anexar o termo em 22/11; gerar não dobra', () => {
  const { d, c } = base();
  const n = novo(d, c, '2026-12-01');
  R.transferirHeranca(d, n.id, 'j', '2026-11-19'); // troca registrada sem o termo
  R.gerarCobrancas(d, '2026-12', 'j');
  assert.deepEqual(doMes(d, '2026-12'), [['João Souza', 180000]], 'sem o termo, dezembro é de João');
  const r = anexarTermo(d, n, '2026-11-22');
  assert.ok(r.agendada);
  assert.equal(r.boletosMovidos, 1);
  assert.deepEqual(doMes(d, '2026-12'), [['Maria Lima', 180000]], 'passou a Maria já no dia do termo');
  R.gerarCobrancas(d, '2026-12', 'j');
  assert.deepEqual(doMes(d, '2026-12'), [['Maria Lima', 180000]], 'antes: João R$ 1.800,00 e Maria R$ 1.800,00 (R$ 3.600,00)');
  // no dia da troca a herança se completa sem repetir nada
  R.transferirHeranca(d, n.id, 'j', '2026-12-01');
  assert.deepEqual(doMes(d, '2026-12'), [['Maria Lima', 180000]]);
});

test('troca em 15/12: o boleto de dezembro fica com João (14/30); os meses depois passam a Maria', () => {
  const { d, c } = base();
  const n = novo(d, c, '2026-12-15');
  R.transferirHeranca(d, n.id, 'j', '2026-11-19');
  R.gerarCobrancas(d, '2026-12', 'j');
  R.gerarCobrancas(d, '2027-01', 'j');
  anexarTermo(d, n, '2026-11-22');
  assert.deepEqual(doMes(d, '2026-12'), [['João Souza', 84000]], 'dezembro de João, proporcional até a véspera');
  assert.deepEqual(doMes(d, '2027-01'), [['Maria Lima', 180000]], 'janeiro já passou a Maria');
  R.gerarCobrancas(d, '2026-12', 'j');
  R.gerarCobrancas(d, '2027-01', 'j');
  assert.deepEqual(doMes(d, '2026-12'), [['João Souza', 84000], ['Maria Lima', 96000]]);
  assert.deepEqual(doMes(d, '2027-01'), [['Maria Lima', 180000]]);
});

test('boleto de João de depois da troca emitido no banco: fica com ele (aviso para cancelar), como no dia da troca', () => {
  const { d, c } = base();
  const n = novo(d, c, '2026-12-01');
  R.transferirHeranca(d, n.id, 'j', '2026-11-19');
  R.gerarCobrancas(d, '2026-12', 'j');
  const dez = d.cobrancas.find((x) => x.competencia === '2026-12');
  R.atualizar(d, 'cobrancas', dez.id, { banco: { situacao: 'emitido' } }, 'j');
  // Maria já tem o boleto dela de dezembro (gerado quando o termo foi anexado de outro jeito): o de João, no banco, fica
  R.inserir(d, 'aditivos', { contrato_id: n.id, tipo: 'Troca de titular', data: '2026-11-22', arquivo: 'termo.pdf' }, 'j');
  R.gerarCobrancas(d, '2026-12', 'j');
  const r = R.transferirHeranca(d, n.id, 'j', '2026-11-22');
  assert.equal(r.noBanco, 1);
  assert.equal(R.buscar(d, 'cobrancas', dez.id).contrato_id, c.id);
});
