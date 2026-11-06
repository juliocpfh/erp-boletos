# Estudo: guardar os dados na nuvem (2026-11-06)

**Por quê:** no celular, o navegador só deixa escolher pasta de aplicativos que aceitam "pasta inteira" (Google Drive aceita, o OneDrive não). Com os dados na nuvem, o sistema abre em qualquer aparelho só com login, sem escolher pasta, e duas pessoas podem lançar ao mesmo tempo sem uma apagar a outra.

**Tamanho de hoje** (pasta `OneDrive/Documentos/holding/Automação`): `imoveis-dados.json` 2,2 MB · `arquivos/` (anexos) 258 MB · `backups/` 26 MB. Uso: poucas pessoas, algumas centenas de gravações por dia no máximo.

**Restrição do C6:** a ponte (`ponte-c6/`) continua no computador, com o certificado. O estudo de 2026-10-16 (`DECISOES.md`) mostrou que ela **não pode** rodar no Cloudflare Workers: o C6 também está atrás do Cloudflare e a conexão com certificado (mTLS) dá erro 520. Guardar **os dados** no Cloudflare não tem esse problema, porque os dados não falam com o C6. Quem fala com o C6 é só a ponte. Para usar o banco pelo celular, a ponte precisa do Cloudflare Tunnel (`banco.ankjck.com.br`, já previsto em `LIGAR_C6.md`).

## Comparação

| | Cloudflare (R2 + Worker + Access) | Supabase | Firebase (Google) | OneDrive via Microsoft Graph |
|---|---|---|---|---|
| Grátis cabe? | Sim, com folga: 10 GB de arquivos, 1 milhão de gravações/mês, 100 mil acessos/dia | Banco 500 MB, **arquivos só 1 GB** (anexos já 258 MB e crescendo) | Arquivos exigem o plano pago (Blaze, com cartão) desde fev/2026; documento até 1 MB (o JSON tem 2,2 MB) | Sim (o espaço do seu OneDrive) |
| Pausa sozinho? | Não | **Sim**, após 7 dias com pouco uso (religar à mão) | Não | Não |
| Conflito com o C6 | Nenhum (a ponte fica no computador). Mesma conta do domínio e do Tunnel | Nenhum | Nenhum | Nenhum |
| Duas pessoas ao mesmo tempo | Sim (gravação "só se ninguém mudou antes", `etag`) | Sim | Sim | Sim pelo celular. Mas o computador continua gravando pela sincronização do OneDrive, que pode criar "cópia em conflito" |
| Login de verdade (no servidor) | Sim: Cloudflare Access (grátis até 50 pessoas, código por e-mail) | Sim | Sim | Conta Microsoft de cada usuário, com a pasta compartilhada |
| Trabalho para adaptar | Médio: troca a camada de gravação + um programinha no Cloudflare (Worker) | Grande: banco em tabelas | Grande: dividir o JSON | Médio, mas com risco: o acesso a pasta **compartilhada** de conta pessoal pela API é limitado e já mudou |
| Precisa de cartão? | O R2 pede cartão cadastrado para ativar; só cobra acima do grátis (pôr alerta de gasto) | Não | Sim (Blaze) | Não (registro de aplicativo no Microsoft Entra, grátis) |

## Recomendação: Cloudflare

- **Dados**: o `imoveis-dados.json` vira um arquivo no **R2** (o "HD" do Cloudflare), e os anexos ficam lá também, com os mesmos nomes de pasta de hoje (imóvel / Inquilinos / …).
- **Worker** (programinha pequeno no Cloudflare): lê e grava o arquivo, só aceita gravar se ninguém mudou antes (senão o sistema recarrega e refaz) e guarda um backup por dia (30 dias).
- **Cloudflare Access** na frente de `erp.ankjck.com.br` (site e `/api` juntos): só e-mails autorizados entram (código no e-mail). A senha do sistema continua valendo por cima.
- **Cópia no computador**: botão em Dados e backup + aviso semanal para baixar o ZIP para o OneDrive (o dono continua com uma cópia própria).
- **O que fica igual**: as telas, as regras, a ponte do C6 e a versão sem internet (esta continua usando a pasta, como hoje).

### Etapas (cada uma testável sozinha)
1. Worker + R2 em modo de teste (`?teste` continua sem internet).
2. Nova forma de gravação em `armazenamento.js` ("nuvem", ao lado de "pasta"). `E.pasta` aparece em cerca de 50 pontos de 7 arquivos: concentrar tudo no módulo.
3. Passagem dos dados: botão que envia a pasta atual (JSON + anexos) para a nuvem, conferindo arquivo por arquivo.
4. Access + CSP (`connect-src` já cobre `*.ankjck.com.br`) + revisão de segurança (`SEGURANCA.md`).
5. Uns dias com os dois funcionando (a pasta fica como reserva), depois desligar.

### Cuidados
- Os dados (CPF, contratos) passam a ficar nos servidores do Cloudflare, e não só no OneDrive. A segurança passa a depender da conta Cloudflare: **2FA obrigatório**.
- Os limites grátis são diários ou mensais. Se passar, a gravação falha (não cobra) até zerar, menos o R2, que cobra centavos acima de 10 GB. Pôr alerta de gasto.

## Decisões do usuário (2026-11-06)
- Aceita cadastrar cartão no Cloudflare para o R2 (com alerta de gasto).
- Entram 4 pessoas: o usuário e os outros 3 proprietários da empresa (os e-mails vão só no painel do Cloudflare, nunca no repositório).
- Etapa 1 feita: `nuvem/worker.mjs` + `tests/nuvem.test.mjs` (detalhes em `nuvem/README.md`). Ainda não publicado.

## Achados na etapa 1
- O Worker fica no **mesmo endereço** do site (`erp.ankjck.com.br/api/*`): sem CORS, e o Access protege o site e os dados juntos. Exige a nuvem **laranja** no `erp` (SSL/TLS Full).
- Ler o JSON inteiro (2,2 MB) gasta ~9 ms, perto do limite grátis de 10 ms por pedido: o Worker confere só o começo e o fim. Se o arquivo crescer muito, a saída é o plano pago do Workers (US$ 5/mês) ou dividir o banco.

Fontes: preços oficiais do [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) e do [R2](https://developers.cloudflare.com/r2/pricing/); [pausa do Supabase](https://supabase.com/docs/guides/platform/free-project-pausing.md); [mudança do Firebase Storage](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024?hl=es); [Cloudflare Zero Trust, plano grátis](https://www.cloudflare.com/plans/sase-zero-trust.md); [Graph: envio com If-Match](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession).

## Caminho do meio (decidido em 2026-11-06; substitui "arquivo inteiro")
Envia só o que mudou, funciona sem internet (fila de envio) e vira aplicativo instalável. Regras em `DECISOES.md` (2026-11-06): NF só com internet; campo disputado espera a escolha.

| Etapa | Situação |
|---|---|
| 1. Worker: login (Access), anexos, backups | ✅ `nuvem/worker.mjs` |
| 2. Cofre: filas, conflitos, faixas de códigos, contador da NF, papéis | ✅ `nuvem/cofre.mjs`, conferido com os dados reais (sai igual ao que entra) |
| 3a. Site: cópia local, fila de envio, antes/depois a cada gravação, faixas de códigos, NF só com internet, tela de conflitos (`#/conflitos`), e-mail de acesso no usuário | ✅ `docs/js/nuvem.js` (`Sincronia`), `telas/nuvem.js`; testado no navegador com `node nuvem/local.mjs` |
| 3b. Anexos pela nuvem: pasta "virtual" com a mesma interface da pasta (`docs/js/pasta-nuvem.js`, `E.pasta` no modo nuvem), o resto do código não muda; anexo novo sem internet fica no aparelho e sobe depois (mesmo nome enviado por outro aparelho: sobe como "(deste aparelho)" e avisa); abrir, apagar e mover pedem internet | ✅ testado no navegador e em `tests/pasta-nuvem.test.mjs` |
| 3c. Cópia do aparelho cifrada (`docs/js/cofrinho.js`: AES-GCM, chave aberta só com a senha via PBKDF2; aberta durante o login lembrado; Sair apaga a chave e, sem nada pendente, a cópia; aberta só a lista de usuários para o login sem internet; outro usuário não entra trocando a chave se houver mudança não enviada) · trava entre abas (Web Locks, lote com código da aba) · Desfazer só do que já foi enviado · aplicativo instalável (`docs/manifest.webmanifest`, `docs/sw.js`, ícones de `tools/gerar-icones.mjs`) | ✅ testado no navegador, menos o instalável (o navegador embutido do Claude não registra service worker): conferir no celular/Chrome ao publicar |
| 4. Passagem dos dados atuais (carga inicial e conferência) | a fazer |
| 5. Publicar com o Access (4 e-mails), uns dias com a pasta de reserva | a fazer (passos em `nuvem/README.md`) |

Achados da etapa 2: o servidor passa a conferir os papéis (consulta, operador, admin) pelo e-mail do login, o que hoje a pasta não consegue. Na etapa 3, cada usuário precisa ter o e-mail do Access no cadastro (`login` ou campo `email`). Quem gera códigos fora de `inserir` (ex.: `fiadores`, `avulsas` em `regras.js`) também precisa usar a faixa.

### Como testar no computador (etapa 3a)
`node nuvem/local.mjs` → `http://localhost:8787` (site + /api com o cofre num SQLite em `nuvem/.local/`; sem login do Access; `EMAIL_TESTE` = e-mail do usuário de teste). `http://localhost:8787/__internet?ligar=0` simula a queda da internet (e `=1` volta). Na 1ª vez, crie o administrador com o login igual ao `EMAIL_TESTE`.
