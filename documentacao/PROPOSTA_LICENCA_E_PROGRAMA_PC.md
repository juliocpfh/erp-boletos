# Proposta: licença por chave e programa de PC sem arquivo de configuração (2026-11-15)

*Proposta para o dono aprovar. Nada disto foi feito no código ainda. Continua o [estudo do produto comercial](ESTUDO_PRODUTO_COMERCIAL.md) (gargalos 1 e 7). Os nomes de empresa, pessoa e chave são **fictícios**.*

**O pedido:** vender o sistema como se vende um antivírus. O cliente contrata, recebe uma chave, abre o programa, cola a chave, o sistema diz "vale até 20/01/2029" e pronto. Sem `.env`, sem chave do Cloudflare guardada numa pasta, sem o programa num lugar e a configuração em outro. E um gerador de chaves para o vendedor.

**A resposta curta:** dá para fazer, e o desenho fica assim:
- A **chave de licença** só diz que a empresa pagou e até quando. Ela não abre dados de ninguém.
- O **login** (e-mail + senha + código) diz quem está entrando. É ele que abre os dados, como hoje.
- O **programa de PC** é um instalador só. Na primeira vez a pessoa liga o programa à conta dela com um **código de 6 letras**, como se liga uma TV a um serviço de streaming. O programa guarda essa ligação sozinho, cifrada pelo Windows. Não sobra nenhum arquivo para editar.
- **Uma nuvem só para todos os clientes**, com um cofre separado para cada empresa (o cofre de hoje já é uma caixa isolada: basta ter um por cliente).
- Para o dono, **nada muda até lá**: o atualizador com `.env` continua funcionando (a chave de serviço vence em 08/11/2027). A primeira etapa (o programa de PC com código) já serve para o dono antes de existir qualquer outro cliente.

---

## 1. Chave de licença e login: são coisas diferentes

| | Chave de licença | Login |
|---|---|---|
| Responde a | "Esta empresa pagou? Até quando? Qual plano?" | "Quem é você? O que pode fazer?" |
| Quem tem | A empresa (o dono dela recebe por e-mail) | Cada pessoa da equipe, a sua |
| Exemplo | `IMOV-7K4Q-M9TX-2BHD-R8WC` | `maria@silvapatrimonial.com.br` + senha + código |
| Se vazar | Alguém poderia **tentar ativar** outra empresa com ela (só funciona uma vez; depois de usada, não serve mais). Não abre nenhum dado. | Abre os dados que essa pessoa pode ver. Por isso tem senha, código e papel (consulta/operador/administrador). |
| Quantas vezes se usa | Uma vez, na ativação (e de novo em cada renovação) | Todo dia |

**Por que a chave não pode abrir os dados:** uma chave é feita para ser copiada, colada, mandada por e-mail, passada para o contador. Se ela abrisse os dados, cada e-mail esquecido seria um vazamento de RG, CPF e contrato de inquilino (LGPD). Então:
- A chave serve para **criar** a empresa no sistema e para **estender** o prazo. Só isso.
- Depois de usada, ela fica "presa" àquela empresa. Colada de novo em outro lugar: "Esta chave já foi usada pela empresa Silva Patrimonial em 20/01/2027".
- Os dados continuam atrás do login, com papéis conferidos no servidor, como já é hoje (`nuvem/README.md`, Segurança).

**Exemplo:** a Silva Patrimonial Ltda (CNPJ de teste 11.222.333/0001-81) compra o plano de 2 anos em 20/01/2027. Recebe a chave `IMOV-7K4Q-M9TX-2BHD-R8WC`. Ativa no mesmo dia. A licença vale até **20/01/2029**. A Maria (administradora) e o João (operador) entram cada um com o seu e-mail. Se o João sair da empresa, a Maria o desativa em Usuários; a licença não muda.

### Como a chave é feita (para os desenvolvedores)
- O que o cliente digita é curto (25 letras e números, sem letras que confundem como O/0 e I/1) e é sorteado: não dá para "adivinhar" uma.
- No servidor de licenças, cada chave tem uma ficha: plano, duração (1, 2 ou 3 anos), limite de imóveis, quem vendeu, quando foi gerada, se já foi usada e por qual empresa, se foi revogada.
- Na ativação, o servidor devolve um **certificado de licença assinado** (assinatura digital Ed25519; a chave secreta que assina fica só no servidor de licenças). O sistema guarda esse certificado e confere a assinatura sozinho, **também sem internet** (versão PC e aplicativo instalado). Ninguém consegue "esticar" a data editando o certificado: a assinatura deixa de bater.
- Por que não pôr tudo dentro da chave (chave "auto-assinada", que confere sem servidor)? Fica comprida demais para digitar (60+ letras) e não dá para saber se ela já foi usada. Como o sistema já depende da nuvem, a chave curta + certificado assinado é o melhor dos dois.

---

## 2. O caminho do cliente

**Exemplo completo, com a Silva Patrimonial:**

| Quando | O que acontece |
|---|---|
| **20/01/2027** — compra | Paga o plano de 2 anos (pela página de venda, ou com o vendedor). Recebe um e-mail: "Sua chave: `IMOV-7K4Q-M9TX-2BHD-R8WC`. Para começar, abra `app.<marca>.com.br/ativar`". |
| **20/01/2027** — primeiro acesso | Na tela **Ativar**, cola a chave. O sistema responde: "Plano Anual ×2, até 100 imóveis, vale até 20/01/2029". Pede: nome e CNPJ da empresa, nome e e-mail do administrador. Manda um código para o e-mail (prova que o e-mail é dela). A Maria cria a senha. A empresa nasce com o cofre dela, vazio, e a Maria é a administradora. |
| Mesmo dia | A Maria cadastra a equipe em Usuários (o João recebe um convite por e-mail) e importa a planilha dos imóveis (ver estudo comercial, "importação"). Se quiser, instala o programa de PC (seção 3). |
| Uso | Dados e backup mostra: "Licença: Plano Anual ×2 · vale até 20/01/2029 · 87 de 100 imóveis". |
| **21/11/2028** (60 dias antes) | Aviso discreto no Painel e e-mail ao administrador: "Sua licença vence em 20/01/2029. Renove para não ficar só em leitura". |
| **21/12/2028** (30 dias) e **13/01/2029** (7 dias) | O mesmo aviso, mais visível. |
| **20/01/2029** — venceu | Começa a **carência de 15 dias**: tudo funciona, com uma faixa "Licença vencida em 20/01/2029. Renove até 04/02/2029". |
| **05/02/2029** — fim da carência | **Modo só leitura**: a equipe entra, vê tudo, imprime, baixa PDFs e anexos, **exporta tudo** (backup completo e planilhas). Não grava nada novo: não cria contrato, não lança pagamento, não emite NF nem boleto. Nada é apagado. |
| Qualquer dia — renovação | Compra a renovação, recebe uma chave nova (ex.: `IMOV-3RHX-...`), cola em **Dados e backup → Licença → Renovar**. O prazo **soma** ao que já tinha: renovou em 10/01/2029 por 1 ano → vale até **20/01/2030** (não perde os 10 dias). Renovou depois de vencer → conta da data da renovação. Volta a gravar na hora. |
| Se nunca renovar | Os dados ficam guardados e em só leitura por **12 meses** depois do vencimento (prazo a decidir; pergunta 4). Antes de apagar, 3 e-mails avisando, com o botão para baixar tudo. |

### Por que "só leitura" e nunca "trancado"
- Os dados são do cliente (contratos, comprovantes de inquilinos). Trancar tudo seria reter dados de terceiros: problema com a LGPD e com o Código de Defesa do Consumidor, além de péssimo para a reputação.
- Ele precisa continuar podendo provar um pagamento, achar um contrato ou entregar documentos ao contador mesmo sem renovar.
- O que trava é só o que gera trabalho novo. Isso já é motivo suficiente para renovar.

**Detalhe importante:** a trava fica **no servidor** (o cofre recusa gravações de empresa vencida), não só na tela. Quem mexer no navegador não consegue gravar.

### E sem internet?
O aplicativo instalado e a versão PC conferem o certificado assinado que guardaram. Se o certificado diz "até 20/01/2029", vale até lá também sem internet. Quem está sem internet há muito tempo e passou do vencimento cai no só leitura, como na nuvem. Isso não muda a regra 5 do sistema (sem internet = aplicativo instalado): só acrescenta a data.

---

## 3. O programa de PC: um instalador, sem arquivo para editar

### Como é hoje (o que incomoda)
O atualizador (`atualizador-pc/`) precisa de: Node.js instalado, a pasta copiada à mão, uma **chave de serviço** criada no painel do Cloudflare, uma política no Access, um segredo `SERVICOS` no Worker e um `.env` preenchido. Seis passos técnicos, e a chave fica num arquivo de texto que qualquer um com acesso ao computador lê. Para o dono serve; para vender, não.

### Como fica
1. **Baixa** `Instalar-Administracao-de-Imoveis.exe` (na página do sistema, em Dados e backup → Programa para o computador).
2. **Instala** com "Avançar, Avançar, Concluir". O instalador já traz tudo dentro (não precisa instalar Node.js), cria o ícone na Área de Trabalho e as tarefas do Windows (às 20h, ao entrar e de hora em hora para os arquivos, como hoje).
3. **Abre pela primeira vez.** Aparece uma janela:
   > Para ligar este computador à sua conta, entre em **app.&lt;marca&gt;.com.br/ligar** (em qualquer aparelho onde você já entrou) e digite o código:
   > **K7Q-4MZ** (vale por 10 minutos)
4. A Maria abre o sistema no celular ou no navegador (já está com login), vai em **Ligar um computador**, digita `K7Q-4MZ` e confirma: "Ligar o computador **ESCRITORIO-01** à Silva Patrimonial, com o acesso de Maria (administradora)?" → **Sim**.
5. Na janela do programa aparece: "Pronto. Ligado à Silva Patrimonial. Escolha a pasta do backup seguro" (ou cria uma em `Documentos\Administracao de Imoveis`) e pede a senha do backup seguro uma vez.
6. Pronto. Dali em diante ele trabalha sozinho, como hoje: dados cifrados do dia, versão PC e cópia aberta dos arquivos.

É o mesmo jeito que se liga uma TV ao streaming: a TV mostra um código, você digita no celular onde já está logado. Vantagem: **a senha da pessoa nunca é digitada no programa** e o código de 2 etapas fica no aparelho onde ela já entrou.

*(Alternativa: a pessoa digitar e-mail, senha e código direto na janela do programa. Funciona, mas o código de pareamento é mais seguro e mais simples. Recomendação: código de pareamento.)*

### O que o programa guarda, e onde
- Uma **credencial do aparelho** (um "crachá" só deste computador, sorteado pelo servidor). Ela fica no **Gerenciador de Credenciais do Windows**, cifrada pelo próprio Windows com a conta do usuário (DPAPI). Não é um arquivo na pasta, não aparece em texto, não vai para o OneDrive. Copiar a pasta para outro computador não leva o crachá.
- O crachá **só lê** (como a chave de serviço de hoje): baixa dados, versão PC e arquivos. Não grava nada.
- Ele aparece no sistema em **Usuários → Aparelhos ligados**: "ESCRITORIO-01 · ligado por Maria em 20/01/2027 · última vez hoje às 20:01". Botão **Desligar**: o crachá para de valer na hora (computador roubado, funcionário que saiu).
- Se a Maria for desativada, os aparelhos que ela ligou param também (mesma regra de hoje: o papel vale o do usuário).
- O crachá se renova sozinho a cada uso; um computador esquecido sem ligar por 90 dias precisa de um código novo.

### O que isso substitui
| Hoje | Depois |
|---|---|
| Chave de serviço do Cloudflare Access (criar, renovar todo ano, política "Service Auth") | Crachá do aparelho, criado pelo código, desligável em Usuários |
| Segredo `SERVICOS` no Worker, editado à mão no painel | Lista de aparelhos no cofre da empresa |
| `.env` com Client ID, Secret e pasta | Nada: credencial no Windows, pasta escolhida na janela |
| Instalar Node.js e copiar pasta | Um instalador |
| `instalar-tarefa.cmd` "como administrador" | O instalador cria as tarefas |

### Cuidados (para os desenvolvedores)
- Fluxo padrão "device authorization" (RFC 8628): o programa pede um código ao servidor, mostra, e fica perguntando a cada 5 s se já foi confirmado. Código de uso único, 10 minutos, limite de tentativas.
- Empacotar como executável único (Node "single executable application" ou similar) e **assinar o instalador** com certificado de assinatura de código; sem isso o Windows mostra "O Windows protegeu o computador" e o cliente desiste.
- Atualização do próprio programa: ele confere a versão no servidor e se atualiza (com o mesmo instalador assinado).
- A chave do backup seguro (`chave-do-backup.json`) continua na pasta, cifrada com a senha do backup, como hoje.

---

## 4. O gerador de chaves (painel do vendedor)

### Onde fica e quem entra
- Endereço próprio, separado do sistema dos clientes: **`vendas.<marca>.com.br`**.
- Atrás do **Cloudflare Access** (o mesmo de hoje), com a lista de e-mails do dono e dos vendedores. Aqui o Access é o certo: são poucas pessoas e é uma porta que não pode ficar aberta.
- Os dados das licenças ficam num **cofre próprio de licenças**, separado dos cofres dos clientes. O vendedor **nunca vê dados dos clientes** (inquilinos, contratos): só empresa, plano, datas e situação.
- A chave secreta que assina os certificados fica como segredo do Worker de licenças. Ninguém a vê, nem o vendedor.

### Papéis
| Papel | Pode |
|---|---|
| **Vendedor** | Gerar chaves dos planos liberados para ele; ver as chaves que gerou e se já foram usadas; reenviar o e-mail da chave |
| **Gerente** (o dono) | Tudo do vendedor, mais: ver todas as chaves e empresas; **revogar** chave; dar prazo extra (cortesia, ex.: +30 dias); criar e mudar planos; cadastrar vendedores |

### Gerar uma chave (exemplo)
Tela **Nova chave**: plano `Anual ×2` · duração `2 anos` · limite `100 imóveis` · cliente (opcional) `Silva Patrimonial` · e-mail `maria@silvapatrimonial.com.br` · observação `pedido 1043`. → **Gerar**.
Resultado: `IMOV-7K4Q-M9TX-2BHD-R8WC`, com os botões **Copiar** e **Mandar por e-mail**. Fica registrado: gerada por "Carlos (vendedor)" em 20/01/2027 10:14.

Uma chave não usada **vence em 90 dias** (chave esquecida numa gaveta não vale para sempre).

### Revogar
- **Chave ainda não usada** (ex.: mandada para o e-mail errado): Revogar → não ativa mais nada.
- **Licença já ativa** (ex.: pagamento estornado, fraude): Revogar → a empresa cai no **só leitura** (nunca apaga dados), com a mensagem "Licença suspensa. Fale com o suporte". O sistema confere a licença no servidor a cada abertura; quem estava sem internet cai no só leitura na próxima conexão.
- Toda revogação pede o motivo e fica no histórico.

### Lista e avisos
Tela **Licenças**: empresa, plano, vale até, imóveis em uso, vendedor, situação (ativa / vence em 30 dias / carência / só leitura / revogada). Filtro "vence nos próximos 60 dias" para o vendedor oferecer a renovação.

### Mais tarde: venda sem vendedor
Com uma página de venda e um meio de pagamento (Asaas ou Efí, que o estudo comercial já recomenda), o próprio pagamento gera a chave e manda o e-mail, sem ninguém apertar botão. O painel continua para venda direta, cortesias e revogações.

---

## 5. Infraestrutura: uma nuvem para todos ou uma por cliente

| | **A) Uma nuvem, um cofre por cliente** | **B) Uma nuvem inteira por cliente** |
|---|---|---|
| Como é | Um só Worker; cada empresa tem o seu cofre (Durable Object com nome = código da empresa) e a sua pasta no R2 (`clientes/<empresa>/arquivos/…`) | Uma conta (ou um Worker, um R2 e um cofre) do Cloudflare para cada cliente, e um endereço para cada um |
| Separação dos dados | Boa: cofres não se enxergam; o servidor escolhe o cofre pelo login, nunca pelo que o navegador pede | A maior possível |
| Cliente novo | Automático na ativação (segundos) | Montar à mão: Worker, R2, Access, DNS, variáveis (1 a 2 horas por cliente, sujeito a erro) |
| Atualizar o sistema | Um merge na `main` atualiza todos | Publicar em cada um (dá para automatizar, mas cada cliente pode ficar numa versão) |
| Custo | Quase zero até dezenas de clientes; um plano pago do Cloudflare (~US$ 5/mês) cobre muitos | Grátis por conta, mas o trabalho de manter cresce com cada cliente |
| Risco | Um erro de programa poderia misturar clientes: precisa de teste específico ("a Silva nunca lê o cofre da Souza") e revisão | Erro fica preso a um cliente |
| Login | Um login para todos (seção abaixo) | Um Access por cliente |

**Recomendação: A.** É o modelo de quase todo sistema vendido por assinatura, e o nosso já está meio caminho andado: o cofre de hoje é uma caixa isolada; hoje o Worker abre sempre a mesma (`idFromName('principal')`, `nuvem/worker.mjs`), e passaria a abrir a da empresa de quem entrou. B fica para um cliente grande que exija servidor só dele (pode-se cobrar a mais).

O dono vira **o cliente nº 1**: os dados de hoje vão para o cofre "ankjck", o endereço `erp.ankjck.com.br` continua abrindo direto nele.

### O login precisa mudar
Hoje quem barra a porta é o Cloudflare Access, com os 4 e-mails do dono digitados à mão no painel. Para vender isso não serve: cada usuário de cada cliente teria de ser posto à mão, e o plano grátis do Zero Trust tem limite de usuários (hoje 50; conferir na hora). Duas saídas:

1. **Login próprio no Worker** (recomendada): e-mail + senha + código de 2 etapas (por e-mail ou aplicativo autenticador), com sessão guardada num cookie que o navegador não deixa o JavaScript ler. A tela de login já existe (`auth.js`); falta o servidor conferir a senha (hoje é conferida no aparelho, um dos riscos anotados no `nuvem/README.md`). Resolve também esse risco.
2. Manter o Access liberado para "qualquer e-mail com código" e deixar o Worker decidir: mais rápido, mas esbarra no limite de usuários e no custo por usuário do plano pago.

O Access fica onde faz sentido: no painel do vendedor e no que for só do dono.

### Outras mudanças de infraestrutura
- Tirar "ANK/JCK" e "ANK Administradora" do código: nome, logo e cores vêm da empresa (já existe a logo e o ícone por empresa).
- Backups diários por empresa (`clientes/<empresa>/backups/`).
- A ficha pela internet (`ficha.ankjck.com.br`) vira `ficha.<marca>.com.br`, com a marca do cliente na página.
- Envio de e-mail: hoje pelo Gmail do dono; por cliente, pelo Gmail dele ou por um serviço de e-mail da marca.
- A ponte do C6 continua sendo outro assunto (estudo comercial, gargalo 3).

---

## 6. Etapas, em ordem

Tamanho: **P** = 1 PR pequena (um dia) · **M** = 2 a 4 PRs · **G** = 5 PRs ou mais.

| # | Etapa | Tamanho | Serve para o dono já? |
|---|---|---|---|
| 1 | **Programa de PC com código de pareamento**: crachá do aparelho no cofre, tela "Ligar um computador", "Aparelhos ligados" em Usuários, programa que guarda a credencial no Windows. Funciona ainda com o Access de hoje | M | **Sim**: aposenta o `.env` e a chave de serviço do dono |
| 2 | **Instalador único e assinado** (executável sem Node.js, tarefas criadas pelo instalador, atualização sozinha) | M | Sim |
| 3 | **Vários clientes**: cofre e pasta por empresa, Worker escolhe pelo login, testes de separação, sair dos nomes ANK/JCK; os dados do dono viram a empresa nº 1 | G | Indireto |
| 4 | **Login próprio** (senha conferida no servidor, código de 2 etapas, convites por e-mail, "esqueci a senha") | G | Sim (mais seguro) |
| 5 | **Licença**: servidor de licenças, tela Ativar, certificado assinado, avisos de vencimento, carência e só leitura conferidos no cofre, renovação | M | Não (o dono fica com licença sem prazo) |
| 6 | **Painel do vendedor**: gerar, listar, revogar, cortesia, vendedores | M | Não |
| 7 | **Venda sozinha**: página de venda + pagamento (Asaas/Efí) gerando a chave; termos de uso e LGPD (estudo comercial, fase 2) | M | Não |

A ordem 1 → 2 entrega primeiro o que o dono pediu para si (programa sem `.env`). 3 e 4 são a base de tudo que se vende; 5 e 6 dependem delas. 7 só quando houver o piloto com 2 ou 3 locadores.

### O que continua como está até lá
- O site, a nuvem, o login pelo Access com os 4 e-mails, os dados e os backups: **nada muda**.
- O atualizador com `.env` continua funcionando até a etapa 1 sair. A chave de serviço `atualizador-pc` vence em **08/11/2027**; se a etapa 1 atrasar, basta o **Refresh** no painel (o Cloudflare manda e-mail antes).
- Depois da etapa 1: instala-se o programa novo, liga-se com o código, e só então se apaga a chave de serviço, a política "Atualizador" no Access e o segredo `SERVICOS`.
- O dono nunca precisa de chave de licença para o próprio uso: a empresa nº 1 fica como "licença da casa", sem vencimento.

---

## 7. Perguntas para o dono

Cada uma com a recomendação. Responda item por item (como em `PENDENCIAS_DO_DONO.md`).

1. **Prazos e preços:** só 1, 2 e 3 anos, ou também mensal?
   *Recomendação:* mensal **e** anual. Locador pequeno prefere mensal (os concorrentes vendem assim: R$ 129 a R$ 229/mês); o anual com desconto (ex.: 12 meses pelo preço de 10) e 2/3 anos com mais desconto. A chave serve para os dois; no mensal a renovação é automática pelo pagamento.
2. **O plano limita o quê?** Imóveis, usuários ou os dois?
   *Recomendação:* **imóveis** (ex.: até 30, até 100, até 300), usuários à vontade. É o que o cliente entende e o que os concorrentes usam; limitar usuário leva a senha compartilhada, que é pior para a segurança.
3. **Teste grátis?**
   *Recomendação:* 30 dias, com uma chave de teste gerada pelo próprio site, até 10 imóveis. Ao virar cliente, cola a chave paga e os dados continuam.
4. **Venceu e não renovou: por quanto tempo os dados ficam guardados?**
   *Recomendação:* carência de 15 dias com tudo funcionando, depois só leitura e exportação por 12 meses, e só então apagar, com 3 avisos antes. Escrever isso no termo de uso.
5. **Uma chave vale para quantas empresas?** O dono tem ANK e JCK no mesmo sistema.
   *Recomendação:* uma chave = **um sistema** (um cofre), com quantas empresas (CNPJs) o cliente tiver dentro, como é hoje com ANK e JCK. O limite é o de imóveis.
6. **Quem são os vendedores e o que eles podem fazer?**
   *Recomendação:* começar só com o dono como gerente; vendedor só gera chaves dos planos liberados e vê as dele. Comissão fica fora do sistema no começo (a lista mostra quem vendeu cada chave).
7. **Marca e endereço do produto:** continuar com "ankjck" ou nome novo?
   *Recomendação:* nome e domínio novos para o produto (ex.: `app.<marca>.com.br`), sem ANK/JCK. `erp.ankjck.com.br` continua abrindo direto a empresa do dono.
8. **Uma nuvem para todos ou uma por cliente?**
   *Recomendação:* uma para todos, um cofre por cliente (seção 5, opção A).
9. **Login:** sair do Cloudflare Access para os clientes?
   *Recomendação:* sim, login próprio com código de 2 etapas (seção 5); o Access fica no painel do vendedor e no que é só do dono.
10. **Programa de PC: código de pareamento ou login na janela?**
    *Recomendação:* código de pareamento, e começar por ele já para o próprio dono (etapa 1).
11. **Assinar o instalador** (certificado de assinatura de código, custo anual de algumas centenas a pouco mais de mil reais, conforme o tipo; conferir preço na hora)?
    *Recomendação:* sim, antes do primeiro cliente de fora. Sem isso o Windows avisa que o programa "pode ser perigoso". Para o dono, dá para começar sem.
12. **O suporte pode ver os dados do cliente?**
    *Recomendação:* não, por padrão. Só com uma autorização que o administrador do cliente liga por tempo limitado (ex.: 48 horas), registrada no histórico. Isso entra no contrato de tratamento de dados (LGPD).
13. **Licença revogada por falta de pagamento:** só leitura na hora ou depois de um prazo?
    *Recomendação:* depois de 10 dias do vencimento da fatura, com aviso por e-mail no 1º e no 7º dia. Fraude comprovada: na hora.

---

## 8. Respostas do dono (15/11/2026)

Valem por cima do que está nas seções acima.

| # | Decisão |
|---|---|
| 1 | Mensal **e** anual (com 2 e 3 anos). A licença do dono é **ilimitada** (sem prazo e sem limites). |
| 2 | O plano limita o que mais pesa: **até 20 imóveis, até 20 inquilinos (contratos ativos) e até 4 usuários**. Planos maiores, se houver, seguem o mesmo molde. Avisar quando chegar perto (ex.: 18 de 20) e barrar só o cadastro novo, nunca o que já existe. |
| 3 | Teste grátis de 30 dias: **sim** (mesmos limites do plano básico). |
| 4 | Venceu: **15 dias com tudo funcionando**; depois só leitura e exportação; **os dados são apagados 3 meses depois do vencimento**, com avisos antes (ex.: vencida em 20/01/2029 → só leitura de 05/02/2029 → apagada em 20/04/2029; e-mails em 20/03, 05/04 e 15/04). Lembrar o cliente de que NF e comprovantes precisam ser guardados por 5 anos para o Fisco: é ele quem guarda, por isso o botão de exportar tudo fica sempre visível. |
| 5 | Uma chave vale para **no máximo 2 empresas (CNPJs)** dentro do mesmo sistema. |
| 6 | Vendedores como recomendado (no começo só o dono). |
| 7 | Por enquanto continua **ankjck**. Quando houver outras empresas, cada uma ganha um **endereço personalizado** (ex.: `imoveis.silvapatrimonial.com.br`). |
| 8 | Uma nuvem para todos, um cofre por cliente. |
| 9 | Login próprio: sim, o que for preciso para simplificar. |
| 10 | Programa de PC: **e-mail e senha** na janela do programa (no lugar do código de pareamento). O programa confere no servidor, recebe o "crachá" do aparelho e o guarda cifrado no Windows; a senha não fica guardada. Com o login próprio (etapa 4), pede também o código de confirmação. |
| 11 | Instalador **sem assinatura** no computador do dono; comprar o certificado **antes do primeiro cliente de fora** (explicação abaixo). |
| 12 | Suporte vê os dados só com liberação do cliente, por tempo limitado. |
| 13 | Ver o que a lei permite (abaixo); confirmar com advogado. |

### 11. Assinatura do instalador, explicada
Quando alguém baixa um programa da internet, o Windows olha quem o fez. Programa sem "assinatura" mostra a tela azul **"O Windows protegeu o computador — editor desconhecido"**, e a pessoa precisa clicar em "Mais informações → Executar assim mesmo". Para cliente comum isso parece vírus, e muitos desistem.

A assinatura é um **certificado de assinatura de código**, comprado de uma empresa certificadora (como o certificado digital da NF, mas para programas). Com ele, o instalador aparece como "Editor: ANKJCK Ltda" e o aviso some ou fica brando.

| Opção | Como é | Custo aproximado (conferir na hora) |
|---|---|---|
| Sem assinatura | Aviso azul toda vez que alguém instala | Zero |
| Certificado comum (OV) | Exige CNPJ e conferência da empresa (alguns dias). Desde 2023 vem num token físico ou guardado na nuvem da certificadora. O aviso some depois que o programa ganha "fama" com várias instalações | ~US$ 200 a 500 por ano |
| Assinatura na nuvem da Microsoft | Serviço por assinatura mensal; aceitação de empresa brasileira a conferir | ~US$ 10 por mês |

*Recomendação:* para o seu computador, sem assinatura (você sabe que o programa é seu). Antes do primeiro cliente de fora, contratar um dos dois pagos; a escolha entre eles se faz nessa hora, pelo preço e por aceitarem CNPJ brasileiro.

### 13. Travar quem não pagou: o que a lei permite (para confirmar com advogado)
- Não há lei específica para sistema por assinatura: vale o **contrato** (termo de uso). O Código Civil (art. 476) deixa uma parte não cumprir a sua enquanto a outra não cumpre a dela: quem não paga não pode exigir o serviço completo.
- Se o cliente for **pessoa física** (locador pessoa física), pode valer o **Código de Defesa do Consumidor**: precisa de cláusula clara, aviso antes de travar e nada de cobrança que constranja (art. 42). Empresa em geral não é consumidora, mas o juiz pode tratar como tal se ela for pequena e dependente.
- **Os dados são do cliente** (LGPD): não dá para segurar os dados como forma de cobrança. Ele tem direito de levá-los (art. 18, portabilidade); terminado o contrato, os dados devem ser apagados (art. 16), e o prazo de 3 meses precisa estar escrito no termo.
- *O que isso dá na prática (e é o que a proposta já faz):* aviso por e-mail antes; trava só para criar coisas novas, nunca para ver ou exportar; prazo de apagamento escrito no termo de uso; não cobrar para devolver os dados. Proposta de prazo: só leitura 10 dias depois do vencimento da fatura, com avisos no 1º e no 7º dia (fraude: na hora).

## Resumo para o desenvolvedor
- Licença: chave curta sorteada + ficha no cofre de licenças + certificado Ed25519 guardado no cliente; validade e plano conferidos no cofre da empresa (só leitura barrado no servidor) e no aparelho (sem internet).
- Programa de PC: device authorization (RFC 8628) → token de aparelho só de leitura, revogável, no cofre da empresa; guardado com DPAPI (Gerenciador de Credenciais); substitui `SERVICOS`/`emailDoServico` e a chave de serviço do Access.
- Multi-cliente: `idFromName(<empresa>)` no lugar de `'principal'` (`nuvem/worker.mjs`, `repassarAoCofre` e `exigirPapel`), prefixo `clientes/<empresa>/` no R2, empresa sempre tirada do login.
- Login: sessão no Worker (cookie `HttpOnly`, `Secure`, `SameSite=Strict`), senha conferida no servidor, 2 etapas.
