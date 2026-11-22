// Fila da assinatura digital (pedido do dono de 21/11/2026; parte 2 de 4): o site manda o PDF conferido, o programa do PC
// (o certificado A1 e-CNPJ da ANK fica só lá, atualizador-pc/assinar-pdf.mjs) busca, assina e devolve; o site baixa o assinado
// e manda ao inquilino. Tudo em sistema/assinaturas/ do R2 (fora de RAIZES: as rotas genéricas de arquivos não chegam):
//   <id>.json (o pedido: título, situação, quem e quando), <id>.pdf (o original) e <id>-assinado.pdf; _pc.json (quando o
//   programa do PC olhou a fila pela última vez: o site avisa "ligue o PC" quando há documento esperando).
// Rotas da equipe (com o login do Access, worker.mjs): POST /api/assinaturas (corpo = o PDF; ?titulo=&chave=&contrato=&nome=),
// GET /api/assinaturas (a fila), GET /api/assinaturas/<id>.pdf[?assinado=1], DELETE /api/assinaturas/<id>.
// Rotas do programa do PC (crachá do aparelho, as ÚNICAS em que o crachá grava): GET /api/aparelho/assinaturas (os pendentes),
// GET /api/aparelho/assinaturas/<id>.pdf, PUT /api/aparelho/assinaturas/<id>/assinado (o PDF assinado) e POST …/<id>/erro.
// O assinado só é aceito se começar com o original, byte a byte (a assinatura acrescenta no fim e não troca o documento) e
// tiver a assinatura digital (/ByteRange e adbe.pkcs7.detached) no que foi acrescentado.
import { lerAteLimite } from './ficha-publica.mjs';

export class ErroAssinatura extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

const PASTA = 'sistema/assinaturas';
export const MAX_PDF = 15 * 1024 * 1024; // o mesmo limite dos anexos
const MAX_ACRESCIMO = 2 * 1024 * 1024; // o que a assinatura acrescenta (página final e assinatura: ~70 KB)
export const DIAS_GUARDA = 90; // pedidos assinados ou cancelados somem da fila depois disso (o PDF assinado vai para a pasta do inquilino)
const SITUACOES = ['pendente', 'assinado', 'erro'];

const json = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const idValido = (id) => { if (!/^[a-z0-9]{8,40}$/.test(String(id || ''))) throw new ErroAssinatura(404, 'Pedido de assinatura não encontrado.'); return id; };
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);
const novoId = () => `${Date.now().toString(36)}${[...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(36).padStart(2, '0')).join('')}`.slice(0, 24);

async function lerPedido(env, id) {
  const o = await env.DADOS.get(`${PASTA}/${idValido(id)}.json`);
  if (!o) throw new ErroAssinatura(404, 'Pedido de assinatura não encontrado.');
  return JSON.parse(await o.text());
}
const resumo = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
const gravarPedido = (env, p) => env.DADOS.put(`${PASTA}/${p.id}.json`, JSON.stringify(p), { httpMetadata: { contentType: 'application/json' } });

async function lerPdf(request, maximo) {
  const corpo = await lerAteLimite(request, maximo);
  if (!corpo) throw new ErroAssinatura(413, `PDF grande demais (máximo ${Math.round(maximo / 1048576)} MB).`);
  const b = new Uint8Array(corpo);
  if (b.length < 8 || String.fromCharCode(...b.subarray(0, 5)) !== '%PDF-') throw new ErroAssinatura(400, 'O arquivo não é um PDF.');
  return b;
}

/** Todos os pedidos (o JSON de cada um), do mais novo ao mais velho; os velhos demais saem aqui (faxina). */
async function todos(env) {
  const out = [];
  let cursor;
  do {
    const r = await env.DADOS.list({ prefix: `${PASTA}/`, cursor });
    for (const o of r.objects.filter((x) => /\/[a-z0-9]+\.json$/.test(x.key))) {
      const lido = await env.DADOS.get(o.key);
      if (!lido) continue;
      const p = JSON.parse(await lido.text());
      const velho = p.situacao !== 'pendente' && Date.parse(p.atualizado_em || p.pedido_em) < Date.now() - DIAS_GUARDA * 86400000;
      if (velho) { await env.DADOS.delete([o.key, `${PASTA}/${p.id}.pdf`, `${PASTA}/${p.id}-assinado.pdf`]); continue; }
      out.push(p);
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => String(b.pedido_em).localeCompare(String(a.pedido_em)));
}

async function pcVisto(env) {
  const o = await env.DADOS.get(`${PASTA}/_pc.json`);
  return o ? JSON.parse(await o.text()) : null;
}

/** Rotas da equipe (\`\`rota\`\`: o que vem depois de /api/assinaturas). \`\`exigir(nivel)\`\`: confere o papel; \`\`conferirGravacao()\`\`. */
export async function atenderEquipeAssinaturas(request, env, rota, email, { exigir, conferirGravacao }) {
  const m = request.method;
  const url = new URL(request.url);
  if (rota === '' && m === 'GET') {
    await exigir('consulta');
    return json(200, { pedidos: await todos(env), pc: await pcVisto(env) });
  }
  if (rota === '' && m === 'POST') {
    conferirGravacao(); await exigir('operador');
    const pdf = await lerPdf(request, MAX_PDF);
    const q = url.searchParams;
    const chave = texto(q.get('chave'), 120);
    // o mesmo documento já na fila esperando: troca pelo novo (conferido de novo), sem duplicar
    const antes = chave ? (await todos(env)).find((p) => p.chave === chave && p.situacao !== 'assinado') : null;
    const agora = new Date().toISOString();
    const p = { id: antes ? antes.id : novoId(), chave, titulo: texto(q.get('titulo'), 200) || 'Documento', nome: texto(q.get('nome'), 160) || 'documento.pdf',
      contrato_id: /^\d{1,12}$/.test(q.get('contrato') || '') ? Number(q.get('contrato')) : null, situacao: 'pendente', pedido_em: agora, pedido_por: email,
      atualizado_em: agora, tamanho: pdf.length, sha256: await resumo(pdf), assinado_em: null, assinado_por: null, certificado: null, erro: null };
    await env.DADOS.put(`${PASTA}/${p.id}.pdf`, pdf, { httpMetadata: { contentType: 'application/pdf' } });
    await env.DADOS.delete(`${PASTA}/${p.id}-assinado.pdf`);
    await gravarPedido(env, p);
    return json(200, { ok: true, pedido: p });
  }
  const arq = rota.match(/^([a-z0-9]+)\.pdf$/);
  if (arq && m === 'GET') {
    await exigir('consulta');
    const p = await lerPedido(env, arq[1]);
    const assinado = url.searchParams.get('assinado') === '1';
    if (assinado && p.situacao !== 'assinado') throw new ErroAssinatura(409, 'O documento ainda não foi assinado.');
    const o = await env.DADOS.get(`${PASTA}/${p.id}${assinado ? '-assinado' : ''}.pdf`);
    if (!o) throw new ErroAssinatura(404, 'Arquivo não encontrado.');
    return new Response(o.body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${p.nome.replace(/[^\w .-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  const um = rota.match(/^([a-z0-9]+)$/);
  if (um && m === 'DELETE') {
    conferirGravacao(); await exigir('operador');
    const p = await lerPedido(env, um[1]);
    await env.DADOS.delete([`${PASTA}/${p.id}.json`, `${PASTA}/${p.id}.pdf`, `${PASTA}/${p.id}-assinado.pdf`]);
    return json(200, { ok: true });
  }
  throw new ErroAssinatura(404, 'Não encontrado.');
}

/** Rotas do programa do PC (crachá já conferido; \`\`email\`\`: de quem ligou o computador). */
export async function atenderAparelhoAssinaturas(request, env, rota, email, { computador = '' } = {}) {
  const m = request.method;
  if (rota === '' && m === 'GET') {
    await env.DADOS.put(`${PASTA}/_pc.json`, JSON.stringify({ visto_em: new Date().toISOString(), por: email, computador: texto(computador, 60) }), { httpMetadata: { contentType: 'application/json' } });
    return json(200, { pendentes: (await todos(env)).filter((p) => p.situacao === 'pendente').map(({ id, titulo, nome, pedido_em, tamanho }) => ({ id, titulo, nome, pedido_em, tamanho })) });
  }
  const arq = rota.match(/^([a-z0-9]+)\.pdf$/);
  if (arq && m === 'GET') {
    const p = await lerPedido(env, arq[1]);
    if (p.situacao !== 'pendente') throw new ErroAssinatura(409, 'Este documento não está mais esperando assinatura.');
    const o = await env.DADOS.get(`${PASTA}/${p.id}.pdf`);
    if (!o) throw new ErroAssinatura(404, 'Arquivo não encontrado.');
    return new Response(o.body, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  const volta = rota.match(/^([a-z0-9]+)\/(assinado|erro)$/);
  if (!volta) throw new ErroAssinatura(404, 'Não encontrado.');
  const p = await lerPedido(env, volta[1]);
  if (p.situacao !== 'pendente') throw new ErroAssinatura(409, 'Este documento não está mais esperando assinatura (foi trocado ou cancelado no site).');
  if (volta[2] === 'erro' && m === 'POST') {
    const corpo = await lerAteLimite(request, 4096);
    let msg = '';
    try { msg = JSON.parse(new TextDecoder().decode(corpo || new Uint8Array())).mensagem; } catch { /* corpo inválido: mensagem padrão */ }
    Object.assign(p, { situacao: 'erro', erro: texto(msg, 300) || 'O programa do PC não conseguiu assinar.', atualizado_em: new Date().toISOString() });
    await gravarPedido(env, p);
    return json(200, { ok: true });
  }
  if (volta[2] !== 'assinado' || m !== 'PUT') throw new ErroAssinatura(405, 'Método não aceito.');
  const assinado = await lerPdf(request, p.tamanho + MAX_ACRESCIMO);
  // o documento não pode mudar: o assinado é o original com a assinatura acrescentada no fim (confere pelo resumo SHA-256 do
  // começo, guardado no pedido: comparar byte a byte um PDF grande passaria do tempo de processamento do Worker)
  if (assinado.length <= p.tamanho || await resumo(assinado.subarray(0, p.tamanho)) !== p.sha256) throw new ErroAssinatura(400, 'O PDF devolvido não é o documento que estava na fila com a assinatura acrescentada.');
  const novo = new TextDecoder('latin1').decode(assinado.subarray(p.tamanho));
  if (!/\/ByteRange\s*\[/.test(novo) || !/adbe\.pkcs7\.detached|ETSI\.CAdES\.detached/.test(novo) || !/%%EOF\s*$/.test(novo)) throw new ErroAssinatura(400, 'O PDF devolvido não tem a assinatura digital.');
  const cert = texto(request.headers.get('X-Certificado') || '', 200);
  await env.DADOS.put(`${PASTA}/${p.id}-assinado.pdf`, assinado, { httpMetadata: { contentType: 'application/pdf' } });
  const agora = new Date().toISOString();
  Object.assign(p, { situacao: 'assinado', assinado_em: agora, assinado_por: email, certificado: cert || null, erro: null, atualizado_em: agora });
  await gravarPedido(env, p);
  return json(200, { ok: true });
}

export { SITUACOES };
