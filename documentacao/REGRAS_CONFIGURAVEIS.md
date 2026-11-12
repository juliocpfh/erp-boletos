| Fora: o dono trata em outra sessão || Fora: o dono trata em outra sessão || Fora: o dono trata em outra sessão || Fora: o dono trata em outra sessão || Sim: 30 meses, com o aviso ao lado do campo || B8 | Fiador + depósito de garantia | Opção existe na lista de garantias | Fica permitido | **Não proibir** (decisão do dono). Aviso ao lado: a LI art. 37 lista caução, fiança, seguro fiança e cessão de quotas; o depósito em dinheiro costuma ser tratado pelos tribunais como caução em dinheiro (art. 38, §2º), e aí fiador + depósito pode ser visto como duas garantias (art. 37, parágrafo único): risco de ter de devolver o depósito e de contravenção (art. 43, II) | Sim: permitido, com aviso || Pendente: é proibido (art. 38 §2º; cobrar além do permitido é contravenção, art. 43, I). Bloquear ou só avisar? || B2 | ~~Reserva quando o interessado desiste~~ | — | — | Tratado pelo dono em outra sessão: fora desta lista | — || Sim: aviso acima de 10% || Sim: padrão (1); a (2) aparece como sugestão, com a explicação da lei |# Regras configuráveis — proposta (etapa 1, 2026-11-12)

Objetivo: para vender o sistema a outros locadores, as regras hoje fixas no código viram opções escolhidas pelo
administrador. **O padrão de cada opção é o comportamento de hoje**: nada muda nos dados até alguém escolher outra coisa.
Nada foi programado ainda; o dono aprova item a item (coluna "Aprovado?").

Legenda: **[S]** = seleção (lista de opções), **[C]** = campo aberto (número/texto), **[E]** = já existe por contrato
(a configuração passa a ser só o valor que vem preenchido no "Novo contrato").
Leis: LI = Lei do Inquilinato (8.245/91); CC = Código Civil; CDC = Código de Defesa do Consumidor.

**Regra da tela (dono, 2026-11-12):** toda opção aparece com a explicação, a consequência de cada escolha, se é legal ou
não e o artigo da lei. O sistema avisa, mas não proíbe as escolhas do administrador.

> Não é parecer jurídico: os fundamentos são para orientar a escolha; para vender o sistema, vale um advogado revisar
> os textos de ajuda das opções.

## A. Aluguel e cobrança

| # | Regra | Hoje (exemplo) | Opções | Padrão recomendado e por quê | Aprovado? |
|---|---|---|---|---|---|
| A1 | Mês do reajuste | O mês de entrada conta como 1º mês, qualquer dia. Entrada 20/03/2026 → aluguel de 03/2027 já corrigido (R$ 2.000,00 + 4,50% = R$ 2.090,00) | [S] (1) mês de entrada é o 1º (hoje); (2) entrada depois do dia 1º: 1º mês é o seguinte (aluguel de 04/2027); (3) a partir do dia exato (março proporcional: 19 dias velhos + 12 novos) | (1). Lei 10.192/2001, art. 2º, §1º: reajuste com menos de 1 ano é nulo. Na (1) os dias 01 a 19/03/2027 já pagam o novo valor, poucos dias antes de 1 ano: risco pequeno (centavos), mas existe; a (2) é a mais segura e a (3) a mais exata. Recomendo manter a (1) como padrão (o dono já usa) e deixar a (2) para quem quiser zero risco | |
| A2 | Índice do reajuste | Escolhido em cada contrato (IGP-M, IPCA, INPC, IGP-DI do Banco Central; IVAR digitado) | [E] índice que vem preenchido no Novo contrato | Em branco (escolher sempre). LI art. 17/18: índice é livre, mas tem que estar no contrato; IPCA é o mais aceito hoje (IGP-M teve picos de 30% em 2021) | |
| A3 | Bonificação (desconto) por pontualidade | Aluguel R$ 2.000,00 com 10% → R$ 1.800,00 se pago até o vencimento; atrasado paga R$ 2.000,00 + multa e juros | [S] usar bonificação: sim (hoje) / não; [C] % que vem preenchido (em branco); [C] limite máximo do % (aviso acima de X%) | Sim, com aviso acima de 10%. Risco: alguns tribunais estaduais já trataram desconto + multa como "multa dobrada" (multa disfarçada). O STJ aceitou os dois juntos (REsp 1.745.916, 2019, caso de escola). Fica mais seguro com desconto moderado (até 10%) e o contrato chamando de bonificação, como já está | |
| A4 | Multa por atraso | 2% (vem preenchido no Novo contrato, muda por contrato). Boleto R$ 2.000,00 → multa R$ 40,00 | [E] % padrão: 0 a 10 | 2% (hoje). O CDC (limite de 2%) em regra não vale para aluguel, e a Lei de Usura (Dec. 22.626/33, art. 9º) aceita até 10%; mas o juiz pode reduzir multa exagerada (CC art. 413). 2% é o mais seguro e é o que o banco já usa | |
| A5 | Juros por atraso | 1% ao mês, contado por dia e truncado como no banco. R$ 2.000,00, 10 dias → R$ 0,66 × 10 = R$ 6,60 | [E] % ao mês padrão | 1% (hoje). CC art. 406 e Lei de Usura: até 1% ao mês é o limite seguro com pessoa física | |
| A6 | Sobre o que incidem multa e juros | Sobre o boleto cheio (aluguel cheio + IPTU + seguro + tarifa), menos reserva e FCI | [S] boleto cheio (hoje) / só o aluguel cheio | Boleto cheio (hoje). IPTU e seguro são encargos do locatário (LI art. 23, I e art. 25), então o atraso deles também tem mora; o contrato precisa dizer isso (conferir com a sessão do contrato) | |
| A7 | Vencimento em sábado, domingo ou feriado | Vence sáb 10/10/2026, 12/10 feriado: em dia até ter 13/10; pago qua 14/10 = 4 dias de atraso | [S] próximo dia útil sem multa (hoje) / sem prorrogação | Próximo dia útil (hoje). CC art. 132, §1º: prazo que vence em feriado vai para o dia útil seguinte; é também o que o banco faz | |
| A8 | Feriados municipais/estaduais | Só feriados nacionais | [C] lista de feriados locais da cidade de cada empresa | Vazio (hoje). O banco segue os feriados da praça de pagamento; para outra cidade, cadastrar os dela | |
| A9 | Cálculo do proporcional (entrada e saída) | Pelos dias reais do mês. Entrada 15/02/2027, aluguel R$ 1.800,00: 14/28 × R$ 1.800,00 = R$ 900,00 | [S] dias reais do mês (hoje) / mês de 30 dias (14/30 = R$ 840,00) | Dias reais (hoje): não há lei; é o mais justo e fácil de explicar ao inquilino | |
| A10 | O aluguel do mês vence no mês seguinte | Sim por padrão (aluguel de julho vence em agosto) | [E] padrão sim/não | Sim (hoje). LI art. 20: cobrar o aluguel adiantado é proibido (salvo sem garantia, art. 42, ou temporada) e é contravenção (art. 43, III); vencer depois do mês usado evita o problema | |
| A11 | Tarifa do boleto cobrada do inquilino | Em branco (só se digitar no contrato) | [E] valor padrão | R$ 0,00 (hoje). Tribunais divergem sobre repassar a tarifa bancária; só com cláusula expressa no contrato | |
| A12 | Dia de gerar os boletos | A partir do dia 20, os do próprio mês (que vencem no mês seguinte) | [C] dia 1 a 28 | 20 (hoje). Regra só de rotina, sem lei | |
| A13 | Boleto no C6: como sai | Valor cheio com desconto da bonificação até o vencimento | [S] cheio com desconto (hoje) / já bonificado | Cheio com desconto (hoje): o próprio boleto mostra que é desconto e não multa, o que ajuda contra a tese da "multa dobrada" (A3) | |

## B. Reserva, garantia e FCI

| # | Regra | Hoje (exemplo) | Opções | Padrão recomendado e por quê | Aprovado? |
|---|---|---|---|---|---|
| B1 | Reserva de ficha reprovada | Sempre devolvida (alerta até registrar a devolução) | Fixo, sem opção | Devolver sempre: não houve contrato, ficar com o dinheiro é enriquecimento sem causa (CC art. 884). **Não recomendo deixar configurável** | |
| B2 | Reserva quando o interessado desiste | Não há tratamento no sistema (a ficha só tem aprovada/reprovada) | [S] devolver tudo / reter um valor ou % (só se o recibo da reserva disser isso por escrito) | Devolver tudo (a regra do dono). Para reter, a reserva teria de ser "arras" escritas (CC arts. 418 a 420) e, com consumidor, perda total pode ser abusiva (CDC art. 51). Precisa de nova situação "Desistiu" na ficha | |
| B3 | Em qual aluguel a reserva abate | No mês marcado ou, em branco, no 1º aluguel (depois da carência) | [S] 1º aluguel (hoje) / não abater (devolver à parte) | 1º aluguel (hoje). Sem lei | |
| B4 | Caução: quantos aluguéis | Escolhido em cada contrato, sem limite | [E] padrão 1, 2 ou 3; **barrar acima de 3** | 3, com bloqueio acima de 3. LI art. 38, §2º: caução em dinheiro não pode passar de 3 meses de aluguel | |
| B5 | Caução: base do cálculo | Aluguel com bonificação. 3 × R$ 1.800,00 = R$ 5.400,00 | [S] bonificado (hoje) / cheio (3 × R$ 2.000,00 = R$ 6.000,00) | Bonificado (hoje): se um juiz entender que o aluguel de verdade é o pago em dia, os R$ 6.000,00 passariam do limite de 3 meses (art. 38) | |
| B6 | Caução acompanha o reajuste | Sim: a diferença vira boleto à parte ou depósito | [S] sim (hoje) / não | Sim (hoje), sempre dentro do limite de 3 aluguéis corrigidos | |
| B7 | Correção da caução na devolução | Pela poupança | Fixo | Poupança (hoje). LI art. 38, §2º: depositada em poupança, rendimento é do inquilino | |
| B8 | Mais de uma garantia ("Fiador + depósito") | Opção existe na lista de garantias | [S] permitir / não permitir | **Não permitir**. LI art. 37, parágrafo único: é proibida mais de uma garantia no mesmo contrato; exigir duas é contravenção penal (art. 43, II). Recomendo esconder essa opção por padrão (contratos que já têm continuam) | |
| B9 | FCI (fundo de conservação) | Em branco = não cobra; % do aluguel bonificado; índice escolhido | [E] % e índice padrão | Em branco (hoje). Não há lei própria; o risco é ser visto como segunda garantia (art. 37): o contrato já diz que não é garantia e só paga danos | |

## C. Contrato e saída

| # | Regra | Hoje (exemplo) | Opções | Padrão recomendado e por quê | Aprovado? |
|---|---|---|---|---|---|
| C1 | Prazo padrão do contrato residencial | Em branco (digitado) | [E] meses padrão | 30 meses. LI art. 46: com 30 meses ou mais, no fim o locador pode retomar sem motivo; com menos, o contrato prorroga e só se retoma em casos da lei ou depois de 5 anos (art. 47) | |
| C2 | Prazo padrão do contrato comercial | Em branco | [E] meses padrão | Em branco. LI art. 51: com 5 anos ou mais (somando contratos), o inquilino ganha direito à renovação na Justiça; o locador decide | |
| C3 | Multa por sair antes do fim | No texto do contrato: residencial 3 aluguéis proporcional ao tempo que falta; comercial 10% proporcional | [S] nº de aluguéis + sempre proporcional | 3 aluguéis, proporcional. LI art. 4º: tem que ser proporcional ao tempo que falta; sem multa se o inquilino for transferido pelo emprego (aviso de 30 dias). Ex.: contrato de 30 meses, sai no mês 20 → 3 × R$ 2.000,00 × 10/30 = R$ 2.000,00. **Texto do contrato é da outra sessão**: aqui só o valor | |
| C4 | Aviso prévio de saída | 30 dias, no texto do contrato | [C] dias | 30 dias. LI art. 6º (prazo indeterminado: mínimo 30 dias) | |
| C5 | Honorários de advogado na cobrança | 25% no texto do residencial | [C] % | **Até 20%**: na cobrança judicial o juiz fixa de 10% a 20% (CPC art. 85, §2º); 25% pode ser visto como abusivo. Texto da outra sessão | |
| C6 | Prazo da vistoria de saída | 72 h úteis (residencial), 48 h (comercial), no texto | [C] horas | Mantém. Sem lei | |
| C7 | Seguro contra incêndio pelo inquilino | Sim (por conta do inquilino, padrão) | [E] padrão | Inquilino (hoje). LI art. 22, VIII: é do locador, salvo cláusula expressa passando ao inquilino, que o contrato tem | |
| C8 | IPTU pelo inquilino | Sim (padrão), proporcional aos dias ocupados | [E] padrão | Inquilino (hoje). LI art. 22, VIII e art. 25: pode passar ao inquilino por contrato | |

## D. Régua de cobrança e prazos de rotina

| # | Regra | Hoje | Opções | Padrão recomendado e por quê | Aprovado? |
|---|---|---|---|---|---|
| D1 | Régua de cobrança | 1 dia: e-mail; 10 dias: ligar; 30 dias: avaliar negativação (só aviso) | [C] dias e texto de cada passo; incluir/tirar passos | Hoje. Cobrar sem constranger ou ameaçar (CDC art. 42). Negativar: o órgão avisa o devedor antes (CDC art. 43, §2º; Súmula 359 do STJ) e a LGPD permite usar os dados para proteger o crédito (art. 7º, X) | |
| D2 | Documentos da ficha reprovada | Apagados 3 meses depois | [C] meses (1 a 12) | 3 meses (hoje). LGPD art. 6º, III e arts. 15/16: guardar só o tempo necessário | |
| D3 | Pagamento adiantado na conciliação do banco | Liga entrada a boleto que vence até 45 dias depois | [C] dias | 45 (hoje). Rotina | |
| D4 | Movimentação do banco sem destino vira alerta | Depois de 7 dias | [C] dias | 7 (hoje). Rotina | |
| D5 | Extrato "recente" no fechamento do mês | Buscado há até 7 dias | [C] dias | 7 (hoje). Rotina | |
| D6 | Antecedência dos alertas de seguro e de fim do contrato | 60 dias | [C] dias (cada um) | 60 (hoje). Contrato comercial com direito a renovação: a ação tem de entrar entre 1 ano e 6 meses antes do fim (LI art. 51, §5º); sugerir 365 dias para esses | |
| D7 | Contrato sem imóvel é apagado | Depois de 7 dias | [C] dias | 7 (hoje). Rotina | |
| D8 | Etiqueta "alugado em X: veja se ficou conta nossa" | Até 2 meses depois da entrada | [C] meses | 2 (hoje). Rotina | |
| D9 | Avisos antes de salvar | Pagamento de mais de 90 dias atrás; data até 60 dias no futuro; IPTU/seguro 30% fora do anterior | [C] cada número | Hoje. Rotina | |

## Fora desta lista (de propósito)
- Impostos (PIS/COFINS, IRPJ, CSLL, mínimo de R$ 10,00 da guia): dependem do regime da empresa; viram configuração quando o
  sistema for vendido, em outra etapa.
- Numeração das NFs, juros truncados como no banco, regras da troca de titular: são regras de funcionamento, não de escolha.

## Etapa 2 (só depois da aprovação)
Tabela nova em `TABELAS` (ex.: `config_regras`, só administrador grava), lida pelas regras com padrão igual ao de hoje,
tela em Empresas ou Dados e backup, testes em `tests/`, `DECISOES.md` e `REGRAS_TEXTO` atualizados. Itens C3–C6 entram no
contrato como campos que o texto do modelo usa; isso precisa ser combinado com a sessão que revisa o contrato.
