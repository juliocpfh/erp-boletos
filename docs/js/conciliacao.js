// STUB (Pacote C): regras da conciliação bancária com corpo mínimo, só para a tela funcionar com dados de teste.
// O merge final usa a versão real do Pacote A: as ASSINATURAS abaixo são o contrato entre os pacotes e não mudam.
// Movimentações (movimentacoes_banco) e pagamentos pelo banco (pagamentos_banco): ver documentacao/PLANO_BANCO_FASE2.md, seção 1.
import * as C from './calculos.js';
import * as R from './regras.js';

/** Destino de uma movimentação do extrato. */
export const CLASSIFICACOES = [
  { id: 'aluguel_boleto', rotulo: 'Pagamento de boleto nosso (aluguel)' },
  { id: 'conta_imovel', rotulo: 'Conta do imóvel (água, luz, gás, condomínio, IPTU, outra)' },
  { id: 'transferencia_entre_contas', rotulo: 'Transferência entre as nossas contas' },
  { id: 'tarifa', rotulo: 'Tarifa do banco' },
  { id: 'imposto', rotulo: 'Imposto da empresa' },
  { id: 'receita_outra', rotulo: 'Outra receita' },
  { id: 'despesa_outra', rotulo: 'Outra despesa' },
  { id: 'ignorar', rotulo: 'Não é nosso / ignorar' },
];

/** Situação de um pagamento feito pelo ERP (a API do C6 só valida e manda para aprovação no app; quem paga é quem aprova). */
export const SITUACOES_PAGAMENTO = [
  { id: 'rascunho', rotulo: 'Rascunho' },
  { id: 'validado', rotulo: 'Validado pelo banco' },
  { id: 'enviado_aprovacao', rotulo: 'Aguardando aprovação no app do C6' },
  { id: 'agendado', rotulo: 'Agendado no banco' },
  { id: 'pago', rotulo: 'Pago' },
  { id: 'erro', rotulo: 'Erro no banco' },
  { id: 'cancelado', rotulo: 'Cancelado' },
];

// As tabelas novas entram em TABELAS (regras.js) pelo Pacote A; até lá, o stub garante a lista.
const tabela = (d, t) => { if (!Array.isArray(d[t])) d[t] = []; return d[t]; };
const centavosDe = (x) => (typeof x === 'number' ? Math.round(x) : C.centavos(String(x || '0').replace('.', ',')));
const contaDe = (d, contaId) => ((d.config_banco && d.config_banco.contas) || []).find((c) => c.id === contaId) || null;

/** Lançamentos da ponte → linhas em movimentacoes_banco. Repetida = mesmo (conta_id, id_externo). */
export function importarExtrato(d, contaId, lancamentos, login) {
  const lista = tabela(d, 'movimentacoes_banco');
  const vistas = new Set(lista.filter((m) => m.conta_id === contaId).map((m) => m.id_externo));
  const novas = [];
  let repetidas = 0;
  for (const l of lancamentos || []) {
    const idExterno = String(l.reference || l.id_externo || '');
    if (vistas.has(idExterno)) { repetidas += 1; continue; }
    vistas.add(idExterno);
    const valor = Math.abs(centavosDe(l.valor_centavos ?? l.valor ?? l.amount));
    const tipo = l.tipo || (l.operation_type === 'OUTGOING' ? 'saida' : 'entrada');
    novas.push(R.inserir(d, 'movimentacoes_banco', {
      conta_id: contaId, id_externo: idExterno, data: l.data || l.entry_date, valor, tipo, descricao: l.descricao || l.description || '',
      titulo: l.titulo || l.title || '', categoria_banco: l.categoria_banco || l.categoria || l.transaction_type || '', e2e: l.e2e || l.end_to_end_id || null,
      classificacao: null, imovel_id: null, despesa_id: null, cobranca_id: null, iptu_id: null, iptu_parcela: null, pagamento_banco_id: null,
      par_movimentacao_id: null, nome_arquivo: null, comprovante: null, comprovante_contador: null, comprovante_origem: null, observacoes: '',
      importada_em: new Date().toISOString(),
    }, login, `Extrato ${contaId.toUpperCase()}: ${tipo} de ${C.reais(valor)} em ${C.dataBr(l.data || l.entry_date)} · ${l.descricao || l.description || ''}`));
  }
  return { novas, repetidas };
}

/** Sugestão de destino: boleto em aberto de mesmo valor (entrada), tarifa pela descrição, saída com nome de concessionária. */
export function sugerirClassificacao(d, mov) {
  const txt = `${mov.titulo || ''} ${mov.descricao || ''}`.toUpperCase();
  if (/TARIFA|CESTA|MANUTEN/.test(txt)) return { classificacao: 'tarifa', imovel_id: null, cobranca_id: null, despesa_id: null, motivo: 'descrição de tarifa' };
  if (mov.tipo === 'entrada') {
    const cb = (d.cobrancas || []).find((x) => !x.data_pagamento && x.situacao === 'Em aberto' && C.liquidar(x, mov.data).valor_devido === mov.valor);
    if (cb) {
      const c = R.buscar(d, 'contratos', cb.contrato_id);
      return { classificacao: 'aluguel_boleto', imovel_id: c ? c.imovel_id : null, cobranca_id: cb.id, despesa_id: null, motivo: `mesmo valor do boleto de ${C.compBr(cb.competencia)}` };
    }
    return { classificacao: null, imovel_id: null, cobranca_id: null, despesa_id: null, motivo: '' };
  }
  if (/SANEPAR|COPEL|COMPAGAS|CONDOMINIO|IPTU|PREFEITURA/.test(txt)) {
    const chave = /SANEPAR/.test(txt) ? 'sanepar_matricula' : /COPEL/.test(txt) ? 'copel_uc' : null;
    const i = chave ? (d.imoveis || []).find((x) => x[chave] && txt.includes(String(x[chave]))) : null;
    return { classificacao: 'conta_imovel', imovel_id: i ? i.id : null, cobranca_id: null, despesa_id: null, motivo: i ? `número da conta do imóvel ${i.nome}` : 'parece conta de consumo' };
  }
  return { classificacao: null, imovel_id: null, cobranca_id: null, despesa_id: null, motivo: '' };
}

/** Boletos pagos segundo o C6 (lista de bank_slips com payments[]) × boletos em aberto no ERP. */
export function conciliarBoletos(d, contaId, pagamentosC6) {
  const out = [];
  for (const b of pagamentosC6 || []) {
    const ref = b.external_reference_id || b.id_externo || null;
    const pag = (b.payments || [])[0] || b;
    const valor = centavosDe(pag.amount ?? pag.valor ?? b.amount);
    const cb = (d.cobrancas || []).find((x) => !x.data_pagamento && ((ref && x.banco && x.banco.id_externo === ref) || (!ref && C.liquidar(x, pag.credit_date || pag.data_credito || C.hojeIso()).valor_devido === valor)));
    if (cb) out.push({ cobranca_id: cb.id, data_credito: pag.credit_date || pag.data_credito || C.hojeIso(), valor, external_reference_id: ref });
  }
  return out;
}

/** Dá baixa no boleto com a data de crédito e o valor que o banco informou; liga a movimentação, se houver. */
export function confirmarPagamentoPeloBanco(d, cobrancaId, pagamento, login) {
  const r = R.registrarPagamento(d, cobrancaId, pagamento.data_credito, pagamento.valor, login);
  if (pagamento.movimentacao_id) {
    const cb = R.buscar(d, 'cobrancas', cobrancaId);
    const c = cb && R.buscar(d, 'contratos', cb.contrato_id);
    R.atualizar(d, 'movimentacoes_banco', pagamento.movimentacao_id, { classificacao: 'aluguel_boleto', cobranca_id: cobrancaId, imovel_id: c ? c.imovel_id : null }, login, 'Movimentação ligada ao pagamento do boleto');
  }
  return r;
}

export function vincularMovimentacao(d, movId, dados, login) {
  const m = R.buscar(d, 'movimentacoes_banco', movId);
  if (!m) throw new Error('Movimentação não encontrada.');
  if (m.classificacao && dados.classificacao && m.classificacao !== dados.classificacao) throw new Error('Esta movimentação já tem destino. Desfaça antes.');
  const campos = { classificacao: dados.classificacao || null, imovel_id: dados.imovel_id || null, despesa_id: dados.despesa_id || null, cobranca_id: dados.cobranca_id || null,
    iptu_id: dados.iptu_id || null, iptu_parcela: dados.iptu_parcela ?? null, observacoes: dados.observacoes || '' };
  return R.atualizar(d, 'movimentacoes_banco', movId, campos, login, 'Destino da movimentação definido');
}

export function desvincularMovimentacao(d, movId, login) {
  const m = R.buscar(d, 'movimentacoes_banco', movId);
  if (!m) throw new Error('Movimentação não encontrada.');
  if (m.cobranca_id && (R.buscar(d, 'cobrancas', m.cobranca_id) || {}).data_pagamento) throw new Error("Desfaça o pagamento do boleto na tela Boletos (botão 'Desfazer pagamento').");
  return R.atualizar(d, 'movimentacoes_banco', movId, { classificacao: null, imovel_id: null, despesa_id: null, cobranca_id: null, iptu_id: null, iptu_parcela: null }, login, 'Destino da movimentação desfeito');
}

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim();

/** "2026-11-05 ANK Loja 1 Agua 123,45" (sem extensão, sem acento). */
export function nomePadraoComprovante(d, mov) {
  const conta = contaDe(d, mov.conta_id);
  const empresa = conta ? conta.apelido || conta.id.toUpperCase() : String(mov.conta_id || '').toUpperCase();
  const i = mov.imovel_id ? R.buscar(d, 'imoveis', mov.imovel_id) : null;
  const desp = mov.despesa_id ? R.buscar(d, 'despesas', mov.despesa_id) : null;
  const cb = mov.cobranca_id ? R.buscar(d, 'cobrancas', mov.cobranca_id) : null;
  const c = cb ? R.buscar(d, 'contratos', cb.contrato_id) : null;
  const rotulo = { tarifa: 'Tarifa', transferencia_entre_contas: 'Transferencia', imposto: 'Imposto', receita_outra: 'Receita', despesa_outra: 'Despesa', ignorar: 'Ignorada' };
  const tipo = desp ? desp.tipo : c ? `Aluguel ${c.inquilino_nome}` : rotulo[mov.classificacao] || (mov.classificacao === 'conta_imovel' ? 'Conta' : mov.tipo === 'entrada' ? 'Entrada' : 'Saida');
  return semAcento(`${mov.data} ${empresa} ${i ? i.nome : 'Geral'} ${tipo} ${C.reais(mov.valor, false)}`).slice(0, 120);
}

export function registrarComprovante(d, movId, { nome_arquivo, comprovante, comprovante_contador, origem }, login) {
  return R.atualizar(d, 'movimentacoes_banco', movId, { nome_arquivo: nome_arquivo || null, comprovante: comprovante || null, comprovante_contador: comprovante_contador || null, comprovante_origem: origem || null },
    login, `Comprovante guardado: ${comprovante || comprovante_contador || nome_arquivo}`);
}

/** Cria os pagamentos como rascunho. ``itens``: [{ conta_id, imovel_id, tipo_conta, competencia, codigo, valor, data_pagamento, despesa_id }]. Devolve os ids. */
export function prepararPagamentos(d, itens, login) {
  tabela(d, 'pagamentos_banco');
  return (itens || []).map((x) => {
    if (!(x.valor > 0)) throw new Error(`${x.tipo_conta || 'Conta'}: informe o valor.`);
    if (!String(x.codigo || '').trim()) throw new Error(`${x.tipo_conta || 'Conta'}: informe o código de barras ou o Pix copia e cola.`);
    const i = x.imovel_id ? R.buscar(d, 'imoveis', x.imovel_id) : null;
    const p = R.inserir(d, 'pagamentos_banco', { conta_id: x.conta_id, imovel_id: x.imovel_id || null, despesa_id: x.despesa_id || null, tipo_conta: x.tipo_conta || 'Outra', competencia: x.competencia || null,
      codigo: String(x.codigo).trim(), valor: x.valor, data_pagamento: x.data_pagamento || C.hojeIso(), beneficiario: null, vencimento: null, situacao: 'rascunho',
      grupo_id: null, item_id: null, erro: null, criado_por: login, criado_em: new Date().toISOString(), enviado_por: null, enviado_em: null, pago_em: null, movimentacao_id: null, observacoes: x.observacoes || '' },
    login, `Pagamento preparado: ${x.tipo_conta || 'conta'}${i ? ` de ${i.nome}` : ''} · ${C.reais(x.valor)}`);
    p.referencia = `erp-${p.id}`;
    return p.id;
  });
}

const idDoItem = (it) => { const m = /erp-(\d+)/.exec(`${it.description || ''} ${it.referencia || ''}`); return m ? Number(m[1]) : null; };
const SITUACAO_C6 = { READ_DATA: 'validado', DECODE_ERROR: 'erro', ERROR: 'erro', PROCESSED: 'pago', SCHEDULED: 'agendado', PROCESSING: 'agendado', SCHEDULING_CANCELLED: 'cancelado' };

/** Depois de "Enviar para aprovação": guarda o grupo e marca enviado_aprovacao. */
export function registrarGrupoEnviado(d, ids, grupoId, itensC6, login) {
  for (const id of ids) {
    const it = (itensC6 || []).find((x) => idDoItem(x) === id) || null;
    R.atualizar(d, 'pagamentos_banco', id, { grupo_id: grupoId, item_id: it ? it.id : null, situacao: 'enviado_aprovacao', enviado_por: login, enviado_em: new Date().toISOString(),
      beneficiario: it ? it.beneficiary_name || null : null, vencimento: it ? it.due_date || null : null }, login, `Pagamento enviado para aprovação no app do C6 (grupo ${grupoId})`);
  }
}

/** Itens do grupo (GET /{group_id}/items) → situação de cada pagamento (pelo "erp-<id>" na descrição). */
export function atualizarSituacaoPagamentos(d, itensC6, login) {
  let mudou = 0;
  for (const it of itensC6 || []) {
    const id = idDoItem(it);
    const p = id && R.buscar(d, 'pagamentos_banco', id);
    if (!p || ['pago', 'cancelado'].includes(p.situacao)) continue;
    const nova = SITUACAO_C6[it.status] || p.situacao;
    const situacao = p.situacao === 'enviado_aprovacao' && nova === 'validado' ? p.situacao : nova;
    const m = R.atualizar(d, 'pagamentos_banco', p.id, { situacao, item_id: it.id || p.item_id, beneficiario: it.beneficiary_name || p.beneficiario, vencimento: it.due_date || p.vencimento,
      erro: it.error_message || null, pago_em: situacao === 'pago' ? (p.pago_em || C.hojeIso()) : p.pago_em }, login, `Situação do pagamento: ${situacao}`);
    if (Object.keys(m).length) mudou += 1;
  }
  return mudou;
}

export function marcarPagoPeloExtrato(d, pagamentoId, movId, login) {
  const p = R.buscar(d, 'pagamentos_banco', pagamentoId);
  const m = R.buscar(d, 'movimentacoes_banco', movId);
  if (!p || !m) throw new Error('Pagamento ou movimentação não encontrados.');
  R.atualizar(d, 'pagamentos_banco', p.id, { situacao: 'pago', pago_em: m.data, movimentacao_id: m.id }, login, `Pagamento confirmado pelo extrato (${C.dataBr(m.data)})`);
  R.atualizar(d, 'movimentacoes_banco', m.id, { classificacao: m.classificacao || 'conta_imovel', imovel_id: m.imovel_id || p.imovel_id, pagamento_banco_id: p.id }, login, 'Movimentação ligada ao pagamento pelo banco');
}

export function cancelarPagamento(d, pagamentoId, login) {
  const p = R.buscar(d, 'pagamentos_banco', pagamentoId);
  if (!p) throw new Error('Pagamento não encontrado.');
  if (!['rascunho', 'validado'].includes(p.situacao)) throw new Error('Só rascunhos e pagamentos validados podem ser cancelados aqui. Depois de enviado, cancele no app do C6.');
  return R.atualizar(d, 'pagamentos_banco', p.id, { situacao: 'cancelado' }, login, 'Pagamento cancelado');
}
