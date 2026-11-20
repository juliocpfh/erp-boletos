// Cadastros (#/novo/TABELA e #/editar/TABELA/ID): CADASTROS define, para cada tabela, os campos, os ajustes antes de salvar,
// a conferência (avisos.js), como salvar e para onde voltar. telaFormulario desenha o formulário; o envio é FORMULARIOS.cadastro (envios.js).
import { alterar, aviso, E, login, podeUsuario, tokenDaSessao } from '../app.js';
import * as S from '../armazenamento.js';
import { camposDeSenha, emailDeAcesso, ERRO_SENHA_CURTA, senhaCurta, usuarioComMesmoAcesso } from '../auth.js';
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import { resultadoVistoriaSaida, textoReparo, TIPO_ADITIVO_TROCA } from '../contratos.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { confirmarAvisos, conferirAvulsa, conferirBoleto, conferirContrato, conferirIptu, conferirLeitura, conferirPessoa, conferirRenovacao, conferirRessarcimento, conferirSeguro, dataNoFuturo } from './avisos.js';
import { CAMPOS_GARANTIA_HERDADA, CAMPOS_VALORES_HERDADOS, ENDERECO_DO_IMOVEL, enderecoInquilino } from './campos.js';
import { ACEITA_DOCUMENTOS, arquivoSumiu, botao, buscar, d, encerrarLinksDaFicha, etiqueta, extensao, guardarGuiasSoltas, levarDocumentosDaFicha, memoria, naoEncontrado, nomePastaContrato, nomePastaFicha, opera, PASTA_FICHAS, ordenar, pastaDoEscopo, pastaPaiContrato, renomearNoDisco, salvarAssinado, semAcentoArquivo, trazerHeranca, trazerHerancaAssinada, cienciaDaTroca, registrarCiencia } from './comum.js';
import { confirmarValoresIniciais, inicialBonificado } from './contrato.js';

// --------------------------------------------------------------------------
// Formulários de cadastro
// --------------------------------------------------------------------------
/** Opções das listas editáveis (concessionárias, índices) vêm do banco. */
const comListas = (campos) => campos.map((c) => (c.lista ? { ...c, opcoes: R.lista(d(), c.lista) } : c));

// --------------------------------------------------------------------------
/**
 * Uso da reserva: nos boletos do sistema e/ou marcada como já abatida em aluguéis antigos (fora do sistema).
 * Marcada: mostra o mês e o valor, com "Excluir registro". A reserva vai para o mês certo sozinha ao salvar o contrato.
 */
export function caixaReservaAbatida(c) {
  const usos = d().cobrancas.filter((x) => x.contrato_id === c.id && x.reserva_utilizada > 0);
  const ant = c.reserva_usada_anterior > 0 && R.contratoHerdado(d(), c);
  const nosBoletos = [usos.length ? `Abatida nos boletos: ${usos.map((x) => `${compBr(x.competencia)} ${reais(x.reserva_utilizada)}${x.data_pagamento ? ' (pago)' : ''}`).join('; ')}.` : '',
    ant ? `Já usada no contrato de ${esc(ant.inquilino_nome)}: ${reais(c.reserva_usada_anterior)}${R.mesesUsoReserva(d(), ant).length ? `, em ${R.mesesUsoReserva(d(), ant).map(compBr).join(', ')}` : ''}.` : ''].filter(Boolean).join(' ');
  if (c.reserva_abatida_valor > 0) {
    return `<div class="alerta ok"><b>Reserva já abatida</b> em ${compBr(c.reserva_abatida_comp)}: ${reais(c.reserva_abatida_valor)} (aluguel antigo, fora dos boletos do sistema).
      ${nosBoletos ? `<br>${nosBoletos}` : ''}
      ${opera() ? `<div class="acoes" style="margin-top:6px">${botao('desmarcarReservaAbatida', 'Excluir registro', { id: c.id }, 'perigo pequeno', 'Excluir o registro de reserva já abatida? A reserva volta a abater os boletos em aberto.')}</div>` : ''}</div>`;
  }
  const max = R.reservaParaMarcarAbatida(d(), c);
  return `${usos.length || ant ? `<p class="suave">${nosBoletos}</p>` : `<div class="alerta aviso"><b>Reserva ainda não abatida em nenhum boleto do sistema.</b> Se ela já foi abatida num aluguel antigo, marque abaixo o mês e o valor.</div>`}
    ${opera() ? `${max > 0 ? `<form data-form="reservaAbatida" class="acoes" style="margin-top:6px"><input type="hidden" name="contrato" value="${c.id}">
        <label class="suave" style="margin:0">Abatida em</label><input type="month" name="competencia" value="${esc(R.competenciaReserva(c) || '')}" style="width:auto" required>
        <label class="suave" style="margin:0">valor R$</label><input name="valor" value="${esc(C.reais(max, false))}" style="width:120px" inputmode="decimal" data-dinheiro required>
        <button class="secundario pequeno">Marcar como já abatida</button></form>` : ''}` : ''}`;
}

// Comprovantes (caução, depósito, reserva, aplicação e complemento da caução): PDF ou foto na pasta do inquilino.
// O valor pode ser salvo sem o comprovante: fica um alerta para buscar no banco e anexar depois.
// --------------------------------------------------------------------------
const COMPROVANTES_CONTRATO = [
  { campo: 'comprovante_caucao', valor: 'caucao_valor', data: 'caucao_data', nome: 'caucao', texto: 'do depósito da caução', vale: (x) => x.garantia_tipo === 'Caução' },
  { campo: 'comprovante_deposito', valor: 'deposito_valor', data: 'deposito_data', nome: 'deposito-garantia', texto: 'do depósito de garantia', vale: (x) => R.temDeposito(x) },
  { campo: 'comprovante_reserva', valor: 'reserva_valor', data: 'reserva_data', nome: 'reserva', texto: 'da reserva', vale: () => true },
];

const COMPROVANTE_APLICACAO = [{ campo: 'comprovante', valor: 'valor', data: 'data', nome: 'aplicacao-garantia', texto: 'da aplicação', vale: () => true }];

const comprovanteDoDeposito = (r) => [{ campo: 'comprovante', valor: 'valor', data: 'data', nome: r.qual === 'caucao' ? 'caucao' : 'deposito-garantia', texto: 'do depósito', vale: () => true }];

const COMPROVANTE_COMPLEMENTO = [{ campo: 'comprovante', valor: 'complemento', data: 'data', nome: 'complemento-caucao', texto: 'do complemento da caução', vale: () => true }];
const COMPROVANTES_FICHA = [
  { campo: 'comprovante_reserva', valor: 'reserva_valor', data: 'reserva_data', nome: 'reserva', texto: 'da reserva', vale: () => true },
  { campo: 'comprovante_devolucao', valor: 'devolucao_valor', data: 'devolucao_data', nome: 'devolucao-reserva', texto: 'da devolução da reserva', vale: (x) => R.fichaSemContrato(x) },
];
const COMPROVANTE_DEVOLUCAO = [{ campo: 'comprovante', valor: 'garantia_valor', data: 'data', nome: 'devolucao-garantia', texto: 'da devolução da garantia', vale: () => true }];

const arquivoEscolhido = (form, campo) => { const el = form.querySelector(`[name="${campo}"]`); return (el && el.files && el.files[0]) || null; };

/** Valor mudou e nenhum arquivo novo foi escolhido: o comprovante antigo não vale mais (volta o alerta para anexar). */
function conferirComprovantes(lista, dados, r, form) {
  for (const k of lista) {
    if (r && r[k.campo] && r[k.valor] !== dados[k.valor] && !arquivoEscolhido(form, k.campo)) dados[k.campo] = null;
  }
}

/** Nome do arquivo do comprovante (ex.: comprovante-caucao-2026-10-05.pdf). */
export const nomeComprovante = (tipo, data, arq) => `comprovante-${tipo}-${data || C.hojeIso()}${extensao(arq.name)}`;

/** Grava na pasta os comprovantes escolhidos e guarda o nome do arquivo no registro. */
async function guardarComprovantes(lista, dados, form, pasta) {
  for (const k of lista) {
    const arq = arquivoEscolhido(form, k.campo);
    if (!arq || !k.vale(dados) || !(dados[k.valor] > 0)) continue;
    dados[k.campo] = await S.salvarArquivo(await pasta(), new File([arq], nomeComprovante(k.nome, dados[k.data], arq)));
  }
}

/** "×" ao lado de um anexo: apaga só o arquivo (o lançamento continua). */
export const xAnexo = (acao, dados, confirmar) => (opera() ? botao(acao, '×', dados, 'x-excluir', confirmar).replace('<button ', '<button title="Apagar só o arquivo" ') : '');

/** Campos de comprovante que o "×" apaga sozinho (caução e depósito pagos de uma vez têm o próprio: removerComprovanteGarantia). */
export const ANEXOS_COM_X = { contratos: ['comprovante_reserva', 'termo_chaves_saida', 'contra_vistoria'], correcoes_garantia: ['comprovante'], aplicacoes: ['comprovante'], depositos_garantia: ['comprovante'], devolucoes_garantia: ['comprovante'], encerramentos: ['comprovante', 'termo_assinado'], acordos: ['termo_assinado'], notificacoes: ['arquivo_assinado', 'comprovante_baixa'] };

/**
 * Link para abrir o comprovante guardado na pasta do inquilino, com o "×" que apaga só o arquivo. Sem comprovante:
 * etiqueta e, com ``anexo`` ({ tabela, id, campo, tipo, data }), o botão para anexar depois.
 */
// sem comprovante: um só botão pequeno "⚠ anexar" (antes: etiqueta "sem comprovante: buscar no banco" + botão grande)
export const linkComprovante = (contratoId, nome, anexo = null) => (nome && !(anexo && arquivoSumiu('contrato', contratoId, nome)) ? `<span class="nw"><a href="#" data-acao="abrirArquivo" data-escopo="contrato" data-id="${contratoId}" data-nome="${esc(nome)}" title="${esc(nome)}">📎 comprovante</a>${anexo && (ANEXOS_COM_X[anexo.tabela] || []).includes(anexo.campo)
  ? xAnexo('removerAnexo', { tabela: anexo.tabela, id: anexo.id, campo: anexo.campo }, `Apagar o comprovante "${nome}"? O lançamento continua e volta o aviso para anexar.`) : ''}</span>`
  : anexo && opera() ? `<label class="anexar-falta" title="${nome ? `O arquivo ${esc(nome)} sumiu da pasta: anexe de novo (PDF ou foto)` : 'Sem comprovante: buscar no banco e anexar (PDF ou foto)'}">⚠ ${nome ? 'arquivo sumiu: anexar de novo' : 'anexar comprovante'}<input type="file" accept="${ACEITA_DOCUMENTOS}"
    data-acao-arquivo="anexarComprovante" data-contrato="${contratoId}" data-tabela="${anexo.tabela}" data-id="${anexo.id}" data-campo="${anexo.campo}" data-tipo="${anexo.tipo}" data-data="${esc(anexo.data || '')}"></label>`
    : etiqueta('sem comprovante', 'aviso'));

export let fiadoresMudancas = { novos: [], alterados: [] };

/** Inquilinos da lista da solicitação (o da solicitação em edição entra mesmo inativo). */
const inquilinosDaSolicitacao = (r) => R.inquilinosParaSolicitacao(d(), C.hojeIso(), r ? r.contrato_id : null);

/** Inquilino e imóvel já marcados no formulário da solicitação para um contrato ({ inquilino, imovel_k }). */
function escolhaDoContrato(contratoId, r = null) {
  const pessoas = inquilinosDaSolicitacao(r);
  const k = pessoas.findIndex((p) => p.contratos.some((c) => c.id === contratoId));
  if (k < 0) return {};
  return { inquilino: pessoas[k].chave, ...(pessoas[k].contratos.length > 1 ? { [`imovel_${k}`]: String(contratoId) } : {}) };
}

/** Fiadores que entram, saem ou são corrigidos na troca de garantia (preenchido em ajustar, usado em salvar). */
let fiadoresDaTroca = { novos: [], saem: [], alterados: [] };

let avisoAditivo = '';

/** Pagamento com valor diferente do previsto, esperando o valor da NF na página do boleto (nada é salvo antes). */
let guardarModeloAirbnb = false;

/** Imóvel sem contrato ativo hoje nem contrato futuro. */
const imovelVago = (id, hoje = C.hojeIso()) => !d().contratos.some((c) => c.imovel_id === Number(id) && R.contratoAtivo(c, hoje));

/** Imóveis que aparecem na ficha: os vagos e os que ela já tem. */
const imoveisDaFicha = (r) => ordenar(d().imoveis, 'nome').filter((i) => imovelVago(i.id) || (r && (r.imoveis_ids || []).includes(i.id)));

/**
 * O aluguel com bonificação digitado é o do aluguel inicial (histórico): o % sai sobre ele (sem arredondar, para o
 * desconto bater no centavo) e vale também para o aluguel corrigido. Ex.: aluguel R$ 2.000,00 e bonificado R$ 1.800,00 → 10%.
 */
function percentualDoBonificado(dados, erros, form) {
  const base = dados.aluguel_inicial;
  const bonificadoTexto = String(new FormData(form).get('aluguel_bonificado') || '').trim();
  if (!dados.bonificacao || !bonificadoTexto) return;
  let bonificado = NaN;
  try { bonificado = C.centavos(bonificadoTexto); } catch { /* inválido */ }
  if (!(base > 0)) erros.aluguel_inicial = erros.aluguel_inicial || 'Informe o aluguel cheio (ou apague o aluguel bonificado)';
  else if (!Number.isFinite(bonificado) || bonificado < 0 || bonificado > base) erros.aluguel_bonificado = `Informe um valor entre R$ 0,00 e ${reais(base)} (aluguel cheio)`;
  else dados.desconto_pontualidade_percentual = C.percentualPorBonificado(base, bonificado);
}

/**
 * Ficha usada pelo Novo contrato: a do botão "Fazer o contrato" (q.ficha) ou, aberto pela página do imóvel, a ficha
 * aprovada que espera o contrato dele (antes, por ali a reserva e o comprovante da ficha não vinham).
 */
function fichaDoNovoContrato(q = {}) {
  if (q.ficha) return buscar('fichas', q.ficha) || null;
  return q.imovel && !q.pessoa ? R.fichaAprovadaDoImovel(d(), q.imovel) : null;
}

/** Fim do formulário da ficha: documentos e proposta, os fiadores (com fiador na garantia), a reserva e as observações. */
/** Contato do interessado: o que se sabe dele ao abrir a ficha (o resto ele preenche pelo link). */
const CONTATO_FICHA = ['inquilino_nome', 'inquilino_telefone', 'inquilino_whatsapp', 'inquilino_email'];
/**
 * Ordem da ficha (pedido do dono, 2026-11-16): situação, imóvel, contato do interessado, proposta, incluso e reserva
 * (o que a equipe preenche ao abrir); depois os dados da pessoa, renda e fiadores (o interessado manda pelo link),
 * documentos recebidos, devolução da reserva e observações.
 */
function partesDaFicha(pessoa) {
  const fim = F.FICHA_FIM;
  const em = (titulo) => fim.findIndex((c) => c.secao && c.secao.startsWith(titulo));
  const [docs, proposta, devolucao] = [em('Documentos recebidos'), em('Proposta'), em('Devolução da reserva')];
  const contato = CONTATO_FICHA.map((nome) => pessoa.find((c) => c.nome === nome)).filter(Boolean);
  return {
    contato: [{ secao: 'Interessado (contato)' }, ...contato],
    proposta: fim.slice(proposta, devolucao),
    pessoa: pessoa.filter((c) => !CONTATO_FICHA.includes(c.nome))
      .map((c) => (c.secao && c.secao.startsWith('Interessado') ? { ...c, secao: 'Dados do interessado (ele preenche pelo link; o sistema traz para cá)' } : c)),
    fim: [...fim.slice(docs, proposta), ...fim.slice(devolucao)],
  };
}

/**
 * O que não vale mais na ficha sai em branco: renda de pessoa física na empresa, cônjuge de quem não é casado nem vive em
 * união estável e fiadores sem nome ou sem fiador na garantia.
 */
function limparFicha(dados) {
  const pj = dados.inquilino_tipo === 'Pessoa jurídica (empresa)';
  if (pj) for (const k of ['renda_tipo', 'renda_fonte', 'renda_fonte_telefone', 'renda_desde']) dados[k] = null;
  if (!R.fichaComConjuge(dados)) for (const k of Object.keys(dados)) if (k.startsWith('conjuge_')) dados[k] = null;
  for (let n = 1; n <= R.VAGAS_FIADOR_FICHA; n += 1) {
    if (R.temFiador(dados) && dados[`fiador${n}_nome`]) continue;
    for (const k of Object.keys(dados)) if (k.startsWith(`fiador${n}_`)) dados[k] = null;
  }
}

/** Aviso do Novo contrato feito da ficha: o que já veio preenchido e o que falta. */
function avisoDaFicha(f) {
  const dados = R.dadosDaFicha(d(), f);
  const veio = ['os dados da pessoa', dados.aluguel_inicial || dados.dia_vencimento || dados.garantia_tipo ? 'a proposta (aluguel, vencimento, bonificação e garantia)' : '', dados.fiador1_nome || dados.fiador2_nome ? 'os fiadores' : '', dados.reserva_valor ? 'a reserva' : ''].filter(Boolean);
  return `Contrato a partir da ficha aprovada de ${f.inquilino_nome}: ${veio.join(', ').replace(/, ([^,]*)$/, ' e $1')} já vieram preenchidos. Confira e complete o que falta (${dados.fiador1_nome || dados.fiador2_nome ? '' : 'fiador, '}o que está incluso, datas).${f.documentos_no_contrato ? '' : ' Ao salvar, os documentos da ficha vão para a pasta do inquilino.'}`;
}

/**
 * Contrato novo aberto pelo imóvel: imóvel sem relógio de gás ou sem administradora de condomínio no cadastro começa com
 * Gás / Condomínio em "Não tem" (antes vinha "Por conta do inquilino" e nasciam a etapa de transferência e o alerta do
 * boleto do condomínio para imóvel sem condomínio). O operador pode trocar no formulário.
 */
export function contasDoImovel(i) {
  if (!i) return {};
  const nao = F.SITUACOES_CONTA[2];
  return { ...(String(i.gas_relogio || '').trim() ? {} : { conta_gas: nao }), ...(String(i.administradora_nome || '').trim() ? {} : { conta_condominio: nao }) };
}

export const CADASTROS = {
  imoveis: {
    titulo: (r) => (r ? 'Editar imóvel' : 'Novo imóvel'),
    campos: () => F.IMOVEL,
    fixos: (r) => (r ? {} : { tipo: 'normal' }),
    voltar: (r) => (r ? `#/imovel/${r.id}` : '#/imoveis'),
    descricao: (dados) => dados.nome,
    ajustar(dados, erros, r) {
      dados.pasta = S.limparNome(dados.nome);
      // o Estado vem do CEP (ex.: 82210-050 → PR); sem CEP, fica o que foi digitado
      dados.uf = C.ufDoCep(dados.cep) || (dados.uf ? dados.uf.toUpperCase() : null);
      if (d().imoveis.some((x) => x.id !== (r && r.id) && S.limparNome(x.nome) === dados.pasta)) erros.nome = 'Já existe um imóvel com este nome';
    },
    async depois(salvo, antigo) {
      if (antigo && antigo.pasta && antigo.pasta !== salvo.pasta) await renomearNoDisco([], antigo.pasta, salvo.pasta);
    },
  },
  ressarcimentos: {
    titulo: (r, q) => `Ressarcimento de condomínio - ${buscar('contratos', r ? r.contrato_id : q.contrato).inquilino_nome}`,
    campos: () => F.RESSARCIMENTO.map((c) => (c.nome === 'descricao' ? { ...c, sugestoes: R.taxasCondominioUsadas(d()) } : c)),
    conferir: conferirRessarcimento,
    padrao: () => ({ competencia_condominio: C.competenciaDe(C.hojeIso()) }),
    fixos: (r, q) => (r ? {} : { contrato_id: Number(q.contrato) }),
    aviso: () => 'Taxas extraordinárias do condomínio são do proprietário (Lei 8.245/91, art. 22, X): fundo de obras, constituição do fundo de reserva, obras na estrutura, pintura de fachada, equipamentos de segurança, paisagismo das áreas comuns, indenizações trabalhistas de antes da locação. Se o inquilino pagou no boleto do condomínio, o valor volta para ele no boleto do aluguel.',
    ajustar(dados, erros, r, form, q) {
      const c = buscar('contratos', r ? r.contrato_id : q.contrato);
      if (dados.valor !== null && dados.valor <= 0) erros.valor = 'Informe o valor';
      if (!dados.competencia_abatimento && dados.data_pagamento) dados.competencia_abatimento = R.competenciaDoAbatimento(c, dados.data_pagamento);
      const cb = R.boletoDoMes(d(), c.id, dados.competencia_abatimento);
      if (cb && cb.data_pagamento && (!r || r.competencia_abatimento !== dados.competencia_abatimento)) {
        erros.competencia_abatimento = `O boleto de ${compBr(dados.competencia_abatimento)} já foi pago. Escolha o próximo boleto em aberto`;
      }
      // boleto em acordo fica como estava no dia do acordo (aplicarRessarcimentos não mexe nele): o ressarcimento novo, de mês
      // trocado ou de valor mudado não seria abatido. Ex.: boleto de 10/2026 em acordo → escolha 11/2026
      if (cb && !cb.data_pagamento && R.emAcordo(cb) && (!r || r.competencia_abatimento !== dados.competencia_abatimento || dados.valor !== r.valor)) {
        erros.competencia_abatimento = `O boleto de ${compBr(dados.competencia_abatimento)} está em acordo (fica como estava no dia do acordo) e não recebe o ressarcimento. Escolha o próximo boleto em aberto`;
      }
      // boleto do abatimento já pago com este ressarcimento: mudar o valor não muda o boleto pago. Lance a diferença como
      // outro ressarcimento, no próximo boleto em aberto
      if (cb && cb.data_pagamento && r && r.competencia_abatimento === dados.competencia_abatimento && dados.valor !== r.valor) {
        erros.valor = `O boleto de ${compBr(dados.competencia_abatimento)} já foi pago com ${reais(r.valor)}: não dá para mudar o valor. Lance a diferença como um novo ressarcimento, no próximo boleto em aberto`;
      }
    },
    salvar(db, dados, q, r) {
      const anterior = r ? r.competencia_abatimento : null;
      let salvo;
      if (r) { R.atualizar(db, 'ressarcimentos', r.id, dados, login(), `Ressarcimento de condomínio ${dados.descricao}`); salvo = R.buscar(db, 'ressarcimentos', r.id); }
      else salvo = R.inserir(db, 'ressarcimentos', dados, login(), `Ressarcimento de condomínio ${dados.descricao}`);
      const c = R.buscar(db, 'contratos', salvo.contrato_id);
      for (const comp of new Set([anterior, salvo.competencia_abatimento].filter(Boolean))) R.aplicarRessarcimentos(db, c, comp, login());
      R.marcarCondominioConferido(db, c.id, salvo.competencia_condominio, login());
      return salvo;
    },
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}?ir=ressarcimentos`,
  },
  solicitacoes: {
    titulo: (r) => (r ? 'Solicitação do inquilino' : 'Nova solicitação do inquilino'),
    // escolhe o inquilino (ativos, em ordem de nome); quem aluga mais de um imóvel escolhe também o imóvel do pedido
    // (um campo de imóvel por inquilino, que aparece só quando ele é escolhido); com um imóvel só, já vai o dele
    // vindo da página do inquilino (?contrato=), já vem marcado
    campos: (r) => {
      const pessoas = inquilinosDaSolicitacao(r);
      const inquilino = { nome: 'inquilino', rotulo: 'Inquilino', tipo: 'opcao', obrig: true, virtual: true,
        opcoes: pessoas.map((p) => [p.chave, `${p.nome} · ${p.contratos.length > 1 ? `${p.contratos.length} imóveis` : p.contratos[0].imovel || 'sem imóvel'}`]) };
      const imoveis = pessoas.flatMap((p, k) => (p.contratos.length > 1 ? [{ nome: `imovel_${k}`, rotulo: 'Imóvel do pedido', tipo: 'opcao', obrig: true, virtual: true,
        opcoes: p.contratos.map((c) => [String(c.id), c.imovel || 'sem imóvel']), mostrarSe: { campo: 'inquilino', valores: [p.chave] },
        ajuda: `${p.nome} aluga mais de um imóvel: escolha de qual é o pedido` }] : []));
      return [inquilino, ...imoveis, ...F.SOLICITACAO];
    },
    valores: (r) => ({ ...r, ...escolhaDoContrato(r.contrato_id, r) }),
    padrao: (q) => ({ data: C.hojeIso(), ...(q.contrato ? escolhaDoContrato(Number(q.contrato)) : {}) }),
    voltar: (r, q) => ({ inquilinos: '#/inquilinos', solicitacoes: `#/solicitacoes${q && q.filtro ? `?filtro=${q.filtro}` : ''}` }[q && q.de]
      || (r || (q && q.contrato) ? `#/contrato/${r ? r.contrato_id : q.contrato}?ir=solicitacoes` : '#/solicitacoes')),
    descricao: (dados) => `Solicitação: ${String(dados.descricao || '').slice(0, 80)}`,
    ajustar(dados, erros, r, form) {
      const fd = new FormData(form);
      const pessoas = inquilinosDaSolicitacao(r);
      const k = pessoas.findIndex((p) => p.chave === fd.get('inquilino'));
      if (k < 0) { erros.inquilino = 'Escolha o inquilino'; return; }
      const p = pessoas[k];
      const contrato = p.contratos.length > 1 ? p.contratos.find((c) => String(c.id) === fd.get(`imovel_${k}`)) : p.contratos[0];
      if (!contrato) { erros[`imovel_${k}`] = 'Escolha o imóvel do pedido'; return; }
      dados.contrato_id = contrato.id;
      // reaberta (era "Concluída" e voltou para "Aberta"/"Em andamento"): a data de conclusão sai (antes a data que ficou
      // preenchida a fazia voltar sozinha para "Concluída")
      if (r && r.situacao === 'Concluída' && ['Aberta', 'Em andamento'].includes(dados.situacao)) dados.data_conclusao = null;
      // data de conclusão preenchida em pedido aberto ou em andamento: fica "Concluída" (pedido do dono, 2026-11-19)
      if (dados.data_conclusao && ['Aberta', 'Em andamento'].includes(dados.situacao)) dados.situacao = 'Concluída';
      if (dados.situacao === 'Concluída' && !dados.data_conclusao) dados.data_conclusao = C.hojeIso();
      if (dados.data_conclusao && dados.data && dados.data_conclusao < dados.data) erros.data_conclusao = `A conclusão não pode ser antes do pedido (${dataBr(dados.data)})`;
    },
    conferir: (dados, r) => [dataNoFuturo(dados.data_conclusao, 'A data de conclusão'),
      dados.valor > 0 && dados.pago_por === 'Sem custo' && (!r || r.valor !== dados.valor || r.pago_por !== dados.pago_por) ? `Custo de ${reais(dados.valor)} com "Custo por conta de: Sem custo". Confira quem paga.` : ''].filter(Boolean),
  },
  reformas: {
    titulo: (r, q) => `Reforma / investimento - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: () => F.REFORMA,
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    padrao: () => ({ data: C.hojeIso() }),
    // o valor investido entra no retorno do imóvel (Gestão): data no futuro costuma ser ano digitado errado
    conferir: (dados) => [dataNoFuturo(dados.data, 'A data da reforma')].filter(Boolean),
    voltar: (r, q) => `#/imovel/${r ? r.imovel_id : q.imovel}?ir=reformas`,
    descricao: (dados) => `Reforma: ${dados.descricao} ${reais(dados.valor)}`,
  },
  contratos: {
    titulo: (r, q) => {
      const i = buscar('imoveis', r ? r.imovel_id : Number(q.imovel));
      return `${r ? 'Editar' : 'Novo'} contrato${i ? ` - ${i.nome}` : ''}`;
    },
    campos: (r, q = {}) => {
      const ops = d().contratos.filter((c) => !r || c.id !== r.id)
        .sort((a, b) => a.inquilino_nome.localeCompare(b.inquilino_nome, 'pt-BR'))
        .map((c) => [String(c.id), `${c.inquilino_nome} (${dataBr(c.data_entrada)} a ${dataBr(c.data_saida)})`]);
      const hoje = C.hojeIso();
      const vago = (i) => !d().contratos.some((c) => c.imovel_id === i.id && R.contratoAtivo(c, hoje) && (!r || c.id !== r.id));
      const imoveis = ordenar(d().imoveis, 'nome').map((i) => [String(i.id), `${i.nome}${!r && vago(i) ? ' · vago' : ''}`]);
      // fiadores do contrato (não os da troca de garantia) vêm preenchidos para alterar, e mais um bloco em branco (incluir)
      const fiadores = r ? R.fiadoresDoContrato(d(), r.id) : [];
      // o vínculo com o imóvel acontece só aqui, no contrato novo (imóvel obrigatório); na edição o imóvel não muda
      // contrato a partir da ficha: o comprovante da reserva ainda está na pasta da ficha (abre e apaga de lá)
      const ficha = r ? null : fichaDoNovoContrato(q);
      const guardado = ficha && { acao: 'apagarArquivoDaFicha', dados: { ficha: ficha.id }, abrir: { escopo: 'ficha', id: ficha.id } };
      const perfis = ordenar(d().perfis_regras || [], 'nome');
      return comListas(F.CONTRATO.flatMap((c) => (c.fiador ? (c.fiador === 1 && c.secao ? F.fiadoresNoCadastro(fiadores) : []) : [c]))
        .filter((c) => (r ? !c.soNovo : !c.soEditar))
        .filter((c) => c.nome !== 'perfil_regras_id' || perfis.length || (r && r.perfil_regras_id))
        .map((c) => (c.nome === 'perfil_regras_id' ? { ...c, opcoes: perfis.map((p) => [String(p.id), p.nome]) } : c.nome === 'contrato_anterior_id' ? { ...c, opcoes: ops } : c.nome === 'imovel_id' ? { ...c, opcoes: imoveis }
          : c.nome === 'comprovante_reserva' && guardado ? { ...c, guardado } : c)));
    },
    // cada contrato é único: nada vem do inquilino anterior do imóvel, todas as condições são escolhidas de novo
    // a mesma pessoa em outro imóvel (q.pessoa): só os dados da pessoa vêm preenchidos
    // contrato a partir da ficha aprovada (q.ficha): os dados da pessoa e, no primeiro contrato dela, a reserva
    // (aberto pelo imóvel, sem q.ficha: vale a ficha aprovada que espera o contrato dele)
    padrao: (q) => ({ ...R.padroesNovoContrato(q.regras), ...(q.imovel ? contasDoImovel(buscar('imoveis', q.imovel)) : {}), ...(q.pessoa ? R.dadosDaPessoa(buscar('contratos', q.pessoa)) : {}), ...(fichaDoNovoContrato(q) ? R.dadosDaFicha(d(), fichaDoNovoContrato(q)) : {}), ...(q.imovel ? { imovel_id: Number(q.imovel) } : {}) }),
    // Novo contrato com regras especiais: escolher antes de digitar qual regra preenche os valores (multa, juros, bonificação...)
    topo: (r, q) => {
      const perfis = ordenar(d().perfis_regras || [], 'nome');
      if (r || !perfis.length) return '';
      const base = location.hash.replace(/([?&])regras=\d+(&|$)/, '$1').replace(/[?&]$/, '');
      const url = (id) => `${base}${id ? `${base.includes('?') ? '&' : '?'}regras=${id}` : ''}`;
      const atual = Number(q.regras) || null;
      const op = (id, nome) => (id === atual ? `<b>${esc(nome)}</b>` : `<a href="${esc(url(id))}">${esc(nome)}</a>`);
      return `<div class="alerta info">Este contrato segue as regras do sistema ou uma regra especial (campo "Regras deste contrato"). Para os valores virem preenchidos com os de uma regra, escolha antes de digitar: ${[op(null, 'Regras do sistema'), ...perfis.map((p) => op(p.id, p.nome))].join(' · ')}.</div>`;
    },
    compacto: true,
    valores: (r) => ({ ...r, ativo: r.ativo !== false, gerar_nf: r.gerar_nf !== false, bonificacao: r.bonificacao !== false,
      conta_iptu: r.conta_iptu || (r.cobrar_iptu ? R.SITUACOES[0] : R.SITUACOES[1]), conta_seguro: r.conta_seguro || (r.cobrar_seguro === false ? R.SITUACOES[1] : R.SITUACOES[0]),
      inquilino_tipo: r.inquilino_tipo || 'Pessoa física', prazo_meses: R.prazoDoContrato(d(), r),
      aluguel_bonificado: r.bonificacao === false ? null : inicialBonificado(r),
      ...Object.fromEntries(R.fiadoresDoContrato(d(), r.id).flatMap((f, k) => F.CAMPOS_FIADOR.map((x) => [`fiador${k + 1}_${x.nome}`, f[x.nome] ?? null]))) }),
    conferir: conferirContrato,
    aviso: (r, q) => (!r && q && fichaDoNovoContrato(q) ? avisoDaFicha(fichaDoNovoContrato(q))
      : !r && q && q.pessoa ? `Contrato novo de ${buscar('contratos', q.pessoa).inquilino_nome} para este imóvel: os dados da pessoa já vieram preenchidos. Escolha as condições deste contrato (cada contrato é único).`
      : r ? `Imóvel: ${(buscar('imoveis', r.imovel_id) || {}).nome || 'sem imóvel'} (não muda aqui; lançado errado: "Corrigir imóvel" na página do inquilino). Mudou o dia do vencimento ou a garantia? Isso exige termo aditivo: depois de salvar, registre o termo assinado em "Termos aditivos" (botão "Contrato, Vistoria, Termos e Aditivos" na página do inquilino).` : ''),
    voltar: (r, q) => (r ? `#/contrato/${r.id}` : q.imovel ? `#/imovel/${q.imovel}` : '#/inquilinos'),
    descricao: (dados, r) => dados.inquilino_nome || (r && r.inquilino_nome),
    ajustar(dados, erros, r, form, q = {}) {
      // troca de titular: garantia, aluguel, bonificação, boleto e reserva são os do contrato (travados no formulário)
      const anteriorHerdado = r ? R.contratoHerdado(d(), r) : dados.contrato_anterior_id && buscar('contratos', dados.contrato_anterior_id);
      const herdado = !!anteriorHerdado;
      // garantia nova na troca (escolha na janela "Continuar o contrato"): o novo titular presta a sua, livre
      // (decisão da direção, 2026-11-13: caução ou depósito do anterior é sempre devolvido a ele; o novo deposita a sua)
      if (!r && herdado) dados.garantia_na_troca = R.garantiaDevolvidaNaTroca(anteriorHerdado) ? 'nova' : (memoria.continuacao && memoria.continuacao.garantia) || 'continua';
      if (r && herdado && !R.garantiaNova(r)) for (const k of CAMPOS_GARANTIA_HERDADA) dados[k] = r[k] ?? null;
      if (herdado) {
        const fonte = r || { ...anteriorHerdado, ...R.condicoesDoContrato(d(), anteriorHerdado, dados.data_entrada) };
        for (const k of CAMPOS_VALORES_HERDADOS) {
          if (['aluguel_bonificado', 'comprovante_reserva'].includes(k)) continue;
          dados[k] = ['bonificacao', 'cobranca_mes_seguinte'].includes(k) ? fonte[k] !== false : fonte[k] ?? null;
        }
      }
      if (!herdado) percentualDoBonificado(dados, erros, form);
      if (r && R.trocaAguardaAditivo(d(), r) && dados.aluguel_inicial !== r.aluguel_inicial) erros.aluguel_inicial = `O contrato ainda é de ${R.contratoHerdado(d(), r).inquilino_nome}: o aluguel só muda depois do termo aditivo assinado`;
      for (const k of ['desconto_pontualidade_percentual', 'taxa_boleto', 'multa_percentual', 'juros_mensal_percentual', 'reserva_valor', 'carencia_meses']) if (dados[k] === null) dados[k] = 0;
      if (dados.desconto_pontualidade_percentual < 0 || dados.desconto_pontualidade_percentual > 100) erros.desconto_pontualidade_percentual = 'Informe um percentual entre 0 e 100';
      // FCI: em branco (ou zero) não cobra; com o %, precisa do índice de correção
      if (dados.fci_percentual !== null && (dados.fci_percentual < 0 || dados.fci_percentual > 100)) erros.fci_percentual = 'Informe um percentual entre 0 e 100, ou deixe em branco';
      if (!(dados.fci_percentual > 0)) { dados.fci_percentual = null; dados.fci_indice = null; } else if (!dados.fci_indice) erros.fci_indice = 'Escolha o índice de correção do FCI';
      if (dados.dia_vencimento !== null && (dados.dia_vencimento < 1 || dados.dia_vencimento > 31)) erros.dia_vencimento = 'Informe um dia entre 1 e 31';
      if (dados.data_saida && dados.data_entrada && dados.data_saida < dados.data_entrada) erros.data_saida = 'A saída não pode ser antes da entrada';
      if (dados.prazo_tipo === 'Determinado') {
        // o fim sai de um lugar só (R.fimDoContrato): o da renovação; na troca de titular, o do contrato assumido (o prazo não
        // recomeça); senão, a data de vigência inicial (sem ela, a do contrato) + o prazo
        const renovado = r ? R.fimRenovado(d(), r) : null;
        if (!(dados.prazo_meses > 0)) erros.prazo_meses = 'Informe o prazo em meses, ou marque prazo indeterminado';
        else if (renovado && dados.prazo_meses !== R.prazoDoContrato(d(), r)) {
          erros.prazo_meses = `Contrato renovado até ${dataBr(renovado)}: o prazo e o fim mudam pela renovação ("Renovação / novo valor", na página do inquilino)`;
        } else {
          const fim = R.fimDoContrato(d(), { ...r, ...dados, id: r ? r.id : null, contrato_anterior_id: herdado ? anteriorHerdado.id : null });
          if (fim) dados.vigencia_fim = fim;
          // renovado: o prazo acompanha o fim da renovação (também se a data de vigência inicial foi corrigida)
          if (renovado) dados.prazo_meses = R.prazoDoContrato(d(), { ...r, ...dados, id: r.id });
        }
      }
      if (dados.carencia_meses < 0) erros.carencia_meses = 'Valor inválido';
      if (dados.inquilino_tipo === 'Pessoa jurídica (empresa)' && !dados.representante_nome) erros.representante_nome = 'Empresa precisa do representante (pessoa física)';
      // sem o nome, não há solidário: o resto da parte dele fica em branco
      if (!dados.solidario_nome) for (const k of Object.keys(dados)) if (k.startsWith('solidario_')) dados[k] = null;
      // só "por conta do inquilino" entra no boleto
      dados.cobrar_iptu = dados.conta_iptu === R.SITUACOES[0];
      dados.cobrar_seguro = dados.conta_seguro === R.SITUACOES[0];
      // fiadores do contrato no próprio cadastro: os já cadastrados podem ser alterados; os blocos em branco incluem novos
      // (excluir é na página do inquilino; quem entra depois é pela troca de garantia)
      const existentes = r ? R.fiadoresDoContrato(d(), r.id) : [];
      fiadoresMudancas = { novos: [], alterados: [] };
      for (let n = 1; n <= F.vagasFiador(existentes); n += 1) {
        const f = Object.fromEntries(F.CAMPOS_FIADOR.map((c) => [c.nome, dados[`fiador${n}_${c.nome}`] ?? null]));
        F.CAMPOS_FIADOR.forEach((c) => delete dados[`fiador${n}_${c.nome}`]);
        const atual = existentes[n - 1];
        if (atual) {
          if (!R.temFiador(dados)) continue; // a garantia deixou de ter fiador: o cadastro dele fica como está
          if (!f.nome) erros[`fiador${n}_nome`] = 'Informe o nome do fiador (para excluir, use "Excluir" no fiador, na página do inquilino)';
          else if (f.data_entrada && f.data_saida && f.data_saida < f.data_entrada) erros[`fiador${n}_data_saida`] = 'O fim do vínculo não pode ser antes do início';
          else if (F.CAMPOS_FIADOR.some((c) => String(atual[c.nome] ?? '') !== String(f[c.nome] ?? ''))) fiadoresMudancas.alterados.push({ id: atual.id, ...f });
          continue;
        }
        // a nacionalidade já vem preenchida ("brasileira"): sozinha não conta como fiador digitado
        const algum = Object.entries(f).some(([k, v]) => v && k !== 'nacionalidade');
        if (!algum || !R.temFiador(dados)) continue;
        if (!f.nome) erros[`fiador${n}_nome`] = 'Informe o nome do fiador';
        else fiadoresMudancas.novos.push(f);
      }
      conferirComprovantes(COMPROVANTES_CONTRATO, dados, r, form);
      // contrato a partir da ficha: fica ligado a ela; o comprovante da reserva da ficha vale (vai para a pasta do inquilino em "depois")
      const ficha = r ? null : fichaDoNovoContrato(q);
      if (ficha) {
        // o endereço do botão "Fazer o contrato" continua valendo (seta "voltar" do navegador): ficha não aprovada ou imóvel
        // que já virou contrato dela não fazem um segundo contrato
        const imovelDaFicha = dados.imovel_id || Number(q.imovel) || null;
        if (!R.imoveisParaContrato(d(), ficha).includes(Number(imovelDaFicha))) {
          throw new C.ErroUsuario(ficha.situacao !== 'Aprovada' ? `A ficha de ${ficha.inquilino_nome} não está aprovada (${ficha.situacao}): aprove a ficha antes de fazer o contrato.`
            : `O contrato desta ficha${imovelDaFicha && buscar('imoveis', imovelDaFicha) ? ` para ${buscar('imoveis', imovelDaFicha).nome}` : ''} já foi feito (ou o imóvel não está na ficha). Abra o contrato pela página da ficha.`);
        }
        dados.ficha_id = ficha.id;
        if (!dados.comprovante_reserva && ficha.comprovante_reserva && !ficha.documentos_no_contrato && dados.reserva_valor === ficha.reserva_valor) dados.comprovante_reserva = ficha.comprovante_reserva;
      }
      avisoAditivo = '';
      // "Possui termo aditivo" só aparece quando um termo assinado é anexado
      if (r && (dados.dia_vencimento !== r.dia_vencimento || (r.garantia_tipo && dados.garantia_tipo !== r.garantia_tipo))) {
        avisoAditivo = `Você mudou ${dados.dia_vencimento !== r.dia_vencimento ? 'o dia do vencimento' : 'a garantia'}: registre o termo aditivo assinado em "Termos aditivos" (botão "Contrato, Vistoria, Termos e Aditivos" na página do inquilino), anexando o arquivo.`;
      }
      dados.pasta = nomePastaContrato({ ...r, ...dados });
      // imóvel obrigatório no contrato novo; na edição fica o que já está (contrato antigo sem imóvel: continua contando os 7 dias)
      const imovelFinal = r ? r.imovel_id : dados.imovel_id || Number(q.imovel) || null;
      if (!r && !imovelFinal) erros.imovel_id = 'Escolha o imóvel deste inquilino';
      dados.sem_imovel_desde = imovelFinal ? null : (r && r.sem_imovel_desde) || C.hojeIso();
      // "Usar o endereço do imóvel": o endereço do inquilino fica igual ao do imóvel
      const imovelEndereco = buscar('imoveis', imovelFinal);
      // caução: data prevista = data do contrato; valor = aluguéis × aluguel com bonificação (se não foi digitado)
      if (dados.garantia_tipo === 'Caução') R.completarCaucao(dados);
      if (R.temDeposito(dados) && !dados.deposito_data) dados.deposito_data = dados.vigencia_inicio || null;
      for (const [caixa, campoEnd] of ENDERECO_DO_IMOVEL) {
        if (new FormData(form).get(caixa) !== '1' || (caixa.startsWith('solidario') && !dados.solidario_nome) || (caixa.startsWith('representante') && dados.inquilino_tipo !== 'Pessoa jurídica (empresa)')) continue;
        if (imovelEndereco) dados[campoEnd] = enderecoInquilino(imovelEndereco);
        else erros[campoEnd] = 'Escolha o imóvel para usar o endereço dele';
      }
    },
    confirmar: confirmarValoresIniciais,
    // contrato já salvo: grava na pasta atual (se o nome mudar, a pasta inteira é renomeada depois); contrato novo: na pasta que ele vai ter
    async ajustarAsync(dados, erros, r, form) {
      const pasta = r ? () => pastaDoEscopo('contrato', r.id)
        : async () => S.subpasta(await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true }), [...pastaPaiContrato(dados), dados.pasta]);
      await guardarComprovantes(COMPROVANTES_CONTRATO, dados, form, pasta);
    },
    salvar(db, dados, q, r) {
      let c;
      if (r) {
        const inicialMudou = dados.aluguel_inicial !== r.aluguel_inicial;
        R.atualizar(db, 'contratos', r.id, dados, login(), dados.inquilino_nome);
        c = R.buscar(db, 'contratos', r.id);
        // aluguel inicial corrigido: os reajustes já lançados são refeitos a partir dele (o aluguel atual e a caução sugerida acompanham)
        if (inicialMudou) R.recalcularCorrecoes(db, c.id, login());
      } else c = R.inserir(db, 'contratos', { ...dados, docs_entrada: true }, login(), dados.inquilino_nome);
      const { novos, alterados } = fiadoresMudancas;
      for (const { id, ...f } of alterados) R.atualizar(db, 'fiadores', id, f, login(), `Fiador ${f.nome}`);
      for (const f of novos) R.inserir(db, 'fiadores', { ...f, contrato_id: c.id }, login(), `Fiador ${f.nome}`);
      fiadoresMudancas = { novos: [], alterados: [] };
      return c;
    },
    recalcular: (salvo) => (cb) => cb.contrato_id === salvo.id,
    async depois(salvo, antigo) {
      if (!antigo && salvo.ficha_id) {
        const n = await levarDocumentosDaFicha(salvo.ficha_id, salvo.id);
        if (n) aviso(`${n} documento(s) da ficha foram para a pasta do inquilino.`);
        // os documentos já estão no contrato: o link da ficha não manda mais nada para a pasta antiga
        try { await encerrarLinksDaFicha(salvo.ficha_id); } catch (e) { console.warn('encerrar os links da ficha', e); }
      }
      if (avisoAditivo) aviso(avisoAditivo, 'aviso');
      avisoAditivo = '';
      // troca de titular com o termo aditivo já assinado: vai para "Termos aditivos" do novo contrato
      const cont = memoria.continuacao;
      memoria.continuacao = null;
      // troca agendada (data futura) com a data mudada: o fim do vínculo do anterior acompanha (ou a troca já é feita)
      if (salvo.contrato_anterior_id && (!antigo || (!salvo.heranca_transferida && antigo.data_entrada !== salvo.data_entrada))) await trazerHeranca(salvo.id);
      if (!antigo && cont && cont.arquivo && salvo.contrato_anterior_id === cont.anteriorId) {
        const anterior = buscar('contratos', cont.anteriorId);
        const assunto = `Troca de titular: ${anterior ? anterior.inquilino_nome : 'inquilino anterior'} → ${salvo.inquilino_nome}`;
        // ciência de quem anexa (todo o vínculo passa ao novo); cancelou: o contrato fica salvo e o termo, para anexar depois
        const ciencia = await cienciaDaTroca(salvo.id);
        if (!ciencia) aviso('Termo da troca não anexado: anexe em "Termos aditivos" na página do inquilino.', 'aviso');
        else {
          const nome = await salvarAssinado('aditivos', salvo.id, cont.arquivo, `termo aditivo ${cont.data} troca de titular`);
          await alterar((db) => { const a = R.registrarAditivo(db, salvo.id, { data: cont.data, assunto, arquivo: nome, tipo: TIPO_ADITIVO_TROCA }, login()); registrarCiencia(db, a, ciencia); });
          await trazerHerancaAssinada(salvo.id);
          aviso('Termo aditivo da troca de titular registrado.');
        }
      }
      if (!antigo || !antigo.pasta) return;
      const paiAntigo = pastaPaiContrato(antigo);
      const paiNovo = pastaPaiContrato(salvo);
      if (paiAntigo.join('/') === paiNovo.join('/')) {
        if (antigo.pasta !== salvo.pasta) await renomearNoDisco(paiNovo, antigo.pasta, salvo.pasta);
        return;
      }
      try {
        const raiz = await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true });
        await S.moverPasta(await S.subpasta(raiz, paiAntigo), antigo.pasta, await S.subpasta(raiz, paiNovo), salvo.pasta);
      } catch (e) {
        aviso(`Não consegui mover a pasta "${antigo.pasta}" para "${paiNovo.join('/')}": ${e.message}`, 'aviso');
      }
    },
    destino: (salvo) => `#/contrato/${salvo.id}`,
  },
  fichas: {
    // começa como solicitação de reserva (pedido do dono, 2026-11-19): a equipe preenche só o imóvel, o contato, a proposta,
    // o que está incluso e a reserva; o resto o interessado manda pelo link da ficha (a ficha completa aparece ao editar)
    titulo: (r) => (r ? `Ficha em análise - ${r.inquilino_nome}` : 'Nova solicitação de reserva'),
    // imóveis de interesse: uma caixa de marcar por imóvel VAGO (pedido do dono, 2026-11-10: escolher ocupado dava brecha
    // para erro); o que já está na ficha continua na lista. O que já tem outra ficha aberta aparece avisado
    campos: (r) => {
      const imoveis = imoveisDaFicha(r).map((i) => {
        const outra = R.fichaAbertaDoImovel(d(), i.id, r && r.id);
        return { nome: `imovel_${i.id}`, rotulo: `${i.nome}${imovelVago(i.id) ? '' : ' · ocupado'}${outra ? ` · já tem a ficha de ${outra.inquilino_nome}` : ''}`, tipo: 'simnao' };
      });
      // "Usar o endereço do imóvel": o de interesse (com um só marcado)
      const p = partesDaFicha(F.camposDaPessoa([...R.CAMPOS_PESSOA, ...ENDERECO_DO_IMOVEL.map(([caixa]) => caixa)])
        .map((c) => (ENDERECO_DO_IMOVEL.some(([caixa]) => caixa === c.nome) ? { ...c, rotulo: 'Usar o endereço do imóvel de interesse', ajuda: 'Marcado: o endereço fica igual ao do imóvel marcado acima (com um só imóvel marcado)' } : c)));
      const blocoImoveis = [{ secao: 'Imóveis de interesse' },
        { nome: 'modo_imoveis', rotulo: 'A ficha é para', tipo: 'opcao', obrig: true, padrao: R.MODOS_FICHA[0], opcoes: R.MODOS_FICHA, largo: true,
          ajuda: `Apenas um: o interessado vai alugar um dos imóveis marcados. Todos juntos: aluga todos os marcados (um contrato para cada). Só aparecem os imóveis vagos${imoveis.length ? '' : ' (nenhum vago no momento)'}` },
        { quebra: true }, ...imoveis];
      if (!r) {
        return [{ secao: 'Solicitação de reserva' },
          { ...F.FICHA_INICIO.find((c) => c.nome === 'data_recebida'), rotulo: 'Solicitação recebida em' },
          ...blocoImoveis, ...p.contato, ...p.proposta, { secao: 'Observações' }, F.FICHA_FIM.find((c) => c.nome === 'observacoes')];
      }
      return [...F.FICHA_INICIO, ...blocoImoveis,
        ...p.contato, ...p.proposta, ...p.pessoa, ...F.FICHA_RENDA, ...F.FICHA_FIADORES, ...p.fim];
    },
    padrao: (q) => ({ data_recebida: C.hojeIso(), ...(q.imovel ? { [`imovel_${q.imovel}`]: true } : {}) }),
    // "Reprovar (com o motivo)" abre já com a situação Reprovada (motivo e devolução da reserva à vista)
    valores: (r, q = {}) => ({ ...r, ...(q.situacao ? { situacao: q.situacao } : {}), inquilino_tipo: r.inquilino_tipo || 'Pessoa física', bonificacao: r.bonificacao !== false,
      aluguel_bonificado: r.bonificacao === false || !(r.aluguel_inicial > 0) ? null : inicialBonificado(r),
      ...Object.fromEntries((r.imoveis_ids || []).map((id) => [`imovel_${id}`, true])) }),
    compacto: true,
    voltar: (r) => (r ? `#/ficha/${r.id}` : '#/inquilinos'),
    destino: (salvo) => `#/ficha/${salvo.id}`,
    descricao: (dados) => `Ficha de ${dados.inquilino_nome}`,
    // o recibo da reserva promete devolução por inteiro: devolver só uma parte pede confirmação
    conferir: (dados, r) => (R.fichaSemContrato(dados) && dados.devolucao_valor > 0 && dados.devolucao_valor < dados.reserva_valor
      && (!r || r.devolucao_valor !== dados.devolucao_valor || r.reserva_valor !== dados.reserva_valor)
      ? [`Devolução de ${reais(dados.devolucao_valor)} de uma reserva de ${reais(dados.reserva_valor)}: ficam ${reais(dados.reserva_valor - dados.devolucao_valor)} sem devolver. O recibo da reserva promete a devolução por inteiro; o alerta "devolver a reserva" some e o termo sai como devolução de parte.`] : []),
    ajustar(dados, erros, r, form) {
      const hoje = C.hojeIso();
      // solicitação de reserva: começa em análise; o link da ficha vai pelo e-mail ou pelo WhatsApp
      if (!r) {
        dados.situacao = dados.situacao || 'Em análise';
        dados.inquilino_tipo = dados.inquilino_tipo || 'Pessoa física';
        if (!dados.inquilino_email && !dados.inquilino_telefone && !dados.inquilino_whatsapp) erros.inquilino_email = 'Informe o e-mail ou o telefone: é por eles que vai o link da ficha';
      }
      const ids = d().imoveis.filter((i) => dados[`imovel_${i.id}`]).map((i) => i.id);
      for (const k of Object.keys(dados)) if (/^imovel_\d+$/.test(k)) delete dados[k];
      dados.imoveis_ids = ids;
      if (!ids.length) erros.modo_imoveis = 'Marque pelo menos um imóvel de interesse';
      const comContrato = r ? Object.keys(R.contratosDaFicha(d(), r)).map(Number) : [];
      // só imóvel vago entra (o que já estava na ficha pode ficar)
      const ocupado = ids.find((id) => !imovelVago(id) && !(r && (r.imoveis_ids || []).includes(id)));
      if (ocupado) erros.modo_imoveis = `${buscar('imoveis', ocupado).nome} está ocupado: a ficha é só para imóvel vago`;
      if (comContrato.some((id) => !ids.includes(id))) erros.modo_imoveis = 'Um imóvel desmarcado já tem contrato feito a partir desta ficha';
      // cada imóvel tem no máximo uma ficha aberta (em análise ou aprovada sem contrato)
      if (!R.fichaSemContrato(dados)) {
        for (const id of ids.filter((x) => !comContrato.includes(x))) {
          const outra = R.fichaAbertaDoImovel(d(), id, r && r.id);
          if (outra) { erros.modo_imoveis = `${buscar('imoveis', id).nome} já tem a ficha de ${outra.inquilino_nome} em aberto. Cada imóvel fica com uma ficha por vez: decida aquela antes, ou desmarque o imóvel.`; break; }
        }
      }
      if (comContrato.length && dados.situacao !== 'Aprovada') erros.situacao = dados.situacao === 'Desistiu' ? 'Esta ficha já virou contrato: use o botão "Desistiu antes de assinar" na página da ficha (ele cancela o contrato não assinado)' : 'Esta ficha já virou contrato: a situação fica "Aprovada"';
      // decisão: data (em branco: hoje) e quem decidiu; voltou para "Em análise": sem decisão
      if (dados.situacao === 'Em análise') { dados.decisao_data = null; dados.decisao_por = null; } else {
        dados.decisao_data = dados.decisao_data || hoje;
        dados.decisao_por = r && r.situacao === dados.situacao && r.decisao_por ? r.decisao_por : login();
        if (dados.decisao_data > hoje) erros.decisao_data = 'A decisão não pode ser numa data futura';
        else if (dados.data_recebida && dados.decisao_data < dados.data_recebida) erros.decisao_data = `A decisão não pode ser antes de a ficha chegar (${dataBr(dados.data_recebida)})`;
        // "Reprovar (com o motivo)": sem o motivo a ficha ficava "Reprovada" sem explicação
        if (dados.situacao === 'Reprovada' && !String(dados.decisao_motivo || '').trim()) erros.decisao_motivo = 'Escreva o motivo da reprovação';
      }
      // datas da ficha: nada no futuro; a reserva com valor precisa da data (sem ela o recibo e o e-mail saem sem data)
      if (dados.data_recebida && dados.data_recebida > hoje) erros.data_recebida = 'A data em que a ficha chegou não pode ser no futuro';
      if (dados.reserva_valor > 0 && !dados.reserva_data) erros.reserva_data = 'Informe a data da reserva';
      else if (dados.reserva_data && dados.reserva_data > hoje) erros.reserva_data = 'A reserva não pode ser numa data futura';
      // reabrir ficha reprovada (ou desistência) com a devolução da reserva registrada: nunca apagar em silêncio um registro de
      // dinheiro nem levar ao contrato uma reserva já devolvida (o 1º aluguel abateria de novo). Ou zera a reserva (já devolvida;
      // a devolução fica no Histórico) ou a ficha fica como está
      if (!R.fichaSemContrato(dados) && r && (r.devolucao_data || r.devolucao_valor > 0) && dados.reserva_valor > 0) {
        erros.situacao = `A reserva de ${reais(r.reserva_valor || 0)} já foi devolvida${r.devolucao_data ? ` em ${dataBr(r.devolucao_data)}` : ''}${r.devolucao_valor ? ` (${reais(r.devolucao_valor)})` : ''}. Para reabrir a ficha, apague o valor da reserva (ela já foi devolvida; a devolução fica no Histórico). Se a pessoa fizer nova reserva, lance depois, com a data e o comprovante novos.`;
      }
      if (!R.fichaSemContrato(dados)) { dados.devolucao_data = null; dados.devolucao_valor = null; } else {
        if (dados.devolucao_data && !dados.devolucao_valor) dados.devolucao_valor = dados.reserva_valor || null;
        if (dados.devolucao_valor > 0 && !dados.devolucao_data) erros.devolucao_data = 'Informe a data da devolução';
        else if (dados.devolucao_data && dados.devolucao_data > hoje) erros.devolucao_data = 'A devolução não pode ser numa data futura (registre depois de devolver)';
        else if (dados.devolucao_data && dados.reserva_data && dados.devolucao_data < dados.reserva_data) erros.devolucao_data = `A devolução não pode ser antes da reserva (${dataBr(dados.reserva_data)})`;
        if (dados.devolucao_valor > (dados.reserva_valor || 0)) erros.devolucao_valor = `A devolução não pode passar da reserva (${reais(dados.reserva_valor || 0)})`;
        // devolução de só uma parte: o termo diz que a diferença "fica explicada nas observações da ficha"
        else if (dados.devolucao_valor > 0 && dados.devolucao_valor < dados.reserva_valor && !String(dados.observacoes || '').trim()) {
          erros.observacoes = `Devolução de ${reais(dados.devolucao_valor)} de uma reserva de ${reais(dados.reserva_valor)}: explique a diferença nas observações (ela sai no termo de devolução)`;
        }
      }
      // comprovante escolhido sem o valor: o arquivo era descartado em silêncio
      if (arquivoEscolhido(form, 'comprovante_reserva') && !(dados.reserva_valor > 0)) erros.reserva_valor = 'Informe o valor da reserva: há um comprovante escolhido';
      if (arquivoEscolhido(form, 'comprovante_devolucao') && R.fichaSemContrato(dados) && !(dados.devolucao_valor > 0)) erros.devolucao_valor = 'Informe o valor devolvido (ou a data da devolução): há um comprovante escolhido';
      if (!dados.solidario_nome) for (const k of Object.keys(dados)) if (k.startsWith('solidario_')) dados[k] = null;
      limparFicha(dados);
      // "Usar o endereço do imóvel de interesse": precisa de um só imóvel marcado
      for (const [caixa, campoEnd] of ENDERECO_DO_IMOVEL) {
        if (new FormData(form).get(caixa) !== '1' || (caixa.startsWith('solidario') && !dados.solidario_nome) || (caixa.startsWith('representante') && dados.inquilino_tipo !== 'Pessoa jurídica (empresa)')) continue;
        if (ids.length === 1) dados[campoEnd] = enderecoInquilino(buscar('imoveis', ids[0]));
        else erros[campoEnd] = 'Para usar o endereço do imóvel, marque um só imóvel de interesse';
      }
      // proposta: o aluguel bonificado digitado dá o %; sem bonificação, o % fica zero
      percentualDoBonificado(dados, erros, form);
      if (!dados.bonificacao) dados.desconto_pontualidade_percentual = 0;
      if (dados.desconto_pontualidade_percentual !== null && (dados.desconto_pontualidade_percentual < 0 || dados.desconto_pontualidade_percentual > 100)) erros.desconto_pontualidade_percentual = 'Informe um percentual entre 0 e 100';
      if (dados.dia_vencimento !== null && (dados.dia_vencimento < 1 || dados.dia_vencimento > 31)) erros.dia_vencimento = 'Informe um dia entre 1 e 31';
      // a pasta é escolhida ao criar e não muda (o nome pode ser corrigido depois)
      dados.pasta = r ? (r.pasta || nomePastaFicha(r)) : nomePastaFicha(dados);
      conferirComprovantes(COMPROVANTES_FICHA, dados, r, form);
    },
    async ajustarAsync(dados, erros, r, form) {
      const pasta = r ? () => pastaDoEscopo('ficha', r.id)
        : async () => S.subpasta(await E.pasta.getDirectoryHandle(S.PASTA_ARQUIVOS, { create: true }), [PASTA_FICHAS, dados.pasta]);
      await guardarComprovantes(COMPROVANTES_FICHA, dados, form, pasta);
      // análise do Serasa (não é de dinheiro: grava sem valor)
      const serasa = arquivoEscolhido(form, 'analise_serasa');
      if (serasa) dados.analise_serasa = await S.salvarArquivo(await pasta(), new File([serasa], `analise-serasa-${C.hojeIso()}${extensao(serasa.name)}`));
    },
    // reprovada (ou desistiu) agora: os links da ficha pela internet deixam de valer
    async depois(salvo, antigo) {
      if (antigo && R.fichaSemContrato(salvo) && !R.fichaSemContrato(antigo)) {
        try { if (await encerrarLinksDaFicha(salvo.id)) aviso('Os links da ficha pela internet foram encerrados.', 'info'); } catch (e) { console.warn('encerrar os links da ficha', e); }
      }
    },
  },
  // correção do aluguel avulsa (sem botão desde 24/10/2026; apagada em 2026-11-20, mutirão 19/11 fios-019): reajuste e novo
  // valor só pela tela Reajustes. Fica o recálculo dos boletos em aberto quando uma correção é desfeita pelo Histórico.
  correcoes: {
    semFormulario: ['A correção do aluguel é feita na tela Reajustes', '#/reajustes', 'Ir para Reajustes'],
    recalcular: (salvo) => (cb) => cb.contrato_id === salvo.contrato_id,
  },
  seguros: {
    titulo: (r, q) => { const c = buscar('contratos', r ? r.contrato_id : q.contrato); return `Seguro obrigatório - ${c.inquilino_nome}${buscar('imoveis', c.imovel_id) ? ` (${buscar('imoveis', c.imovel_id).nome})` : ''}`; },
    campos: () => F.SEGURO,
    fixos: (r, q) => (r ? {} : { contrato_id: Number(q.contrato), imovel_id: buscar('contratos', q.contrato).imovel_id }),
    conferir: conferirSeguro,
    // arquivo da apólice: pode salvar sem (confirma e fica o alerta para anexar depois); outros arquivos opcionais
    extraHtml: (r) => `<h3>Arquivos do seguro</h3><div class="formulario">
      <div><label>Arquivo da apólice</label><input type="file" name="arquivo_apolice" accept="${ACEITA_DOCUMENTOS}">
        ${r && r.arquivo_apolice ? F.arquivoGuardado('arquivo_apolice', r.arquivo_apolice) : '<small class="suave">PDF ou foto da apólice. Sem ele, o seguro é salvo e fica o alerta para anexar depois.</small>'}</div>
      <div><label>Outros arquivos (opcional)</label><input type="file" name="outros_arquivos" multiple accept="${ACEITA_DOCUMENTOS}">
        <small class="suave">Ex.: boleto do seguro, proposta, comprovante de pagamento.</small></div></div>`,
    ajustar(dados, erros) {
      if (dados.vigencia_inicio && dados.vigencia_fim && dados.vigencia_fim <= dados.vigencia_inicio) erros.vigencia_fim = 'O fim da vigência precisa ser depois do início';
      // 0 parcelas: o seguro nunca entrava em boleto nenhum (no IPTU já era recusado)
      if (!(dados.num_parcelas >= 1)) erros.num_parcelas = 'Informe pelo menos 1 parcela';
    },
    async ajustarAsync(dados, erros, r, form, q) {
      // só corre sem erro nos campos: a pergunta (janela do sistema) vem antes de gravar qualquer arquivo
      if (!form.querySelector('[name=arquivo_apolice]').files[0] && !(r && r.arquivo_apolice)) await confirmarAvisos(['Sem o arquivo da apólice. O seguro fica salvo, com o alerta "Falta o arquivo da apólice" na página do inquilino e no Painel até você anexar (em "Editar" da apólice).']);
      const pasta = await pastaDoEscopo('seguro', r ? r.contrato_id : Number(q.contrato));
      const vig = `${dados.vigencia_inicio}-a-${dados.vigencia_fim}`;
      const arq = form.querySelector('[name=arquivo_apolice]').files[0];
      if (arq) dados.arquivo_apolice = await S.salvarArquivo(pasta, new File([arq], `apolice-${vig}${extensao(arq.name)}`));
      const outros = [...form.querySelector('[name=outros_arquivos]').files];
      if (outros.length) {
        const nomes = [];
        for (const a of outros) {
          const nome = `seguro-${vig}-${semAcentoArquivo(a.name)}`;
          nomes.push(await S.salvarArquivo(pasta, new File([a], nome)));
        }
        dados.outros_arquivos = [...((r && r.outros_arquivos) || []), ...nomes];
      }
    },
    recalcular: (salvo) => (cb) => cb.contrato_id === salvo.contrato_id,
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}?ir=seguros`,
    descricao: (dados, r) => `Seguro obrigatório: ${[dados.seguradora, dados.apolice ? `apólice ${dados.apolice}` : ''].filter(Boolean).join(', ') || 'apólice'}, vigência ${dataBr(dados.vigencia_inicio)} a ${dataBr(dados.vigencia_fim)}`
      + `${dados.arquivo_apolice && dados.arquivo_apolice !== (r && r.arquivo_apolice) ? ` · arquivo ${dados.arquivo_apolice}` : ''}${dados.outros_arquivos && dados.outros_arquivos.length ? ` · ${dados.outros_arquivos.length - ((r && r.outros_arquivos) || []).length} outro(s) arquivo(s)` : ''}`,
  },
  iptus: {
    titulo: (r, q) => `IPTU - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: () => F.IPTU,
    conferir: conferirIptu,
    // IPTU lançado antes guardava o mês de uso: mostra o mês de vencimento do boleto (o seguinte)
    valores: (r) => ({ ...r, primeiro_vencimento_boleto: r.primeiro_vencimento_boleto || (r.primeira_competencia ? C.somarMeses(r.primeira_competencia, 1) : null) }),
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    recalcular: (salvo, db) => (cb) => (R.buscar(db, 'contratos', cb.contrato_id) || {}).imovel_id === salvo.imovel_id,
    padrao: (q) => {
      // novo ano: parte do ano anterior (mesmas parcelas, 1ª parcela no mesmo mês)
      const ano = Number(q.ano) || new Date().getFullYear();
      const ant = d().iptus.filter((p) => p.imovel_id === Number(q.imovel) && p.ano < ano).sort((a, b) => b.ano - a.ano)[0];
      const mesAnt = ant && (ant.primeiro_vencimento_boleto || (ant.primeira_competencia && C.somarMeses(ant.primeira_competencia, 1)));
      return ant ? { ano, num_parcelas: ant.num_parcelas, primeiro_vencimento_boleto: mesAnt ? `${ano}${mesAnt.slice(4)}` : null,
        vencimento_primeira: ant.vencimento_primeira ? C.somarAnos(ant.vencimento_primeira, ano - ant.ano) : null } : { ano };
    },
    aviso: (r, q) => {
      const iid = r ? r.imovel_id : Number(q.imovel);
      const ant = d().iptus.filter((p) => p.imovel_id === iid && p.ano < (r ? r.ano : Number(q.ano) || new Date().getFullYear())).sort((a, b) => b.ano - a.ano)[0];
      return ant ? `Ano anterior (${ant.ano}): total ${reais(ant.valor_total)} em ${ant.num_parcelas} parcela(s)${ant.valor_parcela ? ` de ${reais(ant.valor_parcela)}` : ''}.` : 'Primeiro IPTU lançado para este imóvel.';
    },
    ajustar(dados, erros, r, form, q) {
      const iid = r ? r.imovel_id : Number(q.imovel);
      if (d().iptus.some((p) => p.imovel_id === iid && p.ano === dados.ano && (!r || p.id !== r.id))) erros.ano = 'Já existe IPTU deste ano para o imóvel. Use "Editar".';
      if (!(dados.num_parcelas >= 1)) erros.num_parcelas = 'Informe pelo menos 1 parcela';
      if (!dados.pago_avista) Object.assign(dados, { valor_avista: null, data_quitacao: null, cobranca_inquilino: null });
    },
    voltar: (r, q) => (q && q.de === 'iptu' ? `#/iptu?ano=${r ? r.ano : q.ano}` : `#/imovel/${r ? r.imovel_id : q.imovel}`),
    destino: (salvo, q) => (q.de === 'iptu' ? `#/iptu?ano=${salvo.ano}` : `#/imovel/${salvo.imovel_id}`),
    descricao: (dados) => `IPTU ${dados.ano}`,
    async depois(salvo, antigo) {
      if (antigo) return;
      try {
        const n = await guardarGuiasSoltas(salvo.imovel_id, salvo.ano);
        if (n) aviso(`${n} guia(s) já anexada(s) foram para o histórico do IPTU do ano anterior. Anexe a guia de ${salvo.ano} no IPTU ${salvo.ano}.`, 'info');
      } catch (e) {
        aviso(`Não consegui mover as guias antigas para o histórico: ${e.message}`, 'aviso');
      }
    },
  },
  titularidades: {
    titulo: (r, q) => `Troca de titularidade - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: (r, q) => {
      const iid = r ? r.imovel_id : Number(q.imovel);
      const ops = d().contratos.filter((c) => c.imovel_id === iid).map((c) => [String(c.id), c.inquilino_nome]);
      return comListas(F.TITULARIDADE.map((c) => (c.nome === 'contrato_id' ? { ...c, opcoes: ops } : c)));
    },
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    padrao: (q) => ({ contrato_id: q.contrato || '', situacao: 'Solicitado', ...(q.concessionaria ? { concessionaria: q.concessionaria } : {}), data: C.hojeIso(), tipo: q.tipo === 'volta' ? 'Volta para o proprietário' : 'Para o inquilino' }),
    voltar: (r, q) => (q.contrato ? `#/contrato/${q.contrato}` : `#/imovel/${r ? r.imovel_id : q.imovel}`),
    descricao: (dados) => `${dados.concessionaria} ${dados.protocolo || ''}`.trim(),
  },
  // fiador avulso e "trocar fiador" (sem botão; apagados em 2026-11-20, mutirão 19/11 fios-019): fiador entra no Novo contrato,
  // no Editar contrato ou em "Trocar garantia ou fiador" (página do inquilino). Fica o texto do Histórico na exclusão.
  fiadores: {
    semFormulario: ['O fiador é incluído ou trocado na página do inquilino ("Trocar garantia ou fiador") ou no Editar contrato', '#/inquilinos', 'Ver os inquilinos'],
    descricao: (dados) => `Fiador ${dados.nome}`,
  },
  aplicacoes: {
    titulo: (r, q) => `Aplicação da garantia - ${buscar('contratos', r ? r.contrato_id : q.contrato).inquilino_nome}`,
    campos: () => F.APLICACAO.map((c) => (c.nome === 'emitente_id' ? { ...c, opcoes: [...d().emitentes.filter((e) => e.ativo).map((e) => [String(e.id), e.nome]), ['-1', 'Outra pessoa (depositado na conta de…)']] }
      : c.nome === 'recebedor' ? { ...c, sugestoes: R.recebedoresUsados(d()) } : c)),
    fixos: (r, q) => (r ? {} : { contrato_id: Number(q.contrato) }),
    valores: (r) => (r && r.recebedor ? { ...r, emitente_id: -1 } : r),
    padrao: (q) => {
      const s = R.situacaoAplicacao(d(), buscar('contratos', q.contrato));
      return { data: C.hojeIso(), valor: s.falta > 0 ? s.falta : null };
    },
    aviso: (r, q) => { const s = R.situacaoAplicacao(d(), buscar('contratos', q.contrato)); return `Garantia ${reais(s.total)}: aplicado ${reais(s.soma)}${s.linhas.length ? ` (${s.linhas.map((l) => `${l.emitente.nome} ${reais(l.aplicado)}`).join('; ')})` : ''}, falta ${reais(Math.max(s.falta, 0))}. Pode aplicar tudo num lugar só. Na saída, a devolução sai de onde foi depositado.`; },
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}`,
    descricao: (dados) => `Garantia aplicada: ${reais(dados.valor)}${dados.comprovante ? ` · comprovante ${dados.comprovante}` : ''}`,
    ajustar(dados, erros, r, form) {
      // outra pessoa: guarda o nome (sem empresa); empresa: sem nome de pessoa
      if (dados.emitente_id === -1) {
        dados.recebedor = String(dados.recebedor || '').trim();
        if (!dados.recebedor) erros.recebedor = 'Informe o nome de quem recebeu o depósito';
        dados.emitente_id = null;
      } else dados.recebedor = '';
      return conferirComprovantes(COMPROVANTE_APLICACAO, dados, r, form);
    },
    ajustarAsync: (dados, erros, r, form, q) => guardarComprovantes(COMPROVANTE_APLICACAO, dados, form, () => pastaDoEscopo('contrato', r ? r.contrato_id : Number(q.contrato))),
  },
  depositos_garantia: {
    titulo: (r) => `${r.qual === 'caucao' ? 'Depósito da caução' : 'Depósito de garantia'}${r.complementar ? ' (complemento)' : ''} - ${buscar('contratos', r.contrato_id).inquilino_nome}`,
    campos: () => F.DEPOSITO_GARANTIA,
    voltar: (r) => `#/contrato/${r.contrato_id}?ir=garantia`,
    // a soma dos depósitos é conferida de novo (a garantia pode ficar completa ou voltar a "a depositar")
    salvar: (db, dados, q, r) => R.editarDepositoGarantia(db, r.id, dados, login()),
    ajustar: (dados, erros, r, form) => conferirComprovantes(comprovanteDoDeposito(r), dados, r, form),
    ajustarAsync: (dados, erros, r, form) => guardarComprovantes(comprovanteDoDeposito(r), dados, form, () => pastaDoEscopo('contrato', r.contrato_id)),
  },
  correcoes_garantia: {
    titulo: (r, q) => `Correção da caução - ${buscar('contratos', q.contrato).inquilino_nome}`,
    campos: () => F.CORRECAO_GARANTIA,
    fixos: (r, q) => ({ contrato_id: Number(q.contrato) }),
    padrao: (q) => {
      const c = buscar('contratos', q.contrato);
      const ult = R.correcoesDo(d(), c.id).pop();
      return { data: ult ? ult.data_vigencia : C.hojeIso(), valor_novo: R.caucaoSugerida(d(), c, ult ? ult.data_vigencia : C.hojeIso()) };
    },
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); return R.garantiaDepositada(c) ? `Caução atual: ${reais(R.valorGarantia(d(), c))}${c.caucao_meses ? ` (${c.caucao_meses} aluguéis ${R.regra('caucao_base', c) === 'cheio' || !R.percentualBonificacao(c) ? 'cheios' : 'com bonificação'})` : ''}.`
      : `Caução ainda não registrada (depositado ${reais(R.somaDepositos(d(), c, 'caucao'))} de ${reais(c.caucao_valor)}): a correção vale depois que o valor inicial for depositado; o complemento é o que passa do valor inicial.`; },
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    descricao: (dados) => `Caução corrigida para ${reais(dados.valor_novo)}`,
    ajustar(dados, erros, r, form, q) {
      const c = buscar('contratos', q.contrato);
      if (r) {
        // edição: o valor anterior é o da época da correção; complemento não mexido acompanha o novo valor
        if (dados.complemento === null || (dados.complemento === r.complemento && dados.valor_novo !== r.valor_novo)) dados.complemento = dados.valor_novo - (r.valor_anterior ?? r.valor_novo - (r.complemento || 0));
        return conferirComprovantes(COMPROVANTE_COMPLEMENTO, dados, r, form);
      }
      // caução ainda não depositada inteira: corrige o valor a depositar (o complemento entra nos depósitos, sem comprovante próprio)
      const antes = !R.garantiaDepositada(c);
      const anterior = antes ? R.garantiaADepositar(d(), c, 'caucao').combinado : R.valorGarantia(d(), c);
      dados.valor_anterior = anterior;
      dados.antes_do_deposito = antes;
      if (dados.complemento === null) dados.complemento = dados.valor_novo - anterior;
      conferirComprovantes(COMPROVANTE_COMPLEMENTO, dados, r, form);
    },
    ajustarAsync: (dados, erros, r, form, q) => guardarComprovantes(COMPROVANTE_COMPLEMENTO, dados, form, () => pastaDoEscopo('contrato', Number(q.contrato))),
  },
  devolucoes_garantia: {
    titulo: (r, q) => `Devolução da garantia (${(r ? r.troca_id : q.troca) ? 'troca de garantia' : 'troca de titular'}) - ${buscar('contratos', r ? r.contrato_id : q.contrato).inquilino_nome}`,
    campos: () => F.DEVOLUCAO_GARANTIA,
    // como no cálculo final da saída: a garantia atual e os boletos em aberto como débitos
    padrao: (q) => {
      const c = buscar('contratos', q.contrato);
      // troca de garantia do mesmo inquilino: o valor que saiu na troca; ele continua no imóvel (os boletos em aberto seguem sendo cobrados)
      const t = q.troca && buscar('trocas_garantia', q.troca);
      if (t) return { data: C.hojeIso(), garantia_valor: t.valor_anterior };
      // débitos pelo valor do dia (vencido com multa e juros; acordo só pelas parcelas; sem o complemento da caução)
      const deb = R.debitosDaSaida(d(), c, C.hojeIso());
      return { data: C.hojeIso(), garantia_valor: R.garantiaRecebida(d(), c), debitos: deb.total || null,
        debitos_descricao: deb.itens.map((x) => x.texto).join('\n') };
    },
    aviso: (r, q) => {
      const c = buscar('contratos', r ? r.contrato_id : q.contrato);
      const n = R.continuadoPor(d(), c);
      const t = buscar('trocas_garantia', r ? r.troca_id : q.troca);
      if (t) return `Garantia trocada em ${dataBr(t.data)} (${t.tipo_anterior} → ${t.tipo_novo}): ${t.tipo_anterior === 'Caução' ? 'a caução' : 'o depósito'} de ${reais(t.valor_anterior)} é devolvid${t.tipo_anterior === 'Caução' ? 'a' : 'o'} a ${c.inquilino_nome}, corrigid${t.tipo_anterior === 'Caução' ? 'a' : 'o'} pela poupança (o índice vem do Banco Central, pelo aniversário de cada depósito: confira e corrija se precisar). Devolva pela conta em que foi aplicada.`;
      return `${n ? n.inquilino_nome : 'O novo titular'} assumiu o contrato com garantia nova: a garantia de ${c.inquilino_nome} é devolvida a ${c.inquilino_nome}, corrigida pela poupança (o índice vem do Banco Central, pelo aniversário de cada depósito: confira e corrija se precisar), descontados os débitos até a véspera da troca. Devolva pela conta em que foi aplicada.`;
    },
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}?ir=garantia`,
    descricao: (dados) => `Garantia devolvida: ${reais(dados.garantia_valor)}`,
    ajustar(dados, erros, r, form) {
      for (const k of ['indice_percentual', 'debitos']) if (!dados[k]) dados[k] = 0;
      return conferirComprovantes(COMPROVANTE_DEVOLUCAO, dados, r, form);
    },
    ajustarAsync: (dados, erros, r, form, q) => guardarComprovantes(COMPROVANTE_DEVOLUCAO, dados, form, () => pastaDoEscopo('contrato', r ? r.contrato_id : Number(q.contrato))),
    salvar: (db, dados, q, r) => R.salvarDevolucaoGarantia(db, r ? r.contrato_id : Number(q.contrato), { ...dados, ...(!r && q.troca ? { troca_id: Number(q.troca) } : {}) }, login(), r ? r.id : null),
  },
  trocas_garantia: {
    titulo: (r, q) => `Trocar garantia ou fiador - ${buscar('contratos', q.contrato).inquilino_nome}`,
    campos: (r, q) => comListas(F.trocaGarantia(R.fiadoresDo(d(), Number(q.contrato)))),
    padrao: (q) => {
      const c = buscar('contratos', q.contrato);
      // fiadores atuais preenchidos (tf1_, tf2_...); com fiador hoje, a nova garantia já vem igual (troca de fiador)
      const atuais = Object.fromEntries(R.fiadoresDo(d(), c.id).flatMap((f, k) => F.CAMPOS_FIADOR_TROCA.map((x) => [`tf${k + 1}_${x.nome}`, f[x.nome] ?? null])));
      return { data: C.hojeIso(), caucao_meses: c.caucao_meses || null, ...(R.temFiador(c) ? { garantia_tipo: c.garantia_tipo, deposito_valor: c.deposito_valor ?? null,
        deposito_data: c.deposito_data ?? null, deposito_uso: c.deposito_uso ?? null } : {}), ...atuais };
    },
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); const v = R.valorGarantia(d(), c); return `Garantia atual: ${c.garantia_tipo || 'não informada'}${v ? ` de ${reais(v)}` : ''}. Ela fica guardada no histórico do contrato. A troca exige termo aditivo: depois de salvar, registre o termo assinado em "Termos aditivos" (botão "Contrato, Vistoria, Termos e Aditivos" na página do inquilino).`; },
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    destino: (salvo, q) => `#/contrato/${q.contrato}`,
    ajustar(dados, erros, r, form, q) {
      if (dados.garantia_tipo === 'Caução' && !(dados.caucao_valor > 0)) erros.caucao_valor = 'Informe o valor da caução';
      if (R.temDeposito(dados) && !(dados.deposito_valor > 0)) erros.deposito_valor = 'Informe o valor do depósito';
      // fiadores: os atuais (tfN_) podem ser corrigidos ou sair; os blocos em branco (tnN_) incluem os novos
      const atuais = R.fiadoresDo(d(), Number(q.contrato));
      const fd = new FormData(form);
      const pega = (p) => { const f = Object.fromEntries(F.CAMPOS_FIADOR_TROCA.map((c) => [c.nome, dados[`${p}_${c.nome}`] ?? null])); F.CAMPOS_FIADOR_TROCA.forEach((c) => delete dados[`${p}_${c.nome}`]); return f; };
      fiadoresDaTroca = { novos: [], saem: [], alterados: [] };
      const comFiador = R.temFiador(dados);
      atuais.forEach((atual, k) => {
        const f = pega(`tf${k + 1}`);
        delete dados[`tf${k + 1}_sai`];
        if (!comFiador) return;
        if (fd.get(`tf${k + 1}_sai`) === '1') { fiadoresDaTroca.saem.push(atual.id); return; }
        if (!f.nome) erros[`tf${k + 1}_nome`] = 'Informe o nome do fiador (ou marque que ele sai nesta troca)';
        else if (F.CAMPOS_FIADOR_TROCA.some((c) => String(atual[c.nome] ?? '') !== String(f[c.nome] ?? ''))) fiadoresDaTroca.alterados.push({ id: atual.id, ...f });
      });
      for (let n = 1; n <= F.NOVOS_FIADORES_TROCA; n += 1) {
        const f = pega(`tn${n}`);
        // a nacionalidade já vem preenchida ("brasileira"): sozinha não conta como fiador digitado
        if (!comFiador || !Object.entries(f).some(([k, v]) => v && k !== 'nacionalidade')) continue;
        if (!f.nome) erros[`tn${n}_nome`] = 'Informe o nome do fiador novo';
        else fiadoresDaTroca.novos.push(f);
      }
      if (comFiador && atuais.length - fiadoresDaTroca.saem.length + fiadoresDaTroca.novos.length < 1) erros.garantia_tipo = 'Com fiador, fica pelo menos um: preencha o fiador novo ou desmarque quem sai';
    },
    ajustarAsync: (dados, erros, r, form, q) => guardarComprovantes(COMPROVANTES_CONTRATO.slice(0, 2), dados, form, () => pastaDoEscopo('contrato', Number(q.contrato))),
    salvar: (db, dados, q) => {
      const t = R.trocarGarantia(db, Number(q.contrato), dados, login(), fiadoresDaTroca);
      fiadoresDaTroca = { novos: [], saem: [], alterados: [] };
      return t;
    },
  },
  leituras: {
    titulo: (r, q) => `Leitura dos relógios - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: (r, q) => {
      const imovelId = r ? r.imovel_id : Number(q.imovel);
      const ops = d().contratos.filter((c) => c.imovel_id === imovelId).sort((a, b) => b.data_entrada.localeCompare(a.data_entrada))
        .map((c) => [String(c.id), `${c.inquilino_nome} (${dataBr(c.data_entrada)} a ${dataBr(c.data_saida)})`]);
      // entrada e saída do inquilino: na vistoria; aqui, as outras leituras (ex.: troca de titularidade, imóvel vazio)
      const leitura = r ? F.LEITURA : F.LEITURA.map((c) => (c.nome === 'momento' ? { ...c, padrao: 'Outra', opcoes: ['Outra'], ajuda: 'A leitura de entrada e de saída do inquilino é feita na vistoria' } : c));
      return [...leitura.slice(0, 2), { nome: 'contrato_id', rotulo: 'Inquilino', tipo: 'opcao', opcoes: ops, ajuda: 'Em branco: imóvel vazio' }, ...leitura.slice(2)];
    },
    padrao: (q) => ({ data: C.hojeIso(), contrato_id: q.contrato ? Number(q.contrato) : null, momento: 'Outra' }),
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    voltar: (r, q) => (q.contrato ? `#/contrato/${q.contrato}` : `#/imovel/${r ? r.imovel_id : q.imovel}`),
    descricao: (dados) => `${dados.momento}: ${R.textoLeitura(dados)}`,
    conferir: conferirLeitura,
    ajustar(dados, erros) {
      if (!F.LEITURAS.some(([k]) => dados[k])) erros.agua = 'Informe pelo menos uma leitura';
    },
  },
  renovacoes: {
    titulo: (r, q) => `Renovação / novo valor - ${buscar('contratos', q.contrato).inquilino_nome}`,
    campos: () => F.RENOVACAO,
    padrao: (q) => { const c = buscar('contratos', q.contrato); return { data: c.vigencia_fim || C.hojeIso(), tipo: 'Renovado com nova data de término', novo_percentual: R.percentualBonificacao(c) || null }; },
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); return `Aluguel atual ${reais(R.aluguelAtual(d(), c))}. Contrato ${c.prazo_tipo === 'Indeterminado' ? 'por prazo indeterminado' : `até ${dataBr(c.vigencia_fim)}`}.`; },
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    ajustar(dados, erros, r, form, q) {
      const c = buscar('contratos', q.contrato);
      if (dados.tipo === 'Renovado com nova data de término' && !dados.nova_vigencia_fim) erros.nova_vigencia_fim = 'Informe a nova data de término';
      else if (dados.tipo === 'Renovado com nova data de término') {
        // término novo antes da entrada, da própria renovação ou do término atual: o contrato passava a constar como vencido
        const fimAtual = R.fimDoContrato(d(), c);
        if (c.data_entrada && dados.nova_vigencia_fim <= c.data_entrada) erros.nova_vigencia_fim = `A nova data de término precisa ser depois da entrada (${dataBr(c.data_entrada)})`;
        else if (dados.data && dados.nova_vigencia_fim <= dados.data) erros.nova_vigencia_fim = `A nova data de término precisa ser depois da data da renovação (${dataBr(dados.data)})`;
        else if (fimAtual && dados.nova_vigencia_fim <= fimAtual) erros.nova_vigencia_fim = `A nova data de término precisa ser depois do término atual (${dataBr(fimAtual)})`;
      }
      // só a renovação com nova data muda o término (antes a data digitada valia também no "Novo valor negociado")
      if (dados.tipo !== 'Renovado com nova data de término') dados.nova_vigencia_fim = null;
      if (dados.tipo === 'Novo valor negociado' && !(dados.novo_valor > 0)) erros.novo_valor = 'Informe o novo valor';
      // aluguel bonificado digitado (sem o %): o % sai dele, como no contrato. Ex.: cheio R$ 2.200,00 e bonificado R$ 1.980,00 → 10%
      const bonificadoTexto = String(new FormData(form).get('novo_bonificado') || '').trim();
      if (dados.novo_valor > 0 && bonificadoTexto) {
        let v = NaN;
        try { v = C.centavos(bonificadoTexto); } catch { /* inválido */ }
        if (!Number.isFinite(v) || v < 0 || v > dados.novo_valor) erros.novo_bonificado = `Informe um valor entre R$ 0,00 e ${reais(dados.novo_valor)} (aluguel cheio)`;
        else dados.novo_percentual = C.percentualPorBonificado(dados.novo_valor, v);
      }
      if (!(dados.novo_valor > 0)) { dados.novo_percentual = null; dados.vale_desde = null; }
      else if (dados.vale_desde && !C.competenciaValida(dados.vale_desde, '')) erros.vale_desde = 'Informe o mês (ex.: 12/2026)';
      else if (dados.vale_desde && dados.vale_desde < String(buscar('contratos', q.contrato).data_entrada || '').slice(0, 7)) erros.vale_desde = 'O mês é anterior à entrada do inquilino';
      else dados.vale_desde = R.valeDesdeDaRenovacao(dados);
      if (dados.novo_percentual !== null && dados.novo_percentual !== undefined && (dados.novo_percentual < 0 || dados.novo_percentual > 100)) erros.novo_percentual = 'Informe um percentual entre 0 e 100';
    },
    conferir: conferirRenovacao,
    salvar: (db, dados, q) => R.registrarRenovacao(db, Number(q.contrato), dados, login()),
    async depois(salvo) {
      if (salvo.novo_valor > 0) aviso('Termo aditivo do novo valor gerado: mande para assinar pelo "✉ E-mail: termo para assinar" (em Termos aditivos) e anexe o termo assinado (o aceite) quando voltar.', 'info');
    },
  },
  encerramentos: {
    titulo: (r, q) => `Saída e cálculo final - ${buscar('contratos', q.contrato).inquilino_nome}`,
    // FCI: só aparece para quem tem (ou teve) o fundo de conservação
    campos: (r, q) => { const c = buscar('contratos', q.contrato); return R.temFci(c) || R.depositosFci(d(), c).length ? F.ENCERRAMENTO : F.ENCERRAMENTO.filter((x) => !x.nome.startsWith('fci_')); },
    padrao: (q) => {
      const c = buscar('contratos', q.contrato);
      const deb = R.debitosDaSaida(d(), c, C.hojeIso());
      const lt = R.leituraDo(d(), c.id, 'Saída do inquilino') || {};
      // B5: os reparos da vistoria de saída, com o valor de cada um (com FCI, o fundo paga os danos primeiro)
      const v = resultadoVistoriaSaida(d(), c);
      const comFci = R.temFci(c) || R.depositosFci(d(), c).length > 0;
      const reparos = v.reparos.map((x) => `Reparo da vistoria${comFci ? ' (pago pelo FCI)' : ''}: ${textoReparo(x)}`);
      return {
        fci_credito: R.saldoFci(d(), c).corrigido || null,
        fci_danos: comFci && v.totalReparos ? v.totalReparos : null,
        leitura_agua: lt.agua || '', leitura_energia: lt.energia || '', leitura_gas: lt.gas || '', garantia_valor: R.garantiaRecebida(d(), c),
        debitos: deb.total + (comFci ? 0 : v.totalReparos),
        debitos_descricao: [...deb.itens.map((x) => x.texto), ...reparos].join('\n'),
      };
    },
    aviso: (r, q) => {
      const c = buscar('contratos', q.contrato);
      // o "Vistoria de saída" não é digitado: vem da vistoria registrada (fonte única) e é guardado ao salvar
      const v = resultadoVistoriaSaida(d(), c);
      const vistoria = v.vistoria ? `Vistoria de saída de ${dataBr(v.vistoria.data)}: ${v.texto.toLocaleLowerCase('pt-BR')}${v.pendencias.length ? ` (${v.pendencias.slice(0, 5).join('; ')}${v.pendencias.length > 5 ? '…' : ''}): ${v.semValor ? `falta o valor de ${v.semValor} reparo(s) (roteiro da saída, "Valores dos reparos")` : `os reparos (${reais(v.totalReparos)}) já entram nos débitos`}` : ''}.` : 'Vistoria de saída ainda não registrada: o cálculo fica como "não feita" (registre a vistoria antes, se houver).';
      const semDeposito = (R.temCaucao(c) || R.temDeposito(c)) && R.valorGarantia(d(), c) > 0 && !R.garantiaRecebida(d(), c)
        ? ` Atenção: a ${R.temCaucao(c) ? 'caução' : 'garantia'} de ${reais(R.valorGarantia(d(), c))} foi combinada, mas nada foi depositado: não há garantia a devolver (se foi depositada, registre o depósito antes).` : '';
      // saída antes do fim do prazo: a multa do contrato não entra sozinha; o valor sugerido aparece para incluir ou dispensar
      const m = R.multaSaidaAntecipada(d(), c);
      const multa = m ? ` Saída antes do fim do contrato (${dataBr(m.fim)}): multa sugerida de ${reais(m.valor)} (3 aluguéis de ${reais(m.aluguel)}, proporcional aos ${m.restam} de ${m.total} dias que faltavam; confira a cláusula no contrato assinado). Ela não entra sozinha: para cobrar, some aos débitos e escreva "Multa pela saída antecipada" na descrição; para dispensar (ex.: transferência pelo empregador, Lei 8.245/91, art. 4º), deixe de fora e anote o motivo na descrição.` : '';
      const compSaida = c.data_saida ? C.competenciaDe(c.data_saida) : null;
      const semBoleto = compSaida && !R.boletoDoMes(d(), c.id, compSaida) ? ` Atenção: o boleto de ${compBr(compSaida)} (último mês, proporcional) ainda não foi gerado: gere antes, senão o aluguel desse mês fica fora dos débitos.` : '';
      return `Saída em ${dataBr(c.data_saida)} (mude em "Saída do inquilino").${multa}${semBoleto}${semDeposito} ${vistoria} A leitura dos relógios é a da vistoria de saída: vem preenchida e, se mudar aqui, muda lá também. Confira o boleto do último mês (proporcional aos dias). A garantia é corrigida pela poupança: o índice vem do Banco Central, pelo aniversário de cada depósito (confira e corrija se precisar).`;
    },
    // os débitos vêm dos boletos que já existem: sem o boleto do mês da saída, o último aluguel ficava fora do cálculo
    // (ex.: saída em 20/10/2026 e o boleto de 10/2026 ainda não gerado → débitos R$ 0,00 e a caução devolvida inteira)
    conferir: (dados, r, q) => {
      const c = buscar('contratos', q.contrato);
      const comp = c.data_saida ? C.competenciaDe(c.data_saida) : null;
      return comp && !R.boletoDoMes(d(), c.id, comp) ? [`O boleto do último mês (aluguel de ${compBr(comp)}, proporcional) ainda não foi gerado: o aluguel desse mês fica fora dos débitos. Gere antes o boleto de ${compBr(comp)} (tela Boletos) e refaça o cálculo.`] : [];
    },
    // a data de saída é a do contrato (1ª etapa, "Informar data de saída")
    fixos: (r, q) => ({ data_saida: buscar('contratos', q.contrato).data_saida }),
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    ajustar(dados, erros, r, form, q) {
      const c = buscar('contratos', q.contrato);
      if (!c.data_saida) throw new C.ErroUsuario('Informe antes a data de saída, em "Saída do inquilino".');
      for (const k of ['garantia_valor', 'indice_percentual', 'debitos', 'fci_credito', 'fci_danos']) if (!dados[k]) dados[k] = 0;
      for (const k of R.relogiosObrigatorios(c)) if (!dados[`leitura_${k}`]) erros[`leitura_${k}`] = 'Informe a leitura na saída';
      dados.vistoria_saida = resultadoVistoriaSaida(d(), c).texto;
    },
    salvar: (db, dados, q) => R.encerrarContrato(db, Number(q.contrato), dados, login(), C.hojeIso()),
  },
  avulsas: {
    titulo: (r) => (r ? (r.airbnb_competencia ? `Editar a NF do Airbnb de ${compBr(r.airbnb_competencia)}` : 'Editar NF avulsa') : 'Nova NF avulsa'),
    campos: () => F.AVULSA.map((c) => (c.nome === 'imovel_id' ? { ...c, opcoes: ordenar(d().imoveis, 'nome').map((i) => [String(i.id), i.nome]) } : c)),
    // A NF do Airbnb nasce em "Gerar a NF do Airbnb" (R.gerarNfAirbnb, uma por mês, com os dados padrão); aqui só se edita,
    // e os dados do cliente podem ficar como padrão das próximas. (O botão "Nova NF avulsa do Airbnb" saiu em 2026-11-13: criava uma NF em dobro.)
    padrao: () => ({ data_pagamento: C.hojeIso() }),
    aviso: (r) => (r && r.airbnb_competencia ? 'NF do Airbnb gerada pela soma dos ganhos lançados nos imóveis: o valor e as datas acompanham os ganhos ("Acertar a NF do Airbnb"). Aqui você muda os dados do cliente e as observações.' : ''),
    extraHtml: (r) => (r && r.airbnb_competencia ? '<p style="margin-top:12px"><label class="check" style="padding:0"><input type="checkbox" name="salvar_modelo" value="1"> Guardar a descrição, o cliente, o imóvel, o município e as observações como padrão das próximas NFs do Airbnb</label></p>' : ''),
    voltar: () => '#/faturas',
    descricao: (dados) => `NF avulsa: ${dados.tomador_nome} ${reais(dados.valor)}`,
    conferir: conferirAvulsa,
    ajustar(dados, erros, r, form) {
      if (r && R.faturasDe(d(), 'avulsa', r.id).length) erros.valor = 'Já tem número de NF';
      if (!(dados.valor > 0)) erros.valor = 'Informe o valor';
      guardarModeloAirbnb = new FormData(form).get('salvar_modelo') === '1';
    },
    salvar(db, dados, q, r) {
      if (guardarModeloAirbnb) {
        db.modelo_airbnb = Object.fromEntries(R.CAMPOS_MODELO_AIRBNB.map((k) => [k, dados[k] ?? '']));
        R.registrar(db, login(), 'Alteração', 'avulsas', null, 'Padrão da NF avulsa do Airbnb alterado', db.modelo_airbnb);
      }
      guardarModeloAirbnb = false;
      if (r) { R.atualizar(db, 'avulsas', r.id, dados, login(), `NF avulsa: ${dados.tomador_nome}`); return R.buscar(db, 'avulsas', r.id); }
      return R.inserir(db, 'avulsas', dados, login(), `NF avulsa: ${dados.tomador_nome} ${reais(dados.valor)}`);
    },
  },
  emitentes: {
    admin: true,
    titulo: () => 'Empresa emitente',
    campos: () => F.EMITENTE,
    voltar: () => '#/empresas',
    descricao: (dados) => dados.nome,
    ajustar(dados, erros) {
      // Estado da sede: duas letras, em maiúsculas (ex.: "pr" → "PR"); vai depois da cidade do imóvel sem Estado
      if (dados.uf_sede) dados.uf_sede = String(dados.uf_sede).trim().toUpperCase();
      if (dados.uf_sede && !/^[A-Z]{2}$/.test(dados.uf_sede)) erros.uf_sede = 'Use as duas letras do Estado. Ex.: PR';
    },
  },
  usuarios: {
    admin: true,
    titulo: (r) => (r ? 'Editar usuário' : 'Novo usuário'),
    campos: () => F.USUARIO,
    voltar: () => '#/usuarios',
    descricao: (dados) => `Usuário ${dados.login}`,
    extraHtml: (r) => `<div class="formulario" style="margin-top:12px"><div><label>${r ? 'Nova senha (em branco para manter)' : 'Senha inicial *'}</label><input type="password" name="senha" autocomplete="new-password"></div>
      <div><label>Repita a senha</label><input type="password" name="senha2" autocomplete="new-password"></div></div>`,
    async ajustarAsync(dados, erros, r, form) {
      dados.login = String(dados.login || '').toLowerCase();
      const senha = String(new FormData(form).get('senha') || '');
      if (senha) {
        if (senhaCurta(senha)) erros.login = ERRO_SENHA_CURTA;
        else if (senha !== String(new FormData(form).get('senha2') || '')) erros.login = 'As duas senhas precisam ser iguais (campos "Senha" e "Repita a senha", no fim do formulário)';
        Object.assign(dados, await camposDeSenha(senha));
        // senha nova: as sessões lembradas desse usuário caem (se for o próprio administrador, fica só a deste navegador)
        if (r) { const token = r.id === E.usuario.id ? tokenDaSessao() : null; dados.sessoes = token ? [token] : []; }
      } else if (!r) erros.login = 'Informe uma senha inicial';
      if (d().usuarios.some((u) => u.login === dados.login && u.id !== (r && r.id))) erros.login = 'Já existe um usuário com este login';
      else {
        // e-mail de acesso igual ao de outro (ou ao login de outro): a nuvem podia dar à pessoa o papel do outro usuário
        const outro = usuarioComMesmoAcesso(d().usuarios, dados, r && r.id);
        if (outro) erros[dados.email && [outro.login, outro.email].some((v) => String(v || '').toLowerCase() === String(dados.email).toLowerCase()) ? 'email' : 'login'] = `Já usado pelo usuário ${outro.nome || outro.login}: cada pessoa entra com um e-mail próprio`;
      }
      // na nuvem a pessoa entra pelo e-mail (Cloudflare): sem ele (e sem login em forma de e-mail) ela nunca consegue entrar
      if (E.nuvem && dados.ativo && !emailDeAcesso(dados) && !erros.email) erros.email = 'Na nuvem, informe o e-mail de acesso: é com ele que a pessoa entra pela internet';
      if (r && r.id === E.usuario.id && (dados.papel !== 'admin' || !dados.ativo)) erros.papel = 'Você não pode tirar o seu próprio acesso de administrador';
      // na nuvem, o próprio usuário sem o e-mail com que entrou ficaria trancado para fora (a nuvem também recusa)
      if (E.nuvem && E.emailNuvem && r && r.id === E.usuario.id && ![dados.login, dados.email].some((v) => String(v || '').trim().toLowerCase() === String(E.emailNuvem).toLowerCase())) {
        erros.email = `O seu login ou o e-mail de acesso tem de continuar ${E.emailNuvem} (o e-mail com que você entra pela internet); senão você não entra mais`;
      }
      if (!r) dados.criado_em = new Date().toISOString();
    },
  },
  cobrancas: {
    semNovo: true, // boleto novo sai em "Gerar boletos" na tela Boletos
    titulo: (r) => `${r.data_pagamento ? 'Observações da NF do' : 'Alterar'} boleto ${compBr(r.competencia)} - ${buscar('contratos', r.contrato_id).inquilino_nome}`,
    // boleto pago: só as observações que saem na NF (os valores exigem desfazer o pagamento)
    campos: (r) => (r.data_pagamento ? F.COBRANCA.filter((c) => c.nome === 'observacoes_nf') : F.COBRANCA),
    aviso: (r) => (r.data_pagamento ? 'Boleto já pago: aqui só dá para mudar as observações da NF. Nome e endereço do cliente vêm do cadastro do inquilino e do imóvel.' : ''),
    voltar: (r, q) => (q.nf ? '#/faturas' : `#/cobranca/${r.id}`),
    destino: (salvo, q) => (q.nf ? '#/faturas' : `#/cobranca/${salvo.id}`),
    descricao: (dados, r) => (r.data_pagamento ? 'Observações da NF alteradas' : 'Valores do boleto alterados'),
    conferir: (dados, r) => (r.data_pagamento ? [] : conferirBoleto(dados, r)),
    ajustar(dados, erros, r) {
      if (r.data_pagamento) {
        if (R.faturasDe(d(), 'cobranca', r.id).length) erros.observacoes_nf = 'A NF já foi numerada. Cancele a NF (ou desfaça a numeração) antes de corrigir';
        return;
      }
      for (const k of ['desconto', 'iptu', 'seguro', 'taxa_boleto', 'fci', 'outros', 'reserva_utilizada', 'multa_percentual', 'juros_mensal_percentual']) if (dados[k] === null) dados[k] = 0;
      dados.editado_manual = true; // o recálculo automático não mexe mais nestes valores
      // bonificação maior que o aluguel deixava o boleto "a pagar R$ 0,00" (ex.: aluguel R$ 2.400,00 e desconto R$ 5.000,00)
      if (dados.aluguel > 0 && dados.desconto > dados.aluguel) erros.desconto = `O desconto não pode passar do aluguel (${reais(dados.aluguel)})`;
      const disp = R.saldoReserva(d(), buscar('contratos', r.contrato_id), r.id);
      if (dados.reserva_utilizada > disp) {
        const outros = d().cobrancas.filter((x) => x.contrato_id === r.contrato_id && x.id !== r.id && x.reserva_utilizada > 0);
        erros.reserva_utilizada = `Saldo da reserva disponível: ${reais(disp)}${outros.length ? ` (está no boleto de ${outros.map((x) => compBr(x.competencia)).join(', ')}). Para trocar de mês, mude "Usar a reserva no aluguel de" no Editar do contrato` : ''}`;
      }
    },
  },
};

export function telaFormulario(tabela, registro, q, estado) {
  const cfg = Object.hasOwn(CADASTROS, String(tabela)) ? CADASTROS[tabela] : null;
  if (!cfg) return naoEncontrado('Página não encontrada');
  if (!opera() || (cfg.admin && !podeUsuario('admin'))) return '<h1>Seu usuário não pode alterar este cadastro</h1>';
  if (cfg.semFormulario) return naoEncontrado(...cfg.semFormulario, '');
  if (!registro && cfg.semNovo) return naoEncontrado('Boletos novos saem na tela Boletos ("Gerar boletos" do mês)', '#/cobrancas', 'Ir para Boletos', '');
  // cadastro que depende de outro (ex.: depósito da garantia de um contrato) aberto sem ele: endereço incompleto
  try {
    return montarFormulario(cfg, tabela, registro, q, estado);
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    return naoEncontrado('Abra este cadastro pela página do inquilino ou do imóvel', '#/', 'Voltar ao painel', '');
  }
}

function montarFormulario(cfg, tabela, registro, q, estado) {
  const campos = cfg.campos(registro, q);
  let valores = estado ? estado.valores : F.paraFormulario(campos, registro && cfg.valores ? cfg.valores(registro, q) : registro);
  if (!registro && !estado) {
    const padroes = Object.fromEntries(campos.filter((c) => c.nome && c.padrao !== undefined).map((c) => [c.nome, c.padrao]));
    valores = F.paraFormulario(campos, { ...padroes, ...(cfg.padrao ? cfg.padrao(q) : {}) });
  }
  // o que o formulário mostrou ao abrir: ao salvar, o campo que a pessoa não mexeu e outro mudou fica com o valor do outro
  // (envios.js, cadastro). O redesenho depois de um erro mantém o da abertura.
  if (!estado) memoria.formularioAberto = registro ? { chave: `${tabela}:${registro.id}`, valores } : null;
  const base = cfg.base ? cfg.base(registro) : null;
  const avisoTexto = cfg.aviso ? cfg.aviso(registro, q) : '';
  return `<h1>${esc(cfg.titulo(registro, q))}</h1>${avisoTexto ? `<div class="alerta info">${esc(avisoTexto)}</div>` : ''}${cfg.topo ? cfg.topo(registro, q) : ''}
    <form class="cartao" data-form="cadastro" ${base !== null && base !== undefined ? `data-base="${base}"` : ''}>
      ${F.camposHtml(campos, valores, estado ? estado.erros : {}, { compacto: !!cfg.compacto })}${cfg.extraHtml ? cfg.extraHtml(registro, q) : ''}
      <p class="acoes" style="margin-top:16px"><button>Salvar</button><a class="botao secundario" href="${esc(cfg.voltar(registro, q))}">Voltar</a></p></form>`;
}
