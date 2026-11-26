# O que ainda falta no sistema (e como fazer)

## ONDE PARAMOS (25/11/2026, noite: para o Claude retomar depois do /clear)

**Para o Claude:** retome esta lista com o dono na primeira mensagem, em português simples. O dono só responde à **conversa principal**. Regras de 24–25/11 continuam: nenhuma PR com conflito (`git merge-tree` com a `main` e as abertas); **toda PR roda o kit de teste** (`node tools/kit-teste.mjs`, ~4 min: computador, celular, nuvem com 2 abas, versão PC e links), acrescenta o roteiro da tela dela e traz a seção "Kit de teste"; a conversa principal roda o kit de novo na branch antes do "pode aceitar" e **sempre diz ao dono o resultado do kit** (regra de 25/11, `CLAUDE.md`); sessão ou subagente pronto é encerrado.

**Situação:** tudo na `main` até a **#433** (multa do aviso mudada à mão e 7 exportações sem uso tiradas). Em 25/11 à noite: revisão do que está sem uso (5 instâncias), PR de documentação (decisão da pintura, que tinha ficado fora da `main`, e citações erradas) e PR de limpeza do código. Em 25/11 à tarde entraram: #427 (kit obrigatório em toda PR e modelo de PR), #428 (acertos: boleto quitado pela reserva, 2ª via, acordo refeito, Sair, conciliação e C6 pela data de Brasília), #429 (ficha pela internet com o que o sistema já tem), #430 (agendador de envios em horário comercial, pela nuvem) e #431 (kit espera a tela nova). As decisões de 24–25/11 estão em `DECISOES.md`.

**O que espera o dono:**
- [ ] **Agendador (#430):** numa noite, agendar um e-mail para si mesmo e conferir que chega às 8h (o Claude lembra). [x] Cron no Cloudflare conferido pelo dono em 25/11 (`*/5 * * * *`). Recomendado: pôr `tests/agendados-nuvem.test.mjs` no Build command do Worker (o Claude orienta).
- [ ] **Ficha pela internet (#429):** com um conhecido que já tem cadastro, gerar o link, abrir no celular, mandar, ver "Em análise", "Deixar a pessoa corrigir" e reabrir com tudo preenchido.
- [ ] **Boleto quitado pela reserva (#428):** conferir no próximo caso real que ele aparece "Quitado pela reserva" no vencimento e a NF vai para a fila (o número da NF só entra quando o dono manda emitir; decisão de 25/11, muda em 2027 com a NF do governo).
- [ ] As conferências da lista atual: `CONFERIR_O_QUE_MUDOU.md` e as "Conferências do dono" logo abaixo (bloco de 24/11).
- [ ] Levar ao advogado o **texto da confissão de dívida com os honorários** (termo do acordo, `#/imprimir/recibo?tipo=acordo&…`; PR #415).
- [ ] Se você já tinha editado o e-mail de encerramento: conferir em **Sistema → Modelos de e-mail** o e-mail do cálculo final (o texto novo do saldo, PR #419, só entra nos modelos não editados; "Voltar ao padrão" traz o novo). O mesmo vale para os e-mails de notificação de atraso (PR #420).
- [ ] Decidir a lista **`Limpeza - para o dono decidir.md`** (raiz do projeto, fora do Git; refeita em 25/11 à noite): nada foi apagado.
- [ ] Decidir o que fazer com o que a revisão de 25/11 (noite) achou sem uso e depende do dono: 10 funções que só os testes usam (ex.: listar todos os boletos do banco, DDA, `quitadoPelaReserva`), o jeito antigo do programa do PC (`.cmd`, `.vbs`, `.env`, chave de serviço), as rotas `contador` e `conflitos` da nuvem, o formulário "correção da caução" sem link, o botão para desligar o link do termo da reserva (função e rota prontas, falta o botão) e os documentos só de histórico que podem ir para `documentacao/arquivo/`.
- [ ] **Assinatura digital com o certificado real:** programa novo no PC, ligar em Sistema → Empresas, assinar um recibo, um contrato e um termo aditivo de teste e conferir no <https://validar.iti.gov.br> (um contrato assinado pela empresa e depois pelo inquilino no gov.br: as duas assinaturas devem aparecer válidas). Certificado vence em 02/01/2027 (aviso a partir de 03/12).
- [ ] Também das PRs: ler o termo da reserva com os ajustes do advogado (7 dias corridos, reserva de 7 dias, empresa pode desistir); ler o PDF do contrato com as cláusulas novas (#406) e os documentos da locação (#407: aviso de desocupação com a caixa, notificação com AR e art. 47); perguntar ao advogado sobre a liminar do art. 59, § 1º, VIII no residencial.

**Pequenas observações para depois (não impedem nada):**
- A pergunta 2 do resumo do contrato fala em honorários sem as condições (vale a cláusula).
- No cálculo final, mudar à mão o valor da multa do aviso não muda o texto da descrição.
- A 2ª notificação de atraso não pega o boleto que venceu depois da 1ª (só avisa).

**Resolvido na PR dos acertos de 25/11 (`claude/acertos-25-11`, #428):** [x] boleto quitado inteiro pela reserva ("Quitado pela reserva", quitação e NF sozinhas no vencimento); [x] o termo do acordo refeito cita os honorários e despesas do 1º; [x] a 2ª via sem o erro "setting 'hidden'" (e com os botões de e-mail, WhatsApp e copiar funcionando); [x] "Sair" apaga do navegador o que ficou da assinatura do contrato (`assinatura-contrato-<id>`, com o CPF da testemunha) e pergunta antes de apagar uma vistoria pela metade; [x] conciliação do banco e ponte do C6 (`emission_date`) pela data de Brasília. A frase da caixa do fiador na troca de titular fica como está (modelo geral, decisão de 25/11).

**Feito na PR #424 (25/11):** [x] boleto descontado da garantia no cálculo final (ou na devolução da troca de titular): antes de gravar, a janela "Confira o que vai acontecer" mostra o boleto, a notificação de atraso que fecha e o que acontece com a caução, e pede "Já cancelei no banco" quando o boleto foi emitido no banco (PDF ou C6). Desfeito o cálculo final, o boleto volta a "Em aberto" e a notificação reabre. Ex.: caução de R$ 5.400,00 − boleto de 10/2026 de R$ 1.800,00 = R$ 3.600,00 a devolver. Falta conferir (testador): celular de verdade, nuvem com 2 abas, versão PC e a troca de titular com garantia nova.

**Para quando o C6 for ligado:** boleto do C6 com emissão "sem resposta" (situação "erro" e incerto) não pede o cancelamento no banco na janela da #424; acertar junto com a ligação do C6.

**Decidido em 25/11:** [x] o botão "Corrigir caução" fica com esse nome (confirma 14/11; não há mais pendência).

**Trabalho do Claude que pode ser feito sem o dono:** [x] texto da descrição da multa do aviso e 7 exportações sem uso (PR #433); apagar a página "Teste dos PDFs" depois que o dono testar; acertar a pergunta 2 do resumo do contrato (honorários com as condições) junto com a próxima revisão do advogado.

**Kit de teste automático:** [x] feito (PRs #425, #426 e #431; obrigatório em toda PR pela #427): `node tools/kit-teste.mjs` monta o banco com os casos, sobe o site, a nuvem local e a versão PC e roda os 4 lugares e os links (`tools/kit-teste/README.md`).

## ONDE PARAMOS em 24/11/2026, noite (histórico; atualizado em 25/11)

**Para o Claude:** o dono só responde à **conversa principal**; as perguntas das outras sessões passam por ela. Confira o estado com `mcp__ccd_session_mgmt__list_sessions {"linked": true}` e `gh pr list`. **Regras do dono (24/11):** (1) nenhuma PR é apresentada com conflito, nem com a `main` nem com as outras abertas (simular com `git merge-tree` na ordem de aceite e, depois de cada aceite, resolver as seguintes); (2) teste de tela em **todos os lugares** (computador `?teste`, celular 375 px, nuvem local `node nuvem/local.mjs` com duas abas, versão PC quando couber) + links quebrados, feito por um **testador independente** antes de dizer "pode aceitar"; (3) sessão que terminou é arquivada. Receita dos testes na memória (`receita-teste-de-tela`). As sessões novas **não editam** `DECISOES.md`, `CLAUDE.md` nem este arquivo: põem "Para a documentação" na PR, e a conversa principal junta tudo numa PR de documentação no fim.

**Já na `main` (24/11):** #363 a #377 e #379 a #403 (a #378 foi fechada). Nenhuma PR aberta às 21h. **Depois da #393:** fechar e abrir o sistema em todos os aparelhos (aba antiga pode gravar boleto errado).

**Feito pelo dono em 24/11:** tarifa conferida em R$ 8,50; Sobrado Almir e Posto com "Não cobrar tarifa"; resposta do advogado colada (cópia em `Resposta do advogado - 24-11.md`, raiz, fora do Git).

**Decisões do dono de 24/11 (noite):** [x] registradas em `DECISOES.md` em 25/11 (PR de documentação final).
- Acordo na troca que não valeu: opção **(b)**, cancela o acordo do novo, o pago fica "a devolver" e o anterior paga o mês cheio (já programado na #393).
- NF do proporcional pago com atraso: linha única com o total e a conta nas observações (#403); pago em dia continua "16/30 × aluguel bonificado".
- Pintura: vida útil de **48 meses** (R$ 2.400,00 com 24 meses → R$ 1.200,00); outro orçamento só antes da devolução das chaves.
- Termo da reserva **não** fala em devolução em dobro; no sistema, "A empresa desiste desta reserva" com justificativa (devolução simples) ou sem (aviso: em dobro, CC art. 418).
- Honorários (10% depois de 30 dias, com advogado de fato; sócios da ANK/JCK com OAB) e despesas com comprovante: **só no acordo e no cálculo final, nunca no boleto nem na NF**.
- Tarifa: sem termo aditivo; multa e juros não incidem sobre a tarifa.
- Números de processo da pesquisa de honorários: **não é preciso conferir** (as cláusulas foram aprovadas pelo advogado); tirar a pendência.

**Sessões trabalhando (24/11, noite), cada uma abre a sua PR e avisa:** [x] todas terminadas; PRs #404 a #422 na `main` em 25/11.
- Respostas do advogado: "Advogado: termo de aceite da reserva" (documentos, 2 dias úteis, reprovação justificada, prazo de 7 dias com aviso no 4º e no 7º dia, pequenas divergências, empresa desiste); "Advogado: tarifa sem multa e juros"; "Advogado: pintura em 48 meses"; "Advogado: cláusulas novas e resumo do contrato" (gera `Contrato com clausulas novas - para revisar.pdf`); "Advogado: os 8 documentos da locação" (tira a prorrogação, troca de garantia, aviso de desocupação com dispensa, notificação com justificativa e AR).
- Trabalho do Claude: "Enviar para assinar" (carta, aditivos, contrato); "Cálculo final: sugerir a multa do aviso de 30 dias" (vai trazer exemplo para o dono confirmar); "Campos de mês: reserva, carência e vale desde"; "Pequenos acertos pendentes"; "Simular todas as etapas com pessoas de teste" (só relatório, `SIMULACAO_ETAPAS_24_11.md`); "Compactação geral" (memória, `documentacao/INDICE.md`, lista `Limpeza - para o dono decidir.md` sem apagar nada); "Honorários e despesas no acordo e no cálculo final".
- A sessão "Testar cada PR na tela antes do aceite" continua disponível para os testes independentes; abrir outras de teste só com o pedido do dono na conversa principal.

**Esperando o dono (fora as conferências abaixo):** [x] confirmar o exemplo da multa do aviso de 30 dias (confirmado em 24/11: proporcional, só a maior; PR #408); [ ] decidir a lista de limpeza (saiu: `Limpeza - para o dono decidir.md`).

**Conferências do dono:** `CONFERIR_O_QUE_MUDOU.md`; ler o termo da reserva e testar o link com um conhecido (antes, Sistema → Empresas → conta para depósito); boleto feito à mão mandado a si mesmo e um lembrete da régua com o PDF; assinatura digital (ligar e assinar um recibo de teste); PDFs para revisar (resumo do contrato, modelos de documentos, contrato com cláusulas novas); Teste dos PDFs em Sistema (depois o Claude apaga a página); comunicado de contatos com inquilino de teste; ficha pela internet com um conhecido; ícone, "Enviar agora" e páginas de Sistema no celular.

**Fora do sistema:** rever boletos em aberto alterados à mão antes de 24/11; alertas "A verificar" da importação de 2026 (5 contratos); chaves do C6; verificação em duas etapas no GitHub; cópia do OneDrive no HD externo; certificado da ANK vence 02/01/2027 (aviso a partir de 03/12); 16/12/2026: CBS 2027 com o contador.

**Ideia para testes mais rápidos (pergunta do dono, 24/11):** kit de teste pronto (banco com os casos montados e um roteiro que sobe servidor + nuvem local e roda os 4 lugares); fazer quando o dono pedir. **25/11: [x] feito (PRs #425 e #426).**

## PEDIDOS DE 24/11/2026 (fazer em seguida, na ordem; marque `[x]` ao concluir)

**Para o Claude:** o dono pediu (24/11) que, com o limite de uso liberado, o trabalho siga sozinho: PR atrás de PR (uma de cada vez, a partir da `main`, sem empilhar), conferindo que uma não trava a outra, com **testes de tela e conferências antes de cada PR**.

**Três documentos novos (24/11), também em PDF na pasta do projeto:** `HISTORICO_DO_SISTEMA.md` (o que foi feito, tirado e por quê, e **o que ainda falta, em ordem de prioridade**), `CONFERIR_O_QUE_MUDOU.md` (o que **você** confere, tela por tela, com caixas para marcar) e `TAXAS_COBRAVEIS.md` (o que pode ser cobrado do inquilino, com uma pergunta sim/não para cada taxa; o advogado deve conferir).

### A. Boletos quebrados (urgente)
1. [x] **Condomínio, taxas do proprietário (ressarcimento):** lançadas, mas não entraram nos boletos do mês. **Explicado em 24/11:** a causa foi o mês de referência digitado no lugar do mês do vencimento (em dois imóveis); correção e testes na PR #373.
2. [x] **Seguro obrigatório** (PRs #364 e #373) lançado para entrar neste mês não entrou no boleto do inquilino.
3. [x] **Ajuste do mês em Boletos:** (PR #364) permitir **mais de um abatimento e mais de um ressarcimento** no mesmo boleto (hoje só um de cada).
4. [x] **Mandar o boleto feito à mão por e-mail** (enquanto a API do C6 não sai): em Boletos, anexar o PDF do boleto emitido no banco e enviar ao inquilino pelo Gmail um e-mail curto com o descritivo (como no boleto), o mês de competência, o vencimento e o boleto anexado. Hoje a equipe manda sempre esse e-mail por fora; agora quer mandar pelo sistema. **Feito em 24/11:** na página do boleto, caixa "Boleto emitido no banco (PDF)" (anexar, abrir, trocar, tirar) e botão "Enviar boleto por e-mail" (abre a janela para revisar; vai com o PDF anexado); a lista de Boletos mostra "📎 PDF do banco" e "✉ enviado em ...". **Para conferir:** anexar o PDF de um boleto de verdade e mandar a si mesmo primeiro.
5. [x] **Conferir tudo o que entra e sai do boleto** (aluguel, proporcional, IPTU, condomínio, seguro, ressarcimentos, abatimentos, multas da notificação, diferenças, caução, acordo, reserva, NF), com testes automáticos e de tela. **Feito em 24/11:** relatório em `CONFERENCIA_BOLETOS_24_11.md` (PRs #365 e #368; 4 decisões suas no fim do relatório).
6. [x] **Tarifa do boleto no contrato** (pedido de 24/11): os contratos novos dizem que o inquilino reembolsa a tarifa do boleto, com o valor do cadastro. **Falta o dono:** (a) [x] feito: o advogado não aprovou o aditivo (a tarifa vale também nos contratos antigos) e pediu multa e juros fora da tarifa (PR #411); ~~levar ao advogado a minuta do termo aditivo para os contratos já assinados (`documentacao/MINUTA_ADITIVO_TARIFA.md`)~~; (b) decidir se o Novo contrato já vem com a tarifa preenchida (Sistema → Regras do sistema → "Tarifa do boleto cobrada do inquilino que vem preenchida"; hoje em branco). Ex.: R$ 3,50 por boleto, aluguel de R$ 1.900,00 → boleto de R$ 1.903,50.

### B. Termo de aceite da reserva (decisões do dono em 24/11) — [x] programado em 24/11 (PR #372); falta a leitura e o teste do dono

**Feito (24/11):** na página da ficha, a caixa "Termo de aceite da reserva": e-mail "Condições e termo da reserva" e link do aceite (código no e-mail, PDF do aceite) → depósito da reserva → ficha e documentos pelo link. O % e os prazos estão em Sistema → Regras do sistema → "Reserva e termo de aceite". A pessoa vê o que mandou e corrige (troca e apaga documento) até a equipe conferir; a equipe é avisada a cada dado e documento. Decisões em `DECISOES.md` (24/11).

**Mudança do mesmo dia (24/11, 2ª decisão):** a empresa fica com **100%** da reserva na desistência depois do depósito (antes 40%), **sem prazo** de devolução total (antes 7 dias), com o aviso em destaque antes do aceite e do pagamento; texto dos documentos com exemplos ("renda diferente da declarada, emprego que a empresa não confirma, documento com dados alterados ou de outra pessoa"). Tudo continua configurável em Regras do sistema, com o risco escrito na explicação.

**Ainda falta o dono:**
- [ ] Reler o termo com os ajustes do advogado e as correções de 24–25/11 (documentos em 7 dias corridos; reserva de 7 dias; a empresa pode desistir com ou sem justificativa; reabrir a análise dá mais 3 dias).
- [ ] Ler o termo inteiro (ficha de teste → caixa do termo → "Ver o termo como a pessoa vai ler" ou o PDF), principalmente o aviso em destaque e os itens 6 e 7, e testar o link com um conhecido.
- [ ] Conferir em Sistema → Empresas o campo "Conta para depósito da caução e da reserva" (vai no termo e no comprovante).
- [x] (Decidido em 24–25/11, PR #413: o termo **não** fala em dobro; no sistema, "A empresa desiste desta reserva" com justificativa = devolução simples, sem justificativa = aviso do dobro, aceitando outro valor com quitação total.) Decidir se o termo diz o que acontece quando **a empresa** desiste (a lei das arras manda devolver em dobro, CC art. 418; hoje o termo não fala nisso; com a retenção de 100%, a reciprocidade ajuda a defender a regra).

Pedido original (histórico):
1. **Desistência:** em até 7 dias devolve tudo. Depois de 7 dias a empresa fica com **40%** (reserva de R$ 500,00: devolve R$ 300,00 e fica com R$ 200,00); **falta confirmar se 40% é aceitável pela lei** (o Claude explicou os riscos no chat de 24/11). Ficha reprovada: devolve tudo. "Documento falso": o dono quer ficar com tudo, mas perguntou se pode acusar sem prova. **Em aberto até ele responder** (sugestão do Claude: no texto, não falar em "falso"; falar em "informação ou documento que não se confirma na conferência", e tratar como desistência).
2. **Prazos:** o texto avisa antes que a pessoa tem **3 dias úteis para mandar os documentos, senão a reserva é cancelada** (para ela andar com a documentação). Avisar a equipe a cada dado novo e a cada documento enviado. A pessoa pode **ver o que já mandou e corrigir dados e documentos** (trocar e apagar o anexo errado).
3. **Onde entra a reserva:** sempre **abatida do 1º aluguel**, com o texto explicando que vai para esse fim.

### C. Outros pedidos de 24/11
1. [x] **Assinatura digital: melhorar o visual.** (feito em 24/11, PR #369: selo na linha da empresa e página final nova) Funcionou (conferido no validar.iti.gov.br), mas o campo de assinatura do documento fica em branco e a última página só tem uma tarja azul. Fazer uma página de assinatura mais bonita e preencher o campo "assinatura" do documento com o selo.
2. [x] **Modelos de documentos (PDF):** criar os modelos que faltam para o dono baixar, ler e ajustar. **Feito em 24/11:** 8 modelos novos, editáveis em Sistema → Modelos de documentos → **Outros documentos da locação** (prorrogação do prazo, troca de garantia, distrato, aviso de desocupação do inquilino, notificação para desocupação, autorização de obra, declaração de pagamentos em dia, aviso ao fiador), cada um com **Exemplo em PDF** (pessoa fictícia) e **Gerar para um inquilino** (também no botão **Outros documentos** da página do inquilino, em "Termos aditivos"). O arquivo `Modelos de documentos - para revisar.pdf` (raiz do projeto, fora do Git; gerado de novo com `node tools/modelos-para-revisar.mjs`) traz todos os documentos do sistema com dados de exemplo, os novos marcados NOVO, e a lista do que é editável e do que é texto fixo. **Falta o dono:** ler o PDF e anotar o que mudar (os textos novos não foram vistos por advogado; a notificação para desocupação, principalmente).
3. [x] **Lista do que conferir:** o dono não sabe o que mudou; montar a lista de tudo que ele precisa conferir de novo (tela por tela, o que fazer e o que deve aparecer). **Feito em 24/11:** `CONFERIR_O_QUE_MUDOU.md` (e o PDF de mesmo nome na pasta do projeto). **Falta o dono conferir** item por item.
4. [x] **Taxas e cobranças extras:** trazer a lista do que pode ser cobrado do inquilino (com a lei de cada uma) para o dono decidir. **Feito em 24/11:** `TAXAS_COBRAVEIS.md` (e o PDF), com uma pergunta sim/não para cada taxa. **Falta o dono decidir**; depois o Claude escreve as cláusulas para o advogado conferir.
5. [ ] **Busca geral com vários agentes ao mesmo tempo:** erros, partes quebradas, regras que deixaram de ser usadas; comparar com a memória e a documentação o que foi feito e o que deixou de ser feito, **quando** e **por quê** (o que foi implementado, o que foi tirado e a decisão). Tudo em **PDF** e documentado. Depois, listar o que ainda falta e começar as correções. **Parte feita em 24/11:** `HISTORICO_DO_SISTEMA.md` (e o PDF): o histórico por assunto (feito, tirado e por quê, pela metade) e a lista "O que ainda falta fazer" em ordem de prioridade. Falta a busca de erros e partes quebradas e começar as correções.
   - Busca de erros feita em 24/11: 52 erros confirmados em `BUSCA_24_11.md` (e o PDF "Busca de erros - 24-11.pdf"); correções em 4 lotes; decisões suas no início do relatório.
6. [ ] (25/11: índice `INDICE.md` e 1º arquivamento na PR #410; falta o dono decidir a lista de limpeza.) **No fim:** arquivar, salvar e compactar código e documentação para facilitar a consulta de memória (índice de ponta a ponta).
7. [x] **Resumo do contrato em perguntas e respostas** (pedido de 24/11): última página dos dois modelos de contrato, com as respostas tiradas das cláusulas e os valores de cada contrato (vencimento, atraso com exemplo em reais, reajuste, prazo, saída antes do fim, contas, consertos, reformas, sublocação, animais, garantia, vistoria e o que é cobrado na saída). Entra sozinho nos modelos já gravados (onde o fim do texto não foi mudado à mão). **Falta o dono:** ler `Resumo do contrato - para revisar.pdf` (raiz do projeto, 3 exemplos) e anotar o que mudar. O bloco está pronto para o termo de aceite da reserva (`RESUMO_CONTRATO`).

A simulação de todas as etapas (item 5b) fica para depois que o Claude fizer as etapas acima (decisão de 24/11).

## COMECE POR AQUI (atualizado em 22/11/2026, noite)

**Para o Claude:** na primeira mensagem de cada conversa, retome para o dono esta lista (o que ele precisa fazer), em português simples, antes de qualquer outra coisa. O item 1 é a prioridade do dono: comece por ele.

Tudo o que foi pedido até 22/11 está na `main` (PRs #335 a #361). O que **você** precisa fazer, na ordem:

1. [ ] **PRIORIDADE: Termo de aceite da reserva** (pedido em 18/11; **programado em 24/11** com as decisões de 24/11: veja o item B de "PEDIDOS DE 24/11/2026", acima, com o que falta você confirmar e testar; o texto abaixo é o histórico). Hoje o sistema começa no "Novo pedido de reserva", com a reserva já combinada. A etapa de antes não existe: nas Fichas abertas, uma **mensagem para quem demonstrou interesse** com as condições do imóvel (endereço, aluguel, seguro e IPTU estimados, vencimento, garantia, requisitos e documentos) → **aceite pelo link** (código no e-mail, PDF do aceite) → **depósito da reserva** → pedido de reserva. Decidir (sugestão de 19/11, com reserva de R$ 500,00):
   1. **Desistência:** em até 7 dias, devolve tudo (CDC art. 49); depois disso a empresa fica com 20% (devolve R$ 400,00, fica com R$ 100,00); ficha reprovada devolve tudo; documento falso, a empresa fica com tudo.
   2. **Prazos:** documentos em 3 dias úteis; a reserva vale 10 dias; devolução em 5 dias úteis.
   3. **Onde a reserva entra:** na caução (sugestão: descontar do 1º aluguel pode ser visto como aluguel adiantado) ou no 1º aluguel.

   A pesquisa jurídica está no item 6 ("Termo de aceite da reserva" e "Termo da reserva"). Com as respostas, o Claude confirma com um exemplo em reais e programa a etapa inteira.
2. [ ] **Assinatura digital** (certificado da ANK anexado em 22/11, válido até 02/01/2027):
   1. O programa do PC ainda é a versão de 22/11 às 20h, que não mostra o certificado na caixa. Ele troca sozinho às 20h, ao entrar no Windows ou com `--atualizar`; depois disso, de hora em hora (#361). Aí Sistema → Empresas → Certificado digital da empresa mostra o anexado, a validade e os dias que faltam (#360).
   2. Na mesma caixa: **Ligar a assinatura digital**.
   3. Testar: abrir um recibo → **Enviar para assinar** → esperar cerca de 1 minuto → **Baixar PDF assinado** → conferir em <https://validar.iti.gov.br> (e no Adobe). Mandar ao Claude qualquer mensagem de erro.
   4. **Renovar o certificado antes de 02/01/2027:** o aviso aparece na caixa e no Painel a partir de 03/12/2026.
   5. [x] ~~Ainda sem o botão de assinar: carta de reajuste, termos aditivos e contrato~~ (feito em 24/11, PR #412; só a empresa assina digitalmente, os outros como antes).
3. [ ] **Conferir as páginas novas de Sistema** (#358, "Dados e backup" virou Sistema) no computador e no celular: Empresas (com o certificado), Banco, Comunicação E-mail, Modelos de documentos e LGPD.
4. [ ] **Testar os PDFs** (computador e celular Android): Sistema → **Teste dos PDFs (temporário)**. Baixar um por um, ver se sai certo e anotar os textos a mudar. Depois o Claude apaga essa página (`PENDENCIAS_4000.md`, itens 1 e 6).
5. [ ] **Conferir as mudanças de 21/11** (na `main`, testadas pelo Claude, falta você ver no dia a dia): troca de titular fecha 30/30 (#337); declaração do IR só do que cada um pagou (#336); comunicado de contatos vai também ao solidário e ao representante (#339); página do inquilino com as duas NFs (#340); "Novo pedido de reserva" (#338); botão "Ir" em Contas do imóvel (#341); PDF comprido no iPhone (#342); link da ficha mandado de novo continua valendo (#343); aviso de endereço com dado errado (#344); ajuste do boleto que entra na NF (#345); pago a mais "a devolver" e botão "Devolvi" (#346); termo aditivo pergunta "valeu?" ao apagar (#347); "Adiar ou mudar a data" da saída (#349); recibo da devolução da garantia (#351). Também: abrir a página de privacidade no endereço de verdade (item nuvem-012).
6. [x] (Decidido em 24/11: compilados das taxas, cláusulas aprovadas pelo advogado na PR #406.) **Taxas e cobranças extras (pesquisa de 21/11, resposta no chat):** a lei põe vistoria, contrato e análise de ficha no locador (Lei 8.245/91, arts. 22 VII e 43). Decidir se o Claude prepara o texto das cláusulas novas (despesas de cobrança, visita perdida, serviço extra pedido pelo inquilino) para o advogado conferir, ou se calcula antes quanto cada contrato custa para embutir no aluguel.
7. [ ] **Pendências antigas que continuam** (detalhes abaixo): comunicado de contatos com um inquilino de teste (4b); conferências 4c a 4f; ficha pela internet com um conhecido (5); simular todas as etapas (5b); C6 quando liberar as chaves (7); **16/12/2026: CBS 2027**.
8. [ ] **Limpeza das cópias de trabalho** (`PENDENCIAS_4000.md` item 7): só no fim, depois dos itens acima; o Claude pergunta antes de apagar.

---

Situação em 17/11/2026 (fim do dia). Tudo o que foi feito até hoje está no ar até a PR #308: mutirão 3000, botão "Conectar o Gmail" (#299), notificações ao inquilino (#300/#301), régua em Boletos (#302), abrir a pasta no Explorer (#303), ficha com registro de quem conferiu (#304), NF com aviso de texto cortado e Excel por empresa (#305), melhorias pequenas (#306: Hoje/Ontem, inadimplência por faixa, 2ª via com o valor do dia, status embaixo dos botões), sem ANK fixa e Internet "Não tem" no contrato novo (#307) e publicação pelo GitHub Actions (#308). Depois, aceitas em 17/11: #309 (Pix devolvido e baixa só pelo identificador), #310 (limpeza técnica e 2ª rodada de 16/11), #312 (programa do PC desinstalável), #313 (programa do PC se atualiza sozinho) e #314 (respostas do contador). Conferidos pelo dono em 17/11: o sistema no computador e no celular e o programa novo no PC. Depois: #315 e #316 (ícone da casinha no programa do PC) e #317 (página Inquilinos alinhada, conferida no celular em 17/11). **18/11: Gmail ligado** (envio pela conta da krasinski, remetente administracao@ankjck.com.br; teste chegou certo, fora do spam); PR #318 (página de privacidade exigida pelo Google).

**18–19/11, na main e ainda não conferido pelo dono:** #319 (backup seguro da empresa: aviso em Dados e backup se nenhum computador fizer o backup em 3 dias), #320 (comunicado de contatos), #321 (e-mails de cada etapa mais curtos; rodapé de confidencialidade **não** será usado, decisão de 18/11), #322 (regras especiais por contrato), #323 (Solicitações e Notificações só em Inquilinos → Comunicações), #324 ("Nova solicitação de reserva": formulário curto, o resto a pessoa preenche pelo link), #325 (data de conclusão → "Concluída"; **conferido pelo dono em 19/11**) e #326 (filtro das solicitações pela situação, que estava quebrado). **Próximo (19/11):** o dono vai rodar uma busca geral de erros (links e ligações quebradas); pistas em `ROTINA_DE_MELHORIA.md`, "19/11".

**20/11: busca geral de erros feita** (pedido do dono em 19/11): 345 erros confirmados (15 graves, 107 médios, 223 leves), cada um conferido por um segundo agente. **Nada foi corrigido ainda.** Estão em 17 lotes em `MUTIRAO_19_11.md` (índice) e `mutirao-19-11/`. **Próximo:** corrigir lote por lote, começando pelo A (diferença de pagamento que some) e pelo B (outros graves); antes de mexer em regra de dinheiro, confirmar com o dono um exemplo em reais.

Marque com `[x]` o que for concluindo.

## Para confirmar na sequência (dono)

1. [x] Abrir o sistema no computador e no celular depois da troca da publicação (17/11) e ver se abre normal. **Celular conferido em 17/11** (desinstalou, instalou de novo, entrou rápido, tudo funcionando); **computador conferido em 17/11** (abriu, tudo certo). Na 1ª vez ele baixa tudo de novo (pode demorar um pouco mais).
2. [x] Aceitar as PRs em aceite: #309, #310 e #312 aceitas em 17/11. Sair e entrar com a senha: feito no celular em 17/11.
   - Depois do merge da #310: **sair e entrar de novo no site com a senha, uma vez** (e de novo sempre que trocar a senha). Sem isso, ligar um computador **novo** ao programa do PC dá "E-mail ou senha errados…". Os computadores já ligados continuam funcionando.
3. [x] Programa do PC novo: **conferido pelo dono em 17/11**: baixou e rodou o `.exe` novo, "Administração de Imóveis" aparece em Configurações → Aplicativos e Usuários → Aparelhos ligados mostra o programa "de 17/11/2026 (c60d8b1)". Daqui em diante ele se troca sozinho (todo dia às 20h e ao entrar no Windows).
4. [x] Ligar o Gmail com o Claude (item 1): **feito em 18/11**, pelo celular.
4b. [ ] **Comunicado de contatos aos inquilinos** (pedido do dono, 18/11): depois do merge, em Inquilinos → Comunicações → "Novo comunicado a todos", pôr o telefone da empresa, abrir "Ver como o inquilino vê", mandar primeiro para um inquilino de teste (o seu próprio e-mail e celular) e conferir o e-mail com a logo, a página e o código; depois "Enviar e-mail a todos" e "WhatsApp a todos". Em 23/11, "Lembrar quem falta".
4c. [ ] **Backup seguro da empresa (#319):** abrir Dados e backup e ver se o aviso dos 3 dias faz sentido.
4d. [ ] **E-mails mais curtos (#321):** ler o PDF "Modelos de e-mail - antes e agora.pdf" (pasta do projeto) e mandar um e-mail de teste para você; modelo que você editou antes fica com o texto antigo até "Voltar ao padrão".
4e. [ ] **Regras especiais (#322):** em Regras do sistema, criar uma regra especial e pôr num contrato de teste; conferir o boleto (entrada em 15/02, aluguel R$ 1.800,00: R$ 900,00 pelos dias reais, R$ 960,00 pelas regras do sistema).
4f. [ ] **Telas de 19/11 (#323, #324, #326):** Inquilinos sem os botões de Solicitações/Notificações (ficam em Comunicações); "Nova solicitação de reserva" abre o formulário curto; em Solicitações, "abertas" mostra só as abertas. (#325, data de conclusão, conferida em 19/11.)
5. [ ] Ficha pela internet com um conhecido (item 3). **Próximo** (19/11: o dono vai fazer; começa por "Nova solicitação de reserva").
5b. [x] (O Claude simulou em 24/11: `SIMULACAO_ETAPAS_24_11.md`, PR #416; erros da troca de titular corrigidos na #422.) **Simular todas as etapas com pessoas de teste** (pedido do dono, 18/11): ficha, aprovação, contrato, entrada, boletos, notificação, saída e devolução, com os e-mails de cada etapa saindo de verdade para endereços de teste, e ir corrigindo e melhorando os textos dos e-mails e documentos (item 3b).
6. [x] Contador: informe do IR (D5), DIMOB e numeração da NF: **encerrado em 17/11** (resposta do contador; nada muda no sistema; ver item 6).
7. [ ] Quando o C6 liberar: chaves + boleto de teste (decidir o corte do texto e conferir o desconto) (item 5).
8. [ ] Depois do C6 no ar: rever a sugestão do tipo de despesa pela descrição (ex.: SANEPAR → Água).
9. [ ] Quando acontecer: NF 16/30 (próximo inquilino com entrada no meio do mês) e troca de senha → religar o PC (item 13).
10. [ ] 16/12/2026: CBS 2027 (item 6).
11. [x] **Feito em 17/11 (PR "Programa do PC se atualiza sozinho"):** todo dia às 20h e ao entrar no Windows o programa confere se saiu versão nova no GitHub, baixa, confere o arquivo (tamanho e SHA-256) e se abre, e só então se troca; a nova vale na rodada seguinte. Testado no Windows de verdade com dois `.exe` (o antigo, rodando, se trocou pelo novo). Em Usuários → Aparelhos ligados, a coluna **Programa** mostra a versão de cada computador. Assim, dados, arquivos, versão PC e o próprio programa se atualizam sozinhos. Pedido original: Hoje só os dados e os arquivos se atualizam sozinhos (tarefas das 20h, ao entrar e de hora em hora); o próprio programa (`.exe`) precisa ser baixado de novo a cada versão nova. Fazer: a tarefa confere a versão na release `programa-pc` e troca o programa sozinha (com conferência do arquivo baixado), e o sistema mostra a versão do programa em Dados e backup.

**Como usar (para o Claude, depois de um /clear):** o dono vai responder item por item, na ordem da tabela. A cada resposta: anote aqui o que ele decidiu (com a data), marque `[x]` no que foi concluído, leve a decisão de regra de negócio para `DECISOES.md` e, se virar mudança no sistema, confirme antes com um exemplo em reais e datas.

## Resumo

| # | O que falta | Quem faz | Tempo |
|---|---|---|---|
| ~~1~~ | ~~Envio de e-mail pelo Gmail~~ **ligado em 18/11** | — | — |
| ~~2~~ | ~~Aviso no celular (ficha pela internet)~~ **concluído em 17/11** | — | — |
| 3 | Teste da ficha pela internet com uma pessoa de verdade (**próximo**) e, depois, a simulação de todas as etapas para melhorar os textos (3b) | você + um conhecido / você + Claude | 20 min / algumas sessões |
| ~~4~~ | ~~Conferências no celular~~ **concluídas em 18/11** ("Enviar agora" testado no celular) | — | — |
| 5 | Banco C6 (boleto e extrato automáticos): cobrado por e-mail em 17/11, aguardando as chaves | o C6 liberar as chaves | depende do C6 |
| 6 | Decisões que estão com você: abertas só CBS 2027 e corte do texto do boleto; D5 (IR), DIMOB e numeração da NF encerradas em 17/11 com o contador; as outras decididas em 17/11 | você / contador | — |
| ~~7~~ | ~~Aceitar a PR #231~~ aceita em 14/11 | — | — |
| 8 | Lembretes com data | você | — |
| ~~9~~ | ~~Programa no PC~~ **concluído em 17/11** (Explorer, desinstalar e o `.exe` que se atualiza sozinho conferidos) | — | — |
| ~~11~~ | ~~Mutirão de 16/11~~ **concluído em 17/11** (2ª rodada na PR #310, em aceite; compactação do código na #308) | — | — |
| 13 | Mutirão 3000 (16–17/11): 366 erros confirmados; 314 corrigidos no inventário de 17/11 (até #303) e mais correções em #304–#309 e nas PRs em aceite; faltam NF 16/30 e troca de senha (quando acontecerem) | você + Claude | — |

**Próximos passos (atualizado em 18/11):** siga a lista **"Para confirmar na sequência"** acima. Gmail ligado em 18/11. O próximo é o teste da ficha com um conhecido (item 3) e, depois, a simulação de todas as etapas para melhorar os textos (3b). Em 16/12: CBS 2027.

---

## 1. Ligar o envio de e-mail pelo Gmail  `[x]` (ligado em 18/11)

**18/11, feito pelo dono no celular, com o Claude:** projeto `ERP Imoveis` no Google Cloud (criado na conta do Cloudflare; o Google exigiu página inicial e política de privacidade para publicar: `https://ficha.ankjck.com.br` e `/privacidade`, PR #318), app **Em produção**, cliente Web, 4 segredos no Cloudflare, SPF com `include:_spf.google.com` (DMARC `p=none`). **A conta conectada é a krasinski.imoveis@gmail.com** (a que já tinha `administracao@ankjck.com.br` em "Enviar e-mail como" e recebe tudo); a conta do projeto no Google Cloud não precisa ser a que envia. A volta do Google passou direto pelo Access. Teste: chegou como "Administradora", fora do spam.

**17/11, fim do dia:** o botão está no ar (PR #299 aceita). É o **próximo a fazer com o Claude**.

**Decisão do dono em 16/11: "Entrar com o Google".** **Feito em 17/11 (Claude):** o botão **Conectar o Gmail** em **Dados e backup → E-mail pelo Gmail** (só administrador): **Conectar o Gmail → escolher a conta → Permitir**, como em qualquer site. A nuvem guarda a autorização cifrada (nunca no banco nem no navegador), renova sozinha, mostra a conta ligada e tem **Desconectar**. Não precisa mais rodar nada no computador nem colar código no Cloudflare. É o mesmo caminho do produto para vender (cada cliente só clica; ver `ESTUDO_PRODUTO_COMERCIAL.md`, seção 6). **Falta você** (com o Claude junto no navegador, se quiser). **Não cadastrar cartão** no Google Cloud: o "teste gratuito"/faturamento que ele oferece não é preciso, a Gmail API é gratuita. Descartado por ora: mandar pelo serviço do produto com o endereço do cliente ("alias": só com domínio próprio e linhas no DNS).

**Por que importa:** sem isto, o botão **Enviar agora** fica desligado (só "Copiar texto" e "Abrir no Gmail") e **os e-mails automáticos da ficha pela internet não saem** (para a pessoa: "recebemos seus dados", "falta documento", "pronta para assinar"; para a equipe: "chegou documento"). É o primeiro a fazer.

Leva uns 30 minutos, uma vez só, no computador. Precisa da conta Gmail da empresa e do painel do Cloudflare. O passo a passo completo está em `LIGAR_GMAIL.md`; o resumo:

1. **Google Cloud** (<https://console.cloud.google.com>, entrando com a conta Gmail da empresa): Novo projeto `ERP Imoveis` → APIs e serviços → Biblioteca → **Gmail API** → Ativar.
2. **Tela de permissão OAuth**: tipo **Externo**, nome `ERP Imoveis`, e-mail da própria conta → em Público, **Publicar app** (se ficar em "Teste", para de funcionar em 7 dias).
3. **Credenciais** → Criar credenciais → **ID do cliente OAuth** → tipo **Aplicativo da Web** → em "URIs de redirecionamento autorizados" cole `https://erp.ankjck.com.br/api/email/google/retorno` (o sistema mostra este endereço, com botão Copiar, em Dados e backup → E-mail pelo Gmail) → copie o **Client ID** e o **Client Secret**. (Não cole aqui no chat.)
4. **Cloudflare** → Workers & Pages → erp-boletos → Settings → Variables and secrets (quadro de cima) → Add, tipo **Secret**: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REMETENTE` = `administracao@ankjck.com.br`, `GMAIL_NOME` = `Administradora` (e, se quiser cópia oculta de tudo, `GMAIL_CCO`) → Deploy.
5. **Remetente** `administracao@ankjck.com.br`: Gmail → Configurações → Contas e importação → **Enviar e-mail como** → adicionar, nome `Administradora`, confirmar pelo código que chega.
6. **SPF** (para não cair no spam): Cloudflare → `ankjck.com.br` → DNS → no TXT `v=spf1 ...` acrescente `include:_spf.google.com` antes do `~all` (nunca dois registros `v=spf1`).
7. **No sistema** (no computador, no Chrome): Dados e backup → E-mail pelo Gmail → **Conectar o Gmail** → escolha a conta da empresa → "Avançado" → "Acessar ERP Imoveis" → marque a permissão de enviar e-mail → **Permitir**. Volta sozinho para o sistema com "Gmail conectado" e a caixa mostra "Ligado: os e-mails saem pela conta …".
8. **Teste:** abra uma ficha → botão de e-mail → **Enviar agora** para o seu próprio e-mail. Deve chegar com o PDF anexado e o remetente "Administradora".

Se quiser, faço os passos 1 a 3 e 5 a 7 junto com você no navegador (você entra na conta; eu não digito senhas).

**Conferir na ligação de verdade (Claude junto):**
- [x] **Volta do Google pelo Access** (18/11: voltou direto, "Gmail conectado"): no passo 7, ao tocar em **Permitir**, o sistema deve voltar direto com "Gmail conectado", sem pedir de novo o código de login do Cloudflare. Se pedir o código ou der erro, mande um print: o Claude acerta a regra do Access para o endereço `/api/email/google/retorno` (`LIGAR_GMAIL.md` explica).
- [x] **Erros no console** ("An unknown error occurred when fetching the script", vistos no teste de 17/11): eram só do painel de navegador usado nos testes, que recusa registrar o service worker; no Chrome de verdade não aparecem (conferido na PR #310). Não é defeito.

---

## 2. Ligar o aviso no celular  `[x]` (conferido pelo dono em 17/11)

**17/11, conferido pelo dono:** aplicativo instalado de verdade no S23 (Chrome → Instalar aplicativo), **Desligar → Ligar** e o aviso de um documento mandado por link de teste tocou. O histórico abaixo fica só como registro.

**16/11:** chaves cadastradas no Cloudflare e aviso ligado no celular do dono (Samsung S23 Ultra, Android; passos 1 a 6). PR #263 (aceita) corrigiu a ficha; mesmo assim **nada tocou** (nem dados, nem documento, nem desistência): o envio do aviso falha em silêncio. PR #264: a nuvem limpa as chaves (espaço, quebra de linha, "NOME=" colados juntos, suspeita principal) e o botão **Testar o aviso** diz na tela onde está o erro. **16/11, depois da #264: o "Testar o aviso" funcionou** (as chaves coladas eram o defeito). Na mesma PR seguinte: o aviso mostra a logo escolhida em Empresas e, na barra de cima do Android, uma casinha (o Android só aceita silhueta de uma cor: figura colorida vira quadrado branco). **Falta o dono:** instalar como aplicativo de verdade (Chrome → ⋮ → **Instalar aplicativo**, não "Adicionar à tela inicial"), abrir pelo ícone e, numa ficha, **Desligar** → **Ligar**: assim o aviso sai com o nome do sistema (não o endereço do site) e, ao tocar, abre o aplicativo (não o navegador); depois mandar um documento por um link de teste e ver se toca. Antes: no celular, fechar e abrir o aplicativo → ficha → **Desligar neste aparelho** → **Ligar** → **Testar o aviso** → mandar ao Claude a mensagem que aparece. Conferir também no S23: Configurações → Aplicativos → o aplicativo (ou o Chrome) → Notificações ligadas e Bateria "Sem restrições"; Bateria → Limites de uso em segundo plano: fora de "Apps em suspensão". Histórico: No teste o celular não tocou: a ficha nova herdou o arquivo de uma ficha de teste antiga com o mesmo número, e o aviso só toca no primeiro documento; na mesma hora o "Documento inválido" barrava o documento com foto e a renda. Os dois foram corrigidos na PR "Ficha pela internet: documentos aceitos e link sem herança". **Falta (depois do merge):** apagar `Documentos\chaves-aviso.txt` (e da lixeira), se ainda não apagou; gerar um link novo numa ficha de teste, mandar um documento e conferir se o celular toca.

Quando alguém manda a ficha pelo link, a equipe recebe **e-mail** (depois do item 1). O aviso que aparece na tela do celular (como o do WhatsApp) ainda está desligado, porque precisa de duas "chaves" guardadas no Cloudflare.

**Passo a passo**
1. No computador, abra o PowerShell na pasta do projeto e rode:
   ```
   node tools/gerar-vapid.mjs | Out-File "$env:USERPROFILE\Documents\chaves-aviso.txt"
   ```
   Isso cria o arquivo `chaves-aviso.txt` em Documentos, com duas linhas: `VAPID_PUBLICA=...` e `VAPID_PRIVADA=...`. (Se preferir, peça para mim que eu gero o arquivo sem mostrar as chaves aqui.)
2. Entre em <https://dash.cloudflare.com> → **Workers & Pages** → **erp-boletos** → **Settings** → **Variables and secrets** (o quadro de cima, não o de "Build") → **Add**.
3. Cadastre três, todas do tipo **Secret** (tipo "Text" some na próxima publicação):

   | Nome | Valor |
   |---|---|
   | `VAPID_PUBLICA` | o texto depois de `VAPID_PUBLICA=` |
   | `VAPID_PRIVADA` | o texto depois de `VAPID_PRIVADA=` |
   | `VAPID_CONTATO` | `mailto:administracao@ankjck.com.br` |

4. Clique em **Deploy** (ou Save and deploy).
5. **Apague** o arquivo `chaves-aviso.txt` de Documentos (e da lixeira). A chave privada fica só no Cloudflare.
6. Em cada celular da equipe:
   - **iPhone** (iOS 16.4 ou mais novo): abra o sistema pelo **ícone na Tela de Início** (no Safari não funciona). Sem o ícone: Safari → `erp.ankjck.com.br` → Compartilhar → **Adicionar à Tela de Início**.
   - **Android**: pode ser pelo Chrome ou pelo aplicativo instalado.
   - Abra qualquer ficha em análise → em "🔔 Receber aviso neste aparelho…" toque em **Ligar** → **Permitir**.
7. Para testar: gere um link de uma ficha de teste (item 3) e mande um documento por ele. O celular deve tocar em até 1 minuto. Tocando no aviso, abre a ficha.

**Se der errado**
- "As notificações deste site estão bloqueadas": no celular, Ajustes → Notificações → Imóveis (iPhone) ou Chrome → Configurações do site → Notificações (Android) e libere.
- Se um dia trocar as chaves, cada celular aparece como "desligado": é só tocar em **Ligar** de novo.

---

## 3. Testar a ficha pela internet com uma pessoa de verdade  `[ ]`

**18/11:** Gmail ligado: é o **próximo**. Os e-mails da ficha já saem no teste.

Foi testado no computador, numa cópia do sistema. Falta um teste completo no endereço real e num celular de outra pessoa.

**Passo a passo (com um conhecido, ficha de teste)**
1. No sistema: **Fichas** → **Nova ficha** → nome do conhecido, telefone com WhatsApp, e-mail, imóvel vago qualquer, e marque a reserva (pode ser R$ 1,00, só para o teste).
2. Na página da ficha, caixa **Ficha pela internet** → **Gerar link** (o link vale 7 dias).
3. **Copiar / WhatsApp** → manda o texto pronto para o conhecido.
4. Peça para ele, no celular dele:
   - abrir o link (`ficha.ankjck.com.br/...`), preencher alguns campos e mandar;
   - enviar 1 ou 2 documentos (foto ou PDF);
   - baixar a ficha em PDF, assinar no gov.br (<https://assinador.iti.br>) e mandar de volta pelo mesmo link.
5. Confira que chegou o e-mail para a equipe (e o aviso no celular, se o item 1 já estiver feito).
6. Na ficha, confira:
   - os documentos aparecem com a marca da conferência (ex.: "assinado pelo gov.br" ou "⚠ possível montagem");
   - **Trazer para a ficha** abre uma janela: escolha os dados que entram e marque os documentos recebidos;
   - **Pedir o que falta** e **Mandar a ficha para assinar** mandam e-mail para a pessoa;
   - **Lembrar** gera o texto de lembrete no WhatsApp;
   - **Encerrar o link** faz o link parar de aceitar envios.
7. No fim, marque a ficha como "Desistiu" ou exclua, para não ficar no Painel.

Ponto que ainda não testei na tela depois das últimas correções: a janela do **Trazer para a ficha**. Se algo estranho aparecer, me mande um print.

### 3b. Simular todas as etapas e melhorar os textos  `[x]` (simulado pelo Claude em 24/11, `SIMULACAO_ETAPAS_24_11.md`)

**Pedido do dono em 18/11:** são muitas etapas e muitos e-mails; simular o caminho inteiro com pessoas de teste (e-mails de teste da própria equipe, CPF de teste) e ir corrigindo os textos. Roteiro sugerido, uma etapa por vez, o dono lendo cada e-mail e documento que chega e dizendo o que mudar: ficha pela internet (recebemos seus dados, falta documento, pronta para assinar) → aprovação e contrato → entrada (vistoria, recibos da reserva e da garantia) → boletos e NF → notificação ao inquilino → reajuste → saída (devolução das chaves, vistoria de saída, cálculo final, devolução da garantia). Modelos em `modelos-email.js` (e editáveis na tela); textos dos recibos em `recibos.js`. No fim, excluir as pessoas e contratos de teste.

---

## 4. Conferências rápidas no celular  `[ ]`

Coisas que funcionaram no computador mas não foram vistas num celular de verdade:

1. [x] **Ícone do aplicativo** (conferido pelo dono em 15/11: deu certo) (PR #193): em **Empresas**, enquadre a logo e grave. No iPhone, apague o ícone da Tela de Início e adicione de novo para pegar o novo.
2. [x] **"Enviar agora" com anexos** (18/11: testado no celular, chegou certo como "Administradora") (recibos e e-mails por etapa, PR #204; depois do item 1): abra uma ficha ou contrato → botão de e-mail → **Enviar agora** para o seu próprio e-mail. Confira se chegou com o PDF anexado e com o remetente "Administradora".
3. [x] **Caução na troca de titular** (conferido pelo dono em 15/11: deu certo) (PR #210): abra o **Painel** uma vez (ele corrige as trocas antigas sozinho) e depois confira cada contrato que teve troca de titular. Se a data paga da caução estiver errada, use **✎ corrigir data**.

---

## 5. Banco C6 (boleto e extrato automáticos)  `[ ]`

**Situação:** o sistema já está pronto para emitir boleto no C6, puxar o extrato e propor pagamentos. Falta o C6 liberar as chaves da API. A "ponte" (programa que fala com o banco) ainda não está instalada em computador nenhum. Ela só é instalada quando as chaves chegarem.

**O que fazer agora**
1. Cobrar o C6 **por escrito** (chat do C6 Empresas ou o gerente): "Preciso das credenciais da API de boletos (Bolepix) como Cliente Final, para sistema próprio". **14/11:** e-mail pronto em `EMAIL_C6_CREDENCIAIS.md` (todos os módulos, as duas empresas), para enviar a `homologacaoapi@c6bank.com` do e-mail de cadastro de cada empresa. **17/11: cobrado por e-mail pelo dono; aguardando as chaves.**
2. **Não** escolha um "Parceiro" de outra empresa na tela "Integrações via API" do Web Banking: daria acesso a um terceiro.
3. Quando o C6 mandar o ClientId, o ClientSecret e a pasta do certificado, me chame. A instalação segue `documentacao/LIGAR_C6.md`. **Nunca cole essas chaves no chat.**

**Ao instalar a ponte (desde o mutirão 3000, PR #280):** no `.env` da ponte, `ORIGENS=https://erp.ankjck.com.br`; se usar o Tunnel do Cloudflare, também `HOSTS=banco.ankjck.com.br` (sem isso a ponte recusa o Tunnel e o webhook). A ponte não sobe com a senha do exemplo: escolha uma frase própria com 20+ caracteres. Numa conta de produção, boleto com desconto só sai depois de marcar "Conferi o desconto no boleto de teste (sandbox)" (o C6 tem o tipo de desconto "por dia", que daria desconto demais).

**Decisão que fica para esse dia (dono, 17/11: decidir com o boleto de teste):** a descrição do boleto no C6 corta em 100 caracteres e as instruções em 4 linhas de 80. Com o boleto de teste (sandbox) na mão, diga se o corte automático serve.

**Também depois do C6 no ar:** rever a sugestão do **tipo** de despesa pela descrição do extrato (ex.: SANEPAR → Água). Desde 17/11 (PR #309) nada liga sozinho por valor, data ou nome: só pelo identificador (código do boleto, Pix do próprio boleto, código do Pix devolvido).

---

## 6. Decisões que estão com você  `[ ]`

| Assunto | O que decidir | Quando |
|---|---|---|
| ~~**D5, informe do IR**~~ | **Encerrado em 17/11 (resposta do contador):** um demonstrativo **por empresa**, **só o aluguel** (IPTU, seguro, multa, juros e correção não entram), com **cada mês e o total do ano** (o dono decidiu os dois, já que o contador não disse). Os valores batem com as NFs emitidas e com a DIMOB. O ano é o da **data da NF**, e a NF sai na data em que o dinheiro entrou: aluguel de 12/2025 pago em 05/01/2026 entra no informe de 2026, na linha "Aluguel de 12/2025, NF de 05/01/2026". **O sistema já fazia exatamente assim** (Documentos → Declaração anual); nada muda. | feito |
| ~~**DIMOB**~~ | **Encerrado em 17/11:** é obrigatória e **quem entrega é o contador** (sempre foi). O sistema não precisa gerar nada; os valores dela batem com as NFs. | feito |
| ~~**Feriados sem banco**~~ | **Decidido em 14/11:** Carnaval e Corpus Christi contam como dia sem banco (o sistema já fazia assim). | feito |
| ~~**Numeração da NF por empresa**~~ | **Decidido pelo dono em 17/11:** continua **uma numeração só para as duas empresas** (ANK e JCK são espelho uma da outra: o mesmo pagamento sai com o mesmo número nas duas; fora de sincronia está errado). É como o sistema já faz; nada muda. | feito |
| **Corte do texto do boleto no C6** | Descrição de 100 letras e instruções em 4 linhas de 80: **decidido em 17/11 que se decide com o boleto de teste** (item 5). | quando o C6 liberar |
| ~~**Prazos da conferência do banco**~~ | **Decidido em 17/11:** não há mais prazo de 45 dias nem de 7 dias para ligar sozinho. Só liga sozinho com o identificador igual (código de barras/nosso número, Pix do próprio boleto, código do Pix devolvido); Pix feito à mão e parcela de IPTU citada no extrato são sempre "vincular manualmente"; pagamento adiantado a empresa devolve. Contas lançadas à mão: candidatas do mês anterior e do mês da saída (saída em 17/11 → de 01/10 a 30/11). PR #309. | feito |
| ~~**Devolução de Pix ao inquilino**~~ | **Decidido em 17/11:** a devolução fica ligada ao boleto e o recebido volta ao devido; a NF não muda (boleto de R$ 2.000,00 pago duas vezes, devolução de R$ 2.000,00 → R$ 2.000,00 recebidos, NF de R$ 2.000,00). PR #309. | feito |
| ~~**Internet no contrato novo**~~ | **Decidido em 17/11:** vem "Não tem/Não se aplica" e pode ser mudada (só a Internet). PR #307. | feito |
| ~~**Retomada do imóvel abandonado**~~ | **Decidido em 17/11:** a cláusula fica no modelo; a retomada é feita com ata notarial e inventário do que foi abandonado. | feito |
| ~~**`restaurarGarantiaHerdada`**~~ | **Decidido em 17/11:** pode sair se não for mais usada removida na PR #310 (limpeza técnica, em aceite). | feito |
| ~~**Publicar pelo GitHub Actions**~~ | **Decidido e feito em 17/11** (PR #308; fonte do Pages trocada às 13:41 UTC), só pela rapidez. Para voltar, o comando está em `DECISOES.md`. | feito |
| ~~**Pasta do OneDrive**~~ | **Decidido em 14/11:** aposentada (não é mais usada; backup seguro no disco C, copiado todo dia para o HD externo). Guardar uma última cópia no HD externo e apagar do OneDrive (e da lixeira do OneDrive). | feito |
| **Termo de aceite da reserva** (aberto em 19/11) | Pesquisa feita em 19/11 (Código Civil arts. 417–420; CDC arts. 39, 49 e 51; Lei do Inquilinato arts. 20, 22 e 43; TJDFT, STJ, Procon-SP x QuintoAndar 2025, MP-RJ): reter 100% é o que mais perde na Justiça; ficha pela internet dá 7 dias para desistir com tudo de volta (CDC art. 49); ficha reprovada devolve tudo; desistência do dono devolve em dobro; descontar a reserva do 1º aluguel pode ser visto como aluguel adiantado (mais seguro: na caução). **Sugestão do Claude:** documentos em 3 dias úteis, reserva vale 10 dias, desistência depois de 7 dias retém 20% (reserva de R$ 500,00 → fica R$ 100,00, devolve R$ 400,00), devolução em 5 dias úteis. **Falta o dono decidir:** o percentual, os prazos e se desconta na caução ou no aluguel. | quando o dono decidir |
| **CBS 2027** (aguardando desde 14/11; **retomar em 16/12/2026**) | O imposto novo substitui o PIS/COFINS em 2027. Exemplo: aluguel residencial de R$ 3.000,00 paga cerca de R$ 81,00 (hoje R$ 109,50). Antes de mudar a aba Impostos: alíquota final do Senado (até 15/12/2026); com o contador, se algum contrato antigo fica nos 3,65%; e se o aluguel passa a ser "valor + CBS". | depois de **15/12/2026** |
| **NF pelo governo (2027)** | Quando o governo definir o sistema da NF, ela passa a sair ao identificar o pagamento no extrato. | quando sair a regra |
| **Revisão jurídica** | Itens B3 a B6 do fluxo (ver `REVISAO_JURIDICA_CONTRATO.md`). **15/11:** B3, B4, B5 e B6 feitos (B5 sem a escolha "consertar ele mesmo" depois da devolução das chaves). Itens B da revisão jurídica concluídos. | feito |
| ~~**Nome do botão**~~ | **Decidido em 14/11:** "Corrigir caução" é o termo certo para pedir o dinheiro que completa a caução depois do aluguel corrigido. Fica como está. | feito |

---

## 7. Aceitar a PR #231  `[x]` (aceita em 14/11)

É só documentação (o aviso de NF dos boletos do mês e esta lista de pendências). O conflito com a `main` foi resolvido em 14/11. Pode aceitar: <https://github.com/juliocpfh/erp-boletos/pull/231>

---

## 8. Lembretes com data

- ~~**08/11/2027**: vence a chave do atualizador do PC (`atualizador-pc`)~~ **Não vale mais (17/11):** a chave foi apagada no Cloudflare (item 9e, passo 3); o computador entra com o crachá. Se o Cloudflare mandar e-mail sobre ela, pode ignorar.
- **15/12/2026**: prazo do Senado para a alíquota final da CBS. **Em 16/12/2026** retomar o item CBS 2027 (item 6): conferir a alíquota aprovada e falar com o contador antes de mudar a aba Impostos.

---

## 9. Programa no PC e pastas dos inquilinos (pedidos do dono em 14/11)  `[x]` (concluído em 17/11; "Abrir a pasta no Explorer" funcionando em 17/11; `.exe` novo e desinstalar conferidos em 17/11)

**Explicado em 15/11** (pedido do dono: clicar num ícone, abrir o sistema e ver no Windows, em pastas, os documentos e comprovantes de cada inquilino, atualizados sozinhos com a nuvem).

**Onde estão as coisas hoje:**
- **Dados e arquivos:** na nuvem (Cloudflare). Os arquivos já ficam lá organizados por imóvel → Inquilinos → nome da pessoa, como era no OneDrive.
- **No computador:** só a pasta do **backup seguro** (no disco C, a que foi escolhida em Dados e backup → Backup seguro). Lá dentro: `copias-diarias/` (o banco de cada dia), `semanal/` (banco + anexos, uma vez por semana) e `programa/` (a "versão PC", `administracao-imoveis.html`). **Tudo cifrado**: o Windows não abre, só o sistema com a senha do backup. Por isso a versão PC não parece um programa: ela é só a reserva para o dia em que o site cair.
- **Quem atualiza essa pasta:** o próprio sistema, quando está aberto no computador, e o **atualizador do PC** (`atualizador-pc`, Agendador do Windows, às 20h e ao entrar no Windows). Ele traz só os dados, cifrados; **não traz os arquivos dos inquilinos**.

**Proposta (para fazer na sequência):**
- [x] **9a. Ícone que abre o sistema** (instalado pelo dono em 15/11; você faz, não precisa programar): no Chrome, em `erp.ankjck.com.br`, menu ⋮ → **Transmitir, salvar e compartilhar → Instalar página como app** (no Edge: **Aplicativos → Instalar este site como aplicativo**). Fica um ícone na área de trabalho e na barra de tarefas; abre em janela própria e funciona mesmo com o site, o Cloudflare ou a internet fora do ar, com os dados da última vez que o sistema foi aberto naquele aparelho.
- [x] **9b. Cópia aberta dos arquivos no computador** (feito em 15/11): subpasta **`Arquivos dos imoveis`** dentro de `C:\Users\Julio\Imoveis` (a pasta do backup seguro), sem cifrar, como no sistema (imóvel → Inquilinos → pessoa). Abrir, imprimir e copiar à vontade; o que for posto ou mudado lá não vai para o sistema. Atualiza sozinha: (A) logo depois de anexar, apagar ou mover neste computador; (B) de hora em hora pelo atualizador do PC; (C) botão **Atualizar a pasta agora** em Dados e backup → Backup seguro. Decisões do dono: sem BitLocker (só ele usa o computador, com senha, e antivírus sempre atualizado); risco de exposição e LGPD aceitos.
  - **Feito em 15/11** (atualizador copiado, tarefa instalada; 1ª rodada: `arquivos=298`). Era: copiar os arquivos novos do atualizador para `C:\Users\Julio\Documents\Imoveis chave\atualizador-pc` (`atualizador.mjs`, `instalar-tarefa.cmd`, `desinstalar-tarefa.cmd`, `rodar-escondido.vbs`; o `.env` fica) e rodar `instalar-tarefa.cmd` **como administrador**. Posso fazer a cópia para você. Depois, conferir: aparece a pasta `Arquivos dos imoveis` e o `ultima-atualizacao.txt` termina com `arquivos=…`.
  - [x] **Abrir a pasta no Explorer** (pedido do dono em 17/11; feito pelo Claude na mesma data; **17/11: programa novo instalado e o botão funciona**; o `.exe` que estava em Downloads era o de 16/11: sempre baixe de novo do link abaixo). Em Dados e backup → Backup seguro → "Cópia aberta dos arquivos" (só no computador, não aparece no celular): botão **Abrir a pasta no Explorer**, que abre `C:\Users\Julio\Imoveis\Arquivos dos imoveis`, e **Copiar o caminho**, de reserva. O navegador não deixa um site abrir pastas do computador; por isso quem abre é o programa do PC, que passa a se registrar no Windows (só para o seu usuário, sem pedir administrador) e sempre abre essa pasta, nunca outra, seja quem for que chame. **Falta você, depois do merge (uns 5 minutos):**
    1. Uns 10 minutos depois do merge, baixe o `Instalar-Administracao-de-Imoveis.exe` novo em https://github.com/juliocpfh/erp-boletos/releases/tag/programa-pc e dê dois cliques (como em 16/11: aviso azul → **Mais informações → Executar assim mesmo**). Ele se copia por cima, liga o botão e termina com **Pronto**. Não pede a senha de novo.
    2. No sistema, Dados e backup → Backup seguro → **Abrir a pasta no Explorer**. Na primeira vez o Chrome pergunta se pode abrir o programa: marque **Sempre permitir** e clique em **Abrir**. Abre a pasta `Arquivos dos imoveis`.
    3. O caminho completo (e o botão **Copiar o caminho**) aparece na tela depois que o programa novo atualizar a pasta (ele já faz isso no passo 1; recarregue a página). Se o programa não achar a pasta, aparece uma janelinha dizendo o que fazer; sem o programa novo, o botão não faz nada.
- [x] **9d. Anexo abre sem internet no computador** (15/11): sem internet, o sistema abre o arquivo da cópia aberta (pode ser a versão da última atualização da pasta). No celular continua precisando de internet.
- [x] **9c. Rotina "Arquivo impresso" (pasta física do inquilino)** (feito em 15/11; proposta aprovada em `PROPOSTA_ARQUIVO_IMPRESSO.md`, com as suas 12 respostas):
  - Liga e desliga em **Dados e backup → Regras do sistema** ("Arquivo impresso"); começa **ligada**. Lista de todos em **Dados e backup → Arquivo impresso**.
  - **Entrada:** última etapa "Montar a pasta física" (depois das outras). **Saída:** a etapa do roteiro vira "Montar a pasta física da saída", depois da devolução da garantia. **Durante:** aviso de documento novo (termo aditivo, carta de reajuste, termo de acordo assinado, notificação) e de arquivo trocado, no Painel (um alerta só) e no alto da página do inquilino.
  - Tela da pasta com caixinhas, **Ver a capa e imprimir tudo** (capa + documentos numa impressão só; depois "Saiu tudo certo?") e **Já está tudo em papel**. Fora da pasta: NF, comprovantes, boletos, WhatsApp, documentos de renda e Serasa, fotos da vistoria, apólices e e-mails.
  - **Troca de titular:** passo 1 com o que falta da pasta do anterior e a caixinha "Pus a pasta de fulano dentro".
  - **Falta você (depois do merge):** abrir **Dados e backup → Arquivo impresso** e, para cada inquilino, conferir a pasta de papel: o que já está nela, marque e use "Já está tudo em papel"; o que falta, "Ver a capa e imprimir tudo". Termo do acordo: no boleto do acordo, "Termo para assinar" gera o termo (inquilino, fiadores e 2 testemunhas assinam) e "anexar o termo assinado" guarda o assinado; enquanto faltar, o Painel avisa. Arquivo posto à mão na pasta do inquilino (ex.: notificação) aparece no Painel na abertura seguinte do sistema.
- [x] **9e. Programa do PC sem chave de serviço** (feito em 15/11, etapa 1 da proposta de licença; concluído pelo dono em 17/11): o computador entra com o **seu e-mail e senha do sistema** e recebe um "crachá" que só lê, guardado cifrado pelo Windows; aparece em **Usuários → Aparelhos ligados** com o botão **Desligar**. **Atenção (15/11, correção):** a conta da senha passou a ser feita no computador (o Cloudflare recusaria a conta no servidor), então só o programa novo entra: use o `.exe` desta versão ou os arquivos novos de `atualizador-pc/`; o programa antigo avisa "este programa do computador é antigo".
  1. [x] (feito em 16/11; teste deu a mensagem certa) No Cloudflare, criar a regra **Bypass** do caminho `erp.ankjck.com.br/api/aparelho` (passo a passo em `nuvem/README.md`, "Programa do PC: regra Bypass no Access"). Teste: abrir `https://erp.ankjck.com.br/api/aparelho/saude` sem login mostra "Este computador não está ligado ao sistema".
  2. Copiar para `C:\Users\Julio\Documents\Imoveis chave\atualizador-pc` os arquivos novos (`atualizador.mjs`, `ligar.mjs`, `ligar-computador.cmd`) e dar dois cliques em `ligar-computador.cmd`: abre uma página no navegador; e-mail, senha e a pasta (já vem preenchida) → **Ligar**.
  3. [x] (feito pelo dono em 17/11: `.env` apagado, chave de serviço `atualizador-pc`, política "Atualizador" e segredo `SERVICOS` apagados no Cloudflare; o lembrete de 08/11/2027 do item 8 deixa de valer) No dia seguinte, com `ok` em `ultima-atualizacao.txt`: apagar o `.env` dessa pasta e, no Cloudflare, a chave de serviço `atualizador-pc`, a política "Atualizador" e o segredo `SERVICOS` do Worker.
  - **Etapa 2: programa num arquivo só, sem instalar o Node** (feito em 15/11; falta você, depois do merge, ~5 min). Pode fazer no lugar do passo 2 acima (ou depois dele: o computador já ligado continua ligado):
    - [x] **Instalado pelo dono em 16/11** (`.exe`; 1ª rodada 16/11 13:04 UTC: `ok`, `arquivos=298`). Passo 3 acima feito em 17/11.
    1. Uns 10 minutos depois do merge, baixe `Instalar-Administracao-de-Imoveis.exe` em https://github.com/juliocpfh/erp-boletos/releases/tag/programa-pc (uns 90 MB; o GitHub gera sozinho).
    2. Dois cliques. No aviso azul "O Windows protegeu o computador" (o programa não tem assinatura, como combinado no item 11 da proposta): **Mais informações → Executar assim mesmo**. Se perguntar "Deseja permitir?", **Sim**.
    3. Ele cria as três tarefas (20h, ao entrar e de hora em hora, no lugar das antigas), liga o computador se ainda não estiver ligado (página do navegador: e-mail, senha, pasta) e faz a primeira atualização. Deve terminar com **Pronto**.
    4. Confira `ultima-atualizacao.txt` com `ok`. Depois de um dia certo, a pasta `Imoveis chave\atualizador-pc` e o Node podem ser apagados do computador.
    - Testado em 15/11 com o `.exe` de verdade: ajuda, versão, aviso de computador não ligado, atualização completa contra uma nuvem de teste (crachá cifrado pelo Windows) e a rodada sem janela. **Não testado** (não dava sem mexer no seu Windows): criar as tarefas de verdade, a pergunta "Deseja permitir?" e o aviso azul. Se algo falhar, a janela diz o quê; o jeito antigo (Node) continua funcionando.
    - Continua faltando: assinatura (antes do primeiro cliente de fora), o programa se atualizar sozinho e o link para baixar dentro do sistema.
- [x] **9f. Programa do PC desinstalável** (pedido do dono em 17/11; **conferido pelo dono em 17/11**: aparece em Configurações → Aplicativos): desinstalar pelos Aplicativos do Windows e por um botão no sistema. **Falta você, depois do merge (5 min):** uns 10 minutos depois, baixe o `Instalar-Administracao-de-Imoveis.exe` novo em https://github.com/juliocpfh/erp-boletos/releases/tag/programa-pc e rode uma vez (aviso azul → **Mais informações → Executar assim mesmo**). Depois, em **Configurações → Aplicativos**, confira que aparece "Administração de Imóveis". Não precisa desinstalar: é só para ver que está lá.

## 10. Anexar a contra-vistoria de entrada  `[x]` (feito em 15/11)

**Pedido do dono em 15/11.** Lugar próprio para anexar a **contra-vistoria de entrada** (o que o inquilino encontrou de diferente da vistoria de entrada). Decisões do dono: vira etapa da entrada, logo abaixo de "Vistoria de entrada assinada", com prazo, e entra na pasta física.
- **Prazo:** 5 dias úteis da entrega das chaves (cláusula da vistoria). Ex.: chaves em 13/11/2026 → até 23/11/2026 (20/11 é feriado).
- **Na etapa:** data em que o inquilino mandou + arquivo (PDF, foto ou o e-mail salvo em PDF) → **Anexar**. Se ele avisar que não vai mandar, **Não houve**.
- **Passado o prazo sem nada anexado:** a etapa continua pendente ("prazo acabou em …: anexe o que o inquilino mandou ou marque Não houve") até alguém anexar ou marcar **Não houve** (mudado a pedido do dono em 15/11: alguns inquilinos mandaram contra-vistoria e ela precisa ir para o sistema). No inquilino novo, segura a montagem da pasta física até isso.
- **Falta você (depois do merge):** nos inquilinos que mandaram contra-vistoria, anexe na etapa (página do inquilino → Rotina de entrada); nos outros, clique em **Não houve**.
- **Troca de titular:** vale a contra-vistoria do contrato anterior.

## 11. Mutirão de correções de 15–16/11 (onde paramos)  `[x]` (concluído em 17/11)

Revisão em 4 frentes achou 58 problemas; as correções entraram na `main` em 16/11 pelas PRs #250 (ponte C6), #251 (servidor da nuvem), #252 (regras), #253 (`.exe` + programa do PC), #254 (telas) e #255 (sincronia e aplicativo sem internet). Cloudflare publicou sem erro. Lista completa em `ROTINA_DE_MELHORIA.md` ("Mutirão de 2026-11-16").

**Conferências depois do merge (o dono estava fazendo quando parou):**
- [x] **A.** Anexar duas vezes o mesmo arquivo em "Arquivos do inquilino": os dois aparecem e abrem (conferido em 16/11).
- [x] (conferido em 16/11) **B.** Ficha pela internet: Fichas → ficha de teste → **Gerar link** → abrir no celular e enviar 1 foto ou PDF. Certo: a página confirma e o documento aparece na ficha. No fim, **Encerrar o link**.
- [x] (conferido em 16/11) **C1.** No celular, abrir um anexo em PDF e apertar o **Voltar** do aparelho. Certo: o PDF fecha e a página continua a mesma.
- [x] (conferido em 16/11) **C2.** Fechar o aplicativo, ligar o modo avião e abrir de novo. Certo: abre com os dados.

**Falta você:**
- [x] **Cloudflare (feito em 16/11):** limite de pedidos na ficha pública, regra `Ficha publica - limite` (host `ficha.ankjck.com.br`, caminho começando por `/api/publico/`). No plano grátis a janela é fixa: ficou **20 pedidos em 10 segundos por IP, bloqueio de 10 segundos** (a regra grátis única está usada; a trava opcional de `/api/aparelho/entrar` do `nuvem/README.md` fica sem regra própria, o cofre já limita as senhas).
- [x] **Programa do PC (16/11):** regra Bypass criada e `.exe` instalado (ver item 9e).

**2ª rodada: feita em 17/11** na PR #310 (em aceite): telas raras carregadas só quando usadas, faixas de código numa ida só, ressarcimento barra mês com boleto em acordo, verificador separado da senha para o crachá do PC e Voltar do celular fecha a confirmação; a compactação do código no GitHub saiu na #308 (publicação pelo GitHub Actions). Pedido original, para registro: carregar as telas raras só quando usadas (nº 23), compactar o código no GitHub (nº 24), faixas de código do primeiro acesso numa ida só (nº 37), a tela de ressarcimento barrar mês com boleto em acordo, verificador separado da senha para o crachá do PC (hoje quem tem o banco aberto consegue um crachá só de leitura), Voltar do celular nas janelas de confirmação. Ficou de fora por segurança: adiar a regravação do banco no aparelho (nº 29).

**Ideia do dono em 16/11:** compactar os anexos. Feita no mesmo dia (item 12).

## 12. Compactação dos anexos (feita em 16/11, PRs #257, #258 e #261)  `[x]` (conferida em 16/11)

O sistema agora diminui sozinho, ao anexar, as fotos e os PDFs escaneados, sem guardar o original. PDF com texto (do banco, de um sistema, do Word) fica como está, e PDF com assinatura digital (gov.br, ICP-Brasil, banco) nunca é mexido. Os documentos mandados pelo link da ficha diminuem quando alguém abre a ficha no sistema, logo depois da conferência (o alerta "⚠ possível montagem" continua). Enquanto um PDF escaneado é compactado, o topo da tela mostra "página 3 de 10… Aguarde". Liga e desliga em Dados e backup → Regras do sistema → "Compactar anexos".

**16/11, PR #261 (pedido do dono):** ao compactar todos, o aviso do topo mostra o andamento geral em % (ex.: "Compactando os anexos: 45% (135 de 298 arquivos…)") e o arquivo da vez no fim.

**Conferido pelo dono em 16/11:**
- [x] **A. Anexos que já estavam no sistema (5 a 10 min):** Dados e backup → **Compactar os anexos que já estão no sistema** → confirmar. Deixe a tela aberta até o fim. Certo: no fim aparece quantos foram compactados e quanto diminuiu (ex.: "40 de 298 arquivo(s) compactado(s): de 350,0 MB para 60,0 MB").
  - **Resultado (16/11): 167 olhados, 0 compactados, e está certo.** Antes: 298 arquivos, 161 MB (71 PDFs assinados, 48 MB; 27 PDFs com texto, 29 MB; 136 pequenos, 20 MB; 60 PDFs escaneados, 60 MB). Os escaneados já vieram com uns 300 KB por página, o mesmo que a compactação daria, e o sistema só troca se ficar 15% menor. Apertar mais os escaneados (letra menos nítida) ganharia no máximo 20 a 30 MB: o dono não pediu.
- [x] **B. Anexo novo:** (16/11: a foto abriu na mesma posição da galeria; o sistema respeita a posição gravada pelo celular e não gira o papel sozinho. Ideia, se o dono pedir: botão "Girar" antes de anexar.) anexe uma foto grande (3 a 4 MB, tirada no celular) em qualquer inquilino. Certo: na lista de arquivos ela aparece com algumas centenas de KB (ex.: 400 KB) e abre de pé, sem estar virada.

## 13. Mutirão 3000 (16–17/11)  `[ ]`

Revisão em 8 frentes (regras, banco C6, segurança, dados, telas, teste de ponta a ponta, desempenho, venda): **366 erros confirmados**, cada um com a prova, em `MUTIRAO_3000.md`. Correções nas PRs #267 a #283, todas na `main` e publicadas.

**Decisões suas (16–17/11), já aplicadas:** Pix pago depois do vencimento com o valor de desconto perde o desconto e a diferença (mais multa e juros) vai ao boleto seguinte; boleto pago pelo código de barras e creditado em até 3 dias úteis não é atraso; pagamento a menos fica "Paga em parte" e a diferença vai ao boleto seguinte; índice negativo mantém o aluguel; renovação negociada pergunta o mês a partir do qual vale; todo mês conta 30 dias (entrada em 15/02 = 16/30); NF do mês incompleto com quantidade "16/30"; ficha reprovada ou desistência tem os dados pessoais apagados no prazo dos documentos; exclusão grande com dupla confirmação digitando APAGAR; formulário alterado pergunta "Sair sem salvar?"; link da ficha aparece uma vez só (reenviar gera outro).

**Conferir no uso (5 min cada):**
- [ ] Uma NF de aluguel proporcional: quantidade "16/30", unitário do mês inteiro, total proporcional. (Só dá para conferir no próximo inquilino com entrada no meio do mês; continua aberto em 17/11.)
- [x] Sair e entrar de novo: pede o código do login da internet de novo (normal agora). (Conferido 17/11.)
- [ ] Trocar a senha de um usuário: os computadores ligados pelo programa do PC desse usuário precisam ser ligados de novo. (Conferir quando acontecer.)
- [x] Painel: alertas mostram 5 de cada tipo e "Ver todos". (Conferido 17/11.)

**Falta você (Cloudflare, opcional; continua aberto em 17/11):** pôr `DONO_EMAIL` nas variáveis do Worker (com a nuvem vazia, só esse e-mail faz a primeira carga); criar o aplicativo do Access para `vendas.ankjck.com.br`.

**Decisões que ficaram com você:**
- ~~Devolução de Pix ao inquilino~~ **decidido em 17/11:** a devolução fica ligada ao boleto, o recebido volta ao devido e a NF não muda (PR #309, em aceite; ver item 6).
- ~~Publicar o site pelo GitHub Actions~~ **decidido e feito em 17/11** (PR #308).
- Impedimentos de venda que são projetos grandes (vários clientes no mesmo sistema, login próprio, proprietário de terceiros com repasse, DIMOB, importar planilha, outros bancos, portal do inquilino, assinatura eletrônica): ver `MUTIRAO_3000.md`, frente "mercado".

**2ª rodada do mutirão 3000 (17/11), na `main` pelas PRs #285–#298:** tela **Gestão** (Financeiro, com PDF); **régua de cobrança** (Boletos → botão "E-mails da régua", no alto da tela; até 17/11 ficava em Financeiro: prepara 3 dias antes, no dia, 3 e 10 dias depois; só envia os que o administrador marcar e autorizar, com a regra `regua_envio` ligada); **banco automático** (avisos do C6, ligação pelo código do Pix, extrato CSV com conferência do saldo, Saúde do banco); **primeiros passos** e botão "?" nas telas; 192 mensagens de erro em português simples; **LGPD**: backups da nuvem cifrados, tela **Acessos**, "Dados de uma pessoa" (ZIP pelo CPF) e "Apagar tudo desta pessoa" só 10 anos depois do fim do contrato; lixeira de anexos (30 dias) e cópia de cada hora do backup seguro (2 dias). Decisões de 17/11 aplicadas: conflito fica com o valor já gravado na nuvem; troca de titular esperando o termo não apaga mais a saída; caução R$ 0,00 de propósito fica; Desfazer volta a alteração inteira, com prévia dos boletos que mudam. Parte 3 de dados (PR #298): a nuvem passa só os campos mudados, a fila sem internet grava cada lote uma vez, a gravação copia só as tabelas que usa (no banco grande, de ~215 ms para ~5 ms) e recusas ligadas aparecem juntas em Conflitos.

**Conferir no uso (2ª rodada):**
- [x] Abrir o sistema uma vez no computador do administrador com o backup seguro ligado (o backup da nuvem passa a sair cifrado; "Voltar para este dia" pede a senha do backup). (17/11: reconheceu ao entrar.)
- [x] Financeiro → Gestão: números do mês e o PDF. (17/11: tudo ok.)
- [x] E-mails da régua: a lista do dia, tudo desmarcado. (Conferido 17/11; a pedido do dono, o botão "E-mails da régua" passou de Financeiro para o alto da tela **Boletos**; o "← Boletos" da régua volta para lá.)
- [x] Notificações ao inquilino (PR #300): conferir no celular a caixa Notificações ao inquilino, abrir uma notificação e o Gerar multa depois do prazo (no computador já foi testado). (17/11: no celular, tudo funciona.)
- [ ] Gmail (PR #299, aceita): ligar com o Claude (item 1).

**Relatório do trabalho para o contratante:** https://claude.ai/artifact/FNTqKJrMNp8sZGYywrmyHt

## Ficou de fora de propósito (não é defeito)

- "Movimentações sem destino" em Financeiro e Banco: fica como está até o C6 entrar em uso.
- Fechar o mês travando alterações, foto pela câmera e canal do inquilino: descartados ou adiados por você em 07/11.
- Abertura na nuvem sem copiar o banco e a nuvem usando menos memória (desempenho, itens 14 e 15 do mutirão 3000): ficaram de fora por segurança. A correção automática dos dados antigos (`normalizar`) mexe no próprio banco; dividir o banco entre "como está na nuvem" e "o que a tela vê" faria essas correções sumirem do que vai para a nuvem. O ganho é pequeno (~65 ms ao abrir). **Aceito pelo dono em 17/11:** "mais seguro e um pouco mais demorado, ok".
- Ligação automática de pagamento por valor, data ou nome do pagador: **descartada pelo dono em 17/11** (risco de erro e de fraude). Só liga sozinho com o identificador igual; o resto é "vincular manualmente" (PR #309).
- Régua de cobrança: em 17/11 o dono pediu que ela prepare os e-mails, mas **nada é enviado sem a autorização dele** (2ª rodada do mutirão 3000).
