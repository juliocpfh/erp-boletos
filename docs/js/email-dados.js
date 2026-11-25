// Dados dos e-mails por etapa: campos e condições que os modelos (modelos-email.js) usam, a partir do contrato ou da ficha.
// Funções puras (rodam no Node, tests/emails.test.mjs). Valores em centavos viram "R$ 1.234,56"; datas viram "dd/mm/aaaa".
import * as C from './calculos.js';
import * as FO from './ficha-online.js';
import * as TR from './termo-reserva.js';
import * as K from './contratos.js';
import { MODELOS_EMAIL } from './modelos-email.js';
import * as NT from './notificacoes.js';
import * as REC from './recibos.js';
import * as R from './regras.js';

const PJ = 'Pessoa jurídica (empresa)';
const NOMES_CONTA = { conta_agua: 'água', conta_energia: 'energia', conta_gas: 'gás', conta_internet: 'internet', conta_condominio: 'condomínio' };
const CONTAS_FICHA = Object.keys(NOMES_CONTA);
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const juntar = (itens) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`);

/**
 * Contas que passam para o nome do inquilino: água e energia (salvo incluso ou não tem); gás quando por conta dele.
 * A companhia vem do imóvel ou da empresa (Empresas). Ex.: [['água', 'água (Sanepar)'], ['energia', 'energia (Copel)']].
 */
function contasDoInquilino(d, c, alvo, imovel) {
  const fora = (k) => ['Incluso no aluguel', 'Não tem'].includes(c[k]);
  const comCompanhia = (conta, qual) => { const n = K.nomeCurtoCompanhia(K.companhiaDoImovel(d, alvo, imovel, qual)); return n ? `${conta} (${n})` : conta; };
  const out = [];
  if (!fora('conta_agua')) out.push(['água', comCompanhia('água', 'agua')]);
  if (!fora('conta_energia')) out.push(['energia', comCompanhia('energia', 'energia')]);
  if (c.conta_gas === 'Por conta do inquilino') out.push(['gás', 'gás']);
  return out;
}

/** Texto da garantia. Ex.: "caução de R$ 6.900,00 (3 aluguéis com bonificação), aplicada em poupança e devolvida corrigida...". */
function textoGarantia(tipo, valor, meses) {
  if (tipo === 'Caução') return `caução de ${valor ? C.reais(valor) : 'até 3 aluguéis'}${valor && meses ? ` (${C.plural(meses, 'aluguel', 'aluguéis')} com bonificação)` : ''}, aplicada em poupança e devolvida corrigida no fim do contrato, descontados eventuais débitos`;
  if (tipo === 'Depósito garantia') return `depósito de garantia${valor ? ` de ${C.reais(valor)}` : ''}, devolvido no fim do contrato, descontados eventuais débitos`;
  if (tipo === 'Fiador') return 'fiador com imóvel próprio';
  if (tipo === 'Fiador + depósito') return `fiador e depósito de garantia${valor ? ` de ${C.reais(valor)}` : ''}`;
  if (tipo === 'Seguro fiança') return 'seguro fiança locatícia, contratado em seu nome';
  return 'sem garantia';
}

const condicoesDaGarantia = (tipo) => ({
  caucao: tipo === 'Caução', deposito: ['Depósito garantia', 'Fiador + depósito'].includes(tipo),
  dinheiro: ['Caução', 'Depósito garantia', 'Fiador + depósito'].includes(tipo), fiador: ['Fiador', 'Fiador + depósito'].includes(tipo),
  seguro_fianca: tipo === 'Seguro fiança', sem_garantia: !tipo || tipo === 'Sem garantia', tem_garantia: !!tipo && tipo !== 'Sem garantia',
});

/** Linhas do acerto final, as mesmas do termo de quitação (REC.linhasDoAcerto). Ex.: "Garantia corrigida até 30/11/2026: R$ 5.940,00 · ... · = Saldo a devolver: R$ 5.340,00". */
function textoAcerto(e) {
  return REC.linhasDoAcerto(e).map(([r, v]) => (v ? `${r}: ${v}` : r)).join('\n');
}

/** Valores pagos no ano por empresa (código 70 do IRPF). Ex.: "- ANK ADMINISTRADORA DE BENS LTDA · CNPJ 58.492.818/0001-59 · R$ 16.560,00". */
function textoInforme(d, c, ano) {
  let dec;
  try { dec = R.declaracaoAnual(d, c.id, ano); } catch { return ''; }
  if (!dec.empresas.length) return '';
  const linhas = dec.empresas.map((g) => `- ${g.emitente.razao_social || g.emitente.nome}${g.emitente.cnpj ? ` · CNPJ ${g.emitente.cnpj}` : ''} · ${C.reais(g.total)}`);
  return [...linhas, `Total de aluguel em ${ano}: ${C.reais(dec.total)} (IPTU, seguro e outros encargos não entram neste valor).`].join('\n');
}

/** Primeiro boleto: o do mês da entrada (ou o já gerado). Ex.: "aluguel de 12/2026, vence em 10/01/2027". */
function primeiroBoleto(d, c) {
  const inicio = c.data_entrada || c.vigencia_inicio;
  if (!inicio) return '';
  const comp = C.competenciaDe(inicio);
  const cb = R.boletoDoMes(d, c.id, comp);
  const venc = cb ? cb.vencimento : `${c.cobranca_mes_seguinte !== false ? C.somarMeses(comp, 1) : comp}-${String(c.dia_vencimento || 10).padStart(2, '0')}`;
  return `aluguel de ${C.compBr(comp)}, vence em ${C.dataBr(venc)}`;
}

/** Documentos da ficha para o e-mail, numerados (os do tipo de renda e, com fiador, os do fiador), com o aviso do arquivo original. */
function documentosDoEmail(f) {
  const num = (l) => l.map((t, k) => `${k + 1}. ${t}`).join('\n');
  const lista = R.fiadoresDaFicha(f);
  const fiadores = lista.length ? lista : R.temFiador(f) ? [{}] : [];
  const blocos = fiadores.map((x) => `\nDO FIADOR${x.nome && fiadores.length > 1 ? ` (${x.nome})` : ''}\n${num(R.documentosDoFiador(x))}`);
  return [num(R.documentosDaFicha(f)), ...blocos, `\n${R.DICA_DOCUMENTOS}`].join('\n');
}

/**
 * Link da ficha pela internet ainda no prazo: { url, validade } (vazios sem link). O endereço só existe na aba em que foi gerado
 * (FO.urlDoLink; no banco fica só a validade): fora dela, o e-mail sai sem o link e a equipe gera um novo na ficha.
 */
function linkDaFicha(f, pessoa, hoje) {
  const l = f && f.links_ficha && f.links_ficha[pessoa];
  const naAba = f && FO.urlDoLink(f.id, pessoa);
  return l && !l.encerrado && naAba && C.dataDeBrasilia(l.vence_em) >= hoje ? { url: naAba.url, validade: C.dataBrDe(l.vence_em) } : { url: '', validade: '' };
}

/**
 * Campos do termo de aceite da reserva (2026-11-24): as condições do termo (as aceitas ou, sem aceite, as de agora), o link do
 * aceite desta aba e o que fica numa desistência. Ex.: reserva combinada de R$ 500,00 com 40% → retencao "40%",
 * retencao_valor "R$ 200,00", devolve_depois "R$ 300,00".
 */
function camposDoTermo(f, hoje) {
  if (!f) return {};
  const c = R.condicoesDaReserva(f);
  const valor = R.valorDaReserva(f);
  const reter = R.retencaoDaReserva(valor, c.retencao_pct);
  const link = TR.urlDoAceite(f.id);
  const pz = R.prazosDaReserva(f);
  const dv = R.fichaSemContrato(f) ? R.devolucaoDaReserva(f) : null;
  return {
    reserva_combinada: valor ? C.reais(valor) : '', dias_validade: String(c.dias_validade), dias_documentos: String(c.dias_uteis_documentos), prazo_documentos_dias: R.prazoDosDocumentosTexto(c),
    dias_arrependimento: String(c.dias_arrependimento), dias_devolucao: String(c.dias_uteis_devolucao), retencao: C.pct(c.retencao_pct),
    retencao_valor: C.reais(reter), devolve_depois: C.reais(valor - reter),
    regra_desistencia: REC.regraDaDesistencia(c, valor), texto_conferencia: REC.TEXTO_CONFERENCIA, aviso_desistencia: REC.avisoDaDesistencia(c, valor),
    requisitos: String(f.requisitos || '').split(/\n+/).map((x) => x.trim()).filter(Boolean).map((x) => `- ${x}`).join('\n'),
    link_termo: link && C.dataDeBrasilia(link.vence_em) >= hoje ? link.url : '', link_termo_validade: link ? C.dataBrDe(link.vence_em) : '',
    aceite_data: f.aceite_reserva ? C.dataBrDe(f.aceite_reserva.em) : '',
    desistencia: f.aceite_reserva ? REC.textoDesistencia(f) : '',
    prazo_documentos: f.aceite_reserva && pz ? C.dataBr(pz.documentos_ate) : '',
    // reprovação só com justificativa por escrito (pedido do advogado, 24/11/2026): o motivo da decisão vai no e-mail
    motivo_reprovacao: f.situacao === 'Reprovada' ? String(f.decisao_motivo || '').trim() : '',
    devolver_reserva: dv ? C.reais(dv.devolver) : '', reter_reserva: dv ? C.reais(dv.reter) : '',
  };
}
const condicoesDoTermo = (f) => {
  if (!f) return {};
  const c = R.condicoesDaReserva(f);
  const dv = R.fichaSemContrato(f) ? R.devolucaoDaReserva(f) : null;
  return { retencao: R.retencaoDaReserva(R.valorDaReserva(f), c.retencao_pct) > 0, requisitos: !!String(f.requisitos || '').trim(), link_termo: !!TR.urlDoAceite(f.id),
    termo_aceito: !!f.aceite_reserva, prazo_documentos: !!(f.aceite_reserva && R.prazosDaReserva(f)),
    motivo_reprovacao: f.situacao === 'Reprovada' && !!String(f.decisao_motivo || '').trim(),
    motivo_desistencia: !!(f.desistencia_empresa && String(f.desistencia_motivo_externo || '').trim()),
    // reprovada por informação que não se confirmou conta como desistência: aí não se convida a reapresentar
    pode_reapresentar: f.situacao === 'Reprovada' && !f.reprovada_conferencia,
    ultimo_dia_documentos: (R.avisoDosDocumentos(f) || {}).qual === 'ultimo', retencao_aplicada: !!(dv && !dv.integral), devolve_algo: !!(dv && dv.devolver > 0),
    aviso_desistencia: !!REC.avisoDaDesistencia(c, R.valorDaReserva(f)) };
};

/**
 * Campos do boleto para os e-mails da régua de cobrança (modelos com ``boleto``): põe em ``campos`` e devolve as condições.
 * O valor de hoje (multa e juros) é o do dia em que o e-mail é montado. Ex.: boleto de 11/2026 de R$ 1.350,00 (R$ 1.242,00 em dia)
 * vencido em 10/12/2026, em 16/12 → valor_hoje "R$ 1.380,29" (R$ 1.350,00 + multa R$ 27,00 + juros R$ 3,29), dias_atraso "6".
 */
function camposDoBoleto(d, cb, campos, hoje) {
  const t = R.totais(cb);
  const limite = C.limitePagamento(cb.vencimento);
  const r = C.liquidar(cb, hoje);
  const b = cb.banco && cb.banco.situacao !== 'cancelado' ? cb.banco : {};
  Object.assign(campos, {
    boleto_referente: R.ehParcelaAcordo(cb) ? `da parcela ${cb.acordo_parcela || ''} do acordo`.replace(/ {2,}/g, ' ')
      : R.ehComplementoCaucao(cb) ? 'do complemento da caução' : R.ehSaldoSaida(cb) ? 'do saldo do acerto final' : `do aluguel de ${C.compBr(cb.competencia)}`,
    // e-mail do boleto feito à mão no banco (2026-11-24): o mês de uso e o descritivo, o mesmo da descrição do boleto (lá "1.350,00",
    // sem moeda, para caber nas 100 letras do banco; no e-mail, "R$ 1.350,00" e por extenso)
    competencia_boleto: C.compBr(cb.competencia), descricao_boleto: R.dadosBoleto(d, cb, { moeda: 'R$ ' }).descricao,
    vencimento_boleto: C.dataBr(cb.vencimento), limite_pagamento: C.dataBr(limite),
    valor_em_dia: C.reais(t.a_pagar_pontual), valor_cheio: C.reais(t.a_pagar_sem_desconto),
    multa_pct: C.pct(cb.multa_percentual || 0), juros_pct: C.pct(cb.juros_mensal_percentual || 0),
    valor_hoje: C.reais(r.valor_devido), multa_hoje: C.reais(r.multa || 0), juros_hoje: C.reais(r.juros || 0),
    dias_atraso: String(r.dias_atraso), data_hoje: C.dataBr(hoje),
    pix: b.pix_copia_cola || '', linha_digitavel: b.linha_digitavel || '',
  });
  return { nao_util: limite !== cb.vencimento, bonificacao_boleto: t.a_pagar_pontual < t.a_pagar_sem_desconto, pix: !!b.pix_copia_cola, linha_digitavel: !!b.linha_digitavel,
    multa_juros: !R.semMultaJuros(cb) };
}

/** Valor inicial de cada pergunta do modelo (o que se digita na hora): datas em 'AAAA-MM-DD'. */
function respostasPadrao(d, c, hoje) {
  const reparos = c ? K.resultadoVistoriaSaida(d, c).reparos : [];
  return {
    prazo_assinatura: C.somarDias(hoje, 7),
    opcoes_entrega: c && c.data_entrada ? `${C.dataBr(c.data_entrada)} às 10h` : '',
    data_aviso: hoje,
    // B3: a data e a hora marcadas no roteiro da saída (sem marcar: o dia da saída, às 10h, para a equipe ajustar)
    data_vistoria: c && c.vistoria_saida_data ? `${C.dataBr(c.vistoria_saida_data)}${c.vistoria_saida_hora ? ` às ${c.vistoria_saida_hora}` : ''}` : c && c.data_saida ? `${C.dataBr(c.data_saida)} às 10h` : '',
    // B5: cada pendência com o valor do reparo (orçamento), que entra no acerto final
    pendencias: reparos.length ? reparos.map((x) => `- ${K.textoReparo(x)}`).join('\n') : '- Nenhuma: o imóvel foi devolvido como na vistoria de entrada.',
    ano: String(Number(hoje.slice(0, 4)) - 1),
    prazo: '30 meses',
  };
}

/**
 * Campos e condições de um e-mail. ``alvo``: { contrato } ou { ficha } (registros); ``respostas``: o que foi digitado nas
 * perguntas do modelo (datas em 'AAAA-MM-DD'). Devolve { campos, condicoes, para, perguntas: { campo: valor inicial } }.
 * Ex.: contrato com caução de R$ 6.900,00 → campos.garantia = "caução de R$ 6.900,00 (3 aluguéis com bonificação), ...".
 */
export function dadosDoEmail(d, alvo, respostas = {}, hoje = C.hojeIso()) {
  const c = alvo.contrato || null;
  const f = alvo.ficha || null;
  const p = c || f;
  const pj = p.inquilino_tipo === PJ;
  const imoveis = c ? [R.buscar(d, 'imoveis', c.imovel_id)].filter(Boolean) : (f.imoveis_ids || []).map((id) => R.buscar(d, 'imoveis', id)).filter(Boolean);
  const curto = (i) => [i.endereco, i.complemento].filter(Boolean).join(' – ');
  const completo = (i) => [curto(i), i.bairro, K.cidadeUfDoImovel(d, i, c)].filter(Boolean).join(', ');
  const aluguel = p.aluguel_inicial || 0;
  const pct = p.bonificacao === false ? 0 : (p.desconto_pontualidade_percentual || 0);
  const desconto = aluguel ? C.descontoPorPercentual(aluguel, pct) : 0;
  const tipo = p.garantia_tipo || '';
  const g = condicoesDaGarantia(tipo);
  // na ficha não há valor da caução nem do depósito: o texto sai sem o valor ([se valor_deposito] nos modelos)
  const valorDeposito = c ? (g.caucao ? (c.caucao_valor || (c.caucao_meses || 0) * (aluguel - desconto)) : c.deposito_valor || 0) : 0;
  // só afirma a entrega das chaves (e o prazo da contra-vistoria) com o termo das chaves assinado (2026-11-20)
  const chaves = c ? R.termoDasChavesEm(c) : null;
  // um link por fiador da ficha que tenha link válido nesta aba
  const fiadoresLink = f ? (R.fiadoresDaFicha(f).length ? R.fiadoresDaFicha(f) : [{ n: 1 }]).map((x) => ({ ...x, ...linkDaFicha(f, `fiador${x.n}`, hoje) })).filter((x) => x.url) : [];
  const variosLinks = fiadoresLink.length > 1;
  const linksFiadores = fiadoresLink.map((x) => `${variosLinks && x.nome ? `Link de ${x.nome} (fiador, encaminhe para ele ou ela)` : 'Link do fiador (encaminhe para ele)'}: ${x.url}`).join('\n');
  // contas: do contrato; na ficha, as da proposta (o que está incluso) ou, sem ela, as do último contrato do imóvel
  const fichaDiz = f && CONTAS_FICHA.some((k) => f[k]);
  const base = c || (fichaDiz ? f : d.contratos.filter((x) => imoveis[0] && x.imovel_id === imoveis[0].id).sort((a, b) => String(b.data_entrada || '').localeCompare(String(a.data_entrada || '')))[0] || {});
  const inclusos = CONTAS_FICHA.filter((k) => base[k] === 'Incluso no aluguel').map((k) => NOMES_CONTA[k]);
  const doImovel = c || { imovel_id: imoveis[0] ? imoveis[0].id : null };
  const contas = contasDoInquilino(d, base, doImovel, imoveis[0]);
  const e = c ? R.encerramentoDo(d, c.id) : null;
  // boleto do saldo da saída (2026-11-20): o e-mail do acerto final diz "Segue o boleto do saldo" quando ele existe e está em aberto
  const bs = e && e.saldo < 0 ? R.boletoDoSaldo(d, e) : null;
  const boletoSaldo = bs && !bs.data_pagamento ? bs : null;
  const fim = c ? R.fimDoContrato(d, c) : null;
  const inicio = c ? (c.data_entrada || c.vigencia_inicio) : null;
  const r = { ...respostasPadrao(d, c, hoje), ...(f && f.prazo_meses ? { prazo: `${f.prazo_meses} meses` } : {}), ...Object.fromEntries(Object.entries(respostas).filter(([, v]) => v !== undefined && v !== null && v !== '')) };
  const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? C.dataBr(v) : v);
  const ano = /^\d{4}$/.test(String(r.ano)) ? Number(r.ano) : Number(hoje.slice(0, 4)) - 1;
  const campos = {
    nome: primeiroNome(pj ? p.representante_nome || p.inquilino_nome : p.inquilino_nome),
    locatario: p.inquilino_nome || '', documento: p.inquilino_cpf ? `${pj ? 'CNPJ' : 'CPF'} ${p.inquilino_cpf}` : '',
    imovel: imoveis.map(curto).join(' ou '), endereco: imoveis.map(completo).join(' ou '),
    aluguel: aluguel ? C.reais(aluguel) : '', aluguel_bonificado: aluguel ? C.reais(aluguel - desconto) : '', bonificacao: desconto ? C.reais(desconto) : '',
    vencimento: String(p.dia_vencimento || ''), garantia: textoGarantia(tipo, valorDeposito, c ? c.caucao_meses : 0),
    tipo_deposito: g.caucao ? 'caução' : 'depósito de garantia', valor_deposito: valorDeposito ? C.reais(valorDeposito) : '',
    prazo: c ? (c.prazo_tipo === 'Indeterminado' ? 'prazo indeterminado' : `${R.prazoDoContrato(d, c) || c.prazo_meses || ''} meses`) : r.prazo,
    inicio: inicio ? C.dataBr(inicio) : '', fim: fim ? C.dataBr(fim) : '', indice: c ? (c.indice_correcao || '') : '',
    reserva: p.reserva_valor > 0 ? C.reais(p.reserva_valor) : '', reserva_data: p.reserva_data ? C.dataBr(p.reserva_data) : '',
    contas_texto: juntar(contas.map((x) => x[0])), contas_concessionarias: juntar(contas.map((x) => x[1])),
    primeiro_boleto: c ? primeiroBoleto(d, c) : '', data_chaves: chaves ? C.dataBr(chaves) : '',
    data_limite_vistoria: chaves ? C.dataBr(C.limiteVistoriaEntrada(chaves)) : '',
    data_saida: c && c.data_saida ? C.dataBr(c.data_saida) : '', ano_saida: c && c.data_saida ? c.data_saida.slice(0, 4) : String(Number(hoje.slice(0, 4))),
    boleto_saldo_vencimento: boletoSaldo ? C.dataBr(boletoSaldo.vencimento) : '',
    boleto_saldo_linha: boletoSaldo && boletoSaldo.banco && R.emitidoNoBanco(boletoSaldo) ? boletoSaldo.banco.linha_digitavel || '' : '',
    boleto_saldo_pix: boletoSaldo && boletoSaldo.banco && R.emitidoNoBanco(boletoSaldo) ? boletoSaldo.banco.pix_copia_cola || '' : '',
    acerto: textoAcerto(e), saldo: e ? C.reais(Math.abs(e.saldo || 0)) : '', data_devolucao: e && e.garantia_devolvida_em ? C.dataBr(e.garantia_devolvida_em) : '',
    informe: c ? textoInforme(d, c, ano) : '',
    prazo_assinatura: data(r.prazo_assinatura), opcoes_entrega: r.opcoes_entrega, data_aviso: data(r.data_aviso), data_vistoria: r.data_vistoria,
    pendencias: r.pendencias, ano: String(ano),
    inclusos: juntar(inclusos), iptu_valor: f && f.iptu_estimado > 0 ? C.reais(f.iptu_estimado) : '', seguro_valor: f && f.seguro_estimado > 0 ? C.reais(f.seguro_estimado) : '',
    devolucao: f && f.devolucao_data ? C.reais(f.devolucao_valor || f.reserva_valor) : '', devolucao_data: f && f.devolucao_data ? C.dataBr(f.devolucao_data) : '',
    // devolução de só uma parte da reserva: a diferença (o e-mail não diz "sem valores pendentes")
    // a empresa desistiu: quitação total com o valor devolvido (dono, 25/11/2026), sem "não foi devolvido"
    devolucao_parcial: f && !f.desistencia_empresa && f.devolucao_data && f.devolucao_valor > 0 && f.devolucao_valor < f.reserva_valor ? C.reais(f.reserva_valor - f.devolucao_valor) : '',
    motivo_desistencia: f && f.desistencia_empresa ? String(f.desistencia_motivo_externo || '').trim() : '',
    documentos_ficha: f ? documentosDoEmail(f) : '',
    link: linkDaFicha(f, 'interessado', hoje).url, link_validade: linkDaFicha(f, 'interessado', hoje).validade,
    link_fiador: fiadoresLink.length ? fiadoresLink[0].url : '', links_fiadores: linksFiadores,
    conta_deposito: K.dadoDaEmpresa(d, doImovel, 'conta_deposito'),
    ...camposDoTermo(f, hoje),
  };
  const condicoes = {
    ...g, pj, bonificacao: desconto > 0, reserva: p.reserva_valor > 0, contas: contas.length > 0,
    iptu: c ? (c.conta_iptu === 'Por conta do inquilino' || !!c.cobrar_iptu) : (!f.conta_iptu || f.conta_iptu === 'Por conta do inquilino'),
    seguro_incendio: c ? c.conta_seguro === 'Por conta do inquilino' : (!f.conta_seguro || f.conta_seguro === 'Por conta do inquilino'),
    inclusos: inclusos.length > 0, iptu_valor: !!(f && f.iptu_estimado > 0), seguro_valor: !!(f && f.seguro_estimado > 0),
    saida_antecipada: !!(c && c.data_saida && c.prazo_tipo !== 'Indeterminado' && fim && c.data_saida < fim),
    devolver: !!(e && e.saldo > 0), cobrar: !!(e && e.saldo < 0), boleto_saldo: !!boletoSaldo,
    // saldo do cálculo final ainda não devolvido nem pago (24/11/2026): o e-mail do encerramento não diz "Não há valores pendentes".
    // Ex.: débitos de R$ 3.070,60 e caução de R$ 1.800,00 → saldo −R$ 1.270,60, sem pagamento marcado → true
    saldo_pendente: !!(e && Number.isFinite(e.saldo) && e.saldo !== 0 && !e.garantia_devolvida_em),
    boleto_saldo_linha: !!(boletoSaldo && boletoSaldo.banco && R.emitidoNoBanco(boletoSaldo) && boletoSaldo.banco.linha_digitavel),
    boleto_saldo_pix: !!(boletoSaldo && boletoSaldo.banco && R.emitidoNoBanco(boletoSaldo) && boletoSaldo.banco.pix_copia_cola),
    link: !!linkDaFicha(f, 'interessado', hoje).url, link_fiador: fiadoresLink.length > 0,
    garantia_depositada: !!c && REC.reciboDisponivel(d, 'garantia', { contrato: c }).ok,
    varios_fiadores: !!f && R.fiadoresDaFicha(f).length > 1,
    devolucao: !!(f && f.devolucao_data),
    ...condicoesDoTermo(f),
  };
  if (alvo.cobranca) Object.assign(condicoes, camposDoBoleto(d, alvo.cobranca, campos, hoje));
  const a = alvo.aditivo || null;
  if (a) Object.assign(campos, { aditivo_data: C.dataBr(a.data), aditivo_assunto: a.assunto || 'alteração do contrato' });
  // termo do novo valor negociado: os valores combinados (cheio, bonificado) e a data em que passam a valer
  if (a && a.valor_novo > 0) {
    Object.assign(campos, { valor_anterior: C.reais(a.valor_anterior || 0), valor_novo: C.reais(a.valor_novo), novo_inicio: C.dataBr(a.data_vigencia),
      novo_bonificado: C.reais(a.valor_novo - C.descontoPorPercentual(a.valor_novo, a.percentual || 0)) });
    condicoes.novo_bonificacao = (a.percentual || 0) > 0;
  }
  // notificação ao inquilino (2026-11-17): a data, o assunto, o prazo e a data limite (o lembrete diz se vence hoje)
  const n = alvo.notificacao || null;
  if (n) {
    const numero = R.numeroDaNotificacao(d, n);
    Object.assign(campos, { notificacao_data: C.dataBr(n.data), notificacao_assunto: n.assunto || '', notificacao_assunto_minusculo: String(n.assunto || '').toLocaleLowerCase('pt-BR'),
      notificacao_numero: `${numero}ª`, prazo_notificacao: NT.prazoPorExtenso(n.prazo_dias), data_limite: C.dataBr(n.data_limite) });
    Object.assign(condicoes, { reiteracao: numero > 1, vence_hoje: n.data_limite === hoje, atraso: R.ehNotificacaoAtraso(n) });
  }
  // quem assina o fecho e o e-mail da administração: do cadastro da empresa (Empresas)
  const remetente = { assinatura: K.dadoDaEmpresa(d, doImovel, 'assinatura_email') || (K.locadorasDoContrato(d, doImovel)[0] || {}).nome || '',
    email: K.dadoDaEmpresa(d, doImovel, 'email_contato') };
  return { campos, condicoes, para: p.inquilino_email || '', perguntas: r, remetente };
}

/**
 * Anexos que o sistema junta sozinho ao e-mail (``prontos`` do modelo): o recibo ou termo (PDF gerado de recibos.js) e os
 * comprovantes do banco guardados na pasta. Cada item: { tipo: 'recibo', recibo, rotulo, ok, motivo } ou
 * { tipo: 'arquivo', escopo, id, nome, rotulo }. Comprovante que não foi anexado no sistema não entra (e o recibo diz o motivo).
 * Ex.: ficha com reserva paga e comprovante → [recibo da reserva, "comprovante da reserva (comprovante-reserva-2026-11-10.pdf)"].
 */
export function anexosProntos(d, modelo, alvo) {
  const f = alvo.ficha || null;
  const c = alvo.contrato || null;
  const out = [];
  const arquivo = (escopo, id, nome, rotulo) => { if (nome && id) out.push({ tipo: 'arquivo', escopo, id, nome, rotulo: `${rotulo} (${nome})` }); };
  // comprovante guardado no contrato: pode estar na pasta do contrato anterior (troca de titular, campo_contrato)
  const doContrato = (campo, rotulo) => arquivo('contrato', c[`${campo}_contrato`] || c.id, c[campo], rotulo);
  for (const item of modelo.prontos || []) {
    const [tipo, qual] = item.split(':');
    if (tipo === 'assinado') {
      // documento assinado por todos (só o completo: com assinatura faltante não vai)
      if (qual === 'aditivo') {
        const a = alvo.aditivo || null;
        if (a && a.arquivo) arquivo('aditivos', a.contrato_id, a.arquivo, `termo aditivo de ${C.dataBr(a.data)} assinado por todos`);
      } else if (qual === 'chaves_saida' && c) {
        arquivo('contrato', c.id, c.termo_chaves_saida, 'termo de devolução das chaves assinado');
      } else if (qual === 'quitacao' && c) {
        const e = R.encerramentoDo(d, c.id);
        if (e) arquivo('contrato', c.id, e.termo_assinado, 'termo de quitação assinado por todos');
      } else if (c) {
        const campo = `${qual}_em`;
        const doc = R.documentoEntrada(d, c, campo);
        const nome = (R.DOCUMENTOS_ENTRADA.find(([k]) => k === campo) || [])[1] || 'documento';
        if (doc && doc.arquivo) arquivo('assinados', doc.contrato.id, doc.arquivo, `${nome.toLowerCase()} assinado por todos`);
      }
      continue;
    }
    if (tipo === 'digital') {
      // contrato e termo aditivo assinados digitalmente pela empresa (2026-11-24): o PDF vem da fila da assinatura na hora de
      // abrir o e-mail (telas/emails.js, assinadosDaFila); sem a versão assinada, sai da lista (anexa-se à mão, como antes)
      const a = qual === 'aditivo' ? alvo.aditivo || null : null;
      if (!R.regra('assinatura_digital') || !c || (qual === 'aditivo' && !a)) continue;
      out.push({ tipo: 'digital', doc: qual, contrato: c.id, ...(a ? { id: a.id } : {}), ok: true, motivo: '',
        rotulo: a ? `termo aditivo de ${C.dataBr(a.data)} assinado digitalmente pela empresa` : 'contrato assinado digitalmente pela empresa' });
      continue;
    }
    if (tipo === 'notificacao') {
      // a notificação assinada (anexada na notificação); sem ela, o PDF para assinar que o sistema monta
      const n = alvo.notificacao || null;
      if (!n) continue;
      if (n.arquivo_assinado) arquivo('contrato', n.contrato_id, n.arquivo_assinado, `notificação de ${C.dataBr(n.data)} assinada`);
      else {
        const disp = REC.reciboDisponivel(d, 'notificacao', alvo);
        // com a assinatura digital ligada, vai o PDF assinado pelo PC (reciboParaEnviar, telas/emails.js), não o sem assinatura
        const comoVai = R.regra('assinatura_digital') ? 'assinada digitalmente pelo PC' : 'sem a assinatura: anexe a assinada na notificação';
        out.push({ tipo: 'recibo', recibo: 'notificacao', rotulo: `${REC.TIPOS_RECIBO.notificacao} de ${C.dataBr(n.data)} (${comoVai})`, ok: disp.ok, motivo: disp.motivo || '', alvo });
      }
      continue;
    }
    if (tipo === 'boleto' && qual === 'anexado') {
      // PDF do boleto emitido à mão no banco, anexado na página do boleto (2026-11-24)
      const cb = alvo.cobranca;
      if (cb && cb.boleto_pdf) arquivo('contrato', R.pastaDoBoletoPdf(cb), cb.boleto_pdf, 'boleto emitido no banco');
      continue;
    }
    if (tipo === 'boleto') {
      // régua de cobrança: o PDF do boleto vem do C6 pela ponte na hora de enviar; o QR Code do Pix já está guardado no boleto
      // e-mail do acerto final: o boleto do saldo da saída (2026-11-20), quando existe e está em aberto
      const saldo = !alvo.cobranca && c ? R.boletoDoSaldo(d, R.encerramentoDo(d, c.id)) : null;
      const cb = alvo.cobranca || (saldo && !saldo.data_pagamento ? saldo : null);
      const b = cb && cb.banco;
      if (!b || !R.emitidoNoBanco(cb)) continue;
      if (qual === 'pdf' && b.id_externo && !b.simulado) out.push({ tipo: 'boleto', qual, id: cb.id, nome: `boleto-${cb.competencia}.pdf`, rotulo: 'boleto do C6 (PDF)' });
      if (qual === 'pix' && b.pix_qr_base64) out.push({ tipo: 'boleto', qual, id: cb.id, nome: `pix-${cb.competencia}.png`, rotulo: 'QR Code do Pix (imagem)' });
      continue;
    }
    if (tipo === 'recibo' && qual === 'ficha_fiador') {
      // uma ficha para cada fiador preenchido (fiador na garantia sem nome ainda: uma em branco)
      if (!f || !REC.reciboDisponivel(d, qual, alvo).ok) continue;
      const fiadores = R.fiadoresDaFicha(f);
      for (const x of fiadores.length ? fiadores : [{ n: 1 }]) out.push({ tipo: 'recibo', recibo: qual, rotulo: `${REC.TIPOS_RECIBO[qual]}${x.nome ? ` (${x.nome})` : ''}`, ok: true, motivo: '', alvo: { ...alvo, fiador: x.n } });
    } else if (tipo === 'recibo') {
      const disp = REC.reciboDisponivel(d, qual, alvo);
      out.push({ tipo: 'recibo', recibo: qual, rotulo: REC.TIPOS_RECIBO[qual], ok: disp.ok, motivo: disp.motivo || '' });
    } else if (qual === 'reserva') {
      if (f) arquivo(f.documentos_no_contrato ? 'contrato' : 'ficha', f.documentos_no_contrato || f.id, f.comprovante_reserva, 'comprovante da reserva');
      else if (c) doContrato('comprovante_reserva', 'comprovante da reserva');
    } else if (qual === 'devolucao' && f) {
      arquivo(f.documentos_no_contrato ? 'contrato' : 'ficha', f.documentos_no_contrato || f.id, f.comprovante_devolucao, 'comprovante da devolução da reserva');
    } else if (qual === 'garantia' && c) {
      const g = R.temCaucao(c) ? 'caucao' : R.temDeposito(c) ? 'deposito' : null;
      if (!g) continue;
      const deps = R.depositosGarantiaDo(d, c, g).filter((x) => x.comprovante);
      if (deps.length) deps.forEach((x) => arquivo('contrato', x.contrato_id, x.comprovante, `comprovante do depósito de ${C.dataBr(x.data)}`));
      else doContrato(g === 'caucao' ? 'comprovante_caucao' : 'comprovante_deposito', `comprovante da ${g === 'caucao' ? 'caução' : 'garantia'}`);
    } else if (qual === 'saida' && c) {
      const e = R.encerramentoDo(d, c.id);
      if (e) arquivo('contrato', c.id, e.comprovante, `comprovante ${e.saldo > 0 ? 'da devolução' : 'do pagamento'} do saldo`);
    }
  }
  return out;
}

/**
 * Aviso do PDF do boleto feito à mão no banco que ficou velho (o boleto mudou depois de anexado: ``R.boletoPdfDesatualizado``),
 * o mesmo do "Enviar boleto por e-mail" e dos lembretes da régua (decisão do dono de 24/11/2026, DOC-05); '' se está em dia.
 * Ex.: anexado com R$ 2.000,00 e o valor passou a R$ 2.100,00 → "O boleto mudou depois que o PDF do banco foi anexado: o valor era…".
 */
export function avisoBoletoPdfDesatualizado(cb) {
  const mudou = cb ? R.boletoPdfDesatualizado(cb) : '';
  return mudou ? `O boleto mudou depois que o PDF do banco foi anexado: ${mudou}. O PDF anexado pode estar com o valor antigo.` : '';
}

/**
 * Informe anual do IR (pedido do dono em 2026-11-12: todo ano, a todos os inquilinos com NF): de 01/02 a 31/03, os inquilinos
 * com NF de aluguel emitida no ano anterior que ainda não receberam o e-mail do informe neste ano (aberto ou enviado).
 * Uma passada pelas NFs (sem declaracaoAnual por contrato, que seria lento no Painel). Ex.: em 10/02/2027 → NFs de 2026.
 */
export function informesPendentes(d, hoje = C.hojeIso()) {
  const mes = Number(hoje.slice(5, 7));
  if (mes < 2 || mes > 3) return { ano: null, contratos: [] };
  const ano = String(Number(hoje.slice(0, 4)) - 1);
  const contratoDoBoleto = new Map(d.cobrancas.map((x) => [x.id, x.contrato_id]));
  const ids = new Set();
  for (const f of d.faturas) {
    if (f.situacao === 'Emitida' && f.origem_tipo === 'cobranca' && String(f.emissao).slice(0, 4) === ano && contratoDoBoleto.has(f.origem_id)) ids.add(contratoDoBoleto.get(f.origem_id));
  }
  const avisados = new Set((d.envios_email || []).filter((x) => x.chave === 'informe_ir' && String(x.data) >= `${hoje.slice(0, 4)}-01-01`).map((x) => x.contrato_id));
  const contratos = [...ids].filter((id) => !avisados.has(id)).map((id) => R.buscar(d, 'contratos', id)).filter(Boolean)
    .sort((a, b) => String(a.inquilino_nome).localeCompare(String(b.inquilino_nome), 'pt-BR'));
  return { ano: Number(ano), contratos };
}
