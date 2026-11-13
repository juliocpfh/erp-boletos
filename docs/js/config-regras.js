// Regras do sistema escolhidas pelo administrador (Dados e backup → Regras do sistema): definição, padrão do sistema e valor em uso.
// O padrão de cada regra (PADRAO_SISTEMA) é a regra do dono, fixa no código ("padrão de fábrica"): sem nada escolhido, vale ela.
// O que o administrador muda fica na tabela `config_regras` (uma linha por regra diferente do padrão); versões salvas em `versoes_regras`.
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
 * Cada regra: chave, grupo, rótulo, tipo (opcao, simnao, inteiro, pct, dinheiro, indice, feriados, regua), padrão do sistema,
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
  { chave: 'proporcional', grupo: 'aluguel', rotulo: 'Aluguel proporcional (mês de entrada e de saída)', tipo: 'opcao', padrao: 'dias_reais',
    opcoes: [
      ['dias_reais', 'Pelos dias reais do mês (padrão do sistema)', 'Entrada em 15/02/2027, aluguel R$ 1.800,00: 14 dias de 28 = R$ 900,00. Legal: não há lei sobre a conta; é a mais justa e fácil de explicar.'],
      ['mes_30', 'Mês comercial de 30 dias', 'Mesmo exemplo: 14 ÷ 30 × R$ 1.800,00 = R$ 840,00 (mês inteiro continua o aluguel cheio). Legal, se estiver no contrato.'],
    ],
    explica: 'Como se calcula o aluguel dos dias ocupados no mês de entrada e no de saída.',
    consequencia: 'Vale para os boletos gerados ou recalculados daqui em diante. O IPTU e o FCI do mês continuam pelos dias reais.',
    lei: 'Sem lei específica: vale o combinado no contrato (' + LI + ', art. 17).' },
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
  { chave: 'meses_documentos_ficha', grupo: 'rotina', rotulo: 'Ficha reprovada: apagar os documentos depois de (meses)', tipo: 'inteiro', padrao: 3, min: 1, max: 24,
    explica: 'Os documentos pessoais da ficha reprovada são apagados este número de meses depois da decisão.',
    consequencia: 'Prazo maior guarda dados sem necessidade, o que a LGPD manda evitar; prazo curto pode apagar o que ainda seria útil numa reclamação.',
    lei: 'LGPD (Lei 13.709/2018), art. 6º, III, e arts. 15 e 16.' },
  { chave: 'dias_antecipacao_banco', grupo: 'rotina', rotulo: 'Extrato: ligar a entrada a boletos que vencem até quantos dias depois', tipo: 'inteiro', padrao: 45, min: 1, max: 120,
    explica: 'Ex.: entrada de 10/08 → procura boletos com vencimento até 24/09 (pagamento adiantado).', consequencia: 'Mais dias: acha mais pagamentos adiantados, com mais sugestões erradas.', lei: 'Sem lei: rotina.' },
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
  { chave: 'dias_sem_imovel', grupo: 'rotina', rotulo: 'Contrato sem imóvel é apagado depois de (dias)', tipo: 'inteiro', padrao: 7, min: 1, max: 90,
    explica: 'Contrato sem imóvel e sem boleto é apagado sozinho depois deste prazo.', consequencia: 'Só muda o prazo.', lei: 'Sem lei: rotina.' },
  { chave: 'meses_depois_de_alugar', grupo: 'rotina', rotulo: 'Etiqueta "alugado há pouco: veja se ficou conta nossa" por (meses)', tipo: 'inteiro', padrao: 2, min: 0, max: 12,
    explica: 'Nas contas do imóvel, lembra de contas do período vago até este número de meses depois da entrada.', consequencia: 'Só muda a etiqueta.', lei: 'Sem lei: rotina.' },
  { chave: 'dias_passado', grupo: 'rotina', rotulo: 'Aviso: data de pagamento de mais de (dias) atrás', tipo: 'inteiro', padrao: 90, min: 1, max: 3650,
    explica: 'Avisa antes de salvar (costuma ser ano digitado errado).', consequencia: 'Só muda o aviso.', lei: 'Sem lei: rotina.' },
  { chave: 'dias_futuro', grupo: 'rotina', rotulo: 'Aviso: entrada do inquilino a mais de (dias) no futuro', tipo: 'inteiro', padrao: 60, min: 1, max: 3650,
    explica: 'Avisa antes de salvar o contrato.', consequencia: 'Só muda o aviso.', lei: 'Sem lei: rotina.' },
  { chave: 'fora_do_padrao', grupo: 'rotina', rotulo: 'Aviso: aluguel, IPTU ou seguro diferente do anterior em mais de (%)', tipo: 'pct', padrao: 30, min: 1, max: 1000,
    explica: 'Ex.: seguro anterior de R$ 100,00 e novo de R$ 140,00 (40%) → avisa antes de salvar.', consequencia: 'Só muda o aviso.', lei: 'Sem lei: rotina.' },
];

const POR_CHAVE = new Map(DEFINICOES_REGRAS.map((x) => [x.chave, x]));
export const definicaoRegra = (chave) => POR_CHAVE.get(chave) || null;

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
    default: return valor;
  }
}

/** Valores escolhidos no banco ``d`` (só os diferentes do padrão), já conferidos: o que não passa na conferência vale o padrão. */
export function escolhasDe(d) {
  const out = {};
  for (const r of (d && Array.isArray(d.config_regras) ? d.config_regras : [])) {
    if (!r || !POR_CHAVE.has(r.chave)) continue;
    try { out[r.chave] = limparValorRegra(r.chave, r.valor); } catch { /* valor estragado: fica o padrão */ }
  }
  return out;
}

/** Todas as regras em uso no banco ``d``: padrão do sistema + o que o administrador escolheu. */
export const regrasDe = (d) => ({ ...copia(PADRAO_SISTEMA), ...escolhasDe(d) });

let emUso = { ...PADRAO_SISTEMA };
/** Passa a usar as regras do banco ``d`` (chamado por `normalizar` e ao salvar as regras). Sem banco: o padrão do sistema. */
export function usarRegras(d) { emUso = d ? regrasDe(d) : { ...PADRAO_SISTEMA }; }
/** Valor em uso de uma regra. */
export const regra = (chave) => (chave in emUso ? emUso[chave] : PADRAO_SISTEMA[chave]);

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
