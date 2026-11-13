import assert from 'node:assert/strict';
import test from 'node:test';
import { anexosProntos, dadosDoEmail } from '../docs/js/email-dados.js';
import { modeloEmail, montarEmail } from '../docs/js/modelos-email.js';
import { itensDaProposta, montarRecibo, reciboDisponivel } from '../docs/js/recibos.js';
import * as R from '../docs/js/regras.js';

// dados fictícios (CPF e CNPJ de teste)
function base() {
  const d = R.bancoVazio();
  R.normalizar(d);
  R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  const i = R.inserir(d, 'imoveis', { nome: 'Flores 3', endereco: 'Rua das Flores, 120', complemento: 'Apto 3', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }, 'j');
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física', imoveis_ids: [i.id], situacao: 'Em análise',
    aluguel_inicial: 461111, desconto_pontualidade_percentual: 10, dia_vencimento: 5, garantia_tipo: 'Caução', prazo_meses: 30,
    conta_iptu: 'Por conta do inquilino', iptu_estimado: 15300, conta_seguro: 'Por conta do inquilino', seguro_estimado: 25000,
    conta_agua: 'Incluso no aluguel', conta_energia: 'Por conta do inquilino', conta_condominio: 'Não tem',
    reserva_valor: 415000, reserva_data: '2026-11-10', comprovante_reserva: 'comprovante-reserva-2026-11-10.pdf' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física',
    aluguel_inicial: 461111, desconto_pontualidade_percentual: 10, dia_vencimento: 5, data_entrada: '2026-11-14', vigencia_inicio: '2026-11-14', prazo_meses: 30, prazo_tipo: 'Determinado',
    garantia_tipo: 'Caução', caucao_meses: 3, caucao_valor: 1245000, solidario_nome: 'João Souza' }, 'j');
  return { d, i, f, c };
}

test('recibo da reserva: valor por extenso, condições da reserva e a proposta resumida', () => {
  const { d, f } = base();
  const r = montarRecibo(d, 'reserva', { ficha: f }, '2026-11-13');
  assert.equal(r.titulo, 'RECIBO DE RESERVA DE IMÓVEL');
  assert.match(r.paragrafos[0], /^Recebemos de Maria Souza, CPF 529\.982\.247-25, a importância de R\$ 4\.150,00 \(quatro mil cento e cinquenta reais\), em 10\/11\/2026/);
  assert.match(r.paragrafos[0], /Rua das Flores, 120, Apto 3, Centro, Curitiba\/PR/);
  assert.ok(r.paragrafos.some((p) => /devolvido por inteiro/.test(p)));
  assert.ok(!r.paragrafos.some((p) => /nota fiscal/.test(p)), 'o recibo da reserva não fala da NF (pedido do dono, 13/11)');
  const tab = Object.fromEntries(r.tabela);
  assert.equal(tab.Aluguel, 'R$ 4.611,11 por mês (R$ 4.150,00 pagando até o vencimento)');
  assert.equal(tab.IPTU, 'por conta do locatário, no boleto (cerca de R$ 153,00 por mês)');
  assert.equal(tab.Contas, 'Água: incluso no aluguel · Energia: por conta do locatário · Condomínio: não tem');
  assert.deepEqual(r.assinaturas.map((a) => a.nome), ['ANK ADMINISTRADORA DE BENS LTDA']);
  assert.match(r.depois[0], /artigos 319 e 320 do Código Civil/);
  f.reserva_data = null;
  assert.equal(reciboDisponivel(d, 'reserva', { ficha: f }).ok, false);
  assert.throws(() => montarRecibo(d, 'reserva', { ficha: f }), /data da reserva/);
});

test('termo de devolução da reserva: só depois de registrada; integral dá quitação mútua; parcial não', () => {
  const { d, f } = base();
  assert.match(reciboDisponivel(d, 'devolucao_reserva', { ficha: f }).motivo, /Registre antes a devolução/);
  Object.assign(f, { situacao: 'Reprovada', devolucao_data: '2026-11-14', comprovante_devolucao: 'comprovante-devolucao-2026-11-14.pdf' });
  const r = montarRecibo(d, 'devolucao_reserva', { ficha: f }, '2026-11-14');
  assert.match(r.paragrafos[0], /devolveu em 14\/11\/2026 a Maria Souza, CPF 529\.982\.247-25, a importância de R\$ 4\.150,00 .*integralidade da reserva/);
  assert.match(r.paragrafos[1], /sem a formação de contrato de locação/);
  assert.match(r.paragrafos[2], /mútua quitação/);
  assert.match(r.paragrafos[3], /artigo 16, I/);
  assert.equal(r.assinaturas.length, 2, 'assinam a empresa e o interessado');
  f.devolucao_valor = 400000;
  assert.match(montarRecibo(d, 'devolucao_reserva', { ficha: f }).paragrafos[2], /diferença de R\$ 150,00/);
});

test('recibo da caução: só com o depósito registrado; caução em poupança; depósito de garantia sem poupança', () => {
  const { d, c } = base();
  assert.equal(reciboDisponivel(d, 'garantia', { contrato: c }).ok, false);
  Object.assign(c, { caucao_pago_em: '2026-11-13', comprovante_caucao: 'comprovante-caucao-2026-11-13.pdf' });
  const r = montarRecibo(d, 'garantia', { contrato: c }, '2026-11-13');
  assert.equal(r.titulo, 'RECIBO DE CAUÇÃO EM DINHEIRO');
  assert.match(r.paragrafos[0], /R\$ 12\.450,00 \(doze mil quatrocentos e cinquenta reais\), em 13\/11\/2026/);
  assert.match(r.paragrafos[1], /caderneta de poupança.*artigo 38, § 2º/);
  assert.match(r.paragrafos[2], /não há nota fiscal/);
  Object.assign(c, { garantia_tipo: 'Depósito garantia', deposito_valor: 500000, deposito_pago_em: '2026-11-13', comprovante_deposito: 'x.pdf' });
  const dep = montarRecibo(d, 'garantia', { contrato: c });
  assert.equal(dep.titulo, 'RECIBO DE DEPÓSITO DE GARANTIA');
  assert.doesNotMatch(dep.paragrafos[1], /poupança/);
  c.garantia_tipo = 'Fiador';
  assert.match(reciboDisponivel(d, 'garantia', { contrato: c }).motivo, /não tem caução/);
});

test('termo de quitação: depois do cálculo final e do saldo acertado; valores discriminados e ressalva das contas', () => {
  const { d, c } = base();
  assert.match(reciboDisponivel(d, 'quitacao', { contrato: c }).motivo, /cálculo final/);
  const e = R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2029-05-14', garantia_valor: 1245000, garantia_corrigida: 1380000, debitos: 95000,
    debitos_descricao: 'Pintura da sala: R$ 700,00\nLimpeza: R$ 250,00', saldo: 1285000 }, 'j');
  assert.match(reciboDisponivel(d, 'quitacao', { contrato: c }).motivo, /devolução do saldo/);
  e.garantia_devolvida_em = '2029-05-20';
  const r = montarRecibo(d, 'quitacao', { contrato: c }, '2029-05-20');
  assert.equal(r.titulo, 'TERMO DE ENTREGA DO IMÓVEL, ACERTO FINAL E QUITAÇÃO');
  assert.match(r.paragrafos[0], /LOCATÁRIO SOLIDÁRIO: João Souza/);
  assert.deepEqual(r.tabela.map((x) => x[0]), ['Garantia depositada', 'Garantia corrigida até 14/05/2029', '(-) Débitos descontados', '   Pintura da sala: R$ 700,00', '   Limpeza: R$ 250,00', '= Saldo devolvido ao locatário']);
  assert.equal(r.tabela.at(-1)[1], 'R$ 12.850,00');
  assert.match(r.depois[0], /Em 20\/05\/2029, a LOCADORA devolveu ao LOCATÁRIO o saldo de R\$ 12\.850,00/);
  assert.match(r.depois[1], /quitação recíproca.*artigos 319 e 320/);
  assert.match(r.depois[2], /RESSALVA.*contas de consumo/);
  assert.deepEqual(r.assinaturas.map((a) => a.nome), ['ANK ADMINISTRADORA DE BENS LTDA', 'Maria Souza', 'João Souza']);
});

test('e-mails: anexos do sistema (recibo e comprovante) e proposta com IPTU, seguro e o que está incluso', () => {
  const { d, f, c } = base();
  const prontos = anexosProntos(d, modeloEmail(d, 'ficha_envio'), { ficha: f });
  assert.deepEqual(prontos.map((a) => [a.tipo, a.rotulo, a.ok ?? true]), [['recibo', 'Recibo da reserva', true], ['arquivo', 'comprovante da reserva (comprovante-reserva-2026-11-10.pdf)', true]]);
  assert.equal(prontos[1].escopo, 'ficha');
  const e = montarEmail(modeloEmail(d, 'ficha_envio'), dadosDoEmail(d, { ficha: f }, {}, '2026-11-13')).texto;
  assert.match(e, /IPTU: cobrado junto com o aluguel \(cerca de R\$ 153,00 por mês\)/);
  assert.match(e, /Seguro contra incêndio: cobrado junto com o aluguel \(cerca de R\$ 250,00 por ano\)/);
  assert.match(e, /Contas de energia: por conta do locatário/);
  assert.match(e, /Incluso no aluguel: água/);
  assert.match(e, /Prazo do contrato: 30 meses/);
  assert.match(e, /seguem anexos o recibo e o comprovante/);
  // devolução: o termo só depois de registrada
  const dev = anexosProntos(d, modeloEmail(d, 'ficha_devolucao'), { ficha: f });
  assert.equal(dev[0].ok, false);
  Object.assign(f, { situacao: 'Reprovada', devolucao_data: '2026-11-14', comprovante_devolucao: 'comprovante-devolucao-2026-11-14.pdf' });
  assert.deepEqual(anexosProntos(d, modeloEmail(d, 'ficha_devolucao'), { ficha: f }).map((a) => a.ok ?? a.nome), [true, 'comprovante-devolucao-2026-11-14.pdf']);
  assert.match(montarEmail(modeloEmail(d, 'ficha_devolucao'), dadosDoEmail(d, { ficha: f })).texto, /devolução de R\$ 4\.150,00 em 14\/11\/2026/);
  // saída: o comprovante do saldo
  const enc = R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2029-05-14', garantia_valor: 1245000, debitos: 0, saldo: 1245000, garantia_devolvida_em: '2029-05-20', comprovante: 'comprovante-devolucao-saldo-2029-05-20.pdf' }, 'j');
  assert.deepEqual(anexosProntos(d, modeloEmail(d, 'saida_encerramento'), { contrato: c }).map((a) => a.ok ?? a.nome), [true, enc.comprovante]);
});

test('saída: saldo acertado sem comprovante vira aviso só a partir de 13/11/2026', () => {
  const { d, c } = base();
  const e = R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2026-10-31', garantia_valor: 100000, debitos: 0, saldo: 100000, garantia_devolvida_em: '2026-11-05' }, 'j');
  assert.ok(!R.comprovantesPendentes(d, c).some((x) => x.tabela === 'encerramentos'), 'saída antiga não avisa');
  e.garantia_devolvida_em = '2026-11-20';
  const p = R.comprovantesPendentes(d, c).find((x) => x.tabela === 'encerramentos');
  assert.equal(p.tipo, 'devolucao-saldo');
  R.anexarComprovante(d, 'encerramentos', e.id, 'comprovante', 'comprovante-devolucao-saldo-2026-11-20.pdf', 'j');
  assert.ok(!R.comprovantesPendentes(d, c).some((x) => x.tabela === 'encerramentos'));
  assert.ok(R.arquivosReferenciados(d).some((x) => x.nome === 'comprovante-devolucao-saldo-2026-11-20.pdf'), 'excluir o cálculo apaga o arquivo junto');
});

test('proposta da ficha vai para o contrato com o que está incluso', () => {
  const { d, f } = base();
  const dados = R.dadosDaFicha(d, f);
  assert.equal(dados.conta_agua, 'Incluso no aluguel');
  assert.equal(dados.prazo_meses, 30);
  assert.ok(!('iptu_estimado' in dados), 'estimativa não vai para o contrato');
  assert.ok(itensDaProposta({}).length === 0);
});
