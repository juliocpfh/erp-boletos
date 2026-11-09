// Índice e caixas recolhíveis nas páginas longas (inquilino e imóvel): embaixo do nome, um link para cada caixa; cada caixa
// ganha o botão ▾/▸ para recolher. As recolhidas ficam lembradas neste navegador (localStorage, por página), não no banco de dados.
import { paraNomeDeArquivo } from './calculos.js';
import { esc } from './formularios.js';

/** Páginas com índice (rota → chave da memória local). */
const PAGINAS = new Set(['contrato', 'imovel']);
const CHAVE = (pagina) => `caixas-recolhidas:${pagina}`;

function lerRecolhidas(pagina) {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE(pagina)) || '[]')); } catch { return new Set(); }
}
function guardarRecolhidas(pagina, conjunto) {
  try { localStorage.setItem(CHAVE(pagina), JSON.stringify([...conjunto])); } catch { /* navegador sem armazenamento: só não lembra */ }
}

/** Título da caixa: o h2 (ou o summary) direto dela, sem a contagem "(3)" e o que vem depois de " · ". */
const tituloDa = (cx) => {
  const t = cx.matches('details') ? cx.querySelector(':scope > summary') : (cx.querySelector(':scope > .cabecalho > h2, :scope > h2') || cx.querySelector('h2'));
  // sem o ☰ (alça do administrador para arrastar), a contagem "(3)" e o que vem depois de " · "
  return t ? t.textContent.replace(/☰/g, '').replace(/\s*\([^)]*\)\s*$/, '').split(' · ')[0].replace(/\s+/g, ' ').trim() : '';
};
const idDe = (texto) => paraNomeDeArquivo(texto).slice(0, 40);

/** Caixas de primeiro nível da página (fora de formulários), com título. */
function caixasDe(raiz) {
  const lista = [];
  for (const cx of raiz.querySelectorAll('.cartao, details.cartao')) {
    if (cx.closest('form') || cx.closest('.cartao:not(:scope)') || cx.matches('a') || cx.classList.contains('login')) continue;
    const titulo = tituloDa(cx);
    if (!titulo) continue;
    lista.push({ cx, titulo });
  }
  return lista;
}

/**
 * Monta o índice e os botões de recolher. Chamado a cada desenho da página (os botões e o índice são refeitos).
 * Clicar num item do índice rola até a caixa e a abre se estiver recolhida (sem mexer no endereço: o # é a rota).
 */
export function montarIndice(raiz, pagina) {
  if (!raiz || !PAGINAS.has(pagina)) return;
  const caixas = caixasDe(raiz);
  if (caixas.length < 4) return;
  const recolhidas = lerRecolhidas(pagina);
  const usados = new Set();
  for (const x of caixas) {
    if (!x.cx.id) {
      let id = idDe(x.titulo) || 'caixa';
      while (usados.has(id) || raiz.querySelector(`#${CSS.escape(id)}`)) id = `${id}-2`;
      x.cx.id = id;
    }
    usados.add(x.cx.id);
    x.nome = idDe(x.titulo);
    if (x.cx.matches('details')) continue; // <details> já recolhe sozinho
    const cab = x.cx.querySelector(':scope > .cabecalho') || x.cx.querySelector(':scope > h2');
    if (!cab) continue;
    const fechada = recolhidas.has(x.nome);
    x.cx.classList.toggle('recolhida', fechada);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'recolher-caixa';
    b.title = fechada ? 'Mostrar esta caixa' : 'Recolher esta caixa';
    b.setAttribute('aria-expanded', String(!fechada));
    b.textContent = fechada ? '▸' : '▾';
    b.addEventListener('click', () => {
      const agora = !x.cx.classList.contains('recolhida');
      x.cx.classList.toggle('recolhida', agora);
      b.textContent = agora ? '▸' : '▾';
      b.title = agora ? 'Mostrar esta caixa' : 'Recolher esta caixa';
      b.setAttribute('aria-expanded', String(!agora));
      if (agora) recolhidas.add(x.nome); else recolhidas.delete(x.nome);
      guardarRecolhidas(pagina, recolhidas);
    });
    (cab.tagName === 'H2' ? x.cx : cab).insertBefore(b, cab.tagName === 'H2' ? cab : cab.firstChild);
  }
  const nav = document.createElement('nav');
  nav.className = 'indice-caixas nao-imprimir';
  nav.setAttribute('aria-label', 'Partes desta página');
  nav.innerHTML = `<span class="suave">Nesta página:</span> ${caixas.map((x) => `<a href="#" data-ir-caixa="${esc(x.cx.id)}">${esc(x.titulo)}</a>`).join(' ')}`;
  nav.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[data-ir-caixa]');
    if (!a) return;
    ev.preventDefault();
    const cx = document.getElementById(a.dataset.irCaixa);
    if (!cx) return;
    if (cx.matches('details')) cx.open = true;
    if (cx.classList.contains('recolhida')) cx.querySelector('.recolher-caixa')?.click();
    cx.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
  // embaixo do nome e do endereço (o que já vem logo abaixo do título), antes da primeira caixa ou aviso
  const cab = raiz.querySelector('.cabecalho');
  let depois = cab;
  while (depois && depois.nextElementSibling && depois.nextElementSibling.matches('.endereco, .atalhos-docs, .selos')) depois = depois.nextElementSibling;
  if (depois) depois.insertAdjacentElement('afterend', nav); else raiz.prepend(nav);
}
