// Lotes J1 e J2 do mutirão de 19–20/11/2026 (regras de negócio em regras.js). Dados fictícios.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

function base(extra = {}) {
  const d = R.bancoVazio(); R.normalizar(d);
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01', aluguel_inicial: 150000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    garantia_tipo: 'Caução', caucao_valor: 486000, caucao_data: '2026-01-01', ...extra }, 'j');
  return { d, c, casa };
}

test('fios-003: termo de quitação assinado é arquivo referenciado (o × apaga, entra na conferência e no ZIP)', () => {
  const { d, c } = base();
  R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2026-10-20', saldo: 0, termo_assinado: 'comprovante-termo-quitacao-assinado-2026-10-20.pdf' }, 'j');
  assert.ok(R.arquivosReferenciados(d).some((a) => a.escopo === 'contrato' && a.id === c.id && a.nome === 'comprovante-termo-quitacao-assinado-2026-10-20.pdf'));
});

test('fios-007: todo tipo de alerta criado em regras.js está em TIPOS_ALERTA (desligar e configurar funcionam)', () => {
  const fonte = readFileSync(new URL('../docs/js/regras.js', import.meta.url), 'utf8');
  const tipos = new Set();
  for (const m of fonte.matchAll(/nivel: [^,]+, tipo: ([^,]+),/g)) for (const t of m[1].matchAll(/'([^']+)'/g)) tipos.add(t[1]);
  assert.ok(tipos.has('Incluir caução e anexar comprovante'));
  const fora = [...tipos].filter((t) => /^[A-ZÀ-Ú]/.test(t) && !R.TIPOS_ALERTA.includes(t));
  assert.deepEqual(fora, []);
  const { d, c } = base();
  R.desligarAlerta(d, 'Incluir caução e anexar comprovante', { contrato_id: c.id }, 'j');
  assert.equal(d.alertas_desligados.length, 1);
});

test('entrada-016: depósito inicial acima do que falta é recusado (não vira outra caução)', () => {
  const { d, c } = base();
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-01-05', valor: 400000 }, 'j', '2026-11-19');
  assert.throws(() => R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-01-06', valor: 900000 }, 'j', '2026-11-19'),
    /Falta depositar só R\$ 860,00; o depósito de R\$ 9\.000,00 passa disso e a caução ficaria em R\$ 13\.000,00/);
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-01-06', valor: 86000 }, 'j', '2026-11-19');
  assert.equal(R.valorGarantia(d, c), 486000);
});

test('entrada-036: contra-vistoria espera o termo das chaves antes da vigência', () => {
  const { d, c } = base({ data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', assinado_em: '2026-11-15' });
  const etapa = (hoje) => R.rotinaEntrada(d, c, hoje).find((e) => e.chave === 'contra_vistoria');
  assert.match(etapa('2026-11-19').texto, /aguarda a entrega das chaves/);
  assert.equal(R.termoDasChavesEm(c), null);
  c.doc_chaves_em = '2026-12-05';
  assert.equal(R.termoDasChavesEm(c), '2026-12-05');
  assert.equal(R.dataDasChaves(c), '2026-12-05');
  assert.match(etapa('2026-12-07').texto, /até 11\/12\/2026 \(5 dias úteis da entrega das chaves\)/);
});

test('mensal-031: NF já emitida com data no futuro é recusada (erro de usuário)', () => {
  const { d } = base();
  assert.throws(() => R.registrarNfExterna(d, 'cobranca', 1, 157, '2027-12-31', 'j', '2026-11-20'), (e) => e.name === 'ErroUsuario' || /depois de hoje/.test(e.message));
  assert.throws(() => R.registrarNfExterna(d, 'cobranca', 1, 157, '2027-12-31', 'j', '2026-11-20'), /depois de hoje/);
});

test('saida-006: desfazer a saída limpa a vistoria marcada e o termo das chaves; vistoria feita pede para excluir antes', () => {
  const { d, c } = base();
  R.informarSaida(d, c.id, '2026-12-15', 'j', '2026-11-20');
  R.marcarVistoriaSaida(d, c.id, '2026-12-16', '10:00', 'j', '2026-11-20');
  R.atualizar(d, 'contratos', c.id, { termo_chaves_saida: 'termo-devolucao-chaves-2026-12-15.pdf' }, 'j', 'teste');
  R.desfazerSaida(d, c.id, 'j');
  const x = R.buscar(d, 'contratos', c.id);
  assert.deepEqual([x.data_saida, x.vistoria_saida_data, x.vistoria_saida_hora, x.termo_chaves_saida], [null, null, null, null]);
  R.informarSaida(d, c.id, '2026-10-21', 'j', '2026-11-20');
  R.inserir(d, 'vistorias', { contrato_id: c.id, imovel_id: c.imovel_id, tipo: 'Saída', data: '2026-10-21' }, 'j');
  assert.throws(() => R.desfazerSaida(d, c.id, 'j'), /Exclua antes a vistoria de saída de 21\/10\/2026/);
});

test('saida-007: saída desfeita depois do boleto proporcional pago avisa os dias que faltam', () => {
  const { d, c } = base({ caucao_valor: 0, garantia_tipo: 'Fiador' });
  R.informarSaida(d, c.id, '2026-10-15', 'j', '2026-10-01');
  R.gerarCobrancas(d, '2026-10', 'j');
  const cb = R.boletoDoMes(d, c.id, '2026-10');
  assert.ok(cb.dias_cobrados < cb.dias_mes);
  R.registrarPagamento(d, cb.id, '2026-11-10', null, 'j');
  assert.deepEqual(R.pagosComMenosDias(d, R.buscar(d, 'contratos', c.id)), []);
  R.desfazerSaida(d, c.id, 'j');
  const l = R.pagosComMenosDias(d, R.buscar(d, 'contratos', c.id));
  assert.equal(l.length, 1);
  assert.equal(l[0].cobranca.id, cb.id);
  assert.ok(l[0].diferenca > 0);
  assert.ok(R.boletoDoMes(d, c.id, '2026-10').data_pagamento, 'o pago não muda');
});

test('saida-010: cancelar a troca de garantia com depósito da garantia nova é recusado', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'Rui Prado', cpf: '529.982.247-25' }, 'j');
  const t = R.trocarGarantia(d, c.id, { data: '2026-11-01', garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2026-11-01' }, 'j', {});
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-11-03', valor: 300000, arquivo: 'cau.pdf' }, 'j', '2026-11-20');
  assert.throws(() => R.cancelarTrocaGarantia(d, t.id, 'j'), /um depósito \(R\$ 3\.000,00 em 03\/11\/2026\): exclua o depósito antes/);
});

test('saida-011: aplicação da caução devolvida na troca não conta para a garantia nova', () => {
  const { d, c } = base({ caucao_valor: 270000, comprovante_caucao: 'c.pdf', caucao_pago_em: '2026-01-01' });
  const e = d.emitentes[0] || R.inserir(d, 'emitentes', { nome: 'Empresa Teste', ativo: true }, 'j');
  R.inserir(d, 'aplicacoes', { contrato_id: c.id, emitente_id: e.id, data: '2026-05-01', valor: 270000 }, 'j');
  assert.equal(R.situacaoAplicacao(d, c).soma, 270000);
  const t = R.trocarGarantia(d, c.id, { data: '2026-11-01', garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2026-11-01' }, 'j', {});
  assert.equal(R.aplicacaoBaixada(d, d.aplicacoes[0]), false, 'até a devolução, a antiga ainda está com a empresa');
  R.inserir(d, 'devolucoes_garantia', { contrato_id: c.id, troca_id: t.id, data: '2026-11-05', garantia_valor: 270000, saldo: 272700 }, 'j');
  assert.equal(R.aplicacaoBaixada(d, d.aplicacoes[0]), true);
  assert.equal(R.situacaoAplicacao(d, R.buscar(d, 'contratos', c.id)).soma, 0);
});

test('saida-033: caução toda usada no cálculo final (saldo zero) sai das cauções guardadas', () => {
  const { d, c } = base({ caucao_valor: 270000, comprovante_caucao: 'c.pdf', caucao_pago_em: '2026-01-01' });
  const antes = R.garantiasPorEmpresa(d);
  assert.ok(antes.semAplicar.some((x) => x.contrato.id === c.id));
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-10-31' }, 'j', 'teste');
  R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2026-10-31', garantia_valor: 270000, debitos: 270000, saldo: 0 }, 'j');
  const depois = R.garantiasPorEmpresa(d);
  assert.ok(!depois.semAplicar.some((x) => x.contrato.id === c.id));
});

test('financeiro-banco-001: 12 meses de data a data contam 12 (retorno de 12,00%, não 11,08%)', () => {
  assert.equal(R.mesesDoPeriodo('2025-11-20', '2026-11-19'), 12);
  assert.equal(R.mesesDoPeriodo('2026-11-01', '2026-11-30'), 1);
  assert.equal(R.mesesDoPeriodo('2026-01-01', '2026-12-31'), 12);
  assert.equal(R.mesesDoPeriodo('2026-11-01', '2026-11-15'), 0.5);
});

test('admin-003: adiar de novo um alerta já adiado devolve o registro com a data', () => {
  const { d } = base();
  const a = R.adiarAlerta(d, 'Fiador|c1', 'adiado', 'j', { hoje: '2026-11-19' });
  assert.equal(a.ate, '2026-11-25');
  const b = R.adiarAlerta(d, 'Fiador|c1', 'adiado', 'j', { hoje: '2026-11-20' });
  assert.equal(b.ate, '2026-11-26');
  assert.equal(d.adiamentos_alerta.length, 1);
});

test('saida-039: com data de saída informada não há complemento da caução (decisão do dono, 20/11/2026)', () => {
  const { d, c } = base({ aluguel_inicial: 200000, caucao_valor: 540000, caucao_meses: 3, comprovante_caucao: 'c.pdf', data_entrada: '2025-03-01', vigencia_inicio: '2025-03-01', caucao_data: '2025-03-01' });
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-03-01', indice: 'IGP-M', percentual: 5, valor_anterior: 200000, valor_novo: 210000 }, 'j');
  assert.ok(R.complementoCaucao(d, c).complemento > 0);
  c.data_saida = '2026-11-30';
  assert.equal(R.complementoCaucao(d, c), null);
  assert.ok(!R.alertasContrato(d, c, '2026-11-20').some((a) => a.tipo === 'Correção da caução'));
});

test('saida-022: retirar uma de duas multas com o mesmo texto deixa a descrição da outra', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  const cb = R.boletoDoMes(d, c.id, '2026-11');
  const n1 = R.inserir(d, 'notificacoes', { contrato_id: c.id, data: '2026-10-01', situacao: 'Multa gerada', multa_valor: 100000, multa_data: '2026-11-20', multa_cobranca_id: null }, 'j');
  const n2 = R.inserir(d, 'notificacoes', { contrato_id: c.id, data: '2026-10-01', situacao: 'Multa gerada', multa_valor: 50000, multa_data: '2026-11-20', multa_cobranca_id: null }, 'j');
  R.sincronizarMultas(d, c.id, 'j');
  assert.equal(R.buscar(d, 'cobrancas', cb.id).outros, 150000);
  R.retirarMultaNotificacao(d, n1.id, 'j');
  const x = R.buscar(d, 'cobrancas', cb.id);
  assert.equal(x.outros, 50000);
  assert.equal(x.outros_descricao, 'Multa por descumprimento da notificação de 01/10/2026');
  assert.ok(n2);
});

test('comunicacoes-033: a busca acha o interessado de uma ficha', () => {
  const { d } = base();
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Carlos Teste', inquilino_cpf: '529.982.247-25', situacao: 'Em análise', data_recebida: '2026-11-10' }, 'j');
  const g = R.buscarGlobal(d, 'Carlos').find((x) => x.tipo === 'Fichas em análise');
  assert.equal(g.itens[0].link, `#/ficha/${f.id}`);
});

test('financeiro-banco-019: guia já paga não perde a data ao apagar o valor', () => {
  const { d } = base();
  const e = d.emitentes[0] || R.inserir(d, 'emitentes', { nome: 'Empresa Teste', ativo: true }, 'j');
  R.salvarGuiaImposto(d, e.id, 'PIS/COFINS', '2026-10', 36500, 'j');
  const g = d.guias_impostos[0];
  R.atualizar(d, 'guias_impostos', g.id, { paga_em: '2026-11-25' }, 'j', 'teste');
  assert.throws(() => R.salvarGuiaImposto(d, e.id, 'PIS/COFINS', '2026-10', null, 'j'), /já está paga \(25\/11\/2026\)/);
  assert.equal(d.guias_impostos.length, 1);
});

test('saida-023: depois da saída, o aviso do comprovante do saldo continua até anexar', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-14', ativo: false }, 'j', 'teste');
  const e = R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2026-11-14', garantia_valor: 0, debitos: 0, saldo: 141856, garantia_devolvida_em: '2026-11-18' }, 'j');
  const a = R.todosAlertas(d, '2026-11-20').filter((x) => x.contrato_id === c.id);
  assert.ok(a.some((x) => x.tipo === 'Comprovante a buscar no banco' && /saldo da saída/.test(x.texto)), JSON.stringify(a));
  assert.ok(R.alertasDoInquilino(d, R.buscar(d, 'contratos', c.id), '2026-11-20').length);
  R.atualizar(d, 'encerramentos', e.id, { comprovante: 'comprovante-devolucao-saldo-2026-11-18.pdf' }, 'j', 'teste');
  assert.ok(!R.todosAlertas(d, '2026-11-20').some((x) => x.contrato_id === c.id && x.tipo === 'Comprovante a buscar no banco'));
});
