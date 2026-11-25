# Índice da documentação (de ponta a ponta)

Feito em 24/11/2026 (compactação geral pedida pelo dono). Cada documento, para que serve e **quando ler**. Quem está com pressa: leia só a parte "Comece por aqui". Documento novo entra aqui, na parte certa, na mesma PR.

## Comece por aqui

| Documento | Para que serve | Quando ler |
|---|---|---|
| [PENDENCIAS_DO_DONO.md](PENDENCIAS_DO_DONO.md) | O topo ("ONDE PARAMOS" e "COMECE POR AQUI") diz o que o dono precisa fazer agora, as PRs abertas e as sessões trabalhando. Embaixo, os pedidos de cada dia, com `[x]` no que já foi feito. | Sempre, no começo de cada conversa. |
| [HISTORICO_DO_SISTEMA.md](HISTORICO_DO_SISTEMA.md) | Por assunto: o que foi feito desde outubro, o que foi tirado ou mudado e por quê. No fim, **o que ainda falta, em ordem de prioridade**. Resume os relatórios antigos (mutirões, rotina de melhoria). | Para entender um assunto inteiro ou escolher o próximo trabalho. |
| [CONFERIR_O_QUE_MUDOU.md](CONFERIR_O_QUE_MUDOU.md) | O que o dono confere, tela por tela, desde a PR #318, com caixas para marcar. | Quando o dono for conferir o sistema. |
| [DECISOES.md](DECISOES.md) | Todas as regras de negócio decididas pelo dono, com data, motivo e o que foi descartado. **Não mude uma regra sem pedido dele.** | Antes de mexer em qualquer regra de dinheiro, prazo ou documento. |

## O sistema por dentro (para quem programa)

| Documento | Para que serve | Quando ler |
|---|---|---|
| [../CLAUDE.md](../CLAUDE.md) | Regras que não podem quebrar, comandos e armadilhas. | Sempre (o Claude já lê sozinho). |
| [RESUMO.md](RESUMO.md) | O que o sistema faz, módulo por módulo, e o estado de cada um. | Para ter a visão geral. |
| [ARQUITETURA.md](ARQUITETURA.md) | Camadas, onde está cada regra e os pontos sensíveis. | Antes de mudar algo que cruza vários arquivos. |
| [GUIA_DE_MODIFICACAO.md](GUIA_DE_MODIFICACAO.md) | Receitas: acrescentar cadastro, tela, regra; ligar o C6. | Ao acrescentar algo novo. |
| [REGRAS_CONFIGURAVEIS.md](REGRAS_CONFIGURAVEIS.md) | Lista das regras que o administrador escolhe (Sistema → Regras do sistema), com a lei e a consequência de cada opção. | Ao criar ou mudar uma regra configurável. |
| [../README.md](../README.md) | Apresentação curta do repositório. | Primeira visita. |

## Para o dono usar ou decidir

| Documento | Para que serve | Quando ler |
|---|---|---|
| [MANUAL_BANCO.md](MANUAL_BANCO.md) | Como usar a parte do banco: boletos com Pix, extrato, comprovantes, pagamentos. | Quando o C6 estiver ligado. |
| [TAXAS_COBRAVEIS.md](TAXAS_COBRAVEIS.md) | Taxas que podem ser cobradas do inquilino, cada uma com uma pergunta sim/não. O advogado deve conferir. | Ao decidir taxas do contrato. |
| [HONORARIOS_E_DESPESAS_DE_COBRANCA.md](HONORARIOS_E_DESPESAS_DE_COBRANCA.md) | Pesquisa jurídica: honorários e despesas de cobrança de quem atrasa. **Nada é cobrado** até o dono responder. | Ao decidir a cobrança do atraso. |
| [MINUTA_ADITIVO_TARIFA.md](MINUTA_ADITIVO_TARIFA.md) | Minuta do termo aditivo da tarifa do boleto, para contratos já assinados. Falta o advogado. | Quando levar ao advogado. |
| [REVISAO_JURIDICA_CONTRATO.md](REVISAO_JURIDICA_CONTRATO.md) | Revisão jurídica do contrato e dos e-mails (itens A1–A20, B1–B10): o que foi feito e o que espera o dono. | Antes de mudar texto do contrato. |
| [ESTUDO_PRODUTO_COMERCIAL.md](ESTUDO_PRODUTO_COMERCIAL.md) | Mercado, bancos, concorrentes e o que falta para vender o sistema. | Ao pensar na venda. |
| [PROPOSTA_LICENCA_E_PROGRAMA_PC.md](PROPOSTA_LICENCA_E_PROGRAMA_PC.md) | Plano aprovado (15/11) da licença por chave e do programa do PC sem `.env`; "Andamento" no fim. | Ao mexer na licença ou no programa do PC. |

## Banco C6

| Documento | Para que serve | Quando ler |
|---|---|---|
| [LIGAR_C6.md](LIGAR_C6.md) | Passo a passo para o dia em que as chaves do C6 chegarem: ponte, `.env`, ligar o sistema. | Quando o C6 liberar a API. |
| [C6_CAMPOS_CONFIRMADOS.md](C6_CAMPOS_CONFIRMADOS.md) | Campos e limites confirmados pelos arquivos oficiais (vale sobre a pesquisa). | Ao mexer na ponte ou em `mapa-c6.js`. |
| [C6_ROTEIRO_HOMOLOGACAO.md](C6_ROTEIRO_HOMOLOGACAO.md) | Resumo do roteiro de testes que o C6 exige. | Na homologação com o banco. |
| [PLANO_BANCO_FASE2.md](PLANO_BANCO_FASE2.md) | Plano da fase 2: extrato, comprovantes, conciliação, pagamentos. | Ao mexer em `conciliacao.js` ou `rotas-fase2.mjs`. |
| [EMAIL_C6_CREDENCIAIS.md](EMAIL_C6_CREDENCIAIS.md) | Texto do e-mail que pediu as credenciais ao C6 (enviado em 14/11). | Para cobrar o banco de novo. |
| [PESQUISA_API_C6.md](PESQUISA_API_C6.md) | Pesquisa de 05/11 (histórico; o que ela marcava "a confirmar" está em C6_CAMPOS_CONFIRMADOS). | Só para saber de onde veio uma decisão. |
| [c6-openapi/](c6-openapi/) | Arquivos oficiais da API (YAML, grandes). | Busque o campo com `Grep`; não leia inteiros. |

## Nuvem, segurança e publicação

| Documento | Para que serve | Quando ler |
|---|---|---|
| [../nuvem/README.md](../nuvem/README.md) | Como a nuvem (Cloudflare) está publicada e os próximos passos. | Ao mexer na nuvem. |
| [SEGURANCA.md](SEGURANCA.md) | O que é seguro e o que não é, e como blindar (para o dono e para o suporte). | Ao mexer em login, nuvem, ponte ou anexos. |
| [AUDITORIA_SEGURANCA.md](AUDITORIA_SEGURANCA.md) | Auditoria de 05/11 e as correções (histórico; os caminhos citam pastas de trabalho que não existem mais). | Só para saber a origem de uma proteção. |
| [PUBLICAR_NO_DOMINIO.md](PUBLICAR_NO_DOMINIO.md) | Como o site foi posto em `erp.ankjck.com.br` (Cloudflare + Pages) e a publicação pelo GitHub Actions. | Ao mexer no domínio ou na publicação. |
| [ESTUDO_DADOS_NUVEM.md](ESTUDO_DADOS_NUVEM.md) | Estudo de 06/11 que levou os dados para a nuvem (histórico; o estado atual está no `nuvem/README.md`). | Só para saber o porquê da nuvem. |
| [LIGAR_GMAIL.md](LIGAR_GMAIL.md) | Envio de e-mail pelo Gmail da empresa (botão "Conectar o Gmail"). | Se o envio direto parar. |
| [../ponte-c6/README.md](../ponte-c6/README.md), [../ponte-c6/README-fase2.md](../ponte-c6/README-fase2.md) | Como rodar e testar a ponte do C6. | Ao mexer na ponte. |
| [../atualizador-pc/README.md](../atualizador-pc/README.md) | Programa do PC (backup seguro, cópia aberta, assinatura digital). | Ao mexer no programa do PC. |

## Relatórios de buscas de erros (histórico; tudo corrigido, resumido no HISTORICO)

| Documento | O que é | Quando ler |
|---|---|---|
| [BUSCA_24_11.md](BUSCA_24_11.md) (e o PDF) | Busca de 24/11: 52 erros, 4 lotes, as 10 perguntas ao dono com a resposta e a PR de cada uma. | Para conferir um erro de 24/11. |
| [CONFERENCIA_BOLETOS_24_11.md](CONFERENCIA_BOLETOS_24_11.md) | Conferência de tudo o que entra e sai do boleto (24/11), citada pelos testes. | Ao mexer na montagem do boleto. |
| [MUTIRAO_19_11.md](MUTIRAO_19_11.md) e [mutirao-19-11/](mutirao-19-11/) | Busca de 19–20/11: 345 erros, 17 lotes, todos corrigidos. | Só para a prova de um erro antigo. |
| [MUTIRAO_3000.md](MUTIRAO_3000.md) | Mutirão de 16–17/11: 366 erros com a prova de cada um. | Só para a prova de um erro antigo. |
| [PENDENCIAS_4000.md](PENDENCIAS_4000.md) | Pedidos de 20/11 depois do mutirão: itens 1 a 5 feitos; faltam os testes do dono (6) e a limpeza (7). | Ao fazer a limpeza final. |
| [ROTINA_DE_MELHORIA.md](ROTINA_DE_MELHORIA.md) | Análise de 07/11, Raio-X de 09/11 e revisão de 13/11, com `[x]` no que foi feito; poucos itens abertos (R11, P2). | Ao retomar um item aberto. |
| [PROPOSTA_ARQUIVO_IMPRESSO.md](PROPOSTA_ARQUIVO_IMPRESSO.md) | Proposta aprovada e feita em 15/11 da pasta física do inquilino (o código cita). | Ao mexer em `arquivo-impresso.js`. |

## Arquivo (`arquivo/`)

Documentos que já cumpriram o papel e ninguém precisa ler no dia a dia. Ficam guardados para consulta.

| Documento | Por que foi arquivado |
|---|---|
| [arquivo/C6_BOLEPIX_API.md](arquivo/C6_BOLEPIX_API.md) | Cópia resumida da página do Bolepix (05/11). Os campos e limites confirmados estão em C6_CAMPOS_CONFIRMADOS e nos YAML de `c6-openapi/`. |
