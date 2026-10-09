// Regras de negócio sobre o banco de dados (um objeto JSON em memória).
// Toda gravação passa por inserir/atualizar/excluir, que registram o histórico.
import * as alertas from './alertas.js';
import * as C from './calculos.js';

export const TABELAS = {
  imoveis: 'Imóvel', contratos: 'Inquilino / contrato', correcoes: 'Correção de aluguel', seguros: 'Seguro',
  iptus: 'IPTU', titularidades: 'Troca de titularidade', cobrancas: 'Cobrança', recebimentos: 'Recebimento Airbnb',
  faturas: 'Fatura', emitentes: 'Empresa', participacoes: 'Empresa no imóvel', usuarios: 'Usuário',
  arquivos: 'Arquivo', banco: 'Banco de dados',
};

export function bancoVazio() {
  const agora = new Date().toISOString();
  const d = { formato: 'imoveis-v1', revisao: 0, criado_em: agora, atualizado_em: null, atualizado_por: null,
    proxima_fatura: 1, seq: {}, historico: [] };
  for (const t of Object.keys(TABELAS)) if (!['arquivos', 'banco'].includes(t)) d[t] = [];
  return d;
}

/** Garante que um banco antigo tenha todas as tabelas (para versões futuras). */
export function normalizar(d) {
  const vazio = bancoVazio();
  for (const [k, v] of Object.entries(vazio)) if (d[k] === undefined) d[k] = v;
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
  return !contrato.data_saida || contrato.data_saida >= dataRef;
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
      total += v;
      rotulos.push(`${rotulo(p)} parc. ${n}/${p.num_parcelas}`);
    }
  }
  return [total, rotulos.join('; ')];
}

/** Calcula (sem gravar) a cobrança de um contrato numa competência. */
export function montarCobranca(d, contrato, comp) {
  const dias = C.diasOcupados(comp, contrato.data_entrada, contrato.data_saida);
  if (dias === 0) return null;
  const [iptu, iptuRot] = contrato.cobrar_iptu
    ? parcelasDoMes(d.iptus.filter((i) => i.imovel_id === contrato.imovel_id), comp, (i) => `IPTU ${i.ano}`)
    : [0, ''];
  const [seguro, seguroRot] = parcelasDoMes(d.seguros.filter((s) => s.contrato_id === contrato.id), comp,
    (s) => `Seguro${s.seguradora ? ` ${s.seguradora}` : ''}`);
  const alvo = competenciaReserva(contrato);
  const reserva = alvo && comp >= alvo ? saldoReserva(d, contrato) : 0;
  const r = C.calcularCobranca({
    competencia: comp, aluguelMensal: aluguelAtual(d, contrato, `${comp}-01`),
    entrada: contrato.data_entrada, saida: contrato.data_saida,
    descontoPercentual: contrato.desconto_pontualidade_percentual, iptu, seguro,
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
  };
}

export function enderecoCompleto(imovel) {
  return [imovel.endereco, imovel.complemento].filter(Boolean).join(', ');
}

function problemaDaFatura(d, base) {
  const partes = participacoesDo(d, base.imovel.id);
  if (!partes.length) return `Defina no imóvel "${base.imovel.nome}" quais empresas emitem a fatura.`;
  const soma = partes.reduce((s, p) => s + p.percentual, 0);
  if (Math.abs(soma - 100) > 1e-9) return `Os percentuais das empresas em "${base.imovel.nome}" somam ${soma}%, e precisam somar 100%.`;
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
    const partes = participacoesDo(d, base.imovel.id);
    const valores = C.dividir(base.valor, partes.map((x) => x.percentual));
    partes.forEach((parte, i) => {
      const e = buscar(d, 'emitentes', parte.emitente_id);
      inserir(d, 'faturas', {
        numero, emissao: p.data, origem_tipo: p.tipo, origem_id: p.registro.id, emitente_id: e.id,
        percentual: parte.percentual, valor: valores[i], periodo_inicio: base.periodo_inicio,
        periodo_fim: base.periodo_fim, municipio: e.municipio || base.imovel.cidade || '',
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
export function alertasContrato(d, contrato, hoje = C.hojeIso()) {
  const datas = correcoesDo(d, contrato.id).map((c) => c.data_vigencia);
  const seguros = d.seguros.filter((s) => s.contrato_id === contrato.id);
  return [
    alertas.alertaCorrecao(contrato.vigencia_inicio, hoje, datas),
    alertas.alertaSeguro(contrato.vigencia_inicio, hoje, seguros),
    alertas.alertaReserva(contrato.reserva_valor, saldoReserva(d, contrato), competenciaReserva(contrato), hoje),
    alertas.alertaVigencia(contrato.vigencia_fim, hoje),
  ].filter(Boolean);
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
  return lista.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
