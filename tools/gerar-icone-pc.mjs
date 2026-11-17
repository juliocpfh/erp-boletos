// Gera o ícone do programa do PC (casinha branca no quadrado azul, a mesma casinha do aviso no celular, docs/icones/aviso-96.png;
// pedido do dono em 17/11): desenha em cada tamanho que o Windows usa, monta um .ico (entradas PNG) e grava atualizador-pc/icone.mjs
// com o arquivo em base64. O programa grava o icone.ico na pasta dele e o Windows o mostra em Aplicativos instalados.
// Uso: node tools/gerar-icone-pc.mjs   (só quando mudar o desenho; o icone.mjs gerado vai para o repositório)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAMANHOS = [16, 24, 32, 48, 64, 256];
const AZUL = [30, 58, 138]; // o azul do ícone "ERP" (docs/icones/erp-*.png)
const BRANCO = [255, 255, 255];

// o desenho numa grade de 1024 × 1024
const R = 200; // canto arredondado do quadrado
const dentroQuadrado = (x, y) => {
  const cx = Math.min(Math.max(x, R), 1024 - R), cy = Math.min(Math.max(y, R), 1024 - R);
  return (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
};
const dentroTelhado = (x, y) => y >= 170 && y <= 500 && Math.abs(x - 512) <= (y - 170) * (348 / 330);
const dentroRet = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const dentroCasa = (x, y) => (dentroTelhado(x, y) || dentroRet(x, y, 250, 480, 774, 850)) && !dentroRet(x, y, 440, 620, 584, 850);

/** RGBA de um tamanho, com amostras por pixel (bordas suaves). */
function desenhar(n) {
  const k = n >= 128 ? 4 : 8;
  const px = Buffer.alloc(n * n * 4);
  for (let py = 0; py < n; py++) for (let pxi = 0; pxi < n; pxi++) {
    let fundo = 0, casa = 0;
    for (let sy = 0; sy < k; sy++) for (let sx = 0; sx < k; sx++) {
      const x = ((pxi + (sx + 0.5) / k) / n) * 1024, y = ((py + (sy + 0.5) / k) / n) * 1024;
      if (!dentroQuadrado(x, y)) continue;
      if (dentroCasa(x, y)) casa++; else fundo++;
    }
    const total = fundo + casa, i = (py * n + pxi) * 4;
    if (!total) continue;
    for (let c = 0; c < 3; c++) px[i + c] = Math.round((AZUL[c] * fundo + BRANCO[c] * casa) / total);
    px[i + 3] = Math.round((total / (k * k)) * 255);
  }
  return px;
}

function png(n, rgba) {
  const bloco = (tipo, dados) => {
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(corpo));
    return Buffer.concat([tam, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  const linhas = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) rgba.copy(linhas, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(linhas, { level: 9 })), bloco('IEND', Buffer.alloc(0))]);
}

/**
 * Entrada clássica do .ico (bitmap de 32 bits, linhas de baixo para cima, em BGRA, mais a máscara de 1 bit): é a que todo leitor
 * do Windows aceita nos tamanhos pequenos (o PNG fica só no de 256, como nos ícones do próprio Windows).
 */
function bmp(n, rgba) {
  const cab = Buffer.alloc(40);
  cab.writeUInt32LE(40, 0); cab.writeInt32LE(n, 4); cab.writeInt32LE(n * 2, 8); cab.writeUInt16LE(1, 12); cab.writeUInt16LE(32, 14);
  const cores = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const de = (y * n + x) * 4, para = ((n - 1 - y) * n + x) * 4;
    cores[para] = rgba[de + 2]; cores[para + 1] = rgba[de + 1]; cores[para + 2] = rgba[de]; cores[para + 3] = rgba[de + 3];
  }
  const mascara = Buffer.alloc(Math.ceil(n / 32) * 4 * n); // tudo 0: quem decide a transparência é o alfa
  cab.writeUInt32LE(cores.length + mascara.length, 20);
  return Buffer.concat([cab, cores, mascara]);
}

/** .ico com uma entrada por tamanho (PNG no de 256, bitmap nos outros). */
function ico(imagens) {
  const cab = Buffer.alloc(6); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(imagens.length, 4);
  let pos = 6 + 16 * imagens.length;
  const dir = imagens.map(({ n, dados }) => {
    const e = Buffer.alloc(16);
    e[0] = n >= 256 ? 0 : n; e[1] = n >= 256 ? 0 : n; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(dados.length, 8); e.writeUInt32LE(pos, 12); pos += dados.length;
    return e;
  });
  return Buffer.concat([cab, ...dir, ...imagens.map((i) => i.dados)]);
}

const arquivo = ico(TAMANHOS.map((n) => ({ n, dados: (n >= 256 ? png : bmp)(n, desenhar(n)) })));
const b64 = arquivo.toString('base64').match(/.{1,120}/g).map((l) => `  '${l}'`).join(' +\n');
fs.writeFileSync(path.join(RAIZ, 'atualizador-pc', 'icone.mjs'), [
  '// Ícone do programa do PC (casinha branca no quadrado azul): gerado por tools/gerar-icone-pc.mjs, não edite à mão.',
  '// O programa grava este .ico na pasta dele (icone.ico) e o Windows o mostra em Configurações → Aplicativos.',
  "export const NOME_ICONE = 'icone.ico';",
  `export const ICONE_ICO = () => Buffer.from(\n${b64}, 'base64');`,
  '',
].join('\n'));
if (process.argv.includes('--previa')) fs.writeFileSync(process.argv[process.argv.indexOf('--previa') + 1], arquivo);
console.log(`Pronto: atualizador-pc/icone.mjs (${TAMANHOS.join(', ')} px; ${arquivo.length} bytes)`);
