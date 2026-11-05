# Ponte C6 — fase 2: extrato, saldo, boletos pagos, DDA, pagamentos e comprovante

A **ponte** é um programinha em Node que roda no computador do escritório e conversa com o C6 Bank
no lugar do site (o site não pode guardar certificado nem senha do banco). Esta pasta tem a parte da
fase 2: ler o extrato das duas contas (ANK e JCK), ver o saldo, listar boletos pagos, ver o DDA,
mandar pagamentos para aprovação no aplicativo do C6 e gerar o comprovante de um lançamento.

O servidor em si (`servidor.mjs`: senha, HTTPS com certificado, várias contas, CORS) é de outro pacote.
Os arquivos daqui são módulos que ele monta.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `c6-extrato.mjs` | `extrato(c6, { de, ate })` e `saldo(c6)`. Divide o período em janelas de 30 dias (limite do C6), junta tudo, tira repetidos pela `reference` e ordena por data. |
| `c6-pagamentos.mjs` | `decodificar`, `itensDoGrupo`, `removerItens`, `removerItem`, `enviarParaAprovacao`, `dda`. Valida cada pagamento antes de chamar o banco (código de barras, Pix copia e cola ou chave Pix; valor com 2 casas; descrição até 100 letras). Linha digitável de 47/48 dígitos vira código de barras de 44. |
| `c6-boletos-listar.mjs` | `listarPagos(c6, { de, ate, por })`: boletos com pagamento no período, janelas de 60 dias, página por página (100 por vez). |
| `rotas-fase2.mjs` | As rotas HTTP (lista abaixo) para o servidor montar. Contrato completo no comentário do topo do arquivo. |
| `pdf-minimo.mjs` | Gera um PDF simples (uma página, só texto) sem bibliotecas — é o "comprovante gerado pela ponte". |
| `c6-datas.mjs` | Contas de datas 'AAAA-MM-DD' e janelas. |
| `c6-simulado.mjs` + `simulado/*.json` | Um C6 de mentira, com dados inventados, para testar sem banco. |
| `testes/*.test.mjs` | Testes automáticos (sem internet). |

## Rotas (todas começam com `/contas/<conta>`, conta = `ank` ou `jck`)

| Rota | Para que serve | Resposta |
|---|---|---|
| `GET /extrato?de=AAAA-MM-DD&ate=AAAA-MM-DD` | Lançamentos do extrato (sem datas: últimos 30 dias; máximo 366 dias) | `{ conta_id, de, ate, lancamentos: [ … ] }` — cada lançamento como o C6 manda (`reference`, `entry_date`, `amount` "1500.00", `operation_type` INCOMING/OUTGOING, `transaction_type`, `title`, `description`, `end_to_end_id`) mais `conta_id` |
| `GET /saldo` | Saldo da conta | `{ conta_id, date, available, locked, future, limit{…}, total_available, … }` (reais, como o C6) |
| `GET /boletos/pagos?de&ate&por=payment_date` | Boletos nossos que foram pagos no período (`por=credit_date` = pela data em que o dinheiro entrou) | `{ conta_id, de, ate, por, boletos: [ … com payments[] ] }` |
| `GET /dda` | Boletos a pagar que chegaram pelo DDA | `{ conta_id, items: [ { content, amount, beneficiary_name, due_date, overdue, … } ] }` |
| `POST /pagamentos/decodificar` | Manda pagamentos para o banco **ler** (ainda não paga). Corpo: `{ items: [ { content, amount, description, transaction_date } ] }` | `201 { conta_id, group_id }` |
| `GET /pagamentos/<grupo>/itens` | O que o banco leu de cada item (beneficiário, vencimento, `status` READ_DATA / DECODE_ERROR / SCHEDULED / PROCESSED…) | `{ conta_id, group_id, items }` |
| `DELETE /pagamentos/<grupo>/itens` | Tira itens do grupo. Corpo: lista de ids `["id1", "id2"]` | `{ conta_id, group_id, removidos }` |
| `DELETE /pagamentos/<grupo>/itens/<item>` | Tira um item | `{ conta_id, group_id, removidos: 1 }` |
| `POST /pagamentos/<grupo>/enviar` | Envia o grupo para **aprovação** no aplicativo/Web Banking do C6. Corpo: `{ uploader_name: "Nome de quem envia" }` | `{ conta_id, group_id, enviado: true }` |
| `GET /comprovante/<reference>?data=AAAA-MM-DD` | PDF do lançamento do extrato, gerado pela ponte (o C6 não dá PDF por lançamento). `&formato=json` devolve `{ nome, pdf_base64, lancamento }` para o site | `application/pdf`, cabeçalho `X-Comprovante-Origem: ponte` |

Erros voltam sempre como `{ erro: "texto em português", codigo }`: `400 validacao` (dados errados), `404 conta`
(conta não configurada), `404 nao_encontrado`, `502 banco` (o C6 recusou; `status_banco` diz o código), `500 interno`.

**Importante:** o banco nunca paga sozinho. O que a ponte faz é montar o lote e mandar para aprovação;
alguém com senha no aplicativo do C6 aprova. A confirmação de que saiu o dinheiro aparece depois no extrato.

## Modo simulado (sem banco)

Com `SIMULADO=1` o servidor usa `c6-simulado.mjs` no lugar do C6 de verdade. Os dados estão em `simulado/`:

- `extrato.json`: 8 lançamentos da ANK e 4 da JCK em novembro/2026 (Pix recebido, boleto da Sanepar e da Copel, tarifa,
  TED da ANK para a JCK — que aparece nas duas contas —, IPTU, boleto liquidado, Pix de condomínio, débito automático).
  Ao pedir outro mês, os mesmos lançamentos aparecem com o mesmo dia e `reference` diferente.
- `saldo.json`, `boletos-pagos.json` (3 boletos da ANK, com `payments[]`), `dda.json`, `grupo-itens.json`.
- Boletos emitidos no simulado (`POST /v2/bank_slips`) ficam na memória enquanto a ponte estiver aberta; o PDF é gerado.
- Dados inventados: CPF `529.982.247-25`, CNPJ `11.222.333/0001-81` (os de teste do projeto).

## Como rodar os testes

```
node --test "ponte-c6/testes/*.test.mjs"
```

Não precisa de internet nem de certificado: os testes usam o C6 simulado. Eles conferem as janelas de 30/60 dias,
a remoção de repetidos pela `reference`, a validação dos pagamentos, a paginação dos boletos, as rotas e o PDF.

## O site (docs/js/banco-fase2.js)

Funções que a tela usa, todas passando por `chamarPonte` (de `banco.js`):
`extratoDaConta(conta, de, ate)`, `saldoDaConta(conta)`, `boletosPagos(conta, de, ate, por)`, `ddaDaConta(conta)`,
`decodificarPagamentos(conta, itens)`, `itensDoGrupo(conta, grupo)`, `removerItensDoGrupo(conta, grupo, ids)`,
`enviarGrupoParaAprovacao(conta, grupo, nome)`, `baixarComprovantePonte(conta, reference, data)` → Blob do PDF.
