// Gera os ícones do aplicativo instalável (docs/icones/icone-192.png e icone-512.png): uma casa branca no azul do topo.
// Sem dependências: desenha os pixels e monta o PNG com o zlib do Node. Uso: node tools/gerar-icones.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const SAIDA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'icones');
const AZUL = [0x1e, 0x3a, 0x8a]; const BRANCO = [255, 255, 255];

const tabelaCrc = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = tabelaCrc[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const bloco = (tipo, dados) => {
  const t = Buffer.from(tipo, 'ascii'); const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, c]);
};

/** A casa ocupa o meio (área segura do ícone "maskable"): telhado triangular, corpo e porta. */
function cor(x, y, n) {
  const u = x / n; const v = y / n;
  const telhado = v >= 0.22 && v <= 0.47 && Math.abs(u - 0.5) <= (v - 0.22) * 1.25;
  const corpo = u >= 0.3 && u <= 0.7 && v >= 0.45 && v <= 0.76;
  const porta = u >= 0.45 && u <= 0.55 && v >= 0.58 && v <= 0.76;
  return (telhado || corpo) && !porta ? BRANCO : AZUL;
}

function png(n) {
  const linhas = [];
  for (let y = 0; y < n; y += 1) {
    const l = Buffer.alloc(1 + n * 3);
    for (let x = 0; x < n; x += 1) cor(x, y, n).forEach((c, i) => { l[1 + x * 3 + i] = c; });
    linhas.push(l);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(Buffer.concat(linhas), { level: 9 })), bloco('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(SAIDA, { recursive: true });
for (const n of [192, 512]) fs.writeFileSync(path.join(SAIDA, `icone-${n}.png`), png(n));
console.log(`Ícones em ${SAIDA}`);
