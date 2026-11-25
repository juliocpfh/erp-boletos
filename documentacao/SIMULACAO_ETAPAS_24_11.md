# Simulação de uma locação inteira (24/11/2026)

Pedido 5b de `PENDENCIAS_DO_DONO.md` (18/11): seguir uma locação do primeiro contato até a devolução da caução, com pessoas de teste, e apontar o que está quebrado, confuso ou mal escrito. **Esta sessão só relata: nada foi corrigido.**

## Como foi feito

- Sistema na **nuvem local** (`node nuvem/local.mjs`), do jeito que o dono usa, com um Gmail falso: cada e-mail que sairia ficou guardado num arquivo e foi lido inteiro (texto e anexos). Nenhum e-mail foi enviado de verdade.
- Navegador automático, clicando nas telas como o dono. As páginas da pessoa de fora (`/reserva`, `/ficha`, `/contatos`) foram abertas num **celular de 375 px**.
- Para andar no tempo, o relógio do navegador foi adiantado (dez/2026 → out/2028). O servidor continuou na data real.
- Pessoas fictícias: inquilina **Maria Teste da Silva** (CPF 529.982.247-25), fiador **João Fiador Teste** (CPF 529.982.247-25), novo titular **Pedro Novo Teste** (CPF 529.982.247-25: o CPF de teste do projeto serve para todos), empresa **Imobiliária Teste Ltda** (CNPJ 11.222.333/0001-81), e-mails `@example.com`. Imóvel "Casa Jardim", aluguel R$ 2.000,00 (R$ 1.800,00 em dia), vencimento dia 10, reserva de R$ 500,00, caução de R$ 5.400,00.
- Os meses sem novidade (pagamentos em dia de mai/2027 a ago/2028) foram lançados direto, sem tela, para chegar logo ao reajuste, à troca e à saída.

**Não testado:** a busca automática da poupança e dos índices no Banco Central (as datas da simulação estão no futuro, então o Banco Central não tem os números: o índice foi digitado à mão); a assinatura digital; o banco C6; o aviso no celular.

**Ao lado:** no meio do teste, outra sessão gravou dados de teste dela ("Inquilino Casa", "Inquilino Sala", empresa "ANK") na minha nuvem local, porque usamos a mesma porta (8795). Mudei de porta e apaguei esses dados. Sessões em paralelo devem usar portas diferentes.

Em cada achado, **(pode estar em andamento: …)** quer dizer que outra sessão ou PR aberta mexe no assunto.

---

## 1. Interessado: condições e termo de aceite da reserva

**Funcionou**
- Ficha nova pela tela, com o aluguel bonificado calculado sozinho (R$ 2.000,00 com 10% = R$ 1.800,00).
- E-mail "Condições e termo da reserva", com o aviso da desistência em destaque e o link; WhatsApp pronto para copiar.
- No celular, `/reserva` coube na tela, recusou "Aceitar" sem a caixa marcada, mandou o código, aceitou com a assinatura feita com o dedo e mandou o comprovante à pessoa e o aviso à equipe. A ficha mostrou "termo aceito" sozinha.

**Quebrado**
1. **Data errada depois das 21h.** O link gerado às 21h45 de 24/11 vale até **01/12** (é o que a página da pessoa mostra), mas o e-mail, o WhatsApp e a janela do link dizem **02/12**. O mesmo acontece no termo aceito: aceito às 21h47 de 24/11, o PDF sai com "Curitiba, **25** de novembro" e o e-mail da ficha diz "o termo que você aceitou em **25/11/2026**". Para repetir: gere o link ou aceite o termo depois das 21h. Causa: a data é tirada do horário de Londres, 3 horas à frente (`String(vence_em).slice(0, 10)` e `String(a.em).slice(0, 10)` em `recibos.js` e `termo-reserva.js`). O link da ficha tem o mesmo erro. (pode estar em andamento: #413, termo da reserva)
2. **O e-mail perde o link sem avisar.** O link só fica guardado na aba em que foi gerado. Se o dono recarrega a página ou abre o e-mail em outra aba, o mesmo botão monta outro texto ("responda este e-mail com ele assinado") e sai sem o link, sem nenhum aviso. Para repetir: gere o link, aperte F5, abra "✉ E-mail: condições e termo da reserva".

**Texto confuso**
- O e-mail leva anexado o "Termo reserva **para assinar**" (PDF de 886 KB) e também o link para aceitar pela internet. A pessoa não sabe se assina o PDF ou se usa o link. Sugestão: com o link, anexar o termo só "para leitura" ou não anexar.
- Item 3 do termo: "o primeiro boleto já vem com o **desconto**" se confunde com o desconto de pontualidade. Sugestão: "o primeiro boleto já vem com os R$ 500,00 abatidos".
- "Garantia: Caução" sem valor, e no e-mail "caução de **até** 3 aluguéis". Sugestão: "caução de R$ 5.400,00 (3 aluguéis com bonificação)".
- O e-mail com o código sai com o nome da empresa repetido na assinatura ("Imobiliária Teste Ltda" duas vezes).
- No celular, "R$" fica numa linha e o valor na seguinte ("(R$ / 500,00)").

**O dono decide**
- O termo ainda não diz o que acontece se **a empresa** desistir (já está na lista do dono).
- O imóvel fica reservado por 7 dias corridos, mas a pessoa tem 3 dias úteis para mandar documentos e a análise leva até 2 dias úteis: com um feriado no meio, a reserva vence antes da análise. O termo não diz o que acontece aí.

## 2. Depósito da reserva

**Funcionou:** valor, data e comprovante em "Editar". A ficha calculou os prazos (documentos até 27/11, reservado até 01/12) e o recibo da reserva saiu.

**Texto confuso:** no e-mail da ficha, "Aprovada a ficha, ela é descontada do primeiro aluguel, como no termo…: não aprovada, devolvemos tudo". Os dois-pontos devem virar ponto final: "… do primeiro aluguel. Se não for aprovada, devolvemos tudo."

## 3. Ficha pelo link: dados, documentos, correção, conferência, aprovação

**Funcionou**
- `/ficha` no celular (375 px), da inquilina e do fiador: os documentos pedidos mudam com o tipo de renda, a pessoa troca e apaga o arquivo errado, corrige a renda (de R$ 7.000,00 para R$ 7.500,00) e reenvia; tudo fica registrado ("1 correção").
- A equipe vê o quadro "na ficha × enviado", usa "Trazer para a ficha" e marca os documentos recebidos. A aprovação libera "Fazer o contrato".

**Texto confuso**
- Depois de aprovar, o quadro mostra "✓ **conferido por Dono Teste** em 24/11 22:03" ao lado de cada documento, mas isso foi a verificação automática feita quando a ficha foi aberta, não alguém que olhou. Sugestão: "verificado pelo sistema ao abrir a ficha: nenhum sinal de edição".
- A caixa "Ficha pela internet" já oferece "Gerar link" antes do depósito, enquanto a mesma página diz que "o e-mail com a ficha sai depois do depósito".
- Campo "Sexo" com a opção "Neutro – o(a)" na ficha que a pessoa preenche: estranho para quem está de fora.
- E-mail "Ficha aprovada": "depósito **da depósito** de garantia" e "(o fiador **e o cônjuge dele** também assinam)", mesmo com o fiador solteiro.

**O dono decide**
- **E-mails demais para a equipe:** só a Maria gerou 13 avisos ("mandou um documento", um por arquivo). Juntar num resumo a cada 10 ou 15 minutos?
- "Aprovar" não lembra o que falta (ficha assinada, Serasa, documentos do fiador: residência e matrícula do imóvel). Mostrar a lista antes de aprovar?
- **"Fiador + depósito" passa pela ficha, pelo termo e pelos e-mails** e só no "Novo contrato" aparece o aviso de que são duas garantias e a lei proíbe (art. 37). O mesmo aviso deveria aparecer na proposta da ficha. Na simulação, a garantia foi trocada para só caução.
- Teto da caução: o aviso do contrato calcula "3 aluguéis" sobre o aluguel **com bonificação** (R$ 5.400,00); o e-mail fala só em "até 3 aluguéis", e o dono pode entender R$ 6.000,00. Qual é o certo? (pergunta para o advogado)

## 4. Contrato: gerar, PDF e Word, assinatura, vistoria de entrada

**Funcionou**
- O "Novo contrato" vem preenchido com a ficha (pessoa, proposta, fiador, reserva) e levou os 9 documentos para a pasta da inquilina. Os avisos da lei antes de salvar (caução acima de 3 aluguéis; fiador + depósito) estão claros.
- O texto do contrato saiu sem espaços em branco; o resumo em perguntas e respostas usa os valores do contrato. PDF e Word baixaram.
- Vistoria de entrada com roteiro de cômodos, leituras dos relógios e chaves; termo de entrega das chaves; rotina de entrada marcando as etapas sozinha. Contra-vistoria com prazo certo (entrada num sábado, 05/12 → até 11/12, 5 dias úteis).

**Quebrado**
1. **O e-mail "Contrato para assinatura" não leva o contrato.** O texto diz "Segue o contrato", mas nada vai anexo (os outros e-mails anexam sozinhos). O sistema avisa no fim ("o texto fala em anexo, mas nenhum arquivo vai junto"), mas se o dono clicar em "Enviar mesmo assim", a etapa "Gerar o contrato" fica marcada como feita. (pode estar em andamento: "enviar-assinar", #412)
2. **Data futura bloqueia em silêncio.** "Registrar depósito" e "Marcar assinado" não aceitam data depois de hoje (o campo tem limite). No computador, o navegador mostra só um balãozinho; o clique parece não fazer nada. Para repetir: data de amanhã → "Registrar depósito". Sugestão: mensagem na tela ("a data não pode ser depois de hoje").
3. **"Marcar assinado" não mostra nenhuma mensagem** quando dá certo; só a rotina muda.

**Texto confuso**
- O **PDF do contrato tem 5,3 MB**: pesado para mandar por e-mail.
- A **vistoria de entrada não escreve que a pintura era nova** (a resposta "Sim" fica só no sistema). É a prova que vale na saída para cobrar a pintura inteira. Sugestão: uma linha "Pintura: nova, feita para esta entrada". (pode estar em andamento: "adv-pintura")
- Prazo de 30 meses a partir de 05/12/2026 termina "em **05**/06/2029" no contrato e na tela. O costume é terminar na véspera (04/06/2029). Conferir com o advogado.
- O contrato diz que o inquilino reembolsa a tarifa do boleto, mas num sistema sem a tarifa padrão preenchida o boleto sai com tarifa R$ 0,00 (nos dados reais a tarifa já é R$ 8,50).
- Nomes trocados no formulário: "Data do contrato" grava a vigência e "Data de vigência inicial" grava a entrada.
- O documento se chama "Recibo de entrega das chaves", mas a rotina chama de "termo de entrega das chaves".

## 5. Entrada: boleto proporcional, reserva, seguro e IPTU

**Funcionou (valores conferidos)**
- Boleto de dez/2026: entrada em 05/12 = **26/30 dias**, aluguel R$ 1.733,33 (R$ 1.560,00 em dia), seguro proporcional R$ 26,00, reserva de **−R$ 500,00** → **R$ 1.086,00** até 10/01/2027 (vale até 11/01, porque 10/01 é domingo).
- IPTU 2027 entrou no boleto que vence em fevereiro, como cadastrado (parcela 1/10, R$ 150,00). Seguro de R$ 300,00 em 10 parcelas de R$ 30,00.

**Texto confuso:** na descrição do boleto para o banco, "SEGURO1/10" sai sem espaço.

**O dono decide:** a 1ª parcela do seguro saiu proporcional (R$ 26,00 em vez de R$ 30,00). As 10 parcelas somam R$ 296,00, não os R$ 300,00 da apólice. Os R$ 4,00 que faltam ficam com quem?

## 6. Boletos de 3 meses e NFs

**Funcionou**
- Dez/2026 pago em dia (R$ 1.086,00; NF R$ 1.560,00). Fev/2027 pago em dia (R$ 1.980,00; NF R$ 1.800,00).
- Jan/2027 pago em 19/02 (vencia 10/02), dinheiro na conta em 22/02: **9 dias**, multa R$ 43,60 (2% de R$ 2.180,00) e juros R$ 6,48 → R$ 2.230,08; NF R$ 2.050,08.
- Numeração 0001 e 0002 pela data em que o dinheiro entrou; o mês em andamento fica para depois da virada.

**Texto confuso**
- A **tela de pagamento diz uma coisa e grava outra**: antes de confirmar, mostrava "se for pago hoje: 12 dias de atraso, juros R$ 8,64, R$ 2.232,24"; gravou 9 dias e R$ 6,48 (o certo, pela data do pagamento). A prévia não considera a data "Pagou em".
- A NF do pagamento atrasado mostra só "Locação de imóvel R$ 2.050,08", sem dizer que tem multa e juros. Sugestão: uma observação "inclui multa de R$ 43,60 e juros de R$ 6,48".

**O dono decide:** os juros do dia são cortados no centavo (R$ 2.180,00 × 1% ÷ 30 = R$ 0,7266 → R$ 0,72). Em 9 dias dá R$ 6,48; arredondando seria R$ 6,54. O exemplo do resumo do contrato usa a mesma conta (R$ 6,60 em vez de R$ 6,67). Está combinado assim com o banco?

## 7. Notificação por atraso e reiteração

**Funcionou:** a régua montou o e-mail de 10 dias de atraso com o valor do dia (R$ 2.230,80). A notificação teve PDF, assinada anexada, e-mail com o PDF assinado e prazo em dias úteis (feriado de 21/04 descontado, até 05/05/2027). Depois do prazo, a "2ª notificação" veio com o texto de reiteração.

**Quebrado**
1. **Não existe modelo de notificação por atraso de aluguel.** Os assuntos são obra, barulho, animal, sujeira e uso. Foi preciso usar "Outro assunto" e escrever tudo à mão.
2. **Trocar o assunto não troca o texto.** O texto da obra continua até alguém clicar em "Montar o texto de novo".
3. **Multa contratual sugerida para atraso.** Vencido o prazo, o sistema sugere "multa de 1 aluguel = R$ 2.000,00 (até 3)" no próximo boleto, e a reiteração diz que "a multa será cobrada no boleto". Para atraso de aluguel já existe a multa de 2%: somar a multa de infração cobra duas vezes pelo mesmo atraso, o que é arriscado.
4. **A notificação continua aberta depois do acordo.** A dívida foi para o acordo e foi paga, e "2 notificações em aberto (1 com prazo vencido)" continuou no topo de Comunicações e na página da inquilina.

**Texto confuso**
- E-mail da notificação: "sobre **aluguel** de 03/2027" (falta "o") e "Ao terminar, responda com uma foto ou um documento que mostre…", que serve para obra, não para pagamento. Sugestão para atraso: "Se já pagou, responda com o comprovante."
- A reiteração diz que a 1ª foi "**recebida** pelo LOCATÁRIO em 20/04/2027", mas ela foi **enviada** por e-mail nesse dia; ninguém confirmou o recebimento. Sugestão: "enviada por e-mail em 20/04/2027".
- Salvar a reiteração exige marcar "Conferi o número da cláusula", mas o aviso é só o balãozinho do navegador.
- "10 dia(s) de atraso", "40 dia(s)": melhor "10 dias".

**O dono decide:** criar o modelo "Aluguel em atraso" sem multa contratual, e dar baixa sozinho nessa notificação quando o boleto for pago ou entrar em acordo?

## 8. Acordo

**Funcionou:** "Fazer acordo" na Inadimplência juntou mar e abr/2027 (R$ 4.360,00; R$ 4.483,20 com multa e juros) em 3 boletos de R$ 1.494,40 (NF R$ 1.374,40, sem IPTU e seguro). O termo de confissão de dívida está claro (vencimento antecipado, sem novação, título executivo com 2 testemunhas).

**Texto confuso:** "DEVEDOR (LOCATÁRIO)" para uma mulher. Se o sistema já sabe o sexo, usar "DEVEDORA".

## 9. Reajuste no 13º mês: carta

**Funcionou:** reajuste no aluguel de 12/2027 (entrada em dez/2026 = 1º mês), IGP-M de 4,5% digitado (até 11/2027): de R$ 2.000,00 para **R$ 2.090,00** (R$ 1.881,00 em dia). O complemento da caução (R$ 243,00) virou boleto separado, sem NF, e somou na caução quando foi pago.

**Quebrado**
1. **O complemento da caução não sai sozinho** em contrato feito pela ficha: o campo "a quantos aluguéis a caução equivale" fica vazio (embora R$ 5.400,00 seja exatamente 3 × R$ 1.800,00) e o reajuste pede "informe no contrato a quantos aluguéis a caução equivale". O dono precisa editar o contrato.
2. **A carta de reajuste não tem "Enviar agora"**: baixa o PDF para anexar à mão no Gmail, diferente dos outros e-mails. (pode estar em andamento: #412 e "enviar-assinar")

**Texto confuso**
- "Prezado(a) Maria": o sexo está no cadastro, então pode ser "Prezada".
- A carta não fala do **complemento da caução** (R$ 243,00), embora o contrato diga que a caução acompanha o reajuste. Sugestão: "A caução passa a R$ 5.643,00; a diferença de R$ 243,00 vem em boleto separado, com vencimento em 10/01/2028."
- Na tela da carta aparece solto "corrigido: R$ 2.090,00" acima do texto.
- A carta é assinada "IMOBILIARIA TESTE" (nome da NF, sem acento), e não "Imobiliária Teste Ltda".

## 10. Troca de titular: termo, boletos e caução

**Funcionou**
- Termo aditivo de troca completo (quem sai responde até 29/02/2028; prazo não recomeça; garantia nova), com a ciência registrada ao anexar.
- Boletos: fev/2028 da Maria com o mês cheio; mar/2028 do Pedro; a reserva **não** foi abatida de novo.
- Devolução da caução da Maria: R$ 5.643,00 + 8% = R$ 6.094,44, menos o aluguel de fev/2028 = **R$ 4.213,44**, com recibo claro. O boleto de fevereiro ficou "Descontado da garantia".

**Quebrado**
1. **Gás e condomínio somem na troca.** Maria tinha gás e condomínio "por conta do inquilino"; no contrato do Pedro (Novo contrato → "Continua o contrato de Maria"), os dois vieram "Não tem". Por isso o termo e a autorização das contas deixam o gás de fora. A descrição do imóvel também veio vazia.
2. **A reserva da Maria é copiada para o Pedro** (R$ 500,00 de 24/11/2026 aparece no cadastro dele). Não foi abatida de novo, mas confunde e é um risco.
3. **Termo gerado com "caução de R$ 0,00, correspondente a 0 aluguéis"** quando o valor da garantia nova está vazio. O sistema avisa "faltam dados", mas gera o documento assim mesmo. Sugestão: deixar a linha em branco ou não gerar.
4. A **tarifa "0,00"** da Maria foi copiada como valor fixo para o Pedro (o certo seria "padrão das regras").

**Texto confuso**
- Não há botão "Troca de titular" na página de quem sai: é preciso abrir "Novo contrato", escolher "Continua o contrato de" e só então gerar o termo na página do novo inquilino (3 telas).
- Janela da ciência: "a caução de Maria … é devolvida **a ele**" (deve ser "a ela" ou "a quem sai").
- Mensagem: "o último boleto sai **proporcional** aos dias", mas pela decisão de 24/11 quem sai paga o mês cheio (e foi o que aconteceu).
- A página do Pedro mostra "Contrato: 01/03/2028 a 05/06/2029 **(30 meses)**", mas são 15.
- A caixa do seguro diz "quando ele sai, a apólice vai junto e quem entra precisa de uma nova", e o termo diz que "o seguro em vigor continua até o fim da apólice". Os dois textos se contradizem.
- O valor da poupança digitado no termo (R$ 6.118,00) e o calculado na devolução (R$ 6.094,44) não se conferem: o termo pode prometer um valor e o recibo pagar outro.
- O formulário de devolução não mostra o total a devolver antes de salvar.

## 11. Saída: aviso, vistoria, reparos, pintura, cálculo final, chaves, caução

**Funcionou**
- Roteiro da saída em 8 etapas, com um e-mail por etapa; convite da vistoria; vistoria de saída copiada da entrada, com "DIFERENÇA:" virando reparo a cobrar.
- Reparos com orçamento: pintura **R$ 1.200,00** (inteira, porque a entrada teve pintura nova) e chuveiro **R$ 180,00**.
- Multa da saída antecipada sugerida certa: 3 × R$ 2.090,00 × 248/913 dias = **R$ 1.703,13**, contando desde o contrato original, e só entra se o dono incluir.
- Dois casos de cálculo final:
  - com débitos maiores que a caução, saldo a cobrar de **R$ 1.270,60**, com "Gerar boleto do saldo";
  - com agosto pago e a multa dispensada (transferência pelo empregador), R$ 5.643,00 + 3,5% = R$ 5.840,51, menos R$ 3.261,00 = **R$ 2.579,51 devolvidos**.
- O termo de entrega, acerto final e quitação está completo.

**Quebrado**
1. **E-mail de encerramento diz "Não há valores pendentes"** mesmo com saldo de R$ 1.270,60 a cobrar. Para repetir: cálculo final com saldo negativo → "✉ E-mail" de "Devolução da garantia (ou cobrança do saldo)". O texto também diz "Segue o termo…" sem anexo, e começa com letra minúscula ("encerramos").
2. **A data do aviso de saída não é registrada.** "Informar data de saída" pede só a data das chaves. O e-mail "Aviso de saída recebido" põe a data de hoje como data do aviso e não percebe que 02/09 → 30/09 são só 28 dias. (pode estar em andamento: "multa-aviso")
3. **"Marcar garantia devolvida" não pede o comprovante**, mas o termo de quitação diz "conforme o comprovante bancário anexo".
4. Uma vez a página travou ("Page crashed") logo depois de salvar a data de saída. Ao abrir de novo, estava tudo gravado. Não se repetiu.

**Texto confuso**
- O convite da vistoria diz "a vistoria de entrada vai anexa", mas nada vai anexo.
- O termo de devolução das chaves não tem onde marcar **se o inquilino vai acompanhar a vistoria**, e a cláusula 17 do contrato diz que esse termo registra isso. Sugestão: "( ) vou acompanhar ( ) não vou acompanhar".
- O e-mail do acerto manda pagar o saldo por Pix na conta, e o roteiro oferece "Gerar boleto do saldo". Escolher um jeito só.
- Assinatura "LOCADORA · REPRESENTANTE DA ADMINISTRADORA" no termo das chaves: a empresa é a locadora.
- "Último boleto (aluguel de 09/2028, **proporcional**)" quando o mês saiu cheio (saída em 30/09).

**O dono decide**
- **Pintura na troca:** a pintura nova foi na entrada da Maria; o Pedro morou 7 dos 22 meses e pagaria a pintura inteira. Contar desde a entrada de quem? (já está na lista do dono; pode estar em andamento: "adv-pintura", PR #395)

## Páginas da pessoa de fora no celular (375 px)

`/reserva`, `/ficha` (inquilina e fiador) e `/contatos` couberam na largura (sem rolagem para o lado), sem erro na página. Os campos, o código por e-mail e a assinatura com o dedo funcionaram. Só o "R$" separado do valor (item 1).

Em `/contatos` e no comunicado, "os e-mails saem de contato@example.com", mas na simulação eles saíram de `administracao@example.com` (a conta do Gmail). Nos dados reais, confirme que o e-mail da administração em Empresas é o mesmo da conta conectada ao Gmail.

---

## O que corrigir, em ordem

1. **Datas depois das 21h** (link, termo aceito, e-mails da ficha): um dia a mais. (#413 pode cobrir parte)
2. **E-mail de encerramento** dizendo "não há valores pendentes" com saldo a cobrar.
3. **Troca de titular:** gás e condomínio somem; reserva copiada; termo com "caução de R$ 0,00".
4. **Notificação de atraso:** criar o modelo próprio, **sem** multa contratual, e dar baixa quando pagar ou entrar em acordo.
5. **E-mail do contrato sem o contrato** anexado (e a etapa marcada como feita assim mesmo); carta de reajuste sem "Enviar agora". (#412 e "enviar-assinar")
6. **O e-mail do termo perde o link** sem avisar depois de recarregar a página.
7. **Caução feita pela ficha** sem "quantos aluguéis" (o complemento do reajuste não sai sozinho).
8. **Data do aviso de saída** registrada e conferida (30 dias). ("multa-aviso")
9. **Prévia do pagamento atrasado** com os dias e os juros errados quando há "Pagou em".
10. **Textos:** "depósito da depósito", "a ele" para Maria, "Prezado(a)", "recebida" na reiteração, "dia(s)", "SEGURO1/10", "conferido por" nos documentos, anexos prometidos que não vão (vistoria de entrada, comprovante da devolução).
11. **Avisos para o dono decidir:** e-mails demais para a equipe na ficha; "Fiador + depósito" já na ficha; teto da caução (bonificado ou cheio); parcela proporcional do seguro (faltam R$ 4,00); fim do prazo no dia 05 ou 04; pintura na troca.
