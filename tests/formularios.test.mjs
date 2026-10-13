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
