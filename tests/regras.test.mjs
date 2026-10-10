import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '58.492.818/0001-59', municipio: 'CURITIBA', ativo: true }, 'julio');
  const jck = R.inserir(d, 'emitentes', { nome: 'JCK ADMINISTRADORA', razao_social: 'JCK ADMINISTRADORA DE BENS LTDA', cnpj: '58.522.768/0001-05', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Prof. Nilo Brandão, 117', complemento: 'Loja 1', cidade: 'Curitiba' }, 'julio');
  for (const e of [ank, jck]) R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: e.id, percentual: 50 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '000.000.000-00',
    inquilino_telefone: '41 90000-0000', data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07', aluguel_inicial: 135000,
    dia_vencimento: 10, cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 10, taxa_boleto: 350,
    multa_percentual: 10, juros_mensal_percentual: 1, cobrar_iptu: true, reserva_valor: 50000 }, 'julio');
  R.inserir(d, 'iptus', { imovel_id: loja.id, ano: 2026, valor_total: 100000, num_parcelas: 10, primeira_competencia: '2026-02' }, 'julio');
  return { d, loja, c };
}

test('gera cobranças com proporcional, IPTU e reserva', () => {
  const { d } = base();
  assert.deepEqual(R.gerarCobrancas(d, '2026-06', 'julio'), { geradas: 1, existentes: 0 });
  const cb = d.cobrancas[0];
  assert.equal(cb.dias_cobrados, 24);
  assert.equal(cb.aluguel, 108000);
  assert.equal(cb.desconto, 10800);
  assert.equal(cb.iptu, 10000);
  assert.equal(cb.reserva_utilizada, 50000);
  assert.equal(cb.vencimento, '2026-07-10');
  R.gerarCobrancas(d, '2026-07', 'julio');
  assert.equal(d.cobrancas[1].reserva_utilizada, 0);
  assert.deepEqual(R.gerarCobrancas(d, '2026-07', 'julio'), { geradas: 0, existentes: 1 });
});

test('pagamento em atraso guarda multa e juros separados e valor da nota', () => {
  const { d } = base();
  R.gerarCobrancas(d, '2026-06', 'julio'); // junho usa a reserva
  R.gerarCobrancas(d, '2026-07', 'julio');
  const r = R.registrarPagamento(d, 2, '2026-08-20', null, 'julio');
  const cb = d.cobrancas[1];
  // aberto sem desconto: 1350 + 100 + 3,50 = 1453,50; multa 145,35; juros 0,48 ao dia × 10
  assert.equal(cb.situacao, 'Paga com atraso');
  assert.equal(cb.multa, 14535);
  assert.equal(cb.juros, 480);
  assert.equal(cb.valor_nf, 135000 + 14535 + 480);
  assert.equal(r.dias_atraso, 10);
});

test('numeração contínua das faturas na ordem dos pagamentos', () => {
  const { d, c } = base();
  d.proxima_fatura = 142;
  R.gerarCobrancas(d, '2026-06', 'julio');
  R.gerarCobrancas(d, '2026-07', 'julio');
  // julho pago antes de junho (fora da ordem das competências)
  R.registrarPagamento(d, 2, '2026-08-05', null, 'julio');
  R.registrarPagamento(d, 1, '2026-08-07', null, 'julio');
  const r = R.numerarFaturas(d, 'julio');
  assert.deepEqual(r.numeradas.map((n) => [n.numero, n.registro.competencia]), [[142, '2026-07'], [143, '2026-06']]);
  assert.equal(d.faturas.length, 4);
  const f142 = d.faturas.filter((f) => f.numero === 142);
  assert.deepEqual(f142.map((f) => f.valor), [60750, 60750]);
  assert.equal(f142[0].emissao, '2026-08-05');
  assert.equal(f142[0].tomador_nome, c.inquilino_nome);
  assert.equal(f142[0].tomador_endereco, 'Rua Prof. Nilo Brandão, 117, Loja 1');
  assert.equal(d.proxima_fatura, 144);
  assert.equal(R.numerarFaturas(d, 'julio').numeradas.length, 0);
});

test('pagamento anterior à última fatura emitida exige confirmação', () => {
  const { d } = base();
  R.gerarCobrancas(d, '2026-06', 'julio');
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.registrarPagamento(d, 2, '2026-08-10', null, 'julio');
  R.numerarFaturas(d, 'julio');
  R.registrarPagamento(d, 1, '2026-08-01', null, 'julio');
  const r = R.numerarFaturas(d, 'julio');
  assert.equal(r.numeradas.length, 0);
  assert.equal(r.foraDeOrdem.length, 1);
  assert.equal(R.numerarFaturas(d, 'julio', { forcar: true }).numeradas[0].numero, 2);
});

test('desfazer pagamento cancela a fatura e o número não é reaproveitado', () => {
  const { d } = base();
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.registrarPagamento(d, 1, '2026-08-10', null, 'julio');
  R.numerarFaturas(d, 'julio');
  assert.throws(() => R.registrarPagamento(d, 1, '2026-08-11', null, 'julio'));
  R.estornarPagamento(d, 1, 'julio');
  assert.ok(d.faturas.every((f) => f.situacao === 'Cancelada'));
  R.registrarPagamento(d, 1, '2026-08-11', null, 'julio');
  assert.equal(R.numerarFaturas(d, 'julio').numeradas[0].numero, 2);
});

test('Airbnb: recebimento entra na mesma sequência com o cliente da plataforma', () => {
  const { d } = base();
  const grupo = R.inserir(d, 'imoveis', { tipo: 'airbnb', nome: 'Airbnb', endereco: 'Rua X, 10', cliente_nome: 'AIRBNB PLATAFORMA DIGITAL LTDA' }, 'julio');
  const apto = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto 2', endereco: 'Rua X, 10', complemento: 'Apto 2', grupo_id: grupo.id }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: grupo.id, emitente_id: 1, percentual: 100 }, 'julio');
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.registrarPagamento(d, 1, '2026-08-10', null, 'julio');
  R.inserir(d, 'recebimentos', { imovel_id: grupo.id, unidade_id: apto.id, data_pagamento: '2026-08-08', valor: 80000,
    tomador_nome: 'AIRBNB PLATAFORMA DIGITAL LTDA', periodo_inicio: '2026-08-01', periodo_fim: '2026-08-05' }, 'julio');
  const r = R.numerarFaturas(d, 'julio');
  assert.deepEqual(r.numeradas.map((n) => [n.numero, n.tipo]), [[1, 'recebimento'], [2, 'cobranca']]);
  const fa = d.faturas.find((f) => f.origem_tipo === 'recebimento');
  assert.equal(fa.valor, 80000);
  assert.equal(fa.tomador_nome, 'AIRBNB PLATAFORMA DIGITAL LTDA');
  assert.equal(fa.tomador_endereco, 'Rua X, 10, Apto 2');
});

test('sem empresas no imóvel a numeração para e explica', () => {
  const { d, loja } = base();
  d.participacoes = d.participacoes.filter((p) => p.imovel_id !== loja.id);
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.registrarPagamento(d, 1, '2026-08-10', null, 'julio');
  const r = R.numerarFaturas(d, 'julio');
  assert.match(r.problema, /empresas/);
  assert.equal(d.faturas.length, 0);
});

test('histórico registra quem alterou o quê', () => {
  const { d, c } = base();
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-12-15' }, 'maria', 'Saída');
  const h = d.historico.at(-1);
  assert.equal(h.usuario, 'maria');
  assert.deepEqual(h.detalhes.data_saida, { de: null, para: '2026-12-15' });
  assert.equal(d.atualizado_por, 'maria');
});

test('texto do boleto no formato do banco', () => {
  const d = R.bancoVazio();
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 01', endereco: 'Rua Prof. Nilo Brandão, 117' }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'INQUILINO EXEMPLO', data_entrada: '2026-06-15',
    vigencia_inicio: '2026-06-15', aluguel_inicial: 364445, dia_vencimento: 5, cobranca_mes_seguinte: true, bonificacao: true,
    desconto_pontualidade_percentual: 10, taxa_boleto: 850, multa_percentual: 2, juros_mensal_percentual: 1, cobrar_iptu: false }, 'julio');
  R.inserir(d, 'seguros', { imovel_id: casa.id, seguradora: 'Bradesco', vigencia_inicio: '2026-06-15', vigencia_fim: '2027-06-15',
    valor_total: 22500, num_parcelas: 4, primeira_competencia: '2026-06' }, 'julio');
  R.gerarCobrancas(d, '2026-08', 'julio');
  const cb = d.cobrancas[0];
  cb.iptu = 9100;
  const b = R.dadosBoleto(d, cb);
  assert.equal(b.descricao, 'ALUGUEL RS3.644,45\nCOM BONF. RS3.280,00\nIPTU RS91,00 SEGURO3/4 RS56,25');
  assert.equal(b.valor, 380020);
  assert.equal(b.desconto, 36445);
  assert.equal(b.juros_ao_dia, 126);
  assert.equal(b.numero_documento, 'CASA01');
});

test('bonificação desligada, renovação com novo valor, caução e saída', () => {
  const d = R.bancoVazio();
  for (const n of ['ANK', 'JCK']) R.inserir(d, 'emitentes', { nome: `${n} ADMINISTRADORA`, razao_social: n, ativo: true }, 'julio');
  const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Venezuela', endereco: 'Rua Venezuela, 526' }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ruy', data_entrada: '2024-09-01', vigencia_inicio: '2024-09-01',
    data_base_correcao: '2024-10-01', prazo_tipo: 'Determinado', vigencia_fim: '2027-09-01', aluguel_inicial: 492800,
    bonificacao: false, desconto_pontualidade_percentual: 10, garantia_tipo: 'Caução', caucao_valor: 1344000,
    caucao_data: '2024-09-01', caucao_meses: 3, dia_vencimento: 1 }, 'julio');
  R.gerarCobrancas(d, '2026-08', 'julio');
  assert.equal(d.cobrancas[0].desconto, 0);
  // aluguel corrigido: a caução precisa ser corrigida também
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2025-10-01', indice: 'IPCA', percentual: 5.13, valor_anterior: 492800, valor_novo: 518083 }, 'julio');
  assert.ok(R.alertasContrato(d, c, '2026-08-01').some((a) => a.tipo === 'Correção da caução'));
  R.inserir(d, 'correcoes_garantia', { contrato_id: c.id, data: '2025-10-01', valor_novo: 1413255 }, 'julio');
  assert.ok(!R.alertasContrato(d, c, '2026-08-01').some((a) => a.tipo === 'Correção da caução'));
  assert.equal(R.valorGarantia(d, c), 1413255);
  // aplicação 50/50 nas empresas
  assert.ok(R.alertasContrato(d, c, '2026-08-01').some((a) => a.tipo === 'Aplicação da garantia'));
  R.inserir(d, 'aplicacoes', { contrato_id: c.id, data: '2025-10-02', emitente_id: 1, valor: 706627 }, 'julio');
  R.inserir(d, 'aplicacoes', { contrato_id: c.id, data: '2025-10-02', emitente_id: 2, valor: 706628 }, 'julio');
  assert.ok(R.situacaoAplicacao(d, c).ok);
  // renovação para prazo indeterminado com novo valor negociado
  R.registrarRenovacao(d, c.id, { data: '2027-09-01', tipo: 'Passou a prazo indeterminado', novo_valor: 600000 }, 'julio');
  assert.equal(c.prazo_tipo, 'Indeterminado');
  assert.equal(R.aluguelAtual(d, c, '2027-09-15'), 600000);
  assert.ok(d.historico.some((h) => h.tabela === 'renovacoes' && h.contrato_id === c.id));
  // saída com garantia corrigida pela poupança
  R.encerrarContrato(d, c.id, { data_saida: '2027-12-31', garantia_valor: 1413255, indice_percentual: 10, debitos: 100000 }, 'julio');
  const e = R.encerramentoDo(d, c.id);
  assert.equal(e.garantia_corrigida, 1554581);
  assert.equal(e.saldo, 1454581);
  assert.equal(c.data_saida, '2027-12-31');
});

test('fatura avulsa entra na mesma sequência, dividida entre as empresas ativas', () => {
  const d = R.bancoVazio();
  for (const n of ['ANK', 'JCK']) R.inserir(d, 'emitentes', { nome: `${n} ADMINISTRADORA`, razao_social: n, ativo: true }, 'julio');
  d.proxima_fatura = 200;
  R.inserir(d, 'avulsas', { data_pagamento: '2026-10-05', valor: 100001, tomador_nome: 'AIRBNB', descricao: 'Airbnb setembro' }, 'julio');
  const r = R.numerarFaturas(d, 'julio');
  assert.equal(r.problema, null);
  assert.deepEqual(d.faturas.map((f) => [f.numero, f.valor]), [[200, 50001], [200, 50000]]);
});

test('contratos ligados por alteração de titular', () => {
  const d = R.bancoVazio();
  const v = R.inserir(d, 'contratos', { imovel_id: 1, inquilino_nome: 'Vinicius', data_entrada: '2026-01-27' }, 'julio');
  const l = R.inserir(d, 'contratos', { imovel_id: 1, inquilino_nome: 'Licia', data_entrada: '2026-04-27', contrato_anterior_id: v.id }, 'julio');
  assert.deepEqual(R.cadeiaDeContratos(d, l).antes.map((x) => x.inquilino_nome), ['Vinicius']);
  assert.deepEqual(R.cadeiaDeContratos(d, v).depois.map((x) => x.inquilino_nome), ['Licia']);
});

test('inquilino sem imóvel ou inativo não gera cobrança', () => {
  const { d, c } = base();
  R.inserir(d, 'contratos', { inquilino_nome: 'Sem imóvel', data_entrada: '2026-01-01', aluguel_inicial: 100000, dia_vencimento: 5 }, 'julio');
  R.atualizar(d, 'contratos', c.id, { ativo: false }, 'julio');
  assert.deepEqual(R.gerarCobrancas(d, '2026-07', 'julio'), { geradas: 0, existentes: 0 });
  assert.equal(R.contratoAtivo(R.buscar(d, 'contratos', c.id), '2026-07-01'), false);
});

test('taxa do boleto para todos: inquilinos ativos e cobranças em aberto do mês', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.gerarCobrancas(d, '2026-08', 'julio');
  const jul = d.cobrancas.find((x) => x.competencia === '2026-07');
  R.registrarPagamento(d, jul.id, '2026-08-10', null, 'julio');
  const r = R.aplicarTaxaBoleto(d, 850, '2026-08', 'julio', '2026-08-01');
  assert.deepEqual(r, { contratos: 1, cobrancas: 1 });
  assert.equal(R.buscar(d, 'contratos', c.id).taxa_boleto, 850);
  assert.equal(d.cobrancas.find((x) => x.competencia === '2026-08').taxa_boleto, 850);
  assert.equal(R.buscar(d, 'cobrancas', jul.id).taxa_boleto, 350);
});

test('seguro é do imóvel: cobrado de quem está no imóvel no mês, e migra seguros antigos', () => {
  const d = R.bancoVazio();
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 2' }, 'julio');
  const base = { imovel_id: loja.id, aluguel_inicial: 139000, dia_vencimento: 1, cobranca_mes_seguinte: true, cobrar_iptu: false };
  const v = R.inserir(d, 'contratos', { ...base, inquilino_nome: 'Antigo', data_entrada: '2026-01-27', data_saida: '2026-04-26' }, 'julio');
  const l = R.inserir(d, 'contratos', { ...base, inquilino_nome: 'Novo', data_entrada: '2026-04-27' }, 'julio');
  // seguro gravado no formato antigo (no contrato do primeiro inquilino)
  d.seguros.push({ id: 1, contrato_id: v.id, seguradora: 'Allianz', vigencia_inicio: '2026-01-27', vigencia_fim: '2027-01-27',
    valor_total: 60000, num_parcelas: 6, primeira_competencia: '2026-02' });
  R.normalizar(d);
  assert.equal(d.seguros[0].imovel_id, loja.id);
  assert.equal(d.seguros[0].contrato_id, undefined);
  for (const comp of ['2026-03', '2026-04', '2026-05']) R.gerarCobrancas(d, comp, 'julio');
  const seg = (c, comp) => d.cobrancas.find((x) => x.contrato_id === c.id && x.competencia === comp)?.seguro;
  assert.equal(seg(v, '2026-03'), 10000);
  assert.equal(seg(v, '2026-04'), 0);
  assert.equal(seg(l, '2026-04'), 10000);
  assert.equal(seg(l, '2026-05'), 10000);
});

test('troca de garantia e de fiador ficam no histórico', () => {
  const d = R.bancoVazio();
  const c = R.inserir(d, 'contratos', { imovel_id: 1, inquilino_nome: 'X', data_entrada: '2024-01-01', aluguel_inicial: 200000,
    garantia_tipo: 'Caução', caucao_valor: 600000, caucao_data: '2024-01-01', caucao_meses: 3 }, 'julio');
  R.inserir(d, 'correcoes_garantia', { contrato_id: c.id, data: '2025-01-01', valor_novo: 630000 }, 'julio');
  R.trocarGarantia(d, c.id, { data: '2026-01-10', garantia_tipo: 'Fiador', observacoes: 'caução devolvida' }, 'julio');
  const ct = R.buscar(d, 'contratos', c.id);
  assert.equal(ct.garantia_tipo, 'Fiador');
  assert.equal(R.valorGarantia(d, ct), 0);
  assert.deepEqual(R.trocasGarantiaDo(d, c.id).map((t) => [t.tipo_anterior, t.tipo_novo, t.valor_anterior]), [['Caução', 'Fiador', 630000]]);
  const f1 = R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'Fiador A' }, 'julio');
  R.trocarFiador(d, f1.id, { data_troca: '2026-05-01', nome: 'Fiador B' }, 'julio');
  assert.deepEqual(R.fiadoresDo(d, c.id).map((f) => f.nome), ['Fiador B']);
  assert.deepEqual(R.fiadoresAnterioresDo(d, c.id).map((f) => [f.nome, f.data_saida]), [['Fiador A', '2026-05-01']]);
  assert.throws(() => R.trocarFiador(d, f1.id, { data_troca: '2026-06-01', nome: 'C' }, 'julio'));
  // volta para caução: correções da caução antiga não contam
  R.trocarGarantia(d, c.id, { data: '2026-07-01', garantia_tipo: 'Caução', caucao_valor: 700000, caucao_data: '2026-07-01' }, 'julio');
  assert.equal(R.valorGarantia(d, R.buscar(d, 'contratos', c.id)), 700000);
});

test('vincular inquilino ao imóvel grava a leitura dos relógios; a saída também', () => {
  const d = R.bancoVazio();
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa', endereco: 'Rua A' }, 'julio');
  const c = R.inserir(d, 'contratos', { inquilino_nome: 'X', data_entrada: '2026-01-15', aluguel_inicial: 100000, ativo: false }, 'julio');
  R.vincularInquilino(d, casa.id, { contrato_id: c.id, data_entrada: '2026-02-01', leitura_agua: '0123', leitura_energia: '45678', leitura_gas: '' }, 'julio');
  const ct = R.buscar(d, 'contratos', c.id);
  assert.deepEqual([ct.imovel_id, ct.data_entrada, ct.ativo, ct.leitura_agua], [casa.id, '2026-02-01', true, undefined]);
  assert.throws(() => R.vincularInquilino(d, casa.id, { contrato_id: c.id, data_entrada: '2026-02-01' }, 'julio'));
  R.encerrarContrato(d, c.id, { data_saida: '2026-09-30', leitura_agua: '0456', leitura_energia: '', leitura_gas: '' }, 'julio');
  assert.equal(d.encerramentos[0].leitura_agua, undefined);
  assert.deepEqual(R.leiturasDoImovel(d, casa.id).map((l) => [l.momento, l.data, l.agua, l.energia]),
    [['Saída do inquilino', '2026-09-30', '0456', ''], ['Entrada do inquilino', '2026-02-01', '0123', '45678']]);
  assert.equal(R.textoLeitura(d.leituras[0]), 'água 0123 · energia 45678');
  // sem leitura informada, nada é gravado
  const y = R.inserir(d, 'contratos', { inquilino_nome: 'Y', data_entrada: '2026-03-01' }, 'julio');
  R.vincularInquilino(d, casa.id, { contrato_id: y.id, data_entrada: '2026-03-01', leitura_agua: '' }, 'julio');
  assert.equal(d.leituras.length, 2);
});

test('ajuste do mês no boleto: adicional ou ressarcimento, com histórico e na descrição', () => {
  const { d } = base();
  R.gerarCobrancas(d, '2026-07', 'julio');
  const cb = d.cobrancas[0];
  const antes = R.totais(cb).a_pagar_pontual;
  R.ajustarBoleto(d, cb.id, -15000, 'Reforma do banheiro', 'julio');
  assert.equal(R.totais(cb).a_pagar_pontual, antes - 15000);
  assert.match(R.dadosBoleto(d, cb).descricao, /REFORMA DO BANHEIRO -RS150,00/);
  assert.match(d.historico.at(-1).descricao, /Ressarcimento de R\$\s?150,00 no boleto 07\/2026: Reforma do banheiro/);
  R.ajustarBoleto(d, cb.id, 5000, 'Conserto', 'julio');
  assert.match(R.dadosBoleto(d, cb).descricao, /CONSERTO RS50,00/);
  R.registrarPagamento(d, cb.id, '2026-08-05', null, 'julio');
  assert.throws(() => R.ajustarBoleto(d, cb.id, 0, '', 'julio'));
});
