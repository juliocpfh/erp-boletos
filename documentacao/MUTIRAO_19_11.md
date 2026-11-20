# Mutirão de 19–20/11/2026: busca geral de erros (índice dos lotes)

Pedido do dono (19/11): achar tudo o que está quebrado, sem sentido ou duplicado. 13 frentes procuraram e um segundo agente conferiu cada achado pelo código. **345 confirmados** (15 graves, 107 médios, 223 leves; uns 57 são o mesmo defeito achado por duas frentes). **Em 20/11 foram corrigidos todos os lotes** (PRs #329 e as seguintes); os 4 itens que esperavam o dono (F1 impressos-011, H textos-022, I fios-019, J1 mensal-033) foram feitos com as decisões de 20/11 (branch `claude/mutirao-19-11-decisoes`). Os achados estão em lotes na pasta `mutirao-19-11/`; cada lote é uma PR.

## Para a próxima instância (leia só isto e o lote da vez)

1. Pegue o **primeiro lote sem `[x]`** da tabela e leia só o arquivo dele. Não leia os outros lotes.
2. Cada item traz: o que se vê, a causa (arquivo:linha, conferida em 20/11; as linhas andam, ache o trecho com `node tools/mapa.mjs <função>`), o que fazer e, nos médios e graves, o comportamento certo.
3. **Regra de dinheiro** (lotes A, B, H, J e itens com "Atenção"): antes de mudar, confirme com o dono um exemplo em reais e datas e confira `DECISOES.md`. Item que é escolha do dono: pergunte, não decida.
4. Corrija, escreva teste em `tests/` para os graves e para os médios de regra, rode `node tools/checar.mjs` e **teste na tela** em `?teste` o que mudou (o dono reclamou de entrega sem teste). Diga o que não foi visto na tela.
5. **Uma PR por lote, uma de cada vez** (lotes diferentes tocam os mesmos arquivos: não abra duas PRs juntas). Marque `[x]` nos itens e na tabela, na mesma PR.
6. O mesmo defeito pode estar em dois lotes. Ao corrigir, marque todos. Repetidos conhecidos: fios-011 = impressos-001; fios-001 = android-001 = iphone-001; fios-004 = admin-004; fios-005 = links-pc-003 = impressos-008; entrada-018 = impressos-006 = textos-001; entrada-011 = impressos-010; entrada-024 = impressos-011; iphone-002 = iphone-003 = iphone-004 = impressos-004 (mesma causa: `baixarPdfTela`/`documentoPdf`); admin-011 = nuvem-006 = textos-003; admin-002 = nuvem-004; links-pc-002 = mensal-020.
7. Economia: trabalhe pelo código; navegador só para conferir o que mudou, sem capturas em série.

## Lotes (na ordem de correção)

| Feito | Lote | Assunto | Itens | G/M/L | Arquivos principais |
|---|---|---|---|---|---|
| [x] | [A](mutirao-19-11/lote-A.md) | Graves: diferença de pagamento que some | 11 | 7/4/0 | `calculos.js` `regras.js` `t/cobrancas.js` `t/envios.js` |
| [x] | [B](mutirao-19-11/lote-B.md) | Graves: os outros (e os de mesma causa) | 14 | 8/5/1 | `app.js` `armazenamento.js` `calculos.js` `migracao.js` `regras.js` `t/acoes.js` … |
| [x] | [C](mutirao-19-11/lote-C.md) | Nuvem, usuários, backup e administração | 22 | 0/9/13 | `backup-seguro.js` `config-regras.js` `exportar.js` `nuvem.js` `nuvem/aparelhos.mjs` `nuvem/cofre.mjs` … |
| [x] | [D1](mutirao-19-11/lote-D1.md) | Ficha pela internet, fichas e comunicados (1/2) | 32 | 0/9/23 | `comunicados.js` `nuvem/contatos-publico.mjs` `nuvem/ficha-publica.mjs` `t/comunicacoes.js` `t/fichas.js` |
| [x] | [D2](mutirao-19-11/lote-D2.md) | Ficha pela internet, fichas e comunicados (2/2) | 1 | 0/0/1 | `t/fichas.js` |
| [x] | [E](mutirao-19-11/lote-E.md) | E-mails e notificações | 22 | 0/5/17 | `email-dados.js` `modelos-email.js` `t/emails.js` `t/notificacoes.js` `t/regua.js` |
| [x] | [F1](mutirao-19-11/lote-F1.md) | Contrato, vistoria, recibos e impressos (1/2) | 32 | 0/12/20 | `contratos.js` `modelos-contrato.js` `recibos.js` `t/documentos.js` |
| [x] | [F2](mutirao-19-11/lote-F2.md) | Contrato, vistoria, recibos e impressos (2/2) | 9 | 0/2/7 | `t/documentos.js` `t/faturas.js` `t/reajustes.js` |
| [x] | [G](mutirao-19-11/lote-G.md) | Banco e Financeiro | 29 | 0/5/24 | `conciliacao.js` `t/banco-c6.js` `t/banco.js` `t/fechamento.js` `t/financeiro.js` `t/gestao.js` |
| [x] | [H](mutirao-19-11/lote-H.md) | Boletos e pagamentos (telas) | 23 | 0/7/16 | `t/cobrancas.js` `t/envios.js` |
| [x] | [I](mutirao-19-11/lote-I.md) | Cadastros e formulários (valores aceitos sem conferir) | 27 | 0/12/15 | `calculos.js` `formularios.js` `t/cadastros.js` `t/campos.js` |
| [x] | [J1](mutirao-19-11/lote-J1.md) | Regras de negócio (regras.js) (1/2) | 32 | 0/18/14 | `regras.js` |
| [x] | [J2](mutirao-19-11/lote-J2.md) | Regras de negócio (regras.js) (2/2) | 5 | 0/0/5 | `regras.js` |
| [x] | [K](mutirao-19-11/lote-K.md) | Ações dos botões (telas/acoes.js) | 21 | 0/6/15 | `t/acoes.js` |
| [x] | [L](mutirao-19-11/lote-L.md) | Aparência e celular (estilo.css, app.js, visualizador) | 29 | 0/4/25 | `app.js` `estilo.css` `indice.js` `t/comum.js` `t/consultas.js` `t/contrato.js` … |
| [x] | [M1](mutirao-19-11/lote-M1.md) | Inquilino, imóvel, busca, ajuda e textos soltos (1/2) | 32 | 0/9/23 | `ajuda.js` `alertas.js` `armazenamento.js` `pessoa.js` `telas.js` `t/avisos.js` … |
| [x] | [M2](mutirao-19-11/lote-M2.md) | Inquilino, imóvel, busca, ajuda e textos soltos (2/2) | 4 | 0/0/4 | `t/contrato.js` `t/pessoa.js` |

## Fora da lista (14): não corrigir sem falar com o dono

- **links-pc-015** [de-proposito] Endereço com inquilino, mês ou conta que não existe abre a tela normal sem avisar (e uma devolução de garantia "da troca de titular" abre p…: O parâmetro errado no endereço sumir sem aviso e a tela usar o padrão é decisão registrada (DECISOES.md, 05/11/2026, linha 220; regra 4 do CLAUDE.md). Só acontece com endereço digitado ou colado errado. A devolução da g…
- **entrada-007** [de-proposito] "Lembrar" (e os outros botões) no dia seguinte mata o link que o interessado já tem: O link não fica guardado por segurança (decisão de 14/11 e correção do mutirão 3000: a chave não vai ao banco). Por isso, fora da aba em que foi gerado, mandar de novo = gerar outro, e a janela avisa "o anterior deixa d…
- **entrada-034** [de-proposito] Imóvel com saída já marcada não aparece para reserva até o inquilino sair: Decisão do dono de 10/11/2026 (DECISOES.md, linha 285): ficha "só imóvel vago", e a alternativa "escolher imóvel ocupado" foi recusada por "dar brecha pra erros". Imóvel com saída marcada para 30/11/2026 ainda está ocup…
- **mensal-009** [duvida] Pago a mais à mão: obriga a mudar o valor da NF e não registra o que tem de devolver: O comportamento existe (li o código): com valor a mais digitado à mão o sistema exige NF diferente da calculada e não marca "falta devolver". Mas duas decisões do dono se chocam: a de 21/10/2026 manda alterar a NF em qu…
- **saida-016** [duvida] Troca de titular no dia 28/02 ou no dia 31: os dois boletos do mês somam 28 ou 31 dias de 30: Refiz a conta e os números batem: troca em 28/02/2027 dá 27/30 + 1/30 = 28; em 31/03/2027 dá 30/30 + 1/30 = 31; em 15/12 dá 14 + 16 = 30. Só que cada lado segue exatamente a decisão do dono de 17/11 (saída em 27/02 = 27…
- **financeiro-banco-024** [duvida] O mesmo pagamento aguardando número de NF é contado em todos os meses seguintes do Fechamento: O fato é verdadeiro: a etapa das NFs de cada mês conta os pagamentos aguardando número com data até aquele mês, então um pagamento de setembro sem NF vira uma linha em setembro e outra em outubro nas Pendências. Mas o c…
- **impressos-002** [duvida] Declaração de aluguéis (IR) do novo titular soma os aluguéis pagos pelo titular anterior: O código faz mesmo o que o achado diz: a declaração do novo titular junta as NFs de todos os contratos anteriores da cadeia, sem olhar se é a mesma pessoa, e o texto diz "recebemos de Pedro". Mas a decisão escrita de 07…
- **comunicacoes-007** [duvida] O comunicado de contatos não vai para o inquilino solidário nem para o representante da empresa: O fato é verdadeiro no código: a lista só tem o inquilino principal e os fiadores; o solidário (que tem e-mail e telefone próprios no cadastro) e o representante não recebem. Mas a decisão do dono de 18/11 (DECISOES.md,…
- **comunicacoes-027** [nao-reproduz] Na página do inquilino, a coluna "NF" do boleto mostra só um número quando o boleto tem duas NFs: Derrubado: quando duas empresas emitem, o boleto gera duas NFs com o MESMO número (o número é dado uma vez por boleto e repetido em cada empresa; o próximo número só anda 1). Não existe "0077 e 0078" para o mesmo boleto…
- **comunicacoes-030** [de-proposito] A palavra "solicitação" nomeia duas coisas diferentes na mesma área: Os dois nomes foram pedidos pelo dono: "Inquilino novo começa pela solicitação de reserva" (DECISOES.md, 19/11/2026, linha 368; PRs #323/#324 em PENDENCIAS_DO_DONO.md, item 4f) e "Solicitações" é o nome antigo dos pedid…
- **nuvem-012** [efeito-do-teste] A nuvem de teste não serve a página /privacidade (política de privacidade): É verdade que a nuvem de teste do computador (node nuvem/local.mjs) só encaminha /ficha, /contatos e /api/publico/ e não abre /privacidade. Mas isso é só a ferramenta de teste do programador: no endereço de verdade (fic…
- **iphone-012** [duvida] Contas do imóvel: no iPhone, escolher o mês troca de tela a cada giro da roleta: O código confirma que só em Contas do imóvel a tela troca sozinha quando o campo do mês muda, sem botão "Ir". O que não dá para provar daqui é se o iPhone avisa a mudança a cada parada da roleta (é o costume do Safari d…
- **iphone-014** [duvida] PDF comprido aberto no iPhone pode ficar com páginas em branco: o visualizador desenha todas as páginas e não solta a memória ao fechar: O código confirma os dois fatos: o visualizador cria a imagem de todas as páginas de uma vez (cerca de 3 MB cada no iPhone) e, ao fechar, só tira a janela, sem esvaziar as imagens. Mas a consequência (páginas em branco)…
- **textos-017** [de-proposito] A lista "Movimentações do extrato sem destino", com o botão "Dar destino", existe em duas telas: A lista existe mesmo nas duas telas (financeiro.js:335-336 e Banco), mas está anotada como deixada assim pelo dono: PENDENCIAS_DO_DONO.md, seção "Ficou de fora de propósito": "Movimentações sem destino em Financeiro e B…

## O que a busca não cobriu

Aparelho de verdade (câmera, teclado, aviso no celular, iPhone real); modo nuvem no Android; cliques na tela em Financeiro e Banco; `conciliacao.js` 600–1320 (casar boleto com extrato); boleto no C6 simulado e ponte do C6; programa do PC; páginas públicas da ficha e dos contatos no navegador; resolver conflito pela tela. Testes automáticos em 20/11: 969 passaram.
