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
  await assert.rejects(B.criarChave('onze-letras'), /12 caracteres/);
  assert.throws(() => B.cabecalhoDe(new TextEncoder().encode('qualquer coisa\n{}\n')), /não é um backup/);
});

/** Troca o cabeçalho do arquivo (a parte legível) e devolve o arquivo mexido. */
function comCabecalho(arquivo, mexer) {
  const { cabecalho, inicio } = B.cabecalhoDe(arquivo);
  const novo = new TextEncoder().encode(`IMOVEIS-BACKUP-SEGURO-1\n${JSON.stringify(mexer(cabecalho))}\n`);
  const saida = new Uint8Array(novo.length + arquivo.length - inicio);
  saida.set(novo, 0);
  saida.set(arquivo.subarray(inicio), novo.length);
  return saida;
}

test('backup seguro: cabeçalho adulterado não abre (nem com a senha certa) e iterações fora da faixa são recusadas', async () => {
  const chave = await B.criarChave('senha-forte-1');
  const arquivo = await B.cifrar(chave, new TextEncoder().encode('{"a":1}'), { tipo: 'diario', revisao: 10 });
  assert.equal(B.cabecalhoDe(arquivo).cabecalho.protegido, 1);
  assert.equal((await B.decifrar(arquivo, 'senha-forte-1')).info.revisao, 10);
  // mexer na revisão, na data ou tirar a marca "protegido": o conteúdo deixa de conferir
  await assert.rejects(B.decifrar(comCabecalho(arquivo, (c) => ({ ...c, revisao: 99 })), 'senha-forte-1'), /danificado/);
  await assert.rejects(B.decifrar(comCabecalho(arquivo, (c) => ({ ...c, criado_em: '2030-01-01T00:00:00.000Z' })), 'senha-forte-1'), /danificado/);
  await assert.rejects(B.decifrar(comCabecalho(arquivo, ({ protegido, ...c }) => c), 'senha-forte-1'), /danificado/);
  // número de iterações absurdo (travaria o navegador) ou pequeno demais: recusado antes de derivar a chave
  await assert.rejects(B.decifrar(comCabecalho(arquivo, (c) => ({ ...c, chave: { ...c.chave, iteracoes: 2000000000 } })), 'senha-forte-1'), /danificado/);
  await assert.rejects(B.decifrar(comCabecalho(arquivo, (c) => ({ ...c, chave: { ...c.chave, iteracoes: 1 } })), 'senha-forte-1'), /danificado/);
  await assert.rejects(B.decifrar(comCabecalho(arquivo, (c) => ({ ...c, chave: { ...c.chave, iteracoes: 'x' } })), 'senha-forte-1'), /danificado/);
  assert.equal(await B.conferirSenha({ ...chave, iteracoes: 5000000000 }, 'senha-forte-1'), false);
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
