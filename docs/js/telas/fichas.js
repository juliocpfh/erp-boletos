// Fichas em análise: pré-cadastro do interessado (dados, reserva e documentos), aprovar ou reprovar e, aprovada, o contrato (#/ficha/ID, caixa em Inquilinos e alerta no Painel).
import { alterar, aviso, E, ir, janela, login, mostrar, podeUsuario } from '../app.js';
import * as S from '../armazenamento.js';
import * as CP from '../conferir-pdf.js';
import * as FO from '../ficha-online.js';
import * as C from '../calculos.js';
import { dataBr, reais } from '../calculos.js';
import { esc, pctTexto } from '../formularios.js';
import * as REC from '../recibos.js';
import * as R from '../regras.js';
import { pdfDoRecibo } from './documentos.js';
import { botaoEmail } from './emails.js';
import { botao, buscar, caixaArquivos, copiarDocumentosParaFicha, d, etiqueta, item as itemGrade, link, naoEncontrado, nomePastaFicha, opera, PASTA_FICHAS, pastaDoEscopo } from './comum.js';

const COR_SITUACAO = { 'Em análise': 'aviso', Aprovada: 'ok', Reprovada: 'neutra', Desistiu: 'neutra' };

const nomesDosImoveis = (f) => (f.imoveis_ids || []).map((id) => (buscar('imoveis', id) || {}).nome).filter(Boolean);

/** Situação da ficha, com o que falta (ex.: "Aprovada · falta o contrato"). */
function situacaoDaFicha(f) {
  const partes = [etiqueta(f.situacao || 'Em análise', COR_SITUACAO[f.situacao] || 'aviso')];
  if (R.imoveisParaContrato(d(), f).length) partes.push(etiqueta('falta o contrato', 'aviso'));
  else if (f.situacao === 'Aprovada' && Object.keys(R.contratosDaFicha(d(), f)).length) partes.push(etiqueta('virou contrato', 'ok'));
  if (R.devolucaoPendente(f)) partes.push(etiqueta('devolver a reserva', 'perigo'));
  return partes.join(' ');
}

/** Caixa da página Inquilinos: as fichas abertas e, recolhidas, as encerradas. */
export function caixaFichas() {
  const fichas = [...(d().fichas || [])].sort((a, b) => String(b.data_recebida || '').localeCompare(String(a.data_recebida || '')));
  const abertas = fichas.filter((f) => R.fichaAberta(d(), f) || R.devolucaoPendente(f));
  const encerradas = fichas.filter((f) => !abertas.includes(f));
  const linha = (f) => `<tr><td><a href="#/ficha/${f.id}"><b>${esc(f.inquilino_nome)}</b></a></td><td>${esc(nomesDosImoveis(f).join(', ') || '-')}${(f.imoveis_ids || []).length > 1 ? `<br><span class="suave">${esc(f.modo_imoveis === 'Todos juntos' ? 'todos juntos' : 'apenas um deles')}</span>` : ''}</td>
    <td class="nw">${dataBr(f.data_recebida)}</td><td class="n nw">${f.reserva_valor ? reais(f.reserva_valor) : '-'}</td><td>${situacaoDaFicha(f)}</td></tr>`;
  const tabela = (lista) => `<table><tr><th>Interessado</th><th>Imóvel(is)</th><th>Recebida em</th><th class="n">Reserva</th><th>Situação</th></tr>${lista.map(linha).join('')}</table>`;
  return `<div class="cartao rolagem" id="fichas"><div class="cabecalho"><h2>Fichas em análise (${abertas.length})</h2>${opera() ? link('#/novo/fichas', 'Nova ficha em análise', 'botao secundario pequeno') : ''}</div>
    <p class="suave">Interessado que manda os dados, a reserva e os documentos para análise. Aprovada, a ficha vira o contrato já preenchido.</p>
    ${abertas.length ? tabela(abertas) : '<p class="suave">Nenhuma ficha em análise.</p>'}
    ${encerradas.length ? `<details id="fichas-encerradas"><summary class="suave">${encerradas.length} ficha(s) encerrada(s): aprovadas que viraram contrato, reprovadas e desistências (clique para ver)</summary>${tabela(encerradas)}</details>` : ''}</div>`;
}

/** Painel: uma linha com o que falta nas fichas (em análise, aprovada sem contrato, reserva a devolver). */
export function alertaFichas() {
  const p = R.pendenciasDasFichas(d());
  const online = E.nuvem && opera() ? '<div data-alertas-ficha-online></div>' : '';
  if (!p.length) return online;
  const devolver = p.some((x) => /devolução/.test(x.texto));
  return `<div class="alerta ${devolver ? 'aviso' : 'info'}"><b>Fichas em análise:</b> ${p.map((x) => `<a href="#/ficha/${x.ficha.id}">${esc(x.texto)}</a>`).join('; ')}.</div>${online}`;
}

const item = (rotulo, valor) => (valor ? itemGrade(rotulo, valor) : '');
const sim = (v, texto) => `${v ? '✓' : '<span class="suave">✗</span>'} ${esc(texto)}`;

export function telaFicha(id) {
  const f = buscar('fichas', id);
  if (!f) return naoEncontrado('Ficha não encontrada', '#/inquilinos', 'Ver os inquilinos');
  const feitos = R.contratosDaFicha(d(), f);
  const paraFazer = R.imoveisParaContrato(d(), f);
  const pj = f.inquilino_tipo === 'Pessoa jurídica (empresa)';
  const abrir = (nome, texto) => `<a href="#" data-acao="abrirArquivo" data-escopo="ficha" data-id="${f.id}" data-nome="${esc(nome)}">📎 ${esc(texto)}</a>`;
  const primeiro = f.documentos_no_contrato ? buscar('contratos', f.documentos_no_contrato) : null;
  const apagarEm = R.dataApagarDocumentosFicha(f);
  const pessoa = [
    item(pj ? 'CNPJ' : 'CPF', esc(f.inquilino_cpf)), item(pj ? 'Inscrição estadual' : 'RG', esc(f.inquilino_rg)),
    item('Telefone', `${esc(f.inquilino_telefone)}${f.inquilino_whatsapp && f.inquilino_telefone ? ' (WhatsApp)' : ''}`), item('E-mail', esc(f.inquilino_email)),
    item('Profissão', esc(f.inquilino_profissao)), item('Endereço', esc(f.inquilino_endereco)),
    item('Representante', esc(f.representante_nome)), item('Inquilino solidário', esc(f.solidario_nome)),
  ].join('');
  // renda, cônjuge e quem vai morar (vão na ficha cadastral em PDF)
  const renda = [
    item('Tipo de renda', esc(f.renda_tipo)), item(pj ? 'Faturamento mensal' : 'Renda mensal', f.renda_mensal > 0 ? reais(f.renda_mensal) : ''),
    item('Fonte da renda', `${esc(f.renda_fonte)}${f.renda_fonte && f.renda_fonte_telefone ? ` · ${esc(f.renda_fonte_telefone)}` : ''}`),
    item('Desde', f.renda_desde ? C.compBr(f.renda_desde) : ''),
    item('Cônjuge', f.conjuge_nome ? `${esc(f.conjuge_nome)}${f.conjuge_cpf ? `, CPF ${esc(f.conjuge_cpf)}` : ''}${f.conjuge_renda > 0 ? ` · renda ${reais(f.conjuge_renda)}` : ''}` : ''),
    item('Quem vai morar', esc(f.moradores).replace(/\n/g, '<br>')), item('Animais', esc(f.animais)),
  ].join('');
  const fiadores = R.fiadoresDaFicha(f);
  const fichaPdf = (tipo, extra, texto) => (REC.reciboDisponivel(d(), tipo, { ficha: f }).ok ? link(`#/imprimir/recibo?tipo=${tipo}&ficha=${f.id}${extra}`, `🧾 ${texto}`, '') : '');
  const fichasPdf = [fichaPdf('ficha', '', 'Ficha cadastral para assinar'),
    ...(fiadores.length ? fiadores.map((x) => fichaPdf('ficha_fiador', `&fiador=${x.n}`, `Ficha do fiador ${x.nome}`)) : [fichaPdf('ficha_fiador', '&fiador=1', 'Ficha do fiador (em branco)')])].filter(Boolean).join(' · ');
  // proposta combinada (vai preenchida para o contrato)
  const bonificado = f.aluguel_inicial > 0 && f.bonificacao !== false && f.desconto_pontualidade_percentual > 0 ? f.aluguel_inicial - C.descontoPorPercentual(f.aluguel_inicial, f.desconto_pontualidade_percentual) : null;
  const incluso = REC.itensDaProposta(f).filter(([rot]) => ['Prazo do contrato', 'IPTU', 'Seguro contra incêndio', 'Contas'].includes(rot));
  const proposta = [
    item('Aluguel', f.aluguel_inicial > 0 ? reais(f.aluguel_inicial) : ''),
    item('Aluguel bonificado', bonificado !== null ? `${reais(bonificado)} <span class="suave">(${esc(pctTexto(Math.round(f.desconto_pontualidade_percentual * 100) / 100))}% de bonificação)</span>` : ''),
    item('Dia do vencimento', f.dia_vencimento ? `dia ${esc(f.dia_vencimento)}` : ''), item('Garantia', esc(f.garantia_tipo)),
    ...incluso.map(([rot, valor]) => item(rot, esc(valor))),
  ].join('');
  // contratos feitos e por fazer, um por imóvel
  const contratos = (f.imoveis_ids || []).map((iid) => {
    const i = buscar('imoveis', iid);
    if (!i) return '';
    const cid = feitos[iid];
    if (cid) return `<li>${esc(i.nome)}: ${link(`#/contrato/${cid}`, `contrato de ${esc((buscar('contratos', cid) || {}).inquilino_nome || '')}`, '')} ${etiqueta('feito', 'ok')}</li>`;
    if (paraFazer.includes(iid)) return `<li>${esc(i.nome)}: ${opera() ? link(`#/novo/contratos?ficha=${f.id}&imovel=${iid}`, 'Fazer o contrato', 'botao pequeno') : etiqueta('falta o contrato', 'aviso')}</li>`;
    if (f.situacao === 'Em análise') return `<li>${esc(i.nome)}</li>`;
    return `<li class="suave">${esc(i.nome)}: sem contrato${f.modo_imoveis !== 'Todos juntos' && Object.keys(feitos).length ? ' (a ficha era para apenas um dos imóveis)' : ''}</li>`;
  }).join('');
  const decisao = f.situacao === 'Em análise' ? '' : `<p>${esc(f.situacao)} em <b>${dataBr(f.decisao_data)}</b>${f.decisao_por ? ` por ${esc(f.decisao_por)}` : ''}${f.decisao_motivo ? `: ${esc(f.decisao_motivo)}` : ''}</p>`;
  const devolucao = !R.fichaSemContrato(f) || !(f.reserva_valor > 0) ? ''
    : f.devolucao_data ? `<p>Reserva devolvida em <b>${dataBr(f.devolucao_data)}</b>: ${reais(f.devolucao_valor || f.reserva_valor)} ${f.comprovante_devolucao ? abrir(f.comprovante_devolucao, 'comprovante da devolução') : etiqueta('sem comprovante da devolução', 'aviso')}
        · ${link(`#/imprimir/recibo?tipo=devolucao_reserva&ficha=${f.id}`, '🧾 Termo de devolução e quitação', '')}</p>
        ${opera() ? `<p class="acoes">${botaoEmail('ficha_devolucao', { ficha: f.id }, '✉ E-mail: devolução da reserva')}</p>` : ''}`
      : `<div class="alerta aviso"><b>Devolver a reserva de ${reais(f.reserva_valor)}.</b> Depois de devolver, registre a data e o comprovante em "Editar".</div>`;
  const documentos = primeiro ? `<p>Os documentos da ficha foram para a pasta do inquilino: ${link(`#/contrato/${primeiro.id}?ir=arquivos`, esc(primeiro.inquilino_nome), '')}.</p>`
    : f.documentos_apagados_em ? `<p class="suave">Os documentos pessoais foram apagados em ${dataBr(f.documentos_apagados_em)} (${R.regra('meses_documentos_ficha')} meses depois da decisão). Ficaram só os comprovantes da reserva e da devolução.</p>` : '';
  return `<p class="suave"><a href="#/inquilinos?ir=fichas">← Inquilinos</a></p>
    <div class="cabecalho"><h1>Ficha em análise: ${esc(f.inquilino_nome)}</h1><div class="acoes">
      ${opera() ? link(`#/editar/fichas/${f.id}`, 'Editar') : ''}
      ${podeUsuario('admin') ? botao('excluir', 'Excluir', { tabela: 'fichas', id: f.id }, 'perigo pequeno', `Excluir a ficha de ${f.inquilino_nome}? Os documentos da pasta dela são apagados juntos.`) : ''}</div></div>
    <div class="cartao"><h2>Situação</h2><p>${situacaoDaFicha(f)} <span class="suave">· recebida em ${dataBr(f.data_recebida)}</span></p>
      ${decisao}
      ${opera() ? `<p class="acoes">${f.reserva_valor > 0 ? botaoEmail('ficha_envio', { ficha: f.id }, '✉ E-mail: envio da ficha cadastral') : '<span class="suave">O e-mail com a ficha cadastral sai depois do depósito da reserva.</span>'} ${f.situacao === 'Aprovada' ? botaoEmail('ficha_aprovada', { ficha: f.id }, '✉ E-mail: ficha aprovada') : ''} ${f.situacao === 'Reprovada' ? botaoEmail('ficha_reprovada', { ficha: f.id }, '✉ E-mail: ficha reprovada') : ''}</p>` : ''}
      ${f.situacao === 'Em análise' && opera() ? `<div class="acoes">${botao('decidirFicha', 'Aprovar', { id: f.id, situacao: 'Aprovada' }, 'pequeno', `Aprovar a ficha de ${f.inquilino_nome}? Depois aparece o botão para fazer o contrato.`)}
        ${link(`#/editar/fichas/${f.id}`, 'Reprovar (com o motivo)', 'botao perigo pequeno')}</div>
        <p class="suave">Para reprovar, escolha "Reprovada" na situação e escreva o motivo. Com reserva paga, registre a devolução (data e comprovante) quando devolver.</p>` : ''}
      ${botaoDesistencia(f)}
      ${devolucao}
      ${apagarEm ? `<p class="suave">Os documentos pessoais desta ficha serão apagados em <b>${dataBr(apagarEm)}</b> (${R.regra('meses_documentos_ficha')} meses depois da decisão).</p>` : ''}</div>
    ${caixaFichaOnline(f)}
    <div class="cartao"><h2>Imóveis de interesse</h2>
      <p>${(f.imoveis_ids || []).length > 1 ? `A ficha é para <b>${esc(f.modo_imoveis === 'Todos juntos' ? 'todos juntos' : 'apenas um dos imóveis')}</b>.` : ''}</p>
      <ul>${contratos || '<li class="suave">Nenhum imóvel marcado.</li>'}</ul>
      ${f.situacao === 'Aprovada' && paraFazer.length ? `<p class="suave">${primeiro ? 'O contrato abre com os dados da pessoa já preenchidos (a reserva e os documentos ficaram no primeiro contrato).' : 'O contrato abre com os dados da pessoa e a reserva já preenchidos. Ao salvar, os documentos da ficha vão para a pasta do inquilino.'}</p>` : ''}</div>
    <div class="cartao"><h2>${esc(pj ? 'Empresa' : 'Interessado')}</h2><div class="grade">${pessoa || '<p class="suave">Só o nome foi preenchido.</p>'}</div></div>
    <div class="cartao"><h2>Renda e moradia</h2>${renda ? `<div class="grade">${renda}</div>` : '<p class="suave">Renda, cônjuge e quem vai morar ainda não preenchidos (em "Editar", ou o interessado completa na ficha cadastral).</p>'}</div>
    ${fiadores.length ? `<div class="cartao"><h2>Fiador</h2><ul>${fiadores.map((x) => `<li><b>${esc(x.nome)}</b>${x.cpf ? `, CPF ${esc(x.cpf)}` : ''}${x.telefone ? ` · ${esc(x.telefone)}` : ''}${x.nome_conjuge ? ` · cônjuge: ${esc(x.nome_conjuge)}` : ''}</li>`).join('')}</ul><p class="suave">Ao fazer o contrato, os fiadores vão preenchidos.</p></div>` : ''}
    <div class="cartao"><h2>Proposta</h2>${proposta ? `<div class="grade">${proposta}</div>` : '<p class="suave">Aluguel, vencimento, bonificação, garantia e o que está incluso ainda não preenchidos (em "Editar"). Eles vão no e-mail da ficha, no recibo da reserva e preenchidos para o contrato.</p>'}</div>
    <div class="cartao"><h2>Reserva</h2>${f.reserva_valor > 0 ? `<p>${reais(f.reserva_valor)}${f.reserva_data ? ` em ${dataBr(f.reserva_data)}` : ''} ${f.comprovante_reserva ? abrir(f.comprovante_reserva, 'comprovante') : primeiro ? '<span class="suave">(o comprovante foi para a pasta do inquilino)</span>' : etiqueta('sem comprovante', 'aviso')}
      ${REC.reciboDisponivel(d(), 'reserva', { ficha: f }).ok ? ` · ${link(`#/imprimir/recibo?tipo=reserva&ficha=${f.id}`, '🧾 Recibo da reserva', '')}` : ''}</p>
      <p class="suave">O recibo e o comprovante vão anexos no e-mail de envio da ficha cadastral, com as condições propostas.</p>` : '<p class="suave">Sem reserva.</p>'}</div>
    <div class="cartao"><h2>Documentos</h2>
      ${fichasPdf ? `<p>${fichasPdf} <span class="suave">· com os dados já preenchidos, a lista de documentos e a declaração antes da assinatura (vão anexas no e-mail de envio da ficha)</span></p>` : ''}
      <p>${[sim(f.doc_ficha, 'Ficha cadastral'), sim(f.doc_pessoais, 'Documentos pessoais'), sim(f.doc_renda, 'Comprovante de renda'), sim(f.doc_residencia, 'Comprovante de residência')].join(' · ')}</p>
      ${f.analise_serasa ? `<p>Análise do Serasa: ${abrir(f.analise_serasa, f.analise_serasa)}</p>` : primeiro || f.documentos_apagados_em ? '' : '<p class="suave">Sem a análise do Serasa (anexe em "Editar").</p>'}
      ${documentos}
      ${primeiro || f.documentos_apagados_em ? '' : caixaArquivos('ficha', f.id, `Arquivos da ficha · 📁 ${f.pasta || nomePastaFicha(f)}`, 'arquivos', 'Ficha cadastral, documentos pessoais, comprovante de renda e outros (PDF ou foto). O comprovante da reserva vai no campo dele, em "Editar".', true)}</div>
    ${f.observacoes ? `<div class="cartao"><h2>Observações</h2><p>${esc(f.observacoes).replace(/\n/g, '<br>')}</p></div>` : ''}`;
}

/**
 * Botão "Desistiu antes de assinar" (ficha em análise ou aprovada): sem contrato, operador ou administrador; com contrato
 * gerado (ainda não assinado), só o administrador, porque o contrato é apagado. Bloqueado: mostra o porquê.
 */
function botaoDesistencia(f) {
  if (!opera() || R.fichaSemContrato(f)) return '';
  const contratos = R.contratosDaDesistencia(d(), { fichaId: f.id });
  const bloqueio = contratos.map((c) => R.motivoSemDesistencia(d(), c)).find(Boolean);
  if (bloqueio) return `<p class="suave">Desistência: ${esc(bloqueio)}</p>`;
  if (contratos.length && !podeUsuario('admin')) return '<p class="suave">Desistência com contrato já gerado: só o administrador cancela o contrato.</p>';
  return `<p class="acoes">${botao('desistirAntesDeAssinar', 'Desistiu antes de assinar', { ficha: f.id }, 'secundario pequeno')}</p>`;
}

/** Botão "Desistiu antes de assinar" da página do inquilino (contrato ainda não assinado; só o administrador). */
export function botaoDesistenciaContrato(c) {
  if (!podeUsuario('admin') || R.motivoSemDesistencia(d(), c)) return '';
  const f = c.ficha_id ? buscar('fichas', c.ficha_id) : null;
  if (f && R.fichaSemContrato(f)) return '';
  return botao('desistirAntesDeAssinar', 'Desistiu antes de assinar', { contrato: c.id }, 'secundario');
}

// --------------------------------------------------------------------------
// Ficha pela internet (pedido do dono em 2026-11-14): um link por pessoa (interessado e fiadores), que vale 7 dias, em
// ficha.ankjck.com.br (fora do login do sistema). A pessoa preenche, manda os documentos e a ficha assinada; o que ela
// manda fica como resposta na nuvem e só entra na ficha quando a equipe confere (ficha-online.js, nuvem/ficha-publica.mjs).
// --------------------------------------------------------------------------
const TEXTO_SITUACAO_LINK = {
  Aguardando: 'link enviado, sem resposta ainda', Respondida: 'respondeu', 'Falta documento': 'falta documento', Assinar: 'falta assinar',
  Assinada: 'ficha assinada recebida', Desistiu: 'avisou que não vai seguir', Encerrado: 'link encerrado',
};
const COR_LINK = { Respondida: 'info', Assinada: 'ok', Desistiu: 'perigo', 'Falta documento': 'aviso', Assinar: 'aviso' };

/** Link guardado na ficha ainda no prazo (ou null). */
const linkValido = (f, pessoa) => { const l = (f.links_ficha || {})[pessoa]; return l && l.url && String(l.vence_em) > new Date().toISOString() ? l : null; };

/** Caixa "Ficha pela internet" da página da ficha: uma linha por pessoa; o que ela mandou aparece depois (ligarFichaOnline). */
function caixaFichaOnline(f) {
  if (!opera() || R.fichaSemContrato(f) || f.documentos_no_contrato) return '';
  const titulo = '<h2>Ficha pela internet</h2>';
  if (!E.nuvem) return `<div class="cartao">${titulo}<p class="suave">Só no sistema na nuvem (erp.ankjck.com.br): o interessado e o fiador recebem um link para preencher os dados, mandar os documentos e a ficha assinada.</p></div>`;
  const linhas = FO.pessoasDaFicha(f).map((p) => {
    const l = (f.links_ficha || {})[p];
    const valido = linkValido(f, p);
    return `<li style="margin:6px 0"><b>${esc(FO.nomeDaPessoa(f, p))}</b>${p === 'interessado' ? '' : ' <span class="suave">(fiador)</span>'}
      <span data-situacao-link="${p}">${valido ? `<span class="suave">link até ${dataBr(String(l.vence_em).slice(0, 10))}</span>` : l ? etiqueta('link vencido', 'aviso') : '<span class="suave">sem link</span>'}</span><br>
      ${botao('gerarLinkFicha', valido ? 'Gerar novo link' : 'Gerar link', { id: f.id, pessoa: p }, valido ? 'secundario pequeno' : 'pequeno', valido ? 'Gerar um link novo? O link atual deixa de valer (o que a pessoa já mandou continua guardado).' : '')}
      ${valido ? botao('compartilharLinkFicha', 'Copiar / WhatsApp', { id: f.id, pessoa: p }, 'secundario pequeno') : ''}</li>`;
  }).join('');
  return `<div class="cartao" data-ficha-online="${f.id}">${titulo}
    <p class="suave">Cada pessoa recebe um link só dela, que vale ${7} dias: preenche os dados, manda os documentos e, depois, a ficha assinada (gov.br ou à mão). O que ela manda só entra na ficha quando vocês conferem. O link do interessado também vai no e-mail de envio da ficha.</p>
    <ul style="padding-left:18px">${linhas}</ul><div data-respostas-link></div></div>`;
}

/** Depois de desenhar a página da ficha: busca na nuvem a situação de cada link (e o que foi mandado). */
export async function ligarFichaOnline(raiz) {
  const painel = raiz.querySelector('[data-alertas-ficha-online]');
  if (painel && E.nuvem) await avisosDoPainel(painel).catch(() => {});
  const caixa = raiz.querySelector('[data-ficha-online]');
  if (!caixa || !E.nuvem) return;
  let links;
  try { links = await FO.linksNaNuvem(Number(caixa.dataset.fichaOnline)); } catch (e) { const r = caixa.querySelector('[data-respostas-link]'); if (r) r.innerHTML = `<p class="suave">Não foi possível ler as respostas da nuvem: ${esc(e.message)}</p>`; return; }
  for (const l of links) {
    const el = caixa.querySelector(`[data-situacao-link="${l.pessoa}"]`);
    if (!el) continue;
    const ultimo = (l.respostas || []).at(-1);
    el.innerHTML = `${etiqueta(TEXTO_SITUACAO_LINK[l.situacao] || l.situacao, COR_LINK[l.situacao] || 'neutra')}
      <span class="suave">${ultimo ? ` · dados enviados em ${C.dataHoraBr(ultimo.em)}` : ''}${(l.arquivos || []).length ? ` · ${l.arquivos.length} arquivo(s)` : ''} · link até ${new Date(l.vence_em).toLocaleDateString('pt-BR')}</span>`;
  }
  caixa._links = links;
  const fichaAqui = buscar('fichas', Number(caixa.dataset.fichaOnline));
  const area = caixa.querySelector('[data-respostas-link]');
  if (area && fichaAqui) {
    area.innerHTML = links.filter((l) => l.situacao !== 'Encerrado' || (l.respostas || []).length).map((l) => blocoDoLink(fichaAqui, l)).join('');
    conferirArquivosDoLink(area, fichaAqui).catch((e) => console.warn('conferência dos arquivos do link', e));
    // quem abriu a ficha viu as novidades: o Painel para de avisar
    for (const l of links.filter((x) => !x.visto_em && ((x.respostas || []).length || (x.arquivos || []).length || x.desistiu_em))) FO.atualizarLinkNaNuvem({ ficha_id: fichaAqui.id, pessoa: l.pessoa, visto: true }).catch(() => {});
  }
  // documentos que chegaram pelo link desde a última vez: a lista da pasta guardada neste aparelho fica velha; busca de novo
  const id = Number(caixa.dataset.fichaOnline);
  const total = links.reduce((n, l) => n + (l.arquivos || []).length, 0);
  if (arquivosDoLinkVistos.has(id) && arquivosDoLinkVistos.get(id) === total) return;
  const antes = arquivosDoLinkVistos.get(id);
  arquivosDoLinkVistos.set(id, total);
  const f = buscar('fichas', id);
  if (total && f && E.anexos?.esquecerLista) {
    E.anexos.esquecerLista(['arquivos', PASTA_FICHAS, f.pasta || nomePastaFicha(f)]);
    if (antes !== undefined || total) await mostrar();
  }
}
/** Quantos arquivos dos links de cada ficha já foram vistos nesta abertura (ficha → quantidade). */
const arquivosDoLinkVistos = new Map();

/** Valor de um campo do link para mostrar (dinheiro em reais, datas, sim/não). */
function valorDoCampo(c, v) {
  if (v === null || v === undefined || v === '') return '<span class="suave">-</span>';
  if (c.tipo === 'dinheiro') return reais(v);
  if (c.tipo === 'data') return dataBr(v);
  if (c.tipo === 'mes') return C.compBr(v);
  if (c.tipo === 'simnao') return v ? 'Sim' : 'Não';
  return esc(v).replace(/\n/g, '<br>');
}

/** Dados do último envio que diferem da ficha: [{ campo, na_ficha, enviado }]. */
function diferencasDoEnvio(f, l) {
  const ultimo = (l.respostas || []).at(-1);
  if (!ultimo) return [];
  return (l.formulario || []).filter((c) => c.nome && ultimo.valores[c.nome] !== null && ultimo.valores[c.nome] !== undefined
    && String(ultimo.valores[c.nome]) !== String(f[c.nome] ?? '')).map((c) => ({ campo: c, na_ficha: f[c.nome], enviado: ultimo.valores[c.nome] }));
}

/** O que a pessoa mandou pelo link: desistência, dados (com o que muda na ficha), documentos (com a conferência) e as ações. */
function blocoDoLink(f, l) {
  const p = l.pessoa;
  const nome = FO.nomeDaPessoa(f, p);
  const ultimo = (l.respostas || []).at(-1);
  const guardado = (f.links_ficha || {})[p] || {};
  const trazido = ultimo && guardado.trazido_em === ultimo.em;
  const partes = [];
  if (l.situacao === 'Desistiu' && p === 'interessado' && !R.fichaSemContrato(f)) {
    partes.push(`<div class="alerta perigo"><b>${esc(nome)} avisou pelo link, em ${C.dataHoraBr(l.desistiu_em)}, que não vai seguir com a análise.</b> Registre com "Desistiu antes de assinar"${f.reserva_valor > 0 ? ` e devolva a reserva de ${reais(f.reserva_valor)} por inteiro` : ''}.</div><p>${botaoDesistencia(f)}</p>`);
  }
  if (ultimo && !trazido) {
    const dif = diferencasDoEnvio(f, l);
    partes.push(`<p><b>Dados enviados em ${C.dataHoraBr(ultimo.em)}</b> <span class="suave">(com a declaração marcada)</span></p>
      ${dif.length ? `<table><tr><th>Campo</th><th>Na ficha</th><th>Enviado</th></tr>${dif.map((x) => `<tr><td>${esc(x.campo.rotulo)}</td><td>${valorDoCampo(x.campo, x.na_ficha)}</td><td><b>${valorDoCampo(x.campo, x.enviado)}</b></td></tr>`).join('')}</table>` : '<p class="suave">Os dados enviados já estão na ficha.</p>'}
      <p class="acoes">${botao('trazerRespostaFicha', dif.length ? 'Trazer para a ficha' : 'Marcar como conferido', { id: f.id, pessoa: p }, 'pequeno', dif.length ? `Trazer os ${dif.length} dado(s) enviados por ${nome} para a ficha? Os outros campos ficam como estão.` : '')}</p>`);
  } else if (ultimo) partes.push(`<p class="suave">Dados enviados em ${C.dataHoraBr(ultimo.em)} já trazidos para a ficha.</p>`);
  if ((l.arquivos || []).length) {
    partes.push(`<p><b>Documentos mandados pelo link</b> <span class="suave">(estão na pasta da ficha, abaixo; a conferência olha por dentro de cada arquivo)</span></p>
      <ul style="padding-left:18px">${l.arquivos.map((a) => `<li data-conferir="${esc(a.arquivo)}" data-nome-pessoa="${esc(nome)}">${esc(a.documento)}: <a href="#" data-acao="abrirArquivo" data-escopo="ficha" data-id="${f.id}" data-nome="${esc(a.arquivo)}">📎 ${esc(a.nome_original || a.arquivo)}</a> <span class="suave">${C.dataHoraBr(a.em)}</span> <span data-sinais class="suave">conferindo…</span></li>`).join('')}</ul>`);
  }
  if (l.faltando && l.faltando.length && l.situacao === 'Falta documento') partes.push(`<p class="suave">Pedido à pessoa: ${esc(l.faltando.join('; '))}.</p>`);
  const ativo = !['Encerrado', 'Desistiu'].includes(l.situacao);
  if (ativo) {
    partes.push(`<p class="acoes">${botao('pedirDocumentoFicha', 'Pedir o que falta', { id: f.id, pessoa: p })}
      ${botao('mandarAssinarFicha', 'Mandar a ficha para assinar', { id: f.id, pessoa: p }, 'secundario pequeno', `Gerar a ficha em PDF com os dados de agora e pedir a assinatura de ${nome} pelo link?`)}
      ${botao('lembrarFicha', 'Lembrar', { id: f.id, pessoa: p })}
      ${botao('encerrarLinkFicha', 'Encerrar o link', { id: f.id, pessoa: p }, 'secundario pequeno', `Encerrar o link de ${nome}? A pessoa não consegue mais abrir nem mandar nada (o que já mandou continua guardado).`)}</p>`);
  }
  if (!partes.length) return '';
  return `<div class="cartao" style="margin:8px 0"><h3>${esc(nome)}${p === 'interessado' ? '' : ' (fiador)'}</h3>${partes.join('')}</div>`;
}

/** Conferência dos documentos que chegaram pelo link (programa que fez o PDF, assinatura); guardada nesta abertura. */
const conferidos = new Map(); // "ficha|arquivo" → html dos sinais
async function conferirArquivosDoLink(area, f) {
  const itens = [...area.querySelectorAll('[data-conferir]')];
  if (!itens.length) return;
  const pasta = await pastaDoEscopo('ficha', f.id, false);
  for (const li of itens) {
    const nome = li.dataset.conferir;
    const chave = `${f.id}|${nome}`;
    if (!conferidos.has(chave)) {
      let html;
      try {
        const blob = await S.abrirArquivo(pasta, nome);
        const r = await CP.conferirArquivo(new Uint8Array(await blob.arrayBuffer()));
        html = sinaisHtml(r, li.dataset.nomePessoa);
      } catch { html = '<span class="suave">não foi possível conferir o arquivo</span>'; }
      conferidos.set(chave, html);
    }
    const alvo = li.querySelector('[data-sinais]');
    if (alvo) { alvo.className = ''; alvo.innerHTML = conferidos.get(chave); }
  }
}

/** Sinais da conferência de um arquivo: alertas (editor), atenção, informação e as assinaturas (com o nome da ficha). */
function sinaisHtml(r, nomePessoa) {
  const cor = { alerta: 'perigo', atencao: 'aviso', info: 'neutra' };
  const titulo = { alerta: '⚠ possível montagem', atencao: 'atenção', info: 'impresso de página' };
  const out = r.sinais.map((s) => `<span class="etiqueta ${cor[s.nivel]}" title="${esc(s.texto)}">${titulo[s.nivel]}</span> <span class="suave">${esc(s.texto)}</span>`);
  for (const a of r.assinaturas) {
    const bate = CP.mesmoNome(a.nome, nomePessoa);
    out.push(`${etiqueta(`✓ assinado${a.govbr ? ' pelo gov.br' : a.icp ? ' (ICP-Brasil)' : ''}`, bate ? 'ok' : 'aviso')} <span class="suave">por ${esc(a.nome || 'nome não lido')}${a.data ? ` em ${dataBr(a.data.slice(0, 10))}` : ''}${bate ? '' : ` · o nome não bate com a ficha (${esc(nomePessoa)})`}</span>`);
  }
  if (!out.length) out.push(`<span class="suave">sem sinal de edição${r.programa ? ` (feito em: ${esc(r.programa)})` : ''}</span>`);
  return out.join('<br>');
}

/** Painel: o que chegou pelos links (ainda não visto), link sem resposta há dias e link vencido sem resposta. */
async function avisosDoPainel(el) {
  const links = await FO.linksNaNuvem();
  const agora = Date.now();
  const dias = R.regra('dias_ficha_parada');
  const linhas = [];
  for (const l of links) {
    const f = buscar('fichas', l.ficha_id);
    if (!f || l.situacao === 'Encerrado' || f.documentos_no_contrato) continue;
    const nome = esc(l.nome || FO.nomeDaPessoa(f, l.pessoa));
    const ir = `<a href="#/ficha/${f.id}">${nome}${l.pessoa === 'interessado' ? '' : ' (fiador)'}</a>`;
    if (l.situacao === 'Desistiu' && !R.fichaSemContrato(f)) { linhas.push(`${ir} avisou pelo link que não vai seguir: registre a desistência${f.reserva_valor > 0 ? ` e devolva a reserva de ${reais(f.reserva_valor)}` : ''}`); continue; }
    if (R.fichaSemContrato(f)) continue;
    const novo = !l.visto_em && (l.ultimo_envio || l.arquivos);
    if (novo) linhas.push(`${ir} ${l.situacao === 'Assinada' ? 'mandou a ficha assinada' : l.ultimo_envio ? 'mandou dados pelo link' : 'mandou documentos pelo link'}: conferir`);
    else if (!l.ultimo_envio && !l.arquivos) {
      const vencido = Date.parse(l.vence_em) < agora;
      const parado = Math.floor((agora - Date.parse(l.criado_em)) / 86400000);
      if (vencido) linhas.push(`${ir}: o link venceu sem resposta (gere um novo na ficha)`);
      else if (parado >= dias) linhas.push(`${ir}: link sem resposta há ${parado} dia(s) ${botao('lembrarFicha', 'Lembrar', { id: f.id, pessoa: l.pessoa }, 'secundario mini')}`);
    }
  }
  el.innerHTML = linhas.length ? `<div class="alerta info"><b>Ficha pela internet:</b> ${linhas.join('; ')}.</div>` : '';
}

/** Janela com o link: copiar, WhatsApp (com o texto pronto) e o lembrete do e-mail. ``lembrete``: texto de lembrar quem não respondeu. */
async function janelaDoLink(f, pessoa, link, { lembrete = false, faltando = [] } = {}) {
  const tel = FO.telefoneWhatsapp(f, pessoa);
  const texto = FO.textoWhatsapp(f, pessoa, link, { lembrete, faltando });
  await janela({
    titulo: `Link da ficha: ${FO.nomeDaPessoa(f, pessoa)}`, sim: 'Fechar', nao: 'Voltar',
    html: `<p>Vale até <b>${dataBr(String(link.vence_em).slice(0, 10))}</b>. É só desta pessoa: não publique.</p>
      <p><textarea rows="5" readonly data-texto-link style="width:100%">${esc(texto)}</textarea></p>
      <p class="acoes"><button type="button" class="secundario pequeno" data-copiar-link>Copiar a mensagem</button>
      ${tel ? `<a class="botao pequeno" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(texto)}">Abrir no WhatsApp</a>` : '<span class="suave">Sem telefone cadastrado para o WhatsApp.</span>'}</p>
      ${pessoa === 'interessado' ? '<p class="suave">O e-mail "Envio de ficha cadastral" já leva este link (e o do fiador, se houver).</p>' : ''}`,
    ligar: (dlg) => {
      dlg.querySelector('[data-copiar-link]').addEventListener('click', async (ev) => {
        try { await navigator.clipboard.writeText(dlg.querySelector('[data-texto-link]').value); ev.target.textContent = 'Copiado ✓'; } catch { dlg.querySelector('[data-texto-link]').select(); }
      });
    },
  });
}

/** Botão "Aprovar" da página da ficha (operador ou administrador). */
export const ACOES_FICHAS = {
  /** Cria o link da pessoa na nuvem (com a ficha em PDF para baixar), guarda na ficha e mostra para copiar ou mandar. */
  async gerarLinkFicha({ id, pessoa }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário não pode gerar o link da ficha.');
    if (!E.nuvem) throw new C.ErroUsuario('A ficha pela internet só funciona no sistema na nuvem.');
    const f = buscar('fichas', id);
    if (!f || !FO.pessoasDaFicha(f).includes(pessoa)) throw new C.ErroUsuario('Ficha ou pessoa não encontrada.');
    const link = await FO.criarLinkNaNuvem(FO.pedidoDoLink(d(), f, pessoa, f.pasta || nomePastaFicha(f)));
    // a ficha em PDF (com o que já se sabe) para quem prefere imprimir; sem ela, o link funciona do mesmo jeito
    try {
      const tipo = pessoa === 'interessado' ? 'ficha' : 'ficha_fiador';
      const pdf = await pdfDoRecibo(tipo, { ficha: f, ...(tipo === 'ficha_fiador' ? { fiador: Number(pessoa.slice(6)) } : {}) });
      await FO.guardarPdfNaNuvem(f.id, pessoa, pdf.blob);
    } catch (e) { console.warn('ficha em PDF do link', e); }
    const guardado = { url: link.url, vence_em: link.vence_em, criado_em: new Date().toISOString(), por: login() };
    await alterar((db) => R.atualizar(db, 'fichas', f.id, { links_ficha: { ...(R.buscar(db, 'fichas', f.id).links_ficha || {}), [pessoa]: guardado } }, login(),
      `Link da ficha de ${FO.nomeDaPessoa(f, pessoa)} gerado (vale até ${dataBr(link.vence_em.slice(0, 10))})`));
    await mostrar();
    await janelaDoLink(buscar('fichas', id), pessoa, guardado);
  },
  /** Traz para a ficha os dados do último envio pelo link (só os preenchidos) e marca os documentos recebidos. */
  async trazerRespostaFicha({ id, pessoa }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário não pode mudar a ficha.');
    const f = buscar('fichas', id);
    const l = (await FO.linksNaNuvem(id)).find((x) => x.pessoa === pessoa);
    const ultimo = l && (l.respostas || []).at(-1);
    if (!f || !ultimo) throw new C.ErroUsuario('Não há dados enviados por este link.');
    const dados = FO.dadosParaFicha(f, l);
    await alterar((db) => {
      const atual = R.buscar(db, 'fichas', f.id);
      const links = { ...(atual.links_ficha || {}) };
      links[pessoa] = { ...(links[pessoa] || {}), trazido_em: ultimo.em };
      R.atualizar(db, 'fichas', f.id, { ...dados, links_ficha: links }, login(), `Dados enviados pelo link por ${FO.nomeDaPessoa(f, pessoa)} trazidos para a ficha`);
    });
    FO.atualizarLinkNaNuvem({ ficha_id: f.id, pessoa, visto: true }).catch(() => {});
    aviso(`Dados de ${FO.nomeDaPessoa(f, pessoa)} trazidos para a ficha. Confira e, se estiver tudo certo, mande a ficha para assinar.`);
    await mostrar();
  },
  /** Marca na nuvem o que falta (a pessoa vê no link) e abre a mensagem para avisar. */
  async pedirDocumentoFicha({ id, pessoa }) {
    const f = buscar('fichas', id);
    const l = f && (await FO.linksNaNuvem(id)).find((x) => x.pessoa === pessoa);
    if (!l) throw new C.ErroUsuario('Gere o link antes.');
    const docs = FO.documentosDoLink(f, l);
    const resp = await janela({
      titulo: `O que falta: ${FO.nomeDaPessoa(f, pessoa)}`, sim: 'Pedir pelo link',
      html: `<p>A pessoa vê a lista no link e manda por lá.</p>${docs.map((t, k) => `<p><label class="check"><input type="checkbox" name="doc" value="${k}"> ${esc(t)}</label></p>`).join('')}
        <p><label>Outro (escreva)</label><textarea name="outro" rows="2"></textarea></p>`,
    });
    if (!resp) return;
    const faltando = [...(resp.doc || []).map((k) => docs[Number(k)]), ...String((resp.outro || [])[0] || '').split(/\n+/).map((x) => x.trim()).filter(Boolean)];
    if (!faltando.length) throw new C.ErroUsuario('Marque ou escreva o que falta.');
    await FO.atualizarLinkNaNuvem({ ficha_id: f.id, pessoa, situacao: 'Falta documento', faltando });
    aviso('Pedido registrado no link.');
    const link = linkValido(f, pessoa);
    if (link) await janelaDoLink(f, pessoa, link, { lembrete: true, faltando });
    await mostrar();
  },
  /** Gera a ficha em PDF com os dados de agora, guarda no link e pede a assinatura (gov.br ou à mão). */
  async mandarAssinarFicha({ id, pessoa }) {
    const f = buscar('fichas', id);
    if (!f) throw new C.ErroUsuario('Ficha não encontrada.');
    const tipo = pessoa === 'interessado' ? 'ficha' : 'ficha_fiador';
    const pdf = await pdfDoRecibo(tipo, { ficha: f, ...(tipo === 'ficha_fiador' ? { fiador: Number(pessoa.slice(6)) } : {}) });
    await FO.guardarPdfNaNuvem(f.id, pessoa, pdf.blob);
    await FO.atualizarLinkNaNuvem({ ficha_id: f.id, pessoa, situacao: 'Assinar', faltando: [] });
    aviso('A ficha com os dados de agora está no link para assinar.');
    const link = linkValido(f, pessoa);
    if (link) await janelaDoLink(f, pessoa, link, { lembrete: true, faltando: ['assinar a ficha (baixe no link, assine pelo gov.br ou à mão e mande por lá)'] });
    await mostrar();
  },
  async lembrarFicha({ id, pessoa }) {
    const f = buscar('fichas', id);
    const l = f && linkValido(f, pessoa);
    if (!l) throw new C.ErroUsuario('O link venceu: gere um novo na página da ficha.');
    await janelaDoLink(f, pessoa, l, { lembrete: true });
  },
  async encerrarLinkFicha({ id, pessoa }) {
    const f = buscar('fichas', id);
    if (!f) throw new C.ErroUsuario('Ficha não encontrada.');
    await FO.atualizarLinkNaNuvem({ ficha_id: f.id, pessoa, situacao: 'Encerrado' });
    await alterar((db) => {
      const links = { ...(R.buscar(db, 'fichas', f.id).links_ficha || {}) };
      if (links[pessoa]) links[pessoa] = { ...links[pessoa], vence_em: new Date().toISOString(), encerrado: true };
      R.atualizar(db, 'fichas', f.id, { links_ficha: links }, login(), `Link da ficha de ${FO.nomeDaPessoa(f, pessoa)} encerrado`);
    });
    aviso('Link encerrado.');
    await mostrar();
  },
  async compartilharLinkFicha({ id, pessoa }) {
    const f = buscar('fichas', id);
    const l = f && linkValido(f, pessoa);
    if (!l) throw new C.ErroUsuario('O link venceu: gere um novo.');
    await janelaDoLink(f, pessoa, l);
  },
  /**
   * Desistência antes de assinar: pergunta a data e o motivo, leva os arquivos do contrato não assinado para a pasta da
   * ficha, grava (ficha "Desistiu", contrato cancelado) e só então apaga os originais.
   */
  async desistirAntesDeAssinar({ ficha, contrato }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário não pode registrar a desistência.');
    const contratos = R.contratosDaDesistencia(d(), { fichaId: ficha ? Number(ficha) : null, contratoId: contrato ? Number(contrato) : null });
    if (contratos.length && !podeUsuario('admin')) throw new C.ErroUsuario('Cancelar um contrato é só do administrador.');
    for (const c of contratos) { const m = R.motivoSemDesistencia(d(), c); if (m) throw new C.ErroUsuario(m); }
    const f = ficha ? buscar('fichas', ficha) : contratos[0] && contratos[0].ficha_id ? buscar('fichas', contratos[0].ficha_id) : null;
    if (!f && !contratos.length) throw new C.ErroUsuario('Ficha não encontrada.');
    const nome = f ? f.inquilino_nome : contratos[0].inquilino_nome;
    const reserva = (contratos.find((c) => c.reserva_valor > 0) || f || {}).reserva_valor || 0;
    const hoje = C.hojeIso();
    const lista = contratos.map((c) => `${esc(c.inquilino_nome)}${c.imovel_id ? ` · ${esc((buscar('imoveis', c.imovel_id) || {}).nome || '')}` : ''}`).join('; ');
    const resp = await janela({
      titulo: `Desistência de ${nome}`, sim: 'Confirmar a desistência', forte: contratos.length > 0,
      html: `<p>O interessado desistiu antes de assinar: nada segue em frente.</p><ul>
        ${contratos.length ? `<li>O contrato não assinado (${lista}) é <b>cancelado</b>: sai do sistema com os boletos ainda não pagos. Os arquivos da pasta do inquilino vão para a pasta da ficha.</li>` : ''}
        <li>A ficha fica <b>"Desistiu"</b>${reserva ? ` e a reserva de <b>${reais(reserva)}</b> fica para <b>devolver por inteiro</b>. Depois de devolver, registre a data e o comprovante em "Editar": sai o termo de devolução e quitação` : ''}.</li>
        <li>Os documentos pessoais são apagados ${R.regra('meses_documentos_ficha')} meses depois.</li></ul>
        <p><label>Data da desistência</label><input type="date" name="data" value="${hoje}" max="${hoje}" required></p>
        <p><label>Motivo (opcional)</label><textarea name="motivo" rows="2"></textarea></p>`,
    });
    if (!resp) return;
    const data = (resp.data || [])[0] || '';
    const motivo = (resp.motivo || [])[0] || '';
    const pasta = f ? f.pasta || nomePastaFicha(f) : nomePastaFicha({ inquilino_nome: nome, data_recebida: contratos[0].reserva_data || data });
    const pedido = { fichaId: f ? f.id : null, contratoId: contratos[0] ? contratos[0].id : null, data, motivo, pasta };
    // confere antes numa cópia (data, bloqueios): os arquivos só são copiados se a gravação vai passar
    R.desistirAntesDeAssinar(structuredClone(d()), pedido, login());
    const copia = contratos.length ? await copiarDocumentosParaFicha(contratos, pasta) : { nomes: [], apagarOriginais: async () => {} };
    let salva = null;
    await alterar((db) => { salva = R.desistirAntesDeAssinar(db, { ...pedido, arquivos: copia.nomes }, login()); });
    await copia.apagarOriginais();
    aviso(`Desistência registrada${contratos.length ? ' e contrato cancelado' : ''}.${reserva ? ` Devolva a reserva de ${reais(reserva)} e registre a devolução na ficha.` : ''}`);
    ir(`#/ficha/${salva.id}`);
  },
  async decidirFicha({ id, situacao }) {
    if (!opera()) throw new Error('Seu usuário não pode decidir fichas.');
    if (situacao !== 'Aprovada') throw new Error('Para reprovar, use "Editar" (com o motivo).');
    const f = buscar('fichas', id);
    if (!f || f.situacao !== 'Em análise') throw new Error('Esta ficha já foi decidida.');
    await alterar((db) => R.atualizar(db, 'fichas', f.id, { situacao: 'Aprovada', decisao_data: C.hojeIso(), decisao_por: login() }, login(), `Ficha de ${f.inquilino_nome} aprovada`));
    aviso('Ficha aprovada. Agora faça o contrato.');
    await mostrar();
  },
};
