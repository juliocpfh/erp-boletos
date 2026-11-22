// Certificado digital A1 (e-CNPJ da ANK) no programa do PC e a rodada que assina a fila (pedido do dono de 21/11/2026; parte 4):
// - pelo sistema (Sistema → Empresas → Anexar o certificado digital, 22/11): certificado-local.mjs;
// - "--certificado" (reserva, sem o site): abre uma página só neste computador (127.0.0.1, como a de ligar) para escolher o arquivo .pfx e digitar a
//   senha; o programa confere o certificado (razão social, CNPJ, validade) e guarda o arquivo e a senha cifrados pelo Windows
//   (DPAPI: só esta conta deste computador abre), em certificado.json na pasta de configurações (fora do OneDrive e dos backups);
// - "--assinar" (tarefa do Windows a cada minuto, sem janela): sem certificado, sai na hora sem ir à internet; com ele, busca na
//   nuvem os documentos que o site pôs na fila (nuvem/assinaturas.mjs), assina (assinar-pdf.mjs) e devolve; erro de um documento
//   (ex.: certificado vencido) vai para o site, que o mostra.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { assinarPdf, conferirCertificado } from './assinar-pdf.mjs';
import { abrirNoNavegador, abrirNoWindows, pastaConfig, protegerNoWindows } from './ligar.mjs';

export const ARQUIVO_CERTIFICADO = 'certificado.json';
export const MAX_PFX = 64 * 1024; // um .pfx A1 tem poucos KB
export const TEMPO_NUVEM = 60000;
const dataBr = (iso) => String(iso || '').split('-').reverse().join('/');
/** O dia neste computador (em UTC, às 21h de Brasília o certificado que vence hoje já contava como vencido). */
export function diaDaqui(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** O certificado guardado: { pfx (base64), senha, nome, cnpj, validade, instalado_em } ou null. */
export function lerCertificado(env = process.env, { abrir = abrirNoWindows } = {}) {
  const arq = path.join(pastaConfig(env), ARQUIVO_CERTIFICADO);
  if (!fs.existsSync(arq)) return null;
  const c = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const senha = abrir(c.senha);
  // formato 2 (22/11/2026): a senha entra na cifra em base64, porque o PowerShell tira os espaços das pontas do texto
  return { ...c, pfx: abrir(c.pfx), senha: c.formato === 2 ? Buffer.from(senha, 'base64').toString('utf8') : senha };
}

/** Só os dados que podem aparecer (sem o arquivo e a senha), sem abrir a cifra. */
export function resumoDoCertificado(env = process.env) {
  const arq = path.join(pastaConfig(env), ARQUIVO_CERTIFICADO);
  if (!fs.existsSync(arq)) return null;
  try {
    const { nome, cnpj, validade, instalado_em: instalado } = JSON.parse(fs.readFileSync(arq, 'utf8'));
    return { nome, cnpj, validade, instalado_em: instalado };
  } catch { return null; } // arquivo estragado: é como não ter (instalar de novo conserta)
}

/**
 * Confere e guarda o certificado. ``pfx``: base64 do arquivo. Recusa senha errada, arquivo sem a chave e certificado vencido.
 * Devolve { nome, cnpj, validade }. ``dados`` e ``proteger`` trocam nos testes.
 */
export function guardarCertificado({ pfx, senha }, env = process.env, { dados = conferirCertificado, proteger = protegerNoWindows, hoje = diaDaqui() } = {}) {
  if (!pfx || !/^[A-Za-z0-9+/=]+$/.test(pfx)) throw new Error('Escolha o arquivo do certificado (.pfx ou .p12).');
  if (!senha) throw new Error('Digite a senha do certificado.');
  const d = dados(pfx, senha);
  if (d.validade && d.validade < hoje) throw new Error(`Este certificado venceu em ${d.validade.split('-').reverse().join('/')}: renove com a certificadora e instale o novo.`);
  if (d.inicio && d.inicio > hoje) throw new Error(`Este certificado só vale a partir de ${dataBr(d.inicio)}: instale-o nesse dia ou use o que está valendo.`);
  const dir = pastaConfig(env);
  fs.mkdirSync(dir, { recursive: true });
  // grava ao lado e só então troca: se faltar luz ou espaço no meio, o certificado anterior continua inteiro
  const destino = path.join(dir, ARQUIVO_CERTIFICADO);
  fs.writeFileSync(`${destino}.novo`, JSON.stringify({ formato: 2, pfx: proteger(pfx), senha: proteger(Buffer.from(senha, 'utf8').toString('base64')), nome: d.nome, cnpj: d.cnpj, emissor: d.emissor, validade: d.validade, instalado_em: new Date().toISOString() }, null, 2));
  fs.renameSync(`${destino}.novo`, destino);
  return { nome: d.nome, cnpj: d.cnpj, validade: d.validade };
}

export function apagarCertificado(env = process.env) {
  const arq = path.join(pastaConfig(env), ARQUIVO_CERTIFICADO);
  if (fs.existsSync(arq)) fs.rmSync(arq);
}

// ---------------------------------------------------------------------------
// A página para escolher o certificado (só neste computador)
// ---------------------------------------------------------------------------
const pagina = (seg, atual) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Certificado digital</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:Segoe UI,Arial,sans-serif;background:#f3f4f6;color:#111;margin:0;padding:24px}main{max-width:540px;margin:auto;background:#fff;border-radius:10px;padding:24px;box-shadow:0 2px 8px #0002}
label{display:block;margin:14px 0 4px;font-weight:600}input{width:100%;box-sizing:border-box;padding:9px;font-size:15px;border:1px solid #bbb;border-radius:6px}
button{padding:10px 16px;font-size:15px;border:0;border-radius:6px;background:#1d4ed8;color:#fff;cursor:pointer}#msg{margin-top:16px;padding:10px;border-radius:6px;display:none}.erro{background:#fee2e2;display:block!important}.ok{background:#dcfce7;display:block!important}small{color:#555}</style></head>
<body><main><h1>Certificado digital da empresa</h1>
<p>Escolha o arquivo do certificado <b>A1</b> (e-CNPJ, termina em <b>.pfx</b> ou <b>.p12</b>) e digite a senha dele. O arquivo e a senha ficam guardados <b>só neste computador</b>, cifrados pelo Windows, e não vão para a nuvem. Com eles, este computador assina sozinho os documentos que o sistema põe na fila.</p>
${atual ? `<p><small>Instalado hoje: <b>${atual}</b>. Escolher outro troca o atual.</small></p>` : ''}
<form id="f"><label>Arquivo do certificado</label><input name="arquivo" type="file" accept=".pfx,.p12" required>
<label>Senha do certificado</label><input name="senha" type="password" autocomplete="off" required>
<p><button id="b">Instalar</button></p></form><div id="msg"></div></main>
<script>
const seg = ${JSON.stringify(seg)}; const f = document.getElementById('f'); const msg = document.getElementById('msg');
const mostrar = (t, c) => { msg.textContent = t; msg.className = c; };
const base64 = (arq) => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = falha; r.readAsDataURL(arq); });
f.onsubmit = async (ev) => { ev.preventDefault(); const b = document.getElementById('b'); b.disabled = true; mostrar('Conferindo o certificado…', 'ok');
  try { const arq = f.arquivo.files[0]; if (!arq) throw new Error('Escolha o arquivo do certificado.');
    const r = await fetch('/' + seg + '/instalar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pfx: await base64(arq), senha: f.senha.value }) });
    const d = await r.json(); if (!r.ok) throw new Error(d.erro); f.remove(); mostrar(d.texto, 'ok');
  } catch (e) { mostrar(e.message, 'erro'); b.disabled = false; } };
</script></body></html>`;

const escHtml = (t) => String(t || '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Sobe a página em 127.0.0.1 (porta e endereço sorteados), abre no navegador e espera instalar. Devolve { nome, cnpj, validade }. */
export function janelaDoCertificado({ env = process.env, guardar = guardarCertificado, abrirNavegador = abrirNoNavegador, aoAbrir = () => {} } = {}) {
  const seg = crypto.randomBytes(18).toString('hex');
  const r = resumoDoCertificado(env);
  const atual = r ? escHtml(`${r.nome}${r.cnpj ? `, CNPJ ${r.cnpj}` : ''}, válido até ${String(r.validade || '').split('-').reverse().join('/')}`) : '';
  return new Promise((resolver, recusar) => {
    let porta = 0; let feito = false;
    const servidor = http.createServer(async (req, res) => {
      const responder = (status, dados, tipo = 'application/json; charset=utf-8') => {
        res.writeHead(status, { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
        res.end(typeof dados === 'string' ? dados : JSON.stringify(dados));
      };
      const daqui = `127.0.0.1:${porta}`;
      if (req.headers.host !== daqui || (req.headers.origin && req.headers.origin !== `http://${daqui}`)) return responder(403, { erro: 'Recusado.' });
      if (req.method === 'GET' && req.url === `/${seg}`) return responder(200, pagina(seg, atual), 'text/html; charset=utf-8');
      if (req.method !== 'POST' || req.url !== `/${seg}/instalar` || feito || !String(req.headers['content-type'] || '').startsWith('application/json')) return responder(404, { erro: 'Não encontrado.' });
      let corpo;
      try {
        const partes = []; let tam = 0;
        for await (const p of req) { tam += p.length; if (tam > MAX_PFX * 2) throw new Error('grande'); partes.push(p); }
        corpo = JSON.parse(Buffer.concat(partes).toString('utf8'));
      } catch { return responder(400, { erro: 'Arquivo grande demais ou pedido inválido.' }); }
      try {
        const d = guardar({ pfx: String(corpo.pfx || ''), senha: String(corpo.senha || '') }, env);
        feito = true;
        responder(200, { texto: `Pronto: certificado de ${d.nome}${d.cnpj ? `, CNPJ ${d.cnpj}` : ''}, válido até ${String(d.validade || '').split('-').reverse().join('/')}, instalado neste computador. Pode fechar esta página. Agora ligue a assinatura digital no sistema (Sistema → Regras do sistema).` });
        setTimeout(() => servidor.close(), 200);
        return resolver(d);
      } catch (e) { return responder(400, { erro: e.message }); }
    });
    servidor.on('error', recusar);
    servidor.listen(0, '127.0.0.1', () => {
      porta = servidor.address().port;
      const url = `http://127.0.0.1:${porta}/${seg}`;
      aoAbrir(url);
      abrirNavegador(url);
    });
  });
}

// ---------------------------------------------------------------------------
// A rodada da assinatura
// ---------------------------------------------------------------------------
/** Cabeçalho HTTP não aceita qualquer letra: "ADMINISTRAÇÃO" → "ADMINISTRACAO" (no PDF o nome sai com os acentos). */
const semAcento = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^ -~]/g, ' ');
/**
 * Assina o que estiver na fila da nuvem. ``ligacao``: { site, cracha, computador }; ``cert``: o lerCertificado. Devolve
 * { assinados, erros }. ``buscar`` e ``assinar`` trocam nos testes.
 */
export async function assinarFila(ligacao, cert, { buscar = fetch, assinar = assinarPdf, versao = '' } = {}) {
  const base = `${ligacao.site}/api/aparelho/assinaturas`;
  const cab = { Authorization: `Bearer ${ligacao.cracha}`, ...(versao ? { 'X-Programa-Versao': versao } : {}) };
  const pedir = async (url, op = {}) => {
    const r = await buscar(url, { redirect: 'manual', signal: AbortSignal.timeout(TEMPO_NUVEM), ...op, headers: { ...cab, ...(op.headers || {}) } });
    if (r.status === 401) throw new Error('Este computador não está mais ligado ao sistema: ligue de novo (abra o programa com dois cliques).');
    return r;
  };
  const lista = await pedir(base);
  if (!lista.ok) throw new Error(`A nuvem não respondeu à fila de assinatura (${lista.status}).`);
  const { pendentes = [] } = await lista.json();
  const out = { assinados: 0, erros: [] };
  const vencido = cert.validade && cert.validade < diaDaqui();
  for (const p of pendentes) {
    try {
      if (vencido) throw new Error(`o certificado da empresa venceu em ${cert.validade.split('-').reverse().join('/')}: instale o novo no programa do PC`);
      const r = await pedir(`${base}/${p.id}.pdf`);
      if (r.status === 409) continue; // trocado ou cancelado no site enquanto isso
      if (!r.ok) throw new Error(`não consegui baixar o documento (${r.status})`);
      const assinado = assinar(Buffer.from(await r.arrayBuffer()), { pfx: cert.pfx, senha: cert.senha, dados: { nome: cert.nome, cnpj: cert.cnpj, emissor: cert.emissor }, selo: { documento: p.titulo } });
      const v = await pedir(`${base}/${p.id}/assinado`, { method: 'PUT', body: assinado, headers: { 'Content-Type': 'application/pdf', 'X-Certificado': semAcento(`${cert.nome}${cert.cnpj ? `:${cert.cnpj.replace(/\D/g, '')}` : ''}`) } });
      if (v.status === 409) continue;
      if (!v.ok) { const d = await v.json().catch(() => ({})); throw new Error(d.erro || `a nuvem recusou o assinado (${v.status})`); }
      out.assinados += 1;
    } catch (e) {
      out.erros.push(`${p.titulo}: ${e.message}`);
      try { await pedir(`${base}/${p.id}/erro`, { method: 'POST', body: JSON.stringify({ mensagem: e.message }), headers: { 'Content-Type': 'application/json' } }); } catch { /* sem internet: tenta de novo no próximo minuto */ }
    }
  }
  return out;
}
