// Segurança no site (mutirão de 16/11): a ponte em outro computador só com https (com http a senha viajaria aberta).
// O resto (espera depois de senhas erradas, Sair limpando a senha da ponte e as testemunhas) foi conferido no navegador.
import assert from 'node:assert/strict';
import test from 'node:test';
import { enderecoDaPonteValido } from '../docs/js/banco.js';

test('endereço da ponte: http só para este computador; outro computador só com https', () => {
  for (const ok of ['', 'http://localhost:8765', 'http://127.0.0.1:8765/', 'http://[::1]:8765', 'https://banco.ankjck.com.br']) assert.equal(enderecoDaPonteValido(ok), true, ok);
  for (const ruim of ['http://192.168.0.5:8765', 'http://localhost.exemplo.org:8765', 'http://banco.ankjck.com.br']) assert.equal(enderecoDaPonteValido(ruim), false, ruim);
});
