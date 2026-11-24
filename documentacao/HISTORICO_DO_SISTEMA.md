# Histórico do sistema: o que foi feito, o que mudou e o que falta

Documento de 24/11/2026 (pedido C5 de 24/11). Ele junta, por assunto, tudo o que foi feito no sistema desde o começo (outubro de 2026), o que foi **tirado ou mudado** e **por quê**, e o que ficou **pela metade ou nunca foi feito**. No fim há a lista **"O que ainda falta fazer"**, em ordem de prioridade.

**De onde veio:** a memória do Claude, os documentos da pasta `documentacao/`, o histórico do GitHub (364 PRs) e o próprio sistema. Cada assunto foi levantado por um agente separado, que conferiu no sistema de hoje se a coisa existe de verdade. Quando as fontes não batem, o texto avisa com **"⚠ Fontes discordam"**.

**Como ler:** "PR #n" é o número da mudança no GitHub. As datas são de 2026. Os nomes entre parênteses no fim de uma frase (ex.: `conferirValorRecebido`) são só referência para o Claude achar o ponto no sistema: pode pular.

**Os outros dois documentos de 24/11:** `CONFERIR_O_QUE_MUDOU.md` (o que você precisa conferir, tela por tela) e `TAXAS_COBRAVEIS.md` (o que pode ser cobrado do inquilino, para decidir).

## Assuntos

1. Boletos, cobrança e NF
2. Banco C6
3. Fichas, reserva e comunicação com o inquilino
4. Contratos, regras e imóveis
5. Saída, garantia e recibos
6. E-mails, nuvem e o site
7. Programa do PC, backup e documentos assinados
8. O que ainda falta fazer (em ordem de prioridade)

## Resumo em 10 linhas

- **Out/2026:** nasce o sistema (boletos, NFs, contratos, reajuste no 13º mês). Os dados de 2026 são importados dos PDFs.
- **Até 06/11:** os dados ficavam num arquivo numa pasta do computador. **Desde 06/11** estão na nuvem (Cloudflare), e o celular passou a funcionar junto.
- **07 a 13/11:** rotina de melhoria, revisão "Raio-X", regras escolhidas pelo administrador, e-mails por etapa, revisão jurídica do contrato, recibos e termos de quitação.
- **14 a 17/11:** ficha pela internet, cópia aberta dos arquivos no PC, arquivo impresso, Mutirão 3000 (366 erros corrigidos), notificações ao inquilino, Gmail, programa do PC que se atualiza sozinho.
- **18 a 21/11:** comunicado de contatos, regras especiais por contrato, mutirão de 19/11 (345 erros corrigidos), decisão "**não existe pagamento em parte**" (20/11), boleto do saldo da saída, 14 decisões do dono de 21/11.
- **21 a 23/11:** assinatura digital com o certificado da ANK (funcionou e foi conferida em 24/11); "Dados e backup" vira **Sistema**.
- **24/11:** vários ajustes no mesmo boleto (#364) e os pedidos novos (boletos quebrados, termo de aceite da reserva, visual da assinatura, modelos em PDF, estes três documentos).
- **Parado por fora:** o banco C6 (as chaves não chegaram) e a CBS 2027 (espera o Senado, até 15/12/2026).
- **Parado esperando você:** termo de aceite da reserva (falta confirmar os 40% e o "documento falso"), taxas extras (este pacote), seguro fiança (tirar ou não).
- **Nunca feito:** proprietário de terceiros com repasse, NF pelo sistema do governo (2027), botão de assinar no contrato, aditivos e carta de reajuste.

---

## 1. Boletos, cobrança e NF
### O que foi feito (linha do tempo)
- **09/10/2026** (PRs #1, #2, #5, #6) — Nasce o sistema com os boletos do mês e as NFs. Desde o início: NF numerada pela data em que o dinheiro entrou (pedido do contador), juros ao dia cortados "como o banco faz", taxa do boleto para todos e texto do boleto.
- **13/10/2026** (PRs #8, #9, #17, #20) — Ajuste do mês no boleto (abatimento ou cobrança a mais), nomes "Boleto" e "NF", baixa em lote (separada por vencimento), fechamento do mês e "Voltar a última numeração" das NFs no lugar de apagar NF. Multa e juros passam a ser cobrados no próprio boleto e a NF do pagamento atrasado leva multa e juros. Boleto de controle (inquilino sem NF) fica fora das somas.
- **13/10/2026** (PRs #19, #21) — Reserva descontada a partir do aluguel marcado (só passa ao mês seguinte se sobrar). Ressarcimento de taxa extra do condomínio abatido no boleto seguinte, com a NF pelo aluguel cheio.
- **14/10/2026** (PR #22) — Reajuste: o mês de entrada conta como 1º mês, qualquer que seja o dia; o aluguel do 13º mês já vem corrigido (entrada em 15/02/2026 → aluguel de 02/2027 corrigido).
- **16/10/2026** (PRs #29, #31, #32, #34, #39) — Modelo Excel da NF para todos; IPTU do inquilino dividido pelos dias em que ocupou; boleto do complemento da caução gerado junto com o aluguel corrigido; "Excluir boletos selecionados" (boleto pago não se exclui).
- **16/10/2026** (sem PR: carga dos dados) — Importação de 2026: NFs 0077 a 0156 e boletos de dez/2025 a ago/2026, tirados dos PDFs. Regra usada: o dono manda só a NF da ANK e a JCK recebe o mesmo número e o mesmo valor (50/50). Casos duvidosos ficaram como alerta "A verificar" nos contratos.
- **21/10/2026** (PRs #61, #67) — Pagamento com valor diferente do previsto: o sistema pede a justificativa e a NF passa a ser digitada à mão. Termo aditivo de troca do dia do vencimento sem cobrança proporcional.
- **22/10/2026** (PR #68) — "Marcar como já abatida": reserva que já tinha sido descontada num aluguel antigo, de antes do sistema, sai dos boletos em aberto.
- **23/10/2026** (PR #91) — A carta de reajuste vai junto com o boleto do próprio aluguel já corrigido.
- **26/10/2026** (PRs #121, #122) — Descrição do boleto para o banco com "TARIFA COBRANÇA R$ x,xx", que encurta quando passa de 100 letras. Seguro obrigatório volta a ser de cada contrato (do inquilino), com apólice própria.
- **27/10/2026** (PRs #125, #126) — FCI (fundo de conservação) como % do aluguel bonificado no boleto. Fechamento do mês: boletos gerados a partir do dia 20 (ex.: em 20/10, os de 10/2026, que vencem em 11/2026) e NFs numeradas só depois da virada do mês.
- **30/10/2026** (PR #138) — Boleto do complemento da caução nunca tem multa nem juros.
- **05/11/2026** (PR #142) — Boleto no C6 (com Pix) preparado: valor cheio do aluguel com o desconto da bonificação válido até o vencimento; quem atrasa perde o desconto e paga multa e juros sobre o cheio.
- **07/11/2026** (PRs #168, #172, #176) — "Cancelar" NF só marca o número como cancelado (não volta a ser usado). Inadimplência some quando o contrato é encerrado. Filtros e lote de atrasados na tela Boletos, lembrete com texto pronto (e-mail é o canal oficial) e declaração anual de aluguéis para o IR do inquilino, por empresa.
- **07/11/2026** (PRs #177, #178) — Acordo de dívida: os boletos vencidos escolhidos ficam "Em acordo" e saem boletos novos em parcelas (ex.: R$ 1.350,00 viram acordo de R$ 1.500,00 em 3 × R$ 500,00). Régua de cobrança só como aviso: 1 dia de atraso → e-mail; 10 → ligar; 30 → avaliar a negativação.
- **09/11/2026** (PRs #186, #187, #188, #190) — NFs: escolher quais numerar, por mês fechado, com lembrete do Airbnb; todas do mesmo tamanho no PDF; nome e endereço compridos em duas linhas. Vencimento em sábado, domingo ou feriado vale até o próximo dia útil (vence sáb 10/10, 12/10 feriado → em dia até ter 13/10). Reserva sem mês marcado vai para o 1º aluguel cobrado.
- **12/11/2026** (PR #201) — Regras do sistema escolhidas pelo administrador: mês do reajuste, feriados da cidade, base da multa, proporcional, dia dos boletos, régua e prazos.
- **13/11/2026** (PRs #216, #217, #219) — IPTU não é contado duas vezes na troca de titular; resumo do IPTU do ano; numeração das NFs passa para a tela NF.
- **14/11/2026** (PR #230) — Aviso de NF dos boletos do mês só com os pagamentos daquele mês.
- **16/11/2026** (PRs #243, #249, #252) — Termo de confissão de dívida e acordo para assinar, com as etapas do acordo. Parcelas com centavos que não dividem: as primeiras mais caras e a última menor (R$ 1.200,05 em 10 = nove de R$ 120,01 e uma de R$ 119,96), só nos parcelamentos novos.
- **17/11/2026** (PRs #267, #273, #274, #275, #283) — Mutirão 3000: aluguel proporcional pelo mês de 30 dias (entrada em 15/02, aluguel de R$ 2.000,00 = 16/30 = R$ 1.066,67); NF do mês incompleto mostra "16/30"; pagamento a menos vira "Paga em parte" com a diferença levada ao boleto seguinte; boleto pago pelo código de barras e creditado em até 3 dias úteis não é atraso.
- **17/11/2026** (PR #290) — E-mails da régua: o sistema prepara (3 dias antes, no dia, 3 e 10 dias de atraso) e o administrador autoriza um a um. Nada é enviado sozinho.
- **17/11/2026** (PRs #300, #301, #302) — Notificação ao inquilino com prazo em dias úteis, PDF, e-mail, 2ª notificação e multa digitada que entra no próximo boleto (fora da NF, sem multa e juros sobre ela). Botão "E-mails da régua" passa para Boletos.
- **17/11/2026** (PRs #305, #306, #309) — NF avisa quando o texto é cortado, o Excel ganha uma aba por empresa e os centavos são conferidos. 2ª via com o valor do dia e inadimplência por faixa de atraso. Pago a mais: a devolução fica ligada ao boleto e a NF não muda.
- **17/11/2026** (PR #314) — Respostas do contador: informe do IR por empresa, só aluguel, ano pela data da NF; DIMOB fica com o contador; numeração da NF continua uma só para ANK e JCK.
- **18/11/2026** (PR #322) — Regras especiais por contrato (ex.: um contrato calcula o proporcional por dias reais e os outros por 30 dias).
- **20/11/2026** (PRs #329, #330) — Mutirão de 19/11: **não existe pagamento em parte**. Valor menor que o devido é recusado na tela, no extrato e no banco (ex.: Pix de R$ 2.000,00 para boleto de R$ 2.700,00); a quitação é por acordo.
- **20/11/2026** (PRs #331, #332) — Seguro incêndio sempre existe (só se escolhe quem paga). Boleto do saldo da saída: botão "Gerar boleto do saldo" depois do cálculo final, sem NF, com multa e juros do contrato se atrasar, e baixa sozinha quando pago (ex.: garantia R$ 2.000,00, débitos R$ 2.300,00 → boleto de R$ 300,00). IPTU com parcela arredondada mostra a guia real.
- **21/11/2026** (PRs #336, #337, #340) — Declaração do IR na troca de titular: cada um declara só o que pagou. Troca no meio do mês fecha sempre em 30/30. A página do inquilino mostra todas as NFs do boleto, uma por empresa.
- **21/11/2026** (PRs #345, #346, #349) — O ajuste do mês pode entrar na NF (padrão: fora). Pago a mais lançado à mão fica "a devolver", com o botão "Devolvi" (devido R$ 3.000,00, pago R$ 3.100,00 → R$ 100,00 a devolver). Adiar a saída recalcula o último boleto em aberto.
- **24/11/2026** (PR #364) — Vários abatimentos e cobranças no mesmo boleto, cada um com o botão Tirar e uma linha no demonstrativo. Boleto mexido em "Alterar valores" passa a guardar só os campos digitados, e o resto (ex.: o seguro lançado depois) volta a ser recalculado.

### O que foi tirado ou mudado, e por quê
- **13/10/2026** — antes: multa e juros do atraso iam para o boleto seguinte; agora: são cobrados no próprio boleto (pelo banco) e entram na NF do pagamento atrasado. Por quê: é como o banco cobra (DECISOES.md, linha de 13/10).
- **26/10/2026** — antes: o seguro obrigatório era do imóvel (decisão de 09/10); agora: é de cada contrato, pago pelo inquilino, com apólice própria. Por quê: pedido do dono (DECISOES.md, 26/10).
- **05/11/2026** — antes: a ideia era emitir no C6 pelo valor com desconto e multa em percentual equivalente; agora: valor cheio com desconto até o vencimento. Por quê: decisão do dono de 05/11 (DECISOES.md).
- **07/11/2026** — antes: proposta de "baixar como perda" o boleto não pago; agora: não existe; a saída é o acordo com boletos novos. Por quê: o boleto é título executivo (decisão do dono de 07/11, DECISOES.md). Conferido no código: não há botão de perda (`fazerAcordo` existe).
- **13/11/2026** — antes: "Ressarcimento de condomínio sai do valor da NF" era um botão em Empresas; agora: é uma regra em Regras do sistema. Por quê: revisão R9 de 13/11 (DECISOES.md).
- **17/11/2026** — antes: o proporcional era pelos dias reais do mês; agora: mês comercial de 30 dias (o dia 31 não conta; o último dia do mês completa 30). A opção "dias reais" continua nas Regras. Por quê: decisão do dono no mutirão 3000, item 16 (DECISOES.md, 17/11).
- **17/11/2026** — antes: NF do mês incompleto saía como "1 mês"; agora: "16/30", com o valor do mês inteiro no unitário. Por quê: decisão do dono, lista e2e item 30 (DECISOES.md).
- **17/11/2026** — antes: baixa automática podia casar por valor e data (prazos de 45 e 7 dias, de 09/11, nunca confirmados); agora: só com o mesmo código (código de barras, Pix do próprio boleto). Por quê: o dono acha o risco de erro "absurdo" (DECISOES.md, 17/11; memória "Baixa só por identificador").
- **20/11/2026** — antes (16–17/11): pagamento a menos virava "Paga em parte" e a diferença ia para o boleto seguinte (também o Pix pago atrasado com o valor do desconto); agora: o valor menor é recusado e o boleto continua em aberto. Os boletos antigos "Paga em parte" ficam como estão, e a diferença deles fica presa ao boleto de destino, fora da base de multa e juros. Por quê: "ou paga inteiro ou não paga" (decisão do dono de 20/11, DECISOES.md e memória "Sem pagamento em parte"). Conferido no código: `conferirValorRecebido` recusa; `aplicarDiferencasPendentes` continua só para os dados antigos.
- **20/11/2026** — antes: o contrato podia ter "Não tem" seguro; agora: o seguro sempre existe, só se escolhe quem paga. Por quê: obrigatório por lei (decisão do dono de 20/11).
- **20/11/2026** — antes: saldo devedor do acerto final cobrado por Pix; agora: por boleto. Por quê: boleto é título executivo, permite protesto (decisão do dono de 20/11, DECISOES.md).
- **21/11/2026** — antes: o ajuste do mês ficava sempre fora da NF; agora: pode entrar (ex.: TV vendida junto entra, vidro quebrado não). Por quê: decisão do dono no mutirão 19/11, mensal-009.
- **21/11/2026** — antes: a declaração do IR somava toda a cadeia de contratos; agora: na troca de titular cada um declara o que pagou (Maria jan–jun, Pedro jul–dez). Por quê: decisão do dono, impressos-002.
- **21/11/2026** — antes: na troca no meio do mês os dias não fechavam 30 (troca em 28/02: anterior 27/30, novo 1/30); agora: sempre 30/30 (novo 3/30). Por quê: decisão de 21/11 (DECISOES.md).
- **24/11/2026** — antes: um só ajuste por boleto, e o boleto mexido à mão nunca mais era recalculado (o seguro lançado depois não entrava); agora: vários ajustes e recálculo do que não foi digitado. Por quê: pedidos A2 e A3 do dono de 24/11 (PENDENCIAS_DO_DONO.md).

### Pela metade ou nunca feito
- **Boleto emitido pelo C6 (API)** — existe em parte: a tela e a ponte estão prontas, mas o C6 ainda não liberou as chaves (2ª cobrança enviada em 17/11). O desconto em produção fica travado até um boleto de teste confirmar o tipo.
- **Corte do texto do boleto no C6** (100 letras na descrição, 4 linhas de 80) — não decidido; o dono decide com o boleto de teste do sandbox.
- **Condomínio (ressarcimento) que não entrou nos boletos** (pedido A1 de 24/11) — existe em parte: a PR #364 testou um ressarcimento de R$ 45,00 entrando, mas o item continua desmarcado em PENDENCIAS_DO_DONO.md e não há teste próprio para ele. ⚠ Fontes discordam: a PR #364 diz que o ressarcimento entrou; a lista do dono diz que ainda está quebrado.
- **Mandar por e-mail o boleto feito à mão no banco** (pedido A4 de 24/11) — não existe: não há lugar em Boletos para anexar o PDF do banco e mandar pelo Gmail.
- **Conferência completa de tudo que entra e sai do boleto** (pedido A5 de 24/11) — não feita.
- **Boletos alterados à mão antes de 24/11/2026** — existe em parte: não se sabe quais campos foram digitados, então ficam como estão e só ganham aviso quando o IPTU ou o seguro não batem com o cadastro.
- **Régua com contato automático** (pedido futuro do dono de 07/11) — existe em parte: os prazos e as mensagens são escolhidos em Regras, e os e-mails são preparados, mas tudo depende da autorização do administrador (o envio direto vem desligado). Envio sozinho não existe, por decisão dele.
- **NF pelo sistema do governo em 2027** — não existe: nada no código sobre NFS-e nacional; o sistema do governo ainda não foi definido.
- **CBS 2027 nos impostos da NF** — não existe: a palavra CBS não aparece no código. Espera a alíquota do Senado (até 15/12/2026) e as respostas do contador.
- **NF com a divisão ANK/JCK da data do pagamento** (mutirão 3000, Regras 45) — não existe: a NF usa a divisão de hoje (imóvel 100% ANK em 10/03, mudado depois para 50/50, sairia em duas NFs de R$ 900,00). Ficou como "futuro".
- **Tela de ressarcimento barrar mês em acordo** — não feito (2ª rodada de 16/11, ROTINA_DE_MELHORIA.md).
- **Pendências da importação de 2026** — ficaram como alertas "A verificar" em 5 contratos (aditivo, nome, CPF e número de NF a conferir, data de saída). Os pagamentos de mar–jun de um boleto de controle nunca foram lançados por falta de dados.
- **NF 16/30 conferida pelo dono** — falta: só dá para ver no próximo inquilino com mês proporcional (PENDENCIAS_DO_DONO.md, item 13).


## 2. Banco C6
### O que foi feito (linha do tempo)
- **16/10/2026** (sem PR, pesquisa) — Pesquisa da API do C6: o banco não aceita chamadas direto do navegador (exige certificado instalado no programa que chama), então é preciso uma "ponte". Decisões do dono: boleto com Pix (Bolepix), emitido só pela ANK, cadastro como "Cliente Final" (`DECISOES.md`, 16/10; memória `integracao-c6-bank.md`).
- **16/10/2026** (PR #44) — Limites de campos do C6 guardados (nome 40, rua + número 40, bairro e cidade 40, UF 2, CEP 8 números, e-mail 70, descrição 100, instruções 4 linhas de 80, "/" recusado): o sistema avisa toda vez que um campo passa, nunca corta calado.
- **16/10 a 24/10/2026** (sem PR) — Ficha de cadastro preenchida no portal do C6; em 24/10 o dono tentou gerar a chave no Web Banking, mas o campo "Parceiro" só lista empresas de terceiros. Orientação: não escolher parceiro alheio (daria acesso a outra empresa).
- **26/10/2026** (PR #121) — Descrição do boleto para o banco com "TARIFA COBRANÇA R$ x,xx", encurtada em etapas ("TAR. COBRANÇA", "TAR. COBR.", "TARIFA") quando passa de 100 letras.
- **05/11/2026** (PR #142) — Integração inteira montada de uma vez: a ponte `ponte-c6/` (programa no computador, com modo simulado e senha de 20+ letras), boleto com Pix no C6 (emitir, consultar, alterar, cancelar, negativar só pelo administrador), fase 2 (extrato das duas contas, comprovantes com o nome certo na pasta do contador, destino de cada movimentação, pagamentos de contas com dupla confirmação) e as decisões do boleto pelo **valor cheio com desconto até o vencimento** (multa e juros sobre o valor cheio). Formato oficial da API conferido nos arquivos que o dono mandou (`C6_CAMPOS_CONFIRMADOS.md`).
- **05/11/2026** (PR #142) — Em `?teste` o site não chama a ponte: responde com dados fictícios, para dar para testar sem banco.
- **07/11/2026** (PR #165) — Pagamento ligado ao banco não se desfaz pelo Histórico; botão "Esquecer a ponte neste computador".
- **07/11/2026** (PR #167) — Fechamento do mês ganha a etapa "Banco" (extrato buscado e tudo com destino).
- **07/11/2026** (PR #171) — Pagamentos pelo banco: o administrador aprova e envia numa janela só (digitando o valor total) e a outra confirmação é no app do C6; item cancelado no C6 sai do lote.
- **07/11/2026** (PR #175) — Nomes dos campos do C6 num arquivo só (`mapa-c6.js`, cópia igual na ponte), conferido por teste.
- **07/11/2026** (PR #176) — Importar o extrato pelo arquivo OFX do aplicativo do C6, sem depender da ponte.
- **09/11/2026** (PR #190) — Revisão Raio-X: o mesmo lançamento pelo OFX e depois pela ponte não entra em dobro; um pagamento nunca quita dois boletos; nome e endereço acima do limite **barram** a emissão; pagamentos de R$ 19,99 e R$ 1,15 deixam de ser recusados; "Aprovar e enviar" não trava se a resposta se perde.
- **13/11/2026** (PRs #223, #224, #225) — Conferência de pagamentos fica só na tela Banco; sugestão de destino do extrato mais rápida (6.000 linhas: de 246 ms para uma leitura só); histórico mais leve na importação do extrato.
- **14/11/2026** (sem PR, documento) — E-mail pronto para pedir as credenciais ao C6, um por empresa, para `homologacaoapi@c6bank.com` (`EMAIL_C6_CREDENCIAIS.md`).
- **16/11/2026** (PR #250) — Ponte mais rápida e mais firme nas consultas (conexões guardadas, nova tentativa só em consulta, nunca em emissão ou pagamento).
- **16/11/2026** (PR #252) — Mutirão G1: correções nas regras de conciliação.
- **17/11/2026** (PR #274) — Mutirão 3000, itens altos: emissão nunca sai em dobro (grava a pendência antes, nova tentativa usa a mesma referência e confere no banco), "Conferir no banco" quando a conexão cai, e numa conta de produção o boleto com desconto só sai depois de conferir o tipo de desconto num boleto de teste (o C6 tem o desconto "por dia", que daria desconto demais).
- **17/11/2026** (PR #281) — Mutirão 3000, itens médios e baixos: alteração no banco só de valor, vencimento, descrição e encargos; recusas do banco em português; "Testar conexão" diz qual serviço está sem permissão; OFX de outra conta recusado; avisos do banco (webhook) lidos na tela Banco.
- **17/11/2026** (PR #285) — Ponte recusa boleto com vencimento no passado; conciliação pelo código do Pix e do boleto.
- **17/11/2026** (PR #291) — Avisos automáticos, extrato em CSV com conferência do saldo e painel de saúde da ponte.
- **17/11/2026** (PR #309) — Pix devolvido: destino novo "Devolução ao inquilino" ligado ao boleto (ex.: boleto de R$ 2.000,00 pago duas vezes; devolve R$ 2.000,00, o boleto fica com R$ 2.000,00 recebidos e a NF não muda). E **só o identificador igual liga sozinho** (código de barras, Pix do próprio boleto, código do Pix devolvido).
- **17/11/2026** (sem PR) — O dono cobrou o C6 por e-mail; desde então aguarda as chaves.
- **20/11/2026** (PR #329) — Mutirão de 19/11, lote G: 29 correções de banco e financeiro.
- **20/11/2026** (PR #330) — Não existe pagamento em parte: valor recebido menor que o devido é recusado também na confirmação pelo banco (a proposta do banco nunca casa valor menor).
- **22/11/2026** (PR #358) — Página Sistema → Banco (só administrador): configuração do C6, emissão de boletos (saiu de Empresas), conciliação e pagamentos. O menu Banco (extrato) continua onde estava; endereços antigos levam à página nova.

### O que foi tirado ou mudado, e por quê
- **05/11/2026** — antes: a ponte seria um serviço na internet (estudo: Google Cloud Run, de graça); agora: a ponte é um programa no computador da empresa, que só escuta o próprio computador (para fora, só com proteção do Cloudflare). Por quê: o mTLS do Cloudflare Workers não funciona com o C6 (que está atrás do Cloudflare) e a decisão de segurança da ponte (`DECISOES.md`, 16/10 e 05/11; `LIGAR_C6.md`). ⚠ Fontes discordam: `DECISOES.md` de 16/10 ainda fala em "opção estudada: Google Cloud Run" e não há linha dizendo que foi descartada; `LIGAR_C6.md` e o código já tratam a ponte como programa no computador.
- **05/11/2026** — antes: emitir pelo valor com desconto e multa/juros em percentual equivalente; agora: valor cheio com o desconto da bonificação válido até o vencimento. Por quê: quem paga atrasado perde o desconto e a conta bate com o sistema (decisão do dono de 05/11, `DECISOES.md`; tornada fixa, sem opção, em 12/11).
- **07/11/2026** — antes: o administrador aprovava cada pagamento e só depois mandava ao banco (três confirmações); agora: aprova e envia numa janela só, e a outra confirmação é no app do C6. Por quê: aprovar antes de o banco ler o código travava o pagamento (`DECISOES.md`, 07/11, PR #171).
- **09/11/2026** — antes: nome e endereço longos eram cortados no boleto; agora: barram a emissão com aviso. Por quê: pedido do dono de 16/10 ("avisar toda vez, nunca cortar em silêncio") (PR #190).
- **17/11/2026** — antes: entrada do extrato com o mesmo valor e data do aluguel vinha proposta para o boleto ("parece: boleto 10/2026"), pagamento adiantado até 45 dias ligava, conta lançada à mão até 7 dias ligava, transferência pelo valor ligava a outra ponta; agora: só liga sozinho pelo código do boleto, Pix do próprio boleto ou código do Pix devolvido; o resto vira aviso "vincular manualmente", sem nada pré-marcado. Por quê: o dono achou a chance de erro "absurda" e quer evitar fraude (decisão de 17/11, `DECISOES.md` e memória `feedback-baixa-so-por-identificador.md`; PR #309).
- **20/11/2026** — antes (PR #274, 17/11): Pix pago depois do vencimento com o valor do desconto era aceito e a diferença ia para o próximo boleto; agora: é recusado, porque não existe pagamento em parte (`R.conferirValorRecebido`). Por quê: decisão do dono de 20/11 (`DECISOES.md`, memória `sem-pagamento-em-parte.md`; PR #330).
- **22/11/2026** — antes: a caixa do banco ficava em "Dados e backup" e a emissão de boletos em Empresas; agora: tudo em Sistema → Banco. Por quê: organização da página Sistema (PR #358).

### Pela metade ou nunca feito
- **Chaves do C6 (sandbox e produção)** — não existem: o C6 não respondeu ao cadastro de 16/10 nem ao e-mail de 17/11. Sem elas nada fala com o banco de verdade; tudo foi testado só no modo simulado.
- **Ponte instalada num computador** — não existe: `ponte-c6/` tem o programa pronto, mas não há pasta de credenciais nem instalação em lugar nenhum; só se instala quando as chaves chegarem (`PENDENCIAS_DO_DONO.md`, item 5).
- **Homologação no C6** — existe em parte: a ponte guarda cada chamada (sem CPF e sem chaves) para preencher o "Roteiro de Testes" e tem `--roteiro` (`servidor.mjs`); falta fazer os testes no sandbox e mandar o roteiro, o que depende das chaves.
- **Conferência do tipo de desconto no boleto de teste** — existe a trava (`desconto_conferido`, `regras.js`), mas nunca foi feita: o tipo padrão ainda é o primeiro da lista da API ("por dia"), marcado no código como "confirmar no sandbox".
- **Corte da descrição (100 letras) e das instruções (4 × 80)** — existe o corte automático, mas a decisão do dono ficou para o dia do boleto de teste (17/11).
- **Avisos do banco (webhook)** — existe em parte: a ponte recebe (`/webhook/c6/:conta`) e a tela Banco lê, mas precisa do túnel do Cloudflare e de um código por conta, nada disso configurado.
- **Sugestão do tipo de despesa pela descrição** (ex.: SANEPAR → Água) — existe (lista de palavras em `conciliacao.js`, `sugerirDestino`), mas é só sugestão; o dono quer revê-la com o extrato real, depois do C6 no ar (`PENDENCIAS_DO_DONO.md`, item 8).
- **Baixa automática pelo extrato e boleto pelo WhatsApp** — não existe; ficou para quando houver acesso à API (`DECISOES.md`, 24/10).
- **Chave da JCK** — opcional: só a ANK emite boleto; a JCK só teria extrato e pagamentos.


## 3. Fichas, reserva e comunicação com o inquilino
### O que foi feito (linha do tempo)
- **13/10/2026** (PR #19, #20) — A reserva passa a ser descontada exatamente no aluguel do mês marcado; se sobrar, segue para o mês seguinte. Ao refazer os boletos, a reserva sai dos boletos refeitos e volta a ser aplicada.
- **16/10/2026** (PR #35, #36, #37) — Solicitações do inquilino (conserto, pedido etc.) aparecem na tela Inquilinos e no Painel, com escolha do inquilino e um botão para fazer a carta da solicitação.
- **22/10/2026** (PR #68) — Botão "Marcar como já abatida": a reserva que já foi descontada num aluguel antigo sai dos boletos em aberto e a tela mostra "Reserva já abatida em MM/AAAA".
- **30/10/2026** (PR #137) — Na troca de titular, a reserva passa inteira para o novo titular, com data e comprovante, sem ser descontada duas vezes.
- **09/11/2026** (PR #183) — Nasce a **Ficha em análise** (caixa no topo de Inquilinos): dados do interessado, reserva com comprovante, documentos na pasta "Fichas em analise" e marcação do que chegou. Operador e administrador aprovam ou reprovam; a ficha aprovada vira contrato pelo botão "Fazer o contrato". Cada imóvel tem no máximo uma ficha aberta; uma ficha pode valer para vários imóveis.
- **09/11/2026** (PR #191) — Nova solicitação do inquilino só pela página Solicitações, com escolha do imóvel quando a pessoa aluga mais de um.
- **10/11/2026** (PR #199) — A ficha ganha o anexo da **análise do Serasa** e a **proposta** (aluguel, vencimento, bonificação, garantia), que vai pronta para o contrato; a lista mostra **só imóveis vagos**. Aluguel, aluguel bonificado e bonificação (%) se calculam um pelo outro.
- **12/11/2026** (PR #202) — E-mails de cada etapa da ficha (envio da ficha, aprovada, reprovada). O texto diz que, aprovada a ficha, a reserva é descontada do 1º aluguel; não aprovada, devolve-se tudo.
- **13/11/2026** (PR #204) — **Recibo da reserva** e **termo de devolução da reserva e quitação**, em PDF, anexados sozinhos no e-mail da etapa.
- **13/11/2026** (PR #207) — **Desistência antes de assinar**: botão "Desistiu antes de assinar" na ficha e na página do inquilino. A ficha fica "Desistiu", o contrato não assinado é cancelado e a reserva fica para devolver inteira (ex.: reserva de R$ 1.000,00 paga em 05/11/2026, desistência em 13/11/2026 → aviso "devolver a reserva de R$ 1.000,00").
- **14/11/2026** (PR #232) — Ficha cadastral em PDF pelo sistema, com a declaração de que as informações são verdadeiras (documento falso é crime) e a lista de documentos conforme o tipo de renda.
- **14/11/2026** (PR #233) — **Ficha pela internet**: link de 7 dias, um por pessoa (interessado, cônjuge, fiador, empresa), no endereço `ficha.ankjck.com.br`, mandado por e-mail ou WhatsApp depois da reserva.
- **14/11/2026** (PR #234, #236) — A equipe confere o que chegou pelo link ao lado do que a ficha tem e aperta "Trazer para a ficha". O sistema avisa PDF editado, confere a assinatura do gov.br e mostra no Painel o link sem resposta depois de 2 dias, com o botão "Lembrar".
- **14/11/2026** (PR #235) — **Avisos a cada etapa**: e-mail para a pessoa e para a equipe, e aviso no celular da equipe.
- **16/11/2026** (PR #263, #264, #266) — Conserto da ficha pela internet (documento com foto e comprovante de renda eram recusados; ficha nova herdava arquivos de uma antiga), nova ordem da ficha, botão "Testar o aviso" e aviso no celular com a logo da empresa. O dono viu o aviso tocar no celular em 17/11.
- **17/11/2026** (PR #283, #287) — Ficha reprovada ou com desistência: os dados pessoais (CPF, RG, renda, contatos) são apagados no mesmo prazo dos documentos (3 meses, ajustável nas regras), no aparelho e também no servidor da nuvem. Ficam o nome, as datas, a decisão e a reserva.
- **17/11/2026** (PR #296) — LGPD: "Dados de uma pessoa" (pelo CPF, mostra e baixa tudo o que há da pessoa) e "Apagar tudo desta pessoa", liberado só 10 anos depois do fim do último contrato.
- **17/11/2026** (PR #300, #301) — **Notificação ao inquilino**: prazo em dias úteis, PDF, envio por e-mail, baixa, 2ª notificação e multa digitada no próximo boleto.
- **17/11/2026** (PR #304) — A conferência dos documentos do link fica registrada (quem conferiu, quando e qual arquivo); se o arquivo muda depois, aparece "⚠ o arquivo mudou depois da conferência".
- **18/11/2026** (PR #318) — Página pública de **Política de privacidade** (`ficha.ankjck.com.br/privacidade`), exigida pelo Google para ligar o Gmail: diz que o sistema só envia e-mails e não lê a caixa de entrada.
- **18/11/2026** (PR #320) — **Comunicado de contatos**: cada inquilino e fiador recebe um link só dele, confirma e-mail e celular na página `ficha.ankjck.com.br/contatos`, o e-mail é confirmado por um código e fica a prova do aceite. Há lembrete para quem não respondeu.
- **19/11/2026** (PR #323) — Os botões de Solicitações e Notificações saem da lista de Inquilinos e ficam só em **Inquilinos → Comunicações** (ex.: "Notificações (3 · 1 com prazo vencido)").
- **19/11/2026** (PR #324) — O inquilino novo começa por um **formulário curto de reserva** (data, imóvel, contato, proposta, o que está incluso, reserva); o resto a pessoa preenche pelo link da ficha.
- **19/11/2026** (PR #325, #326) — Solicitação com data de conclusão passa a "Concluída" (conferido pelo dono em 19/11); o filtro das solicitações pela situação, que estava quebrado, volta a funcionar.
- **21/11/2026** (PR #338) — Os nomes se separam: **"Novo pedido de reserva"** (interessado novo) e **"Nova solicitação do inquilino"** (pedido de quem já aluga).
- **21/11/2026** (PR #339) — O comunicado de contatos vai também ao inquilino solidário e ao representante da empresa; a resposta de cada um atualiza os contatos dele no contrato.
- **21/11/2026** (PR #340) — A página do inquilino mostra todas as NFs do boleto, uma por empresa.
- **21/11/2026** (PR #343) — Link da ficha mandado de novo: o antigo continua valendo e o novo vence na mesma data (ex.: link de 10/11 até 17/11; "Lembrar" em 12/11 gera outro também até 17/11). "Gerar novo link" troca de vez.
- **22/11/2026** (PR #358) — A LGPD ganha página própria dentro de Sistema.

### O que foi tirado ou mudado, e por quê
- **20/10/2026** — antes: o comprovante da reserva era obrigatório para salvar; agora: salva sem ele e fica o aviso "Comprovante a buscar no banco" até anexar. Por quê: pedido do usuário (DECISOES.md, 20/10).
- **09/11/2026** — antes: cada linha de Inquilinos tinha um envelope de solicitações; agora: só o botão "Contrato", e a solicitação nasce na página Solicitações. Por quê: pedido do dono (PR #191).
- **10/11/2026** — antes: a ficha deixava escolher qualquer imóvel, até ocupado; agora: só imóvel vago. Por quê: escolher imóvel ocupado dava brecha (decisão do dono de 10/11, DECISOES.md; mantida em 21/11, item entrada-034).
- **13/11/2026** — antes: o recibo da reserva dizia que a nota fiscal sairia com o aluguel em que ela fosse abatida; agora: a frase saiu. Por quê: a reserva não emite NF, e a NF sai com o aluguel cheio (PR #207; confirmado pelo dono em 17/11, DECISOES.md).
- **14/11/2026** — pedido descartado: triagem antes da reserva. Por quê: o dono não quer; o link da ficha só sai depois da reserva (resposta do dono de 14/11, memória ficha-online).
- **17/11/2026** — antes: na ficha reprovada só os documentos eram apagados em 3 meses; agora: os dados pessoais também, inclusive na nuvem. Por quê: LGPD (decisão do dono de 17/11, DECISOES.md; PRs #283 e #287).
- **19/11/2026** — antes: Solicitações e Notificações tinham botão na lista de Inquilinos; agora: só em Inquilinos → Comunicações. Por quê: pedido do dono de 19/11 (PR #323, DECISOES.md).
- **19/11/2026** — antes: o inquilino novo começava pela "Nova ficha" completa; agora: pelo formulário curto, e a pessoa completa pelo link. Por quê: pedido do dono de 19/11 (PR #324, DECISOES.md).
- **21/11/2026** — antes: "Nova solicitação de reserva"; agora: "Novo pedido de reserva", e "Solicitação" fica só para os pedidos do inquilino. Por quê: os dois nomes confundiam (decisão do dono de 21/11, comunicacoes-030, DECISOES.md; PR #338). ⚠ Fontes discordam: a linha de 19/11 do DECISOES.md ainda fala em "solicitação de reserva"; vale a de 21/11 (o código usa "Novo pedido de reserva").
- **21/11/2026** — antes: o comunicado ia só ao inquilino e aos fiadores; agora: também ao solidário e ao representante. Por quê: todos que assinaram precisam saber (decisão do dono de 21/11, comunicacoes-007; PR #339). ⚠ Fontes discordam: a memória do Claude (comunicado-contatos) ainda diz só "inquilinos e fiadores".
- **21/11/2026** — antes: cada novo envio do link da ficha matava o anterior; agora: o anterior continua valendo até a mesma data. Por quê: a equipe controla o prazo pelo primeiro link (decisão do dono de 21/11, entrada-007; PR #343).

### Pela metade ou nunca feito
- **Termo de aceite da reserva** — **não existe** na versão principal de hoje (24/11): procurei no código e não há a etapa antes do pedido de reserva (mensagem com as condições do imóvel → aceite pelo link com código → depósito → pedido de reserva). Existe uma cópia de trabalho aberta para isso (`termo-reserva-871571`), mas ainda **sem nenhuma mudança gravada**. Pedido em 18/11; ficou parado esperando decisões do dono. Em 24/11 ele decidiu: devolve tudo em até 7 dias; depois disso a empresa fica com 40% (reserva de R$ 500,00 → devolve R$ 300,00, fica com R$ 200,00), mas falta confirmar se 40% é aceito pela lei; 3 dias úteis para mandar os documentos, senão a reserva é cancelada; a reserva é sempre abatida do 1º aluguel. Continua em aberto o "documento falso" (o dono quer ficar com tudo; a sugestão do Claude é não acusar no texto e tratar como desistência). ⚠ Fontes discordam: a memória do Claude (22/11) diz "faltam as 3 decisões"; o PENDENCIAS_DO_DONO.md, seção B de 24/11, já tem quase todas; e o item 1 do "COMECE POR AQUI" do mesmo arquivo ainda mostra a sugestão antiga de 20% e a dúvida "caução ou 1º aluguel".
- **Pessoa ver e corrigir pelo link o que já mandou** (trocar ou apagar um anexo errado, aviso à equipe a cada dado novo) — **não existe**: não encontrei no código da página da ficha. Pedido em 24/11, junto do termo de aceite.
- **Comunicado de contatos enviado de verdade** — o sistema **existe** (#320, #339), mas o dono ainda não mandou nem para um inquilino de teste (item 4b do PENDENCIAS_DO_DONO.md). Só funciona pela nuvem, por isso o Claude não o testou na tela.
- **Ficha pela internet com um conhecido** — o link **existe**, mas o teste de ponta a ponta com uma pessoa de verdade não foi feito (item 5 das pendências, desde 19/11).
- **Simular todas as etapas com pessoas de teste** (ficha, aprovação, contrato, entrada, notificação, saída e devolução, com os e-mails saindo de verdade) — **não feito**; em 24/11 o dono decidiu deixar para depois dos boletos e do termo da reserva (item 5b).
- **Página de privacidade no endereço de verdade** — a página **existe** no código; falta o dono abri-la no endereço público para conferir (item nuvem-012).
- **Assinatura digital da empresa na ficha cadastral** — **fica de fora de propósito**: a ficha é assinada pela própria pessoa (gov.br ou à mão), não pela empresa.


## 4. Contratos, regras e imóveis

### O que foi feito (linha do tempo)
- **09/10/2026** (PRs #3, #4, #5, #6) — Página de IPTU por ano e o seguro obrigatório cadastrado no imóvel.
- **13/10/2026** (PR #12) — Contratos gerados a partir de modelos (Residencial e Não residencial). O texto muda sozinho conforme a garantia, o solidário, a bonificação e as contas incluídas. Valores e datas saem por extenso, em PDF ou Word. Os modelos usam marcas como `{campo}` (troca pelo dado do contrato) e `[se x] … [fim]` (o trecho só entra quando vale). Na mesma rodada: modelo de vistoria por imóvel (PR #13) e IPTU dentro de Imóveis (PR #14).
- **15/10/2026** (PR #25) — Termos aditivos: vários por inquilino, cada um com data, assunto e arquivo assinado. A continuação de contrato (troca de titular) herda o contrato, a vistoria e o recibo das chaves.
- **16/10/2026** (PRs #31, #39, #40, #41) — IPTU dividido pelos dias ocupados (parcela de R$ 300,00 com entrada em 11/04: inquilino paga R$ 200,00 e o dono R$ 100,00), carta de reajuste e aba Impostos: PIS/COFINS, IRPJ e CSLL pelas NFs, adicional do IRPJ, LC 224/2025 e guia abaixo de R$ 10,00 passada para a seguinte.
- **21/10/2026** (PRs #66, #67) — Termo aditivo de troca do dia de vencimento gerado pelo sistema. Muda só o dia, sem cobrança proporcional (do dia 10 para o dia 20 a partir de 11/2026: o aluguel de outubro vence em 20/11/2026, valor normal).
- **23/10/2026** (PRs #77 a #84, #97 a #104) — Troca de titular completa: o novo contrato traz as correções, a caução, os boletos e a reserva, e quem saiu fica inativo. A garantia herdada é cuidada no contrato anterior. A lista de Imóveis ganhou endereço inteiro, matrícula e contas alinhadas.
- **27/10/2026** (PR #127) — Termo aditivo de troca de inquilino: quem sai, quem entra (solidários), fiadores e testemunhas. Os débitos até a véspera ficam com quem sai.
- **29/10/2026** (PRs #134, #135) — Na troca de titular, a garantia continua ou é devolvida (e o novo deposita a sua). A aplicação da garantia lançada no anterior passa ao novo.
- **30/10/2026** (PRs #137, #138) — Na troca de titular, o contrato só passa ao novo com o termo aditivo assinado, mesmo depois da data da troca. Até lá o anterior continua ativo, com boletos, garantia, seguro e reserva.
- **03/11/2026** (PR #140) — Ao anexar o aditivo de vencimento assinado, o cadastro e os boletos em aberto mudam sozinhos para o dia novo.
- **07/11/2026** (PRs #149, #164, #174) — Termo aditivo "perdido" (assinado, mas o papel sumiu): vale como assinado, menos o da troca de titular. IPTU pago à vista no mapa e um caminho só para marcar a guia paga.
- **12/11/2026** (PR #201) — Tela "Regras do sistema" (só o administrador muda): reajuste, feriados da cidade, multa e juros, proporcional, dia de gerar boletos, caução, valores que o Novo contrato traz e prazos. Cada regra mostra exemplo, consequência e lei. O sistema avisa, não proíbe (ex.: "Fiador + depósito" é permitido, com aviso). O residencial novo passa a vir com 30 meses.
- **12/11/2026** (PR #202) — Revisão jurídica do contrato, furos A1 a A20 (`REVISAO_JURIDICA_CONTRATO.md`), 1ª parte aprovada: aviso prévio de 1 mês (art. 6º), honorários de 20% (eram 25%), cláusula de dados pessoais (LGPD), procuração com as companhias do imóvel e cônjuge do fiador. Os modelos já gravados recebem as trocas sozinhos, desde que o texto antigo esteja igual (`ATUALIZACOES_MODELO`). Também o informe do IR: aviso de 01/02 a 31/03 e e-mail aos inquilinos com NF.
- **13/11/2026** (PRs #203, #204) — Respostas do dono aos itens que faltavam da revisão. Vistoria de entrada feita pela empresa com o imóvel vazio, com 5 dias úteis para apontar defeito (chaves em 13/11/2026 → até 23/11/2026). Também: retomada só nos casos da lei no residencial com menos de 30 meses, abandono só comprovado, troca do fiador, assinatura eletrônica ou 2 testemunhas, despesas extraordinárias do condomínio com a locadora.
- **13/11/2026** (PRs #208, #210, #212) — Na troca de titular: o seguro passa ao novo e fica como histórico no anterior. Anexar o termo pede "estou ciente". O termo ganhou a cláusula das contas de consumo. A caução fica com quem pagou, e a data paga pode ser corrigida. "Correção" virou "Complementação de caução". Decisão da direção: garantia em dinheiro nunca passa adiante; é devolvida com a poupança e quem entra deposita a sua.
- **13/11/2026** (PRs #214 a #217) — Empresas mostra onde está cada caução, já corrigida pela poupança. O IPTU deixa de contar em dobro na troca de titular. O IPTU do ano ganha um resumo: o que os inquilinos pagam, o que o dono paga, a sobra e o que está em aberto.
- **17/11/2026** (PRs #270, #272, #307) — "Sem ANK fixa": os dados da empresa vão para o cadastro. Exemplos: quem assina os documentos do inquilino, a cidade dos documentos, as companhias de energia e água, a conta da caução e o nome que assina os e-mails. No contrato novo, a Internet vem "Não se aplica". Para a ANK/JCK nada muda.
- **17/11/2026** (PR #314) — Respostas do contador. O informe do IR sai por empresa, só com o aluguel, mês a mês com o número e a data da NF. A DIMOB é entregue pelo contador e o sistema não gera nada. A numeração da NF é uma só para ANK e JCK.
- **18/11/2026** (PR #322, juntada às 22h de 18/11) — Regras especiais por contrato: grupos com nome (ex.: "Regra 15 dias") e o campo "Regras deste contrato". Guardam só o que é diferente. Exemplo: entrada em 15/02/2027 com aluguel de R$ 1.800,00 dá R$ 900,00 pelos dias reais do mês (14/28) e R$ 960,00 pelas regras do sistema (16/30). Na troca de titular, o novo contrato fica com a mesma regra.
- **20/11/2026** (PR #331) — O seguro contra incêndio sempre existe: a opção "Não tem" sai, e o contrato antigo marcado assim ganha um aviso. IPTU com parcela arredondada: a guia de R$ 2.125,37 em 10 parcelas de R$ 213,00 deixa uma sobra de R$ 4,63, que abate o custo de IPTU do dono. Foram apagadas 4 telas antigas sem botão (troca de fiador, ligar contrato a imóvel, fiador avulso, correção avulsa).
- **21/11/2026** (PR #336) — Declaração do IR na troca de titular: cada um declara só o que pagou. Maria pagou de janeiro a junho e Pedro de julho a dezembro. Na renovação da mesma pessoa, os dois contratos continuam somados.
- **21/11/2026** (PR #337) — A troca de titular no meio do mês fecha sempre em 30/30. Troca em 28/02: o anterior paga 27/30 e o novo 3/30 (antes, 1/30). Troca no dia 31: o novo não tem boleto naquele mês.
- **21/11/2026** (PR #341) — Contas do imóvel: o mês troca só no botão "Ir" (no iPhone, a roleta trocava a tela a cada giro).
- **21/11/2026** (PR #344) — Endereço digitado com um dado errado (ex.: inquilino nº 999, mês 2026-13) abre a tela normal com o aviso no alto: "Endereço com dado errado…".
- **21/11/2026** (PR #347) — Ao apagar um termo aditivo já anexado, o sistema pergunta se ele valeu. Se não valeu, a mudança é desfeita: o vencimento volta ao dia antigo, o novo valor sai ou a troca de titular volta a esperar o termo. Se valeu, a mudança continua.
- **22/11/2026** (PR #358) — "Dados e backup" virou "Sistema". Modelos de contrato, Termos aditivos e o Modelo Excel da NF ficam em Sistema → Modelos de documentos (`#/sistema-modelos`). As Regras do sistema continuam em `#/regras`.

### O que foi tirado ou mudado, e por quê
- **09/10 → 26/10/2026** — antes: o seguro obrigatório era do imóvel (PRs #5 e #6); agora: cada inquilino tem a sua apólice, e as parcelas só entram nos boletos de quem tem a apólice (PR #122). Por quê: decisão do dono de 26/10 (`DECISOES.md`). Quem sai leva a apólice e quem entra precisa de outra.
- **13/10 → 20/10 → 17/11/2026** — antes: as duas empresas assinavam o contrato como locadoras (PR #12); depois: só a ANK, também na vistoria, no recibo das chaves e na carta (PR #46, 20/10); agora: quem assina é escolhido em Empresas, no campo "Assina os documentos do inquilino" (PR #270). Por quê: o pedido de 20/10 e, em 17/11, o preparo para vender o sistema a outras empresas (`MUTIRAO_3000.md`, frente "venda").
- **29/10 → 13/11/2026** — antes: na troca de titular, a caução ou o depósito podia "continuar a mesma" (PR #134); agora: a garantia em dinheiro é sempre devolvida a quem depositou, corrigida pela poupança (ex.: R$ 3.800,00 viraram R$ 4.371,39 em 10/11/2026), e quem entra deposita a sua (PR #212). Por quê: decisão da direção de 13/11 (`DECISOES.md`). As trocas antigas ficaram como estavam.
- **12/11/2026** — antes: honorários de 25% e multa de 3 aluguéis pela falta de aviso prévio; agora: honorários de 20% e aviso prévio de 1 mês de aluguel (art. 6º). Por quê: revisão jurídica, itens A4 e A19, aprovados pelo dono em 12/11 (`REVISAO_JURIDICA_CONTRATO.md`).
- **12/11 → 13/11/2026** — antes: 10 dias para o inquilino apontar defeito na entrada; agora: 5 dias úteis, com a vistoria feita pela empresa antes da entrega das chaves. Por quê: o dono explicou em 13/11 que não dá para fazer a vistoria junto com o inquilino (`REVISAO_JURIDICA_CONTRATO.md`, seção F).
- **13/11/2026** — antes: "Correção da caução"; agora: "Complementação de caução" em todo o sistema (PR #210). Por quê: pedido do dono de 13/11 (memória `caucao-heranca-pagador.md`). O botão "Corrigir caução" e a regra B7 ficaram com o nome antigo.
- **20/11/2026** — antes: o seguro contra incêndio tinha a opção "Não tem"; agora: só "Por conta do inquilino" ou "Incluso no aluguel" (conferido: `SITUACOES_SEGURO` e a regra `conta_seguro_padrao` não têm mais "Não tem"; o contrato antigo assim recebe aviso). Por quê: decisão do dono de 20/11, o seguro é obrigatório por lei (`DECISOES.md`, memória `decisoes-20-11.md`).
- **20/11/2026** — tiradas 4 telas antigas sem botão: troca de fiador, ligar contrato a imóvel, fiador avulso e correção avulsa (PR #331). Por quê: o dono aprovou apagar em 20/11 (`MUTIRAO_19_11.md`, item fios-019).
- **21/11/2026** — antes: na troca de titular, o novo pagava só os dias do calendário (troca em 28/02 = 1/30) e a declaração do IR do novo somava o que o anterior pagou; agora: o mês fecha 30/30 e cada um declara só o seu (PRs #336, #337). Por quê: decisões do dono de 21/11 (itens saida-016 e impressos-002 de `MUTIRAO_19_11.md`).
- **22/11/2026** — antes: Modelos de contrato e Regras ficavam em "Dados e backup"; agora: o menu chama "Sistema" e os modelos ficam em "Modelos de documentos" (PR #358). O endereço `#/dados` continua o mesmo. Por quê: pedido do dono de 22/11 para organizar a página.
- ⚠ Fontes discordam: a memória `regras-configuraveis.md` diz que as Regras do sistema foram feitas "sem PR" (só um registro de 12/11). Na verdade entraram pela PR #201, juntada em 12/11/2026.

### Pela metade ou nunca feito
- **CBS 2027 nos impostos** — não existe. Conferido: a aba Impostos (`IMPOSTOS`, `regras.js`) só tem PIS/COFINS 3,65%, IRPJ e CSLL; a palavra "CBS" não aparece no código. Parou de propósito: falta a alíquota final do Senado (prazo até 15/12/2026; tema volta em 16/12/2026). Também falta a resposta do contador sobre contratos antigos ficarem em 3,65%, e decidir se o aluguel passa a ser "valor + CBS". Estimativa já dada ao dono: aluguel residencial de R$ 3.000,00 → (3.000 − 600) × 3,39% ≈ R$ 81,00 (hoje R$ 109,50).
- **Multa de saída, aviso prévio e prazo da vistoria de saída como regra escolhida** (C3, C4, C6 de `REGRAS_CONFIGURAVEIS.md`) — existem em parte. Estão escritos no texto dos modelos de contrato, que o dono pode editar, mas não entraram na lista de regras (conferido em `config-regras.js`). O documento diz que "ficam com outras sessões" e nenhuma sessão os transformou em regra.
- **Assinatura digital no contrato, nos termos aditivos e na carta de reajuste** — não existe. Conferido: a assinatura (`assinatura.js`) só liga os recibos e termos de quitação. Fica para quando o dono pedir (`PENDENCIAS_DO_DONO.md`, item 2.5).
- **Cláusulas de taxas e cobranças extras** (despesas de cobrança, visita perdida, serviço extra pedido pelo inquilino) — não existe. A pesquisa de 21/11 foi entregue no chat. Falta o dono decidir se o Claude escreve as cláusulas para o advogado conferir ou se calcula quanto embutir no aluguel (`PENDENCIAS_DO_DONO.md`, item 6 e item C4 de 24/11).
- **Modelos de documentos em PDF para o dono ler e ajustar** — pedido em 24/11 (`PENDENCIAS_DO_DONO.md`, C2), ainda não feito.
- **Conferência do dono no dia a dia** — as regras especiais (#322) e as trocas de titular de 21/11 (#336, #337) estão no sistema. As próprias PRs dizem "não testado na tela" para #336 e #337, e o dono ainda não conferiu (`PENDENCIAS_DO_DONO.md`, itens 4e e 5).
- **Separar os encargos (IPTU, seguro, multa, juros) no informe do IR** (item D5) — não existe, e não vai existir: o contador decidiu em 17/11 que o informe leva só o aluguel. ⚠ Fontes discordam: `REVISAO_JURIDICA_CONTRATO.md` (seção D) ainda diz que faltam "o alerta em fevereiro e o e-mail desse envio". Os dois já existem desde 12/11 (aviso de 01/02 a 31/03 em `email-dados.js`, modelo `informe_ir`).
- **Documento `REGRAS_CONFIGURAVEIS.md` com o começo estragado** — a 1ª linha é um pedaço de tabela ("Fora: o dono trata em outra sessão ||…") no lugar do título. Está assim desde a mudança de 12/11/2026 (828289f), conferido no histórico do arquivo. O conteúdo de baixo está inteiro.


## 5. Saída, garantia e recibos
### O que foi feito (linha do tempo)
- **09/10/2026** (PR #2) — Primeiras garantias (caução, fiador etc.), renovação e registro da saída do inquilino.
- **09/10/2026** (PR #7) — Troca de garantia ou de fiador no contrato que já está valendo.
- **13/10/2026** (PRs #12 e #13) — Vistoria de entrada pelo sistema, com modelo próprio de cada imóvel, junto com o contrato e o recibo das chaves.
- **16/10/2026** (PR #42) — Os fiadores passam a aparecer no contrato, e os comprovantes ficam anexados.
- **21/10/2026** (PRs #52, #55 e #60) — Troca de garantia com botão para cancelar a última troca e para incluir, trocar ou tirar fiador. A garantia só conta como paga com o comprovante anexado.
- **21/10/2026** (PRs #62 e #63) — Vistoria com cada parte numa linha, link das fotos, "Não se aplica", textos padrão editáveis e botão "Baixar PDF".
- **22/10/2026** (PRs #69 e #71) — Caução e depósito de garantia pagos em parcelas, cada uma com seu comprovante. A garantia pode ser aplicada na conta de outra pessoa, e a devolução sai de onde o dinheiro foi depositado.
- **22 e 23/10/2026** (PRs #78 a #85) — Na troca de titular, a garantia herdada é cuidada no contrato anterior: não soma duas vezes e não se desfaz sozinha.
- **24/10/2026** (PR #109) — A saída fica num lugar só, em duas etapas: "Informar data de saída", quando o inquilino avisa (o último boleto sai proporcional), e depois "Fazer cálculo final". A leitura dos relógios de água e luz passa a ser feita na vistoria.
- **27/10/2026** (PR #128) — No recibo das chaves, a empresa assina como "Representante da administradora", sem o nome da pessoa.
- **29/10/2026** (PRs #134 e #135) — Na troca de titular, o sistema pergunta se a garantia continua ou se é nova. Se é nova, a do titular anterior é devolvida a ele, corrigida e menos os débitos.
- **07/11/2026** (PRs #166, #168, #172 e #176) — Roteiro da saída passo a passo, nesta ordem: aviso prévio, vistoria, chaves, contas, cálculo final, devolução da garantia e último boleto. O resultado da vistoria de saída vem da própria vistoria registrada. O alerta "Devolver garantia" pode ser ligado ou desligado. Com a saída registrada, o inquilino sai da tela de inadimplência.
- **12/11/2026** (revisão jurídica, PR #202) — A falta do aviso de 30 dias custa 1 mês de aluguel e encargos (art. 6º). A multa da saída antecipada é de 3 aluguéis, proporcional ao tempo que falta. A etapa "Entrega das chaves" passa a "Devolução das chaves", e entra a etapa final "Arquivo físico".
- **13/11/2026** (PR #204) — Recibos e termos de quitação: recibo da reserva, termo de devolução da reserva, recibo da caução ou do depósito de garantia, termo de entrega do imóvel e acerto final com quitação (valores discriminados). O e-mail de cada etapa anexa sozinho o PDF e o comprovante.
- **13/11/2026** (PR #207) — "Desistiu antes de assinar": a reserva é devolvida por inteiro e o contrato gerado e não assinado é cancelado. Ex.: reserva de R$ 1.000,00 em 05/11/2026, desistência em 13/11/2026 → contrato cancelado e alerta para devolver R$ 1.000,00.
- **13/11/2026** (PRs #210 e #211) — Na troca de titular, a caução fica com quem pagou (comprovante, data e depósitos), e a data paga pode ser corrigida ("✎ corrigir data"). A caução passa a ser corrigida pela poupança do Banco Central, contada do aniversário de cada depósito. O valor corrigido aparece no termo da troca.
- **13/11/2026** (PR #212) — Decisão da direção: garantia em dinheiro nunca passa adiante. Na troca de titular e na troca de garantia, a caução é devolvida corrigida a quem depositou, e quem entra deposita a sua.
- **13/11/2026** (PRs #214 e #215) — Em Empresas, o sistema mostra onde está cada caução ou depósito de garantia e quanto vale hoje, corrigido pela poupança.
- **15/11/2026** (PR #238) — A vistoria de saída tem data e hora marcadas e convite por e-mail, e registra se o inquilino acompanhou. A etapa das chaves só fecha com o termo de devolução das chaves assinado e anexado.
- **15/11/2026** (PR #239) — Cada reparo da vistoria de saída recebe um valor, que entra sozinho nos débitos do cálculo final. Ex.: porta riscada R$ 350,00 + pintura da sala R$ 700,00 = R$ 1.050,00.
- **16/11/2026** (PRs #246 e #247) — Contra-vistoria de entrada vira etapa, com prazo de 5 dias úteis. Passado o prazo, ela continua pendente até alguém anexar o documento ou marcar "Não houve".
- **16 e 17/11/2026** (mutirão 3000) — Os débitos da saída são calculados num lugar só, e o acordo entra só pelas parcelas. Desfazer o cálculo final faz o boleto descontado da garantia voltar a ser cobrado (debitosDaSaida, liberarBoletosDaSaida).
- **20/11/2026** (PR #330) — Não existe mais pagamento em parte. O complemento da caução só é aceito pelo valor exato, e quem já avisou a saída não recebe cobrança de complemento.
- **20/11/2026** (PRs #329, #331 e #332) — Botão "Gerar boleto do saldo" quando os débitos passam da garantia. Ex.: garantia de R$ 2.000,00 e débitos de R$ 2.300,00 → boleto de R$ 300,00, sem NF. Pago atrasado, cobra a multa e os juros do contrato; pago, marca sozinho a etapa do roteiro. Entra também a multa da saída antecipada como sugestão (3 aluguéis cheios, proporcional aos dias que faltam).
- **21/11/2026** (PR #349) — Adiar a saída: o boleto do último mês, ainda em aberto, é refeito pelos dias novos, e a vistoria marcada anda junto. Ex.: aluguel de R$ 3.000,00, saída de 10/12 para 15/12 → de R$ 1.000,00 para R$ 1.500,00.
- **21/11/2026** (PR #351) — Recibo da devolução da garantia, para a pessoa assinar que recebeu, na troca de garantia e na troca de titular com garantia nova. O recibo assinado é anexado e vai para a pasta física.

### O que foi tirado ou mudado, e por quê
- **24/10/2026** — antes: a saída podia ser feita por três caminhos (campo "Data de saída" no Editar contrato, caixinha "Ativo" e "Registrar saída"); agora: só pela caixa "Saída do inquilino". Por quê: eram caminhos que não batiam entre si (pedido do dono, DECISOES.md, 24/10).
- **29/10/2026** — antes: na troca de titular, a garantia passava sempre ao novo titular (decisão de 22/10); agora: o sistema pergunta se a garantia continua ou é nova. Por quê: "às vezes é a mesma caução, às vezes não" (pedido do dono, DECISOES.md, 29/10).
- **07/11/2026** — antes: o cálculo final perguntava o resultado da vistoria de saída, e uma das opções era "Contestada"; agora: o resultado vem da vistoria registrada, e a contestação vai nas Observações. Por quê: a mesma informação ficava em dois lugares (rotina C16, aceita pelo dono, DECISOES.md, 07/11).
- **12/11/2026** — antes: a etapa se chamava "Entrega das chaves"; agora: "Devolução das chaves", e o roteiro ganhou a etapa "Arquivo físico". Por quê: pedido do dono (DECISOES.md, 12/11).
- **13/11/2026** — antes: o nome era "Correção da caução"; agora: "Complementação de caução" em todo o sistema. O botão "Corrigir caução" ficou com o nome antigo de propósito (decidido em 14/11, PENDENCIAS_DO_DONO.md). Por quê: pedido do dono (memória caucao-heranca-pagador).
- **13/11/2026** — antes (PR #211, do mesmo dia): na troca com a mesma garantia, quem entrava pagava a quem saía, e a caução continuava depositada; agora: caução e depósito nunca passam adiante e a troca é sempre com garantia nova. A escolha continua só para fiador e seguro fiança, e as trocas antigas ficam como estavam. Por quê: decisão da direção, levada pelo dono em 13/11 (DECISOES.md).
- **13/11/2026** — antes: proposta do Claude de que o rendimento da poupança contasse como caução; agora: a caução depositada não muda com o rendimento, e o complemento nos reajustes compara com o valor depositado. Por quê: o rendimento é do inquilino, e o complemento está no contrato (pedido do dono, DECISOES.md, 13/11).
- **15/11/2026** — antes: a etapa das chaves fechava só pela data de saída, e o inquilino podia escolher consertar ele mesmo; agora: a etapa só fecha com o termo assinado, e cada reparo é descontado pelo valor do orçamento, sem a opção de consertar. Por quê: receber as chaves não dá quitação (revisão jurídica de 13/11; "sem opção dele consertar", dono em 15/11, DECISOES.md).
- **17/11/2026** — antes: havia uma parte que trazia de volta a garantia herdada desfeita; agora: foi tirada na limpeza da PR #310. Por quê: não era mais usada (decidido em 17/11, PENDENCIAS_DO_DONO.md).
- **20/11/2026** — antes: o saldo devedor da saída era pago só por Pix ou depósito; agora: é cobrado por boleto. Por quê: o boleto é título executivo, e "se não pago é protesto e execução" (dono em 20/11, DECISOES.md e memória decisoes-20-11).
- **20/11/2026** — antes: o boleto podia ser "pago em parte", e a diferença ia para o boleto seguinte (decisão de 16 e 17/11); agora: valor menor que o devido é recusado, e o complemento da caução só é aceito pelo valor exato. Por quê: "Não existe boleto pago em parte!" (dono em 20/11, DECISOES.md).
- **20/11/2026** — antes: quatro telas antigas sem botão (trocar fiador, fiador avulso, ligar contrato a imóvel, correção avulsa); agora: foram apagadas (conferido: não existem mais no código). Por quê: decisão do dono de 20/11 (fios-019, mutirao-19-11/lote-I.md).
- **21/11/2026** — antes: adiar ou desfazer a saída só mostrava a diferença (ex.: "faltam R$ 750,00") e não lançava nada; agora: o último boleto em aberto é refeito. Por quê: o inquilino nunca paga adiantado (decisão do dono, item 3 de PENDENCIAS_4000.md).

### Pela metade ou nunca feito
- **Seguro fiança** — existe: continua como opção de garantia no cadastro e tem cláusula própria no contrato e no termo da troca (formularios.js, modelos-contrato.js). Pela memória (recibos-e-quitacao, 13/11), o dono não trabalha com seguro fiança, mas isso não está escrito em DECISOES.md e a opção nunca foi tirada. ⚠ Fontes discordam: a memória diz que não se usa; o sistema ainda oferece a opção.
- **Multa pela falta do aviso de 30 dias** — existe em parte: está no texto do contrato (1 mês de aluguel e encargos, art. 6º), mas o cálculo final não sugere esse valor sozinho, como faz com a multa da saída antecipada (conferido: só existe multaSaidaAntecipada).
- **Multa da saída antecipada** — existe em parte, de propósito: aparece só como sugestão no cálculo final, e a equipe inclui ou dispensa à mão.
- **"Enviar agora" com recibos e comprovantes anexados** — existe, mas nunca foi testado de verdade: só funciona na nuvem. Falta o dono conferir no celular (memória recibos-e-quitacao).
- **Mudanças de 21/11 (adiar a saída, recibo da devolução da garantia)** — feitas e testadas pelo Claude; falta o dono ver no dia a dia (PENDENCIAS_DO_DONO.md, item 5).
- **Simular uma saída inteira com pessoas de teste** — não feito: aviso, vistoria, chaves, cálculo final, boleto do saldo, devolução e e-mails de verdade para endereços de teste (pedido do dono de 18/11, PENDENCIAS_DO_DONO.md 5b).
- **Assinatura digital nos recibos da saída** — existe para os recibos e termos (recibos.js). O contrato, os aditivos e a carta de reajuste ainda não têm botão de assinatura (CLAUDE.md).
- **Reserva na caução ou no 1º aluguel** — não decidido: depende do termo de aceite da reserva, parado à espera de 3 decisões do dono (PENDENCIAS_DO_DONO.md, item 1).


## 6. E-mails, nuvem e o site
### O que foi feito (linha do tempo)
- **09/10/2026** (PR #1) — Nasce o sistema: um site que abre no navegador e grava tudo num arquivo só (`imoveis-dados.json`) dentro de uma pasta do computador escolhida pelo usuário (na prática, a pasta do OneDrive), com cópia diária e ZIP.
- **13/10/2026** (PR #9) — Usuários com login e senha e três papéis: consulta (só vê), operador (lança) e administrador (muda regras e apaga). Aberta a versão sem internet num arquivo único (PR #10).
- **13/10/2026** (PR #16) — Histórico de alterações e Empresas passam a ficar em "Dados e backup".
- **16/10/2026** (PR #42) — Painel resumido: caixas de Imóveis, Contratos ativos, Boletos em aberto (em dia e vencidos), Pagamentos aguardando NF e Solicitações.
- **20/10/2026** (PR #45) — O administrador desfaz alterações pelo Histórico, campo a campo, sempre da mais nova para a mais antiga; o "Desfeito" fica registrado.
- **24/10/2026** (PR #108) — Alertas do Painel agrupados por tipo.
- **05/11/2026** (PR #142) — Primeira auditoria de segurança (`AUDITORIA_SEGURANCA.md`): 2 achados altos, 8 médios e 7 baixos, todos corrigidos na mesma PR (proteção contra código malicioso nos endereços e nos anexos, política de segurança do site, senhas guardadas com 600 mil voltas de embaralhamento). Escrito também `SEGURANCA.md` (o que é seguro, o que não é, e o passo a passo do dono). No celular, a lista de boletos vira cartões.
- **06/11/2026** (PRs #146 e #148) — **Dados na nuvem no ar** (Cloudflare): o sistema continua igual na tela, mas cada gravação manda só o que mudou; cada aparelho guarda uma cópia cifrada, funciona sem internet (fila de envio) e vira aplicativo instalável. Entrada pelo e-mail (código do Cloudflare Access) + senha do sistema. Endereço `erp.ankjck.com.br`. A passagem conferiu 2.874 registros e 283 anexos (256 MB) iguais aos da pasta. Tela de conflitos (`#/conflitos`).
- **07/11/2026** (PRs #151 a #154) — Celular: toda tabela que não cabe vira cartões sozinha; PDF e foto abrem na própria tela (visualizador); ícone do aplicativo com o desenho da logo; o aplicativo confere a versão a cada abertura e "Dados e backup" mostra a versão em uso com "Atualizar agora".
- **07/11/2026** (PRs #155 a #175) — **Rotina de melhoria** (`ROTINA_DE_MELHORIA.md`): bloco A (8 riscos reais da nuvem: correções que não rodavam na nuvem, sessão em dois aparelhos, backup seguro e "Voltar para este dia" na nuvem, tempo limite, regras só do administrador conferidas no servidor), bloco B (velocidade) e bloco C (20 inconsistências em fluxos). A versão sem internet vira "versão PC", gerada pelo GitHub a cada mudança aceita (PR #163).
- **09/11/2026** (PR #183) — Site fora do ar passa a ser tratado como "sem internet": abre-se o **aplicativo instalado**, que usa a cópia do aparelho e envia sozinho depois. Conflito entre aparelhos: só o administrador escolhe.
- **09/11/2026** (PR #190) — **Revisão "Raio-X"**: 10 erros, 22 achados e 10 melhorias, todos corrigidos. Ex.: com 5 anos de dados, o Painel caiu de 1,6 s para 0,06 s; cada clique que grava caiu de 339 para 90 milésimos de segundo. Na nuvem, os backups ficaram só para o administrador (achados N1 e N2 da auditoria).
- **09/11/2026** (PRs #193 a #195) — **Ícone do aplicativo escolhido pelo administrador**: antes de escolher, o aplicativo se chama "Imóveis" com um quadrado branco "ERP"; em Empresas o administrador enquadra a logo (arrastar, zoom, fundo) e a nuvem guarda o ícone.
- **10/11/2026** (PRs #192 e #196) — Inquilinos no celular: telefone ao lado do nome, botões de WhatsApp, ligar e e-mail.
- **11/11/2026** (dentro da PR #202) — **Estudo do produto comercial** (`ESTUDO_PRODUTO_COMERCIAL.md`): há um nicho sem dono (locador com carteira própria que emite NF e cobra pelo próprio banco); o sistema já tem "o difícil" e falta "o básico de produto" (vários clientes, cadastro, portal, assinatura eletrônica).
- **12/11/2026** (PR #202) — **E-mails por etapa**: 12 modelos (envio da ficha, ficha aprovada e reprovada, contrato, entrega das chaves, vistorias, aviso de saída, devolução das chaves, acerto final, encerramento e informe anual do IR), botão ✉ em cada etapa com "Copiar texto", "Abrir no Gmail" e "Enviar agora". Remetente "Administradora" <administracao@ankjck.com.br>, com cópia oculta e o fecho "Agradecemos e ficamos à disposição em caso de dúvidas.". Envio direto pelo Gmail preparado, mas dependia de um código gerado no computador.
- **13/11/2026** (PR #206) — O e-mail da etapa leva sozinho o documento assinado por todos (contrato, vistoria, chaves, aditivos, quitação).
- **13/11/2026** (PRs #220 a #228) — **Revisão de desempenho, dados e botões repetidos** (itens R1–R16 e P1–P5): abrir sem esperar a internet (com sinal fraco, no máximo 3 s para conferir a versão e 5 s para a página, depois abre a cópia); gravação na nuvem de 119 para 67 milésimos; sugestão do extrato de 246 para 8 milésimos; histórico mais magro (sem a imagem do QR Pix); as bibliotecas (3 MB) não são mais baixadas de novo a cada publicação.
- **15/11/2026** (sem PR; `PROPOSTA_LICENCA_E_PROGRAMA_PC.md`) — Proposta de **licença por chave** aprovada pelo dono: plano básico com até 20 imóveis, 20 contratos ativos e 4 usuários; teste grátis de 30 dias; vencida, 15 dias normais, depois só leitura e dados apagados 3 meses depois (ex.: vencida em 20/01/2029 → só leitura em 05/02/2029 → apagada em 20/04/2029); uma nuvem para todos com um cofre por cliente; licença da casa sem prazo.
- **16/11/2026** (PRs #244, #245 e #248) — Programa do PC entra com e-mail e senha (sem arquivo de configuração). Base das licenças e do painel de vendas (`vendas.ankjck.com.br`) na nuvem. A #245 tinha entrado na branch de outra PR e não na principal: reaberta como #248.
- **16/11/2026** (PRs #250 a #255) — **Mutirão de 16/11**: 58 problemas em 4 frentes, corrigidos em 6 PRs independentes (666 testes). Inclui o aplicativo sem internet mais seguro na troca de versão e o "Voltar" do celular fechando o visualizador.
- **16/11/2026** (PRs #264 e #266) — Aviso no celular (notificação do aplicativo) com a logo da empresa e botão "Testar o aviso".
- **16–17/11/2026** (PRs #267 a #302, e #304 a #310) — **Mutirão 3000**: 8 frentes, **366 erros confirmados** (regras 50, banco 50, segurança 50, dados 51, telas 50, ponta a ponta 32, desempenho 33, venda 50). No inventário de 17/11 (até a #303): 314 corrigidos, 14 em parte, 38 não (31 deles da frente "venda"). Depois vieram #304–#310 com o que faltava e não dependia do dono. Testes: 677 → 886.
- **17/11/2026** (PR #293) — Conflito entre aparelhos: fica o valor que chegou primeiro à nuvem; o outro vira proposta para o administrador escolher. Desfazer de uma alteração inteira.
- **17/11/2026** (PRs #287, #294 e #296) — LGPD e acessos: registro de quem entrou na nuvem (tela Acessos), backups cifrados, "Dados de uma pessoa" e apagar tudo 10 anos depois do fim do último contrato.
- **17/11/2026** (PR #299) — Botão **"Conectar o Gmail"** ("Entrar com o Google"): escolhe a conta, clica em Permitir, e a nuvem guarda a autorização cifrada e renova sozinha.
- **17/11/2026** (PR #290 e #302) — Régua de cobrança por e-mail: o sistema prepara, o administrador autoriza; o botão "E-mails da régua" fica em Boletos.
- **17/11/2026** (PR #308) — **Site publicado pelo GitHub Actions**: o site no ar é uma cópia compactada (cerca de 29% menor) com a lista do resumo de cada arquivo; numa versão nova o aparelho baixa só o que mudou (ex.: 4 pedidos e 56 KB em vez de 78 pedidos e 1,9 MB). A troca foi feita no mesmo dia, às 10h41 de Brasília, e conferida pelo dono no celular e no computador.
- **17/11/2026** (PR #310) — Limpeza técnica e 2ª rodada do mutirão de 16/11: telas raras carregam só quando abertas (~85 KB a menos ao abrir), códigos novos do primeiro acesso numa ida só (~47 pedidos → 1), "Voltar" do celular fecha a janela de confirmação.
- **18/11/2026** (PR #318) — Política de privacidade pública (exigida pelo Google) e **Gmail ligado** pelo dono, pelo celular.
- **18/11/2026** (PR #321) — **E-mails de cada etapa mais curtos**: 19 modelos reescritos, 17% menores, mantendo prazos, valores, multa e juros, os 5 dias úteis, LGPD e Lei 8.245. Modelo já editado pelo dono continua com o texto dele.
- **19–20/11/2026** (PRs #328 a #332) — **Mutirão de 19–20/11** (busca geral pedida pelo dono): 13 frentes, cada achado conferido por um segundo agente, **345 erros confirmados** (15 graves, 107 médios, 223 leves; uns 57 repetidos). Os 17 lotes foram corrigidos em 20/11.
- **21/11/2026** (PRs #335 a #346) — Os 14 itens "fora da lista" do mutirão de 19/11, decididos pelo dono e corrigidos.
- **21/11/2026** (PR #342) — Visualizador de PDF no celular desenha só as páginas perto da tela e solta a memória (PDF comprido no iPhone deixou de travar).
- **22/11/2026** (PR #358) — **"Dados e backup" passa a se chamar Sistema**, com páginas próprias: Empresas (com o certificado digital), Banco, Comunicação E-mail (Gmail e modelos), Modelos de documentos e LGPD. O endereço continua `#/dados`, e os endereços antigos levam à página nova.

⚠ Fontes discordam: a `SEGURANCA.md`, seção 1 ("Resposta direta"), ainda diz que os dados ficam só na pasta do computador e que o Cloudflare não os vê. Isso era verdade até 06/11/2026; hoje os dados estão na nuvem do Cloudflare (a seção 5b do mesmo arquivo já fala disso).

### O que foi tirado ou mudado, e por quê
- **06/11/2026** — antes: os dados ficavam num arquivo JSON numa pasta do computador (OneDrive), escolhida no navegador; agora: ficam na nuvem do Cloudflare (dados, anexos e backup diário de 30 dias), com login pelo e-mail e papéis conferidos no servidor. Por quê: no celular o navegador não deixa escolher a pasta do OneDrive, e duas pessoas gravando no mesmo arquivo podiam apagar o trabalho uma da outra (decisão do dono de 06/11, `ESTUDO_DADOS_NUVEM.md` e `DECISOES.md`). Também foi trocado o plano de mandar "o arquivo inteiro" pelo "caminho do meio" (só o que mudou, com fila sem internet). A NF passou a só ganhar número com internet.
- **07/11/2026** — antes: a "versão sem internet" era gerada a cada mudança e usada no dia a dia sem internet; agora: chama-se "versão PC", é gerada pelo GitHub e fica na pasta do backup seguro. Por quê: o dono quis um segundo jeito de abrir o sistema se o Cloudflare cair, sem trabalho a cada mudança (decisão de 07/11, `DECISOES.md`, item E1 de `ROTINA_DE_MELHORIA.md`).
- **07/11/2026** — antes: foto pela câmera no celular, "fechar o mês" travando alterações e canal do inquilino estavam na lista de ideias; agora: descartados (os dois primeiros) e adiado (o canal). Por quê: o dono decidiu usar só PDF e não quis a trava (decisão de 07/11, `ROTINA_DE_MELHORIA.md`, D13, D15 e D16).
- **09/11/2026** — antes: com o site fora do ar, abria-se a versão PC pela pasta restaurada e depois os dados eram mandados à nuvem à mão; agora: abre-se o aplicativo instalado, que manda sozinho quando a internet volta; a versão PC saiu das telas e ficou só como reserva para desastre. Por quê: o dono achou ruim levar dados de um lugar para outro (decisão de 09/11, `DECISOES.md`).
- **14/11/2026** — antes: a pasta do OneDrive ficava de reserva; agora: aposentada (pode apagar depois de uma última cópia no HD externo). Por quê: o backup seguro no disco C e o HD externo diário já cobrem a segunda camada (decisão do dono de 14/11, `ROTINA_DE_MELHORIA.md`, E2).
- **16–17/11/2026** — antes: para ligar o envio pelo Gmail era preciso criar um projeto no Google, gerar um código no computador e colá-lo no Cloudflare (uns 30 minutos); agora: botão "Conectar o Gmail" no sistema. Por quê: assim também serve para vender (cada cliente liga em 30 segundos); mandar pelo serviço de e-mail do produto com o endereço do cliente foi descartado porque não funciona com @gmail.com (decisão de 16/11, `ESTUDO_PRODUTO_COMERCIAL.md` e `DECISOES.md`).
- **17/11/2026** — antes: num conflito entre dois aparelhos, o campo voltava ao valor anterior até alguém escolher; agora: fica o valor que chegou primeiro à nuvem (o que todos já viam). Por quê: o valor anterior "sumia" um dado que já estava valendo (decisão de 17/11, `DECISOES.md`, PR #293).
- **17/11/2026** — antes: o site era publicado direto da pasta `docs`; agora: pelo GitHub Actions, compactado. Por quê: só pela rapidez, nada muda para quem usa (decisão do dono de 17/11, `DECISOES.md`; dá para voltar com um comando anotado lá).
- **17/11/2026** — antes: estava proposto abrir a nuvem sem copiar o banco inteiro e gastar menos memória (desempenho, itens 14 e 15 do mutirão 3000); agora: ficou de fora. Por quê: mexeria nas correções automáticas dos dados; o ganho seria de uns 65 milésimos ao abrir (aceito pelo dono em 17/11: "mais seguro e um pouco mais demorado, ok", `PENDENCIAS_DO_DONO.md`, "Ficou de fora de propósito").
- **17/11/2026** — antes: a régua de cobrança poderia mandar e-mails sozinha; agora: prepara e nada sai sem a autorização do administrador. Por quê: pedido do dono (`PENDENCIAS_DO_DONO.md`, "Ficou de fora de propósito").
- **18/11/2026** — antes: e-mails longos, com passo a passo completo; agora: diretos ao ponto. O rodapé de confidencialidade proposto **não** foi colocado (conferido no código: não há esse texto nos modelos). Por quê: decisão do dono de 18/11 (`PENDENCIAS_DO_DONO.md`, item 4d e parágrafo de 18–19/11).
- **22/11/2026** — antes: "Dados e backup" era uma página comprida com tudo, e a emissão de boletos ficava em Empresas; agora: "Sistema", com páginas separadas. Por quê: pedido do dono (decisão de 22/11, `DECISOES.md`, PR #358).

### Pela metade ou nunca feito
- **Licença por chave no sistema do cliente** — existe em parte: as regras da licença e o painel de vendas estão na nuvem (`nuvem/licencas.mjs`, `nuvem/painel-vendas.mjs`), mas o site não tem a tela "Ativar", nem o aviso de vencimento, nem o modo só leitura (conferido: nada de licença em `docs/js`). Falta o código da trava e o dono criar o acesso do painel e os 3 segredos (`nuvem/README.md`).
- **Vários clientes (um cofre por empresa)** — não existe: a nuvem usa um cofre só, chamado "principal" (`nuvem/worker.mjs`). É o maior trabalho para vender.
- **Endereço e ícone próprios para cada empresa cliente** — não existe; por decisão de 15/11 fica "ankjck" até haver outras empresas.
- **Aplicativo do Google em nome do produto, aprovado pelo Google** — não existe: hoje o Gmail usa a credencial da própria nuvem da ANK/JCK. Só é preciso para vender.
- **Assinatura do instalador do programa do PC** — não feito, de propósito: só comprar o certificado antes do primeiro cliente de fora (decisão de 15/11).
- **Itens do mutirão 3000 não aplicados** — 38 não feitos e 14 em parte em 17/11; 31 são projetos grandes de venda (vários clientes, proprietário de terceiros e repasse, importar planilha, outros bancos, portal do inquilino, assinatura eletrônica). O "trabalho do Claude sem decisão" listado no inventário foi feito em 17/11 (PRs #304 a #310: NF cortada, conferência da ficha com resumo do arquivo, centavos conferidos, sem ANK fixa, OFX de outro banco, leitura dos relógios como regra, melhorias pequenas). Continua só como futuro: histórico das participações na NF (Regras 45) e ponte do banco por usuário (Segurança 15).
- **"Movimentações sem destino" em Financeiro e Banco (R11)** — continua aberto (`ROTINA_DE_MELHORIA.md`): espera o C6 entrar em uso.
- **Gravação mais leve na nuvem (P2)** — existe em parte: a comparação ficou mais rápida, mas juntar a regravação da cópia cifrada e do backup seguro a cada 30–60 s não foi feito, de propósito (mexe na segurança da cópia; só se o celular ficar lento).
- **Histórico menor** — não feito, de propósito: os itens da vistoria continuam inteiros no histórico (o Desfazer precisa), a logo continua dentro do banco (272 KB) e o histórico antigo não é arquivado (só quando o banco passar de ~5 MB).
- **2ª rodada de 16/11, o que sobrou** — não feito (não pedido): índice de boletos por contrato, resumo dos links guardado junto do arquivo na nuvem, cópia aberta atualizando só o caminho mexido, e carregar a parte do Banco/C6 só quando usada (o resto dos ~300 KB da abertura; espera o C6).
  ⚠ Fontes discordam: `ROTINA_DE_MELHORIA.md` ainda mostra "Minificar no GitHub" como não feito, mas a compactação saiu na PR #308 (17/11), e o próprio `PENDENCIAS_DO_DONO.md` diz isso. O inventário de 17/11 punha o item "Desempenho 30" (abertura lenta com sinal fraco) como futuro, e ele também saiu na #308 (lista de pré-carregamento dos módulos).
- **Página "Teste dos PDFs (temporário)"** — existe (`docs/js/telas/teste-pdfs.js`, em Sistema): espera o dono baixar e conferir os PDFs; depois deve ser apagada.
- **Conferências do dono** — ainda abertas: páginas novas de Sistema (#358), aviso do backup seguro (#319), e-mails mais curtos (#321, ler o PDF "antes e agora" e mandar um teste), regras especiais (#322), telas de 19/11, ficha pela internet com um conhecido, simular todas as etapas com e-mails de verdade para endereços de teste.
- **Ícone do aplicativo vindo da nuvem no celular de verdade** — a memória de 09/11 diz que não foi testado de ponta a ponta; não achei registro de que o dono tenha conferido.
- **Checklist de segurança do dono** (`SEGURANCA.md`, seção 7) — todos os itens continuam sem marca: 2FA e proteção da branch principal no GitHub, verificar o domínio, Windows e computadores, gerenciador de senhas, teste de restauração a cada 3 meses, e a parte da ponte do C6 (que espera as chaves).
  ⚠ Fontes discordam: `PENDENCIAS_DO_DONO.md` (parágrafo "20/11") ainda diz "Nada foi corrigido ainda" sobre o mutirão de 19/11, mas `MUTIRAO_19_11.md` e as PRs #329 a #332 mostram os 17 lotes corrigidos em 20/11.


## 7. Programa do PC, backup e documentos assinados
### O que foi feito (linha do tempo)
- **13/10/2026** (PR #10 e #12) — Nasce a "versão sem internet": o sistema inteiro num arquivo só, para abrir do disco. Na mesma semana, o **backup seguro**: uma pasta do computador que recebe a cópia cifrada dos dados.
- **06/11/2026** (PR #151) — No celular, os anexos (PDF e foto) passam a abrir dentro do próprio sistema, no **visualizador de PDF**, em vez de baixar o arquivo.
- **07/11/2026** (PR #158) — Backup seguro com "Restaurar" também quando os dados já estão na nuvem.
- **07/11/2026** (PR #163) — A versão sem internet vira **"versão PC"**: o GitHub a gera sozinho a cada mudança aceita, e o sistema a copia para a pasta do backup seguro. Nasce o **atualizador do PC** (`atualizador-pc/`), que o Agendador do Windows roda às 20h e ao entrar no Windows para trazer os dados do dia. Na pasta fica um LEIA-ME.
- **09/11/2026** (PR #182 e #183) — Atualizador configurado no computador do dono. No mesmo dia, o **aplicativo instalado** (ícone do Chrome/Edge) passa a ser o jeito de usar o sistema com o site fora do ar, e a versão PC some das telas.
- **13/11/2026** (PR #207) — O visualizador de PDF para de "pular" a página enquanto carrega.
- **15/11/2026** (PR #240) — **Cópia aberta dos arquivos**: a pasta `Arquivos dos imoveis`, dentro da pasta do backup seguro, recebe os anexos sem cifrar, organizados como no sistema (imóvel → Inquilinos → pessoa), para abrir e imprimir no Windows. Ela se atualiza logo depois de anexar, de hora em hora e por um botão.
- **15/11/2026** (PR #241) — Sem internet, no computador, o anexo abre dessa cópia aberta. No celular, o anexo continua precisando de internet.
- **15/11/2026** (PR #242, e #249 no lugar da #243) — **Arquivo impresso** (pasta física de papel de cada inquilino). Ele vira a última etapa da entrada ("Montar a pasta física"), também entra na saída, e avisa quando chega documento novo ou quando um arquivo é trocado. Junto veio o termo do acordo de dívida para assinar e anexar, e o aviso no Painel de arquivo posto à mão na pasta do inquilino.
- **15/11/2026** (PR #244) — O programa do PC passa a entrar com **e-mail e senha** do sistema e recebe um **"crachá do aparelho"**, que só deixa ler e fica guardado cifrado pelo Windows. Em Usuários → Aparelhos ligados aparecem a lista e o botão **Desligar**. A chave de serviço do Cloudflare deixou de ser usada (apagada pelo dono em 17/11).
- **16/11/2026** (PR #253) — Programa do PC num **arquivo só (.exe)**, que roda sem precisar instalar o Node, com o instalador "Instalar-Administracao-de-Imoveis.exe" na página de versões do GitHub.
- **16/11/2026** (PR #257, #258 e #261) — **Compactação dos anexos**: ao anexar, o sistema diminui sozinho as fotos (ex.: foto do RG de 4 MB → cerca de 400 KB) e os PDFs escaneados. PDF com texto ou com assinatura digital nunca é mexido. Há aviso na tela durante a compactação e um botão para compactar os anexos antigos, com o andamento em %. Na conferência do dono (16/11), 0 de 167 arquivos antigos foram compactados, e isso está certo: os escaneados já estavam pequenos.
- **17/11/2026** (PR #303) — Botão **"Abrir a pasta no Explorer"** (Backup seguro, só no computador): o programa do PC se registra no Windows e abre sempre a pasta da cópia aberta, nunca outra. Há também o botão "Copiar o caminho". Conferido pelo dono em 17/11.
- **17/11/2026** (PR #312) — Programa do PC **desinstalável**: aparece em Configurações → Aplicativos ("Administração de Imóveis") e há um botão no sistema. Desinstalar nunca apaga o backup nem a cópia aberta.
- **17/11/2026** (PR #313) — O programa do PC **se atualiza sozinho** às 20h e ao entrar no Windows. Ele baixa a versão nova, confere o arquivo e só então se troca. Aparelhos ligados mostra a versão de cada computador.
- **17/11/2026** (PR #315 e #316) — O dono conferiu o programa novo, e o programa ganhou o **ícone da casinha**.
- **18/11/2026** (PR #319) — O **backup seguro passa a ser da empresa**, não de cada computador. Se algum computador fez cópia nos últimos 3 dias, ninguém é lembrado. Se a cópia estiver parada há mais tempo, o Painel avisa os administradores (ex.: "a última cópia foi em 14/11/2026, 15:02 (nome do computador)").
- **20/11/2026** (PR #334) — Página temporária **"Teste dos PDFs"** (só administrador), com os 27 PDFs do sistema em 4 grupos, para o dono baixar e conferir um por um. Na mesma mudança foi consertado o "Baixar PDF" da carta de reajuste, que dava erro.
- **21/11/2026** (PR #342) — O visualizador desenha só as páginas perto da tela e solta a memória. Antes, um PDF comprido travava no iPhone.
- **21/11/2026** (PR #352) — **Assinatura digital, parte 1**: o programa do PC assina o PDF com o certificado A1 (e-CNPJ da ANK) e acrescenta uma página final "Assinatura digital".
- **21/11/2026** (PR #353) — Parte 2: **fila na nuvem** entre o site e o PC. O documento espera nela até o PC assinar, e só entra o assinado que começa igual ao original.
- **21/11/2026** (PR #354) — Parte 3: nos recibos e termos aparecem os botões "Enviar para assinar" e "Baixar PDF assinado", o e-mail leva só o assinado e o Painel avisa quando há documentos parados na fila. A regra começou desligada.
- **21/11/2026** (PR #355) — Parte 4: o programa do PC guarda o certificado cifrado pelo Windows e **assina a fila a cada minuto**.
- **22/11/2026** (PR #357) — O certificado e a senha passam a ser **anexados pelo próprio sistema**. Eles vão direto do navegador ao programa do PC, sem passar pela nuvem. Na mesma mudança foram corrigidas falhas que os testes anteriores não pegavam: certificado emitido por certificadora e senha ou nome com acento. Certificado da ANK anexado, **válido até 02/01/2027**.
- **22/11/2026** (PR #359) — O botão Ligar/Desligar da assinatura digital fica na caixa do certificado (Sistema → Empresas).
- **22/11/2026** (PR #360) — A caixa do certificado mostra o que está anexado (nome, CNPJ, computador, validade e dias que faltam), tem o botão **Remover** e o **aviso de renovação**, que aparece 30 dias antes, ou seja, a partir de 03/12/2026.
- **22/11/2026** (PR #361) — O programa do PC passa a se atualizar **também de hora em hora**. A caixa do certificado avisa quando o programa do PC está desatualizado.
- **24/11/2026** (sem PR, pedido do dono) — A assinatura **funcionou** (conferida no validar.iti.gov.br), mas o visual precisa melhorar (item C1 dos pedidos de 24/11).

### O que foi tirado ou mudado, e por quê
- **07/11/2026** — antes: a versão sem internet era gerada a cada mudança e conferida por um teste que falhava toda hora; agora: o GitHub a gera sozinho a cada mudança aceita (`.github/workflows/versao-pc.yml`, existe hoje) e ela se chama "versão PC". Por quê: o dono quer um segundo sistema que se atualize sozinho, porque "tem muitos dados que não posso perder" (decisão de 07/11, `DECISOES.md` e item E1 da `ROTINA_DE_MELHORIA.md`).
- **09/11/2026** — antes: com o site fora do ar, abria-se a versão PC, restaurava-se a pasta e depois se substituíam os dados da nuvem; agora: abre-se o **aplicativo instalado**, que usa a cópia do aparelho e envia sozinho quando a internet volta. A versão PC, o backup seguro e o atualizador ficam só como reserva para desastre, sem avisos, e a versão PC saiu das telas. Por quê: o dono achou ruim levar dados de um lugar para outro (decisão de 09/11, `DECISOES.md`). Conferido no código: a versão PC continua sendo gravada na pasta do backup seguro (`backup-seguro.js`) e não aparece mais nas telas. Só o rodapé da própria versão PC ainda usa o nome antigo, "versão sem internet de …" (`app.js`, linha 949).
- **14/11/2026** — antes: a pasta do OneDrive era a reserva dos dados, à espera da decisão E2 (em 07/11 o dono quis "esperar mais" e perguntar de novo por volta de 21/11); agora: a pasta foi **aposentada**. Os dados ficam na nuvem, o backup seguro fica no disco C e o disco C é copiado todo dia para um HD externo. Por quê: a nuvem e o backup seguro já cobrem a segunda camada (decisão de 14/11, `DECISOES.md` e `ROTINA_DE_MELHORIA.md` E2). ⚠ Fontes discordam: a memória `bloco-d-decisoes.md` ainda diz "E2 espera, perguntar por volta de 21/11", mas a decisão foi tomada antes, em 14/11.
- **15/11/2026** — antes: o atualizador do PC entrava no Cloudflare com uma chave de serviço guardada num arquivo `.env` (vencia em 08/11/2027); agora: entra com e-mail e senha e recebe o crachá do aparelho. Por quê: mais seguro, e cada computador pode ser desligado sozinho (proposta de licença, resposta 10 do dono, `PROPOSTA_LICENCA_E_PROGRAMA_PC.md`). A chave foi apagada em 17/11.
- **17/11/2026** — antes: a cada versão nova, o dono baixava o `.exe` à mão; agora: o programa se troca sozinho, às 20h e ao entrar no Windows, e desde 22/11 também de hora em hora. Por quê: pedido do dono. Em 22/11, a versão nova saiu às 22h29 e só seria trocada às 20h do dia seguinte (`DECISOES.md`, 17/11 e 22/11).
- **18/11/2026** — antes: cada computador era lembrado de ligar o próprio backup seguro; agora: basta um computador da empresa ter feito cópia nos últimos 3 dias. Por quê: o aviso aparecia em todos os computadores e celulares sem necessidade (`DECISOES.md`, 18/11).
- **22/11/2026** — antes: o certificado só entrava pelo Prompt de Comando no PC, e o botão Ligar/Desligar da assinatura ficava em Regras do sistema; agora: o certificado é anexado pelo sistema, e o botão fica na caixa do certificado (salvar as regras não muda mais a assinatura). Por quê: pedido do dono (`DECISOES.md`, 22/11).
- **15/11/2026** — ⚠ Fontes discordam: a tarefa diz que as PRs #242/#243 foram "reabertas como #248/#249". Pela lista das PRs, só a #243 (arquivo impresso) foi reaberta, como **#249**. A **#248** é a reabertura da #245 (licenças e painel de vendas), que tinha caído na branch da #244. A #242 entrou direto na `main`.

### Pela metade ou nunca feito
- **Assinatura digital: botão nos outros documentos** — existe em parte. Conferido no código: "Enviar para assinar" só existe na página dos recibos e termos (`caixaAssinatura` em `telas/documentos.js`). A **carta de reajuste, os termos aditivos e o contrato não têm o botão**. O dono deixou para pedir quando quiser.
- **Assinatura digital: visual** — existe, mas fica feio: o campo "assinatura" do documento fica em branco e a página final só tem uma tarja azul. Pedido do dono em 24/11 (item C1): uma página de assinatura mais bonita e o selo no campo. ⚠ Fontes discordam: a memória `assinatura-digital.md` e o "COMECE POR AQUI" de 22/11 ainda dizem "falta ligar e testar", mas os pedidos de 24/11 dizem que a assinatura funcionou e foi conferida no validar.iti.gov.br. Não há registro de conferência no Adobe.
- **Ficha cadastral sem a assinatura da empresa** — de propósito: a ficha fica de fora (`SEM_ASSINATURA_DA_EMPRESA` em `assinatura.js`).
- **Página "Teste dos PDFs (temporário)"** — existe (conferido: `telas/teste-pdfs.js`, a rota em `telas.js`, o link em `telas/admin.js` e a entrada em `sw.js`). Ela espera o dono testar os PDFs no computador e no celular Android. Depois disso, deve ser apagada (lista do que apagar em `PENDENCIAS_4000.md`, item 1).
- **Versão PC (o arquivo do sistema inteiro)** — existe, como reserva calada. Continua sendo gerada pelo GitHub e copiada para a pasta do backup seguro, mas não aparece nas telas. Não há o que fazer, só não deixar quebrar (`gerar-offline.mjs`).
- **Conferência do OneDrive no código** — existe em parte: o modo "pasta no computador" ainda procura cópias em conflito do OneDrive (`copiasEmConflito`, `armazenamento.js`), mas na nuvem isso não roda desde 07/11 (C14). É sobra do tempo do OneDrive e não atrapalha.
- **Apagar a pasta do OneDrive** — fica para o dono: guardar uma última cópia no HD externo e apagar do OneDrive e da lixeira. Não há registro de que tenha sido feito.
- **Instalador com assinatura** — nunca feito, de propósito. O `.exe` sai sem assinatura, e o Windows mostra o aviso azul "Executar assim mesmo". O dono decidiu comprar o certificado de código antes do primeiro cliente de fora (proposta de licença, resposta 11).
- **Trocar a senha de um usuário** — os computadores ligados por esse usuário precisam ser ligados de novo. Ainda não foi conferido na prática (`PENDENCIAS_DO_DONO.md`).
- **Arquivo impresso: primeira rodada** — o sistema está pronto (regra ligada). Falta o dono passar por cada inquilino em Sistema → Arquivo impresso e marcar o que já está em papel. Também foi sugerido que um advogado revise o texto do termo do acordo. Não há registro de que tenha sido feito.


---

## 8. O que ainda falta fazer (em ordem de prioridade)

Junta as listas dos sete assuntos, sem repetir. **Quem faz:** "Claude" (programa ou escreve), "Você" (confere, decide ou faz fora do sistema).

### 1. Urgente (dinheiro cobrado errado ou trabalho que a equipe faz por fora)
1. [ ] **Claude:** **ressarcimento do condomínio no boleto** (pedido A1 de 24/11): **explicado em 24/11**, a causa foi o mês de referência digitado no lugar do mês do vencimento; correção e testes na PR #373 (falta você conferir com o seu caso).
2. [ ] **Claude:** **conferência completa do boleto** (pedido A5): aluguel, proporcional, IPTU, condomínio, seguro, ressarcimentos, abatimentos, multas, diferenças, caução, acordo, reserva e NF, com testes.
3. [ ] **Claude:** **mandar pelo sistema o boleto feito à mão no banco** (pedido A4): anexar o PDF em Boletos e enviar pelo Gmail com o descritivo, o mês e o vencimento.
4. [ ] **Você:** rever os **boletos em aberto alterados à mão antes de 24/11**: o sistema não sabe quais valores foram digitados e não os recalcula (ex.: seguro lançado depois não entra).

### 2. Alta (pedidos seus parados ou prazos chegando)
5. [ ] **Você → Claude:** **termo de aceite da reserva**. Você decidiu em 24/11: 7 dias devolve tudo, depois fica com 40%; 3 dias úteis para os documentos; reserva abatida do 1º aluguel. Falta confirmar os 40% (risco de o juiz reduzir; ver `TAXAS_COBRAVEIS.md`, "Reserva") e o caso "documento falso". Depois, o Claude programa a etapa inteira, com a pessoa podendo ver, trocar e apagar pelo link o que mandou.
6. [ ] **Claude:** **visual da assinatura digital** (pedido C1): página de assinatura mais bonita e o selo no campo "assinatura" do documento.
7. [ ] **Você:** **renovar o certificado da ANK antes de 02/01/2027** (o aviso começa em 03/12/2026). Sem ele, a assinatura para.
8. [ ] **Você:** ligar a **verificação em duas etapas e a proteção da branch principal no GitHub** (`SEGURANCA.md`, bloco 2). Quem tomar a conta pode trocar o site.
9. [ ] **Você + contador → Claude:** **CBS 2027** nos impostos a partir de 01/2027. O Senado decide até 15/12/2026; em 16/12 responder as 4 pendências e confirmar com um exemplo em reais.
10. [ ] **Você:** **conferir o que mudou** (`CONFERIR_O_QUE_MUDOU.md`), começando pelas páginas de Sistema e pelos boletos.
11. [ ] **Você:** decidir as **taxas extras** (`TAXAS_COBRAVEIS.md`); depois o Claude escreve as cláusulas para o advogado. Já decidido em 24/11: tarifa do boleto **sempre cobrada** (o Claude volta a cláusula ao modelo de contrato), empresa é **locadora direta**, reserva fica 100% com a empresa na desistência (PR #372).
11b. [ ] **Claude:** **honorários e despesas de cobrança** no sistema (sugestão em `TAXAS_COBRAVEIS.md`, item 6: regra do percentual, botão "Passar para cobrança", linhas no acordo e no cálculo final, despesas com comprovante), depois da resposta do dono.
11c. [ ] **Claude (futuro):** o contrato dizer se a empresa aluga **como dona ou como procuradora de terceiro**, com modelo de contrato em nome do terceiro conforme a procuração.

### 3. Média
12. [ ] **Claude:** **modelos de documentos em PDF** para você baixar e ajustar (pedido C2).
13. [ ] **Você:** **testar os PDFs** na página temporária (Sistema → Teste dos PDFs); depois o **Claude apaga** a página.
14. [ ] **Claude:** botão **"Enviar para assinar"** na carta de reajuste, nos termos aditivos e no contrato (hoje só recibos e termos).
15. [ ] **Você:** comunicado de contatos com um **inquilino de teste** e depois a todos (feito em 18/11, nunca usado).
16. [ ] **Você:** **ficha pela internet** com um conhecido (nunca passou por uma pessoa de verdade).
17. [ ] **Você:** decidir se **tira o "Seguro fiança"** das garantias (você não trabalha com ele, e a opção continua no cadastro e no contrato).
18. [ ] **Você:** ler o PDF "Modelos de e-mail - antes e agora" e mandar um e-mail de teste (#321).
19. [ ] **Você:** no celular, conferir o ícone escolhido (iPhone: tirar e pôr de novo) e o "Enviar agora" com recibos anexados.
20. [ ] **Claude:** acertar os documentos que ficaram velhos (seção 1 de `SEGURANCA.md`, "Minificar" em `ROTINA_DE_MELHORIA.md`, parágrafo de 20/11 e item 1 do "COMECE POR AQUI" em `PENDENCIAS_DO_DONO.md`, título de `REGRAS_CONFIGURAVEIS.md`, frase do informe do IR em `REVISAO_JURIDICA_CONTRATO.md`, Cloud Run em `DECISOES.md`, seguro fiança em `DECISOES.md`) e a memória do Claude.

### 4. Depende do banco C6
21. [ ] **Você:** cobrar de novo as **chaves do C6** (as duas empresas). Sem elas, a parte bancária inteira fica parada.
22. [ ] **Você + Claude:** instalar a ponte e ligar (`LIGAR_C6.md`), fazer o **boleto de teste** (conferir o desconto e decidir o corte do texto), os testes da homologação e os avisos do banco.
23. [ ] **Você:** depois do C6 no ar, rever a sugestão do tipo de despesa pela descrição (ex.: SANEPAR → Água).

### 5. Baixa (quando der ou quando acontecer)
24. [ ] **Você:** **simular todas as etapas** com pessoas de teste (ficha → saída), com e-mails de verdade (decidido em 24/11: depois dos itens acima).
25. [ ] **Claude:** sugerir no cálculo final a multa pela falta do aviso de 30 dias (hoje só está no contrato).
26. [ ] **Você:** primeira rodada do **Arquivo impresso** e o advogado rever o termo do acordo.
27. [ ] **Você:** guardar a última cópia da pasta do OneDrive num HD externo e apagá-la (decidido em 14/11).
28. [ ] **Claude:** pequenos: nome antigo "versão sem internet" no rodapé da versão PC; texto do programa do PC que ainda diz "às 20h" (é de hora em hora desde #361); botão "Corrigir caução" → "Complementação"; ressarcimento barrar mês em acordo; NF com a divisão ANK/JCK da data do pagamento.
29. [ ] **Você:** resolver os alertas "A verificar" da importação de 2026 (5 contratos).
30. [ ] **Quando acontecer:** NF 16/30 no próximo inquilino com entrada no meio do mês; troca de senha → religar o PC.
31. [ ] **Nunca feito, só se quiser vender o sistema:** proprietário de terceiros com repasse, trava da licença, vários clientes, aplicativo do Google verificado, certificado para assinar o instalador.
32. [ ] **No fim:** arquivar e compactar código e documentação (pedido C6) e limpar as cópias de trabalho (o Claude pergunta antes de apagar).
