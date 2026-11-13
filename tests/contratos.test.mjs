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
const texto = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : b.url ? `[link ${b.url}]` : b.linhas ? '[tabela]' : `[${b.pessoas.map((p) => p.papel).join(', ')}]`)).join('\n');

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

test('contrato residencial: só a ANK como locadora (mesmo com o imóvel dividido com a JCK) e caução', () => {
  const { d, c } = base();
  const modelo = K.modelosDe(d).find((m) => m.nome === 'Residencial');
  const dados = K.dadosDoContrato(d, c, { data: '2026-09-01', testemunhas: [{ nome: 'Ana', cpf: '5' }] });
  const t = texto(K.montarContrato(modelo.texto, dados));
  assert.match(t, /LOCADORA: ANK ADMINISTRADORA DE BENS LTDA/);
  assert.doesNotMatch(t, /JCK/, 'a JCK não aparece no contrato nem nas assinaturas');
  assert.match(t, /com término em 05 de março de 2029/);
  assert.match(t, /R\$ 3\.150,00 \(três mil cento e cinquenta reais\)/);
  assert.match(t, /GARANTIA DO CONTRATO – CAUÇÃO/);
  assert.match(t, /Na inobservância da cláusula \d+ª \(/, 'a caução cita a cláusula de vistoria pelo número');
  assert.doesNotMatch(t, /FIADOR:|\[[a-z_]+\?\]|\{|\[se /, 'sem fiador, sem campos desconhecidos e sem marcações sobrando');
  assert.match(t, /\[LOCADORA, LOCATÁRIO, TESTEMUNHA 1\]/);
  assert.deepEqual(dados.rodape, ['ANK ADMINISTRADORA DE BENS LTDA – CNPJ 58.492.818/0001-59']);
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
  assert.doesNotMatch(t, /CAUÇÃO|\[[a-z_]+\?\]/);
  // revisão de 2026-11-12: a procuração das companhias vale também no comercial; multa da saída igual à do residencial
  assert.match(t, /DA REPRESENTAÇÃO PERANTE AS CONCESSIONÁRIAS E PRESTADORES DE SERVIÇO: .*\(COPEL\) e a Companhia de Saneamento/);
  assert.match(t, /será cobrada a multa de 3 \(três\) meses de aluguel, proporcional ao tempo restante do contrato/);
  assert.match(t, /DOS DADOS PESSOAIS: os dados pessoais do LOCATÁRIO, dos FIADORES e de seus representantes/);
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
  assert.match(t, /LOCADORA: ANK ADMINISTRADORA/);
  assert.doesNotMatch(t, /JCK/);
  assert.match(t, /• 01 Controle remoto/);
  assert.match(t, /Água: 123/);
  assert.match(t, /SALA\n• Piso e rodapé: bom estado\nMobília em bom estado:\n• Sofá 2 lugares/);
  assert.doesNotMatch(t, /Paredes e teto/);
  assert.match(t, /3 \(três\) dias/);
  assert.match(t, /\[LOCADORA, LOCATÁRIO, FIADOR\]/);
});

test('recibo de entrega das chaves', () => {
  const { d, c } = base();
  const t = texto(K.reciboChavesBlocos(d, c, '01 Chave tetra').blocos);
  assert.match(t, /^RECIBO DE ENTREGA DAS CHAVES/);
  assert.match(t, /• 01 Chave tetra/);
  assert.match(t, /Data do recebimento: _____/);
  assert.match(t, /\[LOCADORA, LOCATÁRIO\]$/);
  const ank = K.reciboChavesBlocos(d, c, '').blocos.at(-1).pessoas[0];
  assert.equal(ank.extra, 'REPRESENTANTE DA ADMINISTRADORA', 'sem o nome de quem representa: a entrega é feita por quem estiver no dia');
  assert.equal(K.dadosDoContrato(d, c).assinaturas[0].extra, 'MARIA – SÓCIA ADMINISTRADORA', 'no contrato continua o nome');
});

test('recibo das chaves de imóvel sem chave (terreno): registra a entrega da posse, sem a lista', () => {
  const { d, c } = base();
  d.imoveis.find((i) => i.id === c.imovel_id).sem_chaves = true;
  const t = texto(K.reciboChavesBlocos(d, c, '').blocos);
  assert.match(t, /recebe a posse do imóvel acima descrito, que não possui chaves nem controles/);
  assert.doesNotMatch(t, /RELAÇÃO DE CHAVES|_{20}/);
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

test('vistoria de saída registrada é a fonte única do "Vistoria de saída" do cálculo final', () => {
  const { d, c } = base();
  // sem vistoria de saída: "Não feita"; dado antigo guardado no cálculo final continua valendo
  assert.deepEqual(K.resultadoVistoriaSaida(d, c), { texto: 'Não feita', vistoria: null, pendencias: [] });
  assert.equal(K.textoVistoriaSaida(d, c, null), 'Não feita');
  assert.equal(K.textoVistoriaSaida(d, c, { vistoria_saida: 'Com pendências' }), 'Com pendências');
  R.inserir(d, 'vistorias', { contrato_id: c.id, imovel_id: c.imovel_id, tipo: 'Entrada', data: '2026-09-04', itens: [
    { comodo: 'Sala', item: 'Teto', situacao: 'Bom', obs: '' }, { comodo: 'Sala', item: 'Paredes', situacao: 'Avaria', obs: 'já tinha furos' }] }, 'j');
  const saida = R.inserir(d, 'vistorias', { contrato_id: c.id, imovel_id: c.imovel_id, tipo: 'Saída', data: '2029-03-05', itens: [
    { comodo: 'Sala', item: 'Teto', situacao: 'Bom', obs: '' }, { comodo: 'Sala', item: 'Paredes', situacao: 'Avaria', obs: 'furos' }] }, 'j');
  // igual à entrada (a avaria das paredes já existia): sem pendências
  assert.equal(K.resultadoVistoriaSaida(d, c).texto, 'Sem pendências');
  // piorou (teto) e item novo com avaria (porta, sem comparação na entrada): com pendências, listadas
  saida.itens = [{ comodo: 'Sala', item: 'Teto', situacao: 'Avaria', obs: 'infiltração' }, { comodo: 'Sala', item: 'Paredes', situacao: 'Avaria', obs: '' }, { comodo: 'Sala', item: 'Porta', situacao: 'Não funciona', obs: '' }];
  const r = K.resultadoVistoriaSaida(d, c);
  assert.equal(r.vistoria.id, saida.id);
  assert.deepEqual([r.texto, r.pendencias], ['Com pendências', ['Sala – Teto (Avaria: infiltração)', 'Sala – Porta (Não funciona)']]);
  // a vistoria registrada vale sobre o que foi guardado antes; "Contestada" antigo fica anotado
  assert.equal(K.textoVistoriaSaida(d, c, { vistoria_saida: 'Sem pendências' }), 'Com pendências');
  assert.equal(K.textoVistoriaSaida(d, c, { vistoria_saida: 'Contestada' }), 'Com pendências (contestada pelo inquilino)');
  // sem grade (imóvel sem modelo): valem as linhas "DIFERENÇA:" do descritivo
  saida.itens = [];
  saida.descritivo = '## SALA\n- teto: bom estado\n- parede: DIFERENÇA: furos de quadro';
  assert.deepEqual(K.resultadoVistoriaSaida(d, c).pendencias, ['parede: DIFERENÇA: furos de quadro']);
  saida.descritivo = '## SALA\n- teto: bom estado';
  assert.equal(K.resultadoVistoriaSaida(d, c).texto, 'Sem pendências');
});

test('marca-d\'água: fundo repetido na tela e logo fixa para a impressão', () => {
  assert.equal(K.marcaDagua(null), '');
  const html = K.marcaDagua('data:image/png;base64,AAAA');
  assert.match(html, /class="ct-marcas" style="background-image:url\('data:image\/svg\+xml;base64,/);
  assert.match(html, /<img class="ct-marca" src="data:image\/png;base64,AAAA"/);
  assert.match(K.contratoHtml([{ tipo: 'par', runs: [{ t: 'x' }] }], { logo: 'data:image/png;base64,AAAA', rodape: [] }), /ct-marcas/);
});

test('caução pelas condições do contrato (sem valor gravado nem data) e sem tarifa de cobrança', () => {
  const { d, c } = base({ caucao_valor: null, taxa_boleto: 350 });
  const t = texto(K.montarContrato(K.modelosDe(d).find((m) => m.nome === 'Residencial').texto, K.dadosDoContrato(d, c, { data: '2026-09-01' })));
  assert.match(t, /o valor de R\$ 9\.450,00 \(nove mil quatrocentos e cinquenta reais\), equivalente a 3 \(três\) meses de aluguel/, '3 × R$ 3.150,00 bonificado');
  assert.doesNotMatch(t, /tarifa de cobrança/);
  const x = R.completarCaucao({ garantia_tipo: 'Caução', caucao_meses: 3, aluguel_inicial: 200000, desconto_pontualidade_percentual: 10, vigencia_inicio: '2026-11-01' });
  assert.equal(x.caucao_valor, 540000);
  assert.equal(x.caucao_data, '2026-11-01', 'data prevista = data do contrato');
  assert.ok(K.pendenciasDoContrato(d, { ...c, caucao_valor: null, caucao_meses: null }).includes('caução: valor ou quantos aluguéis'));
});

test('assinaturas em conjuntos: locatários, fiadores, locadora, testemunhas', () => {
  const g = K.gruposAssinatura([{ papel: 'LOCADORA' }, { papel: 'LOCATÁRIO' }, { papel: 'LOCATÁRIO SOLIDÁRIO' }, { papel: 'FIADOR 1' }, { papel: 'FIADOR 2' }, { papel: 'TESTEMUNHA 1' }]);
  assert.deepEqual(g.map((x) => x.map((p) => p.papel)), [['LOCATÁRIO', 'LOCATÁRIO SOLIDÁRIO'], ['FIADOR 1', 'FIADOR 2'], ['LOCADORA'], ['TESTEMUNHA 1']]);
  const troca = K.gruposAssinatura([{ papel: 'LOCADORA' }, { papel: 'LOCATÁRIO SAINTE' }, { papel: 'LOCATÁRIO ENTRANTE' }, { papel: 'LOCATÁRIO ENTRANTE' }, { papel: 'TESTEMUNHA 1' }]);
  assert.deepEqual(troca.map((x) => x.map((p) => p.papel)), [['LOCATÁRIO SAINTE'], ['LOCATÁRIO ENTRANTE', 'LOCATÁRIO ENTRANTE'], ['LOCADORA'], ['TESTEMUNHA 1']], 'termo de troca: quem sai e quem entra em conjuntos separados');
  const html = K.contratoHtml([{ tipo: 'assinaturas', pessoas: [{ nome: 'A', papel: 'LOCADORA' }, { nome: 'B', papel: 'LOCATÁRIO' }] }], { logo: null, rodape: ['ANK – CNPJ 1'] });
  assert.match(html, /ct-grupo-assina um/, 'conjunto de uma pessoa fica centralizado');
  assert.match(html, /counter\(page\) " de " counter\(pages\)/, 'contagem de páginas no rodapé da impressão');
});

test('vistoria: cada parte numa linha, link das fotos em linha própria (hiperlink no Word) e "Não se aplica" fora', async () => {
  const { d, c } = base({ solidario_nome: 'Ana Solidária', solidario_cpf: '529.982.247-25' });
  const v = { tipo: 'Entrada', data: '2026-09-04', link_fotos: 'onedrive.live.com/fotos', condicoes: '',
    itens: [{ comodo: 'Sala', item: 'Piso', situacao: 'Bom', obs: '' }, { comodo: 'Sala', item: 'Lareira', situacao: 'Não se aplica', obs: '' }] };
  const blocos = K.vistoriaBlocos(d, c, v).blocos;
  const t = texto(blocos);
  assert.match(t, /\nLOCATÁRIO: PEDRO SOUZA, CPF 444\nLOCATÁRIO SOLIDÁRIO: ANA SOLIDÁRIA, CPF 529\.982\.247-25\n/);
  assert.match(t, /compartilhado por e-mail:\n\[link https:\/\/onedrive\.live\.com\/fotos\]/);
  assert.deepEqual(blocos.find((b) => b.tipo === 'tabela').linhas, [['Piso', 'Bom', '']]);
  assert.match(K.contratoHtml(blocos, { rodape: [] }), /<a href="https:\/\/onedrive\.live\.com\/fotos"/);
  const arquivos = {};
  const JSZip = class { file(n, c) { arquivos[n] = c; } async generateAsync() { return null; } };
  await K.contratoDocx(JSZip, blocos, { logo: null, rodape: [], titulo: 'v' });
  assert.match(arquivos['word/document.xml'], /<w:hyperlink r:id="rIdLink1"/);
  assert.match(arquivos['word/_rels/document.xml.rels'], /Id="rIdLink1"[^>]*Target="https:\/\/onedrive\.live\.com\/fotos" TargetMode="External"/);
  // logo da 1ª folha igual à do PDF: 6 cm de largura (proporção mantida), a 1 cm da borda de cima, com o texto abaixo
  await K.contratoDocx(JSZip, blocos, { logo: { bytes: new Uint8Array(), marca: new Uint8Array(), largura: 1200, altura: 600 }, rodape: [], titulo: 'v' });
  const capa = arquivos['word/document.xml'].match(/<wp:anchor[^]*?<\/wp:anchor>/)[0];
  assert.match(capa, /<wp:posOffset>360000<\/wp:posOffset>/);
  assert.match(capa, /<wp:extent cx="2160000" cy="1080000"\/>/);
  assert.match(capa, /<wp:wrapTopAndBottom\/>/);
});

test('modelo de vistoria: tira só os itens que não se aplicam, no cômodo certo', () => {
  const modelo = '## Sala\nPiso\nLareira\nMóvel:\n## Cozinha\n- Lareira\nPia';
  assert.equal(K.tirarDoModelo(modelo, [{ comodo: 'Sala', item: 'Lareira' }]), '## Sala\nPiso\nMóvel:\n## Cozinha\n- Lareira\nPia');
  assert.ok(!K.SITUACOES_VISTORIA.includes('Ótimo'));
});

test('vistoria: textos de abertura e final podem ser trocados; em branco, vale o padrão', () => {
  const { d, c } = base();
  const v = { tipo: 'Entrada', data: '2026-09-04', condicoes: '', itens: [] };
  let t = texto(K.vistoriaBlocos(d, c, v).blocos);
  assert.match(t, /verifique as fotos em anexo\./, 'sem link: o padrão sem link');
  assert.match(t, /O LOCATÁRIO tem 3 \(três\) dias[^\n]*\nO imóvel deve ser devolvido/);
  t = texto(K.vistoriaBlocos(d, c, { ...v, texto_abertura: 'Relatório do imóvel.', texto_final: 'Prazo de 5 dias para contestar.\nDevolver igual.' }).blocos);
  assert.match(t, /Relatório do imóvel\./);
  assert.match(t, /Prazo de 5 dias para contestar\.\nDevolver igual\./);
  assert.doesNotMatch(t, /3 \(três\) dias|presente relatório/);
});

test('termo aditivo de troca de inquilino: quem sai e quem entra, débitos até a véspera, caução passa a quem entra e assinaturas', () => {
  const { d, c } = base();
  const n = R.inserir(d, 'contratos', { imovel_id: c.imovel_id, contrato_anterior_id: c.id, inquilino_nome: 'Lúcia Prado', inquilino_cpf: '529.982.247-25', inquilino_genero: 'Feminino',
    inquilino_estado_civil: 'Casado(a)', inquilino_profissao: 'cabeleireira', inquilino_endereco: 'Rua W, 5', solidario_nome: 'João Prado', solidario_cpf: '111', solidario_genero: 'Masculino',
    data_entrada: '2027-04-27', vigencia_inicio: '2027-04-27', vigencia_fim: '2029-03-05', prazo_meses: 30, aluguel_inicial: 380000, desconto_pontualidade_percentual: 10, dia_vencimento: 10, indice_correcao: 'IPCA',
    garantia_tipo: 'Caução', caucao_valor: 945000, caucao_meses: 3, finalidade: 'Não residencial', descricao_objeto: 'a loja nº 2' }, 'j');
  assert.throws(() => R.salvarAditivoTroca(d, c.id, { data: '2027-04-27', texto: 'x' }, 'j'), /não continua o contrato de outro/);
  const modelo = K.modelosDe(d, 'aditivo_troca')[0];
  assert.equal(K.modelosDe(d, 'aditivo').some((m) => m.tipo === 'aditivo_troca'), false, 'separado do aditivo de vencimento');
  const a = R.salvarAditivoTroca(d, n.id, { data: '2027-04-27', texto: modelo.texto, testemunhas: [{ nome: 'Teste Um', cpf: '529.982.247-25' }] }, 'j');
  assert.equal(a.tipo, K.TIPO_ADITIVO_TROCA);
  assert.match(a.assunto, /Pedro Souza → Lúcia Prado, a partir de 27\/04\/2027/);
  const t = texto(K.montarContrato(a.texto, K.dadosDoAditivo(d, n, a)));
  assert.match(t, /1º TERMO ADITIVO/);
  assert.match(t, /LOCATÁRIO SAINTE: PEDRO SOUZA, solteiro, engenheiro/);
  assert.match(t, /LOCATÁRIOS ENTRANTES: LÚCIA PRADO, casada, cabeleireira[^\n]*; e JOÃO PRADO/);
  assert.match(t, /firmado em 05 de setembro de 2026/, 'data do contrato original');
  assert.match(t, /art\. 13 da Lei nº 8\.245\/91/);
  assert.match(t, /A partir de 27 de abril de 2027, o LOCATÁRIO SAINTE retira-se/);
  assert.match(t, /respondem solidariamente entre si/);
  assert.match(t, /inclusive o prazo da locação, que não recomeça com esta transferência e termina em 05 de março de 2029: aluguel mensal de R\$ 3\.800,00/);
  assert.match(t, /referentes ao período até 26 de abril de 2027/);
  assert.match(t, /não dá quitação/);
  assert.match(t, /caução de R\$ 9\.450,00[^\n]*transfere aos LOCATÁRIOS ENTRANTES o direito à devolução/);
  assert.match(t, /\[LOCADORA, LOCATÁRIO SAINTE, LOCATÁRIO ENTRANTE, LOCATÁRIO ENTRANTE, TESTEMUNHA 1\]/);
  assert.doesNotMatch(t, /\[\w+\?\]/, 'nenhum campo desconhecido');
  // prazo: o do contrato assumido (não recomeça na troca); dados antigos com o prazo recomeçado se ajustam
  assert.equal(R.fimDoPrazoHerdado(d, n), '2029-03-05');
  n.vigencia_fim = '2029-10-27';
  R.normalizar(d);
  assert.equal(n.vigencia_fim, '2029-03-05', 'fim recalculado da troca (27/04/2027 + 30 meses) volta ao do contrato');
  n.vigencia_fim = '2030-01-10';
  R.normalizar(d);
  assert.equal(n.vigencia_fim, '2030-01-10', 'fim diferente (ex.: renovação) fica');
  R.assinarAditivo(d, a.id, { data: '2027-04-28', arquivo: 'termo.pdf' }, 'j');
  assert.equal(R.alertaAditivoHerdeiro(d, n), null, 'assinado: some o alerta da troca de titular');
});

test('termo aditivo de troca com garantia nova: caução de quem sai devolvida a ele, fiador de quem entra e ciência dos dois', () => {
  const { d, c } = base();
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-09-05', valor: 945000, arquivo: 'cau.pdf' }, 'j');
  const n = R.inserir(d, 'contratos', { imovel_id: c.imovel_id, contrato_anterior_id: c.id, inquilino_nome: 'Lúcia Prado', inquilino_cpf: '529.982.247-25', inquilino_genero: 'Feminino',
    data_entrada: '2027-04-27', vigencia_inicio: '2027-04-27', vigencia_fim: '2029-03-05', aluguel_inicial: 380000, dia_vencimento: 10, indice_correcao: 'IPCA',
    garantia_tipo: 'Fiador', garantia_na_troca: 'nova', finalidade: 'Residencial', descricao_objeto: 'a casa nº 3' }, 'j');
  R.inserir(d, 'fiadores', { contrato_id: n.id, nome: 'Ana Lima', cpf: '529.982.247-25', genero: 'Feminino' }, 'j');
  const modelo = K.modelosDe(d, 'aditivo_troca')[0];
  const a = R.salvarAditivoTroca(d, n.id, { data: '2027-04-27', texto: modelo.texto }, 'j');
  assert.equal(a.garantia_anterior, 945000);
  const t = texto(K.montarContrato(a.texto, K.dadosDoAditivo(d, n, a)));
  assert.match(t, /A garantia prestada no contrato pelo LOCATÁRIO SAINTE, caução de R\$ 9\.450,00 \(nove mil[^)]*\), não passa ao LOCATÁRIO ENTRANTE: será devolvida ao LOCATÁRIO SAINTE/);
  assert.match(t, /descontados os débitos do período até 26 de abril de 2027/);
  assert.match(t, /O FIADOR declara conhecer e aceitar as condições do contrato e garante as obrigações do LOCATÁRIO ENTRANTE/);
  assert.match(t, /O LOCATÁRIO SAINTE e o LOCATÁRIO ENTRANTE declaram ciência de que a garantia prestada no contrato não continua na locação e é substituída pela garantia descrita acima\./);
  assert.doesNotMatch(t, /continua depositada|transfere ao LOCATÁRIO ENTRANTE o direito/, 'sem o texto da garantia que continua');
  assert.doesNotMatch(t, /\[\w+\?\]/, 'nenhum campo desconhecido');
  // quem entra sem garantia
  n.garantia_tipo = 'Sem garantia';
  const t2 = texto(K.montarContrato(a.texto, K.dadosDoAditivo(d, n, a)));
  assert.match(t2, /A partir de 27 de abril de 2027, a locação fica sem garantia\./);
  assert.match(t2, /não continua na locação\./);
  // modelo de troca já gravado (antes desta regra): ganha a garantia nova e mantém o texto da que continua
  d.modelos_contrato.push({ id: 9, nome: 'Meu aditivo', tipo: 'aditivo_troca', texto: '# T\n\n## DA GARANTIA\n\n[se caucao]**CLÁUSULA #** – Caução continua.[fim]\n\n## DISPOSIÇÕES FINAIS\n\nFim.' });
  R.normalizar(d);
  const salvo = d.modelos_contrato.find((m) => m.id === 9).texto;
  assert.match(salvo, /\[se garantia_nova\]/);
  n.garantia_tipo = 'Caução';
  n.garantia_na_troca = null;
  assert.match(texto(K.montarContrato(salvo, K.dadosDoAditivo(d, n, { ...a, garantia_anterior: null }))), /CLÁUSULA 1ª – Caução continua\.\nDISPOSIÇÕES FINAIS/);
  R.normalizar(d);
  assert.equal(d.modelos_contrato.find((m) => m.id === 9).texto, salvo, 'só uma vez');
});

test('termo aditivo de vencimento (modelo C): só muda o dia, referência no mês anterior, fiador concorda e assinaturas', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador' });
  R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'Ana Lima', cpf: '529.982.247-25', genero: 'Feminino' }, 'j');
  const modelo = K.modelosDe(d, 'aditivo')[0];
  assert.equal(K.modelosDe(d).some((m) => m.tipo === 'aditivo'), false, 'o aditivo não aparece entre os modelos de contrato');
  const a = R.salvarAditivoVencimento(d, c.id, { data: '2026-11-05', dia_novo: '20', mes: '2026-12', texto: modelo.texto,
    testemunhas: [{ nome: 'Teste Um', cpf: '529.982.247-25' }, { nome: '', cpf: '' }] }, 'j');
  const t = texto(K.montarContrato(a.texto, K.dadosDoAditivo(d, c, a)));
  assert.match(t, /1º TERMO ADITIVO AO CONTRATO DE LOCAÇÃO/);
  assert.match(t, /a pedido do LOCATÁRIO/);
  assert.match(t, /vencer todo dia 20 \(vinte\) de cada mês, e não mais no dia 10 \(dez\), a partir do vencimento de 20 de dezembro de 2026, referente ao mês de novembro de 2026/);
  assert.match(t, /continua se referindo ao mês anterior ao do vencimento, sem cobrança ou desconto de dias/);
  assert.doesNotMatch(t, /R\$/, 'sem valor proporcional');
  assert.match(t, /O FIADOR declara estar de acordo/);
  assert.match(t, /\[LOCADORA, LOCATÁRIO, FIADOR, TESTEMUNHA 1\]/);
  assert.doesNotMatch(t, /\[\w+\?\]/, 'nenhum campo desconhecido');
  // cobrança no próprio mês do vencimento
  R.atualizar(d, 'contratos', c.id, { cobranca_mes_seguinte: false }, 'j');
  const b = R.salvarAditivoVencimento(d, c.id, { data: '2026-11-05', dia_novo: '5', mes: '2027-01', texto: modelo.texto }, 'j');
  const tb = texto(K.montarContrato(b.texto, K.dadosDoAditivo(d, c, b)));
  assert.match(tb, /^2º TERMO/);
  assert.match(tb, /referente ao mês de janeiro de 2027/);
  assert.match(tb, /próprio mês do vencimento/);
  assert.doesNotMatch(tb, /TESTEMUNHA/);
});

test('revisão de 2026-11-12: procuração com os números do imóvel, aviso prévio do art. 6º e vistoria de entrada', () => {
  const { d, c } = base({ conta_gas: 'Por conta do inquilino', conta_condominio: 'Por conta do inquilino', conta_internet: 'Incluso no aluguel' });
  Object.assign(d.imoveis[0], { copel_uc: '12345', copel_medidor: '', sanepar_matricula: '777', sanepar_hidrometro: 'A9', gas_relogio: '55', administradora_nome: 'Adm Pinheiros' });
  const rep = K.representacaoDoContrato(d, c, d.imoveis[0]);
  assert.deepEqual(rep, ['a Companhia Paranaense de Energia (COPEL), unidade consumidora nº 12345', 'a Companhia de Saneamento do Paraná (SANEPAR), matrícula nº 777, hidrômetro nº A9',
    'a fornecedora de gás Supergasbras, relógio nº 55', 'a administradora do condomínio Adm Pinheiros']);
  const modelo = K.modelosDe(d).find((m) => m.nome === 'Residencial');
  const t = texto(K.montarContrato(modelo.texto, K.dadosDoContrato(d, c, { data: '2026-09-01' })));
  assert.match(t, /representá-lo perante a Companhia Paranaense de Energia \(COPEL\), unidade consumidora nº 12345, .*hidrômetro nº A9, a fornecedora de gás Supergasbras, relógio nº 55 e a administradora do condomínio Adm Pinheiros, no início e ao fim/);
  assert.match(t, /pagará a quantia correspondente a 1 \(um\) mês de aluguel e encargos vigentes .*art\. 6º/);
  assert.match(t, /recebe o imóvel na data da entrega das chaves/);
  assert.match(t, /5 \(cinco\) dias úteis, contados da entrega das chaves/);
  assert.match(t, /feito pela LOCADORA com o imóvel desocupado, antes da entrega/);
  assert.match(t, /honorários advocatícios de 20% \(vinte por cento\)/);
  assert.doesNotMatch(t, /25%/);
  // sem água nem energia por conta do inquilino e sem as outras contas: a cláusula sai
  const { d: d2, c: c2 } = base({ conta_agua: 'Incluso no aluguel', conta_energia: 'Não tem' });
  assert.deepEqual(K.representacaoDoContrato(d2, c2, d2.imoveis[0]), []);
});

test('modelos já gravados recebem a revisão (só o texto antigo que continua igual)', async () => {
  const M = await import('../docs/js/modelos-contrato.js');
  const antigo = ['**CLÁUSULA #vistoria** – O LOCATÁRIO recebe, no ato da assinatura do presente contrato, as dependências do imóvel em perfeitas condições de serem ocupadas, conforme relatório de vistoria anexo a este contrato, obrigando-se a manter tudo como recebeu e a restituí-lo no mesmo estado de conservação, higiene e perfeito funcionamento.',
    'Texto. Caso não proceda desta forma, incidirá a multa prevista na cláusula {cl:multa}.', 'honorários advocatícios de 25% (vinte e cinco por cento)',
    '**Parágrafo único** – As partes se obrigam a comunicar qualquer mudança de endereço, inclusive de endereço eletrônico.'].join('\n\n');
  const d = R.bancoVazio();
  d.modelos_contrato.push({ id: 1, nome: 'Residencial', texto: antigo }, { id: 2, nome: 'Meu', texto: 'honorários de 30%' }, { id: 3, nome: 'Aditivo', tipo: 'aditivo', texto: 'honorários advocatícios de 25% (vinte e cinco por cento)' });
  R.normalizar(d);
  const t = d.modelos_contrato[0].texto;
  assert.ok(t.includes(M.VISTORIA_ENTRADA) && t.includes(M.SEM_AVISO) && t.includes('20% (vinte por cento)') && t.includes('DOS DADOS PESSOAIS'));
  assert.equal(d.modelos_contrato[1].texto, 'honorários de 30%', 'texto editado à mão fica como está');
  assert.match(d.modelos_contrato[2].texto, /25%/, 'aditivos não mudam');
  R.normalizar(d);
  assert.equal(d.modelos_contrato[0].texto.split('DOS DADOS PESSOAIS').length, 2, 'rodar de novo não repete a LGPD');
});

test('revisão de 2026-11-13: prazo menor que 30 meses, multa, entrega, fiador, abandono, negativação, assinatura e condomínio', async () => {
  const M = await import('../docs/js/modelos-contrato.js');
  const gera = (extra, nome = 'Residencial') => {
    const { d, c } = base(extra);
    return texto(K.montarContrato(K.modelosDe(d).find((m) => m.nome === nome).texto, K.dadosDoContrato(d, c, { data: '2026-09-01' })));
  };
  const curto = gera({ prazo_meses: 12, vigencia_fim: '2027-09-05' });
  assert.match(curto, /só poderá ser retomado nas hipóteses do art\. 47/);
  assert.doesNotMatch(curto, /rescindi-la a qualquer tempo/);
  const longo = gera({ conta_condominio: 'Por conta do inquilino' });
  assert.match(longo, /rescindi-la a qualquer tempo/);
  assert.match(longo, /despesas extraordinárias de condomínio/);
  assert.doesNotMatch(gera({}), /despesas extraordinárias/, 'sem condomínio, sem o parágrafo');
  assert.match(gera({ prazo_meses: 12, finalidade: 'Não residencial' }, 'Não residencial (comercial)'), /rescindi-la a qualquer tempo/, 'comercial não tem o art. 47');
  assert.doesNotMatch(longo, /sempre devida integralmente|tantas vezes/);
  assert.match(longo, /O aluguel e os encargos são devidos até a data da devolução das chaves/);
  assert.doesNotMatch(longo, /tal como na vistoria inicial|independentemente de procedimento judicial/);
  assert.match(longo, /ata notarial ou declaração de 2 \(duas\) testemunhas/);
  assert.match(longo, /depois do aviso prévio feito pelo próprio órgão/);
  assert.match(longo, /assinatura eletrônica, que reconhecem como válida .* na presença de 2 \(duas\) testemunhas/);
  assert.match(M.MODELOS_PADRAO[0].texto, /de sua exoneração da fiança, da venda ou oneração dos imóveis/);
  const com = gera({}, 'Não residencial (comercial)');
  assert.doesNotMatch(com, /todo atraso/);
  assert.equal(com.split('órgãos de proteção ao crédito (SERASA').length, 2);
  // modelo gravado na versão anterior recebe as trocas; rodar de novo não repete
  const antigo = M.MODELOS_PADRAO[1].texto.split(M.NEGATIVACAO + '\n\n').join('').split(M.EXTRAORDINARIAS).join('');
  const d = R.bancoVazio();
  d.modelos_contrato.push({ id: 1, nome: 'Comercial', texto: antigo });
  R.normalizar(d);
  R.normalizar(d);
  const novo = d.modelos_contrato[0].texto;
  assert.equal(novo.split('depois do aviso prévio feito pelo próprio órgão').length, 2);
  assert.equal(novo.split('despesas extraordinárias de condomínio').length, 2);
});

test('fiador casado: o cônjuge assina em anuência; sem ele, pendência (salvo separação total por pacto)', () => {
  const { d, c } = base({ garantia_tipo: 'Fiador' });
  const f = R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'José', cpf: '1', genero: 'Masculino', estado_civil: 'Casado(a)', regime_bens: 'Comunhão parcial' }, 'j');
  assert.ok(K.pendenciasDoContrato(d, c).some((x) => /fiador José: cônjuge/.test(x)));
  f.regime_bens = 'Separação total (pacto antenupcial)';
  assert.ok(!K.pendenciasDoContrato(d, c).some((x) => /cônjuge/.test(x)));
  Object.assign(f, { regime_bens: 'Comunhão parcial', nome_conjuge: 'Rita', cpf_conjuge: '2' });
  const dados = K.dadosDoContrato(d, c, { data: '2026-09-01' });
  assert.match(dados.campos.fiadores, /sob o regime de comunhão parcial, e seu cônjuge RITA, portador\(a\) do CPF nº 2, que assina este contrato em anuência à fiança/);
  assert.deepEqual(dados.assinaturas.map((a) => a.papel), ['LOCADORA', 'LOCATÁRIO', 'FIADOR', 'CÔNJUGE DO FIADOR (ANUÊNCIA)']);
  const { d: d2, c: c2 } = base({ garantia_tipo: 'Fiador + depósito' });
  assert.ok(K.pendenciasDoContrato(d2, c2).some((x) => /garantia dupla/.test(x)));
});
