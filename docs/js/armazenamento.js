// Leitura e gravação na pasta escolhida pelo usuário (ex.: uma pasta do OneDrive),
// usando a File System Access API do Chrome/Edge. Nada é enviado para a internet.
import { normalizar } from './regras.js';

export const ARQUIVO_BANCO = 'imoveis-dados.json';
export const PASTA_ARQUIVOS = 'arquivos';
export const PASTA_BACKUPS = 'backups';
export const PASTA_MODELOS = 'modelos';
export const MODELO_FATURA = 'fatura-modelo.xlsx';
const MANTER_BACKUPS = 30;

export const suportado = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// --------------------------------------------------------------------------
// Lembrar a pasta escolhida (IndexedDB guarda o "atalho" para a pasta)
// --------------------------------------------------------------------------
function idb() {
  return new Promise((ok, erro) => {
    const req = indexedDB.open('imoveis', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('config');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

async function idbOp(modo, fn) {
  const db = await idb();
  return new Promise((ok, erro) => {
    const tx = db.transaction('config', modo);
    const req = fn(tx.objectStore('config'));
    tx.oncomplete = () => ok(req.result);
    tx.onerror = () => erro(tx.error);
  });
}

export const lembrarPasta = (handle) => idbOp('readwrite', (s) => s.put(handle, 'pasta'));
export const pastaLembrada = () => idbOp('readonly', (s) => s.get('pasta')).catch(() => null);
// pasta do backup seguro (só no computador do administrador)
export const lembrarPastaSegura = (handle) => idbOp('readwrite', (s) => s.put(handle, 'pasta_segura'));
export const pastaSeguraLembrada = () => idbOp('readonly', (s) => s.get('pasta_segura')).catch(() => null);
export const esquecerPastaSegura = () => idbOp('readwrite', (s) => s.delete('pasta_segura'));

export async function escolherPasta() {
  const handle = await window.showDirectoryPicker({ id: 'imoveis', mode: 'readwrite' });
  await lembrarPasta(handle);
  return handle;
}

export async function temPermissao(handle, pedir = false) {
  const opcoes = { mode: 'readwrite' };
  if (!handle.queryPermission) return true; // pasta interna do navegador (modo de teste)
  if ((await handle.queryPermission(opcoes)) === 'granted') return true;
  return pedir && (await handle.requestPermission(opcoes)) === 'granted';
}

// --------------------------------------------------------------------------
// Banco de dados (um arquivo JSON)
// --------------------------------------------------------------------------
async function arquivoExiste(dir, nome) {
  try {
    await dir.getFileHandle(nome);
    return true;
  } catch {
    return false;
  }
}

export async function lerBanco(pasta) {
  if (!(await arquivoExiste(pasta, ARQUIVO_BANCO))) return null;
  const arq = await (await pasta.getFileHandle(ARQUIVO_BANCO)).getFile();
  const texto = await arq.text();
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error(`O arquivo ${ARQUIVO_BANCO} está danificado. Restaure uma cópia da pasta ${PASTA_BACKUPS}.`);
  }
  if (dados.formato !== 'imoveis-v1') throw new Error(`${ARQUIVO_BANCO} não é um banco deste sistema.`);
  return normalizar(dados);
}

export async function escreverTexto(dir, nome, conteudo) {
  const fh = await dir.getFileHandle(nome, { create: true });
  const w = await fh.createWritable();
  await w.write(conteudo);
  await w.close();
}

export async function gravarBanco(pasta, dados) {
  await escreverTexto(pasta, ARQUIVO_BANCO, JSON.stringify(dados, null, 1));
}

/** Cópia do banco uma vez por dia em backups/, guardando as 30 mais recentes. */
export async function backupDiario(pasta, dados) {
  const dir = await pasta.getDirectoryHandle(PASTA_BACKUPS, { create: true });
  const nome = `imoveis-dados-${new Date().toISOString().slice(0, 10)}.json`;
  if (await arquivoExiste(dir, nome)) return;
  await escreverTexto(dir, nome, JSON.stringify(dados));
  const nomes = [];
  for await (const [n, h] of dir.entries()) if (h.kind === 'file' && /^imoveis-dados-\d{4}-\d{2}-\d{2}\.json$/.test(n)) nomes.push(n);
  nomes.sort();
  for (const velho of nomes.slice(0, Math.max(0, nomes.length - MANTER_BACKUPS))) await dir.removeEntry(velho);
}

/** Cópias em conflito criadas pelo OneDrive quando duas pessoas gravam ao mesmo tempo. */
export async function copiasEmConflito(pasta) {
  const lista = [];
  for await (const [n, h] of pasta.entries()) {
    if (h.kind === 'file' && n !== ARQUIVO_BANCO && /^imoveis-dados.*\.json$/i.test(n)) lista.push(n);
  }
  return lista;
}

// --------------------------------------------------------------------------
// Arquivos anexados
// --------------------------------------------------------------------------
export function limparNome(nome) {
  const t = String(nome || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim().replace(/[. ]+$/, '');
  return t.slice(0, 120) || 'sem nome';
}

export async function subpasta(pasta, partes, criar = true) {
  let dir = pasta;
  for (const p of partes) dir = await dir.getDirectoryHandle(limparNome(p), { create: criar });
  return dir;
}

export async function listar(dir) {
  const itens = [];
  for await (const [nome, h] of dir.entries()) {
    if (h.kind === 'file') {
      const f = await h.getFile();
      itens.push({ nome, tamanho: f.size, foto: /\.(jpe?g|png|gif|webp)$/i.test(nome) });
    }
  }
  return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function salvarArquivo(dir, arquivo) {
  const nome = limparNome(arquivo.name);
  const ponto = nome.lastIndexOf('.');
  const [base, ext] = ponto > 0 ? [nome.slice(0, ponto), nome.slice(ponto)] : [nome, ''];
  let final = nome;
  for (let n = 2; await arquivoExiste(dir, final); n += 1) final = `${base} (${n})${ext}`;
  await escreverTexto(dir, final, arquivo);
  return final;
}

export async function abrirArquivo(dir, nome) {
  return (await dir.getFileHandle(nome)).getFile();
}

/**
 * Lê o arquivo inteiro na hora (o OneDrive pode estar baixando ou sincronizando, e o arquivo muda entre abrir e ler:
 * "the state had changed since it was read from disk"). Tenta de novo algumas vezes antes de desistir.
 */
export async function lerConteudo(h) {
  for (let n = 1; ; n += 1) {
    try {
      const f = await h.getFile();
      return new File([await f.arrayBuffer()], f.name, { type: f.type });
    } catch (e) {
      if (n >= 4) throw e;
      await new Promise((ok) => { setTimeout(ok, 400 * n); });
    }
  }
}

async function copiarPasta(origem, destino) {
  for await (const [nome, h] of origem.entries()) {
    if (h.kind === 'file') await escreverTexto(destino, nome, await lerConteudo(h));
    else await copiarPasta(h, await destino.getDirectoryHandle(nome, { create: true }));
  }
}

/** Renomeia uma subpasta (ex.: quando o inquilino sai e a pasta ganha a data de saída). */
export async function renomearPasta(pai, antigo, novo) {
  antigo = limparNome(antigo);
  novo = limparNome(novo);
  if (antigo === novo) return;
  let origem;
  try {
    origem = await pai.getDirectoryHandle(antigo);
  } catch {
    await pai.getDirectoryHandle(novo, { create: true });
    return;
  }
  try {
    await pai.getDirectoryHandle(novo);
    return; // já existe uma pasta com o nome novo: não mistura conteúdos
  } catch { /* ok, não existe */ }
  if (origem.move) {
    try {
      await origem.move(pai, novo);
      return;
    } catch { /* navegador sem suporte: copia e apaga */ }
    try { origem = await pai.getDirectoryHandle(antigo); } catch { return; } // a pasta acabou indo mesmo assim
  }
  await copiarPasta(origem, await pai.getDirectoryHandle(novo, { create: true }));
  await pai.removeEntry(antigo, { recursive: true });
}

/** Move uma pasta para outra pasta-mãe (ex.: inquilino que mudou de imóvel), com o nome novo. */
export async function moverPasta(paiAntigo, antigo, paiNovo, novo) {
  antigo = limparNome(antigo);
  novo = limparNome(novo);
  let origem;
  try {
    origem = await paiAntigo.getDirectoryHandle(antigo);
  } catch {
    await paiNovo.getDirectoryHandle(novo, { create: true });
    return;
  }
  try {
    await paiNovo.getDirectoryHandle(novo);
    return; // já existe uma pasta com o nome novo: não mistura conteúdos
  } catch { /* ok, não existe */ }
  if (origem.move) {
    try {
      await origem.move(paiNovo, novo);
      return;
    } catch { /* navegador sem suporte: copia e apaga */ }
    try { origem = await paiAntigo.getDirectoryHandle(antigo); } catch { return; } // a pasta acabou indo mesmo assim
  }
  await copiarPasta(origem, await paiNovo.getDirectoryHandle(novo, { create: true }));
  await paiAntigo.removeEntry(antigo, { recursive: true });
}

/**
 * Leva a pasta "antigo" (em paiAntigo) para "novo" (em paiNovo). Se o destino já existe, junta: cada arquivo vai para lá,
 * e o de mesmo nome e mesmo tamanho é tido como repetido. Arquivo com o mesmo nome e conteúdo diferente fica onde estava.
 * Devolve quantos arquivos ficaram para trás (0 = a pasta antiga sumiu).
 */
export async function juntarPasta(paiAntigo, antigo, paiNovo, novo) {
  antigo = limparNome(antigo);
  novo = limparNome(novo);
  let origem;
  try { origem = await paiAntigo.getDirectoryHandle(antigo); } catch { return 0; }
  if (antigo === novo && await paiAntigo.isSameEntry(paiNovo)) return 0;
  let existe = true;
  try { await paiNovo.getDirectoryHandle(novo); } catch { existe = false; }
  if (!existe) {
    await moverPasta(paiAntigo, antigo, paiNovo, novo);
    return 0;
  }
  const sobrou = await juntarConteudo(origem, await paiNovo.getDirectoryHandle(novo));
  if (!sobrou) await paiAntigo.removeEntry(antigo, { recursive: true });
  return sobrou;
}

async function juntarConteudo(origem, destino) {
  let sobrou = 0;
  const feitos = [];
  for await (const [nome, h] of origem.entries()) {
    if (h.kind === 'directory') {
      const n = await juntarConteudo(h, await destino.getDirectoryHandle(nome, { create: true }));
      sobrou += n;
      if (!n) feitos.push(nome);
      continue;
    }
    const arq = await lerConteudo(h);
    let la = null;
    try { la = await (await destino.getFileHandle(nome)).getFile(); } catch { /* não existe no destino */ }
    if (la && la.size !== arq.size) { sobrou += 1; continue; }
    if (!la) await escreverTexto(destino, nome, arq);
    feitos.push(nome);
  }
  for (const nome of feitos) await origem.removeEntry(nome, { recursive: true });
  return sobrou;
}

// --------------------------------------------------------------------------
// Exportar / importar tudo em ZIP
// --------------------------------------------------------------------------
async function adicionarAoZip(zip, dir, prefixo) {
  for await (const [nome, h] of dir.entries()) {
    if (h.kind === 'file') zip.file(prefixo + nome, await h.getFile());
    else await adicionarAoZip(zip, h, `${prefixo}${nome}/`);
  }
}

export async function exportarZip(JSZip, pasta, dados) {
  const zip = new JSZip();
  zip.file(ARQUIVO_BANCO, JSON.stringify(dados, null, 1));
  for (const sub of [PASTA_ARQUIVOS, PASTA_MODELOS]) {
    try {
      await adicionarAoZip(zip, await pasta.getDirectoryHandle(sub), `${sub}/`);
    } catch { /* pasta ainda não existe */ }
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function importarZip(JSZip, pasta, arquivoZip, dadosAtuais) {
  const zip = await JSZip.loadAsync(arquivoZip);
  const banco = zip.file(ARQUIVO_BANCO);
  if (!banco) throw new Error(`O ZIP não contém o arquivo ${ARQUIVO_BANCO}.`);
  const nomes = Object.keys(zip.files);
  for (const n of nomes) {
    const partes = n.split('/');
    if (n.startsWith('/') || partes.includes('..') || (n !== ARQUIVO_BANCO && ![PASTA_ARQUIVOS, PASTA_MODELOS].includes(partes[0]))) {
      throw new Error(`Arquivo inesperado dentro do ZIP: ${n}`);
    }
  }
  const novos = normalizar(JSON.parse(await banco.async('string')));
  if (novos.formato !== 'imoveis-v1') throw new Error('O ZIP não é uma exportação deste sistema.');
  if (!novos.usuarios.length && dadosAtuais) {
    // ZIP montado fora do sistema (ex.: dados de uma planilha): mantém os usuários desta pasta.
    novos.usuarios = dadosAtuais.usuarios;
    novos.seq.usuarios = dadosAtuais.seq.usuarios;
  }
  if (dadosAtuais) {
    const dir = await pasta.getDirectoryHandle(PASTA_BACKUPS, { create: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
    await escreverTexto(dir, `antes-da-importacao-${carimbo}.json`, JSON.stringify(dadosAtuais));
  }
  for (const n of nomes) {
    const entrada = zip.files[n];
    if (entrada.dir || n === ARQUIVO_BANCO) continue;
    const partes = n.split('/');
    const dir = await subpasta(pasta, partes.slice(0, -1));
    await escreverTexto(dir, partes.at(-1), await entrada.async('blob'));
  }
  await gravarBanco(pasta, novos);
  return novos;
}

/** A pasta (e as subpastas) não tem nenhum arquivo? */
async function semArquivos(dir) {
  for await (const [, h] of dir.entries()) {
    if (h.kind === 'file' || !(await semArquivos(h))) return false;
  }
  return true;
}

/** Apaga a subpasta "nome" se ela não tiver nenhum arquivo dentro. Devolve true se apagou (ou se nem existia). */
export async function apagarPastaVazia(pai, nome) {
  let dir;
  try { dir = await pai.getDirectoryHandle(limparNome(nome)); } catch { return true; }
  if (!(await semArquivos(dir))) return false;
  await pai.removeEntry(limparNome(nome), { recursive: true });
  return true;
}

/** Nomes das subpastas de uma pasta. */
export async function subpastas(dir) {
  const nomes = [];
  for await (const [nome, h] of dir.entries()) if (h.kind === 'directory') nomes.push(nome);
  return nomes;
}
