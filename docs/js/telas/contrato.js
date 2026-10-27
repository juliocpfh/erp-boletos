// Página do inquilino/contrato (#/contrato/ID): selos, garantia, saída, leituras, ressarcimentos, solicitações, boletos,
// documentos de entrada e termos aditivos.
import { janela, podeUsuario } from '../app.js';
import * as C from '../calculos.js';
import { compBr, dataBr, pct, reais } from '../calculos.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { caixaReservaAbatida, linkComprovante, xAnexo } from './cadastros.js';
import { botao, buscar, caixaArquivos, caixaHistorico, classeAlerta, d, endereco, etiqueta, item, link, nomePastaContrato, opera, situacao, tabelaHistorico, ultimos } from './comum.js';

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
export const inicialBonificado = (c, inicial = c.aluguel_inicial, pctB = R.percentualBonificacao(c)) => inicial - C.descontoPorPercentual(inicial, pctB);

/** Aluguel atual com a bonificação de pontualidade (o que o inquilino paga em dia, sem IPTU e seguro). */
export function valorBonificado(c) {
  const aluguel = R.aluguelAtual(d(), c);
  return aluguel - C.descontoPorPercentual(aluguel, R.percentualBonificacao(c));
}

/**
 * Valores do contrato inicial (aluguel cheio e bonificado): mudar depois de salvo pede duas confirmações.
 * O aluguel em vigor muda por "Registrar correção" ou "Renovação / novo valor". Devolve true para seguir.
 */
export async function confirmarValoresIniciais(dados, r) {
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
export const seloControle = () => etiqueta('Boleto de controle · sem NF · fora dos resultados', 'controle');

export const AVISO_CONTROLE = 'não emite NF. O pagamento é acompanhado (em dia ou atrasado), mas não gera NF e não conta nas somas dos boletos nem nos resultados financeiros.';

export const caixaVerificar = (texto) => (texto ? `<div class="verificar"><b>A verificar:</b> ${esc(texto).replace(/\n/g, '<br>')}</div>` : '');

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
  // "Excluir" apaga o lançamento inteiro (com o arquivo); o "×" ao lado do 📎 apaga só o arquivo; "Editar" muda os dados
  const excluir = (tabela, id, pergunta) => (opera() ? botao('excluir', '×', { tabela, id }, 'x-excluir', pergunta) : '');
  const editar = (hash) => (opera() ? link(hash, 'Editar', 'botao secundario mini') : '');
  // caução e depósito: registro em depósitos (data, valor, comprovante opcional) até completar o valor do contrato
  const formDeposito = (qual, falta) => (opera() ? `<form data-form="garantiaPaga" class="acoes linha-deposito"><input type="hidden" name="contrato" value="${c.id}"><input type="hidden" name="qual" value="${qual}">
      <input type="date" name="data" value="${esc(C.hojeIso())}" title="Data do depósito">
      <input name="valor" value="${esc(C.reais(falta, false))}" title="Valor depositado (R$)" class="valor">
      <label class="botao secundario mini enviar" title="Comprovante (PDF ou foto); pode anexar depois"><span data-nome-escolhido>📎 comprovante</span><input type="file" name="arquivo" accept="application/pdf,image/*" data-arquivo-doc></label>
      <button class="mini">Registrar depósito</button></form>` : '');
  const anexoDeposito = (qual, x) => ({ tabela: 'depositos_garantia', id: x.id, campo: 'comprovante', tipo: qual === 'caucao' ? 'caucao' : 'deposito-garantia', data: x.data });
  /** Depósitos numa tabela curta: data, valor, comprovante (com ×), Editar e Excluir (só onde pode excluir). */
  const tabelaDepositos = (qual, lista, podeExcluir) => (lista.length ? `<table class="compacta">${lista.map((x) => `<tr><td class="nw">${dataBr(x.data)}${x.complementar ? ' <span class="suave">complemento</span>' : ''}</td>
      <td class="n">${reais(x.valor)}</td><td>${linkComprovante(c.id, x.comprovante, anexoDeposito(qual, x))}</td>
      <td class="n nw">${editar(`#/editar/depositos_garantia/${x.id}`)} ${podeExcluir(x) ? excluir('depositos_garantia', x.id, `Excluir o depósito de ${reais(x.valor)} de ${dataBr(x.data)}? O comprovante também é apagado.`) : ''}</td></tr>`).join('')}</table>` : '');
  const registrar = (qual, nome, prevista) => {
    const s = R.garantiaADepositar(d(), c, qual);
    return `<div class="alerta aviso"><b>Incluir ${nome}:</b> ${reais(s.combinado)} (prevista ${dataBr(prevista)}) · depositado ${reais(s.depositado)} · <b>falta ${reais(s.falta)}</b>
    ${s.corrigida ? `<br><span class="suave">Depois de registrada, completar até ${reais(s.corrigida)} pelos reajustes (+${reais(s.corrigida - s.combinado)}).</span>` : ''}
    ${tabelaDepositos(qual, s.depositos, () => true)}
    ${formDeposito(qual, s.falta)}</div>`;
  };
  // paga em depósitos: desfaz o último (sai da lista); paga de uma vez: o "×" ao lado do comprovante (em comprovanteDa)
  const remover = (qual) => (opera() && c[`${qual}_por_depositos`] && R.podeRemoverComprovanteGarantia(d(), c, qual)
    ? ` ${botao('removerComprovanteGarantia', 'Desfazer último depósito', { contrato: c.id, qual }, 'perigo mini', 'Desfazer o último depósito? Ele sai da lista (com o arquivo, se tiver) e a garantia volta a "anexar comprovante".')}` : '');
  const irParaAnterior = anteriorDaGarantia && opera() ? ` ${link(`#/contrato/${anteriorDaGarantia.id}?ir=garantia`, `Anexar na garantia de ${esc(anteriorDaGarantia.inquilino_nome)}`, 'botao secundario mini')}` : '';
  const comprovanteDa = (qual, campo) => {
    // paga de uma vez: o "×" apaga o comprovante e a garantia volta a "anexar comprovante"
    const x = c[campo] && !c[`${qual}_por_depositos`] && R.podeRemoverComprovanteGarantia(d(), c, qual)
      ? xAnexo('removerComprovanteGarantia', { contrato: c.id, qual }, `Apagar o comprovante "${c[campo]}"? A garantia volta a "anexar comprovante".`) : '';
    // contrato anterior da troca de titular: comprovante anexado aqui (vale para o novo titular), mesmo se os depósitos passaram para lá
    if (herdeiro && !R.depositosGarantiaDo(d(), c, qual).some((x) => x.comprovante)) {
      return ` · ${linkComprovante(c.id, c[campo] || null, { tabela: 'contratos', id: c.id, campo, tipo: qual === 'caucao' ? 'caucao' : 'deposito-garantia', data: c[`${qual}_pago_em`] || c[`${qual}_data`] || '' })}${x}`;
    }
    if (c[`${qual}_por_depositos`]) return '';
    return ` · ${c[campo] ? `<span class="nw">${linkComprovante(c[`${campo}_contrato`] || c.id, c[campo])}${x}</span>` : `${etiqueta('sem comprovante', 'aviso')}${irParaAnterior}`}`;
  };
  const parcelas = (qual) => tabelaDepositos(qual, R.depositosGarantiaDo(d(), c, qual).filter((x) => c[`${qual}_por_depositos`] || x.complementar), (x) => x.complementar);
  // correções da caução: aparecem também enquanto a caução não foi depositada inteira
  // histórico: a caução é corrigida junto com o reajuste, na tela Reajustes
  const correcoesHtml = () => `${subtitulo('Correções da caução', link(`#/reajustes?contrato=${c.id}`, 'Corrigir em Reajustes'))}
    ${correcoes.length ? `<table class="compacta"><tr><th>Data</th><th class="n">Novo valor</th><th class="n">Complemento</th><th>Comprovante / obs.</th></tr>
      ${correcoes.map((x) => `<tr><td class="nw">${dataBr(x.data)}</td><td class="n">${reais(x.valor_novo)}</td><td class="n">${reais(x.complemento)}</td><td>${x.comprovante || x.complemento > 0 ? linkComprovante(c.id, x.comprovante, { tabela: 'correcoes_garantia', id: x.id, campo: 'comprovante', tipo: 'complemento-caucao', data: x.data }) : ''} ${esc(x.observacoes || '')}</td></tr>`).join('')}</table>` : ''}`;
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
    // boletos do complemento em aberto (uma ou mais parcelas): ao pagar cada um, soma na caução
    const abertos = d().cobrancas.filter((x) => x.contrato_id === c.id && R.ehComplementoCaucao(x) && !x.data_pagamento).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    // só aviso: o complemento (boleto ou depósito), de reajuste ou de novo valor negociado, é tratado na tela Reajustes
    const pendente = comp && comp.necessaria !== null && comp.complemento > 0;
    if (pendente || abertos.length || s.falta > 0) {
      const [deve, depositado, falta] = pendente ? [comp.necessaria, comp.atual, comp.complemento] : [s.necessaria, s.depositado, s.falta];
      html += `<div class="alerta aviso"><b>Complemento da caução:</b> deve ser ${reais(deve)}${c.caucao_meses ? ` (${c.caucao_meses} aluguéis com bonificação)` : ''} · depositado ${reais(depositado)} · <b>falta ${reais(falta)}</b>
        ${abertos.length ? `<br>Boleto${abertos.length > 1 ? 's' : ''} do complemento: ${abertos.map((x) => link(`#/cobranca/${x.id}`, `${x.caucao_parcela ? `${x.caucao_parcela} · ` : ''}${reais(x.caucao_complemento)} vence em ${dataBr(x.vencimento)}`, '')).join(', ')} (cada um pago soma na caução).` : ''}
        ${link(`#/reajustes?contrato=${c.id}`, 'Completar em Reajustes', 'botao mini')}</div>`;
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
        <td class="n">${opera() ? botao('excluirFiador', '×', { id: f.id }, 'x-excluir') : ''}</td></tr>`).join('')
      || `<tr><td colspan="5">${etiqueta('Nenhum fiador cadastrado', 'aviso')}</td></tr>`}</table>`;
  }
  if (anteriores.length) {
    html += `${subtitulo('Fiadores anteriores')}<table class="compacta suave"><tr><th>Nome</th><th>CPF / RG</th><th>Fim do vínculo</th><th>Substituído por</th><th></th></tr>
      ${anteriores.map((f) => `<tr><td>${esc(f.nome)}</td><td>${esc(f.cpf || '-')} / ${esc(f.rg || '-')}</td><td>${dataBr(f.data_saida)}</td><td>${esc((buscar('fiadores', f.substituido_por_id) || {}).nome || '-')}</td>
        <td class="n">${opera() ? botao('excluirFiador', '×', { id: f.id }, 'x-excluir') : ''}</td></tr>`).join('')}</table>`;
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
        <td class="n nw">${editar(`#/editar/aplicacoes/${a.id}?contrato=${c.id}`)} ${excluir('aplicacoes', a.id, 'Excluir esta aplicação? O comprovante também é apagado.')}</td></tr>`; }).join('')}
      <tr class="total"><td colspan="7">Aplicado de ${reais(sit.total)}${R.garantiaDepositada(c) ? '' : ' <span class="suave">(já depositado)</span>'}</td><td class="n">${reais(sit.soma)}</td><td colspan="2">${situacaoTotal}</td></tr></table>`;
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
  // saída em duas etapas, só aqui: 1) a data (quando o inquilino avisa; o último boleto sai proporcional); 2) o cálculo final
  if (!e) {
    if (!opera()) return c.data_saida ? `<div class="cartao" id="saida"><h2>Saída em ${dataBr(c.data_saida)}</h2><p class="suave">Falta o cálculo final.</p></div>` : '';
    if (!c.data_saida) {
      const legado = c.ativo === false ? `<div class="alerta aviso">Inquilino marcado como inativo sem data de saída (antes desta mudança): informe a data de saída ou reative. ${botao('desfazerSaida', 'Reativar', { id: c.id }, 'secundario pequeno', 'Reativar o inquilino (volta a gerar boleto)?')}</div>` : '';
      return `<div class="cartao" id="saida"><div class="cabecalho"><h2>Saída do inquilino</h2>${botao('informarSaida', 'Informar data de saída', { id: c.id }, 'botao')}</div>${legado}
        <p class="suave">1º quando o inquilino avisar: a data de saída (o boleto do último mês sai proporcional aos dias). 2º depois que ele sair: o cálculo final (garantia corrigida, débitos e leitura dos relógios, a mesma da vistoria de saída).</p></div>`;
    }
    const temVistoria = R.vistoriasDo(d(), c.id).some((v) => v.tipo === 'Saída');
    return `<div class="cartao" id="saida"><div class="cabecalho"><h2>Saída em ${dataBr(c.data_saida)}</h2>
        <div class="acoes">${botao('informarSaida', 'Mudar a data', { id: c.id }, 'secundario pequeno')} ${botao('desfazerSaida', 'Desfazer a saída', { id: c.id }, 'perigo pequeno', 'Tirar a data de saída? O inquilino volta a ativo.')}</div></div>
      ${(() => { const s = R.saldoFci(d(), c); return s.depositos.length ? `<div class="alerta info">💰 Crédito do inquilino no FCI: <b>${reais(s.corrigido)}</b>${s.ate ? ` (corrigido até ${compBr(s.ate)})` : ' (sem correção: use "Calcular atualização" na caixa do FCI)'}. Paga só os reparos de danos da vistoria de saída; o que sobrar volta ao inquilino.</div>` : ''; })()}
      <div class="alerta aviso">Falta o cálculo final. ${temVistoria ? '' : `Faça antes a ${link(`#/vistoria/novo?contrato=${c.id}&tipo=Sa%C3%ADda`, 'vistoria de saída', '')} (com a leitura dos relógios). `}${link(`#/novo/encerramentos?contrato=${c.id}`, 'Fazer cálculo final', 'botao pequeno')}</div></div>`;
  }
  const lembrete = R.alertaTitularidade(d(), c);
  return `<div class="cartao" id="saida"><h2>Saída em ${dataBr(e.data_saida)}</h2>
    ${lembrete ? `<div class="alerta aviso"><b>Lembrete</b> ${esc(lembrete.texto)} ${opera() && c.imovel_id ? link(`#/novo/titularidades?imovel=${c.imovel_id}&contrato=${c.id}&tipo=volta`, 'Registrar protocolo') : ''}</div>` : ''}
    <div class="grade">
    ${item('Garantia a devolver', reais(e.garantia_valor))}${item('Correção (poupança)', `${pct(e.indice_percentual || 0)} → ${reais(e.garantia_corrigida)}`)}
    ${item('Débitos descontados', reais(e.debitos))}
    ${e.fci_credito ? `${item('💰 FCI corrigido (crédito do inquilino)', reais(e.fci_credito))}${item('Reparos de danos pagos com o FCI', reais(e.fci_usado || 0))}${item('FCI a devolver', reais(e.fci_devolver || 0))}` : ''}
    ${item(e.saldo >= 0 ? 'Saldo a devolver ao inquilino' : 'Saldo a cobrar do inquilino', `<span class="maior">${reais(Math.abs(e.saldo))}</span>`)}
    ${item('Vistoria de saída', esc(e.vistoria_saida || '-'))}</div>
    ${e.fci_danos > (e.fci_usado || 0) ? `<p class="suave">Os reparos passaram do FCI em ${reais(e.fci_danos - e.fci_usado)}: a diferença entrou como débito.</p>` : ''}
    ${(() => { const dev = R.devolucaoPorRecebedor(d(), c, e.garantia_corrigida); return dev.length ? `<h3>Devolução da garantia: sai de onde foi depositada</h3><table>${dev.map((x) => `<tr><td>Devolver pela ${x.pessoa ? 'conta de ' : ''}${esc(x.nome)}${x.pessoa ? ` ${etiqueta('outra pessoa', 'info')}` : ''}</td><td class="n">${reais(x.valor)}</td></tr>`).join('')}</table>` : ''; })()}
    ${e.debitos_descricao ? `<p class="pre">${esc(e.debitos_descricao)}</p>` : ''}${e.observacoes ? `<p class="pre">${esc(e.observacoes)}</p>` : ''}
    ${podeUsuario('admin') ? botao('excluir', 'Desfazer cálculo final', { tabela: 'encerramentos', id: e.id }, 'perigo pequeno', 'Apagar o cálculo final da saída? A data de saída e a leitura dos relógios continuam.') : ''}</div>`;
}

/** FCI (fundo de conservação do imóvel): valor do mês, soma paga e saldo corrigido pelos índices do Banco Central. */
function caixaFci(c) {
  const s = R.saldoFci(d(), c);
  if (!R.temFci(c) && !s.depositos.length) return '';
  const aluguel = R.aluguelAtual(d(), c);
  const bonificado = aluguel - C.descontoPorPercentual(aluguel, R.percentualBonificacao(c));
  return `<div class="cartao" id="fci"><div class="cabecalho"><h2>💰 FCI: fundo de conservação do imóvel</h2>${opera() && s.depositos.length ? botao('calcularFci', 'Calcular atualização', { id: c.id }, 'secundario') : ''}</div>
    <div class="grade">${item('Cobrado por mês', R.temFci(c) ? `${reais(R.fciDoMes(c, bonificado, 0))} <span class="suave">(${pct(c.fci_percentual)} de ${reais(bonificado)})</span>` : 'não cobra mais')}
      ${item('Pago até agora', `${reais(s.total)} <span class="suave">(${s.depositos.length} depósito(s))</span>`)}
      ${item(`Corrigido (${esc(c.fci_indice || 'índice não escolhido')})`, s.ate ? `<span class="maior">${reais(s.corrigido)}</span><br><span class="suave">índices até ${compBr(s.ate)} · calculado em ${dataBr(s.calculado_em)}</span>` : `${reais(s.corrigido)}<br><span class="suave">${s.depositos.length ? 'clique em "Calcular atualização"' : 'sem pagamentos ainda'}</span>`)}</div>
    ${s.depositos.length ? `<details><summary>Pagamentos (${s.depositos.length})</summary><div class="rolagem"><table><tr><th>Origem</th><th>Pago em</th><th class="n">Valor</th><th class="n">Corrigido</th></tr>
      ${s.depositos.map((x) => `<tr><td>${x.previo ? 'Lançado à mão' : `Boleto ${compBr(x.competencia)}`}</td><td>${dataBr(x.data)}</td><td class="n">${reais(x.valor)}</td><td class="n">${reais(x.corrigido)}</td></tr>`).join('')}</table></div></details>` : ''}
    ${opera() ? editorFciPrevios(c) : ''}
    <p class="suave">Entra no boleto todo mês, fora da NF, da multa e dos juros. Cada pagamento é corrigido a partir do mês seguinte (nunca fica abaixo do que foi pago). Na saída, paga só os reparos de danos da vistoria (nunca aluguel ou contas); o que sobrar volta corrigido ao inquilino.</p></div>`;
}

/** Depósitos do FCI de antes do sistema: caixa que abre para lançar, editar e remover (a linha em branco do fim cresce ao preencher). */
function editorFciPrevios(c) {
  const lista = [...(c.fci_previos || []), { data: '', valor: 0 }];
  const linha = (x) => `<tr><td><input type="date" name="fci_data" value="${esc(x.data)}"></td>
    <td><input name="fci_valor" data-dinheiro inputmode="decimal" placeholder="0,00" value="${x.valor ? reais(x.valor, false) : ''}"></td>
    <td><button type="button" class="x-excluir" data-remover-linha title="Remover">×</button></td></tr>`;
  return `<details id="fci-previos"><summary>Depósitos anteriores ao sistema (${(c.fci_previos || []).length}): lançar, editar, remover</summary>
    <p class="suave">Preencha a data e o valor de cada depósito. Ao preencher a última linha, aparece outra em branco. Remover só vale depois de salvar.</p>
    <table><tr><th>Data do depósito</th><th>Valor (R$)</th><th></th></tr><tbody data-linhas-fci>${lista.map(linha).join('')}</tbody></table>
    <p>${botao('salvarFciPrevios', 'Salvar depósitos', { id: c.id }, 'pequeno')}</p></details>`;
}

/** Histórico das leituras dos relógios de água, energia e gás. */
export function caixaLeituras(lista, botaoNovo, comInquilino) {
  return `<div class="cartao"><div class="cabecalho"><h2>Leitura dos relógios (água, energia, gás)</h2>${botaoNovo}</div>
    <div class="rolagem"><table><tr><th>Data</th><th>Momento</th>${comInquilino ? '<th>Inquilino</th>' : ''}<th>Água</th><th>Energia</th><th>Gás</th><th>Obs.</th><th></th></tr>
    ${lista.map((l) => { const c = l.contrato_id ? buscar('contratos', l.contrato_id) : null; return `<tr><td>${dataBr(l.data)}</td><td>${esc(l.momento)}</td>
      ${comInquilino ? `<td>${c ? `<a href="#/contrato/${c.id}">${esc(c.inquilino_nome)}</a>` : '<span class="suave">imóvel vazio</span>'}</td>` : ''}
      <td>${esc(l.agua || '-')}</td><td>${esc(l.energia || '-')}</td><td>${esc(l.gas || '-')}</td><td>${esc(l.observacoes || '')}</td>
      <td class="n">${!opera() ? '' : l.contrato_id && ['Entrada do inquilino', 'Saída do inquilino'].includes(l.momento) ? '<span class="suave" title="A leitura de entrada e de saída é feita e corrigida na vistoria">na vistoria</span>'
    : `${link(`#/editar/leituras/${l.id}`, 'Editar')} ${botao('excluir', '×', { tabela: 'leituras', id: l.id }, 'x-excluir', 'Excluir esta leitura?')}`}</td></tr>`; }).join('')
    || `<tr><td colspan="${comInquilino ? 8 : 7}" class="suave">Nenhuma leitura registrada.</td></tr>`}</table></div></div>`;
}

/** O que o contrato inclui: IPTU, água, energia, gás, condomínio, internet e contas adicionais. */
/**
 * O que está incluso no contrato, numa linha embaixo dos selos: os itens agrupados por situação, com os símbolos da
 * lista de Imóveis (💧 ⚡ 🔥 📶 🏢; IPTU 🏛️ e seguro 🛡️). Ex.: "Incluso no aluguel: 🏛️ IPTU 🛡️ Seguro · Por conta do inquilino: 💧 Água…".
 */
const SIMBOLOS_CONTAS = { conta_agua: '💧', conta_energia: '⚡', conta_gas: '🔥', conta_internet: '📶', conta_condominio: '🏢' };

function linhaIncluso(c) {
  const itens = [['🏛️', 'IPTU', c.conta_iptu || (c.cobrar_iptu ? R.SITUACOES[0] : R.SITUACOES[1])],
    ['🛡️', 'Seguro', c.conta_seguro || (c.cobrar_seguro === false ? R.SITUACOES[1] : R.SITUACOES[0])],
    ...F.CONTAS.map(([k, t]) => [SIMBOLOS_CONTAS[k], t, c[k]])];
  // FCI: só aparece quando o contrato cobra (com o % do aluguel bonificado); é sempre por conta do inquilino (azul)
  const fci = R.temFci(c) ? `<a href="#/contrato/${c.id}?ir=fci" class="ic inq" title="Fundo de conservação do imóvel: sempre por conta do inquilino (vem no boleto)">💰 FCI ${pct(c.fci_percentual)}</a>` : '';
  const grupos = [['Incluso no aluguel', 'inc'], ['Por conta do inquilino', 'inq'], ['Não tem', 'nao'], [null, 'ni']].map(([sit, cls]) => {
    const l = itens.filter(([, , v]) => (sit ? v === sit : !R.SITUACOES.includes(v)));
    const extra = cls === 'inq' ? fci : '';
    return l.length || extra ? `<span class="suave">${sit || 'Não informado'}:</span>${l.map(([s, t]) => `<span class="ic ${cls}">${s} ${esc(t)}</span>`).join('')}${extra}` : '';
  }).filter(Boolean);
  return `<div class="incluso" title="O que está incluso no contrato">${grupos.join('<span class="sep"></span>')}${c.contas_adicionais ? `<span class="sep"></span><span class="suave">+ ${esc(c.contas_adicionais)}</span>` : ''}</div>`;
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
        <td class="n nw">${opera() && !(cb && cb.data_pagamento) ? `${link(`#/editar/ressarcimentos/${x.id}`, 'Editar')} ${botao('excluir', '×', { tabela: 'ressarcimentos', id: x.id }, 'x-excluir', 'Excluir este ressarcimento?')}` : ''}</td></tr>`; }).join('')}</table></div>` : ''}</div>`;
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
      <td class="n nw">${opera() ? `${link(`#/editar/solicitacoes/${x.id}`, 'Editar')} ${botao('excluir', '×', { tabela: 'solicitacoes', id: x.id }, 'x-excluir', 'Excluir esta solicitação?')}` : ''}</td></tr>`).join('')
    || '<tr><td colspan="6" class="suave">Nenhuma solicitação registrada.</td></tr>'}</table></div></div>`;
}

/** Seguro obrigatório: cada inquilino tem a sua apólice (sai com ele; quem entra precisa de outra). */
export function caixaSeguros(c) {
  const i = buscar('imoveis', c.imovel_id);
  const seguros = R.segurosDoContrato(d(), c.id).sort((a, b) => String(b.vigencia_inicio).localeCompare(String(a.vigencia_inicio)));
  if (!i || (c.conta_seguro === R.SITUACOES[2] && !seguros.length)) return '';
  const alerta = [R.alertaSeguroImovel(d(), i)].find((a) => a && a.contrato_id === c.id);
  return `<div class="cartao" id="seguros"><div class="cabecalho"><h2>Seguro obrigatório</h2>${opera() ? link(`#/novo/seguros?contrato=${c.id}`, 'Cadastrar apólice') : ''}</div>
    ${alerta ? `<div class="alerta ${alerta.nivel}">${esc(alerta.texto)}</div>` : ''}
    <div class="rolagem"><table><tr><th>Seguradora / apólice</th><th>Contratado em</th><th>Vigência</th><th class="n">Valor</th><th>Parcelas</th><th></th></tr>
      ${seguros.map((s) => `<tr><td>${esc(s.seguradora || '-')}<br><span class="suave">${esc(s.apolice || '')}</span>${s.telefone_assistencia ? ` <span class="nw">· 📞 Assistência: <b>${esc(s.telefone_assistencia)}</b></span>` : ''}${s.arquivo_apolice ? `<br><a href="#" data-acao="abrirArquivo" data-escopo="seguro" data-id="${c.id}" data-nome="${esc(s.arquivo_apolice)}">📎 apólice</a>` : `<br>${etiqueta('sem arquivo da apólice', 'aviso')}`}</td><td>${dataBr(s.data_contratacao)}</td><td>${dataBr(s.vigencia_inicio)} a ${dataBr(s.vigencia_fim)}</td><td class="n">${reais(s.valor_total)}</td><td>${s.num_parcelas}x a partir de ${compBr(s.primeira_competencia)}</td>
        <td class="n">${opera() ? `${link(`#/editar/seguros/${s.id}`, 'Editar')} ${botao('excluir', '×', { tabela: 'seguros', id: s.id }, 'x-excluir', 'Excluir esta apólice?')}` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="suave">Nenhuma apólice cadastrada.</td></tr>'}</table></div>
    <p class="suave">As parcelas entram nos boletos deste inquilino (se o contrato dele inclui o seguro). A apólice é dele: quando ele sai, ela vai junto, e quem entra precisa de uma apólice nova.</p>
    ${caixaArquivos('seguro', c.id, 'Apólices', 'apolices', 'O arquivo da apólice é anexado ao cadastrar a apólice (botão "Cadastrar apólice"); aqui ficam todos, com a vigência ao lado.', true)}</div>`;
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
export function situacaoBoleto(cb, hoje = C.hojeIso()) {
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
  // assinado neste contrato: o "×" apaga só o arquivo (continua assinado) e, sem arquivo, "⚠ anexar" põe o arquivo de volta
  const abrirProprio = (k) => (c[R.campoArquivoDoc(k)] ? `<span class="nw">${abrir(k)}${xAnexo('removerArquivoDocumento', { contrato: c.id, campo: k }, `Apagar o arquivo "${c[R.campoArquivoDoc(k)]}"? O documento continua marcado como assinado; anexe o arquivo certo depois.`)}</span>`
    : opera() ? `<label class="anexar-falta" title="Anexar o arquivo assinado (PDF ou foto)">⚠ anexar arquivo<input type="file" accept="application/pdf,image/*" data-acao-arquivo="anexarArquivoDocumento" data-contrato="${c.id}" data-campo="${k}"></label>` : abrir(k));
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
    <td class="n nw">${herdado(k) ? abrir(k) : c[k] ? `${abrirProprio(k)}
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
      ${podeUsuario('admin') ? botao('excluir', '×', { tabela: 'vistorias', id: v.id }, 'x-excluir', `Excluir a vistoria de ${v.tipo.toLocaleLowerCase('pt-BR')} de ${dataBr(v.data)}?`) : ''}</td></tr>`).join('')}</table>` : ''}
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
      <td class="n nw">${ver(a)} ${opera() ? `${a.texto ? link(`#/aditivo/${a.id}`, 'Editar') : ''} ${botao('excluir', '×', { tabela: 'aditivos', id: a.id }, 'x-excluir', `Excluir o termo aditivo de ${dataBr(a.data)} (ainda não assinado)?`)}` : ''}
      ${opera() ? `<form data-form="assinarAditivo" class="acoes" style="justify-content:flex-end;margin-top:4px"><input type="hidden" name="id" value="${a.id}">
        <input type="date" name="data" value="${C.hojeIso()}" style="width:auto" title="Data da assinatura">
        <label class="botao secundario pequeno enviar" title="Termo aditivo assinado (PDF ou foto)"><span data-nome-escolhido>Anexar</span><input type="file" name="arquivo" accept="application/pdf,image/*" data-arquivo-doc></label>
        <button class="pequeno">Marcar assinado</button></form>` : ''}</td></tr>`).join('')}</table></div></div>` : ''}
    ${lista.length ? `<div class="rolagem"><table><tr><th>Data</th><th>Assunto</th><th>Arquivo</th><th></th></tr>${lista.map((a) => `<tr><td class="nw">${dataBr(a.data)}</td><td>${esc(a.assunto)}</td><td class="nw">${abrir(a)}${xAnexo('removerArquivoAditivo', { id: a.id }, `Apagar o arquivo "${a.arquivo}"? O termo aditivo continua e volta a "aguardando assinatura".`)}</td>
      <td class="n nw">${ver(a)} ${opera() ? botao('excluir', '×', { tabela: 'aditivos', id: a.id }, 'x-excluir', `Excluir o termo aditivo de ${dataBr(a.data)}? O arquivo assinado também é apagado.`) : ''}</td></tr>`).join('')}</table></div>`
    : '<p class="suave">Nenhum termo aditivo registrado.</p>'}
    ${anteriores.map(([x, l]) => `<details open><summary>Histórico: aditivos do contrato anterior de <a href="#/contrato/${x.id}?ir=aditivos">${esc(x.inquilino_nome)}</a> (${l.length})</summary>
      <div class="rolagem"><table>${l.map((a) => `<tr><td class="nw">${dataBr(a.data)}</td><td>${esc(a.assunto)}</td><td>${abrir(a)}</td></tr>`).join('')}</table></div></details>`).join('')}
    ${opera() ? `<form data-form="aditivo" class="acoes"><input type="hidden" name="contrato" value="${c.id}">
      <input type="date" name="data" value="${C.hojeIso()}" style="width:auto">
      <input name="assunto" placeholder="Assunto (ex.: troca do dia do vencimento para 15)" style="flex:1;min-width:240px">
      <label class="botao secundario pequeno enviar" title="Termo aditivo assinado (PDF ou foto)"><span data-nome-escolhido>Anexar</span><input type="file" name="arquivo" accept="application/pdf,image/*" data-arquivo-doc></label>
      <button class="secundario pequeno">Registrar aditivo</button></form>` : ''}`;
}

export function telaContrato(c) {
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
      ${opera() ? botao('editarContrato', 'Editar contrato', { id: c.id }, 'botao') : ''}
      ${opera() && c.imovel_id && !cobs.some((cb) => cb.data_pagamento) ? botao('corrigirImovel', 'Corrigir imóvel', { id: c.id }, 'secundario') : ''}
      ${podeUsuario('admin') ? botao('excluir', 'Excluir', { tabela: 'contratos', id: c.id }, 'perigo', 'Excluir este contrato e todos os seus boletos?') : ''}</div></div>
    ${i ? `<div class="endereco">📍 ${esc(i.nome)} · ${esc(endereco(i))}</div>` : `<div class="alerta aviso">Sem imóvel vinculado. Use "Editar contrato" para escolher o imóvel.${R.dataApagarSemImovel(c) ? ` Se não for vinculado, este contrato será apagado em <b>${dataBr(R.dataApagarSemImovel(c))}</b>.` : ''}</div>`}
    ${c.ativo === false ? `<div class="alerta info">Inquilino inativo: não gera boleto.</div>` : ''}
    ${R.geraNf(c) ? '' : `<div class="alerta controle"><b>Boleto de controle.</b> Este inquilino ${AVISO_CONTROLE} ${opera() ? botao('alternarNf', 'Passar a emitir NF', { id: c.id }, 'secundario pequeno', 'Este inquilino passa a emitir NF e a contar nos resultados?') : ''}</div>`}
    ${selosContrato(c)}
    ${linhaIncluso(c)}
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
      ${c.reserva_valor > 0 ? `<div class="cabecalho"><h3 id="reserva">Reserva dada na visita</h3>${opera() ? link(`#/editar/contratos/${c.id}`, 'Editar', 'botao secundario mini') : ''}</div><div class="grade">${item('Valor / data', `${reais(c.reserva_valor)} em ${dataBr(c.reserva_data)}<br>${linkComprovante(c.id, c.comprovante_reserva, { tabela: 'contratos', id: c.id, campo: 'comprovante_reserva', tipo: 'reserva', data: c.reserva_data })}`)}${item('Usar no aluguel de', `${compBr(R.competenciaReserva(c))}${c.reserva_competencia ? '' : ' (primeiro aluguel)'}`)}${item('Saldo ainda não usado', reais(R.saldoReserva(d(), c)))}</div>
        ${caixaReservaAbatida(c)}` : ''}
      ${c.observacoes ? `<h3>Observações</h3><p class="pre">${esc(c.observacoes)}</p>` : ''}</div>
    ${caixaRessarcimentos(c)}
    ${caixaSolicitacoes(c)}
    ${caixaGarantia(c)}
    ${caixaSeguros(c)}
    ${caixaFci(c)}
    ${novo ? contas : ''}
    ${caixaBoletosInquilino(c, cobs, hoje)}
    <div class="cartao"><div class="cabecalho"><h2>Correção anual do aluguel (${esc(c.indice_correcao || 'índice não informado')})</h2>${link(`#/reajustes?contrato=${c.id}`, 'Ir para Reajustes')}</div>
      <p class="suave">Aqui fica só o histórico. Os reajustes do aluguel e da caução, de qualquer ano, são aplicados e desfeitos na tela Reajustes.</p>
      ${(() => { const abertos = R.reajustesAbertos(d()).filter((r) => r.contrato.id === c.id);
    if (!abertos.length) { const p = R.mesDeAniversario(c); return p ? `<p class="suave">Reajuste no 13º mês (o mês de entrada conta como o 1º): aluguel de ${compBr(R.competenciaDoReajuste(c, Math.max(1, Math.floor(C.mesesEntre(p, C.competenciaDe(C.hojeIso())) / 12) + 1)))}.</p>` : ''; }
    return `<div class="alerta aviso"><b>Reajuste do aluguel em aberto:</b> ${abertos.map((r) => `${compBr(r.competencia)} (${r.anos} ano(s)${r.corrigido ? ', falta a carta' : ''})`).join(', ')} ${link(`#/reajustes?contrato=${c.id}`, 'Ir para Reajustes', 'botao pequeno')}</div>`; })()}
      ${(() => { const m = R.correcoesRecalculadas(d(), c, c.aluguel_inicial); return m.length ? `<div class="alerta aviso"><b>As correções abaixo não batem com o aluguel inicial de ${reais(c.aluguel_inicial)}</b> (ex.: o inicial foi corrigido depois).
        Refeitas em cadeia: ${m.map((x) => `${dataBr(x.x.data_vigencia)} ${reais(x.x.valor_novo)} → <b>${reais(x.valor_novo)}</b>`).join('; ')}. O novo valor negociado fica como combinado.
        ${opera() ? `<div class="acoes" style="margin-top:6px">${botao('recalcularCorrecoes', 'Refazer as correções a partir do aluguel inicial', { id: c.id }, 'pequeno', 'Refazer as correções a partir do aluguel inicial? Os boletos em aberto são recalculados.')}</div>` : ''}</div>` : ''; })()}
      <table><tr><th>Vale a partir de</th><th>Previsto no contrato</th><th>Índice usado</th><th class="n">%</th><th class="n">Valor anterior</th><th class="n">Novo valor</th><th></th></tr>
      ${cadeia.antes.flatMap((x) => [`<tr class="suave"><td>${dataBr(x.vigencia_inicio)}</td><td colspan="4">Valor inicial · titular anterior: ${esc(x.inquilino_nome)}</td><td class="n">${reais(x.aluguel_inicial)}</td><td></td></tr>`,
    ...R.correcoesDo(d(), x.id).map((y) => `<tr class="suave"><td>${dataBr(y.data_vigencia)}</td><td>${esc(y.indice_contrato || '-')}</td><td>${esc(y.indice || '-')} <span class="suave">(${esc(x.inquilino_nome)})</span></td><td class="n">${pct(y.percentual)}</td><td class="n">${reais(y.valor_anterior)}</td><td class="n">${reais(y.valor_novo)}</td><td></td></tr>`)]).join('')}
      <tr><td>${dataBr(c.vigencia_inicio)}</td><td colspan="4" class="suave">${cadeia.antes.length ? 'Valor inicial deste titular (continuação do contrato)' : 'Valor inicial do contrato'}</td><td class="n">${reais(c.aluguel_inicial)}</td><td></td></tr>
      ${R.correcoesDo(d(), c.id).map((x) => `<tr><td>${dataBr(x.data_vigencia)}</td><td>${esc(x.indice_contrato || '-')}</td><td>${x.indice === 'Negociado' ? etiqueta('Negociado', 'aviso') : `${esc(x.indice || '-')}${x.data_indice ? ` <span class="suave">(${compBr(x.data_indice)})</span>` : ''}`}</td><td class="n">${pct(x.percentual)}</td><td class="n">${reais(x.valor_anterior)}</td><td class="n"><b>${reais(x.valor_novo)}</b></td><td></td></tr>`).join('')}</table></div>
    <div class="cartao" id="renovacoes"><div class="cabecalho"><h2>Renovação e novo valor negociado</h2>${opera() ? link(`#/novo/renovacoes?contrato=${c.id}`, 'Registrar renovação / novo valor') : ''}</div>
      <p class="suave">No aniversário vale a correção pelo índice do contrato. No fim do prazo, o novo valor é negociado com o inquilino e registrado aqui.</p>
      <table><tr><th>Data</th><th>O que aconteceu</th><th>Novo término</th><th class="n">Novo valor</th><th>Obs.</th><th></th></tr>
      ${renovs.map((r) => `<tr><td>${dataBr(r.data)}</td><td>${esc(r.tipo)}</td><td>${dataBr(r.nova_vigencia_fim)}</td><td class="n">${r.novo_valor ? reais(r.novo_valor) : '-'}</td><td>${esc(r.observacoes || '')}</td>
        <td class="n">${opera() ? botao('excluirRenovacao', '×', { id: r.id }, 'x-excluir', `Excluir este registro${r.novo_valor ? ' e o novo valor negociado' : ''}? A data de término do contrato não volta sozinha: confira em "Editar".`) : ''}</td></tr>`).join('')
      || '<tr><td colspan="6" class="suave">Nenhuma renovação registrada.</td></tr>'}</table></div>
    ${caixaDocumentos(c)}
    ${caixaArquivos('contrato', c.id, `Arquivos do inquilino · 📁 ${c.pasta || nomePastaContrato(c)}`, 'arquivos', 'Fichas cadastrais, Documentos de Identificação, Consulta Serasa, Contra Vistorias')}
    ${novo ? '' : contas}
    ${caixaSaida(c)}
    ${caixaHistorico(`Histórico deste inquilino${historicoIds.size > 1 ? ' e dos contratos ligados' : ''}`, tabelaHistorico(ultimos((h) => historicoIds.has(h.contrato_id), 80)))}`;
}
