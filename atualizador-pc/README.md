# Atualizador da versão PC

Programinha que roda **no computador do administrador**, sozinho (pelo Agendador de Tarefas do Windows, como o Windows Update), e mantém a pasta do **backup seguro** em dia com a nuvem: todo dia às 20h e ao entrar no Windows ele baixa os dados como estão na nuvem naquele momento e, se o site publicou uma versão nova do programa, a **versão PC** também.

**Para que serve?** O sistema já grava na pasta do backup seguro a cada alteração, mas só quando está aberto neste computador. Nos dias em que o sistema foi usado só no celular, é o atualizador que traz as mudanças para cá. Resultado: se o site ou o Cloudflare saírem do ar, a versão PC abre com os dados do último dia, sem internet.

Tudo que ele grava é cifrado com a mesma chave do backup seguro: sem a senha do backup, ninguém lê nada na pasta.

## Como ele entra na nuvem: o "crachá do aparelho" (desde 15/11/2026)

O computador entra **com o e-mail e a senha do sistema**, uma vez só (decisão do dono, `documentacao/PROPOSTA_LICENCA_E_PROGRAMA_PC.md`, seção 8, item 10). A nuvem confere a senha e entrega um **crachá** só deste computador:

- O crachá **só lê** (dados, arquivos e versão PC): não grava nada no sistema.
- Vale o acesso de quem ligou: se essa pessoa for bloqueada em Usuários, o computador para também.
- Aparece no sistema em **Usuários → Aparelhos ligados** (computador, quem ligou, quando, última vez), com o botão **Desligar** (computador roubado, funcionário que saiu): para na hora (nos arquivos, em até 1 minuto).
- Computador que passa **90 dias** sem rodar precisa ser ligado de novo.
- A **senha não fica guardada**. O crachá fica cifrado pelo Windows (DPAPI, só esta conta deste computador abre) em `%LOCALAPPDATA%\Administracao de Imoveis\cracha.dat`, ao lado de `config.json` (site, pasta e nome do computador). Fora do OneDrive; copiar a pasta para outro computador não leva o crachá.
- Errou a senha 5 vezes: espera 15 minutos.

Não precisa mais de chave de serviço do Cloudflare, de `.env` nem do segredo `SERVICOS`.

**Por que uma página no navegador?** É o jeito mais simples sem instalar nada além do Node: o programa abre no navegador uma página que só existe neste computador (`http://127.0.0.1:<porta>/<código sorteado>`; outro site ou outro computador não chega nela), com os campos e-mail, senha, nome do computador e a pasta (botão **Escolher…** abre a janela de pastas do Windows). Quando liga, a página diz "Pronto" e pode ser fechada.

## O que precisa ter

- [Node.js](https://nodejs.org) (versão 20 ou mais nova). Nada mais.
- O backup seguro já ligado neste computador (Dados e backup → Backup seguro): a pasta escolhida tem o arquivo `chave-do-backup.json`.
- Na nuvem, a regra **Bypass** do caminho `/api/aparelho` no Cloudflare Access (uma vez só, feita pelo dono: passo a passo em `nuvem/README.md`, "Programa do PC"). Sem ela a página avisa: *"falta a regra Bypass"*.

## Passo a passo (computador novo)

1. Copie a pasta `atualizador-pc` para o computador (ex.: `C:\Imoveis\atualizador-pc`).
2. Clique com o botão direito em `instalar-tarefa.cmd` → **Executar como administrador**: cria as tarefas no Windows e roda a primeira atualização. Como o computador ainda não está ligado, abre a página de ligar no navegador: e-mail e senha do sistema, a pasta do backup seguro → **Ligar**. Em seguida aparece `Atualizado: imoveis-dados-AAAA-MM-DD.bkp …`.
3. Confira no sistema: **Usuários → Aparelhos ligados** mostra o computador.

Para ligar de novo (depois de Desligar, de 90 dias parado, ou para trocar de usuário): dois cliques em `ligar-computador.cmd`. Para rodar na mão a qualquer hora: `node atualizador.mjs`. Para desfazer as tarefas: `desinstalar-tarefa.cmd`.

## Para quem já usava o jeito antigo (chave de serviço + `.env`)

1. Copie por cima os arquivos novos (`atualizador.mjs`, `ligar.mjs`, `ligar-computador.cmd`). Até ligar, ele continua funcionando com o `.env` de antes.
2. Dois cliques em `ligar-computador.cmd` e entre com e-mail e senha (a pasta já vem preenchida com a do `.env`). Dali em diante o crachá passa na frente do `.env`.
3. Confira `ultima-atualizacao.txt` no dia seguinte (`ok …`). Só então apague: o arquivo `.env` desta pasta; no Cloudflare, a chave de serviço `atualizador-pc` (Zero Trust → Access controls → Service credentials), a política "Atualizador" do aplicativo "Sistema de Imoveis" e o segredo `SERVICOS` do Worker (Workers & Pages → `erp-boletos` → Settings → Variables and secrets). A nuvem continua aceitando a chave de serviço até lá.

## Cópia aberta dos arquivos (desde 15/11/2026)

Além dos dados cifrados, o atualizador mantém na pasta do backup seguro a subpasta **`Arquivos dos imoveis`**: os arquivos do sistema **sem cifrar**, como estão na nuvem (imóvel → Inquilinos → pessoa), para abrir, imprimir e copiar direto no Windows. Ela é só para consulta: o que for posto ou mudado lá não volta para o sistema. A cada vez ele baixa só o que é novo ou mudou e tira da cópia o que foi apagado no sistema (arquivo apagado à mão na cópia volta). O registro fica em `copia-aberta.json`.

- Todo dia às 20h e ao entrar no Windows: dados, versão PC e arquivos.
- **De hora em hora**: só os arquivos (`node atualizador.mjs --arquivos`, pela tarefa "Imoveis - copia dos arquivos (de hora em hora)", que roda escondida por `rodar-escondido.vbs`, sem janela preta; escondida, ela nunca abre a página de ligar: só registra o erro).
- O sistema aberto neste computador também atualiza a cópia logo depois de anexar, apagar ou mover arquivos, e no botão **Atualizar a pasta agora** (Dados e backup → Backup seguro).

## Como saber se está funcionando

- Na pasta do backup seguro, `ultima-atualizacao.txt` tem a data e o resultado da última execução (`ok` ou `FALHOU` com o motivo). "Não está mais ligado ao sistema" = foi desligado em Usuários ou ficou 90 dias parado: `ligar-computador.cmd`.
- Em `copias-diarias/` aparece um arquivo por dia (`imoveis-dados-AAAA-MM-DD.bkp`, ficam 60); em `programa/`, a versão PC (`administracao-imoveis.html`) e a versão dela (`versao.txt`).
- No sistema: **Usuários → Aparelhos ligados → Última vez**.
- No Windows: Agendador de Tarefas → "Imoveis - atualizador da versao PC" → Histórico.

## Quando o site cair

Abra `programa/administracao-imoveis.html` (na pasta do backup seguro) com dois cliques, no Chrome ou no Edge. Em **Restaurar backup seguro**, escolha a cópia do dia em `copias-diarias/`, digite a senha do backup e mande abrir numa pasta: o sistema abre inteiro, com os dados daquela cópia, e você pode trabalhar. Quando o site voltar, em **Dados e backup → Substituir os dados da nuvem pelos de uma pasta** você manda o que fez para a nuvem.

## Segurança

- O crachá só lê e só funciona nesta conta do Windows (DPAPI). Quem usa este computador com a sua conta consegue rodar o atualizador: proteja o Windows com senha. Computador perdido: **Desligar** em Usuários.
- A porta `/api/aparelho/` fica fora do login do Access, por isso: só entra quem sabe e-mail e senha de um usuário ativo (5 erros por e-mail, 10 por endereço de internet ou 50 no total = espera), o crachá é sorteado (256 bits) e a nuvem guarda só o resumo (hash) dele. As outras rotas da nuvem continuam exigindo o Access.
- A versão PC vem do GitHub (o repositório é público; é o próprio programa, sem dados), buscada pela nuvem.

## Falta (etapa 2 da proposta)

- **Instalador `.exe` assinado** (sem instalar o Node, "Avançar, Avançar, Concluir", cria as tarefas sozinho, ícone na Área de Trabalho e atualização do próprio programa). Até lá: Node + esta pasta + `instalar-tarefa.cmd`. A assinatura do instalador (certificado de assinatura de código) ainda espera a decisão do dono (proposta, seção 8, item 11).
- Com o login próprio (etapa 4), a página de ligar pede também o código de confirmação.
