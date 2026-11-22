// Assinatura dos PDFs no programa do PC (atualizador-pc/assinar-pdf.mjs). A parte do PDF roda em qualquer sistema; a assinatura
// de verdade só no Windows, com um certificado de TESTE criado na memória (nunca o da empresa, nada vai para o Windows).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import * as A from '../atualizador-pc/assinar-pdf.mjs';

/** PDF mínimo de duas páginas, com a tabela de referências como o jsPDF grava. */
function pdfDeTeste() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 595.28 841.89] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Resources << >> >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Resources << >> /Annots [6 0 R] >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    '<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] >>',
  ];
  let s = '%PDF-1.3\n';
  const off = [];
  objs.forEach((o, i) => { off.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objs.length + 1} /Root 1 0 R /ID [<aa> <aa>] >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
}

test('PDF preparado: atualização incremental, selo na última página, /ByteRange cobre tudo menos a assinatura', () => {
  const original = pdfDeTeste();
  const quando = new Date('2026-12-05T13:32:00Z');
  const prep = A.prepararPdf(original, { nome: 'ANK TESTE LTDA', cnpj: '11.222.333/0001-81', quando });
  const texto = prep.pdf.toString('latin1');
  assert.ok(prep.pdf.subarray(0, original.length).equals(original), 'o PDF original fica intacto (só acrescenta no fim)');
  const br = texto.match(/\/ByteRange \[0 (\d+) (\d+) (\d+)\]/).slice(1).map(Number);
  assert.equal(br[0], prep.inicio);
  assert.equal(br[1], prep.fim);
  assert.equal(br[1] + br[2], prep.pdf.length);
  assert.equal(prep.aAssinar.length, prep.pdf.length - (prep.fim - prep.inicio));
  // página final de assinatura (objeto 13) no fim da lista; o documento continua com as 2 páginas dele antes
  assert.match(texto, /2 0 obj\n<< \/Type \/Pages \/Kids \[3 0 R 4 0 R 13 0 R\] \/Count 3/);
  assert.match(texto, /13 0 obj\n<< \/Type \/Page \/Parent 2 0 R [^]*\/Annots \[10 0 R\]/);
  assert.match(texto, /\/AcroForm << \/Fields \[10 0 R\] \/SigFlags 3 >>/);
  assert.match(texto, /\(ASSINATURA DIGITAL\) Tj/);
  assert.match(texto, /com 2 páginas antes desta/);
  assert.match(texto, /\(Assinado digitalmente por ANK TESTE LTDA\) Tj/);
  assert.match(texto, /Data e hora: 05\/12\/2026 às 10:32/);
  assert.match(texto, /\/M \(D:20261205133200Z\)/);
  assert.match(texto, /trailer\n<< \/Size 14 \/Root 1 0 R \/ID \[<aa> <aa>\] \/Prev \d+ >>\nstartxref\n\d+\n%%EOF\n$/);
  // a tabela nova aponta para cada objeto certo
  const novo = A.lerTrailer(texto);
  for (const [n] of [[7], [8], [9], [10], [11], [12], [13], [2], [1]]) {
    const linha = texto.slice(novo.startxref).match(new RegExp(`\\n${n} 1\\n(\\d{10}) 00000 n `));
    assert.ok(texto.startsWith(`${n} 0 obj`, Number(linha[1])), `objeto ${n} no lugar`);
  }
  const final = A.inserirAssinatura(prep, Buffer.from([1, 2, 3]));
  assert.equal(final.length, prep.pdf.length, 'a assinatura entra sem mudar o tamanho');
  assert.match(final.toString('latin1'), /\/Contents <010203000/);
  assert.throws(() => A.prepararPdf(final, { nome: 'X', cnpj: '', quando }), /já tem formulário ou assinatura/);
});

const noWindows = process.platform === 'win32';

/** Certificado de teste na memória (.NET CertificateRequest): devolve o .pfx em base64. */
function certificadoDeTeste(senha) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$rsa = [System.Security.Cryptography.RSA]::Create(2048);
$req = New-Object System.Security.Cryptography.X509Certificates.CertificateRequest('CN=ANK TESTE LTDA:11222333000181, O=ICP-Brasil', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1);
$c = $req.CreateSelfSigned([DateTimeOffset]::Now.AddDays(-1), [DateTimeOffset]::Now.AddYears(1));
[Convert]::ToBase64String($c.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, '${senha}'))`], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

test('Windows: assina com o certificado (teste), a assinatura confere com o /ByteRange e senha errada é recusada', { skip: !noWindows && 'só no Windows' }, () => {
  const senha = 'senha-de-teste-123';
  const pfx = certificadoDeTeste(senha);
  const dados = A.dadosDoCertificado(pfx, senha);
  assert.equal(dados.nome, 'ANK TESTE LTDA');
  assert.equal(dados.cnpj, '11.222.333/0001-81');
  assert.throws(() => A.dadosDoCertificado(pfx, 'errada'), /senha|certificado/i);
  const final = A.assinarPdf(pdfDeTeste(), { pfx, senha, quando: new Date('2026-12-05T13:32:00Z') });
  const texto = final.toString('latin1');
  const [, a, b, c] = texto.match(/\/ByteRange \[0 (\d+) (\d+) (\d+)\]/).map(Number);
  const assinatura = Buffer.from(texto.slice(a + 1, b - 1).replace(/(00)+$/, ''), 'hex');
  const conteudo = Buffer.concat([final.subarray(0, a), final.subarray(b, b + c)]);
  // confere pelo próprio Windows: a assinatura é do conteúdo (ByteRange) e o certificado é o de teste
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$j = [Console]::In.ReadToEnd() | ConvertFrom-Json; Add-Type -AssemblyName System.Security;
$ci = New-Object System.Security.Cryptography.Pkcs.ContentInfo(,[Convert]::FromBase64String($j.c));
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms($ci, $true); $cms.Decode([Convert]::FromBase64String($j.s)); $cms.CheckSignature($true);
$cms.SignerInfos[0].Certificate.Subject + '|' + $cms.SignerInfos[0].DigestAlgorithm.Value`], { input: JSON.stringify({ c: conteudo.toString('base64'), s: assinatura.toString('base64') }), encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /CN=ANK TESTE LTDA:11222333000181/);
  assert.match(r.stdout, /2\.16\.840\.1\.101\.3\.4\.2\.1/, 'SHA-256');
  // mexer num byte do PDF assinado quebra a assinatura
  const mexido = Buffer.from(conteudo); mexido[20] ^= 1;
  const r2 = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$j = [Console]::In.ReadToEnd() | ConvertFrom-Json; Add-Type -AssemblyName System.Security;
$ci = New-Object System.Security.Cryptography.Pkcs.ContentInfo(,[Convert]::FromBase64String($j.c));
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms($ci, $true); $cms.Decode([Convert]::FromBase64String($j.s)); $cms.CheckSignature($true)`], { input: JSON.stringify({ c: mexido.toString('base64'), s: assinatura.toString('base64') }), encoding: 'utf8', windowsHide: true });
  assert.notEqual(r2.status, 0, 'PDF alterado depois de assinado: a assinatura não confere');
});
