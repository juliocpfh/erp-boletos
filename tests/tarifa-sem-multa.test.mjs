import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as CR from '../docs/js/config-regras.js';
import * as R from '../docs/js/regras.js';
import * as RE from '../docs/js/regua-email.js';

// Advogado e dono, 24/11/2026 (item 2.1 da resposta do advogado): multa e juros NÃO incidem sobre a tarifa do boleto.
// Aluguel de R$ 1.900,00 + tarifa de R$ 8,50 = boleto de R$ 1.908,50, vence 10/12/2026 (quinta), pago em 20/12 (10 dias):
// multa de 2% sobre R$ 1.900,00 = R$ 38,00 (e não R$ 38,17); juros de 1% ao mês = R$ 0,63 ao dia × 10 = R$ 6,30 (e não sobre
// R$ 1.908,50). Total R$ 1.908,50 + R$ 38,00 + R$ 6,30 = R$ 1.952,80; NF R$ 1.900,00 + R$ 38,00 + R$ 6,30 = R$ 1.944,30.
// Dados fictícios (CPF e CNPJ de teste).
function base(extra = {}) {
  const d = R.normalizar(R.bancoVazio());
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 9', endereco: 'Rua Exemplo, 10', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: casa.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Inquilino Teste', inquilino_cpf: '529.982.247-25', inquilino_email: 'teste@exemplo.com',
    data_entrada: '2026-03-01', vigencia_inicio: '2026-03-01', prazo_meses: 30, aluguel_inicial: 190000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    multa_percentual: 2, juros_mensal_percentual: 1, taxa_boleto: 850, cobrar_iptu: false, conta_seguro: 'Não tem', cobrar_seguro: false, garantia_tipo: 'Fiador', ...extra }, 'j');
  R.gerarCobrancas(d, '2026-11', 'j');
  return { d, c, cb: R.boletoDoMes(d, c.id, '2026-11') };
}

test('em dia: R$ 1.908,50, sem multa nem juros', () => {
  const { cb } = base();
  assert.deepEqual([cb.aluguel, cb.taxa_boleto, cb.vencimento], [190000, 850, '2026-12-10']);
  const r = C.liquidar(cb, '2026-12-10');
  assert.deepEqual([r.multa, r.juros, r.valor_devido, r.valor_nf], [0, 0, 190850, 190000]);
});

test('atrasado: multa e juros sobre R$ 1.900,00, sem a tarifa, em todo lugar', () => {
  const { d, c, cb } = base();
  assert.equal(R.totais(cb).base_multa, 190000);
  const r = C.liquidar(cb, '2026-12-20');
  assert.deepEqual([r.dias_atraso, r.multa, r.juros, r.valor_devido, r.valor_nf], [10, 3800, 630, 195280, 194430]);
  // 2ª via com o valor do dia
  const via = R.segundaVia(d, cb, '2026-12-20');
  assert.deepEqual([via.original, via.multa, via.juros, via.valor], [190850, 3800, 630, 195280]);
  assert.match(via.texto, /Multa \(2%\): R\$ 38,00/);
  // régua de cobrança por e-mail
  const fila = RE.filaRegua(d, '2026-12-20').filter((x) => x.cobranca.id === cb.id && x.dias > 0);
  for (const x of fila) assert.equal(x.valor, C.liquidar(cb, '2026-12-20').valor_devido);
  // débitos do cálculo final da saída
  const deb = R.debitosDaSaida(d, c, '2026-12-20').itens.find((x) => x.cobranca && x.cobranca.id === cb.id);
  assert.equal(deb.valor, 195280);
  assert.match(deb.texto, /multa de R\$ 38,00 e juros de R\$ 6,30/);
  // acordo: a dívida de hoje é a do pagamento atrasado
  const p = R.previaAcordo(d, { contrato_id: c.id, ids: [cb.id], total: 195280, parcelas: 2, primeiro_vencimento: '2026-12-21' }, '2026-12-20');
  assert.equal(p.divida, 195280);
  // instruções do C6: multa e juros em reais (a base é diferente do valor do boleto)
  const b = R.dadosBoleto(d, cb);
  assert.deepEqual([b.valor, b.multa_valor, b.juros_ao_dia], [190850, 3800, 63]);
  // conferência do valor recebido e NF: R$ 1.952,79 é recusado; R$ 1.952,80 quita com a NF de R$ 1.944,30
  assert.throws(() => R.registrarPagamento(d, cb.id, '2026-12-20', 195279, 'j'), /menor que o devido \(R\$ 1\.952,80\)/);
  R.registrarPagamento(d, cb.id, '2026-12-20', 195280, 'j');
  assert.deepEqual([cb.situacao, cb.multa, cb.juros, cb.valor_pago, cb.valor_nf], ['Paga com atraso', 3800, 630, 195280, 194430]);
});

test('sem tarifa (regra em branco): multa sobre o boleto inteiro, como antes, e em % no C6', () => {
  const { d, cb } = base({ taxa_boleto: 0 });
  assert.equal(cb.taxa_boleto, 0);
  const r = C.liquidar(cb, '2026-12-20');
  assert.deepEqual([r.multa, r.juros, r.valor_devido], [3800, 630, 194430]);
  assert.equal(R.dadosBoleto(d, cb).multa_valor, null);
});

test('"Não cobrar tarifa do boleto" com tarifa padrão de R$ 8,50: boleto sem tarifa, multa sobre R$ 1.900,00', () => {
  try {
    const { d, cb } = base({ taxa_boleto: 0, nao_cobrar_tarifa: true });
    R.salvarRegrasSistema(d, { tarifa_padrao: 850 }, 'admin');
    R.recalcularCobrancas(d, (x) => x.id === cb.id, 'j');
    const x = R.buscar(d, 'cobrancas', cb.id);
    assert.equal(x.taxa_boleto, 0);
    assert.deepEqual([C.liquidar(x, '2026-12-20').multa, C.liquidar(x, '2026-12-20').valor_devido], [3800, 194430]);
  } finally { CR.usarRegras(null); }
});

test('tarifa padrão (contrato sem valor próprio): a tarifa de R$ 8,50 também fica fora da multa', () => {
  try {
    const { d, cb } = base({ taxa_boleto: 0 });
    R.salvarRegrasSistema(d, { tarifa_padrao: 850 }, 'admin');
    const x = R.buscar(d, 'cobrancas', cb.id);
    assert.equal(x.taxa_boleto, 850);
    assert.deepEqual([C.liquidar(x, '2026-12-20').multa, C.liquidar(x, '2026-12-20').valor_devido], [3800, 195280]);
  } finally { CR.usarRegras(null); }
});

test('regra "só sobre o aluguel" com tarifa: a mesma base de R$ 1.900,00', () => {
  try {
    const { d, cb } = base();
    R.salvarRegrasSistema(d, { base_multa: 'aluguel' }, 'admin');
    assert.equal(CR.regra('base_multa'), 'aluguel');
    assert.equal(R.totais(cb).base_multa, 190000);
    assert.equal(C.liquidar(cb, '2026-12-20').multa, 3800);
  } finally { CR.usarRegras(null); }
});

test('contrato: a cláusula da tarifa diz que multa e juros não incidem sobre ela; modelos gravados recebem a frase uma vez', async () => {
  const MC = await import('../docs/js/modelos-contrato.js');
  assert.match(MC.TARIFA_BOLETO, /pelo valor cobrado pelo banco\. A multa e os juros por atraso não incidem sobre a tarifa\.$/);
  const antigo = '**Parágrafo** – O LOCATÁRIO reembolsará, junto com cada aluguel, a tarifa bancária de emissão do boleto[se tarifa_boleto], hoje de {tarifa_boleto}[fim], pelo valor cobrado pelo banco.';
  const gravado = `**CLÁUSULA 1** – Texto.\n\n${antigo}\n\n**Parágrafo** – As despesas de responsabilidade do LOCATÁRIO poderão ser cobradas a qualquer tempo.`;
  const novo = MC.atualizarTextoModelo(gravado);
  assert.equal(novo.split('não incidem sobre a tarifa').length - 1, 1);
  assert.ok(novo.includes(`${MC.TARIFA_BOLETO}\n\n**Parágrafo** – As despesas`));
  assert.equal(MC.atualizarTextoModelo(novo), novo, 'aplicar de novo não muda nada');
  // modelo gravado antes da tarifa voltar ao contrato: recebe a cláusula já com a frase
  const semTarifa = MC.atualizarTextoModelo('**CLÁUSULA 1** – Texto.\n\n**Parágrafo** – As despesas de responsabilidade do LOCATÁRIO poderão ser cobradas a qualquer tempo.');
  assert.equal(semTarifa.split('não incidem sobre a tarifa').length - 1, 1);
});
