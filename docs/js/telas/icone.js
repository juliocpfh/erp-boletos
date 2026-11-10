// Ícone do aplicativo (celular): o administrador enquadra a logo (arrastar e zoom) e a nuvem guarda os PNG de 192 e 512
// (rotas /api/icone-*.png e /api/icone/<tamanho>, nuvem/worker.mjs); sem ícone escolhido, a nuvem manda o padrão "ERP".
import { aviso, E, login, mostrar, podeUsuario, trocarIconeDaAba } from '../app.js';
import { d } from './comum.js';

// enquadramento em uso na tela (zoom 1 = a logo inteira dentro do círculo que o celular sempre mostra)
const enquadro = { zoom: 1, x: 0, y: 0, fundo: '#ffffff' };
const AREA_SEGURA = 0.8; // Android corta o ícone em círculo: o que fica nos 80% do meio sempre aparece
let imagemDaLogo = null;
let logoCarregada = '';

/** Caixa do ícone na página Empresas (logo). Só o administrador vê. */
export function caixaIcone() {
  if (!podeUsuario('admin')) return '';
  if (!d().logo) return `<div class="cartao" id="icone-app"><h2>Ícone do aplicativo (celular)</h2>
    <p class="suave">Envie a logo acima. Depois você enquadra aqui o ícone que aparece na tela do celular (hoje é o quadrado "ERP").</p></div>`;
  return `<div class="cartao" id="icone-app"><h2>Ícone do aplicativo (celular)</h2>
    <p class="suave">Arraste a logo para posicionar e use o zoom (no celular, também com dois dedos). O círculo tracejado é a parte que sempre aparece: o celular pode cortar o que fica fora dele.</p>
    <div class="icone-editor">
      <canvas class="icone-tela" width="512" height="512" aria-label="Enquadramento do ícone: arraste para mover"></canvas>
      <div class="icone-previas">
        <div><canvas data-forma="redondo" width="96" height="96"></canvas><span class="suave">redondo</span></div>
        <div><canvas data-forma="quadrado" width="96" height="96"></canvas><span class="suave">quadrado</span></div>
      </div>
    </div>
    <div class="acoes icone-controles">
      <label>Zoom <input type="range" class="icone-zoom" min="30" max="400" step="1" value="${Math.round(enquadro.zoom * 100)}"></label>
      <label>Fundo <input type="color" class="icone-fundo" value="${enquadro.fundo}"></label>
      <button type="button" class="secundario pequeno" data-acao="iconeCentralizar">Centralizar</button>
    </div>
    <div class="acoes">${E.nuvem
    ? `<button type="button" data-acao="salvarIcone">Usar como ícone do aplicativo</button>
      <button type="button" class="secundario" data-acao="iconePadrao" data-confirmar="Voltar ao ícone padrão (quadrado branco com ERP)?">Voltar ao ícone ERP</button>`
    : '<span class="suave">O ícone do aplicativo só muda com os dados na nuvem (o celular busca o ícone no site).</span>'}</div>
    <p class="suave">Quem já tem o aplicativo instalado: o Android troca o ícone sozinho, em até um dia; no iPhone, tire o aplicativo da tela inicial e adicione de novo.</p></div>`;
}

/** Desenha o ícone limpo (sem as marcas do editor) num quadrado de `lado` pixels. */
function desenharIcone(g, lado) {
  g.save();
  g.fillStyle = enquadro.fundo;
  g.fillRect(0, 0, lado, lado);
  const img = imagemDaLogo;
  if (img && img.naturalWidth) {
    // zoom 1: a logo inteira cabe dentro do círculo seguro (a diagonal da logo = diâmetro do círculo)
    const diagonal = Math.hypot(img.naturalWidth, img.naturalHeight);
    const escala = (lado * AREA_SEGURA * enquadro.zoom) / diagonal;
    const w = img.naturalWidth * escala;
    const h = img.naturalHeight * escala;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, lado / 2 + enquadro.x * lado - w / 2, lado / 2 + enquadro.y * lado - h / 2, w, h);
  }
  g.restore();
}

/** Redesenha o editor (com o círculo seguro) e as duas prévias. */
function redesenhar(caixa) {
  const tela = caixa.querySelector('.icone-tela');
  if (!tela) return;
  const g = tela.getContext('2d');
  const L = tela.width;
  desenharIcone(g, L);
  // fora do círculo seguro fica mais apagado; o círculo, tracejado
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.rect(0, 0, L, L);
  g.arc(L / 2, L / 2, (L * AREA_SEGURA) / 2, 0, Math.PI * 2, true);
  g.fill('evenodd');
  g.setLineDash([10, 8]);
  g.lineWidth = 3;
  g.strokeStyle = '#ffffff';
  g.beginPath();
  g.arc(L / 2, L / 2, (L * AREA_SEGURA) / 2, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  for (const p of caixa.querySelectorAll('canvas[data-forma]')) {
    const gp = p.getContext('2d');
    const l = p.width;
    gp.clearRect(0, 0, l, l);
    gp.save();
    gp.beginPath();
    if (p.dataset.forma === 'redondo') gp.arc(l / 2, l / 2, l / 2, 0, Math.PI * 2);
    else gp.roundRect(0, 0, l, l, l * 0.22);
    gp.clip();
    desenharIcone(gp, l);
    gp.restore();
  }
}

async function carregarLogo() {
  const logo = d().logo || '';
  if (imagemDaLogo && logoCarregada === logo) return imagemDaLogo;
  imagemDaLogo = await new Promise((ok, falha) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => falha(new Error('Não consegui abrir a logo.'));
    i.src = logo;
  });
  logoCarregada = logo;
  return imagemDaLogo;
}

/** Liga o editor depois que a tela aparece: arrastar (mouse e dedo), zoom (controle, roda e dois dedos) e fundo. */
export function ligarEditorIcone(raiz) {
  const caixa = raiz.querySelector('#icone-app');
  const tela = caixa?.querySelector('.icone-tela');
  if (!tela || tela.dataset.ligado) return;
  tela.dataset.ligado = '1';
  const zoom = caixa.querySelector('.icone-zoom');
  const pontos = new Map();
  let pinca = null;
  const mudarZoom = (z) => { enquadro.zoom = Math.min(4, Math.max(0.3, z)); zoom.value = Math.round(enquadro.zoom * 100); redesenhar(caixa); };
  tela.addEventListener('pointerdown', (ev) => { tela.setPointerCapture(ev.pointerId); pontos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); ev.preventDefault(); });
  tela.addEventListener('pointermove', (ev) => {
    const antes = pontos.get(ev.pointerId);
    if (!antes) return;
    pontos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pontos.size >= 2) {
      const [a, b] = [...pontos.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinca) mudarZoom(enquadro.zoom * (dist / pinca));
      pinca = dist;
      return;
    }
    const lado = tela.getBoundingClientRect().width || 1;
    enquadro.x += (ev.clientX - antes.x) / lado;
    enquadro.y += (ev.clientY - antes.y) / lado;
    redesenhar(caixa);
  });
  const soltar = (ev) => { pontos.delete(ev.pointerId); if (pontos.size < 2) pinca = null; };
  tela.addEventListener('pointerup', soltar);
  tela.addEventListener('pointercancel', soltar);
  tela.addEventListener('wheel', (ev) => { ev.preventDefault(); mudarZoom(enquadro.zoom * (ev.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
  zoom.addEventListener('input', () => mudarZoom(Number(zoom.value) / 100));
  caixa.querySelector('.icone-fundo').addEventListener('input', (ev) => { enquadro.fundo = ev.target.value; redesenhar(caixa); });
  carregarLogo().then(() => redesenhar(caixa)).catch((e) => aviso(e.message, 'aviso'));
}

/** PNG do ícone no tamanho pedido (192 ou 512). */
function pngDoIcone(lado) {
  const cv = document.createElement('canvas');
  cv.width = lado;
  cv.height = lado;
  desenharIcone(cv.getContext('2d'), lado);
  return new Promise((ok, falha) => cv.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui gerar a imagem do ícone.'))), 'image/png'));
}

async function pedirNuvem(rota, metodo, corpo) {
  const r = await fetch(`api/${rota}`, { method: metodo, body: corpo, headers: { 'X-Sistema': 'imoveis', ...(corpo ? { 'Content-Type': 'image/png' } : {}) } });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.erro || `A nuvem recusou (erro ${r.status}).`);
  }
}

// --------------------------------------------------------------------------
// "Primeiro passo" do Painel: escolher a logo (dá para deixar para depois, neste aparelho)
const chaveAdiada = () => `logo-adiada:${login() || ''}`;
/** Aviso no Painel para o administrador enquanto não há logo (some com "Fazer depois"). */
export function avisoPrimeiraLogo() {
  if (!podeUsuario('admin') || d().logo) return '';
  try { if (localStorage.getItem(chaveAdiada())) return ''; } catch { /* sem localStorage: mostra o aviso */ }
  return `<div class="alerta info primeira-logo"><b>Primeiro passo: a logo da empresa.</b> Ela aparece no topo do sistema, nos contratos e cartas e vira o ícone do aplicativo no celular (hoje o quadrado "ERP").
    <span class="acoes" style="margin-top:6px"><a class="botao pequeno" href="#/empresas?ir=logo-empresa">Escolher a logo</a> <button type="button" class="secundario pequeno" data-acao="adiarLogo">Fazer depois</button></span></div>`;
}

export const ACOES_ICONE = {
  iconeCentralizar() {
    Object.assign(enquadro, { zoom: 1, x: 0, y: 0 });
    const caixa = document.querySelector('#icone-app');
    if (caixa) { caixa.querySelector('.icone-zoom').value = 100; redesenhar(caixa); }
  },

  async salvarIcone() {
    if (!podeUsuario('admin')) throw new Error('Só administradores podem trocar o ícone do aplicativo.');
    if (!E.nuvem) throw new Error('O ícone do aplicativo só muda com os dados na nuvem.');
    await carregarLogo();
    const [grande, pequeno] = await Promise.all([pngDoIcone(512), pngDoIcone(192)]);
    await pedirNuvem('icone/512', 'PUT', grande);
    await pedirNuvem('icone/192', 'PUT', pequeno);
    trocarIconeDaAba();
    aviso('Ícone do aplicativo salvo. Quem instalar o aplicativo a partir de agora já recebe este ícone.');
  },

  async iconePadrao() {
    if (!podeUsuario('admin')) throw new Error('Só administradores podem trocar o ícone do aplicativo.');
    await pedirNuvem('icone', 'DELETE');
    trocarIconeDaAba();
    aviso('O aplicativo voltou ao ícone padrão (ERP).');
  },

  async adiarLogo() {
    try { localStorage.setItem(chaveAdiada(), '1'); } catch { /* sem localStorage: o aviso volta na próxima vez */ }
    await mostrar();
  },
};
