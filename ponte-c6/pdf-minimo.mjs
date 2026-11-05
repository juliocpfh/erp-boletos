// Gerador de PDF mínimo, sem dependências: uma página A4, fonte Helvetica, só texto.
// Serve para o "comprovante gerado pela ponte" (lançamento do extrato) e para o PDF fictício do modo simulado.
// Uso: gerarPdf({ titulo: 'Comprovante', linhas: ['Data: 05/11/2026', ...] }) → Buffer começando com "%PDF-1.4".
// Acentos funcionam (WinAnsiEncoding = latin1); caracteres fora do latin1 viram "?".

const LARGURA = 595; // A4 em pontos
const ALTURA = 842;
const MARGEM = 56;

/** Escapa o texto para dentro de "( … )" no fluxo de conteúdo do PDF. */
const escapar = (texto) => String(texto).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r?\n/g, ' ');

/** Quebra uma linha longa em pedaços de até `max` caracteres, nas palavras. */
function quebrar(texto, max) {
  const palavras = String(texto).split(/\s+/);
  const saida = [];
  let atual = '';
  for (const p of palavras) {
    if (atual && (atual + ' ' + p).length > max) { saida.push(atual); atual = p; }
    else atual = atual ? `${atual} ${p}` : p;
    while (atual.length > max) { saida.push(atual.slice(0, max)); atual = atual.slice(max); }
  }
  if (atual) saida.push(atual);
  return saida.length ? saida : [''];
}

/**
 * @param {{ titulo?: string, subtitulo?: string, linhas?: string[], rodape?: string, tamanho?: number }} opcoes
 * @returns {Buffer}
 */
export function gerarPdf({ titulo = '', subtitulo = '', linhas = [], rodape = '', tamanho = 11 } = {}) {
  const entrelinha = tamanho * 1.5;
  const maxChars = Math.floor((LARGURA - 2 * MARGEM) / (tamanho * 0.5));
  let y = ALTURA - MARGEM;
  const partes = ['BT'];
  const escrever = (texto, fonte, tam) => {
    partes.push(`/${fonte} ${tam} Tf 1 0 0 1 ${MARGEM} ${y.toFixed(1)} Tm (${escapar(texto)}) Tj`);
    y -= tam * 1.5;
  };
  if (titulo) { escrever(titulo, 'F2', tamanho + 7); y -= 4; }
  if (subtitulo) { escrever(subtitulo, 'F1', tamanho); y -= entrelinha / 2; }
  for (const linha of linhas) {
    if (y < MARGEM + entrelinha * 3) break; // uma página só: o que não cabe é cortado
    for (const pedaco of quebrar(linha, maxChars)) escrever(pedaco, 'F1', tamanho);
  }
  if (rodape) {
    y = MARGEM;
    escrever(rodape, 'F1', tamanho - 2);
  }
  partes.push('ET');
  const conteudo = Buffer.from(partes.join('\n'), 'latin1');

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA} ${ALTURA}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
    Buffer.concat([Buffer.from(`<< /Length ${conteudo.length} >>\nstream\n`, 'latin1'), conteudo, Buffer.from('\nendstream', 'latin1')]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];

  const pedacos = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const posicoes = [];
  let tamanhoTotal = pedacos[0].length;
  objetos.forEach((obj, i) => {
    posicoes.push(tamanhoTotal);
    const corpo = Buffer.isBuffer(obj) ? obj : Buffer.from(obj, 'latin1');
    const pedaco = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), corpo, Buffer.from('\nendobj\n', 'latin1')]);
    pedacos.push(pedaco);
    tamanhoTotal += pedaco.length;
  });
  const xref = [`xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`, ...posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`)].join('');
  pedacos.push(Buffer.from(`${xref}trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${tamanhoTotal}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(pedacos);
}

/** Texto visível de um PDF gerado aqui (só para testes: junta o que está entre parênteses nos "Tj"). */
export function textoDoPdf(buffer) {
  const s = Buffer.from(buffer).toString('latin1');
  return [...s.matchAll(/\((.*?)(?<!\\)\) Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1')).join('\n');
}
