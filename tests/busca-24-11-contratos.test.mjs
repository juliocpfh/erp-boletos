import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';
import * as K from '../docs/js/contratos.js';
import { MODELOS_PADRAO } from '../docs/js/modelos-contrato.js';

// Busca de erros de 24/11, lote 2: contratos, troca de titular, reajuste, acordo e saída (CON-01/02/03/05/07/08/09, DOC-03/04).
// Pessoas fictícias; CPF e CNPJ de teste.
function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true, endereco_sede: 'Rua A, 1', representante_nome: 'Maria' }, 'j');
  const casa = R.inserir(d, 'imoveis', { nome: 'Casa 3', endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: casa.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'João Souza', inquilino_cpf: '529.982.247-25', inquilino_genero: 'Masculino',
    data_entrada: '2025-01-10', vigencia_inicio: '2025-01-10', vigencia_fim: '2027-07-10', prazo_meses: 30, aluguel_inicial: 180000, dia_vencimento: 10,
    indice_correcao: 'IPCA', garantia_tipo: 'Caução', caucao_valor: 360000, caucao_meses: 2, finalidade: 'Residencial', descricao_objeto: 'a casa nº 3', ...extra }, 'j');
  return { d, c, casa };
}
function novoTitular(d, c, entrada, extra = {}) {
  return R.inserir(d, 'contratos', { imovel_id: c.imovel_id, contrato_anterior_id: c.id, inquilino_nome: 'Maria Lima', inquilino_cpf: '529.982.247-25',
    data_entrada: entrada, vigencia_inicio: entrada, aluguel_inicial: 180000, dia_vencimento: 10, indice_correcao: 'IPCA', garantia_tipo: 'Fiador', finalidade: 'Residencial', ...extra }, 'j');
}

test('CON-01: excluir o novo titular antes de a troca se completar tira a saída do anterior', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  const n = novoTitular(d, c, '2026-12-01');
  R.inserir(d, 'aditivos', { contrato_id: n.id, tipo: 'Troca de titular', data: '2026-11-20', arquivo: 'termo.pdf' }, 'j');
  const out = R.transferirHeranca(d, n.id, 'j', '2026-11-24');
  assert.ok(out.agendada);
  assert.equal(R.buscar(d, 'contratos', c.id).data_saida, '2026-11-30');
  R.excluirContrato(d, n.id, 'j');
  const a = R.buscar(d, 'contratos', c.id);
  assert.equal(a.data_saida, null, 'João continua no contrato');
  assert.equal(R.roteiroSaida(d, a, '2026-11-24').length, 0, 'sem roteiro de saída');
  assert.equal(R.contratoAtivo(a, '2026-12-05'), true);
});

test('CON-01: saída de verdade do anterior (não a véspera da troca) fica', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  const n = novoTitular(d, c, '2026-12-01');
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-15' }, 'j');
  R.excluirContrato(d, n.id, 'j');
  assert.equal(R.buscar(d, 'contratos', c.id).data_saida, '2026-11-15');
});

test('CON-01: com a troca já completada, excluir o novo titular é barrado (o fiador do anterior não some)', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null, caucao_meses: null });
  R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'Pedro Fiador', cpf: '529.982.247-25' }, 'j');
  const n = novoTitular(d, c, '2026-10-01', { aluguel_inicial: 189000, garantia_na_troca: 'continua' });
  R.inserir(d, 'aditivos', { contrato_id: n.id, tipo: 'Troca de titular', data: '2026-10-01', arquivo: 'termo.pdf' }, 'j');
  R.transferirHeranca(d, n.id, 'j', '2026-11-01');
  const nn = R.buscar(d, 'contratos', n.id);
  assert.ok(nn.heranca_transferida);
  assert.match(R.motivoNaoExcluirHerdeiro(d, nn), /já foi completada em 01\/10\/2026/);
  assert.throws(() => R.excluirContrato(d, n.id, 'j'), /troca de titular já foi completada/);
  assert.ok(R.buscar(d, 'contratos', n.id), 'contrato continua');
  assert.equal(d.fiadores.filter((f) => f.contrato_id === n.id).length, 1, 'fiador continua');
  // contrato sem troca: nada barra
  assert.equal(R.motivoNaoExcluirHerdeiro(d, R.buscar(d, 'contratos', c.id)), null);
});

test('CON-02: termo da troca "não valeu" tira a saída do anterior e ele volta a ter boleto', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  const n = novoTitular(d, c, '2026-12-01');
  const ad = R.inserir(d, 'aditivos', { contrato_id: n.id, tipo: 'Troca de titular', data: '2026-11-20', arquivo: 'termo.pdf' }, 'j');
  R.transferirHeranca(d, n.id, 'j', '2026-11-24');
  assert.equal(R.buscar(d, 'contratos', c.id).data_saida, '2026-11-30');
  assert.match(R.desfazerAditivo(d, ad.id, 'j', { excluirTermo: false }), /João Souza continua no contrato/);
  const a = R.buscar(d, 'contratos', c.id);
  assert.equal(a.data_saida, null);
  assert.ok(R.trocaAguardaAditivo(d, R.buscar(d, 'contratos', n.id)));
  assert.equal(R.contratoAtivo(a, '2026-12-05'), true);
  R.gerarCobrancas(d, '2026-12', 'j');
  const dez = d.cobrancas.filter((x) => x.competencia === '2026-12');
  assert.deepEqual(dez.map((x) => [x.contrato_id, x.aluguel]), [[c.id, 180000]], 'dezembro cobrado de João, cheio');
});

test('CON-03: troca no meio do mês do reajuste já aplicado no anterior não pede o reajuste de novo', () => {
  const { d, c } = base({ data_entrada: '2026-03-10', vigencia_inicio: '2026-03-10', vigencia_fim: '2028-09-10', garantia_tipo: 'Fiador', caucao_valor: null, aluguel_inicial: 200000 });
  R.inserir(d, 'indices_acumulados', { indice: 'IPCA', mes_ref: '2027-02', percentual: 5 }, 'j');
  R.aplicarReajuste(d, c.id, '2027-03', 'j');
  const n = novoTitular(d, c, '2027-03-15', { aluguel_inicial: 210000 });
  R.inserir(d, 'aditivos', { contrato_id: n.id, tipo: 'Troca de titular', data: '2027-03-01', arquivo: 'termo.pdf' }, 'j');
  R.transferirHeranca(d, n.id, 'j', '2027-03-16');
  const nn = R.buscar(d, 'contratos', n.id);
  assert.equal(nn.aluguel_inicial, 210000, 'Maria começa com o aluguel já corrigido');
  const abertos = R.reajustesAbertos(d, '2027-03-16').filter((r) => r.contrato.id === n.id && r.competencia === '2027-03' && !r.corrigido);
  assert.equal(abertos.length, 0, 'sem reajuste de 03/2027 em aberto para Maria');
  assert.equal(R.alertasContrato(d, nn, '2027-03-16').filter((a) => /^Reajuste/.test(a.tipo) && /Corrija/.test(a.texto)).length, 0);
  const doMes = R.reajustesDoMes(d, '2027-03', '2027-03-16').filter((r) => r.contrato.id === n.id);
  assert.ok(doMes.every((r) => r.corrigido), 'na Gestão o de Maria aparece como feito');
  // o reajuste seguinte (03/2028) continua sendo de Maria
  const r28 = R.reajusteNaCompetencia(d, nn, '2028-03', '2028-02-20');
  assert.ok(r28 && !r28.corrigido);
});

test('CON-03: troca no dia 1º sem o reajuste aplicado: o reajuste do mês continua em aberto no novo', () => {
  const { d, c } = base({ data_entrada: '2026-03-10', vigencia_inicio: '2026-03-10', vigencia_fim: '2028-09-10', garantia_tipo: 'Fiador', caucao_valor: null, aluguel_inicial: 200000 });
  R.inserir(d, 'indices_acumulados', { indice: 'IPCA', mes_ref: '2027-02', percentual: 5 }, 'j');
  const n = novoTitular(d, c, '2027-03-01', { aluguel_inicial: 200000 });
  R.inserir(d, 'aditivos', { contrato_id: n.id, tipo: 'Troca de titular', data: '2027-02-20', arquivo: 'termo.pdf' }, 'j');
  R.transferirHeranca(d, n.id, 'j', '2027-03-02');
  const r = R.reajusteNaCompetencia(d, R.buscar(d, 'contratos', n.id), '2027-03', '2027-03-02');
  assert.ok(r && !r.corrigido);
});

function comAcordoNaSaida() {
  const { d, c } = base({ data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', vigencia_fim: '2028-12-01', garantia_tipo: 'Fiador', caucao_valor: null, aluguel_inicial: 135000, cobranca_mes_seguinte: true, multa_percentual: 10, juros_mensal_percentual: 1 });
  for (const comp of ['2026-06', '2026-07']) R.gerarCobrancas(d, comp, 'j');
  const jul = R.boletoDoMes(d, c.id, '2026-07');
  R.registrarPagamento(d, R.boletoDoMes(d, c.id, '2026-06').id, '2026-07-10', null, 'j');
  const { acordo } = R.fazerAcordo(d, { contrato_id: c.id, ids: [jul.id], total: 150000, parcelas: 3, primeiro_vencimento: '2026-10-10' }, 'j', '2026-09-19');
  return { d, c, jul, acordo };
}

test('CON-05: acordo com parcela descontada da garantia no cálculo final não se desfaz', () => {
  const { d, c, jul, acordo } = comAcordoNaSaida();
  R.informarSaida(d, c.id, '2026-09-30', 'j', '2026-09-19');
  R.gerarCobrancas(d, '2026-08', 'j'); R.gerarCobrancas(d, '2026-09', 'j');
  const deb = R.debitosDaSaida(d, R.buscar(d, 'contratos', c.id), '2026-10-01');
  R.encerrarContrato(d, c.id, { data_saida: '2026-09-30', garantia_valor: 0, indice_percentual: 0, debitos: deb.total, debitos_descricao: deb.itens.map((x) => x.texto).join('\n'), leitura_agua: '1', leitura_energia: '2' }, 'j', '2026-10-01');
  assert.ok(R.parcelasDoAcordo(d, acordo).every((p) => R.quitadoNaSaida(p)));
  assert.throws(() => R.desfazerAcordo(d, acordo.id, 'j', '2026-10-02'), /desfaça antes o cálculo final/);
  assert.notEqual(R.buscar(d, 'cobrancas', jul.id).situacao, 'Em aberto');
  assert.equal(R.aCobrar(R.buscar(d, 'cobrancas', jul.id)), false);
});

test('CON-05: acordo sem parcela paga nem descontada continua podendo ser desfeito', () => {
  const { d, jul, acordo } = comAcordoNaSaida();
  R.desfazerAcordo(d, acordo.id, 'j', '2026-09-20');
  assert.equal(R.buscar(d, 'cobrancas', jul.id).situacao, 'Em aberto');
});

test('CON-07: termo do novo valor que não valeu: a data de término volta à de antes (decisão do dono de 24/11)', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  const ren = R.registrarRenovacao(d, c.id, { tipo: 'Renovado com nova data de término', data: '2027-07-10', nova_vigencia_fim: '2030-01-10', novo_valor: 200000, vale_desde: '2027-08' }, 'j');
  const ad = d.aditivos.find((a) => a.renovacao_id === ren.id);
  R.atualizar(d, 'aditivos', ad.id, { arquivo: 'x.pdf', assinado_em: '2026-11-24' }, 'j');
  const msg = R.desfazerAditivo(d, ad.id, 'j', { excluirTermo: true });
  assert.match(msg, /O novo valor de R\$ 2\.000,00 saiu/);
  assert.match(msg, /data de término do contrato volta a 10\/07\/2027/);
  assert.equal(R.buscar(d, 'contratos', c.id).vigencia_fim, '2027-07-10');
});

test('CON-07: renovação antiga (sem o prazo de antes guardado): a data fica e a tela avisa para conferir', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  const ren = R.registrarRenovacao(d, c.id, { tipo: 'Renovado com nova data de término', data: '2027-07-10', nova_vigencia_fim: '2030-01-10', novo_valor: 200000, vale_desde: '2027-08' }, 'j');
  for (const k of ['vigencia_fim_anterior', 'prazo_meses_anterior', 'prazo_tipo_anterior']) delete ren[k];
  const ad = d.aditivos.find((a) => a.renovacao_id === ren.id);
  R.atualizar(d, 'aditivos', ad.id, { arquivo: 'x.pdf', assinado_em: '2026-11-24' }, 'j');
  const msg = R.desfazerAditivo(d, ad.id, 'j', { excluirTermo: true });
  assert.match(msg, /data de término do contrato continua 10\/01\/2030.*Editar contrato/);
  assert.equal(R.buscar(d, 'contratos', c.id).vigencia_fim, '2030-01-10');
});

test('CON-07: termo do novo valor sem nova data de término: mensagem de sempre', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  const ren = R.registrarRenovacao(d, c.id, { tipo: 'Novo valor negociado', data: '2026-12-01', novo_valor: 200000, vale_desde: '2026-12' }, 'j');
  const ad = d.aditivos.find((a) => a.renovacao_id === ren.id);
  R.atualizar(d, 'aditivos', ad.id, { arquivo: 'x.pdf', assinado_em: '2026-11-24' }, 'j');
  assert.doesNotMatch(R.desfazerAditivo(d, ad.id, 'j', { excluirTermo: true }), /data de término/);
});

test('CON-08: roteiro da saída só marca a titularidade de volta com o protocolo', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  R.informarSaida(d, c.id, '2027-02-26', 'j', '2026-11-24');
  const contas = (hoje) => R.roteiroSaida(d, R.buscar(d, 'contratos', c.id), hoje).find((x) => x.chave === 'contas');
  for (const hoje of ['2026-11-24', '2027-09-30']) {
    assert.equal(contas(hoje).feito, false, hoje);
    assert.match(contas(hoje).detalhe, /falta o protocolo da volta da titularidade/, hoje);
  }
  R.inserir(d, 'titularidades', { imovel_id: c.imovel_id, contrato_id: c.id, tipo: 'Volta para o proprietário', data: '2027-02-27', protocolo: '123' }, 'j');
  assert.match(contas('2027-03-01').detalhe, /titularidade de volta ✓/);
  assert.equal(R.alertaTitularidade(d, R.buscar(d, 'contratos', c.id), '2027-03-01'), null);
});

test('CON-09: roteiro da saída não promete devolver caução que não foi depositada', () => {
  const { d, c } = base({ caucao_valor: 270000 });
  R.informarSaida(d, c.id, '2026-11-20', 'j', '2026-11-24');
  const cc = R.buscar(d, 'contratos', c.id);
  assert.equal(R.garantiaRecebida(d, cc), 0);
  const g = R.roteiroSaida(d, cc, '2026-11-24').find((x) => x.chave === 'garantia');
  assert.doesNotMatch(g.detalhe, /2\.700,00/);
  assert.match(g.detalhe, /sem caução ou depósito a devolver/);
  // depositada: o valor aparece
  R.atualizar(d, 'contratos', c.id, { comprovante_caucao: 'caucao.pdf', caucao_pago_em: '2025-01-10' }, 'j');
  const g2 = R.roteiroSaida(d, R.buscar(d, 'contratos', c.id), '2026-11-24').find((x) => x.chave === 'garantia');
  assert.match(g2.detalhe, /R\$ 2\.700,00 a acertar no cálculo final/);
});

test('DOC-03: número do próximo termo aditivo conta a cadeia de contratos', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null });
  R.inserir(d, 'aditivos', { contrato_id: c.id, tipo: 'Vencimento', data: '2026-01-10', numero: 1, arquivo: 'a1.pdf' }, 'j');
  const n = novoTitular(d, c, '2026-10-01');
  R.inserir(d, 'aditivos', { contrato_id: n.id, tipo: 'Troca de titular', data: '2026-10-01', numero: 2, arquivo: 'a2.pdf' }, 'j');
  assert.equal(R.proximoNumeroAditivo(d, n), 3);
});

const textoDe = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : '')).join('\n');
test('DOC-04: aviso e notificação de desocupação sem data de fim (prazo indeterminado) não deixam buraco', () => {
  const ex = K.exemploDeDocumento();
  const c = { ...ex.c, prazo_tipo: 'Indeterminado', vigencia_fim: null, prazo_meses: null };
  ex.d.contratos = [c];
  const gerar = (tipo, fim) => {
    const m = MODELOS_PADRAO.find((x) => x.tipo === tipo);
    return textoDe(K.montarContrato(m.texto, K.dadosDoDocumento(ex.d, c, tipo, K.valoresDeExemplo(tipo), { data: '2026-11-24', fim })));
  };
  const aviso = gerar('aviso_desocupacao', null);
  assert.doesNotMatch(aviso, /\(\)/);
  assert.match(aviso, /prazo indeterminado: basta o aviso de 30 \(trinta\) dias, sem multa/);
  const notif = gerar('notificacao_desocupacao', null);
  assert.doesNotMatch(notif, /terminou em {2}|terminou em e/);
  assert.match(notif, /que vigora por prazo indeterminado/);
  // com o fim do contrato: o texto de sempre, com a data
  assert.match(gerar('aviso_desocupacao', '2027-07-10'), /fim do prazo do contrato \(10 de julho de 2027\), incide a multa/);
  assert.match(gerar('notificacao_desocupacao', '2027-07-10'), /cujo prazo terminou em 10 de julho de 2027 e que continua por prazo indeterminado/);
});
