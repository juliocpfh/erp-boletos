# Dados na nuvem (Cloudflare) — etapa 1 de 5

Programinha (Worker) que roda no Cloudflare e guarda o `imoveis-dados.json` e os anexos no R2, no lugar da pasta do OneDrive. Estudo e etapas: `documentacao/ESTUDO_DADOS_NUVEM.md`.

**Situação:** etapa 1 pronta (o Worker e os testes, `tests/nuvem.test.mjs`, com um R2 de mentira). **Ainda não está publicado** e o site ainda não o usa (etapa 2). Os dados de verdade continuam na pasta.

## O que ele faz (todas as rotas em `https://erp.ankjck.com.br/api/`)
| Rota | Para |
|---|---|
| `GET saude` | Confere login e configuração |
| `GET banco` / `PUT banco` | Lê o banco (com `ETag`) / grava só se ninguém gravou antes (`If-Match`; a 1ª vez `If-None-Match: *`). Conflito = 412 com o ETag atual: o site recarrega e refaz |
| `GET/PUT/DELETE arquivos/<caminho>` | Anexos (mesmas pastas de hoje). `.html/.svg/.xml/.js` recusados; abre na aba só PDF e foto, o resto baixa; `If-None-Match: *` não sobrescreve |
| `GET lista/<pasta>/` | Subpastas e arquivos (nome e tamanho) |
| `POST mover` `{de, para, juntar}` | Renomear, mover ou juntar pastas (como `renomearPasta`/`moverPasta`/`juntarPasta`) |
| `GET backups/…`, `modelos/…` | Backups (um por dia, horário de Brasília, 30 guardados; só o Worker grava) e o modelo da NF |

**Segurança:** cada pedido confere o login do Cloudflare Access (assinatura, aplicativo, validade) e o e-mail na lista `EMAILS`; sem essa configuração, recusa tudo. Gravação exige o cabeçalho `X-Sistema: imoveis` e a origem `https://erp.ankjck.com.br`. Não fala com o C6.

**Limite do plano grátis:** 10 ms de processamento por pedido. Por isso o Worker não lê o banco inteiro ao gravar: confere só o começo (`"formato": "imoveis-v1"`) e o fim do arquivo.

## Publicar (etapa 4, junto com o login; não fazer antes)
1. Cloudflare → **R2** → ativar (pede cartão; o grátis cobre 10 GB) → **Create bucket** `imoveis-dados`. Em **Billing**, criar alerta de gasto.
2. **Zero Trust** → criar a equipe (ex.: `ankjck`) → **Access → Applications → Add → Self-hosted**, domínio `erp.ankjck.com.br` (o site inteiro), política *Allow* com os 4 e-mails, login por código no e-mail. Copiar o **AUD** do aplicativo.
3. DNS: o `erp` precisa da **nuvem laranja** para o Worker atender `/api/` (SSL/TLS em **Full**; ver `PUBLICAR_NO_DOMINIO.md`, etapa 4).
4. Na pasta `nuvem/`: `npx wrangler login` e `npx wrangler deploy`.
5. Workers → `imoveis-dados` → **Settings → Variables**: `ACCESS_EQUIPE` (ex.: `ankjck.cloudflareaccess.com`), `ACCESS_AUD`, `EMAILS` (separados por vírgula).
6. Conferir: `https://erp.ankjck.com.br/api/saude` pede o código no e-mail e depois mostra `{"ok":true,"email":…}`.
