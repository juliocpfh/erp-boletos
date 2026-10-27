// Notas fiscais (#/faturas): lista por número, NF externa, renumeração e NFs avulsas.
import { podeUsuario } from '../app.js';
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao, buscar, d, etiqueta, link, opera } from './comum.js';

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
export const formNfExterna = (tipo, id, data) => `<details class="nf-externa"><summary class="link-botao">Já emitida</summary>
  <form data-form="nfExterna" data-tipo="${tipo}" data-id="${id}" class="acoes"><input type="number" name="numero" min="1" placeholder="nº da NF" style="width:110px">
  <input type="date" name="emissao" value="${data}" title="Data de emissão da NF" style="width:150px"><button class="pequeno">Registrar</button></form></details>`;

export const siglaEmpresa = (e) => (e.aba_modelo || e.nome.split(/\s+/)[0]).toLocaleUpperCase('pt-BR');

export function telaFaturas(mes) {
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
          : (podeUsuario('admin') ? botao('apagarCanceladas', '×', { numero: n }, 'x-excluir', `Apagar a NF cancelada nº ${R.numeroFatura(n)} da lista? Fica só o registro no Histórico.`) : '')}</td></tr>`; }).join('')
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
        <td class="n">${opera() ? `${link(`#/editar/avulsas/${a.id}`, 'Editar')} ${botao('excluir', '×', { tabela: 'avulsas', id: a.id }, 'x-excluir', 'Excluir esta NF avulsa?')}` : ''}</td></tr>`).join('')}</table>` : ''}</div>`;
}
