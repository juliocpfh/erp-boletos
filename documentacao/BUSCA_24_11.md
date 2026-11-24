# Busca de erros de 24/11/2026

## O que foi feito

- O sistema foi dividido em **8 partes**, e cada parte foi revisada ao mesmo tempo por um agente do Claude: boletos e NF; contratos (reajuste, renovação, troca de titular, garantia, acordo, saída); fichas em análise e comunicados; banco e extrato; nuvem e segurança; documentos, PDFs e e-mails; regras do sistema; telas, links e botões.
- Cada erro achado foi **conferido por um segundo agente**, que refez a prova no programa (na maioria das vezes rodando um teste com dados fictícios; em alguns, lendo o programa linha a linha).
- Foram achados **53 erros, todos confirmados**. Um deles apareceu em duas partes (REG-01 é o mesmo que NUV-02), então são **52 erros diferentes**:

| Gravidade | Quantos | O que quer dizer |
|---|---|---|
| **Grave** | 5 | dinheiro deixa de ser cobrado, cobrado em dobro ou NF errada |
| **Médio** | 18 | tela, aviso ou conta errada que pode levar a pessoa a errar |
| **Leve** | 29 | texto errado, botão que não ajuda, caso raro |

- Os erros foram juntados em **4 lotes de correção** (uma PR para cada). **9 assuntos precisam de uma resposta sua** antes de corrigir (logo abaixo).

**O que NÃO foi feito nesta busca:**
- Não foi aberto o navegador de verdade para cada erro: as provas foram feitas com testes no computador (com pessoas e valores fictícios) e, em parte, só pela leitura do programa. O teste na tela fica para a hora de cada correção, como sempre.
- Nada foi corrigido ainda: este relatório só lista.
- Partes que dependem do banco C6 ligado (a ponte) e do programa do PC com o certificado não foram rodadas de verdade.
- Não foi refeita a conferência dos boletos de 24/11 (`CONFERENCIA_BOLETOS_24_11.md`), que tem as suas 4 decisões próprias.

## O que precisa de decisão sua

Responda com o número da pergunta e a sua escolha. Ao lado, a sugestão do Claude.

**1. (FIC-03) Ficha reprovada com a reserva ainda por devolver: apagar os dados da pessoa?**
Hoje, 3 meses depois da reprovação, o sistema apaga documentos, CPF, e-mail e telefone da pessoa, mesmo que os R$ 500,00 da reserva ainda não tenham sido devolvidos. Exemplo: ficha reprovada em 10/08/2026, reserva não devolvida; em 10/11/2026 os dados somem e fica difícil devolver o dinheiro.
- (a) Esperar a devolução da reserva para apagar (os 3 meses contam a partir da devolução).
- (b) Apagar mesmo assim, como hoje.
- **Sugestão do Claude: (a).** Sem os dados, não há como fazer o Pix de volta.

**2. (CON-04) Multa por saída antes do prazo, depois de troca de titular: contar o prazo desde o contrato original?**
Contrato de 01/01/2026 a 01/07/2028 (30 meses), aluguel de R$ 2.000,00, multa de 3 aluguéis proporcional ao tempo que falta. Maria assume em 01/01/2027 (o prazo não recomeça) e sai em 01/01/2028, faltando 182 dias.
- (a) Proporção pelo prazo do contrato original: R$ 6.000,00 × 182 ÷ 912 dias = **R$ 1.197,37**.
- (b) Proporção pelo tempo desde a entrada da Maria, como o sistema sugere hoje: R$ 6.000,00 × 182 ÷ 547 = **R$ 1.996,34**.
- **Sugestão do Claude: (a)**, porque é o que a cláusula diz e o prazo não recomeça na troca.

**3. (CON-06) Carta do reajuste de dezembro: continuar pedindo a carta em janeiro?**
Inquilino entrou em 05/12/2025. O reajuste de 12/2026 vai junto com o boleto que vence em 10/01/2027. Se a carta não foi enviada até 31/12, no dia 01/01/2027 o aviso e os botões "Gerar carta" e "Enviar por e-mail" somem (o sistema acha que é reajuste do ano passado).
- Sim: a carta continua sendo pedida até o boleto de 10/01/2027 vencer.
- Não: fica como hoje (carta só no ano do reajuste).
- **Sugestão do Claude: Sim.**

**4. (CON-07) Termo do novo valor que "não valeu": a data de término volta?**
Contrato até 10/07/2027. Registra-se a renovação até 10/01/2030 com novo valor de R$ 2.000,00 e anexa-se o termo. Depois o termo é apagado como "Não valeu". Hoje o novo valor sai, mas o contrato continua terminando em 10/01/2030.
- (a) A data de término volta sozinha para 10/07/2027.
- (b) A data fica, e o sistema avisa "confira a data de término em Editar contrato" (o aviso entra de qualquer jeito, no Lote 2).
- **Sugestão do Claude: (a)**, quando o novo valor e a nova data vieram juntos na mesma renovação.

**5. (BOL-05) Boleto do saldo da saída pago com atraso: tem multa e juros?**
Em 20/11 você decidiu que **tem** (e o sistema já cobra assim). Mas o papel do boleto diz "Após o vencimento: sem multa e juros". Exemplo: saldo de R$ 300,00 que vence 10/12 e é pago em 20/12: o sistema pede R$ 331,00 (multa de R$ 30,00 e juros de R$ 1,00), e o papel diz que não haveria.
- (a) Confirma que tem multa e juros: corrige-se só o texto do papel.
- (b) Mudou de ideia: tira-se a multa e os juros desse boleto.
- **Sugestão do Claude: (a).**

**6. (BOL-06) NF do aluguel proporcional pago com atraso: como sai a linha?**
Entrada em 15/11/2026, aluguel de R$ 2.000,00, boleto de 16/30 (R$ 1.066,67) pago com atraso: o total da NF é R$ 1.182,44 (aluguel + multa + juros). Hoje sai "quantidade 16/30, valor unitário R$ 2.217,08", e a decisão de 17/11 diz que o unitário é o mês inteiro (R$ 2.000,00).
- (a) Sai "quantidade 1" e o valor unitário igual ao total, R$ 1.182,44.
- (b) Sai "16/30" com unitário de R$ 2.000,00, e a multa e os juros em outra linha (dá mais trabalho; confirmar com o contador se pode).
- **Sugestão do Claude: (a)**, mais simples e o total bate.

**7. (DOC-05) Lembretes da régua ("vence em 3 dias", "vence hoje", "em atraso"): levar o PDF do boleto feito à mão no banco?**
Hoje esses lembretes só sabem anexar o boleto do C6 pela ponte. O boleto feito à mão (PDF anexado) sai sem anexo e sem linha digitável.
- Sim: o lembrete leva de novo o PDF anexado.
- Não: o lembrete vai só com o texto (o PDF já foi no "Enviar boleto por e-mail").
- **Sugestão do Claude: Sim** (o inquilino costuma pedir o boleto de novo no dia do vencimento).

**8. (DOC-07) Os 8 documentos novos (prorrogação, troca de garantia, distrato etc.): registrar no contrato?**
Hoje eles são gerados, mas não ficam registrados nem têm onde anexar a via assinada. A prorrogação assinada até 31/05/2029 vai para a pasta como arquivo solto, não muda a data de término e não conta no número do próximo termo aditivo.
- (a) Registrar cada documento gerado no contrato, com botão para anexar o assinado; a prorrogação assinada muda a data de término, como a renovação.
- (b) Registrar e anexar, mas sem mudar nada sozinho.
- (c) Deixar como está (são só modelos para imprimir).
- **Sugestão do Claude: (b)** agora, e (a) depois que o advogado conferir os textos.

**9. (REG-03 e BAN-02) Prazo para o boleto pago aparecer no extrato: dias úteis ou dias corridos? E o botão que usa 3 dias fixos?**
A regra "a entrada casa com o boleto até 3 dias depois do vencimento" explica como dias corridos ("vence dia 10, entrou dia 13"), mas o sistema conta **dias úteis** a partir do último dia para pagar. Exemplo: boleto que vence no sábado 10/10/2026 (12/10 é feriado) é aceito como em dia até 16/10/2026, e não até 13/10. Além disso, o botão "É o pagamento do boleto" ignora a regra e usa sempre 3: com a regra em 6, para um boleto que vence em 10/08 e entra em 17/08, "Usar sugestão" aceita como pago em dia e "É o pagamento do boleto" recusa por "menor que o devido".
- (a) **Dias úteis** (como o sistema faz hoje e como o banco credita): corrige-se o texto da regra, e o botão passa a usar o número da regra.
- (b) **Dias corridos** (como o texto diz): muda-se a conta, e o botão passa a usar o número da regra.
- E o início da régua de cobrança por e-mail, que também usa os 3 dias fixos: segue a mesma regra? (Sim / Não)
- **Sugestão do Claude: (a)**, e Sim para a régua.

## Lotes de correção

Cada lote vira uma PR própria, a partir da `main`, com testes automáticos e teste na tela antes da PR.

| Lote | Assunto | Erros | PR | Feito |
|---|---|---|---|---|
| 1 | Boletos, NF e banco | BOL-01, 02, 03, 04, 07, 09, BAN-01, 03, 04 (e BOL-08, se for simples) | | [ ] |
| 2 | Contratos, troca, reajuste, acordo e saída | CON-01, 02, 03, 05, 07 (só o aviso), 08, 09, DOC-03, DOC-04 | | [ ] |
| 3 | Fichas, comunicados, documentos e e-mails | FIC-01, 02, 04, 05, 06, 07, 08, 09, DOC-01, 02, 06 | | [ ] |
| 4 | Nuvem, regras e telas | NUV-01, 02 (= REG-01), 03, 04, REG-02, 04, 05, 06, TEL-01, 02, 03, 04, BAN-05 | | [ ] |
| — | Esperam a sua decisão | FIC-03, CON-04, CON-06, CON-07 (a data), BOL-05, BOL-06, DOC-05, DOC-07, REG-03 e BAN-02 | | [ ] |

## Lista completa, por área

### Boletos e NF (BOL)

#### BOL-01 — "O ajuste entra na NF" leva junto a multa da notificação para a NF
- **Gravidade:** Grave
- **O que acontece:** o boleto de 11/2026 tem um ajuste de + R$ 100,00 marcado "entra na NF". Depois a multa de R$ 1.500,00 de uma notificação entra no mesmo boleto. Pago em dia, a NF sai com R$ 3.400,00 em vez de R$ 1.900,00. A multa da notificação devia ficar fora da NF (decisão de 17/11). O mesmo acontece com a diferença antiga de "pago em parte".
- **Na correção:** só o ajuste entra na NF; a multa e a diferença ficam fora, também na observação da NF.
- **Lote:** 1
- <small>Para o Claude: `docs/js/calculos.js:509-510` soma `outros` inteiro; também `regras.js:2288-2294` (`baseDaFatura`), `regras.js:7765` (acordo), `telas/cobrancas.js:76`; usar `outros − fixosDoBoleto(cb)` (`regras.js:2660`). Prova: `bol/t1.mjs`.</small>

#### BOL-02 — Recálculo apaga sozinho o boleto feito à mão no banco (com o PDF anexado)
- **Gravidade:** Grave
- **O que acontece:** boleto de 12/2026 feito à mão no banco, PDF anexado e enviado ao inquilino. Depois se informa a saída em 20/11/2026: o sistema apaga o boleto de 12/2026 sem perguntar, mas no banco ele continua valendo. Se o inquilino pagar, o dinheiro chega sem boleto para ligar. O PDF fica solto na pasta, e o botão "Excluir" também não avisa que o boleto foi feito no banco.
- **Na correção:** boleto com PDF do banco não é apagado sozinho; aparece o aviso "cancele no banco e depois exclua".
- **Lote:** 1 (cuidado com a PR #379, boletos da saída)
- <small>Para o Claude: `docs/js/regras.js:1940-1945` só poupa `emitidoNoBanco(cb)`; também `alertasBoletosSemOcupacao` (`regras.js:1909-1913`) e `telas/acoes.js:266`; proteção dentro de `recalcularCobrancas`. Prova: `bol/t4.mjs`.</small>

#### BOL-03 — Boleto alterado à mão depois de 24/11 é apagado pelo recálculo
- **Gravidade:** Médio
- **O que acontece:** antes de 24/11, o boleto alterado à mão nunca era apagado: aparecia o aviso "confira e exclua". Agora ele é apagado sozinho. Exemplo: aluguel de 12/2026 combinado à mão em R$ 1.500,00 e saída em 20/11/2026: o boleto some sem perguntar.
- **Na correção:** volta o comportamento de antes (fica, com o aviso).
- **Lote:** 1 (cuidado com a PR #379)
- <small>Para o Claude: `docs/js/regras.js:1933` (`camposDoRecalculo`) e `:1939-1945`; não excluir com `cb.editado_manual`. Prova: `bol/t3.mjs`.</small>

#### BOL-04 — Depois de confirmar um pagamento de valor diferente, a página do boleto não atualiza
- **Gravidade:** Médio
- **O que acontece:** inquilino pagou R$ 3.100,00 num boleto de R$ 3.000,00. A pessoa confirma, o pagamento é gravado, mas a página continua mostrando o boleto em aberto. Clicando de novo, aparece "Confirme o pagamento de novo" e a pessoa acha que não salvou.
- **Na correção:** a página se atualiza e mostra "Pago".
- **Lote:** 1
- <small>Para o Claude: `docs/js/telas/envios.js:563-581` (`FORMULARIOS.pagamentoNf`) sem `await mostrar()`.</small>

#### BOL-05 — O papel do boleto do saldo da saída diz "sem multa e juros", mas o sistema cobra
- **Gravidade:** Médio
- **O que acontece:** saldo de R$ 300,00 que vence 10/12, pago em 20/12: o sistema pede R$ 331,00, e o papel enviado ao inquilino dizia que não haveria multa.
- **Na correção:** depende da sua resposta (pergunta 5).
- **Lote:** espera sua decisão (área da PR #379)
- <small>Para o Claude: `docs/js/telas/cobrancas.js:312` e `:486`; regra em `regras.js:961` (`semMultaJuros`) e `:3381`; o CLAUDE.md também diz "sem multa" para o saldo. Prova: `bol/v5.mjs`.</small>

#### BOL-06 — NF do mês incompleto pago com atraso: valor unitário maior que o aluguel
- **Gravidade:** Leve
- **O que acontece:** boleto de 16/30 (R$ 1.066,67) pago com atraso: a NF sai "16/30" com unitário de R$ 2.217,08, e o certo seria R$ 2.000,00.
- **Na correção:** depende da sua resposta (pergunta 6).
- **Lote:** espera sua decisão
- <small>Para o Claude: `docs/js/fatura.js:86-95` (`quantidadeDaFatura`) e `regras.js:2289`. Prova: `bol/t2.mjs`.</small>

#### BOL-07 — Aviso "PDF do boleto desatualizado" não percebe mudança do desconto ou da multa
- **Gravidade:** Leve
- **O que acontece:** o PDF foi anexado com bonificação de R$ 200,00 (paga R$ 1.800,00 até o vencimento). A bonificação muda para R$ 100,00: o sistema não avisa que o PDF ficou velho, e o e-mail diz "R$ 1.900,00" com o PDF dizendo R$ 1.800,00.
- **Na correção:** o aviso passa a olhar também o valor com desconto e a multa e os juros.
- **Lote:** 1
- <small>Para o Claude: `docs/js/regras.js:3535` (`anexarBoletoPdf`) e `:3543-3550` (`boletoPdfDesatualizado`). Prova: `bol/v7.mjs`.</small>

#### BOL-08 — Termo de troca do vencimento que "não valeu": boleto alterado à mão fica no dia novo
- **Gravidade:** Leve
- **O que acontece:** termo de troca do dia 10 para o dia 20: todos os boletos em aberto vão para o dia 20. Se o termo é tirado ("não valeu"), o contrato volta ao dia 10, mas os boletos alterados à mão (até os em que só o IPTU foi digitado) ficam no dia 20.
- **Na correção:** a mesma regra nos dois sentidos: todos voltam ao dia 10, menos o emitido no banco.
- **Lote:** 1, se for simples (área da PR #379)
- <small>Para o Claude: `docs/js/regras.js:3710` (pula `editado_manual`) × `:5286-5295` (só pula `emitidoNoBanco`). Prova só por leitura.</small>

#### BOL-09 — Texto do botão "Recalcular boletos em aberto" ficou errado
- **Gravidade:** Leve
- **O que acontece:** a pergunta diz "Boletos alterados à mão não mudam", mas desde 24/11 o recálculo muda neles o que não foi digitado (ex.: o seguro lançado depois).
- **Na correção:** "Nos boletos alterados à mão, os valores digitados ficam; o resto é recalculado".
- **Lote:** 1
- <small>Para o Claude: `docs/js/telas/cobrancas.js:204`; comentário em `regras.js:1921-1925`.</small>

### Contratos, troca de titular, reajuste, acordo e saída (CON)

#### CON-01 — Excluir o contrato do novo titular deixa o anterior "saindo" e apaga o que veio dele
- **Gravidade:** Grave
- **O que acontece:** Maria assume o contrato de João em 01/12/2026, e o sistema marca a saída de João em 30/11/2026. Se o contrato de Maria for excluído (cadastrado errado), João continua com saída em 30/11: a partir de dezembro ninguém recebe boleto (R$ 1.800,00 por mês sem cobrança). Se a troca já tinha sido feita, também somem os fiadores, as correções, os boletos e a garantia que tinham passado para a Maria. (Só o administrador exclui, digitando APAGAR.)
- **Na correção:** ao excluir o novo titular, o anterior volta a ficar sem saída e recebe de volta o que tinha passado (ou a exclusão é barrada depois da troca feita).
- **Lote:** 2
- <small>Para o Claude: `docs/js/regras.js:3199-3213` (`excluirContrato`); `data_saida` gravada em `regras.js:4005` e `:4545`; `passa(...)` em `:4017-4055`; `telas/acoes.js:223-232`. Prova: `con/t1.mjs`, `con/t3.mjs`.</small>

#### CON-02 — Termo da troca de titular que "não valeu": o anterior continua com saída marcada
- **Gravidade:** Grave
- **O que acontece:** Maria assume em 01/12/2026; o termo é anexado em 20/11 e a saída de João fica marcada em 30/11. O termo é apagado como "Não valeu": a mensagem diz "João continua no contrato", mas a saída de 30/11 continua gravada. Em dezembro nem João nem Maria recebem boleto.
- **Na correção:** ao tirar o termo, a saída de João é apagada.
- **Lote:** 2
- <small>Para o Claude: `docs/js/regras.js:3686-3719` (`desfazerAditivo`, ramo troca); chamar `transferirHeranca` (`:4004`). Prova: `con/t4.mjs`.</small>

#### CON-03 — Reajuste em dobro quando a troca de titular é no meio do mês do reajuste
- **Gravidade:** Grave
- **O que acontece:** João entrou em 10/03/2026 com R$ 2.000,00; o reajuste de 03/2027 (5%) é aplicado nele: R$ 2.100,00. Maria assume em 15/03/2027 já com R$ 2.100,00, mas a tela Reajustes mostra para ela o reajuste de 03/2027 "em aberto", de R$ 2.100,00 para R$ 2.205,00. Quem clicar em "Aplicar correção" corrige duas vezes (R$ 105,00 a mais por mês). É raro.
- **Na correção:** o reajuste já aplicado no contrato anterior conta para o novo.
- **Lote:** 2
- <small>Para o Claude: `docs/js/regras.js:7605-7613` (`reajustesAbertos`), `:7347-7350` (`correcaoDoReajuste`), `:4016-4017`, `:7392`, `:7628`. Prova: `con/t7.mjs`.</small>

#### CON-04 — Multa da saída antecipada do novo titular sai maior
- **Gravidade:** Médio
- **O que acontece:** o cálculo final sugere R$ 1.996,34 em vez de R$ 1.197,37 (exemplo na pergunta 2). É só sugestão; a pessoa pode mudar.
- **Na correção:** depende da sua resposta (pergunta 2).
- **Lote:** espera sua decisão
- <small>Para o Claude: `docs/js/regras.js:2763-2770` (`multaSaidaAntecipada`, início = `c.data_entrada`); usar `cadeiaDeContratos(d, c).antes[0]`. Prova: `con/t2.mjs`.</small>

#### CON-05 — Acordo desfeito depois do cálculo final: a dívida volta a ser cobrada em dobro
- **Gravidade:** Médio
- **O que acontece:** aluguel de 07/2026 virou acordo de R$ 1.500,00 em 3 parcelas. O inquilino sai em 30/09/2026 e o cálculo final desconta as parcelas da garantia. Se depois alguém desfizer o acordo, o boleto de 07/2026 volta a "Em aberto" e a ser cobrado, embora já tenha sido descontado.
- **Na correção:** o sistema recusa desfazer o acordo com parcela já descontada da garantia ("desfaça antes o cálculo final"), e o botão some.
- **Lote:** 2
- <small>Para o Claude: `docs/js/regras.js:7825-7835` (`desfazerAcordo`, olhar `quitado_saida`/`quitado_devolucao`); botão em `telas/cobrancas.js:444`. Prova: `con/t9.mjs`.</small>

#### CON-06 — Carta do reajuste de dezembro some em 1º de janeiro
- **Gravidade:** Médio
- **O que acontece:** exemplo na pergunta 3.
- **Na correção:** depende da sua resposta (pergunta 3).
- **Lote:** espera sua decisão
- <small>Para o Claude: `docs/js/regras.js:7373-7374` (`comCarta`); `telas/reajustes.js:16`. Prova: `con/t8.mjs`.</small>

#### CON-07 — Termo do novo valor que "não valeu": a renovação some, mas o contrato continua prorrogado
- **Gravidade:** Leve
- **O que acontece:** exemplo na pergunta 4. A tela não avisa que a data de término continua (o "×" da renovação avisa; este caminho, não).
- **Na correção:** no Lote 2 entra o aviso; voltar a data depende da sua resposta (pergunta 4).
- **Lote:** 2 (o aviso) e espera sua decisão (a data)
- <small>Para o Claude: `docs/js/regras.js:3694-3698` (`desfazerAditivo` → `excluirRenovacao`, `:2567-2584`); aviso existente em `telas/contrato.js:921`. Prova: `con/t5.mjs`.</small>

#### CON-08 — Roteiro da saída diz "titularidade de volta ✓" sem protocolo nenhum
- **Gravidade:** Leve
- **O que acontece:** saída marcada para 26/02/2027 e hoje é 24/11/2026: a etapa "Contas" já mostra "titularidade de volta ✓", sem protocolo de luz ou água. O roteiro pode fechar sem as contas terem voltado ao proprietário.
- **Na correção:** o ✓ só aparece com o protocolo registrado.
- **Lote:** 2
- <small>Para o Claude: `docs/js/regras.js:8480-8482` e `:8522` (`roteiroSaida` usa `!alertaTitularidade`, que é null fora da janela, `:3760`). Prova: `con/t6.mjs`.</small>

#### CON-09 — Roteiro da saída promete devolver caução que nunca foi depositada
- **Gravidade:** Leve
- **O que acontece:** caução combinada de R$ 2.700,00, nada depositado. O roteiro diz "R$ 2.700,00 a acertar no cálculo final"; o cálculo final, certo, diz R$ 0,00.
- **Na correção:** o roteiro mostra o que foi depositado de fato.
- **Lote:** 2
- <small>Para o Claude: `docs/js/regras.js:8484` usa `valorGarantia`; trocar por `garantiaRecebida`. Prova: `con/t10.mjs`.</small>

### Fichas em análise e comunicados (FIC)

#### FIC-01 — "Apagar tudo desta pessoa" (LGPD) apaga o aceite de outra pessoa e deixa o dela
- **Gravidade:** Médio
- **O que acontece:** Fulano é inquilino do contrato A e responsável solidário no contrato B. Ao apagar os dados de Fulano, sai o aceite de Beltrano (solidário do contrato A) e fica o aceite do próprio Fulano no contrato B (com contatos e assinatura dele).
- **Na correção:** o aceite é separado pelo CPF de quem aceitou, não pelo contrato.
- **Lote:** 3
- <small>Para o Claude: `docs/js/pessoa.js:89` (só distingue `fiador`); chaves `s<id>`/`r<id>` em `comunicados.js:93`; também o ZIP em `pessoa.js:117`. Prova: `fic/lgpd-solidario.mjs`.</small>

#### FIC-02 — Reprovar uma ficha já aprovada guarda a data da aprovação como data da decisão
- **Gravidade:** Médio
- **O que acontece:** ficha aprovada em 10/08/2026 e reprovada (em "Editar") em 24/11/2026: a data da decisão fica 10/08. Os dados são apagados 3 meses depois de 10/08, ou seja, já vencidos.
- **Na correção:** quando a situação muda e a data não foi trocada, vale a data de hoje.
- **Lote:** 3
- <small>Para o Claude: `docs/js/telas/cadastros.js:569` (`valores`) e `:607` (`ajustar`). Prova: `fic/fichas.mjs` caso 3.</small>

#### FIC-03 — Ficha reprovada: dados apagados mesmo com a reserva por devolver
- **Gravidade:** Médio
- **O que acontece:** exemplo na pergunta 1.
- **Na correção:** depende da sua resposta (pergunta 1).
- **Lote:** espera sua decisão
- <small>Para o Claude: `docs/js/regras.js:2996` (`dataApagarDocumentosFicha`) e `:3040` não olham `devolucaoPendente` (`:2993`); `telas/comum.js:744-747`.</small>

#### FIC-04 — Excluir o contrato feito da ficha deixa a ficha presa ao contrato apagado
- **Gravidade:** Médio
- **O que acontece:** o contrato feito da ficha recebeu os documentos dela. Se o contrato é excluído, a ficha continua marcada como "documentos já no contrato", e um contrato novo feito dela sai sem o comprovante da reserva.
- **Na correção:** contrato feito de ficha e ainda não assinado não se exclui ("use Desistiu antes de assinar"); nos outros, a ficha é solta.
- **Lote:** 3
- <small>Para o Claude: `docs/js/regras.js:3199-3212` (`excluirContrato`), `telas/acoes.js:224` e `:1294-1313`, `fichas.documentos_no_contrato`. Prova: `fic/fichas.mjs` caso 2.</small>

#### FIC-05 — Imóvel excluído com ficha aberta: a ficha fica com o aviso "falta fazer o contrato" para sempre
- **Gravidade:** Leve
- **O que acontece:** o administrador exclui um imóvel que tinha ficha aprovada. A ficha fica com o aviso eterno e não salva sem marcar outro imóvel ("Marque pelo menos um imóvel").
- **Na correção:** o imóvel com ficha aberta não se exclui (ou a ficha é avisada antes).
- **Lote:** 3
- <small>Para o Claude: `docs/js/telas/acoes.js:184-195` (`motivoNaoExcluirImovel` não olha `fichas`), `regras.js:2972-2977`, `telas/cadastros.js:592`. Prova: `fic/fichas.mjs` caso 1.</small>

#### FIC-06 — Duas fichas com o mesmo nome no mesmo dia usam a mesma pasta
- **Gravidade:** Médio
- **O que acontece:** duas fichas de "Ana Souza" abertas em 24/11/2026 caem na mesma pasta. Ao fazer o contrato de uma, os documentos das duas vão juntos; ao excluir uma, a pasta das duas é apagada. É raro.
- **Na correção:** a segunda ficha ganha uma pasta com nome diferente.
- **Lote:** 3
- <small>Para o Claude: `docs/js/telas/comum.js:213` (`nomePastaFicha`), `telas/cadastros.js:652`, `comum.js:654-664`, `telas/fichas.js:774`.</small>

#### FIC-07 — Caixa "Ficha pela internet" diz que mandar de novo derruba o link anterior
- **Gravidade:** Leve
- **O que acontece:** um texto diz "o anterior deixa de valer", e outros dois (e a nuvem) dizem que o anterior continua valendo. O certo é "continua valendo".
- **Na correção:** o texto é acertado.
- **Lote:** 3
- <small>Para o Claude: `docs/js/telas/fichas.js:258` × `:189`, `:579`; `nuvem/ficha-publica.mjs:286-290`.</small>

#### FIC-08 — Na ficha pela internet, valor com ponto decimal fica 100 vezes maior
- **Gravidade:** Leve
- **O que acontece:** a pessoa digita a renda "2500.50" (alguns celulares só mostram o ponto) e o sistema entende R$ 250.050,00. "2.500,50" sai certo.
- **Na correção:** "2500.50" passa a ser entendido como R$ 2.500,50.
- **Lote:** 3
- <small>Para o Claude: `nuvem/ficha-publica.mjs:691` (`centavos`); campo `inputmode="decimal"` em `:719`; servidor aceita até 1e11 (`:215-218`).</small>

#### FIC-09 — "Enviar e-mail a todos" e "WhatsApp a todos" do comunicado incluem quem já saiu
- **Gravidade:** Leve
- **O que acontece:** o lembrete já pula quem saiu, mas os envios em massa ainda mandam para ex-inquilinos e fiadores que não valem mais.
- **Na correção:** os envios em massa também pulam quem saiu.
- **Lote:** 3
- <small>Para o Claude: `docs/js/telas/comunicacoes.js:359`, `:360` e `:381` × `:398` (`CM.destinoAtivo`).</small>

### Banco e extrato (BAN)

#### BAN-01 — Boleto do C6 pago com atraso pelo valor do desconto aparece "bate certinho" e depois é recusado
- **Gravidade:** Médio
- **O que acontece:** boleto que até o vencimento sai por R$ 1.318,50 é pago depois do prazo por esse mesmo valor (com multa e juros, o devido já era R$ 1.601,25). A tela Banco mostra como sugestão exata, já marcada; ao registrar, o sistema recusa ("menor que o devido").
- **Na correção:** a sugestão já mostra que o valor é menor que o devido e não vem marcada.
- **Lote:** 1
- <small>Para o Claude: `docs/js/conciliacao.js:756` (`emDia` sem teto); usar `data <= C.limitePagamento(cb.vencimento)`. Prova: `ban/t5.mjs`.</small>

#### BAN-02 — O botão "É o pagamento do boleto" ignora a regra da tolerância e usa 3 dias fixos
- **Gravidade:** Médio
- **O que acontece:** exemplo na pergunta 9.
- **Na correção:** depende da sua resposta (pergunta 9).
- **Lote:** espera sua decisão (junto com REG-03)
- <small>Para o Claude: `docs/js/conciliacao.js:938` e `:949` (`DIAS_COMPENSACAO_BOLETO`, `:690`, e `datasPossiveisDoPagamento`, `:697`) × `regra('tolerancia_boleto_dias')` (`:802`, `:900`); `telas/banco.js:1168`; também `regua-email.js:27`. Prova: `ban/t2.mjs`.</small>

#### BAN-03 — "Desfazer pagamento" deixa a entrada do extrato sem destino, mas com o comprovante
- **Gravidade:** Médio
- **O que acontece:** o pagamento do boleto é desfeito. A entrada do extrato fica sem boleto e sem imóvel, mas o comprovante (PDF) continua ligado a ela, e o arquivo fica perdido na pasta do imóvel.
- **Na correção:** o desfazer faz o mesmo que "Desvincular" (solta tudo e cuida do arquivo).
- **Lote:** 1
- <small>Para o Claude: `docs/js/regras.js:2173-2175` (`estornarPagamento`) não limpa os campos do comprovante; usar `CAMPOS_DESTINO` (`conciliacao.js:201-203`) e `alterarApagandoAnexos` (`telas/acoes.js:1768-1769`). Prova: `ban/t3.mjs`.</small>

#### BAN-04 — Financeiro → Visão geral: "Usar sugestão" aparece onde não deve e dá erro ao clicar
- **Gravidade:** Leve
- **O que acontece:** na conta de outro banco (só por arquivo), a Visão geral mostra "Usar sugestão", e o clique dá "não tem mais sugestão (a tela mudou)". A tela Banco não mostra o botão nesse caso.
- **Na correção:** a Visão geral usa a mesma conta da tela Banco.
- **Lote:** 1
- <small>Para o Claude: `docs/js/telas/financeiro.js:363` e `:378` (`Z.sugerirDestino` direto) × `telas/banco.js:57-61` (`sugestaoDe`) e `:1079-1083`.</small>

#### BAN-05 — "Gerar comprovantes do mês" falha nas linhas que vieram só do arquivo CSV
- **Gravidade:** Leve
- **O que acontece:** com a ponte do C6 ligada, as linhas do extrato que vieram só do CSV não acham o comprovante no banco e dão aviso de erro. Nada é gravado errado.
- **Na correção:** essas linhas ficam de fora da busca (com o aviso de que vieram do arquivo).
- **Lote:** 4
- <small>Para o Claude: `docs/js/conciliacao.js:199` e `:433` (`id_externo` `csv:…`); `telas/banco.js:383`, `:1136`, `:1143`; `ponte-c6/rotas-fase2.mjs:212`. Prova só por leitura (sem ponte).</small>

### Nuvem e segurança (NUV)

#### NUV-01 — A tela Acessos não anota nada da assinatura digital
- **Gravidade:** Médio
- **O que acontece:** em 24/11 o programa do PC baixa o "Recibo da garantia · Fulano" (com nome, CPF e valores), assina e devolve. Nada disso aparece em Sistema → Acessos, nem quem mandou o documento para assinar.
- **Na correção:** esses passos passam a aparecer em Acessos (menos a consulta de minuto em minuto).
- **Lote:** 4
- <small>Para o Claude: `nuvem/worker.mjs:192-207` (`rotaDoRegistro` sem `assinaturas`), chamada em `:492` e `:653`; texto em `docs/js/telas/nuvem.js:186`.</small>

#### NUV-02 (= REG-01) — Voltar a uma versão das regras liga ou desliga a assinatura digital sem avisar
- **Gravidade:** Médio
- **O que acontece:** a assinatura digital só se liga na caixa do certificado. Mas "Voltar a esta versão" e "Carregar arquivo das regras" trazem junto o liga/desliga gravado. Exemplo: versão "Regras de novembro" salva em 23/11 com a assinatura ligada; em 26/11 o certificado é removido; em 01/12 volta-se à versão: a assinatura liga sem certificado, e todo e-mail com recibo fica barrado ("ainda não foi assinado"). O contrário também: recibos voltam a sair sem a assinatura.
- **Na correção:** voltar versão e carregar arquivo nunca mexem na assinatura.
- **Lote:** 4
- <small>Para o Claude: `docs/js/regras.js:8669-8670` (`salvarRegrasSistema`), `restaurarVersaoRegras` (`:8701-8706`), `config-regras.js:437` e `:440-446`, `telas/regras-sistema.js:305-307`; tirar as chaves `fora`. Prova: `nuv3.mjs`, `reg/t1.mjs`.</small>

#### NUV-03 — Na nuvem, o operador consegue apagar uma ficha em análise
- **Gravidade:** Leve
- **O que acontece:** na tela, só o administrador tem "Excluir" na ficha. A nuvem não confere: um aparelho com o site antigo, ou um pedido feito à mão com login de operador, apaga a ficha (com CPF e renda).
- **Na correção:** a nuvem passa a recusar.
- **Lote:** 4
- <small>Para o Claude: `nuvem/cofre.mjs:46-47` (`SO_ADMIN.excluir` sem `fichas`); trocar OPERADOR por DONO em `tests/seguranca-nuvem.test.mjs:103`; rodar no Node 22.</small>

#### NUV-04 — Textos dizem que o programa do PC só se atualiza às 20h e ao entrar no Windows
- **Gravidade:** Leve
- **O que acontece:** desde 22/11 ele se atualiza também de hora em hora, mas duas telas ainda dizem "todo dia às 20h", e o dono pode achar que precisa esperar ou reiniciar o computador.
- **Na correção:** "de hora em hora, às 20h e ao entrar no Windows".
- **Lote:** 4
- <small>Para o Claude: `docs/js/telas/admin.js:106` e `docs/js/telas/nuvem.js:286`.</small>

### Documentos, PDFs e e-mails (DOC)

#### DOC-01 — "Enviar ao inquilino" do recibo da reserva abre o e-mail da ficha
- **Gravidade:** Médio
- **O que acontece:** com a assinatura ligada, no recibo da reserva (R$ 500,00 de 12/11/2026) tirado da página do inquilino, o botão abre o e-mail "Envio de ficha cadastral", que pede a ficha assinada e sai com "[preencher: documentos_ficha]".
- **Na correção:** fora da ficha, o botão não abre esse e-mail (fica o aviso "anexe o PDF assinado no e-mail").
- **Lote:** 3
- <small>Para o Claude: `docs/js/telas/documentos.js:395` (`EMAIL_DO_RECIBO.reserva`) e `:411-413`; caminho por `telas/contrato.js:893`. Prova: `doc/reserva.mjs`.</small>

#### DOC-02 — Notificação assinada pelo programa do PC continua "sem assinatura"
- **Gravidade:** Leve
- **O que acontece:** a notificação de 17/11/2026 é assinada pelo PC e baixada. Mesmo assim a etapa "Assinada" fica em branco, o e-mail avisa "vai SEM a assinatura" (e vai assinada) e ela não entra na pasta física. Dá para contornar anexando à mão a cópia baixada.
- **Na correção:** ao baixar a assinada, ela fica ligada à notificação.
- **Lote:** 3
- <small>Para o Claude: `docs/js/telas/acoes.js:1197-1205` (`assinaturaBaixar` não grava `arquivo_assinado`); `telas/emails.js:242`, `email-dados.js:281`, `arquivo-impresso.js:94`, `telas/notificacoes.js:157`; cuidado com `regras.js:6398`.</small>

#### DOC-03 — Número sugerido do termo aditivo repete um número já usado
- **Gravidade:** Leve
- **O que acontece:** Pedro fez o 1º termo; Lúcia assumiu com o 2º (troca de titular). Ao gerar a prorrogação de Lúcia, o sistema sugere "2º TERMO ADITIVO" de novo.
- **Na correção:** usa a mesma conta dos outros termos (toda a cadeia de contratos, maior número já usado).
- **Lote:** 2
- <small>Para o Claude: `docs/js/telas/documentos.js:535` × `regras.js:5254-5258` (`proximoNumeroAditivo`, exportar).</small>

#### DOC-04 — Aviso e notificação de desocupação com a data do fim em branco no contrato por prazo indeterminado
- **Gravidade:** Leve
- **O que acontece:** o texto sai "antes do fim do prazo do contrato (), incide a multa" e "cujo prazo terminou em  e que continua", com um buraco no lugar da data.
- **Na correção:** contrato indeterminado sai sem a frase da multa; a notificação usa a data certa do fim ou uma linha para preencher.
- **Lote:** 2
- <small>Para o Claude: `docs/js/contratos.js:320` (`data_fim` de `c.vigencia_fim`) e `:787-797`; `modelos-documentos.js:161` e `:175`; usar `R.fimDoContrato`. Prova: `doc/indet.mjs`.</small>

#### DOC-05 — Lembretes da régua não levam o PDF do boleto feito à mão
- **Gravidade:** Leve
- **O que acontece:** exemplo na pergunta 7. A prévia diz "Sem anexo (boleto não emitido no banco)", embora o PDF esteja anexado.
- **Na correção:** depende da sua resposta (pergunta 7).
- **Lote:** espera sua decisão
- <small>Para o Claude: `docs/js/modelos-email.js:282`, `:298`, `:314` (sem `boleto:anexado`); `email-dados.js:297`; `telas/regua.js:105` (`anexosDoItem` só `tipo === 'boleto'`).</small>

#### DOC-06 — Régua: "Abrir no Gmail" tira o e-mail da lista mesmo se a aba não abrir
- **Gravidade:** Leve
- **O que acontece:** se o navegador bloquear a aba, o e-mail fica como "Aberto no Gmail" e sai da lista; o inquilino não recebe o lembrete.
- **Na correção:** se a aba não abrir, o sistema avisa e o e-mail continua na lista (como já faz nos e-mails das etapas).
- **Lote:** 3
- <small>Para o Claude: `docs/js/telas/regua.js:154-156` (`noopener`, sem olhar o retorno) × `telas/emails.js:218-221`.</small>

#### DOC-07 — Os 8 documentos novos de 24/11 não têm onde anexar a via assinada
- **Gravidade:** Leve (é melhoria, não defeito)
- **O que acontece:** exemplo na pergunta 8.
- **Na correção:** depende da sua resposta (pergunta 8).
- **Lote:** espera sua decisão
- <small>Para o Claude: `docs/js/telas/documentos.js:503-507` (`preenchidos` só na aba); `arquivo-impresso.js:82-84` e `:48-53`.</small>

### Regras do sistema (REG)

REG-01 é o mesmo erro que NUV-02 (veja acima).

#### REG-02 — Com "A caução acompanha o reajuste" = Não, a página do inquilino continua pedindo o complemento
- **Gravidade:** Médio
- **O que acontece:** caução de R$ 2.430,00 depositada em 07/06/2026; aluguel corrigido em 07/09/2026. Com a regra em Não, a tela Reajustes não pede nada (certo), mas a página do inquilino diz "Complemento da caução: falta R$ 90,00", oferece o depósito e põe em "Comprovantes a buscar".
- **Na correção:** com a regra em Não, nada de complemento em lugar nenhum.
- **Lote:** 4
- <small>Para o Claude: `docs/js/regras.js:907` (`garantiaADepositar` sem `CR.regra('caucao_acompanha', c)`); efeitos em `telas/contrato.js:222-231`, `regras.js:3481`, `:3569`, `telas/acoes.js:1092`. Prova: `reg/t3.mjs`.</small>

#### REG-03 — Tolerância do extrato: o sistema conta dias úteis, o texto da regra fala em dias corridos
- **Gravidade:** Leve
- **O que acontece:** exemplo na pergunta 9.
- **Na correção:** depende da sua resposta (pergunta 9).
- **Lote:** espera sua decisão (junto com BAN-02)
- <small>Para o Claude: `docs/js/conciliacao.js:728` (`ultimoCreditoEmDia`, `somarDiasUteis`); texto em `config-regras.js:186-187`. Prova: `reg/t2.mjs`.</small>

#### REG-04 — Regra "índice do FCI que vem preenchido" não preenche nada quando o % fica em branco
- **Gravidade:** Leve
- **O que acontece:** nas regras, índice IPCA e % em branco. No Novo contrato, ao digitar 5% no FCI, o índice vem vazio.
- **Na correção:** o índice escolhido sempre vem preenchido.
- **Lote:** 4
- <small>Para o Claude: `docs/js/regras.js:8781` (`padroesNovoContrato`, índice dentro do `if` do %). Prova: `reg/v6.mjs`.</small>

#### REG-05 — Textos de tela mostram a regra do sistema mesmo com contratos numa regra especial
- **Gravidade:** Leve
- **O que acontece:** (1) E-mails da régua diz "nenhum dia escolhido: nada é preparado" e mostra e-mails da regra especial; (2) Reajustes explica o 1º mês pela regra do sistema; (3) Inadimplência diz "vermelho a partir de 5 dias" e o contrato da regra especial só fica vermelho com 10. Os valores estão certos; só o texto engana.
- **Na correção:** o texto também cita as regras especiais.
- **Lote:** 4
- <small>Para o Claude: `docs/js/telas/regua.js:58` e `:65`, `telas/reajustes.js:113`, `telas/financeiro.js:55`; usar `CR.valoresEmUso`.</small>

#### REG-06 — Tela "Regras do sistema" conta a assinatura digital como regra mudada
- **Gravidade:** Leve
- **O que acontece:** com a assinatura ligada, o alto da tela diz "1 regra diferente do padrão", mas nenhuma aparece marcada, e "Voltar tudo ao padrão" diz "já estavam no padrão" e mantém o aviso.
- **Na correção:** a conta só olha as regras que aparecem na tela.
- **Lote:** 4
- <small>Para o Claude: `docs/js/telas/regras-sistema.js:152` (usar `CR.REGRAS_NA_TELA`). Prova: `reg/v6.mjs`.</small>

### Telas, links e botões (TEL)

#### TEL-01 — "Conferir pagamentos no banco" (tela Boletos) abre o Banco no mês errado
- **Gravidade:** Leve
- **O que acontece:** na tela Boletos de 01/2027 (aluguel de janeiro, vence 10/02/2027), o botão abre o Banco em 01/2027, que busca os pagos em janeiro (boletos de dezembro). Os de janeiro, pagos em fevereiro, não aparecem.
- **Na correção:** o botão leva ao mês do vencimento dos boletos daquela lista.
- **Lote:** 4
- <small>Para o Claude: `docs/js/telas/banco-c6.js:37` (`mes=${comp}`) × `telas/banco.js:1189`; usar o mês de `cb.vencimento` (o contrato que cobra o próprio mês tem `cobranca_mes_seguinte: false`); `R.mesVencimentoDaCompetencia` da PR #373 serve. Prova: `tel/conf-tel02.mjs`.</small>

#### TEL-02 — Calendário do Painel leva aos Boletos do mês anterior (contrato que cobra o próprio mês)
- **Gravidade:** Leve
- **O que acontece:** contrato em que o boleto de 03/2027 vence em 10/03/2027: no calendário, "aluguel de 03/2027 · boleto ainda não gerado" abre Boletos de 02/2027, onde ele não está.
- **Na correção:** o link abre o mês certo.
- **Lote:** 4
- <small>Para o Claude: `docs/js/telas/consultas.js:261` (sempre mês −1); `regras.js:7238-7249` (`eventosDoMes`: gravar `competencia: comp`). Prova: `tel/conf-tel02.mjs`.</small>

#### TEL-03 — Sobra de programa: ação antiga de apagar o arquivo do termo aditivo, sem botão
- **Gravidade:** Leve
- **O que acontece:** nada na tela. É uma sobra que apagava o termo sem perguntar se valeu; nenhum botão a usa hoje. Tirar para não voltar a ser ligada por engano.
- **Na correção:** a sobra é apagada.
- **Lote:** 4
- <small>Para o Claude: `docs/js/telas/acoes.js:1218` (`ACOES.removerArquivoAditivo`); manter `R.removerArquivoAditivo`.</small>

#### TEL-04 — Endereço guardado de um termo de "novo valor" abre a tela errada e dá erro
- **Gravidade:** Leve
- **O que acontece:** só por endereço guardado ou pelo Voltar do navegador: o termo do novo valor abre a tela da troca de vencimento, que dá erro.
- **Na correção:** aparece o aviso "este termo vem do novo valor" com o link para imprimir.
- **Lote:** 4
- <small>Para o Claude: `docs/js/telas/documentos.js:845` (qualquer tipo que não é troca vira 'vencimento') e `:863`; termo criado em `regras.js:2543`. Prova: `tel/conf-tel04.mjs`.</small>

## Também conferido e sem problema

- **Telas e links:** todas as telas abrem sem erro (como administrador, operador e consulta, com endereços bons, incompletos e errados); todo link leva a uma tela que existe; todo botão tem o que fazer; as âncoras "ir para" existem; menu, ajuda, primeiros passos e os endereços antigos das caixas que mudaram de página estão certos.
- **Programa por dentro:** nenhuma ligação quebrada entre os arquivos; as partes carregadas só quando usadas estão na lista do aplicativo sem internet.
- **Segurança:** a lista de endereços externos permitidos é igual no site e na versão PC; os tipos de arquivo proibidos são os mesmos em todos os lugares; todo botão de anexar tem a lista de tipos aceitos.
- **Nuvem:** as tabelas do sistema batem com as que a nuvem aceita.
- **Regras:** as 52 regras do sistema são lidas pelo programa; nenhuma leitura de regra que não existe; as regras especiais por contrato são lidas com o contrato (menos os textos do REG-05); as regras da caução, do reajuste e das antecedências têm efeito.
- **E-mails e documentos:** os campos dos 22 modelos de e-mail são preenchidos (só sai "[preencher]" quando falta o dado de verdade); os anexos automáticos são reconhecidos; os 10 tipos de recibo têm quando podem sair; os 3 termos aditivos e os 8 documentos novos saem sem marca sobrando; as cláusulas citadas pela notificação existem nos dois contratos padrão.
- **Poupança da caução:** conta por aniversário de cada depósito, dias 29 a 31 e depósito depois da data, sem defeito.
- **Testes automáticos:** os 1.165 testes passaram.

## Notas para outras sessões

- **Boleto do saldo da saída na nuvem:** defeito já conhecido (fora desta lista), tratado pela sessão de boletos da saída.
- **BOL-02, BOL-03, BOL-05 e BOL-08** tocam a mesma área da sessão de boletos da saída (**PR #379**): quem corrigir o Lote 1 confere antes com `gh pr diff 379` e faz a menor mudança possível.
- **TEL-01 e TEL-02** são a mesma confusão de mês de referência × mês do vencimento da **PR #373**, que não mexe nesses arquivos; a função nova dela (`mesVencimentoDaCompetencia`) serve para o TEL-01 se ela entrar antes.
- Provas (testes com dados fictícios) na pasta temporária da sessão de 24/11 (`scratchpad/busca/`, subpastas `bol/ con/ fic/ ban/ reg/ doc/ tel/` e `nuv*.mjs`); podem sumir com a limpeza do computador. As linhas `arquivo:linha` são as da `main` de 24/11.
