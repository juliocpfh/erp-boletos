// Campos de cada cadastro, desenho dos formulários e leitura do que foi digitado.
import { centavos, numero } from './calculos.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const campo = (nome, rotulo, tipo = 'texto', extra = {}) => ({ nome, rotulo, tipo, ...extra });
const secao = (titulo) => ({ secao: titulo });
/** Começa uma nova linha no formulário. */
const QUEBRA = { quebra: true };

// --------------------------------------------------------------------------
// CPF, CNPJ, CEP e telefone: máscara ao digitar e conferência dos dígitos ao salvar
// --------------------------------------------------------------------------
export const soDigitos = (v) => String(v || '').replace(/\D/g, '');

export function cpfValido(v) {
  const n = soDigitos(v);
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  const dv = (k) => { let s = 0; for (let i = 0; i < k; i += 1) s += Number(n[i]) * (k + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(n[9]) && dv(10) === Number(n[10]);
}

export function cnpjValido(v) {
  const n = soDigitos(v);
  if (n.length !== 14 || /^(\d)\1{13}$/.test(n)) return false;
  const dv = (k) => { const pesos = k === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = pesos.reduce((t, p, i) => t + p * Number(n[i]), 0) % 11; return s < 2 ? 0 : 11 - s; };
  return dv(12) === Number(n[12]) && dv(13) === Number(n[13]);
}

/** Formata enquanto digita (e ao salvar). */
export function mascarar(tipo, v) {
  const n = soDigitos(v);
  if (tipo === 'cep') return n.slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
  if (tipo === 'tel') {
    const t = n.slice(0, 11);
    if (t.length <= 2) return t;
    return t.length > 10 ? t.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3') : t.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3').replace(/-$/, '');
  }
  const cpf = (x) => x.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  const cnpj = (x) => x.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  if (tipo === 'cpf') return cpf(n.slice(0, 11));
  if (tipo === 'cnpj') return cnpj(n.slice(0, 14));
  return n.length <= 11 ? cpf(n) : cnpj(n.slice(0, 14)); // cpfcnpj
}

/** Confere o documento: devolve a mensagem de erro, ou '' se está certo. */
export function conferirDocumento(tipo, v) {
  const n = soDigitos(v);
  if (tipo === 'cep') return n.length === 8 ? '' : 'CEP com 8 números';
  if (tipo === 'cpf') return cpfValido(n) ? '' : 'CPF inválido (confira os números)';
  if (tipo === 'cnpj') return cnpjValido(n) ? '' : 'CNPJ inválido (confira os números)';
  if (n.length === 11) return cpfValido(n) ? '' : 'CPF inválido (confira os números)';
  if (n.length === 14) return cnpjValido(n) ? '' : 'CNPJ inválido (confira os números)';
  return 'Informe um CPF (11 números) ou CNPJ (14 números)';
}
const DOCUMENTOS = ['cpf', 'cnpj', 'cpfcnpj', 'cep'];

/** CEP que preenche o endereço (ViaCEP) e CNPJ que preenche a empresa (BrasilAPI): só os campos vazios. */
const PREENCHE_CEP = (endereco, bairro, cidade, uf) => ({ preencher: { fonte: 'cep', endereco, bairro, cidade, uf } });
const PREENCHE_CNPJ = (alvos) => ({ preencher: { fonte: 'cnpj', ...alvos } });

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
  campo('uf', 'Estado (UF)', 'texto', { max: 2, ajuda: 'Vem do CEP. Ex.: PR' }),
  campo('cep', 'CEP', 'cep', { ...PREENCHE_CEP('endereco', 'bairro', 'cidade', 'uf'), ajuda: 'Digite o CEP para preencher rua, bairro, cidade e Estado' }),
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
  campo('sem_chaves', 'Chaves e controles: não se aplica', 'simnao', { ajuda: 'Marque quando o imóvel não tem chave nem controle (ex.: terreno vazio). Deixa de aparecer como pendência' }),
  campo('chaves', 'Chaves e controles entregues ao inquilino', 'area', { ...quando('sem_chaves', ''), ajuda: 'Um por linha, com a quantidade (ex.: 01 Chave tetra da porta de entrada). Entra na vistoria e no recibo de entrega das chaves' }),
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

/** Taxa do proprietário (condomínio) paga pelo inquilino: volta para ele no boleto do aluguel. */
export const RESSARCIMENTO = [
  campo('competencia_condominio', 'Mês do boleto do condomínio', 'mes', { obrig: true }),
  campo('descricao', 'Taxa', 'opcao', { obrig: true, opcoes: ['Fundo de obras', 'Constituição do fundo de reserva', 'Chamada extra (obra)', 'Obra na estrutura / reforma',
    'Pintura de fachada', 'Equipamento de segurança / incêndio', 'Decoração / paisagismo das áreas comuns', 'Indenização trabalhista anterior à locação', 'Outra'] }),
  campo('detalhe', 'Detalhe (opcional)', 'texto', { ajuda: 'Ex.: parcela 3/10 do fundo de obras' }),
  campo('valor', 'Valor pago pelo inquilino', 'dinheiro', { obrig: true }),
  campo('data_pagamento', 'Data em que o inquilino pagou o condomínio', 'data', { obrig: true }),
  campo('competencia_abatimento', 'Abater no boleto do aluguel de', 'mes', { ajuda: 'Em branco: o boleto que vence no mês seguinte ao pagamento' }),
];

/** Contas do imóvel e quem paga cada uma, conforme o contrato. */
export const CONTAS = [['conta_agua', 'Água'], ['conta_energia', 'Energia'], ['conta_gas', 'Gás'], ['conta_internet', 'Internet / TV'], ['conta_condominio', 'Condomínio']];
export const SITUACOES_CONTA = ['Por conta do inquilino', 'Incluso no aluguel', 'Não tem'];
/** Relógios lidos na entrada e na saída do inquilino. */
export const LEITURAS = [['agua', 'Relógio de água'], ['energia', 'Relógio de energia'], ['gas', 'Relógio de gás']];

export const LEITURA = [
  campo('data', 'Data da leitura', 'data', { obrig: true }),
  campo('momento', 'Momento', 'opcao', { obrig: true, padrao: 'Entrada do inquilino', opcoes: ['Entrada do inquilino', 'Saída do inquilino', 'Outra'] }),
  ...LEITURAS.map(([nome, rotulo]) => campo(nome, rotulo)),
  campo('observacoes', 'Observações', 'area'),
];

/** Qualificação da pessoa no contrato (nacionalidade, estado civil, profissão, nascimento, endereço). */
/** Sexo para a concordância no contrato; "Neutro" escreve brasileiro(a), solteiro(a), portador(a). */
export const GENEROS = ['Masculino', 'Feminino', 'Neutro – o(a)'];
export const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'Separado(a)', 'União estável'];
const qualificacao = (prefixo, extra = {}, comEndereco = true) => [
  campo(`${prefixo}genero`, 'Sexo', 'opcao', { opcoes: GENEROS, ajuda: 'Neutro ou em branco: o contrato escreve "brasileiro(a), solteiro(a)"', ...extra }),
  campo(`${prefixo}nacionalidade`, 'Nacionalidade', 'texto', { padrao: 'brasileira', ...extra }),
  campo(`${prefixo}estado_civil`, 'Estado civil', 'opcao', { opcoes: ESTADOS_CIVIS, ...extra }),
  campo(`${prefixo}profissao`, 'Profissão', 'texto', extra),
  campo(`${prefixo}nascimento`, 'Data de nascimento', 'data', extra),
  ...(comEndereco ? [campo(`${prefixo}endereco`, 'Endereço (residência ou comercial)', 'texto', { largo: true, ...extra })] : []),
];

export const FIADOR = [
  campo('nome', 'Nome', 'texto', { obrig: true, largo: true }),
  campo('cpf', 'CPF', 'cpf', { buscarPessoa: true }),
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

/** Fiadores direto no cadastro do contrato (campos fiador1_nome, fiador2_nome...). */
export const CAMPOS_FIADOR = FIADOR.filter((c) => c.nome !== 'observacoes');
/** Quantos blocos de fiador o cadastro mostra: os já cadastrados e mais um em branco (pelo menos dois). */
export const vagasFiador = (existentes = []) => Math.max(2, existentes.length + 1);
/** Texto do botão das partes que começam recolhidas (fiador a mais, inquilino solidário). */
export const EXPANDIR_PARTE = 'Expanda para cadastrar parte';
/**
 * Fiadores do contrato (os de quando ele foi assinado) vêm preenchidos para alterar; os blocos em branco incluem.
 * Excluir um fiador é na página do inquilino; os que entram depois são pela troca de garantia.
 * O fiador a mais (em branco) começa recolhido.
 */
export const fiadoresNoCadastro = (existentes = []) => Array.from({ length: vagasFiador(existentes) }, (_, k) => k + 1).flatMap((n) => {
  const atual = existentes[n - 1];
  return [
    { secao: atual ? `Fiador ${n}: ${atual.nome}` : n === 1 ? 'Fiador' : `Mais um fiador (se houver)`, fiador: n, ...GARANTIA_FIADOR, ...(atual || n === 1 ? {} : { recolher: EXPANDIR_PARTE }) },
    ...CAMPOS_FIADOR.map((c) => ({ ...c, nome: `fiador${n}_${c.nome}`, obrig: false, fiador: n, ...GARANTIA_FIADOR })),
  ];
});
/** Comprovante: PDF ou foto, guardado na pasta do inquilino. Sem ele, o valor é salvo e fica um alerta para anexar depois. */
const SEM_COMPROVANTE = 'Ainda não tem? Salve assim mesmo: fica um alerta para buscar no banco e anexar depois';
const comprovante = (nome, rotulo, extra = {}) => campo(nome, rotulo, 'arquivo', { ajuda: `PDF ou foto do comprovante. ${SEM_COMPROVANTE}`, ...extra });

const PJ = quando('inquilino_tipo', 'Pessoa jurídica (empresa)');
/** Rótulo do campo conforme o tipo de inquilino (ex.: CPF na pessoa física, CNPJ na empresa). */
const rotuloPJ = (rotulo) => ({ rotuloSe: { campo: 'inquilino_tipo', valor: 'Pessoa jurídica (empresa)', rotulo } });

export const CONTRATO = [
  secao('Imóvel e situação'),
  // o imóvel é escolhido só no contrato novo (obrigatório); imóvel lançado errado: "Corrigir imóvel" na página do inquilino.
  // "Ativo" não é mais campo: o inquilino fica inativo pela saída
  campo('imovel_id', 'Imóvel', 'opcao', { opcoes: [], soNovo: true, obrig: true, ajuda: 'Escolha o imóvel deste inquilino' }),
  campo('gerar_nf', 'Emite NF (desmarcado: boleto de controle)', 'simnao', { padrao: true, ajuda: 'Boleto de controle: o pagamento é controlado (em dia ou atrasado), mas não gera NF nem entra nas somas dos boletos e nos resultados' }),
  secao('Inquilino (responsável pelo contrato)'),
  campo('inquilino_tipo', 'Tipo', 'opcao', { obrig: true, padrao: 'Pessoa física', opcoes: ['Pessoa física', 'Pessoa jurídica (empresa)'] }),
  campo('inquilino_nome', 'Nome completo / razão social', 'texto', { obrig: true, largo: true, max: LIMITES.tomador_nome, ajuda: 'O boleto e a NF saem neste nome' }),
  campo('inquilino_apelido', 'Nome fantasia', 'texto', PJ),
  campo('inquilino_telefone', 'Telefone', 'tel'),
  campo('inquilino_whatsapp', 'Este telefone é WhatsApp', 'simnao'),
  campo('inquilino_email', 'E-mail', 'email'),
  campo('inquilino_cpf', 'CPF', 'cpfcnpj', { buscarPessoa: true, ...rotuloPJ('CNPJ'), ...PREENCHE_CNPJ({ nome: 'inquilino_nome', endereco: 'inquilino_endereco' }) }),
  campo('inquilino_rg', 'RG', 'texto', rotuloPJ('Inscrição estadual')),
  ...qualificacao('inquilino_', quando('inquilino_tipo', 'Pessoa física'), false),
  campo('usar_endereco_imovel', 'Usar o endereço do imóvel deste contrato', 'simnao', { virtual: true, autoMsg: true, ajuda: 'Marcado: o endereço do inquilino fica igual ao do imóvel (rua, bairro, cidade/UF e CEP)' }),
  campo('inquilino_endereco', 'Endereço (residência, comercial ou sede da empresa)', 'texto', { largo: true }),
  campo('responsavel_nome', 'Outro contato (se houver)'),
  campo('responsavel_telefone', 'Telefone do contato', 'tel'),
  campo('responsavel_email', 'E-mail do contato', 'email'),
  campo('contrato_anterior_id', 'Continua o contrato de', 'opcao', { opcoes: [], ajuda: 'Ex.: alteração de titular. Liga o histórico dos dois inquilinos e traz as condições do contrato anterior (confira)' }),
  { secao: 'Representante da empresa (pessoa física)', ...PJ },
  campo('representante_nome', 'Nome do representante', 'texto', { largo: true, ...PJ, ajuda: 'Obrigatório para empresa: sócio ou responsável que assina' }),
  campo('representante_cpf', 'CPF do representante', 'cpf', PJ),
  campo('representante_rg', 'RG do representante', 'texto', PJ),
  campo('representante_cargo', 'Cargo', 'texto', PJ),
  ...qualificacao('representante_', PJ, false),
  campo('representante_usar_endereco_imovel', 'Usar o endereço do imóvel deste contrato', 'simnao', { virtual: true, autoMsg: true, ...PJ, ajuda: 'Marcado: o endereço do representante fica igual ao do imóvel (rua, bairro, cidade/UF e CEP)' }),
  campo('representante_endereco', 'Endereço (residência ou comercial)', 'texto', { largo: true, ...PJ }),
  campo('representante_telefone', 'Telefone do representante', 'tel', PJ),
  campo('representante_email', 'E-mail do representante', 'email', PJ),
  { secao: 'Inquilino solidário', recolher: EXPANDIR_PARTE },
  campo('solidario_nome', 'Nome do inquilino solidário', 'texto', { largo: true, ajuda: 'Quem assina o contrato junto. O boleto continua saindo no nome do inquilino principal. Para tirar o solidário, apague o nome' }),
  campo('solidario_cpf', 'CPF / CNPJ do solidário', 'cpfcnpj'),
  campo('solidario_rg', 'RG do solidário'),
  campo('solidario_telefone', 'Telefone do solidário', 'tel'),
  campo('solidario_email', 'E-mail do solidário', 'email'),
  ...qualificacao('solidario_', {}, false),
  campo('solidario_usar_endereco_imovel', 'Usar o endereço do imóvel deste contrato', 'simnao', { virtual: true, autoMsg: true, ajuda: 'Marcado: o endereço do solidário fica igual ao do imóvel (rua, bairro, cidade/UF e CEP)' }),
  campo('solidario_endereco', 'Endereço (residência ou comercial)', 'texto', { largo: true }),
  secao('Objeto da locação (para o contrato)'),
  campo('finalidade', 'Finalidade', 'opcao', { padrao: 'Residencial', opcoes: ['Residencial', 'Não residencial'] }),
  campo('atividade', 'Atividade do estabelecimento', 'texto', { ...quando('finalidade', 'Não residencial'), ajuda: 'Ex.: studio de beleza' }),
  campo('descricao_objeto', 'Descrição do imóvel no contrato', 'texto', { largo: true, ajuda: 'Ex.: um apartamento mobiliado, com utensílios de cozinha e decoração; ou uma loja comercial, sem vaga de garagem' }),
  secao('Reserva dada na visita'),
  campo('reserva_valor', 'Valor da reserva', 'dinheiro'),
  campo('reserva_data', 'Data da reserva', 'data'),
  comprovante('comprovante_reserva', 'Comprovante da reserva', { ajuda: `PDF ou foto do comprovante da reserva. ${SEM_COMPROVANTE}` }),
  campo('reserva_competencia', 'Usar a reserva no aluguel de', 'mes', { ajuda: 'Em branco: usa no primeiro aluguel' }),
  secao('O que está incluso no contrato'),
  campo('conta_iptu', 'IPTU', 'opcao', { obrig: true, padrao: 'Por conta do inquilino', opcoes: SITUACOES_CONTA, ajuda: 'Por conta do inquilino: as parcelas entram no boleto' }),
  campo('conta_seguro', 'Seguro obrigatório', 'opcao', { obrig: true, padrao: 'Por conta do inquilino', opcoes: SITUACOES_CONTA, ajuda: 'Por conta do inquilino: as parcelas entram no boleto' }),
  ...CONTAS.map(([nome, rotulo]) => campo(nome, rotulo, 'opcao', { opcoes: SITUACOES_CONTA, padrao: SITUACOES_CONTA[0] })),
  campo('contas_adicionais', 'Contas ou cobranças adicionais', 'area', { linha: true, ajuda: 'Ex.: taxa de lixo, limpeza da área comum, rateio de água' }),
  secao('Valores e boleto'),
  campo('aluguel_inicial', 'Aluguel', 'dinheiro', { obrig: true, ajuda: 'Valor cheio do contrato (histórico)' }),
  campo('dia_vencimento', 'Dia do vencimento', 'inteiro', { obrig: true }),
  campo('aluguel_bonificado', 'Aluguel bonificado', 'dinheiro', { virtual: true, vinculo: 'desconto', ajuda: 'Digite o valor que o inquilino paga em dia: o % é calculado' }),
  campo('desconto_pontualidade_percentual', 'Bonificação (%)', 'pct', { vinculo: 'desconto', ajuda: 'Ou digite o % e o aluguel bonificado é calculado' }),
  campo('cobranca_mes_seguinte', 'O aluguel do mês vence no mês seguinte', 'simnao', { padrao: true, ajuda: 'Marcado: aluguel de julho vence em agosto' }),
  campo('bonificacao', 'Tem bonificação (desconto) por pontualidade', 'simnao', { padrao: true, colado: true }),
  QUEBRA,
  campo('taxa_boleto', 'Tarifa de emissão do boleto (R$)', 'dinheiro', { ajuda: 'Entra no boleto e na descrição do boleto' }),
  campo('multa_percentual', 'Multa por atraso (%)', 'pct', { padrao: 2 }),
  campo('juros_mensal_percentual', 'Juros por atraso (% ao mês)', 'pct', { padrao: 1 }),
  secao('Garantia'),
  campo('garantia_tipo', 'Tipo de garantia', 'opcao', { obrig: true, opcoes: ['Caução', 'Depósito garantia', 'Fiador', 'Fiador + depósito', 'Seguro fiança', 'Sem garantia'] }),
  campo('caucao_meses', 'Caução equivale a quantos aluguéis', 'inteiro', { ...quando('garantia_tipo', 'Caução'), ajuda: 'O valor da caução é calculado: aluguéis × aluguel bonificado (parte "Valores e boleto")' }),
  campo('caucao_valor', 'Valor da caução', 'dinheiro', { ...quando('garantia_tipo', 'Caução'), autoMsg: true, ajuda: 'Calculado sozinho (aluguéis × aluguel bonificado); pode ajustar se o depósito for outro valor' }),
  campo('caucao_data', 'Data prevista do depósito da caução', 'data', { ...quando('garantia_tipo', 'Caução'), ajuda: 'Em branco: a data do contrato. Altere só se o depósito for em outra data. A data paga e o comprovante vão na página do inquilino' }),
  campo('deposito_valor', 'Valor do depósito de garantia', 'dinheiro', { ...quando('garantia_tipo', 'Depósito garantia', 'Fiador + depósito'), autoMsg: true }),
  campo('deposito_data', 'Data prevista do depósito', 'data', { ...quando('garantia_tipo', 'Depósito garantia', 'Fiador + depósito'), ajuda: 'Em branco: a data do contrato. Altere só se o depósito for em outra data. A data paga e o comprovante vão na página do inquilino' }),
  campo('deposito_uso', 'Quando e onde o depósito será usado', 'texto', { largo: true, ...quando('garantia_tipo', 'Depósito garantia', 'Fiador + depósito'), ajuda: 'Ex.: abatido nos dois últimos aluguéis do contrato' }),
  ...fiadoresNoCadastro(),
  secao('Datas e prazo'),
  campo('vigencia_inicio', 'Data do contrato', 'data', { obrig: true }),
  campo('data_entrada', 'Data de vigência inicial', 'data', { obrig: true }),
  campo('prazo_tipo', 'Prazo', 'opcao', { obrig: true, padrao: 'Determinado', opcoes: ['Determinado', 'Indeterminado'] }),
  campo('prazo_meses', 'Prazo do contrato (meses)', 'inteiro', { ...quando('prazo_tipo', 'Determinado'), ajuda: 'Ex.: 30 meses a partir de 05/09/2026 terminam em 05/03/2029 (mesmo dia)' }),
  campo('renovacao_automatica', 'Renovação automática', 'simnao'),
  secao('Correção anual'),
  campo('indice_correcao', 'Índice de correção previsto no contrato', 'opcao', { lista: 'indices', ajuda: 'Use "Editar lista" para incluir outro índice (ex.: IGP-M/IPCA, o maior dos dois, como prevê o contrato)' }),
  campo('data_base_correcao', 'Data-base da correção', 'data', { ajuda: 'O alerta de correção usa o aniversário desta data. Em branco: início do contrato' }),
  { secao: 'Carência de aluguel', recolher: 'Expanda para cadastrar carência' },
  campo('carencia_meses', 'Meses de carência', 'inteiro', { ajuda: 'Nestes meses o aluguel não é cobrado. Em branco: sem carência' }),
  campo('carencia_inicio', 'Carência a partir do aluguel de', 'mes', { ajuda: 'Em branco: mês de entrada' }),
  campo('carencia_cobrar_iptu', 'Na carência, cobrar o IPTU', 'simnao'),
  campo('carencia_cobrar_seguro', 'Na carência, cobrar o seguro', 'simnao'),
  campo('carencia_cobrar_taxa', 'Na carência, cobrar a tarifa do boleto', 'simnao'),
  secao('Vistoria de entrada'),
  campo('vistoria_link', 'Link da pasta de fotos da vistoria de entrada', 'url', { largo: true, ajuda: 'Cole o link da pasta na nuvem (OneDrive, Google Drive) onde está o .rar das fotos' }),
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
  campo('telefone_assistencia', 'Telefone da assistência', 'texto', { ajuda: 'Ex.: 0800 000 0000 (chaveiro, encanador, vidraceiro do seguro)' }),
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

/** Campos do fiador na troca de garantia (o início do vínculo é a data da troca; o fim, quando ele sair). */
export const CAMPOS_FIADOR_TROCA = CAMPOS_FIADOR.filter((c) => !['data_entrada', 'data_saida'].includes(c.nome));
/** Quantos blocos de fiador novo a troca mostra. */
export const NOVOS_FIADORES_TROCA = 2;
/**
 * Troca de garantia, inclusive troca de fiador (Fiador → Fiador): os fiadores atuais vêm preenchidos (para corrigir ou
 * marcar que saem) e há blocos em branco para os novos (campos tfN_ para os atuais e tnN_ para os novos).
 */
export const trocaGarantia = (atuais = []) => [
  campo('data', 'Data da troca', 'data', { obrig: true }),
  ...CONTRATO.filter((c) => ['garantia_tipo', 'caucao_valor', 'caucao_data', 'caucao_meses', 'comprovante_caucao', 'deposito_valor', 'deposito_data', 'deposito_uso', 'comprovante_deposito'].includes(c.nome))
    .map((c) => (c.nome === 'garantia_tipo' ? { ...c, rotulo: 'Nova garantia', ajuda: 'Para trocar, incluir ou tirar fiador, escolha "Fiador" (ou "Fiador + depósito") e preencha os fiadores abaixo' } : c)),
  ...atuais.flatMap((f, k) => [
    { secao: `Fiador atual: ${f.nome}`, ...GARANTIA_FIADOR },
    campo(`tf${k + 1}_sai`, 'Este fiador sai nesta troca', 'simnao', { virtual: true, ...GARANTIA_FIADOR, ajuda: 'Fica guardado em "Fiadores anteriores", com o fim do vínculo na véspera da troca' }),
    ...CAMPOS_FIADOR_TROCA.map((c) => ({ ...c, nome: `tf${k + 1}_${c.nome}`, obrig: false, ...GARANTIA_FIADOR })),
  ]),
  ...Array.from({ length: NOVOS_FIADORES_TROCA }, (_, k) => [
    { secao: k ? 'Mais um fiador novo (se houver)' : 'Fiador novo (se entrar alguém)', ...GARANTIA_FIADOR },
    ...CAMPOS_FIADOR_TROCA.map((c) => ({ ...c, nome: `tn${k + 1}_${c.nome}`, obrig: false, ...GARANTIA_FIADOR })),
  ]).flat(),
  campo('observacoes', 'O que aconteceu com a garantia anterior', 'area', { ajuda: 'Ex.: caução devolvida em 10/10/2026 por PIX; fiador substituído a pedido do inquilino' }),
];

export const APLICACAO = [
  campo('data', 'Data da aplicação', 'data', { obrig: true }),
  campo('emitente_id', 'Depositado em', 'opcao', { obrig: true, opcoes: [], ajuda: 'Empresa, ou "Outra pessoa" quando foi depositado na conta de uma pessoa (ex.: dono do imóvel)' }),
  campo('recebedor', 'Nome de quem recebeu', 'texto', { mostrarSe: { campo: 'emitente_id', valores: ['-1'] }, sugestoes: [], ajuda: 'Escreva uma vez: nas próximas aplicações o nome aparece para escolher' }),
  campo('valor', 'Valor aplicado', 'dinheiro', { obrig: true }),
  comprovante('comprovante', 'Comprovante da aplicação', { ajuda: `PDF ou foto do comprovante da aplicação na empresa. ${SEM_COMPROVANTE}` }),
  campo('observacoes', 'Observações (banco, aplicação)', 'area'),
];

/** Editar um depósito da caução ou do depósito de garantia (registrado na página do inquilino). */
export const DEPOSITO_GARANTIA = [
  campo('data', 'Data do depósito', 'data', { obrig: true }),
  campo('valor', 'Valor depositado', 'dinheiro', { obrig: true }),
  comprovante('comprovante', 'Comprovante do depósito'),
];

export const CORRECAO_GARANTIA = [
  campo('data', 'Data', 'data', { obrig: true }),
  campo('valor_novo', 'Novo valor da caução', 'dinheiro', { obrig: true }),
  campo('complemento', 'Complemento pago pelo inquilino', 'dinheiro', { ajuda: 'Em branco: diferença entre o novo e o anterior' }),
  comprovante('comprovante', 'Comprovante do depósito do complemento', { ajuda: `PDF ou foto do comprovante do complemento. ${SEM_COMPROVANTE}` }),
  campo('observacoes', 'Observações', 'area'),
];

export const RENOVACAO = [
  campo('data', 'Data', 'data', { obrig: true, ajuda: 'O novo valor (se houver) vale a partir desta data' }),
  campo('tipo', 'O que aconteceu', 'opcao', { obrig: true, opcoes: ['Renovado com nova data de término', 'Passou a prazo indeterminado', 'Novo valor negociado'] }),
  campo('nova_vigencia_fim', 'Nova data de término', 'data', { ajuda: 'Só para renovação com prazo determinado' }),
  campo('novo_valor', 'Novo valor do aluguel negociado (valor cheio)', 'dinheiro'),
  campo('observacoes', 'Observações', 'area'),
];

// a data de saída vem do contrato ("Informar data de saída"); a leitura dos relógios na saída é a mesma da vistoria de saída
// (vem preenchida e, se mudar aqui, muda lá também)
export const ENCERRAMENTO = [
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
  campo('cnpj', 'CNPJ', 'cnpj', PREENCHE_CNPJ({ razao: 'razao_social', nome: 'nome', endereco: 'endereco', sede: 'endereco_sede' })),
  campo('endereco', 'Endereço (como aparece na NF)', 'texto', { largo: true }),
  campo('municipio', 'Município do serviço', 'texto', { padrao: 'CURITIBA' }),
  campo('aba_modelo', 'Aba no modelo Excel', 'texto', { ajuda: 'Nome da aba do modelo para esta empresa (ex.: ANK)' }),
  campo('ativo', 'Ativa', 'simnao', { padrao: true }),
  secao('Para o contrato de locação'),
  campo('endereco_sede', 'Endereço da sede (por extenso)', 'texto', { largo: true, ajuda: 'Ex.: Rua Professor Nilo Brandão, nº 117, São Lourenço, Curitiba, Paraná' }),
  campo('representante_nome', 'Representante que assina', 'texto', { largo: true, ajuda: 'Ex.: AIDA APARECIDA NUNES KRASINSKI' }),
  campo('representante_cargo', 'Cargo do representante', 'texto', { padrao: 'sócia administradora' }),
  campo('representante_rg', 'RG do representante'),
  campo('representante_cpf', 'CPF do representante', 'cpf'),
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
/** ``antigo``: registro em edição; documento que já estava salvo e não mudou não é barrado (dados antigos). */
export function ler(campos, form, antigo = null) {
  const fd = form instanceof FormData ? form : new FormData(form);
  const dados = {};
  const erros = {};
  for (const c of campos) {
    if (!c.nome || c.virtual || c.tipo === 'arquivo') continue; // arquivo: gravado à parte (ajustarAsync)
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
      } else if (DOCUMENTOS.includes(c.tipo)) {
        const igualAntes = antigo && soDigitos(antigo[c.nome]) === soDigitos(bruto);
        const erro = igualAntes ? '' : conferirDocumento(c.tipo, bruto);
        if (erro) { erros[c.nome] = erro; dados[c.nome] = bruto; continue; }
        dados[c.nome] = igualAntes ? antigo[c.nome] : mascarar(c.tipo, bruto);
      } else if (c.tipo === 'tel') dados[c.nome] = [10, 11].includes(soDigitos(bruto).length) ? mascarar('tel', bruto) : bruto;
      else if (c.tipo === 'opcao' && c.nome.endsWith('_id')) dados[c.nome] = Number(bruto);
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

/**
 * Arquivo já guardado num campo de anexo: ✓ verde, o nome (clique abre o arquivo) e o "×" (apaga só o arquivo, com confirmação).
 * ``acao``/``dados``: outra ação para apagar (ex.: foto da vistoria); o padrão apaga o campo do registro em edição.
 * ``abrir`` ({ escopo, id }): pasta do arquivo; sem ela, a pasta sai do registro em edição (abrirAnexoDoCampo).
 */
export function arquivoGuardado(campo, nome, acao = 'excluirAnexoDoCampo', dados = {}, abrir = null) {
  const extra = Object.entries({ campo, ...dados }).map(([k, x]) => `data-${k}="${esc(x)}"`).join(' ');
  const link = abrir ? `data-acao="abrirArquivo" data-escopo="${esc(abrir.escopo)}" data-id="${esc(abrir.id)}" data-nome="${esc(nome)}"` : `data-acao="abrirAnexoDoCampo" data-campo="${esc(campo)}"`;
  return `<div class="ajuda arquivo-guardado"><span class="etiqueta ok">✓ Já guardado</span> <span class="nw"><a href="#" ${link} title="Abrir o arquivo">📎 ${esc(nome)}</a>
    <button type="button" class="link-botao excluir-mini" title="Apagar só o arquivo" data-acao="${acao}" ${extra} data-confirmar="${esc(`Apagar o arquivo "${nome}"? Ele sai da pasta e não dá para recuperar.`)}">×</button></span>
    <br>Para trocar, escolha outro arquivo.</div>`;
}

/** HTML dos campos de um formulário. */
export function camposHtml(campos, valores = {}, erros = {}, { compacto = false } = {}) {
  // seções com "recolher" começam fechadas, com um botão para expandir; abrem sozinhas se algum campo delas está preenchido
  // (ex.: editar um contrato com inquilino solidário ou carência) ou tem erro
  let atual = null;
  const grupoDe = campos.map((c, k) => { if (c.secao) atual = c.recolher ? `g${k}` : null; return atual; });
  const preenchido = (c) => { const v = valores[c.nome]; return ![undefined, null, '', false, 0, '0'].includes(v) && String(v) !== String(c.padrao ?? ''); };
  const doGrupo = (g) => campos.filter((c, k) => c.nome && grupoDe[k] === g);
  const aberto = Object.fromEntries([...new Set(grupoDe.filter(Boolean))].map((g) => [g, doGrupo(g).some((c) => erros[c.nome] || preenchido(c))]));
  const partes = campos.map((c, k) => {
    const se = c.mostrarSe ? `data-mostrar-se="${esc([c.mostrarSe.campo, ...c.mostrarSe.valores].join('|'))}"` : '';
    const g = grupoDe[k];
    if (c.quebra) return '<div class="quebra"></div>';
    if (c.secao) {
      if (!c.recolher) return `<h3 ${se}>${esc(c.secao)}</h3>`;
      const texto = doGrupo(g).some(preenchido) ? 'Expanda para ver ou alterar' : c.recolher;
      return `<h3 ${se}>${esc(c.secao)} <button type="button" class="link-botao" data-expandir="${g}" data-texto="${esc(texto)}" ${aberto[g] ? 'data-aberto="1"' : ''}>${esc(aberto[g] ? 'Recolher' : texto)}</button></h3>`;
    }
    const grupo = g ? ` data-grupo="${g}"` : '';
    const recolhido = g && !aberto[g] ? 'recolhido' : '';
    const v = valores[c.nome] ?? '';
    const id = `f_${c.nome}`;
    // rótulo que muda com outro campo (ex.: CPF ou CNPJ, conforme o tipo de inquilino)
    const rs = c.rotuloSe;
    const rotulo = rs && String(valores[rs.campo] ?? '') === rs.valor ? rs.rotulo : c.rotulo;
    const rotuloSe = rs ? ` data-rotulo-se="${esc([rs.campo, rs.valor, rs.rotulo, c.rotulo].join('|'))}"` : '';
    let entrada;
    if (c.tipo === 'simnao') {
      const marcado = v === true || v === '1' || v === 1;
      return `<div class="${erros[c.nome] ? 'com-erro' : ''} ${recolhido} ${c.colado ? 'colado' : ''}"${grupo} ${se}><label class="check"><input type="checkbox" name="${c.nome}" value="1" ${marcado ? 'checked' : ''}> ${esc(c.rotulo)}</label>${c.ajuda ? `<div class="ajuda">${esc(c.ajuda)}</div>` : ''}</div>`;
    }
    const max = c.max ? `maxlength="${c.max}"` : '';
    if (c.tipo === 'arquivo') {
      // o nome do arquivo já guardado vem do registro; depois de um erro o navegador esquece o arquivo escolhido
      entrada = `<input id="${id}" name="${c.nome}" type="file" accept="application/pdf,image/*">${typeof v === 'string' && v ? arquivoGuardado(c.nome, v) : ''}`;
    } else if (c.tipo === 'area') entrada = `<textarea id="${id}" name="${c.nome}" ${c.linha ? 'rows="1" class="cresce"' : ''} ${max}>${esc(v)}</textarea>`;
    else if (c.tipo === 'opcao') {
      const ops = c.opcoes.map((o) => (Array.isArray(o) ? o : [o, o]));
      if (v !== '' && !ops.some(([k]) => String(k) === String(v))) ops.push([v, v]);
      entrada = `<select id="${id}" name="${c.nome}"><option value=""></option>${ops.map(([k, t]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
      if (c.lista) entrada += editorLista(c);
    } else {
      // link fica como texto: o navegador recusaria "onedrive.live.com/..." sem https://, e ler() completa sozinho
      const tipo = { data: 'date', mes: 'month', email: 'email', tel: 'tel' }[c.tipo] || 'text';
      const extra = c.tipo === 'dinheiro' ? 'inputmode="decimal" data-dinheiro placeholder="0,00"' : ['pct', 'inteiro'].includes(c.tipo) ? 'inputmode="decimal"'
        : [...DOCUMENTOS, 'tel'].includes(c.tipo) ? `inputmode="numeric" data-mascara="${c.tipo}"${c.preencher ? ` data-preencher="${esc(JSON.stringify(c.preencher))}"` : ''}${c.buscarPessoa ? ' data-buscar-pessoa' : ''}` : '';
      const vinc = c.vinculo ? `data-vinculo="${c.vinculo}" data-tipo="${c.tipo}"` : '';
      // sugestões: o que já foi escrito antes aparece para escolher (e dá para escrever outro)
      const lista = c.sugestoes ? `list="${id}_sugestoes" autocomplete="off"` : '';
      entrada = `<input id="${id}" name="${c.nome}" type="${tipo}" value="${esc(v)}" ${extra} ${vinc} ${lista} ${max} ${c.tipo === 'mes' ? 'placeholder="AAAA-MM"' : ''}>`;
      if (c.sugestoes) entrada += `<datalist id="${id}_sugestoes">${c.sugestoes.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
    }
    return `<div class="${c.largo ? 'largo' : ''} ${erros[c.nome] ? 'com-erro' : ''} ${recolhido}"${grupo} ${se}>
      <label for="${id}"${rotuloSe}>${esc(rotulo)}${c.obrig ? ' *' : ''}</label>${entrada}
      ${c.ajuda ? `<div class="ajuda">${esc(c.ajuda)}</div>` : ''}
      ${erros[c.nome] ? `<div class="erro-campo">${esc(erros[c.nome])}</div>` : ''}${c.preencher || c.buscarPessoa || c.autoMsg || ['imovel_id', 'contrato_anterior_id'].includes(c.nome) ? '<div class="ajuda-auto" data-auto-msg></div>' : ''}</div>`;
  });
  // "colado": a caixa de marcar fica na mesma célula do campo anterior (uma embaixo da outra)
  for (let k = partes.length - 1; k > 0; k -= 1) if (campos[k].colado) { partes[k - 1] = `${partes[k - 1].replace(/<\/div>\s*$/, '')}${partes[k]}</div>`; partes[k] = ''; }
  return `<div class="formulario${compacto ? ' compacto' : ''}">${partes.join('')}</div>`;
}
