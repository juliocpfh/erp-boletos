// Termo de aceite da reserva (decisões do dono de 2026-11-24): antes de depositar a reserva, quem demonstrou interesse recebe um
// link só dele (e-mail ou WhatsApp), abre a página no endereço da ficha (ficha.ankjck.com.br/reserva, sem o login do sistema),
// lê as condições do imóvel e o termo, confirma o e-mail com um código enviado a ele e marca "Li e concordo" (e, se quiser,
// assina com o dedo). O aceite fica guardado com data, hora, endereço de internet, aparelho e o texto exato aceito, com o resumo
// SHA-256 (prova do aceite), e vai por e-mail um comprovante com o texto e a conta para o depósito. A equipe recebe o aviso
// (e-mail e celular) e o sistema copia o aceite para a ficha (R.guardarAceiteReserva) e faz o PDF (recibos.js, termo_reserva).
//
// - Equipe (dentro do sistema, com login, papel operador): POST /api/aceite-reserva/link cria o link (devolve o endereço com a
//   chave depois do "#"), GET …/ler?ficha=ID lê a situação e o aceite, POST …/encerrar desliga o link.
// - Público (só no endereço da ficha): GET /reserva (a página), GET /api/publico/aceite, POST …/aceite/codigo,
//   POST …/aceite/confirmar, com a chave no cabeçalho X-Ficha-Token e X-Ficha: 1 nas gravações.
// - R2: publico/aceites/<ficha>.json (o registro, com o aceite) e publico/tokens-aceites/<hash da chave>. Nada daqui lê o banco
//   do sistema: só o que a equipe mandou. O código vai para o e-mail digitado (é o que prova que ele recebe as mensagens).
import { contaGuardada, emailValido, enviarEmail, estadoEmail } from './gmail.mjs';
import { avisarAparelhos } from './push.mjs';
import { HSTS, SO_SE_NOVO, hashDaChave } from './ficha-publica.mjs';

/** O link vale DIAS_LINK_ACEITE dias; o registro (com a prova) fica DIAS_GUARDA_ACEITE dias depois disso. */
export const DIAS_LINK_ACEITE = 7;
export const DIAS_GUARDA_ACEITE = 730;
export const MAX_CODIGOS = 5;
export const MAX_TENTATIVAS = 6;
const MINUTOS_CODIGO = 30;
const MAX_PEDIDO = 256 * 1024;
const MAX_LOGO = 120 * 1024;
const MAX_ASSINATURA = 150 * 1024;

export class ErroAceite extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

const json = (status, dados) => new Response(JSON.stringify(dados), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...HSTS },
});
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha = async (t) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))));
const novaChave = () => { const b = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const texto = (v, max = 300) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
/** Texto com linhas (o termo): mantém as quebras de linha, tira os outros caracteres de controle. */
const textoLongo = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const passou = (iso, dias = 0) => Date.parse(iso) + dias * 86400000 < Date.now();

const chaveRegistro = (ficha) => `publico/aceites/${ficha}.json`;
const chaveToken = (hash) => `publico/tokens-aceites/${hash}`;
const fichaValida = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new ErroAceite(400, 'Ficha inválida.'); return n; };
const logoValida = (v) => { const s = String(v || ''); return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= MAX_LOGO ? s : ''; };
const assinaturaValida = (v) => { const s = String(v || ''); if (!s) return ''; if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) || s.length > MAX_ASSINATURA) throw new ErroAceite(400, 'Assinatura inválida. Limpe e assine de novo.'); return s; };
const inteiro = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };
const simular = (env) => env.SIMULAR_GMAIL === '1' && /\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(env.ORIGEM || ''));
const primeiro = (n) => String(n || '').trim().split(/\s+/)[0] || '';

async function lerJson(request, maximo = MAX_PEDIDO) {
  const tamanho = Number(request.headers.get('Content-Length') || 0);
  if (tamanho > maximo) throw new ErroAceite(413, 'Pedido grande demais.');
  const t = await request.text();
  if (t.length > maximo) throw new ErroAceite(413, 'Pedido grande demais.');
  try { return JSON.parse(t || '{}'); } catch { throw new ErroAceite(400, 'Pedido inválido.'); }
}

async function lerRegistro(env, ficha) {
  const obj = await env.DADOS.get(chaveRegistro(ficha));
  return obj ? { registro: JSON.parse(await obj.text()), etag: obj.etag } : null;
}

async function mudarRegistro(env, ficha, mudar) {
  for (let i = 0; i < 4; i += 1) {
    const atual = await lerRegistro(env, ficha);
    if (!atual) throw new ErroAceite(404, 'Link não encontrado.');
    const novo = (await mudar(atual.registro)) || atual.registro;
    novo.atualizado_em = new Date().toISOString();
    novo.eventos = (novo.eventos || []).slice(-60);
    const ok = await env.DADOS.put(chaveRegistro(ficha), JSON.stringify(novo), { onlyIf: { etagMatches: atual.etag }, httpMetadata: { contentType: 'application/json' } });
    if (ok) return novo;
  }
  throw new ErroAceite(409, 'Outra mudança ao mesmo tempo: tente de novo.');
}

/**
 * O que a equipe manda (o sistema monta com recibos.js termoDaReserva): a empresa, a pessoa, o imóvel, as condições, o termo
 * inteiro (texto corrido), a frase de ciência e as condições em números (guardadas com o aceite). Só texto; a logo, imagem pequena.
 */
export function contextoValido(ctx = {}) {
  const termo = textoLongo(ctx.termo, 12000);
  if (!termo) throw new ErroAceite(400, 'Falta o texto do termo.');
  const c = ctx.condicoes || {};
  const condicoes = {
    retencao_pct: Number.isFinite(Number(c.retencao_pct)) && Number(c.retencao_pct) >= 0 && Number(c.retencao_pct) <= 100 ? Number(c.retencao_pct) : null,
    dias_arrependimento: inteiro(c.dias_arrependimento, 0, 60), dias_uteis_documentos: inteiro(c.dias_uteis_documentos, 1, 15),
    // dias corridos (correção do dono, 24/11/2026); o site antigo não manda: dias úteis, como o texto dele
    documentos_corridos: c.documentos_corridos === true,
    dias_validade: inteiro(c.dias_validade, 1, 60), dias_uteis_devolucao: inteiro(c.dias_uteis_devolucao, 1, 30),
  };
  if (Object.values(condicoes).some((v) => v === null)) throw new ErroAceite(400, 'Condições da reserva inválidas.');
  const valor = Number(ctx.reserva_valor);
  if (!Number.isInteger(valor) || valor <= 0 || valor > 1e9) throw new ErroAceite(400, 'Valor da reserva inválido.');
  return {
    empresa: texto(ctx.empresa, 160), cnpj: texto(ctx.cnpj, 20), logo: logoValida(ctx.logo), nome: texto(ctx.nome, 160), imovel: texto(ctx.imovel, 400),
    email: texto(ctx.email, 254), reserva_valor: valor, reserva: texto(ctx.reserva, 40), condicoes, termo, aviso: texto(ctx.aviso, 800),
    ciencia: texto(ctx.ciencia, 1200) || 'Li as condições acima e concordo com elas.', deposito: textoLongo(ctx.deposito, 600),
    email_empresa: texto(ctx.email_empresa, 254), telefone_empresa: texto(ctx.telefone_empresa, 40),
  };
}

/** Texto aceito: o termo e a declaração (entra inteiro na prova, com o resumo SHA-256). */
export const textoDoAceite = (c) => `${c.termo}\n\nDeclaração: ${c.ciencia}`;

const paraEquipe = (r) => {
  const { hash, codigo, contexto, ...resto } = r;
  return { ...resto, nome: contexto ? contexto.nome : '', codigo_enviado_para: codigo ? codigo.para : null, codigos_enviados: codigo ? (codigo.enviados || []).length : 0 };
};

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------
/** Cria (ou troca) o link da ficha: { ficha_id, contexto }. Devolve { url, vence_em }. O aceite já feito continua guardado. */
export async function criarLinkAceite(request, env, email) {
  const p = await lerJson(request);
  const ficha = fichaValida(p.ficha_id);
  const contexto = contextoValido(p.contexto);
  const chave = novaChave();
  const hash = await hashDaChave(chave);
  const agora = new Date().toISOString();
  const vence = new Date(Date.now() + DIAS_LINK_ACEITE * 86400000).toISOString();
  let hashAntigo = null; let gravado = false;
  for (let i = 0; i < 4 && !gravado; i += 1) {
    const anterior = await lerRegistro(env, ficha);
    const velho = anterior ? anterior.registro : {};
    hashAntigo = velho.hash || null;
    const registro = {
      ficha_id: ficha, hash, contexto, criado_em: velho.criado_em || agora, criado_por: email, vence_em: vence, atualizado_em: agora,
      aberto_em: velho.aberto_em || null, aberturas: velho.aberturas || [], codigo: null, resposta: velho.resposta || null,
      eventos: [...(velho.eventos || []), { em: agora, texto: `link ${anterior ? 'renovado' : 'criado'} por ${email}` }],
    };
    gravado = !!(await env.DADOS.put(chaveRegistro(ficha), JSON.stringify(registro), {
      ...(anterior ? { onlyIf: { etagMatches: anterior.etag } } : SO_SE_NOVO()), httpMetadata: { contentType: 'application/json' },
    }));
  }
  if (!gravado) throw new ErroAceite(409, 'Outra mudança ao mesmo tempo: tente de novo.');
  await env.DADOS.put(chaveToken(hash), JSON.stringify({ ficha_id: ficha }));
  if (hashAntigo && hashAntigo !== hash) await env.DADOS.delete(chaveToken(hashAntigo));
  const base = String(env.URL_FICHA || 'https://ficha.ankjck.com.br/').replace(/\/ficha\/?$/, '/').replace(/\/?$/, '/');
  return json(200, { ok: true, url: `${base}reserva#${chave}`, vence_em: vence });
}

/** Situação do link da ficha, com o aceite (ou { link: null }). Registro passado da guarda sai. */
export async function lerAceiteEquipe(env, url) {
  const ficha = fichaValida(url.searchParams.get('ficha'));
  const atual = await lerRegistro(env, ficha);
  if (!atual) return json(200, { link: null });
  if (passou(atual.registro.vence_em, DIAS_GUARDA_ACEITE)) {
    await env.DADOS.delete([chaveRegistro(ficha), ...(atual.registro.hash ? [chaveToken(atual.registro.hash)] : [])]);
    return json(200, { link: null });
  }
  return json(200, { link: paraEquipe(atual.registro) });
}

/** Desliga o link (o aceite continua guardado): { ficha_id }. */
export async function encerrarAceite(request, env, email) {
  const ficha = fichaValida((await lerJson(request)).ficha_id);
  const novo = await mudarRegistro(env, ficha, (r) => { r.encerrado_em = new Date().toISOString(); r.eventos.push({ em: r.encerrado_em, texto: `link encerrado por ${email}` }); });
  if (novo.hash) await env.DADOS.delete(chaveToken(novo.hash));
  return json(200, { ok: true });
}

/** Faxina (alarme diário do cofre): registro passado da guarda sai inteiro. */
export async function faxinaDosAceites(env) {
  if (!env.DADOS) return 0;
  let cursor; let apagados = 0;
  do {
    const r = await env.DADOS.list({ prefix: 'publico/aceites/', cursor, limit: 1000 });
    for (const o of r.objects) {
      if (!o.key.endsWith('.json')) continue;
      const obj = await env.DADOS.get(o.key);
      if (!obj) continue;
      let reg; try { reg = JSON.parse(await obj.text()); } catch { continue; }
      if (passou(reg.vence_em, DIAS_GUARDA_ACEITE)) { await env.DADOS.delete([o.key, ...(reg.hash ? [chaveToken(reg.hash)] : [])]); apagados += 1; }
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return apagados;
}

export async function atenderEquipeAceite(request, env, rota, email) {
  const url = new URL(request.url);
  const m = request.method;
  try {
    if (rota === 'link' && m === 'POST') return await criarLinkAceite(request, env, email);
    if (rota === 'ler' && m === 'GET') return await lerAceiteEquipe(env, url);
    if (rota === 'encerrar' && m === 'POST') return await encerrarAceite(request, env, email);
    return json(404, { erro: 'Não encontrado.' });
  } catch (e) {
    if (e instanceof ErroAceite) return json(e.status, { erro: e.message });
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------
async function registroDaChave(request, env, { gravar = false } = {}) {
  const chave = request.headers.get('X-Ficha-Token') || '';
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(chave)) throw new ErroAceite(404, 'Link inválido. Confira se abriu o endereço inteiro.');
  const hash = await hashDaChave(chave);
  const ponteiro = await env.DADOS.get(chaveToken(hash));
  if (!ponteiro) throw new ErroAceite(404, 'Este link não vale mais. Peça um novo para a administração.');
  const { ficha_id: ficha } = JSON.parse(await ponteiro.text());
  const atual = await lerRegistro(env, ficha);
  if (!atual || atual.registro.hash !== hash || atual.registro.encerrado_em) throw new ErroAceite(404, 'Este link não vale mais. Peça um novo para a administração.');
  if (gravar && passou(atual.registro.vence_em)) throw new ErroAceite(410, 'O prazo deste link acabou. Peça um novo para a administração.');
  return { ficha, registro: atual.registro };
}

const canalDe = (request) => (['email', 'whatsapp'].includes(request.headers.get('X-Canal')) ? request.headers.get('X-Canal') : 'direto');
const ipDe = (request) => texto(request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '', 60);
const aparelhoDe = (request) => texto(request.headers.get('User-Agent') || '', 300);

/** A página: o termo e, se já aceitou, o aceite (sem o código). A primeira abertura de cada canal fica anotada. */
export async function lerAceitePublico(request, env) {
  const { ficha, registro } = await registroDaChave(request, env);
  const canal = canalDe(request);
  let r = registro;
  if (!r.aberturas.some((a) => a.canal === canal) && r.aberturas.length < 20) {
    try {
      r = await mudarRegistro(env, ficha, (x) => {
        const em = new Date().toISOString();
        if (!x.aberto_em) x.aberto_em = em;
        if (!x.aberturas.some((a) => a.canal === canal)) x.aberturas.push({ em, canal, ip: ipDe(request), aparelho: aparelhoDe(request) });
      });
    } catch (e) { console.warn('abertura do link do termo', e.message); }
  }
  const resp = r.resposta;
  return json(200, {
    contexto: r.contexto, vence_em: r.vence_em, vencido: passou(r.vence_em),
    resposta: resp ? { em: resp.em, email: resp.email, assinou: !!resp.assinatura, comprovante: !!resp.comprovante_em } : null,
    codigo_para: r.codigo && !passou(r.codigo.vence, 0) ? r.codigo.para : null,
  });
}

/** Manda o código de 6 números para o e-mail digitado: { email }. */
export async function enviarCodigoAceite(request, env, { buscar = fetch } = {}) {
  const { ficha, registro } = await registroDaChave(request, env, { gravar: true });
  if (registro.resposta) throw new ErroAceite(409, 'O termo já foi aceito.');
  const p = await lerJson(request, 8 * 1024);
  const para = texto(p.email, 254).toLowerCase();
  if (!emailValido(para)) throw new ErroAceite(400, 'Confira o e-mail: parece incompleto.');
  const enviados = (registro.codigo && registro.codigo.enviados) || [];
  if (enviados.length >= MAX_CODIGOS) throw new ErroAceite(429, 'Já mandamos códigos demais para este link. Fale com a administração.');
  if (enviados.length && Date.now() - Date.parse(enviados.at(-1)) < 60000) throw new ErroAceite(429, 'Espere um minuto para pedir outro código.');
  const sim = simular(env);
  const conta = sim ? null : await contaGuardada(env);
  if (!estadoEmail(env, { simular: sim, conta }).ligado) throw new ErroAceite(503, 'O envio de e-mail da administração está desligado agora. Tente mais tarde.');
  const codigo = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  const em = new Date().toISOString();
  let anterior = null; let hashNovo = null;
  await mudarRegistro(env, ficha, async (r) => {
    const lista = (r.codigo && r.codigo.enviados) || [];
    if (lista.length >= MAX_CODIGOS) throw new ErroAceite(429, 'Já mandamos códigos demais para este link. Fale com a administração.');
    anterior = r.codigo || null;
    hashNovo = await sha(`${r.hash}|${codigo}`);
    r.codigo = { para, hash: hashNovo, vence: new Date(Date.now() + MINUTOS_CODIGO * 60000).toISOString(), tentativas: 0, enviados: [...lista, em] };
    r.eventos.push({ em, texto: `código enviado para ${para}` });
  });
  const c = registro.contexto;
  const corpo = `Olá${primeiro(c.nome) ? `, ${primeiro(c.nome)}` : ''}.\n\nSeu código para confirmar este e-mail é: ${codigo}\n\nEle vale por ${MINUTOS_CODIGO} minutos. Digite na página do termo da reserva.\n\nSe você não pediu este código, ignore este e-mail.\n\n${c.empresa || 'Administração'}`;
  try {
    await enviarEmail(env, { para, assunto: `Seu código de confirmação: ${codigo}`, texto: corpo }, { buscar, simular: sim, conta });
  } catch (e) {
    console.warn('código do termo da reserva', e.message);
    try {
      await mudarRegistro(env, ficha, (r) => {
        if (!r.codigo || r.codigo.hash !== hashNovo) return r;
        r.codigo = anterior ? { ...anterior, enviados: (r.codigo.enviados || []).filter((x) => x !== em) } : null;
        r.eventos.push({ em: new Date().toISOString(), texto: `código para ${para} não saiu (falha no envio do e-mail)` });
        return r;
      });
    } catch (e2) { console.warn('desfazer o código que não saiu', e2.message); }
    throw new ErroAceite(502, 'Não conseguimos mandar o e-mail agora. Confira o endereço e tente de novo em alguns minutos.');
  }
  return json(200, { ok: true, para });
}

/** Comprovante do aceite (e-mail para a pessoa): o texto aceito, o código de conferência e a conta para o depósito. */
export function textoDoComprovante(c, resposta) {
  const quando = new Date(resposta.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  return `Olá${primeiro(c.nome) ? `, ${primeiro(c.nome)}` : ''}.\n\nRecebemos o seu aceite do termo da reserva em ${quando} (horário de Brasília).\n\n`
    + `PRÓXIMO PASSO: faça o depósito da reserva de ${c.reserva}${c.deposito ? ` na conta abaixo e responda este e-mail com o comprovante:\n${c.deposito}` : ' e mande o comprovante para a administração'}.\n`
    + `Depois do depósito, você tem ${c.condicoes.dias_uteis_documentos} ${c.condicoes.documentos_corridos ? 'dias corridos' : 'dias úteis'} para mandar a ficha e os documentos pelo link que vamos enviar.\n\n`
    + `O texto que você leu e aceitou:\n\n${textoDoAceite(c)}\n\nCódigo de conferência do texto: ${resposta.texto_sha256.slice(0, 16)}\n\n`
    + `Guarde este e-mail. Qualquer dúvida, fale com a administração${c.telefone_empresa ? ` pelo ${c.telefone_empresa}` : ''}.\n\n${c.empresa || 'Administração'}`;
}

/** Confirma o aceite: { email, codigo, ciente: true, assinatura? }. O e-mail precisa ser o do último código enviado. */
export async function confirmarAceite(request, env, { buscar = fetch, avisar = true } = {}) {
  const { ficha, registro } = await registroDaChave(request, env, { gravar: true });
  if (registro.resposta) throw new ErroAceite(409, 'O termo já foi aceito.');
  const p = await lerJson(request);
  if (p.ciente !== true) throw new ErroAceite(400, 'Marque "Li e concordo" antes de confirmar.');
  const email = texto(p.email, 254).toLowerCase();
  const assinatura = assinaturaValida(p.assinatura);
  const codigo = String(p.codigo || '').replace(/\D/g, '');
  const em = new Date().toISOString();
  let errou = false;
  const novo = await mudarRegistro(env, ficha, async (r) => {
    errou = false;
    if (r.resposta) throw new ErroAceite(409, 'O termo já foi aceito.');
    const k = r.codigo;
    if (!k || k.para !== email) throw new ErroAceite(400, 'Peça o código para este e-mail antes de confirmar.');
    if (k.tentativas >= MAX_TENTATIVAS) throw new ErroAceite(429, 'Código errado vezes demais. Peça um código novo.');
    if (passou(k.vence)) throw new ErroAceite(400, 'O código venceu. Peça um código novo.');
    if (codigo.length !== 6 || (await sha(`${r.hash}|${codigo}`)) !== k.hash) { k.tentativas += 1; errou = true; return r; }
    const aceito = textoDoAceite(r.contexto);
    r.resposta = {
      em, email, ciente: true, assinatura, email_confirmado: true, canal: canalDe(request), ip: ipDe(request), aparelho: aparelhoDe(request),
      texto_aceito: aceito, texto_sha256: await sha(aceito), condicoes: r.contexto.condicoes, reserva_valor: r.contexto.reserva_valor,
    };
    r.codigo = null;
    r.eventos.push({ em, texto: `termo aceito (${email})` });
    return r;
  });
  if (errou) throw new ErroAceite(400, 'Código errado. Confira o e-mail e digite de novo.');
  const c = novo.contexto;
  const sim = simular(env);
  let comprovanteSaiu = false;
  let conta = null; let gmail = { ligado: false };
  try {
    conta = sim ? null : await contaGuardada(env);
    gmail = estadoEmail(env, { simular: sim, conta });
    if (gmail.ligado) {
      await enviarEmail(env, { para: email, assunto: `Comprovante: termo da reserva aceito (${c.imovel || c.empresa})`.slice(0, 190), texto: textoDoComprovante(c, novo.resposta) }, { buscar, simular: sim, conta });
      comprovanteSaiu = true;
    }
  } catch (e) { console.warn('comprovante do termo da reserva', e.message); }
  try {
    await mudarRegistro(env, ficha, (r) => { if (r.resposta && r.resposta.em === em) r.resposta.comprovante_em = comprovanteSaiu ? new Date().toISOString() : null; return r; });
  } catch (e) { console.warn('anotar o comprovante do termo', e.message); }
  if (avisar) {
    // equipe: e-mail na caixa da empresa e celular (sem nome na tela bloqueada, LGPD)
    const equipe = String(env.AVISOS_EQUIPE || gmail.remetente || '').split(',').map((x) => x.trim()).filter(emailValido);
    const url = env.ORIGEM ? `${String(env.ORIGEM).replace(/\/$/, '')}/#/ficha/${ficha}` : '';
    if (gmail.ligado && equipe.length) {
      try { await enviarEmail(env, { para: equipe.join(','), assunto: `Termo da reserva aceito: ${c.nome}`.slice(0, 190), texto: `${c.nome} aceitou o termo da reserva (${c.imovel}) em ${new Date(em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}, com o e-mail ${email} confirmado. Agora é esperar o depósito de ${c.reserva}.${url ? `\n\nAbrir a ficha: ${url}` : ''}` }, { buscar, simular: sim, conta }); } catch (e) { console.warn('aviso à equipe (termo)', e.message); }
    }
    try { await avisarAparelhos(env, { titulo: 'Termo da reserva aceito', texto: 'Um interessado aceitou o termo da reserva. Toque para abrir.', url: `./#/ficha/${ficha}`, tag: `aceite-${ficha}` }, { buscar }); } catch (e) { console.warn('aviso no celular (termo)', e.message); }
  }
  return json(200, { ok: true, em, comprovante: comprovanteSaiu });
}

/** Rotas públicas do termo (dentro do endereço da ficha). `r`: o caminho depois de /api/publico/. */
export async function atenderAceitePublico(request, env, r, opcoes = {}) {
  const m = request.method;
  try {
    if (r === 'aceite' && m === 'GET') return await lerAceitePublico(request, env);
    if (r === 'aceite/codigo' && m === 'POST') return await enviarCodigoAceite(request, env, opcoes);
    if (r === 'aceite/confirmar' && m === 'POST') return await confirmarAceite(request, env, opcoes);
    return json(404, { erro: 'Não encontrado.' });
  } catch (e) {
    if (e instanceof ErroAceite) return json(e.status, { erro: e.message });
    console.error(e);
    return json(500, { erro: 'Erro no servidor. Tente de novo em alguns minutos.' });
  }
}

// ---------------------------------------------------------------------------
// A página (um arquivo só, sem nada de fora; CSP com nonce). Sem barra invertida no script (fica dentro de um texto `...`).
// ---------------------------------------------------------------------------
export function paginaDoAceite() {
  const nonce = novaChave().slice(0, 24);
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`;
  return new Response(PAGINA.replaceAll('{{NONCE}}', nonce), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex', ...HSTS },
  });
}

const PAGINA = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Termo da reserva</title>
<style nonce="{{NONCE}}">
:root{--fundo:#f5f6f8;--cartao:#fff;--texto:#1d2330;--suave:#5d6675;--borda:#d6dae1;--cor:#1e3a8a;--claro:#e8edfb;--ok:#1d7a45;--aviso:#8a5a00;--perigo:#b3261e}
@media (prefers-color-scheme:dark){:root{--fundo:#15181d;--cartao:#1e232a;--texto:#e7eaef;--suave:#9aa3b2;--borda:#343b46;--cor:#8fb3ff;--claro:#1f2a44;--ok:#5cc28a;--aviso:#e0b04f;--perigo:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--texto);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:680px;margin:0 auto;padding:12px 14px 40px}
.topo{text-align:center;background:var(--cartao);border:1px solid var(--borda);border-radius:12px;padding:16px;margin:8px 0}
.topo img{max-width:160px;max-height:90px;display:block;margin:0 auto 8px}.topo .nome{font-weight:700;font-size:1.05rem}
.seguro{font-size:.85rem;color:var(--suave);margin-top:6px}
.cartao{background:var(--cartao);border:1px solid var(--borda);border-radius:12px;padding:16px;margin:12px 0}
h1{font-size:1.25rem;margin:0 0 6px}h2{font-size:1.05rem;margin:0 0 8px}.suave{color:var(--suave);font-size:.92rem}
label{display:block;font-weight:600;margin:12px 0 4px}input[type=email],input[type=text]{width:100%;font:inherit;padding:11px;border:1px solid var(--borda);border-radius:8px;background:var(--cartao);color:var(--texto)}
.caixa{display:flex;gap:10px;align-items:flex-start;font-weight:400;margin:10px 0}.caixa input{margin-top:5px;transform:scale(1.3)}
button{font:inherit;font-weight:600;padding:12px 18px;border-radius:10px;border:0;background:var(--cor);color:#fff;cursor:pointer;margin:8px 8px 0 0}
@media (prefers-color-scheme:dark){button{color:#10172a}}
button.sec{background:transparent;color:var(--cor);border:1px solid var(--cor)}button:disabled{opacity:.5}
.aviso{border-left:4px solid var(--aviso);padding:10px 12px;background:color-mix(in srgb,var(--aviso) 10%,transparent);border-radius:6px}
.ok{border-left:4px solid var(--ok);padding:10px 12px;background:color-mix(in srgb,var(--ok) 10%,transparent);border-radius:6px}
.texto{white-space:pre-wrap;background:var(--claro);border-radius:8px;padding:12px;font-size:.95rem}
.erro{color:var(--perigo);font-weight:600}canvas{width:100%;height:150px;border:1px dashed var(--borda);border-radius:8px;touch-action:none;background:#fff}
.rodape{text-align:center;color:var(--suave);font-size:.82rem;margin-top:18px}[hidden]{display:none!important}
</style></head><body><main id="app"><p class="suave">Carregando…</p></main>
<script nonce="{{NONCE}}">
(() => {
  const app = document.getElementById('app');
  const chave = location.hash.slice(1);
  const canal = { e: 'email', w: 'whatsapp' }[new URLSearchParams(location.search).get('c')] || 'direto';
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dataBr = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
  const horaBr = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const so = (t) => String(t || '').split('').filter((x) => x >= '0' && x <= '9').join('');
  const api = async (caminho, op = {}) => {
    const r = await fetch('/api/publico/' + caminho, { ...op, headers: { 'X-Ficha-Token': chave, 'X-Canal': canal, ...(op.method && op.method !== 'GET' ? { 'X-Ficha': '1', 'Content-Type': 'application/json' } : {}) } });
    const tipo = r.headers.get('content-type') || '';
    if (!tipo.includes('json')) throw new Error('Sem resposta do servidor. Tente de novo.');
    const d = await r.json();
    if (!r.ok) throw new Error(d.erro || 'Não deu certo. Tente de novo.');
    return d;
  };
  let D = null; let assinou = false;
  const topo = (c) => '<div class="topo">' + (c.logo ? '<img src="' + esc(c.logo) + '" alt="Logo">' : '')
    + '<div class="nome">' + esc(c.empresa || 'Administração de imóveis') + '</div>'
    + (c.cnpj ? '<div class="suave">CNPJ ' + esc(c.cnpj) + '</div>' : '')
    + '<div class="seguro">Endereço seguro: <b>' + esc(location.host) + '</b>' + (c.email_empresa ? ' · e-mail oficial: <b>' + esc(c.email_empresa) + '</b>' : '') + '</div></div>';
  const rodape = (c) => '<p class="rodape">Só deposite na conta que aparece neste termo, em nome da empresa.' + (c.telefone_empresa ? ' Na dúvida, ligue para ' + esc(c.telefone_empresa) + '.' : '') + '</p>';

  function feito(c, resp, novo) {
    app.innerHTML = topo(c) + '<div class="cartao"><div class="ok"><b>' + (novo ? 'Pronto! Termo aceito.' : 'Você já aceitou este termo.') + '</b><br>Em ' + esc(horaBr(resp.em)) + ', com o e-mail <b>' + esc(resp.email) + '</b>.</div>'
      + '<h2>Próximo passo: o depósito da reserva</h2><p>Deposite <b>' + esc(c.reserva) + '</b>' + (c.deposito ? ' na conta abaixo e mande o comprovante respondendo o e-mail do comprovante:</p><div class="texto">' + esc(c.deposito) + '</div>' : ' e mande o comprovante para a administração.</p>')
      + '<p>Depois do depósito, você tem <b>' + esc(c.condicoes.dias_uteis_documentos) + (c.condicoes.documentos_corridos ? ' dias corridos' : ' dias úteis') + '</b> para mandar a ficha e os documentos pelo link que vamos enviar.</p>'
      + '<p class="suave">' + (resp.comprovante ? 'Mandamos o comprovante do aceite, com o texto inteiro, para o seu e-mail.' : 'Não conseguimos mandar o comprovante para o seu e-mail agora: guarde esta tela (tire uma foto ou um print).') + ' Confira também a caixa de spam.</p></div>'
      + '<div class="cartao"><h2>O termo que você aceitou</h2><div class="texto">' + esc(c.termo) + '</div></div>' + rodape(c);
  }

  function formulario(c) {
    app.innerHTML = topo(c)
      + '<div class="cartao"><h1>Olá, ' + esc(String(c.nome).split(' ')[0]) + '</h1>'
      + '<p>Antes de depositar a reserva, leia as condições do imóvel e o termo. Se estiver de acordo, confirme seu e-mail e dê o aceite no fim da página.</p>'
      + '<p class="suave">Imóvel: ' + esc(c.imovel) + ' · reserva de <b>' + esc(c.reserva) + '</b>, abatida do 1º aluguel. Este link é só seu e vale até ' + esc(dataBr(D.vence_em)) + '.</p></div>'
      + (c.aviso ? '<div class="cartao"><div class="aviso"><b>' + esc(c.aviso) + '</b></div></div>' : '')
      + '<div class="cartao"><h2>1. Leia o termo</h2><div class="texto">' + esc(c.termo) + '</div></div>'
      + '<div class="cartao"><h2>2. Confirme o e-mail</h2><p class="suave">Mandamos um código de 6 números para este e-mail. O comprovante do aceite vai para ele.</p>'
      + '<label for="email">E-mail</label><input id="email" type="email" autocomplete="email" value="' + esc(c.email) + '">'
      + '<button class="sec" id="pedir">Mandar o código</button><div id="msg-codigo" class="suave"></div>'
      + '<label for="codigo">Código recebido</label><input id="codigo" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></div>'
      + '<div class="cartao"><h2>3. Aceite</h2>' + (c.aviso ? '<p class="aviso">' + esc(c.aviso) + '</p>' : '') + '<label class="caixa"><input type="checkbox" id="ciente"> <span>' + esc(c.ciencia) + '</span></label>'
      + '<label>Assinatura com o dedo (opcional)</label><canvas id="ass"></canvas><button class="sec" id="limpar" type="button">Limpar assinatura</button></div>'
      + '<div class="cartao"><button id="confirmar">Aceitar o termo</button><div id="msg" class="erro"></div>'
      + '<p class="suave">Ao aceitar, guardamos a data, a hora, o endereço de internet, o aparelho usado e o texto acima, como prova do aceite. Seus dados são usados só para a análise desta locação (Lei 13.709/2018).</p></div>'
      + rodape(c);
    if (D.codigo_para && D.codigo_para === String(c.email).toLowerCase()) document.getElementById('msg-codigo').textContent = 'Código já enviado para ' + D.codigo_para + '. Confira a caixa de entrada e o spam.';
    const cv = document.getElementById('ass'); const ctx = cv.getContext('2d');
    const fundo = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore(); };
    const ajustar = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * 2; cv.height = r.height * 2; ctx.scale(2, 2); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111111'; fundo(); };
    ajustar(); assinou = false;
    let desenhando = false;
    const ponto = (ev) => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    cv.addEventListener('pointerdown', (ev) => { desenhando = true; cv.setPointerCapture(ev.pointerId); const [x, y] = ponto(ev); ctx.beginPath(); ctx.moveTo(x, y); });
    cv.addEventListener('pointermove', (ev) => { if (!desenhando) return; const [x, y] = ponto(ev); ctx.lineTo(x, y); ctx.stroke(); assinou = true; });
    cv.addEventListener('pointerup', () => { desenhando = false; });
    document.getElementById('limpar').addEventListener('click', () => { fundo(); assinou = false; });
    document.getElementById('pedir').addEventListener('click', async (ev) => {
      const b = ev.currentTarget; const m = document.getElementById('msg-codigo'); b.disabled = true; m.className = 'suave'; m.textContent = 'Mandando…';
      try { const r = await api('aceite/codigo', { method: 'POST', body: JSON.stringify({ email: document.getElementById('email').value }) }); m.textContent = 'Código enviado para ' + r.para + '. Confira a caixa de entrada e o spam.'; setTimeout(() => { b.disabled = false; }, 60000); }
      catch (e) { m.className = 'erro'; m.textContent = e.message; b.disabled = false; }
    });
    document.getElementById('confirmar').addEventListener('click', async (ev) => {
      const msg = document.getElementById('msg'); msg.textContent = '';
      if (!document.getElementById('ciente').checked) { msg.textContent = 'Marque a caixa "Li as condições acima e concordo" antes de aceitar.'; return; }
      if (so(document.getElementById('codigo').value).length !== 6) { msg.textContent = 'Digite o código de 6 números que chegou no e-mail.'; return; }
      ev.target.disabled = true; ev.target.textContent = 'Aceitando…';
      try {
        const corpo = { email: document.getElementById('email').value, codigo: document.getElementById('codigo').value, ciente: true, assinatura: assinou ? cv.toDataURL('image/png') : '' };
        const r = await api('aceite/confirmar', { method: 'POST', body: JSON.stringify(corpo) });
        feito(c, { em: r.em, email: String(corpo.email).trim().toLowerCase(), comprovante: !!r.comprovante }, true);
        window.scrollTo(0, 0);
      } catch (e) { msg.textContent = e.message; ev.target.disabled = false; ev.target.textContent = 'Aceitar o termo'; }
    });
  }

  (async () => {
    if (!chave) { app.innerHTML = '<div class="cartao"><p class="erro">Link incompleto. Abra o endereço inteiro que você recebeu.</p></div>'; return; }
    try {
      D = await api('aceite');
      if (D.resposta) feito(D.contexto, D.resposta, false);
      else if (D.vencido) app.innerHTML = topo(D.contexto) + '<div class="cartao"><p class="aviso">O prazo deste link acabou. Fale com a administração para receber um novo.</p></div>' + rodape(D.contexto);
      else formulario(D.contexto);
    } catch (e) { app.innerHTML = '<div class="cartao"><p class="erro">' + esc(e.message) + '</p></div>'; }
  })();
})();
</script></body></html>`;
