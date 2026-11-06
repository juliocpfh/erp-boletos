// Pasta do disco com a mesma interface da pasta do navegador (FileSystemDirectoryHandle), para testes no Node.
import fs from 'node:fs';
import path from 'node:path';

class ArquivoDisco {
  constructor(caminho) { this.caminho = caminho; this.kind = 'file'; this.name = path.basename(caminho); }
  async getFile() { return new File([fs.readFileSync(this.caminho)], this.name); }
  async createWritable() {
    const pedacos = []; const c = this.caminho;
    return { write: async (d) => { pedacos.push(Buffer.from(d instanceof Blob ? await d.arrayBuffer() : d)); }, close: async () => { fs.writeFileSync(c, Buffer.concat(pedacos)); } };
  }
}

export class PastaDisco {
  constructor(caminho) { this.caminho = caminho; this.kind = 'directory'; this.name = path.basename(caminho); }
  async* entries() {
    for (const n of fs.readdirSync(this.caminho).sort()) {
      const c = path.join(this.caminho, n);
      yield [n, fs.statSync(c).isDirectory() ? new PastaDisco(c) : new ArquivoDisco(c)];
    }
  }
  async getDirectoryHandle(n, { create = false } = {}) {
    const c = path.join(this.caminho, n);
    if (!fs.existsSync(c)) { if (!create) throw new DOMException(n, 'NotFoundError'); fs.mkdirSync(c); }
    return new PastaDisco(c);
  }
  async getFileHandle(n, { create = false } = {}) {
    const c = path.join(this.caminho, n);
    if (!fs.existsSync(c)) { if (!create) throw new DOMException(n, 'NotFoundError'); fs.writeFileSync(c, ''); }
    return new ArquivoDisco(c);
  }
}
