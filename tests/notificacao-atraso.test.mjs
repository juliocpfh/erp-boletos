// Notificação de aluguel em atraso (pedido do dono em 24/11/2026, "sim, sem multa contratual"): lista os boletos vencidos com a
// multa de 2% e os juros do dia, dá o prazo em dias úteis, não sugere nem gera a multa contratual e dá baixa sozinha quando os
// boletos (ou todas as parcelas do acordo que os substituiu) forem pagos. Dados fictícios (CPF 529.982.247-25).
import assert from 'node:assert/strict';
import test from 'node:test';
import { dadosDoEmail } from '../docs/js/email-dados.js';
import { modeloEmail, montarEmail } from '../docs/js/modelos-email.js';
import * as NT from '../docs/js/notificacoes.js';
import { montarRecibo } from '../docs/js/recibos.js';
import * as R from '../docs/js/regras.js';

/** Aluguel de R$ 1.800,00 (sem bonificação), vence dia 14 do mês seguinte, multa 2% e juros 1% ao mês; boleto de 10/2026 (vence 14/11/2026). */
function base() {
  const d = R.bancoVazio();
  R.normalizar(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Flores 3', endereco: 'Rua das Flores, 120', complemento: 'Apto 3', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com', inquilino_tipo: 'Pessoa física',
    data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', vigencia_fim: '2028-11-30', prazo_meses: 30, prazo_tipo: 'Determinado', aluguel_inicial: 180000, bonificacao: false,
    dia_vencimento: 14, cobranca_mes_seguinte: true, multa_percentual: 2, juros_mensal_percentual: 1, finalidade: 'Residencial', garantia_tipo: 'Sem garantia' }, 'j');
  R.gerarCobrancas(d, '2026-10', 'j');
  return { d, c, cb: d.cobrancas[0] };
}

/** Notificação de atraso em 24/11/2026 (10 dias de atraso), 10 dias úteis, já enviada. */
function notificar(d, c, extra = {}) {
  const n = { data: '2026-11-24', prazo_dias: 10, ...extra };
  const t = NT.textoDoModelo(d, c, n, 'atraso');
  const x = R.criarNotificacao(d, { contrato_id: c.id, modelo: 'atraso', ...n, assunto: t.assunto, clausula: t.clausula, texto: t.texto }, 'j');
  R.marcarNotificacaoEnviada(d, x.id, { data: n.data, meio: 'E-mail' }, 'j');
  return x;
}

test('texto: boleto de R$ 1.800,00 com 10 dias de atraso = multa R$ 36,00 + juros R$ 6,00 = R$ 1.842,00; sem multa contratual', () => {
  const { d, c, cb } = base();
  assert.equal(cb.vencimento, '2026-11-14');
  assert.deepEqual(R.devidoNoAtraso(cb, '2026-11-24'), { valor: 180000, dias: 10, multa: 3600, juros: 600, total: 184200 });
  const t = NT.textoDoModelo(d, c, { data: '2026-11-24', prazo_dias: 10 }, 'atraso');
  assert.equal(t.assunto, 'Aluguel em atraso');
  assert.match(t.texto, /- Aluguel de 10\/2026, vencido em 14\/11\/2026 \(10 dias de atraso\): R\$ 1\.800,00 \+ multa de R\$ 36,00 \+ juros de R\$ 6,00 = R\$ 1\.842,00/);
  assert.match(t.texto, /Total devido em 24\/11\/2026: R\$ 1\.842,00/);
  assert.match(t.texto, /multa de 2% e aos juros de 1% ao mês/);
  assert.match(t.texto, /até 08\/12\/2026, pagar os valores acima/);
  assert.doesNotMatch(t.texto, /multa prevista no contrato|aluguéis|cobrada no boleto do aluguel/, 'sem a multa contratual de 1 a 3 aluguéis');
  assert.doesNotMatch(t.texto, /\[preencher/);
  assert.match(t.clausula, /^cláusula \d+ª do contrato$/, 'só a cláusula do aluguel');
  // sem boleto vencido: o texto pede para conferir e o salvar recusa
  const sem = NT.textoDoModelo(d, c, { data: '2026-11-10', prazo_dias: 10 }, 'atraso');
  assert.match(sem.texto, /\[preencher: não há boleto vencido/);
  assert.throws(() => R.criarNotificacao(d, { contrato_id: c.id, modelo: 'atraso', data: '2026-11-10', prazo_dias: 10, assunto: 'Aluguel em atraso', texto: sem.texto.replace(/\[preencher: [^\]]*\]/, 'x') }, 'j'), /não tem boleto vencido em aberto/);
});

test('prazo vencido: não sugere nem gera a multa contratual; o alerta pede outra notificação ou acordo', () => {
  const { d, c } = base();
  const n = notificar(d, c);
  assert.deepEqual(n.boletos, [d.cobrancas[0].id]);
  const e = R.estadoNotificacao(d, n, '2026-12-09');
  assert.equal(e.vencidaSemMulta, true);
  assert.equal(e.podeMulta, false);
  assert.throws(() => R.previaMultaNotificacao(d, n.id, '2026-12-09'), /não tem multa contratual/);
  assert.throws(() => R.gerarMultaNotificacao(d, n.id, 180000, 'j', '2026-12-09'), /não tem multa contratual/);
  assert.equal(R.sincronizarMultas(d, c.id, 'j'), 0);
  assert.ok(d.cobrancas.every((x) => !(x.multas_notificacao || []).length));
});

test('baixa automática quando o boleto é pago; desfazer o pagamento reabre', () => {
  const { d, c, cb } = base();
  const n = notificar(d, c);
  R.registrarPagamento(d, cb.id, '2026-11-30', null, 'j');
  assert.equal(n.situacao, 'Resolvida');
  assert.equal(n.resolvida_em, '2026-11-30');
  assert.equal(n.baixa_automatica, true);
  assert.match(n.observacao_baixa, /Baixa automática: boleto\(s\) 10\/2026 pago\(s\)/);
  R.estornarPagamento(d, cb.id, 'j');
  assert.equal(n.situacao, 'Aguardando resposta');
  assert.equal(n.resolvida_em, null);
});

test('reiteração: lista os boletos ainda em aberto e a baixa de pagamento resolve as duas', () => {
  const { d, c, cb } = base();
  const n1 = notificar(d, c);
  const dados = { data: '2026-12-09', prazo_dias: 5, anterior_id: n1.id };
  const t = NT.textoDoModelo(d, c, dados, 'reiteracao');
  assert.match(t.texto, /REITERA a notificação de 24\/11\/2026/);
  assert.match(t.texto, /Aluguel de 10\/2026, vencido em 14\/11\/2026 \(25 dias de atraso\): R\$ 1\.800,00 \+ multa de R\$ 36,00 \+ juros de R\$ 15,00 = R\$ 1\.851,00/);
  assert.doesNotMatch(t.texto, /multa prevista no contrato|será cobrada no boleto/);
  const n2 = R.criarNotificacao(d, { contrato_id: c.id, modelo: 'reiteracao', ...dados, assunto: t.assunto, clausula: t.clausula, texto: t.texto }, 'j');
  assert.equal(n2.modelo, 'reiteracao_atraso');
  assert.deepEqual(n2.boletos, n1.boletos);
  R.marcarNotificacaoEnviada(d, n2.id, { data: '2026-12-09', meio: 'E-mail' }, 'j');
  assert.equal(n1.situacao, 'Reiterada');
  assert.equal(montarRecibo(d, 'notificacao', { contrato: c, id: n2.id }, '2026-12-09').titulo, '2ª NOTIFICAÇÃO EXTRAJUDICIAL');
  R.registrarPagamento(d, cb.id, '2026-12-10', null, 'j');
  assert.equal(n2.situacao, 'Resolvida');
  assert.equal(n1.situacao, 'Resolvida');
});

test('acordo: a baixa só vem com todas as parcelas pagas', () => {
  const { d, c, cb } = base();
  const n = notificar(d, c);
  const { parcelas } = R.fazerAcordo(d, { contrato_id: c.id, ids: [cb.id], total: 184200, parcelas: 2, primeiro_vencimento: '2026-12-10' }, 'j', '2026-11-26');
  assert.equal(R.atrasoQuitado(d, n), '');
  R.registrarPagamento(d, parcelas[0].id, '2026-12-10', null, 'j');
  assert.equal(n.situacao, 'Aguardando resposta', 'falta a 2ª parcela');
  R.registrarPagamento(d, parcelas[1].id, '2027-01-11', null, 'j');
  assert.equal(n.situacao, 'Resolvida');
  assert.equal(n.resolvida_em, '2027-01-11');
});

test('PDF e e-mails: prazo para pagar, sem "multa do contrato" no lembrete', () => {
  const { d, c } = base();
  const n = notificar(d, c);
  const r = montarRecibo(d, 'notificacao', { contrato: c, id: n.id }, '2026-11-24');
  assert.equal(r.titulo, 'NOTIFICAÇÃO EXTRAJUDICIAL');
  assert.ok(r.paragrafos.some((p) => /^- Aluguel de 10\/2026/.test(p)), 'cada boleto num parágrafo');
  const alvo = { contrato: c, notificacao: n };
  const e = montarEmail(modeloEmail(d, 'notificacao_envio'), dadosDoEmail(d, alvo, {}, '2026-11-24'));
  assert.match(e.texto, /Prazo para pagar: 10 \(dez\) dias úteis, até 08\/12\/2026/);
  assert.doesNotMatch(e.texto + e.assunto, /\[preencher|\{[a-z_]+\}|\[se |\[fim\]/);
  const l = montarEmail(modeloEmail(d, 'notificacao_lembrete'), dadosDoEmail(d, alvo, {}, '2026-12-08')).texto;
  assert.match(l, /Se já pagou, desconsidere/);
  assert.doesNotMatch(l, /multa do contrato/);
});
