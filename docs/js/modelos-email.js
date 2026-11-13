// Modelos de e-mail de cada etapa (ficha, entrada, saída e informe anual do IR), aprovados pelo dono em 2026-11-12.
// Mesma linguagem dos modelos de contrato: {campo} e [se condição]...[senão]...[fim] (também "[se não x]").
// Os textos podem ser editados em Dados e backup → Modelos de e-mail (tabela modelos_email; sem registro, vale o padrão).
// Revisão jurídica dos textos: documentacao/REVISAO_JURIDICA_CONTRATO.md (seção E).

/** Fecho de todo e-mail (pedido do dono: agradecer e ficar à disposição antes de "Atenciosamente"). */
export const FECHO = `Agradecemos e ficamos à disposição em caso de dúvidas.

Atenciosamente,
Administradora
administracao@ankjck.com.br`;

/** Conta da ANK para a caução (informada pelo dono em 2026-11-12). */
const CONTA_CAUCAO = `ANK ADMINISTRADORA DE BENS LTDA · Banco 336 (C6) · Ag. 0001 · C/C 36152656-3
Pix (CNPJ): 58.492.818/0001-59`;

const CONDICOES = `CONDIÇÕES DA LOCAÇÃO
- Aluguel: {aluguel} por mês[se bonificacao], com bonificação de {bonificacao} para pagamento até o vencimento ({aluguel_bonificado})[fim]
- Vencimento: todo dia {vencimento}
[se iptu]- IPTU: cobrado junto com o aluguel
[fim][se seguro_incendio]- Seguro contra incêndio: cobrado junto com o aluguel
[fim][se contas]- Contas de {contas_texto}: por conta do locatário
[fim]- Garantia: {garantia}
- Prazo do contrato: {prazo}`;

const DOCUMENTOS = `[se pj]1. Contrato social e última alteração
2. Cartão do CNPJ
3. Documento com foto e CPF do representante
4. Comprovante de faturamento dos 3 últimos meses
5. Comprovante de endereço da empresa[senão]1. Documento com foto e CPF
2. Certidão de casamento ou declaração de união estável, se for o caso
3. Comprovante de renda dos 3 últimos meses
4. Comprovante de residência atual[fim][se fiador]

DO FIADOR
1. Documento com foto e CPF
2. Comprovante de renda e de residência
3. Matrícula atualizada de um imóvel em nome dele
4. Se for casado ou viver em união estável: os mesmos documentos do cônjuge ou companheiro, que também assina o contrato[fim][se seguro_fianca]

SEGURO FIANÇA
A análise da seguradora é feita junto; se ela pedir algum documento a mais, avisaremos.[fim]`;

/**
 * Modelos padrão: ``chave`` (fixa), ``nome`` e ``etapa`` (onde fica o botão), ``assunto``, ``texto`` (sem o fecho, que vai
 * sempre no fim), ``anexos`` (lembrete do que anexar) e ``perguntas`` ([campo, rótulo, tipo]): o que se digita na hora de
 * enviar (ex.: as opções de data da entrega das chaves). O valor inicial de cada pergunta vem de dadosDoEmail (email-dados.js).
 */
export const MODELOS_EMAIL = [
  {
    chave: 'ficha_envio', nome: 'Envio de ficha cadastral', etapa: 'Ficha',
    assunto: '{imovel}: ficha cadastral e condições da locação',
    anexos: 'Ficha cadastral (PDF) e recibo da reserva',
    perguntas: [['prazo', 'Prazo do contrato', 'texto']],
    texto: `Olá, {nome}, tudo bem?

[se reserva]Recebemos o depósito da reserva de {reserva} em {reserva_data} para o imóvel da {endereco}. Ele segura o imóvel durante a análise da ficha: aprovada, o valor é descontado do primeiro aluguel; não aprovada, ou se você desistir antes de assinar o contrato, ele é devolvido por inteiro.[senão]Obrigado pelo interesse no imóvel da {endereco}.[fim]

${CONDICOES}

Estas condições dependem da aprovação da ficha. A locação só se forma com a assinatura do contrato por todas as partes.

DOCUMENTOS PARA A FICHA (responda este e-mail com a ficha anexa preenchida e):
${DOCUMENTOS}

COMO FUNCIONA
1. Análise da ficha em até 2 dias úteis
2. Envio do contrato para a sua assinatura
3. Sua assinatura[se dinheiro] e o depósito da {tipo_deposito}[fim]
4. Nossa assinatura e envio da via assinada por todos
5. Entrega das chaves com a vistoria de entrada, feita por nós com o imóvel vazio

Seus dados são tratados conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).`,
  },
  {
    chave: 'ficha_aprovada', nome: 'Ficha aprovada', etapa: 'Ficha',
    assunto: 'Ficha aprovada – {imovel}: próximos passos',
    perguntas: [['prazo', 'Prazo do contrato', 'texto']],
    texto: `Olá, {nome},

Sua ficha para o imóvel da {imovel} foi aprovada.

CONFIRA OS DADOS DO CONTRATO
- Locatário: {locatario}, {documento}
- Aluguel: {aluguel}[se bonificacao] ({aluguel_bonificado} até o vencimento)[fim] · Vencimento: dia {vencimento}
- Garantia: {garantia}
- Prazo: {prazo}
Se algo estiver diferente, responda antes de prepararmos o contrato.

PRÓXIMOS PASSOS
- Contrato: enviamos em até 2 dias úteis para você ler e assinar[se fiador] (o fiador e o cônjuge ou companheiro dele também assinam)[fim]
[se dinheiro]- {Tipo_deposito}: depois da sua assinatura, o depósito de {valor_deposito} na conta da empresa
[fim][se seguro_fianca]- Seguro fiança: emissão da apólice em seu nome
[fim]- Nossa assinatura: com tudo recebido, assinamos e enviamos a via assinada por todos
- Entrega das chaves: combinamos a data; você recebe junto a vistoria de entrada, feita por nós com o imóvel vazio, com fotos

[se reserva]A reserva de {reserva} será descontada no primeiro boleto. [fim]A locação só se forma com a assinatura de todos, e o imóvel só pode ser ocupado depois da entrega das chaves.`,
  },
  {
    chave: 'ficha_reprovada', nome: 'Ficha reprovada', etapa: 'Ficha',
    assunto: 'Resposta sobre a ficha – {imovel}',
    texto: `Olá, {nome},

Agradecemos o interesse no imóvel da {imovel}. Depois da análise, não foi possível aprovar a ficha neste momento.

[se reserva]A reserva de {reserva} será devolvida em até 24 horas úteis, na conta de onde veio o depósito.

[fim]Os documentos enviados serão apagados, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).`,
  },
  {
    chave: 'contrato_assinar', nome: 'Contrato para assinar', etapa: 'Gerar o contrato',
    assunto: 'Contrato de locação para assinatura – {imovel}',
    anexos: 'Contrato (PDF)',
    perguntas: [['prazo_assinatura', 'Devolver assinado até', 'data']],
    texto: `Olá, {nome},

Segue anexo o contrato de locação do imóvel da {imovel}. Leia com atenção antes de assinar. Os pontos principais:
- Início em {inicio}, prazo de {prazo}
- Aluguel de {aluguel}[se bonificacao] ({aluguel_bonificado} até o vencimento)[fim], todo dia {vencimento}; depois do vencimento, multa e juros conforme o contrato
- Reajuste anual pelo {indice}
[se iptu]- IPTU cobrado junto com o aluguel
[fim][se seguro_incendio]- Seguro contra incêndio cobrado junto com o aluguel
[fim]- Boletos e avisos chegam por este e-mail, que vale como meio oficial de comunicação

PASSO A PASSO
1. Assine o contrato e devolva por este e-mail até {prazo_assinatura}[se fiador] (o fiador e o cônjuge ou companheiro dele também assinam)[fim]
[se dinheiro]2. Deposite a {tipo_deposito} de {valor_deposito} e envie o comprovante:
${CONTA_CAUCAO}
[se caucao]A caução fica aplicada em poupança e é devolvida corrigida no fim do contrato, descontados eventuais débitos (Lei 8.245/91, art. 38).
[fim]3. Com tudo recebido, assinamos em até 2 dias úteis e enviamos a via assinada por todos
4. Em seguida combinamos a entrega das chaves[senão]2. Com o contrato assinado, assinamos em até 2 dias úteis e enviamos a via assinada por todos
3. Em seguida combinamos a entrega das chaves[fim]

Ficou alguma dúvida sobre as cláusulas? Pergunte antes de assinar.`,
  },
  {
    chave: 'contrato_assinado', nome: 'Contrato assinado: entrega das chaves', etapa: 'Contrato assinado',
    assunto: 'Contrato assinado – {imovel}: entrega das chaves',
    anexos: 'Contrato assinado por todos (PDF)',
    perguntas: [['opcoes_entrega', 'Opções de data e horário da entrega das chaves', 'texto']],
    texto: `Olá, {nome},

Segue anexo o contrato assinado por todas as partes. Guarde esta via.[se dinheiro] Confirmamos também o recebimento da {tipo_deposito} de {valor_deposito}.[fim]

ENTREGA DAS CHAVES
Opções: {opcoes_entrega}, no imóvel. Responda com a melhor opção.
1. Você recebe as chaves e a vistoria de entrada, feita por nós com o imóvel vazio, com fotos[se contas] e a leitura dos relógios[fim]
2. Você assina o termo de entrega das chaves e o recebimento da vistoria
3. Você tem 5 dias úteis para conferir o imóvel e nos avisar, por e-mail, o que não estiver na vistoria
[se contas]
CONTAS DE {CONTAS_TEXTO}
Nós pedimos a troca de titularidade das contas de {contas_concessionarias} para o seu nome, com a autorização que está no contrato. Se a companhia pedir alguma assinatura sua, avisamos.
[fim]
O primeiro boleto ({primeiro_boleto}) chega por este e-mail[se reserva], já com o desconto da reserva[fim].`,
  },
  {
    chave: 'vistoria_assinada', nome: 'Vistoria assinada: boas-vindas', etapa: 'Vistoria assinada',
    assunto: 'Bem-vindo(a) – {imovel}: vistoria de entrada',
    anexos: 'Vistoria de entrada e termo de entrega das chaves (PDF)',
    texto: `Olá, {nome},

Seja bem-vindo(a)! As chaves foram entregues em {data_chaves}.

Segue anexa a vistoria de entrada, feita com o imóvel vazio antes da entrega das chaves. Ela descreve o estado do imóvel e é a base da comparação na saída.

Confira com calma: se encontrar algum defeito que não esteja na vistoria (ex.: vazamento, tomada sem funcionar), avise por este e-mail até {data_limite_vistoria} (5 dias úteis), com fotos, para incluirmos no registro. Depois desse prazo, a vistoria vale como aceita, salvo defeito oculto.

LEMBRETES
[se contas]- Contas de {contas_texto}: nós cuidamos da troca de titularidade e avisamos quando estiver concluída
[fim]- Boletos: chegam por este e-mail; o primeiro: {primeiro_boleto}
- Reparos: avise sempre por escrito, por este e-mail
- Obras ou mudanças no imóvel só com autorização por escrito
- Este e-mail é o canal oficial de comunicação com a administradora`,
  },
  {
    chave: 'saida_aviso', nome: 'Aviso de saída recebido', etapa: 'Informar data de saída',
    assunto: 'Aviso de saída recebido – {imovel}',
    perguntas: [['data_aviso', 'Data em que o inquilino avisou', 'data']],
    texto: `Olá, {nome},

Recebemos em {data_aviso} o seu aviso de que vai desocupar o imóvel. A data de saída fica {data_saida}. Por favor, responda confirmando esta data.
[se saida_antecipada]
MULTA DA SAÍDA ANTECIPADA
Pelo seu contrato, a saída antes do fim do prazo ({fim}) tem multa de 3 aluguéis, proporcional ao tempo que falta, calculada no acerto final. Se a mudança for por transferência do seu empregador, avise: nesse caso a lei dispensa a multa (Lei 8.245/91, art. 4º).
[fim]
PRÓXIMOS PASSOS
- Último aluguel: proporcional aos dias até {data_saida}; o aluguel corre até a devolução das chaves
- Vistoria de saída: vamos marcar a data e hora com você; a vistoria é feita com a sua presença
[se contas]- Contas: nós pedimos a leitura final dos relógios no dia da devolução e a volta da titularidade. Mande os comprovantes das contas pagas até a saída. Conta com consumo até a leitura final que chegar depois também é sua e entra no acerto ou é cobrada depois
[fim]- Devolução das chaves: no dia da vistoria, com o termo de devolução
- Acerto final: [se dinheiro]{tipo_deposito} corrigida menos o que estiver em aberto[senão]o que estiver em aberto[fim], enviado para você conferir

O imóvel deve ser devolvido como na vistoria de entrada: vazio, limpo e com os danos reparados (o desgaste natural do uso não conta). O contrato[se tem_garantia] e a garantia continuam[senão] continua[fim] valendo até a devolução das chaves.`,
  },
  {
    chave: 'saida_vistoria', nome: 'Vistoria de saída marcada', etapa: 'Vistoria de saída',
    assunto: 'Vistoria de saída – {imovel}: data marcada',
    anexos: 'Vistoria de entrada (PDF)',
    perguntas: [['data_vistoria', 'Data e horário da vistoria de saída', 'texto']],
    texto: `Olá, {nome},

A vistoria de saída fica marcada para {data_vistoria}, no imóvel. Se não puder, responda com outro horário até 2 dias antes.

A vistoria é feita com você presente: comparamos o imóvel com a vistoria de entrada (anexa) e você pode registrar as suas observações. Se não puder vir, pode mandar alguém com autorização por escrito. Se ninguém comparecer, faremos a vistoria no horário marcado, com fotos, e enviaremos o relatório para você responder em até 5 dias úteis.

DEIXE PRONTO
- Imóvel vazio e limpo
- Danos reparados (paredes, pisos, portas, louças, chuveiro, tomadas)
- Todas as chaves e controles
[se contas]- Comprovantes das contas de {contas_texto} pagas
[fim]- A leitura dos relógios fazemos juntos

Se faltar algum reparo, você escolhe: fazer antes da vistoria, com a mesma qualidade do que foi entregue, ou [se dinheiro]ter o valor descontado da {tipo_deposito}[senão]pagar o valor do reparo[fim], com orçamento apresentado. O aluguel corre até a devolução das chaves, inclusive nos dias de reparo.`,
  },
  {
    chave: 'saida_chaves', nome: 'Devolução das chaves e vistoria de saída', etapa: 'Devolução das chaves',
    assunto: 'Vistoria de saída e devolução das chaves – {imovel}',
    anexos: 'Vistoria de saída, termo de devolução das chaves e orçamentos (PDF)',
    perguntas: [['pendencias', 'Pendências da vistoria (uma por linha, com o orçamento)', 'area']],
    texto: `Olá, {nome},

Recebemos as chaves em {data_saida}. Seguem anexos a vistoria de saída e o termo de devolução das chaves.

PENDÊNCIAS (comparadas com a vistoria de entrada)
{pendencias}

Se discordar de algum item, responda em até 5 dias úteis, com fotos ou documentos.

O recebimento das chaves não dá quitação: os valores em aberto e as pendências da vistoria entram no acerto final, que enviaremos em seguida.`,
  },
  {
    chave: 'saida_calculo', nome: 'Acerto final', etapa: 'Cálculo final',
    assunto: 'Acerto final do contrato – {imovel}',
    anexos: 'Cálculo final e comprovantes (PDF)',
    texto: `Olá, {nome},

Segue o acerto final do contrato do imóvel da {imovel}:

{acerto}

[se devolver]Se estiver de acordo, informe a chave Pix ou a conta em seu nome; a devolução é feita em até 5 dias úteis da sua resposta.[fim][se cobrar]Segue o boleto do saldo, com o vencimento indicado nele.[fim]

Se discordar de algum item, responda em até 5 dias úteis explicando o motivo.`,
  },
  {
    chave: 'saida_encerramento', nome: 'Encerramento do contrato', etapa: 'Devolução da garantia',
    assunto: 'Contrato encerrado – {imovel}',
    anexos: 'Comprovante da devolução (PDF), se houver',
    texto: `Olá, {nome},

Confirmamos [se devolver]a devolução de {saldo} em {data_devolucao} e [fim]o encerramento do contrato de locação do imóvel da {imovel}. Não há valores pendentes entre as partes referentes a este contrato.

Em fevereiro enviaremos o informe dos aluguéis pagos em {ano_saida}, para a sua declaração do Imposto de Renda.

Seus dados e documentos ficam guardados pelo prazo exigido em lei e depois são apagados, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).

Desejamos sucesso no novo endereço.`,
  },
  {
    chave: 'informe_ir', nome: 'Informe dos aluguéis para o IR', etapa: 'Todo ano (fevereiro)',
    assunto: 'Informe de aluguéis pagos em {ano} – Imposto de Renda',
    anexos: 'Comprovante anual de aluguéis pagos (PDF, mês a mês e por empresa)',
    perguntas: [['ano', 'Ano dos pagamentos', 'ano']],
    texto: `Olá, {nome},

[se pj]Segue o resumo dos aluguéis pagos em {ano} pelo imóvel da {imovel}, para a contabilidade da empresa. Cada pagamento já tem a sua nota fiscal.

{informe}

Não houve retenção de imposto de renda na fonte.[senão]Segue o informe dos aluguéis pagos em {ano} pelo imóvel da {imovel}, para a sua declaração do Imposto de Renda.

COMO DECLARAR
Ficha "Pagamentos Efetuados", código 70 (Aluguéis de imóveis), um lançamento para cada empresa:
{informe}

O aluguel de moradia não reduz o imposto; a informação serve para o cruzamento da Receita Federal. Não houve retenção de imposto de renda na fonte.[fim]`,
  },
];

/** Modelo de e-mail em uso: o gravado (Dados e backup → Modelos de e-mail) ou o padrão. */
export function modeloEmail(d, chave) {
  const padrao = MODELOS_EMAIL.find((m) => m.chave === chave);
  if (!padrao) return null;
  const salvo = (d.modelos_email || []).find((m) => m.chave === chave);
  return salvo ? { ...padrao, assunto: salvo.assunto ?? padrao.assunto, texto: salvo.texto ?? padrao.texto, id: salvo.id, editado: true } : { ...padrao };
}

/**
 * Preenche o modelo: condições ([se x]...[senão]...[fim], das mais internas para fora) e campos ({x}; {X_y} com a 1ª letra
 * maiúscula vira o campo com a 1ª letra maiúscula; {X_Y} todo maiúsculo, o campo em maiúsculas). Campo sem valor fica
 * "[preencher: x]", para não sair e-mail com buraco. Junta linhas em branco repetidas.
 * Ex.: "Olá, {nome}[se pj] (empresa)[fim]" com nome "Maria" e pj falso → "Olá, Maria".
 */
export function preencherEmail(texto, dados) {
  let t = String(texto || '').replace(/\r\n/g, '\n');
  const valor = (nome) => {
    const n = nome.toLowerCase();
    if (n in dados.condicoes) return !!dados.condicoes[n];
    return !!dados.campos[n];
  };
  const re = /\[se ([^\]]+)\]((?:(?!\[se )[\s\S])*?)\[fim\]/;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const [sim, nao = ''] = m[2].split('[senão]');
    const e = m[1].trim();
    const neg = /^não\s+/i.test(e);
    const ok = valor(e.replace(/^não\s+/i, '').trim());
    t = t.slice(0, m.index) + ((neg ? !ok : ok) ? sim : nao) + t.slice(m.index + m[0].length);
  }
  t = t.replace(/\{([A-Za-z_]+)\}/g, (x, nome) => {
    const v = dados.campos[nome.toLowerCase()];
    if (v === undefined || v === null || v === '') return `[preencher: ${nome.toLowerCase()}]`;
    const s = String(v);
    if (nome === nome.toUpperCase()) return s.toLocaleUpperCase('pt-BR');
    if (nome[0] === nome[0].toUpperCase()) return s[0].toLocaleUpperCase('pt-BR') + s.slice(1);
    return s;
  });
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** E-mail pronto: assunto e texto preenchidos, com o fecho. */
export function montarEmail(modelo, dados) {
  return { assunto: preencherEmail(modelo.assunto, dados).replace(/\s+/g, ' '), texto: `${preencherEmail(modelo.texto, dados)}\n\n${FECHO}` };
}
