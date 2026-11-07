// Banco (C6), fase 2 — regras puras (sem DOM nem disco): extrato das contas, destino das movimentações, conciliação de
// boletos, nome dos comprovantes e pagamentos pelo banco. Recebe ``d`` e grava só via inserir/atualizar/excluir/registrar.
// Os dados chegam no formato EXATO do C6 (saldo-extrato.yaml, bolepix.yaml, agendamento-de-pagamentos.yaml).
import * as K from './c6-comum.js';
import * as C from './calculos.js';
import {
  buscar, inserir, atualizar, excluir, registrar, registrarPagamento, previstoNoPagamento, totais, marcarIptuPago, parcelasIptu,
  lancarDespesas, lancarGanhoAirbnb, contasPermitidas, participacoesDo, TIPOS_DESPESA, contaBancaria, apelidoDaConta, pastaDoComprovante, pastaContador,
  pendenciasBancoDoMes, CONFIG_BANCO_FASE2, mesDoDinheiro, contaDeOrigem,
} from './regras.js';

export { pastaDoComprovante as escopoDoComprovante, pastaContador as escopoContador, contaBancaria as contaDo, apelidoDaConta, mesDoDinheiro, contaDeOrigem };

export const CLASSIFICACOES = {
  conta_imovel: 'Conta do imóvel (água, luz, gás, condomínio, internet, outra)',
  boleto: 'Aluguel recebido (boleto)',
  airbnb: 'Airbnb recebido (dividir entre os imóveis vagos)',
  reforma: 'Reforma / investimento no imóvel',
  iptu: 'IPTU pago na prefeitura',
  imposto: 'Imposto da empresa (PIS/COFINS, IRPJ, CSLL)',
  tarifa: 'Tarifa do banco',
  transferencia: 'Transferência entre as nossas contas',
  outro: 'Outro (só comprovante, sem imóvel)',
  ignorar: 'Não é nosso / ignorar',
};

export const SITUACOES_PAGAMENTO = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aprovado no sistema, envio ao banco pendente',
  agendado: 'Enviado ao banco (aguardando aprovação no app do C6)',
  pago: 'Pago',
  erro: 'Erro no banco',
  cancelado: 'Cancelado',
};

/** Situação do item no C6 (agendamento-de-pagamentos.yaml) → situação do pagamento no sistema. */
export const SITUACAO_C6 = {
  READ_DATA: 'agendado', SCHEDULED: 'agendado', PROCESSING: 'agendado', PROCESSED: 'pago',
  DECODE_ERROR: 'erro', ERROR: 'erro', SCHEDULING_CANCELLED: 'cancelado',
};

/** O que cada situação pode virar (nada sai de pago nem de cancelado). */
const TRANSICOES = {
  rascunho: ['aguardando_aprovacao', 'agendado', 'pago', 'erro', 'cancelado'],
  aguardando_aprovacao: ['rascunho', 'agendado', 'pago', 'erro', 'cancelado'],
  agendado: ['pago', 'erro', 'cancelado'],
  erro: ['rascunho', 'agendado', 'pago', 'cancelado'],
  pago: [],
  cancelado: [],
};

const cfg = (d) => d.config_banco || {};
const hoje = () => C.hojeIso();
const dataDe = (x) => String(x || '').slice(0, 10);

// --------------------------------------------------------------------------
// Dinheiro e datas no formato do C6
// --------------------------------------------------------------------------
/** "1500.00" (texto do C6, ponto decimal) → 150000 centavos, sem sinal (o tipo entrada/saída vem de outro campo). Lança se não for valor. */
export const centavosDoC6 = (texto) => Math.abs(K.centavosDoTexto(texto));
/** 150000 centavos → 1500 (número em reais, duas casas, como o C6 pede em ``amount``). */
export const reaisParaC6 = (centavos) => Number((Number(centavos || 0) / 100).toFixed(2));

/**
 * Divide um período em janelas de até 30 dias (limite do extrato do C6 por consulta), inclusive nas duas pontas (``janelas`` de
 * c6-comum, a mesma da ponte). Ex.: 01/10 a 31/10 (31 dias) → [01/10–30/10, 31/10–31/10].
 */
export const janelasDe30Dias = (de, ate, dias = 30) => K.janelas(de, ate, dias);

// --------------------------------------------------------------------------
// Contas e empresas
// --------------------------------------------------------------------------
export const contasConfiguradas = (d) => cfg(d).contas || [];
export const empresaDaConta = (d, contaId) => {
  const c = contaBancaria(d, contaId);
  return c && c.emitente_id ? buscar(d, 'emitentes', c.emitente_id) || null : null;
};
export const contaDaEmpresa = (d, emitenteId) => contasConfiguradas(d).find((c) => c.emitente_id === Number(emitenteId)) || null;

/** Conta sugerida para pagar as contas do imóvel: a da empresa com maior participação que tem conta; empate ou sem → padrão ou a 1ª. */
export function contaSugeridaDoImovel(d, imovelId) {
  const contas = contasConfiguradas(d);
  const comConta = participacoesDo(d, Number(imovelId)).filter((p) => contaDaEmpresa(d, p.emitente_id)).sort((a, b) => b.percentual - a.percentual);
  const empate = comConta.length > 1 && comConta[0].percentual === comConta[1].percentual;
  if (comConta.length && !empate) return contaDaEmpresa(d, comConta[0].emitente_id).id;
  return cfg(d).conta_padrao_id || (contas[0] ? contas[0].id : null);
}

function exigirConta(d, contaId) {
  const c = contaBancaria(d, contaId);
  if (!c) throw new Error(`Conta bancária "${contaId}" não está configurada em Dados e backup → Banco.`);
  return c;
}

// --------------------------------------------------------------------------
// Importação do extrato (entries[] de saldo-extrato.yaml)
// --------------------------------------------------------------------------
/** Converte um lançamento do extrato do C6 (ou da ponte, se já normalizado) nos campos de movimentacoes_banco. */
export function movimentacaoDoC6(contaId, e) {
  if (e.reference === undefined && e.id_externo !== undefined) {
    // formato já normalizado pela ponte: { id_externo, data, valor_centavos, tipo, descricao, contrapartida, categoria, nosso_numero, saldo_apos_centavos }
    const v = Number(e.valor_centavos ?? e.valor);
    return { conta_id: contaId, id_externo: String(e.id_externo), data: dataDe(e.data), valor: Math.abs(v), tipo: e.tipo || (v < 0 ? 'saida' : 'entrada'),
      descricao: e.descricao || '', titulo: e.titulo || null, contrapartida: e.contrapartida || null, categoria_banco: e.categoria || e.categoria_banco || null,
      nosso_numero: e.nosso_numero || null, saldo_apos: e.saldo_apos_centavos ?? e.saldo_apos ?? null, end_to_end_id: e.end_to_end_id || null, local_reference: e.local_reference || null, criado_em_banco: e.created_at || null };
  }
  if (!e.reference) throw new Error('Lançamento do extrato sem "reference" (chave única do C6).');
  return { conta_id: contaId, id_externo: String(e.reference), data: dataDe(e.entry_date || e.created_at), valor: centavosDoC6(e.amount),
    tipo: e.operation_type === 'OUTGOING' ? 'saida' : 'entrada', descricao: e.description || e.title || '', titulo: e.title || null, contrapartida: null,
    categoria_banco: e.transaction_type || null, nosso_numero: null, saldo_apos: null, end_to_end_id: e.end_to_end_id || null,
    local_reference: e.local_reference || null, criado_em_banco: e.created_at || null };
}

const CAMPOS_DESTINO = { classificacao: null, imovel_id: null, despesa_id: null, cobranca_id: null, iptu_id: null, iptu_parcela: null, guia_imposto_id: null,
  pagamento_banco_id: null, par_movimentacao_id: null, reforma_id: null, nome_arquivo: null, comprovante: null, comprovante_contador: null, comprovante_origem: null,
  observacoes: '', classificada_em: null, classificada_por: null, despesa_criada: false };

/**
 * Importa o extrato de uma conta. ``lancamentos`` = ``entries[]`` do C6. Nunca repete o mesmo ``reference`` na mesma conta.
 * Devolve { novas: [mov], repetidas: n, conta }. Grava config_banco.ultima_importacao[conta] = ``ate`` (ou a maior data importada).
 */
export function importarExtrato(d, contaId, lancamentos, usuario, { de = null, ate = null } = {}) {
  const conta = exigirConta(d, contaId);
  const existentes = new Set((d.movimentacoes_banco || []).filter((m) => m.conta_id === contaId).map((m) => m.id_externo));
  const novas = [];
  let repetidas = 0;
  let maior = null;
  for (const e of lancamentos || []) {
    const m = movimentacaoDoC6(contaId, e);
    if (!m.data) throw new Error(`Lançamento ${m.id_externo} sem data.`);
    if (existentes.has(m.id_externo)) { repetidas += 1; continue; }
    existentes.add(m.id_externo);
    if (!maior || m.data > maior) maior = m.data;
    novas.push(inserir(d, 'movimentacoes_banco', { ...m, importada_em: new Date().toISOString(), ...CAMPOS_DESTINO }, usuario,
      `Extrato ${apelidoDaConta(d, contaId)}: ${C.dataBr(m.data)} · ${m.tipo} ${C.reais(m.valor)} · ${m.descricao}`.slice(0, 200)));
  }
  const fim = ate || maior;
  if (fim) {
    cfg(d).ultima_importacao = cfg(d).ultima_importacao || {};
    const anterior = cfg(d).ultima_importacao[contaId] || null;
    if (!anterior || fim > anterior) cfg(d).ultima_importacao[contaId] = fim;
  }
  registrar(d, usuario, 'Alteração', 'banco', null, `Extrato ${apelidoDaConta(d, contaId)} importado${de ? ` de ${C.dataBr(de)}` : ''}${fim ? ` até ${C.dataBr(fim)}` : ''}: ${novas.length} nova(s), ${repetidas} já estava(m)`,
    { conta_id: contaId, novas: novas.length, repetidas, de, ate: fim });
  return { novas, repetidas, conta };
}

// --------------------------------------------------------------------------
// Consulta
// --------------------------------------------------------------------------
/** Precisa de comprovante toda movimentação com destino, menos a ignorada (a transferência entre as nossas contas também: um PDF só, na pasta do contador da conta de origem). */
const semComprovante = (m) => m.classificacao && m.classificacao !== 'ignorar' && !m.comprovante && !m.comprovante_contador;

export function movimentacoesDo(d, { conta_id = null, mes = null, imovel_id = null, filtro = 'todas' } = {}) {
  return (d.movimentacoes_banco || []).filter((m) => (!conta_id || m.conta_id === conta_id) && (!mes || String(m.data).slice(0, 7) === mes)
    && (!imovel_id || m.imovel_id === Number(imovel_id))
    && (filtro === 'todas' || (filtro === 'pendentes' && !m.classificacao) || (filtro === 'entradas' && m.tipo === 'entrada')
      || (filtro === 'saidas' && m.tipo === 'saida') || (filtro === 'sem_comprovante' && semComprovante(m))))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);
}

export function resumoBanco(d, contaId, mes) {
  const movs = movimentacoesDo(d, { conta_id: contaId, mes });
  const soma = (tipo) => movs.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.valor, 0);
  return { entradas: soma('entrada'), saidas: soma('saida'), total: movs.length, pendentes: movs.filter((m) => !m.classificacao).length,
    semComprovante: movs.filter(semComprovante).length, importadoAte: (cfg(d).ultima_importacao || {})[contaId] || null };
}

export const pendenciasBanco = (d, mes, dia) => pendenciasBancoDoMes(d, mes, dia);

// --------------------------------------------------------------------------
// Nome do comprovante
// --------------------------------------------------------------------------
/** Texto sem acento, sem caracteres proibidos em nome de arquivo, com espaços simples (a pasta de teste recusa acento). */
export const nomeSemAcento = (texto) => String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');

function tipoDoComprovante(d, mov) {
  if (mov.origem) return mov.tipo_conta || 'Conta';
  switch (mov.classificacao) {
    case 'conta_imovel': { const de = mov.despesa_id ? buscar(d, 'despesas', mov.despesa_id) : null; return (de && de.tipo) || mov.tipo_despesa || 'Conta'; }
    case 'boleto': { const cb = mov.cobranca_id ? buscar(d, 'cobrancas', mov.cobranca_id) : null; const c = cb ? buscar(d, 'contratos', cb.contrato_id) : null; return `Aluguel${c ? ` ${c.inquilino_nome}` : ''}`; }
    case 'iptu': { const p = mov.iptu_id ? buscar(d, 'iptus', mov.iptu_id) : null; return `IPTU${p ? ` ${p.ano}` : ''} ${mov.iptu_parcela ? `${mov.iptu_parcela}a parcela` : 'cota unica'}`; }
    case 'imposto': { const g = mov.guia_imposto_id ? buscar(d, 'guias_impostos', mov.guia_imposto_id) : null; return g ? `Imposto ${g.imposto} ${g.periodo}` : 'Imposto'; }
    case 'tarifa': return 'Tarifa';
    case 'transferencia': return 'Transferencia';
    default: return mov.titulo || 'Outro';
  }
}

/**
 * Nome padrão do comprovante pelo modelo de config_banco ("{data} {empresa} {imovel} {tipo} {valor}"): sem acento, sem caracteres
 * proibidos, no máximo 120 caracteres mais a extensão. Ex.: "2026-11-05 ANK Loja 1 Agua 123,45.pdf".
 * Tokens: {data} AAAA-MM-DD · {empresa} apelido da conta · {imovel} nome do imóvel ou "Geral" · {tipo} · {valor} 1.234,56 · {mes} AAAA-MM · {contrapartida}.
 */
export function nomeComprovante(d, mov, { modelo = null, extensao = '.pdf' } = {}) {
  const i = mov.imovel_id ? buscar(d, 'imoveis', mov.imovel_id) : null;
  const data = mov.data || mov.pago_em || mov.data_pagamento || hoje();
  const tokens = { data, empresa: apelidoDaConta(d, contaDeOrigem(d, mov)), imovel: i ? i.nome : 'Geral', tipo: tipoDoComprovante(d, mov),
    valor: C.reais(mov.valor, false), mes: mov.competencia || String(data).slice(0, 7), contrapartida: (mov.contrapartida && mov.contrapartida.nome) || (mov.beneficiario && mov.beneficiario.nome) || '' };
  const m = modelo || cfg(d).modelo_nome_comprovante || CONFIG_BANCO_FASE2.modelo_nome_comprovante;
  const nome = nomeSemAcento(m.replace(/\{(\w+)\}/g, (_, k) => tokens[k] ?? '')).slice(0, 120).trim();
  return `${nome || 'comprovante'}${extensao || ''}`;
}
export const nomePadraoComprovante = (d, mov) => nomeComprovante(d, mov);

// --------------------------------------------------------------------------
// Conciliação de boletos
// --------------------------------------------------------------------------
const emAberto = (cb) => !cb.data_pagamento && cb.situacao !== 'Carência';
const semDigitos = (t) => String(t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim();

/** Boletos em aberto que casam com um recebimento de ``valor`` em ``data``: [{ cobranca, certeza, previsto, pagouEmDia }]. */
function casarBoletos(d, valor, data, dias, { idExterno = null, nossoNumero = null } = {}) {
  const abertos = d.cobrancas.filter(emAberto);
  if (idExterno || nossoNumero) {
    const cb = abertos.find((x) => x.banco && ((idExterno && x.banco.id_externo === idExterno) || (nossoNumero && x.banco.nosso_numero && String(x.banco.nosso_numero) === String(nossoNumero))));
    if (cb) {
      const emDia = data > cb.vencimento && valor === totais(cb).a_pagar_pontual;
      return [{ cobranca: cb, certeza: 'exata', previsto: previstoNoPagamento(cb, data, { pagouEmDia: emDia }).valor_devido, pagouEmDia: emDia }];
    }
  }
  const lista = [];
  for (const cb of abertos) {
    const pontual = totais(cb).a_pagar_pontual;
    const noPrazo = valor === pontual && data <= C.somarDias(cb.vencimento, dias);
    const comEncargos = !noPrazo && data > cb.vencimento && valor === previstoNoPagamento(cb, data).valor_devido;
    if (noPrazo || comEncargos) lista.push({ cobranca: cb, certeza: 'exata', previsto: noPrazo ? pontual : valor, pagouEmDia: noPrazo && data > cb.vencimento });
  }
  if (lista.length > 1) for (const x of lista) x.certeza = 'provavel';
  return lista;
}

/**
 * Pagamentos de boletos vindos da listagem do Bolepix (``content[]`` com ``external_reference_id`` e ``payments[]``, ou a lista já
 * achatada [{ external_reference_id, amount, payment_date, credit_date, payment_type }]) → sugestões, SEM gravar:
 * [{ cobranca_id, data_credito, data_pagamento, valor, certeza, pagouEmDia, external_reference_id, external_payment_id }].
 * Casa primeiro pelo external_reference_id (cobrancas[].banco.id_externo); sem ele, por valor e data (tolerância em dias).
 */
export function conciliarBoletos(d, contaId, pagamentosC6, { dias = null } = {}) {
  const tol = dias ?? cfg(d).tolerancia_dias ?? CONFIG_BANCO_FASE2.tolerancia_dias;
  const planos = [];
  for (const x of pagamentosC6 || []) {
    if (Array.isArray(x.payments)) for (const p of x.payments) planos.push({ ...p, external_reference_id: x.external_reference_id || null });
    else planos.push(x);
  }
  const out = [];
  for (const p of planos) {
    const valor = centavosDoC6(p.amount);
    const credito = dataDe(p.credit_date || p.payment_date);
    const pagou = dataDe(p.payment_date || p.credit_date);
    const conhecido = p.external_reference_id ? d.cobrancas.find((x) => x.banco && x.banco.id_externo === p.external_reference_id) : null;
    if (conhecido && conhecido.data_pagamento) continue; // boleto já confirmado: nada a sugerir
    let achados = conhecido ? casarBoletos(d, valor, pagou, tol, { idExterno: p.external_reference_id }) : [];
    if (!achados.length) achados = casarBoletos(d, valor, pagou, tol).map((a) => ({ ...a, certeza: p.external_reference_id ? 'provavel' : a.certeza }));
    for (const a of achados) {
      out.push({ cobranca_id: a.cobranca.id, conta_id: contaId, data_credito: credito, data_pagamento: pagou, valor, certeza: a.certeza, previsto: a.previsto,
        pagouEmDia: pagou <= a.cobranca.vencimento && credito > a.cobranca.vencimento, external_reference_id: p.external_reference_id || null,
        external_payment_id: p.external_payment_id || null, payment_type: p.payment_type || null });
    }
  }
  return out;
}

/** Entradas do extrato que parecem boletos em aberto: [{ movimentacao_id, cobranca_id, certeza, previsto, pagouEmDia }] (sem gravar). */
export function conciliarMovimentacoes(d, movs, { dias = null } = {}) {
  const tol = dias ?? cfg(d).tolerancia_dias ?? CONFIG_BANCO_FASE2.tolerancia_dias;
  const out = [];
  for (const m of movs || []) {
    if (m.tipo !== 'entrada' || m.classificacao) continue;
    for (const a of casarBoletos(d, m.valor, m.data, tol, { nossoNumero: m.nosso_numero })) {
      out.push({ movimentacao_id: m.id, cobranca_id: a.cobranca.id, certeza: a.certeza, previsto: a.previsto, pagouEmDia: a.pagouEmDia });
    }
  }
  return out;
}

/**
 * Confirma o pagamento de um boleto pelo banco. ``origem``: id de uma movimentação do extrato (entrada) ou um pagamento do Bolepix
 * ({ amount, payment_date, credit_date, external_payment_id }). Chama registrarPagamento com a data de crédito e liga os dois lados.
 * Valor diferente do previsto sem ``valorNf`` → devolve { divergente: true, previsto, recebido } SEM gravar (a tela pede a justificativa
 * e chama de novo). Nunca duplica: boleto já pago lança erro.
 */
export function confirmarPagamentoPeloBanco(d, cobrancaId, origem, usuario, { pagouEmDia = null, valorNf = null, justificativa = '' } = {}) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  if (!cb) throw new Error('Boleto não encontrado.');
  if (cb.data_pagamento) throw new Error(`Este boleto já está pago (${C.dataBr(cb.data_pagamento)}). Nada foi alterado.`);
  const mov = typeof origem === 'number' || typeof origem === 'string' ? buscar(d, 'movimentacoes_banco', origem) : null;
  if (!mov && (typeof origem !== 'object' || !origem)) throw new Error('Movimentação não encontrada.');
  if (mov && mov.tipo !== 'entrada') throw new Error('Só uma entrada no extrato pode confirmar o pagamento de um boleto.');
  if (mov && mov.classificacao) throw new Error('Esta movimentação já tem destino. Desfaça antes.');
  const valor = mov ? mov.valor : centavosDoC6(origem.amount);
  const credito = mov ? mov.data : dataDe(origem.credit_date || origem.payment_date);
  const pagou = mov ? null : dataDe(origem.payment_date || origem.credit_date);
  const pontual = totais(cb).a_pagar_pontual;
  const emDia = pagouEmDia !== null ? pagouEmDia : credito > cb.vencimento && (valor === pontual || (pagou && pagou <= cb.vencimento));
  const dataPagou = !emDia && pagou && pagou < credito ? pagou : null;
  const previsto = previstoNoPagamento(cb, credito, { pagouEmDia: emDia, dataPagou });
  if (valor !== previsto.valor_devido && valorNf === null) return { divergente: true, previsto: previsto.valor_devido, recebido: valor, cobranca: cb, pagouEmDia: emDia };
  const r = registrarPagamento(d, cb.id, credito, valor, usuario, { pagouEmDia: emDia, dataPagou, valorNf, justificativa });
  const c = buscar(d, 'contratos', cb.contrato_id);
  if (mov) {
    atualizar(d, 'cobrancas', cb.id, { movimentacao_id: mov.id }, usuario, 'Pagamento confirmado pelo extrato do banco');
    atualizar(d, 'movimentacoes_banco', mov.id, { classificacao: 'boleto', cobranca_id: cb.id, imovel_id: c ? c.imovel_id : null, classificada_em: new Date().toISOString(), classificada_por: usuario },
      usuario, `Destino: aluguel de ${c ? c.inquilino_nome : ''} (boleto de ${C.compBr(cb.competencia)})`);
  } else {
    atualizar(d, 'cobrancas', cb.id, { pagamento_c6: { external_payment_id: origem.external_payment_id || null, payment_date: pagou, credit_date: credito, valor, payment_type: origem.payment_type || null } },
      usuario, 'Pagamento confirmado pela listagem do banco (Bolepix)');
  }
  return { divergente: false, previsto: previsto.valor_devido, recebido: valor, resultado: r, cobranca: cb };
}
/** Mesmo que confirmarPagamentoPeloBanco, com a ordem (mov, boleto) do plano. */
export const confirmarPagamentoPeloExtrato = (d, movId, cobrancaId, usuario, opts) => confirmarPagamentoPeloBanco(d, cobrancaId, Number(movId), usuario, opts);

/** Liga uma movimentação a um boleto já pago pelo fluxo de divergência (FORMULARIOS.pagamentoNf). */
export function ligarMovimentacaoAoBoleto(d, movId, cobrancaId, usuario) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  const mov = buscar(d, 'movimentacoes_banco', movId);
  if (!cb || !mov) return;
  const c = buscar(d, 'contratos', cb.contrato_id);
  atualizar(d, 'cobrancas', cb.id, { movimentacao_id: mov.id }, usuario, 'Pagamento confirmado pelo extrato do banco');
  atualizar(d, 'movimentacoes_banco', mov.id, { classificacao: 'boleto', cobranca_id: cb.id, imovel_id: c ? c.imovel_id : null, classificada_em: new Date().toISOString(), classificada_por: usuario },
    usuario, `Destino: aluguel de ${c ? c.inquilino_nome : ''} (boleto de ${C.compBr(cb.competencia)})`);
}

// --------------------------------------------------------------------------
// Sugestão de destino
// --------------------------------------------------------------------------
const PALAVRAS = [
  [/SANEPAR|SANEAMENTO|\bAGUA\b|CAGECE|SABESP|COPASA/, 'conta_imovel', 'Água'],
  [/COPEL|ENERGIA|ELETRIC|\bLUZ\b|CELESC|CEMIG|ENEL/, 'conta_imovel', 'Luz'],
  [/COMPAGAS|SUPERGASBRAS|ULTRAGAZ|\bGAS\b/, 'conta_imovel', 'Gás'],
  [/CONDOMINIO|COND\b/, 'conta_imovel', 'Condomínio'],
  [/INTERNET|VIVO|CLARO|\bOI\b|TIM\b|NET\b/, 'conta_imovel', 'Internet'],
  [/\bIPTU\b|PREFEITURA|MUNICIP/, 'iptu', null],
  [/\bDARF\b|RECEITA FEDERAL|\bPIS\b|COFINS|\bIRPJ\b|\bCSLL\b|SIMPLES NACIONAL/, 'imposto', null],
  [/TARIFA|\bTAR\b|PACOTE DE SERVICOS|MENSALIDADE|MANUTENCAO DE CONTA/, 'tarifa', null],
];
/** Número da parcela citado na descrição ("PARCELA 3/10", "PARC. 03", "3ª PARCELA", "COTA UNICA" → 0); null se não cita. */
export function parcelaCitada(texto) {
  const t = String(texto || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/COTA\s*UNICA|PARCELA\s*UNICA/.test(t)) return 0;
  const m = /PARC(?:ELA)?\.?\s*0?(\d{1,2})\b/.exec(t) || /\b0?(\d{1,2})\s*[ªA°º]?\s*PARC(?:ELA)?/.exec(t);
  return m ? Number(m[1]) : null;
}
const textoDaMov = (m) => `${m.descricao || ''} ${m.titulo || ''} ${(m.contrapartida && (`${m.contrapartida.nome || ''} ${m.contrapartida.documento || ''}`)) || ''}`
  .toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function imovelNoTexto(d, texto) {
  for (const i of d.imoveis) {
    const campos = [['sanepar_matricula', 'Água'], ['copel_uc', 'Luz'], ['gas_relogio', 'Gás'], ['administradora_nome', 'Condomínio'], ['inscricao_iptu', 'IPTU']];
    for (const [k, tipo] of campos) {
      const v = String(i[k] || '').replace(/[^A-Za-z0-9]/g, '');
      if (v.length >= 4 && texto.replace(/[^A-Z0-9]/g, '').includes(v.toUpperCase())) return { imovel: i, tipo, campo: k };
    }
  }
  for (const i of d.imoveis) {
    const nome = String(i.nome || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (nome.length >= 4 && texto.includes(nome)) return { imovel: i, tipo: null, campo: 'nome' };
  }
  return null;
}

/**
 * Sugestão de destino para uma movimentação (nada é gravado): { classificacao, imovel_id, tipo_despesa, cobranca_id, iptu, motivo, confianca }
 * ou null. Ordem: pagamento pelo banco pendente de mesma conta/valor/data; transferência entre as nossas contas; liquidação de boleto
 * (valor + data); palavras da descrição (Sanepar, Copel, IPTU, DARF, tarifa…) com o imóvel pela matrícula/UC/nome; memória da última
 * movimentação com a mesma descrição (sem números).
 */
export function sugerirDestino(d, mov) {
  const texto = textoDaMov(mov);
  // 1) saída que é um pagamento feito pelo sistema
  if (mov.tipo === 'saida') {
    const pag = (d.pagamentos_banco || []).find((p) => ['agendado', 'pago'].includes(p.situacao) && !p.movimentacao_id && p.conta_id === mov.conta_id && p.valor === mov.valor
      && Math.abs(C.diasEntre(p.data_pagamento || p.vencimento || mov.data, mov.data)) <= 2);
    if (pag) return { classificacao: classificacaoDaOrigem(pag.origem), imovel_id: pag.imovel_id, tipo_despesa: pag.tipo_conta, pagamento_banco_id: pag.id, motivo: `pagamento pelo banco nº ${pag.id} (${pag.beneficiario && pag.beneficiario.nome ? pag.beneficiario.nome : pag.tipo_conta})`, confianca: 'alta' };
  }
  // 2) transferência entre as nossas contas: a outra ponta no extrato da outra conta, ou a outra empresa citada
  const par = parDaTransferencia(d, mov);
  if (par) return { classificacao: 'transferencia', par_movimentacao_id: par.id, motivo: `a outra ponta está no extrato ${apelidoDaConta(d, par.conta_id)} (${C.dataBr(par.data)})`, confianca: 'alta' };
  for (const c of contasConfiguradas(d)) {
    if (c.id === mov.conta_id) continue;
    const e = empresaDaConta(d, c.id);
    const cnpj = e ? String(e.cnpj || '').replace(/\D/g, '') : '';
    if ((cnpj && texto.replace(/\D/g, '').includes(cnpj)) || (e && texto.includes(String(e.nome).toUpperCase())) || (c.apelido && new RegExp(`\\b${c.apelido.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(texto))) {
      if (/TRANSF|TED|PIX|DOC/.test(texto) || /TRANSFER|PIX/.test(String(mov.categoria_banco || ''))) return { classificacao: 'transferencia', motivo: `cita a outra empresa (${c.apelido || (e && e.nome)})`, confianca: 'alta' };
    }
  }
  // 3a) entrada do Airbnb (o Airbnb paga o total; a divisão entre os imóveis é feita na janela)
  if (mov.tipo === 'entrada' && /AIRBNB/.test(texto)) return { classificacao: 'airbnb', motivo: 'descrição do Airbnb', confianca: 'alta' };
  // 3) entrada que parece boleto
  if (mov.tipo === 'entrada' && !mov.classificacao) {
    const casa = conciliarMovimentacoes(d, [mov]);
    if (casa.length === 1) {
      const cb = buscar(d, 'cobrancas', casa[0].cobranca_id);
      const c = buscar(d, 'contratos', cb.contrato_id);
      return { classificacao: 'boleto', cobranca_id: cb.id, imovel_id: c ? c.imovel_id : null, pagouEmDia: casa[0].pagouEmDia, motivo: `valor igual ao boleto de ${c ? c.inquilino_nome : ''} (${C.compBr(cb.competencia)})`, confianca: 'alta' };
    }
    if (casa.length > 1) return { classificacao: 'boleto', cobranca_id: null, candidatos: casa.map((x) => x.cobranca_id), motivo: `${casa.length} boletos com este valor`, confianca: 'baixa' };
  }
  // 4) palavras da descrição
  if (/TARIFA|\bTAR\b|PACOTE DE SERVICOS|MANUTENCAO DE CONTA/.test(texto) && mov.tipo === 'saida') return { classificacao: 'tarifa', motivo: 'descrição de tarifa', confianca: 'alta' };
  const imv = imovelNoTexto(d, texto);
  let porPalavra = null;
  for (const [re, classificacao, tipo] of PALAVRAS) {
    if (!re.test(texto) || mov.tipo !== 'saida') continue;
    if (classificacao === 'iptu') {
      const p = imv ? d.iptus.filter((x) => x.imovel_id === imv.imovel.id).sort((a, b) => b.ano - a.ano)[0] : null;
      const pcs = p ? parcelasIptu(d, p).filter((pc) => pc.proprietario) : [];
      // "PARCELA 3/10", "PARC 3", "3ª PARCELA": a parcela citada vale mais que a primeira em aberto com o mesmo valor
      const nCitado = parcelaCitada(texto);
      const citada = nCitado !== null ? pcs.find((pc) => pc.n === nCitado && !pc.paga) || null : null;
      const parcela = citada || pcs.find((pc) => !pc.paga && (pc.valor === mov.valor || pc.valorProprietario === mov.valor)) || null;
      porPalavra = { classificacao: 'iptu', imovel_id: imv ? imv.imovel.id : null, iptu: p ? { id: p.id, n: parcela ? parcela.n : null } : null, motivo: citada ? `descrição de IPTU (${citada.rotulo} parcela citada)` : 'descrição de IPTU', confianca: parcela ? 'alta' : 'media' };
    } else if (classificacao === 'imposto') porPalavra = { classificacao: 'imposto', motivo: 'descrição de imposto', confianca: 'media' };
    else if (classificacao === 'tarifa') porPalavra = { classificacao: 'tarifa', motivo: 'descrição de tarifa', confianca: 'media' };
    else porPalavra = { classificacao: 'conta_imovel', imovel_id: imv ? imv.imovel.id : null, tipo_despesa: imv && imv.tipo && imv.tipo !== 'IPTU' ? imv.tipo : tipo, motivo: imv ? `${tipo} · imóvel pela ${imv.campo === 'nome' ? 'descrição' : 'matrícula/UC cadastrada'}` : `descrição de ${tipo}`, confianca: imv ? 'media' : 'baixa' };
    break;
  }
  if (porPalavra && (porPalavra.imovel_id || porPalavra.classificacao !== 'conta_imovel')) return porPalavra;
  if (imv) return { classificacao: imv.tipo === 'IPTU' ? 'iptu' : 'conta_imovel', imovel_id: imv.imovel.id, tipo_despesa: imv.tipo && imv.tipo !== 'IPTU' ? imv.tipo : 'Outra', motivo: 'imóvel citado na descrição', confianca: 'media' };
  // 5) memória: última movimentação já classificada com a mesma descrição (sem números) ou a mesma contrapartida (vale mais que a palavra sem imóvel)
  const chave = semDigitos(mov.descricao);
  const doc = mov.contrapartida && mov.contrapartida.documento ? String(mov.contrapartida.documento).replace(/\D/g, '') : '';
  const antiga = (d.movimentacoes_banco || []).filter((m) => m.id !== mov.id && m.classificacao && !['boleto', 'ignorar', 'transferencia'].includes(m.classificacao) && m.tipo === mov.tipo
    && ((chave && semDigitos(m.descricao) === chave) || (doc && m.contrapartida && String(m.contrapartida.documento || '').replace(/\D/g, '') === doc)))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id)[0];
  if (antiga) {
    const de = antiga.despesa_id ? buscar(d, 'despesas', antiga.despesa_id) : null;
    return { classificacao: antiga.classificacao, imovel_id: antiga.imovel_id, tipo_despesa: de ? de.tipo : null, iptu: antiga.iptu_id ? { id: antiga.iptu_id, n: null } : null,
      motivo: `igual à movimentação de ${C.dataBr(antiga.data)}`, confianca: 'media' };
  }
  return porPalavra;
}
export const sugerirClassificacao = sugerirDestino;

const classificacaoDaOrigem = (origem) => ({ despesa: 'conta_imovel', avulso: 'conta_imovel', iptu: 'iptu', guia_imposto: 'imposto' }[(origem || {}).tipo] || 'outro');

/** A outra ponta de uma transferência entre as nossas contas: mesmo valor, tipo oposto, outra conta, até 1 dia de diferença, ainda sem par. */
export function parDaTransferencia(d, mov) {
  return (d.movimentacoes_banco || []).find((m) => m.id !== mov.id && m.conta_id !== mov.conta_id && m.valor === mov.valor && m.tipo !== mov.tipo
    && Math.abs(C.diasEntre(m.data, mov.data)) <= 1 && !m.par_movimentacao_id && (!m.classificacao || m.classificacao === 'transferencia')
    && /TRANSFER|PIX|TED/.test(`${m.categoria_banco || ''} ${textoDaMov(m)}`)) || null;
}

// --------------------------------------------------------------------------
// Vínculos (destino da movimentação)
// --------------------------------------------------------------------------
function exigirMov(d, movId) {
  const mov = buscar(d, 'movimentacoes_banco', movId);
  if (!mov) throw new Error('Movimentação não encontrada.');
  return mov;
}
const carimbo = (usuario) => ({ classificada_em: new Date().toISOString(), classificada_por: usuario });

/**
 * Dá destino a uma movimentação. ``destino``: { classificacao, imovel_id, tipo_despesa, competencia, despesa_id, cobranca_id, iptu_id, iptu_parcela,
 * guia_imposto_id, par_movimentacao_id, observacoes, nome_arquivo }. Lança erro em português se inválido; já classificada lança.
 * - conta_imovel: liga a conta já lançada (despesa_id) ou cria uma via lancarDespesas (qualquer imóvel);
 * - airbnb: divide a entrada entre imóveis vagos (divisao: [{ imovel_id, valor }], soma = valor do extrato) em ganhos_airbnb; reforma: cria a reforma do imóvel;
 * - boleto: confirma o pagamento (confirmarPagamentoPeloBanco; pode devolver { divergente });
 * - iptu: marca a parcela paga pelo proprietário na data da movimentação; imposto: grava paga_em na guia;
 * - transferencia: liga a outra ponta (par) e marca as duas; tarifa/outro/ignorar: só marca.
 */
export function vincularMovimentacao(d, movId, destino, usuario) {
  const mov = exigirMov(d, movId);
  if (mov.classificacao) throw new Error('Esta movimentação já tem destino. Desfaça antes.');
  const cl = destino.classificacao;
  if (!CLASSIFICACOES[cl]) throw new Error('Escolha o destino da movimentação.');
  const obs = String(destino.observacoes || '').trim();
  const base = { observacoes: obs, nome_arquivo: destino.nome_arquivo || null, ...carimbo(usuario) };
  if (cl === 'boleto') {
    if (!destino.cobranca_id) throw new Error('Escolha o boleto que esta entrada pagou.');
    const r = confirmarPagamentoPeloBanco(d, destino.cobranca_id, mov.id, usuario, destino);
    if (!r.divergente && (obs || destino.nome_arquivo)) atualizar(d, 'movimentacoes_banco', mov.id, { observacoes: obs, nome_arquivo: destino.nome_arquivo || null }, usuario, 'Observações da movimentação');
    return r;
  }
  if (cl === 'conta_imovel') {
    if (mov.tipo !== 'saida') throw new Error('Uma entrada no extrato não pode ser conta do imóvel.');
    let de = destino.despesa_id ? buscar(d, 'despesas', destino.despesa_id) : null;
    let criada = false;
    if (destino.despesa_id && !de) throw new Error('Conta do imóvel não encontrada.');
    if (de && de.movimentacao_id && de.movimentacao_id !== mov.id) throw new Error('Esta conta já está ligada a outra movimentação do extrato.');
    if (!de) {
      if (!destino.imovel_id) throw new Error('Escolha o imóvel.');
      if (!TIPOS_DESPESA.includes(destino.tipo_despesa)) throw new Error('Escolha a conta (água, luz, gás, condomínio, internet ou outra).');
      const comp = destino.competencia || String(mov.data).slice(0, 7);
      [de] = lancarDespesas(d, Number(destino.imovel_id), comp, [{ tipo: destino.tipo_despesa, valor: mov.valor, data_pagamento: mov.data, observacoes: obs }], usuario);
      criada = true;
    }
    atualizar(d, 'despesas', de.id, { movimentacao_id: mov.id, data_pagamento: mov.data, comprovante: mov.comprovante || de.comprovante || null }, usuario, 'Conta ligada à movimentação do extrato');
    const i = buscar(d, 'imoveis', de.imovel_id);
    atualizar(d, 'movimentacoes_banco', mov.id, { ...base, classificacao: cl, imovel_id: de.imovel_id, despesa_id: de.id, despesa_criada: criada }, usuario,
      `Destino: ${i ? i.nome : ''} · ${de.tipo} ${C.compBr(de.competencia)}`);
    return mov;
  }
  if (cl === 'airbnb') {
    if (mov.tipo !== 'entrada') throw new C.ErroUsuario('Uma saída no extrato não pode ser ganho do Airbnb.');
    const partes = (destino.divisao || []).filter((x) => x && x.valor > 0);
    if (!partes.length) throw new C.ErroUsuario('Informe quanto do Airbnb é de cada imóvel.');
    const soma = partes.reduce((t, x) => t + x.valor, 0);
    if (soma !== mov.valor) throw new C.ErroUsuario(`A divisão soma ${C.reais(soma)}, mas entrou ${C.reais(mov.valor)}: acerte os valores.`);
    const comp = destino.competencia_air || destino.competencia || String(mov.data).slice(0, 7);
    const ganhos = partes.map((x) => lancarGanhoAirbnb(d, Number(x.imovel_id), { data_recebimento: mov.data, competencia: comp, valor: x.valor, observacoes: obs, movimentacao_id: mov.id }, usuario));
    atualizar(d, 'movimentacoes_banco', mov.id, { ...base, classificacao: cl, imovel_id: ganhos.length === 1 ? ganhos[0].imovel_id : null }, usuario,
      `Destino: Airbnb de ${C.compBr(comp)} (${ganhos.length} imóvel(is))`);
    return mov;
  }
  if (cl === 'reforma') {
    if (mov.tipo !== 'saida') throw new C.ErroUsuario('Uma entrada no extrato não pode ser reforma.');
    const i = destino.imovel_id ? buscar(d, 'imoveis', destino.imovel_id) : null;
    if (!i) throw new C.ErroUsuario('Escolha o imóvel da reforma.');
    const descricao = String(destino.descricao_reforma || obs || '').trim();
    if (!descricao) throw new C.ErroUsuario('Diga o que foi feito na reforma (ex.: piso da cozinha).');
    const r = inserir(d, 'reformas', { imovel_id: i.id, data: mov.data, descricao, valor: mov.valor, fornecedor: '', documento: '', observacoes: obs, movimentacao_id: mov.id }, usuario,
      `Reforma: ${descricao} ${C.reais(mov.valor)} (extrato)`);
    atualizar(d, 'movimentacoes_banco', mov.id, { ...base, classificacao: cl, imovel_id: i.id, reforma_id: r.id }, usuario, `Destino: ${i.nome} · reforma (${descricao})`);
    return mov;
  }
  if (cl === 'iptu') {
    const p = destino.iptu_id ? buscar(d, 'iptus', destino.iptu_id) : null;
    if (!p) throw new Error('Escolha o IPTU (imóvel e ano).');
    const n = Number(destino.iptu_parcela ?? -1);
    const pc = parcelasIptu(d, p).find((x) => x.n === n);
    if (!pc) throw new Error('Escolha a parcela do IPTU.');
    if (!pc.proprietario) throw new Error(`A ${pc.rotulo} parcela do IPTU ${p.ano} é toda do inquilino (vai no boleto).`);
    if (pc.paga) throw new Error(`A ${pc.rotulo} parcela do IPTU ${p.ano} já está marcada como paga em ${C.dataBr(pc.paga)}.`);
    marcarIptuPago(d, p.id, n, mov.data, usuario);
    const i = buscar(d, 'imoveis', p.imovel_id);
    atualizar(d, 'movimentacoes_banco', mov.id, { ...base, classificacao: cl, imovel_id: p.imovel_id, iptu_id: p.id, iptu_parcela: n }, usuario, `Destino: ${i ? i.nome : ''} · IPTU ${p.ano} ${pc.rotulo}${n ? ' parcela' : ''}`);
    return mov;
  }
  if (cl === 'imposto') {
    const g = destino.guia_imposto_id ? buscar(d, 'guias_impostos', destino.guia_imposto_id) : null;
    if (destino.guia_imposto_id && !g) throw new Error('Guia de imposto não encontrada.');
    if (g) atualizar(d, 'guias_impostos', g.id, { paga_em: mov.data, movimentacao_id: mov.id }, usuario, `Guia ${g.imposto} ${g.periodo} paga em ${C.dataBr(mov.data)} (extrato)`);
    atualizar(d, 'movimentacoes_banco', mov.id, { ...base, classificacao: cl, guia_imposto_id: g ? g.id : null }, usuario, `Destino: imposto${g ? ` ${g.imposto} ${g.periodo}` : ''}`);
    return mov;
  }
  if (cl === 'transferencia') {
    const par = destino.par_movimentacao_id ? buscar(d, 'movimentacoes_banco', destino.par_movimentacao_id) : parDaTransferencia(d, mov);
    if (destino.par_movimentacao_id && !par) throw new Error('A outra movimentação da transferência não foi encontrada.');
    if (par && par.classificacao && par.classificacao !== 'transferencia') throw new Error('A outra ponta da transferência já tem outro destino.');
    atualizar(d, 'movimentacoes_banco', mov.id, { ...base, classificacao: cl, par_movimentacao_id: par ? par.id : null }, usuario, `Destino: transferência entre as contas${par ? ` (${apelidoDaConta(d, mov.conta_id)} ↔ ${apelidoDaConta(d, par.conta_id)})` : ''}`);
    if (par) atualizar(d, 'movimentacoes_banco', par.id, { classificacao: cl, par_movimentacao_id: mov.id, ...carimbo(usuario) }, usuario, 'Destino: transferência entre as contas (outra ponta)');
    return mov;
  }
  // tarifa, outro, ignorar
  atualizar(d, 'movimentacoes_banco', mov.id, { ...base, classificacao: cl, imovel_id: destino.imovel_id ? Number(destino.imovel_id) : null }, usuario, `Destino: ${CLASSIFICACOES[cl]}`);
  return mov;
}

/** Arquivos (comprovantes) desta movimentação ou pagamento, com escopo e id de pasta: [{ escopo, id, nome }]. */
export function arquivosDaMovimentacao(d, x) {
  const out = [];
  const p = pastaDoComprovante(d, x);
  const c = pastaContador(d, x);
  if (p && x.comprovante) out.push({ ...p, nome: x.comprovante });
  if (c && x.comprovante_contador) out.push({ ...c, nome: x.comprovante_contador });
  return out;
}

/**
 * Desfaz o destino: a conta criada por ela é excluída (a só ligada perde o vínculo), a parcela do IPTU volta a em aberto, a guia perde a
 * data, a transferência solta o par. Boleto: Error (desfaça o pagamento na tela Boletos: estornarPagamento limpa os dois lados).
 * Devolve { arquivos: [{ escopo, id, nome }] } dos comprovantes que ficaram sem uso (a tela apaga via alterarApagandoAnexos).
 */
export function desvincularMovimentacao(d, movId, usuario) {
  const mov = exigirMov(d, movId);
  if (!mov.classificacao) return { arquivos: [] };
  if (mov.classificacao === 'boleto') throw new Error("Desfaça o pagamento do boleto na tela Boletos (botão 'Desfazer pagamento').");
  const arquivos = arquivosDaMovimentacao(d, mov);
  if (mov.despesa_id) {
    const de = buscar(d, 'despesas', mov.despesa_id);
    if (de && de.pagamento_banco_id) throw new Error('Esta conta foi paga pelo banco; o destino não pode ser desfeito.');
    if (de && mov.despesa_criada) excluir(d, 'despesas', de.id, usuario, 'Conta excluída (destino da movimentação desfeito)');
    else if (de) atualizar(d, 'despesas', de.id, { movimentacao_id: null, comprovante: null }, usuario, 'Conta solta da movimentação do extrato');
  }
  if (mov.classificacao === 'airbnb') {
    const ganhos = (d.ganhos_airbnb || []).filter((x) => x.movimentacao_id === mov.id);
    for (const g of ganhos) {
      const nf = d.avulsas.find((a) => a.airbnb_competencia === g.competencia);
      if (nf && d.faturas.some((f) => f.origem_tipo === 'avulsa' && f.origem_id === nf.id && f.situacao === 'Emitida')) throw new Error(`A NF do Airbnb de ${C.compBr(g.competencia)} já foi numerada: o destino não pode ser desfeito.`);
    }
    for (const g of ganhos) excluir(d, 'ganhos_airbnb', g.id, usuario, 'Ganho do Airbnb excluído (destino da movimentação desfeito)');
  }
  if (mov.reforma_id && buscar(d, 'reformas', mov.reforma_id)) excluir(d, 'reformas', mov.reforma_id, usuario, 'Reforma excluída (destino da movimentação desfeito)');
  if (mov.iptu_id && mov.iptu_parcela !== null && buscar(d, 'iptus', mov.iptu_id)) marcarIptuPago(d, mov.iptu_id, mov.iptu_parcela, '', usuario, { peloBanco: true });
  if (mov.guia_imposto_id && buscar(d, 'guias_impostos', mov.guia_imposto_id)) atualizar(d, 'guias_impostos', mov.guia_imposto_id, { paga_em: null, movimentacao_id: null }, usuario, 'Guia solta da movimentação do extrato');
  if (mov.par_movimentacao_id) {
    const par = buscar(d, 'movimentacoes_banco', mov.par_movimentacao_id);
    if (par) atualizar(d, 'movimentacoes_banco', par.id, { classificacao: null, par_movimentacao_id: null, classificada_em: null, classificada_por: null, comprovante: null, comprovante_contador: null, comprovante_origem: null }, usuario, 'Transferência desfeita (outra ponta)');
  }
  atualizar(d, 'movimentacoes_banco', mov.id, { ...CAMPOS_DESTINO, observacoes: mov.observacoes || '' }, usuario, 'Destino da movimentação desfeito');
  return { arquivos };
}

// --------------------------------------------------------------------------
// Comprovantes
// --------------------------------------------------------------------------
/**
 * O registro irmão, que é o mesmo dinheiro e divide o mesmo comprovante: do pagamento pelo banco, a movimentação do extrato que o
 * confirmou (e vice-versa); de uma ponta da transferência entre as nossas contas, a outra ponta. null se não há.
 */
export function irmaoDoComprovante(d, x, tabela = 'movimentacoes_banco') {
  if (tabela === 'pagamentos_banco') return x.movimentacao_id && buscar(d, 'movimentacoes_banco', x.movimentacao_id) ? { tabela: 'movimentacoes_banco', x: buscar(d, 'movimentacoes_banco', x.movimentacao_id) } : null;
  if (x.pagamento_banco_id && buscar(d, 'pagamentos_banco', x.pagamento_banco_id)) return { tabela: 'pagamentos_banco', x: buscar(d, 'pagamentos_banco', x.pagamento_banco_id) };
  if (x.classificacao === 'transferencia' && x.par_movimentacao_id && buscar(d, 'movimentacoes_banco', x.par_movimentacao_id)) return { tabela: 'movimentacoes_banco', x: buscar(d, 'movimentacoes_banco', x.par_movimentacao_id) };
  return null;
}

/**
 * Registra o(s) PDF(s) guardado(s): na pasta do imóvel (comprovante) e/ou na do contador (comprovante_contador). origem: banco | ponte | manual.
 * Um comprovante só para o mesmo dinheiro: o nome vai também para a conta lançada (despesas.comprovante) e para o irmão
 * (pagamento pelo banco ↔ movimentação do extrato que o confirmou; as duas pontas da transferência), que estão na mesma pasta.
 */
export function registrarComprovante(d, movId, { nome_arquivo = null, comprovante = null, comprovante_contador = null, origem = 'banco' } = {}, usuario, tabela = 'movimentacoes_banco') {
  const x = buscar(d, tabela, movId);
  if (!x) throw new Error('Movimentação não encontrada.');
  if (!comprovante && !comprovante_contador) throw new Error('Informe o nome do arquivo do comprovante.');
  const dados = { comprovante: comprovante || x.comprovante || null, comprovante_contador: comprovante_contador || x.comprovante_contador || null, comprovante_origem: origem, nome_arquivo: nome_arquivo || x.nome_arquivo || null };
  atualizar(d, tabela, x.id, dados, usuario, `Comprovante guardado: ${comprovante || comprovante_contador}`);
  if (x.despesa_id && buscar(d, 'despesas', x.despesa_id)) atualizar(d, 'despesas', x.despesa_id, { comprovante: dados.comprovante || dados.comprovante_contador }, usuario, tabela === 'pagamentos_banco' ? 'Comprovante da conta (pagamento pelo banco)' : 'Comprovante da conta (extrato)');
  const irmao = irmaoDoComprovante(d, x, tabela);
  if (irmao && (irmao.x.comprovante !== dados.comprovante || irmao.x.comprovante_contador !== dados.comprovante_contador)) {
    atualizar(d, irmao.tabela, irmao.x.id, dados, usuario, `Comprovante guardado: ${comprovante || comprovante_contador} (o mesmo do ${tabela === 'pagamentos_banco' ? 'pagamento pelo banco' : irmao.tabela === 'pagamentos_banco' ? 'extrato' : 'outra ponta da transferência'})`);
    if (irmao.x.despesa_id && irmao.x.despesa_id !== x.despesa_id && buscar(d, 'despesas', irmao.x.despesa_id)) atualizar(d, 'despesas', irmao.x.despesa_id, { comprovante: dados.comprovante || dados.comprovante_contador }, usuario, 'Comprovante da conta');
  }
  return x;
}

/** Tira o registro dos comprovantes (a tela apaga os arquivos via alterarApagandoAnexos). Devolve os arquivos que ficaram sem uso. */
export function removerComprovante(d, movId, usuario, tabela = 'movimentacoes_banco') {
  const x = buscar(d, tabela, movId);
  if (!x) throw new Error('Movimentação não encontrada.');
  const arquivos = arquivosDaMovimentacao(d, x);
  atualizar(d, tabela, x.id, { comprovante: null, comprovante_contador: null, comprovante_origem: null }, usuario, 'Comprovante removido');
  if (x.despesa_id && buscar(d, 'despesas', x.despesa_id)) atualizar(d, 'despesas', x.despesa_id, { comprovante: null }, usuario, 'Comprovante da conta removido');
  return { arquivos };
}

// --------------------------------------------------------------------------
// Pagamentos pelo banco (nunca automáticos: estas funções só preparam e registram; quem envia é a tela, quem aprova é o app do C6)
// --------------------------------------------------------------------------
/** Só dígitos; aceita 44 (código de barras), 47 (linha digitável de boleto) ou 48 (arrecadação/concessionária). */
export function validarCodigoBarras(texto) {
  const dig = String(texto || '').replace(/\D/g, '');
  if (!dig) throw new C.ErroUsuario('Informe o código de barras ou a linha digitável.');
  if (![44, 47, 48].includes(dig.length)) throw new C.ErroUsuario(`Código de barras com ${dig.length} dígitos: esperava 44, 47 ou 48 (44 é o código de barras, 47 a linha digitável do boleto e 48 a de conta de consumo).`);
  return dig;
}

/** Código de barras de 44 dígitos a partir da linha digitável (47 boleto / 48 arrecadação); 44 volta como está (c6-comum, igual à ponte). */
export const codigoDeBarras = (texto) => K.codigoDeBarrasDaLinha(validarCodigoBarras(texto));

const pagamentosAtivos = (d) => (d.pagamentos_banco || []).filter((p) => !['cancelado', 'erro'].includes(p.situacao));

/** O que vai no ``content`` do C6: código de barras (44), Pix copia e cola ou chave Pix. */
export function conteudoDoPagamento(p) {
  if (p.forma === 'boleto') return codigoDeBarras(p.codigo_barras);
  const t = String(p.pix_copia_cola || p.chave_pix || '').trim();
  if (!t) throw new Error('Informe o Pix copia e cola ou a chave Pix.');
  return t;
}

/** Item no formato de ``POST /v1/schedule_payments/decode`` ({ content, amount, description, transaction_date }). */
export function itemC6(d, p) {
  const i = p.imovel_id ? buscar(d, 'imoveis', p.imovel_id) : null;
  const descricao = (p.descricao || `${i ? `${i.nome} ` : ''}${p.tipo_conta || ''} ${p.competencia ? C.compBr(p.competencia) : ''} ${p.referencia || ''}`).replace(/\s+/g, ' ').trim();
  return { content: conteudoDoPagamento(p), amount: reaisParaC6(p.valor), description: nomeSemAcento(descricao).slice(0, 100), transaction_date: p.data_pagamento || hoje() };
}

function validarPagamento(d, dados) {
  const conf = cfg(d);
  if (!conf.permitir_pagamentos) throw new Error('Os pagamentos pelo banco estão desligados em Dados e backup → Banco.');
  exigirConta(d, dados.conta_id);
  if (!(Number(dados.valor) > 0)) throw new Error('Informe o valor a pagar.');
  if (conf.limite_pagamento > 0 && dados.valor > conf.limite_pagamento) throw new C.ErroUsuario(`O valor (${C.reais(dados.valor)}) passa do limite por pagamento (${C.reais(conf.limite_pagamento)}) definido em Dados e backup → Banco.`);
  if (dados.imovel_id && !buscar(d, 'imoveis', dados.imovel_id)) throw new Error('Imóvel não encontrado.');
  if (!['boleto', 'pix'].includes(dados.forma)) throw new Error('Escolha a forma: boleto (código de barras) ou Pix.');
  const content = conteudoDoPagamento(dados);
  if (pagamentosAtivos(d).some((p) => p.conta_id === dados.conta_id && p.valor === dados.valor && p.content === content && p.situacao !== 'rascunho')) {
    throw new Error('Já existe um pagamento igual (mesma conta, mesmo código e mesmo valor) preparado, enviado ou pago.');
  }
  if (dados.origem && dados.origem.tipo === 'despesa') { const de = buscar(d, 'despesas', dados.origem.id); if (!de) throw new Error('Conta do imóvel não encontrada.'); if (de.pagamento_banco_id && pagamentosAtivos(d).some((p) => p.id === de.pagamento_banco_id)) throw new Error('Esta conta já tem um pagamento pelo banco.'); }
  if (dados.origem && dados.origem.tipo === 'iptu') {
    const p = buscar(d, 'iptus', dados.origem.id);
    const pc = p && parcelasIptu(d, p).find((x) => x.n === Number(dados.origem.n));
    if (!pc) throw new Error('Parcela do IPTU não encontrada.');
    if (pc.paga) throw new Error(`A ${pc.rotulo} parcela do IPTU ${p.ano} já está paga.`);
  }
  if (dados.origem && dados.origem.tipo === 'avulso' && dados.imovel_id && TIPOS_DESPESA.includes(dados.tipo_conta)) {
    const { tipos } = contasPermitidas(d, Number(dados.imovel_id), dados.competencia || hoje().slice(0, 7));
    if (!tipos.includes(dados.tipo_conta)) throw new Error(`Em ${C.compBr(dados.competencia || hoje().slice(0, 7))} o inquilino paga ${dados.tipo_conta}, conforme o contrato. Só entram contas que são nossas.`);
  }
  return content;
}

/**
 * Prepara pagamentos (situação 'rascunho'; nada é enviado). ``itens``: [{ conta_id, imovel_id, origem: { tipo: 'despesa'|'iptu'|'guia_imposto'|'avulso', id, n },
 * tipo_conta, competencia, forma: 'boleto'|'pix', codigo_barras | pix_copia_cola | chave_pix, beneficiario: { nome, documento }, valor (centavos),
 * vencimento, data_pagamento, descricao }]. Cada registro já traz ``content``, ``amount`` (reais), ``description`` (≤100) e ``transaction_date`` do C6.
 * Tudo ou nada: um item inválido lança antes de gravar qualquer um.
 */
export function prepararPagamentos(d, itens, usuario) {
  const prontos = (itens || []).map((x) => {
    const dados = { ...x, conta_id: x.conta_id || (x.imovel_id ? contaSugeridaDoImovel(d, x.imovel_id) : cfg(d).conta_padrao_id), valor: Number(x.valor), forma: x.forma || (x.codigo_barras ? 'boleto' : 'pix') };
    const content = validarPagamento(d, dados);
    return { dados, content };
  });
  if (!prontos.length) throw new Error('Nenhum pagamento para preparar.');
  return prontos.map(({ dados, content }) => {
    const i = dados.imovel_id ? buscar(d, 'imoveis', dados.imovel_id) : null;
    const origem = dados.origem || { tipo: 'avulso', id: null, n: null };
    const de = origem.tipo === 'despesa' ? buscar(d, 'despesas', origem.id) : null;
    const comp = dados.competencia || (de && de.competencia) || hoje().slice(0, 7);
    const p = inserir(d, 'pagamentos_banco', {
      conta_id: dados.conta_id, imovel_id: dados.imovel_id ? Number(dados.imovel_id) : (de ? de.imovel_id : null), origem: { tipo: origem.tipo, id: origem.id ?? null, n: origem.n ?? null },
      tipo_conta: dados.tipo_conta || (de && de.tipo) || (origem.tipo === 'iptu' ? 'IPTU' : origem.tipo === 'guia_imposto' ? 'Imposto' : 'Outra'), competencia: comp,
      forma: dados.forma, codigo_barras: dados.forma === 'boleto' ? validarCodigoBarras(dados.codigo_barras) : null, chave_pix: dados.chave_pix || null, pix_copia_cola: dados.pix_copia_cola || null,
      beneficiario: { nome: (dados.beneficiario && dados.beneficiario.nome) || '', documento: (dados.beneficiario && dados.beneficiario.documento) || '' },
      valor: dados.valor, vencimento: dados.vencimento || null, data_pagamento: dados.data_pagamento || hoje(), descricao: dados.descricao || '',
      content, amount: reaisParaC6(dados.valor), transaction_date: dados.data_pagamento || hoje(),
      situacao: 'rascunho', criado_por: usuario, criado_em: new Date().toISOString(), aprovado_por: null, aprovado_em: null, enviado_em: null, grupo_id: null, id_externo: null,
      referencia: null, pago_em: null, erro: null, movimentacao_id: null, despesa_id: de ? de.id : null, comprovante: null, comprovante_contador: null,
    }, usuario, `Pagamento preparado: ${i ? `${i.nome} · ` : ''}${dados.tipo_conta || ''} ${C.compBr(comp)} de ${C.reais(dados.valor)} pela conta ${apelidoDaConta(d, dados.conta_id)}`);
    atualizar(d, 'pagamentos_banco', p.id, { referencia: `erp-${p.id}`, description: itemC6(d, { ...p, referencia: `erp-${p.id}` }).description }, usuario, 'Referência do pagamento');
    return p;
  });
}

function exigirPagamento(d, pagId) {
  const p = buscar(d, 'pagamentos_banco', pagId);
  if (!p) throw new Error('Pagamento não encontrado.');
  return p;
}

/**
 * Muda a situação de um pagamento (respeitando as transições). Ao virar 'pago': a conta do imóvel é marcada paga (data_pagamento = pago_em,
 * pagamento_banco_id), criada se a origem é avulsa; parcela do IPTU marcada; guia ganha paga_em.
 */
export function atualizarPagamento(d, pagId, { situacao, pago_em = null, erro = null, id_externo = undefined, grupo_id = undefined, beneficiario = undefined, vencimento = undefined }, usuario) {
  const p = exigirPagamento(d, pagId);
  if (!SITUACOES_PAGAMENTO[situacao]) throw new Error(`Situação desconhecida: ${situacao}`);
  const dados = {};
  if (id_externo !== undefined) dados.id_externo = id_externo;
  if (grupo_id !== undefined) dados.grupo_id = grupo_id;
  if (beneficiario !== undefined && beneficiario) dados.beneficiario = { ...(p.beneficiario || {}), ...beneficiario };
  if (vencimento !== undefined && vencimento) dados.vencimento = dataDe(vencimento);
  if (situacao !== p.situacao) {
    if (!TRANSICOES[p.situacao].includes(situacao)) throw new Error(`Um pagamento "${SITUACOES_PAGAMENTO[p.situacao]}" não pode passar a "${SITUACOES_PAGAMENTO[situacao]}".`);
    dados.situacao = situacao;
    dados.erro = situacao === 'erro' ? (erro || 'Erro no banco') : null;
    if (situacao === 'agendado' && !p.enviado_em) dados.enviado_em = new Date().toISOString();
    if (situacao === 'pago') dados.pago_em = dataDe(pago_em) || hoje();
  } else if (erro && situacao === 'erro') dados.erro = erro;
  const i = p.imovel_id ? buscar(d, 'imoveis', p.imovel_id) : null;
  const rotulo = `${i ? `${i.nome} · ` : ''}${p.tipo_conta} ${C.compBr(p.competencia)} de ${C.reais(p.valor)}`;
  atualizar(d, 'pagamentos_banco', p.id, dados, usuario, `Pagamento ${rotulo}: ${SITUACOES_PAGAMENTO[situacao].toLowerCase()}${dados.erro ? ` (${dados.erro})` : ''}`);
  if (dados.situacao === 'pago') efeitosDoPagamento(d, p, dados.pago_em, usuario);
  return p;
}

function efeitosDoPagamento(d, p, pagoEm, usuario) {
  const o = p.origem || {};
  if (o.tipo === 'despesa' && buscar(d, 'despesas', o.id)) {
    atualizar(d, 'despesas', o.id, { data_pagamento: pagoEm, pagamento_banco_id: p.id, comprovante: p.comprovante || buscar(d, 'despesas', o.id).comprovante || null }, usuario, `Conta paga pelo banco em ${C.dataBr(pagoEm)}`);
    atualizar(d, 'pagamentos_banco', p.id, { despesa_id: o.id }, usuario, 'Conta do imóvel ligada');
  } else if (o.tipo === 'avulso' && p.imovel_id && TIPOS_DESPESA.includes(p.tipo_conta)) {
    const [de] = lancarDespesas(d, p.imovel_id, p.competencia, [{ tipo: p.tipo_conta, valor: p.valor, data_pagamento: pagoEm, observacoes: `Paga pelo banco (${apelidoDaConta(d, p.conta_id)})` }], usuario);
    atualizar(d, 'despesas', de.id, { pagamento_banco_id: p.id, comprovante: p.comprovante || null }, usuario, 'Conta paga pelo banco');
    atualizar(d, 'pagamentos_banco', p.id, { despesa_id: de.id }, usuario, 'Conta do imóvel criada');
  } else if (o.tipo === 'iptu' && buscar(d, 'iptus', o.id)) {
    const pc = parcelasIptu(d, buscar(d, 'iptus', o.id)).find((x) => x.n === Number(o.n));
    if (pc && !pc.paga) marcarIptuPago(d, o.id, Number(o.n), pagoEm, usuario);
  } else if (o.tipo === 'guia_imposto' && buscar(d, 'guias_impostos', o.id)) {
    atualizar(d, 'guias_impostos', o.id, { paga_em: pagoEm, pagamento_banco_id: p.id }, usuario, `Guia paga pelo banco em ${C.dataBr(pagoEm)}`);
  }
}

/**
 * Administrador conferiu e aprovou no sistema, no mesmo passo em que envia o lote ("Aprovar e enviar" na tela; a outra confirmação
 * é no app do C6). Só de 'rascunho'. Fica 'aguardando_aprovacao' só se o envio ao banco falhar logo depois. Devolve o pagamento.
 */
export function aprovarPagamento(d, pagId, aprovador) {
  const p = exigirPagamento(d, pagId);
  if (!cfg(d).permitir_pagamentos) throw new Error('Os pagamentos pelo banco estão desligados em Dados e backup → Banco.');
  if (p.situacao !== 'rascunho') throw new Error(`Este pagamento está "${SITUACOES_PAGAMENTO[p.situacao]}" e não pode ser aprovado de novo.`);
  atualizar(d, 'pagamentos_banco', p.id, { situacao: 'aguardando_aprovacao', aprovado_por: aprovador, aprovado_em: new Date().toISOString() }, aprovador,
    `Pagamento de ${C.reais(p.valor)} a ${(p.beneficiario && p.beneficiario.nome) || p.tipo_conta} aprovado por ${aprovador}`);
  return p;
}

/**
 * Registra o lote enviado ao C6 (``POST /decode`` + ``GET /{group_id}/items``). ``ids``: pagamentos do lote, na ordem enviada; ``itensC6``:
 * ``items[]`` ({ id, status, error_message, beneficiary_name, due_date, content, amount… }). Casa cada item pelo content+amount (ou pela ordem).
 * READ_DATA/SCHEDULED/PROCESSING → agendado · PROCESSED → pago · DECODE_ERROR/ERROR → erro · SCHEDULING_CANCELLED → cancelado.
 */
export function registrarGrupoEnviado(d, ids, grupoId, itensC6, usuario) {
  const pags = (ids || []).map((id) => exigirPagamento(d, id));
  const itens = [...(itensC6 || [])];
  const usados = new Set();
  const out = [];
  pags.forEach((p, k) => {
    let idx = itens.findIndex((it, j) => !usados.has(j) && it.content === p.content && centavosDoC6(it.amount ?? p.amount) === p.valor);
    if (idx < 0 && itens[k] && !usados.has(k) && !pags.some((q) => q.content === itens[k].content)) idx = k;
    const item = idx >= 0 ? itens[idx] : null;
    if (idx >= 0) usados.add(idx);
    const situacao = item ? SITUACAO_C6[item.status] || 'agendado' : 'agendado';
    atualizarPagamento(d, p.id, { situacao, erro: item && item.error_message ? item.error_message : null, id_externo: item ? item.id : p.id_externo, grupo_id: grupoId,
      beneficiario: item && item.beneficiary_name ? { nome: item.beneficiary_name } : undefined, vencimento: item ? item.due_date : undefined, pago_em: situacao === 'pago' ? hoje() : null }, usuario);
    out.push(p);
  });
  return out;
}
/** Enviado à ponte/C6 fora de um lote: marca agendado (ou a situação informada). */
export const marcarPagamentoEnviado = (d, pagId, { id_externo = null, situacao = 'agendado', erro = null, grupo_id = null } = {}, usuario) => atualizarPagamento(d, pagId, { situacao, erro, id_externo, grupo_id }, usuario);

/** Atualiza as situações pelos ``items[]`` do grupo (casa por id_externo = item.id). Devolve os pagamentos que mudaram. */
export function atualizarSituacaoPagamentos(d, itensC6, usuario) {
  const mudados = [];
  for (const it of itensC6 || []) {
    const p = (d.pagamentos_banco || []).find((x) => x.id_externo && String(x.id_externo) === String(it.id));
    if (!p) continue;
    const situacao = SITUACAO_C6[it.status];
    if (!situacao || situacao === p.situacao || !TRANSICOES[p.situacao].includes(situacao)) continue;
    atualizarPagamento(d, p.id, { situacao, erro: it.error_message || null, pago_em: situacao === 'pago' ? (it.transaction_date || hoje()) : null, beneficiario: it.beneficiary_name ? { nome: it.beneficiary_name } : undefined }, usuario);
    mudados.push(p);
  }
  return mudados;
}

/**
 * A saída do extrato confirma o pagamento: pagamento vira 'pago' em mov.data (com os efeitos na conta do imóvel/IPTU/guia) e a movimentação fica
 * classificada pela origem do pagamento, ligada a ele e à conta criada.
 */
export function marcarPagoPeloExtrato(d, pagamentoId, movId, usuario) {
  const p = exigirPagamento(d, pagamentoId);
  const mov = exigirMov(d, movId);
  if (mov.tipo !== 'saida') throw new Error('Só uma saída do extrato confirma um pagamento.');
  if (mov.classificacao) throw new Error('Esta movimentação já tem destino. Desfaça antes.');
  if (p.movimentacao_id && p.movimentacao_id !== mov.id) throw new Error('Este pagamento já foi confirmado por outra movimentação do extrato.');
  if (['cancelado'].includes(p.situacao)) throw new Error('Este pagamento está cancelado.');
  if (p.valor !== mov.valor) throw new Error(`O valor da movimentação (${C.reais(mov.valor)}) é diferente do pagamento (${C.reais(p.valor)}).`);
  if (p.situacao !== 'pago') atualizarPagamento(d, p.id, { situacao: 'pago', pago_em: mov.data }, usuario);
  const atual = buscar(d, 'pagamentos_banco', p.id);
  atualizar(d, 'pagamentos_banco', p.id, { movimentacao_id: mov.id }, usuario, 'Pagamento confirmado pelo extrato');
  const o = atual.origem || {};
  atualizar(d, 'movimentacoes_banco', mov.id, { classificacao: classificacaoDaOrigem(o), imovel_id: atual.imovel_id || null, pagamento_banco_id: atual.id,
    despesa_id: atual.despesa_id || null, iptu_id: o.tipo === 'iptu' ? o.id : null, iptu_parcela: o.tipo === 'iptu' ? Number(o.n) : null, guia_imposto_id: o.tipo === 'guia_imposto' ? o.id : null,
    comprovante: mov.comprovante || atual.comprovante || null, comprovante_contador: mov.comprovante_contador || atual.comprovante_contador || null, ...carimbo(usuario) },
  usuario, `Destino: pagamento pelo banco nº ${atual.id} (${atual.tipo_conta} ${C.compBr(atual.competencia)})`);
  if (atual.despesa_id && buscar(d, 'despesas', atual.despesa_id)) atualizar(d, 'despesas', atual.despesa_id, { movimentacao_id: mov.id }, usuario, 'Conta ligada à movimentação do extrato');
  return atual;
}
export const conciliarPagamentoComExtrato = marcarPagoPeloExtrato;

/** Cancela um pagamento: só rascunho, aguardando aprovação ou erro. Agendado: só com ``{ noBanco: true }`` (depois de excluído do lote no C6). */
export function cancelarPagamento(d, pagId, usuario, { noBanco = false, motivo = '' } = {}) {
  const p = exigirPagamento(d, pagId);
  if (p.situacao === 'pago') throw new Error('Este pagamento já foi pago; não dá para cancelar.');
  if (p.situacao === 'cancelado') return p;
  if (p.situacao === 'agendado' && !noBanco) throw new Error('Este pagamento já foi enviado ao banco: cancele o item no lote do C6 (ou no app) antes de cancelar aqui.');
  atualizar(d, 'pagamentos_banco', p.id, { situacao: 'cancelado', erro: motivo || null }, usuario, `Pagamento de ${C.reais(p.valor)} cancelado${motivo ? `: ${motivo}` : ''}`);
  return p;
}

export function pagamentosDo(d, { imovel_id = null, situacao = null, conta_id = null } = {}) {
  return (d.pagamentos_banco || []).filter((p) => (!imovel_id || p.imovel_id === Number(imovel_id)) && (!situacao || p.situacao === situacao) && (!conta_id || p.conta_id === conta_id))
    .sort((a, b) => String(b.data_pagamento).localeCompare(String(a.data_pagamento)) || b.id - a.id);
}

// --------------------------------------------------------------------------
// Configuração (fase 2)
// --------------------------------------------------------------------------
/** Grava os campos da fase 2 em config_banco (nunca a senha da ponte) e registra no histórico. */
export function salvarConfigBanco2(d, campos, usuario) {
  const permitidos = Object.keys(CONFIG_BANCO_FASE2).filter((k) => k !== 'ultima_importacao');
  const novos = {};
  for (const k of permitidos) if (campos[k] !== undefined) novos[k] = campos[k];
  if (novos.tolerancia_dias !== undefined) novos.tolerancia_dias = Math.max(0, Number(novos.tolerancia_dias) || 0);
  if (novos.limite_pagamento !== undefined) novos.limite_pagamento = Math.max(0, Number(novos.limite_pagamento) || 0);
  if (novos.pasta_contador !== undefined) novos.pasta_contador = nomeSemAcento(novos.pasta_contador) || '_Contador';
  if (novos.modelo_nome_comprovante !== undefined && !String(novos.modelo_nome_comprovante).includes('{')) throw new Error('O modelo do nome precisa de pelo menos um campo entre chaves, ex.: {data} {empresa} {imovel} {tipo} {valor}.');
  d.config_banco = { ...(d.config_banco || {}), ...novos };
  registrar(d, usuario, 'Alteração', 'banco', null, 'Configuração do banco (extrato, comprovantes e pagamentos) alterada', novos);
  return d.config_banco;
}
