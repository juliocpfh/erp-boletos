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

test('fiadores no cadastro do contrato: os já cadastrados vêm com "Excluir" e sobra um bloco em branco', () => {
  const nomes = (lista) => lista.filter((c) => c.nome && c.nome.endsWith('_nome')).map((c) => c.nome);
  assert.deepEqual(nomes(F.fiadoresNoCadastro([])), ['fiador1_nome', 'fiador2_nome']);
  const dois = F.fiadoresNoCadastro([{ nome: 'A' }, { nome: 'B' }]);
  assert.deepEqual(nomes(dois), ['fiador1_nome', 'fiador2_nome', 'fiador3_nome']);
  assert.deepEqual(dois.filter((c) => c.nome && c.nome.endsWith('_excluir')).map((c) => c.nome), ['fiador1_excluir', 'fiador2_excluir']);
});

test('comprovante (arquivo) não entra na leitura do formulário: é gravado à parte', () => {
  const fd = new FormData();
  fd.set('valor', '1.000,00');
  const { dados, erros } = F.ler(F.APLICACAO.filter((c) => ['valor', 'comprovante'].includes(c.nome)), fd);
  assert.deepEqual(dados, { valor: 100000 });
  assert.deepEqual(erros, {});
  assert.match(F.camposHtml(F.APLICACAO.filter((c) => c.nome === 'comprovante'), { comprovante: 'comprovante-aplicacao.pdf' }), /type="file"[\s\S]*Já guardado: comprovante-aplicacao\.pdf/);
});
