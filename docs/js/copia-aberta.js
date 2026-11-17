// Cópia aberta dos arquivos (pedido do dono em 15/11): na pasta do backup seguro, a subpasta "Arquivos dos imoveis" tem os
// anexos da nuvem SEM cifrar, organizados como no sistema (imóvel → Inquilinos → pessoa), para abrir, imprimir e copiar no Windows.
// É só leitura: o que se põe ou muda lá não volta ao sistema. Quem atualiza: o site neste computador (logo depois de anexar,
// apagar ou mover, e no botão do Backup seguro) e o atualizador do PC (atualizador-pc, de hora em hora). Os dois usam o mesmo
// registro (copia-aberta.json) e a mesma regra: baixa só o que é novo ou mudou e apaga da cópia o que saiu da nuvem.
// A mesma lógica está em atualizador-pc/atualizador.mjs (lá não dá para importar daqui): tests/copia-aberta.test.mjs confere os dois.

export const PASTA_COPIA = 'Arquivos dos imoveis';
export const ARQUIVO_COPIA = 'copia-aberta.json';
/**
 * O que saiu da nuvem não é apagado da cópia: vai para "Apagados na nuvem/AAAA-MM-DD/<caminho>" e fica `dias` (regra
 * `dias_lixeira_anexos`, padrão 30) antes de sair de vez (item 28 do mutirão 3000: anexo apagado por engano, ou uma lista vazia
 * da nuvem, sumia também do PC). O prazo vai no copia-aberta.json para o atualizador do PC usar o mesmo.
 */
export const PASTA_APAGADOS = 'Apagados na nuvem';
export const DIAS_APAGADOS = 30;
/** Dia de hoje em Brasília (AAAA-MM-DD), para o nome da pasta de cada dia em "Apagados na nuvem". */
export const diaDeHoje = (agora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
/** Pastas de dias de "Apagados na nuvem" que já passaram do prazo (nomes AAAA-MM-DD mais velhos que `dias`). */
export const diasVencidos = (nomes, dias = DIAS_APAGADOS, agora = new Date()) => {
  const limite = diaDeHoje(new Date(agora.getTime() - dias * 86400000));
  return nomes.filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n) && n < limite);
};
const EM_PARALELO = 5; // arquivos baixados ao mesmo tempo

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

/** Tipos que o Windows ou o navegador executam (programa, atalho, página, script): ficam fora da cópia aberta. */
const NAO_COPIAR = /\.(html?|xht(ml)?|svgz?|xml|xsl|xslt|mht|mhtml|m?js|jse|exe|com|bat|cmd|ps1|psm1|vbs|vbe|wsf|wsh|hta|lnk|scr|msi|msp|dll|cpl|pif|reg|jar|url|scf|inf|chm|application|appx|msix|gadget|iso|img|vhdx?)$/i;
export const copiavel = (caminho) => !NAO_COPIAR.test(String(caminho || '').replace(/[. ]+$/, ''));

/**
 * O que fazer: `nuvem` = [{ caminho, tamanho, alterado }] (lista-tudo de arquivos/), `anterior` = o registro da última vez
 * ({ caminho: { tamanho, alterado } }). Baixa o que é novo ou mudou (tamanho ou data); apaga o que não está mais na nuvem.
 */
export function planoCopia(nuvem, anterior = {}) {
  const atual = {};
  const baixar = [];
  for (const a of nuvem) {
    if (!copiavel(a.caminho)) continue; // programa ou página: não vai aberto para o Windows (o anexo continua na nuvem)
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

/** Tira de "Apagados na nuvem" os dias que passaram do prazo. */
async function faxinaApagados(dir, dias, agora) {
  let pasta;
  try { pasta = await dir.getDirectoryHandle(PASTA_APAGADOS); } catch { return; }
  const nomes = [];
  for await (const [nome, h] of pasta.entries()) if (h.kind === 'directory') nomes.push(nome);
  for (const n of diasVencidos(nomes, dias, agora)) { try { await pasta.removeEntry(n, { recursive: true }); } catch { /* fica para a próxima */ } }
}

/** Caminho do Windows gravado pelo atualizador do PC (`caminho_no_pc`), só se parecer um caminho inteiro (C:\… ou \\servidor\…). */
export const caminhoNoPc = (reg) => {
  const c = String(reg?.caminho_no_pc || '');
  return c.length < 400 && /^([A-Za-z]:\\|\\\\[^\\])/.test(c) && !/[\0-\x1f<>"|?*]/.test(c.slice(2)) ? c : '';
};

/**
 * Como está a cópia (para a tela do Backup seguro): { total, atualizado_em, por, falhas, caminho } ou null se nunca foi feita.
 * `caminho`: o caminho inteiro no Windows, quando o atualizador do PC já rodou (o navegador só conhece o nome da pasta); senão ''.
 */
export async function situacaoCopia(dir) {
  const r = await lerRegistro(dir);
  return r ? { total: Object.keys(r.arquivos || {}).length, atualizado_em: r.atualizado_em, por: r.por, falhas: r.falhas || 0, caminho: caminhoNoPc(r) } : null;
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
export async function atualizarCopia(dir, { listar, ler, aoAndar = () => {}, por = 'site', diasApagados = DIAS_APAGADOS, agora = new Date() }) {
  const reg = (await lerRegistro(dir)) || { arquivos: {} };
  const arquivos = { ...(reg.arquivos || {}) };
  const { baixar, apagar, atual } = planoCopia(await listar(), arquivos);
  const raiz = await dir.getDirectoryHandle(PASTA_COPIA, { create: true });
  // o caminho inteiro só o atualizador do PC sabe: fica o que ele gravou
  const caminho = caminhoNoPc(reg);
  const salvar = (falhas) => gravarRegistro(dir, { atualizado_em: new Date().toISOString(), por, falhas, dias_apagados: diasApagados, ...(caminho ? { caminho_no_pc: caminho } : {}), arquivos });
  let falhas = 0; let feitos = 0;
  const total = baixar.length + apagar.length;
  const hoje = diaDeHoje(agora);
  for (const c of apagar) {
    const p = caminhoLocal(c);
    try {
      const pai = await pastaDe(raiz, p.slice(0, -1), false);
      // guarda em "Apagados na nuvem/<hoje>/" antes de tirar da cópia (item 28)
      const arq = await (await pai.getFileHandle(p.at(-1))).getFile();
      const destino = await pastaDe(dir, [PASTA_APAGADOS, hoje, ...p.slice(0, -1)], true);
      const w = await (await destino.getFileHandle(p.at(-1), { create: true })).createWritable();
      await w.write(arq);
      await w.close();
      await pai.removeEntry(p.at(-1));
    } catch { /* já não estava lá */ }
    // pastas que ficaram vazias saem também (removeEntry sem recursive recusa pasta com algo dentro)
    for (let i = p.length - 1; i >= 1; i -= 1) {
      try { await (await pastaDe(raiz, p.slice(0, i - 1), false)).removeEntry(p[i - 1]); } catch { break; }
    }
    delete arquivos[c];
    aoAndar({ feitos: (feitos += 1), total });
  }
  // baixa alguns de cada vez (pasta nova com centenas de arquivos: um a um levava muitos minutos); cada arquivo continua
  // entrando no registro só depois de gravado, e o registro é salvo a cada 50 (um salvar de cada vez)
  let proximo = 0; let salvando = Promise.resolve();
  const baixarUm = async (c) => {
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
    if (feitos % 50 === 0) { salvando = salvando.then(() => salvar(falhas)).catch(() => {}); await salvando; }
  };
  const emFila = async () => { while (proximo < baixar.length) { const c = baixar[proximo]; proximo += 1; await baixarUm(c); } };
  await Promise.all(Array.from({ length: Math.min(EM_PARALELO, baixar.length) }, emFila));
  await salvando;
  await salvar(falhas);
  await faxinaApagados(dir, diasApagados, agora);
  return { baixados: baixar.length - falhas, apagados: apagar.length, falhas, total: Object.keys(arquivos).length };
}
