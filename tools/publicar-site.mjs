// Monta o site como ele é publicado (GitHub Actions, .github/workflows/publicar-site.yml): cópia de docs/ com
//  - JS e CSS do próprio sistema compactados (esbuild --minify, arquivo a arquivo, sem juntar: os import e import() continuam
//    os mesmos; --keep-names guarda o nome das funções e classes). docs/vendor (já compactado), docs/offline (a versão PC,
//    com CSP por hash e window.VERSAO_OFFLINE), sw.js e index.html vão como estão no repositório;
//  - index.html com a lista de <link rel="modulepreload"> de todos os módulos que a página carrega (o navegador pede todos de
//    uma vez, em vez de 18 níveis de import um depois do outro);
//  - resumos.json: o resumo (SHA-256) de cada arquivo publicado. O sw.js baixa numa versão nova só os arquivos de resumo
//    diferente do que o aparelho já tem;
//  - todos os arquivos com a mesma data (a da montagem): a versão é a data de publicação, como no GitHub Pages pela branch.
// O código no repositório não muda. Uso: node tools/publicar-site.mjs [pasta de saída (padrão _site)] [--sem-compactar]
//   [--origem <pasta> (padrão docs)]. Precisa do esbuild (baixado pelo npx na primeira vez), menos com --sem-compactar.
import { execFileSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ESBUILD = 'esbuild@0.24.0'; // a mesma de tools/checar.mjs e tools/gerar-offline.mjs
export const LISTA = 'resumos.json'; // o mesmo nome de RESUMOS em docs/sw.js
// fora da compactação: bibliotecas já compactadas e a versão PC (gerada à parte, com CSP por hash)
const SEM_COMPACTAR = /^(vendor|offline)\//;

const posix = (p) => p.split(path.sep).join('/');
function arquivosDe(pasta, base = pasta) {
  const lista = [];
  for (const e of fs.readdirSync(pasta, { withFileTypes: true })) {
    const p = path.join(pasta, e.name);
    if (e.isDirectory()) lista.push(...arquivosDe(p, base));
    else lista.push(posix(path.relative(base, p)));
  }
  return lista.sort();
}

/** esbuild pelo npx com a pasta `cwd` e caminhos relativos (no Windows o npx falha com caminho absoluto cheio de espaços). */
function esbuild(cwd, args) {
  const opcoes = { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] };
  const todos = ['-y', ESBUILD, ...args];
  return process.platform === 'win32' ? execSync(['npx', ...todos].join(' '), opcoes) : execFileSync('npx', todos, opcoes);
}

/** Módulos que a página carrega sem import() (a partir de js/app.js), na ordem em que aparecem, pelo grafo do esbuild. */
function modulosDaPagina(meta) {
  const vistos = new Set(); const fila = ['js/app.js'];
  while (fila.length) {
    const m = fila.shift();
    if (vistos.has(m) || !meta.inputs[m]) continue;
    vistos.add(m);
    for (const i of meta.inputs[m].imports) if (i.kind === 'import-statement') fila.push(i.path);
  }
  return [...vistos];
}

export function montar({ saida = path.join(RAIZ, '_site'), origem = path.join(RAIZ, 'docs'), compactar = true, data = new Date() } = {}) {
  saida = path.resolve(saida); origem = path.resolve(origem);
  if (saida === origem || saida.startsWith(origem + path.sep)) throw new Error('A pasta de saída não pode ficar dentro de docs/.');
  fs.rmSync(saida, { recursive: true, force: true });
  fs.cpSync(origem, saida, { recursive: true });
  fs.rmSync(path.join(saida, LISTA), { force: true });

  const nossos = arquivosDe(saida).filter((a) => /\.(js|css)$/.test(a) && !SEM_COMPACTAR.test(a) && a !== 'sw.js');
  let compactados = 0;
  if (compactar) {
    if (nossos.some((a) => /[\s"'&|<>^%]/.test(a))) throw new Error('Nome de arquivo com espaço ou símbolo em docs/.');
    // cada arquivo no próprio lugar (sem juntar), sem comentários; acentos ficam como estão (utf8)
    esbuild(saida, [...nossos, '--minify', '--keep-names', '--charset=utf8', '--legal-comments=none', '--outdir=.', '--outbase=.', '--allow-overwrite', '--log-level=warning']);
    compactados = nossos.length;
  }
  // conferência: todos os import e import() da versão publicada acham o arquivo (o esbuild junta tudo só para conferir) e o
  // grafo dos módulos para o modulepreload
  const META = '__meta-publicar.json';
  esbuild(saida, ['js/app.js', '--bundle', '--format=esm', `--metafile=${META}`, '--outfile=__conferir-publicar.js', '--log-level=error']);
  const meta = JSON.parse(fs.readFileSync(path.join(saida, META), 'utf8'));
  for (const f of [META, '__conferir-publicar.js']) fs.rmSync(path.join(saida, f), { force: true });
  const modulos = modulosDaPagina(meta).filter((m) => m !== 'js/app.js');

  const indice = path.join(saida, 'index.html');
  const html = fs.readFileSync(indice, 'utf8');
  if (!html.includes('</head>') || !html.includes('<script type="module" src="js/app.js"></script>')) throw new Error('index.html sem </head> ou sem o js/app.js.');
  const preload = modulos.map((m) => `<link rel="modulepreload" href="${m}">`).join('\n');
  fs.writeFileSync(indice, html.replace('</head>', `<!-- módulos que a página usa, pedidos todos de uma vez (tools/publicar-site.mjs) -->\n${preload}\n</head>`));

  const arquivos = {};
  for (const a of arquivosDe(saida)) {
    if (a.startsWith('.')) continue; // .nojekyll: não é publicado pelo GitHub Actions
    arquivos[a] = crypto.createHash('sha256').update(fs.readFileSync(path.join(saida, ...a.split('/')))).digest('hex');
  }
  fs.writeFileSync(path.join(saida, LISTA), `${JSON.stringify({ formato: 1, gerada: data.toISOString(), compactado: compactar, arquivos }, null, 1)}\n`);
  // a mesma data em todos (a versão é a data de publicação; o sw.js aceita só alguns segundos de diferença entre os arquivos)
  const instante = new Date(Math.floor(data.getTime() / 1000) * 1000);
  for (const a of arquivosDe(saida)) fs.utimesSync(path.join(saida, ...a.split('/')), instante, instante);
  return { saida, arquivos: Object.keys(arquivos).length, compactados, modulos: modulos.length + 1 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const iOrigem = args.indexOf('--origem');
  const origem = iOrigem >= 0 ? args[iOrigem + 1] : undefined;
  const saida = args.find((a, i) => !a.startsWith("--") && (iOrigem < 0 || i !== iOrigem + 1));
  const r = montar({ saida, origem, compactar: !args.includes('--sem-compactar') });
  console.log(`Site montado em ${r.saida}: ${r.arquivos} arquivos na lista ${LISTA}, ${r.compactados} compactados, ${r.modulos} módulos no modulepreload.`);
}
