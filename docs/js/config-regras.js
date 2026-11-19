// Regras do sistema escolhidas pelo administrador (Dados e backup → Regras do sistema): definição, padrão do sistema e valor em uso.
// O padrão de cada regra (PADRAO_SISTEMA) é a regra do dono, fixa no código ("padrão de fábrica"): sem nada escolhido, vale ela.
// O que o administrador muda fica na tabela `config_regras` (uma linha por regra diferente do padrão); versões salvas em `versoes_regras`.
// Regras especiais (`perfis_regras`): grupos com nome que um contrato pode seguir no lugar das do sistema (`regra(chave, contrato)`).
// Sem dependências (calculos.js importa daqui). `usarRegras(d)` é chamado por `normalizar` e ao salvar as regras.

/** Grupos da tela, na ordem. */
export const GRUPOS_REGRAS = [
  ['aluguel', 'Aluguel e cobrança'],
  ['garantia', 'Garantia e FCI'],
  ['contrato', 'Novo contrato (valores que vêm preenchidos)'],
  ['rotina', 'Régua de cobrança e prazos de rotina'],
];

const LI = 'Lei do Inquilinato (Lei 8.245/91)';

/**
 * Cada regra: chave, grupo, rótulo, tipo (opcao, simnao, inteiro, pct, dinheiro, indice, feriados, regua, dias), padrão do sistema,
 * `explica` (o que faz, com exemplo), `consequencia` (o que muda ao trocar), `lei` (fundamento) e, nas de opção, cada opção com
 * [valor, rótulo, explicação e se é legal]. Dinheiro em centavos; percentual como número (2 = 2%).
 */
export const DEFINICOES_REGRAS = [
  // ------------------------------------------------------------------ aluguel
  { chave: 'reajuste_inicio', grupo: 'aluguel', rotulo: 'Mês do reajuste anual', tipo: 'opcao', padrao: 'mes_entrada',
    opcoes: [
      ['mes_entrada', 'O mês de entrada conta como 1º mês (padrão do sistema)', 'Entrada em 20/03/2026 → o aluguel de 03/2027 já vem corrigido. Legal, com risco pequeno: os dias 01 a 19/03/2027 pagam o valor novo pouco antes de completar 1 ano (Lei 10.192/2001, art. 2º, §1º: reajuste com menos de 1 ano é nulo). A diferença é de centavos.'],
      ['mes_seguinte', 'Sugestão: entrada depois do dia 1º, o 1º mês é o seguinte', 'Entrada em 20/03/2026 → o aluguel de 04/2027 é o 1º corrigido; entrada em 01/03/2026 → o de 03/2027. Legal e sem risco: o reajuste nunca vem antes de 1 ano (Lei 10.192/2001, art. 2º, §1º).'],
    ],
    explica: 'Em qual aluguel entra o reajuste de cada ano.',
    consequencia: 'Vale para os reajustes ainda não aplicados de todos os contratos (alerta, tela Reajustes e carta). Os já aplicados não mudam.',
    lei: 'Lei 10.192/2001, art. 2º, §1º (periodicidade mínima de 1 ano); ' + LI + ', art. 18 (o reajuste é o combinado no contrato).' },
  { chave: 'feriados_locais', grupo: 'aluguel', rotulo: 'Feriados da cidade (além dos nacionais)', tipo: 'feriados', padrao: [],
    explica: 'Vencimento em sábado, domingo ou feriado pode ser pago no próximo dia útil sem multa e juros, com a bonificação. O sistema já conhece os feriados nacionais; aqui entram os da cidade ou do estado. Um por linha: "20/01" (todo ano) ou "15/06/2028" (só naquele ano). Ex.: vence em 20/01 (feriado da cidade) → em dia até 21/01.',
    consequencia: 'Muda o último dia para pagar em dia, quando um boleto fica vencido e a inadimplência. Use os feriados da cidade da agência ou do pagador, como faz o banco.',
    lei: 'Código Civil, art. 132, §1º (prazo que vence em feriado passa ao dia útil seguinte). A prorrogação em si não é opção: o banco sempre aceita sem multa no dia útil seguinte.' },
  { chave: 'base_multa', grupo: 'aluguel', rotulo: 'Sobre o que incidem multa e juros do atraso', tipo: 'opcao', padrao: 'boleto',
    opcoes: [
      ['boleto', 'Sobre o boleto inteiro: aluguel cheio, IPTU, seguro e tarifa (padrão do sistema)', 'Boleto de R$ 2.300,00 (aluguel R$ 2.000,00 + IPTU R$ 200,00 + seguro R$ 100,00), multa de 2% = R$ 46,00. Legal: IPTU e seguro são encargos do inquilino e também ficam em atraso (Lei 8.245/91, art. 23, I, e art. 25); o contrato deve dizer que a multa é sobre o total.'],
      ['aluguel', 'Só sobre o aluguel cheio', 'Mesmo boleto: multa de 2% sobre R$ 2.000,00 = R$ 40,00. Legal e mais conservador. No C6 a multa e os juros vão em reais (valor fixo), não em %.'],
    ],
    explica: 'O FCI fica sempre fora da multa e dos juros.',
    consequencia: 'Vale para os pagamentos registrados e os boletos emitidos no banco daqui em diante. Boleto já emitido no C6 continua com a multa com que saiu.',
    lei: LI + ', arts. 23, I, e 25; Código Civil, art. 395 (o devedor em atraso responde pelos prejuízos, juros e multa).' },
  { chave: 'proporcional', grupo: 'aluguel', rotulo: 'Aluguel proporcional (mês de entrada e de saída)', tipo: 'opcao', padrao: 'mes_30',
    // decisão do dono em 17/11/2026: "considere todos os meses como 30 dias" (antes o padrão eram os dias reais)
    opcoes: [
      ['mes_30', 'Mês comercial de 30 dias (padrão do sistema)', 'Todo mês vale 30 dias: o dia 31 não conta e o último dia de fevereiro completa 30. Aluguel R$ 2.000,00: entrada em 15/02 = 16/30 = R$ 1.066,67; saída em 27/02 = 27/30 = R$ 1.800,00; saída em 28/02 (ano não bissexto) = mês inteiro, R$ 2.000,00; entrada em 02/01 = 29/30; entrada no último dia do mês (31/01) = 1/30. Legal, se estiver no contrato; é a prática do mercado.'],
      ['dias_reais', 'Pelos dias reais do mês', 'Entrada em 15/02/2027, aluguel R$ 2.000,00: 14 dias de 28 = R$ 1.000,00. Legal: não há lei sobre a conta.'],
    ],
    explica: 'Como se calcula o aluguel dos dias ocupados no mês de entrada e no de saída.',
    consequencia: 'Vale para os boletos gerados ou recalculados daqui em diante; boleto pago, alterado à mão ou emitido no banco não muda. O IPTU e o FCI do mês continuam pelos dias reais.',
    lei: 'Sem lei específica: vale o combinado no contrato (' + LI + ', art. 17).' },
  { chave: 'ressarcimento_na_nf', grupo: 'aluguel', rotulo: 'Ressarcimento de condomínio sai do valor da NF', tipo: 'simnao', padrao: false,
    explica: 'Taxas do proprietário pagas pelo inquilino no condomínio (fundo de obras etc.) voltam para ele no boleto do aluguel. Não (padrão): a NF sai com o aluguel cheio e o ressarcimento conta como gasto do imóvel nos Resultados. Sim: a NF fica com o aluguel menos a taxa e ela não conta de novo como gasto. Ex.: aluguel R$ 1.215,00 e fundo de obras R$ 150,00 → NF de R$ 1.215,00 (não) ou de R$ 1.065,00 (sim).',
    consequencia: 'Vale para os boletos em aberto que têm ressarcimento e para os gerados daqui em diante; os pagos não mudam. Confirme com o contador qual forma usar.',
    lei: 'Sem lei específica: é a forma de escriturar o ressarcimento (' + LI + ', art. 22, parágrafo único: despesas extraordinárias do condomínio são do locador).' },
  { chave: 'dia_gerar_boletos', grupo: 'aluguel', rotulo: 'Dia de gerar os boletos do mês', tipo: 'inteiro', padrao: 20, min: 1, max: 28,
    explica: 'A partir deste dia o fechamento do mês pede para gerar os boletos do próprio mês (que vencem no mês seguinte). Ex.: dia 20 → a partir de 20/10, os de 10/2026.',
    consequencia: 'Muda só quando a etapa "Gerar boletos" do fechamento aparece.',
    lei: 'Sem lei: é rotina do escritório.' },

  // ------------------------------------------------------------------ garantia
  { chave: 'caucao_base', grupo: 'garantia', rotulo: 'Valor da caução: base do cálculo', tipo: 'opcao', padrao: 'bonificado',
    opcoes: [
      ['bonificado', 'Aluguel com bonificação (padrão do sistema)', '3 × R$ 1.800,00 = R$ 5.400,00. Legal e seguro: fica dentro do limite de 3 aluguéis em qualquer leitura (Lei 8.245/91, art. 38, §2º).'],
      ['cheio', 'Aluguel cheio', '3 × R$ 2.000,00 = R$ 6.000,00. Risco: se o juiz entender que o aluguel é o pago em dia (R$ 1.800,00), passa de 3 aluguéis, o que a lei proíbe (art. 38, §2º) e é contravenção (art. 43, I); o excesso teria de ser devolvido.'],
    ],
    explica: 'Caução sugerida = número de aluguéis do contrato × este aluguel. Sem bonificação no contrato, os dois dão o aluguel cheio.',
    consequencia: 'Vale para a caução sugerida em contratos novos e para o complemento depois dos reajustes. Caução já depositada não muda.',
    lei: LI + ', art. 38, §2º (caução em dinheiro até 3 meses de aluguel) e art. 43, I.' },
  { chave: 'caucao_acompanha', grupo: 'garantia', rotulo: 'A caução acompanha o reajuste do aluguel', tipo: 'simnao', padrao: true,
    explica: 'Sim: depois do reajuste, a diferença vira boleto à parte ou depósito do inquilino ("Caução a completar" na tela Reajustes). Ex.: caução de R$ 5.400,00, aluguel bonificado passa a R$ 1.881,00 → complemento de R$ 243,00.',
    consequencia: 'Não: a caução fica com o valor do início e a tela Reajustes deixa de pedir o complemento.',
    lei: 'Legal nos dois casos, se o contrato prevê. O total nunca deve passar de 3 aluguéis atuais (' + LI + ', art. 38, §2º).' },
  { chave: 'caucao_limite_aviso', grupo: 'garantia', rotulo: 'Avisar quando a caução passar de quantos aluguéis', tipo: 'inteiro', padrao: 3, min: 1, max: 12,
    explica: 'Ao salvar o contrato, o sistema avisa (não proíbe) se a caução ou o depósito de garantia passa deste número de aluguéis.',
    consequencia: 'Só muda o aviso. Acima de 3 é ilegal para caução em dinheiro (art. 38, §2º) e pedir mais do que a lei permite é contravenção (art. 43, I).',
    lei: LI + ', art. 38, §2º e art. 43, I.' },
  { chave: 'aviso_fiador_deposito', grupo: 'garantia', rotulo: 'Avisar ao escolher "Fiador + depósito"', tipo: 'simnao', padrao: true,
    explica: 'A garantia "Fiador + depósito" continua permitida. Com o aviso ligado, ao salvar aparece a explicação do risco.',
    consequencia: 'A lei (art. 37) lista caução, fiança, seguro fiança e cessão de quotas; os tribunais costumam tratar o depósito em dinheiro como caução (art. 38, §2º). Aí fiador + depósito pode ser visto como duas garantias, o que o art. 37, parágrafo único, proíbe: risco de ter de devolver o depósito e de contravenção (art. 43, II).',
    lei: LI + ', art. 37, parágrafo único, e art. 43, II.' },
  { chave: 'fci_percentual_padrao', grupo: 'garantia', rotulo: 'FCI (fundo de conservação): % que vem preenchido', tipo: 'pct', padrao: null, min: 0, max: 100,
    explica: 'Em branco: o Novo contrato vem sem FCI. Ex.: 5% de R$ 1.800,00 = R$ 90,00 por mês no boleto, guardados para os reparos na saída.',
    consequencia: 'Só muda o que vem preenchido no Novo contrato; cada contrato continua com o seu.',
    lei: 'Sem lei própria. Risco: ser visto como segunda garantia (' + LI + ', art. 37, parágrafo único); o contrato diz que o FCI não é garantia e só paga danos.' },
  { chave: 'fci_indice_padrao', grupo: 'garantia', rotulo: 'FCI: índice de correção que vem preenchido', tipo: 'opcao', padrao: '',
    opcoes: [['', 'Escolher em cada contrato', 'O campo vem vazio.'], ['Poupança', 'Poupança', ''], ['IPCA', 'IPCA', ''], ['IGP-M', 'IGP-M', ''], ['INPC', 'INPC', ''], ['IGP-DI', 'IGP-DI', ''], ['SELIC', 'SELIC', '']],
    explica: 'Índice do Banco Central que corrige o saldo do FCI mês a mês.', consequencia: 'Só muda o que vem preenchido no Novo contrato.', lei: 'Sem lei: vale o contrato.' },

  // ------------------------------------------------------------------ contrato
  { chave: 'prazo_residencial_padrao', grupo: 'contrato', rotulo: 'Prazo do contrato residencial (meses)', tipo: 'inteiro', padrao: 30, min: 1, max: 600,
    explica: 'Vem preenchido no Novo contrato residencial. Ao salvar um residencial com menos de 30 meses, o sistema avisa.',
    consequencia: 'Com 30 meses ou mais, no fim do contrato o locador pode pedir o imóvel sem dar motivo (art. 46). Com menos, o contrato se prorroga e só se retoma nos casos da lei ou depois de 5 anos (art. 47). Legal nos dois casos.',
    lei: LI + ', arts. 46 e 47.' },
  { chave: 'prazo_comercial_padrao', grupo: 'contrato', rotulo: 'Prazo do contrato não residencial (meses)', tipo: 'inteiro', padrao: null, min: 1, max: 600,
    explica: 'Em branco: digitar em cada contrato.',
    consequencia: 'Com 5 anos ou mais (somando os contratos seguidos), o inquilino ganha o direito de pedir a renovação na Justiça, entre 1 ano e 6 meses antes do fim (art. 51). Legal.',
    lei: LI + ', art. 51.' },
  { chave: 'indice_padrao', grupo: 'contrato', rotulo: 'Índice de reajuste que vem preenchido', tipo: 'indice', padrao: '',
    explica: 'Em branco: escolher em cada contrato (lista de índices do Novo contrato).',
    consequencia: 'Só muda o que vem preenchido. O índice é livre, mas precisa estar no contrato. O IGP-M teve picos de mais de 30% em 12 meses (2021); o IPCA costuma ser o mais aceito.',
    lei: LI + ', arts. 17 e 18; Lei 10.192/2001, art. 2º.' },
  { chave: 'bonificacao_padrao', grupo: 'contrato', rotulo: 'Novo contrato com bonificação por pontualidade', tipo: 'simnao', padrao: true,
    explica: 'Bonificação = desconto para quem paga até o vencimento. Ex.: aluguel R$ 2.000,00 com 10% → R$ 1.800,00 em dia; atrasado paga R$ 2.000,00 mais multa e juros.',
    consequencia: 'Só muda o que vem marcado no Novo contrato.',
    lei: 'Legal. O STJ aceitou desconto de pontualidade junto com multa (REsp 1.745.916, 2019, caso de escola); alguns tribunais estaduais já trataram como "multa dobrada". Desconto moderado e chamado de bonificação no contrato diminui o risco.' },
  { chave: 'bonificacao_percentual_padrao', grupo: 'contrato', rotulo: 'Bonificação: % que vem preenchido', tipo: 'pct', padrao: null, min: 0, max: 100,
    explica: 'Em branco: digitar o aluguel bonificado ou o % em cada contrato.', consequencia: 'Só muda o que vem preenchido.', lei: 'Ver a bonificação acima.' },
  { chave: 'bonificacao_limite_aviso', grupo: 'contrato', rotulo: 'Avisar quando a bonificação passar de (%)', tipo: 'pct', padrao: 10, min: 0, max: 100,
    explica: 'Ao salvar o contrato, o sistema avisa (não proíbe) se a bonificação passa deste %.',
    consequencia: 'Só muda o aviso. Quanto maior o desconto, maior o risco de um juiz ver a perda do desconto como uma segunda multa e reduzir a cobrança (Código Civil, art. 413).',
    lei: 'Código Civil, art. 413; REsp 1.745.916 (STJ, 2019).' },
  { chave: 'multa_padrao', grupo: 'contrato', rotulo: 'Multa por atraso (%) que vem preenchida', tipo: 'pct', padrao: 2, min: 0, max: 100,
    explica: 'Ex.: boleto de R$ 2.000,00 pago atrasado → multa de 2% = R$ 40,00. Acima de 10%, o sistema avisa ao salvar o contrato.',
    consequencia: 'Só muda o que vem preenchido. O limite de 2% do Código do Consumidor em regra não vale para aluguel; até 10% é aceito (Lei de Usura, art. 9º); acima disso o juiz pode reduzir (Código Civil, art. 413). 2% é o mais seguro e o que o banco usa.',
    lei: 'Decreto 22.626/33 (Lei de Usura), art. 9º; Código Civil, arts. 412 e 413.' },
  { chave: 'juros_padrao', grupo: 'contrato', rotulo: 'Juros por atraso (% ao mês) que vêm preenchidos', tipo: 'pct', padrao: 1, min: 0, max: 100,
    explica: 'Contados por dia, como no banco. Ex.: R$ 2.000,00 com 1% ao mês, 10 dias → R$ 0,66 por dia × 10 = R$ 6,60. Acima de 1% ao mês, o sistema avisa ao salvar.',
    consequencia: 'Só muda o que vem preenchido. Com inquilino pessoa física, acima de 1% ao mês pode ser reduzido (Lei de Usura, art. 1º; Código Civil, art. 406).',
    lei: 'Código Civil, art. 406 (com a Lei 14.905/2024); Decreto 22.626/33, art. 1º.' },
  { chave: 'mes_seguinte_padrao', grupo: 'contrato', rotulo: 'O aluguel do mês vence no mês seguinte', tipo: 'simnao', padrao: true,
    explica: 'Sim: o aluguel de julho vence em agosto (paga-se depois de usar).',
    consequencia: 'Não: o aluguel de julho vence em julho. Cobrar antes de usar é proibido quando há garantia (art. 20; só é permitido sem garantia, art. 42, ou na temporada) e é contravenção (art. 43, III).',
    lei: LI + ', arts. 20, 42 e 43, III.' },
  { chave: 'tarifa_padrao', grupo: 'contrato', rotulo: 'Tarifa do boleto cobrada do inquilino (R$) que vem preenchida', tipo: 'dinheiro', padrao: null, min: 0,
    explica: 'Em branco: sem tarifa. Ex.: R$ 3,50 por boleto.',
    consequencia: 'Só muda o que vem preenchido. Os tribunais divergem sobre repassar a tarifa do banco ao inquilino: só com cláusula clara no contrato.',
    lei: LI + ', art. 22, VII (despesas de administração são do locador).' },
  { chave: 'conta_iptu_padrao', grupo: 'contrato', rotulo: 'IPTU que vem preenchido', tipo: 'opcao', padrao: 'Por conta do inquilino',
    opcoes: [['Por conta do inquilino', 'Por conta do inquilino (padrão do sistema)', 'As parcelas entram no boleto, proporcionais aos dias ocupados. Legal com cláusula no contrato (arts. 22, VIII, e 25).'],
      ['Incluso no aluguel', 'Incluso no aluguel', 'O locador paga. Legal.'], ['Não tem', 'Não tem', 'Imóvel sem IPTU.']],
    explica: 'Quem paga o IPTU nos contratos novos.', consequencia: 'Só muda o que vem preenchido.', lei: LI + ', art. 22, VIII, e art. 25.' },
  { chave: 'conta_seguro_padrao', grupo: 'contrato', rotulo: 'Seguro contra incêndio que vem preenchido', tipo: 'opcao', padrao: 'Por conta do inquilino',
    opcoes: [['Por conta do inquilino', 'Por conta do inquilino (padrão do sistema)', 'Legal com cláusula expressa no contrato (art. 22, VIII).'],
      ['Incluso no aluguel', 'Incluso no aluguel', 'O locador paga, como diz a lei quando o contrato não fala nada. Legal.'], ['Não tem', 'Não tem', 'Risco: o imóvel fica sem seguro.']],
    explica: 'Quem paga o seguro obrigatório nos contratos novos.', consequencia: 'Só muda o que vem preenchido.', lei: LI + ', art. 22, VIII.' },

  // ------------------------------------------------------------------ rotina
  { chave: 'regua_cobranca', grupo: 'rotina', rotulo: 'Régua de cobrança', tipo: 'regua',
    padrao: [{ dias: 1, passo: 'Mandar o lembrete por e-mail' }, { dias: 10, passo: 'Ligar para o inquilino' }, { dias: 30, passo: 'Avaliar a negativação' }],
    explica: 'O que fazer pelo atraso do boleto vencido mais antigo (só aviso, nada é enviado sozinho). Um passo por linha: "dias: o que fazer". Ex.: "10: Ligar para o inquilino".',
    consequencia: 'Muda o passo mostrado no alerta e na tela Inadimplência. Cobrar sem ameaçar nem expor o devedor; para negativar, o órgão avisa a pessoa antes.',
    lei: 'CDC, art. 42 e art. 43, §2º; Súmula 359 do STJ; LGPD, art. 7º, X (dados para proteção do crédito).' },
  // régua por e-mail (pedido do dono em 2026-11-16): o sistema prepara, o administrador autoriza um a um (regua-email.js, #/regua)
  { chave: 'regua_email_dias', grupo: 'rotina', rotulo: 'Régua de cobrança: quando preparar o e-mail ao inquilino', tipo: 'dias', padrao: [-3, 0, 3, 10], min: -30, max: 60,
    explica: 'Dias em relação ao vencimento do boleto, separados por vírgula: número negativo é antes, 0 é no dia, positivo é depois. Ex.: "-3, 0, 3, 10" → boleto que vence em 10/12: lembrete em 07/12, "vence hoje" em 10/12 e cobrança de atraso em 13/12 e 20/12. O e-mail fica em "E-mails da régua" (botão no alto da tela Boletos) esperando a sua autorização: nada é enviado sozinho. A cobrança de atraso só aparece passados 3 dias úteis do último dia para pagar, o prazo que o banco leva para creditar o boleto (quem pagou no dia não recebe cobrança). Em branco: nenhum e-mail é preparado.',
    consequencia: 'Só muda quando o e-mail aparece na lista. Boleto pago, em acordo ou de contrato encerrado sai da lista sozinho; e-mail já enviado ou marcado "Não enviar" não volta.',
    lei: 'CDC, art. 42 (cobrança sem constranger nem ameaçar); LGPD, art. 7º, V (dados usados para cumprir o contrato).' },
  { chave: 'regua_envio', grupo: 'rotina', rotulo: 'Régua de cobrança: botão "Autorizar e enviar" pelo Gmail da empresa', tipo: 'simnao', padrao: false,
    explica: 'Não (padrão): os e-mails da régua ficam prontos na lista e você abre cada um no Gmail (ou copia o texto) para mandar por lá. Sim: aparece também o botão "Autorizar e enviar", que manda pelo Gmail da empresa (só na nuvem, com o Gmail ligado). Mesmo ligado, nada sai sem o clique do administrador.',
    consequencia: 'Sim: o e-mail sai na hora do clique, com o boleto e o QR Code do Pix anexados, e fica em "Enviados" no Gmail. Não: o envio é sempre feito à mão pelo Gmail.',
    lei: 'CDC, art. 42; LGPD, art. 7º, V.' },
  { chave: 'meses_documentos_ficha', grupo: 'rotina', rotulo: 'Ficha reprovada: apagar os documentos depois de (meses)', tipo: 'inteiro', padrao: 3, min: 1, max: 24,
    explica: 'Os documentos pessoais da ficha reprovada são apagados este número de meses depois da decisão.',
    consequencia: 'Prazo maior guarda dados sem necessidade, o que a LGPD manda evitar; prazo curto pode apagar o que ainda seria útil numa reclamação.',
    lei: 'LGPD (Lei 13.709/2018), art. 6º, III, e arts. 15 e 16.' },
  // pasta de papel de cada inquilino (decisão do dono em 2026-11-15: começa ligada)
  { chave: 'arquivo_impresso', grupo: 'rotina', rotulo: 'Arquivo impresso (pasta física de cada inquilino)', tipo: 'simnao', padrao: true,
    explica: 'O sistema diz o que imprimir para a pasta de papel do inquilino: no fim da entrada (etapa "Montar a pasta física"), quando chega documento novo importante (termo aditivo, carta de reajuste, termo de acordo, notificação) e na saída, e guarda o que já está em papel. Ex.: Ana assina o termo aditivo nº 2 em 10/02/2027 → aviso "1 documento novo para a pasta física".',
    consequencia: 'Não: some a etapa da entrada, os avisos e a lista Arquivo impresso; a saída volta à etapa simples "Arquivo físico" (marcada à mão). O que já foi marcado como impresso fica guardado e volta se religar.',
    lei: 'Código Civil, art. 205 (prazo geral de 10 anos: por isso a pasta fica guardada 10 anos depois da saída); LGPD (Lei 13.709/2018), arts. 6º, III, e 46 (guardar só o necessário e com segurança, também no papel: a pasta não leva documentos de renda).' },
  // decisão do dono em 2026-11-16: compactar sozinho ao anexar, sem perguntar e sem guardar o original (compactar.js)
  { chave: 'compactar_anexos', grupo: 'rotina', rotulo: 'Compactar anexos (fotos e PDFs escaneados)', tipo: 'simnao', padrao: true,
    explica: 'Ao anexar, o sistema diminui sozinho as fotos e os PDFs escaneados, sem perguntar e sem guardar o original. Ex.: foto do RG de 4 MB → cerca de 400 KB; PDF escaneado de 10 páginas com 12 MB → cerca de 1,5 MB, ainda legível. PDF com texto (gerado pelo banco, por um sistema ou pelo Word) fica como está, e PDF com assinatura digital (gov.br, ICP-Brasil, banco) nunca é mexido. Os documentos que a pessoa manda pelo link da ficha são compactados depois que chegam: quando a ficha é aberta, o sistema primeiro faz a conferência de montagem (que olha dentro do arquivo como ele chegou), guarda o resultado na ficha e só então compacta. Os que já estavam no sistema: botão "Compactar os anexos" em Dados e backup.',
    consequencia: 'Não: os arquivos são guardados como chegaram (ocupam mais espaço e demoram mais para abrir no celular). Os que já foram compactados não voltam ao tamanho de antes.',
    lei: 'Sem lei: rotina. O documento assinado digitalmente não é mexido porque qualquer mudança no arquivo invalida a assinatura (MP 2.200-2/2001 e Lei 14.063/2020).' },
  // mutirão 3000 (venda 49, 2026-11-17): era obrigatória fixa no código; o padrão continua obrigatória
  { chave: 'leitura_relogios_obrigatoria', grupo: 'rotina', rotulo: 'Leitura dos relógios (água, energia e gás) obrigatória na vistoria', tipo: 'simnao', padrao: true,
    explica: 'Sim (padrão): a vistoria de entrada, a de saída e o cálculo final da saída só salvam com a leitura de cada relógio que o contrato tem (o que está "Não tem" fica de fora; sem a informação, água e energia). A etapa "Contas" da saída só fecha com a leitura da saída. Ex.: vistoria de saída em 30/11/2026 sem a leitura da água → o sistema pede "Informe a leitura do relógio de água". Não: a leitura continua na vistoria e no cálculo final, mas pode ficar em branco (quem não usa relógio próprio ou cobra a conta por rateio).',
    consequencia: 'Não: sem a leitura não há prova do consumo até a entrega das chaves; conta de água ou luz que chegar depois, com consumo do inquilino, fica mais difícil de cobrar dele (e o proprietário pode acabar pagando). Leituras já gravadas não mudam.',
    lei: LI + ', art. 23, VIII (o inquilino paga a água, a luz e o gás que consumir) e art. 23, III (devolver o imóvel no estado em que recebeu); Código de Processo Civil, art. 373, I (quem cobra precisa provar: a leitura no dia da entrega é a prova do consumo). A lei não obriga a leitura: é prova.' },
  { chave: 'dias_ficha_parada', grupo: 'rotina', rotulo: 'Ficha pela internet: avisar link sem resposta depois de (dias)', tipo: 'inteiro', padrao: 2, min: 1, max: 7,
    explica: 'Link da ficha mandado e sem nenhum dado ou documento depois deste número de dias vira alerta no Painel, com o botão "Lembrar". O link vale 7 dias.',
    consequencia: 'Só muda o alerta: nada é mandado sem alguém apertar o botão.', lei: 'Sem lei: rotina.' },
  { chave: 'dias_antecipacao_banco', grupo: 'rotina', rotulo: 'Extrato: no aviso "Pix sem identificação", contar boletos que vencem até quantos dias depois', tipo: 'inteiro', padrao: 45, min: 1, max: 120,
    explica: 'Só para o aviso: entrada sem o código do boleto nunca é ligada sozinha (decisão de 17/11/2026); o aviso diz quantos boletos têm o mesmo valor. Ex.: entrada de 10/08 → conta os boletos com vencimento até 24/09 (pagamento adiantado).', consequencia: 'Mais dias: o aviso conta mais boletos possíveis. Nada é ligado nem marcado sozinho.', lei: 'Sem lei: rotina.' },
  { chave: 'tolerancia_boleto_dias', grupo: 'rotina', rotulo: 'Extrato: entrada casa com o boleto até quantos dias depois do vencimento', tipo: 'inteiro', padrao: 3, min: 0, max: 30,
    explica: 'Entrada com o valor em dia até tantos dias depois do vencimento ainda conta como em dia. Ex.: 3 → vence dia 10, entrou dia 13.', consequencia: 'Mais dias: mais pagamentos atrasados pelo valor em dia contam como em dia. Só muda as contas e o aviso: nada é registrado sem a sua confirmação, e sem o código do boleto nada é ligado sozinho.', lei: 'Sem lei: rotina.' },
  { chave: 'dias_alerta_banco', grupo: 'rotina', rotulo: 'Alerta de movimentação do extrato sem destino depois de (dias)', tipo: 'inteiro', padrao: 7, min: 1, max: 90,
    explica: 'Movimentação sem destino há mais dias que isto vira alerta no Painel.', consequencia: 'Só muda o alerta.', lei: 'Sem lei: rotina.' },
  { chave: 'dias_extrato_recente', grupo: 'rotina', rotulo: 'Fechamento: extrato buscado há até (dias)', tipo: 'inteiro', padrao: 7, min: 0, max: 31,
    explica: 'No mês corrente, a etapa "Banco" do fechamento fica feita com o extrato buscado nos últimos dias.', consequencia: 'Só muda a etapa do fechamento.', lei: 'Sem lei: rotina.' },
  { chave: 'antecedencia_seguro', grupo: 'rotina', rotulo: 'Alerta do seguro: dias antes do vencimento', tipo: 'inteiro', padrao: 60, min: 1, max: 365,
    explica: 'Avisa a renovação da apólice este número de dias antes do fim.', consequencia: 'Só muda o alerta.', lei: 'Sem lei: rotina.' },
  { chave: 'antecedencia_vigencia', grupo: 'rotina', rotulo: 'Alerta do fim do contrato: dias antes', tipo: 'inteiro', padrao: 60, min: 1, max: 730,
    explica: 'Avisa o fim do contrato este número de dias antes.',
    consequencia: 'Só muda o alerta. Contrato não residencial com 5 anos ou mais: a renovação na Justiça só pode ser pedida entre 1 ano e 6 meses antes do fim; para esses, 365 dias dá tempo de negociar.',
    lei: LI + ', art. 51, §5º.' },
  { chave: 'antecedencia_iptu', grupo: 'rotina', rotulo: 'Alerta do IPTU do proprietário: dias antes do vencimento', tipo: 'inteiro', padrao: 15, min: 0, max: 365,
    explica: 'Avisa a guia do IPTU que o proprietário paga este número de dias antes do vencimento. Ex.: 15 → guia de 10/03 aparece em 23/02.',
    consequencia: 'Só muda o alerta (guia vencida continua aparecendo).', lei: 'Sem lei: rotina.' },
  { chave: 'antecedencia_fiador', grupo: 'rotina', rotulo: 'Alerta do fim do vínculo do fiador: dias antes', tipo: 'inteiro', padrao: 60, min: 1, max: 730,
    explica: 'Avisa o fim do vínculo do fiador (sem outro fiador no contrato) este número de dias antes.', consequencia: 'Só muda o alerta.', lei: 'Sem lei: rotina.' },
  { chave: 'antecedencia_reajuste', grupo: 'rotina', rotulo: 'Alerta do reajuste do aluguel: meses antes', tipo: 'inteiro', padrao: 1, min: 0, max: 3,
    explica: 'Avisa o reajuste este número de meses antes do mês do aluguel corrigido. Ex.: 1 → reajuste de 03/2027 aparece em 02/2027; 0 → só em 03/2027.',
    consequencia: 'Só muda o alerta (a correção continua no mesmo mês). O índice só sai no começo do mês do reajuste.', lei: 'Sem lei: rotina.' },
  { chave: 'antecedencia_reserva', grupo: 'rotina', rotulo: 'Alerta do uso da reserva: meses antes', tipo: 'inteiro', padrao: 1, min: 0, max: 6,
    explica: 'Avisa que a reserva vai abater o boleto este número de meses antes do mês dele. Ex.: 1 → reserva para 03/2027 aparece em 02/2027.',
    consequencia: 'Só muda o alerta.', lei: 'Sem lei: rotina.' },
  { chave: 'dias_vermelho', grupo: 'rotina', rotulo: 'Inadimplência: em vermelho a partir de (dias de atraso)', tipo: 'inteiro', padrao: 5, min: 1, max: 90,
    explica: 'O devedor fica em vermelho (alerta e tela Inadimplência) a partir deste número de dias de atraso do boleto mais antigo. Ex.: 5 → vence 10/10, em vermelho a partir de 15/10.',
    consequencia: 'Só muda a cor do alerta e da linha: a régua de cobrança e a multa não mudam.', lei: 'Sem lei: rotina.' },
  { chave: 'titularidade_dias_antes', grupo: 'rotina', rotulo: 'Troca de titularidade das contas: avisar quantos dias antes da saída', tipo: 'inteiro', padrao: 30, min: 0, max: 180,
    explica: 'Avisa para passar água, luz e gás para o nome do proprietário a partir deste número de dias antes da saída. Ex.: 30 → saída em 15/12, aviso a partir de 15/11.',
    consequencia: 'Só muda quando o alerta aparece.', lei: 'Sem lei: rotina.' },
  { chave: 'titularidade_dias_depois', grupo: 'rotina', rotulo: 'Troca de titularidade das contas: continuar avisando até quantos dias depois da saída', tipo: 'inteiro', padrao: 180, min: 1, max: 730,
    explica: 'Enquanto a troca não for registrada, o alerta continua até este número de dias depois da saída.',
    consequencia: 'Só muda até quando o alerta aparece.', lei: 'Sem lei: rotina.' },
  // mutirão 3000 (2ª rodada, itens 24, 28 e 29 da lista dados): o prazo da lixeira já existia fixo (30 dias na nuvem)
  { chave: 'dias_lixeira_anexos', grupo: 'rotina', rotulo: 'Anexos apagados: guardar na lixeira por (dias)', tipo: 'inteiro', padrao: 30, min: 1, max: 365,
    explica: 'Anexo apagado (ou trocado por outro com o mesmo nome) não some na hora: a versão de antes fica guardada este número de dias, na lixeira da nuvem e, no computador com o backup seguro, na pasta "Apagados na nuvem" ao lado de "Arquivos dos imoveis". Ex.: contrato assinado apagado por engano em 10/03 → até 09/04 dá para recuperar.',
    consequencia: 'Prazo maior protege mais contra apagar por engano, mas guarda por mais tempo documentos pessoais que já saíram do sistema; prazo menor libera espaço mais cedo. O que já passou do prazo não volta.',
    lei: 'LGPD (Lei 13.709/2018), art. 6º, III (guardar só o necessário) e art. 46 (segurança: proteger contra perda acidental).' },
  { chave: 'dias_copias_backup', grupo: 'rotina', rotulo: 'Backup seguro: guardar as cópias de cada hora por (dias)', tipo: 'inteiro', padrao: 2, min: 1, max: 30,
    explica: 'O backup seguro guarda, além da cópia do dia (que continua igual), uma cópia de cada hora em que houve gravação, por este número de dias. Ex.: uma exclusão errada às 15h → a cópia das 14h ainda tem os dados de antes.',
    consequencia: 'Prazo maior ocupa mais espaço na pasta do backup seguro (cada cópia tem o tamanho do banco); prazo menor guarda menos pontos para voltar.',
    lei: 'Sem lei: rotina. LGPD, art. 46 (segurança: proteger contra perda acidental).' },
  // notificação ao inquilino (pedido do dono em 2026-11-17)
  { chave: 'notificacao_prazo_dias', grupo: 'rotina', rotulo: 'Notificação ao inquilino: prazo que já vem na notificação nova (dias úteis)', tipo: 'inteiro', padrao: 10, min: 1, max: 90,
    explica: 'Prazo para o inquilino resolver o que foi notificado, contado em dias úteis (sem sábado, domingo e feriado) a partir da data da notificação. Pode ser mudado em cada notificação. Ex.: 10 → notificação de 17/11/2026 vence em 02/12/2026 (20/11 é feriado).',
    consequencia: 'Só muda o prazo que vem preenchido nas notificações novas; as já feitas continuam com o prazo delas.',
    lei: 'Código Civil, art. 397, parágrafo único (a notificação constitui em mora); Lei 8.245/91, art. 9º, II (infração do contrato). O prazo deve ser razoável para o que foi pedido.' },
  { chave: 'notificacao_aviso_dias', grupo: 'rotina', rotulo: 'Notificação ao inquilino: lembrete quantos dias úteis antes do fim do prazo', tipo: 'inteiro', padrao: 3, min: 0, max: 15,
    explica: 'O alerta "Notificação ao inquilino" aparece este número de dias úteis antes do fim do prazo (e no dia), para mandar o lembrete. Ex.: 3 → prazo até 02/12/2026, lembrete a partir de 27/11/2026.',
    consequencia: 'Só muda quando o lembrete aparece. Depois do prazo, o alerta fica vermelho até a baixa, a nova notificação ou a multa.', lei: 'Sem lei: rotina.' },
  { chave: 'notificacao_multa_alugueis', grupo: 'rotina', rotulo: 'Notificação ao inquilino: multa sugerida (em aluguéis)', tipo: 'inteiro', padrao: 1, min: 0, max: 3,
    explica: 'Valor que já vem preenchido no "Gerar multa" (o administrador sempre confere e digita o valor). Ex.: 1 → aluguel de R$ 2.000,00, sugere R$ 2.000,00. 0 → vem em branco.',
    consequencia: 'Só muda a sugestão. O contrato prevê multa de até 3 aluguéis por infração; cobrar menos é sempre possível.',
    lei: 'Código Civil, arts. 408 a 413 (cláusula penal: não passa do valor da obrigação principal e o juiz pode reduzir a multa excessiva, art. 413).' },
  { chave: 'dias_sem_imovel', grupo: 'rotina', rotulo: 'Contrato sem imóvel é apagado depois de (dias)', tipo: 'inteiro', padrao: 7, min: 1, max: 90,
    explica: 'Contrato sem imóvel e sem boleto é apagado sozinho depois deste prazo.', consequencia: 'Só muda o prazo.', lei: 'Sem lei: rotina.' },
  { chave: 'meses_depois_de_alugar', grupo: 'rotina', rotulo: 'Etiqueta "alugado há pouco: veja se ficou conta nossa" por (meses)', tipo: 'inteiro', padrao: 2, min: 0, max: 12,
    explica: 'Nas contas do imóvel, lembra de contas do período vago até este número de meses depois da entrada.', consequencia: 'Só muda a etiqueta.', lei: 'Sem lei: rotina.' },
  { chave: 'dias_passado', grupo: 'rotina', rotulo: 'Aviso: data de pagamento de mais de (dias) atrás', tipo: 'inteiro', padrao: 90, min: 1, max: 3650,
    explica: 'Avisa antes de salvar (costuma ser ano digitado errado).', consequencia: 'Só muda o aviso.', lei: 'Sem lei: rotina.' },
  { chave: 'dias_futuro', grupo: 'rotina', rotulo: 'Aviso: entrada do inquilino a mais de (dias) no futuro', tipo: 'inteiro', padrao: 60, min: 1, max: 3650,
    explica: 'Avisa antes de salvar o contrato.', consequencia: 'Só muda o aviso.', lei: 'Sem lei: rotina.' },
  // registro de acessos da nuvem (mutirão 3000, 2ª rodada): quem baixou o banco, abriu anexos, mandou e-mail, ligou o programa do PC
  { chave: 'dias_registro_acessos', grupo: 'rotina', rotulo: 'Registro de acessos da nuvem: guardar por (dias)', tipo: 'inteiro', padrao: 180, min: 30, max: 730,
    explica: 'O servidor da nuvem anota quem baixou o banco inteiro, abriu ou anexou arquivos, baixou backups, mandou e-mail, mexeu na ficha pela internet e ligou o programa do PC (com a data, o endereço de internet e o tamanho). O administrador vê em Dados e backup → Acessos. Depois deste prazo, a anotação é apagada sozinha. Ex.: 180 dias → o acesso de 17/11/2026 sai em 16/05/2027.',
    consequencia: 'Prazo maior ajuda a descobrir um vazamento antigo, mas guarda mais dados das pessoas da equipe (e-mail e endereço de internet); prazo menor apaga antes. Vale na próxima faxina da noite.',
    lei: 'Marco Civil da Internet (Lei 12.965/2014), art. 15 (registros de acesso guardados por 6 meses); LGPD (Lei 13.709/2018), arts. 6º, III e X, 37 e 46 (registro das operações e segurança, guardando só o necessário).' },
  { chave: 'fora_do_padrao', grupo: 'rotina', rotulo: 'Aviso: aluguel, IPTU ou seguro diferente do anterior em mais de (%)', tipo: 'pct', padrao: 30, min: 1, max: 1000,
    explica: 'Ex.: seguro anterior de R$ 100,00 e novo de R$ 140,00 (40%) → avisa antes de salvar.', consequencia: 'Só muda o aviso.', lei: 'Sem lei: rotina.' },
];

const POR_CHAVE = new Map(DEFINICOES_REGRAS.map((x) => [x.chave, x]));
export const definicaoRegra = (chave) => POR_CHAVE.get(chave) || null;

const paraBusca = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/**
 * Busca da tela Regras do sistema (pedido do dono de 17/11): as chaves das regras cujo nome, explicação, consequência, lei ou
 * opções têm todas as palavras digitadas, sem ligar para acento nem maiúscula. Busca vazia: todas.
 * Ex.: "caucao reajuste" → as regras que falam da caução e do reajuste (como "A caução acompanha o reajuste").
 */
export function buscarRegras(termo) {
  const palavras = paraBusca(termo).split(/\s+/).filter(Boolean);
  return DEFINICOES_REGRAS.filter((x) => {
    const texto = paraBusca([x.rotulo, x.explica, x.consequencia, x.lei, ...(x.opcoes || []).flat()].join(' '));
    return palavras.every((p) => texto.includes(p));
  }).map((x) => x.chave);
}

/** As regras do dono, fixas no código: o "padrão de fábrica" do sistema. */
export const PADRAO_SISTEMA = Object.freeze(Object.fromEntries(DEFINICOES_REGRAS.map((x) => [x.chave, x.padrao])));

const copia = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
export const mesmoValor = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

class ErroRegra extends Error {
  constructor(mensagem) { super(mensagem); this.name = 'ErroUsuario'; this.esperado = true; }
}

/** Confere e acerta o valor de uma regra (devolve o valor limpo ou lança erro com a mensagem para a tela). */
export function limparValorRegra(chave, valor) {
  const def = definicaoRegra(chave);
  if (!def) throw new ErroRegra(`Regra desconhecida: ${chave}`);
  const faixa = (n) => {
    if (def.min !== undefined && n < def.min) throw new ErroRegra(`${def.rotulo}: o mínimo é ${def.min}.`);
    if (def.max !== undefined && n > def.max) throw new ErroRegra(`${def.rotulo}: o máximo é ${def.max}.`);
    return n;
  };
  switch (def.tipo) {
    case 'opcao':
      if (!def.opcoes.some(([v]) => v === valor)) throw new ErroRegra(`${def.rotulo}: escolha uma das opções.`);
      return valor;
    case 'simnao': return valor === true || valor === 'sim' || valor === '1' || valor === 1;
    case 'indice': return valor ? String(valor).trim().slice(0, 40) : '';
    case 'inteiro': case 'pct': case 'dinheiro': {
      if (valor === null || valor === undefined || valor === '') {
        if (def.padrao === null) return null;
        throw new ErroRegra(`${def.rotulo}: informe um número.`);
      }
      const n = Number(valor);
      if (!Number.isFinite(n)) throw new ErroRegra(`${def.rotulo}: informe um número.`);
      return faixa(def.tipo === 'pct' ? Math.round(n * 10000) / 10000 : Math.round(n));
    }
    case 'feriados': {
      const lista = Array.isArray(valor) ? valor : [];
      const ok = lista.map((x) => String(x).trim()).filter(Boolean);
      for (const x of ok) if (!/^(\d{4}-)?(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(x)) throw new ErroRegra(`Feriado inválido: ${x}`);
      return [...new Set(ok)].sort();
    }
    case 'regua': {
      const passos = (Array.isArray(valor) ? valor : []).map((x) => ({ dias: Number(x && x.dias), passo: String((x && x.passo) || '').trim().slice(0, 120) }));
      for (const p of passos) {
        if (!Number.isInteger(p.dias) || p.dias < 0 || p.dias > 3650) throw new ErroRegra('Régua de cobrança: os dias vão de 0 a 3650.');
        if (!p.passo) throw new ErroRegra('Régua de cobrança: escreva o que fazer em cada passo.');
      }
      if (new Set(passos.map((p) => p.dias)).size !== passos.length) throw new ErroRegra('Régua de cobrança: dois passos com o mesmo número de dias.');
      return passos.sort((a, b) => a.dias - b.dias);
    }
    case 'dias': {
      const lista = (Array.isArray(valor) ? valor : []).map(Number);
      for (const n of lista) if (!Number.isInteger(n)) throw new ErroRegra(`${def.rotulo}: use só números inteiros (ex.: -3, 0, 3, 10).`);
      return [...new Set(lista.map(faixa))].sort((a, b) => a - b);
    }
    default: return valor;
  }
}

/**
 * Duas regras ficavam fora de "Regras do sistema" até 2026-11-13: o ressarcimento na NF (`d.ressarcimento_abate_nf`, em Empresas)
 * e a tolerância de dias do boleto (`config_banco.tolerancia_dias`, em Dados e backup). O valor antigo continua valendo enquanto
 * a regra nova não tem linha própria; ao salvar as regras, `salvarRegrasSistema` grava a linha e apaga o campo antigo.
 */
export function regrasAntigasDe(d) {
  const out = {};
  if (d && d.ressarcimento_abate_nf === true) out.ressarcimento_na_nf = true;
  const tol = d && d.config_banco && d.config_banco.tolerancia_dias;
  if (Number.isInteger(tol) && tol >= 0 && tol <= 30 && tol !== POR_CHAVE.get('tolerancia_boleto_dias').padrao) out.tolerancia_boleto_dias = tol;
  return out;
}

/** Valores escolhidos no banco ``d`` (só os diferentes do padrão), já conferidos: o que não passa na conferência vale o padrão. */
export function escolhasDe(d) {
  const out = regrasAntigasDe(d);
  for (const r of (d && Array.isArray(d.config_regras) ? d.config_regras : [])) {
    if (!r || !POR_CHAVE.has(r.chave)) continue;
    try { out[r.chave] = limparValorRegra(r.chave, r.valor); } catch { /* valor estragado: fica o padrão */ }
  }
  return out;
}

/** Todas as regras em uso no banco ``d``: padrão do sistema + o que o administrador escolheu. */
export const regrasDe = (d) => ({ ...copia(PADRAO_SISTEMA), ...escolhasDe(d) });

let emUso = { ...PADRAO_SISTEMA };
/**
 * Regras especiais (pedido do dono de 18/11/2026): grupos de regras com nome (ex.: "Regra especial A") que um contrato pode seguir
 * no lugar das regras do sistema. Só as regras que fazem sentido mudar de um contrato para outro entram (aluguel, garantia, valores
 * que vêm no Novo contrato, prazos de aviso, notificação e régua do inquilino); as da rotina da empresa (backup, banco, extrato,
 * dia de gerar boletos, anexos) e o ressarcimento na NF (escrituração, com o contador) valem sempre para todos.
 */
export const REGRAS_POR_CONTRATO = new Set([
  'reajuste_inicio', 'base_multa', 'proporcional',
  ...DEFINICOES_REGRAS.filter((x) => x.grupo === 'garantia' || x.grupo === 'contrato').map((x) => x.chave),
  'regua_email_dias', 'notificacao_prazo_dias', 'notificacao_aviso_dias', 'notificacao_multa_alugueis',
  'antecedencia_seguro', 'antecedencia_vigencia', 'antecedencia_fiador', 'antecedencia_reajuste', 'dias_vermelho',
]);
export const podePorContrato = (chave) => REGRAS_POR_CONTRATO.has(chave);

/** Valores guardados de uma regra especial (tabela `perfis_regras`), conferidos: só as regras por contrato; o que estragou sai. */
export function valoresDoPerfil(p) {
  const out = {};
  for (const [k, v] of Object.entries((p && p.valores && typeof p.valores === 'object') ? p.valores : {})) {
    if (!REGRAS_POR_CONTRATO.has(k)) continue;
    try { out[k] = limparValorRegra(k, v); } catch { /* valor estragado: segue a regra do sistema */ }
  }
  return out;
}

let perfis = new Map(); // id da regra especial → { chave: valor } (só o que difere das regras do sistema)
let perfilDoContrato = new Map(); // id do contrato → id da regra especial (para quem só tem o contrato_id, como o boleto)

/** Passa a usar as regras do banco ``d`` (chamado por `normalizar` e ao salvar as regras). Sem banco: o padrão do sistema. */
export function usarRegras(d) {
  emUso = d ? regrasDe(d) : { ...PADRAO_SISTEMA };
  perfis = new Map((d && Array.isArray(d.perfis_regras) ? d.perfis_regras : []).map((p) => [p.id, valoresDoPerfil(p)]));
  perfilDoContrato = new Map((d && Array.isArray(d.contratos) ? d.contratos : []).filter((c) => c.perfil_regras_id).map((c) => [c.id, c.perfil_regras_id]));
}

/** Anota a regra especial de um contrato que acabou de ser gravado (`inserir`/`atualizar` de regras.js). */
export function lembrarContrato(c) {
  if (!c || !c.id) return;
  if (c.perfil_regras_id) perfilDoContrato.set(c.id, c.perfil_regras_id); else perfilDoContrato.delete(c.id);
}

/**
 * Regra especial que vale para ``x``: um contrato (ou o que o formulário tem, com `perfil_regras_id`) ou qualquer registro com
 * `contrato_id` (boleto, fiador, notificação). Null: regras do sistema.
 */
export function perfilDe(x) {
  if (!x || typeof x !== 'object') return null;
  const id = Object.prototype.hasOwnProperty.call(x, 'perfil_regras_id') ? x.perfil_regras_id : x.contrato_id ? perfilDoContrato.get(x.contrato_id) : null;
  return id && perfis.has(Number(id)) ? Number(id) : null;
}

/**
 * Valor em uso de uma regra. Com ``x`` (contrato, boleto ou outro registro do contrato), vale a regra especial do contrato quando
 * ela muda essa regra. Ex.: contrato na "Regra especial A" (proporcional pelos dias reais) → regra('proporcional', c) = 'dias_reais';
 * os outros contratos continuam com 'mes_30'.
 */
export function regra(chave, x) {
  if (x && REGRAS_POR_CONTRATO.has(chave)) {
    const p = perfis.get(perfilDe(x));
    if (p && chave in p) return p[chave];
  }
  return chave in emUso ? emUso[chave] : PADRAO_SISTEMA[chave];
}

/** Todos os valores de uma regra em uso (sistema e cada regra especial), ex.: para a janela da régua de cobrança. */
export const valoresEmUso = (chave) => [regra(chave), ...[...perfis.values()].filter((p) => chave in p).map((p) => p[chave])];

/** Feriados da cidade num ano: datas "AAAA-MM-DD" (os "MM-DD" valem todo ano). */
export function feriadosLocais(ano) {
  return (regra('feriados_locais') || []).map((x) => (x.length === 5 ? `${ano}-${x}` : x)).filter((x) => x.startsWith(`${ano}-`));
}

// ---------------------------------------------------------------- arquivo das regras (baixar e carregar)
export const FORMATO_ARQUIVO_REGRAS = 'regras-imoveis-v1';

/** Conteúdo do arquivo das regras: todas as regras em uso (não só as mudadas), para recuperar mesmo se o padrão mudar. */
export const arquivoDasRegras = (d, salvoPor = '') => ({ formato: FORMATO_ARQUIVO_REGRAS, salvo_em: new Date().toISOString(), salvo_por: salvoPor, regras: regrasDe(d) });

/** Lê o arquivo das regras: devolve { chave: valor } conferido (regra desconhecida é ignorada; valor errado é recusado). */
export function lerArquivoDasRegras(texto) {
  let j;
  try { j = typeof texto === 'string' ? JSON.parse(texto) : texto; } catch { throw new ErroRegra('O arquivo não é um arquivo de regras do sistema.'); }
  if (!j || j.formato !== FORMATO_ARQUIVO_REGRAS || !j.regras || typeof j.regras !== 'object') throw new ErroRegra('O arquivo não é um arquivo de regras do sistema.');
  const out = {};
  for (const [k, v] of Object.entries(j.regras)) if (POR_CHAVE.has(k)) out[k] = limparValorRegra(k, v);
  return out;
}
