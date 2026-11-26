// Mutirão 3000, 2ª rodada, frente dados, parte 2: anexos e backups (itens 22, 24, 28, 29 e 50 da lista dados.md). Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as A from '../atualizador-pc/atualizador.mjs';
import * as CA from '../docs/js/copia-aberta.js';
import { PastaDisco } from './pasta-disco.mjs';
import * as B from '../docs/js/backup-seguro.js';
import { DatabaseSync } from 'node:sqlite';
import { CofreDO } from '../nuvem/cofre.mjs';
import * as W from '../nuvem/worker.mjs';
import { caminhoNaLixeira } from '../nuvem/lixeira.mjs';
import { r2Falso } from './r2-falso.mjs';

function sqlFalso() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    exec(q, ...p) {
      if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; }
      const l = db.prepare(q).all(...p).map((x) => ({ ...x }));
      return { toArray: () => l };
    },
  };
}
const tx = (sql) => (fn) => { sql.db.exec('BEGIN'); try { const r = fn(); sql.db.exec('COMMIT'); return r; } catch (e) { sql.db.exec('ROLLBACK'); throw e; } };
const DONO = 'dono@exemplo.com.br';

test('item 50: a nuvem de teste guarda os anexos em disco (continuam lá depois de fechar e abrir)', async () => {
  const { r2EmDisco } = await import('../nuvem/r2-disco.mjs');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-disco-'));
  const a = r2EmDisco(pasta);
  const gravado = await a.put('arquivos/Imovel 1/contrato.pdf', 'contrato', { customMetadata: { por: DONO } });
  await a.put('arquivos/Imovel 1/apagar.pdf', 'x');
  await a.delete('arquivos/Imovel 1/apagar.pdf');
  const b = r2EmDisco(pasta); // "reiniciou"
  assert.equal(await (await b.get('arquivos/Imovel 1/contrato.pdf')).text(), 'contrato');
  assert.equal((await b.head('arquivos/Imovel 1/contrato.pdf')).etag, gravado.etag);
  assert.equal(await b.get('arquivos/Imovel 1/apagar.pdf'), null);
  assert.deepEqual((await b.list({ prefix: 'arquivos/' })).objects.map((o) => o.key), ['arquivos/Imovel 1/contrato.pdf']);
  const novo = await b.put('arquivos/Imovel 1/outro.pdf', 'y');
  assert.notEqual(novo.etag, gravado.etag, 'etiqueta nova não repete a de antes');
});

test('item 24 e lixeira: arquivo gravado por cima deixa a versão de antes na lixeira; o prazo da lixeira é a regra do administrador', async () => {
  const sql = sqlFalso(); const r2 = r2Falso();
  const dobj = new CofreDO({ storage: { sql, transactionSync: tx(sql) } }, { DADOS: r2 });
  dobj.cofre.importar({ formato: 'imoveis-v1', usuarios: [{ id: 1, login: DONO, papel: 'admin', ativo: true }], historico: [],
    config_regras: [{ id: 1, chave: 'dias_lixeira_anexos', valor: 10 }] }, DONO);
  const COFRE = { idFromName: (x) => x, get: () => ({ fetch: (req) => dobj.fetch(req) }) };
  const env = { MODO_TESTE: '1', EMAIL_TESTE: DONO, ORIGEM: 'http://localhost', DADOS: r2, COFRE };
  W.esquecerPapeis();
  const pedir = (metodo, rota, corpo, cab = {}) => W.atender(new Request(`http://localhost/api/${rota}`, { method: metodo, body: corpo, headers: { 'X-Sistema': 'imoveis', ...cab } }), env);
  const caminho = 'arquivos/Imovel 1/Inquilinos/Ana/contrato.pdf';
  assert.equal((await pedir('PUT', 'arquivos/Imovel%201/Inquilinos/Ana/contrato.pdf', 'versao assinada')).status, 200);
  assert.ok(![...r2.m.keys()].some((k) => k.startsWith('lixeira/')), 'arquivo novo: nada na lixeira');
  // "substituir pelos de uma pasta" grava por cima: a versão da nuvem vai para a lixeira
  assert.equal((await pedir('PUT', 'arquivos/Imovel%201/Inquilinos/Ana/contrato.pdf', 'versao velha da pasta')).status, 200);
  const naLixeira = caminhoNaLixeira(caminho, new Date());
  assert.equal(await (await r2.get(naLixeira)).text(), 'versao assinada');
  assert.equal(await (await r2.get(caminho)).text(), 'versao velha da pasta');
  // outra troca no mesmo dia: na lixeira fica a 1ª versão do dia
  await pedir('PUT', 'arquivos/Imovel%201/Inquilinos/Ana/contrato.pdf', 'terceira');
  assert.equal(await (await r2.get(naLixeira)).text(), 'versao assinada');
  // a regra do administrador (10 dias) vale na faxina diária: com 11 dias, sai
  assert.equal(dobj.cofre.regraNumero('dias_lixeira_anexos'), 10);
  await dobj.manutencao(new Date(Date.now() + 9 * 86400000), 'faxina');
  assert.ok(r2.m.has(naLixeira));
  await dobj.manutencao(new Date(Date.now() + 11 * 86400000), 'faxina');
  assert.ok(!r2.m.has(naLixeira));
});

test('item 29: backup seguro guarda a 1ª cópia de cada hora (a das 14h fica com os dados de antes do erro das 15h) e apaga as velhas', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'horas-'));
  const dir = new PastaDisco(raiz);
  const chave = await B.criarChave('senha-forte-1');
  const as = (h, m) => new Date(2026, 10, 17, h, m);
  await B.espelhar(dir, chave, { revisao: 1 }, { agora: as(14, 5) });
  await B.espelhar(dir, chave, { revisao: 2 }, { agora: as(14, 40) }); // mesma hora: a das 14h não muda
  await B.espelhar(dir, chave, { revisao: 3 }, { agora: as(15, 2) }); // o erro
  const horas = fs.readdirSync(path.join(raiz, B.PASTA_HORAS)).sort();
  assert.deepEqual(horas, ['imoveis-dados-2026-11-17-14h.bkp', 'imoveis-dados-2026-11-17-15h.bkp']);
  const das14 = fs.readFileSync(path.join(raiz, B.PASTA_HORAS, horas[0]));
  assert.notDeepEqual(das14, fs.readFileSync(path.join(raiz, B.PASTA_HORAS, horas[1])));
  // 3 dias depois, com o prazo de 2 dias: as de 17/11 saem
  await B.espelhar(dir, chave, { revisao: 4 }, { agora: new Date(2026, 10, 20, 9, 0), diasHoras: 2 });
  assert.deepEqual(fs.readdirSync(path.join(raiz, B.PASTA_HORAS)), ['imoveis-dados-2026-11-20-09h.bkp']);
  assert.deepEqual(B.horasParaApagar(['imoveis-dados-2026-11-17-14h.bkp', 'imoveis-dados-2026-11-19-08h.bkp', 'outro.bkp'], 2, new Date(2026, 10, 20, 9)), ['imoveis-dados-2026-11-17-14h.bkp']);
});

test('item 28: o que sai da nuvem vai para "Apagados na nuvem/<dia>" na cópia aberta (site e PC) e sai depois do prazo', async () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'apagados-'));
  const dir = new PastaDisco(raiz);
  const arquivos = { 'Casa 1/Inquilinos/Ana/contrato.pdf': 'contrato', 'Casa 1/Inquilinos/Ana/rg.jpg': 'rg' };
  const listar = async () => Object.entries(arquivos).map(([caminho, t]) => ({ caminho, tamanho: t.length, alterado: '1' }));
  const ler = async (c) => new Blob([arquivos[c]]);
  const agora = new Date('2026-11-17T12:00:00-03:00');
  await CA.atualizarCopia(dir, { listar, ler, agora });
  // a nuvem respondeu uma lista vazia (ou o contrato foi apagado por engano): nada some do PC de vez
  delete arquivos['Casa 1/Inquilinos/Ana/contrato.pdf'];
  delete arquivos['Casa 1/Inquilinos/Ana/rg.jpg'];
  const r = await CA.atualizarCopia(dir, { listar, ler, agora, diasApagados: 10 });
  assert.equal(r.apagados, 2);
  assert.equal(fs.existsSync(path.join(raiz, CA.PASTA_COPIA, 'Casa 1')), false);
  assert.equal(fs.readFileSync(path.join(raiz, CA.PASTA_APAGADOS, '2026-11-17', 'Casa 1', 'Inquilinos', 'Ana', 'contrato.pdf'), 'utf8'), 'contrato');
  assert.equal(JSON.parse(fs.readFileSync(path.join(raiz, CA.ARQUIVO_COPIA), 'utf8')).dias_apagados, 10, 'o prazo fica no registro para o PC');
  // 11 dias depois: passou do prazo de 10 dias e sai
  fs.mkdirSync(path.join(raiz, CA.PASTA_APAGADOS, '2026-11-01'));
  await CA.atualizarCopia(dir, { listar, ler, agora: new Date('2026-11-28T12:00:00-03:00'), diasApagados: 10 });
  assert.deepEqual(fs.readdirSync(path.join(raiz, CA.PASTA_APAGADOS)), []);
  // site e PC: mesma conta do prazo
  assert.deepEqual(CA.diasVencidos(['2026-11-06', '2026-11-07', 'outra'], 10, agora), ['2026-11-06']);
  assert.deepEqual(A.diasVencidos(['2026-11-06', '2026-11-07', 'outra'], 10, agora), ['2026-11-06']);

  // atualizador do PC: o mesmo, com o prazo lido do registro que o site gravou
  const raiz2 = fs.mkdtempSync(path.join(os.tmpdir(), 'apagados-pc-'));
  fs.mkdirSync(path.join(raiz2, CA.PASTA_COPIA, 'Casa 2'), { recursive: true });
  fs.writeFileSync(path.join(raiz2, CA.PASTA_COPIA, 'Casa 2', 'guia.pdf'), 'guia');
  fs.writeFileSync(path.join(raiz2, CA.ARQUIVO_COPIA), JSON.stringify({ dias_apagados: 5, arquivos: { 'Casa 2/guia.pdf': { tamanho: 4, alterado: '1' } } }));
  const buscar = async (url) => {
    if (new URL(url).pathname === '/api/aparelho/lista-tudo/arquivos/') return new Response(JSON.stringify({ arquivos: [], mais: false }), { headers: { 'content-type': 'application/json' } });
    return new Response('{}', { status: 404 });
  };
  const cfg = { site: 'https://erp.exemplo.com.br', cracha: 'ap1_cracha-de-teste', pasta: raiz2 };
  const r2 = await A.atualizarCopia(cfg, { buscar });
  assert.equal(r2.apagados, 1);
  assert.equal(fs.readFileSync(path.join(raiz2, A.PASTA_APAGADOS, A.diaDeHoje(), 'Casa 2', 'guia.pdf'), 'utf8'), 'guia');
  assert.equal(JSON.parse(fs.readFileSync(path.join(raiz2, A.ARQUIVO_COPIA), 'utf8')).dias_apagados, 5);
});

test('item 22: anexo sem internet que subiu com outro nome: só o lançamento deste aparelho, naquela pasta, passa a apontar para ele', () => {
  const d = R.bancoVazio();
  const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto 1' }, 'ana');
  const c1 = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ana', data_entrada: '2026-01-01' }, 'ana');
  const c2 = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Bia', data_entrada: '2026-01-01' }, 'ana');
  const meu = R.inserir(d, 'depositos_garantia', { contrato_id: c1.id, qual: 'caucao', valor: 100000, data: '2026-01-05', comprovante: 'comprovante.pdf' }, 'ana');
  const doOutro = R.inserir(d, 'depositos_garantia', { contrato_id: c1.id, qual: 'caucao', valor: 50000, data: '2026-01-06', comprovante: 'comprovante.pdf' }, 'socia');
  const outraPasta = R.inserir(d, 'depositos_garantia', { contrato_id: c2.id, qual: 'caucao', valor: 70000, data: '2026-01-05', comprovante: 'comprovante.pdf' }, 'ana');
  const deste = (t, id) => !(t === 'depositos_garantia' && id === doOutro.id);
  const n = R.renomearArquivoNoBanco(d, 'contrato', c1.id, 'comprovante.pdf', 'comprovante (deste aparelho).pdf', 'ana', deste);
  assert.equal(n, 1);
  assert.equal(R.buscar(d, 'depositos_garantia', meu.id).comprovante, 'comprovante (deste aparelho).pdf');
  assert.equal(R.buscar(d, 'depositos_garantia', doOutro.id).comprovante, 'comprovante.pdf', 'o do outro aparelho fica com o arquivo dele');
  assert.equal(R.buscar(d, 'depositos_garantia', outraPasta.id).comprovante, 'comprovante.pdf', 'mesmo nome em outra pasta é outro arquivo');
  assert.match(d.historico.at(-1).descricao, /Arquivo guardado como "comprovante \(deste aparelho\)\.pdf"/);
  // fotos da vistoria (objeto) também
  const v = R.inserir(d, 'vistorias', { contrato_id: c1.id, tipo: 'Entrada', data: '2026-01-02', fotos: { sala: 'sala.jpg', cozinha: 'coz.jpg' } }, 'ana');
  assert.equal(R.renomearArquivoNoBanco(d, 'contrato', c1.id, 'sala.jpg', 'sala (deste aparelho).jpg', 'ana'), 1);
  assert.deepEqual(R.buscar(d, 'vistorias', v.id).fotos, { sala: 'sala (deste aparelho).jpg', cozinha: 'coz.jpg' });
});
