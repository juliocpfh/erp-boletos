// Aplicação: estado, gravação na pasta escolhida (ou na nuvem, nuvem.js), rotas e ações. As telas estão em telas.js.
import * as S from './armazenamento.js';
import { camposDeSenha, conferirSenha, pode, reforcarSenha } from './auth.js';
import { carregarPonteLocal } from './banco.js';
import * as B from './backup-seguro.js';
import { arrumarCaixas } from './caixas.js';
import { montarIndice } from './indice.js';
import * as C from './calculos.js';
import * as CA from './copia-aberta.js';
import { encaixarFaturas } from './fatura.js';
import { esc } from './formularios.js';
import * as N from './nuvem.js';
import { AnexosNuvem } from './pasta-nuvem.js';
import { Cofrinho, guardarCifrado } from './cofrinho.js';
import * as R from './regras.js';
import { TELAS, FORMULARIOS, ACOES } from './telas.js';
import { apagarAnexosConfirmados, SELETOR_FORMULARIO } from './telas/comum.js';

export const E = {
  pasta: null, // atalho para a pasta dos dados
  nuvem: null, // dados na nuvem (Sincronia de nuvem.js): no lugar da pasta, quando o site tem /api/
  anexos: null, // anexos na nuvem (pasta-nuvem.js); E.pasta vira a pasta virtual dele
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
// Sessão: o login fica lembrado neste navegador (todas as abas) por 12 horas sem uso, até clicar em Sair,
// e no máximo 7 dias desde o login (depois pede a senha de novo, mesmo em uso).
// Antes ficava só na aba (sessionStorage): cada aba nova (impressão, Ctrl+clique) pedia login de novo.
// Na versão sem internet (arquivo aberto do disco, file://) todos os arquivos HTML do computador compartilham o mesmo
// localStorage: ali a sessão fica só na aba (sessionStorage), para outro arquivo aberto no navegador não a ler.
// --------------------------------------------------------------------------
const SESSAO = 'imoveis-sessao';
const DURACAO_SESSAO = 12 * 3600 * 1000;
const LIMITE_SESSAO = 7 * 24 * 3600 * 1000;

const MAX_SESSOES = N.MAX_SESSOES; // por usuário (vários navegadores/computadores); na nuvem, o cofre junta as listas dos aparelhos

const deposito = () => (location.protocol === 'file:' ? sessionStorage : localStorage);

/** Sessão lembrada: { login, token, criada_em } ou null. O token é um número aleatório criado no login e guardado também no usuário do banco. */
function lerSessao() {
  try {
    const s = JSON.parse(deposito().getItem(SESSAO) || 'null');
    const valida = s && s.ate > Date.now() && s.login && s.token && s.criada_em && Date.now() - s.criada_em < LIMITE_SESSAO;
    return valida ? s : null;
  } catch {
    return null;
  }
}

function gravarSessao(loginTexto, token = null) {
  try {
    const atual = lerSessao();
    const mesma = atual && atual.login === loginTexto;
    const t = token || (mesma ? atual.token : null);
    if (loginTexto && t) {
      deposito().setItem(SESSAO, JSON.stringify({ login: loginTexto, token: t, ate: Date.now() + DURACAO_SESSAO, criada_em: token ? Date.now() : atual.criada_em }));
    } else deposito().removeItem(SESSAO);
  } catch { /* navegador sem armazenamento: pede login de novo */ }
}

const novoToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

/** O usuário é o dono deste e-mail do login da internet? (mesma regra de papelDe em nuvem/cofre.mjs: login ou e-mail, sem maiúsculas) */
export const usuarioDoEmail = (u, email) => [u.login, u.email].some((v) => String(v || '').toLowerCase() === String(email || '').toLowerCase());

/** Usuário da sessão lembrada, se ainda estiver ativo no banco e o token da sessão for dele. */
const usuarioDaSessao = () => {
  const s = lerSessao();
  return (E.d && s && E.d.usuarios.find((u) => u.login === s.login && u.ativo && !u.pendente && (u.sessoes || []).includes(s.token))) || null;
};

/** Registra no banco o token de uma sessão nova do usuário (fica fora do histórico). */
async function abrirSessao(u) {
  const token = novoToken();
  await alterar((db) => {
    const x = db.usuarios.find((y) => y.id === u.id);
    if (x) x.sessoes = [...(x.sessoes || []), token].slice(-MAX_SESSOES);
  }, { soSessao: true });
  E.usuario = E.d.usuarios.find((y) => y.id === u.id) || u;
  gravarSessao(u.login, token);
  ajustesParaNuvem();
  rotinaDeAbertura();
}

/**
 * Regras de negócio ao abrir (inativar quem saiu, "possui termo aditivo", caução completa pelos depósitos): antes rodavam caladas
 * em `normalizar`; desde a rotina C9 passam pelo histórico com o usuário logado (operador ou administrador). Só grava se há
 * o que ajustar; entra na fila de gravação como qualquer mudança.
 */
function rotinaDeAbertura() {
  if (!E.d || !pode(E.usuario, 'operador')) return;
  const quem = E.usuario.login;
  if (!R.rotinaDeAbertura(E.d, quem, { soConferir: true })) return;
  alterar((db) => R.rotinaDeAbertura(db, quem)).then(() => mostrar()).catch((e) => aviso(`Rotina de abertura: ${e.message}`, 'aviso'));
}

// Sair numa aba sai de todas; entrar numa aba vale para as outras.
window.addEventListener('storage', async (ev) => {
  if (ev.key !== SESSAO || !E.d) return;
  if (E.cofrinho && !lerSessao()) E.cofrinho.chave = null; // saiu em outra aba: esta também tranca a cópia
  // a outra aba acabou de gravar o token novo no banco: relê o disco antes de conferir
  try { E.d = E.nuvem ? E.nuvem.atual() : (await S.lerBanco(E.pasta)) || E.d; } catch { /* fica com o que está na memória */ }
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
let filaGravacao = Promise.resolve();
/** Uma gravação de cada vez: duas ao mesmo tempo (duplo clique, arrumações do Painel) sobrescreveriam uma à outra. */
export function alterar(fn, opcoes = {}) {
  const minha = filaGravacao.then(() => alterarAgora(fn, opcoes));
  filaGravacao = minha.catch(() => {});
  return minha;
}

/**
 * Nuvem: as correções que `normalizar` fez na cópia (campo ou tabela nova, migração) vão à nuvem uma vez, pelo administrador
 * (regra 3 do CLAUDE.md vale também na nuvem; elas mexem em config_banco e outros campos que só ele muda, SO_ADMIN do cofre).
 * Entra na fila de gravação, como qualquer outra mudança. Os outros só veem a correção na própria tela até o administrador entrar.
 */
function ajustesParaNuvem() {
  if (!E.nuvem || !pode(E.usuario, 'admin')) return;
  filaGravacao = filaGravacao.then(async () => {
    if (await E.nuvem.enviarAjustes()) { E.d = E.nuvem.atual(); atualizarFaixa(); }
  }).catch(() => {});
}

export const ERRO_ARQUIVO_SUMIU =`O arquivo ${S.ARQUIVO_BANCO} não está mais na pasta dos dados. Se o OneDrive criou uma cópia com outro nome (ex.: "imoveis-dados-NOME-DO-PC.json"), renomeie-a de volta para ${S.ARQUIVO_BANCO} e recarregue a página. Nada foi gravado.`;

/** A última gravação do arquivo foi só de entrada/saída de usuário (token de sessão): não é uma alteração dos dados. */
const soSessaoNoDisco = (disco) => disco.revisao_so_sessao === disco.revisao;

async function alterarAgora(fn, { soSessao = false } = {}) {
  if (E.nuvem) {
    // nuvem: compara antes e depois e manda só o que mudou (sem internet, fica na fila deste aparelho)
    const resultado = await E.nuvem.alterar(fn);
    E.d = E.nuvem.atual();
    espelharSeguro(); // segunda camada, fora do Cloudflare: a cópia cifrada no computador do administrador
    atualizarFaixa();
    return resultado;
  }
  const disco = await S.lerBanco(E.pasta);
  if (!disco && E.d) throw new Error(ERRO_ARQUIVO_SUMIU);
  if (disco && E.d && disco.revisao !== E.d.revisao) {
    const avisar = !soSessaoNoDisco(disco);
    E.d = disco;
    if (avisar) aviso(`Os dados foram atualizados por ${disco.atualizado_por || 'outra pessoa'} e recarregados antes de gravar.`, 'info');
  }
  const copia = N.copiar(E.d || disco); // o histórico (só cresce) não é copiado entrada por entrada
  const resultado = fn(copia);
  copia.revisao = (copia.revisao || 0) + 1;
  copia.revisao_so_sessao = soSessao ? copia.revisao : null;
  await S.gravarBanco(E.pasta, copia);
  E.d = copia;
  espelharSeguro();
  backupDoDia(copia);
  atualizarFaixa();
  return resultado;
}

/**
 * Pasta: o backup do dia (pasta backups) na primeira gravação do dia. Só fica marcado como feito depois de gravado; se falhar
 * (OneDrive ocupado…), o erro vai ao console e a próxima gravação tenta de novo (no máximo a cada 5 minutos).
 */
let backupDoDiaAndando = false; let backupDoDiaFalhouEm = 0;
function backupDoDia(dados) {
  if (E.backupFeito || backupDoDiaAndando || Date.now() - backupDoDiaFalhouEm < 300000) return;
  backupDoDiaAndando = true;
  S.backupDiario(E.pasta, dados)
    .then(() => { E.backupFeito = true; })
    .catch((e) => { backupDoDiaFalhouEm = Date.now(); logarErro(e); })
    .finally(() => { backupDoDiaAndando = false; });
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

let falhasDaChave = 0; let chaveTentadaEm = 0;
const ESPERA_CHAVE = 60000; // ms entre as tentativas de ler de novo a chave do backup seguro
const AVISAR_DEPOIS_DE = 3; // tentativas seguidas sem conseguir: avisa o administrador na tela

/**
 * Liga o backup seguro se este computador tem a pasta lembrada e a permissão (``pedir``: só com clique do usuário).
 * Chave que existe mas não deu para ler agora (OneDrive baixando, disco ocupado): fica "desconectado" (o botão Reconectar
 * tenta de novo), o motivo aparece para o administrador (seguroErro) e o sistema tenta sozinho a cada minuto
 * (tentarSeguroDeNovo); antes o backup desligava calado na sessão inteira.
 */
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
  chaveTentadaEm = Date.now();
  let chave;
  try {
    chave = await B.lerChave(h);
  } catch (e) {
    falhasDaChave += 1;
    E.seguro = { dir: h, desconectado: true, falhou: true };
    E.seguroErro = e.message;
    logarErro(e.causa || e);
    if (falhasDaChave === AVISAR_DEPOIS_DE && podeUsuario('admin')) aviso(`Backup seguro: ${e.message} Confira a pasta segura em Dados e backup.`, 'aviso');
    return false;
  }
  if (falhasDaChave) E.seguroErro = '';
  falhasDaChave = 0;
  E.seguro = chave ? { dir: h, chave } : null;
  return !!chave;
}

/** A chave do backup seguro falhou ao ler: tenta de novo (no máximo uma vez por minuto) e, se voltou, faz a cópia que faltou. */
function tentarSeguroDeNovo() {
  if (!E.seguro?.falhou || Date.now() - chaveTentadaEm < ESPERA_CHAVE) return;
  conectarSeguro(false).then((ok) => { if (ok) espelharSeguro(); }).catch(logarErro);
}

/**
 * Backup completo: o mesmo ZIP do "Exportar tudo", cifrado. `aoAndar` (opcional, botão "Fazer backup completo agora") recebe
 * { fase: 'esperando' } (outra cópia segura na fila), o andamento de `S.exportarZip` e, no fim, { fase: 'gravando' }.
 */
export function backupCompletoSeguro(aoAndar = () => {}) {
  aoAndar({ fase: 'esperando' });
  return naFilaSegura(async () => {
    if (!E.seguro || !E.seguro.chave || !E.pasta || !E.d) return;
    const JSZip = await jsZip();
    const zip = await S.exportarZip(JSZip, E.pasta, E.d, aoAndar);
    aoAndar({ fase: 'gravando' });
    await B.gravarCompleto(E.seguro.dir, E.seguro.chave, new Uint8Array(await zip.arrayBuffer()));
  });
}

/**
 * Versão PC na pasta do backup seguro: o programa inteiro num arquivo (gerado pelo GitHub a cada mudança na main), para abrir
 * o sistema se o site ou o Cloudflare caírem. A cada abertura com internet, confere a data de publicação e baixa só se mudou.
 */
export function atualizarProgramaSeguro() {
  return naFilaSegura(async () => {
    if (!E.seguro || !E.seguro.chave || window.VERSAO_OFFLINE) return;
    await B.gravarLeiaMe(E.seguro.dir);
    try {
      const cab = await fetch(B.CAMINHO_PROGRAMA, { method: 'HEAD', cache: 'no-cache' });
      const publicada = cab.ok ? (cab.headers.get('last-modified') || '') : '';
      if (!publicada || publicada === (await B.versaoDoPrograma(E.seguro.dir))) return;
      const r = await fetch(B.CAMINHO_PROGRAMA, { cache: 'no-cache' });
      if (r.ok) await B.gravarPrograma(E.seguro.dir, await r.text(), publicada);
    } catch { /* sem internet: fica a cópia anterior do programa */ }
  });
}

/**
 * Cópia cifrada do banco de hoje na pasta segura (se este computador tem o backup seguro ligado). Cada cópia cifra e grava o
 * banco inteiro: gravações seguidas (e mudanças de outros aparelhos) enquanto uma espera a vez viram uma só, com o banco do momento.
 */
const espelharUmaVez = B.espelhoSemAcumular(naFilaSegura, () => (E.seguro && E.seguro.chave && E.d ? B.espelhar(E.seguro.dir, E.seguro.chave, E.d) : undefined));
function espelharSeguro() {
  if (E.seguro?.falhou) { tentarSeguroDeNovo(); return; }
  if (E.seguro && E.seguro.chave && E.d) espelharUmaVez();
}

/**
 * Cópia aberta dos arquivos (copia-aberta.js): na nuvem, com o backup seguro ligado neste computador, os anexos vão sem cifrar
 * para "Arquivos dos imoveis" na pasta do backup seguro. Uma atualização por vez; `aoAndar` recebe { feitos, total }.
 */
let filaCopia = Promise.resolve();
export function atualizarCopiaAberta(aoAndar = () => {}) {
  const tarefa = filaCopia.then(async () => {
    if (!E.anexos || !E.seguro || !E.seguro.chave) return null;
    return CA.atualizarCopia(E.seguro.dir, {
      listar: () => E.anexos.listaCrua([S.PASTA_ARQUIVOS]),
      ler: (caminho) => E.anexos.ler([S.PASTA_ARQUIVOS, ...caminho.split('/')]),
      aoAndar,
    });
  });
  filaCopia = tarefa.catch(() => {});
  return tarefa;
}
/** Depois de anexar, apagar ou mover neste computador: atualiza a cópia aberta 20 s depois da última mudança. */
let copiaAgendada = null;
function agendarCopiaAberta() {
  clearTimeout(copiaAgendada);
  copiaAgendada = setTimeout(() => { atualizarCopiaAberta().catch(logarErro); }, 20000);
}

/** Ao abrir a pasta (ou a nuvem): cópia do banco do dia, a versão PC se houver mais nova e, se já passou uma semana, o backup completo. */
async function rotinaSegura() {
  if (!(await conectarSeguro(false)) || !E.d) return;
  espelharSeguro();
  atualizarProgramaSeguro();
  if (await B.completoPendente(E.seguro.dir)) backupCompletoSeguro();
}

/** Nuvem: terminou uma sincronia; `externo` = chegou mudança de outro aparelho (redesenha a tela). */
function aoMudarNuvem(externo) {
  if (!E.nuvem || !E.nuvem.atual()) return;
  E.d = E.nuvem.atual();
  renovarUsuario();
  atualizarFaixa();
  apagarAnexosConfirmados().catch((e) => console.error(e)); // anexos que esperavam a nuvem confirmar a exclusão (alterarApagandoAnexos, telas/comum.js)
  if (!externo) return;
  espelharSeguro(); // o que os outros aparelhos mudaram também entra na cópia segura deste computador
  E.anexos?.listas?.forEach((l) => { l.em = 0; }); // outro aparelho pode ter anexado ou apagado arquivos
  if (E.anexos) E.anexos.tudo = null;
  if (!E.usuario) return mostrar();
  const editando = document.querySelector(SELETOR_FORMULARIO);
  if (editando) aviso('Chegaram mudanças de outro aparelho. Ao salvar, sua alteração será aplicada sobre a versão nova.', 'info');
  else mostrar();
}

// Pasta: data e tamanho do arquivo do banco na última conferência que deixou a memória igual ao disco. Enquanto o arquivo
// continuar com a mesma data e o mesmo tamanho, a conferência (a cada 30 s e a cada volta à janela) não lê nem interpreta
// o banco inteiro de novo. A gravação do próprio sistema muda a data: a conferência seguinte lê uma vez e guarda a nova.
let arquivoConferido = null; // { pasta, assinatura }
let conferindo = false; // uma conferência por vez (foco + relógio + volta da internet chegam juntos)
async function verificarMudancasExternas() {
  tentarSeguroDeNovo(); // chave do backup seguro que não deu para ler: tenta de novo (no máximo uma vez por minuto)
  if (conferindo) return;
  conferindo = true;
  try { await conferirMudancasExternas(); } finally { conferindo = false; }
}
async function conferirMudancasExternas() {
  if (E.nuvem) {
    if (document.hidden) return;
    await E.nuvem.sincronizar().catch(() => {}); // aoMudar avisa
    if (E.anexos) {
      await E.anexos.enviarFila().catch(() => {});
      for (const t of E.anexos.avisos.splice(0)) aviso(t, 'aviso');
      atualizarFaixa();
    }
    return;
  }
  if (!E.pasta || !E.d || document.hidden) return;
  try {
    const pasta = E.pasta;
    if (arquivoConferido && arquivoConferido.pasta === pasta && arquivoConferido.assinatura === await S.assinaturaDoBanco(pasta)) return;
    const disco = await S.lerBanco(pasta);
    if (pasta !== E.pasta) return; // trocou de pasta no meio da leitura
    // a memória fica igual a este arquivo (já estava, ou passa a ser logo abaixo): guarda a data e o tamanho dele
    arquivoConferido = disco && S.assinaturaLida(disco) ? { pasta, assinatura: S.assinaturaLida(disco) } : null;
    if (disco && disco.revisao !== E.d.revisao) {
      const soSessao = soSessaoNoDisco(disco);
      E.d = disco;
      renovarUsuario();
      atualizarFaixa();
      if (soSessao) return; // alguém só entrou ou saiu: nada mudou nos dados
      const editando = document.querySelector(SELETOR_FORMULARIO);
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
  // 10 s para "Salvo." (6 s era pouco para quem lê devagar) e 15 s para avisos; com o mouse em cima, espera sair
  if (tipo !== 'erro') agendarFechar(m.id, tipo === 'aviso' ? 15000 : 10000);
}
function agendarFechar(id, ms) {
  setTimeout(() => {
    const el = typeof document.querySelector === 'function' ? document.querySelector(`#mensagens [data-msg="${id}"]`) : null;
    if (el && typeof el.matches === 'function' && el.matches(':hover')) agendarFechar(id, 3000);
    else fecharMensagem(id);
  }, ms);
}

/**
 * Pergunta de confirmação na janela do sistema (no lugar da caixa do navegador "localhost diz…"): ``texto`` com linhas
 * em branco vira parágrafos e linhas "• " viram lista; ``forte`` = vermelha, para o que apaga. Devolve true/false.
 */
export async function confirmar(texto, { titulo = '', sim = 'Confirmar', nao = 'Cancelar', forte = false } = {}) {
  const html = String(texto).split(/\n{2,}/).map((p) => {
    const linhas = p.split('\n');
    if (linhas.every((l) => /^\s*•/.test(l))) return `<ul>${linhas.map((l) => `<li>${esc(l.replace(/^\s*•\s*/, ''))}</li>`).join('')}</ul>`;
    return `<p>${linhas.map(esc).join('<br>')}</p>`;
  }).join('');
  return !!(await janela({ titulo, html, sim, nao, forte }));
}

/** Erro: janela no meio da tela com botão "Entendi" (a tela não sobe sozinha, então um aviso no topo passaria despercebido). */
/** Erro de programa vai ao console; o que o usuário digitou errado (senha, valor acima do limite, código curto) só aparece na tela. */
const logarErro = (e) => { if (!(e instanceof C.ErroUsuario) && !(e && e.esperado)) console.error(e); };

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

/**
 * Compactação de PDF escaneado (compactar.js): leva alguns segundos por página. Enquanto dura, uma mensagem no topo diz
 * o andamento ("página 3 de 10… Aguarde") e some sozinha no fim.
 */
let msgCompactar = null;
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('compactar-andamento', (ev) => {
    const { texto, fim } = ev.detail || {};
    if (fim || !texto) { if (msgCompactar) fecharMensagem(msgCompactar.id); msgCompactar = null; return; }
    if (!msgCompactar || !mensagens.includes(msgCompactar)) { msgCompactar = { id: proximaMensagem++, texto, tipo: 'info' }; mensagens.push(msgCompactar); }
    msgCompactar.texto = texto;
    desenharMensagens();
  });
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
    s.onerror = () => {
      // esquece a tentativa que falhou (ex.: sem internet): o próximo uso tenta de novo, sem precisar recarregar a página
      delete scripts[url];
      s.remove();
      erro(new Error('Não consegui carregar um componente do programa: confira a internet e tente de novo.'));
    };
    document.head.appendChild(s);
  });
  return scripts[url];
}
// Componentes de terceiros ficam dentro do programa (pasta vendor): não dependem de outro site.
// Na versão de arquivo único (sem internet) eles já vêm carregados e carregarScript só devolve o que existe.
export const excelJs = () => carregarScript('vendor/exceljs.min.js', 'ExcelJS');
export const jsZip = () => carregarScript('vendor/jszip.min.js', 'JSZip');
/** Só o jsPDF, para o PDF escrito direto (sem fotografar a tela): não baixa o html2canvas. */
export const jsPdf = async () => (await carregarScript('vendor/jspdf.umd.min.js', 'jspdf')).jsPDF;
export async function bibliotecasPdf() {
  const [h2c, jsPDF] = await Promise.all([carregarScript('vendor/html2canvas.min.js', 'html2canvas'), jsPdf()]);
  return { html2canvas: h2c, jsPDF };
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
  rotinaDeAbertura(); // login lembrado: as regras de abertura passam pelo histórico com esse usuário
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

const MODO_NUVEM = 'imoveis-modo-nuvem';
/** Tabelas do sistema (as listas de bancoVazio): na nuvem, cada uma ganha faixa de códigos mesmo antes do 1º registro. */
const TABELAS_DO_SISTEMA = Object.entries(R.bancoVazio()).filter(([k, v]) => Array.isArray(v) && k !== 'historico').map(([k]) => k);
/** Abre os dados da nuvem (cópia local + fila). Sem internet, abre a cópia deste aparelho. */
export async function abrirNuvem() {
  // cópia do aparelho cifrada (cofrinho.js): a chave só fica aberta durante o login lembrado
  const cru = N.guardarNoNavegador();
  E.cofrinho = new Cofrinho(cru);
  await E.cofrinho.daSessao(!!lerSessao());
  const guardar = guardarCifrado(cru, () => E.cofrinho.chave);
  E.nuvem = new N.Sincronia({ api: N.apiDoSite(), guardar, aoMudar: (externo) => aoMudarNuvem(externo), trava: N.travaDoNavegador, normalizar: R.normalizar, tabelas: TABELAS_DO_SISTEMA });
  E.anexos = new AnexosNuvem({ guardar });
  E.anexos.aoMudar = agendarCopiaAberta; // cópia aberta dos arquivos no computador do administrador
  // sem internet, neste computador: o anexo abre da cópia aberta (só precisa da pasta do backup seguro com permissão)
  E.anexos.daCopiaLocal = (partes) => (partes[0] === S.PASTA_ARQUIVOS && E.seguro?.dir ? CA.lerDaCopia(E.seguro.dir, partes.slice(1).join('/')) : null);
  E.pasta = E.anexos.raiz(); // anexos pela mesma interface da pasta do computador
  await E.anexos.carregarFila();
  // quem passou pelo login da internet (null sem internet). Não segura a abertura (com sinal fraco eram até 10 s de tela em branco,
  // com os dados já no aparelho): a resposta chega por trás e só o login com senha espera por ela (`entrar`)
  E.emailNuvem = null;
  E.saudeNuvem = N.saudeDaNuvem().then((s) => { E.emailNuvem = s?.email || null; return s; }).catch(() => null);
  try { localStorage.setItem(MODO_NUVEM, '1'); } catch { /* sem armazenamento */ }
  try {
    E.d = await E.nuvem.iniciar();
  } catch (e) {
    // trancado (sem login) e sem internet: só a lista de usuários, para entrar com a senha e destrancar a cópia
    const acesso = !E.cofrinho.chave && (await cru.ler('acesso'));
    if (!acesso) throw e;
    E.d = { ...R.bancoVazio(), usuarios: acesso };
  }
  // login lembrado sem a chave da cópia (ex.: entrou antes da cópia cifrada existir): pede a senha uma vez
  E.usuario = E.cofrinho.chave ? usuarioDaSessao() : null;
  ajustesParaNuvem(); // login lembrado: as correções vão sem passar por abrirSessao
  rotinaDeAbertura();
  await mostrar();
  if (E.d) rotinaSegura().catch((e) => { E.seguroErro = e.message; }); // backup seguro no computador do administrador, também na nuvem
}

/** Depois de substituir os dados (restaurar um backup da nuvem): registra a sessão de novo no banco novo, ou volta ao login. */
export async function reabrirSessao() {
  const u = E.usuario && E.d.usuarios.find((x) => x.login === E.usuario.login && x.ativo && !x.pendente);
  if (u) await abrirSessao(u);
  else { E.usuario = null; gravarSessao(null); }
}

/**
 * Entrou com a senha: abre a chave da cópia deste aparelho e relê o que estava guardado (fila, anexos sem internet). O banco
 * baixado com a cópia trancada (tela de login) é aproveitado e gravado agora (iniciar), em vez de baixar tudo de novo.
 */
async function destrancarNuvem(loginTexto, senha) {
  await E.cofrinho.entrar(loginTexto, senha, Date.now() + LIMITE_SESSAO);
  E.anexos.fila = null;
  await E.anexos.carregarFila();
  E.d = await E.nuvem.iniciar();
}

export async function reabrirPastaLembrada() {
  const h = await S.pastaLembrada();
  if (!h) return escolherPasta();
  if (!(await S.temPermissao(h, true))) return aviso('Sem permissão para a pasta. Escolha a pasta de novo.', 'erro');
  return abrirPasta(h);
}

export async function criarBanco(nome, loginTexto, senha) {
  const novo = E.d || R.bancoVazio();
  const u = R.inserir(novo, 'usuarios', { login: loginTexto, nome, papel: 'admin', ativo: true, ...(await camposDeSenha(senha)),
    criado_em: new Date().toISOString() }, loginTexto, 'Primeiro administrador criado');
  novo.revisao = (novo.revisao || 0) + 1;
  if (E.nuvem) { // nuvem vazia: primeira carga
    await E.cofrinho.entrar(loginTexto, senha, Date.now() + LIMITE_SESSAO);
    E.d = await E.nuvem.importar(novo);
  }
  else {
    await S.gravarBanco(E.pasta, novo);
    E.d = novo;
  }
  await abrirSessao(E.d.usuarios.find((x) => x.id === u.id) || u);
}

export async function entrar(loginTexto, senha) {
  const disco = E.nuvem ? (E.nuvem.atual() || E.d) : await S.lerBanco(E.pasta); // nuvem trancada sem internet: só a lista de usuários
  if (!disco) throw new Error(ERRO_ARQUIVO_SUMIU);
  E.d = disco;
  const u = E.d.usuarios.find((x) => x.login === loginTexto);
  // nuvem: o usuário do sistema tem de ser o mesmo do login da internet (a nuvem decide o que ele pode pelo e-mail)
  if (E.nuvem && E.saudeNuvem) await E.saudeNuvem; // a resposta do site sobre quem está no login da internet (pedida na abertura)
  if (u && E.nuvem && E.emailNuvem && !usuarioDoEmail(u, E.emailNuvem)) throw new C.ErroUsuario(`Você entrou na internet como ${E.emailNuvem}: use o usuário desse e-mail (ou saia do login da internet e entre com o outro).`);
  if (!(await conferirSenha(u, senha))) throw new C.ErroUsuario('Login ou senha incorretos.');
  if (u.pendente) throw new Error('Seu pedido de acesso ainda não foi aprovado pelo administrador.');
  if (!u.ativo) throw new Error('Este usuário está bloqueado. Fale com o administrador.');
  if (E.nuvem) await destrancarNuvem(u.login, senha);
  // senha gravada com o padrão antigo (menos iterações): regrava com o atual, já que a senha está em mãos
  const reforco = await reforcarSenha(u, senha);
  if (reforco) await alterar((db) => { const x = db.usuarios.find((y) => y.id === u.id); if (x) Object.assign(x, reforco); }, { soSessao: true }).catch(() => {});
  await abrirSessao(u);
}

/** Atualiza o usuário logado depois de alterar o cadastro dele (ou sai, se foi bloqueado). */
export function renovarUsuario() {
  if (!E.usuario) return;
  const u = E.d.usuarios.find((x) => x.id === E.usuario.id && x.ativo && !x.pendente) || null;
  E.usuario = u;
  gravarSessao(u && u.login);
}

export async function sair() {
  const s = lerSessao();
  const u = E.usuario;
  E.usuario = null;
  anexosVistos.clear(); // nomes dos anexos não ficam para o próximo que entrar
  gravarSessao(null);
  ir('#/');
  // o token desta sessão deixa de valer no banco (erro aqui não impede sair)
  if (s && u) await alterar((db) => { const x = db.usuarios.find((y) => y.id === u.id); if (x && x.sessoes) x.sessoes = x.sessoes.filter((t) => t !== s.token); }, { soSessao: true }).catch(() => {});
  if (E.nuvem && E.cofrinho) {
    // tenta mandar o que falta; tranca a cópia (a chave sai do aparelho) e, se não sobrou nada esperando, apaga a cópia
    await E.nuvem.sincronizar().catch(() => {});
    await E.anexos?.enviarFila().catch(() => {});
    const nada = !E.nuvem.pendentesQtd() && !(E.anexos?.fila?.length);
    await E.cofrinho.sair();
    if (nada) { await E.cofrinho.cru.apagar('base'); await E.cofrinho.cru.apagar('base-seq'); }
  }
}

// --------------------------------------------------------------------------
// Rotas e desenho da página
// --------------------------------------------------------------------------
function rotaAtual() {
  const [caminho, consulta] = (location.hash.slice(1) || '/').split('?');
  const partes = caminho.split('/').filter(Boolean);
  // parâmetros fora do formato esperado (ex.: comp=2026-01"><img…) são descartados: a tela usa o padrão
  return { partes, q: C.sanearParametros(Object.fromEntries(new URLSearchParams(consulta || ''))) };
}

function atualizarFaixa() {
  const el = document.getElementById('faixa');
  if (!el || !E.d) return;
  if (E.nuvem) {
    const n = E.nuvem.pendentesQtd() + (E.anexos?.fila?.length || 0); const cf = E.nuvem.conflitos.length; const rc = E.nuvem.recusas.length;
    const avisos = [cf && (podeUsuario('admin') ? `${cf} conflito(s) para escolher` : `${cf} conflito(s) esperando o administrador`), rc && `${rc} mudança(s) recusada(s)`, E.anexos?.naoEnviados?.length && `${E.anexos.naoEnviados.length} anexo(s) não enviado(s)`].filter(Boolean);
    el.innerHTML = `Dados na nuvem · ${n ? `<b>⏳ ${n} mudança(s) esperando ${E.nuvem.online ? 'envio' : 'internet'}</b>` : (E.nuvem.online ? '✓ tudo enviado' : 'sem internet')}`
      + `${avisos.length ? ` · <a href="#/conflitos"><b>⚠ ${avisos.join(' e ')}</b></a>` : ''}`
      + ` · Última atualização: <b>${E.d.atualizado_em ? C.dataHoraBr(E.d.atualizado_em) : 'nenhuma ainda'}</b>${E.d.atualizado_por ? ` por <b>${esc(E.d.atualizado_por)}</b>` : ''}`;
    return;
  }
  el.innerHTML = `Pasta dos dados: <b>${esc(E.pasta.name)}</b> · Última atualização: <b>${E.d.atualizado_em ? C.dataHoraBr(E.d.atualizado_em) : 'nenhuma ainda'}</b>${E.d.atualizado_por ? ` por <b>${esc(E.d.atualizado_por)}</b>` : ''} · tudo é salvo automaticamente na pasta${window.VERSAO_OFFLINE ? ` · versão sem internet de ${window.VERSAO_OFFLINE.split('-').reverse().join('/')}` : ''}`;
}

const MENU = [
  ['#/', 'Painel', '^$|^fechamento|^pendencias'], ['#/inquilinos', 'Inquilinos', '^inquilino|^contrato|^vistoria|^solicitacoes'],
  ['#/reajustes', 'Reajustes', 'reajustes'], ['#/cobrancas', 'Boletos', 'cobranca'], ['#/faturas', 'NF', 'fatura'], ['#/banco', 'Banco', '^banco'],
  ['#/imoveis', 'Imóveis', '^imove|^novo|^editar|^iptu$|^modelo-vistoria'], ['#/financeiro', 'Financeiro', '^financeiro|^resultados|^liquido|^contas|^impostos|^inadimplencia|^garantias'],
  ['#/dados', 'Dados e backup', '^dados|^historico|^modelos?-contrato|^modelos?-email|^regras|^backup|^empresas'],
];
/** Formulário (#/novo/<tabela>, #/editar/<tabela>/id) → item do menu que acende (antes todos acendiam "Imóveis"). */
const MENU_DO_FORMULARIO = {
  imoveis: 'imoveis', reformas: 'imoveis', iptus: 'imoveis', titularidades: 'imoveis', leituras: 'imoveis', participacoes: 'imoveis',
  contratos: 'inquilino', fiadores: 'inquilino', aplicacoes: 'inquilino', correcoes_garantia: 'inquilino', depositos_garantia: 'inquilino',
  devolucoes_garantia: 'inquilino', trocas_garantia: 'inquilino', renovacoes: 'inquilino', encerramentos: 'inquilino', correcoes: 'inquilino',
  solicitacoes: 'inquilino', ressarcimentos: 'inquilino', seguros: 'inquilino', fichas: 'inquilino', vistorias: 'inquilino', aditivos: 'inquilino',
  cobrancas: 'cobranca', avulsas: 'fatura', despesas: 'financeiro', ganhos_airbnb: 'financeiro', indices_acumulados: 'reajustes',
  emitentes: 'empresas', usuarios: 'usuarios',
};

/** Na nuvem, a aba e o "adicionar à tela de início" do iPhone usam o ícone escolhido (/api/icone-192.png; sem ele, o "ERP"). */
let versaoIcone = 0;
export function trocarIconeDaAba(nova = true) {
  if (nova) versaoIcone = Date.now();
  if (!E.nuvem) return;
  const href = `api/icone-192.png${versaoIcone ? `?v=${versaoIcone}` : ''}`;
  for (const l of document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')) if (l.getAttribute('href') !== href) l.setAttribute('href', href);
}

// Logo do topo: o texto data: (centenas de KB) não é colado de novo no HTML a cada desenho; vira um endereço blob: curto,
// refeito só quando a logo muda. Impressão, PDF e NF usam a logo por outro caminho (continuam com o data:).
const logoDoTopo = { texto: null, url: '' };
function enderecoDaLogo() {
  const logo = E.d.logo;
  if (typeof logo !== 'string' || !logo.startsWith('data:')) return logo || '';
  if (logoDoTopo.texto === logo) return logoDoTopo.url;
  if (logoDoTopo.url.startsWith('blob:')) URL.revokeObjectURL(logoDoTopo.url);
  let url = logo;
  try {
    const m = /^data:([^;,]*)(;base64)?,/.exec(logo);
    if (m && m[2]) {
      const bin = atob(logo.slice(m[0].length));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      url = URL.createObjectURL(new Blob([bytes], { type: m[1] || 'image/png' }));
    }
  } catch { url = logo; /* logo fora do padrão: vai como estava */ }
  logoDoTopo.texto = logo;
  logoDoTopo.url = url;
  return url;
}

function layout(conteudo, rota) {
  trocarIconeDaAba(false);
  // formulários (novo/editar) acendem o menu do assunto deles: contrato, fiador, saída... em Inquilinos; boleto em Boletos etc.
  const ehForm = ['novo', 'editar'].includes(rota.partes[0]);
  const deIptu = ehForm && rota.partes[1] === 'iptus' && rota.q.de === 'iptu';
  const atual = ehForm ? (deIptu ? 'iptu' : MENU_DO_FORMULARIO[rota.partes[1]] || '-') : TELAS[rota.partes[0] || 'painel'] ? rota.partes[0] || '' : '-';
  const menu = MENU.map(([h, t, m]) => `<a href="${h}" class="${(m && new RegExp(m).test(atual)) || (!m && !atual) ? 'ativo' : ''}">${t}</a>`).join('')
    + (podeUsuario('admin') ? `<a href="#/usuarios" class="${atual === 'usuarios' ? 'ativo' : ''}">Usuários${E.d.usuarios.some((u) => u.pendente) ? ` <span class="contador">${E.d.usuarios.filter((u) => u.pendente).length}</span>` : ''}</a>` : '');
  return `<a class="pular-conteudo nao-imprimir" href="#conteudo" data-pular>Pular para o conteúdo</a><header class="topo nao-imprimir">
      <a class="marca" href="#/">${E.d.logo ? `<img src="${esc(enderecoDaLogo())}" alt="Logo">` : ''}Administração de Imóveis</a>
      <button type="button" class="menu-botao" data-menu aria-label="Abrir ou fechar o menu" aria-expanded="false">☰ Menu</button><nav>${menu}</nav>
      <form data-form="ir" data-ir="buscar" class="busca-topo" role="search"><input name="q" type="search" maxlength="100" placeholder="Buscar…" aria-label="Buscar imóvel, inquilino, CPF, NF ou valor" value="${rota.partes[0] === 'buscar' ? esc(rota.q.q || '') : ''}"></form>
      <div class="conta">${esc(E.usuario.nome)}<br><a href="#/minha-senha">Trocar senha</a> · <a href="#" data-acao="sair">Sair</a></div>
    </header>
    <div class="faixa nao-imprimir" id="faixa"></div>
    <main id="conteudo" tabindex="-1"><div id="mensagens" class="nao-imprimir" role="status" aria-live="polite"></div>${conteudo}</main>`;
}

let paginaDesenhada = null;
/** Últimas listas de anexos mostradas (chave = data-arquivos), para a tela já abrir com elas. Fotos do anúncio ficam de fora (endereços temporários). */
const anexosVistos = new Map();
// clipes da matrícula e das guias do IPTU (listas curtas): guardados neste aparelho, para Imóveis e IPTU's já abrirem com eles
// mesmo logo depois de abrir o sistema (a conferência com a pasta ou a nuvem vem por trás e troca se mudou)
const CLIPES_GUARDADOS = 'clipes-vistos';
const ehClipe = (chave) => chave.startsWith('matricula:') || chave.endsWith(':clipe');
let clipesCarregados = null;
function carregarClipes() {
  const quem = E.usuario?.login || '';
  if (clipesCarregados === quem) return;
  clipesCarregados = quem;
  try {
    const salvo = JSON.parse(localStorage.getItem(CLIPES_GUARDADOS) || 'null');
    if (salvo?.quem === quem) for (const [k, v] of Object.entries(salvo.listas || {})) if (ehClipe(k) && !anexosVistos.has(k)) anexosVistos.set(k, v);
  } catch { /* navegador sem localStorage: abre como antes */ }
}
function guardarClipes() {
  try {
    const listas = Object.fromEntries([...anexosVistos].filter(([k]) => ehClipe(k)));
    localStorage.setItem(CLIPES_GUARDADOS, JSON.stringify({ quem: E.usuario?.login || '', listas }));
  } catch { /* sem espaço ou bloqueado: só não guarda */ }
}
let desenhos = 0; // quantas vezes a tela começou a ser desenhada (o envio de formulário sabe se a página vai ser trocada)
let subirAoTopo = false; // o endereço mudou (hashchange): o próximo desenho que chegar à tela começa do topo
export async function mostrar(estadoForm = null) {
  // dois desenhos ao mesmo tempo (dois cliques seguidos, mudança de outro aparelho no meio): só o último chega à tela
  desenhos += 1;
  const meu = desenhos;
  const app = document.getElementById('app');
  const rota = rotaAtual();
  try {
    let html;
    if (rota.partes[0] === 'restaurar-backup') html = await TELAS.restaurarBackup();
    else if (!S.suportado() && !E.teste && !E.nuvem) html = TELAS.semSuporte();
    else if (!E.pasta && !E.nuvem) html = await TELAS.inicio();
    else if (!E.d && E.pasta && (await S.copiasEmConflito(E.pasta).catch(() => [])).length) html = TELAS.arquivoSumiu(await S.copiasEmConflito(E.pasta));
    else if (!E.d || !E.d.usuarios.length) html = TELAS.primeiroAcesso();
    else if (!E.usuario) html = rota.partes[0] === 'pedir-acesso' ? TELAS.pedirAcesso() : TELAS.login();
    else {
      gravarSessao(E.usuario.login); // usar o sistema mantém o login lembrado
      const nome = rota.partes[0] || 'painel';
      const tela = TELAS[nome];
      const conteudo = tela ? await tela(rota, estadoForm) : TELAS._naoEncontrado('Página não encontrada');
      if (meu !== desenhos) return;
      html = rota.partes[0] === 'imprimir' ? `<div id="mensagens" class="nao-imprimir" role="status" aria-live="polite"></div>${conteudo}` : layout(conteudo, rota);
    }
    if (meu !== desenhos) return;
    // na mesma página, as caixas recolhíveis (<details id>) que estavam abertas continuam abertas depois de uma ação
    const endereco = location.hash.split('?')[0];
    const abertos = endereco === paginaDesenhada ? [...app.querySelectorAll('details[id][open]')].map((el) => el.id) : [];
    const fechados = endereco === paginaDesenhada ? [...app.querySelectorAll('details[id]:not([open])')].map((el) => el.id) : [];
    // redesenho da mesma página (ex.: chegou mudança de outro aparelho): a tela não pode encolher nem voltar ao topo.
    // Mantém a altura e as listas de anexos já mostradas até as novas chegarem, e devolve a posição da rolagem.
    const mesma = endereco === paginaDesenhada;
    // página nova (ou a mesma com outro filtro, pelo endereço) começa do topo já aqui, sem esperar as listas de anexos;
    // com ?ir= a própria tela rola até a caixa
    const subir = subirAoTopo && !rota.q.ir;
    subirAoTopo = false;
    const rolagem = mesma && !subir ? window.scrollY : 0;
    if (mesma && !subir) app.style.minHeight = `${app.offsetHeight}px`;
    else app.style.minHeight = '';
    if (!mesma) document.querySelector('.visualizador')?.fecharSemVoltar?.(); // anexo aberto por cima da página antiga
    app.innerHTML = html;
    // título da aba: o nome da tela (com várias abas abertas, ou no histórico do navegador, dá para saber qual é qual)
    const h1 = typeof app.querySelector === 'function' ? app.querySelector('h1') : null;
    const nomeTela = h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : '';
    document.title = nomeTela && nomeTela !== 'Administração de Imóveis' ? `${nomeTela.slice(0, 60)} · Imóveis` : 'Administração de Imóveis';
    ligarRotulos(app);
    if (subir) window.scrollTo(0, 0);
    // listas de anexos já vistas (nesta ou noutra visita à tela) aparecem na hora; montarExtras confere e troca se mudou
    if (E.usuario) carregarClipes();
    for (const el of app.querySelectorAll('[data-arquivos]')) if (anexosVistos.has(el.dataset.arquivos)) el.innerHTML = anexosVistos.get(el.dataset.arquivos);
    if (mesma && !subir) window.scrollTo(0, rolagem);
    paginaDesenhada = endereco;
    for (const id of abertos) { const el = document.getElementById(id); if (el?.tagName === 'DETAILS') el.open = true; }
    for (const id of fechados) { const el = document.getElementById(id); if (el?.tagName === 'DETAILS') el.open = false; }
    if (E.usuario && E.d) {
      // ordem das caixas escolhida pelo administrador (só ele vê o ícone ☰ para arrastar)
      const pagina = rota.partes[0] || 'painel';
      arrumarCaixas(app.querySelector('main'), pagina, (grupo) => R.ordemGuardada(E.d, pagina, grupo),
        podeUsuario('admin') ? (grupo, nomes) => alterar((db) => R.salvarOrdemCaixas(db, pagina, grupo, nomes, login())).catch((e) => aviso(e.message, 'erro')) : null);
      // páginas longas (inquilino, imóvel): índice embaixo do nome e botão para recolher cada caixa (lembrado neste navegador)
      montarIndice(app.querySelector('main'), pagina);
    }
    atualizarFaixa();
    desenharMensagens();
    mensagens = [];
    try { await montarExtras(app, () => meu === desenhos); } finally { if (meu === desenhos) app.style.minHeight = ''; }
    if (meu !== desenhos) return;
    // ?ir=secao rola a página até a caixa (ex.: alerta de IPTU leva à caixa do IPTU do imóvel).
    // Depois tira o ?ir= do endereço: assim o mesmo atalho funciona de novo e outras ações na página não pulam para a caixa.
    const alvo = rota.q.ir && document.getElementById(rota.q.ir);
    if (alvo?.tagName === 'DETAILS') alvo.open = true;
    if (alvo) alvo.scrollIntoView({ block: 'start' });
    if (rota.q.ir) history.replaceState(null, '', location.href.replace(/([?&])ir=[^&]*&?/, '$1').replace(/[?&]$/, ''));
  } catch (e) {
    logarErro(e);
    if (meu !== desenhos) return; // desenho antigo que falhou: a tela é do mais novo
    app.style.minHeight = '';
    paginaDesenhada = null; // a tela de erro não é a página: o próximo desenho não guarda rolagem nem caixas abertas dela
    app.innerHTML = `<main><div class="alerta erro">${esc(e.message)}</div><p><a href="#/" class="botao">Voltar ao painel</a></p></main>`;
  }
}

/**
 * Rótulos ligados aos campos (clicar no texto põe o cursor no campo; o leitor de tela diz o nome): o <label> sem ``for``
 * logo antes do campo ganha o ``for``; campo sem rótulo nenhum (filtros, mês, datas) ganha ``aria-label`` pelo texto de
 * exemplo ou pelo nome.
 */
const NOMES_DOS_CAMPOS = { de: 'De (data)', ate: 'Até (data)', usuario: 'Usuário', tabela: 'Tabela', texto: 'Texto', q: 'Buscar', comp: 'Mês', mes: 'Mês',
  numero: 'Número', data: 'Data', valor: 'Valor', ano: 'Ano', filtro: 'Mostrar', ordem: 'Ordem', senha_ponte: 'Senha da ponte', ambiente: 'Ambiente' };
let idsDeRotulo = 0;
function ligarRotulos(raiz) {
  if (typeof raiz.querySelectorAll !== 'function') return;
  for (const lb of raiz.querySelectorAll('label:not([for])')) {
    if (lb.querySelector('input, select, textarea')) continue;
    const campo = lb.nextElementSibling;
    if (!campo || !campo.matches('input:not([type=hidden]), select, textarea')) continue;
    if (!campo.id) { idsDeRotulo += 1; campo.id = `rotulo_${idsDeRotulo}`; }
    lb.htmlFor = campo.id;
  }
  for (const el of raiz.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')) {
    if ((el.labels && el.labels.length) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) continue;
    const base = String(el.name || '').replace(/_\d+$/, '');
    const nome = el.title || el.placeholder || NOMES_DOS_CAMPOS[el.name] || NOMES_DOS_CAMPOS[base] || (base ? base.replace(/_/g, ' ').replace(/^r /, 'Regra ') : '');
    if (nome) el.setAttribute('aria-label', nome);
  }
}

/** Partes que precisam ler a pasta depois de desenhadas: listas de arquivos e fotos. */
async function montarExtras(raiz, vivo = () => true) {
  // primeiro arruma as tabelas (cartões no celular) com o que já está na tela: não espera os anexos
  arrumarTabelas(raiz);
  // todas as listas de anexos ao mesmo tempo (na nuvem, uma de cada vez deixava a tela aparecendo aos poucos)
  let mudou = false; let clipesMudaram = false;
  // campos automáticos (CEP, desconto, prévias) funcionam já: não esperam as listas de anexos
  TELAS._ligarDesconto(raiz);
  const listas = [...raiz.querySelectorAll('[data-arquivos]')];
  // nuvem, tela com muitas listas (Imóveis, IPTU's): a árvore inteira dos anexos numa ida só, em vez de várias por imóvel
  if (E.nuvem && E.anexos?.carregarSeVelho && listas.filter((el) => !el.dataset.arquivos.startsWith('anuncio')).length >= 6) {
    await E.anexos.carregarSeVelho([S.PASTA_ARQUIVOS]).catch(() => {});
    if (!vivo()) return;
  }
  await Promise.all(listas.map(async (el) => {
    const chave = el.dataset.arquivos;
    const [escopo, id, modo] = chave.split(':');
    let html;
    try {
      html = await TELAS._listaArquivos(escopo, Number(id), modo);
    } catch (e) {
      // uma lista que falhou não derruba a tela: a mensagem fica só na caixa dela (e não é guardada)
      logarErro(e);
      if (el.isConnected && vivo()) el.innerHTML = `<span class="suave">Não consegui ler os arquivos desta lista (${esc(e.message)}).</span>`;
      return;
    }
    if (escopo !== 'anuncio') { if (ehClipe(chave) && anexosVistos.get(chave) !== html) clipesMudaram = true; anexosVistos.set(chave, html); }
    if (el.isConnected && el.innerHTML !== html) { el.innerHTML = html; mudou = true; }
  }));
  if (clipesMudaram) guardarClipes();
  if (!vivo()) return;
  if (mudou) arrumarTabelas(raiz); // a lista de anexos dentro de uma tabela pode ter deixado ela larga
}

/** Celular: tabelas que não cabem viram cartões (com o nome da coluna em cada valor); caixas com rolagem ganham o aviso. */
function arrumarTabelas(raiz) {
  encaixarFaturas(raiz);
  if (window.matchMedia?.('(max-width: 760px)').matches) cartoesNoCelular(raiz);
  // no celular, as tabelas largas viram cartões: cada célula mostra o nome da coluna (ver estilo.css, @media)
  for (const tabela of raiz.querySelectorAll('table.responsiva')) {
    const cabecalho = [...tabela.querySelectorAll('tr:first-child th')].map((th) => th.textContent.trim());
    for (const tr of tabela.querySelectorAll('tr')) {
      let k = 0;
      for (const td of tr.children) {
        if (td.tagName === 'TD' && cabecalho[k] && !td.dataset.rotulo && (td.colSpan || 1) === 1) td.dataset.rotulo = cabecalho[k];
        k += td.colSpan || 1;
      }
    }
  }
  // mede todas primeiro e só depois marca: medir e marcar uma a uma fazia o navegador recalcular a página a cada caixa
  const caixas = [...raiz.querySelectorAll('.rolagem')].map((caixa) => [caixa, caixa.scrollWidth > caixa.clientWidth + 2]);
  for (const [caixa, tem] of caixas) caixa.classList.toggle('tem-rolagem', tem);
}

/** Tabelas com desenho próprio (fatura, contrato, vistoria, boleto, cartas): continuam como estão no celular. */
const SEM_CARTOES = '.fatura-xls table, .ct-pagina, .ct-tabela, .grade-vistoria, .boleto-banco, .carta-tabela, .mapa-iptu, table.responsiva';

/**
 * Celular: a tabela que não cabe na largura da tela vira cartões (como as "responsiva"), em vez de rolar para o lado.
 * Só as que têm a 1ª linha de títulos (th), de onde saem os rótulos de cada valor.
 */
function cartoesNoCelular(raiz) {
  // primeiro mede todas (leituras), só depois aplica as classes (escritas): mudar uma tabela e medir a seguinte
  // obrigava o navegador a recalcular a página inteira a cada tabela
  const largas = [];
  for (const t of raiz.querySelectorAll('main table')) {
    if (t.matches(SEM_CARTOES) || t.closest('.fatura-xls, .demonstrativo')) continue;
    const primeira = t.rows[0];
    if (!primeira || !primeira.cells.length) continue;
    const caixa = t.parentElement;
    const larga = t.scrollWidth > (caixa?.clientWidth || window.innerWidth) + 2 || t.getBoundingClientRect().right > window.innerWidth + 2;
    if (larga) largas.push({ t, primeira });
  }
  for (const { t, primeira } of largas) {
    // com títulos: cartões com o nome da coluna; sem títulos (listas de tarefas): cada linha quebra para baixo
    if ([...primeira.cells].every((c) => c.tagName === 'TH')) t.classList.add('responsiva', 'cartoes-auto');
    else t.classList.add('linhas-celular');
  }
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
  const endereco = location.hash;
  const desenhosAntes = desenhos;
  // enviando: a troca de tela depois de salvar não pergunta "Sair sem salvar?"; se não salvou, a marca volta
  const alterado = !!form.dataset.alterado;
  delete form.dataset.alterado;
  try {
    const resposta = await FORMULARIOS[form.dataset.form](form, rotaAtual());
    if (resposta && resposta.erros) {
      // arquivo escolhido (ex.: comprovante da reserva): o redesenho do formulário o perdia sem avisar; volta ao campo novo
      const arquivos = typeof form.querySelectorAll === 'function'
        ? [...form.querySelectorAll('input[type=file]')].filter((i) => i.files && i.files.length && !i.dataset.acaoArquivo).map((i) => [i.name, i.files]) : [];
      await mostrar(resposta);
      const novo = typeof document.querySelector === 'function' ? document.querySelector(`main form[data-form="${form.dataset.form}"]`) : null;
      if (novo && novo.dataset) novo.dataset.alterado = '1';
      for (const [nome, files] of arquivos) {
        const el = novo && novo.querySelector(`input[type=file][name="${nome}"]`);
        if (!el) continue;
        try {
          el.files = files;
          el.insertAdjacentHTML('afterend', `<div class="ajuda">📎 Continua escolhido: ${esc(files[0].name)}</div>`);
        } catch { el.insertAdjacentHTML('afterend', '<div class="erro-campo">Escolha o arquivo de novo.</div>'); }
      }
      aviso(marcarCamposComErro(), 'erro');
    }
  } catch (e) {
    logarErro(e);
    aviso(e.message, 'erro');
    if (botao) botao.disabled = false;
  } finally {
    // saiu sem trocar de tela (ex.: "Cancelar" numa confirmação, arquivo só baixado): o botão volta a funcionar.
    // Se a tela vai ser desenhada de novo (ir/mostrar), fica apagado até a nova aparecer: não dá para enviar duas vezes.
    const ficou = location.hash === endereco && desenhos === desenhosAntes;
    if (botao?.isConnected && ficou) botao.disabled = false;
    if (alterado && ficou && form.isConnected) form.dataset.alterado = '1';
  }
});

/**
 * Formulário com erro: cada campo errado ganha aria-invalid e a mensagem ligada a ele; o cursor vai para o primeiro.
 * Devolve o texto da janela: quantos e quais campos corrigir ("2 campos para corrigir: Tipo de garantia, Dia do vencimento.").
 */
function marcarCamposComErro() {
  const caixas = typeof document.querySelectorAll === 'function' ? [...document.querySelectorAll('main .com-erro')] : [];
  const nomes = [];
  caixas.forEach((cx, k) => {
    const campo = cx.querySelector('input:not([type=hidden]), select, textarea');
    const msg = cx.querySelector('.erro-campo');
    if (campo) {
      campo.setAttribute('aria-invalid', 'true');
      if (msg) { msg.id = msg.id || `erro_${campo.name || k}`; campo.setAttribute('aria-describedby', msg.id); }
    }
    const rotulo = (cx.querySelector('label')?.textContent || '').replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim();
    if (rotulo && !nomes.includes(rotulo)) nomes.push(rotulo);
  });
  const primeiro = caixas[0]?.querySelector('input:not([type=hidden]), select, textarea');
  if (primeiro) {
    caixas[0].scrollIntoView({ block: 'center' });
    primeiro.focus({ preventScroll: true }); // ao fechar a janela do erro, o cursor volta para cá
  }
  if (!nomes.length) return 'Confira os campos destacados.';
  return `${nomes.length === 1 ? '1 campo para corrigir' : `${nomes.length} campos para corrigir`}: ${nomes.join(', ')}.`;
}

// --------------------------------------------------------------------------
// Formulário com mudança não salva (decisão do dono, 2026-11-16): trocar de tela (menu, Voltar, links, Sair) pergunta
// "Sair sem salvar?". A marca fica no próprio formulário (data-alterado): redesenhar a tela a tira junto.
// Não contam: o filtro e a busca (data-form="ir"), o login, marcar itens de uma lista e arquivo que já faz a ação.
// --------------------------------------------------------------------------
const NAO_ALTERA = 'input[type=file][data-acao-arquivo], input[name=ids], [data-marcar-grupo], [data-marcar-todas], [data-ordem-boletos], [data-sem-aviso], [data-lista-novo]';
function marcarAlterado(ev) {
  const el = ev.target;
  if (!el || typeof el.closest !== 'function' || el.closest(NAO_ALTERA)) return;
  const form = el.closest(SELETOR_FORMULARIO);
  if (form && form.dataset.form !== 'login') form.dataset.alterado = '1';
}
document.addEventListener('input', marcarAlterado);
document.addEventListener('change', marcarAlterado);
export const formularioAlterado = () => {
  const f = typeof document.querySelector === 'function' ? document.querySelector(`${SELETOR_FORMULARIO}[data-alterado]`) : null;
  return !!(f && f.dataset && f.dataset.alterado);
};

/** Há mudança não salva? Pergunta; quem escolhe sair perde o que digitou (a marca sai, para não perguntar de novo). */
export async function podeSairDaTela() {
  if (!formularioAlterado()) return true;
  const sair = await confirmar('Você mudou este formulário e ainda não salvou. Se sair agora, o que foi digitado se perde.',
    { titulo: 'Sair sem salvar?', sim: 'Sair sem salvar', nao: 'Continuar aqui', forte: true });
  if (sair) for (const f of document.querySelectorAll('[data-alterado]')) delete f.dataset.alterado;
  return sair;
}

// link para outra tela com o formulário alterado: pergunta antes (a tela não chega a trocar)
document.addEventListener('click', async (ev) => {
  const a = ev.target.closest?.('a[href^="#/"]');
  if (!a || a.target || a.dataset.acao || ev.ctrlKey || ev.metaKey || ev.shiftKey || !formularioAlterado()) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  const href = a.getAttribute('href');
  if (!(await podeSairDaTela())) return;
  if (href === location.hash) mostrar(); else location.hash = href;
}, true);

// "Pular para o conteúdo" (teclado): vai para a tela sem passar pelos 11 links do menu (sem mudar o endereço)
document.addEventListener('click', (ev) => {
  if (!ev.target.closest?.('[data-pular]')) return;
  ev.preventDefault();
  document.getElementById('conteudo')?.focus();
});

// fechar a aba ou recarregar com mudança não salva: o navegador pergunta
window.addEventListener('beforeunload', (ev) => {
  if (!formularioAlterado()) return;
  ev.preventDefault();
  ev.returnValue = '';
});

// datas: o ano tem 4 dígitos (sem o limite, o navegador aceita 6 e o 5º dígito não volta ao começo do ano)
document.addEventListener('focusin', (ev) => {
  const el = ev.target;
  if (el.tagName !== 'INPUT') return;
  if (el.type === 'date' && !el.max) el.max = '9999-12-31';
  if (el.type === 'month' && !el.max) el.max = '9999-12';
});

// Lista que cresce (depósitos anteriores do FCI): preencher a última linha cria outra em branco; o × tira a linha.
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
  const menu = ev.target.closest('[data-menu]');
  if (menu) {
    const topo = menu.closest('header.topo');
    const aberto = topo.classList.toggle('menu-aberto');
    menu.setAttribute('aria-expanded', String(aberto));
    return;
  }
  const el = ev.target.closest('[data-acao]');
  if (!el) return;
  ev.preventDefault();
  if (el.dataset.ocupado) return; // segundo clique enquanto a ação roda (ex.: "Gerar boletos" duas vezes)
  if (el.dataset.confirmar) {
    // janela do sistema (não a do navegador): vermelha no que apaga, com o botão dizendo a ação
    const apaga = el.classList.contains('perigo') || el.classList.contains('x-excluir');
    const rotulo = (el.textContent || '').trim();
    el.dataset.ocupado = '1';
    const ok = await confirmar(el.dataset.confirmar, { sim: rotulo && rotulo !== '×' && rotulo.length <= 40 ? rotulo : apaga ? 'Excluir' : 'Confirmar', forte: apaga });
    delete el.dataset.ocupado;
    if (!ok) return;
  }
  el.dataset.ocupado = '1';
  if (el.tagName === 'BUTTON') el.disabled = true;
  try {
    await ACOES[el.dataset.acao](el.dataset, el);
  } catch (e) {
    logarErro(e);
    aviso(e.message, 'erro');
  } finally {
    delete el.dataset.ocupado;
    if (el.tagName === 'BUTTON') el.disabled = false;
  }
});

document.addEventListener('change', async (ev) => {
  if (ev.target.matches('select[data-ordem-boletos]')) {
    // o atributo traz o endereço da lista atual (mês, filtro e busca) sem a ordem
    ir(`${ev.target.dataset.ordemBoletos}&ordem=${ev.target.value}`);
    return;
  }
  if (ev.target.matches('input[data-marcar-grupo]')) {
    ev.target.closest('form').querySelectorAll('input[name=ids]').forEach((x) => { x.checked = ev.target.checked; });
    return;
  }
  // caixa marcada mostra um campo (ex.: baixa em lote "pagaram atrasado, em" → a data)
  if (ev.target.matches('input[data-mostra]')) {
    ev.target.closest('form').querySelectorAll(`[data-grupo-mostra="${ev.target.dataset.mostra}"]`).forEach((x) => { x.hidden = !ev.target.checked; });
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
  // arquivo escolhido → ação: data-acao-arquivo="nome da ação" (anexar arquivos, comprovante, documento assinado, extrato OFX…);
  // os outros data-* do campo vão como dados da ação, como nos botões com data-acao
  const arquivo = ev.target.closest('input[data-acao-arquivo]');
  if (!arquivo || !arquivo.files.length || arquivo.dataset.ocupado) return;
  // enquanto a ação roda (enviar o anexo, ler o extrato) o campo fica travado: escolher outro arquivo no meio repetia a ação
  arquivo.dataset.ocupado = '1';
  try {
    const feito = ACOES[arquivo.dataset.acaoArquivo](arquivo.dataset, arquivo);
    arquivo.disabled = true; // depois de a ação começar (ela já leu os arquivos escolhidos)
    await feito;
  } catch (e) {
    logarErro(e);
    aviso(e.message, 'erro');
  } finally {
    delete arquivo.dataset.ocupado;
    arquivo.disabled = false;
    // campo que continua na página: fica vazio, para o mesmo arquivo poder ser escolhido de novo
    if (arquivo.isConnected) arquivo.value = '';
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
window.addEventListener('hashchange', async (ev) => {
  // Voltar do navegador (ou endereço digitado) com formulário alterado: pergunta; quem fica continua com o que digitou
  if (formularioAlterado() && !(await podeSairDaTela())) {
    if (ev && ev.oldURL) history.pushState(null, '', ev.oldURL);
    return;
  }
  subirAoTopo = true; // mostrar sobe logo depois de trocar a tela (antes subia só depois de esperar as listas de anexos)
  await mostrar();
});

// Link para o endereço em que já estamos (ex.: atalho clicado pela 2ª vez): o navegador não avisa a mudança, então desenhamos de novo.
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[href^="#/"]');
  if (!a || a.target || ev.ctrlKey || ev.metaKey || ev.shiftKey || a.getAttribute('href') !== location.hash) return;
  ev.preventDefault();
  mostrar();
});
window.addEventListener('focus', verificarMudancasExternas);
window.addEventListener('online', verificarMudancasExternas);
setInterval(verificarMudancasExternas, 30000);

(async function iniciar() {
  // aplicativo instalável: guarda as telas no aparelho para abrir sem internet (sw.js); não na versão de arquivo único
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  await carregarPonteLocal(); // endereço e senha da ponte do banco, só deste navegador
  if (E.teste) {
    await abrirPasta(await pastaDeTeste());
    return;
  }
  // site com a nuvem ligada (/api/ responde), ou que já abriu pela nuvem neste aparelho (sem internet agora)
  let lembrada = false;
  try { lembrada = localStorage.getItem(MODO_NUVEM) === '1'; } catch { /* sem armazenamento */ }
  if (location.protocol !== 'file:' && (lembrada || (await N.nuvemDisponivel()))) {
    try { await abrirNuvem(); } catch (e) {
      logarErro(e);
      document.getElementById('app').innerHTML = `<main><div class="alerta erro">${esc(e.message)}</div><p><a href="" class="botao">Tentar de novo</a></p></main>`;
    }
    return;
  }
  const h = S.suportado() ? await S.pastaLembrada() : null;
  if (h && (await S.temPermissao(h, false))) await abrirPasta(h);
  else await mostrar();
}());

export { C, R, S };
