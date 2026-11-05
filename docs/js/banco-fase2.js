// STUB (Pacote C): cliente da ponte C6 para extrato, saldo, boletos pagos, DDA, pagamentos agendados e comprovantes.
// O merge final usa a versão real do Pacote B (que chama `chamarPonte` de banco.js). As ASSINATURAS abaixo não mudam.
// Em `?teste` devolve dados fictícios, para a tela Banco ser testada sem a ponte.

const teste = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('teste');
const semPonte = () => { throw new Error("A ponte com o banco não respondeu. Abra o programa 'Ponte C6' neste computador e tente de novo. O que já foi importado continua aqui."); };

/** Lançamentos fictícios do mês (formato do extrato do C6: reference, entry_date, amount em reais, operation_type, transaction_type, title, description). */
function extratoDeTeste(contaId, de) {
  const mes = String(de).slice(0, 7);
  const dia = (n) => `${mes}-${String(n).padStart(2, '0')}`;
  const l = (n, amount, op, tipo, title, description, extra = {}) => ({ reference: `${contaId}-${mes}-${n}`, entry_date: dia(n), amount, operation_type: op, transaction_type: tipo, title, description, ...extra });
  return [
    l(3, '1218.50', 'INCOMING', 'CREDIT_PIX_PAYMENT_RECEIVED', 'Pix Recebido', 'PIX RECEBIDO MARIA EXEMPLO', { end_to_end_id: 'E00000000202611031200ABCDEFGHIJK' }),
    l(5, '123.45', 'OUTGOING', 'PAYMENT', 'Pagamento de conta', 'PAGAMENTO SANEPAR MATRICULA 123456'),
    l(7, '200.00', 'OUTGOING', 'PAYMENT', 'Pagamento de conta', 'PAGAMENTO COPEL UC 7890'),
    l(10, '19.90', 'OUTGOING', 'FUND', 'Tarifa', 'TARIFA MENSAL PACOTE DE SERVICOS'),
    l(12, '500.00', 'OUTGOING', 'TRANSFER', 'Transferência enviada', `TED PARA ${contaId === 'ank' ? 'JCK' : 'ANK'} ADMINISTRADORA`),
    l(15, '800.00', 'INCOMING', 'CREDIT_PIX_PAYMENT_RECEIVED', 'Pix Recebido', 'PIX RECEBIDO JOAO DA SILVA'),
  ];
}

export async function extratoDaConta(contaId, de, ate) {
  if (teste()) return { lancamentos: extratoDeTeste(contaId, de) };
  return semPonte();
}

export async function saldoDaConta(contaId) {
  if (teste()) return { available: '12345.67', total_available: '12345.67', date: new Date().toISOString().slice(0, 10) };
  return semPonte();
}

/** Boletos pagos no período (GET /v2/bank_slips?credit_date_from/to): content[] com external_reference_id e payments[]. */
export async function boletosPagos(contaId, de, ate) {
  if (teste()) return [{ external_reference_id: null, amount: '1218.50', status: 'PAID', payments: [{ amount: '1218.50', payment_date: `${String(de).slice(0, 7)}-03`, credit_date: `${String(de).slice(0, 7)}-03`, payment_type: 'PIX' }] }];
  return semPonte();
}

export async function ddaDaConta(contaId) {
  if (teste()) return { items: [] };
  return semPonte();
}

let grupoTeste = 0;
const gruposTeste = {};

/** POST /decode: itens [{ content, amount, description, transaction_date }] → { group_id }. */
export async function decodificarPagamentos(contaId, itens) {
  if (!teste()) return semPonte();
  grupoTeste += 1;
  const group_id = `grupo-teste-${grupoTeste}`;
  gruposTeste[group_id] = itens.map((x, n) => {
    const digitos = String(x.content || '').replace(/\D/g, '');
    const ok = digitos.length >= 44 || /^0002/.test(String(x.content || ''));
    return { id: `item-${grupoTeste}-${n + 1}`, content: x.content, amount: x.amount, description: x.description, transaction_date: x.transaction_date,
      bank_code: ok ? '341' : null, bank_name: ok ? 'Banco de teste' : null, beneficiary_name: ok ? 'BENEFICIARIO DE TESTE S.A.' : null, payer_name: 'EMPRESA DE TESTE', due_date: ok ? x.transaction_date : null, overdue: false,
      product_type: /^0002/.test(String(x.content || '')) ? 'PIX' : 'BOLETO', status: ok ? 'READ_DATA' : 'DECODE_ERROR', error_message: ok ? null : 'Código de barras inválido (precisa de 44, 47 ou 48 dígitos)' };
  });
  return { group_id };
}

export async function itensDoGrupo(contaId, grupoId) {
  if (!teste()) return semPonte();
  return { items: gruposTeste[grupoId] || [] };
}

export async function removerItensDoGrupo(contaId, grupoId, ids) {
  if (!teste()) return semPonte();
  gruposTeste[grupoId] = (gruposTeste[grupoId] || []).filter((x) => !ids.includes(x.id));
}

export async function enviarGrupoParaAprovacao(contaId, grupoId, uploaderName) {
  if (!teste()) return semPonte();
  for (const it of gruposTeste[grupoId] || []) if (it.status === 'READ_DATA') it.status = 'SCHEDULED';
}

/** PDF do comprovante de uma movimentação (reference do extrato). */
export async function baixarComprovantePonte(contaId, reference) {
  if (!teste()) return semPonte();
  const texto = `Comprovante de teste - conta ${contaId} - lancamento ${reference}`;
  const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${texto.length + 40}>>stream\nBT /F1 12 Tf 40 800 Td (${texto}) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}
