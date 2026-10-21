import assert from 'node:assert/strict';
import test from 'node:test';
import * as F from '../docs/js/formularios.js';

test('CPF e CNPJ: dígitos verificadores, máscara e conferência', () => {
  assert.equal(F.cpfValido('529.982.247-25'), true);
  assert.equal(F.cpfValido('529.982.247-24'), false);
  assert.equal(F.cpfValido('111.111.111-11'), false);
  assert.equal(F.cnpjValido('11.222.333/0001-81'), true);
  assert.equal(F.cnpjValido('11.222.333/0001-80'), false);
  assert.equal(F.mascarar('cpfcnpj', '52998224725'), '529.982.247-25');
  assert.equal(F.mascarar('cpfcnpj', '11222333000181'), '11.222.333/0001-81');
  assert.equal(F.mascarar('cep', '80010000'), '80010-000');
  assert.equal(F.mascarar('tel', '41999998888'), '(41) 99999-8888');
  assert.equal(F.mascarar('tel', '4133334444'), '(41) 3333-4444');
  assert.equal(F.conferirDocumento('cpfcnpj', '123'), 'Informe um CPF (11 números) ou CNPJ (14 números)');
  assert.equal(F.conferirDocumento('cpf', '52998224725'), '');
});

test('ler: documento inválido barra; o que já estava salvo e não mudou passa', () => {
  const campos = [{ nome: 'cpf', rotulo: 'CPF', tipo: 'cpf' }, { nome: 'tel', rotulo: 'Tel', tipo: 'tel' }];
  const fd = (cpf, tel = '41999998888') => { const f = new FormData(); f.set('cpf', cpf); f.set('tel', tel); return f; };
  assert.match(F.ler(campos, fd('123.456.789-00')).erros.cpf, /inválido/);
  const ok = F.ler(campos, fd('52998224725'));
  assert.deepEqual(ok.dados, { cpf: '529.982.247-25', tel: '(41) 99999-8888' });
  const antigo = { cpf: '123.456.789-00' };
  assert.deepEqual(F.ler(campos, fd('123.456.789-00'), antigo).erros, {}, 'dado antigo não barra a edição');
});

test('fiadores no cadastro do contrato: sem "Excluir" (é na página do inquilino); sobra um bloco em branco, recolhido', () => {
  const nomes = (lista) => lista.filter((c) => c.nome && c.nome.endsWith('_nome')).map((c) => c.nome);
  const recolhidos = (lista) => lista.filter((c) => c.secao && c.recolher).map((c) => c.fiador);
  assert.deepEqual(nomes(F.fiadoresNoCadastro([])), ['fiador1_nome', 'fiador2_nome']);
  assert.deepEqual(recolhidos(F.fiadoresNoCadastro([])), [2], 'o primeiro fiador fica aberto; "mais um fiador" começa recolhido');
  const dois = F.fiadoresNoCadastro([{ nome: 'A' }, { nome: 'B' }]);
  assert.deepEqual(nomes(dois), ['fiador1_nome', 'fiador2_nome', 'fiador3_nome']);
  assert.deepEqual(recolhidos(dois), [3]);
  assert.equal(dois.some((c) => c.nome && c.nome.endsWith('_excluir')), false);
});

test('partes recolhidas: começam fechadas com o botão de expandir; com erro, abertas', () => {
  const campos = [{ secao: 'Inquilino solidário', recolher: F.EXPANDIR_PARTE }, { nome: 'solidario_nome', rotulo: 'Nome', tipo: 'texto' }, { secao: 'Outra' }, { nome: 'x', rotulo: 'X', tipo: 'texto' }];
  const html = F.camposHtml(campos);
  assert.match(html, /data-expandir="g0"[^>]*>Expanda para cadastrar parte</);
  assert.match(html, /class="[^"]*recolhido"\s*data-grupo="g0"/);
  assert.doesNotMatch(html, /recolhido"\s*data-grupo="g2"|data-grupo="g2"/, 'seção comum não recolhe');
  assert.match(F.camposHtml(campos, { solidario_nome: 'Maria' }), />Expanda para ver ou alterar</);
  assert.doesNotMatch(F.camposHtml(campos, {}, { solidario_nome: 'erro' }), /recolhido/);
});

test('rótulo do documento do inquilino: CPF e RG na pessoa física, CNPJ e inscrição estadual na empresa', () => {
  const campos = F.CONTRATO.filter((c) => ['inquilino_cpf', 'inquilino_rg'].includes(c.nome));
  assert.match(F.camposHtml(campos, { inquilino_tipo: 'Pessoa física' }), />CPF<[\s\S]*>RG</);
  assert.match(F.camposHtml(campos, { inquilino_tipo: 'Pessoa jurídica (empresa)' }), />CNPJ<[\s\S]*>Inscrição estadual</);
});

test('comprovante (arquivo) não entra na leitura do formulário: é gravado à parte', () => {
  const fd = new FormData();
  fd.set('valor', '1.000,00');
  const { dados, erros } = F.ler(F.APLICACAO.filter((c) => ['valor', 'comprovante'].includes(c.nome)), fd);
  assert.deepEqual(dados, { valor: 100000 });
  assert.deepEqual(erros, {});
  assert.match(F.camposHtml(F.APLICACAO.filter((c) => c.nome === 'comprovante'), { comprovante: 'comprovante-aplicacao.pdf' }), /type="file"[\s\S]*Já guardado: comprovante-aplicacao\.pdf/);
});
