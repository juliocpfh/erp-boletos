// Links fixos do site (#/tela?parametro=valor): o valor tem de passar por sanearParametros (calculos.js), senão o parâmetro é
// descartado em silêncio e a tela abre sem ele. Ex. (19/11/2026): os botões de Solicitações mandavam ?situacao=Aberta e a lista
// mostrava todas. Valores montados na hora (${...}) não dá para conferir aqui: confira na tela.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parametrosDescartados, sanearParametros } from '../docs/js/calculos.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'js');
const PULAR = /simulado-banco\.js$/;
function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivos(path.join(dir, e.name))
    : e.name.endsWith('.js') && !PULAR.test(e.name) ? [path.join(dir, e.name)] : []));
}

test('parâmetros fixos dos links passam por sanearParametros', () => {
  const ruins = [];
  for (const arq of arquivos(raiz)) {
    fs.readFileSync(arq, 'utf8').split('\n').forEach((linha, i) => {
      if (/^\s*(\/\/|\*|\/\*\*)/.test(linha)) return; // comentário (exemplos como ?ficha=ID)
      for (const m of linha.matchAll(/#\/[\w/-]*\?([^'"`\s<>]*)/g)) {
        for (const par of m[1].split('&')) {
          const [k, v] = par.split('=');
          if (!k || v === undefined || v.includes('$')) continue;
          if (sanearParametros({ [k]: decodeURIComponent(v) })[k] === undefined) ruins.push(`${path.relative(raiz, arq)}:${i + 1} ${k}=${v}`);
        }
      }
    });
  }
  assert.deepEqual(ruins, []);
});

// fios-011 / impressos-001 (mutirão 19/11): os modelos de contrato padrão têm código negativo (-1 residencial, -2 comercial);
// sem o sinal de menos no formato, ?modelo=-2 sumia e saía sempre o primeiro modelo (o residencial)
test('modelo de contrato padrão (código negativo) passa pelo endereço', () => {
  assert.equal(sanearParametros({ modelo: '-2' }).modelo, '-2');
  assert.equal(sanearParametros({ modelo: '7' }).modelo, '7');
  assert.equal(sanearParametros({ modelo: '-' }).modelo, undefined);
  assert.equal(sanearParametros({ modelo: '2-1' }).modelo, undefined);
});

test('links-pc-015: parâmetro fora do formato é apontado para o aviso da tela', () => {
  assert.deepEqual(parametrosDescartados({ comp: '2026-13', contrato: '7', mes: '2026-02', ano: '26' }), ['comp', 'ano']);
  assert.deepEqual(parametrosDescartados({ desconhecido: 'x<y' }), []);
});
