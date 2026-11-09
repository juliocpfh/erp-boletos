# Atualizador da versão PC

Programinha que roda **no computador do administrador**, sozinho (pelo Agendador de Tarefas do Windows, como o Windows Update), e mantém a pasta do **backup seguro** em dia com a nuvem: todo dia às 20h e ao entrar no Windows ele baixa os dados como estão na nuvem naquele momento e, se o site publicou uma versão nova do programa, a **versão PC** também.

**Para que serve?** O sistema já grava na pasta do backup seguro a cada alteração, mas só quando está aberto neste computador. Nos dias em que o sistema foi usado só no celular, é o atualizador que traz as mudanças para cá. Resultado: se o site ou o Cloudflare saírem do ar, a versão PC abre com os dados do último dia, sem internet.

Tudo que ele grava é cifrado com a mesma chave do backup seguro: sem a senha do backup, ninguém lê nada na pasta.

## O que precisa ter

- [Node.js](https://nodejs.org) (versão 20 ou mais nova). Nada mais.
- O backup seguro já ligado neste computador (Dados e backup → Backup seguro): a pasta escolhida tem o arquivo `chave-do-backup.json`.
- Uma **chave de serviço** do Cloudflare Access (abaixo).

## Passo a passo

1. Copie a pasta `atualizador-pc` para o computador (ex.: `C:\Imoveis\atualizador-pc`).
2. Crie a chave de serviço no painel do Cloudflare (conta do sistema): **Zero Trust → Access → Service Auth → Service Tokens → Create Service Token**. Nome `atualizador-pc`, duração 1 ano. Copie o **Client ID** e o **Client Secret** (o Secret só aparece uma vez).
3. Deixe a chave entrar no sistema: **Zero Trust → Access → Applications → "Sistema de Imoveis" → Policies → Add a policy**: nome `Atualizador`, ação **Service Auth**, regra *Include → Service Token → atualizador-pc*. Salve.
4. Diga ao Worker de quem é essa chave: **Workers & Pages → erp-boletos → Settings → Variables and secrets → Add**, tipo **Secret**, nome `SERVICOS`, valor `<Client ID>=<seu e-mail do sistema>`, tudo junto e sem espaços (ex.: `1a2b3c.access=fulano@gmail.com`; o e-mail de um administrador cadastrado em Usuários; mais de uma chave: separe por vírgula). Sem isso a nuvem recusa a chave com "Este e-mail não tem acesso ao sistema": é o mesmo aviso quando o Client ID foi copiado com o começo `CF-Access-Client-Id:` ou com espaço sobrando.
5. Na pasta copiada, copie `.env.exemplo` para `.env` e preencha `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET` e `PASTA_BACKUP` (a pasta do backup seguro).
6. Clique com o botão direito em `instalar-tarefa.cmd` → **Executar como administrador**: cria as duas tarefas no Windows e já roda a primeira atualização (com dois cliques normais só a das 20h é criada; a "ao entrar" dá "Acesso negado" sem administrador). Deve aparecer `Atualizado: imoveis-dados-AAAA-MM-DD.bkp …`.

Para rodar na mão a qualquer hora: `node atualizador.mjs`. Para desfazer as tarefas: `desinstalar-tarefa.cmd`.

## Como saber se está funcionando

- Na pasta do backup seguro, `ultima-atualizacao.txt` tem a data e o resultado da última execução (`ok` ou `FALHOU` com o motivo).
- Em `copias-diarias/` aparece um arquivo por dia (`imoveis-dados-AAAA-MM-DD.bkp`, ficam 60); em `programa/`, a versão PC (`administracao-imoveis.html`) e a data dela (`versao.txt`).
- No Windows: Agendador de Tarefas → "Imoveis - atualizador da versao PC" → Histórico.

## Quando o site cair

Abra `programa/administracao-imoveis.html` (na pasta do backup seguro) com dois cliques, no Chrome ou no Edge. Em **Restaurar backup seguro**, escolha a cópia do dia em `copias-diarias/`, digite a senha do backup e mande abrir numa pasta: o sistema abre inteiro, com os dados daquela cópia, e você pode trabalhar. Quando o site voltar, em **Dados e backup → Substituir os dados da nuvem pelos de uma pasta** você manda o que fez para a nuvem.

## Segurança

- O `.env` tem a chave de serviço, que dá acesso de leitura aos dados: a pasta fica só neste computador, nunca no GitHub (`.gitignore`) nem no OneDrive compartilhado. Quem tiver acesso ao computador tem acesso à chave: proteja o Windows com senha.
- A chave só lê (`GET`); a nuvem continua exigindo o site para gravar. Se a chave vazar: no painel do Cloudflare, Service Tokens → revogar, e tirar o Client ID de `SERVICOS`.
- O Worker confere a chave do mesmo jeito que confere o login por e-mail (assinatura do Access); `SERVICOS` só diz com qual usuário do sistema a chave entra, e esse usuário precisa estar ativo.
