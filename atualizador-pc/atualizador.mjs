// Atualizador da versão PC: programinha que roda no computador do administrador (agendado pelo Windows, como o Windows Update)
// e traz da nuvem os dados de hoje e a versão PC mais nova, gravando na pasta do backup seguro, cifrados com a chave que já está lá.
// Assim a cópia do PC fica em dia mesmo nos dias em que o sistema só foi usado no celular.
// Também mantém a cópia ABERTA dos arquivos (pasta "Arquivos dos imoveis", sem cifrar, para abrir no Windows): mesma regra de
// docs/js/copia-aberta.js (tests/copia-aberta.test.mjs confere as duas).
// Uso: node atualizador.mjs (dados, versão PC e arquivos) ou node atualizador.mjs --arquivos (só a cópia aberta, de hora em hora).
// Configuração em .env; passo a passo em README.md. Não precisa de nada além do Node 20+.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = path.dirname(fileURLToPath(import.meta.url));
export const PASTA_DIARIO = 'copias-diarias';
export const PASTA_PROGRAMA = 'programa';
export const ARQUIVO_CHAVE = 'chave-do-backup.json';
export const ARQUIVO_REGISTRO = 'ultima-atualizacao.txt';
export const ARQUIVO_PROGRAMA = 'administracao-imoveis.html';
export const CAMINHO_PROGRAMA = 'offline/administracao-imoveis.html';
export const PASTA_COPIA = 'Arquivos dos imoveis'; // iguais a docs/js/copia-aberta.js
export const ARQUIVO_COPIA = 'copia-aberta.json';
export const MANTER_DIARIOS = 60; // igual a MANTER_DIARIOS de docs/js/backup-seguro.js
const MAGICO = 'IMOVEIS-BACKUP-SEGURO-1'; // igual ao de docs/js/backup-seguro.js (tests/atualizador-pc.test.mjs confere abrindo o arquivo)

/** Lê um arquivo .env simples (CHAVE=valor, # comentários) sem sobrescrever o que já está no ambiente. */
export function lerEnv(arquivo, env = process.env) {
  if (!fs.existsSync(arquivo)) return env;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha);
    if (!m || linha.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (env[m[1]] === undefined) env[m[1]] = v;
  }
  return env;
}

// ---------------------------------------------------------------------------
// Cifra no mesmo formato do backup seguro (docs/js/backup-seguro.js → cifrar): chave AES nova por arquivo, embrulhada com a
// chave pública RSA da pasta; cabeçalho legível protegido pela integridade. Só quem sabe a senha do backup abre.
// ---------------------------------------------------------------------------
const sutil = () => globalThis.crypto.subtle;
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const deB64 = (t) => new Uint8Array(Buffer.from(t, 'base64'));
const texto = (t) => new TextEncoder().encode(t);

export async function cifrar(chave, bytes, info = {}) {
  const publica = await sutil().importKey('spki', deB64(chave.publica), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
  const aes = await sutil().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const embrulhada = await sutil().wrapKey('raw', aes, publica, { name: 'RSA-OAEP' });
  const cabecalho = { ...info, criado_em: new Date().toISOString(), protegido: 1, chave_embrulhada: b64(embrulhada), iv: b64(iv),
    chave: { iteracoes: chave.iteracoes, privada_cifrada: chave.privada_cifrada, sal: chave.sal, iv: chave.iv } };
  const cabecalhoBytes = texto(JSON.stringify(cabecalho));
  const conteudo = new Uint8Array(await sutil().encrypt({ name: 'AES-GCM', iv, additionalData: cabecalhoBytes }, aes, bytes));
  return Buffer.concat([texto(`${MAGICO}\n`), cabecalhoBytes, texto('\n'), conteudo]);
}

/** Data local AAAA-MM-DD (toISOString daria o dia seguinte depois das 21h). */
export const hojeIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Cópias diárias além das MANTER_DIARIOS mais recentes (igual a diariosParaApagar do backup seguro). */
export function diariosParaApagar(nomes) {
  const ord = [...nomes].sort();
  return ord.slice(0, Math.max(0, ord.length - MANTER_DIARIOS));
}

// ---------------------------------------------------------------------------
// A atualização
// ---------------------------------------------------------------------------
export function carregarConfig(env = lerEnv(path.join(PASTA, '.env'))) {
  const cfg = {
    site: String(env.SITE || 'https://erp.ankjck.com.br').replace(/\/+$/, ''),
    clientId: String(env.ACCESS_CLIENT_ID || '').trim(),
    clientSecret: String(env.ACCESS_CLIENT_SECRET || '').trim(),
    pasta: String(env.PASTA_BACKUP || '').trim(),
  };
  const faltam = Object.entries({ ACCESS_CLIENT_ID: cfg.clientId, ACCESS_CLIENT_SECRET: cfg.clientSecret, PASTA_BACKUP: cfg.pasta }).filter(([, v]) => !v).map(([k]) => k);
  if (faltam.length) throw new Error(`Falta no .env: ${faltam.join(', ')} (veja .env.exemplo).`);
  return cfg;
}

/**
 * Baixa os dados de hoje (GET /api/dados/tudo, o mesmo formato do imoveis-dados.json) e a versão PC, se houver mais nova,
 * e grava na pasta do backup seguro. `buscar` é o fetch (trocado nos testes); `hoje` idem.
 * Devolve { dados: nome do arquivo gravado, programa: 'atualizado' | 'em dia' | 'falhou: …' }.
 */
export async function atualizar(cfg, { buscar = fetch, hoje = hojeIso() } = {}) {
  const caminhoChave = path.join(cfg.pasta, ARQUIVO_CHAVE);
  if (!fs.existsSync(caminhoChave)) throw new Error(`A pasta ${cfg.pasta} não é uma pasta de backup seguro (falta ${ARQUIVO_CHAVE}). Ligue o backup seguro no sistema (Dados e backup) nesta pasta primeiro.`);
  const chave = JSON.parse(fs.readFileSync(caminhoChave, 'utf8'));
  if (chave.formato !== MAGICO) throw new Error(`${ARQUIVO_CHAVE} não é deste sistema.`);
  const cabecalhos = { 'CF-Access-Client-Id': cfg.clientId, 'CF-Access-Client-Secret': cfg.clientSecret };

  // 1. os dados, como estão agora na nuvem
  const r = await buscar(`${cfg.site}/api/dados/tudo`, { headers: { ...cabecalhos, Accept: 'application/json' }, redirect: 'manual' });
  if (!(r.headers.get('content-type') || '').includes('json')) throw new Error(`A nuvem não aceitou a chave de serviço (resposta ${r.status}). Confira ACCESS_CLIENT_ID/SECRET, a política "Service Auth" do Access e a variável SERVICOS do Worker.`);
  const corpo = await r.text();
  if (!r.ok) throw new Error(`A nuvem recusou: ${JSON.parse(corpo).erro || r.status}`);
  const dados = JSON.parse(corpo);
  if (dados.formato !== 'imoveis-v1') throw new Error('A nuvem devolveu algo que não é o banco do sistema.');
  const pastaDiario = path.join(cfg.pasta, PASTA_DIARIO);
  fs.mkdirSync(pastaDiario, { recursive: true });
  const nome = `imoveis-dados-${hoje}.bkp`;
  const cifrado = await cifrar(chave, texto(corpo), { tipo: 'diario', arquivo: 'imoveis-dados.json', revisao: dados.revisao, origem: 'atualizador-pc' });
  fs.writeFileSync(path.join(pastaDiario, `${nome}.parte`), cifrado);
  fs.renameSync(path.join(pastaDiario, `${nome}.parte`), path.join(pastaDiario, nome)); // troca inteira: nunca fica um arquivo pela metade
  for (const velho of diariosParaApagar(fs.readdirSync(pastaDiario).filter((n) => n.endsWith('.bkp')))) fs.unlinkSync(path.join(pastaDiario, velho));

  // 2. a versão PC (o programa), só se o site publicou uma mais nova
  let programa = 'em dia';
  try {
    const pastaPrograma = path.join(cfg.pasta, PASTA_PROGRAMA);
    fs.mkdirSync(pastaPrograma, { recursive: true });
    const versaoArq = path.join(pastaPrograma, 'versao.txt');
    const atual = fs.existsSync(versaoArq) ? fs.readFileSync(versaoArq, 'utf8').trim() : '';
    const cab = await buscar(`${cfg.site}/${CAMINHO_PROGRAMA}`, { method: 'HEAD', headers: cabecalhos, redirect: 'manual' });
    const publicada = cab.ok ? (cab.headers.get('last-modified') || '') : '';
    if (publicada && publicada !== atual) {
      const p = await buscar(`${cfg.site}/${CAMINHO_PROGRAMA}`, { headers: cabecalhos, redirect: 'manual' });
      const html = await p.text();
      if (!p.ok || !html.includes('<html')) throw new Error(`resposta ${p.status}`);
      fs.writeFileSync(path.join(pastaPrograma, ARQUIVO_PROGRAMA), html);
      fs.writeFileSync(versaoArq, publicada);
      programa = 'atualizado';
    }
  } catch (e) { programa = `falhou: ${e.message}`; }

  fs.writeFileSync(path.join(cfg.pasta, ARQUIVO_REGISTRO), `${new Date().toISOString()} ok dados=${nome} programa=${programa}\n`);
  return { dados: nome, programa };
}

// ---------------------------------------------------------------------------
// Cópia aberta dos arquivos (igual a docs/js/copia-aberta.js)
// ---------------------------------------------------------------------------
const PROIBIDOS = /[<>:"|?*]/g;
const RESERVADOS = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
export function nomeWindows(parte) {
  let t = String(parte).replace(PROIBIDOS, '_').replace(/[. ]+$/, '');
  if (!t) t = '_';
  if (RESERVADOS.test(t)) t = `_${t}`;
  return t;
}
export const caminhoLocal = (caminho) => caminho.split('/').map(nomeWindows);

export function planoCopia(nuvem, anterior = {}) {
  const atual = {};
  const baixar = [];
  for (const a of nuvem) {
    const info = { tamanho: a.tamanho, alterado: a.alterado || '' };
    atual[a.caminho] = info;
    const ant = anterior[a.caminho];
    if (!ant || ant.tamanho !== info.tamanho || (ant.alterado || '') !== info.alterado) baixar.push(a.caminho);
  }
  const apagar = Object.keys(anterior).filter((c) => !(c in atual));
  return { baixar, apagar, atual };
}

const codificar = (caminho) => caminho.split('/').map(encodeURIComponent).join('/');

/**
 * Baixa da nuvem (lista-tudo/arquivos/ e arquivos/<caminho>) o que é novo ou mudou e apaga da cópia o que saiu da nuvem.
 * Arquivo que sumiu da cópia (apagado à mão) volta. Devolve { baixados, apagados, falhas, total }.
 */
export async function atualizarCopia(cfg, { buscar = fetch } = {}) {
  const cabecalhos = { 'CF-Access-Client-Id': cfg.clientId, 'CF-Access-Client-Secret': cfg.clientSecret };
  const raiz = path.join(cfg.pasta, PASTA_COPIA);
  const arqReg = path.join(cfg.pasta, ARQUIVO_COPIA);
  let reg = { arquivos: {} };
  try { reg = JSON.parse(fs.readFileSync(arqReg, 'utf8')); } catch { /* primeira vez */ }
  const arquivos = { ...(reg.arquivos || {}) };
  for (const c of Object.keys(arquivos)) if (!fs.existsSync(path.join(raiz, ...caminhoLocal(c)))) delete arquivos[c];
  const nuvem = [];
  let cursor;
  for (let n = 0; n < 1000; n += 1) {
    const r = await buscar(`${cfg.site}/api/lista-tudo/arquivos/${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: { ...cabecalhos, Accept: 'application/json' }, redirect: 'manual' });
    if (!(r.headers.get('content-type') || '').includes('json')) throw new Error(`A nuvem não aceitou a chave de serviço (resposta ${r.status}).`);
    const corpo = await r.json();
    if (!r.ok) throw new Error(`A nuvem recusou a lista dos arquivos: ${corpo.erro || r.status}`);
    nuvem.push(...corpo.arquivos);
    if (!corpo.mais) break;
    cursor = corpo.cursor;
  }
  const { baixar, apagar, atual } = planoCopia(nuvem, arquivos);
  const salvar = (falhas) => fs.writeFileSync(arqReg, JSON.stringify({ atualizado_em: new Date().toISOString(), por: 'atualizador', falhas, arquivos }));
  for (const c of apagar) {
    const p = caminhoLocal(c);
    try { fs.unlinkSync(path.join(raiz, ...p)); } catch { /* já não estava */ }
    for (let i = p.length - 1; i >= 1; i -= 1) { try { fs.rmdirSync(path.join(raiz, ...p.slice(0, i))); } catch { break; } } // só pasta vazia
    delete arquivos[c];
  }
  let falhas = 0; let feitos = 0;
  for (const c of baixar) {
    const destino = path.join(raiz, ...caminhoLocal(c));
    try {
      const r = await buscar(`${cfg.site}/api/arquivos/${codificar(c)}`, { headers: cabecalhos, redirect: 'manual' });
      if (!r.ok) throw new Error(`resposta ${r.status}`);
      const bytes = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(`${destino}.parte`, bytes);
      fs.renameSync(`${destino}.parte`, destino);
      arquivos[c] = atual[c];
    } catch { falhas += 1; try { fs.unlinkSync(`${destino}.parte`); } catch { /* nada */ } }
    feitos += 1;
    if (feitos % 50 === 0) salvar(falhas);
  }
  salvar(falhas);
  return { baixados: baixar.length - falhas, apagados: apagar.length, falhas, total: Object.keys(arquivos).length };
}

/** Texto da cópia aberta para o registro (ultima-atualizacao.txt). */
const resumoCopia = (c) => `arquivos=${c.total} (baixados ${c.baixados}, tirados ${c.apagados}${c.falhas ? `, ${c.falhas} falharam` : ''})`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const cfg = carregarConfig();
    const soArquivos = process.argv.includes('--arquivos');
    const r = soArquivos ? null : await atualizar(cfg);
    let copia;
    try { copia = resumoCopia(await atualizarCopia(cfg)); } catch (e) { copia = `arquivos=FALHOU ${e.message}`; }
    const linha = r ? `ok dados=${r.dados} programa=${r.programa} ${copia}` : `ok ${copia}`;
    fs.writeFileSync(path.join(cfg.pasta, ARQUIVO_REGISTRO), `${new Date().toISOString()} ${linha}\n`);
    console.log(r ? `Atualizado: ${r.dados} em ${path.join(cfg.pasta, PASTA_DIARIO)}; versão PC ${r.programa}; ${copia}.` : `Cópia aberta: ${copia}.`);
  } catch (e) {
    console.error(`Falhou: ${e.message}`);
    try { fs.writeFileSync(path.join(carregarConfig().pasta, ARQUIVO_REGISTRO), `${new Date().toISOString()} FALHOU ${e.message}\n`); } catch { /* sem pasta */ }
    process.exitCode = 1;
  }
}
