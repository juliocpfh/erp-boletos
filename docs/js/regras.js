// Regras de negócio sobre o banco de dados (um objeto JSON em memória).
// Toda gravação passa por inserir/atualizar/excluir, que registram o histórico.
import * as alertas from './alertas.js';
import * as C from './calculos.js';

export const TABELAS = {
  imoveis: 'Imóvel', contratos: 'Inquilino / contrato', correcoes: 'Correção de aluguel', seguros: 'Seguro',
  iptus: 'IPTU', titularidades: 'Troca de titularidade', cobrancas: 'Cobrança', recebimentos: 'Recebimento Airbnb',
  faturas: 'Fatura', emitentes: 'Empresa', participacoes: 'Empresa no imóvel', usuarios: 'Usuário',
  fiadores: 'Fiador', aplicacoes: 'Aplicação da garantia', correcoes_garantia: 'Correção da caução',
  renovacoes: 'Renovação / novo valor', trocas_garantia: 'Troca de garantia', leituras: 'Leitura dos relógios', encerramentos: 'Saída do inquilino', avulsas: 'Fatura avulsa',
  arquivos: 'Arquivo', banco: 'Banco de dados',
};

export function bancoVazio() {
  const agora = new Date().toISOString();
  const d = { formato: 'imoveis-v1', revisao: 0, criado_em: agora, atualizado_em: null, atualizado_por: null,
    proxima_fatura: 1, seq: {}, historico: [] };
  for (const t of Object.keys(TABELAS)) if (!['arquivos', 'banco'].includes(t)) d[t] = [];
  return d;
}

/** Garante que um banco antigo tenha todas as tabelas e campos novos. */
export function normalizar(d) {
  const vazio = bancoVazio();
  for (const [k, v] of Object.entries(vazio)) if (d[k] === undefined) d[k] = v;
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
  for (const [k, novo] of Object.entries(dados)) {
    const velho = r[k];
    const a = velho === undefined || velho === null ? '' : velho;
    const b = novo === undefined || novo === null ? '' : novo;
    if (String(a) !== String(b)) mudancas[k] = { de: velho ?? null, para: novo ?? null };
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
/** Fiadores atuais do contrato (os substituídos ficam guardados com data de saída). */
export const fiadoresDo = (d, contratoId) => d.fiadores.filter((f) => f.contrato_id === contratoId && !f.data_saida);
export const fiadoresAnterioresDo = (d, contratoId) => d.fiadores.filter((f) => f.contrato_id === contratoId && f.data_saida)
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

/** Quanto da garantia foi aplicado em cada empresa e o que falta para 100% (metade em cada uma, ou o % definido). */
export function situacaoAplicacao(d, c) {
  const total = valorGarantia(d, c);
  const emitentes = d.emitentes.filter((e) => e.ativo);
  const aplicado = Object.fromEntries(emitentes.map((e) => [e.id, 0]));
  for (const a of aplicacoesDo(d, c.id)) aplicado[a.emitente_id] = (aplicado[a.emitente_id] || 0) + a.valor;
  const metas = C.dividir(total, emitentes.map(() => 100 / (emitentes.length || 1)));
  const linhas = emitentes.map((e, i) => ({ emitente: e, aplicado: aplicado[e.id] || 0, meta: metas[i], falta: metas[i] - (aplicado[e.id] || 0) }));
  const soma = linhas.reduce((s, l) => s + l.aplicado, 0);
  return { total, linhas, soma, ok: total > 0 && soma === total && linhas.every((l) => Math.abs(l.falta) <= 1) };
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

/** O seguro do imóvel entra na cobrança do inquilino que está no imóvel no mês (o mais recente, se trocou no meio do mês). */
function pagaSeguroNoMes(d, contrato, comp) {
  const ocupando = d.contratos.filter((c) => c.imovel_id === contrato.imovel_id && c.ativo !== false && C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0);
  const ultimo = ocupando.sort((a, b) => b.data_entrada.localeCompare(a.data_entrada) || b.id - a.id)[0];
  return ultimo ? ultimo.id === contrato.id : true;
}

/** Calcula (sem gravar) a cobrança de um contrato numa competência. */
export function montarCobranca(d, contrato, comp) {
  const dias = C.diasOcupados(comp, contrato.data_entrada, contrato.data_saida);
  if (dias === 0) return null;
  const [iptu, iptuRot] = contrato.cobrar_iptu
    ? parcelasDoMes(d.iptus.filter((i) => i.imovel_id === contrato.imovel_id), comp, (i) => `IPTU ${i.ano}`)
    : [0, ''];
  const [seguro, seguroRot] = parcelasDoMes(pagaSeguroNoMes(d, contrato, comp) ? segurosDoImovel(d, contrato.imovel_id) : [], comp,
    (s) => `Seguro${s.seguradora ? ` ${s.seguradora}` : ''}`);
  const alvo = competenciaReserva(contrato);
  const reserva = alvo && comp >= alvo ? saldoReserva(d, contrato) : 0;
  const r = C.calcularCobranca({
    competencia: comp, aluguelMensal: aluguelAtual(d, contrato, `${comp}-01`),
    entrada: contrato.data_entrada, saida: contrato.data_saida,
    descontoPercentual: percentualBonificacao(contrato), iptu, seguro,
    taxaBoleto: contrato.taxa_boleto || 0, reservaDisponivel: reserva,
  });
  return {
    contrato_id: contrato.id, competencia: comp,
    vencimento: C.vencimentoDaCompetencia(comp, contrato.dia_vencimento || 10, contrato.cobranca_mes_seguinte !== false),
    dias_cobrados: r.dias_cobrados, dias_mes: r.dias_mes, aluguel_mensal: r.aluguel_mensal,
    aluguel: r.aluguel, desconto: r.desconto, iptu: r.iptu, iptu_parcela: iptuRot, seguro: r.seguro,
    seguro_parcela: seguroRot, taxa_boleto: r.taxa_boleto, outros: 0, outros_descricao: '',
    reserva_utilizada: r.reserva_utilizada,
    multa_percentual: contrato.multa_percentual || 0, juros_mensal_percentual: contrato.juros_mensal_percentual || 0,
    situacao: 'Em aberto', data_pagamento: null, valor_pago: null, dias_atraso: null, multa: null, juros: null,
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
      inserir(d, 'cobrancas', dados, usuario, `Cobrança ${C.compBr(comp)} gerada para ${contrato.inquilino_nome}`);
      geradas += 1;
    }
  }
  return { geradas, existentes };
}

export const totais = (cb) => C.totaisCobranca(cb, cb.reserva_utilizada || 0);

/** Mesma taxa de emissão do boleto para todos os inquilinos ativos e para as cobranças ainda não pagas do mês. */
export function aplicarTaxaBoleto(d, valor, comp, usuario, hoje = C.hojeIso()) {
  if (!Number.isInteger(valor) || valor < 0) throw new Error('Informe um valor válido para a taxa do boleto.');
  let contratos = 0;
  let cobrancas = 0;
  for (const c of d.contratos) {
    if (!contratoAtivo(c, hoje) || (c.taxa_boleto || 0) === valor) continue;
    atualizar(d, 'contratos', c.id, { taxa_boleto: valor }, usuario, `Taxa do boleto ${C.reais(valor)} para todos`);
    contratos += 1;
  }
  for (const cb of d.cobrancas) {
    if (cb.competencia !== comp || cb.data_pagamento || (cb.taxa_boleto || 0) === valor) continue;
    atualizar(d, 'cobrancas', cb.id, { taxa_boleto: valor }, usuario, `Taxa do boleto ${C.reais(valor)} para todos`);
    cobrancas += 1;
  }
  return { contratos, cobrancas };
}

export function registrarPagamento(d, cobrancaId, dataPagamento, valorPago, usuario) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  if (faturasDe(d, 'cobranca', cb.id).length) {
    throw new Error('Esta cobrança já tem fatura emitida. Desfaça o pagamento antes de alterar.');
  }
  const r = C.liquidar(cb, dataPagamento);
  atualizar(d, 'cobrancas', cb.id, {
    data_pagamento: dataPagamento, valor_pago: valorPago ?? r.valor_devido, dias_atraso: r.dias_atraso,
    multa: r.multa, juros: r.juros, valor_nf: r.valor_nf, situacao: r.pontual ? 'Paga em dia' : 'Paga com atraso',
  }, usuario, 'Pagamento confirmado');
  return r;
}

export function estornarPagamento(d, cobrancaId, usuario) {
  cancelarFaturas(d, 'cobranca', cobrancaId, usuario);
  atualizar(d, 'cobrancas', cobrancaId, { data_pagamento: null, valor_pago: null, dias_atraso: null, multa: null,
    juros: null, valor_nf: null, situacao: 'Em aberto' }, usuario, 'Pagamento desfeito');
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
    atualizar(d, 'faturas', f.id, { situacao: 'Cancelada' }, usuario, `Fatura nº ${numeroFatura(f.numero)} cancelada`);
  }
}

export const numeroFatura = (n) => String(n).padStart(4, '0');

/** Cobranças pagas e recebimentos Airbnb que ainda não têm fatura, na ordem do pagamento. */
export function pendentesDeFatura(d) {
  const lista = [];
  for (const cb of d.cobrancas) {
    if (cb.data_pagamento && !faturasDe(d, 'cobranca', cb.id).length) lista.push({ tipo: 'cobranca', registro: cb, data: cb.data_pagamento });
  }
  for (const r of d.recebimentos) {
    if (!faturasDe(d, 'recebimento', r.id).length) lista.push({ tipo: 'recebimento', registro: r, data: r.data_pagamento });
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
      descricao: `${contrato.inquilino_nome} · ${imovel.nome} · ${C.compBr(registro.competencia)}`,
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
      imovel, valor: registro.valor, partes, origem: 'a fatura avulsa',
      periodo_inicio: registro.periodo_inicio || registro.data_pagamento,
      periodo_fim: registro.periodo_fim || registro.data_pagamento,
      descricao: `Avulsa · ${registro.tomador_nome}${registro.descricao ? ` · ${registro.descricao}` : ''}`,
      municipio: registro.municipio || (imovel && imovel.cidade) || '',
      tomador: { nome: registro.tomador_nome, documento: registro.tomador_documento || '',
        telefone: registro.tomador_telefone || '', endereco: registro.tomador_endereco || (imovel ? enderecoCompleto(imovel) : '') },
    };
  }
  const grupo = buscar(d, 'imoveis', registro.imovel_id);
  const unidade = registro.unidade_id ? buscar(d, 'imoveis', registro.unidade_id) : null;
  return {
    imovel: grupo, valor: registro.valor, periodo_inicio: registro.periodo_inicio || registro.data_pagamento,
    periodo_fim: registro.periodo_fim || registro.data_pagamento,
    descricao: `${registro.tomador_nome} · ${grupo.nome}${unidade ? ` / ${unidade.nome}` : ''}`,
    tomador: { nome: registro.tomador_nome, documento: registro.tomador_documento || '',
      telefone: registro.tomador_telefone || '',
      endereco: registro.tomador_endereco || enderecoCompleto(unidade || grupo) },
    partes: participacoesDo(d, grupo.id), origem: `o grupo "${grupo.nome}"`,
  };
}

export function enderecoCompleto(imovel) {
  return [imovel.endereco, imovel.complemento].filter(Boolean).join(', ');
}

function problemaDaFatura(d, base) {
  const partes = base.partes;
  if (!partes.length) return `Defina em ${base.origem} quais empresas emitem a fatura.`;
  const soma = partes.reduce((s, p) => s + p.percentual, 0);
  if (Math.abs(soma - 100) > 1e-6) return `Os percentuais das empresas em ${base.origem} somam ${soma}%, e precisam somar 100%.`;
  if (!(base.valor > 0)) return `Valor da fatura zerado em ${base.descricao}.`;
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
        tomador_telefone: base.tomador.telefone, tomador_endereco: base.tomador.endereco, situacao: 'Emitida',
      }, usuario, `Fatura nº ${numeroFatura(numero)} · ${e.nome} · ${base.descricao}`);
    });
    d.proxima_fatura = numero + 1;
    numeradas.push({ numero, ...p, descricao: base.descricao });
  }
  return { numeradas, foraDeOrdem: [], problema: null, ultima };
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
    inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: dados.data, indice: 'Negociado',
      percentual: anterior ? C.percentualPorDesconto(anterior, dados.novo_valor - anterior) : 0,
      valor_anterior: anterior, valor_novo: dados.novo_valor, observacoes: dados.tipo }, usuario, `Novo valor negociado: ${C.reais(dados.novo_valor)}`);
  }
  return r;
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

/** Vincula ao imóvel um inquilino cadastrado sem imóvel e grava a leitura dos relógios na entrada. */
export function vincularInquilino(d, imovelId, dados, usuario) {
  const c = buscar(d, 'contratos', dados.contrato_id);
  if (!c) throw new Error('Inquilino não encontrado.');
  if (c.imovel_id) throw new Error('Este inquilino já está vinculado a um imóvel.');
  const i = buscar(d, 'imoveis', imovelId);
  const leitura = separarLeitura(dados);
  atualizar(d, 'contratos', c.id, { imovel_id: i.id, data_entrada: dados.data_entrada, ativo: true }, usuario, `Vinculado ao imóvel ${i.nome}`);
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
  return { nivel: 'info', tipo: 'Aplicação da garantia',
    texto: `Garantia de ${C.reais(s.total)}: ${s.linhas.map((l) => `${l.emitente.nome.split(/\s+/)[0]} ${C.reais(l.aplicado)} de ${C.reais(l.meta)}`).join(', ')}. Confirme onde o valor foi aplicado.` };
}

export function alertasContrato(d, contrato, hoje = C.hojeIso()) {
  const datas = correcoesDo(d, contrato.id).map((c) => c.data_vigencia);
  return [
    contrato.verificar ? { nivel: 'aviso', tipo: 'A verificar', texto: contrato.verificar } : null,
    alertas.alertaCorrecao(dataBaseCorrecao(contrato), hoje, datas),
    alertaCaucao(d, contrato),
    alertas.alertaReserva(contrato.reserva_valor, saldoReserva(d, contrato), competenciaReserva(contrato), hoje),
    contrato.prazo_tipo === 'Indeterminado' ? null : alertas.alertaVigencia(contrato.vigencia_fim, hoje),
    temFiador(contrato) && !fiadoresDo(d, contrato.id).length ? { nivel: 'aviso', tipo: 'Fiador', texto: 'Garantia por fiador, mas nenhum fiador cadastrado.' } : null,
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
  for (const i of d.imoveis) {
    const a = alertaSeguroImovel(d, i, hoje);
    if (a) lista.push({ ...a, imovel_id: i.id, imovel: i.nome, inquilino: '' });
    if (i.verificar) lista.push({ nivel: 'aviso', tipo: 'A verificar', texto: i.verificar, imovel_id: i.id, imovel: i.nome, inquilino: '' });
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
  linhas.push(cb.dias_cobrados < cb.dias_mes ? `ALUGUEL ${cb.dias_cobrados}/${cb.dias_mes} DIAS ${rs(cb.aluguel)}` : `ALUGUEL ${rs(cb.aluguel)}`);
  if (cb.desconto) linhas.push(`COM BONF. ${rs(cb.aluguel - cb.desconto)}`);
  const extras = [];
  if (cb.iptu) extras.push(`IPTU ${rs(cb.iptu)}`);
  if (cb.seguro) {
    const parc = /(\d+\/\d+)/.exec(cb.seguro_parcela || '');
    extras.push(`SEGURO${parc ? parc[1] : ''} ${rs(cb.seguro)}`);
  }
  if (cb.outros) extras.push(`${(cb.outros_descricao || 'OUTROS').toLocaleUpperCase('pt-BR')} ${rs(cb.outros)}`);
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
