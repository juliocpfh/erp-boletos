// Fechamento do mês (#/fechamento) e cadastros incompletos (#/pendencias).
import { podeUsuario } from '../app.js';
import * as C from '../calculos.js';
import { compBr, dataBr } from '../calculos.js';
import * as K from '../contratos.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao, buscar, d, etiqueta, link, opera } from './comum.js';

// --------------------------------------------------------------------------
// Fechamento do mês e cadastros incompletos
// --------------------------------------------------------------------------
export function telaFechamento(mes) {
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
export function cadastrosIncompletos() {
  const hoje = C.hojeIso();
  const out = [];
  for (const c of d().contratos.filter((x) => x.imovel_id && R.contratoAtivo(x, hoje))) {
    const falta = K.pendenciasDoContrato(d(), c).filter((t) => !t.endsWith('(em Empresas)'));
    if (!c.inquilino_telefone) falta.push('telefone');
    if (!c.inquilino_email) falta.push('e-mail');
    for (const [k, nome, feito] of R.DOCUMENTOS_ENTRADA) {
      if (R.documentoFalta(d(), c, k)) falta.push({ texto: `${nome.toLocaleLowerCase('pt-BR')} (não ${feito})`, nivel: 'perigo', doc: true });
      else if (R.documentoParcial(d(), c, k)) falta.push({ texto: `${nome.toLocaleLowerCase('pt-BR')} (falta assinatura)`, nivel: 'aviso', doc: true });
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

export function telaPendencias() {
  const lista = cadastrosIncompletos();
  const grupos = ['Inquilino', 'Imóvel', 'Empresa'].map((t) => [t, lista.filter((x) => x.tipo === t)]).filter(([, l]) => l.length);
  return `<p class="suave"><a href="#/">← Painel</a></p><h1>Cadastros incompletos</h1>
    <p class="suave">O que falta para o contrato, a vistoria, os resultados e a NF saírem completos. Inquilinos: só os ativos.</p>
    ${grupos.map(([t, l]) => `<div class="cartao"><h2>${t === 'Imóvel' ? 'Imóveis' : t === 'Empresa' ? 'Empresas' : 'Inquilinos'} (${l.length})</h2><div class="rolagem"><table><tr><th>${t}</th><th>Falta</th><th></th></tr>
      ${l.map((x) => `<tr><td><a href="${x.ver}"><b>${esc(x.nome)}</b></a>${x.onde ? `<br><span class="suave">${esc(x.onde)}</span>` : ''}</td><td>${x.falta.map((f) => (typeof f === 'string' ? etiqueta(f, 'aviso') : etiqueta(f.texto, f.nivel))).join(' ')}</td>
        <td class="n nw">${opera() || (t === 'Empresa' && podeUsuario('admin')) ? [x.editar && link(x.editar, x.documentos ? 'Completar dados' : 'Completar', 'botao pequeno'),
          x.documentos && link(x.documentos, 'Ver documentos', 'botao secundario pequeno')].filter(Boolean).join(' ') : ''}</td></tr>`).join('')}</table></div></div>`).join('')
    || '<div class="alerta ok">Todos os cadastros estão completos.</div>'}`;
}
