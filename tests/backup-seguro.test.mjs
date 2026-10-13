import assert from 'node:assert/strict';
import test from 'node:test';
import * as B from '../docs/js/backup-seguro.js';

test('backup seguro: cifra sem senha, abre só com a senha', async () => {
  const chave = await B.criarChave('senha-forte-1');
  const original = new TextEncoder().encode(JSON.stringify({ imoveis: [{ nome: 'Casa 3' }] }));
  const arquivo = await B.cifrar(chave, original, { tipo: 'diario' });
  assert.equal(new TextDecoder().decode(arquivo).includes('Casa 3'), false, 'o conteúdo não fica legível no arquivo');
  assert.equal(B.cabecalhoDe(arquivo).cabecalho.tipo, 'diario');
  const { info, dados } = await B.decifrar(arquivo, 'senha-forte-1');
  assert.equal(info.tipo, 'diario');
  assert.deepEqual(dados, original);
  await assert.rejects(B.decifrar(arquivo, 'outra-senha'), /incorreta/);
  assert.equal(await B.conferirSenha(chave, 'senha-forte-1'), true);
  assert.equal(await B.conferirSenha(chave, 'errada'), false);
  await assert.rejects(B.criarChave('curta'), /8 caracteres/);
  assert.throws(() => B.cabecalhoDe(new TextEncoder().encode('qualquer coisa\n{}\n')), /não é um backup/);
});

test('backup seguro: quais cópias guardar e quando fazer o completo', () => {
  const dias = Array.from({ length: 70 }, (_, i) => `imoveis-dados-2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}.bkp`);
  assert.equal(B.diariosParaApagar(dias).length, 10);
  assert.equal(B.diariosParaApagar(dias)[0], dias[0]);
  // 30 completos semanais (~7 meses): ficam os 8 últimos + o último de cada mês anterior
  const semanais = Array.from({ length: 30 }, (_, i) => `completo-${new Date(Date.UTC(2026, 0, 3 + 7 * i)).toISOString().slice(0, 10)}.bkp`);
  const apagar = new Set(B.semanaisParaApagar(semanais));
  const ficam = semanais.filter((n) => !apagar.has(n));
  assert.ok(ficam.includes(semanais.at(-1)));
  assert.ok(ficam.length >= 8 && ficam.length < 16);
  assert.ok(ficam.includes('completo-2026-01-31.bkp'), 'o último de janeiro fica');
  assert.ok(apagar.has('completo-2026-01-03.bkp'));
  assert.equal(B.precisaCompleto([], '2026-10-13'), true);
  assert.equal(B.precisaCompleto(['completo-2026-10-10.bkp'], '2026-10-13'), false);
  assert.equal(B.precisaCompleto(['completo-2026-10-06.bkp'], '2026-10-13'), true);
});
