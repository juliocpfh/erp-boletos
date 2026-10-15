// Mapa do código: funções e constantes de topo de cada arquivo, com a linha, e as entradas de
// TELAS / CADASTROS / FORMULARIOS / ACOES de telas.js. Serve para achar onde mexer sem ler os arquivos inteiros.
// Uso: node tools/mapa.mjs [trecho do nome do arquivo ou do símbolo]   ex.: node tools/mapa.mjs reserva
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pasta = path.join(RAIZ, 'docs', 'js');
const filtro = (process.argv[2] || '').toLowerCase();
const BLOCOS = ['TELAS', 'CADASTROS', 'FORMULARIOS', 'ACOES', 'TABELAS_EXCLUSAO'];

for (const nome of fs.readdirSync(pasta).filter((n) => n.endsWith('.js')).sort()) {
  const linhas = fs.readFileSync(path.join(pasta, nome), 'utf8').split('\n');
  const itens = [];
  let bloco = null;
  linhas.forEach((l, i) => {
    const topo = /^(export )?(async )?(function|const|let) ([A-Za-z_$][\w$]*)/.exec(l);
    if (topo) {
      bloco = BLOCOS.includes(topo[4]) && /[{[]\s*$/.test(l) ? topo[4] : null;
      itens.push(`${i + 1}\t${topo[1] ? 'export ' : ''}${topo[4]}`);
      return;
    }
    if (l.startsWith('}')) bloco = null;
    // entradas de 1º nível dentro dos blocos de telas.js (2 espaços de recuo)
    const entrada = bloco && /^ {2}(async )?'?([\w-]+)'?(\s*[:(])/.exec(l);
    if (entrada) itens.push(`${i + 1}\t  ${bloco}.${entrada[2]}`);
  });
  const mostrar = filtro ? itens.filter((x) => `${nome} ${x}`.toLowerCase().includes(filtro)) : itens;
  if (mostrar.length) console.log(`\n== docs/js/${nome} (${linhas.length} linhas)\n${mostrar.join('\n')}`);
}
