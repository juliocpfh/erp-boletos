# Atualizador da versão PC

Programinha que roda **no computador do administrador**, sozinho (pelo Agendador de Tarefas do Windows, como o Windows Update), e mantém a pasta do **backup seguro** em dia com a nuvem: todo dia às 20h e ao entrar no Windows ele baixa os dados como estão na nuvem naquele momento e, se o site publicou uma versão nova do programa, a **versão PC** também.

**Para que serve?** O sistema já grava na pasta do backup seguro a cada alteração, mas só quando está aberto neste computador. Nos dias em que o sistema foi usado só no celular, é o atualizador que traz as mudanças para cá. Resultado: se o site ou o Cloudflare saírem do ar, a versão PC abre com os dados do último dia, sem internet.

Tudo que ele grava é cifrado com a mesma chave do backup seguro: sem a senha do backup, ninguém lê nada na pasta.

## Como ele entra na nuvem: o "crachá do aparelho" (desde 15/11/2026)

O computador entra **com o e-mail e a senha do sistema**, uma vez só (decisão do dono, `documentacao/PROPOSTA_LICENCA_E_PROGRAMA_PC.md`, seção 8, item 10). A conta da senha é feita neste computador, igual ao site (a senha em si não viaja: a nuvem manda o sal, recebe só o resumo e compara); conferido, a nuvem entrega um **crachá** só deste computador:

- O crachá **só lê** (dados, arquivos e versão PC): não grava nada no sistema.
- Vale o acesso de quem ligou: se essa pessoa for bloqueada em Usuários, o computador para também.
- Aparece no sistema em **Usuários → Aparelhos ligados** (computador, quem ligou, quando, última vez), com o botão **Desligar** (computador roubado, funcionário que saiu): para na hora (nos arquivos, em até 1 minuto).
- Computador que passa **90 dias** sem rodar precisa ser ligado de novo.
- A **senha não fica guardada**. O crachá fica cifrado pelo Windows (DPAPI, só esta conta deste computador abre) em `%LOCALAPPDATA%\Administracao de Imoveis\cracha.dat`, ao lado de `config.json` (site, pasta e nome do computador). Fora do OneDrive; copiar a pasta para outro computador não leva o crachá.
- Errou a senha 5 vezes: espera 15 minutos. Programa antigo (de antes de 15/11/2026) não entra mais ("este programa do computador é antigo"): baixe o novo.

Não precisa mais de chave de serviço do Cloudflare, de `.env` nem do segredo `SERVICOS`.

**Por que uma página no navegador?** É o jeito mais simples sem instalar nada além do Node: o programa abre no navegador uma página que só existe neste computador (`http://127.0.0.1:<porta>/<código sorteado>`; outro site ou outro computador não chega nela), com os campos e-mail, senha, nome do computador e a pasta (botão **Escolher…** abre a janela de pastas do Windows). Quando liga, a página diz "Pronto" e pode ser fechada.

## O programa num arquivo só: `Instalar-Administracao-de-Imoveis.exe` (desde 15/11/2026, etapa 2)

Não precisa mais instalar o Node nem copiar esta pasta: o `.exe` traz tudo dentro (uns 90 MB) e faz o que os `.cmd` e o `.vbs` faziam.

**Passo a passo do dono (uns 5 minutos):**

1. Baixe `Instalar-Administracao-de-Imoveis.exe` em https://github.com/juliocpfh/erp-boletos/releases/tag/programa-pc (o GitHub gera um novo a cada mudança do programa).
2. Dois cliques. O Windows mostra o aviso azul **"O Windows protegeu o computador"** (o programa ainda não tem assinatura): **Mais informações → Executar assim mesmo**.
3. A janela preta mostra os 3 passos: cria as tarefas (se o Windows perguntar "Deseja permitir?", responda **Sim**), liga o computador (se ainda não está ligado, abre a página do navegador: e-mail, senha e a pasta do backup seguro → **Ligar**) e faz a primeira atualização. No fim aparece **Pronto** e "Aperte Enter para fechar".
4. Confira: `ultima-atualizacao.txt` na pasta do backup seguro com `ok`, e no sistema **Usuários → Aparelhos ligados**.

O que ele faz ao instalar: copia a si mesmo para `%LOCALAPPDATA%\Administracao de Imoveis\programa\Administracao-de-Imoveis.exe` (ao lado do crachá; o arquivo baixado pode ser apagado) e cria as **mesmas três tarefas** de antes, com os mesmos nomes: quem já tinha o jeito do Node tem as tarefas trocadas sozinho, e o computador já ligado continua ligado (não pede a senha de novo). Depois disso a pasta `atualizador-pc` antiga e o Node podem sair do computador.

| Para | Rode (na pasta `programa` acima, ou o arquivo baixado) |
|---|---|
| Ligar de novo (depois de Desligar ou de 90 dias parado) | `Administracao-de-Imoveis.exe --ligar` (ou dois cliques de novo) |
| Atualizar agora | `Administracao-de-Imoveis.exe --atualizar` (só os arquivos: `--arquivos`) |
| Desinstalar (pergunta antes; o mesmo de Configurações do Windows → Aplicativos instalados) | `Administracao-de-Imoveis.exe --desinstalar` |
| Abrir no Explorer a pasta `Arquivos dos imoveis` (o que o botão do sistema chama) | `Administracao-de-Imoveis.exe --abrir-pasta` |
| Ver a versão / a ajuda | `--versao` / `--ajuda` |
| Ver o que a instalação (ou a desinstalação) faria, sem mexer em nada | `--instalar --simular` (`--desinstalar --simular`) |

**Ele se atualiza sozinho** (desde 17/11/2026): todo dia às 20h e ao entrar no Windows, depois dos dados, o programa confere na release `programa-pc` do GitHub o aviso `programa-pc.json` (versão, tamanho e SHA-256). Se saiu versão nova, baixa o `.exe` para `Administracao-de-Imoveis.novo.exe`, confere tamanho, SHA-256 e que abre (`--versao` responde a versão anunciada) e só então troca: o atual vira `Administracao-de-Imoveis.velho.exe` (o Windows deixa renomear o programa em uso) e o novo toma o lugar. A versão nova vale a partir da rodada seguinte, que apaga o `.velho.exe`. Nunca volta para uma versão mais velha; arquivo que não confere é apagado e o programa continua o mesmo. O resultado fica na linha `programa do PC: …` de `ultima-atualizacao.txt`, e a versão de cada computador aparece no sistema em **Usuários → Aparelhos ligados** (coluna Programa; "antiga" = programa de antes de 17/11, que precisa ser baixado uma última vez). Código: `se-atualizar.mjs`; testes: `tests/programa-pc-se-atualizar.test.mjs`. Para testar a troca de verdade no Windows, `IMOVEIS_URL_RELEASE=http://127.0.0.1:<porta>/` aponta a release para um servidor deste computador (outro endereço é ignorado).

Para trocar à mão (ou num computador com o programa de antes de 17/11): baixe e dê dois cliques de novo (ele se copia por cima).

Para gerar o `.exe` na mão (Windows, com Node 24): `node tools/gerar-exe.mjs` → `atualizador-pc/dist/` (fora do repositório). É o próprio `node.exe` com `programa.mjs` dentro (Node "single executable application": esbuild + `--experimental-sea-config` + postject). No GitHub: `.github/workflows/programa-pc.yml`. Gera também `programa-pc.json` (o aviso de versão nova que os computadores conferem). Testes: `tests/programa-pc.test.mjs` e `tests/programa-pc-se-atualizar.test.mjs`.

## O que precisa ter (jeito antigo, com o Node)

- [Node.js](https://nodejs.org) (versão 20 ou mais nova). Nada mais.
- O backup seguro já ligado neste computador (Dados e backup → Backup seguro): a pasta escolhida tem o arquivo `chave-do-backup.json`.
- Na nuvem, a regra **Bypass** do caminho `/api/aparelho` no Cloudflare Access (uma vez só, feita pelo dono: passo a passo em `nuvem/README.md`, "Programa do PC"). Sem ela a página avisa: *"falta a regra Bypass"*.

## Passo a passo com o Node (computador novo; com o `.exe`, veja acima)

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

### Botão "Abrir a pasta no Explorer" (desde 17/11/2026, só com o `.exe`)

Em Dados e backup → Backup seguro → "Cópia aberta dos arquivos" (só no computador com Windows; não aparece no celular) há o link **Abrir a pasta no Explorer** (`imoveis-pasta:abrir`) e o botão **Copiar o caminho**. O navegador não deixa um site abrir pastas do computador, então o link chama este programa por um endereço próprio, `imoveis-pasta:`:

- **Onde fica registrado:** `HKCU\Software\Classes\imoveis-pasta` (só para o usuário do Windows, sem pedir administrador), apontando para `wscript.exe "<pasta programa>\abrir-pasta.vbs"`, que roda `Administracao-de-Imoveis.exe --abrir-pasta` sem janela. O `.exe` registra ao instalar (dois cliques ou `--instalar`) e de novo em cada rodada (`--atualizar`, `--arquivos`, `--ligar`): quem já tinha o programa ganha o botão ao trocar o `.exe`. `--desinstalar` tira o registro. `--instalar --simular` mostra os comandos do `reg` sem mexer em nada. Pelo Node (jeito antigo) não há botão.
- **Segurança:** o comando registrado não leva o endereço (sem `%1`), o `.vbs` não repassa argumento nenhum e `--abrir-pasta` ignora todo o resto: qualquer site que chame `imoveis-pasta:` só consegue abrir a pasta `Arquivos dos imoveis` deste computador (a do backup seguro guardada em `config.json`; sem a cópia ainda, a própria pasta do backup seguro). Nunca outro caminho, nunca outro comando. Sem o computador ligado, aparece uma janelinha dizendo para abrir o programa.
- **Primeira vez:** o Chrome pergunta se pode abrir o programa: marque "Sempre permitir" e clique em Abrir.
- **Caminho na tela:** o navegador só sabe o nome da pasta; o caminho inteiro vem do registro `copia-aberta.json` (campo `caminho_no_pc`, gravado pelo programa; o site mantém o que o programa gravou).

## Desinstalar (desde 17/11/2026, só com o `.exe`)

Dois jeitos, os dois chegam ao mesmo `Administracao-de-Imoveis.exe --desinstalar`:

1. **Configurações do Windows → Aplicativos → Aplicativos instalados → Administração de Imóveis → Desinstalar**, como qualquer programa. O `.exe` se registra ali ao instalar e de novo em cada rodada (como o botão da pasta), só para o usuário do Windows, sem administrador: `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\AdministracaoDeImoveis`, com `DisplayName` "Administração de Imóveis", `DisplayVersion` (a do `.exe`), `Publisher`, `DisplayIcon` (o `icone.ico` ao lado do `.exe`: casinha branca no quadrado azul, gravado em cada rodada; o `.exe` em si continua com o ícone do Node; desenho em `tools/gerar-icone-pc.mjs`, que gera `icone.mjs`), `InstallLocation` (a pasta `programa`), `EstimatedSize` (em KB), `NoModify`/`NoRepair` = 1 e `UninstallString` = `"<pasta programa>\Administracao-de-Imoveis.exe" --desinstalar` (o caminho tem espaço: vai entre aspas).
2. **No sistema:** Dados e backup → Backup seguro → **Programa deste computador** → **Desinstalar o programa deste computador** (só no computador com Windows; não aparece no celular). O link `imoveis-desinstalar:confirmar` chama, pelo mesmo esquema do botão da pasta, `HKCU\Software\Classes\imoveis-desinstalar` → `wscript.exe "<pasta programa>\desinstalar.vbs"` → o `.exe` com `--desinstalar` e nada mais (sem `%1`, o `.vbs` não repassa argumento nenhum e `--desinstalar` com argumento a mais é recusado).

**O que o `--desinstalar` faz:** primeiro pergunta numa janela do Windows (Sim/Não, com o Não marcado): *"Desinstalar Administração de Imóveis? As cópias e a pasta de arquivos continuam no computador. Para cortar o acesso deste computador ao sistema, use Usuários → Aparelhos ligados → Desligar."* Por isso nenhum site consegue desinstalar: só a pessoa, clicando em Sim. Com Sim: tira os dois endereços (`imoveis-pasta:` e `imoveis-desinstalar:`), as três tarefas (pede administrador se o Windows exigir), a entrada em Aplicativos instalados e, por último, os arquivos do programa da pasta `programa` (o `.exe`, os `.vbs` e o `icone.ico`; a pasta sai se ficar vazia). O `.exe` em uso não se apaga sozinho: um PowerShell escondido espera o programa fechar e apaga. No fim, a janela "Pronto: programa desinstalado".

**Nunca apaga:** a pasta do backup seguro, a pasta `Arquivos dos imoveis` (os arquivos dos inquilinos), o crachá (`cracha.dat`) nem `config.json`. Se a pasta do backup estiver dentro da pasta `programa` (ou o contrário), a pasta do programa fica como está. O computador continua ligado ao sistema até **Usuários → Aparelhos ligados → Desligar** (reinstalar não pede a senha de novo). Se alguma tarefa não sair, a entrada em Aplicativos instalados fica, para tentar de novo por lá. `--desinstalar --simular` mostra tudo sem mexer em nada. Pelo Node (jeito antigo), `desinstalar-tarefa.cmd` continua só tirando as tarefas.

## Como saber se está funcionando

- Na pasta do backup seguro, `ultima-atualizacao.txt` tem a data e o resultado da última execução (`ok` ou `FALHOU` com o motivo; se algum arquivo da cópia aberta não baixou, as 5 primeiras falhas vêm nas linhas de baixo, `falhou: <arquivo>: <motivo>`, e voltam sozinhas na rodada seguinte). Cada pedido à nuvem tem tempo-limite (30 s nas consultas, 2 min por arquivo): conexão presa vira `FALHOU`, não trava a tarefa. A cópia aberta baixa 5 arquivos de cada vez e só uma rodada por vez (`copia-aberta.trava` na pasta, vale 15 min). "Não está mais ligado ao sistema" = foi desligado em Usuários ou ficou 90 dias parado: `ligar-computador.cmd`.
- Em `copias-diarias/` aparece um arquivo por dia (`imoveis-dados-AAAA-MM-DD.bkp`, ficam 60); em `programa/`, a versão PC (`administracao-imoveis.html`) e a versão dela (`versao.txt`).
- No sistema: **Usuários → Aparelhos ligados → Última vez**.
- No Windows: Agendador de Tarefas → "Imoveis - atualizador da versao PC" → Histórico.

## Quando o site cair

Abra `programa/administracao-imoveis.html` (na pasta do backup seguro) com dois cliques, no Chrome ou no Edge. Em **Restaurar backup seguro**, escolha a cópia do dia em `copias-diarias/`, digite a senha do backup e mande abrir numa pasta: o sistema abre inteiro, com os dados daquela cópia, e você pode trabalhar. Quando o site voltar, em **Dados e backup → Substituir os dados da nuvem pelos de uma pasta** você manda o que fez para a nuvem.

## Segurança

- O crachá só lê e só funciona nesta conta do Windows (DPAPI). Quem usa este computador com a sua conta consegue rodar o atualizador: proteja o Windows com senha. Computador perdido: **Desligar** em Usuários.
- A porta `/api/aparelho/` fica fora do login do Access, por isso: só entra quem sabe e-mail e senha de um usuário ativo (5 erros por e-mail ou 10 por endereço de internet = espera 15 min; mais de 50 erros por hora somando todo mundo só deixa cada tentativa 2 s mais lenta, sem trancar ninguém), o crachá é sorteado (256 bits) e a nuvem guarda só o resumo (hash) dele. A conta da senha é feita no computador (o Cloudflare não faz PBKDF2 acima de 100.000 voltas) e é conferida com um **verificador separado** da senha, que o site manda à nuvem quando a pessoa entra nele com a senha (outro sal, guardado só na nuvem, fora do banco): quem tiver o resumo gravado da senha (um administrador, ou um backup aberto) não consegue mais um crachá. Por isso, para ligar um computador, a pessoa precisa ter entrado no site com a senha pelo menos uma vez desde 17/11/2026 (e de novo depois de trocar a senha); senão o programa diz "E-mail ou senha errados. Se a senha está certa: entre uma vez no sistema pelo site…". Os computadores já ligados continuam. As outras rotas da nuvem continuam exigindo o Access.
- A versão PC vem do GitHub (o repositório é público; é o próprio programa, sem dados), buscada pela nuvem.

## Falta (etapa 2 da proposta)

- O `.exe` sem o Node está feito (acima). Falta dele: **assinatura** (certificado de assinatura de código: sem assinatura no computador do dono; comprar antes do primeiro cliente de fora, proposta, seção 8, item 11), ícone na Área de Trabalho e o link para baixar dentro do sistema (Dados e backup).
- Com o login próprio (etapa 4), a página de ligar pede também o código de confirmação.
