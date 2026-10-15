// Conferência rápida antes de commitar: sintaxe do app inteiro (esbuild), testes e versão offline.
// Uso: node tools/checar.mjs            → confere tudo
//      node tools/checar.mjs --offline  → gera de novo a versão sem internet e confere tudo
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rodar = (titulo, cmd, args) => {
  process.stdout.write(`• ${titulo}… `);
  try {
    const saida = execFileSync(cmd, args, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('ok');
    return saida;
  } catch (e) {
    console.log('FALHOU');
    console.log(String(e.stdout || '') + String(e.stderr || ''));
    process.exitCode = 1;
    return null;
  }
};

rodar('sintaxe e imports (esbuild)', 'npx', ['-y', 'esbuild@0.24.0', 'docs/js/app.js', '--bundle', '--log-level=error', '--outfile=/dev/null']);
if (process.argv.includes('--offline')) rodar('versão sem internet', 'node', ['tools/gerar-offline.mjs']);
const testes = fs.readdirSync(path.join(RAIZ, 'tests')).filter((n) => n.endsWith('.test.mjs')).map((n) => path.join('tests', n));
const saida = rodar('testes', 'node', ['--test', ...testes]);
if (saida) {
  const resumo = (k) => (new RegExp(`^# ${k} (\\d+)`, 'm').exec(saida) || [])[1];
  console.log(`  ${resumo('pass')} passaram, ${resumo('fail')} falharam`);
} else {
  console.log('  Se só falhou "versão sem internet … atualizada", rode: node tools/checar.mjs --offline');
}
