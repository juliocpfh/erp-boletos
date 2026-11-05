# C6 Bank: resumo do "Roteiro de Testes – C6 Developers v3.0"

Resumo do roteiro oficial de homologação do C6 (documento do banco, enviado pelo dono; o original não fica no repositório).
Serve de referência para a ponte (`ponte-c6/`) e para a fase 2 (extrato, pagamentos). Onde o roteiro é omisso, vale `PESQUISA_API_C6.md`.

## Como funciona a homologação
- Preencher o roteiro com o **status code** e o **response body** de cada teste feito no sandbox e enviar para **homologacaoapi@c6bank.com**.
- Só marcar as APIs que o sistema usa. Autenticação é obrigatória para todas.
- Erro `403 Forbidden` em qualquer API = escopo faltando na credencial (a resposta do `/auth` lista os escopos liberados).

## Autenticação (AT_01)
`POST /auth`, `Content-Type: application/x-www-form-urlencoded`, body `client_id`, `client_secret`, `grant_type=client_credentials`, com o certificado (.crt e .key) da conta.
Resposta 200: `{ access_token, expires_in: 300, token_type: "Bearer", scope }`.

## APIs do roteiro e escopos
| API | Escopos | Testes / endpoints |
|---|---|---|
| Bolepix (boleto com Pix, v2) | `v2.bankslip.read`, `v2.bankslip.write`, `v2.bankslip.pix.write` | BP_01 `POST /v2/bank_slips` (obrigatórios: amount, due_date, description, payer, payment_method) · BP_02 `PATCH /v2/bank_slips/{external_reference_id}` (atualiza amount, due_date, description) · BP_03 `GET /v2/bank_slips/{id}` · BP_04 `GET /v2/bank_slips/{id}/pdf` · BP_05 `PUT /v2/bank_slips/{id}/cancel` (baixa) · BP_06 listar cobranças |
| Boleto (v1) | `bankslip.read`, `bankslip.write` | `POST /bank_slips/`, `PUT /bank_slips/{id}`, `GET /bank_slips/{id}`, `GET /bank_slips/{id}/pdf`, `PUT /bank_slips/{id}/cancel`, `POST /webhooks/` |
| Extrato | `statement.read` | E_01 `GET /balance` · E_02 `GET /statement?start_date=AAAA-MM-DD&end_date=AAAA-MM-DD` (intervalo máximo de **30 dias**) |
| Agendamento de pagamentos | `schedulepayments.read`, `schedulepayments.write` | AP_01 `POST /schedule_payments/decode` (body: amount, content) → cria um **grupo** (201) · AP_02 `GET /schedule_payments/query` (boletos pendentes no **DDA**) · AP_03 `GET /schedule_payments/{group_id}/items` · AP_04/AP_05 `DELETE /v1/schedule_payments/{group_id}/items` (lista de ids ou um item) · AP_06 `POST /v1/schedule_payments/submit` (body: group_id, uploader_name) → **enviado para aprovação** (a aprovação é no app/Web Banking) |
| Pix | `pix.*`, `cob.*`, `cobv.*`, `lotecobv.*`, `payloadlocation.*` | `/pix/cob`, `/pix/cobv`, `/pix/lotecobv`, `/pix/loc`, `/pix/pix/{e2eid}`, `/pix/pix?inicio&fim`, devolução, `/pix/webhook/{chave}` |
| Pix Automático | `rec.*`, `solicrec.*`, `cobr.*`, `recpayload.*`, `payloadlocationrec.*` | `/pix/rec`, `/pix/solicrec`, `/pix/locrec`, `/pix/webhookrec` |
| Checkout | `checkout.read`, `checkout.write` | `/checkouts` (não usado pelo ERP) |
| Transações e recebíveis (C6Pay) | `receivable.read` | `/c6pay/statement/receivables`, `/c6pay/statement/transactions` (maquininha; não usado) |

## O que muda em relação à pesquisa
- **Alterar valor do boleto existe** (BP_02: `amount` no PATCH). Não é preciso cancelar e reemitir.
- **Extrato e saldo confirmados** com os parâmetros `start_date`/`end_date` e janela de 30 dias. Os campos de cada lançamento continuam a confirmar na documentação do portal (`/apis/statement`).
- **Pagamentos**: fluxo em 3 passos pela API (decodificar → grupo → enviar para aprovação) e aprovação final no app do C6. Não há endpoint de aprovação nem de segundo fator.
- Continua sem aparecer no roteiro: comprovante em PDF de pagamentos/Pix, Pix enviado avulso e TED.

Portal: https://developers.c6bank.com.br/apis/auth · /apis/bolepix · /apis/statement · /apis/schedule-payments · /apis/pix
