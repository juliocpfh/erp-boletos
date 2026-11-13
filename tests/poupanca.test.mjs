import assert from 'node:assert/strict';
import test from 'node:test';
import * as K from '../docs/js/contratos.js';
import { atualizarTextoModelo } from '../docs/js/modelos-contrato.js';
import * as P from '../docs/js/poupanca.js';
import * as R from '../docs/js/regras.js';

// taxa igual todos os dias (0,60% ao mês): a conta fica conferível à mão
const TAXA_FIXA = new Proxy({}, { get: () => 0.6 });

function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true, endereco_sede: 'Rua A, 1', representante_nome: 'Maria' }, 'j');
  const casa = R.inserir(d, 'imoveis', { nome: 'Casa 3', endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: casa.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'João Souza', inquilino_cpf: '529.982.247-25', inquilino_genero: 'Masculino',
    data_entrada: '2025-01-10', vigencia_inicio: '2025-01-10', vigencia_fim: '2027-07-10', prazo_meses: 30, aluguel_inicial: 180000, dia_vencimento: 10,
    indice_correcao: 'IPCA', garantia_tipo: 'Caução', caucao_valor: 360000, caucao_meses: 2, finalidade: 'Residencial', descricao_objeto: 'a casa nº 3' }, 'j');
  return { d, c };
}
const texto = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : '')).join('\n');

test('poupança: rende no aniversário do depósito, mês incompleto não rende e dias 29 a 31 começam no dia 1º', () => {
  assert.deepEqual(P.periodosPoupanca('2026-09-10', '2026-12-01'), ['2026-09-10', '2026-10-10']);
  assert.deepEqual(P.periodosPoupanca('2026-09-10', '2026-12-10'), ['2026-09-10', '2026-10-10', '2026-11-10'], 'no dia do aniversário o mês já fechou');
  assert.deepEqual(P.periodosPoupanca('2026-11-10', '2026-12-09'), [], 'menos de um mês: nada');
  assert.equal(P.inicioPoupanca('2025-01-31'), '2025-02-01');
  assert.equal(P.inicioPoupanca('2025-01-28'), '2025-01-28');
  assert.deepEqual(P.periodosPoupanca('2025-01-31', '2025-04-01'), ['2025-02-01', '2025-03-01']);
  assert.equal(P.periodosPoupanca('2025-01-10', '2026-12-01').length, 22);
});

test('poupança: cada depósito corrigido pelas taxas do seu dia; depósito depois da data fica de fora', () => {
  const r = P.corrigirPelaPoupanca([{ data: '2025-01-10', valor: 360000 }, { data: '2026-01-15', valor: 20000 }, { data: '2026-12-20', valor: 5000 }], '2026-12-01', TAXA_FIXA);
  assert.deepEqual(r.depositos.map((x) => [x.meses, x.corrigido]), [[22, 410637], [10, 21233]]);
  assert.equal(r.total, 380000);
  assert.equal(r.corrigido, 431870);
  assert.equal(r.rendimento, 51870);
  assert.equal(r.percentual, 13.65);
  assert.deepEqual(r.falta, []);
  // o % devolvido leva o total ao mesmo valor em centavos (é o que o cálculo final grava)
  assert.equal(R.calcularEncerramento(r.total, r.percentual, 0).garantia_corrigida, r.corrigido);
  // taxa de cada dia: usa a do dia do aniversário, e avisa a que falta
  const dias = P.corrigirPelaPoupanca([{ data: '2026-09-10', valor: 100000 }], '2026-12-01', { '2026-09-10': 1, '2026-10-01': 9 });
  assert.equal(dias.corrigido, 101000);
  assert.deepEqual(dias.falta, ['2026-10-10']);
  assert.equal(P.corrigirPelaPoupanca([], '2026-12-01', TAXA_FIXA).percentual, 0);
});

test('poupança: taxas do Banco Central (série diária 195), guardadas na sessão', async () => {
  const pedidos = [];
  const falso = async (url) => {
    pedidos.push(url);
    return { ok: true, json: async () => [{ data: '10/09/2026', dataFim: '10/10/2026', valor: '0.6500' }, { data: '10/10/2026', dataFim: '10/11/2026', valor: '0.5936' }] };
  };
  const r = await P.poupancaDaGarantia([{ data: '2026-09-10', valor: 100000 }], '2026-11-13', falso);
  assert.match(pedidos[0], /bcdata\.sgs\.195\/dados\?formato=json&dataInicial=10\/09\/2026&dataFinal=13\/11\/2026$/);
  assert.equal(r.corrigido, Math.round(100000 * 1.0065 * 1.005936));
  await P.poupancaDaGarantia([{ data: '2026-10-10', valor: 100000 }], '2026-11-13', falso);
  assert.equal(pedidos.length, 1, 'período já trazido: não pergunta de novo');
  await assert.rejects(P.taxasPoupanca('2020-01-01', '2020-02-01', async () => ({ ok: false })), /Banco Central/);
});

test('depósitos da garantia um a um: caução paga, complemento do reajuste e herdada na troca de titular', () => {
  const { d, c } = base();
  assert.deepEqual(R.movimentosGarantia(d, { garantia_tipo: 'Fiador' }), []);
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2025-01-10', valor: 360000, arquivo: 'cau.pdf' }, 'j');
  assert.deepEqual(R.movimentosGarantia(d, c), [{ data: '2025-01-10', valor: 360000 }]);
  // complemento de R$ 200,00 pago em 15/01/2026 (correção da caução para R$ 3.800,00)
  R.inserir(d, 'correcoes_garantia', { contrato_id: c.id, data: '2026-01-15', valor_anterior: 360000, valor_novo: 380000, complemento: 20000 }, 'j');
  assert.deepEqual(R.movimentosGarantia(d, c), [{ data: '2025-01-10', valor: 360000 }, { data: '2026-01-15', valor: 20000 }]);
  assert.equal(R.movimentosGarantia(d, c).reduce((s, x) => s + x.valor, 0), R.valorGarantia(d, c));
  // troca de titular em 01/12/2026, a mesma garantia: antes do termo assinado, a garantia está no contrato de quem sai
  const n = R.inserir(d, 'contratos', { imovel_id: c.imovel_id, contrato_anterior_id: c.id, inquilino_nome: 'Maria Lima', inquilino_cpf: '529.982.247-25', inquilino_genero: 'Feminino',
    data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', vigencia_fim: '2027-07-10', aluguel_inicial: 190000, dia_vencimento: 10, indice_correcao: 'IPCA',
    garantia_tipo: 'Caução', caucao_valor: 360000, caucao_meses: 2, garantia_na_troca: 'continua', finalidade: 'Residencial', descricao_objeto: 'a casa nº 3' }, 'j');
  assert.equal(R.contratoDaGarantiaNaTroca(d, n).id, c.id);
  const corrigida = P.corrigirPelaPoupanca(R.movimentosGarantia(d, R.contratoDaGarantiaNaTroca(d, n)), '2026-12-01', TAXA_FIXA);
  assert.equal(corrigida.corrigido, 431870, 'o que Maria paga a João');
  // termo: o valor com a poupança entra no acerto entre os dois
  const modelo = K.modelosDe(d, 'aditivo_troca')[0];
  const a = R.salvarAditivoTroca(d, n.id, { data: '2026-12-01', texto: modelo.texto, garantia_corrigida: corrigida.corrigido }, 'j');
  assert.equal(a.garantia_corrigida, 431870);
  assert.equal(a.garantia_depositada, 380000);
  const t = texto(K.montarContrato(a.texto, K.dadosDoAditivo(d, n, a)));
  assert.match(t, /nada ter a reclamar da LOCADORA a esse respeito\. Para esse acerto, o valor depositado, de R\$ 3\.800,00 \([^)]*\), com os rendimentos da caderneta de poupança até 30 de novembro de 2026, soma R\$ 4\.318,70 \([^)]*\), que o LOCATÁRIO ENTRANTE paga diretamente ao LOCATÁRIO SAINTE; os rendimentos já creditados e os futuros passam a pertencer ao LOCATÁRIO ENTRANTE/);
  assert.doesNotMatch(t, /\[\w+\?\]/, 'nenhum campo desconhecido');
  // sem o valor, o termo sai como antes
  const semValor = texto(K.montarContrato(a.texto, K.dadosDoAditivo(d, n, { ...a, garantia_corrigida: null })));
  assert.match(semValor, /a esse respeito\.\n/);
  assert.doesNotMatch(semValor, /Para esse acerto/);
  // termo assinado: a garantia passa ao novo; a caução depositada continua R$ 3.800,00 e a poupança conta desde os depósitos de João
  R.assinarAditivo(d, a.id, { data: '2026-12-01', arquivo: 'termo.pdf' }, 'j');
  R.transferirHeranca(d, n.id, 'j', '2026-12-01');
  const novo = R.buscar(d, 'contratos', n.id);
  assert.equal(R.garantiaHerdada(d, novo), true);
  assert.equal(R.contratoDaGarantiaNaTroca(d, novo).id, novo.id);
  assert.equal(R.valorGarantia(d, novo), 380000, 'o rendimento não entra na caução depositada: o complemento segue a regra do contrato');
  assert.deepEqual(R.movimentosGarantia(d, novo), [{ data: '2025-01-10', valor: 360000 }, { data: '2026-01-15', valor: 20000 }]);
});

test('termo da troca com garantia nova: valor devolvido a quem sai com a poupança; modelos já gravados ganham o texto', () => {
  const { d, c } = base();
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2025-01-10', valor: 360000, arquivo: 'cau.pdf' }, 'j');
  const n = R.inserir(d, 'contratos', { imovel_id: c.imovel_id, contrato_anterior_id: c.id, inquilino_nome: 'Maria Lima', inquilino_cpf: '529.982.247-25', inquilino_genero: 'Feminino',
    data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', vigencia_fim: '2027-07-10', aluguel_inicial: 190000, dia_vencimento: 10, indice_correcao: 'IPCA',
    garantia_tipo: 'Caução', caucao_valor: 380000, caucao_meses: 2, garantia_na_troca: 'nova', finalidade: 'Residencial', descricao_objeto: 'a casa nº 3' }, 'j');
  assert.equal(R.contratoDaGarantiaNaTroca(d, n).id, c.id);
  const modelo = K.modelosDe(d, 'aditivo_troca')[0];
  const a = R.salvarAditivoTroca(d, n.id, { data: '2026-12-01', texto: modelo.texto, garantia_corrigida: 410637 }, 'j');
  const t = texto(K.montarContrato(a.texto, K.dadosDoAditivo(d, n, a)));
  assert.match(t, /será devolvida ao LOCATÁRIO SAINTE, com a correção prevista no contrato \(com os rendimentos da caderneta de poupança até 30 de novembro de 2026, R\$ 4\.106,37 \([^)]*\)\), descontados os débitos/);
  assert.match(t, /O LOCATÁRIO ENTRANTE presta, como garantia da locação, caução em dinheiro de R\$ 3\.800,00/);
  // modelo gravado antes desta mudança: o texto antigo exato recebe o trecho novo, uma vez só
  const antigo = modelo.texto.split('[se garantia_corrigida]').map((x, i) => (i ? x.slice(x.indexOf('[fim]') + 5) : x)).join('');
  assert.doesNotMatch(antigo, /garantia_corrigida/);
  const atualizado = atualizarTextoModelo(antigo);
  assert.equal(atualizado, modelo.texto.replace(/\r\n/g, '\n'));
  assert.equal(atualizarTextoModelo(atualizado), atualizado);
});

test('decisão da direção: caução nunca passa adiante; na troca de garantia, volta ao inquilino com a poupança', () => {
  const { d, c } = base();
  assert.equal(R.garantiaDevolvidaNaTroca(c), true, 'caução: na troca de titular é sempre devolvida');
  assert.equal(R.garantiaDevolvidaNaTroca({ garantia_tipo: 'Fiador' }), false, 'fiança: continua podendo passar');
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2025-01-10', valor: 360000, arquivo: 'cau.pdf' }, 'j');
  R.inserir(d, 'correcoes_garantia', { contrato_id: c.id, data: '2026-01-15', valor_anterior: 360000, valor_novo: 380000, complemento: 20000 }, 'j');
  // caução → fiador em 01/12/2026: a troca guarda os depósitos da caução que sai
  const t = R.trocarGarantia(d, c.id, { data: '2026-12-01', garantia_tipo: 'Fiador' }, 'j', { novos: [{ nome: 'Ana Lima', cpf: '529.982.247-25' }] });
  assert.equal(t.valor_anterior, 380000);
  assert.deepEqual(t.devolucao_movimentos, [{ data: '2025-01-10', valor: 360000 }, { data: '2026-01-15', valor: 20000 }]);
  assert.deepEqual(R.devolucoesDeTrocaPendentes(d, c).map((x) => x.valor), [380000]);
  assert.match(R.alertaDevolucaoGarantia(d, c, '2026-12-02').texto, /Garantia trocada em 01\/12\/2026 \(Caução → Fiador\): devolva R\$ 3\.800,00 a João Souza, com a correção da poupança/);
  // devolução com a poupança (0,60% ao mês: R$ 3.800,00 → R$ 4.318,70)
  const r = P.corrigirPelaPoupanca(t.devolucao_movimentos, '2026-12-01', TAXA_FIXA);
  const dev = R.salvarDevolucaoGarantia(d, c.id, { data: '2026-12-01', garantia_valor: 380000, indice_percentual: r.percentual, debitos: 0, troca_id: t.id }, 'j');
  assert.equal(dev.troca_id, t.id);
  assert.equal(dev.saldo, 431870);
  assert.equal(R.devolucaoDaTrocaDeGarantia(d, t.id).id, dev.id);
  assert.deepEqual(R.devolucoesDeTrocaPendentes(d, c), []);
  assert.deepEqual(R.devolucoesDaTrocaDeTitular(d, c.id), [], 'não se confunde com a devolução da troca de titular');
  assert.match(R.alertaDevolucaoGarantia(d, c, '2026-12-02').texto, /Anexe o comprovante: devolução da garantia/);
  assert.throws(() => R.salvarDevolucaoGarantia(d, c.id, { data: '2026-12-02', garantia_valor: 380000, troca_id: t.id }, 'j'), /já foi registrada/);
  // editar mantém a ligação com a troca; cancelar a troca pede excluir a devolução antes
  assert.equal(R.salvarDevolucaoGarantia(d, c.id, { data: '2026-12-03', garantia_valor: 380000, indice_percentual: 0, debitos: 0 }, 'j', dev.id).troca_id, t.id);
  assert.throws(() => R.cancelarTrocaGarantia(d, t.id, 'j'), /exclua a devolução antes/);
  R.excluir(d, 'devolucoes_garantia', dev.id, 'j', 'teste');
  R.cancelarTrocaGarantia(d, t.id, 'j');
  assert.equal(R.valorGarantia(d, R.buscar(d, 'contratos', c.id)), 380000, 'a caução volta como estava');
  // troca só de fiador (sem dinheiro saindo): nada a devolver
  R.trocarGarantia(d, c.id, { data: '2026-12-05', garantia_tipo: 'Fiador' }, 'j', { novos: [{ nome: 'Ana Lima', cpf: '529.982.247-25' }] });
  const t3 = R.trocarGarantia(d, c.id, { data: '2026-12-10', garantia_tipo: 'Fiador' }, 'j', { novos: [{ nome: 'Rui Prado', cpf: '529.982.247-25' }] });
  assert.equal(t3.devolucao_movimentos, undefined);
  assert.deepEqual(R.devolucoesDeTrocaPendentes(d, c).map((x) => x.troca.data), ['2026-12-05'], 'só a troca em que saiu a caução');
});

test('garantias por empresa corrigidas pela poupança: proporção do aplicado, mês incompleto não rende', async () => {
  const taxas = {};
  for (let x = '2025-01-01'; x <= '2026-12-31'; x = new Date(Date.parse(`${x}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) taxas[x] = 0.6;
  const contrato = { id: 1, inquilino_nome: 'Ana' };
  const movimentos = [{ data: '2025-01-10', valor: 360000 }, { data: '2026-01-15', valor: 20000 }];
  const g = { lugares: [{ chave: 'e:1', itens: [{ contrato, valor: 200000, movimentos }] }], semAplicar: [{ contrato, falta: 180000, movimentos }] };
  const r = P.corrigirGarantiasPorEmpresa(g, '2026-12-01', taxas);
  assert.deepEqual(r.contratos.get(1), { total: 380000, corrigido: 431870 });
  assert.equal(r.lugares[0].corrigido, 227300, 'R$ 2.000,00 × 431.870/380.000');
  assert.equal(r.semAplicar[0], 204570);
  assert.equal(r.aplicado, 227300);
  assert.deepEqual(r.falta, []);
  // em 09/12/2026 o período de 10/11 a 10/12 não fechou: o mesmo valor
  assert.equal(P.corrigirGarantiasPorEmpresa(g, '2026-12-09', taxas).lugares[0].corrigido, 227300);
  // busca as taxas uma vez, desde o depósito mais antigo
  const pedidos = [];
  const buscar = async (url) => { pedidos.push(url); return { ok: true, json: async () => [] }; };
  const s = await P.garantiasCorrigidasHoje(g, '2026-12-01', buscar);
  assert.match(pedidos[0], /dataInicial=10\/01\/2025/);
  assert.ok(s.lugares[0].corrigido >= 200000);
  // dia sem taxa do Banco Central: esse mês fica sem rendimento (e é avisado)
  const sem = P.corrigirGarantiasPorEmpresa(g, '2026-12-01', {});
  assert.equal(sem.lugares[0].corrigido, 200000);
  assert.ok(sem.falta.length > 0);
});
