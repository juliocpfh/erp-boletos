# Lote F2: Contrato, vistoria, recibos e impressos (2/2)

9 itens (0 graves, 2 médios, 7 leves). Arquivos: `telas/documentos.js`, `telas/faturas.js`, `telas/reajustes.js`.
Como trabalhar: ver `../MUTIRAO_19_11.md`. Marque `[x]` ao corrigir. G = grave, M = médio, L = leve.

- [x] **impressos-024** [L] Tela "Gerar contrato" cita botão que não existe e a ajuda dos modelos não lista o que os modelos padrão usam
  - Vê-se: A tela "Gerar contrato de locação" diz: "Na tela do contrato, use Imprimir / salvar em PDF ou Baixar Word…". Na tela do contrato os botões são "Imprimir", "Baixar PDF" e "Baixar Word": não existe "Imprimir / salvar em PDF". Na ajuda "Como escrever um modelo",…
  - Causa: `docs/js/telas/documentos.js:613 (frase) e :39 (botões de verdade); ajuda em :717-730; campos em docs/js/contratos.js:328 e :345-347`
  - Fazer: Corrigir a frase para "Imprimir, Baixar PDF ou Baixar Word" e completar a lista da ajuda.
- [x] **android-016** [L] Quatro campos abrem o teclado de letras em vez do de números
  - Vê-se: Quase todos os campos de CPF, telefone, CEP e dinheiro abrem o teclado de números no celular, mas estes não: "CPF da testemunha 1" e "CPF da testemunha 2" (Gerar contrato e termos aditivos); "Telefone da assistência" (Seguro obrigatório); "CPF / CNPJ do clien…
  - Causa: `docs/js/telas/documentos.js:607-608, 649-650 e 701-702 (name=c1/c2); docs/js/formularios.js:455 (telefone_assistencia 'texto') e :588 (tomador_documento sem tipo); docs/js/telas/contrato.js:127 (name=valor)`
  - Fazer: inputmode="numeric" nos CPFs, tipo 'tel' no telefone e inputmode="decimal" data-dinheiro no valor.
- [x] **mensal-022** [M] Janela de cancelar a NF tem dois botões com o mesmo nome: "Cancelar" e "Cancelar"
  - Vê-se: Na lista de NFs de 04/2026 cliquei em "Cancelar" na NF nº 0009. A janela pergunta "Cancelar a NF nº 0009? O pagamento volta para a fila e recebe um número novo. O número 0009 não será reaproveitado." e os dois botões são "Cancelar" (desistir) e "Cancelar" (cancelar a NF). Não dá para saber qual desiste e qual cancela a nota; apertar o errado inutiliza o número.
  - Causa: `docs/js/telas/faturas.js:84 e docs/js/app.js:1366-1368 (padrão nao = "Cancelar" em app.js:522)`
  - Fazer: Chamar o botão da linha de "Cancelar a NF" (ou usar "Voltar" no não quando o sim também é Cancelar).
  - Certo é: Botões "Voltar" e "Cancelar a NF".
- [x] **mensal-040** [L] NF de parcela de acordo aparece na lista como "Aluguel 11/2026"
  - Vê-se: Na coluna Origem da tela NF, a NF de um boleto de acordo (ex.: parcela 1/3 do acordo dos aluguéis de 08 e 09/2026, que vence em 10/12/2026) aparece como "Aluguel 11/2026": é o mês interno do boleto da parcela, não o que a nota cobra. Na própria NF o período e…
  - Causa: `docs/js/telas/faturas.js:13-17 (contra regras.js:2055-2058)`
  - Fazer: Em origemTexto, se R.ehParcelaAcordo(cb), escrever "Acordo <parcela> (<acordo_referente>)" com o mesmo link.
- [x] **android-005** [L] Campo do mês cortado: aparece "novembro de 20" (o ano some atrás do ícone do calendário)
  - Vê-se: Nas telas NF, Financeiro, Gestão, Impostos e Banco o campo para escolher o mês tem largura fixa de 160 e, com a letra maior do celular, mostra "novembro de 20" com o desenho do calendário por cima do resto do ano. Em Boletos o mesmo campo é mais largo e mostr…
  - Causa: `docs/js/telas/faturas.js:62, financeiro.js:168 e 329, gestao.js:108, banco.js:109 (style="width:160px"); certo em cobrancas.js:157 (class="campo-mes", estilo.css:186)`
  - Fazer: Trocar o style="width:160px" por class="campo-mes" nesses cinco lugares.
- [x] **iphone-007** [L] Campo do mês cortado no celular de 320: aparece "novembro de 20" (sem o ano)
  - Vê-se: Em Gestão, Financeiro (Visão geral) e Impostos, o campo para escolher o mês fica estreito demais na tela de 320: mostra "novembro de 20" e o ano some atrás do ícone do calendário. Em Boletos e NF o mesmo campo é mais largo e aparece inteiro ("novembro de 2026…
  - Causa: `docs/js/telas/faturas.js:62, financeiro.js:168 e 329, gestao.js:108, banco.js:109 (style="width:160px"); a correta é cobrancas.js:157 + docs/css/estilo.css:186`
  - Fazer: Trocar style="width:160px" por class="campo-mes" nesses cinco campos.
- [x] **mensal-017** [M] Carta de reajuste diz que o complemento da caução vem num boleto só, mesmo quando foi parcelado
  - Vê-se: O complemento da caução do Fabio (R$ 162,00) foi parcelado em 2 boletos de R$ 81,00 (10/12/2026 e 10/01/2027). A carta de reajuste gerada depois continua dizendo: "Depósito adicional R$ 162,00. O depósito adicional será cobrado em boleto separado, com vencimento em 10/12/2026." O inquilino recebe a carta dizendo uma coisa e os boletos dizendo outra.
  - Causa: `docs/js/telas/reajustes.js:201`
  - Fazer: Montar a frase pelos boletos do complemento já gerados (valor e data de cada parcela).
  - Certo é: A carta listar as parcelas combinadas (2 boletos de R$ 81,00, em 10/12/2026 e 10/01/2027).
- [x] **mensal-024** [L] Reajuste já aplicado aparece como "falta IPCA" e "R$ 2.000,00 → -" depois que o índice é excluído
  - Vê-se: A correção da Maria (IPCA 4,5%, aluguel R$ 2.000,00 → R$ 2.090,00) já estava aplicada. Excluí o índice IPCA de 10/2026 da tabela (o sistema deixa excluir índice já usado, sem aviso). Na lista "Reajustes em aberto" a linha dela passou a dizer "1 ano(s) · IPCA …
  - Causa: `docs/js/telas/reajustes.js:122 e 125 (usam k mesmo com r.corrigido)`
  - Fazer: Com r.corrigido, mostrar o % e os valores da correção gravada; avisar ao excluir índice já usado.
- [x] **impressos-014** [L] Carta de reajuste com índice negativo diz que o aluguel não muda e, na frase seguinte, que "o novo valor será cobrado"
  - Vê-se: Quando o índice dos 12 meses é negativo, a carta explica: "o IGP-M acumulado nos últimos 12 meses ficou negativo (-1,20%): como diz o contrato, o aluguel continua o mesmo". Mas a tabela continua com a coluna "A partir do aluguel de 11/2026" e a frase seguinte…
  - Causa: `docs/js/telas/reajustes.js:177-179 (índice negativo) e :193-196 (tabela e frase fixas)`
  - Fazer: Quando o índice for negativo (valor igual), trocar a frase por "O valor do aluguel não muda" e não mostrar a coluna do novo valor.
