// Régua de cobrança por e-mail (pedido do dono em 2026-11-16: nada é enviado sem a autorização dele). Funções puras
// (tests/regua-email.test.mjs): a fila "Aguardando sua autorização" é calculada na hora, pelos boletos em aberto e pelos dias da
// regra `regua_email_dias`; o que já foi enviado, aberto no Gmail ou marcado "Não enviar" fica na tabela `regua_emails` (um registro
// por boleto e etapa) e não volta. Nada aqui grava sozinho nem envia: a tela (telas/regua.js) mostra, o administrador autoriza.
// Texto: modelos `cobranca_antes`, `cobranca_dia` e `cobranca_atraso` (modelos-email.js), preenchidos por email-dados.js.
import * as C from './calculos.js';
import { diasCompensacaoBoleto } from './conciliacao.js';
import * as CR from './config-regras.js';
import { regra } from './config-regras.js';
import * as R from './regras.js';

/** A última etapa (a de mais dias de atraso) fica na lista por este número de dias; depois, o caso é da tela Inadimplência. */
export const JANELA_ULTIMA_ETAPA = 30;
/** Entrada do extrato ainda sem destino com o valor do boleto, nestes dias antes do vencimento ou depois: pode ser o pagamento. */
const DIAS_ENTRADA_ANTES = 45;

/** Modelo de e-mail de cada etapa: antes do vencimento, no dia ou em atraso. */
export const modeloDaEtapa = (dias) => (dias < 0 ? 'cobranca_antes' : dias === 0 ? 'cobranca_dia' : 'cobranca_atraso');
/** Nome da etapa para a tela. Ex.: -3 → "3 dia(s) antes do vencimento"; 0 → "no dia do vencimento"; 10 → "10 dia(s) de atraso". */
export const nomeDaEtapa = (dias) => (dias < 0 ? `${-dias} dia(s) antes do vencimento` : dias === 0 ? 'no dia do vencimento' : `${dias} dia(s) de atraso`);

/**
 * Primeiro dia em que a cobrança de atraso pode sair: passados os dias úteis que o banco leva para creditar o boleto pago pelo
 * código de barras no último dia (decisão do dono, 16/11/2026: dentro desse prazo não é atraso), o número da regra
 * `tolerancia_boleto_dias` (decisão de 24/11/2026; padrão 3). Ex.: com 3, vence qui 10/12/2026 → o crédito pode chegar até
 * ter 15/12 → a cobrança só aparece a partir de qua 16/12.
 */
export const inicioDaCobranca = (cb) => C.somarDiasUteis(C.limitePagamento(cb.vencimento), diasCompensacaoBoleto(cb) + 1);

/**
 * Dia em que o e-mail da etapa fica pronto. Antes: contado do vencimento (-3 → 07/12 para o vencimento de 10/12); no dia: o último
 * dia para pagar em dia (vencimento no sábado → segunda-feira); em atraso: contado do vencimento, nunca antes de ``inicioDaCobranca``
 * (+3 com vencimento em 10/12/2026 → 16/12, e não 13/12).
 */
export function dataDaEtapa(cb, dias) {
  if (dias < 0) return C.somarDias(cb.vencimento, dias);
  if (dias === 0) return C.limitePagamento(cb.vencimento);
  const data = C.somarDias(cb.vencimento, dias);
  const inicio = inicioDaCobranca(cb);
  return data > inicio ? data : inicio;
}

/**
 * Etapa do boleto hoje (o número de dias da regra) ou null. Vale a última etapa já chegada; a anterior não decidida some (não se
 * manda "vence hoje" depois do vencimento). Antes: só até a véspera do último dia para pagar; no dia: só nesse dia; atraso: até a
 * próxima etapa (a última, por JANELA_ULTIMA_ETAPA dias). Ex.: régua -3, 0, 3, 10 e vencimento qui 10/12/2026: 08/12 → -3;
 * 10/12 → 0; 11/12 a 15/12 → nenhuma (prazo do banco); 16/12 a 19/12 → 3; 20/12 a 19/01/2027 → 10.
 */
export function etapaDoBoleto(cb, hoje, dias = regra('regua_email_dias', cb) || []) {
  const limite = C.limitePagamento(cb.vencimento);
  const etapas = [...dias].sort((a, b) => a - b).map((n) => ({ n, data: dataDaEtapa(cb, n) }));
  let k = -1;
  for (let i = 0; i < etapas.length; i += 1) if (etapas[i].data <= hoje) k = i;
  if (k < 0) return null;
  const { n, data } = etapas[k];
  if (n < 0 && hoje >= limite) return null;
  if (n === 0 && hoje !== limite) return null;
  if (n > 0 && k === etapas.length - 1 && hoje > C.somarDias(data, JANELA_ULTIMA_ETAPA)) return null;
  return n;
}

/** Registro da decisão já tomada para o boleto e a etapa (enviado, aberto no Gmail ou "Não enviar"), ou null. */
export const decisaoDe = (d, cobrancaId, dias) => (d.regua_emails || []).find((x) => x.cobranca_id === cobrancaId && x.dias === dias) || null;

/** O que cada situação quer dizer, para a tela. */
export const SITUACOES_REGUA = { enviado: 'Enviado pelo sistema', gmail: 'Aberto no Gmail (enviado à mão)', recusado: 'Não enviar' };

/**
 * Fila "Aguardando sua autorização": um e-mail por boleto a cobrar (fora complemento da caução, em acordo, pago, carência e
 * contrato encerrado), na etapa de hoje (``etapaDoBoleto``), se ainda não foi decidido. Cada item: { chave ('id|dias'), cobranca,
 * contrato, imovel, dias, etapa, modelo, desde, para, valor (o de hoje: em dia antes do vencimento, com multa e juros depois),
 * avisos: [texto] }. Avisa entrada do extrato ainda sem destino com o valor do boleto (pode ser o pagamento: confira antes).
 * Ex.: boleto de 11/2026 vencendo em 10/12/2026, em 08/12 → { dias: -3, etapa: '3 dia(s) antes do vencimento', modelo: 'cobranca_antes' }.
 */
export function filaRegua(d, hoje = C.hojeIso()) {
  // dias de todas as regras em uso (sistema e regras especiais): a janela cobre todas; cada boleto usa as do contrato dele
  const dias = CR.valoresEmUso('regua_email_dias').flat();
  if (!dias.length) return [];
  const menor = Math.min(...dias);
  const maior = Math.max(...dias);
  // fora destes vencimentos nenhuma etapa vale hoje (folga de 15 dias para fins de semana, feriados e o prazo do banco)
  const vencDe = C.somarDias(hoje, -(Math.max(maior, 0) + JANELA_ULTIMA_ETAPA + 15));
  const vencAte = C.somarDias(hoje, Math.max(-menor, 0) + 1);
  const decididos = new Set((d.regua_emails || []).map((x) => `${x.cobranca_id}|${x.dias}`));
  const entradas = (d.movimentacoes_banco || []).filter((m) => m.tipo === 'entrada' && !m.classificacao && m.data >= C.somarDias(vencDe, -DIAS_ENTRADA_ANTES));
  const out = [];
  for (const cb of d.cobrancas) {
    if (!cb.vencimento || cb.vencimento < vencDe || cb.vencimento > vencAte) continue;
    if (!R.aCobrar(cb) || R.ehComplementoCaucao(cb)) continue;
    // o banco já recebeu (falta só registrar aqui) ou o boleto foi cancelado no banco: não se cobra
    if (cb.banco && ['pago', 'cancelado'].includes(cb.banco.situacao)) continue;
    const t = R.totais(cb);
    if (!(t.a_pagar_pontual > 0)) continue;
    const n = etapaDoBoleto(cb, hoje);
    if (n === null || decididos.has(`${cb.id}|${n}`)) continue;
    if (n > 0 && R.aguardandoCredito(cb)) continue; // pagou, o banco ainda não creditou
    const c = R.buscar(d, 'contratos', cb.contrato_id);
    if (!c || R.contratoEncerrado(d, c)) continue;
    const valor = n > 0 ? C.liquidar(cb, hoje).valor_devido : t.a_pagar_pontual;
    const avisos = [];
    if (!c.inquilino_email) avisos.push('Sem e-mail no cadastro do inquilino: cadastre o e-mail para mandar.');
    const pagamento = entradas.find((m) => m.data >= C.somarDias(cb.vencimento, -DIAS_ENTRADA_ANTES)
      && [t.a_pagar_pontual, t.a_pagar_sem_desconto, C.liquidar(cb, m.data).valor_devido].includes(m.valor));
    if (pagamento) avisos.push(`No extrato há uma entrada de ${C.reais(pagamento.valor)} em ${C.dataBr(pagamento.data)} ainda sem destino: pode ser este pagamento. Confira na tela Banco antes de mandar.`);
    out.push({ chave: `${cb.id}|${n}`, cobranca: cb, contrato: c, imovel: R.buscar(d, 'imoveis', c.imovel_id), dias: n, etapa: nomeDaEtapa(n), modelo: modeloDaEtapa(n),
      desde: dataDaEtapa(cb, n), para: c.inquilino_email || '', valor, avisos });
  }
  return out.sort((a, b) => a.cobranca.vencimento.localeCompare(b.cobranca.vencimento) || String(a.contrato.inquilino_nome).localeCompare(String(b.contrato.inquilino_nome), 'pt-BR'));
}

/** Item da fila pela chave 'id|dias' (ou null: já foi pago, decidido ou a etapa passou). */
export const itemDaFila = (d, chave, hoje = C.hojeIso()) => filaRegua(d, hoje).find((x) => x.chave === chave) || null;

/**
 * Grava a decisão do administrador sobre um e-mail da fila: 'enviado' (pelo sistema), 'gmail' (aberto no Gmail para mandar à mão) ou
 * 'recusado' ("Não enviar"). Recusa repetir: o mesmo boleto e etapa decididos duas vezes (outra aba, outro aparelho) dá erro.
 */
export function registrarDecisao(d, { cobranca_id, contrato_id, dias, situacao, para = '', assunto = '', envio_id = null }, usuario, hoje = C.hojeIso()) {
  if (!SITUACOES_REGUA[situacao]) throw new Error(`Situação desconhecida: ${situacao}`);
  const ja = decisaoDe(d, cobranca_id, dias);
  if (ja) throw new C.ErroUsuario(`Este e-mail já foi decidido em ${C.dataBr(ja.data)} (${SITUACOES_REGUA[ja.situacao]}).`);
  const cb = R.buscar(d, 'cobrancas', cobranca_id);
  const c = R.buscar(d, 'contratos', contrato_id);
  const nome = `${c ? c.inquilino_nome : 'inquilino'}, boleto ${cb ? C.compBr(cb.competencia) : ''} (${nomeDaEtapa(dias)})`;
  const texto = { enviado: `Régua de cobrança: e-mail enviado para ${para} — ${nome}`, gmail: `Régua de cobrança: e-mail aberto no Gmail para ${para} — ${nome}`, recusado: `Régua de cobrança: "Não enviar" — ${nome}` }[situacao];
  return R.inserir(d, 'regua_emails', { cobranca_id, contrato_id, dias, situacao, data: hoje, para: para || null, assunto: assunto || null, envio_id: envio_id || null }, usuario, texto);
}

/** Decididos nos últimos ``dias`` dias, do mais novo para o mais velho (para a tela). */
export const decididosRecentes = (d, hoje = C.hojeIso(), dias = 30) => (d.regua_emails || []).filter((x) => String(x.data) >= C.somarDias(hoje, -dias))
  .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);
