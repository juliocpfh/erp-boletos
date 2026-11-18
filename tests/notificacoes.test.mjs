// Notificação AO inquilino (pedido do dono em 2026-11-17): data limite em dias úteis com feriado, situações, nova notificação
// do mesmo assunto, multa no próximo boleto com o valor digitado (fora da NF), Desfazer pelo Histórico, alerta no Painel,
// PDF, e-mails, arquivo impresso e exclusão do contrato com os anexos. Dados fictícios (CPF 529.982.247-25).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as AI from '../docs/js/arquivo-impresso.js';
import { anexosProntos, dadosDoEmail } from '../docs/js/email-dados.js';
import { modeloEmail, montarEmail } from '../docs/js/modelos-email.js';
import * as NT from '../docs/js/notificacoes.js';
import { montarRecibo, reciboDisponivel } from '../docs/js/recibos.js';
import * as R from '../docs/js/regras.js';

/** Contrato com aluguel de R$ 2.000,00 (sem bonificação), vencimento dia 10 do mês seguinte, boleto de 11/2026 gerado. */
function base({ boleto = true } = {}) {
  const d = R.bancoVazio();
  R.normalizar(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Flores 3', endereco: 'Rua das Flores, 120', complemento: 'Apto 3', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com', inquilino_tipo: 'Pessoa física',
    data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', vigencia_fim: '2028-11-30', prazo_meses: 30, prazo_tipo: 'Determinado', aluguel_inicial: 200000, bonificacao: false,
    dia_vencimento: 10, cobranca_mes_seguinte: true, multa_percentual: 2, juros_mensal_percentual: 1, finalidade: 'Residencial', garantia_tipo: 'Sem garantia' }, 'j');
  if (boleto) R.gerarCobrancas(d, '2026-11', 'j');
  return { d, c, i };
}

/** Notificação do ar-condicionado em 17/11/2026, 10 dias úteis, com o texto do modelo completado. */
function notificar(d, c, extra = {}) {
  const n = { data: '2026-11-17', prazo_dias: 10, ...extra };
  const t = NT.textoDoModelo(d, c, n, 'obra');
  return R.criarNotificacao(d, { contrato_id: c.id, modelo: 'obra', ...n, assunto: t.assunto, clausula: t.clausula,
    texto: t.texto.replace(/\[preencher: [^\]]*\]/g, 'furo na fachada e tubulação aparente') }, 'j');
}

test('data limite em dias úteis: 17/11/2026 + 10 → 02/12/2026 (20/11 é feriado); dias úteis que faltam', () => {
  assert.equal(R.limiteNotificacao('2026-11-17', 10), '2026-12-02');
  assert.equal(R.limiteNotificacao('2026-11-13', 5), '2026-11-23', 'sexta + 5, com o feriado de 20/11');
  assert.equal(R.diasUteisAte('2026-11-27', '2026-12-02'), 3, '30/11, 01/12 e 02/12');
  assert.equal(R.diasUteisAte('2026-12-02', '2026-12-02'), 0, 'vence hoje');
  assert.equal(R.diasUteisAte('2026-12-03', '2026-12-02'), -1, 'vencida');
  assert.equal(R.regra('notificacao_prazo_dias'), 10);
  assert.equal(NT.prazoPorExtenso(10), '10 (dez) dias úteis');
});

test('texto pronto: cita a cláusula de obras e a da multa, o prazo e a data limite; "[preencher]" barra o salvar', () => {
  const { d, c } = base();
  const t = NT.textoDoModelo(d, c, { data: '2026-11-17', prazo_dias: 10 }, 'obra');
  assert.match(t.texto, /ar-condicionado/);
  assert.match(t.texto, /no prazo de 10 \(dez\) dias úteis contados desta notificação, ou seja, até 02\/12\/2026/);
  assert.match(t.texto, /\(cláusula 5ª do contrato\), e a Lei do Inquilinato/, 'número da cláusula de obras sem autorização no modelo residencial');
  assert.match(t.texto, /multa prevista no contrato \(cláusula \d+ª do contrato\)/);
  assert.match(t.clausula, /^cláusula 5ª do contrato; cláusula \d+ª do contrato$/);
  assert.match(t.texto, /Lei 8\.245\/91, artigo 23, inciso VI/);
  assert.equal(t.assunto, 'Instalação irregular ou obra sem autorização');
  assert.throws(() => R.criarNotificacao(d, { contrato_id: c.id, data: '2026-11-17', prazo_dias: 10, assunto: t.assunto, texto: t.texto }, 'j'), /Complete o texto/);
  // prazo mudado depois de montar: o texto ficaria com a data errada
  assert.throws(() => R.criarNotificacao(d, { contrato_id: c.id, data: '2026-11-17', prazo_dias: 5, assunto: 'x', texto: t.texto.replace(/\[preencher: [^\]]*\]/g, 'y') }, 'j'), /data limite certa \(25\/11\/2026/);
  for (const m of NT.MODELOS_NOTIFICACAO) {
    const x = NT.textoDoModelo(d, c, { data: '2026-11-17', prazo_dias: 10 }, m.chave);
    assert.match(x.texto, /02\/12\/2026/, m.chave);
    assert.doesNotMatch(x.texto, /\{[a-z_]+\}|\[se |\[fim\]/, m.chave);
  }
});

test('situações: rascunho → enviada (aguardando) → lembrete 3 dias úteis antes → vencida (pode multa) → baixa', () => {
  const { d, c } = base();
  const n = notificar(d, c);
  assert.equal(n.situacao, 'Rascunho');
  assert.equal(n.data_limite, '2026-12-02');
  assert.equal(R.estadoNotificacao(d, n, '2026-11-18').podeBaixa, false);
  const alertaRascunho = R.todosAlertas(d, '2026-11-18').find((a) => a.tipo === 'Notificação ao inquilino');
  assert.equal(alertaRascunho.nivel, 'info');
  assert.match(alertaRascunho.texto, /ainda não foi enviada/);
  R.marcarNotificacaoEnviada(d, n.id, { data: '2026-11-17', meio: 'E-mail' }, 'j');
  assert.equal(n.situacao, 'Aguardando resposta');
  assert.equal(R.estadoNotificacao(d, n, '2026-11-26').avisar, false, '4 dias úteis antes: ainda sem lembrete');
  const lembrete = R.todosAlertas(d, '2026-11-27').find((a) => a.tipo === 'Notificação ao inquilino');
  assert.equal(lembrete.nivel, 'aviso');
  assert.equal(lembrete.link, `#/notificacao/${n.id}`);
  assert.match(lembrete.texto, /termina em 02\/12\/2026 \(faltam 3 dia/);
  assert.match(R.todosAlertas(d, '2026-12-02').find((a) => a.tipo === 'Notificação ao inquilino').texto, /termina hoje/);
  const e = R.estadoNotificacao(d, n, '2026-12-03');
  assert.ok(e.vencida && e.podeMulta && e.podeReiterar && e.podeBaixa);
  const vencida = R.todosAlertas(d, '2026-12-03').find((a) => a.tipo === 'Notificação ao inquilino');
  assert.equal(vencida.nivel, 'perigo');
  assert.match(vencida.texto, /terminou em 02\/12\/2026: dê baixa se foi resolvido, mande outra notificação ou gere a multa/);
  R.darBaixaNotificacao(d, n.id, { data: '2026-12-04', comprovante: 'comprovante-baixa-notificacao-2026-12-04.jpg', observacao: 'ar reinstalado pelo técnico' }, 'j');
  assert.equal(n.situacao, 'Resolvida');
  assert.ok(!R.todosAlertas(d, '2026-12-05').some((a) => a.tipo === 'Notificação ao inquilino'), 'resolvida: o alerta some');
  assert.throws(() => R.marcarNotificacaoEnviada(d, n.id, { data: '2026-11-17', meio: 'E-mail' }, 'j'), /já foi marcada/);
});

test('nova notificação do mesmo assunto: cita a anterior; a anterior fica "Reiterada" e ainda aceita a multa; a baixa resolve as duas', () => {
  const { d, c } = base();
  const n1 = notificar(d, c);
  R.marcarNotificacaoEnviada(d, n1.id, { data: '2026-11-17', meio: 'Entregue em mãos (com assinatura)' }, 'j');
  const t = NT.textoDoModelo(d, c, { data: '2026-12-03', prazo_dias: 5, anterior_id: n1.id }, 'qualquer');
  assert.match(t.texto, /REITERA a notificação de 17\/11\/2026 \(recebida pelo LOCATÁRIO em 17\/11\/2026\), sobre instalação irregular ou obra sem autorização, cujo prazo terminou em 02\/12\/2026/);
  assert.match(t.texto, /até 10\/12\/2026/);
  assert.equal(t.assunto, n1.assunto);
  const n2 = R.criarNotificacao(d, { contrato_id: c.id, modelo: 'reiteracao', data: '2026-12-03', prazo_dias: 5, anterior_id: n1.id, assunto: t.assunto, texto: t.texto }, 'j');
  assert.equal(n1.reiterada_por, n2.id);
  assert.equal(R.numeroDaNotificacao(d, n2), 2);
  assert.throws(() => R.criarNotificacao(d, { contrato_id: c.id, data: '2026-12-03', prazo_dias: 5, anterior_id: n1.id, assunto: t.assunto, texto: t.texto }, 'j'), /já tem outra depois/);
  assert.equal(n1.situacao, 'Aguardando resposta', 'enquanto a 2ª é rascunho, a 1ª continua');
  R.marcarNotificacaoEnviada(d, n2.id, { data: '2026-12-03', meio: 'E-mail' }, 'j');
  assert.equal(n1.situacao, 'Reiterada');
  assert.ok(R.estadoNotificacao(d, n1, '2026-12-03').podeMulta, 'a 1ª, vencida, ainda pode gerar a multa');
  assert.ok(!R.estadoNotificacao(d, n2, '2026-12-03').podeMulta, 'a 2ª ainda está no prazo');
  assert.equal(montarRecibo(d, 'notificacao', { contrato: c, id: n2.id }, '2026-12-03').titulo, '2ª NOTIFICAÇÃO EXTRAJUDICIAL');
  R.darBaixaNotificacao(d, n2.id, { data: '2026-12-08' }, 'j');
  assert.deepEqual([n1.situacao, n2.situacao], ['Resolvida', 'Resolvida']);
});

test('cancelar a 2ª (ou excluir o rascunho) devolve a 1ª à espera', () => {
  const { d, c } = base();
  const n1 = notificar(d, c);
  R.marcarNotificacaoEnviada(d, n1.id, { data: '2026-11-17', meio: 'E-mail' }, 'j');
  const t = NT.textoDoModelo(d, c, { data: '2026-12-03', prazo_dias: 5, anterior_id: n1.id });
  const n2 = R.criarNotificacao(d, { contrato_id: c.id, data: '2026-12-03', prazo_dias: 5, anterior_id: n1.id, assunto: t.assunto, texto: t.texto }, 'j');
  R.excluirNotificacao(d, n2.id, 'j');
  assert.equal(n1.reiterada_por, null);
  const n3 = R.criarNotificacao(d, { contrato_id: c.id, data: '2026-12-03', prazo_dias: 5, anterior_id: n1.id, assunto: t.assunto, texto: t.texto }, 'j');
  R.marcarNotificacaoEnviada(d, n3.id, { data: '2026-12-03', meio: 'E-mail' }, 'j');
  assert.throws(() => R.excluirNotificacao(d, n3.id, 'j'), /Só o rascunho/);
  assert.throws(() => R.cancelarNotificacao(d, n1.id, '', 'j'), /cancele antes aquela/);
  R.cancelarNotificacao(d, n3.id, 'feita por engano', 'j', '2026-12-04');
  assert.equal(n1.situacao, 'Aguardando resposta');
  assert.equal(n1.reiterada_por, null);
});

test('multa: valor digitado vai ao próximo boleto do aluguel (fora da NF); retirar tira; o boleto no banco não muda', async () => {
  const { d, c } = base();
  const n = notificar(d, c);
  assert.throws(() => R.gerarMultaNotificacao(d, n.id, 200000, 'j', '2026-12-03'), /depois do prazo/, 'rascunho não gera multa');
  R.marcarNotificacaoEnviada(d, n.id, { data: '2026-11-17', meio: 'E-mail' }, 'j');
  assert.throws(() => R.gerarMultaNotificacao(d, n.id, 200000, 'j', '2026-12-02'), /depois do prazo \(02\/12\/2026\)/, 'no último dia ainda não');
  const cb = R.boletoDoMes(d, c.id, '2026-11');
  assert.equal(cb.vencimento, '2026-12-10');
  const p = R.previaMultaNotificacao(d, n.id, '2026-12-03');
  assert.equal(p.sugerido, 200000, 'sugere 1 aluguel (regra notificacao_multa_alugueis)');
  assert.equal(p.boleto.id, cb.id);
  assert.throws(() => R.gerarMultaNotificacao(d, n.id, 0, 'j', '2026-12-03'), /Digite o valor/);
  const r = R.gerarMultaNotificacao(d, n.id, 150000, 'j', '2026-12-03');
  assert.equal(r.boleto.id, cb.id);
  assert.equal(n.situacao, 'Multa gerada');
  assert.equal(cb.outros, 150000);
  assert.equal(cb.outros_descricao, 'Multa por descumprimento da notificação de 17/11/2026');
  assert.equal(R.totais(cb).a_pagar_sem_desconto, 350000, 'R$ 2.000,00 + R$ 1.500,00');
  // decisão do dono (17/11/2026): sem multa nem juros de atraso sobre a multa da notificação: base R$ 2.000,00, não R$ 3.500,00
  assert.equal(R.totais(cb).base_multa, 200000, 'multa e juros do atraso só sobre o aluguel');
  const C = await import('../docs/js/calculos.js');
  const atraso = C.liquidar(cb, '2026-12-20');
  assert.ok(cb.multa_percentual > 0, 'boleto com multa de atraso');
  assert.equal(atraso.multa, Math.round(200000 * cb.multa_percentual / 100), 'multa de atraso sobre R$ 2.000,00');
  assert.match(R.dadosBoleto(d, cb).descricao, /MULTA NOTIF\. 17\/11\/2026 RS1\.500,00|MULTA NOTIF\. 17\/11\/2026 R\$ ?1\.500,00/);
  assert.ok(R.dadosBoleto(d, cb).descricao.length <= R.LIMITE_DESCRICAO_BOLETO);
  assert.throws(() => R.ajustarBoleto(d, cb.id, 0, '', 'j'), /Retirar a multa/, 'o "Tirar ajuste" não apaga a multa');
  assert.ok(!R.todosAlertas(d, '2026-12-03').some((a) => a.tipo === 'Notificação ao inquilino' && a.nivel === 'perigo'), 'com a multa gerada, o vermelho some');
  // retirar
  R.retirarMultaNotificacao(d, n.id, 'j');
  assert.equal(cb.outros, 0);
  assert.equal(cb.outros_descricao, '');
  assert.deepEqual(cb.multas_notificacao, []);
  assert.equal(n.situacao, 'Aguardando resposta');
  // de novo, e pago em dia: a NF sai só com o aluguel
  R.gerarMultaNotificacao(d, n.id, 200000, 'j', '2026-12-03');
  R.registrarPagamento(d, cb.id, '2026-12-10', null, 'j');
  assert.equal(cb.valor_pago, 400000);
  assert.equal(cb.valor_nf, 200000, 'multa contratual não é aluguel: fora da NF');
  assert.throws(() => R.retirarMultaNotificacao(d, n.id, 'j'), /já foi paga no boleto de 11\/2026/);
});

test('multa sem boleto em aberto: espera e entra no boleto quando ele for gerado; boleto emitido no banco é pulado', () => {
  const { d, c } = base({ boleto: false });
  const n = notificar(d, c);
  R.marcarNotificacaoEnviada(d, n.id, { data: '2026-11-17', meio: 'E-mail' }, 'j');
  const r = R.gerarMultaNotificacao(d, n.id, 200000, 'j', '2026-12-03');
  assert.equal(r.boleto, null);
  assert.match(R.todosAlertas(d, '2026-12-03').find((a) => a.tipo === 'Notificação ao inquilino').texto, /entra no próximo boleto do aluguel, quando ele for gerado/);
  R.gerarCobrancas(d, '2026-11', 'j');
  const cb = R.boletoDoMes(d, c.id, '2026-11');
  assert.equal(cb.outros, 200000);
  assert.equal(n.multa_cobranca_id, cb.id);
  // boleto já emitido no banco: a multa de outra notificação vai para o seguinte
  cb.banco = { situacao: 'emitido' };
  const n2 = notificar(d, c, { data: '2026-11-18' });
  R.marcarNotificacaoEnviada(d, n2.id, { data: '2026-11-18', meio: 'E-mail' }, 'j');
  assert.equal(R.gerarMultaNotificacao(d, n2.id, 50000, 'j', '2026-12-04').boleto, null);
  R.gerarCobrancas(d, '2026-12', 'j');
  assert.equal(R.boletoDoMes(d, c.id, '2026-12').outros, 50000);
});

test('Desfazer pelo Histórico: a multa sai do boleto em aberto junto; com o boleto pago, o Histórico não desfaz', () => {
  const { d, c } = base();
  const n = notificar(d, c);
  R.marcarNotificacaoEnviada(d, n.id, { data: '2026-11-17', meio: 'E-mail' }, 'j');
  R.gerarMultaNotificacao(d, n.id, 200000, 'j', '2026-12-03');
  const cb = R.boletoDoMes(d, c.id, '2026-11');
  const i = d.historico.findIndex((h) => h.tabela === 'notificacoes' && h.detalhes && h.detalhes.multa_valor);
  assert.ok(i >= 0);
  const itens = R.gravacaoDesfazivel(d, i);
  assert.ok(itens, 'a linha da multa pode ser desfeita');
  for (const { tabela, id } of R.desfazerAlteracoes(d, itens, 'admin')) if (tabela === 'notificacoes') R.sincronizarMultas(d, R.buscar(d, tabela, id).contrato_id, 'admin');
  assert.equal(n.multa_valor, null);
  assert.equal(n.situacao, 'Aguardando resposta');
  assert.equal(cb.outros, 0, 'a multa saiu do boleto');
  assert.equal(n.multa_cobranca_id, null, 'e a ligação com o boleto');
  // gerada de novo e paga: o Histórico barra
  R.gerarMultaNotificacao(d, n.id, 200000, 'j', '2026-12-03');
  R.registrarPagamento(d, cb.id, '2026-12-10', null, 'j');
  const j = d.historico.map((h, k) => [h, k]).filter(([h]) => h.tabela === 'notificacoes' && h.detalhes && h.detalhes.multa_valor).at(-1)[1];
  assert.equal(R.gravacaoDesfazivel(d, j), null);
  assert.match(R.motivoNaoDesfazer(d, 'notificacoes', n, 'multa_valor', null), /já foi paga/);
});

test('PDF, e-mails e anexos: assinada vai no e-mail; arquivo impresso; excluir o contrato apaga a notificação e os anexos', () => {
  const { d, c } = base();
  const n = notificar(d, c);
  assert.ok(reciboDisponivel(d, 'notificacao', { contrato: c, id: n.id }).ok);
  const r = montarRecibo(d, 'notificacao', { contrato: c, id: n.id }, '2026-11-17');
  assert.equal(r.titulo, 'NOTIFICAÇÃO EXTRAJUDICIAL');
  assert.deepEqual(r.tabela.slice(0, 3), [['Data desta notificação', '17/11/2026'], ['Prazo para cumprir', '10 dias úteis'], ['Data limite', '02/12/2026']]);
  assert.match(r.paragrafos[0], /NOTIFICADO \(LOCATÁRIO\): Maria Exemplo, CPF 529\.982\.247-25/);
  assert.doesNotMatch(r.arquivo, /[À-ÿ]/, 'nome do arquivo sem acento');
  const alvo = { contrato: c, notificacao: n };
  const e = montarEmail(modeloEmail(d, 'notificacao_envio'), dadosDoEmail(d, alvo, {}, '2026-11-17'));
  assert.equal(e.assunto, 'Notificação: Instalação irregular ou obra sem autorização (Rua das Flores, 120 – Apto 3)');
  assert.match(e.texto, /Prazo para resolver: 10 \(dez\) dias úteis, até 02\/12\/2026/);
  assert.doesNotMatch(e.texto + e.assunto, /\[preencher|\{[a-z_]+\}/);
  assert.match(montarEmail(modeloEmail(d, 'notificacao_lembrete'), dadosDoEmail(d, alvo, {}, '2026-12-02')).texto, /termina hoje, 02\/12\/2026/);
  assert.deepEqual(anexosProntos(d, modeloEmail(d, 'notificacao_envio'), alvo).map((a) => [a.tipo, a.ok]), [['recibo', true]], 'sem a assinada: o PDF para assinar');
  R.anexarComprovante(d, 'notificacoes', n.id, 'arquivo_assinado', 'comprovante-notificacao-assinada-2026-11-17.pdf', 'j');
  assert.deepEqual(anexosProntos(d, modeloEmail(d, 'notificacao_envio'), alvo).map((a) => [a.tipo, a.nome]), [['arquivo', 'comprovante-notificacao-assinada-2026-11-17.pdf']]);
  assert.ok(R.arquivosReferenciados(d).some((a) => a.escopo === 'contrato' && a.id === c.id && a.nome === 'comprovante-notificacao-assinada-2026-11-17.pdf'));
  assert.match(R.rotulosDosArquivos(d).get(`contrato:${c.id}|comprovante-notificacao-assinada-2026-11-17.pdf`), /notificação de 17\/11\/2026 assinada/);
  assert.ok(AI.itensDaPasta(d, c).some((x) => x.vaga === `notificacao:${n.id}` && x.nome === 'comprovante-notificacao-assinada-2026-11-17.pdf'), 'vai para a pasta física');
  R.removerAnexo(d, 'notificacoes', n.id, 'arquivo_assinado', 'j');
  assert.equal(n.arquivo_assinado, null);
  R.anexarComprovante(d, 'notificacoes', n.id, 'arquivo_assinado', 'comprovante-notificacao-assinada-2026-11-17.pdf', 'j');
  R.excluirContrato(d, c.id, 'admin');
  assert.equal(d.notificacoes.length, 0);
  assert.ok(!R.arquivosReferenciados(d).some((a) => a.nome === 'comprovante-notificacao-assinada-2026-11-17.pdf'), 'o arquivo deixa de ser usado (a tela apaga da pasta)');
});
