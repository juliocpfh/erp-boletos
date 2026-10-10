// Aplicação: estado, gravação na pasta escolhida, rotas e ações. As telas estão em telas.js.
import * as S from './armazenamento.js';
import { conferirSenha, novoSal, pode, resumoSenha } from './auth.js';
import * as C from './calculos.js';
import { esc } from './formularios.js';
import * as R from './regras.js';
import { TELAS, FORMULARIOS, ACOES } from './telas.js';

export const E = {
  pasta: null, // atalho para a pasta dos dados
  d: null, // banco em memória
  usuario: null,
  teste: new URLSearchParams(location.search).has('teste'),
  backupFeito: false,
};

export const login = () => (E.usuario ? E.usuario.login : 'sistema');
export const podeUsuario = (papel) => pode(E.usuario, papel);

// --------------------------------------------------------------------------
// Gravação: relê o arquivo, aplica a alteração e grava (para não apagar o que outra pessoa salvou)
// --------------------------------------------------------------------------
export async function alterar(fn) {
  const disco = await S.lerBanco(E.pasta);
  if (disco && E.d && disco.revisao !== E.d.revisao) {
    E.d = disco;
    aviso(`Os dados foram atualizados por ${disco.atualizado_por || 'outra pessoa'} e recarregados antes de gravar.`, 'info');
  }
  const copia = structuredClone(E.d || disco);
  const resultado = fn(copia);
  copia.revisao = (copia.revisao || 0) + 1;
  await S.gravarBanco(E.pasta, copia);
  E.d = copia;
  if (!E.backupFeito) {
    E.backupFeito = true;
    S.backupDiario(E.pasta, copia).catch(() => {});
  }
  atualizarFaixa();
  return resultado;
}

async function verificarMudancasExternas() {
  if (!E.pasta || !E.d || document.hidden) return;
  try {
    const disco = await S.lerBanco(E.pasta);
    if (disco && disco.revisao !== E.d.revisao) {
      E.d = disco;
      atualizarFaixa();
      const editando = document.querySelector('main form[data-form]');
      if (editando) aviso(`${disco.atualizado_por || 'Outra pessoa'} alterou os dados. Ao salvar, sua alteração será aplicada sobre a versão nova.`, 'info');
      else await mostrar();
    }
  } catch { /* pasta indisponível no momento */ }
}

// --------------------------------------------------------------------------
// Mensagens e utilidades de tela
// --------------------------------------------------------------------------
let mensagens = [];
export function aviso(texto, tipo = 'ok') {
  mensagens.push({ texto, tipo });
  desenharMensagens();
}

function desenharMensagens() {
  const el = document.getElementById('mensagens');
  if (!el) return;
  el.innerHTML = mensagens.map((m) => `<div class="alerta ${m.tipo}">${esc(m.texto)}</div>`).join('');
}

export function ir(hash) {
  if (location.hash === hash) mostrar();
  else location.hash = hash;
}

export function baixar(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

const scripts = {};
export function carregarScript(url, global) {
  if (window[global]) return Promise.resolve(window[global]);
  scripts[url] = scripts[url] || new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => ok(window[global]);
    s.onerror = () => erro(new Error('Sem internet para carregar um componente. Tente de novo.'));
    document.head.appendChild(s);
  });
  return scripts[url];
}
export const excelJs = () => carregarScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js', 'ExcelJS');
export const jsZip = () => carregarScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'JSZip');

// --------------------------------------------------------------------------
// Abertura: escolher pasta, primeiro acesso e login
// --------------------------------------------------------------------------
async function pastaDeTeste() {
  const raiz = await navigator.storage.getDirectory();
  return raiz.getDirectoryHandle('teste-imoveis', { create: true });
}

export async function abrirPasta(handle) {
  E.pasta = handle;
  E.d = await S.lerBanco(handle);
  E.usuario = null;
  E.backupFeito = false;
  const salvo = sessionStorage.getItem('usuario');
  if (E.d && salvo) E.usuario = E.d.usuarios.find((u) => u.login === salvo && u.ativo) || null;
  await mostrar();
}

export async function escolherPasta() {
  try {
    const h = E.teste ? await pastaDeTeste() : await S.escolherPasta();
    sessionStorage.removeItem('usuario');
    await abrirPasta(h);
  } catch (e) {
    if (e.name !== 'AbortError') aviso(e.message, 'erro');
  }
}

export async function reabrirPastaLembrada() {
  const h = await S.pastaLembrada();
  if (!h) return escolherPasta();
  if (!(await S.temPermissao(h, true))) return aviso('Sem permissão para a pasta. Escolha a pasta de novo.', 'erro');
  return abrirPasta(h);
}

export async function criarBanco(nome, loginTexto, senha) {
  const sal = novoSal();
  const hash = await resumoSenha(senha, sal);
  const novo = E.d || R.bancoVazio();
  const u = R.inserir(novo, 'usuarios', { login: loginTexto, nome, papel: 'admin', ativo: true, senha_sal: sal,
    senha_hash: hash, criado_em: new Date().toISOString() }, loginTexto, 'Primeiro administrador criado');
  novo.revisao = (novo.revisao || 0) + 1;
  await S.gravarBanco(E.pasta, novo);
  E.d = novo;
  E.usuario = u;
  sessionStorage.setItem('usuario', u.login);
}

export async function entrar(loginTexto, senha) {
  E.d = await S.lerBanco(E.pasta);
  const u = E.d.usuarios.find((x) => x.login === loginTexto && x.ativo);
  if (!(await conferirSenha(u, senha))) throw new Error('Login ou senha incorretos.');
  E.usuario = u;
  sessionStorage.setItem('usuario', u.login);
}

export function sair() {
  E.usuario = null;
  sessionStorage.removeItem('usuario');
  ir('#/');
}

// --------------------------------------------------------------------------
// Rotas e desenho da página
// --------------------------------------------------------------------------
function rotaAtual() {
  const [caminho, consulta] = (location.hash.slice(1) || '/').split('?');
  const partes = caminho.split('/').filter(Boolean);
  return { partes, q: Object.fromEntries(new URLSearchParams(consulta || '')) };
}

function atualizarFaixa() {
  const el = document.getElementById('faixa');
  if (!el || !E.d) return;
  el.innerHTML = `Pasta dos dados: <b>${esc(E.pasta.name)}</b> · Última atualização: <b>${E.d.atualizado_em ? new Date(E.d.atualizado_em).toLocaleString('pt-BR') : 'nenhuma ainda'}</b>${E.d.atualizado_por ? ` por <b>${esc(E.d.atualizado_por)}</b>` : ''} · tudo é salvo automaticamente na pasta`;
}

const MENU = [
  ['#/', 'Painel', ''], ['#/imoveis', 'Imóveis', 'imove|novo|editar'], ['#/iptu', 'IPTU', '^iptu$'], ['#/inquilinos', 'Inquilinos', 'inquilino|contrato'], ['#/cobrancas', 'Boletos', 'cobranca'],
  ['#/faturas', 'NF', 'fatura'], ['#/empresas', 'Empresas', 'empresa'], ['#/historico', 'Histórico', 'historico'],
  ['#/dados', 'Dados e backup', 'dados'],
];

function layout(conteudo, rota) {
  // formulários de inquilino (novo/editar contratos, fiadores, saída...) ficam no menu Inquilinos
  const deInquilino = ['novo', 'editar'].includes(rota.partes[0]) && ['contratos', 'fiadores', 'aplicacoes', 'correcoes_garantia', 'renovacoes', 'encerramentos', 'correcoes', 'seguros'].includes(rota.partes[1]);
  const deIptu = ['novo', 'editar'].includes(rota.partes[0]) && rota.partes[1] === 'iptus' && rota.q.de === 'iptu';
  const atual = deInquilino ? 'inquilino' : deIptu ? 'iptu' : rota.partes[0] || '';
  const menu = MENU.map(([h, t, m]) => `<a href="${h}" class="${(m && new RegExp(m).test(atual)) || (!m && !atual) ? 'ativo' : ''}">${t}</a>`).join('')
    + (podeUsuario('admin') ? `<a href="#/usuarios" class="${atual === 'usuarios' ? 'ativo' : ''}">Usuários</a>` : '');
  return `<header class="topo nao-imprimir">
      <a class="marca" href="#/">${E.d.logo ? `<img src="${esc(E.d.logo)}" alt="Logo">` : ''}Administração de Imóveis</a><nav>${menu}</nav>
      <div class="conta">${esc(E.usuario.nome)}<br><a href="#/minha-senha">Trocar senha</a> · <a href="#" data-acao="sair">Sair</a></div>
    </header>
    <div class="faixa nao-imprimir" id="faixa"></div>
    <main><div id="mensagens" class="nao-imprimir"></div>${conteudo}</main>`;
}

export async function mostrar(estadoForm = null) {
  const app = document.getElementById('app');
  const rota = rotaAtual();
  try {
    let html;
    if (!S.suportado() && !E.teste) html = TELAS.semSuporte();
    else if (!E.pasta) html = await TELAS.inicio();
    else if (!E.d || !E.d.usuarios.length) html = TELAS.primeiroAcesso();
    else if (!E.usuario) html = TELAS.login();
    else {
      const nome = rota.partes[0] || 'painel';
      const tela = TELAS[nome];
      const conteudo = tela ? await tela(rota, estadoForm) : '<h1>Página não encontrada</h1>';
      html = rota.partes[0] === 'imprimir' ? `<div id="mensagens" class="nao-imprimir"></div>${conteudo}` : layout(conteudo, rota);
    }
    app.innerHTML = html;
    atualizarFaixa();
    desenharMensagens();
    mensagens = [];
    await montarExtras(app);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<main><div class="alerta erro">${esc(e.message)}</div><p><a href="#/" class="botao">Voltar ao painel</a></p></main>`;
  }
}

/** Partes que precisam ler a pasta depois de desenhadas: listas de arquivos e fotos. */
async function montarExtras(raiz) {
  for (const el of raiz.querySelectorAll('[data-arquivos]')) {
    const [escopo, id] = el.dataset.arquivos.split(':');
    el.innerHTML = await TELAS._listaArquivos(escopo, Number(id));
  }
  TELAS._ligarDesconto(raiz);
}

// --------------------------------------------------------------------------
// Eventos: formulários e botões com data-acao
// --------------------------------------------------------------------------
document.addEventListener('submit', async (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const botao = form.querySelector('button[type=submit],button:not([type])');
  if (botao) botao.disabled = true;
  try {
    const resposta = await FORMULARIOS[form.dataset.form](form, rotaAtual());
    if (resposta && resposta.erros) {
      aviso('Confira os campos destacados.', 'erro');
      await mostrar(resposta);
    }
  } catch (e) {
    console.error(e);
    aviso(e.message, 'erro');
    if (botao) botao.disabled = false;
  }
});

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-acao]');
  if (!el) return;
  ev.preventDefault();
  if (el.dataset.confirmar && !confirm(el.dataset.confirmar)) return;
  try {
    await ACOES[el.dataset.acao](el.dataset, el);
  } catch (e) {
    console.error(e);
    aviso(e.message, 'erro');
  }
});

document.addEventListener('change', async (ev) => {
  const el = ev.target.closest('input[data-upload]');
  if (!el || !el.files.length) return;
  try {
    await ACOES.enviarArquivos(el.dataset, el);
  } catch (e) {
    aviso(e.message, 'erro');
  }
});

window.addEventListener('hashchange', () => mostrar());
window.addEventListener('focus', verificarMudancasExternas);
setInterval(verificarMudancasExternas, 30000);

(async function iniciar() {
  if (E.teste) {
    await abrirPasta(await pastaDeTeste());
    return;
  }
  const h = S.suportado() ? await S.pastaLembrada() : null;
  if (h && (await S.temPermissao(h, false))) await abrirPasta(h);
  else await mostrar();
}());

export { C, R, S };
