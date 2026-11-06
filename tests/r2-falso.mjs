// R2 de mentira em memória (mesmo formato do Cloudflare), usado por nuvem.test.mjs e cofre.test.mjs.
/** R2 em memória com o mesmo formato do Cloudflare (get/head/put/delete/list, etag e onlyIf.etagMatches). */
export function r2Falso() {
  const m = new Map();
  let n = 0;
  const objeto = (key, o) => ({ key, size: o.dados.byteLength, etag: o.etag, httpEtag: `"${o.etag}"`, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata });
  return {
    m,
    async head(key) { const o = m.get(key); return o ? objeto(key, o) : null; },
    async get(key) {
      const o = m.get(key); if (!o) return null;
      return { ...objeto(key, o), body: new Blob([o.dados]).stream(), arrayBuffer: async () => o.dados.slice().buffer, text: async () => new TextDecoder().decode(o.dados) };
    },
    async put(key, valor, op = {}) {
      const atual = m.get(key);
      if (op.onlyIf?.etagMatches && atual?.etag !== op.onlyIf.etagMatches) return null;
      const dados = typeof valor === 'string' ? new TextEncoder().encode(valor) : new Uint8Array(valor);
      n += 1;
      const o = { dados, etag: `e${n}`, httpMetadata: op.httpMetadata, customMetadata: op.customMetadata };
      m.set(key, o);
      return objeto(key, o);
    },
    async delete(chaves) { for (const k of [].concat(chaves)) m.delete(k); },
    async list({ prefix = '', delimiter, cursor, limit = 1000 } = {}) {
      const todas = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      const objetos = []; const pastas = new Set();
      for (const k of todas) {
        const resto = k.slice(prefix.length);
        if (delimiter && resto.includes(delimiter)) pastas.add(prefix + resto.slice(0, resto.indexOf(delimiter) + 1));
        else objetos.push(k);
      }
      const ini = Number(cursor || 0);
      const fatia = objetos.slice(ini, ini + limit);
      const truncated = ini + limit < objetos.length;
      return { objects: fatia.map((k) => objeto(k, m.get(k))), delimitedPrefixes: [...pastas], truncated, cursor: truncated ? String(ini + limit) : undefined };
    },
  };
}
