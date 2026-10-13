import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DESTINO, hashDasFontes } from '../tools/fontes-offline.mjs';

test('versão sem internet (arquivo único) está atualizada com o código', () => {
  const html = fs.readFileSync(DESTINO, 'utf8');
  const gravado = /<meta name="fontes" content="([0-9a-f]+)">/.exec(html)?.[1];
  assert.equal(gravado, hashDasFontes(), 'O código mudou: rode "node tools/gerar-offline.mjs" e envie o arquivo gerado.');
});
