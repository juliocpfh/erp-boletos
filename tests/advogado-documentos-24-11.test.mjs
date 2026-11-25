import assert from 'node:assert/strict';
import test from 'node:test';
import * as CR from '../docs/js/config-regras.js';
import * as K from '../docs/js/contratos.js';
import * as DL from '../docs/js/documentos-locacao.js';
import { MODELOS_PADRAO, textoAtualizadoDoModelo } from '../docs/js/modelos-contrato.js';
import { ATUALIZACOES_DOCUMENTOS, atualizarTextoDocumento, documentoAtivo, TIPOS_DOCUMENTO } from '../docs/js/modelos-documentos.js';
import * as R from '../docs/js/regras.js';

// Resposta do advogado de 24/11/2026, itens 6.1 a 6.8 (os 8 "Outros documentos da locação"). Pessoa fictícia, CPF de teste.
const textoDe = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : '')).join('\n');
const SOBRA = /\{[^}]*\}|\[se |\[senão\]|\[fim\]|CL[ÁA]USULA #/;
const padrao = (tipo) => MODELOS_PADRAO.find((m) => m.tipo === tipo);
const montar = (tipo, valores, c0 = {}, opcoes = {}) => {
  const { d, c } = K.exemploDeDocumento();
  const cc = { ...c, ...c0 };
  return textoDe(K.montarContrato(padrao(tipo).texto, K.dadosDoDocumento({ ...d, contratos: [cc] }, cc, tipo, valores, { data: '2026-11-24', ...opcoes })));
};

test('6.1: a prorrogação do prazo sai da lista, sem mudar a posição dos outros modelos (id negativo = posição)', () => {
  assert.equal(documentoAtivo('aditivo_prazo'), false);
  assert.ok(TIPOS_DOCUMENTO.aditivo_prazo.retirado, 'tem o texto que explica por que saiu');
  for (const t of ['aditivo_garantia', 'distrato', 'aviso_desocupacao', 'notificacao_desocupacao', 'autorizacao_obra', 'declaracao_pagamentos', 'aviso_fiador']) assert.ok(documentoAtivo(t), t);
  assert.equal(documentoAtivo('nao_existe'), false);
  assert.equal(documentoAtivo('constructor'), false);
  // a ordem continua a de 24/11 (os ids -6 a -13): a prorrogação é a -6, a troca de garantia a -7...
  assert.deepEqual(MODELOS_PADRAO.slice(5).map((m) => m.tipo), ['aditivo_prazo', 'aditivo_garantia', 'distrato', 'aviso_desocupacao', 'notificacao_desocupacao', 'autorizacao_obra', 'declaracao_pagamentos', 'aviso_fiador']);
});

test('6.1: prorrogação já registrada continua aparecendo e, assinada, mudando o término (e voltando ao tirar o arquivo)', () => {
  const d = R.bancoVazio();
  CR.usarRegras(d);
  const e = R.inserir(d, 'emitentes', { nome: 'Empresa Exemplo', razao_social: 'EMPRESA LOCADORA EXEMPLO LTDA', cnpj: '11.222.333/0001-81', ativo: true }, 'teste');
  const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto 2', endereco: 'Rua das Flores, 100', cidade: 'Curitiba' }, 'teste');
  R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: e.id, percentual: 100 }, 'teste');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria de Teste', inquilino_cpf: '529.982.247-25', data_entrada: '2024-05-31', vigencia_inicio: '2024-05-31',
    vigencia_fim: '2027-05-31', prazo_meses: 36, prazo_tipo: 'Determinado', aluguel_inicial: 200000, dia_vencimento: 10, garantia_tipo: 'Caução', caucao_valor: 600000 }, 'teste');
  // termo gravado antes da retirada (como a PR #401 gravava)
  const { registro: a } = DL.registrarDocumento(d, c.id, { tipo: 'aditivo_prazo', modelo: K.modelosDe(d, 'aditivo_prazo')[0],
    valores: { novo_prazo_meses: '24', nova_data_inicio: '2027-06-01', nova_data_fim: '2029-05-31' }, data: '2027-05-02' }, 'teste');
  R.atualizar(d, 'aditivos', a.id, { arquivo: 'termo-2.pdf', assinado_em: '2027-05-10' }, 'teste');
  assert.match(DL.aplicarProrrogacao(d, a.id, 'teste'), /31\/05\/2029/);
  assert.equal(R.fimDoContrato(d, c), '2029-05-31');
  R.atualizar(d, 'aditivos', a.id, { arquivo: null }, 'teste');
  assert.match(DL.desfazerProrrogacao(d, a.id, 'teste'), /31\/05\/2027/);
  assert.equal(R.fimDoContrato(d, c), '2027-05-31');
  // o texto gravado no termo continua saindo inteiro
  const texto = textoDe(K.montarContrato(a.texto, K.dadosDoDocumento(d, c, 'aditivo_prazo', a.campos, { data: a.data })));
  assert.match(texto, /prorrogado por 24 \(vinte e quatro\) meses, de 01 de junho de 2027 a 31 de maio de 2029/);
  assert.doesNotMatch(texto, SOBRA);
});

test('6.2: troca de garantia diz "até a devolução real e definitiva das chaves"', () => {
  const t = montar('aditivo_garantia', K.valoresDeExemplo('aditivo_garantia'));
  assert.match(t, /até a devolução real e definitiva das chaves\./);
  assert.doesNotMatch(t, /entrega real e definitiva/);
  assert.match(t, /inclusive as vencidas e ainda não pagas nesta data/, 'as duas garantias respondem juntas na transição (aprovado)');
});

test('6.4: aviso de desocupação com a caixa da transferência do empregador (só pessoa física)', () => {
  const sem = montar('aviso_desocupacao', { data_saida_prevista: '2026-12-31' });
  assert.match(sem, /incide a multa prevista no contrato, proporcional ao tempo que falta \(Lei nº 8\.245\/91, art\. 4º\)/);
  assert.doesNotMatch(sem, /transferido pelo seu empregador/);
  const com = montar('aviso_desocupacao', { data_saida_prevista: '2026-12-31', transferencia_empregador: 'sim' });
  assert.match(com, /fica dispensado da multa prevista no contrato, por ter sido transferido pelo seu empregador para prestar serviços em outra localidade/);
  assert.match(com, /art\. 4º, parágrafo único/);
  assert.doesNotMatch(com, /incide a multa/);
  assert.doesNotMatch(com, SOBRA);
  // empresa locatária: a caixa não vale (o texto continua o da multa)
  const pj = montar('aviso_desocupacao', { data_saida_prevista: '2026-12-31', transferencia_empregador: 'sim' }, { inquilino_tipo: 'Pessoa jurídica (empresa)' });
  assert.match(pj, /incide a multa/);
  // prazo indeterminado: sem multa de qualquer jeito
  assert.match(montar('aviso_desocupacao', { transferencia_empregador: 'sim' }, {}, { fim: null }), /a locação é por prazo indeterminado: basta o aviso de 30 \(trinta\) dias, sem multa/);
  const quando = TIPOS_DOCUMENTO.aviso_desocupacao.campos.find(([k]) => k === 'transferencia_empregador')[4];
  assert.equal(quando({ pj: false }), true);
  assert.equal(quando({ pj: true }), false);
  assert.equal(DL.assuntoDoDocumento('aviso_desocupacao', { data_saida_prevista: '2026-12-31', transferencia_empregador: 'sim' }), 'Aviso de desocupação: entrega prevista em 31/12/2026, sem multa (transferência pelo empregador)');
});

test('6.5: notificação por carta com AR, prazo do recebimento, fiador para conhecimento', () => {
  const t = montar('notificacao_desocupacao', { data_limite: '2026-12-31' });
  assert.match(t, /nos termos do art\. 46, § 2º, da Lei nº 8\.245\/91, concede o prazo de 30 \(trinta\) dias, contados do recebimento desta notificação, para a desocupação do imóvel, até 31 de dezembro de 2026\./);
  assert.match(t, /Se esta notificação for recebida depois de 01 de dezembro de 2026, o prazo termina 30 \(trinta\) dias depois do recebimento\./);
  assert.match(t, /enviada por carta com aviso de recebimento \(AR\), com cópia ao FIADOR\./);
  assert.match(t, /Ao FIADOR, para conhecimento: JOSÉ DE TESTE LIMA/);
  assert.match(t, /basta entrar em contato com a LOCADORA\./);
  assert.doesNotMatch(t, /responder a este e-mail/);
  assert.doesNotMatch(t, SOBRA);
  // não residencial: art. 57
  assert.match(montar('notificacao_desocupacao', { data_limite: '2026-12-31' }, { finalidade: 'Não residencial' }), /nos termos do art\. 57, da Lei/);
});

test('6.5: residencial de menos de 30 meses só com o motivo do art. 47 (o campo só aparece nesse caso)', () => {
  const motivo = 'uso próprio: o imóvel será a moradia do filho do sócio, que não tem imóvel próprio';
  const t = montar('notificacao_desocupacao', { data_limite: '2026-12-31', motivo_retomada: motivo }, { prazo_meses: 12 });
  assert.match(t, new RegExp(`com fundamento no art\\. 47 da Lei nº 8\\.245/91, pelo seguinte motivo: ${motivo}, concede o prazo`));
  assert.doesNotMatch(t, /art\. 46, § 2º/);
  assert.doesNotMatch(t, SOBRA);
  // 30 meses: o motivo digitado não entra (retomada livre)
  assert.doesNotMatch(montar('notificacao_desocupacao', { data_limite: '2026-12-31', motivo_retomada: motivo }), /art\. 47/);
  const quando = TIPOS_DOCUMENTO.notificacao_desocupacao.campos.find(([k]) => k === 'motivo_retomada')[4];
  assert.equal(quando({ retomada_livre: false }), true);
  assert.equal(quando({ retomada_livre: true }), false);
  assert.ok(DL.MOTIVO_MINIMO >= 20);
});

test('6.5: prazos da notificação pelo AR (desocupar e propor a ação de despejo com liminar)', () => {
  const x = { documento: 'notificacao_desocupacao', campos: { data_limite: '2026-12-31' } };
  assert.ok(DL.ehNotificacaoComAr(x));
  assert.ok(!DL.ehNotificacaoComAr({ documento: 'distrato' }));
  assert.deepEqual(DL.prazosDaNotificacao(x), { recebida: null, desocupar: '2026-12-31', acaoAte: '2027-01-30' });
  // recebida em 01/12: vale a data limite; recebida em 10/12: 30 dias do recebimento
  assert.deepEqual(DL.prazosDaNotificacao({ ...x, arquivo: 'ar.pdf', assinado_em: '2026-12-01' }), { recebida: '2026-12-01', desocupar: '2026-12-31', acaoAte: '2027-01-30' });
  assert.deepEqual(DL.prazosDaNotificacao({ ...x, arquivo: 'ar.pdf', assinado_em: '2026-12-10' }), { recebida: '2026-12-10', desocupar: '2027-01-09', acaoAte: '2027-02-08' });
  assert.deepEqual(DL.prazosDaNotificacao({ documento: 'notificacao_desocupacao', campos: {} }), { recebida: null, desocupar: null, acaoAte: null });
});

test('6.3, 6.6, 6.7 e 6.8: aprovados sem mudança (o texto é o mesmo de antes)', () => {
  for (const tipo of ['distrato', 'autorizacao_obra', 'declaracao_pagamentos', 'aviso_fiador']) {
    assert.ok(!(tipo in ATUALIZACOES_DOCUMENTOS), tipo);
    assert.equal(atualizarTextoDocumento(tipo, padrao(tipo).texto), padrao(tipo).texto);
  }
});

test('modelos já gravados recebem o texto novo; o editado à mão fica; sem conflito (a troca não se repete)', () => {
  for (const tipo of Object.keys(ATUALIZACOES_DOCUMENTOS)) {
    const novo = padrao(tipo).texto;
    let antigo = novo;
    for (const [velho, atual] of ATUALIZACOES_DOCUMENTOS[tipo]) { assert.ok(novo.includes(atual), `${tipo}: o padrão tem o texto novo`); antigo = antigo.split(atual).join(velho); }
    assert.notEqual(antigo, novo);
    assert.equal(textoAtualizadoDoModelo({ tipo, texto: antigo }), novo, `${tipo}: o gravado antigo vira o padrão de hoje`);
    assert.equal(textoAtualizadoDoModelo({ tipo, texto: antigo.replace(/\n/g, '\r\n') }), novo, `${tipo}: com \\r\\n também`);
    assert.equal(textoAtualizadoDoModelo({ tipo, texto: novo }), novo, `${tipo}: o novo fica como está (sem nova troca)`);
    const aMao = `${antigo}\n\nTexto acrescentado à mão.`.replace(ATUALIZACOES_DOCUMENTOS[tipo][0][0], 'Trecho reescrito à mão.');
    assert.equal(textoAtualizadoDoModelo({ tipo, texto: aMao }).includes('Trecho reescrito à mão.'), true, `${tipo}: o trecho editado à mão fica`);
  }
  // contratos e termos de antes continuam com as atualizações deles (nada mudou ali)
  const contrato = MODELOS_PADRAO[0];
  assert.equal(textoAtualizadoDoModelo(contrato), contrato.texto);
});
