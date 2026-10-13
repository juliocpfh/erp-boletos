// Resumo (hash) de tudo que entra na versão de arquivo único, para o teste avisar quando ela ficar desatualizada.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DESTINO = path.join(RAIZ, 'docs', 'offline', 'administracao-imoveis.html');

export function hashDasFontes() {
  const arquivos = [
    ...fs.readdirSync(path.join(RAIZ, 'docs', 'js')).filter((n) => n.endsWith('.js')).sort().map((n) => path.join('docs', 'js', n)),
    ...fs.readdirSync(path.join(RAIZ, 'docs', 'vendor')).sort().map((n) => path.join('docs', 'vendor', n)),
    path.join('docs', 'css', 'estilo.css'), path.join('docs', 'modelos', 'fatura-modelo.xlsx'), path.join('tools', 'gerar-offline.mjs'),
  ];
  const h = crypto.createHash('sha256');
  for (const a of arquivos) h.update(a).update(fs.readFileSync(path.join(RAIZ, a)));
  return h.digest('hex').slice(0, 16);
}
