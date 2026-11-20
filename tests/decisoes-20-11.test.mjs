// Decisões do dono de 20/11/2026 (pendências do mutirão de 19/11): seguro contra incêndio sempre existe, boleto do saldo do
// cálculo final, correção da conta paga pelo banco, sobra do IPTU com parcela arredondada.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as K from '../docs/js/contratos.js';
import { anexosProntos, dadosDoEmail } from '../docs/js/email-dados.js';
import * as F from '../docs/js/formularios.js';
import { atualizarTextoEmail, modeloEmail, montarEmail } from '../docs/js/modelos-email.js';
import * as R from '../docs/js/regras.js';

function base(extra = {}) {
  const d = R.bancoVazio();
  R.normalizar(d);
  R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  R.normalizar(d);
  const i = R.inserir(d, 'imoveis', { nome: 'Flores 3', endereco: 'Rua das Flores, 120', cidade: 'Curitiba', uf: 'PR' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com',
    aluguel_inicial: 200000, dia_vencimento: 10, data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01', prazo_meses: 30, cobranca_mes_seguinte: true,
    multa_percentual: 10, juros_mensal_percentual: 1, garantia_tipo: 'Caução', caucao_valor: 200000, ...extra }, 'j');
  return { d, c, i };
}
const texto = (d, chave, alvo, hoje = '2026-11-20') => montarEmail(modeloEmail(d, chave), dadosDoEmail(d, alvo, {}, hoje)).texto;

test('seguro contra incêndio: sem "Não tem" no formulário; contrato antigo "Não tem" tem alerta e pendência, nada muda nos dados', () => {
  assert.deepEqual(F.SITUACOES_SEGURO, ['Por conta do inquilino', 'Incluso no aluguel']);
  for (const lista of [F.CONTRATO, F.FICHA_FIM || []]) {
    const campo = lista.find((x) => x.nome === 'conta_seguro');
    if (campo) assert.ok(!campo.opcoes.includes('Não tem'));
  }
  const { d, c } = base({ conta_seguro: 'Não tem' });
  R.normalizar(d);
  assert.equal(R.buscar(d, 'contratos', c.id).conta_seguro, 'Não tem');
  const a = R.alertasContrato(d, c, '2026-11-20').find((x) => x.tipo === 'Seguro contra incêndio');
  assert.match(a.texto, /escolha quem paga/);
  assert.ok(R.TIPOS_ALERTA.includes('Seguro contra incêndio'));
  assert.ok(K.pendenciasDoContrato(d, c).some((x) => /seguro contra incêndio/.test(x)));
  // escolhido quem paga: o alerta some; o parágrafo do incêndio muda conforme a opção
  for (const [op, frase] of [['Por conta do inquilino', /cobrados juntamente com o aluguel/], ['Incluso no aluguel', /já está incluído no valor do aluguel/]]) {
    R.atualizar(d, 'contratos', c.id, { conta_seguro: op }, 'j');
    const ct = R.buscar(d, 'contratos', c.id);
    assert.equal(R.alertasContrato(d, ct, '2026-11-20').some((x) => x.tipo === 'Seguro contra incêndio'), false);
    const m = K.modelosDe(d).find((x) => !/n[ãa]o residencial|comercial/i.test(x.nome));
    const blocos = K.montarContrato(m.texto, K.dadosDoContrato(d, ct, { data: '2026-01-01' }));
    assert.match(blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : '')).join(' '), frase);
  }
});

function comSaida(saldo) {
  const { d, c } = base({ data_saida: '2026-10-31' });
  const e = R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2026-10-31', garantia_valor: 200000, garantia_corrigida: 200000, debitos: 200000 - saldo, saldo }, 'j');
  return { d, c, e };
}

test('boleto do saldo do cálculo final: avulso, sem NF, com a multa e os juros do contrato; o e-mail diz "Segue o boleto do saldo"', () => {
  const { d, c, e } = comSaida(-30000);
  assert.doesNotMatch(texto(d, 'saida_calculo', { contrato: c }), /Segue o boleto/);
  assert.throws(() => R.gerarBoletoDoSaldo(d, e.id, '2026-11-10', 'j', '2026-11-20'), /antes de hoje/);
  const cb = R.gerarBoletoDoSaldo(d, e.id, '2026-11-30', 'j', '2026-11-20');
  assert.equal(cb.outros, 30000);
  assert.equal(cb.aluguel, 0);
  assert.equal(cb.saldo_saida_de, e.id);
  assert.ok(R.ehBoletoAvulso(cb) && R.ehSaldoSaida(cb) && !R.semMultaJuros(cb));
  assert.equal(cb.multa_percentual, 10);
  assert.equal(cb.juros_mensal_percentual, 1);
  assert.equal(R.totais(cb).a_pagar_sem_desconto, 30000);
  assert.equal(R.boletoDoMes(d, c.id, cb.competencia), null); // não é o aluguel do mês
  assert.equal(R.cobrancasEmAberto(d, c.id).some((x) => x.id === cb.id), false); // não entra nos débitos de novo
  assert.throws(() => R.gerarBoletoDoSaldo(d, e.id, '2026-11-30', 'j', '2026-11-20'), /já foi gerado/);
  // atrasado: multa e juros do contrato (10% e 1% ao mês), sem bonificação
  const atraso = C.liquidar(cb, '2026-12-20');
  assert.equal(atraso.multa, 3000);
  assert.ok(atraso.juros > 0 && atraso.valor_devido === 30000 + 3000 + atraso.juros);
  assert.equal(C.liquidar(cb, '2026-11-30').valor_devido, 30000);
  const t = texto(d, 'saida_calculo', { contrato: c });
  assert.match(t, /Segue o boleto do saldo de R\$ 300,00, com vencimento em 30\/11\/2026\./);
  assert.doesNotMatch(t, /deposite ou faça o Pix/);
  // emitido no C6: a linha digitável vai no texto e o PDF e o Pix entram nos anexos do sistema
  R.atualizar(d, 'cobrancas', cb.id, { banco: { situacao: 'emitido', conta_id: 'jck', id_externo: 'X1', linha_digitavel: '33690.00000 00000.000000 00000.000000 1 00000000030000', pix_copia_cola: '000201PIX', pix_qr_base64: 'AAAA' } }, 'j');
  assert.match(texto(d, 'saida_calculo', { contrato: c }), /Linha digitável: 33690/);
  const anexos = anexosProntos(d, modeloEmail(d, 'saida_calculo'), { contrato: c });
  assert.deepEqual(anexos.map((a) => a.tipo + ':' + a.qual), ['boleto:pdf', 'boleto:pix']);
  // modelo já gravado com o texto da manhã de 20/11: troca para o novo
  const gravado = atualizarTextoEmail('saida_calculo', '[se cobrar]Falta pagar o saldo de {saldo}: deposite ou faça o Pix na conta abaixo e responda com o comprovante.\n{conta_deposito}[fim]');
  assert.match(gravado, /\[se boleto_saldo\]Segue o boleto do saldo/);
  // saldo a devolver: não há boleto
  const x = comSaida(5000);
  assert.throws(() => R.gerarBoletoDoSaldo(x.d, x.e.id, '2026-11-30', 'j', '2026-11-20'), /não é a pagar/);
});

test('desfazer o cálculo final: boleto do saldo em aberto sai junto; pago ou emitido no C6, barrado', () => {
  const { d, e } = comSaida(-30000);
  const cb = R.gerarBoletoDoSaldo(d, e.id, '2026-11-30', 'j', '2026-11-20');
  assert.equal(R.motivoNaoDesfazerSaldo(d, e), null);
  R.atualizar(d, 'cobrancas', cb.id, { banco: { situacao: 'emitido' } }, 'j');
  assert.match(R.motivoNaoDesfazerSaldo(d, e), /emitido no C6/);
  R.atualizar(d, 'cobrancas', cb.id, { banco: null }, 'j');
  R.registrarPagamento(d, cb.id, '2026-11-28', 30000, 'j');
  const pago = R.buscar(d, 'cobrancas', cb.id);
  assert.ok(!(pago.valor_nf > 0)); // sem NF
  assert.match(R.motivoNaoDesfazerSaldo(d, e), /já foi pago/);
  R.excluirBoletoDoSaldo(d, e.id, 'j');
  assert.ok(R.buscar(d, 'cobrancas', cb.id)); // pago não sai
  // em aberto: sai junto
  const y = comSaida(-12345);
  const cb2 = R.gerarBoletoDoSaldo(y.d, y.e.id, '2026-11-30', 'j', '2026-11-20');
  R.excluir(y.d, 'encerramentos', y.e.id, 'j', 'desfeito');
  R.excluirBoletoDoSaldo(y.d, y.e.id, 'j');
  assert.ok(!R.buscar(y.d, 'cobrancas', cb2.id));
});

test('conta paga pelo banco lançada errada: o administrador corrige o lançamento; o pagamento no banco fica', () => {
  const { d, i } = base();
  const outro = R.inserir(d, 'imoveis', { nome: 'Flores 4', endereco: 'Rua das Flores, 122' }, 'j');
  const pag = R.inserir(d, 'pagamentos_banco', { origem: { tipo: 'despesa' }, imovel_id: i.id, valor: 21000, situacao: 'pago', tipo_conta: 'Luz' }, 'j');
  const x = R.inserir(d, 'despesas', { imovel_id: i.id, tipo: 'Luz', competencia: '2026-10', valor: 12000, data_pagamento: '2026-11-05', pagamento_banco_id: pag.id }, 'j');
  assert.throws(() => R.corrigirContaPagaPeloBanco(d, x.id, { valor: 21000, competencia: '2026-11', imovel_id: outro.id }, 'op', 'operador'), /Só o administrador/);
  R.corrigirContaPagaPeloBanco(d, x.id, { valor: 21000, competencia: '2026-11', imovel_id: outro.id }, 'j', 'admin');
  const y = R.buscar(d, 'despesas', x.id);
  assert.deepEqual([y.valor, y.competencia, y.imovel_id, y.pagamento_banco_id, y.data_pagamento], [21000, '2026-11', outro.id, pag.id, '2026-11-05']);
  assert.deepEqual(R.buscar(d, 'pagamentos_banco', pag.id), pag);
  const sem = R.inserir(d, 'despesas', { imovel_id: i.id, tipo: 'Água', competencia: '2026-10', valor: 5000, data_pagamento: '2026-11-05' }, 'j');
  assert.throws(() => R.corrigirContaPagaPeloBanco(d, sem.id, { valor: 1, competencia: '2026-10', imovel_id: i.id }, 'j'), /não foi paga pelo banco/);
});

test('IPTU com parcela arredondada: a guia real vai à prefeitura e a sobra abate o custo do dono nos Resultados', () => {
  const { d, c, i } = base({ cobrar_iptu: true, conta_iptu: 'Por conta do inquilino' });
  // guia de R$ 2.125,37 em 10 × R$ 213,00 (R$ 2.130,00): sobra R$ 4,63
  const p = R.inserir(d, 'iptus', { imovel_id: i.id, ano: 2026, valor_total: 212537, num_parcelas: 10, valor_parcela: 21300, primeiro_vencimento_boleto: '2026-02' }, 'j');
  const ps = R.parcelasIptu(d, p);
  assert.equal(ps.reduce((s, x) => s + x.valor, 0), 212537); // à prefeitura: a guia real
  assert.ok(ps.every((x) => x.valorCobrado === 21300));
  for (const comp of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
    const cb = R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: comp, vencimento: `${C.somarMeses(comp, 1)}-10`, aluguel: 200000, iptu: 21300, iptu_parcela: 'IPTU 2026',
      data_pagamento: `${C.somarMeses(comp, 1)}-10`, valor_pago: 221300, situacao: 'Paga em dia' }, 'j');
    assert.ok(cb);
  }
  const t = R.totaisIptu(d, p);
  assert.deepEqual([t.custo, t.inquilino, t.proprietario], [212537, 213000, -463]);
  // Resultados do ano: o IPTU do dono é a sobra (negativa = abate o custo)
  const linha = R.resultadosFinanceiros(d, '2026-01-01', '2027-12-31').find((x) => x.imovel.id === i.id);
  assert.equal(linha.iptu, -463);
});

test('boleto do saldo pago: marca sozinho o saldo cobrado; desfazer o pagamento volta a etapa', () => {
  const { d, e } = comSaida(-30000);
  const cb = R.gerarBoletoDoSaldo(d, e.id, '2026-11-30', 'j', '2026-11-20');
  R.registrarPagamento(d, cb.id, '2026-11-28', null, 'j');
  assert.equal(R.buscar(d, 'encerramentos', e.id).garantia_devolvida_em, '2026-11-28');
  assert.equal(R.buscar(d, 'cobrancas', cb.id).valor_nf, 0); // sem NF
  R.estornarPagamento(d, cb.id, 'j');
  assert.equal(R.buscar(d, 'encerramentos', e.id).garantia_devolvida_em, null);
});
