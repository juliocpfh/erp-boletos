// Assinatura digital da empresa no contrato, no termo aditivo e na carta de reajuste (pedido de 24/11/2026): a chave de cada
// documento na fila (com o resumo do texto), o que vai no e-mail e os anexos do e-mail da etapa. Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as AS from '../docs/js/assinatura.js';
import * as CR from '../docs/js/config-regras.js';
import { anexosProntos } from '../docs/js/email-dados.js';
import { modeloEmail } from '../docs/js/modelos-email.js';
import * as R from '../docs/js/regras.js';

test('chave do documento: começo fixo por documento e o resumo do texto (mudou o texto, muda a chave)', () => {
  const c = { id: 12 };
  assert.equal(AS.prefixoDoDocumento('contrato', { contrato: c }), 'doc:contrato:c12:');
  assert.equal(AS.prefixoDoDocumento('aditivo', { contrato: c, id: 5 }), 'doc:aditivo:c12:a5:');
  assert.equal(AS.prefixoDoDocumento('carta_reajuste', { contrato: c, comp: '2026-11' }), 'doc:carta_reajuste:c12:2026-11:');
  const k1 = AS.chaveDoDocumento('contrato', { contrato: c }, 'texto A');
  assert.match(k1, /^doc:contrato:c12:v[0-9a-f]{8}$/);
  assert.equal(AS.chaveDoDocumento('contrato', { contrato: c }, 'texto A'), k1, 'mesmo texto, mesma chave (página e e-mail)');
  assert.notEqual(AS.chaveDoDocumento('contrato', { contrato: c }, 'texto B'), k1, 'texto mudado, outra chave');
  assert.equal(AS.resumoDoTexto('abc'), '1a47e90b');
  // o aditivo 5 não se confunde com o 50
  assert.ok(!AS.chaveDoDocumento('aditivo', { contrato: c, id: 50 }, 'x').startsWith(AS.prefixoDoDocumento('aditivo', { contrato: c, id: 5 })));
});

test('o que vai no e-mail: a versão desta chave; sem chave (contrato), a mais nova; na fila ou com erro, o motivo', () => {
  const pre = 'doc:contrato:c12:';
  const fila = { pedidos: [
    { id: 'a', chave: `${pre}v00000001`, situacao: 'assinado', pedido_em: '2026-11-20T10:00:00Z', assinado_em: '2026-11-20T10:01:00Z' },
    { id: 'b', chave: `${pre}v00000002`, situacao: 'pendente', pedido_em: '2026-11-24T10:00:00Z' },
    { id: 'c', chave: 'doc:contrato:c13:v00000001', situacao: 'assinado', pedido_em: '2026-11-25T10:00:00Z' },
    { id: 'd', chave: 'recibo:garantia:c12', situacao: 'assinado', pedido_em: '2026-11-26T10:00:00Z' },
  ] };
  assert.deepEqual(AS.pedidosDoDocumento(fila, pre).map((p) => p.id), ['b', 'a'], 'só as versões deste documento, a mais nova primeiro');
  const maisNova = AS.assinadoParaEmail(fila, pre);
  assert.equal(maisNova.ok, false);
  assert.match(maisNova.motivo, /na fila do PC/);
  assert.equal(AS.assinadoParaEmail(fila, pre, `${pre}v00000001`).pedido.id, 'a');
  assert.equal(AS.assinadoParaEmail(fila, pre, `${pre}v00000001`).ok, true);
  assert.equal(AS.assinadoParaEmail(fila, pre, `${pre}v00000009`).pedido, null, 'versão que nunca foi para a fila: nada a anexar');
  const erro = AS.assinadoParaEmail({ pedidos: [{ id: 'e', chave: `${pre}v1`, situacao: 'erro', erro: 'senha do certificado errada', pedido_em: '2026-11-24T10:00:00Z' }] }, pre);
  assert.match(erro.motivo, /senha do certificado errada/);
});

function base() {
  const d = R.bancoVazio();
  R.normalizar(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'teste');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'teste');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'teste');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', data_entrada: '2026-10-01', aluguel_inicial: 135000, dia_vencimento: 10 }, 'teste');
  const a = R.inserir(d, 'aditivos', { contrato_id: c.id, data: '2026-11-24', tipo: 'Novo valor', numero: 1 }, 'teste');
  return { d, c, a };
}

test('e-mails da etapa: "Contrato para assinar" e o termo do novo valor pedem o assinado da fila só com a assinatura ligada', () => {
  const { d, c, a } = base();
  try {
    CR.usarRegras(d);
    assert.deepEqual(anexosProntos(d, modeloEmail(d, 'contrato_assinar'), { contrato: c }), [], 'desligada: nada muda (o contrato vai à mão)');
    R.mudarRegraSistema(d, 'assinatura_digital', true, 'teste');
    CR.usarRegras(d);
    const [x] = anexosProntos(d, modeloEmail(d, 'contrato_assinar'), { contrato: c });
    assert.deepEqual({ tipo: x.tipo, doc: x.doc, contrato: x.contrato }, { tipo: 'digital', doc: 'contrato', contrato: c.id });
    assert.match(x.rotulo, /contrato assinado digitalmente pela empresa/);
    const [y] = anexosProntos(d, modeloEmail(d, 'novo_valor'), { contrato: c, aditivo: a });
    assert.deepEqual({ tipo: y.tipo, doc: y.doc, id: y.id }, { tipo: 'digital', doc: 'aditivo', id: a.id });
    assert.match(y.rotulo, /termo aditivo de 24\/11\/2026 assinado digitalmente pela empresa/);
    assert.deepEqual(anexosProntos(d, modeloEmail(d, 'novo_valor'), { contrato: c }), [], 'sem o termo aditivo, nada');
  } finally {
    CR.usarRegras(null);
  }
});
