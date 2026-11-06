// Etapa 4 da nuvem: leva a pasta dos dados de hoje (OneDrive) para a nuvem e confere tudo.
// 1) anexos (arquivos/ e modelos/), um por um, pulando o que já subiu com o mesmo tamanho (dá para repetir se cair no meio);
// 2) o banco (imoveis-dados.json) de uma vez; 3) conferência: cada tabela e cada arquivo da nuvem contra a pasta.
// A pasta do computador não é alterada. Os backups da pasta não vão (a nuvem faz os seus).
import { ARQUIVO_BANCO, PASTA_ARQUIVOS, PASTA_MODELOS, lerBanco, lerConteudo } from './armazenamento.js';
import { canon, RAIZ_DO_SERVIDOR } from './nuvem.js';

const codificar = (partes) => partes.map(encodeURIComponent).join('/');

/** Todos os arquivos de uma pasta (com as subpastas): [{ partes, handle, tamanho }]. */
async function percorrer(dir, partes, lista) {
  for await (const [nome, h] of dir.entries()) {
    if (h.kind === 'directory') await percorrer(h, [...partes, nome], lista);
    else lista.push({ partes: [...partes, nome], handle: h, tamanho: (await h.getFile()).size });
  }
  return lista;
}

/** O que a nuvem tem numa pasta (nome → tamanho), com cache por pasta durante a passagem. */
async function naNuvem(anexos, cache, pastaPartes) {
  const k = pastaPartes.join('/');
  if (!cache.has(k)) {
    let mapa = new Map();
    try {
      const r = await (await anexos.pedir('GET', `lista/${codificar(pastaPartes)}/`)).json();
      mapa = new Map(r.arquivos.map((a) => [a.nome, a.tamanho]));
    } catch (e) { if (e.status !== 404) throw e; }
    cache.set(k, mapa);
  }
  return cache.get(k);
}

/**
 * Leva a pasta para a nuvem. `pasta`: a pasta dos dados (FileSystemDirectoryHandle). `anexos`: AnexosNuvem. `sinc`: Sincronia.
 * `aoAndar({ fase, feitos, total, bytes, totalBytes, nome })` mostra o andamento. Devolve o relatório da conferência.
 */
export async function levarParaNuvem(pasta, { anexos, sinc, aoAndar = () => {}, substituir = false }) {
  const dados = await lerBanco(pasta);
  if (!dados) throw Object.assign(new Error(`A pasta escolhida não tem o arquivo ${ARQUIVO_BANCO}. Escolha a pasta dos dados de sempre.`), { esperado: true });
  const arquivos = [];
  for (const raiz of [PASTA_ARQUIVOS, PASTA_MODELOS]) {
    let dir;
    try { dir = await pasta.getDirectoryHandle(raiz); } catch { continue; }
    await percorrer(dir, [raiz], arquivos);
  }
  const total = arquivos.length; const totalBytes = arquivos.reduce((s, a) => s + a.tamanho, 0);
  let feitos = 0; let bytes = 0; let pulados = 0;
  const recusados = []; const cache = new Map();
  for (const a of arquivos) {
    aoAndar({ fase: 'anexos', feitos, total, bytes, totalBytes, nome: a.partes.join('/') });
    const la = await naNuvem(anexos, cache, a.partes.slice(0, -1));
    if (la.get(a.partes.at(-1)) === a.tamanho) pulados += 1; // já subiu (passagem repetida)
    else {
      try {
        await anexos.pedir('PUT', codificar(a.partes), { corpo: await lerConteudo(a.handle) });
      } catch (e) {
        if (!e.status || e.status === 401 || e.status >= 500) throw Object.assign(new Error(`A internet caiu no arquivo ${a.partes.join('/')}. Clique de novo: o que já subiu é pulado.`), { esperado: true });
        recusados.push({ caminho: a.partes.join('/'), motivo: e.message });
      }
    }
    feitos += 1; bytes += a.tamanho;
  }
  aoAndar({ fase: 'dados', feitos, total, bytes, totalBytes, nome: ARQUIVO_BANCO });
  await sinc.importar(dados, { substituir });
  aoAndar({ fase: 'conferencia', feitos, total, bytes, totalBytes, nome: '' });
  return { ...(await conferir(dados, arquivos, { anexos, sinc })), total, totalBytes, pulados, recusados };
}

/** Confere a nuvem contra a pasta: cada tabela e campo do banco, e cada arquivo (nome e tamanho). */
export async function conferir(dados, arquivos, { anexos, sinc }) {
  await sinc.baixarTudo();
  const nuvem = sinc.atual();
  const diferencas = [];
  for (const k of new Set([...Object.keys(dados), ...Object.keys(nuvem)])) {
    if (RAIZ_DO_SERVIDOR.includes(k) && k !== 'historico') continue;
    if (canon(dados[k]) !== canon(nuvem[k])) diferencas.push(k);
  }
  const faltando = [];
  const cache = new Map();
  for (const a of arquivos) {
    const la = await naNuvem(anexos, cache, a.partes.slice(0, -1));
    if (la.get(a.partes.at(-1)) !== a.tamanho) faltando.push(a.partes.join('/'));
  }
  const registros = Object.values(dados).filter((v) => Array.isArray(v)).reduce((s, v) => s + v.length, 0);
  return { ok: !diferencas.length && !faltando.length, diferencas, faltando, registros };
}
