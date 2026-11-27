// Ressarcimentos de condomínio (#/ressarcimentos, pedido do dono de 27/11/2026): aba de Inquilinos com as taxas do proprietário
// pagas pelo inquilino no boleto do condomínio, por condomínio (o prédio: imóveis com o mesmo endereço) e por inquilino, para
// conferir e lançar sem abrir a página de cada inquilino. A etapa do condomínio do Fechamento do mês abre aqui (?mes=AAAA-MM).
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao, buscar, d, etiqueta, link, opera } from './comum.js';
import { abasInquilinos } from './comunicacoes.js';

/** Endereço do prédio (sem o complemento): imóveis com o mesmo endereço são o mesmo condomínio. Ex.: "Rua Prof. Nilo Brandão, 117". */
const chaveDoPredio = (i) => String((i && i.endereco) || (i && i.nome) || 'Sem imóvel').trim().replace(/\s+/g, ' ');

/** Situação de um ressarcimento no boleto do aluguel (a mesma da página do inquilino). */
function situacaoNoBoleto(c, x) {
  const cb = R.boletoDoMes(d(), c.id, x.competencia_abatimento);
  if (!R.ressarcimentoConfirmado(x)) return etiqueta(cb && (cb.data_pagamento || R.emAcordo(cb)) ? 'saiu sem o desconto' : 'entra com a data do pagamento', 'aviso');
  if (!cb) return etiqueta('sem boleto no mês: crédito', 'info');
  return cb.data_pagamento ? etiqueta('abatido', 'ok') : R.emAcordo(cb) ? etiqueta('em acordo: não abatido', 'aviso') : etiqueta('no boleto em aberto', 'info');
}

/**
 * Linhas da tela para o condomínio de ``mes``: cada inquilino ativo que paga o condomínio (e quem tem ressarcimento lançado no
 * mês), com o que foi lançado e se o mês já foi conferido. Ex.: condomínio de 11/2026, Ana com fundo de obras de R$ 150,00 →
 * { conferido: true, lancados: [fundo de obras] }.
 */
export function linhasDoMes(mes, hoje = C.hojeIso()) {
  const doMes = (d().ressarcimentos || []).filter((x) => x.competencia_condominio === mes);
  const ids = new Set(doMes.map((x) => x.contrato_id));
  return d().contratos.filter((c) => c.imovel_id && ((R.inquilinoPagaCondominio(c) && R.contratoAtivo(c, hoje)) || ids.has(c.id)))
    .map((c) => {
      const i = buscar('imoveis', c.imovel_id);
      const lancados = doMes.filter((x) => x.contrato_id === c.id);
      const antesDaEntrada = mes < C.competenciaDe(c.data_entrada || hoje);
      const conferido = lancados.length > 0 || antesDaEntrada || (!!c.condominio_conferido_ate && c.condominio_conferido_ate >= mes);
      return { c, i, predio: chaveDoPredio(i), lancados, conferido, antesDaEntrada };
    })
    .sort((a, b) => a.predio.localeCompare(b.predio, 'pt-BR') || String(a.i ? a.i.nome : '').localeCompare(String(b.i ? b.i.nome : ''), 'pt-BR'));
}

export function telaRessarcimentos(q) {
  const hoje = C.hojeIso();
  // padrão: o condomínio do mês que acabou (o inquilino já pagou), o mesmo do alerta "Condomínio"
  const mes = C.competenciaValida(q.mes) ? q.mes : C.somarMeses(C.competenciaDe(hoje), -1);
  const porInquilino = q.ver === 'inquilino';
  const linhas = linhasDoMes(mes, hoje);
  const aConferir = linhas.filter((x) => !x.conferido).length;
  const total = linhas.reduce((t, x) => t + x.lancados.reduce((s, r) => s + r.valor, 0), 0);
  const aqui = (extra = {}) => `#/ressarcimentos?${new URLSearchParams({ mes, ...(porInquilino ? { ver: 'inquilino' } : {}), ...extra })}`;
  const lancar = (c) => link(`#/novo/ressarcimentos?contrato=${c.id}&de=ressarcimentos&mes=${mes}`, 'Lançar taxa', 'botao pequeno');
  const conferir = (x) => (!x.conferido && opera() ? botao('condominioConferido', 'Conferido: sem taxa', { id: x.c.id, mes }, 'secundario pequeno') : '');
  const situacao = (x) => (x.antesDaEntrada ? etiqueta('antes da entrada', 'neutra') : x.lancados.length ? etiqueta(`${C.plural(x.lancados.length, 'taxa lançada', 'taxas lançadas')}`, 'ok')
    : x.conferido ? etiqueta('conferido: sem taxa', 'ok') : etiqueta('a conferir', 'aviso'));
  const taxas = (x) => x.lancados.map((r) => `<div>${esc(r.descricao)} <b>${reais(r.valor)}</b> · ${r.data_pagamento ? `pago ${dataBr(r.data_pagamento)}` : etiqueta('falta o comprovante', 'aviso')}
    · boleto ${compBr(r.competencia_abatimento)} ${situacaoNoBoleto(x.c, r)}${opera() ? ` ${link(`#/editar/ressarcimentos/${r.id}?de=ressarcimentos&mes=${mes}`, 'Editar', '')}` : ''}</div>`).join('');
  const linhaInquilino = (x, comImovel) => `<tr class="${x.conferido ? '' : 'amarelo'}"><td>${comImovel ? `${esc(x.i ? x.i.nome : '')}<br>` : ''}<a href="#/contrato/${x.c.id}?ir=ressarcimentos"><b>${esc(x.c.inquilino_nome)}</b></a></td>
    <td>${situacao(x)}${x.c.condominio_conferido_ate ? `<br><span class="suave">conferido até ${compBr(x.c.condominio_conferido_ate)}</span>` : ''}</td><td>${taxas(x) || '<span class="suave">-</span>'}</td>
    <td class="n nw">${opera() && !x.antesDaEntrada ? `${lancar(x.c)} ${conferir(x)}` : ''}</td></tr>`;
  const cabeca = (primeira) => `<tr><th>${primeira}</th><th>Condomínio de ${compBr(mes)}</th><th>Taxas do proprietário lançadas</th><th></th></tr>`;

  let corpo;
  if (porInquilino) {
    corpo = `<div class="cartao rolagem"><table>${cabeca('Imóvel / inquilino')}${[...linhas].sort((a, b) => a.c.inquilino_nome.localeCompare(b.c.inquilino_nome, 'pt-BR')).map((x) => linhaInquilino(x, true)).join('')}</table></div>`;
  } else {
    const predios = new Map();
    for (const x of linhas) predios.set(x.predio, [...(predios.get(x.predio) || []), x]);
    corpo = [...predios].map(([predio, ls]) => {
      const adm = [...new Set(ls.map((x) => x.i && x.i.administradora_nome).filter(Boolean))].join(', ');
      const falta = ls.filter((x) => !x.conferido).length;
      return `<div class="cartao rolagem"><div class="cabecalho"><h2>${esc(predio)}</h2>${falta ? etiqueta(`${falta} a conferir`, 'aviso') : etiqueta('conferido', 'ok')}</div>
        ${adm ? `<p class="suave">Administradora do condomínio: ${esc(adm)}</p>` : ''}
        <table>${cabeca('Imóvel / inquilino')}${ls.map((x) => linhaInquilino(x, true)).join('')}</table></div>`;
    }).join('');
  }
  return `<div class="cabecalho"><h1>Ressarcimentos do condomínio</h1>
      <div class="acoes">${link(aqui({ mes: C.somarMeses(mes, -1) }), `← ${compBr(C.somarMeses(mes, -1))}`, 'botao secundario')} ${link(aqui({ mes: C.somarMeses(mes, 1) }), `${compBr(C.somarMeses(mes, 1))} →`, 'botao secundario')}</div></div>
    ${abasInquilinos('ressarcimentos')}
    <p class="suave">Taxas do proprietário (fundo de obras, fundo de reserva, chamadas extras de obra…) que o inquilino pagou no boleto do condomínio de ${compBr(mes)}: lance aqui e o valor é abatido no boleto do aluguel do mês seguinte ao pagamento (Lei 8.245/91, art. 22, X). Sem taxa no mês, marque "Conferido".</p>
    <nav class="abas">${link(`#/ressarcimentos?mes=${mes}`, 'Por condomínio', porInquilino ? '' : 'ativo')}${link(`#/ressarcimentos?mes=${mes}&ver=inquilino`, 'Por inquilino', porInquilino ? 'ativo' : '')}</nav>
    <div class="alerta ${aConferir ? 'aviso' : 'ok'}">${linhas.length ? `${aConferir ? `<b>${C.plural(aConferir, 'inquilino', 'inquilinos')} a conferir</b> no condomínio de ${compBr(mes)}.` : `Condomínio de ${compBr(mes)} conferido.`}${total ? ` Lançado no mês: ${reais(total)}.` : ''}` : 'Nenhum inquilino paga o condomínio.'}</div>
    ${corpo}`;
}
