// O programa do PC se atualiza sozinho (pedido do dono de 17/11/2026): na rodada de --atualizar (todo dia às 20h e ao entrar no
// Windows) confere a versão publicada na release "programa-pc" do GitHub (programa-pc.json, gerado por tools/gerar-exe.mjs) e,
// se for mais nova, baixa o .exe, confere tamanho e SHA-256, confere que abre (--versao responde a versão anunciada) e só então
// troca o programa instalado. O Windows deixa renomear um .exe em uso: o atual vira .velho.exe e o novo toma o lugar; vale a
// partir da próxima rodada (a de agora termina com o programa antigo). O .velho.exe sai na rodada seguinte.
// Só no .exe instalado (%LOCALAPPDATA%\Administracao de Imoveis\programa): rodando pelo Node ou de Downloads, não mexe em nada.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** A release fixa que o GitHub atualiza a cada mudança do programa (.github/workflows/programa-pc.yml; repositório público). */
export const URL_RELEASE = 'https://github.com/juliocpfh/erp-boletos/releases/download/programa-pc/';
export const NOME_BAIXAR = 'Instalar-Administracao-de-Imoveis.exe'; // igual a tools/gerar-exe.mjs
export const NOME_MANIFESTO = 'programa-pc.json'; // { versao, sha256, tamanho } (tools/gerar-exe.mjs)
export const NOME_NOVO = 'Administracao-de-Imoveis.novo.exe';
export const NOME_VELHO = 'Administracao-de-Imoveis.velho.exe';
export const NOME_TRAVA = 'atualizando-programa.trava';
export const TEMPO_MANIFESTO = 30000;
export const TEMPO_BAIXAR = 15 * 60000; // o .exe tem uns 80 MB (o Node vai dentro)
export const VALIDADE_TRAVA = 30 * 60000; // trava mais velha que isso é de uma rodada que morreu no meio
export const TAMANHO_MIN = 5 * 1024 * 1024;
export const TAMANHO_MAX = 400 * 1024 * 1024;
const VERSAO = /^(\d{4}-\d{2}-\d{2}) [0-9a-z-]{1,40}$/;

/** A versão do .exe é "AAAA-MM-DD commit" (tools/gerar-exe.mjs). Devolve o dia, ou '' se não é uma versão. */
export const diaDaVersao = (v) => (VERSAO.exec(String(v || '').trim()) || [])[1] || '';

/** Troca só para uma versão diferente e de dia igual ou mais novo (nunca volta para uma mais velha). */
export function eMaisNova(publicada, atual) {
  const dp = diaDaVersao(publicada);
  if (!dp || String(publicada).trim() === String(atual || '').trim()) return false;
  const da = diaDaVersao(atual);
  return !da || dp >= da;
}

/** Confere o programa-pc.json; devolve { versao, sha256, tamanho } ou lança com o motivo. */
export function lerManifesto(texto) {
  let m;
  try { m = JSON.parse(texto); } catch { throw new Error('o aviso de versão nova não veio legível'); }
  const versao = String(m?.versao || '').trim(); const sha256 = String(m?.sha256 || '').toLowerCase(); const tamanho = Number(m?.tamanho);
  if (!diaDaVersao(versao)) throw new Error('o aviso de versão nova não traz uma versão válida');
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('o aviso de versão nova não traz a conferência do arquivo');
  if (!Number.isSafeInteger(tamanho) || tamanho < TAMANHO_MIN || tamanho > TAMANHO_MAX) throw new Error('o aviso de versão nova traz um tamanho estranho');
  return { versao, sha256, tamanho };
}

/** Trava: só uma troca por vez (a das 20h e a de "ao entrar" podem se cruzar). Devolve a função de soltar, ou null. */
function travar(pasta, agora) {
  const arq = path.join(pasta, NOME_TRAVA);
  const criar = () => { try { fs.writeFileSync(arq, String(agora()), { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; } };
  if (!criar()) {
    let parada = true;
    try { parada = agora() - fs.statSync(arq).mtimeMs > VALIDADE_TRAVA; } catch { /* sumiu agora */ }
    if (!parada) return null;
    try { fs.unlinkSync(arq); } catch { /* outra rodada tirou */ }
    if (!criar()) return null;
  }
  return () => { try { fs.unlinkSync(arq); } catch { /* já saiu */ } };
}

/** Baixa para `destino`, contando os bytes e fazendo o SHA-256 no caminho; para se passar do tamanho anunciado. */
async function baixar(url, destino, esperado, buscar) {
  const r = await buscar(url, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(TEMPO_BAIXAR) });
  if (!r.ok || !r.body) throw new Error(`o GitHub respondeu ${r.status} ao baixar o programa`);
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(destino, 'w');
  let bytes = 0; let inicio = null;
  try {
    for await (const pedaco of r.body) {
      const b = Buffer.from(pedaco);
      bytes += b.length;
      if (bytes > esperado.tamanho) throw new Error('o arquivo baixado veio maior que o anunciado');
      if (!inicio) inicio = b.subarray(0, 2);
      hash.update(b);
      fs.writeSync(fd, b);
    }
  } finally { fs.closeSync(fd); }
  if (bytes !== esperado.tamanho) throw new Error(`o arquivo baixado veio incompleto (${bytes} de ${esperado.tamanho} bytes)`);
  if (!inicio || inicio.toString('latin1') !== 'MZ') throw new Error('o arquivo baixado não é um programa do Windows');
  if (hash.digest('hex') !== esperado.sha256) throw new Error('o arquivo baixado não confere com o publicado (pode ter sido alterado no caminho)');
}

/** Roda o programa baixado com --versao (sem janela) e devolve o que ele respondeu. */
const versaoDe = (exe) => {
  const r = spawnSync(exe, ['--versao'], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  return r.status === 0 ? String(r.stdout || '').trim() : '';
};

const apagar = (arq) => { try { fs.unlinkSync(arq); } catch { /* não havia */ } };

/**
 * Confere e, se houver versão nova, troca o programa instalado. Devolve { situacao, texto }:
 * 'em dia' | 'atualizado' | 'falhou' | 'pulado' (não é o .exe instalado, ou outra troca em andamento).
 * `pasta` = a pasta do programa instalado; `exe` = o arquivo do programa ali; `atual` = a versão que está rodando.
 * Trocam nos testes: `rodando` (o caminho do programa em execução), `buscar` (fetch), `rodarVersao` (abre o baixado) e `agora`.
 */
export async function seAtualizar({ pasta, exe, atual, rodando = process.execPath, buscar = fetch, rodarVersao = versaoDe, agora = () => Date.now(), url = URL_RELEASE } = {}) {
  if (!atual || !exe || !pasta) return { situacao: 'pulado', texto: 'rodando pelo Node (sem versão): não se atualiza' };
  if (path.resolve(rodando).toLowerCase() !== path.resolve(exe).toLowerCase()) return { situacao: 'pulado', texto: 'este não é o programa instalado (o instalado é que se atualiza)' };
  apagar(path.join(pasta, NOME_VELHO)); // o da troca anterior (o programa novo já está rodando)
  try {
    const r = await buscar(`${url}${NOME_MANIFESTO}`, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(TEMPO_MANIFESTO) });
    if (r.status === 404) return { situacao: 'em dia', texto: `versão ${atual} (ainda não há aviso de versão nova publicado)` };
    if (!r.ok) throw new Error(`o GitHub respondeu ${r.status} ao conferir a versão`);
    const pub = lerManifesto(await r.text());
    if (!eMaisNova(pub.versao, atual)) return { situacao: 'em dia', texto: `versão ${atual} (a mais nova)` };
    const soltar = travar(pasta, agora);
    if (!soltar) return { situacao: 'pulado', texto: 'outra atualização do programa em andamento' };
    const novo = path.join(pasta, NOME_NOVO); const velho = path.join(pasta, NOME_VELHO);
    try {
      apagar(novo);
      await baixar(`${url}${NOME_BAIXAR}`, novo, pub, buscar);
      const respondeu = rodarVersao(novo);
      if (respondeu !== pub.versao) throw new Error(`o programa baixado não abriu direito (respondeu "${respondeu.slice(0, 60)}")`);
      fs.renameSync(exe, velho); // o Windows deixa renomear o programa em uso
      try { fs.renameSync(novo, exe); } catch (e) { fs.renameSync(velho, exe); throw e; }
      return { situacao: 'atualizado', texto: `atualizado de ${atual} para ${pub.versao} (vale a partir da próxima rodada)` };
    } catch (e) {
      apagar(novo);
      throw e;
    } finally { soltar(); }
  } catch (e) {
    const motivo = e.name === 'TimeoutError' ? 'o GitHub demorou demais para responder' : String(e.message || e);
    return { situacao: 'falhou', texto: `continua na versão ${atual}: ${motivo}` };
  }
}
