// Página do imóvel (#/imovel/ID): empresas e percentuais, IPTU, reformas, leituras e documentos do imóvel (o seguro fica no inquilino).
import { podeUsuario } from '../app.js';
import * as C from '../calculos.js';
import { compBr, dataBr, pct, reais } from '../calculos.js';
import * as K from '../contratos.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao, buscar, caixaArquivos, caixaHistorico, d, endereco, etiqueta, idGuiasDoAno, item, link, nomePastaContrato, opera, tabelaHistorico, ultimos } from './comum.js';
import { AVISO_CONTROLE, caixaLeituras, caixaVerificar, seloControle } from './contrato.js';

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
      ${caixaArquivos('iptuano', idGuiasDoAno(i.id, p.ano), `Guias do IPTU ${p.ano}`, `guias-iptu-${p.ano}`, atual ? 'Para anexar a guia, use o clipe ao lado do imóvel na página IPTU (botão "IPTU\'s" em Imóveis).' : '', true, false)}`;
  const [atual, ...anteriores] = iptus;
  return `<div class="cartao" id="iptu"><div class="cabecalho"><h2>IPTU</h2>${opera() ? link(`#/novo/iptus?imovel=${i.id}`, 'Lançar IPTU do ano') : ''}</div>
    <p class="suave">Você paga todas as guias na prefeitura; o inquilino devolve a parte dele no boleto. No mês de entrada e no de saída, o inquilino paga os dias em que ocupou e você paga o resto. Imóvel vazio (ou contrato sem IPTU): a parcela é toda sua e aparece nos alertas 15 dias antes do vencimento, até ser marcada como paga.</p>
    ${atual ? `${ano(atual, true)}${i.guias_iptu_por_ano ? '' : caixaArquivos('iptu', i.id, `Guias já anexadas (vão para o histórico de ${atual.ano} quando o próximo IPTU for lançado)`, 'guias-iptu', '', true, false)}` : `<p class="suave">Nenhum IPTU lançado.</p>${caixaArquivos('iptuano', idGuiasDoAno(i.id, Number(C.hojeIso().slice(0, 4))), `Guias do IPTU ${C.hojeIso().slice(0, 4)}`, 'guias-iptu', 'Para anexar a guia, use o clipe ao lado do imóvel na página IPTU.', true, false)}${i.guias_iptu_por_ano ? '' : caixaArquivos('iptu', i.id, 'Guias anteriores', 'guias-iptu-anteriores', '', true, false)}`}
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

export function telaImovel(i) {
  const hoje = C.hojeIso();
  const contratos = d().contratos.filter((c) => c.imovel_id === i.id).sort((a, b) => b.data_entrada.localeCompare(a.data_entrada));
  const tits = d().titularidades.filter((t) => t.imovel_id === i.id).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const lembretes = contratos.map((c) => R.alertaTitularidade(d(), c, hoje)).filter(Boolean);
  return `<div class="cabecalho"><h1>${esc(i.nome)}${i.sublote ? ` <span class="suave">· ${esc(i.sublote)}</span>` : ''}</h1><div class="acoes">
      ${opera() ? `${link(`#/novo/contratos?imovel=${i.id}`, 'Novo contrato', 'botao')} ${link(`#/editar/imoveis/${i.id}`, 'Editar imóvel', 'botao secundario')}` : ''}
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
      ${item('Pasta de arquivos', esc(i.pasta || '-'))}${item('Modelo de vistoria', `${K.lerModeloVistoria(i.modelo_vistoria).length ? `${K.lerModeloVistoria(i.modelo_vistoria).length} cômodo(s)` : '<span class="suave">não montado</span>'} ${opera() ? link(`#/modelo-vistoria/${i.id}`, i.modelo_vistoria ? 'Editar' : 'Montar') : ''}`)}${item('Chaves e controles', i.sem_chaves ? 'não se aplica' : i.chaves ? esc(i.chaves).replace(/\n/g, '<br>') : '<span class="suave">não informado (use Editar)</span>')}</div>
      ${i.observacoes ? `<p class="pre">${esc(i.observacoes)}</p>` : ''}</div>
    <div class="cartao"><h2>Inquilinos deste imóvel</h2><div class="rolagem"><table>
      <tr><th>Ativo</th><th>Inquilino</th><th>Entrada</th><th>Saída</th><th class="n">Aluguel atual</th><th>Situação</th><th>NF ou controle</th></tr>
      ${contratos.map((c) => `<tr class="${c.verificar ? 'amarelo' : ''}"><td class="centro">${c.ativo !== false ? '✓' : '<span class="suave">não</span>'}</td>
        <td><a href="#/contrato/${c.id}"><b>${esc(c.inquilino_nome)}</b></a>${c.inquilino_apelido ? ` <span class="suave">(${esc(c.inquilino_apelido)})</span>` : ''}<br><span class="suave">📁 ${esc(c.pasta || nomePastaContrato(c))}</span></td>
        <td>${dataBr(c.data_entrada)}</td><td>${dataBr(c.data_saida)}</td><td class="n">${reais(R.aluguelAtual(d(), c))}</td>
        <td>${R.contratoAtivo(c, hoje) ? etiqueta('Atual', 'ok') : etiqueta('Encerrado', 'neutra')} ${c.prazo_tipo === 'Indeterminado' ? etiqueta('Indeterminado', 'aviso') : ''}</td>
        <td><label class="check-mini" title="Desmarcado: boleto de controle (não gera NF nem entra nas somas e nos resultados)"><input type="checkbox" data-acao="alternarNf" data-id="${c.id}" ${R.geraNf(c) ? 'checked' : ''} ${opera() ? '' : 'disabled'}> emite NF</label>
          ${R.geraNf(c) ? '' : `<br>${seloControle()}`}</td></tr>`).join('') || '<tr><td colspan="7" class="suave">Nenhum inquilino cadastrado.</td></tr>'}
    </table></div><p class="suave">O inquilino deixa de ser ativo (e de gerar boleto) pela saída, na página dele. Desmarque "emite NF" para boleto de controle: o pagamento é acompanhado, mas não gera NF nem entra nas somas dos boletos e nos resultados.</p></div>
    ${caixaIptu(i)}
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
    ${caixaArquivos('imovel', i.id, 'Matrículas', 'documentos', 'Arquivos da pasta "Matrículas" do imóvel (só para ver e baixar). A matrícula é anexada e excluída na lista de Imóveis, na coluna Matrícula.', false, false)}
    ${caixaHistorico('Histórico do imóvel', tabelaHistorico(ultimos((h) => h.imovel_id === i.id)))}`;
}
