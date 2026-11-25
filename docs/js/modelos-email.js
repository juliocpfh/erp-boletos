// Modelos de e-mail de cada etapa (ficha, entrada, saída e informe anual do IR), aprovados pelo dono em 2026-11-12.
// Mesma linguagem dos modelos de contrato: {campo} e [se condição]...[senão]...[fim] (também "[se não x]").
// Os textos podem ser editados em Sistema → Comunicação E-mail → Modelos de e-mail (tabela modelos_email; sem registro, vale o padrão).
// Revisão jurídica dos textos: documentacao/REVISAO_JURIDICA_CONTRATO.md (seção E).

/**
 * Fecho de todo e-mail (pedido do dono: agradecer e ficar à disposição antes de "Atenciosamente"), com quem assina e o e-mail
 * da empresa (Empresas: "Nome que assina os e-mails" e "E-mail da administração"; dadosDoEmail → ``remetente``).
 * Ex.: { assinatura: 'Administradora', email: 'contato@exemplo.com.br' } → "…Atenciosamente,\nAdministradora\ncontato@exemplo.com.br".
 */
export function fechoEmail({ assinatura = '', email = '' } = {}) {
  return ['Agradecemos e ficamos à disposição em caso de dúvidas.', '', 'Atenciosamente,', assinatura || 'Administradora', email].filter((x, i) => i < 4 || x).join('\n');
}

const CONDICOES = `CONDIÇÕES DA LOCAÇÃO
[se aluguel]- Aluguel: {aluguel} por mês[se bonificacao], com bonificação de {bonificacao} para pagamento até o vencimento ({aluguel_bonificado})[fim]
[fim][se vencimento]- Vencimento: todo dia {vencimento}
[fim][se iptu]- IPTU: cobrado junto com o aluguel[se iptu_valor] (cerca de {iptu_valor} por mês)[fim]
[fim][se seguro_incendio]- Seguro contra incêndio: cobrado junto com o aluguel[se seguro_valor] (cerca de {seguro_valor} por ano)[fim]
[fim][se contas]- Contas de {contas_texto}: por conta do locatário
[fim][se inclusos]- Incluso no aluguel: {inclusos}
[fim]- Garantia: {garantia}
- Prazo do contrato: {prazo}`;

/**
 * Modelos padrão: ``chave`` (fixa), ``nome`` e ``etapa`` (onde fica o botão), ``assunto``, ``texto`` (sem o fecho, que vai
 * sempre no fim), ``anexos`` (lembrete do que anexar à mão), ``prontos`` (o que o sistema anexa sozinho: "recibo:tipo" de recibos.js e
 * "comprovante:qual" guardado na pasta, email-dados.js anexosProntos) e ``perguntas`` ([campo, rótulo, tipo]): o que se digita na hora de
 * enviar (ex.: as opções de data da entrega das chaves). O valor inicial de cada pergunta vem de dadosDoEmail (email-dados.js).
 */
export const MODELOS_EMAIL = [
  {
    chave: 'ficha_termo_reserva', nome: 'Condições e termo da reserva', etapa: 'Ficha',
    // 1º contato com quem demonstrou interesse (decisões do dono de 2026-11-24): as condições, o termo e o link do aceite
    assunto: '{imovel}: condições e termo da reserva',
    anexos: '', prontos: ['recibo:termo_reserva'],
    perguntas: [['prazo', 'Prazo do contrato', 'texto']],
    texto: `Olá, {nome}, tudo bem?

Obrigado pelo interesse no imóvel da {endereco}. Seguem as condições e o termo da reserva.
[se aviso_desistencia]
{aviso_desistencia}
[fim]
${CONDICOES}
Condições sujeitas à aprovação da ficha; a locação só vale com o contrato assinado por todos.
[se requisitos]
REQUISITOS PARA A APROVAÇÃO
{requisitos}
[fim]
DOCUMENTOS PARA A ANÁLISE
{documentos_ficha}

RESERVA
- Valor: {reserva_combinada}, abatido do 1º aluguel se a ficha for aprovada
- O imóvel fica reservado para você por {dias_validade} dias depois do depósito
- Depois do depósito, você tem {dias_documentos} dias úteis para mandar a ficha e os documentos; sem eles, a reserva é cancelada
- Ficha não aprovada: devolvemos tudo
- {regra_desistencia}
- {texto_conferencia}
- Quando houver devolução, ela sai em até {dias_devolucao} dias úteis, na conta de onde veio o depósito

PRÓXIMO PASSO
[se link_termo]Leia o termo completo e dê o seu aceite por este link, só seu, válido até {link_termo_validade}:
{link_termo}
Lá você confirma o e-mail com um código e recebe o comprovante.[senão]Leia o termo anexo e, se estiver de acordo, responda este e-mail com ele assinado (pelo gov.br ou à mão).[fim]

Depois do aceite, faça o depósito da reserva na conta abaixo e mande o comprovante:
{conta_deposito}

Seus dados são tratados conforme a LGPD (Lei 13.709/2018).`,
  },
  {
    chave: 'ficha_envio', nome: 'Envio de ficha cadastral', etapa: 'Ficha',
    assunto: '{imovel}: ficha cadastral e condições da locação',
    anexos: '', prontos: ['recibo:ficha', 'recibo:ficha_fiador', 'recibo:reserva', 'comprovante:reserva'],
    perguntas: [['prazo', 'Prazo do contrato', 'texto']],
    texto: `Olá, {nome}, tudo bem?

[se reserva]Recebemos a reserva de {reserva} em {reserva_data} para o imóvel da {endereco} (recibo e comprovante anexos). Aprovada a ficha, ela é descontada do primeiro aluguel[se termo_aceito], como no termo da reserva que você aceitou em {aceite_data}: não aprovada, devolvemos tudo. {desistencia}[senão]; não aprovada, ou se você desistir antes de assinar, devolvemos tudo.[fim][senão]Obrigado pelo interesse no imóvel da {endereco}.[fim]

${CONDICOES}
Condições sujeitas à aprovação da ficha; a locação só vale com o contrato assinado por todos.

PRÓXIMO PASSO
[se link]Preencha a ficha e mande os documentos por este link, só seu, válido até {link_validade}:
{link}[se link_fiador]
{links_fiadores}[fim]

Ou, se preferir, responda[senão]Responda[fim] este e-mail com a ficha anexa assinada (gov.br ou à mão)[se fiador], a [se varios_fiadores]de cada fiador[senão]do fiador[fim][fim] e os documentos:
{documentos_ficha}[se seguro_fianca]
A seguradora analisa junto e pode pedir algum documento a mais.[fim]

[se prazo_documentos]Prazo para mandar a ficha e os documentos: {prazo_documentos} (sem eles, a reserva é cancelada).

[fim]Depois: análise em até 2 dias úteis, contrato para assinar[se dinheiro], depósito da {tipo_deposito}[fim] e entrega das chaves com a vistoria.

Seus dados são tratados conforme a LGPD (Lei 13.709/2018).`,
  },
  {
    chave: 'ficha_aprovada', nome: 'Ficha aprovada', etapa: 'Ficha',
    assunto: 'Ficha aprovada – {imovel}: próximos passos',
    perguntas: [['prazo', 'Prazo do contrato', 'texto']],
    texto: `Olá, {nome}!

Sua ficha para o imóvel da {imovel} foi aprovada. Confira os dados do contrato:
- Locatário: {locatario}, {documento}
- Aluguel: {aluguel}[se bonificacao] ({aluguel_bonificado} até o vencimento)[fim], todo dia {vencimento}
- Garantia: {garantia}
- Prazo: {prazo}
Se algo estiver errado, responda antes de prepararmos o contrato.

Próximos passos: contrato para assinar em até 2 dias úteis[se fiador] (o fiador e o cônjuge dele também assinam)[fim][se dinheiro], depósito[se valor_deposito] de {valor_deposito}[fim] da {tipo_deposito}[fim][se seguro_fianca], apólice do seguro fiança[fim], nossa assinatura e entrega das chaves com a vistoria.

[se reserva]A reserva de {reserva} será descontada do primeiro boleto. [fim]O imóvel só pode ser ocupado depois do contrato assinado por todos e da entrega das chaves.`,
  },
  {
    chave: 'ficha_reprovada', nome: 'Ficha reprovada', etapa: 'Ficha',
    assunto: 'Resposta sobre a ficha – {imovel}',
    texto: `Olá, {nome},

Agradecemos o interesse no imóvel da {imovel}. Depois da análise, não foi possível aprovar a ficha neste momento.

[se reserva][se devolucao]A reserva de {reserva} já foi devolvida em {devolucao_data}, na conta de onde veio o depósito.[senão][se retencao_aplicada]Na conferência, informações ou documentos enviados não corresponderam à realidade, o que conta como desistência no termo da reserva aceito em {aceite_data}: [se devolve_algo]devolvemos {devolver_reserva} e ficamos com {reter_reserva}, em até {dias_devolucao} dias úteis, na conta de onde veio o depósito.[senão]a reserva de {reserva} fica com a empresa, como no termo.[fim][senão]A reserva de {reserva} será devolvida em até {dias_devolucao} dias úteis, na conta de onde veio o depósito.[fim][fim]

[fim]Os documentos enviados serão apagados, conforme a LGPD (Lei 13.709/2018).`,
  },
  {
    chave: 'ficha_devolucao', nome: 'Devolução da reserva', etapa: 'Ficha',
    assunto: 'Devolução da reserva – {imovel}',
    anexos: '', prontos: ['recibo:devolucao_reserva', 'comprovante:devolucao'],
    texto: `Olá, {nome},

Devolvemos {devolucao} em {devolucao_data}, na conta de onde veio a reserva do imóvel da {imovel}. Anexos: o comprovante e o termo de devolução e quitação.

A ficha está encerrada[se devolucao_parcial]. Da reserva, {devolucao_parcial} não foi devolvido[se termo_aceito], como no termo da reserva aceito em {aceite_data}[fim]: qualquer dúvida, responda este e-mail[senão], sem valores pendentes[fim]. Se puder, responda com o termo assinado (pode ser pelo gov.br); o comprovante do banco já prova a devolução.

Os documentos da análise serão apagados, conforme a LGPD (Lei 13.709/2018).`,
  },
  {
    chave: 'contrato_assinar', nome: 'Contrato para assinar', etapa: 'Gerar o contrato',
    assunto: 'Contrato de locação para assinatura – {imovel}',
    anexos: 'Contrato (PDF)', prontos: ['digital:contrato'], // assinado digitalmente pela empresa, quando houver (2026-11-24)
    perguntas: [['prazo_assinatura', 'Devolver assinado até', 'data']],
    texto: `Olá, {nome},

Segue o contrato de locação do imóvel da {imovel}. Pontos principais:
- Início em {inicio}, prazo de {prazo}
- Aluguel de {aluguel}[se bonificacao] ({aluguel_bonificado} até o vencimento)[fim], todo dia {vencimento}; com atraso, multa e juros do contrato
- Reajuste anual pelo {indice}
[se iptu]- IPTU no boleto do aluguel
[fim][se seguro_incendio]- Seguro contra incêndio no boleto do aluguel
[fim]- Este e-mail é o meio oficial de comunicação (boletos e avisos)

COMO SEGUIR
1. Assine e devolva por este e-mail até {prazo_assinatura}[se fiador] (o fiador e o cônjuge dele também assinam)[fim]
[se dinheiro]2. Deposite a {tipo_deposito} de {valor_deposito} e mande o comprovante:
{conta_deposito}
[se caucao]A caução fica na poupança e volta corrigida no fim, descontados os débitos (Lei 8.245/91, art. 38).
[fim]3. Assinamos em até 2 dias úteis, mandamos a via de todos e combinamos as chaves[senão]2. Assinamos em até 2 dias úteis, mandamos a via de todos e combinamos as chaves[fim]

Dúvida em alguma cláusula? Pergunte antes de assinar.`,
  },
  {
    chave: 'contrato_assinado', nome: 'Contrato assinado: entrega das chaves', etapa: 'Contrato assinado',
    assunto: 'Contrato assinado – {imovel}: entrega das chaves',
    anexos: 'Contrato assinado por todos (PDF)', prontos: ['assinado:doc_contrato', 'recibo:garantia', 'comprovante:garantia'],
    perguntas: [['opcoes_entrega', 'Opções de data e horário da entrega das chaves', 'texto']],
    texto: `Olá, {nome},

O contrato foi assinado por todos: segue a via final, para guardar.[se dinheiro][se garantia_depositada] Recebemos também a {tipo_deposito} de {valor_deposito} (recibo e comprovante anexos).[senão] Falta o depósito da {tipo_deposito} de {valor_deposito}: mande o comprovante por este e-mail.[fim][fim]

ENTREGA DAS CHAVES
Opções: {opcoes_entrega}, no imóvel. Responda com a melhor.
Na entrega você recebe as chaves e a vistoria de entrada com fotos[se contas] e a leitura dos relógios[fim] e assina o termo. Depois tem 5 dias úteis para avisar, por e-mail, o que não estiver na vistoria.
[se contas]
Nós pedimos a troca das contas de {contas_concessionarias} para o seu nome; se a companhia pedir sua assinatura, avisamos.
[fim]
O primeiro boleto ({primeiro_boleto}) chega por este e-mail[se reserva], já com o desconto da reserva[fim].`,
  },
  {
    chave: 'vistoria_assinada', nome: 'Vistoria assinada: boas-vindas', etapa: 'Vistoria assinada',
    assunto: 'Bem-vindo(a) – {imovel}: vistoria de entrada',
    anexos: 'Vistoria de entrada e termo de entrega das chaves (PDF)', prontos: ['assinado:doc_vistoria', 'assinado:doc_chaves'],
    texto: `Olá, {nome}! Seja bem-vindo(a).

[se data_chaves]As chaves foram entregues em {data_chaves}. [fim]Segue a vistoria de entrada: é com ela que o imóvel será comparado na saída.

Achou algum defeito que não está nela? Avise por este e-mail, com fotos, [se data_limite_vistoria]até {data_limite_vistoria} (5 dias úteis)[senão]em até 5 dias úteis da entrega das chaves[fim]. Depois disso a vistoria vale como aceita, salvo defeito oculto.

LEMBRETES
- Boletos e avisos chegam por este e-mail, o canal oficial; o primeiro: {primeiro_boleto}
[se contas]- A troca das contas de {contas_texto} fica conosco; avisamos ao concluir
[fim]- Reparos: avise por escrito. Obras ou mudanças, só com autorização por escrito`,
  },
  {
    // novo valor negociado (pedido do dono, 2026-11-13): o termo aditivo vai para assinar; a assinatura é o aceite, anexado no sistema
    chave: 'novo_valor', nome: 'Novo valor do aluguel: termo para assinar', etapa: 'Novo valor negociado',
    assunto: 'Novo valor do aluguel: termo para assinatura – {imovel}',
    anexos: 'Termo aditivo do novo valor (PDF)', prontos: ['digital:aditivo'],
    perguntas: [['prazo_assinatura', 'Devolver assinado até', 'data']],
    texto: `Olá, {nome},

Como combinado, o aluguel do imóvel da {imovel} passa de {valor_anterior} para {valor_novo} a partir de {novo_inicio}[se novo_bonificacao] ({novo_bonificado} até o vencimento)[fim]. O resto do contrato não muda.

Segue o termo aditivo: assine e devolva até {prazo_assinatura}[se fiador], com a assinatura do fiador e do cônjuge dele (sem ela, a fiança não cobre o novo valor)[fim]. Sua assinatura é o aceite do novo valor. Depois mandamos a via assinada por todos.[se caucao]

A caução acompanha o novo valor: o boleto da diferença chega separado.[fim]`,
  },
  {
    chave: 'aditivo_assinado', nome: 'Termo aditivo assinado por todos', etapa: 'Termo aditivo',
    assunto: 'Termo aditivo assinado – {imovel}',
    anexos: 'Termo aditivo assinado por todos (PDF)', prontos: ['assinado:aditivo'],
    texto: `Olá, {nome},

O termo aditivo de {aditivo_data} ({aditivo_assunto}) foi assinado por todos: segue a via final, para guardar com o contrato. O resto do contrato continua igual.`,
  },
  {
    chave: 'saida_aviso', nome: 'Aviso de saída recebido', etapa: 'Informar data de saída',
    assunto: 'Aviso de saída recebido – {imovel}',
    perguntas: [['data_aviso', 'Data em que o inquilino avisou', 'data']],
    texto: `Olá, {nome},

Recebemos em {data_aviso} o seu aviso de saída. A data fica {data_saida}: responda confirmando, por favor.
[se saida_antecipada]
Saída antes do fim do contrato ({fim}): multa de 3 aluguéis, proporcional ao tempo que falta, no acerto final. Se for transferência pelo seu empregador, avise: a lei dispensa a multa (Lei 8.245/91, art. 4º).
[fim]
COMO VAI SER
- O aluguel corre até a devolução das chaves (o último é proporcional)
- Devolva o imóvel como na vistoria de entrada: vazio, limpo e com os danos reparados (o desgaste natural não conta)
- Quer trazer outro orçamento para algum reparo? Mande antes da devolução das chaves: depois dela valem os nossos orçamentos
- Vistoria de saída logo depois das chaves, com fotos e vídeo; você pode acompanhar. Sem você, mandamos o relatório para responder em 5 dias úteis
- Acerto final: [se dinheiro]{tipo_deposito} corrigida menos o que estiver em aberto[senão]o que estiver em aberto[fim], para você conferir
[se contas]
CONTAS ({CONTAS_CONCESSIONARIAS})
No dia da entrega das chaves, fotografe cada relógio e peça a cada companhia a leitura final e a suspensão (site, aplicativo ou agência). Traga os comprovantes pagos e os protocolos. A conta final que chegar depois também é sua: pague e mande o comprovante.
[fim]
O contrato[se tem_garantia] e a garantia continuam[senão] continua[fim] valendo até a devolução das chaves.`,
  },
  {
    chave: 'saida_vistoria', nome: 'Vistoria de saída marcada', etapa: 'Vistoria de saída',
    assunto: 'Vistoria de saída – {imovel}: data marcada',
    anexos: 'Vistoria de entrada (PDF)',
    perguntas: [['data_vistoria', 'Data e horário da vistoria de saída', 'texto']],
    texto: `Olá, {nome},

A vistoria de saída está marcada para {data_vistoria}, no imóvel. Se não puder, responda com outro horário até 2 dias antes.

Você pode acompanhar (ou mandar alguém com autorização por escrito) e anotar suas observações. Se não vier, fazemos com fotos e vídeo e mandamos o relatório para você responder em 5 dias úteis. A vistoria de entrada vai anexa, para comparar.

Deixe pronto: imóvel vazio e limpo, danos reparados e todas as chaves e controles[se contas]; as contas de {contas_texto} pagas, com os protocolos do encerramento e as fotos dos relógios[fim].

Reparo que faltar: você faz antes, com a mesma qualidade, ou [se dinheiro]o valor do orçamento é descontado da {tipo_deposito}[senão]paga o valor do orçamento[fim]. Se quiser apresentar outro orçamento, mande antes da devolução das chaves: depois dela valem os nossos. O aluguel corre até a devolução das chaves.`,
  },
  {
    chave: 'saida_chaves', nome: 'Devolução das chaves e vistoria de saída', etapa: 'Devolução das chaves',
    assunto: 'Vistoria de saída e devolução das chaves – {imovel}',
    anexos: 'Vistoria de saída e orçamentos (PDF)', prontos: ['assinado:chaves_saida'],
    perguntas: [['pendencias', 'Pendências da vistoria (uma por linha, com o valor do orçamento)', 'area']],
    texto: `Olá, {nome},

Recebemos as chaves em {data_saida}. Seguem a vistoria de saída e o termo de devolução.

PENDÊNCIAS (comparadas com a vistoria de entrada)
{pendencias}

Cada reparo, pelo orçamento ou pela nota, é [se dinheiro]descontado da {tipo_deposito}[senão]cobrado[fim] no acerto final. Discorda da vistoria? Responda em até 5 dias úteis, com fotos ou documentos. Outro orçamento só podia ser apresentado até a devolução das chaves: os valores acima são os dos nossos orçamentos.

Receber as chaves não dá quitação: o acerto final vem em seguida.`,
  },
  {
    chave: 'saida_calculo', nome: 'Acerto final', etapa: 'Cálculo final',
    assunto: 'Acerto final do contrato – {imovel}',
    anexos: 'Cálculo final e comprovantes (PDF)', prontos: ['boleto:pdf', 'boleto:pix'], // o boleto do saldo, quando emitido no C6
    texto: `Olá, {nome},

Segue o acerto final do contrato do imóvel da {imovel}:

{acerto}

[se devolver]De acordo? Informe a chave Pix ou a conta em seu nome: devolvemos em até 5 dias úteis da sua resposta.[fim][se cobrar][se boleto_saldo]Segue o boleto do saldo de {saldo}, com vencimento em {boleto_saldo_vencimento}.[se boleto_saldo_linha]
Linha digitável: {boleto_saldo_linha}[fim][se boleto_saldo_pix]
Pix copia e cola: {boleto_saldo_pix}[fim][senão]Falta pagar o saldo de {saldo}: deposite ou faça o Pix na conta abaixo e responda com o comprovante.
{conta_deposito}[fim][fim]

Discorda de algum item? Responda em até 5 dias úteis com o motivo.`,
  },
  {
    chave: 'saida_encerramento', nome: 'Encerramento do contrato', etapa: 'Devolução da garantia',
    assunto: 'Contrato encerrado – {imovel}',
    anexos: '', prontos: ['assinado:quitacao', 'recibo:quitacao', 'comprovante:saida'],
    texto: `Olá, {nome},

[se devolver]Devolvemos {saldo} em {data_devolucao} e [fim]encerramos o contrato do imóvel da {imovel}. Segue o termo de entrega, acerto final e quitação[se devolver], com o comprovante[fim]: responda com ele assinado, por favor (pode ser pelo gov.br).

Não há valores pendentes, salvo contas de consumo e tributos do período que ainda cheguem: mandaremos com a conta ou a guia.

Em fevereiro enviamos o informe de {ano_saida} para o Imposto de Renda. Seus dados ficam guardados pelo prazo da lei e depois são apagados (LGPD).

Sucesso no novo endereço!`,
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
  // Régua de cobrança por e-mail (pedido do dono em 2026-11-16): o sistema prepara (regua-email.js) e só sai com a autorização
  // do administrador (#/regua). ``boleto``: o e-mail é de um boleto (alvo { contrato, cobranca }); boleto do C6 e QR Code do Pix anexados,
  // ou o PDF do boleto feito à mão no banco (``boleto:anexado``, decisão do dono de 24/11/2026, DOC-05).
  {
    chave: 'cobranca_antes', nome: 'Lembrete antes do vencimento', etapa: 'Régua de cobrança', boleto: true,
    assunto: 'Lembrete: boleto {boleto_referente} ({imovel}) vence em {vencimento_boleto}',
    anexos: '', prontos: ['boleto:pdf', 'boleto:pix', 'boleto:anexado'],
    texto: `Olá, {nome}, tudo bem?

O boleto {boleto_referente} ({imovel}) vence em {vencimento_boleto}[se nao_util], que não é dia útil: sem multa até {limite_pagamento}[fim]. Valor: {valor_em_dia}[se bonificacao_boleto], já com a bonificação[fim]. Depois de {limite_pagamento}: {valor_cheio}, mais multa de {multa_pct} e juros de {juros_pct} ao mês.
[se pix]
PIX COPIA E COLA
{pix}
[fim][se linha_digitavel]
LINHA DIGITÁVEL
{linha_digitavel}
[fim]
Já pagou? Desconsidere esta mensagem.`,
  },
  {
    chave: 'cobranca_dia', nome: 'Lembrete no dia do vencimento', etapa: 'Régua de cobrança', boleto: true,
    assunto: 'Lembrete: boleto {boleto_referente} ({imovel}) vence hoje',
    anexos: '', prontos: ['boleto:pdf', 'boleto:pix', 'boleto:anexado'],
    texto: `Olá, {nome}, tudo bem?

[se nao_util]O boleto {boleto_referente} ({imovel}) venceu em {vencimento_boleto}, que não é dia útil: pode pagar sem multa até hoje, {limite_pagamento}[senão]O boleto {boleto_referente} ({imovel}) vence hoje, {vencimento_boleto}[fim]. Valor: {valor_em_dia}[se bonificacao_boleto], já com a bonificação[fim]. A partir de amanhã: {valor_cheio}, mais multa de {multa_pct} e juros de {juros_pct} ao mês.
[se pix]
PIX COPIA E COLA
{pix}
[fim][se linha_digitavel]
LINHA DIGITÁVEL
{linha_digitavel}
[fim]
Já pagou? Desconsidere esta mensagem.`,
  },
  {
    chave: 'cobranca_atraso', nome: 'Boleto em atraso', etapa: 'Régua de cobrança', boleto: true,
    assunto: 'Boleto {boleto_referente} em aberto ({imovel})',
    anexos: '', prontos: ['boleto:pdf', 'boleto:pix', 'boleto:anexado'],
    texto: `Olá, {nome}, tudo bem?

O boleto {boleto_referente} ({imovel}), vencido em {vencimento_boleto}, está em aberto ({dias_atraso} dia(s) de atraso). Para pagar hoje ({data_hoje}): {valor_hoje} ({valor_cheio} + multa de {multa_hoje} + juros de {juros_hoje}). Em outro dia o valor muda: responda que mandamos o atualizado.
[se pix]
PIX COPIA E COLA
{pix}
[fim][se linha_digitavel]
LINHA DIGITÁVEL
{linha_digitavel}
[fim]
Já pagou? Desconsidere e, se puder, responda com o comprovante.`,
  },
  // Boleto feito à mão no banco (pedido do dono em 2026-11-24, enquanto a API do C6 não sai): botão "Enviar boleto por e-mail" na
  // página do boleto (alvo { contrato, cobranca }); vai anexado o PDF do banco que a equipe anexou ali. Curto: o descritivo do boleto,
  // o mês de competência, o vencimento e os valores em dia e depois do vencimento.
  {
    chave: 'boleto_envio', nome: 'Boleto do mês (PDF do banco)', etapa: 'Boletos', boleto: true,
    assunto: 'Boleto {boleto_referente} ({imovel}) · vence em {vencimento_boleto}',
    anexos: '', prontos: ['boleto:anexado'],
    texto: `Olá, {nome}, tudo bem?

Segue em anexo o boleto {boleto_referente} ({imovel}).

Mês de competência: {competencia_boleto}
Vencimento: {vencimento_boleto}[se nao_util] (não é dia útil: vale até {limite_pagamento})[fim]
Valor até o vencimento: {valor_em_dia}[se bonificacao_boleto] (com a bonificação)[fim]
Valor depois do vencimento: {valor_cheio}[se multa_juros], mais multa de {multa_pct} e juros de {juros_pct} ao mês[fim]

DESCRITIVO
{descricao_boleto}`,
  },
  // Notificação ao inquilino (pedido do dono em 2026-11-17): ``notificacao``: o e-mail é de uma notificação (alvo { contrato,
  // notificacao }); vai anexada a notificação assinada (ou, sem ela, o PDF para assinar). O contrato aceita notificação por e-mail.
  {
    chave: 'notificacao_envio', nome: 'Notificação ao inquilino', etapa: 'Notificação ao inquilino', notificacao: true,
    assunto: '[se reiteracao]{notificacao_numero} [fim]Notificação: {notificacao_assunto} ({imovel})',
    anexos: '', prontos: ['notificacao:pdf'],
    texto: `Olá, {nome},

Segue a [se reiteracao]{notificacao_numero} [fim]notificação de {notificacao_data} sobre {notificacao_assunto_minusculo} (imóvel da {imovel}).

[se atraso]Prazo para pagar: {prazo_notificacao}, até {data_limite}. A notificação lista os boletos em aberto, com a multa e os juros do atraso. Se precisar, responda para combinarmos um acordo. Depois do pagamento, a baixa é automática.[senão]Prazo para resolver: {prazo_notificacao}, até {data_limite}. Ao terminar, responda com uma foto ou um documento que mostre, para darmos a baixa.[fim] Dúvidas, é só responder.`,
  },
  {
    chave: 'notificacao_lembrete', nome: 'Lembrete do prazo da notificação', etapa: 'Notificação ao inquilino', notificacao: true,
    assunto: 'Lembrete: prazo da notificação de {notificacao_data} termina em {data_limite} ({imovel})',
    anexos: '', prontos: ['notificacao:pdf'],
    texto: `Olá, {nome}, tudo bem?

O prazo da notificação de {notificacao_data}, sobre {notificacao_assunto_minusculo}, termina [se vence_hoje]hoje, {data_limite}[senão]em {data_limite}[fim] (anexa de novo).

[se atraso]Se já pagou, desconsidere este lembrete. Se precisar, responda para combinarmos um acordo de pagamento.[senão]Já resolveu? Responda com uma foto ou um documento, para darmos a baixa. Sem isso no prazo, vale o que está na notificação, inclusive a multa do contrato.[fim]`,
  },
];

/**
 * Trechos dos textos padrão que mudaram (mutirão de 19/11) e também precisam mudar nos modelos já editados e gravados:
 * [chave, texto antigo exato, texto novo]. O trecho só é trocado se ainda estiver igual ao antigo (o resto do texto editado fica).
 */
export const ATUALIZACOES_EMAIL = [
  // termo de aceite da reserva (decisões do dono de 2026-11-24): desistência, prazo dos documentos e devolução em dias úteis
  ['ficha_envio', 'Aprovada a ficha, ela é descontada do primeiro aluguel; não aprovada, ou se você desistir antes de assinar, devolvemos tudo.[senão]', 'Aprovada a ficha, ela é descontada do primeiro aluguel[se termo_aceito], como no termo da reserva que você aceitou em {aceite_data}: não aprovada, devolvemos tudo. {desistencia}[senão]; não aprovada, ou se você desistir antes de assinar, devolvemos tudo.[fim][senão]'],
  ['ficha_envio', 'Depois: análise em até 2 dias úteis,', '[se prazo_documentos]Prazo para mandar a ficha e os documentos: {prazo_documentos} (sem eles, a reserva é cancelada).\n\n[fim]Depois: análise em até 2 dias úteis,'],
  ['ficha_reprovada', '[senão]A reserva de {reserva} será devolvida em até 24 horas úteis, na conta de onde veio o depósito.[fim]', '[senão][se retencao_aplicada]Na conferência, informações ou documentos enviados não corresponderam à realidade, o que conta como desistência no termo da reserva aceito em {aceite_data}: [se devolve_algo]devolvemos {devolver_reserva} e ficamos com {reter_reserva}, em até {dias_devolucao} dias úteis, na conta de onde veio o depósito.[senão]a reserva de {reserva} fica com a empresa, como no termo.[fim][senão]A reserva de {reserva} será devolvida em até {dias_devolucao} dias úteis, na conta de onde veio o depósito.[fim][fim]'],
  ['ficha_devolucao', 'Da reserva, {devolucao_parcial} não foi devolvido: qualquer dúvida, responda este e-mail', 'Da reserva, {devolucao_parcial} não foi devolvido[se termo_aceito], como no termo da reserva aceito em {aceite_data}[fim]: qualquer dúvida, responda este e-mail'],
  ['ficha_envio', 'Link do fiador (encaminhe para ele): {link_fiador}', '{links_fiadores}'],
  ['ficha_aprovada', 'depósito de {valor_deposito} da {tipo_deposito}', 'depósito[se valor_deposito] de {valor_deposito}[fim] da {tipo_deposito}'],
  ['contrato_assinado', '[se dinheiro] Recebemos também a {tipo_deposito} de {valor_deposito} (recibo e comprovante anexos).[fim]',
    '[se dinheiro][se garantia_depositada] Recebemos também a {tipo_deposito} de {valor_deposito} (recibo e comprovante anexos).[senão] Falta o depósito da {tipo_deposito} de {valor_deposito}: mande o comprovante por este e-mail.[fim][fim]'],
  // outro orçamento do inquilino só antes da devolução das chaves (item 3.5 do advogado, 24/11/2026)
  ['saida_aviso', '(o desgaste natural não conta)\n- Vistoria', '(o desgaste natural não conta)\n- Quer trazer outro orçamento para algum reparo? Mande antes da devolução das chaves: depois dela valem os nossos orçamentos\n- Vistoria'],
  ['saida_vistoria', '[senão]paga o valor do orçamento[fim]. O aluguel corre', '[senão]paga o valor do orçamento[fim]. Se quiser apresentar outro orçamento, mande antes da devolução das chaves: depois dela valem os nossos. O aluguel corre'],
  ['saida_chaves', 'Discorda de algo? Responda em até 5 dias úteis, com fotos ou documentos.', 'Discorda da vistoria? Responda em até 5 dias úteis, com fotos ou documentos. Outro orçamento só podia ser apresentado até a devolução das chaves: os valores acima são os dos nossos orçamentos.'],
  ['saida_calculo', '[se cobrar]Segue o boleto do saldo, com o vencimento nele.[fim]',
    '[se cobrar]Falta pagar o saldo de {saldo}: deposite ou faça o Pix na conta abaixo e responda com o comprovante.\n{conta_deposito}[fim]'],
  // boleto do saldo da saída (decisão do dono, 2026-11-20): com o boleto gerado, o e-mail volta a dizer "Segue o boleto do saldo"
  ['saida_calculo', '[se cobrar]Falta pagar o saldo de {saldo}: deposite ou faça o Pix na conta abaixo e responda com o comprovante.\n{conta_deposito}[fim]',
    '[se cobrar][se boleto_saldo]Segue o boleto do saldo de {saldo}, com vencimento em {boleto_saldo_vencimento}.[se boleto_saldo_linha]\nLinha digitável: {boleto_saldo_linha}[fim][se boleto_saldo_pix]\nPix copia e cola: {boleto_saldo_pix}[fim][senão]Falta pagar o saldo de {saldo}: deposite ou faça o Pix na conta abaixo e responda com o comprovante.\n{conta_deposito}[fim][fim]'],
];

/** Aplica ATUALIZACOES_EMAIL num texto gravado do modelo ``chave``. */
export function atualizarTextoEmail(chave, texto) {
  let t = String(texto ?? '');
  for (const [k, antigo, novo] of ATUALIZACOES_EMAIL) if (k === chave && t.includes(antigo)) t = t.split(antigo).join(novo);
  return t;
}

/** Modelo de e-mail em uso: o gravado (Sistema → Comunicação E-mail → Modelos de e-mail) ou o padrão. */
export function modeloEmail(d, chave) {
  const padrao = MODELOS_EMAIL.find((m) => m.chave === chave);
  if (!padrao) return null;
  const salvo = (d.modelos_email || []).find((m) => m.chave === chave);
  return salvo ? { ...padrao, assunto: salvo.assunto ?? padrao.assunto, texto: salvo.texto == null ? padrao.texto : atualizarTextoEmail(chave, salvo.texto), id: salvo.id, editado: true } : { ...padrao };
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
  return { assunto: preencherEmail(modelo.assunto, dados).replace(/\s+/g, ' '), texto: `${preencherEmail(modelo.texto, dados)}\n\n${fechoEmail(dados.remetente)}` };
}
