// Gera o programa do PC num arquivo só para Windows: atualizador-pc/dist/Instalar-Administracao-de-Imoveis.exe (não vai para o
// repositório: .gitignore). É o próprio Node (o que está rodando este script) com atualizador-pc/programa.mjs dentro
// (Node "single executable application"): 1) o esbuild junta programa.mjs, atualizador.mjs e ligar.mjs num arquivo;
// 2) o Node prepara o pacote (--experimental-sea-config); 3) o postject põe o pacote numa cópia do node.exe.
// Sem assinatura de código (decisão do dono, proposta de licença, item 11). Só no Windows: o .exe é o node.exe desta máquina.
// Uso: node tools/gerar-exe.mjs   (o GitHub roda a cada mudança na main: .github/workflows/programa-pc.yml)
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'atualizador-pc', 'dist');
export const NOME_BAIXAR = 'Instalar-Administracao-de-Imoveis.exe';
const FUSIVEL = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'; // marca fixa do Node para o pacote (documentação do SEA)

if (process.platform !== 'win32') { console.error('O .exe só é gerado no Windows (ele é feito do node.exe desta máquina).'); process.exit(1); }

/** Roda um comando dentro de dist/ (nomes relativos: o caminho do projeto pode ter espaço). */
function rodar(titulo, comando, args, { shell = false } = {}) {
  process.stdout.write(`• ${titulo}… `);
  const r = shell ? spawnSync([comando, ...args].join(' '), { cwd: DIST, shell: true, encoding: 'utf8' }) : spawnSync(comando, args, { cwd: DIST, encoding: 'utf8' });
  if (r.status !== 0) { console.log('FALHOU'); console.log(`${r.stdout || ''}${r.stderr || ''}${r.error?.message || ''}`); process.exit(1); }
  console.log('ok');
}

// versão: dia e commit (aparece em --versao e na ajuda)
let commit = String(process.env.GITHUB_SHA || '').slice(0, 7);
if (!commit) { try { commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: RAIZ, encoding: 'utf8' }).trim(); } catch { commit = 'sem-git'; } }
const hoje = new Date();
const versao = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')} ${commit}`;

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
// a marca vem antes de tudo (os imports rodam na ordem): atualizador.mjs sabe por ela que é o .exe
fs.writeFileSync(path.join(DIST, 'marca.mjs'), `globalThis.PROGRAMA_EXE = { versao: ${JSON.stringify(versao)} };\n`);
fs.writeFileSync(path.join(DIST, 'entrada.mjs'), "import './marca.mjs';\nimport { executar } from '../programa.mjs';\nexecutar(process.argv.slice(2)).then((c) => { process.exitCode = c; });\n");
fs.writeFileSync(path.join(DIST, 'sea-config.json'), JSON.stringify({ main: 'programa.cjs', output: 'programa.blob', disableExperimentalSEAWarning: true }));

rodar('juntando o programa num arquivo (esbuild)', 'npx', ['-y', 'esbuild@0.24.0', 'entrada.mjs', '--bundle', '--platform=node', '--format=cjs', '--target=node22',
  '--define:import.meta.url=undefined', '--log-level=error', '--outfile=programa.cjs'], { shell: true });
rodar('preparando o pacote (Node SEA)', process.execPath, ['--experimental-sea-config', 'sea-config.json']);
fs.copyFileSync(process.execPath, path.join(DIST, NOME_BAIXAR));
rodar('pondo o pacote dentro do node.exe (postject)', 'npx', ['-y', 'postject@1.0.0-alpha.6', NOME_BAIXAR, 'NODE_SEA_BLOB', 'programa.blob', '--sentinel-fuse', FUSIVEL, '--overwrite'], { shell: true });
for (const n of ['marca.mjs', 'entrada.mjs', 'sea-config.json', 'programa.cjs', 'programa.blob']) fs.rmSync(path.join(DIST, n), { force: true });

// confere que abre e responde
const saida = path.join(DIST, NOME_BAIXAR);
const r = spawnSync(saida, ['--versao'], { encoding: 'utf8' });
if (r.status !== 0 || r.stdout.trim() !== versao) { console.error(`O .exe gerado não respondeu a --versao (saiu ${r.status}): ${r.stdout}${r.stderr}`); process.exit(1); }
const bytes = fs.readFileSync(saida);
console.log(`Pronto: ${saida}\n  versão ${versao} (Node ${process.version}) · ${(bytes.length / 1024 / 1024).toFixed(1)} MB · sha256 ${crypto.createHash('sha256').update(bytes).digest('hex')}`);
