// Aplicação: estado, gravação na pasta escolhida, rotas e ações. As telas estão em telas.js.
import * as S from './armazenamento.js';
import { conferirSenha, novoSal, pode, resumoSenha } from './auth.js';
import * as B from './backup-seguro.js';
import { arrumarCaixas } from './caixas.js';
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
  seguro: null, // backup seguro: { dir, chave } conectado, ou { dir, desconectado } sem permissão neste momento
  seguroErro: '',
  pastaSeguraNova: null, // pasta escolhida na tela do backup seguro, antes de criar/digitar a senha
};

export const login = () => (E.usuario ? E.usuario.login : 'sistema');

// --------------------------------------------------------------------------
// Sessão: o login fica lembrado neste navegador (todas as abas) por 12 horas sem uso, até clicar em Sair.
// Antes ficava só na aba (sessionStorage): cada aba nova (impressão, Ctrl+clique) pedia login de novo.
// --------------------------------------------------------------------------
const SESSAO = 'imoveis-sessao';
const DURACAO_SESSAO = 12 * 3600 * 1000;

function lerSessao() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSAO) || 'null');
    return s && s.ate > Date.now() ? s.login : null;
  } catch {
    return null;
  }
}

function gravarSessao(loginTexto) {
  try {
    if (loginTexto) localStorage.setItem(SESSAO, JSON.stringify({ login: loginTexto, ate: Date.now() + DURACAO_SESSAO }));
    else localStorage.removeItem(SESSAO);
  } catch { /* navegador sem armazenamento: pede login de novo */ }
}

/** Usuário da sessão lembrada, se ainda estiver ativo no banco. */
const usuarioDaSessao = () => {
  const salvo = lerSessao();
  return (E.d && salvo && E.d.usuarios.find((u) => u.login === salvo && u.ativo && !u.pendente)) || null;
};

// Sair numa aba sai de todas; entrar numa aba vale para as outras.
window.addEventListener('storage', (ev) => {
  if (ev.key !== SESSAO || !E.d) return;
  const u = usuarioDaSessao();
  if ((u && u.login) !== (E.usuario && E.usuario.login)) {
    E.usuario = u;
    mostrar();
  }
});
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
  if (E.seguro && E.seguro.chave) naFilaSegura(() => B.espelhar(E.seguro.dir, E.seguro.chave, copia));
  if (!E.backupFeito) {
    E.backupFeito = true;
    S.backupDiario(E.pasta, copia).catch(() => {});
  }
  atualizarFaixa();
  return resultado;
}

// --------------------------------------------------------------------------
// Backup seguro (segunda pasta do administrador): cópia cifrada a cada gravação e completo semanal
// --------------------------------------------------------------------------
let filaSegura = Promise.resolve();
/** Uma gravação na pasta segura por vez; erro não atrapalha o uso do sistema (aparece para o administrador). */
export function naFilaSegura(fn) {
  filaSegura = filaSegura.then(fn).then(() => { E.seguroErro = ''; }).catch((e) => {
    console.error(e);
    E.seguroErro = e.message || String(e);
  });
  return filaSegura;
}

export async function pastaSeguraDeTeste() {
  const raiz = await navigator.storage.getDirectory();
  return raiz.getDirectoryHandle('teste-backup-seguro', { create: true });
}

/** Liga o backup seguro se este computador tem a pasta lembrada e a permissão (``pedir``: só com clique do usuário). */
export async function conectarSeguro(pedir = false) {
  const h = await S.pastaSeguraLembrada();
  if (!h) {
    E.seguro = null;
    return false;
  }
  if (!(await S.temPermissao(h, pedir))) {
    E.seguro = { dir: h, desconectado: true };
    return false;
  }
  const chave = await B.lerChave(h);
  E.seguro = chave ? { dir: h, chave } : null;
  return !!chave;
}

/** Backup completo: o mesmo ZIP do "Exportar tudo", cifrado, e uma cópia do programa sem internet. */
export function backupCompletoSeguro() {
  return naFilaSegura(async () => {
    if (!E.seguro || !E.seguro.chave || !E.pasta || !E.d) return;
    const JSZip = await jsZip();
    const zip = await S.exportarZip(JSZip, E.pasta, E.d);
    await B.gravarCompleto(E.seguro.dir, E.seguro.chave, new Uint8Array(await zip.arrayBuffer()));
    if (!window.VERSAO_OFFLINE) {
      try {
        const r = await fetch('offline/administracao-imoveis.html', { cache: 'no-store' });
        if (r.ok) await B.gravarPrograma(E.seguro.dir, await r.text());
      } catch { /* sem internet: fica a cópia anterior do programa */ }
    }
  });
}

/** Ao abrir a pasta: cópia do banco do dia e, se já passou uma semana, o backup completo. */
async function rotinaSegura() {
  if (!(await conectarSeguro(false)) || !E.d) return;
  naFilaSegura(() => B.espelhar(E.seguro.dir, E.seguro.chave, E.d));
  if (await B.completoPendente(E.seguro.dir)) backupCompletoSeguro();
}

async function verificarMudancasExternas() {
  if (!E.pasta || !E.d || document.hidden) return;
  try {
    const disco = await S.lerBanco(E.pasta);
    if (disco && disco.revisao !== E.d.revisao) {
      E.d = disco;
      renovarUsuario();
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
// Mensagens do topo: confirmações somem sozinhas em alguns segundos; erros ficam até fechar no ×.
// Uma mensagem aparece numa tela só (não volta na próxima página).
let mensagens = [];
let proximaMensagem = 1;
export function aviso(texto, tipo = 'ok') {
  if (tipo === 'erro') return janelaErro(texto);
  const m = { id: proximaMensagem++, texto, tipo };
  mensagens.push(m);
  desenharMensagens();
  if (tipo !== 'erro') setTimeout(() => fecharMensagem(m.id), tipo === 'aviso' ? 15000 : 6000);
}

/** Erro: janela no meio da tela com botão "Entendi" (a tela não sobe sozinha, então um aviso no topo passaria despercebido). */
function janelaErro(texto) {
  const dlg = document.createElement('dialog');
  dlg.className = 'janela-erro';
  dlg.innerHTML = `<p>${esc(texto)}</p><div class="acoes" style="justify-content:flex-end"><button type="button" autofocus>Entendi</button></div>`;
  dlg.querySelector('button').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

/**
 * Janela de pergunta no meio da tela. ``html`` já vem escapado por quem chama; ``forte`` = borda e botão vermelhos (mais chamativa).
 * Devolve os campos marcados/preenchidos da janela ({ nome: [valores] }) ao confirmar, ou null ao cancelar.
 */
/** ``ligar(dlg)``: liga os campos da janela (ex.: botão que mostra mais campos) depois de aberta. */
export function janela({ titulo, html, sim = 'Confirmar', nao = 'Cancelar', forte = false, ligar = null }) {
  return new Promise((resolver) => {
    const dlg = document.createElement('dialog');
    dlg.className = `janela-erro janela-pergunta${forte ? ' forte' : ''}`;
    dlg.innerHTML = `<form method="dialog">${titulo ? `<h3>${esc(titulo)}</h3>` : ''}<div class="corpo">${html}</div>
      <div class="acoes" style="justify-content:flex-end"><button type="button" class="secundario" data-nao>${esc(nao)}</button><button value="sim" class="${forte ? 'perigo' : ''}">${esc(sim)}</button></div></form>`;
    let resposta = null;
    dlg.querySelector('[data-nao]').addEventListener('click', () => dlg.close());
    dlg.querySelector('form').addEventListener('submit', () => {
      const fd = new FormData(dlg.querySelector('form'));
      resposta = {};
      for (const [k, v] of fd.entries()) (resposta[k] = resposta[k] || []).push(v);
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolver(resposta); });
    document.body.appendChild(dlg);
    dlg.showModal();
    if (ligar) ligar(dlg);
  });
}

function fecharMensagem(id) {
  mensagens = mensagens.filter((x) => x.id !== id);
  const el = document.querySelector(`#mensagens [data-msg="${id}"]`);
  if (el) el.remove();
}

function desenharMensagens() {
  const el = document.getElementById('mensagens');
  if (!el) return;
  el.innerHTML = mensagens.map((m) => `<div class="alerta ${m.tipo} mensagem" data-msg="${m.id}">${esc(m.texto)}<button type="button" class="fechar" title="Fechar" data-fechar-msg="${m.id}">×</button></div>`).join('');
}

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-fechar-msg]');
  if (b) fecharMensagem(Number(b.dataset.fecharMsg));
});

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
    s.onerror = () => erro(new Error('Não consegui carregar um componente do programa. Recarregue a página.'));
    document.head.appendChild(s);
  });
  return scripts[url];
}
// Componentes de terceiros ficam dentro do programa (pasta vendor): não dependem de outro site.
// Na versão de arquivo único (sem internet) eles já vêm carregados e carregarScript só devolve o que existe.
export const excelJs = () => carregarScript('vendor/exceljs.min.js', 'ExcelJS');
export const jsZip = () => carregarScript('vendor/jszip.min.js', 'JSZip');
export async function bibliotecasPdf() {
  const [h2c, jspdf] = await Promise.all([
    carregarScript('vendor/html2canvas.min.js', 'html2canvas'),
    carregarScript('vendor/jspdf.umd.min.js', 'jspdf'),
  ]);
  return { html2canvas: h2c, jsPDF: jspdf.jsPDF };
}

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
  E.backupFeito = false;
  E.usuario = usuarioDaSessao();
  await mostrar();
  rotinaSegura().catch((e) => { E.seguroErro = e.message; });
}

export async function escolherPasta() {
  try {
    const h = E.teste ? await pastaDeTeste() : await S.escolherPasta();
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
  gravarSessao(u.login);
}

export async function entrar(loginTexto, senha) {
  E.d = await S.lerBanco(E.pasta);
  const u = E.d.usuarios.find((x) => x.login === loginTexto);
  if (!(await conferirSenha(u, senha))) throw new Error('Login ou senha incorretos.');
  if (u.pendente) throw new Error('Seu pedido de acesso ainda não foi aprovado pelo administrador.');
  if (!u.ativo) throw new Error('Este usuário está bloqueado. Fale com o administrador.');
  E.usuario = u;
  gravarSessao(u.login);
}

/** Atualiza o usuário logado depois de alterar o cadastro dele (ou sai, se foi bloqueado). */
export function renovarUsuario() {
  if (!E.usuario) return;
  const u = E.d.usuarios.find((x) => x.id === E.usuario.id && x.ativo && !x.pendente) || null;
  E.usuario = u;
  gravarSessao(u && u.login);
}

export function sair() {
  E.usuario = null;
  gravarSessao(null);
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
  el.innerHTML = `Pasta dos dados: <b>${esc(E.pasta.name)}</b> · Última atualização: <b>${E.d.atualizado_em ? new Date(E.d.atualizado_em).toLocaleString('pt-BR') : 'nenhuma ainda'}</b>${E.d.atualizado_por ? ` por <b>${esc(E.d.atualizado_por)}</b>` : ''} · tudo é salvo automaticamente na pasta${window.VERSAO_OFFLINE ? ` · versão sem internet de ${window.VERSAO_OFFLINE.split('-').reverse().join('/')}` : ''}`;
}

const MENU = [
  ['#/', 'Painel', '^$|^fechamento|^pendencias'], ['#/inquilinos', 'Inquilinos', '^inquilino|^contrato|^vistoria|^solicitacoes'],
  ['#/reajustes', 'Reajustes', 'reajustes'], ['#/cobrancas', 'Boletos', 'cobranca|inadimplencia'], ['#/faturas', 'NF', 'fatura'],
  ['#/imoveis', 'Imóveis', '^imove|^novo|^editar|^iptu$|^modelo-vistoria'], ['#/resultados', 'Resultados', '^resultados|^contas|^impostos'],
  ['#/dados', 'Dados e backup', '^dados|^historico|^modelos?-contrato|^backup|^empresas'],
];

function layout(conteudo, rota) {
  // formulários de inquilino (novo/editar contratos, fiadores, saída...) ficam no menu Inquilinos
  const deInquilino = ['novo', 'editar'].includes(rota.partes[0]) && ['contratos', 'fiadores', 'aplicacoes', 'correcoes_garantia', 'depositos_garantia', 'renovacoes', 'encerramentos', 'correcoes', 'solicitacoes'].includes(rota.partes[1]);
  const deIptu = ['novo', 'editar'].includes(rota.partes[0]) && rota.partes[1] === 'iptus' && rota.q.de === 'iptu';
  const form = ['novo', 'editar'].includes(rota.partes[0]) ? { emitentes: 'empresas', usuarios: 'usuarios' }[rota.partes[1]] : null;
  const atual = deInquilino ? 'inquilino' : deIptu ? 'iptu' : form || rota.partes[0] || '';
  const menu = MENU.map(([h, t, m]) => `<a href="${h}" class="${(m && new RegExp(m).test(atual)) || (!m && !atual) ? 'ativo' : ''}">${t}</a>`).join('')
    + (podeUsuario('admin') ? `<a href="#/usuarios" class="${atual === 'usuarios' ? 'ativo' : ''}">Usuários${E.d.usuarios.some((u) => u.pendente) ? ` <span class="contador">${E.d.usuarios.filter((u) => u.pendente).length}</span>` : ''}</a>` : '');
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
    if (rota.partes[0] === 'restaurar-backup') html = await TELAS.restaurarBackup();
    else if (!S.suportado() && !E.teste) html = TELAS.semSuporte();
    else if (!E.pasta) html = await TELAS.inicio();
    else if (!E.d || !E.d.usuarios.length) html = TELAS.primeiroAcesso();
    else if (!E.usuario) html = rota.partes[0] === 'pedir-acesso' ? TELAS.pedirAcesso() : TELAS.login();
    else {
      gravarSessao(E.usuario.login); // usar o sistema mantém o login lembrado
      const nome = rota.partes[0] || 'painel';
      const tela = TELAS[nome];
      const conteudo = tela ? await tela(rota, estadoForm) : '<h1>Página não encontrada</h1>';
      html = rota.partes[0] === 'imprimir' ? `<div id="mensagens" class="nao-imprimir"></div>${conteudo}` : layout(conteudo, rota);
    }
    app.innerHTML = html;
    if (E.usuario && E.d) {
      // ordem das caixas escolhida pelo administrador (só ele vê o ícone ☰ para arrastar)
      const pagina = rota.partes[0] || 'painel';
      arrumarCaixas(app.querySelector('main'), pagina, (grupo) => R.ordemGuardada(E.d, pagina, grupo),
        podeUsuario('admin') ? (grupo, nomes) => alterar((db) => R.salvarOrdemCaixas(db, pagina, grupo, nomes, login())).catch((e) => aviso(e.message, 'erro')) : null);
    }
    atualizarFaixa();
    desenharMensagens();
    mensagens = [];
    await montarExtras(app);
    // ?ir=secao rola a página até a caixa (ex.: alerta de IPTU leva à caixa do IPTU do imóvel).
    // Depois tira o ?ir= do endereço: assim o mesmo atalho funciona de novo e outras ações na página não pulam para a caixa.
    const alvo = rota.q.ir && document.getElementById(rota.q.ir);
    if (alvo) alvo.scrollIntoView({ block: 'start' });
    if (rota.q.ir) history.replaceState(null, '', location.href.replace(/([?&])ir=[^&]*&?/, '$1').replace(/[?&]$/, ''));
  } catch (e) {
    console.error(e);
    app.innerHTML = `<main><div class="alerta erro">${esc(e.message)}</div><p><a href="#/" class="botao">Voltar ao painel</a></p></main>`;
  }
}

/** Partes que precisam ler a pasta depois de desenhadas: listas de arquivos e fotos. */
async function montarExtras(raiz) {
  for (const el of raiz.querySelectorAll('[data-arquivos]')) {
    const [escopo, id, modo] = el.dataset.arquivos.split(':');
    el.innerHTML = await TELAS._listaArquivos(escopo, Number(id), modo);
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

// datas: o ano tem 4 dígitos (sem o limite, o navegador aceita 6 e o 5º dígito não volta ao começo do ano)
document.addEventListener('focusin', (ev) => {
  const el = ev.target;
  if (el.tagName !== 'INPUT') return;
  if (el.type === 'date' && !el.max) el.max = '9999-12-31';
  if (el.type === 'month' && !el.max) el.max = '9999-12';
});

// Lista que cresce (depósitos anteriores do FCI): preencher a última linha cria outra em branco; 🗑️ tira a linha.
document.addEventListener('input', (ev) => {
  const corpo = ev.target.closest('[data-linhas-fci]');
  if (!corpo) return;
  const ultima = corpo.lastElementChild;
  if (ultima && [...ultima.querySelectorAll('input')].every((x) => x.value.trim())) {
    const nova = ultima.cloneNode(true);
    nova.querySelectorAll('input').forEach((x) => { x.value = ''; });
    corpo.append(nova);
  }
});

document.addEventListener('click', (ev) => {
  const lixo = ev.target.closest('[data-remover-linha]');
  if (!lixo) return;
  const tr = lixo.closest('tr');
  const corpo = tr.parentElement;
  if (corpo.children.length > 1) tr.remove();
  else tr.querySelectorAll('input').forEach((x) => { x.value = ''; });
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
  if (ev.target.matches('select[data-ordem-boletos]')) {
    ir(`#/cobrancas?comp=${ev.target.dataset.ordemBoletos}&ordem=${ev.target.value}`);
    return;
  }
  if (ev.target.matches('input[data-marcar-grupo]')) {
    ev.target.closest('form').querySelectorAll('input[name=ids]').forEach((x) => { x.checked = ev.target.checked; });
    return;
  }
  if (ev.target.matches('input[data-marcar-todas]')) {
    document.querySelectorAll(`input[data-${ev.target.dataset.marcarTodas || 'nf'}]`).forEach((x) => { x.checked = ev.target.checked; });
    return;
  }
  if (ev.target.matches('input[data-trocar-mes]') && ev.target.value) {
    ir(`#/contas/${ev.target.dataset.trocarMes}?comp=${ev.target.value}`);
    return;
  }
  if (ev.target.matches('select[data-previa]')) {
    const n = ev.target.dataset.previa;
    const f = ev.target.form;
    TELAS._previaAlerta(document.getElementById(`previa_${n}`), f[`cor_${n}`].value, f[`enfase_${n}`].value);
    return;
  }
  if (ev.target.matches('input[data-arquivo-doc]')) {
    const nome = ev.target.closest('label').querySelector('[data-nome-escolhido]');
    nome.textContent = ev.target.files.length ? `📎 ${ev.target.files[0].name}` : 'Anexar';
    return;
  }
  if (ev.target.matches('input[data-acao-arquivo]')) {
    if (!ev.target.files.length) return;
    try {
      await ACOES[ev.target.dataset.acaoArquivo](ev.target.dataset, ev.target);
    } catch (e) {
      console.error(e);
      aviso(e.message, 'erro');
    }
    return;
  }
  const el = ev.target.closest('input[data-upload]');
  if (!el || !el.files.length) return;
  try {
    await ACOES.enviarArquivos(el.dataset, el);
  } catch (e) {
    aviso(e.message, 'erro');
  }
});

// Campos em R$: ao sair do campo, mostra com milhar e centavos (1350 → 1.350,00).
document.addEventListener('focusout', (ev) => {
  const el = ev.target;
  if (!el.matches || !el.matches('input[data-dinheiro]') || !el.value.trim()) return;
  try {
    el.value = C.reais(C.centavos(el.value), false);
  } catch { /* deixa como está: o formulário avisa o valor inválido */ }
});

// Enter no campo "incluir na lista" clica no OK (sem enviar o formulário).
document.addEventListener('keydown', (ev) => {
  const el = ev.target;
  if (ev.key !== 'Enter' || !el.matches || !el.matches('input[data-lista-novo]')) return;
  ev.preventDefault();
  el.parentElement.querySelector('[data-acao=incluirNaLista]').click();
});

// Página nova começa do topo (com ?ir= a própria tela rola até a caixa).
window.addEventListener('hashchange', async () => {
  const ir = rotaAtual().q.ir;
  await mostrar();
  if (!ir) scrollTo(0, 0);
});

// Link para o endereço em que já estamos (ex.: atalho clicado pela 2ª vez): o navegador não avisa a mudança, então desenhamos de novo.
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[href^="#/"]');
  if (!a || a.target || ev.ctrlKey || ev.metaKey || ev.shiftKey || a.getAttribute('href') !== location.hash) return;
  ev.preventDefault();
  mostrar();
});
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
