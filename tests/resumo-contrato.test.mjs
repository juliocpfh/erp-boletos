import assert from 'node:assert/strict';
import test from 'node:test';
import * as K from '../docs/js/contratos.js';
import { atualizarTextoModelo, MODELOS_PADRAO, RESUMO_CONTRATO } from '../docs/js/modelos-contrato.js';
import * as R from '../docs/js/regras.js';

// Resumo do contrato em perguntas e respostas (pedido do dono em 24/11/2026): última página dos contratos, com os valores
// do próprio contrato. Dados fictícios (CPF de teste 529.982.247-25).
const SOBRA = /\{[^}]*\}|\[[a-z_]+\?\]|\[se |\[senão\]|\[fim\]|CL[ÁA]USULA #|\[nova página\]/;
const texto = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : `[${b.tipo}]`)).join('\n');

function banco() {
  const d = { emitentes: [{ id: 1, razao_social: 'EMPRESA LOCADORA EXEMPLO LTDA', cnpj: '11.222.333/0001-81', assina_documentos: true, uf_sede: 'PR', ativo: true }],
    participacoes: [], fiadores: [{ id: 1, contrato_id: 1, nome: 'José de Teste Lima', cpf: '111.444.777-35' }], titularidades: [], listas: {},
    imoveis: [{ id: 1, nome: 'Casa', endereco: 'Rua das Flores, 120', cidade: 'Curitiba', uf: 'PR' }] };
  const c = { id: 1, imovel_id: 1, inquilino_nome: 'Maria de Teste Souza', inquilino_cpf: '529.982.247-25', aluguel_inicial: 190000, desconto_pontualidade_percentual: 10,
    dia_vencimento: 10, data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', vigencia_fim: '2029-05-31', prazo_meses: 30, prazo_tipo: 'Determinado',
    indice_correcao: 'IPCA', garantia_tipo: 'Caução', caucao_meses: 2, finalidade: 'Residencial', multa_percentual: 2, juros_mensal_percentual: 1,
    conta_agua: 'Por conta do inquilino', conta_energia: 'Por conta do inquilino', conta_iptu: 'Por conta do inquilino', conta_seguro: 'Por conta do inquilino', conta_condominio: 'Não tem' };
  return { d, c };
}
const resumoDe = (blocos) => texto(blocos.slice(blocos.findIndex((b) => b.tipo === 'nova_pagina')));

test('os dois contratos terminam com uma folha nova, depois das assinaturas, com as 16 perguntas', () => {
  const { d, c } = banco();
  for (const m of MODELOS_PADRAO.filter((x) => !x.tipo)) {
    const blocos = K.montarContrato(m.texto, K.dadosDoContrato(d, c, { data: '2026-11-24' }));
    const q = blocos.findIndex((b) => b.tipo === 'nova_pagina');
    assert.equal(blocos[q - 1].tipo, 'assinaturas', `${m.nome}: o resumo vem logo depois das assinaturas`);
    assert.equal(texto([blocos[q + 1]]), 'RESUMO DO CONTRATO EM PERGUNTAS E RESPOSTAS');
    const r = resumoDe(blocos);
    assert.equal((r.match(/^\d+\. .*\?$/gm) || []).length, 16, m.nome);
    assert.doesNotMatch(texto(blocos), SOBRA, m.nome);
    assert.match(K.contratoHtml(blocos, { logo: '', rodape: [] }), /<div class="ct-nova-pagina"><\/div><h2 class="ct-secao">RESUMO DO CONTRATO/);
  }
});

test('os valores vêm do contrato: aluguel, vencimento, multa e juros com exemplo, reajuste, prazo e multa da saída', () => {
  const { d, c } = banco();
  const r = resumoDe(K.montarContrato(MODELOS_PADRAO[0].texto, K.dadosDoContrato(d, c, { data: '2026-11-24' })));
  assert.match(r, /O aluguel é de R\$ 1\.900,00 \(mil e novecentos reais\)\. Pagando até o vencimento, há bonificação de 10% \(dez por cento\) e o valor fica em R\$ 1\.710,00/);
  assert.match(r, /vence todo dia 10 \(dez\) de cada mês/);
  assert.match(r, /O IPTU vem no mesmo boleto, assim como o seguro contra incêndio\./);
  assert.match(r, /multa de 2% \(dois por cento\) e juros de 1% \(um por cento\) ao mês/);
  assert.match(r, /R\$ 1\.900,00 \+ R\$ 38,00 de multa \+ R\$ 6,33 de juros = R\$ 1\.944,33/);
  assert.match(r, /pela variação acumulada no período do IPCA/);
  assert.match(r, /caução continuar equivalente a 2 \(dois\) meses de aluguel/);
  assert.match(r, /de 01 de dezembro de 2026 a 31 de maio de 2029/);
  assert.match(r, /faltam 15 dos 30 meses, a multa é de 3 × R\$ 1\.900,00 × 15\/30 = R\$ 2\.850,00/);
  assert.match(r, /caução de R\$ 3\.420,00/);
  assert.match(r, /em até 72 \(setenta e duas\) horas úteis/);
  assert.match(r, /valem as cláusulas do contrato e a Lei nº 8\.245\/91/);
});

test('variações: fiador, depósito, seguro fiança, sem garantia, prazo indeterminado, não residencial, sem bonificação, incluso, condomínio, FCI', () => {
  const variacoes = [
    [{ garantia_tipo: 'Fiador' }, [/A garantia é a fiança: o FIADOR responde/, /o nome do LOCATÁRIO e do FIADOR pode ir/], [/caução/]],
    [{ garantia_tipo: 'Depósito garantia', deposito_valor: 380000 }, [/depósito de R\$ 3\.800,00/, /descontados do depósito/], [/caução/]],
    [{ garantia_tipo: 'Seguro fiança' }, [/seguro fiança locatícia/], []],
    [{ garantia_tipo: 'Sem garantia' }, [/não tem garantia/], []],
    [{ prazo_tipo: 'Indeterminado' }, [/prazo indeterminado, a partir de 01 de dezembro de 2026/], [/multa de 3 \(três\) meses de aluguel, proporcional/]],
    [{ finalidade: 'Não residencial', atividade: 'escritório' }, [/48 \(quarenta e oito\) horas úteis/], [/72 \(setenta/]],
    [{ desconto_pontualidade_percentual: 0 }, [/O aluguel é de R\$ 1\.900,00 \(mil e novecentos reais\)\. Ele vence/, /Paga-se o valor com multa/], [/bonificação/]],
    [{ conta_agua: 'Incluso no aluguel', conta_seguro: 'Incluso no aluguel' }, [/Já estão incluídos no aluguel, por conta da LOCADORA: água e esgoto e seguro incêndio/, /O seguro contra incêndio é contratado pela LOCADORA/], []],
    [{ conta_condominio: 'Por conta do inquilino' }, [/despesas extraordinárias do condomínio/], []],
    [{ fci_percentual: 5, fci_indice: 'Poupança' }, [/Fundo de Conservação do Imóvel \(FCI\) paga primeiro os reparos/], []],
  ];
  for (const [v, tem, naoTem] of variacoes) {
    const { d, c } = banco();
    for (const m of MODELOS_PADRAO.filter((x) => !x.tipo)) {
      const blocos = K.montarContrato(m.texto, K.dadosDoContrato(d, { ...c, ...v }, { data: '2026-11-24' }));
      const r = resumoDe(blocos);
      assert.doesNotMatch(texto(blocos), SOBRA, `${m.nome} ${JSON.stringify(v)}`);
      for (const x of tem) assert.match(r, x, `${m.nome} ${JSON.stringify(v)}`);
      for (const x of naoTem) assert.doesNotMatch(r, x, `${m.nome} ${JSON.stringify(v)}`);
    }
  }
  // duas locadoras: plural
  const { d, c } = banco();
  d.emitentes = [{ ...d.emitentes[0], assina_documentos: false }, { ...d.emitentes[0], id: 2, razao_social: 'SEGUNDA LOCADORA LTDA', assina_documentos: false }];
  d.participacoes = [{ imovel_id: 1, emitente_id: 1 }, { imovel_id: 1, emitente_id: 2 }];
  const r = resumoDe(K.montarContrato(MODELOS_PADRAO[0].texto, K.dadosDoContrato(d, c)));
  assert.match(r, /autorização por escrito das LOCADORAS/);
  assert.doesNotMatch(r, /da LOCADORA\b/);
});

test('modelos já gravados recebem o resumo uma vez; termo aditivo e contrato com o fim editado ficam como estão', () => {
  const antigo = MODELOS_PADRAO[0].texto.replace(`\n\n${RESUMO_CONTRATO}`, '');
  assert.ok(!antigo.includes('RESUMO DO CONTRATO'));
  const novo = atualizarTextoModelo(antigo);
  assert.equal(novo, MODELOS_PADRAO[0].texto, 'o texto antigo vira o padrão de hoje');
  assert.equal(atualizarTextoModelo(novo), novo, 'não entra duas vezes');
  assert.equal(atualizarTextoModelo(antigo.replace(/\n/g, '\r\n')), MODELOS_PADRAO[0].texto, 'arquivo com quebra de linha do Windows');
  const editado = antigo.replace('a qualquer título.', 'a qualquer título, combinado à parte.');
  assert.equal(atualizarTextoModelo(editado), editado, 'fim editado à mão: não mexe');
  const troca = MODELOS_PADRAO.find((m) => m.tipo === 'aditivo_troca').texto;
  assert.equal(atualizarTextoModelo(troca), troca, 'termo aditivo não ganha o resumo');
  // pela migração do banco (normalizar)
  const d = R.bancoVazio();
  d.modelos_contrato = [{ id: 1, nome: 'Residencial', texto: antigo, padrao: 'Residencial' }, { id: 2, nome: 'Troca', tipo: 'aditivo_troca', texto: troca }];
  R.normalizar(d);
  assert.match(d.modelos_contrato[0].texto, /RESUMO DO CONTRATO EM PERGUNTAS E RESPOSTAS/);
  assert.doesNotMatch(d.modelos_contrato[1].texto, /RESUMO DO CONTRATO/);
});

test('o resumo pode ser usado sozinho com os dados de qualquer contrato (ex.: no termo da reserva)', () => {
  const { d, c } = banco();
  const blocos = K.montarContrato(RESUMO_CONTRATO, K.dadosDoContrato(d, c));
  assert.equal(blocos[0].tipo, 'nova_pagina');
  assert.doesNotMatch(texto(blocos), SOBRA);
  for (const campo of ['exemplo_atraso', 'exemplo_saida']) assert.deepEqual(K.camposDesconhecidosDoModelo(`{${campo}}`), []);
  assert.equal(K.dadosDoContrato(d, { ...c, aluguel_inicial: 0 }).campos.exemplo_atraso, '', 'sem aluguel, sem exemplo');
});

test('tarifa do boleto: o resumo fala dela só quando o contrato tem a tarifa (condição tarifa_boleto)', () => {
  const { d, c } = banco();
  const dados = K.dadosDoContrato(d, c);
  assert.doesNotMatch(resumoDe(K.montarContrato(MODELOS_PADRAO[0].texto, dados)), /tarifa bancária/);
  dados.condicoes.tarifa_boleto = true;
  dados.campos.tarifa_boleto = 'R$ 3,50 (três reais e cinquenta centavos)';
  assert.match(resumoDe(K.montarContrato(MODELOS_PADRAO[0].texto, dados)), /também paga, junto com cada aluguel, a tarifa bancária de emissão do boleto, hoje de R\$ 3,50 \(três reais e cinquenta centavos\)\./);
});
