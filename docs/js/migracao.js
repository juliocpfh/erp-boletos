// Etapa 4 da nuvem: leva a pasta dos dados de hoje (OneDrive) para a nuvem e confere tudo.
// 1) anexos (arquivos/ e modelos/), 4 ao mesmo tempo, pulando o que já subiu com o mesmo tamanho (dá para repetir se cair no meio);
// 2) o banco (imoveis-dados.json) de uma vez; 3) conferência: cada tabela e cada arquivo da nuvem contra a pasta.
// A pasta do computador não é alterada. Os backups da pasta não vão (a nuvem faz os seus).
import { ARQUIVO_BANCO, PASTA_ARQUIVOS, PASTA_MODELOS, lerBanco, lerConteudo } from './armazenamento.js';
import { canon, RAIZ_DO_SERVIDOR } from './nuvem.js';
import { codificar } from './pasta-nuvem.js';

/** Quantos arquivos vão ao mesmo tempo (um por um demorava muito na internet de casa). */
export const SIMULTANEOS = 4;

/** Todos os arquivos de uma pasta (com as subpastas): [{ partes, handle, tamanho }]. */
async function percorrer(dir, partes, lista) {
  for await (const [nome, h] of dir.entries()) {
    if (h.kind === 'directory') await percorrer(h, [...partes, nome], lista);
    else lista.push({ partes: [...partes, nome], handle: h, tamanho: (await h.getFile()).size });
  }
  return lista;
}

/**
 * O que a nuvem já tem: caminho da pasta → Map(nome → tamanho), numa ida por pasta principal (`lista-tudo`, em partes se for
 * grande; AnexosNuvem.arvore), em vez de uma `lista/` por pasta (centenas na pasta de verdade). Pasta que não aparece: vazia.
 */
async function naNuvem(anexos) {
  const tudo = new Map();
  for (const raiz of [PASTA_ARQUIVOS, PASTA_MODELOS]) {
    for (const [chave, l] of await anexos.arvore([raiz])) tudo.set(chave, l.arquivos);
  }
  return (partes) => tudo.get(partes.join('/')) || new Map();
}

const caiu = (e) => !e.status || e.status === 401 || e.status >= 500;

/**
 * Roda `fn(item)` para cada item com `n` trabalhadores ao mesmo tempo. Se `fn` lançar, ninguém pega item novo:
 * espera os que estão em andamento terminarem e só então lança o primeiro erro.
 */
async function emFila(itens, n, fn) {
  let i = 0; let erro = null;
  const trabalhador = async () => {
    while (!erro && i < itens.length) {
      const item = itens[i]; i += 1;
      try { await fn(item); } catch (e) { erro ||= e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
  if (erro) throw erro;
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
  const recusados = [];
  let jaTem;
  try { jaTem = await naNuvem(anexos); } catch (e) {
    if (caiu(e)) throw Object.assign(new Error('A internet caiu ao ver o que já está na nuvem. Clique de novo: o que já subiu é pulado.'), { esperado: true });
    throw e;
  }
  await emFila(arquivos, SIMULTANEOS, async (a) => {
    const caminho = a.partes.join('/');
    aoAndar({ fase: 'anexos', feitos, total, bytes, totalBytes, nome: caminho });
    try {
      if (jaTem(a.partes.slice(0, -1)).get(a.partes.at(-1)) === a.tamanho) pulados += 1; // já subiu (passagem repetida)
      else await anexos.pedir('PUT', codificar(a.partes), { corpo: await lerConteudo(a.handle) });
    } catch (e) {
      if (caiu(e)) throw Object.assign(new Error(`A internet caiu no arquivo ${caminho}. Clique de novo: o que já subiu é pulado.`), { esperado: true });
      recusados.push({ caminho, motivo: e.message });
    }
    feitos += 1; bytes += a.tamanho;
    aoAndar({ fase: 'anexos', feitos, total, bytes, totalBytes, nome: caminho });
  });
  recusados.sort((x, y) => x.caminho.localeCompare(y.caminho));
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
  // só os nomes e tamanhos (uma ida por pasta principal), sem baixar os arquivos
  const jaTem = await naNuvem(anexos);
  const faltando = arquivos.filter((a) => jaTem(a.partes.slice(0, -1)).get(a.partes.at(-1)) !== a.tamanho).map((a) => a.partes.join('/'));
  faltando.sort();
  const registros = Object.values(dados).filter((v) => Array.isArray(v)).reduce((s, v) => s + v.length, 0);
  return { ok: !diferencas.length && !faltando.length, diferencas, faltando, registros };
}
