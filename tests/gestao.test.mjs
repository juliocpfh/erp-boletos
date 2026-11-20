import assert from 'node:assert/strict';
import test from 'node:test';
import * as G from '../docs/js/gestao.js';
import * as R from '../docs/js/regras.js';
import { carregarSite, entrarComo } from './tela-falsa.mjs';

// Painel de Gestão (aprimoramento 10 do estudo de mercado, 17/11/2026): os números do mês, com dados fictícios.
// Hoje: 16/11/2026. Boletos vencem no dia 10 do próprio mês (cobrança no mês, sem bonificação e sem tarifa).
const HOJE = '2026-11-16';
const contrato = (d, imovel, nome, extra) => R.inserir(d, 'contratos', { imovel_id: imovel.id, inquilino_nome: nome, inquilino_cpf: '529.982.247-25',
  dia_vencimento: 10, cobranca_mes_seguinte: false, taxa_boleto: 0, multa_percentual: 2, juros_mensal_percentual: 1, prazo_tipo: 'Determinado', ...extra }, 'teste');

function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'teste');
  const imovel = (nome) => { const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome, endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'teste');
    R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: ank.id, percentual: 100 }, 'teste'); return i; };
  const [loja1, loja2, sala3, casa4, apto5, loja6] = ['Loja 1', 'Loja 2', 'Sala 3', 'Casa 4', 'Apto 5', 'Loja 6'].map(imovel);
  // Maria: entrou em 01/11/2025, contrato de 13 meses (termina em 01/12/2026), reajuste no aluguel de 11/2026
  const maria = contrato(d, loja1, 'Maria Exemplo', { data_entrada: '2025-11-01', vigencia_inicio: '2025-11-01', prazo_meses: 13, aluguel_inicial: 100000 });
  // João: caução de R$ 6.000,00 depositada; o boleto de novembro está em atraso
  const joao = contrato(d, loja2, 'João Exemplo', { data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', prazo_meses: 30, aluguel_inicial: 200000,
    garantia_tipo: 'Caução', caucao_valor: 600000, comprovante_caucao: 'caucao.pdf' });
  // Carla saiu em 31/10/2026: o boleto de outubro ficou em aberto; a Sala 3 está vaga desde 01/11/2026
  const carla = contrato(d, sala3, 'Carla Exemplo', { data_entrada: '2026-01-05', vigencia_inicio: '2026-01-05', prazo_meses: 30, aluguel_inicial: 150000 });
  // Pedro: entrou em 01/12/2025, reajuste no aluguel de 12/2026
  const pedro = contrato(d, loja6, 'Pedro Exemplo', { data_entrada: '2025-12-01', vigencia_inicio: '2025-12-01', prazo_meses: 36, aluguel_inicial: 150000 });
  // Ana: contrato feito, entra no Apto 5 em 01/12/2026 (até lá o Apto 5 está vago)
  contrato(d, apto5, 'Ana Exemplo', { data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', prazo_meses: 30, aluguel_inicial: 120000 });
  R.gerarCobrancas(d, '2026-10', 'teste');
  R.atualizar(d, 'contratos', carla.id, { data_saida: '2026-10-31' }, 'teste');
  R.gerarCobrancas(d, '2026-11', 'teste');
  const boleto = (c, comp) => R.boletoDoMes(d, c.id, comp);
  for (const c of [maria, joao, pedro]) R.registrarPagamento(d, boleto(c, '2026-10').id, '2026-10-09', null, 'teste');
  R.registrarPagamento(d, boleto(maria, '2026-11').id, '2026-11-10', null, 'teste');
  R.numerarFaturas(d, 'teste', { forcar: true });
  // Pedro pagou depois da numeração: o pagamento espera o número da NF
  R.registrarPagamento(d, boleto(pedro, '2026-11').id, '2026-11-09', null, 'teste');
  return { d, maria, joao, carla, pedro, casa4, apto5, sala3, boleto };
}

test('gestão: inadimplência, inquilinos atrasados e recebido x previsto pelo mês do vencimento', () => {
  const { d, joao, carla, boleto } = base();
  const g = G.numerosDaGestao(d, '2026-11', HOJE);
  // novembro: Maria R$ 1.000,00 (paga), João R$ 2.000,00 (em atraso), Pedro R$ 1.500,00 (pago); Carla já saiu (sem boleto)
  assert.equal(g.boletos.boletos.length, 3);
  assert.equal(g.boletos.previsto, 450000);
  assert.equal(g.boletos.emAtraso, 200000);
  assert.equal(g.boletos.pct, 44.4, 'R$ 2.000,00 de R$ 4.500,00');
  assert.equal(g.boletos.inquilinos, 1);
  assert.deepEqual(g.boletos.atrasados.map((x) => x.cobranca.id), [boleto(joao, '2026-11').id]);
  assert.equal(g.boletos.recebido, 250000, 'Maria R$ 1.000,00 + Pedro R$ 1.500,00');
  assert.equal(g.boletos.previstoEmDia, 450000);
  assert.equal(g.boletos.pctRecebido, 55.6);
  assert.equal(g.boletos.entrou, 250000, 'pagos em novembro');
  // outubro: os 4 boletos (R$ 6.000,00); só o da Carla (R$ 1.500,00) segue em aberto hoje
  assert.equal(g.boletosAnterior.previsto, 600000);
  assert.equal(g.boletosAnterior.emAtraso, 150000);
  assert.equal(g.boletosAnterior.pct, 25);
  assert.equal(g.boletosAnterior.inquilinos, 1);
  assert.equal(g.boletosAnterior.atrasados[0].contrato.id, carla.id);
  assert.equal(g.boletosAnterior.entrou, 450000, 'Maria, João e Pedro pagaram em 09/10');
  // em atraso hoje, de qualquer mês: João e Carla (o mesmo que a aba Inadimplência)
  assert.equal(g.emAtrasoHoje.inquilinos, 2);
  assert.equal(g.emAtrasoHoje.total, R.inadimplencia(d, HOJE).total);
  assert.equal(g.emAtrasoHoje.total, 350000);
});

test('gestão: complemento da caução, carência e boleto em acordo ficam fora do previsto', () => {
  const { d, joao, boleto } = base();
  const nov = boleto(joao, '2026-11');
  const { id, ...resto } = nov;
  R.inserir(d, 'cobrancas', { ...resto, aluguel: 0, caucao_complemento: 50000 }, 'teste'); // complemento da caução: é garantia
  R.inserir(d, 'cobrancas', { ...resto, situacao: 'Carência', aluguel: 0 }, 'teste');
  R.atualizar(d, 'cobrancas', id, { situacao: 'Em acordo' }, 'teste');
  const g = G.numerosDaGestao(d, '2026-11', HOJE);
  assert.equal(g.boletos.previsto, 250000, 'o boleto em acordo sai (valem as parcelas, no mês delas)');
  assert.equal(g.boletos.pct, 0);
  assert.equal(g.boletos.inquilinos, 0);
});

test('gestão: imóveis vagos e há quantos dias; o mês anterior no último dia dele', () => {
  const { d, sala3, casa4, apto5 } = base();
  const g = G.numerosDaGestao(d, '2026-11', HOJE);
  assert.equal(g.imoveis, 6);
  assert.deepEqual(g.vagos.map((x) => [x.imovel.id, x.desde, x.dias]), [[sala3.id, '2026-11-01', 16], [apto5.id, null, null], [casa4.id, null, null]]);
  assert.equal(g.vagos.find((x) => x.imovel.id === apto5.id).proximo.inquilino_nome, 'Ana Exemplo', 'a Ana entra em 01/12/2026');
  assert.equal(g.vagosAnterior, 2, 'em 31/10/2026 a Carla ainda estava na Sala 3');
  // num mês que já passou, o dia de referência é o último dia dele
  const out = G.numerosDaGestao(d, '2026-10', HOJE);
  assert.equal(out.dia, '2026-10-31');
  assert.equal(out.vagos.length, 2);
});

test('gestão: contratos que vencem em até 90 dias e reajustes do mês e do próximo', () => {
  const { d, maria, pedro } = base();
  const g = G.numerosDaGestao(d, '2026-11', HOJE);
  assert.deepEqual(g.vencer.lista.map((x) => [x.contrato.id, x.fim, x.faltam]), [[maria.id, '2026-12-01', 15]]);
  assert.equal(g.vencer.aVencer, 1);
  assert.equal(g.vencer.vencidos, 0);
  assert.equal(g.vencerAnterior, 1, 'em 31/10/2026 faltavam 31 dias');
  assert.deepEqual(g.reajustes.lista.map((x) => x.contrato.id), [maria.id]);
  assert.equal(g.reajustes.feitos, 0);
  assert.deepEqual(g.reajustesProximo.lista.map((x) => x.contrato.id), [pedro.id]);
  assert.equal(g.reajustesAnterior.lista.length, 0);
  // reajuste aplicado: conta como feito
  R.aplicarReajuste(d, maria.id, '2026-11', 'teste', { percentual: 5 });
  assert.equal(G.numerosDaGestao(d, '2026-11', HOJE).reajustes.feitos, 1);
});

test('gestão: NFs emitidas no mês, pagamentos aguardando número e caução guardada', () => {
  const { d } = base();
  const g = G.numerosDaGestao(d, '2026-11', HOJE);
  assert.equal(g.nfs.qtd, 1, 'a NF da Maria (a do Pedro ainda não foi numerada)');
  assert.equal(g.nfs.valor, 100000);
  assert.equal(g.nfs.aguardando, 1);
  assert.equal(g.nfsAnterior.qtd, 3);
  assert.equal(g.nfsAnterior.valor, 450000);
  assert.deepEqual(g.caucao, { total: 600000, aplicado: 0, inquilinos: 1 });
});

test('tela Gestão: números, lista de cada número (?filtro=), nomes escapados e o relatório de uma página', async () => {
  const T = await carregarSite();
  const { d, sala3 } = base();
  R.atualizar(d, 'imoveis', sala3.id, { nome: 'Sala <b>3</b>' }, 'teste');
  R.inserir(d, 'usuarios', { login: 'dono@exemplo.com.br', nome: 'Dono', papel: 'admin', ativo: true }, 'teste');
  T.E.d = d;
  entrarComo(T.E, 'admin');
  const TG = await import('../docs/js/telas/gestao.js');
  const html = TG.telaGestao({ mes: '2026-10' });
  assert.match(html, /<h1>Financeiro<\/h1>[\s\S]*<h2>Gestão · números de 10\/2026<\/h2>/, 'título do Financeiro, como nas outras abas');
  assert.match(html, /data-acao="relatorioGestao" data-mes="2026-10"/);
  assert.match(html, /25,0%/, 'inadimplência de outubro: R$ 1.500,00 de R$ 6.000,00');
  assert.match(html, /href="#\/gestao\?mes=2026-10&filtro=vagos&ir=lista"/);
  assert.ok(!html.includes('id="lista"'), 'sem ?filtro= a tela não traz lista');
  const vagos = TG.telaGestao({ mes: '2026-10', filtro: 'vagos' });
  assert.match(vagos, /id="lista"/);
  assert.match(vagos, /Imóveis vagos em 31\/10\/2026 \(2\)/);
  const nov = TG.telaGestao({ mes: '2026-11', filtro: 'vagos' });
  assert.match(nov, /Sala &lt;b&gt;3&lt;\/b&gt;/);
  assert.ok(!nov.includes('Sala <b>3</b>'));
  assert.match(TG.telaGestao({ mes: '2026-10', filtro: 'inadimplencia' }), /Carla Exemplo/);
  assert.match(TG.telaGestao({ mes: '2026-10', filtro: 'recebido' }), /nº 0001/, 'a NF de cada boleto pago (R.indiceFaturas)');
  assert.ok(!TG.telaGestao({ mes: '2026-10', filtro: 'outra_coisa' }).includes('id="lista"'));
  // mês futuro: fica no mês atual
  assert.match(TG.telaGestao({ mes: '2099-01' }), new RegExp(`Gestão · números de ${T.C.compBr(T.C.competenciaDe(T.C.hojeIso())).replace('/', '\\/')}`));
  // relatório: uma folha com cada número e o do mês anterior
  const folha = TG._relatorioHtml('2026-11', HOJE);
  assert.match(folha, /RESUMO DE GESTÃO · 11\/2026/);
  assert.match(folha, /44,4% · R\$ 2\.000,00/);
  assert.match(folha, /25,0% · R\$ 1\.500,00/);
  assert.match(folha, /Sala &lt;b&gt;3&lt;\/b&gt;/, 'o nome do imóvel no relatório também passa por esc()');
  assert.equal(TG.linhasDoResumo(G.numerosDaGestao(d, '2026-11', HOJE)).length, 8);
});
