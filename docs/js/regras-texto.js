// Texto das regras de negócio do sistema, para o botão "Baixar regras do sistema (TXT)" em Dados e backup.
// Ao mudar uma regra de negócio, atualize aqui também (e em documentacao/DECISOES.md).
export const REGRAS_TEXTO = `REGRAS DO SISTEMA - ADMINISTRAÇÃO DE IMÓVEIS

1. FORMATOS
- Dinheiro é guardado em centavos inteiros. Datas aparecem como dia/mês/ano. Competência = mês de uso do imóvel (ex.: 10/2026).
- Empresas: ANK e JCK. Cada imóvel tem um percentual entre elas, usado para dividir as NFs. Nos documentos do inquilino (contrato, vistoria, recibo, carta) só a ANK aparece como locadora.
- CPF e CNPJ são conferidos pelos dígitos, só como ajuda: se falhar, avisa, mas não é grave.

2. CONTRATO
- O contrato liga o inquilino ao imóvel (a mesma pessoa pode ter vários contratos). O imóvel é escolhido só no "Novo contrato" e é obrigatório.
- O prazo conta da "Data de vigência inicial": término = mesma data, X meses depois (ex.: 05/01/2026 + 30 meses = 05/07/2028).
- A "Data do contrato" é a das assinaturas. Contrato novo não herda condições do inquilino anterior do imóvel: tudo é escolhido de novo.
- Troca de titular ("Continua o contrato de"): o anterior tem fim do vínculo na véspera da troca (não é saída). O novo herda contrato, vistoria, termo das chaves, aluguel, reserva e garantia. O termo aditivo da troca é obrigatório.
- Contrato sem imóvel há 7 dias (e sem boleto) é apagado sozinho.
- Contrato gerado por modelo editável. Documentos de entrada (contrato, vistoria, termo das chaves) só são marcados como assinados com o arquivo assinado anexado. Podem ser anexados com assinatura faltante ou registrados como perdidos (os de operador aguardam o administrador).
- Termo aditivo: sempre com o arquivo assinado. Trocar o dia do vencimento muda só o dia, sem cobrança proporcional.

3. SAÍDA DO INQUILINO
- Duas etapas: 1) informar a data de saída quando ele avisa (o último boleto sai proporcional); 2) fazer o cálculo final.
- O inquilino fica inativo só pela saída, quando a data passou e o boleto do último mês já existe.
- Leitura dos relógios (água e energia) é obrigatória na vistoria de entrada e na de saída.

4. REAJUSTE DO ALUGUEL
- O mês de entrada conta como 1º mês, qualquer que seja o dia. O aluguel do 13º mês já vem corrigido.
- Usa o índice acumulado dos últimos 12 meses até o mês anterior ao corrigido (IGP-M, IPCA, INPC e IGP-DI vêm do Banco Central para conferir; outros, como o IVAR, são digitados).
- Reajustes são aplicados e desfeitos só na tela Reajustes, na ordem (o de ano anterior primeiro).
- A carta de reajuste vai junto com o boleto do aluguel já corrigido e só no reajuste do ano corrente. Cita só o índice aplicado.
- Corrigir o aluguel inicial refaz os reajustes já lançados em cadeia (mesmo percentual).
- O percentual de bonificação sai do aluguel inicial e vale também para o aluguel corrigido.

5. GARANTIAS
- Tipos: caução, depósito de garantia, fiador, seguro fiança.
- Caução necessária = número de aluguéis x aluguel corrigido com bonificação (sem bonificação, o aluguel cheio).
- Caução e depósito podem ser pagos em depósitos de valores diferentes; a garantia fica registrada quando a soma chega ao valor do contrato. O comprovante é opcional, mas fica o alerta "Comprovante a buscar no banco" até anexar.
- Quando o aluguel é corrigido, a caução acompanha: a diferença (complemento) é tratada só na tela Reajustes ("Caução a completar"), em boleto separado (sem tarifa, sem IPTU, sem seguro, sem NF; à vista por padrão ou parcelado, cada parcela com a sua data e o seu valor) ou por depósito do inquilino. Cada parcela paga soma na caução.
- A garantia pode ser aplicada na empresa ou na conta de outra pessoa; na saída, a devolução sai de onde foi depositado, na proporção do aplicado.
- Fiador é incluído, trocado ou tirado pela troca de garantia, que pode ser cancelada (só a mais recente).
- Garantia herdada na troca de titular é cuidada no contrato do titular anterior.

6. BOLETOS
- Gerados por mês: aluguel proporcional, bonificação, IPTU, seguro, tarifa, reserva e ressarcimentos.
- Aluguel com bonificação vale quando pago em dia; atrasado, paga o aluguel cheio mais multa e juros.
- Multa e juros são cobrados pelo banco no próprio boleto. Juros ao dia são truncados, como no banco.
- Boleto pago não é excluído (desfaça o pagamento antes). Boleto com valor editado à mão não é refeito no recálculo.
- A baixa em lote é separada por vencimento.
- Boleto de controle (inquilino sem NF) fica fora das somas e dos resultados.

7. PAGAMENTO E NOTAS FISCAIS (NF)
- Cada pagamento tem a data contábil (data em que o dinheiro entrou).
- A numeração das NFs é contínua, pela data em que o dinheiro entrou, e dividida entre as empresas.
- Valor da NF = aluguel com bonificação (pago em dia) ou com multa e juros (atrasado). Não inclui IPTU, seguro nem tarifa. O padrão é NF com o aluguel cheio e o ressarcimento de condomínio como gasto.
- Valor recebido diferente do previsto para a data: pede justificativa e a NF é digitada à mão (a justificativa fica só no sistema).
- Para corrigir erro de NF, usa-se "Voltar a última numeração" (NFs não se apagam, para não deixar buracos).
- O sistema não emite NFS-e na prefeitura.

8. IPTU
- O proprietário paga todas as guias na prefeitura. O inquilino devolve no boleto só os dias em que ocupou (mês de entrada e de saída proporcionais); o resto é do proprietário.
- Cobrado a partir do mês de vencimento do 1º boleto, sempre pelo valor parcelado.
- Imóvel vazio, contrato sem IPTU ou carência sem IPTU: a parcela toda é do proprietário, com alerta.

9. SEGURO
- O seguro obrigatório pertence ao imóvel e só é salvo com o arquivo da apólice. Deve ser de 1 ano e não pode se sobrepor ao anterior.

10. RESERVA
- A reserva começa exatamente no aluguel marcado e segue nos seguintes só se sobrar. Pode ser marcada como já abatida em aluguel antigo.

11. CONTAS (ÁGUA, ENERGIA, GÁS, CONDOMÍNIO, INTERNET)
- Contas pagas por nós só nos meses de imóvel vago, até 2 meses depois de alugar, ou quando o contrato diz "Incluso no aluguel".
- Ressarcimento de taxa extraordinária de condomínio é abatido no boleto seguinte (Lei 8.245/91, art. 22, X).

12. IMPOSTOS (aba Impostos em Resultados)
- Base = valor das NFs emitidas no mês (data de emissão, sem canceladas).
- PIS/COFINS 3,65% mensal, vence dia 25. IRPJ 4,80% e CSLL 2,88% (presunção de 32%) trimestrais, no último dia útil do mês seguinte ao trimestre. Fim de semana e feriado nacional antecipam.
- Adicional do IRPJ: 10% do lucro presumido acima de R$ 60.000,00 no trimestre. Acréscimo da LC 224/2025 na receita acima de R$ 1,25 milhão por trimestre.
- Guia abaixo de R$ 10,00 não se paga: o valor passa para a guia seguinte do mesmo imposto.

13. ARQUIVOS
- Excluir ou desfazer um lançamento apaga também o arquivo anexado (se nenhum outro lançamento o usa). O "x" ao lado do clipe apaga só o arquivo e deixa o lançamento esperando novo anexo.
- Nomes de arquivos gravados pelo sistema não têm acento.

14. ALERTAS E AVISOS
- Vigência do contrato no topo, em vermelho forte; reajuste logo abaixo, em laranja. Cor e prioridade são editáveis pelo administrador.
- Avisos antes de salvar: data de pagamento de mais de 90 dias atrás, datas no futuro, endereço sem número, telefone sem DDD, e-mail com erro, leitura menor que a anterior, IPTU ou seguro 30% fora do anterior, lançamento repetido.
- Banco (C6): quando um campo passa do limite do banco (nome 40 caracteres, rua e número 40, e-mail 70 etc.), o sistema avisa em vez de cortar em silêncio.

15. USUÁRIOS E SEGURANÇA
- Papéis: administrador (tudo, desfaz alterações de cadastro, backup seguro), operador (lança e edita) e consulta (só vê).
- Senhas guardadas com PBKDF2-SHA256. Todas as alterações ficam no histórico.
- Backup diário, ZIP com os anexos e backup seguro cifrado numa segunda pasta, só do administrador.
`;
