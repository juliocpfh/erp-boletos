# Lote M2: Inquilino, imóvel, busca, ajuda e textos soltos (2/2)

4 itens (0 graves, 0 médios, 4 leves). Arquivos: `telas/contrato.js`, `telas/pessoa.js`.
Como trabalhar: ver `../MUTIRAO_19_11.md`. Marque `[x]` ao corrigir. G = grave, M = médio, L = leve.

- [ ] **comunicacoes-020** [L] Contador de notificações em aberto não bate entre a página do inquilino e a aba Notificações
  - Vê-se: A aba "Notificações (1)" e o botão "Em aberto (1)" contam também o rascunho; o selo da página do inquilino ("1 notificação(ões) em aberto") conta só "Aguardando resposta" e "Multa gerada". Inquilino com um rascunho: a aba diz 1, a página dele não mostra o sel…
  - Causa: `docs/js/telas/contrato.js:32; docs/js/telas/comunicacoes.js:28; docs/js/telas/notificacoes.js:54 e :57`
  - Fazer: Uma função única para "notificação em aberto" nos três lugares (ou o selo dizer "1 rascunho").
- [ ] **comunicacoes-028** [L] Textos mandam usar "Editar", mas o botão se chama "Editar contrato"; e "Entrada / saída" mostra "15/02/2026 a -"
  - Vê-se: O alerta "Empresa sem representante cadastrado. Use "Editar"." e a pergunta ao excluir renovação ("confira em "Editar"") citam um botão que na tela se chama "Editar contrato". No quadro "Contrato e valores", inquilino sem data de saída aparece como "Entrada /…
  - Causa: `docs/js/telas/contrato.js:835, :874, :838 e :791`
  - Fazer: Citar "Editar contrato"; sem saída, mostrar "desde 15/02/2026".
- [ ] **comunicacoes-029** [L] A janela se chama "2ª confirmação", mas não existe uma 1ª
  - Vê-se: O botão "Apagar tudo desta pessoa" abre direto a janela "2ª confirmação: apagar tudo desta pessoa". Não há pergunta anterior; o título confunde.
  - Causa: `docs/js/telas/pessoa.js:55 e :118-124`
  - Fazer: Trocar o título para "Apagar tudo desta pessoa?".
- [ ] **admin-017** [L] A janela de apagar a pessoa chama-se "2ª confirmação", mas não existe a 1ª
  - Vê-se: O botão "Apagar tudo desta pessoa" abre direto a janela "2ª confirmação: apagar tudo desta pessoa" (digitar APAGAR). Não há uma primeira pergunta antes: o título confunde.
  - Causa: `docs/js/telas/pessoa.js:55 (botão) e :119 (título da janela)`
  - Fazer: Tirar "2ª confirmação:" do título (a janela de digitar APAGAR já basta).
