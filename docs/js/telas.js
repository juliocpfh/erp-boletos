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
export const PASTA_SEM_IMOVEL = 'Sem imóvel';

/** Pasta-mãe dos arquivos do inquilino: a do imóvel, ou "Sem imóvel". */
function pastaPaiContrato(c) {
  const i = c.imovel_id ? buscar('imoveis', c.imovel_id) : null;
  return i ? i.pasta || i.nome : PASTA_SEM_IMOVEL;
}

export function nomePastaContrato(c) {
  const fmt = (x) => (x ? dataBr(x).replace(/\//g, '-') : '-');
  return S.limparNome(`${c.inquilino_nome} (${fmt(c.data_entrada)} a ${fmt(c.data_saida)})`);
}

async function pastaDoEscopo(escopo, id) {
  const raiz = await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true });
  if (escopo === 'contrato') {
    const c = buscar('contratos', id);
    return S.subpasta(raiz, [pastaPaiContrato(c), c.pasta || nomePastaContrato(c)]);
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
    const garantia = raiz.querySelector('select[name=garantia_tipo]');
    if (garantia) {
      const mostrarGarantia = () => raiz.querySelectorAll('[data-mostrar]').forEach((el) => {
        el.hidden = !el.dataset.mostrar.split('|').includes(garantia.value);
      });
      garantia.addEventListener('change', mostrarGarantia);
      mostrarGarantia();
    }
    const bonif = raiz.querySelector('input[name=bonificacao]');
    if (bonif) {
      const mostrarBonif = () => raiz.querySelectorAll('[data-vinculo="desconto"]').forEach((el) => { el.closest('div').hidden = !bonif.checked; });
      bonif.addEventListener('change', mostrarBonif);
      mostrarBonif();
    }
    const prazo = raiz.querySelector('select[name=prazo_tipo]');
    const fim = raiz.querySelector('[name=vigencia_fim]');
    if (prazo && fim) {
      const mostrarFim = () => { fim.closest('div').hidden = prazo.value === 'Indeterminado'; };
      prazo.addEventListener('change', mostrarFim);
      mostrarFim();
    }
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
        ${n(abertas.length, 'boletos em aberto', '#/cobrancas')}
        ${n(abertas.filter((c) => c.vencimento < hoje).length, 'em aberto e vencidas', '#/cobrancas')}
        ${n(pend.length, 'pagamentos aguardando nº de NF', '#/faturas')}
      </div>
      <div class="cartao"><h2>Alertas</h2>
        ${alertas.map((a) => `<div class="alerta ${a.nivel} ${a.tipo === 'A verificar' ? 'amarelo' : ''}"><b>${esc(a.tipo)}</b> <a href="${a.contrato_id ? `#/contrato/${a.contrato_id}` : `#/imovel/${a.imovel_id}`}">${esc(a.imovel)}${a.inquilino ? ` · ${esc(a.inquilino)}` : ''}</a>: ${esc(a.texto)}</div>`).join('') || '<p class="suave">Nenhum alerta no momento.</p>'}
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
        <td class="n">${atual ? reais(R.aluguelAtual(d(), atual)) : '-'}</td>
        <td class="n">${atual ? aluguelBonificado(atual) : '-'}</td></tr>`;
    }).join('');
    return `<div class="cabecalho"><h1>Imóveis</h1><div class="acoes">${opera() ? `${link('#/novo/imoveis', 'Novo imóvel', 'botao')} ${link('#/novo/imoveis?tipo=airbnb', 'Novo grupo Airbnb')}` : ''}</div></div>
      <div class="cartao rolagem"><table><tr><th>Imóvel</th><th>Endereço</th><th>Inquilino atual</th><th class="n">Aluguel cheio</th><th class="n">Aluguel bonificado</th></tr>
      ${linhas || '<tr><td colspan="5" class="suave">Nenhum imóvel cadastrado. Clique em "Novo imóvel".</td></tr>'}</table></div>
      ${grupos.length ? `<div class="cartao"><h2>Grupos Airbnb</h2><table><tr><th>Grupo</th><th>Cliente na NF</th><th>Unidades</th></tr>
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
    return cb ? telaCobranca(cb) : '<h1>Boleto não encontrado</h1>';
  },
  faturas: (rota) => telaFaturas(rota.q.mes || C.competenciaDe(C.hojeIso())),
  imprimir: (rota) => telaImprimir(rota),
  empresas: () => telaEmpresas(),
  inquilinos: (rota) => telaInquilinos(rota.q),
  iptu: (rota) => telaIptu(Number(rota.q.ano) || new Date().getFullYear()),
  historico: (rota) => telaHistorico(rota.q),
  dados: () => telaDados(),
  usuarios() {
    if (!podeUsuario('admin')) return '<h1>Acesso só para administradores</h1>';
    return `<div class="cabecalho"><h1>Usuários</h1>${link('#/novo/usuarios', 'Novo usuário', 'botao')}</div>
      <div class="cartao"><table><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Situação</th><th></th></tr>
      ${ordenar(d().usuarios, 'nome').map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.login)}</td><td>${PAPEIS[u.papel]}</td><td>${u.ativo ? etiqueta('Ativo', 'ok') : etiqueta('Bloqueado', 'perigo')}</td><td class="n">${link(`#/editar/usuarios/${u.id}`, 'Editar')}</td></tr>`).join('')}</table>
      <p class="suave">Administrador: tudo, inclusive usuários e importação. Operador: cadastra, altera, confirma pagamentos e numera NFs. Consulta: só vê.</p></div>`;
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
  return `<div class="cartao" id="empresas"><h2>Empresas que emitem a NF</h2>
    <table><tr><th>Empresa</th><th class="n">Percentual</th><th></th></tr>
    ${partes.map((p) => { const e = buscar('emitentes', p.emitente_id); return `<tr><td>${esc(e.nome)} · ${esc(e.razao_social)}</td><td class="n">${pct(p.percentual)}</td><td class="n">${opera() ? botao('excluir', 'Remover', { tabela: 'participacoes', id: p.id }, 'perigo pequeno', 'Remover esta empresa do imóvel?') : ''}</td></tr>`; }).join('')
    || '<tr><td colspan="3" class="suave">Nenhuma empresa definida. Sem isso não é possível numerar as NFs.</td></tr>'}
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
      ${opera() ? `${link(`#/novo/vinculos?imovel=${i.id}`, 'Vincular inquilino', 'botao')} ${link(`#/editar/imoveis/${i.id}`, 'Editar imóvel', 'botao secundario')}` : ''}
      ${podeUsuario('admin') ? botao('excluir', 'Excluir', { tabela: 'imoveis', id: i.id }, 'perigo', 'Excluir este imóvel? Os arquivos da pasta são mantidos.') : ''}</div></div>
    <div class="endereco">📍 ${esc(endereco(i))}</div>
    ${caixaVerificar(i.verificar)}
    ${grupo ? `<div class="alerta info">No Airbnb: unidade do grupo <a href="#/imovel/${grupo.id}">${esc(grupo.nome)}</a>. Para tirar do Airbnb, use "Editar imóvel" e deixe o grupo em branco.</div>` : ''}
    <div class="cartao"><div class="grade">
      ${item('Área útil', i.area_util ? `${F.pctTexto(i.area_util)} m²` : '-')}${item('Área total', i.area_total ? `${F.pctTexto(i.area_total)} m²` : '-')}
      ${item('Energia', esc([i.energia_ligada ? (i.energia_ligada === 'Sim' ? 'ligada' : 'desligada') : '', i.energia_tipo].filter(Boolean).join(' · ') || '-'))}
      ${item('Matrícula', esc(i.matricula || '-'))}${item('Cartório', esc(i.cartorio || '-'))}${item('Inscrição IPTU', esc(i.inscricao_iptu || '-'))}
      ${item('UC Copel', esc(i.copel_uc || '-'))}${item('Matrícula Sanepar', esc(i.sanepar_matricula || '-'))}
      ${item('Condomínio', esc([i.condominio_nome, i.condominio_contato].filter(Boolean).join(' · ') || '-'))}
      ${item('Administradora do condomínio', esc([i.administradora_nome, i.administradora_contato].filter(Boolean).join(' · ') || '-'))}
      ${item('Pasta de arquivos', esc(i.pasta || '-'))}</div>
      ${i.observacoes ? `<p class="pre">${esc(i.observacoes)}</p>` : ''}</div>
    <div class="cartao"><h2>Inquilinos deste imóvel</h2><div class="rolagem"><table>
      <tr><th>Ativo</th><th>Inquilino</th><th>Entrada</th><th>Saída</th><th class="n">Aluguel atual</th><th>Situação</th></tr>
      ${contratos.map((c) => `<tr class="${c.verificar ? 'amarelo' : ''}"><td><input type="checkbox" title="Inquilino ativo (gera boleto)" data-acao="alternarAtivo" data-id="${c.id}" ${c.ativo !== false ? 'checked' : ''} ${opera() ? '' : 'disabled'}></td>
        <td><a href="#/contrato/${c.id}"><b>${esc(c.inquilino_nome)}</b></a>${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}<br><span class="suave">📁 ${esc(c.pasta || nomePastaContrato(c))}</span></td>
        <td>${dataBr(c.data_entrada)}</td><td>${dataBr(c.data_saida)}</td><td class="n">${reais(R.aluguelAtual(d(), c))}</td>
        <td>${R.contratoAtivo(c, hoje) ? etiqueta('Atual', 'ok') : etiqueta('Encerrado', 'neutra')} ${c.prazo_tipo === 'Indeterminado' ? etiqueta('Indeterminado', 'aviso') : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="suave">Nenhum inquilino cadastrado.</td></tr>'}
    </table></div><p class="suave">Desmarque "Ativo" para não gerar boleto para o inquilino.</p></div>
    ${caixaEmpresas(i)}
    ${caixaLeituras(R.leiturasDoImovel(d(), i.id), opera() ? link(`#/novo/leituras?imovel=${i.id}`, 'Registrar leitura') : '', true)}
    ${caixaSeguros(i)}
    <div class="cartao" id="iptu"><div class="cabecalho"><h2>IPTU</h2>${opera() ? link(`#/novo/iptus?imovel=${i.id}`, 'Lançar IPTU do ano') : ''}</div>
      ${iptus.map((p) => { const ps = p.valor_parcela > 0 ? Array(p.num_parcelas).fill(p.valor_parcela) : C.parcelas(p.valor_total, p.num_parcelas); return `<h3>${p.ano} · total ${reais(p.valor_total)} em ${p.num_parcelas} parcela(s) ${opera() ? `${link(`#/editar/iptus/${p.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'iptus', id: p.id }, 'perigo pequeno', 'Excluir o IPTU deste ano?')}` : ''}</h3>
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
    <div class="cartao"><div class="grade">${item('Cliente na NF', esc(g.cliente_nome || '-'))}${item('CPF / CNPJ', esc(g.cliente_documento || '-'))}${item('Telefone', esc(g.cliente_telefone || '-'))}${item('Endereço do cliente', esc(g.cliente_endereco || 'endereço da unidade'))}</div></div>
    <div class="cartao"><h2>Unidades do grupo</h2>
      <p>${unidades.map((u) => `<a href="#/imovel/${u.id}">${esc(u.nome)}</a>`).join(' · ') || '<span class="suave">Nenhuma unidade. Em cada imóvel, use "Editar imóvel" e escolha este grupo.</span>'}</p></div>
    ${caixaEmpresas(g)}
    <div class="cartao"><h2>Recebimentos</h2><p class="suave">Cada recebimento entra na sequência das NFs pela data em que o dinheiro entrou.</p>
      <div class="rolagem"><table><tr><th>Entrou em</th><th>Unidade</th><th>Período</th><th>Cliente</th><th class="n">Valor</th><th>NF</th><th></th></tr>
      ${recs.map((r) => { const fs = R.faturasDe(d(), 'recebimento', r.id); const u = r.unidade_id ? buscar('imoveis', r.unidade_id) : null; return `<tr><td>${dataBr(r.data_pagamento)}</td><td>${esc(u ? u.nome : '-')}</td>
        <td>${r.periodo_inicio ? `${dataBr(r.periodo_inicio)} a ${dataBr(r.periodo_fim)}` : '-'}</td><td>${esc(r.tomador_nome)}</td><td class="n">${reais(r.valor)}</td>
        <td>${fs.length ? link(`#/imprimir/faturas?numero=${fs[0].numero}`, `Nº ${R.numeroFatura(fs[0].numero)}`) : '<span class="suave">aguardando nº</span>'}</td>
        <td class="n">${opera() && !fs.length ? `${link(`#/editar/recebimentos/${r.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'recebimentos', id: r.id }, 'perigo pequeno', 'Excluir este recebimento?')}` : ''}${opera() && fs.length ? botao('cancelarRecebimento', 'Cancelar NF', { id: r.id }, 'perigo pequeno', 'Cancelar a NF deste recebimento? O número não será reaproveitado.') : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="suave">Nenhum recebimento lançado.</td></tr>'}
      </table></div></div>
    ${caixaArquivos('imovel', g.id, 'Documentos do grupo', 'documentos')}
    <div class="cartao"><h2>Histórico</h2>${tabelaHistorico(ultimos((h) => h.imovel_id === g.id))}</div>`;
}

// --------------------------------------------------------------------------
// Contrato / inquilino
// --------------------------------------------------------------------------
function selosContrato(c) {
  const base = R.dataBaseCorrecao(c);
  const prazo = c.prazo_tipo === 'Indeterminado'
    ? etiqueta('Prazo indeterminado', 'aviso')
    : etiqueta(`Prazo determinado${c.vigencia_fim ? ` até ${dataBr(c.vigencia_fim)}` : ''}`, 'info');
  return `<div class="selos">${prazo}
    ${c.renovacao_automatica ? etiqueta('Renovação automática', 'neutra') : ''}
    ${etiqueta(`Correção anual: ${c.indice_correcao || 'índice não informado'}${base ? ` · todo ${dataBr(base).slice(0, 5)}` : ''}`, 'ok')}
    ${etiqueta(`Garantia: ${c.garantia_tipo || 'não informada'}`, 'neutra')}
    ${R.contratoAtivo(c) ? '' : etiqueta('Encerrado', 'perigo')}</div>`;
}

/** Aluguel atual com a bonificação de pontualidade (o que o inquilino paga em dia, sem IPTU e seguro). */
function aluguelBonificado(c) {
  const aluguel = R.aluguelAtual(d(), c);
  if (c.bonificacao === false) return `<span class="suave">sem bonificação</span>`;
  return `<b>${reais(aluguel - C.descontoPorPercentual(aluguel, R.percentualBonificacao(c)))}</b>`;
}

const caixaVerificar = (texto) => (texto ? `<div class="verificar"><b>A verificar:</b> ${esc(texto).replace(/\n/g, '<br>')}</div>` : '');

function caixaGarantia(c) {
  const fiadores = R.fiadoresDo(d(), c.id);
  const correcoes = R.correcoesGarantiaDo(d(), c.id);
  const aplic = R.aplicacoesDo(d(), c.id);
  const sit = R.situacaoAplicacao(d(), c);
  const sug = R.caucaoSugerida(d(), c);
  const trocas = R.trocasGarantiaDo(d(), c.id);
  const anteriores = R.fiadoresAnterioresDo(d(), c.id);
  let html = `<div class="cartao" id="garantia"><div class="cabecalho"><h2>Garantia: ${esc(c.garantia_tipo || 'não informada')}</h2>${opera() ? link(`#/novo/trocas_garantia?contrato=${c.id}`, 'Trocar tipo de garantia') : ''}</div>`;
  if (R.temCaucao(c)) {
    html += `<div class="grade">${item('Caução dada', `${reais(c.caucao_valor)} em ${dataBr(c.caucao_data)}`)}
      ${item('Caução atual', `<span class="maior">${reais(R.valorGarantia(d(), c))}</span>`)}
      ${c.caucao_meses ? item('Equivale a', `${c.caucao_meses} aluguéis (sugerido hoje: ${reais(sug)})`) : ''}</div>
      <h3>Correções da caução</h3><table><tr><th>Data</th><th class="n">Novo valor</th><th class="n">Complemento</th><th>Obs.</th><th></th></tr>
      ${correcoes.map((x) => `<tr><td>${dataBr(x.data)}</td><td class="n">${reais(x.valor_novo)}</td><td class="n">${reais(x.complemento)}</td><td>${esc(x.observacoes || '')}</td>
        <td class="n">${opera() ? botao('excluir', 'Excluir', { tabela: 'correcoes_garantia', id: x.id }, 'perigo pequeno', 'Excluir esta correção da caução?') : ''}</td></tr>`).join('')
      || '<tr><td colspan="5" class="suave">Nenhuma correção registrada.</td></tr>'}</table>
      ${opera() ? `<p>${link(`#/novo/correcoes_garantia?contrato=${c.id}`, 'Corrigir caução')}</p>` : ''}`;
  }
  if (R.temDeposito(c)) {
    html += `<div class="grade">${item('Depósito de garantia', `${reais(c.deposito_valor)} em ${dataBr(c.deposito_data)}`)}
      ${item('Quando e onde será usado', esc(c.deposito_uso || 'não informado'))}</div>`;
  }
  if (R.temFiador(c) || fiadores.length) {
    html += `<h3>Fiadores</h3><table><tr><th>Nome</th><th>CPF / RG</th><th>Contato</th><th></th></tr>
      ${fiadores.map((f) => `<tr><td><b>${esc(f.nome)}</b>${f.endereco ? `<br><span class="suave">${esc(f.endereco)}</span>` : ''}</td><td>${esc(f.cpf || '-')} / ${esc(f.rg || '-')}</td>
        <td>${esc([f.telefone, f.email].filter(Boolean).join(' · ') || '-')}</td>
        <td class="n">${opera() ? `${link(`#/novo/fiadores?contrato=${c.id}&substitui=${f.id}`, 'Trocar fiador')} ${link(`#/editar/fiadores/${f.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'fiadores', id: f.id }, 'perigo pequeno', 'Excluir este fiador? Para registrar uma substituição, use "Trocar fiador".')}` : ''}</td></tr>`).join('')
      || '<tr><td colspan="4" class="suave">Nenhum fiador cadastrado.</td></tr>'}</table>
      ${opera() ? `<p>${link(`#/novo/fiadores?contrato=${c.id}`, 'Adicionar fiador')}</p>` : ''}`;
  }
  if (anteriores.length) {
    html += `<h3>Fiadores anteriores</h3><table class="suave"><tr><th>Nome</th><th>CPF / RG</th><th>Saiu em</th><th>Substituído por</th></tr>
      ${anteriores.map((f) => `<tr><td>${esc(f.nome)}</td><td>${esc(f.cpf || '-')} / ${esc(f.rg || '-')}</td><td>${dataBr(f.data_saida)}</td><td>${esc((buscar('fiadores', f.substituido_por_id) || {}).nome || '-')}</td></tr>`).join('')}</table>`;
  }
  if (trocas.length) {
    html += `<h3>Trocas de garantia</h3><table class="suave"><tr><th>Data</th><th>De</th><th>Para</th><th class="n">Valor anterior</th><th>O que aconteceu com a anterior</th></tr>
      ${trocas.map((t) => `<tr><td>${dataBr(t.data)}</td><td>${esc(t.tipo_anterior || '-')}</td><td>${esc(t.tipo_novo)}</td><td class="n">${t.valor_anterior ? reais(t.valor_anterior) : '-'}</td><td>${esc(t.observacoes || '')}</td></tr>`).join('')}</table>`;
  }
  if (sit.total || aplic.length) {
    html += `<h3>Onde o valor foi aplicado</h3>
      <table><tr><th>Empresa</th><th class="n">Aplicado</th><th class="n">Deveria (metade)</th><th class="n">Falta</th></tr>
      ${sit.linhas.map((l) => `<tr><td>${esc(l.emitente.nome)}</td><td class="n">${reais(l.aplicado)}</td><td class="n">${reais(l.meta)}</td><td class="n">${l.falta ? `<b>${reais(l.falta)}</b>` : '-'}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="n">${reais(sit.soma)}</td><td class="n">${reais(sit.total)}</td><td class="n">${sit.ok ? etiqueta('100% aplicado', 'ok') : reais(sit.total - sit.soma)}</td></tr></table>
      ${aplic.length ? `<table class="suave"><tr><th>Data</th><th>Empresa</th><th class="n">Valor</th><th>Obs.</th><th></th></tr>${aplic.map((a) => `<tr><td>${dataBr(a.data)}</td><td>${esc((buscar('emitentes', a.emitente_id) || {}).nome || '-')}</td><td class="n">${reais(a.valor)}</td><td>${esc(a.observacoes || '')}</td>
        <td class="n">${opera() ? botao('excluir', 'Excluir', { tabela: 'aplicacoes', id: a.id }, 'perigo pequeno', 'Excluir esta aplicação?') : ''}</td></tr>`).join('')}</table>` : ''}
      ${opera() ? `<p>${link(`#/novo/aplicacoes?contrato=${c.id}`, 'Registrar aplicação')}</p>` : ''}
      <p class="suave">Na saída, o valor é devolvido corrigido pela poupança (informado no cálculo final).</p>`;
  }
  return `${html}</div>`;
}

function caixaSaida(c) {
  const e = R.encerramentoDo(d(), c.id);
  if (!e) {
    return opera() ? `<div class="cartao"><div class="cabecalho"><h2>Saída do inquilino</h2>${link(`#/novo/encerramentos?contrato=${c.id}`, 'Registrar saída e cálculo final', 'botao')}</div>
      <p class="suave">Calcula a devolução da garantia corrigida, desconta os débitos e guarda tudo no histórico do inquilino.</p></div>` : '';
  }
  return `<div class="cartao" id="saida"><h2>Saída em ${dataBr(e.data_saida)}</h2><div class="grade">
    ${item('Garantia a devolver', reais(e.garantia_valor))}${item('Correção (poupança)', `${pct(e.indice_percentual || 0)} → ${reais(e.garantia_corrigida)}`)}
    ${item('Débitos descontados', reais(e.debitos))}${item(e.saldo >= 0 ? 'Saldo a devolver ao inquilino' : 'Saldo a cobrar do inquilino', `<span class="maior">${reais(Math.abs(e.saldo))}</span>`)}
    ${item('Vistoria de saída', esc(e.vistoria_saida || '-'))}</div>
    ${e.debitos_descricao ? `<p class="pre">${esc(e.debitos_descricao)}</p>` : ''}${e.observacoes ? `<p class="pre">${esc(e.observacoes)}</p>` : ''}
    ${podeUsuario('admin') ? botao('excluir', 'Desfazer registro da saída', { tabela: 'encerramentos', id: e.id }, 'perigo pequeno', 'Apagar o cálculo de saída? A data de saída do contrato continua preenchida.') : ''}</div>`;
}

/** Histórico das leituras dos relógios de água, energia e gás. */
function caixaLeituras(lista, botaoNovo, comInquilino) {
  return `<div class="cartao"><div class="cabecalho"><h2>Leitura dos relógios (água, energia, gás)</h2>${botaoNovo}</div>
    <div class="rolagem"><table><tr><th>Data</th><th>Momento</th>${comInquilino ? '<th>Inquilino</th>' : ''}<th>Água</th><th>Energia</th><th>Gás</th><th>Obs.</th><th></th></tr>
    ${lista.map((l) => { const c = l.contrato_id ? buscar('contratos', l.contrato_id) : null; return `<tr><td>${dataBr(l.data)}</td><td>${esc(l.momento)}</td>
      ${comInquilino ? `<td>${c ? `<a href="#/contrato/${c.id}">${esc(c.inquilino_nome)}</a>` : '<span class="suave">imóvel vazio</span>'}</td>` : ''}
      <td>${esc(l.agua || '-')}</td><td>${esc(l.energia || '-')}</td><td>${esc(l.gas || '-')}</td><td>${esc(l.observacoes || '')}</td>
      <td class="n">${opera() ? `${link(`#/editar/leituras/${l.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'leituras', id: l.id }, 'perigo pequeno', 'Excluir esta leitura?')}` : ''}</td></tr>`; }).join('')
    || `<tr><td colspan="${comInquilino ? 8 : 7}" class="suave">Nenhuma leitura registrada.</td></tr>`}</table></div></div>`;
}

/** O que o contrato inclui: IPTU, água, energia, gás, condomínio, internet e contas adicionais. */
function caixaIncluso(c) {
  const sit = (v) => (!v ? '<span class="suave">não informado</span>'
    : v === 'Incluso no aluguel' ? etiqueta(v, 'ok') : v === 'Por conta do inquilino' ? etiqueta(v, 'info') : etiqueta(v, 'neutra'));
  return `<div class="cartao"><h2>O que está incluso no contrato</h2><div class="grade">
    ${item('IPTU', c.cobrar_iptu ? etiqueta('Cobrado do inquilino', 'aviso') : etiqueta('Não cobrado', 'neutra'))}
    ${F.CONTAS.map(([k, t]) => item(t, sit(c[k]))).join('')}</div>
    ${c.contas_adicionais ? `<h3>Contas adicionais</h3><p class="pre">${esc(c.contas_adicionais)}</p>` : ''}</div>`;
}

/** Seguro obrigatório: fica no imóvel e é cobrado do inquilino que estiver nele no mês da parcela. */
function caixaSeguros(i) {
  if (!i) return '';
  const alerta = R.alertaSeguroImovel(d(), i);
  const seguros = R.segurosDoImovel(d(), i.id).sort((a, b) => String(b.vigencia_inicio).localeCompare(String(a.vigencia_inicio)));
  return `<div class="cartao" id="seguros"><div class="cabecalho"><h2>Seguro obrigatório do imóvel ${esc(i.nome)}</h2>${opera() ? link(`#/novo/seguros?imovel=${i.id}`, 'Cadastrar apólice') : ''}</div>
    ${alerta ? `<div class="alerta ${alerta.nivel}">${esc(alerta.texto)}</div>` : ''}
    <div class="rolagem"><table><tr><th>Seguradora / apólice</th><th>Contratado em</th><th>Vigência</th><th class="n">Valor</th><th>Parcelas</th><th></th></tr>
      ${seguros.map((s) => `<tr><td>${esc(s.seguradora || '-')}<br><span class="suave">${esc(s.apolice || '')}</span></td><td>${dataBr(s.data_contratacao)}</td><td>${dataBr(s.vigencia_inicio)} a ${dataBr(s.vigencia_fim)}</td><td class="n">${reais(s.valor_total)}</td><td>${s.num_parcelas}x a partir de ${compBr(s.primeira_competencia)}</td>
        <td class="n">${opera() ? `${link(`#/editar/seguros/${s.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'seguros', id: s.id }, 'perigo pequeno', 'Excluir esta apólice?')}` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="suave">Nenhuma apólice cadastrada.</td></tr>'}</table></div>
    <p class="suave">As parcelas entram no boleto do inquilino que estiver no imóvel no mês de cada parcela.</p></div>`;
}

function telaContrato(c) {
  const i = buscar('imoveis', c.imovel_id);
  const hoje = C.hojeIso();
  const aluguel = R.aluguelAtual(d(), c);
  const pctBonif = R.percentualBonificacao(c);
  const desconto = C.descontoPorPercentual(aluguel, pctBonif);
  const alertas = R.contratoAtivo(c, hoje) ? R.alertasContrato(d(), c, hoje).filter((a) => a.tipo !== 'A verificar') : [];
  const cobs = d().cobrancas.filter((x) => x.contrato_id === c.id).sort((a, b) => b.competencia.localeCompare(a.competencia));
  const renovs = d().renovacoes.filter((r) => r.contrato_id === c.id).sort((a, b) => b.data.localeCompare(a.data));
  const cadeia = R.cadeiaDeContratos(d(), c);
  const tel = (c.inquilino_telefone || '').replace(/\D/g, '');
  const lig = (x) => `<a href="#/contrato/${x.id}">${esc(x.inquilino_nome)}</a> (${dataBr(x.data_entrada)} a ${dataBr(x.data_saida)})`;
  const historicoIds = new Set([c.id, ...cadeia.antes.map((x) => x.id), ...cadeia.depois.map((x) => x.id)]);
  return `<p class="suave">${i ? `<a href="#/imovel/${i.id}">← ${esc(i.nome)}</a> · ` : ''}<a href="#/inquilinos">Todos os inquilinos</a></p>
    <div class="cabecalho"><h1>${esc(c.inquilino_nome)}${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}</h1><div class="acoes">
      ${opera() ? link(`#/editar/contratos/${c.id}`, 'Editar', 'botao') : ''}
      ${podeUsuario('admin') ? botao('excluir', 'Excluir', { tabela: 'contratos', id: c.id }, 'perigo', 'Excluir este contrato e todos os seus boletos?') : ''}</div></div>
    ${i ? `<div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>` : `<div class="alerta aviso">Sem imóvel vinculado. Use "Editar" para escolher o imóvel.</div>`}
    ${c.ativo === false ? `<div class="alerta info">Inquilino inativo: não gera boleto.</div>` : ''}
    ${selosContrato(c)}
    ${caixaVerificar(c.verificar)}
    ${cadeia.antes.length || cadeia.depois.length ? `<div class="alerta info">${cadeia.antes.length ? `Continua o contrato de ${cadeia.antes.map(lig).join(' → ')}. ` : ''}${cadeia.depois.length ? `Continuado por ${cadeia.depois.map(lig).join(' → ')}.` : ''}</div>` : ''}
    ${alertas.map((a) => `<div class="alerta ${a.nivel}"><b>${esc(a.tipo)}</b> ${esc(a.texto)}</div>`).join('')}
    <div class="cartao"><h2>Identificação e contato</h2><div class="grade">
      ${item('Telefone', `${esc(c.inquilino_telefone || '-')}${c.inquilino_whatsapp && tel ? ` <a class="etiqueta ok" target="_blank" rel="noopener" href="https://wa.me/${tel.length <= 11 ? `55${tel}` : tel}">WhatsApp</a>` : ''}`)}
      ${item('E-mail', c.inquilino_email ? `<a href="mailto:${esc(c.inquilino_email)}">${esc(c.inquilino_email)}</a>` : '-')}
      ${item('CPF / CNPJ', esc(c.inquilino_cpf || '-'))}${item('RG', esc(c.inquilino_rg || '-'))}
      ${c.responsavel_nome ? item('Outro contato', esc([c.responsavel_nome, c.responsavel_telefone, c.responsavel_email].filter(Boolean).join(' · '))) : ''}</div></div>
    <div class="cartao"><h2>Contrato e valores</h2><div class="grade">
      ${item('Entrada / saída', `${dataBr(c.data_entrada)} a ${dataBr(c.data_saida)}`)}
      ${item('Contrato', `${dataBr(c.vigencia_inicio)} a ${c.prazo_tipo === 'Indeterminado' ? 'prazo indeterminado' : dataBr(c.vigencia_fim)}`)}
      ${item('Aluguel inicial (histórico)', reais(c.aluguel_inicial))}${item('Aluguel atual (cheio)', `<span class="maior">${reais(aluguel)}</span>`)}
      ${item('Bonificação de pontualidade', c.bonificacao === false ? 'não tem' : `${pct(pctBonif)} = ${reais(desconto)}`)}${item('Aluguel com bonificação', reais(aluguel - desconto))}
      ${item('Vencimento', `dia ${c.dia_vencimento} ${c.cobranca_mes_seguinte !== false ? 'do mês seguinte' : 'do próprio mês'}`)}${item('Taxa do boleto', reais(c.taxa_boleto))}
      ${item('Multa por atraso', pct(c.multa_percentual))}${item('Juros por atraso', `${pct(c.juros_mensal_percentual)} ao mês`)}</div>
      ${c.reserva_valor > 0 ? `<h3>Reserva dada na visita</h3><div class="grade">${item('Valor / data', `${reais(c.reserva_valor)} em ${dataBr(c.reserva_data)}`)}${item('Usar no aluguel de', `${compBr(R.competenciaReserva(c))}${c.reserva_competencia ? '' : ' (primeiro aluguel)'}`)}${item('Saldo ainda não usado', reais(R.saldoReserva(d(), c)))}</div>` : ''}
      ${c.observacoes ? `<h3>Observações</h3><p class="pre">${esc(c.observacoes)}</p>` : ''}</div>
    ${caixaIncluso(c)}
    ${caixaGarantia(c)}
    <div class="cartao"><div class="cabecalho"><h2>Correção anual do aluguel (${esc(c.indice_correcao || 'índice não informado')})</h2>${opera() ? link(`#/novo/correcoes?contrato=${c.id}`, 'Registrar correção') : ''}</div>
      <table><tr><th>Vale a partir de</th><th>Índice</th><th class="n">%</th><th class="n">Valor anterior</th><th class="n">Novo valor</th><th></th></tr>
      <tr><td>${dataBr(c.vigencia_inicio)}</td><td colspan="3" class="suave">Valor inicial do contrato</td><td class="n">${reais(c.aluguel_inicial)}</td><td></td></tr>
      ${R.correcoesDo(d(), c.id).map((x) => `<tr><td>${dataBr(x.data_vigencia)}</td><td>${x.indice === 'Negociado' ? etiqueta('Negociado', 'aviso') : esc(x.indice || '-')}</td><td class="n">${pct(x.percentual)}</td><td class="n">${reais(x.valor_anterior)}</td><td class="n"><b>${reais(x.valor_novo)}</b></td><td class="n">${opera() ? botao('excluir', 'Excluir', { tabela: 'correcoes', id: x.id }, 'perigo pequeno', 'Excluir esta correção?') : ''}</td></tr>`).join('')}</table></div>
    <div class="cartao" id="renovacoes"><div class="cabecalho"><h2>Renovação e novo valor negociado</h2>${opera() ? link(`#/novo/renovacoes?contrato=${c.id}`, 'Registrar renovação / novo valor') : ''}</div>
      <p class="suave">No aniversário vale a correção pelo índice do contrato. No fim do prazo, o novo valor é negociado com o inquilino e registrado aqui.</p>
      <table><tr><th>Data</th><th>O que aconteceu</th><th>Novo término</th><th class="n">Novo valor</th><th>Obs.</th></tr>
      ${renovs.map((r) => `<tr><td>${dataBr(r.data)}</td><td>${esc(r.tipo)}</td><td>${dataBr(r.nova_vigencia_fim)}</td><td class="n">${r.novo_valor ? reais(r.novo_valor) : '-'}</td><td>${esc(r.observacoes || '')}</td></tr>`).join('')
      || '<tr><td colspan="5" class="suave">Nenhuma renovação registrada.</td></tr>'}</table></div>
    <div class="cartao"><h2>Boletos</h2><div class="rolagem"><table><tr><th>Competência</th><th>Vencimento</th><th class="n">Valor pontual</th><th>Situação</th><th>Pago em</th><th>Multa e juros</th><th class="n">Valor NF</th><th>NF</th></tr>
      ${cobs.map((x) => { const fs = R.faturasDe(d(), 'cobranca', x.id); return `<tr><td><a href="#/cobranca/${x.id}">${compBr(x.competencia)}</a></td><td>${dataBr(x.vencimento)}</td><td class="n">${reais(R.totais(x).a_pagar_pontual)}</td><td>${situacao(x.situacao)}</td><td>${dataBr(x.data_pagamento)}</td><td>${multaJurosTexto(x)}</td><td class="n">${x.valor_nf !== null ? reais(x.valor_nf) : '-'}</td><td>${fs.length ? `Nº ${R.numeroFatura(fs[0].numero)}` : '-'}</td></tr>`; }).join('') || '<tr><td colspan="8" class="suave">Nenhum boleto gerado ainda. Gere na tela "Boletos".</td></tr>'}</table></div></div>
    <div class="cartao"><div class="cabecalho"><h2>Trocas de titularidade deste inquilino</h2>${opera() && i ? link(`#/novo/titularidades?imovel=${i.id}&contrato=${c.id}`, 'Registrar protocolo') : ''}</div>
      <table><tr><th>Data</th><th>Concessionária</th><th>Tipo</th><th>Protocolo</th><th>Situação</th></tr>
      ${d().titularidades.filter((t) => t.contrato_id === c.id).map((t) => `<tr><td>${dataBr(t.data)}</td><td>${esc(t.concessionaria)}</td><td>${esc(t.tipo || '-')}</td><td><b>${esc(t.protocolo || '-')}</b></td><td>${esc(t.situacao || '-')}</td></tr>`).join('') || '<tr><td colspan="5" class="suave">Nenhum protocolo registrado.</td></tr>'}</table></div>
    ${caixaLeituras(R.leiturasDo(d(), c.id), opera() && i ? link(`#/novo/leituras?imovel=${i.id}&contrato=${c.id}`, 'Registrar leitura') : '', false)}
    ${caixaSaida(c)}
    ${caixaArquivos('contrato', c.id, `Arquivos do inquilino · 📁 ${c.pasta || nomePastaContrato(c)}`, 'arquivos', 'Ficha cadastral, documentos iniciais, contrato, vistoria de entrada e saída, notificações, documento de identificação etc.')}
    <div class="cartao"><h2>Histórico deste inquilino${historicoIds.size > 1 ? ' e dos contratos ligados' : ''}</h2>${tabelaHistorico(ultimos((h) => historicoIds.has(h.contrato_id), 80))}</div>`;
}

// --------------------------------------------------------------------------
// Formulários de cadastro
// --------------------------------------------------------------------------
const opcoesGrupos = () => ordenar(d().imoveis.filter((i) => i.tipo === 'airbnb'), 'nome').map((g) => [String(g.id), g.nome]);

let antesDoVinculo = null;
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
    titulo: (r, q) => {
      const i = buscar('imoveis', r ? r.imovel_id : Number(q.imovel));
      return `${r ? 'Editar' : 'Novo'} inquilino${i ? ` - ${i.nome}` : ''}`;
    },
    campos: (r) => {
      const ops = d().contratos.filter((c) => !r || c.id !== r.id)
        .sort((a, b) => a.inquilino_nome.localeCompare(b.inquilino_nome, 'pt-BR'))
        .map((c) => [String(c.id), `${c.inquilino_nome} (${dataBr(c.data_entrada)} a ${dataBr(c.data_saida)})`]);
      const imoveis = ordenar(d().imoveis.filter((i) => i.tipo !== 'airbnb'), 'nome').map((i) => [String(i.id), i.nome]);
      return F.CONTRATO.filter((c) => r || !c.soEditar)
        .map((c) => (c.nome === 'contrato_anterior_id' ? { ...c, opcoes: ops } : c.nome === 'imovel_id' ? { ...c, opcoes: imoveis } : c));
    },
    padrao: (q) => (q.imovel ? { imovel_id: Number(q.imovel) } : {}),
    valores: (r) => ({ ...r, ativo: r.ativo !== false }),
    voltar: (r, q) => (r ? `#/contrato/${r.id}` : q.vincular ? `#/novo/vinculos?imovel=${q.vincular}` : q.imovel ? `#/imovel/${q.imovel}` : '#/inquilinos'),
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
      if (dados.prazo_tipo === 'Determinado' && !dados.vigencia_fim) erros.vigencia_fim = 'Informe o fim do contrato, ou marque prazo indeterminado';
      dados.pasta = nomePastaContrato({ ...r, ...dados });
    },
    async depois(salvo, antigo) {
      if (!antigo || !antigo.pasta) return;
      const paiAntigo = pastaPaiContrato(antigo);
      const paiNovo = pastaPaiContrato(salvo);
      if (paiAntigo === paiNovo) {
        if (antigo.pasta !== salvo.pasta) await renomearNoDisco([paiNovo], antigo.pasta, salvo.pasta);
        return;
      }
      try {
        const raiz = await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true });
        await S.moverPasta(await S.subpasta(raiz, [paiAntigo]), antigo.pasta, await S.subpasta(raiz, [paiNovo]), salvo.pasta);
      } catch (e) {
        aviso(`Não consegui mover a pasta "${antigo.pasta}" para "${paiNovo}": ${e.message}`, 'aviso');
      }
    },
    destino: (salvo, q) => (R.temFiador(salvo) && !R.fiadoresDo(d(), salvo.id).length ? `#/novo/fiadores?contrato=${salvo.id}`
      : q.vincular ? `#/novo/vinculos?imovel=${q.vincular}&contrato=${salvo.id}` : `#/contrato/${salvo.id}`),
  },
  correcoes: {
    titulo: (r, q) => `Correção do aluguel - ${buscar('contratos', q.contrato).inquilino_nome}`,
    campos: () => F.CORRECAO,
    fixos: (r, q) => ({ contrato_id: Number(q.contrato) }),
    padrao: (q) => ({ indice: buscar('contratos', q.contrato).indice_correcao || '' }),
    destino: (salvo) => {
      const c = buscar('contratos', salvo.contrato_id);
      if (!R.temCaucao(c)) return `#/contrato/${c.id}`;
      aviso('O aluguel foi corrigido: corrija também a caução.', 'aviso');
      return `#/novo/correcoes_garantia?contrato=${c.id}`;
    },
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
    titulo: (r, q) => `Seguro obrigatório - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: () => F.SEGURO,
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    voltar: (r, q) => `#/imovel/${r ? r.imovel_id : q.imovel}`,
    descricao: () => 'Seguro obrigatório',
  },
  iptus: {
    titulo: (r, q) => `IPTU - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: () => F.IPTU,
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    padrao: (q) => {
      // novo ano: parte do ano anterior (mesmas parcelas, 1ª parcela no mesmo mês)
      const ano = Number(q.ano) || new Date().getFullYear();
      const ant = d().iptus.filter((p) => p.imovel_id === Number(q.imovel) && p.ano < ano).sort((a, b) => b.ano - a.ano)[0];
      return ant ? { ano, num_parcelas: ant.num_parcelas, primeira_competencia: `${ano}${ant.primeira_competencia.slice(4)}` } : { ano };
    },
    aviso: (r, q) => {
      const iid = r ? r.imovel_id : Number(q.imovel);
      const ant = d().iptus.filter((p) => p.imovel_id === iid && p.ano < (r ? r.ano : Number(q.ano) || new Date().getFullYear())).sort((a, b) => b.ano - a.ano)[0];
      return ant ? `Ano anterior (${ant.ano}): total ${reais(ant.valor_total)} em ${ant.num_parcelas} parcela(s)${ant.valor_parcela ? ` de ${reais(ant.valor_parcela)}` : ''}.` : 'Primeiro IPTU lançado para este imóvel.';
    },
    ajustar(dados, erros, r, form, q) {
      const iid = r ? r.imovel_id : Number(q.imovel);
      if (d().iptus.some((p) => p.imovel_id === iid && p.ano === dados.ano && (!r || p.id !== r.id))) erros.ano = 'Já existe IPTU deste ano para o imóvel. Use "Editar".';
    },
    voltar: (r, q) => (q && q.de === 'iptu' ? `#/iptu?ano=${r ? r.ano : q.ano}` : `#/imovel/${r ? r.imovel_id : q.imovel}`),
    destino: (salvo, q) => (q.de === 'iptu' ? `#/iptu?ano=${salvo.ano}` : `#/imovel/${salvo.imovel_id}`),
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
      if (r && R.faturasDe(d(), 'recebimento', r.id).length) erros.valor = 'Já tem NF emitida';
      if (!(dados.valor > 0)) erros.valor = 'Informe o valor';
    },
  },
  fiadores: {
    titulo: (r, q) => `${q.substitui ? 'Trocar fiador' : 'Fiador'} - ${buscar('contratos', r ? r.contrato_id : q.contrato).inquilino_nome}`,
    campos: (r, q) => (q && q.substitui ? F.TROCA_FIADOR : F.FIADOR),
    padrao: (q) => (q.substitui ? { data_troca: C.hojeIso() } : {}),
    aviso: (r, q) => (q && q.substitui ? `Substitui ${buscar('fiadores', q.substitui).nome}, que fica guardado em "Fiadores anteriores".` : ''),
    fixos: (r, q) => (r || q.substitui ? {} : { contrato_id: Number(q.contrato) }),
    salvar(db, dados, q, r) {
      if (q.substitui) return R.trocarFiador(db, Number(q.substitui), dados, login());
      if (r) { R.atualizar(db, 'fiadores', r.id, dados, login(), `Fiador ${dados.nome}`); return R.buscar(db, 'fiadores', r.id); }
      return R.inserir(db, 'fiadores', dados, login(), `Fiador ${dados.nome}`);
    },
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}`,
    descricao: (dados) => `Fiador ${dados.nome}`,
  },
  aplicacoes: {
    titulo: (r, q) => `Aplicação da garantia - ${buscar('contratos', r ? r.contrato_id : q.contrato).inquilino_nome}`,
    campos: () => F.APLICACAO.map((c) => (c.nome === 'emitente_id' ? { ...c, opcoes: d().emitentes.filter((e) => e.ativo).map((e) => [String(e.id), e.nome]) } : c)),
    fixos: (r, q) => (r ? {} : { contrato_id: Number(q.contrato) }),
    padrao: (q) => {
      const s = R.situacaoAplicacao(d(), buscar('contratos', q.contrato));
      const l = s.linhas.find((x) => x.falta > 0);
      return { data: C.hojeIso(), emitente_id: l ? String(l.emitente.id) : '', valor: l ? l.falta : null };
    },
    aviso: (r, q) => { const s = R.situacaoAplicacao(d(), buscar('contratos', q.contrato)); return `Garantia ${reais(s.total)}: ${s.linhas.map((l) => `${l.emitente.nome} aplicado ${reais(l.aplicado)} de ${reais(l.meta)}`).join('; ')}.`; },
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}`,
    descricao: (dados) => `Garantia aplicada: ${reais(dados.valor)}`,
  },
  correcoes_garantia: {
    titulo: (r, q) => `Correção da caução - ${buscar('contratos', q.contrato).inquilino_nome}`,
    campos: () => F.CORRECAO_GARANTIA,
    fixos: (r, q) => ({ contrato_id: Number(q.contrato) }),
    padrao: (q) => {
      const c = buscar('contratos', q.contrato);
      const ult = R.correcoesDo(d(), c.id).pop();
      return { data: ult ? ult.data_vigencia : C.hojeIso(), valor_novo: R.caucaoSugerida(d(), c, ult ? ult.data_vigencia : C.hojeIso()) };
    },
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); return `Caução atual: ${reais(R.valorGarantia(d(), c))}${c.caucao_meses ? ` (${c.caucao_meses} aluguéis com bonificação)` : ''}.`; },
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    descricao: (dados) => `Caução corrigida para ${reais(dados.valor_novo)}`,
    ajustar(dados, erros, r, form, q) {
      const anterior = R.valorGarantia(d(), buscar('contratos', q.contrato));
      dados.valor_anterior = anterior;
      if (dados.complemento === null) dados.complemento = dados.valor_novo - anterior;
    },
  },
  trocas_garantia: {
    titulo: (r, q) => `Trocar tipo de garantia - ${buscar('contratos', q.contrato).inquilino_nome}`,
    campos: () => F.TROCA_GARANTIA,
    padrao: (q) => ({ data: C.hojeIso(), caucao_meses: buscar('contratos', q.contrato).caucao_meses || null }),
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); const v = R.valorGarantia(d(), c); return `Garantia atual: ${c.garantia_tipo || 'não informada'}${v ? ` de ${reais(v)}` : ''}. Ela fica guardada no histórico do contrato.`; },
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    destino: (salvo, q) => (R.temFiador({ garantia_tipo: salvo.tipo_novo }) && !R.fiadoresDo(d(), Number(q.contrato)).length ? `#/novo/fiadores?contrato=${q.contrato}` : `#/contrato/${q.contrato}`),
    ajustar(dados, erros) {
      if (dados.garantia_tipo === 'Caução' && !(dados.caucao_valor > 0)) erros.caucao_valor = 'Informe o valor da caução';
      if (R.temDeposito(dados) && !(dados.deposito_valor > 0)) erros.deposito_valor = 'Informe o valor do depósito';
    },
    salvar: (db, dados, q) => R.trocarGarantia(db, Number(q.contrato), dados, login()),
  },
  vinculos: {
    titulo: (r, q) => `Vincular inquilino - ${buscar('imoveis', q.imovel).nome}`,
    campos: () => {
      const ops = d().contratos.filter((c) => !c.imovel_id).sort((a, b) => (b.ativo !== false) - (a.ativo !== false) || a.inquilino_nome.localeCompare(b.inquilino_nome, 'pt-BR'))
        .map((c) => [String(c.id), `${c.inquilino_nome}${c.ativo === false ? ' (inativo)' : ''}`]);
      return F.VINCULO.map((c) => (c.nome === 'contrato_id' ? { ...c, opcoes: ops } : c));
    },
    padrao: (q) => { const c = q.contrato ? buscar('contratos', q.contrato) : null; return { contrato_id: c ? c.id : null, data_entrada: (c && c.data_entrada) || C.hojeIso() }; },
    aviso: (r, q) => (d().contratos.some((c) => !c.imovel_id) ? '' : 'Não há inquilino cadastrado sem imóvel. Cadastre o inquilino primeiro (link abaixo do formulário).'),
    extraHtml: (r, q) => `<p class="suave" style="margin-top:12px">O inquilino não está na lista? ${link(`#/novo/contratos?vincular=${q.imovel}`, 'Cadastrar novo inquilino')}</p>`,
    voltar: (r, q) => `#/imovel/${q.imovel}`,
    salvar(db, dados, q) {
      antesDoVinculo = { ...R.buscar(db, 'contratos', dados.contrato_id) };
      const c = R.vincularInquilino(db, Number(q.imovel), dados, login());
      if (c.pasta !== nomePastaContrato(c)) R.atualizar(db, 'contratos', c.id, { pasta: nomePastaContrato(c) }, login(), 'Pasta de arquivos');
      return c;
    },
    depois: (salvo) => CADASTROS.contratos.depois(salvo, antesDoVinculo),
    destino: (salvo) => `#/contrato/${salvo.id}`,
  },
  leituras: {
    titulo: (r, q) => `Leitura dos relógios - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: (r, q) => {
      const imovelId = r ? r.imovel_id : Number(q.imovel);
      const ops = d().contratos.filter((c) => c.imovel_id === imovelId).sort((a, b) => b.data_entrada.localeCompare(a.data_entrada))
        .map((c) => [String(c.id), `${c.inquilino_nome} (${dataBr(c.data_entrada)} a ${dataBr(c.data_saida)})`]);
      return [...F.LEITURA.slice(0, 2), { nome: 'contrato_id', rotulo: 'Inquilino', tipo: 'opcao', opcoes: ops, ajuda: 'Em branco: imóvel vazio' }, ...F.LEITURA.slice(2)];
    },
    padrao: (q) => ({ data: C.hojeIso(), contrato_id: q.contrato ? Number(q.contrato) : null, momento: q.contrato ? 'Entrada do inquilino' : 'Outra' }),
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    voltar: (r, q) => (q.contrato ? `#/contrato/${q.contrato}` : `#/imovel/${r ? r.imovel_id : q.imovel}`),
    descricao: (dados) => `${dados.momento}: ${R.textoLeitura(dados)}`,
    ajustar(dados, erros) {
      if (!F.LEITURAS.some(([k]) => dados[k])) erros.agua = 'Informe pelo menos uma leitura';
    },
  },
  renovacoes: {
    titulo: (r, q) => `Renovação / novo valor - ${buscar('contratos', q.contrato).inquilino_nome}`,
    campos: () => F.RENOVACAO,
    padrao: (q) => { const c = buscar('contratos', q.contrato); return { data: c.vigencia_fim || C.hojeIso(), tipo: 'Renovado com nova data de término' }; },
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); return `Aluguel atual ${reais(R.aluguelAtual(d(), c))}. Contrato ${c.prazo_tipo === 'Indeterminado' ? 'por prazo indeterminado' : `até ${dataBr(c.vigencia_fim)}`}.`; },
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    ajustar(dados, erros) {
      if (dados.tipo === 'Renovado com nova data de término' && !dados.nova_vigencia_fim) erros.nova_vigencia_fim = 'Informe a nova data de término';
      if (dados.tipo === 'Passou a prazo indeterminado') dados.nova_vigencia_fim = null;
      if (dados.tipo === 'Novo valor negociado' && !(dados.novo_valor > 0)) erros.novo_valor = 'Informe o novo valor';
    },
    salvar: (db, dados, q) => R.registrarRenovacao(db, Number(q.contrato), dados, login()),
  },
  encerramentos: {
    titulo: (r, q) => `Saída e cálculo final - ${buscar('contratos', q.contrato).inquilino_nome}`,
    campos: () => F.ENCERRAMENTO,
    padrao: (q) => {
      const c = buscar('contratos', q.contrato);
      const aberto = R.cobrancasEmAberto(d(), c.id);
      return {
        data_saida: c.data_saida || C.hojeIso(), garantia_valor: R.valorGarantia(d(), c),
        debitos: aberto.reduce((s, cb) => s + R.totais(cb).a_pagar_sem_desconto, 0),
        debitos_descricao: aberto.map((cb) => `Aluguel ${compBr(cb.competencia)} em aberto: ${reais(R.totais(cb).a_pagar_sem_desconto)}`).join('\n'),
      };
    },
    aviso: (r, q) => 'Confira o boleto do último mês: com a data de saída preenchida, o aluguel do mês de saída é gerado proporcional aos dias. A garantia é corrigida pelo índice da poupança que você informar.',
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    ajustar(dados) { for (const k of ['garantia_valor', 'indice_percentual', 'debitos']) if (dados[k] === null) dados[k] = 0; },
    salvar: (db, dados, q) => R.encerrarContrato(db, Number(q.contrato), dados, login()),
  },
  avulsas: {
    titulo: (r) => (r ? 'Editar NF avulsa' : 'Nova NF avulsa'),
    campos: () => F.AVULSA.map((c) => (c.nome === 'imovel_id' ? { ...c, opcoes: ordenar(d().imoveis, 'nome').map((i) => [String(i.id), i.nome]) } : c)),
    voltar: () => '#/faturas',
    descricao: (dados) => `NF avulsa: ${dados.tomador_nome} ${reais(dados.valor)}`,
    ajustar(dados, erros, r) {
      if (r && R.faturasDe(d(), 'avulsa', r.id).length) erros.valor = 'Já tem número de NF';
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
    titulo: (r) => `Alterar boleto ${compBr(r.competencia)} - ${buscar('contratos', r.contrato_id).inquilino_nome}`,
    campos: () => F.COBRANCA,
    voltar: (r) => `#/cobranca/${r.id}`,
    descricao: () => 'Valores do boleto alterados',
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
  let valores = estado ? estado.valores : F.paraFormulario(campos, registro && cfg.valores ? cfg.valores(registro) : registro);
  if (!registro && !estado) {
    const padroes = Object.fromEntries(campos.filter((c) => c.nome && c.padrao !== undefined).map((c) => [c.nome, c.padrao]));
    valores = F.paraFormulario(campos, { ...padroes, ...(cfg.padrao ? cfg.padrao(q) : {}) });
  }
  const base = cfg.base ? cfg.base(registro) : null;
  const avisoTexto = cfg.aviso ? cfg.aviso(registro, q) : '';
  return `<h1>${esc(cfg.titulo(registro, q))}</h1>${avisoTexto ? `<div class="alerta info">${esc(avisoTexto)}</div>` : ''}
    <form class="cartao" data-form="cadastro" ${base !== null && base !== undefined ? `data-base="${base}"` : ''}>
      ${F.camposHtml(campos, valores, estado ? estado.erros : {})}${cfg.extraHtml ? cfg.extraHtml(registro, q) : ''}
      <p class="acoes" style="margin-top:16px"><button>Salvar</button><a class="botao secundario" href="${cfg.voltar(registro, q)}">Voltar</a></p></form>`;
}

// --------------------------------------------------------------------------
// Cobranças do mês
// --------------------------------------------------------------------------
/** Taxa do boleto usada pela maioria dos inquilinos ativos (sugestão do campo "para todos"). */
function taxaMaisComum() {
  const cont = new Map();
  for (const c of d().contratos) if (R.contratoAtivo(c, C.hojeIso())) cont.set(c.taxa_boleto || 0, (cont.get(c.taxa_boleto || 0) || 0) + 1);
  return [...cont].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
}

function telaCobrancas(comp) {
  const hoje = C.hojeIso();
  const lista = d().cobrancas.filter((x) => x.competencia === comp).map((cb) => {
    const c = buscar('contratos', cb.contrato_id);
    return { cb, c, i: buscar('imoveis', c.imovel_id), t: R.totais(cb), fs: R.faturasDe(d(), 'cobranca', cb.id) };
  }).sort((a, b) => (a.i ? a.i.nome : '').localeCompare(b.i ? b.i.nome : '', 'pt-BR'));
  const faltando = d().contratos.filter((c) => c.ativo !== false && c.imovel_id && C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0 && !lista.some((x) => x.c.id === c.id));
  const pend = R.pendentesDeFatura(d());
  const soma = (f) => lista.reduce((s, x) => s + f(x), 0);
  return `<div class="cabecalho"><h1>Boletos de ${compBr(comp)}</h1>
      <div class="acoes"><a class="botao secundario" href="#/cobrancas?comp=${C.somarMeses(comp, -1)}">← ${compBr(C.somarMeses(comp, -1))}</a>
      <form data-form="irMes" class="acoes"><input type="month" name="comp" value="${comp}" style="width:160px"><button class="secundario">Ir</button></form>
      <a class="botao secundario" href="#/cobrancas?comp=${C.somarMeses(comp, 1)}">${compBr(C.somarMeses(comp, 1))} →</a></div></div>
    <p class="suave">Competência é o mês de uso do imóvel. Ao receber, informe a data do pagamento e clique em Confirmar. Depois, numere as NFs: a numeração segue a ordem das datas de pagamento.</p>
    ${faltando.length && opera() ? `<div class="alerta aviso">${faltando.length} contrato(s) ainda sem boleto neste mês: ${faltando.map((c) => esc(c.inquilino_nome)).join(', ')}. ${botao('gerarCobrancas', `Gerar boletos de ${compBr(comp)}`, { comp }, 'pequeno')}</div>` : ''}
    ${opera() ? `<form data-form="taxaBoleto" data-comp="${comp}" class="cartao acoes" style="align-items:center">
      <label for="taxa_todos"><b>Taxa de emissão do boleto para todos</b></label>
      <input id="taxa_todos" name="valor" inputmode="decimal" value="${esc(C.reais(taxaMaisComum(), false))}" style="width:120px">
      <button class="secundario">Aplicar a todos</button>
      <span class="suave">Vale para todos os inquilinos ativos e para os boletos ainda não pagos de ${compBr(comp)}.</span></form>` : ''}
    ${pend.length && opera() ? `<div class="alerta info">${pend.length} pagamento(s) aguardando número de NF. ${botao('numerar', 'Numerar NFs agora', {}, 'pequeno')}</div>` : ''}
    <div class="cartao rolagem"><table class="cobrancas">
      <tr><th>Imóvel / inquilino</th><th>Vencimento</th><th class="n">Pontual</th><th class="n">Após vencimento</th><th>Pagamento</th><th>Multa e juros</th><th class="n">Valor NF</th><th>NF</th></tr>
      ${lista.map(({ cb, c, i, t, fs }) => `<tr>
        <td><a href="#/cobranca/${cb.id}"><b>${esc(i.nome)}</b></a><br>${esc(c.inquilino_nome)}
          ${cb.dias_cobrados < cb.dias_mes ? `<br>${etiqueta(`proporcional ${cb.dias_cobrados}/${cb.dias_mes} dias`, 'info')}` : ''}
          ${cb.reserva_utilizada > 0 ? `<br>${etiqueta(`usa reserva ${reais(cb.reserva_utilizada)}`, 'aviso')}` : ''}</td>
        <td>${dataBr(cb.vencimento)}${!cb.data_pagamento && cb.vencimento < hoje ? `<br>${etiqueta('vencida', 'perigo')}` : ''}
          ${!cb.data_pagamento ? `<br>${botao('copiar', 'Copiar texto do boleto', { texto: R.dadosBoleto(d(), cb).descricao })}` : ''}</td>
        <td class="n">${reais(t.a_pagar_pontual)}</td>
        <td class="n suave">${reais(t.a_pagar_sem_desconto)}<br>+ multa ${pct(cb.multa_percentual)}<br>+ juros ${pct(cb.juros_mensal_percentual)} a.m.</td>
        <td>${cb.data_pagamento ? `${situacao(cb.situacao)}<br><span class="suave">em ${dataBr(cb.data_pagamento)}${cb.dias_atraso ? ` (${cb.dias_atraso} dias de atraso)` : ''}<br>recebido ${reais(cb.valor_pago)}</span>${opera() && !fs.length ? `<br>${botao('estornar', 'Desfazer', { id: cb.id }, 'secundario pequeno', 'Desfazer este pagamento?')}` : ''}`
          : (opera() ? `<form data-form="pagamento" data-id="${cb.id}" class="pagamento"><input type="date" name="data" value="${hoje}" title="Data em que o dinheiro entrou"><input name="valor" placeholder="valor pago" title="Opcional: valor efetivamente recebido" inputmode="decimal"><button class="pequeno">Confirmar</button></form>` : situacao(cb.situacao))}</td>
        <td>${multaJurosTexto(cb)}</td>
        <td class="n">${cb.valor_nf !== null ? reais(cb.valor_nf) : '-'}</td>
        <td>${fs.length ? link(`#/imprimir/faturas?numero=${fs[0].numero}`, `Nº ${R.numeroFatura(fs[0].numero)}`) : (cb.data_pagamento ? '<span class="suave">aguardando nº</span>' : '-')}</td></tr>`).join('')
      || `<tr><td colspan="8" class="suave">Nenhum boleto gerado para ${compBr(comp)}.</td></tr>`}
      ${lista.length ? `<tr class="total"><td colspan="2">Total</td><td class="n">${reais(soma((x) => x.t.a_pagar_pontual))}</td><td></td><td></td><td></td><td class="n">${reais(soma((x) => x.cb.valor_nf || 0))}</td><td></td></tr>` : ''}
    </table></div>
    ${lista.length ? `<div class="acoes"><a class="botao secundario" target="_blank" href="#/imprimir/demonstrativos?comp=${comp}">Imprimir demonstrativos do mês</a>
      <a class="botao secundario" href="#/faturas">Ver NFs</a></div>` : ''}`;
}

function demonstrativo(cb) {
  const c = buscar('contratos', cb.contrato_id);
  const i = buscar('imoveis', c.imovel_id);
  const t = R.totais(cb);
  const linha = (txt, v) => `<tr><td>${txt}</td><td class="n">${v}</td></tr>`;
  return `<div class="demonstrativo"><div class="cabecalho"><div><h2 style="margin:0">Demonstrativo do boleto de aluguel</h2><div class="suave">Competência ${compBr(cb.competencia)}</div></div>
      <div style="text-align:right"><div class="suave">Vencimento</div><div class="maior"><b>${dataBr(cb.vencimento)}</b></div></div></div>
    <div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>
    <p><b>Inquilino:</b> ${esc(c.inquilino_nome)}${c.inquilino_cpf ? ` · CPF/CNPJ ${esc(c.inquilino_cpf)}` : ''}${c.inquilino_telefone ? ` · ${esc(c.inquilino_telefone)}` : ''}</p>
    <table><tr><th>Descrição</th><th class="n">Valor</th></tr>
      ${linha(`Aluguel${cb.dias_cobrados < cb.dias_mes ? ` proporcional: ${cb.dias_cobrados} de ${cb.dias_mes} dias de ${reais(cb.aluguel_mensal)}` : ''}`, reais(cb.aluguel))}
      ${cb.iptu ? linha(`IPTU${cb.iptu_parcela ? ` (${esc(cb.iptu_parcela)})` : ''}`, reais(cb.iptu)) : ''}
      ${cb.seguro ? linha(`Seguro obrigatório${cb.seguro_parcela ? ` (${esc(cb.seguro_parcela)})` : ''}`, reais(cb.seguro)) : ''}
      ${cb.taxa_boleto ? linha('Tarifa de emissão do boleto', reais(cb.taxa_boleto)) : ''}
      ${cb.outros > 0 ? linha(`Cobrança adicional${cb.outros_descricao ? `: ${esc(cb.outros_descricao)}` : ''}`, reais(cb.outros)) : ''}
      ${cb.outros < 0 ? linha(`(-) Ressarcimento${cb.outros_descricao ? `: ${esc(cb.outros_descricao)}` : ''}`, `- ${reais(-cb.outros)}`) : ''}
      <tr class="total"><td>Total sem desconto</td><td class="n">${reais(t.total_sem_desconto)}</td></tr>
      ${cb.desconto ? linha('(-) Desconto de pontualidade, se pago até o vencimento', `- ${reais(cb.desconto)}`) : ''}
      ${cb.reserva_utilizada ? linha('(-) Reserva paga na visita, abatida neste mês', `- ${reais(cb.reserva_utilizada)}`) : ''}
      <tr class="total"><td>Valor a pagar até ${dataBr(cb.vencimento)}</td><td class="n maior">${reais(t.a_pagar_pontual)}</td></tr>
      <tr><td colspan="2" class="suave">Após o vencimento: ${reais(t.a_pagar_sem_desconto)} + multa de ${pct(cb.multa_percentual)} + juros de ${pct(cb.juros_mensal_percentual)} ao mês, pro rata dia.</td></tr></table>
    ${cb.data_pagamento ? `<p><b>Pago em ${dataBr(cb.data_pagamento)}</b>${cb.dias_atraso ? ` com ${cb.dias_atraso} dia(s) de atraso: multa ${pct(cb.multa_percentual)} = ${reais(cb.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(cb.juros)}` : ''} · recebido ${reais(cb.valor_pago)}</p>` : ''}
    ${cb.observacoes ? `<p class="pre">${esc(cb.observacoes)}</p>` : ''}</div>`;
}

/** Ajuste do mês: cobrança adicional ou ressarcimento (reforma, acerto etc.). Fica no histórico. */
function caixaAjuste(cb) {
  if (!opera() || cb.data_pagamento) return '';
  const tipo = cb.outros < 0 ? 'ressarcimento' : 'adicional';
  return `<div class="cartao"><h2>Ajuste deste mês</h2>
    <p class="suave">Para corrigir o valor do boleto: cobrar algo a mais ou devolver/descontar um valor (reforma, acerto do mês anterior etc.). Fica registrado no histórico do inquilino.</p>
    <form data-form="ajuste" data-id="${cb.id}" class="acoes">
      <select name="tipo" style="width:auto"><option value="adicional" ${tipo === 'adicional' ? 'selected' : ''}>Cobrança adicional (+)</option><option value="ressarcimento" ${tipo === 'ressarcimento' ? 'selected' : ''}>Ressarcimento (−)</option></select>
      <input name="valor" inputmode="decimal" placeholder="Valor" value="${cb.outros ? esc(F.dinheiroTexto(Math.abs(cb.outros))) : ''}" style="width:130px">
      <input name="motivo" placeholder="Motivo (ex.: reforma do banheiro)" value="${esc(cb.outros_descricao || '')}" style="flex:1;min-width:220px">
      <button class="secundario">Salvar ajuste</button>
      ${cb.outros ? botao('tirarAjuste', 'Tirar ajuste', { id: cb.id }, 'perigo pequeno', 'Tirar o ajuste deste boleto?') : ''}</form></div>`;
}

function caixaBoleto(cb) {
  const b = R.dadosBoleto(d(), cb);
  const linha = (rotulo, valor, copia = valor) => `<tr><td class="suave">${rotulo}</td><td><b>${esc(valor)}</b></td><td class="n">${botao('copiar', 'Copiar', { texto: copia })}</td></tr>`;
  const num = (c) => C.reais(c, false);
  return `<div class="cartao boleto"><h2>Dados para emitir o boleto no banco</h2>
    <table>${linha('Pagador', `${b.pagador}${b.documento_pagador ? ` · ${b.documento_pagador}` : ''}`, b.pagador)}
    ${linha('Nº do documento', b.numero_documento)}${linha('Vencimento', dataBr(b.vencimento))}
    ${linha('Valor do documento', reais(b.valor), num(b.valor))}
    ${b.desconto ? linha(`Desconto se pago até ${dataBr(b.vencimento)}`, `${reais(b.desconto)} (fica ${reais(b.valor_com_desconto)})`, num(b.desconto)) : ''}
    ${linha('Multa após o vencimento', pct(b.multa_percentual), String(b.multa_percentual).replace('.', ','))}
    ${linha('Juros (mora) ao dia', reais(b.juros_ao_dia), num(b.juros_ao_dia))}</table>
    <h3>Descrição</h3><div class="acoes"><pre class="descricao-boleto">${esc(b.descricao)}</pre>${botao('copiar', 'Copiar descrição', { texto: b.descricao }, '')}</div></div>`;
}

function telaCobranca(cb) {
  const c = buscar('contratos', cb.contrato_id);
  const fs = R.faturasDe(d(), 'cobranca', cb.id, false);
  const validas = fs.filter((f) => f.situacao === 'Emitida');
  const sim = cb.data_pagamento ? null : C.liquidar(cb, C.hojeIso());
  return `<div class="nao-imprimir"><p class="suave"><a href="#/cobrancas?comp=${cb.competencia}">← Boletos de ${compBr(cb.competencia)}</a> · <a href="#/contrato/${c.id}">${esc(c.inquilino_nome)}</a></p>
    <div class="cabecalho"><h1>Boleto ${compBr(cb.competencia)} ${situacao(cb.situacao)}</h1><div class="acoes">
      <button class="secundario" data-acao="imprimir">Imprimir demonstrativo</button>
      ${opera() && !cb.data_pagamento ? `${link(`#/editar/cobrancas/${cb.id}`, 'Alterar valores', 'botao secundario')} ${botao('excluir', 'Excluir', { tabela: 'cobrancas', id: cb.id }, 'perigo', 'Excluir este boleto?')}` : ''}</div></div></div>
    ${demonstrativo(cb)}
    <div class="nao-imprimir">${caixaAjuste(cb)}${caixaBoleto(cb)}<div class="cartao"><h2>Pagamento</h2>
      ${cb.data_pagamento ? `<div class="grade">${item('Pago em', dataBr(cb.data_pagamento))}${item('Situação', `${esc(cb.situacao)}${cb.dias_atraso ? ` (${cb.dias_atraso} dias)` : ''}`)}
        ${item(`Multa (${pct(cb.multa_percentual)})`, reais(cb.multa))}${item(`Juros (${pct(cb.juros_mensal_percentual)} ao mês)`, reais(cb.juros))}
        ${item('Valor recebido', reais(cb.valor_pago))}${item('Valor da nota fiscal', `<span class="maior">${reais(cb.valor_nf)}</span>`)}</div>
        <p class="suave">Nota fiscal = ${cb.dias_atraso ? `aluguel ${reais(cb.aluguel)} + multa ${reais(cb.multa)} + juros ${reais(cb.juros)} (pagou atrasado, sem desconto)` : `aluguel ${reais(cb.aluguel)} - desconto ${reais(cb.desconto)} (pagou em dia)`}. IPTU, seguro, tarifa e ajuste do mês não entram.</p>
        ${opera() ? botao('estornar', 'Desfazer pagamento', { id: cb.id }, 'perigo pequeno', validas.length ? 'Desfazer o pagamento? A NF será cancelada e o número não será reaproveitado.' : 'Desfazer o pagamento?') : ''}`
      : `<p>Se for pago hoje (${dataBr(C.hojeIso())}): <b>${reais(sim.valor_devido)}</b>${sim.pontual ? '' : ` (${sim.dias_atraso} dias de atraso: multa ${pct(cb.multa_percentual)} = ${reais(sim.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(sim.juros)})`} · nota fiscal ${reais(sim.valor_nf)}</p>
        ${opera() ? `<form data-form="pagamento" data-id="${cb.id}" class="pagamento"><label>Data do pagamento</label><input type="date" name="data" value="${C.hojeIso()}"><label>Valor pago (opcional)</label><input name="valor" inputmode="decimal"><button>Confirmar pagamento</button></form>` : ''}`}</div>
    <div class="cartao"><h2>NFs</h2><table><tr><th>Nº</th><th>Empresa</th><th>Emissão</th><th>Período</th><th class="n">%</th><th class="n">Valor</th><th>Situação</th></tr>
      ${fs.map((f) => `<tr><td>${R.numeroFatura(f.numero)}</td><td>${esc(buscar('emitentes', f.emitente_id).nome)}</td><td>${dataBr(f.emissao)}</td><td>${dataBr(f.periodo_inicio)} a ${dataBr(f.periodo_fim)}</td><td class="n">${pct(f.percentual)}</td><td class="n">${reais(f.valor)}</td><td>${etiqueta(f.situacao, f.situacao === 'Emitida' ? 'ok' : 'perigo')}</td></tr>`).join('')
      || `<tr><td colspan="7" class="suave">${cb.data_pagamento ? 'Aguardando numeração (tela NF).' : 'Confirme o pagamento para gerar a NF.'}</td></tr>`}</table>
      ${validas.length ? `<p class="acoes">${link(`#/imprimir/faturas?numero=${validas[0].numero}`, 'Ver / imprimir NF', 'botao')} ${botao('excel', 'Baixar Excel', { numero: validas[0].numero })}</p>` : ''}</div></div>`;
}

// --------------------------------------------------------------------------
// Faturas
// --------------------------------------------------------------------------
function origemTexto(f) {
  if (f.origem_tipo === 'cobranca') {
    const cb = buscar('cobrancas', f.origem_id);
    return cb ? `<a href="#/cobranca/${cb.id}">Aluguel ${compBr(cb.competencia)}</a>` : 'Aluguel';
  }
  if (f.origem_tipo === 'avulsa') {
    const a = buscar('avulsas', f.origem_id);
    return `Avulsa${a && a.descricao ? `: ${esc(a.descricao)}` : ''}`;
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
  return `<div class="cabecalho"><h1>NFs emitidas em ${compBr(mes)}</h1>
      <div class="acoes"><a class="botao secundario" href="#/faturas?mes=${C.somarMeses(mes, -1)}">← ${compBr(C.somarMeses(mes, -1))}</a>
      <form data-form="irMesFatura" class="acoes"><input type="month" name="mes" value="${mes}" style="width:160px"><button class="secundario">Ir</button></form>
      <a class="botao secundario" href="#/faturas?mes=${C.somarMeses(mes, 1)}">${compBr(C.somarMeses(mes, 1))} →</a></div></div>
    <div class="cartao"><h2>Pagamentos aguardando número</h2>
      <p class="suave">Última NF: ${ultima ? `<b>Nº ${R.numeroFatura(ultima.numero)}</b> de ${dataBr(ultima.emissao)}` : 'nenhuma ainda'} · próximo número: <b>${R.numeroFatura(d().proxima_fatura)}</b>. A numeração segue a data em que o dinheiro entrou, e a data de emissão é a data do pagamento.</p>
      ${pend.length ? `<table><tr><th>Ordem</th><th>Pagamento em</th><th>Origem</th><th class="n">Valor da NF</th></tr>
        ${pend.map((p, n) => { const b = R.baseDaFatura(d(), p.tipo, p.registro); return `<tr class="${ultima && p.data < ultima.emissao ? 'fora' : ''}"><td>${R.numeroFatura(d().proxima_fatura + n)}</td><td>${dataBr(p.data)}${ultima && p.data < ultima.emissao ? ` ${etiqueta('anterior à última NF', 'perigo')}` : ''}</td><td>${esc(b.descricao)}</td><td class="n">${reais(b.valor)}</td></tr>`; }).join('')}</table>
        ${opera() ? `<p>${botao('numerar', 'Numerar estas NFs', {}, '')}</p>` : ''}`
      : '<p class="suave">Nenhum pagamento aguardando número.</p>'}</div>
    ${caixaAvulsas()}
    <div class="cartao rolagem"><table><tr><th>Nº</th><th>Emissão</th><th>Cliente</th><th>Origem</th><th>Empresas</th><th class="n">Total</th><th>Situação</th><th></th></tr>
      ${grupos.map(([n, fs]) => `<tr><td><b>${R.numeroFatura(n)}</b></td><td>${dataBr(fs[0].emissao)}</td><td>${esc(fs[0].tomador_nome)}</td><td>${origemTexto(fs[0])}</td>
        <td>${fs.map((f) => `${esc(buscar('emitentes', f.emitente_id).nome)}: ${reais(f.valor)}`).join('<br>')}</td><td class="n">${reais(fs.reduce((s, f) => s + f.valor, 0))}</td>
        <td>${etiqueta(fs[0].situacao, fs[0].situacao === 'Emitida' ? 'ok' : 'perigo')}</td>
        <td class="n nw">${fs[0].situacao === 'Emitida' ? `${link(`#/imprimir/faturas?numero=${n}`, 'Ver')} ${botao('excel', 'Excel', { numero: n })}${fs[0].origem_tipo === 'avulsa' && opera() ? ` ${botao('cancelarAvulsa', 'Cancelar', { id: fs[0].origem_id }, 'perigo pequeno', 'Cancelar esta NF avulsa? O número não será reaproveitado.')}` : ''}` : ''}</td></tr>`).join('')
      || `<tr><td colspan="8" class="suave">Nenhuma NF emitida em ${compBr(mes)}.</td></tr>`}</table></div>
    ${grupos.length ? `<div class="acoes"><a class="botao" target="_blank" href="#/imprimir/faturas?mes=${mes}">Imprimir todas as NFs de ${compBr(mes)}</a> ${botao('excelMes', 'Baixar todas em Excel (ZIP)', { mes })}</div>` : ''}`;
}

function caixaAvulsas() {
  const pend = d().avulsas.filter((a) => !R.faturasDe(d(), 'avulsa', a.id).length);
  return `<div class="cartao"><div class="cabecalho"><h2>NFs avulsas</h2>${opera() ? link('#/novo/avulsas', 'Nova NF avulsa', 'botao') : ''}</div>
    <p class="suave">Para notas fora da regra: a nota mensal geral do AIRBNB, ou uma nota com cliente e imóvel que você escolher. Entram na mesma sequência de números, pela data do pagamento. Sem imóvel, o valor é dividido igualmente entre as empresas ativas.</p>
    ${pend.length ? `<table><tr><th>Pagamento em</th><th>Cliente</th><th>Descrição</th><th class="n">Valor</th><th></th></tr>
      ${pend.map((a) => `<tr><td>${dataBr(a.data_pagamento)}</td><td>${esc(a.tomador_nome)}</td><td>${esc(a.descricao || '')}</td><td class="n">${reais(a.valor)}</td>
        <td class="n">${opera() ? `${link(`#/editar/avulsas/${a.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'avulsas', id: a.id }, 'perigo pequeno', 'Excluir esta NF avulsa?')}` : ''}</td></tr>`).join('')}</table>` : ''}</div>`;
}

/** Inquilinos atuais e anteriores, com o resumo da saída. */
function telaInquilinos(q) {
  const hoje = C.hojeIso();
  const busca = String(q.busca || '').trim().toLocaleLowerCase('pt-BR');
  let todos = d().contratos.map((c) => ({ c, i: c.imovel_id ? buscar('imoveis', c.imovel_id) : null, e: R.encerramentoDo(d(), c.id) }));
  if (busca) todos = todos.filter((x) => [x.c.inquilino_nome, x.c.inquilino_apelido, x.c.inquilino_cpf, x.i && x.i.nome].some((t) => String(t || '').toLocaleLowerCase('pt-BR').includes(busca)));
  const porNome = (a, b) => (a.i ? a.i.nome : '~').localeCompare(b.i ? b.i.nome : '~', 'pt-BR') || a.c.inquilino_nome.localeCompare(b.c.inquilino_nome, 'pt-BR');
  const atuais = todos.filter((x) => R.contratoAtivo(x.c, hoje)).sort(porNome);
  const anteriores = todos.filter((x) => !R.contratoAtivo(x.c, hoje)).sort((a, b) => String(b.c.data_saida || '9').localeCompare(String(a.c.data_saida || '9')));
  const anterior = (c) => (c.contrato_anterior_id ? buscar('contratos', c.contrato_anterior_id) : null);
  const nome = ({ c }) => `<a href="#/contrato/${c.id}"><b>${esc(c.inquilino_nome)}</b></a>${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}${anterior(c) ? `<br><span class="suave">continua ${esc(anterior(c).inquilino_nome)}</span>` : ''}`;
  const ativo = (c) => `<input type="checkbox" title="Inquilino ativo (gera boleto)" data-acao="alternarAtivo" data-id="${c.id}" ${c.ativo !== false ? 'checked' : ''} ${opera() ? '' : 'disabled'}>`;
  const imovel = (x) => (x.i ? `<a href="#/imovel/${x.i.id}">${esc(x.i.nome)}</a>` : etiqueta('Sem imóvel', 'aviso'));
  const editar = (c) => (opera() ? link(`#/editar/contratos/${c.id}`, 'Editar') : '');
  const situacao = (c) => (c.data_saida && c.data_saida < hoje ? etiqueta('Saiu', 'neutra') : c.ativo === false ? etiqueta('Inativo', 'neutra') : '');
  return `<div class="cabecalho"><h1>Inquilinos</h1>${opera() ? link('#/novo/contratos', 'Novo inquilino', 'botao') : ''}</div>
    <form class="acoes" data-form="buscaInquilinos" style="margin-bottom:12px"><input name="busca" value="${esc(q.busca || '')}" placeholder="Buscar por nome, CPF ou imóvel" style="max-width:340px"><button class="secundario">Buscar</button>${busca ? link('#/inquilinos', 'Limpar') : ''}</form>
    <div class="cartao rolagem"><h2>Ativos (${atuais.length})</h2><table><tr><th>Ativo</th><th>Imóvel</th><th>Inquilino</th><th>Entrada</th><th>Contrato</th><th class="n">Aluguel atual</th><th>Garantia</th><th></th></tr>
      ${atuais.map((x) => `<tr class="${x.c.verificar ? 'amarelo' : ''}"><td>${ativo(x.c)}</td><td>${imovel(x)}</td><td>${nome(x)}</td><td>${dataBr(x.c.data_entrada)}</td>
        <td>${x.c.prazo_tipo === 'Indeterminado' ? etiqueta('Indeterminado', 'aviso') : `até ${dataBr(x.c.vigencia_fim)}`}</td><td class="n">${reais(R.aluguelAtual(d(), x.c))}</td>
        <td>${esc(x.c.garantia_tipo || '-')}${R.valorGarantia(d(), x.c) ? ` ${reais(R.valorGarantia(d(), x.c))}` : ''}</td><td class="n">${editar(x.c)}</td></tr>`).join('') || '<tr><td colspan="8" class="suave">Nenhum.</td></tr>'}</table>
      <p class="suave">Desmarque "Ativo" para parar de gerar boleto. O inquilino vai para a lista de inativos e pode ser reativado.</p></div>
    <div class="cartao rolagem"><h2>Inativos e histórico de quem saiu (${anteriores.length})</h2><table><tr><th>Ativo</th><th>Imóvel</th><th>Inquilino</th><th>Entrada</th><th>Saída</th><th class="n">Garantia corrigida</th><th class="n">Débitos</th><th class="n">Saldo</th><th></th></tr>
      ${anteriores.map((x) => `<tr><td>${ativo(x.c)}</td><td>${imovel(x)}</td><td>${nome(x)} ${situacao(x.c)}</td><td>${dataBr(x.c.data_entrada)}</td><td>${dataBr(x.c.data_saida)}</td>
        ${x.e ? `<td class="n">${reais(x.e.garantia_corrigida)}</td><td class="n">${reais(x.e.debitos)}</td><td class="n"><b>${reais(x.e.saldo)}</b></td>` : `<td colspan="3" class="suave">${opera() && x.c.data_saida ? link(`#/novo/encerramentos?contrato=${x.c.id}`, 'Fazer cálculo final') : x.c.data_saida ? 'sem cálculo final' : '-'}</td>`}
        <td class="n">${editar(x.c)}</td></tr>`).join('')
      || '<tr><td colspan="9" class="suave">Nenhum inquilino inativo.</td></tr>'}</table></div>`;
}

function telaIptu(ano) {
  const imoveis = ordenar(d().imoveis.filter((i) => i.tipo !== 'airbnb'), 'nome');
  const doAno = (i, a) => d().iptus.find((p) => p.imovel_id === i.id && p.ano === a);
  const resumo = (p) => (p ? `${reais(p.valor_total)} · ${p.num_parcelas}x${p.valor_parcela ? ` de ${reais(p.valor_parcela)}` : ''}` : '<span class="suave">-</span>');
  const linhas = imoveis.map((i) => {
    const p = doAno(i, ano);
    const ant = doAno(i, ano - 1);
    const varia = p && ant && ant.valor_total ? ((p.valor_total / ant.valor_total - 1) * 100).toFixed(2).replace('.', ',') : null;
    const acao = !opera() ? '' : p ? link(`#/editar/iptus/${p.id}?de=iptu`, 'Editar') : link(`#/novo/iptus?imovel=${i.id}&ano=${ano}&de=iptu`, `Lançar ${ano}`, 'botao pequeno');
    return `<tr class="${p ? '' : 'amarelo'}"><td><a href="#/imovel/${i.id}">${esc(i.nome)}</a></td><td class="n">${resumo(ant)}</td><td class="n"><b>${resumo(p)}</b></td>
      <td class="n">${varia !== null ? `${varia}%` : '-'}</td><td>${p ? compBr(p.primeira_competencia) : '-'}</td><td class="n">${acao}</td></tr>`;
  }).join('');
  const faltam = imoveis.filter((i) => !doAno(i, ano)).length;
  return `<div class="cabecalho"><h1>IPTU ${ano}</h1><div class="acoes">${link(`#/iptu?ano=${ano - 1}`, `← ${ano - 1}`, 'botao secundario')} ${link(`#/iptu?ano=${ano + 1}`, `${ano + 1} →`, 'botao secundario')}</div></div>
    ${faltam ? `<div class="alerta aviso">${faltam} imóvel(is) ainda sem o IPTU de ${ano} (em amarelo).</div>` : `<div class="alerta info">Todos os imóveis com IPTU de ${ano} lançado.</div>`}
    <div class="cartao rolagem"><table><tr><th>Imóvel</th><th class="n">${ano - 1}</th><th class="n">${ano}</th><th class="n">Variação</th><th>1ª parcela no aluguel de</th><th></th></tr>${linhas}</table>
    <p class="suave">As parcelas entram sozinhas nos boletos dos inquilinos que pagam IPTU, a partir do mês da 1ª parcela.</p></div>`;
}

function telaImprimir(rota) {
  const tipo = rota.partes[1];
  const voltar = '<div class="acoes nao-imprimir" style="margin:12px 0"><button data-acao="imprimir">Imprimir</button><button class="secundario" data-acao="voltar">Voltar</button></div>';
  if (tipo === 'demonstrativos') {
    const lista = d().cobrancas.filter((x) => x.competencia === rota.q.comp);
    return `<div class="impressao">${voltar}${lista.map(demonstrativo).join('') || '<p>Nenhum boleto.</p>'}</div>`;
  }
  let fs = d().faturas.filter((f) => f.situacao === 'Emitida');
  fs = rota.q.numero ? fs.filter((f) => f.numero === Number(rota.q.numero)) : fs.filter((f) => f.emissao.slice(0, 7) === rota.q.mes);
  fs.sort((a, b) => a.numero - b.numero || a.id - b.id);
  return `<div class="impressao">${voltar}${rota.q.numero && fs.length ? `<p class="nao-imprimir">${botao('excel', 'Baixar este número em Excel', { numero: rota.q.numero })}</p>` : ''}
    ${fs.map((f) => faturaHtml(f, buscar('emitentes', f.emitente_id))).join('') || '<p>Nenhuma NF.</p>'}</div>`;
}

// --------------------------------------------------------------------------
// Empresas, histórico e dados
// --------------------------------------------------------------------------
function telaEmpresas() {
  return `<div class="cabecalho"><h1>Empresas que emitem as NFs</h1>${podeUsuario('admin') ? link('#/novo/emitentes', 'Nova empresa', 'botao') : ''}</div>
    <div class="cartao rolagem"><table><tr><th>Nome</th><th>Razão social</th><th>CNPJ</th><th>Aba no Excel</th><th>Situação</th><th></th></tr>
    ${ordenar(d().emitentes, 'nome').map((e) => `<tr><td><b>${esc(e.nome)}</b></td><td>${esc(e.razao_social)}</td><td>${esc(e.cnpj || '-')}</td><td>${esc(e.aba_modelo || e.nome.split(/\s+/)[0])}</td><td>${e.ativo ? etiqueta('Ativa', 'ok') : etiqueta('Inativa', 'neutra')}</td><td class="n">${podeUsuario('admin') ? link(`#/editar/emitentes/${e.id}`, 'Editar') : ''}</td></tr>`).join('')
    || '<tr><td colspan="6" class="suave">Nenhuma empresa cadastrada.</td></tr>'}</table>
    <p class="suave">Em cada imóvel você define quais empresas emitem a NF e o percentual de cada uma (ex.: 50% / 50%).</p></div>
    <div class="cartao"><h2>Logo da empresa</h2>
      <p class="suave">Aparece no topo de todas as páginas do sistema.</p>
      ${d().logo ? `<p><img class="logo-previa" src="${esc(d().logo)}" alt="Logo atual"></p>` : '<p class="suave">Nenhuma logo enviada.</p>'}
      ${podeUsuario('admin') ? `<form data-form="logo" class="acoes"><input type="file" name="arquivo" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="max-width:360px"><button class="secundario">${d().logo ? 'Trocar logo' : 'Enviar logo'}</button>
        ${d().logo ? botao('removerLogo', 'Remover logo', {}, 'perigo pequeno', 'Remover a logo?') : ''}</form>` : ''}</div>
    <div class="cartao"><h2>Numeração das NFs</h2>
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
    <div class="cartao"><h2>Modelo Excel da NF</h2>
      <p>${modeloProprio ? `${etiqueta('Modelo próprio', 'ok')} usando o arquivo enviado (${S.PASTA_MODELOS}/${S.MODELO_FATURA}).` : 'Usando o modelo padrão, igual à planilha LOJA1 (abas ANK e JCK).'}</p>
      <p class="suave">Para trocar, envie um .xlsx com uma aba por empresa no mesmo desenho. Os dados são preenchidos nas mesmas células da planilha original (B3 a B6, L4, L5, E10, L10, E11, E12, G16, F22, K22).</p>
      <form data-form="modeloExcel" class="acoes"><input type="file" name="modelo" accept=".xlsx" style="max-width:380px"><button class="secundario">Enviar modelo</button>${modeloProprio ? botao('removerModelo', 'Voltar ao modelo padrão', {}, 'perigo pequeno', 'Voltar ao modelo padrão?') : ''}</form></div>` : ''}`;
}

// --------------------------------------------------------------------------
// Envio de formulários
// --------------------------------------------------------------------------
/** Reduz a imagem da logo (até 400×120) e devolve como data URL PNG, guardada no próprio banco de dados. */
async function reduzirImagem(arquivo) {
  if (!podeUsuario('admin')) throw new Error('Só administradores podem alterar a logo.');
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('Não consegui abrir a imagem. Use PNG, JPG, SVG ou WEBP.'));
      i.src = url;
    });
    const largura = img.naturalWidth || 400;
    const altura = img.naturalHeight || 120;
    const escala = Math.min(1, 400 / largura, 120 / altura);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(largura * escala));
    cv.height = Math.max(1, Math.round(altura * escala));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
      if (cfg.salvar) return cfg.salvar(db, dados, rota.q, registro);
      if (registro) {
        R.atualizar(db, tabela, registro.id, dados, login(), descricao);
        return R.buscar(db, tabela, registro.id);
      }
      return R.inserir(db, tabela, dados, login(), descricao);
    });
    if (cfg.depois) await cfg.depois(salvo, antigo);
    if (tabela === 'usuarios' && salvo.id === E.usuario.id) E.usuario = salvo;
    aviso('Salvo.');
    const destino = tabela === 'imoveis' ? `#/imovel/${salvo.id}` : cfg.destino ? cfg.destino(salvo, rota.q) : cfg.voltar(salvo, rota.q);
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

  async ajuste(form) {
    const f = new FormData(form);
    const valor = Math.abs(C.centavos(String(f.get('valor') || '').trim()));
    if (!valor) throw new Error('Informe o valor do ajuste.');
    const motivo = String(f.get('motivo') || '').trim();
    if (!motivo) throw new Error('Informe o motivo do ajuste (fica no histórico).');
    await alterar((db) => R.ajustarBoleto(db, Number(form.dataset.id), f.get('tipo') === 'ressarcimento' ? -valor : valor, motivo, login()));
    aviso('Ajuste salvo e registrado no histórico.');
    await mostrar();
  },

  async taxaBoleto(form) {
    const valor = C.centavos(String(new FormData(form).get('valor') || '0'));
    const r = await alterar((db) => R.aplicarTaxaBoleto(db, valor, form.dataset.comp, login()));
    aviso(`Taxa do boleto de ${reais(valor)} aplicada: ${r.contratos} inquilino(s) alterado(s) e ${r.cobrancas} boleto(s) em aberto de ${compBr(form.dataset.comp)} atualizado(s).`);
    await mostrar();
    return null;
  },
  irMes: (form) => ir(`#/cobrancas?comp=${new FormData(form).get('comp')}`),
  irMesFatura: (form) => ir(`#/faturas?mes=${new FormData(form).get('mes')}`),
  buscaInquilinos(form) {
    const busca = String(new FormData(form).get('busca') || '').trim();
    ir(busca ? `#/inquilinos?busca=${encodeURIComponent(busca)}` : '#/inquilinos');
  },
  filtroHistorico(form) {
    const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
    ir(`#/historico?${q}`);
  },

  async logo(form) {
    const arquivo = new FormData(form).get('arquivo');
    if (!arquivo || !arquivo.size) throw new Error('Escolha o arquivo da logo.');
    const dataUrl = await reduzirImagem(arquivo);
    await alterar((db) => {
      R.registrar(db, login(), 'Alteração', null, null, db.logo ? 'Logo da empresa trocada' : 'Logo da empresa enviada');
      db.logo = dataUrl;
    });
    aviso('Logo salva.');
    await mostrar();
  },

  async proximaFatura(form) {
    const n = Number(new FormData(form).get('numero'));
    if (!Number.isInteger(n) || n < 1) throw new Error('Número inválido.');
    const ultima = R.ultimaFatura(E.d);
    if (ultima && n <= ultima.numero && !confirm(`Já existe a NF nº ${R.numeroFatura(ultima.numero)}. Usar ${R.numeroFatura(n)} mesmo assim vai repetir números. Continuar?`)) return;
    await alterar((db) => {
      R.registrar(db, login(), 'Alteração', 'faturas', null, 'Próximo número de NF', { proxima_fatura: { de: db.proxima_fatura, para: n } });
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
    await alterar((db) => R.registrar(db, login(), 'Alteração', 'banco', null, `Modelo Excel da NF enviado (abas: ${wb.worksheets.map((w) => w.name).join(', ')})`));
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
    if (!r.ok) throw new Error('Modelo da NF não encontrado.');
    return r.arrayBuffer();
  }
}

async function excelDoNumero(ExcelJS, modelo, numero) {
  const fs = E.d.faturas.filter((f) => f.numero === Number(numero) && f.situacao === 'Emitida').sort((a, b) => a.id - b.id);
  if (!fs.length) throw new Error('NF não encontrada.');
  const blob = await faturaExcel(ExcelJS, modelo, fs, E.d.emitentes);
  return { blob, nome: S.limparNome(`NF ${R.numeroFatura(numero)} - ${fs[0].tomador_nome}.xlsx`) };
}

const TABELAS_EXCLUSAO = {
  imoveis: { admin: true, checar: (db, r) => (db.contratos.some((c) => c.imovel_id === r.id) ? 'Este imóvel tem inquilinos. Exclua os contratos antes.' : null), voltar: () => '#/imoveis' },
  contratos: { admin: true, checar: (db, r) => (db.cobrancas.some((cb) => cb.contrato_id === r.id && R.faturasDe(db, 'cobranca', cb.id, false).length) ? 'Este contrato tem NFs emitidas e não pode ser excluído.' : null), voltar: (r) => (r.imovel_id ? `#/imovel/${r.imovel_id}` : '#/inquilinos') },
  cobrancas: { checar: (db, r) => (R.faturasDe(db, 'cobranca', r.id, false).length ? 'Este boleto tem NF. Desfaça o pagamento antes.' : null), voltar: (r) => `#/cobrancas?comp=${r.competencia}` },
  recebimentos: { checar: (db, r) => (R.faturasDe(db, 'recebimento', r.id).length ? 'Este recebimento tem NF emitida.' : null) },
  avulsas: { checar: (db, r) => (R.faturasDe(db, 'avulsa', r.id).length ? 'Esta NF avulsa já tem número.' : null) },
  encerramentos: { admin: true },
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
      if (tabela === 'imoveis') {
        for (const t of ['participacoes', 'seguros', 'leituras']) db[t].filter((p) => p.imovel_id === reg.id).forEach((p) => R.excluir(db, t, p.id, login()));
      }
      if (tabela === 'contratos') {
        for (const t of ['cobrancas', 'correcoes', 'fiadores', 'aplicacoes', 'correcoes_garantia', 'renovacoes', 'encerramentos', 'trocas_garantia', 'leituras']) db[t].filter((x) => x.contrato_id === reg.id).forEach((x) => R.excluir(db, t, x.id, login()));
      }
      R.excluir(db, tabela, reg.id, login(), reg.nome || reg.inquilino_nome || null);
    });
    aviso('Excluído.');
    if (destino) ir(destino); else await mostrar();
  },

  async removerLogo() {
    if (!podeUsuario('admin')) throw new Error('Só administradores podem alterar a logo.');
    await alterar((db) => {
      R.registrar(db, login(), 'Exclusão', null, null, 'Logo da empresa removida');
      delete db.logo;
    });
    await mostrar();
  },

  async tirarAjuste({ id }) {
    if (!opera()) throw new Error('Seu usuário não pode alterar.');
    await alterar((db) => R.ajustarBoleto(db, Number(id), 0, '', login()));
    await mostrar();
  },

  async alternarAtivo({ id }) {
    if (!opera()) throw new Error('Seu usuário não pode alterar.');
    await alterar((db) => {
      const c = R.buscar(db, 'contratos', id);
      R.atualizar(db, 'contratos', c.id, { ativo: c.ativo === false }, login(), c.ativo === false ? 'Inquilino marcado como ativo' : 'Inquilino marcado como inativo');
    });
    await mostrar();
  },

  async copiar({ texto }, el) {
    await navigator.clipboard.writeText(texto);
    const antes = el.textContent;
    el.textContent = 'Copiado ✓';
    setTimeout(() => { el.textContent = antes; }, 1500);
  },

  async cancelarAvulsa({ id }) {
    await alterar((db) => R.cancelarFaturas(db, 'avulsa', Number(id), login()));
    aviso('NF cancelada. O número não será reaproveitado.');
    await mostrar();
  },

  async gerarCobrancas({ comp }) {
    const r = await alterar((db) => R.gerarCobrancas(db, comp, login()));
    aviso(`${r.geradas} boleto(s) gerado(s) para ${compBr(comp)}.`);
    await mostrar();
  },

  async estornar({ id }) {
    await alterar((db) => R.estornarPagamento(db, Number(id), login()));
    aviso('Pagamento desfeito.');
    await mostrar();
  },

  async cancelarRecebimento({ id }) {
    await alterar((db) => R.cancelarFaturas(db, 'recebimento', Number(id), login()));
    aviso('NF cancelada. Corrija o recebimento e numere de novo.');
    await mostrar();
  },

  async numerar() {
    let r = await alterar((db) => R.numerarFaturas(db, login()));
    if (r.foraDeOrdem.length) {
      const lista = r.foraDeOrdem.map((p) => `${dataBr(p.data)}`).join(', ');
      if (!confirm(`A última NF (nº ${R.numeroFatura(r.ultima.numero)}) é de ${dataBr(r.ultima.emissao)}, e há pagamento(s) com data anterior: ${lista}.\n\nNumerar mesmo assim? Eles receberão os próximos números, com a data do próprio pagamento.`)) return;
      r = await alterar((db) => R.numerarFaturas(db, login(), { forcar: true }));
    }
    if (r.numeradas.length) aviso(`NFs numeradas: ${r.numeradas.map((n) => R.numeroFatura(n.numero)).join(', ')}.`);
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
    baixar(await zip.generateAsync({ type: 'blob' }), `NFs ${mes}.zip`);
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
