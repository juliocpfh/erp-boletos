// Regras de negócio sobre o banco de dados (um objeto JSON em memória).
// Toda gravação passa por inserir/atualizar/excluir, que registram o histórico.
import * as alertas from './alertas.js';
import * as C from './calculos.js';
import { locadorasDoContrato } from './contratos.js';

export const TABELAS = {
  imoveis: 'Imóvel', contratos: 'Inquilino / contrato', correcoes: 'Correção de aluguel', seguros: 'Seguro',
  iptus: 'IPTU', titularidades: 'Troca de titularidade', cobrancas: 'Boleto', recebimentos: 'Recebimento Airbnb',
  faturas: 'NF', emitentes: 'Empresa', participacoes: 'Empresa no imóvel', usuarios: 'Usuário',
  fiadores: 'Fiador', aplicacoes: 'Aplicação da garantia', correcoes_garantia: 'Correção da caução', depositos_garantia: 'Depósito da caução / garantia',
  renovacoes: 'Renovação / novo valor', trocas_garantia: 'Troca de garantia', leituras: 'Leitura dos relógios', encerramentos: 'Saída do inquilino', avulsas: 'NF avulsa',
  reformas: 'Reforma / investimento', solicitacoes: 'Solicitação do inquilino',
  indices_acumulados: 'Índice acumulado em 12 meses', cartas_reajuste: 'Carta de reajuste', modelos_contrato: 'Modelo de contrato', vistorias: 'Vistoria', aditivos: 'Termo aditivo', despesas: 'Conta paga por nós', ressarcimentos: 'Ressarcimento de condomínio', fechamentos: 'Etapa do fechamento do mês', guias_impostos: 'Guia de imposto', arquivos: 'Arquivo', banco: 'Banco de dados', listas: 'Lista de opções',
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
  // o Estado (UF) do imóvel passou a ser guardado: vem do CEP
  for (const i of d.imoveis) if (!i.uf && C.ufDoCep(i.cep)) i.uf = C.ufDoCep(i.cep);
  // contrato sem imóvel passou a ter prazo para ser vinculado: os que já existiam contam a partir de hoje
  for (const c of d.contratos) if (!c.imovel_id && !c.sem_imovel_desde) c.sem_imovel_desde = C.hojeIso();
  // caução: a data prevista é a do contrato e o valor vem dos aluguéis × aluguel com bonificação (contratos que ficaram sem)
  for (const c of d.contratos) if (c.garantia_tipo === 'Caução') completarCaucao(c);
  // "Possui termo aditivo" passou a valer só com um termo registrado (antes era marcado ao mudar o vencimento ou a garantia)
  // (o termo gerado e ainda não assinado, sem arquivo, não conta)
  for (const c of d.contratos) c.possui_aditivos = d.aditivos.some((a) => a.contrato_id === c.id && a.arquivo);
  return d;
}

/**
 * Ordem da caução: 1º as condições do contrato (valor e data prevista = data do contrato), 2º a assinatura,
 * 3º o comprovante. Sem data: a do início do contrato; sem valor: aluguéis × aluguel inicial com bonificação.
 */
export function completarCaucao(c) {
  if (!c.caucao_data) c.caucao_data = c.vigencia_inicio || c.data_entrada || null;
  if (!(c.caucao_valor > 0) && c.caucao_meses > 0 && c.aluguel_inicial > 0) {
    const a = c.aluguel_inicial;
    c.caucao_valor = c.caucao_meses * (a - C.descontoPorPercentual(a, percentualBonificacao(c)));
  }
  return c;
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

// --------------------------------------------------------------------------
// Desfazer alterações pelo histórico (só administrador): sempre da mais recente para a mais antiga, campo a campo.
// Boletos, pagamentos, NFs e usuários ficam de fora (têm botões próprios); a pasta não volta (a pasta no disco não muda).
// --------------------------------------------------------------------------
const SEM_DESFAZER = new Set(['cobrancas', 'faturas', 'recebimentos', 'avulsas', 'usuarios', 'banco', 'listas', 'fechamentos', 'arquivos']);
const CAMPOS_SEM_DESFAZER = new Set(['pasta']);
const textoComparar = (x) => (x === undefined || x === null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x));

/**
 * Campos que podem ser desfeitos agora: Set de "índice no histórico:campo". Para cada campo de cada registro só vale a
 * alteração mais recente ainda não desfeita, e só se o valor atual ainda é o que ela gravou. Desfeita a última,
 * a anterior passa a poder ser desfeita (até voltar ao valor original).
 */
export function alteracoesDesfaziveis(d) {
  const desfeitos = new Set();
  d.historico.forEach((h) => { if (h.desfaz !== undefined && h.detalhes) for (const k of Object.keys(h.detalhes)) desfeitos.add(`${h.desfaz}:${k}`); });
  const topo = new Map();
  d.historico.forEach((h, i) => {
    if (h.acao !== 'Alteração' || !h.tabela || h.registro_id === null || !h.detalhes || h.desfaz !== undefined) return;
    for (const [k, m] of Object.entries(h.detalhes)) {
      if (m && typeof m === 'object' && 'de' in m && !desfeitos.has(`${i}:${k}`)) topo.set(`${h.tabela}:${h.registro_id}:${k}`, i);
    }
  });
  const out = new Set();
  for (const [chave, i] of topo) {
    const h = d.historico[i];
    const k = chave.split(':').slice(2).join(':');
    if (SEM_DESFAZER.has(h.tabela) || CAMPOS_SEM_DESFAZER.has(k) || !Array.isArray(d[h.tabela])) continue;
    const r = buscar(d, h.tabela, h.registro_id);
    if (r && textoComparar(r[k]) === textoComparar(h.detalhes[k].para)) out.add(`${i}:${k}`);
  }
  return out;
}

/**
 * Desfaz as alterações escolhidas (["índice:campo", ...]): o campo volta ao valor de antes daquela alteração.
 * Cada volta fica no histórico como "Desfeito pelo administrador". Devolve [{ tabela, id }] dos registros mudados.
 */
export function desfazerAlteracoes(d, itens, usuario) {
  const porIndice = new Map();
  for (const x of itens) {
    const p = String(x).indexOf(':');
    const i = Number(String(x).slice(0, p));
    porIndice.set(i, [...(porIndice.get(i) || []), String(x).slice(p + 1)]);
  }
  const mudados = [];
  for (const i of [...porIndice.keys()].sort((a, b) => b - a)) {
    const pode = alteracoesDesfaziveis(d);
    const campos = porIndice.get(i).filter((k) => pode.has(`${i}:${k}`));
    if (!campos.length) throw new Error('Esta alteração não pode mais ser desfeita: desfaça antes a mais recente do mesmo campo (ou o valor já mudou).');
    const h = d.historico[i];
    const r = buscar(d, h.tabela, h.registro_id);
    const det = Object.fromEntries(campos.map((k) => [k, { de: r[k] ?? null, para: h.detalhes[k].de ?? null }]));
    for (const k of campos) r[k] = h.detalhes[k].de ?? null;
    registrar(d, usuario, 'Alteração', h.tabela, r.id, `Desfeito pelo administrador (alteração de ${h.usuario} em ${new Date(h.quando).toLocaleString('pt-BR')})${h.descricao ? `: ${h.descricao}` : ''}`,
      det, vinculos(d, h.tabela, r));
    d.historico[d.historico.length - 1].desfaz = i;
    mudados.push({ tabela: h.tabela, id: r.id });
  }
  return mudados;
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

/**
 * Correções refeitas em cadeia a partir de um aluguel inicial (ex.: o inicial foi lançado errado e corrigido no cadastro).
 * Reajuste por índice: o mesmo % sobre o novo valor anterior. Novo valor negociado: o valor combinado fica; só o
 * valor anterior e o % mudam. Devolve só as que mudam: [{ x, valor_anterior, valor_novo, percentual }].
 */
export function correcoesRecalculadas(d, c, inicial) {
  let anterior = inicial;
  const mudam = [];
  for (const x of correcoesDo(d, c.id)) {
    // valor anterior já certo: a correção fica como está (sem refazer o % e mexer em centavos)
    if (anterior === x.valor_anterior) { anterior = x.valor_novo; continue; }
    const porIndice = x.indice !== 'Negociado' && x.percentual !== null && x.percentual !== undefined;
    const valorNovo = porIndice ? C.aplicarCorrecao(anterior, x.percentual) : x.valor_novo;
    const percentual = porIndice ? x.percentual : (anterior ? C.percentualPorDesconto(anterior, x.valor_novo - anterior) : 0);
    mudam.push({ x, valor_anterior: anterior, valor_novo: valorNovo, percentual });
    anterior = valorNovo;
  }
  return mudam;
}

/** Refaz as correções do contrato a partir do aluguel inicial gravado (depois de corrigir o inicial no cadastro). */
export function recalcularCorrecoes(d, contratoId, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const mudam = correcoesRecalculadas(d, c, c.aluguel_inicial);
  for (const m of mudam) {
    atualizar(d, 'correcoes', m.x.id, { valor_anterior: m.valor_anterior, valor_novo: m.valor_novo, percentual: m.percentual }, usuario,
      `Correção de ${C.dataBr(m.x.data_vigencia)} refeita com o aluguel inicial corrigido: ${C.reais(m.x.valor_novo)} → ${C.reais(m.valor_novo)}`);
  }
  return mudam.length;
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
/** Fiadores do contrato assinado (atuais ou anteriores): todos menos os que entraram numa troca de garantia. */
export const fiadoresDoContrato = (d, contratoId) => d.fiadores
  .filter((f) => f.contrato_id === contratoId && !d.trocas_garantia.some((t) => (t.fiadores_novos || []).includes(f.id)))
  .sort((a, b) => a.id - b.id);
export const fiadoresAnterioresDo =(d, contratoId, hoje = C.hojeIso()) => d.fiadores.filter((f) => f.contrato_id === contratoId && f.data_saida && f.data_saida < hoje)
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
/** Caução ou depósito já depositado, com o comprovante anexado: só então conta (caução atual, aplicação, complemento). */
// registrada em depósitos (``*_por_depositos``): conta quando a soma completa, mesmo com comprovante a buscar no banco
export const garantiaDepositada = (c) => (temCaucao(c) ? !!(c.comprovante_caucao || c.caucao_por_depositos) : temDeposito(c) ? !!(c.comprovante_deposito || c.deposito_por_depositos) : false);

export function valorGarantia(d, c) {
  // registrada em depósitos (parcelas): vale a soma do que foi depositado; depósitos para completar (depois de registrada)
  // somam ao valor (os de antes da última correção da caução já estão nela)
  const qual = temCaucao(c) ? 'caucao' : temDeposito(c) ? 'deposito' : null;
  if (!qual) return 0;
  const deps = depositosGarantiaDo(d, c, qual);
  const cs = qual === 'caucao' ? correcoesCaucaoAtual(d, c) : [];
  const ult = cs[cs.length - 1];
  const soma = (l) => l.reduce((s, x) => s + x.valor, 0);
  const extras = soma(deps.filter((x) => x.complementar && (!ult || x.data > ult.data)));
  if (ult) return ult.valor_novo + extras;
  return (soma(deps.filter((x) => !x.complementar)) || (qual === 'caucao' ? c.caucao_valor : c.deposito_valor) || 0) + extras;
}

/** Troca de garantia em vigor (os depósitos de antes dela são da garantia anterior). */
const trocaAtual = (d, c) => (trocasGarantiaDo(d, c.id)[0] || {}).id || null;
/**
 * Depósitos da caução (qual = "caucao") ou do depósito de garantia ("deposito") da garantia atual, um a um, cada um com
 * o seu comprovante: a garantia pode ser paga em parcelas de valores diferentes.
 */
export const depositosGarantiaDo = (d, c, qual) => (d.depositos_garantia || [])
  .filter((x) => x.contrato_id === c.id && x.qual === qual && (x.troca_id || null) === trocaAtual(d, c))
  .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
export const somaDepositos = (d, c, qual) => depositosGarantiaDo(d, c, qual).reduce((s, x) => s + x.valor, 0);

/**
 * Quanto falta depositar: o valor combinado (caução ou depósito do contrato ou da troca) ou, na caução com o aluguel já
 * corrigido, aluguéis × aluguel atual com bonificação, se for maior. Ex.: caução combinada R$ 5.400,00; aluguel corrigido
 * pede R$ 5.670,00; depositados R$ 2.000,00 e R$ 1.500,00 → falta R$ 2.170,00.
 */
export function garantiaADepositar(d, c, qual, hoje = C.hojeIso()) {
  // caução corrigida à mão ("Corrigir caução") antes de completar: vale o novo valor
  const corrigidaAMao = qual === 'caucao' ? correcoesCaucaoAtual(d, c).pop() : null;
  const combinado = (corrigidaAMao ? corrigidaAMao.valor_novo : (qual === 'caucao' ? c.caucao_valor : c.deposito_valor)) || 0;
  const sugerida = qual === 'caucao' && correcoesDo(d, c.id).some((x) => x.data_vigencia <= hoje) ? caucaoSugerida(d, c, hoje) : null;
  const corrigida = sugerida > combinado ? sugerida : null;
  const necessaria = corrigida || combinado;
  const depositos = depositosGarantiaDo(d, c, qual);
  // já registrada: o que está depositado é a caução atual (inicial + correções + depósitos para completar)
  const depositado = garantiaDepositada(c) ? valorGarantia(d, c) : depositos.reduce((s, x) => s + x.valor, 0);
  return { combinado, corrigida, necessaria, depositos, depositado, falta: Math.max(necessaria - depositado, 0) };
}

/** Caução sugerida: número de aluguéis × aluguel atual com bonificação. */
export function caucaoSugerida(d, c, dataRef = C.hojeIso()) {
  if (!(c.caucao_meses > 0)) return null;
  const aluguel = aluguelAtual(d, c, dataRef);
  return c.caucao_meses * (aluguel - C.descontoPorPercentual(aluguel, percentualBonificacao(c)));
}

/** Boleto à parte só com o complemento da caução: sem tarifa, sem NF, não é o boleto do aluguel do mês. */
export const ehComplementoCaucao = (cb) => cb.caucao_complemento > 0;
/** Boleto do aluguel do contrato na competência (o do complemento da caução não conta). */
export const boletoDoMes = (d, contratoId, comp) => d.cobrancas.find((x) => x.contrato_id === contratoId && x.competencia === comp && !ehComplementoCaucao(x)) || null;

/**
 * Caução depois de um reajuste ou novo valor do aluguel (correção posterior à última caução registrada): a necessária
 * (aluguéis × aluguel corrigido com bonificação; null se o contrato não diz quantos aluguéis), a já depositada,
 * o complemento a depositar e o boleto do complemento ainda não pago. Null quando não há correção pendente.
 */
export function complementoCaucao(d, c) {
  if (!temCaucao(c) || !c.caucao_valor || !garantiaDepositada(c)) return null;
  const ultimaCaucao = correcoesCaucaoAtual(d, c).map((x) => x.data).pop() || c.caucao_data || '';
  const correcao = correcoesDo(d, c.id).filter((x) => x.data_vigencia > ultimaCaucao).pop();
  if (!correcao) return null;
  const atual = valorGarantia(d, c);
  const necessaria = caucaoSugerida(d, c, correcao.data_vigencia);
  const boleto = d.cobrancas.find((x) => x.contrato_id === c.id && ehComplementoCaucao(x) && !x.data_pagamento) || null;
  return { correcao, competencia: correcao.data_vigencia.slice(0, 7), atual, necessaria,
    complemento: necessaria === null ? null : necessaria - atual, boleto };
}

/** Contratos ativos com complemento da caução a cobrar até a competência ``comp`` e sem boleto gerado: [{ contrato, ...complementoCaucao }]. */
export function complementosCaucaoPendentes(d, comp) {
  return d.contratos.filter((c) => c.ativo !== false && c.imovel_id && contratoAtivo(c, `${comp}-01`)).map((c) => ({ contrato: c, ...complementoCaucao(d, c) }))
    .filter((x) => x.correcao && !x.boleto && x.complemento > 0 && x.competencia <= comp);
}

/**
 * Gera o boleto do complemento da caução, com o vencimento do primeiro aluguel corrigido (sem tarifa e sem NF).
 * ``comp``: competência em que está sendo gerado (ao gerar os boletos de um mês depois do aluguel corrigido, vai com o desse mês).
 */
export function gerarBoletoCaucao(d, contratoId, usuario, comp = null) {
  const c = buscar(d, 'contratos', contratoId);
  const x = complementoCaucao(d, c);
  if (!x) throw new Error('Não há correção do aluguel esperando a correção da caução.');
  if (x.boleto) throw new Error('O boleto do complemento da caução já foi gerado.');
  if (x.necessaria === null) throw new Error('Informe no contrato a quantos aluguéis a caução equivale.');
  if (!(x.complemento > 0)) throw new Error('A caução depositada já cobre o valor necessário.');
  comp = comp && comp > x.competencia ? comp : x.competencia;
  return inserir(d, 'cobrancas', {
    contrato_id: c.id, competencia: comp,
    vencimento: C.vencimentoDaCompetencia(comp, c.dia_vencimento || 10, c.cobranca_mes_seguinte !== false),
    dias_cobrados: C.diasNoMes(comp), dias_mes: C.diasNoMes(comp), aluguel_mensal: 0, aluguel: 0, desconto: 0,
    iptu: 0, iptu_parcela: '', seguro: 0, seguro_parcela: '', taxa_boleto: 0, outros: x.complemento, outros_descricao: 'Complemento da caução',
    reserva_utilizada: 0, carencia: false, ressarcimento: 0, ressarcimento_descricao: '', ressarcimento_na_nf: false,
    caucao_complemento: x.complemento, caucao_anterior: x.atual, caucao_nova: x.necessaria, caucao_vigencia: x.correcao.data_vigencia,
    multa_percentual: c.multa_percentual || 0, juros_mensal_percentual: c.juros_mensal_percentual || 0,
    situacao: 'Em aberto', data_pagamento: null, valor_pago: null, dias_atraso: null, multa: null, juros: null, valor_nf: null,
  }, usuario, `Boleto do complemento da caução gerado para ${c.inquilino_nome}: ${C.reais(x.complemento)} (caução de ${C.reais(x.atual)} para ${C.reais(x.necessaria)})`);
}

/** Onde a garantia foi aplicada (em qualquer empresa, sem divisão obrigatória) e quanto falta aplicar. */
/** Onde a aplicação foi depositada: a empresa ou outra pessoa (ex.: conta do dono do imóvel). { id, nome, pessoa }. */
export function recebedorDaAplicacao(d, a) {
  if (a.recebedor) return { id: null, nome: a.recebedor, pessoa: true };
  return d.emitentes.find((e) => e.id === a.emitente_id) || { id: a.emitente_id, nome: 'Empresa excluída' };
}
/** Nomes de outras pessoas já usados nas aplicações (para escolher de novo sem digitar). */
export const recebedoresUsados = (d) => [...new Set(d.aplicacoes.map((a) => a.recebedor).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

export function situacaoAplicacao(d, c) {
  // ainda em depósitos (caução incompleta): o que já foi depositado pode ser aplicado
  const total = garantiaDepositada(c) ? valorGarantia(d, c) : temCaucao(c) ? somaDepositos(d, c, 'caucao') : temDeposito(c) ? somaDepositos(d, c, 'deposito') : 0;
  const aplicado = new Map();
  for (const a of aplicacoesDo(d, c.id)) {
    const chave = a.recebedor ? `p:${a.recebedor}` : `e:${a.emitente_id}`;
    const x = aplicado.get(chave) || { emitente: recebedorDaAplicacao(d, a), aplicado: 0 };
    x.aplicado += a.valor;
    aplicado.set(chave, x);
  }
  const linhas = [...aplicado.values()];
  const soma = linhas.reduce((s, l) => s + l.aplicado, 0);
  return { total, linhas, soma, falta: total - soma, ok: total > 0 && soma >= total };
}

export function competenciaReserva(contrato) {
  if (!(contrato.reserva_valor > 0)) return null;
  return contrato.reserva_competencia || C.competenciaDe(contrato.data_entrada);
}

/** ``ignorar``: id de um boleto, ou função (boleto) => true para os boletos que não contam (os que estão sendo recalculados). */
const ignorados = (ignorar) => (typeof ignorar === 'function' ? ignorar : (cb) => cb.id === ignorar);

/** Saldo da reserva: o valor menos o já usado nos boletos e o marcado como abatido fora do sistema (contratos antigos). */
export function saldoReserva(d, contrato, ignorarCobranca = null) {
  const fora = ignorados(ignorarCobranca);
  const usado = d.cobrancas.filter((cb) => cb.contrato_id === contrato.id && !fora(cb))
    .reduce((s, cb) => s + (cb.reserva_utilizada || 0), 0);
  return Math.max((contrato.reserva_valor || 0) - usado - (contrato.reserva_abatida_valor || 0), 0);
}

/** Reserva já usada em boletos pagos (não muda com o recálculo). */
const reservaUsadaPaga = (d, c) => d.cobrancas.filter((cb) => cb.contrato_id === c.id && cb.data_pagamento).reduce((s, cb) => s + (cb.reserva_utilizada || 0), 0);
/** Quanto ainda pode ser marcado como abatido fora do sistema: a reserva menos o já usado em boletos pagos. */
export const reservaParaMarcarAbatida = (d, c) => Math.max((c.reserva_valor || 0) - reservaUsadaPaga(d, c), 0);

/**
 * Contrato antigo: a reserva já foi abatida em aluguéis de antes do sistema. Marca o mês (AAAA-MM) e o valor;
 * a reserva sai dos boletos em aberto e não é mais usada. Ex.: reserva de R$ 500,00 abatida em 03/2024.
 */
export function marcarReservaAbatida(d, contratoId, { competencia, valor }, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  if (!(c.reserva_valor > 0)) throw new Error('Este contrato não tem reserva.');
  if (!/^\d{4}-\d{2}$/.test(competencia || '')) throw new Error('Informe o mês em que a reserva foi abatida.');
  const max = reservaParaMarcarAbatida(d, c);
  if (!(valor > 0)) throw new Error('Informe o valor abatido.');
  if (valor > max) throw new Error(`O valor abatido não pode passar de ${C.reais(max)} (reserva${max < c.reserva_valor ? ' menos o já usado em boletos pagos' : ''}).`);
  atualizar(d, 'contratos', c.id, { reserva_abatida_comp: competencia, reserva_abatida_valor: valor }, usuario,
    `${c.inquilino_nome}: reserva marcada como abatida em ${C.compBr(competencia)} (${C.reais(valor)})`);
  return realocarReserva(d, c, usuario);
}

/** Exclui o registro de reserva abatida fora do sistema: ela volta a abater os boletos em aberto. */
export function desmarcarReservaAbatida(d, contratoId, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  atualizar(d, 'contratos', c.id, { reserva_abatida_comp: null, reserva_abatida_valor: null }, usuario, `${c.inquilino_nome}: registro de reserva abatida excluído`);
  return realocarReserva(d, c, usuario);
}

/**
 * Reserva que pode abater o boleto da competência ``comp``: começa exatamente no aluguel marcado e, se sobrar
 * (reserva maior que o boleto), segue nos meses seguintes. Nunca "pula" para um mês depois do marcado: se o boleto
 * do mês marcado já foi pago sem ela, ou não está no sistema, ela fica parada e aparece um aviso para escolher outro mês.
 */
export function reservaParaCompetencia(d, contrato, comp, ignorar = null) {
  const alvo = competenciaReserva(contrato);
  if (!alvo || comp < alvo) return 0;
  if (comp > alvo) {
    const fora = ignorados(ignorar);
    const comecou = d.cobrancas.some((cb) => cb.contrato_id === contrato.id && !fora(cb) && cb.competencia >= alvo && cb.competencia < comp && cb.reserva_utilizada > 0);
    if (!comecou) return 0;
  }
  return saldoReserva(d, contrato, ignorar);
}

/**
 * Redistribui a reserva pelos boletos em aberto do contrato (também os alterados à mão: só o campo da reserva muda),
 * do mês marcado em diante. Boleto já pago fica como está. Devolve quantos boletos mudaram.
 */
export function realocarReserva(d, contrato, usuario) {
  if (!(contrato.reserva_valor > 0)) return 0;
  const abertos = d.cobrancas.filter((cb) => cb.contrato_id === contrato.id && !cb.data_pagamento && !ehComplementoCaucao(cb))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));
  const livres = new Set(abertos.map((cb) => cb.id));
  let n = 0;
  for (const cb of abertos) {
    const disponivel = reservaParaCompetencia(d, contrato, cb.competencia, (x) => livres.has(x.id));
    const usar = cb.carencia ? 0 : C.totaisCobranca(cb, disponivel).reserva_utilizada;
    livres.delete(cb.id);
    if ((cb.reserva_utilizada || 0) !== usar) {
      atualizar(d, 'cobrancas', cb.id, { reserva_utilizada: usar }, usuario, `Boleto ${C.compBr(cb.competencia)}: reserva ${usar ? `de ${C.reais(usar)} aplicada` : 'retirada'}`);
      n += 1;
    }
  }
  return n;
}

/** Reserva que não foi usada no mês marcado (boleto já pago sem ela, ou mês fora do sistema): pede para escolher outro mês. */
export function alertaReservaParada(d, contrato) {
  const alvo = competenciaReserva(contrato);
  if (!alvo) return null;
  const saldo = saldoReserva(d, contrato);
  if (contrato.reserva_abatida_valor > 0 && !(saldo > 0)) return null; // já abatida fora do sistema
  const doContrato = d.cobrancas.filter((cb) => cb.contrato_id === contrato.id && !ehComplementoCaucao(cb));
  const presa = doContrato.find((cb) => cb.reserva_utilizada > 0 && cb.data_pagamento && cb.competencia > alvo);
  const alvoAberto = doContrato.find((cb) => cb.competencia === alvo && !cb.data_pagamento);
  if (presa && alvoAberto) {
    return { nivel: 'aviso', tipo: 'Reserva do imóvel', ancora: 'reserva',
      texto: `A reserva de ${C.reais(presa.reserva_utilizada)} está no boleto de ${C.compBr(presa.competencia)}, que já foi pago, mas deveria abater o de ${C.compBr(alvo)}. Para mudar: desfaça o pagamento de ${C.compBr(presa.competencia)} e clique em "Reaplicar a reserva"; ou deixe como está escolhendo ${C.compBr(presa.competencia)} em "Usar a reserva no aluguel de".` };
  }
  if (!(saldo > 0) || doContrato.some((cb) => cb.reserva_utilizada > 0)) return null;
  const doAlvo = doContrato.find((cb) => cb.competencia === alvo);
  const motivo = doAlvo && doAlvo.data_pagamento ? `o boleto de ${C.compBr(alvo)} já foi pago sem ela`
    : !doAlvo && doContrato.some((cb) => cb.competencia > alvo) ? `o boleto de ${C.compBr(alvo)} não está no sistema` : '';
  return motivo ? { nivel: 'aviso', tipo: 'Reserva do imóvel', ancora: 'reserva',
    texto: `Reserva de ${C.reais(saldo)} marcada para o aluguel de ${C.compBr(alvo)} não foi usada: ${motivo}. Em "Editar", escolha em "Usar a reserva no aluguel de" o mês do boleto em aberto que deve receber o desconto; se ela já foi abatida em aluguéis antigos, use "Marcar como já abatida" na página do inquilino.` } : null;
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

/**
 * Quanto da parcela n cada inquilino paga no boleto: proporcional aos dias ocupados no mês, como no boleto
 * (mês de entrada ou saída parcial; carência sem IPTU = nada). O que sobra é a parte do proprietário.
 */
function inquilinosDaParcela(d, p, n, valor) {
  const lista = [];
  for (const c of d.contratos.filter((x) => x.imovel_id === p.imovel_id && x.ativo !== false && x.cobrar_iptu)) {
    const comp = competenciaDaParcela(p, n, c);
    const dias = comp ? C.diasOcupados(comp, c.data_entrada, c.data_saida) : 0;
    if (!dias || (emCarencia(c, comp) && !c.carencia_cobrar_iptu)) continue;
    lista.push({ contrato: c, comp, dias, diasMes: C.diasNoMes(comp), valor: C.aluguelProporcional(valor, dias, C.diasNoMes(comp)) });
  }
  return lista;
}

/**
 * Parcelas do IPTU na prefeitura (o proprietário paga todas as guias). Em cada uma: a parte dos inquilinos (no boleto,
 * proporcional aos dias) e a parte do proprietário (dias vazios, IPTU não cobrado, carência). paga = guia paga.
 * Quitado à vista: uma linha só (cota única, com o valor pago à vista).
 */
export function parcelasIptu(d, p) {
  if (p.pago_avista) {
    const valor = p.valor_avista || p.valor_total;
    return [{ n: 0, rotulo: 'Cota única', comp: null, valor, inquilinos: [], valorInquilino: 0, valorProprietario: valor,
      vencimento: p.vencimento_primeira || null, proprietario: true, paga: p.data_quitacao || null }];
  }
  return valoresIptu(p).map((valor, i) => {
    const inquilinos = inquilinosDaParcela(d, p, i + 1, valor);
    const valorInquilino = Math.min(valor, inquilinos.reduce((s, x) => s + x.valor, 0));
    return { n: i + 1, rotulo: `${i + 1}ª`, comp: inquilinos.length ? inquilinos[0].comp : null, mesBoleto: mesBoletoDaParcela(p, i + 1), valor,
      inquilinos, inquilino: inquilinos.length ? inquilinos[0].contrato : null, valorInquilino, valorProprietario: valor - valorInquilino,
      vencimento: vencimentoParcela(p, i + 1), proprietario: valorInquilino < valor, paga: (p.pagas || {})[i + 1] || null };
  });
}

/**
 * Totais do IPTU no ano: quanto os inquilinos pagam nos boletos e quanto fica com o proprietário (e quanto dessa parte
 * ainda está em guia não paga). À vista: o inquilino paga conforme "Inquilino que entrar" (1/12 ou parcelas) nos meses ocupados.
 */
export function totaisIptu(d, p) {
  const ps = parcelasIptu(d, p);
  let inquilino = ps.reduce((s, x) => s + x.valorInquilino, 0);
  if (p.pago_avista) {
    for (const c of d.contratos.filter((x) => x.imovel_id === p.imovel_id && x.ativo !== false && x.cobrar_iptu)) {
      for (let k = 0, comp = `${p.ano - 1}-01`; k < 36; k += 1, comp = C.somarMeses(comp, 1)) {
        const [n, v] = iptuNaCompetencia(p, comp, c);
        const dias = n ? C.diasOcupados(comp, c.data_entrada, c.data_saida) : 0;
        if (dias && !(emCarencia(c, comp) && !c.carencia_cobrar_iptu)) inquilino += C.aluguelProporcional(v, dias, C.diasNoMes(comp));
      }
    }
  }
  const custo = ps.reduce((s, x) => s + x.valor, 0);
  return { custo, inquilino, proprietario: custo - inquilino,
    emAberto: ps.filter((x) => x.proprietario && !x.paga).reduce((s, x) => s + x.valorProprietario, 0) };
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
        texto: `IPTU ${p.ano} ${pc.rotulo} ${pc.n ? 'parcela' : ''} de ${C.reais(pc.valor)} ${faltam < 0 ? `venceu em ${C.dataBr(venc)}` : `vence em ${C.dataBr(venc)}`}${pc.vencimento ? '' : ' (vencimento estimado)'}. ${pc.n === 0 ? 'Pago à vista pelo proprietário.' : pc.valorInquilino ? `Sua parte: ${C.reais(pc.valorProprietario)} (o inquilino paga ${C.reais(pc.valorInquilino)} no boleto, pelos dias em que ocupou).` : 'Imóvel vazio ou sem cobrança de IPTU: a parcela é toda sua.'}`.replace('  ', ' ') });
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
  const reserva = reservaParaCompetencia(d, contrato, comp, ignorarCobranca);
  const ressarc = ressarcimentosNoBoleto(d, contrato.id, comp);
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
    ressarcimento: ressarc.valor, ressarcimento_descricao: ressarc.descricao, ressarcimento_na_nf: !!d.ressarcimento_abate_nf && ressarc.valor > 0,
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
    if (boletoDoMes(d, contrato.id, comp)) {
      existentes += 1;
      continue;
    }
    const dados = montarCobranca(d, contrato, comp);
    if (dados) {
      inserir(d, 'cobrancas', dados, usuario, `Boleto ${C.compBr(comp)} gerado para ${contrato.inquilino_nome}`);
      geradas += 1;
      // gerou um mês anterior a boletos que já existiam: a reserva vai para o mês certo
      realocarReserva(d, contrato, usuario);
    }
  }
  // complemento da caução depois de reajuste ou novo valor: boleto separado, gerado junto com os do mês
  for (const x of complementosCaucaoPendentes(d, comp)) {
    gerarBoletoCaucao(d, x.contrato.id, usuario, comp);
    geradas += 1;
  }
  return { geradas, existentes };
}

/** Campos que o recálculo atualiza (o ajuste do mês, as observações e o vencimento alterado à mão ficam). */
const CAMPOS_RECALCULO = ['dias_cobrados', 'dias_mes', 'aluguel_mensal', 'aluguel', 'desconto', 'iptu', 'iptu_parcela', 'seguro',
  'seguro_parcela', 'taxa_boleto', 'reserva_utilizada', 'ressarcimento', 'ressarcimento_descricao', 'ressarcimento_na_nf', 'carencia', 'multa_percentual', 'juros_mensal_percentual', 'situacao'];

/**
 * Recalcula os boletos em aberto depois de mudar o contrato, o IPTU ou o seguro, para que o boleto sempre bata
 * com o cadastro. Boleto alterado à mão ("Alterar valores") fica como está. Devolve quantos mudaram.
 */
export function recalcularCobrancas(d, filtro, usuario) {
  let n = 0;
  const abertos = (cb) => !cb.data_pagamento && !cb.editado_manual && !ehComplementoCaucao(cb);
  const escolhidos = d.cobrancas.filter((cb) => abertos(cb) && filtro(cb));
  // a reserva liga os meses do contrato: com reserva, todos os boletos em aberto dele são refeitos juntos
  const comReserva = new Set(escolhidos.map((cb) => cb.contrato_id).filter((id) => (buscar(d, 'contratos', id) || {}).reserva_valor > 0));
  const lista = d.cobrancas.filter((cb) => abertos(cb) && (filtro(cb) || comReserva.has(cb.contrato_id)))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));
  // a reserva que estava num boleto ainda não refeito fica livre para um mês anterior
  const pendentes = new Set(lista.map((cb) => cb.id));
  for (const cb of lista) {
    const c = buscar(d, 'contratos', cb.contrato_id);
    const novo = c && montarCobranca(d, c, cb.competencia, (x) => pendentes.has(x.id));
    pendentes.delete(cb.id);
    if (!novo) continue;
    const dados = Object.fromEntries(CAMPOS_RECALCULO.map((k) => [k, novo[k]]));
    if (Object.keys(atualizar(d, 'cobrancas', cb.id, dados, usuario, `Boleto ${C.compBr(cb.competencia)} recalculado pelo cadastro`)).length) n += 1;
  }
  for (const id of comReserva) n += realocarReserva(d, buscar(d, 'contratos', id), usuario);
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
/** O que o boleto deveria receber nesta confirmação (com desconto em dia; com multa e juros até o dia em que pagou). */
export const previstoNoPagamento = (cb, dataContabil, { pagouEmDia = false, dataPagou = null } = {}) => C.liquidar(cb, pagouEmDia ? cb.vencimento : (dataPagou || dataContabil));

/**
 * Valor recebido diferente do previsto (caso excepcional): a NF não sai pelo cálculo. ``valorNf`` é digitado à mão
 * e precisa ser diferente do calculado; ``justificativa`` é obrigatória e fica só no sistema (histórico do boleto).
 */
export function conferirDivergencia(cb, r, valorPago, valorNf, justificativa) {
  if (!String(justificativa || '').trim()) throw new Error('Informe a justificativa da divergência.');
  if (!(valorNf > 0)) throw new Error('Informe o valor da NF.');
  if (valorNf === r.valor_nf) throw new Error(`Altere o valor da NF: ele está igual ao calculado (${C.reais(r.valor_nf)}). Faça o cálculo à mão com o valor recebido de ${C.reais(valorPago)}.`);
}

export function registrarPagamento(d, cobrancaId, dataContabil, valorPago, usuario, { pagouEmDia = false, dataPagou = null, valorNf = null, justificativa = '' } = {}) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  if (faturasDe(d, 'cobranca', cb.id).length) {
    throw new Error('Este boleto já tem NF emitida. Desfaça o pagamento antes de alterar.');
  }
  if (dataPagou && dataPagou > dataContabil) throw new Error('O dia em que pagou não pode ser depois da data contábil.');
  const r = previstoNoPagamento(cb, dataContabil, { pagouEmDia, dataPagou });
  const compensadoDepois = pagouEmDia && dataContabil > cb.vencimento;
  const caucao = ehComplementoCaucao(cb);
  const manual = valorNf !== null && !caucao;
  if (manual) conferirDivergencia(cb, r, valorPago, valorNf, justificativa);
  atualizar(d, 'cobrancas', cb.id, {
    data_pagamento: dataContabil, data_pagou: pagouEmDia ? null : (dataPagou || null), valor_pago: valorPago ?? r.valor_devido,
    dias_atraso: r.dias_atraso, multa: r.multa, juros: r.juros, valor_nf: caucao ? 0 : manual ? valorNf : r.valor_nf, pagou_em_dia: compensadoDepois,
    situacao: r.pontual ? 'Paga em dia' : 'Paga com atraso', nf_manual: manual, divergencia: manual ? String(justificativa).trim() : null,
  }, usuario, `${compensadoDepois ? `Pagamento confirmado (pagou em dia, entrou em ${C.dataBr(dataContabil)})` : 'Pagamento confirmado'}${manual
    ? `. Recebido ${C.reais(valorPago)}, previsto ${C.reais(r.valor_devido)}; NF digitada ${C.reais(valorNf)} (calculada ${C.reais(r.valor_nf)}). Justificativa: ${String(justificativa).trim()}` : ''}`);
  // complemento da caução pago: a caução passa a ser o novo valor
  if (caucao) {
    const x = inserir(d, 'correcoes_garantia', { contrato_id: cb.contrato_id, data: cb.caucao_vigencia && cb.caucao_vigencia > dataContabil ? cb.caucao_vigencia : dataContabil,
      valor_anterior: cb.caucao_anterior, valor_novo: cb.caucao_nova, complemento: cb.caucao_complemento, observacoes: `Boleto do complemento pago em ${C.dataBr(dataContabil)}` },
    usuario, `Caução corrigida para ${C.reais(cb.caucao_nova)} (complemento pago)`);
    atualizar(d, 'cobrancas', cb.id, { caucao_correcao_id: x.id }, usuario, 'Correção da caução registrada');
  }
  return r;
}

export function estornarPagamento(d, cobrancaId, usuario) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  if (cb && cb.caucao_correcao_id) {
    if (buscar(d, 'correcoes_garantia', cb.caucao_correcao_id)) excluir(d, 'correcoes_garantia', cb.caucao_correcao_id, usuario, 'Correção da caução desfeita (pagamento do complemento desfeito)');
    atualizar(d, 'cobrancas', cb.id, { caucao_correcao_id: null }, usuario, 'Correção da caução desfeita');
  }
  cancelarFaturas(d, 'cobranca', cobrancaId, usuario);
  atualizar(d, 'cobrancas', cobrancaId, { data_pagamento: null, data_pagou: null, valor_pago: null, dias_atraso: null, multa: null,
    juros: null, valor_nf: null, pagou_em_dia: false, situacao: 'Em aberto', nf_manual: false, divergencia: null }, usuario, 'Pagamento desfeito');
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

/**
 * Imóveis em ordem alfabética, mas os do mesmo endereço (só o complemento muda) ficam juntos:
 * o grupo entra na posição do primeiro nome dele.
 */
export function imoveisPorEndereco(imoveis) {
  const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  const chave = (i) => String(i.endereco || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || `#${i.id}`;
  const grupos = new Map();
  for (const i of [...imoveis].sort(porNome)) {
    if (!grupos.has(chave(i))) grupos.set(chave(i), []);
    grupos.get(chave(i)).push(i);
  }
  return [...grupos.values()].flat();
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

const CAMPOS_GARANTIA = ['garantia_tipo', 'caucao_valor', 'caucao_data', 'caucao_pago_em', 'caucao_meses', 'comprovante_caucao', 'caucao_por_depositos',
  'deposito_valor', 'deposito_data', 'deposito_pago_em', 'deposito_uso', 'comprovante_deposito', 'deposito_por_depositos'];

/**
 * Troca de garantia (ex.: caução → fiador, ou troca de fiador: fiador → fiador), guardando a anterior no histórico do contrato.
 * fiadores: { novos: [dados], saem: [ids], alterados: [{ id, ...dados }] }. Os que saem ficam em "Fiadores anteriores"
 * (fim do vínculo = véspera da troca); os novos começam na data da troca. Sem fiador na nova garantia, os atuais saem todos.
 * A troca guarda o que mudou nos fiadores para poder ser cancelada.
 */
export function trocarGarantia(d, contratoId, dados, usuario, fiadores = {}) {
  const c = buscar(d, 'contratos', contratoId);
  const anterior = Object.fromEntries(CAMPOS_GARANTIA.map((k) => [k, c[k] ?? null]));
  const atuais = fiadoresDo(d, c.id, dados.data);
  const comFiador = temFiador(dados);
  const saem = comFiador ? atuais.filter((f) => (fiadores.saem || []).includes(f.id)) : atuais;
  const alterados = comFiador ? (fiadores.alterados || []).filter((a) => atuais.some((f) => f.id === a.id) && !saem.some((f) => f.id === a.id)) : [];
  const novos = comFiador ? (fiadores.novos || []) : [];
  const nomes = [...saem.map((f) => `sai ${f.nome}`), ...novos.map((f) => `entra ${f.nome}`)];
  const texto = `Garantia: ${c.garantia_tipo || 'não informada'} → ${dados.garantia_tipo}${nomes.length ? ` (${nomes.join(', ')})` : ''}`;
  const r = inserir(d, 'trocas_garantia', { contrato_id: c.id, data: dados.data, tipo_anterior: c.garantia_tipo || '', tipo_novo: dados.garantia_tipo,
    valor_anterior: valorGarantia(d, c), anterior, observacoes: dados.observacoes || '', fiadores_saida: [], fiadores_novos: [], fiadores_alterados: [] }, usuario, texto);
  const novo = Object.fromEntries(CAMPOS_GARANTIA.map((k) => [k, dados[k] ?? null]));
  atualizar(d, 'contratos', c.id, novo, usuario, texto);
  for (const f of saem) {
    r.fiadores_saida.push({ id: f.id, data_saida: f.data_saida ?? null });
    atualizar(d, 'fiadores', f.id, { data_saida: C.somarDias(dados.data, -1) }, usuario, `Fiador ${f.nome} sai na troca de garantia`);
  }
  for (const { id, ...a } of alterados) {
    const f = buscar(d, 'fiadores', id);
    r.fiadores_alterados.push({ id, antes: Object.fromEntries(Object.keys(a).map((k) => [k, f[k] ?? null])) });
    atualizar(d, 'fiadores', id, a, usuario, `Fiador ${a.nome || f.nome}`);
  }
  for (const f of novos) {
    const x = inserir(d, 'fiadores', { ...f, contrato_id: c.id, data_entrada: dados.data }, usuario, `Fiador ${f.nome} entra na troca de garantia`);
    r.fiadores_novos.push(x.id);
  }
  return r;
}

/**
 * Cancela a última troca de garantia (lançada por engano): o contrato volta à garantia anterior, guardada na troca,
 * e o registro da troca sai. Só a mais recente pode ser cancelada (as anteriores dependem dela).
 */
export function cancelarTrocaGarantia(d, trocaId, usuario) {
  const t = buscar(d, 'trocas_garantia', trocaId);
  if (!t) throw new Error('Registro não encontrado.');
  if (trocasGarantiaDo(d, t.contrato_id)[0].id !== t.id) throw new Error('Só a troca de garantia mais recente pode ser cancelada.');
  const texto = `Troca de garantia cancelada: volta para ${t.tipo_anterior || 'não informada'}`;
  const anterior = Object.fromEntries(CAMPOS_GARANTIA.map((k) => [k, (t.anterior || {})[k] ?? null]));
  if (!t.anterior) anterior.garantia_tipo = t.tipo_anterior || null;
  atualizar(d, 'contratos', t.contrato_id, anterior, usuario, texto);
  // fiadores: os que entraram saem do cadastro, os que saíram voltam e os alterados voltam ao que eram
  for (const id of t.fiadores_novos || []) if (d.fiadores.some((f) => f.id === id)) excluir(d, 'fiadores', id, usuario, texto);
  for (const s of t.fiadores_saida || []) if (d.fiadores.some((f) => f.id === s.id)) atualizar(d, 'fiadores', s.id, { data_saida: s.data_saida }, usuario, texto);
  for (const a of t.fiadores_alterados || []) if (d.fiadores.some((f) => f.id === a.id)) atualizar(d, 'fiadores', a.id, a.antes, usuario, texto);
  excluir(d, 'trocas_garantia', t.id, usuario, texto);
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

/** Dados da pessoa (sem as condições do contrato): a mesma pessoa alugando outro imóvel começa um contrato novo com eles. */
export const dadosDaPessoa = (c) => Object.fromEntries(CAMPOS_PESSOA.filter((k) => c[k] !== undefined && c[k] !== null).map((k) => [k, c[k]]));

/**
 * Condições do contrato anterior, para quem continua o contrato dele (ex.: troca de titular): prazo, índice, vencimento,
 * bonificação, multa e juros, contas, garantia e finalidade. O aluguel é o atual do anterior.
 */
export function condicoesDoContrato(d, anterior) {
  const contas = ['conta_agua', 'conta_energia', 'conta_gas', 'conta_condominio', 'conta_internet'];
  const out = Object.fromEntries([...CAMPOS_CONDICOES, ...contas].filter((k) => anterior[k] !== undefined && anterior[k] !== null && anterior[k] !== '').map((k) => [k, anterior[k]]));
  out.aluguel_inicial = aluguelAtual(d, anterior);
  return out;
}

/** Último inquilino do imóvel (pela data de entrada). */
export const ultimoContratoDoImovel = (d, imovelId) => d.contratos.filter((c) => c.imovel_id === imovelId)
  .sort((a, b) => String(b.data_entrada || '').localeCompare(String(a.data_entrada || '')) || b.id - a.id)[0] || null;

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
/** Dias que um contrato pode ficar sem imóvel; depois disso ele é apagado sozinho (pedido do usuário). */
export const DIAS_SEM_IMOVEL = 7;

/** Data em que o contrato sem imóvel será apagado (ex.: sem imóvel desde 10/10 → apagado em 17/10), ou null. */
export function dataApagarSemImovel(c) {
  return !c.imovel_id && c.sem_imovel_desde ? C.somarDias(c.sem_imovel_desde, DIAS_SEM_IMOVEL) : null;
}

/** Contratos sem imóvel há 7 dias ou mais e sem boleto: são apagados ao abrir o sistema. */
export function contratosSemImovelVencidos(d, hoje = C.hojeIso()) {
  return d.contratos.filter((c) => { const data = dataApagarSemImovel(c); return data && data <= hoje && !d.cobrancas.some((x) => x.contrato_id === c.id); });
}

/** Exclui o contrato e tudo o que pertence a ele (boletos, fiadores, garantia, vistorias...). */
export function excluirContrato(d, contratoId, usuario, descricao) {
  const c = buscar(d, 'contratos', contratoId);
  if (!c) return;
  for (const t of ['cobrancas', 'correcoes', 'fiadores', 'aplicacoes', 'correcoes_garantia', 'renovacoes', 'encerramentos', 'trocas_garantia', 'leituras', 'solicitacoes', 'vistorias', 'aditivos', 'ressarcimentos']) {
    d[t].filter((x) => x.contrato_id === c.id).forEach((x) => excluir(d, t, x.id, usuario));
  }
  excluir(d, 'contratos', c.id, usuario, descricao || c.inquilino_nome);
}

export function vincularInquilino(d, imovelId, dados, usuario) {
  let c = buscar(d, 'contratos', dados.contrato_id);
  if (!c) throw new Error('Inquilino não encontrado.');
  const i = buscar(d, 'imoveis', imovelId);
  if (c.imovel_id === i.id) throw new Error('Este inquilino já está vinculado a este imóvel.');
  const leitura = separarLeitura(dados);
  // quem já aluga outro imóvel precisa de um contrato novo, com condições próprias: é feito pelo cadastro do inquilino
  if (c.imovel_id) throw new Error(`${c.inquilino_nome} já aluga outro imóvel: cadastre um contrato novo para este imóvel (os dados da pessoa vêm preenchidos).`);
  atualizar(d, 'contratos', c.id, { imovel_id: i.id, data_entrada: dados.data_entrada, ativo: true, docs_entrada: true, sem_imovel_desde: null }, usuario, `Vinculado ao imóvel ${i.nome}`);
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

/**
 * Na saída, a garantia é devolvida pela conta em que foi depositada: o valor corrigido dividido na proporção do que foi
 * aplicado em cada lugar. Ex.: R$ 3.000,00 na ANK e R$ 2.400,00 com Maria; corrigida R$ 5.940,00 → ANK R$ 3.300,00 e
 * Maria R$ 2.640,00. [{ nome, pessoa, valor }]; vazio sem aplicações.
 */
export function devolucaoPorRecebedor(d, c, corrigida) {
  const { linhas, soma } = situacaoAplicacao(d, c);
  if (!soma || !(corrigida > 0)) return [];
  let resto = corrigida;
  return linhas.map((l, n) => {
    const valor = n === linhas.length - 1 ? resto : C.arred((corrigida * l.aplicado) / soma);
    resto -= valor;
    return { nome: l.emitente.nome, pessoa: !!l.emitente.pessoa, valor };
  });
}

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
  const x = complementoCaucao(d, c);
  if (!x) return null;
  const inicio = `O aluguel foi corrigido em ${C.dataBr(x.correcao.data_vigencia)}.`;
  const texto = x.boleto ? `${inicio} Boleto do complemento da caução (${C.reais(x.boleto.caucao_complemento)}) gerado, vence em ${C.dataBr(x.boleto.vencimento)}: ao confirmar o pagamento, a caução passa a ${C.reais(x.boleto.caucao_nova)}.`
    : x.necessaria === null ? `${inicio} Corrija também a caução (atual ${C.reais(x.atual)}). Informe no contrato a quantos aluguéis ela equivale para o sistema calcular o complemento.`
      : x.complemento > 0 ? `${inicio} A caução deve passar a ${C.reais(x.necessaria)} (${c.caucao_meses} aluguéis com bonificação); já depositado ${C.reais(x.atual)}. Gere o boleto do complemento de ${C.reais(x.complemento)}.`
        : `${inicio} A caução depositada (${C.reais(x.atual)}) já cobre o necessário (${C.reais(x.necessaria)}). Registre a correção da caução para tirar este aviso.`;
  return { nivel: 'aviso', tipo: 'Correção da caução', ancora: 'garantia', texto };
}

function alertaAplicacao(d, c) {
  const s = situacaoAplicacao(d, c);
  if (!s.total || s.ok) return null;
  return { nivel: 'aviso', tipo: 'Aplicação da garantia',
    texto: `Garantia de ${C.reais(s.total)} não foi aplicada integralmente: ${s.soma ? `aplicado ${C.reais(s.soma)} (${s.linhas.map((l) => `${l.emitente.nome.split(/\s+/)[0]} ${C.reais(l.aplicado)}`).join(', ')}), ` : ''}falta aplicar ${C.reais(s.falta)}.` };
}

/**
 * Depósitos registrados sem o comprovante (caução, depósito de garantia, reserva, complemento da caução e aplicação):
 * [{ texto, valor, data, tabela, id, campo, tipo }]. ``tipo`` dá o nome do arquivo (comprovante-caucao-AAAA-MM-DD.pdf).
 */
export function comprovantesPendentes(d, c) {
  const out = [];
  const falta = (cond, texto, valor, data, tabela, id, campo, tipo) => { if (cond && valor > 0) out.push({ texto, valor, data, tabela, id, campo, tipo }); };
  // caução e depósito: o comprovante vem depois da assinatura do contrato (antes disso não há o que cobrar)
  const assinado = !!documentoEntrada(d, c, 'doc_contrato_em');
  // já com depósitos registrados: o que falta depositar
  const aDepositar = (qual, nome) => { const s = garantiaADepositar(d, c, qual); return s.depositado ? [`${nome} (falta depositar)`, s.falta] : [nome, s.necessaria]; };
  if (assinado && c.garantia_tipo === 'Caução' && !garantiaDepositada(c)) falta(true, ...aDepositar('caucao', 'caução'), c.caucao_data, 'contratos', c.id, 'comprovante_caucao', 'caucao');
  if (assinado && temDeposito(c) && !garantiaDepositada(c)) falta(true, ...aDepositar('deposito', 'depósito de garantia'), c.deposito_data, 'contratos', c.id, 'comprovante_deposito', 'deposito-garantia');
  falta(!c.comprovante_reserva, 'reserva', c.reserva_valor, c.reserva_data, 'contratos', c.id, 'comprovante_reserva', 'reserva');
  // depósitos registrados sem o comprovante (caução ou depósito de garantia em parcelas)
  for (const [qual, texto, tipo] of [['caucao', 'depósito da caução', 'caucao'], ['deposito', 'depósito de garantia', 'deposito-garantia']]) {
    if ((qual === 'caucao' ? temCaucao(c) : temDeposito(c))) for (const x of depositosGarantiaDo(d, c, qual)) falta(!x.comprovante, texto, x.valor, x.data, 'depositos_garantia', x.id, 'comprovante', tipo);
  }
  for (const x of correcoesGarantiaDo(d, c.id)) falta(!x.comprovante && !x.antes_do_deposito, 'complemento da caução', x.complemento, x.data, 'correcoes_garantia', x.id, 'comprovante', 'complemento-caucao');
  for (const x of d.aplicacoes.filter((a) => a.contrato_id === c.id)) falta(!x.comprovante, 'aplicação da garantia', x.valor, x.data, 'aplicacoes', x.id, 'comprovante', 'aplicacao-garantia');
  return out;
}

/** Anexa depois o comprovante que faltava (só os campos de comprovante de depósito). */
export function anexarComprovante(d, tabela, id, campo, arquivo, usuario) {
  const ok = { contratos: ['comprovante_caucao', 'comprovante_deposito', 'comprovante_reserva'], correcoes_garantia: ['comprovante'], aplicacoes: ['comprovante'], depositos_garantia: ['comprovante'] };
  if (!(ok[tabela] || []).includes(campo)) throw new Error('Comprovante desconhecido.');
  if (!arquivo) throw new Error('Escolha o arquivo do comprovante.');
  const r = buscar(d, tabela, id);
  if (!r) throw new Error(`${TABELAS[tabela]} não encontrado.`);
  atualizar(d, tabela, r.id, { [campo]: arquivo }, usuario, `Comprovante anexado: ${arquivo}`);
}

/** Caução e depósito de garantia: campos da data efetivamente paga e do comprovante. */
export const GARANTIAS_DEPOSITADAS = {
  caucao: { nome: 'caução', pago: 'caucao_pago_em', comprovante: 'comprovante_caucao', arquivo: 'caucao' },
  deposito: { nome: 'depósito de garantia', pago: 'deposito_pago_em', comprovante: 'comprovante_deposito', arquivo: 'deposito-garantia' },
};

/**
 * Um depósito da caução ou do depósito de garantia (pode ser parcelado): data e valor obrigatórios; o comprovante pode vir
 * depois (fica o alerta "Comprovante a buscar no banco" até anexar). Quando a soma chega ao necessário, a garantia conta
 * como depositada (data do último depósito).
 */
export function registrarDepositoGarantia(d, contratoId, qual, { data, valor, arquivo }, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const g = GARANTIAS_DEPOSITADAS[qual];
  if (!c || !g) throw new Error('Contrato ou garantia não encontrados.');
  // já registrada (ex.: caução inicial depositada e o aluguel reajustado): depósito para completar o que falta
  const complementar = garantiaDepositada(c);
  if (complementar && !(garantiaADepositar(d, c, qual).falta > 0)) throw new Error(`${g.nome.charAt(0).toLocaleUpperCase('pt-BR')}${g.nome.slice(1)} já está completa.`);
  if (!data) throw new Error('Informe a data do depósito.');
  if (!(valor > 0)) throw new Error('Informe o valor depositado.');
  const x = inserir(d, 'depositos_garantia', { contrato_id: c.id, imovel_id: c.imovel_id || null, qual, troca_id: trocaAtual(d, c), data, valor, comprovante: arquivo || null,
    ...(complementar ? { complementar: true } : {}) }, usuario,
    `${c.inquilino_nome}: ${g.nome}, depósito ${complementar ? 'para completar ' : ''}de ${C.reais(valor)} em ${C.dataBr(data)}${arquivo ? '' : ' (sem comprovante)'}`);
  const s = garantiaADepositar(d, c, qual);
  if (!complementar && s.falta <= 0) {
    atualizar(d, 'contratos', c.id, { [g.pago]: data, [g.comprovante]: arquivo || null, [`${qual}_por_depositos`]: true }, usuario,
      `${c.inquilino_nome}: ${g.nome} completa (${C.reais(s.depositado)} em ${s.depositos.length} depósito(s))`);
  }
  return { deposito: x, ...s };
}

/** Depois de excluir um depósito: se a soma deixou de cobrir o necessário, a garantia volta a "a depositar". */
export function acertarGarantiaDepositada(d, contratoId, qual, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const g = GARANTIAS_DEPOSITADAS[qual];
  if (!c || !g || !c[`${qual}_por_depositos`]) return;
  const s = garantiaADepositar(d, c, qual);
  const fim = s.depositos[s.depositos.length - 1];
  const novo = s.falta > 0 ? { [g.pago]: null, [g.comprovante]: null, [`${qual}_por_depositos`]: null } : { [g.pago]: fim.data, [g.comprovante]: fim.comprovante };
  atualizar(d, 'contratos', c.id, novo, usuario, `${c.inquilino_nome}: depósitos de ${g.nome} conferidos (${C.reais(s.depositado)})`);
}

/** Pode remover o comprovante do depósito? Na caução, só sem correções registradas (elas partem do valor depositado). */
export const podeRemoverComprovanteGarantia = (d, c, qual) => !!(c[GARANTIAS_DEPOSITADAS[qual].comprovante] || c[`${qual}_por_depositos`]) && (qual !== 'caucao' || !correcoesCaucaoAtual(d, c).length);

/**
 * Remove o comprovante do depósito (anexado errado): a garantia volta a "Incluir … e anexar comprovante".
 * Paga em depósitos: sai o último depósito (os outros continuam na lista, e podem ser excluídos lá).
 */
export function removerComprovanteGarantia(d, contratoId, qual, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const g = GARANTIAS_DEPOSITADAS[qual];
  if (!c || !g) throw new Error('Contrato ou garantia não encontrados.');
  if (!c[g.comprovante] && !c[`${qual}_por_depositos`]) throw new Error('Não há depósito registrado para remover.');
  if (!podeRemoverComprovanteGarantia(d, c, qual)) throw new Error('Exclua antes as correções da caução.');
  const ultimo = c[`${qual}_por_depositos`] ? depositosGarantiaDo(d, c, qual).filter((x) => !x.complementar).pop() : null;
  if (ultimo) excluir(d, 'depositos_garantia', ultimo.id, usuario, `${c.inquilino_nome}: depósito de ${C.reais(ultimo.valor)} de ${C.dataBr(ultimo.data)} removido`);
  atualizar(d, 'contratos', c.id, { [g.pago]: null, [g.comprovante]: null, [`${qual}_por_depositos`]: null }, usuario,
    `${c.inquilino_nome}: comprovante de ${g.nome} removido (volta a depositar)`);
}

/** Caução ou depósito de garantia pago: a data efetiva do depósito e o comprovante (os dois obrigatórios). */
export function registrarGarantiaPaga(d, contratoId, qual, data, arquivo, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const g = GARANTIAS_DEPOSITADAS[qual];
  if (!c || !g) throw new Error('Contrato ou garantia não encontrados.');
  if (!data) throw new Error(`Informe a data em que ${g.nome} foi paga.`);
  if (!arquivo) throw new Error(`Anexe o comprovante: ${g.nome}.`);
  atualizar(d, 'contratos', c.id, { [g.pago]: data, [g.comprovante]: arquivo }, usuario, `${c.inquilino_nome}: ${g.nome} paga em ${C.dataBr(data)}`);
}

function alertaComprovantes(d, c) {
  const l = comprovantesPendentes(d, c);
  if (!l.length) return null;
  return { nivel: 'aviso', tipo: l.some((x) => x.campo === 'comprovante_caucao') ? 'Incluir caução e anexar comprovante' : l.some((x) => x.campo === 'comprovante_deposito') ? 'Incluir depósito e anexar comprovante' : 'Comprovante a buscar no banco', ancora: 'garantia',
    texto: `Anexe o comprovante: ${l.map((x) => `${x.texto} de ${C.reais(x.valor)}${x.data ? ` (${C.dataBr(x.data)})` : ''}`).join('; ')}.` };
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
    alertaReservaParada(d, contrato) || alertas.alertaReserva(contrato.reserva_valor, saldoReserva(d, contrato), competenciaReserva(contrato), hoje),
    contrato.prazo_tipo === 'Indeterminado' ? null : alertas.alertaVigencia(contrato.vigencia_fim, hoje),
    alertaFiador(d, contrato, hoje),
    alertaAplicacao(d, contrato),
    alertaComprovantes(d, contrato),
    alertaDocumentosEntrada(contrato, d),
    alertaAssinaturaFaltante(d, contrato),
    alertaPerdaAConfirmar(d, contrato),
    alertaAditivoHerdeiro(d, contrato),
    alertaCondominio(contrato, hoje),
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

/** Arquivo assinado de cada documento: doc_contrato_em → doc_contrato_arquivo. */
export const campoArquivoDoc = (campo) => campo.replace(/_em$/, '_arquivo');
/** Data em que o documento foi dado como perdido: doc_contrato_em → doc_contrato_perdido_em. */
export const campoPerdidoDoc = (campo) => campo.replace(/_em$/, '_perdido_em');
/** Perda registrada por quem não é administrador: login de quem registrou, até o administrador confirmar ou recusar. */
export const campoPerdidoPendente = (campo) => campo.replace(/_em$/, '_perdido_pendente');
/** Arquivo anexado com assinatura faltante: { data, arquivo, falta: [nomes], por, pendente } (pendente = aguarda o administrador). */
export const campoParcialDoc = (campo) => campo.replace(/_em$/, '_parcial');

/** Data em que o documento foi registrado como perdido (null se não foi, ou se já existe assinado, próprio ou herdado). */
export const documentoPerdido = (d, c, campo) => (c[campoPerdidoDoc(campo)] && !documentoEntrada(d, c, campo) ? c[campoPerdidoDoc(campo)] : null);
/** Anexo com assinatura faltante (null se não há, ou se o documento já está assinado). */
export const documentoParcial = (d, c, campo) => (c[campoParcialDoc(campo)] && !documentoEntrada(d, c, campo) ? c[campoParcialDoc(campo)] : null);
/** Documento que ainda falta: nem assinado, nem perdido, nem anexado com assinatura faltante. */
/**
 * Quem "continua o contrato de" outro (troca de titular) não gera contrato, vistoria nem termo das chaves novos:
 * herda os do contrato original. Devolve o contrato anterior imediato, ou null.
 */
export const contratoHerdado = (d, c) => (d && c.contrato_anterior_id ? buscar(d, 'contratos', c.contrato_anterior_id) || null : null);
/** Documento que ainda falta: nem assinado, nem perdido, nem anexado com assinatura faltante, nem herdado do contrato original. */
export const documentoFalta = (d, c, campo) => !contratoHerdado(d, c) && !documentoEntrada(d, c, campo) && !documentoPerdido(d, c, campo) && !documentoParcial(d, c, campo);

/** Troca de titular: o termo aditivo que coloca o novo titular no contrato é obrigatório (alerta até registrar um aditivo neste contrato). */
export function alertaAditivoHerdeiro(d, c) {
  const ant = contratoHerdado(d, c);
  if (!ant || c.ativo === false || c.data_saida || aditivosDo(d, c.id).length) return null;
  return { nivel: 'perigo', tipo: 'Aditivo da troca de titular', ancora: 'aditivos',
    texto: `Este contrato continua o de ${ant.inquilino_nome}: registre o termo aditivo assinado que coloca ${c.inquilino_nome} como titular (em "Termos aditivos").` };
}

/**
 * Quem assina o contrato (nomes já cadastrados): locadoras, inquilino, representante da empresa, solidário e fiadores atuais.
 * [{ nome, papel }]. Só estes nomes podem ser apontados como assinatura faltante.
 */
export function partesDoContrato(d, c) {
  const locadoras = locadorasDoContrato(d, c);
  return [
    ...locadoras.map((e) => ({ nome: e.razao_social || e.nome, papel: 'locadora' })),
    { nome: c.inquilino_nome, papel: 'inquilino' },
    ...(c.inquilino_tipo === 'Pessoa jurídica (empresa)' && c.representante_nome ? [{ nome: c.representante_nome, papel: 'representante da empresa' }] : []),
    ...(c.solidario_nome ? [{ nome: c.solidario_nome, papel: 'inquilino solidário' }] : []),
    ...(temFiador(c) ? fiadoresDo(d, c.id) : []).map((f) => ({ nome: f.nome, papel: 'fiador' })),
  ].filter((p) => p.nome);
}
/** Texto gravado para cada parte: "Pedro Souza (fiador)". */
export const textoParte = (p) => `${p.nome} (${p.papel})`;

/** Todo inquilino ativo (antigo ou novo): avisa enquanto faltar algum dos três documentos assinados (próprio ou herdado). */
export function alertaDocumentosEntrada(c, d = null) {
  if (c.ativo === false || c.data_saida) return null;
  const falta = DOCUMENTOS_ENTRADA.filter(([k]) => documentoFalta(d, c, k)).map(([, t]) => t.toLocaleLowerCase('pt-BR'));
  return falta.length ? { nivel: 'aviso', tipo: 'Documentos de entrada', texto: `falta ${falta.join(', ')}.`, ancora: 'documentos' } : null;
}

/** Documento anexado com assinatura faltante: alerta até alguém anexar o arquivo com todas as assinaturas. */
function alertaAssinaturaFaltante(d, c) {
  if (c.ativo === false || c.data_saida) return null;
  const l = DOCUMENTOS_ENTRADA.map(([k, t]) => [t, documentoParcial(d, c, k)]).filter(([, p]) => p);
  if (!l.length) return null;
  return { nivel: 'aviso', tipo: 'Assinatura faltante', ancora: 'documentos',
    texto: `${l.map(([t, p]) => `${t.toLocaleLowerCase('pt-BR')} anexado sem a assinatura de ${p.falta.join(', ')}${p.pendente ? ' (aguardando análise do administrador)' : ''}`).join('; ')}. Anexe o arquivo com todas as assinaturas.` };
}

/** Perda registrada por quem não é administrador: aguarda o administrador confirmar ou recusar. */
function alertaPerdaAConfirmar(d, c) {
  const l = DOCUMENTOS_ENTRADA.filter(([k]) => documentoPerdido(d, c, k) && c[campoPerdidoPendente(k)]);
  if (!l.length) return null;
  return { nivel: 'aviso', tipo: 'Documento perdido a confirmar', ancora: 'documentos',
    texto: `${l.map(([k, t]) => `${t.toLocaleLowerCase('pt-BR')} registrado como perdido por ${c[campoPerdidoPendente(k)]} em ${C.dataBr(c[campoPerdidoDoc(k)])}`).join('; ')}. O administrador confirma ou recusa.` };
}

/** Marca o documento como assinado (exige o nome do arquivo assinado já anexado) ou, sem data, volta a pendente. */
export function marcarDocumento(d, contratoId, campo, data, usuario, arquivo = null) {
  const doc = DOCUMENTOS_ENTRADA.find(([k]) => k === campo);
  if (!doc) throw new Error('Documento desconhecido.');
  if (data && !arquivo) throw new Error(`Anexe o arquivo d${doc[2].endsWith('a') ? 'a' : 'o'} ${doc[1].toLocaleLowerCase('pt-BR')} ${doc[2]} antes de marcar.`);
  const c = buscar(d, 'contratos', contratoId);
  // assinado de verdade: saem o registro de perdido e o de assinatura faltante
  const limpa = data ? { [campoPerdidoDoc(campo)]: null, [campoPerdidoPendente(campo)]: null, [campoParcialDoc(campo)]: null } : {};
  atualizar(d, 'contratos', c.id, { [campo]: data || null, [campoArquivoDoc(campo)]: data ? arquivo : null, ...limpa }, usuario, `${c.inquilino_nome}: ${doc[1].toLocaleLowerCase('pt-BR')} ${data ? `${doc[2]} em ${C.dataBr(data)}` : 'voltou a pendente'}`);
}

/**
 * Anexa o documento com assinatura faltante. ``falta`` = textos de partesDoContrato (outro nome é recusado).
 * Quem não é administrador fica aguardando a análise do administrador. Sem dados: desfaz o registro.
 */
export function anexarDocumentoParcial(d, contratoId, campo, dados, usuario, administrador) {
  const doc = DOCUMENTOS_ENTRADA.find(([k]) => k === campo);
  if (!doc) throw new Error('Documento desconhecido.');
  const c = buscar(d, 'contratos', contratoId);
  const nome = doc[1].toLocaleLowerCase('pt-BR');
  if (!dados) {
    atualizar(d, 'contratos', c.id, { [campoParcialDoc(campo)]: null }, usuario, `${c.inquilino_nome}: ${nome} sem o registro de assinatura faltante`);
    return;
  }
  if (!dados.data) throw new Error('Informe a data.');
  if (!dados.arquivo) throw new Error(`Anexe o arquivo d${doc[2].endsWith('a') ? 'a' : 'o'} ${nome}.`);
  const validos = partesDoContrato(d, c).map(textoParte);
  const falta = [...new Set(dados.falta || [])];
  if (!falta.length) throw new Error('Escolha de quem falta a assinatura.');
  const errado = falta.find((x) => !validos.includes(x));
  if (errado) throw new Error(`"${errado}" não está ligado a este contrato.`);
  atualizar(d, 'contratos', c.id, { [campoParcialDoc(campo)]: { data: dados.data, arquivo: dados.arquivo, falta, por: usuario, pendente: !administrador } }, usuario,
    `${c.inquilino_nome}: ${nome} anexado sem a assinatura de ${falta.join(', ')}`);
}

/** Registra que o documento foi perdido ou, sem data, desfaz o registro. Quem não é administrador fica aguardando a análise. */
export function marcarDocumentoPerdido(d, contratoId, campo, data, usuario, administrador = true) {
  const doc = DOCUMENTOS_ENTRADA.find(([k]) => k === campo);
  if (!doc) throw new Error('Documento desconhecido.');
  const c = buscar(d, 'contratos', contratoId);
  atualizar(d, 'contratos', c.id, { [campoPerdidoDoc(campo)]: data || null, [campoPerdidoPendente(campo)]: data && !administrador ? usuario : null }, usuario,
    `${c.inquilino_nome}: ${doc[1].toLocaleLowerCase('pt-BR')} ${data ? `perdido (registrado em ${C.dataBr(data)}${administrador ? '' : ', aguardando o administrador'})` : 'não está mais como perdido'}`);
}

/** Análise do administrador: ``tipo`` 'perdido' ou 'parcial'; aceitar confirma, recusar desfaz o registro (o arquivo fica na pasta). */
export function analisarDocumento(d, contratoId, campo, tipo, aceitar, usuario) {
  const doc = DOCUMENTOS_ENTRADA.find(([k]) => k === campo);
  if (!doc) throw new Error('Documento desconhecido.');
  const c = buscar(d, 'contratos', contratoId);
  const nome = doc[1].toLocaleLowerCase('pt-BR');
  if (tipo === 'perdido') {
    atualizar(d, 'contratos', c.id, aceitar ? { [campoPerdidoPendente(campo)]: null } : { [campoPerdidoDoc(campo)]: null, [campoPerdidoPendente(campo)]: null }, usuario,
      `${c.inquilino_nome}: perda d${doc[2].endsWith('a') ? 'a' : 'o'} ${nome} ${aceitar ? 'confirmada' : 'recusada'} pelo administrador`);
  } else {
    const p = c[campoParcialDoc(campo)];
    if (!p) return;
    atualizar(d, 'contratos', c.id, { [campoParcialDoc(campo)]: aceitar ? { ...p, pendente: false } : null }, usuario,
      `${c.inquilino_nome}: ${nome} com assinatura faltante ${aceitar ? 'conferido' : 'recusado'} pelo administrador`);
  }
}

/**
 * Situação de um documento de entrada. Quem "continua o contrato de" outro (ex.: troca de titular) herda o documento
 * assinado no contrato anterior (o mais recente da cadeia), enquanto não tiver um próprio.
 * Devolve { data, arquivo, contrato } (contrato = de onde veio) ou null se está pendente.
 */
export function documentoEntrada(d, c, campo) {
  const arq = campoArquivoDoc(campo);
  if (c[campo]) return { data: c[campo], arquivo: c[arq] || null, contrato: c };
  if (!d) return null;
  const x = [...cadeiaDeContratos(d, c).antes].reverse().find((a) => a[campo]);
  return x ? { data: x[campo], arquivo: x[arq] || null, contrato: x } : null;
}

/**
 * Arquivos anexados que algum lançamento usa: [{ escopo, id, nome }] (escopo e id da pasta, como nas caixas de arquivos:
 * "contrato", "assinados" e "aditivos" pelo contrato; "seguro" pelo imóvel). O que sair desta lista ao excluir ou desfazer
 * um lançamento é apagado da pasta.
 */
export function arquivosReferenciados(d) {
  const out = [];
  const usa = (escopo, id, nome) => { if (nome && id) out.push({ escopo, id, nome }); };
  for (const c of d.contratos) {
    for (const k of ['comprovante_caucao', 'comprovante_deposito', 'comprovante_reserva']) usa('contrato', c.id, c[k]);
    for (const [campo] of DOCUMENTOS_ENTRADA) {
      usa('assinados', c.id, c[campoArquivoDoc(campo)]);
      usa('assinados', c.id, (c[campoParcialDoc(campo)] || {}).arquivo);
    }
  }
  for (const t of ['depositos_garantia', 'correcoes_garantia', 'aplicacoes']) for (const x of d[t] || []) usa('contrato', x.contrato_id, x.comprovante);
  for (const a of d.aditivos) usa('aditivos', a.contrato_id, a.arquivo);
  for (const v of d.vistorias) for (const nome of Object.values(v.fotos || {})) usa('contrato', v.contrato_id, nome);
  for (const s of d.seguros) for (const nome of [s.arquivo_apolice, ...(s.outros_arquivos || [])]) usa('seguro', s.imovel_id, nome);
  return out;
}

const porDataAditivo = (a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id;
/** Termos aditivos assinados do contrato (posteriores a ele, com o arquivo anexado), do mais recente ao mais antigo. */
export const aditivosDo = (d, contratoId) => d.aditivos.filter((a) => a.contrato_id === contratoId && a.arquivo).sort(porDataAditivo);
/** Termos aditivos gerados pelo sistema que aguardam a assinatura (sem arquivo). */
export const aditivosAguardando = (d, contratoId) => d.aditivos.filter((a) => a.contrato_id === contratoId && !a.arquivo).sort(porDataAditivo);

/**
 * Gera (ou altera) o termo aditivo de troca do dia do vencimento, ainda sem assinatura. ``f``: data, dia_novo,
 * mes (AAAA-MM do 1º vencimento no dia novo), testemunhas, modelo_id e texto (o texto do modelo, que pode ser ajustado só neste termo).
 * Só muda o dia: não há cobrança nem desconto proporcional. Não muda o vencimento do contrato: isso continua no cadastro.
 */
export function salvarAditivoVencimento(d, contratoId, f, usuario, id = null) {
  const c = buscar(d, 'contratos', contratoId);
  const atual = id ? buscar(d, 'aditivos', id) : null;
  if (atual && atual.arquivo) throw new Error('Este termo aditivo já foi assinado e não pode mais ser alterado.');
  if (!f.data) throw new Error('Informe a data do termo aditivo.');
  const diaNovo = Number(f.dia_novo);
  if (!Number.isInteger(diaNovo) || diaNovo < 1 || diaNovo > 31) throw new Error('Informe o novo dia do vencimento (de 1 a 31).');
  const diaAnterior = atual ? atual.dia_anterior : (c.dia_vencimento || 10);
  if (diaNovo === diaAnterior) throw new Error(`O vencimento já é no dia ${diaAnterior}.`);
  if (!/^\d{4}-\d{2}$/.test(f.mes || '')) throw new Error('Informe o mês do primeiro vencimento no novo dia.');
  const primeiro = `${f.mes}-${String(Math.min(diaNovo, C.diasNoMes(f.mes))).padStart(2, '0')}`;
  if (!String(f.texto || '').trim()) throw new Error('O texto do termo aditivo está vazio.');
  const dados = { contrato_id: c.id, imovel_id: c.imovel_id || null, tipo: 'Vencimento', data: f.data, dia_anterior: diaAnterior, dia_novo: diaNovo,
    primeiro_vencimento: primeiro, testemunhas: (f.testemunhas || []).filter((t) => t && t.nome),
    modelo_id: f.modelo_id ?? (atual ? atual.modelo_id : null), texto: String(f.texto),
    assunto: `Troca do dia do vencimento: dia ${diaAnterior} → dia ${diaNovo}, a partir de ${C.dataBr(primeiro)}`, arquivo: null };
  if (atual) {
    atualizar(d, 'aditivos', atual.id, dados, usuario, `${c.inquilino_nome}: termo aditivo de ${C.dataBr(f.data)} alterado`);
    return atual;
  }
  dados.numero = d.aditivos.filter((a) => a.contrato_id === c.id).length + 1;
  return inserir(d, 'aditivos', dados, usuario, `${c.inquilino_nome}: termo aditivo de vencimento gerado (aguardando assinatura)`);
}

/** Anexa o arquivo assinado ao termo gerado pelo sistema: passa a contar como termo aditivo registrado. */
export function assinarAditivo(d, id, { data, arquivo }, usuario) {
  const a = buscar(d, 'aditivos', id);
  const c = buscar(d, 'contratos', a.contrato_id);
  if (!data) throw new Error('Informe a data da assinatura.');
  if (!arquivo) throw new Error('Anexe o arquivo do termo aditivo assinado.');
  atualizar(d, 'aditivos', a.id, { arquivo, assinado_em: data }, usuario, `${c.inquilino_nome}: termo aditivo de ${C.dataBr(a.data)} assinado em ${C.dataBr(data)}`);
  marcarAditivos(d, c.id, usuario);
  return a;
}

/** Registra um termo aditivo já assinado: exige data, assunto e o arquivo anexado. Marca o contrato com "Possui termo aditivo". */
export function registrarAditivo(d, contratoId, { data, assunto, arquivo }, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  if (!data) throw new Error('Informe a data do termo aditivo.');
  if (!String(assunto || '').trim()) throw new Error('Informe o assunto do termo aditivo (ex.: troca do dia do vencimento).');
  if (!arquivo) throw new Error('Anexe o arquivo do termo aditivo assinado.');
  const a = inserir(d, 'aditivos', { contrato_id: c.id, imovel_id: c.imovel_id || null, data, assunto: String(assunto).trim(), arquivo }, usuario,
    `${c.inquilino_nome}: termo aditivo de ${C.dataBr(data)}`);
  marcarAditivos(d, c.id, usuario);
  return a;
}

/** "Possui termo aditivo" só vale com algum termo registrado (com o arquivo assinado): acerta a marca depois de incluir ou excluir. */
export function marcarAditivos(d, contratoId, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  if (!c) return;
  const tem = aditivosDo(d, c.id).length > 0;
  if (!!c.possui_aditivos !== tem) atualizar(d, 'contratos', c.id, { possui_aditivos: tem }, usuario, `${c.inquilino_nome}: ${tem ? 'possui' : 'não possui mais'} termo aditivo`);
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
  return lista.sort((a, b) => estiloAlerta(d, a.tipo).prioridade - estiloAlerta(d, b.tipo).prioridade || ordem[a.nivel] - ordem[b.nivel]);
}

// --------------------------------------------------------------------------
// Aparência dos alertas: cor, ênfase e prioridade de cada tipo (editável em #/alertas-config)
// --------------------------------------------------------------------------
export const TIPOS_ALERTA = ['Vigência do contrato', 'Reajuste do aluguel', 'Correção do aluguel', 'Inadimplência', 'Documentos de entrada',
  'Seguro obrigatório', 'IPTU do proprietário', 'Reserva do imóvel', 'Condomínio', 'Fiador', 'Aplicação da garantia', 'Correção da caução',
  'Titularidade', 'Comprovante a buscar no banco', 'Assinatura faltante', 'Documento perdido a confirmar', 'Aditivo da troca de titular', 'A verificar'];
/** "Padrão" = cor pela gravidade do aviso (vermelho quando urgente, laranja quando aviso, azul quando informação). */
export const CORES_ALERTA = ['Padrão', 'Vermelho', 'Laranja', 'Amarelo', 'Verde', 'Azul', 'Roxo', 'Cinza'];
export const ENFASES_ALERTA = ['Normal', 'Forte', 'Discreta'];
/** Prioridade: 1 aparece primeiro; empate segue a gravidade. */
const PADRAO_ALERTA = { cor: 'Padrão', enfase: 'Normal', prioridade: 3 };
export const ESTILOS_ALERTA_PADRAO = {
  'Vigência do contrato': { cor: 'Vermelho', enfase: 'Forte', prioridade: 1 },
  'Reajuste do aluguel': { cor: 'Laranja', enfase: 'Forte', prioridade: 2 },
  'Correção do aluguel': { cor: 'Laranja', enfase: 'Forte', prioridade: 2 },
  'A verificar': { cor: 'Amarelo', enfase: 'Normal', prioridade: 3 },
};
export const estiloAlerta = (d, tipo) => ({ ...PADRAO_ALERTA, ...ESTILOS_ALERTA_PADRAO[tipo], ...((d && d.estilos_alertas) || {})[tipo] });

/** Grava a aparência escolhida para cada tipo de alerta (só o que difere do padrão do sistema). */
export function salvarEstilosAlertas(d, estilos, usuario) {
  const novo = {};
  for (const [tipo, e] of Object.entries(estilos)) {
    const p = Math.round(Number(e.prioridade));
    if (!CORES_ALERTA.includes(e.cor) || !ENFASES_ALERTA.includes(e.enfase) || !(p >= 1 && p <= 99)) throw new Error(`Confira a cor, a ênfase e a prioridade (1 a 99) de "${tipo}".`);
    const padrao = estiloAlerta(null, tipo);
    if (e.cor !== padrao.cor || e.enfase !== padrao.enfase || p !== padrao.prioridade) novo[tipo] = { cor: e.cor, enfase: e.enfase, prioridade: p };
  }
  registrar(d, usuario, 'Alteração', null, null, 'Aparência dos alertas', { estilos_alertas: { de: d.estilos_alertas || {}, para: novo } });
  d.estilos_alertas = novo;
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
  if (ehComplementoCaucao(cb)) linhas.push(`COMPLEMENTO DA CAUÇÃO ${rs(cb.caucao_complemento)}`, `CAUÇÃO DEPOSITADA ${rs(cb.caucao_anterior)} NOVA CAUÇÃO ${rs(cb.caucao_nova)}`);
  else if (cb.carencia) linhas.push(`CARÊNCIA DO ALUGUEL ${C.compBr(cb.competencia)}`);
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
  if (cb.ressarcimento) extras.push(`RESSARCIMENTO CONDOMÍNIO -${rs(cb.ressarcimento)}`);
  if (extras.length && !ehComplementoCaucao(cb)) linhas.push(extras.join(' '));
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

/** Quantas solicitações há em cada situação (sem situação conta como "Aberta"). */
export function resumoSolicitacoes(d) {
  const r = { Aberta: 0, 'Em andamento': 0, Concluída: 0, 'Não atendida': 0 };
  for (const x of d.solicitacoes) { const s = x.situacao || 'Aberta'; r[s] = (r[s] || 0) + 1; }
  return r;
}

export const reformasDo =(d, imovelId) => d.reformas.filter((r) => r.imovel_id === imovelId)
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
      for (const pc of parcelasIptu(d, p)) if (pc.proprietario && dentro(pc.paga)) iptu += pc.valorProprietario;
    }
    const todasReformas = reformasDo(d, i.id);
    const reformasPeriodo = todasReformas.filter((r) => dentro(r.data)).reduce((s, r) => s + r.valor, 0);
    const investido = todasReformas.filter((r) => String(r.data) <= ate).reduce((s, r) => s + r.valor, 0);
    // contas pagas por nós + ressarcimentos de condomínio abatidos em boletos pagos no período (se não saíram da NF)
    const contas = d.despesas.filter((x) => x.imovel_id === i.id && dentro(x.data_pagamento)).reduce((s, x) => s + x.valor, 0)
      + pagas.filter((cb) => !cb.ressarcimento_na_nf).reduce((s, cb) => s + (cb.ressarcimento || 0), 0);
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
// Ressarcimento de condomínio: taxas do proprietário que o inquilino pagou no boleto do condomínio
// (Lei 8.245/91, art. 22, X: despesas extraordinárias). Abatem no boleto do aluguel do mês seguinte ao pagamento.
// --------------------------------------------------------------------------
export const TAXAS_DO_PROPRIETARIO = ['Fundo de obras', 'Constituição do fundo de reserva', 'Chamada extra (obra)', 'Obra na estrutura / reforma',
  'Pintura de fachada', 'Equipamento de segurança / incêndio', 'Decoração / paisagismo das áreas comuns', 'Indenização trabalhista anterior à locação', 'Outra'];
export const inquilinoPagaCondominio = (c) => c.conta_condominio === SITUACOES[0];
export const ressarcimentosDo = (d, contratoId) => d.ressarcimentos.filter((r) => r.contrato_id === contratoId)
  .sort((a, b) => String(b.competencia_condominio).localeCompare(String(a.competencia_condominio)) || b.id - a.id);

/** Competência do boleto que vence no mês seguinte ao pagamento da taxa pelo inquilino. */
export function competenciaDoAbatimento(c, dataPagamento) {
  const vence = C.somarMeses(C.competenciaDe(dataPagamento), 1);
  return c.cobranca_mes_seguinte !== false ? C.somarMeses(vence, -1) : vence;
}

function ressarcimentosNoBoleto(d, contratoId, comp) {
  const lista = (d.ressarcimentos || []).filter((r) => r.contrato_id === contratoId && r.competencia_abatimento === comp);
  return { valor: lista.reduce((t, r) => t + r.valor, 0), descricao: lista.map((r) => `${r.descricao} (condomínio ${C.compBr(r.competencia_condominio)})`).join('; ') };
}

/** Mês de condomínio mais antigo ainda não conferido (para o alerta e o fechamento), ou null. */
export function condominioAConferir(c, hoje = C.hojeIso()) {
  if (!inquilinoPagaCondominio(c) || !contratoAtivo(c, hoje)) return null;
  const ultimo = C.somarMeses(C.competenciaDe(hoje), -1); // o mês que acabou: o inquilino já pagou o condomínio dele
  const inicio = C.competenciaDe(c.data_entrada || hoje);
  const proximo = c.condominio_conferido_ate ? C.somarMeses(c.condominio_conferido_ate, 1) : (inicio > ultimo ? null : ultimo);
  return proximo && proximo <= ultimo ? proximo : null;
}

export function alertaCondominio(c, hoje = C.hojeIso()) {
  const mes = condominioAConferir(c, hoje);
  return mes ? { nivel: 'info', tipo: 'Condomínio', ancora: 'ressarcimentos',
    texto: `Confira o boleto do condomínio de ${C.compBr(mes)}${mes < C.somarMeses(C.competenciaDe(hoje), -1) ? ' em diante' : ''}: taxas do proprietário (fundo de obras, fundo de reserva, chamadas extras de obra…) pagas pelo inquilino devem ser ressarcidas no próximo boleto.` } : null;
}

/**
 * Coloca os ressarcimentos no boleto do mês do abatimento, se ele já existe e está em aberto. Boleto alterado à mão
 * recebe só o ressarcimento (os outros valores digitados ficam). Devolve o boleto, ou null se ainda não foi gerado.
 */
export function aplicarRessarcimentos(d, contrato, comp, usuario) {
  const cb = boletoDoMes(d, contrato.id, comp);
  if (!cb || cb.data_pagamento) return cb || null;
  const r = ressarcimentosNoBoleto(d, contrato.id, comp);
  atualizar(d, 'cobrancas', cb.id, { ressarcimento: r.valor, ressarcimento_descricao: r.descricao, ressarcimento_na_nf: !!d.ressarcimento_abate_nf && r.valor > 0 },
    usuario, `Boleto ${C.compBr(comp)}: ressarcimento de condomínio ${r.valor ? C.reais(r.valor) : 'retirado'}`);
  return cb;
}

export function marcarCondominioConferido(d, contratoId, mes, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  if (!c.condominio_conferido_ate || mes > c.condominio_conferido_ate) {
    atualizar(d, 'contratos', c.id, { condominio_conferido_ate: mes }, usuario, `${c.inquilino_nome}: condomínio de ${C.compBr(mes)} conferido`);
  }
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
  const semBoleto = ativos.filter((c) => C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0 && !boletoDoMes(d, c.id, comp));
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
    (() => {
      const conferir = ativos.filter((c) => { const m = condominioAConferir(c, hoje); return m && m <= comp; });
      return { chave: 'condominio', titulo: `Conferir as taxas do condomínio de ${C.compBr(comp)} (ressarcimento ao inquilino)`, pendentes: conferir.length,
        detalhe: conferir.length ? `a conferir: ${conferir.map((c) => c.inquilino_nome).join(', ')}` : 'nada a conferir', link: conferir.length === 1 ? `#/contrato/${conferir[0].id}?ir=ressarcimentos` : '#/inquilinos' };
    })(),
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
      const cb = boletoDoMes(d, c.id, comp);
      const venc = cb ? cb.vencimento : C.vencimentoDaCompetencia(comp, c.dia_vencimento || 10, c.cobranca_mes_seguinte !== false);
      if (!no(venc)) continue;
      const pago = cb && cb.data_pagamento;
      ev.push({ data: venc, tipo: 'Boleto', imovel_id: c.imovel_id, contrato_id: c.id, cobranca_id: cb ? cb.id : null,
        texto: `${c.inquilino_nome} · aluguel de ${C.compBr(comp)}${cb ? ` · ${C.reais(totais(cb).a_pagar_pontual)}` : ' · boleto ainda não gerado'}${geraNf(c) ? '' : ' · boleto de controle'}`,
        situacao: pago ? 'ok' : !cb ? 'neutra' : venc < hoje ? 'perigo' : 'aviso', estado: pago ? `pago em ${C.dataBr(cb.data_pagamento)}` : !cb ? 'previsto' : venc < hoje ? 'vencido' : 'em aberto' });
    }
  }
  // boletos do complemento da caução
  for (const cb of d.cobrancas.filter((x) => ehComplementoCaucao(x) && no(x.vencimento))) {
    const c = buscar(d, 'contratos', cb.contrato_id);
    if (!c) continue;
    const pago = cb.data_pagamento;
    ev.push({ data: cb.vencimento, tipo: 'Boleto', imovel_id: c.imovel_id, contrato_id: c.id, cobranca_id: cb.id,
      texto: `${c.inquilino_nome} · complemento da caução · ${C.reais(cb.caucao_complemento)}`,
      situacao: pago ? 'ok' : cb.vencimento < hoje ? 'perigo' : 'aviso', estado: pago ? `pago em ${C.dataBr(pago)}` : cb.vencimento < hoje ? 'vencido' : 'em aberto' });
  }
  // IPTU na prefeitura
  for (const p of d.iptus) {
    for (const pc of parcelasIptu(d, p)) {
      if (!no(pc.vencimento)) continue;
      ev.push({ data: pc.vencimento, tipo: 'IPTU', imovel_id: p.imovel_id,
        texto: `${nomeImovel(p.imovel_id)} · IPTU ${p.ano} ${pc.rotulo} · ${C.reais(pc.valor)} · ${!pc.proprietario ? `no boleto de ${pc.inquilino.inquilino_nome}` : pc.valorInquilino ? `sua parte ${C.reais(pc.valorProprietario)}, inquilino ${C.reais(pc.valorInquilino)}` : 'parte do proprietário'}`,
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
      const cb = boletoDoMes(d, c.id, anterior);
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
// Reajuste anual: corrigido no 13º mês, com carta enviada junto do boleto anterior
// --------------------------------------------------------------------------
/**
 * Mês de aniversário do contrato (1º mês): o mês em que o inquilino entrou (data-base), seja qual for o dia
 * (dia 1º, 15 ou 30 contam igual). O reajuste vale no 13º mês: o aluguel do mesmo mês, um ano depois.
 */
export function mesDeAniversario(c) {
  const base = dataBaseCorrecao(c);
  return base ? base.slice(0, 7) : null;
}

/** Competência (aluguel de) do n-ésimo reajuste: o 13º mês, o 25º... */
export const competenciaDoReajuste = (c, n) => { const p = mesDeAniversario(c); return p ? C.somarMeses(p, 12 * n) : null; };

/**
 * Correção já registrada para o reajuste da competência: aceita registro de até 3 meses antes até 1 mês depois
 * (contratos que entraram no meio do mês e foram corrigidos pela regra antiga, no mês seguinte).
 */
const correcaoDoReajuste = (d, c, comp) => correcoesDo(d, c.id).find((x) => x.data_vigencia >= `${C.somarMeses(comp, -3)}-01` && x.data_vigencia <= `${C.somarMeses(comp, 1)}-31`) || null;
const cartaDoReajuste = (d, c, comp) => d.cartas_reajuste.find((x) => x.contrato_id === c.id && x.competencia === comp) || null;

/** Se a competência é a de um reajuste do contrato: { n, anos, competencia, corrigido, carta }. */
export function reajusteNaCompetencia(d, c, comp) {
  const p = mesDeAniversario(c);
  if (!p || c.prazo_tipo === 'Sem reajuste') return null;
  const meses = C.mesesEntre(p, comp);
  if (meses <= 0 || meses % 12 !== 0) return null;
  const n = meses / 12;
  return { n, anos: n, competencia: comp, corrigido: correcaoDoReajuste(d, c, comp), carta: cartaDoReajuste(d, c, comp) };
}

/** Próximo reajuste a tratar: o último que já devia ter acontecido (ou acontece no mês seguinte) e não foi registrado. */
export function reajustePendente(d, c, hoje = C.hojeIso()) {
  const p = mesDeAniversario(c);
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
    texto: atrasado ? `O aluguel de ${C.compBr(r.competencia)} (${r.anos} ano(s), 13º mês) já devia estar corrigido pelo ${c.indice_correcao || 'índice do contrato'}. Registre a correção.`
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
    observacoes: `Reajuste do 13º mês (${C.compBr(comp)})` }, usuario, `Reajuste ${C.compBr(comp)}: ${C.reais(r.atual)} → ${C.reais(r.novo)} (${r.escolhido.indice} ${C.pct(r.percentual)})`);
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

/** Reajustes ainda não corrigidos até a competência "ate", inclusive os atrasados de antes de "de". */
export function reajustesNaoCorrigidos(d, de, ate, hoje = C.hojeIso()) {
  const lista = reajustesEntre(d, de, ate).filter((r) => !r.corrigido);
  for (const c of d.contratos.filter((x) => x.ativo !== false && x.imovel_id && contratoAtivo(x, hoje))) {
    const r = reajustePendente(d, c, hoje);
    if (r && r.competencia < de) lista.push({ contrato: c, ...r, calculo: calcularReajuste(d, c, r.competencia) });
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

// --------------------------------------------------------------------------
// Impostos: guia esperada por empresa, pelo faturamento das NFs (o contador faz o cálculo oficial)
// --------------------------------------------------------------------------
/**
 * Lucro presumido de locação de imóveis próprios, sobre o faturamento de NF:
 * - PIS/COFINS 3,65% (0,65% + 3%), guia mensal;
 * - IRPJ 15% e CSLL 9% sobre o lucro presumido (32% do faturamento) = 4,80% e 2,88%, guias trimestrais;
 * - adicional do IRPJ: 10% do lucro presumido que passar de R$ 60.000,00 no trimestre (Lei 9.249/95, art. 3º, § 1º);
 * - LC 224/2025: presunção 10% maior (32% → 35,2%) na parte da receita do ano acima de R$ 5 milhões, controlada
 *   por trimestre (R$ 1,25 milhão; a sobra passa para os trimestres seguintes; acerto no 4º). IRPJ desde 01/2026 e
 *   CSLL desde 04/2026 (IN RFB 2.306/2026).
 */
export const IMPOSTOS = [
  { imposto: 'PIS/COFINS', aliquota: 3.65, mensal: true },
  { imposto: 'IRPJ', aliquota: 4.8, mensal: false },
  { imposto: 'CSLL', aliquota: 2.88, mensal: false },
];
export const PRESUNCAO = 32;
export const LIMITE_ADICIONAL_IRPJ = 6000000; // R$ 60.000,00 por trimestre
export const LIMITE_LC224_TRIMESTRE = 125000000; // R$ 1.250.000,00 por trimestre (R$ 5 milhões no ano)
export const INICIO_LC224 = { IRPJ: '2026-01', CSLL: '2026-04' };

/** Trimestre de uma competência: 2026-05 → "2026-T2" (1º: jan-mar, 2º: abr-jun, 3º: jul-set, 4º: out-dez). */
export const trimestreDe = (comp) => `${comp.slice(0, 4)}-T${Math.ceil(Number(comp.slice(5, 7)) / 3)}`;
/** Meses do trimestre de uma competência (ex.: 2026-05 → 2026-04, 2026-05, 2026-06). */
export const mesesDoTrimestre = (comp) => { const t = Number(trimestreDe(comp).slice(-1)); return [0, 1, 2].map((k) => `${comp.slice(0, 4)}-${String((t - 1) * 3 + 1 + k).padStart(2, '0')}`); };

/** Faturamento de NFs emitidas (não canceladas) de uma empresa num mês, pela data de emissão. */
export function faturamentoNf(d, emitenteId, comp) {
  const fs = d.faturas.filter((f) => f.emitente_id === emitenteId && f.situacao !== 'Cancelada' && String(f.emissao || '').slice(0, 7) === comp);
  return { valor: fs.reduce((t, f) => t + f.valor, 0), notas: new Set(fs.map((f) => f.numero)).size };
}

const guiaDo = (d, emitenteId, imposto, periodo) => d.guias_impostos.find((g) => g.emitente_id === emitenteId && g.imposto === imposto && g.periodo === periodo) || null;

/** Feriados nacionais em que os bancos não abrem (fixos e móveis pela Páscoa: Carnaval, Sexta-feira Santa, Corpus Christi). */
function feriados(ano) {
  // domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
  const a = ano % 19; const b = Math.floor(ano / 100); const c = ano % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((x) => `${ano}-${x}`);
  return new Set([...fixos, ...[-48, -47, -2, 60].map((n) => C.somarDias(pascoa, n))]);
}
const diaUtil = (iso) => { const dia = new Date(`${iso}T12:00:00`).getDay(); return dia !== 0 && dia !== 6 && !feriados(Number(iso.slice(0, 4))).has(iso); };
/** Dia útil igual ou anterior à data (vencimento de tributo federal que cai em dia sem expediente bancário). */
export function diaUtilAteh(iso) { let x = iso; while (!diaUtil(x)) x = C.somarDias(x, -1); return x; }
/** Vencimento da guia: PIS/COFINS até o dia 25 do mês seguinte; IRPJ/CSLL até o último dia útil do mês seguinte ao trimestre. */
export function vencimentoGuia(mensal, periodo) {
  if (mensal) return diaUtilAteh(`${C.somarMeses(periodo, 1)}-25`);
  const fim = `${periodo.slice(0, 4)}-${String(Number(periodo.slice(-1)) * 3).padStart(2, '0')}`;
  const seguinte = C.somarMeses(fim, 1);
  return diaUtilAteh(C.somarDias(`${C.somarMeses(seguinte, 1)}-01`, -1));
}

/**
 * Parte da receita do trimestre acima do limite da LC 224/2025 (IN RFB 2.306/2026): R$ 1,25 milhão por trimestre,
 * mais a sobra do limite dos trimestres anteriores do ano. No 4º trimestre, acerto anual: o total do ano fica
 * igual à receita do ano acima de R$ 5 milhões (pode dar negativo: devolve o que foi acrescido a mais).
 * Trimestres antes do início da regra (CSLL em 2026: só desde abril) ficam fora da conta, com o limite proporcional.
 */
function excedenteLc224(d, emitenteId, comp, inicio) {
  const ano = comp.slice(0, 4);
  const t = Number(trimestreDe(comp).slice(-1));
  const receita = (q) => mesesDoTrimestre(`${ano}-${String(q * 3).padStart(2, '0')}`).filter((m) => m <= comp).reduce((v, m) => v + faturamentoNf(d, emitenteId, m).valor, 0);
  let sobra = 0;
  let considerado = 0;
  let total = 0;
  let atual = 0;
  let contados = 0;
  for (let q = 1; q <= t; q += 1) {
    if (mesesDoTrimestre(`${ano}-${String(q * 3).padStart(2, '0')}`)[0] < inicio) continue;
    contados += 1;
    const r = receita(q);
    const limite = LIMITE_LC224_TRIMESTRE + sobra;
    const excedente = Math.max(0, r - limite);
    sobra = Math.max(0, limite - r);
    total += r;
    if (q < t) considerado += excedente; else atual = excedente;
  }
  return t === 4 ? Math.max(0, total - contados * LIMITE_LC224_TRIMESTRE) - considerado : atual;
}

/** Valor mínimo de um DARF: abaixo dele não se paga e o valor passa para o período seguinte do mesmo imposto (Lei 9.430/96, art. 68). */
export const MINIMO_GUIA = 1000;

/**
 * Valor que vem de períodos anteriores do mesmo imposto: guias abaixo de R$ 10,00 não pagas, somadas até o total
 * chegar a R$ 10,00. Mensal: meses anteriores; trimestral: trimestres anteriores (guias completas).
 */
function transportado(d, e, x, comp) {
  const primeira = d.faturas.filter((f) => f.emitente_id === e.id && f.situacao !== 'Cancelada' && f.emissao).map((f) => f.emissao.slice(0, 7)).sort()[0];
  if (!primeira) return 0;
  const passo = x.mensal ? 1 : 3;
  const atual = x.mensal ? comp : mesesDoTrimestre(comp)[2];
  let saldo = 0;
  for (let m = x.mensal ? primeira : mesesDoTrimestre(primeira)[2]; m < atual; m = C.somarMeses(m, passo)) {
    const total = saldo + guiasDoPeriodo(d, e, m).find((g) => g.imposto === x.imposto).esperado;
    saldo = total > 0 && total < MINIMO_GUIA ? total : 0;
  }
  return saldo;
}

/**
 * Guias esperadas no mês para cada empresa: PIS/COFINS do mês e IRPJ/CSLL do trimestre, acumulando mês a mês
 * até o último mês do trimestre (aí é a guia completa). Valor do contador ao lado, quando informado.
 * "aPagar" soma o que veio de guias abaixo de R$ 10,00; se ainda ficar abaixo, "abaixoDoMinimo" (passa adiante).
 */
export function impostosDoMes(d, comp) {
  return d.emitentes.filter((e) => e.ativo || d.faturas.some((f) => f.emitente_id === e.id)).map((e) => {
    const r = guiasDaEmpresa(d, e, comp);
    r.guias = r.guias.map((g) => {
      const anterior = transportado(d, e, g, comp);
      const aPagar = g.esperado + anterior;
      return { ...g, transportado: anterior, aPagar, abaixoDoMinimo: aPagar > 0 && aPagar < MINIMO_GUIA };
    });
    return r;
  });
}

const guiasDoPeriodo = (d, e, comp) => guiasDaEmpresa(d, e, comp).guias;

/** Cálculo das guias de uma empresa no mês, sem o que vem de períodos anteriores. */
function guiasDaEmpresa(d, e, comp) {
  const meses = mesesDoTrimestre(comp).filter((m) => m <= comp);
  const tri = trimestreDe(comp);
  const mes = faturamentoNf(d, e.id, comp);
  const porMes = meses.map((m) => ({ mes: m, ...faturamentoNf(d, e.id, m) }));
  const trimestre = porMes.reduce((t, x) => t + x.valor, 0);
  // lucro presumido do trimestre: 32% do faturamento + 3,2% (10% de 32%) da parte acima do limite da LC 224
  const presumido = (imposto) => {
    const extra = mesesDoTrimestre(comp)[0] >= INICIO_LC224[imposto] ? excedenteLc224(d, e.id, comp, INICIO_LC224[imposto]) : 0;
    return { base: Math.round((trimestre * PRESUNCAO) / 100) + Math.round((extra * PRESUNCAO) / 1000), lc224: extra };
  };
  return { empresa: e, faturamento: mes, trimestre, porMes, fechado: meses.length === 3,
    guias: IMPOSTOS.map((x) => {
      const periodo = x.mensal ? comp : tri;
      const g = { ...x, periodo, vencimento: vencimentoGuia(x.mensal, periodo), contador: guiaDo(d, e.id, x.imposto, periodo), adicional: 0, lc224: 0 };
      if (x.mensal) return { ...g, base: mes.valor, esperado: Math.round((mes.valor * x.aliquota) / 100) };
      const p = presumido(x.imposto);
      const adicional = x.imposto === 'IRPJ' ? Math.max(0, Math.round((p.base - LIMITE_ADICIONAL_IRPJ) / 10)) : 0;
      const normal = Math.round((p.base * (x.imposto === 'IRPJ' ? 15 : 9)) / 100);
      return { ...g, base: trimestre, presumido: p.base, lc224: p.lc224, adicional, esperado: normal + adicional };
    }) };
}

/** Grava (ou apaga, com valor vazio) o valor da guia calculado pelo contador. */
export function salvarGuiaImposto(d, emitenteId, imposto, periodo, valor, usuario) {
  const atual = guiaDo(d, emitenteId, imposto, periodo);
  const e = buscar(d, 'emitentes', emitenteId);
  const texto = `Guia ${imposto} ${periodo} · ${e ? e.nome : ''}`;
  if (valor === null) { if (atual) excluir(d, 'guias_impostos', atual.id, usuario, `${texto}: valor do contador apagado`); return; }
  if (atual) atualizar(d, 'guias_impostos', atual.id, { valor }, usuario, `${texto}: ${C.reais(valor)}`);
  else inserir(d, 'guias_impostos', { emitente_id: emitenteId, imposto, periodo, valor }, usuario, `${texto}: ${C.reais(valor)}`);
}
