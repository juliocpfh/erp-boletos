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
  reformas: 'Reforma / investimento', arquivos: 'Arquivo', banco: 'Banco de dados', listas: 'Lista de opções',
};

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

/** Valor da parcela do IPTU que entra no boleto da competência (com a regra de IPTU quitado à vista). */
export function iptuNaCompetencia(p, comp) {
  if (p.pago_avista && p.cobranca_inquilino === COBRANCA_IPTU_QUITADO[2]) return [null, 0];
  if (p.pago_avista && p.cobranca_inquilino === COBRANCA_IPTU_QUITADO[1]) {
    if (Number(comp.slice(0, 4)) !== Number(p.ano)) return [null, 0];
    const mes = Number(comp.slice(5, 7));
    return [mes, C.parcelas(p.valor_avista || p.valor_total, 12)[mes - 1]];
  }
  const [n, v] = C.parcelaNaCompetencia(p.valor_total, p.num_parcelas, p.primeira_competencia, comp);
  return [n, n && p.valor_parcela > 0 ? p.valor_parcela : v];
}

/** Inquilino que paga o IPTU no mês (cobrado no boleto), ou null quando o custo fica com o proprietário. */
function inquilinoPagaIptu(d, imovelId, comp) {
  return d.contratos.find((c) => c.imovel_id === imovelId && c.ativo !== false && c.cobrar_iptu
    && C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0) || null;
}

/**
 * Parcelas do IPTU na prefeitura, com quem arca com cada uma (inquilino no boleto ou proprietário, quando o
 * imóvel está vazio ou o IPTU não é cobrado) e se o proprietário já pagou.
 * Quitado à vista: uma linha só (cota única).
 */
export function parcelasIptu(d, p) {
  if (p.pago_avista) {
    return [{ n: 0, rotulo: 'Cota única', comp: p.primeira_competencia || `${p.ano}-02`, valor: p.valor_avista || p.valor_total,
      vencimento: p.vencimento_primeira || null, proprietario: true, paga: p.data_quitacao || null }];
  }
  const valores = p.valor_parcela > 0 ? Array(p.num_parcelas).fill(p.valor_parcela) : C.parcelas(p.valor_total, p.num_parcelas);
  return valores.map((valor, i) => {
    const comp = C.somarMeses(p.primeira_competencia, i);
    const inq = inquilinoPagaIptu(d, p.imovel_id, comp);
    return { n: i + 1, rotulo: `${i + 1}ª`, comp, valor, inquilino: inq,
      vencimento: p.vencimento_primeira ? C.somarMesesData(p.vencimento_primeira, i) : null,
      proprietario: !inq, paga: (p.pagas || {})[i + 1] || null };
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
      const venc = pc.vencimento || `${pc.comp}-10`;
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
      const [n, v] = iptuNaCompetencia(p, comp);
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
      partes: participacoesDo(d, imovel.id), origem: `o imóvel "${imovel.nome}"`,
    };
  }
  if (tipo === 'avulsa') {
    const imovel = registro.imovel_id ? buscar(d, 'imoveis', registro.imovel_id) : null;
    const partes = registro.partes && registro.partes.length ? registro.partes
      : (imovel ? participacoesDo(d, imovel.id) : d.emitentes.filter((e) => e.ativo)
        .map((e, _, l) => ({ emitente_id: e.id, percentual: 100 / l.length })));
    return {
      imovel, valor: registro.valor, partes, origem: 'a NF avulsa',
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
  if (!partes.length) return `Defina em ${base.origem} quais empresas emitem a NF.`;
  const soma = partes.reduce((s, p) => s + p.percentual, 0);
  if (Math.abs(soma - 100) > 1e-6) return `Os percentuais das empresas em ${base.origem} somam ${soma}%, e precisam somar 100%.`;
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
  'solidario_nome', 'solidario_cpf', 'solidario_rg', 'solidario_telefone', 'solidario_email'];
/** Condições do contrato que servem de ponto de partida para o contrato no outro imóvel (são conferidas depois). */
const CAMPOS_CONDICOES = ['prazo_tipo', 'prazo_meses', 'renovacao_automatica', 'indice_correcao', 'aluguel_inicial', 'dia_vencimento',
  'cobranca_mes_seguinte', 'bonificacao', 'desconto_pontualidade_percentual', 'taxa_boleto', 'multa_percentual', 'juros_mensal_percentual',
  'cobrar_iptu', 'cobrar_seguro', 'gerar_nf', 'garantia_tipo'];

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
    Object.assign(novo, { imovel_id: i.id, data_entrada: dados.data_entrada, vigencia_inicio: dados.data_entrada, ativo: true });
    if (novo.prazo_tipo !== 'Indeterminado' && novo.prazo_meses > 0) novo.vigencia_fim = C.fimDoPrazo(dados.data_entrada, novo.prazo_meses);
    c = inserir(d, 'contratos', novo, usuario, `${c.inquilino_nome}: novo contrato no imóvel ${i.nome} (também aluga outro imóvel)`);
  } else {
    atualizar(d, 'contratos', c.id, { imovel_id: i.id, data_entrada: dados.data_entrada, ativo: true }, usuario, `Vinculado ao imóvel ${i.nome}`);
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
  const datas = correcoesDo(d, contrato.id).map((c) => c.data_vigencia);
  return [
    contrato.verificar ? { nivel: 'aviso', tipo: 'A verificar', texto: contrato.verificar } : null,
    alertas.alertaCorrecao(dataBaseCorrecao(contrato), hoje, datas),
    alertaCaucao(d, contrato),
    alertas.alertaReserva(contrato.reserva_valor, saldoReserva(d, contrato), competenciaReserva(contrato), hoje),
    contrato.prazo_tipo === 'Indeterminado' ? null : alertas.alertaVigencia(contrato.vigencia_fim, hoje),
    alertaFiador(d, contrato, hoje),
    alertaAplicacao(d, contrato),
  ].filter(Boolean);
}

/** Seguro obrigatório é do imóvel: só cobra apólice enquanto houver inquilino ativo nele. */
export function alertaSeguroImovel(d, i, hoje = C.hojeIso()) {
  const atual = d.contratos.filter((c) => c.imovel_id === i.id && contratoAtivo(c, hoje)).sort((a, b) => b.data_entrada.localeCompare(a.data_entrada))[0];
  return atual ? alertas.alertaSeguro(dataBaseCorrecao(atual), hoje, segurosDoImovel(d, i.id)) : null;
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
    const contratos = new Set(d.contratos.filter((c) => c.imovel_id === i.id).map((c) => c.id));
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
    const receita = aluguel + avulsas;
    const resultado = receita - iptu;
    const base = (i.valor_imovel || 0) + investido;
    return { imovel: i, receita, aluguel, avulsas, iptu, reformasPeriodo, investido, resultado, base, meses,
      retornoAnual: base ? (resultado * 12 / meses / base) * 100 : null, mesesPagos: pagas.length };
  }).sort((a, b) => (b.retornoAnual ?? -Infinity) - (a.retornoAnual ?? -Infinity));
}
