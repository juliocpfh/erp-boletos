# Lote D2: Ficha pela internet, fichas e comunicados (2/2)

1 itens (0 graves, 0 médios, 1 leves). Arquivos: `telas/fichas.js`.
Como trabalhar: ver `../MUTIRAO_19_11.md`. Marque `[x]` ao corrigir. G = grave, M = médio, L = leve.

- [ ] **entrada-039** [L] 'Fichas em análise (3)' conta também as aprovadas sem contrato e as reprovadas com reserva a devolver
  - Vê-se: O número do título soma tudo o que está 'aberto': em análise, aprovada esperando o contrato e reprovada/desistiu com reserva para devolver. Com 1 ficha em análise, 1 aprovada e 1 reprovada a devolver, o título diz 'Fichas em análise (3)'.
  - Causa: `docs/js/telas/fichas.js:32, 37`
  - Fazer: Trocar o título para "Fichas abertas (N)" (e o "Nenhuma ficha em análise" para "Nenhuma ficha aberta").
