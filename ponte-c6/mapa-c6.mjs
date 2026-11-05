// Mapa da API "Boleto com Liquidação via Barra ou Pix" (Bolepix v2, OpenAPI 1.2.0) do C6 Bank: caminhos, nomes dos campos, situações,
// carteiras. É o ÚNICO lugar com nomes da API: o site (docs/js/regras.js) e a ponte (ponte-c6/servidor.mjs) montam e leem tudo por aqui.
// ATENÇÃO: este arquivo e ponte-c6/mapa-c6.mjs precisam ser IGUAIS (a ponte é copiada sozinha para o computador do usuário);
// tests/ponte-c6.test.mjs confere. Mude um e copie para o outro.
// Fonte: arquivos OpenAPI oficiais enviados pelo dono (documentacao/c6-openapi/*.yaml, resumo em documentacao/C6_CAMPOS_CONFIRMADOS.md)
// e o "Roteiro de Testes – C6 Developers v3.0". Nada aqui é mais "a confirmar", exceto onde está escrito.

export const VERSAO_MAPA = '2026-11-05-openapi-1.2.0';

/** Endereços da API (mTLS nos dois). Sandbox de boleto funciona de segunda a sexta, das 7h às 22h. */
export const URLS = { sandbox: 'https://baas-api-sandbox.c6bank.info', producao: 'https://baas-api.c6bank.info' };

/** Carteira (``billing_scheme``, obrigatória) por ambiente; a conta pode ter outra configurada. */
export const CARTEIRAS = { sandbox: '21', producao: '15' };

/** Escopos que a credencial precisa ter (roteiro oficial); sem eles o banco responde 403. Vêm em ``scope`` (texto separado por espaço). */
export const ESCOPOS = ['v2.bankslip.read', 'v2.bankslip.write', 'v2.bankslip.pix.write'];

/** Caminhos. ``{id}`` = external_reference_id (nosso, 26 caracteres A-Z0-9, nunca reutilizado). */
export const CAMINHOS = {
  token: '/v1/auth/', // POST form-urlencoded: grant_type=client_credentials, client_id, client_secret → { access_token, expires_in, token_type: 'Bearer', scope }
  boletos: (v = 'v2') => `/${v}/bank_slips`, // POST emitir (201) · GET listar (200; filtros em FILTROS_LISTA; resposta { content[], total_elements, total_pages, page, size })
  boleto: (id, v = 'v2') => `/${v}/bank_slips/${encodeURIComponent(id)}`, // GET consultar (200) · PATCH atualizar parcial (200)
  pdf: (id, v = 'v2') => `/${v}/bank_slips/${encodeURIComponent(id)}/pdf`, // GET (200, application/pdf binário)
  cancelar: (id, v = 'v2') => `/${v}/bank_slips/${encodeURIComponent(id)}/cancel`, // PUT (204) · só cobrança não paga
  negativacao: (id, v = 'v2') => `/${v}/bank_slips/${encodeURIComponent(id)}/denial`, // POST { deadline } agendar (201) · DELETE cancelar (204, só com can_cancel)
  webhooks: '/v1/webhooks', // POST { url, service } · GET ?service= · DELETE ?service=
};

/** Serviço do webhook de boleto com Pix (v1 era BANK_SLIP). O aviso não tem assinatura: serve só para reconsultar o boleto. */
export const SERVICO_WEBHOOK = 'BANK_SLIP_PIX';

/** Filtros da listagem: um intervalo obrigatório (máximo 60 dias); ``page`` começa em 0; ``size`` de 1 a 100 (padrão 20). */
export const FILTROS_LISTA = ['payment_date_from', 'payment_date_to', 'due_date_from', 'due_date_to', 'credit_date_from', 'credit_date_to', 'status', 'external_reference_id', 'page', 'size'];

/** Situações da cobrança no banco. WAITING_CONFIRMATION = pago, ainda não creditado. */
export const STATUS = { criado: 'CREATED', aguardando_credito: 'WAITING_CONFIRMATION', pago: 'PAID', cancelado: ['CANCELED', 'CANCELLED'] };

/** Situações da negativação (``denial_info.status``). */
export const STATUS_NEGATIVACAO = { agendada: 'SCHEDULED', em_andamento: 'IN_PROGRESS', feita: 'DENIAL_SUCCESS', falhou: 'FAILED_TO_DENIAL',
  cancelamento_agendado: 'SCHEDULED_CANCELLATION', cancelando: 'CANCELLATION_IN_PROGRESS', cancelada: 'DENIAL_CANCELED', falhou_cancelar: 'FAILED_TO_CANCEL' };

/** Limites de texto da OpenAPI. */
export const LIMITES = { nome: 40, endereco: 40, bairro: 40, cidade: 40, email: 70, descricao: 100, instrucoes: 4, instrucao: 80, seu_numero: 10, referencia: 26, origem: 20, valor_maximo_reais: 5000000 };

/** Tipo de chave Pix aceito (só chave aleatória cadastrada no C6). */
export const TIPOS_CHAVE_PIX = ['EVP'];

/**
 * Tipos de multa, juros e desconto (``fees``). Decisão do dono: valor cheio em amount, multa PERCENTAGE e juros MONTHLY_PERCENTAGE com prazo 0,
 * desconto em reais (first_discount_value) até o vencimento (first_discount_deadline 0 = dias antes, como o "dead_line" da v1).
 * O enum de discount_type na v2 lista VALUE_PER_DAY e MONTHLY_PERCENTAGE: o tipo fica configurável por conta (confirmar no sandbox no 1º boleto de teste).
 */
export const TIPOS_ENCARGO = { multa: { percentual: 'PERCENTAGE', valor: 'FIXED_VALUE' }, juros: { percentual_mes: 'MONTHLY_PERCENTAGE', valor_dia: 'VALUE_PER_DAY' }, desconto: { valor_dia: 'VALUE_PER_DAY', percentual_mes: 'MONTHLY_PERCENTAGE' } };

/** Notificação ao pagador (``payer_notification[]``): canal, destino (e-mail ou telefone) e momento. Situações na consulta. */
export const NOTIFICACAO = { campo: 'payer_notification', canal: 'channel', destino: 'destination', momento: 'notification_date', situacao: 'status', enviada_em: 'sent_at',
  canais: { email: 'EMAIL', sms: 'SMS' }, momentos: { emissao: 'ISSUE_DATE', antes: 'BEFORE_DUE_DATE', vencimento: 'DUE_DATE', depois: 'AFTER_DUE_DATE' },
  situacoes: ['PENDING', 'SCHEDULED', 'SENT', 'FAILED', 'CANCELED'] };

/**
 * Nomes dos campos do corpo da emissão (POST) e da atualização (PATCH). Chave = nome no sistema, valor = nome na API.
 * Obrigatórios no POST: amount (número em reais, máx. 5.000.000), due_date (≥ hoje), description (≤100), payer, payment_method.
 * PATCH aceita: amount, due_date, description, days_after_due_date, payer{email, address}, payer_notification, fees, payment_method.bank_slip{your_number, instructions}, origin.
 */
export const CAMPOS = {
  referencia: 'external_reference_id', valor: 'amount', vencimento: 'due_date', descricao: 'description', dias_baixa: 'days_after_due_date', origem: 'origin',
  pagador: 'payer', pagador_nome: 'name', pagador_documento: 'tax_id', pagador_email: 'email', pagador_endereco: 'address',
  endereco_rua: 'address', endereco_bairro: 'neighborhood', endereco_cidade: 'city', endereco_uf: 'state', endereco_cep: 'zip_code',
  forma: 'payment_method', boleto: 'bank_slip', carteira: 'billing_scheme', nosso_numero: 'our_number', seu_numero: 'your_number', instrucoes: 'instructions', pix: 'pix', pix_chave: 'key', pix_tipo: 'type',
  encargos: 'fees', multa_tipo: 'fine_type', multa_valor: 'fine_value', multa_prazo: 'fine_deadline', juros_tipo: 'interest_type', juros_valor: 'interest_value', juros_prazo: 'interest_deadline',
  desconto_tipo: 'discount_type', desconto_valor: 'first_discount_value', desconto_prazo: 'first_discount_deadline',
  negativacao_prazo: 'deadline', // POST …/denial { deadline: dias de atraso }
};

/** Nomes dos campos da resposta (emissão, consulta, item da listagem). */
export const RESPOSTA = {
  id: 'id', referencia: 'external_reference_id', situacao: 'status', valor: 'amount', vencimento: 'due_date', emissao: 'emission_date', descricao: 'description', dias_baixa: 'days_after_due_date',
  forma: 'payment_method', boleto: 'bank_slip', linha_digitavel: 'digitable_line', codigo_barras: 'bar_code', nosso_numero: 'our_number', seu_numero: 'number', carteira: 'billing_scheme', originador: 'originator_id', tipo_boleto: 'billing_type',
  pix: 'pix', pix_copia_cola: 'qr_code', pix_imagem: 'image_content', pix_imagem_tipo: 'mime_type', pix_referencia: 'reference',
  pagamentos: 'payments', pagamento_valor: 'amount', pagamento_id: 'external_payment_id', pagamento_data: 'payment_date', pagamento_credito: 'credit_date', pagamento_tipo: 'payment_type', // payments[] vem na listagem; amount em texto "123.45"
  lista: 'content', lista_total: 'total_elements', lista_paginas: 'total_pages', lista_pagina: 'page', lista_tamanho: 'size',
  negativacao: 'denial_info', negativacao_situacao: 'status', negativacao_data: 'denial_date', negativacao_pode_cancelar: 'can_cancel', notificacoes: 'payer_notification',
};

/** Aviso do webhook: { service, status, information (JSON em texto com id, external_reference_id, amount, status, emission_date, due_date…) }. */
export const AVISO_WEBHOOK = { servico: 'service', situacao: 'status', dados: 'information', dados_referencia: 'external_reference_id', dados_valor: 'amount' };
