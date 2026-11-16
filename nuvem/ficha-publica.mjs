// Ficha cadastral pela internet (pedido do dono em 2026-11-14): o interessado (e cada fiador) recebe um link só dele,
// preenche os dados, manda os documentos e, depois, a ficha assinada (gov.br ou à mão). Endereço separado do sistema
// (ficha.ankjck.com.br, sem o login do Access: o sistema continua fechado); o link é a única chave.
//
// - Equipe (dentro do sistema, com login): POST /api/ficha-online/link cria o link (devolve o endereço com a chave depois do
//   "#", que não vai ao servidor nem aos registros), PUT …/pdf guarda a ficha em PDF para baixar, GET …/lista lê as respostas,
//   POST …/atualizar muda a situação (falta documento, assinar, visto) e POST …/encerrar desliga o link.
// - Público (só no endereço da ficha): GET /api/publico/ficha, POST …/enviar, PUT …/arquivo, POST …/desistir, GET …/pdf, com a
//   chave no cabeçalho X-Ficha-Token. Nada daqui lê o banco do sistema: só o que a equipe mandou para o link (nome, imóvel,
//   proposta, lista de documentos, os campos do formulário e o que já se sabe da pessoa).
// - R2: publico/fichas/<ficha>/<pessoa>.json (o registro do link, com as respostas), publico/tokens/<hash da chave> (aponta
//   para o registro; a chave em si não fica guardada), publico/fichas/<ficha>/<pessoa>.pdf; os documentos vão direto para a
//   pasta da ficha (arquivos/Fichas em analise/<pasta>/), com nome dado aqui, e aparecem na caixa de arquivos da ficha.
// - Os dados enviados nunca entram sozinhos na ficha: a equipe confere e traz (telas/fichas.js).
// - Avisos a cada etapa (e-mail para a pessoa e para a equipe, celular da equipe): avisos-ficha.mjs e push.mjs.
import { desinscrever, inscrever, pushLigado } from './push.mjs';

export const PESSOAS = ['interessado', 'fiador1', 'fiador2'];
export const SITUACOES_LINK = ['Aguardando', 'Respondida', 'Falta documento', 'Assinar', 'Assinada', 'Desistiu', 'Encerrado'];
const SITUACOES_EQUIPE = ['Aguardando', 'Respondida', 'Falta documento', 'Assinar', 'Assinada', 'Encerrado'];
export const DIAS_LINK = 7;
/** Depois do prazo, a página ainda mostra o que foi mandado por DIAS_LEITURA dias; passados DIAS_GUARDA, o registro do link sai (LGPD). */
export const DIAS_LEITURA = 30;
export const DIAS_GUARDA = 90;
const passou = (iso, dias) => Date.parse(iso) + dias * 86400000 < Date.now();
export const MAX_DOCUMENTO = 10 * 1024 * 1024;
export const MAX_ARQUIVOS = 40;
export const MAX_ENVIOS = 20;
const MAX_PDF = 5 * 1024 * 1024;
const MAX_PEDIDO = 128 * 1024;
const LEITURAS_JUNTAS = 10; // registros lidos ao mesmo tempo na lista dos links
const RAIZ_FICHAS = 'arquivos/Fichas em analise/';
const TIPOS_CAMPO = ['texto', 'cpf', 'cpfcnpj', 'tel', 'email', 'data', 'mes', 'dinheiro', 'opcao', 'area', 'simnao', 'inteiro'];

export class ErroFicha extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

const json = (status, dados, extra = {}) => new Response(JSON.stringify(dados), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra },
});

async function lerJson(request, maximo = MAX_PEDIDO) {
  const corpo = await lerBytes(request, maximo);
  try { return JSON.parse(new TextDecoder().decode(corpo)); } catch { throw new ErroFicha(400, 'Pedido inválido.'); }
}

/**
 * Corpo do pedido lido aos pedaços, contando os bytes: passou do máximo, para de ler na hora (o Content-Length pode faltar
 * ou mentir). Devolve o ArrayBuffer, ou null se passou. Com o tamanho declarado, a memória é reservada uma vez só.
 */
export async function lerAteLimite(request, maximo) {
  const declarado = Number(request.headers.get('Content-Length') || 0);
  if (declarado > maximo) return null;
  if (!request.body) return new ArrayBuffer(0);
  const leitor = request.body.getReader();
  let alvo = declarado > 0 ? new Uint8Array(declarado) : null; // caminho comum: tudo cabe aqui
  const partes = []; let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (total + value.byteLength > maximo) { try { await leitor.cancel(); } catch { /* já fechado */ } return null; }
    if (alvo && total + value.byteLength <= alvo.byteLength) alvo.set(value, total);
    else {
      if (alvo) { partes.push(alvo.slice(0, total)); alvo = null; } // veio mais do que o declarado: junta no fim
      partes.push(value);
    }
    total += value.byteLength;
  }
  if (alvo) return total === alvo.byteLength ? alvo.buffer : alvo.slice(0, total).buffer;
  const junto = new Uint8Array(total); let pos = 0;
  for (const p of partes) { junto.set(p, pos); pos += p.byteLength; }
  return junto.buffer;
}

async function lerBytes(request, maximo) {
  const corpo = await lerAteLimite(request, maximo);
  if (!corpo) throw new ErroFicha(413, `Arquivo grande demais (máximo ${Math.round(maximo / 1048576)} MB).`);
  return corpo;
}

/** Grava só se ainda não existe nada com esse nome (uma chamada só ao R2, sem "olhar e depois gravar"). */
export const SO_SE_NOVO = () => ({ onlyIf: new Headers({ 'If-None-Match': '*' }) });

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const hashDaChave = async (chave) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(chave))));
const novaChave = () => { const b = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

const chaveRegistro = (fichaId, pessoa) => `publico/fichas/${fichaId}/${pessoa}.json`;
const chavePdf = (fichaId, pessoa) => `publico/fichas/${fichaId}/${pessoa}.pdf`;
const chaveToken = (hash) => `publico/tokens/${hash}`;

async function lerRegistro(env, fichaId, pessoa) {
  const obj = await env.DADOS.get(chaveRegistro(fichaId, pessoa));
  return obj ? { registro: JSON.parse(await obj.text()), etag: obj.etag } : null;
}

/** Lê, muda e grava o registro sem perder uma mudança feita ao mesmo tempo (etag; tenta de novo até 4 vezes). */
async function mudarRegistro(env, fichaId, pessoa, mudar) {
  for (let i = 0; i < 4; i += 1) {
    const atual = await lerRegistro(env, fichaId, pessoa);
    if (!atual) throw new ErroFicha(404, 'Link não encontrado.');
    const novo = (await mudar(atual.registro)) || atual.registro;
    novo.atualizado_em = new Date().toISOString();
    const ok = await env.DADOS.put(chaveRegistro(fichaId, pessoa), JSON.stringify(novo), { onlyIf: { etagMatches: atual.etag }, httpMetadata: { contentType: 'application/json' } });
    if (ok) return novo;
  }
  throw new ErroFicha(409, 'Outra mudança ao mesmo tempo: tente de novo.');
}

// ---------------------------------------------------------------------------
// Conferência do que chega
// ---------------------------------------------------------------------------
const texto = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const fichaIdValido = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new ErroFicha(400, 'Ficha inválida.'); return n; };
const pessoaValida = (v) => { if (!PESSOAS.includes(v)) throw new ErroFicha(400, 'Pessoa inválida.'); return v; };

/** Campos do formulário mandados pela equipe: só o que a página sabe desenhar. */
export function formularioValido(lista) {
  if (!Array.isArray(lista) || lista.length > 120) throw new ErroFicha(400, 'Formulário inválido.');
  return lista.map((c) => {
    if (c && c.secao) return { secao: texto(c.secao, 120), ...(c.mostrarSe ? { mostrarSe: mostrarSeValido(c.mostrarSe) } : {}) };
    if (!c || !/^[a-z][a-z0-9_]{0,60}$/.test(c.nome) || !TIPOS_CAMPO.includes(c.tipo)) throw new ErroFicha(400, 'Formulário inválido.');
    return {
      nome: c.nome, tipo: c.tipo, rotulo: texto(c.rotulo, 120), ajuda: texto(c.ajuda, 300), obrig: !!c.obrig, largo: !!c.largo,
      ...(c.tipo === 'opcao' ? { opcoes: (Array.isArray(c.opcoes) ? c.opcoes : []).slice(0, 30).map((o) => texto(o, 120)) } : {}),
      ...(c.mostrarSe ? { mostrarSe: mostrarSeValido(c.mostrarSe) } : {}),
    };
  });
}
const lista = (v) => (Array.isArray(v) ? v : []).slice(0, 15).map((x) => texto(x, 300)).filter(Boolean);
/** Partes da lista de documentos (pessoa física): a página monta a lista pelo tipo de renda e o estado civil escolhidos. */
const listasValidas = (l) => ({
  inicio: lista(l.inicio), conjuge: lista(l.conjuge), renda_padrao: lista(l.renda_padrao), fim: lista(l.fim),
  renda: Object.fromEntries(Object.entries(l.renda && typeof l.renda === 'object' ? l.renda : {}).slice(0, 12).map(([k, v]) => [texto(k, 120), lista(v)])),
});
/** Todos os documentos que o link aceita (a lista de agora e as partes, que mudam com o que a pessoa escolhe). */
export function documentosAceitos(ctx) {
  const l = ctx.listas;
  return new Set([...ctx.documentos, ...(l ? [...l.inicio, ...l.conjuge, ...l.renda_padrao, ...l.fim, ...Object.values(l.renda).flat()] : [])]);
}
const mostrarSeValido = (m) => ({ campo: texto(m.campo, 60), valores: (Array.isArray(m.valores) ? m.valores : []).slice(0, 10).map((v) => texto(v, 120)) });

/** Valores digitados, conferidos pelo tipo de cada campo do formulário. Campo desconhecido é ignorado. */
export function valoresValidos(formulario, valores) {
  const out = {};
  const v = valores && typeof valores === 'object' ? valores : {};
  for (const c of formulario) {
    if (!c.nome || !(c.nome in v)) continue;
    const x = v[c.nome];
    if (x === null || x === '' || x === undefined) { out[c.nome] = null; continue; }
    if (c.tipo === 'simnao') out[c.nome] = x === true || x === '1' || x === 1;
    else if (c.tipo === 'dinheiro' || c.tipo === 'inteiro') {
      const n = Number(x);
      if (!Number.isInteger(n) || n < 0 || n > 1e11) throw new ErroFicha(400, `Valor inválido em "${c.rotulo}".`);
      out[c.nome] = n;
    } else if (c.tipo === 'data') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x))) throw new ErroFicha(400, `Data inválida em "${c.rotulo}".`);
      out[c.nome] = String(x);
    } else if (c.tipo === 'mes') {
      if (!/^\d{4}-\d{2}$/.test(String(x))) throw new ErroFicha(400, `Mês inválido em "${c.rotulo}".`);
      out[c.nome] = String(x);
    } else if (c.tipo === 'opcao') {
      const t = texto(x, 120);
      if (!c.opcoes.includes(t)) throw new ErroFicha(400, `Escolha uma opção da lista em "${c.rotulo}".`);
      out[c.nome] = t;
    } else out[c.nome] = texto(x, c.tipo === 'area' ? 2000 : 300) || null;
  }
  return out;
}

/** Tipo do arquivo pelos primeiros bytes (não pelo nome): só PDF, JPEG e PNG. */
export function tipoDoArquivo(bytes) {
  const b = new Uint8Array(bytes.slice(0, 8));
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  return null;
}

/** Nome do documento para o arquivo, sem acento. Ex.: "3 últimos holerites" → "3-ultimos-holerites". */
export const nomeSimples = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'documento';

// ---------------------------------------------------------------------------
// Equipe (com login; o Worker já conferiu o papel)
// ---------------------------------------------------------------------------
/**
 * Cria (ou troca) o link de uma pessoa da ficha. Corpo: { ficha_id, pessoa, pasta, contexto, formulario, valores }.
 * Devolve { url, vence_em }. O link anterior da mesma pessoa deixa de valer; as respostas dele continuam no registro.
 */
export async function criarLink(request, env, email) {
  const p = await lerJson(request);
  const fichaId = fichaIdValido(p.ficha_id);
  const pessoa = pessoaValida(p.pessoa);
  const pasta = String(p.pasta || '');
  if (!pasta.startsWith(RAIZ_FICHAS) || pasta.split('/').some((x) => !x || x === '.' || x === '..' || x.length > 200) || /[\\\u0000-\u001f]/.test(pasta)) throw new ErroFicha(400, 'Pasta da ficha inválida.');
  const formulario = formularioValido(p.formulario);
  const valores = valoresValidos(formulario, p.valores);
  const ctx = p.contexto || {};
  const contexto = {
    empresa: texto(ctx.empresa, 120), nome: texto(ctx.nome, 120), imovel: texto(ctx.imovel, 300), reserva: texto(ctx.reserva, 40),
    de: texto(ctx.de, 120), tipo: texto(ctx.tipo, 40),
    proposta: (Array.isArray(ctx.proposta) ? ctx.proposta : []).slice(0, 15).map(([a, b]) => [texto(a, 80), texto(b, 300)]),
    documentos: lista(ctx.documentos),
    ...(ctx.listas ? { listas: listasValidas(ctx.listas) } : {}),
    dica: texto(ctx.dica, 400),
  };
  const chave = novaChave();
  const hash = await hashDaChave(chave);
  const agora = new Date();
  const vence = new Date(agora.getTime() + DIAS_LINK * 86400000).toISOString();
  // O registro só entra se ninguém mexeu nele desde a leitura (a pessoa pode estar enviando pelo link antigo agora mesmo):
  // senão lê de novo e repete, para não perder a resposta ou o arquivo que acabou de chegar.
  let hashAntigo = null; let gravado = false;
  for (let i = 0; i < 4 && !gravado; i += 1) {
    const anterior = await lerRegistro(env, fichaId, pessoa);
    const velho = anterior ? anterior.registro : {};
    hashAntigo = velho.hash || null;
    const registro = {
      ficha_id: fichaId, pessoa, hash, pasta, contexto, formulario, valores_iniciais: valores,
      criado_em: agora.toISOString(), criado_por: email, vence_em: vence, atualizado_em: agora.toISOString(),
      situacao: velho.situacao && !['Encerrado', 'Desistiu'].includes(velho.situacao) ? velho.situacao : 'Aguardando',
      faltando: velho.faltando || [], respostas: velho.respostas || [], arquivos: velho.arquivos || [], eventos: [...(velho.eventos || []), { em: agora.toISOString(), texto: `link ${anterior ? 'renovado' : 'criado'} por ${email}` }].slice(-50),
      visto_em: velho.visto_em || null, desistiu_em: null, pdf: !!velho.pdf,
    };
    gravado = !!(await env.DADOS.put(chaveRegistro(fichaId, pessoa), JSON.stringify(registro), {
      ...(anterior ? { onlyIf: { etagMatches: anterior.etag } } : SO_SE_NOVO()), httpMetadata: { contentType: 'application/json' },
    }));
  }
  if (!gravado) throw new ErroFicha(409, 'Outra mudança ao mesmo tempo: tente de novo.');
  await env.DADOS.put(chaveToken(hash), JSON.stringify({ ficha_id: fichaId, pessoa }));
  // o ponteiro antigo só sai depois de gravados o registro e o ponteiro novos (ele já não vale: o registro tem outro hash)
  if (hashAntigo && hashAntigo !== hash) await env.DADOS.delete(chaveToken(hashAntigo));
  const base = String(env.URL_FICHA || 'https://ficha.ankjck.com.br/');
  return json(200, { ok: true, url: `${base}#${chave}`, vence_em: vence });
}

/** Ficha em PDF para a pessoa baixar (a do link, já com os dados que temos). */
export async function guardarPdf(request, env, url) {
  const fichaId = fichaIdValido(url.searchParams.get('ficha'));
  const pessoa = pessoaValida(url.searchParams.get('pessoa'));
  const corpo = await lerBytes(request, MAX_PDF);
  if (tipoDoArquivo(corpo) !== 'pdf') throw new ErroFicha(400, 'A ficha precisa ser um PDF.');
  await env.DADOS.put(chavePdf(fichaId, pessoa), corpo, { httpMetadata: { contentType: 'application/pdf' } });
  await mudarRegistro(env, fichaId, pessoa, (r) => { r.pdf = true; r.pdf_em = new Date().toISOString(); });
  return json(200, { ok: true });
}

const paraEquipe = (r) => { const { hash, ...resto } = r; return resto; };

/** Links de uma ficha (?ficha=ID: tudo, com as respostas) ou de todas (resumo para o Painel). */
export async function listarLinks(env, url) {
  const ficha = url.searchParams.get('ficha');
  const prefixo = ficha ? `publico/fichas/${fichaIdValido(ficha)}/` : 'publico/fichas/';
  const lista = [];
  /** Um registro: lê e devolve a linha da lista (ou null, se saiu ou passou da guarda). */
  const ler = async (chave) => {
    const obj = await env.DADOS.get(chave);
    if (!obj) return null;
    const reg = JSON.parse(await obj.text());
    // guarda: 90 dias depois do prazo o link sai inteiro (registro, ponteiro e PDF); os documentos ficam na pasta da ficha
    if (passou(reg.vence_em, DIAS_GUARDA)) {
      await env.DADOS.delete([chave, chave.replace(/\.json$/, '.pdf'), ...(reg.hash ? [chaveToken(reg.hash)] : [])]);
      return null;
    }
    return ficha ? paraEquipe(reg) : {
      ficha_id: reg.ficha_id, pessoa: reg.pessoa, situacao: reg.situacao, atualizado_em: reg.atualizado_em, visto_em: reg.visto_em,
      vence_em: reg.vence_em, criado_em: reg.criado_em, mudou_em: reg.mudou_em || null, ultimo_envio: (reg.respostas.at(-1) || {}).em || null, arquivos: reg.arquivos.length, desistiu_em: reg.desistiu_em,
      nome: reg.contexto.nome,
    };
  };
  let cursor;
  do {
    const r = await env.DADOS.list({ prefix: prefixo, cursor, limit: 1000 });
    const chaves = r.objects.map((o) => o.key).filter((k) => k.endsWith('.json'));
    // em blocos de LEITURAS_JUNTAS ao mesmo tempo (um a um, o Painel esperava uma ida ao R2 por link); a ordem da lista não muda
    for (let i = 0; i < chaves.length; i += LEITURAS_JUNTAS) {
      const bloco = await Promise.all(chaves.slice(i, i + LEITURAS_JUNTAS).map(ler));
      lista.push(...bloco.filter(Boolean));
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return json(200, { links: lista });
}

/** Equipe muda o link: { ficha_id, pessoa, situacao?, faltando?: [texto], visto?: true }. Falta documento e Assinar avisam a pessoa. */
export async function atualizarLink(request, env, email, avisar = null) {
  const p = await lerJson(request);
  const fichaId = fichaIdValido(p.ficha_id);
  const pessoa = pessoaValida(p.pessoa);
  let mudou = false;
  const novo = await mudarRegistro(env, fichaId, pessoa, (r) => {
    const antes = JSON.stringify([r.situacao, r.faltando]);
    if (p.situacao !== undefined) {
      if (!SITUACOES_EQUIPE.includes(p.situacao)) throw new ErroFicha(400, 'Situação inválida.');
      r.eventos.push({ em: new Date().toISOString(), texto: `situação "${p.situacao}" por ${email}` });
      if (r.situacao !== p.situacao) r.mudou_em = new Date().toISOString();
      r.situacao = p.situacao;
    }
    if (p.faltando !== undefined) r.faltando = (Array.isArray(p.faltando) ? p.faltando : []).slice(0, 15).map((x) => texto(x, 300)).filter(Boolean);
    if (p.visto) r.visto_em = new Date().toISOString();
    r.eventos = r.eventos.slice(-50);
    mudou = antes !== JSON.stringify([r.situacao, r.faltando]);
  });
  if (novo.situacao === 'Encerrado' && novo.hash) await env.DADOS.delete(chaveToken(novo.hash));
  // avisa a pessoa só quando muda de verdade (clicar duas vezes não repete) e com o link ainda no prazo
  const noPrazo = novo.vence_em > new Date().toISOString();
  if (avisar && mudou && noPrazo && p.situacao === 'Falta documento') await avisar(env, novo, 'falta');
  if (avisar && mudou && noPrazo && p.situacao === 'Assinar') await avisar(env, novo, 'assinar');
  return json(200, { ok: true, link: paraEquipe(novo) });
}

// ---------------------------------------------------------------------------
// Público (só com a chave do link)
// ---------------------------------------------------------------------------
async function registroDaChave(request, env, { gravar = false } = {}) {
  const chave = request.headers.get('X-Ficha-Token') || '';
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(chave)) throw new ErroFicha(404, 'Link inválido. Confira se copiou o endereço inteiro.');
  const hash = await hashDaChave(chave);
  const ponteiro = await env.DADOS.get(chaveToken(hash));
  if (!ponteiro) throw new ErroFicha(404, 'Este link não vale mais. Peça um novo para quem enviou.');
  const { ficha_id: fichaId, pessoa } = JSON.parse(await ponteiro.text());
  const atual = await lerRegistro(env, fichaId, pessoa);
  if (!atual || atual.registro.hash !== hash) throw new ErroFicha(404, 'Este link não vale mais. Peça um novo para quem enviou.');
  const r = atual.registro;
  if (r.situacao === 'Encerrado') throw new ErroFicha(410, 'Esta ficha foi encerrada. Qualquer dúvida, fale com quem enviou o link.');
  if (passou(r.vence_em, DIAS_LEITURA)) throw new ErroFicha(410, 'Este link não vale mais. Peça um novo para quem enviou.');
  if (gravar && r.vence_em < new Date().toISOString()) throw new ErroFicha(410, 'O prazo deste link acabou. Peça um novo para quem enviou: o que você já mandou continua guardado.');
  if (gravar && r.situacao === 'Desistiu') throw new ErroFicha(409, 'Você já avisou que não vai seguir com a análise.');
  return { fichaId, pessoa, registro: r };
}

/** O que a página mostra: contexto, formulário, valores (os já sabidos e os do último envio), situação e arquivos mandados. */
export async function lerFichaPublica(request, env) {
  const { registro: r } = await registroDaChave(request, env);
  const ultimo = r.respostas.at(-1);
  return json(200, {
    pessoa: r.pessoa, contexto: r.contexto, formulario: r.formulario, valores: { ...r.valores_iniciais, ...(ultimo ? ultimo.valores : {}) },
    situacao: r.situacao, faltando: r.faltando, vence_em: r.vence_em, vencido: r.vence_em < new Date().toISOString(), pdf: !!r.pdf,
    enviado_em: ultimo ? ultimo.em : null, desistiu_em: r.desistiu_em,
    arquivos: r.arquivos.map((a) => ({ documento: a.documento, nome_original: a.nome_original, em: a.em, tamanho: a.tamanho })),
  });
}

/** Envio dos dados: { valores, declaracao: true }. Fica como resposta para a equipe conferir (não muda a ficha). */
export async function enviarFichaPublica(request, env, avisar) {
  const { fichaId, pessoa, registro } = await registroDaChave(request, env, { gravar: true });
  const p = await lerJson(request);
  if (p.declaracao !== true) throw new ErroFicha(400, 'Marque a declaração antes de enviar.');
  const valores = valoresValidos(registro.formulario, p.valores);
  const falta = registro.formulario.filter((c) => c.obrig && (valores[c.nome] === null || valores[c.nome] === undefined)).map((c) => c.rotulo);
  if (falta.length) throw new ErroFicha(400, `Preencha: ${falta.join(', ')}.`);
  if (registro.respostas.length >= MAX_ENVIOS) throw new ErroFicha(429, 'Limite de envios deste link. Fale com quem enviou o link.');
  const em = new Date().toISOString();
  const novo = await mudarRegistro(env, fichaId, pessoa, (r) => {
    // conferido de novo com o registro de agora: dois envios ao mesmo tempo não passam do limite
    if (r.respostas.length >= MAX_ENVIOS) throw new ErroFicha(429, 'Limite de envios deste link. Fale com quem enviou o link.');
    r.respostas.push({ em, valores, declaracao: true });
    if (['Aguardando', 'Falta documento'].includes(r.situacao)) r.situacao = 'Respondida';
    r.visto_em = null;
    r.eventos.push({ em, texto: 'dados enviados pelo link' });
    r.eventos = r.eventos.slice(-50);
  });
  if (avisar) await avisar(env, novo, 'enviou');
  return json(200, { ok: true, enviado_em: em, situacao: novo.situacao });
}

/**
 * Um documento: corpo = o arquivo; ?documento=<nome do documento da lista> ou "assinada" (a ficha assinada) ou "outro"; &nome=<nome original>.
 * Só PDF, JPEG ou PNG (conferido pelos bytes), até 10 MB; o nome do arquivo é dado aqui (sem o nome original dentro).
 */
export async function receberArquivoPublico(request, env, url, avisar) {
  const { fichaId, pessoa, registro } = await registroDaChave(request, env, { gravar: true });
  if (registro.arquivos.length >= MAX_ARQUIVOS) throw new ErroFicha(429, `Limite de ${MAX_ARQUIVOS} arquivos por link. Fale com quem enviou o link.`);
  const qual = String(url.searchParams.get('documento') || '');
  let documento;
  if (qual === 'assinada') documento = registro.pessoa === 'interessado' ? 'Ficha cadastral assinada' : 'Ficha do fiador assinada';
  else if (qual === 'outro') documento = 'Outro documento';
  else if (documentosAceitos(registro.contexto).has(qual)) documento = qual;
  else throw new ErroFicha(400, 'Documento inválido.');
  const corpo = await lerBytes(request, MAX_DOCUMENTO);
  const ext = tipoDoArquivo(corpo);
  if (!ext) throw new ErroFicha(415, 'Mande o documento em PDF ou foto (JPG ou PNG).');
  const dia = new Date().toISOString().slice(0, 10);
  const quem = pessoa === 'interessado' ? '' : `${pessoa.replace('fiador', 'fiador-')}-`;
  const sufixo = [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const base = `${registro.pasta}/link-${quem}${nomeSimples(documento)}-${dia}-${sufixo}`;
  let nome = `${base}.${ext}`;
  // grava só se o nome está livre (uma chamada só); ocupado, tenta o próximo
  for (let n = 2; !(await env.DADOS.put(nome, corpo, { ...SO_SE_NOVO(), customMetadata: { por: `link da ficha (${pessoa})` } })); n += 1) {
    if (n > 20) throw new ErroFicha(409, 'Outra mudança ao mesmo tempo: tente de novo.');
    nome = `${base}-${n}.${ext}`;
  }
  const em = new Date().toISOString();
  let novo;
  try {
    novo = await mudarRegistro(env, fichaId, pessoa, (r) => {
      // conferido de novo com o registro de agora: vários arquivos ao mesmo tempo não passam do limite
      if (r.arquivos.length >= MAX_ARQUIVOS) throw new ErroFicha(429, `Limite de ${MAX_ARQUIVOS} arquivos por link. Fale com quem enviou o link.`);
      r.arquivos.push({ documento, arquivo: nome.slice(nome.lastIndexOf('/') + 1), nome_original: texto(url.searchParams.get('nome'), 120), em, tamanho: corpo.byteLength, tipo: ext });
      if (qual === 'assinada') { r.situacao = 'Assinada'; r.eventos.push({ em, texto: 'ficha assinada enviada pelo link' }); }
      r.visto_em = null;
      r.eventos = r.eventos.slice(-50);
    });
  } catch (e) {
    // o registro não aceitou (limite, disputa perdida, link trocado no meio): o arquivo não fica solto na pasta da ficha
    try { await env.DADOS.delete(nome); } catch (e2) { console.error('arquivo do link sem registro', e2); }
    throw e;
  }
  if (avisar) await avisar(env, novo, qual === 'assinada' ? 'assinou' : 'documento', documento);
  return json(200, { ok: true, documento });
}

/** "Não vou seguir com a análise": a equipe recebe o aviso e registra a desistência e a devolução da reserva no sistema. */
export async function desistirPublico(request, env, avisar) {
  const { fichaId, pessoa } = await registroDaChave(request, env, { gravar: true });
  const em = new Date().toISOString();
  const novo = await mudarRegistro(env, fichaId, pessoa, (r) => {
    r.situacao = 'Desistiu'; r.desistiu_em = em; r.visto_em = null;
    r.eventos.push({ em, texto: 'avisou pelo link que não vai seguir com a análise' });
  });
  if (avisar) await avisar(env, novo, 'desistiu');
  return json(200, { ok: true });
}

export async function baixarPdfPublico(request, env) {
  const { fichaId, pessoa, registro } = await registroDaChave(request, env);
  const obj = registro.pdf ? await env.DADOS.get(chavePdf(fichaId, pessoa)) : null;
  if (!obj) throw new ErroFicha(404, 'A ficha em PDF ainda não está disponível.');
  return new Response(obj.body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${pessoa === 'interessado' ? 'ficha-cadastral' : 'ficha-do-fiador'}.pdf"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

// ---------------------------------------------------------------------------
// Endereço da ficha (ficha.ankjck.com.br): a página e as rotas públicas; nada do sistema responde aqui
// ---------------------------------------------------------------------------
export async function atenderFicha(request, env, { avisar = null, caminho = null } = {}) {
  const url = new URL(request.url);
  const rota = caminho ?? url.pathname;
  try {
    if (!env.DADOS) throw new ErroFicha(503, 'Serviço indisponível.');
    const m = request.method;
    if ((rota === '/' || rota === '' || rota === '/ficha') && m === 'GET') return paginaDaFicha();
    if (rota === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });
    if (!rota.startsWith('/api/publico/')) return json(404, { erro: 'Não encontrado.' });
    if (m !== 'GET') {
      // gravação só da própria página (o navegador manda o cabeçalho; outro site não consegue)
      if (request.headers.get('X-Ficha') !== '1') throw new ErroFicha(403, 'Pedido recusado.');
      const origem = request.headers.get('Origin');
      if (origem && origem !== url.origin) throw new ErroFicha(403, 'Pedido recusado (origem).');
    }
    const r = rota.slice('/api/publico/'.length);
    if (r === 'ficha' && m === 'GET') return await lerFichaPublica(request, env);
    if (r === 'ficha/enviar' && m === 'POST') return await enviarFichaPublica(request, env, avisar);
    if (r === 'ficha/arquivo' && m === 'PUT') return await receberArquivoPublico(request, env, url, avisar);
    if (r === 'ficha/desistir' && m === 'POST') return await desistirPublico(request, env, avisar);
    if (r === 'ficha/pdf' && m === 'GET') return await baixarPdfPublico(request, env);
    return json(404, { erro: 'Não encontrado.' });
  } catch (e) {
    if (e instanceof ErroFicha) return json(e.status, { erro: e.message });
    console.error(e);
    return json(500, { erro: 'Erro no servidor. Tente de novo em alguns minutos.' });
  }
}

/** Rotas da equipe (/api/ficha-online/…), chamadas pelo Worker depois do login e do papel conferidos. */
export async function atenderEquipe(request, env, rota, email, { avisar = null } = {}) {
  const url = new URL(request.url);
  const m = request.method;
  try {
    // aviso no celular: a chave pública para o aparelho se inscrever, inscrever e sair
    if (rota === 'push' && m === 'GET') return json(200, { ligado: pushLigado(env), chave: pushLigado(env) ? env.VAPID_PUBLICA : null });
    if (rota === 'push' && m === 'POST') {
      if (!pushLigado(env)) throw new ErroFicha(503, 'O aviso no celular ainda não foi ligado na nuvem.');
      try { await inscrever(env, await lerJson(request, 8 * 1024), email); } catch (e) { throw e instanceof ErroFicha ? e : new ErroFicha(400, e.message); }
      return json(200, { ok: true });
    }
    if (rota === 'push-sair' && m === 'POST') { await desinscrever(env, (await lerJson(request, 8 * 1024)).endpoint); return json(200, { ok: true }); }
    if (rota === 'link' && m === 'POST') return await criarLink(request, env, email);
    if (rota === 'pdf' && m === 'PUT') return await guardarPdf(request, env, url);
    if (rota === 'lista' && m === 'GET') return await listarLinks(env, url);
    if (rota === 'atualizar' && m === 'POST') return await atualizarLink(request, env, email, avisar);
    return json(404, { erro: 'Não encontrado.' });
  } catch (e) {
    if (e instanceof ErroFicha) return json(e.status, { erro: e.message });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// A página (um arquivo só, sem nada de fora; CSP com nonce)
// ---------------------------------------------------------------------------
function paginaDaFicha() {
  const nonce = novaChave().slice(0, 24);
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`;
  return new Response(PAGINA.replaceAll('{{NONCE}}', nonce), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' },
  });
}

const PAGINA = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Ficha cadastral</title>
<style nonce="{{NONCE}}">
:root{--fundo:#f5f6f8;--cartao:#fff;--texto:#1d2330;--suave:#5d6675;--borda:#d6dae1;--cor:#1f5fa8;--ok:#1d7a45;--aviso:#8a5a00;--perigo:#b3261e}
@media (prefers-color-scheme:dark){:root{--fundo:#15181d;--cartao:#1e232a;--texto:#e7eaef;--suave:#9aa3b2;--borda:#343b46;--cor:#6ea8ff;--ok:#5cc28a;--aviso:#e0b04f;--perigo:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--texto);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:16px}h1{font-size:1.4rem;margin:8px 0 4px}h2{font-size:1.1rem;margin:0 0 8px}
.cartao{background:var(--cartao);border:1px solid var(--borda);border-radius:12px;padding:16px;margin:12px 0}
.suave{color:var(--suave);font-size:.92rem}label{display:block;font-weight:600;margin:12px 0 4px}
input,select,textarea{width:100%;font:inherit;padding:10px;border:1px solid var(--borda);border-radius:8px;background:var(--cartao);color:var(--texto)}
textarea{min-height:80px}input[type=checkbox]{width:auto;margin-right:8px;transform:scale(1.2)}
.caixa{display:flex;align-items:flex-start;gap:4px;font-weight:400}.caixa input{margin-top:4px}
button,.botao{display:inline-block;font:inherit;font-weight:600;padding:12px 18px;border-radius:10px;border:0;background:var(--cor);color:#fff;cursor:pointer;text-decoration:none;margin:6px 6px 0 0}
button.sec,.botao.sec{background:transparent;color:var(--cor);border:1px solid var(--cor)}button.perigo{background:transparent;color:var(--perigo);border:1px solid var(--perigo)}
button:disabled{opacity:.5}.aviso{border-left:4px solid var(--aviso);padding:8px 12px;background:color-mix(in srgb,var(--aviso) 10%,transparent);border-radius:6px}
.ok{border-left:4px solid var(--ok);padding:8px 12px;background:color-mix(in srgb,var(--ok) 10%,transparent);border-radius:6px}
.erro{color:var(--perigo);font-weight:600}table{width:100%;border-collapse:collapse}td{padding:6px 4px;border-bottom:1px solid var(--borda);vertical-align:top}
td:first-child{color:var(--suave);width:38%}.doc{padding:10px 0;border-bottom:1px solid var(--borda)}.doc:last-child{border-bottom:0}
.enviados{font-size:.9rem;color:var(--ok)}[hidden]{display:none!important}
</style></head><body><main id="app"><p class="suave">Carregando a ficha…</p></main>
<script nonce="{{NONCE}}">
(() => {
  const app = document.getElementById('app');
  const chave = location.hash.slice(1);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataBr = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
  const horaBr = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const reais = (c) => (c === null || c === undefined || c === '' ? '' : (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const centavos = (t) => { const s = String(t || '').replace(/[^0-9,]/g, ''); if (!s) return null; const [i, d = ''] = s.split(','); return Number(i || 0) * 100 + Number((d + '00').slice(0, 2)); };
  const api = async (caminho, op = {}) => {
    const r = await fetch('/api/publico/' + caminho, { ...op, headers: { 'X-Ficha-Token': chave, ...(op.method && op.method !== 'GET' ? { 'X-Ficha': '1' } : {}), ...(op.headers || {}) } });
    const tipo = r.headers.get('content-type') || '';
    if (!tipo.includes('json')) { if (r.ok) return r; throw new Error('Sem resposta do servidor. Tente de novo.'); }
    const d = await r.json();
    if (!r.ok) throw new Error(d.erro || 'Não deu certo. Tente de novo.');
    return d;
  };
  let F = null;
  const SITUACAO = {
    Aguardando: '', Respondida: '<div class="ok">Recebemos seus dados em {enviado}. Se precisar corrigir, altere abaixo e envie de novo.</div>',
    'Falta documento': '<div class="aviso"><b>Falta mandar:</b><ul>{faltando}</ul>Mande pelo campo do documento, mais abaixo.</div>',
    Assinar: '<div class="aviso"><b>Falta assinar a ficha.</b> Baixe a ficha em PDF, assine pelo gov.br (gratuito, em assinador.iti.br) ou à mão, e mande em "Ficha assinada", no fim da página.</div>',
    Assinada: '<div class="ok">Recebemos a ficha assinada. Obrigado! Avisaremos o resultado da análise.</div>',
    Desistiu: '<div class="aviso">Você avisou em {desistiu} que não vai seguir com a análise. A reserva é devolvida por inteiro na conta de onde veio o depósito.</div>',
  };

  function campoHtml(c, v) {
    const id = 'c_' + c.nome;
    const ajuda = c.ajuda ? '<div class="suave">' + esc(c.ajuda) + '</div>' : '';
    const ob = c.obrig ? ' *' : '';
    const dados = c.mostrarSe ? ' data-mostrar="' + esc(c.mostrarSe.campo) + '" data-valores="' + esc(JSON.stringify(c.mostrarSe.valores)) + '"' : '';
    if (c.tipo === 'simnao') return '<div' + dados + '><label class="caixa"><input type="checkbox" id="' + id + '" name="' + c.nome + '"' + (v ? ' checked' : '') + '> ' + esc(c.rotulo) + '</label>' + ajuda + '</div>';
    let campo;
    if (c.tipo === 'opcao') campo = '<select id="' + id + '" name="' + c.nome + '"><option value=""></option>' + c.opcoes.map((o) => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
    else if (c.tipo === 'area') campo = '<textarea id="' + id + '" name="' + c.nome + '">' + esc(v || '') + '</textarea>';
    else {
      const tipo = { data: 'date', mes: 'month', email: 'email', tel: 'tel', inteiro: 'number' }[c.tipo] || 'text';
      const modo = { cpf: 'numeric', cpfcnpj: 'numeric', dinheiro: 'decimal', tel: 'tel' }[c.tipo];
      const valor = c.tipo === 'dinheiro' ? reais(v) : (v ?? '');
      campo = '<input type="' + tipo + '" id="' + id + '" name="' + c.nome + '" value="' + esc(valor) + '"' + (modo ? ' inputmode="' + modo + '"' : '') + (c.tipo === 'dinheiro' ? ' placeholder="0,00"' : '') + '>';
    }
    return '<div' + dados + '><label for="' + id + '">' + esc(c.rotulo) + ob + (c.tipo === 'dinheiro' ? ' (R$)' : '') + '</label>' + campo + ajuda + '</div>';
  }

  function formularioHtml() {
    let html = ''; let aberto = false;
    for (const c of F.formulario) {
      if (c.secao) {
        if (aberto) html += '</div>';
        const dados = c.mostrarSe ? ' data-mostrar="' + esc(c.mostrarSe.campo) + '" data-valores="' + esc(JSON.stringify(c.mostrarSe.valores)) + '"' : '';
        html += '<div class="cartao"' + dados + '><h2>' + esc(c.secao) + '</h2>'; aberto = true;
      } else html += campoHtml(c, F.valores[c.nome]);
    }
    return html + (aberto ? '</div>' : '');
  }

  function valoresDoForm() {
    const out = {};
    for (const c of F.formulario) {
      if (!c.nome) continue;
      const el = document.querySelector('[name="' + c.nome + '"]');
      if (!el) continue;
      const oculto = el.closest('[hidden]');
      if (c.tipo === 'simnao') out[c.nome] = oculto ? null : el.checked;
      else if (c.tipo === 'dinheiro') out[c.nome] = oculto ? null : centavos(el.value);
      else if (c.tipo === 'inteiro') out[c.nome] = oculto || el.value === '' ? null : Math.round(Number(el.value));
      else out[c.nome] = oculto ? null : el.value.trim() || null;
    }
    return out;
  }

  function aplicarMostrar() {
    for (const el of document.querySelectorAll('[data-mostrar]')) {
      const alvo = document.querySelector('[name="' + el.dataset.mostrar + '"]');
      const v = !alvo ? '' : alvo.type === 'checkbox' ? (alvo.checked ? '1' : '') : alvo.value;
      const valores = JSON.parse(el.dataset.valores);
      el.hidden = !(valores.includes(v) || (valores.includes('*') && v !== ''));
    }
  }

  /** Lista de documentos: a do link ou, na pessoa física, montada pelo tipo de renda e o estado civil escolhidos agora. */
  function documentosAgora() {
    const l = F.contexto.listas;
    if (!l) return F.contexto.documentos;
    const v = valoresDoForm();
    const casado = ['Casado(a)', 'União estável'].includes(v.inquilino_estado_civil);
    return [...l.inicio, ...(casado ? l.conjuge : []), ...(l.renda[v.renda_tipo] || l.renda_padrao), ...l.fim];
  }

  function documentosHtml() {
    const enviados = (doc) => F.arquivos.filter((a) => a.documento === doc).map((a) => '✓ ' + esc(a.nome_original || 'arquivo') + ' (' + horaBr(a.em) + ')').join('<br>');
    const linha = (doc, qual) => '<div class="doc"><div><b>' + esc(doc) + '</b></div><div class="enviados">' + enviados(doc) + '</div>'
      + '<input type="file" accept="application/pdf,image/jpeg,image/png" multiple data-documento="' + esc(qual) + '" aria-label="' + esc(doc) + '"><div class="suave" data-estado="' + esc(qual) + '"></div></div>';
    return '<div class="cartao"><h2>Documentos</h2><p class="suave">' + esc(F.contexto.dica) + ' PDF ou foto (JPG, PNG), até 10 MB cada. Pode mandar mais de um arquivo em cada item.</p>'
      + '<div id="lista-documentos">' + documentosAgora().map((d, k) => linha(d, 'd' + k)).join('') + '</div>' + linha('Outro documento', 'outro') + '</div>';
  }

  function desenhar(mensagem = '') {
    const ctx = F.contexto;
    const fiador = F.pessoa !== 'interessado';
    const bloqueado = F.situacao === 'Desistiu' || F.vencido;
    const situacao = (SITUACAO[F.situacao] || '').replace('{enviado}', horaBr(F.enviado_em)).replace('{desistiu}', dataBr(F.desistiu_em)).replace('{faltando}', F.faltando.map((x) => '<li>' + esc(x) + '</li>').join(''));
    app.innerHTML = '<p class="suave">' + esc(ctx.empresa) + '</p><h1>' + (fiador ? 'Ficha do fiador' : 'Ficha cadastral') + '</h1>'
      + '<p>' + esc(ctx.nome ? 'Olá, ' + ctx.nome.split(' ')[0] + '! ' : '') + (fiador ? 'Você foi indicado como fiador' + (ctx.de ? ' de ' + esc(ctx.de) : '') + ' na locação do imóvel abaixo.' : 'Preencha seus dados e mande os documentos para a análise da locação.') + '</p>'
      + (F.vencido ? '<div class="aviso">O prazo deste link acabou em ' + dataBr(F.vence_em) + '. Peça um novo para quem enviou: o que você já mandou continua guardado.</div>' : '<p class="suave">Este link é só seu e vale até ' + dataBr(F.vence_em) + '.</p>')
      + situacao + (mensagem ? '<div class="ok">' + mensagem + '</div>' : '')
      + '<div class="cartao"><h2>Imóvel</h2><p>' + esc(ctx.imovel) + '</p>' + (ctx.proposta.length ? '<table>' + ctx.proposta.map(([a, b]) => '<tr><td>' + esc(a) + '</td><td>' + esc(b) + '</td></tr>').join('') + '</table><p class="suave">Condições que dependem da aprovação da ficha.</p>' : '') + '</div>'
      + (F.pdf ? '<div class="cartao"><h2>Prefere imprimir?</h2><p class="suave">Baixe a ficha em PDF, preencha, assine (pelo gov.br ou à mão) e mande em "Ficha assinada", no fim da página.</p><button type="button" class="sec" id="baixar">Baixar a ficha em PDF</button></div>' : '')
      + (bloqueado ? '' : '<form id="form" novalidate>' + formularioHtml() + documentosHtml()
      + '<div class="cartao"><h2>Declaração</h2><label class="caixa"><input type="checkbox" id="declaracao"> Declaro que as informações e os documentos enviados são verdadeiros. Os documentos podem ser conferidos diretamente com a fonte (empregadores, cartórios, bancos e validadores oficiais), e apresentar documento, extrato, comprovante ou assinatura falsos é crime (Código Penal, artigos 171, 297, 298, 299 e 304), que pode ser comunicado à autoridade policial. Autorizo a consulta ' + (F.contexto.tipo === 'Pessoa jurídica (empresa)' ? 'do CNPJ da empresa e do CPF do representante' : 'do nome e do CPF') + ' em cadastros de crédito (como Serasa e SPC) e o uso destes dados para a análise desta locação e, se aprovada, para o contrato (Lei 13.709/2018).</label>'
      + '<p class="erro" id="erro" hidden></p><button type="submit" id="enviar">Enviar meus dados</button></div>'
      + '<div class="cartao"><h2>Ficha assinada</h2><p class="suave">Depois de conferirmos os dados, mande aqui a ficha assinada (pelo gov.br, em assinador.iti.br, ou à mão: foto ou PDF).</p>' + '<div class="enviados">' + F.arquivos.filter((a) => /assinada/.test(a.documento)).map((a) => '✓ ' + esc(a.nome_original || 'arquivo') + ' (' + horaBr(a.em) + ')').join('<br>') + '</div><input type="file" accept="application/pdf,image/jpeg,image/png" data-documento="assinada" aria-label="Ficha assinada"><div class="suave" data-estado="assinada"></div></div>'
      + (fiador ? '' : '<div class="cartao"><h2>Não vai seguir?</h2><p class="suave">Se faltar algum documento ou você preferir não seguir com a análise, sem problema: é só avisar' + (ctx.reserva ? ' e a reserva de ' + esc(ctx.reserva) + ' é devolvida por inteiro, sem descontos' : '') + '.</p><button type="button" class="perigo" id="desistir">Não vou seguir com a análise</button></div>')
      + '</form>')
      + '<p class="suave">Seus dados são tratados conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018) e usados só para a análise desta locação.</p>';
    ligar();
  }

  function ligar() {
    const form = document.getElementById('form');
    const baixar = document.getElementById('baixar');
    if (baixar) baixar.onclick = async () => {
      try {
        const r = await api('ficha/pdf');
        const url = URL.createObjectURL(await r.blob());
        const a = Object.assign(document.createElement('a'), { href: url, download: F.pessoa === 'interessado' ? 'ficha-cadastral.pdf' : 'ficha-do-fiador.pdf' });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (e) { alert(e.message); }
    };
    if (!form) return;
    form.addEventListener('change', (ev) => {
      aplicarMostrar();
      // mudou o tipo de renda ou o estado civil: a lista de documentos muda junto
      if (F.contexto.listas && ['renda_tipo', 'inquilino_estado_civil'].includes(ev.target.name)) {
        F.valores = { ...F.valores, ...valoresDoForm() };
        const marcada = document.getElementById('declaracao').checked;
        desenhar(); document.getElementById('declaracao').checked = marcada;
        const alvo = document.getElementById('lista-documentos'); if (alvo) alvo.scrollIntoView({ block: 'nearest' });
      }
    });
    aplicarMostrar();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const erro = document.getElementById('erro');
      erro.hidden = true;
      if (!document.getElementById('declaracao').checked) { erro.textContent = 'Marque a declaração antes de enviar.'; erro.hidden = false; return; }
      const botao = document.getElementById('enviar');
      botao.disabled = true; botao.textContent = 'Enviando…';
      try {
        const valores = valoresDoForm();
        const r = await api('ficha/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valores, declaracao: true }) });
        F.valores = { ...F.valores, ...valores }; F.enviado_em = r.enviado_em; F.situacao = r.situacao;
        desenhar('Dados enviados. Obrigado! Se ainda faltar algum documento, mande pelos campos de documentos.');
        scrollTo(0, 0);
      } catch (e) { erro.textContent = e.message; erro.hidden = false; botao.disabled = false; botao.textContent = 'Enviar meus dados'; }
    });
    for (const input of form.querySelectorAll('input[type=file]')) {
      input.addEventListener('change', async () => {
        const qual = input.dataset.documento;
        const estado = input.parentElement.querySelector('[data-estado]');
        // o servidor recebe o nome do documento (da lista de agora), "assinada" ou "outro"
        const documento = /^d\d+$/.test(qual) ? documentosAgora()[Number(qual.slice(1))] : qual;
        for (const arq of input.files) {
          if (arq.size > 10 * 1024 * 1024) { estado.innerHTML = '<span class="erro">' + esc(arq.name) + ': passa de 10 MB.</span>'; continue; }
          estado.textContent = 'Enviando ' + arq.name + '…';
          try {
            const r = await api('ficha/arquivo?documento=' + encodeURIComponent(documento) + '&nome=' + encodeURIComponent(arq.name), { method: 'PUT', body: arq });
            F.arquivos.push({ documento: r.documento, nome_original: arq.name, em: new Date().toISOString() });
            if (qual === 'assinada') F.situacao = 'Assinada';
            estado.textContent = '';
          } catch (e) { estado.innerHTML = '<span class="erro">' + esc(arq.name) + ': ' + esc(e.message) + '</span>'; return; }
        }
        const valores = valoresDoForm(); F.valores = { ...F.valores, ...valores };
        const marcada = document.getElementById('declaracao').checked;
        desenhar(qual === 'assinada' ? 'Ficha assinada recebida. Obrigado!' : 'Documento recebido.');
        document.getElementById('declaracao') && (document.getElementById('declaracao').checked = marcada);
      });
    }
    const desistir = document.getElementById('desistir');
    if (desistir) desistir.onclick = async () => {
      if (!confirm('Avisar que você não vai seguir com a análise?' + (F.contexto.reserva ? ' A reserva é devolvida por inteiro.' : ''))) return;
      try { await api('ficha/desistir', { method: 'POST' }); F.situacao = 'Desistiu'; F.desistiu_em = new Date().toISOString(); desenhar(); scrollTo(0, 0); } catch (e) { alert(e.message); }
    };
  }

  if (!chave) { app.innerHTML = '<h1>Ficha cadastral</h1><div class="aviso">Link incompleto. Abra o endereço inteiro que você recebeu por e-mail ou WhatsApp.</div>'; return; }
  api('ficha').then((d) => { F = d; desenhar(); }).catch((e) => { app.innerHTML = '<h1>Ficha cadastral</h1><div class="aviso">' + esc(e.message) + '</div>'; });
})();
</script></body></html>`;
