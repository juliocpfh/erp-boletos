// Telas do sistema (HTML), formulários e ações dos botões.
import {
  E, alterar, aviso, baixar, bibliotecasPdf, criarBanco, entrar, escolherPasta, excelJs, ir, jsZip, login, mostrar, podeUsuario,
  reabrirPastaLembrada, renovarUsuario, sair,
} from './app.js';
import * as S from './armazenamento.js';
import { conferirSenha, novoSal, PAPEIS, resumoSenha } from './auth.js';
import * as C from './calculos.js';
import * as K from './contratos.js';
import { faturaExcel, faturaHtml, linhasObservacoes } from './fatura.js';
import * as F from './formularios.js';
import { MODELOS_PADRAO } from './modelos-contrato.js';
import * as R from './regras.js';

const { esc } = F;
const { reais, dataBr, compBr, pct } = C;

// --------------------------------------------------------------------------
// Pequenos componentes
// --------------------------------------------------------------------------
const botao = (acao, texto, dados = {}, cls = 'secundario pequeno', confirmar = '') => `<button type="button" class="${cls}" data-acao="${acao}" ${Object.entries(dados).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} ${confirmar ? `data-confirmar="${esc(confirmar)}"` : ''}>${texto}</button>`;
const link = (hash, texto, cls = 'botao secundario pequeno') => `<a class="${cls}" href="${hash}">${texto}</a>`;
const etiqueta = (texto, tipo) => `<span class="etiqueta ${tipo}">${esc(texto)}</span>`;
const situacao = (s) => etiqueta(s, { 'Paga em dia': 'ok', 'Paga com atraso': 'aviso', 'Em aberto': 'neutra', Carência: 'info' }[s] || 'neutra');
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

const textoValor = (v) => (v === null || v === undefined || v === '' ? '(vazio)' : typeof v === 'object' ? JSON.stringify(v) : v);

function tabelaHistorico(lista) {
  const linhas = lista.map((h) => {
    let det = '';
    if (h.acao === 'Alteração' && h.detalhes) {
      det = Object.entries(h.detalhes).map(([k, m]) => (m && typeof m === 'object'
        ? `<div><code>${esc(k)}</code>: ${esc(textoValor(m.de))} → ${esc(textoValor(m.para))}</div>`
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
/** Subpastas do imóvel para cada caixa de arquivos. */
const SUBPASTAS = { imovel: SUB_DOCS, anuncio: SUB_ANUNCIO, iptu: 'IPTU (guias)', seguro: 'Seguro (apólices)', reformas: 'Reformas' };
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
  return S.subpasta(raiz, [i.pasta || i.nome, SUBPASTAS[escopo] || SUB_DOCS]);
}

function caixaArquivos(escopo, id, titulo, ancora, ajuda = '', dentro = false) {
  return `<div class="${dentro ? 'arquivos-dentro' : 'cartao'}" id="${ancora}">${dentro ? `<h3>${esc(titulo)}</h3>` : `<h2>${esc(titulo)}</h2>`}${ajuda ? `<p class="suave">${esc(ajuda)}</p>` : ''}
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
    // campos que aparecem conforme outro campo (garantia, tipo de inquilino, prazo, IPTU à vista)
    const regras = [...raiz.querySelectorAll('[data-mostrar-se]')];
    const valorDe = (form, nome) => {
      const el = form && form.querySelector(`[name="${nome}"]`);
      if (!el) return null;
      return el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value;
    };
    const aplicar = () => regras.forEach((el) => {
      const [campoNome, ...valores] = el.dataset.mostrarSe.split('|');
      const v = valorDe(el.closest('form'), campoNome);
      if (v !== null) el.hidden = !valores.includes(v);
    });
    const nomes = new Set(regras.map((el) => el.dataset.mostrarSe.split('|')[0]));
    for (const n of nomes) raiz.querySelectorAll(`[name="${n}"]`).forEach((el) => el.addEventListener('change', aplicar));
    aplicar();
    const bonif = raiz.querySelector('input[name=bonificacao]');
    if (bonif) {
      const mostrarBonif = () => raiz.querySelectorAll('[data-vinculo="desconto"]').forEach((el) => { el.closest('div').hidden = !bonif.checked; });
      bonif.addEventListener('change', mostrarBonif);
      mostrarBonif();
    }
    // bonificação: digitar o aluguel bonificado calcula o %, e digitar o % calcula o aluguel bonificado
    const pctEl = raiz.querySelector('[data-vinculo="desconto"][data-tipo="pct"]');
    const valEl = raiz.querySelector('[data-vinculo="desconto"][data-tipo="dinheiro"]');
    if (!pctEl || !valEl) return;
    const form = pctEl.closest('form');
    const aluguel = raiz.querySelector('[name=aluguel_inicial]');
    const base = () => (form.dataset.base ? Number(form.dataset.base) : (() => { try { return C.centavos(aluguel.value); } catch { return NaN; } })());
    const num = (t) => { try { return C.numero(t); } catch { return NaN; } };
    const cent = (t) => { try { return C.centavos(t); } catch { return NaN; } };
    const doPct = () => {
      const b = base(); const p = num(pctEl.value);
      valEl.value = Number.isFinite(b) && Number.isFinite(p) && pctEl.value !== '' ? F.dinheiroTexto(b - C.descontoPorPercentual(b, p)) : '';
    };
    pctEl.addEventListener('input', doPct);
    valEl.addEventListener('input', () => {
      const b = base(); const v = cent(valEl.value);
      pctEl.value = Number.isFinite(b) && b && Number.isFinite(v) && valEl.value !== '' ? F.pctTexto(C.percentualPorBonificado(b, v)) : '';
    });
    if (aluguel && !form.dataset.base) aluguel.addEventListener('input', doPct);
    if (pctEl.value !== '' && valEl.value === '') doPct();
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
    <p class="suave">Pasta: <b>${esc(E.pasta.name)}</b>. Esta pasta ainda não tem dados: crie o usuário administrador. O nome, o login e a senha são você que escolhe agora (senha com pelo menos 6 caracteres). Depois o administrador libera os demais em Usuários.</p>
    <div class="alerta info"><b>Já usa o sistema?</b> Usuários e senhas ficam guardados na pasta dos dados, não no programa.
      Se você já tem dados, clique em <b>Escolher outra pasta</b> e escolha a mesma pasta de sempre: aparece o login e você entra com a senha de sempre.
      Para levar tudo para esta pasta nova: crie aqui o administrador e depois use <b>Dados e backup → Importar ZIP</b> com o ZIP baixado no site (os usuários antigos voltam junto).</div>
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
    </form><p class="suave" style="margin-top:14px">Primeiro acesso? <a href="#/pedir-acesso">Pedir acesso ao administrador</a></p></div></main>`,

  pedirAcesso: () => `<main><div id="mensagens"></div><div class="cartao login">
    <h1>Pedir acesso</h1><p class="suave">Pasta: <b>${esc(E.pasta.name)}</b>. O administrador recebe o pedido em Usuários e libera o acesso.</p>
    <form data-form="pedirAcesso">
      <p><label>Seu nome</label><input name="nome" autofocus></p>
      <p><label>Login (sem espaços)</label><input name="login" autocomplete="username"></p>
      <p><label>Senha (mínimo 6 caracteres)</label><input type="password" name="senha" autocomplete="new-password"></p>
      <p><label>Repita a senha</label><input type="password" name="senha2" autocomplete="new-password"></p>
      <button>Enviar pedido</button> <a class="botao secundario" href="#/">Voltar</a>
    </form></div></main>`,

  // ------------------------------------------------------------------------
  painel(rota) {
    const hoje = C.hojeIso();
    const alertas = R.todosAlertas(d(), hoje);
    const pend = R.pendentesDeFatura(d());
    const abertas = d().cobrancas.filter((c) => c.situacao === 'Em aberto');
    const n = (v, t, h) => `<a class="cartao" href="${h}"><div class="grande">${v}</div>${t}</a>`;
    return `<h1>Painel</h1>
      <div class="numeros">
        ${n(d().imoveis.length, 'imóveis', '#/imoveis')}
        ${n(d().contratos.filter((c) => R.contratoAtivo(c, hoje)).length, 'contratos ativos', '#/imoveis')}
        ${n(abertas.length, 'boletos em aberto', '#/cobrancas')}
        ${n(abertas.filter((c) => c.vencimento < hoje).length, 'em aberto e vencidas', '#/inadimplencia')}
        ${n(pend.length, 'pagamentos aguardando nº de NF', '#/faturas')}
      </div>
      ${calendarioDoPainel(rota.q.mes || C.competenciaDe(hoje), hoje)}
      <div class="cartao"><h2>Alertas</h2>
        ${alertas.map((a) => `<div class="alerta ${a.nivel} ${a.tipo === 'A verificar' ? 'amarelo' : ''}"><b>${esc(a.tipo)}</b> <a href="${a.contrato_id ? `#/contrato/${a.contrato_id}` : `#/imovel/${a.imovel_id}`}${a.ancora ? `?ir=${a.ancora}` : ''}">${esc(a.imovel)}${a.inquilino ? ` · ${esc(a.inquilino)}` : ''}</a>: ${esc(a.texto)}</div>`).join('') || '<p class="suave">Nenhum alerta no momento.</p>'}
      </div>
      <div class="cartao"><div class="cabecalho"><h2>Últimas alterações</h2><a href="#/historico">Ver histórico completo</a></div>
        ${tabelaHistorico(ultimos(() => true, 12))}
        <p class="suave">Banco criado em ${new Date(d().criado_em).toLocaleString('pt-BR')}.</p></div>`;
  },

  // ------------------------------------------------------------------------
  imoveis() {
    const hoje = C.hojeIso();
    const linhas = ordenar(d().imoveis, 'nome').map((i) => {
      const atuais = d().contratos.filter((c) => c.imovel_id === i.id && R.contratoAtivo(c, hoje)).sort((a, b) => b.data_entrada.localeCompare(a.data_entrada));
      const atual = atuais[0];
      return `<tr><td><a href="#/imovel/${i.id}"><b>${esc(i.nome)}</b></a>${i.sublote ? `<br><span class="suave">${esc(i.sublote)}</span>` : ''}</td><td>${esc(R.enderecoCompleto(i))}</td>
        <td>${atual ? atuais.map((c) => `<a href="#/contrato/${c.id}">${esc(c.inquilino_nome)}</a>${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}${R.geraNf(c) ? '' : ` ${etiqueta('boleto de controle', 'controle')}`}`).join('<br>') : etiqueta('Vago', 'aviso')}</td>
        <td class="n">${atual ? `${reais(R.aluguelAtual(d(), atual))}${atual.bonificacao === false ? '' : ` <span class="suave">(${reais(valorBonificado(atual))})</span>`}` : '-'}</td></tr>`;
    }).join('');
    return `<div class="cabecalho"><h1>Imóveis</h1><div class="acoes">${opera() ? link('#/novo/imoveis', 'Novo imóvel', 'botao') : ''}</div></div>
      <div class="cartao rolagem"><table><tr><th>Imóvel</th><th>Endereço</th><th>Inquilino atual</th><th class="n">Aluguel atual (bonificado)</th></tr>
      ${linhas || '<tr><td colspan="4" class="suave">Nenhum imóvel cadastrado. Clique em "Novo imóvel".</td></tr>'}
      ${linhas ? (() => {
    const t = R.totaisImoveis(d(), hoje);
    return `<tr class="total"><td colspan="3">Total esperado por mês <span class="suave">(inquilinos atuais que emitem NF)</span></td><td class="n">${reais(t.cheio)} <span class="suave">(${reais(t.esperado)})</span></td></tr>
      <tr class="total"><td colspan="3">Total com 100% locado <span class="suave">(alugados + ${t.qtdVagos} vago(s) pelo último aluguel${t.vagosSemValor ? `; ${t.vagosSemValor} vago(s) sem aluguel anterior não entram` : ''})</span></td>
        <td class="n">${reais(t.cemPorCento)} <span class="suave">(+ ${reais(t.vagos)})</span></td></tr>`;
  })() : ''}</table>
      <p class="suave">Valores bonificados (o que o inquilino paga em dia); no total esperado, o valor cheio vem antes e o bonificado entre parênteses. O total com 100% locado soma os aluguéis atuais bonificados e o último aluguel bonificado de cada imóvel vago; entre parênteses, quanto falta para chegar nele. Boletos de controle não entram.</p></div>`;
  },

  imovel(rota) {
    const i = buscar('imoveis', rota.partes[1]);
    if (!i) return '<h1>Imóvel não encontrado</h1>';
    return telaImovel(i);
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

  cobrancas: (rota) => telaCobrancas(rota.q.comp || competenciaPadrao(), rota.q.ordem),
  cobranca(rota) {
    const cb = buscar('cobrancas', rota.partes[1]);
    return cb ? telaCobranca(cb) : '<h1>Boleto não encontrado</h1>';
  },
  faturas: (rota) => telaFaturas(rota.q.mes || C.competenciaDe(C.hojeIso())),
  resultados: (rota) => telaResultados(rota.q),
  inadimplencia: () => telaInadimplencia(),
  reajustes: (rota) => telaReajustes(rota.q),
  calendario: (rota) => { ir(`#/${rota.q.mes ? `?mes=${rota.q.mes}` : ''}`); return ''; },
  imprimir: (rota) => telaImprimir(rota),
  'contrato-gerar': (rota) => telaGerarContrato(rota),
  'modelos-contrato': () => telaModelos(),
  'modelo-contrato': (rota) => telaModelo(rota),
  empresas: () => telaEmpresas(),
  inquilinos: (rota) => telaInquilinos(rota.q),
  iptu: (rota) => telaIptu(Number(rota.q.ano) || new Date().getFullYear()),
  historico: (rota) => telaHistorico(rota.q),
  dados: () => telaDados(),
  usuarios() {
    if (!podeUsuario('admin')) return '<h1>Acesso só para administradores</h1>';
    const pendentes = d().usuarios.filter((u) => u.pendente);
    const papeis = Object.entries(PAPEIS).map(([k, v]) => `<option value="${k}" ${k === 'operador' ? 'selected' : ''}>${v}</option>`).join('');
    return `<div class="cabecalho"><h1>Usuários</h1>${link('#/novo/usuarios', 'Novo usuário', 'botao')}</div>
      ${pendentes.length ? `<div class="cartao destaque"><h2>Pedidos de acesso (${pendentes.length})</h2><table><tr><th>Nome</th><th>Login</th><th>Pedido em</th><th>Liberar como</th><th></th></tr>
        ${pendentes.map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.login)}</td><td>${u.criado_em ? new Date(u.criado_em).toLocaleString('pt-BR') : '-'}</td>
          <td><select data-papel-de="${u.id}" style="width:auto">${papeis}</select></td>
          <td class="n nw">${botao('aprovarUsuario', 'Aprovar', { id: u.id }, 'pequeno')} ${botao('recusarUsuario', 'Recusar', { id: u.id }, 'perigo pequeno', `Recusar o pedido de ${u.nome}?`)}</td></tr>`).join('')}</table></div>` : ''}
      <div class="cartao"><table><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Situação</th><th></th></tr>
      ${ordenar(d().usuarios.filter((u) => !u.pendente), 'nome').map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.login)}</td><td>${PAPEIS[u.papel]}</td><td>${u.ativo ? etiqueta('Ativo', 'ok') : etiqueta('Bloqueado', 'perigo')}</td>
        <td class="n nw">${u.id === E.usuario.id ? '<span class="suave">você</span>' : botao('bloquearUsuario', u.ativo ? 'Bloquear' : 'Desbloquear', { id: u.id }, u.ativo ? 'perigo pequeno' : 'pequeno', u.ativo ? `Bloquear o acesso de ${u.nome}?` : '')} ${link(`#/editar/usuarios/${u.id}`, 'Editar')}</td></tr>`).join('')}</table>
      <p class="suave">Quem não tem usuário clica em "Pedir acesso" na tela de login, e o pedido aparece aqui para aprovar. Administrador: tudo, inclusive usuários e importação. Operador: cadastra, altera, confirma pagamentos e numera NFs. Consulta: só vê.</p></div>`;
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
  if (R.imovelSoControle(d(), i.id)) {
    return `<div class="cartao" id="empresas"><h2>Empresas que emitem a NF</h2>
      <div class="alerta controle"><b>Não se aplica.</b> O inquilino atual é boleto de controle: este imóvel não emite NF.
      As empresas que estavam definidas ficam guardadas e voltam a valer se o inquilino passar a emitir NF.</div></div>`;
  }
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

/** Parcelas do IPTU de um ano: quem paga cada uma e o controle do que o proprietário pagou. */
function tabelaIptu(p) {
  const ps = R.parcelasIptu(d(), p);
  const pagador = (pc) => (pc.inquilino ? `<a href="#/contrato/${pc.inquilino.id}">${esc(pc.inquilino.inquilino_nome)}</a> <span class="suave">(no boleto)</span>` : etiqueta('Proprietário', 'aviso'));
  const situ = (pc) => {
    if (!pc.proprietario) return '';
    if (pc.paga) return `${etiqueta(`paga em ${dataBr(pc.paga)}`, 'ok')} ${opera() ? botao('iptuPago', 'desfazer', { id: p.id, n: pc.n, data: '' }, 'link-botao', 'Desfazer o pagamento desta parcela?') : ''}`;
    return opera() ? `<form data-form="iptuPago" data-id="${p.id}" data-n="${pc.n}" class="pagamento"><input type="date" name="data" value="${C.hojeIso()}"><button class="pequeno">Paga</button></form>` : etiqueta('em aberto', 'perigo');
  };
  return `<div class="rolagem"><table><tr><th>Parcela</th><th>Vencimento na prefeitura</th><th>Boleto que vence em</th><th class="n">Valor</th><th>Quem arca</th><th>Pagamento pelo proprietário</th></tr>
    ${ps.map((pc) => `<tr><td>${pc.rotulo}</td><td>${pc.vencimento ? dataBr(pc.vencimento) : '<span class="suave">-</span>'}</td><td>${pc.mesBoleto ? compBr(pc.mesBoleto) : pc.comp ? `<span class="suave">aluguel de ${compBr(pc.comp)}</span>` : '-'}</td><td class="n">${reais(pc.valor)}</td>
      <td>${p.pago_avista ? etiqueta('Proprietário (à vista)', 'aviso') : pagador(pc)}</td><td>${situ(pc)}</td></tr>`).join('')}</table></div>`;
}

function caixaIptu(i) {
  const iptus = d().iptus.filter((p) => p.imovel_id === i.id).sort((a, b) => b.ano - a.ano);
  return `<div class="cartao" id="iptu"><div class="cabecalho"><h2>IPTU</h2>${opera() ? link(`#/novo/iptus?imovel=${i.id}`, 'Lançar IPTU do ano') : ''}</div>
    <p class="suave">Quando o imóvel está vazio (ou o IPTU não é cobrado do inquilino), a parcela fica por conta do proprietário: marque aqui quando pagar. As parcelas em aberto aparecem nos alertas 15 dias antes do vencimento.</p>
    ${iptus.map((p) => `<h3>${p.ano} · total ${reais(p.valor_total)} em ${p.num_parcelas} parcela(s)${p.pago_avista ? ` · ${etiqueta(`quitado à vista${p.valor_avista ? ` ${reais(p.valor_avista)}` : ''}${p.data_quitacao ? ` em ${dataBr(p.data_quitacao)}` : ' (falta data)'}`, 'info')}` : ''}
      ${opera() ? `${link(`#/editar/iptus/${p.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'iptus', id: p.id }, 'perigo pequeno', 'Excluir o IPTU deste ano?')}` : ''}</h3>
      ${p.pago_avista ? `<p class="suave">Inquilino que entrar: ${esc(p.cobranca_inquilino || R.COBRANCA_IPTU_QUITADO[0])}.</p>` : ''}${tabelaIptu(p)}`).join('') || '<p class="suave">Nenhum IPTU lançado.</p>'}
    ${caixaArquivos('iptu', i.id, 'Guias do IPTU', 'guias-iptu', 'Anexe aqui a guia (carnê) do IPTU de cada ano.', true)}</div>`;
}

function caixaReformas(i) {
  const lista = R.reformasDo(d(), i.id);
  const total = lista.reduce((s, r) => s + r.valor, 0);
  return `<div class="cartao" id="reformas"><div class="cabecalho"><h2>Reformas e valores investidos</h2>${opera() ? link(`#/novo/reformas?imovel=${i.id}`, 'Registrar reforma') : ''}</div>
    <p class="suave">Guarde aqui o que foi investido no imóvel: serve para o imposto de renda (custo de aquisição) e para corrigir o valor do imóvel ao longo do tempo.</p>
    <div class="rolagem"><table><tr><th>Data</th><th>O que foi feito</th><th>Fornecedor</th><th>NF / recibo</th><th class="n">Valor</th><th></th></tr>
    ${lista.map((r) => `<tr><td>${dataBr(r.data)}</td><td>${esc(r.descricao)}${r.observacoes ? `<br><span class="suave">${esc(r.observacoes)}</span>` : ''}</td><td>${esc(r.fornecedor || '-')}</td><td>${esc(r.documento || '-')}</td><td class="n">${reais(r.valor)}</td>
      <td class="n nw">${opera() ? `${link(`#/editar/reformas/${r.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'reformas', id: r.id }, 'perigo pequeno', 'Excluir esta reforma?')}` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="suave">Nenhuma reforma registrada.</td></tr>'}
    ${lista.length ? `<tr class="total"><td colspan="4">Total investido</td><td class="n">${reais(total)}</td><td></td></tr>` : ''}</table></div>
    ${i.valor_imovel ? `<p>Valor do imóvel ${reais(i.valor_imovel)}${i.valor_data ? ` (${dataBr(i.valor_data)})` : ''} + reformas ${reais(total)} = <b>${reais(i.valor_imovel + total)}</b></p>` : ''}
    ${caixaArquivos('reformas', i.id, 'Notas e recibos das reformas', 'arquivos-reformas', '', true)}</div>`;
}

function telaImovel(i) {
  const hoje = C.hojeIso();
  const contratos = d().contratos.filter((c) => c.imovel_id === i.id).sort((a, b) => b.data_entrada.localeCompare(a.data_entrada));
  const tits = d().titularidades.filter((t) => t.imovel_id === i.id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const lembretes = contratos.map((c) => R.alertaTitularidade(d(), c, hoje)).filter(Boolean);
  return `<div class="cabecalho"><h1>${esc(i.nome)}${i.sublote ? ` <span class="suave">· ${esc(i.sublote)}</span>` : ''}</h1><div class="acoes">
      ${opera() ? `${link(`#/novo/vinculos?imovel=${i.id}`, 'Vincular inquilino', 'botao')} ${link(`#/editar/imoveis/${i.id}`, 'Editar imóvel', 'botao secundario')}` : ''}
      ${podeUsuario('admin') ? botao('excluir', 'Excluir', { tabela: 'imoveis', id: i.id }, 'perigo', 'Excluir este imóvel? Os arquivos da pasta são mantidos.') : ''}</div></div>
    <div class="endereco">📍 ${esc(endereco(i))}</div>
    ${R.imovelSoControle(d(), i.id) ? `<div class="alerta controle"><b>Boleto de controle.</b> O inquilino atual ${AVISO_CONTROLE}</div>` : ''}
    ${caixaVerificar(i.verificar)}
    <div class="cartao"><div class="grade">
      ${item('Valor do imóvel', i.valor_imovel ? `${reais(i.valor_imovel)}${i.valor_data ? ` <span class="suave">(${dataBr(i.valor_data)})</span>` : ''}` : '-')}
      ${item('Sublote', esc(i.sublote || '-'))}
      ${item('Área útil', i.area_util ? `${F.pctTexto(i.area_util)} m²` : '-')}${item('Área total', i.area_total ? `${F.pctTexto(i.area_total)} m²` : '-')}
      ${item('Energia', esc([i.energia_ligada ? (i.energia_ligada === 'Sim' ? 'ligada' : 'desligada') : '', i.energia_tipo].filter(Boolean).join(' · ') || '-'))}
      ${item('Matrícula', esc(i.matricula || '-'))}${item('Inscrição IPTU', esc(i.inscricao_iptu || '-'))}
      ${item('UC Copel / Nº medidor', esc(`${i.copel_uc || '-'} / ${i.copel_medidor || '-'}`))}${item('Matrícula Sanepar / Código hidrômetro', esc(`${i.sanepar_matricula || '-'} / ${i.sanepar_hidrometro || '-'}`))}
      ${item('Administradora do condomínio', esc(i.administradora_nome || '-'))}${item('Relógio de gás', esc(i.gas_relogio || '-'))}
      ${item('Internet / telefone', esc(i.internet || '-'))}
      ${item('Pasta de arquivos', esc(i.pasta || '-'))}</div>
      ${i.observacoes ? `<p class="pre">${esc(i.observacoes)}</p>` : ''}</div>
    <div class="cartao"><h2>Inquilinos deste imóvel</h2><div class="rolagem"><table>
      <tr><th>Ativo</th><th>Inquilino</th><th>Entrada</th><th>Saída</th><th class="n">Aluguel atual</th><th>Situação</th><th>NF ou controle</th></tr>
      ${contratos.map((c) => `<tr class="${c.verificar ? 'amarelo' : ''}"><td><input type="checkbox" title="Inquilino ativo (gera boleto)" data-acao="alternarAtivo" data-id="${c.id}" ${c.ativo !== false ? 'checked' : ''} ${opera() ? '' : 'disabled'}></td>
        <td><a href="#/contrato/${c.id}"><b>${esc(c.inquilino_nome)}</b></a>${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}<br><span class="suave">📁 ${esc(c.pasta || nomePastaContrato(c))}</span></td>
        <td>${dataBr(c.data_entrada)}</td><td>${dataBr(c.data_saida)}</td><td class="n">${reais(R.aluguelAtual(d(), c))}</td>
        <td>${R.contratoAtivo(c, hoje) ? etiqueta('Atual', 'ok') : etiqueta('Encerrado', 'neutra')} ${c.prazo_tipo === 'Indeterminado' ? etiqueta('Indeterminado', 'aviso') : ''}</td>
        <td><label class="check-mini" title="Desmarcado: boleto de controle (não gera NF nem entra nas somas e nos resultados)"><input type="checkbox" data-acao="alternarNf" data-id="${c.id}" ${R.geraNf(c) ? 'checked' : ''} ${opera() ? '' : 'disabled'}> emite NF</label>
          ${R.geraNf(c) ? '' : `<br>${seloControle()}`}</td></tr>`).join('') || '<tr><td colspan="7" class="suave">Nenhum inquilino cadastrado.</td></tr>'}
    </table></div><p class="suave">Desmarque "Ativo" para não gerar boleto para o inquilino. Desmarque "emite NF" para boleto de controle: o pagamento é acompanhado, mas não gera NF nem entra nas somas dos boletos e nos resultados.</p></div>
    ${caixaIptu(i)}
    ${caixaSeguros(i)}
    ${caixaLeituras(R.leiturasDoImovel(d(), i.id), opera() ? link(`#/novo/leituras?imovel=${i.id}`, 'Registrar leitura') : '', true)}
    <div class="cartao" id="titularidade"><div class="cabecalho"><h2>Troca de titularidade (água, energia, gás, condomínio)</h2>${opera() ? link(`#/novo/titularidades?imovel=${i.id}`, 'Registrar protocolo') : ''}</div>
      ${lembretes.map((a) => `<div class="alerta ${a.nivel}"><b>${esc(a.tipo)}</b> ${esc(a.texto)}</div>`).join('')}
      <div class="rolagem"><table><tr><th>Data</th><th>Concessionária</th><th>Tipo</th><th>Inquilino</th><th>Protocolo</th><th>Situação</th><th></th></tr>
      ${tits.map((t) => { const c = t.contrato_id ? buscar('contratos', t.contrato_id) : null; return `<tr><td>${dataBr(t.data)}</td><td>${esc(t.concessionaria)}</td><td>${esc(t.tipo || '-')}</td><td>${esc(c ? c.inquilino_nome : 'Proprietário')}</td><td><b>${esc(t.protocolo || '-')}</b></td><td>${esc(t.situacao || '-')}</td>
        <td class="n">${opera() ? `${link(`#/editar/titularidades/${t.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'titularidades', id: t.id }, 'perigo pequeno', 'Excluir este registro?')}` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="suave">Nenhum protocolo registrado.</td></tr>'}</table></div></div>
    ${caixaEmpresas(i)}
    ${caixaReformas(i)}
    <div class="cartao"><h2>Último anúncio</h2>${i.anuncio_descricao ? `<p class="pre">${esc(i.anuncio_descricao)}</p>` : '<p class="suave">Nenhuma descrição (use "Editar imóvel").</p>'}</div>
    ${caixaArquivos('anuncio', i.id, 'Fotos do último anúncio', 'anuncio')}
    ${caixaArquivos('imovel', i.id, 'Documentos do imóvel', 'documentos', 'Matrícula, cadastro do IPTU e outros documentos do imóvel.')}
    <div class="cartao"><h2>Histórico do imóvel</h2>${tabelaHistorico(ultimos((h) => h.imovel_id === i.id))}</div>`;
}

// --------------------------------------------------------------------------
// Contrato / inquilino
// --------------------------------------------------------------------------
function selosContrato(c) {
  const base = R.dataBaseCorrecao(c);
  const prazo = c.prazo_tipo === 'Indeterminado'
    ? etiqueta('Prazo indeterminado', 'aviso')
    : etiqueta(`Prazo determinado${c.vigencia_fim ? ` até ${dataBr(c.vigencia_fim)}` : ''}`, 'info');
  const car = R.periodoCarencia(c);
  return `<div class="selos">${prazo}
    ${c.inquilino_tipo === 'Pessoa jurídica (empresa)' ? etiqueta('Empresa (PJ)', 'info') : ''}
    ${c.solidario_nome ? etiqueta(`Solidário: ${c.solidario_nome}`, 'neutra') : ''}
    ${c.possui_aditivos ? etiqueta('Possui termo aditivo', 'aviso') : ''}
    ${(() => { const n = R.solicitacoesDo(d(), c.id).filter((x) => ['Aberta', 'Em andamento'].includes(x.situacao || 'Aberta')).length; return n ? `<a href="#/contrato/${c.id}?ir=solicitacoes">${etiqueta(`${n} solicitação(ões) em aberto`, 'perigo')}</a>` : ''; })()}
    ${c.gerar_nf === false ? seloControle() : ''}
    ${car ? etiqueta(`Carência ${compBr(car[0])}${car[0] !== car[1] ? ` a ${compBr(car[1])}` : ''}`, 'aviso') : ''}
    ${c.renovacao_automatica ? etiqueta('Renovação automática', 'neutra') : ''}
    ${etiqueta(`Correção anual: ${c.indice_correcao || 'índice não informado'}${base ? ` · todo ${dataBr(base).slice(0, 5)}` : ''}`, 'ok')}
    ${etiqueta(`Garantia: ${c.garantia_tipo || 'não informada'}`, 'neutra')}
    ${R.contratoAtivo(c) ? '' : etiqueta('Encerrado', 'perigo')}</div>`;
}

/** Aluguel atual com a bonificação de pontualidade (o que o inquilino paga em dia, sem IPTU e seguro). */
function valorBonificado(c) {
  const aluguel = R.aluguelAtual(d(), c);
  return aluguel - C.descontoPorPercentual(aluguel, R.percentualBonificacao(c));
}

/** Selo e aviso do boleto de controle (inquilino que não emite NF e não conta nos resultados). */
const seloControle = () => etiqueta('Boleto de controle · sem NF · fora dos resultados', 'controle');
const AVISO_CONTROLE = 'não emite NF. O pagamento é acompanhado (em dia ou atrasado), mas não gera NF e não conta nas somas dos boletos nem nos resultados financeiros.';

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
    html += `<h3>Fiadores</h3><table><tr><th>Nome</th><th>CPF / RG</th><th>Contato</th><th>Vínculo</th><th></th></tr>
      ${fiadores.map((f) => `<tr><td><b>${esc(f.nome)}</b>${f.endereco ? `<br><span class="suave">${esc(f.endereco)}</span>` : ''}</td><td>${esc(f.cpf || '-')} / ${esc(f.rg || '-')}</td>
        <td>${esc([f.telefone, f.email].filter(Boolean).join(' · ') || '-')}</td>
        <td class="nw">${f.data_entrada ? dataBr(f.data_entrada) : 'início do contrato'} a ${f.data_saida ? dataBr(f.data_saida) : 'fim do contrato'}</td>
        <td class="n">${opera() ? `${link(`#/novo/fiadores?contrato=${c.id}&substitui=${f.id}`, 'Trocar fiador')} ${link(`#/editar/fiadores/${f.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'fiadores', id: f.id }, 'perigo pequeno', 'Excluir este fiador? Para registrar uma substituição, use "Trocar fiador".')}` : ''}</td></tr>`).join('')
      || '<tr><td colspan="5" class="suave">Nenhum fiador cadastrado.</td></tr>'}</table>
      ${opera() ? `<p>${link(`#/novo/fiadores?contrato=${c.id}`, 'Adicionar fiador')}</p>` : ''}`;
  }
  if (anteriores.length) {
    html += `<h3>Fiadores anteriores</h3><table class="suave"><tr><th>Nome</th><th>CPF / RG</th><th>Fim do vínculo</th><th>Substituído por</th></tr>
      ${anteriores.map((f) => `<tr><td>${esc(f.nome)}</td><td>${esc(f.cpf || '-')} / ${esc(f.rg || '-')}</td><td>${dataBr(f.data_saida)}</td><td>${esc((buscar('fiadores', f.substituido_por_id) || {}).nome || '-')}</td></tr>`).join('')}</table>`;
  }
  if (trocas.length) {
    html += `<h3>Trocas de garantia</h3><table class="suave"><tr><th>Data</th><th>De</th><th>Para</th><th class="n">Valor anterior</th><th>O que aconteceu com a anterior</th></tr>
      ${trocas.map((t) => `<tr><td>${dataBr(t.data)}</td><td>${esc(t.tipo_anterior || '-')}</td><td>${esc(t.tipo_novo)}</td><td class="n">${t.valor_anterior ? reais(t.valor_anterior) : '-'}</td><td>${esc(t.observacoes || '')}</td></tr>`).join('')}</table>`;
  }
  if (sit.total || aplic.length) {
    html += `<h3>Onde o valor foi aplicado</h3>
      ${sit.total && !sit.ok ? `<div class="alerta aviso">Valor integral ainda não aplicado: falta aplicar <b>${reais(sit.falta)}</b> de ${reais(sit.total)}.</div>` : ''}
      <table><tr><th>Empresa</th><th class="n">Aplicado</th></tr>
      ${sit.linhas.map((l) => `<tr><td>${esc(l.emitente.nome)}</td><td class="n">${reais(l.aplicado)}</td></tr>`).join('') || '<tr><td colspan="2" class="suave">Nada aplicado ainda.</td></tr>'}
      <tr class="total"><td>Total aplicado de ${reais(sit.total)}</td><td class="n">${reais(sit.soma)} ${sit.ok ? etiqueta('100% aplicado', 'ok') : ''}</td></tr></table>
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
  const lembrete = R.alertaTitularidade(d(), c);
  return `<div class="cartao" id="saida"><h2>Saída em ${dataBr(e.data_saida)}</h2>
    ${lembrete ? `<div class="alerta aviso"><b>Lembrete</b> ${esc(lembrete.texto)} ${opera() && c.imovel_id ? link(`#/novo/titularidades?imovel=${c.imovel_id}&contrato=${c.id}&tipo=volta`, 'Registrar protocolo') : ''}</div>` : ''}
    <div class="grade">
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
    ${item('IPTU', sit(c.conta_iptu || (c.cobrar_iptu ? R.SITUACOES[0] : R.SITUACOES[1])))}
    ${item('Seguro obrigatório', sit(c.conta_seguro || (c.cobrar_seguro === false ? R.SITUACOES[1] : R.SITUACOES[0])))}
    ${F.CONTAS.map(([k, t]) => item(t, sit(c[k]))).join('')}</div>
    ${c.contas_adicionais ? `<h3>Contas adicionais</h3><p class="pre">${esc(c.contas_adicionais)}</p>` : ''}</div>`;
}

/** Histórico de solicitações do inquilino (pequenos reparos e pedidos). */
function caixaSolicitacoes(c) {
  const lista = R.solicitacoesDo(d(), c.id);
  const cor = { Aberta: 'perigo', 'Em andamento': 'aviso', Concluída: 'ok', 'Não atendida': 'neutra' };
  return `<div class="cartao" id="solicitacoes"><div class="cabecalho"><h2>Histórico de solicitações do inquilino</h2>${opera() ? link(`#/novo/solicitacoes?contrato=${c.id}`, 'Registrar solicitação') : ''}</div>
    <p class="suave">Pequenos reparos e pedidos do inquilino: o que pediu, o que foi feito, quem fez e quanto custou.</p>
    <div class="rolagem"><table><tr><th>Data</th><th>O que pediu</th><th>O que foi feito</th><th>Situação</th><th class="n">Custo</th><th></th></tr>
    ${lista.map((x) => `<tr><td class="nw">${dataBr(x.data)}</td><td class="pre">${esc(x.descricao)}</td>
      <td class="pre">${esc(x.providencia || '')}${x.responsavel ? `<br><span class="suave">${esc(x.responsavel)}</span>` : ''}</td>
      <td>${etiqueta(x.situacao || 'Aberta', cor[x.situacao] || 'neutra')}${x.data_conclusao ? `<br><span class="suave">em ${dataBr(x.data_conclusao)}</span>` : ''}</td>
      <td class="n">${x.valor ? `${reais(x.valor)}${x.pago_por ? `<br><span class="suave">${esc(x.pago_por)}</span>` : ''}` : '-'}</td>
      <td class="n nw">${opera() ? `${link(`#/editar/solicitacoes/${x.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'solicitacoes', id: x.id }, 'perigo pequeno', 'Excluir esta solicitação?')}` : ''}</td></tr>`).join('')
    || '<tr><td colspan="6" class="suave">Nenhuma solicitação registrada.</td></tr>'}</table></div></div>`;
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
    <p class="suave">As parcelas entram no boleto do inquilino que estiver no imóvel no mês de cada parcela (se o contrato dele inclui o seguro).</p>
    ${caixaArquivos('seguro', i.id, 'Apólices', 'apolices', 'Anexe aqui o PDF da apólice.', true)}</div>`;
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
  const outros = R.outrosContratosDaPessoa(d(), c, hoje);
  const car = R.periodoCarencia(c);
  const pj = c.inquilino_tipo === 'Pessoa jurídica (empresa)';
  const pessoa = (pre) => esc([c[`${pre}_cpf`] && `CPF/CNPJ ${c[`${pre}_cpf`]}`, c[`${pre}_rg`] && `RG ${c[`${pre}_rg`]}`, c[`${pre}_telefone`], c[`${pre}_email`]].filter(Boolean).join(' · '));
  return `<p class="suave">${i ? `<a href="#/imovel/${i.id}">← ${esc(i.nome)}</a> · ` : ''}<a href="#/inquilinos">Todos os inquilinos</a></p>
    <div class="cabecalho"><h1>${esc(c.inquilino_nome)}${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}</h1><div class="acoes">
      ${opera() ? link(`#/editar/contratos/${c.id}`, 'Editar', 'botao') : ''}
      ${link(`#/contrato-gerar/${c.id}`, 'Gerar contrato', 'botao secundario')}
      ${podeUsuario('admin') ? botao('excluir', 'Excluir', { tabela: 'contratos', id: c.id }, 'perigo', 'Excluir este contrato e todos os seus boletos?') : ''}</div></div>
    ${i ? `<div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>` : `<div class="alerta aviso">Sem imóvel vinculado. Use "Editar" para escolher o imóvel.</div>`}
    ${c.ativo === false ? `<div class="alerta info">Inquilino inativo: não gera boleto.</div>` : ''}
    ${R.geraNf(c) ? '' : `<div class="alerta controle"><b>Boleto de controle.</b> Este inquilino ${AVISO_CONTROLE} ${opera() ? botao('alternarNf', 'Passar a emitir NF', { id: c.id }, 'secundario pequeno', 'Este inquilino passa a emitir NF e a contar nos resultados?') : ''}</div>`}
    ${selosContrato(c)}
    ${caixaVerificar(c.verificar)}
    ${outros.length ? `<div class="alerta info">Este inquilino também aluga: ${outros.map((x) => `<a href="#/contrato/${x.id}">${esc((buscar('imoveis', x.imovel_id) || {}).nome || 'sem imóvel')}</a>`).join(', ')}.</div>` : ''}
    ${cadeia.antes.length || cadeia.depois.length ? `<div class="alerta info">${cadeia.antes.length ? `Continua o contrato de ${cadeia.antes.map(lig).join(' → ')}. ` : ''}${cadeia.depois.length ? `Continuado por ${cadeia.depois.map(lig).join(' → ')}.` : ''}</div>` : ''}
    ${alertas.map((a) => `<div class="alerta ${a.nivel}"><b>${esc(a.tipo)}</b> ${esc(a.texto)}</div>`).join('')}
    <div class="cartao"><h2>Identificação e contato</h2><div class="grade">
      ${item('Telefone', `${esc(c.inquilino_telefone || '-')}${c.inquilino_whatsapp && tel ? ` <a class="etiqueta ok" target="_blank" rel="noopener" href="https://wa.me/${tel.length <= 11 ? `55${tel}` : tel}">WhatsApp</a>` : ''}`)}
      ${item('E-mail', c.inquilino_email ? `<a href="mailto:${esc(c.inquilino_email)}">${esc(c.inquilino_email)}</a>` : '-')}
      ${item('CPF / CNPJ', esc(c.inquilino_cpf || '-'))}${item('RG', esc(c.inquilino_rg || '-'))}
      ${c.responsavel_nome ? item('Outro contato', esc([c.responsavel_nome, c.responsavel_telefone, c.responsavel_email].filter(Boolean).join(' · '))) : ''}</div>
      ${pj ? `<h3>Representante da empresa</h3>${c.representante_nome ? `<p><b>${esc(c.representante_nome)}</b>${c.representante_cargo ? ` (${esc(c.representante_cargo)})` : ''} · ${pessoa('representante')}</p>` : '<div class="alerta aviso">Empresa sem representante cadastrado. Use "Editar".</div>'}` : ''}
      ${c.solidario_nome ? `<h3>Inquilino solidário</h3><p><b>${esc(c.solidario_nome)}</b> · ${pessoa('solidario')}</p><p class="suave">O boleto sai no nome do inquilino principal.</p>` : ''}</div>
    <div class="cartao"><h2>Contrato e valores</h2><div class="grade">
      ${item('Entrada / saída', `${dataBr(c.data_entrada)} a ${dataBr(c.data_saida)}`)}
      ${item('Contrato', `${dataBr(c.vigencia_inicio)} a ${c.prazo_tipo === 'Indeterminado' ? 'prazo indeterminado' : `${dataBr(c.vigencia_fim)}${c.prazo_meses ? ` (${c.prazo_meses} meses)` : ''}`}`)}
      ${item('Aluguel inicial (histórico)', reais(c.aluguel_inicial))}${item('Aluguel atual (cheio)', `<span class="maior">${reais(aluguel)}</span>`)}
      ${item('Bonificação de pontualidade', c.bonificacao === false ? 'não tem' : `${pct(pctBonif)} = ${reais(desconto)}`)}${item('Aluguel com bonificação', reais(aluguel - desconto))}
      ${item('Vencimento', `dia ${c.dia_vencimento} ${c.cobranca_mes_seguinte !== false ? 'do mês seguinte' : 'do próprio mês'}`)}${item('Taxa do boleto', reais(c.taxa_boleto))}
      ${item('Multa por atraso', pct(c.multa_percentual))}${item('Juros por atraso', `${pct(c.juros_mensal_percentual)} ao mês`)}
      ${item('NF', c.gerar_nf === false ? 'não emite (só controle do pagamento)' : 'emite')}
      ${car ? item('Carência', `${compBr(car[0])} a ${compBr(car[1])} · cobra: ${['iptu', 'seguro', 'taxa'].filter((k) => c[`carencia_cobrar_${k}`]).map((k) => ({ iptu: 'IPTU', seguro: 'seguro', taxa: 'tarifa' })[k]).join(', ') || 'nada'}`) : ''}</div>
      ${c.reserva_valor > 0 ? `<h3>Reserva dada na visita</h3><div class="grade">${item('Valor / data', `${reais(c.reserva_valor)} em ${dataBr(c.reserva_data)}`)}${item('Usar no aluguel de', `${compBr(R.competenciaReserva(c))}${c.reserva_competencia ? '' : ' (primeiro aluguel)'}`)}${item('Saldo ainda não usado', reais(R.saldoReserva(d(), c)))}</div>` : ''}
      ${c.observacoes ? `<h3>Observações</h3><p class="pre">${esc(c.observacoes)}</p>` : ''}</div>
    ${caixaIncluso(c)}
    ${caixaSolicitacoes(c)}
    ${caixaGarantia(c)}
    <div class="cartao"><div class="cabecalho"><h2>Correção anual do aluguel (${esc(c.indice_correcao || 'índice não informado')})</h2>${opera() ? link(`#/novo/correcoes?contrato=${c.id}`, 'Registrar correção') : ''}</div>
      ${(() => { const r = R.reajustePendente(d(), c); if (!r) { const p = R.primeiroMesCheio(c); return p ? `<p class="suave">Reajuste no 13º mês cheio: aluguel de ${compBr(R.competenciaDoReajuste(c, Math.max(1, Math.floor(C.mesesEntre(p, C.competenciaDe(C.hojeIso())) / 12) + 1)))}.</p>` : ''; }
    return `<div class="alerta aviso"><b>Reajuste do aluguel de ${compBr(r.competencia)}</b> (${r.anos} ano(s)) ${botoesReajuste(c, r)}</div>`; })()}
      <table><tr><th>Vale a partir de</th><th>Previsto no contrato</th><th>Índice usado</th><th class="n">%</th><th class="n">Valor anterior</th><th class="n">Novo valor</th><th></th></tr>
      <tr><td>${dataBr(c.vigencia_inicio)}</td><td colspan="4" class="suave">Valor inicial do contrato</td><td class="n">${reais(c.aluguel_inicial)}</td><td></td></tr>
      ${R.correcoesDo(d(), c.id).map((x) => `<tr><td>${dataBr(x.data_vigencia)}</td><td>${esc(x.indice_contrato || '-')}</td><td>${x.indice === 'Negociado' ? etiqueta('Negociado', 'aviso') : `${esc(x.indice || '-')}${x.data_indice ? ` <span class="suave">(${compBr(x.data_indice)})</span>` : ''}`}</td><td class="n">${pct(x.percentual)}</td><td class="n">${reais(x.valor_anterior)}</td><td class="n"><b>${reais(x.valor_novo)}</b></td><td class="n">${opera() ? botao('excluir', 'Excluir', { tabela: 'correcoes', id: x.id }, 'perigo pequeno', 'Excluir esta correção?') : ''}</td></tr>`).join('')}</table></div>
    <div class="cartao" id="renovacoes"><div class="cabecalho"><h2>Renovação e novo valor negociado</h2>${opera() ? link(`#/novo/renovacoes?contrato=${c.id}`, 'Registrar renovação / novo valor') : ''}</div>
      <p class="suave">No aniversário vale a correção pelo índice do contrato. No fim do prazo, o novo valor é negociado com o inquilino e registrado aqui.</p>
      <table><tr><th>Data</th><th>O que aconteceu</th><th>Novo término</th><th class="n">Novo valor</th><th>Obs.</th><th></th></tr>
      ${renovs.map((r) => `<tr><td>${dataBr(r.data)}</td><td>${esc(r.tipo)}</td><td>${dataBr(r.nova_vigencia_fim)}</td><td class="n">${r.novo_valor ? reais(r.novo_valor) : '-'}</td><td>${esc(r.observacoes || '')}</td>
        <td class="n">${opera() ? botao('excluirRenovacao', 'Excluir', { id: r.id }, 'perigo pequeno', `Excluir este registro${r.novo_valor ? ' e o novo valor negociado' : ''}? A data de término do contrato não volta sozinha: confira em "Editar".`) : ''}</td></tr>`).join('')
      || '<tr><td colspan="6" class="suave">Nenhuma renovação registrada.</td></tr>'}</table></div>
    <div class="cartao"><h2>Boletos</h2><div class="rolagem"><table><tr><th>Competência</th><th>Vencimento</th><th class="n">Valor pontual</th><th>Situação</th><th>Pago em</th><th>Multa e juros</th><th class="n">Valor NF</th><th>NF</th></tr>
      ${cobs.map((x) => { const fs = R.faturasDe(d(), 'cobranca', x.id); return `<tr><td><a href="#/cobranca/${x.id}">${compBr(x.competencia)}</a>${x.carencia ? ` ${etiqueta('carência', 'aviso')}` : ''}</td><td>${dataBr(x.vencimento)}</td><td class="n">${reais(R.totais(x).a_pagar_pontual)}</td><td>${situacao(x.situacao)}${x.pagou_em_dia ? ` ${etiqueta('pagou em dia', 'ok')}` : ''}</td><td>${dataBr(x.data_pagamento)}</td><td>${multaJurosTexto(x)}</td><td class="n">${x.valor_nf !== null ? reais(x.valor_nf) : '-'}</td><td>${fs.length ? `Nº ${R.numeroFatura(fs[0].numero)}` : (c.gerar_nf === false ? etiqueta('controle', 'controle') : '-')}</td></tr>`; }).join('') || '<tr><td colspan="8" class="suave">Nenhum boleto gerado ainda. Gere na tela "Boletos".</td></tr>'}</table></div></div>
    <div class="cartao"><div class="cabecalho"><h2>Trocas de titularidade deste inquilino</h2>${opera() && i ? link(`#/novo/titularidades?imovel=${i.id}&contrato=${c.id}`, 'Registrar protocolo') : ''}</div>
      <table><tr><th>Data</th><th>Concessionária</th><th>Tipo</th><th>Protocolo</th><th>Situação</th></tr>
      ${d().titularidades.filter((t) => t.contrato_id === c.id).map((t) => `<tr><td>${dataBr(t.data)}</td><td>${esc(t.concessionaria)}</td><td>${esc(t.tipo || '-')}</td><td><b>${esc(t.protocolo || '-')}</b></td><td>${esc(t.situacao || '-')}</td></tr>`).join('') || '<tr><td colspan="5" class="suave">Nenhum protocolo registrado.</td></tr>'}</table></div>
    ${caixaLeituras(R.leiturasDo(d(), c.id), opera() && i ? link(`#/novo/leituras?imovel=${i.id}&contrato=${c.id}`, 'Registrar leitura') : '', false)}
    <div class="cartao" id="vistoria"><h2>Fotos da vistoria de entrada</h2>${c.vistoria_link ? `<p><a class="botao" href="${esc(c.vistoria_link)}" target="_blank" rel="noopener noreferrer">Abrir a pasta das fotos da vistoria</a></p><p class="suave">${esc(c.vistoria_link)}</p>` : `<p class="suave">Nenhum link cadastrado. Use "Editar" e cole o link da pasta na nuvem onde está o .rar das fotos.</p>`}</div>
    ${caixaArquivos('contrato', c.id, `Arquivos do inquilino · 📁 ${c.pasta || nomePastaContrato(c)}`, 'arquivos', `Ficha cadastral, documentos iniciais, contrato, termos aditivos, vistoria de entrada e saída, notificações, documento de identificação${pj ? ', contrato social e cartão CNPJ da empresa, documentos do representante' : ''}${c.solidario_nome ? ', documentos do inquilino solidário' : ''} etc.`)}
    <div class="cartao"><h2>Histórico deste inquilino${historicoIds.size > 1 ? ' e dos contratos ligados' : ''}</h2>${tabelaHistorico(ultimos((h) => historicoIds.has(h.contrato_id), 80))}</div>
    ${caixaSaida(c)}`;
}

// --------------------------------------------------------------------------
// Formulários de cadastro
// --------------------------------------------------------------------------
/** Opções das listas editáveis (concessionárias, índices) vêm do banco. */
const comListas = (campos) => campos.map((c) => (c.lista ? { ...c, opcoes: R.lista(d(), c.lista) } : c));

let antesDoVinculo = null;
let fiadoresNovos = [];
let avisoAditivo = '';
let guardarModeloAirbnb = false;
const CADASTROS = {
  imoveis: {
    titulo: (r) => (r ? 'Editar imóvel' : 'Novo imóvel'),
    campos: () => F.IMOVEL,
    fixos: (r) => (r ? {} : { tipo: 'normal' }),
    voltar: (r) => (r ? `#/imovel/${r.id}` : '#/imoveis'),
    descricao: (dados) => dados.nome,
    ajustar(dados, erros, r) {
      dados.pasta = S.limparNome(dados.nome);
      if (d().imoveis.some((x) => x.id !== (r && r.id) && S.limparNome(x.nome) === dados.pasta)) erros.nome = 'Já existe um imóvel com este nome';
    },
    async depois(salvo, antigo) {
      if (antigo && antigo.pasta && antigo.pasta !== salvo.pasta) await renomearNoDisco([], antigo.pasta, salvo.pasta);
    },
  },
  solicitacoes: {
    titulo: (r, q) => `Solicitação do inquilino - ${buscar('contratos', r ? r.contrato_id : q.contrato).inquilino_nome}`,
    campos: () => F.SOLICITACAO,
    fixos: (r, q) => (r ? {} : { contrato_id: Number(q.contrato) }),
    padrao: () => ({ data: C.hojeIso() }),
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}?ir=solicitacoes`,
    descricao: (dados) => `Solicitação: ${String(dados.descricao || '').slice(0, 80)}`,
    ajustar(dados) {
      if (dados.situacao === 'Concluída' && !dados.data_conclusao) dados.data_conclusao = C.hojeIso();
    },
  },
  reformas: {
    titulo: (r, q) => `Reforma / investimento - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: () => F.REFORMA,
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    padrao: () => ({ data: C.hojeIso() }),
    voltar: (r, q) => `#/imovel/${r ? r.imovel_id : q.imovel}?ir=reformas`,
    descricao: (dados) => `Reforma: ${dados.descricao} ${reais(dados.valor)}`,
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
      const imoveis = ordenar(d().imoveis, 'nome').map((i) => [String(i.id), i.nome]);
      const semFiadorNoForm = r && R.fiadoresDo(d(), r.id).length; // fiadores já cadastrados: gerencia na página do inquilino
      return comListas(F.CONTRATO.filter((c) => (r || !c.soEditar) && !(semFiadorNoForm && c.fiador))
        .map((c) => (c.nome === 'contrato_anterior_id' ? { ...c, opcoes: ops } : c.nome === 'imovel_id' ? { ...c, opcoes: imoveis } : c)));
    },
    padrao: (q) => (q.imovel ? { imovel_id: Number(q.imovel) } : {}),
    valores: (r) => ({ ...r, ativo: r.ativo !== false, gerar_nf: r.gerar_nf !== false, tem_solidario: !!r.solidario_nome,
      conta_iptu: r.conta_iptu || (r.cobrar_iptu ? R.SITUACOES[0] : R.SITUACOES[1]), conta_seguro: r.conta_seguro || (r.cobrar_seguro === false ? R.SITUACOES[1] : R.SITUACOES[0]),
      inquilino_tipo: r.inquilino_tipo || 'Pessoa física', prazo_meses: r.prazo_meses || C.mesesDoPrazo(r.vigencia_inicio, r.vigencia_fim),
      aluguel_bonificado: r.bonificacao === false ? null : valorBonificado(r) }),
    aviso: (r) => (r ? 'Mudou o dia do vencimento ou a garantia? Isso exige termo aditivo: anexe o termo assinado em "Arquivos do inquilino".' : ''),
    voltar: (r, q) => (r ? `#/contrato/${r.id}` : q.vincular ? `#/novo/vinculos?imovel=${q.vincular}` : q.imovel ? `#/imovel/${q.imovel}` : '#/inquilinos'),
    descricao: (dados, r) => dados.inquilino_nome || (r && r.inquilino_nome),
    base: (r) => (r ? R.aluguelAtual(d(), r) : null),
    ajustar(dados, erros, r, form) {
      const base = r ? R.aluguelAtual(d(), r) : dados.aluguel_inicial;
      const bonificadoTexto = String(new FormData(form).get('aluguel_bonificado') || '').trim();
      if (dados.bonificacao && bonificadoTexto) {
        // o aluguel bonificado digitado manda: o % é calculado sem arredondar, para o desconto bater no centavo
        let bonificado = NaN;
        try { bonificado = C.centavos(bonificadoTexto); } catch { /* inválido */ }
        if (!Number.isFinite(bonificado) || bonificado < 0 || bonificado > base) erros.aluguel_bonificado = `Informe um valor entre R$ 0,00 e ${reais(base)} (aluguel cheio)`;
        else dados.desconto_pontualidade_percentual = C.percentualPorBonificado(base, bonificado);
      }
      for (const k of ['desconto_pontualidade_percentual', 'taxa_boleto', 'multa_percentual', 'juros_mensal_percentual', 'reserva_valor', 'carencia_meses']) if (dados[k] === null) dados[k] = 0;
      if (dados.desconto_pontualidade_percentual < 0 || dados.desconto_pontualidade_percentual > 100) erros.desconto_pontualidade_percentual = 'Informe um percentual entre 0 e 100';
      if (dados.dia_vencimento !== null && (dados.dia_vencimento < 1 || dados.dia_vencimento > 31)) erros.dia_vencimento = 'Informe um dia entre 1 e 31';
      if (dados.data_saida && dados.data_entrada && dados.data_saida < dados.data_entrada) erros.data_saida = 'A saída não pode ser antes da entrada';
      if (dados.prazo_tipo === 'Determinado') {
        if (!(dados.prazo_meses > 0)) erros.prazo_meses = 'Informe o prazo em meses, ou marque prazo indeterminado';
        else if (dados.vigencia_inicio) dados.vigencia_fim = C.fimDoPrazo(dados.vigencia_inicio, dados.prazo_meses);
      }
      if (dados.carencia_meses < 0) erros.carencia_meses = 'Valor inválido';
      if (dados.inquilino_tipo === 'Pessoa jurídica (empresa)' && !dados.representante_nome) erros.representante_nome = 'Empresa precisa do representante (pessoa física)';
      // solidário só vale com a caixa marcada
      if (new FormData(form).get('tem_solidario') !== '1') for (const k of ['solidario_nome', 'solidario_cpf', 'solidario_rg', 'solidario_telefone', 'solidario_email']) dados[k] = null;
      else if (!dados.solidario_nome) erros.solidario_nome = 'Informe o nome do inquilino solidário';
      // só "por conta do inquilino" entra no boleto
      dados.cobrar_iptu = dados.conta_iptu === R.SITUACOES[0];
      dados.cobrar_seguro = dados.conta_seguro === R.SITUACOES[0];
      // fiadores digitados no próprio cadastro
      fiadoresNovos = [];
      for (const n of [1, 2]) {
        const f = Object.fromEntries(F.CAMPOS_FIADOR.map((c) => [c.nome, dados[`fiador${n}_${c.nome}`] ?? null]));
        F.CAMPOS_FIADOR.forEach((c) => delete dados[`fiador${n}_${c.nome}`]);
        const algum = Object.values(f).some((v) => v);
        if (!algum || !R.temFiador(dados)) continue;
        if (!f.nome) erros[`fiador${n}_nome`] = 'Informe o nome do fiador';
        else fiadoresNovos.push(f);
      }
      avisoAditivo = '';
      if (r && (dados.dia_vencimento !== r.dia_vencimento || (r.garantia_tipo && dados.garantia_tipo !== r.garantia_tipo))) {
        dados.possui_aditivos = true;
        avisoAditivo = `Você mudou ${dados.dia_vencimento !== r.dia_vencimento ? 'o dia do vencimento' : 'a garantia'}: anexe o termo aditivo assinado em "Arquivos do inquilino". O contrato ficou marcado com "Possui termo aditivo".`;
      }
      dados.pasta = nomePastaContrato({ ...r, ...dados });
    },
    salvar(db, dados, q, r) {
      let c;
      if (r) {
        R.atualizar(db, 'contratos', r.id, dados, login(), dados.inquilino_nome);
        c = R.buscar(db, 'contratos', r.id);
      } else c = R.inserir(db, 'contratos', dados, login(), dados.inquilino_nome);
      for (const f of fiadoresNovos) R.inserir(db, 'fiadores', { ...f, contrato_id: c.id }, login(), `Fiador ${f.nome}`);
      fiadoresNovos = [];
      return c;
    },
    recalcular: (salvo) => (cb) => cb.contrato_id === salvo.id,
    async depois(salvo, antigo) {
      if (avisoAditivo) aviso(avisoAditivo, 'aviso');
      avisoAditivo = '';
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
    campos: () => comListas(F.CORRECAO),
    fixos: (r, q) => ({ contrato_id: Number(q.contrato), indice_contrato: buscar('contratos', q.contrato).indice_correcao || '' }),
    padrao: (q) => { const ind = buscar('contratos', q.contrato).indice_correcao || ''; return { indice: ind.includes('/') ? '' : ind }; },
    recalcular: (salvo) => (cb) => cb.contrato_id === salvo.contrato_id,
    destino: (salvo) => {
      const c = buscar('contratos', salvo.contrato_id);
      if (!R.temCaucao(c)) return `#/contrato/${c.id}`;
      aviso('O aluguel foi corrigido: corrija também a caução.', 'aviso');
      return `#/novo/correcoes_garantia?contrato=${c.id}`;
    },
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); return `Aluguel atual: ${reais(R.aluguelAtual(d(), c))}. Índice previsto no contrato: ${c.indice_correcao || 'não informado'}${(c.indice_correcao || '').includes('/') ? ' (escolha abaixo qual índice foi usado nesta correção)' : ''}.`; },
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
    recalcular: (salvo, db) => (cb) => (R.buscar(db, 'contratos', cb.contrato_id) || {}).imovel_id === salvo.imovel_id,
    voltar: (r, q) => `#/imovel/${r ? r.imovel_id : q.imovel}`,
    descricao: () => 'Seguro obrigatório',
  },
  iptus: {
    titulo: (r, q) => `IPTU - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: () => F.IPTU,
    // IPTU lançado antes guardava o mês de uso: mostra o mês de vencimento do boleto (o seguinte)
    valores: (r) => ({ ...r, primeiro_vencimento_boleto: r.primeiro_vencimento_boleto || (r.primeira_competencia ? C.somarMeses(r.primeira_competencia, 1) : null) }),
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    recalcular: (salvo, db) => (cb) => (R.buscar(db, 'contratos', cb.contrato_id) || {}).imovel_id === salvo.imovel_id,
    padrao: (q) => {
      // novo ano: parte do ano anterior (mesmas parcelas, 1ª parcela no mesmo mês)
      const ano = Number(q.ano) || new Date().getFullYear();
      const ant = d().iptus.filter((p) => p.imovel_id === Number(q.imovel) && p.ano < ano).sort((a, b) => b.ano - a.ano)[0];
      const mesAnt = ant && (ant.primeiro_vencimento_boleto || (ant.primeira_competencia && C.somarMeses(ant.primeira_competencia, 1)));
      return ant ? { ano, num_parcelas: ant.num_parcelas, primeiro_vencimento_boleto: mesAnt ? `${ano}${mesAnt.slice(4)}` : null,
        vencimento_primeira: ant.vencimento_primeira ? C.somarAnos(ant.vencimento_primeira, ano - ant.ano) : null } : { ano };
    },
    aviso: (r, q) => {
      const iid = r ? r.imovel_id : Number(q.imovel);
      const ant = d().iptus.filter((p) => p.imovel_id === iid && p.ano < (r ? r.ano : Number(q.ano) || new Date().getFullYear())).sort((a, b) => b.ano - a.ano)[0];
      return ant ? `Ano anterior (${ant.ano}): total ${reais(ant.valor_total)} em ${ant.num_parcelas} parcela(s)${ant.valor_parcela ? ` de ${reais(ant.valor_parcela)}` : ''}.` : 'Primeiro IPTU lançado para este imóvel.';
    },
    ajustar(dados, erros, r, form, q) {
      const iid = r ? r.imovel_id : Number(q.imovel);
      if (d().iptus.some((p) => p.imovel_id === iid && p.ano === dados.ano && (!r || p.id !== r.id))) erros.ano = 'Já existe IPTU deste ano para o imóvel. Use "Editar".';
      if (!(dados.num_parcelas >= 1)) erros.num_parcelas = 'Informe pelo menos 1 parcela';
      if (!dados.pago_avista) Object.assign(dados, { valor_avista: null, data_quitacao: null, cobranca_inquilino: null });
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
      return comListas(F.TITULARIDADE.map((c) => (c.nome === 'contrato_id' ? { ...c, opcoes: ops } : c)));
    },
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    padrao: (q) => ({ contrato_id: q.contrato || '', situacao: 'Solicitado', data: C.hojeIso(), tipo: q.tipo === 'volta' ? 'Volta para o proprietário' : 'Para o inquilino' }),
    voltar: (r, q) => (q.contrato ? `#/contrato/${q.contrato}` : `#/imovel/${r ? r.imovel_id : q.imovel}`),
    descricao: (dados) => `${dados.concessionaria} ${dados.protocolo || ''}`.trim(),
  },
  fiadores: {
    titulo: (r, q) => `${q.substitui ? 'Trocar fiador' : 'Fiador'} - ${buscar('contratos', r ? r.contrato_id : q.contrato).inquilino_nome}`,
    campos: (r, q) => (q && q.substitui ? F.TROCA_FIADOR : F.FIADOR),
    padrao: (q) => (q.substitui ? { data_troca: C.hojeIso() } : {}),
    ajustar(dados, erros) {
      if (dados.data_entrada && dados.data_saida && dados.data_saida < dados.data_entrada) erros.data_saida = 'O fim do vínculo não pode ser antes do início';
    },
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
      return { data: C.hojeIso(), valor: s.falta > 0 ? s.falta : null };
    },
    aviso: (r, q) => { const s = R.situacaoAplicacao(d(), buscar('contratos', q.contrato)); return `Garantia ${reais(s.total)}: aplicado ${reais(s.soma)}${s.linhas.length ? ` (${s.linhas.map((l) => `${l.emitente.nome} ${reais(l.aplicado)}`).join('; ')})` : ''}, falta ${reais(Math.max(s.falta, 0))}. Pode aplicar tudo numa empresa só.`; },
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
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); const v = R.valorGarantia(d(), c); return `Garantia atual: ${c.garantia_tipo || 'não informada'}${v ? ` de ${reais(v)}` : ''}. Ela fica guardada no histórico do contrato. A troca exige termo aditivo: depois de salvar, anexe o termo assinado em "Arquivos do inquilino".`; },
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
    campos: (r, q) => {
      // inquilinos sem imóvel primeiro; quem já aluga outro imóvel também aparece (ganha um contrato novo para este)
      const vistos = new Set();
      const ops = d().contratos.filter((c) => c.imovel_id !== Number(q.imovel))
        .sort((a, b) => (!!a.imovel_id - !!b.imovel_id) || (b.ativo !== false) - (a.ativo !== false) || a.inquilino_nome.localeCompare(b.inquilino_nome, 'pt-BR'))
        .filter((c) => { const k = `${c.inquilino_nome}|${c.inquilino_cpf || ''}`; if (c.imovel_id && vistos.has(k)) return false; vistos.add(k); return true; })
        .map((c) => [String(c.id), `${c.inquilino_nome}${c.imovel_id ? ` · já aluga ${(buscar('imoveis', c.imovel_id) || {}).nome || 'outro imóvel'} (cria contrato novo)` : ''}${c.ativo === false ? ' (inativo)' : ''}`]);
      return F.VINCULO.map((c) => (c.nome === 'contrato_id' ? { ...c, opcoes: ops } : c));
    },
    padrao: (q) => { const c = q.contrato ? buscar('contratos', q.contrato) : null; return { contrato_id: c ? c.id : null, data_entrada: (c && !c.imovel_id && c.data_entrada) || C.hojeIso() }; },
    aviso: () => 'Escolha o inquilino. Se ele já aluga outro imóvel, é criado um contrato novo para este imóvel com os dados dele: depois confira os valores.',
    extraHtml: (r, q) => `<p class="suave" style="margin-top:12px">O inquilino não está na lista? ${link(`#/novo/contratos?vincular=${q.imovel}`, 'Cadastrar novo inquilino')}</p>`,
    voltar: (r, q) => `#/imovel/${q.imovel}`,
    salvar(db, dados, q) {
      antesDoVinculo = { ...R.buscar(db, 'contratos', dados.contrato_id) };
      const c = R.vincularInquilino(db, Number(q.imovel), dados, login());
      if (c.pasta !== nomePastaContrato(c)) R.atualizar(db, 'contratos', c.id, { pasta: nomePastaContrato(c) }, login(), 'Pasta de arquivos');
      return c;
    },
    depois: (salvo) => (antesDoVinculo && antesDoVinculo.id === salvo.id ? CADASTROS.contratos.depois(salvo, antesDoVinculo) : null),
    destino: (salvo) => {
      if (antesDoVinculo && antesDoVinculo.id !== salvo.id) {
        aviso('Contrato novo criado para este imóvel com os dados do inquilino. Confira aluguel, datas e garantia e salve.', 'aviso');
        return `#/editar/contratos/${salvo.id}`;
      }
      return `#/contrato/${salvo.id}`;
    },
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
    titulo: (r, q) => (r ? 'Editar NF avulsa' : q.modelo === 'airbnb' ? 'Nova NF avulsa do Airbnb' : 'Nova NF avulsa'),
    campos: () => F.AVULSA.map((c) => (c.nome === 'imovel_id' ? { ...c, opcoes: ordenar(d().imoveis, 'nome').map((i) => [String(i.id), i.nome]) } : c)),
    // Airbnb: vem preenchida com os dados padrão (todos podem ser mudados aqui)
    padrao: (q) => ({ data_pagamento: C.hojeIso(), ...(q.modelo === 'airbnb' ? R.modeloAirbnb(d()) : {}) }),
    aviso: (r, q) => (!r && q.modelo === 'airbnb' ? 'Dados do Airbnb já preenchidos: confira, informe a data em que o dinheiro entrou e o valor. Pode mudar qualquer campo.' : ''),
    extraHtml: (r, q) => (!r && q.modelo === 'airbnb' ? '<p style="margin-top:12px"><label class="check" style="padding:0"><input type="checkbox" name="salvar_modelo" value="1"> Guardar a descrição, o cliente, o imóvel, o município e as observações como padrão das próximas NFs do Airbnb</label></p>' : ''),
    voltar: () => '#/faturas',
    descricao: (dados) => `NF avulsa: ${dados.tomador_nome} ${reais(dados.valor)}`,
    ajustar(dados, erros, r, form) {
      if (r && R.faturasDe(d(), 'avulsa', r.id).length) erros.valor = 'Já tem número de NF';
      if (!(dados.valor > 0)) erros.valor = 'Informe o valor';
      guardarModeloAirbnb = new FormData(form).get('salvar_modelo') === '1';
    },
    salvar(db, dados, q, r) {
      if (guardarModeloAirbnb) {
        db.modelo_airbnb = Object.fromEntries(R.CAMPOS_MODELO_AIRBNB.map((k) => [k, dados[k] ?? '']));
        R.registrar(db, login(), 'Alteração', 'avulsas', null, 'Padrão da NF avulsa do Airbnb alterado', db.modelo_airbnb);
      }
      guardarModeloAirbnb = false;
      if (r) { R.atualizar(db, 'avulsas', r.id, dados, login(), `NF avulsa: ${dados.tomador_nome}`); return R.buscar(db, 'avulsas', r.id); }
      return R.inserir(db, 'avulsas', dados, login(), `NF avulsa: ${dados.tomador_nome} ${reais(dados.valor)}`);
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
    titulo: (r) => `${r.data_pagamento ? 'Observações da NF do' : 'Alterar'} boleto ${compBr(r.competencia)} - ${buscar('contratos', r.contrato_id).inquilino_nome}`,
    // boleto pago: só as observações que saem na NF (os valores exigem desfazer o pagamento)
    campos: (r) => (r.data_pagamento ? F.COBRANCA.filter((c) => c.nome === 'observacoes_nf') : F.COBRANCA),
    aviso: (r) => (r.data_pagamento ? 'Boleto já pago: aqui só dá para mudar as observações da NF. Nome e endereço do cliente vêm do cadastro do inquilino e do imóvel.' : ''),
    voltar: (r, q) => (q.nf ? '#/faturas' : `#/cobranca/${r.id}`),
    destino: (salvo, q) => (q.nf ? '#/faturas' : `#/cobranca/${salvo.id}`),
    descricao: (dados, r) => (r.data_pagamento ? 'Observações da NF alteradas' : 'Valores do boleto alterados'),
    ajustar(dados, erros, r) {
      if (r.data_pagamento) {
        if (R.faturasDe(d(), 'cobranca', r.id).length) erros.observacoes_nf = 'A NF já foi numerada. Cancele a NF (ou desfaça a numeração) antes de corrigir';
        return;
      }
      for (const k of ['desconto', 'iptu', 'seguro', 'taxa_boleto', 'outros', 'reserva_utilizada', 'multa_percentual', 'juros_mensal_percentual']) if (dados[k] === null) dados[k] = 0;
      dados.editado_manual = true; // o recálculo automático não mexe mais nestes valores
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
/**
 * Confirmação do pagamento: data contábil (entrada no banco, vira a data da NF), "pagou em dia" (compensou depois,
 * sem multa e juros) e, se atrasou de verdade, o dia em que pagou (multa e juros até esse dia, como o banco cobra).
 */
function formPagamento(cb, compacto) {
  const emDia = `<label class="check-mini" title="Pagou até o vencimento e o banco só compensou depois: sem multa e juros, com desconto"><input type="checkbox" name="em_dia" value="1"> pagou em dia</label>`;
  if (compacto) {
    return `<form data-form="pagamento" data-id="${cb.id}" class="pagamento"><input type="date" name="data" value="${C.hojeIso()}" title="Data contábil: dia em que o dinheiro entrou na conta (é a data da NF)"><input name="valor" placeholder="valor pago" title="Opcional: valor efetivamente recebido" inputmode="decimal" data-dinheiro>${emDia}<button class="pequeno">Confirmar</button></form>`;
  }
  return `<form data-form="pagamento" data-id="${cb.id}" class="pagamento"><label>Data contábil (entrada na conta)</label><input type="date" name="data" value="${C.hojeIso()}">
    <label>Pagou em (se atrasou)</label><input type="date" name="pagou" title="Opcional: dia em que o inquilino pagou. Em branco: a data contábil">
    <label>Valor recebido (opcional)</label><input name="valor" inputmode="decimal" data-dinheiro placeholder="0,00">${emDia}<button>Confirmar pagamento</button></form>
    <p class="suave">A data contábil é a data de emissão da NF, e pode ser alguns dias depois do pagamento. Marque "pagou em dia" quando o inquilino pagou até o vencimento (${dataBr(cb.vencimento)}) e o banco compensou depois: sem multa e juros. Se atrasou de verdade, o banco já cobra multa e juros no boleto e a NF sai com esse valor a mais; informe o dia em que pagou para os juros baterem com o banco.</p>`;
}

const nomeI = (x) => (x.i ? x.i.nome : '');
/** Ordenações da lista de boletos (o padrão é a data de vencimento). */
const ORDENS_BOLETO = {
  vencimento: (a, b) => a.cb.vencimento.localeCompare(b.cb.vencimento) || nomeI(a).localeCompare(nomeI(b), 'pt-BR'),
  imovel: (a, b) => nomeI(a).localeCompare(nomeI(b), 'pt-BR'),
  inquilino: (a, b) => a.c.inquilino_nome.localeCompare(b.c.inquilino_nome, 'pt-BR'),
  valor: (a, b) => b.t.a_pagar_pontual - a.t.a_pagar_pontual,
};

function telaCobrancas(comp, ordem = 'vencimento') {
  const hoje = C.hojeIso();
  const lista = d().cobrancas.filter((x) => x.competencia === comp).map((cb) => {
    const c = buscar('contratos', cb.contrato_id);
    return { cb, c, i: buscar('imoveis', c.imovel_id), t: R.totais(cb), fs: R.faturasDe(d(), 'cobranca', cb.id) };
  }).sort(ORDENS_BOLETO[ordem] || ORDENS_BOLETO.vencimento);
  const faltando = d().contratos.filter((c) => c.ativo !== false && c.imovel_id && C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0 && !lista.some((x) => x.c.id === c.id));
  const pend = R.pendentesDeFatura(d());
  // boleto de controle (inquilino sem NF) não entra nas somas
  const soma = (f) => lista.filter((x) => R.geraNf(x.c)).reduce((s, x) => s + f(x), 0);
  const controle = lista.filter((x) => !R.geraNf(x.c)).length;
  // reajuste no aluguel seguinte: a carta vai junto com este boleto
  const proxima = C.somarMeses(comp, 1);
  const reajustes = new Map(lista.map((x) => [x.c.id, R.reajusteNaCompetencia(d(), x.c, proxima)]).filter(([, r]) => r && !r.corrigido));
  // botões de impressão em cima e embaixo da lista
  const impressao = `${botao('imprimirDemonstrativos', 'Imprimir demonstrativos selecionados', { comp }, 'botao')}
      <a class="botao secundario" href="#/imprimir/demonstrativos?comp=${comp}">Imprimir todos os demonstrativos do mês</a>`;
  return `<div class="cabecalho"><h1>Boletos de ${compBr(comp)}</h1>
      <div class="acoes"><a class="botao secundario" href="#/cobrancas?comp=${C.somarMeses(comp, -1)}&ordem=${ordem}">← ${compBr(C.somarMeses(comp, -1))}</a>
      <form data-form="irMes" class="acoes"><input type="month" name="comp" value="${comp}" style="width:160px"><button class="secundario">Ir</button></form>
      <a class="botao secundario" href="#/cobrancas?comp=${C.somarMeses(comp, 1)}&ordem=${ordem}">${compBr(C.somarMeses(comp, 1))} →</a></div></div>
    <p class="suave">Competência é o mês de uso do imóvel. Ao receber, informe a data do pagamento e clique em Confirmar. Depois, numere as NFs: a numeração segue a ordem das datas de pagamento.</p>
    ${reajustes.size ? `<div class="alerta aviso"><b>Reajuste</b> ${reajustes.size} inquilino(s) têm o aluguel de ${compBr(proxima)} corrigido: envie a carta de reajuste junto com o boleto deste mês (botão "Gerar carta" na linha). ${link('#/reajustes', 'Ver reajustes')}</div>` : ''}
    ${faltando.length && opera() ? `<div class="alerta aviso">${faltando.length} contrato(s) ainda sem boleto neste mês: ${faltando.map((c) => esc(c.inquilino_nome)).join(', ')}. ${botao('gerarCobrancas', `Gerar boletos de ${compBr(comp)}`, { comp }, 'pequeno')}</div>` : ''}
    ${opera() && lista.some((x) => !x.cb.data_pagamento) ? `<p class="acoes">${botao('recalcularMes', `Recalcular boletos em aberto de ${compBr(comp)} pelo cadastro`, { comp }, 'secundario pequeno', 'Recalcular os boletos em aberto deste mês com os valores atuais do cadastro? Boletos alterados à mão não mudam.')}</p>` : ''}
    ${pend.length && opera() ? `<div class="alerta info">${pend.length} pagamento(s) aguardando número de NF. ${botao('numerar', 'Numerar NFs agora', {}, 'pequeno')}</div>` : ''}
    ${lista.length ? `<div class="acoes barra-nf">${impressao} <a class="botao secundario" href="#/faturas">Ver NFs</a></div>
      <div class="acoes barra-nf">${link('#/inadimplencia', 'Inadimplência')} <span class="suave">Ordenar por:</span> ${[['vencimento', 'Data de vencimento'], ['imovel', 'Nome do imóvel'], ['inquilino', 'Nome do inquilino'], ['valor', 'Valor (maior para menor)']]
    .map(([k, t]) => link(`#/cobrancas?comp=${comp}&ordem=${k}`, t, (ORDENS_BOLETO[ordem] ? ordem : 'vencimento') === k ? 'botao pequeno' : 'botao secundario pequeno')).join(' ')}</div>` : ''}
    <div class="cartao rolagem"><table class="cobrancas">
      <tr><th><input type="checkbox" data-marcar-todas="boleto" title="Selecionar todos"></th><th>Imóvel / inquilino</th><th>Vencimento</th><th class="n">Pontual</th><th class="n">Após vencimento</th><th>Pagamento</th><th>Multa e juros</th><th class="n">Valor NF</th><th>NF</th></tr>
      ${lista.map(({ cb, c, i, t, fs }) => `<tr class="${R.geraNf(c) ? '' : 'linha-controle'}">
        <td><input type="checkbox" data-boleto="${cb.id}" title="Selecionar para imprimir o demonstrativo"></td>
        <td><a href="#/cobranca/${cb.id}"><b>${esc(i.nome)}</b></a><br>${esc(c.inquilino_nome)}${R.geraNf(c) ? '' : `<br>${seloControle()}`}
          ${cb.dias_cobrados < cb.dias_mes ? `<br>${etiqueta(`proporcional ${cb.dias_cobrados}/${cb.dias_mes} dias`, 'info')}` : ''}
          ${cb.reserva_utilizada > 0 ? `<br>${etiqueta(`usa reserva ${reais(cb.reserva_utilizada)}`, 'aviso')}` : ''}
          ${cb.carencia ? `<br>${etiqueta('carência', 'aviso')}` : ''}
          ${reajustes.has(c.id) ? `<br>${etiqueta(`reajuste no aluguel de ${compBr(proxima)}`, 'aviso')} ${link(`#/imprimir/carta?contrato=${c.id}&comp=${proxima}`, reajustes.get(c.id).carta ? 'Carta (enviada ✓)' : 'Gerar carta', 'botao pequeno')}` : ''}</td>
        <td>${dataBr(cb.vencimento)}${!cb.data_pagamento && cb.vencimento < hoje ? `<br>${etiqueta('vencida', 'perigo')}` : ''}
          ${!cb.data_pagamento ? `<br>${botao('copiar', 'Copiar texto do boleto', { texto: R.dadosBoleto(d(), cb).descricao })}` : ''}</td>
        <td class="n">${reais(t.a_pagar_pontual)}</td>
        <td class="n suave">${reais(t.a_pagar_sem_desconto)}<br>+ multa ${pct(cb.multa_percentual)}<br>+ juros ${pct(cb.juros_mensal_percentual)} a.m.</td>
        <td>${cb.data_pagamento ? `${situacao(cb.situacao)}${cb.pagou_em_dia ? ` ${etiqueta('pagou em dia', 'ok')}` : ''}<br><span class="suave">entrou em ${dataBr(cb.data_pagamento)}${cb.dias_atraso ? ` (${cb.dias_atraso} dias de atraso)` : ''}<br>recebido ${reais(cb.valor_pago)}</span>${opera() && !fs.length ? `<br>${botao('estornar', 'Desfazer', { id: cb.id }, 'secundario pequeno', 'Desfazer este pagamento?')}` : ''}`
          : cb.situacao === 'Carência' ? situacao('Carência') : (opera() ? formPagamento(cb, true) : situacao(cb.situacao))}</td>
        <td>${multaJurosTexto(cb)}</td>
        <td class="n">${cb.valor_nf !== null ? reais(cb.valor_nf) : '-'}</td>
        <td>${fs.length ? link(`#/imprimir/faturas?numero=${fs[0].numero}`, `Nº ${R.numeroFatura(fs[0].numero)}`) : !R.geraNf(c) ? etiqueta('sem NF', 'controle') : (cb.data_pagamento ? '<span class="suave">aguardando nº</span>' : '-')}</td></tr>`).join('')
      || `<tr><td colspan="9" class="suave">Nenhum boleto gerado para ${compBr(comp)}.</td></tr>`}
      ${lista.length ? `<tr class="total"><td></td><td colspan="2">Total${controle ? ` <span class="suave">(sem ${controle} boleto(s) de controle)</span>` : ''}</td><td class="n">${reais(soma((x) => x.t.a_pagar_pontual))}</td><td></td><td></td><td></td><td class="n">${reais(soma((x) => x.cb.valor_nf || 0))}</td><td></td></tr>` : ''}
    </table></div>
    ${lista.length ? `<div class="acoes">${impressao}</div>` : ''}`;
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
      ${cb.carencia ? linha('Aluguel: carência (não cobrado neste mês)', reais(0)) : linha(`Aluguel${cb.dias_cobrados < cb.dias_mes ? ` proporcional: ${cb.dias_cobrados} de ${cb.dias_mes} dias de ${reais(cb.aluguel_mensal)}` : ''}`, reais(cb.aluguel))}
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
    ${cb.data_pagamento ? `<p><b>Pago em ${dataBr(cb.data_pagamento)}</b>${cb.pagou_em_dia ? ' (pagou em dia; compensado depois)' : ''}${cb.dias_atraso ? ` com ${cb.dias_atraso} dia(s) de atraso${cb.data_pagou ? ` (pagou em ${dataBr(cb.data_pagou)})` : ''}: multa ${pct(cb.multa_percentual)} = ${reais(cb.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(cb.juros)}` : ''} · recebido ${reais(cb.valor_pago)}</p>` : ''}
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
      ${opera() && !cb.data_pagamento ? `${link(`#/editar/cobrancas/${cb.id}`, 'Alterar valores', 'botao secundario')} ${botao('excluir', 'Excluir', { tabela: 'cobrancas', id: cb.id }, 'perigo', 'Excluir este boleto?')}` : ''}</div></div>
    ${cb.editado_manual && !cb.data_pagamento ? `<div class="alerta info">Valores alterados à mão: este boleto não é recalculado sozinho quando o cadastro muda. ${opera() ? botao('recalcularBoleto', 'Voltar a calcular pelo cadastro', { id: cb.id }, 'secundario pequeno', 'Recalcular este boleto pelo cadastro? Os valores digitados à mão serão substituídos (o ajuste do mês fica).') : ''}</div>` : ''}</div>
    ${R.geraNf(c) ? '' : `<div class="alerta controle nao-imprimir"><b>Boleto de controle.</b> Este inquilino ${AVISO_CONTROLE}</div>`}
    ${demonstrativo(cb)}
    <div class="nao-imprimir">${caixaAjuste(cb)}${caixaBoleto(cb)}<div class="cartao"><h2>Pagamento</h2>
      ${cb.data_pagamento ? `<div class="grade">${item('Pago em', dataBr(cb.data_pagamento))}${item('Situação', `${esc(cb.situacao)}${cb.dias_atraso ? ` (${cb.dias_atraso} dias)` : ''}`)}
        ${item(`Multa (${pct(cb.multa_percentual)})`, reais(cb.multa))}${item(`Juros (${pct(cb.juros_mensal_percentual)} ao mês)`, reais(cb.juros))}
        ${item('Valor recebido', reais(cb.valor_pago))}${item('Valor da nota fiscal', `<span class="maior">${reais(cb.valor_nf)}</span>`)}</div>
        <p class="suave">Nota fiscal = ${cb.dias_atraso ? `aluguel ${reais(cb.aluguel)} + multa ${reais(cb.multa)} + juros ${reais(cb.juros)} (pagou atrasado, sem desconto). ` : `aluguel ${reais(cb.aluguel)} - desconto ${reais(cb.desconto)} (pagou em dia)`}. IPTU, seguro, tarifa e ajuste do mês não entram.</p>
        ${opera() ? botao('estornar', 'Desfazer pagamento', { id: cb.id }, 'perigo pequeno', validas.length ? 'Desfazer o pagamento? A NF será cancelada e o número não será reaproveitado.' : 'Desfazer o pagamento?') : ''}`
      : `<p>Se for pago hoje (${dataBr(C.hojeIso())}): <b>${reais(sim.valor_devido)}</b>${sim.pontual ? '' : ` (${sim.dias_atraso} dias de atraso: multa ${pct(cb.multa_percentual)} = ${reais(sim.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(sim.juros)})`} · nota fiscal ${reais(sim.valor_nf)}</p>
        ${opera() && cb.situacao !== 'Carência' ? formPagamento(cb, false) : ''}`}</div>
    <div class="cartao"><h2>NFs</h2><table><tr><th>Nº</th><th>Empresa</th><th>Emissão</th><th>Período</th><th class="n">%</th><th class="n">Valor</th><th>Situação</th></tr>
      ${fs.map((f) => `<tr><td>${R.numeroFatura(f.numero)}</td><td>${esc(buscar('emitentes', f.emitente_id).nome)}</td><td>${dataBr(f.emissao)}</td><td>${dataBr(f.periodo_inicio)} a ${dataBr(f.periodo_fim)}</td><td class="n">${pct(f.percentual)}</td><td class="n">${reais(f.valor)}</td><td>${etiqueta(f.situacao, f.situacao === 'Emitida' ? 'ok' : 'perigo')}</td></tr>`).join('')
      || `<tr><td colspan="7" class="suave">${!R.geraNf(c) ? 'Este inquilino não emite NF (só controle do pagamento).' : cb.data_pagamento ? 'Aguardando numeração (tela NF).' : 'Confirme o pagamento para gerar a NF.'}</td></tr>`}</table>
      ${cb.data_pagamento && !validas.length && R.geraNf(c) && opera() ? `<p>${formNfExterna('cobranca', cb.id, cb.data_pagamento)}</p>` : ''}
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
  return 'Airbnb';
}

function agruparPorNumero(faturas) {
  const grupos = new Map();
  for (const f of faturas) {
    if (!grupos.has(f.numero)) grupos.set(f.numero, []);
    grupos.get(f.numero).push(f);
  }
  return [...grupos.entries()].sort((a, b) => a[0] - b[0]);
}

/** Nome curto da empresa no PDF (ex.: ANK). */
/** "Já emitida fora do sistema": número e data de emissão de uma NF feita antes/fora da plataforma. */
const formNfExterna = (tipo, id, data) => `<details class="nf-externa"><summary class="link-botao">Já emitida</summary>
  <form data-form="nfExterna" data-tipo="${tipo}" data-id="${id}" class="acoes"><input type="number" name="numero" min="1" placeholder="nº da NF" style="width:110px">
  <input type="date" name="emissao" value="${data}" title="Data de emissão da NF" style="width:150px"><button class="pequeno">Registrar</button></form></details>`;

const siglaEmpresa = (e) => (e.aba_modelo || e.nome.split(/\s+/)[0]).toLocaleUpperCase('pt-BR');

function telaFaturas(mes) {
  const pend = R.pendentesDeFatura(d());
  const ultima = R.ultimaFatura(d());
  const doMes = d().faturas.filter((f) => f.emissao.slice(0, 7) === mes);
  const grupos = agruparPorNumero(doMes);
  const emitidas = grupos.filter(([, fs]) => fs[0].situacao === 'Emitida');
  return `<div class="cabecalho"><h1>NFs emitidas em ${compBr(mes)}</h1>
      <div class="acoes"><a class="botao secundario" href="#/faturas?mes=${C.somarMeses(mes, -1)}">← ${compBr(C.somarMeses(mes, -1))}</a>
      <form data-form="irMesFatura" class="acoes"><input type="month" name="mes" value="${mes}" style="width:160px"><button class="secundario">Ir</button></form>
      <a class="botao secundario" href="#/faturas?mes=${C.somarMeses(mes, 1)}">${compBr(C.somarMeses(mes, 1))} →</a></div></div>
    <div class="cartao"><h2>Pagamentos aguardando número</h2>
      <p class="suave">Última NF: ${ultima ? `<b>Nº ${R.numeroFatura(ultima.numero)}</b> de ${dataBr(ultima.emissao)}` : 'nenhuma ainda'} · próximo número: <b>${R.numeroFatura(d().proxima_fatura)}</b>. A numeração segue a data contábil (em que o dinheiro entrou), e a data de emissão é essa data. Inquilinos marcados "sem NF" não entram.</p>
      ${pend.length ? `<table><tr><th>Ordem</th><th>Pagamento em</th><th>Origem</th><th>Observações na NF</th><th class="n">Valor da NF</th><th></th></tr>
        ${pend.map((p, n) => { const b = R.baseDaFatura(d(), p.tipo, p.registro); return `<tr class="${ultima && p.data < ultima.emissao ? 'fora' : ''}"><td>${R.numeroFatura(d().proxima_fatura + n)}</td><td>${dataBr(p.data)}${ultima && p.data < ultima.emissao ? ` ${etiqueta('anterior à última NF', 'perigo')}` : ''}</td><td>${esc(b.descricao)}</td>
          <td class="suave">${esc(b.observacoes || '')}</td><td class="n">${reais(b.valor)}</td>
          <td class="n">${opera() ? `${link(p.tipo === 'cobranca' ? `#/editar/cobrancas/${p.registro.id}?nf=1` : `#/editar/avulsas/${p.registro.id}`, 'Corrigir')}
            ${formNfExterna(p.tipo, p.registro.id, p.data)}` : ''}</td></tr>`; }).join('')}</table>
        <p class="suave">Algum pagamento já teve a NF emitida fora do sistema? Use "Já emitida" na linha: informe o número e a data, e ele sai da fila sem gastar número novo.</p>
        ${opera() ? `<p>${botao('numerar', 'Numerar estas NFs', {}, '')}</p>` : ''}`
      : '<p class="suave">Nenhum pagamento aguardando número.</p>'}</div>
    ${caixaAvulsas()}
    <div class="cartao rolagem">
      ${emitidas.length ? `<div class="acoes barra-nf"><label class="check-mini"><input type="checkbox" data-marcar-todas> selecionar todas</label>
        ${botao('imprimirSelecionadas', 'Imprimir selecionadas')} ${botao('pdfSelecionadas', 'PDF das selecionadas (uma por empresa)')} ${botao('excelSelecionadas', 'Excel das selecionadas')}</div>` : ''}
      <table><tr><th></th><th>Nº</th><th>Emissão</th><th>Cliente</th><th>Origem</th><th>Empresas</th><th class="n">Total</th><th>Situação</th><th></th></tr>
      ${grupos.map(([n, fs]) => { const ok = fs[0].situacao === 'Emitida'; return `<tr class="${ok ? '' : 'cancelada'}"><td>${ok ? `<input type="checkbox" data-nf="${n}">` : ''}</td><td><b>${R.numeroFatura(n)}</b>${fs[0].externa ? `<br>${etiqueta('fora do sistema', 'neutra')}` : ''}</td><td>${dataBr(fs[0].emissao)}</td><td>${esc(fs[0].tomador_nome)}</td><td>${origemTexto(fs[0])}</td>
        <td>${fs.map((f) => `${esc(buscar('emitentes', f.emitente_id).nome)}: ${reais(f.valor)}${ok ? ` ${botao('pdf', `PDF ${esc(siglaEmpresa(buscar('emitentes', f.emitente_id)))}`, { id: f.id }, 'link-botao')}` : ''}`).join('<br>')}</td><td class="n">${reais(fs.reduce((s, f) => s + f.valor, 0))}</td>
        <td>${etiqueta(fs[0].situacao, ok ? 'ok' : 'perigo')}</td>
        <td class="n nw">${ok ? `${link(`#/imprimir/faturas?numero=${n}`, 'Ver')} ${botao('excel', 'Excel', { numero: n })}${opera() ? ` ${botao('cancelarNumero', 'Cancelar', { numero: n }, 'perigo pequeno', `Cancelar a NF nº ${R.numeroFatura(n)}? O pagamento volta para a fila e recebe um número novo. O número ${R.numeroFatura(n)} não será reaproveitado.`)}` : ''}`
          : (podeUsuario('admin') ? botao('apagarCanceladas', 'Apagar', { numero: n }, 'perigo pequeno', `Apagar a NF cancelada nº ${R.numeroFatura(n)} da lista? Fica só o registro no Histórico.`) : '')}</td></tr>`; }).join('')
      || `<tr><td colspan="9" class="suave">Nenhuma NF emitida em ${compBr(mes)}.</td></tr>`}</table></div>
    ${emitidas.length ? `<div class="acoes"><a class="botao" target="_blank" href="#/imprimir/faturas?mes=${mes}">Imprimir todas as NFs de ${compBr(mes)}</a> ${botao('pdfMes', 'Baixar todas em PDF (ZIP)', { mes })} ${botao('excelMes', 'Baixar todas em Excel (ZIP)', { mes })}</div>` : ''}
    ${opera() && ultima ? caixaRenumerar() : ''}`;
}

/** Voltar a última numeração (ciclo) para corrigir, incluir um pagamento esquecido e numerar de novo. */
function caixaRenumerar() {
  const ciclo = R.ultimoCicloDeNumeracao(d());
  return `<div class="cartao"><h2>Corrigir e numerar de novo</h2>
    <p class="suave">Emitiu NFs com algo errado, ou passou despercebido um pagamento de data intermediária? Volte a última numeração: as NFs daquele ciclo saem da lista, os pagamentos voltam para a fila acima com o que já foi preenchido, você corrige (botão "Corrigir"), inclui o que faltou e clica de novo em "Numerar estas NFs". Os números são reaproveitados, na ordem das datas. Dá para repetir e voltar ciclos anteriores.</p>
    ${ciclo ? `<p>${botao('desfazerUltimaNumeracao', `Voltar a última numeração: nº ${R.numeroFatura(ciclo.de)}${ciclo.ate !== ciclo.de ? ` a ${R.numeroFatura(ciclo.ate)}` : ''} (${ciclo.qtd} NF${ciclo.qtd > 1 ? 's' : ''}, pagamentos de ${dataBr(ciclo.emissoes[0])}${ciclo.emissoes[1] !== ciclo.emissoes[0] ? ` a ${dataBr(ciclo.emissoes[1])}` : ''})`, {}, 'perigo',
      `Voltar a numeração nº ${R.numeroFatura(ciclo.de)} a ${R.numeroFatura(ciclo.ate)}? Essas NFs saem da lista (ficam no Histórico), os pagamentos voltam para a fila e o próximo número volta a ser ${R.numeroFatura(ciclo.de)}.`)}</p>` : '<p class="suave">As NFs atuais foram numeradas antes desta função existir: use a opção abaixo.</p>'}
    <details><summary class="suave">Outra opção: desfazer a partir de um número</summary>
      <form data-form="desfazerNumeracao" class="acoes" style="margin-top:8px"><label for="desfazer_n" style="margin:0">A partir do nº</label><input id="desfazer_n" type="number" name="numero" min="1" value="${ciclo ? ciclo.de : (R.ultimaFatura(d()) || {}).numero || 1}" style="width:120px"><button class="perigo secundario">Desfazer a partir deste número</button></form></details></div>`;
}

function caixaAvulsas() {
  const pend = d().avulsas.filter((a) => !R.faturasDe(d(), 'avulsa', a.id).length);
  return `<div class="cartao"><div class="cabecalho"><h2>NFs avulsas</h2>${opera() ? `<div class="acoes">${link('#/novo/avulsas?modelo=airbnb', 'Nova NF avulsa do Airbnb', 'botao')} ${link('#/novo/avulsas', 'Nova NF avulsa', 'botao secundario')}</div>` : ''}</div>
    <p class="suave">Para recebimentos fora do boleto, como o faturamento do Airbnb (lançamento esporádico com a data em que o dinheiro entrou) ou uma nota com cliente e imóvel que você escolher. Entram na mesma sequência de números dos boletos pagos, pela data do pagamento. Sem imóvel, o valor é dividido igualmente entre as empresas ativas.</p>
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
  const nome = ({ c }) => `<a href="#/contrato/${c.id}"><b>${esc(c.inquilino_nome)}</b></a>${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}${R.geraNf(c) ? '' : ` ${etiqueta('boleto de controle', 'controle')}`}${anterior(c) ? `<br><span class="suave">continua ${esc(anterior(c).inquilino_nome)}</span>` : ''}`;
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
  const imoveis = ordenar(d().imoveis, 'nome');
  const doAno = (i, a) => d().iptus.find((p) => p.imovel_id === i.id && p.ano === a);
  const resumo = (p) => (p ? `${reais(p.valor_total)} · ${p.pago_avista ? 'à vista' : `${p.num_parcelas}x${p.valor_parcela ? ` de ${reais(p.valor_parcela)}` : ''}`}` : '<span class="suave">-</span>');
  const proprietario = (p) => {
    if (!p) return '-';
    const ps = R.parcelasIptu(d(), p).filter((x) => x.proprietario);
    if (!ps.length) return '<span class="suave">inquilino paga todas</span>';
    const abertas = ps.filter((x) => !x.paga);
    return `${ps.length} parcela(s) ${abertas.length ? etiqueta(`${abertas.length} em aberto: ${reais(abertas.reduce((s, x) => s + x.valor, 0))}`, 'perigo') : etiqueta('todas pagas', 'ok')}`;
  };
  const linhas = imoveis.map((i) => {
    const p = doAno(i, ano);
    const ant = doAno(i, ano - 1);
    const varia = p && ant && ant.valor_total ? ((p.valor_total / ant.valor_total - 1) * 100).toFixed(2).replace('.', ',') : null;
    const acao = !opera() ? '' : p ? link(`#/editar/iptus/${p.id}?de=iptu`, 'Editar') : link(`#/novo/iptus?imovel=${i.id}&ano=${ano}&de=iptu`, `Lançar ${ano}`, 'botao pequeno');
    return `<tr class="${p ? '' : 'amarelo'}"><td><a href="#/imovel/${i.id}?ir=iptu">${esc(i.nome)}</a></td><td class="n">${resumo(ant)}</td><td class="n"><b>${resumo(p)}</b></td>
      <td class="n">${varia !== null ? `${varia}%` : '-'}</td><td>${p ? `${p.vencimento_primeira ? dataBr(p.vencimento_primeira) : '-'}<br><span class="suave">boletos a partir de ${compBr(p.primeiro_vencimento_boleto || (p.primeira_competencia && C.somarMeses(p.primeira_competencia, 1)))}</span>` : '-'}</td><td>${proprietario(p)}</td><td class="n">${acao}</td></tr>`;
  }).join('');
  const faltam = imoveis.filter((i) => !doAno(i, ano)).length;
  const alertas = R.alertasIptu(d()).filter((a) => a.texto.includes(`IPTU ${ano}`));
  return `<div class="cabecalho"><h1>IPTU ${ano}</h1><div class="acoes">${link(`#/iptu?ano=${ano - 1}`, `← ${ano - 1}`, 'botao secundario')} ${link(`#/iptu?ano=${ano + 1}`, `${ano + 1} →`, 'botao secundario')}</div></div>
    ${faltam ? `<div class="alerta aviso">${faltam} imóvel(is) ainda sem o IPTU de ${ano} (em amarelo).</div>` : `<div class="alerta info">Todos os imóveis com IPTU de ${ano} lançado.</div>`}
    ${alertas.map((a) => `<div class="alerta ${a.nivel}"><b>${esc(a.imovel)}</b> ${esc(a.texto)} <a href="#/imovel/${a.imovel_id}?ir=iptu">marcar como paga</a></div>`).join('')}
    <div class="cartao rolagem"><table><tr><th>Imóvel</th><th class="n">${ano - 1}</th><th class="n">${ano}</th><th class="n">Variação</th><th>1ª parcela: prefeitura / inquilino</th><th>Por conta do proprietário</th><th></th></tr>${linhas}</table>
    <p class="suave">As parcelas entram sozinhas nos boletos dos inquilinos que pagam IPTU, a partir do boleto que vence no mês informado, uma por mês, com o valor parcelado (mesmo quando o proprietário paga à vista com desconto). Se a prefeitura atrasar o carnê, é só editar o vencimento e o primeiro mês de cobrança. Nos meses em que o imóvel está vazio (ou o IPTU não é cobrado), a parcela fica por conta do proprietário: o controle e os alertas estão na página de cada imóvel.</p></div>`;
}

/**
 * Calendário do mês no Painel: grade com os dias; em cada dia, os vencimentos e alertas (cor da situação).
 * Clicar no dia abre logo abaixo a agenda completa daquele dia.
 */
function calendarioDoPainel(mes, hoje) {
  const eventos = R.eventosDoMes(d(), mes, hoje);
  const porDia = new Map();
  for (const e of eventos) { if (!porDia.has(e.data)) porDia.set(e.data, []); porDia.get(e.data).push(e); }
  const destino = (e) => (e.cobranca_id ? `#/cobranca/${e.cobranca_id}` : e.tipo === 'Boleto' ? `#/cobrancas?comp=${C.somarMeses(e.data.slice(0, 7), -1)}`
    : e.tipo === 'IPTU' ? `#/imovel/${e.imovel_id}?ir=iptu` : e.tipo === 'Seguro' ? `#/imovel/${e.imovel_id}?ir=seguros` : `#/contrato/${e.contrato_id}`);
  const curto = (e) => `${e.tipo} ${e.texto.split(' · ')[0]}`;
  const [ini] = C.limitesCompetencia(mes);
  const vazios = C.paraData(ini).getUTCDay();
  const celulas = [...Array(vazios)].map(() => '<div class="cal-dia vazio"></div>');
  for (let n = 1; n <= C.diasNoMes(mes); n += 1) {
    const dia = `${mes}-${String(n).padStart(2, '0')}`;
    const evs = porDia.get(dia) || [];
    celulas.push(`<div class="cal-dia ${dia === hoje ? 'hoje' : ''} ${evs.length ? 'com-eventos' : ''}" ${evs.length ? `data-acao="abrirDia" data-dia="${dia}" title="Ver a agenda do dia"` : ''}>
      <div class="cal-num">${n}</div>
      ${evs.slice(0, 3).map((e) => `<div class="cal-ev ${e.situacao}">${esc(curto(e))}</div>`).join('')}
      ${evs.length > 3 ? `<div class="cal-mais">+${evs.length - 3}</div>` : ''}</div>`);
  }
  const semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const agendas = [...porDia].map(([dia, evs]) => `<div class="agenda-dia" data-agenda="${dia}" ${dia === hoje ? '' : 'hidden'}>
      <h3>${dataBr(dia)} · ${semana[C.paraData(dia).getUTCDay()]}${dia === hoje ? ' · hoje' : ''}</h3>
      ${evs.map((e) => `<div class="evento-cal">${etiqueta(e.tipo, 'info')} <a href="${destino(e)}">${esc(e.texto)}</a> ${etiqueta(e.estado, e.situacao)}</div>`).join('')}</div>`).join('');
  return `<div class="cartao" id="calendario"><div class="cabecalho"><h2>Calendário de ${compBr(mes)}</h2>
      <div class="acoes">${link(`#/?mes=${C.somarMeses(mes, -1)}`, `← ${compBr(C.somarMeses(mes, -1))}`)} ${link('#/', 'Mês atual')} ${link(`#/?mes=${C.somarMeses(mes, 1)}`, `${compBr(C.somarMeses(mes, 1))} →`)}</div></div>
    <div class="cal-grade">${semana.map((s) => `<div class="cal-sem">${s}</div>`).join('')}${celulas.join('')}</div>
    ${agendas || ''}
    <p class="suave">Clique num dia para ver a agenda completa. Cores: vermelho vencido, amarelo a fazer, verde feito, cinza previsto ou no boleto do inquilino. Boletos: gerados e previstos pelos contratos; IPTU: pelo vencimento da guia.</p></div>`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dataExtenso = (iso) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;

/** Botões do reajuste de um contrato numa competência (gerar carta, marcar enviada, aplicar correção). */
function botoesReajuste(c, r, naCarta = false) {
  if (r.corrigido) return etiqueta(`corrigido: ${reais(r.corrigido.valor_novo)}`, 'ok');
  return `${naCarta ? '' : link(`#/imprimir/carta?contrato=${c.id}&comp=${r.competencia}`, 'Gerar carta', 'botao pequeno')}
    ${opera() ? botao('cartaEnviada', r.carta ? `carta enviada em ${dataBr(r.carta.enviada_em)} ✓` : 'Marcar carta enviada', { contrato: c.id, comp: r.competencia, enviada: r.carta ? '' : '1' }, r.carta ? 'link-botao' : 'secundario pequeno', r.carta ? 'Desfazer o envio da carta?' : '') : ''}
    ${opera() ? botao('aplicarReajuste', 'Aplicar correção', { contrato: c.id, comp: r.competencia }, 'secundario pequeno', `Registrar a correção do aluguel de ${compBr(r.competencia)} no contrato? Os boletos em aberto são recalculados.`) : ''}`;
}

/** Reajustes: índices acumulados informados por vocês e os contratos que corrigem nos próximos meses. */
function telaReajustes(q) {
  const atual = C.competenciaDe(C.hojeIso());
  const de = q.de || C.somarMeses(atual, -2);
  const ate = q.ate || C.somarMeses(atual, 3);
  const lista = R.reajustesEntre(d(), de, ate);
  const indices = [...d().indices_acumulados].sort((a, b) => b.mes_ref.localeCompare(a.mes_ref) || a.indice.localeCompare(b.indice)).slice(0, 36);
  const nomesIndices = [...new Set(R.lista(d(), 'indices').flatMap((n) => n.replace(/\(.*\)/, '').split('/').map((x) => x.trim())).filter(Boolean))];
  return `<h1>Reajustes do aluguel</h1>
    <p class="suave">O aluguel é corrigido no 13º mês cheio do contrato (se começou no meio do mês, o primeiro mês não conta) e a cada 12 meses depois. A carta vai junto com o boleto do mês anterior ao corrigido.</p>
    <div class="cartao"><h2>Índices acumulados em 12 meses</h2>
      <p class="suave">Informe o acumulado de 12 meses de cada índice, com o mês até onde ele vai. O reajuste de um aluguel usa o mais recente até o mês anterior ao corrigido.</p>
      ${opera() ? `<form data-form="indiceAcumulado" class="acoes"><select name="indice" style="width:auto">${nomesIndices.map((n) => `<option>${esc(n)}</option>`).join('')}</select>
        <input type="month" name="mes_ref" value="${atual}" style="width:170px" title="Mês até onde vai o acumulado"><input name="percentual" placeholder="% acumulado" inputmode="decimal" style="width:130px"><button class="pequeno">Incluir</button></form>` : ''}
      <table style="margin-top:8px"><tr><th>Índice</th><th>Acumulado até</th><th class="n">12 meses</th><th></th></tr>
      ${indices.map((x) => `<tr><td>${esc(x.indice)}</td><td>${compBr(x.mes_ref)}</td><td class="n">${pct(x.percentual)}</td><td class="n">${opera() ? botao('excluir', 'Excluir', { tabela: 'indices_acumulados', id: x.id }, 'perigo pequeno', 'Excluir este índice?') : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="suave">Nenhum índice informado.</td></tr>'}</table></div>
    <div class="cartao rolagem"><div class="cabecalho"><h2>Reajustes de ${compBr(de)} a ${compBr(ate)}</h2>
      <div class="acoes">${link(`#/reajustes?de=${C.somarMeses(de, -3)}&ate=${C.somarMeses(ate, -3)}`, '← anteriores')} ${link(`#/reajustes?de=${C.somarMeses(de, 3)}&ate=${C.somarMeses(ate, 3)}`, 'seguintes →')}</div></div>
      <table><tr><th>Aluguel de</th><th>Imóvel / inquilino</th><th>Índice</th><th class="n">Atual</th><th class="n">Novo</th><th>Carta e correção</th></tr>
      ${lista.map((r) => { const k = r.calculo; const i = buscar('imoveis', r.contrato.imovel_id); return `<tr><td><b>${compBr(r.competencia)}</b><br><span class="suave">carta com o boleto de ${compBr(C.somarMeses(r.competencia, -1))}</span></td>
        <td><a href="#/contrato/${r.contrato.id}"><b>${esc(i ? i.nome : '')}</b></a><br>${esc(r.contrato.inquilino_nome)} · ${r.anos} ano(s)</td>
        <td>${esc(k.indiceContrato || 'não informado')}${k.escolhido ? `<br><span class="suave">usa ${esc(k.escolhido.indice)} ${pct(k.percentual)}</span>` : k.faltando.length ? `<br>${etiqueta(`falta ${k.faltando.join(' e ')}`, 'perigo')}` : ''}</td>
        <td class="n">${reais(k.atual)}${k.bonificacao ? `<br><span class="suave">${reais(k.atualBonificado)}</span>` : ''}</td>
        <td class="n">${k.novo !== null ? `<b>${reais(k.novo)}</b>${k.bonificacao ? `<br><span class="suave">${reais(k.novoBonificado)}</span>` : ''}` : '-'}</td>
        <td class="nw">${botoesReajuste(r.contrato, r)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="suave">Nenhum reajuste no período.</td></tr>'}</table>
      <p class="suave">Valores: cheio e, embaixo, com bonificação.</p></div>`;
}

/** Carta de reajuste com a logo: felicitações por mais um ano e os novos valores. */
function cartaReajuste(c, comp) {
  const i = buscar('imoveis', c.imovel_id);
  const r = R.reajusteNaCompetencia(d(), c, comp);
  const k = R.calcularReajuste(d(), c, comp);
  const parte = i && R.participacoesDo(d(), i.id)[0];
  const empresa = (parte && buscar('emitentes', parte.emitente_id)) || d().emitentes.find((e) => e.ativo) || { nome: '' };
  const anterior = C.somarMeses(comp, -1);
  const vencNovo = C.vencimentoDaCompetencia(comp, c.dia_vencimento || 10, c.cobranca_mes_seguinte !== false);
  if (k.percentual === null) {
    return `<div class="alerta perigo nao-imprimir">Falta informar o índice acumulado de ${esc(k.faltando.join(' e ') || 'o índice do contrato')} até ${compBr(anterior)}. ${link('#/reajustes', 'Informar em Reajustes')}</div>`;
  }
  const varios = k.usados.length > 1;
  return `<div class="carta">
    ${d().logo ? `<p><img class="carta-logo" src="${esc(d().logo)}" alt="Logo"></p>` : ''}
    <p class="carta-data">${esc((i && i.cidade) || 'Curitiba')}, ${dataExtenso(C.hojeIso())}.</p>
    <p>Prezado(a) <b>${esc(c.inquilino_nome)}</b>,<br>Imóvel: <b>${esc(i ? `${i.nome} - ${R.enderecoCompleto(i)}` : '')}</b></p>
    <p>Com o aluguel de <b>${MESES[Number(comp.slice(5, 7)) - 1]} de ${comp.slice(0, 4)}</b> completamos <b>${r ? r.anos : ''} ano${r && r.anos > 1 ? 's' : ''}</b> de parceria. Agradecemos a confiança e a pontualidade, e é uma satisfação ter você conosco.</p>
    <p>Conforme a cláusula de reajuste anual do contrato, o aluguel será corrigido pelo <b>${esc(k.indiceContrato)}</b> acumulado nos últimos 12 meses${varios ? `: ${k.usados.map((u) => `<b>${esc(u.indice)} ${pct(u.registro.percentual)}</b>`).join(' e ')}. Aplicaremos <b>${pct(k.percentual)}</b>` : ` (até ${compBr(k.escolhido.registro.mes_ref)}): <b>${pct(k.percentual)}</b>`}.</p>
    <table class="carta-tabela"><tr><th></th><th class="n">Atual</th><th class="n">A partir do aluguel de ${compBr(comp)}</th></tr>
      <tr><td>Aluguel</td><td class="n">${reais(k.atual)}</td><td class="n"><b>${reais(k.novo)}</b></td></tr>
      ${k.bonificacao ? `<tr><td>Aluguel com bonificação (pagamento em dia)</td><td class="n">${reais(k.atualBonificado)}</td><td class="n"><b>${reais(k.novoBonificado)}</b></td></tr>` : ''}</table>
    <p>O novo valor será cobrado a partir do boleto do aluguel de <b>${compBr(comp)}</b>, com vencimento em <b>${dataBr(vencNovo)}</b>. As demais condições do contrato permanecem as mesmas.</p>
    <p>Ficamos à disposição para qualquer dúvida.</p>
    <p>Atenciosamente,<br><b>${esc(empresa.nome)}</b></p></div>`;
}

/** Inadimplência: quem está devendo, há quantos dias, quanto hoje; e quem costuma atrasar. */
function telaInadimplencia() {
  const hoje = C.hojeIso();
  const r = R.inadimplencia(d(), hoje);
  const imovelDe = (c) => (buscar('imoveis', c.imovel_id) || {}).nome || '';
  return `<div class="cabecalho"><h1>Inadimplência</h1>${link('#/cobrancas', 'Ver boletos')}</div>
    <div class="numeros">
      <div class="cartao"><div class="grande">${r.devedores.length}</div>inquilino(s) em atraso</div>
      <div class="cartao"><div class="grande">${r.devedores.reduce((s, x) => s + x.boletos.length, 0)}</div>boleto(s) vencido(s)</div>
      <div class="cartao"><div class="grande">${reais(r.total)}</div>em aberto (valor do boleto)</div>
      <div class="cartao"><div class="grande">${reais(r.totalHoje)}</div>hoje, com multa e juros</div></div>
    <div class="cartao rolagem"><h2>Em atraso agora</h2><table><tr><th>Imóvel / inquilino</th><th>Boletos vencidos</th><th class="n">Dias (mais antigo)</th><th class="n">Em aberto</th><th class="n">Hoje, com multa e juros</th></tr>
      ${r.devedores.map((x) => `<tr class="${x.diasMax > R.DIAS_VERMELHO ? 'fora' : ''}"><td><a href="#/contrato/${x.contrato.id}"><b>${esc(imovelDe(x.contrato))}</b></a><br>${esc(x.contrato.inquilino_nome)}${x.contrato.inquilino_telefone ? `<br><span class="suave">${esc(x.contrato.inquilino_telefone)}</span>` : ''}${R.geraNf(x.contrato) ? '' : `<br>${etiqueta('boleto de controle', 'controle')}`}</td>
        <td>${x.boletos.map((b) => `<a href="#/cobranca/${b.cobranca.id}">${compBr(b.cobranca.competencia)}</a> <span class="suave">venceu ${dataBr(b.cobranca.vencimento)} · ${b.dias} dia(s)</span>`).join('<br>')}</td>
        <td class="n"><b>${x.diasMax}</b></td><td class="n">${reais(x.total)}</td><td class="n"><b>${reais(x.totalHoje)}</b></td></tr>`).join('')
      || '<tr><td colspan="5" class="suave">Nenhum boleto vencido em aberto. 🎉</td></tr>'}</table>
      <p class="suave">Mais de ${R.DIAS_VERMELHO} dias em vermelho. "Hoje" é o que o banco cobraria se pagasse hoje (sem desconto, com multa e juros). Quem está aqui também aparece nos Alertas do Painel.</p></div>
    <div class="cartao rolagem"><h2>Quem costuma atrasar (últimos 12 meses)</h2><table><tr><th>Imóvel / inquilino</th><th class="n">Pagos com atraso</th><th class="n">Atraso médio</th><th class="n">Maior atraso</th></tr>
      ${r.historico.map((x) => `<tr><td><a href="#/contrato/${x.contrato.id}"><b>${esc(imovelDe(x.contrato))}</b></a><br>${esc(x.contrato.inquilino_nome)}</td>
        <td class="n">${x.atrasados} de ${x.pagos}</td><td class="n">${x.mediaDias} dia(s)</td><td class="n">${x.maiorAtraso} dia(s)</td></tr>`).join('')
      || '<tr><td colspan="4" class="suave">Ninguém pagou com atraso nos últimos 12 meses.</td></tr>'}</table>
      <p class="suave">Conta os boletos pagos depois do vencimento (quem marcou "pagou em dia" não conta).</p></div>`;
}

function telaResultados(q) {
  const hoje = C.hojeIso();
  const ate = q.ate || hoje;
  const de = q.de || C.somarDias(C.somarMesesData(ate, -12), 1);
  // imóveis só com boleto de controle vão para o fim, sem posição no ranking
  const lista = R.resultadosFinanceiros(d(), de, ate).sort((a, b) => a.controle - b.controle);
  const ano = Number(hoje.slice(0, 4));
  const atalhos = [
    ['Últimos 12 meses', C.somarDias(C.somarMesesData(hoje, -12), 1), hoje],
    ['Este ano', `${ano}-01-01`, hoje],
    ['Ano passado', `${ano - 1}-01-01`, `${ano - 1}-12-31`],
    ['Últimos 5 anos', C.somarDias(C.somarAnos(hoje, -5), 1), hoje],
  ].map(([t, a, b]) => link(`#/resultados?de=${a}&ate=${b}`, t, a === de && b === ate ? 'botao pequeno' : 'botao secundario pequeno')).join(' ');
  const tot = (k) => lista.filter((x) => !x.controle).reduce((s, x) => s + x[k], 0);
  const pctTxt = (v) => (v === null ? '<span class="suave">informe o valor</span>' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`);
  const maior = Math.max(0, ...lista.map((x) => x.retornoAnual || 0));
  return `<h1>Resultados financeiros</h1>
    <form class="cartao acoes" data-form="filtroResultados"><label style="margin:0">De</label><input type="date" name="de" value="${de}" style="width:160px"><label style="margin:0">até</label><input type="date" name="ate" value="${ate}" style="width:160px"><button class="secundario">Ver</button>
      ${atalhos}</form>
    <div class="cartao rolagem"><table><tr><th>#</th><th>Imóvel</th><th class="n">Valor do imóvel + reformas</th><th class="n">Aluguel recebido</th><th class="n">NFs avulsas</th><th class="n">IPTU pago pelo proprietário</th><th class="n">Resultado</th><th class="n">Retorno ao ano</th><th>Reformas no período</th></tr>
      ${lista.map((x, n) => `<tr class="${x.controle ? 'linha-controle' : ''}"><td>${x.retornoAnual !== null && !x.controle ? n + 1 : ''}</td><td><a href="#/imovel/${x.imovel.id}"><b>${esc(x.imovel.nome)}</b></a><br><span class="suave">${x.mesesPagos} pagamento(s)</span>${x.controle ? `<br>${etiqueta('boleto de controle: não conta', 'controle')}` : ''}</td>
        <td class="n">${x.base ? reais(x.base) : '<span class="suave">-</span>'}</td><td class="n">${reais(x.aluguel)}</td><td class="n">${reais(x.avulsas)}</td><td class="n">${x.iptu ? `- ${reais(x.iptu)}` : '-'}</td>
        <td class="n"><b>${reais(x.resultado)}</b></td><td class="n"><b>${pctTxt(x.retornoAnual)}</b>${x.retornoAnual ? `<div class="barra"><span style="width:${Math.max(2, (x.retornoAnual / maior) * 100).toFixed(0)}%"></span></div>` : ''}</td>
        <td class="n">${x.reformasPeriodo ? reais(x.reformasPeriodo) : '-'}</td></tr>`).join('') || '<tr><td colspan="9" class="suave">Nenhum imóvel.</td></tr>'}
      <tr class="total"><td></td><td>Total</td><td class="n">${reais(tot('base'))}</td><td class="n">${reais(tot('aluguel'))}</td><td class="n">${reais(tot('avulsas'))}</td><td class="n">${reais(tot('iptu'))}</td><td class="n">${reais(tot('resultado'))}</td>
        <td class="n">${tot('base') ? pctTxt((tot('resultado') * 12 / (lista[0] ? lista[0].meses : 12) / tot('base')) * 100) : '-'}</td><td class="n">${reais(tot('reformasPeriodo'))}</td></tr></table>
    <p class="suave">Alimentado pelo histórico: aluguel recebido = valor da NF de cada boleto pago no período (aluguel com desconto, ou com multa e juros quando atrasou; sem IPTU, seguro e tarifa, que são repasses), mais as NFs avulsas ligadas ao imóvel. Boletos de controle (inquilino sem NF) não entram. Desconta o IPTU pago pelo proprietário (imóvel vazio). Retorno ao ano = resultado do período convertido para 12 meses ÷ (valor do imóvel + reformas até a data). Cadastre o valor em "Editar imóvel" e as reformas na página do imóvel.</p></div>`;
}

function telaImprimir(rota) {
  const tipo = rota.partes[1];
  const voltar = '<div class="acoes nao-imprimir" style="margin:12px 0"><button data-acao="imprimir">Imprimir</button><button class="secundario" data-acao="voltar">Voltar</button></div>';
  if (tipo === 'carta') {
    const c = buscar('contratos', rota.q.contrato);
    if (!c) return '<p>Inquilino não encontrado.</p>';
    const r = R.reajusteNaCompetencia(d(), c, rota.q.comp);
    return `<div class="impressao">${voltar}
      ${r && opera() ? `<div class="acoes nao-imprimir" style="margin-bottom:12px">${botoesReajuste(c, r, true)}</div>` : ''}
      ${cartaReajuste(c, rota.q.comp)}</div>`;
  }
  if (tipo === 'contrato') {
    const m = contratoMontado(rota.q);
    if (!m) return '<p>Inquilino não encontrado.</p>';
    const falta = K.pendenciasDoContrato(d(), m.c);
    return `<div class="impressao">
      <div class="acoes nao-imprimir" style="margin:12px 0"><button data-acao="imprimir">Imprimir / salvar em PDF</button>${botao('contratoWord', 'Baixar Word', {}, 'secundario')}
        <a class="botao secundario" href="#/contrato-gerar/${m.c.id}?modelo=${m.modelo.id}">Voltar</a></div>
      ${falta.length ? `<div class="alerta aviso nao-imprimir"><b>Faltam dados no cadastro:</b> ${falta.map(esc).join('; ')}.</div>` : ''}
      ${K.contratoHtml(m.blocos, { logo: d().logo, rodape: m.dados.rodape })}</div>`;
  }
  if (tipo === 'demonstrativos') {
    const ids = rota.q.ids ? new Set(rota.q.ids.split(',').map(Number)) : null;
    const nomeImovel = (cb) => ((buscar('imoveis', (buscar('contratos', cb.contrato_id) || {}).imovel_id) || {}).nome || '');
    const lista = d().cobrancas.filter((x) => x.competencia === rota.q.comp && (!ids || ids.has(x.id)))
      .sort((a, b) => nomeImovel(a).localeCompare(nomeImovel(b), 'pt-BR'));
    return `<div class="impressao">${voltar}${lista.map(demonstrativo).join('') || '<p>Nenhum boleto.</p>'}</div>`;
  }
  let fs = d().faturas.filter((f) => f.situacao === 'Emitida');
  const numeros = rota.q.numeros ? new Set(rota.q.numeros.split(',').map(Number)) : null;
  fs = numeros ? fs.filter((f) => numeros.has(f.numero)) : rota.q.numero ? fs.filter((f) => f.numero === Number(rota.q.numero)) : fs.filter((f) => f.emissao.slice(0, 7) === rota.q.mes);
  fs.sort((a, b) => a.numero - b.numero || a.id - b.id);
  return `<div class="impressao">${voltar}${rota.q.numero && fs.length ? `<p class="nao-imprimir">${botao('excel', 'Baixar este número em Excel', { numero: rota.q.numero })}</p>` : ''}
    ${fs.map((f) => faturaHtml(f, buscar('emitentes', f.emitente_id))).join('') || '<p>Nenhuma NF.</p>'}</div>`;
}

// --------------------------------------------------------------------------
// Contrato de locação gerado a partir de um modelo
// --------------------------------------------------------------------------
/** Testemunhas usadas da última vez (só neste computador). */
function testemunhasLembradas() {
  try { return JSON.parse(localStorage.getItem('testemunhas_contrato')) || {}; } catch { return {}; }
}

function contratoMontado(q) {
  const c = buscar('contratos', q.contrato);
  if (!c) return null;
  const modelos = K.modelosDe(d());
  const modelo = modelos.find((m) => m.id === Number(q.modelo)) || modelos[0];
  const testemunhas = [[q.t1, q.c1], [q.t2, q.c2]].map(([nome, cpf]) => ({ nome: nome || '', cpf: cpf || '' }));
  const dados = K.dadosDoContrato(d(), c, { data: q.data || C.hojeIso(), testemunhas });
  return { c, modelo, dados, blocos: K.montarContrato(modelo.texto, dados) };
}

function telaGerarContrato(rota) {
  const c = buscar('contratos', rota.partes[1]);
  if (!c) return '<h1>Inquilino não encontrado</h1>';
  const modelos = K.modelosDe(d());
  const naoRes = c.finalidade === 'Não residencial';
  const sugerido = Number(rota.q.modelo) || (modelos.find((m) => /n[ãa]o residencial|comercial/i.test(m.nome) === naoRes) || modelos[0]).id;
  const t = testemunhasLembradas();
  const falta = K.pendenciasDoContrato(d(), c);
  const garantia = c.garantia_tipo || 'Sem garantia';
  return `<p class="suave"><a href="#/contrato/${c.id}">← ${esc(c.inquilino_nome)}</a></p>
    <h1>Gerar contrato de locação</h1>
    ${falta.length ? `<div class="alerta aviso"><b>Faltam dados no cadastro</b> (o contrato sai com o espaço em branco): ${falta.map(esc).join('; ')}.
      ${opera() ? ` ${link(`#/editar/contratos/${c.id}`, 'Completar o cadastro')}` : ''}</div>` : '<div class="alerta ok">Cadastro completo para o contrato.</div>'}
    <form class="cartao formulario" data-form="gerarContrato">
      <input type="hidden" name="contrato" value="${c.id}">
      <div><label>Modelo</label><select name="modelo">${modelos.map((m) => `<option value="${m.id}" ${m.id === sugerido ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>
      <div><label>Data da assinatura</label><input type="date" name="data" value="${esc(rota.q.data || C.hojeIso())}"></div>
      <div><label>Testemunha 1 (opcional)</label><input name="t1" value="${esc(t.t1 || '')}"></div><div><label>CPF da testemunha 1</label><input name="c1" value="${esc(t.c1 || '')}"></div>
      <div><label>Testemunha 2 (opcional)</label><input name="t2" value="${esc(t.t2 || '')}"></div><div><label>CPF da testemunha 2</label><input name="c2" value="${esc(t.c2 || '')}"></div>
      <div class="check"><button>Ver contrato</button></div></form>
    <div class="cartao"><h2>O que entra automaticamente</h2>
      <p>Finalidade: <b>${esc(c.finalidade || 'Residencial')}</b> · Garantia: <b>${esc(garantia)}</b>${c.solidario_nome ? ' · com locatário solidário' : ''} ·
        Locadoras: <b>${esc(K.dadosDoContrato(d(), c).locadoras.map((e) => e.nome).join(' e '))}</b></p>
      <p class="suave">As partes, valores por extenso, prazo, índice, encargos, garantia e assinaturas vêm do cadastro. Na tela do contrato, use <b>Imprimir / salvar em PDF</b> ou <b>Baixar Word</b> para ajustar algum detalhe antes de assinar.
        Os textos ficam em ${link('#/modelos-contrato', 'Modelos de contrato', '')}.</p></div>`;
}

const AJUDA_MODELO = `<details class="cartao"><summary><b>Como escrever um modelo</b></summary>
  <ul>
    <li><code>{campo}</code> coloca um dado do cadastro. Campos: <code>{locadoras} {locatarios} {solidario} {fiadores} {fiadores_imoveis} {inquilino_nome} {objeto} {imovel_nome} {endereco_imovel}
      {finalidade} {atividade} {prazo_meses} {data_inicio} {data_fim} {aluguel_cheio} {aluguel_bonificado} {bonificacao_percentual} {dia_vencimento} {indice}
      {multa} {juros} {tarifa_boleto} {encargos_inquilino} {encargos_inclusos} {caucao_valor} {caucao_meses} {deposito_valor} {deposito_uso} {cidade} {data_assinatura}</code>.</li>
    <li><code>[se condição] texto [senão] outro texto [fim]</code>: o trecho só entra quando a condição vale (o [senão] é opcional; "[se não fiador]" também funciona). Condições:
      <code>fiador caucao deposito seguro_fianca sem_garantia solidario pj residencial nao_residencial bonificacao iptu_inquilino seguro_inquilino tem_incluso tarifa_boleto
      area_comum imovel_fiador varios_fiadores varias_locadoras indeterminado testemunhas</code>.</li>
    <li>Singular ou plural: <code>{l:a LOCADORA|as LOCADORAS}</code> (locadoras), <code>{f:o FIADOR|os FIADORES}</code> (fiadores), <code>{s:...|...}</code> (locatários).</li>
    <li><code>CLÁUSULA #</code> numera sozinha. <code>CLÁUSULA #multa</code> dá um nome à cláusula, e <code>{cl:multa}</code> escreve o número dela ("18ª (décima oitava)").
      <code>#i.</code> numera os itens do início.</li>
    <li>Linha começando com <code># </code>: título; <code>## </code>: seção; <code>&gt; </code>: alinhado à direita. <code>**texto**</code>: negrito.
      Uma linha em branco separa os parágrafos. A linha <code>[assinaturas]</code> põe o quadro de assinaturas.</li>
  </ul></details>`;

function telaModelos() {
  const salvos = d().modelos_contrato.length > 0;
  const modelos = K.modelosDe(d());
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p>
    <div class="cabecalho"><h1>Modelos de contrato</h1>${opera() ? link('#/modelo-contrato/novo', 'Novo modelo', 'botao') : ''}</div>
    <div class="cartao"><table><tr><th>Modelo</th><th></th></tr>
    ${modelos.map((m) => `<tr><td><b>${esc(m.nome)}</b>${m.id < 0 || m.padrao ? ` <span class="suave">(padrão)</span>` : ''}</td><td class="n nw">
      ${opera() ? `${link(`#/modelo-contrato/${m.id}`, 'Editar')} ${botao('copiarModelo', 'Copiar', { id: m.id })}` : ''}
      ${opera() && m.padrao && MODELOS_PADRAO.some((x) => x.nome === m.padrao) ? botao('restaurarModelo', 'Voltar ao texto padrão', { id: m.id }, 'secundario pequeno', `Trocar o texto de "${m.nome}" pelo texto padrão? As alterações feitas nele se perdem.`) : ''}
      ${podeUsuario('admin') && salvos ? botao('excluirModelo', 'Excluir', { id: m.id }, 'perigo pequeno', `Excluir o modelo "${m.nome}"?`) : ''}</td></tr>`).join('')}</table>
    <p class="suave">Para gerar um contrato, abra o inquilino e clique em <b>Gerar contrato</b>. Edite à vontade: os modelos ficam guardados no banco de dados${salvos ? '' : ' (por enquanto, os padrões do sistema)'}.</p></div>
    ${AJUDA_MODELO}`;
}

function telaModelo(rota) {
  const id = rota.partes[1];
  const m = id === 'novo' ? { id: '', nome: '', texto: '' } : K.modelosDe(d()).find((x) => String(x.id) === id);
  if (!m) return '<h1>Modelo não encontrado</h1>';
  return `<p class="suave"><a href="#/modelos-contrato">← Modelos de contrato</a></p>
    <h1>${m.id === '' ? 'Novo modelo de contrato' : `Modelo: ${esc(m.nome)}`}</h1>
    <form class="cartao" data-form="modeloContrato">
      <input type="hidden" name="id" value="${esc(m.id)}">
      <p><label>Nome do modelo</label><input name="nome" value="${esc(m.nome)}" required></p>
      <p><label>Texto</label><textarea name="texto" class="texto-modelo" spellcheck="true">${esc(m.texto)}</textarea></p>
      <div class="acoes"><button>Salvar</button><a class="botao secundario" href="#/modelos-contrato">Cancelar</a></div></form>
    ${AJUDA_MODELO}`;
}

/** Na primeira alteração, os modelos padrão passam a ficar no banco (e podem ser editados). Devolve o id real. */
function modelosNoBanco(db, id) {
  if (!db.modelos_contrato.length) {
    for (const p of MODELOS_PADRAO) R.inserir(db, 'modelos_contrato', { nome: p.nome, texto: p.texto, padrao: p.nome }, login(), `Modelo de contrato "${p.nome}" (padrão)`);
  }
  if (id < 0) {
    const p = MODELOS_PADRAO[-id - 1];
    const m = p && db.modelos_contrato.find((x) => x.padrao === p.nome);
    return m ? m.id : null;
  }
  return id;
}

/** Logo do banco (data URL) → PNG em bytes e tamanho, para o Word. */
async function logoPng() {
  if (!d().logo) return null;
  const img = new Image();
  img.src = d().logo;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext('2d');
  g.drawImage(img, 0, 0);
  const png = async () => new Uint8Array(await (await new Promise((ok) => canvas.toBlob(ok, 'image/png'))).arrayBuffer());
  const bytes = await png();
  // marca-d'água: a mesma logo quase transparente (7%), para ficar suave em qualquer leitor de Word
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.globalAlpha = 0.07;
  g.drawImage(img, 0, 0);
  return { bytes, marca: await png(), largura: canvas.width, altura: canvas.height };
}

// --------------------------------------------------------------------------
// Empresas, histórico e dados
// --------------------------------------------------------------------------
function telaEmpresas() {
  return `<div class="cabecalho"><h1>Empresas que emitem as NFs</h1>${podeUsuario('admin') ? link('#/novo/emitentes', 'Nova empresa', 'botao') : ''}</div>
    <div class="cartao rolagem"><table><tr><th>Nome</th><th>Razão social</th><th>CNPJ</th><th>Representante (contratos)</th><th>Aba no Excel</th><th>Situação</th><th></th></tr>
    ${ordenar(d().emitentes, 'nome').map((e) => `<tr><td><b>${esc(e.nome)}</b></td><td>${esc(e.razao_social)}</td><td>${esc(e.cnpj || '-')}</td><td>${e.representante_nome ? esc(e.representante_nome) : '<span class="suave">falta</span>'}</td><td>${esc(e.aba_modelo || e.nome.split(/\s+/)[0])}</td><td>${e.ativo ? etiqueta('Ativa', 'ok') : etiqueta('Inativa', 'neutra')}</td><td class="n">${podeUsuario('admin') ? link(`#/editar/emitentes/${e.id}`, 'Editar') : ''}</td></tr>`).join('')
    || '<tr><td colspan="7" class="suave">Nenhuma empresa cadastrada.</td></tr>'}</table>
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
    <div class="cartao"><h2>Versão para usar sem internet</h2>
      ${window.VERSAO_OFFLINE ? `<p>${etiqueta(`Você está na versão sem internet de ${dataBr(window.VERSAO_OFFLINE)}`, 'info')}</p>` : ''}
      <p>Um único arquivo com o programa inteiro. Guarde no computador (por exemplo, junto da pasta dos dados) e abra com dois cliques no Chrome ou no Edge: funciona sem internet e mesmo se o site do programa sair do ar. Os dados são os mesmos: escolha a mesma pasta.</p>
      <p class="suave">Quando o programa receber melhorias, baixe o arquivo de novo para ter a versão nova.</p>
      ${window.VERSAO_OFFLINE ? '' : '<p><a class="botao secundario" href="offline/administracao-imoveis.html" download="Administração de Imóveis.html">Baixar a versão sem internet</a></p>'}</div>
    <div class="cartao"><h2>Modelos de contrato</h2><p>Textos usados no botão <b>Gerar contrato</b> do inquilino (residencial, não residencial e os que você criar).</p>${link('#/modelos-contrato', 'Ver e editar os modelos')}</div>
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
  gerarContrato(form) {
    const f = Object.fromEntries(new FormData(form));
    try { localStorage.setItem('testemunhas_contrato', JSON.stringify({ t1: f.t1, c1: f.c1, t2: f.t2, c2: f.c2 })); } catch { /* sem lembrar */ }
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== ''));
    ir(`#/imprimir/contrato?${q}`);
  },

  async modeloContrato(form) {
    const f = new FormData(form);
    const nome = String(f.get('nome') || '').trim();
    const texto = String(f.get('texto') || '');
    if (!nome || !texto.trim()) throw new Error('Preencha o nome e o texto do modelo.');
    const id = Number(f.get('id') || 0);
    await alterar((db) => {
      const real = id ? modelosNoBanco(db, id) : null;
      if (real) R.atualizar(db, 'modelos_contrato', real, { nome, texto }, login(), `Modelo de contrato "${nome}"`);
      else R.inserir(db, 'modelos_contrato', { nome, texto }, login(), `Modelo de contrato "${nome}"`);
    });
    aviso('Modelo salvo.');
    ir('#/modelos-contrato');
  },

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

  async pedirAcesso(form) {
    const f = new FormData(form);
    const nome = String(f.get('nome') || '').trim();
    const lg = String(f.get('login') || '').trim().toLowerCase();
    const senha = String(f.get('senha') || '');
    if (!nome || !lg || /\s/.test(lg)) throw new Error('Preencha o nome e um login sem espaços.');
    if (senha.length < 6 || senha !== f.get('senha2')) throw new Error('A senha precisa ter pelo menos 6 caracteres e as duas precisam ser iguais.');
    if (E.d.usuarios.some((u) => u.login === lg)) throw new Error('Já existe um usuário (ou pedido) com este login.');
    const sal = novoSal();
    const hash = await resumoSenha(senha, sal);
    await alterar((db) => R.inserir(db, 'usuarios', { login: lg, nome, papel: 'consulta', ativo: false, pendente: true, senha_sal: sal, senha_hash: hash,
      criado_em: new Date().toISOString() }, lg, `Pedido de acesso de ${nome}`));
    aviso('Pedido enviado. Assim que o administrador aprovar, entre com o seu login e senha.');
    ir('#/');
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
    let recalculados = 0;
    const salvo = await alterar((db) => {
      let r;
      if (cfg.salvar) r = cfg.salvar(db, dados, rota.q, registro);
      else if (registro) {
        R.atualizar(db, tabela, registro.id, dados, login(), descricao);
        r = R.buscar(db, tabela, registro.id);
      } else r = R.inserir(db, tabela, dados, login(), descricao);
      // boletos em aberto acompanham o cadastro (contrato, correção, IPTU, seguro)
      if (cfg.recalcular) recalculados = R.recalcularCobrancas(db, cfg.recalcular(r, db), login());
      return r;
    });
    if (cfg.depois) await cfg.depois(salvo, antigo);
    if (tabela === 'usuarios') renovarUsuario();
    aviso(recalculados ? `Salvo. ${recalculados} boleto(s) em aberto recalculado(s) com os valores novos.` : 'Salvo.');
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
    const pagouEmDia = f.get('em_dia') === '1';
    const dataPagou = String(f.get('pagou') || '') || null;
    const r = await alterar((db) => R.registrarPagamento(db, Number(form.dataset.id), data, valor, login(), { pagouEmDia, dataPagou }));
    aviso(r.pontual ? `Pagamento em dia confirmado${pagouEmDia ? ' (sem multa e juros)' : ''}. Data da NF: ${dataBr(data)}. Valor da nota: ${reais(r.valor_nf)}.`
      : `Pagamento com ${r.dias_atraso} dia(s) de atraso: multa ${reais(r.multa)} e juros ${reais(r.juros)}. Valor da nota: ${reais(r.valor_nf)} (com multa e juros). Data da NF: ${dataBr(data)}.`, r.pontual ? 'ok' : 'aviso');
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

  async iptuPago(form) {
    const data = String(new FormData(form).get('data') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data do pagamento.');
    await alterar((db) => R.marcarIptuPago(db, Number(form.dataset.id), Number(form.dataset.n), data, login()));
    aviso('Parcela do IPTU marcada como paga.');
    await mostrar();
  },

  async desfazerNumeracao(form) {
    const n = Number(new FormData(form).get('numero'));
    if (!confirm(`Desfazer a numeração a partir da NF nº ${R.numeroFatura(n)}? Todas as NFs com este número ou maior saem da lista (ficam no Histórico), os pagamentos voltam para a fila e o próximo número volta a ser ${R.numeroFatura(n)}.`)) return;
    const qtd = await alterar((db) => R.desfazerNumeracao(db, n, login()));
    aviso(`${qtd} número(s) desfeito(s). Corrija o que precisar e clique em "Numerar estas NFs".`);
    await mostrar();
  },
  async nfExterna(form) {
    const f = new FormData(form);
    const n = await alterar((db) => R.registrarNfExterna(db, form.dataset.tipo, Number(form.dataset.id), f.get('numero'), String(f.get('emissao') || ''), login()));
    aviso(`NF nº ${R.numeroFatura(n)} registrada (emitida fora do sistema).`);
    await mostrar();
  },

  async indiceAcumulado(form) {
    const f = new FormData(form);
    const indice = String(f.get('indice') || '');
    const mesRef = String(f.get('mes_ref') || '');
    if (!/^\d{4}-\d{2}$/.test(mesRef)) throw new Error('Informe o mês até onde vai o acumulado.');
    const percentual = C.numero(f.get('percentual'));
    if (String(f.get('percentual') || '').trim() === '') throw new Error('Informe o percentual acumulado em 12 meses.');
    await alterar((db) => {
      const existente = db.indices_acumulados.find((x) => x.indice === indice && x.mes_ref === mesRef);
      if (existente) R.atualizar(db, 'indices_acumulados', existente.id, { percentual }, login(), `${indice} até ${compBr(mesRef)}: ${pct(percentual)}`);
      else R.inserir(db, 'indices_acumulados', { indice, mes_ref: mesRef, percentual }, login(), `${indice} até ${compBr(mesRef)}: ${pct(percentual)}`);
    });
    aviso('Índice salvo.');
    await mostrar();
  },
  filtroResultados(form) {
    const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
    ir(`#/resultados?${q}`);
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
    renovarUsuario();
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
    // versão de arquivo único: o modelo padrão vem embutido
    if (window.MODELO_FATURA_BASE64) return Uint8Array.from(atob(window.MODELO_FATURA_BASE64), (ch) => ch.charCodeAt(0)).buffer;
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
  correcoes: { recalcular: (db, r) => (cb) => cb.contrato_id === r.contrato_id },
  iptus: { recalcular: (db, r) => (cb) => (R.buscar(db, 'contratos', cb.contrato_id) || {}).imovel_id === r.imovel_id },
  seguros: { recalcular: (db, r) => (cb) => (R.buscar(db, 'contratos', cb.contrato_id) || {}).imovel_id === r.imovel_id },
  avulsas: { checar: (db, r) => (R.faturasDe(db, 'avulsa', r.id).length ? 'Esta NF avulsa já tem número.' : null) },
  encerramentos: { admin: true },
};

/** Redesenha o formulário aberto mantendo o que já foi digitado (depois de editar uma lista de opções). */
async function redesenharFormulario(el, ajustes, lista) {
  const form = el.closest('form');
  const valores = { ...Object.fromEntries(new FormData(form)), ...ajustes };
  await mostrar({ valores, erros: {} });
  const editor = document.querySelector(`[data-editor="${lista}"]`);
  if (editor) editor.hidden = false;
}

const numerosSelecionados = () => {
  const ns = [...document.querySelectorAll('input[data-nf]:checked')].map((x) => Number(x.dataset.nf));
  if (!ns.length) throw new Error('Marque pelo menos uma NF na lista.');
  return ns;
};

/** PDF de uma NF (uma empresa), com o nome "NÚMERO - EMPRESA IMÓVEL.pdf" (ex.: "0123 - ANK Loja 1.pdf"). */
async function pdfDaFatura(f) {
  const { html2canvas, jsPDF } = await bibliotecasPdf();
  const e = buscar('emitentes', f.emitente_id);
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:-20000px;top:0;background:#fff';
  caixa.innerHTML = faturaHtml(f, e);
  document.body.appendChild(caixa);
  try {
    const canvas = await html2canvas(caixa.firstElementChild, { scale: 2, backgroundColor: '#ffffff' });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    let w = 190;
    let h = (canvas.height * w) / canvas.width;
    if (h > 277) { w = (w * 277) / h; h = 277; }
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (210 - w) / 2, 10, w, h);
    const imovel = R.imovelDaFatura(E.d, f);
    const nome = S.limparNome(`${R.numeroFatura(f.numero)} - ${siglaEmpresa(e)} ${imovel ? imovel.nome : f.tomador_nome}`);
    return { blob: pdf.output('blob'), nome: `${nome}.pdf` };
  } finally {
    caixa.remove();
  }
}

/** Todas as NFs (uma por empresa) dos números escolhidos, em PDFs separados dentro de um ZIP. */
async function baixarPdfs(numeros, nomeZip) {
  const fs = E.d.faturas.filter((f) => f.situacao === 'Emitida' && numeros.includes(f.numero)).sort((a, b) => a.numero - b.numero || a.id - b.id);
  if (!fs.length) throw new Error('Nenhuma NF para exportar.');
  aviso(`Gerando ${fs.length} PDF(s)…`, 'info');
  const JSZip = await jsZip();
  const zip = new JSZip();
  for (const f of fs) {
    const { blob, nome } = await pdfDaFatura(f);
    zip.file(nome, blob);
  }
  baixar(await zip.generateAsync({ type: 'blob' }), `${nomeZip}.zip`);
}

export const ACOES = {
  escolherPasta: () => escolherPasta(),
  reabrir: () => reabrirPastaLembrada(),
  sair: () => sair(),
  imprimir: () => window.print(),

  async contratoWord() {
    const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
    const m = contratoMontado(q);
    if (!m) throw new Error('Inquilino não encontrado.');
    const [JSZip, logo] = await Promise.all([jsZip(), logoPng()]);
    const i = buscar('imoveis', m.c.imovel_id);
    const blob = await K.contratoDocx(JSZip, m.blocos, { logo, rodape: m.dados.rodape, titulo: `Contrato de locação - ${m.c.inquilino_nome}` });
    baixar(blob, `Contrato - ${m.c.inquilino_nome}${i ? ` - ${i.nome}` : ''}.docx`.replace(/[\\/:*?"<>|]/g, '-'));
  },

  async copiarModelo({ id }) {
    let novo;
    await alterar((db) => {
      const m = R.buscar(db, 'modelos_contrato', modelosNoBanco(db, Number(id)));
      novo = R.inserir(db, 'modelos_contrato', { nome: `Cópia de ${m.nome}`, texto: m.texto }, login(), `Modelo de contrato "Cópia de ${m.nome}"`);
    });
    ir(`#/modelo-contrato/${novo.id}`);
  },

  async restaurarModelo({ id }) {
    await alterar((db) => {
      const m = R.buscar(db, 'modelos_contrato', Number(id));
      const p = MODELOS_PADRAO.find((x) => x.nome === m.padrao);
      R.atualizar(db, 'modelos_contrato', m.id, { texto: p.texto }, login(), `Modelo de contrato "${m.nome}" voltou ao texto padrão`);
    });
    aviso('Texto padrão restaurado.');
    await mostrar();
  },

  async excluirModelo({ id }) {
    if (!podeUsuario('admin')) throw new Error('Só administradores podem excluir modelos.');
    await alterar((db) => {
      const m = R.buscar(db, 'modelos_contrato', Number(id));
      if (m) R.excluir(db, 'modelos_contrato', m.id, login(), `Modelo de contrato "${m.nome}" excluído`);
    });
    await mostrar();
  },
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
        for (const t of ['participacoes', 'seguros', 'leituras', 'reformas', 'iptus', 'titularidades']) db[t].filter((p) => p.imovel_id === reg.id).forEach((p) => R.excluir(db, t, p.id, login()));
      }
      if (tabela === 'contratos') {
        for (const t of ['cobrancas', 'correcoes', 'fiadores', 'aplicacoes', 'correcoes_garantia', 'renovacoes', 'encerramentos', 'trocas_garantia', 'leituras', 'solicitacoes']) db[t].filter((x) => x.contrato_id === reg.id).forEach((x) => R.excluir(db, t, x.id, login()));
      }
      R.excluir(db, tabela, reg.id, login(), reg.nome || reg.inquilino_nome || reg.descricao || null);
      if (cfg.recalcular) R.recalcularCobrancas(db, cfg.recalcular(db, reg), login());
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

  async alternarNf({ id }) {
    if (!opera()) throw new Error('Seu usuário não pode alterar.');
    await alterar((db) => {
      const c = R.buscar(db, 'contratos', id);
      const emite = !R.geraNf(c);
      R.atualizar(db, 'contratos', c.id, { gerar_nf: emite }, login(), emite ? 'Passa a emitir NF' : 'Passa a boleto de controle (sem NF)');
    });
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

  async recalcularMes({ comp }) {
    const n = await alterar((db) => R.recalcularCobrancas(db, (cb) => cb.competencia === comp, login()));
    aviso(n ? `${n} boleto(s) recalculado(s).` : 'Os boletos já estavam de acordo com o cadastro.');
    await mostrar();
  },

  async recalcularBoleto({ id }) {
    await alterar((db) => {
      R.atualizar(db, 'cobrancas', Number(id), { editado_manual: false }, login(), 'Boleto volta a ser calculado pelo cadastro');
      R.recalcularCobrancas(db, (cb) => cb.id === Number(id), login());
    });
    aviso('Boleto recalculado pelo cadastro.');
    await mostrar();
  },

  async excluirRenovacao({ id }) {
    await alterar((db) => {
      const r = R.buscar(db, 'renovacoes', id);
      R.excluirRenovacao(db, Number(id), login());
      R.recalcularCobrancas(db, (cb) => cb.contrato_id === r.contrato_id, login());
    });
    aviso('Registro excluído.');
    await mostrar();
  },

  async iptuPago({ id, n, data }) {
    await alterar((db) => R.marcarIptuPago(db, Number(id), Number(n), data || null, login()));
    await mostrar();
  },

  // listas editáveis (concessionárias, índices) dentro dos formulários
  abrirLista({ lista }) {
    const el = document.querySelector(`[data-editor="${lista}"]`);
    if (el) el.hidden = !el.hidden;
  },

  async incluirNaLista({ lista }, el) {
    const campoNovo = el.parentElement.querySelector('[data-lista-novo]');
    const valor = await alterar((db) => R.incluirNaLista(db, lista, campoNovo.value, login()));
    const sel = el.closest('[data-editor]').parentElement.querySelector('select');
    await redesenharFormulario(el, sel ? { [sel.name]: valor } : {}, lista);
    aviso(`"${valor}" incluído na lista.`);
  },

  async removerDaLista({ lista, valor }, el) {
    if (!confirm(`Remover "${valor}" da lista?`)) return;
    try {
      await alterar((db) => R.removerDaLista(db, lista, valor, login()));
    } catch (e) {
      window.alert(e.message);
      return;
    }
    await redesenharFormulario(el, {}, lista);
  },

  async desfazerUltimaNumeracao() {
    const ciclo = await alterar((db) => R.desfazerUltimaNumeracao(db, login()));
    aviso(`Numeração nº ${R.numeroFatura(ciclo.de)} a ${R.numeroFatura(ciclo.ate)} desfeita. Corrija o que precisar, inclua o que faltou e clique em "Numerar estas NFs".`);
    await mostrar();
  },

  async cancelarNumero({ numero }) {
    await alterar((db) => R.cancelarNumero(db, Number(numero), login()));
    aviso(`NF nº ${R.numeroFatura(numero)} cancelada. O pagamento voltou para a fila: corrija se precisar e numere de novo.`);
    await mostrar();
  },

  async apagarCanceladas({ numero }) {
    if (!podeUsuario('admin')) throw new Error('Só administradores podem apagar NFs.');
    await alterar((db) => R.apagarCanceladas(db, Number(numero), login()));
    aviso(`NF nº ${R.numeroFatura(numero)} apagada da lista.`);
    await mostrar();
  },

  async aplicarReajuste({ contrato, comp }) {
    const n = await alterar((db) => {
      R.aplicarReajuste(db, Number(contrato), comp, login());
      return R.recalcularCobrancas(db, (cb) => cb.contrato_id === Number(contrato), login());
    });
    aviso(`Correção registrada a partir do aluguel de ${compBr(comp)}.${n ? ` ${n} boleto(s) em aberto recalculado(s).` : ''}`);
    await mostrar();
  },

  async cartaEnviada({ contrato, comp, enviada }) {
    await alterar((db) => R.marcarCartaEnviada(db, Number(contrato), comp, enviada === '1', login()));
    await mostrar();
  },

  /** Calendário do Painel: mostra a agenda do dia clicado (clicar de novo fecha). */
  abrirDia({ dia }) {
    const alvo = document.querySelector(`[data-agenda="${dia}"]`);
    const abrir = alvo && alvo.hidden;
    document.querySelectorAll('[data-agenda]').forEach((el) => { el.hidden = true; });
    document.querySelectorAll('.cal-dia.selecionado').forEach((el) => el.classList.remove('selecionado'));
    if (abrir) {
      alvo.hidden = false;
      document.querySelector(`.cal-dia[data-dia="${dia}"]`).classList.add('selecionado');
    }
  },

  imprimirDemonstrativos({ comp }) {
    const ids = [...document.querySelectorAll('input[data-boleto]:checked')].map((x) => x.dataset.boleto);
    if (!ids.length) throw new Error('Marque pelo menos um imóvel na lista (ou "selecionar todos").');
    ir(`#/imprimir/demonstrativos?comp=${comp}&ids=${ids.join(',')}`);
  },

  imprimirSelecionadas() {
    const ns = numerosSelecionados();
    ir(`#/imprimir/faturas?numeros=${ns.join(',')}`);
  },

  async pdf({ id }) {
    const f = buscar('faturas', id);
    aviso('Gerando o PDF…', 'info');
    const { blob, nome } = await pdfDaFatura(f);
    baixar(blob, nome);
  },

  async pdfSelecionadas() {
    await baixarPdfs(numerosSelecionados(), 'NFs selecionadas');
  },

  async pdfMes({ mes }) {
    const ns = [...new Set(E.d.faturas.filter((f) => f.situacao === 'Emitida' && f.emissao.slice(0, 7) === mes).map((f) => f.numero))];
    await baixarPdfs(ns, `NFs ${mes} PDF`);
  },

  async excelSelecionadas() {
    const ns = numerosSelecionados();
    const [ExcelJS, JSZip] = await Promise.all([excelJs(), jsZip()]);
    const modelo = await modeloFatura();
    const zip = new JSZip();
    for (const n of ns) {
      const { blob, nome } = await excelDoNumero(ExcelJS, modelo, n);
      zip.file(nome, blob);
    }
    baixar(await zip.generateAsync({ type: 'blob' }), 'NFs selecionadas.zip');
  },

  // usuários: aprovar pedido de acesso, recusar e bloquear
  async aprovarUsuario({ id }) {
    if (!podeUsuario('admin')) throw new Error('Só administradores aprovam acessos.');
    const sel = document.querySelector(`[data-papel-de="${id}"]`);
    const papel = sel ? sel.value : 'consulta';
    await alterar((db) => {
      const u = R.buscar(db, 'usuarios', id);
      R.atualizar(db, 'usuarios', u.id, { pendente: false, ativo: true, papel }, login(), `Acesso de ${u.nome} aprovado como ${PAPEIS[papel]}`);
    });
    aviso('Acesso aprovado.');
    await mostrar();
  },

  async recusarUsuario({ id }) {
    if (!podeUsuario('admin')) throw new Error('Só administradores recusam acessos.');
    await alterar((db) => R.excluir(db, 'usuarios', Number(id), login(), 'Pedido de acesso recusado'));
    await mostrar();
  },

  async bloquearUsuario({ id }) {
    if (!podeUsuario('admin')) throw new Error('Só administradores bloqueiam usuários.');
    if (Number(id) === E.usuario.id) throw new Error('Você não pode bloquear o seu próprio acesso.');
    await alterar((db) => {
      const u = R.buscar(db, 'usuarios', id);
      R.atualizar(db, 'usuarios', u.id, { ativo: !u.ativo }, login(), u.ativo ? `Usuário ${u.login} bloqueado` : `Usuário ${u.login} desbloqueado`);
    });
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
