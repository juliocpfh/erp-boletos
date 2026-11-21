21/11: manter; decidir depois de ligar o C6.
| Item | Assunto | Decisão do dono |
|---|---|---|
| links-pc-015 | Endereço com inquilino, mês ou conta que não existe abre a tela normal sem avisar || 21/11: quer conversar (não entendeu). Explicar com exemplo. |
| entrada-007 | "Lembrar" no dia seguinte gera outro link da ficha e mata o anterior || 21/11: corrigir. O link antigo continua valendo para preencher, com a validade original fixa (o "Lembrar" não gera outro link). |
| entrada-034 | Imóvel com saída marcada não aparece para reserva até o inquilino sair || 21/11: manter (reserva só de imóvel vago). |
| mensal-009 | Pago a mais à mão: obriga mudar a NF e não registra o que tem de devolver || 21/11: quer conversar. Pede um jeito de lançar no boleto um valor extra esporádico (ex.: vidro quebrado, TV), discriminado, escolhendo se entra na NF ou não, e que não se repita no boleto seguinte. Conferir o que já existe ("outros") antes de propor. |
| saida-016 | Troca de titular no dia 28/02 ou 31: os dois boletos somam 28 ou 31 dias de 30 || 21/11: corrigir. A soma fecha sempre em 30/30, ajustando a parte de quem entra. |
| financeiro-banco-024 | Pagamento aguardando número de NF aparece em todos os meses seguintes do Fechamento || 21/11: manter. |
| impressos-002 | Declaração do IR do novo titular soma os aluguéis pagos pelo anterior || 21/11: corrigir. Cada titular declara só o que pagou. |
| comunicacoes-007 | Comunicado de contatos não vai ao inquilino solidário nem ao representante da empresa || 21/11: corrigir. O comunicado vai a todos que assinaram e respondem pelo contrato: inquilino, solidário, fiadores e representantes da empresa. |
| comunicacoes-027 | Coluna "NF" da página do inquilino mostra um número só (derrubado: as duas NFs têm o mesmo número) || 21/11: mostrar todas as NFs de mesmo número (uma por empresa). |
| comunicacoes-030 | "Solicitação" nomeia duas coisas (reserva e pedido do inquilino) || 21/11: trocar o nome: "Pedido de reserva" é uma coisa e "Solicitação do inquilino" é outra. |
| nuvem-012 | A nuvem de teste do computador não serve /privacidade (só a ferramenta do programador) || 21/11: quer conversar (achou que era o modo anônimo do navegador). Explicar. |
| iphone-012 | Contas do imóvel: no iPhone, escolher o mês troca de tela a cada giro da roleta || 21/11: corrigir com o botão "Ir". |
| iphone-014 | PDF comprido no iPhone pode ficar com páginas em branco (memória do visualizador) || 21/11: corrigir. |
| textos-017 | Lista "Movimentações sem destino" existe em duas telas (Financeiro e Banco) || 21/11: quer conversar (o C6 ainda não está ligado). Explicar depois de ligar o banco. |

Item que o dono mandar corrigir: uma PR para ele (ou para os pequenos juntos), com teste. Respostas de 21/11 dadas numa página de decisão item a item.

## 6. [ ] Testes do dono (ele faz; anote o resultado aqui)

- **Android:** o dono testa no celular dele: botões de 40 px, cartões das tabelas, teclado de números, "Baixar PDF" (deve sair igual ao do computador), visualizador de PDF, avisos presos no alto. Use a página do item 1 para os PDFs.
- Não testados por ninguém (ficam anotados): emissão no C6 do boleto do saldo do cálculo final (o `?teste` não tem as contas do C6), iPhone de verdade, páginas públicas da ficha e dos contatos no endereço de verdade.

## 7. [ ] Limpeza (só no fim, depois de os itens 1 a 6 serem vistos)

Sobraram cópias de trabalho (git worktrees) das instâncias do mutirão: `.claude/worktrees/agent-*`, `../erp-integracao`, `../erp-integracao2`, `../erp-pend`, e as branches `claude/mutirao-lote-*`. Tudo já está na `main`. O dono quer **apagar só no fim**, depois de ver tudo e confirmar que não falta arrumar nada. Pergunte antes de apagar.

## O que já foi decidido em 20/11 (para não perguntar de novo; está em `DECISOES.md`)

- Não existe boleto pago em parte: valor menor que o devido é recusado; quitação por acordo feito à mão.
- O complemento da caução só é aceito pelo valor exato; quem já avisou a saída não paga complemento.
- O seguro contra incêndio sempre existe: as opções são "por conta do inquilino" ou "incluso no aluguel".
- O saldo devedor do cálculo final é cobrado por boleto, sem NF. Pago atrasado, leva a multa e os juros do contrato; quando é pago, marca sozinho o "saldo cobrado".
- Conta paga pelo banco lançada errada: o administrador corrige só o lançamento.
- Na parcela arredondada do IPTU, a sobra abate o custo do dono.
- Nas telas, o nome é "Mês de referência". As 4 telas antigas foram apagadas.
