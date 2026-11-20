// Mutirão de 19/11, lote G (banco e financeiro): saúde do banco com as contas de outros bancos e a regra dos dias do extrato,
// link da guia trimestral, destinos que servem para entrada/saída, erro do C6 em português, pagamentos preparados por conta,
// filtro por imóvel no Banco, lista das contas pagas por nós e o "×" só na conta lançada à mão. CNPJ de teste 11.222.333/0001-81.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as CR from '../docs/js/config-regras.js';
import * as R from '../docs/js/regras.js';
import * as Z from '../docs/js/conciliacao.js';
import { carregarSite, entrarComo } from './tela-falsa.mjs';

function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const jck = R.inserir(d, 'emitentes', { nome: 'JCK', razao_social: 'JCK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua A, 117', cidade: 'Curitiba', uf: 'PR', cep: '80000-000', bairro: 'Centro' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  d.config_banco = { ativo: true, provedor: 'c6', conta_padrao_id: 'ank', permitir_pagamentos: true,
    contas: [{ id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox' }, { id: 'jck', apelido: 'JCK', emitente_id: jck.id, ambiente: 'sandbox' }],
    contas_arquivo: [{ id: 'itau', apelido: 'Itaú', emitente_id: ank.id, banco: 'Itaú' }] };
  R.normalizar(d);
  return { d, loja };
}
const mov = (d, dados) => R.inserir(d, 'movimentacoes_banco', { tipo: 'entrada', descricao: 'PIX', importada_em: '2026-11-01T10:00:00', ...dados }, 'j', { historico: false });

test('saúde do banco: traz a conta de outro banco (sem certificado) e usa a regra dos dias do extrato recente', () => {
  const { d } = base();
  mov(d, { conta_id: 'ank', data: '2026-11-13', valor: 1000 });
  mov(d, { conta_id: 'itau', data: '2026-11-12', valor: 2000 });
  d.extrato_importado_ate = { ank: '2026-11-13', itau: '2026-11-12' };
  const s = Z.saudeDoBanco(d, '2026-11-20');
  assert.deepEqual(s.contas.map((c) => [c.id, c.arquivo]), [['ank', false], ['jck', false], ['itau', true]], 'as do C6 e a do Itaú');
  assert.equal(s.diasExtrato, CR.regra('dias_extrato_recente'));
  // padrão de 7 dias: em 20/11, importado até 13/11 está em dia; até 12/11, parado (mesma conta do Fechamento)
  const porId = Object.fromEntries(s.contas.map((c) => [c.id, c]));
  assert.equal(porId.ank.atrasado, false);
  assert.equal(porId.itau.atrasado, true);
  const fechamento = R.pendenciasBancoDoMes(d, '2026-11', '2026-11-20');
  assert.deepEqual(fechamento.porConta.filter((x) => x.id !== 'jck').map((x) => [x.id, x.semImportar]), [['ank', false], ['itau', true]], 'o Fechamento diz o mesmo');
});

test('guia trimestral: o link vai para o último mês do trimestre; a mensal fica no próprio mês', () => {
  assert.equal(R.mesDoPeriodoGuia('2026-T3'), '2026-09');
  assert.equal(R.mesDoPeriodoGuia('2026-T1'), '2026-03');
  assert.equal(R.mesDoPeriodoGuia('2026-T4'), '2026-12');
  assert.equal(R.mesDoPeriodoGuia('2026-10'), '2026-10');
});

test('destinos: a entrada não oferece conta do imóvel, reforma, IPTU, imposto e devolução ao inquilino; a saída não oferece Airbnb', () => {
  const entrada = Object.keys(Z.CLASSIFICACOES).filter((k) => Z.destinoServe(k, 'entrada'));
  const saida = Object.keys(Z.CLASSIFICACOES).filter((k) => Z.destinoServe(k, 'saida'));
  for (const k of ['conta_imovel', 'reforma', 'iptu', 'imposto', 'devolucao_inquilino']) assert.ok(!entrada.includes(k), k);
  assert.ok(entrada.includes('boleto') && entrada.includes('airbnb'));
  assert.ok(!saida.includes('airbnb') && saida.includes('conta_imovel') && saida.includes('tarifa'));
  // a recusa continua na regra (o filtro da janela só evita chegar nela)
  const { d } = base();
  const m = mov(d, { conta_id: 'ank', data: '2026-11-13', valor: 180000 });
  assert.throws(() => Z.vincularMovimentacao(d, m.id, { classificacao: 'iptu' }, 'j'), (e) => e instanceof Error && e.esperado === true);
});

test('erro de leitura do C6 em português, com o texto do banco entre parênteses', () => {
  assert.equal(Z.erroDoItemC6({ status: 'DECODE_ERROR', error_message: 'It was not possible to decode: 1234' }), 'O banco não conseguiu ler este código ou esta chave (It was not possible to decode: 1234)');
  assert.equal(Z.erroDoItemC6({ status: 'READ_DATA' }), null);
  assert.equal(Z.erroDoItemC6({ status: 'ERROR', error_message: 'Saldo insuficiente' }), 'Saldo insuficiente');
});

test('avisos esperados de preenchimento são erro do usuário (não vão ao registro de erros)', () => {
  const { d, loja } = base();
  const m = mov(d, { conta_id: 'ank', data: '2026-11-13', valor: 180000 });
  const esperado = (e) => e.esperado === true;
  assert.throws(() => Z.vincularMovimentacao(d, m.id, { classificacao: 'boleto' }, 'j'), esperado);
  assert.throws(() => R.lancarDespesas(d, loja.id, '2026-11', [], 'j'), esperado);
});

test('telas: pagamentos de contas diferentes, filtro por imóvel, contas pagas por nós e botões apagados com o motivo', async () => {
  const T = await carregarSite();
  const { d, loja } = base();
  // dois rascunhos sem leitura do banco no mesmo imóvel: Água pela ANK (R$ 150,00) e Luz pela JCK (R$ 200,00)
  R.inserir(d, 'pagamentos_banco', { conta_id: 'ank', imovel_id: loja.id, tipo_conta: 'Água', competencia: '2026-11', valor: 15000, situacao: 'rascunho', data_pagamento: '2026-11-25' }, 'j');
  R.inserir(d, 'pagamentos_banco', { conta_id: 'jck', imovel_id: loja.id, tipo_conta: 'Luz', competencia: '2026-11', valor: 20000, situacao: 'rascunho', data_pagamento: '2026-11-25' }, 'j');
  // extrato: 2 entradas na ANK e 1 saída na JCK, todas do imóvel
  mov(d, { conta_id: 'ank', data: '2026-11-05', valor: 180000, imovel_id: loja.id, classificacao: 'outro' });
  mov(d, { conta_id: 'ank', data: '2026-10-05', valor: 180000, imovel_id: loja.id, classificacao: 'outro' });
  mov(d, { conta_id: 'jck', data: '2026-11-06', valor: 48000, tipo: 'saida', imovel_id: loja.id, classificacao: 'outro' });
  // contas pagas por nós: 61 lançadas à mão, uma do extrato e uma paga pelo banco
  for (let k = 0; k < 61; k += 1) R.inserir(d, 'despesas', { imovel_id: loja.id, tipo: 'Água', competencia: '2021-01', valor: 1000 + k, data_pagamento: `2021-01-${String((k % 28) + 1).padStart(2, '0')}` }, 'j');
  R.inserir(d, 'despesas', { imovel_id: loja.id, tipo: 'Luz', competencia: '2026-11', valor: 15000, data_pagamento: '2026-11-10', movimentacao_id: 999 }, 'j');
  R.inserir(d, 'despesas', { imovel_id: loja.id, tipo: 'Gás', competencia: '2026-11', valor: 9000, data_pagamento: '2026-11-11', pagamento_banco_id: 998 }, 'j');
  R.inserir(d, 'usuarios', { login: 'dono@exemplo.com.br', nome: 'Dono', papel: 'admin', ativo: true }, 'teste');
  T.E.d = d;
  entrarComo(T.E, 'admin');
  const TB = await import('../docs/js/telas/banco.js');
  const TF = await import('../docs/js/telas/financeiro.js');
  const TC = await import('../docs/js/telas/banco-c6.js');

  const caixa = TB.caixaPagarPeloBanco(R.buscar(d, 'imoveis', loja.id), '2026-11');
  assert.equal((caixa.match(/<h3>Pagamento preparado · /g) || []).length, 2, 'um bloco por conta');
  assert.match(caixa, /Pagamento preparado · ANK/);
  assert.match(caixa, /Pagamento preparado · JCK/);

  const banco = TB.telaBanco({ partes: ['banco'], q: { imovel: String(loja.id) } });
  assert.match(banco, /id="imovel-outras-contas"/, 'avisa que há movimentação do imóvel na outra conta');
  assert.match(banco, /1 movimentação\(ões\) em JCK/);
  assert.match(banco, /ANK · conta no C6 \(2\)/, 'cada aba diz quantas do imóvel tem');

  const filtrado = TB.telaBanco({ partes: ['banco'], q: { conta: 'ank', mes: '2026-11', filtro: 'sem_destino' } });
  assert.match(filtrado, /<input type="hidden" name="filtro" value="sem_destino">/, 'o "Ir" do mês mantém o filtro');

  const contas = TF.telaContas({ partes: ['contas', String(loja.id)], q: {} });
  assert.match(contas, /Mostrando os 60 mais recentes de 63/);
  assert.match(contas, /todos=1/);
  assert.match(contas, /<span class="suave">extrato<\/span>/);
  assert.match(contas, /<span class="suave">pelo banco<\/span>/);
  assert.ok(!/Excluir Luz de 11\/2026/.test(contas) && !/Excluir Gás de 11\/2026/.test(contas), 'sem × nas que vieram do banco');
  const todas = TF.telaContas({ partes: ['contas', String(loja.id)], q: { todos: '1' } });
  assert.ok(!todas.includes('data-mais-antigos'), 'com "Ver todos" a lista vem inteira');
  assert.equal((todas.match(/data-acao="excluir"/g) || []).length, 61);

  // banco desligado: o botão apagado diz o motivo no toque (data-motivo) e o "Conferir pagamentos" também fica apagado
  d.config_banco.ativo = false;
  const botoes = TC.botoesMesC6('2026-11');
  assert.match(botoes, /data-motivo="[^"]+"[^>]*>Emitir no C6 todos em aberto do mês/);
  assert.ok(!botoes.includes('href="#/banco?'), 'sem a ponte, nada de link para a conferência');
  assert.ok(!botoes.includes(' disabled'), 'não é disabled: o toque precisa chegar');
});
