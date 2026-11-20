// Lote M do mutirão de 19–20/11/2026 (inquilino, imóvel, busca, ajuda e textos soltos). Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as A from '../docs/js/ajuda.js';
import * as S from '../docs/js/armazenamento.js';
import * as C from '../docs/js/calculos.js';
import * as R from '../docs/js/regras.js';

function base() {
  const d = R.bancoVazio(); R.normalizar(d);
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    garantia_tipo: 'Caução', caucao_valor: 270000, caucao_data: '2026-06-01' }, 'julio');
  return { d, c };
}

test('textos-004/005: plural certo com 1 e "é hoje" no dia zero', () => {
  assert.equal(C.plural(1, 'dia'), '1 dia');
  assert.equal(C.plural(3, 'dia'), '3 dias');
  assert.equal(C.plural(1, 'aluguel', 'aluguéis'), '1 aluguel');
  assert.equal(C.plural(2, 'cadastro incompleto', 'cadastros incompletos'), '2 cadastros incompletos');
  assert.equal(C.faltamDias(1), 'falta 1 dia');
  assert.equal(C.faltamDias(5), 'faltam 5 dias');
  assert.equal(C.faltamDias(0), 'é hoje');
});

test('entrada-015: depósito da caução com data depois de hoje é recusado', () => {
  const { d, c } = base();
  assert.throws(() => R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2027-01-01', valor: 200000 }, 'julio', '2026-11-19'), /depois de hoje \(19\/11\/2026\)/);
  assert.equal(d.depositos_garantia.length, 0, 'nada gravado');
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-11-19', valor: 200000 }, 'julio', '2026-11-19');
  assert.equal(d.depositos_garantia.length, 1, 'no próprio dia vale');
});

test('saida-018: cálculo final antes da data de saída é recusado (a tela manda o dia de hoje)', () => {
  const { d, c } = base();
  c.data_saida = '2026-12-15';
  const dados = { data_saida: '2026-12-15', garantia_valor: 0, indice_percentual: 0, debitos: 0, leitura_agua: '1', leitura_energia: '2' };
  assert.throws(() => R.encerrarContrato(d, c.id, { ...dados }, 'julio', '2026-11-20'), /depois que o inquilino sai: a saída é em 15\/12\/2026/);
  assert.equal(d.encerramentos.length, 0);
  R.encerrarContrato(d, c.id, { ...dados }, 'julio', '2026-12-15');
  assert.equal(d.encerramentos.length, 1, 'no dia da saída já pode');
});

test('saida-005: devolução da garantia desfeita (data vazia) volta a etapa', () => {
  const { d, c } = base();
  c.data_saida = '2026-10-31';
  const e = R.encerrarContrato(d, c.id, { data_saida: '2026-10-31', garantia_valor: 0, indice_percentual: 0, debitos: 0, leitura_agua: '1', leitura_energia: '2' }, 'julio');
  R.marcarGarantiaDevolvida(d, e.id, '2026-11-12', 'julio');
  assert.equal(R.buscar(d, 'encerramentos', e.id).garantia_devolvida_em, '2026-11-12');
  R.marcarGarantiaDevolvida(d, e.id, '', 'julio');
  assert.equal(R.buscar(d, 'encerramentos', e.id).garantia_devolvida_em, null);
  assert.match(d.historico.at(-1).descricao, /devolução da garantia desfeita/);
});

test('mensal-011: o Histórico do pagamento diz de quem é o boleto e o mês', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-06', 'julio');
  R.registrarPagamento(d, R.boletoDoMes(d, c.id, '2026-06').id, '2026-07-10', null, 'julio');
  const h = d.historico.findLast((x) => x.tabela === 'cobrancas' && /Pagamento confirmado/.test(x.descricao || ''));
  assert.match(h.descricao, /Pagamento confirmado: boleto 06\/2026 de Maria Exemplo/);
});

test('comunicacoes-020: notificação em aberto conta o rascunho igual em todas as telas', () => {
  assert.equal(R.notificacaoEmAberto({ situacao: 'Rascunho' }), true);
  assert.equal(R.notificacaoEmAberto({}), true, 'sem situação = rascunho');
  assert.equal(R.notificacaoEmAberto({ situacao: 'Aguardando resposta' }), true);
  assert.equal(R.notificacaoEmAberto({ situacao: 'Multa gerada' }), true);
  assert.equal(R.notificacaoEmAberto({ situacao: 'Reiterada' }), false);
  assert.equal(R.notificacaoEmAberto({ situacao: 'Resolvida' }), false);
});

test('comunicacoes-026: nome comprido é cortado sem perder a extensão', () => {
  const nome = `${'a'.repeat(130)}.pdf`;
  const limpo = S.limparNome(nome);
  assert.equal(limpo.length, 120);
  assert.ok(limpo.endsWith('.pdf'));
  assert.equal(S.tipoParaAbrir(limpo), 'application/pdf');
  assert.equal(S.limparNome('contrato.pdf'), 'contrato.pdf', 'nome curto não muda');
});

test('admin-014: a ajuda usa o dia de gerar boletos e os meses da ficha das Regras do sistema', () => {
  assert.match(A.textoDaAjuda('cobrancas'), /A partir do dia 20, clique/);
  assert.match(A.textoDaAjuda('painel'), /No dia 20\/11\/2026/);
  assert.match(A.comRegras('saem depois de {meses_documentos_ficha|mês|meses}'), /depois de 3 meses/);
  assert.equal(A.comRegras('{nao_existe}'), '{nao_existe}', 'chave desconhecida fica como está');
  for (const k of Object.keys(A.AJUDA_TELAS)) assert.doesNotMatch(A.textoDaAjuda(k), /\{[a-z_]+/, `ajuda ${k} sem marca solta`);
});

test('textos-015: a busca chama o grupo de "NFs"', () => {
  const d = R.bancoVazio(); R.normalizar(d);
  R.inserir(d, 'faturas', { numero: 77, situacao: 'Emitida', tomador_nome: 'Fulano', valor: 100000, emissao: '2026-11-10' }, 't');
  const grupos = R.buscarGlobal(d, '0077');
  assert.ok(grupos.every((g) => g.tipo !== 'Notas fiscais'));
});
