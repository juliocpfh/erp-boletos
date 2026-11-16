// Painel do vendedor (etapa 6 da proposta): gerar, listar, revogar, cortesia, reenviar e equipe. Endereço próprio
// (HOST_VENDAS, vendas.ankjck.com.br), atrás do Cloudflare Access (aplicativo próprio: ACCESS_AUD_VENDAS) e conferido aqui
// também. Papéis vendedor/gerente no cofre das licenças (cofre-licencas.mjs). Nunca chega aos dados dos clientes.
// Rotas: GET / (a página) · /api/<rota> (repassa ao cofre das licenças; as rotas cliente/ não passam por aqui).

import { pedirAoCofreDeLicencas } from './cofre-licencas.mjs';

const ROTAS_GET = ['eu', 'planos', 'lista', 'equipe', 'historico'];
const ROTAS_POST = ['gerar', 'revogar', 'cortesia', 'reenviar', 'equipe', 'casa'];
const MAX_CORPO = 64 * 1024;

const json = (status, dados) => new Response(JSON.stringify(dados), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

/** O endereço do painel (vendas.ankjck.com.br) é outro aplicativo: só o painel responde lá. */
export const ehEnderecoDeVendas = (request, env) => new URL(request.url).hostname === String(env.HOST_VENDAS || 'vendas.ankjck.com.br');

/** Ambiente do login do painel: mesma equipe do Access, outro aplicativo (AUD), sem a lista EMAILS nem chaves de serviço. */
export const ambienteDoLogin = (env) => ({ ...env, ACCESS_AUD: env.ACCESS_AUD_VENDAS || '', EMAILS: '', SERVICOS: '' });

/**
 * Atende o endereço do painel. `conferirLogin(request, env)` vem do worker.mjs (o mesmo do sistema, com o AUD do painel):
 * sem ACCESS_AUD_VENDAS configurado, recusa tudo (o painel nunca fica aberto por engano).
 */
export async function atenderVendas(request, env, { conferirLogin }) {
  const url = new URL(request.url);
  try {
    if (url.pathname === '/' && request.method === 'GET') {
      await conferirLogin(request, ambienteDoLogin(env));
      return pagina();
    }
    if (!url.pathname.startsWith('/api/')) return json(404, { erro: 'Não encontrado.' });
    const rota = url.pathname.slice(5);
    const m = request.method;
    if (!(m === 'GET' ? ROTAS_GET : m === 'POST' ? ROTAS_POST : []).includes(rota)) return json(404, { erro: 'Não encontrado.' });
    const email = await conferirLogin(request, ambienteDoLogin(env));
    let corpo;
    if (m === 'POST') {
      // força a checagem do navegador contra outros sites (como conferirGravacao no worker.mjs)
      if (request.headers.get('X-Sistema') !== 'vendas') return json(403, { erro: 'Pedido recusado.' });
      const origem = request.headers.get('Origin');
      if (origem && origem !== `https://${env.HOST_VENDAS || 'vendas.ankjck.com.br'}` && origem !== url.origin) return json(403, { erro: 'Pedido recusado (origem).' });
      corpo = await request.text();
      if (corpo.length > MAX_CORPO) return json(413, { erro: 'Pedido grande demais.' });
    }
    return await pedirAoCofreDeLicencas(env, rota, { method: m, corpo, email, busca: url.search });
  } catch (e) {
    if (e && typeof e.status === 'number') return json(e.status, { erro: e.message });
    console.error(e);
    return json(500, { erro: 'Erro no painel de vendas.' });
  }
}

function pagina() {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`;
  return new Response(PAGINA.replaceAll('{{NONCE}}', nonce), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' },
  });
}

// A página: um arquivo só, sem nada de fora. Texto do servidor só entra por textContent (nunca innerHTML).
export const PAGINA = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Licenças · painel de vendas</title>
<style nonce="{{NONCE}}">
:root { --fundo:#f6f7f9; --cartao:#fff; --texto:#1d2330; --fraco:#5d6677; --borda:#d9dde5; --azul:#1f5fbf; --verde:#1d7a46; --amarelo:#9a6a00; --vermelho:#b3261e; }
@media (prefers-color-scheme: dark) { :root { --fundo:#14171c; --cartao:#1d2128; --texto:#e7e9ee; --fraco:#a3aab8; --borda:#323844; --azul:#7aa7ff; --verde:#5fc48a; --amarelo:#e2b54c; --vermelho:#ff8a80; } }
* { box-sizing: border-box; }
body { margin:0; font:15px/1.45 system-ui, sans-serif; background:var(--fundo); color:var(--texto); }
header { padding:12px 16px; border-bottom:1px solid var(--borda); display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
header h1 { font-size:18px; margin:0; flex:1; }
nav button { margin-right:6px; }
main { padding:16px; max-width:1100px; margin:0 auto; }
section { background:var(--cartao); border:1px solid var(--borda); border-radius:8px; padding:16px; margin-bottom:16px; }
h2 { font-size:16px; margin:0 0 12px; }
label { display:block; margin:8px 0 2px; color:var(--fraco); font-size:13px; }
input, select, textarea { width:100%; max-width:420px; padding:7px 8px; border:1px solid var(--borda); border-radius:6px; background:var(--cartao); color:var(--texto); font:inherit; }
button { padding:7px 12px; border:1px solid var(--borda); border-radius:6px; background:var(--cartao); color:var(--texto); font:inherit; cursor:pointer; }
button.principal { background:var(--azul); border-color:var(--azul); color:#fff; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--borda); vertical-align:top; }
th { color:var(--fraco); font-weight:600; }
.chave { font:600 18px/1.3 ui-monospace, monospace; letter-spacing:1px; }
.msg { padding:8px 10px; border-radius:6px; margin:8px 0; }
.erro { background:color-mix(in srgb, var(--vermelho) 14%, transparent); color:var(--vermelho); }
.ok { background:color-mix(in srgb, var(--verde) 14%, transparent); color:var(--verde); }
.estado-ativa, .estado-livre { color:var(--verde); } .estado-aviso, .estado-carencia { color:var(--amarelo); }
.estado-so_leitura, .estado-apagar, .estado-revogada, .estado-vencida { color:var(--vermelho); } .estado-usada { color:var(--fraco); }
.fraco { color:var(--fraco); font-size:13px; }
.oculto { display:none; }
.espaco { margin-top:20px; }
.rolar { overflow-x:auto; }
</style></head>
<body>
<header><h1>Licenças · painel de vendas</h1><span id="quem" class="fraco"></span>
<nav><button data-aba="nova">Nova chave</button><button data-aba="lista">Licenças e chaves</button><button data-aba="equipe" class="so-gerente oculto">Equipe</button></nav></header>
<main>
<div id="aviso"></div>
<section id="aba-nova">
  <h2>Nova chave</h2>
  <label for="plano">Plano</label><select id="plano"></select>
  <div class="so-gerente oculto">
    <label>Limites (deixe em branco para o padrão do plano)</label>
    <input id="lim-imoveis" type="number" min="1" placeholder="imóveis (padrão 20)">
    <input id="lim-inquilinos" type="number" min="1" placeholder="inquilinos com contrato ativo (padrão 20)">
    <input id="lim-usuarios" type="number" min="1" placeholder="usuários (padrão 4)">
    <input id="lim-cnpjs" type="number" min="1" placeholder="empresas/CNPJs (padrão 2)">
  </div>
  <label for="cliente">Cliente (opcional)</label><input id="cliente" maxlength="120">
  <label for="email">E-mail do cliente (opcional)</label><input id="email" type="email" maxlength="200">
  <label for="obs">Observação (ex.: pedido 1043)</label><input id="obs" maxlength="300">
  <p><button class="principal" id="gerar">Gerar</button></p>
  <div id="gerada" class="oculto"><p class="chave" id="chave-gerada"></p><p class="fraco" id="chave-info"></p>
  <button id="copiar">Copiar</button> <button id="mandar">Mandar por e-mail</button></div>
</section>
<section id="aba-lista" class="oculto">
  <h2>Licenças</h2>
  <label><input type="checkbox" id="vence60"> Só as que vencem nos próximos 60 dias</label>
  <div class="rolar"><table id="tab-licencas"></table></div>
  <h2 class="espaco">Chaves</h2>
  <div class="rolar"><table id="tab-chaves"></table></div>
</section>
<section id="aba-equipe" class="oculto">
  <h2>Equipe de vendas</h2>
  <div class="rolar"><table id="tab-equipe"></table></div>
  <h2 class="espaco">Cadastrar ou mudar vendedor</h2>
  <label for="v-email">E-mail</label><input id="v-email" type="email">
  <label for="v-nome">Nome</label><input id="v-nome">
  <label for="v-papel">Papel</label><select id="v-papel"><option value="vendedor">Vendedor</option><option value="gerente">Gerente</option></select>
  <label><input type="checkbox" id="v-ativo" checked> Ativo</label>
  <p><button class="principal" id="v-gravar">Gravar</button></p>
</section>
</main>
<script nonce="{{NONCE}}">
const $ = (id) => document.getElementById(id);
const ESTADOS = { ativa: 'Ativa', aviso: 'Vence logo', carencia: 'Carência', so_leitura: 'Só leitura', apagar: 'Apagar', revogada: 'Revogada', livre: 'Não usada', usada: 'Usada', vencida: 'Vencida sem uso' };
const dataBR = (d) => (d ? d.split('-').reverse().join('/') : 'sem vencimento');
let eu = null; let planos = {}; let ultima = null;

async function api(rota, corpo) {
  const op = corpo === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sistema': 'vendas' }, body: JSON.stringify(corpo) };
  const r = await fetch('/api/' + rota, op);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Erro ' + r.status);
  return d;
}
function avisar(texto, ok) { const a = $('aviso'); a.textContent = texto; a.className = 'msg ' + (ok ? 'ok' : 'erro'); if (!texto) a.className = ''; }
function el(tag, texto, classe) { const e = document.createElement(tag); if (texto !== undefined) e.textContent = texto; if (classe) e.className = classe; return e; }
function linha(tab, celulas, th) { const tr = el('tr'); for (const c of celulas) { const td = el(th ? 'th' : 'td'); if (c instanceof Node) td.append(c); else td.textContent = c ?? ''; tr.append(td); } tab.append(tr); }
function botao(texto, fn) { const b = el('button', texto); b.addEventListener('click', () => fn().catch((e) => avisar(e.message))); return b; }
function aba(nome) { for (const s of ['nova', 'lista', 'equipe']) $('aba-' + s).classList.toggle('oculto', s !== nome); avisar(''); if (nome === 'lista') lista(); if (nome === 'equipe') equipe(); }
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => aba(b.dataset.aba)));

$('gerar').addEventListener('click', async () => {
  try {
    const limites = {};
    for (const k of ['imoveis', 'inquilinos', 'usuarios', 'cnpjs']) { const v = $('lim-' + k).value; if (v) limites[k] = Number(v); }
    const pedido = { plano: $('plano').value, cliente: $('cliente').value, email: $('email').value, observacao: $('obs').value };
    if (Object.keys(limites).length) pedido.limites = limites;
    const { ficha } = await api('gerar', pedido);
    ultima = ficha;
    $('chave-gerada').textContent = ficha.chave;
    $('chave-info').textContent = ficha.nome_plano + ' · até ' + ficha.limites.imoveis + ' imóveis, ' + ficha.limites.inquilinos + ' inquilinos, ' + ficha.limites.usuarios + ' usuários, ' + ficha.limites.cnpjs + ' CNPJs · use até ' + dataBR(ficha.usar_ate);
    $('gerada').classList.remove('oculto');
    avisar('Chave gerada.', true);
  } catch (e) { avisar(e.message); }
});
$('copiar').addEventListener('click', () => ultima && navigator.clipboard.writeText(ultima.chave).then(() => avisar('Chave copiada.', true)));
$('mandar').addEventListener('click', () => ultima && reenviar(ultima.chave, ultima.email).catch((e) => avisar(e.message)));

async function reenviar(chave, para) {
  const destino = para || prompt('E-mail do cliente:');
  if (!destino) return;
  const m = await api('reenviar', { chave, para: destino });
  location.href = 'mailto:' + encodeURIComponent(m.para) + '?subject=' + encodeURIComponent(m.assunto) + '&body=' + encodeURIComponent(m.texto);
}

async function lista() {
  const d = await api('lista' + ($('vence60').checked ? '?filtro=vence60' : '')).catch((e) => { avisar(e.message); return null; });
  if (!d) return;
  const tl = $('tab-licencas'); tl.replaceChildren();
  linha(tl, ['Empresa', 'Plano', 'Vale até', 'Situação', ''], true);
  for (const x of d.licencas) {
    const acoes = el('span');
    if (eu.papel === 'gerente' && !x.ilimitada && !x.revogada) {
      acoes.append(botao('Cortesia', async () => { const dias = prompt('Quantos dias a mais?', '30'); if (!dias) return; const motivo = prompt('Motivo da cortesia:'); if (!motivo) return; await api('cortesia', { empresa: x.empresa, dias: Number(dias), motivo }); avisar('Cortesia dada.', true); lista(); }), ' ',
        botao('Revogar', async () => { const motivo = prompt('Motivo da revogação (a empresa fica só em leitura):'); if (!motivo) return; await api('revogar', { empresa: x.empresa, motivo }); avisar('Licença revogada.', true); lista(); }));
    }
    linha(tl, [x.nome + ' (' + x.empresa + ')', x.nome_plano, dataBR(x.ate), el('span', ESTADOS[x.situacao.estado] || x.situacao.estado, 'estado-' + x.situacao.estado), acoes]);
  }
  if (!d.licencas.length) linha(tl, ['Nenhuma licença.']);
  const tc = $('tab-chaves'); tc.replaceChildren();
  linha(tc, ['Chave', 'Plano', 'Cliente', 'Gerada', 'Vendedor', 'Situação', ''], true);
  for (const f of d.chaves) {
    const acoes = el('span');
    if (f.estado === 'livre') {
      acoes.append(botao('Mandar', () => reenviar(f.chave, f.email)));
      if (eu.papel === 'gerente') acoes.append(' ', botao('Revogar', async () => { const motivo = prompt('Motivo da revogação:'); if (!motivo) return; await api('revogar', { chave: f.chave, motivo }); avisar('Chave revogada.', true); lista(); }));
    }
    const sit = f.estado === 'usada' ? 'Usada por ' + f.empresa_nome + ' em ' + dataBR(f.usada_em) : ESTADOS[f.estado];
    linha(tc, [el('span', f.chave, 'chave'), f.nome_plano, f.cliente || f.email, dataBR(f.criada), f.vendedor, el('span', sit, 'estado-' + f.estado), acoes]);
  }
  if (!d.chaves.length) linha(tc, ['Nenhuma chave.']);
}
$('vence60').addEventListener('change', lista);

async function equipe() {
  const d = await api('equipe').catch((e) => { avisar(e.message); return null; });
  if (!d) return;
  const t = $('tab-equipe'); t.replaceChildren();
  linha(t, ['E-mail', 'Nome', 'Papel', 'Ativo'], true);
  for (const m of d.equipe) linha(t, [m.email, m.nome || '', m.papel + (m.fixo ? ' (fixo)' : ''), m.ativo ? 'sim' : 'não']);
}
$('v-gravar').addEventListener('click', async () => {
  try { await api('equipe', { email: $('v-email').value, nome: $('v-nome').value, papel: $('v-papel').value, ativo: $('v-ativo').checked }); avisar('Gravado.', true); equipe(); } catch (e) { avisar(e.message); }
});

(async () => {
  try {
    eu = await api('eu');
    planos = (await api('planos')).planos;
    $('quem').textContent = eu.email + ' · ' + eu.papel;
    for (const p of eu.planos) { const o = el('option', planos[p].nome); o.value = p; $('plano').append(o); }
    if (eu.papel === 'gerente') document.querySelectorAll('.so-gerente').forEach((e) => e.classList.remove('oculto'));
  } catch (e) { avisar(e.message); document.querySelectorAll('nav button, #gerar').forEach((b) => { b.disabled = true; }); }
})();
</script>
</body></html>`;
