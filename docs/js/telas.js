// Telas do sistema (HTML), formulários e ações dos botões.
import {
  E, alterar, aviso, baixar, criarBanco, entrar, escolherPasta, excelJs, ir, jsZip, login, mostrar, podeUsuario,
  reabrirPastaLembrada, sair,
} from './app.js';
import * as S from './armazenamento.js';
import { conferirSenha, novoSal, PAPEIS, resumoSenha } from './auth.js';
import * as C from './calculos.js';
import { faturaExcel, faturaHtml } from './fatura.js';
import * as F from './formularios.js';
import * as R from './regras.js';

const { esc } = F;
const { reais, dataBr, compBr, pct } = C;

// --------------------------------------------------------------------------
// Pequenos componentes
// --------------------------------------------------------------------------
const botao = (acao, texto, dados = {}, cls = 'secundario pequeno', confirmar = '') => `<button type="button" class="${cls}" data-acao="${acao}" ${Object.entries(dados).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} ${confirmar ? `data-confirmar="${esc(confirmar)}"` : ''}>${texto}</button>`;
const link = (hash, texto, cls = 'botao secundario pequeno') => `<a class="${cls}" href="${hash}">${texto}</a>`;
const etiqueta = (texto, tipo) => `<span class="etiqueta ${tipo}">${esc(texto)}</span>`;
const situacao = (s) => etiqueta(s, { 'Paga em dia': 'ok', 'Paga com atraso': 'aviso', 'Em aberto': 'neutra' }[s] || 'neutra');
const item = (rotulo, valor) => `<div><div class="rotulo">${esc(rotulo)}</div><div class="valor">${valor}</div></div>`;
const opera = () => podeUsuario('operador');
const d = () => E.d;
const buscar = (t, id) => R.buscar(E.d, t, id);
const ordenar = (lista, campo) => [...lista].sort((a, b) => String(a[campo] || '').localeCompare(String(b[campo] || ''), 'pt-BR'));
const competenciaPadrao = () => C.somarMeses(C.competenciaDe(C.hojeIso()), -1);
const endereco = (i) => [R.enderecoCompleto(i), i.bairro, i.cidade, i.cep ? `CEP ${i.cep}` : ''].filter(Boolean).join(' · ');

function multaJurosTexto(cb) {
  if (!cb.data_pagamento) return '';
  if (!cb.dias_atraso) return '<span class="suave">sem multa e juros</span>';
  return `Multa ${pct(cb.multa_percentual)} = <b>${reais(cb.multa)}</b><br>Juros ${pct(cb.juros_mensal_percentual)} a.m. × ${cb.dias_atraso} dias = <b>${reais(cb.juros)}</b>`;
}

function tabelaHistorico(lista) {
  const linhas = lista.map((h) => {
    let det = '';
    if (h.acao === 'Alteração' && h.detalhes) {
      det = Object.entries(h.detalhes).map(([k, m]) => (m && typeof m === 'object'
        ? `<div><code>${esc(k)}</code>: ${esc(m.de ?? '(vazio)')} → ${esc(m.para ?? '(vazio)')}</div>`
        : `<div><code>${esc(k)}</code>: ${esc(m)}</div>`)).join('');
    } else if (h.detalhes) {
      det = `<details><summary>ver</summary>${Object.entries(h.detalhes).map(([k, v]) => `<div><code>${esc(k)}</code>: ${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</div>`).join('')}</details>`;
    }
    return `<tr><td class="nw">${new Date(h.quando).toLocaleString('pt-BR')}</td><td>${esc(h.usuario)}</td>
      <td>${esc(h.acao)}${h.tabela ? ` · ${esc(R.TABELAS[h.tabela] || h.tabela)}` : ''}${h.descricao ? `<br><span class="suave">${esc(h.descricao)}</span>` : ''}</td>
      <td class="detalhes">${det}</td></tr>`;
  }).join('');
  return `<div class="rolagem"><table><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Detalhes</th></tr>${linhas || '<tr><td colspan="4" class="suave">Nada registrado ainda.</td></tr>'}</table></div>`;
}

const ultimos = (filtro, n = 40) => d().historico.filter(filtro).slice(-n).reverse();

// --------------------------------------------------------------------------
// Pastas de arquivos
// --------------------------------------------------------------------------
export const SUB_DOCS = 'Documentos do imóvel';
export const SUB_ANUNCIO = 'Anúncio';

export function nomePastaContrato(c) {
  const fmt = (x) => (x ? dataBr(x).replace(/\//g, '-') : '-');
  return S.limparNome(`${c.inquilino_nome} (${fmt(c.data_entrada)} a ${fmt(c.data_saida)})`);
}

async function pastaDoEscopo(escopo, id) {
  const raiz = await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true });
  if (escopo === 'contrato') {
    const c = buscar('contratos', id);
    const i = buscar('imoveis', c.imovel_id);
    return S.subpasta(raiz, [i.pasta || i.nome, c.pasta || nomePastaContrato(c)]);
  }
  const i = buscar('imoveis', id);
  return S.subpasta(raiz, [i.pasta || i.nome, escopo === 'anuncio' ? SUB_ANUNCIO : SUB_DOCS]);
}

function caixaArquivos(escopo, id, titulo, ancora, ajuda = '') {
  return `<div class="cartao" id="${ancora}"><h2>${esc(titulo)}</h2>${ajuda ? `<p class="suave">${esc(ajuda)}</p>` : ''}
    <div data-arquivos="${escopo}:${id}"><p class="suave">Carregando…</p></div>
    ${opera() ? `<label class="botao secundario pequeno enviar">Anexar arquivos<input type="file" multiple data-upload="${escopo}:${id}" ${escopo === 'anuncio' ? 'accept="image/*"' : ''}></label>` : ''}</div>`;
}

const urls = [];
async function listaArquivos(escopo, id) {
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const dir = await pastaDoEscopo(escopo, id);
  const itens = await S.listar(dir);
  if (!itens.length) return `<p class="suave">${escopo === 'anuncio' ? 'Nenhuma foto ainda.' : 'Nenhum arquivo ainda.'}</p>`;
  if (escopo === 'anuncio') {
    const figs = await Promise.all(itens.map(async (a) => {
      const u = URL.createObjectURL(await S.abrirArquivo(dir, a.nome));
      urls.push(u);
      return `<figure><a href="${u}" target="_blank"><img src="${u}" alt="${esc(a.nome)}"></a><figcaption><span>${esc(a.nome)}</span>${opera() ? botao('excluirArquivo', '×', { escopo, id, nome: a.nome }, 'perigo pequeno', 'Excluir esta foto?') : ''}</figcaption></figure>`;
    }));
    return `<div class="fotos">${figs.join('')}</div>`;
  }
  return `<table>${itens.map((a) => `<tr><td><a href="#" data-acao="abrirArquivo" data-escopo="${escopo}" data-id="${id}" data-nome="${esc(a.nome)}">${esc(a.nome)}</a></td>
    <td class="n suave">${Math.max(1, Math.round(a.tamanho / 1024))} KB</td>
    <td class="n">${botao('baixarArquivo', 'Baixar', { escopo, id, nome: a.nome })} ${opera() ? botao('excluirArquivo', 'Excluir', { escopo, id, nome: a.nome }, 'perigo pequeno', 'Excluir este arquivo?') : ''}</td></tr>`).join('')}</table>`;
}

/** Renomeia a pasta no disco quando o nome do imóvel ou do inquilino (datas) muda. */
async function renomearNoDisco(paiPartes, antigo, novo) {
  if (!antigo || antigo === novo) return;
  try {
    const raiz = await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true });
    await S.renomearPasta(await S.subpasta(raiz, paiPartes), antigo, novo);
  } catch (e) {
    aviso(`Não consegui renomear a pasta "${antigo}" para "${novo}": ${e.message}`, 'aviso');
  }
}

// --------------------------------------------------------------------------
// Telas de abertura
// --------------------------------------------------------------------------
export const TELAS = {
  _listaArquivos: listaArquivos,

  _ligarDesconto(raiz) {
    const pctEl = raiz.querySelector('[data-vinculo="desconto"][data-tipo="pct"]');
    const valEl = raiz.querySelector('[data-vinculo="desconto"][data-tipo="dinheiro"]');
    if (!pctEl || !valEl) return;
    const form = pctEl.closest('form');
    const aluguel = raiz.querySelector('[name=aluguel_inicial]');
    const base = () => (form.dataset.base ? Number(form.dataset.base) : (() => { try { return C.centavos(aluguel.value); } catch { return NaN; } })());
    const num = (t) => { try { return C.numero(t); } catch { return NaN; } };
    const cent = (t) => { try { return C.centavos(t); } catch { return NaN; } };
    pctEl.addEventListener('input', () => {
      const b = base(); const p = num(pctEl.value);
      valEl.value = Number.isFinite(b) && Number.isFinite(p) && pctEl.value !== '' ? F.dinheiroTexto(C.descontoPorPercentual(b, p)) : '';
    });
    valEl.addEventListener('input', () => {
      const b = base(); const v = cent(valEl.value);
      pctEl.value = Number.isFinite(b) && b && Number.isFinite(v) && valEl.value !== '' ? F.pctTexto(C.percentualPorDesconto(b, v)) : '';
    });
    if (aluguel && !form.dataset.base) aluguel.addEventListener('input', () => pctEl.dispatchEvent(new Event('input')));
    if (pctEl.value !== '') pctEl.dispatchEvent(new Event('input'));
  },

  semSuporte: () => `<main><div class="cartao login"><h1>Administração de Imóveis</h1>
    <div class="alerta aviso">Este navegador não consegue salvar numa pasta do computador. Abra este endereço no <b>Google Chrome</b> ou no <b>Microsoft Edge</b> (no computador, não no celular).</div></div></main>`,

  async inicio() {
    const lembrada = await S.pastaLembrada();
    return `<main><div id="mensagens"></div><div class="cartao login" style="max-width:560px">
      <h1>Administração de Imóveis</h1>
      <p>Os dados ficam numa pasta do seu computador, que pode estar dentro do <b>OneDrive</b> para sincronizar com outros computadores. Nada é guardado na internet.</p>
      ${lembrada ? `<p><button data-acao="reabrir">Abrir a pasta "${esc(lembrada.name)}"</button></p><p class="suave">ou</p>` : ''}
      <p><button class="${lembrada ? 'secundario' : ''}" data-acao="escolherPasta">Escolher a pasta dos dados</button></p>
      <p class="suave">Primeira vez? Crie uma pasta, por exemplo <b>OneDrive\\Imoveis</b>, e escolha ela. Para usar os mesmos dados em outro computador, escolha lá a mesma pasta do OneDrive.</p>
    </div></main>`;
  },

  primeiroAcesso: () => `<main><div id="mensagens"></div><div class="cartao login">
    <h1>Primeiro acesso</h1>
    <p class="suave">Pasta: <b>${esc(E.pasta.name)}</b>. Crie o usuário administrador. Depois ele cadastra os demais.</p>
    <form data-form="primeiroAcesso">
      <p><label>Seu nome</label><input name="nome" autofocus></p>
      <p><label>Login</label><input name="login" autocomplete="username"></p>
      <p><label>Senha (mínimo 6 caracteres)</label><input type="password" name="senha" autocomplete="new-password"></p>
      <p><label>Repita a senha</label><input type="password" name="senha2" autocomplete="new-password"></p>
      <button>Criar e entrar</button> ${botao('escolherPasta', 'Escolher outra pasta')}
    </form></div></main>`,

  login: () => `<main><div id="mensagens"></div><div class="cartao login">
    <h1>Administração de Imóveis</h1><p class="suave">Pasta: <b>${esc(E.pasta.name)}</b></p>
    <form data-form="login">
      <p><label>Login</label><input name="login" autofocus autocomplete="username"></p>
      <p><label>Senha</label><input type="password" name="senha" autocomplete="current-password"></p>
      <button>Entrar</button> ${botao('escolherPasta', 'Trocar de pasta')}
    </form></div></main>`,

  // ------------------------------------------------------------------------
  painel() {
    const hoje = C.hojeIso();
    const alertas = R.todosAlertas(d(), hoje);
    const pend = R.pendentesDeFatura(d());
    const abertas = d().cobrancas.filter((c) => c.situacao === 'Em aberto');
    const n = (v, t, h) => `<a class="cartao" href="${h}"><div class="grande">${v}</div>${t}</a>`;
    return `<h1>Painel</h1>
      <div class="numeros">
        ${n(d().imoveis.filter((i) => i.tipo !== 'airbnb').length, 'imóveis', '#/imoveis')}
        ${n(d().contratos.filter((c) => R.contratoAtivo(c, hoje)).length, 'contratos ativos', '#/imoveis')}
        ${n(abertas.length, 'cobranças em aberto', '#/cobrancas')}
        ${n(abertas.filter((c) => c.vencimento < hoje).length, 'em aberto e vencidas', '#/cobrancas')}
        ${n(pend.length, 'pagamentos aguardando nº de fatura', '#/faturas')}
      </div>
      <div class="cartao"><h2>Alertas</h2>
        ${alertas.map((a) => `<div class="alerta ${a.nivel}"><b>${esc(a.tipo)}</b> <a href="#/contrato/${a.contrato_id}">${esc(a.imovel)} · ${esc(a.inquilino)}</a>: ${esc(a.texto)}</div>`).join('') || '<p class="suave">Nenhum alerta no momento.</p>'}
      </div>
      <div class="cartao"><div class="cabecalho"><h2>Últimas alterações</h2><a href="#/historico">Ver histórico completo</a></div>
        ${tabelaHistorico(ultimos(() => true, 12))}
        <p class="suave">Banco criado em ${new Date(d().criado_em).toLocaleString('pt-BR')}.</p></div>`;
  },

  // ------------------------------------------------------------------------
  imoveis() {
    const hoje = C.hojeIso();
    const normais = ordenar(d().imoveis.filter((i) => i.tipo !== 'airbnb'), 'nome');
    const grupos = ordenar(d().imoveis.filter((i) => i.tipo === 'airbnb'), 'nome');
    const linhas = normais.map((i) => {
      const atual = d().contratos.filter((c) => c.imovel_id === i.id && R.contratoAtivo(c, hoje)).sort((a, b) => b.data_entrada.localeCompare(a.data_entrada))[0];
      const grupo = i.grupo_id ? buscar('imoveis', i.grupo_id) : null;
      return `<tr><td><a href="#/imovel/${i.id}"><b>${esc(i.nome)}</b></a>${grupo ? `<br>${etiqueta(grupo.nome, 'info')}` : ''}</td><td>${esc(R.enderecoCompleto(i))}</td>
        <td>${atual ? `<a href="#/contrato/${atual.id}">${esc(atual.inquilino_nome)}</a>${atual.inquilino_apelido ? ` <span class="suave">(${esc(atual.inquilino_apelido)})</span>` : ''}` : (grupo ? '<span class="suave">Airbnb</span>' : etiqueta('Vago', 'aviso'))}</td>
        <td class="n">${atual ? reais(R.aluguelAtual(d(), atual)) : '-'}</td></tr>`;
    }).join('');
    return `<div class="cabecalho"><h1>Imóveis</h1><div class="acoes">${opera() ? `${link('#/novo/imoveis', 'Novo imóvel', 'botao')} ${link('#/novo/imoveis?tipo=airbnb', 'Novo grupo Airbnb')}` : ''}</div></div>
      <div class="cartao rolagem"><table><tr><th>Imóvel</th><th>Endereço</th><th>Inquilino atual</th><th class="n">Aluguel atual</th></tr>
      ${linhas || '<tr><td colspan="4" class="suave">Nenhum imóvel cadastrado. Clique em "Novo imóvel".</td></tr>'}</table></div>
      ${grupos.length ? `<div class="cartao"><h2>Grupos Airbnb</h2><table><tr><th>Grupo</th><th>Cliente na fatura</th><th>Unidades</th></tr>
        ${grupos.map((g) => `<tr><td><a href="#/imovel/${g.id}"><b>${esc(g.nome)}</b></a></td><td>${esc(g.cliente_nome || '')}</td><td>${d().imoveis.filter((i) => i.grupo_id === g.id).map((i) => esc(i.nome)).join(', ') || '-'}</td></tr>`).join('')}</table></div>` : ''}`;
  },

  imovel(rota) {
    const i = buscar('imoveis', rota.partes[1]);
    if (!i) return '<h1>Imóvel não encontrado</h1>';
    return i.tipo === 'airbnb' ? telaGrupoAirbnb(i) : telaImovel(i);
  },

  contrato(rota) {
    const c = buscar('contratos', rota.partes[1]);
    if (!c) return '<h1>Contrato não encontrado</h1>';
    return telaContrato(c);
  },

  novo: (rota, estado) => telaFormulario(rota.partes[1], null, rota.q, estado),
  editar(rota, estado) {
    const r = buscar(rota.partes[1], rota.partes[2]);
    if (!r) return '<h1>Registro não encontrado</h1>';
    return telaFormulario(rota.partes[1], r, rota.q, estado);
  },

  cobrancas: (rota) => telaCobrancas(rota.q.comp || competenciaPadrao()),
  cobranca(rota) {
    const cb = buscar('cobrancas', rota.partes[1]);
    return cb ? telaCobranca(cb) : '<h1>Cobrança não encontrada</h1>';
  },
  faturas: (rota) => telaFaturas(rota.q.mes || C.competenciaDe(C.hojeIso())),
  imprimir: (rota) => telaImprimir(rota),
  empresas: () => telaEmpresas(),
  historico: (rota) => telaHistorico(rota.q),
  dados: () => telaDados(),
  usuarios() {
    if (!podeUsuario('admin')) return '<h1>Acesso só para administradores</h1>';
    return `<div class="cabecalho"><h1>Usuários</h1>${link('#/novo/usuarios', 'Novo usuário', 'botao')}</div>
      <div class="cartao"><table><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Situação</th><th></th></tr>
      ${ordenar(d().usuarios, 'nome').map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.login)}</td><td>${PAPEIS[u.papel]}</td><td>${u.ativo ? etiqueta('Ativo', 'ok') : etiqueta('Bloqueado', 'perigo')}</td><td class="n">${link(`#/editar/usuarios/${u.id}`, 'Editar')}</td></tr>`).join('')}</table>
      <p class="suave">Administrador: tudo, inclusive usuários e importação. Operador: cadastra, altera, confirma pagamentos e numera faturas. Consulta: só vê.</p></div>`;
  },
  'minha-senha': () => `<div class="cartao login"><h1>Trocar minha senha</h1><form data-form="minhaSenha">
    <p><label>Senha atual</label><input type="password" name="atual"></p>
    <p><label>Nova senha</label><input type="password" name="nova"></p>
    <p><label>Repita a nova senha</label><input type="password" name="nova2"></p><button>Salvar</button></form></div>`,
};

// --------------------------------------------------------------------------
// Imóvel
// --------------------------------------------------------------------------
function caixaEmpresas(i) {
  const partes = R.participacoesDo(d(), i.id);
  const soma = partes.reduce((s, p) => s + p.percentual, 0);
  const emitentes = d().emitentes.filter((e) => e.ativo);
  return `<div class="cartao" id="empresas"><h2>Empresas que emitem a fatura</h2>
    <table><tr><th>Empresa</th><th class="n">Percentual</th><th></th></tr>
    ${partes.map((p) => { const e = buscar('emitentes', p.emitente_id); return `<tr><td>${esc(e.nome)} · ${esc(e.razao_social)}</td><td class="n">${pct(p.percentual)}</td><td class="n">${opera() ? botao('excluir', 'Remover', { tabela: 'participacoes', id: p.id }, 'perigo pequeno', 'Remover esta empresa do imóvel?') : ''}</td></tr>`; }).join('')
    || '<tr><td colspan="3" class="suave">Nenhuma empresa definida. Sem isso não é possível numerar as faturas.</td></tr>'}
    ${partes.length ? `<tr class="total"><td>Total</td><td class="n">${pct(soma)}</td><td></td></tr>` : ''}</table>
    ${partes.length && Math.abs(soma - 100) > 1e-9 ? '<div class="alerta perigo">Os percentuais precisam somar 100%.</div>' : ''}
    ${opera() ? (emitentes.length ? `<form data-form="participacao" data-imovel="${i.id}" class="acoes" style="margin-top:10px">
      <select name="emitente_id" style="max-width:300px">${emitentes.map((e) => `<option value="${e.id}">${esc(e.nome)}</option>`).join('')}</select>
      <input name="percentual" value="50" style="width:90px" inputmode="decimal"> % <button class="pequeno">Adicionar / alterar</button></form>`
    : '<p class="suave">Cadastre as empresas em <a href="#/empresas">Empresas</a>.</p>') : ''}</div>`;
}

function telaImovel(i) {
  const hoje = C.hojeIso();
  const contratos = d().contratos.filter((c) => c.imovel_id === i.id).sort((a, b) => b.data_entrada.localeCompare(a.data_entrada));
  const iptus = d().iptus.filter((p) => p.imovel_id === i.id).sort((a, b) => b.ano - a.ano);
  const tits = d().titularidades.filter((t) => t.imovel_id === i.id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const grupo = i.grupo_id ? buscar('imoveis', i.grupo_id) : null;
  return `<div class="cabecalho"><h1>${esc(i.nome)}</h1><div class="acoes">
      ${opera() ? `${link(`#/novo/contratos?imovel=${i.id}`, 'Novo inquilino', 'botao')} ${link(`#/editar/imoveis/${i.id}`, 'Editar imóvel', 'botao secundario')}` : ''}
      ${podeUsuario('admin') ? botao('excluir', 'Excluir', { tabela: 'imoveis', id: i.id }, 'perigo', 'Excluir este imóvel? Os arquivos da pasta são mantidos.') : ''}</div></div>
    <div class="endereco">📍 ${esc(endereco(i))}</div>
    ${grupo ? `<div class="alerta info">Unidade do grupo <a href="#/imovel/${grupo.id}">${esc(grupo.nome)}</a>.</div>` : ''}
    <div class="cartao"><div class="grade">
      ${item('Matrícula', esc(i.matricula || '-'))}${item('Cartório', esc(i.cartorio || '-'))}${item('Inscrição IPTU', esc(i.inscricao_iptu || '-'))}
      ${item('UC Copel', esc(i.copel_uc || '-'))}${item('Matrícula Sanepar', esc(i.sanepar_matricula || '-'))}
      ${item('Condomínio', esc([i.condominio_nome, i.condominio_contato].filter(Boolean).join(' · ') || '-'))}
      ${item('Pasta de arquivos', esc(i.pasta || '-'))}</div>
      ${i.observacoes ? `<p class="pre">${esc(i.observacoes)}</p>` : ''}</div>
    <div class="cartao"><h2>Inquilinos deste imóvel</h2><div class="rolagem"><table>
      <tr><th>Inquilino</th><th>Entrada</th><th>Saída</th><th class="n">Aluguel atual</th><th>Situação</th></tr>
      ${contratos.map((c) => `<tr><td><a href="#/contrato/${c.id}"><b>${esc(c.inquilino_nome)}</b></a>${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}<br><span class="suave">📁 ${esc(c.pasta || nomePastaContrato(c))}</span></td>
        <td>${dataBr(c.data_entrada)}</td><td>${dataBr(c.data_saida)}</td><td class="n">${reais(R.aluguelAtual(d(), c))}</td>
        <td>${R.contratoAtivo(c, hoje) ? etiqueta('Atual', 'ok') : etiqueta('Encerrado', 'neutra')}</td></tr>`).join('') || '<tr><td colspan="5" class="suave">Nenhum inquilino cadastrado.</td></tr>'}
    </table></div></div>
    ${caixaEmpresas(i)}
    <div class="cartao" id="iptu"><div class="cabecalho"><h2>IPTU</h2>${opera() ? link(`#/novo/iptus?imovel=${i.id}`, 'Lançar IPTU do ano') : ''}</div>
      ${iptus.map((p) => { const ps = C.parcelas(p.valor_total, p.num_parcelas); return `<h3>${p.ano} · total ${reais(p.valor_total)} em ${p.num_parcelas} parcela(s) ${opera() ? `${link(`#/editar/iptus/${p.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'iptus', id: p.id }, 'perigo pequeno', 'Excluir o IPTU deste ano?')}` : ''}</h3>
        <div class="rolagem"><table><tr>${ps.map((_, n) => `<th class="n">${n + 1}ª · ${compBr(C.somarMeses(p.primeira_competencia, n))}</th>`).join('')}</tr><tr>${ps.map((v) => `<td class="n">${reais(v)}</td>`).join('')}</tr></table></div>`; }).join('') || '<p class="suave">Nenhum IPTU lançado.</p>'}</div>
    <div class="cartao" id="titularidade"><div class="cabecalho"><h2>Troca de titularidade (Copel, Sanepar, Supergasbras, condomínio)</h2>${opera() ? link(`#/novo/titularidades?imovel=${i.id}`, 'Registrar protocolo') : ''}</div>
      <div class="rolagem"><table><tr><th>Data</th><th>Concessionária</th><th>Tipo</th><th>Inquilino</th><th>Protocolo</th><th>Situação</th><th></th></tr>
      ${tits.map((t) => { const c = t.contrato_id ? buscar('contratos', t.contrato_id) : null; return `<tr><td>${dataBr(t.data)}</td><td>${esc(t.concessionaria)}</td><td>${esc(t.tipo || '-')}</td><td>${esc(c ? c.inquilino_nome : 'Proprietário')}</td><td><b>${esc(t.protocolo || '-')}</b></td><td>${esc(t.situacao || '-')}</td>
        <td class="n">${opera() ? `${link(`#/editar/titularidades/${t.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'titularidades', id: t.id }, 'perigo pequeno', 'Excluir este registro?')}` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="suave">Nenhum protocolo registrado.</td></tr>'}</table></div></div>
    <div class="cartao"><h2>Último anúncio</h2>${i.anuncio_link ? `<p><a href="${esc(i.anuncio_link)}" target="_blank" rel="noopener noreferrer">${esc(i.anuncio_link)}</a>${i.anuncio_data ? ` <span class="suave">· ${dataBr(i.anuncio_data)}</span>` : ''}</p>` : '<p class="suave">Nenhum link cadastrado (use "Editar imóvel").</p>'}</div>
    ${caixaArquivos('anuncio', i.id, 'Fotos do último anúncio', 'anuncio')}
    ${caixaArquivos('imovel', i.id, 'Documentos do imóvel', 'documentos', 'Matrícula, cadastro do IPTU e outros documentos do imóvel.')}
    <div class="cartao"><h2>Histórico do imóvel</h2>${tabelaHistorico(ultimos((h) => h.imovel_id === i.id))}</div>`;
}

function telaGrupoAirbnb(g) {
  const unidades = ordenar(d().imoveis.filter((i) => i.grupo_id === g.id), 'nome');
  const recs = d().recebimentos.filter((r) => r.imovel_id === g.id).sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento));
  return `<div class="cabecalho"><h1>${esc(g.nome)} ${etiqueta('Airbnb', 'info')}</h1><div class="acoes">
      ${opera() ? `${link(`#/novo/recebimentos?imovel=${g.id}`, 'Lançar recebimento', 'botao')} ${link(`#/editar/imoveis/${g.id}`, 'Editar grupo', 'botao secundario')}` : ''}
      ${podeUsuario('admin') ? botao('excluir', 'Excluir', { tabela: 'imoveis', id: g.id }, 'perigo', 'Excluir este grupo?') : ''}</div></div>
    <div class="endereco">📍 ${esc(endereco(g))}</div>
    <div class="cartao"><div class="grade">${item('Cliente na fatura', esc(g.cliente_nome || '-'))}${item('CPF / CNPJ', esc(g.cliente_documento || '-'))}${item('Telefone', esc(g.cliente_telefone || '-'))}${item('Endereço do cliente', esc(g.cliente_endereco || 'endereço da unidade'))}</div></div>
    <div class="cartao"><h2>Unidades do grupo</h2>
      <p>${unidades.map((u) => `<a href="#/imovel/${u.id}">${esc(u.nome)}</a>`).join(' · ') || '<span class="suave">Nenhuma unidade. Em cada imóvel, use "Editar imóvel" e escolha este grupo.</span>'}</p></div>
    ${caixaEmpresas(g)}
    <div class="cartao"><h2>Recebimentos</h2><p class="suave">Cada recebimento entra na sequência das faturas pela data em que o dinheiro entrou.</p>
      <div class="rolagem"><table><tr><th>Entrou em</th><th>Unidade</th><th>Período</th><th>Cliente</th><th class="n">Valor</th><th>Fatura</th><th></th></tr>
      ${recs.map((r) => { const fs = R.faturasDe(d(), 'recebimento', r.id); const u = r.unidade_id ? buscar('imoveis', r.unidade_id) : null; return `<tr><td>${dataBr(r.data_pagamento)}</td><td>${esc(u ? u.nome : '-')}</td>
        <td>${r.periodo_inicio ? `${dataBr(r.periodo_inicio)} a ${dataBr(r.periodo_fim)}` : '-'}</td><td>${esc(r.tomador_nome)}</td><td class="n">${reais(r.valor)}</td>
        <td>${fs.length ? link(`#/imprimir/faturas?numero=${fs[0].numero}`, `Nº ${R.numeroFatura(fs[0].numero)}`) : '<span class="suave">aguardando nº</span>'}</td>
        <td class="n">${opera() && !fs.length ? `${link(`#/editar/recebimentos/${r.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'recebimentos', id: r.id }, 'perigo pequeno', 'Excluir este recebimento?')}` : ''}${opera() && fs.length ? botao('cancelarRecebimento', 'Cancelar fatura', { id: r.id }, 'perigo pequeno', 'Cancelar a fatura deste recebimento? O número não será reaproveitado.') : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="suave">Nenhum recebimento lançado.</td></tr>'}
      </table></div></div>
    ${caixaArquivos('imovel', g.id, 'Documentos do grupo', 'documentos')}
    <div class="cartao"><h2>Histórico</h2>${tabelaHistorico(ultimos((h) => h.imovel_id === g.id))}</div>`;
}

// --------------------------------------------------------------------------
// Contrato / inquilino
// --------------------------------------------------------------------------
function telaContrato(c) {
  const i = buscar('imoveis', c.imovel_id);
  const hoje = C.hojeIso();
  const aluguel = R.aluguelAtual(d(), c);
  const desconto = C.descontoPorPercentual(aluguel, c.desconto_pontualidade_percentual);
  const alertas = R.contratoAtivo(c, hoje) ? R.alertasContrato(d(), c, hoje) : [];
  const cobs = d().cobrancas.filter((x) => x.contrato_id === c.id).sort((a, b) => b.competencia.localeCompare(a.competencia));
  const seguros = d().seguros.filter((s) => s.contrato_id === c.id).sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio));
  const tel = (c.inquilino_telefone || '').replace(/\D/g, '');
  return `<p class="suave"><a href="#/imovel/${i.id}">← ${esc(i.nome)}</a></p>
    <div class="cabecalho"><h1>${esc(c.inquilino_nome)}${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}</h1><div class="acoes">
      ${opera() ? link(`#/editar/contratos/${c.id}`, 'Editar', 'botao') : ''}
      ${podeUsuario('admin') ? botao('excluir', 'Excluir', { tabela: 'contratos', id: c.id }, 'perigo', 'Excluir este contrato e todas as suas cobranças?') : ''}</div></div>
    <div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>
    ${alertas.map((a) => `<div class="alerta ${a.nivel}"><b>${esc(a.tipo)}</b> ${esc(a.texto)}</div>`).join('')}
    <div class="cartao"><h2>Identificação e contato</h2><div class="grade">
      ${item('Telefone', `${esc(c.inquilino_telefone || '-')}${c.inquilino_whatsapp && tel ? ` <a class="etiqueta ok" target="_blank" rel="noopener" href="https://wa.me/${tel.length <= 11 ? `55${tel}` : tel}">WhatsApp</a>` : ''}`)}
      ${item('E-mail', c.inquilino_email ? `<a href="mailto:${esc(c.inquilino_email)}">${esc(c.inquilino_email)}</a>` : '-')}
      ${item('CPF / CNPJ', esc(c.inquilino_cpf || '-'))}${item('RG', esc(c.inquilino_rg || '-'))}
      ${c.responsavel_nome ? item('Outro contato', esc([c.responsavel_nome, c.responsavel_telefone, c.responsavel_email].filter(Boolean).join(' · '))) : ''}</div></div>
    <div class="cartao"><h2>Contrato e valores</h2><div class="grade">
      ${item('Entrada / saída', `${dataBr(c.data_entrada)} a ${dataBr(c.data_saida)}`)}${item('Vigência', `${dataBr(c.vigencia_inicio)} a ${dataBr(c.vigencia_fim)}`)}
      ${item('Aluguel inicial (histórico)', reais(c.aluguel_inicial))}${item('Aluguel atual', `<span class="maior">${reais(aluguel)}</span>`)}
      ${item('Desconto de pontualidade', `${pct(c.desconto_pontualidade_percentual)} = ${reais(desconto)}`)}${item('Aluguel com desconto', reais(aluguel - desconto))}
      ${item('Vencimento', `dia ${c.dia_vencimento} ${c.cobranca_mes_seguinte !== false ? 'do mês seguinte' : 'do próprio mês'}`)}${item('Taxa do boleto', reais(c.taxa_boleto))}
      ${item('Multa por atraso', pct(c.multa_percentual))}${item('Juros por atraso', `${pct(c.juros_mensal_percentual)} ao mês`)}
      ${item('Índice de correção', esc(c.indice_correcao || '-'))}${item('IPTU', c.cobrar_iptu ? 'cobrado do inquilino' : 'não cobrado')}</div></div>
    <div class="cartao"><h2>Garantia: ${esc(c.garantia_tipo || 'não informada')}</h2><div class="grade">
      ${c.caucao_valor ? `${item('Caução', `${reais(c.caucao_valor)} em ${dataBr(c.caucao_data)}`)}${item('Caução corrigida', c.caucao_valor_corrigido ? `${reais(c.caucao_valor_corrigido)} em ${dataBr(c.caucao_data_correcao)} (${esc(c.caucao_indice || 'índice não informado')})` : 'não corrigida')}` : ''}
      ${c.fiador_nome ? `${item('Fiador', esc(c.fiador_nome))}${item('CPF / RG do fiador', esc(`${c.fiador_cpf || '-'} / ${c.fiador_rg || '-'}`))}${item('Contato do fiador', esc([c.fiador_telefone, c.fiador_email].filter(Boolean).join(' · ') || '-'))}${item('Endereço do fiador', esc(c.fiador_endereco || '-'))}` : ''}</div>
      ${c.reserva_valor > 0 ? `<h3>Reserva dada na visita</h3><div class="grade">${item('Valor / data', `${reais(c.reserva_valor)} em ${dataBr(c.reserva_data)}`)}${item('Usar no aluguel de', `${compBr(R.competenciaReserva(c))}${c.reserva_competencia ? '' : ' (primeiro aluguel)'}`)}${item('Saldo ainda não usado', reais(R.saldoReserva(d(), c)))}</div>` : ''}
      ${c.observacoes ? `<h3>Observações</h3><p class="pre">${esc(c.observacoes)}</p>` : ''}</div>
    <div class="cartao"><div class="cabecalho"><h2>Histórico de correção do aluguel</h2>${opera() ? link(`#/novo/correcoes?contrato=${c.id}`, 'Registrar correção') : ''}</div>
      <table><tr><th>Vale a partir de</th><th>Índice</th><th class="n">%</th><th class="n">Valor anterior</th><th class="n">Novo valor</th><th></th></tr>
      <tr><td>${dataBr(c.vigencia_inicio)}</td><td colspan="3" class="suave">Valor inicial do contrato</td><td class="n">${reais(c.aluguel_inicial)}</td><td></td></tr>
      ${R.correcoesDo(d(), c.id).map((x) => `<tr><td>${dataBr(x.data_vigencia)}</td><td>${esc(x.indice || '-')}</td><td class="n">${pct(x.percentual)}</td><td class="n">${reais(x.valor_anterior)}</td><td class="n"><b>${reais(x.valor_novo)}</b></td><td class="n">${opera() ? botao('excluir', 'Excluir', { tabela: 'correcoes', id: x.id }, 'perigo pequeno', 'Excluir esta correção?') : ''}</td></tr>`).join('')}</table></div>
    <div class="cartao" id="seguros"><div class="cabecalho"><h2>Seguro obrigatório</h2>${opera() ? link(`#/novo/seguros?contrato=${c.id}`, 'Cadastrar apólice') : ''}</div>
      <div class="rolagem"><table><tr><th>Seguradora / apólice</th><th>Contratado em</th><th>Vigência</th><th class="n">Valor</th><th>Parcelas</th><th></th></tr>
      ${seguros.map((s) => `<tr><td>${esc(s.seguradora || '-')}<br><span class="suave">${esc(s.apolice || '')}</span></td><td>${dataBr(s.data_contratacao)}</td><td>${dataBr(s.vigencia_inicio)} a ${dataBr(s.vigencia_fim)}</td><td class="n">${reais(s.valor_total)}</td><td>${s.num_parcelas}x a partir de ${compBr(s.primeira_competencia)}</td>
        <td class="n">${opera() ? `${link(`#/editar/seguros/${s.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'seguros', id: s.id }, 'perigo pequeno', 'Excluir esta apólice?')}` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="suave">Nenhuma apólice cadastrada.</td></tr>'}</table></div></div>
    <div class="cartao"><h2>Cobranças</h2><div class="rolagem"><table><tr><th>Competência</th><th>Vencimento</th><th class="n">Valor pontual</th><th>Situação</th><th>Pago em</th><th>Multa e juros</th><th class="n">Valor NF</th><th>Fatura</th></tr>
      ${cobs.map((x) => { const fs = R.faturasDe(d(), 'cobranca', x.id); return `<tr><td><a href="#/cobranca/${x.id}">${compBr(x.competencia)}</a></td><td>${dataBr(x.vencimento)}</td><td class="n">${reais(R.totais(x).a_pagar_pontual)}</td><td>${situacao(x.situacao)}</td><td>${dataBr(x.data_pagamento)}</td><td>${multaJurosTexto(x)}</td><td class="n">${x.valor_nf !== null ? reais(x.valor_nf) : '-'}</td><td>${fs.length ? `Nº ${R.numeroFatura(fs[0].numero)}` : '-'}</td></tr>`; }).join('') || '<tr><td colspan="8" class="suave">Nenhuma cobrança gerada ainda. Gere na tela "Cobranças".</td></tr>'}</table></div></div>
    <div class="cartao"><div class="cabecalho"><h2>Trocas de titularidade deste inquilino</h2>${opera() ? link(`#/novo/titularidades?imovel=${i.id}&contrato=${c.id}`, 'Registrar protocolo') : ''}</div>
      <table><tr><th>Data</th><th>Concessionária</th><th>Tipo</th><th>Protocolo</th><th>Situação</th></tr>
      ${d().titularidades.filter((t) => t.contrato_id === c.id).map((t) => `<tr><td>${dataBr(t.data)}</td><td>${esc(t.concessionaria)}</td><td>${esc(t.tipo || '-')}</td><td><b>${esc(t.protocolo || '-')}</b></td><td>${esc(t.situacao || '-')}</td></tr>`).join('') || '<tr><td colspan="5" class="suave">Nenhum protocolo registrado.</td></tr>'}</table></div>
    ${caixaArquivos('contrato', c.id, `Arquivos do inquilino · 📁 ${c.pasta || nomePastaContrato(c)}`, 'arquivos', 'Contrato, vistoria de entrada e saída, apólices, notificações, documento de identificação etc.')}
    <div class="cartao"><h2>Histórico deste contrato</h2>${tabelaHistorico(ultimos((h) => h.contrato_id === c.id))}</div>`;
}

// --------------------------------------------------------------------------
// Formulários de cadastro
// --------------------------------------------------------------------------
const opcoesGrupos = () => ordenar(d().imoveis.filter((i) => i.tipo === 'airbnb'), 'nome').map((g) => [String(g.id), g.nome]);

const CADASTROS = {
  imoveis: {
    titulo: (r, q) => (r ? `Editar ${r.tipo === 'airbnb' ? 'grupo Airbnb' : 'imóvel'}` : (q.tipo === 'airbnb' ? 'Novo grupo Airbnb' : 'Novo imóvel')),
    campos: (r, q) => ((r ? r.tipo : q.tipo) === 'airbnb' ? F.GRUPO_AIRBNB
      : F.IMOVEL.map((c) => (c.nome === 'grupo_id' ? { ...c, opcoes: opcoesGrupos() } : c))),
    fixos: (r, q) => (r ? {} : { tipo: q.tipo === 'airbnb' ? 'airbnb' : 'normal' }),
    voltar: (r) => (r ? `#/imovel/${r.id}` : '#/imoveis'),
    descricao: (dados) => dados.nome,
    ajustar(dados, erros, r) {
      if (dados.grupo_id && r && dados.grupo_id === r.id) erros.grupo_id = 'Escolha outro grupo';
      dados.pasta = S.limparNome(dados.nome);
      if (d().imoveis.some((x) => x.id !== (r && r.id) && S.limparNome(x.nome) === dados.pasta)) erros.nome = 'Já existe um imóvel com este nome';
    },
    async depois(salvo, antigo) {
      if (antigo && antigo.pasta && antigo.pasta !== salvo.pasta) await renomearNoDisco([], antigo.pasta, salvo.pasta);
    },
  },
  contratos: {
    titulo: (r, q) => `${r ? 'Editar' : 'Novo'} inquilino / contrato - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: () => F.CONTRATO,
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    voltar: (r, q) => (r ? `#/contrato/${r.id}` : `#/imovel/${q.imovel}`),
    descricao: (dados, r) => dados.inquilino_nome || (r && r.inquilino_nome),
    base: (r) => (r ? R.aluguelAtual(d(), r) : null),
    ajustar(dados, erros, r, form) {
      const valorDesc = String(new FormData(form).get('desconto_pontualidade_valor') || '').trim();
      if (dados.desconto_pontualidade_percentual === null && valorDesc) {
        dados.desconto_pontualidade_percentual = C.percentualPorDesconto(r ? R.aluguelAtual(d(), r) : dados.aluguel_inicial, C.centavos(valorDesc));
      }
      for (const k of ['desconto_pontualidade_percentual', 'taxa_boleto', 'multa_percentual', 'juros_mensal_percentual', 'reserva_valor']) if (dados[k] === null) dados[k] = 0;
      if (dados.dia_vencimento !== null && (dados.dia_vencimento < 1 || dados.dia_vencimento > 31)) erros.dia_vencimento = 'Informe um dia entre 1 e 31';
      if (dados.data_saida && dados.data_entrada && dados.data_saida < dados.data_entrada) erros.data_saida = 'A saída não pode ser antes da entrada';
      dados.pasta = nomePastaContrato({ ...r, ...dados });
    },
    async depois(salvo, antigo) {
      const i = buscar('imoveis', salvo.imovel_id);
      if (antigo && antigo.pasta && antigo.pasta !== salvo.pasta) await renomearNoDisco([i.pasta || i.nome], antigo.pasta, salvo.pasta);
    },
  },
  correcoes: {
    titulo: (r, q) => `Correção do aluguel - ${buscar('contratos', q.contrato).inquilino_nome}`,
    campos: () => F.CORRECAO,
    fixos: (r, q) => ({ contrato_id: Number(q.contrato) }),
    padrao: (q) => ({ indice: buscar('contratos', q.contrato).indice_correcao || '' }),
    aviso: (r, q) => `Aluguel atual: ${reais(R.aluguelAtual(d(), buscar('contratos', q.contrato)))}`,
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    descricao: (dados, r, q) => `Correção do aluguel de ${buscar('contratos', q.contrato).inquilino_nome}`,
    ajustar(dados, erros, r, form, q) {
      const c = buscar('contratos', q.contrato);
      if (!dados.data_vigencia) return;
      const anterior = R.aluguelAtual(d(), c, C.somarDias(dados.data_vigencia, -1));
      dados.valor_anterior = anterior;
      if (dados.valor_novo === null && dados.percentual === null) erros.percentual = 'Informe o percentual ou o novo valor';
      else if (dados.valor_novo === null) dados.valor_novo = C.aplicarCorrecao(anterior, dados.percentual);
      else if (dados.percentual === null) dados.percentual = anterior ? C.percentualPorDesconto(anterior, dados.valor_novo - anterior) : 0;
    },
  },
  seguros: {
    titulo: (r, q) => `Seguro obrigatório - ${buscar('contratos', r ? r.contrato_id : q.contrato).inquilino_nome}`,
    campos: () => F.SEGURO,
    fixos: (r, q) => (r ? {} : { contrato_id: Number(q.contrato) }),
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}`,
    descricao: () => 'Seguro obrigatório',
  },
  iptus: {
    titulo: (r, q) => `IPTU - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: () => F.IPTU,
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    padrao: () => ({ ano: new Date().getFullYear() }),
    voltar: (r, q) => `#/imovel/${r ? r.imovel_id : q.imovel}`,
    descricao: (dados) => `IPTU ${dados.ano}`,
  },
  titularidades: {
    titulo: (r, q) => `Troca de titularidade - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: (r, q) => {
      const iid = r ? r.imovel_id : Number(q.imovel);
      const ops = d().contratos.filter((c) => c.imovel_id === iid).map((c) => [String(c.id), c.inquilino_nome]);
      return F.TITULARIDADE.map((c) => (c.nome === 'contrato_id' ? { ...c, opcoes: ops } : c));
    },
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    padrao: (q) => ({ contrato_id: q.contrato || '', situacao: 'Solicitado' }),
    voltar: (r, q) => (q.contrato ? `#/contrato/${q.contrato}` : `#/imovel/${r ? r.imovel_id : q.imovel}`),
    descricao: (dados) => `${dados.concessionaria} ${dados.protocolo || ''}`.trim(),
  },
  recebimentos: {
    titulo: (r, q) => `Recebimento Airbnb - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: (r, q) => {
      const gid = r ? r.imovel_id : Number(q.imovel);
      const ops = d().imoveis.filter((i) => i.grupo_id === gid).map((i) => [String(i.id), i.nome]);
      return F.RECEBIMENTO.map((c) => (c.nome === 'unidade_id' ? { ...c, opcoes: ops } : c));
    },
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    padrao: (q) => { const g = buscar('imoveis', q.imovel); return { data_pagamento: C.hojeIso(), tomador_nome: g.cliente_nome || '', tomador_documento: g.cliente_documento || '', tomador_telefone: g.cliente_telefone || '', tomador_endereco: g.cliente_endereco || '' }; },
    voltar: (r, q) => `#/imovel/${r ? r.imovel_id : q.imovel}`,
    descricao: (dados) => `Recebimento de ${reais(dados.valor)} em ${dataBr(dados.data_pagamento)}`,
    ajustar(dados, erros, r) {
      if (r && R.faturasDe(d(), 'recebimento', r.id).length) erros.valor = 'Já tem fatura emitida';
      if (!(dados.valor > 0)) erros.valor = 'Informe o valor';
    },
  },
  emitentes: {
    admin: true,
    titulo: () => 'Empresa emitente',
    campos: () => F.EMITENTE,
    voltar: () => '#/empresas',
    descricao: (dados) => dados.nome,
  },
  usuarios: {
    admin: true,
    titulo: (r) => (r ? 'Editar usuário' : 'Novo usuário'),
    campos: () => F.USUARIO,
    voltar: () => '#/usuarios',
    descricao: (dados) => `Usuário ${dados.login}`,
    extraHtml: (r) => `<div class="formulario" style="margin-top:12px"><div><label>${r ? 'Nova senha (em branco para manter)' : 'Senha inicial *'}</label><input type="password" name="senha" autocomplete="new-password"></div></div>`,
    async ajustarAsync(dados, erros, r, form) {
      dados.login = String(dados.login || '').toLowerCase();
      const senha = String(new FormData(form).get('senha') || '');
      if (senha) {
        if (senha.length < 6) erros.login = 'A senha precisa de pelo menos 6 caracteres';
        dados.senha_sal = novoSal();
        dados.senha_hash = await resumoSenha(senha, dados.senha_sal);
      } else if (!r) erros.login = 'Informe uma senha inicial';
      if (d().usuarios.some((u) => u.login === dados.login && u.id !== (r && r.id))) erros.login = 'Já existe um usuário com este login';
      if (r && r.id === E.usuario.id && (dados.papel !== 'admin' || !dados.ativo)) erros.papel = 'Você não pode tirar o seu próprio acesso de administrador';
      if (!r) dados.criado_em = new Date().toISOString();
    },
  },
  cobrancas: {
    titulo: (r) => `Alterar cobrança ${compBr(r.competencia)} - ${buscar('contratos', r.contrato_id).inquilino_nome}`,
    campos: () => F.COBRANCA,
    voltar: (r) => `#/cobranca/${r.id}`,
    descricao: () => 'Valores da cobrança alterados',
    ajustar(dados, erros, r) {
      if (r.data_pagamento) erros.vencimento = 'Desfaça o pagamento antes de alterar os valores';
      for (const k of ['desconto', 'iptu', 'seguro', 'taxa_boleto', 'outros', 'reserva_utilizada', 'multa_percentual', 'juros_mensal_percentual']) if (dados[k] === null) dados[k] = 0;
      const disp = R.saldoReserva(d(), buscar('contratos', r.contrato_id), r.id);
      if (dados.reserva_utilizada > disp) erros.reserva_utilizada = `Saldo da reserva disponível: ${reais(disp)}`;
    },
  },
};

function telaFormulario(tabela, registro, q, estado) {
  const cfg = CADASTROS[tabela];
  if (!cfg) return '<h1>Página não encontrada</h1>';
  if (!opera() || (cfg.admin && !podeUsuario('admin'))) return '<h1>Seu usuário não pode alterar este cadastro</h1>';
  const campos = cfg.campos(registro, q);
  let valores = estado ? estado.valores : F.paraFormulario(campos, registro);
  if (!registro && !estado) {
    const padroes = Object.fromEntries(campos.filter((c) => c.nome && c.padrao !== undefined).map((c) => [c.nome, c.padrao]));
    valores = F.paraFormulario(campos, { ...padroes, ...(cfg.padrao ? cfg.padrao(q) : {}) });
  }
  const base = cfg.base ? cfg.base(registro) : null;
  return `<h1>${esc(cfg.titulo(registro, q))}</h1>${cfg.aviso ? `<div class="alerta info">${esc(cfg.aviso(registro, q))}</div>` : ''}
    <form class="cartao" data-form="cadastro" ${base !== null && base !== undefined ? `data-base="${base}"` : ''}>
      ${F.camposHtml(campos, valores, estado ? estado.erros : {})}${cfg.extraHtml ? cfg.extraHtml(registro) : ''}
      <p class="acoes" style="margin-top:16px"><button>Salvar</button><a class="botao secundario" href="${cfg.voltar(registro, q)}">Voltar</a></p></form>`;
}

// --------------------------------------------------------------------------
// Cobranças do mês
// --------------------------------------------------------------------------
function telaCobrancas(comp) {
  const hoje = C.hojeIso();
  const lista = d().cobrancas.filter((x) => x.competencia === comp).map((cb) => {
    const c = buscar('contratos', cb.contrato_id);
    return { cb, c, i: buscar('imoveis', c.imovel_id), t: R.totais(cb), fs: R.faturasDe(d(), 'cobranca', cb.id) };
  }).sort((a, b) => a.i.nome.localeCompare(b.i.nome, 'pt-BR'));
  const faltando = d().contratos.filter((c) => C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0 && !lista.some((x) => x.c.id === c.id));
  const pend = R.pendentesDeFatura(d());
  const soma = (f) => lista.reduce((s, x) => s + f(x), 0);
  return `<div class="cabecalho"><h1>Cobranças de ${compBr(comp)}</h1>
      <div class="acoes"><a class="botao secundario" href="#/cobrancas?comp=${C.somarMeses(comp, -1)}">← ${compBr(C.somarMeses(comp, -1))}</a>
      <form data-form="irMes" class="acoes"><input type="month" name="comp" value="${comp}" style="width:160px"><button class="secundario">Ir</button></form>
      <a class="botao secundario" href="#/cobrancas?comp=${C.somarMeses(comp, 1)}">${compBr(C.somarMeses(comp, 1))} →</a></div></div>
    <p class="suave">Competência é o mês de uso do imóvel. Ao receber, informe a data do pagamento e clique em Confirmar. Depois, numere as faturas: a numeração segue a ordem das datas de pagamento.</p>
    ${faltando.length && opera() ? `<div class="alerta aviso">${faltando.length} contrato(s) ainda sem cobrança neste mês: ${faltando.map((c) => esc(c.inquilino_nome)).join(', ')}. ${botao('gerarCobrancas', `Gerar cobranças de ${compBr(comp)}`, { comp }, 'pequeno')}</div>` : ''}
    ${pend.length && opera() ? `<div class="alerta info">${pend.length} pagamento(s) aguardando número de fatura. ${botao('numerar', 'Numerar faturas agora', {}, 'pequeno')}</div>` : ''}
    <div class="cartao rolagem"><table class="cobrancas">
      <tr><th>Imóvel / inquilino</th><th>Vencimento</th><th class="n">Pontual</th><th class="n">Após vencimento</th><th>Pagamento</th><th>Multa e juros</th><th class="n">Valor NF</th><th>Fatura</th></tr>
      ${lista.map(({ cb, c, i, t, fs }) => `<tr>
        <td><a href="#/cobranca/${cb.id}"><b>${esc(i.nome)}</b></a><br>${esc(c.inquilino_nome)}
          ${cb.dias_cobrados < cb.dias_mes ? `<br>${etiqueta(`proporcional ${cb.dias_cobrados}/${cb.dias_mes} dias`, 'info')}` : ''}
          ${cb.reserva_utilizada > 0 ? `<br>${etiqueta(`usa reserva ${reais(cb.reserva_utilizada)}`, 'aviso')}` : ''}</td>
        <td>${dataBr(cb.vencimento)}${!cb.data_pagamento && cb.vencimento < hoje ? `<br>${etiqueta('vencida', 'perigo')}` : ''}</td>
        <td class="n">${reais(t.a_pagar_pontual)}</td>
        <td class="n suave">${reais(t.a_pagar_sem_desconto)}<br>+ multa ${pct(cb.multa_percentual)}<br>+ juros ${pct(cb.juros_mensal_percentual)} a.m.</td>
        <td>${cb.data_pagamento ? `${situacao(cb.situacao)}<br><span class="suave">em ${dataBr(cb.data_pagamento)}${cb.dias_atraso ? ` (${cb.dias_atraso} dias de atraso)` : ''}<br>recebido ${reais(cb.valor_pago)}</span>${opera() && !fs.length ? `<br>${botao('estornar', 'Desfazer', { id: cb.id }, 'secundario pequeno', 'Desfazer este pagamento?')}` : ''}`
          : (opera() ? `<form data-form="pagamento" data-id="${cb.id}" class="pagamento"><input type="date" name="data" value="${hoje}" title="Data em que o dinheiro entrou"><input name="valor" placeholder="valor pago" title="Opcional: valor efetivamente recebido" inputmode="decimal"><button class="pequeno">Confirmar</button></form>` : situacao(cb.situacao))}</td>
        <td>${multaJurosTexto(cb)}</td>
        <td class="n">${cb.valor_nf !== null ? reais(cb.valor_nf) : '-'}</td>
        <td>${fs.length ? link(`#/imprimir/faturas?numero=${fs[0].numero}`, `Nº ${R.numeroFatura(fs[0].numero)}`) : (cb.data_pagamento ? '<span class="suave">aguardando nº</span>' : '-')}</td></tr>`).join('')
      || `<tr><td colspan="8" class="suave">Nenhuma cobrança gerada para ${compBr(comp)}.</td></tr>`}
      ${lista.length ? `<tr class="total"><td colspan="2">Total</td><td class="n">${reais(soma((x) => x.t.a_pagar_pontual))}</td><td></td><td></td><td></td><td class="n">${reais(soma((x) => x.cb.valor_nf || 0))}</td><td></td></tr>` : ''}
    </table></div>
    ${lista.length ? `<div class="acoes"><a class="botao secundario" target="_blank" href="#/imprimir/demonstrativos?comp=${comp}">Imprimir demonstrativos do mês</a>
      <a class="botao secundario" href="#/faturas">Ver faturas</a></div>` : ''}`;
}

function demonstrativo(cb) {
  const c = buscar('contratos', cb.contrato_id);
  const i = buscar('imoveis', c.imovel_id);
  const t = R.totais(cb);
  const linha = (txt, v) => `<tr><td>${txt}</td><td class="n">${v}</td></tr>`;
  return `<div class="demonstrativo"><div class="cabecalho"><div><h2 style="margin:0">Demonstrativo de cobrança de aluguel</h2><div class="suave">Competência ${compBr(cb.competencia)}</div></div>
      <div style="text-align:right"><div class="suave">Vencimento</div><div class="maior"><b>${dataBr(cb.vencimento)}</b></div></div></div>
    <div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>
    <p><b>Inquilino:</b> ${esc(c.inquilino_nome)}${c.inquilino_cpf ? ` · CPF/CNPJ ${esc(c.inquilino_cpf)}` : ''}${c.inquilino_telefone ? ` · ${esc(c.inquilino_telefone)}` : ''}</p>
    <table><tr><th>Descrição</th><th class="n">Valor</th></tr>
      ${linha(`Aluguel${cb.dias_cobrados < cb.dias_mes ? ` proporcional: ${cb.dias_cobrados} de ${cb.dias_mes} dias de ${reais(cb.aluguel_mensal)}` : ''}`, reais(cb.aluguel))}
      ${cb.iptu ? linha(`IPTU${cb.iptu_parcela ? ` (${esc(cb.iptu_parcela)})` : ''}`, reais(cb.iptu)) : ''}
      ${cb.seguro ? linha(`Seguro obrigatório${cb.seguro_parcela ? ` (${esc(cb.seguro_parcela)})` : ''}`, reais(cb.seguro)) : ''}
      ${cb.taxa_boleto ? linha('Tarifa de emissão do boleto', reais(cb.taxa_boleto)) : ''}
      ${cb.outros ? linha(esc(cb.outros_descricao || 'Outros'), reais(cb.outros)) : ''}
      <tr class="total"><td>Total sem desconto</td><td class="n">${reais(t.total_sem_desconto)}</td></tr>
      ${cb.desconto ? linha('(-) Desconto de pontualidade, se pago até o vencimento', `- ${reais(cb.desconto)}`) : ''}
      ${cb.reserva_utilizada ? linha('(-) Reserva paga na visita, abatida neste mês', `- ${reais(cb.reserva_utilizada)}`) : ''}
      <tr class="total"><td>Valor a pagar até ${dataBr(cb.vencimento)}</td><td class="n maior">${reais(t.a_pagar_pontual)}</td></tr>
      <tr><td colspan="2" class="suave">Após o vencimento: ${reais(t.a_pagar_sem_desconto)} + multa de ${pct(cb.multa_percentual)} + juros de ${pct(cb.juros_mensal_percentual)} ao mês, pro rata dia.</td></tr></table>
    ${cb.data_pagamento ? `<p><b>Pago em ${dataBr(cb.data_pagamento)}</b>${cb.dias_atraso ? ` com ${cb.dias_atraso} dia(s) de atraso: multa ${pct(cb.multa_percentual)} = ${reais(cb.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(cb.juros)}` : ''} · recebido ${reais(cb.valor_pago)}</p>` : ''}
    ${cb.observacoes ? `<p class="pre">${esc(cb.observacoes)}</p>` : ''}</div>`;
}

function telaCobranca(cb) {
  const c = buscar('contratos', cb.contrato_id);
  const fs = R.faturasDe(d(), 'cobranca', cb.id, false);
  const validas = fs.filter((f) => f.situacao === 'Emitida');
  const sim = cb.data_pagamento ? null : C.liquidar(cb, C.hojeIso());
  return `<div class="nao-imprimir"><p class="suave"><a href="#/cobrancas?comp=${cb.competencia}">← Cobranças de ${compBr(cb.competencia)}</a> · <a href="#/contrato/${c.id}">${esc(c.inquilino_nome)}</a></p>
    <div class="cabecalho"><h1>Cobrança ${compBr(cb.competencia)} ${situacao(cb.situacao)}</h1><div class="acoes">
      <button class="secundario" data-acao="imprimir">Imprimir demonstrativo</button>
      ${opera() && !cb.data_pagamento ? `${link(`#/editar/cobrancas/${cb.id}`, 'Alterar valores', 'botao secundario')} ${botao('excluir', 'Excluir', { tabela: 'cobrancas', id: cb.id }, 'perigo', 'Excluir esta cobrança?')}` : ''}</div></div></div>
    ${demonstrativo(cb)}
    <div class="nao-imprimir"><div class="cartao"><h2>Pagamento</h2>
      ${cb.data_pagamento ? `<div class="grade">${item('Pago em', dataBr(cb.data_pagamento))}${item('Situação', `${esc(cb.situacao)}${cb.dias_atraso ? ` (${cb.dias_atraso} dias)` : ''}`)}
        ${item(`Multa (${pct(cb.multa_percentual)})`, reais(cb.multa))}${item(`Juros (${pct(cb.juros_mensal_percentual)} ao mês)`, reais(cb.juros))}
        ${item('Valor recebido', reais(cb.valor_pago))}${item('Valor da nota fiscal', `<span class="maior">${reais(cb.valor_nf)}</span>`)}</div>
        <p class="suave">Nota fiscal = ${cb.dias_atraso ? `aluguel ${reais(cb.aluguel)} + multa ${reais(cb.multa)} + juros ${reais(cb.juros)} (pagou atrasado, sem desconto)` : `aluguel ${reais(cb.aluguel)} - desconto ${reais(cb.desconto)} (pagou em dia)`}. IPTU, seguro e tarifa não entram.</p>
        ${opera() ? botao('estornar', 'Desfazer pagamento', { id: cb.id }, 'perigo pequeno', validas.length ? 'Desfazer o pagamento? A fatura será cancelada e o número não será reaproveitado.' : 'Desfazer o pagamento?') : ''}`
      : `<p>Se for pago hoje (${dataBr(C.hojeIso())}): <b>${reais(sim.valor_devido)}</b>${sim.pontual ? '' : ` (${sim.dias_atraso} dias de atraso: multa ${pct(cb.multa_percentual)} = ${reais(sim.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(sim.juros)})`} · nota fiscal ${reais(sim.valor_nf)}</p>
        ${opera() ? `<form data-form="pagamento" data-id="${cb.id}" class="pagamento"><label>Data do pagamento</label><input type="date" name="data" value="${C.hojeIso()}"><label>Valor pago (opcional)</label><input name="valor" inputmode="decimal"><button>Confirmar pagamento</button></form>` : ''}`}</div>
    <div class="cartao"><h2>Faturas</h2><table><tr><th>Nº</th><th>Empresa</th><th>Emissão</th><th>Período</th><th class="n">%</th><th class="n">Valor</th><th>Situação</th></tr>
      ${fs.map((f) => `<tr><td>${R.numeroFatura(f.numero)}</td><td>${esc(buscar('emitentes', f.emitente_id).nome)}</td><td>${dataBr(f.emissao)}</td><td>${dataBr(f.periodo_inicio)} a ${dataBr(f.periodo_fim)}</td><td class="n">${pct(f.percentual)}</td><td class="n">${reais(f.valor)}</td><td>${etiqueta(f.situacao, f.situacao === 'Emitida' ? 'ok' : 'perigo')}</td></tr>`).join('')
      || `<tr><td colspan="7" class="suave">${cb.data_pagamento ? 'Aguardando numeração (tela Faturas).' : 'Confirme o pagamento para gerar a fatura.'}</td></tr>`}</table>
      ${validas.length ? `<p class="acoes">${link(`#/imprimir/faturas?numero=${validas[0].numero}`, 'Ver / imprimir fatura', 'botao')} ${botao('excel', 'Baixar Excel', { numero: validas[0].numero })}</p>` : ''}</div></div>`;
}

// --------------------------------------------------------------------------
// Faturas
// --------------------------------------------------------------------------
function origemTexto(f) {
  if (f.origem_tipo === 'cobranca') {
    const cb = buscar('cobrancas', f.origem_id);
    return cb ? `<a href="#/cobranca/${cb.id}">Aluguel ${compBr(cb.competencia)}</a>` : 'Aluguel';
  }
  const r = buscar('recebimentos', f.origem_id);
  return r ? `<a href="#/imovel/${r.imovel_id}">Airbnb</a>` : 'Airbnb';
}

function agruparPorNumero(faturas) {
  const grupos = new Map();
  for (const f of faturas) {
    if (!grupos.has(f.numero)) grupos.set(f.numero, []);
    grupos.get(f.numero).push(f);
  }
  return [...grupos.entries()].sort((a, b) => a[0] - b[0]);
}

function telaFaturas(mes) {
  const pend = R.pendentesDeFatura(d());
  const ultima = R.ultimaFatura(d());
  const doMes = d().faturas.filter((f) => f.emissao.slice(0, 7) === mes);
  const grupos = agruparPorNumero(doMes);
  return `<div class="cabecalho"><h1>Faturas emitidas em ${compBr(mes)}</h1>
      <div class="acoes"><a class="botao secundario" href="#/faturas?mes=${C.somarMeses(mes, -1)}">← ${compBr(C.somarMeses(mes, -1))}</a>
      <form data-form="irMesFatura" class="acoes"><input type="month" name="mes" value="${mes}" style="width:160px"><button class="secundario">Ir</button></form>
      <a class="botao secundario" href="#/faturas?mes=${C.somarMeses(mes, 1)}">${compBr(C.somarMeses(mes, 1))} →</a></div></div>
    <div class="cartao"><h2>Pagamentos aguardando número</h2>
      <p class="suave">Última fatura: ${ultima ? `<b>Nº ${R.numeroFatura(ultima.numero)}</b> de ${dataBr(ultima.emissao)}` : 'nenhuma ainda'} · próximo número: <b>${R.numeroFatura(d().proxima_fatura)}</b>. A numeração segue a data em que o dinheiro entrou, e a data de emissão é a data do pagamento.</p>
      ${pend.length ? `<table><tr><th>Ordem</th><th>Pagamento em</th><th>Origem</th><th class="n">Valor da fatura</th></tr>
        ${pend.map((p, n) => { const b = R.baseDaFatura(d(), p.tipo, p.registro); return `<tr class="${ultima && p.data < ultima.emissao ? 'fora' : ''}"><td>${R.numeroFatura(d().proxima_fatura + n)}</td><td>${dataBr(p.data)}${ultima && p.data < ultima.emissao ? ` ${etiqueta('anterior à última fatura', 'perigo')}` : ''}</td><td>${esc(b.descricao)}</td><td class="n">${reais(b.valor)}</td></tr>`; }).join('')}</table>
        ${opera() ? `<p>${botao('numerar', 'Numerar estas faturas', {}, '')}</p>` : ''}`
      : '<p class="suave">Nenhum pagamento aguardando número.</p>'}</div>
    <div class="cartao rolagem"><table><tr><th>Nº</th><th>Emissão</th><th>Cliente</th><th>Origem</th><th>Empresas</th><th class="n">Total</th><th>Situação</th><th></th></tr>
      ${grupos.map(([n, fs]) => `<tr><td><b>${R.numeroFatura(n)}</b></td><td>${dataBr(fs[0].emissao)}</td><td>${esc(fs[0].tomador_nome)}</td><td>${origemTexto(fs[0])}</td>
        <td>${fs.map((f) => `${esc(buscar('emitentes', f.emitente_id).nome)}: ${reais(f.valor)}`).join('<br>')}</td><td class="n">${reais(fs.reduce((s, f) => s + f.valor, 0))}</td>
        <td>${etiqueta(fs[0].situacao, fs[0].situacao === 'Emitida' ? 'ok' : 'perigo')}</td>
        <td class="n nw">${fs[0].situacao === 'Emitida' ? `${link(`#/imprimir/faturas?numero=${n}`, 'Ver')} ${botao('excel', 'Excel', { numero: n })}` : ''}</td></tr>`).join('')
      || `<tr><td colspan="8" class="suave">Nenhuma fatura emitida em ${compBr(mes)}.</td></tr>`}</table></div>
    ${grupos.length ? `<div class="acoes"><a class="botao" target="_blank" href="#/imprimir/faturas?mes=${mes}">Imprimir todas as faturas de ${compBr(mes)}</a> ${botao('excelMes', 'Baixar todas em Excel (ZIP)', { mes })}</div>` : ''}`;
}

function telaImprimir(rota) {
  const tipo = rota.partes[1];
  const voltar = '<div class="acoes nao-imprimir" style="margin:12px 0"><button data-acao="imprimir">Imprimir</button><button class="secundario" data-acao="voltar">Voltar</button></div>';
  if (tipo === 'demonstrativos') {
    const lista = d().cobrancas.filter((x) => x.competencia === rota.q.comp);
    return `<div class="impressao">${voltar}${lista.map(demonstrativo).join('') || '<p>Nenhuma cobrança.</p>'}</div>`;
  }
  let fs = d().faturas.filter((f) => f.situacao === 'Emitida');
  fs = rota.q.numero ? fs.filter((f) => f.numero === Number(rota.q.numero)) : fs.filter((f) => f.emissao.slice(0, 7) === rota.q.mes);
  fs.sort((a, b) => a.numero - b.numero || a.id - b.id);
  return `<div class="impressao">${voltar}${rota.q.numero && fs.length ? `<p class="nao-imprimir">${botao('excel', 'Baixar este número em Excel', { numero: rota.q.numero })}</p>` : ''}
    ${fs.map((f) => faturaHtml(f, buscar('emitentes', f.emitente_id))).join('') || '<p>Nenhuma fatura.</p>'}</div>`;
}

// --------------------------------------------------------------------------
// Empresas, histórico e dados
// --------------------------------------------------------------------------
function telaEmpresas() {
  return `<div class="cabecalho"><h1>Empresas que emitem as faturas</h1>${podeUsuario('admin') ? link('#/novo/emitentes', 'Nova empresa', 'botao') : ''}</div>
    <div class="cartao rolagem"><table><tr><th>Nome</th><th>Razão social</th><th>CNPJ</th><th>Aba no Excel</th><th>Situação</th><th></th></tr>
    ${ordenar(d().emitentes, 'nome').map((e) => `<tr><td><b>${esc(e.nome)}</b></td><td>${esc(e.razao_social)}</td><td>${esc(e.cnpj || '-')}</td><td>${esc(e.aba_modelo || e.nome.split(/\s+/)[0])}</td><td>${e.ativo ? etiqueta('Ativa', 'ok') : etiqueta('Inativa', 'neutra')}</td><td class="n">${podeUsuario('admin') ? link(`#/editar/emitentes/${e.id}`, 'Editar') : ''}</td></tr>`).join('')
    || '<tr><td colspan="6" class="suave">Nenhuma empresa cadastrada.</td></tr>'}</table>
    <p class="suave">Em cada imóvel você define quais empresas emitem a fatura e o percentual de cada uma (ex.: 50% / 50%).</p></div>
    <div class="cartao"><h2>Numeração das faturas</h2>
      <p>Próximo número: <b>${R.numeroFatura(d().proxima_fatura)}</b>. As empresas de um mesmo pagamento recebem o mesmo número.</p>
      ${podeUsuario('admin') ? `<form data-form="proximaFatura" class="acoes"><input type="number" name="numero" min="1" value="${d().proxima_fatura}" style="width:140px"><button class="secundario">Alterar próximo número</button></form>` : ''}</div>`;
}

function telaHistorico(q) {
  let lista = d().historico;
  if (q.usuario) lista = lista.filter((h) => h.usuario === q.usuario);
  if (q.tabela) lista = lista.filter((h) => h.tabela === q.tabela);
  if (q.de) lista = lista.filter((h) => h.quando.slice(0, 10) >= q.de);
  if (q.ate) lista = lista.filter((h) => h.quando.slice(0, 10) <= q.ate);
  if (q.texto) {
    const t = q.texto.toLocaleLowerCase('pt-BR');
    lista = lista.filter((h) => `${h.descricao || ''} ${JSON.stringify(h.detalhes || {})}`.toLocaleLowerCase('pt-BR').includes(t));
  }
  const usuarios = [...new Set(d().historico.map((h) => h.usuario))].sort();
  return `<h1>Histórico de alterações</h1>
    <form class="cartao formulario" data-form="filtroHistorico">
      <div><label>Usuário</label><select name="usuario"><option value=""></option>${usuarios.map((u) => `<option ${q.usuario === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
      <div><label>Tipo de registro</label><select name="tabela"><option value=""></option>${Object.entries(R.TABELAS).map(([k, v]) => `<option value="${k}" ${q.tabela === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>De</label><input type="date" name="de" value="${esc(q.de || '')}"></div><div><label>Até</label><input type="date" name="ate" value="${esc(q.ate || '')}"></div>
      <div><label>Contém o texto</label><input name="texto" value="${esc(q.texto || '')}"></div>
      <div class="check"><button>Filtrar</button> <a href="#/historico">Limpar</a></div></form>
    <div class="cartao">${tabelaHistorico(lista.slice(-500).reverse())}<p class="suave">Mostrando até 500 registros mais recentes.</p></div>`;
}

async function telaDados() {
  const conflitos = await S.copiasEmConflito(E.pasta);
  let modeloProprio = false;
  try {
    await (await E.pasta.getDirectoryHandle(S.PASTA_MODELOS)).getFileHandle(S.MODELO_FATURA);
    modeloProprio = true;
  } catch { /* usa o modelo padrão */ }
  return `<h1>Dados e backup</h1>
    ${conflitos.length ? `<div class="alerta perigo">O OneDrive criou cópia(s) em conflito: <b>${conflitos.map(esc).join(', ')}</b>. Isso acontece quando dois computadores gravam ao mesmo tempo. Confira se falta alguma alteração recente e, depois de conferir, apague a cópia na pasta.</div>` : ''}
    <div class="cartao"><div class="grade">
      ${item('Pasta dos dados', esc(E.pasta.name))}${item('Banco criado em', new Date(d().criado_em).toLocaleString('pt-BR'))}
      ${item('Última atualização', d().atualizado_em ? `${new Date(d().atualizado_em).toLocaleString('pt-BR')} por ${esc(d().atualizado_por)}` : '-')}
      ${item('Versão do arquivo', `revisão ${d().revisao}`)}</div>
      <p class="suave">Tudo é gravado na hora no arquivo <b>${S.ARQUIVO_BANCO}</b> desta pasta. Uma cópia por dia fica em <b>${S.PASTA_BACKUPS}</b> (30 dias). Os anexos ficam em <b>${S.PASTA_ARQUIVOS}</b>, separados por imóvel e inquilino.</p>
      <p>${botao('escolherPasta', 'Trocar de pasta')}</p></div>
    <div class="cartao"><h2>Exportar tudo em ZIP</h2><p>Banco de dados e todos os anexos num único arquivo, para guardar ou levar para outro computador.</p>${opera() ? botao('exportar', 'Baixar ZIP com todos os dados', {}, '') : ''}</div>
    ${podeUsuario('admin') ? `<div class="cartao"><h2>Importar ZIP</h2>
      <div class="alerta aviso">A importação <b>substitui o banco de dados desta pasta</b> pelo do ZIP e acrescenta os anexos. Antes, uma cópia do banco atual é guardada em ${S.PASTA_BACKUPS}.</div>
      <form data-form="importar" class="acoes"><input type="file" name="zip" accept=".zip" style="max-width:380px"><label class="check" style="padding:0"><input type="checkbox" name="confirmo" value="1"> Entendo que os dados atuais serão substituídos</label><button class="perigo">Importar</button></form></div>
    <div class="cartao"><h2>Modelo Excel da fatura</h2>
      <p>${modeloProprio ? `${etiqueta('Modelo próprio', 'ok')} usando o arquivo enviado (${S.PASTA_MODELOS}/${S.MODELO_FATURA}).` : 'Usando o modelo padrão, igual à planilha LOJA1 (abas ANK e JCK).'}</p>
      <p class="suave">Para trocar, envie um .xlsx com uma aba por empresa no mesmo desenho. Os dados são preenchidos nas mesmas células da planilha original (B3 a B6, L4, L5, E10, L10, E11, E12, G16, F22, K22).</p>
      <form data-form="modeloExcel" class="acoes"><input type="file" name="modelo" accept=".xlsx" style="max-width:380px"><button class="secundario">Enviar modelo</button>${modeloProprio ? botao('removerModelo', 'Voltar ao modelo padrão', {}, 'perigo pequeno', 'Voltar ao modelo padrão?') : ''}</form></div>` : ''}`;
}

// --------------------------------------------------------------------------
// Envio de formulários
// --------------------------------------------------------------------------
export const FORMULARIOS = {
  async primeiroAcesso(form) {
    const f = new FormData(form);
    const nome = String(f.get('nome')).trim();
    const lg = String(f.get('login')).trim().toLowerCase();
    const senha = String(f.get('senha'));
    if (!nome || !lg) throw new Error('Preencha nome e login.');
    if (senha.length < 6 || senha !== f.get('senha2')) throw new Error('A senha precisa ter pelo menos 6 caracteres e as duas precisam ser iguais.');
    await criarBanco(nome, lg, senha);
    ir('#/');
  },

  async login(form) {
    const f = new FormData(form);
    await entrar(String(f.get('login')).trim().toLowerCase(), String(f.get('senha')));
    await mostrar();
  },

  async minhaSenha(form) {
    const f = new FormData(form);
    if (!(await conferirSenha(E.usuario, String(f.get('atual'))))) throw new Error('Senha atual incorreta.');
    const nova = String(f.get('nova'));
    if (nova.length < 6 || nova !== f.get('nova2')) throw new Error('A nova senha precisa ter pelo menos 6 caracteres e as duas precisam ser iguais.');
    const sal = novoSal();
    const hash = await resumoSenha(nova, sal);
    await alterar((db) => R.atualizar(db, 'usuarios', E.usuario.id, { senha_sal: sal, senha_hash: hash }, login(), 'Trocou a própria senha'));
    E.usuario = R.buscar(E.d, 'usuarios', E.usuario.id);
    aviso('Senha alterada.');
    ir('#/');
  },

  async cadastro(form, rota) {
    const tabela = rota.partes[1];
    const cfg = CADASTROS[tabela];
    const registro = rota.partes[0] === 'editar' ? buscar(tabela, rota.partes[2]) : null;
    const antigo = registro ? { ...registro } : null;
    const campos = cfg.campos(registro, rota.q);
    const { dados, erros } = F.ler(campos, form);
    if (cfg.ajustar && !Object.keys(erros).length) cfg.ajustar(dados, erros, registro, form, rota.q);
    if (cfg.ajustarAsync && !Object.keys(erros).length) await cfg.ajustarAsync(dados, erros, registro, form, rota.q);
    if (Object.keys(erros).length) return { erros, valores: Object.fromEntries(new FormData(form)) };
    Object.assign(dados, cfg.fixos ? cfg.fixos(registro, rota.q) : {});
    const descricao = cfg.descricao ? cfg.descricao(dados, registro, rota.q) : null;
    const salvo = await alterar((db) => {
      if (registro) {
        R.atualizar(db, tabela, registro.id, dados, login(), descricao);
        return R.buscar(db, tabela, registro.id);
      }
      return R.inserir(db, tabela, dados, login(), descricao);
    });
    if (cfg.depois) await cfg.depois(salvo, antigo);
    if (tabela === 'usuarios' && salvo.id === E.usuario.id) E.usuario = salvo;
    aviso('Salvo.');
    const destino = tabela === 'imoveis' ? `#/imovel/${salvo.id}` : tabela === 'contratos' ? `#/contrato/${salvo.id}` : cfg.voltar(salvo, rota.q);
    ir(destino);
    return null;
  },

  async participacao(form) {
    const f = new FormData(form);
    const imovelId = Number(form.dataset.imovel);
    const emitenteId = Number(f.get('emitente_id'));
    const percentual = C.numero(f.get('percentual'));
    if (!(percentual > 0 && percentual <= 100)) throw new Error('Percentual inválido.');
    await alterar((db) => {
      const existente = db.participacoes.find((p) => p.imovel_id === imovelId && p.emitente_id === emitenteId);
      if (existente) R.atualizar(db, 'participacoes', existente.id, { percentual }, login());
      else R.inserir(db, 'participacoes', { imovel_id: imovelId, emitente_id: emitenteId, percentual }, login());
    });
    await mostrar();
  },

  async pagamento(form) {
    const f = new FormData(form);
    const data = String(f.get('data') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data do pagamento.');
    const valor = String(f.get('valor') || '').trim() ? C.centavos(f.get('valor')) : null;
    const r = await alterar((db) => R.registrarPagamento(db, Number(form.dataset.id), data, valor, login()));
    aviso(r.pontual ? `Pagamento em dia confirmado. Valor da nota: ${reais(r.valor_nf)}.`
      : `Pagamento com ${r.dias_atraso} dia(s) de atraso: multa ${reais(r.multa)} e juros ${reais(r.juros)}. Valor da nota: ${reais(r.valor_nf)}.`, r.pontual ? 'ok' : 'aviso');
    await mostrar();
  },

  irMes: (form) => ir(`#/cobrancas?comp=${new FormData(form).get('comp')}`),
  irMesFatura: (form) => ir(`#/faturas?mes=${new FormData(form).get('mes')}`),
  filtroHistorico(form) {
    const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
    ir(`#/historico?${q}`);
  },

  async proximaFatura(form) {
    const n = Number(new FormData(form).get('numero'));
    if (!Number.isInteger(n) || n < 1) throw new Error('Número inválido.');
    const ultima = R.ultimaFatura(E.d);
    if (ultima && n <= ultima.numero && !confirm(`Já existe a fatura nº ${R.numeroFatura(ultima.numero)}. Usar ${R.numeroFatura(n)} mesmo assim vai repetir números. Continuar?`)) return;
    await alterar((db) => {
      R.registrar(db, login(), 'Alteração', 'faturas', null, 'Próximo número de fatura', { proxima_fatura: { de: db.proxima_fatura, para: n } });
      db.proxima_fatura = n;
    });
    aviso('Numeração atualizada.');
    await mostrar();
  },

  async importar(form) {
    const f = new FormData(form);
    const arq = f.get('zip');
    if (!arq || !arq.size) throw new Error('Escolha o arquivo ZIP.');
    if (f.get('confirmo') !== '1') throw new Error('Marque a confirmação: a importação substitui os dados desta pasta.');
    const JSZip = await jsZip();
    const novos = await S.importarZip(JSZip, E.pasta, arq, E.d);
    E.d = novos;
    await alterar((db) => R.registrar(db, login(), 'Importação', 'banco', null, `Dados importados de ${arq.name}`, null, {}, false));
    E.usuario = E.d.usuarios.find((u) => u.login === E.usuario.login && u.ativo) || null;
    if (!E.usuario) sessionStorage.removeItem('usuario');
    aviso('Dados importados. Uma cópia do banco anterior ficou na pasta backups.');
    ir('#/');
  },

  async modeloExcel(form) {
    const arq = new FormData(form).get('modelo');
    if (!arq || !arq.size) throw new Error('Escolha o arquivo .xlsx.');
    const ExcelJS = await excelJs();
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await arq.arrayBuffer());
    } catch {
      throw new Error('Não consegui abrir este arquivo como planilha Excel (.xlsx).');
    }
    const dir = await E.pasta.getDirectoryHandle(S.PASTA_MODELOS, { create: true });
    await S.escreverTexto(dir, S.MODELO_FATURA, arq);
    await alterar((db) => R.registrar(db, login(), 'Alteração', 'banco', null, `Modelo Excel da fatura enviado (abas: ${wb.worksheets.map((w) => w.name).join(', ')})`));
    aviso('Modelo salvo.');
    await mostrar();
  },
};

// --------------------------------------------------------------------------
// Botões
// --------------------------------------------------------------------------
async function modeloFatura() {
  try {
    const dir = await E.pasta.getDirectoryHandle(S.PASTA_MODELOS);
    return await (await (await dir.getFileHandle(S.MODELO_FATURA)).getFile()).arrayBuffer();
  } catch {
    const r = await fetch('modelos/fatura-modelo.xlsx');
    if (!r.ok) throw new Error('Modelo da fatura não encontrado.');
    return r.arrayBuffer();
  }
}

async function excelDoNumero(ExcelJS, modelo, numero) {
  const fs = E.d.faturas.filter((f) => f.numero === Number(numero) && f.situacao === 'Emitida').sort((a, b) => a.id - b.id);
  if (!fs.length) throw new Error('Fatura não encontrada.');
  const blob = await faturaExcel(ExcelJS, modelo, fs, E.d.emitentes);
  return { blob, nome: S.limparNome(`Fatura ${R.numeroFatura(numero)} - ${fs[0].tomador_nome}.xlsx`) };
}

const TABELAS_EXCLUSAO = {
  imoveis: { admin: true, checar: (db, r) => (db.contratos.some((c) => c.imovel_id === r.id) ? 'Este imóvel tem inquilinos. Exclua os contratos antes.' : null), voltar: () => '#/imoveis' },
  contratos: { admin: true, checar: (db, r) => (db.cobrancas.some((cb) => cb.contrato_id === r.id && R.faturasDe(db, 'cobranca', cb.id, false).length) ? 'Este contrato tem faturas emitidas e não pode ser excluído.' : null), voltar: (r) => `#/imovel/${r.imovel_id}` },
  cobrancas: { checar: (db, r) => (R.faturasDe(db, 'cobranca', r.id, false).length ? 'Esta cobrança tem fatura. Desfaça o pagamento antes.' : null), voltar: (r) => `#/cobrancas?comp=${r.competencia}` },
  recebimentos: { checar: (db, r) => (R.faturasDe(db, 'recebimento', r.id).length ? 'Este recebimento tem fatura emitida.' : null) },
};

export const ACOES = {
  escolherPasta: () => escolherPasta(),
  reabrir: () => reabrirPastaLembrada(),
  sair: () => sair(),
  imprimir: () => window.print(),
  voltar: () => history.back(),

  async excluir({ tabela, id }) {
    const cfg = TABELAS_EXCLUSAO[tabela] || {};
    if (cfg.admin && !podeUsuario('admin')) throw new Error('Só administradores podem excluir.');
    const r = buscar(tabela, id);
    const destino = cfg.voltar ? cfg.voltar(r) : null;
    await alterar((db) => {
      const reg = R.buscar(db, tabela, id);
      const problema = cfg.checar ? cfg.checar(db, reg) : null;
      if (problema) throw new Error(problema);
      if (tabela === 'imoveis') db.participacoes.filter((p) => p.imovel_id === reg.id).forEach((p) => R.excluir(db, 'participacoes', p.id, login()));
      if (tabela === 'contratos') {
        for (const t of ['cobrancas', 'correcoes', 'seguros']) db[t].filter((x) => x.contrato_id === reg.id).forEach((x) => R.excluir(db, t, x.id, login()));
      }
      R.excluir(db, tabela, reg.id, login(), reg.nome || reg.inquilino_nome || null);
    });
    aviso('Excluído.');
    if (destino) ir(destino); else await mostrar();
  },

  async gerarCobrancas({ comp }) {
    const r = await alterar((db) => R.gerarCobrancas(db, comp, login()));
    aviso(`${r.geradas} cobrança(s) gerada(s) para ${compBr(comp)}.`);
    await mostrar();
  },

  async estornar({ id }) {
    await alterar((db) => R.estornarPagamento(db, Number(id), login()));
    aviso('Pagamento desfeito.');
    await mostrar();
  },

  async cancelarRecebimento({ id }) {
    await alterar((db) => R.cancelarFaturas(db, 'recebimento', Number(id), login()));
    aviso('Fatura cancelada. Corrija o recebimento e numere de novo.');
    await mostrar();
  },

  async numerar() {
    let r = await alterar((db) => R.numerarFaturas(db, login()));
    if (r.foraDeOrdem.length) {
      const lista = r.foraDeOrdem.map((p) => `${dataBr(p.data)}`).join(', ');
      if (!confirm(`A última fatura (nº ${R.numeroFatura(r.ultima.numero)}) é de ${dataBr(r.ultima.emissao)}, e há pagamento(s) com data anterior: ${lista}.\n\nNumerar mesmo assim? Eles receberão os próximos números, com a data do próprio pagamento.`)) return;
      r = await alterar((db) => R.numerarFaturas(db, login(), { forcar: true }));
    }
    if (r.numeradas.length) aviso(`Faturas numeradas: ${r.numeradas.map((n) => R.numeroFatura(n.numero)).join(', ')}.`);
    if (r.problema) aviso(r.problema, 'erro');
    await mostrar();
  },

  async excel({ numero }) {
    const ExcelJS = await excelJs();
    const { blob, nome } = await excelDoNumero(ExcelJS, await modeloFatura(), numero);
    baixar(blob, nome);
  },

  async excelMes({ mes }) {
    const [ExcelJS, JSZip] = await Promise.all([excelJs(), jsZip()]);
    const modelo = await modeloFatura();
    const numeros = [...new Set(E.d.faturas.filter((f) => f.situacao === 'Emitida' && f.emissao.slice(0, 7) === mes).map((f) => f.numero))].sort((a, b) => a - b);
    const zip = new JSZip();
    for (const n of numeros) {
      const { blob, nome } = await excelDoNumero(ExcelJS, modelo, n);
      zip.file(nome, blob);
    }
    baixar(await zip.generateAsync({ type: 'blob' }), `Faturas ${mes}.zip`);
  },

  async exportar() {
    const JSZip = await jsZip();
    const blob = await S.exportarZip(JSZip, E.pasta, E.d);
    baixar(blob, `imoveis-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.zip`);
    await alterar((db) => R.registrar(db, login(), 'Exportação', 'banco', null, 'Banco e arquivos exportados em ZIP', null, {}, false));
  },

  async removerModelo() {
    const dir = await E.pasta.getDirectoryHandle(S.PASTA_MODELOS, { create: true });
    await dir.removeEntry(S.MODELO_FATURA).catch(() => {});
    await alterar((db) => R.registrar(db, login(), 'Alteração', 'banco', null, 'Voltou ao modelo Excel padrão'));
    await mostrar();
  },

  async enviarArquivos({ upload }, el) {
    const [escopo, id] = upload.split(':');
    const dir = await pastaDoEscopo(escopo, Number(id));
    const nomes = [];
    for (const f of el.files) nomes.push(await S.salvarArquivo(dir, f));
    const vinc = escopo === 'contrato' ? { contrato_id: Number(id), imovel_id: buscar('contratos', id).imovel_id } : { imovel_id: Number(id) };
    await alterar((db) => R.registrar(db, login(), 'Inclusão', 'arquivos', null, `${nomes.length} arquivo(s) anexado(s)`, { arquivos: nomes.join(', ') }, vinc));
    aviso(`${nomes.length} arquivo(s) anexado(s).`);
    await mostrar();
  },

  async abrirArquivo({ escopo, id, nome }) {
    const arq = await S.abrirArquivo(await pastaDoEscopo(escopo, Number(id)), nome);
    window.open(URL.createObjectURL(arq), '_blank');
  },

  async baixarArquivo({ escopo, id, nome }) {
    baixar(await S.abrirArquivo(await pastaDoEscopo(escopo, Number(id)), nome), nome);
  },

  async excluirArquivo({ escopo, id, nome }) {
    if (!opera()) throw new Error('Seu usuário não pode excluir arquivos.');
    const dir = await pastaDoEscopo(escopo, Number(id));
    await dir.removeEntry(nome);
    const vinc = escopo === 'contrato' ? { contrato_id: Number(id), imovel_id: buscar('contratos', id).imovel_id } : { imovel_id: Number(id) };
    await alterar((db) => R.registrar(db, login(), 'Exclusão', 'arquivos', null, `Arquivo excluído: ${nome}`, null, vinc));
    await mostrar();
  },
};
