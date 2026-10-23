// Telas do sistema (HTML), formulários e ações dos botões.
import {
  E, alterar, aviso, backupCompletoSeguro, baixar, bibliotecasPdf, conectarSeguro, criarBanco, entrar, escolherPasta, excelJs, ir, janela, jsZip, login, mostrar,
  naFilaSegura, pastaSeguraDeTeste, podeUsuario, reabrirPastaLembrada, renovarUsuario, sair,
} from './app.js';
import * as B from './backup-seguro.js';
import * as S from './armazenamento.js';
import { conferirSenha, novoSal, PAPEIS, resumoSenha } from './auth.js';
import * as C from './calculos.js';
import * as K from './contratos.js';
import { pdfDeTudo, planilhaDeTudo } from './exportar.js';
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
const endereco = (i) => [R.enderecoCompleto(i), i.bairro, i.cidade ? `${i.cidade}${i.uf ? `/${i.uf}` : ''}` : '', i.cep ? `CEP ${i.cep}` : ''].filter(Boolean).join(' · ');

function multaJurosTexto(cb) {
  if (!cb.data_pagamento) return '';
  if (!cb.dias_atraso) return '<span class="suave">sem multa e juros</span>';
  return `Multa ${pct(cb.multa_percentual)} = <b>${reais(cb.multa)}</b><br>Juros ${pct(cb.juros_mensal_percentual)} a.m. × ${cb.dias_atraso} dias = <b>${reais(cb.juros)}</b>`;
}

const textoValor = (v) => (v === null || v === undefined || v === '' ? '(vazio)' : typeof v === 'object' ? JSON.stringify(v) : v);

/**
 * Tabela do histórico. ``desfazer`` (só na página Histórico, para o administrador): { pode: Set "índice:campo", indice: Map registro → índice }
 * mostra a caixinha e o botão ↶ nos campos que podem voltar agora (sempre o mais recente de cada campo).
 */
function tabelaHistorico(lista, desfazer = null) {
  const linhas = lista.map((h) => {
    let det = '';
    if (h.acao === 'Alteração' && h.detalhes) {
      const i = desfazer ? desfazer.indice.get(h) : -1;
      const volta = (k) => (desfazer && desfazer.pode.has(`${i}:${k}`) ? ` <label class="check-mini" title="Marcar para desfazer junto com outros"><input type="checkbox" data-desfazer value="${i}:${esc(k)}"></label>
        ${botao('desfazerAlteracao', '↶ Desfazer', { itens: `${i}:${k}` }, 'secundario pequeno', `Voltar "${k}" de "${textoValor(h.detalhes[k].para)}" para "${textoValor(h.detalhes[k].de)}"?`)}` : '');
      det = Object.entries(h.detalhes).map(([k, m]) => (m && typeof m === 'object'
        ? `<div><code>${esc(k)}</code>: ${esc(textoValor(m.de))} → ${esc(textoValor(m.para))}${volta(k)}</div>`
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

/** Guias do IPTU por ano: o id junta imóvel e ano (imóvel 5, 2026 → 52026), numa subpasta do ano. */
const idGuiasDoAno = (imovelId, ano) => imovelId * 10000 + ano;
function imovelDoEscopo(escopo, id) { return escopo === 'iptuano' ? Math.floor(id / 10000) : id; }
/** Documentos de entrada assinados: subpasta dentro da pasta do inquilino. */
const SUB_ASSINADOS = 'Documentos assinados';
const SUB_ADITIVOS = 'Termos aditivos';
const escopoDoContrato = (escopo) => ['contrato', 'assinados', 'aditivos'].includes(escopo);
const vinculoDoEscopo = (escopo, id) => (escopoDoContrato(escopo) ? { contrato_id: Number(id), imovel_id: buscar('contratos', id).imovel_id } : { imovel_id: imovelDoEscopo(escopo, Number(id)) });

/** Identifica a pasta de verdade (dois contratos podem usar a mesma pasta): "Imóvel/Inquilino (datas)/Termos aditivos". */
function chavePasta(escopo, id) {
  if (escopoDoContrato(escopo)) {
    const c = buscar('contratos', id);
    return c ? [pastaPaiContrato(c), c.pasta || nomePastaContrato(c), escopo === 'assinados' ? SUB_ASSINADOS : escopo === 'aditivos' ? SUB_ADITIVOS : ''].join('/') : null;
  }
  const i = buscar('imoveis', imovelDoEscopo(escopo, id));
  return i ? [i.pasta || i.nome, escopo].join('/') : null;
}
/** Depois de apagar o arquivo de um campo do formulário: troca só o quadro "Já guardado" (sem redesenhar a página). */
function arquivoApagadoNoFormulario(el, nome) {
  const caixa = el.closest('.arquivo-guardado');
  if (caixa) caixa.outerHTML = `<div class="ajuda"><span class="etiqueta aviso">Arquivo apagado</span> ${esc(nome)}. Para anexar outro, escolha o arquivo acima.</div>`;
  aviso(`Arquivo apagado: ${nome}.`);
}

/**
 * Troca de titular: traz do contrato anterior as correções, a caução (com os comprovantes, que mudam de pasta) e os boletos
 * a partir da data da troca (R.transferirHeranca). Avisa o que foi feito.
 */
async function trazerHeranca(id) {
  let r = null;
  await alterar((db) => {
    // o nome da pasta do anterior muda com a data de saída: guarda o atual antes do fim do vínculo (os arquivos estão nele)
    const a = R.contratoHerdado(db, R.buscar(db, 'contratos', Number(id)));
    if (a && !a.pasta) R.atualizar(db, 'contratos', a.id, { pasta: nomePastaContrato(a) }, login(), 'Pasta de arquivos');
    r = R.transferirHeranca(db, Number(id), login());
  });
  if (!r) return null;
  if (r.arquivos.length) {
    try {
      const de = await pastaDoEscopo('contrato', r.anterior.id, false);
      const para = await pastaDoEscopo('contrato', Number(id));
      for (const nome of [...new Set(r.arquivos)]) {
        try {
          await S.escreverTexto(para, nome, await S.abrirArquivo(de, nome));
          await de.removeEntry(nome);
        } catch { /* arquivo já não estava na pasta do anterior */ }
      }
    } catch { /* pasta do anterior não existe */ }
  }
  for (const nome of r.arquivosReserva || []) {
    try { await S.escreverTexto(await pastaDoEscopo('contrato', Number(id)), nome, await S.abrirArquivo(await pastaDoEscopo('contrato', r.anterior.id, false), nome)); } catch { /* sem o arquivo */ }
  }
  const c = buscar('contratos', id);
  const partes = [r.correcoes && `${r.correcoes} correção(ões) do aluguel`, c.reserva_usada_anterior !== undefined && 'a reserva', r.garantia && `a garantia (${c.garantia_tipo})`,
    r.boletosMovidos && `${r.boletosMovidos} boleto(s) (a NF sai no nome do novo titular)`].filter(Boolean);
  aviso(`${c.inquilino_nome}: contrato continuado de ${r.anterior.inquilino_nome} desde ${dataBr(r.data)}. Fim do vínculo do anterior em ${dataBr(C.somarDias(r.data, -1))}; reajuste no aniversário do contrato original${partes.length ? `; vieram ${partes.join(', ')}` : ''}.${r.comNf ? ` ${r.comNf} boleto(s) depois da troca já com NF emitida ficaram com ${r.anterior.inquilino_nome}: confira.` : ''}`, 'info');
  return r;
}

/** Muda (ou copia) arquivos da pasta do contrato anterior para a do novo titular. */
async function arquivosParaHerdeiro(anteriorId, novoId, nomes, mover = true) {
  if (!nomes.length) return;
  let de;
  try { de = await pastaDoEscopo('contrato', anteriorId, false); } catch { return; } // pasta do anterior não existe
  const para = await pastaDoEscopo('contrato', Number(novoId));
  for (const nome of [...new Set(nomes)]) {
    try {
      await S.escreverTexto(para, nome, await S.abrirArquivo(de, nome));
      if (mover) await de.removeEntry(nome);
    } catch { /* arquivo já não estava na pasta do anterior */ }
  }
}

/** Herança já feita com a garantia ou a reserva ainda no contrato anterior: completa (R.completarHeranca) e avisa. */
async function completarHeranca(id) {
  let r = null;
  await alterar((db) => {
    const a = R.contratoHerdado(db, R.buscar(db, 'contratos', Number(id)));
    if (a && !a.pasta) R.atualizar(db, 'contratos', a.id, { pasta: nomePastaContrato(a) }, login(), 'Pasta de arquivos');
    r = R.completarHeranca(db, Number(id), login());
  });
  if (!r) return null;
  await arquivosParaHerdeiro(r.anterior.id, id, r.arquivos, true);
  await arquivosParaHerdeiro(r.anterior.id, id, r.arquivosReserva, false);
  const c = buscar('contratos', id);
  aviso(`${c.inquilino_nome}: ${[r.garantia && 'garantia (comprovantes, depósitos e aplicações)', r.reserva && `reserva de ${reais(c.reserva_valor)}`].filter(Boolean).join(' e ')} trazida(s) do contrato de ${r.anterior.inquilino_nome}.`, 'info');
  return r;
}

/** Contratos herdados antes desta regra: trazem os dados do anterior uma vez (ao abrir o Painel). */
let herancasFeitas = false;
async function trazerHerancasPendentes() {
  if (herancasFeitas || !opera() || !E.pasta) return;
  herancasFeitas = true;
  const pendentes = d().contratos.filter((c) => c.contrato_anterior_id && !c.heranca_transferida && R.contratoHerdado(d(), c));
  for (const c of pendentes) await trazerHeranca(c.id);
  // heranças já feitas em que ficou faltando a garantia (comprovantes, depósitos, aplicações) ou a reserva do anterior
  const incompletas = d().contratos.filter((c) => R.herancaIncompleta(d(), c));
  for (const c of incompletas) await completarHeranca(c.id);
  if (pendentes.length || incompletas.length) await mostrar();
}

/** Arquivos que algum lançamento usa, por pasta: Set de "pasta|nome". */
const anexosEmUso = () => new Set(R.arquivosReferenciados(d()).map((a) => `${chavePasta(a.escopo, a.id)}|${a.nome}`));
/** Apaga os arquivos da pasta e registra no histórico. ``lista``: [{ escopo, id, nome }]. Devolve quantos apagou. */
async function apagarAnexos(lista, motivo) {
  const apagados = [];
  for (const a of lista) {
    try { await (await pastaDoEscopo(a.escopo, Number(a.id), false)).removeEntry(a.nome); apagados.push(a); } catch { /* já não estava na pasta */ }
  }
  if (apagados.length) await alterar((db) => apagados.forEach((a) => R.registrar(db, login(), 'Exclusão', 'arquivos', null, `${motivo}: ${a.nome}`, null, vinculoDoEscopo(a.escopo, a.id))));
  return apagados.length;
}
/**
 * Faz uma alteração que exclui ou desfaz lançamentos e apaga da pasta os anexos que eram deles e ficaram sem uso.
 * Ex.: excluir um termo aditivo apaga o PDF assinado dele.
 */
async function alterarApagandoAnexos(fn) {
  const antes = R.arquivosReferenciados(d()).map((a) => ({ ...a, pasta: chavePasta(a.escopo, a.id) }));
  const r = await alterar(fn);
  const emUso = anexosEmUso();
  const soltos = antes.filter((a) => a.pasta && !emUso.has(`${a.pasta}|${a.nome}`))
    .filter((a, n, l) => l.findIndex((b) => b.pasta === a.pasta && b.nome === a.nome) === n);
  await apagarAnexos(soltos, 'Arquivo apagado junto com o lançamento');
  return r;
}

/** Pasta de uma caixa de arquivos. ``criar`` = false: só olha (não cria pasta vazia só por abrir a página). */
async function pastaDoEscopo(escopo, id, criar = true) {
  const raiz = await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true });
  if (escopoDoContrato(escopo)) {
    const c = buscar('contratos', id);
    return S.subpasta(raiz, [pastaPaiContrato(c), c.pasta || nomePastaContrato(c), ...(escopo === 'assinados' ? [SUB_ASSINADOS] : escopo === 'aditivos' ? [SUB_ADITIVOS] : [])], criar);
  }
  const i = buscar('imoveis', imovelDoEscopo(escopo, id));
  if (escopo === 'iptuano') return S.subpasta(raiz, [i.pasta || i.nome, SUBPASTAS.iptu, String(id % 10000)], criar);
  return S.subpasta(raiz, [i.pasta || i.nome, SUBPASTAS[escopo] || SUB_DOCS], criar);
}

/**
 * Limpeza da pasta "Sem imóvel" (uma vez por sessão, ao abrir o Painel):
 * - contrato que ficou 7 dias sem imóvel (e sem boleto) é apagado, com a pasta dele se estiver vazia;
 * - pasta vazia que não é de nenhum contrato sem imóvel (ex.: contrato excluído) é apagada.
 * Pasta com arquivos nunca é apagada sozinha: aparece no aviso do Painel.
 */
let limpezaFeita = false;
async function limparSemImovel() {
  if (limpezaFeita || !opera() || !E.pasta) return;
  limpezaFeita = true;
  const vencidos = R.contratosSemImovelVencidos(d());
  if (vencidos.length) {
    await alterar((db) => vencidos.forEach((c) => R.excluirContrato(db, c.id, login(), `${c.inquilino_nome}: apagado por ficar ${R.DIAS_SEM_IMOVEL} dias sem imóvel`)));
    aviso(`Apagado(s) por ficar ${R.DIAS_SEM_IMOVEL} dias sem imóvel: ${vencidos.map((c) => c.inquilino_nome).join(', ')}.`, 'info');
  }
  let sem;
  try { sem = await S.subpasta(await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true }), [PASTA_SEM_IMOVEL], false); } catch { return; }
  const usadas = new Set(d().contratos.filter((c) => !c.imovel_id).map((c) => S.limparNome(c.pasta || nomePastaContrato(c))));
  pastasComArquivos = [];
  for (const nome of await S.subpastas(sem)) {
    if (usadas.has(nome)) continue;
    if (!(await S.apagarPastaVazia(sem, nome))) pastasComArquivos.push(nome);
  }
  if (!(await S.subpastas(sem)).length) await S.apagarPastaVazia(await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS), PASTA_SEM_IMOVEL);
  if (vencidos.length || pastasComArquivos.length) await mostrar();
}
let pastasComArquivos = [];

/**
 * Primeiro IPTU lançado depois da separação por ano: as guias que estavam soltas na pasta do IPTU são do ano
 * anterior, e vão para a pasta dele (se ele estiver lançado). Isso acontece uma vez só por imóvel; o que não
 * tiver ano fica em "Guias anteriores", no histórico.
 */
async function guardarGuiasSoltas(imovelId, anoNovo) {
  const imovel = buscar('imoveis', imovelId);
  if (imovel.guias_iptu_por_ano) return 0;
  await alterar((db) => R.atualizar(db, 'imoveis', imovelId, { guias_iptu_por_ano: true }, login(), 'Guias do IPTU separadas por ano'));
  const anterior = d().iptus.filter((p) => p.imovel_id === imovelId && p.ano < anoNovo).sort((a, b) => b.ano - a.ano)[0];
  if (!anterior) return 0;
  const solta = await pastaDoEscopo('iptu', imovelId);
  const arquivos = await S.listar(solta);
  if (!arquivos.length) return 0;
  const destino = await pastaDoEscopo('iptuano', idGuiasDoAno(imovelId, anterior.ano));
  for (const a of arquivos) {
    await S.salvarArquivo(destino, new File([await S.abrirArquivo(solta, a.nome)], a.nome));
    await solta.removeEntry(a.nome);
  }
  return arquivos.length;
}

/** Extensão do arquivo em minúsculas (".pdf") e nome sem acento para gravar na pasta (ex.: "Apólice Nº 1.PDF" → "apolice-n-1.pdf"). */
const extensao = (nome) => { const p = nome.lastIndexOf('.'); return p > 0 ? nome.slice(p).toLowerCase() : ''; };
const semAcentoArquivo = (nome) => {
  const ext = extensao(nome);
  const base = (ext ? nome.slice(0, nome.lastIndexOf('.')) : nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'arquivo'}${ext}`;
};

/** Guarda o arquivo assinado na pasta do inquilino com nome padrão, sem acento (ex.: contrato-de-locacao-assinado-2026-10-15.pdf). */
async function salvarAssinado(escopo, contratoId, arquivo, texto) {
  const ponto = arquivo.name.lastIndexOf('.');
  const ext = ponto > 0 ? arquivo.name.slice(ponto).toLowerCase() : '';
  const base = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return S.salvarArquivo(await pastaDoEscopo(escopo, contratoId), new File([arquivo], `${base}${ext}`));
}

/** Cor e ênfase de cada tipo de alerta (escolhidas em "Editar" nos alertas do Painel). */
const SEM_ACENTO = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const classeEstilo = (nivel, e) => `alerta ${nivel} ${e.cor === 'Padrão' ? '' : `cor-${SEM_ACENTO(e.cor)}`} enfase-${SEM_ACENTO(e.enfase)}`;
const classeAlerta = (a) => classeEstilo(a.nivel, R.estiloAlerta(d(), a.tipo));
/** Para onde leva o clique no alerta: o reajuste abre a tela Reajustes; os demais, o contrato ou o imóvel. */
const linkAlerta = (a) => (a.tipo === 'Reajuste do aluguel' ? `#/reajustes?contrato=${a.contrato_id}`
  : `${a.contrato_id ? `#/contrato/${a.contrato_id}` : `#/imovel/${a.imovel_id}`}${a.ancora ? `?ir=${a.ancora}` : ''}`);
/** Caixa de últimas alterações: começa recolhida e só abre quando o usuário clica nela. */
const caixaHistorico = (titulo, conteudo) => `<details class="cartao caixa-historico"><summary><b>${titulo}</b> <span class="suave">· clique para expandir</span></summary>${conteudo}</details>`;

function caixaArquivos(escopo, id, titulo, ancora, ajuda = '', dentro = false, enviar = true) {
  return `<div class="${dentro ? 'arquivos-dentro' : 'cartao'}" id="${ancora}">${dentro ? `<h3>${esc(titulo)}</h3>` : `<h2>${esc(titulo)}</h2>`}${ajuda ? `<p class="suave">${esc(ajuda)}</p>` : ''}
    <div data-arquivos="${escopo}:${id}"><p class="suave">Carregando…</p></div>
    ${opera() && enviar ? `<label class="botao secundario pequeno enviar">Anexar arquivos<input type="file" multiple data-upload="${escopo}:${id}" ${escopo === 'anuncio' ? 'accept="image/*"' : ''}></label>` : ''}</div>`;
}

const urls = [];
async function listaArquivos(escopo, id) {
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  let dir;
  try { dir = await pastaDoEscopo(escopo, id, false); } catch { dir = null; } // pasta ainda não existe: nada anexado
  const itens = dir ? await S.listar(dir) : [];
  if (!itens.length) return `<p class="suave">${escopo === 'anuncio' ? 'Nenhuma foto ainda.' : 'Nenhum arquivo ainda.'}</p>`;
  if (escopo === 'anuncio') {
    const figs = await Promise.all(itens.map(async (a) => {
      const u = URL.createObjectURL(await S.abrirArquivo(dir, a.nome));
      urls.push(u);
      return `<figure><a href="${u}" target="_blank"><img src="${u}" alt="${esc(a.nome)}"></a><figcaption><span>${esc(a.nome)}</span>${opera() ? botao('excluirArquivo', '×', { escopo, id, nome: a.nome }, 'perigo pequeno', 'Excluir esta foto?') : ''}</figcaption></figure>`;
    }));
    return `<div class="fotos">${figs.join('')}</div>`;
  }
  // apólices do seguro: a vigência da apólice aparece ao lado do arquivo
  const seguroDo = (nome) => (escopo === 'seguro' ? R.segurosDoImovel(d(), Number(id)).find((s) => s.arquivo_apolice === nome || (s.outros_arquivos || []).includes(nome)) : null);
  const vigencia = (nome) => { const s = seguroDo(nome); return s ? ` <span class="suave">· ${s.arquivo_apolice === nome ? 'apólice' : 'outro arquivo'} · vigência ${dataBr(s.vigencia_inicio)} a ${dataBr(s.vigencia_fim)}</span>` : ''; };
  return `<table>${itens.map((a) => `<tr><td><a href="#" data-acao="abrirArquivo" data-escopo="${escopo}" data-id="${id}" data-nome="${esc(a.nome)}">${esc(a.nome)}</a>${vigencia(a.nome)}</td>
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
const LINK_RESTAURAR = '<p class="suave" style="margin-top:10px">Administrador: <a href="#/restaurar-backup">restaurar um backup seguro</a></p>';

// --------------------------------------------------------------------------
// Campos que ajudam a preencher: máscara, CEP, CNPJ e pessoa já cadastrada
// --------------------------------------------------------------------------
const CAMPOS_PESSOA_FORM = ['nome', 'rg', 'telefone', 'email', 'endereco', 'genero', 'nacionalidade', 'estado_civil', 'profissao', 'nascimento'];
const titulo = (t) => String(t || '').toLocaleLowerCase('pt-BR').replace(/(^|[\s/(-])(\p{L})/gu, (x, a, b) => a + b.toLocaleUpperCase('pt-BR')).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());

function mensagemAuto(el, html) {
  const caixa = el.closest('div').querySelector('[data-auto-msg]');
  if (caixa) caixa.innerHTML = html;
}

/** Preenche só os campos vazios do formulário (ou ainda com o valor padrão); devolve os rótulos preenchidos. */
function preencherVazios(form, valores, padroes = {}) {
  const feitos = [];
  for (const [nome, valor] of Object.entries(valores)) {
    const alvo = nome && form.querySelector(`[name="${nome}"]`);
    if (!alvo || !valor || alvo.type === 'checkbox' || String(alvo.value) === String(valor)) continue;
    if (String(alvo.value).trim() && String(alvo.value) !== String(padroes[nome] ?? '')) continue;
    alvo.value = valor;
    alvo.dispatchEvent(new Event('change', { bubbles: true }));
    feitos.push(((form.querySelector(`label[for="${alvo.id}"]`) || {}).textContent || nome).replace(/\s*\*$/, ''));
  }
  return feitos;
}

async function consultarCep(el, cfg) {
  const n = F.soDigitos(el.value);
  if (n.length !== 8) return;
  mensagemAuto(el, 'Consultando o CEP…');
  try {
    const r = await (await fetch(`https://viacep.com.br/ws/${n}/json/`)).json();
    if (r.erro) return mensagemAuto(el, 'CEP não encontrado.');
    const feitos = preencherVazios(el.form, { [cfg.endereco]: r.logradouro ? `${r.logradouro}, ` : '', [cfg.bairro]: r.bairro, [cfg.cidade]: r.localidade });
    // o Estado sempre segue o CEP (mesmo se já estava preenchido)
    const uf = cfg.uf && el.form.querySelector(`[name="${cfg.uf}"]`);
    if (uf && r.uf && uf.value !== r.uf) { uf.value = r.uf; feitos.push('Estado'); }
    mensagemAuto(el, feitos.length ? `Preenchido pelo CEP: ${esc(feitos.join(', '))}. Complete o número.` : 'CEP conferido.');
    const end = el.form.querySelector(`[name="${cfg.endereco}"]`);
    if (feitos.length && end) end.focus();
  } catch {
    const uf = cfg.uf && el.form.querySelector(`[name="${cfg.uf}"]`);
    if (uf && C.ufDoCep(n)) uf.value = C.ufDoCep(n); // sem internet, o Estado sai das faixas de CEP
    mensagemAuto(el, 'Não deu para consultar o CEP agora (sem internet?). Preencha à mão.');
  }
}

async function consultarCnpj(el, cfg) {
  const n = F.soDigitos(el.value);
  if (n.length !== 14 || !F.cnpjValido(n)) return;
  mensagemAuto(el, 'Consultando o CNPJ…');
  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${n}`);
    if (!resp.ok) return mensagemAuto(el, 'CNPJ não encontrado na Receita.');
    const r = await resp.json();
    const endereco = [[r.descricao_tipo_de_logradouro, r.logradouro].filter(Boolean).join(' '), r.numero, r.complemento, r.bairro].filter(Boolean).map(titulo).join(', ')
      + (r.municipio ? `, ${titulo(r.municipio)}/${r.uf || ''}` : '');
    const feitos = preencherVazios(el.form, { [cfg.razao]: r.razao_social, [cfg.nome]: cfg.razao ? (r.nome_fantasia || r.razao_social) : r.razao_social, [cfg.endereco]: endereco, [cfg.sede]: endereco });
    mensagemAuto(el, `${esc(r.razao_social || '')}${r.descricao_situacao_cadastral ? ` · situação na Receita: <b>${esc(r.descricao_situacao_cadastral)}</b>` : ''}${feitos.length ? `<br>Preenchido: ${esc(feitos.join(', '))}.` : ''}`);
  } catch {
    mensagemAuto(el, 'Não deu para consultar o CNPJ agora (sem internet?). Preencha à mão.');
  }
}

/** Pessoas já cadastradas com este CPF/CNPJ (inquilinos, solidários, representantes e fiadores). */
function pessoasComDocumento(doc) {
  const n = F.soDigitos(doc);
  if (n.length < 11) return [];
  const [, tabela, id] = (location.hash.split('?')[0].match(/editar\/(\w+)\/(\d+)/) || []);
  const proprio = (t, r) => tabela === t && Number(id) === r.id;
  const achados = [];
  for (const c of d().contratos) {
    for (const [pref, papel] of [['inquilino_', 'inquilino'], ['solidario_', 'inquilino solidário'], ['representante_', 'representante']]) {
      if (F.soDigitos(c[`${pref}cpf`]) === n && !(proprio('contratos', c) && pref === 'inquilino_')) {
        achados.push({ fonte: `contratos:${c.id}:${pref}`, nome: c[`${pref}nome`], papel: `${papel} de ${(buscar('imoveis', c.imovel_id) || {}).nome || 'sem imóvel'}` });
      }
    }
  }
  for (const f of d().fiadores) {
    if (F.soDigitos(f.cpf) === n && !proprio('fiadores', f)) achados.push({ fonte: `fiadores:${f.id}:`, nome: f.nome, papel: `fiador de ${(buscar('contratos', f.contrato_id) || {}).inquilino_nome || ''}` });
  }
  return achados;
}

function procurarPessoa(el) {
  const achados = pessoasComDocumento(el.value);
  if (!achados.length) return;
  const alvo = el.name.slice(0, -3); // "inquilino_cpf" → "inquilino_"; "cpf" → ""; "fiador1_cpf" → "fiador1_"
  const a = achados[0];
  mensagemAuto(el, `Este documento já está cadastrado: <b>${esc(a.nome)}</b> (${esc(a.papel)}${achados.length > 1 ? ` e mais ${achados.length - 1}` : ''}).
    <button type="button" class="secundario pequeno" data-acao="usarPessoa" data-fonte="${esc(a.fonte)}" data-alvo="${esc(alvo)}">Usar os dados cadastrados</button>`);
}

/** Troca de titular escolhida no novo contrato: { anteriorId, data, arquivo } (o termo aditivo é gravado depois de salvar). */
let continuacao = null;

/**
 * Inquilino novo que continua o contrato de outro (troca de titular): confirma numa janela a data da alteração (novo início
 * do contrato e da vigência) e, se já tiver, o termo aditivo assinado da troca; as condições do contrato anterior entram
 * no formulário. Sem o termo, o contrato é salvo e fica o alerta "Aditivo da troca de titular" até anexar.
 */
function ligarContinuacaoDeContrato(raiz) {
  const sel = raiz.querySelector('form[data-form=cadastro] select[name=contrato_anterior_id]');
  if (!sel || !/^#\/novo\/contratos/.test(location.hash)) return;
  if (continuacao && String(continuacao.anteriorId) !== sel.value) continuacao = null;
  sel.addEventListener('change', async () => {
    const anterior = sel.value && buscar('contratos', sel.value);
    continuacao = null;
    if (!anterior) return mensagemAuto(sel, '');
    const r = await janela({ titulo: `Continuar o contrato de ${anterior.inquilino_nome}`, sim: 'Continuar o contrato',
      html: `<p>O novo inquilino assume o contrato de <b>${esc(anterior.inquilino_nome)}</b>: os inquilinos ficam ligados e as condições do contrato anterior entram no formulário.</p>
        <p><label>Data da alteração <span class="suave">(novo início do contrato e da vigência)</span></label><input type="date" name="data" value="${C.hojeIso()}" required></p>
        <p><label>Termo aditivo assinado da troca de titular <span class="suave">(opcional)</span></label><input type="file" name="arquivo" accept="application/pdf,image/*"></p>
        <p class="suave">Sem o termo agora: o contrato é registrado e fica o alerta "Aditivo da troca de titular" até anexar (em "Termos aditivos" na página do inquilino).</p>
        <p class="suave">Ao salvar, ${esc(anterior.inquilino_nome)} fica com <b>fim do vínculo</b> na véspera dessa data (não é saída: o contrato continua, com as mesmas regras e documentos).</p>` });
    if (!r) { sel.value = ''; return mensagemAuto(sel, ''); }
    const data = (r.data || [])[0] || C.hojeIso();
    const arq = (r.arquivo || [])[0];
    continuacao = { anteriorId: anterior.id, data, arquivo: arq && arq.size ? arq : null };
    const campos = F.CONTRATO.filter((c) => c.nome && c.tipo !== 'simnao');
    const cond = R.condicoesDoContrato(d(), anterior, data);
    const feitos = preencherVazios(sel.form, F.paraFormulario(campos, cond), F.paraFormulario(campos, null));
    // aluguel, bonificado, boleto e reserva: iguais aos do anterior (sobrescreve o que estiver digitado) e travados
    travarValoresHerdados(sel.form, F.paraFormulario(F.CONTRATO.filter((c) => c.nome), { bonificacao: anterior.bonificacao !== false,
      cobranca_mes_seguinte: anterior.cobranca_mes_seguinte !== false, ...cond }));
    if (anterior.garantia_tipo && anterior.garantia_tipo !== 'Sem garantia') travarGarantiaHerdada(sel.form, anterior, anterior.inquilino_nome);
    // a data da alteração é o novo início do contrato e da vigência (mesmo se já havia outra data no formulário)
    for (const nome of ['vigencia_inicio', 'data_entrada']) {
      const el = sel.form.querySelector(`[name=${nome}]`);
      if (el) { el.value = data; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    mensagemAuto(sel, `Continuação do contrato de ${esc(anterior.inquilino_nome)} a partir de ${dataBr(data)}${feitos.length ? `: ${esc(feitos.join(', '))} vieram do contrato anterior` : ''}.
      <b>Aluguel (${reais(cond.aluguel_inicial)}), bonificação, boleto, reserva e garantia são os do contrato e ficam travados</b>: mudanças depois, pelos botões da página do inquilino (correção, renovação, corrigir caução).
      ${continuacao.arquivo ? `Termo aditivo: ${esc(continuacao.arquivo.name)} (anexado ao salvar).` : 'Sem termo aditivo: fica o alerta para anexar.'}`);
  });
}

/** Campos da garantia que vêm do contrato anterior na troca de titular (não se digita uma garantia nova). */
const CAMPOS_GARANTIA_HERDADA = ['garantia_tipo', 'caucao_meses', 'caucao_valor', 'caucao_data', 'deposito_valor', 'deposito_data'];
/** Valores e boleto e reserva que vêm iguais do contrato anterior na troca de titular (travados no formulário). */
const CAMPOS_VALORES_HERDADOS = ['aluguel_inicial', 'aluguel_bonificado', 'desconto_pontualidade_percentual', 'bonificacao', 'dia_vencimento', 'cobranca_mes_seguinte',
  'taxa_boleto', 'multa_percentual', 'juros_mensal_percentual', 'reserva_valor', 'reserva_data', 'reserva_competencia', 'comprovante_reserva'];

/** Trava campos do formulário (só leitura, em cinza); ``valores`` (já no formato da tela) troca o que estiver escrito. */
function travarCampos(form, nomes, valores = {}) {
  for (const nome of nomes) {
    const el = form.querySelector(`[name=${nome}]`);
    if (!el) continue;
    if (nome in valores) {
      if (el.type === 'checkbox') el.checked = valores[nome] === true || valores[nome] === '1' || valores[nome] === 1;
      else if (el.type !== 'file') el.value = valores[nome] ?? '';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (el.type === 'file') el.disabled = true;
    el.readOnly = true;
    el.classList.add('travado');
    el.tabIndex = -1;
  }
}

/** Troca de titular: aluguel, bonificado, vencimento, tarifa, multa, juros e reserva iguais aos do contrato anterior. */
function travarValoresHerdados(form, valores = {}) {
  travarCampos(form, CAMPOS_VALORES_HERDADOS, valores);
  const ajuda = (form.querySelector('[name=reserva_valor]') || { closest: () => null }).closest('div');
  const texto = ajuda && (ajuda.querySelector('.ajuda') || ajuda.appendChild(Object.assign(document.createElement('div'), { className: 'ajuda' })));
  if (texto) texto.textContent = 'Reserva do contrato (herdada do titular anterior); o que ele já usou não abate de novo.';
}

/**
 * Troca de titular: a garantia é a do contrato (não se digita uma caução nova). Os campos ficam travados com a caução
 * atual (o último valor corrigido) e um aviso; mudar a caução é em "Corrigir caução" na página do inquilino.
 * ``origem``: contrato de onde vem a garantia (o anterior no novo contrato; o próprio herdeiro na edição).
 */
function travarGarantiaHerdada(form, origem, nomeAnterior) {
  const valores = { garantia_tipo: origem.garantia_tipo || '', caucao_meses: origem.caucao_meses || '', caucao_data: origem.caucao_data || '',
    deposito_data: origem.deposito_data || '' };
  const atual = R.valorGarantia(d(), origem);
  if (R.temCaucao(origem)) valores.caucao_valor = F.dinheiroTexto(atual);
  if (R.temDeposito(origem)) valores.deposito_valor = F.dinheiroTexto(atual);
  for (const nome of CAMPOS_GARANTIA_HERDADA) {
    const el = form.querySelector(`[name=${nome}]`);
    if (!el) continue;
    if (nome in valores) el.value = valores[nome];
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.readOnly = true;
    el.classList.add('travado');
    el.tabIndex = -1;
  }
  // o aviso vai no campo do valor (que tem a linha de mensagem automática)
  const alvo = form.querySelector(`[name=${R.temDeposito(origem) && !R.temCaucao(origem) ? 'deposito_valor' : 'caucao_valor'}]`);
  if (alvo) {
    mensagemAuto(alvo, `<b>Garantia herdada de ${esc(nomeAnterior)}</b>${atual ? `: ${R.temCaucao(origem) ? 'caução' : 'depósito'} atual de ${reais(atual)} (último valor corrigido)` : ''}.
      Não se registra uma garantia nova na troca de titular: se precisar mudar o valor, use <b>"Corrigir caução"</b> na página do inquilino depois de salvar.`);
  }
}

/** Editar o contrato de quem continuou o de outro: a garantia fica travada (é a do contrato). */
function ligarGarantiaHerdada(raiz) {
  const form = raiz.querySelector('form[data-form=cadastro]');
  const [, id] = location.hash.match(/^#\/editar\/contratos\/(\d+)/) || [];
  const c = form && id && buscar('contratos', id);
  const ant = c && R.contratoHerdado(d(), c);
  if (!ant) return;
  travarValoresHerdados(form);
  travarGarantiaHerdada(form, c, ant.inquilino_nome);
}

/** Caixas "Usar o endereço do imóvel" do contrato: [caixa, campo de endereço que recebe] (inquilino, representante e solidário). */
const ENDERECO_DO_IMOVEL = [['usar_endereco_imovel', 'inquilino_endereco'], ['representante_usar_endereco_imovel', 'representante_endereco'], ['solidario_usar_endereco_imovel', 'solidario_endereco']];

/** Novo contrato: "Usar o endereço do imóvel" copia o endereço do imóvel escolhido para o endereço do inquilino (ou do solidário). */
function ligarEnderecoDoImovel(raiz) {
  for (const [nomeCaixa, nomeCampo] of ENDERECO_DO_IMOVEL) {
    const caixa = raiz.querySelector(`form[data-form=cadastro] input[name=${nomeCaixa}]`);
    if (!caixa) continue;
    const form = caixa.form;
    const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
    const imovelId = () => (form.querySelector('[name=imovel_id]') || {}).value || q.imovel || q.vincular;
    const aplicar = () => {
      const i = imovelId() && buscar('imoveis', imovelId());
      const campo = form.querySelector(`[name=${nomeCampo}]`);
      if (!caixa.checked) return mensagemAuto(caixa, '');
      if (!i) return mensagemAuto(caixa, 'Escolha primeiro o imóvel deste contrato.');
      campo.value = enderecoInquilino(i);
      mensagemAuto(caixa, '');
    };
    caixa.addEventListener('change', aplicar);
    const sel = form.querySelector('[name=imovel_id]');
    if (sel) sel.addEventListener('change', aplicar);
  }
}

/**
 * Caução calculada: aluguéis × aluguel com bonificação (sem bonificação: o aluguel cheio). No novo contrato acompanha
 * sempre; na edição só preenche se estiver vazia (a caução já dada não muda sozinha).
 */
function ligarCaucao(raiz) {
  const form = raiz.querySelector('form[data-form=cadastro]');
  const valor = form && form.querySelector('[name=caucao_valor]');
  const meses = form && form.querySelector('[name=caucao_meses]');
  if (!valor || !meses || !form.querySelector('[name=aluguel_inicial]')) return;
  const novo = /^#\/novo\/contratos/.test(location.hash);
  const cent = (t) => { try { return String(t || '').trim() === '' ? NaN : C.centavos(t); } catch { return NaN; } };
  const calcular = () => {
    if (valor.readOnly || (!novo && valor.value.trim() !== '')) return;
    const n = Number(meses.value);
    const bonif = form.querySelector('[name=bonificacao]');
    const base = bonif && bonif.checked ? cent((form.querySelector('[name=aluguel_bonificado]') || {}).value) : cent(form.querySelector('[name=aluguel_inicial]').value);
    if (!(n > 0) || !Number.isFinite(base)) return;
    valor.value = F.dinheiroTexto(n * base);
    mensagemAuto(valor, `${n} × ${reais(base)} (aluguel ${bonif && bonif.checked ? 'com bonificação' : 'cheio'})`);
  };
  meses.addEventListener('input', calcular);
  for (const n of ['aluguel_inicial', 'aluguel_bonificado', 'desconto_pontualidade_percentual']) {
    const el = form.querySelector(`[name=${n}]`);
    // depois do cálculo do bonificado (que também escuta "input")
    if (el) el.addEventListener('input', () => setTimeout(calcular, 0));
  }
  ['bonificacao', 'garantia_tipo'].forEach((n) => { const el = form.querySelector(`[name=${n}]`); if (el) el.addEventListener('change', calcular); });
}

/** Endereço do imóvel por extenso, para o cadastro do inquilino (ex.: "Rua X, 117, Ap 02, Bairro, Curitiba/PR, CEP 82210-050"). */
const enderecoInquilino = (i) => [R.enderecoCompleto(i), i.bairro, i.cidade ? `${i.cidade}${i.uf ? `/${i.uf}` : ''}` : '', i.cep ? `CEP ${i.cep}` : ''].filter(Boolean).join(', ');

/** Caixa de texto de uma linha: a altura acompanha o texto (escondida, não mede: fica para quando aparecer). */
function crescer(t) {
  if (!t.offsetParent) return;
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight + 2}px`;
}

/**
 * Rascunho da vistoria (neste navegador): o que já foi marcado fica guardado a cada mudança e volta ao reabrir a vistoria,
 * por exemplo depois de editar o modelo do imóvel. Os itens são guardados pelo cômodo e nome (o modelo pode mudar). Some ao salvar.
 */
const lerRascunho = (chave) => { try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch { return null; } };
function guardarRascunhoVistoria() {
  const form = document.querySelector('form[data-rascunho]');
  if (!form) return;
  const f = Object.fromEntries([...new FormData(form)].filter(([, v]) => typeof v === 'string'));
  const itens = {};
  for (let n = 0; f[`ic_${n}`] !== undefined; n += 1) if (f[`is_${n}`] || f[`io_${n}`]) itens[`${f[`ic_${n}`]}|${f[`ii_${n}`]}`] = [f[`is_${n}`] || '', f[`io_${n}`] || ''];
  const campos = Object.fromEntries(['data', 'link_fotos', 'texto_abertura', 'chaves', 'descritivo', 'condicoes', 'texto_final'].filter((k) => k in f).map((k) => [k, f[k]]));
  try { localStorage.setItem(form.dataset.rascunho, JSON.stringify({ campos, itens })); } catch { /* navegador sem espaço: segue sem rascunho */ }
}
export function apagarRascunhoVistoria(chave) { try { localStorage.removeItem(chave); } catch { /* nada */ } }
function ligarRascunhoVistoria(raiz) {
  const form = raiz.querySelector('form[data-rascunho]');
  if (!form) return;
  const r = lerRascunho(form.dataset.rascunho);
  if (r) {
    for (const [k, v] of Object.entries(r.campos || {})) { const el = form.querySelector(`[name="${k}"]`); if (el) el.value = v; }
    // situação e observação de cada item: o rascunho manda (inclusive o que foi apagado)
    for (const sel of form.querySelectorAll('select[name^="is_"]')) {
      const n = sel.name.slice(3);
      const chave = `${form.querySelector(`[name="ic_${n}"]`).value}|${form.querySelector(`[name="ii_${n}"]`).value}`;
      const [s, o] = r.itens[chave] || ['', ''];
      sel.value = s;
      form.querySelector(`[name="io_${n}"]`).value = o;
    }
    const nota = document.createElement('div');
    nota.className = 'alerta info';
    nota.innerHTML = 'O preenchimento que você tinha começado foi recuperado. Ele fica guardado até salvar a vistoria. <button type="button" class="link-botao">Descartar e começar de novo</button>';
    nota.querySelector('button').addEventListener('click', () => { apagarRascunhoVistoria(form.dataset.rascunho); location.reload(); });
    form.prepend(nota);
  }
  form.addEventListener('input', guardarRascunhoVistoria);
  form.addEventListener('change', guardarRascunhoVistoria);
}

/** Vistoria: item marcado "Não se aplica" sai da tabela (fica uma linha para desfazer); ao salvar, sai também do modelo do imóvel. */
function ligarNaoSeAplica(raiz) {
  for (const sel of raiz.querySelectorAll('.grade-vistoria select[name^="is_"]')) {
    const tr = sel.closest('tr');
    const aplicar = () => {
      const fora = sel.value === K.NAO_SE_APLICA;
      tr.hidden = fora;
      const aviso = tr.nextElementSibling && tr.nextElementSibling.classList.contains('nao-aplica') ? tr.nextElementSibling : null;
      if (fora && !aviso) {
        const nome = tr.querySelector('input[name^="ii_"]').value;
        tr.insertAdjacentHTML('afterend', `<tr class="nao-aplica"><td colspan="${tr.children.length}" class="suave">${esc(nome)}: não se aplica (sai da vistoria e do modelo ao salvar) <button type="button" class="link-botao">Desfazer</button></td></tr>`);
        tr.nextElementSibling.querySelector('button').addEventListener('click', () => { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      }
      if (!fora && aviso) aviso.remove();
    };
    sel.addEventListener('change', aplicar);
    aplicar();
  }
}

function ligarCamposAutomaticos(raiz) {
  ligarRascunhoVistoria(raiz);
  ligarNaoSeAplica(raiz);
  for (const el of raiz.querySelectorAll('input[data-calculado]')) el.addEventListener('input', () => el.classList.toggle('valor-calculado', el.value.trim() === el.dataset.calculado));
  ligarContinuacaoDeContrato(raiz);
  ligarGarantiaHerdada(raiz);
  ligarEnderecoDoImovel(raiz);
  ligarCaucao(raiz);
  for (const el of raiz.querySelectorAll('input[data-mascara]')) {
    el.addEventListener('input', () => {
      const novo = F.mascarar(el.dataset.mascara, el.value);
      if (novo !== el.value) el.value = novo;
    });
    el.addEventListener('change', () => {
      // o mesmo valor de novo (ex.: ao sair do campo para clicar no botão da mensagem) não refaz a consulta
      if (el.dataset.conferido === el.value) return;
      el.dataset.conferido = el.value;
      const tipo = el.dataset.mascara;
      const erro = el.value && tipo !== 'tel' ? F.conferirDocumento(tipo, el.value) : '';
      el.classList.toggle('doc-invalido', !!erro);
      el.title = erro;
      if (erro) return mensagemAuto(el, `<span class="erro-campo">${esc(erro)}</span>`);
      mensagemAuto(el, '');
      if (el.dataset.preencher) {
        const cfg = JSON.parse(el.dataset.preencher);
        if (cfg.fonte === 'cep') consultarCep(el, cfg);
        else consultarCnpj(el, cfg);
      }
      if (el.hasAttribute('data-buscar-pessoa')) procurarPessoa(el);
    });
  }
}

export const TELAS = {
  _previaAlerta: (el, cor, enfase) => { el.className = classeEstilo('aviso', { cor, enfase }); },
  _listaArquivos: listaArquivos,
  restaurarBackup: () => telaRestaurarBackup(),
  'backup-seguro': () => telaBackupSeguro(),

  _ligarDesconto(raiz) {
    ligarCamposAutomaticos(raiz);
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
    // partes recolhidas (fiador a mais, solidário, carência): o botão expande e recolhe
    for (const b of raiz.querySelectorAll('[data-expandir]')) {
      b.addEventListener('click', () => {
        const abrir = b.dataset.aberto !== '1';
        b.closest('form').querySelectorAll(`[data-grupo="${b.dataset.expandir}"]`).forEach((el) => el.classList.toggle('recolhido', !abrir));
        b.dataset.aberto = abrir ? '1' : '';
        b.textContent = abrir ? 'Recolher' : b.dataset.texto;
        if (abrir) b.closest('form').querySelectorAll(`[data-grupo="${b.dataset.expandir}"] textarea.cresce`).forEach(crescer);
      });
    }
    // rótulos que mudam com outro campo (CPF ou CNPJ, RG ou inscrição estadual, conforme o tipo de inquilino)
    for (const lb of raiz.querySelectorAll('label[data-rotulo-se]')) {
      const [campoNome, valor, alt, normal] = lb.dataset.rotuloSe.split('|');
      const sel = lb.closest('form').querySelector(`[name="${campoNome}"]`);
      if (!sel) continue;
      const trocar = () => { lb.firstChild.textContent = (sel.value === valor ? alt : normal) + (lb.textContent.endsWith(' *') ? ' *' : ''); };
      sel.addEventListener('change', trocar);
    }
    // caixa de texto de uma linha que cresce com o texto digitado
    for (const t of raiz.querySelectorAll('textarea.cresce')) { t.addEventListener('input', () => crescer(t)); crescer(t); }
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
    const num = (t) => { try { return t.trim() === '' ? NaN : C.numero(t); } catch { return NaN; } };
    const cent = (t) => { try { return t.trim() === '' ? NaN : C.centavos(t); } catch { return NaN; } };
    // aluguel sobre o qual vale o %: o atual, quando já houve correção (fixo); senão, o aluguel cheio digitado
    const base = () => (form.dataset.base ? Number(form.dataset.base) : aluguel ? cent(aluguel.value) : NaN);
    const avisar = (texto) => {
      valEl.classList.toggle('doc-invalido', !!texto);
      const caixa = valEl.closest('div').querySelector('.erro-bonif') || valEl.closest('div').appendChild(Object.assign(document.createElement('div'), { className: 'erro-campo erro-bonif' }));
      caixa.textContent = texto;
    };
    // nada aqui pode "travar" o formulário: qualquer valor estranho só limpa o campo calculado e avisa
    const doPct = () => {
      try {
        const b = base(); const p = num(pctEl.value);
        const ok = Number.isFinite(b) && b > 0 && Number.isFinite(p) && p >= 0 && p <= 100;
        valEl.value = ok ? F.dinheiroTexto(b - C.descontoPorPercentual(b, p)) : '';
        avisar(Number.isFinite(p) && (p < 0 || p > 100) ? 'O % precisa ficar entre 0 e 100' : '');
      } catch { valEl.value = ''; }
    };
    const doValor = () => {
      try {
        const b = base(); const v = cent(valEl.value);
        if (!Number.isFinite(b) || !(b > 0) || !Number.isFinite(v)) { pctEl.value = ''; avisar(''); return; }
        if (v < 0 || v > b) { pctEl.value = ''; avisar(`O aluguel com bonificação precisa ficar entre R$ 0,00 e ${reais(b)} (aluguel cheio)`); return; }
        pctEl.value = F.pctTexto(Math.round(C.percentualPorBonificado(b, v) * 10000) / 10000);
        avisar('');
      } catch { pctEl.value = ''; }
    };
    pctEl.addEventListener('input', doPct);
    valEl.addEventListener('input', doValor);
    // mudou o aluguel cheio: o % fica e o aluguel com bonificação acompanha
    if (aluguel && !form.dataset.base) aluguel.addEventListener('input', () => { if (pctEl.value.trim() !== '') doPct(); else if (valEl.value.trim() !== '') doValor(); });
    if (form.dataset.base) {
      const nota = valEl.closest('div').querySelector('.ajuda');
      if (nota) nota.textContent = `O % vale sobre o aluguel atual de ${reais(Number(form.dataset.base))} (já corrigido). Digite o valor que o inquilino paga em dia: o % é calculado.`;
    }
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
      ${LINK_RESTAURAR}
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
    </form>${LINK_RESTAURAR}</div></main>`,

  login: () => `<main><div id="mensagens"></div><div class="cartao login">
    <h1>Administração de Imóveis</h1><p class="suave">Pasta: <b>${esc(E.pasta.name)}</b></p>
    <form data-form="login">
      <p><label>Login</label><input name="login" autofocus autocomplete="username"></p>
      <p><label>Senha</label><input type="password" name="senha" autocomplete="current-password"></p>
      <button>Entrar</button> ${botao('escolherPasta', 'Trocar de pasta')}
    </form><p class="suave" style="margin-top:14px">Primeiro acesso? <a href="#/pedir-acesso">Pedir acesso ao administrador</a></p>${LINK_RESTAURAR}</div></main>`,

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
    limparSemImovel().catch((e) => aviso(`Limpeza da pasta "${PASTA_SEM_IMOVEL}": ${e.message}`, 'aviso'));
    trazerHerancasPendentes().catch((e) => aviso(`Contratos herdados: ${e.message}`, 'aviso'));
    const hoje = C.hojeIso();
    const alertas = R.todosAlertas(d(), hoje);
    const pend = R.pendentesDeFatura(d());
    const abertas = d().cobrancas.filter((c) => c.situacao === 'Em aberto');
    const n = (v, t, h) => `<a class="cartao" href="${h}"><div class="grande">${v}</div>${t}</a>`;
    const mesAtual = C.competenciaDe(hoje);
    const faltamEtapas = R.etapasFechamento(d(), mesAtual, hoje).filter((e) => !e.feito);
    const incompletos = cadastrosIncompletos();
    const vencidos = abertas.filter((c) => c.vencimento < hoje).length;
    // o tipo de alerta com mais avisos ativos (ex.: 4 de "Reajuste do aluguel")
    const porTipo = {};
    for (const a of alertas) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
    const [tipoMais, qtdMais] = Object.entries(porTipo).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    return `<h1>Painel</h1>
      <div class="numeros">
        ${n(d().imoveis.length, 'imóveis', '#/imoveis')}
        ${n(d().contratos.filter((c) => R.contratoAtivo(c, hoje)).length, 'contratos ativos', '#/inquilinos')}
        <a class="cartao resumo-painel" href="${vencidos ? '#/inadimplencia' : '#/cobrancas'}" title="Boletos em aberto: no prazo e vencidos">
          <div class="simbolos"><span title="Em aberto, ainda no prazo">🟢 ${abertas.length - vencidos} em dia</span><span title="Em aberto e vencidos">🔴 ${vencidos} vencido(s)</span></div>
          Boletos em aberto</a>
        ${n(pend.length, 'pagamentos aguardando NF', '#/faturas')}
        <a class="cartao" href="#/?ir=alertas" title="Ver os alertas">${qtdMais ? `<div class="grande">${qtdMais}</div>alerta(s) de "${esc(tipoMais)}"<br><span class="suave">o aviso com mais alertas ativos (${alertas.length} no total)</span>` : '<div class="grande">0</div>alertas ativos'}</a>
        ${(() => { const r = R.resumoSolicitacoes(d()); return `<a class="cartao resumo-painel" href="#/solicitacoes" title="Ver as solicitações dos inquilinos">
          <div class="simbolos">${SITUACOES_SOLICITACAO.map((s) => `<span title="${s.texto}">${s.simbolo} ${r[s.nome]}</span>`).join('')}</div>Solicitações de inquilinos</a>`; })()}
      </div>
      ${incompletos.length ? `<div class="alerta aviso"><b>${incompletos.length} cadastro(s) incompleto(s).</b> ${link('#/pendencias', 'Ver o que falta', 'botao pequeno')}</div>` : ''}
      ${d().contratos.filter((c) => R.dataApagarSemImovel(c)).map((c) => `<div class="alerta aviso"><b>Contrato sem imóvel:</b> <a href="#/contrato/${c.id}">${esc(c.inquilino_nome)}</a> será apagado em <b>${dataBr(R.dataApagarSemImovel(c))}</b> se não for vinculado a um imóvel (use "Editar" no contrato).</div>`).join('')}
      ${pastasComArquivos.length ? `<div class="alerta aviso"><b>Pasta "${PASTA_SEM_IMOVEL}"</b> tem pasta(s) com arquivos e sem contrato: ${esc(pastasComArquivos.join(', '))}. Confira e apague à mão se não precisar mais.</div>` : ''}
      <div class="alerta ${faltamEtapas.length ? 'aviso' : 'ok'}"><b>Fechamento de ${compBr(mesAtual)}:</b> ${faltamEtapas.length ? `faltam ${faltamEtapas.length} etapa(s): ${esc(faltamEtapas.map((e) => e.titulo.split(' (')[0]).join('; '))}.` : 'todas as etapas feitas.'}
        ${link(`#/fechamento?mes=${mesAtual}`, 'Abrir o fechamento do mês', 'botao pequeno')}</div>
      ${podeUsuario('admin') && E.seguro && E.seguro.desconectado ? `<div class="alerta aviso"><b>Backup seguro</b> desconectado neste computador: o navegador pede para liberar a pasta de novo. ${botao('reconectarSeguro', 'Reconectar o backup seguro', {}, 'secundario pequeno')}</div>` : ''}
      ${podeUsuario('admin') && E.seguroErro ? `<div class="alerta erro"><b>Backup seguro:</b> a última cópia falhou (${esc(E.seguroErro)}). ${link('#/backup-seguro', 'Ver o backup seguro')}</div>` : ''}
      ${calendarioDoPainel(rota.q.mes || C.competenciaDe(hoje), hoje)}
      <div class="cartao" id="alertas"><div class="cabecalho"><h2>Alertas</h2>${podeUsuario('admin') ? link('#/alertas-config', 'Editar', 'botao secundario pequeno') : ''}</div>
        ${alertas.map((a) => `<div class="${classeAlerta(a)}"><b>${esc(a.tipo)}</b> <a href="${linkAlerta(a)}">${esc(a.imovel)}${a.inquilino ? ` · ${esc(a.inquilino)}` : ''}</a>: ${esc(a.texto)}</div>`).join('') || '<p class="suave">Nenhum alerta no momento.</p>'}
      </div>
      ${caixaHistorico('Últimas alterações', `${tabelaHistorico(ultimos(() => true, 12))}
        <p class="suave">Banco criado em ${new Date(d().criado_em).toLocaleString('pt-BR')}. <a href="#/historico">Ver histórico completo</a></p>`)}`;
  },

  // ------------------------------------------------------------------------
  imoveis() {
    // contas do imóvel numa linha fina embaixo do endereço (só o que estiver preenchido)
    const linhaContas = (i) => {
      const l = [['💧 Sanepar', i.sanepar_matricula], ['⚡ Copel', i.copel_uc], ['🔥 Gás', i.gas_relogio], ['🏢', i.administradora_nome]]
        .filter(([, v]) => v).map(([t, v]) => `${t} <b>${esc(v)}</b>`);
      return l.length ? `<br><span class="contas">${l.join(' · ')}</span>` : '';
    };
    const hoje = C.hojeIso();
    const linhas = R.imoveisPorEndereco(d().imoveis).map((i) => {
      const atuais = d().contratos.filter((c) => c.imovel_id === i.id && R.contratoAtivo(c, hoje)).sort((a, b) => b.data_entrada.localeCompare(a.data_entrada));
      const atual = atuais[0];
      return `<tr><td><a href="#/imovel/${i.id}"><b>${esc(i.nome)}</b>${i.sublote ? ` (${esc(i.sublote)})` : ''}</a></td><td>${esc(R.enderecoCompleto(i))}${linhaContas(i)}</td>
        <td>${atual ? atuais.map((c) => `<a href="#/contrato/${c.id}">${esc(c.inquilino_nome)}</a>${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}${R.geraNf(c) ? '' : ` ${etiqueta('boleto de controle', 'controle')}`}`).join('<br>') : etiqueta('Vago', 'aviso')}</td>
        <td class="n">${atual ? `${reais(R.aluguelAtual(d(), atual))}${atual.bonificacao === false ? '' : ` <span class="suave">(${reais(valorBonificado(atual))})</span>`}` : '-'}</td></tr>`;
    }).join('');
    return `<div class="cabecalho"><h1>Imóveis</h1><div class="acoes">${link('#/iptu', "IPTU's", 'botao secundario')}${opera() ? link('#/novo/imoveis', 'Novo imóvel', 'botao') : ''}</div></div>
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
  impostos: (rota) => telaImpostos(rota.q.mes || C.competenciaDe(C.hojeIso())),
  contas: (rota) => telaContas(rota),
  inadimplencia: () => telaInadimplencia(),
  reajustes: (rota) => telaReajustes(rota.q),
  calendario: (rota) => { ir(`#/${rota.q.mes ? `?mes=${rota.q.mes}` : ''}`); return ''; },
  imprimir: (rota) => telaImprimir(rota),
  'contrato-gerar': (rota) => telaGerarContrato(rota),
  aditivo: (rota) => telaAditivo(rota),
  'modelos-contrato': () => telaModelos(),
  vistoria: (rota) => telaVistoria(rota),
  'modelo-vistoria': (rota) => telaModeloVistoria(rota),
  fechamento: (rota) => telaFechamento(rota.q.mes || C.competenciaDe(C.hojeIso())),
  'alertas-config'() {
    if (!podeUsuario('admin')) return '<div class="alerta erro">Só administradores mudam a aparência dos alertas.</div>';
    const opcoes = (lista, v) => lista.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const linhas = R.TIPOS_ALERTA.map((t) => [t, R.estiloAlerta(d(), t)]).sort((a, b) => a[1].prioridade - b[1].prioridade).map(([t, e], n) => `<tr>
      <td><b>${esc(t)}</b><input type="hidden" name="tipo_${n}" value="${esc(t)}"></td>
      <td><select name="cor_${n}" data-previa="${n}">${opcoes(R.CORES_ALERTA, e.cor)}</select></td>
      <td><select name="enfase_${n}" data-previa="${n}">${opcoes(R.ENFASES_ALERTA, e.enfase)}</select></td>
      <td><input type="number" name="prioridade_${n}" min="1" max="99" value="${e.prioridade}" style="width:70px"></td>
      <td style="min-width:260px"><div class="${classeEstilo('aviso', e)}" id="previa_${n}" style="margin:0"><b>${esc(t)}</b> exemplo de aviso</div></td></tr>`).join('');
    return `<p class="suave"><a href="#/">← Painel</a></p><h1>Aparência dos alertas</h1>
      <p class="suave">Escolha a cor, a ênfase e a prioridade de cada tipo de aviso. Prioridade 1 aparece primeiro; com a mesma prioridade, vem antes o mais grave.
        Cor "Padrão": vermelho quando urgente, laranja quando aviso, azul quando informação.</p>
      <form data-form="estilosAlertas" class="cartao"><div class="rolagem"><table><tr><th>Tipo de aviso</th><th>Cor</th><th>Ênfase</th><th>Prioridade</th><th>Como fica</th></tr>${linhas}</table></div>
        <div class="acoes" style="margin-top:10px"><button>Salvar</button> ${botao('estilosAlertasPadrao', 'Voltar ao padrão do sistema', {}, 'secundario', 'Voltar todos os alertas para a aparência padrão?')} <a class="botao secundario" href="#/">Cancelar</a></div></form>`;
  },

  pendencias: () => telaPendencias(),
  'modelo-contrato': (rota) => telaModelo(rota),
  empresas: () => telaEmpresas(),
  inquilinos: (rota) => telaInquilinos(rota.q),
  solicitacoes: (rota) => telaSolicitacoes(rota.q),
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
  const parteInquilino = (pc) => (!pc.inquilinos.length ? '<span class="suave">-</span>' : pc.inquilinos.map((x) => `<a href="#/contrato/${x.contrato.id}">${esc(x.contrato.inquilino_nome)}</a> ${reais(x.valor)}${x.dias < x.diasMes ? ` <span class="suave">(${x.dias}/${x.diasMes} dias)</span>` : ''}`).join('<br>'));
  const suaParte = (pc) => (!pc.valorProprietario ? '<span class="suave">-</span>' : `<b>${reais(pc.valorProprietario)}</b>${pc.n === 0 ? '' : ` <span class="suave">(${pc.valorInquilino ? 'dias vazios' : 'imóvel vazio ou sem IPTU no contrato'})</span>`}`);
  const guia = (pc) => {
    if (pc.paga) return `${etiqueta(`paga em ${dataBr(pc.paga)}`, 'ok')} ${opera() ? botao('iptuPago', 'desfazer', { id: p.id, n: pc.n, data: '' }, 'link-botao', 'Desfazer o pagamento desta guia?') : ''}`;
    const aberta = pc.proprietario ? etiqueta('em aberto', 'perigo') : '';
    return opera() ? `<form data-form="iptuPago" data-id="${p.id}" data-n="${pc.n}" class="pagamento">${aberta}<input type="date" name="data" value="${C.hojeIso()}"><button class="pequeno">Paga</button></form>` : aberta;
  };
  return `<div class="rolagem"><table><tr><th>Parcela</th><th>Vence na prefeitura</th><th>Boleto do inquilino</th><th class="n">Valor</th><th>Parte do inquilino</th><th>Sua parte</th><th>Guia na prefeitura</th></tr>
    ${ps.map((pc) => `<tr><td>${pc.rotulo}</td><td>${pc.vencimento ? dataBr(pc.vencimento) : '<span class="suave">-</span>'}</td><td>${pc.mesBoleto ? compBr(pc.mesBoleto) : pc.comp ? `<span class="suave">aluguel de ${compBr(pc.comp)}</span>` : '-'}</td><td class="n">${reais(pc.valor)}</td>
      <td>${parteInquilino(pc)}</td><td>${suaParte(pc)}</td><td>${guia(pc)}</td></tr>`).join('')}</table></div>`;
}

/** Uma linha: quanto do IPTU do ano os inquilinos pagam nos boletos e quanto fica com você. */
function resumoIptu(p) {
  const t = R.totaisIptu(d(), p);
  return `<p>Inquilino(s) pagam <b>${reais(t.inquilino)}</b> nos boletos · sua parte <b>${reais(t.proprietario)}</b>${t.emAberto ? ` · ${etiqueta(`${reais(t.emAberto)} em aberto`, 'perigo')}` : ''}</p>`;
}

function caixaIptu(i) {
  const iptus = d().iptus.filter((p) => p.imovel_id === i.id).sort((a, b) => b.ano - a.ano);
  const ano = (p, atual) => `<h3>${p.ano} · total ${reais(p.valor_total)} em ${p.num_parcelas} parcela(s)${p.pago_avista ? ` · ${etiqueta(`quitado à vista${p.valor_avista ? ` ${reais(p.valor_avista)}` : ''}${p.data_quitacao ? ` em ${dataBr(p.data_quitacao)}` : ' (falta data)'}`, 'info')}` : ''}
      ${opera() ? `${link(`#/editar/iptus/${p.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'iptus', id: p.id }, 'perigo pequeno', 'Excluir o IPTU deste ano?')}` : ''}</h3>
      ${resumoIptu(p)}${p.pago_avista ? `<p class="suave">Inquilino que entrar: ${esc(p.cobranca_inquilino || R.COBRANCA_IPTU_QUITADO[0])}.</p>` : ''}${tabelaIptu(p)}
      ${caixaArquivos('iptuano', idGuiasDoAno(i.id, p.ano), `Guias do IPTU ${p.ano}`, `guias-iptu-${p.ano}`, atual ? 'Anexe aqui a guia (carnê) deste ano. Ao lançar o IPTU do próximo ano, estas guias passam para o histórico.' : '', true)}`;
  const [atual, ...anteriores] = iptus;
  return `<div class="cartao" id="iptu"><div class="cabecalho"><h2>IPTU</h2>${opera() ? link(`#/novo/iptus?imovel=${i.id}`, 'Lançar IPTU do ano') : ''}</div>
    <p class="suave">Você paga todas as guias na prefeitura; o inquilino devolve a parte dele no boleto. No mês de entrada e no de saída, o inquilino paga os dias em que ocupou e você paga o resto. Imóvel vazio (ou contrato sem IPTU): a parcela é toda sua e aparece nos alertas 15 dias antes do vencimento, até ser marcada como paga.</p>
    ${atual ? `${ano(atual, true)}${i.guias_iptu_por_ano ? '' : caixaArquivos('iptu', i.id, `Guias já anexadas (vão para o histórico de ${atual.ano} quando o próximo IPTU for lançado)`, 'guias-iptu', '', true, false)}` : `<p class="suave">Nenhum IPTU lançado.</p>${caixaArquivos('iptu', i.id, 'Guias do IPTU', 'guias-iptu', 'Pode anexar a guia aqui; ao lançar o IPTU do ano ela vai para o histórico do ano anterior.', true)}`}
    ${atual ? `<details class="historico-iptu"><summary><b>Histórico do IPTU</b> <span class="suave">· anos anteriores e as guias de cada ano (${anteriores.length} ano(s))</span></summary>
      ${anteriores.map((p) => ano(p, false)).join('')}
      ${i.guias_iptu_por_ano ? caixaArquivos('iptu', i.id, 'Guias anteriores', 'guias-iptu-anteriores', 'Guias anexadas antes de haver IPTU lançado por ano.', true, false) : ''}</details>` : ''}</div>`;
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
      ${item('Pasta de arquivos', esc(i.pasta || '-'))}${item('Modelo de vistoria', `${K.lerModeloVistoria(i.modelo_vistoria).length ? `${K.lerModeloVistoria(i.modelo_vistoria).length} cômodo(s)` : '<span class="suave">não montado</span>'} ${opera() ? link(`#/modelo-vistoria/${i.id}`, i.modelo_vistoria ? 'Editar' : 'Montar') : ''}`)}${item('Chaves e controles', i.chaves ? esc(i.chaves).replace(/\n/g, '<br>') : '<span class="suave">não informado (use Editar)</span>')}</div>
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
    ${caixaHistorico('Histórico do imóvel', tabelaHistorico(ultimos((h) => h.imovel_id === i.id)))}`;
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
    ${R.aditivosDo(d(), c.id).length ? etiqueta('Possui termo aditivo', 'aviso') : ''}
    ${(() => { const n = R.solicitacoesDo(d(), c.id).filter((x) => ['Aberta', 'Em andamento'].includes(x.situacao || 'Aberta')).length; return n ? `<a href="#/contrato/${c.id}?ir=solicitacoes">${etiqueta(`${n} solicitação(ões) em aberto`, 'perigo')}</a>` : ''; })()}
    ${c.gerar_nf === false ? seloControle() : ''}
    ${car ? etiqueta(`Carência ${compBr(car[0])}${car[0] !== car[1] ? ` a ${compBr(car[1])}` : ''}`, 'aviso') : ''}
    ${c.renovacao_automatica ? etiqueta('Renovação automática', 'neutra') : ''}
    ${etiqueta(`Correção anual: ${c.indice_correcao || 'índice não informado'}${base ? ` · todo ${dataBr(base).slice(0, 5)}` : ''}`, 'ok')}
    ${etiqueta(`Garantia: ${c.garantia_tipo || 'não informada'}`, 'neutra')}
    ${R.contratoAtivo(c) ? '' : etiqueta('Encerrado', 'perigo')}</div>`;
}

/** Aluguel inicial (histórico, do contrato) com a bonificação: é o que o cadastro mostra e de onde sai o %. */
const inicialBonificado = (c, inicial = c.aluguel_inicial, pctB = R.percentualBonificacao(c)) => inicial - C.descontoPorPercentual(inicial, pctB);

/** Aluguel atual com a bonificação de pontualidade (o que o inquilino paga em dia, sem IPTU e seguro). */
function valorBonificado(c) {
  const aluguel = R.aluguelAtual(d(), c);
  return aluguel - C.descontoPorPercentual(aluguel, R.percentualBonificacao(c));
}

/**
 * Valores do contrato inicial (aluguel cheio e bonificado): mudar depois de salvo pede duas confirmações.
 * O aluguel em vigor muda por "Registrar correção" ou "Renovação / novo valor". Devolve true para seguir.
 */
async function confirmarValoresIniciais(dados, r) {
  if (!r) return true;
  // o bonificado do cadastro é sempre o do aluguel inicial (histórico), não o do aluguel atual já corrigido
  const antes = r.bonificacao === false ? null : inicialBonificado(r);
  const depois = dados.bonificacao === false ? null : inicialBonificado(r, dados.aluguel_inicial, dados.desconto_pontualidade_percentual || 0);
  const mudou = [];
  if (dados.aluguel_inicial !== r.aluguel_inicial) mudou.push(`Aluguel inicial (valor cheio): ${reais(r.aluguel_inicial)} → ${reais(dados.aluguel_inicial)}`);
  if (antes !== depois) mudou.push(`Aluguel com bonificação: ${antes === null ? 'sem bonificação' : reais(antes)} → ${depois === null ? 'sem bonificação' : reais(depois)}`);
  // reajustes já lançados são refeitos em cadeia a partir do inicial corrigido
  if (dados.aluguel_inicial !== r.aluguel_inicial) {
    for (const m of R.correcoesRecalculadas(d(), r, dados.aluguel_inicial)) {
      mudou.push(`${m.x.indice === 'Negociado' ? 'Novo valor negociado' : 'Reajuste'} de ${dataBr(m.x.data_vigencia)}: ${reais(m.x.valor_novo)} → ${reais(m.valor_novo)}${m.x.indice === 'Negociado' ? ' (valor combinado mantido)' : ` (${pct(m.percentual)} sobre ${reais(m.valor_anterior)})`}`);
    }
  }
  if (!mudou.length) return true;
  const lista = `<ul>${mudou.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const passo1 = await janela({ titulo: 'Valores do contrato inicial',
    html: `<p>O aluguel cheio e o aluguel com bonificação deste cadastro são os valores do <b>contrato inicial</b>${r.vigencia_inicio ? `, assinado a partir de ${dataBr(r.vigencia_inicio)}` : ''}.</p>
      <p>Para mudar o aluguel em vigor (reajuste ou novo valor negociado), use <b>Registrar correção</b> ou <b>Registrar renovação / novo valor</b> na página do contrato.</p>${lista}`,
    sim: 'Quero corrigir o contrato inicial', nao: 'Cancelar' });
  if (!passo1) return false;
  const passo2 = await janela({ titulo: '⚠ Confirme a mudança do contrato inicial', forte: true,
    html: `<p><b>Isto muda o histórico do contrato.</b> Os boletos em aberto deste contrato podem ser recalculados com os valores novos.</p>${lista}<p>Confirma?</p>`,
    sim: 'Confirmo a mudança', nao: 'Cancelar' });
  return !!passo2;
}

/** Selo e aviso do boleto de controle (inquilino que não emite NF e não conta nos resultados). */
const seloControle = () => etiqueta('Boleto de controle · sem NF · fora dos resultados', 'controle');
const AVISO_CONTROLE = 'não emite NF. O pagamento é acompanhado (em dia ou atrasado), mas não gera NF e não conta nas somas dos boletos nem nos resultados financeiros.';

const caixaVerificar = (texto) => (texto ? `<div class="verificar"><b>A verificar:</b> ${esc(texto).replace(/\n/g, '<br>')}</div>` : '');

/** Quem entrou e quem saiu como fiador numa troca de garantia ("entra X; sai Y"). */
function mudancaFiadores(t) {
  const nome = (id) => (buscar('fiadores', id) || {}).nome || 'fiador excluído';
  const partes = [...(t.fiadores_novos || []).map((id) => `entra ${nome(id)}`), ...(t.fiadores_saida || []).map((s) => `sai ${nome(s.id)}`)];
  return partes.length ? `<br><span class="suave">${esc(partes.join('; '))}</span>` : '';
}

function caixaGarantia(c) {
  const fiadores = R.fiadoresDo(d(), c.id);
  const correcoes = R.correcoesGarantiaDo(d(), c.id);
  const aplic = R.aplicacoesDo(d(), c.id);
  const sit = R.situacaoAplicacao(d(), c);
  const sug = R.caucaoSugerida(d(), c);
  const trocas = R.trocasGarantiaDo(d(), c.id);
  const anteriores = R.fiadoresAnterioresDo(d(), c.id);
  const herdeiro = c.garantia_transferida_para && buscar('contratos', c.garantia_transferida_para);
  const anteriorDaGarantia = R.garantiaHerdada(d(), c) ? R.contratoHerdado(d(), c) : null;
  let html = `<div class="cartao garantia-compacta" id="garantia"><div class="cabecalho"><h2>Garantia: ${esc(c.garantia_tipo || 'não informada')}</h2>${opera() && !herdeiro ? link(`#/novo/trocas_garantia?contrato=${c.id}`, 'Trocar garantia ou fiador') : ''}</div>`;
  // troca de titular: a garantia é cuidada aqui, no contrato anterior, e aparece no novo titular
  if (herdeiro) {
    html += `<div class="alerta info">Esta garantia também vale para <a href="#/contrato/${herdeiro.id}?ir=garantia">${esc(herdeiro.inquilino_nome)}</a> (troca de titular em ${dataBr(herdeiro.data_entrada)}).
      O comprovante e o depósito anexados aqui aparecem lá. ${opera() ? botao('sincronizarGarantia', `Atualizar em ${esc(herdeiro.inquilino_nome)}`, { id: c.id }, 'mini') : ''}</div>`;
  }
  /** Título de uma parte com o botão na mesma linha (ex.: "Correções da caução · Corrigir caução"). */
  const subtitulo = (titulo, acao = '', dica = '') => `<div class="sub-garantia"><h3${dica ? ` title="${esc(dica)}"` : ''}>${titulo}</h3>${acao}</div>`;
  const excluir = (tabela, id, pergunta) => (opera() ? botao('excluir', '✕', { tabela, id }, 'perigo mini', pergunta) : '');
  // caução e depósito: registro em depósitos (data, valor, comprovante opcional) até completar o valor do contrato
  const formDeposito = (qual, falta) => (opera() ? `<form data-form="garantiaPaga" class="acoes linha-deposito"><input type="hidden" name="contrato" value="${c.id}"><input type="hidden" name="qual" value="${qual}">
      <input type="date" name="data" value="${esc(C.hojeIso())}" title="Data do depósito">
      <input name="valor" value="${esc(C.reais(falta, false))}" title="Valor depositado (R$)" class="valor">
      <label class="botao secundario mini enviar" title="Comprovante (PDF ou foto); pode anexar depois"><span data-nome-escolhido>📎 comprovante</span><input type="file" name="arquivo" accept="application/pdf,image/*" data-arquivo-doc></label>
      <button class="mini">Registrar depósito</button></form>` : '');
  const anexoDeposito = (qual, x) => ({ tabela: 'depositos_garantia', id: x.id, campo: 'comprovante', tipo: qual === 'caucao' ? 'caucao' : 'deposito-garantia', data: x.data });
  /** Depósitos numa tabela curta: data, valor, comprovante e ✕ (só onde pode excluir). */
  const tabelaDepositos = (qual, lista, podeExcluir) => (lista.length ? `<table class="compacta">${lista.map((x) => `<tr><td class="nw">${dataBr(x.data)}${x.complementar ? ' <span class="suave">complemento</span>' : ''}</td>
      <td class="n">${reais(x.valor)}</td><td>${linkComprovante(c.id, x.comprovante, anexoDeposito(qual, x))}</td>
      <td class="n">${podeExcluir(x) ? excluir('depositos_garantia', x.id, `Excluir o depósito de ${reais(x.valor)} de ${dataBr(x.data)}? O comprovante também é apagado.`) : ''}</td></tr>`).join('')}</table>` : '');
  const registrar = (qual, nome, prevista) => {
    const s = R.garantiaADepositar(d(), c, qual);
    return `<div class="alerta aviso"><b>Incluir ${nome}:</b> ${reais(s.combinado)} (prevista ${dataBr(prevista)}) · depositado ${reais(s.depositado)} · <b>falta ${reais(s.falta)}</b>
    ${s.corrigida ? `<br><span class="suave">Depois de registrada, completar até ${reais(s.corrigida)} pelos reajustes (+${reais(s.corrigida - s.combinado)}).</span>` : ''}
    ${tabelaDepositos(qual, s.depositos, () => true)}
    ${formDeposito(qual, s.falta)}</div>`;
  };
  const remover = (qual) => (opera() && R.podeRemoverComprovanteGarantia(d(), c, qual)
    ? ` ${botao('removerComprovanteGarantia', c[`${qual}_por_depositos`] && R.depositosGarantiaDo(d(), c, qual).some((x) => !x.complementar) ? 'Desfazer último depósito' : 'Remover comprovante', { contrato: c.id, qual }, 'perigo mini', `${c[`${qual}_por_depositos`] ? 'Desfazer o último depósito? Ele sai da lista (com o arquivo, se tiver) e' : 'Remover o comprovante do depósito? O arquivo é apagado e'} a garantia volta a "anexar comprovante".`)}` : '');
  const irParaAnterior = anteriorDaGarantia && opera() ? ` ${link(`#/contrato/${anteriorDaGarantia.id}?ir=garantia`, `Anexar na garantia de ${esc(anteriorDaGarantia.inquilino_nome)}`, 'botao secundario mini')}` : '';
  const comprovanteDa = (qual, campo) => {
    // contrato anterior da troca de titular: comprovante anexado aqui (vale para o novo titular), mesmo se os depósitos passaram para lá
    if (herdeiro && !R.depositosGarantiaDo(d(), c, qual).some((x) => x.comprovante)) {
      return ` · ${linkComprovante(c.id, c[campo] || null, { tabela: 'contratos', id: c.id, campo, tipo: qual === 'caucao' ? 'caucao' : 'deposito-garantia', data: c[`${qual}_pago_em`] || c[`${qual}_data`] || '' })}`;
    }
    if (c[`${qual}_por_depositos`]) return '';
    return ` · ${c[campo] ? linkComprovante(c[`${campo}_contrato`] || c.id, c[campo]) : `${etiqueta('sem comprovante', 'aviso')}${irParaAnterior}`}`;
  };
  const parcelas = (qual) => tabelaDepositos(qual, R.depositosGarantiaDo(d(), c, qual).filter((x) => c[`${qual}_por_depositos`] || x.complementar), (x) => x.complementar);
  // correções da caução: aparecem também enquanto a caução não foi depositada inteira
  const correcoesHtml = () => `${subtitulo('Correções da caução', opera() ? link(`#/novo/correcoes_garantia?contrato=${c.id}`, 'Corrigir caução') : '')}
    ${correcoes.length ? `<table class="compacta"><tr><th>Data</th><th class="n">Novo valor</th><th class="n">Complemento</th><th>Comprovante / obs.</th><th></th></tr>
      ${correcoes.map((x) => `<tr><td class="nw">${dataBr(x.data)}</td><td class="n">${reais(x.valor_novo)}</td><td class="n">${reais(x.complemento)}</td><td>${x.comprovante || x.complemento > 0 ? linkComprovante(c.id, x.comprovante, { tabela: 'correcoes_garantia', id: x.id, campo: 'comprovante', tipo: 'complemento-caucao', data: x.data }) : ''} ${esc(x.observacoes || '')}</td>
        <td class="n">${excluir('correcoes_garantia', x.id, 'Excluir esta correção da caução?')}</td></tr>`).join('')}</table>` : ''}`;
  if (anteriorDaGarantia && (R.temCaucao(c) || R.temDeposito(c)) && !R.garantiaDepositada(c)) {
    // herdada e ainda sem comprovante: o depósito e o comprovante são anexados no contrato anterior
    const qual = R.temCaucao(c) ? 'caucao' : 'deposito';
    html += `<div class="alerta aviso"><b>${qual === 'caucao' ? 'Caução' : 'Depósito de garantia'} herdada de ${esc(anteriorDaGarantia.inquilino_nome)}:</b> ${reais(qual === 'caucao' ? c.caucao_valor : c.deposito_valor)} · sem comprovante.
      Anexe o comprovante do depósito na garantia do contrato anterior: aparece aqui sozinho.${irParaAnterior}</div>${qual === 'caucao' ? correcoesHtml() : ''}`;
  } else if (R.temCaucao(c) && !R.garantiaDepositada(c)) {
    html += c.caucao_valor > 0 ? `${registrar('caucao', 'caução', c.caucao_data)}${correcoesHtml()}` : '<div class="alerta aviso">Caução sem valor: informe em "Editar".</div>';
  } else if (R.temCaucao(c)) {
    const comp = R.complementoCaucao(d(), c);
    const s = R.garantiaADepositar(d(), c, 'caucao');
    // falta completar (reajuste do aluguel ou correção): boleto do complemento ou depósitos registrados aqui
    if (s.falta > 0 || (comp && comp.boleto)) {
      html += `<div class="alerta aviso"><b>Complemento da caução:</b> deve ser ${reais(s.necessaria)}${s.corrigida ? ` (${c.caucao_meses} aluguéis com bonificação)` : ''} · depositado ${reais(s.depositado)} · <b>falta ${reais(s.falta)}</b>
        ${comp && comp.boleto ? `<br>Boleto do complemento: ${link(`#/cobranca/${comp.boleto.id}`, `vence em ${dataBr(comp.boleto.vencimento)}`, '')} (ao pagar, a caução é corrigida sozinha).`
    : `${comp && comp.complemento > 0 && opera() ? ` ${botao('gerarBoletoCaucao', `Gerar boleto (${reais(comp.complemento)})`, { contrato: c.id }, 'mini', `Gerar um boleto separado de ${reais(comp.complemento)}, sem tarifa e sem NF?`)}` : ''}
      ${s.falta > 0 ? formDeposito('caucao', s.falta) : ''}`}</div>`;
    }
    const inicial = R.depositosGarantiaDo(d(), c, 'caucao').filter((x) => !x.complementar).reduce((t, x) => t + x.valor, 0) || c.caucao_valor;
    html += `<p class="linha-garantia">Caução <b>${reais(inicial)}</b>, paga em ${dataBr(c.caucao_pago_em || c.caucao_data)}${comprovanteDa('caucao', 'comprovante_caucao')}${remover('caucao')}
      · atual <b class="maior">${reais(R.valorGarantia(d(), c))}</b>${c.caucao_meses ? ` <span class="suave">(${c.caucao_meses} aluguéis; sugerido hoje ${reais(sug)})</span>` : ''}</p>
      ${parcelas('caucao')}${correcoesHtml()}`;
  }
  if (R.temDeposito(c) && !R.garantiaDepositada(c) && !anteriorDaGarantia) {
    html += c.deposito_valor > 0 ? registrar('deposito', 'depósito de garantia', c.deposito_data) : '<div class="alerta aviso">Depósito de garantia sem valor: informe em "Editar".</div>';
  } else if (R.temDeposito(c)) {
    html += `<p class="linha-garantia">Depósito de garantia <b>${reais(R.valorGarantia(d(), c))}</b>, pago em ${dataBr(c.deposito_pago_em || c.deposito_data)}${comprovanteDa('deposito', 'comprovante_deposito')}${remover('deposito')}
      · uso: ${esc(c.deposito_uso || 'não informado')}</p>${parcelas('deposito')}`;
  }
  if (R.temFiador(c) || fiadores.length) {
    html += `${subtitulo('Fiadores')}<table class="compacta"><tr><th>Nome</th><th>CPF / RG</th><th>Contato</th><th>Vínculo</th><th></th></tr>
      ${fiadores.map((f) => `<tr><td><b>${esc(f.nome)}</b>${f.endereco ? `<br><span class="suave">${esc(f.endereco)}</span>` : ''}</td><td>${esc(f.cpf || '-')} / ${esc(f.rg || '-')}</td>
        <td>${esc([f.telefone, f.email].filter(Boolean).join(' · ') || '-')}</td>
        <td class="nw">${f.data_entrada ? dataBr(f.data_entrada) : 'início do contrato'} a ${f.data_saida ? dataBr(f.data_saida) : 'fim do contrato'}</td>
        <td class="n">${opera() ? botao('excluirFiador', '✕', { id: f.id }, 'perigo mini') : ''}</td></tr>`).join('')
      || `<tr><td colspan="5">${etiqueta('Nenhum fiador cadastrado', 'aviso')}</td></tr>`}</table>`;
  }
  if (anteriores.length) {
    html += `${subtitulo('Fiadores anteriores')}<table class="compacta suave"><tr><th>Nome</th><th>CPF / RG</th><th>Fim do vínculo</th><th>Substituído por</th><th></th></tr>
      ${anteriores.map((f) => `<tr><td>${esc(f.nome)}</td><td>${esc(f.cpf || '-')} / ${esc(f.rg || '-')}</td><td>${dataBr(f.data_saida)}</td><td>${esc((buscar('fiadores', f.substituido_por_id) || {}).nome || '-')}</td>
        <td class="n">${opera() ? botao('excluirFiador', '✕', { id: f.id }, 'perigo mini') : ''}</td></tr>`).join('')}</table>`;
  }
  if (trocas.length) {
    html += `${subtitulo('Trocas de garantia')}<table class="compacta suave"><tr><th>Data</th><th>De</th><th>Para</th><th class="n">Valor anterior</th><th>Obs.</th><th></th></tr>
      ${trocas.map((t, i) => `<tr><td class="nw">${dataBr(t.data)}</td><td>${esc(t.tipo_anterior || '-')}</td><td>${esc(t.tipo_novo)}${mudancaFiadores(t)}</td><td class="n">${t.valor_anterior ? reais(t.valor_anterior) : '-'}</td><td>${esc(t.observacoes || '')}</td>
        <td class="n">${opera() && i === 0 ? botao('cancelarTrocaGarantia', 'Cancelar troca', { id: t.id }, 'perigo mini', `Cancelar esta troca? O contrato volta para a garantia anterior (${t.tipo_anterior || 'não informada'}${t.valor_anterior ? ` de ${reais(t.valor_anterior)}` : ''}), com os mesmos valores, datas e comprovantes. Fiadores cadastrados depois da troca continuam no cadastro.`) : ''}</td></tr>`).join('')}</table>`;
  }
  // caução ou depósito em dinheiro: a aplicação aparece também enquanto não foi depositado tudo (aplica o que já entrou)
  if (R.temCaucao(c) || R.temDeposito(c) || aplic.length) {
    const situacaoTotal = sit.ok ? etiqueta('100% aplicado', 'ok') : sit.total ? etiqueta(`falta aplicar ${reais(sit.falta)}`, 'aviso') : '';
    html += `${subtitulo('Onde o valor foi aplicado', opera() ? link(`#/novo/aplicacoes?contrato=${c.id}`, 'Registrar aplicação') : '', 'Na saída, o valor é devolvido corrigido pela poupança (informado no cálculo final), pela conta em que foi depositado.')}
      <table class="compacta">${aplic.map((a) => { const rec = R.recebedorDaAplicacao(d(), a); return `<tr><td class="nw">${dataBr(a.data)}</td><td>${esc(rec.nome)}${rec.pessoa ? ` ${etiqueta('outra pessoa', 'info')}` : ''}</td><td class="n">${reais(a.valor)}</td>
        <td>${linkComprovante(c.id, a.comprovante, { tabela: 'aplicacoes', id: a.id, campo: 'comprovante', tipo: 'aplicacao-garantia', data: a.data })} ${esc(a.observacoes || '')}</td>
        <td class="n">${excluir('aplicacoes', a.id, 'Excluir esta aplicação?')}</td></tr>`; }).join('')}
      <tr class="total"><td colspan="2">Aplicado de ${reais(sit.total)}${R.garantiaDepositada(c) ? '' : ' <span class="suave">(já depositado)</span>'}</td><td class="n">${reais(sit.soma)}</td><td colspan="2">${situacaoTotal}</td></tr></table>`;
  }
  return `${html}</div>`;
}

function caixaSaida(c) {
  const e = R.encerramentoDo(d(), c.id);
  const seguinte = R.fimDeVinculo(d(), c) ? R.continuadoPor(d(), c) : null;
  if (!e && seguinte) {
    return `<div class="cartao" id="saida"><h2>Fim do vínculo em ${dataBr(c.data_saida)}</h2>
      <p>O contrato continua com <a href="#/contrato/${seguinte.id}">${esc(seguinte.inquilino_nome)}</a> desde ${dataBr(seguinte.data_entrada)}: mesmo contrato, mesmas regras e mesmos documentos de entrada. Não houve saída do imóvel, por isso não há vistoria de saída nem cálculo final.</p></div>`;
  }
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
    ${(() => { const dev = R.devolucaoPorRecebedor(d(), c, e.garantia_corrigida); return dev.length ? `<h3>Devolução da garantia: sai de onde foi depositada</h3><table>${dev.map((x) => `<tr><td>Devolver pela ${x.pessoa ? 'conta de ' : ''}${esc(x.nome)}${x.pessoa ? ` ${etiqueta('outra pessoa', 'info')}` : ''}</td><td class="n">${reais(x.valor)}</td></tr>`).join('')}</table>` : ''; })()}
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
  return `<div class="cartao"><h2>O que está incluso no contrato</h2><div class="grade compacta">
    ${item('IPTU', sit(c.conta_iptu || (c.cobrar_iptu ? R.SITUACOES[0] : R.SITUACOES[1])))}
    ${item('Seguro obrigatório', sit(c.conta_seguro || (c.cobrar_seguro === false ? R.SITUACOES[1] : R.SITUACOES[0])))}
    ${F.CONTAS.map(([k, t]) => item(t, sit(c[k]))).join('')}</div>
    ${c.contas_adicionais ? `<p class="pre" style="margin:8px 0 0"><span class="suave">Contas adicionais:</span> ${esc(c.contas_adicionais)}</p>` : ''}</div>`;
}

/** Histórico de solicitações do inquilino (pequenos reparos e pedidos). */
/** Taxas do proprietário pagas pelo inquilino no condomínio: o que já foi ressarcido e o botão para lançar. */
function caixaRessarcimentos(c) {
  const lista = R.ressarcimentosDo(d(), c.id);
  if (!R.inquilinoPagaCondominio(c) && !lista.length) return '';
  const aConferir = R.condominioAConferir(c);
  return `<div class="cartao" id="ressarcimentos"><div class="cabecalho"><h2>Condomínio: taxas do proprietário (ressarcimento)</h2>
      ${opera() ? link(`#/novo/ressarcimentos?contrato=${c.id}`, 'Lançar ressarcimento') : ''}</div>
    <p class="suave">O inquilino paga o condomínio. Quando o boleto do condomínio trouxer taxas que são do proprietário (fundo de obras, fundo de reserva, chamadas extras de obra…), lance aqui: o valor é abatido no boleto do aluguel do mês seguinte ao pagamento${d().ressarcimento_abate_nf ? ' e também sai do valor da NF' : ' e conta como gasto nos Resultados (a NF sai com o aluguel cheio)'}.</p>
    ${aConferir ? `<div class="alerta info">Condomínio de ${compBr(aConferir)} ainda não conferido. ${opera() ? botao('condominioConferido', `Conferido: sem taxa do proprietário em ${compBr(aConferir)}`, { id: c.id, mes: aConferir }, 'secundario pequeno') : ''}</div>`
    : R.inquilinoPagaCondominio(c) ? `<p class="suave">Conferido até ${c.condominio_conferido_ate ? compBr(c.condominio_conferido_ate) : '-'}.</p>` : ''}
    ${lista.length ? `<div class="rolagem"><table><tr><th>Condomínio de</th><th>Taxa</th><th class="n">Valor</th><th>Pago pelo inquilino em</th><th>Abatido no boleto de</th><th></th></tr>
      ${lista.map((x) => { const cb = R.boletoDoMes(d(), c.id, x.competencia_abatimento); return `<tr><td>${compBr(x.competencia_condominio)}</td><td>${esc(x.descricao)}</td><td class="n">${reais(x.valor)}</td><td>${dataBr(x.data_pagamento)}</td>
        <td>${compBr(x.competencia_abatimento)} ${cb ? (cb.data_pagamento ? etiqueta('abatido', 'ok') : etiqueta('no boleto em aberto', 'info')) : etiqueta('entra quando o boleto for gerado', 'neutra')}</td>
        <td class="n nw">${opera() && !(cb && cb.data_pagamento) ? `${link(`#/editar/ressarcimentos/${x.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'ressarcimentos', id: x.id }, 'perigo pequeno', 'Excluir este ressarcimento?')}` : ''}</td></tr>`; }).join('')}</table></div>` : ''}</div>`;
}

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
      ${seguros.map((s) => `<tr><td>${esc(s.seguradora || '-')}<br><span class="suave">${esc(s.apolice || '')}</span>${s.telefone_assistencia ? ` <span class="nw">· 📞 Assistência: <b>${esc(s.telefone_assistencia)}</b></span>` : ''}${s.arquivo_apolice ? `<br><a href="#" data-acao="abrirArquivo" data-escopo="seguro" data-id="${i.id}" data-nome="${esc(s.arquivo_apolice)}">📎 apólice</a>` : `<br>${etiqueta('sem arquivo da apólice', 'aviso')}`}</td><td>${dataBr(s.data_contratacao)}</td><td>${dataBr(s.vigencia_inicio)} a ${dataBr(s.vigencia_fim)}</td><td class="n">${reais(s.valor_total)}</td><td>${s.num_parcelas}x a partir de ${compBr(s.primeira_competencia)}</td>
        <td class="n">${opera() ? `${link(`#/editar/seguros/${s.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'seguros', id: s.id }, 'perigo pequeno', 'Excluir esta apólice?')}` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="suave">Nenhuma apólice cadastrada.</td></tr>'}</table></div>
    <p class="suave">As parcelas entram no boleto do inquilino que estiver no imóvel no mês de cada parcela (se o contrato dele inclui o seguro).</p>
    ${caixaArquivos('seguro', i.id, 'Apólices', 'apolices', 'O arquivo da apólice é anexado ao cadastrar a apólice (botão "Cadastrar apólice"); aqui ficam todos, com a vigência ao lado.', true)}</div>`;
}

/** Contrato, vistoria e recibo das chaves: gerar cada um e marcar quando foi assinado. */
/** Botões para gerar cada documento de entrada (contrato, vistoria de entrada, recibo das chaves). */
function geradoresDocumentos(c, cls = 'botao secundario pequeno') {
  const entrada = R.vistoriasDo(d(), c.id).find((v) => v.tipo === 'Entrada');
  return {
    doc_contrato_em: link(`#/contrato-gerar/${c.id}`, 'Gerar contrato', cls),
    doc_vistoria_em: entrada ? `${link(`#/imprimir/vistoria?id=${entrada.id}`, 'Ver vistoria', cls)} ${opera() ? link(`#/vistoria/${entrada.id}`, 'Editar vistoria', cls) : ''}`
      : (opera() ? link(`#/vistoria/novo?contrato=${c.id}&tipo=Entrada`, 'Fazer vistoria de entrada', cls) : ''),
    doc_chaves_em: link(`#/imprimir/chaves?contrato=${c.id}`, 'Gerar termo de entrega das chaves', cls),
  };
}

/** Marca única da situação do boleto: paga em dia, paga com atraso, vencida, em aberto ou carência. */
function situacaoBoleto(cb, hoje = C.hojeIso()) {
  if (!cb.data_pagamento && cb.situacao !== 'Carência' && cb.vencimento < hoje) return etiqueta('Vencida', 'perigo');
  return cb.pagou_em_dia ? `<span title="Pagou até o vencimento; o banco compensou depois">${situacao(cb.situacao)}</span>` : situacao(cb.situacao);
}

/** Boletos na página do inquilino: os 12 mais recentes numa tabela compacta; os anteriores ficam recolhidos. */
const BOLETOS_INQUILINO = 12;
function caixaBoletosInquilino(c, cobs, hoje) {
  const linha = (x) => {
    const fs = R.faturasDe(d(), 'cobranca', x.id);
    const atraso = x.dias_atraso ? `<br><span class="suave">${x.dias_atraso} dia(s) · multa ${reais(x.multa)} + juros ${reais(x.juros)}</span>` : '';
    return `<tr><td class="nw"><a href="#/cobranca/${x.id}">${compBr(x.competencia)}</a>${x.carencia ? ` ${etiqueta('carência', 'aviso')}` : ''}${R.ehComplementoCaucao(x) ? ` ${etiqueta('caução', 'info')}` : ''}</td>
      <td class="nw">${dataBr(x.vencimento)}</td><td class="n">${reais(R.totais(x).a_pagar_pontual)}</td>
      <td>${situacaoBoleto(x, hoje)}${x.data_pagamento ? ` <span class="suave">em ${dataBr(x.data_pagamento)}</span>` : ''}${atraso}</td>
      <td class="n">${x.valor_nf !== null ? reais(x.valor_nf) : '-'}</td><td class="nw">${fs.length ? `Nº ${R.numeroFatura(fs[0].numero)}` : (c.gerar_nf === false ? etiqueta('controle', 'controle') : '-')}</td></tr>`;
  };
  const cab = '<tr><th>Competência</th><th>Vencimento</th><th class="n">Valor pontual</th><th>Situação</th><th class="n">Valor NF</th><th>NF</th></tr>';
  const recentes = cobs.slice(0, BOLETOS_INQUILINO);
  const antigos = cobs.slice(BOLETOS_INQUILINO);
  return `<div class="cartao"><h2>Boletos <span class="suave">· ${cobs.length > BOLETOS_INQUILINO ? `${BOLETOS_INQUILINO} mais recentes de ${cobs.length}` : `${cobs.length}`}</span></h2>
    <div class="rolagem"><table class="compacta">${cab}${recentes.map(linha).join('') || '<tr><td colspan="6" class="suave">Nenhum boleto gerado ainda. Gere na tela "Boletos".</td></tr>'}</table></div>
    ${antigos.length ? `<details><summary>Mostrar os ${antigos.length} boleto(s) anteriores</summary><div class="rolagem"><table class="compacta">${cab}${antigos.map(linha).join('')}</table></div></details>` : ''}
    ${R.cadeiaDeContratos(d(), c).antes.reverse().map((x) => { const l = d().cobrancas.filter((y) => y.contrato_id === x.id).sort((a, b) => b.competencia.localeCompare(a.competencia));
    return l.length ? `<details><summary>Boletos do titular anterior: ${esc(x.inquilino_nome)} (${l.length})</summary><div class="rolagem"><table class="compacta">${cab}${l.map(linha).join('')}</table></div></details>` : ''; }).join('')}</div>`;
}

/** Cabeçalho do inquilino: botões para abrir na hora os documentos já anexados (entrada, assinatura faltante e aditivos). */
function atalhosDocumentos(c) {
  const abrir = (escopo, id, nome, texto) => `<a href="#" class="botao secundario pequeno" data-acao="abrirArquivo" data-escopo="${escopo}" data-id="${id}" data-nome="${esc(nome)}" title="${esc(nome)}">📎 ${esc(texto)}</a>`;
  const curto = { doc_contrato_em: 'Contrato', doc_vistoria_em: 'Vistoria de entrada', doc_chaves_em: 'Termo das chaves' };
  const botoes = R.DOCUMENTOS_ENTRADA.map(([k]) => {
    const doc = R.documentoEntrada(d(), c, k);
    if (doc && doc.arquivo) return abrir('assinados', doc.contrato.id, doc.arquivo, curto[k]);
    const p = R.documentoParcial(d(), c, k);
    return p ? abrir('assinados', c.id, p.arquivo, `${curto[k]} (falta assinatura)`) : '';
  }).filter(Boolean);
  for (const a of [...R.aditivosDo(d(), c.id)].reverse()) botoes.push(abrir('aditivos', a.contrato_id, a.arquivo, `Aditivo ${dataBr(a.data)}`));
  return botoes.length ? `<div class="atalhos-docs"><span class="suave">Documentos:</span> ${botoes.join(' ')}</div>` : '';
}

/** Topo da página do inquilino: o que falta dos documentos de entrada, com os botões para gerar. */
function faixaDocumentosEntrada(c) {
  if (!R.contratoAtivo(c)) return '';
  const falta = R.DOCUMENTOS_ENTRADA.filter(([k]) => R.documentoFalta(d(), c, k));
  if (!falta.length) return '';
  const g = geradoresDocumentos(c, 'botao pequeno');
  return `<div class="alerta aviso"><b>Documentos de entrada:</b> falta ${esc(falta.map(([, t]) => t.toLocaleLowerCase('pt-BR')).join(', '))}.
    <div class="acoes" style="margin-top:6px">${falta.map(([k]) => g[k]).join(' ')} ${link(`#/contrato/${c.id}?ir=documentos`, 'Marcar como assinado', 'botao secundario pequeno')}</div></div>`;
}

function caixaDocumentos(c) {
  const hoje = C.hojeIso();
  const vistorias = R.vistoriasDo(d(), c.id);
  const gerar = geradoresDocumentos(c);
  const doc = (k) => R.documentoEntrada(d(), c, k);
  const herdado = (k) => doc(k) && doc(k).contrato.id !== c.id;
  const abrir = (k) => (doc(k).arquivo ? `<a href="#" data-acao="abrirArquivo" data-escopo="assinados" data-id="${doc(k).contrato.id}" data-nome="${esc(doc(k).arquivo)}">📎 ${esc(doc(k).arquivo)}</a>` : '<span class="suave">sem arquivo</span>');
  // troca de titular: os documentos de entrada vêm do contrato original (não se gera novo, não fica pendente)
  const original = R.contratoHerdado(d(), c);
  const perdido = (k) => R.documentoPerdido(d(), c, k);
  const aguardaPerda = (k) => perdido(k) && c[R.campoPerdidoPendente(k)];
  const parcial = (k) => R.documentoParcial(d(), c, k);
  const adm = podeUsuario('admin');
  const analise = (k, tipo) => (adm ? ` ${botao('analisarDocumento', tipo === 'perdido' ? 'Confirmar perda' : 'Conferido', { contrato: c.id, campo: k, tipo, aceitar: 1 }, 'pequeno')}
    ${botao('analisarDocumento', 'Recusar', { contrato: c.id, campo: k, tipo, aceitar: 0 }, 'perigo pequeno', tipo === 'perdido' ? 'Recusar a perda? O documento volta a pendente.' : 'Recusar este anexo com assinatura faltante? O documento volta a pendente e o arquivo é apagado.')}` : '');
  const situacaoDoc = (k, feito) => {
    if (aguardaPerda(k)) return `${etiqueta(`perdido? aguardando o administrador (${c[R.campoPerdidoPendente(k)]}, ${dataBr(perdido(k))})`, 'aviso')}${analise(k, 'perdido')}`;
    if (perdido(k)) return etiqueta(`perdido (registrado em ${dataBr(perdido(k))})`, 'perigo');
    if (parcial(k)) {
      const p = parcial(k);
      return `${etiqueta(`falta assinatura: ${p.falta.join(', ')}`, 'aviso')}<br><span class="suave">anexado em ${dataBr(p.data)} por ${esc(p.por || '-')}:</span>
        <a href="#" data-acao="abrirArquivo" data-escopo="assinados" data-id="${c.id}" data-nome="${esc(p.arquivo)}">📎 ${esc(p.arquivo)}</a>
        ${p.pendente ? `<br>${etiqueta('aguardando análise do administrador', 'info')}${analise(k, 'parcial')}` : ''}`;
    }
    if (doc(k)) return `${etiqueta(`${feito} em ${dataBr(doc(k).data)}`, 'ok')}${herdado(k) ? `<br><span class="suave">herdado de <a href="#/contrato/${doc(k).contrato.id}?ir=documentos">${esc(doc(k).contrato.inquilino_nome)}</a></span>` : ''}`;
    if (original) return `${etiqueta(`herdado de ${original.inquilino_nome}`, 'info')}<br><span class="suave">ainda não marcado no contrato anterior: marque lá, em <a href="#/contrato/${original.id}?ir=documentos">${esc(original.inquilino_nome)}</a></span>`;
    return etiqueta('pendente', 'perigo');
  };
  const linhas = R.DOCUMENTOS_ENTRADA.map(([k, nome, feito]) => `<tr${perdido(k) && !aguardaPerda(k) ? ' class="doc-perdido"' : parcial(k) ? ' class="doc-parcial"' : ''}><td><b>${esc(nome)}</b></td>
    <td>${situacaoDoc(k, feito)}</td>
    <td class="nw">${doc(k) || perdido(k) || parcial(k) || original ? '' : gerar[k]}</td>
    <td class="n nw">${herdado(k) ? abrir(k) : c[k] ? `${abrir(k)}
      ${opera() ? botao('desmarcarDocumento', 'Desfazer', { contrato: c.id, campo: k }, 'link-botao', `Voltar "${nome}" para pendente? O arquivo assinado também é apagado.`) : ''}`
    : !opera() || perdido(k) || original ? '' : `<form data-form="marcarDocumento" class="acoes" style="justify-content:flex-end"><input type="hidden" name="contrato" value="${c.id}"><input type="hidden" name="campo" value="${k}">
        <input type="date" name="data" value="${hoje}" style="width:auto">
        <label class="botao secundario pequeno enviar" title="Arquivo assinado (PDF ou foto)"><span data-nome-escolhido>Anexar</span><input type="file" name="arquivo" accept="application/pdf,image/*" data-arquivo-doc></label>
        <button class="secundario pequeno">Marcar ${feito}</button>
        ${parcial(k) ? '' : botao('documentoParcial', 'Falta assinatura', { contrato: c.id, campo: k }, 'secundario pequeno')}</form>`}
      ${opera() && !doc(k) && !original ? (perdido(k) ? botao('desmarcarPerdido', 'Desfazer "perdido"', { contrato: c.id, campo: k }, 'link-botao')
        : parcial(k) ? botao('desfazerParcial', 'Desfazer "falta assinatura"', { contrato: c.id, campo: k }, 'link-botao', 'Tirar o registro de assinatura faltante? O documento volta a pendente e o arquivo é apagado.')
        : botao('documentoPerdido', 'Documento perdido', { contrato: c.id, campo: k }, 'perigo pequeno', `Registrar "${nome}" como perdido? A linha fica em vermelho, sem alerta geral.${adm ? '' : ' O administrador vai analisar.'}`)) : ''}</td></tr>`).join('');
  return `<div class="cartao" id="documentos"><div class="cabecalho"><h2>Contrato, Vistoria, Termos e Aditivos</h2>
      ${opera() && !R.fimDeVinculo(d(), c) ? link(`#/vistoria/novo?contrato=${c.id}&tipo=Saída`, 'Fazer vistoria de saída') : ''}</div>
    <div class="rolagem"><table>${linhas}</table></div>
    ${vistorias.length ? `<h3>Vistorias</h3><table><tr><th>Tipo</th><th>Data</th><th></th></tr>${vistorias.map((v) => `<tr><td>${esc(v.tipo)}</td><td>${dataBr(v.data)}</td>
      <td class="n nw">${link(`#/imprimir/vistoria?id=${v.id}`, 'Ver / imprimir')} ${opera() ? link(`#/vistoria/${v.id}`, 'Editar') : ''}
      ${podeUsuario('admin') ? botao('excluir', 'Excluir', { tabela: 'vistorias', id: v.id }, 'perigo pequeno', `Excluir a vistoria de ${v.tipo.toLocaleLowerCase('pt-BR')} de ${dataBr(v.data)}?`) : ''}</td></tr>`).join('')}</table>` : ''}
    <p id="vistoria">${c.vistoria_link ? `<a class="botao secundario pequeno" href="${esc(c.vistoria_link)}" target="_blank" rel="noopener noreferrer">Abrir a pasta das fotos da vistoria</a> <span class="suave">${esc(c.vistoria_link)}</span>`
    : '<span class="suave">Link das fotos da vistoria: use "Editar" e cole o link da pasta na nuvem (ou informe direto na vistoria).</span>'}</p>
    <p class="suave">Para marcar como assinado, escolha a data, anexe o arquivo assinado (PDF ou foto) e clique em "Marcar". Se ainda falta a assinatura de alguém, anexe o arquivo e clique em "Falta assinatura": fica um alerta até chegar o arquivo completo.</p>
    ${caixaAditivos(c)}</div>`;
}

/** Termos aditivos: depois do contrato (mudança de vencimento, garantia, valor etc.), cada um com o arquivo assinado. */
function caixaAditivos(c) {
  const lista = R.aditivosDo(d(), c.id);
  const abrir = (a) => `<a href="#" data-acao="abrirArquivo" data-escopo="aditivos" data-id="${a.contrato_id}" data-nome="${esc(a.arquivo)}">📎 ${esc(a.arquivo)}</a>`;
  const anteriores = R.cadeiaDeContratos(d(), c).antes.reverse().map((x) => [x, R.aditivosDo(d(), x.id)]).filter(([, l]) => l.length);
  const ant = R.contratoHerdado(d(), c);
  const aguardando = R.aditivosAguardando(d(), c.id);
  const ver = (a) => (a.texto ? link(`#/imprimir/aditivo?id=${a.id}`, 'Ver / PDF') : '');
  return `<div class="cabecalho"><h3 id="aditivos">Termos aditivos</h3>${opera() ? link(`#/aditivo/novo?contrato=${c.id}`, 'Gerar aditivo de vencimento') : ''}</div>
    ${ant && !lista.length ? `<div class="alerta perigo">Obrigatório: termo aditivo da troca de titular (${esc(ant.inquilino_nome)} → ${esc(c.inquilino_nome)}). Registre-o com o arquivo assinado.</div>` : ''}
    ${aguardando.length ? `<div class="alerta aviso"><b>Aguardando assinatura:</b> imprima ou baixe o PDF, colha as assinaturas e anexe o arquivo assinado.
      <div class="rolagem"><table>${aguardando.map((a) => `<tr><td class="nw">${dataBr(a.data)}</td><td>${esc(a.assunto)}</td>
      <td class="n nw">${ver(a)} ${opera() ? `${link(`#/aditivo/${a.id}`, 'Editar')} ${botao('excluir', 'Excluir', { tabela: 'aditivos', id: a.id }, 'perigo pequeno', `Excluir o termo aditivo de ${dataBr(a.data)} (ainda não assinado)?`)}` : ''}
      ${opera() ? `<form data-form="assinarAditivo" class="acoes" style="justify-content:flex-end;margin-top:4px"><input type="hidden" name="id" value="${a.id}">
        <input type="date" name="data" value="${C.hojeIso()}" style="width:auto" title="Data da assinatura">
        <label class="botao secundario pequeno enviar" title="Termo aditivo assinado (PDF ou foto)"><span data-nome-escolhido>Anexar</span><input type="file" name="arquivo" accept="application/pdf,image/*" data-arquivo-doc></label>
        <button class="pequeno">Marcar assinado</button></form>` : ''}</td></tr>`).join('')}</table></div></div>` : ''}
    ${lista.length ? `<div class="rolagem"><table><tr><th>Data</th><th>Assunto</th><th>Arquivo</th><th></th></tr>${lista.map((a) => `<tr><td class="nw">${dataBr(a.data)}</td><td>${esc(a.assunto)}</td><td>${abrir(a)}</td>
      <td class="n nw">${ver(a)} ${opera() ? botao('excluir', 'Excluir', { tabela: 'aditivos', id: a.id }, 'perigo pequeno', `Excluir o termo aditivo de ${dataBr(a.data)}? O arquivo assinado também é apagado.`) : ''}</td></tr>`).join('')}</table></div>`
    : '<p class="suave">Nenhum termo aditivo registrado.</p>'}
    ${anteriores.map(([x, l]) => `<details open><summary>Histórico: aditivos do contrato anterior de <a href="#/contrato/${x.id}?ir=aditivos">${esc(x.inquilino_nome)}</a> (${l.length})</summary>
      <div class="rolagem"><table>${l.map((a) => `<tr><td class="nw">${dataBr(a.data)}</td><td>${esc(a.assunto)}</td><td>${abrir(a)}</td></tr>`).join('')}</table></div></details>`).join('')}
    ${opera() ? `<form data-form="aditivo" class="acoes"><input type="hidden" name="contrato" value="${c.id}">
      <input type="date" name="data" value="${C.hojeIso()}" style="width:auto">
      <input name="assunto" placeholder="Assunto (ex.: troca do dia do vencimento para 15)" style="flex:1;min-width:240px">
      <label class="botao secundario pequeno enviar" title="Termo aditivo assinado (PDF ou foto)"><span data-nome-escolhido>Anexar</span><input type="file" name="arquivo" accept="application/pdf,image/*" data-arquivo-doc></label>
      <button class="secundario pequeno">Registrar aditivo</button></form>` : ''}`;
}

function telaContrato(c) {
  const i = buscar('imoveis', c.imovel_id);
  const hoje = C.hojeIso();
  const aluguel = R.aluguelAtual(d(), c);
  const pctBonif = R.percentualBonificacao(c);
  const desconto = C.descontoPorPercentual(aluguel, pctBonif);
  const alertas = R.contratoAtivo(c, hoje) ? R.alertasContrato(d(), c, hoje).filter((a) => !['A verificar', 'Documentos de entrada'].includes(a.tipo)) : [];
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
  // inquilino novo (até 2 meses da entrada): troca de titularidade e leitura dos relógios ficam acima dos boletos;
  // depois, vão para o fim da página, antes da saída. Ex.: entrada em 05/10/2026 → acima até 04/12/2026.
  const novo = !!c.data_entrada && hoje < C.somarMesesData(c.data_entrada, 2);
  // as duas caixas mudam de lugar juntas; a posição de "inquilino novo" e a de depois são arrumadas à parte (ícone ☰)
  const contas = `<div data-caixa="Titularidade e leituras · ${novo ? 'inquilino novo' : 'depois de 2 meses'}"><div class="cartao"><div class="cabecalho"><h2>Trocas de titularidade deste inquilino</h2>${opera() && i ? link(`#/novo/titularidades?imovel=${i.id}&contrato=${c.id}`, 'Registrar protocolo') : ''}</div>
      <table><tr><th>Data</th><th>Concessionária</th><th>Tipo</th><th>Protocolo</th><th>Situação</th></tr>
      ${d().titularidades.filter((t) => t.contrato_id === c.id).map((t) => `<tr><td>${dataBr(t.data)}</td><td>${esc(t.concessionaria)}</td><td>${esc(t.tipo || '-')}</td><td><b>${esc(t.protocolo || '-')}</b></td><td>${esc(t.situacao || '-')}</td></tr>`).join('') || '<tr><td colspan="5" class="suave">Nenhum protocolo registrado.</td></tr>'}</table></div>
    ${caixaLeituras(R.leiturasDo(d(), c.id), opera() && i ? link(`#/novo/leituras?imovel=${i.id}&contrato=${c.id}`, 'Registrar leitura') : '', false)}</div>`;
  return `<p class="suave">${i ? `<a href="#/imovel/${i.id}">← ${esc(i.nome)}</a> · ` : ''}<a href="#/inquilinos">Todos os inquilinos</a></p>
    <div class="cabecalho"><h1>${esc(c.inquilino_nome)}${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}</h1><div class="acoes">
      ${opera() ? link(`#/editar/contratos/${c.id}`, 'Editar', 'botao') : ''}
      ${link(`#/contrato/${c.id}?ir=documentos`, 'Contrato, Vistoria, Termos e Aditivos', 'botao secundario')}
      ${podeUsuario('admin') ? botao('excluir', 'Excluir', { tabela: 'contratos', id: c.id }, 'perigo', 'Excluir este contrato e todos os seus boletos?') : ''}</div></div>
    ${i ? `<div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>` : `<div class="alerta aviso">Sem imóvel vinculado. Use "Editar" para escolher o imóvel.${R.dataApagarSemImovel(c) ? ` Se não for vinculado, este contrato será apagado em <b>${dataBr(R.dataApagarSemImovel(c))}</b>.` : ''}</div>`}
    ${c.ativo === false ? `<div class="alerta info">Inquilino inativo: não gera boleto.</div>` : ''}
    ${R.geraNf(c) ? '' : `<div class="alerta controle"><b>Boleto de controle.</b> Este inquilino ${AVISO_CONTROLE} ${opera() ? botao('alternarNf', 'Passar a emitir NF', { id: c.id }, 'secundario pequeno', 'Este inquilino passa a emitir NF e a contar nos resultados?') : ''}</div>`}
    ${selosContrato(c)}
    ${atalhosDocumentos(c)}
    ${faixaDocumentosEntrada(c)}
    ${caixaVerificar(c.verificar)}
    ${outros.length ? `<div class="alerta info">Este inquilino também aluga: ${outros.map((x) => `<a href="#/contrato/${x.id}">${esc((buscar('imoveis', x.imovel_id) || {}).nome || 'sem imóvel')}</a>`).join(', ')}.</div>` : ''}
    ${cadeia.antes.length || cadeia.depois.length ? `<div class="alerta info">${cadeia.antes.length ? `Continua o contrato de ${cadeia.antes.map(lig).join(' → ')}. ` : ''}${cadeia.depois.length ? `Continuado por ${cadeia.depois.map(lig).join(' → ')}.` : ''}</div>` : ''}
    ${alertas.map((a) => `<div class="${classeAlerta(a)}"><b>${esc(a.tipo)}</b> ${esc(a.texto)}</div>`).join('')}
    <div class="cartao"><h2>Identificação e contato</h2><div class="grade">
      ${item('Telefone', `${esc(c.inquilino_telefone || '-')}${c.inquilino_whatsapp && tel ? ` <a class="etiqueta ok" target="_blank" rel="noopener" href="https://wa.me/${tel.length <= 11 ? `55${tel}` : tel}">WhatsApp</a>` : ''}`)}
      ${item('E-mail', c.inquilino_email ? `<a href="mailto:${esc(c.inquilino_email)}">${esc(c.inquilino_email)}</a>` : '-')}
      ${item('CPF / CNPJ', esc(c.inquilino_cpf || '-'))}${item('RG', esc(c.inquilino_rg || '-'))}
      ${c.responsavel_nome ? item('Outro contato', esc([c.responsavel_nome, c.responsavel_telefone, c.responsavel_email].filter(Boolean).join(' · '))) : ''}</div>
      ${pj ? `<h3>Representante da empresa</h3>${c.representante_nome ? `<p><b>${esc(c.representante_nome)}</b>${c.representante_cargo ? ` (${esc(c.representante_cargo)})` : ''} · ${pessoa('representante')}</p>` : '<div class="alerta aviso">Empresa sem representante cadastrado. Use "Editar".</div>'}` : ''}
      ${c.solidario_nome ? `<h3>Inquilino solidário</h3><p><b>${esc(c.solidario_nome)}</b> · ${pessoa('solidario')}</p><p class="suave">O boleto sai no nome do inquilino principal.</p>` : ''}</div>
    <div class="cartao"><h2>Contrato e valores</h2><div class="grade">
      ${item(R.fimDeVinculo(d(), c) ? 'Entrada / fim do vínculo' : 'Entrada / saída', `${dataBr(c.data_entrada)} a ${dataBr(c.data_saida)}`)}
      ${item('Contrato', `${dataBr(c.data_entrada || c.vigencia_inicio)} a ${c.prazo_tipo === 'Indeterminado' ? 'prazo indeterminado' : `${dataBr(c.vigencia_fim)}${c.prazo_meses ? ` (${c.prazo_meses} meses)` : ''}`}`)}
      ${item('Aluguel inicial (histórico)', reais(c.aluguel_inicial))}${item('Aluguel atual (cheio)', `<span class="maior">${reais(aluguel)}</span>`)}
      ${item('Bonificação de pontualidade', c.bonificacao === false ? 'não tem' : `${pct(pctBonif)} = ${reais(desconto)}`)}${item('Aluguel com bonificação', reais(aluguel - desconto))}
      ${item('Vencimento', `dia ${c.dia_vencimento} ${c.cobranca_mes_seguinte !== false ? 'do mês seguinte' : 'do próprio mês'}`)}${item('Taxa do boleto', reais(c.taxa_boleto))}
      ${item('Multa por atraso', pct(c.multa_percentual))}${item('Juros por atraso', `${pct(c.juros_mensal_percentual)} ao mês`)}
      ${item('NF', c.gerar_nf === false ? 'não emite (só controle do pagamento)' : 'emite')}
      ${car ? item('Carência', `${compBr(car[0])} a ${compBr(car[1])} · cobra: ${['iptu', 'seguro', 'taxa'].filter((k) => c[`carencia_cobrar_${k}`]).map((k) => ({ iptu: 'IPTU', seguro: 'seguro', taxa: 'tarifa' })[k]).join(', ') || 'nada'}`) : ''}</div>
      ${c.reserva_valor > 0 ? `<h3 id="reserva">Reserva dada na visita</h3><div class="grade">${item('Valor / data', `${reais(c.reserva_valor)} em ${dataBr(c.reserva_data)} · ${linkComprovante(c.id, c.comprovante_reserva, { tabela: 'contratos', id: c.id, campo: 'comprovante_reserva', tipo: 'reserva', data: c.reserva_data })}`)}${item('Usar no aluguel de', `${compBr(R.competenciaReserva(c))}${c.reserva_competencia ? '' : ' (primeiro aluguel)'}`)}${item('Saldo ainda não usado', reais(R.saldoReserva(d(), c)))}</div>
        ${caixaReservaAbatida(c)}` : ''}
      ${c.observacoes ? `<h3>Observações</h3><p class="pre">${esc(c.observacoes)}</p>` : ''}</div>
    ${caixaIncluso(c)}
    ${caixaRessarcimentos(c)}
    ${caixaSolicitacoes(c)}
    ${caixaGarantia(c)}
    ${novo ? contas : ''}
    ${caixaBoletosInquilino(c, cobs, hoje)}
    <div class="cartao"><div class="cabecalho"><h2>Correção anual do aluguel (${esc(c.indice_correcao || 'índice não informado')})</h2>${opera() ? link(`#/novo/correcoes?contrato=${c.id}`, 'Registrar correção') : ''}</div>
      ${(() => { const r = R.reajustePendente(d(), c); if (!r) { const p = R.mesDeAniversario(c); return p ? `<p class="suave">Reajuste no 13º mês (o mês de entrada conta como o 1º): aluguel de ${compBr(R.competenciaDoReajuste(c, Math.max(1, Math.floor(C.mesesEntre(p, C.competenciaDe(C.hojeIso())) / 12) + 1)))}.</p>` : ''; }
    return `<div class="alerta aviso"><b>Reajuste do aluguel de ${compBr(r.competencia)}</b> (${r.anos} ano(s)) ${botoesReajuste(c, r)}</div>`; })()}
      ${(() => { const m = R.correcoesRecalculadas(d(), c, c.aluguel_inicial); return m.length ? `<div class="alerta aviso"><b>As correções abaixo não batem com o aluguel inicial de ${reais(c.aluguel_inicial)}</b> (ex.: o inicial foi corrigido depois).
        Refeitas em cadeia: ${m.map((x) => `${dataBr(x.x.data_vigencia)} ${reais(x.x.valor_novo)} → <b>${reais(x.valor_novo)}</b>`).join('; ')}. O novo valor negociado fica como combinado.
        ${opera() ? `<div class="acoes" style="margin-top:6px">${botao('recalcularCorrecoes', 'Refazer as correções a partir do aluguel inicial', { id: c.id }, 'pequeno', 'Refazer as correções a partir do aluguel inicial? Os boletos em aberto são recalculados.')}</div>` : ''}</div>` : ''; })()}
      <table><tr><th>Vale a partir de</th><th>Previsto no contrato</th><th>Índice usado</th><th class="n">%</th><th class="n">Valor anterior</th><th class="n">Novo valor</th><th></th></tr>
      ${cadeia.antes.flatMap((x) => [`<tr class="suave"><td>${dataBr(x.vigencia_inicio)}</td><td colspan="4">Valor inicial · titular anterior: ${esc(x.inquilino_nome)}</td><td class="n">${reais(x.aluguel_inicial)}</td><td></td></tr>`,
    ...R.correcoesDo(d(), x.id).map((y) => `<tr class="suave"><td>${dataBr(y.data_vigencia)}</td><td>${esc(y.indice_contrato || '-')}</td><td>${esc(y.indice || '-')} <span class="suave">(${esc(x.inquilino_nome)})</span></td><td class="n">${pct(y.percentual)}</td><td class="n">${reais(y.valor_anterior)}</td><td class="n">${reais(y.valor_novo)}</td><td></td></tr>`)]).join('')}
      <tr><td>${dataBr(c.vigencia_inicio)}</td><td colspan="4" class="suave">${cadeia.antes.length ? 'Valor inicial deste titular (continuação do contrato)' : 'Valor inicial do contrato'}</td><td class="n">${reais(c.aluguel_inicial)}</td><td></td></tr>
      ${R.correcoesDo(d(), c.id).map((x) => `<tr><td>${dataBr(x.data_vigencia)}</td><td>${esc(x.indice_contrato || '-')}</td><td>${x.indice === 'Negociado' ? etiqueta('Negociado', 'aviso') : `${esc(x.indice || '-')}${x.data_indice ? ` <span class="suave">(${compBr(x.data_indice)})</span>` : ''}`}</td><td class="n">${pct(x.percentual)}</td><td class="n">${reais(x.valor_anterior)}</td><td class="n"><b>${reais(x.valor_novo)}</b></td><td class="n">${opera() ? botao('excluir', 'Excluir', { tabela: 'correcoes', id: x.id }, 'perigo pequeno', 'Excluir esta correção?') : ''}</td></tr>`).join('')}</table></div>
    <div class="cartao" id="renovacoes"><div class="cabecalho"><h2>Renovação e novo valor negociado</h2>${opera() ? link(`#/novo/renovacoes?contrato=${c.id}`, 'Registrar renovação / novo valor') : ''}</div>
      <p class="suave">No aniversário vale a correção pelo índice do contrato. No fim do prazo, o novo valor é negociado com o inquilino e registrado aqui.</p>
      <table><tr><th>Data</th><th>O que aconteceu</th><th>Novo término</th><th class="n">Novo valor</th><th>Obs.</th><th></th></tr>
      ${renovs.map((r) => `<tr><td>${dataBr(r.data)}</td><td>${esc(r.tipo)}</td><td>${dataBr(r.nova_vigencia_fim)}</td><td class="n">${r.novo_valor ? reais(r.novo_valor) : '-'}</td><td>${esc(r.observacoes || '')}</td>
        <td class="n">${opera() ? botao('excluirRenovacao', 'Excluir', { id: r.id }, 'perigo pequeno', `Excluir este registro${r.novo_valor ? ' e o novo valor negociado' : ''}? A data de término do contrato não volta sozinha: confira em "Editar".`) : ''}</td></tr>`).join('')
      || '<tr><td colspan="6" class="suave">Nenhuma renovação registrada.</td></tr>'}</table></div>
    ${caixaDocumentos(c)}
    ${caixaArquivos('contrato', c.id, `Arquivos do inquilino · 📁 ${c.pasta || nomePastaContrato(c)}`, 'arquivos', 'Fichas cadastrais, Documentos de Identificação, Consulta Serasa, Contra Vistorias')}
    ${novo ? '' : contas}
    ${caixaSaida(c)}
    ${caixaHistorico(`Histórico deste inquilino${historicoIds.size > 1 ? ' e dos contratos ligados' : ''}`, tabelaHistorico(ultimos((h) => historicoIds.has(h.contrato_id), 80)))}`;
}

// --------------------------------------------------------------------------
// Formulários de cadastro
// --------------------------------------------------------------------------
/** Opções das listas editáveis (concessionárias, índices) vêm do banco. */
const comListas = (campos) => campos.map((c) => (c.lista ? { ...c, opcoes: R.lista(d(), c.lista) } : c));

// --------------------------------------------------------------------------
/**
 * Uso da reserva: nos boletos do sistema e/ou marcada como já abatida em aluguéis antigos (fora do sistema).
 * Marcada: mostra o mês e o valor, com "Excluir registro" no lugar de "Reaplicar a reserva".
 */
function caixaReservaAbatida(c) {
  const usos = d().cobrancas.filter((x) => x.contrato_id === c.id && x.reserva_utilizada > 0);
  const ant = c.reserva_usada_anterior > 0 && R.contratoHerdado(d(), c);
  const nosBoletos = [usos.length ? `Abatida nos boletos: ${usos.map((x) => `${compBr(x.competencia)} ${reais(x.reserva_utilizada)}${x.data_pagamento ? ' (pago)' : ''}`).join('; ')}.` : '',
    ant ? `Já usada no contrato de ${esc(ant.inquilino_nome)}: ${reais(c.reserva_usada_anterior)}.` : ''].filter(Boolean).join(' ');
  if (c.reserva_abatida_valor > 0) {
    return `<div class="alerta ok"><b>Reserva já abatida</b> em ${compBr(c.reserva_abatida_comp)}: ${reais(c.reserva_abatida_valor)} (aluguel antigo, fora dos boletos do sistema).
      ${nosBoletos ? `<br>${nosBoletos}` : ''}
      ${opera() ? `<div class="acoes" style="margin-top:6px">${botao('desmarcarReservaAbatida', 'Excluir registro', { id: c.id }, 'perigo pequeno', 'Excluir o registro de reserva já abatida? A reserva volta a abater os boletos em aberto.')}</div>` : ''}</div>`;
  }
  const max = R.reservaParaMarcarAbatida(d(), c);
  return `${usos.length || ant ? `<p class="suave">${nosBoletos}</p>` : `<div class="alerta aviso"><b>Reserva ainda não abatida em nenhum boleto do sistema.</b> Se ela já foi abatida num aluguel antigo, marque abaixo o mês e o valor.</div>`}
    ${opera() ? `<div class="acoes">${botao('reaplicarReserva', 'Reaplicar a reserva nos boletos em aberto', { id: c.id }, 'secundario pequeno')}</div>
      ${max > 0 ? `<form data-form="reservaAbatida" class="acoes" style="margin-top:6px"><input type="hidden" name="contrato" value="${c.id}">
        <label class="suave" style="margin:0">Abatida em</label><input type="month" name="competencia" value="${esc(R.competenciaReserva(c) || '')}" style="width:auto" required>
        <label class="suave" style="margin:0">valor R$</label><input name="valor" value="${esc(C.reais(max, false))}" style="width:120px" required>
        <button class="secundario pequeno">Marcar como já abatida</button></form>` : ''}` : ''}`;
}

// Comprovantes (caução, depósito, reserva, aplicação e complemento da caução): PDF ou foto na pasta do inquilino.
// O valor pode ser salvo sem o comprovante: fica um alerta para buscar no banco e anexar depois.
// --------------------------------------------------------------------------
const COMPROVANTES_CONTRATO = [
  { campo: 'comprovante_caucao', valor: 'caucao_valor', data: 'caucao_data', nome: 'caucao', texto: 'do depósito da caução', vale: (x) => x.garantia_tipo === 'Caução' },
  { campo: 'comprovante_deposito', valor: 'deposito_valor', data: 'deposito_data', nome: 'deposito-garantia', texto: 'do depósito de garantia', vale: (x) => R.temDeposito(x) },
  { campo: 'comprovante_reserva', valor: 'reserva_valor', data: 'reserva_data', nome: 'reserva', texto: 'da reserva', vale: () => true },
];
const COMPROVANTE_APLICACAO = [{ campo: 'comprovante', valor: 'valor', data: 'data', nome: 'aplicacao-garantia', texto: 'da aplicação', vale: () => true }];
const COMPROVANTE_COMPLEMENTO = [{ campo: 'comprovante', valor: 'complemento', data: 'data', nome: 'complemento-caucao', texto: 'do complemento da caução', vale: () => true }];
const arquivoEscolhido = (form, campo) => { const el = form.querySelector(`[name="${campo}"]`); return (el && el.files && el.files[0]) || null; };

/** Valor mudou e nenhum arquivo novo foi escolhido: o comprovante antigo não vale mais (volta o alerta para anexar). */
function conferirComprovantes(lista, dados, r, form) {
  for (const k of lista) {
    if (r && r[k.campo] && r[k.valor] !== dados[k.valor] && !arquivoEscolhido(form, k.campo)) dados[k.campo] = null;
  }
}

/** Nome do arquivo do comprovante (ex.: comprovante-caucao-2026-10-05.pdf). */
const nomeComprovante = (tipo, data, arq) => `comprovante-${tipo}-${data || C.hojeIso()}${extensao(arq.name)}`;

/** Grava na pasta os comprovantes escolhidos e guarda o nome do arquivo no registro. */
async function guardarComprovantes(lista, dados, form, pasta) {
  for (const k of lista) {
    const arq = arquivoEscolhido(form, k.campo);
    if (!arq || !k.vale(dados) || !(dados[k.valor] > 0)) continue;
    dados[k.campo] = await S.salvarArquivo(await pasta(), new File([arq], nomeComprovante(k.nome, dados[k.data], arq)));
  }
}

/**
 * Link para abrir o comprovante guardado na pasta do inquilino. Sem comprovante: etiqueta e, com ``anexo``
 * ({ tabela, id, campo, tipo, data }), o botão para anexar depois.
 */
// sem comprovante: um só botão pequeno "⚠ anexar" (antes: etiqueta "sem comprovante: buscar no banco" + botão grande)
const linkComprovante = (contratoId, nome, anexo = null) => (nome ? `<a href="#" data-acao="abrirArquivo" data-escopo="contrato" data-id="${contratoId}" data-nome="${esc(nome)}" title="${esc(nome)}">📎 comprovante</a>`
  : anexo && opera() ? `<label class="anexar-falta" title="Sem comprovante: buscar no banco e anexar (PDF ou foto)">⚠ anexar comprovante<input type="file" accept="application/pdf,image/*"
    data-acao-arquivo="anexarComprovante" data-contrato="${contratoId}" data-tabela="${anexo.tabela}" data-id="${anexo.id}" data-campo="${anexo.campo}" data-tipo="${anexo.tipo}" data-data="${esc(anexo.data || '')}"></label>`
    : etiqueta('sem comprovante', 'aviso'));

let antesDoVinculo = null;
let fiadoresMudancas = { novos: [], alterados: [] };
/** Fiadores que entram, saem ou são corrigidos na troca de garantia (preenchido em ajustar, usado em salvar). */
let fiadoresDaTroca = { novos: [], saem: [], alterados: [] };
let avisoAditivo = '';
/** Pagamento com valor diferente do previsto, esperando o valor da NF na página do boleto (nada é salvo antes). */
let pagamentoDivergente = null;
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
      // o Estado vem do CEP (ex.: 82210-050 → PR); sem CEP, fica o que foi digitado
      dados.uf = C.ufDoCep(dados.cep) || (dados.uf ? dados.uf.toUpperCase() : null);
      if (d().imoveis.some((x) => x.id !== (r && r.id) && S.limparNome(x.nome) === dados.pasta)) erros.nome = 'Já existe um imóvel com este nome';
    },
    async depois(salvo, antigo) {
      if (antigo && antigo.pasta && antigo.pasta !== salvo.pasta) await renomearNoDisco([], antigo.pasta, salvo.pasta);
    },
  },
  ressarcimentos: {
    titulo: (r, q) => `Ressarcimento de condomínio - ${buscar('contratos', r ? r.contrato_id : q.contrato).inquilino_nome}`,
    campos: () => F.RESSARCIMENTO,
    padrao: () => ({ competencia_condominio: C.somarMeses(C.competenciaDe(C.hojeIso()), -1) }),
    fixos: (r, q) => (r ? {} : { contrato_id: Number(q.contrato) }),
    aviso: () => 'Taxas extraordinárias do condomínio são do proprietário (Lei 8.245/91, art. 22, X): fundo de obras, constituição do fundo de reserva, obras na estrutura, pintura de fachada, equipamentos de segurança, paisagismo das áreas comuns, indenizações trabalhistas de antes da locação. Se o inquilino pagou no boleto do condomínio, o valor volta para ele no boleto do aluguel.',
    ajustar(dados, erros, r, form, q) {
      const c = buscar('contratos', r ? r.contrato_id : q.contrato);
      if (dados.valor !== null && dados.valor <= 0) erros.valor = 'Informe o valor';
      if (dados.descricao === 'Outra' && !dados.detalhe) erros.detalhe = 'Diga qual é a taxa';
      if (!dados.competencia_abatimento && dados.data_pagamento) dados.competencia_abatimento = R.competenciaDoAbatimento(c, dados.data_pagamento);
      const cb = R.boletoDoMes(d(), c.id, dados.competencia_abatimento);
      if (cb && cb.data_pagamento && (!r || r.competencia_abatimento !== dados.competencia_abatimento)) {
        erros.competencia_abatimento = `O boleto de ${compBr(dados.competencia_abatimento)} já foi pago. Escolha o próximo boleto em aberto`;
      }
      if (dados.detalhe) dados.descricao = `${dados.descricao === 'Outra' ? '' : `${dados.descricao}: `}${dados.detalhe}`;
    },
    salvar(db, dados, q, r) {
      const anterior = r ? r.competencia_abatimento : null;
      let salvo;
      if (r) { R.atualizar(db, 'ressarcimentos', r.id, dados, login(), `Ressarcimento de condomínio ${dados.descricao}`); salvo = R.buscar(db, 'ressarcimentos', r.id); }
      else salvo = R.inserir(db, 'ressarcimentos', dados, login(), `Ressarcimento de condomínio ${dados.descricao}`);
      const c = R.buscar(db, 'contratos', salvo.contrato_id);
      for (const comp of new Set([anterior, salvo.competencia_abatimento].filter(Boolean))) R.aplicarRessarcimentos(db, c, comp, login());
      R.marcarCondominioConferido(db, c.id, salvo.competencia_condominio, login());
      return salvo;
    },
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}?ir=ressarcimentos`,
  },
  solicitacoes: {
    titulo: (r) => (r ? 'Solicitação do inquilino' : 'Nova solicitação do inquilino'),
    // inquilino escolhido na lista (ativos, em ordem de nome); vindo da tela Inquilinos, já vem marcado
    campos: (r) => {
      const ops = d().contratos.filter((c) => (r && c.id === r.contrato_id) || (c.ativo !== false && R.contratoAtivo(c, C.hojeIso())))
        .sort((a, b) => a.inquilino_nome.localeCompare(b.inquilino_nome, 'pt-BR'))
        .map((c) => { const i = c.imovel_id ? buscar('imoveis', c.imovel_id) : null; return [String(c.id), `${c.inquilino_nome}${i ? ` · ${i.nome}` : ''}`]; });
      return [{ nome: 'contrato_id', rotulo: 'Inquilino', tipo: 'opcao', obrig: true, opcoes: ops }, ...F.SOLICITACAO];
    },
    padrao: (q) => ({ data: C.hojeIso(), contrato_id: q.contrato || '' }),
    voltar: (r, q) => ({ inquilinos: '#/inquilinos', solicitacoes: '#/solicitacoes' }[q && q.de]
      || (r || (q && q.contrato) ? `#/contrato/${r ? r.contrato_id : q.contrato}?ir=solicitacoes` : '#/solicitacoes')),
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
      return `${r ? 'Editar' : 'Novo'} contrato${i ? ` - ${i.nome}` : ''}`;
    },
    campos: (r, q = {}) => {
      const ops = d().contratos.filter((c) => !r || c.id !== r.id)
        .sort((a, b) => a.inquilino_nome.localeCompare(b.inquilino_nome, 'pt-BR'))
        .map((c) => [String(c.id), `${c.inquilino_nome} (${dataBr(c.data_entrada)} a ${dataBr(c.data_saida)})`]);
      const hoje = C.hojeIso();
      const vago = (i) => !d().contratos.some((c) => c.imovel_id === i.id && R.contratoAtivo(c, hoje) && (!r || c.id !== r.id));
      const imoveis = ordenar(d().imoveis, 'nome').map((i) => [String(i.id), `${i.nome}${!r && vago(i) ? ' · vago' : ''}`]);
      // fiadores do contrato (não os da troca de garantia) vêm preenchidos para alterar, e mais um bloco em branco (incluir)
      const fiadores = r ? R.fiadoresDoContrato(d(), r.id) : [];
      // contrato novo: escolhe o imóvel aqui mesmo (pelo "Vincular inquilino" do imóvel, o vínculo vem depois)
      const imovelNoNovo = (c) => c.nome === 'imovel_id' && !q.vincular;
      return comListas(F.CONTRATO.flatMap((c) => (c.fiador ? (c.fiador === 1 && c.secao ? F.fiadoresNoCadastro(fiadores) : []) : [c]))
        .filter((c) => (r ? !c.soNovo : !c.soEditar || imovelNoNovo(c)))
        .map((c) => (c.nome === 'contrato_anterior_id' ? { ...c, opcoes: ops }
          : c.nome === 'imovel_id' ? { ...c, opcoes: imoveis, ...(r ? {} : { ajuda: 'Escolha o imóvel deste inquilino. Em branco: sem imóvel (não gera boleto)' }) } : c)));
    },
    // cada contrato é único: nada vem do inquilino anterior do imóvel, todas as condições são escolhidas de novo
    // a mesma pessoa em outro imóvel (q.pessoa): só os dados da pessoa vêm preenchidos
    padrao: (q) => ({ ...(q.pessoa ? R.dadosDaPessoa(buscar('contratos', q.pessoa)) : {}), ...(q.imovel ? { imovel_id: Number(q.imovel) } : {}) }),
    compacto: true,
    valores: (r) => ({ ...r, ativo: r.ativo !== false, gerar_nf: r.gerar_nf !== false, bonificacao: r.bonificacao !== false,
      conta_iptu: r.conta_iptu || (r.cobrar_iptu ? R.SITUACOES[0] : R.SITUACOES[1]), conta_seguro: r.conta_seguro || (r.cobrar_seguro === false ? R.SITUACOES[1] : R.SITUACOES[0]),
      inquilino_tipo: r.inquilino_tipo || 'Pessoa física', prazo_meses: r.prazo_meses || C.mesesDoPrazo(r.data_entrada || r.vigencia_inicio, r.vigencia_fim) || C.mesesDoPrazo(r.vigencia_inicio, r.vigencia_fim),
      aluguel_bonificado: r.bonificacao === false ? null : inicialBonificado(r),
      ...Object.fromEntries(R.fiadoresDoContrato(d(), r.id).flatMap((f, k) => F.CAMPOS_FIADOR.map((x) => [`fiador${k + 1}_${x.nome}`, f[x.nome] ?? null]))) }),
    conferir: conferirContrato,
    aviso: (r, q) => (!r && q && q.pessoa ? `Contrato novo de ${buscar('contratos', q.pessoa).inquilino_nome} para este imóvel: os dados da pessoa já vieram preenchidos. Escolha as condições deste contrato (cada contrato é único).`
      : r ? 'Mudou o dia do vencimento ou a garantia? Isso exige termo aditivo: depois de salvar, registre o termo assinado em "Termos aditivos" (botão "Contrato, Vistoria, Termos e Aditivos" na página do inquilino).' : ''),
    voltar: (r, q) => (r ? `#/contrato/${r.id}` : q.vincular ? `#/novo/vinculos?imovel=${q.vincular}` : q.imovel ? `#/imovel/${q.imovel}` : '#/inquilinos'),
    descricao: (dados, r) => dados.inquilino_nome || (r && r.inquilino_nome),
    ajustar(dados, erros, r, form, q = {}) {
      // troca de titular: garantia, aluguel, bonificação, boleto e reserva são os do contrato (travados no formulário)
      const anteriorHerdado = r ? R.contratoHerdado(d(), r) : dados.contrato_anterior_id && buscar('contratos', dados.contrato_anterior_id);
      const herdado = !!anteriorHerdado;
      if (r && herdado) for (const k of CAMPOS_GARANTIA_HERDADA) dados[k] = r[k] ?? null;
      if (herdado) {
        const fonte = r || { ...anteriorHerdado, ...R.condicoesDoContrato(d(), anteriorHerdado, dados.data_entrada) };
        for (const k of CAMPOS_VALORES_HERDADOS) {
          if (['aluguel_bonificado', 'comprovante_reserva'].includes(k)) continue;
          dados[k] = ['bonificacao', 'cobranca_mes_seguinte'].includes(k) ? fonte[k] !== false : fonte[k] ?? null;
        }
      }
      // o aluguel com bonificação digitado é o do aluguel inicial (histórico): o % sai sobre ele e vale também para o aluguel corrigido
      const base = dados.aluguel_inicial;
      const bonificadoTexto = String(new FormData(form).get('aluguel_bonificado') || '').trim();
      if (dados.bonificacao && bonificadoTexto && !herdado) {
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
        // o prazo conta da data de vigência inicial (sem ela, da data do contrato)
        else if (dados.data_entrada || dados.vigencia_inicio) dados.vigencia_fim = C.fimDoPrazo(dados.data_entrada || dados.vigencia_inicio, dados.prazo_meses);
      }
      if (dados.carencia_meses < 0) erros.carencia_meses = 'Valor inválido';
      if (dados.inquilino_tipo === 'Pessoa jurídica (empresa)' && !dados.representante_nome) erros.representante_nome = 'Empresa precisa do representante (pessoa física)';
      // sem o nome, não há solidário: o resto da parte dele fica em branco
      if (!dados.solidario_nome) for (const k of Object.keys(dados)) if (k.startsWith('solidario_')) dados[k] = null;
      // só "por conta do inquilino" entra no boleto
      dados.cobrar_iptu = dados.conta_iptu === R.SITUACOES[0];
      dados.cobrar_seguro = dados.conta_seguro === R.SITUACOES[0];
      // fiadores do contrato no próprio cadastro: os já cadastrados podem ser alterados; os blocos em branco incluem novos
      // (excluir é na página do inquilino; quem entra depois é pela troca de garantia)
      const existentes = r ? R.fiadoresDoContrato(d(), r.id) : [];
      fiadoresMudancas = { novos: [], alterados: [] };
      for (let n = 1; n <= F.vagasFiador(existentes); n += 1) {
        const f = Object.fromEntries(F.CAMPOS_FIADOR.map((c) => [c.nome, dados[`fiador${n}_${c.nome}`] ?? null]));
        F.CAMPOS_FIADOR.forEach((c) => delete dados[`fiador${n}_${c.nome}`]);
        const atual = existentes[n - 1];
        if (atual) {
          if (!R.temFiador(dados)) continue; // a garantia deixou de ter fiador: o cadastro dele fica como está
          if (!f.nome) erros[`fiador${n}_nome`] = 'Informe o nome do fiador (para excluir, use "Excluir" no fiador, na página do inquilino)';
          else if (f.data_entrada && f.data_saida && f.data_saida < f.data_entrada) erros[`fiador${n}_data_saida`] = 'O fim do vínculo não pode ser antes do início';
          else if (F.CAMPOS_FIADOR.some((c) => String(atual[c.nome] ?? '') !== String(f[c.nome] ?? ''))) fiadoresMudancas.alterados.push({ id: atual.id, ...f });
          continue;
        }
        // a nacionalidade já vem preenchida ("brasileira"): sozinha não conta como fiador digitado
        const algum = Object.entries(f).some(([k, v]) => v && k !== 'nacionalidade');
        if (!algum || !R.temFiador(dados)) continue;
        if (!f.nome) erros[`fiador${n}_nome`] = 'Informe o nome do fiador';
        else fiadoresMudancas.novos.push(f);
      }
      conferirComprovantes(COMPROVANTES_CONTRATO, dados, r, form);
      avisoAditivo = '';
      // "Possui termo aditivo" só aparece quando um termo assinado é anexado
      if (r && (dados.dia_vencimento !== r.dia_vencimento || (r.garantia_tipo && dados.garantia_tipo !== r.garantia_tipo))) {
        avisoAditivo = `Você mudou ${dados.dia_vencimento !== r.dia_vencimento ? 'o dia do vencimento' : 'a garantia'}: registre o termo aditivo assinado em "Termos aditivos" (botão "Contrato, Vistoria, Termos e Aditivos" na página do inquilino), anexando o arquivo.`;
      }
      dados.pasta = nomePastaContrato({ ...r, ...dados });
      // sem imóvel: conta o prazo de 7 dias para vincular (depois o contrato é apagado sozinho)
      const imovelFinal = r ? dados.imovel_id : dados.imovel_id || Number(q.imovel) || null;
      dados.sem_imovel_desde = imovelFinal ? null : (r && !r.imovel_id && r.sem_imovel_desde) || C.hojeIso();
      // "Usar o endereço do imóvel": o endereço do inquilino fica igual ao do imóvel
      const imovelEndereco = buscar('imoveis', imovelFinal || q.vincular);
      // caução: data prevista = data do contrato; valor = aluguéis × aluguel com bonificação (se não foi digitado)
      if (dados.garantia_tipo === 'Caução') R.completarCaucao(dados);
      if (R.temDeposito(dados) && !dados.deposito_data) dados.deposito_data = dados.vigencia_inicio || null;
      for (const [caixa, campoEnd] of ENDERECO_DO_IMOVEL) {
        if (new FormData(form).get(caixa) !== '1' || (caixa.startsWith('solidario') && !dados.solidario_nome) || (caixa.startsWith('representante') && dados.inquilino_tipo !== 'Pessoa jurídica (empresa)')) continue;
        if (imovelEndereco) dados[campoEnd] = enderecoInquilino(imovelEndereco);
        else erros[campoEnd] = 'Escolha o imóvel para usar o endereço dele';
      }
    },
    confirmar: confirmarValoresIniciais,
    // contrato já salvo: grava na pasta atual (se o nome mudar, a pasta inteira é renomeada depois); contrato novo: na pasta que ele vai ter
    async ajustarAsync(dados, erros, r, form) {
      const pasta = r ? () => pastaDoEscopo('contrato', r.id)
        : async () => S.subpasta(await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true }), [pastaPaiContrato(dados), dados.pasta]);
      await guardarComprovantes(COMPROVANTES_CONTRATO, dados, form, pasta);
    },
    salvar(db, dados, q, r) {
      let c;
      if (r) {
        const inicialMudou = dados.aluguel_inicial !== r.aluguel_inicial;
        R.atualizar(db, 'contratos', r.id, dados, login(), dados.inquilino_nome);
        c = R.buscar(db, 'contratos', r.id);
        // aluguel inicial corrigido: os reajustes já lançados são refeitos a partir dele (o aluguel atual e a caução sugerida acompanham)
        if (inicialMudou) R.recalcularCorrecoes(db, c.id, login());
      } else c = R.inserir(db, 'contratos', { ...dados, docs_entrada: true }, login(), dados.inquilino_nome);
      const { novos, alterados } = fiadoresMudancas;
      for (const { id, ...f } of alterados) R.atualizar(db, 'fiadores', id, f, login(), `Fiador ${f.nome}`);
      for (const f of novos) R.inserir(db, 'fiadores', { ...f, contrato_id: c.id }, login(), `Fiador ${f.nome}`);
      fiadoresMudancas = { novos: [], alterados: [] };
      return c;
    },
    recalcular: (salvo) => (cb) => cb.contrato_id === salvo.id,
    async depois(salvo, antigo) {
      if (avisoAditivo) aviso(avisoAditivo, 'aviso');
      avisoAditivo = '';
      // troca de titular com o termo aditivo já assinado: vai para "Termos aditivos" do novo contrato
      const cont = continuacao;
      continuacao = null;
      if (!antigo && salvo.contrato_anterior_id) await trazerHeranca(salvo.id);
      if (!antigo && cont && cont.arquivo && salvo.contrato_anterior_id === cont.anteriorId) {
        const anterior = buscar('contratos', cont.anteriorId);
        const assunto = `Troca de titular: ${anterior ? anterior.inquilino_nome : 'inquilino anterior'} → ${salvo.inquilino_nome}`;
        const nome = await salvarAssinado('aditivos', salvo.id, cont.arquivo, `termo aditivo ${cont.data} troca de titular`);
        await alterar((db) => R.registrarAditivo(db, salvo.id, { data: cont.data, assunto, arquivo: nome }, login()));
        aviso('Termo aditivo da troca de titular registrado.');
      }
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
    destino: (salvo, q) => (q.vincular ? `#/novo/vinculos?imovel=${q.vincular}&contrato=${salvo.id}` : `#/contrato/${salvo.id}`),
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
    // arquivo da apólice obrigatório (na edição, só se ainda não tiver); outros arquivos opcionais
    extraHtml: (r) => `<h3>Arquivos do seguro</h3><div class="formulario">
      <div><label>Arquivo da apólice${r && r.arquivo_apolice ? '' : ' *'}</label><input type="file" name="arquivo_apolice" accept="application/pdf,image/*">
        ${r && r.arquivo_apolice ? F.arquivoGuardado('arquivo_apolice', r.arquivo_apolice) : '<small class="suave">Obrigatório: PDF ou foto da apólice.</small>'}</div>
      <div><label>Outros arquivos (opcional)</label><input type="file" name="outros_arquivos" multiple>
        <small class="suave">Ex.: boleto do seguro, proposta, comprovante de pagamento.</small></div></div>`,
    ajustar(dados, erros, r, form) {
      const arq = form.querySelector('[name=arquivo_apolice]').files[0];
      if (!arq && !(r && r.arquivo_apolice)) throw new Error('Anexe o arquivo da apólice para salvar o seguro obrigatório.');
    },
    async ajustarAsync(dados, erros, r, form, q) {
      const imovelId = r ? r.imovel_id : Number(q.imovel);
      const pasta = await pastaDoEscopo('seguro', imovelId);
      const vig = `${dados.vigencia_inicio}-a-${dados.vigencia_fim}`;
      const arq = form.querySelector('[name=arquivo_apolice]').files[0];
      if (arq) dados.arquivo_apolice = await S.salvarArquivo(pasta, new File([arq], `apolice-${vig}${extensao(arq.name)}`));
      const outros = [...form.querySelector('[name=outros_arquivos]').files];
      if (outros.length) {
        const nomes = [];
        for (const a of outros) {
          const nome = `seguro-${vig}-${semAcentoArquivo(a.name)}`;
          nomes.push(await S.salvarArquivo(pasta, new File([a], nome)));
        }
        dados.outros_arquivos = [...((r && r.outros_arquivos) || []), ...nomes];
      }
    },
    recalcular: (salvo, db) => (cb) => (R.buscar(db, 'contratos', cb.contrato_id) || {}).imovel_id === salvo.imovel_id,
    voltar: (r, q) => `#/imovel/${r ? r.imovel_id : q.imovel}`,
    descricao: (dados, r) => `Seguro obrigatório: ${[dados.seguradora, dados.apolice ? `apólice ${dados.apolice}` : ''].filter(Boolean).join(', ') || 'apólice'}, vigência ${dataBr(dados.vigencia_inicio)} a ${dataBr(dados.vigencia_fim)}`
      + `${dados.arquivo_apolice && dados.arquivo_apolice !== (r && r.arquivo_apolice) ? ` · arquivo ${dados.arquivo_apolice}` : ''}${dados.outros_arquivos && dados.outros_arquivos.length ? ` · ${dados.outros_arquivos.length - ((r && r.outros_arquivos) || []).length} outro(s) arquivo(s)` : ''}`,
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
    async depois(salvo, antigo) {
      if (antigo) return;
      try {
        const n = await guardarGuiasSoltas(salvo.imovel_id, salvo.ano);
        if (n) aviso(`${n} guia(s) já anexada(s) foram para o histórico do IPTU do ano anterior. Anexe a guia de ${salvo.ano} no IPTU ${salvo.ano}.`, 'info');
      } catch (e) {
        aviso(`Não consegui mover as guias antigas para o histórico: ${e.message}`, 'aviso');
      }
    },
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
    campos: () => F.APLICACAO.map((c) => (c.nome === 'emitente_id' ? { ...c, opcoes: [...d().emitentes.filter((e) => e.ativo).map((e) => [String(e.id), e.nome]), ['-1', 'Outra pessoa (depositado na conta de…)']] }
      : c.nome === 'recebedor' ? { ...c, sugestoes: R.recebedoresUsados(d()) } : c)),
    fixos: (r, q) => (r ? {} : { contrato_id: Number(q.contrato) }),
    valores: (r) => (r && r.recebedor ? { ...r, emitente_id: -1 } : r),
    padrao: (q) => {
      const s = R.situacaoAplicacao(d(), buscar('contratos', q.contrato));
      return { data: C.hojeIso(), valor: s.falta > 0 ? s.falta : null };
    },
    aviso: (r, q) => { const s = R.situacaoAplicacao(d(), buscar('contratos', q.contrato)); return `Garantia ${reais(s.total)}: aplicado ${reais(s.soma)}${s.linhas.length ? ` (${s.linhas.map((l) => `${l.emitente.nome} ${reais(l.aplicado)}`).join('; ')})` : ''}, falta ${reais(Math.max(s.falta, 0))}. Pode aplicar tudo num lugar só. Na saída, a devolução sai de onde foi depositado.`; },
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}`,
    descricao: (dados) => `Garantia aplicada: ${reais(dados.valor)}${dados.comprovante ? ` · comprovante ${dados.comprovante}` : ''}`,
    ajustar(dados, erros, r, form) {
      // outra pessoa: guarda o nome (sem empresa); empresa: sem nome de pessoa
      if (dados.emitente_id === -1) {
        dados.recebedor = String(dados.recebedor || '').trim();
        if (!dados.recebedor) erros.recebedor = 'Informe o nome de quem recebeu o depósito';
        dados.emitente_id = null;
      } else dados.recebedor = '';
      return conferirComprovantes(COMPROVANTE_APLICACAO, dados, r, form);
    },
    ajustarAsync: (dados, erros, r, form, q) => guardarComprovantes(COMPROVANTE_APLICACAO, dados, form, () => pastaDoEscopo('contrato', r ? r.contrato_id : Number(q.contrato))),
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
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); return R.garantiaDepositada(c) ? `Caução atual: ${reais(R.valorGarantia(d(), c))}${c.caucao_meses ? ` (${c.caucao_meses} aluguéis com bonificação)` : ''}.`
      : `Caução ainda não registrada (depositado ${reais(R.somaDepositos(d(), c, 'caucao'))} de ${reais(c.caucao_valor)}): a correção vale depois que o valor inicial for depositado; o complemento é o que passa do valor inicial.`; },
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    descricao: (dados) => `Caução corrigida para ${reais(dados.valor_novo)}`,
    ajustar(dados, erros, r, form, q) {
      const c = buscar('contratos', q.contrato);
      // caução ainda não depositada inteira: corrige o valor a depositar (o complemento entra nos depósitos, sem comprovante próprio)
      const antes = !R.garantiaDepositada(c);
      const anterior = antes ? R.garantiaADepositar(d(), c, 'caucao').combinado : R.valorGarantia(d(), c);
      dados.valor_anterior = anterior;
      dados.antes_do_deposito = antes;
      if (dados.complemento === null) dados.complemento = dados.valor_novo - anterior;
      conferirComprovantes(COMPROVANTE_COMPLEMENTO, dados, r, form);
    },
    ajustarAsync: (dados, erros, r, form, q) => guardarComprovantes(COMPROVANTE_COMPLEMENTO, dados, form, () => pastaDoEscopo('contrato', Number(q.contrato))),
  },
  trocas_garantia: {
    titulo: (r, q) => `Trocar garantia ou fiador - ${buscar('contratos', q.contrato).inquilino_nome}`,
    campos: (r, q) => comListas(F.trocaGarantia(R.fiadoresDo(d(), Number(q.contrato)))),
    padrao: (q) => {
      const c = buscar('contratos', q.contrato);
      // fiadores atuais preenchidos (tf1_, tf2_...); com fiador hoje, a nova garantia já vem igual (troca de fiador)
      const atuais = Object.fromEntries(R.fiadoresDo(d(), c.id).flatMap((f, k) => F.CAMPOS_FIADOR_TROCA.map((x) => [`tf${k + 1}_${x.nome}`, f[x.nome] ?? null])));
      return { data: C.hojeIso(), caucao_meses: c.caucao_meses || null, ...(R.temFiador(c) ? { garantia_tipo: c.garantia_tipo, deposito_valor: c.deposito_valor ?? null,
        deposito_data: c.deposito_data ?? null, deposito_uso: c.deposito_uso ?? null } : {}), ...atuais };
    },
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); const v = R.valorGarantia(d(), c); return `Garantia atual: ${c.garantia_tipo || 'não informada'}${v ? ` de ${reais(v)}` : ''}. Ela fica guardada no histórico do contrato. A troca exige termo aditivo: depois de salvar, registre o termo assinado em "Termos aditivos" (botão "Contrato, Vistoria, Termos e Aditivos" na página do inquilino).`; },
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    destino: (salvo, q) => `#/contrato/${q.contrato}`,
    ajustar(dados, erros, r, form, q) {
      if (dados.garantia_tipo === 'Caução' && !(dados.caucao_valor > 0)) erros.caucao_valor = 'Informe o valor da caução';
      if (R.temDeposito(dados) && !(dados.deposito_valor > 0)) erros.deposito_valor = 'Informe o valor do depósito';
      // fiadores: os atuais (tfN_) podem ser corrigidos ou sair; os blocos em branco (tnN_) incluem os novos
      const atuais = R.fiadoresDo(d(), Number(q.contrato));
      const fd = new FormData(form);
      const pega = (p) => { const f = Object.fromEntries(F.CAMPOS_FIADOR_TROCA.map((c) => [c.nome, dados[`${p}_${c.nome}`] ?? null])); F.CAMPOS_FIADOR_TROCA.forEach((c) => delete dados[`${p}_${c.nome}`]); return f; };
      fiadoresDaTroca = { novos: [], saem: [], alterados: [] };
      const comFiador = R.temFiador(dados);
      atuais.forEach((atual, k) => {
        const f = pega(`tf${k + 1}`);
        delete dados[`tf${k + 1}_sai`];
        if (!comFiador) return;
        if (fd.get(`tf${k + 1}_sai`) === '1') { fiadoresDaTroca.saem.push(atual.id); return; }
        if (!f.nome) erros[`tf${k + 1}_nome`] = 'Informe o nome do fiador (ou marque que ele sai nesta troca)';
        else if (F.CAMPOS_FIADOR_TROCA.some((c) => String(atual[c.nome] ?? '') !== String(f[c.nome] ?? ''))) fiadoresDaTroca.alterados.push({ id: atual.id, ...f });
      });
      for (let n = 1; n <= F.NOVOS_FIADORES_TROCA; n += 1) {
        const f = pega(`tn${n}`);
        // a nacionalidade já vem preenchida ("brasileira"): sozinha não conta como fiador digitado
        if (!comFiador || !Object.entries(f).some(([k, v]) => v && k !== 'nacionalidade')) continue;
        if (!f.nome) erros[`tn${n}_nome`] = 'Informe o nome do fiador novo';
        else fiadoresDaTroca.novos.push(f);
      }
      if (comFiador && atuais.length - fiadoresDaTroca.saem.length + fiadoresDaTroca.novos.length < 1) erros.garantia_tipo = 'Com fiador, fica pelo menos um: preencha o fiador novo ou desmarque quem sai';
    },
    ajustarAsync: (dados, erros, r, form, q) => guardarComprovantes(COMPROVANTES_CONTRATO.slice(0, 2), dados, form, () => pastaDoEscopo('contrato', Number(q.contrato))),
    salvar: (db, dados, q) => {
      const t = R.trocarGarantia(db, Number(q.contrato), dados, login(), fiadoresDaTroca);
      fiadoresDaTroca = { novos: [], saem: [], alterados: [] };
      return t;
    },
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
    aviso: () => 'Escolha o inquilino. Se ele já aluga outro imóvel, abre o cadastro de um contrato novo para este imóvel com os dados da pessoa; as condições do contrato são escolhidas de novo.',
    extraHtml: (r, q) => `<p class="suave" style="margin-top:12px">O inquilino não está na lista? ${link(`#/novo/contratos?vincular=${q.imovel}`, 'Cadastrar novo contrato')}</p>`,
    voltar: (r, q) => `#/imovel/${q.imovel}`,
    salvar(db, dados, q) {
      antesDoVinculo = { ...R.buscar(db, 'contratos', dados.contrato_id) };
      if (antesDoVinculo.imovel_id) return R.buscar(db, 'contratos', dados.contrato_id); // nada muda: vai para o contrato novo
      const c = R.vincularInquilino(db, Number(q.imovel), dados, login());
      if (c.pasta !== nomePastaContrato(c)) R.atualizar(db, 'contratos', c.id, { pasta: nomePastaContrato(c) }, login(), 'Pasta de arquivos');
      return c;
    },
    depois: (salvo) => (antesDoVinculo && !antesDoVinculo.imovel_id ? CADASTROS.contratos.depois(salvo, antesDoVinculo) : null),
    destino: (salvo, q) => (antesDoVinculo && antesDoVinculo.imovel_id ? `#/novo/contratos?vincular=${q.imovel}&pessoa=${salvo.id}` : `#/contrato/${salvo.id}`),
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
    conferir: (dados, r) => (r.data_pagamento ? [] : conferirBoleto(dados, r)),
    ajustar(dados, erros, r) {
      if (r.data_pagamento) {
        if (R.faturasDe(d(), 'cobranca', r.id).length) erros.observacoes_nf = 'A NF já foi numerada. Cancele a NF (ou desfaça a numeração) antes de corrigir';
        return;
      }
      for (const k of ['desconto', 'iptu', 'seguro', 'taxa_boleto', 'outros', 'reserva_utilizada', 'multa_percentual', 'juros_mensal_percentual']) if (dados[k] === null) dados[k] = 0;
      dados.editado_manual = true; // o recálculo automático não mexe mais nestes valores
      const disp = R.saldoReserva(d(), buscar('contratos', r.contrato_id), r.id);
      if (dados.reserva_utilizada > disp) {
        const outros = d().cobrancas.filter((x) => x.contrato_id === r.contrato_id && x.id !== r.id && x.reserva_utilizada > 0);
        erros.reserva_utilizada = `Saldo da reserva disponível: ${reais(disp)}${outros.length ? ` (está no boleto de ${outros.map((x) => compBr(x.competencia)).join(', ')}). Para trocar de mês, use "Reaplicar a reserva" na página do inquilino` : ''}`;
      }
    },
  },
};

// --------------------------------------------------------------------------
// Fechamento do mês e cadastros incompletos
// --------------------------------------------------------------------------
function telaFechamento(mes) {
  const hoje = C.hojeIso();
  const etapas = R.etapasFechamento(d(), mes, hoje);
  const faltam = etapas.filter((e) => !e.feito).length;
  return `<div class="cabecalho"><h1>Fechamento de ${compBr(mes)}</h1>
      <div class="acoes">${link(`#/fechamento?mes=${C.somarMeses(mes, -1)}`, `← ${compBr(C.somarMeses(mes, -1))}`, 'botao secundario')}
      ${link(`#/fechamento?mes=${C.somarMeses(mes, 1)}`, `${compBr(C.somarMeses(mes, 1))} →`, 'botao secundario')}</div></div>
    <div class="alerta ${faltam ? 'aviso' : 'ok'}">${faltam ? `Faltam <b>${faltam}</b> de ${etapas.length} etapas.` : 'Fechamento concluído.'} As etapas ficam feitas sozinhas quando não há pendência; dá para marcar à mão quando já resolveu de outro jeito.</div>
    <div class="cartao"><ol class="fechamento">${etapas.map((e) => `<li class="${e.feito ? 'feito' : ''}">
      <div class="cabecalho"><div><b>${esc(e.titulo)}</b> ${e.feito ? etiqueta(e.marcado ? `marcado em ${dataBr(e.marcado.feito_em)}` : 'feito', 'ok') : etiqueta(`${e.pendentes} pendente(s)`, 'aviso')}
        <div class="suave">${esc(e.detalhe)}</div>
        ${e.chave === 'contas' && e.imoveis && e.imoveis.length ? `<div class="acoes" style="margin-top:4px">${e.imoveis.map((id) => link(`#/contas/${id}?comp=${mes}`, `Lançar: ${esc(buscar('imoveis', id).nome)}`, 'botao secundario pequeno')).join(' ')}</div>` : ''}</div>
        <div class="acoes">${link(e.link, 'Abrir', 'botao pequeno')}
          ${opera() ? (e.marcado ? botao('etapaFechamento', 'Desmarcar', { mes, etapa: e.chave, feito: '' }, 'link-botao') : !e.feito ? botao('etapaFechamento', 'Marcar como feito', { mes, etapa: e.chave, feito: '1' }, 'secundario pequeno') : '') : ''}</div></div></li>`).join('')}</ol>
    <p class="suave">Os boletos que vencem em ${compBr(mes)} são os da competência ${compBr(C.somarMeses(mes, -1))} (mês de uso). O último dia do mês aparece no calendário do Painel com o que falta.</p></div>`;
}

/** O que falta nos cadastros para o contrato, a vistoria e a NF saírem completos. */
function cadastrosIncompletos() {
  const hoje = C.hojeIso();
  const out = [];
  for (const c of d().contratos.filter((x) => x.imovel_id && R.contratoAtivo(x, hoje))) {
    const falta = K.pendenciasDoContrato(d(), c).filter((t) => !t.endsWith('(em Empresas)'));
    if (!c.inquilino_telefone) falta.push('telefone');
    if (!c.inquilino_email) falta.push('e-mail');
    for (const [k, nome, feito] of R.DOCUMENTOS_ENTRADA) {
      if (R.documentoFalta(d(), c, k)) falta.push({ texto: `${nome.toLocaleLowerCase('pt-BR')} (não ${feito})`, nivel: 'perigo' });
      else if (R.documentoParcial(d(), c, k)) falta.push({ texto: `${nome.toLocaleLowerCase('pt-BR')} (falta assinatura)`, nivel: 'aviso' });
    }
    if (falta.length) out.push({ tipo: 'Inquilino', nome: c.inquilino_nome, onde: (buscar('imoveis', c.imovel_id) || {}).nome || '', falta, editar: `#/editar/contratos/${c.id}`, ver: `#/contrato/${c.id}` });
  }
  for (const i of d().imoveis) {
    const falta = [];
    if (!i.cep) falta.push('CEP');
    if (!i.cidade) falta.push('cidade');
    if (!i.chaves) falta.push('chaves e controles');
    if (!K.lerModeloVistoria(i.modelo_vistoria).length) falta.push('modelo de vistoria');
    if (!R.participacoesDo(d(), i.id).length && !R.imovelSoControle(d(), i.id)) falta.push('empresas que emitem a NF');
    if (!i.valor_imovel) falta.push('valor do imóvel (para os Resultados)');
    if (falta.length) out.push({ tipo: 'Imóvel', nome: i.nome, onde: R.enderecoCompleto(i), falta, editar: `#/editar/imoveis/${i.id}`, ver: `#/imovel/${i.id}` });
  }
  for (const e of d().emitentes.filter((x) => x.ativo)) {
    const falta = [['cnpj', 'CNPJ'], ['endereco_sede', 'endereço da sede'], ['representante_nome', 'representante que assina'], ['representante_cpf', 'CPF do representante']]
      .filter(([k]) => !e[k]).map(([, t]) => t);
    if (falta.length) out.push({ tipo: 'Empresa', nome: e.nome, onde: e.razao_social || '', falta, editar: `#/editar/emitentes/${e.id}`, ver: '#/empresas' });
  }
  return out;
}

function telaPendencias() {
  const lista = cadastrosIncompletos();
  const grupos = ['Inquilino', 'Imóvel', 'Empresa'].map((t) => [t, lista.filter((x) => x.tipo === t)]).filter(([, l]) => l.length);
  return `<p class="suave"><a href="#/">← Painel</a></p><h1>Cadastros incompletos</h1>
    <p class="suave">O que falta para o contrato, a vistoria, os resultados e a NF saírem completos. Inquilinos: só os ativos.</p>
    ${grupos.map(([t, l]) => `<div class="cartao"><h2>${t === 'Imóvel' ? 'Imóveis' : t === 'Empresa' ? 'Empresas' : 'Inquilinos'} (${l.length})</h2><div class="rolagem"><table><tr><th>${t}</th><th>Falta</th><th></th></tr>
      ${l.map((x) => `<tr><td><a href="${x.ver}"><b>${esc(x.nome)}</b></a>${x.onde ? `<br><span class="suave">${esc(x.onde)}</span>` : ''}</td><td>${x.falta.map((f) => (typeof f === 'string' ? etiqueta(f, 'aviso') : etiqueta(f.texto, f.nivel))).join(' ')}</td>
        <td class="n nw">${opera() || (t === 'Empresa' && podeUsuario('admin')) ? link(x.editar, 'Completar', 'botao pequeno') : ''}</td></tr>`).join('')}</table></div></div>`).join('')
    || '<div class="alerta ok">Todos os cadastros estão completos.</div>'}`;
}

/** Avisos antes de salvar: valores fora do padrão. Quem confirma, salva; quem cancela, corrige. */
function confirmarAvisos(avisos) {
  if (avisos.length && !confirm(`Confira antes de salvar:\n\n• ${avisos.join('\n• ')}\n\nSalvar assim mesmo?`)) {
    throw new Error('Nada foi salvo. Corrija o que precisar e salve de novo.');
  }
}

const DIAS_FUTURO = 60;
const FORA_DO_PADRAO = 0.3;
/** Avisos do cadastro do inquilino: aluguel muito diferente do anterior, imóvel ainda ocupado, entrada muito no futuro. */
function conferirContrato(dados, r, q) {
  const out = [];
  const imovelId = r ? r.imovel_id : Number(dados.imovel_id || q.vincular || q.imovel) || null;
  const anterior = imovelId ? d().contratos.filter((x) => x.imovel_id === imovelId && (!r || x.id !== r.id))
    .sort((a, b) => String(b.data_entrada || '').localeCompare(String(a.data_entrada || '')))[0] : null;
  const base = r ? r.aluguel_inicial : anterior ? R.aluguelAtual(d(), anterior) : null;
  if (base && dados.aluguel_inicial && Math.abs(dados.aluguel_inicial - base) / base > FORA_DO_PADRAO && (!r || dados.aluguel_inicial !== r.aluguel_inicial)) {
    const p = Math.round(((dados.aluguel_inicial - base) / base) * 100);
    out.push(`Aluguel de ${reais(dados.aluguel_inicial)} está ${Math.abs(p)}% ${p > 0 ? 'acima' : 'abaixo'} ${r ? 'do valor anterior' : `do aluguel atual do inquilino anterior (${anterior.inquilino_nome})`} de ${reais(base)}.`);
  }
  if (imovelId && dados.data_entrada) {
    const ocupando = d().contratos.find((x) => x.imovel_id === imovelId && (!r || x.id !== r.id) && x.id !== dados.contrato_anterior_id && x.data_entrada && x.data_entrada < dados.data_entrada
      && (x.data_saida ? x.data_saida >= dados.data_entrada : x.ativo !== false));
    if (ocupando) out.push(`${ocupando.inquilino_nome} ainda está neste imóvel em ${dataBr(dados.data_entrada)}${ocupando.data_saida ? ` (sai em ${dataBr(ocupando.data_saida)})` : ' (sem data de saída)'}.`);
  }
  if (dados.data_entrada && dados.data_entrada > C.somarDias(C.hojeIso(), DIAS_FUTURO)) out.push(`A entrada (${dataBr(dados.data_entrada)}) está a mais de ${DIAS_FUTURO} dias no futuro.`);
  if (dados.vigencia_inicio && dados.data_entrada && Math.abs(C.diasEntre(dados.vigencia_inicio, dados.data_entrada)) > 31) out.push(`O início do contrato (${dataBr(dados.vigencia_inicio)}) e a entrada (${dataBr(dados.data_entrada)}) estão a mais de um mês de distância.`);
  return out;
}

/** Avisos ao alterar um boleto: vencimento fora do dia do contrato. */
function conferirBoleto(dados, r) {
  const out = [];
  const c = buscar('contratos', r.contrato_id);
  if (dados.vencimento && c && c.dia_vencimento && Number(dados.vencimento.slice(8, 10)) !== c.dia_vencimento && dados.vencimento !== r.vencimento) {
    out.push(`O vencimento ${dataBr(dados.vencimento)} não cai no dia ${c.dia_vencimento}, que é o do contrato.`);
  }
  return out;
}

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
      ${F.camposHtml(campos, valores, estado ? estado.erros : {}, { compacto: !!cfg.compacto })}${cfg.extraHtml ? cfg.extraHtml(registro, q) : ''}
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

/** Valor recebido diferente do previsto: descritivo do cálculo, justificativa e o valor da NF (vem o calculado, em vermelho, e precisa ser alterado). */
function formNfDivergente(cb, p) {
  const r = R.previstoNoPagamento(cb, p.data, p);
  const dif = p.valor - r.valor_devido;
  const ress = cb.ressarcimento_na_nf && cb.ressarcimento ? ` − ressarcimento ${reais(cb.ressarcimento)}` : '';
  const conta = r.pontual ? `aluguel ${reais(cb.aluguel)} − desconto ${reais(cb.desconto)}${ress}` : `aluguel ${reais(cb.aluguel)} + multa ${reais(r.multa)} + juros ${reais(r.juros)}${ress} (${r.dias_atraso} dia(s) de atraso, sem desconto)`;
  return `<div class="alerta aviso"><b>Valor recebido diferente do previsto.</b> Confira o cálculo e informe o valor da NF (cálculo manual). Nada foi salvo ainda.</div>
    <div class="grade">${item('Data contábil (data da NF)', dataBr(p.data))}${item('Pagou em', dataBr(p.pagouEmDia ? cb.vencimento : p.dataPagou || p.data))}
      ${item('Previsto', reais(r.valor_devido))}${item('Recebido', `<b>${reais(p.valor)}</b>`)}${item('Diferença', `<b>${dif > 0 ? '+' : '−'}${reais(Math.abs(dif))}</b>`)}</div>
    <p><b>Cálculo da NF:</b> ${conta} = <b>${reais(r.valor_nf)}</b>. IPTU, seguro, tarifa e ajuste do mês não entram.</p>
    <form data-form="pagamentoNf" data-id="${cb.id}" class="formulario">
      <div class="largo"><label>Justificativa da divergência</label><textarea name="justificativa" rows="2">${esc(p.justificativa)}</textarea><div class="ajuda">Fica só no sistema (histórico do boleto)</div></div>
      <div><label>Valor da NF</label><input name="valor_nf" inputmode="decimal" data-dinheiro value="${F.dinheiroTexto(r.valor_nf)}" data-calculado="${F.dinheiroTexto(r.valor_nf)}" class="valor-calculado">
        <div class="ajuda">Veio o valor calculado: altere para o valor do cálculo manual</div></div>
      <div class="acoes" style="align-self:end"><button>Confirmar pagamento</button>${botao('cancelarPagamentoDivergente', 'Cancelar', {}, 'secundario')}</div></form>`;
}

const nomeI = (x) => (x.i ? x.i.nome : '');
/** Ordenações da lista de boletos (o padrão é a data de vencimento). */
const ORDENS_BOLETO = {
  vencimento: (a, b) => a.cb.vencimento.localeCompare(b.cb.vencimento) || nomeI(a).localeCompare(nomeI(b), 'pt-BR'),
  imovel: (a, b) => nomeI(a).localeCompare(nomeI(b), 'pt-BR'),
  inquilino: (a, b) => a.c.inquilino_nome.localeCompare(b.c.inquilino_nome, 'pt-BR'),
  valor: (a, b) => b.t.a_pagar_pontual - a.t.a_pagar_pontual,
};

/** Baixa em lote separada por vencimento: só dá para confirmar juntos boletos que vencem no mesmo dia. */
function caixaBaixaLote(lista, hoje) {
  const abertos = lista.filter((x) => !x.cb.data_pagamento && x.cb.situacao !== 'Carência');
  if (!abertos.length) return '';
  const grupos = [...new Set(abertos.map((x) => x.cb.vencimento))].sort().map((v) => [v, abertos.filter((x) => x.cb.vencimento === v)]);
  return `<details class="cartao baixa-lote"><summary><b>Baixa em lote (pagos em dia)</b> <span class="suave">· ${abertos.length} em aberto, separada por vencimento · clique para expandir</span></summary>
    ${grupos.map(([v, xs]) => `<form data-form="baixaLote" class="grupo-baixa">
      <div class="cabecalho"><div><b>Vencimento ${dataBr(v)}</b> ${v < hoje ? etiqueta('vencido', 'perigo') : ''} <span class="suave">${xs.length} em aberto · ${reais(xs.reduce((t, x) => t + x.t.a_pagar_pontual, 0))}</span></div>
        <label class="check-mini"><input type="checkbox" data-marcar-grupo> marcar todos deste vencimento</label></div>
      <div class="lista-baixa">${xs.map((x) => `<label class="check-mini"><input type="checkbox" name="ids" value="${x.cb.id}"> ${esc(x.i.nome)} · ${esc(x.c.inquilino_nome)} · ${reais(x.t.a_pagar_pontual)}</label>`).join('')}</div>
      <div class="acoes">entraram em <input type="date" name="data" value="${hoje}" style="width:auto"><button class="pequeno">Confirmar os marcados como pagos em dia</button></div></form>`).join('')}
    <p class="suave">Sem multa e juros. Quem pagou atrasado, confirme na própria linha da tabela.</p></details>`;
}

function telaCobrancas(comp, ordem = 'vencimento') {
  const hoje = C.hojeIso();
  const lista = d().cobrancas.filter((x) => x.competencia === comp).map((cb) => {
    const c = buscar('contratos', cb.contrato_id);
    return { cb, c, i: buscar('imoveis', c.imovel_id), t: R.totais(cb), fs: R.faturasDe(d(), 'cobranca', cb.id) };
  }).sort(ORDENS_BOLETO[ordem] || ORDENS_BOLETO.vencimento);
  const faltando = d().contratos.filter((c) => c.ativo !== false && c.imovel_id && C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0 && !lista.some((x) => x.c.id === c.id && !R.ehComplementoCaucao(x.cb)));
  const caucoes = R.complementosCaucaoPendentes(d(), comp);
  const pend = R.pendentesDeFatura(d());
  // boleto de controle (inquilino sem NF) não entra nas somas
  const soma = (f) => lista.filter((x) => R.geraNf(x.c)).reduce((s, x) => s + f(x), 0);
  const controle = lista.filter((x) => !R.geraNf(x.c)).length;
  // reajuste no aluguel seguinte: a carta vai junto com este boleto
  const proxima = C.somarMeses(comp, 1);
  const reajustes = new Map(lista.map((x) => [x.c.id, R.reajusteNaCompetencia(d(), x.c, proxima)]).filter(([, r]) => r && !r.corrigido));
  // botões de impressão em cima e embaixo da lista
  const impressao = `${botao('imprimirDemonstrativos', 'Imprimir demonstrativos selecionados', { comp }, 'botao')}
      <a class="botao secundario" href="#/imprimir/demonstrativos?comp=${comp}">Imprimir todos os demonstrativos do mês</a>
      ${opera() ? botao('excluirBoletosSelecionados', 'Excluir boletos selecionados', { comp }, 'perigo') : ''}`;
  return `<div class="cabecalho"><h1>Boletos de ${compBr(comp)}</h1>
      <div class="acoes"><a class="botao secundario" href="#/cobrancas?comp=${C.somarMeses(comp, -1)}&ordem=${ordem}">← ${compBr(C.somarMeses(comp, -1))}</a>
      <form data-form="irMes" class="acoes"><input type="month" name="comp" value="${comp}" style="width:160px"><button class="secundario">Ir</button></form>
      <a class="botao secundario" href="#/cobrancas?comp=${C.somarMeses(comp, 1)}&ordem=${ordem}">${compBr(C.somarMeses(comp, 1))} →</a></div></div>
    <p class="suave">Competência é o mês de uso do imóvel. Ao receber, informe a data do pagamento e clique em Confirmar. Depois, numere as NFs: a numeração segue a ordem das datas de pagamento.</p>
    ${reajustes.size ? `<div class="alerta aviso"><b>Reajuste</b> ${reajustes.size} inquilino(s) têm o aluguel de ${compBr(proxima)} corrigido: envie a carta de reajuste junto com o boleto deste mês (botão "Gerar carta" na linha). ${link('#/reajustes', 'Ver reajustes')}</div>` : ''}
    ${faltando.length && opera() ? `<div class="alerta aviso">${faltando.length} contrato(s) ainda sem boleto neste mês: ${faltando.map((c) => esc(c.inquilino_nome)).join(', ')}. ${botao('gerarCobrancas', `Gerar boletos de ${compBr(comp)}`, { comp }, 'pequeno')}</div>` : ''}
    ${caucoes.length && opera() ? `<div class="alerta aviso"><b>Complemento da caução</b> (aluguel corrigido): boleto separado, sem tarifa e sem NF.
      ${caucoes.map((x) => `<div class="acoes" style="margin-top:6px">${esc(x.contrato.inquilino_nome)}: caução de ${reais(x.atual)} para ${reais(x.necessaria)}
        ${botao('gerarBoletoCaucao', `Gerar boleto de ${reais(x.complemento)}`, { contrato: x.contrato.id, comp }, 'pequeno', `Gerar o boleto do complemento da caução de ${reais(x.complemento)}?`)}</div>`).join('')}</div>` : ''}
    ${opera() && lista.some((x) => !x.cb.data_pagamento) ? `<p class="acoes">${botao('recalcularMes', `Recalcular boletos em aberto de ${compBr(comp)} pelo cadastro`, { comp }, 'secundario pequeno', 'Recalcular os boletos em aberto deste mês com os valores atuais do cadastro? Boletos alterados à mão não mudam.')}</p>` : ''}
    ${pend.length && opera() ? `<div class="alerta info">${pend.length} pagamento(s) aguardando número de NF. ${botao('numerar', 'Numerar NFs agora', {}, 'pequeno')}</div>` : ''}
    ${opera() ? caixaBaixaLote(lista, hoje) : ''}
    ${lista.length ? `<div class="acoes barra-nf">${impressao} <a class="botao secundario" href="#/faturas">Ver NFs</a></div>
      <div class="acoes barra-nf">${link('#/inadimplencia', 'Inadimplência')} <label class="suave" for="ordem-boletos">Ordenar por:</label> <select id="ordem-boletos" data-ordem-boletos="${comp}" style="width:auto">${[['vencimento', 'Data de vencimento'], ['imovel', 'Nome do imóvel'], ['inquilino', 'Nome do inquilino'], ['valor', 'Valor (maior para menor)']]
    .map(([k, t]) => `<option value="${k}" ${(ORDENS_BOLETO[ordem] ? ordem : 'vencimento') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>` : ''}
    <div class="cartao rolagem"><table class="cobrancas">
      <tr><th><input type="checkbox" data-marcar-todas="boleto" title="Selecionar todos"></th><th>Imóvel / inquilino</th><th>Vencimento</th><th class="n">Pontual</th><th class="n">Após vencimento</th><th>Situação</th><th>Multa e juros</th><th class="n">Valor NF</th><th>NF</th></tr>
      ${lista.map(({ cb, c, i, t, fs }) => `<tr class="${R.geraNf(c) ? '' : 'linha-controle'}">
        <td><input type="checkbox" data-boleto="${cb.id}" title="Selecionar (imprimir o demonstrativo ou excluir)"></td>
        <td><a href="#/cobranca/${cb.id}"><b>${esc(i.nome)}</b></a><br>${esc(c.inquilino_nome)}${R.geraNf(c) ? '' : `<br>${seloControle()}`}
          ${cb.dias_cobrados < cb.dias_mes ? `<br>${etiqueta(`proporcional ${cb.dias_cobrados}/${cb.dias_mes} dias`, 'info')}` : ''}
          ${cb.reserva_utilizada > 0 ? `<br>${etiqueta(`usa reserva ${reais(cb.reserva_utilizada)}`, 'aviso')}` : ''}
          ${cb.carencia ? `<br>${etiqueta('carência', 'aviso')}` : ''}
          ${R.ehComplementoCaucao(cb) ? `<br>${etiqueta('complemento da caução · sem NF', 'info')}` : ''}
          ${reajustes.has(c.id) && !R.ehComplementoCaucao(cb) ? `<br>${etiqueta(`reajuste no aluguel de ${compBr(proxima)}`, 'aviso')} ${link(`#/imprimir/carta?contrato=${c.id}&comp=${proxima}`, reajustes.get(c.id).carta ? 'Carta (enviada ✓)' : 'Gerar carta', 'botao pequeno')}` : ''}</td>
        <td>${dataBr(cb.vencimento)}
          ${!cb.data_pagamento ? `<br>${botao('copiar', 'Copiar texto do boleto', { texto: R.dadosBoleto(d(), cb).descricao })}` : ''}</td>
        <td class="n">${reais(t.a_pagar_pontual)}</td>
        <td class="n suave">${reais(t.a_pagar_sem_desconto)}<br>+ multa ${pct(cb.multa_percentual)}<br>+ juros ${pct(cb.juros_mensal_percentual)} a.m.</td>
        <td>${cb.data_pagamento || cb.situacao === 'Carência' ? situacaoBoleto(cb, hoje) : `${situacaoBoleto(cb, hoje)}${opera() ? `<br>${formPagamento(cb, true)}` : ''}`}</td>
        <td>${multaJurosTexto(cb)}</td>
        <td class="n">${cb.valor_nf !== null ? reais(cb.valor_nf) : '-'}</td>
        <td>${fs.length ? link(`#/imprimir/faturas?numero=${fs[0].numero}`, `Nº ${R.numeroFatura(fs[0].numero)}`) : !R.geraNf(c) || R.ehComplementoCaucao(cb) ? etiqueta('sem NF', 'controle') : (cb.data_pagamento ? '<span class="suave">aguardando nº</span>' : '-')}
          ${cb.data_pagamento ? `<br><span class="suave">entrou em ${dataBr(cb.data_pagamento)}${cb.dias_atraso ? ` (${cb.dias_atraso} dias de atraso)` : ''}<br>recebido ${reais(cb.valor_pago)}</span>${opera() && !fs.length ? `<br>${botao('estornar', 'Desfazer pagamento', { id: cb.id }, 'secundario pequeno', 'Desfazer este pagamento?')}` : ''}` : ''}</td></tr>`).join('')
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
  if (R.ehComplementoCaucao(cb)) {
    return `<div class="demonstrativo"><div class="cabecalho"><div><h2 style="margin:0">Demonstrativo do boleto: complemento da caução</h2><div class="suave">Aluguel corrigido a partir de ${compBr(cb.competencia)}</div></div>
      <div style="text-align:right"><div class="suave">Vencimento</div><div class="maior"><b>${dataBr(cb.vencimento)}</b></div></div></div>
    <div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>
    <p><b>Inquilino:</b> ${esc(c.inquilino_nome)}${c.inquilino_cpf ? ` · CPF/CNPJ ${esc(c.inquilino_cpf)}` : ''}${c.inquilino_telefone ? ` · ${esc(c.inquilino_telefone)}` : ''}</p>
    <table><tr><th>Descrição</th><th class="n">Valor</th></tr>
      ${linha('Caução já depositada', reais(cb.caucao_anterior))}
      ${linha(`Nova caução${c.caucao_meses ? ` (${c.caucao_meses} aluguéis)` : ''}`, reais(cb.caucao_nova))}
      <tr class="total"><td>Depósito adicional a pagar até ${dataBr(cb.vencimento)}</td><td class="n maior">${reais(t.a_pagar_pontual)}</td></tr>
      <tr><td colspan="2" class="suave">Após o vencimento: + multa de ${pct(cb.multa_percentual)} + juros de ${pct(cb.juros_mensal_percentual)} ao mês, pro rata dia.</td></tr></table>
    ${cb.data_pagamento ? `<p><b>Pago em ${dataBr(cb.data_pagamento)}</b>${cb.dias_atraso ? ` com ${cb.dias_atraso} dia(s) de atraso: multa ${reais(cb.multa)}; juros ${reais(cb.juros)}` : ''} · recebido ${reais(cb.valor_pago)}</p>` : ''}
    ${cb.observacoes ? `<p class="pre">${esc(cb.observacoes)}</p>` : ''}</div>`;
  }
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
      ${cb.ressarcimento ? linha(`(-) Ressarcimento de taxa do condomínio (${esc(cb.ressarcimento_descricao || '')})`, `- ${reais(cb.ressarcimento)}`) : ''}
      <tr class="total"><td>Valor a pagar até ${dataBr(cb.vencimento)}</td><td class="n maior">${reais(t.a_pagar_pontual)}</td></tr>
      <tr><td colspan="2" class="suave">Após o vencimento: ${reais(t.a_pagar_sem_desconto)} + multa de ${pct(cb.multa_percentual)} + juros de ${pct(cb.juros_mensal_percentual)} ao mês, pro rata dia.</td></tr></table>
    ${cb.data_pagamento ? `<p><b>Pago em ${dataBr(cb.data_pagamento)}</b>${cb.pagou_em_dia ? ' (pagou até o vencimento; compensado depois)' : ''}${cb.dias_atraso ? ` com ${cb.dias_atraso} dia(s) de atraso${cb.data_pagou ? ` (pagou em ${dataBr(cb.data_pagou)})` : ''}: multa ${pct(cb.multa_percentual)} = ${reais(cb.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(cb.juros)}` : ''} · recebido ${reais(cb.valor_pago)}</p>` : ''}
    ${cb.observacoes ? `<p class="pre">${esc(cb.observacoes)}</p>` : ''}</div>`;
}

/** Ajuste do mês: cobrança adicional ou ressarcimento (reforma, acerto etc.). Fica no histórico. */
function caixaAjuste(cb) {
  if (!opera() || cb.data_pagamento || R.ehComplementoCaucao(cb)) return '';
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
    <div class="cabecalho"><h1>Boleto ${R.ehComplementoCaucao(cb) ? 'do complemento da caução' : compBr(cb.competencia)} ${situacao(cb.situacao)}</h1><div class="acoes">
      <button class="secundario" data-acao="imprimir">Imprimir demonstrativo</button>${botao('baixarPdfTela', 'Baixar PDF', { seletor: '.demonstrativo', nome: nomeArquivoDoc(R.ehComplementoCaucao(cb) ? 'Demonstrativo complemento caução' : 'Demonstrativo boleto', c, cb.competencia) }, 'secundario')}
      ${opera() && !cb.data_pagamento ? `${R.ehComplementoCaucao(cb) ? '' : link(`#/editar/cobrancas/${cb.id}`, 'Alterar valores', 'botao secundario')} ${botao('excluir', 'Excluir', { tabela: 'cobrancas', id: cb.id }, 'perigo', 'Excluir este boleto?')}` : ''}</div></div>
    ${cb.editado_manual && !cb.data_pagamento ? `<div class="alerta info">Valores alterados à mão: este boleto não é recalculado sozinho quando o cadastro muda. ${opera() ? botao('recalcularBoleto', 'Voltar a calcular pelo cadastro', { id: cb.id }, 'secundario pequeno', 'Recalcular este boleto pelo cadastro? Os valores digitados à mão serão substituídos (o ajuste do mês fica).') : ''}</div>` : ''}</div>
    ${R.geraNf(c) ? '' : `<div class="alerta controle nao-imprimir"><b>Boleto de controle.</b> Este inquilino ${AVISO_CONTROLE}</div>`}
    ${demonstrativo(cb)}
    <div class="nao-imprimir">${caixaAjuste(cb)}<div class="cartao" id="pagamento"><h2>Pagamento</h2>
      ${!cb.data_pagamento && pagamentoDivergente && pagamentoDivergente.id === cb.id ? formNfDivergente(cb, pagamentoDivergente) : cb.data_pagamento ? `<div class="grade">${item('Pago em', dataBr(cb.data_pagamento))}${item('Situação', `${esc(cb.situacao)}${cb.dias_atraso ? ` (${cb.dias_atraso} dias)` : ''}`)}
        ${item(`Multa (${pct(cb.multa_percentual)})`, reais(cb.multa))}${item(`Juros (${pct(cb.juros_mensal_percentual)} ao mês)`, reais(cb.juros))}
        ${item('Valor recebido', reais(cb.valor_pago))}${R.ehComplementoCaucao(cb) ? '' : item('Valor da nota fiscal', `<span class="maior">${reais(cb.valor_nf)}</span>${cb.nf_manual ? ` ${etiqueta('digitado à mão', 'aviso')}` : ''}`)}</div>
        ${cb.nf_manual ? '<p class="suave">Valor recebido diferente do previsto: a NF saiu com o valor digitado à mão (a justificativa está no histórico).</p>' : R.ehComplementoCaucao(cb) ? '<p class="suave">Complemento da caução: não gera NF. Ao confirmar o pagamento, a caução foi corrigida (veja Garantia, na página do inquilino).</p>' : `<p class="suave">Nota fiscal = ${cb.dias_atraso ? `aluguel ${reais(cb.aluguel)} + multa ${reais(cb.multa)} + juros ${reais(cb.juros)} (pagou atrasado, sem desconto). ` : `aluguel ${reais(cb.aluguel)} - desconto ${reais(cb.desconto)} (pagou em dia)`}. IPTU, seguro, tarifa e ajuste do mês não entram.</p>`}
        ${opera() ? botao('estornar', 'Desfazer pagamento', { id: cb.id }, 'perigo pequeno', validas.length ? 'Desfazer o pagamento? A NF será cancelada e o número não será reaproveitado.' : 'Desfazer o pagamento?') : ''}`
      : `<p>Se for pago hoje (${dataBr(C.hojeIso())}): <b>${reais(sim.valor_devido)}</b>${sim.pontual ? '' : ` (${sim.dias_atraso} dias de atraso: multa ${pct(cb.multa_percentual)} = ${reais(sim.multa)}; juros ${pct(cb.juros_mensal_percentual)} a.m. = ${reais(sim.juros)})`}${R.ehComplementoCaucao(cb) ? ' · sem NF (complemento da caução)' : ` · nota fiscal ${reais(sim.valor_nf)}`}</p>
        ${opera() && cb.situacao !== 'Carência' ? formPagamento(cb, false) : ''}`}</div>
    ${caixaBoleto(cb)}
    <div class="cartao"><h2>NFs</h2><table><tr><th>Nº</th><th>Empresa</th><th>Emissão</th><th>Período</th><th class="n">%</th><th class="n">Valor</th><th>Situação</th></tr>
      ${fs.map((f) => `<tr><td>${R.numeroFatura(f.numero)}</td><td>${esc(buscar('emitentes', f.emitente_id).nome)}</td><td>${dataBr(f.emissao)}</td><td>${dataBr(f.periodo_inicio)} a ${dataBr(f.periodo_fim)}</td><td class="n">${pct(f.percentual)}</td><td class="n">${reais(f.valor)}</td><td>${etiqueta(f.situacao, f.situacao === 'Emitida' ? 'ok' : 'perigo')}</td></tr>`).join('')
      || `<tr><td colspan="7" class="suave">${!R.geraNf(c) ? 'Este inquilino não emite NF (só controle do pagamento).' : R.ehComplementoCaucao(cb) ? 'Complemento da caução: não gera NF.' : cb.data_pagamento ? 'Aguardando numeração (tela NF).' : 'Confirme o pagamento para gerar a NF.'}</td></tr>`}</table>
      ${cb.data_pagamento && !validas.length && R.geraNf(c) && !R.ehComplementoCaucao(cb) && opera() ? `<p>${formNfExterna('cobranca', cb.id, cb.data_pagamento)}</p>` : ''}
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
    ${emitidas.length ? `<div class="acoes"><a class="botao" target="_blank" href="#/imprimir/faturas?mes=${mes}">Imprimir todas as NFs de ${compBr(mes)}</a> ${botao('pdfMes', 'Baixar todas em PDF (ZIP)', { mes })}
      ${[...new Set(doMes.filter((f) => f.situacao === 'Emitida').map((f) => f.emitente_id))].map((id) => buscar('emitentes', id)).filter(Boolean)
    .map((e) => botao('pdfMes', `Todas em PDF ${esc(siglaEmpresa(e))}`, { mes, empresa: e.id })).join(' ')}
      ${botao('excelMes', 'Baixar todas em Excel (ZIP)', { mes })}</div>` : ''}
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

/** Situações da solicitação, com o símbolo do resumo (tela Inquilinos) e da lista de solicitações. */
const SITUACOES_SOLICITACAO = [
  { nome: 'Aberta', simbolo: '🟢', texto: 'abertas' },
  { nome: 'Em andamento', simbolo: '➡️', texto: 'em andamento' },
  { nome: 'Concluída', simbolo: '✅', texto: 'concluídas' },
  { nome: 'Não atendida', simbolo: '❌', texto: 'não atendidas' },
];

/** Todas as solicitações dos inquilinos, com filtro pela situação. */
function telaSolicitacoes(q) {
  const resumo = R.resumoSolicitacoes(d());
  const filtro = SITUACOES_SOLICITACAO.find((s) => s.nome === q.situacao);
  const simbolo = (sit) => (SITUACOES_SOLICITACAO.find((s) => s.nome === sit) || SITUACOES_SOLICITACAO[0]).simbolo;
  const lista = d().solicitacoes.filter((x) => !filtro || (x.situacao || 'Aberta') === filtro.nome)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);
  return `<p class="suave"><a href="#/inquilinos">← Inquilinos</a></p>
    <div class="cabecalho"><h1>Solicitações dos inquilinos</h1>${opera() ? link('#/novo/solicitacoes?de=solicitacoes', 'Abrir nova solicitação', 'botao') : ''}</div>
    <div class="acoes" style="margin-bottom:12px;flex-wrap:wrap">${link('#/solicitacoes', `Todas (${d().solicitacoes.length})`, `botao ${filtro ? 'secundario ' : ''}pequeno`)}
      ${SITUACOES_SOLICITACAO.map((s) => link(`#/solicitacoes?situacao=${encodeURIComponent(s.nome)}`, `${s.simbolo} ${resumo[s.nome]} ${s.texto}`, `botao ${filtro === s ? '' : 'secundario '}pequeno`)).join(' ')}</div>
    <div class="cartao rolagem"><table><tr><th>Data</th><th>Inquilino / imóvel</th><th>O que pediu</th><th>O que foi feito</th><th>Situação</th><th class="n">Custo</th><th></th></tr>
    ${lista.map((x) => {
    const c = buscar('contratos', x.contrato_id);
    const i = c && c.imovel_id ? buscar('imoveis', c.imovel_id) : null;
    return `<tr><td class="nw">${dataBr(x.data)}</td>
      <td>${c ? `<a href="#/contrato/${c.id}?ir=solicitacoes"><b>${esc(c.inquilino_nome)}</b></a>` : '-'}${i ? `<br><span class="suave">${esc(i.nome)}</span>` : ''}</td>
      <td class="pre">${esc(x.descricao)}</td>
      <td class="pre">${esc(x.providencia || '')}${x.responsavel ? `<br><span class="suave">${esc(x.responsavel)}</span>` : ''}</td>
      <td class="nw">${simbolo(x.situacao || 'Aberta')} ${esc(x.situacao || 'Aberta')}${x.data_conclusao ? `<br><span class="suave">em ${dataBr(x.data_conclusao)}</span>` : ''}</td>
      <td class="n">${x.valor ? `${reais(x.valor)}${x.pago_por ? `<br><span class="suave">${esc(x.pago_por)}</span>` : ''}` : '-'}</td>
      <td class="n nw">${opera() ? link(`#/editar/solicitacoes/${x.id}?de=solicitacoes`, 'Editar') : ''}</td></tr>`;
  }).join('') || `<tr><td colspan="7" class="suave">Nenhuma solicitação${filtro ? ' nesta situação' : ''}.</td></tr>`}</table>
</div>`;
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
  const situacao = (c) => (c.data_saida && c.data_saida < hoje ? etiqueta(R.fimDeVinculo(d(), c) ? 'Fim do vínculo' : 'Saiu', 'neutra') : c.ativo === false ? etiqueta('Inativo', 'neutra') : '');
  const registrar = (c) => (opera() ? `<td class="centro"><a class="botao secundario pequeno botao-icone" href="#/novo/solicitacoes?contrato=${c.id}&de=inquilinos" title="Registrar solicitação de ${esc(c.inquilino_nome)}" aria-label="Registrar solicitação"><svg width="20" height="16" viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="1" y="1" width="18" height="14" rx="2"/><path d="M1.5 2l8.5 7 8.5-7"/></svg></a></td>` : '');
  const resumo = R.resumoSolicitacoes(d());
  return `<div class="cabecalho"><h1>Inquilinos</h1>${opera() ? link('#/novo/contratos', 'Novo contrato', 'botao') : ''}</div>
    <div class="acoes" style="margin-bottom:12px;flex-wrap:wrap"><form class="acoes" data-form="buscaInquilinos" style="flex-wrap:nowrap"><input name="busca" value="${esc(q.busca || '')}" placeholder="Buscar por nome, CPF ou imóvel" style="width:300px"><button class="secundario">Buscar</button>${busca ? link('#/inquilinos', 'Limpar') : ''}</form>
      <a class="botao secundario resumo-solicitacoes" href="#/solicitacoes" title="Ver todas as solicitações dos inquilinos">Solicitações: ${SITUACOES_SOLICITACAO.map((s) => `<span>${s.simbolo} ${resumo[s.nome]} ${s.texto}</span>`).join(' ')}</a></div>
    <div class="cartao rolagem"><h2>Ativos (${atuais.length})</h2><table><tr><th>Ativo</th><th>Imóvel</th><th>Inquilino</th>${opera() ? '<th class="centro">Registrar solicitação</th>' : ''}<th>Entrada</th><th>Vigência do contrato</th><th class="n">Aluguel atual</th><th>Garantia</th></tr>
      ${atuais.map((x) => `<tr class="${x.c.verificar ? 'amarelo' : ''}"><td>${ativo(x.c)}</td><td>${imovel(x)}</td><td>${nome(x)}</td>${registrar(x.c)}<td class="nw">${dataBr(x.c.data_entrada)}</td>
        <td class="nw">${x.c.prazo_tipo === 'Indeterminado' ? `${(x.c.data_entrada || x.c.vigencia_inicio) ? `${dataBr((x.c.data_entrada || x.c.vigencia_inicio))} · ` : ''}${etiqueta('indeterminado', 'aviso')}` : `${dataBr((x.c.data_entrada || x.c.vigencia_inicio))} a ${dataBr(x.c.vigencia_fim)}`}</td><td class="n nw">${reais(R.aluguelAtual(d(), x.c))}</td>
        <td class="nw">${esc(x.c.garantia_tipo || '-')}${R.valorGarantia(d(), x.c) ? ` ${reais(R.valorGarantia(d(), x.c))}` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="suave">Nenhum.</td></tr>'}</table>
      <p class="suave">Desmarque "Ativo" para parar de gerar boleto. O inquilino vai para a lista de inativos e pode ser reativado.</p></div>
    <div class="cartao rolagem"><h2>Inativos e histórico de quem saiu (${anteriores.length})</h2><table><tr><th>Ativo</th><th>Imóvel</th><th>Inquilino</th><th>Entrada</th><th>Saída</th><th class="n">Garantia corrigida</th><th class="n">Débitos</th><th class="n">Saldo</th></tr>
      ${anteriores.map((x) => `<tr><td>${ativo(x.c)}</td><td>${imovel(x)}</td><td>${nome(x)} ${situacao(x.c)}</td><td class="nw">${dataBr(x.c.data_entrada)}</td><td class="nw">${dataBr(x.c.data_saida)}</td>
        ${x.e ? `<td class="n">${reais(x.e.garantia_corrigida)}</td><td class="n">${reais(x.e.debitos)}</td><td class="n"><b>${reais(x.e.saldo)}</b></td>` : `<td colspan="3" class="suave">${R.fimDeVinculo(d(), x.c) ? `contrato continua com ${esc(R.continuadoPor(d(), x.c).inquilino_nome)}` : opera() && x.c.data_saida ? link(`#/novo/encerramentos?contrato=${x.c.id}`, 'Fazer cálculo final') : x.c.data_saida ? 'sem cálculo final' : '-'}</td>`}
</tr>`).join('')
      || '<tr><td colspan="8" class="suave">Nenhum inquilino inativo.</td></tr>'}</table></div>`;
}

function telaIptu(ano) {
  const imoveis = ordenar(d().imoveis, 'nome');
  const doAno = (i) => d().iptus.find((p) => p.imovel_id === i.id && p.ano === ano);
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const meses = MESES.map((_, k) => `${ano}-${String(k + 1).padStart(2, '0')}`);
  // Valor integral e, entre parênteses, o valor pago à vista com desconto (quando houver).
  const valor = (p) => (p ? `<b>${reais(p.valor_total)}</b>${p.pago_avista && p.valor_avista ? ` <span class="suave">(à vista ${reais(p.valor_avista)})</span>` : ''}` : '<span class="suave">-</span>');
  const forma = (p) => (p ? (p.pago_avista ? 'à vista' : `parcelado em ${p.num_parcelas}x`) : '-');
  const primeira = (p) => { const m = p && !p.pago_avista && (p.primeiro_vencimento_boleto || (p.primeira_competencia && C.somarMeses(p.primeira_competencia, 1))); return m ? compBr(m) : '-'; };
  // Uma célula por mês (mês do boleto): parcela toda do inquilino, dividida (entrada ou saída no mês) ou sua (paga ou em aberto).
  const celula = (pc) => {
    if (!pc) return '';
    if (!pc.proprietario) return '<span class="suave">inquilino</span>';
    const sua = pc.n === 0 ? `à vista ${reais(pc.valor)}` : `você ${reais(pc.valorProprietario)}`;
    return `${pc.valorInquilino ? `<span class="suave">inq. ${reais(pc.valorInquilino)}</span><br>` : ''}${etiqueta(`${sua} ${pc.paga ? 'paga' : 'em aberto'}`, pc.paga ? 'ok' : 'perigo')}`;
  };
  const mesDaParcela = (pc, p) => (pc.n === 0 ? (p.data_quitacao || p.vencimento_primeira || '').slice(0, 7) : pc.mesBoleto || (pc.comp && C.somarMeses(pc.comp, 1)) || '');
  let somaSua = 0;
  let somaAberto = 0;
  const linhas = imoveis.map((i) => {
    const p = doAno(i);
    const mapa = new Map();
    const t = p ? R.totaisIptu(d(), p) : null;
    if (p) for (const pc of R.parcelasIptu(d(), p)) mapa.set(mesDaParcela(pc, p), pc);
    if (t) { somaSua += t.proprietario; somaAberto += t.emAberto; }
    const acao = !opera() ? '' : p ? link(`#/editar/iptus/${p.id}?de=iptu`, 'Editar') : link(`#/novo/iptus?imovel=${i.id}&ano=${ano}&de=iptu`, `Lançar ${ano}`, 'botao pequeno');
    return `<tr class="${p ? '' : 'amarelo'}"><td><a href="#/imovel/${i.id}?ir=iptu">${esc(i.nome)}</a></td><td class="n nw">${valor(p)}</td><td>${primeira(p)}</td><td class="nw">${forma(p)}</td>
      ${meses.map((m) => `<td class="n nw">${celula(mapa.get(m))}</td>`).join('')}
      <td class="n">${t ? reais(t.inquilino) : '-'}</td><td class="n">${t ? `<b>${reais(t.proprietario)}</b>` : '-'}</td><td class="n">${acao}</td></tr>`;
  }).join('');
  const faltam = imoveis.filter((i) => !doAno(i)).length;
  return `<p class="suave"><a href="#/imoveis">← Imóveis</a></p>
    <div class="cabecalho"><h1>IPTU ${ano}</h1><div class="acoes">${link(`#/iptu?ano=${ano - 1}`, `← ${ano - 1}`, 'botao secundario')} ${link(`#/iptu?ano=${ano + 1}`, `${ano + 1} →`, 'botao secundario')}</div></div>
    ${faltam ? `<div class="alerta aviso">${faltam} imóvel(is) ainda sem o IPTU de ${ano} (em amarelo).</div>` : `<div class="alerta info">Todos os imóveis com IPTU de ${ano} lançado.</div>`}
    <div class="numeros"><div class="cartao"><div class="grande">${reais(somaSua)}</div>sua parte no ano</div>
      <div class="cartao"><div class="grande">${reais(somaAberto)}</div>da sua parte em guias não pagas</div></div>
    <div class="cartao rolagem"><table><tr><th>Imóvel</th><th class="n">Valor ${ano}: integral (desconto à vista)</th><th>1ª parcela do inquilino</th><th>Forma</th>${MESES.map((m) => `<th class="n">${m}</th>`).join('')}<th class="n">Inquilino paga no ano</th><th class="n">Você paga no ano</th><th></th></tr>${linhas}</table>
    <p class="suave">Cada mês mostra o boleto em que a parcela entra. <b>inquilino</b>: a parcela vai toda no boleto dele, pelo valor parcelado (mesmo quando você paga à vista com desconto). <b>inq. / você</b>: mês de entrada ou de saída; o inquilino paga os dias em que ocupou e você o resto. <b>você … em aberto / paga</b>: imóvel vazio (ou contrato sem IPTU), a parcela é sua; marque o pagamento na página do imóvel. Se a prefeitura atrasar o carnê, edite o primeiro mês de cobrança.</p></div>`;
}

/**
 * Calendário do mês no Painel: grade com os dias; em cada dia, os vencimentos e alertas (cor da situação).
 * Clicar no dia abre logo abaixo a agenda completa daquele dia.
 */
function calendarioDoPainel(mes, hoje) {
  const eventos = R.eventosDoMes(d(), mes, hoje);
  const porDia = new Map();
  for (const e of eventos) { if (!porDia.has(e.data)) porDia.set(e.data, []); porDia.get(e.data).push(e); }
  const destino = (e) => (e.fechamento ? `#/fechamento?mes=${e.fechamento}` : e.cobranca_id ? `#/cobranca/${e.cobranca_id}` : e.tipo === 'Boleto' ? `#/cobrancas?comp=${C.somarMeses(e.data.slice(0, 7), -1)}`
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
      ${evs.slice(0, 7).map((e) => `<div class="cal-ev ${e.situacao}" title="${esc(`${e.tipo}: ${e.texto} (${e.estado})`)}">${esc(curto(e))}</div>`).join('')}
      ${evs.length > 7 ? `<div class="cal-mais">+${evs.length - 7}</div>` : ''}</div>`);
  }
  const semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const agendas = [...porDia].map(([dia, evs]) => `<div class="agenda-dia" data-agenda="${dia}" ${dia === hoje ? '' : 'hidden'}>
      <h3>${dataBr(dia)} · ${semana[C.paraData(dia).getUTCDay()]}${dia === hoje ? ' · hoje' : ''}</h3>
      ${evs.map((e) => `<div class="evento-cal">${etiqueta(e.tipo, 'info')} <a href="${destino(e)}">${esc(e.texto)}</a> ${etiqueta(e.estado, e.situacao)}</div>`).join('')}</div>`).join('');
  return `<div class="cartao" id="calendario"><div class="cabecalho"><div class="acoes"><h2 style="margin:0">Calendário de ${compBr(mes)}</h2>${link(`#/fechamento?mes=${mes}`, 'Abrir o fechamento do mês', 'botao pequeno')}</div>
      <div class="acoes">${link(`#/?mes=${C.somarMeses(mes, -1)}`, `← ${compBr(C.somarMeses(mes, -1))}`)} ${link('#/', 'Mês atual')} ${link(`#/?mes=${C.somarMeses(mes, 1)}`, `${compBr(C.somarMeses(mes, 1))} →`)}</div></div>
    <div class="cal-grade">${semana.map((s) => `<div class="cal-sem">${s}</div>`).join('')}${celulas.join('')}</div>
    ${agendas || ''}
    <p class="suave">Cada dia mostra até 7 itens (passe o mouse para ler o texto inteiro); clique no dia para ver a agenda completa, com os links. Cores: vermelho vencido, amarelo a fazer, verde feito, cinza previsto ou no boleto do inquilino. Boletos: gerados e previstos pelos contratos; IPTU: pelo vencimento da guia.</p></div>`;
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
  const todos = q.todos === '1';
  const lista = todos ? R.reajustesEntre(d(), de, ate) : R.reajustesNaoCorrigidos(d(), de, ate);
  const periodo = (x, y) => `#/reajustes?de=${x}&ate=${y}${todos ? '&todos=1' : ''}`;
  // índices em grade compacta: uma linha por mês (12 mais recentes), uma coluna por índice
  const colunas = [...new Set(d().indices_acumulados.map((x) => x.indice))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const meses = [...new Set(d().indices_acumulados.map((x) => x.mes_ref))].sort().reverse().slice(0, 12);
  const celula = (mes, nome) => {
    const x = d().indices_acumulados.find((y) => y.mes_ref === mes && y.indice === nome);
    return x ? `${pct(x.percentual)}${opera() ? ` ${botao('excluir', '×', { tabela: 'indices_acumulados', id: x.id }, 'link-botao excluir-mini', `Excluir ${x.indice} de ${compBr(mes)}?`)}` : ''}` : '<span class="suave">-</span>';
  };
  const nomesIndices = [...new Set(R.lista(d(), 'indices').flatMap((n) => n.replace(/\(.*\)/, '').split('/').map((x) => x.trim())).filter(Boolean))];
  return `<h1>Reajustes do aluguel</h1>
    <p class="suave">O aluguel é corrigido no 13º mês do contrato e a cada 12 meses depois. O mês de entrada conta como o 1º mês, seja qual for o dia em que o inquilino entrou. A carta vai junto com o boleto do mês anterior ao corrigido.</p>
    <div class="cartao"><h2>Índices acumulados em 12 meses</h2>
      <p class="suave">Informe o acumulado de 12 meses de cada índice, com o mês até onde ele vai. O reajuste de um aluguel usa o mais recente até o mês anterior ao corrigido.</p>
      ${opera() ? `<form data-form="indiceAcumulado" class="acoes"><select name="indice" style="width:auto">${nomesIndices.map((n) => `<option>${esc(n)}</option>`).join('')}</select>
        <input type="month" name="mes_ref" value="${atual}" style="width:170px" title="Mês até onde vai o acumulado"><input name="percentual" placeholder="% acumulado" inputmode="decimal" style="width:130px"><button class="pequeno">Incluir</button></form>` : ''}
      ${meses.length ? `<table class="indices-compacta"><tr><th>Acumulado até</th>${colunas.map((n) => `<th class="n">${esc(n)}</th>`).join('')}</tr>
      ${meses.map((m) => `<tr><td>${compBr(m)}</td>${colunas.map((n) => `<td class="n nw">${celula(m, n)}</td>`).join('')}</tr>`).join('')}</table>` : '<p class="suave">Nenhum índice informado.</p>'}</div>
    <div class="cartao rolagem" data-caixa="Reajustes"><div class="cabecalho"><h2>${todos ? 'Reajustes' : 'Reajustes ainda não corrigidos'} de ${compBr(de)} a ${compBr(ate)}</h2>
      <div class="acoes">${link(periodo(C.somarMeses(de, -3), C.somarMeses(ate, -3)), '← anteriores')} ${link(periodo(C.somarMeses(de, 3), C.somarMeses(ate, 3)), 'seguintes →')}
        ${link(`#/reajustes?de=${de}&ate=${ate}${todos ? '' : '&todos=1'}`, todos ? 'Mostrar só os não corrigidos' : 'Mostrar também os já corrigidos', 'botao secundario pequeno')}</div></div>
      ${todos ? '' : '<p class="suave">Aparecem só os contratos que ainda não tiveram o aluguel corrigido (os atrasados aparecem mesmo antes do período).</p>'}
      <table><tr><th>Aluguel de</th><th>Imóvel / inquilino</th><th>Índice</th><th class="n">Atual (bonificado)</th><th class="n">Novo (bonificado)</th><th>Carta e correção</th></tr>
      ${lista.map((r) => { const k = r.calculo; const i = buscar('imoveis', r.contrato.imovel_id); return `<tr class="${String(r.contrato.id) === q.contrato ? 'amarelo' : ''}"><td><b>${compBr(r.competencia)}</b><br><span class="suave">carta com o boleto de ${compBr(C.somarMeses(r.competencia, -1))}</span></td>
        <td><a href="#/contrato/${r.contrato.id}"><b>${esc(i ? i.nome : '')}</b></a><br>${esc(r.contrato.inquilino_nome)} · ${r.anos} ano(s)</td>
        <td>${esc(k.indiceContrato || 'não informado')}${k.escolhido ? `<br><span class="suave">usa ${esc(k.escolhido.indice)} ${pct(k.percentual)}</span>` : k.faltando.length ? `<br>${etiqueta(`falta ${k.faltando.join(' e ')}`, 'perigo')}` : ''}</td>
        <td class="n">${reais(k.atual)}${k.bonificacao ? ` <span class="suave">(${reais(k.atualBonificado)})</span>` : ''}</td>
        <td class="n">${k.novo !== null ? `<b>${reais(k.novo)}</b>${k.bonificacao ? ` <span class="suave">(${reais(k.novoBonificado)})</span>` : ''}` : '-'}</td>
        <td class="nw">${botoesReajuste(r.contrato, r)}</td></tr>`; }).join('') || `<tr><td colspan="6" class="suave">${todos ? 'Nenhum reajuste no período.' : 'Nenhum reajuste a corrigir no período.'}</td></tr>`}</table>
      <p class="suave">Valores: aluguel cheio e, entre parênteses, o valor bonificado (só aparece quando o contrato tem bonificação).</p></div>`;
}

/** Carta de reajuste com a logo: felicitações por mais um ano e os novos valores. */
function cartaReajuste(c, comp) {
  const i = buscar('imoveis', c.imovel_id);
  const r = R.reajusteNaCompetencia(d(), c, comp);
  const k = R.calcularReajuste(d(), c, comp);
  const empresa = K.locadorasDoContrato(d(), c)[0] || { nome: '' };
  const anterior = C.somarMeses(comp, -1);
  const vencNovo = C.vencimentoDaCompetencia(comp, c.dia_vencimento || 10, c.cobranca_mes_seguinte !== false);
  if (k.percentual === null) {
    return `<div class="alerta perigo nao-imprimir">Falta informar o índice acumulado de ${esc(k.faltando.join(' e ') || 'o índice do contrato')} até ${compBr(anterior)}. ${link('#/reajustes', 'Informar em Reajustes')}</div>`;
  }
  // caução: acompanha o aluguel corrigido (aluguéis × aluguel com bonificação); só aparece quando falta depositar
  let caucao = R.temCaucao(c) && c.caucao_meses > 0 ? { meses: c.caucao_meses, aluguel: k.novoBonificado, nova: c.caucao_meses * k.novoBonificado, atual: R.valorGarantia(d(), c) } : null;
  if (caucao && !(caucao.nova > caucao.atual)) caucao = null;
  return `<div class="carta">
    ${d().logo ? `${K.marcaDagua(d().logo)}<p><img class="carta-logo" src="${esc(d().logo)}" alt="Logo"></p>` : ''}
    <p class="carta-data">${esc((i && i.cidade) || 'Curitiba')}, ${dataExtenso(C.hojeIso())}.</p>
    <p>Prezado(a) <b>${esc(c.inquilino_nome)}</b>,<br>Imóvel: <b>${esc(i ? `${i.nome} - ${R.enderecoCompleto(i)}` : '')}</b></p>
    <p>Com o aluguel de <b>${MESES[Number(comp.slice(5, 7)) - 1]} de ${comp.slice(0, 4)}</b> completamos <b>${r ? r.anos : ''} ano${r && r.anos > 1 ? 's' : ''}</b> de parceria. Agradecemos a confiança e a pontualidade, e é uma satisfação ter você conosco.</p>
    <p>Conforme a cláusula de reajuste anual do contrato, o aluguel será corrigido pelo <b>${esc(k.escolhido.indice)}</b> acumulado nos últimos 12 meses: <b>${esc(k.escolhido.indice)} ${pct(k.percentual)}</b>.</p>
    <table class="carta-tabela"><tr><th></th><th class="n">Atual</th><th class="n">A partir do aluguel de ${compBr(comp)}</th></tr>
      <tr><td>Aluguel</td><td class="n">${reais(k.atual)}</td><td class="n"><b>${reais(k.novo)}</b></td></tr>
      ${k.bonificacao ? `<tr><td>Aluguel com bonificação (pagamento em dia)</td><td class="n">${reais(k.atualBonificado)}</td><td class="n"><b>${reais(k.novoBonificado)}</b></td></tr>` : ''}</table>
    <p>O novo valor será cobrado a partir do boleto do aluguel de <b>${compBr(comp)}</b>, com vencimento em <b>${dataBr(vencNovo)}</b>.${caucao ? '' : ' As demais condições do contrato permanecem as mesmas.'}</p>
    ${caucao ? `<p>Conforme o contrato, a caução dada em garantia equivale a <b>${caucao.meses} aluguéis</b> e acompanha o valor do aluguel corrigido. Por isso é necessário um depósito adicional:</p>
    <table class="carta-tabela"><tr><td>Caução já depositada</td><td class="n">${reais(caucao.atual)}</td></tr>
      <tr><td>Caução necessária (${caucao.meses} × aluguel atualizado)</td><td class="n">${reais(caucao.nova)}</td></tr>
      <tr><td><b>Depósito adicional</b></td><td class="n"><b>${reais(caucao.nova - caucao.atual)}</b></td></tr></table>
    <p>O depósito adicional será cobrado em <b>boleto separado</b>, com vencimento em <b>${dataBr(vencNovo)}</b>. As demais condições do contrato permanecem as mesmas.</p>` : ''}
    <p>Seguimos à sua disposição para sanar qualquer dúvida.</p>
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

/** Contas que nós pagamos num imóvel: lançar o mês de uma vez e ver os lançamentos. */
/** Mês sugerido para lançar contas: o atual, ou o mais recente (até 2 meses atrás) que tenha conta nossa. */
function mesComContas(imovelId) {
  const atual = C.competenciaDe(C.hojeIso());
  for (let k = 0; k <= R.MESES_DEPOIS_DE_ALUGAR; k += 1) {
    const m = C.somarMeses(atual, -k);
    if (R.contasPermitidas(d(), imovelId, m).tipos.length) return m;
  }
  return atual;
}

function telaContas(rota) {
  const i = buscar('imoveis', rota.partes[1]);
  if (!i) return '<h1>Imóvel não encontrado</h1>';
  const comp = rota.q.comp || mesComContas(i.id);
  const ultimos = R.ultimosValores(d(), i.id);
  const permitidas = R.contasPermitidas(d(), i.id, comp);
  const doMes = R.despesasDo(d(), i.id).filter((x) => x.competencia === comp);
  const hoje = C.hojeIso();
  const lista = R.despesasDo(d(), i.id).slice(0, 60);
  const linha = (tipo, n) => {
    const u = ultimos[tipo];
    const ja = doMes.filter((x) => x.tipo === tipo).reduce((t, x) => t + x.valor, 0);
    if (!permitidas.tipos.includes(tipo)) return '';
    return `<tr><td><b>${esc(tipo)}</b><input type="hidden" name="tipo_${n}" value="${esc(tipo)}"></td>
      <td><input name="valor_${n}" data-dinheiro inputmode="decimal" placeholder="${u ? F.dinheiroTexto(u.valor) : '0,00'}" style="width:130px"></td>
      <td><input type="date" name="data_${n}" value="${hoje}" style="width:auto"></td>
      <td><input name="obs_${n}" placeholder="${tipo === 'Outra' ? 'qual conta? (ex.: taxa de lixo)' : 'opcional'}"></td>
      <td class="suave nw">${u ? `último: ${reais(u.valor)} (${compBr(u.competencia)})` : ''}${ja ? `<br><b>já lançado neste mês: ${reais(ja)}</b>` : ''}</td></tr>`;
  };
  return `<p class="suave"><a href="#/resultados">← Resultados</a> · <a href="#/imovel/${i.id}">${esc(i.nome)}</a></p>
    <h1>Contas pagas por nós · ${esc(i.nome)}</h1>
    <div class="alerta ${permitidas.tipos.length ? 'info' : 'aviso'}">${{
    vago: `<b>Imóvel vago em ${compBr(comp)}:</b> as contas são nossas.`,
    alugou: `<b>Alugado há pouco</b> (entrada de ${esc(permitidas.contrato ? permitidas.contrato.inquilino_nome : '')} em ${permitidas.contrato ? dataBr(permitidas.contrato.data_entrada) : ''}): até ${R.MESES_DEPOIS_DE_ALUGAR} meses depois de alugar, dá para lançar as contas do período vago que chegam atrasadas.`,
    incluso: `<b>Pelo contrato do inquilino</b>, estas contas estão incluídas no aluguel e são nossas: ${esc(permitidas.tipos.join(', '))}.`,
    inquilino: `<b>Em ${compBr(comp)} o inquilino paga todas as contas</b>, conforme o contrato. Não há conta nossa para lançar neste mês.`,
  }[permitidas.motivo]}
      O IPTU pago por nós é lançado na caixa do IPTU do imóvel (já abate dos resultados).</div>
    <form class="cartao" data-form="lancarContas">
      <input type="hidden" name="imovel" value="${i.id}">
      <div class="acoes" style="margin-bottom:10px"><label style="margin:0">Mês da conta</label><input type="month" name="competencia" value="${comp}" style="width:auto" data-trocar-mes="${i.id}">
        ${permitidas.tipos.length ? '<button type="button" class="secundario pequeno" data-acao="repetirContas">Repetir os últimos valores</button>' : ''}</div>
      <div class="rolagem"><table><tr><th>Conta</th><th>Valor pago</th><th>Pago em</th><th>Observação</th><th></th></tr>
        ${R.TIPOS_DESPESA.map(linha).join('')}</table></div>
      <p class="suave">Preencha só as contas pagas. Entram nos Resultados pela data do pagamento. "Repetir os últimos valores" copia o último valor de cada conta (bom para condomínio e valores fixos).</p>
      ${permitidas.tipos.length ? '<div class="acoes"><button>Lançar</button></div>' : ''}</form>
    <div class="cartao"><h2>Lançamentos</h2><div class="rolagem"><table><tr><th>Mês</th><th>Conta</th><th class="n">Valor</th><th>Pago em</th><th>Observação</th><th></th></tr>
      ${lista.map((x) => `<tr><td>${compBr(x.competencia)}</td><td>${esc(x.tipo)}</td><td class="n">${reais(x.valor)}</td><td>${dataBr(x.data_pagamento)}</td><td>${esc(x.observacoes || '')}</td>
        <td class="n">${opera() ? botao('excluir', 'Excluir', { tabela: 'despesas', id: x.id }, 'perigo pequeno', `Excluir ${x.tipo} de ${compBr(x.competencia)} (${reais(x.valor)})?`) : ''}</td></tr>`).join('')
      || '<tr><td colspan="6" class="suave">Nenhuma conta lançada.</td></tr>'}</table></div></div>`;
}

/** Abas da página Resultados. */
const abasResultados = (atual) => `<div class="abas">${[['resultados', '#/resultados', 'Resultados por imóvel'], ['impostos', '#/impostos', 'Impostos']]
  .map(([k, h, t]) => `<a href="${h}" class="${k === atual ? 'ativo' : ''}">${t}</a>`).join('')}</div>`;

/**
 * Impostos: guia esperada por empresa no mês, pelo faturamento das NFs emitidas (PIS/COFINS mensal; IRPJ e CSLL
 * trimestrais, acumulando mês a mês). O contador faz o cálculo oficial: o valor dele fica ao lado.
 */
function telaImpostos(comp) {
  const lista = R.impostosDoMes(d(), comp);
  const tri = R.trimestreDe(comp);
  const nTri = Number(tri.slice(-1));
  const meses = R.mesesDoTrimestre(comp);
  const nomeMes = (m) => compBr(m);
  const guiaLinha = (e, g) => {
    const dif = g.contador ? g.contador.valor - g.aPagar : null;
    return `<tr><td><b>${esc(g.imposto)}</b><br><span class="suave">${g.mensal ? `guia mensal de ${compBr(comp)}` : `guia do ${nTri}º trimestre (${nomeMes(meses[0])} a ${nomeMes(meses[2])})`}</span></td>
      <td class="n">${reais(g.base)}${g.mensal ? '' : `<br><span class="suave">${meses.filter((m) => m <= comp).length} de 3 meses</span>`}</td>
      <td class="n">${pct(g.aliquota)}</td>
      <td class="n"><b>${reais(g.esperado)}</b>${g.mensal ? '' : `<br>${etiqueta(meses[2] === comp ? 'guia completa' : 'parcial: acumula até ' + compBr(meses[2]), meses[2] === comp ? 'ok' : 'info')}`}
        ${g.adicional ? `<br><span class="suave">inclui adicional de ${reais(g.adicional)} (10% do lucro presumido acima de R$ 60.000,00)</span>` : ''}
        ${g.lc224 ? `<br><span class="suave">LC 224: presunção de 35,2% sobre ${reais(Math.abs(g.lc224))} ${g.lc224 > 0 ? 'acima do limite' : '(acerto do ano: devolve)'}</span>` : ''}
        <br><span class="suave">vence até ${dataBr(g.vencimento)}</span>
        ${g.transportado ? `<br><span class="suave">+ ${reais(g.transportado)} de guia(s) anterior(es) abaixo de R$ 10,00</span><br>a pagar: <b>${reais(g.aPagar)}</b>` : ''}
        ${g.abaixoDoMinimo ? `<br>${etiqueta('abaixo de R$ 10,00: não se paga; passa para a próxima guia', 'aviso')}` : ''}
        ${!g.mensal && meses[2] === comp && g.esperado >= 200000 ? '<br><span class="suave">pode pagar em até 3 cotas (mín. R$ 1.000,00 cada; 2ª e 3ª com juros)</span>' : ''}</td>
      <td class="nw">${opera() ? `<form data-form="guiaImposto" class="acoes" data-emitente="${e.id}" data-imposto="${esc(g.imposto)}" data-periodo="${g.periodo}">
        <input name="valor" inputmode="decimal" data-dinheiro placeholder="valor do contador" value="${g.contador ? reais(g.contador.valor, false) : ''}" style="width:150px"><button class="secundario pequeno">Salvar</button></form>`
    : (g.contador ? reais(g.contador.valor) : '-')}</td>
      <td class="n">${dif === null ? '<span class="suave">-</span>' : dif === 0 ? etiqueta('igual', 'ok') : `<span class="${Math.abs(dif) > 100 ? 'texto-aviso' : 'suave'}">${dif > 0 ? '+' : '-'} ${reais(Math.abs(dif))}</span>`}</td></tr>`;
  };
  return `<h1>Resultados financeiros</h1>${abasResultados('impostos')}
    <div class="cabecalho"><h2>Impostos de ${compBr(comp)}</h2>
      <div class="acoes"><a class="botao secundario" href="#/impostos?mes=${C.somarMeses(comp, -1)}">← ${compBr(C.somarMeses(comp, -1))}</a>
      <form data-form="irImpostos" class="acoes"><input type="month" name="mes" value="${comp}" style="width:160px"><button class="secundario">Ir</button></form>
      <a class="botao secundario" href="#/impostos?mes=${C.somarMeses(comp, 1)}">${compBr(C.somarMeses(comp, 1))} →</a></div></div>
    <p class="suave">Guia esperada, calculada pelo faturamento das NFs emitidas (data de emissão; NFs canceladas não entram). Atualiza sozinha a cada NF emitida.
      PIS/COFINS (${pct(3.65)}): guia mensal, vence no dia 25 do mês seguinte. IRPJ (${pct(4.8)}) e CSLL (${pct(2.88)}): 15% e 9% sobre o lucro presumido (32% do faturamento), guia trimestral (1º trimestre: NFs de janeiro a março; 2º: abril a junho; 3º: julho a setembro; 4º: outubro a dezembro), acumulando mês a mês até a guia completa no último mês do trimestre; vence no último dia útil do mês seguinte ao trimestre.
      IRPJ tem adicional de 10% sobre o lucro presumido acima de R$ 60.000,00 no trimestre (faturamento acima de R$ 187.500,00). Desde 2026 (LC 224/2025), a presunção é de 35,2% na parte do faturamento do ano acima de R$ 5 milhões, controlada por trimestre (R$ 1.250.000,00; IRPJ desde janeiro e CSLL desde abril de 2026). Vencimentos em fim de semana ou feriado nacional vêm para o dia útil anterior. Guia abaixo de R$ 10,00 não se paga: o valor passa para a guia seguinte do mesmo imposto até somar R$ 10,00 (Lei 9.430/96, art. 68).
      O contador faz o cálculo oficial: informe o valor da guia dele ao lado para comparar.</p>
    ${lista.map((x) => `<div class="cartao rolagem"><div class="cabecalho"><h2>${esc(x.empresa.nome)}</h2>
        <span>Faturamento de NF em ${compBr(comp)}: <b>${reais(x.faturamento.valor)}</b> <span class="suave">(${x.faturamento.notas} NF(s))</span></span></div>
      <p class="suave">${nTri}º trimestre até agora: ${x.porMes.map((m) => `${compBr(m.mes)} ${reais(m.valor)}`).join(' + ')} = <b>${reais(x.trimestre)}</b></p>
      <table><tr><th>Imposto</th><th class="n">Base (faturamento)</th><th class="n">Alíquota</th><th class="n">Guia esperada</th><th>Valor do contador</th><th class="n">Diferença</th></tr>
        ${x.guias.map((g) => guiaLinha(x.empresa, g)).join('')}
        <tr class="total"><td colspan="3">Total a pagar no mês${meses[2] === comp ? '' : ' (IRPJ e CSLL ainda parciais)'}</td><td class="n">${reais(x.guias.reduce((t, g) => t + (g.abaixoDoMinimo ? 0 : g.aPagar), 0))}</td>
          <td>${x.guias.some((g) => g.contador) ? reais(x.guias.reduce((t, g) => t + (g.contador ? g.contador.valor : 0), 0)) : ''}</td><td></td></tr></table></div>`).join('')
      || '<div class="cartao"><p class="suave">Nenhuma empresa cadastrada. Cadastre em Dados e backup → Empresas.</p></div>'}`;
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
  return `<h1>Resultados financeiros</h1>${abasResultados('resultados')}
    <form class="cartao acoes" data-form="filtroResultados"><label style="margin:0">De</label><input type="date" name="de" value="${de}" style="width:160px"><label style="margin:0">até</label><input type="date" name="ate" value="${ate}" style="width:160px"><button class="secundario">Ver</button>
      ${atalhos} ${botao('excelResultados', 'Exportar Excel', { de, ate }, 'pequeno')}</form>
    <div class="cartao rolagem"><table><tr><th>#</th><th>Imóvel</th><th class="n">Valor do imóvel + reformas</th><th class="n">Aluguel recebido</th><th class="n">NFs avulsas</th><th class="n">IPTU pago pelo proprietário</th><th class="n">Contas pagas por nós</th><th class="n">Resultado</th><th class="n">Retorno ao ano</th><th>Reformas no período</th></tr>
      ${lista.map((x, n) => `<tr class="${x.controle ? 'linha-controle' : ''}"><td>${x.retornoAnual !== null && !x.controle ? n + 1 : ''}</td><td><a href="#/imovel/${x.imovel.id}"><b>${esc(x.imovel.nome)}</b></a><br><span class="suave">${x.mesesPagos} pagamento(s)</span>${x.controle ? `<br>${etiqueta('boleto de controle: não conta', 'controle')}` : ''}</td>
        <td class="n">${x.base ? reais(x.base) : '<span class="suave">-</span>'}</td><td class="n">${reais(x.aluguel)}</td><td class="n">${reais(x.avulsas)}</td><td class="n">${x.iptu ? `- ${reais(x.iptu)}` : '-'}</td>
        <td class="n nw">${x.contas ? `<a href="#/contas/${x.imovel.id}">- ${reais(x.contas)}</a>` : '-'}${opera() && R.contasPermitidas(d(), x.imovel.id, mesComContas(x.imovel.id)).tipos.length ? `<br>${link(`#/contas/${x.imovel.id}`, '+ incluir contas', 'link-botao destaque-contas')}` : ''}</td>
        <td class="n"><b>${reais(x.resultado)}</b></td><td class="n"><b>${pctTxt(x.retornoAnual)}</b>${x.retornoAnual ? `<div class="barra"><span style="width:${Math.max(2, (x.retornoAnual / maior) * 100).toFixed(0)}%"></span></div>` : ''}</td>
        <td class="n">${x.reformasPeriodo ? reais(x.reformasPeriodo) : '-'}</td></tr>`).join('') || '<tr><td colspan="10" class="suave">Nenhum imóvel.</td></tr>'}
      <tr class="total"><td></td><td>Total</td><td class="n">${reais(tot('base'))}</td><td class="n">${reais(tot('aluguel'))}</td><td class="n">${reais(tot('avulsas'))}</td><td class="n">${reais(tot('iptu'))}</td><td class="n">${reais(tot('contas'))}</td><td class="n">${reais(tot('resultado'))}</td>
        <td class="n">${tot('base') ? pctTxt((tot('resultado') * 12 / (lista[0] ? lista[0].meses : 12) / tot('base')) * 100) : '-'}</td><td class="n">${reais(tot('reformasPeriodo'))}</td></tr></table>
    <p class="suave">Alimentado pelo histórico: aluguel recebido = valor da NF de cada boleto pago no período (aluguel com desconto, ou com multa e juros quando atrasou; sem IPTU, seguro e tarifa, que são repasses), mais as NFs avulsas ligadas ao imóvel. Boletos de controle (inquilino sem NF) não entram. Desconta o IPTU pago pelo proprietário (imóvel vazio) e as contas pagas por nós (água, luz, gás, condomínio... de imóvel vago ou incluídas no aluguel), pela data do pagamento; lance em "+ incluir contas". Retorno ao ano = resultado do período convertido para 12 meses ÷ (valor do imóvel + reformas até a data). Cadastre o valor em "Editar imóvel" e as reformas na página do imóvel.</p></div>`;
}

async function telaImprimir(rota) {
  const tipo = rota.partes[1];
  // "Baixar PDF" da página: o que está em ``seletor``, com o nome do arquivo
  const voltar = (pdf = null) => `<div class="acoes nao-imprimir" style="margin:12px 0"><button data-acao="imprimir">Imprimir</button>${pdf ? botao('baixarPdfTela', 'Baixar PDF', pdf, 'secundario') : ''}<button class="secundario" data-acao="voltar">Voltar</button></div>`;
  if (tipo === 'carta') {
    const c = buscar('contratos', rota.q.contrato);
    if (!c) return '<p>Inquilino não encontrado.</p>';
    const r = R.reajusteNaCompetencia(d(), c, rota.q.comp);
    const carta = cartaReajuste(c, rota.q.comp);
    // sem o índice, não há carta (só o aviso): sem botão de PDF
    return `<div class="impressao">${voltar(carta.includes('class="carta"') ? { seletor: '.impressao .carta', nome: nomeArquivoDoc('Carta reajuste', c, rota.q.comp || '') } : null)}
      ${r && opera() ? `<div class="acoes nao-imprimir" style="margin-bottom:12px">${botoesReajuste(c, r, true)}</div>` : ''}
      ${carta}</div>`;
  }
  if (['contrato', 'vistoria', 'chaves', 'aditivo'].includes(tipo)) {
    const m = await documentoMontado(tipo, rota.q);
    if (!m) return '<p>Registro não encontrado.</p>';
    const falta = K.pendenciasDoContrato(d(), m.c);
    const volta = tipo === 'contrato' ? `#/contrato-gerar/${m.c.id}?modelo=${m.modelo.id}` : `#/contrato/${m.c.id}?ir=${tipo === 'aditivo' ? 'aditivos' : 'documentos'}`;
    return `<div class="impressao">
      <div class="acoes nao-imprimir" style="margin:12px 0"><button data-acao="imprimir">Imprimir / salvar em PDF</button>${botao('documentoPdf', 'Baixar PDF', {}, 'secundario')}${botao('documentoWord', 'Baixar Word', {}, 'secundario')}
        ${tipo === 'vistoria' && opera() ? link(`#/vistoria/${m.v.id}`, 'Editar a vistoria', 'botao secundario') : ''}
        ${tipo === 'aditivo' && opera() && !m.a.arquivo ? link(`#/aditivo/${m.a.id}`, 'Editar o aditivo', 'botao secundario') : ''}
        <a class="botao secundario" href="${volta}">Voltar</a></div>
      ${falta.length ? `<div class="alerta aviso nao-imprimir"><b>Faltam dados no cadastro:</b> ${falta.map(esc).join('; ')}.</div>` : ''}
      ${tipo === 'vistoria' && m.semSituacao ? `<div class="alerta aviso nao-imprimir">${m.semSituacao} item(ns) do modelo ficaram sem situação e não saem no documento.</div>` : ''}
      ${tipo === 'chaves' && !m.temChaves ? `<div class="alerta aviso nao-imprimir">Sem a relação de chaves: o recibo sai com linhas em branco. Informe as chaves no imóvel (Editar) ou na vistoria de entrada.</div>` : ''}
      ${K.contratoHtml(m.blocos, { logo: d().logo, rodape: m.rodape })}</div>`;
  }
  if (tipo === 'demonstrativos') {
    const ids = rota.q.ids ? new Set(rota.q.ids.split(',').map(Number)) : null;
    const nomeImovel = (cb) => ((buscar('imoveis', (buscar('contratos', cb.contrato_id) || {}).imovel_id) || {}).nome || '');
    const lista = d().cobrancas.filter((x) => x.competencia === rota.q.comp && (!ids || ids.has(x.id)))
      .sort((a, b) => nomeImovel(a).localeCompare(nomeImovel(b), 'pt-BR'));
    const um = lista.length === 1 && buscar('contratos', lista[0].contrato_id);
    const nome = um ? nomeArquivoDoc('Demonstrativo boleto', um, lista[0].competencia) : S.limparNome(`Demonstrativos boletos ${rota.q.comp || ''}`);
    return `<div class="impressao">${voltar(lista.length ? { seletor: '.lista-demonstrativos', nome } : null)}<div class="lista-demonstrativos">${lista.map(demonstrativo).join('') || '<p>Nenhum boleto.</p>'}</div></div>`;
  }
  let fs = d().faturas.filter((f) => f.situacao === 'Emitida');
  const numeros = rota.q.numeros ? new Set(rota.q.numeros.split(',').map(Number)) : null;
  fs = numeros ? fs.filter((f) => numeros.has(f.numero)) : rota.q.numero ? fs.filter((f) => f.numero === Number(rota.q.numero)) : fs.filter((f) => f.emissao.slice(0, 7) === rota.q.mes);
  fs.sort((a, b) => a.numero - b.numero || a.id - b.id);
  return `<div class="impressao">${voltar()}${rota.q.numero && fs.length ? `<p class="nao-imprimir acoes">${fs.map((f) => botao('pdf', `Baixar PDF${fs.length > 1 ? ` (${esc(buscar('emitentes', f.emitente_id).nome)})` : ''}`, { id: f.id }, 'secundario pequeno')).join('')}${botao('excel', 'Baixar este número em Excel', { numero: rota.q.numero })}</p>` : ''}
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
  const dados = K.dadosDoContrato(d(), c, { data: q.data || c.vigencia_inicio || C.hojeIso(), testemunhas });
  return { c, modelo, dados, blocos: K.montarContrato(modelo.texto, dados) };
}

/**
 * PDF A4 do documento que está na tela: a imagem do documento é cortada em folhas, sempre entre um bloco e outro
 * (parágrafo, linha de tabela, foto, assinatura), com o rodapé das empresas e "Página X de Y" embaixo.
 */
async function pdfDoDocumento(el, rodape = [], { margemLado = 0 } = {}) {
  const { html2canvas, jsPDF } = await bibliotecasPdf();
  const caixa = el.getBoundingClientRect();
  const topo = caixa.top;
  // o link das fotos continua clicável no PDF (área do link na folha certa)
  const links = [...el.querySelectorAll('.ct-link a')].map((a) => { const x = a.getBoundingClientRect(); return { url: a.href, x: x.left - caixa.left, y: x.top - topo, w: x.width, h: x.height }; });
  const cortes = [...el.querySelectorAll('.ct-pagina > * > tr > td > *, .ct-tabela tr, .ct-fotos figure, .ct-grupo-assina, .ct-assina, .demonstrativo, tr, p, li, h2, h3')]
    .map((x) => x.getBoundingClientRect().bottom - topo).sort((a, b) => a - b);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', onclone: (doc) => {
    doc.querySelectorAll('.ct-rodape').forEach((x) => x.remove());
    doc.querySelectorAll('.contrato').forEach((x) => { x.style.border = '0'; x.style.boxShadow = 'none'; });
  } });
  const escala = canvas.width / el.offsetWidth;
  const largura = 210 - 2 * margemLado;
  const pxMm = el.offsetWidth / largura;
  const [margemTopo, margemPe] = [12, 24];
  const alturaFolha = (297 - margemTopo - margemPe) * pxMm;
  const total = el.offsetHeight;
  const fatias = [];
  for (let ini = 0; ini < total - 1;) {
    if (fatias.length && !cortes.some((y) => y > ini + 2)) break; // depois do último bloco só há espaço em branco
    let fim = ini + alturaFolha;
    if (fim >= total) fim = total;
    else fim = cortes.filter((y) => y > ini + alturaFolha * 0.4 && y <= fim).pop() || fim;
    fatias.push([ini, fim]);
    ini = fim;
  }
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  fatias.forEach(([ini, fim], n) => {
    if (n) pdf.addPage();
    const pedaco = document.createElement('canvas');
    pedaco.width = canvas.width;
    pedaco.height = Math.round((fim - ini) * escala);
    pedaco.getContext('2d').drawImage(canvas, 0, Math.round(ini * escala), canvas.width, pedaco.height, 0, 0, canvas.width, pedaco.height);
    pdf.addImage(pedaco.toDataURL('image/jpeg', 0.92), 'JPEG', margemLado, margemTopo, largura, (fim - ini) / pxMm);
    for (const l of links.filter((x) => x.y >= ini && x.y < fim)) pdf.link(margemLado + l.x / pxMm, margemTopo + (l.y - ini) / pxMm, l.w / pxMm, l.h / pxMm, { url: l.url });
    pdf.setFontSize(8).setTextColor(102);
    pdf.text(`Página ${n + 1} de ${fatias.length}`, 190, 297 - margemPe + 6, { align: 'right' });
    pdf.setDrawColor(153).line(20, 297 - margemPe + 8, 190, 297 - margemPe + 8);
    rodape.forEach((linha, k) => pdf.text(linha, 105, 297 - margemPe + 12 + k * 3.5, { align: 'center' }));
  });
  return pdf.output('blob');
}

/** Nome dos arquivos baixados: "Documento Imóvel - Inquilino - ano de entrada" (ex.: "Contrato locação Loja 1 - Maria - 2026"). */
function nomeArquivoDoc(documento, c, fim = String(c.data_entrada || c.vigencia_inicio || '').slice(0, 4)) {
  const i = buscar('imoveis', c.imovel_id);
  return S.limparNome(`${documento} ${i ? i.nome : 'sem imóvel'} - ${c.inquilino_nome}${fim ? ` - ${fim}` : ''}`);
}

/** Contrato, vistoria ou recibo das chaves, prontos para a tela, o PDF e o Word. */
async function documentoMontado(tipo, q) {
  if (tipo === 'contrato') {
    const m = contratoMontado(q);
    return m && { ...m, rodape: m.dados.rodape, nome: 'Contrato', arquivo: nomeArquivoDoc('Contrato locação', m.c) };
  }
  if (tipo === 'vistoria') {
    const v = buscar('vistorias', q.id);
    const c = v && buscar('contratos', v.contrato_id);
    if (!c) return null;
    const momento = v.tipo === 'Saída' ? 'Saída do inquilino' : 'Entrada do inquilino';
    const leitura = R.leiturasDo(d(), c.id).find((l) => l.momento === momento) || null;
    const entrada = v.tipo === 'Saída' ? R.vistoriasDo(d(), c.id).find((x) => x.tipo === 'Entrada') : null;
    const fotos = await fotosDaVistoria(v);
    const semSituacao = (v.itens || []).filter((x) => !x.situacao).length;
    const arquivo = nomeArquivoDoc(`Vistoria ${v.tipo.toLocaleLowerCase('pt-BR')}`, c, String(c.data_entrada || v.data || '').slice(0, 4));
    return { c, v, semSituacao, arquivo, ...K.vistoriaBlocos(d(), c, v, leitura, fotos, entrada ? entrada.itens || [] : null), nome: `Vistoria de ${v.tipo.toLocaleLowerCase('pt-BR')}` };
  }
  if (tipo === 'aditivo') {
    const a = buscar('aditivos', q.id);
    const c = a && buscar('contratos', a.contrato_id);
    if (!c || !a.texto) return null;
    const dados = K.dadosDoAditivo(d(), c, a);
    return { c, a, blocos: K.montarContrato(a.texto, dados), rodape: dados.rodape, nome: 'Termo aditivo',
      arquivo: nomeArquivoDoc(`Termo aditivo ${a.numero || 1} vencimento`, c, String(a.data || '').slice(0, 4)) };
  }
  const c = buscar('contratos', q.contrato);
  if (!c) return null;
  const chaves = chavesDoContrato(c);
  return { c, temChaves: !!chaves.trim(), ...K.reciboChavesBlocos(d(), c, chaves, q.data || ''), nome: 'Recibo de entrega das chaves', arquivo: nomeArquivoDoc('Recibo entrega chaves', c) };
}

/** Chaves do contrato: as da vistoria de entrada; senão, as cadastradas no imóvel. */
function chavesDoContrato(c) {
  const entrada = R.vistoriasDo(d(), c.id).find((v) => v.tipo === 'Entrada');
  return (entrada && entrada.chaves) || (buscar('imoveis', c.imovel_id) || {}).chaves || '';
}

/** Roteiro por cômodo: o que conferir em cada um (o que ficar sem preencher não sai no documento). */
const ROTEIRO_BASE = ['Piso e rodapé', 'Paredes e teto (pintura, manchas, fissuras, furos)', 'Porta, fechadura e chave', 'Janela, vidros, grade e trinco',
  'Tomadas e interruptores (quantidade e voltagem)', 'Iluminação (luminárias e lâmpadas)'];
const ROTEIROS = {
  Sala: [...ROTEIRO_BASE, 'Cortinas / persianas', 'Móveis e decoração (item, quantidade e estado)'],
  Quarto: [...ROTEIRO_BASE, 'Guarda-roupa / armários (portas, gavetas, trilhos)', 'Cortina / blackout', 'Cama, colchão e roupa de cama', 'Outros móveis e decoração'],
  Cozinha: [...ROTEIRO_BASE, 'Revestimento e rejunte', 'Pia, cuba e torneira', 'Armários (portas e gavetas)', 'Eletrodomésticos (marca, estado e funcionamento)', 'Utensílios (conforme fotos)'],
  Banheiro: [...ROTEIRO_BASE, 'Revestimento e rejunte', 'Vaso sanitário, assento e descarga', 'Pia, gabinete e torneira', 'Box e chuveiro (voltagem / potência)', 'Ducha higiênica',
    'Acessórios (papeleira, porta-toalhas, saboneteira, lixeira)', 'Espelho', 'Exaustor'],
  Lavanderia: [...ROTEIRO_BASE, 'Tanque e torneiras', 'Varal', 'Quadro de disjuntores', 'Máquina de lavar e outros itens'],
  Corredor: ['Piso e rodapé', 'Paredes e teto', 'Portas', 'Iluminação'],
  Escada: ['Piso / degraus', 'Paredes e teto', 'Corrimão', 'Porta de acesso e trancas', 'Iluminação'],
  'Área externa': ['Piso', 'Muros e pintura / textura', 'Tanque e torneiras externas', 'Tomadas externas', 'Iluminação', 'Caixa de gordura / esgoto'],
  Fachada: ['Muros, portão e pintura', 'Beiral, calhas e rufos', 'Telhado', 'Forro externo', 'Grades e janelas', 'Iluminação e tomadas externas', 'Jardim, vasos e outros itens'],
  Garagem: ['Piso', 'Portão eletrônico, controles e motor', 'Vagas (quantidade, marcadas ou não)', 'Iluminação', 'Depósito / outros'],
};
const roteiroTexto = (comodo) => `## ${comodo}\n${ROTEIROS[comodo].map((x) => `- ${x}: `).join('\n')}\n`;

function telaVistoria(rota) {
  const id = rota.partes[1];
  const v = id === 'novo' ? null : buscar('vistorias', id);
  if (id !== 'novo' && !v) return '<h1>Vistoria não encontrada</h1>';
  const c = buscar('contratos', v ? v.contrato_id : rota.q.contrato);
  if (!c) return '<h1>Inquilino não encontrado</h1>';
  const tipo = v ? v.tipo : (rota.q.tipo === 'Saída' ? 'Saída' : 'Entrada');
  const i = buscar('imoveis', c.imovel_id) || {};
  const entrada = R.vistoriasDo(d(), c.id).find((x) => x.tipo === 'Entrada');
  // ponto de partida: na saída, a vistoria de entrada deste inquilino; na entrada, a última vistoria do imóvel
  const base = v || (tipo === 'Saída' ? entrada : R.ultimaVistoriaDoImovel(d(), i.id)) || {};
  const valor = (k, padrao = '') => esc(v ? (v[k] ?? '') : (base[k] ?? padrao));
  const data = v ? v.data : (tipo === 'Saída' ? c.data_saida : c.data_entrada) || C.hojeIso();
  // editar o modelo do imóvel no meio da vistoria: ao salvar, volta para cá (o que já foi marcado fica no rascunho)
  const aqui = v ? `#/vistoria/${v.id}` : `#/vistoria/novo?contrato=${c.id}&tipo=${tipo === 'Saída' ? 'Sa%C3%ADda' : 'Entrada'}`;
  const linkModelo = (texto) => (opera() && i.id ? link(`#/modelo-vistoria/${i.id}?voltar=${encodeURIComponent(aqui)}`, texto) : '');
  const grade = gradeVistoria(i, v, base, tipo === 'Saída' ? entrada : null, linkModelo);
  // textos padrão que podem ser trocados: vêm desta vistoria, da anterior do imóvel ou do padrão
  const abertura = (v ? v.texto_abertura : base.texto_abertura) || (v && !v.link_fotos ? K.VISTORIA_ABERTURA_SEM_LINK : K.VISTORIA_ABERTURA);
  const textoFinal = (v ? v.texto_final : base.texto_final) || K.vistoriaFinal((v && v.prazo_dias) || 3);
  return `<p class="suave"><a href="#/contrato/${c.id}?ir=documentos">← ${esc(c.inquilino_nome)}</a></p>
    <h1>Vistoria de ${tipo.toLocaleLowerCase('pt-BR')} · ${esc(i.nome || '')}</h1>
    ${!v && base.id ? `<div class="alerta info">Texto inicial copiado da ${tipo === 'Saída' ? 'vistoria de entrada deste inquilino' : `última vistoria do imóvel (${esc(base.tipo.toLocaleLowerCase('pt-BR'))} de ${dataBr(base.data)})`}. Confira cômodo por cômodo e ajuste o que mudou.</div>` : ''}
    ${tipo === 'Saída' && !grade ? '<div class="alerta aviso">Na saída, compare item por item com a entrada. Onde houver dano ou falta, escreva <b>DIFERENÇA:</b> e o que mudou (ex.: "DIFERENÇA: parede da sala com furos de quadro"). Esses pontos são os que o inquilino paga.</div>' : ''}
    ${grade ? '' : `<div class="alerta info">Este imóvel ainda não tem <b>modelo de vistoria</b>. ${linkModelo('Montar o modelo do imóvel')} Montado uma vez, a vistoria vira só marcar a situação de cada item.</div>`}
    <form class="cartao" data-form="vistoria" data-rascunho="vistoria-${c.id}-${tipo === 'Saída' ? 'saida' : 'entrada'}-${v ? v.id : 'nova'}">
      <input type="hidden" name="id" value="${v ? v.id : ''}"><input type="hidden" name="contrato" value="${c.id}"><input type="hidden" name="tipo" value="${tipo}">
      <div class="formulario">
        <div><label>Data da vistoria</label><input type="date" name="data" value="${esc(data)}" required></div>
        <div><label>Link das fotos (pasta na nuvem)</label><input name="link_fotos" value="${esc(v ? v.link_fotos || '' : (tipo === 'Entrada' ? c.vistoria_link || '' : ''))}" placeholder="deixe vazio se as fotos vão em anexo"></div>
      </div>
      <p><label>Texto de abertura <span class="suave">(o link das fotos sai na linha de baixo)</span></label><textarea name="texto_abertura" rows="3">${esc(abertura)}</textarea></p>
      <p><label>Chaves e controles ${tipo === 'Saída' ? 'devolvidos' : 'que serão entregues'} <span class="suave">(um por linha, com a quantidade)</span></label>
        <textarea name="chaves" rows="5">${v ? esc(v.chaves || '') : (tipo === 'Saída' && entrada ? esc(entrada.chaves || '') : esc(i.chaves || base.chaves || ''))}</textarea></p>
      ${tipo === 'Entrada' ? '<p class="check"><label><input type="checkbox" name="atualizar_imovel" value="1" checked> Guardar esta relação de chaves também no imóvel (para o recibo e as próximas vistorias)</label></p>' : ''}
      ${grade}
      <h2>Fotos que vão no documento</h2>
      <p class="suave">A fachada vai na capa; os relógios e o quadro de disjuntores, na página de registros. As fotos gerais e de detalhe continuam no link da nuvem. Enviar outra foto substitui a anterior.</p>
      <div class="formulario">${K.FOTOS_VISTORIA.map(([k, t]) => `<div><label>${esc(t)}</label><input type="file" name="foto_${k}" accept="image/*">${v && v.fotos && v.fotos[k] && opera() ? F.arquivoGuardado(k, v.fotos[k], 'excluirFotoVistoria', { vistoria: v.id }) : ''}</div>`).join('')}</div>
      <p><label>${grade ? 'Outras observações (opcional)' : 'Descritivo do imóvel'}</label>
        <span class="suave">Uma linha por item. <code>## SALA</code> abre um cômodo; <code>- item: estado</code> vira marcador. Item do roteiro que ficar sem preencher (termina em ":") não sai no documento.
        Use sempre as mesmas palavras para o estado: <b>novo · bom estado · com marcas de uso · com avaria (descrever) · não funciona</b>, e cite o nº da foto quando houver avaria.</span>
        <span class="acoes" style="margin:8px 0">Inserir roteiro: ${Object.keys(ROTEIROS).map((k) => `<button type="button" class="secundario pequeno" data-acao="inserirRoteiro" data-comodo="${esc(k)}">${esc(k)}</button>`).join('')}</span>
        <textarea name="descritivo" class="texto-modelo">${valor('descritivo')}</textarea></p>
      <p><label>Condições gerais</label><textarea name="condicoes" rows="6">${valor('condicoes', K.VISTORIA_CONDICOES)}</textarea></p>
      ${tipo === 'Entrada' ? `<p><label>Texto final <span class="suave">(prazo para o inquilino contestar e devolução do imóvel)</span></label><textarea name="texto_final" rows="4">${esc(textoFinal)}</textarea></p>` : ''}
      <div class="acoes"><button>Salvar e ver o documento</button><a class="botao secundario" href="#/contrato/${c.id}?ir=documentos">Cancelar</a></div></form>`;
}

/** Grade da vistoria pelo modelo do imóvel: situação de cada item, com observação. Vazio se o imóvel não tem modelo. */
function gradeVistoria(i, v, base, entrada, linkModelo = () => '') {
  const chave = (x) => `${x.comodo}|${x.item}`;
  const anteriores = new Map(((v && v.itens) || (entrada ? [] : base.itens) || []).filter((x) => x.situacao !== K.NAO_SE_APLICA).map((x) => [chave(x), x]));
  const naEntrada = new Map(((entrada && entrada.itens) || []).map((x) => [chave(x), x.situacao]));
  const comodos = K.lerModeloVistoria(i.modelo_vistoria);
  // itens já marcados que saíram do modelo continuam aparecendo
  for (const x of anteriores.values()) {
    let g = comodos.find((y) => y.comodo === x.comodo);
    if (!g) comodos.push((g = { comodo: x.comodo, itens: [] }));
    if (!g.itens.includes(x.item)) g.itens.push(x.item);
  }
  if (!comodos.length) return '';
  let k = 0;
  const opcoes = (sel) => `<option value=""></option>${[...K.SITUACOES_VISTORIA, ...(sel && !K.SITUACOES_VISTORIA.includes(sel) ? [sel] : [])].map((o) => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('')}`;
  return `<h2>Situação por cômodo</h2>
    <p class="suave">Marque a situação de cada item. Os botões do cômodo preenchem os itens ainda sem situação; depois mude só o que diverge e anote a observação e o nº da foto.
      "Apagar tudo" limpa o cômodo. "Não se aplica" tira o item da tabela e, ao salvar, também do modelo do imóvel. Item sem situação não sai no documento. O que você marcar fica guardado mesmo se sair para editar o modelo.
      ${entrada ? 'Na saída, o que ficar pior que na entrada sai destacado.' : ''} ${linkModelo('Editar o modelo do imóvel')}</p>
    ${comodos.map((g, ci) => `<div class="vistoria-comodo"><div class="cabecalho"><h3>${esc(g.comodo)}</h3><div class="acoes">
      ${ESTADOS_COMODO.map(([valor, texto]) => botao('vistoriaTudo', texto, { comodo: ci, valor })).join('')}${entrada ? botao('vistoriaTudo', 'Igual à entrada', { comodo: ci, valor: 'entrada' }) : ''}
      ${botao('vistoriaApagar', 'Apagar tudo', { comodo: ci }, 'perigo pequeno')}</div></div>
      <div class="rolagem"><table class="grade-vistoria"><tr><th>Item</th>${entrada ? '<th>Na entrada</th>' : ''}<th>Situação</th><th>Observação / nº da foto</th></tr>
      ${g.itens.map((item) => {
    const n = k++;
    const a = anteriores.get(`${g.comodo}|${item}`) || {};
    const ent = naEntrada.get(`${g.comodo}|${item}`) || '';
    return `<tr><td>${esc(item)}<input type="hidden" name="ic_${n}" value="${esc(g.comodo)}"><input type="hidden" name="ii_${n}" value="${esc(item)}"></td>
      ${entrada ? `<td class="suave">${esc(ent || '—')}</td>` : ''}
      <td><select name="is_${n}" data-comodo="${ci}" data-entrada="${esc(ent)}" class="${K.piorou(ent, a.situacao) ? 'piorou' : ''}">${opcoes(a.situacao)}</select></td>
      <td><input name="io_${n}" data-comodo="${ci}" value="${esc(a.obs || '')}"></td></tr>`;
  }).join('')}</table></div></div>`).join('')}`;
}

/** Botões do cômodo na vistoria: [situação, texto do botão]. */
const ESTADOS_COMODO = [['Novo', 'Estado de novo'], ['Bom', 'Bom estado'], ['Marcas de uso', 'Marcas de uso']];

/** Itens gerais de cada cômodo no modelo de vistoria. Linha terminada em ":" é só um lembrete (não vira item). */
const GERAIS = ['Teto', 'Paredes', 'Piso', 'Janelas', 'Portas', 'Elétrica'];
const MODELO_COMODOS = {
  Sala: [...GERAIS, 'Móvel:'],
  Quarto: [...GERAIS, 'Móvel:'],
  Suíte: [...GERAIS, 'Móvel:'],
  Cozinha: [...GERAIS, 'Hidráulica', 'Cerâmica / revestimento', 'Armários', 'Eletrodoméstico:'],
  Banheiro: [...GERAIS, 'Hidráulica', 'Cerâmica / revestimento', 'Louças e metais (vaso, pia, torneiras, chuveiro)', 'Box e espelho'],
  Lavanderia: [...GERAIS, 'Hidráulica', 'Cerâmica / revestimento', 'Tanque', 'Eletrodoméstico:'],
  Corredor: ['Teto', 'Paredes', 'Piso', 'Portas', 'Elétrica'],
  Escada: ['Teto', 'Paredes', 'Piso / degraus', 'Corrimão', 'Porta de acesso', 'Elétrica'],
  'Área externa': ['Piso', 'Muros', 'Portão', 'Elétrica', 'Hidráulica'],
  Garagem: ['Piso', 'Portão eletrônico e controles', 'Elétrica'],
  Fachada: ['Muros e pintura', 'Telhado, beiral e calhas', 'Portão', 'Janelas e grades', 'Elétrica externa'],
};

function telaModeloVistoria(rota) {
  const i = buscar('imoveis', rota.partes[1]);
  if (!i) return '<h1>Imóvel não encontrado</h1>';
  const outros = ordenar(d().imoveis.filter((x) => x.id !== i.id && x.modelo_vistoria), 'nome');
  const resumo = K.lerModeloVistoria(i.modelo_vistoria);
  // aberto pela vistoria: salvar e cancelar voltam para ela
  const voltar = /^#\/vistoria\//.test(rota.q.voltar || '') ? rota.q.voltar : `#/imovel/${i.id}`;
  return `<p class="suave"><a href="${esc(voltar)}">← ${voltar.startsWith('#/vistoria/') ? 'Voltar para a vistoria' : esc(i.nome)}</a></p>
    <h1>Modelo de vistoria · ${esc(i.nome)}</h1>
    <div class="alerta info">Monte uma vez os cômodos deste imóvel e o que verificar em cada um. Na vistoria, você só marca a situação de cada item (novo, bom, marcas de uso, avaria, não se aplica…).</div>
    <form class="cartao" data-form="modeloVistoria"><input type="hidden" name="imovel" value="${i.id}"><input type="hidden" name="voltar" value="${esc(voltar)}">
      <p class="suave">Uma linha por item. <code>## Nome do cômodo</code> abre um cômodo (ex.: <code>## Quarto fundos</code>). Para móveis e eletrodomésticos, um por linha com a descrição
        (ex.: <code>Móvel: sofá 2 lugares cinza</code>, <code>Eletrodoméstico: geladeira Electrolux</code>). Linhas terminadas em ":" são só lembretes e não viram item.</p>
      <div class="acoes" style="margin:8px 0">Inserir cômodo: ${Object.keys(MODELO_COMODOS).map((x) => `<button type="button" class="secundario pequeno" data-acao="inserirComodoModelo" data-comodo="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      ${outros.length ? `<div class="acoes" style="margin:8px 0"><label style="margin:0">Copiar de outro imóvel</label><select name="copiar_de" style="width:auto">${outros.map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select>
        <button type="button" class="secundario pequeno" data-acao="copiarModeloVistoria">Copiar</button></div>` : ''}
      <textarea name="modelo" class="texto-modelo">${esc(i.modelo_vistoria || '')}</textarea>
      <p class="suave">${resumo.length ? `Salvo: ${resumo.length} cômodo(s), ${resumo.reduce((t, x) => t + x.itens.length, 0)} itens.` : 'Ainda sem modelo.'}</p>
      <div class="acoes"><button>Salvar modelo</button><a class="botao secundario" href="${esc(voltar)}">Cancelar</a></div></form>`;
}

/** Foto reduzida (até 1600 px, JPEG) para guardar na pasta e pôr no documento. */
async function reduzirFoto(arquivo) {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82));
}

/** Fotos da vistoria, lidas da pasta do inquilino: { chave: { src, bytes, largura, altura } }. */
async function fotosDaVistoria(v) {
  const out = {};
  if (!v.fotos) return out;
  let dir;
  try { dir = await pastaDoEscopo('contrato', v.contrato_id); } catch { return out; }
  for (const [k, nome] of Object.entries(v.fotos)) {
    try {
      const arq = await (await dir.getFileHandle(nome)).getFile();
      const img = await createImageBitmap(arq);
      const src = URL.createObjectURL(arq);
      urls.push(src);
      out[k] = { src, bytes: new Uint8Array(await arq.arrayBuffer()), largura: img.width, altura: img.height };
    } catch { /* foto apagada da pasta */ }
  }
  return out;
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
      <div><label>Data do contrato</label><input type="date" name="data" value="${esc(rota.q.data || c.vigencia_inicio || C.hojeIso())}"></div>
      <div><label>Testemunha 1 (opcional)</label><input name="t1" value="${esc(t.t1 || '')}"></div><div><label>CPF da testemunha 1</label><input name="c1" value="${esc(t.c1 || '')}"></div>
      <div><label>Testemunha 2 (opcional)</label><input name="t2" value="${esc(t.t2 || '')}"></div><div><label>CPF da testemunha 2</label><input name="c2" value="${esc(t.c2 || '')}"></div>
      <div class="check"><button>Ver contrato</button></div></form>
    <div class="cartao"><h2>O que entra automaticamente</h2>
      <p>Finalidade: <b>${esc(c.finalidade || 'Residencial')}</b> · Garantia: <b>${esc(garantia)}</b>${c.solidario_nome ? ' · com locatário solidário' : ''} ·
        Locadoras: <b>${esc(K.dadosDoContrato(d(), c).locadoras.map((e) => e.nome).join(' e '))}</b></p>
      <p class="suave">As partes, valores por extenso, prazo, índice, encargos, garantia e assinaturas vêm do cadastro. Na tela do contrato, use <b>Imprimir / salvar em PDF</b> ou <b>Baixar Word</b> para ajustar algum detalhe antes de assinar.
        Os textos ficam em ${link('#/modelos-contrato', 'Modelos de contrato', '')}.</p></div>`;
}

/** Termo aditivo de troca do dia do vencimento: gerar (escolhendo o modelo) ou alterar o que ainda não foi assinado (com o texto). */
function telaAditivo(rota) {
  const id = rota.partes[1];
  const a = id === 'novo' ? null : buscar('aditivos', id);
  if (id !== 'novo' && !a) return '<h1>Termo aditivo não encontrado</h1>';
  const c = buscar('contratos', a ? a.contrato_id : rota.q.contrato);
  if (!c) return '<h1>Inquilino não encontrado</h1>';
  if (a && a.arquivo) return `<div class="alerta info">Este termo aditivo já foi assinado e não pode mais ser alterado. <a href="#/contrato/${c.id}?ir=aditivos">Voltar</a></div>`;
  if (!opera()) return '<h1>Sem permissão para gerar termos aditivos</h1>';
  const hoje = C.hojeIso();
  const modelos = K.modelosDe(d(), 'aditivo');
  const diaAtual = a ? a.dia_anterior : (c.dia_vencimento || 10);
  const t = a ? { t1: (a.testemunhas[0] || {}).nome, c1: (a.testemunhas[0] || {}).cpf, t2: (a.testemunhas[1] || {}).nome, c2: (a.testemunhas[1] || {}).cpf } : testemunhasLembradas();
  const falta = K.pendenciasDoContrato(d(), c);
  return `<p class="suave"><a href="#/contrato/${c.id}?ir=aditivos">← ${esc(c.inquilino_nome)}</a></p>
    <h1>${a ? `Termo aditivo nº ${a.numero || 1}: troca do dia do vencimento` : 'Gerar termo aditivo: troca do dia do vencimento'}</h1>
    ${falta.length ? `<div class="alerta aviso"><b>Faltam dados no cadastro</b> (o termo sai com o espaço em branco): ${falta.map(esc).join('; ')}.</div>` : ''}
    <div class="alerta info">Hoje o vencimento é no <b>dia ${diaAtual}</b>. Muda só o dia: o boleto continua se referindo ao mês ${c.cobranca_mes_seguinte !== false ? 'anterior' : 'do vencimento'}, sem cobrança proporcional.
      Este termo não muda o cadastro: depois de assinado, mude o dia do vencimento em "Editar" no inquilino.</div>
    <form class="cartao" data-form="aditivoVencimento">
      <input type="hidden" name="id" value="${a ? a.id : ''}"><input type="hidden" name="contrato" value="${c.id}">
      <div class="formulario">
        <div><label>Data do termo aditivo</label><input type="date" name="data" value="${esc(a ? a.data : hoje)}" required></div>
        <div><label>Novo dia do vencimento</label><input type="number" name="dia_novo" min="1" max="31" value="${esc(a ? a.dia_novo : '')}" required></div>
        <div><label>Mês do 1º vencimento no novo dia</label><input type="month" name="mes" value="${esc(a ? a.primeiro_vencimento.slice(0, 7) : C.somarMeses(C.competenciaDe(hoje), 1))}" required></div>
        ${a ? '' : `<div><label>Modelo</label><select name="modelo">${modelos.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select></div>`}
        <div><label>Testemunha 1 (opcional)</label><input name="t1" value="${esc(t.t1 || '')}"></div><div><label>CPF da testemunha 1</label><input name="c1" value="${esc(t.c1 || '')}"></div>
        <div><label>Testemunha 2 (opcional)</label><input name="t2" value="${esc(t.t2 || '')}"></div><div><label>CPF da testemunha 2</label><input name="c2" value="${esc(t.c2 || '')}"></div>
      </div>
      <p class="suave">Ex.: do dia 10 para o dia 20 a partir de novembro/2026: o aluguel de outubro vence em 20/11/2026, com o valor normal.
        Testemunhas: necessárias na assinatura em papel; na assinatura eletrônica, podem ficar em branco.</p>
      ${a ? `<p><label>Texto deste termo <span class="suave">(muda só este termo; o padrão fica em ${link('#/modelos-contrato', 'Modelos de contrato', '')})</span></label>
        <textarea name="texto" class="texto-modelo" spellcheck="true">${esc(a.texto)}</textarea></p>` : ''}
      <div class="acoes"><button>${a ? 'Salvar e ver o termo' : 'Gerar o termo'}</button><a class="botao secundario" href="#/contrato/${c.id}?ir=aditivos">Cancelar</a></div></form>
    ${a ? AJUDA_MODELO : ''}`;
}

const AJUDA_MODELO = `<details class="cartao"><summary><b>Como escrever um modelo</b></summary>
  <ul>
    <li><code>{campo}</code> coloca um dado do cadastro. Campos: <code>{locadoras} {locatarios} {solidario} {fiadores} {fiadores_imoveis} {inquilino_nome} {objeto} {imovel_nome} {endereco_imovel}
      {finalidade} {atividade} {prazo_meses} {data_inicio} {data_fim} {aluguel_cheio} {aluguel_bonificado} {bonificacao_percentual} {dia_vencimento} {indice}
      {multa} {juros} {tarifa_boleto} {encargos_inquilino} {encargos_inclusos} {caucao_valor} {caucao_meses} {deposito_valor} {deposito_uso} {cidade} {data_assinatura}</code>.</li>
    <li><code>[se condição] texto [senão] outro texto [fim]</code>: o trecho só entra quando a condição vale (o [senão] é opcional; "[se não fiador]" também funciona). Condições:
      <code>fiador caucao deposito seguro_fianca sem_garantia solidario pj residencial nao_residencial bonificacao iptu_inquilino seguro_inquilino tem_incluso tarifa_boleto
      area_comum imovel_fiador varios_fiadores varias_locadoras indeterminado testemunhas</code>.</li>
    <li>Só nos termos aditivos de vencimento: <code>{numero_aditivo} {data_contrato} {dia_vencimento_anterior} {dia_vencimento_novo} {primeiro_vencimento} {mes_referencia}</code>
      e a condição <code>mes_seguinte</code> (o boleto se refere ao mês anterior ao do vencimento).</li>
    <li>Singular ou plural: <code>{l:a LOCADORA|as LOCADORAS}</code> (locadoras), <code>{f:o FIADOR|os FIADORES}</code> (fiadores), <code>{s:...|...}</code> (locatários).</li>
    <li><code>CLÁUSULA #</code> numera sozinha. <code>CLÁUSULA #multa</code> dá um nome à cláusula, e <code>{cl:multa}</code> escreve o número dela ("18ª (décima oitava)").
      <code>#i.</code> numera os itens do início.</li>
    <li>Linha começando com <code># </code>: título; <code>## </code>: seção; <code>&gt; </code>: alinhado à direita. <code>**texto**</code>: negrito.
      Uma linha em branco separa os parágrafos. A linha <code>[assinaturas]</code> põe o quadro de assinaturas.</li>
  </ul></details>`;

const TIPOS_MODELO = { contrato: 'Contratos', aditivo: 'Termos aditivos (troca do vencimento)' };

function telaModelos() {
  const linha = (m, tipo) => `<tr><td><b>${esc(m.nome)}</b>${m.id < 0 || m.padrao ? ` <span class="suave">(padrão)</span>` : ''}</td><td class="n nw">
      ${opera() ? `${link(`#/modelo-contrato/${m.id}`, 'Editar')} ${botao('copiarModelo', 'Copiar', { id: m.id })}` : ''}
      ${opera() && m.padrao && MODELOS_PADRAO.some((x) => x.nome === m.padrao) ? botao('restaurarModelo', 'Voltar ao texto padrão', { id: m.id }, 'secundario pequeno', `Trocar o texto de "${m.nome}" pelo texto padrão? As alterações feitas nele se perdem.`) : ''}
      ${podeUsuario('admin') && m.id > 0 && K.modelosDe(d(), tipo).length > 1 ? botao('excluirModelo', 'Excluir', { id: m.id }, 'perigo pequeno', `Excluir o modelo "${m.nome}"?`) : ''}</td></tr>`;
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p>
    <div class="cabecalho"><h1>Modelos de contrato</h1>${opera() ? `<div class="acoes">${link('#/modelo-contrato/novo', 'Novo modelo de contrato', 'botao')} ${link('#/modelo-contrato/novo?tipo=aditivo', 'Novo modelo de aditivo', 'botao secundario')}</div>` : ''}</div>
    ${Object.entries(TIPOS_MODELO).map(([tipo, titulo]) => `<div class="cartao"><h2>${titulo}</h2><table><tr><th>Modelo</th><th></th></tr>
      ${K.modelosDe(d(), tipo).map((m) => linha(m, tipo)).join('')}</table></div>`).join('')}
    <p class="suave">Para gerar um contrato, abra o inquilino e clique em <b>Gerar contrato</b>; o termo aditivo, em <b>Gerar aditivo de vencimento</b> (em "Termos aditivos").
      Edite à vontade: os modelos ficam guardados no banco de dados.</p>
    ${AJUDA_MODELO}`;
}

function telaModelo(rota) {
  const id = rota.partes[1];
  const m = id === 'novo' ? { id: '', nome: '', texto: '', tipo: rota.q.tipo === 'aditivo' ? 'aditivo' : 'contrato' }
    : Object.keys(TIPOS_MODELO).flatMap((t) => K.modelosDe(d(), t)).find((x) => String(x.id) === id);
  if (!m) return '<h1>Modelo não encontrado</h1>';
  const aditivo = K.tipoDoModelo(m) === 'aditivo';
  return `<p class="suave"><a href="#/modelos-contrato">← Modelos de contrato</a></p>
    <h1>${m.id === '' ? `Novo modelo de ${aditivo ? 'termo aditivo' : 'contrato'}` : `Modelo: ${esc(m.nome)}`}</h1>
    <form class="cartao" data-form="modeloContrato">
      <input type="hidden" name="id" value="${esc(m.id)}"><input type="hidden" name="tipo" value="${aditivo ? 'aditivo' : 'contrato'}">
      <p><label>Nome do modelo</label><input name="nome" value="${esc(m.nome)}" required></p>
      <p><label>Texto</label><textarea name="texto" class="texto-modelo" spellcheck="true">${esc(m.texto)}</textarea></p>
      <div class="acoes"><button>Salvar</button><a class="botao secundario" href="#/modelos-contrato">Cancelar</a></div></form>
    ${AJUDA_MODELO}`;
}

/**
 * Na primeira alteração de um tipo (contrato ou aditivo), os modelos padrão desse tipo passam a ficar no banco (e podem ser editados).
 * Devolve o id real.
 */
function modelosNoBanco(db, id, tipo = 'contrato') {
  const p = id < 0 ? MODELOS_PADRAO[-id - 1] : null;
  const t = p ? K.tipoDoModelo(p) : tipo;
  if (!db.modelos_contrato.some((m) => K.tipoDoModelo(m) === t)) {
    for (const x of MODELOS_PADRAO.filter((y) => K.tipoDoModelo(y) === t)) {
      R.inserir(db, 'modelos_contrato', { nome: x.nome, texto: x.texto, padrao: x.nome, ...(x.tipo ? { tipo: x.tipo } : {}) }, login(), `Modelo "${x.nome}" (padrão)`);
    }
  }
  if (p) {
    const m = db.modelos_contrato.find((x) => x.padrao === p.nome);
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
  // marca-d'água: a mesma logo quase transparente (5%), para ficar suave em qualquer leitor de Word
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.globalAlpha = 0.05;
  g.drawImage(img, 0, 0);
  return { bytes, marca: await png(), largura: canvas.width, altura: canvas.height };
}

// --------------------------------------------------------------------------
// Backup seguro do administrador
// --------------------------------------------------------------------------
const tamanho = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const FORM_RESTAURAR = `<form data-form="restaurarSeguro" class="formulario">
    <div><label>Arquivo de backup (.bkp)</label><input type="file" name="arquivo" accept="${B.EXTENSAO}"></div>
    <div><label>Senha do backup</label><input type="password" name="senha" autocomplete="off"></div>
    <div class="check"><button>Abrir e baixar o ZIP</button></div></form>
  <p class="suave">O backup aberto vira um ZIP igual ao do "Exportar tudo". Para voltar os dados: escolha a pasta dos dados (pode ser uma pasta nova e vazia), crie o administrador se pedir e use <b>Dados e backup → Importar ZIP</b>.
    Os usuários e senhas antigos voltam junto. Se o programa também deu problema, abra a cópia dele que fica na pasta do backup seguro, em <b>${B.PASTA_PROGRAMA}</b>.</p>`;

function telaRestaurarBackup() {
  return `<main><div id="mensagens"></div><div class="cartao login" style="max-width:640px">
    <h1>Restaurar backup seguro</h1>
    <p>Use em caso de erro geral: escolha um arquivo da pasta do backup seguro (<b>${B.PASTA_SEMANAL}</b> tem os completos, com anexos; <b>${B.PASTA_DIARIO}</b> tem a cópia do banco de cada dia) e digite a senha do backup.</p>
    ${FORM_RESTAURAR}
    <p><a href="#/">Voltar</a></p></div></main>`;
}

async function telaBackupSeguro() {
  if (!podeUsuario('admin')) return '<h1>Acesso só para administradores</h1>';
  if (!E.seguro || !E.seguro.chave) {
    const nova = E.pastaSeguraNova;
    const chaveExistente = nova ? await B.lerChave(nova) : null;
    return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Backup seguro</h1>
      ${E.seguro && E.seguro.desconectado ? `<div class="alerta aviso">A pasta <b>${esc(E.seguro.dir.name)}</b> já está configurada, mas o navegador pede para liberar o acesso de novo. ${botao('reconectarSeguro', 'Reconectar', {}, 'pequeno')}</div>` : ''}
      <div class="cartao"><h2>1. Escolha a pasta segura</h2>
        <p>Use uma pasta <b>fora</b> da pasta dos dados e que só você acesse (por exemplo, no seu OneDrive pessoal ou num HD externo). Ela fica ligada só a <b>este computador</b>: os outros usuários não veem nem gravam nela.</p>
        <p>${botao('escolherPastaSegura', nova ? `Pasta escolhida: ${esc(nova.name)} (trocar)` : 'Escolher a pasta segura', {}, nova ? 'secundario' : '')}</p></div>
      ${nova ? `<div class="cartao"><h2>2. ${chaveExistente ? 'Digite a senha do backup' : 'Crie a senha do backup'}</h2>
        ${chaveExistente ? `<p>Esta pasta já tem backups seguros (chave criada em ${new Date(chaveExistente.criada_em).toLocaleDateString('pt-BR')}). Digite a senha para ligar este computador a ela.</p>`
    : '<div class="alerta aviso"><b>Guarde esta senha em local seguro.</b> Ela é pedida só para restaurar. Sem ela, nenhum backup pode ser aberto, nem por você nem pelo suporte. Use pelo menos 8 caracteres.</div>'}
        <form data-form="configurarSeguro" class="formulario">
          <div><label>Senha do backup</label><input type="password" name="senha" autocomplete="new-password"></div>
          ${chaveExistente ? '' : '<div><label>Repita a senha</label><input type="password" name="senha2" autocomplete="new-password"></div>'}
          <div class="check"><button>${chaveExistente ? 'Conectar' : 'Criar e fazer o primeiro backup'}</button></div></form></div>` : ''}
      <div class="cartao"><h2>Restaurar</h2>${FORM_RESTAURAR}</div>`;
  }
  const lista = await B.listarBackups(E.seguro.dir);
  const ultimo = (pasta) => lista.find((x) => x.pasta === pasta);
  const quando = (x) => (x ? new Date(x.alterado).toLocaleString('pt-BR') : 'nenhum ainda');
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Backup seguro</h1>
    ${E.seguroErro ? `<div class="alerta erro">A última cópia falhou: ${esc(E.seguroErro)}</div>` : ''}
    <div class="cartao"><div class="grade">
      ${item('Pasta segura (só neste computador)', esc(E.seguro.dir.name))}
      ${item('Última cópia do banco', quando(ultimo(B.PASTA_DIARIO)))}
      ${item('Último backup completo', quando(ultimo(B.PASTA_SEMANAL)))}
      ${item('Guarda', `${B.MANTER_DIARIOS} cópias diárias, ${B.MANTER_SEMANAIS} completos semanais e 1 completo por mês durante ${B.MANTER_MENSAIS} meses`)}</div>
      <p class="suave">A cada alteração no sistema feita <b>neste computador</b>, a cópia do dia é atualizada. As alterações feitas em outros computadores entram na próxima vez que o sistema for aberto aqui.
        O completo semanal é feito sozinho quando o sistema é aberto e já passou uma semana do último. Os arquivos são cifrados: sem a senha do backup ninguém consegue abrir.</p>
      <div class="acoes">${botao('backupCompletoAgora', 'Fazer backup completo agora', {}, '')}
        ${botao('desconectarSeguro', 'Desligar neste computador', {}, 'perigo pequeno', 'Desligar o backup seguro neste computador? Os arquivos já gravados continuam na pasta.')}</div></div>
    <div class="cartao"><h2>Restaurar</h2>${FORM_RESTAURAR}</div>
    <div class="cartao"><h2>Arquivos na pasta segura</h2><div class="rolagem"><table><tr><th>Arquivo</th><th>Tipo</th><th>Gravado em</th><th class="n">Tamanho</th></tr>
      ${lista.slice(0, 40).map((x) => `<tr><td>${esc(x.pasta)}/${esc(x.nome)}</td><td>${esc(x.tipo)}</td><td>${new Date(x.alterado).toLocaleString('pt-BR')}</td><td class="n">${tamanho(x.tamanho)}</td></tr>`).join('')
      || '<tr><td colspan="4" class="suave">Nenhum backup ainda.</td></tr>'}</table></div></div>`;
}

// --------------------------------------------------------------------------
// Empresas, histórico e dados
// --------------------------------------------------------------------------
function telaEmpresas() {
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><div class="cabecalho"><h1>Empresas que emitem as NFs</h1>${podeUsuario('admin') ? link('#/novo/emitentes', 'Nova empresa', 'botao') : ''}</div>
    <div class="cartao rolagem"><table><tr><th>Nome</th><th>Razão social</th><th>CNPJ</th><th>Representante (contratos)</th><th>Aba no Excel</th><th>Situação</th><th></th></tr>
    ${ordenar(d().emitentes, 'nome').map((e) => `<tr><td><b>${esc(e.nome)}</b></td><td>${esc(e.razao_social)}</td><td>${esc(e.cnpj || '-')}</td><td>${e.representante_nome ? esc(e.representante_nome) : '<span class="suave">falta</span>'}</td><td>${esc(e.aba_modelo || e.nome.split(/\s+/)[0])}</td><td>${e.ativo ? etiqueta('Ativa', 'ok') : etiqueta('Inativa', 'neutra')}</td><td class="n">${podeUsuario('admin') ? link(`#/editar/emitentes/${e.id}`, 'Editar') : ''}</td></tr>`).join('')
    || '<tr><td colspan="7" class="suave">Nenhuma empresa cadastrada.</td></tr>'}</table>
    <p class="suave">Em cada imóvel você define quais empresas emitem a NF e o percentual de cada uma (ex.: 50% / 50%).</p></div>
    <div class="cartao"><h2>Logo da empresa</h2>
      <p class="suave">Aparece no topo de todas as páginas do sistema e como marca-d'água nos contratos, vistorias e cartas. Envie em boa resolução (PNG ou SVG, de preferência com 1.000 pixels de largura ou mais).</p>
      ${d().logo && larguraLogo(d().logo) && larguraLogo(d().logo) < 800 ? `<div class="alerta aviso">A logo atual está em baixa resolução (${larguraLogo(d().logo)} pixels de largura): a marca-d'água sai serrilhada. Envie a logo de novo em "Trocar logo".</div>` : ''}
      ${d().logo ? `<p><img class="logo-previa" src="${esc(d().logo)}" alt="Logo atual"></p>` : '<p class="suave">Nenhuma logo enviada.</p>'}
      ${podeUsuario('admin') ? `<form data-form="logo" class="acoes"><input type="file" name="arquivo" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="max-width:360px"><button class="secundario">${d().logo ? 'Trocar logo' : 'Enviar logo'}</button>
        ${d().logo ? botao('removerLogo', 'Remover logo', {}, 'perigo pequeno', 'Remover a logo?') : ''}</form>` : ''}</div>
    <div class="cartao"><h2>Ressarcimento de taxas do condomínio</h2>
      <p>Taxas do proprietário pagas pelo inquilino no condomínio (fundo de obras etc.) voltam para ele no boleto do aluguel. ${d().ressarcimento_abate_nf
    ? '<b>Hoje: o ressarcimento sai do valor da NF</b> (a NF fica com o aluguel menos a taxa) e não conta de novo como gasto.' : '<b>Hoje: a NF sai com o aluguel cheio</b> e o ressarcimento conta como gasto do imóvel nos Resultados.'}</p>
      <p class="suave">Confirme com o contador qual forma usar. A mudança vale para os boletos gerados ou recalculados daqui em diante.</p>
      ${podeUsuario('admin') ? botao('ressarcimentoNaNf', d().ressarcimento_abate_nf ? 'Passar a emitir a NF com o aluguel cheio' : 'Passar a abater o ressarcimento da NF', { valor: d().ressarcimento_abate_nf ? '' : '1' }, 'secundario pequeno', 'Mudar a forma da NF nos ressarcimentos de condomínio?') : ''}</div>
    <div class="cartao"><h2>Numeração das NFs</h2>
      <p>Próximo número: <b>${R.numeroFatura(d().proxima_fatura)}</b>. As empresas de um mesmo pagamento recebem o mesmo número.</p>
      ${podeUsuario('admin') ? `<form data-form="proximaFatura" class="acoes"><input type="number" name="numero" min="1" value="${d().proxima_fatura}" style="width:140px"><button class="secundario">Alterar próximo número</button></form>` : ''}</div>`;
}

/** Desfaz as alterações escolhidas no Histórico (só administrador) e recalcula os boletos em aberto ligados a elas. */
async function desfazerItens(itens) {
  if (!podeUsuario('admin')) throw new Error('Só o administrador desfaz alterações.');
  let recalculados = 0;
  await alterar((db) => {
    for (const { tabela, id } of R.desfazerAlteracoes(db, itens, login())) {
      const cfg = CADASTROS[tabela];
      if (cfg && cfg.recalcular) recalculados += R.recalcularCobrancas(db, cfg.recalcular(R.buscar(db, tabela, id), db), login());
    }
  });
  aviso(recalculados ? `Desfeito. ${recalculados} boleto(s) em aberto recalculado(s).` : 'Desfeito.');
  await mostrar();
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
  const filtrando = Object.values(q).some(Boolean);
  // administrador: desfaz alterações de cadastro, sempre da mais recente para a mais antiga de cada campo
  const desfazer = podeUsuario('admin') ? { pode: R.alteracoesDesfaziveis(d()), indice: new Map(d().historico.map((h, i) => [h, i])) } : null;
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Histórico de alterações</h1>
    <details class="cartao" open><summary><b>Histórico</b> <span class="suave">· ${lista.length} registro(s)${filtrando ? ' com o filtro aplicado' : ''}</span></summary>
    <form class="formulario" data-form="filtroHistorico" style="margin-top:12px">
      <div><label>Usuário</label><select name="usuario"><option value=""></option>${usuarios.map((u) => `<option ${q.usuario === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></div>
      <div><label>Tipo de registro</label><select name="tabela"><option value=""></option>${Object.entries(R.TABELAS).map(([k, v]) => `<option value="${k}" ${q.tabela === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>De</label><input type="date" name="de" value="${esc(q.de || '')}"></div><div><label>Até</label><input type="date" name="ate" value="${esc(q.ate || '')}"></div>
      <div><label>Contém o texto</label><input name="texto" value="${esc(q.texto || '')}"></div>
      <div class="check"><button>Filtrar</button> <a href="#/historico">Limpar</a></div></form>
    ${desfazer ? `<p class="suave">Administrador: o botão ↶ volta o campo ao valor anterior. Cada campo volta uma alteração por vez, da mais recente para a mais antiga; depois de desfazer a última, aparece o botão na anterior. Boletos, pagamentos, NFs e usuários não entram (use os botões próprios).</p>
      <p>${botao('desfazerMarcados', '↶ Desfazer os marcados', {}, 'secundario pequeno')}</p>` : ''}
    ${tabelaHistorico(lista.slice(-500).reverse(), desfazer)}<p class="suave">Mostrando até 500 registros mais recentes.</p></details>`;
}

async function telaDados() {
  const conflitos = await S.copiasEmConflito(E.pasta);
  let modeloProprio = false;
  try {
    await (await E.pasta.getDirectoryHandle(S.PASTA_MODELOS)).getFileHandle(S.MODELO_FATURA);
    modeloProprio = true;
  } catch { /* usa o modelo padrão */ }
  return `<div class="cabecalho"><h1>Dados e backup</h1><div class="acoes">${link('#/empresas', 'Empresas', 'botao secundario')}${link('#/historico', 'Histórico de alterações', 'botao secundario')}</div></div>
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
    ${podeUsuario('admin') ? `<div class="cartao"><h2>Backup seguro (só administrador)</h2>
      <p>Segunda pasta, só no computador do administrador: recebe uma cópia protegida por senha a cada alteração e um backup completo (banco + anexos) por semana.</p>
      <p>${E.seguro && E.seguro.chave ? etiqueta(`Ligado neste computador · pasta ${E.seguro.dir.name}`, 'ok') : E.seguro && E.seguro.desconectado ? etiqueta('Desconectado: falta liberar a pasta', 'aviso') : etiqueta('Não configurado neste computador', 'neutra')}
      ${link('#/backup-seguro', 'Abrir o backup seguro')}</p></div>` : ''}
    <div class="cartao"><h2>Exportar tudo em ZIP</h2><p>Banco de dados e todos os anexos num único arquivo, para guardar ou levar para outro computador.</p>${opera() ? botao('exportar', 'Baixar ZIP com todos os dados', {}, '') : ''}
      <p style="margin-top:14px">Para ler ou imprimir: todos os cadastros numa planilha Excel (uma aba por cadastro, mais o histórico de alterações) e num PDF (uma ficha por registro). Os anexos não entram e estes arquivos não servem para importar.</p>
      ${opera() ? botao('exportarPlanilhaPdf', 'Baixar todos os dados em planilha e PDF', {}, 'secundario') : ''}</div>
    ${podeUsuario('admin') ? `<div class="cartao"><h2>Importar ZIP</h2>
      <div class="alerta aviso">A importação <b>substitui o banco de dados desta pasta</b> pelo do ZIP e acrescenta os anexos. Antes, uma cópia do banco atual é guardada em ${S.PASTA_BACKUPS}.</div>
      <form data-form="importar" class="acoes"><input type="file" name="zip" accept=".zip" style="max-width:380px"><label class="check" style="padding:0"><input type="checkbox" name="confirmo" value="1"> Entendo que os dados atuais serão substituídos</label><button class="perigo">Importar</button></form></div>` : ''}
    ${podeUsuario('admin') ? `<div class="cartao"><h2>Arquivos sem lançamento</h2><p>Ao excluir um lançamento (aditivo, comprovante, depósito, apólice, vistoria, documento assinado), o arquivo anexado é apagado junto.
      Os que sobraram de exclusões antigas podem ser apagados aqui: o sistema mostra a lista antes de apagar. As fichas e documentos anexados à mão em "Arquivos do inquilino" não entram.</p>
      ${botao('limparAnexosSoltos', 'Procurar arquivos sem lançamento')}</div>` : ''}
    <div class="cartao"><h2>Modelos de contrato</h2><p>Textos usados no botão <b>Gerar contrato</b> do inquilino (residencial, não residencial e os que você criar).</p>${link('#/modelos-contrato', 'Ver e editar os modelos')}</div>
    <div class="cartao"><h2>Modelo Excel da NF</h2>
      <p>${modeloProprio ? `${etiqueta('Modelo próprio', 'ok')} usando o arquivo enviado (${S.PASTA_MODELOS}/${S.MODELO_FATURA}).` : 'Usando o modelo padrão, igual à planilha LOJA1 (abas ANK e JCK).'}</p>
      <p class="suave">Para trocar, envie um .xlsx com uma aba por empresa no mesmo desenho. Os dados são preenchidos nas mesmas células da planilha original (B3 a B6, L4, L5, E10, L10, E11, E12, G16, F22, K22).</p>
      ${opera() ? `<form data-form="modeloExcel" class="acoes"><input type="file" name="modelo" accept=".xlsx" style="max-width:380px"><button class="secundario">Enviar modelo</button>${modeloProprio ? botao('removerModelo', 'Voltar ao modelo padrão', {}, 'perigo pequeno', 'Voltar ao modelo padrão?') : ''}</form>` : ''}</div>`;
}

// --------------------------------------------------------------------------
// Envio de formulários
// --------------------------------------------------------------------------
/**
 * Logo em boa resolução (até 1400×700, PNG em data URL guardada no próprio banco): a mesma imagem vira a marca-d'água
 * de 14 cm dos contratos, então precisa ser nítida. SVG é desenhado já no tamanho máximo.
 */
const LOGO_MAX = { largura: 1400, altura: 700 };
/** Largura em pixels da logo guardada (lida do cabeçalho do PNG); 0 se não der para saber. */
function larguraLogo(dataUrl) {
  try {
    const b = atob(String(dataUrl).split(',')[1].slice(0, 40));
    return b.slice(1, 4) === 'PNG' ? ((b.charCodeAt(16) << 24) | (b.charCodeAt(17) << 16) | (b.charCodeAt(18) << 8) | b.charCodeAt(19)) : 0;
  } catch { return 0; }
}
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
    const svg = /svg/i.test(arquivo.type);
    const largura = img.naturalWidth || 400;
    const altura = img.naturalHeight || 120;
    const escala = Math.min(svg ? Infinity : 1, LOGO_MAX.largura / largura, LOGO_MAX.altura / altura);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(largura * escala));
    cv.height = Math.max(1, Math.round(altura * escala));
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const FORMULARIOS = {
  async configurarSeguro(form) {
    if (!podeUsuario('admin')) throw new Error('Só o administrador configura o backup seguro.');
    const dir = E.pastaSeguraNova;
    if (!dir) throw new Error('Escolha a pasta segura primeiro.');
    const f = new FormData(form);
    const senha = String(f.get('senha') || '');
    let chave = await B.lerChave(dir);
    if (chave) {
      if (!(await B.conferirSenha(chave, senha))) throw new Error('Senha do backup incorreta.');
    } else {
      if (senha !== String(f.get('senha2') || '')) throw new Error('As duas senhas precisam ser iguais.');
      chave = await B.criarChave(senha);
      await B.gravarChave(dir, chave);
    }
    await S.lembrarPastaSegura(dir);
    E.pastaSeguraNova = null;
    await conectarSeguro(false);
    await alterar((db) => R.registrar(db, login(), 'Alteração', 'banco', null, 'Backup seguro ligado neste computador', null, {}, false));
    await backupCompletoSeguro();
    aviso('Backup seguro ligado. Primeiro backup completo gravado.');
    await mostrar();
  },

  async restaurarSeguro(form) {
    const f = new FormData(form);
    const arq = f.get('arquivo');
    if (!arq || !arq.size) throw new Error('Escolha o arquivo de backup.');
    const { info, dados } = await B.decifrar(await arq.arrayBuffer(), String(f.get('senha') || ''));
    const data = (info.criado_em || '').slice(0, 10);
    let blob;
    if (info.tipo === 'completo') blob = new Blob([dados], { type: 'application/zip' });
    else {
      const JSZip = await jsZip();
      const zip = new JSZip();
      zip.file(S.ARQUIVO_BANCO, dados);
      blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    }
    baixar(blob, `backup-restaurado-${info.tipo === 'completo' ? 'completo' : 'banco'}-${data}.zip`);
    aviso(`Backup de ${new Date(info.criado_em).toLocaleString('pt-BR')} aberto. Agora use "Importar ZIP" em Dados e backup com o arquivo baixado.`);
  },

  async modeloVistoria(form) {
    const f = Object.fromEntries(new FormData(form));
    const i = buscar('imoveis', f.imovel);
    await alterar((db) => R.atualizar(db, 'imoveis', i.id, { modelo_vistoria: String(f.modelo || '').trim() }, login(), `${i.nome}: modelo de vistoria`));
    aviso('Modelo de vistoria salvo.');
    ir(/^#\/vistoria\//.test(f.voltar || '') ? f.voltar : `#/imovel/${i.id}`);
  },

  async baixaLote(form) {
    const fd = new FormData(form);
    const data = String(fd.get('data') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data em que o dinheiro entrou.');
    const ids = fd.getAll('ids').map(Number);
    if (!ids.length) throw new Error('Marque os boletos deste vencimento que foram pagos.');
    const vencs = new Set(ids.map((id) => (buscar('cobrancas', id) || {}).vencimento));
    if (vencs.size > 1) throw new Error('Confirme juntos só boletos do mesmo vencimento.');
    confirmarAvisos(data > C.hojeIso() ? [`A data (${dataBr(data)}) está no futuro.`] : []);
    let r;
    await alterar((db) => { r = R.baixarEmLote(db, ids, data, login()); });
    aviso(`${r.feitos.length} pagamento(s) confirmado(s) em dia, com entrada em ${dataBr(data)}.${r.pulados.length ? ` ${r.pulados.length} já estavam pagos ou em carência e ficaram como estavam.` : ''}`);
    await mostrar();
  },

  async lancarContas(form) {
    const f = Object.fromEntries(new FormData(form));
    const linhas = R.TIPOS_DESPESA.map((t, n) => {
      const texto = String(f[`valor_${n}`] || '').trim();
      return { tipo: f[`tipo_${n}`], valor: texto ? C.centavos(texto) : 0, data_pagamento: f[`data_${n}`], observacoes: String(f[`obs_${n}`] || '').trim() };
    });
    if (!f.competencia) throw new Error('Informe o mês da conta.');
    let n = 0;
    await alterar((db) => { n = R.lancarDespesas(db, Number(f.imovel), f.competencia, linhas, login()).length; });
    aviso(`${n} conta(s) lançada(s).`);
    await mostrar();
  },

  async marcarDocumento(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.data) throw new Error('Informe a data.');
    const doc = R.DOCUMENTOS_ENTRADA.find(([k]) => k === f.campo);
    const arquivo = form.querySelector('[name=arquivo]').files[0];
    if (!arquivo) throw new Error(`Anexe o arquivo de "${doc[1]}" ${doc[2]} antes de marcar.`);
    const nome = await salvarAssinado('assinados', Number(f.contrato), arquivo, `${doc[1]} ${doc[2]} ${f.data}`);
    await alterar((db) => R.marcarDocumento(db, Number(f.contrato), f.campo, f.data, login(), nome));
    await mostrar();
  },

  /** Um depósito da caução ou do depósito de garantia (pode ser parcelado): data, valor e comprovante, gravado na pasta do inquilino. */
  async garantiaPaga(form) {
    const f = Object.fromEntries(new FormData(form));
    const arq = form.querySelector('[name=arquivo]').files[0];
    const g = R.GARANTIAS_DEPOSITADAS[f.qual];
    const valor = C.centavos(f.valor);
    // confere antes de gravar o arquivo na pasta (as mesmas mensagens de R.registrarDepositoGarantia); o comprovante pode vir depois
    if (!f.data) throw new Error('Informe a data do depósito.');
    if (!(valor > 0)) throw new Error('Informe o valor depositado.');
    const nome = arq ? await S.salvarArquivo(await pastaDoEscopo('contrato', Number(f.contrato)), new File([arq], nomeComprovante(g.arquivo, f.data, arq))) : null;
    let s;
    await alterar((db) => { s = R.registrarDepositoGarantia(db, Number(f.contrato), f.qual, { data: f.data, valor, arquivo: nome }, login()); });
    aviso(`${s.completou ? `Depósito de ${reais(valor)} registrado: ${g.nome} registrada.${s.falta > 0 ? ` Falta o complemento dos reajustes: ${reais(s.falta)}.` : ''}`
      : s.falta > 0 ? `Depósito de ${reais(valor)} registrado. Já depositado ${reais(s.depositado)}; falta ${reais(s.falta)}.` : `Depósito de ${reais(valor)} registrado: ${g.nome} completa (${reais(s.depositado)}).`}${nome ? '' : ' Sem comprovante: fica o aviso até anexar.'}`);
    await mostrar();
  },

  async aditivo(form) {
    const f = Object.fromEntries(new FormData(form));
    const arquivo = form.querySelector('[name=arquivo]').files[0];
    // confere antes de gravar o arquivo na pasta (as mesmas mensagens de R.registrarAditivo)
    if (!f.data) throw new Error('Informe a data do termo aditivo.');
    if (!String(f.assunto || '').trim()) throw new Error('Informe o assunto do termo aditivo (ex.: troca do dia do vencimento).');
    if (!arquivo) throw new Error('Anexe o arquivo do termo aditivo assinado.');
    const nome = await salvarAssinado('aditivos', Number(f.contrato), arquivo, `termo aditivo ${f.data} ${f.assunto}`.slice(0, 80));
    await alterar((db) => R.registrarAditivo(db, Number(f.contrato), { data: f.data, assunto: f.assunto, arquivo: nome }, login()));
    aviso('Termo aditivo registrado.');
    await mostrar();
  },

  async vistoria(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.data) throw new Error('Informe a data da vistoria.');
    const c = buscar('contratos', f.contrato);
    const dados = { contrato_id: c.id, imovel_id: c.imovel_id || null, tipo: f.tipo, data: f.data, link_fotos: (f.link_fotos || '').trim(),
      chaves: f.chaves || '', descritivo: f.descritivo || '', condicoes: f.condicoes || '',
      texto_abertura: String(f.texto_abertura || '').trim(), texto_final: f.tipo === 'Entrada' ? String(f.texto_final || '').trim() : '' };
    // texto igual ao padrão fica em branco: vale o padrão (a abertura muda sozinha com ou sem o link das fotos)
    const semEspacos = (x) => String(x).replace(/\s+/g, ' ').trim();
    if ([K.VISTORIA_ABERTURA, K.VISTORIA_ABERTURA_SEM_LINK].map(semEspacos).includes(semEspacos(dados.texto_abertura))) dados.texto_abertura = '';
    if (semEspacos(dados.texto_final) === semEspacos(K.vistoriaFinal(3))) dados.texto_final = '';
    dados.itens = [];
    for (let n = 0; f[`ic_${n}`] !== undefined; n += 1) dados.itens.push({ comodo: f[`ic_${n}`], item: f[`ii_${n}`], situacao: f[`is_${n}`] || '', obs: String(f[`io_${n}`] || '').trim() });
    const tirados = dados.itens.filter((x) => x.situacao === K.NAO_SE_APLICA);
    dados.itens = dados.itens.filter((x) => x.situacao !== K.NAO_SE_APLICA);
    // fotos: reduzidas e guardadas na pasta do inquilino (mesmo nome = substitui a anterior)
    const anterior = Number(f.id) ? buscar('vistorias', f.id) : null;
    dados.fotos = { ...((anterior && anterior.fotos) || {}) };
    const novasFotos = K.FOTOS_VISTORIA.filter(([k]) => f[`foto_${k}`] && f[`foto_${k}`].size);
    if (novasFotos.length) {
      const dir = await pastaDoEscopo('contrato', c.id);
      for (const [k] of novasFotos) {
        const nome = `vistoria-${f.tipo === 'Saída' ? 'saida' : 'entrada'}-${f.data}-${k}.jpg`;
        await S.escreverTexto(dir, nome, await reduzirFoto(f[`foto_${k}`]));
        dados.fotos[k] = nome;
      }
    }
    if (f.tipo === 'Saída') {
      const entrada = R.vistoriasDo(d(), c.id).find((x) => x.tipo === 'Entrada');
      dados.comparar_com = entrada ? entrada.data : null;
    }
    let id = Number(f.id) || null;
    await alterar((db) => {
      const desc = `${c.inquilino_nome}: vistoria de ${f.tipo.toLocaleLowerCase('pt-BR')}`;
      if (id) R.atualizar(db, 'vistorias', id, dados, login(), desc);
      else id = R.inserir(db, 'vistorias', dados, login(), desc).id;
      const im = c.imovel_id && R.buscar(db, 'imoveis', c.imovel_id);
      if (im && tirados.length) {
        const modelo = K.tirarDoModelo(im.modelo_vistoria, tirados);
        if (modelo !== (im.modelo_vistoria || '')) R.atualizar(db, 'imoveis', im.id, { modelo_vistoria: modelo }, login(), `Modelo de vistoria: tirado o que não se aplica (${tirados.map((x) => `${x.comodo} – ${x.item}`).join(', ')})`);
      }
      if (f.atualizar_imovel === '1' && c.imovel_id && dados.chaves.trim()) R.atualizar(db, 'imoveis', c.imovel_id, { chaves: dados.chaves.trim() }, login(), 'Chaves e controles do imóvel');
      if (dados.link_fotos && f.tipo === 'Entrada' && !c.vistoria_link) R.atualizar(db, 'contratos', c.id, { vistoria_link: dados.link_fotos }, login(), `${c.inquilino_nome}: link das fotos da vistoria`);
    });
    apagarRascunhoVistoria(form.dataset.rascunho);
    aviso('Vistoria salva.');
    ir(`#/imprimir/vistoria?id=${id}`);
  },

  gerarContrato(form) {
    const f = Object.fromEntries(new FormData(form));
    try { localStorage.setItem('testemunhas_contrato', JSON.stringify({ t1: f.t1, c1: f.c1, t2: f.t2, c2: f.c2 })); } catch { /* sem lembrar */ }
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== ''));
    ir(`#/imprimir/contrato?${q}`);
  },

  async reservaAbatida(form) {
    const f = Object.fromEntries(new FormData(form));
    const n = await alterar((db) => R.marcarReservaAbatida(db, Number(f.contrato), { competencia: f.competencia, valor: C.centavos(f.valor) }, login()));
    aviso(`Reserva marcada como já abatida${n ? `; saiu de ${n} boleto(s) em aberto` : ''}.`);
    await mostrar();
  },

  async aditivoVencimento(form) {
    const f = Object.fromEntries(new FormData(form));
    try { localStorage.setItem('testemunhas_contrato', JSON.stringify({ t1: f.t1, c1: f.c1, t2: f.t2, c2: f.c2 })); } catch { /* sem lembrar */ }
    const modelo = f.id ? null : K.modelosDe(d(), 'aditivo').find((m) => String(m.id) === f.modelo);
    if (!f.id && !modelo) throw new Error('Escolha o modelo do termo aditivo.');
    const dados = { data: f.data, dia_novo: f.dia_novo, mes: f.mes,
      testemunhas: [[f.t1, f.c1], [f.t2, f.c2]].map(([nome, cpf]) => ({ nome: String(nome || '').trim(), cpf: String(cpf || '').trim() })),
      ...(modelo ? { modelo_id: modelo.id > 0 ? modelo.id : null, texto: modelo.texto } : { texto: f.texto }) };
    let a;
    await alterar((db) => { a = R.salvarAditivoVencimento(db, Number(f.contrato), dados, login(), f.id ? Number(f.id) : null); });
    aviso(f.id ? 'Termo aditivo salvo.' : 'Termo aditivo gerado: imprima ou baixe o PDF para assinar.');
    ir(`#/imprimir/aditivo?id=${a.id}`);
  },

  async assinarAditivo(form) {
    const f = Object.fromEntries(new FormData(form));
    const arquivo = form.querySelector('[name=arquivo]').files[0];
    const a = buscar('aditivos', f.id);
    if (!f.data) throw new Error('Informe a data da assinatura.');
    if (!arquivo) throw new Error('Anexe o arquivo do termo aditivo assinado.');
    const nome = await salvarAssinado('aditivos', a.contrato_id, arquivo, `termo aditivo ${f.data} ${a.assunto}`.slice(0, 80));
    await alterar((db) => R.assinarAditivo(db, a.id, { data: f.data, arquivo: nome }, login()));
    aviso('Termo aditivo assinado e registrado. Lembre de mudar o dia do vencimento no cadastro do inquilino (Editar).');
    await mostrar();
  },

  async modeloContrato(form) {
    const f = new FormData(form);
    const nome = String(f.get('nome') || '').trim();
    const texto = String(f.get('texto') || '');
    if (!nome || !texto.trim()) throw new Error('Preencha o nome e o texto do modelo.');
    const id = Number(f.get('id') || 0);
    const tipo = f.get('tipo') === 'aditivo' ? 'aditivo' : 'contrato';
    await alterar((db) => {
      // o modelo novo não esconde os padrões do mesmo tipo: eles vão para o banco antes
      const real = modelosNoBanco(db, id, tipo);
      if (real) R.atualizar(db, 'modelos_contrato', real, { nome, texto }, login(), `Modelo de contrato "${nome}"`);
      else R.inserir(db, 'modelos_contrato', { nome, texto, ...(tipo === 'aditivo' ? { tipo } : {}) }, login(), `Modelo de contrato "${nome}"`);
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
    // documentos já salvos (CPF/CNPJ) e que não mudaram não são barrados; "valores" traz também os que aparecem no formulário (ex.: fiadores no contrato)
    const { dados, erros } = F.ler(campos, form, registro && cfg.valores ? cfg.valores(registro) : registro);
    if (cfg.ajustar && !Object.keys(erros).length) cfg.ajustar(dados, erros, registro, form, rota.q);
    if (cfg.confirmar && !Object.keys(erros).length && !(await cfg.confirmar(dados, registro))) throw new Error('Nada foi salvo.');
    if (cfg.ajustarAsync && !Object.keys(erros).length) await cfg.ajustarAsync(dados, erros, registro, form, rota.q);
    if (Object.keys(erros).length) return { erros, valores: Object.fromEntries(new FormData(form)) };
    confirmarAvisos(cfg.conferir ? cfg.conferir(dados, registro, rota.q) : []);
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
    const cb = buscar('cobrancas', form.dataset.id);
    confirmarAvisos([
      data > C.hojeIso() ? `A data do pagamento (${dataBr(data)}) está no futuro.` : '',
      cb && data < C.somarDias(cb.vencimento, -40) ? `A data do pagamento (${dataBr(data)}) é bem antes do vencimento (${dataBr(cb.vencimento)}).` : '',
    ].filter(Boolean));
    // valor recebido diferente do previsto: justificativa e, na página do boleto, o valor da NF digitado à mão
    const previsto = cb && R.previstoNoPagamento(cb, data, { pagouEmDia, dataPagou });
    if (cb && valor !== null && valor !== previsto.valor_devido && !R.ehComplementoCaucao(cb) && R.geraNf(buscar('contratos', cb.contrato_id))) {
      if (dataPagou && dataPagou > data) throw new Error('O dia em que pagou não pode ser depois da data contábil.');
      const dif = valor - previsto.valor_devido;
      const resp = await janela({ titulo: 'Valor diferente do previsto',
        html: `<p>Previsto para ${dataBr(pagouEmDia ? cb.vencimento : dataPagou || data)}: <b>${reais(previsto.valor_devido)}</b><br>Recebido: <b>${reais(valor)}</b><br>
          Diferença: <b class="${dif < 0 ? 'negativo' : ''}">${dif > 0 ? '+' : '−'}${reais(Math.abs(dif))}</b></p>
          <p><label>Justificativa da divergência</label><textarea name="justificativa" rows="3" required></textarea></p>
          <p class="suave">Fica só no sistema (não sai na NF nem no boleto). Em seguida, informe o valor da NF na página do boleto.</p>`,
        sim: 'Continuar', nao: 'Cancelar' });
      const justificativa = resp && String((resp.justificativa || [])[0] || '').trim();
      if (!resp) return;
      if (!justificativa) throw new Error('Informe a justificativa da divergência. Nada foi salvo.');
      pagamentoDivergente = { id: cb.id, data, valor, pagouEmDia, dataPagou, justificativa };
      ir(`#/cobranca/${cb.id}?ir=pagamento`);
      return;
    }
    const r = await alterar((db) => R.registrarPagamento(db, Number(form.dataset.id), data, valor, login(), { pagouEmDia, dataPagou }));
    const pago = buscar('cobrancas', form.dataset.id);
    if (pago && R.ehComplementoCaucao(pago)) aviso(`Complemento da caução pago${r.pontual ? '' : ` com ${r.dias_atraso} dia(s) de atraso`}: a caução passou a ${reais(pago.caucao_nova)}. Sem NF.`, 'ok');
    else aviso(r.pontual ? `Pagamento em dia confirmado${pagouEmDia ? ' (sem multa e juros)' : ''}. Data da NF: ${dataBr(data)}. Valor da nota: ${reais(r.valor_nf)}.`
      : `Pagamento com ${r.dias_atraso} dia(s) de atraso: multa ${reais(r.multa)} e juros ${reais(r.juros)}. Valor da nota: ${reais(r.valor_nf)} (com multa e juros). Data da NF: ${dataBr(data)}.`, r.pontual ? 'ok' : 'aviso');
    await mostrar();
  },

  /** Pagamento com valor diferente do previsto: a NF sai com o valor digitado (diferente do calculado) e a justificativa fica no histórico. */
  async pagamentoNf(form) {
    const p = pagamentoDivergente;
    if (!p || String(p.id) !== form.dataset.id) throw new Error('Confirme o pagamento de novo.');
    const f = new FormData(form);
    const texto = String(f.get('valor_nf') || '').trim();
    const valorNf = texto ? C.centavos(texto) : null;
    const justificativa = String(f.get('justificativa') || '').trim();
    const r = await alterar((db) => R.registrarPagamento(db, p.id, p.data, p.valor, login(), { pagouEmDia: p.pagouEmDia, dataPagou: p.dataPagou, valorNf, justificativa }));
    pagamentoDivergente = null;
    aviso(`Pagamento confirmado com valor diferente do previsto. Recebido ${reais(p.valor)}; NF de ${reais(valorNf)} (calculada ${reais(r.valor_nf)}). Data da NF: ${dataBr(p.data)}.`, 'aviso');
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
  irImpostos: (form) => ir(`#/impostos?mes=${new FormData(form).get('mes')}`),

  /** Valor da guia calculado pelo contador (vazio apaga). */
  async guiaImposto(form) {
    const texto = String(new FormData(form).get('valor') || '').trim();
    const valor = texto ? C.centavos(texto) : null;
    if (valor !== null && !(valor >= 0)) throw new Error('Valor inválido.');
    const { emitente, imposto, periodo } = form.dataset;
    await alterar((db) => R.salvarGuiaImposto(db, Number(emitente), imposto, periodo, valor, login()));
    aviso(valor === null ? 'Valor do contador apagado.' : 'Valor do contador salvo.');
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

  async estilosAlertas(form) {
    const f = Object.fromEntries(new FormData(form));
    const estilos = {};
    for (let n = 0; f[`tipo_${n}`] !== undefined; n += 1) estilos[f[`tipo_${n}`]] = { cor: f[`cor_${n}`], enfase: f[`enfase_${n}`], prioridade: f[`prioridade_${n}`] };
    await alterar((db) => R.salvarEstilosAlertas(db, estilos, login()));
    aviso('Aparência dos alertas salva.');
    ir('#/');
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
  vistorias: { admin: true, voltar: (r) => `#/contrato/${r.contrato_id}?ir=documentos` },
  aditivos: { depois: (db, r) => R.marcarAditivos(db, r.contrato_id, login()), voltar: (r) => `#/contrato/${r.contrato_id}?ir=aditivos` },
  fiadores: { voltar: (r) => `#/contrato/${r.contrato_id}?ir=garantia` },
  depositos_garantia: { depois: (db, r) => (r.complementar ? null : R.acertarGarantiaDepositada(db, r.contrato_id, r.qual, login())), voltar: (r) => `#/contrato/${r.contrato_id}?ir=garantia` },
  despesas: {},
  ressarcimentos: {
    checar: (db, r) => ((R.boletoDoMes(db, r.contrato_id, r.competencia_abatimento) || {}).data_pagamento
      ? 'Este ressarcimento já foi abatido num boleto pago. Desfaça o pagamento antes.' : null),
    depois: (db, r) => R.aplicarRessarcimentos(db, R.buscar(db, 'contratos', r.contrato_id), r.competencia_abatimento, login()),
    voltar: (r) => `#/contrato/${r.contrato_id}?ir=ressarcimentos`,
  },
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
async function baixarPdfs(numeros, nomeZip, emitenteId = null) {
  const fs = E.d.faturas.filter((f) => f.situacao === 'Emitida' && numeros.includes(f.numero) && (!emitenteId || f.emitente_id === emitenteId))
    .sort((a, b) => a.numero - b.numero || a.id - b.id);
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

  async documentoWord() {
    const [caminho, consulta] = location.hash.replace(/^#\/?/, '').split('?');
    const m = await documentoMontado(caminho.split('/')[1], Object.fromEntries(new URLSearchParams(consulta || '')));
    if (!m) throw new Error('Registro não encontrado.');
    const [JSZip, logo] = await Promise.all([jsZip(), logoPng()]);
    const i = buscar('imoveis', m.c.imovel_id);
    const blob = await K.contratoDocx(JSZip, m.blocos, { logo, rodape: m.rodape, titulo: `${m.nome} - ${m.c.inquilino_nome}` });
    baixar(blob, `${m.arquivo || `${m.nome} - ${m.c.inquilino_nome}${i ? ` - ${i.nome}` : ''}`}.docx`.replace(/[\\/:*?"<>|]/g, '-'));
  },

  /** PDF de um trecho da página (carta de reajuste, demonstrativo do boleto), com margens e "Página X de Y". */
  async baixarPdfTela({ seletor, nome }) {
    const el = document.querySelector(seletor);
    if (!el) throw new Error('Documento não encontrado.');
    aviso('Gerando o PDF…', 'info');
    baixar(await pdfDoDocumento(el, [], { margemLado: 15 }), `${nome || 'Documento'}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
  },

  /** PDF do documento que está na tela (contrato, vistoria, recibo das chaves), com o rodapé e "Página X de Y" em todas as folhas. */
  async documentoPdf() {
    const [caminho, consulta] = location.hash.replace(/^#\/?/, '').split('?');
    const m = await documentoMontado(caminho.split('/')[1], Object.fromEntries(new URLSearchParams(consulta || '')));
    const el = document.querySelector('.impressao .contrato');
    if (!m || !el) throw new Error('Documento não encontrado.');
    const blob = await pdfDoDocumento(el, m.rodape);
    baixar(blob, `${m.arquivo || `${m.nome} - ${m.c.inquilino_nome}`}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
  },

  async escolherPastaSegura() {
    if (!podeUsuario('admin')) throw new Error('Só o administrador configura o backup seguro.');
    try {
      E.pastaSeguraNova = E.teste ? await pastaSeguraDeTeste() : await window.showDirectoryPicker({ id: 'backup-seguro', mode: 'readwrite' });
    } catch (e) {
      if (e.name === 'AbortError') return;
      throw e;
    }
    if (E.pasta && (await E.pasta.isSameEntry(E.pastaSeguraNova))) {
      E.pastaSeguraNova = null;
      throw new Error('Escolha uma pasta diferente da pasta dos dados.');
    }
    await mostrar();
  },

  async reconectarSeguro() {
    if (await conectarSeguro(true)) {
      naFilaSegura(() => B.espelhar(E.seguro.dir, E.seguro.chave, E.d));
      aviso('Backup seguro reconectado.');
    } else aviso('O acesso à pasta segura não foi liberado.', 'erro');
    await mostrar();
  },

  async backupCompletoAgora() {
    aviso('Gravando o backup completo…', 'info');
    await backupCompletoSeguro();
    if (E.seguroErro) throw new Error(E.seguroErro);
    aviso('Backup completo gravado na pasta segura.');
    await mostrar();
  },

  async desconectarSeguro() {
    await S.esquecerPastaSegura();
    E.seguro = null;
    aviso('Backup seguro desligado neste computador.');
    await mostrar();
  },

  /** CPF já cadastrado: copia nome, contato e qualificação da pessoa para os campos deste formulário. */
  usarPessoa({ fonte, alvo }, el) {
    const [tabela, id, pref] = fonte.split(':');
    const r = buscar(tabela, id);
    const form = el.closest('form');
    for (const k of CAMPOS_PESSOA_FORM) {
      const campo = form.querySelector(`[name="${alvo}${k}"]`);
      const v = r[`${pref}${k}`];
      if (!campo || v === undefined || v === null || v === '') continue;
      campo.value = v;
      campo.dispatchEvent(new Event('change', { bubbles: true }));
    }
    el.closest('[data-auto-msg]').innerHTML = `Dados de <b>${esc(r[`${pref}nome`])}</b> copiados. Confira antes de salvar.`;
  },

  /** Vistoria: marca o cômodo inteiro ("Bom") ou copia a situação da entrada, só nos itens ainda sem situação. */
  vistoriaTudo({ comodo, valor }) {
    document.querySelectorAll(`select[data-comodo="${comodo}"]`).forEach((el) => {
      if (el.value) return;
      el.value = valor === 'entrada' ? el.dataset.entrada || '' : valor;
    });
    guardarRascunhoVistoria();
  },

  /** Vistoria: limpa a situação e a observação de todos os itens do cômodo. */
  vistoriaApagar({ comodo }) {
    document.querySelectorAll(`[data-comodo="${comodo}"]`).forEach((el) => { el.value = ''; el.classList.remove('piorou'); el.dispatchEvent(new Event('change', { bubbles: true })); });
    guardarRascunhoVistoria();
  },

  inserirComodoModelo({ comodo }) {
    const t = document.querySelector('textarea[name=modelo]');
    t.value = `${t.value.replace(/\s*$/, '')}${t.value.trim() ? '\n\n' : ''}## ${comodo}\n${MODELO_COMODOS[comodo].join('\n')}\n`;
    t.focus();
    t.scrollTop = t.scrollHeight;
  },

  copiarModeloVistoria() {
    const sel = document.querySelector('select[name=copiar_de]');
    const t = document.querySelector('textarea[name=modelo]');
    const outro = buscar('imoveis', sel.value);
    if (t.value.trim() && !confirm('Substituir o texto atual pelo modelo do outro imóvel?')) return;
    t.value = outro.modelo_vistoria || '';
  },

  /** Contas pagas por nós: preenche cada valor vazio com o último lançado. */
  repetirContas() {
    const form = document.querySelector('form[data-form=lancarContas]');
    form.querySelectorAll('input[name^=valor_]').forEach((el) => { if (!el.value && el.placeholder && el.placeholder !== '0,00') el.value = el.placeholder; });
  },

  async etapaFechamento({ mes, etapa, feito }) {
    await alterar((db) => R.marcarEtapaFechamento(db, mes, etapa, feito === '1', login()));
    await mostrar();
  },

  async desmarcarReservaAbatida({ id }) {
    const n = await alterar((db) => R.desmarcarReservaAbatida(db, Number(id), login()));
    aviso(`Registro excluído: a reserva volta a abater os boletos em aberto${n ? ` (${n} boleto(s) ajustado(s))` : ''}.`);
    await mostrar();
  },

  /** Tira a reserva dos boletos em aberto e aplica de novo a partir do mês marcado (também nos alterados à mão). */
  async reaplicarReserva({ id }) {
    const n = await alterar((db) => R.realocarReserva(db, R.buscar(db, 'contratos', Number(id)), login()));
    const c = buscar('contratos', id);
    const alerta = R.alertaReservaParada(d(), c);
    aviso(n ? `Reserva reaplicada: ${n} boleto(s) ajustado(s).` : 'A reserva já estava nos boletos certos.', n ? 'ok' : 'info');
    if (alerta) aviso(alerta.texto, 'aviso');
    await mostrar();
  },

  async ressarcimentoNaNf({ valor }) {
    if (!podeUsuario('admin')) throw new Error('Só administradores mudam esta opção.');
    await alterar((db) => {
      db.ressarcimento_abate_nf = valor === '1';
      R.registrar(db, login(), 'Alteração', 'banco', null, `Ressarcimento de condomínio ${valor === '1' ? 'abate o valor da NF' : 'não abate a NF (conta como gasto)'}`, null, {}, false);
      // boletos em aberto com ressarcimento passam a seguir a opção nova
      for (const cb of db.cobrancas.filter((x) => !x.data_pagamento && x.ressarcimento > 0)) R.atualizar(db, 'cobrancas', cb.id, { ressarcimento_na_nf: valor === '1' }, login(), 'Ressarcimento na NF');
    });
    await mostrar();
  },

  async condominioConferido({ id, mes }) {
    await alterar((db) => R.marcarCondominioConferido(db, Number(id), mes, login()));
    await mostrar();
  },

  async estilosAlertasPadrao() {
    await alterar((db) => R.salvarEstilosAlertas(db, {}, login()));
    aviso('Alertas de volta ao padrão do sistema.');
    await mostrar();
  },

  async documentoPerdido({ contrato, campo }) {
    await alterar((db) => R.marcarDocumentoPerdido(db, Number(contrato), campo, C.hojeIso(), login(), podeUsuario('admin')));
    await mostrar();
  },

  /** Anexo com assinatura faltante: a janela só oferece os nomes ligados ao contrato. */
  async documentoParcial({ contrato, campo }, el) {
    const form = el.closest('form');
    const data = form.querySelector('[name=data]').value;
    const arquivo = form.querySelector('[name=arquivo]').files[0];
    const doc = R.DOCUMENTOS_ENTRADA.find(([k]) => k === campo);
    if (!data) throw new Error('Informe a data.');
    if (!arquivo) throw new Error(`Anexe o arquivo de "${doc[1]}" (mesmo sem todas as assinaturas) antes de clicar em "Falta assinatura".`);
    const partes = R.partesDoContrato(d(), buscar('contratos', contrato));
    const r = await janela({ titulo: `De quem falta a assinatura? (${doc[1]})`,
      html: `<p class="suave">Só aparecem as pessoas e empresas cadastradas neste contrato. Marque todas que faltam.</p>
        ${partes.map((p) => `<label class="check"><input type="checkbox" name="falta" value="${esc(R.textoParte(p))}"> <b>${esc(p.nome)}</b> <span class="suave">(${esc(p.papel)})</span></label>`).join('')}`,
      sim: 'Anexar com assinatura faltante' });
    if (!r) return;
    if (!r.falta || !r.falta.length) throw new Error('Marque de quem falta a assinatura. Nada foi salvo.');
    const nome = await salvarAssinado('assinados', Number(contrato), arquivo, `${doc[1]} falta assinatura ${data}`);
    await alterar((db) => R.anexarDocumentoParcial(db, Number(contrato), campo, { data, arquivo: nome, falta: r.falta }, login(), podeUsuario('admin')));
    aviso(podeUsuario('admin') ? 'Anexado. Fica o alerta até chegar o arquivo com todas as assinaturas.' : 'Anexado. O administrador vai analisar; fica o alerta até chegar o arquivo com todas as assinaturas.');
    await mostrar();
  },

  async desfazerParcial({ contrato, campo }) {
    await alterarApagandoAnexos((db) => R.anexarDocumentoParcial(db, Number(contrato), campo, null, login(), podeUsuario('admin')));
    await mostrar();
  },

  /** Administrador confirma ou recusa a perda ou o anexo com assinatura faltante registrados por outro usuário. */
  async analisarDocumento({ contrato, campo, tipo, aceitar }) {
    if (!podeUsuario('admin')) throw new Error('Só o administrador analisa.');
    await alterarApagandoAnexos((db) => R.analisarDocumento(db, Number(contrato), campo, tipo, aceitar === '1', login()));
    await mostrar();
  },

  async desmarcarPerdido({ contrato, campo }) {
    await alterar((db) => R.marcarDocumentoPerdido(db, Number(contrato), campo, null, login()));
    await mostrar();
  },

  /** Comprovante de depósito que faltava: grava na pasta do inquilino e liga ao registro (some o alerta). */
  async anexarComprovante({ contrato, tabela, id, campo, tipo, data }, el) {
    const arq = el.files[0];
    const nome = await S.salvarArquivo(await pastaDoEscopo('contrato', Number(contrato)), new File([arq], nomeComprovante(tipo, data, arq)));
    await alterar((db) => R.anexarComprovante(db, tabela, Number(id), campo, nome, login()));
    aviso('Comprovante anexado.');
    await mostrar();
  },

  /** Histórico (administrador): desfaz uma alteração ou as marcadas, recalculando os boletos em aberto quando for o caso. */
  async desfazerAlteracao({ itens }) {
    await desfazerItens(String(itens).split(','));
  },

  async desfazerMarcados() {
    const itens = [...document.querySelectorAll('input[data-desfazer]:checked')].map((x) => x.value);
    if (!itens.length) throw new Error('Marque as alterações que quer desfazer.');
    if (!confirm(`Desfazer ${itens.length} alteração(ões) marcada(s)? Cada campo volta ao valor anterior.`)) return;
    await desfazerItens(itens);
  },

  /**
   * "Excluir" do arquivo já guardado num formulário de edição (#/editar/tabela/id): tira do registro e apaga da pasta.
   * A página não é redesenhada: o que já foi digitado no formulário continua lá (ao salvar, o registro é lido de novo).
   */
  async excluirAnexoDoCampo({ campo }, el) {
    if (!opera()) throw new Error('Seu usuário não pode excluir arquivos.');
    const [, acao, tabela, id] = location.hash.split('?')[0].split('/');
    const r = acao === 'editar' ? buscar(tabela, id) : null;
    if (!r || !r[campo]) throw new Error('Arquivo não encontrado neste registro.');
    await alterarApagandoAnexos((db) => R.atualizar(db, tabela, r.id, { [campo]: null }, login(), `Arquivo excluído: ${r[campo]}`));
    arquivoApagadoNoFormulario(el, r[campo]);
  },

  /** "Excluir" de uma foto já guardada da vistoria (fachada, relógios, quadro de disjuntores). */
  async excluirFotoVistoria({ campo, vistoria }, el) {
    if (!opera()) throw new Error('Seu usuário não pode excluir arquivos.');
    const v = buscar('vistorias', vistoria);
    if (!v || !(v.fotos || {})[campo]) throw new Error('Foto não encontrada.');
    const fotos = { ...v.fotos };
    delete fotos[campo];
    await alterarApagandoAnexos((db) => R.atualizar(db, 'vistorias', v.id, { fotos }, login(), `Foto da vistoria excluída: ${v.fotos[campo]}`));
    arquivoApagadoNoFormulario(el, v.fotos[campo]);
  },

  /** Contrato anterior (troca de titular): leva o comprovante e a data do depósito da garantia para o novo titular. */
  async sincronizarGarantia({ id }) {
    let n = null;
    await alterar((db) => { n = R.sincronizarGarantiaHerdeiro(db, Number(id), login()); });
    aviso(n ? `Garantia atualizada em ${n.inquilino_nome}.` : 'Anexe primeiro aqui o comprovante do depósito (ou registre o depósito com o comprovante).', n ? 'ok' : 'aviso');
    await mostrar();
  },

  async removerComprovanteGarantia({ contrato, qual }) {
    await alterarApagandoAnexos((db) => R.removerComprovanteGarantia(db, Number(contrato), qual, login()));
    aviso('Comprovante removido: anexe o certo em "Incluir … e anexar comprovante".');
    await mostrar();
  },

  async desmarcarDocumento({ contrato, campo }) {
    await alterarApagandoAnexos((db) => R.marcarDocumento(db, Number(contrato), campo, null, login()));
    await mostrar();
  },

  /** Vistoria: acrescenta o roteiro do cômodo no fim do descritivo. */
  inserirRoteiro({ comodo }) {
    const t = document.querySelector('textarea[name=descritivo]');
    t.value = `${t.value.replace(/\s*$/, '')}${t.value.trim() ? '\n\n' : ''}${roteiroTexto(comodo)}`;
    t.focus();
    t.scrollTop = t.scrollHeight;
  },

  async copiarModelo({ id }) {
    let novo;
    await alterar((db) => {
      const m = R.buscar(db, 'modelos_contrato', modelosNoBanco(db, Number(id)));
      novo = R.inserir(db, 'modelos_contrato', { nome: `Cópia de ${m.nome}`, texto: m.texto, ...(m.tipo ? { tipo: m.tipo } : {}) }, login(), `Modelo de contrato "Cópia de ${m.nome}"`);
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
    // lançamento com anexo (aditivo, comprovante, apólice, fotos da vistoria): o arquivo sai junto. Contrato e imóvel guardam a pasta.
    await (['contratos', 'imoveis'].includes(tabela) ? alterar : alterarApagandoAnexos)((db) => {
      const reg = R.buscar(db, tabela, id);
      const problema = cfg.checar ? cfg.checar(db, reg) : null;
      if (problema) throw new Error(problema);
      if (tabela === 'imoveis') {
        for (const t of ['participacoes', 'seguros', 'leituras', 'reformas', 'iptus', 'titularidades', 'despesas', 'vistorias']) db[t].filter((p) => p.imovel_id === reg.id).forEach((p) => R.excluir(db, t, p.id, login()));
      }
      if (tabela === 'contratos') R.excluirContrato(db, reg.id, login());
      else R.excluir(db, tabela, reg.id, login(), reg.nome || reg.descricao || null);
      if (cfg.recalcular) R.recalcularCobrancas(db, cfg.recalcular(db, reg), login());
      if (cfg.depois) cfg.depois(db, reg);
    });
    // contrato excluído: a pasta dele sai junto se estiver vazia (pasta com documentos fica guardada)
    if (tabela === 'contratos') {
      try { await S.apagarPastaVazia(await S.subpasta(await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS), [pastaPaiContrato(r)], false), r.pasta || nomePastaContrato(r)); } catch { /* pasta nem existia */ }
    }
    aviso('Excluído.');
    if (destino) ir(destino); else await mostrar();
  },

  /** Arquivos que sobraram de lançamentos excluídos antes (comprovantes, fotos da vistoria, assinados, aditivos): lista e apaga. */
  async limparAnexosSoltos() {
    if (!podeUsuario('admin')) throw new Error('Só o administrador apaga arquivos sem lançamento.');
    const emUso = anexosEmUso();
    const vistas = new Set();
    const soltos = [];
    for (const c of d().contratos) {
      for (const escopo of ['contrato', 'assinados', 'aditivos']) {
        const pasta = chavePasta(escopo, c.id);
        if (vistas.has(pasta)) continue;
        vistas.add(pasta);
        let dir;
        try { dir = await pastaDoEscopo(escopo, c.id, false); } catch { continue; }
        for (const a of await S.listar(dir)) {
          // na pasta do inquilino ficam também as fichas e documentos anexados à mão: só os gravados pelo sistema
          if (escopo === 'contrato' && !/^(comprovante-|vistoria-(entrada|saida)-)/i.test(a.nome)) continue;
          if (!emUso.has(`${pasta}|${a.nome}`)) soltos.push({ escopo, id: c.id, nome: a.nome, quem: c.inquilino_nome });
        }
      }
    }
    for (const i of d().imoveis) {
      let dir;
      try { dir = await pastaDoEscopo('seguro', i.id, false); } catch { continue; }
      const pasta = chavePasta('seguro', i.id);
      // apólices: só os arquivos que já foram de uma apólice (os anexados à mão na caixa ficam)
      for (const a of await S.listar(dir)) if (/^(apolice|seguro)-/i.test(a.nome) && !emUso.has(`${pasta}|${a.nome}`)) soltos.push({ escopo: 'seguro', id: i.id, nome: a.nome, quem: i.nome });
    }
    if (!soltos.length) { aviso('Nenhum arquivo sobrando: todos os anexos têm lançamento.', 'info'); return; }
    const ok = await janela({ titulo: `${soltos.length} arquivo(s) sem lançamento`, forte: true,
      html: `<p>Estes arquivos ficaram na pasta depois que o lançamento foi excluído. Serão <b>apagados de vez</b>:</p>
        <ul style="max-height:300px;overflow:auto">${soltos.map((a) => `<li>${esc(a.quem)}: ${esc(a.nome)}</li>`).join('')}</ul>`,
      sim: `Apagar ${soltos.length} arquivo(s)`, nao: 'Cancelar' });
    if (!ok) return;
    const n = await apagarAnexos(soltos, 'Arquivo sem lançamento apagado na limpeza');
    aviso(`${n} arquivo(s) apagado(s).`);
    await mostrar();
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

  async recalcularCorrecoes({ id }) {
    let n = 0;
    await alterar((db) => {
      n = R.recalcularCorrecoes(db, Number(id), login());
      R.recalcularCobrancas(db, (cb) => cb.contrato_id === Number(id), login());
    });
    aviso(`${n} correção(ões) refeita(s) a partir do aluguel inicial.`);
    await mostrar();
  },

  /** Fiador: excluir o cadastro (fiador contratual lançado errado; pode ser incluído de novo em "Editar contrato") ou trocar a garantia. */
  async excluirFiador({ id }) {
    const f = buscar('fiadores', id);
    if (!f) throw new Error('Fiador não encontrado.');
    const r = await janela({ titulo: `Fiador ${f.nome}`,
      html: `<p>Deseja excluir fiador contratual ou trocar garantia/fiador?</p>
        <p><label class="check" style="padding-top:0"><input type="radio" name="escolha" value="excluir"> Excluir fiador contratual (cadastro errado). Pode ser incluído de novo em "Editar contrato"</label></p>
        <p><label class="check" style="padding-top:0"><input type="radio" name="escolha" value="trocar" checked> Trocar garantia/fiador (fica guardado no histórico, com termo aditivo)</label></p>`,
      sim: 'Continuar', nao: 'Cancelar' });
    if (!r) return;
    if ((r.escolha || [])[0] === 'trocar') return ir(`#/novo/trocas_garantia?contrato=${f.contrato_id}`);
    await ACOES.excluir({ tabela: 'fiadores', id: f.id });
  },

  cancelarPagamentoDivergente() {
    pagamentoDivergente = null;
    aviso('Pagamento não confirmado. Nada foi salvo.');
    return mostrar();
  },

  async cancelarTrocaGarantia({ id }) {
    await alterar((db) => R.cancelarTrocaGarantia(db, Number(id), login()));
    aviso('Troca de garantia cancelada: o contrato voltou para a garantia anterior.');
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

  async gerarBoletoCaucao({ contrato, comp }) {
    const cb = await alterar((db) => R.gerarBoletoCaucao(db, Number(contrato), login(), comp || null));
    aviso(`Boleto do complemento da caução gerado: ${reais(cb.caucao_complemento)}, vence em ${dataBr(cb.vencimento)}.`, 'ok');
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

  /** Exclui os boletos marcados na lista. Pagos não saem: desfaça o pagamento antes (com NF, cancele a NF antes). */
  async excluirBoletosSelecionados({ comp }) {
    const ids = [...document.querySelectorAll('input[data-boleto]:checked')].map((x) => Number(x.dataset.boleto));
    if (!ids.length) throw new Error('Marque pelo menos um boleto na lista (ou "selecionar todos").');
    const nome = (cb) => { const c = buscar('contratos', cb.contrato_id); return c ? c.inquilino_nome : `boleto ${cb.id}`; };
    const pagos = ids.map((id) => buscar('cobrancas', id)).filter((cb) => cb && cb.data_pagamento);
    if (pagos.length) throw new Error(`Boleto(s) já pago(s) não podem ser excluídos: ${pagos.map(nome).join(', ')}. Desmarque ou desfaça o pagamento antes.`);
    if (!confirm(`Excluir ${ids.length} boleto(s) de ${compBr(comp)}? Eles podem ser gerados de novo depois.`)) return;
    await alterar((db) => {
      for (const id of ids) {
        const cb = R.buscar(db, 'cobrancas', id);
        const problema = TABELAS_EXCLUSAO.cobrancas.checar(db, cb);
        if (problema) throw new Error(`${nome(cb)}: ${problema}`);
        R.excluir(db, 'cobrancas', id, login(), `Boleto de ${compBr(cb.competencia)} - ${nome(cb)} (exclusão em lote)`);
      }
    });
    aviso(`${ids.length} boleto(s) excluído(s).`);
    await mostrar();
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

  /** Todas as NFs do mês em PDF (ZIP); com ``empresa``, só as daquela empresa (ex.: todas da ANK). */
  async pdfMes({ mes, empresa }) {
    const ns = [...new Set(E.d.faturas.filter((f) => f.situacao === 'Emitida' && f.emissao.slice(0, 7) === mes).map((f) => f.numero))];
    const e = empresa ? buscar('emitentes', empresa) : null;
    await baixarPdfs(ns, `NFs ${mes} PDF${e ? ` ${siglaEmpresa(e)}` : ''}`, e ? e.id : null);
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

  /** Resultados financeiros do período em Excel: uma aba com o ranking e outra com as contas pagas por nós. */
  async excelResultados({ de, ate }) {
    const ExcelJS = await excelJs();
    const lista = R.resultadosFinanceiros(E.d, de, ate).sort((a, b) => a.controle - b.controle);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Resultados');
    const moeda = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    ws.addRow([`Resultados financeiros de ${dataBr(de)} a ${dataBr(ate)}`]).font = { bold: true, size: 14 };
    ws.addRow([`Gerado em ${new Date().toLocaleString('pt-BR')}`]).font = { italic: true, color: { argb: 'FF666666' } };
    ws.addRow([]);
    const colunas = [['Posição', 9], ['Imóvel', 30], ['Valor do imóvel + reformas', 22], ['Aluguel recebido', 18], ['NFs avulsas', 15], ['IPTU pago pelo proprietário', 22],
      ['Contas pagas por nós', 20], ['Resultado', 18], ['Retorno ao ano', 15], ['Reformas no período', 18], ['Pagamentos', 12], ['Observação', 30]];
    const cab = ws.addRow(colunas.map(([t]) => t));
    cab.font = { bold: true };
    cab.alignment = { wrapText: true, vertical: 'middle' };
    cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; });
    colunas.forEach(([, w], i) => { ws.getColumn(i + 1).width = w; });
    const r = (v) => v / 100;
    lista.forEach((x, n) => ws.addRow([x.retornoAnual !== null && !x.controle ? n + 1 : '', x.imovel.nome, r(x.base), r(x.aluguel), r(x.avulsas), -r(x.iptu), -r(x.contas), r(x.resultado),
      x.retornoAnual === null ? '' : x.retornoAnual / 100, r(x.reformasPeriodo), x.mesesPagos, x.controle ? 'boleto de controle: não conta' : (x.base ? '' : 'informe o valor do imóvel')]));
    const conta = lista.filter((x) => !x.controle);
    const soma = (k) => r(conta.reduce((t, x) => t + x[k], 0));
    const base = conta.reduce((t, x) => t + x.base, 0);
    const resultado = conta.reduce((t, x) => t + x.resultado, 0);
    const meses = lista[0] ? lista[0].meses : 12;
    const tot = ws.addRow(['', 'Total', soma('base'), soma('aluguel'), soma('avulsas'), -soma('iptu'), -soma('contas'), soma('resultado'), base ? (resultado * 12 / meses / base) : '', soma('reformasPeriodo'), '', '']);
    tot.font = { bold: true };
    tot.eachCell((c) => { c.border = { top: { style: 'medium' } }; });
    for (const col of [3, 4, 5, 6, 7, 8, 10]) ws.getColumn(col).numFmt = moeda;
    ws.getColumn(9).numFmt = '0.00%';
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    // contas pagas por nós no período, uma por linha
    const wc = wb.addWorksheet('Contas pagas por nós');
    wc.addRow(['Imóvel', 'Mês da conta', 'Conta', 'Valor', 'Pago em', 'Observação']).font = { bold: true };
    [30, 14, 14, 15, 13, 40].forEach((w, i) => { wc.getColumn(i + 1).width = w; });
    E.d.despesas.filter((x) => x.data_pagamento >= de && x.data_pagamento <= ate)
      .sort((a, b) => String(a.data_pagamento).localeCompare(String(b.data_pagamento)))
      .forEach((x) => wc.addRow([(buscar('imoveis', x.imovel_id) || {}).nome || '', compBr(x.competencia), x.tipo, r(x.valor), new Date(`${x.data_pagamento}T12:00:00`), x.observacoes || '']));
    // ressarcimentos de condomínio abatidos em boletos pagos no período (quando não saíram da NF)
    E.d.cobrancas.filter((cb) => cb.ressarcimento > 0 && !cb.ressarcimento_na_nf && cb.data_pagamento >= de && cb.data_pagamento <= ate).forEach((cb) => {
      const c = buscar('contratos', cb.contrato_id) || {};
      wc.addRow([(buscar('imoveis', c.imovel_id) || {}).nome || '', compBr(cb.competencia), 'Ressarcimento condomínio', r(cb.ressarcimento), new Date(`${cb.data_pagamento}T12:00:00`), cb.ressarcimento_descricao || '']);
    });
    wc.getColumn(4).numFmt = moeda;
    wc.getColumn(5).numFmt = 'dd/mm/yyyy';
    const buf = await wb.xlsx.writeBuffer();
    baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Resultados ${de} a ${ate}.xlsx`);
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

  async exportarPlanilhaPdf() {
    const [ExcelJS, { jsPDF }] = await Promise.all([excelJs(), bibliotecasPdf()]);
    const quando = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    baixar(await planilhaDeTudo(ExcelJS, E.d), `imoveis-dados-${quando}.xlsx`);
    baixar(pdfDeTudo(jsPDF, E.d), `imoveis-dados-${quando}.pdf`);
    await alterar((db) => R.registrar(db, login(), 'Exportação', 'banco', null, 'Todos os dados exportados em planilha e PDF', null, {}, false));
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
    const vinc = vinculoDoEscopo(escopo, id);
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
    const vinc = vinculoDoEscopo(escopo, id);
    await alterar((db) => R.registrar(db, login(), 'Exclusão', 'arquivos', null, `Arquivo excluído: ${nome}`, null, vinc));
    await mostrar();
  },
};
