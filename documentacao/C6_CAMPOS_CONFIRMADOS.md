# C6 Bank: campos confirmados pelos arquivos OpenAPI oficiais

Os arquivos originais estão em `documentacao/c6-openapi/` (enviados pelo dono em 05/11/2026). Este resumo é o que a ponte
(`ponte-c6/`) e o sistema usam; em dúvida, vale o YAML. Substitui o que `PESQUISA_API_C6.md` marcava como "a confirmar".

## Autenticação (`autenticacao.yaml` 1.1.3)
`POST /v1/auth/` form-urlencoded `client_id`, `client_secret`, `grant_type=client_credentials`, com mTLS (.crt + .key).
Resposta: `access_token`, `expires_in` (segundos; exemplo 600), `token_type: Bearer`, `scope` (texto com escopos separados por espaço).
Sandbox funciona seg–sex 07h–22h. Produção: chaves geradas no Web Banking.

## Boleto com Pix (`bolepix.yaml` 1.2.0) — base `/v2/bank_slips`
- **Emitir** `POST /v2/bank_slips` (201). Obrigatórios: `amount` (número em **reais**, máx. 5.000.000), `due_date` (≥ hoje), `description` (≤100), `payer`, `payment_method`.
  Opcionais: `external_reference_id` (26 caracteres `[A-Z0-9]`, nunca reutilizar; sempre enviar o nosso), `days_after_due_date` (dias após o vencimento em que expira), `fees`, `payer_notification[]`, `origin` (≤20, ex.: "ERP").
- `payer`: `name` (≤40), `tax_id` (só dígitos, 11 ou 14), `email` (≤70), `address{address (logradouro + número, ≤40), neighborhood (≤40), city (≤40), state (UF), zip_code (8 dígitos)}` — todos de address obrigatórios.
- `payment_method.bank_slip`: `billing_scheme` (carteira: "15" produção, "21" sandbox) obrigatório; `our_number` (1–10 dígitos, opcional, o banco gera), `your_number` (1–10 dígitos: nosso controle, ex.: id do boleto), `instructions` (até 4 linhas de 80).
  `payment_method.pix`: `key` (chave **aleatória (EVP)** cadastrada no C6) e `type: "EVP"`; sem eles o boleto sai sem Pix.
- `fees`: `fine_type` FIXED_VALUE|PERCENTAGE, `fine_value`, `fine_deadline` (dias após o vencimento); `interest_type` VALUE_PER_DAY|MONTHLY_PERCENTAGE, `interest_value`, `interest_deadline`; `discount_type` VALUE_PER_DAY|MONTHLY_PERCENTAGE, `first_discount_value`, `first_discount_deadline` (dias antes do vencimento). **Não há desconto de valor fixo até o vencimento.**
- `payer_notification[]`: `{ channel: EMAIL|SMS, destination (e-mail ou telefone), notification_date: ISSUE_DATE|BEFORE_DUE_DATE (D-1)|DUE_DATE|AFTER_DUE_DATE (D+1) }`.
- Resposta da emissão: `id`, `external_reference_id`, `amount`, `due_date`, `payment_method.bank_slip{originator_id, billing_scheme, billing_type, digitable_line, bar_code, our_number, number}`, `payment_method.pix{qr_code (copia e cola), image_content (PNG em base64), mime_type, reference}`.
- **Consultar** `GET /v2/bank_slips/{external_reference_id}`: além dos campos acima, `emission_date`, `description`, `days_after_due_date`, `status` (CREATED | WAITING_CONFIRMATION = pago, ainda não creditado | PAID | CANCELED), `payer`, `fees`, `origin`, `denial_info`, `payer_notification[]` com `status` (PENDING, SCHEDULED, SENT, FAILED, CANCELED) e `sent_at`.
- **Listar** `GET /v2/bank_slips` (um intervalo obrigatório: `payment_date_from/to`, `due_date_from/to` ou `credit_date_from/to`, máx. 60 dias; `status`; `external_reference_id`; `page` (começa em 0), `size` (1–100, padrão 20)). Resposta: `content[]` (cada item = consulta + `payments[]{amount (texto "123.45"), external_payment_id, payment_date, credit_date, payment_type BANK_SLIP|PIX}`), `total_elements`, `total_pages`, `page`, `size`.
- **Atualizar** `PATCH /v2/bank_slips/{id}` (200): `amount`, `due_date`, `description`, `days_after_due_date`, `payer{email, address}`, `payer_notification[]`, `fees`, `payment_method.bank_slip{your_number, instructions}`, `origin`.
- **PDF** `GET /v2/bank_slips/{id}/pdf` (`application/pdf`, binário). **Cancelar** `PUT /v2/bank_slips/{id}/cancel` (204).
- **Negativação** `POST /v2/bank_slips/{id}/denial` body `{ deadline: dias de atraso }` (201: `id`, `external_reference_id`, `status`, `denial_date`); `DELETE .../denial` (204, só com `can_cancel`). Status: SCHEDULED, IN_PROGRESS, DENIAL_SUCCESS, FAILED_TO_DENIAL, SCHEDULED_CANCELLATION, CANCELLATION_IN_PROGRESS, DENIAL_CANCELED, FAILED_TO_CANCEL.
- Cabeçalhos opcionais em tudo: `partner-software-name`, `partner-software-version`.

## Boleto v1 (`boleto-v1-antiga.yaml` 1.7.3) — em desativação, substituída pela Bolepix
Serve como referência da lógica de desconto que o dono já usa: `discount { discount_type: "V" (valor) | "P" (percentual), first/second/third { value, dead_line } }`, com `dead_line` = dias **antes** do vencimento em que o desconto vale (0 = até o vencimento; até três faixas decrescentes). `fine { type V|P, value, dead_line }` (multa única) e `interest { type V|P, value, dead_line }` (P = percentual mensal ÷ 30 por dia). `external_reference_id` na v1 tem 1–10 caracteres; PDF vem em JSON `base64_pdf_file`; status CREATED, PAID, CANCELLED. Na Bolepix (v2) os equivalentes são `fees.first_discount_value` + `first_discount_deadline` (desconto fixo até o vencimento = valor + prazo 0), `fine_*` e `interest_*`.

## Notificações / webhook (`notificacoes-webhook.yaml`) — base `/v1/webhooks`
`POST /` registra (`url`, `service`), `GET /` consulta, `DELETE /` exclui. Serviços: `BANK_SLIP` (v1), `BANK_SLIP_PIX` (boleto com Pix), `CHECKOUT`; Pix usa o webhook próprio da API Pix (`PUT /v2/pix/webhook/{chave}`).
Payload: `service`, `status` (CREATED, WAITING_CONFIRMATION, PAID, CANCELED…), `information` (**JSON em texto** com id, external_reference_id, amount, status, emission_date, due_date…).
**Sem assinatura digital nem cabeçalho de autenticação**: a ponte trata o webhook só como "aviso para reconsultar" e nunca dá baixa sem consultar o boleto na API.

## Saldo e extrato (`saldo-extrato.yaml` 2.0.1) — base `/v1/statement` (só PJ)
- `GET /v1/statement/?start_date=AAAA-MM-DD&end_date=AAAA-MM-DD` (máx. 30 dias por consulta; sem limite de retenção). Resposta `entries[]`:
  `reference` (**identificador único e estável: chave da conciliação e da de-duplicação**), `local_reference`, `created_at` (data-hora), `entry_date` (data contábil), `amount` (texto "1500.00", sempre positivo), `operation_type` INCOMING|OUTGOING, `transaction_type` (PAYMENT, TRANSFER, PAYMENT_REVERSAL, CREDIT_PIX_PAYMENT_RECEIVED, CREDIT_QRCODE_PIX_PAYMENT_RECEIVED, DEBIT_PIX_PAYMENT_REALIZED, CREDIT_PIX_DEVOLUTION_RECEIVED, DEBIT_PIX_DEVOLUTION_SENT, DIRECT_DEBIT_AGREEMENT, VEHICLE_TAX, CREDIT_CARD_SALE, DEBIT_CARD_SALE, FUND, OTHER…), `title` (ex.: "Pix Recebido"), `description`, `end_to_end_id` (Pix).
- `GET /v1/statement/balance`: `date`, `currency_code`, `available`, `locked`, `future`, `charges`, `limit{total, used, available}`, `exceeds_limit{...}`, `total_available`, `limit_used_type` CDB|OVERDRAFT|NONE.

## Agendamento de pagamentos (`agendamento-de-pagamentos.yaml` 1.1.0) — base `/v1/schedule_payments`
A API **não paga**: ela valida e envia lotes para aprovação de alguém autorizado no Web Banking/app. Aceita **boleto (código de barras de 44 dígitos), Pix copia e cola (BR Code) e chave Pix**.
1. `POST /decode` body `{ items: [{ content, amount, description (≤100, aparece na tela de aprovação), transaction_date (data em que deve ser pago; sem ela, hoje) }] }` → 201 `{ group_id }`. O banco valida linha digitável/chave e completa os dados.
2. `GET /{group_id}/items` → `items[]{ id, content, amount, description, bank_code, bank_name, beneficiary_name, payer_name, due_date, overdue, product_type BOLETO|PIX, status (READ_DATA ok | DECODE_ERROR | ERROR | PROCESSED pago | SCHEDULED | PROCESSING | SCHEDULING_CANCELLED), error_message, transaction_date }`.
3. `DELETE /{group_id}/items` (body `[{ id }]`) ou `DELETE /{group_id}/items/{item_id}` → 204.
4. `POST /submit` body `{ group_id, uploader_name }` → 204 (enviado para aprovação; depois disso o lote não muda mais pela API).
- DDA: `GET /query` → `items[]{ content (código de barras para o decode), amount, bank_code, bank_name, beneficiary_name, payer_name, due_date, overdue }`.
- Não há consulta de status depois da aprovação fora de `GET /{group_id}/items`; a confirmação final do pagamento sai no **extrato** (`transaction_type` PAYMENT / DEBIT_PIX_PAYMENT_REALIZED).

## Pix (`pix.yaml` 3.0.1) — base `/v2/pix`, padrão Bacen
`/cob` (cobrança imediata), `/cobv` (com vencimento), `/lotecobv`, `/loc` (QR estático), `/pix/{e2eid}` e `/pix?inicio&fim` (recebidos), devolução, `/webhook/{chave}`. Usado só se o ERP quiser Pix sem boleto; o boleto com Pix já cobre o aluguel.

## C6 Pay (`c6pay-transacoes-recebiveis.yaml`)
Maquininha: recebíveis e transações. Não usado pelo ERP.

## Decisões de mapeamento para o ERP (definidas pelo dono em 05/11/2026)
- Valores: o ERP guarda centavos; a API usa número em reais com duas casas. Converter nos dois sentidos com arredondamento exato (`centavos / 100`), e ler `amount` do extrato/pagamentos como texto → centavos.
- **Boleto pelo valor cheio, com desconto até o vencimento** (mesma lógica que o dono já usa no Web Banking do C6): `amount` = aluguel cheio + IPTU + seguro + tarifa (o "após vencimento" do ERP); desconto = bonificação, em valor fixo (`fees.first_discount_value`) válido até o vencimento (`first_discount_deadline` = 0; configurável para X dias antes); multa (`fine_type PERCENTAGE`) e juros (`interest_type MONTHLY_PERCENTAGE`) sobre o valor cheio, como o ERP calcula. **Quem paga atrasado perde o desconto; isso não é multa.** A v1 confirma a lógica (desconto em valor com `dead_line` 0 = até o vencimento); na v2 o valor do tipo (`discount_type`) fica parametrizável por conta e é confirmado no sandbox no primeiro boleto de teste.
- **Notificação ao pagador: automática e personalizável.** Por conta (padrão) e por contrato (exceção): canais (EMAIL, SMS ou os dois), momentos (ISSUE_DATE, BEFORE_DUE_DATE, DUE_DATE, AFTER_DUE_DATE), destino = e-mail/telefone do inquilino no cadastro; o status de entrega aparece na consulta do boleto.
- **Negativação: disponível**, com prazo (dias de atraso) configurável por conta; só o administrador agenda, com confirmação dupla; cancelamento quando `can_cancel`.
- `external_reference_id`: gerado pelo ERP e guardado em `cobrancas[].banco.id_externo` (26 caracteres: prefixo da conta + id do boleto + aleatório); `your_number` = id do boleto no ERP.
- Conciliação de boletos: webhook (aviso) + `GET /v2/bank_slips?payment_date_from/to` por conta, usando `payments[].credit_date` como data contábil do pagamento.
- Conciliação do extrato: chave `reference`; nunca importar o mesmo `reference` duas vezes.
