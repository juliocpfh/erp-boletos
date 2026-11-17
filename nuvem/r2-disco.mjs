// R2 de mentira gravado em disco, para a nuvem de teste (nuvem/local.mjs): os anexos e backups ficam em nuvem/.local/arquivos
// e sobrevivem a fechar e abrir de novo, como o banco (antes ficavam só na memória e o banco passava a apontar para anexos que
// não existiam: item 50 do mutirão 3000). Cada objeto: <pasta>/<chave codificada>.bin e .json (etag, data e metadados).
import fs from 'node:fs';
import path from 'node:path';
import { r2Falso } from '../tests/r2-falso.mjs';

const nomeDe = (chave) => encodeURIComponent(chave);

/** R2 em memória (r2Falso) que carrega o que está em `pasta` ao abrir e grava em disco cada put/delete. */
export function r2EmDisco(pasta) {
  fs.mkdirSync(pasta, { recursive: true });
  // etiquetas novas não repetem as já gravadas (a contagem do r2Falso recomeça a cada abertura)
  const r2 = r2Falso({ prefixoEtag: `${Date.now().toString(36)}-` });
  for (const arq of fs.readdirSync(pasta)) {
    if (!arq.endsWith('.json')) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(pasta, arq), 'utf8'));
      const dados = new Uint8Array(fs.readFileSync(path.join(pasta, arq.replace(/\.json$/, '.bin'))));
      r2.m.set(meta.chave, { dados, etag: meta.etag, uploaded: new Date(meta.uploaded), httpMetadata: meta.httpMetadata, customMetadata: meta.customMetadata });
    } catch { /* objeto pela metade: fica de fora */ }
  }
  const gravar = (chave) => {
    const o = r2.m.get(chave);
    const base = path.join(pasta, nomeDe(chave));
    if (!o) { for (const ext of ['.bin', '.json']) fs.rmSync(base + ext, { force: true }); return; }
    fs.writeFileSync(`${base}.bin`, o.dados);
    fs.writeFileSync(`${base}.json`, JSON.stringify({ chave, etag: o.etag, uploaded: o.uploaded, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata }));
  };
  const put = r2.put.bind(r2); const del = r2.delete.bind(r2);
  r2.put = async (chave, valor, op) => { const r = await put(chave, valor, op); if (r) gravar(chave); return r; };
  r2.delete = async (chaves) => { await del(chaves); for (const k of [].concat(chaves)) gravar(k); };
  return r2;
}
