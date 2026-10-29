// Modelos padrão de contrato, montados a partir dos contratos da ANK/JCK (residencial e não residencial).
// Linguagem: veja montarContrato em contratos.js. Os modelos podem ser copiados e editados na tela "Modelos de contrato".

const PARTES = `**#i. {l:LOCADORA|LOCADORAS}:** {locadoras}, doravante {l:denominada|denominadas} simplesmente {l:LOCADORA|LOCADORAS}.

**#i. LOCATÁRIO:** {locatarios}, doravante denominado simplesmente LOCATÁRIO.

[se solidario]**#i. LOCATÁRIO SOLIDÁRIO:** {solidario}, que responde solidariamente com o LOCATÁRIO por todas as obrigações deste contrato.[fim]

[se fiador]**#i. {f:FIADOR|FIADORES}:** {fiadores}, doravante {f:denominado|denominados} simplesmente {f:FIADOR|FIADORES}.[fim]`;

const ITENS = `**#i. DO OBJETO E SUA FINALIDADE DA LOCAÇÃO**

{l:A LOCADORA dá|As LOCADORAS dão} em locação ao LOCATÁRIO {objeto}, com finalidade exclusivamente {finalidade}.

**#i. DO PRAZO DE LOCAÇÃO**

[se indeterminado]A locação é por prazo indeterminado, a contar da data de {data_inicio}.[senão]O prazo de locação é de {prazo_meses} meses, a contar da data de {data_inicio}, com término em {data_fim}, data em que o LOCATÁRIO restituirá {l:à LOCADORA|às LOCADORAS} o imóvel objeto desta locação inteiramente desocupado e nas mesmas condições e estado em que o recebeu, conforme documento de vistoria em anexo.[fim]

[se bonificacao]**#i. DO VALOR MENSAL DO ALUGUEL COM BONIFICAÇÃO**

O LOCATÁRIO pagará por esta locação o aluguel mensal de **{aluguel_bonificado}** até a data do vencimento, com bonificação por pagamento pontual.

**#i. DO VALOR MENSAL DO ALUGUEL SEM BONIFICAÇÃO**

Para pagamentos após a data de vencimento, o aluguel mensal é de **{aluguel_cheio}**, sem direito à bonificação.[senão]**#i. DO VALOR MENSAL DO ALUGUEL**

O LOCATÁRIO pagará por esta locação o aluguel mensal de **{aluguel_cheio}**.[fim]

**#i. DO DIA DO VENCIMENTO**

O aluguel mensal e demais encargos previstos neste contrato vencem todo dia {dia_vencimento} de cada mês[se bonificacao], com direito a bonificação por pontualidade no pagamento, conforme já ajustado neste documento[fim].

**#i. DA FORMA DE PAGAMENTO**

O pagamento dos aluguéis será feito mediante boleto bancário, que será enviado ao LOCATÁRIO por e-mail.

Os signatários que contratam nas qualidades indicadas neste contrato têm entre si ajustada a presente locação, mediante as seguintes cláusulas e condições, celebrada conforme a Lei nº 8.245/91, na qual as partes contratadas se obrigam mutuamente:`;

const ALUGUEL = (honorarios) => `## ALUGUEL E ENCARGOS

[se indeterminado]**CLÁUSULA #** – A locação é por prazo indeterminado, a contar de {data_inicio}, podendo qualquer das partes encerrá-la mediante notificação por escrito com 30 (trinta) dias de antecedência, devendo o imóvel ser restituído nas mesmas condições em que o LOCATÁRIO o recebeu, conforme relatório de vistoria.[senão]**CLÁUSULA #** – O prazo de locação é de {prazo_meses} meses, a contar de {data_inicio}, com término em {data_fim}, data esta em que cessará de pleno direito a presente locação, independentemente de qualquer aviso ou notificação judicial ou extrajudicial, devendo o imóvel ser restituído nas mesmas condições em que o LOCATÁRIO o recebeu, conforme relatório de vistoria.

**Parágrafo único** – Findo o prazo acima, se o LOCATÁRIO continuar na posse do imóvel sem que seja assinado novo contrato, a locação passará a vigorar por prazo indeterminado, podendo {l:a LOCADORA|as LOCADORAS} rescindi-la a qualquer tempo, mediante notificação por escrito ao LOCATÁRIO, que ficará obrigado a desocupar o imóvel no prazo de 30 (trinta) dias, a contar do recebimento da notificação, continuando em vigor as demais cláusulas e condições do presente contrato.[fim]

**CLÁUSULA #** – O aluguel mensal é de {aluguel_cheio}[se bonificacao], passível de bonificação para pagamento pontual conforme os itens do início deste contrato,[fim] e será reajustado anualmente pela variação d{indice}. Os reajustes ocorrerão sempre a cada 12 (doze) meses, com base de cálculo sobre o valor do aluguel anteriormente corrigido.

**Parágrafo primeiro** – Caso o índice acumulado no período seja negativo, o valor do aluguel permanecerá inalterado, vedada qualquer redução no valor nominal da locação.

**Parágrafo segundo** – O aluguel não pago no seu vencimento, além de não fazer jus à bonificação de pagamento com pontualidade, estará sujeito a cobrança pelo departamento jurídico, judicial ou extrajudicial, arcando o LOCATÁRIO com as despesas dela decorrentes, multa de {multa}, juros de {juros} ao mês e ${honorarios}.

**CLÁUSULA #** – As despesas de {encargos_inquilino}, assim como suas respectivas majorações, ficam a cargo do LOCATÁRIO.[se tem_incluso] O valor do aluguel contempla {encargos_inclusos}, que ficam a cargo {l:da LOCADORA|das LOCADORAS}.[fim]

[se tem_incluso]**Parágrafo** – Tarifas e taxas adicionais além das contas incluídas, como contratações adicionais, serviços solicitados unilateralmente, multas aplicadas pelo condomínio e pelo poder público e a responsabilidade civil e criminal perante o condomínio e terceiros, são de responsabilidade do LOCATÁRIO, que se obriga a ter consumo responsável de energia elétrica, água e gás e a comunicar imediatamente qualquer vazamento.[fim]

[se iptu_inquilino]**Parágrafo** – Fica estabelecido entre as partes que o Imposto Predial e Territorial Urbano (IPTU) correrá por conta do LOCATÁRIO e será cobrado junto com o vencimento do aluguel[se seguro_inquilino], bem como o seguro incêndio do imóvel[fim].[fim]

**Parágrafo** – As despesas de responsabilidade do LOCATÁRIO poderão ser cobradas a qualquer tempo, mesmo após a rescisão do contrato e a restituição do imóvel, quando forem detectadas despesas, reparações de danos, multas, contas em atraso, execuções judiciais ou extrajudiciais e tudo o mais concernente ao período em que o imóvel foi ocupado pelo LOCATÁRIO.`;

const CONSERVACAO = `## UTILIZAÇÃO E CONSERVAÇÃO

**CLÁUSULA #conservacao** – O LOCATÁRIO, salvo as obras que importem na segurança do imóvel, obriga-se por todas as outras, devendo trazer o imóvel locado em boas condições de higiene e limpeza, com os aparelhos sanitários e de iluminação, manutenção e limpeza de telhados e calhas, vidraças, torneiras, pias, banheiros, ralos, trincos, piso, pintura de paredes e demais acessórios em perfeito estado de conservação e funcionamento, para assim restituí-los quando findo ou rescindido este contrato, sem direito a retenção ou indenização por quaisquer benfeitorias, ainda que necessárias ou úteis, as quais ficarão desde logo incorporadas ao imóvel.

**CLÁUSULA #** – O LOCATÁRIO não poderá modificar a estrutura com reformas, mudar a fachada, ampliar o imóvel, derrubar paredes ou fazer transformações no imóvel sem a prévia autorização por escrito {l:da LOCADORA|das LOCADORAS}, sob pena de pagar multa no valor correspondente a três meses de aluguel por infração contratual. Ainda que se trate de benfeitorias úteis e necessárias, se o LOCATÁRIO as fizer sem consentimento por escrito, elas se incorporarão ao imóvel, sem que possa exigir indenização de qualquer espécie ou nelas fundar direito de retenção.

[se area_comum]**CLÁUSULA #** – DA DESOBSTRUÇÃO DA FRENTE DO IMÓVEL, ACESSO AO IMÓVEL E GARAGEM: o LOCATÁRIO compromete-se a manter a parte frontal do imóvel permanentemente livre e desobstruída de quaisquer objetos, entulhos, lixo, mercadorias ou veículos que impeçam ou dificultem o livre trânsito de pedestres e o acesso ao imóvel ou que poluam a visão.

**Parágrafo único** – O descumprimento desta obrigação, após notificação prévia, ensejará a aplicação das penalidades e multas previstas neste contrato.

**CLÁUSULA #** – DO USO COMUM E DESOBSTRUÇÃO DO PÁTIO: fica expressamente estabelecido que o pátio interno e externo do imóvel é de uso comum entre os ocupantes do local. O LOCATÁRIO deverá zelar pela boa convivência, sendo-lhe proibido obstruir, delimitar ou privatizar qualquer área deste espaço com móveis, materiais, veículos de grande porte ou objetos de uso pessoal.

**Parágrafo único** – O pátio deve ser mantido sempre limpo e com circulação totalmente desimpedida, garantindo o direito de ir e vir de todos.

**CLÁUSULA #** – DA MANUTENÇÃO DO PORTÃO ELETRÔNICO: a manutenção preventiva, a conservação e os consertos decorrentes do desgaste pelo uso ou por mau uso do portão eletrônico de acesso ao imóvel serão de inteira responsabilidade dos locatários que dele fazem uso.

**Parágrafo primeiro** – Em caso de defeito, quebra ou necessidade de substituição de peças (como motores, placas, controles ou engrenagens), o valor do conserto deverá ser integralmente custeado pelos locatários.

**Parágrafo segundo** – O conserto deverá ser providenciado imediatamente após a constatação do problema, por profissional qualificado, de modo a não comprometer a segurança do imóvel e dos moradores.[fim]

**CLÁUSULA #** – Obriga-se o LOCATÁRIO, no curso da locação, a satisfazer todas as exigências do Poder Público a que der causa, não motivando elas a rescisão deste contrato.

**CLÁUSULA #** – No caso de desapropriação do imóvel locado, {l:ficará a LOCADORA desobrigada|ficarão as LOCADORAS desobrigadas} de todas as cláusulas deste contrato, ressalvando ao LOCATÁRIO tão somente a faculdade de haver do poder desapropriante a indenização a que, porventura, tiver direito.

**CLÁUSULA #** – Não é permitida a transferência deste contrato, nem a sublocação, cessão ou empréstimo total ou parcial do imóvel, sem o prévio consentimento por escrito {l:da LOCADORA|das LOCADORAS}.

**CLÁUSULA #** – O LOCATÁRIO desde já faculta {l:à LOCADORA|às LOCADORAS} examinar ou vistoriar o imóvel locado quando entender conveniente, mediante agendamento prévio.`;

/**
 * FCI (fundo de conservação do imóvel): só entra no contrato com o FCI ativado em "O que está incluso no contrato".
 * Redigido como antecipação dos reparos (Lei 8.245/91, art. 23, III e V), e não como garantia (art. 37) nem encargo:
 * nunca paga aluguel ou contas, danos só pela vistoria de saída comparada com a de entrada, com orçamentos ou
 * comprovantes, e o saldo volta corrigido. Os modelos já gravados recebem este bloco em normalizar() (regras.js).
 */
export const CLAUSULAS_FCI = `[se fci]## FUNDO DE CONSERVAÇÃO DO IMÓVEL (FCI)

**CLÁUSULA #fci** – Além do aluguel, o LOCATÁRIO pagará mensalmente, no mesmo boleto e vencimento do aluguel, a contribuição ao Fundo de Conservação do Imóvel (FCI), correspondente a {fci_percentual} do valor do aluguel com bonificação do mês, calculada proporcionalmente aos dias de ocupação no primeiro e no último mês da locação. Nos meses sem cobrança de aluguel (carência), não há contribuição.

**Parágrafo primeiro** – O FCI é uma antecipação, feita pelo LOCATÁRIO, dos recursos destinados aos reparos de sua responsabilidade e à restituição do imóvel no estado em que o recebeu, nos termos da cláusula {cl:vistoria} e do art. 23, incisos III e V, da Lei nº 8.245/1991. O FCI não é aluguel nem encargo da locação, não constitui garantia locatícia e não se confunde com a garantia prevista neste contrato.

**Parágrafo segundo** – O FCI não poderá ser utilizado para pagar aluguéis, encargos, contas de consumo, tributos, multas ou quaisquer débitos que não sejam reparos de danos ao imóvel, nem poderá o LOCATÁRIO compensá-lo com aluguéis ou encargos vencidos ou a vencer.

**Parágrafo terceiro** – Cada contribuição será corrigida mês a mês pela variação d{fci_indice}, a partir do mês seguinte ao de seu pagamento e até a data da devolução, e o saldo do FCI nunca será inferior à soma das contribuições pagas. O LOCATÁRIO poderá solicitar, a qualquer tempo, o extrato das contribuições e do saldo corrigido.

**Parágrafo quarto** – A multa e os juros por atraso previstos neste contrato não incidem sobre a contribuição ao FCI, que não integra a base de cálculo da bonificação por pontualidade e acompanha automaticamente os reajustes do aluguel.

**Parágrafo quinto** – Finda a locação, com a entrega das chaves e a vistoria de saída, que o LOCATÁRIO poderá acompanhar, {l:a LOCADORA poderá|as LOCADORAS poderão} utilizar o saldo corrigido do FCI exclusivamente para custear os reparos dos danos apurados em comparação com a vistoria de entrada, excluído o desgaste natural decorrente do uso normal do imóvel, mediante apresentação ao LOCATÁRIO do relatório da vistoria e dos orçamentos ou comprovantes dos serviços.

**Parágrafo sexto** – O saldo remanescente do FCI, corrigido conforme o parágrafo terceiro, será devolvido ao LOCATÁRIO em até 30 (trinta) dias contados da vistoria de saída ou da conclusão dos reparos, o que ocorrer por último, por depósito na conta por ele indicada. Não havendo danos, o saldo integral corrigido será devolvido no mesmo prazo.

**Parágrafo sétimo** – Se o custo dos reparos ultrapassar o saldo do FCI, a diferença continuará devida pelo LOCATÁRIO, nos termos deste contrato.

**Parágrafo oitavo** – Havendo transferência do contrato a novo titular, com a anuência {l:da LOCADORA|das LOCADORAS}, o saldo do FCI acompanha a locação e será acertado com o titular que entregar as chaves, salvo ajuste diverso, por escrito, entre os titulares.[fim]`;

const RESTITUICAO = `**CLÁUSULA #vistoria** – O LOCATÁRIO recebe, no ato da assinatura do presente contrato, as dependências do imóvel em perfeitas condições de serem ocupadas, conforme relatório de vistoria anexo a este contrato, obrigando-se a manter tudo como recebeu e a restituí-lo no mesmo estado de conservação, higiene e perfeito funcionamento.

**CLÁUSULA #** – Na ocasião do encerramento da relação locatícia, seja por término do contrato, rescisão ou despejo, o imóvel deverá ser entregue {l:à LOCADORA|às LOCADORAS} livre e desocupado de pessoas ou coisas, de forma a poder ser imediatamente ocupado por outrem, sem depender de reparos, limpezas ou reformas, na mesma forma e condições de apresentação e conservação em que foi entregue ao LOCATÁRIO.

**CLÁUSULA #** – Responderá o LOCATÁRIO pelo incêndio do imóvel, se não provar caso fortuito ou força maior, vício de construção ou propagação de fogo originado de outro prédio.

[se residencial]**Parágrafo primeiro** – Diante da responsabilidade acima, o LOCATÁRIO autoriza desde já que seja feito o seguro de incêndio do imóvel locado, sendo seus prêmios e despesas por sua exclusiva conta, cobrados juntamente com o aluguel, já a partir do primeiro a vencer.[senão]**Parágrafo primeiro** – Diante da responsabilidade acima, o LOCATÁRIO deve apresentar apólice de cobertura de incêndio em até 30 (trinta) dias corridos da data de assinatura deste contrato ou contratá-la junto à administradora, sendo os prêmios e despesas por sua exclusiva conta, cobrados juntamente com o aluguel, já a partir do primeiro a vencer.[fim]

**Parágrafo segundo** – Até a data da emissão da apólice de seguro, responde o LOCATÁRIO[se fiador], solidariamente com {f:seu FIADOR|seus FIADORES},[fim] pelo incêndio do imóvel.

**CLÁUSULA #** – No caso de o imóvel ser colocado à venda, obedecido o direito de preferência do LOCATÁRIO na compra, conforme valor e condições apresentadas, este se obriga a permitir a visita de possíveis interessados, em horário de no mínimo duas horas diárias, nunca antes das 8h nem após as 20h.

**Parágrafo único** – Com o objetivo de defender o imóvel e acautelar sua integridade contra possíveis esbulhos e depredações, {l:fica a LOCADORA autorizada|ficam as LOCADORAS autorizadas} a tomar posse do imóvel independentemente de procedimento judicial prévio, se ficar comprovado o abandono do imóvel pelo LOCATÁRIO.

${CLAUSULAS_FCI}

## RENOVAÇÃO DO CONTRATO

**CLÁUSULA #** – O presente contrato poderá ser renovado, desde que haja concordância e interesse de ambas as partes.

**Parágrafo único** – No caso de renovação deste contrato, {l:a LOCADORA poderá|as LOCADORAS poderão} exigir novo contrato escrito e a substituição de garantias, se {l:entender|entenderem} que as anteriormente dadas não são suficientes.`;

const MULTA = (saida, honorarios) => `## MULTA CONTRATUAL

**CLÁUSULA #multa** – Fica estipulada a multa no valor de três meses de aluguel, a ser paga pela parte que infringir qualquer cláusula do contrato[se fiador], obrigando também {f:o FIADOR|os FIADORES} a pagar pelo LOCATÁRIO[fim][se caucao], autorizado o pagamento desta multa com o valor dado em caução[fim], inclusive no caso de despejo por falta de pagamento de aluguel, com a faculdade, para a parte inocente, de considerar simultaneamente rescindida a locação, independentemente de qualquer formalidade.

**Parágrafo primeiro** – A multa contratual será sempre devida integralmente, seja qual for o tempo decorrido do presente contrato e tantas vezes quantas forem as violações, além de a parte infratora arcar com todas as despesas e custas judiciais ou extrajudiciais, juros de mora e ${honorarios}.

**Parágrafo segundo** – No caso de desocupação do imóvel antes do fim do contrato, será cobrada ${saida}. A desocupação deverá ser comunicada por escrito, com 30 (trinta) dias de antecedência, por e-mail {l:à LOCADORA|às LOCADORAS}.`;

const RESCISAO = (horas) => `## RESCISÃO CONTRATUAL

**CLÁUSULA #** – Findo o prazo contratual e não tendo interesse na renovação da locação, ou havendo interesse na rescisão antes do término do prazo, assume o LOCATÁRIO o compromisso formal de comunicar por escrito {l:à LOCADORA|às LOCADORAS}, com 30 (trinta) dias de antecedência, a desocupação do imóvel. Caso não proceda desta forma, incidirá a multa prevista na cláusula {cl:multa}. O imóvel deverá ser entregue conforme a vistoria inicial.

**CLÁUSULA #** – Desocupado completamente o imóvel e devolvidas as chaves, {l:a LOCADORA terá|as LOCADORAS terão} o prazo de ${horas} úteis para providenciar a vistoria do imóvel. Para fins de acerto final, considera-se realizada a entrega do imóvel no momento em que ele esteja tal como na vistoria inicial.

**CLÁUSULA #** – O LOCATÁRIO, ao término da locação, obriga-se a apresentar, na entrega das chaves, a quitação de todos os impostos e taxas (contas de água e esgoto, luz, condomínio, IPTU etc.) que forem de sua responsabilidade durante a vigência da locação.

**CLÁUSULA #** – O presente contrato considerar-se-á rescindido de pleno direito, independentemente de qualquer formalidade judicial ou extrajudicial, nos casos de desapropriação, incêndio ou desabamento do imóvel locado[se fiador], bem como de falecimento ou insolvência do fiador, ou de sua transferência para outra localidade, se não for substituído em até 30 (trinta) dias por outro idôneo a critério {l:da LOCADORA|das LOCADORAS}, ficando neste caso o LOCATÁRIO em mora e sujeito a imediata ação de despejo[fim].`;

const GARANTIA = `[se fiador]## GARANTIA DO CONTRATO – {f:FIADOR|FIADORES}

**CLÁUSULA #** – {f:Assina o presente contrato o FIADOR|Assinam o presente contrato os FIADORES} {fiadores}, que {f:fica|ficam} como {f:responsável|responsáveis}, solidariamente com o LOCATÁRIO, por todas as cláusulas do presente contrato, como {f:fiador e principal pagador|fiadores e principais pagadores}, até a entrega real e definitiva das chaves do imóvel locado.

[se imovel_fiador]**Parágrafo único** – A título de registro, {f:o FIADOR declara ser proprietário do seguinte imóvel|os FIADORES declaram ser proprietários dos seguintes imóveis}: {fiadores_imoveis}.[fim]

**CLÁUSULA #** – O LOCATÁRIO nomeia e constitui {f:o FIADOR|os FIADORES} seu procurador, para fim especial, conjunta ou separadamente, de receber citações iniciais em ações de despejo ou de rescisão da locação e todas e quaisquer intimações ou notificações judiciais ou extrajudiciais referentes à presente locação, mandato este aceito com a assinatura do presente.[fim]

[se caucao]## GARANTIA DO CONTRATO – CAUÇÃO

**CLÁUSULA #** – O LOCATÁRIO concorda, desde já, em dar em caução, a título de garantia, o valor de {caucao_valor}, equivalente a {caucao_meses} meses de aluguel.

**Parágrafo único** – A cada 12 (doze) meses, concomitantemente ao reajuste estabelecido, o LOCATÁRIO pagará a diferença do reajuste, atualizando assim o valor da caução conforme o valor do aluguel.

**CLÁUSULA #** – O valor da caução será usado {l:pela LOCADORA|pelas LOCADORAS} em todas as hipóteses em que se fizerem necessários recursos do LOCATÁRIO e este não responda. Sendo aplicado, tal valor será imediatamente reposto pelo LOCATÁRIO.

**CLÁUSULA #** – Finda a locação, com a entrega das chaves e observados os requisitos deste contrato, assim como a entrega do imóvel nas mesmas condições em que lhe foi entregue, conforme vistoria, {l:a LOCADORA realizará|as LOCADORAS realizarão} o saque do montante depositado com os rendimentos apurados e o repassará ao LOCATÁRIO.

**CLÁUSULA #** – Na inobservância da cláusula {cl:vistoria}, {l:fica a LOCADORA autorizada|ficam as LOCADORAS autorizadas} a ser {l:indenizada|indenizadas} pelo valor depositado em caução, pelos danos, reparos e despesas pelos quais o LOCATÁRIO não responda.[fim]

[se deposito]## GARANTIA DO CONTRATO – DEPÓSITO

**CLÁUSULA #** – O LOCATÁRIO entrega, a título de depósito de garantia, o valor de {deposito_valor}[se deposito_uso], que será utilizado da seguinte forma: {deposito_uso}[fim].

**CLÁUSULA #** – Ao final da locação, o depósito será utilizado para quitar eventuais débitos, danos ou reparos de responsabilidade do LOCATÁRIO, e o saldo, se houver, lhe será devolvido.[fim]

[se seguro_fianca]## GARANTIA DO CONTRATO – SEGURO FIANÇA

**CLÁUSULA #** – A presente locação é garantida por seguro fiança locatícia, contratado pelo LOCATÁRIO e mantido vigente durante todo o prazo da locação e suas prorrogações, sob pena de rescisão deste contrato.[fim]`;

const FINAIS = (extra) => `## DISPOSIÇÕES FINAIS

[se residencial]**CLÁUSULA #** – DA REPRESENTAÇÃO PERANTE AS CONCESSIONÁRIAS DE SERVIÇOS PÚBLICOS: o LOCATÁRIO autoriza expressamente {l:a LOCADORA|as LOCADORAS} (ou seu administrador devidamente constituído) a representá-lo perante a Companhia Paranaense de Energia (COPEL) e a Companhia de Saneamento do Paraná (SANEPAR), para solicitar a alteração de titularidade das contas, pedidos de ligação, desligamento, religação, parcelamentos de débitos gerados no período da locação, segunda via de faturas e histórico de consumo, obrigando-se a fornecer a documentação necessária e a assinar os formulários exigidos, sob pena de responder por perdas e danos decorrentes do atraso na regularização das contas.[fim]

**CLÁUSULA #** – Tudo quanto for devido em razão deste contrato e que não comporte o processo executivo será cobrado em ação competente, ficando a cargo do devedor, em qualquer caso, os honorários do advogado que o credor constituir para o ressarcimento de seus débitos.
${extra}
**CLÁUSULA #** – O LOCATÁRIO[se fiador] e {f:o FIADOR|os FIADORES}[fim] aceitam como válidas todas as comunicações ou notificações enviadas por via postal com aviso de recebimento (AR) ou por mensagem eletrônica (e-mail).

**Parágrafo único** – As partes se obrigam a comunicar qualquer mudança de endereço, inclusive de endereço eletrônico.

## FORO

**CLÁUSULA #** – Para todas as questões oriundas deste contrato será competente o foro da situação do imóvel, com renúncia a qualquer outro, por mais especial que se apresente.

E por assim estarem justos e contratados, e após terem os contratantes lido e esclarecido todos os itens, cientes e de inteiro acordo com as condições e responsabilidades assumidas neste contrato, assinam em duas vias de igual teor e forma, obrigando-se ao seu fiel cumprimento não só os contratantes, como solidariamente seus herdeiros e sucessores a qualquer título.

> {cidade}, {data_assinatura}.

[assinaturas]`;

const CONDOMINIO = `[se nao_residencial]**CLÁUSULA #** – O LOCATÁRIO se obriga a cumprir as determinações do condomínio a que o imóvel pertence e seu regimento interno, principalmente no que se refere à manutenção da ordem e respeito ao condomínio, suas coisas e condôminos, ao silêncio após os horários determinados, à utilização de áreas comuns e privativas, aos horários de mudança e ao tratamento com os funcionários do condomínio, respondendo pelas despesas e danos causados por si e por outros sob sua responsabilidade.[fim]`;

/** Termo aditivo de troca do dia do vencimento, a pedido do inquilino (modelo C): campos e condições em dadosDoAditivo (contratos.js). */
const ADITIVO_VENCIMENTO = `# {numero_aditivo} TERMO ADITIVO AO CONTRATO DE LOCAÇÃO

## ALTERAÇÃO DO DIA DO VENCIMENTO

${PARTES}

As partes acima, já qualificadas no Contrato de Locação {finalidade} do imóvel {objeto}, firmado em {data_contrato}, resolvem, de comum acordo e a pedido do LOCATÁRIO, celebrar o presente Termo Aditivo, conforme o art. 18 da Lei nº 8.245/91, mediante as cláusulas a seguir:

**CLÁUSULA #** – O aluguel mensal e os demais encargos da locação passam a vencer todo dia {dia_vencimento_novo} de cada mês, e não mais no dia {dia_vencimento_anterior}, a partir do vencimento de {primeiro_vencimento}, referente ao mês de {mes_referencia}.

**CLÁUSULA #** – Muda apenas o dia do vencimento: cada pagamento continua se referindo ao [se mes_seguinte]mês anterior ao do vencimento[senão]próprio mês do vencimento[fim], sem cobrança ou desconto de dias por causa da alteração.

**CLÁUSULA #** – Esta alteração não modifica o valor do aluguel, a data-base e o índice de reajuste, nem o prazo da locação.[se bonificacao] A bonificação por pontualidade passa a valer para o pagamento feito até o novo dia do vencimento.[fim]

[se fiador]**CLÁUSULA #** – {f:O FIADOR declara|Os FIADORES declaram} estar de acordo com esta alteração e {f:mantém|mantêm} a fiança prestada no contrato de locação, nas mesmas condições.[fim]

**CLÁUSULA #** – Permanecem em vigor todas as demais cláusulas e condições do contrato de locação não alteradas por este Termo Aditivo, que passa a fazer parte integrante dele.

E por estarem de acordo, as partes assinam este Termo Aditivo em duas vias de igual teor e forma[se testemunhas], na presença das testemunhas abaixo[fim].

> {cidade}, {data_assinatura}.

[assinaturas]`;

/**
 * Garantia no termo de troca quando quem entra presta garantia nova (escolha na troca de titular): a caução ou o depósito
 * de quem sai é devolvido a ele (corrigido, descontados os débitos até a véspera); fiança ou seguro fiança de quem sai vale
 * só até a véspera; a garantia de quem entra é a do cadastro dele (caução, depósito, fiador, seguro fiança ou nenhuma).
 * Também entra nos modelos de troca já gravados (normalizar, em regras.js).
 */
export const GARANTIA_NOVA_TROCA = `[se garantia_anterior_dinheiro]**CLÁUSULA #** – A garantia prestada no contrato {a:pelo LOCATÁRIO SAINTE|pelos LOCATÁRIOS SAINTES}, {garantia_anterior}, não passa {s:ao LOCATÁRIO ENTRANTE|aos LOCATÁRIOS ENTRANTES}: será devolvida {a:ao LOCATÁRIO SAINTE|aos LOCATÁRIOS SAINTES}, com a correção prevista no contrato, descontados os débitos do período até {data_vespera} de sua responsabilidade.[fim]

[se garantia_anterior_fianca]**CLÁUSULA #** – A garantia prestada no contrato ({garantia_anterior}) responde só pelas obrigações do período até {data_vespera} e não se estende {s:ao LOCATÁRIO ENTRANTE|aos LOCATÁRIOS ENTRANTES}.[fim]

[se caucao]**CLÁUSULA #** – {s:O LOCATÁRIO ENTRANTE presta|Os LOCATÁRIOS ENTRANTES prestam}, como garantia da locação, caução em dinheiro de {caucao_valor}, correspondente a {caucao_meses} aluguéis, que será atualizada a cada reajuste anual do aluguel, conforme o contrato, e devolvida ao fim da locação, com os rendimentos, observadas as condições do contrato.[fim]

[se deposito]**CLÁUSULA #** – {s:O LOCATÁRIO ENTRANTE presta|Os LOCATÁRIOS ENTRANTES prestam}, como garantia da locação, depósito de garantia de {deposito_valor}, nas condições do contrato.[fim]

[se fiador]**CLÁUSULA #** – {f:O FIADOR declara|Os FIADORES declaram} conhecer e aceitar as condições do contrato e {f:garante|garantem} as obrigações {s:do LOCATÁRIO ENTRANTE|dos LOCATÁRIOS ENTRANTES}, solidariamente, como {f:fiador e principal pagador|fiadores e principais pagadores}, nas condições do contrato, até a entrega real e definitiva das chaves.[fim]

[se seguro_fianca]**CLÁUSULA #** – {s:O LOCATÁRIO ENTRANTE apresentará|Os LOCATÁRIOS ENTRANTES apresentarão}, em até 30 (trinta) dias, o seguro fiança locatícia em seu nome, sob pena de infração contratual.[fim]

[se sem_garantia]**CLÁUSULA #** – A partir de {data_troca}, a locação fica sem garantia.[fim]

**CLÁUSULA #** – {a:O LOCATÁRIO SAINTE|Os LOCATÁRIOS SAINTES} e {s:o LOCATÁRIO ENTRANTE|os LOCATÁRIOS ENTRANTES} declaram ciência de que a garantia prestada no contrato não continua na locação[se não sem_garantia] e é substituída pela garantia descrita acima[fim].`;

/**
 * Termo aditivo de troca de inquilino (herança do contrato): sai o titular anterior, entra o novo, com a anuência da
 * locadora (Lei 8.245/91, art. 13). Campos e condições em dadosDoAditivo (contratos.js); {a:...|...} = saintes, {s:...|...} = entrantes.
 * Débitos até a véspera ficam com quem sai (sem quitação). Garantia, conforme a escolha na troca: continua na locação e passa
 * a ser devolvida a quem entra, ou (garantia_nova) a de quem sai é devolvida a ele e quem entra presta a sua (GARANTIA_NOVA_TROCA).
 */
const ADITIVO_TROCA = `# {numero_aditivo} TERMO ADITIVO AO CONTRATO DE LOCAÇÃO

## SUBSTITUIÇÃO DO LOCATÁRIO (TRANSFERÊNCIA DO CONTRATO)

**#i. {l:LOCADORA|LOCADORAS}:** {locadoras}, doravante {l:denominada|denominadas} simplesmente {l:LOCADORA|LOCADORAS}.

**#i. {a:LOCATÁRIO SAINTE|LOCATÁRIOS SAINTES}:** {saintes}, doravante {a:denominado simplesmente LOCATÁRIO SAINTE|denominados simplesmente LOCATÁRIOS SAINTES}.

**#i. {s:LOCATÁRIO ENTRANTE|LOCATÁRIOS ENTRANTES}:** {entrantes}, doravante {s:denominado simplesmente LOCATÁRIO ENTRANTE|denominados simplesmente LOCATÁRIOS ENTRANTES}.

[se fiador]**#i. {f:FIADOR|FIADORES}:** {fiadores}, doravante {f:denominado|denominados} simplesmente {f:FIADOR|FIADORES}.[fim]

As partes acima qualificadas, de comum acordo, resolvem aditar o Contrato de Locação {finalidade} do imóvel {objeto}, firmado em {data_contrato}, para substituir o locatário, com o consentimento prévio e por escrito {l:da LOCADORA|das LOCADORAS} exigido pelo art. 13 da Lei nº 8.245/91, mediante as cláusulas a seguir:

## DA SUBSTITUIÇÃO DO LOCATÁRIO

**CLÁUSULA #** – A partir de {data_troca}, {a:o LOCATÁRIO SAINTE retira-se|os LOCATÁRIOS SAINTES retiram-se} da locação e {a:transfere|transferem} {s:ao LOCATÁRIO ENTRANTE|aos LOCATÁRIOS ENTRANTES} a sua posição no contrato, com todos os direitos e obrigações dele decorrentes. {s:O LOCATÁRIO ENTRANTE aceita e assume|Os LOCATÁRIOS ENTRANTES aceitam e assumem} a condição de {s:locatário|locatários} para todos os fins de direito, e {l:a LOCADORA consente|as LOCADORAS consentem} expressamente com esta transferência.

[se varios_entrantes]**Parágrafo único** – Os LOCATÁRIOS ENTRANTES respondem solidariamente entre si por todas as obrigações da locação (art. 2º da Lei nº 8.245/91).[fim]

**CLÁUSULA #** – Continuam as condições em vigor do contrato, inclusive o prazo da locação, que não recomeça com esta transferência[se indeterminado] (prazo indeterminado)[senão] e termina em {data_fim}[fim]: aluguel mensal de **{aluguel_atual}**[se bonificacao], com bonificação de {bonificacao_percentual} para pagamento até o vencimento[fim], com vencimento todo dia {dia_vencimento} de cada mês e reajuste anual pela variação d{indice}, no aniversário do contrato original.

## DOS DÉBITOS ATÉ A DATA DA TROCA

**CLÁUSULA #** – {a:O LOCATÁRIO SAINTE responde|Os LOCATÁRIOS SAINTES respondem} pelos aluguéis, encargos, contas de consumo (água, energia elétrica e gás), taxas de condomínio, IPTU e demais obrigações da locação referentes ao período até {data_vespera}, ainda que cobrados ou apurados depois desta data. A partir de {data_troca}, essas obrigações passam a ser {s:do LOCATÁRIO ENTRANTE|dos LOCATÁRIOS ENTRANTES}.

**Parágrafo único** – Este termo não dá quitação dos valores do período {a:do LOCATÁRIO SAINTE|dos LOCATÁRIOS SAINTES}, que poderão ser cobrados a qualquer tempo. Eventual acerto entre quem sai e quem entra sobre esses valores vale só entre eles e não obriga {l:a LOCADORA|as LOCADORAS}.

## DO ESTADO DO IMÓVEL

**CLÁUSULA #** – {s:O LOCATÁRIO ENTRANTE declara|Os LOCATÁRIOS ENTRANTES declaram} conhecer o estado de conservação do imóvel, conforme o relatório da vistoria de entrada que integra o contrato, e {s:assume|assumem} a obrigação de restituí-lo, ao fim da locação, no estado descrito nessa vistoria, ressalvado o desgaste natural pelo uso normal.

## DA GARANTIA

[se garantia_nova]${GARANTIA_NOVA_TROCA}[senão][se caucao]**CLÁUSULA #** – A caução de {caucao_valor} prestada no contrato continua depositada como garantia da locação e passa a garantir as obrigações {s:do LOCATÁRIO ENTRANTE|dos LOCATÁRIOS ENTRANTES}, sem prejuízo de seu uso para os débitos do período anterior a esta data. {a:O LOCATÁRIO SAINTE transfere|Os LOCATÁRIOS SAINTES transferem} {s:ao LOCATÁRIO ENTRANTE|aos LOCATÁRIOS ENTRANTES} o direito à devolução da caução, {a:declara|declaram} ter feito diretamente com {s:ele|eles} o acerto desse valor e nada ter a reclamar {l:da LOCADORA|das LOCADORAS} a esse respeito.

**Parágrafo único** – A caução continua a ser atualizada a cada reajuste anual do aluguel, conforme o contrato, e será devolvida {s:ao LOCATÁRIO ENTRANTE|aos LOCATÁRIOS ENTRANTES} ao fim da locação, com os rendimentos, observadas as condições do contrato.[fim]

[se deposito]**CLÁUSULA #** – O depósito de garantia de {deposito_valor} prestado no contrato continua como garantia da locação e passa a garantir as obrigações {s:do LOCATÁRIO ENTRANTE|dos LOCATÁRIOS ENTRANTES}, sem prejuízo de seu uso para os débitos do período anterior a esta data. {a:O LOCATÁRIO SAINTE transfere|Os LOCATÁRIOS SAINTES transferem} {s:ao LOCATÁRIO ENTRANTE|aos LOCATÁRIOS ENTRANTES} o direito ao saldo do depósito, {a:declara|declaram} ter feito diretamente com {s:ele|eles} o acerto desse valor e nada ter a reclamar {l:da LOCADORA|das LOCADORAS} a esse respeito.[fim]

[se fiador]**CLÁUSULA #** – {f:O FIADOR declara|Os FIADORES declaram} conhecer e aceitar a substituição do locatário e {f:garante|garantem} as obrigações {s:do LOCATÁRIO ENTRANTE|dos LOCATÁRIOS ENTRANTES}, solidariamente, como {f:fiador e principal pagador|fiadores e principais pagadores}, nas condições do contrato, até a entrega real e definitiva das chaves.[fim]

[se seguro_fianca]**CLÁUSULA #** – {s:O LOCATÁRIO ENTRANTE apresentará|Os LOCATÁRIOS ENTRANTES apresentarão}, em até 30 (trinta) dias, o seguro fiança locatícia em seu nome, ou o endosso da apólice em vigor, sob pena de infração contratual.[fim]

[se sem_garantia]**CLÁUSULA #** – A locação continua sem garantia, como no contrato.[fim][fim]

## DISPOSIÇÕES FINAIS

**CLÁUSULA #** – {s:O LOCATÁRIO ENTRANTE transferirá|Os LOCATÁRIOS ENTRANTES transferirão} para o seu nome, em até 30 (trinta) dias, a titularidade das contas de consumo que estejam a seu cargo no contrato, com a colaboração {a:do LOCATÁRIO SAINTE|dos LOCATÁRIOS SAINTES}.[se seguro_inquilino] O seguro contra incêndio em vigor continua até o fim da apólice e será renovado em nome {s:do LOCATÁRIO ENTRANTE|dos LOCATÁRIOS ENTRANTES}.[fim]

**CLÁUSULA #** – Permanecem em vigor todas as demais cláusulas e condições do contrato de locação não alteradas por este Termo Aditivo, que passa a fazer parte integrante dele.

E por estarem de acordo, as partes assinam este Termo Aditivo em vias de igual teor e forma, uma para cada parte[se testemunhas], na presença das testemunhas abaixo[fim].

> {cidade}, {data_assinatura}.

[assinaturas]`;

/** ``tipo``: "aditivo" (troca do vencimento) e "aditivo_troca" (troca de inquilino) para os termos aditivos (sem tipo: contrato). */
export const MODELOS_PADRAO = [
  {
    nome: 'Residencial',
    texto: `# CONTRATO DE LOCAÇÃO RESIDENCIAL

${PARTES}

${ITENS}

${ALUGUEL('honorários advocatícios de 25% (vinte e cinco por cento)')}

${CONSERVACAO}

${RESTITUICAO}

${MULTA('a multa de 3 (três) meses de aluguel, proporcional ao tempo restante do contrato', 'honorários de advogado de 25% (vinte e cinco por cento) sobre o valor da ação')}

${RESCISAO('72 (setenta e duas) horas')}

${GARANTIA}

${FINAIS('')}`,
  },
  {
    nome: 'Não residencial (comercial)',
    texto: `# CONTRATO DE LOCAÇÃO NÃO RESIDENCIAL

${PARTES}

${ITENS}

${ALUGUEL('honorários de advogado')}

${CONSERVACAO}

${CONDOMINIO}

${RESTITUICAO}

${MULTA('a multa proporcional de 10% (dez por cento) sobre o tempo restante do contrato', 'honorários de advogado')}

${RESCISAO('48 (quarenta e oito) horas')}

${GARANTIA}

${FINAIS(`
**CLÁUSULA #** – O LOCATÁRIO[se fiador] e {f:o FIADOR|os FIADORES}[fim] ficam cientes de que a administradora do imóvel é associada ao SERASA e ao SCPC e incluirá no cadastro de inadimplentes todo atraso de pagamento de aluguéis e encargos vencidos.
`)}`,
  },
  {
    nome: 'Aditivo de vencimento (a pedido do inquilino)',
    tipo: 'aditivo',
    texto: ADITIVO_VENCIMENTO,
  },
  {
    nome: 'Aditivo de troca de inquilino (herança do contrato)',
    tipo: 'aditivo_troca',
    texto: ADITIVO_TROCA,
  },
];
