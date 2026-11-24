// Assinatura dos PDFs no programa do PC (atualizador-pc/assinar-pdf.mjs). A parte do PDF roda em qualquer sistema; a assinatura
// de verdade só no Windows, com um certificado de TESTE criado na memória (nunca o da empresa, nada vai para o Windows).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as A from '../atualizador-pc/assinar-pdf.mjs';

/** PDF mínimo de duas páginas, com a tabela de referências como o jsPDF grava. ``catalogo``: o que mais vai no catálogo. */
function pdfDeTeste({ catalogo = '', extras = [] } = {}) {
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R${catalogo} >>`,
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 595.28 841.89] >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Resources << >> >>',
    '<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Resources << >> /Annots [6 0 R] >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    '<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] >>',
    ...extras,
  ];
  let s = '%PDF-1.3\n';
  const off = [];
  objs.forEach((o, i) => { off.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objs.length + 1} /Root 1 0 R /ID [<aa> <aa>] >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
}

/** PDF como o site manda para assinar: a linha da assinatura da empresa marcada na 2ª folha e a logo (JPEG de mentira). */
const pdfMarcado = () => pdfDeTeste({ catalogo: ' /ImoveisAssinatura << /Pagina 2 /Rect [200 300 385 312] /Logo 7 0 R >>',
  extras: ['<< /Type /XObject /Subtype /Image /Width 600 /Height 200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 4 >>\nstream\nJPEG\nendstream'] });

/** Confere que o objeto ``n`` está onde a tabela nova de referências diz. */
function conferirReferencias(texto, numeros) {
  const novo = A.lerTrailer(texto);
  for (const n of numeros) {
    const linha = texto.slice(novo.startxref).match(new RegExp(`\\n${n} 1\\n(\\d{10}) 00000 n `));
    assert.ok(linha && texto.startsWith(`${n} 0 obj`, Number(linha[1])), `objeto ${n} no lugar`);
  }
}

test('PDF preparado: atualização incremental, página final de assinatura, /ByteRange cobre tudo menos a assinatura', () => {
  const original = pdfDeTeste();
  const quando = new Date('2026-12-05T13:32:00Z');
  const prep = A.prepararPdf(original, { nome: 'ANK TESTE LTDA', cnpj: '11.222.333/0001-81', emissor: 'AC TESTE', quando });
  const texto = prep.pdf.toString('latin1');
  assert.ok(prep.pdf.subarray(0, original.length).equals(original), 'o PDF original fica intacto (só acrescenta no fim)');
  const br = texto.match(/\/ByteRange \[0 (\d+) (\d+) (\d+)\]/).slice(1).map(Number);
  assert.equal(br[0], prep.inicio);
  assert.equal(br[1], prep.fim);
  assert.equal(br[1] + br[2], prep.pdf.length);
  assert.equal(prep.aAssinar.length, prep.pdf.length - (prep.fim - prep.inicio));
  // página final de assinatura (objeto 13) no fim da lista; o documento continua com as 2 páginas dele antes
  assert.match(texto, /2 0 obj\n<< \/Type \/Pages \/Kids \[3 0 R 4 0 R 13 0 R\] \/Count 3/);
  // sem a linha marcada pelo site, o selo (o campo da assinatura) fica na própria página final
  assert.match(texto, /13 0 obj\n<< \/Type \/Page \/Parent 2 0 R [^]*\/Annots \[10 0 R\]/);
  assert.match(texto, /10 0 obj\n<< \/Type \/Annot \/Subtype \/Widget \/FT \/Sig [^\n]*\/P 13 0 R/);
  assert.match(texto, /\/AcroForm << \/Fields \[10 0 R\] \/SigFlags 3 >>/);
  // a página: título, os dados do certificado, o resumo do original e como conferir
  assert.match(texto, /\(Documento assinado digitalmente\) Tj/);
  assert.match(texto, /Documento com 2 páginas antes desta/);
  assert.match(texto, /\(AC TESTE\) Tj/);
  assert.match(texto, /\(05\/12\/2026 às 10:32 \\\(horário de Brasília\\\)\) Tj/);
  const resumo = createHash('sha256').update(original).digest('hex');
  assert.match(texto, new RegExp(`\\(${resumo.slice(0, 32)}\\) Tj[^]*\\(${resumo.slice(32)}\\) Tj`), 'o SHA-256 do original, em duas linhas');
  assert.match(texto, /validar\.iti\.gov\.br/);
  assert.ok(!/ASSINATURA DIGITAL\) Tj\nBT \/F1 9\.5/.test(texto), 'sem a tarja antiga');
  // o selo
  assert.match(texto, /\(ASSINADO DIGITALMENTE POR\) Tj/);
  assert.match(texto, /\(ANK TESTE LTDA\) Tj/);
  assert.match(texto, /\(CNPJ 11\.222\.333\/0001-81 · 05\/12\/2026 às 10:32\) Tj/);
  assert.match(texto, /\/M \(D:20261205133200Z\)/);
  assert.match(texto, /trailer\n<< \/Size 15 \/Root 1 0 R \/ID \[<aa> <aa>\] \/Prev \d+ >>\nstartxref\n\d+\n%%EOF\n$/);
  conferirReferencias(texto, [7, 8, 9, 10, 11, 12, 13, 14, 2, 1]);
  // os /Length dos fluxos novos conferem com o que está entre "stream" e "endstream"
  const acrescimo = texto.slice(original.length);
  for (const m of acrescimo.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const ini = m.index + m[0].length;
    assert.equal(acrescimo.indexOf('\nendstream', ini) - ini, Number(m[1]));
  }
  const final = A.inserirAssinatura(prep, Buffer.from([1, 2, 3]));
  assert.equal(final.length, prep.pdf.length, 'a assinatura entra sem mudar o tamanho');
  assert.match(final.toString('latin1'), /\/Contents <010203000/);
  assert.throws(() => A.prepararPdf(final, { nome: 'X', cnpj: '', quando }), /já tem formulário ou assinatura/);
});

test('PDF marcado pelo site: o selo vai na linha da assinatura da empresa e a logo no cabeçalho da página final', () => {
  const original = pdfMarcado();
  const prep = A.prepararPdf(original, { nome: 'ANK TESTE LTDA', cnpj: '11.222.333/0001-81', quando: new Date('2026-12-05T13:32:00Z') });
  const texto = prep.pdf.toString('latin1');
  assert.deepEqual(A.marcaDoSite(A.dicionarioDoObjeto(texto, 1)), { pagina: 2, rect: [200, 300, 385, 312], logo: 7 });
  // objetos novos a partir do 8: campo 11, página final 14; a 2ª folha (objeto 4) ganha o campo junto do link que já tinha
  assert.match(texto, /4 0 obj\n<< \/Type \/Page \/Parent 2 0 R \/Contents 5 0 R \/Resources << >> \/Annots \[6 0 R 11 0 R\] >>/);
  assert.match(texto, /11 0 obj\n<< \/Type \/Annot \/Subtype \/Widget \/FT \/Sig [^\n]*\/P 4 0 R \/Rect \[172\.5 298 412\.5 348\]/, 'centrado na linha, com a base logo abaixo dela');
  assert.match(texto, /14 0 obj\n<< \/Type \/Page [^\n]*\/XObject << \/Logo 7 0 R >>/);
  assert.doesNotMatch(texto.match(/14 0 obj\n[^\n]*/)[0], /\/Annots/, 'a página final fica sem o campo');
  assert.match(texto, /cm \/Logo Do Q/);
  assert.match(texto, /o selo da assinatura aparece também no lugar da assinatura da empresa/);
  conferirReferencias(texto, [8, 9, 10, 11, 12, 13, 14, 15, 4, 2, 1]);
  // marca com página que não existe: o selo volta para a página final
  const fora = A.prepararPdf(pdfDeTeste({ catalogo: ' /ImoveisAssinatura << /Pagina 9 /Rect [1 2 3 4] >>' }), { nome: 'ANK', cnpj: '', quando: new Date() }).pdf.toString('latin1');
  assert.match(fora, /\/P 13 0 R/);
  // nome comprido: a letra diminui para caber no selo
  assert.ok(A.larguraTexto('ANK ADMINISTRADORA DE BENS LTDA', 'F2', 9) > 0);
  assert.match(A.desenhoDoSelo(240, 50, { nome: 'ANK ADMINISTRADORA DE BENS E PARTICIPACOES IMOBILIARIAS LTDA', cnpj: '', dataBr: 'x' }), /\/F2 [67](\.\d+)? Tf/);
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

/** Certificado de teste emitido por uma certificadora de TESTE (as duas na memória): o .pfx (base64) com a cadeia junto. */
function certificadoDaCertificadora(senha) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$X = 'System.Security.Cryptography.X509Certificates';
$rsaAc = [System.Security.Cryptography.RSA]::Create(2048);
$reqAc = New-Object "$X.CertificateRequest"('CN=AC TESTE DO SISTEMA, O=ICP-Brasil', $rsaAc, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1);
$reqAc.CertificateExtensions.Add((New-Object "$X.X509BasicConstraintsExtension"($true, $false, 0, $true)));
$reqAc.CertificateExtensions.Add((New-Object "$X.X509KeyUsageExtension"([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign, $true)));
$ac = $reqAc.CreateSelfSigned([DateTimeOffset]::Now.AddDays(-2), [DateTimeOffset]::Now.AddYears(2));
$rsa = [System.Security.Cryptography.RSA]::Create(2048);
$req = New-Object "$X.CertificateRequest"('CN=ANK TESTE LTDA:11222333000181, O=ICP-Brasil', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1);
$req.CertificateExtensions.Add((New-Object "$X.X509KeyUsageExtension"(([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::NonRepudiation), $true)));
$c = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::CopyWithPrivateKey($req.Create($ac, [DateTimeOffset]::Now.AddDays(-1), [DateTimeOffset]::Now.AddYears(1), [byte[]](1,2,3,4,5,6,7,8)), $rsa);
$col = New-Object "$X.X509Certificate2Collection"; [void]$col.Add($c); [void]$col.Add((New-Object "$X.X509Certificate2"(,$ac.RawData)));
[Convert]::ToBase64String($col.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, '${senha}'))`], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

test('Windows: PDF marcado pelo site, assinado com certificado de certificadora de teste: a assinatura confere e cobre o selo', { skip: !noWindows && 'só no Windows' }, () => {
  const senha = 'senha-de-teste-456';
  const pfx = certificadoDaCertificadora(senha);
  const dados = A.dadosDoCertificado(pfx, senha);
  assert.equal(dados.emissor, 'AC TESTE DO SISTEMA');
  const final = A.assinarPdf(pdfMarcado(), { pfx, senha, dados, selo: { documento: 'Recibo de teste' }, quando: new Date('2026-12-05T13:32:00Z') });
  const texto = final.toString('latin1');
  const [, a, b, c] = texto.match(/\/ByteRange \[0 (\d+) (\d+) (\d+)\]/).map(Number);
  assert.equal(b + c, final.length, 'a assinatura cobre o arquivo inteiro, com o selo e a página final');
  const assinatura = Buffer.from(texto.slice(a + 1, b - 1).replace(/(00)+$/, ''), 'hex');
  const conteudo = Buffer.concat([final.subarray(0, a), final.subarray(b, b + c)]);
  const conferir = (cont) => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `trap { exit 1 }; $j = [Console]::In.ReadToEnd() | ConvertFrom-Json; Add-Type -AssemblyName System.Security;
$ci = New-Object System.Security.Cryptography.Pkcs.ContentInfo(,[Convert]::FromBase64String($j.c));
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms($ci, $true); $cms.Decode([Convert]::FromBase64String($j.s)); $cms.CheckSignature($true);
$cms.SignerInfos[0].Certificate.Subject + '|' + $cms.SignerInfos[0].Certificate.Issuer + '|' + $cms.Certificates.Count`], { input: JSON.stringify({ c: cont.toString('base64'), s: assinatura.toString('base64') }), encoding: 'utf8', windowsHide: true });
  const r = conferir(conteudo);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /CN=ANK TESTE LTDA:11222333000181/);
  assert.match(r.stdout, /CN=AC TESTE DO SISTEMA/);
  assert.match(r.stdout.trim(), /\|2$/, 'a cadeia (o certificado e a certificadora) vai junto');
  // mexer no texto do selo (o nome da empresa) quebra a assinatura
  const i = conteudo.indexOf('(ANK TESTE LTDA) Tj');
  assert.ok(i > 0);
  const mexido = Buffer.from(conteudo); mexido[i + 1] = 'X'.charCodeAt(0);
  assert.notEqual(conferir(mexido).status, 0, 'selo alterado depois de assinado: a assinatura não confere');
});

test('certificado no PC: guarda cifrado (aqui de mentira), recusa vencido e senha vazia; a rodada assina a fila e avisa o erro', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const CERT = await import('../atualizador-pc/certificado.mjs');
  const env = { IMOVEIS_CONFIG: fs.mkdtempSync(path.join(os.tmpdir(), 'imoveis-cert-')) };
  const dados = () => ({ nome: 'ANK TESTE LTDA', cnpj: '11.222.333/0001-81', validade: '2027-06-30' });
  const proteger = (t) => `cifrado(${t})`;
  assert.throws(() => CERT.guardarCertificado({ pfx: 'QUJD', senha: '' }, env, { dados, proteger }), /senha do certificado/);
  assert.throws(() => CERT.guardarCertificado({ pfx: 'QUJD', senha: 'x' }, env, { dados: () => ({ ...dados(), validade: '2025-01-01' }), proteger, hoje: '2026-11-21' }), /venceu em 01\/01\/2025/);
  assert.deepEqual(CERT.guardarCertificado({ pfx: 'QUJD', senha: 'segredo' }, env, { dados, proteger, hoje: '2026-11-21' }), dados());
  const guardado = fs.readFileSync(path.join(env.IMOVEIS_CONFIG, 'certificado.json'), 'utf8');
  assert.ok(!guardado.includes('"segredo"') && guardado.includes(`cifrado(${Buffer.from('segredo').toString('base64')})`), 'a senha só vai cifrada (em base64 por dentro, para não perder espaço nas pontas)');
  assert.equal(CERT.resumoDoCertificado(env).cnpj, '11.222.333/0001-81');
  assert.equal(CERT.lerCertificado(env, { abrir: (t) => t.slice(8, -1) }).senha, 'segredo');
  // a rodada: dois pendentes; um assina, o outro foi cancelado no site no meio (409); um terceiro dá erro e o erro vai à nuvem
  const chamadas = [];
  const buscar = async (url, op = {}) => {
    chamadas.push(`${op.method || 'GET'} ${url.replace('https://x/api/aparelho/assinaturas', '')}`);
    if (url.endsWith('/assinaturas')) return new Response(JSON.stringify({ pendentes: [{ id: 'a1', titulo: 'Recibo' }, { id: 'a2', titulo: 'Carta' }, { id: 'a3', titulo: 'Termo' }] }));
    if (url.endsWith('/a2.pdf')) return new Response('{}', { status: 409 });
    if (url.endsWith('.pdf')) return new Response('%PDF-1.3 doc');
    if (url.endsWith('/assinado')) return new Response('{"ok":true}');
    return new Response('{"ok":true}');
  };
  const assinar = (buf) => { if (String(buf).includes('doc') && chamadas.some((c) => c.includes('a3.pdf'))) throw new Error('certificado com problema'); return Buffer.concat([buf, Buffer.from(' assinado')]); };
  const r = await CERT.assinarFila({ site: 'https://x', cracha: 'ap1_x' }, { pfx: 'p', senha: 's', nome: 'ANK TESTE LTDA', cnpj: '11.222.333/0001-81', validade: '2099-01-01' }, { buscar, assinar });
  assert.equal(r.assinados, 1);
  assert.deepEqual(r.erros, ['Termo: certificado com problema']);
  assert.ok(chamadas.includes('PUT /a1/assinado'));
  assert.ok(!chamadas.includes('PUT /a2/assinado'), 'cancelado no site: pula');
  assert.ok(chamadas.includes('POST /a3/erro'), 'o erro vai para o site');
  // certificado vencido: nada é assinado, cada documento recebe o aviso
  const r2 = await CERT.assinarFila({ site: 'https://x', cracha: 'ap1_x' }, { pfx: 'p', senha: 's', nome: 'ANK', validade: '2025-01-01' }, { buscar, assinar: () => { throw new Error('não devia assinar'); } });
  assert.equal(r2.assinados, 0);
  assert.match(r2.erros[0], /venceu em 01\/01\/2025/);
  fs.rmSync(env.IMOVEIS_CONFIG, { recursive: true, force: true });
});
