// Datas de Brasília (não de Londres) e prazo dado fora do expediente (decisão do dono de 24/11/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as B from '../docs/js/brasilia.js';
import * as C from '../docs/js/calculos.js';
import * as CR from '../docs/js/config-regras.js';

const as = (texto) => new Date(texto); // hora de Brasília escrita com -03:00

test('data de um fato: a de Brasília, também depois das 21h', () => {
  assert.equal(B.dataDeBrasilia(as('2026-11-24T21:47:00-03:00')), '2026-11-24'); // toISOString daria 25/11
  assert.equal(B.dataDeBrasilia('2026-11-25T00:47:00.000Z'), '2026-11-24');
  assert.equal(B.dataDeBrasilia('2026-11-24'), '2026-11-24');
  assert.equal(B.dataDeBrasilia(''), '');
  assert.equal(B.dataDeBrasilia('lixo'), '');
  assert.equal(C.dataBrDe('2026-11-25T00:47:00.000Z'), '24/11/2026');
});

test('link de 7 dias: às 10h vale até 01/12; às 21h45 (depois das 18h) até 02/12', () => {
  assert.equal(B.ultimoDiaDoPrazo(7, as('2026-11-24T10:00:00-03:00'), 18), '2026-12-01');
  assert.equal(B.ultimoDiaDoPrazo(7, as('2026-11-24T21:45:00-03:00'), 18), '2026-12-02');
  assert.equal(B.ultimoDiaDoPrazo(7, as('2026-11-24T17:59:00-03:00'), 18), '2026-12-01');
  assert.equal(B.ultimoDiaDoPrazo(7, as('2026-11-24T18:00:00-03:00'), 18), '2026-12-02');
  assert.equal(B.ultimoDiaDoPrazo(7, as('2026-11-24T23:30:00-03:00'), 24), '2026-12-01', '24 = o dia inteiro conta');
  assert.equal(B.ultimoDiaDoPrazo(7, as('2026-11-24T21:45:00-03:00'), 'lixo'), '2026-12-02', 'valor estranho volta a 18h');
  // a validade vale o último dia inteiro e mostra a mesma data em todo lugar
  const v = B.validadeDoLink(7, as('2026-11-24T21:45:00-03:00'), 18);
  assert.equal(v, '2026-12-03T02:59:59.999Z');
  assert.equal(C.dataBrDe(v), '02/12/2026');
  assert.equal(C.dataBrDe(B.validadeDoLink(7, as('2026-11-24T10:00:00-03:00'), 18)), '01/12/2026');
});

test('links já criados: a data mostrada é a do fim real, em Brasília', () => {
  // criado às 21h45 de 24/11 pela conta antiga (agora + 7 dias): acaba às 21h45 de 01/12, não 02/12
  const antigo = new Date(as('2026-11-24T21:45:00-03:00').getTime() + 7 * 86400000).toISOString();
  assert.equal(C.dataBrDe(antigo), '01/12/2026');
});

test('regra do fim do expediente: padrão 18h, com explicação, consequência e lei', () => {
  const def = CR.DEFINICOES_REGRAS.find((x) => x.chave === 'fim_expediente_hora');
  assert.ok(def && def.padrao === 18 && def.explica && def.consequencia && def.lei);
  assert.equal(C.fimDoExpediente(), 18);
});

test('nenhuma data de instante sai de toISOString().slice(0, 10) nas telas e na nuvem', () => {
  const arquivos = [];
  const andar = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) andar(p); else if (/\.(m?js)$/.test(n)) arquivos.push(p); } };
  andar('docs/js'); andar('nuvem');
  const ruins = [];
  for (const p of arquivos) {
    if (/simulado-banco|brasilia\.js/.test(p)) continue;
    readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
      if (/new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)|(_em|\.em)\)?\.slice\(0, ?10\)/.test(l)) ruins.push(`${p}:${i + 1}`);
    });
  }
  assert.deepEqual(ruins, []);
});
