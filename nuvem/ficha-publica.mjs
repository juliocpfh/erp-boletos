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
// - Correção pela pessoa (decisão do dono de 2026-11-24): enquanto a equipe não marca o link como conferido (`conferido_em`,
//   ao trazer os dados para a ficha), a pessoa envia os dados de novo (cada envio guarda os campos que mudaram) e troca ou
//   apaga o documento mandado por engano (POST …/apagar; PUT …/arquivo com &troca=<arquivo>). O arquivo vai para a lixeira
//   (30 dias, lixeira.mjs), e o
//   registro fica no link (`apagado_em`, `substituido_por`) e nos eventos. A equipe é avisada a cada dado e a cada documento.
// - Avisos a cada etapa (e-mail para a pessoa e para a equipe, celular da equipe): avisos-ficha.mjs e push.mjs.
import { desinscrever, inscrever, publica, pushLigado, testarAparelho } from './push.mjs';
import { paraLixeira } from './lixeira.mjs';
// import circular de propósito (contatos-publico usa HSTS e hashDaChave daqui só dentro de funções)
import { atenderContatosPublico, paginaDosContatos } from './contatos-publico.mjs';
import { atenderAceitePublico, paginaDoAceite } from './aceite-reserva.mjs';

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
/** Registros de arquivo por link, contando os apagados (o registro do que foi trocado fica). */
export const MAX_REGISTROS_ARQUIVO = 80;
export const MAX_ENVIOS = 20;
const MAX_PDF = 5 * 1024 * 1024;
const MAX_PEDIDO = 128 * 1024;
const LEITURAS_JUNTAS = 10; // registros lidos ao mesmo tempo na lista dos links
const RAIZ_FICHAS = 'arquivos/Fichas em analise/';
const TIPOS_CAMPO = ['texto', 'cpf', 'cpfcnpj', 'tel', 'email', 'data', 'mes', 'dinheiro', 'opcao', 'area', 'simnao', 'inteiro'];

export class ErroFicha extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

/** O endereço da ficha é público: o próprio Worker manda o HSTS (a regra do Cloudflare só cobre o erp). */
export const HSTS = { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' };
const json = (status, dados, extra = {}) => new Response(JSON.stringify(dados), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...HSTS, ...extra },
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
/** Hashes das chaves que ainda abrem o registro: o link mandado de novo ("manter") não mata o anterior (entrada-007, 21/11/2026). */
const hashesDe = (r) => [...new Set([...(Array.isArray(r.hashes) ? r.hashes : []), r.hash].filter(Boolean))];
const ponteirosDe = (r) => hashesDe(r).map(chaveToken);

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

// CPF, CNPJ, e-mail e telefone: a mesma conferência dos cadastros do sistema (formularios.js), aqui sem importar o site
const digitos = (v) => String(v ?? '').replace(/\D/g, '');
export function cpfValido(v) {
  const n = digitos(v);
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  const dv = (k) => { let s = 0; for (let i = 0; i < k; i += 1) s += Number(n[i]) * (k + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(n[9]) && dv(10) === Number(n[10]);
}
export function cnpjValido(v) {
  const n = digitos(v);
  if (n.length !== 14 || /^(\d)\1{13}$/.test(n)) return false;
  const dv = (k) => { const pesos = k === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = pesos.reduce((t, p, i) => t + p * Number(n[i]), 0) % 11; return s < 2 ? 0 : 11 - s; };
  return dv(12) === Number(n[12]) && dv(13) === Number(n[13]);
}
const cpfBr = (n) => `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
const cnpjBr = (n) => `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
const telBr = (n) => (n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`);
export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
const hojeBrasil = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

/**
 * Conferência do que a pessoa digitou no link (mutirão 19/11, entrada-001/002): CPF/CNPJ com os dígitos certos (e com pontos),
 * e-mail completo, telefone com DDD (10 ou 11 números) e nascimento no passado. Devolve o valor formatado ou lança o erro.
 * Ex.: ('cpf', '52998224725') → '529.982.247-25'; ('cpf', '11111111111') → erro "CPF inválido".
 */
export function valorConferido(c, x) {
  const rotulo = c.rotulo || c.nome;
  if (c.tipo === 'cpf' || c.tipo === 'cpfcnpj') {
    const n = digitos(x);
    if (n.length === 11 && cpfValido(n)) return cpfBr(n);
    if (c.tipo === 'cpfcnpj' && n.length === 14 && cnpjValido(n)) return cnpjBr(n);
    throw new ErroFicha(400, `${c.tipo === 'cpf' || n.length <= 11 ? 'CPF' : 'CNPJ'} inválido em "${rotulo}": confira os números.`);
  }
  if (c.tipo === 'email') {
    const t = texto(x, 254).toLowerCase();
    if (!EMAIL_VALIDO.test(t)) throw new ErroFicha(400, `E-mail incompleto em "${rotulo}". Ex.: nome@gmail.com`);
    return t;
  }
  if (c.tipo === 'tel') {
    const n = digitos(x).replace(/^55(?=\d{10,11}$)/, '');
    if (![10, 11].includes(n.length)) throw new ErroFicha(400, `Telefone com DDD em "${rotulo}": 10 ou 11 números. Ex.: (41) 99999-0000`);
    return telBr(n);
  }
  if (c.tipo === 'data' && /nascimento$/.test(c.nome) && (String(x) >= hojeBrasil() || String(x) < '1900-01-01')) throw new ErroFicha(400, `Confira a data em "${rotulo}": precisa ser uma data do passado.`);
  return null;
}

/**
 * Valores digitados, conferidos pelo tipo de cada campo do formulário. Campo desconhecido é ignorado. ``conferir``: também
 * CPF/CNPJ, e-mail, telefone e nascimento (o envio da pessoa; os valores que a equipe manda ao criar o link passam como estão,
 * para um cadastro antigo não travar o link).
 */
export function valoresValidos(formulario, valores, { conferir = false } = {}) {
  const out = {};
  const v = valores && typeof valores === 'object' ? valores : {};
  for (const c of formulario) {
    if (!c.nome || !(c.nome in v)) continue;
    const x = v[c.nome];
    if (x === null || x === '' || x === undefined) { out[c.nome] = null; continue; }
    if (conferir && ['cpf', 'cpfcnpj', 'email', 'tel', 'data'].includes(c.tipo)) {
      const certo = valorConferido(c, x);
      if (certo !== null) { out[c.nome] = certo; continue; }
    }
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
/** Documentos que ainda estão na pasta (os trocados e apagados pela pessoa ficam só no registro). */
export const ativos = (r) => (r.arquivos || []).filter((a) => !a.apagado_em);
const cheio = (r) => ativos(r).length >= MAX_ARQUIVOS || (r.arquivos || []).length >= MAX_REGISTROS_ARQUIVO;
export const CONFERIDO = 'A equipe já conferiu o que você mandou. Para corrigir alguma coisa, fale com quem enviou o link.';
/** O documento do link pelo nome do arquivo (só os ainda na pasta). */
function arquivoDoRegistro(r, nome) {
  const n = String(nome || '');
  const a = /^link-[a-z0-9-]{1,120}[.](pdf|jpg|png)$/.test(n) ? (r.arquivos || []).find((x) => x.arquivo === n && !x.apagado_em) : null;
  if (!a) throw new ErroFicha(404, 'Documento não encontrado (talvez já trocado ou apagado). Atualize a página.');
  return a;
}

export const nomeSimples = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'documento';

// ---------------------------------------------------------------------------
// Equipe (com login; o Worker já conferiu o papel)
// ---------------------------------------------------------------------------
/**
 * Cria (ou troca) o link de uma pessoa da ficha. Corpo: { ficha_id, pessoa, pasta, contexto, formulario, valores }.
 * Devolve { url, vence_em }. O link anterior da mesma pessoa deixa de valer; as respostas dele continuam no registro.
 * Com `manter: true` (mandar de novo um link ainda no prazo; decisão do dono, 21/11/2026, entrada-007): o anterior continua
 * valendo e o novo vence na MESMA data (a validade é a do primeiro, para a equipe controlar o prazo). Ex.: link de 10/11 até
 * 17/11; "Lembrar" em 12/11 → link novo também até 17/11, e o de 10/11 continua abrindo.
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
    empresa: texto(ctx.empresa, 120), nome: texto(ctx.nome, 120), imovel: texto(ctx.imovel, 300), reserva: texto(ctx.reserva, 40), devolucao: texto(ctx.devolucao, 400),
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
  let antigos = []; let gravado = false; let vale = vence;
  for (let i = 0; i < 4 && !gravado; i += 1) {
    const anterior = await lerRegistro(env, fichaId, pessoa);
    const lido = anterior ? anterior.registro : {};
    // registro de outra ficha com o mesmo código (pasta diferente: a ficha antiga saiu e o código voltou a ser usado):
    // começa do zero, senão a pessoa nova veria os dados e os arquivos da antiga (e o primeiro documento não avisaria)
    const velho = lido.pasta && lido.pasta !== pasta ? {} : lido;
    const manter = p.manter === true && velho.vence_em > agora.toISOString() && !['Encerrado', 'Desistiu'].includes(velho.situacao) && hashesDe(velho).length > 0;
    antigos = manter ? [] : hashesDe(lido);
    vale = manter ? velho.vence_em : vence;
    const registro = {
      ficha_id: fichaId, pessoa, hash, hashes: manter ? [...hashesDe(velho), hash].slice(-5) : [hash], pasta, contexto, formulario, valores_iniciais: valores,
      criado_em: manter && velho.criado_em ? velho.criado_em : agora.toISOString(), criado_por: email, vence_em: vale, atualizado_em: agora.toISOString(),
      situacao: velho.situacao && !['Encerrado', 'Desistiu'].includes(velho.situacao) ? velho.situacao : 'Aguardando',
      faltando: velho.faltando || [], respostas: velho.respostas || [], arquivos: velho.arquivos || [], eventos: [...(velho.eventos || []), { em: agora.toISOString(), texto: `link ${manter ? 'mandado de novo (o anterior continua valendo)' : anterior ? 'renovado' : 'criado'} por ${email}` }].slice(-50),
      visto_em: velho.visto_em || null, desistiu_em: null, pdf: !!velho.pdf,
    };
    gravado = !!(await env.DADOS.put(chaveRegistro(fichaId, pessoa), JSON.stringify(registro), {
      ...(anterior ? { onlyIf: { etagMatches: anterior.etag } } : SO_SE_NOVO()), httpMetadata: { contentType: 'application/json' },
    }));
  }
  if (!gravado) throw new ErroFicha(409, 'Outra mudança ao mesmo tempo: tente de novo.');
  await env.DADOS.put(chaveToken(hash), JSON.stringify({ ficha_id: fichaId, pessoa }));
  // os ponteiros antigos só saem depois de gravados o registro e o ponteiro novos (já não valem: o registro tem outro hash)
  const sair = antigos.filter((h) => h !== hash);
  if (sair.length) await env.DADOS.delete(sair.map(chaveToken));
  const base = String(env.URL_FICHA || 'https://ficha.ankjck.com.br/');
  return json(200, { ok: true, url: `${base}#${chave}`, vence_em: vale });
}

/** Ficha em PDF para a pessoa baixar (a do link, já com os dados que temos). */
export async function guardarPdf(request, env, url) {
  const fichaId = fichaIdValido(url.searchParams.get('ficha'));
  const pessoa = pessoaValida(url.searchParams.get('pessoa'));
  const corpo = await lerBytes(request, MAX_PDF);
  if (tipoDoArquivo(corpo) !== 'pdf') throw new ErroFicha(400, 'A ficha precisa ser um PDF.');
  // sem o registro do link, o PDF (com dados pessoais) ficaria solto no R2, fora da faxina
  if (!(await lerRegistro(env, fichaId, pessoa))) throw new ErroFicha(404, 'Link não encontrado.');
  await env.DADOS.put(chavePdf(fichaId, pessoa), corpo, { httpMetadata: { contentType: 'application/pdf' } });
  await mudarRegistro(env, fichaId, pessoa, (r) => { r.pdf = true; r.pdf_em = new Date().toISOString(); });
  return json(200, { ok: true });
}

/**
 * Faxina dos links (LGPD), chamada pelo alarme diário do cofre: registro passado DIAS_GUARDA do prazo sai inteiro (registro,
 * ponteiro e PDF), e PDF sem registro (sobra de um link que já saiu) também. Os documentos ficam na pasta da ficha.
 */
export async function faxinaDosLinks(env) {
  if (!env.DADOS) return 0;
  let cursor; let apagados = 0;
  do {
    const r = await env.DADOS.list({ prefix: 'publico/fichas/', cursor, limit: 1000 });
    const chaves = new Set(r.objects.map((o) => o.key));
    for (const o of r.objects) {
      if (o.key.endsWith('.pdf') && !chaves.has(o.key.replace(/\.pdf$/, '.json')) && !(await env.DADOS.head(o.key.replace(/\.pdf$/, '.json')))) {
        await env.DADOS.delete(o.key); apagados += 1; continue;
      }
      if (!o.key.endsWith('.json')) continue;
      const obj = await env.DADOS.get(o.key);
      if (!obj) continue;
      let reg; try { reg = JSON.parse(await obj.text()); } catch { continue; }
      if (passou(reg.vence_em, DIAS_GUARDA)) {
        await env.DADOS.delete([o.key, o.key.replace(/\.json$/, '.pdf'), ...ponteirosDe(reg)]);
        apagados += 1;
      }
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return apagados;
}

const paraEquipe = (r) => { const { hash, hashes, ...resto } = r; return resto; }; // eslint-disable-line no-unused-vars

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
      await env.DADOS.delete([chave, chave.replace(/\.json$/, '.pdf'), ...ponteirosDe(reg)]);
      return null;
    }
    return ficha ? paraEquipe(reg) : {
      ficha_id: reg.ficha_id, pessoa: reg.pessoa, situacao: reg.situacao, atualizado_em: reg.atualizado_em, visto_em: reg.visto_em,
      vence_em: reg.vence_em, criado_em: reg.criado_em, mudou_em: reg.mudou_em || null, ultimo_envio: (reg.respostas.at(-1) || {}).em || null, arquivos: ativos(reg).length, ultimo_arquivo: (reg.arquivos.at(-1) || {}).em || null, desistiu_em: reg.desistiu_em,
      ultimo_apagado: reg.arquivos.reduce((m, a) => (a.apagado_em && a.apagado_em > (m || '') ? a.apagado_em : m), null), conferido_em: reg.conferido_em || null,
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

/**
 * Equipe muda o link: { ficha_id, pessoa, situacao?, faltando?: [texto], visto?: true, conferido?: true, liberar?: true }.
 * Falta documento e Assinar avisam a pessoa. ``conferido``: a equipe trouxe os dados para a ficha e a pessoa não troca mais
 * nada (só manda documento novo); ``liberar``: a pessoa volta a poder corrigir.
 */
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
    if (p.conferido === true && !r.conferido_em) { r.conferido_em = new Date().toISOString(); r.eventos.push({ em: r.conferido_em, texto: `conferido por ${email} (a pessoa não troca mais dados nem documentos)` }); }
    if (p.liberar === true && r.conferido_em) { r.conferido_em = null; r.eventos.push({ em: new Date().toISOString(), texto: `liberado por ${email} para a pessoa corrigir` }); }
    r.eventos = r.eventos.slice(-50);
    mudou = antes !== JSON.stringify([r.situacao, r.faltando]);
  });
  if (novo.situacao === 'Encerrado' && hashesDe(novo).length) await env.DADOS.delete(ponteirosDe(novo));
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
  if (!atual || !hashesDe(atual.registro).includes(hash)) throw new ErroFicha(404, 'Este link não vale mais. Peça um novo para quem enviou.');
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
  // passado o prazo, a página mostra só a situação: um link encaminhado não expõe CPF, renda e documentos por mais 30 dias
  if (r.vence_em < new Date().toISOString()) {
    const c = r.contexto || {};
    return json(200, {
      pessoa: r.pessoa, contexto: { empresa: c.empresa, nome: String(c.nome || '').split(/\s+/)[0], imovel: '', proposta: [], documentos: [], dica: '', de: '', reserva: '' },
      formulario: [], valores: {}, situacao: r.situacao, faltando: [], vence_em: r.vence_em, vencido: true, pdf: false,
      enviado_em: ultimo ? ultimo.em : null, desistiu_em: r.desistiu_em, arquivos: [],
    });
  }
  return json(200, {
    pessoa: r.pessoa, contexto: r.contexto, formulario: r.formulario, valores: { ...r.valores_iniciais, ...(ultimo ? ultimo.valores : {}) },
    situacao: r.situacao, faltando: r.faltando, vence_em: r.vence_em, vencido: r.vence_em < new Date().toISOString(), pdf: !!r.pdf,
    enviado_em: ultimo ? ultimo.em : null, desistiu_em: r.desistiu_em, envios: r.respostas.length, conferido_em: r.conferido_em || null,
    arquivos: ativos(r).map((a) => ({ documento: a.documento, arquivo: a.arquivo, nome_original: a.nome_original, em: a.em, tamanho: a.tamanho })),
    apagados: r.arquivos.filter((a) => a.apagado_em).length,
  });
}

/** Envio dos dados: { valores, declaracao: true }. Fica como resposta para a equipe conferir (não muda a ficha). */
export async function enviarFichaPublica(request, env, avisar) {
  const { fichaId, pessoa, registro } = await registroDaChave(request, env, { gravar: true });
  const p = await lerJson(request);
  if (p.declaracao !== true) throw new ErroFicha(400, 'Marque a declaração antes de enviar.');
  const valores = valoresValidos(registro.formulario, p.valores, { conferir: true });
  const falta = registro.formulario.filter((c) => c.obrig && (valores[c.nome] === null || valores[c.nome] === undefined)).map((c) => c.rotulo);
  if (falta.length) throw new ErroFicha(400, `Preencha: ${falta.join(', ')}.`);
  if (registro.respostas.length >= MAX_ENVIOS) throw new ErroFicha(429, 'Limite de envios deste link. Fale com quem enviou o link.');
  if (registro.conferido_em) throw new ErroFicha(409, CONFERIDO);
  const em = new Date().toISOString();
  const novo = await mudarRegistro(env, fichaId, pessoa, (r) => {
    // conferido de novo com o registro de agora: dois envios ao mesmo tempo não passam do limite
    if (r.respostas.length >= MAX_ENVIOS) throw new ErroFicha(429, 'Limite de envios deste link. Fale com quem enviou o link.');
    if (r.conferido_em) throw new ErroFicha(409, CONFERIDO);
    // o que mudou desde o envio anterior (o registro do que foi trocado; no primeiro envio, nada)
    const antes = r.respostas.at(-1);
    const mudou = antes ? r.formulario.filter((c) => c.nome && String(antes.valores[c.nome] ?? '') !== String(valores[c.nome] ?? '')).map((c) => c.nome) : [];
    r.respostas.push({ em, valores, declaracao: true, ...(antes ? { mudou } : {}) });
    if (antes) r.eventos.push({ em, texto: mudou.length ? `dados corrigidos pelo link (${mudou.length} campo(s))` : 'dados enviados de novo, sem mudança' });
    if (['Aguardando', 'Falta documento'].includes(r.situacao)) r.situacao = 'Respondida';
    r.visto_em = null;
    r.eventos.push({ em, texto: 'dados enviados pelo link' });
    r.eventos = r.eventos.slice(-50);
  });
  if (avisar) await avisar(env, novo, 'enviou');
  return json(200, { ok: true, enviado_em: em, situacao: novo.situacao, valores });
}

/**
 * Um documento: corpo = o arquivo; ?documento=<nome do documento da lista> ou "assinada" (a ficha assinada) ou "outro"; &nome=<nome original>.
 * Só PDF, JPEG ou PNG (conferido pelos bytes), até 10 MB; o nome do arquivo é dado aqui (sem o nome original dentro).
 */
export async function receberArquivoPublico(request, env, url, avisar) {
  const { fichaId, pessoa, registro } = await registroDaChave(request, env, { gravar: true });
  // troca de um documento mandado por engano: o anterior sai da pasta depois que o novo entra (só antes da conferência)
  const troca = url.searchParams.get('troca') ? arquivoDoRegistro(registro, url.searchParams.get('troca')) : null;
  if (troca && registro.conferido_em) throw new ErroFicha(409, CONFERIDO);
  if (!troca && cheio(registro)) throw new ErroFicha(429, `Limite de ${MAX_ARQUIVOS} arquivos por link. Fale com quem enviou o link.`);
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
      if (!troca && cheio(r)) throw new ErroFicha(429, `Limite de ${MAX_ARQUIVOS} arquivos por link. Fale com quem enviou o link.`);
      const novoNome = nome.slice(nome.lastIndexOf('/') + 1);
      r.arquivos.push({ documento, arquivo: novoNome, nome_original: texto(url.searchParams.get('nome'), 120), em, tamanho: corpo.byteLength, tipo: ext });
      if (troca) {
        if (r.conferido_em) throw new ErroFicha(409, CONFERIDO);
        const velho = r.arquivos.find((a) => a.arquivo === troca.arquivo && !a.apagado_em);
        if (!velho) throw new ErroFicha(409, 'Este documento já foi trocado ou apagado. Atualize a página.');
        velho.apagado_em = em; velho.substituido_por = novoNome;
        r.eventos.push({ em, texto: `documento trocado pelo link: ${velho.documento} (${velho.nome_original || velho.arquivo} → ${texto(url.searchParams.get('nome'), 120) || novoNome})` });
      }
      if (qual === 'assinada') { r.situacao = 'Assinada'; r.eventos.push({ em, texto: 'ficha assinada enviada pelo link' }); }
      // o documento pedido chegou: sai do "Falta mandar"; zerada a lista, volta a "Respondida"
      if ((r.faltando || []).includes(documento)) {
        r.faltando = r.faltando.filter((x) => x !== documento);
        if (!r.faltando.length && r.situacao === 'Falta documento') { r.situacao = 'Respondida'; r.mudou_em = em; }
      }
      r.visto_em = null;
      r.eventos = r.eventos.slice(-50);
    });
  } catch (e) {
    // o registro não aceitou (limite, disputa perdida, link trocado no meio): o arquivo não fica solto na pasta da ficha
    try { await env.DADOS.delete(nome); } catch (e2) { console.error('arquivo do link sem registro', e2); }
    throw e;
  }
  if (troca) {
    try { await paraLixeira(env.DADOS, `${registro.pasta}/${troca.arquivo}`, { por: `link da ficha (${pessoa}): trocado` }); } catch (e) { console.error('documento trocado que ficou na pasta', e); }
  }
  if (avisar) await avisar(env, novo, troca ? 'trocou' : qual === 'assinada' ? 'assinou' : 'documento', documento);
  return json(200, { ok: true, documento, arquivo: nome.slice(nome.lastIndexOf('/') + 1), situacao: novo.situacao, faltando: novo.faltando || [] });
}

/**
 * A pessoa apaga um documento mandado por engano: { arquivo }. Só antes da conferência da equipe. O arquivo sai da pasta da
 * ficha; no link fica o registro (o que era, quando foi mandado e quando foi apagado). Ficha assinada apagada: volta a "Assinar".
 */
export async function apagarArquivoPublico(request, env, avisar) {
  const { fichaId, pessoa, registro } = await registroDaChave(request, env, { gravar: true });
  if (registro.conferido_em) throw new ErroFicha(409, CONFERIDO);
  const alvo = arquivoDoRegistro(registro, (await lerJson(request, 4 * 1024)).arquivo);
  const em = new Date().toISOString();
  const novo = await mudarRegistro(env, fichaId, pessoa, (r) => {
    if (r.conferido_em) throw new ErroFicha(409, CONFERIDO);
    const a = r.arquivos.find((x) => x.arquivo === alvo.arquivo && !x.apagado_em);
    if (!a) throw new ErroFicha(409, 'Este documento já foi trocado ou apagado. Atualize a página.');
    a.apagado_em = em;
    if (/assinada/.test(a.documento) && r.situacao === 'Assinada' && !ativos(r).some((x) => /assinada/.test(x.documento))) { r.situacao = 'Assinar'; r.mudou_em = em; }
    r.visto_em = null;
    r.eventos.push({ em, texto: `documento apagado pelo link: ${a.documento} (${a.nome_original || a.arquivo})` });
    r.eventos = r.eventos.slice(-50);
  });
  try { await paraLixeira(env.DADOS, `${registro.pasta}/${alvo.arquivo}`, { por: `link da ficha (${pessoa}): apagado` }); } catch (e) { console.error('documento apagado que ficou na pasta', e); }
  if (avisar) await avisar(env, novo, 'apagou', alvo.documento);
  return json(200, { ok: true, situacao: novo.situacao });
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
  if (registro.vence_em < new Date().toISOString()) throw new ErroFicha(410, 'O prazo deste link acabou. Peça um novo para quem enviou.');
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
    if (rota === '/privacidade' && request.method === 'GET') return paginaPrivacidade();
    if (!env.DADOS) throw new ErroFicha(503, 'Serviço indisponível.');
    const m = request.method;
    if ((rota === '/' || rota === '' || rota === '/ficha') && m === 'GET') return paginaDaFicha();
    if (rota === '/contatos' && m === 'GET') return paginaDosContatos(); // comunicado com confirmação de contatos (contatos-publico.mjs)
    if (rota === '/reserva' && m === 'GET') return paginaDoAceite(); // termo de aceite da reserva (aceite-reserva.mjs)
    if (rota === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });
    if (!rota.startsWith('/api/publico/')) return json(404, { erro: 'Não encontrado.' });
    if (m !== 'GET') {
      // gravação só da própria página (o navegador manda o cabeçalho; outro site não consegue)
      if (request.headers.get('X-Ficha') !== '1') throw new ErroFicha(403, 'Pedido recusado.');
      const origem = request.headers.get('Origin');
      if (origem && origem !== url.origin) throw new ErroFicha(403, 'Pedido recusado (origem).');
    }
    const r = rota.slice('/api/publico/'.length);
    if (r === 'contatos' || r.startsWith('contatos/')) return await atenderContatosPublico(request, env, r);
    if (r === 'aceite' || r.startsWith('aceite/')) return await atenderAceitePublico(request, env, r);
    if (r === 'ficha' && m === 'GET') return await lerFichaPublica(request, env);
    if (r === 'ficha/enviar' && m === 'POST') return await enviarFichaPublica(request, env, avisar);
    if (r === 'ficha/arquivo' && m === 'PUT') return await receberArquivoPublico(request, env, url, avisar);
    if (r === 'ficha/apagar' && m === 'POST') return await apagarArquivoPublico(request, env, avisar);
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
    if (rota === 'push' && m === 'GET') return json(200, { ligado: pushLigado(env), chave: pushLigado(env) ? publica(env) : null });
    if (rota === 'push' && m === 'POST') {
      if (!pushLigado(env)) throw new ErroFicha(503, 'O aviso no celular ainda não foi ligado na nuvem.');
      try { await inscrever(env, await lerJson(request, 8 * 1024), email); } catch (e) { throw e instanceof ErroFicha ? e : new ErroFicha(400, e.message); }
      return json(200, { ok: true });
    }
    if (rota === 'push-teste' && m === 'POST') return json(200, await testarAparelho(env, (await lerJson(request, 8 * 1024)).endpoint));
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
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex', ...HSTS },
  });
}

/**
 * Política de privacidade (endereço público exigido pelo Google para publicar o app do "Conectar o Gmail";
 * pedido do dono, 2026-11-18). Texto fixo, sem script; sem barra invertida no texto (ver PAGINA).
 */
export function paginaPrivacidade() {
  const csp = "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'";
  return new Response(PRIVACIDADE, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...HSTS },
  });
}

const PRIVACIDADE = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Política de privacidade</title>
<style>body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f5f6f8;color:#1d2330;margin:0;padding:16px;line-height:1.55}
main{max-width:760px;margin:0 auto;background:#fff;border:1px solid #d6dae1;border-radius:10px;padding:20px 24px}
h1{font-size:1.5rem;margin-top:0}h2{font-size:1.1rem;margin-top:1.4em}p,li{font-size:1rem}.suave{color:#5d6675;font-size:.9rem}</style>
</head><body><main>
<h1>Política de privacidade</h1>
<p class="suave">Sistema de administração de imóveis (ERP Imoveis) · atualizada em 18/11/2026</p>
<p>Este sistema é usado só pela equipe da administradora de imóveis para cuidar dos contratos de locação: fichas cadastrais, contratos, boletos, notas fiscais e recibos. Não é um serviço aberto ao público.</p>
<h2>Que dados tratamos</h2>
<p>Os dados que o interessado ou o inquilino nos informa para a locação: nome, CPF ou CNPJ, contato, endereço, renda e documentos enviados pela ficha cadastral; e os dados do contrato, dos pagamentos e das notas fiscais.</p>
<p>Quando a pessoa abre ou responde o link de confirmação de contatos, guardamos também a data e a hora, o endereço de internet (IP), o navegador e o aparelho usados e, se ela assinar na tela, a assinatura desenhada, como prova do envio e do aceite.</p>
<h2>Para que usamos</h2>
<p>Só para analisar a ficha, fazer e cumprir o contrato de locação, cobrar e dar recibo, emitir nota fiscal e cumprir obrigações legais e fiscais.</p>
<h2>Uso da conta Google (Gmail)</h2>
<ul>
<li>O sistema pede à conta Gmail da administradora apenas a permissão de <b>enviar e-mails</b> em nome dela (e de saber qual conta foi ligada).</li>
<li>O sistema <b>não lê</b>, não guarda, não apaga e não altera os e-mails da caixa de entrada.</li>
<li>Os e-mails enviados são só os da administração da locação (ficha, contrato, boleto, nota fiscal, recibos e avisos), para os próprios interessados, inquilinos e fiadores.</li>
<li>A autorização do Google fica guardada cifrada no servidor do sistema e nunca é repassada a ninguém. O uso dos dados recebidos das APIs do Google segue a Política de Dados do Usuário dos Serviços de API do Google, incluindo os requisitos de uso limitado.</li>
<li>A administradora pode desligar a qualquer momento, no próprio sistema (Desconectar) ou na Conta do Google (Segurança, Apps com acesso à conta).</li>
</ul>
<h2>Compartilhamento</h2>
<p>Não vendemos nem repassamos dados a terceiros. Eles só saem do sistema quando é preciso para a locação ou por obrigação legal: banco (boletos), prefeitura (nota fiscal), contador e órgãos públicos.</p>
<h2>Guarda e segurança</h2>
<p>Os dados ficam em servidor com acesso restrito à equipe, com login, conexão cifrada e cópia de segurança. Guardamos pelo tempo do contrato e pelos prazos exigidos em lei.</p>
<h2>Seus direitos (LGPD)</h2>
<p>Você pode pedir para ver, corrigir ou apagar os seus dados, quando a lei permitir, falando com a administradora pelo e-mail administracao@ankjck.com.br.</p>
</main></body></html>`;

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
button.mini{padding:5px 10px;font-size:.85rem;margin:2px 4px 2px 6px}.enviado{margin:4px 0}
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
  let podeCorrigir = false; // até a equipe conferir, a pessoa troca dados e documentos (decisão do dono de 2026-11-24)
  const SITUACAO = {
    Aguardando: '', Respondida: '<div class="ok">Recebemos seus dados em {enviado}. Se precisar corrigir, altere abaixo e envie de novo.</div>',
    'Falta documento': '<div class="aviso"><b>Falta mandar:</b><ul>{faltando}</ul>Mande pelo campo do documento, mais abaixo.</div>',
    Assinar: '<div class="aviso"><b>Falta assinar a ficha.</b> Baixe a ficha em PDF, assine pelo gov.br (gratuito, em assinador.iti.br) ou à mão, e mande em "Ficha assinada", no fim da página.</div>',
    Assinada: '<div class="ok">Recebemos a ficha assinada. Obrigado! Avisaremos o resultado da análise.</div>',
    Desistiu: '<div class="aviso">Você avisou em {desistiu} que não vai seguir com a análise.{devolucao}</div>',
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
  // (este script fica dentro de um texto do servidor: nada de barra invertida aqui, ela some ao servir a página)
  function documentosAgora() {
    const l = F.contexto.listas;
    if (!l) return F.contexto.documentos;
    // antes do formulário estar na tela (o primeiro desenho), vale o que a ficha já tem
    const v = document.getElementById('form') ? valoresDoForm() : F.valores;
    const casado = ['Casado(a)', 'União estável'].includes(v.inquilino_estado_civil);
    return [...l.inicio, ...(casado ? l.conjuge : []), ...(l.renda[v.renda_tipo] || l.renda_padrao), ...l.fim];
  }

  let listaDesenhada = []; // a lista de documentos como está na tela (o campo "d3" é o 4º dela)
  /** Um documento já mandado: o nome, a hora e, até a equipe conferir, os botões para trocar e apagar. */
  function enviadoHtml(a) {
    const botoes = podeCorrigir && a.arquivo ? '<button type="button" class="sec mini" data-trocar="' + esc(a.arquivo) + '">Trocar</button><button type="button" class="perigo mini" data-apagar="' + esc(a.arquivo) + '">Apagar</button>' : '';
    return '<div class="enviado">✓ ' + esc(a.nome_original || 'arquivo') + ' (' + horaBr(a.em) + ')' + botoes + '</div>';
  }
  /** O que a pessoa já mandou e como corrigir. */
  function resumoHtml() {
    if (!F.enviado_em && !F.arquivos.length && !F.apagados) return '';
    const dados = F.enviado_em ? 'Dados enviados em ' + horaBr(F.enviado_em) + (F.envios > 1 ? ' (mandados ' + F.envios + ' vezes)' : '') + '.' : 'Dados ainda não enviados.';
    const docs = ' Documentos: ' + F.arquivos.length + ' arquivo(s)' + (F.apagados ? '; ' + F.apagados + ' trocado(s) ou apagado(s)' : '') + '.';
    const como = F.conferido_em ? 'A equipe já conferiu em ' + dataBr(F.conferido_em) + ': para mudar algum dado ou documento, fale com quem enviou o link. Documento novo pode ser mandado normalmente.'
      : 'Até a equipe conferir, você pode corrigir: mude os dados abaixo e envie de novo, ou troque e apague o documento mandado por engano. Tudo o que for trocado fica registrado.';
    return '<div class="cartao"><h2>O que você já mandou</h2><p>' + esc(dados + docs) + '</p><p class="suave">' + esc(como) + '</p></div>';
  }
  function documentosHtml() {
    const enviados = (doc) => F.arquivos.filter((a) => a.documento === doc).map(enviadoHtml).join('');
    const linha = (doc, qual) => '<div class="doc"><div><b>' + esc(doc) + '</b></div><div class="enviados">' + enviados(doc) + '</div>'
      + '<input type="file" accept="application/pdf,image/jpeg,image/png" multiple data-documento="' + esc(qual) + '" aria-label="' + esc(doc) + '"><div class="suave" data-estado="' + esc(qual) + '"></div></div>';
    return '<div class="cartao"><h2>Documentos</h2><p class="suave">' + esc(F.contexto.dica) + ' PDF ou foto (JPG, PNG), até 10 MB cada. Pode mandar mais de um arquivo em cada item.</p>'
      + '<div id="lista-documentos">' + (listaDesenhada = documentosAgora()).map((d, k) => linha(d, 'd' + k)).join('') + '</div>' + linha('Outro documento', 'outro') + '</div>';
  }

  function desenhar(mensagem = '') {
    const ctx = F.contexto;
    const fiador = F.pessoa !== 'interessado';
    const bloqueado = F.situacao === 'Desistiu' || F.vencido;
    podeCorrigir = !bloqueado && !F.conferido_em;
    const modelo = F.situacao === 'Respondida' && !F.enviado_em ? '<div class="ok">Recebemos seus documentos. Obrigado!</div>'
      : F.situacao === 'Respondida' && F.conferido_em ? '<div class="ok">Recebemos seus dados em {enviado}. A equipe já conferiu: para corrigir alguma coisa, fale com quem enviou o link.</div>' : (SITUACAO[F.situacao] || '');
    // desistência: a regra do termo aceito (ctx.devolucao, ex.: "a reserva de R$ 500,00 não é devolvida"); sem termo, devolve tudo
    const devolucao = fiador ? '' : ctx.devolucao ? ' Como combinado: ' + ctx.devolucao.charAt(0).toLowerCase() + ctx.devolucao.slice(1) : ctx.reserva ? ' A reserva de ' + ctx.reserva + ' é devolvida por inteiro, na conta de onde veio o depósito.' : '';
    const situacao = modelo.replace('{enviado}', horaBr(F.enviado_em)).replace('{desistiu}', dataBr(F.desistiu_em)).replace('{devolucao}', esc(devolucao)).replace('{faltando}', F.faltando.map((x) => '<li>' + esc(x) + '</li>').join(''));
    app.innerHTML = '<p class="suave">' + esc(ctx.empresa) + '</p><h1>' + (fiador ? 'Ficha do fiador' : 'Ficha cadastral') + '</h1>'
      + '<p>' + esc(ctx.nome ? 'Olá, ' + ctx.nome.split(' ')[0] + '! ' : '') + (fiador ? 'Você foi indicado como fiador' + (ctx.de ? ' de ' + esc(ctx.de) : '') + ' na locação do imóvel abaixo.' : 'Preencha seus dados e mande os documentos para a análise da locação.') + '</p>'
      + (F.vencido ? '<div class="aviso">O prazo deste link acabou em ' + dataBr(F.vence_em) + '. Peça um novo para quem enviou: o que você já mandou continua guardado.</div>' : '<p class="suave">Este link é só seu e vale até ' + dataBr(F.vence_em) + '.</p>')
      + situacao + (mensagem ? '<div class="ok">' + mensagem + '</div>' : '') + resumoHtml()
      + '<div class="cartao"><h2>Imóvel</h2><p>' + esc(ctx.imovel) + '</p>' + (ctx.proposta.length ? '<table>' + ctx.proposta.map(([a, b]) => '<tr><td>' + esc(a) + '</td><td>' + esc(b) + '</td></tr>').join('') + '</table><p class="suave">Condições que dependem da aprovação da ficha.</p>' : '') + '</div>'
      + (F.pdf ? '<div class="cartao"><h2>Prefere imprimir?</h2><p class="suave">Baixe a ficha em PDF, preencha, assine (pelo gov.br ou à mão) e mande em "Ficha assinada", no fim da página.</p><button type="button" class="sec" id="baixar">Baixar a ficha em PDF</button></div>' : '')
      + (bloqueado ? '' : '<form id="form" novalidate><div id="dados">' + formularioHtml() + '</div>' + documentosHtml()
      + (F.conferido_em ? '<div class="cartao"><p class="suave">Seus dados já foram conferidos pela equipe. Para corrigir alguma coisa, fale com quem enviou o link.</p></div>' : '<div class="cartao"><h2>Declaração</h2><label class="caixa"><input type="checkbox" id="declaracao"> Declaro que as informações e os documentos enviados são verdadeiros. Os documentos podem ser conferidos diretamente com a fonte (empregadores, cartórios, bancos e validadores oficiais), e apresentar documento, extrato, comprovante ou assinatura falsos é crime (Código Penal, artigos 171, 297, 298, 299 e 304), que pode ser comunicado à autoridade policial. Autorizo a consulta ' + (F.contexto.tipo === 'Pessoa jurídica (empresa)' ? 'do CNPJ da empresa e do CPF do representante' : 'do nome e do CPF') + ' em cadastros de crédito (como Serasa e SPC) e o uso destes dados para a análise desta locação e, se aprovada, para o contrato (Lei 13.709/2018).</label>'
      + '<p class="erro" id="erro" hidden></p><button type="submit" id="enviar">Enviar meus dados</button></div>')
      + '<div class="cartao"><h2>Ficha assinada</h2><p class="suave">Depois de conferirmos os dados, mande aqui a ficha assinada (pelo gov.br, em assinador.iti.br, ou à mão: foto ou PDF).</p>' + '<div class="enviados">' + F.arquivos.filter((a) => /assinada/.test(a.documento)).map(enviadoHtml).join('') + '</div><input type="file" accept="application/pdf,image/jpeg,image/png" data-documento="assinada" aria-label="Ficha assinada"><div class="suave" data-estado="assinada"></div></div>'
      + (fiador ? '' : '<div class="cartao"><h2>Não vai seguir?</h2><p class="suave">Se faltar algum documento ou você preferir não seguir com a análise, sem problema: é só avisar' + (ctx.devolucao ? '. ' + esc(ctx.devolucao).replace(/[.]$/, '') : ctx.reserva ? ' e a reserva de ' + esc(ctx.reserva) + ' é devolvida por inteiro, sem descontos' : '') + '.</p><button type="button" class="perigo" id="desistir">Não vou seguir com a análise</button></div>')
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
    if (F.conferido_em) for (const el of document.querySelectorAll('#dados input, #dados select, #dados textarea')) el.disabled = true;
    /** Desenha de novo sem perder a rolagem nem a declaração marcada. */
    const redesenhar = () => {
      const dec = document.getElementById('declaracao'); const marcada = !!(dec && dec.checked);
      const y = window.scrollY; F.valores = { ...F.valores, ...valoresDoForm() };
      desenhar(); const d2 = document.getElementById('declaracao'); if (d2) d2.checked = marcada; window.scrollTo(0, y);
    };
    for (const b of form.querySelectorAll('[data-apagar]')) b.addEventListener('click', async () => {
      const a = F.arquivos.find((x) => x.arquivo === b.dataset.apagar);
      if (!a || !confirm('Apagar "' + (a.nome_original || 'arquivo') + '" (' + a.documento + ')? Ele sai da ficha; fica só o registro de que foi apagado.')) return;
      b.disabled = true;
      try {
        const r = await api('ficha/apagar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ arquivo: a.arquivo }) });
        F.arquivos = F.arquivos.filter((x) => x.arquivo !== a.arquivo); F.apagados = (F.apagados || 0) + 1; if (r.situacao) F.situacao = r.situacao;
        redesenhar();
      } catch (e) { alert(e.message); b.disabled = false; }
    });
    for (const b of form.querySelectorAll('[data-trocar]')) b.addEventListener('click', () => {
      const a = F.arquivos.find((x) => x.arquivo === b.dataset.trocar);
      if (!a) return;
      const escolher = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/pdf,image/jpeg,image/png' });
      escolher.addEventListener('change', async () => {
        const arq = escolher.files[0];
        if (!arq) return;
        if (arq.size > 10 * 1024 * 1024) { alert(arq.name + ': passa de 10 MB.'); return; }
        const documento = /assinada/.test(a.documento) ? 'assinada' : a.documento === 'Outro documento' ? 'outro' : a.documento;
        b.disabled = true; b.textContent = 'Enviando…';
        try {
          const r = await api('ficha/arquivo?documento=' + encodeURIComponent(documento) + '&nome=' + encodeURIComponent(arq.name) + '&troca=' + encodeURIComponent(a.arquivo), { method: 'PUT', body: arq });
          F.arquivos = F.arquivos.filter((x) => x.arquivo !== a.arquivo);
          F.arquivos.push({ documento: r.documento, arquivo: r.arquivo, nome_original: arq.name, em: new Date().toISOString() }); F.apagados = (F.apagados || 0) + 1;
          if (r.situacao) F.situacao = r.situacao;
          redesenhar();
        } catch (e) { alert(e.message); b.disabled = false; b.textContent = 'Trocar'; }
      });
      escolher.click();
    });
    form.addEventListener('change', (ev) => {
      aplicarMostrar();
      // mudou o tipo de renda ou o estado civil: a lista de documentos muda junto
      if (F.contexto.listas && ['renda_tipo', 'inquilino_estado_civil'].includes(ev.target.name)) {
        F.valores = { ...F.valores, ...valoresDoForm() };
        const marcada = document.getElementById('declaracao').checked;
        // a tela fica onde está (só a lista de documentos, lá embaixo, muda) e o foco volta ao campo
        const y = window.scrollY; const foco = ev.target.id;
        desenhar(); document.getElementById('declaracao').checked = marcada;
        window.scrollTo(0, y);
        const el = foco && document.getElementById(foco); if (el) el.focus({ preventScroll: true });
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
        F.valores = { ...F.valores, ...valores, ...(r.valores || {}) }; F.enviado_em = r.enviado_em; F.situacao = r.situacao; F.envios = (F.envios || 0) + 1;
        desenhar('Dados enviados. Obrigado! Se ainda faltar algum documento, mande pelos campos de documentos.');
        scrollTo(0, 0);
      } catch (e) { erro.textContent = e.message; erro.hidden = false; botao.disabled = false; botao.textContent = 'Enviar meus dados'; }
    });
    for (const input of form.querySelectorAll('input[type=file]')) {
      input.addEventListener('change', async () => {
        const qual = input.dataset.documento;
        const estado = input.parentElement.querySelector('[data-estado]');
        // o servidor recebe o nome do documento (da lista de agora), "assinada" ou "outro"
        const documento = /^d[0-9]+$/.test(qual) ? listaDesenhada[Number(qual.slice(1))] : qual;
        for (const arq of input.files) {
          if (arq.size > 10 * 1024 * 1024) { estado.innerHTML = '<span class="erro">' + esc(arq.name) + ': passa de 10 MB.</span>'; continue; }
          estado.textContent = 'Enviando ' + arq.name + '…';
          try {
            const r = await api('ficha/arquivo?documento=' + encodeURIComponent(documento) + '&nome=' + encodeURIComponent(arq.name), { method: 'PUT', body: arq });
            F.arquivos.push({ documento: r.documento, arquivo: r.arquivo, nome_original: arq.name, em: new Date().toISOString() });
            if (r.situacao) F.situacao = r.situacao; else if (qual === 'assinada') F.situacao = 'Assinada';
            if (Array.isArray(r.faltando)) F.faltando = r.faltando;
            estado.textContent = '';
          } catch (e) { estado.innerHTML = '<span class="erro">' + esc(arq.name) + ': ' + esc(e.message) + '</span>'; return; }
        }
        const valores = valoresDoForm(); F.valores = { ...F.valores, ...valores };
        const marcada = document.getElementById('declaracao').checked;
        const y = window.scrollY;
        // o "recebido" aparece ao lado do campo do arquivo (a ficha assinada já tem o aviso da situação no topo)
        desenhar();
        document.getElementById('declaracao') && (document.getElementById('declaracao').checked = marcada);
        window.scrollTo(0, y);
        const aqui = document.querySelector('[data-estado="' + qual + '"]');
        if (aqui) { aqui.className = 'enviados'; aqui.textContent = qual === 'assinada' ? 'Recebido.' : 'Documento recebido.'; }
      });
    }
    const desistir = document.getElementById('desistir');
    if (desistir) desistir.onclick = async () => {
      if (!confirm('Avisar que você não vai seguir com a análise?' + (F.contexto.devolucao ? ' ' + F.contexto.devolucao : F.contexto.reserva ? ' A reserva é devolvida por inteiro.' : ''))) return;
      try { await api('ficha/desistir', { method: 'POST' }); F.situacao = 'Desistiu'; F.desistiu_em = new Date().toISOString(); desenhar(); scrollTo(0, 0); } catch (e) { alert(e.message); }
    };
  }

  if (!chave) { app.innerHTML = '<h1>Ficha cadastral</h1><div class="aviso">Link incompleto. Abra o endereço inteiro que você recebeu por e-mail ou WhatsApp.</div>'; return; }
  api('ficha').then((d) => { F = d; desenhar(); }).catch((e) => { app.innerHTML = '<h1>Ficha cadastral</h1><div class="aviso">' + esc(e.message) + '</div>'; });
})();
</script></body></html>`;
