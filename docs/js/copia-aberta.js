// Cópia aberta dos arquivos (pedido do dono em 15/11): na pasta do backup seguro, a subpasta "Arquivos dos imoveis" tem os
// anexos da nuvem SEM cifrar, organizados como no sistema (imóvel → Inquilinos → pessoa), para abrir, imprimir e copiar no Windows.
// É só leitura: o que se põe ou muda lá não volta ao sistema. Quem atualiza: o site neste computador (logo depois de anexar,
// apagar ou mover, e no botão do Backup seguro) e o atualizador do PC (atualizador-pc, de hora em hora). Os dois usam o mesmo
// registro (copia-aberta.json) e a mesma regra: baixa só o que é novo ou mudou e apaga da cópia o que saiu da nuvem.
// A mesma lógica está em atualizador-pc/atualizador.mjs (lá não dá para importar daqui): tests/copia-aberta.test.mjs confere os dois.

export const PASTA_COPIA = 'Arquivos dos imoveis';
export const ARQUIVO_COPIA = 'copia-aberta.json';

const PROIBIDOS = /[<>:"|?*]/g; // caracteres que o Windows não aceita em nomes
const RESERVADOS = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

/** Nome de uma parte do caminho que o Windows aceita (o sistema já evita a maioria; aqui é só a garantia). */
export function nomeWindows(parte) {
  let t = String(parte).replace(PROIBIDOS, '_').replace(/[. ]+$/, '');
  if (!t) t = '_';
  if (RESERVADOS.test(t)) t = `_${t}`;
  return t;
}
export const caminhoLocal = (caminho) => caminho.split('/').map(nomeWindows);

/**
 * O que fazer: `nuvem` = [{ caminho, tamanho, alterado }] (lista-tudo de arquivos/), `anterior` = o registro da última vez
 * ({ caminho: { tamanho, alterado } }). Baixa o que é novo ou mudou (tamanho ou data); apaga o que não está mais na nuvem.
 */
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

async function lerRegistro(dir) {
  try { return JSON.parse(await (await (await dir.getFileHandle(ARQUIVO_COPIA)).getFile()).text()); } catch { return null; }
}
async function gravarRegistro(dir, reg) {
  const w = await (await dir.getFileHandle(ARQUIVO_COPIA, { create: true })).createWritable();
  await w.write(JSON.stringify(reg));
  await w.close();
}

/** Como está a cópia (para a tela do Backup seguro): { total, atualizado_em, por } ou null se nunca foi feita. */
export async function situacaoCopia(dir) {
  const r = await lerRegistro(dir);
  return r ? { total: Object.keys(r.arquivos || {}).length, atualizado_em: r.atualizado_em, por: r.por, falhas: r.falhas || 0 } : null;
}

async function pastaDe(dir, partes, criar) {
  let p = dir;
  for (const parte of partes) p = await p.getDirectoryHandle(parte, { create: criar });
  return p;
}

/**
 * Lê um arquivo da cópia aberta (caminho dentro de arquivos/), para abrir anexos sem internet neste computador
 * (pasta-nuvem.js, `daCopiaLocal`). Pode ser a versão da última atualização da cópia. Sem o arquivo, lança erro.
 */
export async function lerDaCopia(dir, caminho) {
  const p = caminhoLocal(caminho);
  const pai = await pastaDe(await dir.getDirectoryHandle(PASTA_COPIA), p.slice(0, -1), false);
  return (await pai.getFileHandle(p.at(-1))).getFile();
}

/**
 * Atualiza a cópia na pasta `dir` (a do backup seguro). `listar()` devolve a lista da nuvem; `ler(caminho)` o Blob do arquivo
 * (caminho dentro de arquivos/). `aoAndar({ feitos, total })`. Devolve { baixados, apagados, falhas, total }.
 */
export async function atualizarCopia(dir, { listar, ler, aoAndar = () => {}, por = 'site' }) {
  const reg = (await lerRegistro(dir)) || { arquivos: {} };
  const arquivos = { ...(reg.arquivos || {}) };
  const { baixar, apagar, atual } = planoCopia(await listar(), arquivos);
  const raiz = await dir.getDirectoryHandle(PASTA_COPIA, { create: true });
  const salvar = (falhas) => gravarRegistro(dir, { atualizado_em: new Date().toISOString(), por, falhas, arquivos });
  let falhas = 0; let feitos = 0;
  const total = baixar.length + apagar.length;
  for (const c of apagar) {
    const p = caminhoLocal(c);
    try {
      const pai = await pastaDe(raiz, p.slice(0, -1), false);
      await pai.removeEntry(p.at(-1));
    } catch { /* já não estava lá */ }
    // pastas que ficaram vazias saem também (removeEntry sem recursive recusa pasta com algo dentro)
    for (let i = p.length - 1; i >= 1; i -= 1) {
      try { await (await pastaDe(raiz, p.slice(0, i - 1), false)).removeEntry(p[i - 1]); } catch { break; }
    }
    delete arquivos[c];
    aoAndar({ feitos: (feitos += 1), total });
  }
  for (const c of baixar) {
    const p = caminhoLocal(c);
    try {
      const blob = await ler(c);
      const w = await (await (await pastaDe(raiz, p.slice(0, -1), true)).getFileHandle(p.at(-1), { create: true })).createWritable();
      await w.write(blob);
      await w.close();
      arquivos[c] = atual[c];
    } catch { falhas += 1; } // fica para a próxima vez (não entra no registro)
    feitos += 1;
    aoAndar({ feitos, total });
    if (feitos % 50 === 0) await salvar(falhas);
  }
  await salvar(falhas);
  return { baixados: baixar.length - falhas, apagados: apagar.length, falhas, total: Object.keys(arquivos).length };
}
