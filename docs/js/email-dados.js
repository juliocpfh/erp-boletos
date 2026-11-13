// Dados dos e-mails por etapa: campos e condições que os modelos (modelos-email.js) usam, a partir do contrato ou da ficha.
// Funções puras (rodam no Node, tests/emails.test.mjs). Valores em centavos viram "R$ 1.234,56"; datas viram "dd/mm/aaaa".
import * as C from './calculos.js';
import * as K from './contratos.js';
import { MODELOS_EMAIL } from './modelos-email.js';
import * as REC from './recibos.js';
import * as R from './regras.js';

const PJ = 'Pessoa jurídica (empresa)';
const NOMES_CONTA = { conta_agua: 'água', conta_energia: 'energia', conta_gas: 'gás', conta_internet: 'internet', conta_condominio: 'condomínio' };
const CONTAS_FICHA = Object.keys(NOMES_CONTA);
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const juntar = (itens) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`);

/** Contas que passam para o nome do inquilino: água e energia (salvo incluso ou não tem); gás quando por conta dele. */
function contasDoInquilino(c) {
  const fora = (k) => ['Incluso no aluguel', 'Não tem'].includes(c[k]);
  const out = [];
  if (!fora('conta_agua')) out.push(['água', 'água (Sanepar)']);
  if (!fora('conta_energia')) out.push(['energia', 'energia (Copel)']);
  if (c.conta_gas === 'Por conta do inquilino') out.push(['gás', 'gás']);
  return out;
}

/** Texto da garantia. Ex.: "caução de R$ 6.900,00 (3 aluguéis com bonificação), aplicada em poupança e devolvida corrigida...". */
function textoGarantia(tipo, valor, meses) {
  if (tipo === 'Caução') return `caução de ${valor ? C.reais(valor) : 'até 3 aluguéis'}${valor && meses ? ` (${meses} aluguéis com bonificação)` : ''}, aplicada em poupança e devolvida corrigida no fim do contrato, descontados eventuais débitos`;
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

/** Linhas do acerto final (cálculo da saída). Ex.: "Caução corrigida: R$ 6.985,10 · (-) Débitos: R$ 1.951,98 · = Saldo a devolver: R$ 5.033,12". */
function textoAcerto(e) {
  if (!e) return '';
  const l = [];
  if (e.garantia_valor > 0) l.push(`Garantia depositada: ${C.reais(e.garantia_valor)}`, `Garantia corrigida até ${C.dataBr(e.data_saida)}: ${C.reais(e.garantia_corrigida || e.garantia_valor)}`);
  if (e.fci_credito) l.push(`FCI corrigido: ${C.reais(e.fci_credito)}`);
  l.push(`(-) Débitos: ${C.reais(e.debitos || 0)}`);
  if (e.debitos_descricao) l.push(...String(e.debitos_descricao).split(/\n+/).filter(Boolean).map((x) => `   ${x.trim()}`));
  l.push(`= Saldo ${e.saldo >= 0 ? 'a devolver' : 'a pagar'}: ${C.reais(Math.abs(e.saldo || 0))}`);
  return l.join('\n');
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

/** Valor inicial de cada pergunta do modelo (o que se digita na hora): datas em 'AAAA-MM-DD'. */
function respostasPadrao(d, c, hoje) {
  const pend = c ? K.resultadoVistoriaSaida(d, c).pendencias : [];
  return {
    prazo_assinatura: C.somarDias(hoje, 7),
    opcoes_entrega: c && c.data_entrada ? `${C.dataBr(c.data_entrada)} às 10h` : '',
    data_aviso: hoje,
    data_vistoria: c && c.data_saida ? `${C.dataBr(c.data_saida)} às 10h` : '',
    pendencias: pend.length ? pend.map((x) => `- ${x}`).join('\n') : '- Nenhuma: o imóvel foi devolvido como na vistoria de entrada.',
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
  const completo = (i) => [curto(i), i.bairro, i.cidade ? `${i.cidade}/${i.uf || 'PR'}` : ''].filter(Boolean).join(', ');
  const aluguel = p.aluguel_inicial || 0;
  const pct = p.bonificacao === false ? 0 : (p.desconto_pontualidade_percentual || 0);
  const desconto = aluguel ? C.descontoPorPercentual(aluguel, pct) : 0;
  const tipo = p.garantia_tipo || '';
  const g = condicoesDaGarantia(tipo);
  const valorDeposito = c ? (g.caucao ? (c.caucao_valor || (c.caucao_meses || 0) * (aluguel - desconto)) : c.deposito_valor || 0) : 0;
  // contas: do contrato; na ficha, as da proposta (o que está incluso) ou, sem ela, as do último contrato do imóvel
  const fichaDiz = f && CONTAS_FICHA.some((k) => f[k]);
  const base = c || (fichaDiz ? f : d.contratos.filter((x) => imoveis[0] && x.imovel_id === imoveis[0].id).sort((a, b) => String(b.data_entrada || '').localeCompare(String(a.data_entrada || '')))[0] || {});
  const inclusos = CONTAS_FICHA.filter((k) => base[k] === 'Incluso no aluguel').map((k) => NOMES_CONTA[k]);
  const contas = contasDoInquilino(base);
  const e = c ? R.encerramentoDo(d, c.id) : null;
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
    primeiro_boleto: c ? primeiroBoleto(d, c) : '', data_chaves: inicio ? C.dataBr(inicio) : '',
    data_limite_vistoria: inicio ? C.dataBr(C.limiteVistoriaEntrada(inicio)) : '',
    data_saida: c && c.data_saida ? C.dataBr(c.data_saida) : '', ano_saida: c && c.data_saida ? c.data_saida.slice(0, 4) : String(Number(hoje.slice(0, 4))),
    acerto: textoAcerto(e), saldo: e ? C.reais(Math.abs(e.saldo || 0)) : '', data_devolucao: e && e.garantia_devolvida_em ? C.dataBr(e.garantia_devolvida_em) : '',
    informe: c ? textoInforme(d, c, ano) : '',
    prazo_assinatura: data(r.prazo_assinatura), opcoes_entrega: r.opcoes_entrega, data_aviso: data(r.data_aviso), data_vistoria: r.data_vistoria,
    pendencias: r.pendencias, ano: String(ano),
    inclusos: juntar(inclusos), iptu_valor: f && f.iptu_estimado > 0 ? C.reais(f.iptu_estimado) : '', seguro_valor: f && f.seguro_estimado > 0 ? C.reais(f.seguro_estimado) : '',
    devolucao: f && f.devolucao_data ? C.reais(f.devolucao_valor || f.reserva_valor) : '', devolucao_data: f && f.devolucao_data ? C.dataBr(f.devolucao_data) : '',
  };
  const condicoes = {
    ...g, pj, bonificacao: desconto > 0, reserva: p.reserva_valor > 0, contas: contas.length > 0,
    iptu: c ? (c.conta_iptu === 'Por conta do inquilino' || !!c.cobrar_iptu) : (!f.conta_iptu || f.conta_iptu === 'Por conta do inquilino'),
    seguro_incendio: c ? c.conta_seguro === 'Por conta do inquilino' : (!f.conta_seguro || f.conta_seguro === 'Por conta do inquilino'),
    inclusos: inclusos.length > 0, iptu_valor: !!(f && f.iptu_estimado > 0), seguro_valor: !!(f && f.seguro_estimado > 0),
    saida_antecipada: !!(c && c.data_saida && c.prazo_tipo !== 'Indeterminado' && fim && c.data_saida < fim),
    devolver: !!(e && e.saldo > 0), cobrar: !!(e && e.saldo < 0),
  };
  return { campos, condicoes, para: p.inquilino_email || '', perguntas: r };
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
    if (tipo === 'recibo') {
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

/** Modelos de uma etapa do sistema (ficha, entrada, saída, anual), na ordem. */
export const modelosDaEtapa = (etapa) => MODELOS_EMAIL.filter((m) => m.etapa === etapa);

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
