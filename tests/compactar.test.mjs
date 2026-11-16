// Compactação dos anexos (docs/js/compactar.js; decisão do dono em 2026-11-16): partes que rodam sem navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import * as CP from '../docs/js/compactar.js';
import { pdfTemAssinatura } from '../docs/js/conferir-pdf.js';
import * as CR from '../docs/js/config-regras.js';

const bytes = (t) => new Uint8Array([...t].map((c) => c.charCodeAt(0) & 0xff));
const latin = (b) => String.fromCharCode(...b);
const junta = (...partes) => { const n = partes.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of partes) { o.set(p, i); i += p.length; } return o; };

test('tipo do arquivo pelos primeiros bytes, não pelo nome', () => {
  assert.equal(CP.tipoPelosBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpg');
  assert.equal(CP.tipoPelosBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), 'png');
  assert.equal(CP.tipoPelosBytes(bytes('%PDF-1.7\n%....')), 'pdf');
  assert.equal(CP.tipoPelosBytes(bytes('RIFF\0\0\0\0WEBPVP8 ')), 'webp');
  assert.equal(CP.tipoPelosBytes(bytes('\0\0\0\x18ftypheic\0\0\0\0')), 'heic');
  assert.equal(CP.tipoPelosBytes(bytes('PK\x03\x04 planilha...')), null);
  assert.equal(CP.tipoPelosBytes(new Uint8Array(3)), null);
});

test('medidas: lado maior até 2000 px, sem aumentar', () => {
  assert.deepEqual(CP.medidasReduzidas(4000, 3000), { largura: 2000, altura: 1500, escala: 0.5 });
  assert.deepEqual(CP.medidasReduzidas(3024, 4032).altura, 2000); // foto em pé do celular
  assert.equal(CP.medidasReduzidas(1200, 900).escala, 1);
  assert.equal(CP.trocarExtensao('RG frente.PNG', '.jpg'), 'RG frente.jpg');
  assert.equal(CP.trocarExtensao('sem-extensao', '.jpg'), 'sem-extensao.jpg');
  assert.ok(CP.compensa(4_000_000, 400_000));
  assert.ok(!CP.compensa(1_000_000, 900_000)); // ganho de 10%: não troca
  assert.ok(!CP.compensa(1_000_000, 0));
});

test('PDF montado com as páginas em JPEG: tabela de posições certa e sem sinal de assinatura', async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const pdf = CP.montarPdfDeImagens([
    { largura: 595.28, altura: 841.89, px: 1414, py: 2000, jpeg },
    { largura: 841.89, altura: 595.28, px: 2000, py: 1414, jpeg },
  ]);
  const t = latin(pdf);
  assert.ok(t.startsWith('%PDF-1.4\n'));
  assert.ok(t.trimEnd().endsWith('%%EOF'));
  assert.match(t, /\/Count 2/);
  assert.match(t, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  assert.match(t, /\/Width 1414 \/Height 2000 .*\/Filter \/DCTDecode \/Length 10/);
  const xref = Number(t.match(/startxref\n(\d+)/)[1]);
  assert.equal(t.slice(xref, xref + 4), 'xref');
  const linhas = t.slice(xref).split('\n');
  const total = Number(linhas[1].split(' ')[1]);
  assert.equal(total, 3 + 2 * 3);
  for (let n = 1; n < total; n += 1) {
    const pos = Number(linhas[2 + n].slice(0, 10));
    assert.equal(t.slice(pos, pos + `${n} 0 obj`.length), `${n} 0 obj`, `objeto ${n}`);
  }
  assert.equal(await pdfTemAssinatura(pdf), false);
  assert.equal(CP.tipoPelosBytes(pdf), 'pdf');
});

test('PDF com assinatura digital ou protegido nunca é compactado (também com a assinatura escondida num trecho comprimido)', async () => {
  const assinado = bytes('%PDF-1.7\n1 0 obj << /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 100 200 300] /Contents <3082> >> endobj\n%%EOF\n');
  assert.equal(await pdfTemAssinatura(assinado), true);
  assert.equal(await pdfTemAssinatura(bytes('%PDF-1.7\n1 0 obj << /SubFilter /ETSI.CAdES.detached >> endobj')), true);
  assert.equal(await pdfTemAssinatura(bytes('%PDF-1.7\ntrailer << /Root 1 0 R /Encrypt 5 0 R >>')), true);
  assert.equal(await pdfTemAssinatura(bytes('%PDF-1.7\n1 0 obj << /AcroForm << /SigFlags 3 >> >> endobj')), true);
  // gov.br: o dicionário da assinatura pode ir dentro de um ObjStm comprimido
  const dentro = deflateSync(Buffer.from('<< /FT /Sig /V 9 0 R >> << /Type /Sig /ByteRange [0 10 20 30] >>'));
  const comObjStm = junta(bytes(`%PDF-1.7\n4 0 obj << /Type /ObjStm /N 2 /First 10 /Filter /FlateDecode /Length ${dentro.length} >>\nstream\n`), new Uint8Array(dentro), bytes('\nendstream\nendobj\n%%EOF\n'));
  assert.equal(await pdfTemAssinatura(comObjStm), true);
  const semNada = deflateSync(Buffer.from('<< /Type /Page >> << /Type /Font >>'));
  const objStmLimpo = junta(bytes(`%PDF-1.7\n4 0 obj << /Type /ObjStm /N 2 /First 10 /Filter /FlateDecode /Length ${semNada.length} >>\nstream\n`), new Uint8Array(semNada), bytes('\nendstream\nendobj\n%%EOF\n'));
  assert.equal(await pdfTemAssinatura(objStmLimpo), false);
});

test('sem navegador (ou arquivo pequeno), o anexo fica como chegou', async () => {
  const f = new File([new Uint8Array(500_000).fill(7)], 'foto.jpg');
  const r = await CP.compactarAnexo(f);
  assert.equal(r.mudou, false);
  assert.equal(r.arquivo, f);
});

test('regra "Compactar anexos" começa ligada, com explicação, consequência e lei', () => {
  const def = CR.DEFINICOES_REGRAS.find((x) => x.chave === 'compactar_anexos');
  assert.ok(def);
  assert.equal(def.tipo, 'simnao');
  assert.equal(def.padrao, true);
  assert.equal(CR.regra('compactar_anexos'), true);
  assert.match(def.explica, /assinatura digital/);
});

// pasta falsa no formato da File System Access API (como pasta-nuvem.js entrega: tamanho na lista)
function pasta(nome, filhos) {
  const arquivos = new Map();
  return {
    kind: 'directory', name: nome, arquivos, filhos,
    async* entries() {
      for (const [n, v] of Object.entries(filhos)) {
        if (v && v.kind === 'directory') yield [n, v];
        else yield [n, { kind: 'file', name: n, tamanho: v, async getFile() { return new File([new Uint8Array(v)], n); } }];
      }
    },
  };
}

test('compactar os que já estão no sistema: mesmo nome, mesmo lugar; ficha em análise, pequenos e outros tipos ficam', async () => {
  const MB = 1024 * 1024;
  const inquilino = pasta('Ana Teste', { 'rg.jpg': 4 * MB, 'contrato-assinado.pdf': 2 * MB, 'escaneado.pdf': 12 * MB, 'pequena.jpg': 50_000, 'planilha.xlsx': 3 * MB, 'ja-pequena.png': 1 * MB });
  const raiz = pasta('arquivos', {
    'Imovel 1': pasta('Imovel 1', { Inquilinos: pasta('Inquilinos', { 'Ana Teste': inquilino }) }),
    [CP.PASTA_FICHAS]: pasta(CP.PASTA_FICHAS, { 'Bruno Teste': pasta('Bruno Teste', { 'holerite.jpg': 5 * MB }) }),
  });
  const olhados = [];
  const gravados = [];
  const andamento = [];
  // compactação de mentira: rg.jpg e escaneado.pdf diminuem; o PDF assinado e o PNG "não compensam"; um falha ao ler
  const compactar = async (f, op) => {
    assert.deepEqual(op, { manterNome: true });
    olhados.push(f.name);
    const novo = { 'rg.jpg': 400_000, 'escaneado.pdf': 1_500_000 }[f.name];
    return novo ? { arquivo: new File([new Uint8Array(novo)], f.name), antes: f.size, depois: novo, mudou: true } : { arquivo: f, antes: f.size, depois: f.size, mudou: false };
  };
  const r = await CP.compactarTodos(raiz, {
    ler: async (h) => { if (h.name === 'ja-pequena.png') throw new Error('arquivo mudou no meio da leitura'); return h.getFile(); },
    gravar: async (dir, nome, arq) => { gravados.push([dir.name, nome, arq.size]); },
    compactar,
    aoAndar: (x) => andamento.push(x),
  });
  assert.deepEqual(olhados.sort(), ['contrato-assinado.pdf', 'escaneado.pdf', 'rg.jpg']);
  assert.deepEqual(gravados.sort(), [['Ana Teste', 'escaneado.pdf', 1_500_000], ['Ana Teste', 'rg.jpg', 400_000]]);
  assert.equal(r.vistos, 4);
  assert.equal(r.compactados, 2);
  assert.equal(r.falhas, 1);
  assert.equal(r.antes, 16 * MB);
  assert.equal(r.depois, 1_900_000);
  assert.equal(andamento.at(-1).feitos, 4);
  assert.ok(!gravados.some(([, n]) => n === 'holerite.jpg'), 'ficha em análise não é mexida');
});
