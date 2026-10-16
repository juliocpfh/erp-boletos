// Gera docs/offline/administracao-imoveis.html: o programa inteiro num único arquivo (código, estilo,
// componentes e modelo da NF), que abre com dois cliques no Chrome ou no Edge, sem internet e sem o GitHub.
// Uso: node tools/gerar-offline.mjs   (precisa do esbuild, baixado pelo npx na primeira vez)
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashDasFontes, DESTINO } from './fontes-offline.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = (...p) => path.join(RAIZ, 'docs', ...p);
const ler = (arq) => fs.readFileSync(arq, 'utf8');
/** Texto seguro dentro de <script>: não pode fechar a tag nem abrir comentário HTML. */
const seguro = (js) => js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

// Caminho relativo e cwd na raiz: com o caminho absoluto (cheio de espaços) o npx do Windows falhava
const argsEsbuild = ['-y', 'esbuild@0.24.0', path.join('docs', 'js', 'app.js'), '--bundle', '--format=iife', '--charset=utf8', '--log-level=warning'];
const opcoes = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: RAIZ };
// No Windows o npx é um .cmd: precisa do shell
const programa = process.platform === 'win32'
  ? execSync(['npx', ...argsEsbuild].join(' '), opcoes)
  : execFileSync('npx', argsEsbuild, opcoes);
const componentes = ['jszip.min.js', 'exceljs.min.js', 'html2canvas.min.js', 'jspdf.umd.min.js'].map((n) => `<script>${seguro(ler(docs('vendor', n)))}</script>`).join('\n');
const modelo = fs.readFileSync(docs('modelos', 'fatura-modelo.xlsx')).toString('base64');
const hoje = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="fontes" content="${hashDasFontes()}">
<title>Administração de Imóveis</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏠</text></svg>">
<style>${ler(docs('css', 'estilo.css'))}</style>
</head>
<body>
<div id="app"><main><p class="suave">Carregando…</p></main></div>
<noscript>Ative o JavaScript para usar o sistema.</noscript>
<!-- Versão para usar sem internet, gerada em ${hoje} por tools/gerar-offline.mjs. Não edite: gere de novo. -->
${componentes}
<script>window.VERSAO_OFFLINE = ${JSON.stringify(hoje)}; window.MODELO_FATURA_BASE64 = ${JSON.stringify(modelo)};</script>
<script>${seguro(programa)}</script>
</body>
</html>
`;
fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, html);
console.log(`Gerado ${path.relative(RAIZ, DESTINO)} (${Math.round(html.length / 1024)} KB)`);
