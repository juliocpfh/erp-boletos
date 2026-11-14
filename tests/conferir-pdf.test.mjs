// Conferência dos documentos da ficha (docs/js/conferir-pdf.js): programa que fez o PDF, alteração depois de criado,
// assinatura digital (gov.br / ICP-Brasil) e quem assinou. PDFs de mentira montados aqui; nomes fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { conferirArquivo, mesmoNome, textoDoPdf } from '../docs/js/conferir-pdf.js';

const pdf = (corpo) => new TextEncoder().encode(`%PDF-1.7\n${corpo}\n%%EOF\n`);
const hexDe = (t) => [...new TextEncoder().encode(t)].map((b) => b.toString(16).padStart(2, '0')).join('');
const cn = (t) => `0603550403 0c${new TextEncoder().encode(t).length.toString(16).padStart(2, '0')}${hexDe(t)}`.replace(/\s/g, '');

test('strings do PDF: literal com escapes e hexadecimal em UTF-16', () => {
  assert.equal(textoDoPdf('(Banco \\(teste\\) S.A.)'), 'Banco (teste) S.A.');
  assert.equal(textoDoPdf('(Caf\\351)'), 'Café');
  assert.equal(textoDoPdf('<FEFF0069004C006F0076006500500044 0046>'), 'iLovePDF');
});

test('extrato feito no Canva: alerta; no Word: atenção; impresso do navegador: informação; do banco: nada', async () => {
  const canva = await conferirArquivo(pdf('1 0 obj << /Producer (Canva) /Creator (Canva) /CreationDate (D:20261101100000) >> endobj'));
  assert.equal(canva.sinais[0].nivel, 'alerta');
  assert.match(canva.sinais[0].texto, /"Canva".*peça o arquivo original/);
  const word = await conferirArquivo(pdf('<< /Creator (Microsoft® Word para Microsoft 365) /Producer (Microsoft® Word para Microsoft 365) >>'));
  assert.equal(word.sinais[0].nivel, 'atencao');
  const nav = await conferirArquivo(pdf('<< /Producer (Skia/PDF m120) /Creator (Mozilla/5.0 Chrome/120) >>'));
  assert.equal(nav.sinais[0].nivel, 'info');
  const banco = await conferirArquivo(pdf('<< /Producer (iText 7.2 Banco Exemplo) /CreationDate (D:20261101) /ModDate (D:20261101) >>'));
  assert.deepEqual(banco.sinais, []);
  assert.equal(banco.programa, 'iText 7.2 Banco Exemplo');
});

test('metadados dentro de trecho comprimido (PDF 1.5+) e alteração dias depois de criado', async () => {
  const dentro = deflateSync(Buffer.from('<< /Producer (iLovePDF) /CreationDate (D:20260901) /ModDate (D:20261105) >>'));
  const bytes = new Uint8Array([...new TextEncoder().encode('%PDF-1.7\n5 0 obj << /Type /ObjStm /Filter /FlateDecode /Length 99 >>\nstream\n'), ...dentro, ...new TextEncoder().encode('\nendstream endobj\n%%EOF\n')]);
  const r = await conferirArquivo(bytes);
  assert.equal(r.programa, 'iLovePDF');
  assert.equal(r.sinais[0].nivel, 'alerta');
  const mexido = await conferirArquivo(pdf('<< /Producer (iText) /CreationDate (D:20260901) /ModDate (D:20261105) >>\n%%EOF\nxref'));
  assert.ok(mexido.sinais.some((s) => /Alterado em 05\/11\/2026, depois de criado em 01\/09\/2026/.test(s.texto)));
  assert.ok(mexido.sinais.some((s) => /salvo de novo 1 vez/.test(s.texto)));
});

test('assinatura gov.br: quem assinou, quando, e se o nome bate com a ficha', async () => {
  const contents = `3082${cn('AC Final do Governo Federal do Brasil v1')}${cn('MARIA SOUZA:52998224725')}`;
  const r = await conferirArquivo(pdf(`<< /Producer (iText) >>\n7 0 obj << /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 10 20 30] /M (D:20261115093000-03'00') /Contents <${contents}> >> endobj\n%%EOF`));
  assert.equal(r.assinaturas.length, 1);
  assert.deepEqual([r.assinaturas[0].nome, r.assinaturas[0].govbr, r.assinaturas[0].data], ['MARIA SOUZA', true, '2026-11-15T09:30:00']);
  assert.deepEqual(r.sinais, [], 'a assinatura acrescenta uma parte ao arquivo: não é alteração');
  assert.ok(mesmoNome('Maria Souza', r.assinaturas[0].nome));
  assert.ok(mesmoNome('Maria de Souza', 'MARIA SOUZA'));
  assert.ok(!mesmoNome('Maria Souza', 'JOAO PEREIRA'));
});

test('foto editada no Photoshop: alerta', async () => {
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ...new TextEncoder().encode('Exif\0\0 Adobe Photoshop 25.0 (Windows)\0')]);
  const r = await conferirArquivo(jpg);
  assert.equal(r.sinais[0].nivel, 'alerta');
  assert.match(r.sinais[0].texto, /Photoshop/);
});

test('revisão: todos os trechos comprimidos, editor por cima do original, emissor do certificado, nome do certificado', async () => {
  const trecho = (t) => [...new TextEncoder().encode('<< /Type /ObjStm /Filter /FlateDecode >>\nstream\n'), ...deflateSync(Buffer.from(t)), ...new TextEncoder().encode('\nendstream endobj\n')];
  // "iLovePDF" no segundo trecho comprimido; o primeiro não diz nada
  const dois = new Uint8Array([...new TextEncoder().encode('%PDF-1.7\n'), ...trecho('<< /Length 0 >>'), ...trecho('<< /Producer (iLovePDF) >>'), ...new TextEncoder().encode('%%EOF\n')]);
  assert.equal((await conferirArquivo(dois)).sinais[0].nivel, 'alerta');
  // original do banco aberto (iText) e o editor que salvou por cima dentro do trecho comprimido
  const porCima = new Uint8Array([...new TextEncoder().encode('%PDF-1.7\n<< /Producer (iText Banco) >>\n%%EOF\n'), ...trecho('<< /Producer (Adobe Acrobat Pro 2024) >>'), ...new TextEncoder().encode('%%EOF\n')]);
  assert.equal((await conferirArquivo(porCima)).sinais[0].nivel, 'alerta');
  // certificado ICP-Brasil comum (não gov.br) com endereço icpbrasil.gov.br; /Name falso; /Contents antes do /Type /Sig
  const contents = `3082${cn('AC SERASA RFB v5')}${hexDe('http://www.icpbrasil.gov.br/repositorio')}${cn('JOAO PEREIRA:52998224725')}`;
  const r = await conferirArquivo(pdf(`<< /Producer (iText) >>\n9 0 obj << /Contents <${contents}> /ByteRange [0 1 2 3] /Name (Maria) /Type /Sig /M (D:20261115) >> endobj\n%%EOF`));
  assert.equal(r.assinaturas.length, 1);
  assert.deepEqual([r.assinaturas[0].nome, r.assinaturas[0].govbr, r.assinaturas[0].icp], ['JOAO PEREIRA', false, true]);
  assert.ok(!mesmoNome('Maria José da Silva', 'Maria'), 'uma palavra só não basta');
  assert.ok(!mesmoNome('Maria José da Silva', r.assinaturas[0].nome));
});

test('revisão: sem alarme falso em arquivo "para a web", data do XMP e documento assinado', async () => {
  const lin = await conferirArquivo(pdf('1 0 obj << /Linearized 1 /L 999 >> endobj\n<< /Producer (Adobe PDF Library) >>\n%%EOF\nxref'));
  assert.deepEqual(lin.sinais, [], 'linearizado nasce com dois %%EOF');
  const xmp = await conferirArquivo(pdf('<x:xmpmeta><xmp:CreateDate>2026-11-10T09:00:00-03:00</xmp:CreateDate><xmp:ModifyDate>2026-11-10T09:05:00-03:00</xmp:ModifyDate><pdf:Producer>iText</pdf:Producer></x:xmpmeta>'));
  assert.equal(xmp.criado, '2026-11-10T09:00:00');
  assert.deepEqual(xmp.sinais, []);
  // assinado e com dados de validação depois da assinatura: não é "salvo de novo"; mexido antes de assinar: é
  const sig = `7 0 obj << /Type /Sig /ByteRange [0 1 2 3] /Contents <3082${cn('AC Final do Governo Federal do Brasil v1')}${cn('MARIA SOUZA:52998224725')}> >> endobj`;
  assert.deepEqual((await conferirArquivo(pdf(`<< /Producer (iText) >>\n%%EOF\n${sig}\n%%EOF\n<< /Type /DSS >>`))).sinais, []);
  const mexido = await conferirArquivo(pdf(`<< /Producer (iText) >>\n%%EOF\nxref\n%%EOF\n${sig}`));
  assert.ok(mexido.sinais.some((s) => /salvo de novo 1 vez/.test(s.texto)));
});
