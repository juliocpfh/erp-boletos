// Assinatura digital dos PDFs com o certificado A1 da empresa (e-CNPJ ICP-Brasil), no programa do PC (pedido do dono de
// 21/11/2026: o certificado fica guardado só neste computador, cifrado pelo Windows, e assina sozinho os documentos que o
// site põe na fila). Sem biblioteca de fora:
// - a parte do PDF é JavaScript puro (roda em qualquer sistema, tests/assinar-pdf.test.mjs): uma "atualização incremental"
//   no fim do arquivo (o PDF original fica intacto) com uma página final de assinatura (o selo "Assinado digitalmente
//   por …" e como conferir) e o espaço reservado para a assinatura (/Contents), no padrão adbe.pkcs7.detached;
// - a assinatura em si (CMS/PKCS#7 destacada, SHA-256, com a cadeia do certificado e a hora) é feita pelo próprio Windows
//   (PowerShell, System.Security.Cryptography.Pkcs): o .pfx e a senha vão pela entrada padrão, nunca na linha de comando.
// Quem confere: o leitor de PDF (Adobe) ou o validador do governo (validar.iti.gov.br).
import { spawnSync } from 'node:child_process';

const ESPACO_ASSINATURA = 30000; // bytes reservados para a assinatura (o certificado e a cadeia ICP-Brasil cabem com folga)
const LARGURA_NUMERO = 10; // dígitos de cada número do /ByteRange (preenchido depois, sem mudar o tamanho do arquivo)

const latin1 = (buf) => Buffer.from(buf).toString('latin1');
const doTexto = (s) => Buffer.from(s, 'latin1');

/** Texto PDF entre parênteses, com os caracteres especiais escapados. Ex.: "ANK (matriz)" → "(ANK \(matriz\))". */
const textoPdf = (s) => `(${String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e\xa0-\xff]/g, '?')})`;

/** Data no formato do PDF. Ex.: 2026-12-05T13:32:00Z → "D:20261205133200Z". */
export const dataPdf = (d) => `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;

/** Últimos dados do trailer do PDF: { startxref, size, root, info, id }. Recusa PDF com xref em fluxo (o jsPDF usa a tabela). */
export function lerTrailer(texto) {
  const m = texto.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
  if (!m) throw new Error('PDF sem o fim esperado (startxref).');
  const startxref = Number(m[1]);
  if (!texto.startsWith('xref', startxref)) throw new Error('PDF com a tabela de referências compactada: este tipo não é assinado aqui.');
  const ini = texto.indexOf('trailer', startxref);
  const fim = texto.indexOf('startxref', ini);
  const t = texto.slice(ini, fim);
  const num = (re) => { const x = t.match(re); return x ? Number(x[1]) : null; };
  const root = num(/\/Root\s+(\d+)\s+0\s+R/);
  const size = num(/\/Size\s+(\d+)/);
  if (!root || !size) throw new Error('PDF sem /Root ou /Size no trailer.');
  const id = (t.match(/\/ID\s*(\[[^\]]*\])/) || [])[1] || null;
  const info = num(/\/Info\s+(\d+)\s+0\s+R/);
  return { startxref, size, root, info, id };
}

/** Texto do dicionário do objeto ``n`` (a última versão dele no arquivo): "<< … >>". */
export function dicionarioDoObjeto(texto, n) {
  const re = new RegExp(`(?:^|[\\r\\n\\s])${n}\\s+0\\s+obj\\s*`, 'g');
  let m; let ultimo = null;
  while ((m = re.exec(texto))) ultimo = m;
  if (!ultimo) throw new Error(`Objeto ${n} não encontrado no PDF.`);
  const ini = ultimo.index + ultimo[0].length;
  if (!texto.startsWith('<<', ini)) throw new Error(`Objeto ${n} não é um dicionário.`);
  // acha o ">>" que fecha o "<<" do começo (dicionários podem ter outros dentro)
  let nivel = 0;
  for (let i = ini; i < texto.length - 1; i += 1) {
    if (texto[i] === '<' && texto[i + 1] === '<') { nivel += 1; i += 1; } else if (texto[i] === '>' && texto[i + 1] === '>') { nivel -= 1; i += 1; if (nivel === 0) return texto.slice(ini, i + 1); }
  }
  throw new Error(`Dicionário do objeto ${n} sem fim.`);
}

/** Raiz da árvore de páginas: { n, dic, count, largura, altura } (a página de assinatura entra no fim dela). */
function arvoreDePaginas(texto, root) {
  const cat = dicionarioDoObjeto(texto, root);
  const ref = cat.match(/\/Pages\s+(\d+)\s+0\s+R/);
  if (!ref) throw new Error('PDF sem /Pages.');
  const n = Number(ref[1]);
  const dic = dicionarioDoObjeto(texto, n);
  const count = Number((dic.match(/\/Count\s+(\d+)/) || [])[1]);
  if (!/\/Kids\s*\[/.test(dic) || !count) throw new Error('PDF sem a lista de páginas.');
  // tamanho da folha: o da raiz, ou o da primeira página (o jsPDF põe em cada página)
  let caixa = (dic.match(/\/MediaBox\s*\[([^\]]*)\]/) || [])[1];
  if (!caixa) { const k = dic.match(/\/Kids\s*\[\s*(\d+)\s+0\s+R/); caixa = k ? (dicionarioDoObjeto(texto, Number(k[1])).match(/\/MediaBox\s*\[([^\]]*)\]/) || [])[1] : null; }
  const [x0, y0, x1, y1] = String(caixa || '0 0 595.28 841.89').trim().split(/\s+/).map(Number);
  return { n, dic, count, largura: x1 - x0, altura: y1 - y0 };
}

/** Quebra um texto em linhas de até ``max`` caracteres (Helvetica 9,5: cabem cerca de 100 por linha na folha A4). */
function quebrar(texto, max) {
  const out = [];
  let linha = '';
  for (const p of String(texto).split(/\s+/)) {
    if (`${linha} ${p}`.trim().length > max) { out.push(linha); linha = p; } else linha = `${linha} ${p}`.trim();
  }
  if (linha) out.push(linha);
  return out;
}

/** Põe ``entrada`` (ex.: "/Annots [9 0 R]") num dicionário "<< … >>", juntando ao /Annots que já existir. */
function comEntrada(dic, chave, ref) {
  const corpo = dic.slice(2, -2);
  const re = new RegExp(`/${chave}\\s*\\[([^\\]]*)\\]`);
  if (re.test(corpo)) return `<<${corpo.replace(re, (m, dentro) => `/${chave} [${dentro.trim()} ${ref}]`)}>>`;
  if (new RegExp(`/${chave}\\s+\\d+\\s+0\\s+R`).test(corpo)) throw new Error(`O PDF tem /${chave} indireto: este tipo não é assinado aqui.`);
  return `<<${corpo} /${chave} [${ref}]>>`;
}

/**
 * Prepara o PDF para a assinatura: atualização incremental (o documento fica intacto) com uma PÁGINA FINAL de assinatura, como
 * fazem os serviços de assinatura (um selo no pé da página ficaria por cima do rodapé dos contratos), e o espaço reservado.
 * ``selo``: { nome, cnpj, responsavel?, emissor?, documento?, quando (Date), motivo?, local? }. Devolve { pdf (Buffer),
 * aAssinar (Buffer: os dois trechos do /ByteRange), inicio, fim } (``inicio``/``fim``: o "<…>" do /Contents).
 */
export function prepararPdf(original, selo) {
  const base = Buffer.from(original);
  const texto = latin1(base);
  const tr = lerTrailer(texto);
  const arv = arvoreDePaginas(texto, tr.root);
  const cat = dicionarioDoObjeto(texto, tr.root);
  if (/\/AcroForm/.test(cat)) throw new Error('O PDF já tem formulário ou assinatura: assine o PDF original, gerado pelo sistema.');
  const [nFonte, nNegrito, nAparencia, nCampo, nAssin, nConteudo, nPagina] = [0, 1, 2, 3, 4, 5, 6].map((k) => tr.size + k);
  const quando = selo.quando || new Date();
  const dataBr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(quando).replace(',', ' às');
  const { largura: L, altura: H } = arv;
  // texto da página: título, o que é a assinatura e como conferir
  const paragrafos = [
    `Este documento${selo.documento ? ` (${selo.documento})` : ''}, com ${arv.count} ${arv.count === 1 ? 'página' : 'páginas'} antes desta, foi assinado digitalmente pela empresa abaixo, com certificado digital ICP-Brasil (e-CNPJ). A assinatura digital tem a mesma validade da assinatura de próprio punho (Medida Provisória 2.200-2/2001, artigo 10, e Lei 14.063/2020, artigo 4º, III).`,
    'Qualquer mudança no arquivo depois da assinatura a invalida. Para conferir, abra o PDF num leitor de PDF (painel de assinaturas) ou envie o arquivo ao validador do governo: validar.iti.gov.br.',
  ];
  const corpo = [`BT /F2 13 Tf 56 ${H - 80} Td ${textoPdf('ASSINATURA DIGITAL')} Tj ET`];
  let y = H - 108;
  for (const par of paragrafos) {
    for (const l of quebrar(par, 100)) { corpo.push(`BT /F1 9.5 Tf 56 ${y} Td ${textoPdf(l)} Tj ET`); y -= 13; }
    y -= 8;
  }
  const conteudo = corpo.join('\n');
  // o selo: a aparência do campo da assinatura
  const linhas = [['F2', 10.5, `Assinado digitalmente por ${selo.nome}`], ['F1', 9.5, `CNPJ ${selo.cnpj}${selo.responsavel ? ` · responsável: ${selo.responsavel}` : ''}`],
    ['F1', 9.5, `Data e hora: ${dataBr} (horário de Brasília)`], ['F1', 9.5, `Certificado ICP-Brasil${selo.emissor ? ` emitido por ${selo.emissor}` : ''}`]];
  const [larg, alt] = [L - 112, 74];
  const rect = [56, y - alt - 6, 56 + larg, y - 6];
  const corpoAparencia = [`q 0.95 0.97 1 rg 0 0 ${larg} ${alt} re f 0.12 0.23 0.54 RG 1 w 0.5 0.5 ${larg - 1} ${alt - 1} re S Q`,
    `BT 0.12 0.23 0.54 rg 12 ${alt - 20} Td`, ...linhas.map(([f, t, l], i) => `${i ? '0 -15 Td ' : ''}/${f} ${t} Tf ${textoPdf(l)} Tj`), 'ET'].join('\n');
  const fontes = `<< /F1 ${nFonte} 0 R /F2 ${nNegrito} 0 R >>`;
  const objetos = [];
  objetos.push([nFonte, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
  objetos.push([nNegrito, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
  objetos.push([nAparencia, `<< /Type /XObject /Subtype /Form /BBox [0 0 ${larg} ${alt}] /Resources << /Font ${fontes} >> /Length ${Buffer.byteLength(corpoAparencia, 'latin1')} >>\nstream\n${corpoAparencia}\nendstream`]);
  objetos.push([nCampo, `<< /Type /Annot /Subtype /Widget /FT /Sig /T ${textoPdf('Assinatura da empresa')} /V ${nAssin} 0 R /P ${nPagina} 0 R /Rect [${rect.join(' ')}] /F 132 /AP << /N ${nAparencia} 0 R >> >>`]);
  const zeros = '0'.repeat(LARGURA_NUMERO);
  objetos.push([nAssin, `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 ${zeros} ${zeros} ${zeros}] /Contents <${'0'.repeat(ESPACO_ASSINATURA * 2)}> /M ${textoPdf(dataPdf(quando))} /Name ${textoPdf(selo.nome)} /Reason ${textoPdf(selo.motivo || 'Documento emitido e assinado pela empresa')}${selo.local ? ` /Location ${textoPdf(selo.local)}` : ''} >>`]);
  objetos.push([nConteudo, `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`]);
  objetos.push([nPagina, `<< /Type /Page /Parent ${arv.n} 0 R /MediaBox [0 0 ${L} ${H}] /Resources << /Font ${fontes} >> /Contents ${nConteudo} 0 R /Annots [${nCampo} 0 R] >>`]);
  objetos.push([arv.n, comEntrada(arv.dic, 'Kids', `${nPagina} 0 R`).replace(/\/Count\s+\d+/, `/Count ${arv.count + 1}`)]);
  objetos.push([tr.root, `<<${cat.slice(2, -2)} /AcroForm << /Fields [${nCampo} 0 R] /SigFlags 3 >> >>`]);
  // monta a atualização: os objetos, a tabela de referências (só deles) e o trailer apontando para a anterior
  let atual = base.length;
  const partes = [base.at(-1) === 0x0a ? '' : '\n'];
  atual += partes[0].length;
  const offsets = [];
  for (const [n, corpo] of objetos) {
    const bloco = `${n} 0 obj\n${corpo}\nendobj\n`;
    offsets.push([n, atual]);
    partes.push(bloco);
    atual += Buffer.byteLength(bloco, 'latin1');
  }
  const inicioXref = atual;
  const linhasXref = ['xref', '0 1', '0000000000 65535 f '];
  for (const [n, off] of offsets.sort((a, b) => a[0] - b[0])) linhasXref.push(`${n} 1`, `${String(off).padStart(10, '0')} 00000 n `);
  partes.push(`${linhasXref.join('\n')}\ntrailer\n<< /Size ${tr.size + 7} /Root ${tr.root} 0 R${tr.info ? ` /Info ${tr.info} 0 R` : ''}${tr.id ? ` /ID ${tr.id}` : ''} /Prev ${tr.startxref} >>\nstartxref\n${inicioXref}\n%%EOF\n`);
  const pdf = Buffer.concat([base, doTexto(partes.join(''))]);
  // /ByteRange: tudo menos o "<…>" do /Contents
  const t2 = latin1(pdf);
  const marca = t2.lastIndexOf('/Contents <');
  const inicio = marca + '/Contents '.length;
  const fim = t2.indexOf('>', inicio) + 1;
  const br = [0, inicio, fim, pdf.length - fim].map((x) => String(x).padStart(LARGURA_NUMERO, '0'));
  const posBr = t2.lastIndexOf(`/ByteRange [0 ${zeros} ${zeros} ${zeros}]`);
  pdf.write(`/ByteRange [0 ${br[1]} ${br[2]} ${br[3]}]`, posBr, 'latin1');
  return { pdf, aAssinar: Buffer.concat([pdf.subarray(0, inicio), pdf.subarray(fim)]), inicio, fim };
}

/** Põe a assinatura (DER) no espaço reservado. Ex.: assinatura de 6 KB num espaço de 30 KB → o resto fica com zeros. */
export function inserirAssinatura({ pdf, inicio, fim }, der) {
  const hex = Buffer.from(der).toString('hex');
  if (hex.length > fim - inicio - 2) throw new Error('A assinatura não coube no espaço reservado do PDF.');
  const final = Buffer.from(pdf);
  final.write(`<${hex.padEnd(fim - inicio - 2, '0')}>`, inicio, 'latin1');
  return final;
}

// ---------------------------------------------------------------------------
// Windows: o certificado (.pfx) e a assinatura CMS
// ---------------------------------------------------------------------------
function powershell(script, entrada) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { input: entrada, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) {
    const msg = String(r.stderr || r.error?.message || '').trim();
    if (/senha|password|incorreta|incorrect/i.test(msg)) throw new Error('A senha do certificado não confere.');
    throw new Error(`O Windows não conseguiu usar o certificado (${msg.slice(0, 300)}).`);
  }
  return r.stdout.trim();
}

// carrega o .pfx (o certificado com a chave e a cadeia que vier junto) sem gravar a chave no Windows
const PS_CERTIFICADO = `$j = [Console]::In.ReadToEnd() | ConvertFrom-Json; Add-Type -AssemblyName System.Security;
$col = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection;
$col.Import([Convert]::FromBase64String($j.pfx), $j.senha, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable);
$cert = $col | Where-Object { $_.HasPrivateKey } | Select-Object -First 1;
if (-not $cert) { throw 'O arquivo nao tem a chave privada do certificado.' }`;

/** Dados do certificado: { nome, cnpj, titular (o "CN" inteiro), validade (AAAA-MM-DD), emissor }. ``pfx``: Buffer ou base64. */
export function dadosDoCertificado(pfx, senha) {
  const saida = powershell(`${PS_CERTIFICADO}
[pscustomobject]@{ titular = $cert.GetNameInfo('SimpleName', $false); emissor = $cert.GetNameInfo('SimpleName', $true); validade = $cert.NotAfter.ToString('yyyy-MM-dd'); inicio = $cert.NotBefore.ToString('yyyy-MM-dd') } | ConvertTo-Json -Compress`,
  JSON.stringify({ pfx: Buffer.isBuffer(pfx) ? pfx.toString('base64') : pfx, senha }));
  const x = JSON.parse(saida);
  // e-CNPJ ICP-Brasil: "RAZAO SOCIAL:12345678000199"
  const [nome, numeros] = String(x.titular).split(':');
  const cnpj = /^\d{14}$/.test(numeros || '') ? numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '';
  return { nome: (nome || x.titular).trim(), cnpj, titular: x.titular, emissor: x.emissor, validade: x.validade, inicio: x.inicio };
}

/** Assinatura CMS destacada (DER) de ``conteudo`` com o certificado: SHA-256, cadeia junto e a hora da assinatura. */
export function assinarCms(conteudo, { pfx, senha, quando = new Date() }) {
  const b64 = powershell(`${PS_CERTIFICADO}
$ci = New-Object System.Security.Cryptography.Pkcs.ContentInfo(,[Convert]::FromBase64String($j.conteudo));
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms($ci, $true);
$s = New-Object System.Security.Cryptography.Pkcs.CmsSigner($cert);
$s.DigestAlgorithm = New-Object System.Security.Cryptography.Oid('2.16.840.1.101.3.4.2.1');
$s.IncludeOption = [System.Security.Cryptography.X509Certificates.X509IncludeOption]::WholeChain;
foreach ($c in $col) { if ($c.Thumbprint -ne $cert.Thumbprint) { [void]$s.Certificates.Add($c) } }
[void]$s.SignedAttributes.Add((New-Object System.Security.Cryptography.Pkcs.Pkcs9SigningTime([DateTime]::Parse($j.quando).ToUniversalTime())));
$cms.ComputeSignature($s, $true);
[Convert]::ToBase64String($cms.Encode())`,
  JSON.stringify({ pfx: Buffer.isBuffer(pfx) ? pfx.toString('base64') : pfx, senha, conteudo: Buffer.from(conteudo).toString('base64'), quando: quando.toISOString() }));
  return Buffer.from(b64, 'base64');
}

/** O PDF assinado: prepara, assina com o certificado e põe a assinatura. ``selo`` sem nome/cnpj usa os do certificado. */
export function assinarPdf(original, { pfx, senha, selo = {}, quando = new Date(), dados = null }) {
  const cert = dados || dadosDoCertificado(pfx, senha);
  const prep = prepararPdf(original, { nome: cert.nome, cnpj: cert.cnpj, emissor: cert.emissor, ...selo, quando });
  return inserirAssinatura(prep, assinarCms(prep.aAssinar, { pfx, senha, quando }));
}
