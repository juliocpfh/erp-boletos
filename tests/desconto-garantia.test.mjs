// Boleto descontado da garantia no cálculo final da saída (pedido do dono de 25/11/2026: "o boleto fecha, mediante cancelamento
// em banco"): antes de gravar, a tela mostra o que vai acontecer (``R.oQueAconteceNoDesconto``) e o operador dá o ok. Gravado, a
// notificação de aluguel em atraso do boleto fecha; desfeito o cálculo, ela reabre. Dados fictícios (CPF 529.982.247-25).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as NT from '../docs/js/notificacoes.js';
import * as R from '../docs/js/regras.js';

/** Caução de R$ 5.400,00, aluguel de R$ 1.800,00 sem multa nem juros (o valor do boleto vencido continua R$ 1.800,00); boleto 10/2026 vence 14/11/2026. */
function base({ pdf = true, notificar = true } = {}) {
  const d = R.bancoVazio();
  R.normalizar(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Flores 3', endereco: 'Rua das Flores, 120', complemento: 'Apto 3', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com', inquilino_tipo: 'Pessoa física',
    data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', vigencia_fim: '2028-11-30', prazo_meses: 30, prazo_tipo: 'Determinado', aluguel_inicial: 180000, bonificacao: false,
    dia_vencimento: 14, cobranca_mes_seguinte: true, multa_percentual: 0, juros_mensal_percentual: 0, finalidade: 'Residencial', garantia_tipo: 'Caução', caucao_valor: 540000 }, 'j');
  R.gerarCobrancas(d, '2026-10', 'j');
  const cb = d.cobrancas[0];
  if (pdf) R.atualizar(d, 'cobrancas', cb.id, { boleto_pdf: 'boleto-10-2026.pdf', boleto_pdf_contrato: c.id }, 'j');
  let n = null;
  if (notificar) {
    const x = { data: '2026-11-24', prazo_dias: 10 };
    const t = NT.textoDoModelo(d, c, x, 'atraso');
    n = R.criarNotificacao(d, { contrato_id: c.id, modelo: 'atraso', ...x, assunto: t.assunto, clausula: t.clausula, texto: t.texto }, 'j');
    R.marcarNotificacaoEnviada(d, n.id, { data: x.data, meio: 'E-mail' }, 'j');
  }
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-25' }, 'j');
  return { d, c: R.buscar(d, 'contratos', c.id), cb, n };
}

/** Os dados do formulário do cálculo final como a tela monta (débitos vindos de ``debitosDaSaida``). */
function dadosDaTela(d, c, hoje = '2026-11-25') {
  const deb = R.debitosDaSaida(d, c, hoje);
  return { data_saida: c.data_saida, garantia_valor: 540000, indice_percentual: 0, debitos: deb.total, debitos_descricao: deb.itens.map((x) => x.texto).join('\n'),
    fci_credito: 0, fci_danos: 0, creditos: 0, vistoria_saida: 'Não feita', leitura_agua: '123', leitura_energia: '456' };
}

test('lista do que vai acontecer: pago com a caução, notificação fechada, cancelar no banco e R$ 5.400,00 − R$ 1.800,00 = R$ 3.600,00', () => {
  const { d, c, cb, n } = base();
  const o = R.oQueAconteceNoDesconto(d, c, dadosDaTela(d, c), { tipo: 'saida', hoje: '2026-11-25' });
  assert.equal(o.boletos.length, 1);
  const b = o.boletos[0];
  assert.equal(b.cobranca.id, cb.id);
  assert.equal(b.nome, 'Aluguel 10/2026');
  assert.equal(b.vencimento, '2026-11-14');
  assert.equal(b.valor, 180000);
  assert.equal(b.banco, 'pdf');
  assert.deepEqual(b.notificacoes, [{ id: n.id, data: '2026-11-24', fecha: true, faltam: [] }]);
  assert.match(b.acontece[0], /Será marcado como pago com a caução/);
  assert.equal(b.acontece[1], 'A notificação de 24/11/2026 será fechada (Resolvida).');
  assert.match(b.avisoBanco, /^CANCELE este boleto no banco \(C6\) antes de confirmar, senão o inquilino pode pagar de novo/);
  assert.equal(o.cancelarNoBanco, true);
  assert.equal(o.garantia, 540000);
  assert.equal(o.debitos, 180000);
  assert.equal(o.saldo, 360000);
  assert.equal(o.textoSaldo, 'Saldo a devolver ao inquilino: R$ 3.600,00');
  // na devolução da garantia da troca de titular, a mesma lista (o saldo é de quem saiu)
  const troca = R.oQueAconteceNoDesconto(d, c, dadosDaTela(d, c), { tipo: 'troca', hoje: '2026-11-25' });
  assert.equal(troca.textoSaldo, 'Saldo a devolver a Maria Exemplo: R$ 3.600,00');
  assert.match(troca.boletos[0].acontece[0], /pago com a garantia/);
  // é só a lista: nada mudou
  assert.equal(cb.situacao, 'Em aberto');
  assert.equal(n.situacao, 'Aguardando resposta');
});

test('sem boleto descontado (linha tirada dos débitos) não há janela; boleto sem PDF nem C6 não pede o cancelamento', () => {
  const { d, c } = base({ pdf: false, notificar: false });
  assert.equal(R.oQueAconteceNoDesconto(d, c, { ...dadosDaTela(d, c), debitos_descricao: 'Pintura: R$ 300,00' }, { tipo: 'saida' }), null);
  assert.equal(R.oQueAconteceNoDesconto(d, c, { ...dadosDaTela(d, c), debitos_descricao: '' }, { tipo: 'saida' }), null);
  const o = R.oQueAconteceNoDesconto(d, c, dadosDaTela(d, c), { tipo: 'saida', hoje: '2026-11-25' });
  assert.equal(o.boletos[0].banco, null);
  assert.equal(o.boletos[0].avisoBanco, '');
  assert.equal(o.cancelarNoBanco, false);
  assert.deepEqual(o.boletos[0].notificacoes, []);
  // boleto emitido no C6 pelo sistema também pede o cancelamento
  R.atualizar(d, 'cobrancas', d.cobrancas[0].id, { banco: { situacao: 'emitido' } }, 'j');
  const o2 = R.oQueAconteceNoDesconto(d, c, dadosDaTela(d, c), { tipo: 'saida', hoje: '2026-11-25' });
  assert.equal(o2.boletos[0].banco, 'c6');
  assert.match(o2.boletos[0].avisoBanco, /Cancelar no banco/);
});

test('saldo a cobrar: débitos maiores que a caução', () => {
  const { d, c } = base({ notificar: false });
  const o = R.oQueAconteceNoDesconto(d, c, { ...dadosDaTela(d, c), debitos: 600000 }, { tipo: 'saida', hoje: '2026-11-25' });
  assert.equal(o.saldo, -60000);
  assert.match(o.textoSaldo, /^Saldo a cobrar do inquilino: R\$ 600,00/);
});

test('notificação com outro boleto ainda em aberto continua aberta', () => {
  const { d, c, cb } = base({ notificar: false });
  R.gerarCobrancas(d, '2026-11', 'j');
  const nov = d.cobrancas.find((x) => x.competencia === '2026-11');
  const x = { data: '2026-12-20', prazo_dias: 10 };
  const t = NT.textoDoModelo(d, c, x, 'atraso');
  const n = R.criarNotificacao(d, { contrato_id: c.id, modelo: 'atraso', ...x, assunto: t.assunto, clausula: t.clausula, texto: t.texto }, 'j');
  R.marcarNotificacaoEnviada(d, n.id, { data: x.data, meio: 'E-mail' }, 'j');
  assert.deepEqual(n.boletos, [cb.id, nov.id]);
  // só o 10/2026 fica nos débitos (a linha do 11/2026 foi tirada)
  const dados = { ...dadosDaTela(d, c, '2026-12-20'), debitos: 180000 };
  dados.debitos_descricao = dados.debitos_descricao.split('\n').filter((l) => l.startsWith('Aluguel 10/2026')).join('\n');
  const o = R.oQueAconteceNoDesconto(d, c, dados, { tipo: 'saida', hoje: '2026-12-20' });
  assert.equal(o.boletos.length, 1);
  assert.equal(o.boletos[0].acontece[1], 'A notificação de 20/12/2026 continua aberta: ainda falta o boleto 11/2026.');
});

test('gravado o cálculo final, o boleto fica descontado e a notificação fecha; desfeito, os dois voltam', () => {
  const { d, c, cb, n } = base();
  const e = R.encerrarContrato(d, c.id, dadosDaTela(d, c), 'j', '2026-11-25');
  assert.equal(e.saldo, 360000);
  assert.equal(cb.situacao, 'Descontado da garantia');
  assert.equal(cb.quitado_saida, e.id);
  assert.equal(n.situacao, 'Resolvida');
  assert.equal(n.baixa_automatica, true);
  assert.match(n.observacao_baixa, /Baixa automática: boleto\(s\) 10\/2026 descontado\(s\) da garantia/);
  R.liberarBoletosDaSaida(d, e.id, 'j');
  assert.equal(cb.situacao, 'Em aberto');
  assert.equal(n.situacao, 'Aguardando resposta');
  assert.equal(n.resolvida_em, null);
});
