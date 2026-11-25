import assert from 'node:assert/strict';
import test from 'node:test';
import * as K from '../docs/js/contratos.js';
import { MODELOS_PADRAO } from '../docs/js/modelos-contrato.js';
import { TIPOS_DOCUMENTO } from '../docs/js/modelos-documentos.js';
import { sanearParametros } from '../docs/js/calculos.js';

// Outros documentos da locação (pedido do dono de 24/11/2026, item C2): cada modelo sai sem marcação sobrando,
// com os dados de exemplo (pessoa fictícia, CPF de teste 529.982.247-25) e nas variações do contrato.
const textoDe = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : !b.pessoas ? `[${b.tipo}]` : `[ASSINATURAS ${b.pessoas.map((p) => p.papel).join(', ')}]`)).join('\n');
const SOBRA = /\{[^}]*\}|\[[a-z_]+\?\]|\[se |\[senão\]|\[fim\]|CL[ÁA]USULA #|#i\.|\[cláusula/;

const outros = MODELOS_PADRAO.filter((m) => m.tipo in TIPOS_DOCUMENTO);

test('os 8 outros documentos estão nos modelos padrão, depois dos antigos (o id negativo é a posição)', () => {
  assert.deepEqual(outros.map((m) => m.tipo), Object.keys(TIPOS_DOCUMENTO));
  assert.equal(outros.length, 8);
  assert.deepEqual(MODELOS_PADRAO.slice(0, 5).map((m) => m.tipo || 'contrato'), ['contrato', 'contrato', 'aditivo', 'aditivo_troca', 'aditivo_valor']);
  for (const [tipo, def] of Object.entries(TIPOS_DOCUMENTO)) {
    assert.ok(def.nome && def.explica, tipo);
    for (const [k, , formato] of def.campos) {
      assert.ok(['data', 'dinheiro', 'numero', 'texto', 'marcar'].includes(formato), `${tipo}.${k}`);
      // a caixa de marcar entra como condição ([se campo]); os outros, como {campo}
      assert.match(outros.find((m) => m.tipo === tipo).texto, formato === 'marcar' ? new RegExp(`\\[se ${k}\\]`) : new RegExp(`\\{${k}\\}`), `o texto de ${tipo} usa ${k}`);
    }
  }
});

test('cada modelo com os dados de exemplo: nenhum {campo}, condição ou numeração sobrando; CPF de teste', () => {
  const { d, c } = K.exemploDeDocumento();
  for (const m of [...MODELOS_PADRAO.filter((x) => !x.tipo), ...outros]) {
    const dados = K.dadosDoDocumento(d, c, m.tipo || 'contrato', K.valoresDeExemplo(m.tipo), { data: '2026-11-24' });
    const t = textoDe(K.montarContrato(m.texto, dados));
    assert.doesNotMatch(t, SOBRA, `${m.nome}: ${(t.match(SOBRA) || [])[0]}`);
    assert.doesNotMatch(t, new RegExp(K.LINHA_EM_BRANCO), `${m.nome}: com o exemplo, nenhum campo em branco`);
    assert.match(t, /MARIA DE TESTE SOUZA/, m.nome);
    assert.match(t, /Curitiba, 24 de novembro de 2026\./, m.nome);
  }
});

test('variações: duas locadoras, caução sem fiador, não residencial, empresa locatária e campos em branco', () => {
  const ex = K.exemploDeDocumento();
  const e2 = { ...ex.d.emitentes[0], id: 2, razao_social: 'SEGUNDA LOCADORA EXEMPLO LTDA', assina_documentos: false };
  ex.d.emitentes[0] = { ...ex.d.emitentes[0], assina_documentos: false };
  ex.d.emitentes.push(e2);
  ex.d.participacoes = [{ imovel_id: 1, emitente_id: 1 }, { imovel_id: 1, emitente_id: 2 }];
  const variacoes = [
    { garantia_tipo: 'Caução', caucao_meses: 2, caucao_valor: 380000 },
    { garantia_tipo: 'Depósito garantia', deposito_valor: 380000, finalidade: 'Não residencial', atividade: 'escritório' },
    { garantia_tipo: 'Seguro fiança', inquilino_tipo: 'Pessoa jurídica (empresa)', inquilino_nome: 'Empresa de Teste Ltda', inquilino_cpf: '11.222.333/0001-81', representante_nome: 'Maria de Teste Souza' },
    { solidario_nome: 'João de Teste Souza', solidario_cpf: '529.982.247-25' },
  ];
  for (const v of variacoes) {
    const c = { ...ex.c, ...v };
    for (const m of outros) {
      for (const valores of [K.valoresDeExemplo(m.tipo), {}]) {
        const dados = K.dadosDoDocumento(ex.d, c, m.tipo, valores, { data: '2026-11-24' });
        const t = textoDe(K.montarContrato(m.texto, dados));
        assert.doesNotMatch(t, SOBRA, `${m.nome} (${JSON.stringify(v)}): ${(t.match(SOBRA) || [])[0]}`);
        assert.equal(dados.assinaturas.filter((a) => a.papel === 'LOCADORA').length, 2, `${m.nome}: as duas locadoras assinam`);
        assert.doesNotMatch(t, /(?<![A-ZÀ-Ú])A LOCADORA\b|À LOCADORA\b|\bLOCADORA:/, `${m.nome}: plural das locadoras`);
      }
    }
  }
});

test('campo em branco sai como linha para preencher; dinheiro em branco tira o trecho [se campo]', () => {
  const { d, c } = K.exemploDeDocumento();
  const distrato = outros.find((m) => m.tipo === 'distrato');
  const semMulta = textoDe(K.montarContrato(distrato.texto, K.dadosDoDocumento(d, c, 'distrato', {}, { data: '2026-11-24' })));
  assert.match(semMulta, new RegExp(`entregará as chaves em ${K.LINHA_EM_BRANCO}`));
  assert.match(semMulta, /As partes dispensam a multa/);
  const comMulta = textoDe(K.montarContrato(distrato.texto, K.dadosDoDocumento(d, c, 'distrato', { data_saida: '2026-12-15', multa_combinada: '1.900,00' }, { data: '2026-11-24' })));
  assert.match(comMulta, /chaves em 15 de dezembro de 2026/);
  assert.match(comMulta, /multa de R\$ 1\.900,00 \(mil e novecentos reais\)/);
  assert.doesNotMatch(comMulta, /dispensam a multa/);
  const fiador = K.dadosDoDocumento(d, c, 'aviso_fiador', { valor_debito: 196350 }, { data: '2026-11-24' });
  assert.equal(fiador.campos.valor_debito, 'R$ 1.963,50 (mil novecentos e sessenta e três reais e cinquenta centavos)');
  // digitado sem vírgula é reais, não centavos ("500" saía R$ 5,00)
  assert.match(K.dadosDoDocumento(d, c, 'distrato', { multa_combinada: '500' }).campos.multa_combinada, /^R\$ 500,00 /);
  assert.equal(fiador.campos.fiadores_nomes, 'JOSÉ DE TESTE LIMA');
  assert.equal(K.dadosDoDocumento(d, c, 'aditivo_prazo', { numero_aditivo: '3' }).campos.numero_aditivo, '3º');
  assert.equal(K.dadosDoDocumento(d, c, 'aviso_desocupacao', { data_saida_prevista: '2026-02-31' }).campos.data_saida_prevista, K.LINHA_EM_BRANCO, 'data inválida vira linha');
});

test('quem assina: aviso só o inquilino e a empresa; notificação, declaração e aviso ao fiador só a empresa', () => {
  const { d, c } = K.exemploDeDocumento();
  const papeis = (tipo) => K.dadosDoDocumento(d, { ...c, solidario_nome: 'João de Teste' }, tipo, {}).assinaturas.map((a) => a.papel);
  assert.deepEqual(papeis('aviso_desocupacao'), ['LOCATÁRIO', 'LOCATÁRIO SOLIDÁRIO', 'LOCADORA']);
  assert.deepEqual(papeis('notificacao_desocupacao'), ['LOCADORA']);
  assert.deepEqual(papeis('declaracao_pagamentos'), ['LOCADORA']);
  assert.deepEqual(papeis('aviso_fiador'), ['LOCADORA']);
  assert.deepEqual(papeis('autorizacao_obra'), ['LOCADORA', 'LOCATÁRIO', 'LOCATÁRIO SOLIDÁRIO']);
  assert.deepEqual(papeis('distrato'), ['LOCADORA', 'LOCATÁRIO', 'LOCATÁRIO SOLIDÁRIO', 'FIADOR'], 'distrato: todos os do contrato');
});

test('ao salvar um modelo, os campos novos são conhecidos (não aparecem como "[campo?]")', () => {
  for (const m of outros) assert.deepEqual(K.camposDesconhecidosDoModelo(m.texto), [], m.nome);
  assert.deepEqual(K.camposDesconhecidosDoModelo('{data_limite} {fiadores_nomes} {campo_que_nao_existe}'), ['{campo_que_nao_existe}']);
});

test('o endereço do exemplo passa pela conferência dos parâmetros', () => {
  assert.deepEqual(sanearParametros({ modelo: '-6', exemplo: '1', contrato: '3' }), { modelo: '-6', exemplo: '1', contrato: '3' });
  assert.equal(sanearParametros({ exemplo: 'sim' }).exemplo, undefined);
});
