// Registro da conferência dos documentos do link da ficha (mutirão 3000, segurança 44): resumo SHA-256 do arquivo conferido,
// quem conferiu e quando (conferir-pdf.js), a compactação que vem depois (resumo do arquivo novo) e o aviso quando o arquivo
// muda depois da conferência (regras.js). Dados fictícios.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as CP from '../docs/js/conferir-pdf.js';
import * as R from '../docs/js/regras.js';

const bytes = (t) => new TextEncoder().encode(t);
const sha = (t) => createHash('sha256').update(t).digest('hex');
const PDF = '%PDF-1.7\n1 0 obj << /Producer (Banco Teste S.A.) >> endobj\n%%EOF\n';

function base() {
  const d = R.bancoVazio();
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Interessado Teste', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física', data_recebida: '2026-11-12', situacao: 'Em análise' }, 'teste');
  return { d, f };
}

test('resumo SHA-256 do arquivo: igual ao do Node, muda com um byte', async () => {
  assert.equal(await CP.resumoDoArquivo(bytes('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await CP.resumoDoArquivo(bytes(PDF)), sha(PDF));
  assert.notEqual(await CP.resumoDoArquivo(bytes(PDF.replace('Teste', 'Teste2'))), sha(PDF));
  assert.equal(await CP.resumoDoArquivo(bytes(PDF).buffer), sha(PDF), 'aceita ArrayBuffer');
});

test('registro da conferência: resultado, resumo, quem (login e nome) e quando', async () => {
  const r = await CP.conferirArquivo(bytes(PDF));
  const reg = CP.registroDaConferencia(r, { sha256: sha(PDF), por: 'maria', nome: 'Maria Teste', em: '2026-11-17T17:05:00.000Z' });
  assert.deepEqual(reg.sinais, r.sinais);
  assert.equal(reg.sha256, sha(PDF));
  assert.equal(reg.conferido_por, 'maria');
  assert.equal(reg.conferido_por_nome, 'Maria Teste');
  assert.equal(reg.conferido_em, '2026-11-17T17:05:00.000Z');
});

test('situação diante do arquivo de agora: nova, antiga, mesmo, compactado e mudou', () => {
  const g = { sinais: [], assinaturas: [], sha256: 'a'.repeat(64), conferido_por: 'maria', conferido_em: '2026-11-17T17:05:00.000Z' };
  assert.equal(CP.situacaoDaConferencia(undefined, 'x'), 'nova');
  assert.equal(CP.situacaoDaConferencia({ sinais: [], conferido_em: '2026-11-16T10:00:00.000Z' }, 'x'), 'antiga', 'guardada antes do resumo');
  assert.equal(CP.situacaoDaConferencia(g, 'a'.repeat(64)), 'mesmo');
  assert.equal(CP.situacaoDaConferencia(g, 'b'.repeat(64)), 'mudou');
  const compactada = CP.comCompactacao(g, 'b'.repeat(64), '2026-11-17T17:06:00.000Z');
  assert.equal(compactada.sha256, g.sha256, 'o resumo do original continua');
  assert.equal(CP.situacaoDaConferencia(compactada, 'b'.repeat(64)), 'compactado', 'a compactação não dá falso aviso');
  assert.equal(CP.situacaoDaConferencia(compactada, 'a'.repeat(64)), 'mesmo', 'troca que falhou: o original ainda vale');
  assert.equal(CP.situacaoDaConferencia(compactada, 'c'.repeat(64)), 'mudou', 'nem o original nem o compactado');
  assert.equal(CP.situacaoDaConferencia(compactada, ''), 'mudou');
});

test('guardar a conferência na ficha: com histórico; a já guardada (outro aparelho) não é trocada', () => {
  const { d, f } = base();
  const reg = { sinais: [], assinaturas: [], sha256: sha(PDF), conferido_por: 'maria', conferido_por_nome: 'Maria Teste', conferido_em: '2026-11-17T17:05:00.000Z' };
  assert.equal(R.guardarConferenciasDoLink(d, f.id, { 'link-rg-2026-11-17-ab12cd.pdf': reg }, 'maria'), 1);
  const outra = { ...reg, sha256: 'f'.repeat(64), conferido_por: 'joao' };
  assert.equal(R.guardarConferenciasDoLink(d, f.id, { 'link-rg-2026-11-17-ab12cd.pdf': outra }, 'joao'), 0, 'a primeira fica');
  const g = R.buscar(d, 'fichas', f.id).conferencias_link['link-rg-2026-11-17-ab12cd.pdf'];
  assert.equal(g.conferido_por, 'maria');
  assert.equal(g.sha256, sha(PDF));
  assert.ok(d.historico.some((h) => h.usuario === 'maria' && /Conferência guardada de 1 documento/.test(h.descricao)));
});

test('compactação depois da conferência: guarda o resumo do compactado; conferir de novo tira a guardada', () => {
  const { d, f } = base();
  const nome = 'link-holerite-2026-11-17-ef34ab.pdf';
  R.guardarConferenciasDoLink(d, f.id, { [nome]: { sinais: [], assinaturas: [], sha256: 'a'.repeat(64), conferido_por: 'maria', conferido_em: '2026-11-17T17:05:00.000Z' } }, 'maria');
  assert.equal(R.registrarCompactacaoDoLink(d, f.id, { [nome]: 'b'.repeat(64), 'link-que-nao-foi-conferido.jpg': 'c'.repeat(64) }, 'maria', '2026-11-17T17:06:00.000Z'), 1);
  const g = R.buscar(d, 'fichas', f.id).conferencias_link[nome];
  assert.equal(g.sha256, 'a'.repeat(64));
  assert.equal(g.sha256_compactado, 'b'.repeat(64));
  assert.equal(g.compactado_em, '2026-11-17T17:06:00.000Z');
  assert.equal(g.conferido_por, 'maria', 'quem conferiu continua');
  assert.ok(!R.buscar(d, 'fichas', f.id).conferencias_link['link-que-nao-foi-conferido.jpg'], 'sem conferência não ganha registro');
  assert.equal(CP.situacaoDaConferencia(g, 'b'.repeat(64)), 'compactado');
  // alguém trocou o arquivo depois: a tela avisa e oferece conferir de novo
  assert.equal(CP.situacaoDaConferencia(g, 'd'.repeat(64)), 'mudou');
  assert.equal(R.refazerConferenciaDoLink(d, f.id, nome, 'joao'), true);
  assert.equal(R.buscar(d, 'fichas', f.id).conferencias_link[nome], undefined);
  assert.equal(R.refazerConferenciaDoLink(d, f.id, nome, 'joao'), false, 'nada a tirar');
  assert.ok(d.historico.some((h) => h.usuario === 'joao' && /refeita: o arquivo tinha mudado/.test(h.descricao)));
});
