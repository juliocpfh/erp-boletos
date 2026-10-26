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
  assert.equal(b.descricao, 'ALUGUEL RS3.644,45\nCOM BONF. RS3.280,00\nIPTU RS91,00 SEGURO3/4 RS56,25 TARIFA COBRANÇA RS8,50');
  // descrição longa (limite de 100 do C6): a tarifa encurta só o necessário para caber
  cb.iptu = 0; cb.outros = 5000;
  const tarifa = (motivo) => { cb.outros_descricao = motivo; const t = R.dadosBoleto(d, cb).descricao; assert.ok(t.length <= 100 || motivo.length > 20); return / (TAR[A-ZÇ. ]*?) RS8,50 /.exec(t)[1]; };
  assert.equal(tarifa('REPARO PIA'), 'TARIFA COBRANÇA');
  assert.equal(tarifa('REPARO DA PIA'), 'TAR. COBRANÇA');
  assert.equal(tarifa('REPARO DO PORTAO'), 'TAR. COBR.');
  assert.equal(tarifa('REPARO DA GARAGEM'), 'TARIFA');
  assert.equal(tarifa('REPARO DO PORTAO DA GARAGEM'), 'TARIFA'); // nem assim cabe: fica a mais curta
  cb.iptu = 9100; cb.outros = 0; cb.outros_descricao = '';
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
    bonificacao: false, desconto_pontualidade_percentual: 10, garantia_tipo: 'Caução', caucao_valor: 1344000, comprovante_caucao: 'c.pdf',
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
  R.encerrarContrato(d, c.id, { data_saida: '2027-12-31', garantia_valor: 1413255, indice_percentual: 10, debitos: 100000, leitura_agua: '0100', leitura_energia: '0200' }, 'julio');
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
  R.encerrarContrato(d, c.id, { data_saida: '2026-09-30', leitura_agua: '0456', leitura_energia: '0789', leitura_gas: '' }, 'julio');
  assert.equal(d.encerramentos[0].leitura_agua, undefined);
  assert.deepEqual(R.leiturasDoImovel(d, casa.id).map((l) => [l.momento, l.data, l.agua, l.energia]),
    [['Saída do inquilino', '2026-09-30', '0456', '0789'], ['Entrada do inquilino', '2026-02-01', '0123', '45678']]);
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
  R.encerrarContrato(d, c.id, { data_saida: '2026-09-30', leitura_agua: '0100', leitura_energia: '0200' }, 'julio');
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

test('IPTU: guias suas a pagar (vencidas e dos próximos 60 dias), por vencimento', () => {
  const { d, loja } = base(); // inquilino entra em 07/06/2026; antes disso o imóvel está vazio
  const p = d.iptus.find((x) => x.imovel_id === loja.id);
  const guias = R.guiasIptuAPagar(d, '2026-04-20', 60);
  assert.ok(guias.length >= 2);
  assert.ok(guias.every((g) => g.parcela.proprietario && !g.parcela.paga && g.faltam <= 60));
  assert.deepEqual(guias.map((g) => g.venc), [...guias.map((g) => g.venc)].sort());
  assert.ok(guias.some((g) => g.faltam < 0), 'as vencidas aparecem');
  const primeira = guias[0];
  R.marcarIptuPago(d, p.id, primeira.parcela.n, '2026-04-20', 'julio');
  assert.equal(R.guiasIptuAPagar(d, '2026-04-20', 60).length, guias.length - 1, 'paga sai da lista');
  assert.ok(R.alertasIptu(d, '2026-04-20').length <= R.guiasIptuAPagar(d, '2026-04-20', 60).length, 'alerta: só até 15 dias');
});

test('contas pagas por nós abatem do resultado do imóvel', () => {
  const { d, loja } = base();
  const c = d.contratos[0];
  c.conta_agua = 'Incluso no aluguel';
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

test('fechamento: uma conta lançada (do mês ou paga no mês) já tira o imóvel das contas pendentes', () => {
  const { d, loja } = base();
  const sala = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Sala vaga', endereco: 'Rua Teste, 1' }, 'julio');
  const contas = () => R.etapasFechamento(d, '2026-10', '2026-10-20').find((e) => e.chave === 'contas');
  assert.deepEqual(contas().imoveis, [sala.id], 'só o imóvel vago; a loja não tem conta nossa');
  R.lancarDespesas(d, sala.id, '2026-09', [{ tipo: 'Água', valor: 8540, data_pagamento: '2026-10-05' }], 'julio');
  assert.equal(contas().feito, true, 'conta de setembro paga em outubro conta para outubro');
  assert.match(contas().detalhe, /1 imóvel\(is\) com conta lançada/);
  d.despesas.length = 0;
  assert.throws(() => R.lancarDespesas(d, sala.id, '2026-10', [{ tipo: 'Água', valor: 0 }], 'julio'), /pelo menos uma/, '0,00 sem observação não registra');
  assert.throws(() => R.lancarDespesas(d, sala.id, '2026-10', [{ tipo: 'Água', valor: null, observacoes: 'verificado' }], 'julio'), /informe o valor/);
  R.lancarDespesas(d, sala.id, '2026-10', [{ tipo: 'Água', valor: 0, observacoes: 'verificado, sem conta em aberto', data_pagamento: '2026-10-20' }], 'julio');
  assert.equal(d.despesas[0].valor, 0);
  assert.equal(contas().feito, true, 'R$ 0,00 com observação conta como lançado');
  d.despesas.length = 0;
  R.lancarDespesas(d, sala.id, '2026-10', [{ tipo: 'Luz', valor: 12000, data_pagamento: '2026-11-03' }], 'julio');
  assert.equal(contas().feito, true, 'só a luz, sem as outras contas');
  assert.equal(loja.id > 0, true);
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
    // aviso já em dezembro; o índice até 12/2025 sai no começo de janeiro e a carta vai com o boleto do aluguel de 01/2026 (vence em 10/02/2026), já corrigido
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

test('carta de reajuste vai com o boleto do aluguel já corrigido (o índice sai no começo do mês do reajuste)', () => {
  const d = R.bancoVazio();
  const i = R.inserir(d, 'imoveis', { nome: 'Casa', endereco: 'Rua A, 1' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Bia', data_entrada: '2025-11-15', vigencia_inicio: '2025-11-15', aluguel_inicial: 100000,
    dia_vencimento: 10, cobranca_mes_seguinte: true, indice_correcao: 'IPCA' }, 'j');
  const alerta = (hoje) => R.alertasContrato(d, c, hoje).find((a) => a.tipo === 'Reajuste do aluguel');
  // outubro (boleto de 10/2026 emitido por volta de 25/10): só o aviso, a carta não vai com ele
  let a = alerta('2026-10-25');
  assert.equal(a.nivel, 'aviso');
  assert.match(a.texto, /índice acumulado até 10\/2026 sai no começo de 11\/2026/);
  assert.match(a.texto, /boleto do aluguel de 11\/2026 \(vence em 10\/12\/2026\)/);
  // novembro: corrigir antes de gerar o boleto de 11/2026
  assert.match(alerta('2026-11-06').texto, /^Corrija o aluguel de 11\/2026/);
  // fechamento de 11/2026 (boletos de 10/2026) não pede a carta; o de 12/2026 (boletos de 11/2026) pede
  const cartas = (mes) => R.etapasFechamento(d, mes, '2026-11-06').find((e) => e.chave === 'cartas');
  assert.equal(cartas('2026-11').pendentes, 0);
  assert.equal(cartas('2026-12').pendentes, 1);
  assert.match(cartas('2026-12').detalhe, /1 ainda sem correção/);
  // calendário: no vencimento do boleto corrigido (10/12/2026), não no de 10/11/2026
  const ev = (mes) => R.eventosDoMes(d, mes, '2026-11-06').filter((e) => e.tipo === 'Reajuste').map((e) => e.data);
  assert.deepEqual(ev('2026-11'), []);
  assert.deepEqual(ev('2026-12'), ['2026-12-10']);
  // corrigido: o alerta continua até mandar a carta
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-11-01', valor_novo: 104500, indice: 'IPCA' }, 'j');
  a = alerta('2026-11-20');
  assert.match(a.texto, /já foi corrigido pelo IPCA\. Envie a carta/);
  assert.equal(alerta('2026-12-11').nivel, 'perigo', 'boleto já venceu sem a carta');
  R.marcarCartaEnviada(d, c.id, '2026-11', true, 'j');
  assert.equal(alerta('2026-11-20'), undefined);
  assert.equal(cartas('2026-12').feito, true);
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
  // excluídos os termos, a marca sai junto
  for (const a of R.aditivosDo(d, c.id)) { R.excluir(d, 'aditivos', a.id, 'julio'); R.marcarAditivos(d, c.id, 'julio'); }
  assert.equal(c.possui_aditivos, false);
});

test('"possui termo aditivo" só com termo registrado: troca de garantia não marca e dados antigos se ajustam', () => {
  const { d, c } = base();
  R.trocarGarantia(d, c.id, { data: '2026-09-01', garantia_tipo: 'Sem garantia' }, 'julio');
  assert.notEqual(c.possui_aditivos, true);
  c.possui_aditivos = true; // marcado sem termo (versão anterior)
  R.normalizar(d);
  assert.equal(c.possui_aditivos, false);
});

test('fiadores do contrato (para editar o contrato): sem os que entraram na troca de garantia', () => {
  const { d, c } = base();
  R.atualizar(d, 'contratos', c.id, { garantia_tipo: 'Fiador' }, 'julio');
  const f1 = R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'Fiador Original' }, 'julio');
  R.trocarGarantia(d, c.id, { data: '2026-09-01', garantia_tipo: 'Fiador' }, 'julio', { novos: [{ nome: 'Fiador Novo' }], saem: [f1.id] });
  assert.deepEqual(R.fiadoresDoContrato(d, c.id).map((f) => f.nome), ['Fiador Original']);
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
  assert.equal(R.alertaDocumentosEntrada(novo, d), null, 'herdeiro nunca fica com documento pendente (marca-se no contrato original)');
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
    garantia_tipo: 'Caução', caucao_valor: 540000, caucao_data: '2025-03-01', caucao_meses: 3, comprovante_caucao: 'c.pdf' }, 'julio');
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

test('complemento da caução não sai sozinho com os boletos do mês: fica em "Caução a completar"', () => {
  const d = R.bancoVazio();
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 3', endereco: 'Rua Teste, 20', cidade: 'Curitiba' }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Joana Teste', inquilino_cpf: '529.982.247-25',
    data_entrada: '2025-03-01', vigencia_inicio: '2025-03-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, taxa_boleto: 850, garantia_tipo: 'Caução', caucao_valor: 540000, caucao_data: '2025-03-01', caucao_meses: 3, comprovante_caucao: 'c.pdf' }, 'julio');
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-03-01', indice: 'IGP-M', percentual: 5, valor_anterior: 200000, valor_novo: 210000 }, 'julio');
  // fevereiro ainda não tem o aluguel corrigido: só o boleto do aluguel
  assert.deepEqual(R.gerarCobrancas(d, '2026-02', 'julio'), { geradas: 1, existentes: 0 });
  assert.equal(R.complementosCaucaoPendentes(d, '2026-02').length, 0);
  assert.equal(R.complementosCaucaoPendentes(d, '2026-03').length, 1);
  // março: só o aluguel corrigido; o complemento é gerado na tela Reajustes
  assert.deepEqual(R.gerarCobrancas(d, '2026-03', 'julio'), { geradas: 1, existentes: 0 });
  assert.equal(d.cobrancas.filter(R.ehComplementoCaucao).length, 0);
  assert.deepEqual(R.caucoesACompletar(d).map((y) => [y.contrato.id, y.x.complemento]), [[c.id, 27000]]);
  // depósito feito pelo inquilino (sem boleto): a caução passa ao necessário e sai da lista
  R.registrarComplementoDepositado(d, c.id, { data: '2026-03-20' }, 'julio');
  assert.equal(R.valorGarantia(d, c), 567000);
  assert.deepEqual(R.caucoesACompletar(d), []);
  assert.equal(R.complementoCaucao(d, c), null);
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

test('impostos: adicional do IRPJ acima de R$ 60.000,00 de lucro presumido no trimestre', () => {
  const d = R.bancoVazio();
  const e = R.inserir(d, 'emitentes', { nome: 'EMPRESA TESTE', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  R.inserir(d, 'faturas', { numero: 1, emissao: '2025-08-10', emitente_id: e.id, valor: 25000000, situacao: 'Emitida' }, 'j'); // R$ 250.000,00
  const [, irpj, csll] = R.impostosDoMes(d, '2025-09')[0].guias;
  assert.equal(irpj.presumido, 8000000); // 32% = R$ 80.000,00
  assert.equal(irpj.adicional, 200000); // 10% de R$ 20.000,00
  assert.equal(irpj.esperado, 1400000); // R$ 12.000,00 + R$ 2.000,00
  assert.equal(csll.esperado, 720000); // 9% de R$ 80.000,00 (CSLL não tem adicional)
  assert.equal(irpj.vencimento, '2025-10-31');
});

test('impostos: LC 224/2025 (35,2% acima de R$ 1,25 milhão no trimestre; sobra passa adiante; CSLL só desde abril de 2026)', () => {
  const d = R.bancoVazio();
  const e = R.inserir(d, 'emitentes', { nome: 'EMPRESA TESTE', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  const nf = (numero, emissao, valor) => R.inserir(d, 'faturas', { numero, emissao, emitente_id: e.id, valor, situacao: 'Emitida' }, 'j');
  nf(1, '2026-02-10', 150000000); // 1º trimestre: R$ 1.500.000,00
  let [, irpj, csll] = R.impostosDoMes(d, '2026-03')[0].guias;
  assert.equal(irpj.presumido, 48800000); // R$ 1.250.000 × 32% + R$ 250.000 × 35,2% = R$ 488.000,00
  assert.equal(csll.presumido, 48000000); // CSLL ainda sem o acréscimo no 1º trimestre de 2026
  nf(2, '2026-05-10', 100000000); // 2º trimestre: R$ 1.000.000,00 (sobram R$ 250.000 do limite; o acréscimo do 1º não volta antes do 4º)
  nf(3, '2026-08-10', 150000000); // 3º trimestre: R$ 1.500.000,00
  [, irpj, csll] = R.impostosDoMes(d, '2026-06')[0].guias;
  assert.equal(irpj.lc224, 0);
  [, irpj, csll] = R.impostosDoMes(d, '2026-09')[0].guias;
  assert.equal(irpj.lc224, 0); // limite do 3º trimestre: R$ 1.250.000 + sobra de R$ 250.000 do 2º = R$ 1.500.000
  assert.equal(csll.lc224, 0);
  nf(4, '2026-11-10', 50000000); // 4º trimestre: ano fecha em R$ 4.500.000, abaixo de R$ 5 milhões: devolve o acréscimo do 1º trimestre
  [, irpj] = R.impostosDoMes(d, '2026-12')[0].guias;
  assert.equal(irpj.lc224, -25000000);
});

test('impostos: vencimento em fim de semana ou feriado vem para o dia útil anterior', () => {
  assert.equal(R.vencimentoGuia(true, '2026-10'), '2026-11-25');
  assert.equal(R.vencimentoGuia(true, '2026-11'), '2026-12-24'); // 25/12 é Natal
  assert.equal(R.vencimentoGuia(true, '2016-02'), '2016-03-24'); // 25/03/2016 foi Sexta-feira Santa
  assert.equal(R.vencimentoGuia(false, '2026-T3'), '2026-10-30'); // 31/10/2026 é sábado
  assert.equal(R.vencimentoGuia(false, '2026-T4'), '2027-01-29');
});

test('impostos: LC 224 na CSLL de 2026 conta só de abril em diante (acerto do 4º trimestre sem o 1º)', () => {
  const d = R.bancoVazio();
  const e = R.inserir(d, 'emitentes', { nome: 'EMPRESA TESTE', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  for (const [n, em] of [[1, '2026-02-10'], [2, '2026-05-10'], [3, '2026-08-10'], [4, '2026-11-10']]) R.inserir(d, 'faturas', { numero: n, emissao: em, emitente_id: e.id, valor: 150000000, situacao: 'Emitida' }, 'j');
  const [, irpj, csll] = R.impostosDoMes(d, '2026-12')[0].guias;
  assert.equal(irpj.lc224, 25000000); // ano R$ 6 milhões: R$ 1 milhão acima, R$ 250.000 em cada trimestre
  assert.equal(csll.lc224, 25000000); // abril a dezembro: R$ 4,5 milhões no limite de R$ 3,75 milhões = R$ 750.000, R$ 250.000 por trimestre
});

test('impostos: guia abaixo de R$ 10,00 não se paga e passa para a seguinte do mesmo imposto até somar R$ 10,00', () => {
  const d = R.bancoVazio();
  const e = R.inserir(d, 'emitentes', { nome: 'EMPRESA TESTE', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  const nf = (numero, emissao, valor) => R.inserir(d, 'faturas', { numero, emissao, emitente_id: e.id, valor, situacao: 'Emitida' }, 'j');
  nf(1, '2026-01-10', 20000); // R$ 200,00 → PIS/COFINS R$ 7,30
  nf(2, '2026-02-10', 10000); // R$ 100,00 → R$ 3,65 + R$ 7,30 = R$ 10,95
  nf(3, '2026-03-10', 10000); // R$ 3,65, sem nada de antes
  const pis = (comp) => R.impostosDoMes(d, comp)[0].guias[0];
  assert.deepEqual([pis('2026-01').aPagar, pis('2026-01').abaixoDoMinimo], [730, true]);
  assert.deepEqual([pis('2026-02').transportado, pis('2026-02').aPagar, pis('2026-02').abaixoDoMinimo], [730, 1095, false]);
  assert.deepEqual([pis('2026-03').transportado, pis('2026-03').aPagar, pis('2026-03').abaixoDoMinimo], [0, 365, true]);
  assert.equal(pis('2026-04').transportado, 365); // abril sem NF: o saldo de março continua esperando
  // CSLL do 1º trimestre: R$ 400 × 2,88% = R$ 11,52 (paga); IRPJ R$ 19,20 (paga)
  const csll = R.impostosDoMes(d, '2026-03')[0].guias[2];
  assert.deepEqual([csll.esperado, csll.abaixoDoMinimo], [1152, false]);
});

test('contrato sem imóvel é apagado depois de 7 dias (sem boleto); normalizar dá o Estado pelo CEP', () => {
  const d = R.bancoVazio();
  const i = R.inserir(d, 'imoveis', { nome: 'Casa', cep: '82210-050' }, 'teste');
  const sem = R.inserir(d, 'contratos', { inquilino_nome: 'Pessoa Teste', imovel_id: null, sem_imovel_desde: '2026-10-01' }, 'teste');
  R.inserir(d, 'fiadores', { nome: 'Fiador Teste', contrato_id: sem.id }, 'teste');
  const com = R.inserir(d, 'contratos', { inquilino_nome: 'Com Imóvel', imovel_id: i.id }, 'teste');
  assert.equal(R.dataApagarSemImovel(sem), '2026-10-08');
  assert.equal(R.dataApagarSemImovel(com), null);
  assert.deepEqual(R.contratosSemImovelVencidos(d, '2026-10-07').map((c) => c.id), []);
  assert.deepEqual(R.contratosSemImovelVencidos(d, '2026-10-08').map((c) => c.id), [sem.id]);
  R.excluirContrato(d, sem.id, 'teste');
  assert.equal(d.contratos.length, 1);
  assert.equal(d.fiadores.length, 0);
  R.normalizar(d);
  assert.equal(d.imoveis[0].uf, 'PR');
});

test('assinatura faltante: só nomes do contrato, alerta até anexar o arquivo completo; operador aguarda o administrador', () => {
  const { d, c } = base();
  const partes = R.partesDoContrato(d, c).map(R.textoParte);
  assert.deepEqual(partes, ['ANK ADMINISTRADORA DE BENS LTDA (locadora)', 'Maria Exemplo (inquilino)'], 'só a ANK assina como locadora');
  assert.throws(() => R.anexarDocumentoParcial(d, c.id, 'doc_contrato_em', { data: '2026-10-20', arquivo: 'x.pdf', falta: ['Fulano (fiador)'] }, 'ana', false), /não está ligado/);
  assert.throws(() => R.anexarDocumentoParcial(d, c.id, 'doc_contrato_em', { data: '2026-10-20', arquivo: 'x.pdf', falta: [] }, 'ana', false), /Escolha de quem/);
  R.anexarDocumentoParcial(d, c.id, 'doc_contrato_em', { data: '2026-10-20', arquivo: 'contrato-falta.pdf', falta: ['ANK ADMINISTRADORA DE BENS LTDA (locadora)'] }, 'ana', false);
  assert.doesNotMatch(R.alertaDocumentosEntrada(c, d).texto, /contrato de locação/, 'sai da lista de faltantes');
  const a = R.alertasContrato(d, c, '2026-10-20').find((x) => x.tipo === 'Assinatura faltante');
  assert.match(a.texto, /contrato de locação anexado sem a assinatura de ANK ADMINISTRADORA DE BENS LTDA \(locadora\) \(aguardando análise do administrador\)/);
  R.analisarDocumento(d, c.id, 'doc_contrato_em', 'parcial', true, 'julio');
  assert.equal(c.doc_contrato_parcial.pendente, false);
  R.marcarDocumento(d, c.id, 'doc_contrato_em', '2026-10-21', 'ana', 'contrato-assinado.pdf');
  assert.equal(c.doc_contrato_parcial, null, 'o arquivo completo tira o registro');
  assert.equal(R.alertasContrato(d, c, '2026-10-21').find((x) => x.tipo === 'Assinatura faltante'), undefined);
});

test('documento perdido por operador aguarda o administrador; do administrador vale direto', () => {
  const { d, c } = base();
  R.marcarDocumentoPerdido(d, c.id, 'doc_vistoria_em', '2026-10-20', 'ana', false);
  assert.equal(c.doc_vistoria_perdido_pendente, 'ana');
  assert.match(R.alertasContrato(d, c, '2026-10-20').find((x) => x.tipo === 'Documento perdido a confirmar').texto, /vistoria de entrada registrado como perdido por ana em 20\/10\/2026/);
  R.analisarDocumento(d, c.id, 'doc_vistoria_em', 'perdido', false, 'julio');
  assert.equal(R.documentoPerdido(d, c, 'doc_vistoria_em'), null, 'recusar volta a pendente');
  R.marcarDocumentoPerdido(d, c.id, 'doc_vistoria_em', '2026-10-20', 'julio', true);
  assert.equal(c.doc_vistoria_perdido_pendente, null);
  assert.equal(R.alertasContrato(d, c, '2026-10-20').find((x) => x.tipo === 'Documento perdido a confirmar'), undefined);
});

test('comprovante de depósito ausente: alerta até anexar', () => {
  const { d, c } = base();
  const a = R.alertasContrato(d, c, '2026-10-20').find((x) => x.tipo === 'Comprovante a buscar no banco');
  assert.match(a.texto, /reserva de R\$ 500,00/);
  R.anexarComprovante(d, 'contratos', c.id, 'comprovante_reserva', 'comprovante-reserva.pdf', 'julio');
  assert.equal(R.comprovantesPendentes(d, c).filter((x) => x.tabela === 'depositos_garantia').length, 0);
  assert.throws(() => R.anexarComprovante(d, 'contratos', c.id, 'inquilino_nome', 'x.pdf', 'julio'), /desconhecido/);
});

test('desfazer pelo histórico: sempre a alteração mais recente de cada campo, até o valor original', () => {
  const { d, c } = base();
  R.atualizar(d, 'contratos', c.id, { inquilino_nome: 'Maria Exemplo Silva', inquilino_profissao: 'Engenheira' }, 'ana', 'manhã');
  const manha = d.historico.length - 1;
  R.atualizar(d, 'contratos', c.id, { inquilino_profissao: 'Arquiteta' }, 'ana', 'tarde');
  const tarde = d.historico.length - 1;
  let pode = R.alteracoesDesfaziveis(d);
  assert.ok(pode.has(`${tarde}:inquilino_profissao`));
  assert.ok(!pode.has(`${manha}:inquilino_profissao`), 'a da manhã só depois de desfazer a da tarde');
  assert.ok(pode.has(`${manha}:inquilino_nome`), 'o nome tem a própria fila');
  assert.throws(() => R.desfazerAlteracoes(d, [`${manha}:inquilino_profissao`], 'julio'), /não pode mais ser desfeita/);
  R.desfazerAlteracoes(d, [`${tarde}:inquilino_profissao`], 'julio');
  assert.equal(c.inquilino_profissao, 'Engenheira');
  pode = R.alteracoesDesfaziveis(d);
  assert.ok(pode.has(`${manha}:inquilino_profissao`));
  assert.ok(!pode.has(`${tarde}:inquilino_profissao`));
  R.desfazerAlteracoes(d, [`${manha}:inquilino_profissao`, `${manha}:inquilino_nome`], 'julio');
  assert.equal(c.inquilino_profissao, null, 'voltou ao original (vazio)');
  assert.equal(c.inquilino_nome, 'Maria Exemplo');
  assert.match(d.historico.at(-1).descricao, /^Desfeito pelo administrador \(alteração de ana/);
  assert.equal(R.alteracoesDesfaziveis(d).size, 0);
  // boletos ficam de fora
  R.gerarCobrancas(d, '2026-07', 'julio');
  R.atualizar(d, 'cobrancas', d.cobrancas[0].id, { observacoes: 'x' }, 'ana', 'obs');
  assert.equal(R.alteracoesDesfaziveis(d).size, 0);
});

test('troca de titular: documentos de entrada herdados (nunca pendentes) e aditivo obrigatório', () => {
  const { d, c } = base();
  R.marcarDocumento(d, c.id, 'doc_contrato_em', '2026-06-07', 'julio', 'contrato.pdf');
  const h = R.inserir(d, 'contratos', { imovel_id: c.imovel_id, inquilino_nome: 'Ana Herdeira', contrato_anterior_id: c.id, data_entrada: '2026-11-01', ativo: true }, 'julio');
  assert.equal(R.alertaDocumentosEntrada(h, d), null, 'nada fica pendente no herdeiro');
  assert.equal(R.documentoEntrada(d, h, 'doc_contrato_em').contrato.id, c.id);
  const a = R.alertasContrato(d, h, '2026-11-01').find((x) => x.tipo === 'Aditivo da troca de titular');
  assert.match(a.texto, /continua o de Maria Exemplo: registre o termo aditivo assinado que coloca Ana Herdeira como titular/);
  R.registrarAditivo(d, h.id, { data: '2026-11-01', assunto: 'Troca de titular', arquivo: 'aditivo.pdf' }, 'julio');
  assert.equal(R.alertasContrato(d, h, '2026-11-01').find((x) => x.tipo === 'Aditivo da troca de titular'), undefined);
});

test('cancelar a troca de garantia: o contrato volta à garantia anterior e só a última troca pode ser cancelada', () => {
  const d = R.bancoVazio();
  const c = R.inserir(d, 'contratos', { inquilino_nome: 'Teste', aluguel_inicial: 200000, garantia_tipo: 'Caução', caucao_valor: 540000, caucao_meses: 3, caucao_data: '2025-09-01' }, 'j');
  const t1 = R.trocarGarantia(d, c.id, { data: '2026-01-10', garantia_tipo: 'Fiador' }, 'j');
  const t2 = R.trocarGarantia(d, c.id, { data: '2026-02-10', garantia_tipo: 'Depósito garantia', deposito_valor: 100000 }, 'j');
  assert.throws(() => R.cancelarTrocaGarantia(d, t1.id, 'j'), /mais recente/);
  R.cancelarTrocaGarantia(d, t2.id, 'j');
  assert.equal(c.garantia_tipo, 'Fiador');
  R.cancelarTrocaGarantia(d, t1.id, 'j');
  assert.equal(c.garantia_tipo, 'Caução');
  assert.equal(c.caucao_valor, 540000);
  assert.equal(c.caucao_data, '2025-09-01');
  assert.equal(d.trocas_garantia.length, 0);
});

test('aluguel inicial corrigido no cadastro: reajustes refeitos em cadeia, negociado mantido, caução sugerida acompanha', () => {
  const d = R.bancoVazio();
  const c = R.inserir(d, 'contratos', { inquilino_nome: 'Teste', aluguel_inicial: 100000, desconto_pontualidade_percentual: 10, garantia_tipo: 'Caução', caucao_meses: 3,
    caucao_valor: 270000, caucao_data: '2024-01-01', vigencia_inicio: '2024-01-01', data_entrada: '2024-01-01' }, 'j');
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2025-01-01', indice: 'IPCA', percentual: 10, valor_anterior: 100000, valor_novo: 110000 }, 'j');
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-01-01', indice: 'Negociado', percentual: 0, valor_anterior: 110000, valor_novo: 250000 }, 'j');
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-06-01', indice: 'IPCA', percentual: 4, valor_anterior: 250000, valor_novo: 260000 }, 'j');
  R.atualizar(d, 'contratos', c.id, { aluguel_inicial: 200000 }, 'j');
  assert.equal(R.recalcularCorrecoes(d, c.id, 'j'), 2);
  const [a, b, x] = R.correcoesDo(d, c.id);
  assert.deepEqual([a.valor_anterior, a.valor_novo], [200000, 220000]);
  assert.deepEqual([b.valor_anterior, b.valor_novo], [220000, 250000]); // negociado: valor combinado mantido
  assert.deepEqual([x.valor_anterior, x.valor_novo], [250000, 260000]);
  assert.equal(R.caucaoSugerida(d, c, '2025-06-01'), 3 * (220000 - 22000));
  assert.equal(R.recalcularCorrecoes(d, c.id, 'j'), 0);
});

test('troca de fiador pela troca de garantia: um sai, outro entra, um é corrigido; cancelar desfaz tudo', () => {
  const d = R.bancoVazio();
  const c = R.inserir(d, 'contratos', { inquilino_nome: 'Teste', garantia_tipo: 'Fiador' }, 'j');
  const a = R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'Fiador A' }, 'j');
  const b = R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'Fiador B', telefone: '1' }, 'j');
  const t = R.trocarGarantia(d, c.id, { data: '2026-10-10', garantia_tipo: 'Fiador' }, 'j',
    { saem: [a.id], alterados: [{ id: b.id, nome: 'Fiador B', telefone: '2' }], novos: [{ nome: 'Fiador C' }] });
  assert.equal(a.data_saida, '2026-10-09');
  assert.equal(b.telefone, '2');
  const novo = d.fiadores.find((f) => f.nome === 'Fiador C');
  assert.equal(novo.data_entrada, '2026-10-10');
  assert.deepEqual(R.fiadoresDo(d, c.id, '2026-10-10').map((f) => f.nome).sort(), ['Fiador B', 'Fiador C']);
  R.cancelarTrocaGarantia(d, t.id, 'j');
  assert.equal(a.data_saida, null);
  assert.equal(b.telefone, '1');
  assert.ok(!d.fiadores.some((f) => f.nome === 'Fiador C'));
});

test('troca para garantia sem fiador: os fiadores atuais saem', () => {
  const d = R.bancoVazio();
  const c = R.inserir(d, 'contratos', { inquilino_nome: 'Teste', garantia_tipo: 'Fiador' }, 'j');
  const a = R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'Fiador A' }, 'j');
  R.trocarGarantia(d, c.id, { data: '2026-10-10', garantia_tipo: 'Caução', caucao_valor: 100000 }, 'j', { novos: [{ nome: 'Ignorado' }] });
  assert.equal(a.data_saida, '2026-10-09');
  assert.equal(d.fiadores.length, 1);
});

test('garantia só conta depois de depositada com comprovante (caução atual, aplicação, complemento)', () => {
  const d = R.bancoVazio();
  const c = R.inserir(d, 'contratos', { inquilino_nome: 'Teste', aluguel_inicial: 200000, garantia_tipo: 'Depósito garantia', deposito_valor: 400000, deposito_data: '2026-01-01' }, 'j');
  assert.equal(R.garantiaDepositada(c), false);
  assert.equal(R.situacaoAplicacao(d, c).total, 0, 'sem comprovante: nada a aplicar');
  R.atualizar(d, 'contratos', c.id, { deposito_pago_em: '2026-01-03', comprovante_deposito: 'comprovante-deposito-garantia-2026-01-03.pdf' }, 'j');
  assert.equal(c.deposito_pago_em, '2026-01-03');
  assert.equal(R.garantiaDepositada(c), true);
  assert.equal(R.situacaoAplicacao(d, c).total, 400000);
});

test('pagamento com valor diferente do previsto: NF digitada (diferente da calculada) e justificativa no histórico', () => {
  const { d } = base();
  R.gerarCobrancas(d, '2026-08', 'julio');
  const cb = d.cobrancas[0];
  const previsto = R.previstoNoPagamento(cb, cb.vencimento);
  const recebido = previsto.valor_devido - 5000;
  assert.throws(() => R.registrarPagamento(d, cb.id, cb.vencimento, recebido, 'julio', { valorNf: previsto.valor_nf, justificativa: 'Pagou sem o IPTU' }), /Altere o valor da NF/);
  assert.throws(() => R.registrarPagamento(d, cb.id, cb.vencimento, recebido, 'julio', { valorNf: 100000, justificativa: ' ' }), /justificativa/);
  assert.equal(cb.data_pagamento, null, 'nada salvo enquanto não confere');
  R.registrarPagamento(d, cb.id, cb.vencimento, recebido, 'julio', { valorNf: 100000, justificativa: 'Pagou sem o IPTU' });
  assert.equal(cb.valor_nf, 100000);
  assert.equal(cb.valor_pago, recebido);
  assert.equal(cb.nf_manual, true);
  assert.match(d.historico.at(-1).descricao, /Justificativa: Pagou sem o IPTU/);
  R.estornarPagamento(d, cb.id, 'julio');
  assert.equal(cb.nf_manual, false);
  assert.equal(cb.divergencia, null);
});

test('termo aditivo gerado: aguarda assinatura sem marcar "possui termo aditivo"; altera, assina e não muda o vencimento do contrato', () => {
  const { d, c } = base();
  const dia = c.dia_vencimento;
  assert.throws(() => R.salvarAditivoVencimento(d, c.id, { data: '2026-11-05', dia_novo: String(dia || 10), mes: '2026-12', texto: 'x' }, 'julio'), /já é no dia/);
  assert.throws(() => R.salvarAditivoVencimento(d, c.id, { data: '2026-11-05', dia_novo: '40', mes: '2026-12', texto: 'x' }, 'julio'), /de 1 a 31/);
  const a = R.salvarAditivoVencimento(d, c.id, { data: '2026-11-05', dia_novo: '31', mes: '2027-02', texto: 'texto' }, 'julio');
  assert.equal(a.primeiro_vencimento, '2027-02-28', 'dia que não existe no mês vira o último dia');
  assert.equal(R.aditivosDo(d, c.id).length, 0);
  assert.equal(R.aditivosAguardando(d, c.id).length, 1);
  assert.equal(c.possui_aditivos, undefined);
  R.salvarAditivoVencimento(d, c.id, { data: '2026-11-06', dia_novo: '15', mes: '2026-12', texto: 'texto novo' }, 'julio', a.id);
  assert.equal(a.texto, 'texto novo');
  assert.match(a.assunto, /dia 15, a partir de 15\/12\/2026/);
  assert.throws(() => R.assinarAditivo(d, a.id, { data: '2026-11-10' }, 'julio'), /Anexe/);
  R.assinarAditivo(d, a.id, { data: '2026-11-10', arquivo: 'termo.pdf' }, 'julio');
  assert.equal(c.possui_aditivos, true);
  assert.equal(R.aditivosDo(d, c.id).length, 1);
  assert.equal(c.dia_vencimento, dia, 'o cadastro só muda pelo "Editar"');
  assert.throws(() => R.salvarAditivoVencimento(d, c.id, { data: '2026-11-06', dia_novo: '16', mes: '2026-12', texto: 't' }, 'julio', a.id), /já foi assinado/);
  R.normalizar(d);
  assert.equal(c.possui_aditivos, true);
});

test('reserva já abatida em aluguel antigo (fora do sistema): sai dos boletos em aberto; excluir o registro devolve', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-06', 'julio');
  const cb = d.cobrancas[0];
  assert.equal(cb.reserva_utilizada, 50000);
  assert.throws(() => R.marcarReservaAbatida(d, c.id, { competencia: '2024-03', valor: 60000 }, 'julio'), /não pode passar de R\$ 500,00/);
  assert.throws(() => R.marcarReservaAbatida(d, c.id, { competencia: '', valor: 50000 }, 'julio'), /mês/);
  assert.equal(R.marcarReservaAbatida(d, c.id, { competencia: '2024-03', valor: 50000 }, 'julio'), 1);
  assert.equal(cb.reserva_utilizada, 0, 'saiu do boleto em aberto');
  assert.equal(R.saldoReserva(d, c), 0);
  assert.equal(R.alertaReservaParada(d, c), null);
  R.gerarCobrancas(d, '2026-07', 'julio');
  assert.equal(d.cobrancas[1].reserva_utilizada, 0, 'boleto novo também não usa');
  assert.equal(R.desmarcarReservaAbatida(d, c.id, 'julio'), 1);
  assert.equal(cb.reserva_utilizada, 50000, 'volta para o mês marcado');
  assert.equal(c.reserva_abatida_comp, null);
});

test('caução em depósitos de valores diferentes: o primeiro valor é o do contrato; os reajustes viram complemento depois', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 300000, caucao_meses: 2, caucao_data: '2026-06-07' });
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-08-07', indice: 'Negociado', valor_anterior: 135000, valor_novo: 200000, percentual: 0 }, 'julio');
  let s = R.garantiaADepositar(d, c, 'caucao', '2026-10-01');
  assert.equal(s.necessaria, 300000, 'antes de registrada: só a caução do contrato');
  assert.equal(s.corrigida, 360000, 'informa o que vai faltar pelos reajustes (2 × R$ 1.800,00)');
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-09-01', valor: 200000, arquivo: 'a.pdf' }, 'julio');
  s = R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-09-15', valor: 50000 }, 'julio');
  assert.equal(s.falta, 50000);
  assert.equal(R.garantiaDepositada(c), false);
  assert.match(R.comprovantesPendentes(d, { ...c, doc_contrato_em: '2026-06-01' }).find((x) => x.campo === 'comprovante_caucao').texto, /falta depositar/);
  const ultimo = R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-10-01', valor: 50000, arquivo: 'c.pdf' }, 'julio');
  assert.equal(ultimo.completou, true);
  assert.equal(R.garantiaDepositada(c), true);
  assert.equal(c.caucao_pago_em, '2026-10-01');
  assert.equal(R.valorGarantia(d, c), 300000);
  assert.equal(R.garantiaADepositar(d, c, 'caucao', '2026-10-01').falta, 60000, 'agora o complemento dos reajustes');
  // complemento por depósito
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-10-05', valor: 60000 }, 'julio');
  assert.equal(R.valorGarantia(d, c), 360000);
  assert.throws(() => R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-10-06', valor: 1 }, 'julio'), /completa/);
  // excluir um depósito do valor inicial: volta a faltar
  R.excluir(d, 'depositos_garantia', ultimo.deposito.id, 'julio');
  R.acertarGarantiaDepositada(d, c.id, 'caucao', 'julio');
  assert.equal(R.garantiaDepositada(c), false);
  // nova troca de garantia: os depósitos anteriores são da garantia antiga
  R.trocarGarantia(d, c.id, { data: '2026-10-10', garantia_tipo: 'Caução', caucao_valor: 360000, caucao_meses: 2, caucao_data: '2026-10-10' }, 'julio');
  assert.equal(R.garantiaADepositar(d, c, 'caucao').depositado, 0);
});

test('"×" apaga só o anexo e "Editar" do depósito confere a soma de novo', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2026-06-07', comprovante_reserva: 'reserva.pdf', reserva_valor: 50000 });
  // reserva: sai só o arquivo (o valor continua)
  R.removerAnexo(d, 'contratos', c.id, 'comprovante_reserva', 'julio');
  assert.equal(c.comprovante_reserva, null);
  assert.equal(c.reserva_valor, 50000);
  assert.throws(() => R.removerAnexo(d, 'contratos', c.id, 'comprovante_caucao', 'julio'), /não pode/);
  // caução em dois depósitos: o contrato guarda a cópia do comprovante do último
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-09-01', valor: 200000, arquivo: 'a.pdf' }, 'julio');
  const { deposito } = R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-09-15', valor: 100000, arquivo: 'b.pdf' }, 'julio');
  assert.equal(c.comprovante_caucao, 'b.pdf');
  R.removerAnexo(d, 'depositos_garantia', deposito.id, 'comprovante', 'julio');
  assert.equal(R.buscar(d, 'depositos_garantia', deposito.id).valor, 100000, 'o depósito continua');
  assert.equal(c.comprovante_caucao, null, 'a cópia no contrato também sai');
  assert.equal(R.garantiaDepositada(c), true, 'a caução continua registrada');
  // editar: R$ 1.000,00 → R$ 500,00 deixa de cobrir R$ 3.000,00; volta para R$ 1.000,00 e completa de novo
  R.editarDepositoGarantia(d, deposito.id, { data: '2026-09-16', valor: 50000 }, 'julio');
  assert.equal(R.garantiaDepositada(c), false);
  R.editarDepositoGarantia(d, deposito.id, { data: '2026-09-16', valor: 100000 }, 'julio');
  assert.equal(R.garantiaDepositada(c), true);
  assert.equal(c.caucao_pago_em, '2026-09-16');
  // documento assinado: o arquivo sai, continua assinado; termo aditivo volta a aguardar assinatura
  Object.assign(c, { doc_contrato_em: '2026-06-01', doc_contrato_arquivo: 'contrato.pdf' });
  R.arquivoDocumento(d, c.id, 'doc_contrato_em', null, 'julio');
  assert.equal(c.doc_contrato_em, '2026-06-01');
  assert.equal(c.doc_contrato_arquivo, null);
  R.arquivoDocumento(d, c.id, 'doc_contrato_em', 'contrato-certo.pdf', 'julio');
  assert.equal(c.doc_contrato_arquivo, 'contrato-certo.pdf');
  const a = R.registrarAditivo(d, c.id, { data: '2026-10-01', assunto: 'Troca do vencimento', arquivo: 'aditivo.pdf' }, 'julio');
  R.removerArquivoAditivo(d, a.id, 'julio');
  assert.equal(R.aditivosDo(d, c.id).length, 0);
  assert.equal(R.aditivosAguardando(d, c.id).length, 1);
  assert.equal(c.possui_aditivos, false);
});

test('arquivos anexados que os lançamentos usam (para apagar o anexo junto com o lançamento)', () => {
  const { d, c, loja } = base();
  Object.assign(c, { comprovante_reserva: 'comprovante-reserva.pdf', doc_contrato_arquivo: 'contrato.pdf', doc_vistoria_parcial: { arquivo: 'vistoria-parcial.pdf' } });
  R.registrarAditivo(d, c.id, { data: '2026-10-01', assunto: 'Troca do vencimento', arquivo: 'aditivo.pdf' }, 'julio');
  R.inserir(d, 'vistorias', { contrato_id: c.id, tipo: 'Entrada', data: '2026-06-07', fotos: { fachada: 'vistoria-entrada-2026-06-07-fachada.jpg' } }, 'julio');
  R.inserir(d, 'seguros', { imovel_id: loja.id, arquivo_apolice: 'apolice-1.pdf', outros_arquivos: ['seguro-1-a.pdf'] }, 'julio');
  const lista = () => R.arquivosReferenciados(d).map((a) => `${a.escopo}:${a.nome}`).sort();
  assert.deepEqual(lista(), ['aditivos:aditivo.pdf', 'assinados:contrato.pdf', 'assinados:vistoria-parcial.pdf', 'contrato:comprovante-reserva.pdf',
    'contrato:vistoria-entrada-2026-06-07-fachada.jpg', 'seguro:apolice-1.pdf', 'seguro:seguro-1-a.pdf']);
  R.excluir(d, 'aditivos', d.aditivos[0].id, 'julio');
  assert.equal(lista().includes('aditivos:aditivo.pdf'), false, 'excluído o aditivo, o arquivo fica sem uso');
});

test('aplicação da garantia na conta de outra pessoa: soma no aplicado e a devolução sai de onde foi depositada, na proporção', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 540000, comprovante_caucao: 'c.pdf' });
  const ank = d.emitentes[0];
  R.inserir(d, 'aplicacoes', { contrato_id: c.id, emitente_id: ank.id, data: '2023-05-10', valor: 300000 }, 'julio');
  R.inserir(d, 'aplicacoes', { contrato_id: c.id, emitente_id: null, recebedor: 'Maria Silva (PF)', data: '2023-05-10', valor: 240000 }, 'julio');
  const s = R.situacaoAplicacao(d, c);
  assert.equal(s.ok, true);
  assert.deepEqual(s.linhas.map((l) => [l.emitente.nome, l.aplicado, !!l.emitente.pessoa]), [[ank.nome, 300000, false], ['Maria Silva (PF)', 240000, true]]);
  assert.deepEqual(R.recebedoresUsados(d), ['Maria Silva (PF)']);
  assert.deepEqual(R.devolucaoPorRecebedor(d, c, 594000).map((x) => [x.nome, x.valor]), [[ank.nome, 330000], ['Maria Silva (PF)', 264000]]);
});

test('remover o comprovante do depósito da caução: só sem correções; em depósitos, sai o último', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2026-06-07', caucao_pago_em: '2026-06-07', comprovante_caucao: 'a.pdf' });
  const cg = R.inserir(d, 'correcoes_garantia', { contrato_id: c.id, data: '2026-08-01', valor_novo: 320000, complemento: 20000 }, 'julio');
  assert.equal(R.podeRemoverComprovanteGarantia(d, c, 'caucao'), false);
  assert.throws(() => R.removerComprovanteGarantia(d, c.id, 'caucao', 'julio'), /correções/);
  R.excluir(d, 'correcoes_garantia', cg.id, 'julio');
  R.removerComprovanteGarantia(d, c.id, 'caucao', 'julio');
  assert.equal(R.garantiaDepositada(c), false);
  assert.equal(c.caucao_pago_em, null);
  // paga em depósitos
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-06-07', valor: 200000, arquivo: 'b.pdf' }, 'julio');
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-06-20', valor: 100000, arquivo: 'c.pdf' }, 'julio');
  assert.equal(R.garantiaDepositada(c), true);
  R.removerComprovanteGarantia(d, c.id, 'caucao', 'julio');
  assert.equal(R.garantiaDepositada(c), false);
  assert.deepEqual(R.depositosGarantiaDo(d, c, 'caucao').map((x) => x.comprovante), ['b.pdf']);
});

test('depósito da caução sem comprovante: registra com data e valor, conta na soma e fica o aviso até anexar', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2026-06-07', doc_contrato_em: '2026-06-01' });
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-06-10', valor: 100000 }, 'julio');
  const ultimo = R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-06-20', valor: 200000, arquivo: 'b.pdf' }, 'julio');
  assert.equal(ultimo.falta, 0);
  assert.equal(R.garantiaDepositada(c), true, 'registrada mesmo com um comprovante faltando');
  const pend = R.comprovantesPendentes(d, c).filter((x) => x.tabela === 'depositos_garantia');
  assert.deepEqual(pend.map((x) => [x.texto, x.valor, x.tabela]), [['depósito da caução', 100000, 'depositos_garantia']]);
  R.anexarComprovante(d, 'depositos_garantia', pend[0].id, 'comprovante', 'a.pdf', 'julio');
  assert.equal(R.comprovantesPendentes(d, c).filter((x) => x.tabela === 'depositos_garantia').length, 0);
  // troca de garantia: a marca de "registrada em depósitos" não passa para a nova
  R.trocarGarantia(d, c.id, { data: '2026-10-10', garantia_tipo: 'Caução', caucao_valor: 360000, caucao_data: '2026-10-10' }, 'julio');
  assert.equal(R.garantiaDepositada(c), false);
});

test('caução ainda não depositada inteira: aplicação conta o já depositado; correção feita antes conta depois de registrada', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 400000, caucao_data: '2026-06-07' });
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-06-10', valor: 150000 }, 'julio');
  assert.equal(R.situacaoAplicacao(d, c).total, 150000);
  R.inserir(d, 'aplicacoes', { contrato_id: c.id, emitente_id: d.emitentes[0].id, data: '2026-06-11', valor: 150000 }, 'julio');
  assert.equal(R.situacaoAplicacao(d, c).ok, true);
  R.inserir(d, 'correcoes_garantia', { contrato_id: c.id, data: '2026-07-01', valor_anterior: 400000, valor_novo: 420000, complemento: 20000 }, 'julio');
  assert.equal(R.garantiaADepositar(d, c, 'caucao').falta, 250000, 'a correção não muda o valor inicial a depositar');
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-07-10', valor: 250000 }, 'julio');
  assert.equal(R.garantiaDepositada(c), true);
  assert.equal(R.valorGarantia(d, c), 420000, 'caução atual = valor corrigido (o complemento da correção conta)');
});

test('dados antigos: depósitos que já cobrem a caução do contrato ficam registrados ao abrir', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2026-06-07' });
  R.inserir(d, 'depositos_garantia', { contrato_id: c.id, qual: 'caucao', troca_id: null, data: '2026-06-08', valor: 300000, comprovante: 'a.pdf' }, 'julio');
  assert.equal(R.garantiaDepositada(c), false);
  R.normalizar(d);
  assert.equal(R.garantiaDepositada(c), true);
  assert.equal(c.caucao_pago_em, '2026-06-08');
});

test('caução inicial já depositada e aluguel reajustado: registra depósitos para completar (sem travar) e a caução atual soma', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 243000, caucao_meses: 2, caucao_data: '2026-06-07', caucao_pago_em: '2026-06-07', comprovante_caucao: 'inicial.pdf' });
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-08-07', indice: 'Negociado', valor_anterior: 135000, valor_novo: 150000, percentual: 0 }, 'julio');
  let s = R.garantiaADepositar(d, c, 'caucao', '2026-10-01');
  assert.equal(s.necessaria, 270000, '2 × R$ 1.350,00');
  assert.equal(s.depositado, 243000);
  assert.equal(s.falta, 27000);
  const x = R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-09-01', valor: 15000 }, 'julio');
  assert.equal(x.deposito.complementar, true);
  assert.equal(R.valorGarantia(d, c), 258000);
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-09-10', valor: 12000, arquivo: 'b.pdf' }, 'julio');
  s = R.garantiaADepositar(d, c, 'caucao', '2026-10-01');
  assert.equal(s.falta, 0);
  assert.equal(R.valorGarantia(d, c), 270000);
  assert.equal(R.situacaoAplicacao(d, c).total, 270000);
  assert.throws(() => R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-09-11', valor: 1 }, 'julio'), /completa/);
  // excluir um depósito para completar não desfaz a caução registrada
  R.excluir(d, 'depositos_garantia', x.deposito.id, 'julio');
  assert.equal(R.garantiaDepositada(c), true);
  assert.equal(R.valorGarantia(d, c), 255000);
});

test('troca de titular: fim do vínculo do anterior na véspera (não é saída), sem lembrete de titularidade de volta', () => {
  const { d, c } = base();
  const { id, ...resto } = c;
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Novo Titular', contrato_anterior_id: c.id, data_entrada: '2026-10-01', vigencia_inicio: '2026-10-01' }, 'julio');
  R.encerrarVinculoPorContinuacao(d, c.id, '2026-10-01', novo.inquilino_nome, 'julio');
  assert.equal(c.data_saida, '2026-09-30');
  assert.equal(R.fimDeVinculo(d, c), true);
  assert.equal(R.continuadoPor(d, c).id, novo.id);
  assert.equal(R.alertaTitularidade(d, c, '2026-10-05'), null);
  assert.equal(R.contratoAtivo(c, '2026-10-01'), false);
  assert.equal(R.fimDeVinculo(d, novo), false);
});

test('herança do contrato: correções, data-base do reajuste, caução com depósitos e aplicações e boletos a partir da troca', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 243000, caucao_meses: 2, caucao_data: '2026-06-07', vigencia_inicio: '2026-06-07' });
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-06-08', valor: 243000, arquivo: 'cau.pdf' }, 'julio');
  R.inserir(d, 'aplicacoes', { contrato_id: c.id, emitente_id: d.emitentes[0].id, data: '2026-06-09', valor: 243000, comprovante: 'apl.pdf' }, 'julio');
  for (const comp of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']) R.gerarCobrancas(d, comp, 'julio');
  const pago = R.boletoDoMes(d, c.id, '2026-11');
  R.registrarPagamento(d, pago.id, '2026-12-05', null, 'julio'); // pago, ainda sem NF
  const { id, ...resto } = c;
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Novo Titular', contrato_anterior_id: c.id, data_entrada: '2026-10-01', vigencia_inicio: '2026-10-01',
    garantia_tipo: 'Caução', comprovante_caucao: null, caucao_por_depositos: null, aluguel_inicial: 135000 }, 'julio');
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-10-07', indice: 'Negociado', valor_anterior: 135000, valor_novo: 140000, percentual: 0 }, 'julio');
  const r = R.transferirHeranca(d, novo.id, 'julio');
  assert.equal(c.data_saida, '2026-09-30', 'fim do vínculo');
  assert.equal(novo.data_base_correcao, '2026-06-07', 'reajuste no aniversário do contrato original');
  assert.equal(r.correcoes, 1);
  assert.equal(R.aluguelAtual(d, novo, '2026-12-01'), 140000);
  assert.equal(r.garantia, true);
  assert.equal(R.garantiaDepositada(novo), true);
  assert.equal(R.valorGarantia(d, novo), 243000);
  assert.equal(R.situacaoAplicacao(d, novo).ok, true);
  assert.deepEqual(r.arquivos.sort(), ['apl.pdf', 'cau.pdf']);
  assert.equal(c.garantia_transferida_para, novo.id);
  assert.equal(R.boletoDoMes(d, novo.id, '2026-10').contrato_id, novo.id, 'boleto em aberto de outubro passa');
  assert.equal(R.boletoDoMes(d, novo.id, '2026-11').id, pago.id, 'pago sem NF também passa (NF sai no nome do novo)');
  assert.equal(R.boletoDoMes(d, c.id, '2026-09').contrato_id, c.id, 'setembro fica com o anterior');
  assert.equal(R.transferirHeranca(d, novo.id, 'julio'), null, 'só uma vez');
});

test('quem saiu fica inativo quando o boleto do último mês já existe; herdeiro não vê reajuste de antes da entrada', () => {
  const { d, c } = base();
  R.gerarCobrancas(d, '2026-06', 'julio');
  c.data_saida = '2026-07-15';
  assert.equal(R.desativarSeSaiu(d, c, null, '2026-08-01'), false, 'falta o boleto de julho (proporcional)');
  R.gerarCobrancas(d, '2026-07', 'julio');
  assert.equal(R.desativarSeSaiu(d, c, 'julio', '2026-08-01'), true);
  assert.equal(c.ativo, false);
  const { d: d2, c: ant } = base();
  Object.assign(ant, { vigencia_inicio: '2025-02-01', data_entrada: '2025-02-01' });
  R.inserir(d2, 'correcoes', { contrato_id: ant.id, data_vigencia: '2026-02-01', indice: 'IPCA', valor_anterior: 135000, valor_novo: 140000, percentual: 3.7 }, 'julio');
  const { id, ...resto } = ant;
  const novo = R.inserir(d2, 'contratos', { ...resto, inquilino_nome: 'Novo', contrato_anterior_id: ant.id, data_entrada: '2026-10-01', vigencia_inicio: '2026-10-01', data_base_correcao: '2025-02-01' }, 'julio');
  assert.equal(R.reajustePendente(d2, novo, '2026-11-01'), null, 'o de 02/2026 foi do anterior');
  assert.equal(R.reajustePendente(d2, novo, '2027-01-20').competencia, '2027-02', 'o próximo é no aniversário do contrato original');
});

test('herança: reserva do contrato passa ao novo titular sem abater de novo o que o anterior já usou; bonificado nas condições', () => {
  const { d, c } = base(); // reserva de R$ 500,00, aluguel R$ 1.350,00 com 10% de bonificação
  R.gerarCobrancas(d, '2026-06', 'julio'); // o 1º aluguel do anterior usa a reserva
  const cond = R.condicoesDoContrato(d, c);
  assert.equal(cond.aluguel_bonificado, 121500);
  assert.equal(cond.reserva_valor, 50000);
  const { id, ...resto } = c;
  const novo = R.inserir(d, 'contratos', { ...resto, reserva_valor: 50000, inquilino_nome: 'Novo', contrato_anterior_id: c.id, data_entrada: '2026-08-01', vigencia_inicio: '2026-08-01' }, 'julio');
  R.transferirHeranca(d, novo.id, 'julio');
  assert.equal(novo.reserva_usada_anterior, 50000);
  assert.equal(R.saldoReserva(d, novo), 0);
  R.gerarCobrancas(d, '2026-08', 'julio');
  assert.equal(R.boletoDoMes(d, novo.id, '2026-08').reserva_utilizada, 0, 'não abate de novo');
});

test('herança já feita sem a garantia e a reserva do anterior: completa (comprovante, aplicação e reserva vêm para o herdeiro)', () => {
  const { d, c } = base(); // reserva R$ 500,00
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2025-02-01', caucao_pago_em: '2025-02-01', comprovante_caucao: 'caucao.pdf' });
  R.inserir(d, 'aplicacoes', { contrato_id: c.id, emitente_id: d.emitentes[0].id, data: '2025-02-05', valor: 300000, comprovante: 'apl.pdf' }, 'julio');
  const { id, ...resto } = c;
  // herdeiro antigo: tinha um registro próprio de depósito, a transferência pulou a garantia; reserva ficou zerada
  const novo = R.inserir(d, 'contratos', { ...resto, comprovante_caucao: null, reserva_valor: 0, inquilino_nome: 'Herdeira', contrato_anterior_id: c.id,
    data_entrada: '2026-10-01', vigencia_inicio: '2026-10-01', heranca_transferida: '2026-10-01', reserva_usada_anterior: 0 }, 'julio');
  R.inserir(d, 'depositos_garantia', { contrato_id: novo.id, qual: 'caucao', troca_id: null, data: '2026-10-02', valor: 1000 }, 'julio');
  c.data_saida = '2026-09-30';
  assert.deepEqual(R.herancaIncompleta(d, novo), { garantia: true, reserva: true });
  const r = R.completarHeranca(d, novo.id, 'julio');
  assert.deepEqual(r.arquivos.sort(), ['apl.pdf', 'caucao.pdf']);
  assert.equal(novo.comprovante_caucao, 'caucao.pdf');
  assert.equal(R.garantiaDepositada(novo), true, 'sem o alerta de anexar comprovante');
  assert.equal(R.aplicacoesDo(d, novo.id).length, 1);
  assert.equal(R.valorGarantia(d, novo), 300000, 'só a caução herdada: o depósito próprio que repetia a caução sai');
  assert.equal(d.depositos_garantia.some((x) => x.contrato_id === novo.id && x.valor === 1000), false);
  assert.equal(c.garantia_transferida_para, novo.id);
  assert.equal(novo.reserva_valor, 50000);
  assert.equal(R.herancaIncompleta(d, novo), null);
});

test('garantia herdada desfeita por engano volta pelo histórico; não se pode mais remover/desfazer a herdada', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2025-02-01', reserva_valor: 0 });
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2025-02-02', valor: 300000, arquivo: 'dep.pdf' }, 'julio');
  const { id, ...resto } = c;
  const novo = R.inserir(d, 'contratos', { ...resto, comprovante_caucao: null, caucao_por_depositos: null, caucao_pago_em: null, inquilino_nome: 'Herdeira', contrato_anterior_id: c.id,
    data_entrada: '2026-10-01', vigencia_inicio: '2026-10-01', heranca_transferida: '2026-10-01' }, 'julio');
  R.inserir(d, 'depositos_garantia', { contrato_id: novo.id, qual: 'caucao', troca_id: null, data: '2026-10-02', valor: 1000 }, 'julio');
  c.data_saida = '2026-09-30';
  R.completarHeranca(d, novo.id, 'julio');
  assert.equal(R.garantiaDepositada(novo), true);
  assert.equal(R.podeRemoverComprovanteGarantia(d, novo, 'caucao'), false, 'herdada: sem "Desfazer último depósito"');
  // o que aconteceu antes desta correção: o depósito herdado foi desfeito
  const herdado = R.depositosGarantiaDo(d, novo, 'caucao').find((x) => !x.complementar);
  R.excluir(d, 'depositos_garantia', herdado.id, 'julio');
  R.atualizar(d, 'contratos', novo.id, { caucao_pago_em: null, comprovante_caucao: null, caucao_por_depositos: null }, 'julio', 'removido');
  assert.equal(R.garantiaDepositada(novo), false);
  assert.ok(R.garantiaHerdadaDesfeita(d, novo));
  const r = R.restaurarGarantiaHerdada(d, novo.id, 'julio');
  assert.deepEqual(r.arquivos, ['dep.pdf']);
  assert.equal(R.garantiaDepositada(novo), true);
  assert.equal(R.depositosGarantiaDo(d, novo, 'caucao').some((x) => x.id === herdado.id), true);
  assert.equal(R.garantiaHerdadaDesfeita(d, novo), null);
});

test('garantia herdada cuidada no contrato anterior: comprovante anexado lá aparece no novo titular (arquivo na pasta do anterior)', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2025-02-01', data_saida: '2026-09-30' });
  const { id, ...resto } = c;
  const novo = R.inserir(d, 'contratos', { ...resto, data_saida: null, inquilino_nome: 'Herdeira', contrato_anterior_id: c.id, data_entrada: '2026-10-01', vigencia_inicio: '2026-10-01', heranca_transferida: '2026-10-01' }, 'julio');
  c.garantia_transferida_para = novo.id;
  assert.equal(R.garantiaDepositada(novo), false);
  R.anexarComprovante(d, 'contratos', c.id, 'comprovante_caucao', 'cau.pdf', 'julio');
  assert.equal(novo.comprovante_caucao, 'cau.pdf');
  assert.equal(novo.comprovante_caucao_contrato, c.id, 'o arquivo fica na pasta do anterior');
  assert.equal(R.garantiaDepositada(novo), true);
  assert.ok(R.arquivosReferenciados(d).some((x) => x.escopo === 'contrato' && x.id === c.id && x.nome === 'cau.pdf'));
  // ou registrando o depósito com o comprovante no anterior
  const { d: d2, c: a2 } = base();
  Object.assign(a2, { garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2025-02-01' });
  const n2 = R.inserir(d2, 'contratos', { inquilino_nome: 'H2', contrato_anterior_id: a2.id, garantia_tipo: 'Caução', caucao_valor: 300000, data_entrada: '2026-10-01' }, 'julio');
  a2.garantia_transferida_para = n2.id;
  R.registrarDepositoGarantia(d2, a2.id, 'caucao', { data: '2025-02-03', valor: 300000, arquivo: 'dep.pdf' }, 'julio');
  assert.equal(n2.comprovante_caucao, 'dep.pdf');
  assert.equal(n2.caucao_pago_em, '2025-02-03');
  assert.equal(R.garantiaDepositada(n2), true);
});

test('garantia herdada com o comprovante anexado no anterior: some o alerta de comprovante dos depósitos que vieram dele', () => {
  const { d, c } = base();
  Object.assign(c, { garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2025-02-01', reserva_valor: 0 });
  const novo = R.inserir(d, 'contratos', { inquilino_nome: 'Herdeira', contrato_anterior_id: c.id, garantia_tipo: 'Caução', caucao_valor: 300000, caucao_por_depositos: true, doc_contrato_em: '2026-10-01', data_entrada: '2026-10-01' }, 'julio');
  R.inserir(d, 'depositos_garantia', { contrato_id: novo.id, qual: 'caucao', troca_id: null, data: '2025-02-02', valor: 300000 }, 'julio'); // veio do anterior, sem comprovante
  c.garantia_transferida_para = novo.id;
  assert.equal(R.comprovantesPendentes(d, novo).filter((x) => x.tabela === 'depositos_garantia').length, 1);
  R.anexarComprovante(d, 'contratos', c.id, 'comprovante_caucao', 'cau.pdf', 'julio');
  assert.equal(R.comprovantesPendentes(d, novo).filter((x) => x.tabela === 'depositos_garantia' || x.campo === 'comprovante_caucao').length, 0);
});

test('ordem das caixas: a guardada vale para as que estão na tela; ausentes e novas não se perdem', () => {
  // caixa nova (nunca arrumada) fica no lugar de sempre
  assert.deepEqual(R.ordenarCaixas(['A', 'B', 'N', 'C'], ['C', 'A', 'B']), ['C', 'A', 'N', 'B']);
  assert.deepEqual(R.ordenarCaixas(['A', 'B'], []), ['A', 'B']);
  // "R" (ex.: Reserva) não aparece neste inquilino: volta logo depois da que vinha antes dela
  assert.deepEqual(R.juntarOrdem(['A', 'B', 'R', 'C'], ['C', 'A', 'B']), ['C', 'A', 'B', 'R']);
  assert.deepEqual(R.juntarOrdem(['R', 'A', 'B'], ['B', 'A']), ['R', 'B', 'A']);
  const d = R.bancoVazio();
  R.salvarOrdemCaixas(d, 'contrato', '', ['Histórico', 'Identificação e contato'], 'julio');
  R.salvarOrdemCaixas(d, 'contrato', 'Contrato e valores', ['Observações', 'Reserva dada na visita'], 'julio');
  assert.deepEqual(R.ordemGuardada(d, 'contrato', ''), ['Histórico', 'Identificação e contato']);
  assert.deepEqual(R.ordemGuardada(d, 'contrato', 'Contrato e valores'), ['Observações', 'Reserva dada na visita']);
  assert.deepEqual(R.ordemGuardada(d, 'painel', ''), []);
  assert.match(d.historico.at(-1).descricao, /Ordem das caixas/);
});

test('tela Reajustes: abertos de qualquer ano, % digitado sem índice, carta só no ano corrente e desfazer', () => {
  const d = R.bancoVazio();
  const i = R.inserir(d, 'imoveis', { nome: 'Casa', endereco: 'Rua A, 1' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ana Teste', data_entrada: '2023-11-10', vigencia_inicio: '2023-11-10', aluguel_inicial: 200000,
    dia_vencimento: 10, indice_correcao: 'IPCA' }, 'j');
  const abertos = () => R.reajustesAbertos(d, '2026-10-24').map((r) => `${r.competencia}${r.comCarta ? ' carta' : ''}`);
  assert.deepEqual(abertos(), ['2024-11', '2025-11', '2026-11 carta']);
  // fora de ordem: a de 2025 só depois da de 2024
  assert.throws(() => R.aplicarReajuste(d, c.id, '2026-11', 'j', { percentual: 4 }), /Aplique antes o reajuste de 11.2024/);
  assert.throws(() => R.aplicarReajuste(d, c.id, '2024-11', 'j'), /digite o %/);
  R.aplicarReajuste(d, c.id, '2024-11', 'j', { percentual: 5 });
  assert.equal(R.aluguelAtual(d, c, '2024-12-01'), 210000);
  R.aplicarReajuste(d, c.id, '2025-11', 'j', { valor_novo: 220000 });
  assert.throws(() => R.aplicarReajuste(d, c.id, '2025-11', 'j', { percentual: 3 }), /já foi registrado/);
  assert.deepEqual(abertos(), ['2026-11 carta'], 'de ano anterior não pede carta');
  // desfazer: só a mais recente
  const [a2024, a2025] = R.correcoesDo(d, c.id);
  assert.throws(() => R.desfazerReajuste(d, a2024.id, 'j'), /mais recente/);
  R.desfazerReajuste(d, a2025.id, 'j');
  assert.equal(R.aluguelAtual(d, c, '2026-01-01'), 210000);
  assert.deepEqual(R.reajustesFeitos(d).map((x) => x.correcao.data_vigencia), ['2024-11-01']);
});

test('complemento da caução: vencimento escolhido, parcelas que somam na caução e desfazer o reajuste', () => {
  const d = R.bancoVazio();
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 4', endereco: 'Rua Teste, 30', cidade: 'Curitiba' }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Joana Teste', inquilino_cpf: '529.982.247-25',
    data_entrada: '2025-11-01', vigencia_inicio: '2025-11-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, garantia_tipo: 'Caução', caucao_valor: 540000, caucao_data: '2025-11-01', caucao_meses: 3, comprovante_caucao: 'c.pdf' }, 'julio');
  R.inserir(d, 'indices_acumulados', { indice: 'IGP-M', mes_ref: '2026-10', percentual: 5 }, 'julio');
  R.atualizar(d, 'contratos', c.id, { indice_correcao: 'IGP-M' }, 'julio');
  const corr = R.aplicarReajuste(d, c.id, '2026-11', 'julio');
  assert.equal(R.complementoCaucao(d, c).complemento, 27000);
  // 2 × R$ 135,00, a 1ª com mais prazo (10/01/2027) e a 2ª um mês depois
  const cbs = R.gerarBoletosCaucao(d, c.id, 'julio', null, { vencimento: '2027-01-10', parcelas: 2 });
  assert.deepEqual(cbs.map((x) => [x.competencia, x.vencimento, x.caucao_complemento, x.caucao_parcela, x.valor_nf]), [['2026-12', '2027-01-10', 13500, '1/2', null], ['2027-01', '2027-02-10', 13500, '2/2', null]]);
  assert.throws(() => R.gerarBoletoCaucao(d, c.id, 'julio'), /já foi gerado/);
  // paga a 2ª antes da 1ª: cada uma soma
  R.registrarPagamento(d, cbs[1].id, '2027-01-05', null, 'julio');
  assert.equal(R.valorGarantia(d, c), 553500);
  assert.equal(cbs[1].valor_nf, 0);
  R.registrarPagamento(d, cbs[0].id, '2026-12-20', null, 'julio');
  assert.equal(R.valorGarantia(d, c), 567000);
  // desfazer: a parcela paga por último primeiro; com parcela paga, o reajuste não sai
  assert.throws(() => R.estornarPagamento(d, cbs[1].id, 'julio'), /parcela mais recente/);
  assert.throws(() => R.desfazerReajuste(d, corr.id, 'julio'), /desfaça o pagamento/);
  R.estornarPagamento(d, cbs[0].id, 'julio');
  R.estornarPagamento(d, cbs[1].id, 'julio');
  assert.equal(R.valorGarantia(d, c), 540000);
  R.desfazerReajuste(d, corr.id, 'julio');
  assert.equal(d.cobrancas.filter((x) => R.ehComplementoCaucao(x)).length, 0, 'boletos da caução em aberto saem junto');
  assert.equal(R.aluguelAtual(d, c, '2026-12-01'), 200000);
});

test('caução paga por boleto vale para o reajuste do boleto, mesmo paga depois de um reajuste mais novo', () => {
  const d = R.bancoVazio();
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 5', endereco: 'Rua Teste, 40', cidade: 'Curitiba' }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Joana Teste', data_entrada: '2024-11-01', vigencia_inicio: '2024-11-01', aluguel_inicial: 200000,
    dia_vencimento: 10, garantia_tipo: 'Caução', caucao_valor: 600000, caucao_data: '2024-11-01', caucao_meses: 3, comprovante_caucao: 'c.pdf' }, 'julio');
  R.aplicarReajuste(d, c.id, '2025-11', 'julio', { valor_novo: 210000 });
  const [cb] = R.gerarBoletosCaucao(d, c.id, 'julio');
  assert.equal(cb.caucao_complemento, 30000);
  R.aplicarReajuste(d, c.id, '2026-11', 'julio', { valor_novo: 220000 });
  assert.ok(R.complementoCaucao(d, c).boleto, 'espera o boleto anterior ser pago');
  R.registrarPagamento(d, cb.id, '2026-11-20', null, 'julio');
  assert.equal(R.valorGarantia(d, c), 630000);
  assert.equal(R.complementoCaucao(d, c).complemento, 30000, 'o reajuste de 2026 ainda pede o seu complemento');
});

test('caução a completar: novo valor negociado também aparece; com boleto em aberto não registra depósito', () => {
  const d = R.bancoVazio();
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 6', endereco: 'Rua Teste, 50', cidade: 'Curitiba' }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Joana Teste', data_entrada: '2024-11-01', vigencia_inicio: '2024-11-01', aluguel_inicial: 200000,
    dia_vencimento: 10, garantia_tipo: 'Caução', caucao_valor: 600000, caucao_data: '2024-11-01', caucao_meses: 3, comprovante_caucao: 'c.pdf' }, 'julio');
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-05-01', indice: 'Negociado', valor_anterior: 200000, valor_novo: 230000 }, 'julio');
  const [y] = R.caucoesACompletar(d);
  assert.equal(y.x.correcao.indice, 'Negociado');
  assert.equal(y.x.complemento, 90000);
  // parcelamento negociado: cada boleto com a sua data e o seu valor (a soma tem de dar o complemento)
  assert.throws(() => R.gerarBoletosCaucao(d, c.id, 'julio', null, { plano: [{ vencimento: '2026-06-10', valor: 50000 }, { vencimento: '2026-08-20', valor: 30000 }] }), /somam R\$ 800,00/);
  const plano = R.gerarBoletosCaucao(d, c.id, 'julio', null, { plano: [{ vencimento: '2026-06-10', valor: 50000 }, { vencimento: '2026-06-25', valor: 10000 }, { vencimento: '2026-08-20', valor: 30000 }] });
  assert.deepEqual(plano.map((x) => [x.vencimento, x.caucao_complemento, x.caucao_parcela]), [['2026-06-10', 50000, '1/3'], ['2026-06-25', 10000, '2/3'], ['2026-08-20', 30000, '3/3']]);
  assert.throws(() => R.registrarComplementoDepositado(d, c.id, { data: '2026-05-10' }, 'julio'), /boleto do complemento/);
  assert.equal(R.caucoesACompletar(d)[0].abertos.length, 3);
});

test('arquivos dos lançamentos: nome esperado pelo tipo e data, etiqueta do dono e renomear em todos os lançamentos', () => {
  const d = R.bancoVazio();
  const c = R.inserir(d, 'contratos', { inquilino_nome: 'Ana Teste', garantia_tipo: 'Caução', caucao_valor: 300000, caucao_data: '2026-03-01', caucao_pago_em: '2026-03-05', comprovante_caucao: 'caucao ana.pdf' }, 'j');
  const dep = R.inserir(d, 'depositos_garantia', { contrato_id: c.id, qual: 'caucao', data: '2026-04-10', valor: 10000, comprovante: 'comprovante-caucao-2026-04-10 (2).pdf' }, 'j');
  R.inserir(d, 'vistorias', { contrato_id: c.id, tipo: 'Entrada', data: '2026-03-01', fotos: { fachada: 'vistoria-entrada-2026-03-01-fachada.jpg' } }, 'j');
  const lista = R.comprovantesComNome(d);
  assert.deepEqual(lista.map((x) => [x.nome, x.esperado, R.nomeBate(x.nome, x.esperado)]), [
    ['caucao ana.pdf', 'comprovante-caucao-2026-03-05', false],
    ['comprovante-caucao-2026-04-10 (2).pdf', 'comprovante-caucao-2026-04-10', true],
  ]);
  const rot = R.rotulosDosArquivos(d);
  assert.equal(rot.get(`contrato:${c.id}|caucao ana.pdf`), 'comprovante da caução');
  assert.match(rot.get(`contrato:${c.id}|vistoria-entrada-2026-03-01-fachada.jpg`), /foto da vistoria de entrada/);
  assert.equal(rot.get(`contrato:${c.id}|ficha.pdf`), undefined, 'arquivo solto não tem dono');
  // herdeiro que aponta para o comprovante do anterior também é trocado
  const h = R.inserir(d, 'contratos', { inquilino_nome: 'Bia Teste', comprovante_caucao: 'caucao ana.pdf', comprovante_caucao_contrato: c.id }, 'j');
  R.renomearReferencias(d, c.id, 'caucao ana.pdf', 'comprovante-caucao-2026-03-05.pdf', 'j');
  assert.equal(c.comprovante_caucao, 'comprovante-caucao-2026-03-05.pdf');
  assert.equal(h.comprovante_caucao, 'comprovante-caucao-2026-03-05.pdf');
  assert.equal(dep.comprovante, 'comprovante-caucao-2026-04-10 (2).pdf');
});

test('saída em duas etapas, leitura obrigatória (a mesma da vistoria) e imóvel corrigido só sem boleto pago', () => {
  const d = R.bancoVazio();
  const a = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa A', endereco: 'Rua A, 1' }, 'j');
  const b = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa B', endereco: 'Rua B, 2' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: a.id, inquilino_nome: 'Ana Teste', data_entrada: '2026-01-10', vigencia_inicio: '2026-01-10', aluguel_inicial: 100000, dia_vencimento: 10, conta_gas: 'Não tem' }, 'j');
  assert.deepEqual(R.relogiosDoContrato(c), ['agua', 'energia']);
  // imóvel lançado errado: corrige enquanto não há boleto pago (a leitura de entrada acompanha)
  R.gravarLeitura(d, c, 'Entrada do inquilino', '2026-01-10', { agua: '10', energia: '20' }, 'j');
  R.corrigirImovel(d, c.id, b.id, 'j');
  assert.equal(c.imovel_id, b.id);
  assert.equal(R.leituraDo(d, c.id, 'Entrada do inquilino').imovel_id, b.id);
  R.gerarCobrancas(d, '2026-01', 'j');
  R.registrarPagamento(d, d.cobrancas[0].id, '2026-02-10', null, 'j');
  assert.throws(() => R.corrigirImovel(d, c.id, a.id, 'j'), /boleto pago/);
  // 1ª etapa: a data; a vistoria de saída grava a leitura; 2ª etapa: o cálculo final usa a mesma leitura
  assert.throws(() => R.informarSaida(d, c.id, '2025-12-01', 'j'), /antes da entrada/);
  R.informarSaida(d, c.id, '2026-11-30', 'j');
  assert.equal(c.data_saida, '2026-11-30');
  assert.throws(() => R.gravarLeitura(d, c, 'Saída do inquilino', '2026-11-30', { agua: '50' }, 'j'), /energia/);
  R.gravarLeitura(d, c, 'Saída do inquilino', '2026-11-30', { agua: '50', energia: '60' }, 'j');
  R.encerrarContrato(d, c.id, { data_saida: '2026-11-30' }, 'j');
  assert.equal(d.leituras.filter((l) => l.momento === 'Saída do inquilino').length, 1, 'uma leitura de saída só');
  assert.throws(() => R.informarSaida(d, c.id, '2026-12-15', 'j'), /cálculo final/);
  assert.throws(() => R.desfazerSaida(d, c.id, 'j'), /cálculo final/);
});
