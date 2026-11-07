# Dados na nuvem (Cloudflare) — no ar desde 2026-11-06

Programas que rodam no Cloudflare e guardam os dados no lugar da pasta do OneDrive. Estudo, decisões e etapas: `documentacao/ESTUDO_DADOS_NUVEM.md` (e `DECISOES.md`, 2026-11-06).

- `worker.mjs`: porta de entrada (`https://erp.ankjck.com.br/api/`). Confere o login, guarda os anexos no R2 e repassa os dados ao cofre.
- `cofre.mjs`: o cofre dos dados (Durable Object com SQLite). Recebe as filas de mudanças de cada aparelho, uma por vez, e guarda cada registro numa linha.
- Testes: `tests/nuvem.test.mjs` e `tests/cofre.test.mjs` (o `checar.mjs` roda os dois).

**Situação:** publicado em 2026-11-06 (etapa 5) e os dados levados da pasta (conferência ok). O site `erp.ankjck.com.br` abre sempre pela nuvem (vê que `/api/saude` responde); a pasta do OneDrive ficou de reserva.

## Como funciona
- O aparelho baixa tudo uma vez (`GET dados/tudo`, no mesmo formato do `imoveis-dados.json`, com `_nuvem.seq` = ponto da fila). Depois pega só o que mudou (`GET dados/mudancas?desde=N`).
- Ao gravar, manda um **lote** (`POST dados/lote`): `{ id, ops: [...] }` com `inserir` (registro novo), `alterar` (campo: `antes` e `depois`), `excluir` (com o registro como estava), `raiz` (campos fora das tabelas, como a logo) e `historico`. O mesmo lote reenviado não aplica de novo, e um lote com erro não aplica nada.
- **Conflito** (mesmo campo mudado em dois aparelhos sem se verem): o campo volta ao valor anterior e nada vale até alguém escolher (`POST dados/resolver`). Excluir um registro que outro mudou, ou mudar um que outro excluiu, também espera a escolha.
- **Códigos novos sem internet:** cada aparelho pede uma faixa (`POST dados/faixa`, até 1000 por vez) e nunca repete código com outro aparelho.
- **NF:** o número só sai com internet, pelo contador (`POST dados/contador`, `proxima_fatura`). O lote não consegue mudar esse número.
- **Backups:** uma cópia completa por dia no R2 (`backups/`, horário de Brasília, 30 guardadas, só leitura e só o administrador baixa) e outra antes de qualquer "substituir tudo". Dados e backup → **Backups da nuvem** lista, baixa e "volta para um dia" (substitui os dados; os anexos ficam). O backup seguro (pasta cifrada no computador do administrador) continua funcionando na nuvem: segunda camada, fora do Cloudflare. Os registros excluídos ficam guardados no cofre.
- **Anexos:** `GET/PUT/DELETE arquivos/<caminho>`, `GET lista/<pasta>/`, `POST mover` e `POST apagar` (pasta inteira; pastas grandes vão em partes, `mais: true`). No site, `docs/js/pasta-nuvem.js` imita a pasta do computador por cima dessas rotas.

## Segurança (o que o código já faz)
1. **Login de verdade:** cada pedido confere o token do Cloudflare Access (assinatura, aplicativo, equipe e validade). Sem essa configuração, recusa tudo. Quem entra: a lista de e-mails do Access (painel) **e** um usuário ativo com esse e-mail em Usuários (o cofre confere). `EMAILS` é uma trava extra opcional.
   - Trocar o e-mail de alguém: Usuários → trocar o e-mail; no painel do Access, pôr o novo e tirar o antigo. Alguém que sai: desativar em Usuários (bloqueia na hora). O modo de teste sem login só vale em `localhost`.
2. **Papéis conferidos no servidor**, pelo e-mail do usuário no sistema (`usuarios[].login` ou `.email`). *Consulta* só lê (dados e anexos). *Operador* grava, mas não mexe em usuários (só troca a própria senha) nem no que a tela só mostra ao administrador (`SO_ADMIN` em `cofre.mjs`: configuração do banco, logo, ordem das caixas, aparência dos alertas, empresas, excluir imóvel/contrato/vistoria/cálculo final/modelo/NF). *Administrador* faz tudo e é o único que substitui os dados. E-mail sem usuário ativo não entra. O login da tela só aceita o usuário desse mesmo e-mail (`entrar` em `app.js`).
3. **Quem gravou de verdade:** o histórico recebe o e-mail do login (`email_nuvem`), e não só o nome que o aparelho informa.
4. **Entradas barradas:** nomes de tabela e campo só com letras, números e `_` (nada de `__proto__` ou SQL); registro de até 1 MB; lote de até 2000 mudanças e 8 MB; códigos inteiros positivos; os campos `senha_ponte` e `ponte_url` são apagados se aparecerem.
5. **Só o próprio site chama:** gravação exige o cabeçalho `X-Sistema` e a origem do site, e não há CORS (outro site não consegue pedir nada).
6. **Anexos:** `.html/.svg/.xml/.js` recusados; abrem na aba só PDF e foto, com `sandbox` (sem scripts) e `nosniff`; caminhos com `..`, barra invertida ou caracteres de controle são recusados.

**Riscos que continuam (e o que reduz):**
- A senha do sistema (hash PBKDF2, 600 mil voltas) do próprio usuário vai para o aparelho dele, porque o login do sistema é conferido no aparelho; as dos outros e os tokens de sessão só vão para aparelhos de administrador (`usuarioParaAparelho` em `cofre.mjs`). Quem passa pelo Access pode tentar quebrar a própria: senhas longas. O Access e os papéis no servidor valem mesmo assim.
- A cópia no aparelho é cifrada (`docs/js/cofrinho.js`): sem a senha do sistema (ou o login lembrado), não se lê nada dos inquilinos; fica aberta só a lista de usuários (senhas embaralhadas, sem os tokens de sessão), para o login funcionar sem internet. Sair apaga a chave do aparelho.

## Como está publicado (2026-11-06)
- Conta Cloudflare do e-mail jckadmb@gmail.com, com verificação em 2 etapas (aplicativo) e alerta de gasto.
- **Worker `erp-boletos`** (nome igual no `wrangler.toml`): Workers Builds ligado ao repositório, raiz `/nuvem`, `npx wrangler deploy` a cada merge na `main` (não precisa `wrangler login`). Rota `erp.ankjck.com.br/api/*`.
- **Variáveis do Worker** (Settings → Variables and secrets, o quadro de cima, não o de Build): `ACCESS_EQUIPE` = `fragrant-haze-f916.cloudflareaccess.com` e `ACCESS_AUD` (do aplicativo "Sistema de Imoveis"), as duas do tipo **Secret** (tipo Text é apagado no próximo deploy). Nunca `MODO_TESTE`.
- **R2** `imoveis-dados`, sem endereço público.
- **Zero Trust** (equipe "Familia", plano Free) → Access → Applications: "Sistema de Imoveis" (`erp.ankjck.com.br` inteiro, política "Familia" com os 4 e-mails, só **One-time PIN**, entrada direta, sessão **1 mês** desde 2026-11-07; a política segue o prazo do aplicativo) e "Cadeado GitHub" (**Bypass** para todos só em `erp.ankjck.com.br/.well-known/acme-challenge`, para o GitHub Pages renovar o certificado; sem ele o cadeado vence em ~3 meses). O provedor "Cloudflare" que vem pronto pede conta do Cloudflare: não usar.
- Página do código (Reusable components → Custom pages → Access login page): nome "ERP - ANKJCK" e frase em português. Não trocar o endereço da equipe (`fragrant-haze-f916`): é o `ACCESS_EQUIPE` do Worker.
- Cabeçalhos (Rules → Transform Rules → "Cabecalhos de seguranca do sistema", só `erp.ankjck.com.br`): `Strict-Transport-Security: max-age=15552000`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` (2026-11-07).
- DNS: `erp` CNAME `juliocpfh.github.io` com nuvem laranja; SSL/TLS **Full (strict)**.
- Usuários: o login de cada um é o próprio e-mail, igual ao "E-mail de acesso" e à lista do Access.
- Conferir: sem login, `curl -I https://erp.ankjck.com.br/api/saude` dá 302 para `…cloudflareaccess.com`; com login, `{"ok":true,"email":…,"teste":false}`.

## Próximos passos
1. ~~Manifest com `crossorigin="use-credentials"`~~ feito (PR #148, `docs/index.html`).
2. ~~Cabeçalhos~~ feito em 2026-11-07 (acima).
3. Testar no celular: instalar o aplicativo, usar sem internet, conflito entre dois aparelhos.
4. ~~Passagem/"Substituir…" com 4 anexos de cada vez~~ feito em 2026-11-07 (`docs/js/migracao.js`).
4b. ~~Cloudflare → Caching → Configuration → **Browser Cache TTL**: "4 hours" → "Respect Existing Headers"~~ feito em 2026-11-07 (vale o que o GitHub manda, 10 min; o `sw.js` já conferia tudo com o site).
5. Depois de uns dias sem problema: aposentar a pasta do OneDrive como reserva (decisão do usuário).
