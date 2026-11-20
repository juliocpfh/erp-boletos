// Fechamento do mês (#/fechamento) e cadastros incompletos (#/pendencias).
import { podeUsuario } from '../app.js';
import * as C from '../calculos.js';
import { compBr, dataBr } from '../calculos.js';
import * as K from '../contratos.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { alertaAdiado, alertaDesligado, botao, buscar, classeAlerta, d, etiqueta, gruposDeAlertas, link, nomeAlerta, opera } from './comum.js';
import { alertasDaTela } from './comum.js';

// --------------------------------------------------------------------------
// Fechamento do mês e cadastros incompletos
// --------------------------------------------------------------------------
export function telaFechamento(mes) {
  const hoje = C.hojeIso();
  const etapas = R.etapasFechamento(d(), mes, hoje);
  const faltam = etapas.filter((e) => !e.feito && !e.prevista).length;
  return `<div class="cabecalho"><h1>Fechamento de ${compBr(mes)}</h1>
      <div class="acoes">${link(`#/fechamento?mes=${C.somarMeses(mes, -1)}`, `← ${compBr(C.somarMeses(mes, -1))}`, 'botao secundario')}
      ${link(`#/fechamento?mes=${C.somarMeses(mes, 1)}`, `${compBr(C.somarMeses(mes, 1))} →`, 'botao secundario')}</div></div>
    <div class="alerta ${faltam ? 'aviso' : 'ok'}">${faltam ? `${faltam === 1 ? 'Falta' : 'Faltam'} <b>${faltam}</b> de ${C.plural(etapas.length, 'etapa')}.` : etapas.some((e) => e.prevista) ? 'O que já está liberado foi feito; falta o que é previsto para depois.' : 'Fechamento concluído.'} As etapas ficam feitas sozinhas quando não há pendência; dá para marcar à mão quando já resolveu de outro jeito.</div>
    <div class="cartao"><ol class="fechamento">${etapas.map((e) => `<li class="${e.feito ? 'feito' : ''}">
      <div class="cabecalho"><div><b>${esc(e.titulo)}</b> ${e.feito ? etiqueta(e.marcado ? `marcado em ${dataBr(e.marcado.feito_em)}` : 'feito', 'ok') : e.prevista ? etiqueta(String(e.titulo).includes(dataBr(e.aPartirDe)) ? 'previsto' : `previsto a partir de ${dataBr(e.aPartirDe)}`, 'neutra') : etiqueta(C.plural(e.pendentes, 'pendente', 'pendentes'), 'aviso')}
        <div class="suave">${esc(e.detalhe)}</div>
        ${e.chave === 'condominio' && e.contratos && e.contratos.length ? `<div class="acoes" style="margin-top:4px">${e.contratos.map((id) => { const c = buscar('contratos', id); return c ? link(`#/contrato/${id}?ir=ressarcimentos`, `Conferir: ${esc(c.inquilino_nome)}`, 'botao secundario pequeno') : ''; }).join(' ')}</div>` : ''}
        ${e.chave === 'contas' && e.imoveis && e.imoveis.length ? `<div class="acoes" style="margin-top:4px">${e.imoveis.map((id) => link(`#/contas/${id}?comp=${esc(mes)}`, `Lançar: ${esc(buscar('imoveis', id).nome)}`, 'botao secundario pequeno')).join(' ')}</div>` : ''}</div>
        <div class="acoes">${link(e.link, 'Abrir', 'botao pequeno')}
          ${opera() ? (e.marcado ? botao('etapaFechamento', 'Desmarcar', { mes, etapa: e.chave, feito: '' }, 'link-botao') : !e.feito ? botao('etapaFechamento', 'Marcar como feito', { mes, etapa: e.chave, feito: '1' }, 'secundario pequeno') : '') : ''}</div></div></li>`).join('')}</ol>
    <p class="suave">A partir do dia ${R.regra('dia_gerar_boletos')} geram-se os boletos de ${compBr(mes)} (mês de uso), que vencem em ${compBr(C.somarMeses(mes, 1))}; os que vencem em ${compBr(mes)} são os de ${compBr(C.somarMeses(mes, -1))}. As NFs de ${compBr(mes)} se numeram depois da virada do mês, com as avulsas e as do Airbnb já lançadas. No calendário do Painel: dia ${R.regra('dia_gerar_boletos')} (boletos), dia 1º (NFs do mês anterior) e o último dia com o que falta.</p></div>`;
}

/** O que falta nos cadastros para o contrato, a vistoria e a NF saírem completos. */
export function cadastrosIncompletos() {
  const hoje = C.hojeIso();
  const out = [];
  for (const c of d().contratos.filter((x) => x.imovel_id && R.contratoAtivo(x, hoje))) {
    const falta = K.pendenciasDoContrato(d(), c).filter((t) => !t.endsWith('(em Empresas)'));
    if (!c.inquilino_telefone) falta.push('telefone');
    if (!c.inquilino_email) falta.push('e-mail');
    // documentos de entrada: a mesma fonte do alerta "Rotina de entrada" (documentosPendentes)
    for (const x of R.documentosPendentes(d(), c)) {
      falta.push(x.situacao === 'falta' ? { texto: `${x.nome.toLocaleLowerCase('pt-BR')} (não ${x.feito})`, nivel: 'perigo', doc: true }
        : { texto: `${x.nome.toLocaleLowerCase('pt-BR')} (falta assinatura)`, nivel: 'aviso', doc: true });
    }
    // Dados faltando se completam na edição; documentos, na página do inquilino.
    const temDados = falta.some((f) => !f.doc);
    if (falta.length) out.push({ tipo: 'Inquilino', nome: c.inquilino_nome, onde: (buscar('imoveis', c.imovel_id) || {}).nome || '', falta,
      editar: temDados ? `#/editar/contratos/${c.id}` : '', documentos: falta.some((f) => f.doc) ? `#/contrato/${c.id}?ir=documentos` : '', ver: `#/contrato/${c.id}` });
  }
  for (const i of d().imoveis) {
    const falta = [];
    if (!i.cep) falta.push('CEP');
    if (!i.cidade) falta.push('cidade');
    if (!i.chaves && !i.sem_chaves) falta.push('chaves e controles');
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

/**
 * Grupo da lista de pendências: recolhido, com o número de itens no título (o navegador não desenha o que está fechado; no
 * banco grande eram 5.700 elementos abertos de uma vez). Grupo pequeno (até ABERTA_ATE itens) já vem aberto.
 */
const ABERTA_ATE = 5;
const caixaPendencias = (titulo, n, conteudo, aberta) => `<details class="grupo-pendencias"${aberta ? ' open' : ''}><summary><b>${esc(titulo)}</b> <span class="suave">(${n})${aberta ? '' : ' · clique para ver'}</span></summary>${conteudo}</details>`;

/** Central de pendências (D14): alertas em vigor, etapas do fechamento não feitas e cadastros incompletos, numa lista só. */
export function telaPendencias() {
  const hoje = C.hojeIso();
  const mesAtual = C.competenciaDe(hoje);
  const alertas = alertasDaTela(hoje);
  const ativos = alertas.filter((a) => !a.adiamento && !a.desligado);
  const adiados = alertas.filter((a) => a.adiamento && !a.desligado);
  const desligados = R.alertasDesligados(d(), hoje, null, alertas);
  const etapas = [...R.etapasAtrasadas(d(), mesAtual, hoje), ...R.etapasFechamento(d(), mesAtual, hoje).filter((e) => !e.feito && !e.prevista).map((e) => ({ ...e, mes: mesAtual }))];
  const lista = cadastrosIncompletos();
  const grupos = ['Inquilino', 'Imóvel', 'Empresa'].map((t) => [t, lista.filter((x) => x.tipo === t)]).filter(([, l]) => l.length);
  const total = ativos.length + adiados.length + etapas.length + lista.length;
  return `<p class="suave"><a href="#/">← Painel</a></p><h1>Pendências <span class="suave">(${total})</span></h1>
    <p class="suave">Tudo o que espera uma ação, num lugar só: os alertas em vigor, as etapas do fechamento do mês ainda não feitas e os cadastros incompletos.</p>
    <div class="cartao" id="alertas"><h2>Alertas <span class="suave">(${ativos.length}${adiados.length ? ` em vigor, ${adiados.length} adiado(s)` : ''})</span></h2>
      ${gruposDeAlertas(ativos).map(([tipo, l]) => caixaPendencias(tipo, l.length, l.map((a) => `<div class="${classeAlerta(a)}">${nomeAlerta(a)}</div>`).join(''), l.length <= ABERTA_ATE)).join('') || '<p class="suave">Nenhum alerta em vigor.</p>'}
      ${adiados.length ? caixaPendencias('Adiados ou em cuidado', adiados.length, adiados.map((a) => alertaAdiado(a, hoje)).join(''), false) : ''}
      ${desligados.length ? caixaPendencias('Desligados', desligados.length, desligados.map((x) => alertaDesligado(x)).join(''), false) : ''}
      <p class="suave">Para adiar um alerta ou marcar que está cuidando, use os botões dele no Painel ("Já estou cuidando" esconde só hoje: amanhã ele volta). "Desligar" deixa de avisar aquele inquilino ou imóvel até alguém religar.</p></div>
    <div class="cartao" id="fechamento"><h2>Fechamento do mês <span class="suave">(${etapas.length})</span></h2>
      ${etapas.map((e) => `<div class="alerta aviso"><a href="#/fechamento?mes=${e.mes}">${esc(e.titulo.split(/ \(|, a partir/)[0])}</a>${e.mes !== mesAtual ? ` <span class="suave">(de ${compBr(e.mes)})</span>` : ''}${e.pendentes ? ` <span class="suave">· ${e.pendentes} pendente(s)</span>` : ''}</div>`).join('') || `<p class="suave">As etapas liberadas de ${compBr(mesAtual)} estão feitas.</p>`}</div>
    <h2 id="cadastros">Cadastros incompletos <span class="suave">(${lista.length})</span></h2>
    <p class="suave">O que falta para o contrato, a vistoria, os resultados e a NF saírem completos. Inquilinos: só os ativos.</p>
    ${grupos.map(([t, l]) => `<div class="cartao"><h2>${t === 'Imóvel' ? 'Imóveis' : t === 'Empresa' ? 'Empresas' : 'Inquilinos'} (${l.length})</h2><div class="rolagem"><table><tr><th>${t}</th><th>Falta</th><th></th></tr>
      ${l.map((x) => `<tr><td><a href="${x.ver}"><b>${esc(x.nome)}</b></a>${x.onde ? `<br><span class="suave">${esc(x.onde)}</span>` : ''}</td><td>${x.falta.map((f) => (typeof f === 'string' ? etiqueta(f, 'aviso') : etiqueta(f.texto, f.nivel))).join(' ')}</td>
        <td class="n nw">${(t === 'Empresa' ? podeUsuario('admin') : opera()) ? [x.editar && link(x.editar, x.documentos ? 'Completar dados' : 'Completar', 'botao pequeno'),
          x.documentos && link(x.documentos, 'Ver documentos', 'botao secundario pequeno')].filter(Boolean).join(' ') : ''}</td></tr>`).join('')}</table></div></div>`).join('')
    || '<div class="alerta ok">Todos os cadastros estão completos.</div>'}`;
}
