// Anexos na nuvem (docs/js/pasta-nuvem.js): as mesmas funções da pasta do computador (armazenamento.js) rodando sobre a
// pasta virtual, que fala com o Worker de verdade (nuvem/worker.mjs) e um R2 de mentira. Com e sem internet. Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as S from '../docs/js/armazenamento.js';
import { AnexosNuvem } from '../docs/js/pasta-nuvem.js';
import { atender } from '../nuvem/worker.mjs';
import { r2Falso } from './r2-falso.mjs';

const BASE = 'http://localhost:8787/api/';
function montar() {
  const R2 = r2Falso();
  const env = { MODO_TESTE: '1', ORIGEM: 'http://localhost:8787', DADOS: R2 };
  const estado = { internet: true };
  const buscar = async (url, op = {}) => {
    if (!estado.internet) throw new TypeError('Failed to fetch');
    return atender(new Request(url, { ...op, headers: { Origin: 'http://localhost:8787', ...op.headers } }), env);
  };
  const guardado = new Map();
  const guardar = { ler: async (k) => guardado.get(k), gravar: async (k, v) => { guardado.set(k, v); }, apagar: async (k) => { guardado.delete(k); } };
  const cliente = new AnexosNuvem({ base: BASE, buscar, guardar });
  return { R2, estado, cliente, raiz: cliente.raiz(), guardado };
}
const arquivo = (nome, texto) => new File([texto], nome);
const chaves = (R2, prefixo = '') => [...R2.m.keys()].filter((k) => k.startsWith(prefixo)).sort();

test('anexar, listar, abrir e apagar pelas funções de sempre (armazenamento.js)', async () => {
  const { R2, raiz } = montar();
  const arquivos = await raiz.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true });
  const dir = await S.subpasta(arquivos, ['Apto 604', 'Inquilinos', 'Maria Exemplo']);
  assert.equal(await S.salvarArquivo(dir, arquivo('contrato.pdf', '%PDF-1')), 'contrato.pdf');
  assert.equal(await S.salvarArquivo(dir, arquivo('contrato.pdf', '%PDF-2')), 'contrato (2).pdf', 'nome repetido ganha número, como na pasta');
  assert.deepEqual(chaves(R2), ['arquivos/Apto 604/Inquilinos/Maria Exemplo/contrato (2).pdf', 'arquivos/Apto 604/Inquilinos/Maria Exemplo/contrato.pdf']);
  assert.deepEqual((await S.listar(dir)).map((a) => [a.nome, a.tamanho]), [['contrato (2).pdf', 6], ['contrato.pdf', 6]]);
  assert.equal(await (await S.abrirArquivo(dir, 'contrato.pdf')).text(), '%PDF-1');
  assert.deepEqual(await S.subpastas(await S.subpasta(arquivos, ['Apto 604'])), ['Inquilinos']);
  await assert.rejects(S.salvarArquivo(dir, arquivo('pagina.html', '<script>')), /não pode ser anexado/);
  await dir.removeEntry('contrato (2).pdf');
  assert.deepEqual((await S.listar(dir)).map((a) => a.nome), ['contrato.pdf']);
  await assert.rejects(dir.getFileHandle('nao-existe.pdf'), { name: 'NotFoundError' });
  await assert.rejects(arquivos.getDirectoryHandle('Nao existe'), { name: 'NotFoundError' });
});

test('renomear, mover e juntar pastas (inquilino que sai, muda de imóvel, troca de titular)', async () => {
  const { R2, raiz } = montar();
  const arquivos = await raiz.getDirectoryHandle('arquivos', { create: true });
  const inq = await S.subpasta(arquivos, ['Apto 604', 'Inquilinos']);
  await S.salvarArquivo(await S.subpasta(inq, ['Maria']), arquivo('a.pdf', 'A'));
  await S.salvarArquivo(await S.subpasta(inq, ['Maria', 'Assinados']), arquivo('b.pdf', 'B'));
  await S.renomearPasta(inq, 'Maria', 'Maria (saiu 10-2026)');
  assert.deepEqual(chaves(R2), ['arquivos/Apto 604/Inquilinos/Maria (saiu 10-2026)/Assinados/b.pdf', 'arquivos/Apto 604/Inquilinos/Maria (saiu 10-2026)/a.pdf']);
  const outro = await S.subpasta(arquivos, ['Sala 2', 'Inquilinos']);
  await S.moverPasta(inq, 'Maria (saiu 10-2026)', outro, 'Maria');
  assert.deepEqual(chaves(R2), ['arquivos/Sala 2/Inquilinos/Maria/Assinados/b.pdf', 'arquivos/Sala 2/Inquilinos/Maria/a.pdf']);
  // juntar: o arquivo igual some da origem; o de mesmo nome e conteúdo diferente fica onde estava
  await S.salvarArquivo(await S.subpasta(outro, ['Ana']), arquivo('a.pdf', 'A'));
  await S.salvarArquivo(await S.subpasta(outro, ['Ana']), arquivo('c.pdf', 'C'));
  await S.salvarArquivo(await S.subpasta(outro, ['Ana', 'Assinados']), arquivo('b.pdf', 'X'));
  const sobrou = await S.juntarPasta(outro, 'Ana', outro, 'Maria');
  assert.equal(sobrou, 1);
  assert.deepEqual(chaves(R2, 'arquivos/Sala 2/Inquilinos/Maria/'), ['arquivos/Sala 2/Inquilinos/Maria/Assinados/b.pdf', 'arquivos/Sala 2/Inquilinos/Maria/a.pdf', 'arquivos/Sala 2/Inquilinos/Maria/c.pdf']);
  assert.deepEqual(chaves(R2, 'arquivos/Sala 2/Inquilinos/Ana/'), ['arquivos/Sala 2/Inquilinos/Ana/Assinados/b.pdf'], 'o diferente ficou');
  // nunca para dentro dela mesma
  await S.moverPasta(arquivos, 'Sala 2', await S.subpasta(arquivos, ['Sala 2', 'Inquilinos']), 'X');
  assert.ok(chaves(R2).every((k) => !k.includes('/X/')));
  // pasta vazia apagada; com arquivo, não
  await S.subpasta(arquivos, ['Vazia', 'Sub']);
  assert.equal(await S.apagarPastaVazia(arquivos, 'Vazia'), true);
  assert.equal(await S.apagarPastaVazia(arquivos, 'Sala 2'), false);
  await arquivos.removeEntry('Sala 2', { recursive: true });
  assert.deepEqual(chaves(R2, 'arquivos/Sala 2/'), []);
});

test('sem internet: anexo novo fica no aparelho, aparece na lista, abre, e sobe quando a internet volta', async () => {
  const { R2, estado, cliente, raiz, guardado } = montar();
  const arquivos = await raiz.getDirectoryHandle('arquivos', { create: true });
  const dir = await S.subpasta(arquivos, ['Apto 604', 'Comprovantes']);
  await S.salvarArquivo(dir, arquivo('ja-estava.pdf', 'ok'));
  estado.internet = false;
  assert.equal(await S.salvarArquivo(dir, arquivo('pix.jpg', 'FOTO')), 'pix.jpg');
  assert.deepEqual((await S.listar(dir)).map((a) => a.nome).sort(), ['ja-estava.pdf', 'pix.jpg'], 'lista mostra o da fila junto com a última lista vista');
  assert.equal(await (await S.abrirArquivo(dir, 'pix.jpg')).text(), 'FOTO');
  await assert.rejects(S.abrirArquivo(dir, 'ja-estava.pdf'), /Sem internet/);
  await assert.rejects(dir.removeEntry('ja-estava.pdf'), /Sem internet/);
  assert.equal(await cliente.pendentes(), 1);
  assert.ok(!R2.m.has('arquivos/Apto 604/Comprovantes/pix.jpg'));
  // recarregou a página: a fila continua (fica no aparelho)
  const outro = new AnexosNuvem({ base: BASE, buscar: cliente.buscar, guardar: cliente.guardar });
  assert.equal(await outro.pendentes(), 1);
  estado.internet = true;
  await outro.enviarFila();
  assert.equal(await outro.pendentes(), 0);
  assert.equal(await R2.m.get('arquivos/Apto 604/Comprovantes/pix.jpg') && (await (await R2.get('arquivos/Apto 604/Comprovantes/pix.jpg')).text()), 'FOTO');
  assert.ok(![...guardado.keys()].some((k) => k.startsWith('anexo:')), 'o arquivo guardado no aparelho é apagado depois de subir');
});

test('mesmo nome enviado por outro aparelho enquanto este estava sem internet: nada é sobrescrito, sobe com outro nome e avisa', async () => {
  const { R2, estado, cliente, raiz } = montar();
  const dir = await S.subpasta(await raiz.getDirectoryHandle('arquivos', { create: true }), ['Apto 604']);
  estado.internet = false;
  await S.salvarArquivo(dir, arquivo('recibo.pdf', 'DESTE'));
  await R2.put('arquivos/Apto 604/recibo.pdf', 'DO OUTRO');
  estado.internet = true;
  await cliente.enviarFila();
  assert.equal(await (await R2.get('arquivos/Apto 604/recibo.pdf')).text(), 'DO OUTRO');
  assert.equal(await (await R2.get('arquivos/Apto 604/recibo (deste aparelho).pdf')).text(), 'DESTE');
  assert.match(cliente.avisos[0], /deste aparelho/);
});

test('raiz: só as pastas do sistema; backups não se apagam', async () => {
  const { raiz } = montar();
  assert.deepEqual(await S.subpastas(raiz), ['arquivos', 'backups', 'modelos']);
  await assert.rejects(raiz.getDirectoryHandle('outra'), { name: 'NotFoundError' });
  await assert.rejects(raiz.removeEntry('arquivos', { recursive: true }));
  const bk = await raiz.getDirectoryHandle('backups');
  await assert.rejects(S.salvarArquivo(bk, arquivo('x.json', '{}')), /backups/);
});

test('várias caixas pedindo a mesma pasta ao mesmo tempo: um pedido só à nuvem', async () => {
  const { raiz, cliente } = montar();
  const arquivos = await raiz.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true });
  const dir = await S.subpasta(arquivos, ['Apto 604', 'Inquilinos', 'Maria Exemplo']);
  await S.salvarArquivo(dir, arquivo('contrato.pdf', '%PDF-1'));
  cliente.listas.clear();
  const buscarAntes = cliente.buscar; let listas = 0;
  cliente.buscar = (url, op) => { if (String(url).includes('/lista/')) listas += 1; return buscarAntes(url, op); };
  const resultados = await Promise.all([1, 2, 3, 4].map(() => S.listar(dir)));
  assert.ok(resultados.every((r) => r.map((a) => a.nome).join() === 'contrato.pdf'));
  assert.equal(listas, 1, 'as 4 caixas esperam o mesmo pedido');
});
