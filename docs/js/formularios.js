// Campos de cada cadastro, desenho dos formulários e leitura do que foi digitado.
import { soDigitos } from './c6-comum.js';
import { centavos, ErroUsuario, numero } from './calculos.js';

/** Tipos aceitos nos campos de documento (PDF e fotos): a mesma lista em todos (antes uns aceitavam "qualquer imagem"). */
export const ACEITA_DOCUMENTOS = '.pdf,.jpg,.jpeg,.png,.webp,.gif';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const campo = (nome, rotulo, tipo = 'texto', extra = {}) => ({ nome, rotulo, tipo, ...extra });

/**
 * Botões "Hoje" e "Ontem" logo depois de um campo de data (pedido do dono de 17/11): o clique põe a data no campo que vem
 * antes deles (app.js, ``data-dia``). Use nos campos de data de pagamento, baixa, lançamento e envio.
 * Ex.: ``<input type="date" name="data">${atalhosData()}``.
 */
export const atalhosData = () => '<span class="atalhos-data nao-imprimir"><button type="button" class="mini secundario" data-dia="0" title="Pôr a data de hoje">Hoje</button><button type="button" class="mini secundario" data-dia="-1" title="Pôr a data de ontem">Ontem</button></span>';
/** Campos de data dos cadastros que ganham "Hoje" e "Ontem" (de algo que já aconteceu: pagamento, recebimento, pedido, leitura). */
export const DATAS_COM_ATALHO = new Set(['data', 'data_pagamento', 'data_recebimento', 'data_conclusao', 'data_recebida', 'decisao_data', 'devolucao_data', 'data_envio']);
const secao = (titulo) => ({ secao: titulo });
/** Começa uma nova linha no formulário. */
const QUEBRA = { quebra: true };

// --------------------------------------------------------------------------
// CPF, CNPJ, CEP e telefone: máscara ao digitar e conferência dos dígitos ao salvar
// --------------------------------------------------------------------------
export { soDigitos }; // de c6-comum.js (a mesma da ponte)

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
/**
 * CEP só para preencher o endereço de uma linha da pessoa (não é gravado). O campo que recebe é o "endereco" com o mesmo
 * prefixo do nome do CEP (ex.: fiador1_cep_busca → fiador1_endereco), por isso serve também nos blocos repetidos.
 */
const CEP_DA_PESSOA = (prefixo, extra = {}) => campo(`${prefixo}cep_busca`, 'CEP (preenche o endereço)', 'cep', { virtual: true, preencher: { fonte: 'cep', linha: 'endereco' },
  ajuda: 'Digite o CEP: rua, bairro, cidade e Estado vão para o endereço. Depois complete o número', ...extra });

/** Mostra o campo só quando outro campo tem um destes valores (caixa de seleção marcada = '1'; '*' = qualquer valor preenchido). */
const quando = (campoNome, ...valores) => ({ mostrarSe: { campo: campoNome, valores } });
const GARANTIA_FIADOR = quando('garantia_tipo', 'Fiador', 'Fiador + depósito');
/** Limites de texto para não estourar as linhas da NF (planilha). */
export const LIMITES = { tomador_nome: 60, tomador_endereco: 70, municipio: 25, observacoes_nf: 450 };

export const IMOVEL = [
  secao('Identificação'),
  campo('nome', 'Nome do imóvel', 'texto', { obrig: true, ajuda: 'Ex.: Loja 1 - Nilo Brandão' }),
  campo('cep', 'CEP', 'cep', { ...PREENCHE_CEP('endereco', 'bairro', 'cidade', 'uf'), ajuda: 'Comece pelo CEP: rua, bairro, cidade e Estado são preenchidos' }),
  campo('endereco', 'Endereço', 'texto', { obrig: true, largo: true, max: 55, ajuda: 'Aparece na NF junto com o complemento' }),
  campo('complemento', 'Complemento', 'texto', { max: 25 }),
  campo('bairro', 'Bairro'),
  campo('cidade', 'Cidade (município)', 'texto', { max: LIMITES.municipio }),
  campo('uf', 'Estado (UF)', 'texto', { max: 2, ajuda: 'Vem do CEP. Ex.: PR' }),
  secao('Registros'),
  campo('matricula', 'Matrícula'),
  campo('sublote', 'Identificação do sublote', 'texto', { ajuda: 'Para imóveis que são sublotes internos. Ex.: Sublote 3' }),
  campo('inscricao_iptu', 'Inscrição imobiliária (IPTU)'),
  campo('copel_uc', 'Unidade consumidora da energia (UC)', 'texto', { ajuda: 'Número da UC na conta de luz' }),
  campo('copel_medidor', 'Nº do medidor de energia'),
  campo('sanepar_matricula', 'Matrícula da água', 'texto', { ajuda: 'Número da matrícula na conta de água' }),
  campo('sanepar_hidrometro', 'Código do hidrômetro'),
  campo('energia_concessionaria', 'Companhia de energia (se for outra)', 'texto', { largo: true, ajuda: 'Em branco: a do cadastro da empresa (Empresas). Ex.: Companhia Paranaense de Energia (COPEL)' }),
  campo('agua_concessionaria', 'Companhia de água (se for outra)', 'texto', { largo: true, ajuda: 'Em branco: a do cadastro da empresa (Empresas). Ex.: Companhia de Saneamento do Paraná (SANEPAR)' }),
  campo('administradora_nome', 'Administradora do condomínio'),
  campo('area_comum', 'Pátio e portão eletrônico de uso comum', 'simnao', { ajuda: 'Marcado: o contrato inclui as cláusulas de frente desobstruída, pátio comum e portão eletrônico' }),
  campo('sem_chaves', 'Chaves e controles: não se aplica', 'simnao', { ajuda: 'Marque quando o imóvel não tem chave nem controle (ex.: terreno vazio). Deixa de aparecer como pendência' }),
  campo('chaves', 'Chaves e controles entregues ao inquilino', 'area', { ...quando('sem_chaves', ''), ajuda: 'Um por linha, com a quantidade (ex.: 01 Chave tetra da porta de entrada). Entra na vistoria e no recibo de entrega das chaves' }),
  campo('gas_relogio', 'Relógio de gás (nº / identificação)'),
  campo('internet', 'Contrato de internet ou nº do telefone'),
  secao('Área e energia'),
  campo('area_util', 'Área útil (m²)', 'pct', { min: 0 }),
  campo('area_total', 'Área total (m²)', 'pct', { min: 0 }),
  campo('energia_ligada', 'Energia ligada', 'opcao', { opcoes: ['Sim', 'Não'] }),
  campo('energia_tipo', 'Tipo de ligação da energia', 'opcao', { opcoes: ['Monofásica', 'Bifásica', 'Trifásica'] }),
  secao('Valor do imóvel'),
  campo('valor_imovel', 'Valor do imóvel (R$)', 'dinheiro', { naoNegativo: true, ajuda: 'Usado na página Resultados para o retorno sobre o valor' }),
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
  campo('data_conclusao', 'Concluído em', 'data', { ajuda: 'Preenchida: ao salvar, a situação passa para "Concluída"' }),
  campo('valor', 'Custo', 'dinheiro'),
  campo('pago_por', 'Custo por conta de', 'opcao', { opcoes: ['Proprietário', 'Inquilino', 'Sem custo'] }),
];

export const REFORMA = [
  campo('data', 'Data', 'data', { obrig: true }),
  campo('descricao', 'O que foi feito', 'texto', { obrig: true, largo: true, ajuda: 'Ex.: troca do telhado, pintura completa' }),
  campo('valor', 'Valor investido', 'dinheiro', { obrig: true, positivo: true }),
  campo('fornecedor', 'Fornecedor / prestador'),
  campo('documento', 'Nota fiscal / recibo nº'),
  campo('observacoes', 'Observações', 'area'),
];

/**
 * Registro da cobrança de um atraso (2026-11-24): cada passo e cada gasto, com os comprovantes (os arquivos vão num campo à parte
 * do formulário, vários de uma vez). Só guarda a prova: não entra no boleto, na NF, no acordo nem no cálculo final.
 */
export const REGISTRO_COBRANCA = [
  campo('data', 'Data', 'data', { obrig: true, ajuda: 'Dia em que a carta saiu, o e-mail foi mandado, o protesto foi feito ou a despesa foi paga' }),
  campo('tipo', 'O que foi feito', 'opcao', { obrig: true, opcoes: [], ajuda: 'Ex.: Carta (registrada ou não), Protesto do boleto em cartório, Advogado contratado' }),
  campo('valor', 'Valor gasto', 'dinheiro', { ajuda: 'Quanto custou (ex.: carta registrada R$ 28,50; protesto R$ 45,00). Em branco se não teve custo. Fica só anotado: não é cobrado do inquilino' }),
  campo('descricao', 'Descrição', 'area', { obrig: true, largo: true, max: 2000, ajuda: 'Ex.: carta com AR enviada ao endereço do imóvel cobrando os aluguéis de 09 e 10/2026; protesto do boleto de 10/2026 no 2º Tabelionato' }),
];

/** Taxa do proprietário (condomínio) paga pelo inquilino: volta para ele no boleto do aluguel. */
export const RESSARCIMENTO = [
  campo('competencia_condominio', 'Mês do boleto do condomínio', 'mes', { obrig: true }),
  campo('descricao', 'Taxa', 'texto', { obrig: true, sugestoes: [], ajuda: 'Escreva o nome da taxa: nas próximas vezes ele aparece para escolher, e dá para mudar' }),
  campo('valor', 'Valor pago pelo inquilino', 'dinheiro', { obrig: true }),
  campo('data_pagamento', 'Data em que o inquilino pagou o condomínio', 'data', { obrig: true }),
  // o mês é o do aluguel (competência), como na lista de Boletos, e não o do vencimento (conferência de 24/11/2026)
  campo('competencia_abatimento', 'Abater no boleto do aluguel de (mês do aluguel)', 'mes', { ajuda: 'O mês do aluguel, como aparece em Boletos (ex.: aluguel de 11/2026, que vence em 12/2026 quando o aluguel vence no mês seguinte). Em branco: o boleto que vence no mês seguinte ao pagamento do condomínio' }),
];

/** Contas do imóvel e quem paga cada uma, conforme o contrato. */
export const CONTAS = [['conta_agua', 'Água'], ['conta_energia', 'Energia'], ['conta_gas', 'Gás'], ['conta_internet', 'Internet / TV'], ['conta_condominio', 'Condomínio']];
export const SITUACOES_CONTA = ['Por conta do inquilino', 'Incluso no aluguel', 'Não tem'];
/**
 * Seguro contra incêndio: sempre existe (obrigatório por lei; decisão do dono de 2026-11-20). Só se escolhe quem paga: o
 * inquilino (no boleto) ou a locadora (incluso no aluguel). Contrato antigo gravado como "Não tem" continua assim até alguém
 * escolher (o formulário mostra o valor antigo e o alerta "Seguro contra incêndio" pede a escolha; nada é apagado).
 */
export const SITUACOES_SEGURO = SITUACOES_CONTA.slice(0, 2);
/**
 * Quem paga cada conta no contrato (ou na ficha) novo: "Por conta do inquilino", salvo a Internet / TV, que vem "Não tem"
 * (decisão do dono em 2026-11-17; quem tiver internet no contrato troca no formulário). Gás e condomínio sem o dado no
 * imóvel também começam em "Não tem" (contasDoImovel, telas/cadastros.js). Contrato já gravado não muda.
 */
export const contaPadrao = (nome) => (nome === 'conta_internet' ? SITUACOES_CONTA[2] : SITUACOES_CONTA[0]);

/** Índices para corrigir o FCI (séries mensais do Banco Central). */
export const INDICES_FCI = ['Poupança', 'IPCA', 'IGP-M', 'INPC', 'IGP-DI', 'SELIC'];
/** Relógios lidos na entrada e na saída do inquilino. */
export const LEITURAS = [['agua', 'Relógio de água'], ['energia', 'Relógio de energia'], ['gas', 'Relógio de gás']];

export const LEITURA = [
  campo('data', 'Data da leitura', 'data', { obrig: true }),
  campo('momento', 'Momento', 'opcao', { obrig: true, padrao: 'Entrada do inquilino', opcoes: ['Entrada do inquilino', 'Saída do inquilino', 'Outra'] }),
  ...LEITURAS.map(([nome, rotulo]) => campo(nome, rotulo, 'texto', { teclado: 'decimal' })),
  campo('observacoes', 'Observações', 'area'),
];

/** Qualificação da pessoa no contrato (nacionalidade, estado civil, profissão, nascimento, endereço). */
/** Sexo para a concordância no contrato; "Neutro" escreve brasileiro(a), solteiro(a), portador(a). */
export const GENEROS = ['Masculino', 'Feminino', 'Neutro – o(a)'];
export const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'Separado(a)', 'União estável'];
/** Regime de bens do fiador casado: só a separação total por pacto antenupcial dispensa o cônjuge na fiança (Código Civil, art. 1.647). */
export const REGIMES_BENS = ['Comunhão parcial', 'Comunhão universal', 'Separação total (pacto antenupcial)', 'Separação obrigatória (por lei)', 'Participação final nos aquestos'];
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
  CEP_DA_PESSOA(''),
  campo('endereco', 'Endereço', 'texto', { largo: true }),
  ...qualificacao('', {}, false),
  campo('regime_bens', 'Regime de bens (se casado)', 'opcao', { opcoes: REGIMES_BENS, ajuda: 'Casado: o cônjuge assina a fiança, salvo separação total de bens por pacto antenupcial (Código Civil, art. 1.647, III)' }),
  campo('nome_conjuge', 'Cônjuge ou companheiro(a): nome', 'texto', { largo: true, ajuda: 'Casado ou em união estável: assina o contrato junto. Sem a assinatura do cônjuge a fiança pode ser anulada inteira (Súmula 332 do STJ)' }),
  campo('cpf_conjuge', 'CPF do cônjuge ou companheiro(a)', 'cpf'),
  campo('rg_conjuge', 'RG do cônjuge ou companheiro(a)'),
  campo('imovel_garantia', 'Imóvel do fiador (endereço, matrícula e registro)', 'area', { largo: true, ajuda: 'Ex.: Rua das Acácias, 50, Curitiba/PR, matrícula 12.345 da 1ª Circunscrição. Aparece no contrato' }),
  campo('data_entrada', 'Início do vínculo', 'data', { ajuda: 'Em branco: desde o início do contrato' }),
  campo('data_saida', 'Fim do vínculo', 'data', { ajuda: 'Em branco: até o fim do contrato. Depois desta data vai para "Fiadores anteriores"' }),
  campo('observacoes', 'Observações', 'area'),
];

/** Fiadores direto no cadastro do contrato (campos fiador1_nome, fiador2_nome...): no formulário (com o CEP) e gravados (sem os campos virtuais). */
const FORM_FIADOR = FIADOR.filter((c) => c.nome !== 'observacoes');
export const CAMPOS_FIADOR = FORM_FIADOR.filter((c) => !c.virtual);
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
    ...FORM_FIADOR.map((c) => ({ ...c, nome: `fiador${n}_${c.nome}`, obrig: false, fiador: n, ...GARANTIA_FIADOR })),
  ];
});
/** Comprovante: PDF ou foto, guardado na pasta do inquilino. Sem ele, o valor é salvo e fica um alerta para anexar depois. */
const SEM_COMPROVANTE = 'Ainda não tem? Salve assim mesmo: fica um alerta para buscar no banco e anexar depois';
const comprovante = (nome, rotulo, extra = {}) => campo(nome, rotulo, 'arquivo', { ajuda: `PDF ou foto do comprovante. ${SEM_COMPROVANTE}`, ...extra });

export const GARANTIAS = ['Caução', 'Depósito garantia', 'Fiador', 'Fiador + depósito', 'Seguro fiança', 'Sem garantia'];

const PJ = quando('inquilino_tipo', 'Pessoa jurídica (empresa)');
/** Rótulo do campo conforme o tipo de inquilino (ex.: CPF na pessoa física, CNPJ na empresa). */
const rotuloPJ = (rotulo) => ({ rotuloSe: { campo: 'inquilino_tipo', valor: 'Pessoa jurídica (empresa)', rotulo } });

export const CONTRATO = [
  secao('Imóvel e situação'),
  // o imóvel é escolhido só no contrato novo (obrigatório); imóvel lançado errado: "Corrigir imóvel" na página do inquilino.
  // "Ativo" não é mais campo: o inquilino fica inativo pela saída
  campo('imovel_id', 'Imóvel', 'opcao', { opcoes: [], soNovo: true, obrig: true, ajuda: 'Escolha o imóvel deste inquilino' }),
  campo('gerar_nf', 'Emite NF (desmarcado: boleto de controle)', 'simnao', { padrao: true, ajuda: 'Boleto de controle: o pagamento é controlado (em dia ou atrasado), mas não gera NF nem entra nas somas dos boletos e nos resultados' }),
  // regras especiais (pedido do dono de 18/11/2026): só aparece quando existe alguma (Sistema → Regras do sistema)
  campo('perfil_regras_id', 'Regras deste contrato', 'opcao', { opcoes: [], vazio: 'Regras do sistema', ajuda: 'Regras do sistema (as de todos) ou uma regra especial criada em Sistema → Regras do sistema' }),
  secao('Inquilino (responsável pelo contrato)'),
  // ordem pedida: tipo, documento e RG/inscrição estadual na mesma linha; depois nome, contatos e, numa linha nova, o endereço
  campo('inquilino_tipo', 'Tipo', 'opcao', { obrig: true, padrao: 'Pessoa física', opcoes: ['Pessoa física', 'Pessoa jurídica (empresa)'] }),
  campo('inquilino_cpf', 'CPF', 'cpfcnpj', { buscarPessoa: true, ...rotuloPJ('CNPJ'), ...PREENCHE_CNPJ({ nome: 'inquilino_nome', fantasia: 'inquilino_apelido', endereco: 'inquilino_endereco', telefone: 'inquilino_telefone', email: 'inquilino_email', representante: 'representante_nome' }) }),
  campo('inquilino_rg', 'RG', 'texto', rotuloPJ('Inscrição estadual')),
  QUEBRA,
  campo('inquilino_nome', 'Nome completo', 'texto', { obrig: true, largo: true, max: LIMITES.tomador_nome, ...rotuloPJ('Razão social'), ajuda: 'O boleto e a NF saem neste nome. Na empresa, vem do CNPJ' }),
  campo('inquilino_apelido', 'Nome fantasia', 'texto', PJ),
  campo('inquilino_telefone', 'Telefone', 'tel'),
  campo('inquilino_whatsapp', 'Este telefone é WhatsApp', 'simnao', { colado: true }),
  campo('inquilino_email', 'E-mail', 'email'),
  ...qualificacao('inquilino_', quando('inquilino_tipo', 'Pessoa física'), false),
  QUEBRA,
  campo('usar_endereco_imovel', 'Usar o endereço do imóvel deste contrato', 'simnao', { virtual: true, autoMsg: true, ajuda: 'Marcado: o endereço do inquilino fica igual ao do imóvel (rua, bairro, cidade/UF e CEP)' }),
  CEP_DA_PESSOA('inquilino_'),
  campo('inquilino_endereco', 'Endereço (residência, comercial ou sede da empresa)', 'texto', { largo: true }),
  QUEBRA,
  campo('notificacao_banco', 'Avisos do banco (C6) sobre o boleto por e-mail/SMS', 'opcao', { padrao: 'Usar o padrão da conta', opcoes: ['Usar o padrão da conta', 'Não notificar', 'Escolher'], ajuda: 'O banco avisa o inquilino do boleto. O padrão é o da conta, em Sistema → Banco' }),
  campo('notif_email', 'Por e-mail', 'simnao', { ...quando('notificacao_banco', 'Escolher'), padrao: true }),
  campo('notif_sms', 'Por SMS', 'simnao', { ...quando('notificacao_banco', 'Escolher'), padrao: true }),
  campo('notif_emissao', 'Na emissão', 'simnao', { ...quando('notificacao_banco', 'Escolher'), padrao: true }),
  campo('notif_antes', 'Um dia antes do vencimento', 'simnao', { ...quando('notificacao_banco', 'Escolher'), padrao: true }),
  campo('notif_vencimento', 'No vencimento', 'simnao', { ...quando('notificacao_banco', 'Escolher'), padrao: true }),
  campo('notif_depois', 'Um dia depois do vencimento', 'simnao', { ...quando('notificacao_banco', 'Escolher'), padrao: true }),
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
  CEP_DA_PESSOA('representante_', PJ),
  campo('representante_endereco', 'Endereço (residência ou comercial)', 'texto', { largo: true, ...PJ }),
  campo('representante_telefone', 'Telefone do representante', 'tel', PJ),
  campo('representante_email', 'E-mail do representante', 'email', PJ),
  { secao: 'Inquilino solidário', recolher: EXPANDIR_PARTE },
  campo('solidario_nome', 'Nome do inquilino solidário', 'texto', { largo: true, ajuda: 'Quem assina o contrato junto. O boleto continua saindo no nome do inquilino principal. Para tirar o solidário, apague o nome' }),
  campo('solidario_cpf', 'CPF / CNPJ do solidário', 'cpfcnpj', PREENCHE_CNPJ({ nome: 'solidario_nome', endereco: 'solidario_endereco', telefone: 'solidario_telefone', email: 'solidario_email' })),
  campo('solidario_rg', 'RG do solidário'),
  campo('solidario_telefone', 'Telefone do solidário', 'tel'),
  campo('solidario_email', 'E-mail do solidário', 'email'),
  ...qualificacao('solidario_', {}, false),
  campo('solidario_usar_endereco_imovel', 'Usar o endereço do imóvel deste contrato', 'simnao', { virtual: true, autoMsg: true, ajuda: 'Marcado: o endereço do solidário fica igual ao do imóvel (rua, bairro, cidade/UF e CEP)' }),
  CEP_DA_PESSOA('solidario_'),
  campo('solidario_endereco', 'Endereço (residência ou comercial)', 'texto', { largo: true }),
  secao('Objeto da locação (para o contrato)'),
  campo('finalidade', 'Finalidade', 'opcao', { padrao: 'Residencial', opcoes: ['Residencial', 'Não residencial'] }),
  campo('atividade', 'Atividade do estabelecimento', 'texto', { ...quando('finalidade', 'Não residencial'), ajuda: 'Ex.: studio de beleza' }),
  campo('descricao_objeto', 'Descrição do imóvel no contrato', 'texto', { largo: true, ajuda: 'Ex.: um apartamento mobiliado, com utensílios de cozinha e decoração; ou uma loja comercial, sem vaga de garagem' }),
  secao('Reserva dada na visita'),
  campo('reserva_valor', 'Valor da reserva', 'dinheiro'),
  campo('reserva_data', 'Data da reserva', 'data'),
  comprovante('comprovante_reserva', 'Comprovante da reserva', { ajuda: `PDF ou foto do comprovante da reserva. ${SEM_COMPROVANTE}` }),
  campo('reserva_competencia', 'Usar a reserva no aluguel de (mês de referência)', 'mes', { autoMsg: true, ajuda: 'O mês do aluguel, não o do vencimento (ex.: aluguel de 11/2026 vence em 12/2026 quando vence no mês seguinte). Em branco: usa no primeiro aluguel' }),
  secao('O que está incluso no contrato'),
  campo('conta_iptu', 'IPTU', 'opcao', { obrig: true, padrao: 'Por conta do inquilino', opcoes: SITUACOES_CONTA, ajuda: 'Por conta do inquilino: as parcelas entram no boleto' }),
  campo('conta_seguro', 'Seguro contra incêndio (obrigatório)', 'opcao', { obrig: true, padrao: 'Por conta do inquilino', opcoes: SITUACOES_SEGURO, ajuda: 'Sempre existe (obrigatório por lei). Por conta do inquilino: as parcelas entram no boleto; incluso no aluguel: a locadora paga' }),
  campo('fci_percentual', 'FCI: fundo de conservação (% do aluguel bonificado)', 'pct', { ajuda: 'Em branco: não cobra. Ex.: 5 → 5% de R$ 1.800,00 = R$ 90,00 por mês no boleto, guardados para os reparos na saída' }),
  campo('fci_indice', 'Correção mensal do FCI', 'opcao', { opcoes: INDICES_FCI, ...quando('fci_percentual', '*'), ajuda: 'Índice do Banco Central usado para corrigir o saldo do FCI mês a mês' }),
  ...CONTAS.map(([nome, rotulo]) => campo(nome, rotulo, 'opcao', { opcoes: SITUACOES_CONTA, padrao: contaPadrao(nome) })),
  campo('contas_adicionais', 'Contas ou cobranças adicionais', 'area', { linha: true, ajuda: 'Ex.: taxa de lixo, limpeza da área comum, rateio de água' }),
  secao('Valores e boleto'),
  campo('aluguel_inicial', 'Aluguel', 'dinheiro', { obrig: true, positivo: true, ajuda: 'Valor cheio do contrato (histórico)' }),
  campo('dia_vencimento', 'Dia do vencimento', 'inteiro', { obrig: true }),
  campo('aluguel_bonificado', 'Aluguel bonificado', 'dinheiro', { virtual: true, vinculo: 'desconto', ajuda: 'Digite o valor que o inquilino paga em dia: o % é calculado' }),
  campo('desconto_pontualidade_percentual', 'Bonificação (%)', 'pct', { vinculo: 'desconto', ajuda: 'Ou digite o % e o aluguel bonificado é calculado' }),
  campo('cobranca_mes_seguinte', 'O aluguel do mês vence no mês seguinte', 'simnao', { padrao: true, ajuda: 'Marcado: aluguel de julho vence em agosto' }),
  campo('bonificacao', 'Tem bonificação (desconto) por pontualidade', 'simnao', { padrao: true, colado: true }),
  QUEBRA,
  // decisão do dono de 24/11/2026: a tarifa é sempre cobrada; em branco vale a de Regras do sistema (tarifa_padrao)
  campo('taxa_boleto', 'Tarifa de emissão do boleto (R$)', 'dinheiro', { ajuda: 'Em branco: a tarifa padrão de Sistema → Regras do sistema. Um valor aqui vale só para este contrato. Entra no boleto e na descrição do boleto' }),
  campo('multa_percentual', 'Multa por atraso (%)', 'pct', { padrao: 2 }),
  campo('juros_mensal_percentual', 'Juros por atraso (% ao mês)', 'pct', { padrao: 1 }),
  campo('nao_cobrar_tarifa', 'Não cobrar tarifa do boleto', 'simnao', { ajuda: 'Marcado: este contrato não paga tarifa, nem a padrão de Regras do sistema' }),
  secao('Garantia'),
  campo('garantia_tipo', 'Tipo de garantia', 'opcao', { obrig: true, opcoes: GARANTIAS, ajuda: '"Fiador + depósito" são duas garantias: a Lei 8.245/91 permite só uma por contrato (art. 37, parágrafo único)' }),
  campo('caucao_meses', 'Caução equivale a quantos aluguéis', 'inteiro', { ...quando('garantia_tipo', 'Caução'), ajuda: 'O valor da caução é calculado: aluguéis × aluguel bonificado (parte "Valores e boleto"). Caução em dinheiro: no máximo 3 aluguéis (Lei 8.245/91, art. 38, §2º)' }),
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
  campo('prazo_meses', 'Prazo do contrato (meses)', 'inteiro', { ...quando('prazo_tipo', 'Determinado'), ajuda: 'Ex.: 30 meses a partir de 05/09/2026 terminam em 05/03/2029 (mesmo dia). Residencial com menos de 30 meses: no fim o contrato se prorroga e o imóvel só volta nos casos da lei ou depois de 5 anos (Lei 8.245/91, arts. 46 e 47)' }),
  campo('renovacao_automatica', 'Renovação automática', 'simnao'),
  secao('Correção anual'),
  campo('indice_correcao', 'Índice de correção previsto no contrato', 'opcao', { lista: 'indices', ajuda: 'Use "Editar lista" para incluir outro índice (ex.: IGP-M/IPCA, o maior dos dois, como prevê o contrato)' }),
  campo('data_base_correcao', 'Data-base da correção', 'data', { ajuda: 'O alerta de correção usa o aniversário desta data. Em branco: início do contrato' }),
  { secao: 'Carência de aluguel', recolher: 'Expanda para cadastrar carência' },
  campo('carencia_meses', 'Meses de carência', 'inteiro', { ajuda: 'Nestes meses o aluguel não é cobrado. Em branco: sem carência' }),
  campo('carencia_inicio', 'Carência a partir do aluguel de (mês de referência)', 'mes', { autoMsg: true, ajuda: 'O mês do aluguel, não o do vencimento. Em branco: mês de entrada' }),
  campo('carencia_cobrar_iptu', 'Na carência, cobrar o IPTU', 'simnao'),
  campo('carencia_cobrar_seguro', 'Na carência, cobrar o seguro', 'simnao'),
  campo('carencia_cobrar_taxa', 'Na carência, cobrar a tarifa do boleto', 'simnao'),
  secao('Vistoria de entrada'),
  campo('vistoria_link', 'Link da pasta de fotos da vistoria de entrada', 'url', { largo: true, ajuda: 'Cole o link da pasta na nuvem (OneDrive, Google Drive) onde está o .rar das fotos' }),
  secao('Observações'),
  campo('verificar', 'Pontos a verificar (aparece em amarelo)', 'area'),
  campo('observacoes', 'Observações', 'area'),
];

/**
 * Ficha em análise (pré-cadastro do interessado): só os dados da pessoa, os mesmos do inquilino no contrato (Inquilino,
 * Representante da empresa e Inquilino solidário), sem o que é do contrato. Os imóveis de interesse (caixas de marcar) são
 * montados na tela (CADASTROS.fichas), porque dependem dos imóveis cadastrados.
 */
const PARTES_DA_PESSOA = ['Inquilino (responsável pelo contrato)', 'Representante da empresa (pessoa física)', 'Inquilino solidário'];
const RENOMEAR_PARTE = { 'Inquilino (responsável pelo contrato)': 'Interessado (quem vai assinar o contrato)' };
export function camposDaPessoa(nomesDaPessoa) {
  let parte = null;
  return CONTRATO.filter((c) => {
    if (c.secao) parte = PARTES_DA_PESSOA.includes(c.secao) ? c.secao : null;
    if (!parte) return false;
    return c.secao || c.quebra || nomesDaPessoa.includes(c.nome) || /cep_busca$/.test(c.nome || '');
  }).map((c) => (RENOMEAR_PARTE[c.secao] ? { ...c, secao: RENOMEAR_PARTE[c.secao] } : c));
}

export const FICHA_INICIO = [
  secao('Ficha'),
  campo('data_recebida', 'Ficha recebida em', 'data', { obrig: true }),
  campo('situacao', 'Situação', 'opcao', { obrig: true, padrao: 'Em análise', opcoes: ['Em análise', 'Aprovada', 'Reprovada', 'Desistiu'], ajuda: 'Aprovada: na página da ficha aparece o botão para fazer o contrato. Desistiu: o interessado não segue e a reserva é devolvida conforme o termo de aceite (sem termo, por inteiro; com contrato já gerado, use o botão "Desistiu antes de assinar" na página da ficha)' }),
  campo('decisao_data', 'Data da decisão', 'data', { ...quando('situacao', 'Aprovada', 'Reprovada', 'Desistiu'), ajuda: 'Em branco: hoje' }),
  campo('decisao_motivo', 'Motivo / observação da decisão', 'area', { largo: true, linha: true, ...quando('situacao', 'Aprovada', 'Reprovada', 'Desistiu') }),
  // termo de aceite da reserva (2026-11-24): informação ou documento que não corresponde à realidade conta como desistência
  campo('reprovada_conferencia', 'Encerrada porque alguma informação ou documento não correspondeu à realidade na conferência', 'simnao', { ...quando('situacao', 'Reprovada'), largo: true,
    ajuda: 'Ex.: renda diferente da declarada, emprego que a empresa não confirma, documento com dados alterados ou de outra pessoa. Conta como desistência: vale a regra do termo aceito (padrão: a reserva fica com a empresa). Desmarcado: a reserva volta por inteiro' }),
];

/** Tipos de renda da ficha: cada um tem a sua lista de documentos (R.DOCUMENTOS_RENDA, regras.js). */
export const RENDAS_FICHA = ['Empregado (CLT)', 'Servidor público', 'Autônomo / profissional liberal', 'Empresário / sócio', 'Aposentado / pensionista', 'Outra'];
const PF = quando('inquilino_tipo', 'Pessoa física');
const CASADO = quando('inquilino_estado_civil', 'Casado(a)', 'União estável');
/** Renda, cônjuge e quem vai morar (pedido do dono, 2026-11-14): vão na ficha cadastral em PDF; não passam para o contrato. */
export const FICHA_RENDA = [
  secao('Renda'),
  campo('renda_tipo', 'Tipo de renda', 'opcao', { opcoes: RENDAS_FICHA, ...PF, ajuda: 'Escolhe os documentos de renda pedidos na ficha (ex.: CLT: 3 últimos holerites e a carteira de trabalho digital)' }),
  campo('renda_mensal', 'Renda mensal (bruta)', 'dinheiro', rotuloPJ('Faturamento mensal médio')),
  campo('renda_fonte', 'Empresa onde trabalha / fonte da renda', 'texto', { largo: true, ...PF }),
  campo('renda_fonte_telefone', 'Telefone da empresa (para a conferência)', 'tel', PF),
  campo('renda_desde', 'Trabalha lá desde', 'mes', PF),
  { secao: 'Cônjuge ou companheiro(a)', ...CASADO },
  campo('conjuge_nome', 'Nome do cônjuge ou companheiro(a)', 'texto', { largo: true, ...CASADO }),
  campo('conjuge_cpf', 'CPF', 'cpf', CASADO),
  campo('conjuge_profissao', 'Profissão', 'texto', CASADO),
  campo('conjuge_renda', 'Renda mensal (bruta)', 'dinheiro', CASADO),
  campo('conjuge_telefone', 'Telefone', 'tel', CASADO),
  secao('Quem vai morar ou usar o imóvel'),
  campo('moradores', 'Pessoas', 'area', { largo: true, linha: true, ajuda: 'Nome, parentesco e idade, uma por linha. Ex.: Ana Souza, filha, 8 anos' }),
  campo('animais', 'Animais de estimação', 'texto', { ajuda: 'Ex.: 1 cachorro de porte pequeno. Em branco: nenhum' }),
];
/** Fiadores da ficha: os mesmos campos do Novo contrato (fiador1_nome…), sem as datas do vínculo; vão preenchidos para o contrato. */
const SO_NO_CONTRATO = ['data_entrada', 'data_saida'];
export const CAMPOS_FIADOR_FICHA = CAMPOS_FIADOR.filter((c) => !SO_NO_CONTRATO.includes(c.nome)).map((c) => c.nome);
export const FICHA_FIADORES = [1, 2].flatMap((n) => [
  { secao: n === 1 ? 'Fiador' : 'Segundo fiador (se houver)', ...GARANTIA_FIADOR, ...(n === 1 ? {} : { recolher: EXPANDIR_PARTE }) },
  ...FORM_FIADOR.filter((c) => !SO_NO_CONTRATO.includes(c.nome)).map((c) => ({ ...c, nome: `fiador${n}_${c.nome}`, obrig: false, ...GARANTIA_FIADOR })),
]);

export const FICHA_FIM = [
  secao('Documentos recebidos'),
  campo('doc_ficha', 'Ficha cadastral', 'simnao'),
  campo('doc_pessoais', 'Documentos pessoais (RG, CPF, CNH)', 'simnao'),
  campo('doc_renda', 'Comprovante de renda', 'simnao'),
  campo('doc_residencia', 'Comprovante de residência', 'simnao'),
  campo('analise_serasa', 'Análise do Serasa', 'arquivo', { ajuda: 'PDF ou foto da consulta ao Serasa, para o histórico. Ao fazer o contrato, vai para a pasta do inquilino' }),
  // proposta combinada com o interessado: vai preenchida para o Novo contrato (pedido do dono, 2026-11-10)
  secao('Proposta (vai preenchida para o contrato)'),
  campo('aluguel_inicial', 'Aluguel oferecido', 'dinheiro', { ajuda: 'Valor cheio do aluguel' }),
  campo('dia_vencimento', 'Dia do vencimento', 'inteiro'),
  campo('aluguel_bonificado', 'Aluguel bonificado', 'dinheiro', { virtual: true, vinculo: 'desconto', ajuda: 'O valor que o inquilino paga em dia. Preencha dois dos três (aluguel, bonificado, %): o terceiro é calculado' }),
  campo('desconto_pontualidade_percentual', 'Bonificação (%)', 'pct', { vinculo: 'desconto' }),
  campo('bonificacao', 'Tem bonificação (desconto) por pontualidade', 'simnao', { padrao: true, colado: true }),
  campo('garantia_tipo', 'Tipo de garantia', 'opcao', { opcoes: GARANTIAS }),
  campo('prazo_meses', 'Prazo do contrato (meses)', 'inteiro', { ajuda: 'Ex.: 30. Vai no e-mail da ficha, no recibo da reserva e no contrato' }),
  campo('requisitos', 'Requisitos para a aprovação (vão no termo da reserva)', 'area', { largo: true, ajuda: 'Opcional. Ex.: renda de pelo menos 3 vezes o aluguel; sem restrição no nome. A lista de documentos e a garantia já vão sozinhas' }),
  // o que está incluso (pedido do dono em 2026-11-13): sai no e-mail da ficha e no recibo da reserva, e vai para o contrato
  secao('O que está incluso (vai na proposta e no contrato)'),
  campo('conta_iptu', 'IPTU', 'opcao', { opcoes: SITUACOES_CONTA, padrao: SITUACOES_CONTA[0] }),
  campo('iptu_estimado', 'IPTU por mês (estimado)', 'dinheiro', { ...quando('conta_iptu', 'Por conta do inquilino'), ajuda: 'Ex.: R$ 153,00 (as parcelas do ano ÷ 10). Só informa: o valor certo vem das guias' }),
  campo('conta_seguro', 'Seguro contra incêndio', 'opcao', { opcoes: SITUACOES_SEGURO, padrao: SITUACOES_CONTA[0] }),
  campo('seguro_estimado', 'Seguro por ano (estimado)', 'dinheiro', { ...quando('conta_seguro', 'Por conta do inquilino'), ajuda: 'Ex.: R$ 250,00, parcelado no boleto. Só informa: o valor certo vem da apólice' }),
  ...CONTAS.map(([nome, rotulo]) => campo(nome, rotulo, 'opcao', { opcoes: SITUACOES_CONTA, padrao: contaPadrao(nome) })),
  secao('Reserva'),
  campo('reserva_combinada', 'Reserva combinada (vai no termo de aceite)', 'dinheiro', { ajuda: 'Ex.: R$ 500,00. É o valor que a pessoa aceita no termo antes de depositar. Depois do depósito, preencha o valor e a data abaixo' }),
  campo('reserva_valor', 'Valor da reserva depositada', 'dinheiro'),
  campo('reserva_data', 'Data da reserva', 'data'),
  comprovante('comprovante_reserva', 'Comprovante da reserva', { ajuda: 'PDF ou foto do comprovante da reserva. Ao fazer o contrato, ele vai junto para a pasta do inquilino' }),
  { secao: 'Devolução da reserva (ficha reprovada ou desistência)', ...quando('situacao', 'Reprovada', 'Desistiu') },
  campo('devolucao_data', 'Reserva devolvida em', 'data', quando('situacao', 'Reprovada', 'Desistiu')),
  campo('devolucao_valor', 'Valor devolvido', 'dinheiro', { ...quando('situacao', 'Reprovada', 'Desistiu'), ajuda: 'Em branco: o valor do termo de aceite (a reserva inteira, ou menos a parte que fica com a empresa na desistência); sem termo, a reserva inteira' }),
  comprovante('comprovante_devolucao', 'Comprovante da devolução', { ...quando('situacao', 'Reprovada', 'Desistiu'), ajuda: 'PDF ou foto do comprovante da devolução' }),
  secao('Observações'),
  campo('observacoes', 'Observações da análise', 'area'),
];

export const CORRECAO = [
  campo('data_vigencia', 'Vale a partir de', 'data', { obrig: true, ajuda: 'O boleto de um mês usa o valor vigente no dia 1º daquele mês' }),
  campo('indice', 'Índice usado nesta correção', 'opcao', { obrig: true, lista: 'indices', ajuda: 'O índice previsto no contrato fica guardado junto, no histórico' }),
  campo('data_indice', 'Mês de referência do índice', 'mes', { ajuda: 'Ex.: índice acumulado até 2026-05' }),
  campo('percentual', 'Percentual do índice (%)', 'pct', { negativo: true, ajuda: 'Informe o percentual ou o novo valor' }),
  campo('valor_novo', 'Novo valor do aluguel', 'dinheiro'),
  campo('observacoes', 'Observações', 'area'),
];

export const SEGURO = [
  campo('seguradora', 'Seguradora'),
  campo('apolice', 'Nº da apólice'),
  campo('telefone_assistencia', 'Telefone da assistência', 'texto', { teclado: 'tel', ajuda: 'Ex.: 0800 000 0000 (chaveiro, encanador, vidraceiro do seguro)' }),
  campo('data_contratacao', 'Data de contratação', 'data'),
  campo('vigencia_inicio', 'Início da vigência', 'data', { obrig: true }),
  campo('vigencia_fim', 'Fim da vigência', 'data', { obrig: true }),
  campo('valor_total', 'Valor total', 'dinheiro', { obrig: true, positivo: true }),
  campo('num_parcelas', 'Número de parcelas', 'inteiro', { obrig: true, padrao: 1 }),
  campo('primeira_competencia', 'Cobrar 1ª parcela no aluguel de', 'mes', { obrig: true }),
  campo('observacoes', 'Observações', 'area'),
];

export const IPTU = [
  campo('ano', 'Ano', 'inteiro', { obrig: true }),
  campo('valor_total', 'Valor total do IPTU parcelado', 'dinheiro', { obrig: true, positivo: true, ajuda: 'É o valor repassado ao inquilino, mesmo quando o proprietário paga à vista com desconto' }),
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


/** Campos do fiador na troca de garantia (o início do vínculo é a data da troca; o fim, quando ele sair). */
const FORM_FIADOR_TROCA = FORM_FIADOR.filter((c) => !['data_entrada', 'data_saida'].includes(c.nome));
export const CAMPOS_FIADOR_TROCA = FORM_FIADOR_TROCA.filter((c) => !c.virtual);
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
    ...FORM_FIADOR_TROCA.map((c) => ({ ...c, nome: `tf${k + 1}_${c.nome}`, obrig: false, ...GARANTIA_FIADOR })),
  ]),
  ...Array.from({ length: NOVOS_FIADORES_TROCA }, (_, k) => [
    { secao: k ? 'Mais um fiador novo (se houver)' : 'Fiador novo (se entrar alguém)', ...GARANTIA_FIADOR },
    ...FORM_FIADOR_TROCA.map((c) => ({ ...c, nome: `tn${k + 1}_${c.nome}`, obrig: false, ...GARANTIA_FIADOR })),
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

// troca de titular com garantia nova: a garantia do anterior é devolvida a ele (como no cálculo final da saída)
export const DEVOLUCAO_GARANTIA = [
  campo('data', 'Data da devolução', 'data', { obrig: true }),
  campo('garantia_valor', 'Valor da garantia a devolver (caução ou depósito)', 'dinheiro', { obrig: true }),
  campo('indice_percentual', 'Correção da garantia: índice da poupança no período (%)', 'pct', { autoMsg: true, ajuda: 'Vem do Banco Central, pelo aniversário de cada depósito (confira com o extrato da poupança). Em branco: sem correção' }),
  campo('debitos', 'Débitos do inquilino a descontar', 'dinheiro', { ajuda: 'Aluguéis e encargos até a véspera da troca em aberto, reparos etc.' }),
  campo('debitos_descricao', 'Descrição dos débitos', 'area'),
  // créditos do inquilino (decisões do dono de 24/11/2026): ressarcimento do condomínio sem boleto onde abater
  campo('creditos', 'Créditos do inquilino a devolver', 'dinheiro', { ajuda: 'Taxas do proprietário que o inquilino pagou no condomínio e não têm boleto onde abater (pagas depois da saída, ou cujo boleto passou ao novo titular). Somam ao valor devolvido' }),
  campo('creditos_descricao', 'Descrição dos créditos', 'area'),
  comprovante('comprovante', 'Comprovante da devolução', { ajuda: `PDF ou foto da transferência. ${SEM_COMPROVANTE}` }),
  campo('observacoes', 'Observações', 'area'),
];

export const RENOVACAO = [
  campo('data', 'Data', 'data', { obrig: true, ajuda: 'O novo valor (se houver) vale a partir desta data' }),
  campo('tipo', 'O que aconteceu', 'opcao', { obrig: true, opcoes: ['Renovado com nova data de término', 'Passou a prazo indeterminado', 'Novo valor negociado'] }),
  campo('nova_vigencia_fim', 'Nova data de término', 'data', { ajuda: 'Só para renovação com prazo determinado' }),
  // como no contrato (pedido do dono, 2026-11-13): aluguel cheio, bonificado e %; preenchidos dois, o terceiro é calculado
  campo('novo_valor', 'Novo aluguel negociado (valor cheio)', 'dinheiro', { base: true, ajuda: 'Em branco: o aluguel continua o mesmo' }),
  campo('novo_bonificado', 'Novo aluguel bonificado', 'dinheiro', { virtual: true, vinculo: 'desconto', ajuda: 'O valor que o inquilino paga em dia. Preencha dois dos três (cheio, bonificado, %): o terceiro é calculado' }),
  campo('novo_percentual', 'Bonificação (%)', 'pct', { vinculo: 'desconto', ajuda: 'Vem a bonificação atual do contrato' }),
  // decisão do dono (16/11/2026): o operador diz de qual aluguel em diante vale; os boletos em aberto desse mês em diante são refeitos
  campo('vale_desde', 'O novo valor vale a partir do aluguel de (mês de referência)', 'mes', { autoMsg: true, ajuda: 'O mês do aluguel, não o do vencimento. Os boletos em aberto deste mês em diante são refeitos com o novo valor (os pagos e os de antes ficam como estão). Em branco: o mês da data acima, se for dia 1º, ou o mês seguinte' }),
  campo('observacoes', 'Observações', 'area'),
];

// a data de saída vem do contrato ("Informar data de saída"); a leitura dos relógios na saída é a mesma da vistoria de saída
// (vem preenchida e, se mudar aqui, muda lá também). O "Vistoria de saída" (sem/com pendências, não feita) não é digitado:
// sai da vistoria de saída registrada (contratos.js, resultadoVistoriaSaida) e é guardado em vistoria_saida ao salvar
export const ENCERRAMENTO = [
  ...LEITURAS.map(([nome, rotulo]) => campo(`leitura_${nome}`, `${rotulo} na saída`, 'texto', { teclado: 'decimal' })),
  campo('garantia_valor', 'Valor da garantia a devolver (caução ou depósito)', 'dinheiro'),
  campo('indice_percentual', 'Correção da garantia: índice da poupança no período (%)', 'pct', { autoMsg: true, ajuda: 'Vem do Banco Central, pelo aniversário de cada depósito (confira com o extrato da poupança)' }),
  campo('debitos', 'Débitos do inquilino a descontar', 'dinheiro', { ajuda: 'Aluguéis e encargos em aberto, reparos da vistoria etc.' }),
  campo('debitos_descricao', 'Descrição dos débitos', 'area'),
  // créditos do inquilino (decisões do dono de 24/11/2026): ressarcimento do condomínio sem boleto onde abater
  campo('creditos', 'Créditos do inquilino a devolver', 'dinheiro', { ajuda: 'Taxas do proprietário que o inquilino pagou no condomínio e não têm boleto onde abater (pagas depois da saída, ou cujo boleto passou ao novo titular). Somam ao valor devolvido' }),
  campo('creditos_descricao', 'Descrição dos créditos', 'area'),
  campo('fci_credito', 'FCI corrigido: crédito do inquilino', 'dinheiro', { ajuda: 'Vem do saldo corrigido do FCI (use "Calcular atualização" na página do inquilino antes)' }),
  campo('fci_danos', 'Reparos de danos pagos com o FCI', 'dinheiro', { ajuda: 'Só danos apurados na vistoria de saída (nunca aluguel ou contas). O que passar do FCI vira débito; o que sobrar do FCI volta ao inquilino' }),
  campo('observacoes', 'Observações', 'area', { ajuda: 'Se o inquilino contestar a vistoria de saída, anote aqui' }),
];

export const AVULSA = [
  campo('data_pagamento', 'Data em que o dinheiro entrou', 'data', { obrig: true }),
  campo('valor', 'Valor da NF', 'dinheiro', { obrig: true }),
  campo('descricao', 'Descrição', 'texto', { largo: true, ajuda: 'Ex.: Airbnb outubro, aluguel de vaga, reembolso' }),
  campo('imovel_id', 'Imóvel (opcional)', 'opcao', { opcoes: [], ajuda: 'Se escolher, usa as empresas e o endereço do imóvel' }),
  campo('periodo_inicio', 'Período: de', 'data'),
  campo('periodo_fim', 'Período: até', 'data'),
  campo('tomador_nome', 'Cliente na NF', 'texto', { obrig: true, largo: true, max: LIMITES.tomador_nome }),
  campo('tomador_documento', 'CPF / CNPJ do cliente', 'cpfcnpj'),
  campo('tomador_telefone', 'Telefone do cliente', 'tel'),
  campo('tomador_endereco', 'Endereço na NF', 'texto', { largo: true, max: LIMITES.tomador_endereco }),
  campo('municipio', 'Município', 'texto', { padrao: 'CURITIBA', max: LIMITES.municipio }),
  campo('observacoes_nf', 'Observações impressas na NF', 'area', { max: LIMITES.observacoes_nf, ajuda: 'Aparecem na caixa grande da NF (até 5 linhas)' }),
  campo('observacoes', 'Observações internas', 'area'),
];

export const EMITENTE = [
  campo('nome', 'Nome no topo da NF', 'texto', { obrig: true, ajuda: 'Ex.: IMOBILIÁRIA EXEMPLO' }),
  campo('razao_social', 'Razão social', 'texto', { obrig: true, largo: true }),
  campo('cnpj', 'CNPJ', 'cnpj', PREENCHE_CNPJ({ razao: 'razao_social', nome: 'nome', endereco: 'endereco', sede: 'endereco_sede', uf: 'uf_sede' })),
  campo('endereco', 'Endereço (como aparece na NF)', 'texto', { largo: true }),
  campo('municipio', 'Município do serviço', 'texto', { ajuda: 'Como sai na NF. Ex.: CURITIBA' }),
  campo('aba_modelo', 'Aba no modelo Excel', 'texto', { ajuda: 'Só para quem usa um modelo de NF em Excel próprio: o nome da aba desta empresa. Pode deixar em branco' }),
  campo('ativo', 'Ativa', 'simnao', { padrao: true }),
  secao('Para o contrato de locação'),
  campo('assina_documentos', 'Assina os documentos do inquilino', 'simnao', { ajuda: 'Contrato, vistoria, recibos, cartas e e-mails saem em nome desta empresa, mesmo quando o imóvel é dividido com outra. Marque só uma. Sem nenhuma marcada, saem em nome das empresas do imóvel' }),
  campo('endereco_sede', 'Endereço da sede (por extenso)', 'texto', { largo: true, ajuda: 'Ex.: Rua das Flores, nº 100, Centro, Curitiba, Paraná' }),
  campo('cidade_documentos', 'Cidade dos documentos', 'texto', { ajuda: 'Vai no "local e data" do contrato, dos recibos e das cartas quando o imóvel não tem cidade. Ex.: Curitiba' }),
  campo('uf_sede', 'Estado da sede (UF)', 'texto', { max: 2, ajuda: 'Duas letras. Vai depois da cidade do imóvel ("Curitiba/PR") no contrato, nos recibos e nos e-mails quando o imóvel não tem Estado nem CEP. Ex.: PR' }),
  campo('energia_concessionaria', 'Companhia de energia (nome por extenso)', 'texto', { largo: true, ajuda: 'Sai no contrato e nos e-mails; a sigla vai entre parênteses. Ex.: Companhia Paranaense de Energia (COPEL). Imóvel atendido por outra: informe no cadastro do imóvel' }),
  campo('agua_concessionaria', 'Companhia de água (nome por extenso)', 'texto', { largo: true, ajuda: 'Ex.: Companhia de Saneamento do Paraná (SANEPAR)' }),
  campo('representante_nome', 'Representante que assina', 'texto', { largo: true, ajuda: 'Ex.: MARIA DA SILVA' }),
  campo('representante_cargo', 'Cargo do representante', 'texto', { padrao: 'sócia administradora' }),
  campo('representante_rg', 'RG do representante'),
  campo('representante_cpf', 'CPF do representante', 'cpf'),
  ...qualificacao('representante_', {}, false),
  secao('E-mails e mensagens ao inquilino'),
  campo('assinatura_email', 'Nome que assina os e-mails', 'texto', { ajuda: 'Vai depois de "Atenciosamente," no fim de todo e-mail. Ex.: Administradora' }),
  campo('email_contato', 'E-mail da administração', 'email', { ajuda: 'Vai embaixo do nome, no fim de todo e-mail. Ex.: contato@imobiliariaexemplo.com.br' }),
  campo('assinatura_mensagens', 'Assinatura dos lembretes de boleto', 'texto', { ajuda: 'Vai no fim do lembrete por e-mail ou WhatsApp. Ex.: Imobiliária Exemplo' }),
  campo('conta_deposito', 'Conta para depósito da caução e da reserva', 'area', { largo: true, ajuda: 'Titular, banco, agência, conta e Pix, como devem sair no e-mail do contrato para assinar e no termo da reserva. Sem ela, o e-mail mostra "[preencher: conta_deposito]"' }),
];

export const USUARIO = [
  campo('login', 'Login', 'texto', { obrig: true }),
  campo('nome', 'Nome', 'texto', { obrig: true }),
  // dados na nuvem: a pessoa entra pelo código enviado a este e-mail (o mesmo da lista do Cloudflare Access)
  campo('email', 'E-mail de acesso', 'email', { ajuda: 'Para entrar pela internet (nuvem). Precisa ser o mesmo da lista do Cloudflare.' }),
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
  campo('fci', 'FCI (fundo de conservação do imóvel)', 'dinheiro', { ajuda: 'Fora da NF, da multa e dos juros' }),
  campo('outros', 'Ajuste do mês: cobrança adicional (+) ou ressarcimento (−)', 'dinheiro', { negativo: true, ajuda: 'Valor negativo desconta do boleto. Ex.: -150,00' }),
  campo('outros_descricao', 'Motivo do ajuste', 'texto', { ajuda: 'Ex.: reforma do banheiro, acerto do mês anterior' }),
  campo('outros_na_nf', 'O ajuste entra na NF', 'simnao', { ajuda: 'Marcado: o valor do ajuste soma na NF e o motivo vai nas observações dela (ex.: TV vendida junto). Desmarcado (padrão): fica fora da NF (ex.: vidro quebrado, multa)' }),
  campo('reserva_utilizada', 'Reserva utilizada', 'dinheiro'),
  campo('multa_percentual', 'Multa por atraso (%)', 'pct', { min: 0 }),
  campo('juros_mensal_percentual', 'Juros por atraso (% ao mês)', 'pct', { min: 0 }),
  campo('observacoes_nf', 'Observações impressas na NF', 'area', { max: LIMITES.observacoes_nf, ajuda: 'Aparecem na caixa grande da NF (até 5 linhas)' }),
  campo('observacoes', 'Observações', 'area'),
];

// --------------------------------------------------------------------------
// formatadores criados uma vez (criar um a cada chamada custa ~60 vezes mais); a saída é a mesma do toLocaleString
const FMT_DINHEIRO = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FMT_PCT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4, useGrouping: false });

export function dinheiroTexto(c) {
  if (c === null || c === undefined || c === '') return '';
  return FMT_DINHEIRO.format(c / 100);
}

export function pctTexto(n) {
  if (n === null || n === undefined || n === '') return '';
  return FMT_PCT.format(Number(n));
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
      if (c.tipo === 'dinheiro') {
        dados[c.nome] = centavos(bruto);
        // negativo só onde faz sentido (ex.: ajuste do mês que desconta do boleto); senão entrava nos totais
        if (dados[c.nome] < 0 && !c.negativo && !c.positivo) { erros[c.nome] = 'O valor não pode ser negativo'; continue; }
      } else if (c.tipo === 'pct') {
        dados[c.nome] = numero(bruto);
        if (c.min !== undefined && dados[c.nome] < c.min) { erros[c.nome] = c.min === 0 ? 'Não pode ser negativo' : `Não pode ser menor que ${c.min}`; continue; }
      }
      else if (c.tipo === 'inteiro') {
        const n = numero(bruto);
        if (!Number.isInteger(n)) throw new Error();
        dados[c.nome] = n;
      } else if (c.tipo === 'data') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) throw new Error();
        dados[c.nome] = bruto;
      } else if (c.tipo === 'mes') {
        // mês 13 ou 00 (navegador que mostra o campo como texto, ex.: Firefox) passava e virava outro mês na conta do vencimento
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bruto)) throw new Error();
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
      } else if (c.tipo === 'tel') {
        // telefone com DDD: 10 ou 11 números (o que já estava salvo e não mudou passa, dados antigos)
        const n = soDigitos(bruto).length;
        if (![10, 11].includes(n) && !(antigo && antigo[c.nome] === bruto)) { erros[c.nome] = 'Telefone com DDD: 10 ou 11 números. Ex.: (41) 99999-8888'; dados[c.nome] = bruto; continue; }
        dados[c.nome] = [10, 11].includes(n) ? mascarar('tel', bruto) : bruto;
      } else if (c.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(bruto) && !(antigo && antigo[c.nome] === bruto)) {
        erros[c.nome] = 'E-mail incompleto. Ex.: nome@gmail.com';
        dados[c.nome] = bruto;
      }
      else if (c.tipo === 'opcao' && c.nome.endsWith('_id')) dados[c.nome] = Number(bruto);
      else dados[c.nome] = c.max ? bruto.slice(0, c.max) : bruto;
    } catch (e) {
      erros[c.nome] = e instanceof ErroUsuario ? e.message : 'Valor inválido';
    }
  }
  // valores em dinheiro que não podem ser negativos (``naoNegativo``) nem zero (``positivo``): aluguel, seguro, IPTU, reforma
  for (const c of campos) {
    const v = dados[c.nome];
    if (c.tipo !== 'dinheiro' || erros[c.nome] || typeof v !== 'number') continue;
    if (c.positivo && !(v > 0)) erros[c.nome] = 'Informe um valor maior que zero';
    else if (c.naoNegativo && v < 0) erros[c.nome] = 'O valor não pode ser negativo';
  }
  return { dados, erros };
}

/** Os valores de um formulário (paraFormulario) lidos como se fossem enviados sem mexer em nada. */
export function lerValores(campos, valores, antigo = null) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(valores || {})) {
    if (v === true) fd.append(k, '1');
    else if (v !== false && v !== '' && v !== null && v !== undefined) fd.append(k, String(v));
  }
  return ler(campos, fd, antigo).dados;
}

const mesmoValor = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Formulário aberto enquanto outra pessoa (ou outro aparelho) mudava o mesmo registro: o campo que quem está salvando não
 * mexeu fica com o valor novo, em vez de voltar ao que o formulário mostrava ao abrir (item 15 do mutirão 3000).
 * `valoresAoAbrir`: o que o formulário mostrou (paraFormulario); `valoresAgora`: o mesmo, montado com o registro de agora.
 * Muda `dados` e devolve os rótulos dos campos que ficaram com o valor do outro.
 */
export function manterMudancasDeOutros(campos, dados, valoresAoAbrir, valoresAgora, antigo = null) {
  if (!valoresAoAbrir || !valoresAgora) return [];
  const inicial = lerValores(campos, valoresAoAbrir, antigo);
  const agora = lerValores(campos, valoresAgora, antigo);
  const mantidos = [];
  for (const c of campos) {
    const k = c.nome;
    if (!k || c.virtual || c.tipo === 'arquivo' || !(k in dados) || !(k in inicial)) continue;
    if (mesmoValor(dados[k], inicial[k]) && !mesmoValor(agora[k], inicial[k])) {
      dados[k] = agora[k];
      mantidos.push(c.rotulo || k);
    }
  }
  return mantidos;
}

/** Um item na caixa "Editar lista": o nome e o × que o tira da lista. */
export const chipDaLista = (lista, v) => `<span class="chip">${esc(v)}<button type="button" class="x-excluir" title="Remover da lista" data-acao="removerDaLista" data-lista="${lista}" data-valor="${esc(v)}">×</button></span>`;

/** Caixa para editar uma lista de opções (incluir e remover), aberta pelo botão "Editar lista". */
function editorLista(c) {
  const itens = c.opcoes.map((o) => (Array.isArray(o) ? o[0] : o));
  return `<button type="button" class="link-botao" data-acao="abrirLista" data-lista="${c.lista}">Editar lista</button>
    <div class="editor-lista" data-editor="${c.lista}" hidden>
      <div class="chips">${itens.map((v) => chipDaLista(c.lista, v)).join('')}</div>
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
    <button type="button" class="x-excluir" title="Apagar só o arquivo" data-acao="${acao}" ${extra} data-confirmar="${esc(`Apagar o arquivo "${nome}"? Ele sai da pasta e não dá para recuperar.`)}">×</button></span>
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
      // ``guardado``: o arquivo está em outro lugar (ex.: o comprovante da ficha no Novo contrato): { acao, dados, abrir }
      const g = c.guardado;
      entrada = `<input id="${id}" name="${c.nome}" type="file" accept="${ACEITA_DOCUMENTOS}">${typeof v === 'string' && v ? (g ? arquivoGuardado(c.nome, v, g.acao, g.dados, g.abrir) : arquivoGuardado(c.nome, v)) : ''}`;
    } else if (c.tipo === 'area') entrada = `<textarea id="${id}" name="${c.nome}" ${c.linha ? 'rows="1" class="cresce"' : ''} ${max}>${esc(v)}</textarea>`;
    else if (c.tipo === 'opcao') {
      const ops = c.opcoes.map((o) => (Array.isArray(o) ? o : [o, o]));
      if (v !== '' && !ops.some(([k]) => String(k) === String(v))) ops.push([v, v]);
      entrada = `<select id="${id}" name="${c.nome}"><option value="">${esc(c.vazio || '')}</option>${ops.map(([k, t]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
      if (c.lista) entrada += editorLista(c);
    } else {
      // link fica como texto: o navegador recusaria "onedrive.live.com/..." sem https://, e ler() completa sozinho
      const tipo = { data: 'date', mes: 'month', email: 'email', tel: 'tel' }[c.tipo] || 'text';
      // campo que aceita negativo fica com o teclado completo: o teclado de números do iPhone não tem o sinal de menos
      const decimal = c.negativo ? '' : 'inputmode="decimal"';
      // ``teclado``: texto que é número (ex.: leitura do relógio, "1.234,5") abre o teclado de números
      const extra = c.teclado ? `inputmode="${c.teclado}"` : c.tipo === 'dinheiro' ? `${decimal} data-dinheiro placeholder="0,00"` : c.tipo === 'pct' ? decimal : c.tipo === 'inteiro' ? 'inputmode="numeric"'
        : [...DOCUMENTOS, 'tel'].includes(c.tipo) ? `inputmode="numeric" data-mascara="${c.tipo}"${c.preencher ? ` data-preencher="${esc(JSON.stringify(c.preencher))}"` : ''}${c.buscarPessoa ? ' data-buscar-pessoa' : ''}` : '';
      const vinc = c.vinculo ? `data-vinculo="${c.vinculo}" data-tipo="${c.tipo}"` : c.base ? 'data-vinculo-base' : '';
      // sugestões: o que já foi escrito antes aparece para escolher (e dá para escrever outro)
      const lista = c.sugestoes ? `list="${id}_sugestoes" autocomplete="off"` : '';
      entrada = `<input id="${id}" name="${c.nome}" type="${tipo}" value="${esc(v)}" ${extra} ${vinc} ${lista} ${max} ${c.tipo === 'mes' ? 'placeholder="AAAA-MM"' : ''}>`;
      if (c.tipo === 'data' && (c.atalhos ?? DATAS_COM_ATALHO.has(c.nome))) entrada += atalhosData();
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
