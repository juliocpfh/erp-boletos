import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as Z from '../docs/js/conciliacao.js';
import * as R from '../docs/js/regras.js';

// Mutirão de correções de 15/11/2026 (regras, cálculos e conciliação). Dados fictícios.
function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com',
    data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', aluguel_inicial: 40000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    taxa_boleto: 0, multa_percentual: 10, juros_mensal_percentual: 1, ...extra }, 'julio');
  return { d, loja, c };
}
const erroDoUsuario = (re) => (e) => e instanceof C.ErroUsuario && re.test(e.message);

test('troca de titular à espera do termo: o novo titular não conta como "sem boleto" nem tem boleto previsto no calendário', () => {
  const { d, c } = base();
  const novo = R.inserir(d, 'contratos', { imovel_id: c.imovel_id, inquilino_nome: 'Ana Herdeira', inquilino_cpf: '529.982.247-25', contrato_anterior_id: c.id,
    data_entrada: '2026-10-01', vigencia_inicio: '2026-10-01', aluguel_inicial: 40000, dia_vencimento: 10, cobranca_mes_seguinte: true, ativo: true }, 'julio');
  assert.equal(R.trocaAguardaAditivo(d, novo), true);
  R.gerarCobrancas(d, '2026-10', 'julio');
  assert.ok(R.boletoDoMes(d, c.id, '2026-10') && !R.boletoDoMes(d, novo.id, '2026-10'), 'o boleto sai no contrato anterior');
  const etapa = () => R.etapasFechamento(d, '2026-10', '2026-10-25').find((e) => e.chave === 'boletos');
  assert.equal(etapa().pendentes, 0);
  assert.doesNotMatch(etapa().detalhe, /Ana Herdeira/);
  const boletos = () => R.eventosDoMes(d, '2026-11', '2026-10-25').filter((e) => e.tipo === 'Boleto');
  assert.deepEqual(boletos().map((e) => [e.contrato_id, e.estado]), [[c.id, 'em aberto']], 'só o boleto gerado, nenhum "previsto" do novo titular');
  // termo da troca assinado: o novo titular volta a contar
  R.inserir(d, 'aditivos', { contrato_id: novo.id, data: '2026-10-20', arquivo: 'termo-da-troca.pdf' }, 'julio');
  assert.equal(R.trocaAguardaAditivo(d, novo), false);
  assert.equal(etapa().pendentes, 1);
  assert.match(etapa().detalhe, /sem boleto: Ana Herdeira/);
  assert.ok(boletos().some((e) => e.contrato_id === novo.id && e.estado === 'previsto'));
});

function comAcordo() {
  const b = base();
  const { d, c } = b;
  for (const comp of ['2026-06', '2026-07']) R.gerarCobrancas(d, comp, 'julio');
  R.registrarPagamento(d, R.boletoDoMes(d, c.id, '2026-06').id, '2026-07-10', null, 'julio');
  const julho = R.boletoDoMes(d, c.id, '2026-07');
  R.fazerAcordo(d, { contrato_id: c.id, ids: [julho.id], total: 45000, parcelas: 3, primeiro_vencimento: '2026-12-10' }, 'julio', '2026-09-19');
  assert.equal(julho.situacao, 'Em acordo');
  return { ...b, julho };
}

test('boleto em acordo: não recebe pagamento (à mão nem pelo banco) nem ajuste', () => {
  const { d, julho } = comAcordo();
  const antes = JSON.stringify(julho);
  assert.throws(() => R.registrarPagamento(d, julho.id, '2026-09-20', null, 'julio'), erroDoUsuario(/07\/2026 está em acordo: não recebe pagamento/));
  assert.deepEqual(R.baixarEmLote(d, [julho.id], '2026-09-20', 'julio').pulados, [julho], 'a baixa em lote pula');
  assert.throws(() => Z.confirmarPagamentoPeloBanco(d, julho.id, { amount: '400.00', payment_date: '2026-09-20', credit_date: '2026-09-20' }, 'julio'), erroDoUsuario(/em acordo: não recebe pagamento/));
  assert.throws(() => R.ajustarBoleto(d, julho.id, -5000, 'desconto', 'julio'), erroDoUsuario(/em acordo: não pode ser ajustado/));
  assert.equal(JSON.stringify(julho), antes, 'o boleto em acordo fica como estava');
  // a parcela do acordo continua recebendo pagamento
  const parcela = d.cobrancas.find((cb) => R.ehParcelaAcordo(cb));
  R.registrarPagamento(d, parcela.id, '2026-12-10', null, 'julio');
  assert.equal(parcela.situacao, 'Paga em dia');
});

test('ressarcimento marcado para boleto em acordo: não entra nele, fica à espera de outro mês, com aviso', () => {
  const { d, c, julho } = comAcordo();
  const r = R.inserir(d, 'ressarcimentos', { contrato_id: c.id, competencia_condominio: '2026-08', competencia_abatimento: '2026-07', valor: 5000, descricao: 'Fundo de obras' }, 'julio');
  assert.equal(R.aplicarRessarcimentos(d, c, '2026-07', 'julio'), julho);
  assert.deepEqual([julho.ressarcimento || 0, julho.situacao], [0, 'Em acordo']);
  const aviso = () => R.alertasContrato(d, c, '2026-09-20').find((a) => /está em acordo: não foi abatido/.test(a.texto));
  assert.match(aviso().texto, /Ressarcimento de R\$ 50,00 marcado para o boleto de 07\/2026/);
  // passado para o boleto de outubro (em aberto): abate nele e o aviso some
  R.gerarCobrancas(d, '2026-10', 'julio');
  R.atualizar(d, 'ressarcimentos', r.id, { competencia_abatimento: '2026-10' }, 'julio');
  for (const comp of ['2026-07', '2026-10']) R.aplicarRessarcimentos(d, c, comp, 'julio');
  assert.equal(R.boletoDoMes(d, c.id, '2026-10').ressarcimento, 5000);
  assert.equal(julho.ressarcimento || 0, 0);
  assert.equal(aviso(), undefined);
});

test('reserva acompanha o ajuste e o ressarcimento: R$ 500,00, outubro de R$ 200,00 e novembro com R$ 300,00; ressarcimento de R$ 50,00 em outubro', () => {
  const { d, c } = base({ reserva_valor: 50000, reserva_competencia: '2026-10' });
  for (const comp of ['2026-10', '2026-11']) R.gerarCobrancas(d, comp, 'julio');
  const out = R.boletoDoMes(d, c.id, '2026-10');
  const nov = R.boletoDoMes(d, c.id, '2026-11');
  const reservas = () => [out.reserva_utilizada, nov.reserva_utilizada];
  assert.deepEqual(reservas(), [40000, 10000]);
  // ajuste de -R$ 200,00 em outubro: o boleto passa a R$ 200,00 e o resto da reserva vai para novembro
  R.ajustarBoleto(d, out.id, -20000, 'desconto combinado', 'julio');
  assert.deepEqual(reservas(), [20000, 30000]);
  R.inserir(d, 'ressarcimentos', { contrato_id: c.id, competencia_condominio: '2026-10', competencia_abatimento: '2026-10', valor: 5000, descricao: 'Fundo de obras' }, 'julio');
  R.aplicarRessarcimentos(d, c, '2026-10', 'julio');
  assert.deepEqual(reservas(), [15000, 35000], 'outubro só comporta R$ 150,00; os R$ 50,00 seguem para novembro');
  assert.equal(out.reserva_utilizada + nov.reserva_utilizada, 50000, 'a reserva abatida continua R$ 500,00');
  assert.deepEqual([R.totais(out).a_pagar_pontual, R.saldoReserva(d, c)], [0, 0]);
  // ajuste retirado: volta para outubro
  R.ajustarBoleto(d, out.id, 0, '', 'julio');
  assert.deepEqual(reservas(), [35000, 15000]);
});

test('alerta do seguro do imóvel: contrato sem data de entrada não derruba a ordenação', () => {
  const { d, loja, c } = base();
  R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Sem Data', inquilino_cpf: '529.982.247-25', ativo: true }, 'julio');
  R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Outro Sem Data', inquilino_cpf: '529.982.247-25', data_entrada: null, ativo: true }, 'julio');
  let a;
  assert.doesNotThrow(() => { a = R.alertaSeguroImovel(d, loja, '2026-11-15'); });
  assert.ok(!a || a.contrato_id === c.id, 'vale o contrato com a entrada mais recente (o que tem data)');
  assert.doesNotThrow(() => R.todosAlertas(d, '2026-11-15'));
});

test('NF do Airbnb: ao acertar a NF que já existe, devolve a NF (com o valor novo)', () => {
  const { d } = base();
  const sala = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto 204', endereco: 'Rua Teste, 1' }, 'julio');
  R.lancarGanhoAirbnb(d, sala.id, { data_recebimento: '2026-10-03', competencia: '2026-10', valor: 121000 }, 'julio');
  const nf = R.gerarNfAirbnb(d, '2026-10', 'julio', '2026-11-02');
  R.lancarGanhoAirbnb(d, sala.id, { data_recebimento: '2026-10-27', competencia: '2026-10', valor: 15000 }, 'julio');
  const acertada = R.gerarNfAirbnb(d, '2026-10', 'julio', '2026-11-02');
  assert.ok(acertada && acertada.id === nf.id, 'a mesma NF, não outra');
  assert.deepEqual([acertada.valor, acertada.airbnb_competencia, d.avulsas.length], [136000, '2026-10', 1]);
  assert.equal(acertada, R.nfAirbnbDe(d, '2026-10'));
});

test('parcelas: as primeiras mais caras e a última menor; nunca zero ou negativa quando o total permite; a soma sempre fecha', () => {
  assert.deepEqual(C.parcelas(120005, 10), [12001, 12001, 12001, 12001, 12001, 12001, 12001, 12001, 12001, 11996], 'R$ 1.200,05 em 10: nove de R$ 120,01 e a última de R$ 119,96');
  assert.deepEqual(C.parcelas(120000, 10), Array(10).fill(12000), 'divide certo: todas iguais');
  assert.deepEqual(C.parcelas(100000, 3), [33334, 33334, 33332]);
  assert.deepEqual(C.parcelas(100, 1), [100]);
  assert.deepEqual(C.parcelas(19, 10), [2, 2, 2, 2, 2, 2, 2, 2, 2, 1]);
  // total minúsculo (a última ficaria zerada ou negativa): centavo a centavo nas primeiras
  assert.deepEqual(C.parcelas(11, 10), [2, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(C.parcelas(10, 10), Array(10).fill(1));
  assert.deepEqual(C.parcelas(5, 10), [1, 1, 1, 1, 1, 0, 0, 0, 0, 0], 'menos centavos que parcelas: não há como evitar o zero, mas nunca negativo');
  assert.deepEqual(C.parcelas(0, 3), [0, 0, 0]);
  assert.deepEqual(C.parcelas(100, 0), []);
  for (let total = 1; total <= 3000; total += 7) {
    for (const n of [1, 2, 3, 7, 10, 12, 24]) {
      const l = C.parcelas(total, n);
      assert.equal(l.reduce((s, v) => s + v, 0), total, `soma de ${total} em ${n}`);
      assert.ok(l.every((v) => Number.isInteger(v) && v >= 0), `sem negativa: ${total} em ${n}`);
      if (total >= n) assert.ok(l.every((v) => v > 0), `sem zero: ${total} em ${n}`);
      assert.ok(l.every((v, k) => k === 0 || v <= l[k - 1]), `nunca cresce: ${total} em ${n}`);
    }
  }
  // parte fora da NF do acordo pode ser negativa (NF maior que o pago): a soma fecha
  assert.equal(C.parcelas(-350, 3).reduce((s, v) => s + v, 0), -350);
});

test('parcelamento novo (IPTU de 2027, seguro a partir de 12/2026, acordo): a última menor, e a soma fecha', () => {
  // IPTU 2027 de R$ 1.200,05 em 10 parcelas
  const { d, loja, c } = base({ cobrar_iptu: true });
  const p = R.inserir(d, 'iptus', { imovel_id: loja.id, ano: 2027, valor_total: 120005, num_parcelas: 10, primeiro_vencimento_boleto: '2027-03', vencimento_primeira: '2027-03-10' }, 'julio');
  const valores = R.parcelasIptu(d, p).map((x) => x.valor);
  assert.deepEqual([valores[0], valores[8], valores[9], valores.reduce((s, v) => s + v, 0)], [12001, 12001, 11996, 120005]);
  assert.deepEqual(R.iptuNaCompetencia(p, '2027-02', c), [1, 12001], 'boleto que vence em 03/2027 = aluguel de 02/2027');
  assert.deepEqual(R.iptuNaCompetencia(p, '2027-11', c), [10, 11996]);
  assert.deepEqual([R.iptuNaCompetencia(p, '2027-01', c), R.iptuNaCompetencia(p, '2027-12', c)], [[null, 0], [null, 0]]);
  // quitado à vista, 1/12 por mês: 11 de R$ 100,01 e dezembro de R$ 99,94
  Object.assign(p, { pago_avista: true, cobranca_inquilino: R.COBRANCA_IPTU_QUITADO[1] });
  assert.deepEqual([R.iptuNaCompetencia(p, '2027-01')[1], R.iptuNaCompetencia(p, '2027-11')[1], R.iptuNaCompetencia(p, '2027-12')[1]], [10001, 10001, 9994]);
  assert.equal(R.mapaIptuAvista(d, p).reduce((s, x) => s + x.valor, 0), 120005);
  // seguro de R$ 1.000,00 em 3: 1ª parcela em 12/2026 (novo) e em 11/2026 (já em andamento: diferença na 1ª)
  assert.deepEqual(['2026-12', '2027-01', '2027-02', '2027-03'].map((m) => C.parcelaNaCompetencia(100000, 3, '2026-12', m)[1]), [33334, 33334, 33332, 0]);
  assert.deepEqual(['2026-11', '2026-12', '2027-01', '2027-02'].map((m) => C.parcelaNaCompetencia(100000, 3, '2026-11', m)[1]), [33334, 33333, 33333, 0]);
  // acordo de R$ 1.000,00 em 3
  for (const comp of ['2026-06', '2026-07']) R.gerarCobrancas(d, comp, 'julio');
  const junho = R.boletoDoMes(d, c.id, '2026-06');
  const previa = R.previaAcordo(d, { contrato_id: c.id, ids: [junho.id], total: 100000, parcelas: 3, primeiro_vencimento: '2026-12-10' }, '2026-09-19');
  assert.deepEqual(previa.boletos.map((b) => b.valor), [33334, 33334, 33332]);
});

test('parcelamento em andamento (IPTU 2026 de R$ 1.200,05 em 10, 1ª paga a R$ 119,96): recalculado, as abertas continuam R$ 120,01 e o total R$ 1.200,05', () => {
  const { d, loja, c } = base({ cobrar_iptu: true });
  const p = R.inserir(d, 'iptus', { imovel_id: loja.id, ano: 2026, valor_total: 120005, num_parcelas: 10, primeiro_vencimento_boleto: '2026-08', vencimento_primeira: '2026-08-10' }, 'julio');
  const meses = ['2026-07', '2026-08', '2026-09', '2026-10'];
  for (const comp of meses) R.gerarCobrancas(d, comp, 'julio');
  const iptus = () => meses.map((m) => R.boletoDoMes(d, c.id, m).iptu);
  assert.deepEqual(iptus(), [11996, 12001, 12001, 12001]);
  const julho = R.boletoDoMes(d, c.id, '2026-07');
  R.registrarPagamento(d, julho.id, julho.vencimento, null, 'julio');
  assert.equal(R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'julio'), 0, 'nenhum boleto em aberto muda');
  assert.deepEqual(iptus(), [11996, 12001, 12001, 12001]);
  const valores = R.parcelasIptu(d, p).map((x) => x.valor);
  assert.deepEqual([valores[0], valores[9], valores.reduce((s, v) => s + v, 0)], [11996, 12001, 120005]);
  // os meses que faltam: ao todo o inquilino paga R$ 1.200,05
  for (const comp of ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']) R.gerarCobrancas(d, comp, 'julio');
  assert.equal(d.cobrancas.filter((cb) => cb.contrato_id === c.id).reduce((s, cb) => s + (cb.iptu || 0), 0), 120005);
  // IPTU 1/12 de 2026 (quitado à vista): também a divisão de antes (janeiro com a diferença)
  const q = { ano: 2026, valor_total: 100000, pago_avista: true, cobranca_inquilino: R.COBRANCA_IPTU_QUITADO[1] };
  assert.deepEqual([R.iptuNaCompetencia(q, '2026-01')[1], R.iptuNaCompetencia(q, '2026-12')[1]], [8337, 8333]);
  // seguro em andamento (1ª parcela em 07/2026): R$ 1.200,05 em 10 continua com a 1ª de R$ 119,96
  assert.deepEqual([C.parcelaNaCompetencia(120005, 10, '2026-07', '2026-07'), C.parcelaNaCompetencia(120005, 10, '2026-07', '2027-04')], [[1, 11996], [10, 12001]]);
});
