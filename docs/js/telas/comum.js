// Peças usadas por todas as telas: componentes de HTML (botão, link, etiqueta), acesso ao banco em memória, histórico,
// pastas e arquivos anexados (nomes, herança na troca de titular, limpeza), estilo dos alertas e caixa de arquivos.
import { alterar, aviso, E, login, mostrar, podeUsuario } from '../app.js';
import * as S from '../armazenamento.js';
import * as C from '../calculos.js';
import { dataBr, pct, reais } from '../calculos.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';

/** Estado de tela que passa de um assunto a outro: troca de titular escolhida no contrato novo; pagamento com valor diferente aguardando a NF. */
export const memoria = { continuacao: null, pagamentoDivergente: null };

// --------------------------------------------------------------------------
// Pequenos componentes
// --------------------------------------------------------------------------
export const botao = (acao, texto, dados = {}, cls = 'secundario pequeno', confirmar = '') => `<button type="button" class="${cls}" data-acao="${acao}" ${Object.entries(dados).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} ${confirmar ? `data-confirmar="${esc(confirmar)}"` : ''}>${texto}</button>`;

export const link = (hash, texto, cls = 'botao secundario pequeno') => `<a class="${cls}" href="${hash}">${texto}</a>`;

export const etiqueta = (texto, tipo) => `<span class="etiqueta ${tipo}">${esc(texto)}</span>`;

export const situacao = (s) => etiqueta(s, { 'Paga em dia': 'ok', 'Paga com atraso': 'aviso', 'Em aberto': 'neutra', Carência: 'info' }[s] || 'neutra');

export const item = (rotulo, valor) => `<div><div class="rotulo">${esc(rotulo)}</div><div class="valor">${valor}</div></div>`;

export const opera = () => podeUsuario('operador');

export const d = () => E.d;

export const buscar = (t, id) => R.buscar(E.d, t, id);

export const ordenar = (lista, campo) => [...lista].sort((a, b) => String(a[campo] || '').localeCompare(String(b[campo] || ''), 'pt-BR'));

export const competenciaPadrao = () => C.somarMeses(C.competenciaDe(C.hojeIso()), -1);

/** Endereço do imóvel por extenso (rua e número, bairro, cidade/UF, CEP): na tela com " · ", no cadastro do inquilino com vírgulas. */
export const endereco = (i, sep = ' · ') => [R.enderecoCompleto(i), i.bairro, i.cidade ? `${i.cidade}${i.uf ? `/${i.uf}` : ''}` : '', i.cep ? `CEP ${i.cep}` : ''].filter(Boolean).join(sep);

export function multaJurosTexto(cb) {
  if (!cb.data_pagamento) return '';
  if (!cb.dias_atraso) return '<span class="suave">sem multa e juros</span>';
  return `Multa ${pct(cb.multa_percentual)} = <b>${reais(cb.multa)}</b><br>Juros ${pct(cb.juros_mensal_percentual)} a.m. × ${cb.dias_atraso} dias = <b>${reais(cb.juros)}</b>`;
}

const textoValor = (v) => (v === null || v === undefined || v === '' ? '(vazio)' : typeof v === 'object' ? JSON.stringify(v) : v);

/**
 * Tabela do histórico. ``desfazer`` (só na página Histórico, para o administrador): { pode: Set "índice:campo", indice: Map registro → índice }
 * mostra a caixinha e o botão ↶ nos campos que podem voltar agora (sempre o mais recente de cada campo).
 */
export function tabelaHistorico(lista, desfazer = null) {
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

export const ultimos = (filtro, n = 40) => d().historico.filter(filtro).slice(-n).reverse();

// --------------------------------------------------------------------------
// Pastas de arquivos
// --------------------------------------------------------------------------
export const SUB_DOCS = 'Matrículas';

/** Nome antigo da pasta das matrículas (renomeada em organizarPastas). */
const SUB_DOCS_ANTIGA = 'Documentos do imóvel';

/** Pasta dos inquilinos dentro da pasta do imóvel: "Imóvel/Inquilinos/Fulano (01-03-2025 a 31-08-2026)". */
export const SUB_INQUILINOS = 'Inquilinos';

export const SUB_ANUNCIO = 'Anúncio';

/** Subpastas do imóvel para cada caixa de arquivos. */
/** Arquivo da matrícula: fica nos documentos do imóvel, com o nome começando por "Matricula". */
export const ehMatricula = (nome) => /^matr[ií]cula/i.test(nome);

const SUBPASTAS = { imovel: SUB_DOCS, matricula: SUB_DOCS, anuncio: SUB_ANUNCIO, iptu: 'IPTU (guias)', seguro: 'Seguro (apólices)', reformas: 'Reformas' };

export const PASTA_SEM_IMOVEL = 'Sem imóvel';

/** Pasta-mãe dos arquivos do inquilino (partes do caminho): "Imóvel/Inquilinos", ou "Sem imóvel". */
export function pastaPaiContrato(c) {
  const i = c.imovel_id ? buscar('imoveis', c.imovel_id) : null;
  return i ? [i.pasta || i.nome, SUB_INQUILINOS] : [PASTA_SEM_IMOVEL];
}

export function nomePastaContrato(c) {
  const fmt = (x) => (x ? dataBr(x).replace(/\//g, '-') : '-');
  return S.limparNome(`${c.inquilino_nome} (${fmt(c.data_entrada)} a ${fmt(c.data_saida)})`);
}

/** Guias do IPTU por ano: o id junta imóvel e ano (imóvel 5, 2026 → 52026), numa subpasta do ano. */
export const idGuiasDoAno = (imovelId, ano) => imovelId * 10000 + ano;

function imovelDoEscopo(escopo, id) { return escopo === 'iptuano' ? Math.floor(id / 10000) : id; }

/** Documentos de entrada assinados: subpasta dentro da pasta do inquilino. */
const SUB_ASSINADOS = 'Documentos assinados';

const SUB_ADITIVOS = 'Termos aditivos';

const escopoDoContrato = (escopo) => ['contrato', 'assinados', 'aditivos'].includes(escopo);

export const vinculoDoEscopo = (escopo, id) => (escopoDoContrato(escopo) ? { contrato_id: Number(id), imovel_id: buscar('contratos', id).imovel_id } : { imovel_id: imovelDoEscopo(escopo, Number(id)) });

/** Identifica a pasta de verdade (dois contratos podem usar a mesma pasta): "Imóvel/Inquilino (datas)/Termos aditivos". */
export function chavePasta(escopo, id) {
  if (escopoDoContrato(escopo)) {
    const c = buscar('contratos', id);
    return c ? [...pastaPaiContrato(c), c.pasta || nomePastaContrato(c), escopo === 'assinados' ? SUB_ASSINADOS : escopo === 'aditivos' ? SUB_ADITIVOS : ''].join('/') : null;
  }
  const i = buscar('imoveis', imovelDoEscopo(escopo, id));
  return i ? [i.pasta || i.nome, escopo].join('/') : null;
}

/** Depois de apagar o arquivo de um campo do formulário: troca só o quadro "Já guardado" (sem redesenhar a página). */
export function arquivoApagadoNoFormulario(el, nome) {
  const caixa = el.closest('.arquivo-guardado');
  if (caixa) caixa.outerHTML = `<div class="ajuda"><span class="etiqueta aviso">Arquivo apagado</span> ${esc(nome)}. Para anexar outro, escolha o arquivo acima.</div>`;
  aviso(`Arquivo apagado: ${nome}.`);
}

/**
 * Troca de titular: traz do contrato anterior as correções, a caução (com os comprovantes, que mudam de pasta) e os boletos
 * a partir da data da troca (R.transferirHeranca). Avisa o que foi feito.
 */
export async function trazerHeranca(id) {
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
  await organizarPastas([r.anterior.id]);
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
  await organizarPastas([r.anterior.id]);
  const c = buscar('contratos', id);
  aviso(`${c.inquilino_nome}: ${[r.garantia && 'garantia (comprovantes, depósitos e aplicações)', r.reserva && `reserva de ${reais(c.reserva_valor)}`].filter(Boolean).join(' e ')} trazida(s) do contrato de ${r.anterior.inquilino_nome}.`, 'info');
  return r;
}

/** Contratos herdados antes desta regra: trazem os dados do anterior uma vez (ao abrir o Painel). */
let herancasFeitas = false;

export async function trazerHerancasPendentes() {
  if (herancasFeitas || !opera() || !E.pasta) return;
  herancasFeitas = true;
  const pendentes = d().contratos.filter((c) => c.contrato_anterior_id && !c.heranca_transferida && R.contratoHerdado(d(), c));
  for (const c of pendentes) await trazerHeranca(c.id);
  // heranças já feitas em que ficou faltando a garantia (comprovantes, depósitos, aplicações) ou a reserva do anterior
  const incompletas = d().contratos.filter((c) => R.herancaIncompleta(d(), c));
  for (const c of incompletas) await completarHeranca(c.id);
  if (pendentes.length || incompletas.length) await mostrar();
}

/**
 * O nome do comprovante acompanha o lançamento (tipo e data, ex.: comprovante-caucao-2026-03-01.pdf): renomeia na pasta
 * os que não batem (data editada, arquivos antigos) e troca o nome nos lançamentos. ``contratoId`` vazio: todos. Devolve quantos.
 */
export async function acertarNomesDosComprovantes(contratoId = null) {
  if (!opera() || !E.pasta) return 0;
  const errados = R.comprovantesComNome(d()).filter((x) => (!contratoId || x.contratoId === contratoId) && !R.nomeBate(x.nome, x.esperado));
  let n = 0;
  for (const x of errados) {
    try {
      const dir = await pastaDoEscopo('contrato', x.contratoId, false);
      const arq = await S.abrirArquivo(dir, x.nome);
      const novo = await S.salvarArquivo(dir, new File([arq], `${x.esperado}${extensao(x.nome)}`));
      await dir.removeEntry(x.nome);
      await alterar((db) => R.renomearReferencias(db, x.contratoId, x.nome, novo, login()));
      n += 1;
    } catch { /* arquivo não está na pasta: fica como está (o link mostra) */ }
  }
  return n;
}

let nomesAcertados = false;

export async function acertarNomesUmaVez() {
  if (nomesAcertados || !opera() || !E.pasta) return;
  nomesAcertados = true;
  if (await acertarNomesDosComprovantes()) await mostrar();
}

/** Arquivos que algum lançamento usa, por pasta: Set de "pasta|nome". */
export const anexosEmUso = () => new Set(R.arquivosReferenciados(d()).map((a) => `${chavePasta(a.escopo, a.id)}|${a.nome}`));

/** Apaga os arquivos da pasta e registra no histórico. ``lista``: [{ escopo, id, nome }]. Devolve quantos apagou. */
export async function apagarAnexos(lista, motivo) {
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
export async function alterarApagandoAnexos(fn) {
  const antes = R.arquivosReferenciados(d()).map((a) => ({ ...a, pasta: chavePasta(a.escopo, a.id) }));
  const r = await alterar(fn);
  const emUso = anexosEmUso();
  const soltos = antes.filter((a) => a.pasta && !emUso.has(`${a.pasta}|${a.nome}`))
    .filter((a, n, l) => l.findIndex((b) => b.pasta === a.pasta && b.nome === a.nome) === n);
  await apagarAnexos(soltos, 'Arquivo apagado junto com o lançamento');
  return r;
}

/** Pasta de uma caixa de arquivos. ``criar`` = false: só olha (não cria pasta vazia só por abrir a página). */
export async function pastaDoEscopo(escopo, id, criar = true) {
  const raiz = await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true });
  if (escopoDoContrato(escopo)) {
    const c = buscar('contratos', id);
    return S.subpasta(raiz, [...pastaPaiContrato(c), c.pasta || nomePastaContrato(c), ...(escopo === 'assinados' ? [SUB_ASSINADOS] : escopo === 'aditivos' ? [SUB_ADITIVOS] : [])], criar);
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

export async function limparSemImovel() {
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

export let pastasComArquivos = [];

/**
 * Organiza as pastas no disco (uma vez por sessão, ao abrir o Painel; e depois de uma troca de titular):
 * - "Documentos do imóvel" passa a se chamar "Matrículas";
 * - a pasta de cada inquilino vai para "Imóvel/Inquilinos" com o nome certo (datas de entrada e saída).
 * Pasta usada por mais de um contrato não é renomeada (só vai para "Inquilinos"), para os arquivos não se separarem.
 * ``ids``: só esses contratos (sem: todos, e também as matrículas). Devolve os avisos do que não deu para juntar.
 */
export async function organizarPastas(ids = null) {
  if (!opera() || !E.pasta) return [];
  const raiz = await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true });
  const abrir = async (partes) => { try { return await S.subpasta(raiz, partes, false); } catch { return null; } };
  const avisos = [];
  if (!ids) {
    for (const i of d().imoveis) {
      let sobrou = 0;
      try {
        const base = await abrir([i.pasta || i.nome]);
        sobrou = base ? await S.juntarPasta(base, SUB_DOCS_ANTIGA, base, SUB_DOCS) : 0;
      } catch (e) { avisos.push(`${i.nome}, pasta "${SUB_DOCS_ANTIGA}": ${motivoDisco(e)}`); }
      if (sobrou) avisos.push(`${i.nome}: ${sobrou} arquivo(s) ficaram em "${SUB_DOCS_ANTIGA}" (já existe um com o mesmo nome em "${SUB_DOCS}")`);
    }
  }
  const chave = (c) => `${c.imovel_id || 0}|${S.limparNome(c.pasta || nomePastaContrato(c))}`;
  const usos = new Map();
  for (const c of d().contratos) usos.set(chave(c), (usos.get(chave(c)) || 0) + 1);
  const novosNomes = [];
  for (const c of d().contratos.filter((x) => !ids || ids.includes(x.id))) {
    const i = c.imovel_id ? buscar('imoveis', c.imovel_id) : null;
    const atual = S.limparNome(c.pasta || nomePastaContrato(c));
    const certo = usos.get(chave(c)) > 1 ? atual : S.limparNome(nomePastaContrato(c));
    // onde a pasta pode estar: solta na pasta do imóvel (como era antes) ou já em "Inquilinos" com o nome antigo
    let falhou = false;
    const origens = i ? [[[i.pasta || i.nome], atual], [[i.pasta || i.nome], certo], [pastaPaiContrato(c), atual]] : [[[PASTA_SEM_IMOVEL], atual]];
    for (const [pai, nome] of origens) {
      const dirPai = await abrir(pai);
      if (!dirPai) continue;
      try { await dirPai.getDirectoryHandle(nome); } catch { continue; }
      let sobrou = 0;
      try { sobrou = await S.juntarPasta(dirPai, nome, await S.subpasta(raiz, pastaPaiContrato(c)), certo); } catch (e) {
        avisos.push(`${c.inquilino_nome}: ${motivoDisco(e)}`);
        falhou = true;
        continue;
      }
      if (sobrou) avisos.push(`${c.inquilino_nome}: ${sobrou} arquivo(s) ficaram em "${[...pai, nome].join('/')}" (já existe um com o mesmo nome na pasta nova)`);
    }
    if (!falhou && c.pasta && c.pasta !== certo) novosNomes.push([c.id, certo]);
  }
  if (novosNomes.length) await alterar((db) => novosNomes.forEach(([id, pasta]) => R.atualizar(db, 'contratos', id, { pasta }, login(), 'Pasta de arquivos (entrada e saída)')));
  return avisos;
}

/** Erro do disco em palavras simples (o mais comum: OneDrive mexendo no arquivo enquanto ele é copiado). */
const motivoDisco = (e) => (['InvalidStateError', 'NotReadableError', 'NoModificationAllowedError'].includes(e && e.name)
  ? 'um arquivo estava sendo usado ou sincronizado (OneDrive); nada foi perdido, e a organização continua na próxima vez que abrir o Painel'
  : e.message);

let pastasOrganizadas = false;

export async function organizarPastasUmaVez() {
  if (pastasOrganizadas || !opera() || !E.pasta) return;
  pastasOrganizadas = true;
  const avisos = await organizarPastas();
  if (avisos.length) aviso(`Organização das pastas, confira: ${avisos.join('; ')}.`, 'aviso');
}

/**
 * Primeiro IPTU lançado depois da separação por ano: as guias que estavam soltas na pasta do IPTU são do ano
 * anterior, e vão para a pasta dele (se ele estiver lançado). Isso acontece uma vez só por imóvel; o que não
 * tiver ano fica em "Guias anteriores", no histórico.
 */
export async function guardarGuiasSoltas(imovelId, anoNovo) {
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
export const extensao = (nome) => { const p = nome.lastIndexOf('.'); return p > 0 ? nome.slice(p).toLowerCase() : ''; };

export const semAcentoArquivo = (nome) => {
  const ext = extensao(nome);
  const base = (ext ? nome.slice(0, nome.lastIndexOf('.')) : nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'arquivo'}${ext}`;
};

/** Guarda o arquivo assinado na pasta do inquilino com nome padrão, sem acento (ex.: contrato-de-locacao-assinado-2026-10-15.pdf). */
export async function salvarAssinado(escopo, contratoId, arquivo, texto) {
  const ponto = arquivo.name.lastIndexOf('.');
  const ext = ponto > 0 ? arquivo.name.slice(ponto).toLowerCase() : '';
  const base = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return S.salvarArquivo(await pastaDoEscopo(escopo, contratoId), new File([arquivo], `${base}${ext}`));
}

/** Cor e ênfase de cada tipo de alerta (escolhidas em "Editar" nos alertas do Painel). */
const SEM_ACENTO = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const classeEstilo = (nivel, e) => `alerta ${nivel} ${e.cor === 'Padrão' ? '' : `cor-${SEM_ACENTO(e.cor)}`} enfase-${SEM_ACENTO(e.enfase)}`;

export const classeAlerta = (a) => classeEstilo(a.nivel, R.estiloAlerta(d(), a.tipo));

/** Para onde leva o clique no alerta: o reajuste abre a tela Reajustes; os demais, o contrato ou o imóvel. */
export const linkAlerta = (a) => (a.tipo === 'Reajuste do aluguel' ? `#/reajustes?contrato=${a.contrato_id}`
  : `${a.contrato_id ? `#/contrato/${a.contrato_id}` : `#/imovel/${a.imovel_id}`}${a.ancora ? `?ir=${a.ancora}` : ''}`);

/** Alertas do mesmo tipo juntos, um embaixo do outro; os grupos seguem a ordem do primeiro alerta de cada tipo (prioridade e gravidade). */
export const gruposDeAlertas = (alertas) => {
  const grupos = new Map();
  for (const a of alertas) grupos.set(a.tipo, [...(grupos.get(a.tipo) || []), a]);
  return [...grupos];
};

/** Caixa de últimas alterações: começa recolhida e só abre quando o usuário clica nela. */
export const caixaHistorico = (titulo, conteudo) => `<details class="cartao caixa-historico"><summary><b>${titulo}</b> <span class="suave">· clique para expandir</span></summary>${conteudo}</details>`;

export function caixaArquivos(escopo, id, titulo, ancora, ajuda = '', dentro = false, enviar = true) {
  return `<div class="${dentro ? 'arquivos-dentro' : 'cartao'}" id="${ancora}">${dentro ? `<h3>${esc(titulo)}</h3>` : `<h2>${esc(titulo)}</h2>`}${ajuda ? `<p class="suave">${esc(ajuda)}</p>` : ''}
    <div data-arquivos="${escopo}:${id}"><p class="suave">Carregando…</p></div>
    ${opera() && enviar ? `<label class="botao secundario pequeno enviar">Anexar arquivos<input type="file" multiple data-upload="${escopo}:${id}" ${escopo === 'anuncio' ? 'accept="image/*"' : ''}></label>` : ''}
    ${opera() && enviar && ['contrato', 'seguro'].includes(escopo) ? `<p class="suave" style="margin-top:4px">${escopo === 'contrato' ? 'Comprovantes de depósito, reserva e caução: anexe no próprio lançamento ("⚠ anexar"), para ficarem ligados a ele. Aqui, só os documentos soltos.' : 'A apólice: anexe em "Cadastrar apólice" (fica ligada à vigência). Aqui, só os documentos soltos.'}</p>` : ''}</div>`;
}

export const urls = [];

export async function listaArquivos(escopo, id, modo = '') {
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  let dir;
  try { dir = await pastaDoEscopo(escopo, id, false); } catch { dir = null; } // pasta ainda não existe: nada anexado
  const todos = dir ? await S.listar(dir) : [];
  // matrícula na lista de imóveis (embaixo do endereço): 📎1, 📎2… com o nome no "title" e o "×" para excluir
  // guias do IPTU na página IPTU (ao lado do nome do imóvel): igual, com todos os arquivos da pasta do ano
  if (escopo === 'matricula' || modo === 'clipe') {
    const tipo = escopo === 'matricula' ? 'da matrícula' : 'da guia';
    return todos.filter((a) => escopo !== 'matricula' || ehMatricula(a.nome)).map((a, n) => `<span class="nw"><a href="#" data-acao="abrirArquivo" data-escopo="${escopo}" data-id="${id}" data-nome="${esc(a.nome)}" title="${esc(a.nome)}">📎${n + 1}</a>${opera() ? botao('excluirArquivo', '×', { escopo, id, nome: a.nome }, 'link-botao excluir-mini', `Excluir o arquivo ${tipo} "${a.nome}"?`) : ''}</span>`).join(' ');
  }
  const itens = todos;
  if (!itens.length && escopo !== 'contrato') return `<p class="suave">${escopo === 'anuncio' ? 'Nenhuma foto ainda.' : 'Nenhum arquivo ainda.'}</p>`;
  if (escopo === 'anuncio') {
    const figs = await Promise.all(itens.map(async (a) => {
      const u = URL.createObjectURL(await S.abrirArquivo(dir, a.nome));
      urls.push(u);
      return `<figure><a href="${u}" target="_blank"><img src="${u}" alt="${esc(a.nome)}"></a><figcaption><span>${esc(a.nome)}</span>${opera() ? botao('excluirArquivo', '×', { escopo, id, nome: a.nome }, 'perigo pequeno', 'Excluir esta foto?') : ''}</figcaption></figure>`;
    }));
    return `<div class="fotos">${figs.join('')}</div>`;
  }
  // arquivo de um lançamento (comprovante, foto da vistoria, apólice, assinado, aditivo): etiqueta com o dono e sem "Excluir"
  // (apaga-se pelo "×" do próprio lançamento, que volta o aviso para anexar); os soltos (fichas, RG, Serasa) têm "Excluir"
  const rotulos = R.rotulosDosArquivos(d());
  const linhas = (esc2, lista) => `<table>${lista.map((a) => { const dono = rotulos.get(`${esc2}:${id}|${a.nome}`);
    return `<tr><td><a href="#" data-acao="abrirArquivo" data-escopo="${esc2}" data-id="${id}" data-nome="${esc(a.nome)}">${esc(a.nome)}</a>${dono ? ` ${etiqueta(`🔗 ${dono}`, 'info')}` : ''}</td>
    <td class="n suave">${Math.max(1, Math.round(a.tamanho / 1024))} KB</td>
    <td class="n nw">${botao('baixarArquivo', 'Baixar', { escopo: esc2, id, nome: a.nome })} ${!opera() || escopo === 'imovel' ? '' : dono ? '<span class="suave" title="Para apagar, use o × ao lado do lançamento: o aviso para anexar volta">apague no lançamento</span>'
    : botao('excluirArquivo', 'Excluir', { escopo: esc2, id, nome: a.nome }, 'perigo pequeno', 'Excluir este arquivo?')}</td></tr>`; }).join('')}</table>`;
  let html = itens.length ? linhas(escopo, itens) : '<p class="suave">Nenhum arquivo ainda.</p>';
  // pasta do inquilino: também os documentos assinados e os termos aditivos (subpastas)
  if (escopo === 'contrato') {
    for (const [sub, titulo] of [['assinados', SUB_ASSINADOS], ['aditivos', SUB_ADITIVOS]]) {
      let pasta;
      try { pasta = await pastaDoEscopo(sub, id, false); } catch { continue; }
      const lista = await S.listar(pasta);
      if (lista.length) html += `<h4 style="margin:10px 0 4px">📁 ${esc(titulo)}</h4>${linhas(sub, lista)}`;
    }
  }
  return html;
}

/** Renomeia a pasta no disco quando o nome do imóvel ou do inquilino (datas) muda. */
export async function renomearNoDisco(paiPartes, antigo, novo) {
  if (!antigo || antigo === novo) return;
  try {
    const raiz = await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true });
    await S.renomearPasta(await S.subpasta(raiz, paiPartes), antigo, novo);
  } catch (e) {
    aviso(`Não consegui renomear a pasta "${antigo}" para "${novo}": ${e.message}`, 'aviso');
  }
}
