# CLAUDE.md — Administração de Imóveis (erp-boletos)

Site estático (JS puro, sem build) que grava os dados num JSON numa pasta do computador do usuário; a parte bancária (C6) passa pela ponte `ponte-c6/` (Node, no computador do usuário).
Código em `docs/` (é também a pasta publicada pelo GitHub Pages: não ponha documentação ali). Detalhes em `documentacao/` — leia só o que a tarefa pedir:
`RESUMO.md` (o que o sistema faz, módulos, estado) · `ARQUITETURA.md` (camadas, onde está cada regra, pontos sensíveis) · `GUIA_DE_MODIFICACAO.md` (como acrescentar cadastro/tela/regra; ligar o C6) · `DECISOES.md` (regras de negócio do usuário) · `MANUAL_BANCO.md` (uso do banco pelo dono) · `LIGAR_C6.md`, `PLANO_BANCO_FASE2.md` (ponte e fase 2) · `C6_CAMPOS_CONFIRMADOS.md`, `C6_*.md`, `c6-openapi/` (formato oficial da API; os YAML são grandes) · `PESQUISA_API_C6.md` (histórico) · `SEGURANCA.md`, `AUDITORIA_SEGURANCA.md` (ameaças, achados e correções) · `PUBLICAR_NO_DOMINIO.md` (Cloudflare + Pages).

## Comandos
| Para | Rode |
|---|---|
| Achar onde mexer (função → linha) | `node tools/mapa.mjs <trecho>` (ex.: `reserva`, `CADASTROS.`, `FORMULARIOS.pag`; só `docs/js`) |
| Conferir tudo antes do commit | `node tools/checar.mjs` (sintaxe via esbuild + testes de `tests/`; `node --check` NÃO detecta erros nestes módulos); com `--offline` gera também a versão sem internet |
| Testar a ponte do C6 | `node --test tests/ponte-c6.test.mjs` (sobe a ponte em modo simulado) e `node --test "ponte-c6/testes/*.test.mjs"` (módulos da fase 2; `checar.mjs` não os roda) |
| Rodar a ponte em modo simulado | `cd ponte-c6 && SIMULADO=1 PONTE_SENHA=<frase com 20+ caracteres> CONTAS=ank,jck node servidor.mjs` → `http://127.0.0.1:8765` (ou copie `.env.exemplo` para `.env`); nada vai ao banco |
| Rodar no navegador | `cd docs && python3 -m http.server 8000` → `http://localhost:8000/?teste` (pasta interna, sem escolher pasta; em `?teste` a ponte é simulada dentro do site, `banco-fase2.js` + `simulado-banco.js`) |

## Leia por partes (economia de contexto)
- Telas divididas por assunto em `docs/js/telas/` (o maior, `acoes.js`, ~1.600 linhas; `banco.js` ~870 (extrato, comprovantes, pagamentos) e `banco-c6.js` (boleto no C6); `docs/js/telas.js` só tem as rotas `TELAS`); `docs/js/regras.js` (~4.600) e `docs/js/conciliacao.js` (~840, regras do banco fase 2): use `tools/mapa.mjs` (sem trecho mostra o assunto de cada arquivo) e leia só o trecho (`Read` com offset/limit). Os arquivos de `telas/` importam uns dos outros (import é só leitura: estado alterado por dois assuntos fica em `memoria`, `telas/comum.js`). Cliente da ponte: `banco.js` (`chamarPonte`) e `banco-fase2.js`; ponte: `ponte-c6/servidor.mjs` (~920), `rotas-fase2.mjs`, `c6-*.mjs` (1ª linha de cada arquivo diz o que tem).
- Não leia `docs/offline/` (gerado, ~2 MB), `docs/vendor/` (bibliotecas minificadas), `docs/js/simulado-banco.js` (dados fictícios copiados de `ponte-c6/simulado/`) nem `documentacao/c6-openapi/*.yaml` inteiros (busque o campo com `Grep`).

## Regras que não podem quebrar
1. Dinheiro em **centavos inteiros**; datas `'AAAA-MM-DD'`; competência (mês de uso) `'AAAA-MM'`.
2. Toda gravação: na tela, `alterar((db) => …)` (`docs/js/app.js`; é uma fila, uma gravação por vez, `alterarAgora` grava de verdade); nas regras, só `inserir`/`atualizar`/`excluir` (`docs/js/regras.js`), que registram o histórico.
3. Campo ou tabela nova no banco: `TABELAS` em `regras.js`; dados antigos se ajustam em `normalizar()` (nunca remova passos de migração).
4. HTML com texto do usuário sempre passa por `esc()`. Parâmetros do endereço (`rota.q`) passam por `sanearParametros` (`calculos.js`): parâmetro novo = entrada em `FORMATOS_PARAMETRO`; mês e data nas telas por `competenciaValida`/`dataValida`.
5. Mudou `docs/js`, `docs/css`, `docs/vendor` ou o modelo xlsx → a versão offline fica desatualizada e `tests/offline.test.mjs` falha até rodar `node tools/checar.mjs --offline`.
6. Testes sem dados reais de pessoas (CPF de teste: `529.982.247-25`, CNPJ `11.222.333/0001-81`).
7. Regras de negócio definidas pelo usuário (reajuste no 13º mês a partir do mês de entrada, reserva, NF com aluguel cheio, boleto no C6 pelo valor cheio com desconto até o vencimento etc.) estão em `documentacao/DECISOES.md`: não mude sem pedido explícito.
8. Segurança: CSP no `docs/index.html` e em `tools/gerar-offline.mjs` (domínio externo novo = entrar na `connect-src` dos dois); segredos nunca no JSON (`ponte_url`/`senha_ponte` só no navegador, `lembrarPonte`/`ponteLembrada`; `normalizar` apaga se aparecerem; chaves do C6 só na ponte); senhas só por `camposDeSenha` (`auth.js`); anexo só por `salvarArquivo` (`nomeAnexavel` barra página/script) e aberto com `tipoParaAbrir`; campo de arquivo com `accept` (`ACEITA_DOCUMENTOS`).
9. Nomes dos campos e caminhos da API do C6 só via `docs/js/mapa-c6.js` (cópia idêntica `ponte-c6/mapa-c6.mjs`; `tests/banco.test.mjs` confere). A ponte nunca registra pagamento sozinha: propõe e o usuário confirma.

## Fluxo de trabalho com o usuário
- O usuário é o dono do negócio, fala português e não é programador: respostas curtas, sem jargão, com exemplos de datas e valores.
- Antes de mudar uma regra de negócio, confirme o entendimento com um exemplo numérico.
- PR e versão offline: só quando o usuário pedir (depois de mudar o código, lembre-o de baixar de novo a versão sem internet em Dados e backup). Commits em português (título + tópicos `- `).
- Teste no navegador o que mudou na tela (Playwright, se disponível, no modo `?teste`) e diga o resultado.

## Armadilhas já vistas
- Nomes de arquivo gravados pelo sistema: use só caracteres sem acento (a pasta interna do navegador em `?teste` recusou nomes com acento).
- Campos que redesenham uma mensagem no `change` podem "engolir" o clique de um botão dentro dela (o `blur` dispara o `change`): não refaça o desenho se o valor não mudou.
- Ao alterar boletos, lembre de `CAMPOS_RECALCULO` e dos boletos `editado_manual` (o recálculo pula esses). Para achar o boleto do aluguel de um mês use `boletoDoMes` (pode existir também o do complemento da caução, em uma ou mais parcelas: `boletosCaucaoDa`). Excluir/desfazer lançamento apaga o arquivo anexado (`alterarApagandoAnexos` + `arquivosReferenciados`): campo novo de arquivo precisa entrar lá (e em `rotulosDosArquivos`; a conferência `conferirArquivos` usa a mesma lista). Na troca de titular, o contrato só passa com o termo aditivo assinado, mesmo passada a data (`trocaAguardaAditivo`; `herancaAgendada` cobre os dois casos), e a garantia é cuidada no contrato anterior (`garantiaHerdada`, `sincronizarGarantiaHerdeiro`), salvo garantia nova (`garantiaNova`: a do anterior é devolvida, `devolucoes_garantia`); o que ficar lançado no anterior depois (ex.: aplicação) passa ao novo em `completarHeranca` (`herancaIncompleta`); a apólice em vigência passa ao novo (`herdarSeguros`); documento já perdido no anterior fecha a etapa do novo (`perdaHerdada`). Pasta do inquilino: `pastaPaiContrato` devolve partes do caminho (`[imóvel, 'Inquilinos']`), não um texto; `organizarPastas` (ao abrir o Painel) acerta as pastas antigas. Copiar arquivo: use `S.lerConteudo` (OneDrive muda o arquivo no meio da leitura).
- Tabela larga nova: dê a classe `responsiva` (existe em `estilo.css`, `@media (max-width: 760px)`: no celular vira cartões) e deixe a 1ª linha como cabeçalho (`th`), de onde saem os rótulos (`data-rotulo`, em `montarExtras`, `app.js`); sem ela, a tabela só rola para o lado dentro de `.rolagem`. Boleto emitido no banco (`cobrancas[].banco`): excluir em aberto é barrado e o recálculo não mexe nele (`divergenciaBancaria` avisa); dados do banco (`movimentacoes_banco`, `pagamentos_banco`) não se desfazem pelo Histórico (`SEM_DESFAZER`).
