// Ordem das caixas de cada página: o administrador arrasta pelo ícone ☰ e todos passam a ver a nova ordem.
// Caixa = cada .cartao (ou [data-caixa]) que tem pelo menos uma irmã; dentro de uma caixa, cada parte com título
// (h3, ou h2 quando há mais de um) vira um "setor" que também muda de lugar.
// A ordem é guardada pelo nome de cada caixa (data-caixa, id ou o título sem números, datas e o que está entre parênteses), por página.
import { ordenarCaixas } from './regras.js';

/** Páginas que não mudam: formulários e documentos (o PDF e a impressão seguem a ordem do documento). */
const FORA = new Set(['imprimir', 'novo', 'editar', 'contrato-gerar', 'aditivo', 'vistoria', 'modelo-vistoria', 'modelo-contrato',
  'modelos-contrato', 'minha-senha', 'alertas-config', 'restaurar-backup', 'backup-seguro']);
const CAIXA = '.cartao, [data-caixa], .setor-movel';
const MESES = /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\/\d{4}/gi;

/** Nome que identifica a caixa: igual em todas as fichas do mesmo tipo (ex.: "Contrato e valores"). */
export function limparTitulo(texto) {
  return String(texto || '').split(/ · |: /)[0].replace(/\([^)]*\)/g, ' ').replace(MESES, ' ').replace(/R\$/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/ (de|do|da|em|a)$/, '').slice(0, 60);
}

function nomeDaCaixa(el) {
  if (el.dataset.caixa) return el.dataset.caixa;
  if (el.classList.contains('caixa-historico')) return 'Histórico';
  const titulo = el.matches('details') ? el.querySelector(':scope > summary') : el.querySelector('h2, h3');
  // o id vem antes do título: o título pode trazer o nome do imóvel ou o tipo de garantia (ex.: #garantia, #seguros)
  const opcoes = [el.id && `#${el.id}`, titulo && titulo.textContent, el.getAttribute('href'),
    (el.querySelector('.rotulo') || {}).textContent, el.textContent];
  for (const o of opcoes) {
    const t = o && (o.startsWith('#') ? o : limparTitulo(o));
    if (t) return t;
  }
  return '';
}

/** Junta cada título de seção (e o que vem até o próximo título) numa caixa interna, para poder mudar de lugar. */
function separarSetores(raiz) {
  for (const cx of raiz.querySelectorAll('.cartao')) {
    if (cx.matches('form') || cx.closest('form')) continue;
    for (const tag of ['H3', 'H2']) {
      const titulos = [...cx.children].filter((el) => el.tagName === tag);
      if (titulos.length < 2) continue;
      for (const t of titulos) {
        const setor = document.createElement('div');
        setor.className = 'setor-movel';
        t.before(setor);
        setor.append(t);
        for (let n = setor.nextSibling; n && n.nodeName !== tag;) { const prox = n.nextSibling; setor.append(n); n = prox; }
      }
      break;
    }
  }
}

/** Grupos de caixas irmãs: { nome, pai, itens: [{ el, nome }] }. O nome diz em que parte da página o grupo está. */
function gruposDe(raiz) {
  const porPai = new Map();
  for (const el of raiz.querySelectorAll(CAIXA)) {
    const pai = el.parentElement;
    if (!pai || pai.closest('form, table') || el.classList.contains('login')) continue;
    if (!porPai.has(pai)) porPai.set(pai, []);
    porPai.get(pai).push(el);
  }
  const grupos = [];
  for (const [pai, els] of porPai) {
    if (els.length < 2) continue;
    const caminho = [];
    for (let a = pai; a && a !== raiz; a = a.parentElement) {
      if (a.matches(CAIXA)) caminho.unshift(nomeDaCaixa(a));
      else if (a === pai) caminho.unshift(a.id || a.classList[0] || a.tagName.toLowerCase());
    }
    const usados = {};
    const itens = els.map((el) => {
      let nome = nomeDaCaixa(el);
      if (nome) { usados[nome] = (usados[nome] || 0) + 1; if (usados[nome] > 1) nome = `${nome} ${usados[nome]}`; }
      return { el, nome };
    }).filter((x) => x.nome);
    if (itens.length >= 2) grupos.push({ nome: caminho.join(' > '), pai, itens });
  }
  return grupos;
}

/** Põe as caixas do grupo na ordem guardada, nos lugares que elas ocupavam (avisos entre elas ficam onde estão). */
function aplicarOrdem(g, guardada) {
  const ordem = ordenarCaixas(g.itens.map((x) => x.nome), guardada);
  if (ordem.every((n, k) => n === g.itens[k].nome)) return;
  const marcas = g.itens.map((x) => { const m = document.createComment(''); x.el.replaceWith(m); return m; });
  ordem.forEach((n, k) => marcas[k].replaceWith(g.itens.find((x) => x.nome === n).el));
}

/** Caixa sendo arrastada: { g, el, antes, x, y, quadro, salvar }. */
let arrastando = null;

const nomesNaTela = (g) => [...g.pai.children].map((el) => (g.itens.find((x) => x.el === el) || {}).nome).filter(Boolean);

/** Põe a caixa arrastada antes ou depois da caixa do mesmo grupo que está embaixo do ponteiro. */
function moverPara(a) {
  let alvo = document.elementFromPoint(a.x, a.y);
  while (alvo && !(alvo.parentElement === a.g.pai && a.g.itens.some((i) => i.el === alvo))) alvo = alvo.parentElement;
  if (!alvo || alvo === a.el) return;
  const r = alvo.getBoundingClientRect();
  const ladoAlado = r.width < a.g.pai.getBoundingClientRect().width * 0.7; // caixas lado a lado (ex.: números do Painel)
  const depois = ladoAlado ? a.x > r.left + r.width / 2 : a.y > r.top + r.height / 2;
  const ref = depois ? alvo.nextSibling : alvo;
  if (ref !== a.el && ref !== a.el.nextSibling) a.g.pai.insertBefore(a.el, ref);
}

// perto da borda da janela, a página rola sozinha (ex.: levar o Histórico lá do fim para o topo)
function rolar() {
  if (!arrastando) return;
  const { y } = arrastando;
  const passo = y < 70 ? -18 : y > window.innerHeight - 70 ? 18 : 0;
  if (passo) { window.scrollBy(0, passo); moverPara(arrastando); }
  arrastando.quadro = requestAnimationFrame(rolar);
}

// o ponteiro é seguido na janela toda: mudar a caixa de lugar faz o navegador soltar a captura do ícone
window.addEventListener('pointermove', (ev) => {
  if (!arrastando) return;
  arrastando.x = ev.clientX;
  arrastando.y = ev.clientY;
  moverPara(arrastando);
});
function soltar() {
  const a = arrastando;
  if (!a) return;
  arrastando = null;
  cancelAnimationFrame(a.quadro);
  a.el.classList.remove('arrastando');
  document.body.classList.remove('arrastando-caixa');
  const depois = nomesNaTela(a.g);
  if (depois.join('|') !== a.antes.join('|')) a.salvar(a.g.nome, depois);
}
window.addEventListener('pointerup', soltar);
window.addEventListener('pointercancel', soltar);

/** Ícone ☰ em cada caixa do grupo: segura e arrasta para cima ou para baixo (ou para os lados, nas caixas lado a lado). */
function ligarAlcas(g, salvar) {
  for (const x of g.itens) {
    const alca = document.createElement('span');
    alca.className = 'alca-caixa nao-imprimir';
    alca.textContent = '☰';
    alca.title = 'Arraste para mudar a posição desta caixa (só o administrador vê)';
    x.el.classList.add('caixa-movel');
    (x.el.matches('details') ? x.el.querySelector(':scope > summary') : x.el).prepend(alca);
    // a caixa pode ser um link ou abrir e fechar: o clique no ícone não faz nada disso
    alca.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
    alca.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      arrastando = { g, el: x.el, antes: nomesNaTela(g), x: ev.clientX, y: ev.clientY, salvar };
      x.el.classList.add('arrastando');
      document.body.classList.add('arrastando-caixa');
      arrastando.quadro = requestAnimationFrame(rolar);
    });
  }
}

/**
 * Arruma as caixas da página já desenhada. ``guardada(grupo)`` devolve a ordem salva; com ``salvar(grupo, nomes)``
 * (só o administrador), aparece o ícone para arrastar.
 */
export function arrumarCaixas(raiz, pagina, guardada, salvar = null) {
  if (!raiz || FORA.has(pagina)) return;
  separarSetores(raiz);
  for (const g of gruposDe(raiz)) {
    aplicarOrdem(g, guardada(g.nome));
    if (salvar) ligarAlcas(g, salvar);
  }
}
