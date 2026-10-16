import assert from 'node:assert/strict';
import test from 'node:test';
import * as K from '../docs/js/contratos.js';
import * as R from '../docs/js/regras.js';

function base(extra = {}) {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '58.492.818/0001-59', ativo: true, endereco_sede: 'Rua A, 1',
    representante_nome: 'Maria', representante_genero: 'Feminino', representante_cargo: 'sócia administradora' }, 'j');
  const jck = R.inserir(d, 'emitentes', { nome: 'JCK', razao_social: 'JCK ADMINISTRADORA DE BENS LTDA', cnpj: '58.522.768/0001-05', ativo: true, endereco_sede: 'Rua B, 2', representante_nome: 'Júlio' }, 'j');
  const casa = R.inserir(d, 'imoveis', { nome: 'Casa 3', endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'j');
  for (const e of [ank, jck]) R.inserir(d, 'participacoes', { imovel_id: casa.id, emitente_id: e.id, percentual: 50 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Pedro Souza', inquilino_cpf: '444', inquilino_genero: 'Masculino', inquilino_estado_civil: 'Solteiro(a)',
    inquilino_profissao: 'engenheiro', inquilino_endereco: 'Rua Y', vigencia_inicio: '2026-09-05', vigencia_fim: '2029-03-05', prazo_meses: 30, aluguel_inicial: 350000,
    desconto_pontualidade_percentual: 10, dia_vencimento: 10, indice_correcao: 'IPCA', garantia_tipo: 'Caução', caucao_valor: 945000, caucao_meses: 3, finalidade: 'Residencial',
    descricao_objeto: 'a casa nº 3', ...extra }, 'j');
  return { d, c };
}
const texto = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : `[${b.pessoas.map((p) => p.papel).join(', ')}]`)).join('\n');

test('valores, números e datas por extenso', () => {
  assert.equal(K.valorComExtenso(350000), 'R$ 3.500,00 (três mil e quinhentos reais)');
  assert.equal(K.valorComExtenso(315000), 'R$ 3.150,00 (três mil cento e cinquenta reais)');
  assert.equal(K.valorComExtenso(100), 'R$ 1,00 (um real)');
  assert.equal(K.valorComExtenso(123456), 'R$ 1.234,56 (mil duzentos e trinta e quatro reais e cinquenta e seis centavos)');
  assert.equal(K.numeroComExtenso(30), '30 (trinta)');
  assert.equal(K.dataPorExtenso('2026-09-05'), '05 de setembro de 2026');
  assert.equal(K.ordinalPorExtenso(19), 'décima nona');
});

test('linguagem do modelo: campos, condições, plural, cláusulas numeradas e referências', () => {
  const dados = { campos: { nome: 'X' }, condicoes: { a: true, b: false }, quantidades: { locatarios: 1, locadoras: 2, fiadores: 1 }, assinaturas: [] };
  const t = '# T\n\nCLÁUSULA # – {nome}[se a] sim[fim][se b] não[senão] outro[fim][se não b] nb[fim].\n\nCLÁUSULA #multa – {l:a LOCADORA|as LOCADORAS} e {f:o FIADOR|os FIADORES}.\n\nVer {cl:multa}.';
  assert.equal(texto(K.montarContrato(t, dados)), 'T\nCLÁUSULA 1ª – X sim outro nb.\nCLÁUSULA 2ª – as LOCADORAS e o FIADOR.\nVer 2ª (segunda).');
});

test('contrato residencial com as duas empresas como locadoras e caução', () => {
  const { d, c } = base();
  const modelo = K.modelosDe(d).find((m) => m.nome === 'Residencial');
  const dados = K.dadosDoContrato(d, c, { data: '2026-09-01', testemunhas: [{ nome: 'Ana', cpf: '5' }] });
  const t = texto(K.montarContrato(modelo.texto, dados));
  assert.match(t, /LOCADORAS: ANK ADMINISTRADORA DE BENS LTDA.*; e JCK ADMINISTRADORA DE BENS LTDA/);
  assert.match(t, /com término em 05 de março de 2029/);
  assert.match(t, /R\$ 3\.150,00 \(três mil cento e cinquenta reais\)/);
  assert.match(t, /GARANTIA DO CONTRATO – CAUÇÃO/);
  assert.match(t, /Na inobservância da cláusula \d+ª \(/, 'a caução cita a cláusula de vistoria pelo número');
  assert.doesNotMatch(t, /FIADOR:|\[[a-z_]+\?\]|\{|\[se /, 'sem fiador, sem campos desconhecidos e sem marcações sobrando');
  assert.match(t, /\[LOCADORA, LOCADORA, LOCATÁRIO, TESTEMUNHA 1\]/);
  assert.deepEqual(dados.rodape, ['ANK ADMINISTRADORA DE BENS LTDA – CNPJ 58.492.818/0001-59', 'JCK ADMINISTRADORA DE BENS LTDA – CNPJ 58.522.768/0001-05']);
});

test('contrato não residencial com fiadores no plural', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador', finalidade: 'Não residencial', atividade: 'escritório' });
  for (const nome of ['José', 'Rita']) R.inserir(d, 'fiadores', { contrato_id: c.id, nome, cpf: '1', genero: nome === 'Rita' ? 'Feminino' : 'Masculino' }, 'j');
  const modelo = K.modelosDe(d).find((m) => /Não residencial/.test(m.nome));
  const t = texto(K.montarContrato(modelo.texto, K.dadosDoContrato(d, c, { data: '2026-09-01' })));
  assert.match(t, /FIADORES: JOSÉ.*; e RITA/);
  assert.match(t, /finalidade exclusivamente não residencial, para a atividade de escritório/);
  assert.match(t, /SERASA/);
  assert.match(t, /48 \(quarenta e oito\) horas/);
  assert.doesNotMatch(t, /CAUÇÃO|COPEL|\[[a-z_]+\?\]/);
});

test('pendências do cadastro antes de gerar', () => {
  const { d, c } = base({ inquilino_estado_civil: '', descricao_objeto: '' });
  const falta = K.pendenciasDoContrato(d, c);
  assert.ok(falta.includes('inquilino: estado civil'));
  assert.ok(falta.includes('descrição do imóvel no contrato'));
});

test('vistoria: cabeçalho, chaves, roteiro sem preencher fica de fora, assinaturas', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador' });
  R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'José', cpf: '1' }, 'j');
  const v = { tipo: 'Entrada', data: '2026-09-04', link_fotos: 'https://x/fotos', chaves: '01 Controle remoto\n02 Chaves tetra',
    descritivo: '## Sala\n- Piso e rodapé: bom estado\n- Paredes e teto: \nMobília em bom estado:\n- Sofá 2 lugares', condicoes: 'Imóvel entregue limpo.', prazo_dias: 3 };
  const t = texto(K.vistoriaBlocos(d, c, v, { agua: '123', energia: '456' }).blocos);
  assert.match(t, /^VISTORIA DE ENTRADA/);
  assert.match(t, /LOCADORAS: ANK .*; JCK /);
  assert.match(t, /• 01 Controle remoto/);
  assert.match(t, /Água: 123/);
  assert.match(t, /SALA\n• Piso e rodapé: bom estado\nMobília em bom estado:\n• Sofá 2 lugares/);
  assert.doesNotMatch(t, /Paredes e teto/);
  assert.match(t, /3 \(três\) dias/);
  assert.match(t, /\[LOCADORA, LOCADORA, LOCATÁRIO, FIADOR\]/);
});

test('recibo de entrega das chaves', () => {
  const { d, c } = base();
  const t = texto(K.reciboChavesBlocos(d, c, '01 Chave tetra').blocos);
  assert.match(t, /^RECIBO DE ENTREGA DAS CHAVES/);
  assert.match(t, /• 01 Chave tetra/);
  assert.match(t, /Data do recebimento: _____/);
  assert.match(t, /\[LOCADORA, LOCADORA, LOCATÁRIO\]$/);
});

test('modelo de vistoria do imóvel e grade de situações (entrada e saída)', () => {
  const modelo = K.lerModeloVistoria('## Sala\nTeto\nParedes\nMóvel:\nMóvel: sofá cinza\n\n## Banheiro\nHidráulica\n## Vazio');
  assert.deepEqual(modelo, [{ comodo: 'Sala', itens: ['Teto', 'Paredes', 'Móvel: sofá cinza'] }, { comodo: 'Banheiro', itens: ['Hidráulica'] }]);
  assert.equal(K.piorou('Bom', 'Avaria'), true);
  assert.equal(K.piorou('Bom', 'Ótimo'), false);
  assert.equal(K.piorou('', 'Avaria'), false);
  const { d, c } = base();
  const entrada = [{ comodo: 'Sala', item: 'Teto', situacao: 'Bom', obs: '' }, { comodo: 'Sala', item: 'Paredes', situacao: 'Marcas de uso', obs: 'riscos' }, { comodo: 'Sala', item: 'Piso', situacao: '', obs: '' }];
  const ve = { tipo: 'Entrada', data: '2026-09-04', itens: entrada, condicoes: '' };
  const be = K.vistoriaBlocos(d, c, ve, null, { fachada: { src: 'x', bytes: new Uint8Array(), largura: 4, altura: 3 } }).blocos;
  const tab = be.find((b) => b.tipo === 'tabela');
  assert.deepEqual(tab.linhas, [['Teto', 'Bom', ''], ['Paredes', 'Marcas de uso', 'riscos']], 'item sem situação fica de fora');
  assert.equal(be.filter((b) => b.tipo === 'fotos').length, 1);
  const vs = { tipo: 'Saída', data: '2029-03-05', comparar_com: '2026-09-04', itens: [{ comodo: 'Sala', item: 'Teto', situacao: 'Avaria', obs: 'infiltração' }, { comodo: 'Sala', item: 'Paredes', situacao: 'Marcas de uso', obs: '' }], condicoes: '' };
  const ts = K.vistoriaBlocos(d, c, vs, null, {}, entrada).blocos.find((b) => b.tipo === 'tabela');
  assert.deepEqual(ts.cabecalho, ['Item', 'Na entrada', 'Na saída', 'Observação']);
  assert.deepEqual(ts.destaques, [true, false]);
});

test('marca-d\'água: fundo repetido na tela e logo fixa para a impressão', () => {
  assert.equal(K.marcaDagua(null), '');
  const html = K.marcaDagua('data:image/png;base64,AAAA');
  assert.match(html, /class="ct-marcas" style="background-image:url\('data:image\/svg\+xml;base64,/);
  assert.match(html, /<img class="ct-marca" src="data:image\/png;base64,AAAA"/);
  assert.match(K.contratoHtml([{ tipo: 'par', runs: [{ t: 'x' }] }], { logo: 'data:image/png;base64,AAAA', rodape: [] }), /ct-marcas/);
});
