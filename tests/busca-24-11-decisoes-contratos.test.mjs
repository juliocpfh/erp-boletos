// Decisões do dono de 24/11/2026 sobre a busca de 24/11, lote A (contratos e fichas): FIC-03, CON-04, CON-06, CON-07 e BOL-08.
// Pessoas fictícias; CPF e CNPJ de teste.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true, endereco_sede: 'Rua A, 1', representante_nome: 'Ana' }, 'j');
  const casa = R.inserir(d, 'imoveis', { nome: 'Casa 3', endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: casa.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Maria Teste', inquilino_cpf: '529.982.247-25', inquilino_genero: 'Feminino',
    data_entrada: '2025-01-10', vigencia_inicio: '2025-01-10', vigencia_fim: '2027-07-10', prazo_meses: 30, aluguel_inicial: 180000, dia_vencimento: 10,
    indice_correcao: 'IPCA', garantia_tipo: 'Fiador', finalidade: 'Residencial', descricao_objeto: 'a casa nº 3', ...extra }, 'j');
  return { d, c, casa };
}

test('FIC-03: ficha reprovada com a reserva por devolver não tem os dados apagados; os 3 meses contam da devolução', () => {
  const d = R.bancoVazio();
  const a = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto A' }, 'j');
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Interessado Teste', inquilino_cpf: '529.982.247-25', data_recebida: '2026-08-01', situacao: 'Reprovada',
    decisao_data: '2026-08-10', modo_imoveis: 'Apenas um dos imóveis', imoveis_ids: [a.id], reserva_valor: 50000, reserva_data: '2026-08-02' }, 'j');
  assert.ok(R.devolucaoPendente(f));
  assert.equal(R.dataApagarDocumentosFicha(f), null, 'sem a devolução, não apaga');
  assert.ok(R.apagarFichaEsperaDevolucao(f), 'a tela diz que espera a devolução');
  assert.deepEqual(R.fichasComDocumentosVencidos(d, '2027-12-31'), []);
  // documentos que já saíram por regra antiga: os dados pessoais também esperam a devolução
  R.atualizar(d, 'fichas', f.id, { documentos_apagados_em: '2026-11-10' }, 'j');
  assert.deepEqual(R.fichasComDadosVencidos(d, '2027-12-31'), []);
  R.atualizar(d, 'fichas', f.id, { documentos_apagados_em: null, devolucao_data: '2026-10-05', devolucao_valor: 50000 }, 'j');
  const g = R.buscar(d, 'fichas', f.id);
  assert.equal(R.inicioPrazoApagarFicha(g), '2026-10-05');
  assert.equal(R.dataApagarDocumentosFicha(g), '2027-01-05', '05/10/2026 + 3 meses');
  assert.deepEqual(R.fichasComDocumentosVencidos(d, '2027-01-04'), []);
  assert.equal(R.fichasComDocumentosVencidos(d, '2027-01-05').length, 1);
  assert.ok(!R.apagarFichaEsperaDevolucao(g));
  // sem reserva: conta da decisão, como antes
  const h = R.inserir(d, 'fichas', { inquilino_nome: 'Outro Teste', data_recebida: '2026-08-01', situacao: 'Reprovada', decisao_data: '2026-08-10', imoveis_ids: [a.id] }, 'j');
  assert.equal(R.dataApagarDocumentosFicha(h), '2026-11-10');
});

test('CON-04: multa da saída antecipada do novo titular é proporcional ao prazo do contrato original', () => {
  const { d, c } = base({ data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01', vigencia_fim: '2028-07-01', prazo_meses: 30, aluguel_inicial: 200000 });
  const n = R.inserir(d, 'contratos', { imovel_id: c.imovel_id, contrato_anterior_id: c.id, inquilino_nome: 'Lia Teste', inquilino_cpf: '529.982.247-25',
    data_entrada: '2027-01-01', vigencia_inicio: '2027-01-01', prazo_tipo: 'Determinado', prazo_meses: 30, aluguel_inicial: 200000, dia_vencimento: 10, garantia_tipo: 'Fiador', finalidade: 'Residencial' }, 'j');
  R.inserir(d, 'aditivos', { contrato_id: n.id, tipo: 'Troca de titular', data: '2027-01-01', arquivo: 'termo.pdf' }, 'j');
  n.data_saida = '2028-01-01';
  const m = R.multaSaidaAntecipada(d, n);
  assert.equal(m.total, 912, 'de 01/01/2026 a 01/07/2028');
  assert.equal(m.restam, 182);
  assert.equal(m.valor, 119737, 'R$ 6.000,00 × 182 ÷ 912 = R$ 1.197,37');
  assert.equal(m.inicio, '2026-01-01');
  assert.ok(m.herdado);
  // renovação registrada no contrato do novo titular: vale a data nova
  R.registrarRenovacao(d, n.id, { tipo: 'Renovado com nova data de término', data: '2027-06-01', nova_vigencia_fim: '2029-01-01' }, 'j');
  const r = R.multaSaidaAntecipada(d, R.buscar(d, 'contratos', n.id));
  assert.equal(r.fim, '2029-01-01');
  assert.equal(r.total, 1096, 'de 01/01/2026 a 01/01/2029');
  // titular original sem troca: como antes (início = a entrada dele)
  const s = base({ data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01', vigencia_fim: '2028-07-01', prazo_meses: 30, aluguel_inicial: 200000 });
  const o = R.multaSaidaAntecipada(s.d, { ...s.c, data_saida: '2027-09-01' });
  assert.equal(o.valor, 200000);
  assert.ok(!o.herdado);
});

test('CON-06: a carta do reajuste de dezembro continua pedida em janeiro até vencer o boleto que leva o reajuste', () => {
  const { d, c } = base({ data_entrada: '2025-12-05', vigencia_inicio: '2025-12-05', vigencia_fim: '2028-06-05', aluguel_inicial: 200000 });
  R.inserir(d, 'indices_acumulados', { indice: 'IPCA', mes_ref: '2026-11', percentual: 5 }, 'j');
  R.aplicarReajuste(d, c.id, '2026-12', 'j');
  const venc = R.vencimentoDoReajuste(d, c, '2026-12');
  assert.equal(venc, '2027-01-10', 'o reajuste de 12/2026 vai no boleto que vence 10/01/2027');
  for (const hoje of ['2026-12-28', '2027-01-02', '2027-01-10']) {
    const r = R.reajusteNaCompetencia(d, c, '2026-12', hoje);
    assert.ok(r.comCarta && r.faltaCarta, `carta pedida em ${hoje}`);
    assert.ok(R.alertasContrato(d, c, hoje).some((a) => a.tipo === 'Reajuste do aluguel' && /carta/.test(a.texto)), `aviso em ${hoje}`);
  }
  const depois = R.reajusteNaCompetencia(d, c, '2026-12', '2027-01-12');
  assert.ok(!depois.comCarta, 'depois do vencimento: só a correção, como os de anos anteriores');
});

test('CON-07: termo do novo valor "não valeu": a data de término gravada com a renovação volta', () => {
  const { d, c } = base();
  const ren = R.registrarRenovacao(d, c.id, { tipo: 'Renovado com nova data de término', data: '2027-07-10', nova_vigencia_fim: '2030-01-10', novo_valor: 200000, vale_desde: '2027-08' }, 'j');
  assert.equal(R.buscar(d, 'contratos', c.id).vigencia_fim, '2030-01-10');
  const ad = d.aditivos.find((a) => a.renovacao_id === ren.id);
  R.atualizar(d, 'aditivos', ad.id, { arquivo: 'x.pdf', assinado_em: '2026-11-24' }, 'j');
  const msg = R.desfazerAditivo(d, ad.id, 'j');
  const x = R.buscar(d, 'contratos', c.id);
  assert.equal(x.vigencia_fim, '2027-07-10', 'volta a 10/07/2027');
  assert.equal(x.prazo_meses, 30);
  assert.equal(R.fimDoContrato(d, x), '2027-07-10');
  assert.match(msg, /volta a 10\/07\/2027/);
  assert.doesNotMatch(msg, /continua/);
  // prazo indeterminado gravado com o novo valor também volta
  const ren2 = R.registrarRenovacao(d, c.id, { tipo: 'Passou a prazo indeterminado', data: '2027-07-10', novo_valor: 190000, vale_desde: '2027-08' }, 'j');
  assert.equal(R.buscar(d, 'contratos', c.id).prazo_tipo, 'Indeterminado');
  const ad2 = d.aditivos.find((a) => a.renovacao_id === ren2.id);
  R.atualizar(d, 'aditivos', ad2.id, { arquivo: 'y.pdf', assinado_em: '2026-11-24' }, 'j');
  R.desfazerAditivo(d, ad2.id, 'j');
  assert.notEqual(R.buscar(d, 'contratos', c.id).prazo_tipo, 'Indeterminado');
  assert.equal(R.buscar(d, 'contratos', c.id).vigencia_fim, '2027-07-10');
});

test('BOL-08: termo de troca do vencimento que não valeu: todos voltam ao dia antigo, também o alterado à mão e o emitido no banco (com aviso)', () => {
  const { d, c } = base({ data_entrada: '2026-01-10', vigencia_inicio: '2026-01-10', vigencia_fim: '2028-07-10' });
  for (const m of ['2026-11', '2026-12', '2027-01']) R.gerarCobrancas(d, m, 'j');
  const a = R.salvarAditivoVencimento(d, c.id, { data: '2026-11-05', dia_novo: '20', mes: '2026-12', texto: 'texto' }, 'j');
  R.assinarAditivo(d, a.id, { data: '2026-11-06', arquivo: 'termo.pdf' }, 'j');
  const doMes = (comp) => R.boletoDoMes(d, c.id, comp);
  assert.equal(doMes('2026-11').vencimento, '2026-12-20');
  // o de 11/2026 (vence 20/12) foi emitido no banco com o dia 20; o de 12/2026 (vence 20/01) foi alterado à mão (só o IPTU)
  R.atualizar(d, 'cobrancas', doMes('2026-11').id, { banco: { situacao: 'emitido', vencimento: '2026-12-20', valor: R.totais(doMes('2026-11')).a_pagar_sem_desconto, conta_id: 'ank' } }, 'j');
  R.atualizar(d, 'cobrancas', doMes('2026-12').id, { editado_manual: true, campos_manuais: ['iptu'], iptu: 4321 }, 'j');
  assert.equal(R.alertasContrato(d, c, '2026-11-24').filter((x) => x.tipo === 'Banco').length, 0);
  const txt = R.desfazerAditivo(d, a.id, 'j');
  assert.equal(doMes('2026-11').vencimento, '2026-12-10', 'o emitido no banco volta no sistema');
  assert.equal(doMes('2026-11').banco.vencimento, '2026-12-20', 'no banco continua o dia 20 até alguém cancelar e emitir de novo');
  assert.equal(doMes('2026-12').vencimento, '2027-01-10', 'o alterado à mão volta');
  assert.equal(doMes('2026-12').iptu, 4321, 'com o valor digitado');
  assert.equal(doMes('2027-01').vencimento, '2027-02-10');
  assert.match(txt, /cancele no banco e emita de novo/);
  // o aviso fica na página do inquilino e no Painel até resolver
  const alerta = () => R.alertasContrato(d, R.buscar(d, 'contratos', c.id), '2026-11-24').find((x) => x.tipo === 'Banco');
  assert.ok(alerta());
  assert.equal(alerta().nivel, 'perigo');
  assert.match(alerta().texto, /Boleto de 11\/2026 de Maria Teste: emitido no banco com vencimento 20\/12\/2026\. Cancele no banco e emita de novo com vencimento 10\/12\/2026/);
  assert.equal(alerta().link, `#/cobranca/${doMes('2026-11').id}`);
  // cancelado no banco: o aviso some
  R.registrarCancelamentoBancario(d, doMes('2026-11').id, 'j');
  assert.equal(alerta(), undefined);
});

test('BOL-08: emitido no banco e já atualizado no banco com o vencimento novo: sem aviso', () => {
  const { d, c } = base({ data_entrada: '2026-01-10', vigencia_inicio: '2026-01-10', vigencia_fim: '2028-07-10' });
  R.gerarCobrancas(d, '2026-11', 'j');
  const a = R.salvarAditivoVencimento(d, c.id, { data: '2026-11-05', dia_novo: '20', mes: '2026-12', texto: 'texto' }, 'j');
  R.assinarAditivo(d, a.id, { data: '2026-11-06', arquivo: 'termo.pdf' }, 'j');
  const cb = R.boletoDoMes(d, c.id, '2026-11');
  R.atualizar(d, 'cobrancas', cb.id, { banco: { situacao: 'emitido', vencimento: '2026-12-20', valor: 180000 } }, 'j');
  R.desfazerAditivo(d, a.id, 'j');
  R.atualizar(d, 'cobrancas', cb.id, { banco: { ...cb.banco, vencimento: '2026-12-10' } }, 'j');
  assert.equal(R.boletosParaReemitir(d, c).length, 0);
});

test('BOL-06: NF do aluguel proporcional pago com atraso sai "1 × total"; pago em dia continua "16/30 × aluguel"', async () => {
  const { quantidadeDaFatura } = await import('../docs/js/fatura.js');
  const montar = () => {
    const d = R.bancoVazio();
    const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
    const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', complemento: '', cidade: 'Curitiba' }, 'j');
    R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
    const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Teste', inquilino_cpf: '529.982.247-25', data_entrada: '2026-11-15', vigencia_inicio: '2026-11-15',
      aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 10, multa_percentual: 10, juros_mensal_percentual: 1, conta_condominio: 'Por conta do inquilino' }, 'j');
    R.gerarCobrancas(d, '2026-11', 'j');
    return { d, cb: R.boletoDoMes(d, c.id, '2026-11') };
  };
  const atraso = montar();
  assert.equal(atraso.cb.dias_cobrados, 16);
  R.registrarPagamento(atraso.d, atraso.cb.id, '2027-01-05', null, 'j', { dataPagou: '2027-01-05' });
  R.numerarFaturas(atraso.d, 'j');
  const f = atraso.d.faturas[0];
  assert.equal(f.valor, 118244, 'a regra da NF de 16/10 continua (perda da bonificação, multa e juros)');
  assert.deepEqual(quantidadeDaFatura(f), { proporcional: false, quantidade: '1', unitario: 118244 });
  const emDia = montar();
  R.registrarPagamento(emDia.d, emDia.cb.id, emDia.cb.vencimento, null, 'j', { dataPagou: emDia.cb.vencimento });
  R.numerarFaturas(emDia.d, 'j');
  const q = quantidadeDaFatura(emDia.d.faturas[0]);
  assert.equal(q.quantidade, '16/30');
  assert.equal(q.unitario, 180000, 'como hoje: 16/30 do aluguel com a bonificação (a NF de quem paga em dia não muda)');
});
