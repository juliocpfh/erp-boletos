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
