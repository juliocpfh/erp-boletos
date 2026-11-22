// Melhorias pequenas pedidas pelo dono em 17/11: "Hoje"/"Ontem" nas datas, inadimplência por faixa de atraso, 2ª via com o
// valor do dia, tamanho dos dados, busca nas regras do sistema e taxas da poupança guardadas no banco. Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as CR from '../docs/js/config-regras.js';
import * as F from '../docs/js/formularios.js';
import * as P from '../docs/js/poupanca.js';
import * as R from '../docs/js/regras.js';

const HOJE = '2026-11-24';

/** Dois inquilinos com boletos vencidos há 14, 50, 75 e 137 dias (multa 2%, juros 1% ao mês), um a vencer, um pago e um complemento da caução. */
function base() {
  const d = R.bancoVazio();
  const casa = R.inserir(d, 'imoveis', { nome: 'Casa 3', endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'j');
  const sala = R.inserir(d, 'imoveis', { nome: 'Sala 5', endereco: 'Rua Y, 20', cidade: 'Curitiba' }, 'j');
  const ana = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Ana Souza', inquilino_cpf: '529.982.247-25', inquilino_telefone: '(41) 99999-0000', data_entrada: '2026-01-10' }, 'j');
  const rui = R.inserir(d, 'contratos', { imovel_id: sala.id, inquilino_nome: 'Rui Lima', inquilino_cpf: '529.982.247-25', data_entrada: '2026-01-10' }, 'j');
  const boleto = (c, competencia, vencimento, aluguel, extra = {}) => R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia, vencimento, aluguel, aluguel_mensal: aluguel, desconto: 0,
    multa_percentual: 2, juros_mensal_percentual: 1, situacao: 'Em aberto', data_pagamento: null, ...extra }, 'j');
  const b = {
    a: boleto(ana, '2026-10', '2026-11-10', 100000), // 14 dias
    b: boleto(ana, '2026-08', '2026-09-10', 120000), // 75 dias
    c: boleto(rui, '2026-09', '2026-10-05', 90000), // 50 dias
    d: boleto(rui, '2026-06', '2026-07-10', 150000), // 137 dias
    futuro: boleto(rui, '2026-11', '2026-12-10', 90000),
    pago: boleto(ana, '2026-07', '2026-08-10', 100000, { data_pagamento: '2026-08-10', situacao: 'Paga em dia' }),
    caucao: boleto(ana, '2026-05', '2026-06-10', 20000, { caucao_complemento: 20000, multa_percentual: 0, juros_mensal_percentual: 0 }),
  };
  return { d, ana, rui, b };
}

test('datas: "Hoje" e "Ontem" depois dos campos de data de algo que já aconteceu (pagamento, recebimento), não no vencimento', () => {
  const html = F.atalhosData();
  assert.match(html, /data-dia="0"[^>]*>Hoje</);
  assert.match(html, /data-dia="-1"[^>]*>Ontem</);
  assert.match(html, /type="button"/, 'não envia o formulário');
  const campos = F.camposHtml([{ nome: 'data_pagamento', rotulo: 'Pago em', tipo: 'data' }, { nome: 'vencimento', rotulo: 'Vencimento', tipo: 'data' }]);
  // o botão vem logo depois do campo de pagamento (app.js põe a data no campo de antes)
  assert.match(campos, /name="data_pagamento" type="date"[^>]*><span class="atalhos-data/);
  assert.doesNotMatch(campos, /name="vencimento" type="date"[^>]*><span class="atalhos-data/);
  // pode ligar ou desligar campo a campo
  assert.match(F.camposHtml([{ nome: 'vencimento', rotulo: 'V', tipo: 'data', atalhos: true }]), /atalhos-data/);
  assert.doesNotMatch(F.camposHtml([{ nome: 'data', rotulo: 'D', tipo: 'data', atalhos: false }]), /atalhos-data/);
  // o que o botão põe: hoje e o dia anterior (virada de mês e de ano)
  assert.equal(C.somarDias('2026-11-01', -1), '2026-10-31');
  assert.equal(C.somarDias('2027-01-01', -1), '2026-12-31');
});

test('inadimplência por faixa de atraso: boletos, inquilinos, valor do boleto e valor do dia (multa e juros por C.liquidar)', () => {
  const { d, b } = base();
  const r = R.inadimplencia(d, HOJE);
  const f = R.faixasDeAtraso(r.devedores);
  assert.deepEqual(f.map((x) => x.nome), ['Até 30 dias', '31 a 60 dias', '61 a 90 dias', 'Mais de 90 dias']);
  assert.deepEqual(f.map((x) => x.boletos), [1, 1, 1, 1], 'a vencer, pago e complemento da caução ficam de fora');
  assert.deepEqual(f.map((x) => x.inquilinos), [1, 1, 1, 1]);
  assert.deepEqual(f.map((x) => x.valor), [100000, 90000, 120000, 150000]);
  // R$ 1.200,00 há 75 dias: multa R$ 24,00 + juros R$ 0,40 × 75 = R$ 30,00 → R$ 1.254,00
  assert.equal(f[2].valorHoje, 125400);
  assert.equal(f[2].valorHoje, C.liquidar(b.b, HOJE).valor_devido);
  // R$ 1.500,00 há 137 dias: multa R$ 30,00 + juros R$ 0,50 × 137 = R$ 68,50 → R$ 1.598,50
  assert.equal(f[3].valorHoje, 159850);
  assert.deepEqual(f.map((x) => x.valorHoje), [102462, 93300, 125400, 159850]);
  // as faixas somam o total da tela
  assert.equal(f.reduce((s, x) => s + x.valorHoje, 0), r.totalHoje);
  assert.equal(f.reduce((s, x) => s + x.valor, 0), r.total);
  // limites: 30 dias ainda é "até 30"; 31 já é a 2ª faixa; 90 é a 3ª; 91, a última
  const dev = (dias) => [{ contrato: { id: 1 }, boletos: [{ dias, valor: 1, hojeValor: 1 }] }];
  assert.deepEqual([30, 31, 60, 61, 90, 91].map((n) => R.faixasDeAtraso(dev(n)).findIndex((x) => x.boletos)), [0, 1, 1, 2, 2, 3]);
  // dois boletos do mesmo inquilino na mesma faixa: 2 boletos, 1 inquilino
  const dois = R.faixasDeAtraso([{ contrato: { id: 7 }, boletos: [{ dias: 5, valor: 10, hojeValor: 11 }, { dias: 20, valor: 10, hojeValor: 12 }] }]);
  assert.deepEqual([dois[0].boletos, dois[0].inquilinos, dois[0].valorHoje], [2, 1, 23]);
  assert.deepEqual(R.faixasDeAtraso([]).map((x) => x.boletos), [0, 0, 0, 0]);
});

test('2ª via com o valor do dia: só boleto vencido e a cobrar; valor com multa e juros de hoje e texto pronto', () => {
  const { d, b } = base();
  const v = R.segundaVia(d, b.b, HOJE);
  assert.deepEqual([v.dias, v.original, v.multa, v.juros, v.valor], [75, 120000, 2400, 3000, 125400]);
  assert.equal(v.valor, C.liquidar(b.b, HOJE).valor_devido);
  assert.match(v.texto, /^Olá, Ana!/);
  assert.match(v.texto, /2ª via do boleto do aluguel de 08\/2026 \(Casa 3\), que venceu em 10\/09\/2026 \(75 dias de atraso\)/);
  assert.match(v.texto, /Valor do boleto: R\$\s1\.200,00/);
  assert.match(v.texto, /Multa \(2%\): R\$\s24,00/);
  assert.match(v.texto, /Juros \(1% ao mês, 75 dias\): R\$\s30,00/);
  assert.match(v.texto, /Total para pagar hoje: R\$\s1\.254,00/);
  assert.match(v.assunto, /24\/11\/2026/);
  assert.equal(v.telefone, '41999990000');
  // não vencido, pago ou em acordo: sem 2ª via (vale o valor do boleto)
  assert.equal(R.segundaVia(d, b.futuro, HOJE), null);
  assert.equal(R.segundaVia(d, b.pago, HOJE), null);
  assert.equal(R.segundaVia(d, { ...b.b, situacao: 'Em acordo' }, HOJE), null);
  // vencimento no sábado 10/10/2026 (e 12/10 feriado): na terça 13/10 ainda está em dia; na quarta 14/10, 4 dias
  const sab = { ...b.b, vencimento: '2026-10-10' };
  assert.equal(R.segundaVia(d, sab, '2026-10-13'), null);
  assert.equal(R.segundaVia(d, sab, '2026-10-14').dias, 4);
  // emitido no banco: leva a linha digitável, como o lembrete
  const banco = R.segundaVia(d, { ...b.b, banco: { linha_digitavel: '33690.00001 11111.111111 22222.222222 1 00000000012345' } }, HOJE);
  assert.match(banco.texto, /Linha digitável do boleto: 33690/);
});

test('tamanho dos dados: bytes do banco, tabelas com mais registros primeiro, histórico e anexos ligados', () => {
  const { d, ana } = base();
  R.inserir(d, 'depositos_garantia', { contrato_id: ana.id, data: '2026-01-10', valor: 360000, comprovante: 'comprovante-caucao.pdf' }, 'j');
  const t = R.tamanhoDoBanco(d);
  assert.equal(t.bytes, new TextEncoder().encode(JSON.stringify(d)).length);
  assert.equal(t.tabelas[0].tabela, 'cobrancas');
  assert.equal(t.tabelas[0].nome, 'Boleto');
  assert.equal(t.tabelas[0].registros, 7);
  assert.ok(t.tabelas[0].bytes > 0);
  assert.equal(t.historico.registros, d.historico.length);
  assert.ok(!t.tabelas.some((x) => x.tabela === 'historico'));
  assert.equal(t.registros, t.tabelas.reduce((s, x) => s + x.registros, 0));
  assert.equal(t.anexos, 1);
  assert.equal(R.tamanhoDoBanco(d), t, 'o mesmo banco não é medido de novo');
  assert.equal(C.tamanhoTexto(1572864), '1,5 MB');
  assert.equal(C.tamanhoTexto(3000), '3 KB');
  assert.equal(C.tamanhoTexto(10), '1 KB');
  assert.equal(C.tamanhoTexto(0), '0 KB');
  assert.equal(C.tamanhoTexto(2 * 1073741824), '2,0 GB');
});

test('busca nas regras do sistema: pelo nome e pela explicação, sem acento nem maiúscula, todas as palavras', () => {
  assert.equal(CR.buscarRegras('').length, CR.REGRAS_NA_TELA.length, 'vazia: todas as da tela (a assinatura digital fica na caixa do certificado)');
  assert.equal(CR.buscarRegras('   ').length, CR.REGRAS_NA_TELA.length);
  const reajuste = CR.buscarRegras('REAJUSTE');
  assert.ok(reajuste.includes('reajuste_inicio'));
  assert.deepEqual(CR.buscarRegras('reajuste'), reajuste, 'maiúscula não importa');
  assert.deepEqual(CR.buscarRegras('caucao'), CR.buscarRegras('caução'), 'acento não importa');
  assert.ok(CR.buscarRegras('caução').length > 0);
  // duas palavras: só as que têm as duas
  const duas = CR.buscarRegras('reajuste caução');
  assert.ok(duas.length <= reajuste.length && duas.every((k) => reajuste.includes(k)));
  // pela explicação de uma opção ("Entrada em 20/03/2026 …") e pela lei
  assert.ok(CR.buscarRegras('10.192').includes('reajuste_inicio'));
  assert.deepEqual(CR.buscarRegras('palavra-que-nao-existe-xyz'), []);
});

test('poupança: taxas guardadas no banco valem sem internet; só as que faltam vão ao Banco Central e ficam guardadas', async () => {
  const d = R.bancoVazio();
  assert.deepEqual(P.taxasGuardadas(d), {});
  // depósito de R$ 1.000,00 em 15/03/2015, até 20/06/2015: 3 meses completos (15/03, 15/04, 15/05)
  const mov = [{ data: '2015-03-15', valor: 100000 }];
  assert.deepEqual(P.diasDaPoupanca(mov, '2015-06-20'), ['2015-03-15', '2015-04-15', '2015-05-15']);
  const pedidos = [];
  const bc = async (url) => {
    pedidos.push(url);
    return { ok: true, json: async () => [{ data: '15/03/2015', valor: '0.6' }, { data: '16/03/2015', valor: '0.61' }, { data: '15/04/2015', valor: '0.62' }, { data: '15/05/2015', valor: '0.63' }] };
  };
  const guardar = (novas) => { R.guardarTaxasPoupanca(d, novas, 'j'); };
  const r1 = await P.poupancaDaGarantia(mov, '2015-06-20', bc, { guardadas: P.taxasGuardadas(d), guardar });
  assert.equal(pedidos.length, 1);
  assert.match(pedidos[0], /dataInicial=15\/03\/2015&dataFinal=15\/05\/2015$/);
  assert.equal(r1.corrigido, Math.round(100000 * 1.006 * 1.0062 * 1.0063));
  // guardou tudo o que veio (também o dia 16, para outro depósito), um registro por mês, e uma linha no histórico
  assert.deepEqual(d.taxas_poupanca.map((x) => x.mes), ['2015-03', '2015-04', '2015-05']);
  assert.deepEqual(d.taxas_poupanca[0].taxas, { '2015-03-15': 0.6, '2015-03-16': 0.61 });
  assert.equal(d.historico.filter((h) => h.tabela === 'taxas_poupanca').length, 1);
  // de novo, sem internet: o mesmo resultado, sem perguntar ao Banco Central
  const semInternet = async () => { throw new Error('sem internet'); };
  const r2 = await P.poupancaDaGarantia(mov, '2015-06-20', semInternet, { guardadas: P.taxasGuardadas(d), guardar });
  assert.equal(r2.corrigido, r1.corrigido);
  // taxa já guardada nunca é trocada (o mesmo cálculo dá sempre o mesmo resultado)
  assert.equal(R.guardarTaxasPoupanca(d, { '2015-03-15': 9, '2015-03-17': 0.64, 'lixo': 1, '2015-02-30': 1 }, 'j'), 1);
  assert.equal(d.taxas_poupanca[0].taxas['2015-03-15'], 0.6);
  assert.deepEqual(Object.keys(d.taxas_poupanca[0].taxas), ['2015-03-15', '2015-03-16', '2015-03-17']);
  assert.equal(R.guardarTaxasPoupanca(d, { '2015-03-15': 0.6 }, 'j'), 0, 'nada novo: nem linha no histórico');
  // só o que falta vai ao Banco Central: com março a maio guardados, até 20/07 falta só 15/06
  const pedidos2 = [];
  const bc2 = async (url) => { pedidos2.push(url); return { ok: true, json: async () => [{ data: '15/06/2015', valor: '0.65' }] }; };
  const r3 = await P.taxasDosDias(P.diasDaPoupanca(mov, '2015-07-20'), { guardadas: P.taxasGuardadas(d), buscar: bc2 });
  assert.equal(pedidos2.length, 1);
  assert.match(pedidos2[0], /dataInicial=15\/06\/2015&dataFinal=15\/06\/2015$/);
  assert.equal(r3['2015-06-15'], 0.65);
  assert.equal(r3['2015-03-15'], 0.6);
  // gravar falhou (quem só consulta): a conta sai do mesmo jeito
  const r4 = await P.poupancaDaGarantia([{ data: '2015-06-15', valor: 100000 }], '2015-07-20', bc2, { guardadas: P.taxasGuardadas(d), guardar: () => { throw new Error('sem permissão'); } });
  assert.equal(r4.corrigido, 100650);
  // a tabela existe nos bancos antigos (normalizar) e nunca se desfaz pelo Histórico
  const antigo = R.bancoVazio();
  delete antigo.taxas_poupanca;
  R.normalizar(antigo);
  assert.deepEqual(antigo.taxas_poupanca, []);
  assert.ok(R.TABELAS.taxas_poupanca);
});
