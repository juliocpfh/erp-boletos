# Conferência dos boletos (24/11/2026, item A5)

Pedido do dono em 24/11: "parece que tem muitas coisas de boletos quebradas". Foi conferido tudo o que entra e sai do boleto, com testes automáticos e na tela (modo `?teste`, dados fictícios). Antes desta conferência, a PR #364 já tinha corrigido o seguro que não entrava no boleto alterado à mão (A2) e os vários ajustes no mesmo boleto (A3).

## Resumo

| Item | Situação | Onde |
|---|---|---|
| Ressarcimento do condomínio | **3 erros corrigidos** (troca de titular, mês sem boleto, Desfazer) | PR #365 (já na `main`) |
| Descrição do boleto (100 letras do C6) | **corrigido em parte**: o banco cortava o ressarcimento | PR #368 |
| Aluguel, proporcional, bonificação, tarifa, IPTU, seguro, carência, reserva, ajustes, pagamento, NF, multa da notificação, descrição | conferidos, sem erro | `tests/conferencia-boletos.test.mjs` |
| Caução, acordo, saldo da saída, diferenças, troca de titular, FCI | já tinham testes próprios, que continuam passando | ver "Já coberto" |
| 4 pontos | **precisam da sua decisão** | ver "Para o dono decidir" |

## Por que um ressarcimento lançado pode não entrar no boleto

**Causa achada nos seus dados (24/11):** foi a hipótese 2 abaixo, a confusão entre o mês de referência e o mês do vencimento. Na Ascot, os dois ressarcimentos do condomínio de 10/2026 foram gravados para "12/2026", pensando no boleto que vence em 05/12/2026; mas esse boleto é o de referência 11/2026, e "12/2026" mandou o valor para o boleto que vence em janeiro. O seguro da Casa 02 teve o mesmo problema. Os formulários do ressarcimento e do seguro vão passar a perguntar o **mês do vencimento**, como o IPTU já faz, mostrando ao lado "boleto de referência 11/2026, vence 05/12/2026". Essa mudança é feita pela sessão principal, numa PR própria, que também acerta os seus dados. Campos do contrato com a mesma confusão possível, ainda sem mudança: "Usar a reserva no aluguel de", "Carência a partir do aluguel de" e "O novo valor vale a partir do aluguel de" (renovação).

O teste simples de antes (condomínio pago em 05/11, abatido no boleto de 11/2026) funcionava. Foram testadas as hipóteses uma a uma:

1. **Mês do abatimento calculado errado:** não. Condomínio pago em 05/11/2026 → boleto do aluguel de **11/2026**, que vence em **10/12/2026**. Contrato com aluguel que vence no próprio mês → boleto de 12/2026, que também vence em 10/12/2026. O vencimento é o mesmo nos dois casos.
2. **Rótulo que confunde o mês do aluguel com o mês do vencimento:** **provável**. O campo dizia "Abater no boleto do aluguel de", e a ajuda falava em "o boleto que vence no mês seguinte". Quem escreve "12/2026" pensando "o boleto que vence em dezembro" manda o ressarcimento para o boleto de 12/2026, que vence em **janeiro**. Agora o campo diz "(mês do aluguel)", com exemplo, e a lista da página do inquilino mostra o vencimento: "11/2026 (vence 10/12/2026)". (PR #365)
3. **Boleto gerado depois:** não. O ressarcimento lançado antes entra quando o boleto é gerado, e o lançado depois entra no boleto já gerado. Também continua depois do recálculo, de "Alterar valores" e de gerar o mês seguinte (que não o repete).
4. **Troca de titular:** **erro confirmado.** Ex.: Maria paga R$ 50,00 de fundo de obras em 05/12/2026, que vai para o boleto de 12/2026. Com a troca para Pedro em 01/12, o boleto de 12/2026 passa para Pedro e é recalculado **sem os R$ 50,00**, porque o lançamento ficou no contrato de Maria. O valor sumia sem aviso. Agora aparece um alerta nos dois contratos. **Quem fica com o valor é decisão sua** (item 1 abaixo). (PR #365)
5. **Mês depois da saída:** **erro confirmado.** Ex.: Maria sai em 20/11/2026 e o fundo de obras de R$ 50,00 é pago em 05/12 → iria para o boleto de 12/2026, que não existe. Ficava lançado e não abatia em lugar nenhum. Agora o formulário recusa e explica; os lançamentos antigos assim aparecem nos alertas. (PR #365)
6. **Edição que muda a data:** pequeno erro. Ao corrigir a data do pagamento (ex.: de 05/11 para 05/12), o mês do abatimento ficava o antigo. Agora acompanha a data nova, quando era o calculado. (PR #365)
7. **Desfazer pelo Histórico:** **erro confirmado.** Ex.: ressarcimento de R$ 50,00 mudado para R$ 80,00 e depois desfeito: o ressarcimento voltava a R$ 50,00, mas o boleto continuava abatendo R$ 80,00. Agora o boleto acompanha. (PR #365)
8. **Descrição cortada no banco:** **provável parte do problema.** Um boleto comum com aluguel, bonificação, IPTU, seguro, tarifa e ressarcimento tinha **120 letras** de descrição. O C6 aceita 100 e corta o fim, que é justamente "RESSARCIMENTO CONDOMÍNIO -RS50,00". O valor do boleto estava certo, mas o inquilino não via o motivo do desconto. Agora o texto do ressarcimento encurta ("RESSARC. COND.") e a tela avisa quantas letras o banco corta. (PR #368)
9. **Boleto já emitido à mão no C6:** lançar o ressarcimento depois muda o boleto no sistema, mas **não** o boleto já emitido no banco. Enquanto a emissão for à mão, a equipe precisa emitir de novo (ou lançar o ressarcimento no mês seguinte). O sistema não tem como saber que o boleto já foi emitido à mão (o item A4, boleto por e-mail, pode guardar essa marca).

Se o ressarcimento dos dados reais continuar fora do boleto depois destas correções, o próximo passo é olhar o lançamento em si (mês do abatimento gravado e contrato onde foi lançado), na página do inquilino → "Condomínio: taxas do proprietário".

## Conferido sem erro (testes em `tests/conferencia-boletos.test.mjs`)

Exemplos com aluguel de R$ 2.000,00, bonificação de 10% e tarifa de R$ 3,50:

- **Aluguel, bonificação e tarifa:** R$ 2.003,50 cheio, R$ 1.803,50 em dia; boleto de 11/2026 vence em 10/12/2026.
- **Proporcional (mês de 30 dias):** entrada em 15/02/2027 = 16/30; saída em 20/03/2027 = 20/30.
- **Seguro lançado depois de gerar o boleto:** entra ao salvar a apólice (parcela 1/12 de R$ 30,00); com a 1ª parcela marcada para 12/2026, sai de 11/2026 e entra em 12/2026; boleto pago não muda; contrato com seguro incluso no aluguel não cobra. Testado também na tela.
- **IPTU lançado depois:** entra pelo recálculo (R$ 100,00, parcela 10/10); no mês da saída em 15/11, R$ 50,00 (15 dias).
- **Carência:** aluguel zero, IPTU só se o contrato manda; a reserva vai para o 1º boleto depois da carência.
- **Reserva:** abate no boleto do mês dela e continua lá se o boleto for excluído e gerado de novo.
- **Ajustes do mês:** ficam depois do recálculo (mudança da tarifa).
- **Pagamento:** valor a menos é recusado (o boleto continua em aberto); atrasado soma multa de 10% e juros; vencimento no domingo vale até segunda.
- **Multa da notificação:** vai ao boleto em aberto; boleto excluído e gerado de novo recebe a multa outra vez.
- **NF do boleto pago em dia:** R$ 1.800,00 (aluguel com bonificação), sem tarifa e sem o ressarcimento (regra padrão).
- **Dados para o banco:** valor, valor em dia e descrição batem com o boleto.

**Já coberto por testes de antes** (continuam passando): complemento da caução (`regras.test.mjs`, `mutirao3000-regras.test.mjs`), acordo (`acordo.test.mjs`, `mutirao-regras.test.mjs`), saldo da saída (`decisoes-20-11.test.mjs`), diferenças presas (`mutirao-19-11-abh.test.mjs`), troca de titular (`regras.test.mjs`, `mutirao-e2e.test.mjs`), FCI (`fci.test.mjs`), recálculo de boleto alterado à mão (`boletos-24-11.test.mjs`).

## Para o dono decidir (nada disto foi mudado)

1. **Ressarcimento na troca de titular.** Maria pagou R$ 50,00 de fundo de obras no condomínio; o boleto onde ele seria abatido (12/2026) passou para Pedro. Opções: **(a)** o valor acompanha o boleto e é abatido de Pedro (simples, mas o dinheiro foi de Maria); **(b)** fica com Maria e entra na devolução/cálculo da saída dela (sugestão do Claude: é o mesmo critério das dívidas, que ficam com quem sai). Hoje só aparece o alerta e a equipe resolve à mão.
2. **Ressarcimento depois da saída.** Maria sai em 20/11/2026 e paga R$ 50,00 de fundo de obras em 05/12. Hoje o cálculo final da saída só tem débitos, não créditos. Opções: **(a)** entrar como crédito no cálculo final (abate dos débitos ou é devolvido); **(b)** continuar à mão (lançar no último boleto em aberto ou devolver por fora).
3. **Descrição do boleto acima de 100 letras.** Mesmo encurtando, o boleto com aluguel, bonificação, IPTU, seguro, tarifa e ressarcimento fica com 110 letras ("ALUGUEL RS2.000,00 / COM BONF. RS1.800,00 / IPTU RS123,45 SEGURO3/12 RS30,00 TARIFA RS3,50 RESSARC. COND. -RS50,00"), e o banco corta as 10 últimas. Opções: **(a)** tirar o "RS" dos valores (economiza 3 letras por valor: cabe); **(b)** pôr o ressarcimento antes da tarifa (o corte cai na tarifa); **(c)** deixar como está, com o aviso na tela.
4. **Seguro no mês da saída e depois.** Apólice anual em 12 parcelas de R$ 30,00, saída em 15/11/2026: o boleto de 11/2026 cobra a parcela 9/12 **inteira** (R$ 30,00; o aluguel e o IPTU são pela metade), e as parcelas 10 a 12 (R$ 90,00) não são cobradas de ninguém. Opções: **(a)** deixar assim; **(b)** cobrar o seguro proporcional aos dias, como o IPTU; **(c)** levar as parcelas que faltam para o cálculo final da saída.

## O que não pôde ser testado

- **Os dados reais** (o JSON do dono): esta conferência usou dados fictícios. A causa nos seus dados foi vista pela sessão principal (mês do vencimento digitado como mês de referência, no topo desta seção).
- **O C6 de verdade:** não se sabe se a tela do C6 (emissão à mão) corta a descrição em 100 letras como a API. O limite usado é o da API.
- **O celular:** os testes de tela foram no navegador do computador.
- **O Desfazer pela tela do Histórico:** testado pela regra (`reaplicarRessarcimentos`) e pelo código da tela, não clicando no Histórico.
