# CLAUDE.md — Administração de Imóveis (erp-boletos)

Site estático (JS puro, sem build) que grava os dados num JSON numa pasta do computador do usuário.
Código em `docs/` (é também a pasta publicada pelo GitHub Pages: não ponha documentação ali). Detalhes em `documentacao/`:
`RESUMO.md`, `ARQUITETURA.md`, `GUIA_DE_MODIFICACAO.md`, `DECISOES.md` — leia só o que a tarefa pedir.

## Comandos
| Para | Rode |
|---|---|
| Achar onde mexer (função → linha) | `node tools/mapa.mjs <trecho>` (ex.: `reserva`, `CADASTROS.`, `FORMULARIOS.pag`) |
| Conferir tudo antes do commit | `node tools/checar.mjs` (sintaxe via esbuild + testes) |
| Idem, gerando a versão offline | `node tools/checar.mjs --offline` |
| Rodar no navegador | `cd docs && python3 -m http.server 8000` → `http://localhost:8000/?teste` (pasta interna, sem escolher pasta) |

`node --check` NÃO detecta erros nestes módulos; use `tools/checar.mjs`.

## Leia por partes (economia de contexto)
- `docs/js/telas.js` (~4.100 linhas) e `docs/js/regras.js` (~2.100): use `tools/mapa.mjs` e leia só o trecho (`Read` com offset/limit).
- Não leia `docs/offline/` (gerado, ~2 MB) nem `docs/vendor/` (bibliotecas minificadas).

## Regras que não podem quebrar
1. Dinheiro em **centavos inteiros**; datas `'AAAA-MM-DD'`; competência (mês de uso) `'AAAA-MM'`.
2. Toda gravação: na tela, `alterar((db) => …)` (`docs/js/app.js`); nas regras, só `inserir`/`atualizar`/`excluir` (`docs/js/regras.js`), que registram o histórico.
3. Campo ou tabela nova no banco: `TABELAS` em `regras.js`; dados antigos se ajustam em `normalizar()` (nunca remova passos de migração).
4. HTML com texto do usuário sempre passa por `esc()`.
5. Mudou `docs/js`, `docs/css`, `docs/vendor` ou o modelo xlsx → a versão offline fica desatualizada e `tests/offline.test.mjs` falha até rodar `node tools/checar.mjs --offline`.
6. Testes sem dados reais de pessoas (CPF de teste: `529.982.247-25`, CNPJ `11.222.333/0001-81`).
7. Regras de negócio definidas pelo usuário (reajuste no 13º mês a partir do mês de entrada, reserva, NF com aluguel cheio etc.) estão em `documentacao/DECISOES.md`: não mude sem pedido explícito.

## Fluxo de trabalho com o usuário
- O usuário é o dono do negócio, fala português e não é programador: respostas curtas, sem jargão, com exemplos de datas e valores.
- Antes de mudar uma regra de negócio, confirme o entendimento com um exemplo numérico.
- PR e versão offline: só quando o usuário pedir. Commits em português (título + tópicos `- `).
- Teste no navegador o que mudou na tela (Playwright, se disponível, no modo `?teste`) e diga o resultado.
- Depois de mudar o código, lembre o usuário de baixar de novo a versão sem internet (Dados e backup).

## Armadilhas já vistas
- Nomes de arquivo gravados pelo sistema: use só caracteres sem acento (a pasta interna do navegador em `?teste` recusou nomes com acento).
- Campos que redesenham uma mensagem no `change` podem "engolir" o clique de um botão dentro dela (o `blur` dispara o `change`): não refaça o desenho se o valor não mudou.
- Ao alterar boletos, lembre de `CAMPOS_RECALCULO` e dos boletos `editado_manual` (o recálculo pula esses). Para achar o boleto do aluguel de um mês use `boletoDoMes` (pode existir também o do complemento da caução). Excluir/desfazer lançamento apaga o arquivo anexado (`alterarApagandoAnexos` + `arquivosReferenciados`): campo novo de arquivo precisa entrar lá. Na troca de titular, a garantia é cuidada no contrato anterior (`garantiaHerdada`, `sincronizarGarantiaHerdeiro`).
