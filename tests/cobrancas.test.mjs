import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as R from '../docs/js/regras.js';

// Correções da revisão de 09/11/2026 nos boletos (reserva, saída, dia útil, acordo, IPTU). Dados fictícios.
function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const jck = R.inserir(d, 'emitentes', { nome: 'JCK', razao_social: 'JCK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', complemento: '', cidade: 'Curitiba' }, 'julio');
  for (const e of [ank, jck]) R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: e.id, percentual: 50 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07', aluguel_inicial: 135000,
    dia_vencimento: 10, cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 10, taxa_boleto: 350,
    multa_percentual: 10, juros_mensal_percentual: 1, cobrar_iptu: true, reserva_valor: 50000, ...extra }, 'julio');
  R.inserir(d, 'iptus', { imovel_id: loja.id, ano: 2026, valor_total: 100000, num_parcelas: 10, primeira_competencia: '2026-02' }, 'julio');
  return { d, loja, c };
}
const doMes = (d, c, comp) => R.boletoDoMes(d, c.id, comp);

test('reserva sem mês marcado e carência: vai para o 1º aluguel depois da carência', () => {
  // entrada 07/06/2026, 1 mês de carência (junho), reserva de R$ 500,00 sem mês marcado ("usa no primeiro aluguel")
  const { d, c } = base({ carencia_meses: 1 });
  assert.equal(R.competenciaReserva(c), '2026-07');
  for (const comp of ['2026-06', '2026-07', '2026-08']) R.gerarCobrancas(d, comp, 'julio');
  const [jun, jul, ago] = ['2026-06', '2026-07', '2026-08'].map((m) => doMes(d, c, m));
  assert.deepEqual([jun.situacao, jun.carencia, jun.aluguel, jun.reserva_utilizada], ['Carência', true, 0, 0]);
  assert.equal(jul.reserva_utilizada, 50000, 'julho, o 1º aluguel, usa a reserva');
  assert.equal(R.totais(jul).a_pagar_pontual, 131850 - 50000);
  assert.equal(ago.reserva_utilizada, 0);
  assert.equal(R.saldoReserva(d, c), 0);
  // gerado fora de ordem (julho antes de junho): o resultado é o mesmo
  const b = base({ carencia_meses: 1 });
  for (const comp of ['2026-08', '2026-07', '2026-06']) R.gerarCobrancas(b.d, comp, 'julio');
  assert.deepEqual(['2026-06', '2026-07', '2026-08'].map((m) => doMes(b.d, b.c, m).reserva_utilizada), [0, 50000, 0]);
});

test('carência que cobra IPTU: o boleto da carência é cobrado e a reserva fica para o 1º aluguel', () => {
  const { d, c } = base({ carencia_meses: 1, carencia_cobrar_iptu: true });
  for (const comp of ['2026-06', '2026-07']) R.gerarCobrancas(d, comp, 'julio');
  const [jun, jul] = ['2026-06', '2026-07'].map((m) => doMes(d, c, m));
  assert.deepEqual([jun.situacao, jun.iptu, jun.reserva_utilizada, R.aCobrar(jun)], ['Em aberto', 8000, 0, true], 'IPTU de 24/30 dias cobrado');
  assert.equal(R.totais(jun).a_pagar_pontual, 8000);
  assert.equal(jul.reserva_utilizada, 50000);
  // o recálculo não muda nada
  R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'julio');
  assert.deepEqual([jun.situacao, jun.reserva_utilizada, jul.reserva_utilizada], ['Em aberto', 0, 50000]);
});

test('reserva com mês marcado: continua começando exatamente nele, com ou sem carência', () => {
  const { d, c } = base({ carencia_meses: 1, reserva_competencia: '2026-08' });
  assert.equal(R.competenciaReserva(c), '2026-08');
  for (const comp of ['2026-06', '2026-07', '2026-08']) R.gerarCobrancas(d, comp, 'julio');
  assert.deepEqual(['2026-06', '2026-07', '2026-08'].map((m) => doMes(d, c, m).reserva_utilizada), [0, 0, 50000]);
  // sem carência e sem mês marcado: o mês de entrada, como antes
  const b = base();
  assert.equal(R.competenciaReserva(b.c), '2026-06');
});

test('reserva calculada num lugar só: conta o FCI e o ressarcimento do boleto, e some quando o contrato deixa de ter reserva', () => {
  // reserva de R$ 3.000,00, maior que o boleto: o boleto de junho fica zerado contando o FCI (fora da conta antiga do boleto)
  const { d, c } = base({ reserva_valor: 300000, fci_percentual: 5, cobrar_iptu: false, taxa_boleto: 0 });
  R.gerarCobrancas(d, '2026-06', 'julio');
  const jun = doMes(d, c, '2026-06');
  assert.ok(jun.fci > 0);
  assert.equal(R.totais(jun).a_pagar_pontual, 0, 'a reserva cobre o aluguel e o FCI');
  assert.equal(jun.reserva_utilizada, R.totais({ ...jun, reserva_utilizada: 0 }).total_pontual);
  R.gerarCobrancas(d, '2026-07', 'julio');
  const jul = doMes(d, c, '2026-07');
  assert.equal(jul.reserva_utilizada, R.totais({ ...jul, reserva_utilizada: 0 }).total_pontual, 'o que sobra vai para julho (cobre o boleto)');
  assert.equal(R.saldoReserva(d, c), 300000 - jun.reserva_utilizada - jul.reserva_utilizada);
  // tira a reserva do contrato: o recálculo tira dos boletos em aberto
  R.atualizar(d, 'contratos', c.id, { reserva_valor: 0 }, 'julio');
  assert.equal(R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'julio'), 2, 'cada boleto conta uma vez');
  assert.deepEqual(d.cobrancas.map((x) => x.reserva_utilizada), [0, 0]);
});

test('saída: boleto em aberto de mês sem nenhum dia ocupado é excluído no recálculo (com histórico)', () => {
  const { d, c } = base({ data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', reserva_valor: 0, cobrar_iptu: false });
  R.gerarCobrancas(d, '2026-11', 'julio');
  R.gerarCobrancas(d, '2026-12', 'julio'); // dezembro gerado adiantado
  R.informarSaida(d, c.id, '2026-11-15', 'julio', '2026-11-09');
  R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'julio'); // o que a tela faz depois de mudar o contrato
  const nov = doMes(d, c, '2026-11');
  assert.deepEqual([nov.dias_cobrados, nov.aluguel], [15, 67500], 'novembro proporcional, 01 a 15/11');
  assert.equal(doMes(d, c, '2026-12'), null, 'dezembro excluído');
  assert.ok(d.historico.some((h) => h.acao === 'Exclusão' && h.tabela === 'cobrancas' && /12\/2026.*nenhum dia ocupado/.test(h.descricao)));
  assert.deepEqual(R.boletosParaEmitir(d, '2026-12'), []);
  assert.equal(R.etapasFechamento(d, '2027-01', '2027-01-20').find((e) => e.chave === 'pagamentos').pendentes, 0);
});

test('saída: boleto de mês sem dia ocupado já emitido no C6 fica, com alerta para cancelar no banco', () => {
  const { d, c } = base({ data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', reserva_valor: 0, cobrar_iptu: false });
  R.gerarCobrancas(d, '2026-11', 'julio');
  R.gerarCobrancas(d, '2026-12', 'julio');
  const dez = doMes(d, c, '2026-12');
  R.atualizar(d, 'cobrancas', dez.id, { banco: { situacao: 'emitido', valor: R.totais(dez).a_pagar_sem_desconto, vencimento: dez.vencimento } }, 'julio');
  R.informarSaida(d, c.id, '2026-11-15', 'julio', '2026-11-09');
  R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'julio');
  assert.equal(doMes(d, c, '2026-12'), dez, 'emitido no banco: não exclui');
  assert.equal(dez.aluguel, 135000, 'continua como o banco cobra');
  const a = R.todosAlertas(d, '2026-11-09').find((x) => x.link === `#/cobranca/${dez.id}`);
  assert.ok(a, 'alerta do boleto');
  assert.equal(a.tipo, 'Banco');
  assert.match(a.texto, /12\/2026.*emitido no C6.*nenhum dia ocupado.*saída em 15\/11\/2026.*cancele no banco/);
  // cancelado no banco: o próximo recálculo exclui
  R.atualizar(d, 'cobrancas', dez.id, { banco: { ...dez.banco, situacao: 'cancelado' } }, 'julio');
  R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'julio');
  assert.equal(doMes(d, c, '2026-12'), null);
  assert.ok(!R.todosAlertas(d, '2026-11-09').some((x) => x.link === `#/cobranca/${dez.id}`));
});

test('saída: boleto alterado à mão em mês sem dia ocupado não é excluído sozinho, mas aparece nos alertas', () => {
  const { d, c } = base({ data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', reserva_valor: 0, cobrar_iptu: false });
  R.gerarCobrancas(d, '2026-12', 'julio');
  const dez = doMes(d, c, '2026-12');
  R.atualizar(d, 'cobrancas', dez.id, { outros: 5000, editado_manual: true }, 'julio');
  R.informarSaida(d, c.id, '2026-11-15', 'julio', '2026-11-09');
  R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'julio');
  assert.equal(doMes(d, c, '2026-12'), dez);
  const a = R.todosAlertas(d, '2026-11-09').find((x) => x.link === `#/cobranca/${dez.id}`);
  assert.match(a.texto, /12\/2026.*alterado à mão.*nenhum dia ocupado/);
});

test('saída: mudar a data para mais tarde reativa o inquilino e o boleto do mês novo sai', () => {
  const { d, c } = base({ data_entrada: '2026-01-10', vigencia_inicio: '2026-01-10', reserva_valor: 0, cobrar_iptu: false });
  for (const m of ['2026-09', '2026-10']) R.gerarCobrancas(d, m, 'julio');
  R.informarSaida(d, c.id, '2026-10-15', 'julio', '2026-11-09');
  assert.equal(c.ativo, false, 'saiu em 15/10, boleto de outubro existe: inativo');
  // o inquilino avisa que fica até 15/11
  R.informarSaida(d, c.id, '2026-11-15', 'julio', '2026-11-09');
  R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'julio');
  assert.equal(c.ativo, true);
  assert.equal(R.contratoAtivo(c, '2026-11-09'), true);
  assert.equal(doMes(d, c, '2026-10').dias_cobrados, 31);
  assert.deepEqual(R.gerarCobrancas(d, '2026-11', 'julio'), { geradas: 1, existentes: 0 });
  assert.equal(doMes(d, c, '2026-11').dias_cobrados, 15);
  // data mais tarde, mas ainda no passado e com o boleto do mês: continua inativo (sem gravar duas vezes)
  const b = base({ data_entrada: '2026-01-10', vigencia_inicio: '2026-01-10', reserva_valor: 0, cobrar_iptu: false });
  for (const m of ['2026-08', '2026-09']) R.gerarCobrancas(b.d, m, 'julio');
  R.informarSaida(b.d, b.c.id, '2026-09-10', 'julio', '2026-11-09');
  assert.equal(b.c.ativo, false);
  const n = b.d.historico.length;
  R.informarSaida(b.d, b.c.id, '2026-09-20', 'julio', '2026-11-09');
  assert.equal(b.c.ativo, false);
  assert.equal(b.d.historico.length, n + 1, 'só a nova data');
  // data mais tarde no passado, sem o boleto do mês novo: volta a ativo para o boleto proporcional sair
  R.informarSaida(b.d, b.c.id, '2026-10-20', 'julio', '2026-11-09');
  assert.equal(b.c.ativo, true);
  R.gerarCobrancas(b.d, '2026-10', 'julio');
  assert.equal(doMes(b.d, b.c, '2026-10').dias_cobrados, 20);
});

test('dias úteis: sábado, domingo e feriado nacional; o prazo do boleto passa ao próximo dia útil', () => {
  assert.deepEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].map(C.diaUtil), [true, false, false, false, true], '12/10 é feriado');
  assert.equal(C.limitePagamento('2026-10-10'), '2026-10-13', 'sábado → terça (segunda é feriado)');
  assert.equal(C.limitePagamento('2026-08-10'), '2026-08-10', 'segunda-feira: o próprio dia');
  assert.equal(C.limitePagamento('2027-02-08'), '2027-02-10', 'segunda e terça de Carnaval');
  assert.equal(C.diaUtilAteh('2026-10-31'), '2026-10-30', 'os impostos antecipam, como antes');
  assert.deepEqual([C.vencido('2026-10-10', '2026-10-13'), C.vencido('2026-10-10', '2026-10-14'), C.vencido('2026-08-10', '2026-08-11')], [false, true, true]);
  assert.equal(R.vencimentoGuia(false, '2026-T3'), '2026-10-30');
});

test('vencimento no sábado: pago até o 1º dia útil é em dia; depois, o atraso conta desde o vencimento', () => {
  // aluguel de 09/2026 vence no sábado 10/10/2026; segunda 12/10 é feriado: pode pagar sem multa até terça 13/10
  const { d, c } = base({ data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', reserva_valor: 0, cobrar_iptu: false });
  R.gerarCobrancas(d, '2026-09', 'julio');
  const cb = doMes(d, c, '2026-09');
  assert.equal(cb.vencimento, '2026-10-10');
  const terca = R.previstoNoPagamento(cb, '2026-10-13');
  assert.deepEqual([terca.dias_atraso, terca.multa, terca.juros, terca.valor_devido, terca.valor_nf, terca.pontual], [0, 0, 0, 121850, 121500, true], 'em dia, com a bonificação');
  const quarta = R.previstoNoPagamento(cb, '2026-10-14');
  assert.deepEqual([quarta.dias_atraso, quarta.multa, quarta.juros, quarta.valor_devido], [4, 13535, 180, 135350 + 13535 + 180], '4 dias desde 10/10');
  // inadimplência, lembrete, acordo e fechamento seguem o mesmo prazo
  for (const dia of ['2026-10-11', '2026-10-12', '2026-10-13']) assert.equal(R.inadimplencia(d, dia).devedores.length, 0, dia);
  assert.equal(R.inadimplencia(d, '2026-10-14').devedores[0].diasMax, 4);
  assert.equal(R.textoLembrete(d, cb, '2026-10-11').fase, 'antes');
  assert.match(R.textoLembrete(d, cb, '2026-10-11').texto, /venceu em 10\/10\/2026, que não é dia útil: pode ser pago sem multa até 13\/10\/2026, no valor de R\$ 1\.218,50/);
  assert.match(R.textoLembrete(d, cb, '2026-10-01').texto, /vence em 10\/10\/2026, que não é dia útil: pode ser pago sem multa até 13\/10\/2026.*\nDepois de 13\/10\/2026: R\$ 1\.353,50/);
  assert.equal(R.textoLembrete(d, cb, '2026-10-13').fase, 'dia');
  assert.match(R.textoLembrete(d, cb, '2026-10-13').texto, /pode ser pago sem multa até hoje, 13\/10\/2026/);
  assert.match(R.textoLembrete(d, cb, '2026-10-14').texto, /\(4 dia\(s\) de atraso\)/);
  assert.throws(() => R.previaAcordo(d, { contrato_id: c.id, ids: [cb.id], total: 130000, parcelas: 1, primeiro_vencimento: '2026-10-20' }, '2026-10-13'), /não está vencido/);
  assert.equal(R.etapasFechamento(d, '2026-10', '2026-10-13').find((e) => e.chave === 'pagamentos').detalhe, '1 em aberto');
  assert.equal(R.etapasFechamento(d, '2026-10', '2026-10-14').find((e) => e.chave === 'pagamentos').detalhe, '1 em aberto, 1 vencido(s)');
  // confirmado na terça: pago em dia, NF com a bonificação
  R.registrarPagamento(d, cb.id, '2026-10-13', null, 'julio');
  assert.deepEqual([cb.situacao, cb.dias_atraso, cb.valor_pago, cb.valor_nf], ['Paga em dia', 0, 121850, 121500]);
});
