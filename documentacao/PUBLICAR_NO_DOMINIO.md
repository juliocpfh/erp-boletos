# Publicar o sistema em erp.ankjck.com.br

**Feito em 06/11/2026:** o sistema abre em `https://erp.ankjck.com.br` (nuvem cinza; o endereço antigo `juliocpfh.github.io/erp-boletos` redireciona; `ankjck.com.br` continua com o site do prédio). Este guia mostra como fazê-lo abrir em **`https://erp.ankjck.com.br`**, usando o que já existe: o GitHub Pages (que entrega as telas) e o Cloudflare (onde fica o domínio `ankjck.com.br`).

Nada muda nos dados: eles continuam na pasta do computador/OneDrive. Só muda o endereço que se digita no navegador.

Tempo total: uns 20 minutos de cliques, mais a espera do GitHub emitir o certificado (de alguns minutos a 24 horas).

Faça as etapas na ordem. Cada uma termina com "Como saber se deu certo".

---

## Etapa 1 — No Cloudflare: criar o registro DNS

O registro DNS é o que diz à internet "quando alguém digitar `erp.ankjck.com.br`, mande para o GitHub".

1. Entre em `https://dash.cloudflare.com` com a conta que cuida do `ankjck.com.br`.
2. Clique no domínio **ankjck.com.br**.
3. No menu da esquerda, clique em **DNS** e depois em **Records** (Registros).
4. Clique no botão **Add record** (Adicionar registro).
5. Preencha assim:
   - **Type** (Tipo): `CNAME`
   - **Name** (Nome): `erp` (só isso; o Cloudflare completa com `.ankjck.com.br`)
   - **Target** (Destino): `juliocpfh.github.io` (sem `https://`, sem `/erp-boletos`)
   - **Proxy status** (Status do proxy): clique na nuvem até ela ficar **cinza**, escrito **DNS only**. Explicação abaixo.
   - **TTL**: deixe **Auto**.
6. Clique em **Save** (Salvar).

### Nuvem laranja ou cinza? (Proxy status)

- **Nuvem cinza (DNS only)**: o Cloudflare só responde "o endereço é o GitHub" e sai do caminho. O navegador fala direto com o GitHub.
- **Nuvem laranja (Proxied)**: o Cloudflare fica no meio do caminho, entre o navegador e o GitHub (dá cache, proteção etc.).

**Comece com a nuvem cinza.** Para emitir o certificado de segurança (o cadeado do `https`), o GitHub precisa enxergar que `erp.ankjck.com.br` aponta para ele. Com a nuvem laranja, ele enxerga os endereços do Cloudflare e a verificação falha ("DNS check unsuccessful"). Depois que o certificado estiver emitido (Etapa 2), você pode ligar a nuvem laranja, se quiser, seguindo a Etapa 4.

### Como saber se deu certo

- Na lista de registros aparece a linha `CNAME | erp | juliocpfh.github.io | DNS only`.
- Prova extra (opcional): abra `https://dnschecker.org`, digite `erp.ankjck.com.br`, escolha o tipo **CNAME** e clique em Search. A maioria dos pontos no mapa deve mostrar `juliocpfh.github.io`. Pode levar alguns minutos para aparecer.

---

## Etapa 2 — No GitHub: informar o domínio e ligar o HTTPS

1. Entre em `https://github.com` e abra o repositório **juliocpfh/erp-boletos**.
2. Clique na aba **Settings** (Configurações), no alto da página do repositório.
3. No menu da esquerda, em "Code and automation", clique em **Pages**.
4. Confira a seção **Build and deployment**: deve estar "Deploy from a branch", com a branch principal e a pasta **/docs**. Não mude.
5. Na seção **Custom domain** (Domínio personalizado), digite `erp.ankjck.com.br` e clique em **Save**.
6. O GitHub começa uma **verificação de DNS** (aparece "DNS check in progress"). Espere. Normalmente são alguns minutos; pode chegar a 24 horas se o DNS ainda estiver se espalhando. Atualize a página de vez em quando (F5).
7. Quando aparecer **"DNS check successful"** (com um ✓ verde ao lado do domínio), o GitHub pede o certificado à Let's Encrypt. Isso também leva de minutos a algumas horas. Enquanto isso, a caixa **Enforce HTTPS** fica cinza (desabilitada) com um aviso de "certificate ... pending" ou parecido.
8. Quando a caixa **Enforce HTTPS** ficar clicável, **marque-a**. Isso faz todo acesso por `http://` virar `https://` (com cadeado).

### O arquivo `docs/CNAME`

Ao salvar o domínio no passo 5, o GitHub cria sozinho um commit com um arquivo chamado **`CNAME`** (tudo em maiúsculas, sem extensão) dentro da pasta `docs/`, contendo só uma linha: `erp.ankjck.com.br`.

Se por algum motivo o arquivo não aparecer, ele pode ser criado à mão (pelo site do GitHub: abra a pasta `docs`, **Add file → Create new file**, nome `CNAME`, conteúdo `erp.ankjck.com.br`, **Commit changes**). Cuidados:
- Nome exatamente `CNAME`, maiúsculas, sem `.txt`.
- Só o domínio, sem `https://`, sem barra no fim, uma linha só.
- **Não apague esse arquivo** nos próximos commits: sem ele, o GitHub "esquece" o domínio e o endereço novo para de funcionar.

### O endereço antigo

A partir daí, quem abrir `https://juliocpfh.github.io/erp-boletos/` é **redirecionado automaticamente** para `https://erp.ankjck.com.br/`. Links e favoritos antigos continuam funcionando, mas é bom avisar todo mundo do endereço novo.

### Como saber se deu certo

- Em Settings → Pages: ✓ verde ao lado de `erp.ankjck.com.br`, caixa **Enforce HTTPS** marcada, e no alto a frase "Your site is live at https://erp.ankjck.com.br/".
- No navegador: `https://erp.ankjck.com.br` abre o sistema com o cadeado fechado (sem aviso de "não seguro").
- Digitar `https://juliocpfh.github.io/erp-boletos/` leva ao endereço novo.
- No repositório existe `docs/CNAME`.

---

## Etapa 3 (opcional, recomendada) — Travar o domínio no GitHub (Verified domains)

Isso impede que outra pessoa com conta no GitHub "pegue" o `erp.ankjck.com.br` (ou outro subdomínio do `ankjck.com.br`) para um site dela se um dia o domínio ficar sem uso no GitHub Pages. Custa 5 minutos.

Atenção: isso fica nas configurações **da sua conta** (perfil), não do repositório.

1. No GitHub, clique na sua foto no canto superior direito → **Settings**.
2. No menu da esquerda, em "Code, planning, and automation", clique em **Pages**.
3. Em **Verified domains**, clique em **Add a domain**.
4. Digite `ankjck.com.br` (o domínio inteiro; isso cobre todos os subdomínios, como `erp.` e, no futuro, `banco.`) e clique em **Add domain**.
5. O GitHub mostra um registro **TXT** para criar no DNS: um nome parecido com `_github-pages-challenge-juliocpfh` e um valor (um código). Deixe essa aba aberta.
6. No Cloudflare (DNS → Records → **Add record**):
   - **Type**: `TXT`
   - **Name**: cole o nome que o GitHub mostrou (`_github-pages-challenge-juliocpfh`)
   - **Content**: cole o código que o GitHub mostrou
   - **Save**.
7. Volte ao GitHub e clique em **Verify**. Se disser que ainda não achou, espere uns minutos e tente de novo (pode levar até 24 horas, mas normalmente é rápido).
8. **Não apague** esse registro TXT depois: ele é o que mantém o domínio verificado.

### Como saber se deu certo

- Em Settings (da conta) → Pages → Verified domains, `ankjck.com.br` aparece com a etiqueta **Verified** (verde).

---

## Etapa 4 (opcional) — Ligar a nuvem laranja do Cloudflare

Só depois da Etapa 2 pronta (cadeado funcionando). Não é obrigatório: com a nuvem cinza o sistema funciona perfeitamente. A nuvem laranja dá proteção extra e esconde que o site está no GitHub, mas acrescenta duas coisas para cuidar (modo SSL e cache).

1. No Cloudflare, menu **SSL/TLS** → **Overview** (Visão geral).
2. Em **SSL/TLS encryption mode** (modo de criptografia), clique em **Configure** (ou no modo atual) e escolha **Full** (ou **Full (strict)**, que também funciona com o GitHub). **Nunca "Flexible"** — explicação abaixo. Salve.
3. Menu **DNS** → **Records**, clique em **Edit** na linha `erp` e troque **Proxy status** para a nuvem **laranja (Proxied)**. **Save**.
4. Espere 1 ou 2 minutos e abra `https://erp.ankjck.com.br` de novo.

### Por que "Flexible" dá erro de "too many redirects"

No modo **Flexible**, o navegador fala com o Cloudflare por `https`, mas o Cloudflare fala com o GitHub por `http` (sem segurança). Como marcamos **Enforce HTTPS** no GitHub, o GitHub responde "vá para https", o Cloudflare repassa, o navegador volta por https, o Cloudflare chama o GitHub por http de novo... e isso vira um laço infinito. O navegador desiste com a mensagem **ERR_TOO_MANY_REDIRECTS** ("redirecionou você muitas vezes"). No modo **Full**, o Cloudflare fala com o GitHub por `https`, e o laço não acontece.

### Cache: evitar ver versão velha do sistema

Por padrão o Cloudflare **não** guarda cópia de páginas HTML, só de arquivos como imagens e CSS, então em geral não há problema. Mas, se um dia o sistema for atualizado e algum computador continuar mostrando a versão antiga mesmo depois de Ctrl+F5:

- **Limpar o cache**: Cloudflare → **Caching** → **Configuration** → **Purge Everything** (Limpar tudo) → confirmar. Em 30 segundos todos recebem a versão nova.
- **Para não acontecer de novo**: Cloudflare → **Caching** → **Cache Rules** → **Create rule**. Nome: `nao guardar o sistema`. Em "When incoming requests match", escolha **Hostname** / **equals** / `erp.ankjck.com.br`. Em "Cache eligibility", escolha **Bypass cache**. **Deploy**. Com isso o Cloudflare só repassa; quem guarda cópia é o navegador, como hoje.

### Como saber se deu certo

- `https://erp.ankjck.com.br` abre com cadeado, sem erro de redirecionamento.
- No cadeado do navegador → "A conexão é segura" → "Certificado": o emissor agora é do Cloudflare (ex.: "Google Trust Services" ou "Let's Encrypt" via Cloudflare) em vez de o do GitHub. Isso é normal.
- Em SSL/TLS → Overview aparece **Full** ou **Full (strict)**.

---

## O que muda para quem usa o sistema

- **Nos dados: nada.** O arquivo `imoveis-dados.json`, os backups e os anexos continuam na mesma pasta do computador/OneDrive. O site só entrega as telas.
- **Pasta lembrada e login são por endereço.** O navegador guarda "qual pasta" e "quem está logado" separadamente para cada endereço de site. Então, **na primeira vez que cada computador abrir `erp.ankjck.com.br`**, o sistema vai pedir para **Escolher a pasta dos dados** de novo (escolha a mesma pasta de sempre e autorize) e para **entrar** de novo (mesmo usuário e senha). Depois disso fica lembrado como antes. Não é preciso criar usuário de novo nem importar nada.
- **Versão sem internet** (`Administração de Imóveis.html`, de Dados e backup): continua igual. Ela não depende do endereço. Vale baixar de novo quando houver melhorias, como sempre.
- **Avise as pessoas** do endereço novo e peça para atualizarem o favorito. O antigo redireciona, mas é melhor acostumar com o novo.

---

## Problemas comuns

| O que aparece | Causa provável | O que fazer |
|---|---|---|
| GitHub: **"DNS check unsuccessful"** ou "InvalidDNSError" | O registro ainda não se espalhou, ou a nuvem está **laranja** (o GitHub vê o Cloudflare em vez de si mesmo), ou o Target está errado (ex.: `juliocpfh.github.io/erp-boletos`). | Confira na Etapa 1: CNAME `erp` → `juliocpfh.github.io`, nuvem **cinza**. Espere até 24 h. Se continuar, em Settings → Pages apague o domínio (**Remove**), espere 1 minuto e cadastre de novo para a verificação recomeçar. |
| GitHub: **Enforce HTTPS** cinza, "certificate request pending / unavailable" | O certificado ainda está sendo emitido. | Esperar (até algumas horas). Se passar de 24 h: conferir que não existem **outros** registros chamados `erp` no DNS (só pode haver um) e que a nuvem está cinza; depois remover e cadastrar o domínio de novo. |
| Navegador: **ERR_TOO_MANY_REDIRECTS** / "redirecionou você muitas vezes" | Nuvem laranja com SSL/TLS em **Flexible** (ou **Off**). | Cloudflare → SSL/TLS → Overview → mudar para **Full**. Ou voltar a nuvem para cinza. |
| Navegador: "Sua conexão não é particular" / certificado inválido | Nuvem laranja ligada **antes** de o GitHub emitir o certificado, ou nuvem cinza com certificado ainda pendente. | Voltar a nuvem para cinza e esperar a Etapa 2 terminar; depois ligar a laranja. |
| Sistema abre, mas mostra a versão **antiga** depois de uma atualização | Cache do navegador ou do Cloudflare. | Primeiro Ctrl+F5. Se persistir e a nuvem for laranja: Caching → Configuration → **Purge Everything**; e crie a regra "Bypass cache" da Etapa 4. |
| Página **404** do GitHub no endereço novo | Falta o arquivo `docs/CNAME` ou ele foi apagado por um commit. | Conferir que `docs/CNAME` existe com `erp.ankjck.com.br`; se não, criar (Etapa 2). |
| O sistema pede para escolher a pasta e logar de novo | Normal na primeira vez no endereço novo (ver "O que muda"). | Escolher a mesma pasta e entrar. Acontece uma vez por computador/navegador. |
| Endereço antigo não redireciona | Pode levar uns minutos após salvar o domínio; ou o navegador guardou a página antiga. | Esperar e dar Ctrl+F5. |

---

## Para o futuro: a ponte do C6 em outro subdomínio

A integração com o banco C6 usa uma "ponte" (programa em Node, pasta `ponte-c6/`) que roda num computador ou servidor da empresa com o certificado do banco. O sistema, aberto em `https://erp.ankjck.com.br`, precisa chamar essa ponte pela internet. A forma mais simples e segura de expor a ponte é um **Cloudflare Tunnel** (programa `cloudflared`), em um subdomínio como **`banco.ankjck.com.br`**:

- Não precisa abrir porta no roteador nem mexer no modem.
- Funciona mesmo com **CGNAT** da operadora (quando a casa não tem IP público "de verdade"), porque é o computador que liga para o Cloudflare, e não o contrário.
- O `https` já vem pronto do Cloudflare; a ponte pode rodar só em `http://localhost` dentro do computador.
- É gratuito no plano Free.

### Passos resumidos (fazer só quando a ponte existir)

1. No Cloudflare, abra o painel **Zero Trust** (menu da esquerda, `Zero Trust`; abre em `one.dash.cloudflare.com`). Na primeira vez pede um nome para a "equipe" e a escolha do plano **Free**.
2. Menu **Networks** → **Tunnels** (em painéis mais novos: **Networking → Tunnels**) → **Create a tunnel** → escolha **Cloudflared** → nome `ponte-c6` → **Save tunnel**.
3. A tela mostra o comando de instalação do `cloudflared` para cada sistema (Windows, Linux, Mac). Copie o do computador da ponte e rode lá (no Windows: PowerShell como administrador). Ele instala o `cloudflared` como serviço, que inicia junto com o computador.
4. Quando a tela mostrar o conector como **Connected**, clique em **Next**.
5. Em **Public Hostname** (ou **Routes → Add route → Published application**): Subdomain `banco`, Domain `ankjck.com.br`, Service **HTTP**, URL `localhost:PORTA` (a porta em que a ponte escuta; veja `LIGAR_C6.md`). **Save**. O Cloudflare cria o registro DNS `banco` sozinho (nuvem laranja; para Tunnel isso é obrigatório e correto).
6. Abra `https://banco.ankjck.com.br/saude` no navegador: deve responder a mensagem de saúde da ponte.
7. **Proteção extra (recomendada)**: ainda no Zero Trust, **Access → Applications → Add an application → Self-hosted**, com o domínio `banco.ankjck.com.br`, e uma política que só permite os e-mails da empresa. Assim só quem passar pelo login do Cloudflare chega à ponte. Atenção: a ponte também tem a própria senha; use as duas.

### CORS: a ponte precisa aceitar o endereço do sistema

O navegador só deixa uma página de um endereço (`https://erp.ankjck.com.br`) chamar um servidor de outro endereço (`https://banco.ankjck.com.br`) se o servidor disser que permite. Isso se chama **CORS**. Na configuração da ponte (arquivo `.env`, variável de origens permitidas), a origem **`https://erp.ankjck.com.br`** precisa estar na lista (sem barra no final). Enquanto o endereço antigo ainda for usado, inclua também `https://juliocpfh.github.io`. Se faltar, o sistema mostra erro de conexão com a ponte mesmo com tudo ligado, e o console do navegador (F12) mostra "blocked by CORS policy".

### Como saber se deu certo

- `https://banco.ankjck.com.br/saude` responde no navegador, de qualquer lugar (inclusive do celular fora da rede de casa).
- No sistema (Dados e backup → caixa do banco C6), **Testar conexão** com a URL `https://banco.ankjck.com.br` dá "ok".
- No Zero Trust → Networks → Tunnels, o túnel `ponte-c6` aparece como **Healthy**.

---

## Fontes (páginas oficiais)

GitHub Pages:
- Managing a custom domain for your GitHub Pages site — https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- Securing your GitHub Pages site with HTTPS — https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https
- Verifying your custom domain for GitHub Pages — https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages
- Troubleshooting custom domains and GitHub Pages — https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages
- About custom domains and GitHub Pages — https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages

Cloudflare:
- Proxy status (nuvem laranja/cinza) — https://developers.cloudflare.com/dns/proxy-status/
- Encryption modes (Flexible, Full, Full (strict)) — https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
- ERR_TOO_MANY_REDIRECTS — https://developers.cloudflare.com/ssl/troubleshooting/too-many-redirects/
- Default cache behavior (HTML não é guardado por padrão) — https://developers.cloudflare.com/cache/concepts/default-cache-behavior/
- Purge everything — https://developers.cloudflare.com/cache/how-to/purge-cache/purge-everything/
- Cache Rules — https://developers.cloudflare.com/cache/how-to/cache-rules/
- Set up Cloudflare Tunnel — https://developers.cloudflare.com/tunnel/setup/
- Publish a self-hosted application (Tunnel + Access) — https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/

Observação: os nomes dos menus foram conferidos em novembro de 2026; o Cloudflare renomeia telas com alguma frequência (ex.: "Networks → Tunnels" virando "Networking → Tunnels", e "Public Hostname" virando "Published application route"). Se um nome não bater, procure o mais parecido ou use a busca do painel.
