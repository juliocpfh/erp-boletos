// Regras de negócio sobre o banco de dados (um objeto JSON em memória).
// Toda gravação passa por inserir/atualizar/excluir, que registram o histórico.
import * as alertas from './alertas.js';
import * as C from './calculos.js';

export const TABELAS = {
  imoveis: 'Imóvel', contratos: 'Inquilino / contrato', correcoes: 'Correção de aluguel', seguros: 'Seguro',
  iptus: 'IPTU', titularidades: 'Troca de titularidade', cobrancas: 'Boleto', recebimentos: 'Recebimento Airbnb',
  faturas: 'NF', emitentes: 'Empresa', participacoes: 'Empresa no imóvel', usuarios: 'Usuário',
  fiadores: 'Fiador', aplicacoes: 'Aplicação da garantia', correcoes_garantia: 'Correção da caução',
  renovacoes: 'Renovação / novo valor', trocas_garantia: 'Troca de garantia', leituras: 'Leitura dos relógios', encerramentos: 'Saída do inquilino', avulsas: 'NF avulsa',
  reformas: 'Reforma / investimento', solicitacoes: 'Solicitação do inquilino',
  indices_acumulados: 'Índice acumulado em 12 meses', cartas_reajuste: 'Carta de reajuste', modelos_contrato: 'Modelo de contrato', vistorias: 'Vistoria', despesas: 'Conta paga por nós', fechamentos: 'Etapa do fechamento do mês', arquivos: 'Arquivo', banco: 'Banco de dados', listas: 'Lista de opções',
};

/** Quem paga cada conta prevista no contrato. Só "por conta do inquilino" entra no boleto (IPTU e seguro). */
export const SITUACOES = ['Por conta do inquilino', 'Incluso no aluguel', 'Não tem'];

/** Listas de opções que o usuário pode editar (incluir e remover itens). */
export const LISTAS = {
  concessionarias: { nome: 'concessionárias', padrao: ['Copel', 'Sanepar', 'Supergasbras', 'Condomínio'] },
  indices: { nome: 'índices de correção', padrao: ['IGP-M', 'IPCA', 'IGP-M/IPCA (o maior)', 'INPC', 'IVAR', 'IGP-DI', 'Poupança'] },
};

export function bancoVazio() {
  const agora = new Date().toISOString();
  const d = { formato: 'imoveis-v1', revisao: 0, criado_em: agora, atualizado_em: null, atualizado_por: null,
    proxima_fatura: 1, seq: {}, historico: [], listas: {} };
  for (const t of Object.keys(TABELAS)) if (!['arquivos', 'banco', 'listas'].includes(t)) d[t] = [];
  return d;
}

/** Garante que um banco antigo tenha todas as tabelas e campos novos. */
export function normalizar(d) {
  const vazio = bancoVazio();
  for (const [k, v] of Object.entries(vazio)) if (d[k] === undefined) d[k] = v;
  for (const [k, l] of Object.entries(LISTAS)) if (!Array.isArray(d.listas[k])) d.listas[k] = [...l.padrao];
  // o anúncio passou a ser só uma descrição (o link antigo vira o texto)
  for (const i of d.imoveis) {
    if (i.anuncio_link && !i.anuncio_descricao) i.anuncio_descricao = i.anuncio_link;
    for (const k of ['anuncio_link', 'anuncio_data', 'grupo_id']) delete i[k];
    // a vistoria de entrada passou a ser do contrato: vai para o inquilino mais recente do imóvel
    if (i.vistoria_link) {
      const c = d.contratos.filter((x) => x.imovel_id === i.id).sort((a, b) => String(b.data_entrada).localeCompare(String(a.data_entrada)))[0];
      if (c && !c.vistoria_link) c.vistoria_link = i.vistoria_link;
      if (c) delete i.vistoria_link;
    }
  }
  // IPTU e seguro no contrato viraram escolha (por conta do inquilino / incluso no aluguel / não tem)
  for (const c of d.contratos) {
    if (c.conta_iptu === undefined) c.conta_iptu = c.cobrar_iptu ? SITUACOES[0] : SITUACOES[1];
    if (c.conta_seguro === undefined) c.conta_seguro = c.cobrar_seguro === false ? SITUACOES[1] : SITUACOES[0];
  }
  migrarAirbnb(d);
  // versão 1 guardava um único fiador dentro do contrato
  for (const c of d.contratos) {
    if (c.fiador_nome && !d.fiadores.some((f) => f.contrato_id === c.id)) {
      d.seq.fiadores = (d.seq.fiadores || 0) + 1;
      d.fiadores.push({ id: d.seq.fiadores, contrato_id: c.id, nome: c.fiador_nome, cpf: c.fiador_cpf || '',
        rg: c.fiador_rg || '', telefone: c.fiador_telefone || '', email: c.fiador_email || '', endereco: c.fiador_endereco || '' });
    }
    for (const k of ['fiador_nome', 'fiador_cpf', 'fiador_rg', 'fiador_telefone', 'fiador_email', 'fiador_endereco']) delete c[k];
  }
  // o seguro obrigatório era do inquilino; agora é do imóvel
  for (const s of d.seguros) {
    if (!s.imovel_id && s.contrato_id) {
      const c = d.contratos.find((x) => x.id === s.contrato_id);
      if (c) s.imovel_id = c.imovel_id;
    }
    delete s.contrato_id;
  }
  return d;
}

/**
 * Os grupos Airbnb deixaram de existir: cada recebimento vira uma NF avulsa (com as mesmas empresas e
 * percentuais do grupo) e as NFs já emitidas passam a apontar para ela. Os grupos são retirados dos imóveis.
 */
function migrarAirbnb(d) {
  const grupos = d.imoveis.filter((i) => i.tipo === 'airbnb');
  if (!grupos.length && !d.recebimentos.length) return;
  for (const r of d.recebimentos) {
    const g = d.imoveis.find((i) => i.id === r.imovel_id);
    const u = r.unidade_id ? d.imoveis.find((i) => i.id === r.unidade_id) : null;
    d.seq.avulsas = (d.seq.avulsas || Math.max(0, ...d.avulsas.map((x) => x.id))) + 1;
    const a = { id: d.seq.avulsas, data_pagamento: r.data_pagamento, valor: r.valor,
      descricao: `Airbnb${u ? ` ${u.nome}` : ''}`, imovel_id: u ? u.id : null,
      periodo_inicio: r.periodo_inicio || null, periodo_fim: r.periodo_fim || null,
      tomador_nome: r.tomador_nome, tomador_documento: r.tomador_documento || '', tomador_telefone: r.tomador_telefone || '',
      tomador_endereco: r.tomador_endereco || (u ? enderecoCompleto(u) : (g ? enderecoCompleto(g) : '')),
      municipio: (u && u.cidade) || (g && g.cidade) || '', observacoes: r.observacoes || '',
      partes: d.participacoes.filter((p) => g && p.imovel_id === g.id).map((p) => ({ emitente_id: p.emitente_id, percentual: p.percentual })) };
    d.avulsas.push(a);
    for (const f of d.faturas) if (f.origem_tipo === 'recebimento' && f.origem_id === r.id) Object.assign(f, { origem_tipo: 'avulsa', origem_id: a.id });
  }
  const ids = new Set(grupos.map((g) => g.id));
  d.participacoes = d.participacoes.filter((p) => !ids.has(p.imovel_id));
  d.imoveis = d.imoveis.filter((i) => !ids.has(i.id));
  d.historico.push({ quando: new Date().toISOString(), usuario: 'sistema', acao: 'Alteração', tabela: 'banco', registro_id: null,
    descricao: `Grupos Airbnb retirados: ${d.recebimentos.length} recebimento(s) viraram NF avulsa`, detalhes: { grupos: grupos.map((g) => g.nome).join(', ') }, imovel_id: null, contrato_id: null });
  d.recebimentos = [];
}

// --------------------------------------------------------------------------
// Listas editáveis (concessionárias, índices)
// --------------------------------------------------------------------------
export const lista = (d, nome) => d.listas[nome] || LISTAS[nome].padrao;

/** Onde um item da lista é usado (para não remover algo que está vinculado). */
export function usoDoItem(d, nome, valor) {
  const nomeImovel = (id) => (d.imoveis.find((i) => i.id === id) || {}).nome || 'imóvel excluído';
  if (nome === 'concessionarias') {
    return [...new Set(d.titularidades.filter((t) => t.concessionaria === valor).map((t) => nomeImovel(t.imovel_id)))];
  }
  const usos = d.contratos.filter((c) => c.indice_correcao === valor).map((c) => `${c.inquilino_nome}${c.imovel_id ? ` (${nomeImovel(c.imovel_id)})` : ''}`);
  for (const x of d.correcoes.filter((y) => y.indice === valor || y.indice_contrato === valor)) {
    const c = d.contratos.find((y) => y.id === x.contrato_id);
    if (c) usos.push(`correção de ${c.inquilino_nome}`);
  }
  return [...new Set(usos)];
}

export function incluirNaLista(d, nome, valor, usuario) {
  const v = String(valor || '').trim();
  if (!v) throw new Error('Digite o nome para incluir.');
  const atual = lista(d, nome);
  if (atual.some((x) => x.toLocaleLowerCase('pt-BR') === v.toLocaleLowerCase('pt-BR'))) throw new Error(`"${v}" já está na lista.`);
  d.listas[nome] = [...atual, v];
  registrar(d, usuario, 'Inclusão', 'listas', null, `"${v}" incluído na lista de ${LISTAS[nome].nome}`);
  return v;
}

export function removerDaLista(d, nome, valor, usuario) {
  const usos = usoDoItem(d, nome, valor);
  if (usos.length) throw new Error(`"${valor}" não pode ser removido porque está vinculado a: ${usos.join('; ')}.`);
  d.listas[nome] = lista(d, nome).filter((x) => x !== valor);
  registrar(d, usuario, 'Exclusão', 'listas', null, `"${valor}" removido da lista de ${LISTAS[nome].nome}`);
}

// --------------------------------------------------------------------------
// Gravação com histórico
// --------------------------------------------------------------------------
export const buscar = (d, tabela, id) => d[tabela].find((r) => r.id === Number(id));

function vinculos(d, tabela, r) {
  if (tabela === 'imoveis') return { imovel_id: r.id };
  if (tabela === 'contratos') return { imovel_id: r.imovel_id, contrato_id: r.id };
  if (r.contrato_id) {
    const c = buscar(d, 'contratos', r.contrato_id);
    return { imovel_id: c ? c.imovel_id : r.imovel_id, contrato_id: r.contrato_id };
  }
  if (tabela === 'avulsas') return { imovel_id: r.imovel_id || null, contrato_id: r.contrato_id || null };
  if (tabela === 'faturas' && r.origem_tipo === 'cobranca') {
    const cb = buscar(d, 'cobrancas', r.origem_id);
    return cb ? vinculos(d, 'cobrancas', cb) : {};
  }
  return { imovel_id: r.imovel_id || null };
}

export function registrar(d, usuario, acao, tabela, registroId, descricao, detalhes, vinc = {}, alteraDados = true) {
  const quando = new Date().toISOString();
  d.historico.push({ quando, usuario, acao, tabela, registro_id: registroId ?? null, descricao: descricao || null,
    detalhes: detalhes || null, imovel_id: vinc.imovel_id ?? null, contrato_id: vinc.contrato_id ?? null });
  if (alteraDados) {
    d.atualizado_em = quando;
    d.atualizado_por = usuario;
  }
}

const OCULTOS = new Set(['senha_hash', 'senha_sal']);
const visivel = (obj) => Object.fromEntries(Object.entries(obj)
  .filter(([k, v]) => !OCULTOS.has(k) && v !== null && v !== '' && v !== undefined));

export function inserir(d, tabela, dados, usuario, descricao) {
  d.seq[tabela] = (d.seq[tabela] || Math.max(0, ...d[tabela].map((r) => r.id))) + 1;
  const r = { id: d.seq[tabela], ...dados };
  d[tabela].push(r);
  registrar(d, usuario, 'Inclusão', tabela, r.id, descricao, visivel(dados), vinculos(d, tabela, r));
  return r;
}

export function atualizar(d, tabela, id, dados, usuario, descricao) {
  const r = buscar(d, tabela, id);
  if (!r) throw new Error(`${TABELAS[tabela]} não encontrado`);
  const mudancas = {};
  const texto = (x) => (x === undefined || x === null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x));
  for (const [k, novo] of Object.entries(dados)) {
    const velho = r[k];
    if (texto(velho) !== texto(novo)) mudancas[k] = { de: velho ?? null, para: novo ?? null };
  }
  if (Object.keys(mudancas).length) {
    Object.assign(r, dados);
    const det = Object.fromEntries(Object.entries(mudancas).filter(([k]) => !OCULTOS.has(k)));
    if (mudancas.senha_hash) det.senha = 'alterada';
    registrar(d, usuario, 'Alteração', tabela, r.id, descricao, det, vinculos(d, tabela, r));
  }
  return mudancas;
}

export function excluir(d, tabela, id, usuario, descricao) {
  const i = d[tabela].findIndex((r) => r.id === Number(id));
  if (i < 0) return;
  const [r] = d[tabela].splice(i, 1);
  registrar(d, usuario, 'Exclusão', tabela, r.id, descricao, visivel(r), vinculos(d, tabela, r));
}

// --------------------------------------------------------------------------
// Contratos
// --------------------------------------------------------------------------
export const correcoesDo = (d, contratoId) => d.correcoes.filter((c) => c.contrato_id === contratoId)
  .sort((a, b) => a.data_vigencia.localeCompare(b.data_vigencia));

export function aluguelAtual(d, contrato, dataRef = C.hojeIso()) {
  return C.aluguelVigente(contrato.aluguel_inicial, correcoesDo(d, contrato.id), dataRef);
}

export function contratoAtivo(contrato, dataRef = C.hojeIso()) {
  return contrato.ativo !== false && (!contrato.data_saida || contrato.data_saida >= dataRef);
}

/** Desconto de pontualidade do contrato (0 quando não tem bonificação). */
export const percentualBonificacao = (c) => (c.bonificacao === false ? 0 : (c.desconto_pontualidade_percentual || 0));

/** Data-base da correção anual: a informada ou, se vazia, o início da vigência. */
export const dataBaseCorrecao = (c) => c.data_base_correcao || c.vigencia_inicio || c.data_entrada;

// --------------------------------------------------------------------------
// Garantias: caução, depósito, fiadores e aplicação do valor nas empresas
// --------------------------------------------------------------------------
export const GARANTIAS = ['Caução', 'Depósito garantia', 'Fiador', 'Fiador + depósito', 'Seguro fiança', 'Sem garantia'];
export const temCaucao = (c) => c.garantia_tipo === 'Caução';
export const temDeposito = (c) => ['Depósito garantia', 'Fiador + depósito'].includes(c.garantia_tipo);
export const temFiador = (c) => ['Fiador', 'Fiador + depósito'].includes(c.garantia_tipo);
/** Fiadores atuais do contrato: sem fim de vínculo, ou com o fim ainda por vir (os substituídos ficam guardados). */
export const fiadoresDo = (d, contratoId, hoje = C.hojeIso()) => d.fiadores.filter((f) => f.contrato_id === contratoId && (!f.data_saida || f.data_saida >= hoje));
export const fiadoresAnterioresDo = (d, contratoId, hoje = C.hojeIso()) => d.fiadores.filter((f) => f.contrato_id === contratoId && f.data_saida && f.data_saida < hoje)
  .sort((a, b) => b.data_saida.localeCompare(a.data_saida));
export const trocasGarantiaDo = (d, contratoId) => d.trocas_garantia.filter((x) => x.contrato_id === contratoId)
  .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
/** Correções da caução atual (as anteriores a uma nova caução, após troca de garantia, não contam). */
const correcoesCaucaoAtual = (d, c) => correcoesGarantiaDo(d, c.id).filter((x) => x.data >= (c.caucao_data || ''));
export const correcoesGarantiaDo = (d, contratoId) => d.correcoes_garantia.filter((x) => x.contrato_id === contratoId)
  .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
export const aplicacoesDo = (d, contratoId) => d.aplicacoes.filter((x) => x.contrato_id === contratoId)
  .sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.id - b.id);

/** Valor atual da garantia em dinheiro (caução corrigida ou depósito). */
export function valorGarantia(d, c) {
  if (temCaucao(c)) {
    const cs = correcoesCaucaoAtual(d, c);
    return cs.length ? cs[cs.length - 1].valor_novo : (c.caucao_valor || 0);
  }
  if (temDeposito(c)) return c.deposito_valor || 0;
  return 0;
}

/** Caução sugerida: número de aluguéis × aluguel atual com bonificação. */
export function caucaoSugerida(d, c, dataRef = C.hojeIso()) {
  if (!(c.caucao_meses > 0)) return null;
  const aluguel = aluguelAtual(d, c, dataRef);
  return c.caucao_meses * (aluguel - C.descontoPorPercentual(aluguel, percentualBonificacao(c)));
}

/** Onde a garantia foi aplicada (em qualquer empresa, sem divisão obrigatória) e quanto falta aplicar. */
export function situacaoAplicacao(d, c) {
  const total = valorGarantia(d, c);
  const aplicado = new Map();
  for (const a of aplicacoesDo(d, c.id)) aplicado.set(a.emitente_id, (aplicado.get(a.emitente_id) || 0) + a.valor);
  const linhas = [...aplicado].map(([id, valor]) => ({ emitente: d.emitentes.find((e) => e.id === id) || { id, nome: 'Empresa excluída' }, aplicado: valor }));
  const soma = linhas.reduce((s, l) => s + l.aplicado, 0);
  return { total, linhas, soma, falta: total - soma, ok: total > 0 && soma >= total };
}

export function competenciaReserva(contrato) {
  if (!(contrato.reserva_valor > 0)) return null;
  return contrato.reserva_competencia || C.competenciaDe(contrato.data_entrada);
}

export function saldoReserva(d, contrato, ignorarCobranca = null) {
  const usado = d.cobrancas.filter((cb) => cb.contrato_id === contrato.id && cb.id !== ignorarCobranca)
    .reduce((s, cb) => s + (cb.reserva_utilizada || 0), 0);
  return Math.max((contrato.reserva_valor || 0) - usado, 0);
}

function parcelasDoMes(lista, comp, rotulo) {
  let total = 0;
  const rotulos = [];
  for (const p of lista) {
    const [n, v] = C.parcelaNaCompetencia(p.valor_total, p.num_parcelas, p.primeira_competencia, comp);
    if (n) {
      total += p.valor_parcela > 0 ? p.valor_parcela : v;
      rotulos.push(`${rotulo(p)} parc. ${n}/${p.num_parcelas}`);
    }
  }
  return [total, rotulos.join('; ')];
}

export const segurosDoImovel = (d, imovelId) => d.seguros.filter((s) => imovelId && s.imovel_id === imovelId);

// --------------------------------------------------------------------------
// Carência de aluguel
// --------------------------------------------------------------------------
/** [primeira, última] competência da carência, ou null. */
export function periodoCarencia(c) {
  if (!(c.carencia_meses > 0) || !(c.carencia_inicio || c.data_entrada)) return null;
  const ini = c.carencia_inicio || C.competenciaDe(c.data_entrada);
  return [ini, C.somarMeses(ini, c.carencia_meses - 1)];
}

export function emCarencia(c, comp) {
  const p = periodoCarencia(c);
  return !!p && comp >= p[0] && comp <= p[1];
}

// --------------------------------------------------------------------------
// IPTU: quanto cobrar do inquilino e controle do que o proprietário paga
// --------------------------------------------------------------------------
export const COBRANCA_IPTU_QUITADO = ['Parcelas normais nos meses em que ocupar', 'Proporcional: 1/12 do valor por mês ocupado no ano', 'Não cobrar do inquilino'];

/** Valores das parcelas do IPTU parcelado (o que é repassado ao inquilino). */
const valoresIptu = (p) => (p.valor_parcela > 0 ? Array(p.num_parcelas).fill(p.valor_parcela) : C.parcelas(p.valor_total, p.num_parcelas));
/** Vencimento da parcela n na prefeitura (as seguintes vencem no mesmo dia dos meses seguintes). */
const vencimentoParcela = (p, n) => (p.vencimento_primeira ? C.somarMesesData(p.vencimento_primeira, n - 1) : null);

/** Mês ("AAAA-MM") em que vence o boleto do inquilino com a parcela n: o informado para a 1ª, depois um por mês. */
export const mesBoletoDaParcela = (p, n) => (p.primeiro_vencimento_boleto ? C.somarMeses(p.primeiro_vencimento_boleto, n - 1) : null);

/**
 * Competência (aluguel de) do inquilino em que a parcela n entra: a do boleto que vence no mês informado.
 * Para quem paga o aluguel no mês seguinte ao de uso, é o mês anterior. Independe do vencimento na prefeitura,
 * que muda conforme a entrega do carnê. IPTU antigo usa o "cobrar 1ª parcela no aluguel de".
 */
export function competenciaDaParcela(p, n, c = {}) {
  const mes = mesBoletoDaParcela(p, n);
  if (mes) return c.cobranca_mes_seguinte === false ? mes : C.somarMeses(mes, -1);
  return p.primeira_competencia ? C.somarMeses(p.primeira_competencia, n - 1) : null;
}

/**
 * Parcela do IPTU que entra no boleto do inquilino na competência: [número, valor] ou [null, 0].
 * O inquilino paga sempre o valor parcelado, mesmo quando o proprietário quitou à vista com desconto
 * (o proprietário financiou o inquilino; a diferença fica com ele).
 */
export function iptuNaCompetencia(p, comp, c = {}) {
  if (p.pago_avista && p.cobranca_inquilino === COBRANCA_IPTU_QUITADO[2]) return [null, 0];
  if (p.pago_avista && p.cobranca_inquilino === COBRANCA_IPTU_QUITADO[1]) {
    if (Number(comp.slice(0, 4)) !== Number(p.ano)) return [null, 0];
    const mes = Number(comp.slice(5, 7));
    return [mes, C.parcelas(p.valor_total, 12)[mes - 1]];
  }
  const valores = valoresIptu(p);
  for (let n = 1; n <= valores.length; n += 1) if (competenciaDaParcela(p, n, c) === comp) return [n, valores[n - 1]];
  return [null, 0];
}

/** Inquilino que paga a parcela n no boleto (e em qual competência), ou null quando fica com o proprietário. */
function inquilinoDaParcela(d, p, n) {
  for (const c of d.contratos.filter((x) => x.imovel_id === p.imovel_id && x.ativo !== false && x.cobrar_iptu)) {
    const comp = competenciaDaParcela(p, n, c);
    if (comp && C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0) return { contrato: c, comp };
  }
  return null;
}

/**
 * Parcelas do IPTU na prefeitura, com quem arca com cada uma (inquilino no boleto ou proprietário, quando o
 * imóvel está vazio ou o IPTU não é cobrado) e se o proprietário já pagou.
 * Quitado à vista: uma linha só (cota única, com o valor pago à vista).
 */
export function parcelasIptu(d, p) {
  if (p.pago_avista) {
    return [{ n: 0, rotulo: 'Cota única', comp: null, valor: p.valor_avista || p.valor_total,
      vencimento: p.vencimento_primeira || null, proprietario: true, paga: p.data_quitacao || null }];
  }
  return valoresIptu(p).map((valor, i) => {
    const quem = inquilinoDaParcela(d, p, i + 1);
    return { n: i + 1, rotulo: `${i + 1}ª`, comp: quem ? quem.comp : null, mesBoleto: mesBoletoDaParcela(p, i + 1), valor, inquilino: quem ? quem.contrato : null,
      vencimento: vencimentoParcela(p, i + 1), proprietario: !quem, paga: (p.pagas || {})[i + 1] || null };
  });
}

/** Alertas de IPTU que o proprietário precisa pagar (imóvel vazio ou IPTU não cobrado do inquilino). */
export function alertasIptu(d, hoje = C.hojeIso()) {
  const lista = [];
  const ano = Number(hoje.slice(0, 4));
  for (const p of d.iptus.filter((x) => x.ano >= ano - 1)) {
    const i = d.imoveis.find((x) => x.id === p.imovel_id);
    if (!i) continue;
    for (const pc of parcelasIptu(d, p)) {
      if (!pc.proprietario || pc.paga) continue;
      const venc = pc.vencimento || `${mesBoletoDaParcela(p, Math.max(pc.n, 1)) || (p.primeira_competencia ? C.somarMeses(p.primeira_competencia, Math.max(pc.n, 1)) : `${p.ano}-02`)}-10`;
      const faltam = C.diasEntre(hoje, venc);
      if (faltam > 15) continue;
      lista.push({ nivel: faltam < 0 ? 'perigo' : 'aviso', tipo: 'IPTU do proprietário', imovel_id: i.id, imovel: i.nome, inquilino: '', ancora: 'iptu',
        texto: `IPTU ${p.ano} ${pc.rotulo} parcela de ${C.reais(pc.valor)} ${faltam < 0 ? `venceu em ${C.dataBr(venc)}` : `vence em ${C.dataBr(venc)}`}${pc.vencimento ? '' : ' (vencimento estimado)'}. Imóvel sem inquilino pagando o IPTU: pagamento por conta do proprietário.` });
    }
  }
  return lista;
}

/** Marca (ou desmarca, com data vazia) a parcela do IPTU paga pelo proprietário. n = 0: cota única. */
export function marcarIptuPago(d, iptuId, n, data, usuario) {
  const p = buscar(d, 'iptus', iptuId);
  if (Number(n) === 0) {
    atualizar(d, 'iptus', p.id, { data_quitacao: data || null }, usuario, data ? `IPTU ${p.ano} quitado em ${C.dataBr(data)}` : `IPTU ${p.ano}: quitação desfeita`);
    return;
  }
  const pagas = { ...(p.pagas || {}) };
  if (data) pagas[n] = data; else delete pagas[n];
  atualizar(d, 'iptus', p.id, { pagas }, usuario, data ? `IPTU ${p.ano} ${n}ª parcela paga pelo proprietário em ${C.dataBr(data)}` : `IPTU ${p.ano} ${n}ª parcela: pagamento desfeito`);
}

/** O seguro do imóvel entra na cobrança do inquilino que está no imóvel no mês (o mais recente, se trocou no meio do mês). */
function pagaSeguroNoMes(d, contrato, comp) {
  const ocupando = d.contratos.filter((c) => c.imovel_id === contrato.imovel_id && c.ativo !== false && C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0);
  const ultimo = ocupando.sort((a, b) => b.data_entrada.localeCompare(a.data_entrada) || b.id - a.id)[0];
  return ultimo ? ultimo.id === contrato.id : true;
}

/** Calcula (sem gravar) a cobrança de um contrato numa competência. */
export function montarCobranca(d, contrato, comp, ignorarCobranca = null) {
  const dias = C.diasOcupados(comp, contrato.data_entrada, contrato.data_saida);
  if (dias === 0) return null;
  const diasMes = C.diasNoMes(comp);
  const carencia = emCarencia(contrato, comp);
  const cobra = (item) => !carencia || contrato[`carencia_cobrar_${item}`];
  let iptu = 0;
  const iptuRots = [];
  if (contrato.cobrar_iptu && cobra('iptu')) {
    for (const p of d.iptus.filter((i) => i.imovel_id === contrato.imovel_id)) {
      const [n, v] = iptuNaCompetencia(p, comp, contrato);
      if (n) {
        // no mês de entrada ou saída, o IPTU também é proporcional aos dias, como o aluguel
        iptu += C.aluguelProporcional(v, dias, diasMes);
        iptuRots.push(`${p.pago_avista && p.cobranca_inquilino === COBRANCA_IPTU_QUITADO[1] ? `IPTU ${p.ano} 1/12 (${C.compBr(comp)})` : `IPTU ${p.ano} parc. ${n}/${p.num_parcelas}`}${dias < diasMes ? ` proporcional ${dias}/${diasMes} dias de ${C.reais(v)}` : ''}`);
      }
    }
  }
  const [seguro, seguroRot] = contrato.cobrar_seguro !== false && cobra('seguro')
    ? parcelasDoMes(pagaSeguroNoMes(d, contrato, comp) ? segurosDoImovel(d, contrato.imovel_id) : [], comp,
      (s) => `Seguro${s.seguradora ? ` ${s.seguradora}` : ''}`)
    : [0, ''];
  const alvo = competenciaReserva(contrato);
  const reserva = alvo && comp >= alvo ? saldoReserva(d, contrato, ignorarCobranca) : 0;
  const r = C.calcularCobranca({
    competencia: comp, aluguelMensal: carencia ? 0 : aluguelAtual(d, contrato, `${comp}-01`),
    entrada: contrato.data_entrada, saida: contrato.data_saida,
    descontoPercentual: percentualBonificacao(contrato), iptu, seguro,
    taxaBoleto: cobra('taxa') ? contrato.taxa_boleto || 0 : 0, reservaDisponivel: reserva,
  });
  return {
    contrato_id: contrato.id, competencia: comp,
    vencimento: C.vencimentoDaCompetencia(comp, contrato.dia_vencimento || 10, contrato.cobranca_mes_seguinte !== false),
    dias_cobrados: r.dias_cobrados, dias_mes: r.dias_mes, aluguel_mensal: r.aluguel_mensal,
    aluguel: r.aluguel, desconto: r.desconto, iptu: r.iptu, iptu_parcela: iptuRots.join('; '), seguro: r.seguro,
    seguro_parcela: seguroRot, taxa_boleto: r.taxa_boleto, outros: 0, outros_descricao: '',
    reserva_utilizada: r.reserva_utilizada, carencia,
    multa_percentual: contrato.multa_percentual || 0, juros_mensal_percentual: contrato.juros_mensal_percentual || 0,
    situacao: carencia && r.a_pagar_pontual <= 0 ? 'Carência' : 'Em aberto', data_pagamento: null, valor_pago: null, dias_atraso: null, multa: null, juros: null,
    valor_nf: null,
  };
}

export function gerarCobrancas(d, comp, usuario) {
  let geradas = 0;
  let existentes = 0;
  for (const contrato of [...d.contratos]) {
    if (contrato.ativo === false || !contrato.imovel_id) continue;
    if (d.cobrancas.some((cb) => cb.contrato_id === contrato.id && cb.competencia === comp)) {
      existentes += 1;
      continue;
    }
    const dados = montarCobranca(d, contrato, comp);
    if (dados) {
      inserir(d, 'cobrancas', dados, usuario, `Boleto ${C.compBr(comp)} gerado para ${contrato.inquilino_nome}`);
      geradas += 1;
    }
  }
  return { geradas, existentes };
}

/** Campos que o recálculo atualiza (o ajuste do mês, as observações e o vencimento alterado à mão ficam). */
const CAMPOS_RECALCULO = ['dias_cobrados', 'dias_mes', 'aluguel_mensal', 'aluguel', 'desconto', 'iptu', 'iptu_parcela', 'seguro',
  'seguro_parcela', 'taxa_boleto', 'reserva_utilizada', 'carencia', 'multa_percentual', 'juros_mensal_percentual', 'situacao'];

/**
 * Recalcula os boletos em aberto depois de mudar o contrato, o IPTU ou o seguro, para que o boleto sempre bata
 * com o cadastro. Boleto alterado à mão ("Alterar valores") fica como está. Devolve quantos mudaram.
 */
export function recalcularCobrancas(d, filtro, usuario) {
  let n = 0;
  const lista = d.cobrancas.filter((cb) => !cb.data_pagamento && !cb.editado_manual && filtro(cb))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));
  for (const cb of lista) {
    const c = buscar(d, 'contratos', cb.contrato_id);
    const novo = c && montarCobranca(d, c, cb.competencia, cb.id);
    if (!novo) continue;
    const dados = Object.fromEntries(CAMPOS_RECALCULO.map((k) => [k, novo[k]]));
    if (Object.keys(atualizar(d, 'cobrancas', cb.id, dados, usuario, `Boleto ${C.compBr(cb.competencia)} recalculado pelo cadastro`)).length) n += 1;
  }
  return n;
}

export const totais = (cb) => C.totaisCobranca(cb, cb.reserva_utilizada || 0);

/**
 * Confirma o pagamento. ``dataContabil`` é o dia em que o dinheiro entrou na conta: é a data de emissão da NF
 * e a ordem da numeração (pode ser alguns dias depois do pagamento).
 * ``pagouEmDia``: o inquilino pagou até o vencimento, só a compensação foi depois: sem multa e juros, com desconto.
 * ``dataPagou``: dia em que o inquilino pagou, quando atrasou (multa e juros até esse dia). Em branco: a data contábil.
 * Atraso de verdade: o banco já cobra multa e juros no próprio boleto, e a NF sai com esse valor a mais.
 */
export function registrarPagamento(d, cobrancaId, dataContabil, valorPago, usuario, { pagouEmDia = false, dataPagou = null } = {}) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  if (faturasDe(d, 'cobranca', cb.id).length) {
    throw new Error('Este boleto já tem NF emitida. Desfaça o pagamento antes de alterar.');
  }
  if (dataPagou && dataPagou > dataContabil) throw new Error('O dia em que pagou não pode ser depois da data contábil.');
  const r = C.liquidar(cb, pagouEmDia ? cb.vencimento : (dataPagou || dataContabil));
  const compensadoDepois = pagouEmDia && dataContabil > cb.vencimento;
  atualizar(d, 'cobrancas', cb.id, {
    data_pagamento: dataContabil, data_pagou: pagouEmDia ? null : (dataPagou || null), valor_pago: valorPago ?? r.valor_devido,
    dias_atraso: r.dias_atraso, multa: r.multa, juros: r.juros, valor_nf: r.valor_nf, pagou_em_dia: compensadoDepois,
    situacao: r.pontual ? 'Paga em dia' : 'Paga com atraso',
  }, usuario, compensadoDepois ? `Pagamento confirmado (pagou em dia, entrou em ${C.dataBr(dataContabil)})` : 'Pagamento confirmado');
  return r;
}

export function estornarPagamento(d, cobrancaId, usuario) {
  cancelarFaturas(d, 'cobranca', cobrancaId, usuario);
  atualizar(d, 'cobrancas', cobrancaId, { data_pagamento: null, data_pagou: null, valor_pago: null, dias_atraso: null, multa: null,
    juros: null, valor_nf: null, pagou_em_dia: false, situacao: 'Em aberto' }, usuario, 'Pagamento desfeito');
}

// --------------------------------------------------------------------------
// Faturas: numeração contínua na ordem em que o dinheiro entrou
// --------------------------------------------------------------------------
export const faturasDe = (d, tipo, id, soValidas = true) => d.faturas
  .filter((f) => f.origem_tipo === tipo && f.origem_id === id && (!soValidas || f.situacao === 'Emitida'))
  .sort((a, b) => a.id - b.id);

export const participacoesDo = (d, imovelId) => d.participacoes.filter((p) => p.imovel_id === imovelId);

export function cancelarFaturas(d, tipo, id, usuario) {
  for (const f of faturasDe(d, tipo, id)) {
    atualizar(d, 'faturas', f.id, { situacao: 'Cancelada' }, usuario, `NF nº ${numeroFatura(f.numero)} cancelada`);
  }
}

export const numeroFatura = (n) => String(n).padStart(4, '0');

/** O inquilino precisa de NF? (há inquilinos para quem só se controla o pagamento) */
export const geraNf = (c) => !c || c.gerar_nf !== false;

/** Dados que vêm preenchidos na NF avulsa do Airbnb (o usuário pode mudar e guardar como novo padrão). */
export const MODELO_AIRBNB = { descricao: 'AirBnb', tomador_nome: 'CONSUMIDOR NÃO IDENTIFICADO', tomador_documento: '000.000.000-00',
  tomador_telefone: '-', tomador_endereco: '-', observacoes_nf: 'AirBnb' };
export const CAMPOS_MODELO_AIRBNB = [...Object.keys(MODELO_AIRBNB), 'municipio', 'imovel_id'];
export const modeloAirbnb = (d) => ({ ...MODELO_AIRBNB, ...(d.modelo_airbnb || {}) });

/** Imóvel ocupado só por inquilino(s) de boleto de controle: não emite NF, as empresas não se aplicam. */
export function imovelSoControle(d, imovelId, hoje = C.hojeIso()) {
  const atuais = d.contratos.filter((c) => c.imovel_id === imovelId && c.ativo !== false && contratoAtivo(c, hoje));
  return atuais.length > 0 && atuais.every((c) => !geraNf(c));
}

/** Cobranças pagas e NFs avulsas que ainda não têm NF, na ordem do pagamento. */
export function pendentesDeFatura(d) {
  const lista = [];
  for (const cb of d.cobrancas) {
    if (!cb.data_pagamento || !(cb.valor_nf > 0) || faturasDe(d, 'cobranca', cb.id).length) continue;
    if (!geraNf(buscar(d, 'contratos', cb.contrato_id))) continue;
    lista.push({ tipo: 'cobranca', registro: cb, data: cb.data_pagamento });
  }
  for (const r of d.avulsas) {
    if (!faturasDe(d, 'avulsa', r.id).length) lista.push({ tipo: 'avulsa', registro: r, data: r.data_pagamento });
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data) || a.tipo.localeCompare(b.tipo) || a.registro.id - b.registro.id);
}

export function ultimaFatura(d) {
  return d.faturas.reduce((m, f) => (!m || f.numero > m.numero ? f : m), null);
}

/** Dados da fatura de uma cobrança ou recebimento: imóvel das empresas, tomador, período e valor. */
export function baseDaFatura(d, tipo, registro) {
  if (tipo === 'cobranca') {
    const contrato = buscar(d, 'contratos', registro.contrato_id);
    const imovel = buscar(d, 'imoveis', contrato.imovel_id);
    const [ini, fim] = C.periodoServico(registro.competencia, contrato.data_entrada, contrato.data_saida);
    return {
      imovel, valor: registro.valor_nf, periodo_inicio: ini, periodo_fim: fim,
      descricao: `${contrato.inquilino_nome} · ${imovel.nome} · ${C.compBr(registro.competencia)}`, observacoes: registro.observacoes_nf || '',
      tomador: { nome: contrato.inquilino_nome, documento: contrato.inquilino_cpf || '',
        telefone: contrato.inquilino_telefone || '', endereco: enderecoCompleto(imovel) },
      partes: participacoesDo(d, imovel.id), origem: `no imóvel "${imovel.nome}"`,
    };
  }
  if (tipo === 'avulsa') {
    const imovel = registro.imovel_id ? buscar(d, 'imoveis', registro.imovel_id) : null;
    const partes = registro.partes && registro.partes.length ? registro.partes
      : (imovel ? participacoesDo(d, imovel.id) : d.emitentes.filter((e) => e.ativo)
        .map((e, _, l) => ({ emitente_id: e.id, percentual: 100 / l.length })));
    return {
      imovel, valor: registro.valor, partes, origem: 'na NF avulsa',
      periodo_inicio: registro.periodo_inicio || registro.data_pagamento,
      periodo_fim: registro.periodo_fim || registro.data_pagamento,
      descricao: `Avulsa · ${registro.tomador_nome}${registro.descricao ? ` · ${registro.descricao}` : ''}`, observacoes: registro.observacoes_nf || '',
      municipio: registro.municipio || (imovel && imovel.cidade) || '',
      tomador: { nome: registro.tomador_nome, documento: registro.tomador_documento || '',
        telefone: registro.tomador_telefone || '', endereco: registro.tomador_endereco || (imovel ? enderecoCompleto(imovel) : '') },
    };
  }
  throw new Error(`Origem de NF desconhecida: ${tipo}`);
}

/** Imóvel de uma NF emitida (para o nome do PDF), ou null. */
export function imovelDaFatura(d, f) {
  if (f.origem_tipo === 'cobranca') {
    const cb = buscar(d, 'cobrancas', f.origem_id);
    const c = cb && buscar(d, 'contratos', cb.contrato_id);
    return (c && buscar(d, 'imoveis', c.imovel_id)) || null;
  }
  const a = f.origem_tipo === 'avulsa' ? buscar(d, 'avulsas', f.origem_id) : null;
  return (a && a.imovel_id && buscar(d, 'imoveis', a.imovel_id)) || null;
}

export function enderecoCompleto(imovel) {
  return [imovel.endereco, imovel.complemento].filter(Boolean).join(', ');
}

function problemaDaFatura(d, base) {
  const partes = base.partes;
  if (!partes.length) return `Defina ${base.origem} quais empresas emitem a NF.`;
  const soma = partes.reduce((s, p) => s + p.percentual, 0);
  if (Math.abs(soma - 100) > 1e-6) return `Os percentuais das empresas ${base.origem} somam ${soma}%, e precisam somar 100%.`;
  if (!(base.valor > 0)) return `Valor da NF zerado em ${base.descricao}.`;
  return null;
}

/**
 * Numera as faturas pendentes em ordem de data de pagamento, continuando a última numeração.
 * Cada pagamento recebe um número; cada empresa do imóvel recebe uma fatura com esse número e a sua parte.
 * A data de emissão é a data do pagamento. Se algum pagamento é anterior à última fatura já emitida,
 * nada é feito sem ``forcar`` (para não bagunçar a sequência).
 */
export function numerarFaturas(d, usuario, { forcar = false, ate = null } = {}) {
  let pendentes = pendentesDeFatura(d);
  if (ate) pendentes = pendentes.filter((p) => p.data <= ate);
  const ultima = ultimaFatura(d);
  const foraDeOrdem = ultima ? pendentes.filter((p) => p.data < ultima.emissao) : [];
  if (foraDeOrdem.length && !forcar) return { numeradas: [], foraDeOrdem, problema: null, ultima };
  const numeradas = [];
  const lote = (d.ultimo_lote || 0) + 1; // cada clique em "Numerar" é um ciclo, que pode ser desfeito inteiro
  for (const p of pendentes) {
    const base = baseDaFatura(d, p.tipo, p.registro);
    const problema = problemaDaFatura(d, base);
    if (problema) return { numeradas, foraDeOrdem: [], problema, ultima };
    const numero = d.proxima_fatura;
    const { partes } = base;
    const valores = C.dividir(base.valor, partes.map((x) => x.percentual));
    partes.forEach((parte, i) => {
      const e = buscar(d, 'emitentes', parte.emitente_id);
      inserir(d, 'faturas', {
        numero, emissao: p.data, origem_tipo: p.tipo, origem_id: p.registro.id, emitente_id: e.id,
        percentual: parte.percentual, valor: valores[i], periodo_inicio: base.periodo_inicio,
        periodo_fim: base.periodo_fim, municipio: base.municipio || e.municipio || (base.imovel && base.imovel.cidade) || '',
        tomador_nome: base.tomador.nome, tomador_documento: base.tomador.documento,
        tomador_telefone: base.tomador.telefone, tomador_endereco: base.tomador.endereco, observacoes: base.observacoes || '', situacao: 'Emitida', lote,
      }, usuario, `NF nº ${numeroFatura(numero)} · ${e.nome} · ${base.descricao}`);
    });
    d.proxima_fatura = numero + 1;
    d.ultimo_lote = lote;
    numeradas.push({ numero, ...p, descricao: base.descricao });
  }
  return { numeradas, foraDeOrdem: [], problema: null, ultima };
}

/**
 * NF já emitida fora do sistema: registra o número (e a data de emissão) para um pagamento da fila, dividido entre
 * as empresas como na numeração normal, sem gastar um número novo. Se o número passar do próximo da sequência,
 * a sequência continua a partir dele.
 */
export function registrarNfExterna(d, tipo, id, numero, emissao, usuario) {
  const n = Number(numero);
  if (!Number.isInteger(n) || n < 1) throw new Error('Informe o número da NF.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(emissao || ''))) throw new Error('Informe a data de emissão da NF.');
  if (d.faturas.some((f) => f.numero === n && f.situacao === 'Emitida')) throw new Error(`Já existe NF nº ${numeroFatura(n)} emitida no sistema.`);
  const registro = buscar(d, tipo === 'cobranca' ? 'cobrancas' : 'avulsas', id);
  if (!registro) throw new Error('Pagamento não encontrado.');
  if (faturasDe(d, tipo, registro.id).length) throw new Error('Este pagamento já tem NF.');
  if (tipo === 'cobranca' && !registro.data_pagamento) throw new Error('Confirme o pagamento antes.');
  const base = baseDaFatura(d, tipo, registro);
  const problema = problemaDaFatura(d, base);
  if (problema) throw new Error(problema);
  const valores = C.dividir(base.valor, base.partes.map((x) => x.percentual));
  base.partes.forEach((parte, i) => {
    const e = buscar(d, 'emitentes', parte.emitente_id);
    inserir(d, 'faturas', {
      numero: n, emissao, origem_tipo: tipo, origem_id: registro.id, emitente_id: e.id, percentual: parte.percentual, valor: valores[i],
      periodo_inicio: base.periodo_inicio, periodo_fim: base.periodo_fim, municipio: base.municipio || e.municipio || (base.imovel && base.imovel.cidade) || '',
      tomador_nome: base.tomador.nome, tomador_documento: base.tomador.documento, tomador_telefone: base.tomador.telefone,
      tomador_endereco: base.tomador.endereco, observacoes: base.observacoes || '', situacao: 'Emitida', externa: true,
    }, usuario, `NF nº ${numeroFatura(n)} emitida fora do sistema · ${e.nome} · ${base.descricao}`);
  });
  if (n >= d.proxima_fatura) {
    registrar(d, usuario, 'Alteração', 'faturas', null, 'Próximo número de NF após NF emitida fora do sistema', { proxima_fatura: { de: d.proxima_fatura, para: n + 1 } });
    d.proxima_fatura = n + 1;
  }
  return n;
}

/** Cancela as NFs de um número (o pagamento volta para a fila e recebe um número novo). O número não é reaproveitado. */
export function cancelarNumero(d, numero, usuario) {
  const fs = d.faturas.filter((f) => f.numero === Number(numero) && f.situacao === 'Emitida');
  if (!fs.length) throw new Error('NF não encontrada ou já cancelada.');
  for (const f of fs) atualizar(d, 'faturas', f.id, { situacao: 'Cancelada' }, usuario, `NF nº ${numeroFatura(f.numero)} cancelada`);
  return fs.length;
}

/** Apaga da lista as NFs canceladas de um número (fica só o registro no histórico de alterações). */
export function apagarCanceladas(d, numero, usuario) {
  const fs = d.faturas.filter((f) => f.numero === Number(numero));
  if (!fs.length) throw new Error('NF não encontrada.');
  if (fs.some((f) => f.situacao !== 'Cancelada')) throw new Error('Só é possível apagar NF cancelada. Cancele antes.');
  for (const f of fs) excluir(d, 'faturas', f.id, usuario, `NF nº ${numeroFatura(f.numero)} cancelada apagada da lista`);
  return fs.length;
}

/** Última numeração (último clique em "Numerar") que ainda pode ser desfeita: { lote, de, ate, qtd, emissao }. */
export function ultimoCicloDeNumeracao(d) {
  const comLote = d.faturas.filter((f) => f.lote);
  if (!comLote.length) return null;
  const lote = Math.max(...comLote.map((f) => f.lote));
  const fs = comLote.filter((f) => f.lote === lote);
  const nums = [...new Set(fs.map((f) => f.numero))].sort((a, b) => a - b);
  return { lote, de: nums[0], ate: nums.at(-1), qtd: nums.length, emissoes: [fs.map((f) => f.emissao).sort()[0], fs.map((f) => f.emissao).sort().at(-1)] };
}

/**
 * Volta a última numeração inteira: as NFs daquele ciclo saem da lista (ficam no Histórico), os pagamentos voltam
 * para a fila com tudo o que foi preenchido (observações, dados do cliente vêm do cadastro) e o próximo número volta
 * a ser o primeiro do ciclo. Assim dá para corrigir, incluir um pagamento de data intermediária e numerar de novo.
 * Pode repetir para voltar ciclos anteriores.
 */
export function desfazerUltimaNumeracao(d, usuario) {
  const ciclo = ultimoCicloDeNumeracao(d);
  if (!ciclo) throw new Error('Não há numeração para desfazer.');
  const fs = d.faturas.filter((f) => f.lote === ciclo.lote);
  if (d.faturas.some((f) => f.lote !== ciclo.lote && f.numero >= ciclo.de)) {
    throw new Error(`Há NFs de outra numeração com número ${numeroFatura(ciclo.de)} ou maior. Use "a partir do nº".`);
  }
  for (const f of fs) excluir(d, 'faturas', f.id, usuario, `NF nº ${numeroFatura(f.numero)} desfeita para numerar de novo`);
  registrar(d, usuario, 'Alteração', 'faturas', null, `Numeração desfeita: nº ${numeroFatura(ciclo.de)} a ${numeroFatura(ciclo.ate)}`, { proxima_fatura: { de: d.proxima_fatura, para: ciclo.de } });
  d.proxima_fatura = ciclo.de;
  return ciclo;
}

/**
 * Desfaz a numeração a partir de um número: apaga todas as NFs com número igual ou maior (emitidas ou canceladas),
 * os pagamentos voltam para a fila e o próximo número volta a ser este. Serve para corrigir e numerar de novo.
 */
export function desfazerNumeracao(d, aPartirDe, usuario) {
  const n = Number(aPartirDe);
  if (!Number.isInteger(n) || n < 1) throw new Error('Número inválido.');
  const fs = d.faturas.filter((f) => f.numero >= n);
  if (!fs.length) throw new Error(`Não há NF com número ${numeroFatura(n)} ou maior.`);
  for (const f of fs) excluir(d, 'faturas', f.id, usuario, `NF nº ${numeroFatura(f.numero)} desfeita para numerar de novo`);
  registrar(d, usuario, 'Alteração', 'faturas', null, `Numeração desfeita a partir do nº ${numeroFatura(n)}`, { proxima_fatura: { de: d.proxima_fatura, para: n } });
  d.proxima_fatura = n;
  return new Set(fs.map((f) => f.numero)).size;
}

// --------------------------------------------------------------------------
// Alertas
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// Renovação, novo valor negociado e saída do inquilino
// --------------------------------------------------------------------------
export const TIPOS_RENOVACAO = ['Renovado com nova data de término', 'Passou a prazo indeterminado', 'Novo valor negociado'];

/** Registra renovação / repactuação e aplica no contrato (nova data, prazo indeterminado, novo aluguel). */
export function registrarRenovacao(d, contratoId, dados, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const r = inserir(d, 'renovacoes', { contrato_id: c.id, ...dados }, usuario, dados.tipo);
  const mud = {};
  if (dados.tipo === 'Passou a prazo indeterminado') mud.prazo_tipo = 'Indeterminado';
  if (dados.nova_vigencia_fim) Object.assign(mud, { vigencia_fim: dados.nova_vigencia_fim, prazo_tipo: 'Determinado' });
  if (Object.keys(mud).length) atualizar(d, 'contratos', c.id, mud, usuario, dados.tipo);
  if (dados.novo_valor > 0) {
    const anterior = aluguelAtual(d, c, C.somarDias(dados.data, -1));
    inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: dados.data, indice: 'Negociado', renovacao_id: r.id,
      percentual: anterior ? C.percentualPorDesconto(anterior, dados.novo_valor - anterior) : 0,
      valor_anterior: anterior, valor_novo: dados.novo_valor, observacoes: dados.tipo }, usuario, `Novo valor negociado: ${C.reais(dados.novo_valor)}`);
  }
  return r;
}

/** Exclui um registro de renovação e o novo valor negociado que ele criou. O prazo do contrato não volta sozinho. */
export function excluirRenovacao(d, renovacaoId, usuario) {
  const r = buscar(d, 'renovacoes', renovacaoId);
  if (!r) throw new Error('Registro não encontrado.');
  for (const x of d.correcoes.filter((y) => y.renovacao_id === r.id)) excluir(d, 'correcoes', x.id, usuario, 'Novo valor negociado excluído com a renovação');
  excluir(d, 'renovacoes', r.id, usuario, `${r.tipo} excluído`);
}

const CAMPOS_GARANTIA = ['garantia_tipo', 'caucao_valor', 'caucao_data', 'caucao_meses', 'deposito_valor', 'deposito_data', 'deposito_uso'];

/** Troca o tipo de garantia (ex.: caução → fiador) guardando a anterior no histórico do contrato. */
export function trocarGarantia(d, contratoId, dados, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const anterior = Object.fromEntries(CAMPOS_GARANTIA.map((k) => [k, c[k] ?? null]));
  const texto = `Garantia: ${c.garantia_tipo || 'não informada'} → ${dados.garantia_tipo}`;
  const r = inserir(d, 'trocas_garantia', { contrato_id: c.id, data: dados.data, tipo_anterior: c.garantia_tipo || '', tipo_novo: dados.garantia_tipo,
    valor_anterior: valorGarantia(d, c), anterior, observacoes: dados.observacoes || '' }, usuario, texto);
  const novo = Object.fromEntries(CAMPOS_GARANTIA.map((k) => [k, dados[k] ?? null]));
  novo.possui_aditivos = true; // troca de garantia exige termo aditivo
  atualizar(d, 'contratos', c.id, novo, usuario, texto);
  return r;
}

/** Substitui um fiador: o antigo fica guardado com data de saída e o novo entra no lugar. */
export function trocarFiador(d, fiadorId, dados, usuario) {
  const antigo = buscar(d, 'fiadores', fiadorId);
  if (!antigo || antigo.data_saida) throw new Error('Este fiador já foi substituído.');
  const { data_troca: data, ...novo } = dados;
  const r = inserir(d, 'fiadores', { ...novo, contrato_id: antigo.contrato_id, data_entrada: data, substitui_id: antigo.id }, usuario,
    `Fiador ${antigo.nome} substituído por ${novo.nome}`);
  atualizar(d, 'fiadores', antigo.id, { data_saida: data, substituido_por_id: r.id }, usuario, `Fiador substituído por ${novo.nome}`);
  return r;
}

/** Ajuste do mês no boleto: cobrança adicional (valor positivo) ou ressarcimento (negativo), com o motivo no histórico. */
export function ajustarBoleto(d, cobrancaId, valor, motivo, usuario) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  if (cb.data_pagamento) throw new Error('Este boleto já foi pago. Desfaça o pagamento antes de ajustar.');
  const texto = valor ? `${valor < 0 ? 'Ressarcimento' : 'Cobrança adicional'} de ${C.reais(Math.abs(valor))} no boleto ${C.compBr(cb.competencia)}${motivo ? `: ${motivo}` : ''}`
    : `Ajuste do boleto ${C.compBr(cb.competencia)} retirado`;
  atualizar(d, 'cobrancas', cb.id, { outros: valor, outros_descricao: valor ? motivo : '' }, usuario, texto);
  return cb;
}

export const cobrancasEmAberto = (d, contratoId) => d.cobrancas.filter((cb) => cb.contrato_id === contratoId && !cb.data_pagamento);

/** Cálculo final da saída: garantia corrigida pelo índice informado (ex.: poupança) menos os débitos. */
export function calcularEncerramento(garantia, indicePercentual, debitos) {
  const corrigida = C.arred((garantia || 0) * (1 + (indicePercentual || 0) / 100));
  return { garantia_corrigida: corrigida, saldo: corrigida - (debitos || 0) };
}

// --------------------------------------------------------------------------
// Leitura dos relógios (água, energia, gás)
// --------------------------------------------------------------------------
const RELOGIOS = [['agua', 'água'], ['energia', 'energia'], ['gas', 'gás']];

/** Tira de `dados` os campos leitura_agua/energia/gas e devolve { agua, energia, gas }, ou null se vierem vazios. */
export function separarLeitura(dados) {
  const v = {};
  for (const [k] of RELOGIOS) {
    v[k] = dados[`leitura_${k}`] || '';
    delete dados[`leitura_${k}`];
  }
  return RELOGIOS.some(([k]) => v[k]) ? v : null;
}

export const textoLeitura = (l) => RELOGIOS.filter(([k]) => l[k]).map(([k, t]) => `${t} ${l[k]}`).join(' · ');

export function registrarLeitura(d, dados, usuario) {
  return inserir(d, 'leituras', dados, usuario, `${dados.momento}: ${textoLeitura(dados)}`);
}

const porData = (a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id;
export const leiturasDoImovel = (d, imovelId) => d.leituras.filter((l) => l.imovel_id === imovelId).sort(porData);
export const leiturasDo = (d, contratoId) => d.leituras.filter((l) => l.contrato_id === contratoId).sort(porData);

/** Dados da pessoa (não do contrato), copiados quando o mesmo inquilino aluga outro imóvel. */
const CAMPOS_PESSOA = ['inquilino_tipo', 'inquilino_nome', 'inquilino_apelido', 'inquilino_telefone', 'inquilino_whatsapp', 'inquilino_email',
  'inquilino_cpf', 'inquilino_rg', 'responsavel_nome', 'responsavel_telefone', 'responsavel_email',
  'representante_nome', 'representante_cpf', 'representante_rg', 'representante_cargo', 'representante_telefone', 'representante_email',
  'solidario_nome', 'solidario_cpf', 'solidario_rg', 'solidario_telefone', 'solidario_email',
  ...['inquilino_', 'representante_', 'solidario_'].flatMap((p) => ['genero', 'nacionalidade', 'estado_civil', 'profissao', 'nascimento', 'endereco'].map((k) => p + k))];
/** Condições do contrato que servem de ponto de partida para o contrato no outro imóvel (são conferidas depois). */
const CAMPOS_CONDICOES = ['prazo_tipo', 'prazo_meses', 'renovacao_automatica', 'indice_correcao', 'aluguel_inicial', 'dia_vencimento',
  'cobranca_mes_seguinte', 'bonificacao', 'desconto_pontualidade_percentual', 'taxa_boleto', 'multa_percentual', 'juros_mensal_percentual',
  'cobrar_iptu', 'cobrar_seguro', 'conta_iptu', 'conta_seguro', 'gerar_nf', 'garantia_tipo', 'finalidade', 'atividade'];

/** Último inquilino do imóvel (pela data de entrada). */
export const ultimoContratoDoImovel = (d, imovelId) => d.contratos.filter((c) => c.imovel_id === imovelId)
  .sort((a, b) => String(b.data_entrada || '').localeCompare(String(a.data_entrada || '')) || b.id - a.id)[0] || null;

/**
 * Condições do inquilino anterior do imóvel, para começar o cadastro do próximo: prazo, índice, vencimento,
 * bonificação, multa e juros, contas inclusas, garantia e finalidade. O aluguel sugerido é o atual do anterior.
 */
export function condicoesDoAnterior(d, anterior) {
  const contas = ['conta_agua', 'conta_energia', 'conta_gas', 'conta_condominio', 'conta_internet'];
  const out = Object.fromEntries([...CAMPOS_CONDICOES, ...contas].filter((k) => anterior[k] !== undefined && anterior[k] !== null && anterior[k] !== '').map((k) => [k, anterior[k]]));
  out.aluguel_inicial = aluguelAtual(d, anterior);
  return out;
}

/** Outros contratos ativos da mesma pessoa (pelo CPF/CNPJ, ou pelo nome quando não há documento). */
export function outrosContratosDaPessoa(d, c, hoje = C.hojeIso()) {
  const doc = String(c.inquilino_cpf || '').replace(/\D/g, '');
  return d.contratos.filter((x) => x.id !== c.id && contratoAtivo(x, hoje) && (doc
    ? String(x.inquilino_cpf || '').replace(/\D/g, '') === doc
    : x.inquilino_nome.trim().toLocaleLowerCase('pt-BR') === c.inquilino_nome.trim().toLocaleLowerCase('pt-BR')));
}

/**
 * Vincula ao imóvel um inquilino cadastrado e grava a leitura dos relógios na entrada.
 * Se o inquilino já está em outro imóvel, cria um contrato novo para este imóvel com os dados da pessoa
 * (o mesmo inquilino pode alugar mais de um imóvel). Devolve o contrato vinculado.
 */
export function vincularInquilino(d, imovelId, dados, usuario) {
  let c = buscar(d, 'contratos', dados.contrato_id);
  if (!c) throw new Error('Inquilino não encontrado.');
  const i = buscar(d, 'imoveis', imovelId);
  if (c.imovel_id === i.id) throw new Error('Este inquilino já está vinculado a este imóvel.');
  const leitura = separarLeitura(dados);
  if (c.imovel_id) {
    const novo = Object.fromEntries([...CAMPOS_PESSOA, ...CAMPOS_CONDICOES].filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));
    Object.assign(novo, { imovel_id: i.id, data_entrada: dados.data_entrada, vigencia_inicio: dados.data_entrada, ativo: true, docs_entrada: true });
    if (novo.prazo_tipo !== 'Indeterminado' && novo.prazo_meses > 0) novo.vigencia_fim = C.fimDoPrazo(dados.data_entrada, novo.prazo_meses);
    c = inserir(d, 'contratos', novo, usuario, `${c.inquilino_nome}: novo contrato no imóvel ${i.nome} (também aluga outro imóvel)`);
  } else {
    atualizar(d, 'contratos', c.id, { imovel_id: i.id, data_entrada: dados.data_entrada, ativo: true, docs_entrada: true }, usuario, `Vinculado ao imóvel ${i.nome}`);
  }
  if (leitura) registrarLeitura(d, { imovel_id: i.id, contrato_id: c.id, data: dados.data_entrada, momento: 'Entrada do inquilino', ...leitura, observacoes: '' }, usuario);
  return c;
}

export function encerrarContrato(d, contratoId, dados, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const leitura = separarLeitura(dados);
  if (d.encerramentos.some((e) => e.contrato_id === c.id)) throw new Error('A saída deste inquilino já foi registrada.');
  if (dados.data_saida < c.data_entrada) throw new Error('A saída não pode ser antes da entrada.');
  const calc = calcularEncerramento(dados.garantia_valor, dados.indice_percentual, dados.debitos);
  const r = inserir(d, 'encerramentos', { contrato_id: c.id, ...dados, ...calc }, usuario,
    `Saída de ${c.inquilino_nome} em ${C.dataBr(dados.data_saida)}: saldo ${C.reais(calc.saldo)}`);
  atualizar(d, 'contratos', c.id, { data_saida: dados.data_saida }, usuario, 'Saída do inquilino');
  if (leitura) registrarLeitura(d, { imovel_id: c.imovel_id || null, contrato_id: c.id, data: dados.data_saida, momento: 'Saída do inquilino', ...leitura, observacoes: '' }, usuario);
  return r;
}

export const encerramentoDo = (d, contratoId) => d.encerramentos.find((e) => e.contrato_id === contratoId) || null;

/** Contratos ligados (ex.: alteração de titular): anteriores e seguintes, em ordem. */
export function cadeiaDeContratos(d, c) {
  const antes = [];
  let x = c;
  const vistos = new Set([c.id]);
  while (x.contrato_anterior_id && !vistos.has(x.contrato_anterior_id)) {
    x = buscar(d, 'contratos', x.contrato_anterior_id);
    if (!x) break;
    vistos.add(x.id);
    antes.unshift(x);
  }
  const depois = [];
  x = c;
  for (;;) {
    const prox = d.contratos.find((y) => y.contrato_anterior_id === x.id && !vistos.has(y.id));
    if (!prox) break;
    vistos.add(prox.id);
    depois.push(prox);
    x = prox;
  }
  return { antes, depois };
}

// --------------------------------------------------------------------------
// Alertas
// --------------------------------------------------------------------------
function alertaCaucao(d, c) {
  if (!temCaucao(c) || !c.caucao_valor) return null;
  const ultimaCaucao = correcoesCaucaoAtual(d, c).map((x) => x.data).pop() || c.caucao_data || '';
  const correcao = correcoesDo(d, c.id).filter((x) => x.data_vigencia > ultimaCaucao).pop();
  if (!correcao) return null;
  const sug = caucaoSugerida(d, c, correcao.data_vigencia);
  return { nivel: 'aviso', tipo: 'Correção da caução',
    texto: `O aluguel foi corrigido em ${C.dataBr(correcao.data_vigencia)}. Corrija também a caução (atual ${C.reais(valorGarantia(d, c))}${sug ? `, sugerido ${C.reais(sug)}` : ''}).` };
}

function alertaAplicacao(d, c) {
  const s = situacaoAplicacao(d, c);
  if (!s.total || s.ok) return null;
  return { nivel: 'aviso', tipo: 'Aplicação da garantia',
    texto: `Garantia de ${C.reais(s.total)} não foi aplicada integralmente: ${s.soma ? `aplicado ${C.reais(s.soma)} (${s.linhas.map((l) => `${l.emitente.nome.split(/\s+/)[0]} ${C.reais(l.aplicado)}`).join(', ')}), ` : ''}falta aplicar ${C.reais(s.falta)}.` };
}

/** Fiador com fim de vínculo próximo (ou já terminado) e nenhum outro fiador para o contrato. */
function alertaFiador(d, c, hoje) {
  if (!temFiador(c)) return null;
  const atuais = fiadoresDo(d, c.id, hoje);
  if (!atuais.length) {
    const fim = d.fiadores.filter((f) => f.contrato_id === c.id && f.data_saida).map((f) => f.data_saida).sort().pop();
    return { nivel: 'aviso', tipo: 'Fiador', texto: fim ? `O vínculo do fiador terminou em ${C.dataBr(fim)} e não há outro fiador.` : 'Garantia por fiador, mas nenhum fiador cadastrado.' };
  }
  if (atuais.some((f) => !f.data_saida)) return null;
  const fim = atuais.map((f) => f.data_saida).sort().pop();
  const faltam = C.diasEntre(hoje, fim);
  return faltam <= 60 ? { nivel: 'aviso', tipo: 'Fiador', texto: `O vínculo do fiador termina em ${C.dataBr(fim)} (faltam ${faltam} dias). Providencie a renovação ou outra garantia.` } : null;
}

/**
 * Lembrete depois da saída do inquilino: pedir a volta da titularidade das contas (água, energia, gás) para o proprietário.
 * Some quando houver um protocolo "Volta para o proprietário" registrado a partir da data de saída.
 */
export function alertaTitularidade(d, c, hoje = C.hojeIso()) {
  if (!c.data_saida || !c.imovel_id || c.data_saida > C.somarDias(hoje, 30) || c.data_saida < C.somarDias(hoje, -180)) return null;
  const feito = d.titularidades.some((t) => t.imovel_id === c.imovel_id && t.tipo === 'Volta para o proprietário'
    && (t.contrato_id === c.id || String(t.data || '') >= c.data_saida));
  if (feito) return null;
  return { nivel: 'aviso', tipo: 'Titularidade', ancora: 'titularidade',
    texto: `${c.data_saida <= hoje ? 'O inquilino saiu' : 'O inquilino sai'} em ${C.dataBr(c.data_saida)}: peça a mudança de titularidade das contas (água, energia, gás) de volta para o proprietário e registre o protocolo.` };
}

export function alertasContrato(d, contrato, hoje = C.hojeIso()) {
  return [
    contrato.verificar ? { nivel: 'aviso', tipo: 'A verificar', texto: contrato.verificar } : null,
    alertaReajuste(d, contrato, hoje),
    alertaCaucao(d, contrato),
    alertas.alertaReserva(contrato.reserva_valor, saldoReserva(d, contrato), competenciaReserva(contrato), hoje),
    contrato.prazo_tipo === 'Indeterminado' ? null : alertas.alertaVigencia(contrato.vigencia_fim, hoje),
    alertaFiador(d, contrato, hoje),
    alertaAplicacao(d, contrato),
    alertaDocumentosEntrada(contrato),
  ].filter(Boolean);
}

// --------------------------------------------------------------------------
// Documentos de entrada do inquilino: contrato, vistoria e recibo das chaves
// --------------------------------------------------------------------------
export const DOCUMENTOS_ENTRADA = [
  ['doc_contrato_em', 'Contrato de locação', 'assinado'],
  ['doc_vistoria_em', 'Vistoria de entrada', 'assinada'],
  ['doc_chaves_em', 'Recibo de entrega das chaves', 'assinado'],
];

/** Inquilino novo (cadastrado a partir desta versão): avisa enquanto faltar algum dos três documentos. */
export function alertaDocumentosEntrada(c) {
  if (!c.docs_entrada || c.ativo === false || c.data_saida) return null;
  const falta = DOCUMENTOS_ENTRADA.filter(([k]) => !c[k]).map(([, t]) => t.toLocaleLowerCase('pt-BR'));
  return falta.length ? { nivel: 'aviso', tipo: 'Documentos de entrada', texto: `falta ${falta.join(', ')}.`, ancora: 'documentos' } : null;
}

export function marcarDocumento(d, contratoId, campo, data, usuario) {
  const doc = DOCUMENTOS_ENTRADA.find(([k]) => k === campo);
  if (!doc) throw new Error('Documento desconhecido.');
  const c = buscar(d, 'contratos', contratoId);
  atualizar(d, 'contratos', c.id, { [campo]: data || null }, usuario, `${c.inquilino_nome}: ${doc[1].toLocaleLowerCase('pt-BR')} ${data ? `${doc[2]} em ${C.dataBr(data)}` : 'voltou a pendente'}`);
}

const porDataVistoria = (a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id;
export const vistoriasDo = (d, contratoId) => d.vistorias.filter((v) => v.contrato_id === contratoId).sort(porDataVistoria);
/** Vistoria mais recente do imóvel (para começar a próxima a partir dela). */
export const ultimaVistoriaDoImovel = (d, imovelId) => d.vistorias.filter((v) => v.imovel_id === imovelId).sort(porDataVistoria)[0] || null;

/** Seguro obrigatório é do imóvel: só cobra apólice enquanto houver inquilino ativo nele. */
export function alertaSeguroImovel(d, i, hoje = C.hojeIso()) {
  const atual = d.contratos.filter((c) => c.imovel_id === i.id && contratoAtivo(c, hoje)).sort((a, b) => b.data_entrada.localeCompare(a.data_entrada))[0];
  if (!atual || atual.conta_seguro === SITUACOES[2]) return null; // contrato sem seguro ("não tem"): nada a cobrar
  return alertas.alertaSeguro(dataBaseCorrecao(atual), hoje, segurosDoImovel(d, i.id));
}

/**
 * Totais da lista de imóveis: o esperado por mês (aluguel bonificado dos inquilinos atuais que emitem NF) e o
 * total com 100% locado (esperado + último aluguel bonificado dos imóveis vagos). Boleto de controle fica fora.
 */
export function totaisImoveis(d, hoje = C.hojeIso()) {
  const bonificado = (c, data) => { const a = aluguelAtual(d, c, data); return a - C.descontoPorPercentual(a, percentualBonificacao(c)); };
  let esperado = 0;
  let cheio = 0;
  let vagos = 0;
  let qtdVagos = 0;
  let vagosSemValor = 0;
  for (const i of d.imoveis) {
    const atuais = d.contratos.filter((c) => c.imovel_id === i.id && c.ativo !== false && contratoAtivo(c, hoje));
    if (atuais.length) {
      for (const c of atuais.filter(geraNf)) { esperado += bonificado(c, hoje); cheio += aluguelAtual(d, c, hoje); }
      continue;
    }
    const ultimo = d.contratos.filter((c) => c.imovel_id === i.id).sort((a, b) => String(b.data_entrada).localeCompare(String(a.data_entrada)))[0];
    if (ultimo) { vagos += bonificado(ultimo, ultimo.data_saida && ultimo.data_saida < hoje ? ultimo.data_saida : hoje); qtdVagos += 1; } else vagosSemValor += 1;
  }
  return { esperado, cheio, vagos, qtdVagos, cemPorCento: esperado + vagos, vagosSemValor };
}

export function todosAlertas(d, hoje = C.hojeIso()) {
  const ordem = { perigo: 0, aviso: 1, info: 2 };
  const lista = [];
  for (const c of d.contratos) {
    if (!contratoAtivo(c, hoje)) continue;
    const imovel = buscar(d, 'imoveis', c.imovel_id);
    for (const a of alertasContrato(d, c, hoje)) {
      lista.push({ ...a, contrato_id: c.id, imovel: imovel ? imovel.nome : '', inquilino: c.inquilino_nome });
    }
  }
  for (const c of d.contratos) {
    const a = alertaTitularidade(d, c, hoje);
    const imovel = buscar(d, 'imoveis', c.imovel_id);
    if (a && imovel) lista.push({ ...a, imovel_id: imovel.id, imovel: imovel.nome, inquilino: c.inquilino_nome });
  }
  for (const i of d.imoveis) {
    const a = alertaSeguroImovel(d, i, hoje);
    if (a) lista.push({ ...a, imovel_id: i.id, imovel: i.nome, inquilino: '' });
    if (i.verificar) lista.push({ nivel: 'aviso', tipo: 'A verificar', texto: i.verificar, imovel_id: i.id, imovel: i.nome, inquilino: '' });
  }
  lista.push(...alertasIptu(d, hoje));
  for (const x of inadimplencia(d, hoje).devedores) {
    const i = buscar(d, 'imoveis', x.contrato.imovel_id);
    lista.push({ nivel: x.diasMax > DIAS_VERMELHO ? 'perigo' : 'aviso', tipo: 'Inadimplência', contrato_id: x.contrato.id, imovel: i ? i.nome : '', inquilino: x.contrato.inquilino_nome,
      texto: `${x.boletos.length} boleto(s) vencido(s) e não pago(s), ${C.reais(x.totalHoje)} hoje (com multa e juros), o mais antigo há ${x.diasMax} dia(s).` });
  }
  return lista.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}

// --------------------------------------------------------------------------
// Boleto: textos para copiar no site do banco
// --------------------------------------------------------------------------
const rs = (c) => `RS${C.reais(c, false)}`;

/** Valor, desconto, juros ao dia e descrição no formato usado nos boletos (ex.: "ALUGUEL RS3.644,45"). */
export function dadosBoleto(d, cb) {
  const c = buscar(d, 'contratos', cb.contrato_id);
  const imovel = buscar(d, 'imoveis', c.imovel_id);
  const t = totais(cb);
  const linhas = [];
  if (cb.carencia) linhas.push(`CARÊNCIA DO ALUGUEL ${C.compBr(cb.competencia)}`);
  else linhas.push(cb.dias_cobrados < cb.dias_mes ? `ALUGUEL ${cb.dias_cobrados}/${cb.dias_mes} DIAS ${rs(cb.aluguel)}` : `ALUGUEL ${rs(cb.aluguel)}`);
  if (cb.desconto) linhas.push(`COM BONF. ${rs(cb.aluguel - cb.desconto)}`);
  const extras = [];
  if (cb.iptu) extras.push(`IPTU ${rs(cb.iptu)}`);
  if (cb.seguro) {
    const parc = /(\d+\/\d+)/.exec(cb.seguro_parcela || '');
    extras.push(`SEGURO${parc ? parc[1] : ''} ${rs(cb.seguro)}`);
  }
  if (cb.taxa_boleto) extras.push(`TARIFA ${rs(cb.taxa_boleto)}`);
  if (cb.outros) extras.push(`${(cb.outros_descricao || (cb.outros < 0 ? 'RESSARCIMENTO' : 'COBRANÇA ADICIONAL')).toLocaleUpperCase('pt-BR')} ${cb.outros < 0 ? `-${rs(-cb.outros)}` : rs(cb.outros)}`);
  if (cb.reserva_utilizada) extras.push(`RESERVA -${rs(cb.reserva_utilizada)}`);
  if (extras.length) linhas.push(extras.join(' '));
  const valor = t.a_pagar_sem_desconto;
  return {
    pagador: c.inquilino_nome, documento_pagador: c.inquilino_cpf || '',
    numero_documento: ((imovel && imovel.nome) || '').toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '').slice(0, 15),
    vencimento: cb.vencimento, valor, desconto: Math.min(cb.desconto, valor),
    valor_com_desconto: t.a_pagar_pontual, multa_percentual: cb.multa_percentual,
    juros_ao_dia: C.jurosAoDia(valor, cb.juros_mensal_percentual), descricao: linhas.join('\n'),
  };
}

// --------------------------------------------------------------------------
// Resultados financeiros por imóvel
// --------------------------------------------------------------------------
/** Solicitações do inquilino (pequenos reparos e pedidos), das mais recentes para as mais antigas. */
export const solicitacoesDo = (d, contratoId) => d.solicitacoes.filter((x) => x.contrato_id === contratoId)
  .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);

export const reformasDo = (d, imovelId) => d.reformas.filter((r) => r.imovel_id === imovelId)
  .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);

/**
 * Resultado de cada imóvel num período (datas "AAAA-MM-DD", pelo dia em que o dinheiro entrou):
 * aluguel recebido (aluguel com desconto ou com multa e juros, sem IPTU, seguro e tarifa) e NFs avulsas do imóvel,
 * menos o IPTU pago pelo proprietário e as reformas do período. Retorno anual = resultado anualizado ÷ (valor do imóvel + reformas).
 */
export function resultadosFinanceiros(d, de, ate) {
  const meses = Math.max(1, C.mesesEntre(de.slice(0, 7), ate.slice(0, 7)) + 1);
  const dentro = (x) => x && x >= de && x <= ate;
  return d.imoveis.map((i) => {
    // boleto de controle (inquilino sem NF) não entra no resultado financeiro
    const contratos = new Set(d.contratos.filter((c) => c.imovel_id === i.id && geraNf(c)).map((c) => c.id));
    const pagas = d.cobrancas.filter((cb) => contratos.has(cb.contrato_id) && dentro(cb.data_pagamento));
    const aluguel = pagas.reduce((s, cb) => s + (cb.valor_nf || 0), 0);
    const avulsas = d.avulsas.filter((a) => a.imovel_id === i.id && dentro(a.data_pagamento)).reduce((s, a) => s + a.valor, 0);
    let iptu = 0;
    for (const p of d.iptus.filter((x) => x.imovel_id === i.id)) {
      for (const pc of parcelasIptu(d, p)) if (pc.proprietario && dentro(pc.paga)) iptu += pc.valor;
    }
    const todasReformas = reformasDo(d, i.id);
    const reformasPeriodo = todasReformas.filter((r) => dentro(r.data)).reduce((s, r) => s + r.valor, 0);
    const investido = todasReformas.filter((r) => String(r.data) <= ate).reduce((s, r) => s + r.valor, 0);
    const contas = d.despesas.filter((x) => x.imovel_id === i.id && dentro(x.data_pagamento)).reduce((s, x) => s + x.valor, 0);
    const receita = aluguel + avulsas;
    const resultado = receita - iptu - contas;
    const base = (i.valor_imovel || 0) + investido;
    return { imovel: i, receita, aluguel, avulsas, iptu, contas, reformasPeriodo, investido, resultado, base, meses, controle: imovelSoControle(d, i.id, ate),
      retornoAnual: base ? (resultado * 12 / meses / base) * 100 : null, mesesPagos: pagas.length };
  }).sort((a, b) => (b.retornoAnual ?? -Infinity) - (a.retornoAnual ?? -Infinity));
}

// --------------------------------------------------------------------------
// Contas pagas por nós (imóvel vago, ou contas incluídas no aluguel): abatem do resultado
// --------------------------------------------------------------------------
export const TIPOS_DESPESA = ['Água', 'Luz', 'Gás', 'Condomínio', 'Internet', 'Outra'];

export const despesasDo = (d, imovelId) => d.despesas.filter((x) => x.imovel_id === imovelId)
  .sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)) || String(b.data_pagamento).localeCompare(String(a.data_pagamento)) || b.id - a.id);

/** Último valor lançado de cada tipo (para sugerir no próximo mês). */
export function ultimosValores(d, imovelId) {
  const out = {};
  for (const x of despesasDo(d, imovelId)) if (!(x.tipo in out)) out[x.tipo] = x;
  return out;
}

/** Contas que o inquilino atual não paga: as marcadas "Incluso no aluguel" (ou todas, se o imóvel está vago). */
export function contasPorNossaConta(d, imovelId, hoje = C.hojeIso()) {
  const atual = d.contratos.find((c) => c.imovel_id === imovelId && contratoAtivo(c, hoje));
  if (!atual) return { vago: true, inclusas: [] };
  return { vago: false, inclusas: Object.entries(NOMES_CONTAS).filter(([k]) => atual[k] === SITUACOES[1]).map(([, t]) => t) };
}

/** Contrato ocupando o imóvel no dia (pela entrada e saída). */
const ocupadoEm = (d, imovelId, dia) => d.contratos.some((c) => c.imovel_id === imovelId && c.data_entrada && c.data_entrada <= dia
  && (c.data_saida ? c.data_saida >= dia : c.ativo !== false));
export const MESES_DEPOIS_DE_ALUGAR = 2;
const NOMES_CONTAS = { conta_agua: 'Água', conta_energia: 'Luz', conta_gas: 'Gás', conta_condominio: 'Condomínio', conta_internet: 'Internet' };

/**
 * Contas que podem ser lançadas como nossas no mês da conta ``comp``:
 * - imóvel vago em algum dia do mês: todas;
 * - até 2 meses depois de um imóvel vago ser alugado (contas do período vago chegam atrasadas): todas;
 * - fora disso: só as que o contrato do inquilino diz "Incluso no aluguel".
 * Devolve { tipos, motivo }.
 */
export function contasPermitidas(d, imovelId, comp) {
  const [ini, fim] = C.limitesCompetencia(comp);
  for (let dia = ini; dia <= fim; dia = C.somarDias(dia, 1)) {
    if (!ocupadoEm(d, imovelId, dia)) return { tipos: [...TIPOS_DESPESA], motivo: 'vago' };
  }
  const limite = C.limitesCompetencia(C.somarMeses(comp, -MESES_DEPOIS_DE_ALUGAR))[0];
  const recente = d.contratos.find((c) => c.imovel_id === imovelId && c.data_entrada && c.data_entrada >= limite && c.data_entrada <= fim
    && !ocupadoEm(d, imovelId, C.somarDias(c.data_entrada, -1)));
  if (recente) return { tipos: [...TIPOS_DESPESA], motivo: 'alugou', contrato: recente };
  const atuais = d.contratos.filter((c) => c.imovel_id === imovelId && c.data_entrada && c.data_entrada <= fim && (c.data_saida ? c.data_saida >= ini : c.ativo !== false));
  const tipos = [...new Set(atuais.flatMap((c) => Object.entries(NOMES_CONTAS).filter(([k]) => c[k] === SITUACOES[1]).map(([, t]) => t)))];
  return { tipos, motivo: tipos.length ? 'incluso' : 'inquilino' };
}

/** Lança várias contas do mesmo imóvel de uma vez. ``linhas``: [{ tipo, valor (centavos), data_pagamento, observacoes }]. */
export function lancarDespesas(d, imovelId, competencia, linhas, usuario) {
  const i = buscar(d, 'imoveis', imovelId);
  if (!i) throw new Error('Imóvel não encontrado.');
  const novas = linhas.filter((l) => l.valor > 0);
  if (!novas.length) throw new Error('Informe o valor de pelo menos uma conta.');
  const { tipos } = contasPermitidas(d, i.id, competencia);
  const fora = novas.filter((l) => !tipos.includes(l.tipo)).map((l) => l.tipo);
  if (fora.length) throw new Error(`Em ${C.compBr(competencia)} o inquilino paga ${fora.join(', ')}, conforme o contrato. Só entram contas que são nossas.`);
  return novas.map((l) => inserir(d, 'despesas', { imovel_id: i.id, competencia, tipo: l.tipo, valor: l.valor, data_pagamento: l.data_pagamento || C.hojeIso(),
    observacoes: l.observacoes || '' }, usuario, `${i.nome}: ${l.tipo} de ${C.compBr(competencia)} paga por nós (${C.reais(l.valor)})`));
}

// --------------------------------------------------------------------------
// Fechamento do mês: as rotinas em ordem, com o que falta em cada uma
// --------------------------------------------------------------------------
/**
 * Etapas do fechamento do mês ``mes`` (mês do calendário). Os boletos que vencem neste mês são os da competência
 * anterior (mês de uso). Cada etapa: { chave, titulo, pendentes, detalhe, link, feito, manual, marcado }.
 * As automáticas ficam feitas quando não há pendência; as manuais, quando alguém marca.
 */
export function etapasFechamento(d, mes, hoje = C.hojeIso()) {
  const comp = C.somarMeses(mes, -1);
  const proxima = mes;
  const marcado = (chave) => d.fechamentos.find((f) => f.competencia === mes && f.etapa === chave) || null;
  const ativos = d.contratos.filter((c) => c.ativo !== false && c.imovel_id);
  const semBoleto = ativos.filter((c) => C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0 && !d.cobrancas.some((x) => x.contrato_id === c.id && x.competencia === comp));
  const doMes = d.cobrancas.filter((x) => x.competencia === comp);
  const emAberto = doMes.filter((x) => !x.data_pagamento && x.situacao !== 'Carência');
  const vencidos = emAberto.filter((x) => x.vencimento < hoje);
  const cartas = ativos.map((c) => reajusteNaCompetencia(d, c, proxima)).filter((r) => r && !r.corrigido && !r.carta);
  const nfs = pendentesDeFatura(d).length;
  const contas = d.imoveis.filter((i) => contasPermitidas(d, i.id, mes).tipos.length && !d.despesas.some((x) => x.imovel_id === i.id && x.competencia === mes));
  const etapas = [
    { chave: 'boletos', titulo: `Gerar os boletos de ${C.compBr(comp)} (vencem em ${C.compBr(mes)})`, pendentes: semBoleto.length,
      detalhe: semBoleto.length ? `sem boleto: ${semBoleto.map((c) => c.inquilino_nome).join(', ')}` : `${doMes.length} boleto(s) gerado(s)`, link: `#/cobrancas?comp=${comp}` },
    { chave: 'cartas', titulo: `Enviar as cartas de reajuste do aluguel de ${C.compBr(proxima)}`, pendentes: cartas.length,
      detalhe: cartas.length ? `${cartas.length} carta(s) a enviar` : 'nenhuma carta pendente', link: '#/reajustes' },
    { chave: 'pagamentos', titulo: `Conferir os pagamentos dos boletos de ${C.compBr(comp)}`, pendentes: emAberto.length,
      detalhe: emAberto.length ? `${emAberto.length} em aberto${vencidos.length ? `, ${vencidos.length} vencido(s)` : ''}` : 'todos pagos', link: `#/cobrancas?comp=${comp}` },
    { chave: 'nfs', titulo: 'Numerar as NFs dos pagamentos', pendentes: nfs, detalhe: nfs ? `${nfs} pagamento(s) aguardando número` : 'nada aguardando número', link: '#/faturas' },
    { chave: 'contas', titulo: `Lançar as contas pagas por nós de ${C.compBr(mes)}`, pendentes: contas.length, manual: true,
      detalhe: contas.length ? `sem lançamento: ${contas.map((i) => i.nome).join(', ')}` : 'nenhum imóvel com conta nossa', link: '#/resultados', imoveis: contas.map((i) => i.id) },
  ];
  for (const e of etapas) {
    e.marcado = marcado(e.chave);
    e.feito = !!e.marcado || (!e.manual && !e.pendentes) || (e.manual && !e.pendentes);
  }
  return etapas;
}

/** Marca (ou desmarca) uma etapa do fechamento como feita. */
export function marcarEtapaFechamento(d, mes, etapa, feito, usuario) {
  const atual = d.fechamentos.find((f) => f.competencia === mes && f.etapa === etapa);
  if (feito && !atual) inserir(d, 'fechamentos', { competencia: mes, etapa, feito_em: C.hojeIso() }, usuario, `Fechamento de ${C.compBr(mes)}: etapa "${etapa}" feita`);
  if (!feito && atual) excluir(d, 'fechamentos', atual.id, usuario, `Fechamento de ${C.compBr(mes)}: etapa "${etapa}" desmarcada`);
}

/** Baixa em lote: confirma como "pagou em dia" os boletos escolhidos, com a data em que o dinheiro entrou. */
export function baixarEmLote(d, ids, dataContabil, usuario) {
  const feitos = [];
  const pulados = [];
  for (const id of ids) {
    const cb = buscar(d, 'cobrancas', id);
    if (!cb || cb.data_pagamento || cb.situacao === 'Carência') { if (cb) pulados.push(cb); continue; }
    registrarPagamento(d, cb.id, dataContabil, null, usuario, { pagouEmDia: true });
    feitos.push(cb);
  }
  return { feitos, pulados };
}

// --------------------------------------------------------------------------
// Calendário do mês: tudo que vence ou acontece no mês
// --------------------------------------------------------------------------
/**
 * Eventos do mês ("AAAA-MM"), em ordem de data: boletos (gerados ou previstos), parcelas do IPTU na prefeitura,
 * fim do seguro, aniversário do contrato (correção), fim do contrato e fim do vínculo do fiador.
 * Cada evento: { data, tipo, texto, imovel_id, contrato_id, situacao: 'ok' | 'aviso' | 'perigo' | 'neutra' }.
 */
export function eventosDoMes(d, mes, hoje = C.hojeIso()) {
  const [ini, fim] = C.limitesCompetencia(mes);
  const no = (data) => data && data >= ini && data <= fim;
  const nomeImovel = (id) => (d.imoveis.find((i) => i.id === id) || {}).nome || '';
  const ev = [];
  // boletos que vencem no mês (os já gerados, e os previstos dos inquilinos ativos)
  const ativos = d.contratos.filter((c) => c.ativo !== false && c.imovel_id);
  for (const c of ativos) {
    for (const comp of [C.somarMeses(mes, -1), mes]) {
      if (C.diasOcupados(comp, c.data_entrada, c.data_saida) === 0) continue;
      const cb = d.cobrancas.find((x) => x.contrato_id === c.id && x.competencia === comp);
      const venc = cb ? cb.vencimento : C.vencimentoDaCompetencia(comp, c.dia_vencimento || 10, c.cobranca_mes_seguinte !== false);
      if (!no(venc)) continue;
      const pago = cb && cb.data_pagamento;
      ev.push({ data: venc, tipo: 'Boleto', imovel_id: c.imovel_id, contrato_id: c.id, cobranca_id: cb ? cb.id : null,
        texto: `${c.inquilino_nome} · aluguel de ${C.compBr(comp)}${cb ? ` · ${C.reais(totais(cb).a_pagar_pontual)}` : ' · boleto ainda não gerado'}${geraNf(c) ? '' : ' · boleto de controle'}`,
        situacao: pago ? 'ok' : !cb ? 'neutra' : venc < hoje ? 'perigo' : 'aviso', estado: pago ? `pago em ${C.dataBr(cb.data_pagamento)}` : !cb ? 'previsto' : venc < hoje ? 'vencido' : 'em aberto' });
    }
  }
  // IPTU na prefeitura
  for (const p of d.iptus) {
    for (const pc of parcelasIptu(d, p)) {
      if (!no(pc.vencimento)) continue;
      ev.push({ data: pc.vencimento, tipo: 'IPTU', imovel_id: p.imovel_id,
        texto: `${nomeImovel(p.imovel_id)} · IPTU ${p.ano} ${pc.rotulo} · ${C.reais(pc.valor)} · ${pc.proprietario ? 'por conta do proprietário' : `no boleto de ${pc.inquilino.inquilino_nome}`}`,
        situacao: !pc.proprietario ? 'neutra' : pc.paga ? 'ok' : pc.vencimento < hoje ? 'perigo' : 'aviso',
        estado: !pc.proprietario ? 'inquilino paga' : pc.paga ? `pago em ${C.dataBr(pc.paga)}` : pc.vencimento < hoje ? 'vencido' : 'a pagar' });
    }
  }
  // seguro obrigatório: fim da vigência
  for (const s of d.seguros) {
    if (!no(s.vigencia_fim)) continue;
    const renovado = d.seguros.some((x) => x.imovel_id === s.imovel_id && x.vigencia_fim > s.vigencia_fim);
    ev.push({ data: s.vigencia_fim, tipo: 'Seguro', imovel_id: s.imovel_id, texto: `${nomeImovel(s.imovel_id)} · fim do seguro${s.seguradora ? ` ${s.seguradora}` : ''}`,
      situacao: renovado ? 'ok' : 'aviso', estado: renovado ? 'renovado' : 'renovar' });
  }
  for (const c of d.contratos.filter((x) => contratoAtivo(x, hoje) && x.imovel_id)) {
    // reajuste: no vencimento do boleto anterior ao mês corrigido (é com ele que vai a carta)
    for (const comp of [C.somarMeses(mes, 1), C.somarMeses(mes, 2)]) {
      const r = reajusteNaCompetencia(d, c, comp);
      if (!r) continue;
      const anterior = C.somarMeses(comp, -1);
      const cb = d.cobrancas.find((x) => x.contrato_id === c.id && x.competencia === anterior);
      const venc = cb ? cb.vencimento : C.vencimentoDaCompetencia(anterior, c.dia_vencimento || 10, c.cobranca_mes_seguinte !== false);
      if (!no(venc)) continue;
      ev.push({ data: venc, tipo: 'Reajuste', imovel_id: c.imovel_id, contrato_id: c.id,
        texto: `${c.inquilino_nome} · carta de reajuste com este boleto · aluguel de ${C.compBr(comp)} corrigido (${r.anos} ano(s), ${c.indice_correcao || 'índice do contrato'})`,
        situacao: r.corrigido ? 'ok' : r.carta ? 'neutra' : 'aviso', estado: r.corrigido ? 'corrigido' : r.carta ? 'carta enviada' : 'enviar carta' });
    }
    if (c.prazo_tipo !== 'Indeterminado' && no(c.vigencia_fim)) {
      ev.push({ data: c.vigencia_fim, tipo: 'Fim do contrato', imovel_id: c.imovel_id, contrato_id: c.id, texto: `${c.inquilino_nome} · fim do prazo do contrato`, situacao: 'aviso', estado: 'renovar ou sair' });
    }
    for (const f of d.fiadores.filter((x) => x.contrato_id === c.id && no(x.data_saida) && !x.substituido_por_id)) {
      ev.push({ data: f.data_saida, tipo: 'Fiador', imovel_id: c.imovel_id, contrato_id: c.id, texto: `${c.inquilino_nome} · fim do vínculo do fiador ${f.nome}`, situacao: 'aviso', estado: 'providenciar' });
    }
  }
  // fechamento do mês: no último dia, quantas etapas faltam
  if (fim >= `${hoje.slice(0, 7)}-01`) {
    const etapas = etapasFechamento(d, mes, hoje);
    const faltam = etapas.filter((e) => !e.feito).length;
    ev.push({ data: fim, tipo: 'Fechamento', texto: faltam ? `faltam ${faltam} de ${etapas.length} etapas` : 'concluído',
      situacao: faltam ? (fim < hoje ? 'perigo' : 'aviso') : 'ok', estado: faltam ? 'a fazer' : 'feito', fechamento: mes });
  }
  const ordem = { Boleto: 0, Reajuste: 1, IPTU: 2, Seguro: 3, 'Fim do contrato': 4, Fiador: 5, Fechamento: 6 };
  return ev.sort((a, b) => a.data.localeCompare(b.data) || ordem[a.tipo] - ordem[b.tipo] || a.texto.localeCompare(b.texto, 'pt-BR'));
}

// --------------------------------------------------------------------------
// Reajuste anual: corrigido no 13º mês cheio, com carta enviada junto do boleto anterior
// --------------------------------------------------------------------------
/** Primeiro mês cheio do contrato: o mês da data-base se começou no dia 1º; senão, o mês seguinte. */
export function primeiroMesCheio(c) {
  const base = dataBaseCorrecao(c);
  if (!base) return null;
  return base.slice(8, 10) === '01' ? base.slice(0, 7) : C.somarMeses(base.slice(0, 7), 1);
}

/** Competência (aluguel de) do n-ésimo reajuste: o 13º mês cheio, o 25º... */
export const competenciaDoReajuste = (c, n) => { const p = primeiroMesCheio(c); return p ? C.somarMeses(p, 12 * n) : null; };

/** Correção já registrada para o reajuste da competência (aceita registro até 3 meses antes). */
const correcaoDoReajuste = (d, c, comp) => correcoesDo(d, c.id).find((x) => x.data_vigencia >= `${C.somarMeses(comp, -3)}-01` && x.data_vigencia <= `${comp}-31`) || null;
const cartaDoReajuste = (d, c, comp) => d.cartas_reajuste.find((x) => x.contrato_id === c.id && x.competencia === comp) || null;

/** Se a competência é a de um reajuste do contrato: { n, anos, competencia, corrigido, carta }. */
export function reajusteNaCompetencia(d, c, comp) {
  const p = primeiroMesCheio(c);
  if (!p || c.prazo_tipo === 'Sem reajuste') return null;
  const meses = C.mesesEntre(p, comp);
  if (meses <= 0 || meses % 12 !== 0) return null;
  const n = meses / 12;
  return { n, anos: n, competencia: comp, corrigido: correcaoDoReajuste(d, c, comp), carta: cartaDoReajuste(d, c, comp) };
}

/** Próximo reajuste a tratar: o último que já devia ter acontecido (ou acontece no mês seguinte) e não foi registrado. */
export function reajustePendente(d, c, hoje = C.hojeIso()) {
  const p = primeiroMesCheio(c);
  if (!p) return null;
  const limite = C.somarMeses(C.competenciaDe(hoje), 1);
  const n = Math.floor(C.mesesEntre(p, limite) / 12);
  if (n < 1) return null;
  const r = reajusteNaCompetencia(d, c, competenciaDoReajuste(c, n));
  return r && !r.corrigido ? r : null;
}

/** Alerta do reajuste: um mês antes (enviar a carta com o boleto anterior) ou atrasado. */
function alertaReajuste(d, c, hoje) {
  const r = reajustePendente(d, c, hoje);
  if (!r) return null;
  const atrasado = r.competencia < C.competenciaDe(hoje);
  return { nivel: atrasado ? 'perigo' : 'aviso', tipo: 'Reajuste do aluguel',
    texto: atrasado ? `O aluguel de ${C.compBr(r.competencia)} (${r.anos} ano(s), 13º mês cheio) já devia estar corrigido pelo ${c.indice_correcao || 'índice do contrato'}. Registre a correção.`
      : `O aluguel de ${C.compBr(r.competencia)} será corrigido pelo ${c.indice_correcao || 'índice do contrato'} (${r.anos} ano(s) de contrato). ${r.carta ? 'Carta enviada; falta aplicar a correção.' : `Envie a carta de reajuste junto com o boleto de ${C.compBr(C.somarMeses(r.competencia, -1))}.`}` };
}

/** Índice acumulado em 12 meses mais recente até o mês de referência. */
export function indiceAcumulado(d, nome, ate) {
  return d.indices_acumulados.filter((x) => x.indice === nome && x.mes_ref <= ate).sort((a, b) => b.mes_ref.localeCompare(a.mes_ref))[0] || null;
}

/**
 * Cálculo do reajuste: índices informados (acumulado em 12 meses até o mês anterior ao corrigido), o percentual
 * aplicado (para "IGP-M/IPCA (o maior)" escolhe o maior; "(o menor)", o menor) e os valores novos, cheio e bonificado.
 */
export function calcularReajuste(d, c, comp) {
  const nome = c.indice_correcao || '';
  const partes = nome.replace(/\(.*\)/, '').split('/').map((x) => x.trim()).filter(Boolean);
  const ref = C.somarMeses(comp, -1);
  const usados = partes.map((p) => ({ indice: p, registro: indiceAcumulado(d, p, ref) }));
  const faltando = usados.filter((u) => !u.registro).map((u) => u.indice);
  let escolhido = null;
  if (!faltando.length && usados.length) {
    const menor = /menor/i.test(nome);
    escolhido = usados.reduce((a, b) => (!a || (menor ? b.registro.percentual < a.registro.percentual : b.registro.percentual > a.registro.percentual) ? b : a), null);
  }
  const atual = aluguelAtual(d, c, C.somarDias(`${comp}-01`, -1));
  const pctBonif = percentualBonificacao(c);
  const bonif = (v) => v - C.descontoPorPercentual(v, pctBonif);
  const pct = escolhido ? escolhido.registro.percentual : null;
  const novo = pct === null ? null : C.aplicarCorrecao(atual, pct);
  return { indiceContrato: nome, usados, faltando, escolhido, percentual: pct, atual, novo, atualBonificado: bonif(atual),
    novoBonificado: novo === null ? null : bonif(novo), bonificacao: pctBonif > 0, competencia: comp };
}

/** Registra a correção do reajuste no contrato (vale a partir do dia 1º da competência). */
export function aplicarReajuste(d, contratoId, comp, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const r = calcularReajuste(d, c, comp);
  if (r.percentual === null) throw new Error(`Informe o índice acumulado de ${r.faltando.join(' e ')} (até ${C.compBr(C.somarMeses(comp, -1))}) em Reajustes.`);
  if (correcaoDoReajuste(d, c, comp)) throw new Error('Este reajuste já foi registrado.');
  return inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: `${comp}-01`, indice: r.escolhido.indice, indice_contrato: r.indiceContrato,
    data_indice: r.escolhido.registro.mes_ref, percentual: r.percentual, valor_anterior: r.atual, valor_novo: r.novo,
    observacoes: `Reajuste do 13º mês cheio (${C.compBr(comp)})` }, usuario, `Reajuste ${C.compBr(comp)}: ${C.reais(r.atual)} → ${C.reais(r.novo)} (${r.escolhido.indice} ${C.pct(r.percentual)})`);
}

/** Marca a carta de reajuste como enviada (ou desfaz). */
export function marcarCartaEnviada(d, contratoId, comp, enviada, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const atual = cartaDoReajuste(d, c, comp);
  if (enviada && !atual) inserir(d, 'cartas_reajuste', { contrato_id: c.id, competencia: comp, enviada_em: C.hojeIso() }, usuario, `Carta de reajuste de ${C.compBr(comp)} enviada`);
  if (!enviada && atual) excluir(d, 'cartas_reajuste', atual.id, usuario, `Carta de reajuste de ${C.compBr(comp)}: envio desfeito`);
}

/** Reajustes do período (competências), para a tela de Reajustes. */
export function reajustesEntre(d, de, ate) {
  const lista = [];
  for (const c of d.contratos.filter((x) => x.ativo !== false && x.imovel_id)) {
    for (let comp = de; comp <= ate; comp = C.somarMeses(comp, 1)) {
      if (!contratoAtivo(c, `${comp}-01`)) continue;
      const r = reajusteNaCompetencia(d, c, comp);
      if (r) lista.push({ contrato: c, ...r, calculo: calcularReajuste(d, c, comp) });
    }
  }
  return lista.sort((a, b) => a.competencia.localeCompare(b.competencia) || a.contrato.inquilino_nome.localeCompare(b.contrato.inquilino_nome, 'pt-BR'));
}

// --------------------------------------------------------------------------
// Inadimplência: boletos vencidos e não pagos, por inquilino, e histórico de atrasos
// --------------------------------------------------------------------------
/** A partir de quantos dias de atraso o devedor fica em vermelho. */
export const DIAS_VERMELHO = 5;
/**
 * Devedores: inquilinos com boleto vencido e não pago (carência sem valor não conta), com o valor de hoje
 * (multa e juros até hoje). Histórico: pagamentos com atraso nos últimos 12 meses, para ver quem costuma atrasar.
 */
export function inadimplencia(d, hoje = C.hojeIso()) {
  const porContrato = new Map();
  for (const cb of d.cobrancas) {
    if (cb.data_pagamento || cb.situacao === 'Carência' || !(cb.vencimento < hoje)) continue;
    const c = buscar(d, 'contratos', cb.contrato_id);
    if (!c) continue;
    if (!porContrato.has(c.id)) porContrato.set(c.id, { contrato: c, boletos: [] });
    const r = C.liquidar(cb, hoje);
    porContrato.get(c.id).boletos.push({ cobranca: cb, dias: C.diasEntre(cb.vencimento, hoje), valor: totais(cb).a_pagar_sem_desconto, hojeValor: r.valor_devido });
  }
  const devedores = [...porContrato.values()].map((x) => ({ ...x,
    boletos: x.boletos.sort((a, b) => a.cobranca.vencimento.localeCompare(b.cobranca.vencimento)),
    total: x.boletos.reduce((s, b) => s + b.valor, 0), totalHoje: x.boletos.reduce((s, b) => s + b.hojeValor, 0),
    diasMax: Math.max(...x.boletos.map((b) => b.dias)) })).sort((a, b) => b.diasMax - a.diasMax || b.totalHoje - a.totalHoje);
  const desde = C.somarMeses(C.competenciaDe(hoje), -12);
  const historico = d.contratos.filter((c) => contratoAtivo(c, hoje) && c.imovel_id).map((c) => {
    const pagos = d.cobrancas.filter((cb) => cb.contrato_id === c.id && cb.data_pagamento && cb.vencimento.slice(0, 7) >= desde);
    const atrasados = pagos.filter((cb) => cb.dias_atraso > 0);
    return { contrato: c, pagos: pagos.length, atrasados: atrasados.length,
      mediaDias: atrasados.length ? Math.round(atrasados.reduce((s, cb) => s + cb.dias_atraso, 0) / atrasados.length) : 0,
      maiorAtraso: Math.max(0, ...atrasados.map((cb) => cb.dias_atraso)) };
  }).filter((x) => x.atrasados).sort((a, b) => b.atrasados - a.atrasados || b.mediaDias - a.mediaDias);
  return { devedores, historico, total: devedores.reduce((s, x) => s + x.total, 0), totalHoje: devedores.reduce((s, x) => s + x.totalHoje, 0) };
}
