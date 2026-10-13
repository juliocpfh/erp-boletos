// Campos de cada cadastro, desenho dos formulários e leitura do que foi digitado.
import { centavos, numero } from './calculos.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const campo = (nome, rotulo, tipo = 'texto', extra = {}) => ({ nome, rotulo, tipo, ...extra });
const secao = (titulo) => ({ secao: titulo });

/** Mostra o campo só quando outro campo tem um destes valores (caixa de seleção marcada = '1'). */
const quando = (campoNome, ...valores) => ({ mostrarSe: { campo: campoNome, valores } });
const GARANTIA_FIADOR = quando('garantia_tipo', 'Fiador', 'Fiador + depósito');
/** Limites de texto para não estourar as linhas da NF (planilha). */
export const LIMITES = { tomador_nome: 60, tomador_endereco: 70, municipio: 25, observacoes_nf: 450 };

export const IMOVEL = [
  secao('Identificação'),
  campo('nome', 'Nome do imóvel', 'texto', { obrig: true, ajuda: 'Ex.: Loja 1 - Nilo Brandão' }),
  campo('endereco', 'Endereço', 'texto', { obrig: true, largo: true, max: 55, ajuda: 'Aparece na NF junto com o complemento' }),
  campo('complemento', 'Complemento', 'texto', { max: 25 }),
  campo('bairro', 'Bairro'),
  campo('cidade', 'Cidade (município)', 'texto', { max: LIMITES.municipio }),
  campo('cep', 'CEP'),
  secao('Registros'),
  campo('matricula', 'Matrícula'),
  campo('sublote', 'Identificação do sublote', 'texto', { ajuda: 'Para imóveis que são sublotes internos. Ex.: Sublote 3' }),
  campo('inscricao_iptu', 'Inscrição imobiliária (IPTU)'),
  campo('copel_uc', 'Unidade consumidora Copel'),
  campo('copel_medidor', 'Nº do medidor Copel'),
  campo('sanepar_matricula', 'Matrícula Sanepar'),
  campo('sanepar_hidrometro', 'Código do hidrômetro Sanepar'),
  campo('administradora_nome', 'Administradora do condomínio'),
  campo('area_comum', 'Pátio e portão eletrônico de uso comum', 'simnao', { ajuda: 'Marcado: o contrato inclui as cláusulas de frente desobstruída, pátio comum e portão eletrônico' }),
  campo('chaves', 'Chaves e controles entregues ao inquilino', 'area', { ajuda: 'Um por linha, com a quantidade (ex.: 01 Chave tetra da porta de entrada). Entra na vistoria e no recibo de entrega das chaves' }),
  campo('gas_relogio', 'Relógio de gás (nº / identificação)'),
  campo('internet', 'Contrato de internet ou nº do telefone'),
  secao('Área e energia'),
  campo('area_util', 'Área útil (m²)', 'pct'),
  campo('area_total', 'Área total (m²)', 'pct'),
  campo('energia_ligada', 'Energia ligada', 'opcao', { opcoes: ['Sim', 'Não'] }),
  campo('energia_tipo', 'Tipo de ligação da energia', 'opcao', { opcoes: ['Monofásica', 'Bifásica', 'Trifásica'] }),
  secao('Valor do imóvel'),
  campo('valor_imovel', 'Valor do imóvel (R$)', 'dinheiro', { ajuda: 'Usado na página Resultados para o retorno sobre o valor' }),
  campo('valor_data', 'Data do valor', 'data', { ajuda: 'Data da compra ou da avaliação' }),
  secao('Último anúncio'),
  campo('anuncio_descricao', 'Descrição do anúncio', 'area', { largo: true }),
  secao('Observações'),
  campo('verificar', 'Pontos a verificar (aparece em amarelo)', 'area'),
  campo('observacoes', 'Observações', 'area'),
];

/** Histórico de solicitações do inquilino: pequenos reparos e pedidos, com o que foi feito. */
export const SOLICITACAO = [
  campo('data', 'Data do pedido', 'data', { obrig: true }),
  campo('situacao', 'Situação', 'opcao', { obrig: true, padrao: 'Aberta', opcoes: ['Aberta', 'Em andamento', 'Concluída', 'Não atendida'] }),
  campo('descricao', 'O que o inquilino pediu', 'area', { obrig: true, largo: true, ajuda: 'Ex.: vazamento na torneira da cozinha' }),
  campo('providencia', 'O que foi feito', 'area', { largo: true }),
  campo('responsavel', 'Quem fez (prestador)'),
  campo('data_conclusao', 'Concluído em', 'data'),
  campo('valor', 'Custo', 'dinheiro'),
  campo('pago_por', 'Custo por conta de', 'opcao', { opcoes: ['Proprietário', 'Inquilino', 'Sem custo'] }),
];

export const REFORMA = [
  campo('data', 'Data', 'data', { obrig: true }),
  campo('descricao', 'O que foi feito', 'texto', { obrig: true, largo: true, ajuda: 'Ex.: troca do telhado, pintura completa' }),
  campo('valor', 'Valor investido', 'dinheiro', { obrig: true }),
  campo('fornecedor', 'Fornecedor / prestador'),
  campo('documento', 'Nota fiscal / recibo nº'),
  campo('observacoes', 'Observações', 'area'),
];

/** Contas do imóvel e quem paga cada uma, conforme o contrato. */
export const CONTAS = [['conta_agua', 'Água'], ['conta_energia', 'Energia'], ['conta_gas', 'Gás'], ['conta_condominio', 'Condomínio'], ['conta_internet', 'Internet / TV']];
export const SITUACOES_CONTA = ['Por conta do inquilino', 'Incluso no aluguel', 'Não tem'];
/** Relógios lidos na entrada e na saída do inquilino. */
export const LEITURAS = [['agua', 'Relógio de água'], ['energia', 'Relógio de energia'], ['gas', 'Relógio de gás']];

export const LEITURA = [
  campo('data', 'Data da leitura', 'data', { obrig: true }),
  campo('momento', 'Momento', 'opcao', { obrig: true, padrao: 'Entrada do inquilino', opcoes: ['Entrada do inquilino', 'Saída do inquilino', 'Outra'] }),
  ...LEITURAS.map(([nome, rotulo]) => campo(nome, rotulo)),
  campo('observacoes', 'Observações', 'area'),
];

/** Vincular ao imóvel um inquilino já cadastrado, com a leitura dos relógios na entrada. */
export const VINCULO = [
  campo('contrato_id', 'Inquilino', 'opcao', { obrig: true, opcoes: [], ajuda: 'Inquilino que já está em outro imóvel ganha um contrato novo para este imóvel' }),
  campo('data_entrada', 'Data de entrada no imóvel', 'data', { obrig: true }),
  secao('Leitura dos relógios na entrada'),
  ...LEITURAS.map(([nome, rotulo], n) => campo(`leitura_${nome}`, rotulo, 'texto', { ajuda: n ? '' : 'O número que aparece no relógio. Fica no histórico de leituras do imóvel' })),
];

/** Qualificação da pessoa no contrato (nacionalidade, estado civil, profissão, nascimento, endereço). */
export const GENEROS = ['Masculino', 'Feminino'];
export const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'Separado(a)', 'União estável'];
const qualificacao = (prefixo, extra = {}, comEndereco = true) => [
  campo(`${prefixo}genero`, 'Sexo (para o contrato)', 'opcao', { opcoes: GENEROS, ...extra }),
  campo(`${prefixo}nacionalidade`, 'Nacionalidade', 'texto', { padrao: 'brasileira', ...extra }),
  campo(`${prefixo}estado_civil`, 'Estado civil', 'opcao', { opcoes: ESTADOS_CIVIS, ...extra }),
  campo(`${prefixo}profissao`, 'Profissão', 'texto', extra),
  campo(`${prefixo}nascimento`, 'Data de nascimento', 'data', extra),
  ...(comEndereco ? [campo(`${prefixo}endereco`, 'Endereço (residência ou comercial)', 'texto', { largo: true, ...extra })] : []),
];

export const FIADOR = [
  campo('nome', 'Nome', 'texto', { obrig: true, largo: true }),
  campo('cpf', 'CPF'),
  campo('rg', 'RG'),
  campo('telefone', 'Telefone', 'tel'),
  campo('email', 'E-mail', 'email'),
  campo('endereco', 'Endereço', 'texto', { largo: true }),
  ...qualificacao('', {}, false),
  campo('imovel_garantia', 'Imóvel do fiador (endereço, matrícula e registro)', 'area', { largo: true, ajuda: 'Ex.: Rua Abílio Peixoto, 359, Curitiba/PR, matrícula 53.271 da 9ª Circunscrição. Aparece no contrato' }),
  campo('data_entrada', 'Início do vínculo', 'data', { ajuda: 'Em branco: desde o início do contrato' }),
  campo('data_saida', 'Fim do vínculo', 'data', { ajuda: 'Em branco: até o fim do contrato. Depois desta data vai para "Fiadores anteriores"' }),
  campo('observacoes', 'Observações', 'area'),
];

/** Dois fiadores direto no cadastro do inquilino (campos fiador1_nome, fiador2_nome...). */
export const CAMPOS_FIADOR = FIADOR.filter((c) => c.nome !== 'observacoes');
const fiadoresNoCadastro = () => [1, 2].flatMap((n) => [
  { secao: n === 1 ? 'Fiador' : '2º fiador (se houver)', fiador: n, ...GARANTIA_FIADOR },
  ...CAMPOS_FIADOR.map((c) => ({ ...c, nome: `fiador${n}_${c.nome}`, obrig: false, fiador: n, ...GARANTIA_FIADOR,
    ajuda: n === 1 && c.nome === 'nome' ? 'Pode cadastrar aqui ou depois, na página do inquilino' : c.ajuda })),
]);

const PJ = quando('inquilino_tipo', 'Pessoa jurídica (empresa)');
const SOLIDARIO = quando('tem_solidario', '1');

export const CONTRATO = [
  secao('Imóvel e situação'),
  campo('imovel_id', 'Imóvel', 'opcao', { opcoes: [], soEditar: true, ajuda: 'Para vincular a um imóvel, use "Vincular inquilino" na página do imóvel. Em branco: sem imóvel (não gera boleto)' }),
  campo('ativo', 'Inquilino ativo', 'simnao', { padrao: true, ajuda: 'Desmarcado: não gera boleto e vai para a lista de inativos' }),
  campo('gerar_nf', 'Emite NF (desmarcado: boleto de controle)', 'simnao', { padrao: true, ajuda: 'Boleto de controle: o pagamento é controlado (em dia ou atrasado), mas não gera NF nem entra nas somas dos boletos e nos resultados' }),
  secao('Inquilino (responsável pelo contrato)'),
  campo('inquilino_tipo', 'Tipo', 'opcao', { obrig: true, padrao: 'Pessoa física', opcoes: ['Pessoa física', 'Pessoa jurídica (empresa)'] }),
  campo('inquilino_nome', 'Nome completo / razão social', 'texto', { obrig: true, largo: true, max: LIMITES.tomador_nome, ajuda: 'O boleto e a NF saem neste nome' }),
  campo('inquilino_apelido', 'Apelido / nome fantasia'),
  campo('inquilino_telefone', 'Telefone', 'tel'),
  campo('inquilino_whatsapp', 'Este telefone é WhatsApp', 'simnao'),
  campo('inquilino_email', 'E-mail', 'email'),
  campo('inquilino_cpf', 'CPF / CNPJ'),
  campo('inquilino_rg', 'RG / inscrição estadual'),
  ...qualificacao('inquilino_', quando('inquilino_tipo', 'Pessoa física'), false),
  campo('inquilino_endereco', 'Endereço (residência, comercial ou sede da empresa)', 'texto', { largo: true }),
  campo('responsavel_nome', 'Outro contato (se houver)'),
  campo('responsavel_telefone', 'Telefone do contato', 'tel'),
  campo('responsavel_email', 'E-mail do contato', 'email'),
  campo('contrato_anterior_id', 'Continua o contrato de', 'opcao', { opcoes: [], ajuda: 'Ex.: alteração de titular. Liga o histórico dos dois inquilinos' }),
  { secao: 'Representante da empresa (pessoa física)', ...PJ },
  campo('representante_nome', 'Nome do representante', 'texto', { largo: true, ...PJ, ajuda: 'Obrigatório para empresa: sócio ou responsável que assina' }),
  campo('representante_cpf', 'CPF do representante', 'texto', PJ),
  campo('representante_rg', 'RG do representante', 'texto', PJ),
  campo('representante_cargo', 'Cargo', 'texto', PJ),
  ...qualificacao('representante_', PJ),
  campo('representante_telefone', 'Telefone do representante', 'tel', PJ),
  campo('representante_email', 'E-mail do representante', 'email', PJ),
  secao('Inquilino solidário'),
  campo('tem_solidario', 'Tem inquilino solidário', 'simnao', { virtual: true, ajuda: 'Marque para cadastrar quem assina o contrato junto' }),
  campo('solidario_nome', 'Nome do inquilino solidário', 'texto', { largo: true, ...SOLIDARIO, ajuda: 'O boleto continua saindo no nome do inquilino principal' }),
  campo('solidario_cpf', 'CPF / CNPJ do solidário', 'texto', SOLIDARIO),
  campo('solidario_rg', 'RG do solidário', 'texto', SOLIDARIO),
  campo('solidario_telefone', 'Telefone do solidário', 'tel', SOLIDARIO),
  campo('solidario_email', 'E-mail do solidário', 'email', SOLIDARIO),
  ...qualificacao('solidario_', SOLIDARIO),
  secao('Garantia'),
  campo('garantia_tipo', 'Tipo de garantia', 'opcao', { obrig: true, opcoes: ['Caução', 'Depósito garantia', 'Fiador', 'Fiador + depósito', 'Seguro fiança', 'Sem garantia'] }),
  campo('caucao_valor', 'Valor da caução', 'dinheiro', quando('garantia_tipo', 'Caução')),
  campo('caucao_data', 'Data em que a caução foi dada', 'data', quando('garantia_tipo', 'Caução')),
  campo('caucao_meses', 'Caução equivale a quantos aluguéis', 'inteiro', { ...quando('garantia_tipo', 'Caução'), ajuda: 'Usado para sugerir o novo valor quando o aluguel for corrigido' }),
  campo('deposito_valor', 'Valor do depósito de garantia', 'dinheiro', quando('garantia_tipo', 'Depósito garantia', 'Fiador + depósito')),
  campo('deposito_data', 'Data do depósito', 'data', quando('garantia_tipo', 'Depósito garantia', 'Fiador + depósito')),
  campo('deposito_uso', 'Quando e onde o depósito será usado', 'texto', { largo: true, ...quando('garantia_tipo', 'Depósito garantia', 'Fiador + depósito'), ajuda: 'Ex.: abatido nos dois últimos aluguéis do contrato' }),
  ...fiadoresNoCadastro(),
  secao('Reserva dada na visita'),
  campo('reserva_valor', 'Valor da reserva', 'dinheiro'),
  campo('reserva_data', 'Data da reserva', 'data'),
  campo('reserva_competencia', 'Usar a reserva no aluguel de', 'mes', { ajuda: 'Em branco: usa no primeiro aluguel' }),
  secao('Objeto da locação (para o contrato)'),
  campo('finalidade', 'Finalidade', 'opcao', { padrao: 'Residencial', opcoes: ['Residencial', 'Não residencial'] }),
  campo('atividade', 'Atividade do estabelecimento', 'texto', { ...quando('finalidade', 'Não residencial'), ajuda: 'Ex.: studio de beleza' }),
  campo('descricao_objeto', 'Descrição do imóvel no contrato', 'texto', { largo: true, ajuda: 'Ex.: um apartamento mobiliado, com utensílios de cozinha e decoração; ou uma loja comercial, sem vaga de garagem' }),
  secao('Datas e prazo'),
  campo('data_entrada', 'Data de entrada', 'data', { obrig: true }),
  campo('data_saida', 'Data de saída', 'data', { ajuda: 'Use o botão "Registrar saída" na página do inquilino para fazer o cálculo final' }),
  campo('vigencia_inicio', 'Início do contrato', 'data', { obrig: true }),
  campo('prazo_tipo', 'Prazo', 'opcao', { obrig: true, padrao: 'Determinado', opcoes: ['Determinado', 'Indeterminado'] }),
  campo('prazo_meses', 'Prazo do contrato (meses)', 'inteiro', { ...quando('prazo_tipo', 'Determinado'), ajuda: 'Ex.: 30 meses a partir de 05/09/2026 terminam em 05/03/2029 (mesmo dia)' }),
  campo('renovacao_automatica', 'Renovação automática', 'simnao'),
  secao('Valores e boleto'),
  campo('aluguel_inicial', 'Aluguel inicial (valor cheio, histórico)', 'dinheiro', { obrig: true }),
  campo('dia_vencimento', 'Dia do vencimento', 'inteiro', { obrig: true, padrao: 10 }),
  campo('cobranca_mes_seguinte', 'O aluguel do mês vence no mês seguinte', 'simnao', { padrao: true, ajuda: 'Marcado: aluguel de julho vence em agosto' }),
  campo('bonificacao', 'Tem bonificação (desconto) por pontualidade', 'simnao', { padrao: true }),
  campo('aluguel_bonificado', 'Aluguel com bonificação (R$)', 'dinheiro', { virtual: true, vinculo: 'desconto', ajuda: 'Digite o valor que o inquilino paga em dia: o % é calculado' }),
  campo('desconto_pontualidade_percentual', 'Bonificação (%)', 'pct', { vinculo: 'desconto', ajuda: 'Ou digite o % e o aluguel com bonificação é calculado' }),
  campo('taxa_boleto', 'Tarifa de emissão do boleto (R$)', 'dinheiro', { ajuda: 'Entra no boleto e na descrição do boleto' }),
  campo('multa_percentual', 'Multa por atraso (%)', 'pct', { padrao: 2 }),
  campo('juros_mensal_percentual', 'Juros por atraso (% ao mês)', 'pct', { padrao: 1 }),
  secao('Correção anual'),
  campo('indice_correcao', 'Índice de correção previsto no contrato', 'opcao', { lista: 'indices', ajuda: 'Use "Editar lista" para incluir outro índice (ex.: IGP-M/IPCA, o maior dos dois, como prevê o contrato)' }),
  campo('data_base_correcao', 'Data-base da correção', 'data', { ajuda: 'O alerta de correção usa o aniversário desta data. Em branco: início do contrato' }),
  secao('O que está incluso no contrato'),
  campo('conta_iptu', 'IPTU', 'opcao', { obrig: true, padrao: 'Por conta do inquilino', opcoes: SITUACOES_CONTA, ajuda: 'Por conta do inquilino: as parcelas entram no boleto' }),
  campo('conta_seguro', 'Seguro obrigatório', 'opcao', { obrig: true, padrao: 'Por conta do inquilino', opcoes: SITUACOES_CONTA, ajuda: 'Por conta do inquilino: as parcelas entram no boleto' }),
  ...CONTAS.map(([nome, rotulo]) => campo(nome, rotulo, 'opcao', { opcoes: SITUACOES_CONTA })),
  campo('contas_adicionais', 'Contas ou cobranças adicionais previstas no contrato', 'area', { ajuda: 'Ex.: taxa de lixo, limpeza da área comum, rateio de água' }),
  secao('Carência de aluguel'),
  campo('carencia_meses', 'Meses de carência', 'inteiro', { ajuda: 'Nestes meses o aluguel não é cobrado. Em branco: sem carência' }),
  campo('carencia_inicio', 'Carência a partir do aluguel de', 'mes', { ajuda: 'Em branco: mês de entrada' }),
  campo('carencia_cobrar_iptu', 'Na carência, cobrar o IPTU', 'simnao'),
  campo('carencia_cobrar_seguro', 'Na carência, cobrar o seguro', 'simnao'),
  campo('carencia_cobrar_taxa', 'Na carência, cobrar a tarifa do boleto', 'simnao'),
  secao('Vistoria de entrada'),
  campo('vistoria_link', 'Link da pasta de fotos da vistoria de entrada', 'url', { largo: true, ajuda: 'Cole o link da pasta na nuvem (OneDrive, Google Drive) onde está o .rar das fotos' }),
  secao('Termo aditivo'),
  campo('possui_aditivos', 'O contrato possui termo aditivo', 'simnao', { ajuda: 'Marcado sozinho quando muda o vencimento ou a garantia. Anexe o termo em "Arquivos do inquilino"' }),
  secao('Observações'),
  campo('verificar', 'Pontos a verificar (aparece em amarelo)', 'area'),
  campo('observacoes', 'Observações', 'area'),
];

export const CORRECAO = [
  campo('data_vigencia', 'Vale a partir de', 'data', { obrig: true, ajuda: 'O boleto de um mês usa o valor vigente no dia 1º daquele mês' }),
  campo('indice', 'Índice usado nesta correção', 'opcao', { obrig: true, lista: 'indices', ajuda: 'O índice previsto no contrato fica guardado junto, no histórico' }),
  campo('data_indice', 'Mês de referência do índice', 'mes', { ajuda: 'Ex.: índice acumulado até 2026-05' }),
  campo('percentual', 'Percentual do índice (%)', 'pct', { ajuda: 'Informe o percentual ou o novo valor' }),
  campo('valor_novo', 'Novo valor do aluguel', 'dinheiro'),
  campo('observacoes', 'Observações', 'area'),
];

export const SEGURO = [
  campo('seguradora', 'Seguradora'),
  campo('apolice', 'Nº da apólice'),
  campo('data_contratacao', 'Data de contratação', 'data'),
  campo('vigencia_inicio', 'Início da vigência', 'data', { obrig: true }),
  campo('vigencia_fim', 'Fim da vigência', 'data', { obrig: true }),
  campo('valor_total', 'Valor total', 'dinheiro', { obrig: true }),
  campo('num_parcelas', 'Número de parcelas', 'inteiro', { obrig: true, padrao: 1 }),
  campo('primeira_competencia', 'Cobrar 1ª parcela no aluguel de', 'mes', { obrig: true }),
  campo('observacoes', 'Observações', 'area'),
];

export const IPTU = [
  campo('ano', 'Ano', 'inteiro', { obrig: true }),
  campo('valor_total', 'Valor total do IPTU parcelado', 'dinheiro', { obrig: true, ajuda: 'É o valor repassado ao inquilino, mesmo quando o proprietário paga à vista com desconto' }),
  campo('num_parcelas', 'Número de parcelas', 'inteiro', { obrig: true, padrao: 10 }),
  campo('valor_parcela', 'Valor fixo cobrado por parcela (opcional)', 'dinheiro', { ajuda: 'Ex.: arredondar para R$ 213,00. Em branco: total ÷ parcelas' }),
  campo('vencimento_primeira', 'Vencimento da 1ª parcela na prefeitura', 'data', { ajuda: 'Data da guia. As demais vencem no mesmo dia dos meses seguintes. Usado no controle e nos alertas do que o proprietário paga' }),
  campo('primeiro_vencimento_boleto', 'Mês de vencimento do 1º boleto do inquilino com IPTU', 'mes', { obrig: true, ajuda: 'Ex.: 2026-03 = a 1ª parcela entra no boleto que vence em março. As demais seguem mês a mês, pelo número de parcelas' }),
  secao('Pagamento à vista pelo proprietário'),
  campo('pago_avista', 'Proprietário quitou o IPTU à vista (cota única)', 'simnao'),
  campo('valor_avista', 'Valor pago à vista (com desconto)', 'dinheiro', { ...quando('pago_avista', '1'), ajuda: 'O inquilino continua pagando o valor parcelado' }),
  campo('data_quitacao', 'Data da quitação', 'data', { ...quando('pago_avista', '1'), ajuda: 'Em branco: ainda não pago (fica nos alertas)' }),
  campo('cobranca_inquilino', 'Como cobrar do inquilino que entrar depois', 'opcao', { ...quando('pago_avista', '1'), padrao: 'Parcelas normais nos meses em que ocupar',
    opcoes: ['Parcelas normais nos meses em que ocupar', 'Proporcional: 1/12 do valor por mês ocupado no ano', 'Não cobrar do inquilino'] }),
  campo('observacoes', 'Observações', 'area'),
];

export const TITULARIDADE = [
  campo('concessionaria', 'Concessionária', 'opcao', { obrig: true, lista: 'concessionarias' }),
  campo('contrato_id', 'Inquilino', 'opcao', { opcoes: [], ajuda: 'Em branco se a conta voltou para o proprietário' }),
  campo('tipo', 'Tipo', 'opcao', { opcoes: ['Para o inquilino', 'Volta para o proprietário'] }),
  campo('protocolo', 'Nº do protocolo'),
  campo('data', 'Data', 'data'),
  campo('situacao', 'Situação', 'opcao', { opcoes: ['Solicitado', 'Concluído', 'Pendente'] }),
  campo('observacoes', 'Observações', 'area'),
];

export const TROCA_FIADOR = [campo('data_troca', 'Data da troca', 'data', { obrig: true, ajuda: 'É o início do vínculo do novo fiador' }), ...FIADOR.filter((c) => c.nome !== 'data_entrada')];

export const TROCA_GARANTIA = [
  campo('data', 'Data da troca', 'data', { obrig: true }),
  ...CONTRATO.filter((c) => ['garantia_tipo', 'caucao_valor', 'caucao_data', 'caucao_meses', 'deposito_valor', 'deposito_data', 'deposito_uso'].includes(c.nome))
    .map((c) => (c.nome === 'garantia_tipo' ? { ...c, rotulo: 'Nova garantia', ajuda: 'Os fiadores são cadastrados depois, na página do inquilino' } : c)),
  campo('observacoes', 'O que aconteceu com a garantia anterior', 'area', { ajuda: 'Ex.: caução devolvida em 10/10/2026 por PIX' }),
];

export const APLICACAO = [
  campo('data', 'Data da aplicação', 'data', { obrig: true }),
  campo('emitente_id', 'Empresa onde foi aplicado', 'opcao', { obrig: true, opcoes: [] }),
  campo('valor', 'Valor aplicado', 'dinheiro', { obrig: true }),
  campo('observacoes', 'Observações (banco, aplicação)', 'area'),
];

export const CORRECAO_GARANTIA = [
  campo('data', 'Data', 'data', { obrig: true }),
  campo('valor_novo', 'Novo valor da caução', 'dinheiro', { obrig: true }),
  campo('complemento', 'Complemento pago pelo inquilino', 'dinheiro', { ajuda: 'Em branco: diferença entre o novo e o anterior' }),
  campo('observacoes', 'Observações', 'area'),
];

export const RENOVACAO = [
  campo('data', 'Data', 'data', { obrig: true, ajuda: 'O novo valor (se houver) vale a partir desta data' }),
  campo('tipo', 'O que aconteceu', 'opcao', { obrig: true, opcoes: ['Renovado com nova data de término', 'Passou a prazo indeterminado', 'Novo valor negociado'] }),
  campo('nova_vigencia_fim', 'Nova data de término', 'data', { ajuda: 'Só para renovação com prazo determinado' }),
  campo('novo_valor', 'Novo valor do aluguel negociado (valor cheio)', 'dinheiro'),
  campo('observacoes', 'Observações', 'area'),
];

export const ENCERRAMENTO = [
  campo('data_saida', 'Data de saída', 'data', { obrig: true }),
  ...LEITURAS.map(([nome, rotulo]) => campo(`leitura_${nome}`, `${rotulo} na saída`)),
  campo('garantia_valor', 'Valor da garantia a devolver (caução ou depósito)', 'dinheiro'),
  campo('indice_percentual', 'Correção da garantia: índice da poupança no período (%)', 'pct'),
  campo('debitos', 'Débitos do inquilino a descontar', 'dinheiro', { ajuda: 'Aluguéis e encargos em aberto, reparos da vistoria etc.' }),
  campo('debitos_descricao', 'Descrição dos débitos', 'area'),
  campo('vistoria_saida', 'Vistoria de saída', 'opcao', { opcoes: ['Sem pendências', 'Com pendências', 'Contestada', 'Não feita'] }),
  campo('observacoes', 'Observações', 'area'),
];

export const AVULSA = [
  campo('data_pagamento', 'Data em que o dinheiro entrou', 'data', { obrig: true }),
  campo('valor', 'Valor da NF', 'dinheiro', { obrig: true }),
  campo('descricao', 'Descrição', 'texto', { largo: true, ajuda: 'Ex.: Airbnb outubro, aluguel de vaga, reembolso' }),
  campo('imovel_id', 'Imóvel (opcional)', 'opcao', { opcoes: [], ajuda: 'Se escolher, usa as empresas e o endereço do imóvel' }),
  campo('periodo_inicio', 'Período: de', 'data'),
  campo('periodo_fim', 'Período: até', 'data'),
  campo('tomador_nome', 'Cliente na NF', 'texto', { obrig: true, largo: true, max: LIMITES.tomador_nome }),
  campo('tomador_documento', 'CPF / CNPJ do cliente'),
  campo('tomador_telefone', 'Telefone do cliente', 'tel'),
  campo('tomador_endereco', 'Endereço na NF', 'texto', { largo: true, max: LIMITES.tomador_endereco }),
  campo('municipio', 'Município', 'texto', { padrao: 'CURITIBA', max: LIMITES.municipio }),
  campo('observacoes_nf', 'Observações impressas na NF', 'area', { max: LIMITES.observacoes_nf, ajuda: 'Aparecem na caixa grande da NF (até 5 linhas)' }),
  campo('observacoes', 'Observações internas', 'area'),
];

export const EMITENTE = [
  campo('nome', 'Nome no topo da NF', 'texto', { obrig: true, ajuda: 'Ex.: ANK ADMINISTRADORA' }),
  campo('razao_social', 'Razão social', 'texto', { obrig: true, largo: true }),
  campo('cnpj', 'CNPJ'),
  campo('endereco', 'Endereço (como aparece na NF)', 'texto', { largo: true }),
  campo('municipio', 'Município do serviço', 'texto', { padrao: 'CURITIBA' }),
  campo('aba_modelo', 'Aba no modelo Excel', 'texto', { ajuda: 'Nome da aba do modelo para esta empresa (ex.: ANK)' }),
  campo('ativo', 'Ativa', 'simnao', { padrao: true }),
  secao('Para o contrato de locação'),
  campo('endereco_sede', 'Endereço da sede (por extenso)', 'texto', { largo: true, ajuda: 'Ex.: Rua Professor Nilo Brandão, nº 117, São Lourenço, Curitiba, Paraná' }),
  campo('representante_nome', 'Representante que assina', 'texto', { largo: true, ajuda: 'Ex.: AIDA APARECIDA NUNES KRASINSKI' }),
  campo('representante_cargo', 'Cargo do representante', 'texto', { padrao: 'sócia administradora' }),
  campo('representante_rg', 'RG do representante'),
  campo('representante_cpf', 'CPF do representante'),
  ...qualificacao('representante_', {}, false),
];

export const USUARIO = [
  campo('login', 'Login', 'texto', { obrig: true }),
  campo('nome', 'Nome', 'texto', { obrig: true }),
  campo('papel', 'Perfil', 'opcao', { obrig: true, opcoes: [['admin', 'Administrador'], ['operador', 'Operador (edita)'], ['consulta', 'Consulta (só vê)']] }),
  campo('ativo', 'Ativo', 'simnao', { padrao: true }),
];

export const COBRANCA = [
  campo('vencimento', 'Vencimento', 'data', { obrig: true }),
  campo('aluguel', 'Aluguel', 'dinheiro', { obrig: true }),
  campo('desconto', 'Desconto de pontualidade', 'dinheiro'),
  campo('iptu', 'IPTU', 'dinheiro'),
  campo('seguro', 'Seguro', 'dinheiro'),
  campo('taxa_boleto', 'Taxa do boleto', 'dinheiro'),
  campo('outros', 'Ajuste do mês: cobrança adicional (+) ou ressarcimento (−)', 'dinheiro', { ajuda: 'Valor negativo desconta do boleto. Ex.: -150,00' }),
  campo('outros_descricao', 'Motivo do ajuste', 'texto', { ajuda: 'Ex.: reforma do banheiro, acerto do mês anterior' }),
  campo('reserva_utilizada', 'Reserva utilizada', 'dinheiro'),
  campo('multa_percentual', 'Multa por atraso (%)', 'pct'),
  campo('juros_mensal_percentual', 'Juros por atraso (% ao mês)', 'pct'),
  campo('observacoes_nf', 'Observações impressas na NF', 'area', { max: LIMITES.observacoes_nf, ajuda: 'Aparecem na caixa grande da NF (até 5 linhas)' }),
  campo('observacoes', 'Observações', 'area'),
];

// --------------------------------------------------------------------------
export function dinheiroTexto(c) {
  if (c === null || c === undefined || c === '') return '';
  return (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pctTexto(n) {
  if (n === null || n === undefined || n === '') return '';
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 4, useGrouping: false });
}

/** Valores de um registro no formato que aparece nos campos da tela. */
export function paraFormulario(campos, registro) {
  const v = {};
  for (const c of campos) {
    if (!c.nome) continue;
    let x = registro ? registro[c.nome] : c.padrao;
    if (x === undefined || x === null) x = '';
    if (c.tipo === 'dinheiro' && x !== '') x = dinheiroTexto(x);
    else if (c.tipo === 'pct' && x !== '') x = pctTexto(x);
    v[c.nome] = x;
  }
  return v;
}

/** Converte o formulário enviado. Devolve { dados, erros }. */
export function ler(campos, form) {
  const fd = form instanceof FormData ? form : new FormData(form);
  const dados = {};
  const erros = {};
  for (const c of campos) {
    if (!c.nome || c.virtual) continue;
    const bruto = String(fd.get(c.nome) ?? '').trim();
    if (c.tipo === 'simnao') {
      dados[c.nome] = fd.get(c.nome) === '1';
      continue;
    }
    if (!bruto) {
      if (c.obrig) erros[c.nome] = 'Campo obrigatório';
      dados[c.nome] = null;
      continue;
    }
    try {
      if (c.tipo === 'dinheiro') dados[c.nome] = centavos(bruto);
      else if (c.tipo === 'pct') dados[c.nome] = numero(bruto);
      else if (c.tipo === 'inteiro') {
        const n = numero(bruto);
        if (!Number.isInteger(n)) throw new Error();
        dados[c.nome] = n;
      } else if (c.tipo === 'data') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) throw new Error();
        dados[c.nome] = bruto;
      } else if (c.tipo === 'mes') {
        if (!/^\d{4}-\d{2}$/.test(bruto)) throw new Error();
        dados[c.nome] = bruto;
      } else if (c.tipo === 'url') {
        const u = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
        if (/\s/.test(u) || !u.includes('.')) throw new Error();
        dados[c.nome] = u;
      } else if (c.tipo === 'opcao' && c.nome.endsWith('_id')) dados[c.nome] = Number(bruto);
      else dados[c.nome] = c.max ? bruto.slice(0, c.max) : bruto;
    } catch {
      erros[c.nome] = 'Valor inválido';
    }
  }
  return { dados, erros };
}

/** Caixa para editar uma lista de opções (incluir e remover), aberta pelo botão "Editar lista". */
function editorLista(c) {
  const itens = c.opcoes.map((o) => (Array.isArray(o) ? o[0] : o));
  return `<button type="button" class="link-botao" data-acao="abrirLista" data-lista="${c.lista}">Editar lista</button>
    <div class="editor-lista" data-editor="${c.lista}" hidden>
      <div class="chips">${itens.map((v) => `<span class="chip">${esc(v)}<button type="button" title="Remover da lista" data-acao="removerDaLista" data-lista="${c.lista}" data-valor="${esc(v)}">×</button></span>`).join('')}</div>
      <div class="acoes"><input data-lista-novo="${c.lista}" placeholder="Nome para incluir" style="max-width:240px"><button type="button" class="pequeno" data-acao="incluirNaLista" data-lista="${c.lista}">OK</button></div>
      <div class="ajuda">Só dá para remover o que não estiver em uso.</div></div>`;
}

/** HTML dos campos de um formulário. */
export function camposHtml(campos, valores = {}, erros = {}) {
  const partes = campos.map((c) => {
    const se = c.mostrarSe ? `data-mostrar-se="${esc([c.mostrarSe.campo, ...c.mostrarSe.valores].join('|'))}"` : '';
    if (c.secao) return `<h3 ${se}>${esc(c.secao)}</h3>`;
    const v = valores[c.nome] ?? '';
    const id = `f_${c.nome}`;
    let entrada;
    if (c.tipo === 'simnao') {
      const marcado = v === true || v === '1' || v === 1;
      return `<div class="${erros[c.nome] ? 'com-erro' : ''}" ${se}><label class="check"><input type="checkbox" name="${c.nome}" value="1" ${marcado ? 'checked' : ''}> ${esc(c.rotulo)}</label>${c.ajuda ? `<div class="ajuda">${esc(c.ajuda)}</div>` : ''}</div>`;
    }
    const max = c.max ? `maxlength="${c.max}"` : '';
    if (c.tipo === 'area') entrada = `<textarea id="${id}" name="${c.nome}" ${max}>${esc(v)}</textarea>`;
    else if (c.tipo === 'opcao') {
      const ops = c.opcoes.map((o) => (Array.isArray(o) ? o : [o, o]));
      if (v !== '' && !ops.some(([k]) => String(k) === String(v))) ops.push([v, v]);
      entrada = `<select id="${id}" name="${c.nome}"><option value=""></option>${ops.map(([k, t]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
      if (c.lista) entrada += editorLista(c);
    } else {
      // link fica como texto: o navegador recusaria "onedrive.live.com/..." sem https://, e ler() completa sozinho
      const tipo = { data: 'date', mes: 'month', email: 'email', tel: 'tel' }[c.tipo] || 'text';
      const extra = c.tipo === 'dinheiro' ? 'inputmode="decimal" data-dinheiro placeholder="0,00"' : ['pct', 'inteiro'].includes(c.tipo) ? 'inputmode="decimal"' : '';
      const vinc = c.vinculo ? `data-vinculo="${c.vinculo}" data-tipo="${c.tipo}"` : '';
      entrada = `<input id="${id}" name="${c.nome}" type="${tipo}" value="${esc(v)}" ${extra} ${vinc} ${max} ${c.tipo === 'mes' ? 'placeholder="AAAA-MM"' : ''}>`;
    }
    return `<div class="${c.largo ? 'largo' : ''} ${erros[c.nome] ? 'com-erro' : ''}" ${se}>
      <label for="${id}">${esc(c.rotulo)}${c.obrig ? ' *' : ''}</label>${entrada}
      ${c.ajuda ? `<div class="ajuda">${esc(c.ajuda)}</div>` : ''}
      ${erros[c.nome] ? `<div class="erro-campo">${esc(erros[c.nome])}</div>` : ''}</div>`;
  });
  return `<div class="formulario">${partes.join('')}</div>`;
}
