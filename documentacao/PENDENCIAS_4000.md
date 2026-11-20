# Pendências 4000 (20/11/2026): o que fazer depois do mutirão de 19/11

Pedido do dono em 20/11/2026, depois de as PRs #329 a #332 entrarem na `main` (os 17 lotes de `MUTIRAO_19_11.md` estão corrigidos). **A próxima conversa começa por aqui.** Faça na ordem, uma PR por item (não empilhe PRs: cada uma parte da `main` depois que a anterior entrar). Antes de mudar regra de dinheiro, confirme com o dono um exemplo em reais e datas. Teste na tela em `?teste` e diga o que não foi visto. Marque `[x]` aqui, na mesma PR, ao concluir cada item.

## 1. [x] Página temporária de teste de todos os PDFs (fazer primeiro)

**Feito em 20/11/2026:** Dados e backup → **Teste dos PDFs (temporário)** (`#/teste-pdfs`, só administrador), em `docs/js/telas/teste-pdfs.js`. São 27 PDFs em 4 grupos (contrato, aditivos, chaves e vistorias; recibos e termos; demonstrativos e NF; carta, IR, gestão e todos os dados); cada linha diz o registro usado ou o que cadastrar. "Abrir" leva à página do documento (Imprimir / Baixar PDF); nos recibos e na carta há também o PDF do jeito que vai no e-mail. Testado em `?teste` com dados fictícios: os 10 PDFs com registro abriram e baixaram sem erro, e a página cabe em 375 px. Na mesma PR: a página da carta de reajuste dava erro no "Baixar PDF" (variável `comp` inexistente). **Apagar depois do teste do dono:** `telas/teste-pdfs.js`, a rota `'teste-pdfs'` (`telas.js`), `testePdfs` em `PARTES_ADIADAS` (`telas/comum.js`) e no teste `tests/telas.test.mjs`, `'js/telas/teste-pdfs.js'` em `ADIADOS` (`sw.js`) e o link em Dados e backup (`telas/admin.js`).

- Uma tela só para o dono (administrador), por exemplo `#/teste-pdfs`, com **um botão por PDF que o sistema gera, um assunto de cada vez** (agrupados por assunto: contrato, termos aditivos, recibos e termos de quitação, NF, demonstrativos, cartas, notificações, ficha, vistoria, declaração do IR etc.).
- O dono vai abrir cada um **pelo computador e pelo celular (Android)**, ver se o PDF sai certo e anotar os textos a mudar. Depois a tela é apagada (é temporária: deixe isso escrito no código e aqui).
- Levante a lista pelo código (não confie só na lista acima): `recibos.js` (tipos de `reciboDisponivel`/`pdfDoRecibo`), `fatura.js`, contratos e aditivos (`modelos-contrato.js`, `#/imprimir/...`), demonstrativos, carta de reajuste, notificação (PDF tipo `notificacao`), PDF da ficha, vistoria, declaração de aluguéis do IR, `baixarPdfTela`/`documentoPdf`.
- Cada botão precisa de dados: use os do próprio banco quando existir um registro que sirva (o primeiro contrato, boleto, ficha…) e diga na tela qual registro foi usado; se não houver, diga o que cadastrar. Não grave nada só para gerar o PDF.
- Deixe a tela fora do menu (link em Dados e backup, só administrador). Rota nova precisa de entrada em `TELAS` e, se tiver parâmetro, em `FORMATOS_PARAMETRO`.

## 2. [ ] Termo aditivo excluído (corrige o aviso do saida-031)

Decisão do dono: **o termo aditivo assinado por todos, uma vez anexado, já vale** (ex.: vencimento passou do dia 10 para o dia 15) e não pode mais ser excluído, porque o inquilino já assinou. Só o anexo **errado ou sem a assinatura de todos** (a mudança ainda não valeu de fato) pode sair, e aí **os boletos voltam ao que eram** (dia 10) e nada da mudança fica.
- Barrar a exclusão do termo aditivo assinado por todos, explicando o motivo.
- Na exclusão do anexo incompleto, ou do termo que ainda não valeu, desfazer o efeito: dia do vencimento, novo valor e troca de titular voltam ao anterior, e os boletos em aberto são recalculados. Respeite `editado_manual` e os boletos emitidos no banco (`divergenciaBancaria`).
- Hoje (`telas/contrato.js`, `telas/acoes.js`, lote K saida-031/saida-043) a exclusão só avisa o que continua valendo.

## 3. [ ] Adiar a saída e refazer as contas (corrige o aviso do saida-007)

Decisão do dono: acontece de o inquilino precisar de mais dias para arrumar o imóvel (marcou a saída para dia 10 e vai ficar até dia 15). Precisa haver **um lugar no sistema para adiar a saída** (nova data) que **refaça o que ele deve**:
- o boleto proporcional do último mês passa a cobrar os dias novos; se já foi pago, a diferença é cobrada (ex.: pagou 10/30, agora são 15/30 → falta 5/30);
- o cálculo final, se já existir, é refeito ou avisa para refazer;
- a vistoria marcada e o roteiro da saída acompanham a data nova.
- Hoje (lote J, saida-007) desfazer ou adiar a saída só avisa a diferença (ex.: "faltam R$ 750,00") e não lança nada.
- Antes de programar, confirme o exemplo com o dono: aluguel de R$ 3.000,00, saída de 10/12 adiada para 15/12, boleto de dezembro já pago com 10/30 = R$ 1.000,00 → falta R$ 500,00 (5/30), cobrado como e quando?

## 4. [ ] Recibo/termo de devolução da garantia na troca de garantia

Decisão do dono: quando a caução é trocada (ex.: por fiador) e devolvida, o sistema gera um **termo de devolução da garantia, que é um recibo**, com o **valor corrigido pela poupança e devolvido** (ex.: caução de R$ 3.150,00 trocada por fiador em 01/12/2026, devolvida corrigida). O dono anexa o **comprovante da devolução** e **a pessoa assina que recebeu** (anexar o termo assinado, como os outros recibos).
- Tipo novo em `recibos.js` (com `reciboDisponivel`), rota `#/imprimir/recibo?tipo=…`, PDF `pdfDoRecibo`; dados da devolução em `devolucoes_garantia` (`troca_id`), movimentos em `trocas_garantia.devolucao_movimentos`.
- Campo do termo assinado: entra em `arquivosReferenciados`, `rotulosDosArquivos` e no arquivo impresso (`itensDaPasta`, com `vaga` estável), se for para a pasta física.
- Entra também na página de teste dos PDFs (item 1).

## 5. [ ] Os 14 itens "fora da lista" do mutirão de 19/11: decidir com o dono, um por um

Estão no fim de `MUTIRAO_19_11.md` ("Fora da lista"). **Não corrija nada antes de o dono decidir.** Traga **um item por vez**, em português simples, com exemplo de valores e datas, e a pergunta, e anote a resposta aqui:

| Item | Assunto | Decisão do dono |
|---|---|---|
| links-pc-015 | Endereço com inquilino, mês ou conta que não existe abre a tela normal sem avisar | |
| entrada-007 | "Lembrar" no dia seguinte gera outro link da ficha e mata o anterior | |
| entrada-034 | Imóvel com saída marcada não aparece para reserva até o inquilino sair | |
| mensal-009 | Pago a mais à mão: obriga mudar a NF e não registra o que tem de devolver | |
| saida-016 | Troca de titular no dia 28/02 ou 31: os dois boletos somam 28 ou 31 dias de 30 | |
| financeiro-banco-024 | Pagamento aguardando número de NF aparece em todos os meses seguintes do Fechamento | |
| impressos-002 | Declaração do IR do novo titular soma os aluguéis pagos pelo anterior | |
| comunicacoes-007 | Comunicado de contatos não vai ao inquilino solidário nem ao representante da empresa | |
| comunicacoes-027 | Coluna "NF" da página do inquilino mostra um número só (derrubado: as duas NFs têm o mesmo número) | |
| comunicacoes-030 | "Solicitação" nomeia duas coisas (reserva e pedido do inquilino) | |
| nuvem-012 | A nuvem de teste do computador não serve /privacidade (só a ferramenta do programador) | |
| iphone-012 | Contas do imóvel: no iPhone, escolher o mês troca de tela a cada giro da roleta | |
| iphone-014 | PDF comprido no iPhone pode ficar com páginas em branco (memória do visualizador) | |
| textos-017 | Lista "Movimentações sem destino" existe em duas telas (Financeiro e Banco) | |

Item que o dono mandar corrigir: uma PR para ele (ou para os pequenos juntos), com teste.

## 6. [ ] Testes do dono (ele faz; anote o resultado aqui)

- **Android:** o dono testa no celular dele: botões de 40 px, cartões das tabelas, teclado de números, "Baixar PDF" (deve sair igual ao do computador), visualizador de PDF, avisos presos no alto. Use a página do item 1 para os PDFs.
- Não testados por ninguém (ficam anotados): emissão no C6 do boleto do saldo do cálculo final (o `?teste` não tem as contas do C6), iPhone de verdade, páginas públicas da ficha e dos contatos no endereço de verdade.

## 7. [ ] Limpeza (só no fim, depois de os itens 1 a 6 serem vistos)

Sobraram cópias de trabalho (git worktrees) das instâncias do mutirão: `.claude/worktrees/agent-*`, `../erp-integracao`, `../erp-integracao2`, `../erp-pend`, e as branches `claude/mutirao-lote-*`. Tudo já está na `main`. O dono quer **apagar só no fim**, depois de ver tudo e confirmar que não falta arrumar nada. Pergunte antes de apagar.

## O que já foi decidido em 20/11 (para não perguntar de novo; está em `DECISOES.md`)

- Não existe boleto pago em parte: valor menor que o devido é recusado; quitação por acordo feito à mão.
- O complemento da caução só é aceito pelo valor exato; quem já avisou a saída não paga complemento.
- O seguro contra incêndio sempre existe: as opções são "por conta do inquilino" ou "incluso no aluguel".
- O saldo devedor do cálculo final é cobrado por boleto, sem NF. Pago atrasado, leva a multa e os juros do contrato; quando é pago, marca sozinho o "saldo cobrado".
- Conta paga pelo banco lançada errada: o administrador corrige só o lançamento.
- Na parcela arredondada do IPTU, a sobra abate o custo do dono.
- Nas telas, o nome é "Mês de referência". As 4 telas antigas foram apagadas.
