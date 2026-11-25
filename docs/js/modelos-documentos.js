// Outros documentos da locação feitos por modelo (pedido do dono em 24/11/2026, item C2): prorrogação do prazo, troca de
// garantia, distrato, aviso de desocupação, notificação de desocupação, autorização de obra, declaração de pagamentos em dia
// e aviso ao fiador. Mesma linguagem dos contratos ({campo}, [se x], CLÁUSULA #, [assinaturas]); ficam em MODELOS_PADRAO
// (modelos-contrato.js), editáveis em Sistema → Modelos de documentos. Os dados vêm do contrato (dadosDoContrato) e dos
// campos de cada tipo (TIPOS_DOCUMENTO), digitados na hora de gerar (K.dadosDoDocumento). Sem imports: modelos-contrato.js
// chama modelosDocumentos(PARTES) (evita o ciclo de módulos).

/**
 * Tipos novos: nome, explicação, quem assina (papéis do quadro de assinaturas; vazio = todos os do contrato) e os campos
 * digitados ao gerar: [chave, rótulo, formato ('data' | 'dinheiro' | 'numero' | 'texto' | 'marcar'), exemplo, quando]. Campo
 * em branco sai como uma linha para preencher à mão (dinheiro em branco = sem valor, para as condições [se campo]); 'marcar'
 * é uma caixa (marcada = a condição [se campo] vale). ``quando``: (condições do contrato, as de dadosDoContrato) → o campo
 * aparece na tela (fora dela fica vazio). ``retirado``: tipo que não se gera mais (os já gerados continuam valendo e
 * aparecendo); fica na lista porque o id negativo dos modelos padrão é a posição (não tire nem mude a ordem).
 */
export const TIPOS_DOCUMENTO = {
  aditivo_prazo: {
    nome: 'Termo aditivo de prorrogação do prazo',
    explica: 'Prorroga o contrato por um novo prazo, com o mesmo aluguel e as mesmas condições (o fiador assina concordando).',
    // advogado, 24/11/2026 (item 6.1): não aprovado. O contrato vencido continua por prazo indeterminado, com o reajuste anual
    // ou uma renegociação (termo de novo valor). Os termos já gerados continuam valendo: assinados, mudam o término (#401).
    retirado: 'Não é mais gerado (advogado, 24/11/2026): depois do fim do prazo, o contrato continua por prazo indeterminado, com o reajuste anual ou uma renegociação do valor. Os termos já gerados continuam valendo.',
    campos: [['numero_aditivo', 'Número do termo aditivo', 'numero', '2'], ['novo_prazo_meses', 'Novo prazo (meses)', 'numero', '30'],
      ['nova_data_inicio', 'Início do novo prazo', 'data', '2026-12-01'], ['nova_data_fim', 'Fim do novo prazo', 'data', '2029-05-31']],
  },
  aditivo_garantia: {
    nome: 'Termo aditivo de troca de garantia',
    explica: 'Troca a garantia do contrato (ex.: caução por fiador). A garantia em dinheiro que sai é devolvida a quem depositou, com a correção da poupança (decisão de 13/11/2026).',
    campos: [['numero_aditivo', 'Número do termo aditivo', 'numero', '2'], ['data_troca', 'Data da troca', 'data', '2026-12-01'],
      ['garantia_anterior', 'Garantia que sai', 'texto', 'a caução de R$ 3.800,00 depositada em caderneta de poupança'],
      ['garantia_nova', 'Garantia nova', 'texto', 'a fiança prestada pelo FIADOR qualificado acima']],
  },
  distrato: {
    nome: 'Termo de rescisão amigável (distrato)',
    explica: 'Encerra o contrato antes do fim, por acordo das partes. Com a multa combinada em branco, a multa da saída antecipada é dispensada.',
    campos: [['data_saida', 'Data da entrega das chaves', 'data', '2026-12-15'], ['multa_combinada', 'Multa combinada (em branco: dispensada)', 'dinheiro', '']],
  },
  aviso_desocupacao: {
    nome: 'Aviso de desocupação (o inquilino avisa que vai sair)',
    explica: 'Para o inquilino assinar quando avisa a saída: 30 dias de antecedência (Lei 8.245/91, art. 6º). A empresa assina o recebimento.',
    assinam: ['LOCATÁRIO', 'LOCATÁRIO SOLIDÁRIO', 'LOCADORA'],
    campos: [['data_saida_prevista', 'Data prevista da entrega das chaves', 'data', '2026-12-31'],
      // advogado, 24/11/2026 (item 6.4): a dispensa da multa por transferência do empregador (art. 4º, parágrafo único), marcada
      // antes de gerar; só pessoa física, como no resumo do contrato (item 5.2)
      ['transferencia_empregador', 'O inquilino foi transferido pelo empregador para outra cidade: dispensa da multa da saída antes do fim do prazo (peça o comprovante da transferência)', 'marcar', '', (k) => !k.pj]],
  },
  notificacao_desocupacao: {
    nome: 'Notificação para desocupação (contrato por prazo indeterminado)',
    explica: 'A empresa pede o imóvel de volta com 30 dias de prazo, contados do recebimento, depois do fim do prazo do contrato. Vai por carta com aviso de recebimento (AR). Residencial com contrato de menos de 30 meses: só nos casos do art. 47 da Lei 8.245/91, com o motivo escrito.',
    assinam: ['LOCADORA'],
    // advogado, 24/11/2026 (item 6.5): carta com AR e prazo contado do recebimento; residencial de menos de 30 meses só com o
    // motivo do art. 47 (sem ele, o documento não é gerado); o fiador é notificado para conhecimento
    campos: [['data_limite', 'Data limite para desocupar (30 dias depois da entrega da carta)', 'data', '2026-12-31'],
      ['motivo_retomada', 'Motivo da retomada (art. 47 da Lei 8.245/91) e a prova', 'texto', '', (k) => !k.retomada_livre]],
  },
  autorizacao_obra: {
    nome: 'Autorização para obra ou benfeitoria',
    explica: 'Autoriza por escrito uma obra pedida pelo inquilino (o contrato exige autorização por escrito); a obra fica no imóvel, sem indenização.',
    assinam: ['LOCADORA', 'LOCATÁRIO', 'LOCATÁRIO SOLIDÁRIO'],
    campos: [['descricao_obra', 'Obra autorizada', 'texto', 'troca do piso da sala por porcelanato, com rodapé, por conta do LOCATÁRIO'],
      ['prazo_obra', 'Prazo para terminar a obra', 'data', '2027-02-28']],
  },
  declaracao_pagamentos: {
    nome: 'Declaração de pagamentos em dia (nada consta)',
    explica: 'Declaração para o inquilino (ex.: financiamento, novo aluguel) de que pagou em dia os aluguéis do período.',
    assinam: ['LOCADORA'],
    campos: [['periodo_inicio', 'Pagamentos desde', 'data', '2023-11-15'], ['periodo_fim', 'Até', 'data', '2026-10-31']],
  },
  aviso_fiador: {
    nome: 'Aviso ao fiador de aluguel em atraso',
    explica: 'Avisa o fiador do débito do inquilino e pede a regularização no prazo. Só para contrato com fiador.',
    assinam: ['LOCADORA'],
    campos: [['debitos', 'Débitos em atraso', 'texto', 'aluguel e encargos de outubro de 2026, vencidos em 10/11/2026'],
      ['valor_debito', 'Valor total em atraso', 'dinheiro', '1.963,50'], ['prazo_pagamento', 'Pagar até', 'data', '2026-12-05']],
  },
};

// Revisão do advogado de 24/11/2026: os trechos de antes (saem dos modelos já gravados por atualizarTextoDocumento) e os de hoje.
const AVISO_MULTA_ANTIGO = '3. [se data_fim]saindo antes do fim do prazo do contrato ({data_fim}), incide a multa prevista no contrato, proporcional ao tempo que falta (Lei nº 8.245/91, art. 4º); depois do fim do prazo, basta o aviso de 30 (trinta) dias, sem multa;[senão]a locação é por prazo indeterminado: basta o aviso de 30 (trinta) dias, sem multa (Lei nº 8.245/91, art. 6º);[fim]';
/** Item 3 do aviso de desocupação: a multa da saída antes do fim do prazo ou, com a caixa marcada, a dispensa por transferência do empregador (item 6.4). */
const AVISO_MULTA = '3. [se data_fim][se transferencia_empregador]saindo antes do fim do prazo do contrato ({data_fim}), o LOCATÁRIO fica dispensado da multa prevista no contrato, por ter sido transferido pelo seu empregador para prestar serviços em outra localidade, conforme o comprovante entregue com este aviso (Lei nº 8.245/91, art. 4º, parágrafo único);[senão]saindo antes do fim do prazo do contrato ({data_fim}), incide a multa prevista no contrato, proporcional ao tempo que falta (Lei nº 8.245/91, art. 4º); depois do fim do prazo, basta o aviso de 30 (trinta) dias, sem multa;[fim][senão]a locação é por prazo indeterminado: basta o aviso de 30 (trinta) dias, sem multa (Lei nº 8.245/91, art. 6º);[fim]';
const NOTIFICACAO_PEDIDO_ANTIGO = '{l:vem|vêm} comunicar que não {l:tem|têm} interesse em continuar a locação e, nos termos do [se nao_residencial]art. 57[senão]art. 46, § 2º[fim], da Lei nº 8.245/91, {l:concede|concedem} o prazo de 30 (trinta) dias para a desocupação do imóvel, até **{data_limite}**.';
/**
 * Pedido da notificação (item 6.5): o prazo conta do recebimento da carta com AR (a data limite vale para o recebimento até
 * 30 dias antes dela, {recebimento_ate}) e, no residencial de menos de 30 meses, só pelo motivo do art. 47, escrito ao gerar.
 */
const NOTIFICACAO_PEDIDO = '{l:vem|vêm} comunicar que não {l:tem|têm} interesse em continuar a locação e, [se retomada_livre]nos termos do [se nao_residencial]art. 57[senão]art. 46, § 2º[fim], da Lei nº 8.245/91[senão]com fundamento no art. 47 da Lei nº 8.245/91, pelo seguinte motivo: {motivo_retomada}[fim], {l:concede|concedem} o prazo de 30 (trinta) dias, contados do recebimento desta notificação, para a desocupação do imóvel, até **{data_limite}**. Se esta notificação for recebida depois de {recebimento_ate}, o prazo termina 30 (trinta) dias depois do recebimento.\n\nEsta notificação é enviada por carta com aviso de recebimento (AR)[se fiador], com cópia {f:ao FIADOR|aos FIADORES}[fim].';
const NOTIFICACAO_CONTATO_ANTIGO = 'Para combinar a data da vistoria e a entrega das chaves, basta responder a este e-mail.';
const NOTIFICACAO_CONTATO = 'Para combinar a data da vistoria e a entrega das chaves, basta entrar em contato com {l:a LOCADORA|as LOCADORAS}.';
const GARANTIA_CHAVES_ANTIGO = 'renunciando ao benefício de ordem (Código Civil, arts. 827 e 828), até a entrega real e definitiva das chaves.';
/** Troca de garantia (item 6.2): "devolução" no lugar de "entrega" das chaves. */
const GARANTIA_CHAVES = 'renunciando ao benefício de ordem (Código Civil, arts. 827 e 828), até a devolução real e definitiva das chaves.';

/**
 * Modelos já gravados (editados ou copiados em Sistema → Modelos de documentos): [texto antigo exato, texto novo] por tipo.
 * Só troca o que ainda está igual ao antigo (o editado à mão fica como está). Chamada por textoAtualizadoDoModelo
 * (modelos-contrato.js), a mesma função que a nuvem usa para não abrir conflito entre aparelhos de versões diferentes.
 */
export const ATUALIZACOES_DOCUMENTOS = {
  aditivo_garantia: [[GARANTIA_CHAVES_ANTIGO, GARANTIA_CHAVES]],
  aviso_desocupacao: [[AVISO_MULTA_ANTIGO, AVISO_MULTA]],
  notificacao_desocupacao: [[NOTIFICACAO_PEDIDO_ANTIGO, NOTIFICACAO_PEDIDO], [NOTIFICACAO_CONTATO_ANTIGO, NOTIFICACAO_CONTATO]],
};

/** Texto gravado de um outro documento com as trocas de ATUALIZACOES_DOCUMENTOS (sem troca, o mesmo texto). */
export function atualizarTextoDocumento(tipo, texto) {
  const trocas = Object.prototype.hasOwnProperty.call(ATUALIZACOES_DOCUMENTOS, tipo) ? ATUALIZACOES_DOCUMENTOS[tipo] : null;
  if (!trocas || typeof texto !== 'string') return texto;
  const antes = texto.replace(/\r\n/g, '\n');
  let t = antes;
  for (const [antigo, novo] of trocas) if (t.includes(antigo)) t = t.split(antigo).join(novo);
  return t === antes ? texto : t;
}

/** Tipo de documento que ainda se gera (o retirado só aparece nos documentos já registrados). */
export const documentoAtivo = (tipo) => Object.prototype.hasOwnProperty.call(TIPOS_DOCUMENTO, tipo) && !TIPOS_DOCUMENTO[tipo].retirado;

const FECHO = `E por estarem de acordo, as partes assinam este documento por assinatura eletrônica, que reconhecem como válida (Lei nº 14.063/2020), ou, no papel, em duas vias de igual teor e forma[se testemunhas], na presença das testemunhas abaixo[fim].

> {cidade}, {data_assinatura}.

[assinaturas]`;

const DEMAIS = '**CLÁUSULA #** – Permanecem em vigor todas as demais cláusulas e condições do contrato de locação não alteradas por este Termo Aditivo, que passa a fazer parte integrante dele.';

/** Textos padrão (uma entrada de MODELOS_PADRAO por tipo). ``PARTES``: a qualificação das partes, a mesma dos contratos. */
export function modelosDocumentos(PARTES) {
  const textos = {
    aditivo_prazo: `# {numero_aditivo} TERMO ADITIVO AO CONTRATO DE LOCAÇÃO

## PRORROGAÇÃO DO PRAZO

${PARTES}

As partes acima, já qualificadas no Contrato de Locação {finalidade} que tem por objeto {objeto}, firmado em {data_contrato}, resolvem, de comum acordo, prorrogar o prazo da locação, mediante as cláusulas a seguir:

**CLÁUSULA #** – O prazo da locação fica prorrogado por {novo_prazo_meses} meses, de {nova_data_inicio} a {nova_data_fim}.

**CLÁUSULA #** – O aluguel, o dia do vencimento, o índice de reajuste ({indice}) e o mês do reajuste anual continuam os do contrato, assim como os encargos a cargo do LOCATÁRIO.

[se caucao]**CLÁUSULA #** – A caução prestada no contrato continua como garantia da locação durante o novo prazo, com a correção prevista no contrato.[fim]

[se deposito]**CLÁUSULA #** – O depósito de garantia prestado no contrato continua como garantia da locação durante o novo prazo.[fim]

[se fiador]**CLÁUSULA #** – {f:O FIADOR declara|Os FIADORES declaram} estar de acordo com a prorrogação e {f:mantém|mantêm} a fiança prestada no contrato de locação, como {f:fiador e principal pagador|fiadores e principais pagadores}, durante o novo prazo e até a entrega real e definitiva das chaves (Lei nº 8.245/91, art. 39).[fim]

[se seguro_fianca]**CLÁUSULA #** – O LOCATÁRIO renovará o seguro fiança locatícia para cobrir o novo prazo e apresentará a apólice em até 30 (trinta) dias.[fim]

${DEMAIS}

${FECHO}`,

    aditivo_garantia: `# {numero_aditivo} TERMO ADITIVO AO CONTRATO DE LOCAÇÃO

## TROCA DE GARANTIA

${PARTES}

As partes acima, já qualificadas no Contrato de Locação {finalidade} que tem por objeto {objeto}, firmado em {data_contrato}, resolvem, de comum acordo, substituir a garantia da locação, mediante as cláusulas a seguir:

**CLÁUSULA #** – A partir de {data_troca}, a garantia da locação deixa de ser {garantia_anterior} e passa a ser {garantia_nova}, que garante todas as obrigações do contrato, inclusive as vencidas e ainda não pagas nesta data.

**CLÁUSULA #** – Sendo em dinheiro (caução ou depósito) a garantia que sai, ela será devolvida a quem a depositou, com a correção da caderneta de poupança até a data do saque, descontados os débitos do contrato existentes nesta data, mediante recibo.

[se caucao]**CLÁUSULA #** – A caução nova será depositada pelo LOCATÁRIO em caderneta de poupança, nos termos do art. 38, § 2º, da Lei nº 8.245/91, e o comprovante faz parte deste termo.[fim]

[se fiador]**CLÁUSULA #** – {f:O FIADOR qualificado acima declara|Os FIADORES qualificados acima declaram} conhecer o contrato de locação e {f:garante|garantem} as obrigações do LOCATÁRIO, solidariamente, como {f:fiador e principal pagador|fiadores e principais pagadores}, ${GARANTIA_CHAVES}[fim]

[se seguro_fianca]**CLÁUSULA #** – O LOCATÁRIO apresentará a apólice do seguro fiança locatícia em até 30 (trinta) dias, sob pena de infração contratual.[fim]

**CLÁUSULA #** – O fiador que deixa de garantir a locação continua responsável pelas obrigações vencidas até a véspera da troca.

${DEMAIS}

${FECHO}`,

    distrato: `# TERMO DE RESCISÃO AMIGÁVEL DO CONTRATO DE LOCAÇÃO (DISTRATO)

${PARTES}

As partes acima, já qualificadas no Contrato de Locação {finalidade} que tem por objeto {objeto}, firmado em {data_contrato}, resolvem, de comum acordo, encerrar a locação (Lei nº 8.245/91, art. 9º, I), mediante as cláusulas a seguir:

**CLÁUSULA #** – O LOCATÁRIO devolverá o imóvel e entregará as chaves em {data_saida}, data em que a locação fica encerrada.

**CLÁUSULA #** – O aluguel e os encargos são devidos até a data da entrega das chaves, proporcionalmente aos dias do mês.

**CLÁUSULA #** – A vistoria de saída será feita na entrega das chaves, com o convite ao LOCATÁRIO por escrito, por e-mail, para acompanhá-la. Os reparos necessários para o imóvel voltar ao estado da vistoria de entrada, ressalvado o desgaste natural do uso, serão descontados da garantia em dinheiro, quando houver, ou cobrados do LOCATÁRIO, com base em orçamento ou nota do serviço.

[se multa_combinada]**CLÁUSULA #** – Pela rescisão, o LOCATÁRIO pagará a multa de {multa_combinada}, combinada entre as partes em substituição à multa prevista no contrato.[senão]**CLÁUSULA #** – As partes dispensam a multa prevista no contrato para a saída antes do fim do prazo, quando houver.[fim]

**CLÁUSULA #** – O LOCATÁRIO encerrará as contas de consumo que estejam em seu nome e entregará os comprovantes das últimas contas pagas. As contas e os tributos do período da locação apurados depois da saída continuam devidos pelo LOCATÁRIO.

[se caucao]**CLÁUSULA #** – A caução, com a correção da caderneta de poupança, será devolvida ao LOCATÁRIO depois do acerto final, descontados os débitos e os reparos.[fim][se deposito]**CLÁUSULA #** – O depósito de garantia será devolvido ao LOCATÁRIO depois do acerto final, descontados os débitos e os reparos.[fim]

[se fiador]**CLÁUSULA #** – {f:O FIADOR concorda|Os FIADORES concordam} com este termo e {f:continua|continuam} responsável pelas obrigações do contrato até a entrega das chaves e o acerto final.[fim]

**CLÁUSULA #** – Feito o acerto final, as partes assinarão o termo de entrega do imóvel e quitação, com os valores discriminados.

${FECHO}`,

    aviso_desocupacao: `# AVISO DE DESOCUPAÇÃO DO IMÓVEL

{l:À LOCADORA|Às LOCADORAS}: {locadoras}.

O LOCATÁRIO, {inquilino_nome}, do Contrato de Locação {finalidade} que tem por objeto {objeto}, firmado em {data_contrato}, comunica, com 30 (trinta) dias de antecedência, nos termos do art. 6º da Lei nº 8.245/91 e do contrato, que vai desocupar o imóvel e entregar as chaves em **{data_saida_prevista}**.

O LOCATÁRIO declara estar ciente de que:

1. o aluguel e os encargos são devidos até a data da entrega das chaves;

2. a vistoria de saída será feita na entrega das chaves, com convite por escrito, por e-mail, para acompanhá-la, e os reparos necessários para o imóvel voltar ao estado da vistoria de entrada, ressalvado o desgaste natural do uso, serão descontados da garantia ou cobrados com base em orçamento ou nota do serviço;

${AVISO_MULTA}

4. deve encerrar as contas de consumo que estejam em seu nome e entregar os comprovantes das últimas contas pagas.

> {cidade}, {data_assinatura}.

[assinaturas]

{l:A LOCADORA assina|As LOCADORAS assinam} acima o recebimento deste aviso.`,

    notificacao_desocupacao: `# NOTIFICAÇÃO PARA DESOCUPAÇÃO DO IMÓVEL

Ao LOCATÁRIO: {locatarios}.[se solidario] Ao LOCATÁRIO SOLIDÁRIO: {solidario}.[fim][se fiador] {f:Ao FIADOR|Aos FIADORES}, para conhecimento: {fiadores}.[fim]

{l:A LOCADORA|As LOCADORAS}, {locadoras}, no Contrato de Locação {finalidade} que tem por objeto {objeto}, firmado em {data_contrato}, [se data_fim]cujo prazo terminou em {data_fim} e que continua[senão]que vigora[fim] por prazo indeterminado, ${NOTIFICACAO_PEDIDO}

Até a entrega das chaves continuam devidos o aluguel e os encargos. A vistoria de saída será feita na entrega das chaves, com convite por escrito, por e-mail, para acompanhá-la.

Não havendo a desocupação no prazo, {l:a LOCADORA poderá|as LOCADORAS poderão} propor a ação de despejo prevista em lei, sem prejuízo da cobrança dos valores devidos.

${NOTIFICACAO_CONTATO}

> {cidade}, {data_assinatura}.

[assinaturas]`,

    autorizacao_obra: `# AUTORIZAÇÃO PARA OBRA NO IMÓVEL

{l:A LOCADORA|As LOCADORAS}, {locadoras}, no Contrato de Locação {finalidade} que tem por objeto {objeto}, firmado em {data_contrato}, {l:autoriza|autorizam} o LOCATÁRIO, {inquilino_nome}, a fazer no imóvel, por sua conta e risco, a seguinte obra: **{descricao_obra}**.

Condições:

1. a obra será feita por profissional habilitado, com o responsável técnico (ART ou RRT) quando a lei exigir, dentro das normas do município e, havendo condomínio, com a autorização dele e nos horários do regulamento;

2. a obra deve terminar até {prazo_obra}; os danos causados ao imóvel, aos vizinhos ou a terceiros durante a obra são de responsabilidade do LOCATÁRIO;

3. a obra fica incorporada ao imóvel, sem direito a indenização nem a retenção, como prevê o contrato (Lei nº 8.245/91, art. 35);

4. esta autorização vale só para a obra descrita acima; qualquer outra mudança continua dependendo de autorização por escrito.

> {cidade}, {data_assinatura}.

[assinaturas]`,

    declaracao_pagamentos: `# DECLARAÇÃO DE PAGAMENTOS EM DIA

{l:A LOCADORA|As LOCADORAS}, {locadoras}, {l:declara|declaram}, para os devidos fins, que {inquilino_nome} é LOCATÁRIO do imóvel situado em {endereco_imovel}, pelo Contrato de Locação {finalidade} firmado em {data_contrato}, com início em {data_inicio}.

Os aluguéis e os encargos vencidos de {periodo_inicio} a {periodo_fim} foram pagos, e não há débito vencido em aberto nesta data.

Esta declaração não dá quitação dos valores que ainda vão vencer nem das contas e tributos do período ainda não lançados.

> {cidade}, {data_assinatura}.

[assinaturas]`,

    aviso_fiador: `# AVISO AO FIADOR: ALUGUEL EM ATRASO

{f:Ao FIADOR|Aos FIADORES}: {fiadores_nomes}.

Como {f:fiador e principal pagador|fiadores e principais pagadores} do Contrato de Locação {finalidade} que tem por objeto {objeto}, firmado em {data_contrato} com o LOCATÁRIO, {inquilino_nome}, informamos que estão em atraso: {debitos}, no total de **{valor_debito}**, mais a multa e os juros do contrato até o pagamento.

Pedimos a regularização até **{prazo_pagamento}**, pelo pagamento do boleto ou pelo acordo com o LOCATÁRIO. Se o débito já foi pago, desconsidere este aviso.

Sem o pagamento, o débito poderá ser cobrado do LOCATÁRIO e {f:do FIADOR|dos FIADORES}, inclusive judicialmente, com a inclusão nos cadastros de proteção ao crédito depois do aviso feito pelo próprio órgão, como prevê o contrato.

> {cidade}, {data_assinatura}.

[assinaturas]`,
  };
  return Object.entries(textos).map(([tipo, texto]) => ({ nome: TIPOS_DOCUMENTO[tipo].nome, tipo, texto }));
}
