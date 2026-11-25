# Conferir o que mudou (18/11 a 24/11/2026)

Lista de 24/11/2026 (pedido C3): tudo o que mudou no sistema desde 18/11 (PRs #318 em diante) e que você ainda não conferiu, **tela por tela**. Para cada item: onde clicar, o que fazer e o que deve aparecer. Marque `[x]` no que conferir e mande ao Claude o que não bater (com a tela e o valor que apareceu).

**Antes de começar:**
- Use um **contrato e um inquilino de teste** (CPF de teste 529.982.247-25), com o seu próprio e-mail e celular. Nunca mande nada "a todos" sem antes testar com o de teste.
- Confira no **computador** e no **celular**. Se a tela parecer antiga, feche e abra o aplicativo de novo (ele baixa a versão nova).
- Se um passo pedir algo que não dá para desfazer (enviar e-mail, gerar boleto no banco), pare e pergunte ao Claude.

**Por onde começar (o mais importante):** 1) Boletos (parte 2: vários ajustes no mesmo boleto e seguro no boleto alterado à mão); 2) as páginas novas de Sistema; 3) certificado e assinatura; 4) o resto, na ordem que quiser.

O que mudou e por quê está em `HISTORICO_DO_SISTEMA.md`.

## Parte 1: mudanças de 18/11 a 21/11/2026 (PRs #318 a #340)

Ficaram de fora: as PRs só de documentação (#327, #328, #333, #334, #335) e a #325 (data de conclusão da solicitação), que você já conferiu em 19/11. Dos mutirões de 19–20/11 (#329 a #332), entram só as mudanças que aparecem na tela.

⚠ Fontes discordam: a lista de pendências (item 4c) diz que o aviso do backup seguro da empresa (#319) aparece em "Dados e backup". No sistema de hoje, o aviso "Backup seguro parado" aparece no **Painel**. A página Sistema → Backup seguro mostra só a data da última cópia.

### Painel (como chegar: Menu → Painel)
- [ ] **Aviso do backup seguro vale para a empresa toda, não para cada computador** (PR #319, 18/11/2026)
  - Onde clicar: abra o sistema num computador ou celular que não faz o backup e olhe o Painel. Depois vá em Menu → Sistema → caixa "Backup seguro (só administrador)" → Backup seguro.
  - O que fazer: deixe o computador do backup ligado e abra o sistema no celular.
  - O que deve aparecer: no celular, o Painel **não** pede para ligar o backup. Se nenhum computador fizer cópia por mais de 3 dias, aparece "Backup seguro parado: a última cópia foi em 14/11/2026, 15:02 (nome do computador)…", com os botões "Ligar neste computador" e "Não avisar desta vez". Na página Backup seguro aparece "Backup seguro da empresa: última cópia em …".
- [ ] **"Adiar" um alerta que já foi adiado antes não dá mais erro** (PR #330, 20/11/2026, mutirão)
  - Onde clicar: num alerta do Painel, no botão de adiar.
  - O que fazer: adie um alerta. Quando ele voltar, adie de novo.
  - O que deve aparecer: o aviso "Alerta adiado: volta em …" e o alerta indo para a lista dos adiados. Antes aparecia um erro estranho ("iso.slice is not a function").
- [ ] **Botão "Desligar" do alerta "Incluir caução e anexar comprovante" funciona** (PR #330, 20/11/2026, mutirão)
  - Onde clicar: no Painel, no alerta da caução de um contrato de teste, botão "Desligar".
  - O que deve aparecer: o alerta some. Antes aparecia "Tipo de alerta desconhecido."

### Inquilinos → Comunicações (como chegar: Menu → Inquilinos → aba "Comunicações")
- [ ] **Aba nova "Comunicações" com o comunicado de contatos** (PR #320, 18/11/2026)
  - Onde clicar: "Novo comunicado a todos" → escolha o modelo "Atualização de contatos e novo e-mail da empresa" → Criar.
  - O que fazer: antes de mandar a todos, use um **inquilino de teste com o seu e-mail e o seu celular**. Clique em "Ver como o inquilino vê". Depois, só na linha do inquilino de teste, clique em "E-mail" e abra o link no celular. Peça o código, confirme, marque "Li e concordo" e assine com o dedo. Volte e clique em "Atualizar situação".
  - O que deve aparecer: o e-mail chega com a logo. A página mostra as duas empresas, o CNPJ e o aviso "a conta e o Pix não mudam". Depois de "Atualizar situação", o e-mail e o celular novos aparecem no cadastro do inquilino de teste. Os botões "✉ Enviar e-mail a todos", "WhatsApp a todos" e "Lembrar quem falta" só devem ser usados depois desse teste.
- [ ] **Comunicado vai também ao inquilino solidário e ao representante da empresa** (PR #339, 21/11/2026)
  - Onde clicar: "Novo comunicado a todos" (antes de criar).
  - O que fazer: leia a linha "Vai para … pessoa(s)".
  - O que deve aparecer: a contagem separa inquilinos, solidários, representantes e fiadores. Ex.: "Vai para 12 pessoa(s): 8 inquilino(s), 1 solidário(s)…". Na lista aparecem "(inquilino solidário)" e "(representante da empresa)". Quando o solidário confirma, muda o contato **dele**, e não o do inquilino.
- [ ] **Gerar novo link e excluir um comunicado com erro** (PR #329, 20/11/2026, mutirão)
  - Onde clicar: no comunicado, na linha de uma pessoa, use "Gerar novo link" ou "Desligar o link". No comunicado ainda não enviado, use "Excluir comunicado".
  - O que fazer: com o inquilino de teste, gere um link novo.
  - O que deve aparecer: o link antigo para de valer e o novo funciona, mesmo que o antigo tivesse travado em "códigos demais". Um comunicado criado com erro e ainda não enviado pode ser excluído.
- [ ] **Solicitações e Notificações saíram da lista de Inquilinos e ficaram só aqui** (PR #323, 19/11/2026)
  - Onde clicar: Menu → Inquilinos (aba "Lista") e depois a aba "Comunicações".
  - O que deve aparecer: na Lista, esses dois botões não aparecem mais. Em Comunicações aparecem os botões "Solicitações (2)", "Notificações (3 · 1 com prazo vencido)" e "Modelos". Os números são de exemplo.

### Solicitações dos inquilinos (como chegar: Menu → Inquilinos → Comunicações → Solicitações)
- [ ] **O filtro pela situação voltou a funcionar** (PR #326, 19/11/2026)
  - Onde clicar: nos botões de situação acima da lista (abertas, em andamento, concluídas).
  - O que fazer: tenha uma solicitação aberta e uma concluída e clique em "abertas".
  - O que deve aparecer: só as abertas. Antes, o botão mostrava todas.
- [ ] **O botão tem nome novo: "Nova solicitação do inquilino"** (PR #338, 21/11/2026)
  - Onde clicar: no alto da página.
  - O que deve aparecer: "Nova solicitação do inquilino", para não confundir com o pedido de reserva.
- [ ] **Uma solicitação concluída pode ser reaberta** (PR #329, 20/11/2026, mutirão)
  - O que fazer: abra uma solicitação "Concluída" de teste, troque para "Aberta" e salve.
  - O que deve aparecer: ela continua "Aberta". Antes, voltava sozinha para "Concluída" por causa da data de conclusão.

### Fichas: pedido de reserva (como chegar: Menu → Inquilinos → caixa das fichas em análise)
- [ ] **O inquilino novo começa pelo "Novo pedido de reserva", com um formulário curto** (PRs #324, 19/11/2026, e #338, 21/11/2026)
  - Onde clicar: "Novo pedido de reserva".
  - O que fazer: preencha o imóvel, o contato "Inquilino Teste" com o seu e-mail, aluguel de R$ 1.800,00 e vencimento no dia 10. Salve.
  - O que deve aparecer: o título "Novo pedido de reserva", a parte "Pedido de reserva" e o campo "Pedido recebido em". O formulário exige e-mail ou telefone. Depois de salvar, abre a página da ficha, de onde sai o link para a pessoa preencher o resto.
- [ ] **Uma ficha com reserva recebida não pode ser excluída** (PR #330, 20/11/2026, mutirão)
  - O que fazer: numa ficha de teste com reserva de R$ 500,00 registrada e ainda não devolvida, tente excluir a ficha.
  - O que deve aparecer: "Esta ficha tem reserva de R$ 500,00 recebida e não devolvida: registre a devolução da reserva antes de excluir."
- [ ] **A ficha pela internet recusa CPF inválido** (PR #329, 20/11/2026, mutirão)
  - O que fazer: no link da ficha de teste, digite o CPF 111.111.111-11. Depois digite 529.982.247-25.
  - O que deve aparecer: o primeiro é recusado. O segundo é aceito e fica formatado.

### Regras do sistema e regras especiais (como chegar: Menu → Sistema → botão "Regras do sistema")
- [ ] **Regras especiais para alguns contratos** (PR #322, 19/11/2026)
  - Onde clicar: no quadro "Regras especiais (para alguns contratos)", crie uma "Regra especial A" com o proporcional pelos dias reais do mês. Depois, num contrato de teste, vá em Editar → campo "Regras deste contrato" → "Regra especial A".
  - O que fazer: use um contrato de teste com aluguel de R$ 1.800,00 e entrada em 15/02/2027. Gere o boleto de 02/2027.
  - O que deve aparecer: na página do contrato, o selo "Regras: Regra especial A". O boleto sai com R$ 900,00 (14/28). Com "Regras do sistema", sairia R$ 960,00 (16/30).

### E-mails de cada etapa (como chegar: Menu → Sistema → Comunicação E-mail → Modelos de e-mail)
- [ ] **E-mails mais curtos** (PR #321, 18/11/2026)
  - O que fazer: abra um modelo (ex.: o do contrato assinado) e mande um e-mail de teste para você mesmo.
  - O que deve aparecer: um texto mais curto, mas ainda com os prazos, a multa e os juros, os 5 dias úteis e as ressalvas. Um modelo que você editou antes continua com o seu texto até você clicar em "Voltar ao padrão".
- [ ] **O e-mail do contrato assinado só fala da caução recebida se ela foi registrada** (PR #329, 20/11/2026, mutirão)
  - O que fazer: num contrato de teste com caução de R$ 4.860,00 ainda sem depósito, abra o e-mail do contrato assinado.
  - O que deve aparecer: o e-mail não diz "Recebemos também a caução de R$ 4.860,00". Essa frase só aparece depois que o depósito é registrado.

### Página do inquilino (como chegar: Menu → Inquilinos → clicar no nome)
- [ ] **A coluna NF mostra as duas NFs do boleto, uma de cada empresa** (PR #340, 21/11/2026)
  - Onde clicar: na tabela de boletos, coluna NF.
  - O que fazer: abra um inquilino cujo aluguel sai em NF da ANK e da JCK.
  - O que deve aparecer: "Nº 0077 ANK R$ 609,25" e "Nº 0077 JCK R$ 609,25", e cada um abre a sua NF. Com uma empresa só, aparece só "Nº 0077".
- [ ] **O seguro contra incêndio não tem mais a opção "Não tem"** (PR #331, 20/11/2026)
  - Onde clicar: Editar o contrato → campo do seguro contra incêndio.
  - O que deve aparecer: só "Por conta do inquilino" e "Incluso no aluguel". Um contrato antigo que estava "Não tem" ganha o alerta "O seguro contra incêndio é obrigatório e este contrato está como 'Não tem'…".
- [ ] **O modelo "Não residencial (comercial)" gera o contrato comercial** (PR #330, 20/11/2026, mutirão)
  - Onde clicar: "Gerar contrato" → modelo "Não residencial".
  - O que fazer: use um contrato de teste de empresa (CNPJ 11.222.333/0001-81).
  - O que deve aparecer: o título "CONTRATO DE LOCAÇÃO NÃO RESIDENCIAL". Antes saía o residencial. No contrato sem fiador, a frase sai "O LOCATÁRIO aceita como válidas…", e não mais "aceitam" (essa correção veio na PR #329).
- [ ] **Boleto do saldo do cálculo final** (PRs #331 e #332, 20/11/2026)
  - Onde clicar: no cálculo final da saída de um inquilino de teste que ficou devendo, clique em "Gerar boleto do saldo (R$ 300,00)".
  - O que fazer: gere o boleto com vencimento em 30/11/2026 e registre o pagamento em 20/12/2026.
  - O que deve aparecer: o boleto sai sem NF. Pago com atraso, ele tem a multa e os juros do contrato (ex.: R$ 300,00 + R$ 30,00 de multa + juros). Ao confirmar o pagamento, a etapa "saldo cobrado" fica marcada sozinha. Ao desfazer o cálculo, o boleto em aberto é apagado. Se ele já foi pago, o sistema não deixa desfazer.
- [ ] **"Desfazer a saída" deixa a próxima saída começar do zero** (PR #330, 20/11/2026, mutirão)
  - Onde clicar: no quadro da saída, "Desfazer a saída".
  - O que fazer: num inquilino de teste com a vistoria de saída marcada, desfaça a saída e informe uma saída nova.
  - O que deve aparecer: o roteiro da saída nova não traz a vistoria marcada nem o termo das chaves da saída anterior.
- [ ] **Um contrato com boleto no banco ou ligado ao extrato não pode ser excluído** (PR #330, 20/11/2026, mutirão)
  - O que fazer: tente excluir um contrato de teste com um boleto ligado ao extrato.
  - O que deve aparecer: "Este contrato tem boletos ligados ao extrato: desfaça o destino das movimentações na tela Banco antes." Com um boleto emitido no C6 e em aberto, aparece "Cancele no banco antes de excluir". Se o contrato passou para um novo titular, aparece "exclua antes o contrato do novo titular".

### Troca de titular (como chegar: página do inquilino → termo aditivo de troca de inquilino)
- [ ] **A troca no meio do mês fecha sempre 30/30** (PR #337, 21/11/2026)
  - O que fazer: num contrato de teste com aluguel de R$ 1.800,00, faça a troca em 28/02/2027.
  - O que deve aparecer: o titular anterior paga 27/30 (R$ 1.620,00) e o novo paga 3/30 (R$ 180,00). Antes, o novo pagava 1/30. Com a troca em 31/03, o novo não tem boleto de março e o Fechamento não reclama da falta.
- [ ] **Na declaração do IR, cada titular declara só o que pagou** (PR #336, 21/11/2026)
  - O que fazer: abra a declaração anual de aluguéis do novo titular de uma troca de teste (o anterior pagou de janeiro a junho e o novo, de julho a dezembro).
  - O que deve aparecer: a declaração do novo titular tem só de julho a dezembro. Na renovação da mesma pessoa (mesmo CPF), continua somando o contrato anterior.

### Boletos (como chegar: Menu → Boletos)
- [ ] **Não existe mais pagamento em parte: valor menor é recusado** (PR #330, 20/11/2026, mutirão)
  - Onde clicar: abra um boleto de teste de R$ 2.700,00 → registrar o pagamento.
  - O que fazer: digite R$ 2.000,00. Depois digite R$ 2.700,00.
  - O que deve aparecer: com R$ 2.000,00, aparece "O valor recebido (R$ 2.000,00) é menor que o devido (R$ 2.700,00). Não existe pagamento em parte: o boleto continua em aberto…" e nada é salvo. Com R$ 2.700,00, o pagamento é aceito. Valor zero ou negativo também é recusado.
- [ ] **O complemento da caução só aceita o valor exato** (PR #330, 20/11/2026, mutirão)
  - O que fazer: num complemento de caução de teste de R$ 81,00, registre R$ 10,00.
  - O que deve aparecer: "O complemento da caução só é pago pelo valor exato do boleto (R$ 81,00); entrou R$ 10,00. Nada foi salvo."
- [ ] **A busca não dá mais o aviso falso de "contratos sem boleto"** (PR #330, 20/11/2026, mutirão)
  - O que fazer: num mês com todos os boletos gerados, digite o nome de um inquilino na busca.
  - O que deve aparecer: só o boleto dele, sem o aviso amarelo "7 contratos ainda sem boleto neste mês".
- [ ] **A troca de titular que espera o termo tem um aviso próprio** (PR #330, 20/11/2026, mutirão)
  - O que deve aparecer: "Pedro Teste: falta anexar o termo da troca de titular assinado…", com o link para o contrato. O botão "Gerar boletos", que gerava 0 boletos, não aparece para esse caso.
- [ ] **O boleto pago com NF de R$ 0,00 aparece como "sem NF"** (PR #330, 20/11/2026, mutirão)
  - O que fazer: veja um boleto de mês de carência que só cobrou IPTU e seguro e já foi pago.
  - O que deve aparecer: "sem NF", e não "aguardando nº". Ele também não entra mais na conta do botão "Pagos ainda sem NF".
- [ ] **"Excluir boletos selecionados" diz os meses certos** (PR #330, 20/11/2026, mutirão)
  - O que fazer: em "Em aberto", marque boletos de meses diferentes e clique no botão.
  - O que deve aparecer: a pergunta cita os meses dos boletos marcados, e não só "de 10/2026".
- [ ] **"Alterar valores" pergunta antes de salvar um valor estranho** (PR #329, 20/11/2026, mutirão)
  - O que fazer: num boleto de teste de R$ 1.800,00, ponha um desconto de R$ 2.000,00. Depois tente uma multa de 50%.
  - O que deve aparecer: o desconto maior que o aluguel é recusado. A multa alta abre a janela "Confira antes de salvar", com os botões "Salvar assim mesmo" e "Voltar e corrigir".

### Imóvel → IPTU (como chegar: Menu → Imóveis → clicar no imóvel → parte do IPTU)
- [ ] **O IPTU com parcela arredondada mostra a guia real e a sobra** (PR #331, 20/11/2026)
  - O que fazer: num imóvel de teste, lance um IPTU de R$ 2.125,37 em 10 parcelas, com "Valor fixo cobrado por parcela" de R$ 213,00.
  - O que deve aparecer: a guia com o valor real (R$ 2.125,37, e não R$ 2.130,00). Na sua parte aparece "sobra … (arredondamento da parcela)". Em Financeiro → Resultados, a sobra de R$ 4,63 diminui o seu custo de IPTU.

### Contas pagas por nós (como chegar: Menu → Financeiro → Contas do imóvel → escolher o imóvel)
- [ ] **O administrador corrige uma conta paga pelo banco que foi lançada errada** (PR #331, 20/11/2026)
  - Onde clicar: numa conta com a marca "pelo banco", botão "Corrigir".
  - O que fazer: troque o valor, o mês ou o imóvel e clique em "Salvar a correção".
  - O que deve aparecer: muda só o lançamento, que é o que entra nos Resultados. A janela avisa que o pagamento feito no banco continua como foi.

### Sistema (como chegar: Menu → Sistema)
- [ ] **O Histórico mostra os valores em reais e os nomes dos campos** (PR #329, 20/11/2026, mutirão)
  - Onde clicar: Histórico.
  - O que fazer: mude o aluguel de um contrato de teste de R$ 1.800,00 para R$ 1.900,00 e abra o Histórico.
  - O que deve aparecer: o aluguel passando de R$ 1.800,00 para R$ 1.900,00, com o nome do campo como no formulário e as datas em dia/mês/ano. Antes aparecia "aluguel_inicial: 180000 → 190000". Os Conflitos da nuvem também aparecem assim.
- [ ] **A planilha de todos os dados mostra os valores em reais** (PR #329, 20/11/2026, mutirão)
  - Onde clicar: caixa "Exportar tudo em ZIP" → "Baixar todos os dados em planilha e PDF".
  - O que deve aparecer: a dívida do acordo e os valores do FCI em reais (ex.: R$ 12.567,36). Antes saía 1256736.
- [ ] **Página pública de privacidade** (PR #318, 18/11/2026)
  - O que fazer: abra no navegador o endereço ficha.ankjck.com.br/privacidade.
  - O que deve aparecer: a política de privacidade. Ela diz que o sistema só envia e-mails, não lê a caixa de entrada e não repassa dados.

### No celular (como chegar: abra o aplicativo no celular)
- [ ] **O PDF baixado pelo celular sai igual ao do computador** (PR #330, 20/11/2026, mutirão)
  - O que fazer: no celular, baixe em PDF a carta de reajuste e o contrato de um inquilino de teste.
  - O que deve aparecer: a carta com letra normal e com o valor novo do aluguel. O contrato com cerca de 7 folhas, e não 24 a 36.
- [ ] **O aviso "Salvo." aparece onde você está olhando** (PR #329, 20/11/2026, mutirão)
  - O que fazer: role até o fim de um formulário comprido e salve.
  - O que deve aparecer: o aviso verde preso no alto da tela, visível sem precisar subir a página.

### Vistoria de entrada (como chegar: página do inquilino → Vistoria de entrada → imprimir)
- [ ] **O prazo para reclamar da vistoria é de 5 dias úteis** (PR #329, 20/11/2026, mutirão)
  - O que deve aparecer: no texto da vistoria, "5 (cinco) dias úteis", o mesmo prazo do contrato e do e-mail. Antes dizia "3 (três) dias".

---

## Parte 2: mudanças de 20/11 a 24/11/2026 (PRs #334 e #341 a #364)

Datas no horário de Brasília (algumas PRs entraram à noite e aparecem no GitHub com o dia seguinte).
Ficaram de fora as PRs só de documentação (#348, #350, #356, #362, #363) e a conferência no validar.iti.gov.br, que você já fez (anotado em 24/11: "Funcionou").

⚠ Fontes discordam: o "COMECE POR AQUI" de `PENDENCIAS_DO_DONO.md` (22/11) ainda manda "Ligar a assinatura" e "conferir em validar.iti.gov.br" (item 2), mas os pedidos de 24/11 (item C1) dizem que isso já funcionou e foi conferido. Aqui só ficam os outros pontos da assinatura.

### Sistema, página principal (como chegar: Menu → Sistema)
- [ ] **"Dados e backup" passou a se chamar "Sistema", com botões das páginas no alto** (PR #358, 22/11/2026)
  - Onde clicar: Menu → Sistema.
  - O que fazer: olhe a fileira de botões no alto. Abra um favorito antigo (se tiver) da antiga "Dados e backup".
  - O que deve aparecer: título "Sistema" e os botões Empresas, Banco, Comunicação E-mail, Modelos de documentos, LGPD (estes cinco só para o administrador; Banco e LGPD somem para os outros), Regras do sistema, Histórico de alterações e "Teste dos PDFs (temporário)". O backup seguro, os dados e o arquivo impresso continuam nesta página. O menu "Banco" (extrato) continua igual.
- [ ] **Página temporária "Teste dos PDFs"** (PR #334, 20/11/2026; recibo da devolução da garantia entrou nela pela PR #351)
  - Onde clicar: Menu → Sistema → **Teste dos PDFs (temporário)**.
  - O que fazer: no computador e no celular Android, use "Abrir" em cada linha (abre a página do documento, com Imprimir e Baixar PDF) e o botão ao lado (baixa o PDF igual ao que vai no e-mail). Anote os textos que quer mudar.
  - O que deve aparecer: título "Teste dos PDFs (página temporária)", os PDFs separados por assunto, cada um com o registro usado (ex.: o inquilino de teste). Todos devem baixar sem erro e com o texto inteiro. Depois que você conferir, o Claude apaga essa página.

### Sistema → Empresas: certificado digital (como chegar: Menu → Sistema → Empresas → caixa "Certificado digital da empresa")
- [ ] **A caixa mostra o certificado anexado e quantos dias faltam para vencer** (PR #360, 22/11/2026)
  - Onde clicar: Sistema → Empresas, role até "Certificado digital da empresa". Confira no computador e no celular.
  - O que fazer: só ler a faixa colorida da caixa.
  - O que deve aparecer: algo como "Anexado: ANK …, válido até 02/01/2027 (faltam N dias), no computador …, desde 22/11/2026". Se ainda disser que o programa do PC está desatualizado, veja o item seguinte.
- [ ] **Aviso de programa do PC desatualizado** (PR #361, 22/11/2026)
  - Onde clicar: a mesma caixa.
  - O que fazer: se o programa do PC ainda for o antigo, deixe o computador ligado por 1 hora (ou reinicie).
  - O que deve aparecer: antes de trocar, "O programa do PC … está desatualizado e ainda não sabe mostrar o certificado aqui. Ele se atualiza sozinho em até 1 hora (ou ao reiniciar o computador)". Depois de trocar, o texto do item anterior.
- [ ] **Ligar e desligar a assinatura ficam aqui, não mais em Regras do sistema** (PR #359, 22/11/2026)
  - Onde clicar: na mesma caixa, parte "Assinatura digital dos recibos e termos".
  - O que fazer: veja a etiqueta "ligada". Depois abra Sistema → Regras do sistema, clique em salvar sem mudar nada e volte a Empresas.
  - O que deve aparecer: o botão "Desligar a assinatura digital" (porque está ligada), com a explicação, a consequência e a lei. Em Regras do sistema a assinatura não aparece mais, e salvar as regras **não** desliga a assinatura (continua "ligada").
- [ ] **Botões "Anexar ou trocar o certificado" e "Remover o certificado"** (PRs #357 e #360, 22/11/2026)
  - Onde clicar: na caixa, só no computador com Windows que assina (no celular aparece só o aviso para abrir no computador).
  - O que fazer: só confira que os dois botões aparecem. **Não remova o certificado de verdade**: remover apaga o certificado do computador e desliga a assinatura junto. Se quiser testar, faça só quando for trocar o certificado (ex.: na renovação).
  - O que deve aparecer: no celular, "Para anexar, trocar ou remover, abra esta tela no computador com Windows que assina".
- [ ] **Aviso de renovação do certificado** (PR #360, 22/11/2026)
  - Onde clicar: a caixa do certificado e o Painel (como administrador).
  - O que fazer: a partir de 03/12/2026 (30 dias antes de 02/01/2027), abrir as duas telas.
  - O que deve aparecer: "vence em 02/01/2027 (faltam 30 dias): renove…", na caixa e no Painel; depois de vencido, em vermelho.

### Sistema → Banco (como chegar: Menu → Sistema → Banco) — só administrador
- [ ] **Página nova com a configuração do banco** (PR #358, 22/11/2026)
  - Onde clicar: Sistema → Banco.
  - O que fazer: role a página inteira. Depois entre com um usuário operador de teste e tente abrir a mesma página.
  - O que deve aparecer: título "Banco (configuração)", botão "Ver extrato e movimentações", e as caixas "Banco (C6) — boleto com Pix", "Emissão de boletos no banco (C6)" (saiu de Empresas) e "Banco: conciliação e pagamentos". Para o operador: "Só o administrador vê esta página."

### Sistema → Comunicação E-mail (como chegar: Menu → Sistema → Comunicação E-mail)
- [ ] **Gmail e modelos de e-mail numa página só** (PR #358, 22/11/2026)
  - Onde clicar: Sistema → Comunicação E-mail.
  - O que fazer: confira que o Gmail continua ligado (a conta da empresa) e abra um modelo de e-mail.
  - O que deve aparecer: caixa "E-mail pelo Gmail" com a conta ligada e o botão Desconectar; caixa "Modelos de e-mail". Não clique em Desconectar.

### Sistema → Modelos de documentos (como chegar: Menu → Sistema → Modelos de documentos)
- [ ] **Modelos de contrato, termos aditivos e Excel da NF juntos** (PR #358, 22/11/2026)
  - Onde clicar: Sistema → Modelos de documentos.
  - O que fazer: clique em "Ver e editar os modelos de contrato" e volte; depois "Ver e editar os termos aditivos".
  - O que deve aparecer: as três caixas "Modelos de contrato", "Termos aditivos" e "Modelo Excel da NF" (com "Usando o modelo padrão do sistema" ou "Modelo próprio").

### Sistema → LGPD (como chegar: Menu → Sistema → LGPD) — só administrador
- [ ] **Dados de uma pessoa e pessoas com mais de 10 anos** (PR #358, 22/11/2026)
  - Onde clicar: Sistema → LGPD → "Dados de uma pessoa".
  - O que fazer: busque pelo CPF de teste 529.982.247-25 (ou de um inquilino de teste). Não use "apagar tudo".
  - O que deve aparecer: onde a pessoa aparece no sistema e o arquivo com os dados dela. O outro botão é "Pessoas com mais de 10 anos do fim do contrato".

### Página de um recibo ou termo: assinatura digital (como chegar: Menu → Inquilinos → inquilino de teste → link "🧾 Recibo …", ex. "Recibo da caução")
- [ ] **Caixa "Assinatura digital da empresa" em cada recibo, termo e notificação** (PRs #354 e #355, 21/11/2026)
  - Onde clicar: na página do recibo, caixa "Assinatura digital da empresa" → **Enviar para assinar**; depois de 1 a 2 minutos, **Atualizar**.
  - O que fazer: use um inquilino de teste. Confira também o botão **Tirar da fila** enquanto espera (e mande de novo).
  - O que deve aparecer: primeiro "Aguardando a assinatura do PC (enviado em …)"; com o PC desligado há mais de 10 minutos, o aviso para ligar o computador; depois "Assinado digitalmente em …", com **Baixar PDF assinado** e **✉ Enviar ao inquilino**. O "Baixar PDF" de cima continua saindo sem assinatura (é só para conferir). A ficha cadastral não tem essa caixa (quem assina é a pessoa).
- [ ] **PDF assinado guardado na pasta do inquilino** (PR #354, 21/11/2026)
  - Onde clicar: **Baixar PDF assinado**.
  - O que fazer: depois de baixar, abra os arquivos do inquilino de teste.
  - O que deve aparecer: o PDF baixado tem a página final "Assinatura digital", e uma cópia aparece na pasta do inquilino.
- [ ] **O e-mail da etapa só leva o recibo assinado** (PR #354, 21/11/2026)
  - Onde clicar: **✉ Enviar ao inquilino** (ou o botão de e-mail da etapa na página do inquilino).
  - O que fazer: mande para o seu próprio e-mail, num inquilino de teste. Teste também um recibo que ainda não foi enviado para assinar.
  - O que deve aparecer: no assinado, o anexo é o PDF com a página "Assinatura digital". No não assinado, o envio para e diz: abra o recibo e use "Enviar para assinar", ou desmarque esse anexo. Nada foi enviado.

### Painel (como chegar: Menu → Painel)
- [ ] **Aviso de documentos parados na fila da assinatura** (PR #354, 21/11/2026)
  - Onde clicar: Painel.
  - O que fazer: mande um recibo de teste para assinar com o PC desligado e abra o Painel depois de uns 10 minutos. Depois tire o recibo da fila.
  - O que deve aparecer: "1 documento está na fila para assinatura digital: ligue o PC com o certificado" (ou "X documentos estão…"). Se o PC der erro, o erro aparece também.

### Programa do PC (como chegar: Menu → Usuários → Aparelhos ligados)
- [ ] **O programa do PC se atualiza de hora em hora** (PR #361, 22/11/2026)
  - Onde clicar: Menu → Usuários → Aparelhos ligados, coluna "Programa".
  - O que fazer: compare a versão do computador com a data da última mudança (ex.: 24/11/2026). Se for antiga, espere 1 hora com o computador ligado.
  - O que deve aparecer: a versão mais nova em até 1 hora depois de cada mudança no sistema (antes só às 20h ou ao entrar no Windows).
  - (Não vale mais em 25/11: o texto já foi acertado.) ~~⚠ Fontes discordam: em Sistema → "Programa deste computador" o texto ainda diz que ele se atualiza "todo dia às 20h e ao entrar no Windows", mas desde a PR #361 é também de hora em hora. Só o texto está velho.~~

### Boletos: página de um boleto (como chegar: Menu → Boletos → clicar no boleto)
- [ ] **Vários ajustes no mesmo boleto** (PR #364, 24/11/2026)
  - Onde clicar: caixa "Ajuste deste mês" → escolha "Cobrança adicional (+)" ou "Ressarcimento (−)", valor e motivo → **Salvar ajuste**; os seguintes por **Acrescentar outro ajuste**; para tirar, **Tirar**.
  - O que fazer: num boleto de teste de R$ 1.800,00, lance + R$ 80,00 (chave extra), − R$ 150,00 (reforma) e − R$ 30,00 (acerto). Depois tire o de − R$ 150,00.
  - O que deve aparecer: uma linha para cada ajuste na caixa, no demonstrativo e na descrição do boleto. Com os três: R$ 1.700,00; depois de tirar o do meio: R$ 1.850,00.
- [ ] **Seguro entra no boleto mesmo depois de "Alterar valores"** (PR #364, 24/11/2026)
  - Onde clicar: no boleto, **Alterar valores**, mude só o IPTU e salve. Depois, na página do inquilino, caixa "Seguro obrigatório", lance a apólice com parcela neste mês (ex.: R$ 30,00).
  - O que fazer: volte ao boleto.
  - O que deve aparecer: "Valores digitados à mão (IPTU): ficam como estão; o resto continua sendo calculado pelo cadastro", e o seguro de R$ 30,00 já dentro do boleto. Nos boletos alterados à mão **antes** de 24/11, aparece "Não bate com o cadastro: seguro R$ … no cadastro e R$ … no boleto" quando não batem.
  - ⚠ Fontes discordam: `PENDENCIAS_DO_DONO.md` (24/11) ainda tem abertos os itens A1 (condomínio/ressarcimento que não entrava), A2 e A3; a PR #364 diz que corrigiu A2 e A3 e que, no teste, o ressarcimento do condomínio de R$ 45,00 entrou. Confira também um boleto com a caixa "Condomínio: taxas do proprietário (ressarcimento)" do inquilino.
- [ ] **Escolher se o ajuste do mês entra na NF** (PR #345, 21/11/2026)
  - Onde clicar: no boleto, **Alterar valores** → campo "O ajuste entra na NF".
  - O que fazer: boleto de teste de R$ 2.000,00 com ajuste de + R$ 300,00 e motivo "TV vendida junto"; marque o campo e registre o pagamento em dia. Repita outro boleto sem marcar (ex.: vidro quebrado).
  - O que deve aparecer: marcado, NF de R$ 2.300,00 com a observação "Inclui TV vendida junto: R$ 300,00". Desmarcado (padrão), NF de R$ 2.000,00 e "nem o ajuste do mês" no cálculo da NF. A marcação vale para o total dos ajustes do mês.
- [ ] **Pago a mais fica "a devolver" e botão "Devolvi"** (PR #346, 21/11/2026)
  - Onde clicar: no boleto, **Confirmar pagamento**, com valor maior; depois o botão **Devolvi R$ …** com a data.
  - O que fazer: boleto de teste de R$ 2.000,00, recebido R$ 2.100,00, deixando a NF no valor calculado.
  - O que deve aparecer: a janela "Valor diferente do previsto" com justificativa opcional; NF de R$ 2.000,00 e a faixa "Pago a mais: falta devolver R$ 100,00 ao inquilino". Depois de "Devolvi R$ 100,00": "Pago a mais e devolvido".

### Inquilinos: página do inquilino (como chegar: Menu → Inquilinos → clicar no inquilino)
- [ ] **Ao apagar um termo aditivo anexado, o sistema pergunta se ele valeu** (PR #347, 21/11/2026)
  - Onde clicar: caixa "Contrato, Vistoria, Termos e Aditivos" → "Termos aditivos" → o **×** do termo (ou o × só do arquivo).
  - O que fazer: **só num inquilino de teste.** Ex.: termo de troca do vencimento do dia 10 para o dia 15, anexado. Apague escolhendo "Não".
  - O que deve aparecer: a pergunta "Este termo valeu?" com "Não: é o arquivo errado ou falta a assinatura de alguém. A mudança é desfeita." e "Sim: foi assinado por todos. A mudança continua valendo". Com "Não", o vencimento e os boletos em aberto voltam ao dia 10 (os emitidos no banco e os alterados à mão ficam, com nota no Histórico). Com "Sim", pede mais uma confirmação e o vencimento fica no dia 15.
- [ ] **"Adiar ou mudar a data" da saída** (PR #349, 21/11/2026)
  - Onde clicar: caixa "Saída em …" → **Adiar ou mudar a data**.
  - O que fazer: **só num inquilino de teste**, aluguel de R$ 3.000,00, saída em 10/12/2026 e vistoria em 11/12/2026 às 10:00; mude a saída para 15/12/2026.
  - O que deve aparecer: janela "Adiar ou mudar a saída", e o aviso: boleto de 12/2026 recalculado R$ 1.000,00 → R$ 1.500,00 (15/30 dias); vistoria de saída em 16/12/2026, com o pedido de mandar o convite de novo. Se o cálculo final já estiver feito, pede para desfazê-lo antes.
- [ ] **Recibo da devolução da garantia para a pessoa assinar** (PR #351, 21/11/2026)
  - Onde clicar: caixa da garantia, depois de registrar a devolução (na troca de garantia: **Trocar garantia ou fiador**) → **🧾 Recibo da devolução para assinar (a pessoa assina que recebeu)**; ao lado, "Recibo assinado: anexar".
  - O que fazer: inquilino de teste com caução de R$ 3.150,00 trocada por fiador em 01/12/2026, devolvida em 05/12/2026 com a correção da poupança.
  - O que deve aparecer: "Recibo de devolução da caução", "Recebi de … em 05/12/2026 a importância de R$ 3.354,75 … em razão da troca da garantia (Caução por fiador)", tabela (depositado, correção, débitos, devolvido) e as duas assinaturas. Sem saldo para devolver, não há recibo. O assinado anexado aparece nos arquivos do contrato.

### Fichas em análise (como chegar: Menu → Inquilinos → Fichas em análise → abrir a ficha)
- [ ] **"Lembrar" mantém o link antigo e a mesma validade** (PR #343, 21/11/2026)
  - Onde clicar: na parte do link da pessoa, **Lembrar**.
  - O que fazer: numa ficha de teste com link gerado em 10/12/2026 (vale até 17/12/2026), use "Lembrar" em 12/12/2026. Abra o link antigo e o novo.
  - O que deve aparecer: os dois abrem e os dois vencem em 17/12/2026. Já **Gerar novo link** corta o antigo e começa outros 7 dias. Encerrar a ficha para todos os links.

### Contas pagas por nós (como chegar: Painel → Fechamento do mês → "Lançar: <imóvel>", ou Banco → link "contas pagas por nós" → escolher o imóvel)
- [ ] **O mês só troca no botão "Ir"** (PR #341, 21/11/2026)
  - Onde clicar: campo "Mês de referência" → **Ir**.
  - O que fazer: no iPhone, com 10/2026 aberto, gire o mês para 08/2026 sem tocar em "Ir"; depois toque em "Ir" e lance uma conta de teste.
  - O que deve aparecer: girar não troca a tela nem pergunta "Sair sem salvar?"; "Ir" abre 08/2026; o lançamento fica em 08/2026. Sem tocar em "Ir", "Lançar" grava no mês que está na tela.

### Anexos em PDF no celular (como chegar: qualquer tela com um PDF anexado, ex. o contrato assinado do inquilino)
- [ ] **PDF comprido abre sem travar no iPhone** (PR #342, 21/11/2026)
  - Onde clicar: tocar no anexo (ex.: contrato de 30 páginas).
  - O que fazer: role até o fim e volte; feche e abra de novo umas 3 vezes.
  - O que deve aparecer: a página não "pula" ao rolar, as páginas aparecem conforme chegam na tela e o celular não fica lento nem fecha o navegador.

### Qualquer tela: endereço digitado errado (como chegar: barra de endereço do navegador)
- [ ] **Aviso no alto quando o endereço tem um dado errado** (PR #344, 21/11/2026)
  - Onde clicar: digite no fim do endereço do site `#/cobrancas?comp=2026-13` (mês 13 não existe) e depois `#/novo/solicitacoes?contrato=999`.
  - O que fazer: pressione Enter em cada um.
  - O que deve aparecer: a tela abre normal, com a faixa "Endereço com dado errado: mês em formato errado. A tela abriu sem ele." e, no segundo, "inquilino nº 999 não existe". Os botões do próprio sistema nunca mostram esse aviso.
