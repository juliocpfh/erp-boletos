// Conferência dos documentos da ficha (pedido do dono em 2026-11-14, depois de várias fichas com extratos e assinaturas
// falsos): olha "por dentro" do arquivo, sem mudar nada nele.
// - Programa que gerou ou alterou o PDF (Producer/Creator do PDF e do XMP): extrato ou holerite feito num editor (Canva,
//   iLovePDF, Word...) em vez do aplicativo do banco ou do sistema do empregador é sinal de alerta, não prova.
// - Alterado depois de criado (data de alteração bem depois da de criação; partes acrescentadas ao arquivo sem assinatura).
// - Assinatura digital: quem assinou (nome do certificado), quando, e se o certificado é do gov.br ou da ICP-Brasil.
// Funções puras (Node e navegador; tests/conferir-pdf.test.mjs). Só avisa: quem decide é a equipe.

/** Programas de edição: o documento foi montado ou mexido por um editor (o banco e o empregador não usam esses). */
const EDITORES = /canva|ilovepdf|smallpdf|sejda|pdfescape|pdfelement|wondershare|pdf24|pdf-xchange|nitro|foxit (phantom|pdf editor)|photoshop|gimp|inkscape|pixelmator|soda ?pdf|pdffiller|dochub|online2pdf|pdf ?candy|pdfsam|pdf editor|corel|affinity|paint\.net|gerador|fake|acrobat (pro|standard|dc)|pdf expert|xodo|lightpdf|pdfgear|pdf2go|hipdf|sodapdf|libreoffice draw/i;
/** Programas de escritório: holerite de empresa pequena pode sair daqui; extrato de banco, não. */
const ESCRITORIO = /microsoft.*(word|excel|powerpoint)|libreoffice|openoffice|google docs|wps office|pages|keynote|numbers/i;
/** Impressão de página (navegador, "imprimir como PDF"): comum no extrato tirado do site do banco; vale olhar com calma. */
const IMPRESSAO = /skia\/pdf|chrom|microsoft: print to pdf|quartz pdfcontext|mac os x .*quartz|cairo|wkhtmltopdf|safari|firefox/i;

const latin = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]); return s; };

/** Texto de uma string do PDF: (literal com escapes) ou <hex>, inclusive UTF-16 (BOM FE FF). */
export function textoDoPdf(bruto) {
  let b = [];
  const t = String(bruto || '').trim();
  if (t.startsWith('<') && !t.startsWith('<<')) {
    const h = t.slice(1, t.indexOf('>') > 0 ? t.indexOf('>') : undefined).replace(/\s+/g, '');
    for (let i = 0; i < h.length; i += 2) b.push(parseInt(h.slice(i, i + 2).padEnd(2, '0'), 16));
  } else {
    const s = t.startsWith('(') ? t.slice(1, t.lastIndexOf(')') > 0 ? t.lastIndexOf(')') : undefined) : t;
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      if (c !== '\\') { b.push(s.charCodeAt(i) & 0xff); continue; }
      const n = s[i + 1];
      i += 1;
      if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1])) { i += 1; o += s[i]; } b.push(parseInt(o, 8) & 0xff); }
      else b.push({ n: 10, r: 13, t: 9, b: 8, f: 12 }[n] ?? n.charCodeAt(0));
    }
  }
  if (b[0] === 0xfe && b[1] === 0xff) { let s = ''; for (let i = 2; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s.trim(); }
  return new TextDecoder('latin1').decode(new Uint8Array(b)).trim();
}

/** Data do PDF ("D:20261110143000-03'00'") em ISO, ou null. */
export function dataDoPdf(t) {
  const x = String(t || '');
  const iso = x.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/); // XMP
  if (iso) { const [, a, me, d, h = '00', mi = '00', s = '00'] = iso; return `${a}-${me}-${d}T${h}:${mi}:${s}`; }
  const m = x.match(/(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return null;
  const [, a, me = '01', d = '01', h = '00', mi = '00', s = '00'] = m;
  return `${a}-${me}-${d}T${h}:${mi}:${s}`;
}

/** Valor de uma chave do dicionário (/Producer (…) ou /Producer <…>) num trecho do PDF. */
function chaveDoPdf(texto, chave) {
  const re = new RegExp(`/${chave}\\s*(\\((?:\\\\.|[^\\\\)])*\\)|<[0-9A-Fa-f\\s]*>)`, 'g');
  const out = [];
  for (let m = re.exec(texto); m; m = re.exec(texto)) out.push(textoDoPdf(m[1]));
  return out;
}

/** Trechos comprimidos (FlateDecode) abertos: os metadados e as assinaturas podem estar dentro deles. */
async function abrirTrechos(bytes, texto, limite = 4 * 1024 * 1024) {
  if (typeof DecompressionStream === 'undefined') return '';
  const out = [];
  let total = 0;
  // sem "olhar para trás" na expressão (o Safari antes do 16.4 não abria o sistema por causa dela): o "stream" de "endstream" é pulado à mão
  const re = /stream\r?\n/g;
  for (let m = re.exec(texto); m && total < limite; m = re.exec(texto)) {
    if (m.index >= 3 && texto.slice(m.index - 3, m.index) === 'end') continue;
    const ini = m.index + m[0].length;
    let fim = texto.indexOf('endstream', ini);
    if (fim < 0) break;
    const depois = fim;
    while (fim > ini && /[\r\n]/.test(texto[fim - 1])) fim -= 1; // o fim de linha antes de "endstream" não é do trecho
    const antes = texto.slice(Math.max(0, m.index - 300), m.index);
    // só os trechos de objetos (ObjStm) e de metadados: imagens e páginas não interessam
    if (!/\/FlateDecode/.test(antes) || !/\/(ObjStm|Metadata|XRef)|\/Type\s*\/Metadata/.test(antes)) { re.lastIndex = depois; continue; }
    try {
      const ds = new DecompressionStream('deflate');
      const w = ds.writable.getWriter();
      w.write(bytes.slice(ini, fim)).catch(() => {});
      w.close().catch(() => {});
      const buf = new Uint8Array(await new Response(ds.readable).arrayBuffer());
      total += buf.length;
      out.push(latin(buf));
    } catch { /* trecho que não abre: segue */ }
    re.lastIndex = depois;
  }
  return out.join('\n');
}

/** Nomes (CN) dos certificados dentro da assinatura (DER em hexadecimal no /Contents). */
function nomesDoCertificado(hex) {
  const h = String(hex || '').replace(/[^0-9a-f]/gi, '').toLowerCase();
  const nomes = [];
  // 06 03 55 04 03 = OID 2.5.4.3 (commonName); depois vem o tipo da string (0c UTF8, 13 Printable, 1e BMP) e o tamanho
  for (let i = h.indexOf('0603550403'); i >= 0; i = h.indexOf('0603550403', i + 10)) {
    const tipo = h.slice(i + 10, i + 12);
    const tam = parseInt(h.slice(i + 12, i + 14), 16);
    if (!tam || tam > 120) continue;
    const bytes = h.slice(i + 14, i + 14 + tam * 2).match(/../g) || [];
    const b = Uint8Array.from(bytes.map((x) => parseInt(x, 16)));
    const nome = tipo === '1e' ? String.fromCharCode(...Array.from({ length: b.length / 2 }, (_, k) => (b[2 * k] << 8) | b[2 * k + 1])) : new TextDecoder().decode(b);
    if (nome && !nomes.includes(nome)) nomes.push(nome);
  }
  return nomes;
}
/** Nome de autoridade certificadora (quem emite), não de pessoa. */
const ehAutoridade = (c) => /\b(AC|autoridade|raiz|root|CA)\b|certifica|governo federal|icp-brasil/i.test(c);
const textoDoHex = (hex) => { const h = String(hex || '').replace(/[^0-9a-f]/gi, ''); let s = ''; for (let i = 0; i + 1 < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16)); return s; };

/** Assinaturas digitais do PDF: [{ nome, data, govbr, icp, certificados: [CN...] }]. */
async function assinaturas(texto) {
  const out = [];
  const re = /\/Type\s*\/Sig\b|\/ByteRange\s*\[/g;
  const vistos = new Set();
  for (let m = re.exec(texto); m; m = re.exec(texto)) {
    // o dicionário da assinatura: do "<<" antes até o ">>" que fecha, com o /Contents <hex> (pode ser grande)
    const ini = texto.lastIndexOf('<<', m.index);
    // o /Contents pode vir antes ou depois do /Type /Sig (cada programa escreve numa ordem): o mais perto dentro do objeto
    const obj = Math.max(texto.lastIndexOf(' obj', m.index), 0);
    const fimObj = texto.indexOf('endobj', m.index);
    const trecho = texto.slice(obj, fimObj < 0 ? m.index + 200000 : fimObj);
    const rel = trecho.indexOf('/Contents');
    const contents = rel < 0 ? -1 : obj + rel;
    if (contents < 0) continue;
    const abre = texto.indexOf('<', contents + 9);
    const fecha = texto.indexOf('>', abre + 1);
    if (abre < 0 || fecha < 0 || vistos.has(abre)) continue;
    vistos.add(abre);
    const hex = texto.slice(abre + 1, fecha);
    const dic = texto.slice(ini, Math.min(texto.length, Math.max(fecha + 400, m.index + 400)));
    const certs = nomesDoCertificado(hex);
    // gov.br: certificado emitido pela "AC Final do Governo Federal do Brasil" (o texto "gov.br" aparece em qualquer
    // certificado da ICP-Brasil, nos endereços). ICP-Brasil: emissor com "ICP-Brasil" ou AC conhecida da ICP.
    // Sem conferir a cadeia de certificados, isto é indício: a confirmação é no validar.iti.gov.br.
    const emissores = certs.filter(ehAutoridade);
    const govbr = emissores.some((c) => /governo federal do brasil/i.test(c));
    const icp = !govbr && emissores.some((c) => /icp-brasil|serasa|certisign|soluti|valid|serpro|safeweb|digitalsign|caixa|receita federal|\brfb\b/i.test(c));
    const pessoa = certs.find((c) => !ehAutoridade(c)) || '';
    // o nome vem do certificado; o /Name do PDF é texto livre (qualquer programa escreve): só sem certificado legível
    const nome = (pessoa.replace(/:\d{11,14}$/, '') || chaveDoPdf(dic, 'Name')[0] || '').trim();
    out.push({ nome, data: dataDoPdf(chaveDoPdf(dic, 'M')[0]), govbr, icp, certificados: certs, fim: fecha });
  }
  return out;
}

/**
 * Confere um arquivo (bytes de PDF, JPG ou PNG). Devolve { tipo, programa, criado, alterado, sinais: [{ nivel, texto }], assinaturas }.
 * nivel: 'alerta' (editor de PDF/imagem), 'atencao' (escritório, alterado depois) ou 'info' (impressão de página).
 * Ex.: extrato feito no Canva → sinais [{ nivel: 'alerta', texto: 'Feito ou alterado no programa "Canva"...' }].
 */
export async function conferirArquivo(entrada) {
  const bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  const sinais = [];
  if (bytes[0] === 0xff && bytes[1] === 0xd8 || bytes[0] === 0x89 && bytes[1] === 0x50) {
    // foto: o programa fica nos metadados (EXIF "Software", XMP "CreatorTool")
    const t = latin(bytes.slice(0, 256 * 1024));
    const prog = (t.match(/(Adobe Photoshop[^\0<]{0,40}|GIMP[^\0<]{0,20}|Canva|Pixelmator[^\0<]{0,20}|Snapseed|PicsArt|Lightroom[^\0<]{0,20})/i) || [])[1] || '';
    if (prog) sinais.push({ nivel: 'alerta', texto: `Foto passou pelo programa "${prog.trim()}" (edição de imagem). Peça o documento original.` });
    return { tipo: bytes[0] === 0xff ? 'jpg' : 'png', programa: prog.trim(), criado: null, alterado: null, sinais, assinaturas: [] };
  }
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return { tipo: null, programa: '', criado: null, alterado: null, sinais: [{ nivel: 'atencao', texto: 'Não é PDF nem foto.' }], assinaturas: [] };
  const texto = latin(bytes);
  // os trechos comprimidos sempre: um editor que salva por cima (ex.: Acrobat) põe o nome dele lá dentro, e o do banco fica aberto
  const dentro = await abrirTrechos(bytes, texto);
  const tudo = `${texto}\n${dentro}`;
  const xmp = (re) => (tudo.match(re) || [])[1] || '';
  const produtor = [...chaveDoPdf(tudo, 'Producer'), xmp(/<pdf:Producer>([^<]+)</)].filter(Boolean);
  const criador = [...chaveDoPdf(tudo, 'Creator'), xmp(/<xmp:CreatorTool>([^<]+)</)].filter(Boolean);
  const programas = [...new Set([...criador, ...produtor].map((x) => x.trim()).filter(Boolean))];
  const criado = dataDoPdf(chaveDoPdf(tudo, 'CreationDate')[0] || xmp(/<xmp:CreateDate>([^<]+)</));
  const alterado = dataDoPdf(chaveDoPdf(tudo, 'ModDate')[0] || xmp(/<xmp:ModifyDate>([^<]+)</));
  const editor = programas.find((p) => EDITORES.test(p));
  const escritorio = programas.find((p) => ESCRITORIO.test(p));
  const impressao = programas.find((p) => IMPRESSAO.test(p));
  if (editor) sinais.push({ nivel: 'alerta', texto: `Feito ou alterado no programa "${editor}" (editor de PDF ou de imagem). Extrato e holerite saem do aplicativo do banco ou do sistema do empregador: peça o arquivo original e confira com a fonte.` });
  else if (escritorio) sinais.push({ nivel: 'atencao', texto: `Feito no programa "${escritorio}" (editor de texto ou planilha). Holerite de empresa pequena pode sair assim; extrato de banco, não. Confira com a fonte.` });
  else if (impressao) sinais.push({ nivel: 'info', texto: `PDF "impresso" de uma página (${impressao}). Comum no extrato tirado do site do banco; confira o valor com a fonte.` });
  const sig = await assinaturas(texto + (dentro ? `\n${dentro}` : ''));
  // alterado bem depois de criado (mais de 1 dia): sinal de mexida; documento assinado muda a data na assinatura (normal)
  if (criado && alterado && !sig.length && Date.parse(alterado) - Date.parse(criado) > 86400000) {
    sinais.push({ nivel: 'info', texto: `Alterado em ${alterado.slice(8, 10)}/${alterado.slice(5, 7)}/${alterado.slice(0, 4)}, depois de criado em ${criado.slice(8, 10)}/${criado.slice(5, 7)}/${criado.slice(0, 4)}.` });
  }
  // partes acrescentadas ao arquivo (atualização incremental) sem assinatura: alguém salvou o PDF de novo por cima
  // não contam: o arquivo "para a web" (linearizado, nasce com dois %%EOF) e o que vem depois da última assinatura (dados de validação)
  const posicoes = [...texto.matchAll(/%%EOF/g)].map((x) => x.index);
  const ultimaAssinatura = sig.length ? Math.max(...sig.map((s) => s.fim)) : -1;
  const linearizado = /\/Linearized\b/.test(texto.slice(0, 2048)) ? 1 : 0;
  // assinado: antes do fim da última assinatura há o %%EOF do original e um de cada assinatura anterior (= número de assinaturas)
  const extras = sig.length ? posicoes.filter((p) => p < ultimaAssinatura).length - linearizado - sig.length : posicoes.length - 1 - linearizado;
  if (extras > 0 && !editor) sinais.push({ nivel: 'atencao', texto: `O arquivo foi salvo de novo ${extras} vez(es) depois de gerado.` });
  return { tipo: 'pdf', programa: programas.join(' · '), criado, alterado, sinais, assinaturas: sig.map(({ fim, ...s }) => s) };
}

/** Nome sem acento, em minúsculas e sem espaços repetidos, para comparar quem assinou com o nome da ficha. */
export const nomeComparavel = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** A assinatura é da pessoa? Todas as palavras do nome da ficha (sem "de", "da"...) estão no nome do certificado, ou o contrário. */
export function mesmoNome(a, b) {
  const pal = (t) => nomeComparavel(t).split(' ').filter((p) => p.length > 2 && !['das', 'dos', 'del'].includes(p));
  const x = pal(a); const y = pal(b);
  if (!x.length || !y.length) return false;
  const comuns = x.filter((p) => y.includes(p)).length;
  // pelo menos duas palavras em comum (uma só vale apenas quando os dois nomes têm uma palavra) e todas as do mais curto
  return comuns >= (x.length === 1 && y.length === 1 ? 1 : 2) && (x.every((p) => y.includes(p)) || y.every((p) => x.includes(p)));
}
