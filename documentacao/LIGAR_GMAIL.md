# Ligar o envio de e-mail pelo Gmail da empresa

O sistema na nuvem (`erp.ankjck.com.br`) pode mandar e-mails (boleto, NF, avisos) direto pela conta Gmail da empresa, com o remetente `administracao@ankjck.com.br`. Enquanto isto não for feito, o envio fica desligado e a tela continua com "Copiar texto" e "Abrir no Gmail".

Leva uns 30 minutos, uma vez só. Precisa: a conta Gmail que recebe os e-mails da empresa, o computador com o projeto e o painel do Cloudflare.

Código: `nuvem/gmail.mjs` (envio), rotas `/api/email/estado` e `/api/email/enviar` em `nuvem/worker.mjs`, `docs/js/gmail.js` (site), `tools/gmail-token.mjs` (passo 4), testes em `tests/gmail.test.mjs`.

## 1. Projeto no Google Cloud
1. Entre em <https://console.cloud.google.com> **com a conta Gmail da empresa** (a que vai enviar).
2. No alto, "Selecionar projeto" → **Novo projeto** → nome `ERP Imoveis` → Criar.
3. Menu → **APIs e serviços** → **Biblioteca** → procure **Gmail API** → **Ativar**.

## 2. Tela de consentimento (uso próprio)
1. APIs e serviços → **Tela de permissão OAuth** (pode aparecer como "Google Auth Platform" → Branding / Público).
2. Tipo de usuário: **Externo** (conta @gmail.com). Se a conta for do Google Workspace do domínio ankjck.com.br, escolha **Interno** e pule o item 4.
3. Nome do app `ERP Imoveis`, e-mail de suporte e de contato: o da própria conta. Salvar.
4. Em **Público**, clique em **Publicar app** (status **Em produção**). Importante: em "Teste" a autorização vence em 7 dias e o envio para de funcionar.
   - Não precisa mandar para verificação do Google: é só para a própria conta. Por isso, no passo 4 o Google vai mostrar "O Google não verificou este app" — clique em **Avançado** → **Acessar ERP Imoveis (não seguro)**. É o seu próprio app.

## 3. Credencial
1. APIs e serviços → **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**.
2. Tipo: **App para computador** → nome `gerar-token` → Criar.
3. Copie o **Client ID** e o **Client Secret** (ficam também em "Fazer download do JSON"). Guarde num lugar seguro.

## 4. Gerar o refresh token (autorização)
No computador, na pasta do projeto:
```
node tools/gmail-token.mjs
```
1. Cole o Client ID e o Client Secret quando pedir.
2. O navegador abre: entre com a **conta Gmail da empresa**, passe pelo aviso do item 2.4 e clique em **Permitir** (a permissão é só "enviar e-mail em seu nome": o sistema não lê a caixa).
3. O terminal mostra o **GMAIL_REFRESH_TOKEN**. Copie. Não mande por e-mail nem cole no sistema.

## 5. Remetente administracao@ankjck.com.br
Se a conta for o próprio Workspace com esse endereço, pule este passo (use o próprio endereço no passo 6).
1. No Gmail (computador): engrenagem → **Ver todas as configurações** → **Contas e importação** → **Enviar e-mail como** → **Adicionar outro endereço de e-mail**.
2. Nome `Administradora`, e-mail `administracao@ankjck.com.br`, deixe marcado "Tratar como alias".
3. Se pedir servidor SMTP: `smtp.gmail.com`, porta `587`, usuário = a conta Gmail, senha = uma **senha de app** (Conta do Google → Segurança → Verificação em duas etapas → Senhas de app; só aparece com a verificação em duas etapas ligada), TLS.
4. O Gmail manda um código para `administracao@ankjck.com.br` (chega na mesma caixa pelo encaminhamento): confirme.
5. Sem este passo, o Gmail troca o remetente pelo endereço @gmail.com sem avisar.

## 6. SPF do domínio (Cloudflare)
Para os e-mails não caírem no spam: painel do Cloudflare → `ankjck.com.br` → **DNS** → registro **TXT** do nome `@` que começa com `v=spf1`.
- Se já existe (ex.: o do encaminhamento de e-mail do Cloudflare, `v=spf1 include:_spf.mx.cloudflare.net ~all`), **edite** e acrescente `include:_spf.google.com` antes do `~all`: `v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all`. Nunca deixe dois registros `v=spf1`.
- Se não existe, crie: `v=spf1 include:_spf.google.com ~all`.
- Veja também se há um TXT `_dmarc`: se estiver com `p=reject` ou `p=quarantine`, avise antes de ligar (ver "não confirmado" abaixo).

## 7. Segredos no Worker
Painel do Cloudflare → **Workers & Pages** → `erp-boletos` → **Settings** → **Variables and secrets** (o quadro de cima, não o de Build) → **Add**, tipo **Secret** em todos (tipo Text é apagado no próximo deploy):

| Nome | Valor |
|---|---|
| `GMAIL_CLIENT_ID` | Client ID do passo 3 |
| `GMAIL_CLIENT_SECRET` | Client Secret do passo 3 |
| `GMAIL_REFRESH_TOKEN` | o do passo 4 |
| `GMAIL_REMETENTE` | `administracao@ankjck.com.br` |
| `GMAIL_NOME` | `Administradora` (nome que aparece para quem recebe) |
| `GMAIL_CCO` | opcional: e-mail que recebe cópia oculta de tudo (ex.: a própria caixa da empresa) |

Quem preferir o terminal (precisa `npx wrangler login` antes): na pasta `nuvem/`, `npx wrangler secret put GMAIL_CLIENT_ID` (repete para cada um; ele pede o valor).

Vale na hora (o Worker lê a cada pedido). Confira: no sistema, a tela de e-mail mostra o botão de enviar pelo sistema; mande um e-mail de teste para você mesmo e veja em **Enviados** do Gmail.

## Testar no computador antes
- `SIMULAR_GMAIL=1 node nuvem/local.mjs` (PowerShell: `$env:SIMULAR_GMAIL='1'; node nuvem/local.mjs`) → `http://localhost:8787`: o envio aparece ligado e só escreve no terminal; nada vai ao Google.
- Com as variáveis `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_REMETENTE` (sem `SIMULAR_GMAIL`), o `local.mjs` envia de verdade.

## Se parar de funcionar
- "A autorização do Gmail venceu ou foi retirada": repita o passo 4 e troque o `GMAIL_REFRESH_TOKEN`. Acontece se o app ficou em "Teste" (7 dias), se a senha da conta Google for trocada, se a permissão for retirada em Conta do Google → Segurança → Apps com acesso, ou depois de 6 meses sem nenhum envio.
- "Limite de envios do Gmail atingido": conta @gmail.com manda até ~500 e-mails por dia; espere até o dia seguinte.
- "A Gmail API não está ativada": passo 1.3.

## O que está confirmado e o que não está
**Confirmado (documentação do Google e testes do código):** troca do refresh token em `oauth2.googleapis.com/token`; envio por `gmail/v1/users/me/messages/send` com `raw` (mensagens grandes vão por `upload/gmail/v1/users/me/messages/send`, que aceita até 35 MB); o escopo `gmail.send` só envia; app em "Teste" tem token de 7 dias; o Gmail usa o "Enviar como" verificado no `From` e troca pelo endereço principal se não estiver verificado; a cópia oculta (`Bcc`) é entregue e não aparece para o destinatário; SPF com `include:_spf.google.com`; limite de ~500 e-mails/dia em conta @gmail.com. Os testes (`tests/gmail.test.mjs`) simulam o Google: o envio de verdade ainda não foi feito.

**Não confirmado (conferir ao ligar):**
- Se o "Enviar como" vai pedir servidor SMTP (depende de como o domínio recebe e-mail hoje) e se o Gmail vai mostrar "enviado por gmail.com" ao lado do remetente.
- DMARC: numa conta @gmail.com a assinatura (DKIM) sai como gmail.com, não ankjck.com.br. Se o domínio tiver DMARC `p=reject`/`p=quarantine`, os e-mails podem ser recusados ou ir ao spam; com `p=none` ou sem DMARC, chegam. Conferir mandando para uma conta de fora (Outlook, Hotmail) e olhando o spam.
- Tempo de processamento do Worker no plano grátis (10 ms) com anexos grandes (perto de 20 MB): testar com um PDF de 5–10 MB. Se falhar, o caminho é limitar os anexos a menos ou passar o Worker para o plano pago.
- Nomes exatos dos menus do Google Cloud (mudam com frequência; acima estão os de nov/2026 até onde se sabe).
