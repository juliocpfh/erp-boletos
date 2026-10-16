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
  assert.equal(cb.iptu, 8000); // IPTU também proporcional: 24 de 30 dias de R$ 100,00
  assert.match(cb.iptu_parcela, /proporcional 24\/30 dias/);
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

test('grupos Airbnb antigos viram NF avulsa e as NFs emitidas continuam ligadas', () => {
  const { d } = base();
  const grupo = R.inserir(d, 'imoveis', { tipo: 'airbnb', nome: 'Airbnb', endereco: 'Rua X, 10', cliente_nome: 'AIRBNB PLATAFORMA DIGITAL LTDA' }, 'julio');
  const apto = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto 2', endereco: 'Rua X, 10', complemento: 'Apto 2', grupo_id: grupo.id }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: grupo.id, emitente_id: 1, percentual: 100 }, 'julio');
  R.inserir(d, 'recebimentos', { imovel_id: grupo.id, unidade_id: apto.id, data_pagamento: '2026-08-08', valor: 80000,
    tomador_nome: 'AIRBNB PLATAFORMA DIGITAL LTDA' }, 'julio');
  d.faturas.push({ id: 99, numero: 7, origem_tipo: 'recebimento', origem_id: 1, emitente_id: 1, situacao: 'Emitida', valor: 80000, emissao: '2026-08-08' });
  R.normalizar(d);
  assert.equal(d.imoveis.some((i) => i.tipo === 'airbnb'), false);
  assert.equal(R.buscar(d, 'imoveis', apto.id).grupo_id, undefined);
  assert.equal(d.recebimentos.length, 0);
  const a = d.avulsas[0];
  assert.deepEqual([a.valor, a.imovel_id, a.tomador_endereco, a.partes], [80000, apto.id, 'Rua X, 10, Apto 2', [{ emitente_id: 1, percentual: 100 }]]);
  assert.deepEqual([d.faturas[0].origem_tipo, d.faturas[0].origem_id], ['avulsa', a.id]);
  R.normalizar(d); // de novo: não duplica
  assert.equal(d.avulsas.length, 1);
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
  assert.equal(b.descricao, 'ALUGUEL RS3.644,45\nCOM BONF. RS3.280,00\nIPTU RS91,00 SEGURO3/4 RS56,25 TARIFA RS8,50');
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
  // aplicação: pode ser toda numa empresa; alerta enquanto não aplicar o valor integral
  assert.ok(R.alertasContrato(d, c, '2026-08-01').some((a) => a.tipo === 'Aplicação da garantia'));
  R.inserir(d, 'aplicacoes', { contrato_id: c.id, data: '2025-10-02', emitente_id: 1, valor: 1000000 }, 'julio');
  assert.equal(R.situacaoAplicacao(d, c).falta, 413255);
  assert.match(R.alertasContrato(d, c, '2026-08-01').find((a) => a.tipo === 'Aplicação da garantia').texto, /falta aplicar/);
  R.inserir(d, 'aplicacoes', { contrato_id: c.id, data: '2025-10-02', emitente_id: 1, valor: 413255 }, 'julio');
  assert.ok(R.situacaoAplicacao(d, c).ok);
  assert.ok(!R.alertasContrato(d, c, '2026-08-01').some((a) => a.tipo === 'Aplicação da garantia'));
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

test('atraso de verdade: banco cobra multa e juros no boleto e a NF sai com o valor a mais', () => {
  const { d, c } = base();
  c.reserva_competencia = '2026-07'; // o boleto de junho (1º aluguel) não está no teste: a reserva fica marcada para julho
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.gerarCobrancas(d, '2026-08', 'julio');
  // venceu 10/08, pagou 15/08, entrou na conta 18/08: juros até o dia em que pagou, NF com a data contábil
  const r = R.registrarPagamento(d, 1, '2026-08-18', null, 'julio', { dataPagou: '2026-08-15' });
  const cb = d.cobrancas[0];
  // julho abate a reserva de R$ 500,00: valor cheio 1.453,50 - 500,00 = 953,50; multa 10% e juros 1% a.m. × 5 dias
  assert.deepEqual([cb.dias_atraso, cb.multa, cb.juros, cb.data_pagou], [5, 9535, 155, '2026-08-15']);
  assert.equal(cb.valor_pago, 95350 + 9535 + 155);
  assert.equal(cb.valor_nf, 135000 + 9535 + 155);
  assert.equal(r.pontual, false);
  assert.equal(d.cobrancas[1].iptu, 10000); // nada vai para o boleto seguinte
  assert.equal(R.totais(d.cobrancas[1]).a_pagar_pontual, 135000 - 13500 + 10000 + 350);
  R.numerarFaturas(d, 'julio');
  assert.equal(d.faturas[0].emissao, '2026-08-18');
  assert.throws(() => R.registrarPagamento(d, 2, '2026-09-10', null, 'julio', { dataPagou: '2026-09-12' }));
});

test('pagou em dia com compensação depois: sem multa, NF na data contábil', () => {
  const { d } = base();
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.registrarPagamento(d, 1, '2026-08-12', null, 'julio', { pagouEmDia: true });
  const cb = d.cobrancas[0];
  assert.deepEqual([cb.situacao, cb.multa, cb.pagou_em_dia], ['Paga em dia', 0, true]);
  R.numerarFaturas(d, 'julio');
  assert.equal(d.faturas[0].emissao, '2026-08-12');
});

test('boletos em aberto acompanham mudança de IPTU e de bonificação; alterado à mão fica', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.gerarCobrancas(d, '2026-08', 'julio');
  d.iptus[0].valor_total = 200000;
  R.atualizar(d, 'contratos', c.id, { desconto_pontualidade_percentual: 20 }, 'julio');
  R.atualizar(d, 'cobrancas', 2, { iptu: 1, editado_manual: true }, 'julio');
  assert.equal(R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'julio'), 1);
  assert.deepEqual([d.cobrancas[0].iptu, d.cobrancas[0].desconto], [20000, 27000]);
  assert.equal(d.cobrancas[1].iptu, 1);
});

test('carência: sem aluguel nos meses combinados, cobrando só o escolhido', () => {
  const { d, c } = base();
  Object.assign(c, { carencia_meses: 2, carencia_inicio: '2026-07', carencia_cobrar_iptu: true, reserva_valor: 0 });
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.gerarCobrancas(d, '2026-09', 'julio');
  const [jul, set] = d.cobrancas;
  assert.deepEqual([jul.carencia, jul.aluguel, jul.desconto, jul.iptu, jul.taxa_boleto], [true, 0, 0, 10000, 0]);
  assert.deepEqual([set.carencia, set.aluguel], [false, 135000]);
  c.carencia_cobrar_iptu = false;
  R.recalcularCobrancas(d, () => true, 'julio');
  assert.equal(jul.situacao, 'Carência');
  // pago com valor de NF zero não entra na numeração
  R.registrarPagamento(d, jul.id, '2026-08-01', 0, 'julio');
  assert.equal(R.pendentesDeFatura(d).length, 0);
});

test('inquilino sem NF: controla o pagamento mas não entra na numeração', () => {
  const { d, c } = base();
  c.gerar_nf = false;
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.registrarPagamento(d, 1, '2026-08-20', null, 'julio');
  assert.equal(d.cobrancas[0].situacao, 'Paga com atraso');
  assert.equal(R.numerarFaturas(d, 'julio').numeradas.length, 0);
});

test('voltar a última numeração, incluir pagamento esquecido de data intermediária e numerar de novo', () => {
  const { d } = base();
  d.proxima_fatura = 50;
  for (const comp of ['2026-06', '2026-07', '2026-08', '2026-09']) R.gerarCobrancas(d, comp, 'julio');
  R.registrarPagamento(d, 1, '2026-07-05', null, 'julio');
  R.numerarFaturas(d, 'julio'); // ciclo 1: nº 50
  R.registrarPagamento(d, 2, '2026-08-05', null, 'julio');
  R.registrarPagamento(d, 4, '2026-10-05', null, 'julio');
  d.cobrancas[1].observacoes_nf = 'Obs. de julho';
  R.numerarFaturas(d, 'julio'); // ciclo 2: nº 51 e 52
  assert.deepEqual(R.ultimoCicloDeNumeracao(d), { lote: 2, de: 51, ate: 52, qtd: 2, emissoes: ['2026-08-05', '2026-10-05'] });
  R.desfazerUltimaNumeracao(d, 'julio');
  assert.equal(d.proxima_fatura, 51);
  assert.deepEqual([...new Set(d.faturas.map((f) => f.numero))], [50]);
  // o pagamento de setembro tinha passado despercebido
  R.registrarPagamento(d, 3, '2026-09-05', null, 'julio');
  R.numerarFaturas(d, 'julio');
  const porNumero = (n) => d.faturas.find((f) => f.numero === n);
  assert.deepEqual([51, 52, 53].map((n) => porNumero(n).emissao), ['2026-08-05', '2026-09-05', '2026-10-05']);
  assert.equal(porNumero(51).observacoes, 'Obs. de julho');
  // voltar de novo e depois o ciclo anterior
  R.desfazerUltimaNumeracao(d, 'julio');
  R.desfazerUltimaNumeracao(d, 'julio');
  assert.deepEqual([d.faturas.length, d.proxima_fatura], [0, 50]);
  assert.throws(() => R.desfazerUltimaNumeracao(d, 'julio'));
});

test('cancelar, apagar e desfazer numeração para reemitir com os mesmos números', () => {
  const { d } = base();
  d.proxima_fatura = 10;
  for (const comp of ['2026-06', '2026-07', '2026-08']) R.gerarCobrancas(d, comp, 'julio');
  R.registrarPagamento(d, 1, '2026-07-05', null, 'julio');
  R.registrarPagamento(d, 2, '2026-08-05', null, 'julio');
  R.registrarPagamento(d, 3, '2026-09-05', null, 'julio');
  R.numerarFaturas(d, 'julio');
  R.cancelarNumero(d, 11, 'julio');
  assert.equal(R.pendentesDeFatura(d).length, 1);
  assert.throws(() => R.apagarCanceladas(d, 10, 'julio'));
  R.apagarCanceladas(d, 11, 'julio');
  assert.equal(d.faturas.some((f) => f.numero === 11), false);
  d.cobrancas[0].observacoes_nf = 'Referente ao aluguel de junho';
  R.desfazerNumeracao(d, 10, 'julio');
  assert.deepEqual([d.faturas.length, d.proxima_fatura, R.pendentesDeFatura(d).length], [0, 10, 3]);
  R.numerarFaturas(d, 'julio', { forcar: true });
  assert.deepEqual([...new Set(d.faturas.map((f) => f.numero))], [10, 11, 12]);
  assert.equal(d.faturas[0].observacoes, 'Referente ao aluguel de junho');
});

test('listas editáveis: inclui, não remove o que está em uso e avisa onde', () => {
  const { d, loja, c } = base();
  R.normalizar(d);
  R.incluirNaLista(d, 'concessionarias', 'Compagas', 'julio');
  assert.throws(() => R.incluirNaLista(d, 'concessionarias', 'compagas', 'julio'));
  R.inserir(d, 'titularidades', { imovel_id: loja.id, concessionaria: 'Compagas' }, 'julio');
  assert.throws(() => R.removerDaLista(d, 'concessionarias', 'Compagas', 'julio'), /Loja 1/);
  R.removerDaLista(d, 'concessionarias', 'Supergasbras', 'julio');
  assert.equal(R.lista(d, 'concessionarias').includes('Supergasbras'), false);
  assert.ok(R.lista(d, 'indices').includes('IGP-M/IPCA (o maior)'));
  c.indice_correcao = 'IGP-M/IPCA (o maior)';
  assert.throws(() => R.removerDaLista(d, 'indices', 'IGP-M/IPCA (o maior)', 'julio'), /Maria Exemplo/);
});

test('mesmo inquilino em dois imóveis: contrato novo só com os dados da pessoa; continuação traz as condições', () => {
  const { d, c } = base();
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 2', endereco: 'Rua B' }, 'julio');
  Object.assign(c, { prazo_tipo: 'Determinado', prazo_meses: 30 });
  assert.throws(() => R.vincularInquilino(d, casa.id, { contrato_id: c.id, data_entrada: '2026-09-01' }, 'julio'), /contrato novo/);
  const pessoa = R.dadosDaPessoa(c);
  assert.equal(pessoa.inquilino_cpf, c.inquilino_cpf);
  for (const k of ['aluguel_inicial', 'prazo_meses', 'dia_vencimento', 'indice_correcao', 'garantia_tipo']) assert.equal(pessoa[k], undefined, `${k} não vem`);
  const novo = R.inserir(d, 'contratos', { ...pessoa, imovel_id: casa.id, data_entrada: '2026-09-01', aluguel_inicial: 200000, dia_vencimento: 5 }, 'julio');
  assert.deepEqual(R.outrosContratosDaPessoa(d, novo, '2026-09-10').map((x) => x.id), [c.id]);
  c.conta_agua = 'Incluso no aluguel';
  const cond = R.condicoesDoContrato(d, c);
  assert.deepEqual([cond.conta_agua, cond.prazo_meses, cond.aluguel_inicial, cond.inquilino_nome], ['Incluso no aluguel', 30, R.aluguelAtual(d, c), undefined]);
});

test('saída lembra a titularidade até registrar a volta para o proprietário', () => {
  const { d, c, loja } = base();
  R.encerrarContrato(d, c.id, { data_saida: '2026-09-30' }, 'julio');
  assert.ok(R.todosAlertas(d, '2026-10-05').some((a) => a.tipo === 'Titularidade'));
  R.inserir(d, 'titularidades', { imovel_id: loja.id, contrato_id: c.id, concessionaria: 'Copel', tipo: 'Volta para o proprietário', data: '2026-10-02' }, 'julio');
  assert.ok(!R.todosAlertas(d, '2026-10-05').some((a) => a.tipo === 'Titularidade'));
});

test('IPTU: parcelas de imóvel vazio ficam com o proprietário, com alerta até marcar paga', () => {
  const { d, c } = base();
  const p = d.iptus[0];
  p.vencimento_primeira = '2026-02-15';
  const ps = R.parcelasIptu(d, p);
  // Maria entra em 07/06: fevereiro a maio é do proprietário; junho dividido (24/30 dias dela); julho em diante no boleto
  assert.deepEqual(ps.map((x) => x.proprietario), [true, true, true, true, true, false, false, false, false, false]);
  assert.equal(ps[4].inquilino.id, c.id);
  assert.deepEqual([ps[4].valorInquilino, ps[4].valorProprietario], [8000, 2000]);
  assert.deepEqual(R.totaisIptu(d, p), { custo: 100000, inquilino: 58000, proprietario: 42000, emAberto: 42000 });
  const alertas = R.alertasIptu(d, '2026-05-05');
  assert.equal(alertas.filter((a) => a.nivel === 'perigo').length, 3);
  assert.equal(alertas.filter((a) => a.nivel === 'aviso').length, 1);
  R.marcarIptuPago(d, p.id, 4, '2026-05-10', 'julio');
  assert.equal(R.alertasIptu(d, '2026-05-05').filter((a) => a.nivel === 'aviso').length, 0);
  // quitado à vista com desconto: o inquilino paga 1/12 do valor PARCELADO por mês ocupado (a diferença fica com o proprietário)
  Object.assign(p, { pago_avista: true, valor_avista: 90000, cobranca_inquilino: R.COBRANCA_IPTU_QUITADO[1] });
  assert.deepEqual(R.iptuNaCompetencia(p, '2026-11'), [11, 8333]);
  assert.equal(R.parcelasIptu(d, p)[0].valor, 90000); // custo do proprietário: o valor à vista
  assert.deepEqual(R.iptuNaCompetencia(p, '2027-01'), [null, 0]);
  assert.equal(R.alertasIptu(d, '2026-02-10').length, 1);
  R.marcarIptuPago(d, p.id, 0, '2026-02-10', 'julio');
  assert.equal(R.alertasIptu(d, '2026-02-10').length, 0);
});

test('fiador com fim de vínculo vai para anteriores e gera alerta antes de terminar', () => {
  const d = R.bancoVazio();
  const c = R.inserir(d, 'contratos', { imovel_id: 1, inquilino_nome: 'X', data_entrada: '2026-01-01', garantia_tipo: 'Fiador', aluguel_inicial: 100000 }, 'julio');
  R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'F', data_entrada: '2026-01-01', data_saida: '2026-12-31' }, 'julio');
  assert.equal(R.fiadoresDo(d, c.id, '2026-11-15').length, 1);
  assert.ok(R.alertasContrato(d, c, '2026-11-15').some((a) => a.tipo === 'Fiador'));
  assert.equal(R.fiadoresDo(d, c.id, '2027-01-02').length, 0);
  assert.equal(R.fiadoresAnterioresDo(d, c.id, '2027-01-02').length, 1);
});

test('excluir renovação apaga o novo valor negociado', () => {
  const { d, c } = base();
  const r = R.registrarRenovacao(d, c.id, { data: '2027-06-07', tipo: 'Novo valor negociado', novo_valor: 150000 }, 'julio');
  assert.equal(R.aluguelAtual(d, c, '2027-07-01'), 150000);
  R.excluirRenovacao(d, r.id, 'julio');
  assert.equal(R.aluguelAtual(d, c, '2027-07-01'), 135000);
  assert.equal(d.renovacoes.length, 0);
});

test('resultados: retorno sobre valor do imóvel + reformas', () => {
  const { d, loja } = base();
  loja.valor_imovel = 30000000;
  R.inserir(d, 'reformas', { imovel_id: loja.id, data: '2026-01-10', descricao: 'Telhado', valor: 6000000 }, 'julio');
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.registrarPagamento(d, 1, '2026-08-05', null, 'julio');
  const [r] = R.resultadosFinanceiros(d, '2026-08-01', '2026-08-31');
  assert.deepEqual([r.aluguel, r.base, r.meses], [121500, 36000000, 1]);
  assert.equal(Math.round(r.retornoAnual * 100), 405); // 1215 × 12 ÷ 360.000 = 4,05% ao ano
});

test('reserva marcada para mês passado sai dos alertas', async () => {
  const A = await import('../docs/js/alertas.js');
  assert.equal(A.alertaReserva(50000, 50000, '2026-03', '2026-10-13'), null);
  assert.ok(A.alertaReserva(50000, 50000, '2026-09', '2026-10-13'));
});

test('IPTU pelo mês de vencimento do boleto: cada contrato acha o seu mês de uso', () => {
  const { d, c } = base();
  const p = d.iptus[0];
  Object.assign(p, { primeira_competencia: null, primeiro_vencimento_boleto: '2026-07', vencimento_primeira: '2026-07-20' });
  // Maria paga no mês seguinte ao de uso: a 1ª parcela entra no aluguel de junho (boleto vence em julho)
  assert.equal(R.competenciaDaParcela(p, 1, c), '2026-06');
  assert.equal(R.competenciaDaParcela(p, 3, { cobranca_mes_seguinte: false }), '2026-09');
  R.gerarCobrancas(d, '2026-06', 'julio');
  const cb = d.cobrancas[0];
  assert.equal(cb.vencimento.slice(0, 7), '2026-07');
  assert.equal(cb.iptu, 8000); // 1ª parcela, proporcional aos 24 dias de junho
  assert.equal(R.parcelasIptu(d, p)[0].mesBoleto, '2026-07');
});

test('documentos de entrada: alerta para todo inquilino ativo, até marcar os três com o arquivo assinado', () => {
  const { d, c } = base();
  assert.match(R.alertaDocumentosEntrada(c).texto, /contrato de locação, vistoria de entrada, recibo de entrega das chaves/, 'inquilino antigo também gera alerta');
  assert.throws(() => R.marcarDocumento(d, c.id, 'doc_contrato_em', '2026-09-04', 'julio'), /Anexe o arquivo do contrato de locação assinado/);
  assert.throws(() => R.marcarDocumento(d, c.id, 'doc_vistoria_em', '2026-09-04', 'julio'), /Anexe o arquivo da vistoria de entrada assinada/);
  R.marcarDocumento(d, c.id, 'doc_contrato_em', '2026-09-04', 'julio', 'contrato-assinado.pdf');
  R.marcarDocumento(d, c.id, 'doc_vistoria_em', '2026-09-04', 'julio', 'vistoria-assinada.pdf');
  assert.equal(c.doc_contrato_arquivo, 'contrato-assinado.pdf');
  assert.match(R.alertaDocumentosEntrada(c).texto, /^falta recibo de entrega das chaves/);
  R.marcarDocumento(d, c.id, 'doc_chaves_em', '2026-09-05', 'julio', 'chaves.jpg');
  assert.equal(R.alertaDocumentosEntrada(c), null);
  R.marcarDocumento(d, c.id, 'doc_chaves_em', null, 'julio');
  assert.equal(c.doc_chaves_arquivo, null, 'desfazer limpa o arquivo');
  c.data_saida = '2026-09-30';
  assert.equal(R.alertaDocumentosEntrada(c), null, 'quem saiu não gera alerta');
  assert.throws(() => R.marcarDocumento(d, c.id, 'outro', '2026-09-05', 'julio'), /desconhecido/);
  c.data_saida = null;
  R.marcarDocumentoPerdido(d, c.id, 'doc_chaves_em', '2026-10-15', 'julio');
  assert.equal(R.documentoPerdido(d, c, 'doc_chaves_em'), '2026-10-15');
  assert.equal(R.alertaDocumentosEntrada(c), null, 'documento perdido não gera alerta');
  R.marcarDocumento(d, c.id, 'doc_chaves_em', '2026-10-16', 'julio', 'chaves.jpg');
  assert.equal(R.documentoPerdido(d, c, 'doc_chaves_em'), null, 'assinar limpa o "perdido"');
  R.marcarDocumento(d, c.id, 'doc_chaves_em', null, 'julio');
});

test('contas pagas por nós abatem do resultado do imóvel', () => {
  const { d, loja } = base();
  const c = d.contratos[0];
  assert.equal(R.contasPorNossaConta(d, loja.id, '2026-07-01').vago, false);
  c.conta_agua = 'Incluso no aluguel';
  assert.deepEqual(R.contasPorNossaConta(d, loja.id, '2026-07-01').inclusas, ['Água']);
  assert.throws(() => R.lancarDespesas(d, loja.id, '2026-07', [{ tipo: 'Água', valor: 0 }], 'julio'), /pelo menos uma/);
  R.lancarDespesas(d, loja.id, '2026-07', [{ tipo: 'Água', valor: 8540, data_pagamento: '2026-07-10' }, { tipo: 'Condomínio', valor: 45000, data_pagamento: '2026-07-10' }, { tipo: 'Luz', valor: 0 }], 'julio');
  assert.equal(d.despesas.length, 2);
  assert.equal(R.ultimosValores(d, loja.id)['Condomínio'].valor, 45000);
  const r = R.resultadosFinanceiros(d, '2026-07-01', '2026-07-31').find((x) => x.imovel.id === loja.id);
  assert.equal(r.contas, 53540);
  assert.equal(r.resultado, r.receita - r.iptu - 53540);
  const fora = R.resultadosFinanceiros(d, '2026-08-01', '2026-08-31').find((x) => x.imovel.id === loja.id);
  assert.equal(fora.contas, 0, 'conta entra pela data do pagamento');
});

test('contas nossas: imóvel vago, até 2 meses depois de alugar, depois só as incluídas no contrato', () => {
  const { d, loja } = base(); // inquilino entrou em 07/06/2026
  const c = d.contratos[0];
  assert.equal(R.contasPermitidas(d, loja.id, '2026-05').motivo, 'vago');
  assert.equal(R.contasPermitidas(d, loja.id, '2026-06').motivo, 'vago', 'vago até o dia 6');
  assert.equal(R.contasPermitidas(d, loja.id, '2026-07').motivo, 'alugou');
  assert.equal(R.contasPermitidas(d, loja.id, '2026-08').motivo, 'alugou');
  const set = R.contasPermitidas(d, loja.id, '2026-09');
  assert.deepEqual([set.motivo, set.tipos], ['inquilino', []]);
  c.conta_condominio = 'Incluso no aluguel';
  assert.deepEqual(R.contasPermitidas(d, loja.id, '2026-09').tipos, ['Condomínio']);
  assert.throws(() => R.lancarDespesas(d, loja.id, '2026-09', [{ tipo: 'Água', valor: 5000 }], 'julio'), /inquilino paga Água/);
  R.lancarDespesas(d, loja.id, '2026-09', [{ tipo: 'Condomínio', valor: 45000 }], 'julio');
  c.data_saida = '2026-11-15';
  assert.equal(R.contasPermitidas(d, loja.id, '2026-11').motivo, 'vago', 'mês da saída');
});

test('fechamento do mês, baixa em lote e condições do inquilino anterior', () => {
  const { d, loja, c } = base(); // entrada 07/06/2026, vencimento no mês seguinte
  R.gerarCobrancas(d, '2026-07', 'julio');
  let et = R.etapasFechamento(d, '2026-08', '2026-08-20');
  const por = (k) => et.find((e) => e.chave === k);
  assert.equal(por('boletos').feito, true);
  assert.equal(por('pagamentos').pendentes, 1);
  const cb = d.cobrancas.find((x) => x.competencia === '2026-07');
  const r = R.baixarEmLote(d, [cb.id, cb.id], '2026-08-10', 'julio');
  assert.equal(r.feitos.length, 1);
  assert.equal(r.pulados.length, 1, 'o segundo já estava pago');
  assert.equal(R.buscar(d, 'cobrancas', cb.id).multa, 0);
  et = R.etapasFechamento(d, '2026-08', '2026-08-20');
  assert.equal(et.find((e) => e.chave === 'pagamentos').feito, true);
  R.marcarEtapaFechamento(d, '2026-08', 'contas', true, 'julio');
  assert.equal(R.etapasFechamento(d, '2026-08', '2026-08-20').find((e) => e.chave === 'contas').feito, true);
  const ev = R.eventosDoMes(d, '2026-08', '2026-08-20').find((e) => e.tipo === 'Fechamento');
  assert.equal(ev.data, '2026-08-31');
  assert.equal(R.ultimoContratoDoImovel(d, loja.id).id, c.id);
});

test('reserva: começa no aluguel marcado, nunca pula para um mês depois, e muda de mês ao recalcular', () => {
  const novo = (comp) => {
    const d = R.bancoVazio();
    const i = R.inserir(d, 'imoveis', { nome: 'Casa' }, 'j');
    const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'X', data_entrada: '2026-08-01', vigencia_inicio: '2026-08-01', aluguel_inicial: 200000,
      dia_vencimento: 10, reserva_valor: 50000, reserva_competencia: comp }, 'j');
    return { d, c };
  };
  // agosto (mês marcado) fora do sistema: outubro não pega a reserva, e aparece o aviso
  let { d, c } = novo('2026-08');
  R.gerarCobrancas(d, '2026-10', 'j');
  assert.equal(d.cobrancas[0].reserva_utilizada, 0);
  assert.match(R.alertaReservaParada(d, c).texto, /08\/2026 não foi usada: o boleto de 08\/2026 não está no sistema/);
  // muda o mês marcado para outubro: o recálculo aplica
  c.reserva_competencia = '2026-10';
  R.recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, 'j');
  assert.equal(d.cobrancas[0].reserva_utilizada, 50000);
  assert.equal(R.alertaReservaParada(d, c), null);
  // setembro e outubro em aberto: trocar de outubro para setembro move a reserva, mesmo recalculando só um mês
  ({ d, c } = novo('2026-10'));
  R.gerarCobrancas(d, '2026-09', 'j');
  R.gerarCobrancas(d, '2026-10', 'j');
  c.reserva_competencia = '2026-09';
  R.recalcularCobrancas(d, (cb) => cb.competencia === '2026-10', 'j');
  assert.deepEqual(d.cobrancas.map((x) => [x.competencia, x.reserva_utilizada]), [['2026-09', 50000], ['2026-10', 0]]);
  // reserva maior que o boleto: o que sobra segue para o mês seguinte
  ({ d, c } = novo('2026-09'));
  c.reserva_valor = 300000;
  R.gerarCobrancas(d, '2026-09', 'j');
  R.gerarCobrancas(d, '2026-10', 'j');
  const [set, out] = d.cobrancas;
  assert.equal(set.reserva_utilizada + out.reserva_utilizada, 300000);
  assert.ok(out.reserva_utilizada > 0);
  // boleto do mês marcado já pago sem a reserva: ela fica parada, com aviso
  ({ d, c } = novo('2026-09'));
  R.gerarCobrancas(d, '2026-09', 'j');
  d.cobrancas[0].reserva_utilizada = 0;
  R.registrarPagamento(d, d.cobrancas[0].id, '2026-10-10', null, 'j', { pagouEmDia: true });
  R.gerarCobrancas(d, '2026-10', 'j');
  assert.equal(d.cobrancas[1].reserva_utilizada, 0);
  assert.match(R.alertaReservaParada(d, c).texto, /já foi pago sem ela/);
});

test('reserva presa num boleto mais novo: sai ao gerar o mês certo, também de boleto alterado à mão; boleto pago só avisa', () => {
  const novo = () => {
    const d = R.bancoVazio();
    const i = R.inserir(d, 'imoveis', { nome: 'Casa' }, 'j');
    const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'X', data_entrada: '2026-08-01', vigencia_inicio: '2026-08-01', aluguel_inicial: 200000,
      dia_vencimento: 10, reserva_valor: 50000, reserva_competencia: '2026-08' }, 'j');
    R.gerarCobrancas(d, '2026-10', 'j');
    d.cobrancas[0].reserva_utilizada = 50000; // ficou em outubro (versão antiga)
    return { d, c };
  };
  let { d, c } = novo();
  d.cobrancas[0].editado_manual = true;
  R.gerarCobrancas(d, '2026-08', 'j');
  assert.deepEqual(d.cobrancas.map((x) => [x.competencia, x.reserva_utilizada]), [['2026-10', 0], ['2026-08', 50000]]);
  assert.equal(d.cobrancas[0].editado_manual, true, 'os outros valores digitados à mão ficam');
  ({ d, c } = novo());
  R.gerarCobrancas(d, '2026-08', 'j');
  d.cobrancas[0].reserva_utilizada = 50000; d.cobrancas[1].reserva_utilizada = 0;
  assert.equal(R.realocarReserva(d, c, 'j'), 2);
  assert.deepEqual(d.cobrancas.map((x) => x.reserva_utilizada), [0, 50000]);
  ({ d, c } = novo());
  R.registrarPagamento(d, d.cobrancas[0].id, '2026-11-10', null, 'j', { pagouEmDia: true });
  R.gerarCobrancas(d, '2026-08', 'j');
  assert.equal(d.cobrancas[0].reserva_utilizada, 50000, 'boleto pago não muda');
  assert.match(R.alertaReservaParada(d, c).texto, /está no boleto de 10\/2026, que já foi pago, mas deveria abater o de 08\/2026/);
});

test('ressarcimento de taxa do condomínio: abate no boleto do mês seguinte ao pagamento, gasto nos resultados ou fora da NF', () => {
  const { d, loja, c } = base(); // vencimento dia 10 do mês seguinte à competência
  c.conta_condominio = 'Por conta do inquilino';
  c.reserva_valor = 0;
  // inquilino pagou o condomínio de julho (com fundo de obras) em 05/08: abate no boleto que vence em setembro = competência 08
  assert.equal(R.competenciaDoAbatimento(c, '2026-08-05'), '2026-08');
  R.gerarCobrancas(d, '2026-08', 'julio');
  R.inserir(d, 'ressarcimentos', { contrato_id: c.id, competencia_condominio: '2026-07', descricao: 'Fundo de obras', valor: 15000, data_pagamento: '2026-08-05', competencia_abatimento: '2026-08' }, 'julio');
  const cb = R.aplicarRessarcimentos(d, c, '2026-08', 'julio');
  const t = R.totais(cb);
  assert.equal(cb.ressarcimento, 15000);
  assert.equal(t.a_pagar_pontual, 135000 - 13500 + 10000 + 350 - 15000);
  assert.match(R.dadosBoleto(d, cb).descricao, /RESSARCIMENTO CONDOMÍNIO -RS150,00/);
  // NF com o aluguel cheio; o ressarcimento conta como gasto
  R.registrarPagamento(d, cb.id, '2026-09-10', null, 'julio', { pagouEmDia: true });
  assert.equal(cb.valor_nf, 135000 - 13500);
  const res = R.resultadosFinanceiros(d, '2026-09-01', '2026-09-30').find((x) => x.imovel.id === loja.id);
  assert.equal(res.contas, 15000);
  // opção: sai da NF (e não conta de novo como gasto)
  d.ressarcimento_abate_nf = true;
  R.gerarCobrancas(d, '2026-09', 'julio');
  R.inserir(d, 'ressarcimentos', { contrato_id: c.id, competencia_condominio: '2026-08', descricao: 'Fundo de obras', valor: 15000, data_pagamento: '2026-09-05', competencia_abatimento: '2026-09' }, 'julio');
  const cb2 = R.aplicarRessarcimentos(d, c, '2026-09', 'julio');
  R.registrarPagamento(d, cb2.id, '2026-10-10', null, 'julio', { pagouEmDia: true });
  assert.equal(cb2.valor_nf, 135000 - 13500 - 15000);
  assert.equal(R.resultadosFinanceiros(d, '2026-10-01', '2026-10-31').find((x) => x.imovel.id === loja.id).contas, 0);
  // alerta mensal para conferir o condomínio
  assert.match(R.alertaCondominio(c, '2026-11-03').texto, /condomínio de 10\/2026/);
  R.marcarCondominioConferido(d, c.id, '2026-10', 'julio');
  assert.equal(R.alertaCondominio(c, '2026-11-03'), null);
  assert.equal(R.alertaCondominio({ ...c, conta_condominio: 'Não tem' }, '2026-11-03'), null);
});

test('reajuste: o mês de entrada conta como 1º mês, qualquer que seja o dia; o aluguel do 13º mês vem corrigido', () => {
  for (const entrada of ['2025-01-01', '2025-01-15', '2025-01-30']) {
    const d = R.bancoVazio();
    const c = R.inserir(d, 'contratos', { inquilino_nome: 'X', data_entrada: entrada, vigencia_inicio: entrada, aluguel_inicial: 100000, dia_vencimento: 10 }, 'j');
    assert.equal(R.mesDeAniversario(c), '2025-01', entrada);
    assert.equal(R.competenciaDoReajuste(c, 1), '2026-01', entrada);
    assert.equal(R.competenciaDoReajuste(c, 2), '2027-01');
    assert.ok(R.reajusteNaCompetencia(d, c, '2026-01'));
    assert.equal(R.reajusteNaCompetencia(d, c, '2026-02'), null);
    // aviso em dezembro: a carta vai com o boleto de 12/2025; o boleto do aluguel de 01/2026 vence em 10/02/2026, já corrigido
    assert.equal(R.reajustePendente(d, c, '2025-12-05').competencia, '2026-01');
    assert.equal(R.reajustePendente(d, c, '2025-11-05'), null);
  }
});

test('reajuste: correção feita pela regra antiga (mês seguinte) não vira reajuste atrasado', () => {
  const d = R.bancoVazio();
  const c = R.inserir(d, 'contratos', { inquilino_nome: 'X', data_entrada: '2025-01-15', vigencia_inicio: '2025-01-15', aluguel_inicial: 100000, dia_vencimento: 10 }, 'j');
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-02-01', valor_novo: 105000, indice: 'IPCA' }, 'j');
  assert.ok(R.reajusteNaCompetencia(d, c, '2026-01').corrigido);
  assert.equal(R.reajustePendente(d, c, '2026-03-05'), null);
});

test('reajustes não corrigidos: some depois de corrigido e o atrasado aparece mesmo antes do período', () => {
  const d = R.bancoVazio();
  const i = R.inserir(d, 'imoveis', { nome: 'Casa', endereco: 'Rua A, 1' }, 'j');
  const a = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ana', data_entrada: '2025-03-10', vigencia_inicio: '2025-03-10', aluguel_inicial: 100000, dia_vencimento: 10 }, 'j');
  const b = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Bia', data_entrada: '2025-11-10', vigencia_inicio: '2025-11-10', aluguel_inicial: 100000, dia_vencimento: 10 }, 'j');
  // hoje 05/10/2026: Ana devia ter sido corrigida no aluguel de 03/2026 (fora do período 08/2026 a 01/2027); Bia corrige em 11/2026
  const nomes = () => R.reajustesNaoCorrigidos(d, '2026-08', '2027-01', '2026-10-05').map((r) => `${r.contrato.inquilino_nome} ${r.competencia}`);
  assert.deepEqual(nomes(), ['Ana 2026-03', 'Bia 2026-11']);
  R.inserir(d, 'correcoes', { contrato_id: b.id, data_vigencia: '2026-11-01', valor_novo: 105000, indice: 'IPCA' }, 'j');
  assert.deepEqual(nomes(), ['Ana 2026-03']);
  R.inserir(d, 'correcoes', { contrato_id: a.id, data_vigencia: '2026-03-01', valor_novo: 105000, indice: 'IPCA' }, 'j');
  assert.deepEqual(nomes(), []);
});

test('imóveis do mesmo endereço ficam juntos, mesmo fora da ordem alfabética', () => {
  const lista = [
    { id: 1, nome: 'Casa Azul', endereco: 'Rua B, 20' },
    { id: 2, nome: 'Apto 101', endereco: 'Rua C, 30', complemento: 'Apto 101' },
    { id: 3, nome: 'Zeta 202', endereco: 'Rua C,  30', complemento: 'Apto 202' },
    { id: 4, nome: 'Bloco', endereco: 'Rua D, 40' },
  ];
  assert.deepEqual(R.imoveisPorEndereco(lista).map((i) => i.nome), ['Apto 101', 'Zeta 202', 'Bloco', 'Casa Azul']);
});

test('resumo das solicitações por situação (sem situação conta como aberta)', () => {
  const d = R.bancoVazio();
  for (const situacao of ['Aberta', undefined, 'Em andamento', 'Concluída', 'Concluída', 'Não atendida']) d.solicitacoes.push({ situacao });
  assert.deepEqual(R.resumoSolicitacoes(d), { Aberta: 2, 'Em andamento': 1, Concluída: 2, 'Não atendida': 1 });
});

test('termo aditivo: exige data, assunto e arquivo; marca o contrato com "possui termo aditivo"', () => {
  const { d, c } = base();
  assert.throws(() => R.registrarAditivo(d, c.id, { data: '2026-10-15', assunto: 'Troca do vencimento' }, 'julio'), /Anexe o arquivo/);
  assert.throws(() => R.registrarAditivo(d, c.id, { data: '2026-10-15', assunto: ' ', arquivo: 'a.pdf' }, 'julio'), /assunto/);
  R.registrarAditivo(d, c.id, { data: '2026-09-01', assunto: 'Troca da garantia', arquivo: 'a.pdf' }, 'julio');
  R.registrarAditivo(d, c.id, { data: '2026-10-15', assunto: 'Troca do vencimento', arquivo: 'b.pdf' }, 'julio');
  assert.equal(c.possui_aditivos, true);
  assert.deepEqual(R.aditivosDo(d, c.id).map((a) => a.arquivo), ['b.pdf', 'a.pdf']);
});

test('documentos de entrada: quem continua o contrato de outro herda os documentos assinados e vê os aditivos anteriores', () => {
  const { d, c } = base();
  R.marcarDocumento(d, c.id, 'doc_contrato_em', '2025-01-10', 'julio', 'contrato.pdf');
  R.marcarDocumento(d, c.id, 'doc_vistoria_em', '2025-01-10', 'julio', 'vistoria.pdf');
  R.registrarAditivo(d, c.id, { data: '2025-06-01', assunto: 'Troca do vencimento', arquivo: 'ad1.pdf' }, 'julio');
  R.registrarAditivo(d, c.id, { data: '2025-09-01', assunto: 'Troca da garantia', arquivo: 'ad2.pdf' }, 'julio');
  const { id, ...resto } = c;
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Novo Titular', contrato_anterior_id: c.id,
    doc_contrato_em: null, doc_contrato_arquivo: null, doc_vistoria_em: null, doc_vistoria_arquivo: null, doc_chaves_em: null }, 'julio');
  const h = R.documentoEntrada(d, novo, 'doc_contrato_em');
  assert.equal(h.contrato.id, c.id);
  assert.equal(h.arquivo, 'contrato.pdf');
  assert.match(R.alertaDocumentosEntrada(novo, d).texto, /^falta recibo de entrega das chaves\.$/, 'só falta o que o anterior também não tinha');
  R.marcarDocumento(d, c.id, 'doc_chaves_em', '2025-01-11', 'julio', 'chaves.pdf');
  assert.equal(R.documentoEntrada(d, novo, 'doc_chaves_em').arquivo, 'chaves.pdf', 'o recibo das chaves também é herdado');
  assert.equal(R.alertaDocumentosEntrada(novo, d), null);
  R.marcarDocumento(d, novo.id, 'doc_vistoria_em', '2026-10-15', 'julio', 'vistoria-nova.pdf');
  assert.equal(R.documentoEntrada(d, novo, 'doc_vistoria_em').contrato.id, novo.id, 'o documento próprio vale mais que o herdado');
  assert.equal(R.aditivosDo(d, R.cadeiaDeContratos(d, novo).antes[0].id).length, 2, 'mais de um aditivo no histórico');
});

test('aparência dos alertas: padrão do sistema, escolha do usuário e ordem pela prioridade', () => {
  const { d } = base();
  assert.deepEqual(R.estiloAlerta(d, 'Vigência do contrato'), { cor: 'Vermelho', enfase: 'Forte', prioridade: 1 });
  assert.deepEqual(R.estiloAlerta(d, 'Fiador'), { cor: 'Padrão', enfase: 'Normal', prioridade: 3 });
  R.salvarEstilosAlertas(d, { Fiador: { cor: 'Roxo', enfase: 'Forte', prioridade: '1' }, 'Vigência do contrato': { cor: 'Vermelho', enfase: 'Forte', prioridade: 1 } }, 'julio');
  assert.deepEqual(d.estilos_alertas, { Fiador: { cor: 'Roxo', enfase: 'Forte', prioridade: 1 } }, 'só guarda o que mudou');
  assert.deepEqual(R.estiloAlerta(d, 'Fiador'), { cor: 'Roxo', enfase: 'Forte', prioridade: 1 });
  assert.throws(() => R.salvarEstilosAlertas(d, { Fiador: { cor: 'Rosa', enfase: 'Forte', prioridade: 1 } }, 'julio'), /Confira/);
  R.salvarEstilosAlertas(d, {}, 'julio');
  assert.deepEqual(d.estilos_alertas, {});
});

test('reajuste com caução: boleto separado do complemento, sem tarifa e sem NF, corrige a caução ao pagar', () => {
  const d = R.bancoVazio();
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 2', endereco: 'Rua Teste, 10', cidade: 'Curitiba' }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Joana Teste', inquilino_cpf: '529.982.247-25',
    data_entrada: '2025-03-01', vigencia_inicio: '2025-03-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, taxa_boleto: 850, multa_percentual: 10, juros_mensal_percentual: 1,
    garantia_tipo: 'Caução', caucao_valor: 540000, caucao_data: '2025-03-01', caucao_meses: 3 }, 'julio');
  // aluguel R$ 2.000,00 → R$ 2.100,00 (5%); bonificado R$ 1.890,00; caução 3 × 1.890 = R$ 5.670,00
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-03-01', indice: 'IGP-M', percentual: 5, valor_anterior: 200000, valor_novo: 210000 }, 'julio');
  const x = R.complementoCaucao(d, c);
  assert.equal(x.necessaria, 567000);
  assert.equal(x.complemento, 27000);
  assert.match(R.alertasContrato(d, c, '2026-03-05').find((a) => a.tipo === 'Correção da caução').texto, /boleto do complemento de R\$ 270,00/);
  const cb = R.gerarBoletoCaucao(d, c.id, 'julio');
  assert.equal(cb.vencimento, '2026-04-10');
  assert.equal(cb.taxa_boleto, 0);
  assert.equal(R.totais(cb).a_pagar_pontual, 27000);
  assert.match(R.dadosBoleto(d, cb).descricao, /COMPLEMENTO DA CAUÇÃO RS270,00/);
  assert.throws(() => R.gerarBoletoCaucao(d, c.id, 'julio'), /já foi gerado/);
  // o boleto do aluguel do mês continua sendo gerado normalmente
  assert.deepEqual(R.gerarCobrancas(d, '2026-03', 'julio'), { geradas: 1, existentes: 0 });
  assert.equal(R.boletoDoMes(d, c.id, '2026-03').aluguel, 210000);
  // pago: sem NF e a caução passa a R$ 5.670,00
  R.registrarPagamento(d, cb.id, '2026-04-08', null, 'julio');
  assert.equal(cb.valor_nf, 0);
  assert.ok(!R.pendentesDeFatura(d).some((p) => p.registro.id === cb.id));
  assert.equal(R.valorGarantia(d, c), 567000);
  assert.equal(R.complementoCaucao(d, c), null);
  // desfazer o pagamento desfaz a correção da caução
  R.estornarPagamento(d, cb.id, 'julio');
  assert.equal(R.valorGarantia(d, c), 540000);
});

test('complemento da caução sai junto ao gerar os boletos do mês e não esconde o boleto do aluguel', () => {
  const d = R.bancoVazio();
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 3', endereco: 'Rua Teste, 20', cidade: 'Curitiba' }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Joana Teste', inquilino_cpf: '529.982.247-25',
    data_entrada: '2025-03-01', vigencia_inicio: '2025-03-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, taxa_boleto: 850, garantia_tipo: 'Caução', caucao_valor: 540000, caucao_data: '2025-03-01', caucao_meses: 3 }, 'julio');
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-03-01', indice: 'IGP-M', percentual: 5, valor_anterior: 200000, valor_novo: 210000 }, 'julio');
  // fevereiro ainda não tem o aluguel corrigido: só o boleto do aluguel
  assert.deepEqual(R.gerarCobrancas(d, '2026-02', 'julio'), { geradas: 1, existentes: 0 });
  assert.equal(R.complementosCaucaoPendentes(d, '2026-02').length, 0);
  assert.equal(R.complementosCaucaoPendentes(d, '2026-03').length, 1);
  // março: aluguel corrigido + complemento da caução
  assert.deepEqual(R.gerarCobrancas(d, '2026-03', 'julio'), { geradas: 2, existentes: 0 });
  const doMes = d.cobrancas.filter((x) => x.competencia === '2026-03');
  assert.equal(doMes.filter(R.ehComplementoCaucao).length, 1);
  assert.equal(doMes.find(R.ehComplementoCaucao).caucao_complemento, 27000);
  assert.equal(R.complementosCaucaoPendentes(d, '2026-03').length, 0);
  assert.deepEqual(R.gerarCobrancas(d, '2026-03', 'julio'), { geradas: 0, existentes: 1 });
});

test('impostos: PIS/COFINS mensal e IRPJ/CSLL do trimestre acumulando mês a mês; valor do contador ao lado', () => {
  const d = R.bancoVazio();
  const e = R.inserir(d, 'emitentes', { nome: 'EMPRESA TESTE', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  const nf = (numero, emissao, valor, situacao = 'Emitida') => R.inserir(d, 'faturas', { numero, emissao, emitente_id: e.id, valor, situacao }, 'j');
  nf(1, '2026-04-10', 1000000); // abril R$ 10.000,00
  nf(2, '2026-05-10', 2000000); // maio R$ 20.000,00
  nf(3, '2026-05-20', 500000, 'Cancelada'); // cancelada não entra
  nf(4, '2026-06-10', 1000000); // junho R$ 10.000,00
  nf(5, '2026-07-10', 1000000); // julho: 3º trimestre
  const g = (comp) => Object.fromEntries(R.impostosDoMes(d, comp)[0].guias.map((x) => [x.imposto, [x.periodo, x.base, x.esperado]]));
  assert.deepEqual(g('2026-04'), { 'PIS/COFINS': ['2026-04', 1000000, 36500], IRPJ: ['2026-T2', 1000000, 48000], CSLL: ['2026-T2', 1000000, 28800] });
  assert.deepEqual(g('2026-05'), { 'PIS/COFINS': ['2026-05', 2000000, 73000], IRPJ: ['2026-T2', 3000000, 144000], CSLL: ['2026-T2', 3000000, 86400] });
  assert.deepEqual(g('2026-06'), { 'PIS/COFINS': ['2026-06', 1000000, 36500], IRPJ: ['2026-T2', 4000000, 192000], CSLL: ['2026-T2', 4000000, 115200] });
  assert.deepEqual(g('2026-07').IRPJ, ['2026-T3', 1000000, 48000]);
  R.salvarGuiaImposto(d, e.id, 'IRPJ', '2026-T2', 191950, 'j');
  assert.equal(R.impostosDoMes(d, '2026-06')[0].guias[1].contador.valor, 191950);
  R.salvarGuiaImposto(d, e.id, 'IRPJ', '2026-T2', null, 'j');
  assert.equal(R.impostosDoMes(d, '2026-06')[0].guias[1].contador, null);
});
