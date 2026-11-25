// Kit de teste automático: sobe o site, a nuvem local e a versão PC em portas livres, põe o banco fictício com os casos
// montados (tests/kit/banco.mjs), abre as telas dos roteiros (tests/kit/roteiros/*.mjs) no computador, no celular, na nuvem
// (duas abas) e na versão PC, confere erros, valores e a largura, percorre os links e diz "passou" ou onde falhou.
// Uso: node tools/kit-teste.mjs [--lugares computador,celular,nuvem,pc] [--rapido] [--telas <filtro>] [--manter]
//      [--links <páginas>] [--sem-links] [--limite <minutos>] [--textos]   (detalhes em tools/kit-teste/README.md)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { carregarPlaywright, escolherNavegador } from './kit-teste/navegador.mjs';
import { abrirNuvem, aoFechar, fecharTudo, fecharTudoJa, gerarVersaoPc, pararPid, rodarTesteNode, servirSite } from './kit-teste/servidores.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_ROTEIROS = path.join(RAIZ, 'tests', 'kit', 'roteiros');
const LUGARES = { computador: 'Computador', celular: 'Celular', nuvem: 'Nuvem', pc: 'Versão PC' };
const PASSO_MS = 30000;

// ------------------------------------------------------------------ opções
const args = process.argv.slice(2);
const opcao = (nome) => { const i = args.indexOf(nome); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
if (args.includes('--ajuda') || args.includes('-h')) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 6).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const rapido = args.includes('--rapido');
const lugares = String(opcao('--lugares') || (rapido ? 'computador,celular' : 'computador,celular,nuvem,pc')).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
for (const l of lugares) if (!LUGARES[l]) { console.error(`Lugar desconhecido: ${l} (use ${Object.keys(LUGARES).join(', ')})`); process.exit(2); }
const filtroTelas = opcao('--telas');
const manter = args.includes('--manter');
const guardarTextos = args.includes('--textos');
const semLinks = args.includes('--sem-links') || !!filtroTelas;
const limiteLinks = Number(opcao('--links')) || (rapido ? 60 : 150);
const limiteTotalMin = Number(opcao('--limite')) || 15;

const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nomeArquivo = (s) => semAcento(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const limpo = (s) => String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const tempo = (ms) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };

const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-teste-'));
const CAPTURAS = path.join(TEMP, 'capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });
const inicio = Date.now();

/**
 * Erros do console já conhecidos (não são falha). Cada um com o porquê. Acrescente só o que for de propósito e explique.
 * ``url``: endereço do recurso (para "Failed to load resource", que não traz o endereço no texto).
 */
const CONHECIDOS = [
  { url: /\/api\/email\/estado/, porque: 'sem a nuvem, o site pergunta pelo Gmail e recebe 404' },
  { url: /\/api\//, lugares: ['computador', 'celular', 'pc'], porque: 'fora da nuvem as rotas /api/ não existem (404)' },
  { texto: /ERR_INTERNET_DISCONNECTED/, url: /^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, porque: 'o kit corta a internet (Banco Central, CEP): os valores não podem depender dela' },
  { url: /\/offline\/index\.html/, lugares: ['pc'], porque: 'Sistema confere a data do index.html ao lado do programa; a versão PC não tem site ao lado' },
  { url: /favicon|\/icones\/|\/api\/icone/, porque: 'ícone da aba' },
  { texto: /setting 'hidden'/, porque: '2ª via (anotado em PENDENCIAS_DO_DONO, "pequenas observações")' },
];
const conhecido = (lugar, e) => CONHECIDOS.some((k) => (!k.lugares || k.lugares.includes(lugar)) && (k.texto ? k.texto.test(e.texto) : true) && (k.url ? k.url.test(e.url || '') : true) && (k.texto || k.url));

// ------------------------------------------------------------------ fim de tudo (só o que o kit abriu)
let saindo = false;
async function sair(codigo, motivo) {
  if (saindo) return;
  saindo = true;
  if (motivo) console.log(motivo);
  await fecharTudo();
  process.exit(codigo);
}
process.on('SIGINT', () => sair(1, '\nInterrompido (Ctrl+C): fechando o que o kit abriu.'));
process.on('SIGTERM', () => sair(1, 'Encerrado: fechando o que o kit abriu.'));
process.on('exit', () => fecharTudoJa());
process.on('uncaughtException', (e) => sair(1, `Erro do kit: ${e.stack || e.message}`));
process.on('unhandledRejection', (e) => sair(1, `Erro do kit: ${e?.stack || e}`));
const limiteTotal = setTimeout(() => sair(1, `Falhou: o kit passou do limite total de ${limiteTotalMin} min.`), limiteTotalMin * 60000);
if (manter) clearTimeout(limiteTotal);

/** Roda ``fn`` com limite (padrão 30 s por passo). */
async function comLimite(nome, fn, ms = PASSO_MS) {
  let t;
  try {
    return await Promise.race([fn(), new Promise((_, r) => { t = setTimeout(() => r(new Error(`passou do limite de ${ms / 1000} s (${nome})`)), ms); })]);
  } finally { clearTimeout(t); }
}

// ------------------------------------------------------------------ roteiros
async function carregarRoteiros() {
  const arquivos = fs.readdirSync(PASTA_ROTEIROS).filter((n) => n.endsWith('.mjs')).sort();
  const lista = [];
  for (const a of arquivos) {
    const m = await import(pathToFileURL(path.join(PASTA_ROTEIROS, a)).href);
    for (const r of [].concat(m.default || [])) lista.push({ arquivo: a, ...r });
  }
  if (!filtroTelas) return lista;
  const f = semAcento(filtroTelas);
  return lista.filter((r) => semAcento(r.nome).includes(f) || semAcento(r.arquivo).includes(f));
}

// ------------------------------------------------------------------ no navegador
/** Antes de qualquer script da página: links imoveis-…: (chamam o programa instalado do dono) e impressão nunca disparam. */
function bloqueios() {
  window.__kitLinks = [];
  const ehPrograma = (h) => /^imoveis-[a-z-]*:/i.test(String(h || ''));
  const clique = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function kitClique() {
    if (ehPrograma(this.getAttribute('href'))) { window.__kitLinks.push(this.getAttribute('href')); return; }
    return clique.call(this);
  };
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && ehPrograma(a.getAttribute('href'))) { e.preventDefault(); e.stopImmediatePropagation(); window.__kitLinks.push(a.getAttribute('href')); }
  }, true);
  const abrir = window.open;
  window.open = function kitAbrir(u, ...r) { if (ehPrograma(u)) { window.__kitLinks.push(String(u)); return null; } return abrir.call(window, u, ...r); };
  const atribuir = Location.prototype.assign;
  Location.prototype.assign = function kitAtribuir(u) { if (ehPrograma(u)) { window.__kitLinks.push(String(u)); return; } return atribuir.call(this, u); };
  window.print = () => { window.__kitImpressoes = (window.__kitImpressoes || 0) + 1; };
}

/** Espera a tela nova: a sentinela posta antes some quando o sistema troca o #app, e o conteúdo para de mudar. */
async function esperarDesenho(pagina, ms = 20000) {
  const fim = Date.now() + ms;
  for (;;) {
    const ok = await pagina.evaluate(() => !document.getElementById('kit-sentinela') && !!document.querySelector('#app main, #app .login, #app h1')).catch(() => false);
    if (ok) break;
    if (Date.now() > fim) throw new Error(`a tela não terminou de abrir em ${ms / 1000} s`);
    await new Promise((r) => setTimeout(r, 100));
  }
  let ultimo = '';
  let iguais = 0;
  while (Date.now() < fim && iguais < 3) {
    const marca = await pagina.evaluate(() => `${document.getElementById('app')?.innerHTML.length}:${document.title}`).catch(() => '');
    if (marca === ultimo) iguais += 1; else { iguais = 0; ultimo = marca; }
    await new Promise((r) => setTimeout(r, 120));
  }
}

/** Vai para uma rota (#/…) sem recarregar a página; formulário alterado não segura a troca. */
async function irPara(pagina, rota) {
  await pagina.evaluate((h) => {
    for (const f of document.querySelectorAll('[data-alterado]')) delete f.dataset.alterado;
    document.querySelector('.janela-fundo, dialog[open]')?.remove?.();
    const app = document.getElementById('app');
    if (app) { const s = document.createElement('i'); s.id = 'kit-sentinela'; app.appendChild(s); }
    if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = h;
  }, rota);
  await esperarDesenho(pagina);
}

/** Texto da tela: o sistema (#app) e as janelas abertas por cima (avisos de erro, perguntas). */
const textoDaTela = (pagina) => pagina.evaluate(() => [document.getElementById('app') || document.body, ...document.querySelectorAll('dialog[open]')].map((el) => el.innerText).join(' ')).then(limpo);

/**
 * O que a tela mostra no lugar do esperado: o trecho que começa como ele (ex.: esperado "Se for pago hoje (25/11/2026):
 * R$ 2.049,90" → "Se for pago hoje (25/11/2026): R$ 2.050,56 …"); sem nada parecido, o começo da tela (sem o menu).
 */
async function trechoParecido(pagina, texto, esperado) {
  const palavras = limpo(esperado instanceof RegExp ? esperado.source.replace(/\\/g, '') : esperado).split(' ');
  for (let n = palavras.length - 1; n >= 1; n -= 1) {
    const prefixo = palavras.slice(0, n).join(' ');
    if (prefixo.length < 6) break;
    const i = texto.indexOf(prefixo);
    if (i >= 0) return `na tela: "${texto.slice(i, i + Math.max(prefixo.length + 60, 120))}…"`;
  }
  const principal = await pagina.evaluate(() => (document.querySelector('#app main') || document.body).innerText).then(limpo).catch(() => texto);
  return `a tela mostra: ${principal.slice(0, 220)}`;
}

/** O que há de errado na tela aberta: erro de programa, "não encontrado", tela de login. */
async function problemaDaTela(pagina) {
  return pagina.evaluate(() => {
    const main = document.querySelector('#app main');
    const h1 = (main?.querySelector('h1')?.textContent || '').trim();
    const erro = main && main.firstElementChild && main.firstElementChild.matches('.alerta.erro') && main.querySelector('a[href="#/"].botao') && !h1;
    if (erro) return `erro na tela: ${main.firstElementChild.textContent.trim().slice(0, 200)}`;
    if (/não encontrad/i.test(h1)) return `"${h1}"`;
    if (document.querySelector('form[data-form="login"]')) return 'voltou para a tela de login';
    return null;
  });
}

/** Algo saindo pela lateral (celular): a página mais larga que a tela e o primeiro elemento que passa. */
async function saiPelaLateral(pagina) {
  return pagina.evaluate(() => {
    const larg = window.innerWidth;
    const total = document.documentElement.scrollWidth;
    if (total <= larg + 1) return null;
    let quem = '';
    for (const el of document.querySelectorAll('#app *')) {
      const r = el.getBoundingClientRect();
      if (r.right > larg + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') {
        quem = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''} "${(el.textContent || '').trim().slice(0, 50)}"`;
        break;
      }
    }
    return `a página tem ${total} px numa tela de ${larg} px${quem ? `; passa: ${quem}` : ''}`;
  });
}

/** Página nova com os ouvintes de erro (console, erro de página, janela nativa). */
async function novaPagina(ctx, lugar, registro) {
  const pagina = await ctx.newPage();
  pagina.setDefaultTimeout(PASSO_MS);
  pagina.on('console', (m) => { if (m.type() === 'error') registro.push({ tipo: 'console', texto: m.text().slice(0, 400), url: m.location()?.url || '' }); });
  pagina.on('pageerror', (e) => registro.push({ tipo: 'erro de página', texto: String(e.message || e).slice(0, 400) }));
  pagina.on('dialog', (dl) => { registro.push({ tipo: 'janela nativa', texto: dl.message().slice(0, 200), aviso: true }); dl.accept().catch(() => {}); });
  return pagina;
}

/** Contexto (um "aparelho"): relógio parado no dia do teste, fuso de Brasília, sem service worker, bloqueios antes da página. */
async function novoContexto(navegador, lugar, kit) {
  const celular = lugar === 'celular';
  const ctx = await navegador.newContext({
    ...(celular ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } }),
    serviceWorkers: 'block', timezoneId: kit.FUSO, locale: 'pt-BR', acceptDownloads: false,
  });
  ctx.setDefaultTimeout(PASSO_MS);
  await ctx.clock.install({ time: new Date(kit.INSTANTE) });
  // nada sai para a internet (Banco Central, CEP, Google): o resultado não pode depender da rede nem do dia de lá
  await ctx.route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (rota) => rota.abort('internetdisconnected'));
  await ctx.addInitScript(bloqueios);
  return ctx;
}

/** Põe o banco do kit na pasta interna do navegador (?teste), pela página em branco do mesmo endereço. */
async function porBancoNaPastaInterna(pagina, origem, json) {
  await pagina.goto(`${origem}/__kit/vazio`);
  await pagina.evaluate(async (texto) => {
    const raiz = await navigator.storage.getDirectory();
    try { await raiz.removeEntry('teste-imoveis', { recursive: true }); } catch { /* ainda não existia */ }
    const dir = await raiz.getDirectoryHandle('teste-imoveis', { create: true });
    const w = await (await dir.getFileHandle('imoveis-dados.json', { create: true })).createWritable();
    await w.write(texto);
    await w.close();
  }, json);
}

/** Abre o sistema e entra com o login do kit. */
async function entrar(pagina, endereco, kit) {
  await pagina.goto(endereco);
  await pagina.waitForSelector('form[data-form="login"], #app nav, #app main', { timeout: PASSO_MS });
  if (!(await pagina.$('form[data-form="login"]'))) await pagina.waitForSelector('form[data-form="login"], #app nav', { timeout: PASSO_MS });
  if (await pagina.$('form[data-form="login"]')) {
    await pagina.fill('#ent_login', kit.LOGIN);
    await pagina.fill('#ent_senha', kit.SENHA);
    await pagina.click('form[data-form="login"] button:not([data-acao])');
  }
  await pagina.waitForFunction(() => !document.querySelector('form[data-form="login"]') && document.querySelector('#app nav'), null, { timeout: PASSO_MS, polling: 200 });
  await esperarDesenho(pagina);
}

// ------------------------------------------------------------------ um lugar
/**
 * Roda os roteiros num lugar. Devolve { lugar, telas, falhas: [{ tela, rota, esperado, apareceu, captura }], extras }.
 */
async function rodarLugar(lugar, { navegador, kit, roteiros, site, nuvem, pc }) {
  const falhas = [];
  const registro = [];
  const ctx = await novoContexto(navegador, lugar, kit);
  if (!manter) aoFechar(() => ctx.close());
  const pagina = await novaPagina(ctx, lugar, registro);
  const origem = lugar === 'nuvem' ? nuvem.origem : `http://localhost:${site.porta}`;
  const endereco = lugar === 'nuvem' ? `${origem}/` : lugar === 'pc' ? `${origem}/offline/administracao-imoveis.html?teste` : `${origem}/?teste`;
  const capturar = async (nome) => {
    const arq = path.join(CAPTURAS, `${lugar}-${nomeArquivo(nome)}.png`);
    await pagina.screenshot({ path: arq }).catch(() => {});
    return arq;
  };
  const falhar = async (tela, rota, esperado, apareceu) => falhas.push({ tela, rota, esperado, apareceu: limpo(apareceu).slice(0, 300), captura: await capturar(tela) });
  try {
    await comLimite(`${LUGARES[lugar]}: entrar`, async () => {
      if (lugar !== 'nuvem') await porBancoNaPastaInterna(pagina, origem, kit.json);
      await entrar(pagina, endereco, kit);
    }, 60000);
  } catch (e) {
    await falhar('Entrar no sistema', '', 'abrir o sistema e entrar com o login do kit', e.message);
    return { lugar, telas: 0, falhas, pagina, ctx };
  }
  const ferramentas = criarFerramentas(pagina, lugar, kit);
  let telas = 0;
  for (const r of roteiros) {
    if (r.lugares && !r.lugares.includes(lugar)) continue;
    const rota = typeof r.rota === 'function' ? r.rota(kit) : r.rota;
    const antes = registro.length;
    telas += 1;
    try {
      await comLimite(r.nome, async () => {
        if (rota) await irPara(pagina, rota);
        const problema = await problemaDaTela(pagina);
        if (problema) throw Object.assign(new Error(problema), { esperado: 'a tela abrir sem erro' });
        if (r.acoes) await r.acoes(ferramentas);
        const texto = await textoDaTela(pagina);
        if (guardarTextos) fs.writeFileSync(path.join(TEMP, `texto-${lugar}-${nomeArquivo(r.nome)}.txt`), texto);
        for (const e of [].concat(r.espera || [])) {
          const ok = e instanceof RegExp ? e.test(texto) : texto.includes(limpo(e));
          if (!ok) throw Object.assign(new Error(`não está na tela; ${await trechoParecido(pagina, texto, e)}`), { esperado: `"${e}"` });
        }
        for (const e of [].concat(r.naoEspera || [])) {
          const ok = e instanceof RegExp ? !e.test(texto) : !texto.includes(limpo(e));
          if (!ok) throw Object.assign(new Error('apareceu na tela'), { esperado: `sem "${e}"` });
        }
      }, r.limite || PASSO_MS);
    } catch (e) {
      await falhar(r.nome, rota, e.esperado || 'a tela abrir e as conferências passarem', e.message);
    }
    if (lugar === 'celular') {
      const lado = await saiPelaLateral(pagina).catch(() => null);
      if (lado) await falhar(r.nome, rota, 'nada saindo pela lateral (375 px)', lado);
    }
    const novos = registro.slice(antes).filter((x) => !x.aviso && !conhecido(lugar, x));
    if (novos.length) await falhar(r.nome, rota, 'sem erro no console', novos.map((x) => `${x.tipo}: ${x.texto}${x.url ? ` (${x.url})` : ''}`).join(' | '));
  }
  const links = await pagina.evaluate(() => window.__kitLinks || []).catch(() => []);
  return { lugar, telas, falhas, pagina, ctx, registro, links };
}

/** Ferramentas que o roteiro recebe em ``acoes(t)`` (ver tools/kit-teste/README.md). */
function criarFerramentas(pagina, lugar, kit) {
  return {
    pagina, lugar, kit, ids: kit.ids,
    abrir: (rota) => irPara(pagina, rota),
    texto: () => textoDaTela(pagina),
    esperarDesenho: () => esperarDesenho(pagina),
    async clicar(alvo) { await (/^(text=|[#.[]|(button|a|input|select|textarea|dialog|form|label|summary|details|main|tr|td)\b)/.test(alvo) ? pagina.locator(alvo).first() : pagina.getByText(alvo, { exact: false }).first()).click(); await esperarDesenho(pagina); },
    async preencher(seletor, valor) { await pagina.fill(seletor, String(valor)); },
    async esperarTexto(t, ms = 10000) {
      const fim = Date.now() + ms;
      while (!(await textoDaTela(pagina)).includes(limpo(t))) {
        if (Date.now() > fim) throw Object.assign(new Error(`não apareceu em ${ms / 1000} s; a tela mostra: ${(await textoDaTela(pagina)).slice(0, 220)}`), { esperado: `"${t}"` });
        await new Promise((r) => setTimeout(r, 200));
      }
    },
    /** Confere uma condição: falha com o esperado e o que apareceu. */
    conferir(ok, esperado, apareceu) { if (!ok) throw Object.assign(new Error(String(apareceu)), { esperado }); },
    /** Roda ``fn(A, arg)`` na página com A = docs/js/app.js (E, R, C, alterar…). Não existe na versão PC (programa num arquivo só). */
    app(fn, arg) {
      if (lugar === 'pc') throw new Error('t.app não existe na versão PC: ponha lugares sem "pc" no roteiro');
      return pagina.evaluate(async ([codigo, a]) => { const A = await import('/js/app.js'); return (0, eval)(`(${codigo})`)(A, a); }, [fn.toString(), arg]);
    },
  };
}

// ------------------------------------------------------------------ nuvem: duas abas
async function duasAbas(navegador, kit, nuvem, abaA) {
  const falhas = [];
  const registro = [];
  const ctx = await novoContexto(navegador, 'nuvem', kit);
  if (!manter) aoFechar(() => ctx.close());
  const abaB = await novaPagina(ctx, 'nuvem', registro);
  const falhar = async (tela, esperado, apareceu, pg = abaB) => {
    const arq = path.join(CAPTURAS, `nuvem-${nomeArquivo(tela)}.png`);
    await pg.screenshot({ path: arq }).catch(() => {});
    falhas.push({ tela, rota: '', esperado, apareceu: limpo(apareceu).slice(0, 300), captura: arq });
  };
  const telefone = '(41) 98888-7766';
  try {
    await comLimite('Nuvem: entrar na aba B', () => entrar(abaB, `${nuvem.origem}/`, kit), 60000);
    await comLimite('Nuvem: mudança na aba A', () => abaA.evaluate(async ([id, tel]) => {
      const A = await import('/js/app.js');
      await A.alterar((db) => A.R.atualizar(db, 'contratos', id, { inquilino_telefone: tel }, A.login(), 'Kit: telefone mudado na aba A'));
    }, [kit.ids.bruno, telefone]));
    const chegou = await comLimite('Nuvem: aba B recebe', async () => {
      for (let i = 0; i < 40; i += 1) {
        const v = await abaB.evaluate(async (id) => { window.dispatchEvent(new Event('focus')); const A = await import('/js/app.js'); return A.E.d.contratos.find((c) => c.id === id)?.inquilino_telefone; }, kit.ids.bruno);
        if (v === telefone) return true;
        await new Promise((r) => setTimeout(r, 500));
      }
      return false;
    }, 30000).catch(() => false);
    if (!chegou) await falhar('Nuvem: mudança da aba A chega na aba B', `telefone ${telefone} no contrato de Bruno na aba B`, 'não chegou em 20 s');
    else {
      await irPara(abaB, `#/contrato/${kit.ids.bruno}`);
      const t = await textoDaTela(abaB);
      if (!t.includes(telefone)) await falhar('Nuvem: mudança da aba A na tela da aba B', `"${telefone}" na página do inquilino`, t.slice(0, 220));
    }
    for (const [nome, pg] of [['A', abaA], ['B', abaB]]) {
      await irPara(pg, '#/conflitos');
      const c = await pg.evaluate(async () => { const A = await import('/js/app.js'); return { conflitos: A.E.nuvem.conflitos.length, recusas: A.E.nuvem.recusas.length, tabela: !!document.querySelector('#app main table') }; });
      if (c.conflitos || c.recusas || c.tabela) await falhar(`Nuvem: conflitos na aba ${nome}`, '#/conflitos vazio', `${c.conflitos} conflito(s), ${c.recusas} recusa(s)`, pg);
    }
  } catch (e) {
    await falhar('Nuvem: duas abas', 'as duas abas sincronizadas', e.message);
  }
  const novos = registro.filter((x) => !x.aviso && !conhecido('nuvem', x));
  if (novos.length) await falhar('Nuvem: aba B', 'sem erro no console', novos.map((x) => `${x.tipo}: ${x.texto}`).join(' | '));
  return falhas;
}

// ------------------------------------------------------------------ links
async function capturarLink(pagina, rota) {
  const arq = path.join(CAPTURAS, `links-${nomeArquivo(rota)}.png`);
  await pagina.screenshot({ path: arq }).catch(() => {});
  return arq;
}
/** Percorre os links internos (#/…) a partir das telas dos roteiros, até ``limite`` páginas. */
async function percorrerLinks(pagina, lugar, inicio, limite, registro) {
  const falhas = [];
  const vistos = new Set();
  const fila = [...new Set(inicio)];
  const PULAR = /^#\/(teste-pdfs|restaurar-backup|sair|imprimir)/; // páginas que geram arquivos ou saem do sistema
  let paginas = 0;
  while (fila.length && paginas < limite) {
    const rota = fila.shift();
    const chave = rota.replace(/([?&])ir=[^&]*/, '$1').replace(/[?&]$/, '');
    if (vistos.has(chave) || PULAR.test(rota)) continue;
    vistos.add(chave);
    paginas += 1;
    const antes = registro.length;
    try {
      await comLimite(`link ${rota}`, () => irPara(pagina, rota));
      const p = await problemaDaTela(pagina);
      if (p) falhas.push({ tela: `Link ${rota}`, rota, esperado: 'a página abrir', apareceu: p, captura: await capturarLink(pagina, rota) });
      const novos = await pagina.evaluate(() => [...document.querySelectorAll('#app a[href^="#/"]')].map((a) => a.getAttribute('href')));
      for (const h of novos) if (!vistos.has(h)) fila.push(h);
    } catch (e) {
      falhas.push({ tela: `Link ${rota}`, rota, esperado: 'a página abrir', apareceu: e.message, captura: await capturarLink(pagina, rota) });
    }
    const erros = registro.slice(antes).filter((x) => !x.aviso && !conhecido(lugar, x));
    if (erros.length) falhas.push({ tela: `Link ${rota}`, rota, esperado: 'sem erro no console', apareceu: erros.map((x) => `${x.tipo}: ${x.texto}`).join(' | ').slice(0, 300), captura: await capturarLink(pagina, rota) });
  }
  return { paginas, falhas };
}

// ------------------------------------------------------------------ principal
function descricaoDoCodigo() {
  try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() + ' ' + execSync('git rev-parse --short HEAD', { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return path.basename(RAIZ); }
}

async function principal() {
  console.log(`Kit de teste: ${descricaoDoCodigo()} · lugares: ${lugares.map((l) => LUGARES[l]).join(', ')}${filtroTelas ? ` · telas com "${filtroTelas}"` : ''}`);
  const K = await import(pathToFileURL(path.join(RAIZ, 'tests', 'kit', 'banco.mjs')).href);
  const { banco, ids } = await K.montarBanco();
  const kit = { ...K, ids, json: JSON.stringify(banco) };
  const roteiros = await carregarRoteiros();
  if (!roteiros.length) return sair(1, `Nenhum roteiro com "${filtroTelas}".`);

  const testeLinks = semLinks ? null : rodarTesteNode(RAIZ, path.join('tests', 'links-parametros.test.mjs'));
  const versaoPc = lugares.includes('pc') ? gerarVersaoPc(RAIZ, path.join(TEMP, 'versao-pc')).catch((e) => e) : null;
  const nuvem = lugares.includes('nuvem') ? await abrirNuvem(RAIZ, path.join(TEMP, 'nuvem'), banco, K.LOGIN).catch((e) => e) : null;
  const site = await servirSite(path.join(RAIZ, 'docs'));
  const pc = versaoPc ? await versaoPc : null;
  if (pc && !(pc instanceof Error)) site.extras['/offline/administracao-imoveis.html'] = pc;

  const { pw, versao } = await carregarPlaywright();
  const escolha = escolherNavegador();
  const navegador = await pw.chromium.launch({ headless: !manter, ...(escolha.channel ? { channel: escolha.channel } : {}), ...(escolha.executablePath ? { executablePath: escolha.executablePath } : {}) });
  const pidNavegador = navegador.process?.()?.pid;
  if (!manter) aoFechar(async () => { await navegador.close().catch(() => {}); pararPid(pidNavegador); });
  console.log(`Navegador: ${escolha.nome} (Playwright ${versao}) · ${roteiros.length} roteiro(s) · arquivos em ${TEMP}`);

  const resultados = [];
  for (const lugar of lugares) {
    const t0 = Date.now();
    let r;
    if (lugar === 'nuvem' && nuvem instanceof Error) r = { lugar, telas: 0, falhas: [{ tela: 'Nuvem local', esperado: 'a nuvem local abrir', apareceu: nuvem.message, captura: '' }] };
    else if (lugar === 'pc' && pc instanceof Error) r = { lugar, telas: 0, falhas: [{ tela: 'Versão PC', esperado: 'a versão PC ser gerada', apareceu: pc.message, captura: '' }] };
    else {
      r = await rodarLugar(lugar, { navegador, kit, roteiros, site, nuvem, pc });
      if (lugar === 'nuvem' && r.pagina) r.falhas.push(...await duasAbas(navegador, kit, nuvem, r.pagina));
      if (lugar === 'computador' && !semLinks && r.pagina) {
        const inicioLinks = roteiros.map((x) => (typeof x.rota === 'function' ? x.rota(kit) : x.rota)).filter((x) => x && x.startsWith('#/'));
        const l = await percorrerLinks(r.pagina, lugar, ['#/', ...inicioLinks], limiteLinks, r.registro);
        r.links = l;
      }
      if (r.links && Array.isArray(r.links) && r.links.length) r.programa = r.links;
    }
    r.tempo = Date.now() - t0;
    resultados.push(r);
    console.log(linhaDoLugar(r));
  }

  // links
  let falhouLinks = false;
  const comp = resultados.find((r) => r.lugar === 'computador');
  if (!semLinks) {
    const teste = await testeLinks;
    const l = comp?.links && !Array.isArray(comp.links) ? comp.links : { paginas: 0, falhas: [] };
    if (!teste.ok) l.falhas.push({ tela: 'tests/links-parametros.test.mjs', esperado: 'o teste dos links fixos passar', apareceu: teste.texto.split('\n').filter((x) => /not ok|Error|esperado|expected/i.test(x)).slice(0, 4).join(' | '), captura: '' });
    falhouLinks = l.falhas.length > 0;
    console.log(`Links: ${falhouLinks ? `falhou (${l.falhas.length})` : 'passou'} (${l.paginas} páginas percorridas no computador; teste dos parâmetros ${teste.ok ? 'ok' : 'falhou'})`);
    for (const f of l.falhas) console.log(linhaDaFalha(f));
  }
  const totalFalhas = resultados.reduce((s, r) => s + r.falhas.length, 0) + (falhouLinks ? 1 : 0);
  for (const r of resultados) if (r.programa?.length) console.log(`  (${LUGARES[r.lugar]}: ${r.programa.length} link(s) do programa do PC barrado(s): ${[...new Set(r.programa)].join(', ')})`);
  console.log(`Tempo total: ${tempo(Date.now() - inicio)} · ${totalFalhas ? 'FALHOU' : 'PASSOU'}`);
  if (manter) {
    console.log(`\n--manter: tudo continua aberto. Site: http://localhost:${site.porta}/?teste${nuvem && !(nuvem instanceof Error) ? ` · Nuvem: ${nuvem.origem}/` : ''}${pc && !(pc instanceof Error) ? ` · Versão PC: http://localhost:${site.porta}/offline/administracao-imoveis.html?teste` : ''}`);
    console.log(`Login: ${K.LOGIN} · senha: a de tests/kit/banco.mjs (SENHA). Ctrl+C fecha tudo.`);
    return;
  }
  return sair(totalFalhas ? 1 : 0);
}

function linhaDoLugar(r) {
  const nome = LUGARES[r.lugar];
  const extra = r.lugar === 'nuvem' ? ', 2 abas' : '';
  if (!r.falhas.length) return `${nome}: passou (${r.telas} telas${extra}, ${tempo(r.tempo)})`;
  return `${nome}: falhou em ${r.falhas.length} (${r.telas} telas${extra}, ${tempo(r.tempo)})\n${r.falhas.map(linhaDaFalha).join('\n')}`;
}
function linhaDaFalha(f) {
  return `  - ${f.tela}${f.rota ? ` (${f.rota})` : ''}: esperado ${f.esperado}; apareceu: ${f.apareceu}${f.captura ? `\n    captura: ${f.captura}` : ''}`;
}

principal().catch((e) => sair(1, `Falhou: ${e.stack || e.message}`));
