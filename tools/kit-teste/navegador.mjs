// Kit de teste: acha o Playwright e o navegador já instalados no computador (sem dependência no repositório).
// Ordem do Playwright: KIT_PLAYWRIGHT (pasta do pacote) → cache do npx (o que as sessões de teste já usaram) → pasta do kit
// fora do Git (%LOCALAPPDATA%/erp-boletos-kit). Sem nenhum, instala só nessa pasta (npm install playwright, sem baixar
// navegador). Navegador: Edge instalado → Chrome instalado → Chromium do Playwright (%LOCALAPPDATA%/ms-playwright).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSAO_PLAYWRIGHT = '1.65.1';
const WIN = process.platform === 'win32';
const LOCAL = process.env.LOCALAPPDATA || path.join(os.homedir(), WIN ? 'AppData/Local' : '.cache');
export const PASTA_DO_KIT = path.join(LOCAL, 'erp-boletos-kit');

const versao = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || '0'; } catch { return null; } };
const comparar = (a, b) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); for (let i = 0; i < 3; i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

function cacheDoNpm() {
  const lista = [path.join(LOCAL, 'npm-cache'), path.join(os.homedir(), '.npm')];
  try { lista.unshift(execSync('npm config get cache', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim()); } catch { /* sem npm no caminho */ }
  return [...new Set(lista)];
}

function candidatos() {
  const out = [];
  if (process.env.KIT_PLAYWRIGHT) out.push(process.env.KIT_PLAYWRIGHT);
  for (const cache of cacheDoNpm()) {
    const npx = path.join(cache, '_npx');
    try { for (const d of fs.readdirSync(npx)) out.push(path.join(npx, d, 'node_modules', 'playwright')); } catch { /* sem cache */ }
  }
  out.push(path.join(PASTA_DO_KIT, 'node_modules', 'playwright'));
  return out.filter((d) => versao(d));
}

/** O módulo do Playwright ({ chromium }) e de onde veio. */
export async function carregarPlaywright({ instalar = true } = {}) {
  let lista = candidatos().sort((a, b) => comparar(versao(b), versao(a)));
  if (!lista.length && instalar) {
    console.log(`Playwright não encontrado: instalando ${VERSAO_PLAYWRIGHT} em ${PASTA_DO_KIT} (fora do Git, uma vez só)…`);
    fs.mkdirSync(PASTA_DO_KIT, { recursive: true });
    if (!fs.existsSync(path.join(PASTA_DO_KIT, 'package.json'))) fs.writeFileSync(path.join(PASTA_DO_KIT, 'package.json'), '{"private":true}\n');
    execSync(`npm install --no-audit --no-fund playwright@${VERSAO_PLAYWRIGHT}`, { cwd: PASTA_DO_KIT, stdio: 'inherit', windowsHide: true, env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' } });
    lista = candidatos();
  }
  if (!lista.length) throw new Error('Playwright não encontrado. Rode: npx -y playwright@' + VERSAO_PLAYWRIGHT + ' --version (ou defina KIT_PLAYWRIGHT com a pasta do pacote).');
  const dir = lista[0];
  const mod = await import(pathToFileURL(path.join(dir, 'index.js')).href);
  return { pw: mod.default || mod, de: dir, versao: versao(dir) };
}

/** Opções do launch: o Edge ou o Chrome instalado (channel) ou o Chromium baixado pelo Playwright. */
export function escolherNavegador() {
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const existe = (rel) => pf.some((p) => fs.existsSync(path.join(p, rel)));
  if (process.env.KIT_NAVEGADOR) return { executablePath: process.env.KIT_NAVEGADOR, nome: process.env.KIT_NAVEGADOR };
  if (WIN && existe('Microsoft/Edge/Application/msedge.exe')) return { channel: 'msedge', nome: 'Edge' };
  if (WIN && existe('Google/Chrome/Application/chrome.exe')) return { channel: 'chrome', nome: 'Chrome' };
  if (!WIN && fs.existsSync('/usr/bin/google-chrome')) return { channel: 'chrome', nome: 'Chrome' };
  return { nome: 'Chromium do Playwright' }; // precisa do navegador baixado (npx playwright install chromium)
}
