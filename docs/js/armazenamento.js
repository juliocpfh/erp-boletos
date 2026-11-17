// Leitura e gravação na pasta escolhida pelo usuário (ex.: uma pasta do OneDrive),
// usando a File System Access API do Chrome/Edge. Nada é enviado para a internet.
import { ErroUsuario, hojeIso } from './calculos.js';
import { normalizar } from './regras.js';
import { regra } from './config-regras.js';
import { compactarAnexo } from './compactar.js';

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

// versão PC (arquivo aberto do disco, file:): o IndexedDB é de todo HTML aberto do disco; o atalho da pasta não fica lembrado
const doDisco = () => typeof location !== 'undefined' && location.protocol === 'file:';
export const lembrarPasta = (handle) => (doDisco() ? Promise.resolve() : idbOp('readwrite', (s) => s.put(handle, 'pasta')));
export const pastaLembrada = () => (doDisco() ? Promise.resolve(null) : idbOp('readonly', (s) => s.get('pasta')).catch(() => null));
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

/** Data e tamanho do arquivo (muda a cada gravação, daqui ou de outro computador). */
const assinaturaDoArquivo = (arq) => `${arq.lastModified}:${arq.size}`;
const assinaturas = new WeakMap(); // banco lido → data e tamanho do arquivo de onde ele saiu
/** Data e tamanho do arquivo de onde ``dados`` (devolvido por lerBanco) foi lido, ou null. */
export const assinaturaLida = (dados) => assinaturas.get(dados) || null;
/** Data e tamanho do arquivo do banco agora, sem ler o conteúdo; null se não deu para ver (a conferência então lê tudo). */
export async function assinaturaDoBanco(pasta) {
  try {
    return assinaturaDoArquivo(await (await pasta.getFileHandle(ARQUIVO_BANCO)).getFile());
  } catch { return null; }
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
  const banco = normalizar(dados);
  // o arquivo lido tinha o tamanho anunciado? (gravação pela metade no meio da leitura: sem assinatura, lê de novo na próxima)
  if (banco && typeof banco === 'object' && Number.isFinite(arq.lastModified)) assinaturas.set(banco, assinaturaDoArquivo(arq));
  return banco;
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
// também programas e atalhos do Windows (.exe, .lnk, .hta…): o anexo vai aberto para a pasta do PC (cópia aberta)
const EXTENSOES_PROIBIDAS = /\.(html?|xht(ml)?|svgz?|xml|xsl|xslt|mht|mhtml|m?js|jse|exe|com|bat|cmd|ps1|psm1|vbs|vbe|wsf|wsh|hta|lnk|scr|msi|msp|dll|cpl|pif|reg|jar|url|scf|inf|chm|application|appx|msix|gadget|iso|img|vhdx?)$/i; // igual a worker.mjs
export const ERRO_TIPO_ARQUIVO = 'Este tipo de arquivo não pode ser anexado (página, script ou programa: .html, .svg, .xml, .js, .exe…). Salve como PDF ou imagem e anexe de novo.';

/** O arquivo pode ser anexado (não é página, script nem programa)? Pontos e espaços no fim saem do nome antes ("planta.svg."). */
export function nomeAnexavel(nome) {
  const limpo = String(nome || '').trim().replace(/[. ]+$/, '');
  return !EXTENSOES_PROIBIDAS.test(limpo) && !EXTENSOES_PROIBIDAS.test(limparNome(String(nome || '')));
}

/** Tipos que abrem numa aba nova (PDF e fotos); os outros só se baixam. */
const TIPOS_ABRIR = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

/** Tipo seguro para abrir o anexo numa aba nova ('application/pdf', 'image/png'…), ou '' se ele deve ser só baixado. */
export function tipoParaAbrir(nome) {
  const ext = (String(nome || '').match(/\.([a-z0-9]+)$/i) || [])[1];
  return (ext && TIPOS_ABRIR[ext.toLowerCase()]) || '';
}

/**
 * Grava o anexo na pasta com um nome livre (acrescenta " (2)" se já existir) e devolve o nome gravado.
 * Foto e PDF escaneado são compactados antes (compactar.js, regra "Compactar anexos"; a foto pode virar .jpg, por isso use o
 * nome devolvido). `compactar: false`: arquivo que só muda de lugar ou de nome. Os documentos que chegam pelo link da ficha não passam por aqui
 * (a nuvem grava direto): são compactados depois da conferência, em telas/fichas.js.
 */
export async function salvarArquivo(dir, arquivo, { compactar = true } = {}) {
  if (!nomeAnexavel(arquivo.name)) throw new ErroUsuario(ERRO_TIPO_ARQUIVO); // o usuário escolheu o arquivo errado: só na tela
  if (compactar && regra('compactar_anexos')) arquivo = (await compactarAnexo(arquivo)).arquivo;
  const nome = limparNome(arquivo.name);
  const ponto = nome.lastIndexOf('.');
  const [base, ext] = ponto > 0 ? [nome.slice(0, ponto), nome.slice(ponto)] : [nome, ''];
  let final = nome;
  for (let n = 2; ; n += 1) {
    if (!(await arquivoExiste(dir, final))) {
      if (!dir.gravarSeNovo) { await escreverTexto(dir, final, arquivo); return final; }
      // nuvem: grava "só se novo" (a lista da pasta fica guardada 60 s; outro aparelho pode ter gravado o mesmo nome): item 21
      try { await dir.gravarSeNovo(final, arquivo); return final; } catch (e) { if (e?.status !== 412) throw e; }
    }
    final = `${base} (${n})${ext}`;
  }
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
/** Junta os arquivos de uma pasta e das subpastas: [{ caminho, h, tamanho }] (tamanho já conhecido na nuvem, senão 0). */
async function listarParaZip(dir, prefixo, lista = []) {
  for await (const [nome, h] of dir.entries()) {
    if (h.kind === 'file') lista.push({ caminho: prefixo + nome, h, tamanho: h.tamanho || 0 });
    else await listarParaZip(h, `${prefixo}${nome}/`, lista);
  }
  return lista;
}

/**
 * ZIP com o banco e todos os anexos. `aoAndar(p)` (opcional) recebe o andamento para a barra de progresso:
 * { fase: 'listando' } · { fase: 'arquivos', feitos, total, bytes, totalBytes, nome } · { fase: 'compactando', pct }.
 * Na nuvem cada anexo é baixado um a um (pode levar minutos), por isso o andamento.
 */
export async function exportarZip(JSZip, pasta, dados, aoAndar = () => {}) {
  const zip = new JSZip();
  zip.file(ARQUIVO_BANCO, JSON.stringify(dados, null, 1));
  aoAndar({ fase: 'listando' });
  const lista = [];
  for (const sub of [PASTA_ARQUIVOS, PASTA_MODELOS]) {
    try {
      await listarParaZip(await pasta.getDirectoryHandle(sub), `${sub}/`, lista);
    } catch { /* pasta ainda não existe */ }
  }
  const totalBytes = lista.reduce((t, x) => t + x.tamanho, 0);
  let bytes = 0;
  const naoIncluidos = [];
  for (const [i, x] of lista.entries()) {
    aoAndar({ fase: 'arquivos', feitos: i, total: lista.length, bytes, totalBytes, nome: x.caminho });
    // um anexo que sumiu no meio (ou a internet falhou nele) não derruba o ZIP inteiro: fica na lista "não incluídos" (item 27)
    let arquivo;
    try { arquivo = await x.h.getFile(); } catch (e) { naoIncluidos.push(`${x.caminho}: ${e?.message || e}`); continue; }
    zip.file(x.caminho, arquivo);
    bytes += x.tamanho || arquivo.size || 0;
  }
  if (naoIncluidos.length) zip.file('NAO-INCLUIDOS.txt', `Arquivos que não entraram neste ZIP (não deu para ler):\r\n${naoIncluidos.join('\r\n')}\r\n`);
  aoAndar({ fase: 'compactando', pct: 0 });
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, (m) => aoAndar({ fase: 'compactando', pct: m.percent }));
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
  let guarda = null; // pasta com a cópia dos anexos que o ZIP vai trocar (item 26)
  if (dadosAtuais) {
    const dir = await pasta.getDirectoryHandle(PASTA_BACKUPS, { create: true });
    const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
    await escreverTexto(dir, `antes-da-importacao-${carimbo}.json`, JSON.stringify(dadosAtuais));
    guarda = { dir, nome: `antes-da-importacao-${carimbo}` };
  }
  for (const { entrada, pastas, nome } of entradas) {
    const dir = await subpasta(pasta, pastas);
    if (guarda && await arquivoExiste(dir, nome)) {
      // anexo de mesmo nome já na pasta: a versão de antes vai para backups/antes-da-importacao-…/ (sem desfazer, ficava perdida)
      await escreverTexto(await subpasta(guarda.dir, [guarda.nome, ...pastas]), nome, await lerConteudo(await dir.getFileHandle(nome)));
    }
    await escreverTexto(dir, nome, await entrada.async('blob'));
  }
  await gravarBanco(pasta, novos);
  if (guarda) await faxinaAntesDaImportacao(guarda.dir);
  return novos;
}

/** Cópias "antes da importação" (o .json e a pasta dos anexos trocados): ficam as MANTER_ANTES_IMPORTACAO mais recentes (item 51). */
export const MANTER_ANTES_IMPORTACAO = 5;
async function faxinaAntesDaImportacao(dir) {
  const nomes = new Set();
  for await (const [n] of dir.entries()) { const m = n.match(/^(antes-da-importacao-[0-9TZ-]+?)(\.json)?$/); if (m) nomes.add(m[1]); }
  const velhos = [...nomes].sort().slice(0, Math.max(0, nomes.size - MANTER_ANTES_IMPORTACAO));
  for (const v of velhos) {
    for (const [nome, recursive] of [[`${v}.json`, false], [v, true]]) {
      try { await dir.removeEntry(nome, { recursive }); } catch { /* um dos dois pode não existir */ }
    }
  }
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
