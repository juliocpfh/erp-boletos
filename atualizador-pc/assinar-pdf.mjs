// Assinatura digital dos PDFs com o certificado A1 da empresa (e-CNPJ ICP-Brasil), no programa do PC (pedido do dono de
// 21/11/2026: o certificado fica guardado só neste computador, cifrado pelo Windows, e assina sozinho os documentos que o
// site põe na fila). Sem biblioteca de fora:
// - a parte do PDF é JavaScript puro (roda em qualquer sistema, tests/assinar-pdf.test.mjs): uma "atualização incremental"
//   no fim do arquivo (o PDF original fica intacto) com uma página final de assinatura (logo, quadro com os dados do
//   certificado, o resumo SHA-256 do original e como conferir), o selo "Assinado digitalmente por …" na linha de assinatura
//   da empresa que o site marcou (24/11/2026) e o espaço reservado para a assinatura (/Contents), no padrão adbe.pkcs7.detached;
// - a assinatura em si (CMS/PKCS#7 destacada, SHA-256, com a cadeia do certificado e a hora) é feita pelo próprio Windows
//   (PowerShell, System.Security.Cryptography.Pkcs): o .pfx e a senha vão pela entrada padrão, nunca na linha de comando.
// Quem confere: o leitor de PDF (Adobe) ou o validador do governo (validar.iti.gov.br).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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

// --- desenho (pedido do dono de 24/11/2026: a página só com a tarja azul ficou "meio pobre" e o campo da assinatura do
// documento ficava em branco) ---------------------------------------------------------------------------------------------
// Larguras das letras das fontes padrão do PDF (Helvetica e Helvetica-Bold, em milésimos do tamanho, ASCII 32 a 126): para
// centralizar, quebrar e diminuir o texto que não cabe. Letra acentuada mede como a letra sem acento.
const LARG = {
  F1: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
  F2: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584],
};
const ESPECIAIS = { '·': 278, 'º': 365, 'ª': 370, '§': 556, '°': 400 };

/** Largura do texto em pontos. F3 é a Courier-Bold (todas as letras com 600). Ex.: ("CNPJ", 'F1', 10) → 26,7. */
export function larguraTexto(texto, fonte, tamanho) {
  let soma = 0;
  for (const c of String(texto)) {
    if (fonte === 'F3') { soma += 600; continue; }
    const base = c.normalize('NFD')[0];
    const k = base.charCodeAt(0);
    soma += ESPECIAIS[c] || (k >= 32 && k <= 126 ? LARG[fonte][k - 32] : 556);
  }
  return (soma * tamanho) / 1000;
}

/** Quebra o texto em linhas que cabem em ``max`` pontos. */
function quebrar(texto, fonte, tamanho, max) {
  const out = [];
  let linha = '';
  for (const p of String(texto).split(/\s+/).filter(Boolean)) {
    const junto = linha ? `${linha} ${p}` : p;
    if (linha && larguraTexto(junto, fonte, tamanho) > max) { out.push(linha); linha = p; } else linha = junto;
  }
  if (linha) out.push(linha);
  return out;
}

/** Tamanho da letra para o texto caber em ``max`` pontos (do ``tamanho`` pedido até ``minimo``). */
const tamanhoQueCabe = (texto, fonte, tamanho, max, minimo = 6) => {
  let t = tamanho;
  while (t > minimo && larguraTexto(texto, fonte, t) > max) t -= 0.25;
  return t;
};

const n2 = (v) => String(Math.round(v * 100) / 100);
const cor = ([r, g, b], op) => `${n2(r)} ${n2(g)} ${n2(b)} ${op}`;
// cores sóbrias: azul-marinho para os títulos e o selo, cinzas para o texto e as linhas
const MARINHO = [0.11, 0.22, 0.37];
const TEXTO = [0.16, 0.18, 0.21];
const CINZA = [0.42, 0.45, 0.5];
const LINHA = [0.8, 0.82, 0.86];
const FUNDO = [0.965, 0.972, 0.982];
const VERDE = [0.12, 0.45, 0.31];

/** Um texto na posição (x, y) da linha de base. */
const txt = (x, y, fonte, tam, texto, c = TEXTO) => `BT ${cor(c, 'rg')} /${fonte} ${n2(tam)} Tf ${n2(x)} ${n2(y)} Td ${textoPdf(texto)} Tj ET`;

/** Caminho de um retângulo de cantos arredondados. */
function arredondado(x, y, w, h, r) {
  const k = r * 0.5523;
  return [`${n2(x + r)} ${n2(y)} m`, `${n2(x + w - r)} ${n2(y)} l`, `${n2(x + w - r + k)} ${n2(y)} ${n2(x + w)} ${n2(y + r - k)} ${n2(x + w)} ${n2(y + r)} c`,
    `${n2(x + w)} ${n2(y + h - r)} l`, `${n2(x + w)} ${n2(y + h - r + k)} ${n2(x + w - r + k)} ${n2(y + h)} ${n2(x + w - r)} ${n2(y + h)} c`,
    `${n2(x + r)} ${n2(y + h)} l`, `${n2(x + r - k)} ${n2(y + h)} ${n2(x)} ${n2(y + h - r + k)} ${n2(x)} ${n2(y + h - r)} c`,
    `${n2(x)} ${n2(y + r)} l`, `${n2(x)} ${n2(y + r - k)} ${n2(x + r - k)} ${n2(y)} ${n2(x + r)} ${n2(y)} c`, 'h'].join(' ');
}

/** O emblema: círculo com o sinal de conferido, de raio ``r`` e centro (cx, cy). */
function emblema(cx, cy, r, c = MARINHO) {
  const k = r * 0.5523;
  const circulo = `${n2(cx + r)} ${n2(cy)} m ${n2(cx + r)} ${n2(cy + k)} ${n2(cx + k)} ${n2(cy + r)} ${n2(cx)} ${n2(cy + r)} c ${n2(cx - k)} ${n2(cy + r)} ${n2(cx - r)} ${n2(cy + k)} ${n2(cx - r)} ${n2(cy)} c ${n2(cx - r)} ${n2(cy - k)} ${n2(cx - k)} ${n2(cy - r)} ${n2(cx)} ${n2(cy - r)} c ${n2(cx + k)} ${n2(cy - r)} ${n2(cx + r)} ${n2(cy - k)} ${n2(cx + r)} ${n2(cy)} c h`;
  const marca = `${n2(cx - r * 0.45)} ${n2(cy + r * 0.02)} m ${n2(cx - r * 0.12)} ${n2(cy - r * 0.32)} l ${n2(cx + r * 0.48)} ${n2(cy + r * 0.36)} l`;
  return `q ${cor(c, 'rg')} ${circulo} f 1 1 1 RG ${n2(Math.max(1, r * 0.17))} w 1 J 1 j ${marca} S Q`;
}

/** Data e hora de Brasília. Ex.: 2026-12-05T13:32:00Z → "05/12/2026 às 10:32". */
const dataHoraBr = (quando) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(quando).replace(',', ' às');

/**
 * O selo que vai na linha de assinatura da empresa (e, sem a linha marcada, na página final): emblema, "Assinado digitalmente
 * por", o nome, o CNPJ e a data. ``larg`` × ``alt`` em pontos; fundo branco (cobre o "______" da folha).
 */
export function desenhoDoSelo(larg, alt, { nome, cnpj, dataBr }) {
  const r = Math.min(alt * 0.27, 12);
  const xTexto = 10 + 2 * r + 8;
  const max = larg - xTexto - 8;
  const tNome = tamanhoQueCabe(nome, 'F2', 9, max);
  const meio = [cnpj ? `CNPJ ${cnpj}` : '', dataBr].filter(Boolean).join(' · ');
  const tMeio = tamanhoQueCabe(meio, 'F1', 7.5, max);
  const contorno = arredondado(0.45, 0.45, larg - 0.9, alt - 0.9, 4);
  // fundo branco, a faixa à esquerda (recortada pelo canto arredondado) e o contorno
  return [`q 1 1 1 rg ${contorno} f Q`, `q ${contorno} W n ${cor(MARINHO, 'rg')} 0 0 3.5 ${n2(alt)} re f Q`, `q ${cor(MARINHO, 'RG')} 0.9 w ${contorno} S Q`,
    emblema(10 + r, alt / 2, r),
    txt(xTexto, alt - 12, 'F1', 6.75, 'ASSINADO DIGITALMENTE POR', CINZA),
    txt(xTexto, alt - 23.5, 'F2', tNome, nome, MARINHO),
    txt(xTexto, alt - 33.5, 'F1', tMeio, meio, TEXTO),
    txt(xTexto, alt - 42, 'F1', 6.5, 'Certificado ICP-Brasil · confira em validar.iti.gov.br', CINZA)].join('\n');
}

/** Lê a marca que o site põe no catálogo (/ImoveisAssinatura): { pagina, rect: [x0 y0 x1 y1], logo } (cada parte pode faltar). */
export function marcaDoSite(cat) {
  const i = cat.indexOf('/ImoveisAssinatura');
  if (i < 0) return {};
  const t = cat.slice(i, cat.indexOf('>>', i) + 2);
  const pagina = Number((t.match(/\/Pagina\s+(\d+)/) || [])[1]) || 0;
  const rect = ((t.match(/\/Rect\s*\[([^\]]*)\]/) || [])[1] || '').trim().split(/\s+/).map(Number);
  const logo = Number((t.match(/\/Logo\s+(\d+)\s+0\s+R/) || [])[1]) || 0;
  return { ...(pagina && rect.length === 4 && rect.every(Number.isFinite) ? { pagina, rect } : {}), ...(logo ? { logo } : {}) };
}

/** Referências das páginas, na ordem (só a lista simples, como o jsPDF grava; com subárvores, devolve []). */
function paginasDaArvore(texto, dic) {
  const kids = [...(dic.match(/\/Kids\s*\[([^\]]*)\]/) || [])[1]?.matchAll(/(\d+)\s+0\s+R/g) || []].map((m) => Number(m[1]));
  return kids.every((n) => /\/Type\s*\/Page(?![s\w])/.test(dicionarioDoObjeto(texto, n))) ? kids : [];
}

/** Junta ``ref`` ao /Annots de uma página (lista na própria página; com colchetes e textos dentro dela também). */
function comAnotacao(dic, ref) {
  const i = dic.search(/\/Annots\s*\[/);
  if (i < 0) {
    if (/\/Annots\s+\d+\s+0\s+R/.test(dic)) throw new Error('O PDF tem /Annots indireto: este tipo não é assinado aqui.');
    return `<<${dic.slice(2, -2)} /Annots [${ref}]>>`;
  }
  let j = dic.indexOf('[', i) + 1;
  for (let nivel = 1, emTexto = 0; j < dic.length; j += 1) {
    const c = dic[j];
    if (c === '\\' && emTexto) { j += 1; continue; }
    if (c === '(') emTexto += 1; else if (c === ')' && emTexto) emTexto -= 1;
    else if (!emTexto && c === '[') nivel += 1; else if (!emTexto && c === ']') { nivel -= 1; if (!nivel) break; }
  }
  return `${dic.slice(0, j)} ${ref}${dic.slice(j)}`;
}

/** Põe ``ref`` na lista /Kids da raiz das páginas. */
function comEntrada(dic, chave, ref) {
  const corpo = dic.slice(2, -2);
  const re = new RegExp(`/${chave}\\s*\\[([^\\]]*)\\]`);
  if (re.test(corpo)) return `<<${corpo.replace(re, (m, dentro) => `/${chave} [${dentro.trim()} ${ref}]`)}>>`;
  throw new Error(`O PDF não tem /${chave}: este tipo não é assinado aqui.`);
}

/** Tamanho do selo, em pontos (240 × 50 pt = 8,5 × 1,8 cm). */
const SELO = [240, 50];

/** Medidas do selo na linha da assinatura: centrado na linha "______", com a base logo abaixo dela (o fundo branco a cobre). */
export function retanguloDoSelo([x0, y0, x1], larguraFolha) {
  const [larg, alt] = SELO;
  const esq = Math.max(20, Math.min(larguraFolha - 20 - larg, (x0 + x1) / 2 - larg / 2));
  const base = y0 - 2;
  return [esq, base, esq + larg, base + alt];
}

/** Conteúdo da página final: cabeçalho (logo), título, quadro com os dados da assinatura e como conferir. */
function desenhoDaPagina({ L, H, selo, dataBr, paginas, resumo, logo, comSeloNaFolha }) {
  const m = 56;
  const larg = L - 2 * m;
  const out = [];
  let y = H - 50;
  // cabeçalho: a logo (se houver) à esquerda; à direita, de que página se trata
  if (logo) {
    const escala = Math.min(150 / logo.largura, 46 / logo.altura);
    const [w, h] = [logo.largura * escala, logo.altura * escala];
    out.push(`q ${n2(w)} 0 0 ${n2(h)} ${m} ${n2(y - h)} cm /Logo Do Q`);
    y -= h;
  } else {
    out.push(txt(m, y - 14, 'F2', 11, selo.nome, MARINHO));
    y -= 18;
  }
  const rotulo = 'FOLHA DE ASSINATURA DIGITAL';
  out.push(txt(L - m - larguraTexto(rotulo, 'F1', 7.5), H - 50 - 10, 'F1', 7.5, rotulo, CINZA));
  y -= 14;
  out.push(`q ${cor(LINHA, 'RG')} 0.75 w ${m} ${n2(y)} m ${L - m} ${n2(y)} l S Q`);
  // título
  y -= 40;
  out.push(txt(m, y, 'F2', 20, 'Documento assinado digitalmente', MARINHO));
  y -= 20;
  const abertura = `${selo.documento ? `${selo.documento}, com` : 'Documento com'} ${paginas} ${paginas === 1 ? 'página' : 'páginas'} antes desta. Assinado pela empresa abaixo com certificado digital ICP-Brasil (e-CNPJ)${comSeloNaFolha ? '; o selo da assinatura aparece também no lugar da assinatura da empresa' : ''}.`;
  for (const l of quebrar(abertura, 'F1', 10, larg)) { out.push(txt(m, y, 'F1', 10, l, CINZA)); y -= 14; }
  // o quadro com os dados
  y -= 12;
  const linhas = [['ASSINADO POR', selo.nome], ['CNPJ', selo.cnpj || 'não informado no certificado'], ...(selo.responsavel ? [['RESPONSÁVEL', selo.responsavel]] : []),
    ['CERTIFICADORA', selo.emissor || 'ICP-Brasil'], ['DATA E HORA', `${dataBr} (horário de Brasília)`]];
  const alturaQuadro = 58 + linhas.length * 30 + 44;
  const topoQuadro = y;
  out.push(`q ${cor(FUNDO, 'rg')} ${cor(LINHA, 'RG')} 0.75 w ${arredondado(m, topoQuadro - alturaQuadro, larg, alturaQuadro, 6)} B Q`);
  out.push(emblema(m + 30, topoQuadro - 30, 13, VERDE));
  out.push(txt(m + 52, topoQuadro - 26, 'F2', 12, 'Assinatura digital ICP-Brasil', TEXTO));
  out.push(txt(m + 52, topoQuadro - 39, 'F1', 8.5, 'Assinatura CMS destacada (SHA-256), com a cadeia do certificado e a hora da assinatura.', CINZA));
  let yq = topoQuadro - 58;
  out.push(`q ${cor(LINHA, 'RG')} 0.5 w ${m + 18} ${n2(yq + 8)} m ${L - m - 18} ${n2(yq + 8)} l S Q`);
  const xValor = m + 140;
  for (const [rot, valor] of linhas) {
    yq -= 12;
    out.push(txt(m + 22, yq, 'F1', 7.5, rot, CINZA));
    const tam = tamanhoQueCabe(valor, rot === 'ASSINADO POR' ? 'F2' : 'F1', 10.5, L - m - 22 - xValor, 7);
    out.push(txt(xValor, yq, rot === 'ASSINADO POR' ? 'F2' : 'F1', tam, valor, TEXTO));
    yq -= 18;
  }
  out.push(txt(m + 22, yq - 12, 'F1', 7.5, 'RESUMO DO DOCUMENTO', CINZA));
  out.push(txt(m + 22, yq - 22, 'F1', 7.5, 'ORIGINAL (SHA-256)', CINZA));
  out.push(txt(xValor, yq - 12, 'F3', 8.75, resumo.slice(0, 32), TEXTO));
  out.push(txt(xValor, yq - 23, 'F3', 8.75, resumo.slice(32), TEXTO));
  y = topoQuadro - alturaQuadro - 34;
  // como conferir
  out.push(txt(m, y, 'F2', 12, 'Como conferir', MARINHO));
  y -= 20;
  const passos = [
    'Envie este arquivo PDF ao validador oficial do governo, em validar.iti.gov.br, ou abra-o no Adobe Acrobat Reader e veja o painel de assinaturas.',
    `O validador deve mostrar a assinatura como válida, feita por ${selo.nome}${selo.cnpj ? ` (CNPJ ${selo.cnpj})` : ''}.`,
    'Qualquer mudança no arquivo depois da assinatura (até numa vírgula) a invalida: por isso, guarde e envie sempre este PDF, sem imprimir e escanear.',
  ];
  passos.forEach((p, k) => {
    out.push(`q ${cor(MARINHO, 'rg')} ${arredondado(m, y - 4, 14, 14, 7)} f Q`, txt(m + 4.6, y, 'F2', 8.5, String(k + 1), [1, 1, 1]));
    for (const [j, l] of quebrar(p, 'F1', 10, larg - 24).entries()) { out.push(txt(m + 24, y - j * 14, 'F1', 10, l, TEXTO)); if (j) y -= 14; }
    y -= 24;
  });
  // base legal, no pé da folha
  const lei = 'A assinatura digital feita com certificado ICP-Brasil tem a mesma validade jurídica da assinatura de próprio punho (Medida Provisória 2.200-2/2001, artigo 10, e Lei 14.063/2020, artigo 4º, III).';
  let yp = 72;
  out.push(`q ${cor(LINHA, 'RG')} 0.5 w ${m} ${yp + 16} m ${L - m} ${yp + 16} l S Q`);
  for (const l of quebrar(lei, 'F1', 8, larg)) { out.push(txt(m, yp, 'F1', 8, l, CINZA)); yp -= 11; }
  return { conteudo: out.join('\n'), yLivre: y };
}

/**
 * Prepara o PDF para a assinatura: atualização incremental (o documento fica intacto) com uma PÁGINA FINAL de assinatura e o
 * espaço reservado. Se o site marcou a linha da assinatura da empresa (/ImoveisAssinatura, `pdfDoDocumento`), o campo da
 * assinatura fica nela, com o selo "Assinado digitalmente por …"; senão, o selo fica na página final. Tudo entra antes de
 * calcular a assinatura, e o /ByteRange cobre o arquivo inteiro: o selo e a página fazem parte do que é assinado (o ITI e o
 * Adobe conferem). ``selo``: { nome, cnpj, responsavel?, emissor?, documento?, quando (Date), motivo?, local? }. Devolve
 * { pdf (Buffer), aAssinar (Buffer: os dois trechos do /ByteRange), inicio, fim } (``inicio``/``fim``: o "<…>" do /Contents).
 */
export function prepararPdf(original, selo) {
  const base = Buffer.from(original);
  const texto = latin1(base);
  const tr = lerTrailer(texto);
  const arv = arvoreDePaginas(texto, tr.root);
  const cat = dicionarioDoObjeto(texto, tr.root);
  if (/\/AcroForm/.test(cat)) throw new Error('O PDF já tem formulário ou assinatura: assine o PDF original, gerado pelo sistema.');
  const [nFonte, nNegrito, nAparencia, nCampo, nAssin, nConteudo, nPagina, nMono] = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => tr.size + k);
  const quando = selo.quando || new Date();
  const dataBr = dataHoraBr(quando);
  const { largura: L, altura: H } = arv;
  const resumo = createHash('sha256').update(base).digest('hex');
  // o que o site marcou: a linha da assinatura da empresa e a logo (a logo só vale se for uma imagem JPEG de verdade)
  const marca = marcaDoSite(cat);
  let logo = null;
  if (marca.logo) {
    const d = dicionarioDoObjeto(texto, marca.logo);
    const [w, h] = [Number((d.match(/\/Width\s+(\d+)/) || [])[1]), Number((d.match(/\/Height\s+(\d+)/) || [])[1])];
    if (/\/Subtype\s*\/Image/.test(d) && w > 0 && h > 0) logo = { n: marca.logo, largura: w, altura: h };
  }
  const paginas = paginasDaArvore(texto, arv.dic);
  const folha = marca.pagina && marca.pagina <= paginas.length ? paginas[marca.pagina - 1] : 0;
  const pagina = desenhoDaPagina({ L, H, selo, dataBr, paginas: arv.count, resumo, logo, comSeloNaFolha: !!folha });
  // o selo: na linha da assinatura da folha marcada; sem ela, na página final, embaixo de "Como conferir"
  const rect = folha ? retanguloDoSelo(marca.rect, L) : [(L - SELO[0]) / 2, Math.max(110, pagina.yLivre - SELO[1] - 6), (L + SELO[0]) / 2, Math.max(110, pagina.yLivre - SELO[1] - 6) + SELO[1]];
  const [larg, alt] = [rect[2] - rect[0], rect[3] - rect[1]];
  const corpoAparencia = desenhoDoSelo(larg, alt, { nome: selo.nome, cnpj: selo.cnpj, dataBr });
  const fontes = `<< /F1 ${nFonte} 0 R /F2 ${nNegrito} 0 R /F3 ${nMono} 0 R >>`;
  const objetos = [];
  objetos.push([nFonte, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
  objetos.push([nNegrito, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
  objetos.push([nMono, '<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>']);
  objetos.push([nAparencia, `<< /Type /XObject /Subtype /Form /BBox [0 0 ${n2(larg)} ${n2(alt)}] /Resources << /Font ${fontes} >> /Length ${Buffer.byteLength(corpoAparencia, 'latin1')} >>\nstream\n${corpoAparencia}\nendstream`]);
  const naFolha = folha || nPagina;
  objetos.push([nCampo, `<< /Type /Annot /Subtype /Widget /FT /Sig /T ${textoPdf('Assinatura da empresa')} /V ${nAssin} 0 R /P ${naFolha} 0 R /Rect [${rect.map(n2).join(' ')}] /F 132 /AP << /N ${nAparencia} 0 R >> >>`]);
  const zeros = '0'.repeat(LARGURA_NUMERO);
  objetos.push([nAssin, `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 ${zeros} ${zeros} ${zeros}] /Contents <${'0'.repeat(ESPACO_ASSINATURA * 2)}> /M ${textoPdf(dataPdf(quando))} /Name ${textoPdf(selo.nome)} /Reason ${textoPdf(selo.motivo || 'Documento emitido e assinado pela empresa')}${selo.local ? ` /Location ${textoPdf(selo.local)}` : ''} >>`]);
  objetos.push([nConteudo, `<< /Length ${Buffer.byteLength(pagina.conteudo, 'latin1')} >>\nstream\n${pagina.conteudo}\nendstream`]);
  objetos.push([nPagina, `<< /Type /Page /Parent ${arv.n} 0 R /MediaBox [0 0 ${L} ${H}] /Resources << /Font ${fontes}${logo ? ` /XObject << /Logo ${logo.n} 0 R >>` : ''} >> /Contents ${nConteudo} 0 R${folha ? '' : ` /Annots [${nCampo} 0 R]`} >>`]);
  if (folha) objetos.push([folha, comAnotacao(dicionarioDoObjeto(texto, folha), `${nCampo} 0 R`)]);
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
  partes.push(`${linhasXref.join('\n')}\ntrailer\n<< /Size ${tr.size + 8} /Root ${tr.root} 0 R${tr.info ? ` /Info ${tr.info} 0 R` : ''}${tr.id ? ` /ID ${tr.id}` : ''} /Prev ${tr.startxref} >>\nstartxref\n${inicioXref}\n%%EOF\n`);
  const pdf = Buffer.concat([base, doTexto(partes.join(''))]);
  // /ByteRange: tudo menos o "<…>" do /Contents
  const t2 = latin1(pdf);
  const marcaContents = t2.lastIndexOf('/Contents <');
  const inicio = marcaContents + '/Contents '.length;
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
// O PowerShell 5.1 lê e escreve na página de código antiga (850): tudo vai e volta só em ASCII. Senha com acento vai como \uXXXX
// no JSON e os textos do certificado voltam em base64 do UTF-8.
const jsonAscii = (dados) => JSON.stringify(dados).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const TEMPO_WINDOWS = 60000; // um PowerShell preso não pode segurar o programa para sempre
const ERROS_CERTIFICADO = {
  CERT_SENHA: 'A senha do certificado não confere.',
  CERT_ARQUIVO: 'Este arquivo não é um certificado .pfx ou .p12 válido.',
  CERT_SEM_CHAVE: 'O arquivo não tem a chave do certificado: use o .pfx completo (A1) que a certificadora entregou.',
};

function powershell(script, entrada) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { input: entrada, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: TEMPO_WINDOWS });
  if (r.error || r.status !== 0) {
    const erro = /ERRO:([A-Za-z0-9+/=]+)$/.exec(String(r.stdout || '').trim());
    if (erro) throw new Error(`O Windows não conseguiu usar o certificado (${Buffer.from(erro[1], 'base64').toString('utf8').replace(/\s+/g, ' ').trim().slice(0, 300)}).`);
    if (r.error?.code === 'ETIMEDOUT') throw new Error('O Windows demorou demais para usar o certificado. Tente de novo.');
    const msg = String(r.stderr || r.error?.message || '').trim();
    const conhecido = ERROS_CERTIFICADO[String(r.stdout || '').trim()];
    if (conhecido) throw new Error(conhecido);
    throw new Error(`O Windows não conseguiu usar o certificado (${msg.slice(0, 300)}).`);
  }
  return r.stdout.trim();
}

// carrega o .pfx (o certificado com a chave e a cadeia que vier junto) sem gravar a chave no Windows
const PS_CERTIFICADO = `trap { [Console]::Out.Write('ERRO:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$_.Exception.GetBaseException().Message))); exit 4 };
$j = [Console]::In.ReadToEnd() | ConvertFrom-Json; Add-Type -AssemblyName System.Security;
$col = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection;
try { $col.Import([Convert]::FromBase64String($j.pfx), $j.senha, [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable) }
catch { if ($_.Exception.GetBaseException().HResult -eq -2147024810) { [Console]::Out.Write('CERT_SENHA') } else { [Console]::Out.Write('CERT_ARQUIVO') }; exit 3 };
$cert = $col | Where-Object { $_.HasPrivateKey } | Select-Object -First 1;
if (-not $cert) { [Console]::Out.Write('CERT_SEM_CHAVE'); exit 3 }`;

/** Dados do certificado: { nome, cnpj, titular (o "CN" inteiro), validade (AAAA-MM-DD), emissor }. ``pfx``: Buffer ou base64. */
export function dadosDoCertificado(pfx, senha) {
  const saida = powershell(`${PS_CERTIFICADO}
$info = [pscustomobject]@{ titular = $cert.GetNameInfo('SimpleName', $false); emissor = $cert.GetNameInfo('SimpleName', $true); validade = $cert.NotAfter.ToString('yyyy-MM-dd'); inicio = $cert.NotBefore.ToString('yyyy-MM-dd'); rsa = ($cert.PublicKey.Oid.Value -eq '1.2.840.113549.1.1.1'); usos = (@($cert.Extensions | Where-Object { $_ -is [System.Security.Cryptography.X509Certificates.X509KeyUsageExtension] } | ForEach-Object { [int]$_.KeyUsages }) + 0)[0] } | ConvertTo-Json -Compress;
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($info))`,
  jsonAscii({ pfx: Buffer.isBuffer(pfx) ? pfx.toString('base64') : pfx, senha }));
  const x = JSON.parse(Buffer.from(saida, 'base64').toString('utf8'));
  // e-CNPJ ICP-Brasil: "RAZAO SOCIAL:12345678000199"
  const [nome, numeros] = String(x.titular).split(':');
  const cnpj = /^\d{14}$/.test(numeros || '') ? numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '';
  return { nome: (nome || x.titular).trim(), cnpj, titular: x.titular, emissor: x.emissor, validade: x.validade, inicio: x.inicio, rsa: x.rsa, usos: x.usos };
}

const USOS_DE_ASSINATURA = 128 | 64; // assinatura digital | não repúdio

/**
 * Para instalar: os dados do certificado, depois de uma assinatura de prova. O que não consegue assinar é recusado na hora,
 * na frente de quem instala, e não dias depois num recibo.
 */
export function conferirCertificado(pfx, senha) {
  const d = dadosDoCertificado(pfx, senha);
  if (!d.rsa) throw new Error('Este tipo de certificado não serve para assinar PDF aqui (a chave não é RSA). Use o e-CNPJ A1 da ICP-Brasil.');
  if (d.usos && !(d.usos & USOS_DE_ASSINATURA)) throw new Error('Este certificado não serve para assinar documentos (é só para cifrar). Use o e-CNPJ A1.');
  if (assinarCms(Buffer.from('assinatura de prova'), { pfx, senha }).length > ESPACO_ASSINATURA) throw new Error('A assinatura deste certificado é grande demais para o PDF.');
  return d;
}

/**
 * Assinatura CMS destacada (DER) de ``conteudo`` com o certificado: SHA-256, cadeia junto e a hora da assinatura. A cadeia é
 * montada à mão (EndCertOnly + os certificados achados): com WholeChain o Windows se recusa a assinar quando não confia na
 * raiz ou falta uma certificadora (achado nos testes de 22/11/2026). Quem confere a confiança é o validador (ITI, Adobe).
 */
export function assinarCms(conteudo, { pfx, senha, quando = new Date() }) {
  const b64 = powershell(`${PS_CERTIFICADO}
$ci = New-Object System.Security.Cryptography.Pkcs.ContentInfo(,[Convert]::FromBase64String($j.conteudo));
$cms = New-Object System.Security.Cryptography.Pkcs.SignedCms($ci, $true);
$s = New-Object System.Security.Cryptography.Pkcs.CmsSigner($cert);
$s.DigestAlgorithm = New-Object System.Security.Cryptography.Oid('2.16.840.1.101.3.4.2.1');
$s.IncludeOption = [System.Security.Cryptography.X509Certificates.X509IncludeOption]::EndCertOnly;
$cadeia = New-Object System.Security.Cryptography.X509Certificates.X509Chain;
$cadeia.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck;
$cadeia.ChainPolicy.UrlRetrievalTimeout = [TimeSpan]::FromSeconds(5);
[void]$cadeia.ChainPolicy.ExtraStore.AddRange($col);
[void]$cadeia.Build($cert);
$postos = @{}; $postos[$cert.Thumbprint] = $true;
foreach ($c in (@($col) + @($cadeia.ChainElements | ForEach-Object { $_.Certificate }))) { if (-not $postos.ContainsKey($c.Thumbprint)) { $postos[$c.Thumbprint] = $true; [void]$s.Certificates.Add($c) } }
[void]$s.SignedAttributes.Add((New-Object System.Security.Cryptography.Pkcs.Pkcs9SigningTime([DateTime]::Parse($j.quando).ToUniversalTime())));
$cms.ComputeSignature($s, $true);
$cms.CheckSignature($true);
[Convert]::ToBase64String($cms.Encode())`,
  jsonAscii({ pfx: Buffer.isBuffer(pfx) ? pfx.toString('base64') : pfx, senha, conteudo: Buffer.from(conteudo).toString('base64'), quando: quando.toISOString() }));
  return Buffer.from(b64, 'base64');
}

/** O PDF assinado: prepara, assina com o certificado e põe a assinatura. ``selo`` sem nome/cnpj usa os do certificado. */
export function assinarPdf(original, { pfx, senha, selo = {}, quando = new Date(), dados = null }) {
  const cert = dados || dadosDoCertificado(pfx, senha);
  const prep = prepararPdf(original, { nome: cert.nome, cnpj: cert.cnpj, emissor: cert.emissor, ...selo, quando });
  return inserirAssinatura(prep, assinarCms(prep.aAssinar, { pfx, senha, quando }));
}
