# Dados na nuvem (Cloudflare) — etapas 1 e 2 de 5

Programas que rodam no Cloudflare e guardam os dados no lugar da pasta do OneDrive. Estudo, decisões e etapas: `documentacao/ESTUDO_DADOS_NUVEM.md` (e `DECISOES.md`, 2026-11-06).

- `worker.mjs`: porta de entrada (`https://erp.ankjck.com.br/api/`). Confere o login, guarda os anexos no R2 e repassa os dados ao cofre.
- `cofre.mjs`: o cofre dos dados (Durable Object com SQLite). Recebe as filas de mudanças de cada aparelho, uma por vez, e guarda cada registro numa linha.
- Testes: `tests/nuvem.test.mjs` e `tests/cofre.test.mjs` (o `checar.mjs` roda os dois).

**Situação:** pronto e testado, mas **ainda não publicado**, e o site ainda não usa (etapa 3). Os dados de verdade continuam na pasta.

## Como funciona
- O aparelho baixa tudo uma vez (`GET dados/tudo`, no mesmo formato do `imoveis-dados.json`, com `_nuvem.seq` = ponto da fila). Depois pega só o que mudou (`GET dados/mudancas?desde=N`).
- Ao gravar, manda um **lote** (`POST dados/lote`): `{ id, ops: [...] }` com `inserir` (registro novo), `alterar` (campo: `antes` e `depois`), `excluir` (com o registro como estava), `raiz` (campos fora das tabelas, como a logo) e `historico`. O mesmo lote reenviado não aplica de novo, e um lote com erro não aplica nada.
- **Conflito** (mesmo campo mudado em dois aparelhos sem se verem): o campo volta ao valor anterior e nada vale até alguém escolher (`POST dados/resolver`). Excluir um registro que outro mudou, ou mudar um que outro excluiu, também espera a escolha.
- **Códigos novos sem internet:** cada aparelho pede uma faixa (`POST dados/faixa`, até 1000 por vez) e nunca repete código com outro aparelho.
- **NF:** o número só sai com internet, pelo contador (`POST dados/contador`, `proxima_fatura`). O lote não consegue mudar esse número.
- **Backups:** uma cópia completa por dia no R2 (`backups/`, horário de Brasília, 30 guardadas, só leitura) e outra antes de qualquer "substituir tudo". Os registros excluídos ficam guardados no cofre.
- **Anexos:** `GET/PUT/DELETE arquivos/<caminho>`, `GET lista/<pasta>/`, `POST mover` e `POST apagar` (pasta inteira; pastas grandes vão em partes, `mais: true`). No site, `docs/js/pasta-nuvem.js` imita a pasta do computador por cima dessas rotas.

## Segurança (o que o código já faz)
1. **Login de verdade:** cada pedido confere o token do Cloudflare Access (assinatura, aplicativo, equipe e validade). Sem essa configuração, recusa tudo. Quem entra: a lista de e-mails do Access (painel) **e** um usuário ativo com esse e-mail em Usuários (o cofre confere). `EMAILS` é uma trava extra opcional.
   - Trocar o e-mail de alguém: Usuários → trocar o e-mail; no painel do Access, pôr o novo e tirar o antigo. Alguém que sai: desativar em Usuários (bloqueia na hora). O modo de teste sem login só vale em `localhost`.
2. **Papéis conferidos no servidor**, pelo e-mail do usuário no sistema (`usuarios[].login` ou `.email`). *Consulta* só lê (dados e anexos). *Operador* grava, mas não mexe em usuários (só troca a própria senha) nem na ordem das caixas. *Administrador* faz tudo e é o único que substitui os dados. E-mail sem usuário ativo não entra.
3. **Quem gravou de verdade:** o histórico recebe o e-mail do login (`email_nuvem`), e não só o nome que o aparelho informa.
4. **Entradas barradas:** nomes de tabela e campo só com letras, números e `_` (nada de `__proto__` ou SQL); registro de até 1 MB; lote de até 2000 mudanças e 8 MB; códigos inteiros positivos; os campos `senha_ponte` e `ponte_url` são apagados se aparecerem.
5. **Só o próprio site chama:** gravação exige o cabeçalho `X-Sistema` e a origem do site, e não há CORS (outro site não consegue pedir nada).
6. **Anexos:** `.html/.svg/.xml/.js` recusados; abrem na aba só PDF e foto, com `sandbox` (sem scripts) e `nosniff`; caminhos com `..`, barra invertida ou caracteres de controle são recusados.

**Riscos que continuam (e o que reduz):**
- As senhas do sistema (hash PBKDF2, 600 mil voltas) vão para cada aparelho, como hoje na pasta, porque o login do sistema é conferido no aparelho. Quem passa pelo Access pode tentar quebrá-las: senhas longas. O Access e os papéis no servidor valem mesmo assim.
- A cópia no aparelho é cifrada (`docs/js/cofrinho.js`): sem a senha do sistema (ou o login lembrado), não se lê nada dos inquilinos; fica aberta só a lista de usuários (senhas embaralhadas), para o login funcionar sem internet. Sair apaga a chave do aparelho.

## Publicar (etapa 5, junto com o login; não fazer antes)
1. Cloudflare → **R2** → ativar (pede cartão; o grátis cobre 10 GB) → **Create bucket** `imoveis-dados`. **Não** ligar o acesso público (r2.dev) nem domínio público no bucket. Em **Billing**, criar alerta de gasto.
2. **Zero Trust** → criar a equipe (ex.: `ankjck`) → **Access → Applications → Add → Self-hosted**: domínio `erp.ankjck.com.br` (o site inteiro), política *Allow* só com os 4 e-mails, login por **código no e-mail**, sessão de **24 horas**. Copiar o **AUD** do aplicativo.
3. DNS: o `erp` com a **nuvem laranja** (SSL/TLS em **Full (strict)**; ver `PUBLICAR_NO_DOMINIO.md`, etapa 4). Em **Rules → Transform Rules → Response headers**, para `erp.ankjck.com.br`: `Strict-Transport-Security: max-age=15552000`, `X-Frame-Options: DENY` e `Referrer-Policy: no-referrer`.
4. Na pasta `nuvem/`: `npx wrangler login`, `npx wrangler deploy` e, no fim, `npx wrangler logout` (para não deixar o acesso aberto no computador).
5. `npx wrangler secret put ACCESS_EQUIPE` (ex.: `ankjck.cloudflareaccess.com`) e `ACCESS_AUD` (`EMAILS` é opcional: se usar, lembre de mantê-la igual à lista do Access). **Nunca** criar `MODO_TESTE` no Cloudflare.
6. Conta Cloudflare: **verificação em 2 etapas** ligada, sem outros membros, sem chaves de API sobrando.
7. Conferir: `https://erp.ankjck.com.br/api/saude` pede o código no e-mail e depois mostra `{"ok":true,"email":…}`; numa janela anônima, sem login, `/api/dados/tudo` não abre.
