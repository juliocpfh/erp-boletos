# Segurança do sistema: o que é seguro, o que não é e como blindar

*Escrito em novembro de 2026 para o dono (ANK e JCK). Linguagem simples, mas os termos técnicos entre parênteses são os certos para passar aos desenvolvedores e ao suporte do banco. Os fatos sobre Cloudflare, GitHub, Tailscale, OneDrive e C6 foram conferidos em fontes públicas (lista no fim); preços e limites mudam, então confira na hora de contratar.*

---

## 1. Resposta direta

1. **O site (`erp.ankjck.com.br`, GitHub Pages atrás do Cloudflare) não guarda nenhum dado seu.** Ele só entrega as "telas" (HTML, JavaScript, CSS). O Cloudflare e o GitHub nunca veem inquilinos, valores, boletos ou extratos: isso tudo fica no `imoveis-dados.json` da pasta que você escolheu, no seu computador/OneDrive.
2. **Cloudflare e GitHub são seguros para o que fazem aqui** (entregar o site). Grandes empresas e bancos usam os dois. O risco deles não é "vazar seus dados", porque não os têm; é alguém **tomar a sua conta** lá e trocar o código do site por um código que rouba dados: por isso a conta precisa de 2FA e proteção de branch (checklist, seção 4).
3. **O risco real está em quatro lugares, nesta ordem:** (a) a **ponte** com as chaves do C6 (certificado + client_id/secret): quem as tem emite boletos, lê extrato e prepara pagamentos em nome da empresa; (b) a **pasta de dados**: quem tem a pasta tem tudo, inclusive pode editar o JSON e criar um usuário administrador (a senha do sistema protege de colega curioso, não de quem já tem o arquivo); (c) a **conta do GitHub** (e a do Cloudflare): quem a toma troca o código; (d) os **computadores dos usuários**: um vírus "ladrão de informações" (infostealer) lê a pasta, o navegador e as senhas salvas, e isso é hoje o ataque mais comum no Brasil.
4. **Expor a ponte na internet com só uma senha (`banco.ankjck.com.br` aberto) NÃO é seguro**, e a senha ainda ficaria gravada no JSON compartilhado. **Deixar a ponte só no seu computador (localhost)** ou **atrás de uma rede privada** (Cloudflare Access ou Tailscale) é seguro o bastante para uma empresa pequena.
5. **Recomendação:** comece com a **Arquitetura A** (ponte no seu próprio computador, dados na pasta local/OneDrive, site só para as telas). Se depois precisar que outro computador emita boletos, vá para a **B** (rede privada), nunca para a **C** (pública com senha).
6. Nada é "100% seguro". O que dá para prometer: com o checklist feito, um atacante precisa **invadir um computador seu** ou **enganar uma pessoa** para causar dano, e mesmo assim **não consegue pagar nada sozinho** (o C6 exige aprovação no app). O resto depende de rotina: atualizações, 2FA, backup testado e desconfiança de links.

---

## 2. Modelo de ameaças

Probabilidade e impacto numa escala simples (baixa / média / alta) para uma empresa de 2 a 4 usuários no Brasil, em 2026.

| Ativo (o que protegemos) | Ameaça (o que pode acontecer) | Prob. | Impacto | Controle (o que impede ou reduz) |
|---|---|---|---|---|
| Chaves do C6 na ponte (certificado mTLS, client_id/secret, `.env`) | Cópia por malware no computador da ponte; cópia por quem tem acesso físico; vazamento no Git | Média | **Alto**: emitir boletos falsos em nome da empresa, ler extratos, montar lotes de pagamento (que ainda dependem de aprovação no app) | Ponte em computador dedicado ou no do dono, sem uso diário na internet; arquivos com permissão só para o usuário da ponte; `.gitignore`; backup cifrado fora do PC; **revogar a chave no Web Banking** em caso de suspeita (leva minutos) |
| Pasta de dados (`imoveis-dados.json`, `arquivos/` com RG, CPF, contratos, apólices) | Infostealer/ransomware no PC de um usuário; OneDrive da pessoa invadido (senha fraca, sem 2FA); ex-funcionário que ainda tem a pasta sincronizada | **Alta** | **Alto**: vazamento de dados pessoais de inquilinos (LGPD), chantagem, perda dos dados | 2FA na conta Microsoft; Defender com "Acesso controlado a pastas"; BitLocker; sem admin no dia a dia; remover a pessoa do compartilhamento ao sair; backup seguro cifrado (já existe) e Histórico de versões/Files Restore do OneDrive |
| Conta do GitHub | Phishing, senha vazada, token roubado → troca do código do site por um que envia dados a terceiros | Baixa (com 2FA) / Média (sem) | **Alto**: todos os usuários passam a rodar código do atacante | 2FA com app + chave física; branch `main` protegida (só por PR, sem force push); domínio verificado no GitHub; revisar o PR antes de aceitar; CSP no `index.html` limita o estrago |
| Conta do Cloudflare (DNS do `ankjck.com.br`) | Conta tomada → DNS apontado para site falso | Baixa | **Alto**: site falso idêntico | 2FA; DNSSEC; HSTS; e-mail de recuperação protegido |
| Computadores dos usuários (Windows, Chrome/Edge) | Infostealer (VENON, TCLBanker, Astaroth... ativos no Brasil em 2026), extensão maliciosa, "suporte" falso por telefone | **Alta** | **Alto**: lê a pasta, as senhas salvas, a sessão do sistema (12 h) e o Web Banking aberto | Windows atualizado, Defender ligado, usuário comum (não administrador), gerenciador de senhas, bloqueio de extensões desconhecidas, treino contra phishing |
| Web Banking/app do C6 do dono (aprovação de pagamentos) | Troca de SIM, celular roubado destravado, golpe por telefone | Baixa | **Muito alto**: é o único ponto que paga de fato | Biometria e senha longa no celular; alertas do C6; limites de valor; segundo aprovador (se o C6 permitir); nunca aprovar lote que não preparou |
| Ponte exposta na internet (Arquitetura C) | Varredura automática da internet acha a porta em horas; força bruta ou falha no Node | Alta (se exposta) | Alto | **Não expor.** Access/Tailscale ou só localhost |
| Backups (pasta `backups/`, backup seguro, pen drive) | Ransomware cifra também os backups da mesma pasta; pen drive perdido | Média | Alto | Backup seguro em **outra** conta/local; cópia cifrada (já é); teste de restauração trimestral |
| Sessão do sistema no navegador (token em `localStorage`, 12 h) | PC deixado destravado; malware lê o `localStorage` | Média | Médio (o dano real é na pasta, não no token) | Bloqueio automático de tela; sessão mais curta para administrador (seção 5) |
| Disponibilidade (Cloudflare/GitHub/internet fora do ar) | Queda do provedor (Cloudflare caiu em 18/11/2025 por ~3 h; incidente de Tunnel de ~6 h em 05/2026) | Média | Baixo | Versão sem internet (arquivo único) já existe; a ponte local continua funcionando |

---

## 3. Três arquiteturas, da mais fechada à mais aberta

Em todas, o site (`erp.ankjck.com.br` no GitHub Pages + Cloudflare) só entrega as telas e os dados ficam na pasta local/OneDrive. O que muda é **onde a ponte roda e quem consegue chegar nela**.

### A) Tudo local: ponte no próprio computador (localhost) — **recomendada para começar**

```
Chrome em erp.ankjck.com.br ──► http://127.0.0.1:PORTA (ponte, mesmo PC) ──► C6 (mTLS)
Dados: pasta local/OneDrive                     Chaves: só neste PC
```

- A ponte escuta só em `127.0.0.1` (ninguém de fora do computador chega nela, nem da rede de casa). O Chrome deixa uma página `https` chamar `http://localhost`/`127.0.0.1` sem bloqueio de "conteúdo misto", porque trata o próprio computador como seguro.
- **Quem emite boletos / lê extrato é quem está nesse computador.** Os outros usuários veem o resultado pelo JSON compartilhado (OneDrive), mas não emitem. Se duas pessoas precisarem emitir, ou se instala a ponte (e as chaves) em dois PCs, o que **dobra** os lugares em que a chave pode vazar, ou se passa para a B.
- **O que um atacante precisaria:** invadir **esse computador** (malware ou acesso físico). Nada pela internet alcança a ponte.
- **Se o computador for infectado:** considere as chaves roubadas → em 1 hora: revogar a chave no Web Banking do C6 (Integrações via API → excluir), trocar a senha do Web Banking e da conta Microsoft, formatar o PC, restaurar a pasta de dados do OneDrive (Histórico de versões/Files Restore) ou do backup seguro, gerar chave nova no C6.
- **Custo e trabalho:** R$ 0. Instalar Node + ponte uma vez; deixar a ponte iniciando com o Windows. Nada de Cloudflare Tunnel, Access ou roteador.
- **Fragilidade:** o computador tem de estar ligado para emitir; e é um computador de uso diário (e-mail, WhatsApp Web...), o que aumenta a chance de malware. Mitigação: uma conta Windows separada só para a ponte, com as credenciais acessíveis só a ela; se a ponte sair do seu PC para um mini PC/Raspberry, já é a Arquitetura B.

### B) Ponte num servidor de casa, acessível só por rede privada

```
PC do usuário (Chrome) ──► rede privada ──► ponte no mini PC/Raspberry (casa, Vivo fibra) ──► C6
  Tailscale no PC                 OU                Cloudflare Tunnel + Access (login + dispositivo)
```

Duas formas, as duas **sem abrir porta no roteador** (o Deco BE65 fica fechado; CGNAT da Vivo não atrapalha porque a conexão sai de dentro para fora):

**B1 — Cloudflare Tunnel + Cloudflare Access.** O `cloudflared` roda no servidor de casa e abre uma conexão de saída para a Cloudflare; `banco.ankjck.com.br` só existe dentro da Cloudflare. Na frente, o **Access** exige login (e-mail da empresa com código, ou Google/Microsoft) e pode exigir **dispositivo autorizado** (cliente WARP instalado no PC com verificação de postura). Sem passar pelo Access ninguém chega à ponte, nem para tentar senha. Plano **Zero Trust Free: até 50 usuários, sem custo, uso comercial permitido**. Pontos honestos: (1) a Cloudflare **termina o TLS** na borda: o tráfego da ponte (pedidos e respostas: nome do inquilino, valor, linha digitável, extrato) passa decifrado pelos servidores dela por um instante e é cifrado de novo até o `cloudflared`. As chaves do C6 **não** passam por ali (ficam no servidor). (2) O plano gratuito guarda pouco log (horas, não meses). (3) A ponte deve **validar o token do Access** (`Cf-Access-Jwt-Assertion`) ou usar a opção "Protect with Access" do `cloudflared`, para que um erro de configuração não a deixe aberta.

**B2 — Tailscale (ou similar, p. ex. WireGuard do próprio roteador).** Cada PC e o servidor entram numa rede privada cifrada ponta a ponta (ninguém no meio vê nada, nem a Tailscale). A ponte escuta só no IP da Tailscale (`100.x.y.z`) e, para a página `https` conseguir chamá-la, usa-se `tailscale serve` (que dá um endereço `https://ponte.<rede>.ts.net`). O plano gratuito (Personal, 6 usuários) é **só para uso não comercial**; para a empresa, o plano Standard custa cerca de US$ 8 por usuário/mês. Vantagem: nada da empresa passa por terceiros. Desvantagem: mais um programa para instalar em cada PC e pagar.

- **O que um atacante precisaria:** invadir um PC de usuário **que esteja dentro da rede privada** (e aí usaria a sessão desse usuário, como se fosse ele), ou invadir o servidor de casa, ou tomar a conta Cloudflare/Tailscale (2FA!). Pela internet aberta, não há porta para atacar.
- **Se um PC for infectado:** remover esse dispositivo no painel (Access/Tailscale) e bloquear o usuário no sistema → o PC perde o acesso à ponte na hora, sem precisar trocar as chaves do C6 (a menos que o PC infectado fosse o servidor). Trocar as senhas do usuário. Restaurar a pasta de dados se mexeram nela.
- **Custo e trabalho:** mini PC usado/novo ~R$ 1.500 a 3.000 ou Raspberry Pi 5 ~R$ 700 a 1.000 (valores aproximados), ligado 24 h (consome pouco). Cloudflare: R$ 0. Tailscale: ~US$ 8/usuário/mês. Trabalho: meio dia para montar, uma hora por semestre para atualizar o sistema operacional e o Node.
- **Veredito:** ótima opção quando mais de uma pessoa precisa emitir boletos ou quando se quer tirar a ponte do computador de uso diário. **B1 (Cloudflare Access) é a escolha prática** para esta empresa: grátis, sem programa pago, e a parte que a Cloudflare "vê" não inclui as chaves do banco. Se a ideia de a Cloudflare ver o tráfego da ponte incomodar, B2.

### C) Ponte pública em `banco.ankjck.com.br` só com senha — **NÃO recomendada**

- Qualquer computador do mundo alcança a ponte. Robôs varrem a internet inteira em horas e vão achar o endereço (ele aparece em listas públicas de certificados TLS). A única barreira passa a ser **uma senha** e **o código da ponte sem nenhum erro**: um bug no Node, numa biblioteca ou na nossa própria lógica vira porta de entrada para as chaves do banco.
- Pior: pelo desenho atual, a **senha da ponte fica gravada no `imoveis-dados.json`** (`config_banco.senha_ponte`), que está na pasta compartilhada no OneDrive de todos os usuários. Ou seja, quem roubar a pasta de **qualquer** usuário ganha também a chave da porta pública. Uma senha que mora num arquivo compartilhado não protege nada que esteja na internet.
- Não há como "revogar" um computador; só trocando a senha para todos.
- **O que um atacante precisaria:** só a senha (ou um bug). **Se um PC for infectado:** trocar a senha da ponte imediatamente e torcer para o atacante não ter usado antes; revisar logs (que no desenho atual são poucos).
- **Custo:** R$ 0, e justamente por ser "fácil" é tentadora. **Não faça.** Se um dia precisar de acesso de fora de casa, use a B.

---

## 4. Checklist de blindagem (em ordem de prioridade)

Marque o que já foi feito. Os itens 1 a 12 são os que mais reduzem risco; faça-os antes de ligar a ponte em produção.

**Contas que mandam no site**
1. **GitHub: 2FA** com aplicativo (TOTP) **e** chave física/passkey como segunda forma (o GitHub recomenda TOTP como principal e chave/passkey como reserva; SMS não). Guardar os códigos de recuperação impressos no cofre. O GitHub já exige 2FA de quem contribui código.
2. **GitHub: proteger a branch `main`** (Settings → Rules/Branch protection): exigir Pull Request, proibir force push e exclusão. Em repositório público do plano Free isso é grátis (o repositório `erp-boletos` é público, porque o GitHub Pages dele é). Só aceitar PR depois de ler o resumo das mudanças.
3. **GitHub: verificar o domínio `ankjck.com.br`** no perfil (Settings → Pages → Verified domains, registro TXT `_github-pages-challenge-`): impede outra pessoa de "sequestrar" o subdomínio para um Pages dela. Não criar DNS "curinga" (`*.ankjck.com.br`).
4. **GitHub: Dependabot alerts** ligado (é grátis em todo repositório). O site não usa pacotes do npm em produção (as bibliotecas estão copiadas em `docs/vendor/`), então o alerta serve para `tools/` e para lembrar de atualizar as cópias de `vendor/` uma vez por ano.
5. **Cloudflare: 2FA** na conta; **DNSSEC** ligado (DNS → Settings); **HSTS** ligado (SSL/TLS → Edge Certificates, começar com prazo curto); modo **Full** ou **Full (strict)** (testar: há relato de 526 com strict em Pages; **nunca Flexible**); **Always Use HTTPS**; **WAF → Managed Rules** (o conjunto gratuito) e **Bot Fight Mode** ligados; **Security → Events** para olhar os logs de vez em quando.

**Ponte (as chaves do banco)**
6. **Por padrão, a ponte só escuta em `127.0.0.1`.** Abrir para a rede só de propósito, por configuração explícita, e só junto com Access/Tailscale (seção 5).
7. **Credenciais fora do Git e com permissão restrita:** `ponte-c6/.env` e `credenciais/` no `.gitignore` (já previsto); no Windows, a pasta com permissão só para o usuário que roda a ponte (Propriedades → Segurança → remover "Usuários"); no Linux, `chmod 600`. `git status` nunca pode listá-los.
8. **Senha da ponte** com 20+ caracteres gerada por gerenciador de senhas; comparação em tempo constante e bloqueio após 5 erros (seção 5). Trocar quando alguém sair.
9. **Serviço sem privilégio:** a ponte roda com um usuário Windows/Linux comum, não administrador; **firewall ligado** no computador e **nenhuma porta aberta no roteador** (Tunnel e Tailscale não precisam).
10. **Logs sem segredos** (nunca gravar client_secret, token do C6, senha da ponte, nem linha digitável completa) e com retenção de 90 dias para investigar.
11. **Node.js LTS atualizado** (lembrete trimestral; `node -v`), ponte com `npm audit` limpo, sistema operacional com atualização automática.
12. **Backup cifrado das chaves** (certificado, chave privada, `.env`) em pen drive no cofre ou no gerenciador de senhas da empresa com anexo; **validade do certificado** na agenda com lembrete 30 dias antes; testar a restauração uma vez.
13. **Rate limit** na ponte (p. ex. 60 pedidos/minuto por origem) e limite diário de emissões, para um bug ou um ataque não emitir mil boletos.

**Computadores das pessoas (é onde os ataques acontecem)**
14. **Windows 11 atualizado**, com **Microsoft Defender** ligado e, se possível, um EDR (Defender for Business ou similar) nas máquinas que tocam o banco.
15. **Sem administrador no dia a dia:** cada pessoa usa uma conta Windows comum; a conta admin só para instalar.
16. **BitLocker** ligado em todos os notebooks/PCs (um notebook perdido não vira vazamento).
17. **Defender → Proteção contra ransomware → "Acesso controlado a pastas"** ligado (cobre a pasta do OneDrive por padrão; vem **desligado**). Pode pedir para liberar o Chrome/Edge na primeira vez que gravar a pasta.
18. **Gerenciador de senhas** (Bitwarden, 1Password...) para todos; senhas únicas; **nunca salvar a senha do Web Banking no navegador**.
19. **Extensões do navegador:** só as conhecidas; no Edge/Chrome gerenciado, bloquear instalação de extensões não aprovadas (política `ExtensionInstallBlocklist`/allowlist). Extensão maliciosa lê tudo que a página vê.
20. **Treino de phishing** curto, duas vezes por ano: ninguém do C6, da Microsoft ou do Cloudflare liga pedindo código, senha ou "instalar programa de acesso remoto". Na dúvida, desliga e liga de volta pelo número oficial.
21. **Bloqueio de tela** automático em 5 minutos; celular do dono (aprovações do C6) com biometria + senha longa e **PIN do chip** (contra troca de SIM).

**OneDrive e a pasta de dados**
22. **2FA na conta Microsoft** de cada usuário (app Microsoft Authenticator, sem SMS se possível) e conta de recuperação em dia.
23. **Cofre Pessoal (Personal Vault): NÃO use para a pasta de dados.** Ele tranca sozinho após 20 minutos sem uso (o sistema grava a cada alteração e falharia), programas de terceiros às vezes recebem "acesso negado" nos arquivos dele, ele não é acessível por outros programas/API e não dá para **compartilhar** com os outros usuários. Serve, isso sim, para o **backup das chaves do C6** e dos códigos de recuperação do dono.
24. **Recuperação de ransomware:** o OneDrive guarda **Histórico de versões** de cada arquivo e, com assinatura Microsoft 365, o **"Restaurar seu OneDrive"** volta a pasta inteira a qualquer ponto dos **últimos 30 dias** e avisa quando detecta ransomware. Confira que a conta que hospeda a pasta tem Microsoft 365 e saiba onde fica esse botão (onedrive.com → Configurações → Restaurar). A lixeira guarda excluídos por 30 dias (93 em contas corporativas).
25. **Quem tem a pasta:** lista escrita das pessoas com a pasta compartilhada; ao sair alguém, **remover o compartilhamento no mesmo dia** (a cópia local dela continua existindo: por isso BitLocker e contrato de confidencialidade).

**Dados**
26. **O `imoveis-dados.json` é texto claro**: quem abre a pasta lê tudo. O **backup seguro** (segunda pasta do administrador, cifrado com AES-GCM + RSA e senha PBKDF2, já existente em Dados e backup) é a cópia que resiste a roubo: **ligue-o**, numa pasta de **outra conta** (OneDrive ou disco externo), e guarde a senha dele no gerenciador.
27. **Cifrar o arquivo principal?** Avaliação honesta: é possível (o navegador já tem o Web Crypto; a senha do backup seguro poderia abrir também o banco), e protege contra quem **copia a pasta** sem invadir o PC. **O que muda:** cada usuário digita uma senha extra ao abrir (ou a chave fica guardada no navegador, o que reduz a proteção contra malware no próprio PC); o OneDrive deixa de conseguir mostrar versões legíveis; uma senha perdida = dados perdidos (precisa de chave de recuperação do administrador); os anexos (PDFs, fotos) continuariam claros, salvo cifrar tudo. **Recomendação:** vale implementar como **opção** (seção 5), ligada depois de o backup seguro e a chave de recuperação estarem testados. Contra malware no PC em uso, não ajuda: nesse caso o que protege é a seção "Computadores".
28. **Teste de restauração** trimestral: abrir um backup (comum e seguro) numa pasta vazia, conferir que o sistema abre e os números batem. Backup que nunca foi restaurado não é backup.

**Banco (C6)**
29. **Permissões mínimas na chave da API:** ao criar a chave no Web Banking (Integrações via API), marcar **só** os produtos usados (Boleto de cobrança; Saldo/Extrato e Agendamento de pagamentos só quando a fase 2 entrar). **Uma chave por conta** (ANK e JCK), com nome que diga onde roda (`ponte-minipc-casa`). Nunca reutilizar a chave em outro sistema.
30. **Pagamento sempre com aprovação no app** (a API de agendamento do C6 só *prepara* o lote; a aprovação é no Web Banking/app). Na conta PJ o C6 tem **Múltiplos Acessos** (titular, administrador, operador, com permissões, dias e horários). **Pergunte ao gerente** se há aprovação em dupla (dois aprovadores acima de um valor): se houver, ligue; se não, mantenha o limite de valor no sistema e **nunca aprove um lote que você mesmo não preparou minutos antes**.
31. **Limites e alertas:** limite diário de Pix/TED e de pagamento na conta PJ; notificações do C6 ligadas para toda movimentação e para criação/alteração de chave de API.
32. **Revogar é rápido:** saiba o caminho para **excluir a chave** no Web Banking. É a primeira coisa a fazer em incidente; leva 2 minutos e corta a ponte do banco sem afetar a conta.

**Rotina**
33. **Mensal:** revisar a tela **Usuários** do sistema (bloquear quem não usa), olhar o **Histórico** de emissões, conferir que a ponte está no modo certo.
34. **Semestral:** trocar a senha da ponte; revisar quem tem a pasta, quem tem acesso ao servidor da ponte e quem é usuário do Web Banking; atualizar Node e sistema; revisar as regras do Access.
35. **Trimestral:** teste de restauração (item 28).
36. **Plano de incidente: a 1ª hora depois de um PC infectado ou suspeita de vazamento**
   1. Desligar o PC da rede (Wi-Fi/cabo). Não desligar o computador (preserva evidência), só isolar.
   2. **C6 Web Banking → Integrações via API → excluir a chave** (se o PC era o da ponte ou se há dúvida). Trocar a senha do Web Banking e checar o celular aprovador.
   3. **Sistema → Usuários → bloquear** o usuário daquele PC; **Dados e backup → trocar a senha da ponte**; no Access/Tailscale, remover o dispositivo.
   4. Trocar as senhas da conta Microsoft, GitHub e Cloudflare da pessoa (de outro computador) e encerrar as sessões ativas nelas.
   5. OneDrive: conferir **Histórico de versões**/**Restaurar seu OneDrive** se algum arquivo foi alterado ou cifrado; se precisar, restaurar o **backup seguro** numa pasta nova e apontar o sistema para ela.
   6. Formatar o PC; só então voltar. Gerar chave nova no C6 e colocar na ponte.
   7. Anotar data, hora e o que foi feito (ajuda o banco, o contador e a LGPD, se houve dado pessoal exposto).

---

## 5. O que o próprio sistema vai fazer (para repassar aos desenvolvedores)

Ordem de prioridade. Nenhum item muda regra de negócio.

1. **Ponte escuta só em `127.0.0.1` por padrão.** Para escutar em outra interface é preciso `PONTE_HOST=0.0.0.0` **e** uma destas: `ACCESS_AUD=<tag do app no Cloudflare Access>` (a ponte valida `Cf-Access-Jwt-Assertion` contra `https://<equipe>.cloudflareaccess.com/cdn-cgi/access/certs`, conferindo `aud`, `iss`, validade e e-mail) ou `TAILSCALE=1` (aceita só IPs `100.64.0.0/10`). Sem isso, a ponte **recusa iniciar** com a mensagem "Ponte configurada para a rede sem proteção".
2. **Senha da ponte:** `crypto.timingSafeEqual` sobre o hash SHA-256 das duas strings; **bloqueio por tentativas** (5 erros → 15 minutos, por IP e global) com log; a senha nunca aparece em log, em `/saude` nem em erro.
3. **CORS fixo:** `Access-Control-Allow-Origin` só para as origens do `.env` (`https://erp.ankjck.com.br`, `http://localhost:8000` em desenvolvimento), sem `*`; `Vary: Origin`; preflight com `Access-Control-Allow-Private-Network: true` (o Chrome exige isso para uma página pública chamar `127.0.0.1`; versões recentes também mostram ao usuário um pedido "permitir acesso à rede local": o sistema deve explicar na tela se o pedido for negado).
4. **Sem segredos em logs/dados:** a ponte só grava método, rota, conta, código de resposta, duração e os 4 últimos dígitos do `external_reference_id`; o cliente `docs/js/banco.js` nunca põe `senha_ponte` em `registrar()` (`detalhesSemSenha`, já previsto no plano da fase 2). **Mudar o lugar da senha da ponte:** em vez de `config_banco.senha_ponte` no JSON compartilhado, guardar a senha **no navegador de cada usuário** (IndexedDB, junto com o atalho da pasta), pedida uma vez por computador. Assim quem rouba a pasta não leva a senha.
5. **Aviso na tela quando a ponte está exposta sem proteção:** `/saude` devolve `{ escuta: '127.0.0.1' | 'rede', protegida_por: 'access' | 'tailscale' | null }`; se `escuta === 'rede' && !protegida_por`, Dados e backup mostra faixa vermelha "A ponte está aberta na rede sem Cloudflare Access/Tailscale" e bloqueia emissão em produção.
6. **CSP no `index.html`** (GitHub Pages não deixa configurar cabeçalhos HTTP, então vai por `<meta http-equiv="Content-Security-Policy">`; `frame-ancestors` e `report-uri` não funcionam em meta): ponto de partida `default-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:* https://banco.ankjck.com.br; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`. Testar: as telas usam `style=` inline? (então `'unsafe-inline'` em style fica); `blob:` para PDFs/ZIPs; a versão offline (arquivo único) precisa de uma CSP própria porque o código é inline (usar `'sha256-…'` gerado em `tools/gerar-offline.mjs` ou `'unsafe-inline'` só nela). Também `<meta name="referrer" content="no-referrer">`.
7. **Sessão mais curta para administrador:** `DURACAO_SESSAO` 12 h para operador/consulta, **2 h sem uso** para `admin`, e pedir a senha de novo antes de ações de banco (emitir em produção, aprovar pagamento, mudar configuração da ponte). Encerrar as sessões lembradas de um usuário quando ele é bloqueado ou troca a senha (invalidar o `token` gravado no usuário).
8. **Opção "cifrar o arquivo de dados"** (Dados e backup, só admin): `imoveis-dados.json` passa a ser gravado como `imoveis-dados.cifrado` (AES-GCM 256 com chave aleatória embrulhada pela chave pública do backup seguro e também por uma chave derivada da senha de cada usuário, PBKDF2 ≥ 600 mil iterações ou Argon2 via WebAssembly), com chave de recuperação do administrador impressa. Manter `normalizar()`/migração: abrir arquivo antigo, oferecer cifrar, e **nunca** apagar o claro antes de confirmar a leitura do cifrado. Documentar em `DECISOES.md` o que muda para o usuário (item 27 acima).
9. **Integridade do código:** `tools/checar.mjs` passa a gerar `docs/sri.json` (hash SHA-256 de cada arquivo de `docs/js`, `docs/css`, `docs/vendor`); `app.js` não consegue se autoverificar, mas a versão offline pode mostrar o hash do arquivo na tela "Sobre" para o dono comparar com o do GitHub release. Barato e ajuda a detectar troca de código.
10. **Idempotência e limites na ponte** (já no plano da fase 2): `referencia = 'erp-<id>'`, `LIMITE_PAGAMENTO_CENTAVOS`, `PAGAMENTOS=1` só quando a fase 2 estiver homologada; acrescentar **limite diário de emissões** e `MODO=producao` só com a flag explícita.
11. **`/saude` sem informação demais:** modo e contas configuradas sim; versão do Node, caminhos de arquivos e nomes de certificado não.
12. **Dependências da ponte mínimas:** só módulos nativos do Node (`https`, `crypto`) e, se preciso, uma biblioteca pequena e auditada para PDF; `package-lock.json` versionado; `npm audit` no `tools/checar.mjs`.

---

## 6. Perguntas frequentes

**O Cloudflare vê meus dados?**
Do site, não: o Cloudflare entrega só as telas; inquilinos, valores e boletos nunca saem do seu computador/OneDrive para ele. Da **ponte via Tunnel (Arquitetura B1)**, sim, em parte: a Cloudflare termina a conexão TLS nos servidores dela, então os pedidos e respostas entre o sistema e a ponte (nome do inquilino, valor, linha digitável, extrato) passam decifrados por lá por um instante antes de serem cifrados de novo até o `cloudflared` em casa. As **chaves do C6 não passam** pela Cloudflare (ficam no servidor da ponte) e o pagamento continua sendo aprovado só no app. Se isso incomodar, use Tailscale (B2), em que ninguém no meio lê nada, ou fique na A.

**E se o Cloudflare cair?**
Aconteceu (18/11/2025, cerca de 3 horas, por um arquivo de configuração interno; e um incidente de Tunnel em maio/2026). O site não abre durante a queda; na B1 a ponte também fica inacessível de fora. Solução: a **versão sem internet** (arquivo único em Dados e backup) abre no Chrome e usa a mesma pasta; na Arquitetura A a ponte local continua funcionando. Nenhum dado se perde.

**E se o GitHub cair, ou a conta for bloqueada?**
Mesma resposta: a versão sem internet continua funcionando, e o código também está no computador de quem desenvolve. Guarde uma cópia do arquivo único a cada atualização.

**O OneDrive é seguro?**
Para o que fazemos (sincronizar uma pasta entre 2 a 4 PCs), sim, **desde que** cada conta Microsoft tenha 2FA e os PCs estejam limpos. Os arquivos ficam cifrados nos servidores da Microsoft e em trânsito, mas a Microsoft (e quem tomar a conta) consegue lê-los: por isso o backup seguro cifrado é importante. O OneDrive também é a sua **melhor recuperação de ransomware** (histórico de versões e Restaurar OneDrive de 30 dias com Microsoft 365). O Cofre Pessoal **não** serve para a pasta de dados (tranca sozinho e não compartilha), mas serve para guardar as chaves do banco.

**Posso usar no celular?**
Para **ver**, não: o celular não consegue gravar numa pasta (a API de pasta só existe no Chrome/Edge de computador). Para **aprovar pagamentos**, o celular é justamente o lugar certo: a aprovação é no app do C6, fora do sistema. Se um dia quiser consultar pelo celular, a solução segura é acessar um computador seu por área de trabalho remota dentro da rede privada (Tailscale/Access), não expor dados na internet.

**A senha do sistema protege os dados?**
Protege contra o colega que usa o mesmo computador e contra erro (papéis: admin, operador, consulta) e dá rastreabilidade (Histórico). **Não** protege contra quem copia a pasta: a lista de usuários está dentro do JSON e quem o edita pode criar um admin. A proteção da pasta vem do Windows (BitLocker, Defender, usuário comum), do OneDrive (2FA) e, se quiser, da cifragem do arquivo (item 27).

**Então está "blindado"?**
Com a Arquitetura A ou B e o checklist feito, o que sobra de risco é: uma pessoa cair num golpe, um PC pegar malware antes de o antivírus detectar, ou um fornecedor (Cloudflare, Microsoft, GitHub, C6) ter um incidente. Para cada um desses há um plano (seção 4, item 36) e um limite de dano (o C6 só paga com aprovação no app; o backup seguro é cifrado; a chave do banco se revoga em minutos). É esse o nível aceitável para uma empresa pequena; "100% seguro" ninguém honesto promete.

---

## 5b. Dados na nuvem (Cloudflare, em construção)
O que o código já faz e o checklist de publicação: `nuvem/README.md`, seções "Segurança" e "Publicar". Em resumo: login pelo Cloudflare Access (4 e-mails) conferido também no Worker; papéis conferidos no servidor; histórico com o e-mail real; entradas e anexos perigosos barrados; backups diários só de leitura. Pendências do dono, na hora de publicar: 2FA no Cloudflare, bucket R2 sem acesso público, Access com sessão de 24 h, cabeçalhos de segurança (HSTS, X-Frame-Options) e `wrangler logout` depois de publicar.

## Fontes consultadas (novembro de 2026)

Cloudflare
- Planos Zero Trust/SASE (Free até 50 usuários; US$ 7/usuário acima): https://www.cloudflare.com/plans/sase-zero-trust/ e https://www.cloudflare.com/products/cloudflare-access/
- Anúncio do plano gratuito para pequenas empresas: https://blog.cloudflare.com/zero-trust-week-setting-up-cloudflare-one-as-a-small-business/
- Tunnel: cifras TLS 1.3 entre Cloudflare, `cloudflared` e origem: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/cipher-suites/
- Access para aplicação própria (self-hosted) e validação do token na origem: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- mTLS com Access: https://developers.cloudflare.com/learning-paths/mtls/mtls-cloudflare-access/
- Postura de dispositivo com Access (WARP): https://developers.cloudflare.com/cloudflare-one/identity/devices/access-integrations
- WAF gratuito em todos os planos: https://blog.cloudflare.com/waf-for-everyone/
- Modos de criptografia (Flexible/Full/Full strict): https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
- Queda de 18/11/2025 (post-mortem oficial): https://blog.cloudflare.com/18-november-2025-outage/
- Histórico de incidentes (Tunnel, 05/2026): https://www.cloudflarestatus.com/ e https://isdown.app/status/cloudflare/outage-history

GitHub
- 2FA obrigatório e métodos recomendados: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/about-mandatory-two-factor-authentication
- Rulesets/branch protection (grátis em repositório público): https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets e https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches
- Verificar domínio do GitHub Pages: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages
- Pages não permite cabeçalhos HTTP (CSP só por meta): https://github.com/orgs/community/discussions/54257
- Dependabot alerts: https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts

Tailscale
- Plano gratuito (6 usuários, uso não comercial) e FAQ de preços: https://tailscale.com/docs/account/manage-plans/free-plans-discounts , https://tailscale.com/pricing/ , https://tailscale.com/kb/1251/pricing-faq

Microsoft (OneDrive, Windows)
- Restaurar seu OneDrive (30 dias, Microsoft 365): https://support.microsoft.com/office/restore-your-onedrive-5a3dc200-3537-49b6-9f51-09cd74bc962a
- Cofre Pessoal (bloqueio após 20 min, área BitLocker): https://support.microsoft.com/help/4555044 ; relatos de "acesso negado" a programas de terceiros: https://community.adobe.com/t5/acrobat-reader-discussions/adobe-reader-dc-can-t-open-files-in-microsoft-personal-vault/td-p/10644387
- Acesso controlado a pastas (Defender): https://learn.microsoft.com/en-us/defender-endpoint/controlled-folders

C6 Bank
- Guia de ativação das APIs (Web Banking → Integrações via API → chave com permissões por produto, confirmada no app): https://www.c6bank.com.br/blog/guia-ativacao-apis-c6-bank
- Múltiplos Acessos na conta PJ (titular, administrador, operador; permissões, dias e horários): https://www.c6bank.com.br/blog/c6-bank-lanca-a-funcao-multiplos-acessos-para-contas-pj e https://www.c6bank.com.br/blog/gestao-de-usuarios
- API de agendamento de pagamentos não paga; aprovação no app/Web Banking: arquivos OpenAPI oficiais em `documentacao/c6-openapi/` (resumo em `C6_CAMPOS_CONFIRMADOS.md`)

Ameaças no Brasil (2026)
- Relatório LATAM Q2/2026 (Group-IB): https://www.group-ib.com/resources/research-hub/latam-intelligence-insights-report-q2-2026-en/
- Trojans bancários VENON, TCLBanker, Astaroth: https://www.pulse.bot/defense/news/rust-based-venon-malware-targets-33-brazilian-banks-with-credential-stealing-overlays-c3666bae-890a-4c7f-a97c-cf7e62ab864f , https://threatlabsnews.xcitium.com/?p=63721 , https://therecord.media/banking-trojan-targeting-brazil-fortinet

Observação: as páginas oficiais da Cloudflare, GitHub, Tailscale e Microsoft não puderam ser abertas diretamente neste ambiente (rede restrita); os fatos acima vieram dos resumos de busca que citam essas páginas e de documentação já conhecida. Antes de contratar ou configurar, abra o link e confirme o número (planos e nomes de menu mudam).

---

## 7. Pendências do dono (marque conforme fizer)

Cada item diz **onde entrar, o que clicar e como conferir que deu certo**. Faça na ordem dos blocos; o bloco 1 só quando o C6 liberar as chaves. Os nomes de menu foram conferidos em novembro de 2026 e podem mudar um pouco: procure o mais parecido ou use a busca da tela.

### Bloco 1 — Ponte do banco (fazer quando chegar a hora de ligar o C6)

**Escolher a arquitetura**
- [ ] **Decidir por A (tudo local), recomendada para começar.** A ponte roda no seu próprio computador e só ele emite boletos/lê extrato; os outros usuários veem o resultado pela pasta do OneDrive. Custo zero, nada aberto na internet. *Conferir:* a URL da ponte no sistema (Dados e backup → Banco C6) começa com `http://127.0.0.1:` e `/saude` só abre nesse computador (num outro PC da casa não abre).
- [ ] **Evoluir para B só se precisar** que outro computador também emita, ou para tirar a ponte do PC de uso diário: mini PC ou Raspberry em casa + **Cloudflare Access** (grátis, mais simples) ou **Tailscale** (pago para empresa, ~US$ 8/usuário/mês, mas ninguém no meio vê o tráfego). Passo a passo mais abaixo.
- [ ] **C (ponte pública em `banco.ankjck.com.br` só com senha): NÃO fazer.** Se algum dia alguém propuser, a resposta é "só atrás do Access ou do Tailscale".

**Onde instalar e como rodar (A ou B)**
- [ ] **Computador da ponte:** na A, o seu PC; na B, um mini PC/Raspberry que fica ligado. Em qualquer caso, crie uma **conta Windows separada** chamada `ponte` (Configurações → Contas → Outros usuários → Adicionar conta → "Não tenho as informações de entrada" → "Adicionar usuário sem conta Microsoft"), tipo **Usuário padrão** (não administrador). *Conferir:* em Outros usuários aparece `ponte — Usuário padrão`.
- [ ] **Instalar o Node LTS** (`https://nodejs.org` → botão LTS → avançar até o fim). *Conferir:* PowerShell → `node -v` mostra `v22.x` ou maior.
- [ ] **Colocar a ponte** na pasta `C:\ponte-c6\` (não dentro do OneDrive, não dentro da pasta de dados) e rodar `node servidor.mjs` primeiro em modo **simulado** (ver `LIGAR_C6.md`, Etapa 3). *Conferir:* `http://127.0.0.1:PORTA/saude` responde "ok, modo SIMULADO".
- [ ] **Iniciar com o Windows:** Agendador de Tarefas → Criar tarefa → Disparador "Ao iniciar" → Ação: `node C:\ponte-c6\servidor.mjs` → executar com a conta `ponte`, "Executar estando o usuário conectado ou não". *Conferir:* reiniciar o PC e abrir `/saude` sem ter feito nada.

**Credenciais e senha**
- [ ] **Chaves do C6** (certificado `.crt`, chave `.key`, Client ID/Secret) em `C:\ponte-c6\credenciais\ank\` (e `jck\` se usar). Botão direito na pasta `credenciais` → Propriedades → Segurança → Avançadas → "Desabilitar herança" → remover "Usuários" e "Usuários autenticados"; deixar só `ponte`, `SYSTEM` e `Administradores`. *Conferir:* entrando como outro usuário comum, a pasta dá "Acesso negado".
- [ ] **`.env` preenchido** (ambiente `simulado` → `sandbox` → `producao`, nessa ordem, cada troca testada). *Conferir:* `git status` na pasta não lista `.env` nem `credenciais/`.
- [ ] **Senha da ponte** gerada no gerenciador de senhas, 20+ caracteres, só usada aqui. Colocar no `.env` e no sistema (Dados e backup → Banco C6 → Senha da ponte). *Conferir:* "Testar conexão" diz "Conectado"; trocando uma letra na senha do sistema, diz "Senha da ponte inválida".
- [ ] **Backup das chaves:** zipar `credenciais\` + `.env` e guardar (a) no **Cofre Pessoal** do OneDrive do dono e (b) num pen drive no cofre físico. *Conferir:* abrir o ZIP do pen drive em outro PC e ver os arquivos (sem copiá-los para fora).
- [ ] **Validade do certificado** anotada na agenda com lembrete 30 dias antes (ANK: ______ ; JCK: ______). Para renovar: Web Banking → três pontos → **Integrações via API** → baixar o certificado novo → substituir em `credenciais\<conta>\` → reiniciar a ponte. *Conferir:* "Testar conexão" ok e um boleto de R$ 10 emitido no sandbox.

**Firewall e rede (A e B)**
- [ ] **Firewall do Windows ligado** no computador da ponte: Configurações → Privacidade e segurança → Segurança do Windows → Firewall e proteção de rede → os três perfis "Ativado". **Não** criar regra de entrada para a porta da ponte. *Conferir:* de outro PC da casa, `http://IP-do-PC:PORTA/saude` **não** abre.
- [ ] **Roteador (Deco BE65): nenhuma porta aberta.** App Deco → Mais → Avançado → Encaminhamento de porta (Port Forwarding) e UPnP: lista vazia e UPnP **desligado**. *Conferir:* `https://www.grc.com/shieldsup` (ou similar) mostra todas as portas "Stealth/closed".

**Se for para a B1 — Cloudflare Tunnel + Access (passo a passo)**
- [ ] `https://one.dash.cloudflare.com` → escolher o plano **Free** → **Networks → Tunnels → Create a tunnel → Cloudflared** → nome `ponte-c6` → copiar o comando de instalação do Windows/Linux e rodar no computador da ponte (PowerShell como administrador). *Conferir:* o túnel aparece **Healthy**.
- [ ] No túnel → **Public Hostname (ou Routes → Published application)** → Subdomain `banco`, Domain `ankjck.com.br`, Service `HTTP` → `localhost:PORTA` → Save. *Conferir:* `https://banco.ankjck.com.br/saude` abre (por enquanto para qualquer um; o próximo passo fecha).
- [ ] **Settings → Authentication → Login methods → Add new → One-time PIN** (código por e-mail; serve). Opcional: Google ou Microsoft, se os e-mails da empresa forem desses. *Conferir:* One-time PIN listado.
- [ ] **Access → Applications → Add an application → Self-hosted** → nome `Ponte C6`, domínio `banco.ankjck.com.br`, duração da sessão **8 horas** → política `Permitir empresa`: Action **Allow**, Include → **Emails** → listar um a um os e-mails dos usuários (nunca "Everyone" nem domínio inteiro de provedor público). *Conferir:* abrindo `https://banco.ankjck.com.br/saude` em aba anônima aparece a tela de login da Cloudflare; com e-mail não listado, "não autorizado".
- [ ] **Dispositivo autorizado (opcional, recomendado):** Settings → WARP Client → Device enrollment → permitir os mesmos e-mails; instalar o **Cloudflare WARP** em cada PC e entrar com a equipe (`ankjck`); na política do app, acrescentar Require → **Device posture → WARP**. *Conferir:* num PC sem WARP, mesmo com e-mail certo, a ponte recusa.
- [ ] **Na ponte:** no `.env`, `ACCESS_AUD=<Application Audience (AUD) Tag>` (copiado em Access → Applications → Ponte C6 → Overview) e `PONTE_HOST=0.0.0.0` só se a ponte não estiver no mesmo PC do `cloudflared` (normalmente **não precisa**: o túnel fala com `localhost`). *Conferir:* `/saude` devolve `protegida_por: "access"` e o sistema não mostra a faixa vermelha "ponte aberta".
- [ ] **Logs:** Access → Logs → Access requests, olhar uma vez por mês quem entrou. *Conferir:* só e-mails conhecidos.

**Se for para a B2 — Tailscale (passo a passo)**
- [ ] `https://tailscale.com` → Get started → entrar com a conta Microsoft/Google da **empresa** (não pessoal) → plano **Standard** (uso comercial). *Conferir:* `https://login.tailscale.com/admin` abre com a rede (tailnet) criada.
- [ ] Instalar o Tailscale no computador da ponte e em cada PC que vai emitir (Download → Windows → instalar → Entrar). *Conferir:* Admin console → **Machines** lista todos, com os nomes certos.
- [ ] No computador da ponte, PowerShell: `tailscale serve --bg http://127.0.0.1:PORTA`. Antes, em Admin console → **DNS**: ligar **MagicDNS** e **HTTPS Certificates**. *Conferir:* `tailscale serve status` mostra `https://ponte.<rede>.ts.net`; essa URL abre em outro PC da rede e **não** abre num PC fora dela.
- [ ] No sistema, Dados e backup → Banco C6 → URL da ponte = `https://ponte.<rede>.ts.net`. No `.env`, `TAILSCALE=1`. *Conferir:* "Testar conexão" ok; `/saude` devolve `protegida_por: "tailscale"`.
- [ ] Ao sair um funcionário: Admin console → Machines → três pontos no PC dele → **Remove**; e Users → remover. *Conferir:* a máquina some da lista.

**Plano de incidente (imprimir e deixar perto do computador)**
- [ ] **Em 1 hora, se um PC estiver infectado ou houver suspeita de vazamento:**
  1. Desligar o Wi-Fi/cabo desse PC (não desligar o PC).
  2. **Revogar a chave do C6:** Web Banking → três pontos → **Integrações via API** → chave `ponte…` → **Excluir** (confirmar com senha e app). *Conferir:* "Testar conexão" no sistema passa a falhar com "Falha ao autenticar no C6".
  3. Sistema → **Usuários** → bloquear o usuário daquele PC; Dados e backup → **trocar a senha da ponte** (e no `.env`, reiniciar a ponte); B1: Access → Applications → Ponte C6 → Revoke existing tokens, e remover o e-mail da política; B2: remover a máquina.
  4. De outro computador: trocar senha e encerrar sessões da conta Microsoft (`account.microsoft.com` → Segurança → Sair de todos os dispositivos), GitHub (Settings → Sessions) e Cloudflare (My Profile → Sessions).
  5. OneDrive: `onedrive.com` → engrenagem → Opções → **Restaurar seu OneDrive**, se houve arquivo alterado/cifrado; ou restaurar o backup seguro numa pasta nova.
  6. Formatar o PC. Gerar **chave nova** no Web Banking e colocar na ponte. Anotar o que aconteceu (data, hora, o que foi feito).
- [ ] **Treinar uma vez** (simulação de 15 minutos): abrir as telas de cada passo sem clicar em Excluir, só para saber o caminho. *Conferir:* você chega em "Integrações via API" em menos de 1 minuto.

### Bloco 2 — GitHub

**Situação conferida em 05/11/2026 no repositório `juliocpfh/erp-boletos`:** o repositório é **público** (o GitHub Pages gratuito exige isso; **não há problema**, desde que nunca haja segredo no código: as chaves do C6 e a senha da ponte ficam fora do Git, em `ponte-c6/.env` e `credenciais/`, ignorados); o ramo `main` **não tem proteção**; **Dependabot security updates** está **desligado**; **secret scanning** e **push protection** estão **ligados** (bom: o GitHub recusa um push que contenha uma chave conhecida). Não foi possível mudar nada pela API nesta sessão, então **tudo abaixo é você quem faz**, entrando em `https://github.com` com a conta `juliocpfh`.

**Conta**
- [ ] **2FA** — *Por que:* quem toma a conta troca o código do site e todo mundo passa a rodar código do atacante; a senha sozinha não segura isso. Foto do perfil → **Settings → Password and authentication → Two-factor authentication → Enable**. Primeiro **Authenticator app** (Microsoft Authenticator ou o do gerenciador de senhas: escanear o QR, digitar o código); depois, na mesma tela, **Add → Security keys / Passkeys** (chave física YubiKey ou a passkey do Windows Hello) como segundo método. **Recovery codes → Download** e imprimir → cofre. *Conferir:* a tela mostra "Two-factor authentication: Enabled", dois métodos listados e "Recovery codes" marcados como vistos.
- [ ] **Sessões** — *Por que:* encerra qualquer login antigo que você não reconheça. Settings → **Sessions** → "Revoke" no que não é seu. *Conferir:* só o seu computador na lista.
- [ ] **Applications e tokens** — *Por que:* um token ou app autorizado antigo é uma "senha" paralela que não passa pelo 2FA. Settings → **Applications** → abas *Authorized OAuth Apps* e *Authorized GitHub Apps* → revogar o que não usa (o app do Claude Code é esperado); Settings → **Developer settings → Personal access tokens** (*Fine-grained* e *Tokens (classic)*) → apagar os vencidos ou desconhecidos. *Conferir:* só itens que você reconhece.
- [ ] **E-mail de recuperação** — *Por que:* é por ele que se recupera (ou se rouba) a conta. Settings → **Emails** → o e-mail primário é um que só você acessa e que tem 2FA; marcar "Keep my email addresses private" e "Block command line pushes that expose my email". *Conferir:* e-mail com selo "Primary · Verified".

**Repositório `erp-boletos` → Settings**
- [ ] **Proteger o ramo `main`** — *Por que:* hoje qualquer commit entra direto no site; com a regra, toda mudança passa por um Pull Request que você lê antes, e ninguém apaga nem reescreve o histórico. Settings → **Rules → Rulesets → New ruleset → New branch ruleset**: nome `main protegido`; Enforcement status **Active**; Target branches → Add target → **Include default branch**; marcar **Restrict deletions**, **Block force pushes**, **Require a pull request before merging** (Required approvals **0**, porque você é o único; marcar **Dismiss stale pull request approvals when new commits are pushed**), **Require conversation resolution before merging** → **Create**. (Se preferir a tela antiga: Settings → **Branches → Add branch protection rule** → pattern `main` → as mesmas caixas, mais "Do not allow bypassing the above settings".) *Conferir:* editar um arquivo direto em `main` pelo site mostra "You can't commit to main because it is a protected branch"; um `git push --force` é recusado.
- [ ] **Dependabot** — *Por que:* avisa (alerts) e propõe a correção (security updates) quando uma biblioteca usada em `tools/`/testes tem falha conhecida; é grátis. Settings → **Code security** (ou *Code security and analysis*) → **Dependabot alerts: Enable** e **Dependabot security updates: Enable** (e **Grouped security updates**, para vir um PR só). *Conferir:* os dois com "Enabled"; a aba **Security → Dependabot** do repositório abre sem erro.
- [ ] **Secret scanning e push protection** — *Por que:* impedem que uma chave do C6 ou do Cloudflare suba por engano para um repositório público. Já estão **ligados**: só confira em Settings → Code security → Secret scanning: "Enabled" e Push protection "Enabled". *Conferir:* se um dia o `git push` for recusado com "push protection", **não** use "bypass": tire o segredo do commit e trate a chave como vazada.
- [ ] **Verificar o domínio** — *Por que:* impede outro usuário do GitHub de apontar um Pages dele para um subdomínio seu (`qualquercoisa.ankjck.com.br`). Foto do perfil → Settings → **Pages** (coluna "Code, planning, and automation") → **Verified domains → Add a domain** → `ankjck.com.br` → copiar nome e valor do registro **TXT** `_github-pages-challenge-juliocpfh` → em `dash.cloudflare.com` → `ankjck.com.br` → **DNS → Records → Add record** → Type **TXT**, Name e Content colados → Save → voltar ao GitHub → **Verify**. **Deixe o TXT no DNS para sempre** e não crie registro curinga `*`. *Conferir:* o domínio aparece "Verified"; no repositório, Settings → Pages mostra `erp.ankjck.com.br` com cadeado e **Enforce HTTPS** marcado.
- [ ] **Colaboradores** — *Por que:* cada colaborador é uma conta a mais que pode ser roubada e escrever no site. Settings → **Collaborators** → só quem precisa (hoje, só você; quem desenvolve trabalha por Pull Request a partir de um *fork*, sem precisar ser colaborador). *Conferir:* lista vazia ou só nomes que você reconhece.

### Bloco 3 — Pasta de dados (OneDrive/local) e computadores

Vale para **cada** computador que abre o sistema (o seu e os dos outros usuários). "Computador atualizado, antivírus e senhas", feito direito, é isto:

**Conta Microsoft e OneDrive**
- [ ] **2FA na conta Microsoft** de cada pessoa: `https://account.microsoft.com` → **Segurança → Opções de segurança avançadas → Verificação em duas etapas → Ativar**, usando o app **Microsoft Authenticator** (não SMS). Anotar o código de recuperação no gerenciador de senhas. *Conferir:* a tela mostra "Verificação em duas etapas: ATIVADA".
- [ ] **Cofre Pessoal: não usar para a pasta de dados.** Pesquisamos: não há documentação de que a API de pastas do Chrome (File System Access) funcione com o Cofre; o Cofre é um "disco" cifrado que é **desmontado quando tranca** (20 minutos sem uso, no máximo 4 h), programas de terceiros relatam "acesso negado" nos arquivos dele, ele não é acessível por API externa e **não pode ser compartilhado** com outros usuários. Como o sistema grava a cada alteração e a pasta é de todos, **não funciona**. *Alternativa (a usar):* pasta normal do OneDrive (`OneDrive\Imoveis`) + **BitLocker** no PC (abaixo) + **Histórico de versões** do OneDrive + backup seguro cifrado. O Cofre fica para o ZIP das chaves do C6 e os códigos de recuperação.
- [ ] **Quem compartilha a pasta:** `onedrive.com` → botão direito na pasta `Imoveis` → **Gerenciar acesso**: só as pessoas que usam o sistema, com **contas da empresa** (ou, se forem contas pessoais, só com 2FA ativada; evitar contas pessoais que a pessoa usa para tudo); nenhum "link para qualquer pessoa". *Conferir:* a lista tem só nomes conhecidos e nenhum link "Qualquer pessoa com o link".
- [ ] **Histórico de versões e restauração sabidos:** `onedrive.com` → botão direito em `imoveis-dados.json` → **Histórico de versões** (abre a lista de versões; dá para restaurar uma). Engrenagem → **Opções → Restaurar seu OneDrive** existe (precisa de Microsoft 365 na conta que hospeda a pasta). *Conferir:* você viu as duas telas; se "Restaurar seu OneDrive" não aparece, a conta não tem Microsoft 365: contratar ou aceitar que só o Histórico de versões (por arquivo) e a Lixeira (30 dias) existem.

**Windows (em cada PC)**
- [ ] **Windows Update automático:** Configurações → **Windows Update** → "Receber as atualizações mais recentes assim que estiverem disponíveis" ligado; Opções avançadas → "Receber atualizações de outros produtos Microsoft" ligado. Windows 10 **não** recebe mais atualizações desde outubro de 2025: trocar para o 11. *Conferir:* a tela diz "Você está atualizado" e a versão é Windows 11.
- [ ] **Microsoft Defender ligado:** Configurações → Privacidade e segurança → **Segurança do Windows** → Proteção contra vírus e ameaças → "Proteção em tempo real" e "Proteção fornecida pela nuvem" ativadas. *Conferir:* todos os ícones da Segurança do Windows com visto verde.
- [ ] **Proteção contra ransomware com a pasta de dados:** Segurança do Windows → Proteção contra vírus e ameaças → **Gerenciar proteção contra ransomware → Acesso controlado a pastas: Ativado** → **Pastas protegidas → Adicionar uma pasta protegida** → escolher `OneDrive\Imoveis` (e a pasta do backup seguro). Se o Chrome/Edge for bloqueado ao gravar, em **Permitir um aplicativo pelo Acesso controlado a pastas** → adicionar `chrome.exe`/`msedge.exe`. *Conferir:* a pasta aparece na lista de protegidas e o sistema continua gravando (fazer uma alteração e ver que não dá erro).
- [ ] **BitLocker:** Configurações → Privacidade e segurança → **Criptografia de dispositivo** → Ativado (ou Painel de Controle → Criptografia de Unidade de Disco BitLocker → Ativar). Salvar a **chave de recuperação** na conta Microsoft **e** no gerenciador de senhas. *Conferir:* o ícone do disco `C:` no Explorador tem um cadeado.
- [ ] **Conta sem administrador no dia a dia:** Configurações → Contas → **Outros usuários** → criar uma conta nova **Administrador** (`admin-local`, só para instalar coisas) e mudar a conta usada todo dia para **Usuário padrão** (clicar na conta → Alterar tipo de conta). *Conferir:* instalar um programa pede a senha do `admin-local`.
- [ ] **Bloqueio de tela:** Configurações → Contas → Opções de entrada → "Se você estiver ausente, quando o Windows deve exigir que você entre novamente?" → **Quando o PC sair do modo de suspensão**; Sistema → Energia → tela desliga em **5 minutos**; ativar **Bloqueio dinâmico** (bloqueia quando o celular se afasta) se quiser. *Conferir:* deixar o PC 5 minutos parado e ele pedir senha ao voltar.

**Senhas e navegador**
- [ ] **Gerenciador de senhas** para todos (Bitwarden gratuito ou 1Password): instalar o app e a extensão no Chrome/Edge; mover as senhas para lá; **apagar as senhas salvas no navegador** (Chrome → Configurações → Preenchimento automático e senhas → Gerenciador de senhas → excluir; e desligar "Oferecer para salvar senhas"). *Conferir:* o Gerenciador de senhas do Chrome está vazio e com "Oferecer para salvar" desligado.
- [ ] **Senha do sistema diferente das demais** (e das do Web Banking, OneDrive, e-mail): no sistema → **Trocar senha** → gerar no gerenciador, 14+ caracteres. Idem para o Web Banking do C6. *Conferir:* nenhuma senha repete no gerenciador (ele tem um relatório de "senhas reutilizadas").
- [ ] **Extensões do navegador:** `chrome://extensions` (ou `edge://extensions`) → remover tudo que não sabe para que serve; deixar só gerenciador de senhas e, se usar, bloqueador de anúncios conhecido (uBlock Origin Lite). Nunca instalar extensão por pedido de site, e-mail ou "suporte". *Conferir:* a lista tem no máximo 2 ou 3 extensões conhecidas.
- [ ] **Regra da casa contra golpes** (falar com todos, 10 minutos): ninguém do banco, Microsoft, Cloudflare ou "do sistema" liga pedindo código, senha ou para instalar AnyDesk/TeamViewer; boleto ou Pix recebido por WhatsApp/e-mail se confere no sistema antes de pagar; na dúvida, desliga e liga de volta no número do cartão. *Conferir:* cada usuário sabe repetir a regra.

**Backup**
- [ ] **Backup seguro cifrado numa segunda pasta:** no sistema (como administrador) → **Dados e backup → Backup seguro** → escolher uma pasta **fora** da pasta de dados e de preferência em **outra conta/disco** (ex.: pasta do OneDrive pessoal do dono só para isso, ou um disco externo que fica no cofre) → criar a **senha do backup** (gerar no gerenciador; sem ela ninguém abre o backup, nem você). *Conferir:* a pasta recebe um arquivo cifrado a cada alteração e, uma vez por semana, um backup completo; a senha está no gerenciador de senhas.
- [ ] **Teste de restauração a cada 3 meses** (também para o backup comum de `backups/`): criar uma pasta vazia `Teste-restauracao`, abrir o sistema (ou a versão sem internet) nela → Dados e backup → **Restaurar backup** → escolher o arquivo mais recente do backup seguro → digitar a senha → conferir que a lista de inquilinos e o total de boletos do mês batem com o sistema real → apagar a pasta de teste. *Conferir:* anotar a data do teste e "ok" no calendário (próximo: ______).

### Bloco 4 — Rotina (5 itens)

- [ ] **Todo mês (10 minutos):** sistema → **Usuários**: bloquear quem não usa há 60 dias; **Histórico**: passar o olho nas emissões/pagamentos do mês; `onedrive.com` → Gerenciar acesso da pasta: ninguém a mais. *Conferir:* anotar "feito" no calendário.
- [ ] **Todo mês (5 minutos, cada PC):** Windows Update "Você está atualizado"; Segurança do Windows todo verde; Chrome/Edge "está atualizado" (menu → Ajuda → Sobre). *Conferir:* três telas verdes.
- [ ] **A cada 3 meses:** teste de restauração do backup (Bloco 3); se a ponte existir, `node -v` e atualizar o Node LTS (`nodejs.org`); olhar os logs do Access (B1) ou as máquinas do Tailscale (B2). *Conferir:* data anotada.
- [ ] **A cada 6 meses:** trocar a senha da ponte e a do Web Banking; revisar a lista escrita de "quem tem a pasta / quem tem a senha da ponte / quem é usuário do Web Banking"; rever colaboradores e tokens do GitHub (Bloco 2). *Conferir:* lista atualizada com data.
- [ ] **Quando alguém sair da empresa (no mesmo dia):** bloquear no sistema (Usuários); remover da pasta do OneDrive (Gerenciar acesso); remover do Access/Tailscale; trocar a senha da ponte; remover do Web Banking do C6 (Múltiplos Acessos); pedir a devolução/formatação do notebook se for da empresa. *Conferir:* a pessoa não consegue mais abrir o sistema nem a pasta.
