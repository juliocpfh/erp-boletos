# Ponte C6 — boleto com Pix pela API do C6 Bank

Programinha que roda **no computador de quem emite os boletos** e faz a ligação entre o site (Administração de Imóveis) e a API do C6 Bank.

**Por que precisa dele?** A API do C6 exige um *certificado digital* (mTLS) e um *token* obtido com `client_id` e `client_secret`. O navegador não consegue apresentar esse certificado nem guardar as chaves com segurança. Então o site conversa com a ponte (aqui, no seu computador), e a ponte conversa com o banco. As chaves nunca saem do seu computador e nunca ficam no banco de dados do sistema.

A ponte atende **mais de uma conta bancária** (ex.: ANK e JCK), cada uma com suas próprias chaves. Os boletos saem pela conta padrão (ANK) ou pela escolhida boleto a boleto (opção em Empresas, no site); as outras contas ficam prontas para extrato, comprovantes e pagamentos.

## O que precisa ter instalado

Só o [Node.js](https://nodejs.org) (versão 20 ou mais nova). Nada mais: a ponte usa só o que vem com o Node.

## Passo a passo

1. Copie a pasta `ponte-c6` para o computador que vai emitir os boletos (ex.: `C:\Imoveis\ponte-c6`).
2. Copie `.env.exemplo` para `.env` e preencha:
   - `PONTE_SENHA`: invente uma frase longa. A mesma senha vai no site, em **Dados e backup → Banco (C6) → Senha da ponte** (fica só no navegador daquele computador: informe em cada computador que vai usar o banco).
   - `CONTAS=ank,jck`: os identificadores das contas (só letras e números). Os mesmos são cadastrados no site, em **Dados e backup → Banco (C6) → Contas**.
   - Enquanto não tiver as chaves do banco, deixe `SIMULADO=1`: a ponte responde com boletos **fictícios** (no formato exato da API) e dá para testar as telas.
3. Quando o C6 liberar as chaves de cada conta (veja abaixo), coloque-as na pasta `contas/<id>/` (ex.: `contas/ank/`):
   - `client_id.txt` e `client_secret.txt` (um valor em cada arquivo), ou as variáveis `C6_ANK_CLIENT_ID` / `C6_ANK_CLIENT_SECRET` no `.env`;
   - `certificado.crt` e `chave.key` (o par mTLS gerado no Web Banking do C6);
   - `ambiente.txt` com `sandbox` (testes) ou `producao`.
   Depois troque `SIMULADO=0`.
4. Abra um terminal na pasta e rode:
   ```
   node servidor.mjs
   ```
   Deve aparecer `Ponte C6 v… em http://127.0.0.1:8765` e a situação de cada conta (chaves, validade do certificado).
5. No site, em **Dados e backup → Banco (C6) — boleto com Pix**: informe o endereço `http://localhost:8765`, a senha e clique em **Testar conexão**. Cadastre as contas (uma por empresa) e ative a integração.

Deixe a ponte rodando enquanto usa o sistema (uma janela do terminal aberta, ou crie um atalho/tarefa agendada do Windows para `node C:\Imoveis\ponte-c6\servidor.mjs`).

## Como conseguir as chaves no C6

- **Sandbox (teste)**: cadastro em `developers.c6bank.com.br/create-access`, escolhendo o produto "Boleto com Pix"; as credenciais de teste chegam por e-mail. O sandbox de boleto funciona de segunda a sexta, das 7h às 22h (carteira 21).
- **Produção**: o titular de cada conta PJ entra no **Web Banking → menu do perfil → "Integrações via API" → "Nova chave"**, escolhe o parceiro/software, a conta e as permissões de boleto; o banco gera `client_id`, `client_secret` e o certificado (validade de ~12 meses: a ponte mostra a data em `/saude` e avisa 30 dias antes). Duas contas = duas chaves (uma por CNPJ). Alguns relatos dizem que a cobrança via API precisa ser ativada pelo gerente.
- **Homologação**: o C6 pede o "Roteiro de Testes – C6 Developers v3.0" preenchido com o status e o corpo da resposta de cada teste (AT_01 token; BP_01 criar, BP_02 atualizar, BP_03 consultar, BP_04 PDF, BP_05 cancelar, BP_06 listar), enviado para **homologacaoapi@c6bank.com**. A ponte grava cada chamada ao banco em `registros/AAAA-MM-DD.jsonl`; `node servidor.mjs --roteiro` (ou `GET /roteiro`) imprime o último resultado de cada teste, pronto para copiar no roteiro.
- Escopos necessários na credencial: `v2.bankslip.read`, `v2.bankslip.write`, `v2.bankslip.pix.write` (sem eles o banco responde 403; `/saude` lista os escopos recebidos e avisa o que falta).

## Rotas que a ponte oferece ao site

Todas respondem JSON e exigem o cabeçalho `X-Senha-Ponte` (a senha do `.env`), menos o webhook. `:conta` é o identificador da conta (`ank`, `jck`); `:id` é o `external_reference_id` do boleto (gerado pelo site, 26 caracteres).

| Rota da ponte | O que faz | Chamada no C6 (OpenAPI Bolepix 1.2.0) |
|---|---|---|
| `GET /saude` | Situação da ponte e de cada conta: `{ configurado, simulado, exposta, faltam: [...], contas: { ank: { configurado, faltam, ambiente, certificado, certificado_valido_ate, token, escopos, avisos } } }` (sem a senha, só `{ configurado, simulado, exposta }`) | pede o token de cada conta configurada |
| `GET /contas` · `GET /contas/:conta/saude` | Lista das contas / situação de uma | — |
| `POST /contas/:conta/boletos` | Emite um boleto com Pix (corpo: pedido no formato do C6, montado pelo site) | BP_01 `POST /v2/bank_slips` → 201 |
| `GET /contas/:conta/boletos/:id` | Consulta a situação; se pago, junta os pagamentos da listagem (`payments[]`) | BP_03 `GET /v2/bank_slips/{id}` (+ BP_06) |
| `GET /contas/:conta/boletos?payment_date_from=…&payment_date_to=…` | Lista boletos por intervalo de datas (`payment_date`, `due_date` ou `credit_date`, até 60 dias; `status`, `external_reference_id`, `page`, `size`) | BP_06 `GET /v2/bank_slips` → `{ content[], total_pages, … }` |
| `POST /contas/:conta/boletos/:id/alterar` | Altera valor, vencimento, descrição… (corpo com os campos a mudar) | BP_02 `PATCH /v2/bank_slips/{id}` |
| `POST /contas/:conta/boletos/:id/cancelar` | Cancela (baixa) no banco | BP_05 `PUT /v2/bank_slips/{id}/cancel` → 204 |
| `GET /contas/:conta/boletos/:id/pdf` | PDF do boleto | BP_04 `GET /v2/bank_slips/{id}/pdf` (application/pdf) |
| `POST /contas/:conta/boletos/:id/negativar` | Agenda a negativação do pagador (`{ deadline: dias de atraso }`) | `POST /v2/bank_slips/{id}/denial` → 201 |
| `POST /contas/:conta/boletos/:id/negativar/cancelar` | Cancela a negativação (só com `can_cancel`) | `DELETE /v2/bank_slips/{id}/denial` → 204 |
| `POST /webhook/c6/:conta/<segredo>` | Recebe os avisos do banco (sem senha: quem chama é o C6). O `<segredo>` é `C6_<ID>_WEBHOOK_TOKEN` (32 hex; sem ele a rota não existe); corpo até 64 KB; guarda só `{ external_reference_id, status, reconsultar: true }` em `notificacoes/<conta>-AAAA-MM-DD.jsonl`. O aviso não tem assinatura, então o site sempre reconsulta o boleto | cadastro: `POST /v1/webhooks { url: "https://<ponte>/webhook/c6/ank/<segredo>", service: "BANK_SLIP_PIX" }` |
| `GET /contas/:conta/notificacoes?desde=…` | Avisos guardados | — |
| `GET /roteiro` | Último registro de cada teste do roteiro de homologação (só com a senha) | — |
| Fase 2 (`rotas-fase2.mjs`, montadas aqui): `GET /contas/:conta/extrato`, `/saldo`, `/boletos/pagos`, `/dda`, `/comprovante/:reference`; com `PAGAMENTOS=1`: `POST /pagamentos/decodificar`, `GET|DELETE /pagamentos/:grupo/itens`, `DELETE …/itens/:item`, `POST /pagamentos/:grupo/enviar` | Extrato, saldo, boletos pagos, DDA, lotes de pagamento para aprovação no app, comprovante em PDF gerado pela ponte (`README-fase2.md`) | `/v1/statement`, `/v1/schedule_payments` |
| `POST /contas/:conta/simulado/pagar/:id` | **Só no modo simulado:** marca um boleto fictício como pago (`payments[]` como na listagem), para testar "Consultar situação" | — |

Autenticação no C6: `POST /v1/auth/` com `grant_type=client_credentials`, `client_id` e `client_secret` (formulário), apresentando o certificado; resposta `{ access_token, expires_in, token_type, scope }`. O token é guardado e renovado sozinho um minuto antes de vencer. Cabeçalhos enviados: `Authorization: Bearer …`, `partner-software-name`, `partner-software-version`. Erros do banco vêm no formato RFC 7807 e o `detail` é repassado ao site.

URLs base: sandbox `https://baas-api-sandbox.c6bank.info`, produção `https://baas-api.c6bank.info`.

Fonte do formato: arquivos OpenAPI oficiais enviados pelo dono (`documentacao/c6-openapi/*.yaml`, resumo em `documentacao/C6_CAMPOS_CONFIRMADOS.md`) e o portal `developers.c6bank.com.br/apis/bolepix` (YAML em `developers.c6bank.com.br/yamls/bolepix.yaml`). Os nomes dos campos e caminhos ficam só em `mapa-c6.mjs` (cópia idêntica de `docs/js/mapa-c6.js`, usado pelo site; o teste confere que são iguais). Do mesmo jeito, `c6-comum.mjs` = `docs/js/c6-comum.js` (datas, janelas, centavos e linha digitável → código de barras): mexeu num, copie para o outro.

## Para crescer (extrato, comprovantes, pagamento de contas)

Cada serviço é uma entrada em `SERVICOS` no `servidor.mjs`, com rotas relativas a `/contas/:conta`:

```js
extrato: { descricao: 'Extrato da conta', rotas: [
  { metodo: 'GET', padrao: /^\/extrato\/?$/, async executar({ cfg, conta, query }) { … return { status: 200, dados }; } },
] },
```

`chamarC6(cfg, conta, metodo, caminho, corpo)` faz a chamada autenticada com o certificado da conta e registra status e resposta em `registros/`. No site, `docs/js/banco.js` → `chamarPonte(d, contaId, metodo, caminho, corpo)` chama `<ponte>/contas/<contaId><caminho>`. Caminhos da API de saldo/extrato (`/v1/statement`), agendamento de pagamentos (`/v1/schedule_payments`) e Pix (`/v2/pix`) estão resumidos em `documentacao/C6_CAMPOS_CONFIRMADOS.md`.

## Segurança

- A ponte escuta **só neste computador** (`127.0.0.1`). Para ouvir em outro endereço é preciso `EXPOR=1`, e ela avisa em letras grandes no console e em `/saude` (`exposta: true`): nesse caso proteja o acesso com **Cloudflare Access ou Tailscale** e use HTTPS. Sem senha (`PONTE_SENHA`) a ponte exposta não sobe.
- Só aceita chamadas das origens da lista fixa `ORIGENS` (CORS); `*` nunca é aceito. No preflight responde `Access-Control-Allow-Private-Network: true` (o Chrome exige para o site público chamar `localhost`).
- `PONTE_SENHA` é obrigatória, com **pelo menos 20 caracteres**: sem ela a ponte não sobe. A senha é comparada em tempo constante (`crypto.timingSafeEqual`); cada senha errada do mesmo IP (o `CF-Connecting-IP` do Cloudflare, senão o do socket) demora mais para responder (1 s, 2 s, 4 s, 8 s) e **10 erros seguidos bloqueiam o IP por 15 minutos**.
- O pedido de emissão vindo do site é **remontado pela ponte** só com os campos conhecidos (`mapa-c6.mjs`): CPF/CNPJ com dígito verificador, valor até `C6_<ID>_VALOR_MAXIMO` (padrão R$ 50.000), chave Pix sempre a da conta (`C6_<ID>_CHAVE_PIX`; a do navegador é ignorada), avisos só para o e-mail/telefone do próprio pagador, textos cortados nos limites da API. Campos desconhecidos são descartados.
- Webhook só no endereço com o segredo da conta (`C6_<ID>_WEBHOOK_TOKEN`), corpo até 64 KB, um arquivo por dia; o aviso guarda só a referência a reconsultar.
- Registros do roteiro (`registros/`): só data, conta, método, caminho, status, id, referência e erro resumido (CPF/CNPJ/e-mail mascarados; token nunca); apagados após `RETENCAO_REGISTROS_DIAS` (30). `PASTA_REGISTROS=` (vazio) desliga; `/roteiro` só com a senha.
- Erros internos (500) voltam com mensagem genérica; caminhos de disco nunca saem da ponte (nem em `/saude`: certificado `ok`/`faltando`).
- `/saude` sem a senha diz só `{ configurado, simulado, exposta }`; contas, escopos e validade do certificado só com a senha.
- `SIMULADO=1` com uma conta em produção: a ponte **se recusa a subir**.
- No site, o endereço e a senha da ponte ficam **só no navegador** de cada computador (IndexedDB), nunca no arquivo de dados compartilhado na pasta/OneDrive.
- Credenciais em arquivos: restrinja a leitura ao seu usuário (`chmod 600 contas/*/*` no Linux/macOS; no Windows, Propriedades → Segurança → só o seu usuário). A ponte avisa em `/saude` quando o arquivo está legível por outros.
- `.env`, `contas/`, `credenciais/`, `notificacoes/` e `registros/` estão no `.gitignore`: nunca vão para o GitHub.
- Nunca vai para log nem para os registros: token, `client_secret`, senha da ponte, chave privada. Nos registros do roteiro os CPF/CNPJ são mascarados (`529*****725`).

## Testes

`node --test tests/ponte-c6.test.mjs` (na raiz do repositório) sobe a ponte em modo simulado numa porta livre e confere `/saude`, senha, CORS, a remontagem segura do pedido, emissão (idempotente), consulta, listagem, alteração, pagamento simulado, negativação, cancelamento, webhook com segredo, rotas da fase 2 e roteiro. Os módulos da fase 2 têm os próprios testes: `node --test "ponte-c6/testes/*.test.mjs"`.
