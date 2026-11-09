// Navegador mínimo de mentira para carregar o site inteiro (docs/js/app.js) no Node e chamar as telas, os formulários
// (FORMULARIOS) e os botões (ACOES) como o clique faria. Não desenha nada: guarda o que cada janela recebeu e os ouvintes
// do documento (submit, change…), para o teste disparar o evento. Uso: `const T = await carregarSite();` (uma vez por arquivo).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PastaDisco } from './pasta-disco.mjs';

/** Elemento falso: ouve eventos e abre janela; dentro dele não há nada (procurar devolve null), salvo na janela (<dialog>), que tem tudo. */
export function elemento(tag = 'div', extra = {}) {
  const ouvintes = {};
  const el = {
    tagName: tag.toUpperCase(), innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, isConnected: true,
    dataset: {}, style: {}, children: [], files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(t, f) { (ouvintes[t] ||= []).push(f); },
    removeEventListener() {},
    disparar(t, ev = {}) { for (const f of ouvintes[t] || []) f(ev); },
    querySelector: () => (tag === 'dialog' ? elemento() : null),
    querySelectorAll: () => [],
    closest: () => null,
    matches: () => false,
    appendChild: (x) => x, append() {}, remove() {}, setAttribute() {}, removeAttribute() {}, focus() {}, scrollIntoView() {},
    showModal() { janelas.push(el); },
    close() { el.disparar('close'); },
    ...extra,
  };
  return el;
}

/** Janelas (<dialog>) abertas pelo site, na ordem: `.innerHTML` tem o que apareceria; `.close()` = Cancelar. */
export const janelas = [];
/** Ouvintes do documento: { submit: [fn], change: [fn], … }. */
export const ouvintes = {};
/** Pedidos à internet (fetch): [url]; `internet.responder(url)` decide o que volta (Response, ou erro = sem internet). */
export const pedidos = [];
export const internet = { responder: () => { throw new TypeError('sem internet'); } };
/** A página "na tela": `formulario` = há um formulário aberto (main form[data-form]). */
export const pagina = { formulario: false };
/** Elementos que o site procura pelo id: `porId.app.innerHTML` é a tela desenhada; `porId.mensagens.innerHTML`, os avisos. */
export const porId = {};

/** FormData do Node não lê formulário: aqui o "formulário" falso traz os campos em `campos` ([[nome, valor]]). */
class FormDataFalso extends FormData {
  constructor(form) {
    super();
    for (const [k, v] of (form && form.campos) || []) this.append(k, v);
  }
}

export async function carregarSite() {
  globalThis.window = { addEventListener() {}, matchMedia: null, innerWidth: 1200, innerHeight: 800, scrollY: 0, scrollTo() {}, open() {} };
  globalThis.location = { protocol: 'https:', search: '', hash: '#/', hostname: 'teste.exemplo.com.br', href: 'https://teste.exemplo.com.br/#/' };
  globalThis.document = {
    hidden: false,
    addEventListener: (t, f) => (ouvintes[t] ||= []).push(f),
    getElementById: (id) => (porId[id] ||= elemento('div')),
    querySelector: (sel) => (sel === 'main form[data-form]' && pagina.formulario ? elemento('form') : null),
    querySelectorAll: () => [],
    createElement: (tag) => elemento(tag),
    body: elemento('body'),
    head: elemento('head'),
  };
  const guardado = new Map();
  globalThis.localStorage = { getItem: (k) => (guardado.has(k) ? guardado.get(k) : null), setItem: (k, v) => guardado.set(k, String(v)), removeItem: (k) => guardado.delete(k) };
  globalThis.sessionStorage = globalThis.localStorage;
  globalThis.setInterval = () => 0;
  globalThis.history = { replaceState() {} };
  globalThis.scrollTo = () => {};
  globalThis.confirm = () => true;
  globalThis.FormData = FormDataFalso;
  globalThis.fetch = async (url) => { pedidos.push(String(url)); return internet.responder(String(url)); };
  const app = await import('../docs/js/app.js');
  const telas = await import('../docs/js/telas.js');
  await new Promise((ok) => { setTimeout(ok, 20); }); // a abertura (iniciar) termina sem pasta nem nuvem
  return { ...app, TELAS: telas.TELAS, FORMULARIOS: telas.FORMULARIOS, ACOES: telas.ACOES, app: porId.app };
}

/**
 * Banco de teste com um administrador e um operador, numa pasta temporária do disco (a gravação vai para lá);
 * `entrarComo(papel)` troca o usuário da tela.
 */
export function bancoComUsuarios(R, E) {
  const d = R.bancoVazio();
  R.inserir(d, 'usuarios', { login: 'dono@exemplo.com.br', nome: 'Dono', papel: 'admin', ativo: true }, 'teste');
  R.inserir(d, 'usuarios', { login: 'operador@exemplo.com.br', nome: 'Operador', papel: 'operador', ativo: true }, 'teste');
  E.d = d;
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'imoveis-telas-'));
  if (!pastasTemporarias.length) process.once('exit', () => pastasTemporarias.forEach((p) => fs.rmSync(p, { recursive: true, force: true })));
  pastasTemporarias.push(pasta);
  E.pasta = new PastaDisco(pasta);
  return d;
}
const pastasTemporarias = [];

export function entrarComo(E, papel) {
  E.usuario = E.d.usuarios.find((u) => u.papel === papel);
}
