// Atualizador da versão PC: programinha que roda no computador do administrador (agendado pelo Windows, como o Windows Update)
// e traz da nuvem os dados de hoje e a versão PC mais nova, gravando na pasta do backup seguro, cifrados com a chave que já está lá.
// Assim a cópia do PC fica em dia mesmo nos dias em que o sistema só foi usado no celular.
// Também mantém a cópia ABERTA dos arquivos (pasta "Arquivos dos imoveis", sem cifrar, para abrir no Windows): mesma regra de
// docs/js/copia-aberta.js (tests/copia-aberta.test.mjs confere as duas).
// Uso: node atualizador.mjs (dados, versão PC e arquivos) ou node atualizador.mjs --arquivos (só a cópia aberta, de hora em hora);
// node atualizador.mjs --ligar abre a página para entrar com e-mail e senha (ligar.mjs): o computador
// recebe o crachá do aparelho, guardado cifrado pelo Windows. Sem crachá não entra (a chave de serviço e o .env da transição
// saíram em 25/11/2026). Não precisa de nada além do Node 20+. No programa .exe (programa.mjs, gerado por tools/gerar-exe.mjs,
// que traz o Node dentro) a mesma rotina é chamada por `principal`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErroNaoLigado, SITE_PADRAO, janelaDeLigar, lerLigacao } from './ligar.mjs';

/** No .exe (tools/gerar-exe.mjs põe esta marca antes de tudo): { versao }. Rodando pelo Node, não existe. */
export const EXE = globalThis.PROGRAMA_EXE || null;
const PASTA = EXE ? path.dirname(process.execPath) : path.dirname(fileURLToPath(import.meta.url));
/** Como a pessoa liga o computador de novo (texto dos avisos). */
export const COMO_LIGAR = EXE ? 'abra o programa Administracao-de-Imoveis.exe (dois cliques)' : 'rode node atualizador.mjs --ligar';
export const PASTA_DIARIO = 'copias-diarias';
export const PASTA_PROGRAMA = 'programa';
export const ARQUIVO_CHAVE = 'chave-do-backup.json';
export const ARQUIVO_REGISTRO = 'ultima-atualizacao.txt';
export const ARQUIVO_PROGRAMA = 'administracao-imoveis.html';
export const PASTA_COPIA = 'Arquivos dos imoveis'; // iguais a docs/js/copia-aberta.js
export const ARQUIVO_COPIA = 'copia-aberta.json';
export const PASTA_APAGADOS = 'Apagados na nuvem'; // iguais a docs/js/copia-aberta.js (item 28)
export const DIAS_APAGADOS = 30;
export const diaDeHoje = (agora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
export const diasVencidos = (nomes, dias = DIAS_APAGADOS, agora = new Date()) => {
  const limite = diaDeHoje(new Date(agora.getTime() - dias * 86400000));
  return nomes.filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n) && n < limite);
};
export const ARQUIVO_TRAVA = 'copia-aberta.trava'; // uma rodada da cópia aberta por vez (a de hora em hora e a das 20h podem se cruzar)
export const VALIDADE_TRAVA = 15 * 60000; // trava parada há mais que isso é de uma rodada que morreu: a próxima passa por cima
export const TEMPO_CONSULTA = 30000; // tempo-limite de cada consulta à nuvem (sem ele, uma conexão presa travaria a tarefa para sempre)
export const TEMPO_DOWNLOAD = 120000; // idem para baixar um arquivo (dados, versão PC, anexo)
export const BAIXAR_JUNTOS = 5; // arquivos da cópia aberta baixados ao mesmo tempo
export const MAX_ERROS_REGISTRO = 5; // falhas da cópia aberta que vão para ultima-atualizacao.txt (caminho e motivo)
const prazo = (ms) => AbortSignal.timeout(ms);
export const MANTER_DIARIOS = 60; // igual a MANTER_DIARIOS de docs/js/backup-seguro.js
const MAGICO = 'IMOVEIS-BACKUP-SEGURO-1'; // igual ao de docs/js/backup-seguro.js (tests/atualizador-pc.test.mjs confere abrindo o arquivo)

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
/**
 * Como este computador entra: só com o crachá do aparelho (ligado com e-mail e senha, ligar.mjs). `ligacao` = lerLigacao()
 * (trocada nos testes). Sem crachá: ErroNaoLigado. (A chave de serviço do .env antigo saiu em 25/11/2026.)
 */
export function carregarConfig(env = process.env, ligacao = lerLigacao(env)) {
  if (ligacao?.cracha) return { site: String(ligacao.site || SITE_PADRAO).replace(/\/+$/, ''), pasta: ligacao.pasta, cracha: ligacao.cracha, computador: ligacao.computador };
  throw new ErroNaoLigado(`Este computador ainda não está ligado ao sistema: ${COMO_LIGAR} e entre com o e-mail e a senha do sistema.`);
}

/**
 * Endereços e cabeçalhos para falar com a nuvem: tudo por /api/aparelho/ (fora do login do Access, só leitura), com o crachá;
 * a versão PC também por lá. Sem crachá não há outro caminho: ErroNaoLigado.
 */
export function acesso(cfg) {
  if (!cfg?.cracha) throw new ErroNaoLigado(`Este computador ainda não está ligado ao sistema: ${COMO_LIGAR} e entre com o e-mail e a senha do sistema.`);
    // a versão do programa vai junto: o sistema mostra em Usuários → Aparelhos ligados (o programa se atualiza sozinho)
  return { api: `${cfg.site}/api/aparelho/`, programa: `${cfg.site}/api/aparelho/programa`, cabecalhos: { Authorization: `Bearer ${cfg.cracha}`, ...(EXE?.versao ? { 'X-Programa-Versao': EXE.versao } : {}) },
    recusou: (status) => `A nuvem não aceitou o crachá deste computador (resposta ${status}). Se ele foi desligado em Usuários, ligue de novo (${COMO_LIGAR}); se for logo depois de instalar, confira a regra "Bypass" do Access (README.md).` };
}

/** Resposta da nuvem em JSON; erro com o motivo (o Access responde com a página de login, que não é JSON). */
async function lerJson(r, a) {
  if (!(r.headers.get('content-type') || '').includes('json')) throw new Error(a.recusou(r.status));
  const corpo = await r.text();
  if (!r.ok) throw new Error(`A nuvem recusou: ${JSON.parse(corpo).erro || r.status}`);
  return corpo;
}

/**
 * Baixa os dados de hoje (GET /api/dados/tudo, o mesmo formato do imoveis-dados.json) e a versão PC, se houver mais nova,
 * e grava na pasta do backup seguro. `buscar` é o fetch (trocado nos testes); `hoje` idem.
 * Devolve { dados: nome do arquivo gravado, programa: 'atualizado' | 'em dia' | 'falhou: …' }.
 */
export async function atualizar(cfg, { buscar = fetch, hoje = hojeIso() } = {}) {
  const caminhoChave = path.join(cfg.pasta, ARQUIVO_CHAVE);
  if (!fs.existsSync(caminhoChave)) throw new Error(`A pasta ${cfg.pasta} não é uma pasta de backup seguro (falta ${ARQUIVO_CHAVE}). Ligue o backup seguro no sistema (Sistema) nesta pasta primeiro.`);
  const chave = JSON.parse(fs.readFileSync(caminhoChave, 'utf8'));
  if (chave.formato !== MAGICO) throw new Error(`${ARQUIVO_CHAVE} não é deste sistema.`);
  const a = acesso(cfg);
  const { cabecalhos } = a;

  // 1. os dados, como estão agora na nuvem
  const corpo = await lerJson(await buscar(`${a.api}dados/tudo`, { headers: { ...cabecalhos, Accept: 'application/json' }, redirect: 'manual', signal: prazo(TEMPO_DOWNLOAD) }), a);
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
    const cab = await buscar(a.programa, { method: 'HEAD', headers: cabecalhos, redirect: 'manual', signal: prazo(TEMPO_CONSULTA) });
    // a versão PC vem do GitHub, pela nuvem (ETag; Last-Modified se o ETag faltar)
    const publicada = cab.ok ? (cab.headers.get('etag') || cab.headers.get('last-modified') || '') : '';
    if (!cab.ok && cab.status !== 304) throw new Error(`resposta ${cab.status}`);
    if (publicada && publicada !== atual) {
      const p = await buscar(a.programa, { headers: cabecalhos, redirect: 'manual', signal: prazo(TEMPO_DOWNLOAD) });
      const html = await p.text();
      if (!p.ok || !html.includes('<html')) throw new Error(`resposta ${p.status}`);
      const destino = path.join(pastaPrograma, ARQUIVO_PROGRAMA);
      fs.writeFileSync(`${destino}.parte`, html);
      fs.renameSync(`${destino}.parte`, destino); // troca inteira: a versão PC nunca fica pela metade
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

/** Tipos que o Windows ou o navegador executam (programa, atalho, página, script): ficam fora da cópia aberta. */
const NAO_COPIAR = /\.(html?|xht(ml)?|svgz?|xml|xsl|xslt|mht|mhtml|m?js|jse|exe|com|bat|cmd|ps1|psm1|vbs|vbe|wsf|wsh|hta|lnk|scr|msi|msp|dll|cpl|pif|reg|jar|url|scf|inf|chm|application|appx|msix|gadget|iso|img|vhdx?)$/i;
export const copiavel = (caminho) => !NAO_COPIAR.test(String(caminho || '').replace(/[. ]+$/, ''));

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

const codificar = (caminho) => caminho.split('/').map(encodeURIComponent).join('/');

/**
 * Trava da cópia aberta: um arquivo na pasta, criado só se não existe. Devolve { renovar, soltar } ou null (outra rodada em
 * andamento). Trava sem renovação há mais de VALIDADE_TRAVA é de uma rodada que morreu (computador desligado no meio): sai.
 */
export function travarCopia(pasta, agora = () => Date.now()) {
  const arq = path.join(pasta, ARQUIVO_TRAVA);
  const criar = () => { try { fs.writeFileSync(arq, `${process.pid} ${new Date(agora()).toISOString()}\n`, { flag: 'wx' }); return true; } catch (e) { if (e.code === 'EEXIST') return false; throw e; } };
  if (!criar()) {
    let parada = true;
    try {
      const desde = Date.parse(fs.readFileSync(arq, 'utf8').trim().split(' ')[1]);
      parada = agora() - (Number.isNaN(desde) ? fs.statSync(arq).mtimeMs : desde) > VALIDADE_TRAVA; // ilegível: vale a data do arquivo
    } catch { /* sumiu agora: tenta de novo */ }
    if (!parada) return null;
    try { fs.unlinkSync(arq); } catch { /* outra rodada tirou */ }
    if (!criar()) return null;
  }
  return {
    renovar: () => { try { fs.writeFileSync(arq, `${process.pid} ${new Date(agora()).toISOString()}\n`); } catch { /* segue sem renovar */ } },
    soltar: () => { try { fs.unlinkSync(arq); } catch { /* já saiu */ } },
  };
}

/**
 * Baixa da nuvem (lista-tudo/arquivos/ e arquivos/<caminho>) o que é novo ou mudou e apaga da cópia o que saiu da nuvem.
 * Arquivo que sumiu da cópia (apagado à mão) volta. Devolve { baixados, apagados, falhas, total }; com outra rodada em
 * andamento, não faz nada e devolve { ocupada: true }. `erros` recebe as primeiras falhas ({ caminho, motivo }).
 */
export async function atualizarCopia(cfg, { buscar = fetch, erros = [] } = {}) {
  const trava = travarCopia(cfg.pasta);
  if (!trava) return { ocupada: true };
  try { return await copiar(cfg, buscar, erros, trava); } finally { trava.soltar(); }
}

async function copiar(cfg, buscar, erros, trava) {
  const a = acesso(cfg);
  const { cabecalhos } = a;
  const raiz = path.join(cfg.pasta, PASTA_COPIA);
  const arqReg = path.join(cfg.pasta, ARQUIVO_COPIA);
  let reg = { arquivos: {} };
  try { reg = JSON.parse(fs.readFileSync(arqReg, 'utf8')); } catch { /* primeira vez */ }
  const arquivos = { ...(reg.arquivos || {}) };
  for (const c of Object.keys(arquivos)) if (!fs.existsSync(path.join(raiz, ...caminhoLocal(c)))) delete arquivos[c];
  const nuvem = [];
  let cursor;
  for (let n = 0; n < 1000; n += 1) {
    const r = await buscar(`${a.api}lista-tudo/arquivos/${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: { ...cabecalhos, Accept: 'application/json' }, redirect: 'manual', signal: prazo(TEMPO_CONSULTA) });
    if (!(r.headers.get('content-type') || '').includes('json')) throw new Error(a.recusou(r.status));
    const corpo = await r.json();
    trava.renovar();
    if (!r.ok) throw new Error(`A nuvem recusou a lista dos arquivos: ${corpo.erro || r.status}`);
    nuvem.push(...corpo.arquivos);
    if (!corpo.mais) break;
    cursor = corpo.cursor;
  }
  const { baixar, apagar, atual } = planoCopia(nuvem, arquivos);
  // o prazo de "Apagados na nuvem" é o que o site gravou no registro (regra dias_lixeira_anexos); sem ele, 30 dias
  const dias = Number.isInteger(reg.dias_apagados) && reg.dias_apagados > 0 ? reg.dias_apagados : DIAS_APAGADOS;
  // caminho_no_pc: o caminho inteiro da cópia neste computador, para o botão "Copiar o caminho" do site (o navegador só sabe o nome da pasta)
  const salvar = (falhas) => fs.writeFileSync(arqReg, JSON.stringify({ atualizado_em: new Date().toISOString(), por: 'atualizador', falhas, dias_apagados: dias, caminho_no_pc: path.resolve(raiz), arquivos }));
  const apagados = path.join(cfg.pasta, PASTA_APAGADOS, diaDeHoje());
  for (const c of apagar) {
    const p = caminhoLocal(c);
    // não apaga: guarda em "Apagados na nuvem/<hoje>/" (item 28; uma lista vazia da nuvem não esvazia o PC)
    try { fs.mkdirSync(path.join(apagados, ...p.slice(0, -1)), { recursive: true }); fs.renameSync(path.join(raiz, ...p), path.join(apagados, ...p)); } catch { /* já não estava */ }
    for (let i = p.length - 1; i >= 1; i -= 1) { try { fs.rmdirSync(path.join(raiz, ...p.slice(0, i))); } catch { break; } } // só pasta vazia
    delete arquivos[c];
  }
  let falhas = 0; let feitos = 0;
  const baixarUm = async (c) => {
    const destino = path.join(raiz, ...caminhoLocal(c));
    try {
      const r = await buscar(`${a.api}arquivos/${codificar(c)}`, { headers: cabecalhos, redirect: 'manual', signal: prazo(TEMPO_DOWNLOAD) });
      if (!r.ok) throw new Error(`resposta ${r.status}`);
      const bytes = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(`${destino}.parte`, bytes);
      fs.renameSync(`${destino}.parte`, destino);
      arquivos[c] = atual[c];
    } catch (e) {
      falhas += 1;
      if (erros.length < MAX_ERROS_REGISTRO) erros.push({ caminho: c, motivo: e.name === 'TimeoutError' ? `demorou mais de ${TEMPO_DOWNLOAD / 1000} segundos` : String(e.message || e) });
      try { fs.unlinkSync(`${destino}.parte`); } catch { /* nada */ }
    }
    feitos += 1;
    if (feitos % 50 === 0) { salvar(falhas); trava.renovar(); }
  };
  // BAIXAR_JUNTOS de cada vez: cada "fila" pega o próximo da lista quando termina o seu
  let proximo = 0;
  const fila = async () => { while (proximo < baixar.length) { const c = baixar[proximo]; proximo += 1; await baixarUm(c); } };
  await Promise.all(Array.from({ length: Math.min(BAIXAR_JUNTOS, baixar.length) }, fila));
  salvar(falhas);
  try {
    const base = path.join(cfg.pasta, PASTA_APAGADOS);
    for (const n of diasVencidos(fs.readdirSync(base), dias)) fs.rmSync(path.join(base, n), { recursive: true, force: true });
  } catch { /* ainda não há "Apagados na nuvem" */ }
  return { baixados: baixar.length - falhas, apagados: apagar.length, falhas, total: Object.keys(arquivos).length };
}

/** Texto da cópia aberta para o registro (ultima-atualizacao.txt). */
const resumoCopia = (c) => (c.ocupada ? 'arquivos=outra atualização dos arquivos em andamento (esta não repetiu)' : `arquivos=${c.total} (baixados ${c.baixados}, tirados ${c.apagados}${c.falhas ? `, ${c.falhas} falharam` : ''})`);
/** As primeiras falhas, uma por linha, para o registro: "  falhou: <caminho>: <motivo>". */
export const linhasDeErros = (erros) => erros.map((e) => `  falhou: ${e.caminho}: ${String(e.motivo).replace(/\s+/g, ' ').slice(0, 200)}\n`).join('');

/** A rotina inteira (o que `node atualizador.mjs` e o .exe fazem): liga se for preciso, atualiza e registra. `true` se deu certo. */
export async function principal(args = []) {
  try {
    const soArquivos = args.includes('--arquivos');
    let cfg;
    try { cfg = args.includes('--ligar') ? null : carregarConfig(); } catch (e) {
      // sem crachá: só abre a página quando há alguém olhando (a tarefa de hora em hora roda escondida)
      if (!(e instanceof ErroNaoLigado) || soArquivos || !process.stdout.isTTY) throw e;
    }
    if (!cfg) {
      const env = process.env; // SITE e PASTA_BACKUP só para quem testa com outro endereço
      console.log('Abrindo no navegador a página para ligar este computador (e-mail e senha do sistema)…');
      const lig = await janelaDeLigar({ site: String(env.SITE || SITE_PADRAO).replace(/\/+$/, ''), padrao: { pasta: env.PASTA_BACKUP || '' }, aoAbrir: (url) => console.log(`Se não abriu sozinha: ${url}`) });
      console.log(`Ligado: ${lig.computador} (${lig.login}). Fazendo a primeira atualização…`);
      cfg = carregarConfig();
    }
    const r = soArquivos ? null : await atualizar(cfg);
    let copia; let copiaOk = true; const erros = [];
    try { copia = resumoCopia(await atualizarCopia(cfg, { erros })); } catch (e) { copiaOk = false; copia = `arquivos: ${e.name === 'TimeoutError' ? 'a nuvem demorou demais para responder' : e.message}`; }
    // a cópia aberta inteira falhou: a linha começa com FALHOU e o programa sai com erro (o Agendador de Tarefas mostra)
    const linha = `${copiaOk ? 'ok' : 'FALHOU'} ${r ? `dados=${r.dados} programa=${r.programa} ` : ''}${copia}`;
    fs.writeFileSync(path.join(cfg.pasta, ARQUIVO_REGISTRO), `${new Date().toISOString()} ${linha}\n${linhasDeErros(erros)}`);
    console.log(r ? `Atualizado: ${r.dados} em ${path.join(cfg.pasta, PASTA_DIARIO)}; versão PC ${r.programa}; ${copia}.` : `Cópia aberta: ${copia}.`);
    for (const e of erros) console.log(`  falhou: ${e.caminho}: ${e.motivo}`);
    if (!copiaOk) process.exitCode = 1;
    return copiaOk;
  } catch (e) {
    const motivo = e.name === 'TimeoutError' ? 'a nuvem demorou demais para responder (sem internet ou conexão ruim)' : e.message;
    console.error(`Falhou: ${motivo}`);
    try { fs.writeFileSync(path.join(carregarConfig().pasta, ARQUIVO_REGISTRO), `${new Date().toISOString()} FALHOU ${motivo}\n`); } catch { /* sem pasta */ }
    process.exitCode = 1;
    return false;
  }
}

if (!EXE && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal(process.argv.slice(2));
