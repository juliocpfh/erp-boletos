// Segurança no site (mutirão de 16/11): a ponte em outro computador só com https (com http a senha viajaria aberta).
// O resto (espera depois de senhas erradas, Sair limpando a senha da ponte e as testemunhas) foi conferido no navegador.
import assert from 'node:assert/strict';
import test from 'node:test';
import { enderecoDaPonteValido } from '../docs/js/banco.js';
import * as CF from '../docs/js/cofrinho.js';

test('endereço da ponte: http só para este computador; outro computador só com https', () => {
  for (const ok of ['', 'http://localhost:8765', 'http://127.0.0.1:8765/', 'http://[::1]:8765', 'https://banco.ankjck.com.br']) assert.equal(enderecoDaPonteValido(ok), true, ok);
  for (const ruim of ['http://192.168.0.5:8765', 'http://localhost.exemplo.org:8765', 'http://banco.ankjck.com.br']) assert.equal(enderecoDaPonteValido(ruim), false, ruim);
});

test('cópia cifrada: a chave guardada no aparelho durante o login lembrado não sai em bytes', async () => {
  const guardado = new Map();
  const cru = { ler: async (k) => guardado.get(k), gravar: async (k, v) => { guardado.set(k, v); }, apagar: async (k) => { guardado.delete(k); } };
  const c = new CF.Cofrinho(cru);
  await c.entrar('dono', 'senha do dono 2026', Date.now() + 60000, 1000);
  const s = guardado.get('chave-sessao');
  assert.equal(s.chave.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', s.chave));
  // a mesma chave: o que foi cifrado com a da memória abre com a guardada
  assert.deepEqual(await CF.decifrar(s.chave, await CF.cifrar(c.chave, { a: 1 })), { a: 1 });
});
