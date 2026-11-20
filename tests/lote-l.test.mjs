// Mutirão de 19/11, lote L (aparência e celular): com o usuário já dentro, as telas de antes do login (primeiro acesso,
// login, escolher a pasta…) não abrem pelo endereço e o "Criar e entrar" não cria outro administrador. Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bancoComUsuarios, carregarSite, elemento, entrarComo, ouvintes } from './tela-falsa.mjs';

const T = await carregarSite();
const { E, R } = T;

test('quem já está dentro não abre "Primeiro acesso" nem as outras telas de antes do login pelo endereço', async () => {
  bancoComUsuarios(R, E);
  entrarComo(E, 'operador');
  E.teste = true; // o Node não tem a pasta do navegador: sem isto, toda tela vira "navegador sem suporte"
  for (const rota of ['primeiroAcesso', 'login', 'pedirAcesso', 'inicio', 'semSuporte', 'arquivoSumiu', '_naoEncontrado', '_listaArquivos', 'toString', 'constructor']) {
    location.hash = `#/${rota}`;
    await T.mostrar();
    assert.match(T.app.innerHTML, /Página não encontrada/, rota);
  }
  location.hash = '#/';
});

test('com usuários cadastrados, o formulário do primeiro acesso não cria outro administrador', async () => {
  const d = bancoComUsuarios(R, E);
  entrarComo(E, 'operador');
  const antes = d.usuarios.length;
  await assert.rejects(T.criarBanco('Intruso', 'intruso', 'uma senha bem comprida 123'), /já tem usuários/);
  // pelo formulário (o ouvinte de submit de app.js): o erro aparece e ninguém é criado
  const botao = elemento('button');
  const form = elemento('form', { dataset: { form: 'primeiroAcesso' }, querySelector: () => botao,
    campos: [['nome', 'Intruso'], ['login', 'intruso'], ['senha', 'uma senha bem comprida 123'], ['senha2', 'uma senha bem comprida 123']] });
  await ouvintes.submit[0]({ target: { closest: () => form }, preventDefault() {} });
  assert.equal(E.d.usuarios.length, antes);
  assert.ok(!E.d.usuarios.some((u) => u.login === 'intruso'));
});
