// Compactação automática dos anexos (decisão do dono em 2026-11-16, documentacao/DECISOES.md; regra `compactar_anexos`).
// Ao anexar (armazenamento.js, `salvarArquivo`) e no botão do administrador para os que já estão no sistema (Dados e backup):
// - foto (JPG, PNG, WEBP; HEIC se o navegador abrir): lado maior até 2000 px, JPEG qualidade 0,8 (a rotação da câmera é aplicada);
// - PDF escaneado (todas as páginas são imagem, sem texto): cada página vira um JPEG menor, num PDF novo;
// - PDF com texto (gerado por sistema, banco, Word) fica como está; PDF com assinatura digital ou protegido NUNCA é mexido
//   (quebraria a assinatura e a conferência de conferir-pdf.js). Na dúvida, não mexe. O original não é guardado.
// Documentos que a pessoa manda pelo link da ficha: compactados depois que chegam, quando a equipe abre a ficha, logo depois
// da conferência (que olha dentro do arquivo como ele chegou e fica guardada na ficha, `fichas.conferencias_link`; telas/fichas.js).
// Só troca quando o arquivo fica bem menor (GANHO_MINIMO). Nunca lança erro: se algo falhar, fica o arquivo como chegou.
// As partes puras (tipo pelos bytes, medidas, montar o PDF) rodam no Node (tests/compactar.test.mjs); o resto precisa de canvas.
import { pdfTemAssinatura } from './conferir-pdf.js';

export const LADO_MAXIMO = 2000;
export const QUALIDADE_FOTO = 0.8;
export const QUALIDADE_PDF = 0.75;
/** Página de PDF desenhada até este tanto de pontos por polegada (A4 a 2000 px no lado maior dá ~170). */
export const DPI_MAXIMO = 200;
/** Só troca se o novo tiver até 85% do tamanho do original (ganho de 15% ou mais). */
export const GANHO_MINIMO = 0.85;
/** Arquivo menor que isto não vale o trabalho. */
export const MINIMO_FOTO = 200 * 1024;
export const MINIMO_PDF = 300 * 1024;
const MAX_PAGINAS = 80;

/** Tipo pelo começo do arquivo (não pelo nome): 'jpg', 'png', 'webp', 'heic', 'gif', 'pdf' ou null. */
export function tipoPelosBytes(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  const s = (i, n) => String.fromCharCode(...b.slice(i, i + n));
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'webp';
  if (s(0, 3) === 'GIF') return 'gif';
  if (s(4, 4) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(s(8, 4))) return 'heic';
  return null;
}

/** Medidas reduzidas mantendo a proporção (nunca aumenta). Ex.: 4000×3000 → 2000×1500; 1200×900 → igual. */
export function medidasReduzidas(largura, altura, maximo = LADO_MAXIMO) {
  const escala = Math.min(1, maximo / Math.max(largura, altura, 1));
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)), escala };
}

/** Troca a extensão do nome. Ex.: ('RG frente.PNG', '.jpg') → 'RG frente.jpg'; sem extensão, acrescenta. */
export function trocarExtensao(nome, ext) {
  const p = nome.lastIndexOf('.');
  return `${p > 0 ? nome.slice(0, p) : nome}${ext}`;
}

/** Vale trocar? O novo precisa existir e ter até GANHO_MINIMO do tamanho do original. */
export const compensa = (antes, depois) => depois > 0 && depois <= antes * GANHO_MINIMO;

const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const num = (x) => (Math.round(x * 100) / 100).toString();

/**
 * PDF novo, uma imagem JPEG por página (o que se faz com o PDF escaneado). `paginas`: [{ largura, altura (em pontos,
 * 1/72 de polegada), px, py (pixels do JPEG), jpeg: Uint8Array }]. Devolve os bytes do PDF (Uint8Array).
 */
export function montarPdfDeImagens(paginas) {
  const enc = new TextEncoder();
  const partes = [];
  let pos = 0;
  const offsets = [];
  const por = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; partes.push(b); pos += b.length; };
  const objeto = (n, corpo, fluxo) => {
    offsets[n] = pos;
    por(`${n} 0 obj\n${corpo}\n`);
    if (fluxo) { por('stream\n'); por(fluxo); por('\nendstream\n'); }
    por('endobj\n');
  };
  por(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // "%PDF-1.4\n%âãÏÓ\n"
  const n = paginas.length;
  // 1 catálogo, 2 páginas; cada página usa 3 objetos (página, imagem, conteúdo)
  const kids = paginas.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objeto(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  paginas.forEach((p, i) => {
    const pg = 3 + i * 3; const im = pg + 1; const ct = pg + 2;
    const w = num(p.largura); const h = num(p.altura);
    objeto(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
    objeto(im, `<< /Type /XObject /Subtype /Image /Width ${p.px} /Height ${p.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`, p.jpeg);
    const conteudo = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    objeto(ct, `<< /Length ${conteudo.length} >>`, conteudo);
  });
  const total = 3 + n * 3;
  const xref = pos;
  let tabela = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i += 1) tabela += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  por(`${tabela}trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(pos);
  let o = 0;
  for (const b of partes) { out.set(b, o); o += b.length; }
  return out;
}

// --------------------------------------------------------------------------
// No navegador (canvas)
// --------------------------------------------------------------------------
const temCanvas = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

function emBlob(canvas, tipo, qualidade) {
  return new Promise((ok) => { canvas.toBlob((b) => ok(b), tipo, qualidade); });
}

function telaBranca(largura, altura) {
  const cv = document.createElement('canvas');
  cv.width = largura; cv.height = altura;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; // PNG com fundo transparente: no JPEG o fundo seria preto
  g.fillRect(0, 0, largura, altura);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  return { cv, g };
}

/** Abre a foto já virada como a câmera mandou (EXIF). */
async function abrirFoto(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* tenta pela <img> */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error('foto não abre')); i.src = url; });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
}

/**
 * Foto menor (Blob) ou null se não compensa. `saida`: 'jpg' (anexo novo) ou o próprio formato (os que já estão no sistema
 * mantêm o nome: PNG continua PNG, e só ganha se a foto for maior que LADO_MAXIMO).
 */
export async function compactarFoto(blob, tipo, saida = 'jpg') {
  const img = await abrirFoto(blob);
  try {
    const largura = img.naturalWidth || img.width; const altura = img.naturalHeight || img.height;
    const m = medidasReduzidas(largura, altura);
    if (saida === 'png' && m.escala >= 1) return null; // PNG do mesmo tamanho não diminui
    const { cv, g } = telaBranca(m.largura, m.altura);
    g.drawImage(img, 0, 0, m.largura, m.altura);
    const novo = await emBlob(cv, MIME[saida], saida === 'png' ? undefined : QUALIDADE_FOTO);
    cv.width = 0; cv.height = 0;
    return novo && compensa(blob.size, novo.size) ? novo : null;
  } finally { img.close?.(); }
}

async function pdfJs() {
  const V = await import('./visualizador.js');
  return V.carregarPdfJs();
}

/**
 * Aviso na tela enquanto um PDF é compactado (pode levar alguns segundos por página): app.js mostra o texto numa mensagem
 * que se atualiza e some com `fim`. Ex.: 'Compactando "extrato.pdf" (PDF escaneado): página 3 de 10…'.
 */
function avisarAndamento(texto, fim = false, fracao = 0) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  if (lote && !lote.acabou) {
    // compactando todos: o aviso mostra o andamento geral; o arquivo da vez vai no fim (fim de um PDF não fecha o aviso)
    texto = textoDoLote(fim ? '' : texto, fim ? 0 : fracao);
    fim = false;
  }
  window.dispatchEvent(new CustomEvent('compactar-andamento', { detail: { texto, fim } }));
}

/** Andamento de compactarTodos (null fora dele): { feitos, total, compactados, economia }. */
let lote = null;

/** Ex.: 'Compactando os anexos: 45% (135 de 298 arquivos, 12 compactado(s), 80,5 MB a menos)… Agora: página 3 de 10 de "RG.pdf"'. */
export function textoDoLote(detalhe = '', fracao = 0) {
  if (!lote) return detalhe;
  const pct = lote.total ? Math.min(100, Math.floor((100 * (lote.feitos + Math.max(0, Math.min(1, fracao)))) / lote.total)) : 100;
  const mb = `${(lote.economia / 1048576).toFixed(1).replace('.', ',')} MB`;
  return `Compactando os anexos: ${pct}% (${lote.feitos} de ${lote.total} arquivos, ${lote.compactados} compactado(s), ${mb} a menos). Aguarde, não feche esta tela.${detalhe ? ` Agora: ${detalhe}` : ''}`;
}

/**
 * PDF escaneado menor (Blob) ou null (assinado, protegido, com texto, com formulário ou anotações, ou sem ganho).
 * `aoAndar(pagina, total)`: progresso.
 */
export async function compactarPdf(blob, aoAndar = () => {}) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (await pdfTemAssinatura(bytes)) return null; // nunca: assinatura digital ou proteção
  if (typeof location !== 'undefined' && location.protocol === 'file:') return null; // versão PC: sem o leitor de PDF
  const nome = blob.name || 'PDF';
  const lib = await pdfJs();
  const doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  try {
    const { info } = await doc.getMetadata().catch(() => ({ info: {} }));
    if (info && (info.IsSignaturesPresent || info.IsAcroFormPresent || info.IsXFAPresent || info.IsCollectionPresent)) return null;
    if (doc.numPages < 1 || doc.numPages > MAX_PAGINAS) return null;
    const OPS = lib.OPS;
    const imagens = new Set([OPS.paintImageXObject, OPS.paintJpegXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat, OPS.paintInlineImageXObjectGroup].filter((x) => x !== undefined));
    // antes de tudo, o que é rápido: nenhuma página com texto nem anotação (uma com texto e o PDF fica como está)
    avisarAndamento(lote ? `conferindo "${nome}"` : `Conferindo se "${nome}" é um PDF escaneado, para compactar…`);
    for (let i = 1; i <= doc.numPages; i += 1) {
      const p = await doc.getPage(i);
      const t = await p.getTextContent();
      if (t.items.some((x) => x.str && x.str.trim())) return null;
      if ((await p.getAnnotations()).length) return null;
    }
    // cada página: confirma que é imagem e já desenha em JPEG (a leitura das imagens serve às duas coisas)
    const paginas = [];
    let total = 0;
    for (let i = 1; i <= doc.numPages; i += 1) {
      aoAndar(i, doc.numPages);
      avisarAndamento(lote ? `página ${i} de ${doc.numPages} de "${nome}"` : `Compactando "${nome}" (PDF escaneado): página ${i} de ${doc.numPages}… Aguarde, não feche esta tela.`, false, (i - 1) / doc.numPages);
      const p = await doc.getPage(i);
      // "print": o desenho não espera o quadro da tela (com a aba em segundo plano, o modo da tela trava)
      const ops = await p.getOperatorList({ intent: 'print' });
      if (!ops.fnArray.some((f) => imagens.has(f))) return null;
      const um = p.getViewport({ scale: 1 });
      const escala = Math.min(LADO_MAXIMO / Math.max(um.width, um.height), DPI_MAXIMO / 72);
      const vista = p.getViewport({ scale: escala });
      const { cv, g } = telaBranca(Math.max(1, Math.round(vista.width)), Math.max(1, Math.round(vista.height)));
      await p.render({ canvasContext: g, viewport: vista, intent: 'print' }).promise;
      const jpeg = await emBlob(cv, 'image/jpeg', QUALIDADE_PDF);
      if (!jpeg) return null;
      const b = new Uint8Array(await jpeg.arrayBuffer());
      total += b.length;
      if (total > blob.size * GANHO_MINIMO) return null; // já passou do que compensa: para antes de desenhar o resto
      paginas.push({ largura: um.width, altura: um.height, px: cv.width, py: cv.height, jpeg: b });
      cv.width = 0; cv.height = 0;
      p.cleanup();
    }
    const novo = new Blob([montarPdfDeImagens(paginas)], { type: 'application/pdf' });
    return compensa(blob.size, novo.size) ? novo : null;
  } finally {
    avisarAndamento('', true);
    doc.destroy();
  }
}

/** Pasta das fichas em análise (comum.js PASTA_FICHAS). */
export const PASTA_FICHAS = 'Fichas em analise';
const CANDIDATO = /\.(jpe?g|png|webp|heic|pdf)$/i;
/** Arquivo que vale abrir para tentar compactar (pelo nome e tamanho; o conteúdo decide depois). */
export const candidato = (nome, tamanho) => CANDIDATO.test(nome) && tamanho >= (/\.pdf$/i.test(nome) ? MINIMO_PDF : MINIMO_FOTO);
/** Documento mandado pela pessoa no link da ficha (o nome é dado pela nuvem, nuvem/ficha-publica.mjs: "link-..."). */
export const ehDoLink = (nome) => /^link-/.test(nome);

/**
 * Os anexos que já estão no sistema (botão do administrador em Dados e backup): passa por todos dentro de `raiz` (a pasta
 * `arquivos`) e troca no lugar, com o MESMO nome, os que ficam bem menores.
 * Mesmo nome = o lançamento continua apontando para ele e o arquivo impresso não acusa "arquivo trocado".
 * Documento mandado pelo link da ficha só entra depois de conferido (a conferência fica guardada na ficha; antes disso o
 * arquivo precisa ficar como chegou): `conferido(pastaDaFicha, nome)` diz se já foi.
 * `ler(handle)` → File, `gravar(dir, nome, File)`; `aoAndar({ feitos, total, compactados, economia })`.
 * Devolve { vistos, compactados, antes, depois, falhas }.
 */
export async function compactarTodos(raiz, { ler, gravar, compactar = compactarAnexo, conferido = () => false, aoAndar = () => {} }) {
  const lista = [];
  const juntar = async (dir, partes) => {
    for await (const [nome, h] of dir.entries()) {
      if (h.kind === 'directory') { await juntar(h, [...partes, nome]); continue; }
      if (partes[0] === PASTA_FICHAS && ehDoLink(nome) && !conferido(partes[1], nome)) continue;
      const tamanho = h.tamanho ?? (await h.getFile()).size;
      if (candidato(nome, tamanho)) lista.push({ dir, nome, h });
    }
  };
  await juntar(raiz, []);
  const r = { vistos: lista.length, compactados: 0, antes: 0, depois: 0, falhas: 0 };
  // o aviso do topo mostra o andamento geral em % (avisarAndamento); o arquivo da vez vai no fim do texto
  lote = { feitos: 0, total: lista.length, compactados: 0, economia: 0 };
  try {
    for (let i = 0; i < lista.length; i += 1) {
      const { dir, nome, h } = lista[i];
      lote.feitos = i;
      avisarAndamento(`"${nome}"`);
      try {
        const f = await ler(h);
        const c = await compactar(f, { manterNome: true });
        if (c.mudou) {
          await gravar(dir, nome, c.arquivo);
          r.compactados += 1; r.antes += c.antes; r.depois += c.depois;
        }
      } catch (e) {
        r.falhas += 1;
        console.warn(`Compactar "${nome}": ${e.message}`);
      }
      Object.assign(lote, { feitos: i + 1, compactados: r.compactados, economia: r.antes - r.depois });
      aoAndar({ feitos: i + 1, total: lista.length, compactados: r.compactados, economia: r.antes - r.depois });
    }
  } finally {
    lote.acabou = true;
    avisarAndamento('', true);
    lote = null;
  }
  return r;
}

/**
 * Compacta o anexo se compensar. Devolve { arquivo (File: o novo ou o mesmo), antes, depois, mudou }.
 * `manterNome`: os que já estão no sistema (o nome está gravado nos lançamentos): o formato não muda.
 * Anexo novo: a foto vira .jpg (ex.: "RG.png" 3 MB → "RG.jpg" 350 KB). Nunca lança erro.
 */
export async function compactarAnexo(arquivo, { manterNome = false, aoAndar } = {}) {
  const igual = { arquivo, antes: arquivo.size, depois: arquivo.size, mudou: false };
  if (!temCanvas() || !arquivo || !arquivo.size) return igual;
  try {
    const tipo = tipoPelosBytes(new Uint8Array(await arquivo.slice(0, 16).arrayBuffer()));
    let novo = null; let nome = arquivo.name;
    if (tipo === 'pdf') {
      if (arquivo.size < MINIMO_PDF) return igual;
      novo = await compactarPdf(arquivo, aoAndar);
    } else if (['jpg', 'png', 'webp', 'heic'].includes(tipo)) {
      if (arquivo.size < MINIMO_FOTO) return igual;
      const saida = manterNome ? (tipo === 'heic' ? null : tipo) : 'jpg';
      if (!saida) return igual; // HEIC já gravado: o navegador não grava HEIC, e o nome não pode mudar
      novo = await compactarFoto(arquivo, tipo, saida);
      if (novo && !manterNome && tipo !== 'jpg') nome = trocarExtensao(nome, '.jpg');
    }
    if (!novo) return igual;
    return { arquivo: new File([novo], nome, { type: novo.type }), antes: arquivo.size, depois: novo.size, mudou: true };
  } catch (e) {
    console.warn(`Compactação de "${arquivo.name}" não feita: ${e.message}`);
    return igual;
  }
}
