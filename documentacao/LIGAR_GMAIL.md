# Ligar o envio de e-mail pelo Gmail da empresa

O sistema na nuvem (`erp.ankjck.com.br`) pode mandar e-mails (boleto, NF, recibos, avisos da ficha) direto pela conta Gmail da empresa, com o remetente `administracao@ankjck.com.br`. Enquanto isto não for feito, o envio fica desligado e a tela continua com "Copiar texto" e "Abrir no Gmail".

**Desde 17/11/2026 é um botão:** em **Dados e backup → E-mail pelo Gmail**, o administrador clica em **Conectar o Gmail → escolhe a conta → Permitir**, como em qualquer site. Não precisa mais rodar nada no computador nem colar código no Cloudflare. Antes do primeiro clique, uma preparação de uns 30 minutos, uma vez só: o "aplicativo" no Google Cloud e dois segredos no Cloudflare (passos 1 a 4).

Precisa: a conta Gmail que vai enviar, o painel do Cloudflare e o computador (Chrome). **Não cadastre cartão** no Google Cloud: o "teste gratuito"/faturamento que ele oferece não é preciso; a Gmail API é gratuita.

## 1. Projeto no Google Cloud
1. Entre em <https://console.cloud.google.com> **com a conta Gmail da empresa** (a que vai enviar).
2. No alto, "Selecionar projeto" → **Novo projeto** → nome `ERP Imoveis` → Criar. Se pedir cartão ou "ativar teste gratuito", feche: não é preciso.
3. Menu → **APIs e serviços** → **Biblioteca** → procure **Gmail API** → **Ativar**.

## 2. Tela de permissão (uso próprio)
1. APIs e serviços → **Tela de permissão OAuth** (pode aparecer como "Google Auth Platform" → Branding / Público).
2. Tipo de usuário: **Externo** (conta @gmail.com). Se a conta for do Google Workspace do domínio ankjck.com.br, escolha **Interno** e pule o item 4.
3. Nome do app `ERP Imoveis`, e-mail de suporte e de contato: o da própria conta. Salvar.
4. Em **Público**, clique em **Publicar app** (status **Em produção**). Importante: em "Teste" a autorização vence em 7 dias e o envio para de funcionar.
   - Não precisa mandar para verificação do Google: é só para a própria conta. Por isso, no passo 7 o Google vai mostrar "O Google não verificou este app": clique em **Avançado** → **Acessar ERP Imoveis (não seguro)**. É o seu próprio app.

## 3. Credencial "Aplicativo da Web"
1. No sistema, abra **Dados e backup → E-mail pelo Gmail** e clique em **Copiar** ao lado do **Endereço de retorno**. Na nuvem da empresa ele é:
   `https://erp.ankjck.com.br/api/email/google/retorno`
2. No Google Cloud: APIs e serviços → **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**.
3. Tipo: **Aplicativo da Web** → nome `ERP Imoveis` → em **URIs de redirecionamento autorizados** → **Adicionar URI** → cole o endereço do item 1 (exatamente igual, sem barra no fim). "Origens JavaScript autorizadas" fica vazio. Criar.
4. Copie o **ID do cliente** (Client ID) e a **Chave secreta do cliente** (Client Secret). Não mande por e-mail nem cole no chat.

## 4. Segredos no Cloudflare
Painel do Cloudflare → **Workers & Pages** → `erp-boletos` → **Settings** → **Variables and secrets** (o quadro de cima, não o de Build) → **Add**, tipo **Secret** em todos (tipo Text é apagado no próximo deploy):

| Nome | Valor |
|---|---|
| `GMAIL_CLIENT_ID` | ID do cliente do passo 3 |
| `GMAIL_CLIENT_SECRET` | Chave secreta do passo 3 |
| `GMAIL_REMETENTE` | `administracao@ankjck.com.br` (opcional: sem ele, os e-mails saem pela própria conta conectada) |
| `GMAIL_NOME` | `Administradora` (nome que aparece para quem recebe) |
| `GMAIL_CCO` | opcional: e-mail que recebe cópia oculta de tudo (ex.: a própria caixa da empresa) |

Vale na hora (o Worker lê a cada pedido). Quem preferir o terminal (precisa `npx wrangler login` antes): na pasta `nuvem/`, `npx wrangler secret put GMAIL_CLIENT_ID` (repete para cada um; ele pede o valor).

## 5. Remetente administracao@ankjck.com.br
Se a conta for o próprio Workspace com esse endereço, pule este passo.
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

## 7. Conectar (o botão)
1. No computador, no Chrome, entre no sistema como **administrador** → **Dados e backup** → caixa **E-mail pelo Gmail** → **Conectar o Gmail**.
2. O Google abre: escolha a **conta Gmail da empresa** → aviso do item 2.4 (**Avançado** → **Acessar ERP Imoveis**) → deixe marcada a permissão de **enviar e-mail em seu nome** → **Permitir**. O sistema só envia: não lê a caixa de entrada.
3. Volta sozinho para Dados e backup com "Gmail conectado". A caixa mostra **Ligado: os e-mails saem pela conta …**.
4. Teste: abra o e-mail de uma etapa (botão ✉ E-mail numa ficha ou contrato), ponha o seu próprio e-mail e clique em **Enviar agora**. Confira em **Enviados** do Gmail e na caixa de quem recebeu (remetente "Administradora", anexo junto).

Termine em até 10 minutos e no mesmo navegador em que clicou (o pedido vale uma vez só, por segurança). **Trocar a conta do Gmail** faz o mesmo caminho e troca a conta. **Desconectar** apaga a autorização da nuvem e a retira também na conta do Google; o "Enviar agora" some até alguém conectar de novo.

## Onde fica a autorização (para quem programa)
- `nuvem/gmail.mjs`: endereço do Google (escopos `gmail.send` e `openid email`, este só para saber qual conta foi ligada; `access_type=offline`, `prompt=consent`, `state` e PKCE S256), troca do código, cifra (AES-GCM 256 com chave tirada do `GMAIL_CLIENT_SECRET` por HKDF, sal sorteado), renovação do access token e revogação.
- `nuvem/gmail-conta.mjs`: tabelas próprias do cofre (`gmail_conta`, com o refresh token **já cifrado** e o e-mail da conta; `gmail_estados`, com o hash do `state`, o verificador do PKCE, quem pediu e a validade de 10 minutos). Fora dos registros: não vai para o JSON do banco, para os aparelhos nem para os backups. Só o administrador liga, troca e desliga.
- Rotas do Worker (`nuvem/worker.mjs`, todas atrás do Access): `POST /api/email/google/conectar` (administrador; devolve o endereço do Google), `GET /api/email/google/retorno` (a volta), `POST /api/email/google/desconectar` (administrador), `GET /api/email/estado` (situação, sem o token). Site: `docs/js/gmail.js` e a caixa em `docs/js/telas/emails.js` (`caixaGmailHtml`). Testes: `tests/gmail-conectar.test.mjs` e `tests/gmail.test.mjs`.
- **Access do Cloudflare e a volta do Google:** a volta (`/api/email/google/retorno`) fica dentro do Access como o resto do site, **sem** regra Bypass (ela precisa do login do administrador para conferir que o pedido é dele). O Google devolve o navegador para esse endereço; como é o mesmo navegador, já logado no Access, o cookie do login vai junto (com o cookie do Access em SameSite "Lax" ou "None", o navegador o manda nesse redirecionamento) e a volta passa direto. Se o login do Access tiver vencido no meio, o Access pede o código do e-mail e depois continua para a volta. Se em Access → Applications → `erp` → Settings o cookie estiver como SameSite "Strict", o Access pede o código toda vez na volta (funciona, só é mais chato): deixe em "Lax" ou "None".
- Se o `GMAIL_CLIENT_SECRET` for trocado no Google Cloud, a autorização guardada não abre mais: a caixa avisa e é só clicar em **Conectar o Gmail** de novo.

## Jeito antigo (continua valendo)
Quem ligou antes de 17/11 com `node tools/gmail-token.mjs` (credencial "App para computador") e o segredo `GMAIL_REFRESH_TOKEN` no Cloudflare continua enviando: a caixa mostra "Ligado pelo jeito antigo". Ao clicar em **Conectar o Gmail** (com uma credencial "Aplicativo da Web", passo 3), o botão passa a valer e o segredo antigo deixa de ser usado; depois ele pode ser apagado no Cloudflare. Se desconectar pelo botão com o segredo antigo ainda lá, o envio volta a usar o antigo (a tela avisa).

## Testar no computador antes
- `SIMULAR_GMAIL=1 node nuvem/local.mjs` (PowerShell: `$env:SIMULAR_GMAIL='1'; node nuvem/local.mjs`) → `http://localhost:8787`: o envio aparece ligado (Simulado) e só escreve no terminal; nada vai ao Google.
- Com `GMAIL_CLIENT_ID` e `GMAIL_CLIENT_SECRET` de uma credencial "Aplicativo da Web" que tenha também o retorno `http://localhost:8787/api/email/google/retorno`, o `local.mjs` mostra o botão e conecta de verdade.

## Se parar de funcionar
- "A autorização do Gmail venceu ou foi retirada": clique em **Conectar o Gmail** de novo. Acontece se o app ficou em "Teste" (7 dias), se a senha da conta Google for trocada, se a permissão for retirada em Conta do Google → Segurança → Apps com acesso, ou depois de 6 meses sem nenhum envio.
- Na volta, "Faltou marcar a caixa de enviar e-mail em seu nome": o Google deixa desmarcar cada permissão; conecte de novo e deixe marcada.
- Na volta, "endereço de retorno diferente": o URI do passo 3 não está igual ao que a caixa mostra (cuidado com barra no fim ou `http` no lugar de `https`).
- Na volta, "não reconheceu o aplicativo": confira `GMAIL_CLIENT_ID` e `GMAIL_CLIENT_SECRET` (da credencial **Aplicativo da Web**, não a antiga "App para computador").
- "Limite de envios do Gmail atingido": conta @gmail.com manda até ~500 e-mails por dia; espere até o dia seguinte.
- "A Gmail API não está ativada": passo 1.3.

## O que está confirmado e o que não está
**Confirmado (documentação do Google e testes do código):** fluxo de aplicativo da Web em `accounts.google.com/o/oauth2/v2/auth` com `access_type=offline` e `prompt=consent` (assim o Google sempre manda o refresh token), `state` e PKCE; troca do código e renovação em `oauth2.googleapis.com/token`; revogação em `oauth2.googleapis.com/revoke`; o e-mail da conta vem no `id_token` da troca (escopo `openid email`); o Google deixa a pessoa desmarcar permissões, e o sistema confere se `gmail.send` veio; envio por `gmail/v1/users/me/messages/send` com `raw` (mensagens grandes vão por `upload/gmail/v1/users/me/messages/send`, até 35 MB); app em "Teste" tem token de 7 dias; o Gmail usa o "Enviar como" verificado no `From` e troca pelo endereço principal se não estiver verificado; cópia oculta (`Bcc`) entregue sem aparecer; SPF com `include:_spf.google.com`; ~500 e-mails/dia em conta @gmail.com. Os testes simulam o Google (`tests/gmail-conectar.test.mjs`): a ligação de verdade ainda não foi feita.

**Não confirmado (conferir ao ligar):**
- A volta do Google passando pelo Access sem pedir o código de novo (esperado com o cookie do Access em "Lax" ou "None"; conferir a opção em Access → Applications → `erp` → Settings).
- Se o "Enviar como" vai pedir servidor SMTP (depende de como o domínio recebe e-mail hoje) e se o Gmail vai mostrar "enviado por gmail.com" ao lado do remetente.
- DMARC: numa conta @gmail.com a assinatura (DKIM) sai como gmail.com, não ankjck.com.br. Se o domínio tiver DMARC `p=reject`/`p=quarantine`, os e-mails podem ser recusados ou ir ao spam; com `p=none` ou sem DMARC, chegam. Conferir mandando para uma conta de fora (Outlook, Hotmail) e olhando o spam.
- Tempo de processamento do Worker no plano grátis (10 ms) com anexos grandes (perto de 20 MB): testar com um PDF de 5–10 MB. Se falhar, o caminho é limitar os anexos ou passar o Worker para o plano pago.
- Nomes exatos dos menus do Google Cloud (mudam com frequência; acima estão os de nov/2026 até onde se sabe).
