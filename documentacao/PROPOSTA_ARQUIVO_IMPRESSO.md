# Proposta: rotina "Arquivo impresso" (pasta física do inquilino)

Item **9c** de `PENDENCIAS_DO_DONO.md` e decisão de 15/11/2026 em `DECISOES.md`.
**Aprovada e implementada em 15/11/2026** (respostas da seção 8 e "aprovado" no mesmo dia). Diferenças da implementação: a etapa simples antiga da saída (`arquivo_fisico_em`) continua valendo como pasta fechada, sem migração de dados; arquivo solto novo (ex.: notificação) só aparece ao abrir a pasta do inquilino (o Painel não abre pastas); arquivo trocado é percebido quando o lançamento passa a apontar para outro arquivo.

Nomes e datas abaixo são de exemplo: **Ana Souza** (inquilina do Apto 2, Rua das Flores, 100), **Pedro Lima** e **Lúcia Lima** (troca de titular na Loja 1).

---

## Como funciona, em poucas linhas

1. Você liga a rotina em **Dados e backup → Regras do sistema**.
2. Cada inquilino passa a ter a sua **pasta física**: o sistema sabe o que já foi para o papel e o que falta.
3. Ela é montada **em três momentos**: no fim da **entrada**, quando chega **documento novo importante** durante o contrato e na **saída**.
4. Em cada momento aparece uma lista com caixinhas (o importante já vem marcado), um botão **Imprimir tudo** e uma **capa** com a lista do que está na pasta.
5. Depois de imprimir, você confirma "saiu tudo certo" e o aviso some. Fica guardado quem imprimiu e quando.

---

## 1. A chave liga/desliga

**Onde:** Dados e backup → **Regras do sistema**, no grupo "Rotina", como as outras regras:

```
┌─ Regras do sistema ─────────────────────────────────────────────────┐
│ Rotina                                                               │
│                                                                      │
│ Arquivo impresso (pasta física de cada inquilino)   [ ●Sim | Não ]  │
│   O sistema avisa o que imprimir na entrada, na saída e quando chega │
│   documento novo importante, e guarda o que já está em papel.        │
│   Consequência: ao ligar, cada inquilino ativo ganha uma pendência   │
│   "Montar a pasta física" (veja a lista em Arquivo impresso).        │
└──────────────────────────────────────────────────────────────────────┘
```

**Começa ligada** (resposta 1): ao publicar, a rotina já funciona e a primeira rodada (seção 5) aparece.

**Ligada:**
- aparece a etapa **"Montar a pasta física"** no fim da entrada e da saída;
- aparecem os avisos de documento novo e de arquivo trocado (no Painel e na página do inquilino);
- aparece o botão **Arquivo impresso** em Dados e backup (a lista de todos os inquilinos, seção 5).

**Desligada:** fica tudo como hoje. Nenhum aviso, nenhuma etapa nova. A etapa simples que já existe na saída ("Arquivo físico: imprimir o processo e guardar em papel", marcada à mão com a data) continua lá.
Nada do que já foi marcado como impresso se perde: se você religar, o sistema lembra.

---

## 2. Entrada: etapa final "Montar a pasta física"

### Quando aparece

É a **última** etapa da rotina de entrada (a lista de etapas na página do inquilino). Ela fica **cinza, "aguardando as outras etapas"**, até todas as anteriores estarem feitas ou marcadas como "não se aplica":
reserva, contrato assinado, termo da troca de titular (quando há), garantia, vistoria de entrada assinada, termo de entrega das chaves assinado, contas (água, luz, gás, condomínio) e seguro.

Exemplo: Ana assinou o contrato em 05/12/2026, a vistoria e as chaves em 10/12/2026, a Copel concluiu em 15/12/2026 e o seguro saiu em 16/12/2026 → em 16/12/2026 a etapa "Montar a pasta física" fica disponível e entra no Painel como pendência.

### A tela

```
┌─ Pasta física · Ana Souza · Apto 2 (Rua das Flores, 100) ──────────────────┐
│ Entrada · contrato de 05/12/2026 a 04/12/2029                               │
│                                                                             │
│ Escolha o que vai para o papel. O importante já vem marcado.                │
│                                                                             │
│ CONTRATO E TERMOS                                                 páginas   │
│ [x] Contrato de locação assinado (05/12/2026)                         12    │
│ [x] Vistoria de entrada assinada (10/12/2026)                          9    │
│ [x] Termo de entrega das chaves assinado (10/12/2026)                  1    │
│                                                                             │
│ DOCUMENTOS DA PESSOA                                                        │
│ [x] Ficha cadastral assinada (28/11/2026)                              3    │
│ [x] Documento com foto e CPF (RG ou CNH)                               1    │
│ [x] Comprovante de residência                                          1    │
│ [x] Fiador Carlos Dias: documento com foto e CPF                       1    │
│                                                                             │
│ RECIBOS (gerados pelo sistema)                                              │
│ [x] Recibo da reserva, cópia da locadora (R$ 500,00, 25/11/2026)       1    │
│ [x] Recibo da caução, cópia da locadora (R$ 6.000,00, 05/12/2026)      1    │
│                                                                             │
│ ESCOLHER SE QUISER (vêm desmarcados)                                        │
│ [ ] Outros arquivos da pasta: planta-apto2.pdf                         2    │
│                                                                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Marcados: 9 documentos, 30 páginas + capa                                   │
│                                                                             │
│  [ Ver a capa ]   [ Imprimir tudo ]   [ Já está tudo em papel ]             │
└─────────────────────────────────────────────────────────────────────────────┘
```

Cada linha tem um **olho** (abrir só aquele documento) e, depois da primeira impressão, a situação: "impresso em 16/12/2026 por julio".

### O que nunca aparece na lista

- Notas fiscais.
- Comprovantes de pagamento (caução, depósito, reserva, aplicação, devolução, saldo da saída, contas pagas). O **recibo** entra; o **comprovante do banco**, não.
- Boletos (pagos ou em aberto).
- Textos do WhatsApp (lembretes de cobrança).
- Itens da ficha que não precisam: declaração do imposto de renda, holerites, extratos bancários, pró-labore, carteira de trabalho, análise do Serasa (resposta 2).
- Fotos da vistoria (resposta 3): a vistoria assinada já descreve o estado do imóvel.
- Apólices do seguro, nem a da entrada nem as renovações (resposta 4).
- E-mails (resposta 6).
- Cópias para o contador e qualquer coisa da pasta do imóvel (contas pagas, IPTU).

### O botão "Imprimir tudo"

- Abre uma página de impressão com **a capa primeiro** e depois cada documento marcado, na ordem da lista, e abre a janela de impressão do navegador **uma vez só**.
- PDFs e fotos entram direto. Arquivo que o navegador não consegue imprimir (ex.: Word `.docx`) aparece na capa como **"imprimir à parte"**, com um botão para baixar.
- Quando a janela de impressão fecha, o sistema pergunta:

```
┌─────────────────────────────────────────────────────────┐
│ Saiu tudo certo na impressora?                          │
│                                                         │
│ [ Sim, marcar como impresso ]  [ Não, imprimir de novo ]│
└─────────────────────────────────────────────────────────┘
```

  Só no "Sim" a etapa fica feita ("Pasta física montada em 16/12/2026 por julio").
- **"Já está tudo em papel"**: para quando os documentos já foram impressos antes (ex.: o contrato assinado em papel). Marca como "já tinha em papel", sem imprimir nada. Dá para fazer item por item também (no menu de cada linha).

### A capa (folha-resumo)

Uma página A4, para ser a primeira folha da pasta:

```
┌──────────────────────────────────────────────────────────────┐
│ (Nome da empresa)                            Pasta do inquilino│
│                                                              │
│ Inquilina: Ana Souza · CPF 529.982.247-25                    │
│ Imóvel: Apto 2 · Rua das Flores, 100                         │
│ Contrato: 05/12/2026 a 04/12/2029 · Garantia: caução         │
│ Fiador: —                                                    │
│                                                              │
│ Nº  Documento                                Data    Págs    │
│  1  Contrato de locação assinado         05/12/2026   12     │
│  2  Vistoria de entrada assinada         10/12/2026    9     │
│  3  Termo de entrega das chaves assinado 10/12/2026    1     │
│  4  Ficha cadastral assinada             28/11/2026    3     │
│  ...                                                         │
│  9  Recibo da caução (cópia da locadora) 05/12/2026    1     │
│     Imprimir à parte: —                                      │
│                                                              │
│ Montada em 16/12/2026 por julio (entrada)                    │
│ Conferido por: ____________________  em ___/___/______       │
│                                                              │
│ Guardar até 10 anos depois da saída do inquilino.            │
└──────────────────────────────────────────────────────────────┘
```

- Cada vez que algo novo entra (seção 3), sai **a capa inteira de novo**, com a lista completa e os novos marcados **"novo"**. Você troca a capa velha pela nova.
- A capa não fica guardada como arquivo: ela é refeita a partir do que está registrado (dá para reimprimir quando quiser, em "Ver a capa").
- Na troca de titular, a capa traz a linha "Dentro desta pasta: pasta de Pedro Lima (contrato anterior)" (seção 6).

---

## 3. Durante o contrato e na saída

### Documento novo importante durante o contrato

Contam como importantes: **termo aditivo assinado**, **carta de reajuste** (pelo índice e pelo novo valor negociado, resposta 5), **termo de confissão de dívida (acordo) assinado** (resposta 7), **termos e recibos assinados** e **notificações** anexadas na pasta do inquilino.

Acordo: hoje o sistema não guarda o termo do acordo assinado. Ao fazer um acordo, o aviso diz "anexe o termo assinado do acordo na pasta do inquilino para imprimir"; só o termo assinado entra (as parcelas são parte financeira e ficam fora, como os boletos).

Exemplo: em 10/02/2027 é anexado o termo aditivo nº 2 de Ana (troca do vencimento para o dia 10).

**Onde aparece o aviso:**
- No **Painel**, como os outros alertas: "Ana Souza (Apto 2): 1 documento novo para a pasta física". Pode ser adiado ou desligado como qualquer alerta.
- Na **página da inquilina**, uma caixa no alto:

```
┌─ Pasta física: 1 documento novo ────────────────────────────────────┐
│ Termo aditivo nº 2 (troca do vencimento), assinado em 10/02/2027     │
│                                                                      │
│ [ Imprimir (com a capa nova) ]  [ Já está em papel ]  [ Não vai ]    │
└──────────────────────────────────────────────────────────────────────┘
```

- **Arquivo solto novo na pasta** (ex.: `notificacao-atraso-2027-03-05.pdf`, que o sistema não sabe o que é): a caixa pergunta "Vai para a pasta física?". "Não vai" faz o aviso sumir de vez para esse arquivo.

**Onde some:** ao confirmar "saiu tudo certo", ao marcar "já está em papel" ou "não vai". O que foi impresso continua listado na parte **"Pasta física"** da página da inquilina (histórico: o que está no papel, quando e por quem).

Não geram aviso durante o contrato: seguro (apólice nova ou renovação), fotos, e-mails.

Exemplo da carta: reajuste de Ana em 12/2027 pelo IGP-M, carta enviada em 05/11/2027 → aviso "Carta de reajuste de 12/2027 (enviada em 05/11/2027)". O mesmo para um novo valor negociado.

### Saída

A etapa que já existe no fim do roteiro de saída ("Arquivo físico") vira **"Montar a pasta física da saída"**, com a mesma tela da entrada. Fica disponível quando a **devolução da garantia** (ou a cobrança do saldo) estiver feita, isto é, quando tudo da saída já existe.

Exemplo: Ana sai em 30/11/2029; vistoria de saída em 02/12/2029; termo de devolução das chaves assinado em 02/12/2029; termo de quitação assinado em 20/12/2029 → em 20/12/2029 a etapa abre com:

```
│ SAÍDA                                                              │
│ [x] Vistoria de saída (02/12/2029, 2 reparos: R$ 1.050,00)         │
│ [x] Termo de devolução das chaves assinado (02/12/2029)            │
│ [x] Termo de quitação assinado (20/12/2029)                        │
│ [x] Notificações e documentos novos ainda não impressos            │
│                                                                    │
│ Guardar a pasta até 20/12/2039 (10 anos)                           │
```

A capa sai de novo com "Saída em 30/11/2029 · guardar até 20/12/2039". Ao confirmar, a etapa do roteiro fica feita ("Pasta física fechada em 20/12/2029") e o inquilino sai da lista de pendências.
O comprovante da devolução do saldo **não** entra (é comprovante de pagamento).

---

## 4. Arquivo importante trocado

Vale para os documentos que vêm **marcados** (contrato, vistoria, termos, aditivos, cartas de reajuste, recibos, documentos da pessoa). Se o arquivo de um deles for trocado **depois de impresso** (anexaram outro no lugar, ou o arquivo foi substituído na pasta), aparece no Painel e na página do inquilino:

```
┌─ Pasta física: arquivo trocado ──────────────────────────────────────┐
│ A vistoria de entrada assinada foi trocada em 12/03/2027.            │
│ A que está no papel é a de 10/12/2026 (impressa em 16/12/2026).      │
│ Imprima a nova e tire a antiga da pasta.                             │
│                                                                      │
│ [ Imprimir a nova (com a capa nova) ]  [ A troca não muda o papel ]  │
└──────────────────────────────────────────────────────────────────────┘
```

"A troca não muda o papel" serve para quando só mudou o nome ou a qualidade do PDF. Arquivo da parte "escolher se quiser" trocado não avisa.

---

## 5. Começo: o que já existe

Ao ligar a chave, **cada inquilino ativo** que já passou da entrada ganha uma pendência "Montar a pasta física (o que já existe)". Quem ainda está no meio da entrada segue a etapa normal (seção 2).

**Ex-inquilinos** (resposta 9): só entram os que **passaram o contrato adiante numa troca de titular** (ex.: Pedro Lima, que passou a Loja 1 para Lúcia Lima). Eles não aparecem sozinhos na lista: a pasta deles é o passo 1 da pendência de quem herdou (seção 6). Os outros que já saíram ficam de fora.

**Onde aparece a lista:** um botão novo **Arquivo impresso** em Dados e backup (e um link no alerta do Painel):

```
┌─ Arquivo impresso ───────────────────────────────────────────────────────┐
│ Mostrar: (●) Com pendência  ( ) Todos                                    │
│                                                                          │
│ Inquilino            Imóvel      Situação                         Ação   │
│ Ana Souza            Apto 2      Falta montar (14 documentos)    [Abrir] │
│ Bruno Alves          Loja 3      1 documento novo                [Abrir] │
│ Carla Mendes         Casa 5      1 arquivo trocado               [Abrir] │
│ Lúcia Lima           Loja 1      Conferir a pasta de Pedro Lima  [Abrir] │
│ Davi Rocha           Apto 4      Em dia (impressa em 20/11/2026) [Abrir] │
│                                                                          │
│ 4 com pendência de 5 inquilinos ativos                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

"Abrir" leva à mesma tela da seção 2, com tudo o que existe hoje daquele inquilino. Como boa parte já deve estar em papel, o botão **"Já está tudo em papel"** (ou item por item) é o mais usado aqui: você confere a pasta de verdade, marca o que já tem e imprime só o que falta.

No Painel aparece **um alerta só** ("4 inquilinos com a pasta física a montar"), para não encher a tela com um por inquilino.

---

## 6. Troca de titular (herança)

Exemplo: Pedro Lima passa o contrato da Loja 1 para Lúcia Lima em 01/12/2026.

A etapa "Montar a pasta física" de **Lúcia** (fim da entrada dela, que inclui o termo aditivo da troca assinado) mostra antes um passo da pasta de Pedro:

```
┌─ Pasta física · Lúcia Lima · Loja 1 ───────────────────────────────────┐
│ Troca de titular: herdado de Pedro Lima (contrato desde 01/03/2024)    │
│                                                                        │
│ PASSO 1 · Pasta de Pedro Lima                                          │
│   Situação: 2 documentos de Pedro ainda não estão em papel             │
│   [x] Termo aditivo nº 1 de Pedro (troca do vencimento, 05/2025)       │
│   [x] Carta de reajuste de 03/2025 de Pedro                           │
│   [ Imprimir o que falta de Pedro ]                                    │
│   [ ] Pus a pasta de Pedro Lima dentro da pasta de Lúcia Lima          │
│                                                                        │
│ PASSO 2 · Documentos novos de Lúcia                                    │
│   [x] Termo aditivo nº 2 (troca de titular) assinado (01/12/2026)      │
│   [x] Ficha cadastral de Lúcia assinada                                │
│   [x] Documento com foto e CPF de Lúcia                                │
│   [x] Recibo da caução nova (garantia nova)                            │
│   ...                                                                  │
│   [ Imprimir tudo ]                                                    │
└────────────────────────────────────────────────────────────────────────┘
```

- O contrato, a vistoria de entrada e o termo das chaves são **herdados** (estão na pasta de Pedro): não se imprimem de novo.
- A etapa só fica feita com o passo 1 marcado ("pus a pasta dentro") e o passo 2 impresso.
- A capa de Lúcia traz: "Dentro desta pasta: pasta de Pedro Lima (contrato anterior, 01/03/2024 a 30/11/2026)". A pasta de Pedro passa a mostrar "guardada dentro da pasta de Lúcia Lima em 05/12/2026" e sai da lista de pendências.
- Se Pedro tinha a pasta toda impressa, o passo 1 mostra só "Pasta de Pedro em dia" e a caixinha.

---

## 7. Marcar "impresso" e o que fica guardado

**Quem pode marcar:** quem grava no sistema (administrador e operador). O papel "consulta" só vê. O administrador pode desfazer pelo Histórico.

**Quando fica marcado:** só quando a pessoa confirma "saiu tudo certo", "já está em papel" ou "não vai". O sistema não sabe sozinho se a impressora imprimiu.

**O que fica guardado** (parte técnica, seguindo as regras do `CLAUDE.md`):

- **Regra nova** em `DEFINICOES_REGRAS` (`config-regras.js`): `arquivo_impresso`, grupo "rotina", tipo sim/não, **padrão "Sim"** (decisão do dono, resposta 1; foge da regra "padrão igual a hoje" do `CLAUDE.md` por pedido explícito), com explicação, consequência e lei (Código Civil, art. 205: prazo geral de 10 anos; LGPD, arts. 16 e 46: guardar só o necessário e com segurança, também no papel). Lida sempre por `regra('arquivo_impresso')`.
- **Tabela nova** `pastas_fisicas` em `TABELAS` (`regras.js`), uma linha por vez que a pasta foi montada ou completada:
  - `contrato_id`; `momento`: `entrada`, `durante`, `saida`, `inicio` (o que já existia) ou `heranca`;
  - `data` (`'AAAA-MM-DD'`) e `por` (login de quem confirmou);
  - `itens`: lista de `{ vaga, escopo, nome, rotulo, data_doc, alterado, paginas, situacao }`, em que
    - `vaga` diz **que documento é** (ex.: `contrato:12:doc_contrato_arquivo`, `aditivo:45`, `vistoria:7:assinada`, `recibo:garantia`, `solto:planta-apto2.pdf`): é assim que se percebe o arquivo trocado (mesma vaga, outro nome ou data de alteração mais nova);
    - `situacao`: `impresso`, `ja_tinha` (já estava em papel) ou `fora` ("não vai", para não avisar de novo);
  - `pasta_anterior` (só na herança): `{ contrato_id, guardada_dentro_em }`;
  - `observacao` (livre).
  - Gravada só por `inserir` (histórico registrado); entra no Desfazer do Histórico (não vai para `SEM_DESFAZER`).
- **Nada muda nos anexos**: a capa não é arquivo, então `arquivosReferenciados`, `rotulosDosArquivos` e a exclusão de anexos ficam como estão. A cópia aberta no PC (`Arquivos dos imoveis`) não muda.
- **Dados antigos** (`normalizar()`): contrato com `arquivo_fisico_em` (a etapa simples da saída de hoje) ganha uma linha `saida` sem itens, para continuar contando como feito. O campo antigo não é apagado.
- **Onde fica o código:** regras puras num módulo novo `docs/js/arquivo-impresso.js` (o que entra, o que vem marcado, o que é novo, o que foi trocado, a capa), com testes em `tests/arquivo-impresso.test.mjs` (CPF de teste `529.982.247-25`); a tela em `docs/js/telas/arquivo-impresso.js`, carregada só quando usada (entra em `ADIADOS` do `sw.js`); página de impressão `#/imprimir/pasta?contrato=…` (parâmetro novo em `FORMATOS_PARAMETRO`). Os PDFs são postos na página de impressão com o pdf.js que já existe em `docs/vendor`; na versão PC (reserva para desastre) o "Imprimir tudo" vira uma lista para imprimir um por um.
- **Etapas:** `pasta_fisica` no fim de `ETAPAS_ENTRADA` (só com a regra ligada); a etapa `arquivo` de `roteiroSaida` passa a olhar a tabela nova quando a regra está ligada. Alerta novo "Pasta física" em `todosAlertas` (adiável e desligável como os outros).
- Datas de alteração dos arquivos: a lista da nuvem já traz `alterado` (usada pela cópia aberta).

---

## 8. Respostas do dono (15/11/2026)

| Nº | Pergunta | Resposta do dono |
|---|---|---|
| 1 | A chave começa desligada? | **Não**: começa **ligada** |
| 2 | Documentos de renda e Serasa | **Nunca aparecem** |
| 3 | Fotos da vistoria | **Não entram** (nem desmarcadas) |
| 4 | Apólice do seguro | **Não entra**, nem a da entrada nem as renovações |
| 5 | Carta de reajuste | **Entra e avisa** durante o contrato: reajuste pelo índice e novo valor negociado |
| 6 | E-mails | **Não precisa**: não aparecem |
| 7 | Acordo de dívida | **Sim**: só o termo assinado, com aviso para anexá-lo |
| 8 | Recibos gerados pelo sistema | **Sim**: cópia gerada, com "cópia da locadora" |
| 9 | Ex-inquilinos na primeira rodada | **Só os que passaram o contrato adiante na troca de titular** (pasta deles = passo 1 de quem herdou) |
| 10 | "Conferido por" na capa | **Sim** |
| 11 | Um alerta só no Painel no começo | **Sim** |
| 12 | Saída liberada depois da devolução da garantia | **Sim** |

O texto das seções 1 a 7 já está ajustado a estas respostas.
