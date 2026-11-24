import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

// Decisão do dono de 24/11/2026: o boleto do novo titular só existe depois do termo da troca assinado. Termo marcado "não valeu"
// depois de gerados os boletos do mês da troca cobrava o mês dos dois. Pessoas fictícias; CPF e CNPJ de teste.
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
function troca(d, c, entrada) {
  const n = R.inserir(d, 'contratos', { imovel_id: c.imovel_id, contrato_anterior_id: c.id, inquilino_nome: 'Maria Lima', inquilino_cpf: '529.982.247-25',
    data_entrada: entrada, vigencia_inicio: entrada, aluguel_inicial: 180000, dia_vencimento: 10, indice_correcao: 'IPCA', garantia_tipo: 'Fiador', finalidade: 'Residencial' }, 'j');
  const ad = R.inserir(d, 'aditivos', { contrato_id: n.id, tipo: 'Troca de titular', data: '2026-11-18', arquivo: 'termo.pdf' }, 'j');
  R.transferirHeranca(d, n.id, 'j', '2026-11-20');
  return { n, ad };
}
const doMes = (d, comp) => d.cobrancas.filter((x) => x.competencia === comp && !R.ehBoletoAvulso(x)).map((x) => [R.buscar(d, 'contratos', x.contrato_id).inquilino_nome, x.aluguel]);

test('troca em 01/12, boletos de dezembro gerados e termo "não valeu": só João é cobrado, pelo mês cheio', () => {
  const { d, c } = base();
  const { n, ad } = troca(d, c, '2026-12-01');
  R.gerarCobrancas(d, '2026-12', 'j');
  assert.deepEqual(doMes(d, '2026-12'), [['Maria Lima', 180000]], 'antes: dezembro é de Maria');
  const msg = R.desfazerAditivo(d, ad.id, 'j', { excluirTermo: false });
  assert.match(msg, /João Souza continua no contrato/);
  assert.match(msg, /O boleto de Maria Lima \(12\/2026\) saiu e João Souza volta a ser cobrado pelo mês cheio/);
  assert.deepEqual(doMes(d, '2026-12'), [['João Souza', 180000]], 'antes da correção: Maria R$ 1.800,00 e João R$ 1.800,00');
  // gerar de novo não volta o boleto de Maria (sem o termo, a troca espera)
  R.gerarCobrancas(d, '2026-12', 'j');
  assert.deepEqual(doMes(d, '2026-12'), [['João Souza', 180000]]);
  assert.ok(R.trocaAguardaAditivo(d, R.buscar(d, 'contratos', n.id)));
});

test('troca em 15/12: o boleto de Maria (16/30) sai e o de João volta de 14/30 para o mês cheio', () => {
  const { d, c } = base();
  const { ad } = troca(d, c, '2026-12-15');
  R.gerarCobrancas(d, '2026-12', 'j');
  assert.deepEqual(doMes(d, '2026-12'), [['João Souza', 84000], ['Maria Lima', 96000]]);
  R.desfazerAditivo(d, ad.id, 'j', { excluirTermo: true });
  assert.deepEqual(doMes(d, '2026-12'), [['João Souza', 180000]], 'antes da correção: Maria R$ 960,00 e João R$ 1.800,00');
});

test('boleto do novo titular pago ou emitido no banco fica, com aviso; o em aberto sai', () => {
  const { d, c } = base();
  const { ad } = troca(d, c, '2026-12-01');
  R.gerarCobrancas(d, '2026-12', 'j');
  R.gerarCobrancas(d, '2027-01', 'j');
  const dez = d.cobrancas.find((x) => x.competencia === '2026-12');
  const jan = d.cobrancas.find((x) => x.competencia === '2027-01');
  R.registrarPagamento(d, dez.id, '2027-01-08', null, 'j');
  R.atualizar(d, 'cobrancas', jan.id, { banco: { situacao: 'emitido' } }, 'j');
  R.gerarCobrancas(d, '2027-02', 'j');
  const msg = R.desfazerAditivo(d, ad.id, 'j', { excluirTermo: false });
  assert.match(msg, /O boleto de Maria Lima \(02\/2027\) saiu/);
  assert.match(msg, /Atenção: os boletos de Maria Lima 12\/2026 \(pago em 08\/01\/2027\), 01\/2027 \(emitido no banco\) ficaram: confira/);
  assert.ok(R.buscar(d, 'cobrancas', dez.id) && R.buscar(d, 'cobrancas', jan.id), 'pago e emitido no banco não são apagados');
  assert.deepEqual(doMes(d, '2027-02'), [['João Souza', 180000]]);
  assert.ok(d.historico.some((h) => /Boleto 12\/2026 de Maria Lima pago em 08\/01\/2027: fica/.test(h.descricao || '')), 'anotado no Histórico');
});
