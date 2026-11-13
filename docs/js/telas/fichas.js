// Fichas em análise: pré-cadastro do interessado (dados, reserva e documentos), aprovar ou reprovar e, aprovada, o contrato (#/ficha/ID, caixa em Inquilinos e alerta no Painel).
import { alterar, aviso, ir, janela, login, mostrar, podeUsuario } from '../app.js';
import * as C from '../calculos.js';
import { dataBr, reais } from '../calculos.js';
import { esc, pctTexto } from '../formularios.js';
import * as REC from '../recibos.js';
import * as R from '../regras.js';
import { botaoEmail } from './emails.js';
import { botao, buscar, caixaArquivos, copiarDocumentosParaFicha, d, etiqueta, item as itemGrade, link, naoEncontrado, nomePastaFicha, opera } from './comum.js';

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
  if (!p.length) return '';
  const devolver = p.some((x) => /devolução/.test(x.texto));
  return `<div class="alerta ${devolver ? 'aviso' : 'info'}"><b>Fichas em análise:</b> ${p.map((x) => `<a href="#/ficha/${x.ficha.id}">${esc(x.texto)}</a>`).join('; ')}.</div>`;
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
    <div class="cartao"><h2>Imóveis de interesse</h2>
      <p>${(f.imoveis_ids || []).length > 1 ? `A ficha é para <b>${esc(f.modo_imoveis === 'Todos juntos' ? 'todos juntos' : 'apenas um dos imóveis')}</b>.` : ''}</p>
      <ul>${contratos || '<li class="suave">Nenhum imóvel marcado.</li>'}</ul>
      ${f.situacao === 'Aprovada' && paraFazer.length ? `<p class="suave">${primeiro ? 'O contrato abre com os dados da pessoa já preenchidos (a reserva e os documentos ficaram no primeiro contrato).' : 'O contrato abre com os dados da pessoa e a reserva já preenchidos. Ao salvar, os documentos da ficha vão para a pasta do inquilino.'}</p>` : ''}</div>
    <div class="cartao"><h2>${esc(pj ? 'Empresa' : 'Interessado')}</h2><div class="grade">${pessoa || '<p class="suave">Só o nome foi preenchido.</p>'}</div></div>
    <div class="cartao"><h2>Proposta</h2>${proposta ? `<div class="grade">${proposta}</div>` : '<p class="suave">Aluguel, vencimento, bonificação, garantia e o que está incluso ainda não preenchidos (em "Editar"). Eles vão no e-mail da ficha, no recibo da reserva e preenchidos para o contrato.</p>'}</div>
    <div class="cartao"><h2>Reserva</h2>${f.reserva_valor > 0 ? `<p>${reais(f.reserva_valor)}${f.reserva_data ? ` em ${dataBr(f.reserva_data)}` : ''} ${f.comprovante_reserva ? abrir(f.comprovante_reserva, 'comprovante') : primeiro ? '<span class="suave">(o comprovante foi para a pasta do inquilino)</span>' : etiqueta('sem comprovante', 'aviso')}
      ${REC.reciboDisponivel(d(), 'reserva', { ficha: f }).ok ? ` · ${link(`#/imprimir/recibo?tipo=reserva&ficha=${f.id}`, '🧾 Recibo da reserva', '')}` : ''}</p>
      <p class="suave">O recibo e o comprovante vão anexos no e-mail de envio da ficha cadastral, com as condições propostas.</p>` : '<p class="suave">Sem reserva.</p>'}</div>
    <div class="cartao"><h2>Documentos</h2>
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

/** Botão "Aprovar" da página da ficha (operador ou administrador). */
export const ACOES_FICHAS = {
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
