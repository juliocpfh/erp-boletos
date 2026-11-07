// Visualizador de anexos no celular: PDF (pdf.js, docs/vendor/pdf.min.js) e fotos numa janela por cima da tela, sem baixar.
// No celular o navegador não mostra o PDF aberto pelo sistema (ele baixa); aqui cada página vira uma imagem na própria tela.
// O arquivo nunca roda como página: o PDF é desenhado pelo pdf.js (sem scripts do PDF) e a foto entra só como <img>.

const PDFJS = 'vendor/pdf.min.js';
const PDFJS_TRABALHO = 'vendor/pdf.worker.min.js';

let carregando = null;
function carregarPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  carregando = carregando || new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = PDFJS;
    s.onload = () => (window.pdfjsLib ? ok(window.pdfjsLib) : erro(new Error('pdf.js não carregou')));
    s.onerror = () => { carregando = null; erro(new Error('Não consegui carregar o leitor de PDF.')); };
    document.head.appendChild(s);
  });
  return carregando.then((lib) => { lib.GlobalWorkerOptions.workerSrc = PDFJS_TRABALHO; return lib; });
}

/** Abre no celular? (tela estreita ou toque): aí o anexo abre no visualizador em vez de aba nova. */
export function usarVisualizador() {
  if (location.protocol === 'file:') return false; // versão sem internet: não tem o pdf.js
  return !!window.matchMedia?.('(max-width: 760px), (hover: none) and (pointer: coarse)').matches;
}

function fechar(janela, urls) {
  janela.remove();
  urls.forEach((u) => URL.revokeObjectURL(u));
  document.body.classList.remove('com-visualizador');
  document.removeEventListener('keydown', janela.teclado);
}

/**
 * Mostra o arquivo. `tipo`: 'application/pdf' ou 'image/…' (de tipoParaAbrir). `baixar(blob, nome)`: botão Baixar.
 * Devolve uma promessa que termina quando o arquivo estiver desenhado (ou com erro, já mostrado na janela).
 */
export async function visualizar(blob, nome, tipo, baixar) {
  const urls = [];
  const janela = document.createElement('div');
  janela.className = 'visualizador nao-imprimir';
  janela.setAttribute('role', 'dialog');
  janela.setAttribute('aria-modal', 'true');
  janela.innerHTML = `<div class="vis-topo"><span class="vis-nome"></span><button type="button" class="botao secundario pequeno" data-vis="baixar">Baixar</button><button type="button" class="botao pequeno" data-vis="fechar" aria-label="Fechar">✕ Fechar</button></div><div class="vis-corpo"><p class="vis-aviso">Abrindo…</p></div>`;
  janela.querySelector('.vis-nome').textContent = nome;
  janela.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-vis]');
    if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    if (b.dataset.vis === 'fechar') fechar(janela, urls);
    else baixar(blob, nome);
  });
  janela.teclado = (ev) => { if (ev.key === 'Escape') fechar(janela, urls); };
  document.addEventListener('keydown', janela.teclado);
  document.body.appendChild(janela);
  document.body.classList.add('com-visualizador');
  const corpo = janela.querySelector('.vis-corpo');
  try {
    if (tipo.startsWith('image/')) {
      const u = URL.createObjectURL(new Blob([blob], { type: tipo }));
      urls.push(u);
      const img = document.createElement('img');
      img.alt = nome; img.src = u;
      corpo.replaceChildren(img);
      return;
    }
    const lib = await carregarPdfJs();
    const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
    corpo.replaceChildren();
    const largura = Math.max(320, corpo.clientWidth - 16);
    const nitidez = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= pdf.numPages; n += 1) {
      if (!janela.isConnected) return; // fechou no meio
      const pagina = await pdf.getPage(n);
      const escala = largura / pagina.getViewport({ scale: 1 }).width;
      const vista = pagina.getViewport({ scale: escala * nitidez });
      const tela = document.createElement('canvas');
      tela.width = Math.floor(vista.width); tela.height = Math.floor(vista.height);
      tela.style.width = `${Math.floor(vista.width / nitidez)}px`;
      corpo.appendChild(tela);
      await pagina.render({ canvasContext: tela.getContext('2d'), viewport: vista }).promise;
    }
    pdf.destroy?.();
  } catch (e) {
    const p = document.createElement('p');
    p.className = 'vis-aviso';
    p.textContent = `Não consegui mostrar o arquivo (${e.message}). Use o botão Baixar.`;
    corpo.replaceChildren(p);
  }
}
