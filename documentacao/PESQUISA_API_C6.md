# Pesquisa: API do C6 Bank para empresas (conta PJ) — o que dá para fazer pelo ERP

Data da pesquisa: 05/11/2026. Somente leitura de fontes públicas.

## 0. Aviso sobre o alcance da pesquisa

- A documentação oficial fica no portal **developers.c6bank.com.br**, que é uma aplicação (SPA) atrás do Cloudflare e exige cadastro; as especificações OpenAPI ficam em `developers.c6bank.com.br/yamls/*.yaml` (`bolepix.yaml`, `bankslip-api.yaml`, `authentication-api.yaml`, `webhook-api.yaml`, `bankslip-migration.yaml`, `release-notes.yaml`). Nesta sessão os domínios `c6bank.com.br`, `developers.c6bank.com.br` e os sites de integradores (Omie, Tecnospeed, ACBr, kmee etc.) **não puderam ser abertos** (bloqueio de rede da sessão). O que está abaixo vem de:
  1. trechos do site e do blog do C6 devolvidos pelo buscador (marketing, sem detalhe técnico);
  2. código-fonte e notas de bibliotecas de terceiros no GitHub que foram escritas lendo a OpenAPI oficial (principalmente `kmee/brbank`, que baixou os YAMLs em 20/10/2026 e documentou o que leu; `divulgueregional/api-c6-bank`; `femitz/c6bank-php`; `wuzi/c6-bank`; `leandronunes07/c6bank-php-sdk`).
- Nenhuma dessas bibliotecas foi validada contra o sandbox do C6 (os próprios autores dizem isso). Portanto: **endpoints de boleto, Pix, autenticação e webhook têm boa confiança (vários projetos concordam, com base na OpenAPI oficial); extrato/saldo e agendamento de pagamentos têm confiança baixa (um único SDK, sem validação); comprovantes, Pix envio e TED não foram encontrados.**
- Para fechar as lacunas o caminho é: criar o cadastro em `developers.c6bank.com.br/create-access`, baixar os YAMLs em `/yamls/` e ler `release-notes.yaml` (versão 1.3.11 em 02/10/2026).

## 1. Visão geral da API C6 (comum a todos os produtos)

| Item | O que foi encontrado | Fonte |
|---|---|---|
| URL base produção | `https://baas-api.c6bank.info` | divulgueregional, femitz, kmee, wuzi (todos iguais) |
| URL base sandbox | `https://baas-api-sandbox.c6bank.info` | idem |
| Token | `POST /v1/auth/` com `grant_type=client_credentials`, `client_id`, `client_secret` (form-urlencoded) + **mTLS** (certificado + chave emitidos pelo banco). Sem campo `scope` no pedido; a resposta devolve os escopos da credencial (ex.: `bankslip.write bankslip.read`). Token vale **300 s** (também citada expiração por 10 min de inatividade). | kmee (authentication-api.yaml 1.1.2), wuzi, femitz |
| Cabeçalhos extras | `partner-software-name` e `partner-software-version` (opcionais, identificam o ERP) | kmee, divulgueregional |
| Erros | RFC 7807 (`type`, `title`, `status`, `timestamp`, `correlation_id`, `detail`), página "Tratamento de Erros" em `/apis/errors` | kmee |
| Credenciais de produção | Geradas pelo titular no **Web Banking → menu do perfil → "Integrações via API" → "Nova chave"**: escolhe-se o **parceiro** (ERP/software homologado), o **CNPJ/conta** e as **permissões por produto**; o banco gera ClientId, ClientSecret e certificado. Validade do certificado: **12 meses** (fonte de terceiro). Se vencer, troca-se certificado + ClientId/Secret; renovando antes, só o certificado. | blog C6 "guia de ativação", Tecnospeed, PlugBoleto, SisOp, kmee (via buscador) |
| Credenciais de sandbox | Cadastro em `developers.c6bank.com.br/create-access`, escolhendo área de atuação e produtos de interesse; credenciais chegam por e-mail e dependem do produto escolhido (só Pix, só boleto…) | site C6 "apis-integracao", fórum ACBr |
| Fluxo até produção | Cadastro no portal → credenciais de teste → executar o "Roteiro de Testes – C6 Developers v3.0" → enviar evidências para validação técnica → assinar termo de responsabilidade → liberação | site C6, kmee |
| Custo da integração | Site do C6: integração ao ERP "sem custo adicional". Boleto de cobrança (tabela do produto, sem distinguir canal): franquia de 200 boletos/mês grátis, depois R$ 1,89 **por boleto liquidado**. Pix por API: "gratuito e ilimitado" (marketing). Programa Coalizão C6 para software houses: até 2 mil boletos grátis/mês nos 4 primeiros meses (notícia de 2025; pode ter mudado). | site/blog C6, Diário do Comércio |
| Cota de requisições | NÃO ENCONTRADO na documentação pública | — |

## 2. Tabela resumo: capacidade × disponível no C6 × endpoint × observação

Legenda: **SIM** = confirmado por mais de uma fonte baseada na OpenAPI oficial; **PROVÁVEL** = anunciado pelo banco e com endpoint citado por uma única fonte não validada; **NÃO ENCONTRADO** = não achei na documentação pública (não significa que não exista).

| # | Capacidade | C6? | Endpoint (base `baas-api[-sandbox].c6bank.info`) | Observação |
|---|---|---|---|---|
| a1 | Emitir boleto com Pix (híbrido/"Bolepix") | SIM | v2: `POST /v2/bank_slips` · v1: `POST /v1/bank_slips` | v2 = API "Bolepix" 1.1.1; v1 = "Boleto" 1.7.2 (guia de migração v1→v2). Em ago/2026 moderador do ACBr dizia "só a V1 operacional"; em out/2026 a OpenAPI v2 já estava publicada. Confirmar no portal qual está liberada para a sua conta. |
| a2 | Consultar boleto | SIM | `GET /v2/bank_slips/{external_reference_id}`; `GET /v2/bank_slips/list?external_reference_id&due_date_from&due_date_to`; v1: `GET /v1/bank_slips/{id}` | Na v2 a consulta individual não traz `payments` (valor/data pagos vêm na listagem). |
| a3 | Alterar vencimento | SIM | v2: `PATCH /v2/bank_slips/{id}` (prorrogação) · v1: `PUT /v1/bank_slips/{id}` | v2 corrigida em 18/09/2026 (sem `/update`). |
| a4 | Alterar valor | NÃO ENCONTRADO | — | Nenhuma fonte mostra alteração do `amount` após emissão; na prática cancela-se e emite-se outro. |
| a5 | Alterar desconto | PARCIAL | campos `fees.discount_type` (`MONTHLY_PERCENTAGE`), `first_discount_value`, `first_discount_deadline` na emissão | v2 aceita **um só** desconto; alteração posterior do desconto: NÃO ENCONTRADO. |
| a6 | Abatimento | **NÃO** | — | "Abatimento: inexistente na v2" (kmee lendo a OpenAPI). Protesto/negativação também não. |
| a7 | Baixar/cancelar | SIM | `PUT /v2/bank_slips/{id}/cancel` (204) · v1: `PUT /v1/bank_slips/{id}/cancel` | Cancelar boleto já pago dá erro. Baixa automática: `days_after_due_date`. |
| a8 | Segunda via PDF | SIM | `GET /v2/bank_slips/{id}/pdf` (`Accept: application/pdf`) · v1: `GET /v1/bank_slips/{id}/pdf` | Retorno pode vir binário ou JSON com `base64_pdf_file` (não ficou claro na spec). |
| a9 | Webhook de liquidação do boleto | SIM | cadastro `POST /v1/webhooks` `{url, service}`; `GET /v1/webhooks?service=`; `DELETE /v1/webhooks?service=`; serviços `BANK_SLIP` (v1) e `BANK_SLIP_PIX` (v2) | Payload: `external_id`, `date_time`, `client_id`, `partner_id`, `service`, `status` (`CREATED`, `WAITING_CONFIRMATION`, `PAID`, `CANCELED`), `information` (JSON em texto, com `external_reference_id`, `amount`, `payment_date`). **Assinatura do webhook não documentada** → reconsultar o boleto antes de dar baixa. `WAITING_CONFIRMATION` = pago mas dinheiro ainda não creditado. |
| b1 | Pix cobrança imediata (QR dinâmico) | SIM | `POST /v2/pix/cob` (alguns usam `PUT /v2/pix/cob/{txid}`), `GET /v2/pix/cob/{txid}`, `GET /v2/pix/cob?inicio&fim` | Segue o padrão API Pix do Bacen (`calendario.expiracao`, `valor.original`, `chave`, `devedor`, `solicitacaoPagador`). |
| b2 | Pix cobrança com vencimento | SIM | `PUT /v2/pix/cobv/{txid}`, `GET`, `PATCH` (cancelar = `PATCH` com `status: REMOVIDA_PELO_USUARIO_RECEBEDOR`), `GET /v2/pix/cobv?inicio&fim` | Padrão Bacen. |
| b3 | Pix recebidos (consulta) | SIM | `GET /v2/pix/pix/{e2eid}`; `GET /v2/pix/pix?inicio&fim&paginacao.paginaAtual&paginacao.itensPorPagina` | Páginas começam em 0; `quantidade_total_de_itens` pode faltar, use `quantidade_de_paginas`. |
| b4 | QR estático (`/loc`, payload sem valor) | NÃO ENCONTRADO | — | Um SDK tem classe `Location`, mas nenhum endpoint foi visto. |
| b5 | Webhook Pix recebido | SIM | `PUT /v2/pix/webhook/{chave}` `{webhookUrl}`, `GET`, `DELETE` | Separado do `/v1/webhooks`. Payload traz `information` como JSON em texto; confirmar formato real no sandbox. |
| c1 | Extrato da conta | PROVÁVEL | `GET /v1/statement` (um SDK usa `start_date`, `end_date`, `page`; outro projeto usa `inicio`/`fim` com janela máx. de 30 dias) | Produto oficial "API Extrato", renomeado para **"Saldo & Extrato"** nas release notes 1.3.11 (02/10/2026). Campos de cada lançamento, identificador único, categoria e contrapartida: **NÃO ENCONTRADOS** (SDK mostra só `date`, `description`, `amount`). |
| c2 | Saldo | PROVÁVEL | `GET /v1/balance` | Adicionado na 1.3.11 (02/10/2026). Formato da resposta: NÃO ENCONTRADO (projeto que o usa marca como "provisório, confirmar na homologação"). |
| d | Comprovante PDF de transferência/Pix/pagamento | **NÃO ENCONTRADO** | — | Só existe PDF do **boleto emitido**. Nenhuma fonte cita comprovante por API; o próprio atendimento do C6 diz que comprovante de Pix recebido só sai pelo extrato/remetente. |
| e1 | Pagar boleto de terceiro (linha digitável) | PROVÁVEL (parcial) | SDK não validado: `POST /v1/schedule_payments/decode` (decodifica linha digitável), `GET /v1/schedule_payments/query`, `GET /v1/schedule_payments/{group_id}/items`, `DELETE .../items/{item_id}` | Produto oficial "API Agendamentos de Pagamentos": "viabiliza consulta de boletos via DDA e envie **lotes de agendamento de pagamentos para aprovação**". Ou seja, a API **agenda**; a **aprovação é feita pelo titular no app/Web Banking** (não há endpoint de aprovação/2º fator encontrado). Endpoint de criação do lote: NÃO ENCONTRADO. |
| e2 | DDA (lista de boletos a pagar) | PROVÁVEL | provavelmente `GET /v1/schedule_payments/query` | Citado no marketing oficial; contrato não encontrado. |
| e3 | Concessionárias (água, luz) e tributos (IPTU) | NÃO ENCONTRADO | — | O pagamento em lote por **arquivo** no Web Banking cobre boletos, tributos, Pix e folha (até 100 por XLS), mas não achei isso na API. |
| e4 | Agendamento e aprovação por alçada | PARCIAL | ver e1 | Agendamento sim (nome do produto); aprovação só pelo app/web. |
| f1 | Pix envio (transferência) | **NÃO ENCONTRADO** | — | Blog do C6 diz que a API Pix "automatiza o envio e recebimento", mas nenhum endpoint público de envio foi encontrado; um projeto no GitHub (longbeach) afirma ter "Pix avulso idempotente" via C6, com homologação pendente e código não acessível. Confirmar no portal. |
| f2 | TED | **NÃO ENCONTRADO** | — | TED aparece só no Web Banking. |
| g | Várias contas / CNPJs com um cadastro de desenvolvedor | SIM (modelo) | — | O cadastro no portal é do **software**; cada **conta/CNPJ** gera sua própria chave (ClientId + Secret + certificado) no Web Banking, escolhendo o parceiro e as permissões. Para ANK e JCK: **duas chaves**, uma por conta. Um token cobrindo duas contas: NÃO ENCONTRADO. |
| h | Sandbox e dados de teste | SIM | `https://baas-api-sandbox.c6bank.info` | Sandbox de boleto funciona **seg–sex 07h–22h, carteira 21**; roteiro "Roteiro de Testes – C6 Developers v3.0"; credenciais via `create-access`. Massa de dados de teste (CPFs, linhas digitáveis, QR) : NÃO ENCONTRADA. Homologação do Pix já foi relatada como lenta (fórum ACBr, 2024–2025). |

## 3. Detalhes por capacidade

### (a) Boleto de cobrança com Pix (Bolepix)
- **Emissão (v2):** `POST /v2/bank_slips`. Campos: `external_reference_id` (26 caracteres `[A-Z0-9]`, definido pelo ERP; reenviar o mesmo id devolve a cobrança existente — idempotente), `amount` (texto decimal, ex. `"123.45"` — atenção: o ERP guarda centavos), `due_date` (`AAAA-MM-DD`), `description` (obrigatória, até 100), `payer{name, tax_id (sem máscara), email (≤70), address{address (logradouro + ", " + número, ≤40), neighborhood (obrigatório desde 25/07/2026), city, state, zip_code}}`, `payment_method{bank_slip{billing_scheme, your_number (1–10 dígitos), instructions (até 4 linhas de 80)}, pix{key, type: "EVP"}}`, `fees{fine_type PERCENTAGE|FIXED_VALUE, fine_value, fine_deadline, interest_type MONTHLY_PERCENTAGE|VALUE_PER_DAY, interest_value, interest_deadline, discount_type, first_discount_value, first_discount_deadline}`, `days_after_due_date` (dias após o vencimento para expirar), `origin`.
- **Resposta:** `status`, `due_date`, `payment_method.bank_slip{our_number, digitable_line, bar_code}`, `payment_method.pix{qr_code}` (copia-e-cola), `payments[]{amount, payment_date, credit_date}` (só na listagem).
- **Alteração (v2):** `PATCH /v2/bank_slips/{id}` — prorrogação de vencimento; biblioteca femitz mostra também alteração de `payer.email`, `payer.address`, `your_number`, `instructions` (nome e CPF/CNPJ do pagador não mudam). Valor e abatimento: não.
- **Status:** `CREATED` → `WAITING_CONFIRMATION` → `PAID`; `CANCELED`/`CANCELLED`. Não há `EXPIRED` na v2.
- **Limites conhecidos:** nome/endereço/bairro/cidade cortados em 40 caracteres; só um desconto; sem abatimento, protesto, negativação ou sacador avalista.
- **Webhook:** ver tabela a9. Recomendação de todos os autores: tratar o webhook como aviso e reconsultar (`GET`) antes de dar baixa.

### (b) Pix recebimento
Segue a API Pix padrão do Bacen sob `/v2/pix/...` (cob, cobv, pix, webhook). O webhook Pix é por **chave** (`/v2/pix/webhook/{chave}`), separado do webhook de boleto. QR estático/`loc`: não encontrado. Para o ERP, o boleto híbrido (a) já cobre o caso "aluguel com Pix"; a cobrança Pix pura serviria para cobranças avulsas sem boleto.

### (c) Extrato e saldo
Produto oficial existe ("Saldo & Extrato", liberado para ERPs como GestãoClick via "Integrações via API"). O que se vê em código de terceiros: `GET /v1/statement` com período (nomes dos parâmetros divergem entre fontes: `start_date/end_date/page` ou `inicio/fim`, janela máxima 30 dias) e `GET /v1/balance`. **Não encontrei**: nomes dos campos de cada lançamento, identificador único do lançamento (importante para conciliar sem duplicar), categoria do lançamento, dados da contraparte, tamanho da página. Isso precisa ser lido no YAML do portal. Observação: uma plataforma agregadora (Datanomik) afirma que o acesso a saldo/extrato do C6 por terceiros se dá via Open Finance, não por API direta — isso vale para agregadores sem parceria; para o ERP do próprio titular o caminho é a chave em "Integrações via API".

### (d) Comprovantes em PDF
NÃO ENCONTRADO na documentação pública. Para o objetivo "nomear e guardar comprovantes", a alternativa realista é o ERP **gerar o próprio comprovante** (PDF) a partir do lançamento do extrato (data, valor, descrição, e2e id quando disponível) ou do retorno da API de pagamento, e guardar o PDF oficial baixado manualmente do app quando for exigido por terceiros.

### (e) Pagamento de contas (boletos de terceiros, água, luz, IPTU, DDA)
O C6 anuncia a "API Agendamentos de Pagamentos" (consulta de boletos via DDA + envio de lotes de agendamento **para aprovação**). Interpretação: a API monta/agenda, e o dono aprova no app/Web Banking (o segundo fator fica fora da API — comportamento igual ao de Inter e Itaú). Endpoints vistos em um único SDK não validado (`/v1/schedule_payments/decode|query|{group_id}/items`). Pagamento de concessionárias e tributos por API: não encontrado. Sem a documentação do portal não dá para afirmar quais tipos de documento o "decode" aceita (boleto bancário ×  guia de arrecadação).

### (f) Pix envio e TED
Não encontrados na documentação pública. O marketing do C6 fala em "envio" de Pix pela API; nenhum contrato técnico apareceu. TED: nada.

### (g) Múltiplas contas (ANK e JCK)
Modelo encontrado: um cadastro de **parceiro/software** no portal de desenvolvedores; o titular de **cada conta PJ** entra no seu Web Banking → "Integrações via API" → "Nova chave", escolhe o parceiro (o ERP) e as permissões, e recebe ClientId/Secret/certificado **daquela conta**. Logo o ERP guarda duas credenciais (uma por empresa) e autentica separadamente; o token não indica a conta — a conta é a da credencial. Não encontrei opção de uma credencial enxergar duas contas. Para o seu ERP (um software próprio, não um ERP de mercado), é preciso verificar se o C6 aceita o próprio titular como "parceiro" (cadastro no portal) — os tutoriais encontrados são todos de ERPs homologados (Omie, Tecnospeed, PlugBoleto, GestãoClick…), e um deles diz que a cobrança via API precisa ser **ativada pelo gerente**.

### (h) Sandbox
`https://baas-api-sandbox.c6bank.info`, mesmo mTLS do que a produção (certificado de sandbox vem com as credenciais de teste). Boleto no sandbox só de segunda a sexta, 07h–22h, carteira 21. Há um "Roteiro de Testes" oficial; evidências do roteiro + termo de responsabilidade liberam a produção. Massa de teste: não encontrada.

## 4. Comparação rápida (só para o que o C6 não tem ou está incerto)

Uma linha por banco por função. "Sim" aqui também vem de documentação oficial + bibliotecas; os portais oficiais (developers.inter.co, devportal.itau.com.br, developers.sicoob.com.br) não abriram nesta sessão.

**Comprovante PDF por API**
- Inter: **Sim** — API Banking: "Exportar extrato e comprovante para PDF" (central de ajuda do Inter); extrato PDF até 90 dias.
- Itaú: NÃO ENCONTRADO.
- Sicoob: **Sim (citado)** — "Cobrança Bancária Pagamentos v4" lista comprovante do pagamento de boleto; não vi comprovante de Pix/TED.

**Pagar boleto de terceiro / concessionária / tributo**
- Inter: **Sim** — `POST /banking/v2/pagamento` (boleto, convênio e tributo por código de barras), `POST /pagamento/darf`, lote `POST /pagamento/lote` (2–150 itens), `DELETE /pagamento/{codigoTransacao}` cancela agendamento; aprovação no Internet Banking conforme configuração da conta; webhooks `boleto-pagamento` e `pix-pagamento`; escopos `pagamento-boleto.write/.read`, `pagamento-darf.write`, `pagamento-lote.*`. Atenção: Inter fechou API Pix/Banking para integrações novas em 24/12/2025 e reabriu em 12/03/2026 com análise prévia.
- Itaú: **Parcial** — API SISPAG v1 só inclui **Pix** (`POST /transferencias`); boleto de terceiro continua por arquivo CNAB; aprovação manual no Itaú Empresas; DDA/TED citados só por terceiros (kmee); onboarding pelo gerente (Cash).
- Sicoob: **Sim (citado)** — "Cobrança Bancária Pagamentos v4" (`/pagamentos/v4`: boleto por código de barras, comprovante, cancelar agendamento, **DDA**), "Convênios Pagamentos v2" (guias de arrecadação); nenhuma biblioteca pública validou ainda.

**DDA**
- Inter: NÃO ENCONTRADO.
- Itaú: citado por terceiros (kmee), sem contrato público.
- Sicoob: citado no produto "Cobrança Bancária Pagamentos v4".

**Pix envio**
- Inter: **Sim** — `POST /banking/v2/pix` (chave, dados bancários ou copia-e-cola), `GET /pix/{codigoSolicitacao}`, `dataPagamento` futura agenda; `x-id-idempotente`; 60/min.
- Itaú: **Sim** — SISPAG `POST /transferencias` (PIX por chave/dados, PIX_QRCODE por emv); sandbox `sandbox.devportal.itau.com.br/itau-ep9-gtw-sispag-ext/v1`; token `sts.itau.com.br/api/oauth/token`.
- Sicoob: **Sim** — "Pix Pagamentos v2": `POST /pagamentos` (DICT), `POST /pagamentos/confirmacao`, `POST /pagamentos/qrcode`, `GET /pagamentos/{e2e}`, webhook `/pagamentos/webhook`; escopos `pixpagamentos_escrita/consulta/webhook`; agendamento por `dataAgendamento`.

**TED**
- Inter: NÃO ENCONTRADO na API Banking (só Pix, boleto, DARF).
- Itaú: citado por terceiros.
- Sicoob: **Sim (citado)** — "SPB Transferências v2".

**Extrato e saldo**
- Inter: **Sim** — saldo, extrato simples, extrato enriquecido, extrato PDF (90 dias); escopo `extrato.read`.
- Itaú: produto "API de Conciliação de Conta Corrente PJ"/Extrato citado no site e por terceiros; contrato só com login.
- Sicoob: **Sim** — API "Conta Corrente" (saldo, extrato, transferências); extrato limitado aos **últimos 3 meses**; escopos tipo `cco_extrato`, `cco_saldo`, `cco_transferencias` (nomes divergem entre fontes).

**Boleto híbrido (para referência)**
- Inter: Cobrança v3 — híbrido obrigatório, PDF, webhook, baixa; alteração não (kmee).
- Itaú: Cobrança v2/Bolecode — alteração e baixa só a partir do dia útil seguinte; **sem PDF**; webhook mal documentado.
- Sicoob: Cobrança v3 — híbrido, alteração (inclusive **abatimento**), baixa, PDF base64, protesto; webhook sem corpo documentado.

## 5. O que isso significa para o ERP (resumo prático)

1. **Dá para fazer agora, com boa segurança:** emitir/consultar/prorrogar/cancelar boleto com Pix, baixar o PDF e receber aviso de pagamento (webhook + reconsulta). Também cobrança Pix pura e consulta de Pix recebidos.
2. **Provável, mas precisa ler o YAML no portal antes de desenhar a tela:** extrato (`/v1/statement`) e saldo (`/v1/balance`) — faltam nomes de campos e identificador único do lançamento.
3. **Incerto / parcial:** pagar boletos de terceiros e DDA — a API aparentemente só **agenda para aprovação** no app; água/luz/IPTU não confirmados.
4. **Não encontrado:** comprovante PDF, Pix envio, TED. Se forem essenciais, o Inter (comprovante PDF + pagamento + Pix envio) e o Sicoob (pagamentos + DDA + TED + Pix envio) são os que mais se aproximam; nenhum dos quatro expõe aprovação/2º fator pela API.
5. **Duas empresas = duas credenciais** (ClientId/Secret/certificado por conta), geradas por cada titular no Web Banking; o ERP precisa guardar e renovar as duas (certificado ~12 meses).
6. Valores na API são texto decimal (`"150.00"`); o ERP trabalha em centavos inteiros — converter nas duas direções.
7. Confirmar com o gerente/portal: (i) se o próprio titular pode cadastrar o ERP como parceiro; (ii) se a v2 (Bolepix) já está liberada para a conta; (iii) tarifa de boleto via API; (iv) existência de Pix envio e comprovante.

## 6. Fontes (URLs)

Oficiais do C6 (lidas apenas via trechos do buscador — domínio bloqueado nesta sessão):
- https://www.c6bank.com.br/apis-integracao/
- https://www.c6bank.com.br/blog/api-c6-bank
- https://www.c6bank.com.br/blog/o-que-e-api
- https://www.c6bank.com.br/blog/guia-ativacao-apis-c6-bank
- https://www.c6bank.com.br/blog/integracao-gestaoclick-c6-bank
- https://www.c6bank.com.br/blog/pagamento-em-lote
- https://www.c6bank.com.br/blog/c6-bank-lanca-pagamento-em-lote-para-contas-pj
- https://www.c6bank.com.br/blog/transferencias-web-banking
- https://www.c6bank.com.br/boletocobranca
- https://developers.c6bank.com.br/ (portal; YAMLs em /yamls/, criar acesso em /create-access, erros em /apis/errors)
- https://cms-assets-p.c6bank.com.br/uploads/manual-cnab.pdf (CNAB 400 v2.7, alternativa por arquivo)

Código de terceiros baseado na OpenAPI oficial (lidos diretamente):
- https://github.com/kmee/brbank — https://raw.githubusercontent.com/kmee/brbank/main/docs/c6-duvidas.md ; https://raw.githubusercontent.com/kmee/brbank/main/src/brbank/adapters/c6.py ; https://github.com/kmee/brbank/pull/2 ; docs inter-pagamento-duvidas.md, itau-pagamento-duvidas.md, itau-duvidas.md, sicoob-pagamento-duvidas.md, sicoob-duvidas.md
- https://github.com/divulgueregional/api-c6-bank — https://raw.githubusercontent.com/divulgueregional/api-c6-bank/main/src/C6Bank.php
- https://github.com/femitz/c6bank-php — https://raw.githubusercontent.com/femitz/c6bank-php/main/src/Environment.php
- https://github.com/wuzi/c6-bank — https://raw.githubusercontent.com/wuzi/c6-bank/master/src/client.rs
- https://github.com/leandronunes07/c6bank-php-sdk (Resources/Schedule.php, Statement.php, Account.php, BankingWebhook.php, BankSlip.php — não validado)
- https://github.com/ia-dev-sindireceita/payment/pull/149 (renomeação "Saldo & Extrato" 1.3.11, /v1/balance provisório)
- https://github.com/gustavodrager/longbeach/pull/43 (integração saldo/extrato/Pix, homologação pendente)
- https://rubygems.org/gems/c6_bank ; https://packagist.org/packages/leandronunes07/c6bank-php-sdk ; https://packagist.org/packages/divulgueregional/api-c6-bank ; https://packagist.org/packages/femitz/c6bank-php

Integradores e fóruns (via trechos do buscador):
- https://www.projetoacbr.com.br/forum/topic/94329-bolepix-api-v2-do-c6-bank
- https://www.projetoacbr.com.br/forum/topic/81828-pix-c6-bank-com-acbrpixcd/
- https://www.projetoacbr.com.br/forum/topic/79524-pix-c6-bank/
- https://ajuda.omie.com.br/pt-BR/articles/17059704-configurando-a-integracao-com-o-c6-bank-boleto-pix-via-api
- https://atendimento.tecnospeed.com.br/hc/pt-br/articles/36889380237463-336-C6
- https://docs.softensistemas.com.br/books/configuracao-plugboleto-gerencieaqui/page/api-c6-bank
- https://sisop.com.br/api-boletos-c6-bank-gerando-credenciais/
- https://ispcloud.com.br/integracao-c6-bank-via-api/
- https://kmee.com.br/blog/comparativo-apis-bancarias-erp-brasil-2026/
- https://diariodocomercio.com.br/negocios/c6-bank-amplia-coalizao-c6-programa-relacionamento-software-houses/
- https://www.datanomik.com/integracoes/c6-bank
- https://www.reclameaqui.com.br/c6-bank/c6-nao-oferece-o-comprovante-detalhado-dos-pix-recebidos_JTnQC36I7tqVm-7b/

Comparação (Inter, Itaú, Sicoob):
- https://ajuda.inter.co/conta-digital-pessoa-juridica/o-inter-disponibiliza-alguma-api-para-minha-conta-digital-pj
- https://inter.co/empresas/api-banking/ ; https://inter.co/empresas/integracoes-para-empresas/ ; https://developers.inter.co/references/pix ; https://blog.inter.co/apis-do-inter/
- https://github.com/renatojdev/bancointer-python ; https://github.com/feslima/pyinterboleto
- https://devportal.itau.com.br/ ; https://www.itau.com.br/empresas/pagamentos-recebimentos/gestao-financeira
- https://www.projetoacbr.com.br/forum/topic/93031-atualiza%C3%A7%C3%A3o-acbr-ita%C3%BA-%E2%80%93-migra%C3%A7%C3%A3o-da-api-francesa-para-api-boleto-v1-e-concilia%C3%A7%C3%A3o-pix/
- https://developers.sicoob.com.br/ ; https://www.sicoob.com.br/web/sicoob/servicos-empresa/-/asset_publisher/lPNqdz0jZZX1/content/id/166036588
- https://pypi.org/project/sicoob-sdk/ ; https://github.com/SharpSistemas/SicoobAPI ; https://github.com/SysmaxSolution/vetmax-app/pull/39
