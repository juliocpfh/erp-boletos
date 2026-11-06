// Leitura e gravação na pasta escolhida pelo usuário (ex.: uma pasta do OneDrive),
// usando a File System Access API do Chrome/Edge. Nada é enviado para a internet.
import { hojeIso } from './calculos.js';
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
// endereço e senha da ponte do banco (C6): só neste navegador, nunca no JSON compartilhado da pasta
export const lembrarPonte = (dados) => idbOp('readwrite', (s) => s.put(dados, 'ponte'));
export const ponteLembrada = () => idbOp('readonly', (s) => s.get('ponte')).catch(() => null);
export const esquecerPonte = () => idbOp('readwrite', (s) => s.delete('ponte'));

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
  const nome = `imoveis-dados-${hojeIso()}.json`; // data local (toISOString daria o dia seguinte depois das 21h)
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
      // na nuvem (pasta-nuvem.js) o tamanho já vem na lista: não baixa o arquivo só para saber o tamanho
      const tamanho = h.tamanho ?? (await h.getFile()).size;
      itens.push({ nome, tamanho, foto: /\.(jpe?g|png|gif|webp)$/i.test(nome) });
    }
  }
  return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Tipos que o navegador executaria como página (com script e acesso aos dados do sistema) se fossem abertos:
 * não podem ser anexados. O anexo é de quem o inquilino ou o fornecedor entregou: não dá para confiar nele.
 */
const EXTENSOES_PROIBIDAS = /\.(html?|xhtml|svg|xml|mht|mhtml|m?js)$/i;
export const ERRO_TIPO_ARQUIVO = 'Este tipo de arquivo não pode ser anexado (página ou script: .html, .svg, .xml, .js). Salve como PDF ou imagem e anexe de novo.';

/** O arquivo pode ser anexado (não é página nem script)? */
export function nomeAnexavel(nome) {
  return !EXTENSOES_PROIBIDAS.test(String(nome || '').trim());
}

/** Tipos que abrem numa aba nova (PDF e fotos); os outros só se baixam. */
const TIPOS_ABRIR = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

/** Tipo seguro para abrir o anexo numa aba nova ('application/pdf', 'image/png'…), ou '' se ele deve ser só baixado. */
export function tipoParaAbrir(nome) {
  const ext = (String(nome || '').match(/\.([a-z0-9]+)$/i) || [])[1];
  return (ext && TIPOS_ABRIR[ext.toLowerCase()]) || '';
}

export async function salvarArquivo(dir, arquivo) {
  if (!nomeAnexavel(arquivo.name)) throw new Error(ERRO_TIPO_ARQUIVO);
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

/**
 * Guarda contra mover/juntar uma pasta para dentro dela mesma ou para ela própria (visto no OPFS do Chromium: nome com acento
 * resolvendo para a pasta-mãe, e "juntar" apagando a pasta do imóvel inteira). Devolve o motivo (texto) ou null se é seguro.
 */
async function destinoPerigoso(origem, paiNovo, novo) {
  try {
    if (await origem.isSameEntry(paiNovo) || (await origem.resolve(paiNovo)) !== null) return 'o destino fica dentro da própria pasta de origem';
    let destino = null;
    try { destino = await paiNovo.getDirectoryHandle(novo); } catch { /* não existe: ok */ }
    if (destino && await origem.isSameEntry(destino)) return 'origem e destino são a mesma pasta';
  } catch (e) {
    return `não deu para conferir origem e destino (${e.message})`;
  }
  return null;
}

async function contarArquivos(dir) {
  let n = 0;
  for await (const [, h] of dir.entries()) n += h.kind === 'file' ? 1 : await contarArquivos(h);
  return n;
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
  const perigo = await destinoPerigoso(origem, pai, novo);
  if (perigo) { console.warn(`Pasta "${antigo}" não renomeada para "${novo}": ${perigo}.`); return; }
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
  const perigo = await destinoPerigoso(origem, paiNovo, novo);
  if (perigo) { console.warn(`Pasta "${antigo}" não movida para "${novo}": ${perigo}.`); return; }
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
  // nunca junta uma pasta com ela mesma nem a leva para dentro dela: isso apagaria a pasta inteira (os arquivos "repetidos" são os próprios)
  const perigo = await destinoPerigoso(origem, paiNovo, novo);
  if (perigo) { console.warn(`Pasta "${antigo}" não juntada em "${novo}": ${perigo}.`); return contarArquivos(origem); }
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

async function mesmosBytes(a, b) {
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  if (x.byteLength !== y.byteLength) return false;
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  for (let i = 0; i < u.length; i += 1) if (u[i] !== v[i]) return false;
  return true;
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
    // vazio no destino: sobra de uma cópia que falhou no meio (ex.: OneDrive sincronizando); o de verdade é o da origem
    if (la && la.size !== arq.size && la.size && arq.size) { sobrou += 1; continue; }
    // mesmo nome e mesmo tamanho, mas conteúdo diferente: também fica na origem (nunca apagar sem conferir os bytes)
    if (la && la.size && la.size === arq.size && !await mesmosBytes(la, arq)) { sobrou += 1; continue; }
    if (!la || (!la.size && arq.size)) await escreverTexto(destino, nome, arq);
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
  // Confere todos os caminhos antes de gravar qualquer coisa: um nome inválido no meio deixaria a pasta
  // com metade dos anexos novos e o banco antigo. Cada parte do caminho passa por limparNome (igual ao anexar).
  const entradas = [];
  for (const n of nomes) {
    const partes = n.split('/');
    if (n.startsWith('/') || partes.includes('..') || (n !== ARQUIVO_BANCO && ![PASTA_ARQUIVOS, PASTA_MODELOS].includes(partes[0]))) {
      throw new Error(`Arquivo inesperado dentro do ZIP: ${n}`);
    }
    const entrada = zip.files[n];
    if (entrada.dir || n === ARQUIVO_BANCO) continue;
    const pastas = partes.slice(0, -1).map(limparNome);
    if (pastas.some((p) => !p) || partes.length < 2) throw new Error(`Arquivo inesperado dentro do ZIP: ${n}`);
    entradas.push({ entrada, pastas, nome: limparNome(partes.at(-1)) });
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
  for (const { entrada, pastas, nome } of entradas) {
    const dir = await subpasta(pasta, pastas);
    await escreverTexto(dir, nome, await entrada.async('blob'));
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
