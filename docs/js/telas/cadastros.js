// Cadastros (#/novo/TABELA e #/editar/TABELA/ID): CADASTROS define, para cada tabela, os campos, os ajustes antes de salvar,
// a conferência (avisos.js), como salvar e para onde voltar. telaFormulario desenha o formulário; o envio é FORMULARIOS.cadastro (envios.js).
import { alterar, aviso, E, login, podeUsuario } from '../app.js';
import * as S from '../armazenamento.js';
import { novoSal, resumoSenha } from '../auth.js';
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import * as F from '../formularios.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { confirmarAvisos, conferirAvulsa, conferirBoleto, conferirContrato, conferirIptu, conferirLeitura, conferirPessoa, conferirRessarcimento, conferirSeguro } from './avisos.js';
import { CAMPOS_GARANTIA_HERDADA, CAMPOS_VALORES_HERDADOS, ENDERECO_DO_IMOVEL, enderecoInquilino } from './campos.js';
import { arquivoSumiu, botao, buscar, d, etiqueta, extensao, guardarGuiasSoltas, memoria, nomePastaContrato, opera, ordenar, pastaDoEscopo, pastaPaiContrato, renomearNoDisco, salvarAssinado, semAcentoArquivo, trazerHeranca } from './comum.js';
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
    ant ? `Já usada no contrato de ${esc(ant.inquilino_nome)}: ${reais(c.reserva_usada_anterior)}.` : ''].filter(Boolean).join(' ');
  if (c.reserva_abatida_valor > 0) {
    return `<div class="alerta ok"><b>Reserva já abatida</b> em ${compBr(c.reserva_abatida_comp)}: ${reais(c.reserva_abatida_valor)} (aluguel antigo, fora dos boletos do sistema).
      ${nosBoletos ? `<br>${nosBoletos}` : ''}
      ${opera() ? `<div class="acoes" style="margin-top:6px">${botao('desmarcarReservaAbatida', 'Excluir registro', { id: c.id }, 'perigo pequeno', 'Excluir o registro de reserva já abatida? A reserva volta a abater os boletos em aberto.')}</div>` : ''}</div>`;
  }
  const max = R.reservaParaMarcarAbatida(d(), c);
  return `${usos.length || ant ? `<p class="suave">${nosBoletos}</p>` : `<div class="alerta aviso"><b>Reserva ainda não abatida em nenhum boleto do sistema.</b> Se ela já foi abatida num aluguel antigo, marque abaixo o mês e o valor.</div>`}
    ${opera() ? `${max > 0 ? `<form data-form="reservaAbatida" class="acoes" style="margin-top:6px"><input type="hidden" name="contrato" value="${c.id}">
        <label class="suave" style="margin:0">Abatida em</label><input type="month" name="competencia" value="${esc(R.competenciaReserva(c) || '')}" style="width:auto" required>
        <label class="suave" style="margin:0">valor R$</label><input name="valor" value="${esc(C.reais(max, false))}" style="width:120px" required>
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
export const ANEXOS_COM_X = { contratos: ['comprovante_reserva'], correcoes_garantia: ['comprovante'], aplicacoes: ['comprovante'], depositos_garantia: ['comprovante'], devolucoes_garantia: ['comprovante'] };

/**
 * Link para abrir o comprovante guardado na pasta do inquilino, com o "×" que apaga só o arquivo. Sem comprovante:
 * etiqueta e, com ``anexo`` ({ tabela, id, campo, tipo, data }), o botão para anexar depois.
 */
// sem comprovante: um só botão pequeno "⚠ anexar" (antes: etiqueta "sem comprovante: buscar no banco" + botão grande)
export const linkComprovante = (contratoId, nome, anexo = null) => (nome && !(anexo && arquivoSumiu('contrato', contratoId, nome)) ? `<span class="nw"><a href="#" data-acao="abrirArquivo" data-escopo="contrato" data-id="${contratoId}" data-nome="${esc(nome)}" title="${esc(nome)}">📎 comprovante</a>${anexo && (ANEXOS_COM_X[anexo.tabela] || []).includes(anexo.campo)
  ? xAnexo('removerAnexo', { tabela: anexo.tabela, id: anexo.id, campo: anexo.campo }, `Apagar o comprovante "${nome}"? O lançamento continua e volta o aviso para anexar.`) : ''}</span>`
  : anexo && opera() ? `<label class="anexar-falta" title="${nome ? `O arquivo ${esc(nome)} sumiu da pasta: anexe de novo (PDF ou foto)` : 'Sem comprovante: buscar no banco e anexar (PDF ou foto)'}">⚠ ${nome ? 'arquivo sumiu: anexar de novo' : 'anexar comprovante'}<input type="file" accept="application/pdf,image/*"
    data-acao-arquivo="anexarComprovante" data-contrato="${contratoId}" data-tabela="${anexo.tabela}" data-id="${anexo.id}" data-campo="${anexo.campo}" data-tipo="${anexo.tipo}" data-data="${esc(anexo.data || '')}"></label>`
    : etiqueta('sem comprovante', 'aviso'));

export let fiadoresMudancas = { novos: [], alterados: [] };

/** Fiadores que entram, saem ou são corrigidos na troca de garantia (preenchido em ajustar, usado em salvar). */
let fiadoresDaTroca = { novos: [], saem: [], alterados: [] };

let avisoAditivo = '';

/** Pagamento com valor diferente do previsto, esperando o valor da NF na página do boleto (nada é salvo antes). */
let guardarModeloAirbnb = false;

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
    campos: () => F.RESSARCIMENTO,
    conferir: conferirRessarcimento,
    padrao: () => ({ competencia_condominio: C.somarMeses(C.competenciaDe(C.hojeIso()), -1) }),
    fixos: (r, q) => (r ? {} : { contrato_id: Number(q.contrato) }),
    aviso: () => 'Taxas extraordinárias do condomínio são do proprietário (Lei 8.245/91, art. 22, X): fundo de obras, constituição do fundo de reserva, obras na estrutura, pintura de fachada, equipamentos de segurança, paisagismo das áreas comuns, indenizações trabalhistas de antes da locação. Se o inquilino pagou no boleto do condomínio, o valor volta para ele no boleto do aluguel.',
    ajustar(dados, erros, r, form, q) {
      const c = buscar('contratos', r ? r.contrato_id : q.contrato);
      if (dados.valor !== null && dados.valor <= 0) erros.valor = 'Informe o valor';
      if (dados.descricao === 'Outra' && !dados.detalhe) erros.detalhe = 'Diga qual é a taxa';
      if (!dados.competencia_abatimento && dados.data_pagamento) dados.competencia_abatimento = R.competenciaDoAbatimento(c, dados.data_pagamento);
      const cb = R.boletoDoMes(d(), c.id, dados.competencia_abatimento);
      if (cb && cb.data_pagamento && (!r || r.competencia_abatimento !== dados.competencia_abatimento)) {
        erros.competencia_abatimento = `O boleto de ${compBr(dados.competencia_abatimento)} já foi pago. Escolha o próximo boleto em aberto`;
      }
      if (dados.detalhe) dados.descricao = `${dados.descricao === 'Outra' ? '' : `${dados.descricao}: `}${dados.detalhe}`;
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
    // inquilino escolhido na lista (ativos, em ordem de nome); vindo da tela Inquilinos, já vem marcado
    campos: (r) => {
      const ops = d().contratos.filter((c) => (r && c.id === r.contrato_id) || (c.ativo !== false && R.contratoAtivo(c, C.hojeIso())))
        .sort((a, b) => a.inquilino_nome.localeCompare(b.inquilino_nome, 'pt-BR'))
        .map((c) => { const i = c.imovel_id ? buscar('imoveis', c.imovel_id) : null; return [String(c.id), `${c.inquilino_nome}${i ? ` · ${i.nome}` : ''}`]; });
      return [{ nome: 'contrato_id', rotulo: 'Inquilino', tipo: 'opcao', obrig: true, opcoes: ops }, ...F.SOLICITACAO];
    },
    padrao: (q) => ({ data: C.hojeIso(), contrato_id: q.contrato || '' }),
    voltar: (r, q) => ({ inquilinos: '#/inquilinos', solicitacoes: '#/solicitacoes' }[q && q.de]
      || (r || (q && q.contrato) ? `#/contrato/${r ? r.contrato_id : q.contrato}?ir=solicitacoes` : '#/solicitacoes')),
    descricao: (dados) => `Solicitação: ${String(dados.descricao || '').slice(0, 80)}`,
    ajustar(dados) {
      if (dados.situacao === 'Concluída' && !dados.data_conclusao) dados.data_conclusao = C.hojeIso();
    },
  },
  reformas: {
    titulo: (r, q) => `Reforma / investimento - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
    campos: () => F.REFORMA,
    fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
    padrao: () => ({ data: C.hojeIso() }),
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
      return comListas(F.CONTRATO.flatMap((c) => (c.fiador ? (c.fiador === 1 && c.secao ? F.fiadoresNoCadastro(fiadores) : []) : [c]))
        .filter((c) => (r ? !c.soNovo : !c.soEditar))
        .map((c) => (c.nome === 'contrato_anterior_id' ? { ...c, opcoes: ops } : c.nome === 'imovel_id' ? { ...c, opcoes: imoveis } : c)));
    },
    // cada contrato é único: nada vem do inquilino anterior do imóvel, todas as condições são escolhidas de novo
    // a mesma pessoa em outro imóvel (q.pessoa): só os dados da pessoa vêm preenchidos
    padrao: (q) => ({ ...(q.pessoa ? R.dadosDaPessoa(buscar('contratos', q.pessoa)) : {}), ...(q.imovel ? { imovel_id: Number(q.imovel) } : {}) }),
    compacto: true,
    valores: (r) => ({ ...r, ativo: r.ativo !== false, gerar_nf: r.gerar_nf !== false, bonificacao: r.bonificacao !== false,
      conta_iptu: r.conta_iptu || (r.cobrar_iptu ? R.SITUACOES[0] : R.SITUACOES[1]), conta_seguro: r.conta_seguro || (r.cobrar_seguro === false ? R.SITUACOES[1] : R.SITUACOES[0]),
      inquilino_tipo: r.inquilino_tipo || 'Pessoa física', prazo_meses: r.prazo_meses || C.mesesDoPrazo(r.data_entrada || r.vigencia_inicio, r.vigencia_fim) || C.mesesDoPrazo(r.vigencia_inicio, r.vigencia_fim),
      aluguel_bonificado: r.bonificacao === false ? null : inicialBonificado(r),
      ...Object.fromEntries(R.fiadoresDoContrato(d(), r.id).flatMap((f, k) => F.CAMPOS_FIADOR.map((x) => [`fiador${k + 1}_${x.nome}`, f[x.nome] ?? null]))) }),
    conferir: conferirContrato,
    aviso: (r, q) => (!r && q && q.pessoa ? `Contrato novo de ${buscar('contratos', q.pessoa).inquilino_nome} para este imóvel: os dados da pessoa já vieram preenchidos. Escolha as condições deste contrato (cada contrato é único).`
      : r ? `Imóvel: ${(buscar('imoveis', r.imovel_id) || {}).nome || 'sem imóvel'} (não muda aqui; lançado errado: "Corrigir imóvel" na página do inquilino). Mudou o dia do vencimento ou a garantia? Isso exige termo aditivo: depois de salvar, registre o termo assinado em "Termos aditivos" (botão "Contrato, Vistoria, Termos e Aditivos" na página do inquilino).` : ''),
    voltar: (r, q) => (r ? `#/contrato/${r.id}` : q.imovel ? `#/imovel/${q.imovel}` : '#/inquilinos'),
    descricao: (dados, r) => dados.inquilino_nome || (r && r.inquilino_nome),
    ajustar(dados, erros, r, form, q = {}) {
      // troca de titular: garantia, aluguel, bonificação, boleto e reserva são os do contrato (travados no formulário)
      const anteriorHerdado = r ? R.contratoHerdado(d(), r) : dados.contrato_anterior_id && buscar('contratos', dados.contrato_anterior_id);
      const herdado = !!anteriorHerdado;
      // garantia nova na troca (escolha na janela "Continuar o contrato"): o novo titular presta a sua, livre
      if (!r && herdado) dados.garantia_na_troca = (memoria.continuacao && memoria.continuacao.garantia) || 'continua';
      if (r && herdado && !R.garantiaNova(r)) for (const k of CAMPOS_GARANTIA_HERDADA) dados[k] = r[k] ?? null;
      if (herdado) {
        const fonte = r || { ...anteriorHerdado, ...R.condicoesDoContrato(d(), anteriorHerdado, dados.data_entrada) };
        for (const k of CAMPOS_VALORES_HERDADOS) {
          if (['aluguel_bonificado', 'comprovante_reserva'].includes(k)) continue;
          dados[k] = ['bonificacao', 'cobranca_mes_seguinte'].includes(k) ? fonte[k] !== false : fonte[k] ?? null;
        }
      }
      // o aluguel com bonificação digitado é o do aluguel inicial (histórico): o % sai sobre ele e vale também para o aluguel corrigido
      const base = dados.aluguel_inicial;
      const bonificadoTexto = String(new FormData(form).get('aluguel_bonificado') || '').trim();
      if (dados.bonificacao && bonificadoTexto && !herdado) {
        // o aluguel bonificado digitado manda: o % é calculado sem arredondar, para o desconto bater no centavo
        let bonificado = NaN;
        try { bonificado = C.centavos(bonificadoTexto); } catch { /* inválido */ }
        if (!Number.isFinite(bonificado) || bonificado < 0 || bonificado > base) erros.aluguel_bonificado = `Informe um valor entre R$ 0,00 e ${reais(base)} (aluguel cheio)`;
        else dados.desconto_pontualidade_percentual = C.percentualPorBonificado(base, bonificado);
      }
      for (const k of ['desconto_pontualidade_percentual', 'taxa_boleto', 'multa_percentual', 'juros_mensal_percentual', 'reserva_valor', 'carencia_meses']) if (dados[k] === null) dados[k] = 0;
      if (dados.desconto_pontualidade_percentual < 0 || dados.desconto_pontualidade_percentual > 100) erros.desconto_pontualidade_percentual = 'Informe um percentual entre 0 e 100';
      // FCI: em branco (ou zero) não cobra; com o %, precisa do índice de correção
      if (dados.fci_percentual !== null && (dados.fci_percentual < 0 || dados.fci_percentual > 100)) erros.fci_percentual = 'Informe um percentual entre 0 e 100, ou deixe em branco';
      if (!(dados.fci_percentual > 0)) { dados.fci_percentual = null; dados.fci_indice = null; } else if (!dados.fci_indice) erros.fci_indice = 'Escolha o índice de correção do FCI';
      if (dados.dia_vencimento !== null && (dados.dia_vencimento < 1 || dados.dia_vencimento > 31)) erros.dia_vencimento = 'Informe um dia entre 1 e 31';
      if (dados.data_saida && dados.data_entrada && dados.data_saida < dados.data_entrada) erros.data_saida = 'A saída não pode ser antes da entrada';
      if (dados.prazo_tipo === 'Determinado') {
        if (!(dados.prazo_meses > 0)) erros.prazo_meses = 'Informe o prazo em meses, ou marque prazo indeterminado';
        // troca de titular: o prazo continua o do contrato assumido (ao editar, fica o fim já gravado: muda pela renovação)
        else if (herdado && (r ? r.vigencia_fim : R.fimDoPrazoHerdado(d(), { contrato_anterior_id: anteriorHerdado.id }))) {
          dados.vigencia_fim = r ? r.vigencia_fim : R.fimDoPrazoHerdado(d(), { contrato_anterior_id: anteriorHerdado.id });
        }
        // o prazo conta da data de vigência inicial (sem ela, da data do contrato)
        else if (dados.data_entrada || dados.vigencia_inicio) dados.vigencia_fim = C.fimDoPrazo(dados.data_entrada || dados.vigencia_inicio, dados.prazo_meses);
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
        const nome = await salvarAssinado('aditivos', salvo.id, cont.arquivo, `termo aditivo ${cont.data} troca de titular`);
        await alterar((db) => R.registrarAditivo(db, salvo.id, { data: cont.data, assunto, arquivo: nome }, login()));
        aviso('Termo aditivo da troca de titular registrado.');
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
  correcoes: {
    titulo: (r, q) => `Correção do aluguel - ${buscar('contratos', q.contrato).inquilino_nome}`,
    campos: () => comListas(F.CORRECAO),
    fixos: (r, q) => ({ contrato_id: Number(q.contrato), indice_contrato: buscar('contratos', q.contrato).indice_correcao || '' }),
    padrao: (q) => { const ind = buscar('contratos', q.contrato).indice_correcao || ''; return { indice: ind.includes('/') ? '' : ind }; },
    recalcular: (salvo) => (cb) => cb.contrato_id === salvo.contrato_id,
    destino: (salvo) => {
      const c = buscar('contratos', salvo.contrato_id);
      if (!R.temCaucao(c)) return `#/contrato/${c.id}`;
      aviso('O aluguel foi corrigido: corrija também a caução.', 'aviso');
      return `#/novo/correcoes_garantia?contrato=${c.id}`;
    },
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); return `Aluguel atual: ${reais(R.aluguelAtual(d(), c))}. Índice previsto no contrato: ${c.indice_correcao || 'não informado'}${(c.indice_correcao || '').includes('/') ? ' (escolha abaixo qual índice foi usado nesta correção)' : ''}.`; },
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    descricao: (dados, r, q) => `Correção do aluguel de ${buscar('contratos', q.contrato).inquilino_nome}`,
    ajustar(dados, erros, r, form, q) {
      const c = buscar('contratos', q.contrato);
      if (!dados.data_vigencia) return;
      const anterior = R.aluguelAtual(d(), c, C.somarDias(dados.data_vigencia, -1));
      dados.valor_anterior = anterior;
      if (dados.valor_novo === null && dados.percentual === null) erros.percentual = 'Informe o percentual ou o novo valor';
      else if (dados.valor_novo === null) dados.valor_novo = C.aplicarCorrecao(anterior, dados.percentual);
      else if (dados.percentual === null) dados.percentual = anterior ? C.percentualPorDesconto(anterior, dados.valor_novo - anterior) : 0;
    },
  },
  seguros: {
    titulo: (r, q) => { const c = buscar('contratos', r ? r.contrato_id : q.contrato); return `Seguro obrigatório - ${c.inquilino_nome}${buscar('imoveis', c.imovel_id) ? ` (${buscar('imoveis', c.imovel_id).nome})` : ''}`; },
    campos: () => F.SEGURO,
    fixos: (r, q) => (r ? {} : { contrato_id: Number(q.contrato), imovel_id: buscar('contratos', q.contrato).imovel_id }),
    conferir: conferirSeguro,
    // arquivo da apólice: pode salvar sem (confirma e fica o alerta para anexar depois); outros arquivos opcionais
    extraHtml: (r) => `<h3>Arquivos do seguro</h3><div class="formulario">
      <div><label>Arquivo da apólice</label><input type="file" name="arquivo_apolice" accept="application/pdf,image/*">
        ${r && r.arquivo_apolice ? F.arquivoGuardado('arquivo_apolice', r.arquivo_apolice) : '<small class="suave">PDF ou foto da apólice. Sem ele, o seguro é salvo e fica o alerta para anexar depois.</small>'}</div>
      <div><label>Outros arquivos (opcional)</label><input type="file" name="outros_arquivos" multiple>
        <small class="suave">Ex.: boleto do seguro, proposta, comprovante de pagamento.</small></div></div>`,
    ajustar(dados, erros, r, form) {
      const arq = form.querySelector('[name=arquivo_apolice]').files[0];
      if (dados.vigencia_inicio && dados.vigencia_fim && dados.vigencia_fim <= dados.vigencia_inicio) erros.vigencia_fim = 'O fim da vigência precisa ser depois do início';
      if (!arq && !(r && r.arquivo_apolice) && !Object.keys(erros).length) confirmarAvisos(['Sem o arquivo da apólice. O seguro fica salvo, com o alerta "Falta o arquivo da apólice" na página do inquilino e no Painel até você anexar (em "Editar" da apólice).']);
    },
    async ajustarAsync(dados, erros, r, form, q) {
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
  fiadores: {
    titulo: (r, q) => `${q.substitui ? 'Trocar fiador' : 'Fiador'} - ${buscar('contratos', r ? r.contrato_id : q.contrato).inquilino_nome}`,
    campos: (r, q) => (q && q.substitui ? F.TROCA_FIADOR : F.FIADOR),
    padrao: (q) => (q.substitui ? { data_troca: C.hojeIso() } : {}),
    ajustar(dados, erros) {
      if (dados.data_entrada && dados.data_saida && dados.data_saida < dados.data_entrada) erros.data_saida = 'O fim do vínculo não pode ser antes do início';
    },
    aviso: (r, q) => (q && q.substitui ? `Substitui ${buscar('fiadores', q.substitui).nome}, que fica guardado em "Fiadores anteriores".` : ''),
    fixos: (r, q) => (r || q.substitui ? {} : { contrato_id: Number(q.contrato) }),
    salvar(db, dados, q, r) {
      if (q.substitui) return R.trocarFiador(db, Number(q.substitui), dados, login());
      if (r) { R.atualizar(db, 'fiadores', r.id, dados, login(), `Fiador ${dados.nome}`); return R.buscar(db, 'fiadores', r.id); }
      return R.inserir(db, 'fiadores', dados, login(), `Fiador ${dados.nome}`);
    },
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}`,
    descricao: (dados) => `Fiador ${dados.nome}`,
    conferir: (dados, r) => conferirPessoa(dados, r, '', `do fiador ${dados.nome}`),
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
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); return R.garantiaDepositada(c) ? `Caução atual: ${reais(R.valorGarantia(d(), c))}${c.caucao_meses ? ` (${c.caucao_meses} aluguéis com bonificação)` : ''}.`
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
    titulo: (r, q) => `Devolução da garantia (troca de titular) - ${buscar('contratos', r ? r.contrato_id : q.contrato).inquilino_nome}`,
    campos: () => F.DEVOLUCAO_GARANTIA,
    // como no cálculo final da saída: a garantia atual e os boletos em aberto como débitos
    padrao: (q) => {
      const c = buscar('contratos', q.contrato);
      const aberto = R.cobrancasEmAberto(d(), c.id);
      return { data: C.hojeIso(), garantia_valor: R.valorGarantia(d(), c), debitos: aberto.reduce((s, cb) => s + R.totais(cb).a_pagar_sem_desconto, 0) || null,
        debitos_descricao: aberto.map((cb) => `Aluguel ${compBr(cb.competencia)} em aberto: ${reais(R.totais(cb).a_pagar_sem_desconto)}`).join('\n') };
    },
    aviso: (r, q) => {
      const c = buscar('contratos', r ? r.contrato_id : q.contrato);
      const n = R.continuadoPor(d(), c);
      return `${n ? n.inquilino_nome : 'O novo titular'} assumiu o contrato com garantia nova: a garantia de ${c.inquilino_nome} é devolvida a ${c.inquilino_nome}, corrigida pelo índice da poupança que você informar, descontados os débitos até a véspera da troca. Devolva pela conta em que foi aplicada.`;
    },
    voltar: (r, q) => `#/contrato/${r ? r.contrato_id : q.contrato}?ir=garantia`,
    descricao: (dados) => `Garantia devolvida: ${reais(dados.garantia_valor)}`,
    ajustar(dados, erros, r, form) {
      for (const k of ['indice_percentual', 'debitos']) if (!dados[k]) dados[k] = 0;
      return conferirComprovantes(COMPROVANTE_DEVOLUCAO, dados, r, form);
    },
    ajustarAsync: (dados, erros, r, form, q) => guardarComprovantes(COMPROVANTE_DEVOLUCAO, dados, form, () => pastaDoEscopo('contrato', r ? r.contrato_id : Number(q.contrato))),
    salvar: (db, dados, q, r) => R.salvarDevolucaoGarantia(db, r ? r.contrato_id : Number(q.contrato), dados, login(), r ? r.id : null),
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
    padrao: (q) => { const c = buscar('contratos', q.contrato); return { data: c.vigencia_fim || C.hojeIso(), tipo: 'Renovado com nova data de término' }; },
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); return `Aluguel atual ${reais(R.aluguelAtual(d(), c))}. Contrato ${c.prazo_tipo === 'Indeterminado' ? 'por prazo indeterminado' : `até ${dataBr(c.vigencia_fim)}`}.`; },
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    ajustar(dados, erros) {
      if (dados.tipo === 'Renovado com nova data de término' && !dados.nova_vigencia_fim) erros.nova_vigencia_fim = 'Informe a nova data de término';
      if (dados.tipo === 'Passou a prazo indeterminado') dados.nova_vigencia_fim = null;
      if (dados.tipo === 'Novo valor negociado' && !(dados.novo_valor > 0)) erros.novo_valor = 'Informe o novo valor';
    },
    salvar: (db, dados, q) => R.registrarRenovacao(db, Number(q.contrato), dados, login()),
  },
  encerramentos: {
    titulo: (r, q) => `Saída e cálculo final - ${buscar('contratos', q.contrato).inquilino_nome}`,
    // FCI: só aparece para quem tem (ou teve) o fundo de conservação
    campos: (r, q) => { const c = buscar('contratos', q.contrato); return R.temFci(c) || R.depositosFci(d(), c).length ? F.ENCERRAMENTO : F.ENCERRAMENTO.filter((x) => !x.nome.startsWith('fci_')); },
    padrao: (q) => {
      const c = buscar('contratos', q.contrato);
      const aberto = R.cobrancasEmAberto(d(), c.id);
      const lt = R.leituraDo(d(), c.id, 'Saída do inquilino') || {};
      return {
        fci_credito: R.saldoFci(d(), c).corrigido || null,
        leitura_agua: lt.agua || '', leitura_energia: lt.energia || '', leitura_gas: lt.gas || '', garantia_valor: R.valorGarantia(d(), c),
        debitos: aberto.reduce((s, cb) => s + R.totais(cb).a_pagar_sem_desconto, 0),
        debitos_descricao: aberto.map((cb) => `Aluguel ${compBr(cb.competencia)} em aberto: ${reais(R.totais(cb).a_pagar_sem_desconto)}`).join('\n'),
      };
    },
    aviso: (r, q) => { const c = buscar('contratos', q.contrato); return `Saída em ${dataBr(c.data_saida)} (mude em "Saída do inquilino"). A leitura dos relógios é a da vistoria de saída: vem preenchida e, se mudar aqui, muda lá também. Confira o boleto do último mês (proporcional aos dias). A garantia é corrigida pelo índice da poupança que você informar.`; },
    // a data de saída é a do contrato (1ª etapa, "Informar data de saída")
    fixos: (r, q) => ({ data_saida: buscar('contratos', q.contrato).data_saida }),
    voltar: (r, q) => `#/contrato/${q.contrato}`,
    ajustar(dados, erros, r, form, q) {
      const c = buscar('contratos', q.contrato);
      if (!c.data_saida) throw new Error('Informe antes a data de saída, em "Saída do inquilino".');
      for (const k of ['garantia_valor', 'indice_percentual', 'debitos', 'fci_credito', 'fci_danos']) if (!dados[k]) dados[k] = 0;
      for (const k of R.relogiosDoContrato(c)) if (!dados[`leitura_${k}`]) erros[`leitura_${k}`] = 'Informe a leitura na saída';
    },
    salvar: (db, dados, q) => R.encerrarContrato(db, Number(q.contrato), dados, login()),
  },
  avulsas: {
    titulo: (r, q) => (r ? 'Editar NF avulsa' : q.modelo === 'airbnb' ? 'Nova NF avulsa do Airbnb' : 'Nova NF avulsa'),
    campos: () => F.AVULSA.map((c) => (c.nome === 'imovel_id' ? { ...c, opcoes: ordenar(d().imoveis, 'nome').map((i) => [String(i.id), i.nome]) } : c)),
    // Airbnb: vem preenchida com os dados padrão (todos podem ser mudados aqui)
    padrao: (q) => ({ data_pagamento: C.hojeIso(), ...(q.modelo === 'airbnb' ? R.modeloAirbnb(d()) : {}) }),
    aviso: (r, q) => (!r && q.modelo === 'airbnb' ? 'Dados do Airbnb já preenchidos: confira, informe a data em que o dinheiro entrou e o valor. Pode mudar qualquer campo.' : ''),
    extraHtml: (r, q) => (!r && q.modelo === 'airbnb' ? '<p style="margin-top:12px"><label class="check" style="padding:0"><input type="checkbox" name="salvar_modelo" value="1"> Guardar a descrição, o cliente, o imóvel, o município e as observações como padrão das próximas NFs do Airbnb</label></p>' : ''),
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
  },
  usuarios: {
    admin: true,
    titulo: (r) => (r ? 'Editar usuário' : 'Novo usuário'),
    campos: () => F.USUARIO,
    voltar: () => '#/usuarios',
    descricao: (dados) => `Usuário ${dados.login}`,
    extraHtml: (r) => `<div class="formulario" style="margin-top:12px"><div><label>${r ? 'Nova senha (em branco para manter)' : 'Senha inicial *'}</label><input type="password" name="senha" autocomplete="new-password"></div></div>`,
    async ajustarAsync(dados, erros, r, form) {
      dados.login = String(dados.login || '').toLowerCase();
      const senha = String(new FormData(form).get('senha') || '');
      if (senha) {
        if (senha.length < 6) erros.login = 'A senha precisa de pelo menos 6 caracteres';
        dados.senha_sal = novoSal();
        dados.senha_hash = await resumoSenha(senha, dados.senha_sal);
      } else if (!r) erros.login = 'Informe uma senha inicial';
      if (d().usuarios.some((u) => u.login === dados.login && u.id !== (r && r.id))) erros.login = 'Já existe um usuário com este login';
      if (r && r.id === E.usuario.id && (dados.papel !== 'admin' || !dados.ativo)) erros.papel = 'Você não pode tirar o seu próprio acesso de administrador';
      if (!r) dados.criado_em = new Date().toISOString();
    },
  },
  cobrancas: {
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
      const disp = R.saldoReserva(d(), buscar('contratos', r.contrato_id), r.id);
      if (dados.reserva_utilizada > disp) {
        const outros = d().cobrancas.filter((x) => x.contrato_id === r.contrato_id && x.id !== r.id && x.reserva_utilizada > 0);
        erros.reserva_utilizada = `Saldo da reserva disponível: ${reais(disp)}${outros.length ? ` (está no boleto de ${outros.map((x) => compBr(x.competencia)).join(', ')}). Para trocar de mês, mude "Usar a reserva no aluguel de" no Editar do contrato` : ''}`;
      }
    },
  },
};

export function telaFormulario(tabela, registro, q, estado) {
  const cfg = CADASTROS[tabela];
  if (!cfg) return '<h1>Página não encontrada</h1>';
  if (!opera() || (cfg.admin && !podeUsuario('admin'))) return '<h1>Seu usuário não pode alterar este cadastro</h1>';
  const campos = cfg.campos(registro, q);
  let valores = estado ? estado.valores : F.paraFormulario(campos, registro && cfg.valores ? cfg.valores(registro) : registro);
  if (!registro && !estado) {
    const padroes = Object.fromEntries(campos.filter((c) => c.nome && c.padrao !== undefined).map((c) => [c.nome, c.padrao]));
    valores = F.paraFormulario(campos, { ...padroes, ...(cfg.padrao ? cfg.padrao(q) : {}) });
  }
  const base = cfg.base ? cfg.base(registro) : null;
  const avisoTexto = cfg.aviso ? cfg.aviso(registro, q) : '';
  return `<h1>${esc(cfg.titulo(registro, q))}</h1>${avisoTexto ? `<div class="alerta info">${esc(avisoTexto)}</div>` : ''}
    <form class="cartao" data-form="cadastro" ${base !== null && base !== undefined ? `data-base="${base}"` : ''}>
      ${F.camposHtml(campos, valores, estado ? estado.erros : {}, { compacto: !!cfg.compacto })}${cfg.extraHtml ? cfg.extraHtml(registro, q) : ''}
      <p class="acoes" style="margin-top:16px"><button>Salvar</button><a class="botao secundario" href="${cfg.voltar(registro, q)}">Voltar</a></p></form>`;
}
