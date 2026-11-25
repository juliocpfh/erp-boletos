# C6 Bank: API "Boleto com Liquidação via Barra ou Pix" (Bolepix) — versão 1.2.0

Cópia resumida da página oficial https://developers.c6bank.com.br/apis/bolepix (enviada pelo dono em 05/11/2026; o ambiente de
desenvolvimento não acessa o portal). Os **campos** do corpo de emissão/atualização e das respostas não estão nesta página
(ficam no arquivo OpenAPI `developers.c6bank.com.br/yamls/bolepix.yaml`): até lê-lo, valem os campos de `PESQUISA_API_C6.md`, marcados "A CONFIRMAR".

## O que a API faz
Emissão de cobrança com boleto e, opcionalmente, QR Code Pix; juros e multa após o vencimento; desconto por antecipação; consulta;
listagem com filtros por data e status; PDF; atualização parcial; cancelamento (baixa) de cobrança não paga; agendamento e
cancelamento de **negativação** do pagador no birô de crédito; **notificações ao pagador** (e-mail ou SMS).

## Carteiras
Produção: **15** · Sandbox: **21**.

## Notificação ao pagador (`payer_notification`)
Na emissão, escolhe-se o canal (`channel`: e-mail ou SMS) e o momento (`notification_date`); cada combinação gera uma notificação.
Alterar vencimento ou valor cancela as não enviadas e agenda um conjunto novo (as já `SENT` não repetem). Cancelar a cobrança
põe todas em `CANCELED`. O status de cada notificação vem no campo `payer_notification` da consulta.

## Ambientes
| Ambiente | Host | Path |
|---|---|---|
| Sandbox | https://baas-api-sandbox.c6bank.info | /v2/bank_slips/ |
| Produção | https://baas-api.c6bank.info | /v2/bank_slips/ |

## Endpoints
| Operação | Método e caminho | Observações |
|---|---|---|
| Listar cobranças | `GET /v2/bank_slips` | Obrigatório ao menos um intervalo: `payment_date_from/to`, `due_date_from/to` ou `credit_date_from/to` (AAAA-MM-DD, **máximo 60 dias**); filtros `status` (CREATED, PAID, CANCELED, WAITING_CONFIRMATION = pago mas ainda não creditado), `external_reference_id`; paginação `page`, `size`. 200 |
| Emitir cobrança | `POST /v2/bank_slips` | JSON. 201 |
| Consultar cobrança | `GET /v2/bank_slips/{external_reference_id}` | 200 |
| PDF | `GET /v2/bank_slips/{external_reference_id}/pdf` | 200 |
| Atualizar (parcial) | `PATCH /v2/bank_slips/{external_reference_id}` | JSON. 200 (o roteiro de homologação cita amount, due_date, description) |
| Cancelar (baixa) | `PUT /v2/bank_slips/{external_reference_id}/cancel` | 204; só cobrança não paga |
| Agendar negativação | `POST /v2/bank_slips/{external_reference_id}/denial` | JSON. 201; só se `due_date` ≥ data de emissão |
| Cancelar negativação | `DELETE /v2/bank_slips/{external_reference_id}/denial` | 204; só quando `can_cancel` = true; passa a `SCHEDULED_CANCELLATION` |

`external_reference_id` é o identificador escolhido pelo integrador (o ERP) e usado em todas as operações.
Erros 4XX/5XX: ver a página de erros do portal (`/apis/errors`).

## Uso no ERP (decisões)
- Conciliação diária: `GET /v2/bank_slips?payment_date_from&payment_date_to` (ou `credit_date`) por conta, além do webhook.
- Negativação e notificação ao pagador ficam disponíveis como opções (desligadas por padrão); negativar exige confirmação do administrador.
