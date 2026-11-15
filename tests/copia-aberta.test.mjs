// Cópia aberta dos arquivos (pedido do dono em 15/11): os anexos da nuvem, sem cifrar, em "Arquivos dos imoveis" na pasta do
// backup seguro. O site (docs/js/copia-aberta.js) e o atualizador do PC (atualizador-pc) seguem a mesma regra. Dados fictícios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as A from '../atualizador-pc/atualizador.mjs';
import * as CA from '../docs/js/copia-aberta.js';
import { PastaDisco } from './pasta-disco.mjs';

const pasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'copia-aberta-'));
const ler = (raiz, ...p) => fs.readFileSync(path.join(raiz, CA.PASTA_COPIA, ...p), 'utf8');
const existe = (raiz, ...p) => fs.existsSync(path.join(raiz, CA.PASTA_COPIA, ...p));

/** Nuvem falsa: arquivos { caminho: { texto, alterado } } com lista-tudo em partes de 2 e arquivos/<caminho>. */
function nuvemFalsa(arquivos) {
  const n = { arquivos, pedidos: [] };
  const lista = () => Object.entries(n.arquivos).map(([caminho, a]) => ({ caminho, tamanho: Buffer.byteLength(a.texto), alterado: a.alterado }));
  n.listar = async () => lista();
  n.ler = async (c) => { if (!n.arquivos[c]) throw new Error('não achei'); n.pedidos.push(c); return new Blob([n.arquivos[c].texto]); };
  n.buscar = async (url, op = {}) => {
    const u = new URL(url);
    if (op.headers?.['CF-Access-Client-Id'] !== 'id-teste') return new Response('<html>login</html>', { status: 302, headers: { 'content-type': 'text/html' } });
    if (u.pathname === '/api/lista-tudo/arquivos/') {
      const tudo = lista(); const de = Number(u.searchParams.get('cursor') || 0);
      return new Response(JSON.stringify({ arquivos: tudo.slice(de, de + 2), mais: de + 2 < tudo.length, cursor: String(de + 2) }), { headers: { 'content-type': 'application/json' } });
    }
    const c = u.pathname.replace('/api/arquivos/', '').split('/').map(decodeURIComponent).join('/');
    if (!n.arquivos[c]) return new Response('{}', { status: 404 });
    n.pedidos.push(c);
    return new Response(n.arquivos[c].texto);
  };
  return n;
}

test('site e atualizador do PC usam a mesma regra (nomes do Windows e o que baixar/apagar)', () => {
  for (const nome of ['Contrato: 2026?.pdf', 'Ap 101 ', 'nota.', 'CON', 'com1.txt', 'Maria Exemplo', '']) assert.equal(A.nomeWindows(nome), CA.nomeWindows(nome));
  assert.equal(CA.nomeWindows('Contrato: "assinado"?.pdf'), 'Contrato_ _assinado__.pdf');
  assert.equal(CA.nomeWindows('CON'), '_CON');
  const nuvem = [{ caminho: 'a/1.pdf', tamanho: 10, alterado: 'x' }, { caminho: 'a/2.pdf', tamanho: 5, alterado: 'y' }, { caminho: 'b/3.pdf', tamanho: 7 }];
  const anterior = { 'a/1.pdf': { tamanho: 10, alterado: 'x' }, 'a/2.pdf': { tamanho: 5, alterado: 'velho' }, 'c/sumiu.pdf': { tamanho: 1, alterado: '' } };
  const p = CA.planoCopia(nuvem, anterior);
  assert.deepEqual(p.baixar, ['a/2.pdf', 'b/3.pdf']); // mesmo tamanho mas trocado (data nova) baixa de novo
  assert.deepEqual(p.apagar, ['c/sumiu.pdf']);
  assert.deepEqual(A.planoCopia(nuvem, anterior), p);
});

test('site: baixa os arquivos abertos, só o que mudou, e tira o que saiu da nuvem (com a pasta vazia)', async () => {
  const raiz = pasta(); const dir = new PastaDisco(raiz);
  const n = nuvemFalsa({
    'Casa 1/Inquilinos/Maria Exemplo/Contrato assinado.pdf': { texto: 'contrato', alterado: '2026-11-01T10:00:00Z' },
    'Casa 1/Inquilinos/Maria Exemplo/Vistoria: entrada.pdf': { texto: 'vistoria', alterado: '2026-11-01T10:00:00Z' },
    'Casa 2/Inquilinos/Joao Exemplo/RG.jpg': { texto: 'rg', alterado: '2026-11-02T10:00:00Z' },
  });
  let r = await CA.atualizarCopia(dir, { listar: n.listar, ler: n.ler });
  assert.deepEqual(r, { baixados: 3, apagados: 0, falhas: 0, total: 3 });
  assert.equal(ler(raiz, 'Casa 1', 'Inquilinos', 'Maria Exemplo', 'Contrato assinado.pdf'), 'contrato');
  assert.equal(ler(raiz, 'Casa 1', 'Inquilinos', 'Maria Exemplo', 'Vistoria_ entrada.pdf'), 'vistoria');
  assert.equal((await CA.situacaoCopia(dir)).total, 3);

  // nada mudou: nada baixa
  n.pedidos.length = 0;
  r = await CA.atualizarCopia(dir, { listar: n.listar, ler: n.ler });
  assert.equal(r.baixados, 0); assert.deepEqual(n.pedidos, []);

  // termo assinado de novo (mesmo tamanho, data nova) e Joao saiu da nuvem
  n.arquivos['Casa 1/Inquilinos/Maria Exemplo/Contrato assinado.pdf'] = { texto: 'contratX', alterado: '2026-11-15T10:00:00Z' };
  delete n.arquivos['Casa 2/Inquilinos/Joao Exemplo/RG.jpg'];
  r = await CA.atualizarCopia(dir, { listar: n.listar, ler: n.ler });
  assert.deepEqual(r, { baixados: 1, apagados: 1, falhas: 0, total: 2 });
  assert.equal(ler(raiz, 'Casa 1', 'Inquilinos', 'Maria Exemplo', 'Contrato assinado.pdf'), 'contratX');
  assert.equal(existe(raiz, 'Casa 2'), false); // as pastas que ficaram vazias saem também
  assert.equal(existe(raiz, 'Casa 1', 'Inquilinos', 'Maria Exemplo'), true);
});

test('site: arquivo que falhou fica para a próxima (não entra no registro)', async () => {
  const raiz = pasta(); const dir = new PastaDisco(raiz);
  const n = nuvemFalsa({ 'Casa 1/a.pdf': { texto: 'a', alterado: '1' }, 'Casa 1/b.pdf': { texto: 'b', alterado: '1' } });
  const lerFalhando = async (c) => { if (c.endsWith('b.pdf')) throw new Error('caiu a internet'); return n.ler(c); };
  let r = await CA.atualizarCopia(dir, { listar: n.listar, ler: lerFalhando });
  assert.deepEqual(r, { baixados: 1, apagados: 0, falhas: 1, total: 1 });
  r = await CA.atualizarCopia(dir, { listar: n.listar, ler: n.ler });
  assert.deepEqual(r, { baixados: 1, apagados: 0, falhas: 0, total: 2 });
});

test('atualizador do PC: baixa com a chave de serviço, em partes, e o arquivo apagado à mão volta', async () => {
  const raiz = pasta();
  const cfg = { site: 'https://erp.exemplo.com.br', clientId: 'id-teste', clientSecret: 'segredo-teste', pasta: raiz };
  const n = nuvemFalsa({
    'Casa 1/Inquilinos/Maria Exemplo/Contrato assinado.pdf': { texto: 'contrato', alterado: '1' },
    'Casa 1/Inquilinos/Maria Exemplo/RG.jpg': { texto: 'rg', alterado: '1' },
    'Casa 1/IPTU/2026/guia.pdf': { texto: 'guia', alterado: '1' },
  });
  let r = await A.atualizarCopia(cfg, { buscar: n.buscar });
  assert.deepEqual(r, { baixados: 3, apagados: 0, falhas: 0, total: 3 });
  assert.equal(ler(raiz, 'Casa 1', 'IPTU', '2026', 'guia.pdf'), 'guia');
  const reg = JSON.parse(fs.readFileSync(path.join(raiz, A.ARQUIVO_COPIA), 'utf8'));
  assert.equal(reg.por, 'atualizador');

  fs.unlinkSync(path.join(raiz, CA.PASTA_COPIA, 'Casa 1', 'Inquilinos', 'Maria Exemplo', 'RG.jpg'));
  delete n.arquivos['Casa 1/IPTU/2026/guia.pdf'];
  n.pedidos.length = 0;
  r = await A.atualizarCopia(cfg, { buscar: n.buscar });
  assert.deepEqual(r, { baixados: 1, apagados: 1, falhas: 0, total: 2 });
  assert.deepEqual(n.pedidos, ['Casa 1/Inquilinos/Maria Exemplo/RG.jpg']);
  assert.equal(existe(raiz, 'Casa 1', 'IPTU'), false);

  // o site e o atualizador leem o mesmo registro
  assert.equal((await CA.situacaoCopia(new PastaDisco(raiz))).total, 2);
});

test('atualizador do PC: chave de serviço recusada avisa', async () => {
  const n = nuvemFalsa({});
  await assert.rejects(A.atualizarCopia({ site: 'https://x', clientId: 'errado', clientSecret: 's', pasta: pasta() }, { buscar: n.buscar }), /não aceitou a chave/);
});
