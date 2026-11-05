# Ligar o sistema ao banco C6 (quando as chaves chegarem)

Este guia é para o dia em que o C6 liberar o acesso à API de cobrança (boleto com Pix, o "Bolepix"). Ele explica o que pedir ao banco, onde guardar as chaves, como colocar a **ponte** para rodar e como ligar o sistema a ela.

**Por que existe uma "ponte"?** O C6 não aceita chamadas feitas direto pelo navegador: exige um certificado digital instalado no programa que chama (chamado mTLS). Por isso há um programa pequeno, em Node, na pasta `ponte-c6/`, que roda num computador ou servidor da empresa, guarda o certificado e conversa com o banco. O sistema (em `https://erp.ankjck.com.br`) fala com a ponte; a ponte fala com o C6.

```
Navegador (erp.ankjck.com.br)  →  Ponte (computador da empresa, com certificado)  →  C6 Bank
```

Faça as etapas na ordem. Cada uma termina com "Como saber se deu certo".

> Os nomes de pastas, arquivos e telas abaixo (`ponte-c6/credenciais/`, `.env.exemplo`, `/saude`, "modo SIMULADO", caixa do banco C6 em Dados e backup) são os combinados para a ponte. Se o programa final usar um nome um pouco diferente, o `ponte-c6/README` manda.

---

> Homologação: o C6 exige o preenchimento do "Roteiro de Testes – C6 Developers v3.0" (status e resposta de cada teste feito no sandbox), enviado para homologacaoapi@c6bank.com. Resumo dos testes e endpoints em `C6_ROTEIRO_HOMOLOGACAO.md`; a ponte guarda os registros de cada chamada para facilitar o preenchimento.

## Etapa 1 — O que pedir ao C6

O C6 tem dois caminhos, e os dois serão usados:

**A) Portal de desenvolvedores (`https://developers.c6bank.com.br`)** — para o ambiente de **testes (sandbox)** e a homologação. Pelo que o C6 publica, o fluxo é:

1. Cadastrar-se em `https://developers.c6bank.com.br/create-access` com os dados da empresa (CNPJ da PJ), área de atuação e produtos de interesse (marque **cobrança / boleto**; se quiser Pix e extrato, marque também: credenciais liberadas só para boleto podem não servir para outros produtos). Em "tipo", o entendimento do projeto é **Cliente Final** (a empresa usa o próprio sistema), não "Software House"/"Parceiro" (que é para quem vende sistema para terceiros). *Confirmar com o C6.*
2. O C6 envia **por e-mail** as credenciais de **teste**: `client_id`, `client_secret` e o certificado do sandbox. Guarde o e-mail e os anexos (Etapa 2).
3. Depois dos testes no sandbox, o C6 pede **evidências** (prints ou arquivos dos boletos de teste emitidos) para a **validação técnica**, e a assinatura de um **termo de responsabilidade**.
4. Com isso aprovado, o C6 **libera a produção**.

**B) Web Banking do C6 (a conta PJ de verdade)** — é onde se geram as chaves de **produção**. Segundo o guia do próprio C6:

1. Entrar no **Web Banking** (`https://www.c6bank.com.br/web-banking/`) com a conta PJ.
2. Na tela inicial, clicar nos **três pontos** do menu → **Integrações via API**.
3. **Criar chave**: dar um nome (ex.: `ponte imoveis`), marcar as **permissões** do produto **Boleto de cobrança** (as que o gerente contratou), confirmar com a senha e pelo **aplicativo** do celular.
4. A tela mostra o **Client ID** e o **Client Secret** e oferece o **arquivo do certificado** para baixar (um ZIP com o certificado `.crt` e a chave privada). **Salve na hora**: o C6 avisa que, se o arquivo não for salvo, é preciso criar outra chave, com outro certificado.

Observações:
- Nesse fluxo o **C6 gera o certificado** e entrega pronto; não é preciso gerar um "CSR" (pedido de certificado). Se o portal de desenvolvedores pedir um CSR para o sandbox, a ponte tem um comando para gerar (`ponte-c6/README`). *Confirmar com o C6.*
- **Validade do certificado**: o C6 não publica o prazo; integradores relatam que, ao vencer, basta baixar o certificado novo e trocar na ponte, sem mudar Client ID/Secret. Anote a data de validade (Etapa 5). *Confirmar com o C6.*
- **Pré-requisito**: a conta precisa ter a **cobrança (carteira de boletos) contratada** com o gerente. Sem isso o menu "Integrações via API" não mostra o produto Boleto.

**Uma chave por conta: ANK e JCK**

A chave é criada **dentro do Web Banking de cada conta**, então ANK e JCK terão cada uma o seu Client ID, Client Secret e certificado (e, no sandbox, possivelmente duas credenciais de teste também). A ponte foi feita para isso: uma pasta de credenciais por conta. Pergunte ao gerente:
- se uma única aplicação no portal pode cobrir os dois CNPJs ou se são dois cadastros;
- se a decisão de **emitir só pela ANK** (ver `DECISOES.md`, 2026-10-16) continua: nesse caso, a chave da JCK é opcional e pode ficar para depois.

### Como saber se deu certo

- Você tem, em mãos, para cada ambiente (sandbox e produção) e cada conta: **Client ID**, **Client Secret** e o **arquivo do certificado** (com a chave privada).
- Você sabe a **data de validade** do certificado e **quem é o contato** no C6 (gerente ou e-mail do suporte a desenvolvedores) para dúvidas.

---

## Etapa 2 — Onde guardar as chaves

Essas chaves equivalem a uma procuração para emitir boletos em nome da empresa. Regras:

- **Nunca** dentro do site (pasta `docs/`), nem no GitHub, nem na **pasta do OneDrive dos dados** (`imoveis-dados.json`, `arquivos/`): todo mundo que usa o sistema tem acesso a essa pasta.
- Elas moram **só no computador que roda a ponte**, na pasta `ponte-c6/credenciais/<conta>/`, que o Git ignora (não sobe para o GitHub).

Passos, no computador da ponte:

1. Dentro de `ponte-c6/credenciais/`, crie uma pasta por conta e ambiente, por exemplo:
   - `ponte-c6/credenciais/ank-sandbox/`
   - `ponte-c6/credenciais/ank/` (produção)
   - `ponte-c6/credenciais/jck-sandbox/` e `ponte-c6/credenciais/jck/` (se for usar a JCK)
2. Descompacte o ZIP do C6 e coloque dentro da pasta da conta o **certificado** (`.crt` ou `.pem`) e a **chave privada** (`.key` ou `.pem`), com os nomes que o `ponte-c6/README` indica.
3. Copie o arquivo `ponte-c6/.env.exemplo` para `ponte-c6/.env` (mesma pasta) e abra no Bloco de Notas. Preencha, para cada conta: `client_id`, `client_secret`, o caminho dos arquivos do certificado e o ambiente (`sandbox` ou `producao`). Preencha também a **senha da ponte** (invente uma senha longa, 20+ caracteres; ela é o que o sistema vai informar para a ponte aceitar os pedidos) e as **origens permitidas** (CORS): `https://erp.ankjck.com.br` (e, enquanto o endereço antigo estiver em uso, `https://juliocpfh.github.io`).
4. Guarde uma **cópia de segurança** das chaves e do `.env` em lugar fechado (pen drive no cofre, ou gerenciador de senhas da empresa com anexos). Se o computador da ponte quebrar, é isso que evita ter de pedir tudo de novo ao banco.
5. Confira que `credenciais/` e `.env` aparecem no `ponte-c6/.gitignore`. Se usar Git nesse computador, `git status` **não** pode listar esses arquivos.

### Como saber se deu certo

- `ponte-c6/.env` existe e tem as linhas de cada conta preenchidas; `ponte-c6/credenciais/<conta>/` tem o certificado e a chave.
- `git status` (na pasta do projeto) não mostra `.env` nem nada de `credenciais/`.
- Existe uma cópia de segurança fora do computador.

---

## Etapa 3 — Instalar o Node e rodar a ponte

O computador da ponte deve ficar **ligado** sempre que alguém for emitir boletos (um computador de escritório que fica ligado, um mini PC ou um servidor). Pode ser Windows, Linux ou Mac.

1. Instale o **Node.js** versão LTS: `https://nodejs.org` → botão de download (LTS) → instalador → avançar até o fim. No Windows, marque a opção de adicionar ao PATH (já vem marcada).
2. Abra um terminal (Windows: menu Iniciar → "PowerShell"). Digite `node -v` e Enter: deve aparecer a versão (ex.: `v22.x`).
3. Vá até a pasta do projeto (ex.: `cd C:\erp-boletos`) e rode a ponte **em modo SIMULADO** primeiro: no `.env`, deixe o ambiente como `simulado` (ou a variável indicada no README). Rode: `node ponte-c6/servidor.mjs`. No modo simulado a ponte **não chama o C6**: devolve boletos de brincadeira, para testar a ligação com o sistema sem gastar credencial nem emitir nada de verdade.
4. A tela do terminal deve mostrar algo como "Ponte C6 ouvindo em http://localhost:PORTA (modo SIMULADO)". Deixe essa janela aberta.
5. No navegador do mesmo computador, abra `http://localhost:PORTA/saude`. Deve aparecer uma resposta curta dizendo que a ponte está de pé, o modo (simulado/sandbox/produção) e as contas configuradas (sem mostrar as chaves).
6. Para a ponte **iniciar sozinha** com o computador (recomendado), siga o `ponte-c6/README` (no Windows, uma tarefa agendada "ao iniciar" ou um serviço; no Linux, `systemd`).
7. Para o sistema acessar a ponte de outros computadores, exponha-a com **Cloudflare Tunnel** em `https://banco.ankjck.com.br` (passos em `PUBLICAR_NO_DOMINIO.md`, seção "Para o futuro"). Se todo mundo usa a ponte no mesmo computador, `http://localhost:PORTA` serve.

### Como saber se deu certo

- `node -v` responde a versão.
- `http://localhost:PORTA/saude` (e, com o Tunnel, `https://banco.ankjck.com.br/saude`) responde "ok" com o modo SIMULADO.
- Depois de reiniciar o computador, `/saude` continua respondendo (se a inicialização automática foi configurada).

---

## Etapa 4 — Ligar o sistema à ponte e emitir o primeiro boleto

Agora no sistema, no navegador (como administrador).

1. Abra `https://erp.ankjck.com.br` → menu **Dados e backup** → caixa **Banco C6 (ponte)**.
2. Informe, **uma linha por conta** (ANK e, se houver, JCK):
   - **URL da ponte**: `https://banco.ankjck.com.br` (ou `http://localhost:PORTA` se for no mesmo computador). Sem barra no final.
   - **Senha da ponte**: a mesma que você escreveu no `.env`.
3. Clique em **Testar conexão**. Deve responder "Conectado — modo SIMULADO". Se der erro, veja a Etapa 6.
4. Com a ponte em modo simulado, vá a um inquilino, escolha um boleto em aberto e clique em **Emitir no C6**. Deve voltar um boleto "de brincadeira" (linha digitável e QR Code marcados como simulados). Isso prova que sistema e ponte conversam.
5. Agora mude a ponte para **sandbox**: no `.env`, troque o ambiente da conta ANK para `sandbox`, pare a ponte (Ctrl+C no terminal) e rode de novo. **Testar conexão** no sistema deve dizer "modo SANDBOX".
6. Emita **um boleto de teste** no sandbox: use um inquilino de teste (CPF de teste `529.982.247-25`) com valor baixo (ex.: R$ 10,00) e vencimento daqui a 5 dias. Confira os campos que o C6 limita (nome até 40 letras, rua+número até 40, bairro/cidade até 40, UF 2, CEP 8 números, sem barra "/"): o sistema avisa antes de enviar se algum passar. Guarde o print e o PDF: são as **evidências** para a homologação do C6 (Etapa 1-A, passo 3).
7. Quando o C6 liberar a **produção**: troque no `.env` o ambiente para `producao`, aponte para os arquivos do certificado de produção, reinicie a ponte. **Testar conexão** deve dizer "modo PRODUÇÃO".
8. Emita **um** boleto real de valor pequeno para um inquilino de verdade (ou para a própria empresa) e **pague-o** pelo Pix do QR Code. Confirme no sistema que ele aparece como pago (ou registre o pagamento manualmente, se a baixa automática ainda não existir) e no extrato do C6 que o dinheiro entrou.
9. Só então emita os boletos do mês.

### Como saber se deu certo

- **Testar conexão** mostra "Conectado" e o modo esperado para cada conta.
- No sandbox: o boleto de teste voltou com linha digitável e QR Code e aparece no painel do sandbox do C6 (se houver).
- Em produção: o boleto pequeno foi pago e o valor entrou na conta certa (ANK ou JCK).
- No **Histórico** do sistema aparece quem emitiu cada boleto.

---

## Etapa 5 — Checklist de segurança

Marque cada item antes de usar em produção:

- [ ] **HTTPS entre sistema e ponte**: a URL da ponte começa com `https://` (Cloudflare Tunnel) quando for acessada de fora do computador. `http://` só para `localhost`.
- [ ] **Senha da ponte forte** (20+ caracteres, gerada por gerenciador de senhas) e diferente de qualquer outra senha. Troque-a se alguém que a conhecia sair da empresa.
- [ ] **Login do Cloudflare Access** na frente de `banco.ankjck.com.br` (só e-mails da empresa), além da senha da ponte.
- [ ] **Firewall** do computador da ponte ligado; a porta da ponte **não** está aberta no roteador (o Tunnel não precisa). A ponte só escuta em `localhost`.
- [ ] **Computador da ponte** com senha de login, atualizações automáticas e antivírus; de preferência não é o computador de uso diário de ninguém.
- [ ] **Backup das chaves** (certificados, `.env`, Client ID/Secret) em local fechado, fora do computador da ponte. Testado: dá para restaurar.
- [ ] **Validade do certificado** anotada na agenda com lembrete 30 dias antes (data: ______ ANK / ______ JCK). Ao vencer, baixar o novo no Web Banking → Integrações via API e trocar na pasta `credenciais/`; Client ID/Secret em geral continuam (*confirmar com o C6*).
- [ ] **Quem tem acesso**: lista escrita de quem conhece a senha da ponte, quem tem acesso ao computador da ponte e quem é usuário do Web Banking com permissão de criar chaves. Revisar a cada 6 meses e quando alguém sair.
- [ ] **Permissões mínimas** na chave do C6: só o que a ponte usa (emitir/consultar/cancelar boleto). Nada de transferência ou pagamento.
- [ ] **Sandbox antes de produção**, sempre que algo mudar na ponte (nova versão, novo certificado).
- [ ] **Repositório limpo**: `git status` nunca mostra `.env` ou `credenciais/`. Se um dia uma chave vazar para o Git, trate como vazada: gere outra no Web Banking e apague a antiga lá.

---

## Etapa 6 — Se der erro

| Mensagem no sistema (ou no terminal da ponte) | Causa provável | O que fazer |
|---|---|---|
| "Não foi possível conectar à ponte" / "Failed to fetch" | A ponte não está rodando; URL errada; Tunnel caído; ou CORS. | Abra a URL da ponte + `/saude` no navegador. Se não abre: inicie a ponte (`node ponte-c6/servidor.mjs`) e confira o Tunnel (Zero Trust → Tunnels: **Healthy**). Se abre mas o sistema falha: F12 → Console; "blocked by CORS policy" significa que `https://erp.ankjck.com.br` não está nas origens permitidas do `.env`. |
| "Senha da ponte inválida" (401) | A senha digitada no sistema é diferente da do `.env`. | Conferir as duas (sem espaços no fim). Reiniciar a ponte depois de mudar o `.env`. |
| "Conta não configurada" (ex.: JCK) | O `.env` não tem as linhas dessa conta. | Preencher ou usar só a ANK. |
| "Falha ao autenticar no C6" / `invalid_client` | Client ID/Secret errados, ou do ambiente trocado (sandbox × produção). | Conferir se as credenciais são do mesmo ambiente configurado. Copiar de novo, sem espaços. |
| "Certificado recusado" / `handshake failure` / `certificate expired` / `unable to get local issuer` | Certificado vencido, do ambiente errado, ou arquivo de chave não corresponde ao certificado. | Conferir validade e ambiente. Baixar um certificado novo no Web Banking (Integrações via API) e trocar na pasta `credenciais/`. |
| "Campo X com mais de 40 caracteres" / "caractere '/' não permitido" | Limites do C6 (ver `DECISOES.md` 2026-10-16). | Encurtar o cadastro do inquilino/imóvel (ex.: "Av." em vez de "Avenida", tirar complemento longo) e emitir de novo. O sistema não corta sozinho de propósito. |
| "Boleto já existe para esta competência" | Tentativa de emitir duas vezes o mesmo mês. | Abrir o boleto já emitido (Ver boleto) ou cancelar antes de reemitir. |
| C6 responde 403 / "produto não contratado" | A chave não tem a permissão de Boleto de cobrança, ou a carteira não foi contratada. | Falar com o gerente; refazer a chave marcando a permissão. |
| C6 responde 429 / "limite de requisições" | Muitas emissões em pouco tempo. | Esperar 1 minuto e continuar; emitir em lotes menores. |
| C6 responde 5xx / `timeout` | Problema no banco ou na internet do computador da ponte. | Esperar e tentar de novo. Se persistir por horas, contatar o suporte do C6 (é bom ter o horário e a mensagem exata). |
| Boleto emitido mas o PDF/QR não aparece | Resposta do C6 veio sem o arquivo, ou o sistema não conseguiu gravar o anexo na pasta de dados. | Clicar em "Baixar de novo" no boleto; conferir se a pasta de dados está acessível (OneDrive sincronizado). |

Quando pedir ajuda (ao suporte do C6 ou a quem mantém o sistema), mande: a mensagem **exata**, a hora, o ambiente (simulado/sandbox/produção), a conta (ANK/JCK) e as últimas linhas do terminal da ponte. **Nunca** mande o `.env`, o Client Secret ou a chave privada.

---

## Fontes

Oficiais do C6 Bank:
- Portal de desenvolvedores — https://developers.c6bank.com.br (cadastro: https://developers.c6bank.com.br/create-access)
- "Integre seu sistema com as APIs do C6 Bank" (as 5 etapas: cadastro no portal, credenciais de teste, evidências, termo de responsabilidade, produção) — https://www.c6bank.com.br/apis-integracao/
- "Guia de ativação das APIs do C6 Bank" (Web Banking → três pontos → Integrações via API → criar chave → Client ID, Client Secret e certificado) — https://www.c6bank.com.br/blog/guia-ativacao-apis-c6-bank
- "Integração via API do C6 Bank" (homologação: sandbox, certificação, validação) — https://www.c6bank.com.br/blog/api-c6-bank

De integradores (não oficiais; usadas só para confirmar o formato das credenciais e a renovação do certificado):
- Omie — Configurando a integração com o C6 Bank — https://ajuda.omie.com.br/pt-BR/articles/17059704-configurando-a-integracao-com-o-c6-bank-boleto-pix-via-api
- TecnoSpeed — 336 C6 — https://atendimento.tecnospeed.com.br/hc/pt-br/articles/36889380237463-336-C6
- PlugBoleto/Soften — API C6 Bank — https://docs.softensistemas.com.br/books/configuracao-plugboleto-gerencieaqui/page/api-c6-bank

O que **não** está documentado publicamente pelo C6 e deve ser **confirmado com o C6** (gerente ou suporte do portal): prazo de validade do certificado e procedimento de renovação; se o sandbox exige CSR ou entrega certificado pronto; se um cadastro no portal cobre dois CNPJs (ANK e JCK); os endereços (hosts) exatos de sandbox e produção da API de cobrança; limites de requisições.
