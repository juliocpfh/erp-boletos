// Visualizador de anexos no celular: PDF (pdf.js, docs/vendor/pdf.min.js) e fotos numa janela por cima da tela, sem baixar.
// No celular o navegador não mostra o PDF aberto pelo sistema (ele baixa); aqui cada página vira uma imagem na própria tela.
// O arquivo nunca roda como página: o PDF é desenhado pelo pdf.js (sem scripts do PDF) e a foto entra só como <img>.

const PDFJS = 'vendor/pdf.min.js';
const PDFJS_TRABALHO = 'vendor/pdf.worker.min.js';

let carregando = null;
/** Carrega o pdf.js (também para a impressão da pasta física, telas/arquivo-impresso.js). */
export function carregarPdfJs() {
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

/**
 * Fecha a janela. ``voltar``: tira do histórico a entrada que a abertura pôs (botão Fechar e Esc); o Voltar do aparelho
 * já tirou, e quando a página mudou por baixo (``fecharSemVoltar``, chamado por ``mostrar``) não se mexe no histórico.
 */
function fechar(janela, urls, voltar = true) {
  if (janela.fechada) return;
  janela.fechada = true;
  janela.remove();
  urls.forEach((u) => URL.revokeObjectURL(u));
  document.body.classList.remove('com-visualizador');
  document.removeEventListener('keydown', janela.teclado);
  window.removeEventListener('popstate', janela.aoVoltar);
  // a entrada tem o mesmo endereço da página: voltar por ela não muda o endereço (não há hashchange, a tela não é redesenhada)
  if (voltar && janela.marca && history.state && history.state.visualizador === janela.marca) history.back();
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
  // Voltar do aparelho fecha o anexo (antes saía da página, ou do aplicativo): a abertura põe uma entrada no histórico,
  // com o mesmo endereço, e o Voltar só a consome
  document.querySelector('.visualizador')?.fecharSemVoltar?.(); // outro anexo ainda aberto: um de cada vez
  janela.aoVoltar = () => fechar(janela, urls, false);
  janela.fecharSemVoltar = janela.aoVoltar;
  try {
    const marca = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (history.state && history.state.visualizador) history.replaceState({ visualizador: marca }, ''); // sobrou de um anexo fechado sem voltar
    else history.pushState({ visualizador: marca }, '');
    janela.marca = marca;
    window.addEventListener('popstate', janela.aoVoltar);
  } catch { /* navegador que não deixa mexer no histórico: fecha só pelo botão */ }
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
    // a largura que cabe no aparelho (sem mínimo: com 320 px numa tela de 320, o CSS encolhia só a largura e a folha esticava)
    const largura = Math.max(100, corpo.clientWidth - 16);
    const nitidez = Math.min(window.devicePixelRatio || 1, 2);
    // Primeiro reserva o lugar de TODAS as páginas (tamanho certo, em branco) e só depois desenha uma a uma. Antes cada
    // página entrava na tela só quando ficava pronta: rolando, a próxima "carregava" no fim e a tela pulava.
    const paginas = [];
    for (let n = 1; n <= pdf.numPages; n += 1) {
      if (!janela.isConnected) return; // fechou no meio
      const pagina = await pdf.getPage(n);
      const escala = largura / pagina.getViewport({ scale: 1 }).width;
      const vista = pagina.getViewport({ scale: escala * nitidez });
      const tela = document.createElement('canvas');
      tela.width = Math.floor(vista.width); tela.height = Math.floor(vista.height);
      // largura e altura fixas na tela: o tamanho não muda quando o desenho termina
      tela.style.width = `${Math.floor(vista.width / nitidez)}px`;
      tela.style.height = `${Math.floor(vista.height / nitidez)}px`;
      corpo.appendChild(tela);
      paginas.push({ pagina, vista, tela });
    }
    for (const { pagina, vista, tela } of paginas) {
      if (!janela.isConnected) return;
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
