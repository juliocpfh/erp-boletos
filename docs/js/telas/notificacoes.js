// Notificações AO inquilino (pedido do dono em 2026-11-17): caixa "Notificações" na página do inquilino, a lista de todas
// (#/notificacoes), a nova notificação com o texto pronto (#/notificacao-nova) e a página de cada uma (#/notificacao/ID), com as
// etapas: imprimir o PDF para assinar (gov.br, fora do sistema), anexar a assinada, enviar (e-mail ou à mão), esperar o prazo
// (lembrete), dar baixa, mandar outra notificação do mesmo assunto ou gerar a multa no próximo boleto.
// Regras e gravações: regras.js ("Notificações ao inquilino"); textos e modelos: notificacoes.js.
import { alterar, aviso, confirmar, ir, janela, login, mostrar } from '../app.js';
import * as S from '../armazenamento.js';
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import * as NT from '../notificacoes.js';
import * as R from '../regras.js';
import { linkComprovante, nomeComprovante } from './cadastros.js';
import { ACEITA_DOCUMENTOS, alterarApagandoAnexos, botao, buscar, d, etiqueta, item, link, naoEncontrado, opera, pastaDoEscopo } from './comum.js';
import { atalhosComunicacoes } from './comunicacoes.js';
import { botaoEmail } from './emails.js';

const COR = { Rascunho: 'neutra', 'Aguardando resposta': 'aviso', Reiterada: 'info', 'Multa gerada': 'perigo', Resolvida: 'ok', Cancelada: 'neutra' };
const SO_CONSULTA = 'Seu usuário só consulta: não pode alterar. Peça ao administrador, se precisar.';

/** Etiqueta da situação, com o prazo vencido em vermelho. Ex.: "Aguardando resposta" + "prazo vencido em 02/12/2026". */
export function etiquetaNotificacao(n, hoje = C.hojeIso()) {
  const e = R.estadoNotificacao(d(), n, hoje);
  const prazo = e.podeMulta ? ` ${etiqueta(`prazo vencido em ${dataBr(n.data_limite)}`, 'perigo')}`
    : e.aberta && e.situacao !== 'Reiterada' && !n.multa_valor ? ` ${etiqueta(e.restam === 0 ? 'vence hoje' : `faltam ${e.restam} dia(s) útil(eis)`, e.avisar ? 'aviso' : 'neutra')}` : '';
  return `${etiqueta(e.situacao, COR[e.situacao] || 'neutra')}${prazo}`;
}

/** Ordem das listas: prazo vencido primeiro, depois as que correm (o limite mais perto antes), rascunhos e, por fim, as fechadas. */
function ordemNotificacoes(lista, hoje) {
  const peso = (n) => { const e = R.estadoNotificacao(d(), n, hoje); return e.podeMulta && e.situacao !== 'Reiterada' ? 0 : e.aberta && e.situacao !== 'Reiterada' ? 1 : n.situacao === 'Rascunho' ? 2 : 3; };
  return [...lista].sort((a, b) => peso(a) - peso(b) || (peso(a) < 2 ? String(a.data_limite).localeCompare(String(b.data_limite)) : String(b.data).localeCompare(String(a.data))) || b.id - a.id);
}

/** Caixa da página do inquilino, logo abaixo das solicitações. */
export function caixaNotificacoes(c) {
  const hoje = C.hojeIso();
  const lista = ordemNotificacoes(R.notificacoesDo(d(), c.id), hoje);
  return `<div class="cartao" id="notificacoes"><div class="cabecalho"><h2>Notificações ao inquilino</h2>${opera() ? link(`#/notificacao-nova?contrato=${c.id}`, 'Nova notificação') : ''}</div>
    <p class="suave">Quando o inquilino precisa resolver algo num prazo (ex.: ar-condicionado instalado errado): a notificação com o texto pronto, o PDF para assinar, o envio, o prazo em dias úteis, a baixa e, se não resolver, outra notificação ou a multa no próximo boleto.</p>
    <div class="rolagem"><table><tr><th>Data</th><th>Assunto</th><th>Prazo até</th><th>Situação</th><th></th></tr>
    ${lista.map((n) => `<tr><td class="nw">${dataBr(n.data)}</td><td>${R.numeroDaNotificacao(d(), n) > 1 ? `<b>${R.numeroDaNotificacao(d(), n)}ª</b> ` : ''}${esc(n.assunto)}</td>
      <td class="nw">${dataBr(n.data_limite)}</td><td>${etiquetaNotificacao(n, hoje)}${n.multa_valor > 0 ? `<br><span class="suave">multa de ${reais(n.multa_valor)}</span>` : ''}</td>
      <td class="n nw">${link(`#/notificacao/${n.id}`, 'Abrir')}</td></tr>`).join('')
    || '<tr><td colspan="5" class="suave">Nenhuma notificação.</td></tr>'}</table></div></div>`;
}

/** Tela com todas as notificações (menu Inquilinos): as em aberto primeiro, o prazo vencido em vermelho. */
export function telaNotificacoes(q = {}) {
  const hoje = C.hojeIso();
  const todas = d().notificacoes || [];
  const abertas = q.filtro !== 'todas';
  const lista = ordemNotificacoes(todas.filter((n) => !abertas || ['Rascunho', 'Aguardando resposta', 'Multa gerada'].includes(n.situacao)), hoje);
  const vencidas = todas.filter((n) => { const e = R.estadoNotificacao(d(), n, hoje); return e.podeMulta && e.situacao !== 'Reiterada'; }).length;
  return `${atalhosComunicacoes('notificacoes')}<div class="cabecalho"><h1>Notificações ao inquilino</h1>${opera() ? link('#/notificacao-nova', 'Nova notificação', 'botao') : ''}</div>
    <div class="acoes" style="margin-bottom:12px;flex-wrap:wrap">${link('#/notificacoes', `Em aberto (${todas.filter((n) => ['Rascunho', 'Aguardando resposta', 'Multa gerada'].includes(n.situacao)).length})`, `botao ${abertas ? '' : 'secundario '}pequeno`)}
      ${link('#/notificacoes?filtro=todas', `Todas (${todas.length})`, `botao ${abertas ? 'secundario ' : ''}pequeno`)}
      ${vencidas ? etiqueta(`${vencidas} com prazo vencido`, 'perigo') : ''}</div>
    <div class="cartao"><div class="rolagem"><table><tr><th>Inquilino</th><th>Data</th><th>Assunto</th><th>Prazo até</th><th>Situação</th><th></th></tr>
    ${lista.map((n) => { const c = buscar('contratos', n.contrato_id); const i = c && buscar('imoveis', c.imovel_id);
    return `<tr><td>${c ? `<a href="#/contrato/${c.id}?ir=notificacoes"><b>${esc(c.inquilino_nome)}</b></a>` : '-'}${i ? `<br><span class="suave">${esc(i.nome)}</span>` : ''}</td>
      <td class="nw">${dataBr(n.data)}</td><td>${R.numeroDaNotificacao(d(), n) > 1 ? `<b>${R.numeroDaNotificacao(d(), n)}ª</b> ` : ''}${esc(n.assunto)}</td><td class="nw">${dataBr(n.data_limite)}</td>
      <td>${etiquetaNotificacao(n, hoje)}</td><td class="n nw">${link(`#/notificacao/${n.id}`, 'Abrir')}</td></tr>`; }).join('')
    || `<tr><td colspan="6" class="suave">${abertas ? 'Nenhuma notificação em aberto.' : 'Nenhuma notificação.'}</td></tr>`}</table></div></div>`;
}

/** Inquilinos que podem ser notificados: os ativos (e o da notificação em edição), por nome. */
const inquilinosParaNotificar = (incluir = null) => d().contratos.filter((c) => c.id === incluir || (c.ativo !== false && R.contratoAtivo(c, C.hojeIso())))
  .sort((a, b) => String(a.inquilino_nome).localeCompare(String(b.inquilino_nome), 'pt-BR'));

/** Feriados (em dia de semana) dentro do prazo, para a pessoa entender a data limite. Ex.: 17/11 a 02/12/2026 → ["20/11/2026"]. */
function feriadosNoPrazo(inicio, limite) {
  const out = [];
  for (let x = C.somarDias(inicio, 1); x <= limite; x = C.somarDias(x, 1)) {
    const dia = new Date(`${x}T12:00:00Z`).getUTCDay();
    if (dia !== 0 && dia !== 6 && !C.diaUtil(x)) out.push(dataBr(x));
  }
  return out;
}

/**
 * Nova notificação (ou o rascunho em edição, ?id=): 1º escolhe o inquilino, o assunto, a data e o prazo ("Montar o texto"),
 * depois confere o texto pronto e salva o rascunho. ?anterior=: outra notificação do mesmo assunto (reiteração).
 */
export function telaNovaNotificacao(q = {}) {
  if (!opera()) return `<h1>Nova notificação</h1><div class="alerta aviso">${SO_CONSULTA}</div>`;
  const edicao = q.id ? buscar('notificacoes', q.id) : null;
  if (q.id && (!edicao || edicao.situacao !== 'Rascunho')) return naoEncontrado('Rascunho de notificação não encontrado', '#/notificacoes', 'Ver as notificações');
  const ant = q.anterior ? buscar('notificacoes', q.anterior) : edicao && edicao.anterior_id ? buscar('notificacoes', edicao.anterior_id) : null;
  if (q.anterior && !ant) return naoEncontrado('Notificação anterior não encontrada', '#/notificacoes', 'Ver as notificações');
  const contratoId = Number((edicao && edicao.contrato_id) || (ant && ant.contrato_id) || q.contrato) || null;
  const c = contratoId ? buscar('contratos', contratoId) : null;
  const remontar = !edicao || !!(q.tema || q.data || q.prazo);
  const dados = {
    data: C.dataValida(q.data) || (edicao ? edicao.data : C.hojeIso()),
    prazo_dias: Math.min(90, Math.max(1, Number(q.prazo) || (edicao ? edicao.prazo_dias : R.regra('notificacao_prazo_dias', c)))),
    anterior_id: ant ? ant.id : null,
  };
  const tema = ant ? NT.MODELO_REITERACAO.chave : NT.modeloNotificacao(q.tema) ? q.tema : edicao && NT.modeloNotificacao(edicao.modelo) ? edicao.modelo : NT.MODELOS_NOTIFICACAO[0].chave;
  const pronto = c ? (remontar ? NT.textoDoModelo(d(), c, dados, tema) : { assunto: edicao.assunto, texto: edicao.texto, clausula: edicao.clausula }) : null;
  const limite = R.limiteNotificacao(dados.data, dados.prazo_dias);
  const feriados = feriadosNoPrazo(dados.data, limite);
  const titulo = ant ? `${R.numeroDaNotificacao(d(), ant) + 1}ª notificação sobre o mesmo assunto` : edicao ? 'Rascunho da notificação' : 'Nova notificação ao inquilino';
  const volta = edicao ? `#/notificacao/${edicao.id}` : ant ? `#/notificacao/${ant.id}` : c ? `#/contrato/${c.id}?ir=notificacoes` : '#/notificacoes';
  const opcoesInquilino = inquilinosParaNotificar(contratoId).map((x) => `<option value="${x.id}" ${x.id === contratoId ? 'selected' : ''}>${esc(x.inquilino_nome)} · ${esc((buscar('imoveis', x.imovel_id) || {}).nome || 'sem imóvel')}</option>`).join('');
  return `<p class="suave"><a href="${volta}">← Voltar</a></p><h1>${esc(titulo)}</h1>
    ${ant ? `<div class="alerta info">Reitera a notificação de <b>${dataBr(ant.data)}</b> (${esc(ant.assunto)}), com prazo até ${dataBr(ant.data_limite)}. Ao marcar o envio desta, a anterior fica "Reiterada"; a multa pode ser gerada em qualquer uma já vencida.</div>` : ''}
    <form class="cartao formulario" data-form="ir" data-ir="notificacao-nova">
      <h2>1. Inquilino, assunto e prazo</h2>
      ${edicao ? `<input type="hidden" name="id" value="${edicao.id}">` : ''}${ant && !edicao ? `<input type="hidden" name="anterior" value="${ant.id}">` : ''}
      <div class="grade">
        ${edicao || ant ? `<div><label>Inquilino</label><p><b>${esc(c ? c.inquilino_nome : '-')}</b></p></div>`
    : `<div><label for="nt_contrato">Inquilino</label><select id="nt_contrato" name="contrato"><option value="">Escolha…</option>${opcoesInquilino}</select></div>`}
        ${ant ? '' : `<div><label for="nt_tema">Assunto (modelo do texto)</label><select id="nt_tema" name="tema">${NT.MODELOS_NOTIFICACAO.map((m) => `<option value="${m.chave}" ${m.chave === tema ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></div>`}
        <div><label for="nt_data">Data da notificação</label><input id="nt_data" type="date" name="data" value="${dados.data}"></div>
        <div><label for="nt_prazo">Prazo (dias úteis)</label><input id="nt_prazo" type="number" name="prazo" min="1" max="90" value="${dados.prazo_dias}" style="width:100px"></div>
      </div>
      <p class="suave">Data limite: <b>${dataBr(limite)}</b> (${dados.prazo_dias} dias úteis contados de ${dataBr(dados.data)}, sem sábado, domingo${feriados.length ? ` e o(s) feriado(s) ${feriados.join(', ')}` : ' e feriado'}).</p>
      <div class="acoes"><button class="secundario">${c ? 'Montar o texto de novo' : 'Montar o texto'}</button></div>
      ${edicao ? '<p class="suave">Montar de novo troca o texto pelo do modelo (as mudanças feitas à mão se perdem).</p>' : ''}</form>
    ${c ? `<form class="cartao formulario" data-form="salvarNotificacao">
      <h2>2. Texto da notificação</h2>
      <input type="hidden" name="contrato" value="${c.id}"><input type="hidden" name="tema" value="${esc(tema)}"><input type="hidden" name="data" value="${dados.data}">
      <input type="hidden" name="prazo" value="${dados.prazo_dias}">${edicao ? `<input type="hidden" name="id" value="${edicao.id}">` : ''}${ant ? `<input type="hidden" name="anterior" value="${ant.id}">` : ''}
      <p><label for="nt_assunto">Assunto</label><input id="nt_assunto" name="assunto" value="${esc(pronto.assunto)}" maxlength="120"></p>
      <p><label for="nt_clausula">Cláusula(s) do contrato citada(s)</label><input id="nt_clausula" name="clausula" value="${esc(pronto.clausula || '')}" maxlength="200"></p>
      <div class="alerta aviso"><p><strong>Confira a cláusula no contrato assinado deste inquilino.</strong> O número vem do modelo de contrato de hoje; um contrato antigo pode ter outra numeração. Se for diferente, corrija aqui e no texto.</p>
        <p><label><input type="checkbox" name="clausula_conferida" value="1" required> Conferi o número da(s) cláusula(s) no contrato assinado deste inquilino</label></p></div>
      <p><label for="nt_texto">Texto <span class="suave">(troque o que estiver entre colchetes, "[preencher: …]", pelo caso real)</span></label><textarea id="nt_texto" name="texto" rows="18" spellcheck="true">${esc(pronto.texto)}</textarea></p>
      <div class="acoes"><button>${edicao ? 'Salvar o rascunho' : 'Salvar a notificação (rascunho)'}</button> <a class="botao secundario" href="${volta}">Cancelar</a></div>
      <p class="suave">Depois de salvar: imprima o PDF, assine (gov.br), anexe a assinada e envie. O prazo corre a partir da data da notificação.</p></form>` : '<p class="suave">Escolha o inquilino e clique em "Montar o texto".</p>'}`;
}

/** Etapas da notificação, como no acordo: [{ feito, titulo, detalhe (HTML) }]. */
function etapasDaNotificacao(n, c, hoje) {
  const e = R.estadoNotificacao(d(), n, hoje);
  const alvo = { contrato: c.id, notificacao: n.id };
  const pdf = link(`#/imprimir/recibo?tipo=notificacao&contrato=${c.id}&id=${n.id}`, '🧾 PDF para assinar (imprimir / baixar)', 'botao secundario mini');
  const assinada = linkComprovante(c.id, n.arquivo_assinado || null, { tabela: 'notificacoes', id: n.id, campo: 'arquivo_assinado', tipo: 'notificacao-assinada', data: n.data })
    .replace('📎 comprovante', '📎 notificação assinada').replace('anexar comprovante', 'anexar a assinada').replace('Sem comprovante: buscar no banco e anexar', 'Anexar a notificação assinada');
  const enviada = n.enviada_em ? `enviada em <b>${dataBr(n.enviada_em)}</b> (${esc(n.enviada_por || '')})` : '';
  const marcar = n.situacao === 'Rascunho' && opera() ? `<form data-form="enviadaNotificacao" data-id="${n.id}" class="acoes" style="margin-top:6px;flex-wrap:wrap">
      <input type="date" name="data" value="${hoje}" aria-label="Data do envio" style="width:auto">${F.atalhosData()}
      <select name="meio" aria-label="Por onde" style="width:auto">${R.MEIOS_NOTIFICACAO.map((m) => `<option>${esc(m)}</option>`).join('')}</select>
      <button class="secundario pequeno">Marcar como enviada</button></form>` : '';
  const prazo = n.situacao === 'Rascunho' ? `até ${dataBr(n.data_limite)} (${n.prazo_dias} dias úteis de ${dataBr(n.data)})`
    : e.vencida ? `<b>venceu em ${dataBr(n.data_limite)}</b>` : e.aberta ? `até <b>${dataBr(n.data_limite)}</b> · ${e.restam === 0 ? 'vence hoje' : `faltam ${e.restam} dia(s) útil(eis)`}` : `até ${dataBr(n.data_limite)}`;
  const baixa = n.situacao === 'Resolvida' ? `resolvida em <b>${dataBr(n.resolvida_em)}</b>${n.observacao_baixa ? `: ${esc(n.observacao_baixa)}` : ''} ${n.comprovante_baixa ? linkComprovante(c.id, n.comprovante_baixa, { tabela: 'notificacoes', id: n.id, campo: 'comprovante_baixa', tipo: 'baixa-notificacao', data: n.resolvida_em }) : ''}`
    : e.podeBaixa && opera() ? `<form data-form="baixaNotificacao" data-id="${n.id}" class="acoes" style="margin-top:6px;flex-wrap:wrap">
      <input type="date" name="data" value="${hoje}" aria-label="Resolvido em" style="width:auto">${F.atalhosData()}
      <input name="observacao" placeholder="O que foi feito (ex.: ar-condicionado reinstalado pelo técnico)" style="flex:1;min-width:220px">
      <label class="botao secundario pequeno">📎 Foto ou arquivo<input type="file" name="comprovante" accept="${ACEITA_DOCUMENTOS}" hidden></label>
      <button class="pequeno">Dar baixa (resolvido)</button></form>` : '';
  return [
    { feito: true, titulo: 'Notificação montada', detalhe: `${dataBr(n.data)} · ${esc(n.assunto)} ${pdf}` },
    { feito: !!n.arquivo_assinado, titulo: 'Assinada pelo administrador', detalhe: `${n.arquivo_assinado ? '' : '<span class="suave">assine o PDF no gov.br (assinador.iti.br) e anexe aqui: </span>'}${assinada}` },
    { feito: !!n.enviada_em, titulo: 'Enviada ao inquilino', detalhe: `${enviada}${n.situacao === 'Rascunho' ? `${botaoEmail('notificacao_envio', alvo, '✉ Enviar por e-mail')} <span class="suave">ou entregue à mão (baixe o PDF acima) e marque abaixo. O "Enviar agora" já marca sozinho.</span>${marcar}` : ` ${botaoEmail('notificacao_envio', alvo, '✉ E-mail de novo')}`}` },
    { feito: !e.aberta && n.situacao !== 'Rascunho', titulo: 'Prazo para resolver', detalhe: `${prazo}${e.aberta && !n.multa_valor && n.situacao !== 'Reiterada' ? ` ${botaoEmail('notificacao_lembrete', alvo, '✉ Lembrete do prazo')}` : ''}` },
    { feito: n.situacao === 'Resolvida', titulo: 'Resolvido (baixa)', detalhe: baixa || (n.situacao === 'Cancelada' ? `cancelada em ${dataBr(n.cancelada_em)}${n.motivo_cancelamento ? `: ${esc(n.motivo_cancelamento)}` : ''}` : '<span class="suave">depois de enviada</span>') },
  ];
}

/** Página da notificação: as etapas, a cadeia do mesmo assunto, a multa e o texto. */
export function telaNotificacao(id) {
  const n = buscar('notificacoes', id);
  const c = n && buscar('contratos', n.contrato_id);
  if (!n || !c) return naoEncontrado('Notificação não encontrada', '#/notificacoes', 'Ver as notificações');
  const hoje = C.hojeIso();
  const e = R.estadoNotificacao(d(), n, hoje);
  const cadeia = R.cadeiaDaNotificacao(d(), n);
  const proxima = n.reiterada_por ? buscar('notificacoes', n.reiterada_por) : null;
  const numero = cadeia.length;
  const boleto = n.multa_cobranca_id ? buscar('cobrancas', n.multa_cobranca_id) : null;
  const passos = etapasDaNotificacao(n, c, hoje);
  const sugerida = e.podeMulta ? R.multaSugerida(d(), c, hoje) : 0;
  return `<p class="suave"><a href="#/contrato/${c.id}?ir=notificacoes">← ${esc(c.inquilino_nome)}</a> · <a href="#/notificacoes">Todas as notificações</a></p>
    <div class="cabecalho"><h1>${numero > 1 ? `${numero}ª notificação` : 'Notificação'} · ${esc(c.inquilino_nome)}</h1><div class="acoes">${etiquetaNotificacao(n, hoje)}</div></div>
    ${e.podeMulta && n.situacao !== 'Reiterada' ? `<div class="alerta perigo"><b>Prazo vencido em ${dataBr(n.data_limite)}.</b> Se o inquilino resolveu, dê a baixa; senão, mande outra notificação sobre o mesmo assunto ou gere a multa.</div>` : ''}
    ${proxima ? `<div class="alerta info">${proxima.situacao === 'Rascunho' ? 'Há uma nova notificação sobre o mesmo assunto em preparo' : 'Reiterada pela notificação'} de <a href="#/notificacao/${proxima.id}">${dataBr(proxima.data)}</a> (${esc(proxima.situacao)}).</div>` : ''}
    <div class="cartao"><h2>Etapas</h2><ol style="margin:4px 0 6px 18px">${passos.map((p) => `<li style="margin-bottom:6px">${p.feito ? '✅' : '⬜'} <b>${esc(p.titulo)}</b>: ${p.detalhe}</li>`).join('')}</ol>
      ${opera() ? `<div class="acoes" style="margin-top:10px;flex-wrap:wrap">
        ${n.situacao === 'Rascunho' ? `${link(`#/notificacao-nova?id=${n.id}`, 'Editar o rascunho')} ${botao('excluirNotificacao', 'Excluir o rascunho', { id: n.id }, 'perigo pequeno', 'Excluir este rascunho de notificação?')}` : ''}
        ${e.podeReiterar && n.situacao !== 'Rascunho' ? link(`#/notificacao-nova?anterior=${n.id}`, `Nova notificação sobre o mesmo assunto (${numero + 1}ª)`, 'botao pequeno') : ''}
        ${!['Resolvida', 'Cancelada'].includes(n.situacao) && !(n.multa_valor > 0) && !(proxima && proxima.situacao !== 'Cancelada') ? botao('cancelarNotificacao', 'Cancelar a notificação', { id: n.id }, 'secundario pequeno') : ''}</div>` : ''}</div>
    ${cadeia.length > 1 ? `<div class="cartao"><h2>Notificações deste assunto</h2><table><tr><th></th><th>Data</th><th>Prazo até</th><th>Situação</th></tr>
      ${cadeia.map((x, k) => `<tr><td>${x.id === n.id ? `<b>${k + 1}ª</b>` : `${k + 1}ª`}</td><td>${x.id === n.id ? dataBr(x.data) : `<a href="#/notificacao/${x.id}">${dataBr(x.data)}</a>`}</td><td>${dataBr(x.data_limite)}</td><td>${etiquetaNotificacao(x, hoje)}</td></tr>`).join('')}</table></div>` : ''}
    <div class="cartao" id="multa"><h2>Multa</h2>
      ${n.multa_valor > 0 ? `<p>Multa de <b>${reais(n.multa_valor)}</b> gerada em ${dataBr(n.multa_data)}: ${boleto ? `entra no boleto de <a href="#/cobranca/${boleto.id}"><b>${compBr(boleto.competencia)}</b></a> (vence ${dataBr(boleto.vencimento)}) como "${esc(R.textoMultaNotificacao(n))}", fora da NF.` : 'entra no próximo boleto do aluguel, quando ele for gerado.'}</p>
        ${opera() ? botao('retirarMultaNotificacao', 'Retirar a multa', { id: n.id }, 'perigo pequeno', `Retirar a multa de ${reais(n.multa_valor)}? Ela sai do boleto em aberto.`) : ''}`
    : e.podeMulta && opera() ? `<p class="suave">O prazo venceu. A multa entra no próximo boleto do aluguel como cobrança adicional (não entra na NF). Sugestão: ${R.regra('notificacao_multa_alugueis', n)} aluguel(is) = ${reais(sugerida)}; o contrato prevê até 3 aluguéis. Digite o valor:</p>
        <form data-form="multaNotificacao" data-id="${n.id}" class="acoes"><input name="valor" inputmode="decimal" value="${sugerida ? esc(F.dinheiroTexto(sugerida)) : ''}" aria-label="Valor da multa" style="width:140px"><button class="perigo">Gerar multa</button></form>`
      : `<p class="suave">${n.situacao === 'Resolvida' || n.situacao === 'Cancelada' ? 'Sem multa.' : `A multa só pode ser gerada depois do prazo (${dataBr(n.data_limite)}), com a notificação enviada e sem baixa.`}</p>`}</div>
    <div class="cartao"><h2>Texto</h2><div class="grade">${item('Assunto', esc(n.assunto))}${item('Cláusula(s) citada(s)', esc(n.clausula || '-'))}${item('Prazo', `${n.prazo_dias} dias úteis · até ${dataBr(n.data_limite)}`)}</div>
      <p class="pre">${esc(n.texto)}</p></div>`;
}

/** Valor digitado em reais ("2.000,00", "2000") → centavos. */
const centavosDigitados = (texto) => C.centavos(String(texto || '').replace(/^R\$\s*/, '').trim());

export const FORMULARIOS_NOTIFICACOES = {
  async salvarNotificacao(form) {
    if (!opera()) throw new C.ErroUsuario(SO_CONSULTA);
    const f = new FormData(form);
    if (!f.get('clausula_conferida')) throw new C.ErroUsuario('Marque "Conferi o número da(s) cláusula(s) no contrato assinado deste inquilino" antes de salvar.');
    const dados = { contrato_id: Number(f.get('contrato')), modelo: String(f.get('tema') || ''), data: String(f.get('data') || ''), prazo_dias: Number(f.get('prazo')),
      assunto: f.get('assunto'), clausula: f.get('clausula'), texto: f.get('texto'), anterior_id: Number(f.get('anterior')) || null };
    const id = Number(f.get('id')) || null;
    const n = id ? (await alterarApagandoAnexos((db) => R.editarNotificacao(db, id, dados, login()))) : await alterar((db) => R.criarNotificacao(db, dados, login()));
    aviso(`Notificação salva. Prazo até ${dataBr(R.limiteNotificacao(dados.data, dados.prazo_dias))}. Agora imprima o PDF, assine e envie.`);
    ir(`#/notificacao/${n.id}`);
  },

  async enviadaNotificacao(form) {
    if (!opera()) throw new C.ErroUsuario(SO_CONSULTA);
    const f = new FormData(form);
    const n = buscar('notificacoes', form.dataset.id);
    if (n && !n.arquivo_assinado && !(await confirmar('A notificação assinada ainda não foi anexada. Marcar como enviada mesmo assim? (ex.: entregue em papel assinado à mão)', { titulo: 'Marcar como enviada?', sim: 'Marcar como enviada' }))) return;
    await alterar((db) => R.marcarNotificacaoEnviada(db, Number(form.dataset.id), { data: String(f.get('data') || ''), meio: String(f.get('meio') || '') }, login()));
    aviso('Envio marcado: o prazo está correndo.');
    await mostrar();
  },

  async baixaNotificacao(form) {
    if (!opera()) throw new C.ErroUsuario(SO_CONSULTA);
    const f = new FormData(form);
    const n = buscar('notificacoes', form.dataset.id);
    if (!n) throw new C.ErroUsuario('Esta notificação não existe mais. Atualize a página.');
    const data = String(f.get('data') || '');
    if (!C.dataValida(data)) throw new C.ErroUsuario('Informe a data em que foi resolvido.');
    const arq = f.get('comprovante');
    const comprovante = arq && arq.size ? await S.salvarArquivo(await pastaDoEscopo('contrato', n.contrato_id), new File([arq], nomeComprovante('baixa-notificacao', data, arq))) : null;
    await alterar((db) => R.darBaixaNotificacao(db, n.id, { data, comprovante, observacao: f.get('observacao') }, login()));
    aviso('Baixa registrada: notificação resolvida.');
    await mostrar();
  },

  async multaNotificacao(form) {
    if (!opera()) throw new C.ErroUsuario(SO_CONSULTA);
    const valor = centavosDigitados(new FormData(form).get('valor'));
    if (!(valor > 0)) throw new C.ErroUsuario('Digite o valor da multa.');
    const p = R.previaMultaNotificacao(d(), Number(form.dataset.id));
    const cb = p.boleto;
    const antes = cb ? R.totais(cb).a_pagar_sem_desconto : 0;
    const html = `<p>Multa de <b>${reais(valor)}</b> para <b>${esc(p.contrato.inquilino_nome)}</b>, pela notificação de ${dataBr(p.notificacao.data)} (prazo até ${dataBr(p.notificacao.data_limite)}).</p>
      ${cb ? `<p>Entra no boleto do aluguel de <b>${compBr(cb.competencia)}</b>, que vence em <b>${dataBr(cb.vencimento)}</b>, como "${esc(R.textoMultaNotificacao(p.notificacao))}". O boleto passa de ${reais(antes)} para <b>${reais(antes + valor)}</b> (valor cheio; a bonificação não desconta a multa).</p>`
    : '<p>Ainda não há boleto do aluguel em aberto para receber: a multa entra no próximo, quando ele for gerado.</p>'}
      <p class="suave">A multa não entra na NF (não é aluguel). Para tirar depois: "Retirar a multa" na notificação, enquanto o boleto não for pago nem emitido no banco.</p>`;
    if (!(await janela({ titulo: 'Gerar a multa?', html, sim: 'Gerar a multa', forte: true }))) return;
    const r = await alterar((db) => R.gerarMultaNotificacao(db, Number(form.dataset.id), valor, login()));
    aviso(r.boleto ? `Multa de ${reais(valor)} lançada no boleto de ${compBr(r.boleto.competencia)}.` : `Multa de ${reais(valor)} gerada: entra no próximo boleto, quando ele for gerado.`);
    await mostrar();
  },
};

export const ACOES_NOTIFICACOES = {
  async excluirNotificacao({ id }) {
    if (!opera()) throw new C.ErroUsuario(SO_CONSULTA);
    const n = buscar('notificacoes', id);
    await alterarApagandoAnexos((db) => R.excluirNotificacao(db, Number(id), login()));
    ir(n ? `#/contrato/${n.contrato_id}?ir=notificacoes` : '#/notificacoes');
  },
  async cancelarNotificacao({ id }) {
    if (!opera()) throw new C.ErroUsuario(SO_CONSULTA);
    const r = await janela({ titulo: 'Cancelar a notificação?', sim: 'Cancelar a notificação', nao: 'Voltar', forte: true,
      html: '<p>A notificação fica no histórico como "Cancelada" (ex.: feita por engano). O prazo para de correr e o alerta some.</p><p><label>Motivo</label><input name="motivo" placeholder="Ex.: o inquilino mostrou a autorização"></p>' });
    if (!r) return;
    await alterar((db) => R.cancelarNotificacao(db, Number(id), (r.motivo || [''])[0], login()));
    aviso('Notificação cancelada.');
    await mostrar();
  },
  async retirarMultaNotificacao({ id }) {
    if (!opera()) throw new C.ErroUsuario(SO_CONSULTA);
    await alterar((db) => R.retirarMultaNotificacao(db, Number(id), login()));
    aviso('Multa retirada do boleto e da notificação.');
    await mostrar();
  },
};
