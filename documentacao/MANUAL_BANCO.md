# Manual do banco no sistema (C6 Bank: contas ANK e JCK)

Este manual explica, em linguagem simples, como usar a parte bancária do sistema: emitir boletos com Pix, acompanhar quem pagou, buscar o extrato das duas contas, guardar os comprovantes com o nome certo e pagar as contas dos imóveis.

> **Atenção: a parte bancária ainda está sendo construída.** Os nomes de telas e botões abaixo são os combinados no plano (`PLANO_BANCO_FASE2.md` e `LIGAR_C6.md`). Se, quando a tela ficar pronta, um botão tiver um nome um pouco diferente, vale o que está na tela. O que **não muda** são as regras: o sistema nunca paga, nunca negativa e nunca dá baixa em boleto sem alguém confirmar.

Para ligar o sistema ao banco pela primeira vez (chaves, certificado, programa "Ponte C6"), siga o `LIGAR_C6.md`. Este manual começa depois disso, com tudo já ligado.

---

## 1. O que dá para fazer sem entrar no banco

Com a ponte ligada, direto no sistema (menu **Boletos**, **Banco**, página do imóvel e **Contas pagas por nós**):

- **Emitir o boleto com Pix** de cada inquilino no C6, um por vez ou todos os do mês, sempre pela conta da **ANK** (decisão de 16/10/2026: só a ANK emite boleto; a JCK recebe o repasse depois).
- **Pegar o boleto pronto para mandar ao inquilino**: PDF, linha digitável e código Pix "copia e cola".
- **Saber se o boleto foi pago**: aviso automático do banco e o botão **Conferir boletos pagos no banco**.
- **Confirmar o pagamento** no sistema com a data em que o dinheiro entrou (a data contábil, que vira a data da NF).
- **Alterar valor e vencimento** de um boleto já emitido, ou **cancelar** um boleto não pago.
- **Ver o saldo** e **buscar o extrato** das duas contas (ANK e JCK), separadas, mês a mês.
- **Dar um destino a cada linha do extrato**: qual imóvel, qual conta (água, luz, gás, condomínio, internet), qual boleto recebido, IPTU, imposto, tarifa do banco ou transferência entre as duas contas.
- **Baixar o comprovante** (PDF) de cada movimentação, com o nome padrão, direto para a pasta do imóvel e para a pasta do contador.
- **Pagar as contas dos imóveis**: preparar o pagamento, aprovar em duas etapas e enviar ao banco, que deixa o pagamento esperando a aprovação final no aplicativo do C6.
- **Fechar o mês** com a etapa "Banco" no Fechamento, que mostra o que ficou sem destino ou sem comprovante.

O que **continua precisando do aplicativo ou do Web Banking do C6**:

- **Aprovar de fato cada pagamento** enviado pelo sistema (o banco exige a aprovação de uma pessoa autorizada no app).
- Criar ou renovar as **chaves e o certificado** da ligação (LIGAR_C6.md, Etapa 1).
- Pegar o **comprovante oficial** de um tipo de movimentação para o qual o C6 não entrega PDF pela ligação (ver a pergunta 6 da seção 4).
- **Negativar** um inquilino: existe como opção, desligada por padrão, e sempre exige a confirmação do administrador.

---

## 2. Rotina do mês, passo a passo

Os exemplos usam o mês de **novembro/2026**: a inquilina **Maria Exemplo**, da **Loja 1**, com aluguel de **R$ 1.355,00**, bonificação de pontualidade de 10% (paga **R$ 1.219,50** em dia) e vencimento todo **dia 10**. As contas da empresa são **ANK** e **JCK**, as duas no C6.

### 2.1 Gerar os boletos do mês e emitir no C6

1. A partir do **dia 20/11**, abra **Boletos** e clique em **Gerar boletos de 11/2026**. O sistema cria um boleto por inquilino, com o aluguel de novembro, IPTU, seguro, tarifa e o que mais o contrato prevê, vencendo em **10/12/2026**. Isso é como já era: ainda não foi nada ao banco.
2. Confira os valores. Se algum boleto precisar de ajuste à mão, faça agora, antes de emitir.
3. Emita no banco:
   - **um por vez**: abra o boleto e clique em **Emitir no C6**;
   - **todos de uma vez**: use a opção de emitir **todos do mês**. O sistema emite um a um e avisa quantos foram emitidos e quais deram erro.
4. O banco devolve, para cada boleto: a **linha digitável**, o **código de barras**, o **nosso número** e o **Pix copia e cola** com o QR Code. Tudo fica guardado no boleto, e o PDF entra na pasta do inquilino.
5. Se algum boleto for recusado, o sistema mostra o motivo em português. O caso mais comum é um campo do cadastro maior do que o C6 aceita (nome com mais de 40 letras, rua com número maior que 40, bairro ou cidade com mais de 40, CEP sem 8 números, barra "/" no endereço). O sistema **avisa e não corta nada sozinho**: encurte o cadastro (ex.: "Av." em vez de "Avenida") e emita de novo.

Exemplo: no boleto da Maria Exemplo, o banco vai cobrar **R$ 1.219,50** até 10/12/2026. Se ela atrasar, o próprio boleto passa a cobrar o aluguel cheio (R$ 1.355,00) mais a multa e os juros do contrato, do mesmo jeito que o sistema calcula. O inquilino nunca precisa pedir um boleto novo por causa de atraso.

Cada boleto emitido ganha um código único de 26 letras e números (o `external_reference_id`), que o sistema usa para conversar com o banco sobre aquele boleto. Ele nunca se repete: o mesmo boleto nunca é emitido duas vezes por engano.

### 2.2 Enviar o boleto ou o Pix ao inquilino

O sistema não manda mensagem sozinho; ele deixa tudo pronto para você mandar por WhatsApp ou e-mail:

- **Baixar PDF**: o boleto do banco, com código de barras e QR Code do Pix.
- **Linha digitável**: para quem paga digitando no aplicativo do banco dele.
- **Pix copia e cola**: o inquilino cola no app e paga na hora. É o mesmo boleto: pagando pelo Pix, o boleto é dado como pago no banco.
- **Copiar texto do boleto**: um texto com valor, vencimento e o que está sendo cobrado, para colar na mensagem.

Se quiser, o C6 também pode avisar o inquilino por e-mail ou SMS (na emissão, no dia anterior ao vencimento, no vencimento ou no dia seguinte). Isso é uma opção, desligada por padrão.

### 2.3 Acompanhar os pagamentos

Há dois caminhos, que se completam:

- **Aviso automático**: quando um boleto é pago, o C6 avisa a ponte. A ponte **não dá baixa com esse aviso**: ela consulta o boleto no banco para confirmar e o sistema mostra o boleto como "pago no banco, aguardando confirmação" na tela **Boletos**.
- **Conferir boletos pagos no banco**: botão na tela **Boletos**. O sistema pergunta ao C6 quais boletos foram pagos num período e mostra a lista com a data em que o inquilino pagou e a data em que o dinheiro foi creditado. Use quando quiser conferir tudo de uma vez, por exemplo no dia 11 e no fim do mês.

Nos dois casos o sistema **mostra**; quem **confirma** é você (passo 2.4).

### 2.4 Confirmar o pagamento e numerar a NF

1. Na tela **Boletos**, o boleto pago aparece com a data e o valor que o banco informou. Clique em **Confirmar pagamento**. O sistema já sugere:
   - a **data contábil**: o dia em que o dinheiro **entrou na conta** (data de crédito), que é a data da NF;
   - **"pagou em dia"** marcado quando o inquilino pagou até o vencimento e o banco só creditou depois.
2. Se vários inquilinos pagaram em dia no mesmo vencimento, use a **Baixa em lote (pagos em dia)**: marque os boletos e clique em **Confirmar os marcados como pagos em dia**, informando a data em que o dinheiro entrou.
3. Se o valor recebido for **diferente do previsto** para aquela data, o sistema pede uma justificativa e deixa você digitar o valor da NF à mão (a justificativa fica só no sistema).
4. Depois da virada do mês (a partir de **01/12** para os pagamentos de novembro), com as NFs avulsas e as do Airbnb já lançadas, vá em **NF** e clique em **Numerar estas NFs** (ou **Numerar NFs agora** na tela Boletos). Os números seguem a ordem da data contábil e são divididos entre as empresas conforme a participação de cada imóvel (ex.: Loja 1 com ANK 50% e JCK 50% gera duas NFs com o mesmo número, uma por empresa).

Exemplo: a Maria Exemplo pagou pelo Pix em **10/12/2026** às 22h, e o C6 creditou em **11/12/2026**. Data contábil = **11/12/2026**, "pagou em dia" marcado, NF de **R$ 1.219,50** com data 11/12/2026. Se ela pagasse só em **15/12/2026**, o boleto cobraria o aluguel cheio mais multa e juros (algo como R$ 1.385,00), a data contábil seria a do crédito e a NF sairia com multa e juros incluídos.

### 2.5 Buscar o extrato das duas contas

1. Abra o menu **Banco**. Há uma aba por conta: **ANK · conta no C6** e **JCK · conta no C6**. Escolha o mês com as setas (← novembro/2026 →).
2. Clique em **Buscar o extrato de novembro/2026 no banco**. O sistema pega no C6 só o que ainda não tinha e avisa, por exemplo: "ANK: 12 movimentações novas, 30 já estavam." Nada é importado duas vezes.
3. Repita na aba **JCK**.
4. **Ver saldo** mostra o saldo do momento. Os números de cima da tela mostram entradas, saídas, quantas linhas estão **sem destino**, quantas estão **sem comprovante** e até que dia o extrato já foi buscado.

Pode buscar quantas vezes quiser no mês (uma vez por semana, por exemplo). O importante é que, no fechamento, as duas contas estejam buscadas até o último dia do mês.

### 2.6 Dar destino a cada movimentação

Cada linha do extrato precisa de um **destino**. O sistema sugere o destino quando reconhece a linha (etiqueta "parece: Loja 1 · Água"); basta clicar em **Usar sugestão**. Quando não reconhece, você escolhe:

| O que é a linha | O que fazer | Exemplo |
|---|---|---|
| Conta de um imóvel paga por nós (água, luz, gás, condomínio, internet, outra) | **Atrelar a imóvel/conta**: escolha o imóvel, o tipo e o mês da conta. O sistema lança a conta em **Contas pagas por nós** com o valor e a data do extrato | "PAGAMENTO BOLETO SANEPAR" de R$ 123,45 em 05/11/2026 → Loja 1 · Água 11/2026 |
| IPTU pago na prefeitura | **Atrelar a imóvel/conta**, tipo **IPTU**, e escolha a parcela em aberto. A parcela fica marcada como paga | R$ 210,00 em 10/11/2026 → Loja 1 · IPTU 2026 · 3ª parcela |
| Aluguel recebido (boleto ou Pix do boleto) | **É o pagamento do boleto…**: o sistema lista os boletos em aberto que batem ("bate certinho" ou "provável"). Escolha, confira a data e o valor e clique em **Confirmar pagamento** | entrada de R$ 1.219,50 em 11/12/2026 → boleto 11/2026 da Maria Exemplo |
| Transferência entre as nossas contas | **Outro destino → Transferência**. A linha aparece nos dois extratos (saída na ANK, entrada na JCK) e o sistema liga as duas, para não virar conta de imóvel duas vezes. Tem comprovante também: um PDF só, com o nome da empresa de origem, na pasta do contador da conta de **origem** (`_Contador/ANK/2026-11/`), sem pasta de imóvel | "TED PARA JCK" de R$ 5.000,00 em 20/11/2026 |
| Tarifa do banco | **Outro destino → Tarifa** | "TARIFA PACOTE" de R$ 39,90 |
| Imposto da empresa (PIS/COFINS, IRPJ, CSLL) | **Outro destino → Imposto**, ligando à guia do mês | DARF de R$ 450,00 em 20/11/2026 |
| Só precisa do comprovante, sem imóvel | **Outro destino → Outro**, com uma observação | compra de material de escritório |
| Não é nosso, ou não interessa | **Outro destino → Ignorar** (a linha fica riscada, mas não some) | estorno de tarifa |

Regras que o sistema aplica ao atrelar uma conta a um imóvel:

- Só aceita conta paga por nós quando o contrato permite (imóvel vago, até 2 meses depois de alugar, ou contrato com "incluso no aluguel"). Se em 11/2026 a água da Loja 1 é por conta do inquilino, o sistema avisa: "Em 11/2026 o inquilino paga Água, conforme o contrato. Se mesmo assim foi paga por nós, escolha 'Outro' e escreva o motivo."
- Uma linha só tem um destino. Errou? Clique no **×** (**Desfazer o destino**) e escolha de novo. Se o destino era um boleto, o desfazer é na tela **Boletos**, pelo botão **Desfazer pagamento**.
- Os dados que vieram do banco (data, valor, descrição) nunca são editados: só o destino, o comprovante e as observações.

### 2.7 Nomear e guardar os comprovantes

1. Na linha da movimentação, clique em **Nomear e baixar comprovante**. O sistema propõe o nome padrão e mostra as duas pastas onde o PDF vai ficar. Pode trocar o nome antes de confirmar.
2. O nome padrão é **"AAAA-MM-DD empresa imóvel tipo valor"**, sem acento (o padrão pode ser mudado em Dados e backup → Banco):
   - `2026-11-05 ANK Loja 1 Agua 123,45.pdf`
   - `2026-11-10 ANK Loja 1 IPTU 2026 3a parcela 210,00.pdf`
   - `2026-12-11 ANK Loja 1 Aluguel Maria Exemplo 1.219,50.pdf`
   - `2026-11-20 ANK Geral Transferencia 5.000,00.pdf` ("Geral" quando não há imóvel)
3. O mesmo PDF é guardado em **dois lugares** da pasta de dados (OneDrive):
   - **pasta do imóvel**: `arquivos/Loja 1/Contas pagas/2026/` (IPTU vai para `arquivos/Loja 1/IPTU (guias)/2026/`);
   - **pasta do contador**: `arquivos/_Contador/ANK/2026-11/` (uma pasta por empresa e por mês; a da JCK é `_Contador/JCK/2026-11/`). O mês é sempre o **mês em que o dinheiro saiu ou entrou** (a data da linha do extrato), não o mês da conta: a conta de 12/2026 paga em 28/11/2026 vai para `2026-11`. Um pagamento feito pelo sistema e a linha do extrato que o confirmou dividem o **mesmo** PDF, que aparece nos dois e em Contas pagas por nós.
4. Para quem já deu destino a tudo, **Baixar todos os comprovantes do mês** baixa de uma vez os que faltam, com o nome padrão, e diz quantos deram certo.
5. O comprovante aparece com um 📎 na linha do extrato, na caixa **Banco** da página do imóvel e em **Contas pagas por nós**. O **×** ao lado apaga só o arquivo (a linha volta a "sem comprovante"). Se a conta for excluída, o PDF sai das duas pastas e a linha do extrato volta a "sem destino".

Se a ponte estiver desligada, o botão vira **Anexar do PC**: baixe o comprovante no app do C6 e anexe; o sistema dá o nome padrão e guarda nas mesmas duas pastas.

### 2.8 Mandar a pasta do contador no fim do mês

No começo do mês seguinte (ex.: a partir de **01/12/2026** para novembro), com o extrato das duas contas buscado até 30/11, todas as linhas com destino e os comprovantes baixados:

1. As pastas `arquivos/_Contador/ANK/2026-11/` e `arquivos/_Contador/JCK/2026-11/` já têm todos os comprovantes do mês, um PDF por movimentação, com o nome que diz data, empresa, imóvel, tipo e valor.
2. Em **NF**, use **Baixar todas em PDF (ZIP)** (ou **Excel**) para as notas do mês.
3. Mande as pastas e o ZIP ao contador do jeito combinado com ele (e-mail, WhatsApp ou compartilhando a pasta do OneDrive). O sistema não envia nada sozinho.

### 2.9 Pagar as contas dos imóveis pelo sistema

Vale para água, luz, gás, condomínio, internet, IPTU e guias de imposto. Precisa estar ligado em **Dados e backup → Banco** ("Permitir pagamentos pelo banco", só o administrador liga; há também um limite por pagamento, opcional).

**Passo 1 — Preparar** (operador ou administrador). Em **Contas pagas por nós** do imóvel (`#/contas/Loja 1`), no cartão de pagar pelo banco:
- escolha a conta a pagar (ex.: **Luz**), o mês da conta (**11/2026**), o valor (**R$ 200,00**), o vencimento (**15/11/2026**);
- a forma: **boleto** (cole a linha digitável ou o código de barras; o sistema confere que tem 44, 47 ou 48 números e avisa "47 dígitos ✓") ou **Pix** (chave ou copia e cola);
- o beneficiário (ex.: Copel) e **qual conta paga** (ANK ou JCK; o sistema sugere a empresa com maior participação no imóvel);
- clique em **Preparar pagamento**. A situação fica **"Aguardando aprovação do administrador"**. Nada foi ao banco ainda.

**Passo 2 — Aprovar e enviar** (só o administrador). Na lista de pagamentos do imóvel, clique em **Aprovar e enviar ao banco**:
- 1ª janela: o resumo completo (conta que paga e saldo, beneficiário, **valor**, vencimento, data do pagamento, código de barras, imóvel e conta). Confira e clique em "Conferi, continuar".
- 2ª janela: digite o valor exatamente como aparece (**200,00**) e clique em **PAGAR**. Qualquer diferença cancela, sem enviar nada.
- O pedido vai à ponte, que o envia ao C6. A situação passa a **"Enviado ao banco (agendado)"**.

**Passo 3 — Aprovar no aplicativo do C6.** O C6 não paga só com o pedido do sistema: o pedido entra na fila de aprovação da conta. Uma pessoa autorizada abre o **aplicativo do C6** (ou o Web Banking), confere e aprova. Sem essa aprovação, o dinheiro não sai.

**Passo 4 — Confirmar pelo extrato.** Clique em **Atualizar situação** no pagamento (ou busque o extrato do mês): quando a saída de R$ 200,00 aparecer na conta, a situação vira **"Pago"**, a conta entra em **Contas pagas por nós** com a data em que saiu e a etiqueta "pelo banco", e o comprovante é baixado com o nome padrão (ex.: `2026-11-14 ANK Loja 1 Luz 200,00.pdf`) para as duas pastas.

Observações:
- **Cancelar** só funciona enquanto o pagamento está em rascunho, aguardando aprovação ou com erro. Depois de enviado, cancele no app do C6.
- Se a internet cair logo depois do **PAGAR**, o sistema mostra: "Não tive resposta do banco. Clique em 'Atualizar situação' antes de tentar de novo." Faça isso: o pedido tem um número único e o banco nunca o recebe duas vezes.
- Se o DDA da conta estiver ativo, o C6 já conhece os boletos em nome da empresa; mesmo assim, no sistema cada pagamento é preparado e aprovado um a um.

### 2.10 Fechamento do mês

Em **Fechamento**, além das etapas de sempre (gerar boletos, cartas de reajuste, conferir pagamentos, numerar NFs, condomínio, contas pagas por nós), há a etapa **"Conferir o extrato de 11/2026 das contas (ANK e JCK) e dar destino às movimentações"**. Ela mostra, por conta, quantas linhas estão sem destino e se o extrato ainda não foi buscado, com os links **Abrir ANK** e **Abrir JCK** (que abrem a tela Banco já filtrada em "sem destino"). Quando zerar, ela fica como feita sozinha; se sobrar algo que você decidiu deixar, use **Marcar como feito**.

O Painel também avisa: "N movimentações do extrato sem destino; M comprovantes não baixados."

---

## 3. O que o sistema NUNCA faz sozinho

- **Nunca paga.** Todo pagamento nasce de alguém que clicou em **Preparar pagamento**, de um administrador que conferiu, digitou o valor e clicou em **PAGAR**, e de uma pessoa que aprovou no aplicativo do C6. Não existe pagamento automático, recorrente ou "agendado pelo sistema".
- **Nunca negativa um inquilino.** A negativação é uma opção desligada por padrão; quando ligada, cada caso exige a confirmação do administrador.
- **Nunca dá baixa em boleto sem confirmação.** O aviso do banco e o botão "Conferir boletos pagos no banco" só **mostram**; a baixa acontece quando você clica em **Confirmar pagamento** (ou confirma a baixa em lote). O mesmo vale para o extrato: a entrada só vira pagamento de boleto depois de "É o pagamento do boleto…" e **Confirmar pagamento**.
- **Nunca inventa um destino.** As sugestões ("parece: Loja 1 · Água") só valem depois de **Usar sugestão**.
- **Nunca apaga o extrato.** Linhas do banco não se excluem; no máximo ficam como "Ignorada".
- **Nunca envia nada ao inquilino nem ao contador.** Ele prepara (PDF, linha digitável, Pix, pastas) e você manda.
- **Nunca guarda as chaves do banco na pasta de dados nem no site.** Elas ficam só no computador da ponte.

Tudo o que foi feito (importação, destino, comprovante, preparação, aprovação, envio) fica no **Histórico**, com quem fez e quando.

---

## 4. Perguntas frequentes

**1. Preciso mudar o valor ou o vencimento de um boleto já emitido. E agora?**
Dá para alterar sem cancelar: o C6 aceita mudar valor, vencimento e descrição de um boleto não pago. Altere o boleto no sistema (como já faz hoje) e reenvie a alteração ao banco pela própria tela do boleto. A linha digitável continua a mesma; o inquilino que já recebeu o boleto paga normalmente pelo valor novo. Se o boleto já estiver pago, não dá para alterar: confirme o pagamento e trate a diferença no boleto seguinte ou como pagamento divergente (pergunta 4).

**2. Como cancelo um boleto emitido?**
Só boleto **não pago** pode ser cancelado no banco. Ao excluir o boleto no sistema (botão **Excluir** do boleto em aberto), ele é cancelado também no C6, e o inquilino não consegue mais pagá-lo. Boleto pago não se exclui: use **Desfazer pagamento** antes, se for o caso.

**3. O inquilino pagou "por fora" (Pix direto na conta, dinheiro, transferência), sem usar o boleto.**
O dinheiro aparece no extrato como uma entrada. Em **Banco**, na linha dessa entrada, clique em **É o pagamento do boleto…**, escolha o boleto e confirme. Depois, **cancele o boleto no banco** (pergunta 2) para ele não ser pago de novo. Se o inquilino pagou em dinheiro e não há linha no extrato, confirme o pagamento na tela **Boletos** como sempre.

**4. O inquilino pagou um valor menor (ou maior) do que o boleto.**
O boleto do C6 só aceita o valor cheio, então pagamento parcial em geral chega por Pix direto na conta. Ao ligar a entrada ao boleto, o sistema vê que o valor é diferente do previsto para a data, pede uma **justificativa** e deixa você digitar o valor da NF. Exemplo: previsto R$ 1.219,50, recebido R$ 1.000,00 em 10/12/2026; justificativa "pagou parcial, restante combinado para 20/12". A diferença você cobra à parte (um boleto novo ou outro Pix), e o segundo valor entra como outra NF ou ajuste, conforme combinar com o contador.

**5. O inquilino pagou num dia e o dinheiro entrou noutro. Que data uso?**
Use sempre a **data contábil** = dia em que o dinheiro **entrou na conta** (data de crédito). É ela que dá a data e o número da NF. Se o inquilino pagou até o vencimento, marque **"pagou em dia"**: o sistema tira multa e juros mesmo com o crédito depois do vencimento. Exemplo: vencimento 10/12/2026, pagou 10/12 à noite, creditado 11/12 → data contábil 11/12/2026, pagou em dia, NF de R$ 1.219,50. Se atrasou de verdade (pagou 15/12, creditado 16/12), informe também o dia em que pagou (15/12): multa e juros são calculados até esse dia.

**6. Qual a diferença entre o comprovante oficial do banco e o comprovante gerado pelo sistema?**
Quando o C6 entrega o PDF da movimentação pela ligação, o sistema guarda esse PDF: é o **comprovante oficial**, igual ao do aplicativo. Para alguns tipos de lançamento o banco não entrega PDF; nesse caso a ponte gera um PDF simples com os dados da linha do extrato (data, valor, descrição, quem recebeu) só para não deixar a pasta vazia. Ele é marcado como gerado pelo sistema e **não é um documento do banco**. Se o contador precisar do oficial, baixe no aplicativo ou no Web Banking do C6 e troque pelo **Anexar do PC**; o nome padrão e as pastas continuam os mesmos.

**7. A ponte está desligada. O que funciona e o que faço?**
A tela **Banco** abre normalmente e mostra o aviso "A ponte com o banco não respondeu. Abra o programa 'Ponte C6' neste computador e tente de novo. O que já foi importado continua aqui." Continuam funcionando: ver o que já foi importado, dar destino às linhas, confirmar pagamentos de boleto à mão na tela Boletos e **Anexar do PC** os comprovantes. Não funcionam: emitir boleto, buscar extrato, ver saldo, baixar comprovante do banco e enviar pagamentos. Para religar: no computador da ponte, abra o programa "Ponte C6" (ou confira se ele iniciou com o computador) e teste em **Dados e backup → Banco C6 (ponte) → Testar conexão**. Se continuar fora, veja a tabela "Se der erro" do `LIGAR_C6.md` (Etapa 6).

**8. Busquei o extrato duas vezes. Duplicou?**
Não. Cada linha do banco tem um código único; o sistema só importa o que ainda não tinha e avisa "12 novas, 30 já estavam".

**9. A transferência da ANK para a JCK apareceu nas duas contas. Lanço duas vezes?**
Não. Dê o destino **Transferência** em uma delas: o sistema acha a outra ponta (mesmo valor, mesma data, na outra conta) e liga as duas. Nenhuma vira despesa de imóvel.

**10. Excluí uma conta paga por nós que veio do extrato. O que acontece?**
A linha do extrato volta a "sem destino" e o comprovante sai das duas pastas (do imóvel e do contador). Uma conta que foi **paga pelo banco** pelo sistema não pode ser excluída.

---

## 5. Glossário curto

- **Ponte (Ponte C6)**: programa pequeno que roda num computador da empresa e conversa com o C6 em nome do sistema. O C6 só aceita chamadas com certificado digital, e o navegador não consegue fazer isso; por isso existe a ponte. As chaves do banco ficam só nela.
- **Sandbox**: ambiente de **testes** do C6. Boletos e pagamentos ali são de brincadeira, não valem dinheiro. Serve para a homologação e para testar antes de ligar o real. Funciona de segunda a sexta, das 7h às 22h.
- **Produção**: ambiente **real** do C6. Boleto emitido em produção é cobrado de verdade; pagamento em produção tira dinheiro da conta.
- **Modo simulado**: a ponte finge ser o banco, sem falar com o C6. Serve para testar a ligação sistema ↔ ponte sem gastar credencial.
- **external_reference_id**: código de 26 letras e números que o sistema cria para cada boleto emitido e usa em toda conversa com o banco sobre ele (consultar, alterar, cancelar, baixar PDF). Nunca se repete.
- **Nosso número**: número que o banco dá ao boleto dentro da carteira de cobrança. Aparece no boleto e, às vezes, na linha do extrato quando o boleto é liquidado; o sistema usa para casar a entrada com o boleto certo.
- **Linha digitável**: os 47 números do boleto que a pessoa digita no app do banco dela. **Código de barras**: os 44 números que a câmera lê. Contas de concessionária (água, luz) têm 48.
- **Pix copia e cola**: texto comprido que o inquilino cola no app do banco para pagar na hora; é o mesmo conteúdo do QR Code impresso no boleto.
- **EVP**: chave Pix **aleatória** (não é CPF, telefone nem e-mail), cadastrada no C6 na conta da ANK. É a chave que o banco põe no QR Code dos boletos.
- **DDA**: Débito Direto Autorizado. Serviço do banco que lista os boletos emitidos em nome da empresa (CNPJ) sem ninguém digitar a linha. Quando ativo, o C6 já conhece as contas a pagar; no sistema, cada pagamento continua sendo preparado e aprovado um a um.
- **Data contábil**: dia em que o dinheiro entrou na conta. É a data da NF e manda na numeração.
- **Competência**: mês de uso do imóvel (ex.: 11/2026). O boleto de 11/2026 é gerado a partir de 20/11 e vence em 10/12/2026.
- **Destino (conciliação)**: dizer, para cada linha do extrato, o que ela é: conta de imóvel, boleto recebido, IPTU, imposto, tarifa, transferência, outro ou ignorar.
- **Web Banking**: o site do C6 para a conta da empresa, onde se criam as chaves da ligação e se aprovam pagamentos (também pode ser no aplicativo).
