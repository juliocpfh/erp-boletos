// Regras de negócio sobre o banco de dados (um objeto JSON em memória).
// Toda gravação passa por inserir/atualizar/excluir, que registram o histórico.
import * as alertas from './alertas.js';
import * as AI from './arquivo-impresso.js';
import { soDigitos } from './c6-comum.js';
import * as C from './calculos.js';
import { camposAntigosDaEmpresa, companhiaDoImovel, dadoDaEmpresa, locadorasDoContrato, modelosDe, nomeCurtoCompanhia, resultadoVistoriaSaida, TIPO_ADITIVO_TROCA, TIPO_ADITIVO_VALOR, vistoriaDeEntrada } from './contratos.js';
import * as CR from './config-regras.js';
import * as F from './formularios.js';
import * as M from './mapa-c6.js';
import { textoAtualizadoDoModelo } from './modelos-contrato.js';

export const TABELAS = {
  imoveis: 'Imóvel', contratos: 'Inquilino / contrato', correcoes: 'Correção de aluguel', seguros: 'Seguro',
  iptus: 'IPTU', titularidades: 'Troca de titularidade', cobrancas: 'Boleto', recebimentos: 'Recebimento Airbnb',
  faturas: 'NF', emitentes: 'Empresa', participacoes: 'Empresa no imóvel', usuarios: 'Usuário',
  fiadores: 'Fiador', aplicacoes: 'Aplicação da garantia', correcoes_garantia: 'Correção da caução', depositos_garantia: 'Depósito da caução / garantia',
  devolucoes_garantia: 'Devolução da garantia (troca de titular ou de garantia)',
  renovacoes: 'Renovação / novo valor', trocas_garantia: 'Troca de garantia', leituras: 'Leitura dos relógios', encerramentos: 'Saída do inquilino', avulsas: 'NF avulsa',
  reformas: 'Reforma / investimento', solicitacoes: 'Solicitação do inquilino', notificacoes: 'Notificação ao inquilino', fichas: 'Ficha em análise', comunicados: 'Comunicado aos inquilinos',
  indices_acumulados: 'Índice acumulado em 12 meses', cartas_reajuste: 'Carta de reajuste', modelos_contrato: 'Modelo de contrato', vistorias: 'Vistoria', aditivos: 'Termo aditivo', documentos_locacao: 'Outro documento da locação (distrato, aviso, declaração etc.)', despesas: 'Conta paga por nós', ganhos_airbnb: 'Ganho do Airbnb', ressarcimentos: 'Ressarcimento de condomínio', fechamentos: 'Etapa do fechamento do mês', guias_impostos: 'Guia de imposto',
  modelos_email: 'Modelo de e-mail', envios_email: 'E-mail enviado', taxas_poupanca: 'Taxas da poupança do Banco Central (um mês)',
  regua_emails: 'E-mail da régua de cobrança (autorizado ou não)',
  cobranca_registros: 'Registro da cobrança (passo, despesa e prova)',
  movimentacoes_banco: 'Movimentação bancária', pagamentos_banco: 'Pagamento pelo banco', adiamentos_alerta: 'Adiamento de alerta', alertas_desligados: 'Alerta desligado', acordos: 'Acordo de dívida', pastas_fisicas: 'Pasta física (arquivo impresso)', config_regras: 'Regra do sistema', versoes_regras: 'Versão salva das regras', perfis_regras: 'Regra especial (de alguns contratos)', arquivos: 'Arquivo', banco: 'Banco de dados', listas: 'Lista de opções',
};

/** Quem paga cada conta prevista no contrato (a mesma lista do formulário, `SITUACOES_CONTA`). Só "por conta do inquilino" entra no boleto (IPTU e seguro). */
export const SITUACOES = F.SITUACOES_CONTA;

/**
 * Concessionárias que vêm na lista de um banco novo, pelo Estado da sede da empresa (Empresas). Até 2026-11-17 era sempre a
 * do Paraná, que continua o padrão (também sem empresa cadastrada). Estado fora da tabela: as companhias de energia e de água
 * do cadastro da empresa, pelo nome curto, e o condomínio. Ex.: empresa em SP com "Enel Distribuição São Paulo (ENEL)" e
 * "Companhia de Saneamento Básico do Estado de São Paulo (SABESP)" → ['Enel', 'Sabesp', 'Condomínio'].
 */
export const CONCESSIONARIAS_POR_UF = { PR: ['Copel', 'Sanepar', 'Supergasbras', 'Condomínio'] };
export function concessionariasPadrao(d) {
  if (!d || !(d.emitentes || []).some((e) => e.ativo !== false)) return [...CONCESSIONARIAS_POR_UF.PR];
  const uf = String(dadoDaEmpresa(d, {}, 'uf_sede') || '').trim().toUpperCase();
  if (CONCESSIONARIAS_POR_UF[uf]) return [...CONCESSIONARIAS_POR_UF[uf]];
  const daEmpresa = ['energia', 'agua'].map((q) => nomeCurtoCompanhia(dadoDaEmpresa(d, {}, `${q}_concessionaria`))).filter(Boolean);
  if (daEmpresa.length) return [...new Set([...daEmpresa, 'Condomínio'])];
  return uf ? ['Condomínio'] : [...CONCESSIONARIAS_POR_UF.PR];
}

/** Listas de opções que o usuário pode editar (incluir e remover itens). ``padraoDe``: a lista inicial depende do banco. */
export const LISTAS = {
  concessionarias: { nome: 'concessionárias', padrao: CONCESSIONARIAS_POR_UF.PR, padraoDe: concessionariasPadrao },
  indices: { nome: 'índices de correção', padrao: ['IGP-M', 'IPCA', 'IGP-M/IPCA (o maior)', 'INPC', 'IVAR', 'IGP-DI', 'Poupança'] },
};

/**
 * Configuração da integração com o banco (C6 Bank, boleto com Pix). Fica em ``d.config_banco``. A ponte (ponte-c6/) guarda as
 * chaves da API de cada conta; o site só sabe o endereço dela e a senha da ponte. ``contas``: uma por conta bancária
 * (ex.: ANK e JCK), cada uma ligada à empresa do cadastro (``emitente_id``) e com o mesmo ``id`` usado na ponte (CONTAS=ank,jck).
 */
// Endereço e senha da ponte NÃO ficam aqui (o JSON é compartilhado na pasta/OneDrive): ficam no navegador (armazenamento.js → lembrarPonte).
export const CONFIG_BANCO_PADRAO = { ativo: false, provedor: 'c6', conta_padrao_id: '', modo_conta_boleto: 'padrao', contas: [] };

/** Qual conta emite os boletos (Sistema → Banco): sempre a padrão (ANK, por orientação do contador) ou escolher boleto a boleto. */
export const MODOS_CONTA_BOLETO = { padrao: 'Sempre pela empresa padrão', escolher: 'Escolher a empresa boleto a boleto' };

/**
 * Campos de cada conta em ``config_banco.contas``. ``dias_baixa``: dias depois do vencimento em que o banco baixa o boleto sozinho;
 * ``carteira``: vazia = a do ambiente (sandbox 21, produção 15); ``tipo_desconto``/``desconto_dias_antes``: como o desconto de pontualidade
 * vai ao banco (valor fixo até o vencimento; confirmar no sandbox no 1º boleto de teste); ``notificar``: aviso automático ao pagador
 * (canais e momentos; o contrato pode não notificar ou escolher); ``negativacao``: botão de negativar no birô (só administrador).
 */
export const CONTA_BANCO_PADRAO = { id: '', apelido: '', emitente_id: null, ambiente: 'sandbox', carteira: '', chave_pix: '', tipo_chave_pix: 'EVP', dias_baixa: 30, instrucoes: '',
  tipo_desconto: 'VALUE_PER_DAY', desconto_dias_antes: 0, desconto_conferido: null, // tipo_desconto: primeiro valor do enum da API; confirmar no sandbox no 1º boleto de teste
  notificar: { email: true, sms: true, emissao: true, antes: true, vencimento: true, depois: true },
  negativacao: { ativa: false, dias_atraso: 30 } };

/** Canais e momentos da notificação ao pagador: chave da configuração → [nome na API (mapa-c6), rótulo]. */
export const CANAIS_NOTIFICACAO = { email: ['email', 'E-mail'], sms: ['sms', 'SMS'] };
export const MOMENTOS_NOTIFICACAO = { emissao: ['emissao', 'na emissão'], antes: ['antes', 'um dia antes do vencimento'], vencimento: ['vencimento', 'no vencimento'], depois: ['depois', 'um dia depois do vencimento'] };

/** Como o contrato trata a notificação do banco (campo ``notificacao_banco`` do contrato). */
export const NOTIFICACAO_CONTRATO = ['Usar o padrão da conta', 'Não notificar', 'Escolher'];

export function bancoVazio() {
  const agora = new Date().toISOString();
  const d = { formato: 'imoveis-v1', revisao: 0, criado_em: agora, atualizado_em: null, atualizado_por: null,
    proxima_fatura: 1, seq: {}, historico: [], listas: {}, config_banco: { ...CONFIG_BANCO_PADRAO, contas: [] } };
  for (const t of Object.keys(TABELAS)) if (!['arquivos', 'banco', 'listas'].includes(t)) d[t] = [];
  return d;
}

/** Garante que um banco antigo tenha todas as tabelas e campos novos. */
export function normalizar(d) {
  const vazio = bancoVazio();
  for (const [k, v] of Object.entries(vazio)) if (d[k] === undefined) d[k] = v;
  CR.usarRegras(d); // regras escolhidas pelo administrador (as contas abaixo já usam)
  // lista que depende da empresa (concessionárias): num banco novo só é gravada depois de cadastrada a primeira empresa
  // (até lá, ``lista`` devolve a do Paraná sem gravar); banco que já tem a lista fica como está
  for (const [k, l] of Object.entries(LISTAS)) {
    if (!Array.isArray(d.listas[k]) && (!l.padraoDe || d.emitentes.length)) d.listas[k] = [...(l.padraoDe ? l.padraoDe(d) : l.padrao)];
  }
  // integração com o banco (C6, boleto com Pix): configuração com todos os campos e cada boleto com o campo ``banco`` (nulo = não emitido)
  d.config_banco = { ...CONFIG_BANCO_PADRAO, ...(d.config_banco && typeof d.config_banco === 'object' ? d.config_banco : {}) };
  // a senha e o endereço da ponte passaram a ficar só no navegador: saem do JSON compartilhado
  delete d.config_banco.senha_ponte;
  delete d.config_banco.ponte_url;
  d.config_banco.contas = (Array.isArray(d.config_banco.contas) ? d.config_banco.contas : []).map((x) => ({ ...CONTA_BANCO_PADRAO, ...x,
    notificar: { ...CONTA_BANCO_PADRAO.notificar, ...((x && x.notificar) || {}) }, negativacao: { ...CONTA_BANCO_PADRAO.negativacao, ...((x && x.negativacao) || {}) } }));
  for (const cb of d.cobrancas) if (cb.banco === undefined) cb.banco = null;
  // registros da cobrança (2026-11-24): a lista de arquivos sempre existe
  for (const x of d.cobranca_registros) if (!Array.isArray(x.arquivos)) x.arquivos = x.arquivos ? [String(x.arquivos)] : [];
  // conta padrão dos boletos sem escolha: era a de identificador "ank" (2026-11-05); passou a ser só a escolhida em Sistema → Banco
  if (!d.config_banco.conta_padrao_id && d.config_banco.contas.some((x) => x.id === 'ank')) d.config_banco.conta_padrao_id = 'ank';
  // o que era fixo da ANK no código (e-mail, assinaturas, conta da caução, cidade, Copel/Sanepar) passou ao cadastro da empresa
  for (const e of d.emitentes) Object.assign(e, camposAntigosDaEmpresa(e));
  // normalizar roda a cada gravação (e a cada 30 s na nuvem): os cruzamentos entre tabelas usam Set/Map, não laço dentro de laço
  const contratoPorId = new Map(d.contratos.map((c) => [c.id, c]));
  // garantia marcada como passada a um contrato que foi excluído: volta a ser deste (senão não passa ao novo titular)
  for (const c of d.contratos) if (c.garantia_transferida_para && !contratoPorId.has(c.garantia_transferida_para)) c.garantia_transferida_para = null;
  // o alerta "Documentos de entrada" passou a fazer parte do "Rotina de entrada": a aparência escolhida vai junto
  if (d.estilos_alertas && d.estilos_alertas['Documentos de entrada']) {
    d.estilos_alertas['Rotina de entrada'] = d.estilos_alertas['Rotina de entrada'] || d.estilos_alertas['Documentos de entrada'];
    delete d.estilos_alertas['Documentos de entrada'];
  }
  // "Correção do aluguel" nunca gerou alerta (o aviso do reajuste é "Reajuste do aluguel", mesmo padrão): a aparência
  // escolhida passa ao reajuste, se este ficou no padrão; o tipo saiu da lista (entrou "Devolver garantia")
  if (d.estilos_alertas && d.estilos_alertas['Correção do aluguel']) {
    d.estilos_alertas['Reajuste do aluguel'] = d.estilos_alertas['Reajuste do aluguel'] || d.estilos_alertas['Correção do aluguel'];
    delete d.estilos_alertas['Correção do aluguel'];
  }
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
  // troca de titular sem o termo assinado: até 16/11/2026, aqui a data de saída do anterior era apagada a cada abertura (sem
  // histórico; na nuvem, apagava a que o operador tinha gravado). Decisão do dono de 2026-11-17 (item 36 do mutirão 3000): a
  // data fica como está e o alerta "Aditivo da troca de titular" avisa (alertaAditivoHerdeiro). Os bancos de antes de 30/10/2026
  // já passaram por esta correção em todas as aberturas desde então; transferirHeranca continua sem pôr a data sem o termo.
  // boleto do complemento da caução nunca tem multa nem juros: acerta os já gerados (e o recebido, se foi calculado com eles)
  for (const cb of d.cobrancas) {
    if (!ehComplementoCaucao(cb) || (!cb.multa_percentual && !cb.juros_mensal_percentual && !cb.multa && !cb.juros)) continue;
    const cobrado = (cb.multa || 0) + (cb.juros || 0);
    if (cobrado && cb.valor_pago === cb.caucao_complemento + cobrado) cb.valor_pago = cb.caucao_complemento;
    cb.multa_percentual = 0;
    cb.juros_mensal_percentual = 0;
    if (cb.data_pagamento) { cb.multa = 0; cb.juros = 0; }
  }
  // diferença de pagamento em parte (antes de 2026-11-20) já levada a outro boleto: o boleto de destino passa a guardá-la em
  // ``diferencas_cobradas`` (presa a ele, fora da base de multa e juros), se o texto dela ainda está no ajuste do mês (destino
  // que não existe mais, boleto excluído: ``diferencaPendente`` já a trata como à espera de um boleto)
  for (const cb of d.cobrancas) {
    if (!(cb.diferenca_devida > 0) || !cb.diferenca_no_boleto) continue;
    const destino = d.cobrancas.find((x) => x.id === cb.diferenca_no_boleto);
    if (!destino) continue;
    if ((destino.diferencas_cobradas || []).some((e) => e.cobranca_id === cb.id)) continue;
    if (!String(destino.outros_descricao || '').split('; ').includes(textoDiferenca(cb))) continue;
    destino.diferencas_cobradas = [...(destino.diferencas_cobradas || []), { cobranca_id: cb.id, valor: cb.diferenca_devida, texto: textoDiferenca(cb) }];
  }
  migrarAirbnb(d);
  // versão 1 guardava um único fiador dentro do contrato
  for (const c of d.contratos) {
    if (c.fiador_nome && !d.fiadores.some((f) => f.contrato_id === c.id)) {
      d.seq.fiadores = proximoCodigo(d, 'fiadores'); // nunca repete um código já gravado (item 38)
      d.fiadores.push({ id: d.seq.fiadores, contrato_id: c.id, nome: c.fiador_nome, cpf: c.fiador_cpf || '',
        rg: c.fiador_rg || '', telefone: c.fiador_telefone || '', email: c.fiador_email || '', endereco: c.fiador_endereco || '' });
    }
    for (const k of ['fiador_nome', 'fiador_cpf', 'fiador_rg', 'fiador_telefone', 'fiador_email', 'fiador_endereco']) delete c[k];
  }
  // o seguro obrigatório era do inquilino; foi para o imóvel (2026-10-09) e voltou a ser do inquilino (2026-10-26):
  // a apólice sem inquilino vai para quem estava no imóvel no início da vigência
  for (const s of d.seguros) {
    if (!s.imovel_id && s.contrato_id) {
      const c = contratoPorId.get(s.contrato_id);
      if (c) s.imovel_id = c.imovel_id;
    }
    if (!s.contrato_id) s.contrato_id = contratoDoSeguro(d, s);
    const c = s.contrato_id && contratoPorId.get(s.contrato_id);
    if (c) s.imovel_id = c.imovel_id; // acompanha o imóvel do contrato (ex.: "Corrigir imóvel")
  }
  // atualizações automáticas dos modelos de contrato já gravados (FCI, revisão jurídica de 12 e 13/11, garantia nova e contas de
  // consumo no termo da troca, resumo do contrato...): os passos estão em textoAtualizadoDoModelo (modelos-contrato.js), que a
  // nuvem usa também para não abrir conflito quando dois aparelhos com versões diferentes do site atualizam o mesmo modelo (24/11)
  for (const m of d.modelos_contrato || []) {
    const novo = textoAtualizadoDoModelo(m);
    if (novo !== m.texto) m.texto = novo;
  }
  // o Estado (UF) do imóvel passou a ser guardado: vem do CEP
  for (const i of d.imoveis) if (!i.uf && C.ufDoCep(i.cep)) i.uf = C.ufDoCep(i.cep);
  // contrato sem imóvel passou a ter prazo para ser vinculado: os que já existiam contam a partir de hoje
  for (const c of d.contratos) if (!c.imovel_id && !c.sem_imovel_desde) c.sem_imovel_desde = C.hojeIso();
  // caução: a data prevista é a do contrato e o valor vem dos aluguéis × aluguel com bonificação (contratos que ficaram sem).
  // Desde 2026-11-17 (item 37 do mutirão 3000): só preenche o valor que falta (vazio), nunca o zero gravado de propósito, e
  // pela conta padrão (com bonificação), sem depender da regra `caucao_base` do momento (o resultado não muda com a regra)
  for (const c of d.contratos) if (c.garantia_tipo === 'Caução') completarCaucao(c, { contaPadrao: true });
  // "Possui termo aditivo" só com termo registrado, inativar quem saiu e completar a caução pelos depósitos eram feitos aqui,
  // calados: desde 2026-11-07 (rotina C9) ficam em `rotinaDeAbertura`, que roda com o usuário logado e passa pelo histórico.
  // troca de titular: o prazo continua o do contrato (antes recomeçava na data da troca); só quem ainda não foi renovado
  // (o fim sai de `fimDoContrato`, o mesmo do cadastro: sem renovação, o do contrato assumido)
  const renovados = new Set(d.renovacoes.map((x) => x.contrato_id));
  for (const c of d.contratos) {
    if (!c.contrato_anterior_id) continue;
    const fim = fimDoContrato(d, c);
    if (fim && fim !== c.vigencia_fim && c.prazo_tipo !== 'Indeterminado' && c.vigencia_fim === C.fimDoPrazo(c.data_entrada || c.vigencia_inicio, c.prazo_meses)
      && !renovados.has(c.id)) c.vigencia_fim = fim;
  }
  // Banco (C6), fase 2: extrato, conciliação e pagamentos. Só acrescenta os campos novos da configuração (os da base ficam como estão).
  d.config_banco = d.config_banco || {};
  for (const [k, v] of Object.entries(CONFIG_BANCO_FASE2)) if (d.config_banco[k] === undefined) d.config_banco[k] = typeof v === 'object' && v ? { ...v } : v;
  if (!d.config_banco.ultima_importacao || typeof d.config_banco.ultima_importacao !== 'object') d.config_banco.ultima_importacao = {};
  // "extrato importado até" saiu de config_banco (que só o administrador muda na nuvem) para a raiz, por conta (2026-11-09):
  // sem cópia aqui (o operador abriria conflito na nuvem com a cópia que só ele tem): `extratoImportadoAte` lê os dois e vale a
  // data mais nova; o campo novo nasce na primeira importação
  for (const m of d.movimentacoes_banco) {
    if (m.classificacao === undefined) m.classificacao = null;
    if (m.valor < 0) { m.valor = -m.valor; m.tipo = 'saida'; }
    for (const k of ['imovel_id', 'despesa_id', 'cobranca_id', 'iptu_id', 'iptu_parcela', 'guia_imposto_id', 'pagamento_banco_id', 'par_movimentacao_id', 'nome_arquivo', 'comprovante', 'comprovante_contador', 'comprovante_origem']) if (m[k] === undefined) m[k] = null;
  }
  for (const p of d.pagamentos_banco) if (!p.referencia) p.referencia = `erp-${p.id}`;
  // despesa ou boleto ligado a uma movimentação que sumiu (ex.: importação refeita) perde o vínculo
  const movimentacoes = new Set(d.movimentacoes_banco.map((m) => m.id));
  for (const x of d.despesas) if (x.movimentacao_id && !movimentacoes.has(x.movimentacao_id)) x.movimentacao_id = null;
  for (const x of d.cobrancas) if (x.movimentacao_id && !movimentacoes.has(x.movimentacao_id)) x.movimentacao_id = null;
  // troca de titular (2026-11-13): a apólice que passou ao novo titular guarda de quem veio (`herdado_de`), para continuar no
  // histórico do anterior. Trocas antigas: apólice do novo com vigência começando antes da troca só pode ter vindo do anterior.
  for (const n of d.contratos) {
    const inicio = n.data_entrada || n.vigencia_inicio;
    if (!n.contrato_anterior_id || !n.heranca_transferida || !inicio) continue;
    for (const s of d.seguros) if (s.contrato_id === n.id && s.herdado_de === undefined && s.vigencia_inicio && s.vigencia_inicio < inicio) s.herdado_de = n.contrato_anterior_id;
  }
  // o link da ficha pela internet leva a chave da pessoa (depois do "#"): não fica no banco (2026-11-16, ia a todos os aparelhos
  // e aos backups); só a validade, quando e por quem. O link aparece uma vez, na hora de gerar; mandar de novo gera outro.
  for (const f of d.fichas || []) {
    if (!f.links_ficha || typeof f.links_ficha !== 'object') continue;
    if (!Object.values(f.links_ficha).some((l) => l && typeof l === 'object' && 'url' in l)) continue;
    f.links_ficha = Object.fromEntries(Object.entries(f.links_ficha).map(([p, l]) => {
      if (!l || typeof l !== 'object' || !('url' in l)) return [p, l];
      const { url, ...resto } = l; // eslint-disable-line no-unused-vars
      return [p, resto];
    }));
  }
  return d;
}

/**
 * Contrato dono de uma apólice antiga (do tempo em que o seguro era do imóvel): quem estava no imóvel no início da
 * vigência (se dois, o que entrou depois); ninguém nesse dia: o que mais ocupou o imóvel na vigência.
 * Ex.: vigência 27/01/2026 a 27/01/2027, Antigo de 27/01 a 26/04 e Novo desde 27/04 → Antigo (leva a apólice ao sair).
 */
export function contratoDoSeguro(d, s) {
  const ini = s.vigencia_inicio;
  if (!ini || !s.imovel_id) return null;
  const fim = s.vigencia_fim || C.somarMesesData(ini, 12);
  const dias = (c) => {
    const de = c.data_entrada > ini ? c.data_entrada : ini;
    const ate = c.data_saida && c.data_saida < fim ? c.data_saida : fim;
    return ate >= de ? C.diasEntre(de, ate) + 1 : 0;
  };
  const doImovel = d.contratos.filter((c) => c.imovel_id === s.imovel_id && c.data_entrada)
    .sort((a, b) => b.data_entrada.localeCompare(a.data_entrada) || b.id - a.id);
  const noInicio = doImovel.find((c) => c.data_entrada <= ini && (!c.data_saida || c.data_saida >= ini));
  if (noInicio) return noInicio.id;
  const [maior] = doImovel.map((c) => [c, dias(c)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return maior ? maior[0].id : null;
}

/**
 * Ordem da caução: 1º as condições do contrato (valor e data prevista = data do contrato), 2º a assinatura,
 * 3º o comprovante. Sem data: a do início do contrato; sem valor (vazio; o zero gravado de propósito fica): aluguéis ×
 * aluguel inicial com bonificação (pela regra `caucao_base`; `contaPadrao`: sempre com bonificação, a conta da migração).
 */
export function completarCaucao(c, { contaPadrao = false } = {}) {
  if (!c.caucao_data) c.caucao_data = c.vigencia_inicio || c.data_entrada || null;
  if ((c.caucao_valor === null || c.caucao_valor === undefined || c.caucao_valor === '') && c.caucao_meses > 0 && c.aluguel_inicial > 0) {
    const aluguel = contaPadrao ? c.aluguel_inicial - C.descontoPorPercentual(c.aluguel_inicial, percentualBonificacao(c)) : aluguelDaCaucao(c.aluguel_inicial, c);
    c.caucao_valor = c.caucao_meses * aluguel;
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
export const lista = (d, nome) => d.listas[nome] || (LISTAS[nome].padraoDe ? LISTAS[nome].padraoDe(d) : LISTAS[nome].padrao);

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

const OCULTOS = new Set(['senha_hash', 'senha_sal', 'senha_iteracoes', 'sessoes', 'links_ficha']);
const visivel = (obj) => Object.fromEntries(Object.entries(obj)
  .filter(([k, v]) => !OCULTOS.has(k) && v !== null && v !== '' && v !== undefined));

/**
 * Conteúdo pesado que não precisa ir duas vezes ("de" e "para") a cada linha do histórico: a imagem do QR Code do Pix dentro de
 * `cobrancas.banco` (alguns KB por boleto, repetidos a cada consulta ao banco). No histórico fica a marca; a imagem continua no
 * boleto. Só em tabela que não se desfaz pelo Histórico (boleto está em SEM_DESFAZER): o "Desfazer" precisa do valor inteiro.
 */
const IMAGEM_FORA_DO_HISTORICO = '(imagem guardada só no boleto)';
const semPeso = (tabela, k, v) => (tabela === 'cobrancas' && k === 'banco' && v && typeof v === 'object' && v.pix_qr_base64
  ? { ...v, pix_qr_base64: IMAGEM_FORA_DO_HISTORICO } : v);

/**
 * Pessoas de um comunicado no histórico (mutirão 19/11, comunicacoes-001): só as que mudaram naquela gravação, e sem a
 * assinatura desenhada e o texto aceito (ficam só no comunicado). Ex.: "e-mail enviado para Maria" num comunicado de 40
 * pessoas → de/para com a linha de Maria, não as 40 duas vezes. Comunicado não se desfaz pelo Histórico (SEM_DESFAZER).
 */
const RESPOSTA_PESADA = new Set(['assinatura', 'texto_aceito']);
export function destinosParaHistorico(de, para) {
  const mapa = (l) => new Map((Array.isArray(l) ? l : []).map((x, i) => [x && x.chave ? x.chave : `#${i}`, x]));
  const antes = mapa(de); const depois = mapa(para);
  const leve = (x) => (x && x.resposta && typeof x.resposta === 'object' ? { ...x, resposta: Object.fromEntries(Object.entries(x.resposta)
    .map(([k, v]) => [k, RESPOSTA_PESADA.has(k) && v ? '(guardado só no comunicado)' : v])) } : x);
  const mudou = [...new Set([...antes.keys(), ...depois.keys()])].filter((k) => JSON.stringify(antes.get(k)) !== JSON.stringify(depois.get(k)));
  return { de: mudou.filter((k) => antes.has(k)).map((k) => leve(antes.get(k))), para: mudou.filter((k) => depois.has(k)).map((k) => leve(depois.get(k))) };
}

/**
 * Inclui um registro, com a linha no histórico. ``historico: false`` só para carga em lote que registra UMA linha por conta
 * própria (importação do extrato: 1.100 lançamentos davam 1.100 linhas de histórico, cada uma com a cópia do lançamento).
 */
/**
 * Próximo código de uma tabela: o seguinte ao `seq` (na nuvem, a faixa deste aparelho); se esse já está usado (dados montados
 * fora, backup antigo) ou não há `seq`, o seguinte ao maior código da tabela. Laço simples: `Math.max(...lista)` estourava a
 * pilha com tabela muito grande (item 45).
 */
function proximoCodigo(d, tabela) {
  const lista = d[tabela] || [];
  const seguinte = Number(d.seq[tabela]) > 0 ? Number(d.seq[tabela]) + 1 : 0;
  if (seguinte && !lista.some((r) => r.id === seguinte)) return seguinte;
  let maior = Number(d.seq[tabela]) || 0;
  for (const r of lista) if (r.id > maior) maior = r.id;
  return maior + 1;
}

/**
 * Campos de dinheiro (centavos inteiros) de cada tabela. ``TABELAS`` não diz o tipo dos campos; o que já diz é o formulário de
 * cada cadastro (``formularios.js``, tipo "dinheiro"; os virtuais não são gravados). Só esses são conferidos ao gravar.
 * Formulário novo de cadastro com dinheiro: entra aqui. Montado na 1ª gravação.
 */
const FORMULARIOS_DA_TABELA = () => ({
  imoveis: [F.IMOVEL], solicitacoes: [F.SOLICITACAO], reformas: [F.REFORMA], ressarcimentos: [F.RESSARCIMENTO], contratos: [F.CONTRATO],
  fichas: [F.FICHA_RENDA, F.FICHA_FIM], correcoes: [F.CORRECAO], seguros: [F.SEGURO], iptus: [F.IPTU], aplicacoes: [F.APLICACAO],
  depositos_garantia: [F.DEPOSITO_GARANTIA], correcoes_garantia: [F.CORRECAO_GARANTIA], devolucoes_garantia: [F.DEVOLUCAO_GARANTIA],
  renovacoes: [F.RENOVACAO], encerramentos: [F.ENCERRAMENTO], avulsas: [F.AVULSA], cobrancas: [F.COBRANCA],
});
let camposDinheiro = null;
/** ``{ tabela: Map(campo → rótulo) }`` dos campos em centavos (ver ``FORMULARIOS_DA_TABELA``). */
export function camposDeDinheiro() {
  if (!camposDinheiro) {
    camposDinheiro = {};
    for (const [t, forms] of Object.entries(FORMULARIOS_DA_TABELA())) {
      const m = new Map();
      for (const c of forms.flat()) if (c && c.nome && c.tipo === 'dinheiro' && !c.virtual && !m.has(c.nome)) m.set(c.nome, String(c.rotulo || c.nome).replace(/\s*\*$/, ''));
      camposDinheiro[t] = m;
    }
  }
  return camposDinheiro;
}

/**
 * Confere, antes de gravar, que os campos de dinheiro estão em centavos inteiros (vazio vale: null, undefined ou '').
 * Ex.: "10,5" (texto) ou 10.5 num campo de centavos → erro na tela, nada é gravado. ``atual``: o registro de antes
 * (só confere o que muda, para não travar um registro antigo por um campo que ninguém mexeu).
 */
export function conferirCentavos(tabela, dados, atual = null) {
  const campos = camposDeDinheiro()[tabela];
  if (!campos || !dados) return;
  for (const [k, rotulo] of campos) {
    if (!Object.prototype.hasOwnProperty.call(dados, k)) continue;
    const v = dados[k];
    if (v === null || v === undefined || v === '' || Number.isSafeInteger(v)) continue;
    if (atual && (atual[k] === v || String(atual[k] ?? '') === String(v))) continue; // não mudou
    const mostrar = String(v).slice(0, 30);
    throw new C.ErroUsuario(`Valor inválido em "${rotulo}" (${TABELAS[tabela]}): "${mostrar}". Use reais com centavos, ex.: 1.250,50. Nada foi gravado.`);
  }
}

export function inserir(d, tabela, dados, usuario, descricao, { historico = true } = {}) {
  conferirCentavos(tabela, dados);
  d.seq[tabela] = proximoCodigo(d, tabela);
  const r = { id: d.seq[tabela], ...dados };
  d[tabela].push(r);
  if (tabela === 'contratos') CR.lembrarContrato(r);
  if (historico) registrar(d, usuario, 'Inclusão', tabela, r.id, descricao, visivel(dados), vinculos(d, tabela, r));
  return r;
}

export function atualizar(d, tabela, id, dados, usuario, descricao) {
  const r = buscar(d, tabela, id);
  if (!r) throw new Error(`${TABELAS[tabela]} não encontrado`);
  conferirCentavos(tabela, dados, r);
  const mudancas = {};
  const texto = (x) => (x === undefined || x === null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x));
  for (const [k, novo] of Object.entries(dados)) {
    const velho = r[k];
    if (texto(velho) !== texto(novo)) mudancas[k] = { de: velho ?? null, para: novo ?? null };
  }
  if (Object.keys(mudancas).length) {
    Object.assign(r, dados);
    if (tabela === 'contratos' && 'perfil_regras_id' in mudancas) CR.lembrarContrato(r);
    const det = Object.fromEntries(Object.entries(mudancas).filter(([k]) => !OCULTOS.has(k)).map(([k, m]) => [k, tabela === 'comunicados' && k === 'destinos'
      ? destinosParaHistorico(m.de, m.para) : { de: semPeso(tabela, k, m.de), para: semPeso(tabela, k, m.para) }]));
    if (mudancas.senha_hash) det.senha = 'alterada';
    registrar(d, usuario, 'Alteração', tabela, r.id, descricao, det, vinculos(d, tabela, r));
  }
  return mudancas;
}

// --------------------------------------------------------------------------
// Desfazer alterações pelo histórico (só administrador): sempre da mais recente para a mais antiga, campo a campo.
// Boletos, pagamentos, NFs e usuários ficam de fora (têm botões próprios); a pasta não volta (a pasta no disco não muda).
// --------------------------------------------------------------------------
const SEM_DESFAZER = new Set(['taxas_poupanca', 'cobrancas', 'faturas', 'recebimentos', 'avulsas', 'usuarios', 'banco', 'listas', 'fechamentos', 'arquivos', 'movimentacoes_banco', 'pagamentos_banco', 'acordos', 'config_regras', 'versoes_regras', 'perfis_regras', 'comunicados']);
const CAMPOS_SEM_DESFAZER = new Set(['pasta']);
/** Campos de pagamento que, ligados ao banco (extrato ou pagamento pelo C6), só se desfazem pela tela Banco. */
const CAMPOS_PAGAMENTO_BANCO = { despesas: ['data_pagamento', 'movimentacao_id', 'pagamento_banco_id', 'comprovante'], guias_impostos: ['paga_em', 'movimentacao_id', 'pagamento_banco_id'], iptus: ['pagas', 'data_quitacao'] };
const textoComparar = (x) => (x === undefined || x === null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x));

/** Parcela do IPTU (n = 0: cota única) paga pelo banco: movimentação do extrato com destino nela ou pagamento pelo C6 ativo. */
export function iptuPagoPeloBanco(d, iptuId, n) {
  const id = Number(iptuId);
  const parc = Number(n);
  return (d.movimentacoes_banco || []).some((m) => m.classificacao === 'iptu' && m.iptu_id === id && Number(m.iptu_parcela) === parc)
    || (d.pagamentos_banco || []).some((p) => p.origem && p.origem.tipo === 'iptu' && Number(p.origem.id) === id && Number(p.origem.n) === parc && !['cancelado', 'erro'].includes(p.situacao));
}

/**
 * Por que o campo não pode ser desfeito pelo Histórico (texto) ou null. Conta/guia paga pelo banco e parcela do IPTU com
 * destino no extrato (ou pagamento pelo C6) só se desfazem pela tela Banco: senão a conta ficaria "em aberto" com o dinheiro já saído.
 */
export function motivoNaoDesfazer(d, tabela, r, campo, anterior = undefined) {
  // saída e cálculo final andam juntos: a data de saída só volta pelos botões da saída (que reativam o inquilino e
  // recalculam o último boleto); com o cálculo final salvo, nem a saída nem os reparos que ele usou se desfazem aqui
  if (tabela === 'contratos' && r && campo === 'data_saida') return `A data de saída de ${r.inquilino_nome} não se desfaz pelo Histórico: use "Mudar a data" ou "Desfazer a saída" na página do inquilino${encerramentoDo(d, r.id) ? ' (desfaça antes o cálculo final)' : ''}.`;
  if (tabela === 'contratos' && r && campo === 'ativo' && encerramentoDo(d, r.id)) return `A saída de ${r.inquilino_nome} já tem o cálculo final: desfaça o cálculo final e depois a saída, na página do inquilino.`;
  if (tabela === 'vistorias' && r && campo === 'reparos' && r.contrato_id && encerramentoDo(d, r.contrato_id)) return 'O cálculo final da saída já usa os valores destes reparos: desfaça antes o cálculo final, na página do inquilino.';
  if (tabela === 'notificacoes' && r && ['multa_valor', 'multa_cobranca_id', 'multa_data'].includes(campo) && r.multa_valor > 0) return multaPresa(d, r);
  const campos = CAMPOS_PAGAMENTO_BANCO[tabela];
  if (!campos || !r || !campos.includes(campo)) return null;
  if (tabela === 'iptus') {
    // só as parcelas que mudariam ao voltar (o campo ``pagas`` guarda todas as parcelas juntas)
    const atual = r.pagas || {};
    const volta = (anterior && typeof anterior === 'object') ? anterior : {};
    const parcelas = campo === 'data_quitacao' ? [0] : [...new Set([...Object.keys(atual), ...Object.keys(volta)])].filter((n) => atual[n] !== volta[n]).map(Number);
    return parcelas.some((n) => iptuPagoPeloBanco(d, r.id, n)) ? `IPTU ${r.ano}: parcela paga pelo banco. Desfaça o destino da movimentação na tela Banco.` : null;
  }
  if (r.pagamento_banco_id) return `${tabela === 'despesas' ? 'Esta conta' : 'Esta guia'} foi paga pelo banco (pagamento nº ${r.pagamento_banco_id}): o pagamento não se desfaz pelo Histórico.`;
  if (r.movimentacao_id) return `${tabela === 'despesas' ? 'Esta conta' : 'Esta guia'} está ligada ao extrato do banco: desfaça o destino da movimentação na tela Banco.`;
  return null;
}

/**
 * Campos que podem ser desfeitos agora: Set de "índice no histórico:campo". Para cada campo de cada registro só vale a
 * alteração mais recente ainda não desfeita, e só se o valor atual ainda é o que ela gravou. Desfeita a última,
 * a anterior passa a poder ser desfeita (até voltar ao valor original).
 */
export function alteracoesDesfaziveis(d, desde = 0) {
  // `desde`: só as entradas a partir deste índice (a página do Histórico): o que pode ser desfeito numa entrada só depende das
  // que vieram depois dela, então o resultado para elas é o mesmo de olhar o histórico inteiro (36 mil entradas: 119 ms)
  const desfeitos = new Set();
  const hist = d.historico;
  for (let i = Math.max(0, desde); i < hist.length; i += 1) {
    const h = hist[i];
    if (h.desfaz !== undefined && h.detalhes) for (const k of Object.keys(h.detalhes)) desfeitos.add(`${h.desfaz}:${k}`);
  }
  const topo = new Map();
  for (let i = Math.max(0, desde); i < hist.length; i += 1) {
    const h = hist[i];
    if (h.acao !== 'Alteração' || !h.tabela || h.registro_id === null || !h.detalhes || h.desfaz !== undefined) continue;
    for (const [k, m] of Object.entries(h.detalhes)) {
      if (m && typeof m === 'object' && 'de' in m && !desfeitos.has(`${i}:${k}`)) topo.set(`${h.tabela}:${h.registro_id}:${k}`, i);
    }
  }
  const out = new Set();
  for (const [chave, i] of topo) {
    const h = d.historico[i];
    const k = chave.split(':').slice(2).join(':');
    if (SEM_DESFAZER.has(h.tabela) || CAMPOS_SEM_DESFAZER.has(k) || !Array.isArray(d[h.tabela])) continue;
    const r = buscar(d, h.tabela, h.registro_id);
    if (r && textoComparar(r[k]) === textoComparar(h.detalhes[k].para) && !motivoNaoDesfazer(d, h.tabela, r, k, h.detalhes[k].de)) out.add(`${i}:${k}`);
  }
  return out;
}

/**
 * Campos de uma linha do Histórico que voltam juntos no Desfazer: todos os que ela mudou (menos a pasta). Desde 2026-11-17
 * (item 39 do mutirão 3000) o Desfazer é da gravação inteira: o seguro que passou de contrato volta com o `contrato_id` e o
 * `herdado_de` juntos, nunca um sem o outro.
 */
export const camposDaGravacao = (h) => (h && h.detalhes ? Object.entries(h.detalhes)
  .filter(([k, m]) => m && typeof m === 'object' && 'de' in m && !CAMPOS_SEM_DESFAZER.has(k)).map(([k]) => k) : []);

/** Itens ("índice:campo") da linha `i` do Histórico, se ela pode ser desfeita inteira agora (todos os campos); senão null. */
export function gravacaoDesfazivel(d, i, pode = alteracoesDesfaziveis(d, i)) {
  const campos = camposDaGravacao(d.historico[i]);
  return campos.length && campos.every((k) => pode.has(`${i}:${k}`)) ? campos.map((k) => `${i}:${k}`) : null;
}

/**
 * Desfaz as alterações escolhidas (["índice:campo", ...]): a gravação inteira volta (todos os campos daquela linha do
 * histórico, item 39), ao valor de antes dela. Campo da linha que mudou de novo depois barra o Desfazer (desfaça antes a mais
 * recente). Cada volta fica no histórico como "Desfeito pelo administrador". Devolve [{ tabela, id }] dos registros mudados.
 */
export function desfazerAlteracoes(d, itens, usuario) {
  const porIndice = new Map();
  for (const x of itens) {
    const p = String(x).indexOf(':');
    const i = Number(String(x).slice(0, p));
    porIndice.set(i, [...(porIndice.get(i) || []), String(x).slice(p + 1)]);
  }
  const mudados = [];
  // o que pode ser desfeito é calculado uma vez; só muda para o mesmo campo do mesmo registro (desfeita a última, a anterior
  // passa a poder): refeito apenas quando o item seguinte é de um campo já desfeito nesta leva
  let pode = alteracoesDesfaziveis(d);
  const desfeitosAgora = new Set();
  for (const i of [...porIndice.keys()].sort((a, b) => b - a)) {
    const h = d.historico[i];
    const chaveDe = (k) => `${h.tabela}:${h.registro_id}:${k}`;
    if (h && porIndice.get(i).some((k) => desfeitosAgora.has(chaveDe(k)))) pode = alteracoesDesfaziveis(d);
    const r = h ? buscar(d, h.tabela, h.registro_id) : null;
    for (const k of porIndice.get(i)) {
      const motivo = h && h.detalhes && h.detalhes[k] ? motivoNaoDesfazer(d, h.tabela, r, k, h.detalhes[k].de) : null;
      if (motivo) throw new C.ErroUsuario(motivo);
    }
    // a gravação inteira: os campos pedidos e os outros que a mesma linha mudou
    const campos = h ? [...new Set([...porIndice.get(i), ...camposDaGravacao(h)])].filter((k) => !CAMPOS_SEM_DESFAZER.has(k)) : [];
    for (const k of campos) {
      const motivo = h.detalhes && h.detalhes[k] ? motivoNaoDesfazer(d, h.tabela, r, k, h.detalhes[k].de) : null;
      if (motivo) throw new C.ErroUsuario(motivo);
    }
    const presos = campos.filter((k) => !pode.has(`${i}:${k}`));
    if (!campos.length || presos.length === campos.length) throw new Error('Esta alteração não pode mais ser desfeita: desfaça antes a mais recente do mesmo campo (ou o valor já mudou).');
    if (presos.length) throw new C.ErroUsuario(`Esta alteração só volta inteira, e ${presos.map((k) => `"${k}"`).join(', ')} mudou de novo depois dela: desfaça antes a alteração mais recente desse campo.`);
    const det = Object.fromEntries(campos.map((k) => [k, { de: r[k] ?? null, para: h.detalhes[k].de ?? null }]));
    for (const k of campos) { r[k] = h.detalhes[k].de ?? null; desfeitosAgora.add(chaveDe(k)); }
    // a regra especial do contrato voltou: a multa e os juros passam a segui-la já, sem recarregar (2026-11-20)
    if (h.tabela === 'contratos' && campos.includes('perfil_regras_id')) CR.lembrarContrato(r);
    registrar(d, usuario, 'Alteração', h.tabela, r.id, `Desfeito pelo administrador (alteração de ${h.usuario} em ${C.dataHoraBr(h.quando)})${h.descricao ? `: ${h.descricao}` : ''}`,
      det, vinculos(d, h.tabela, r));
    d.historico[d.historico.length - 1].desfaz = i;
    mudados.push({ tabela: h.tabela, id: r.id });
  }
  return mudados;
}

/** Campo de código que aponta para outro registro: no Desfazer aparece com o nome (ex.: "nº 2 (Ana Herdeira)"). */
const CODIGO_DE = { contrato_id: 'contratos', herdado_de: 'contratos', contrato_anterior_id: 'contratos', imovel_id: 'imoveis', fiador_id: 'fiadores', emitente_id: 'emitentes' };
const nomeCurto = (r) => (r ? r.inquilino_nome || r.nome || r.descricao || r.seguradora || null : null);

/**
 * O que o Desfazer faria, em palavras, sem mudar nada (item 39): { campos, boletos }. `aplicar(copia, itens)` desfaz numa
 * cópia do banco do mesmo jeito que a tela (com o recálculo dos boletos em aberto). Ex.: campos = ["Inquilino de Ana · Aluguel
 * inicial: R$ 2.100,00 → R$ 2.000,00"], boletos = ["Boleto 12/2026 de Ana: R$ 2.100,00 → R$ 2.000,00"]. Lança os mesmos erros
 * do Desfazer (campo preso, pago pelo banco…), antes de qualquer pergunta.
 */
export function previaDoDesfazer(d, itens, aplicar, { rotuloCampo = (k) => k, valorTexto = (k, v) => String(v) } = {}) {
  const copia = structuredClone(d);
  const antes = new Map(d.cobrancas.map((cb) => [cb.id, cb]));
  aplicar(copia, itens);
  const texto = (k, v) => {
    if (v === null || v === undefined || v === '') return '(vazio)';
    if (CODIGO_DE[k] && Number.isSafeInteger(Number(v))) { const nome = nomeCurto(buscar(copia, CODIGO_DE[k], v)); return `nº ${v}${nome ? ` (${nome})` : ''}`; }
    const t = valorTexto(k, v);
    return t.length > 80 ? `${t.slice(0, 80)}…` : t;
  };
  const campos = [];
  for (const h of copia.historico.slice(d.historico.length)) {
    if (!/^Desfeito pelo administrador/.test(h.descricao || '') || !h.detalhes) continue;
    const nome = nomeCurto(buscar(copia, h.tabela, h.registro_id));
    for (const [k, m] of Object.entries(h.detalhes)) {
      if (m && typeof m === 'object') campos.push(`${TABELAS[h.tabela] || h.tabela}${nome ? ` de ${nome}` : ''} · ${rotuloCampo(k, h.tabela)}: ${texto(k, m.de)} → ${texto(k, m.para)}`);
    }
  }
  const doContrato = (cb) => nomeCurto(buscar(copia, 'contratos', cb.contrato_id)) || nomeCurto(buscar(d, 'contratos', cb.contrato_id)) || `contrato nº ${cb.contrato_id}`;
  const boletos = [];
  const ficaram = new Set();
  for (const cb of copia.cobrancas) {
    ficaram.add(cb.id);
    const velho = antes.get(cb.id);
    if (!velho) continue;
    const [a, b] = [totais(velho).total_sem_desconto, totais(cb).total_sem_desconto];
    if (a !== b) boletos.push(`Boleto ${C.compBr(cb.competencia)} de ${doContrato(cb)}: ${C.reais(a)} → ${C.reais(b)}`);
  }
  for (const cb of d.cobrancas) if (!ficaram.has(cb.id)) boletos.push(`Boleto ${C.compBr(cb.competencia)} de ${doContrato(cb)}: excluído (nenhum dia ocupado no mês)`);
  return { campos, boletos };
}

export function excluir(d, tabela, id, usuario, descricao) {
  const i = d[tabela].findIndex((r) => r.id === Number(id));
  if (i < 0) return;
  const [r] = d[tabela].splice(i, 1);
  registrar(d, usuario, 'Exclusão', tabela, r.id, descricao, visivel(r), vinculos(d, tabela, r));
  if (tabela === 'cobrancas') soltarDoBoletoExcluido(d, r.id, usuario);
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

/**
 * Bonificação do aluguel de uma competência: a do contrato, salvo antes de um novo valor negociado que mudou o % (a correção
 * guarda o % anterior): ali vale o de antes. Ex.: 10% até 11/2026 e 5% a partir de 12/2026 → o boleto de 11/2026 fica com 10%.
 */
export function bonificacaoNaCompetencia(d, c, comp) {
  const ref = `${comp}-01`;
  const depois = correcoesDo(d, c.id).filter((x) => x.bonificacao_anterior !== undefined && x.bonificacao_anterior !== null && x.data_vigencia > ref)
    .sort((a, b) => a.data_vigencia.localeCompare(b.data_vigencia));
  return depois.length ? depois[0].bonificacao_anterior : percentualBonificacao(c);
}

/** Data-base da correção anual: a informada ou, se vazia, o início da vigência. */
export const dataBaseCorrecao = (c) => c.data_base_correcao || c.vigencia_inicio || c.data_entrada;

// --------------------------------------------------------------------------
// Garantias: caução, depósito, fiadores e aplicação do valor nas empresas
// --------------------------------------------------------------------------
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
  .sort(C.maisAntigoPrimeiro);
/**
 * Aplicação de uma garantia que já foi devolvida numa troca de garantia (feita antes da troca cuja devolução foi registrada):
 * fica no histórico, mas não conta para a garantia nova (2026-11-20). Ex.: caução antiga de R$ 2.700,00 aplicada em 05/2026,
 * troca em 01/11/2026 e devolução registrada → a caução nova de R$ 3.000,00 começa sem nada aplicado.
 */
export const aplicacaoBaixada = (d, a) => trocasGarantiaDo(d, a.contrato_id).some((t) => String(a.data || '') < t.data && devolucaoDaTrocaDeGarantia(d, t.id));
/** Aplicações que ainda contam (as da garantia devolvida na troca ficam de fora). */
export const aplicacoesEmVigor = (d, contratoId) => aplicacoesDo(d, contratoId).filter((a) => !aplicacaoBaixada(d, a));
/** Lançamentos ligados ao contrato que têm o campo ``comprovante`` (arquivo na pasta do inquilino). */
// encerramentos: comprovante da devolução (ou do pagamento) do saldo do cálculo final da saída (2026-11-13)
const TABELAS_COMPROVANTE = ['depositos_garantia', 'correcoes_garantia', 'aplicacoes', 'devolucoes_garantia', 'encerramentos'];

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
  const inicial = (qual === 'caucao' ? c.caucao_valor : c.deposito_valor) || 0;
  // registrada pelo comprovante (não em depósitos): vale o valor do contrato
  if (garantiaDepositada(c) && !c[`${qual}_por_depositos`]) return inicial + extras;
  return (soma(deps.filter((x) => !x.complementar)) || inicial) + extras;
}

/**
 * Garantia em dinheiro que de fato entrou (para a devolução e o cálculo final da saída): registrada como depositada (aqui
 * ou em quem pagou, na herdada), o valor atual; senão, só a soma dos depósitos já lançados. Combinada e nunca depositada → 0.
 * Ex.: caução de R$ 2.700,00 só com a "data prevista" → R$ 0,00; dois depósitos de R$ 1.000,00 → R$ 2.000,00.
 */
export function garantiaRecebida(d, c) {
  const qual = temCaucao(c) ? 'caucao' : temDeposito(c) ? 'deposito' : null;
  if (!qual) return 0;
  const p = pagadorDaGarantia(d, c, qual);
  if (garantiaDepositada(c) || garantiaDepositada(p) || somaDepositos(d, c, qual) > 0) return valorGarantia(d, c);
  return p.id !== c.id ? somaDepositos(d, p, qual) : 0;
}

/** Troca de garantia em vigor (os depósitos de antes dela são da garantia anterior). */
const trocaAtual = (d, c) => (trocasGarantiaDo(d, c.id)[0] || {}).id || null;
/**
 * Depósitos da caução (qual = "caucao") ou do depósito de garantia ("deposito") da garantia atual, um a um, cada um com
 * o seu comprovante: a garantia pode ser paga em parcelas de valores diferentes.
 */
export function depositosGarantiaDo(d, c, qual) {
  const doContrato = (d.depositos_garantia || []).filter((x) => x.contrato_id === c.id && x.qual === qual);
  if (!doContrato.length) return doContrato;
  const troca = trocaAtual(d, c); // uma vez só (antes era procurada a cada depósito)
  return doContrato.filter((x) => (x.troca_id || null) === troca).sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
}
export const somaDepositos = (d, c, qual) => depositosGarantiaDo(d, c, qual).reduce((s, x) => s + x.valor, 0);

/**
 * Depósitos da garantia em dinheiro, um a um, com a data em que cada valor entrou: [{ data, valor }]. A soma é o valor
 * atual da garantia (valorGarantia). É a base da correção pela poupança (poupanca.js), que rende pelo aniversário de cada um.
 * Na garantia herdada (troca de titular), os depósitos iniciais são os de quem pagou: a poupança conta desde lá.
 * Ex.: caução de R$ 3.600,00 paga em 10/01/2025 e complemento de R$ 200,00 pago em 15/01/2026 →
 * [{ data: '2025-01-10', valor: 360000 }, { data: '2026-01-15', valor: 20000 }].
 */
export function movimentosGarantia(d, c) {
  const qual = temCaucao(c) ? 'caucao' : temDeposito(c) ? 'deposito' : null;
  if (!qual) return [];
  const g = GARANTIAS_DEPOSITADAS[qual];
  const pagador = pagadorDaGarantia(d, c, qual);
  const inicial = (qual === 'caucao' ? c.caucao_valor : c.deposito_valor) || 0;
  const dataInicial = c[g.pago] || pagador[g.pago] || c[`${qual}_data`] || null;
  const soma = (l) => l.reduce((s, x) => s + x.valor, 0);
  const deps = depositosGarantiaDo(d, c, qual);
  // depósitos iniciais (parcelas): os do contrato ou, na herdada, os de quem pagou; registrada pelo comprovante, o valor do contrato
  let partes = deps.filter((x) => !x.complementar);
  if (!partes.length && pagador.id !== c.id) partes = depositosGarantiaDo(d, pagador, qual).filter((x) => !x.complementar);
  const peloComprovante = garantiaDepositada(c) && !c[`${qual}_por_depositos`];
  const out = !peloComprovante && partes.length && (pagador.id === c.id || soma(partes) === inicial)
    ? partes.map((x) => ({ data: x.data, valor: x.valor }))
    : inicial ? [{ data: dataInicial, valor: inicial }] : [];
  // complementos: depósitos para completar e correções da caução (cada correção leva a caução ao novo valor)
  const eventos = [...deps.filter((x) => x.complementar).map((x) => ({ data: x.data, ordem: 0, valor: x.valor })),
    ...(qual === 'caucao' ? correcoesCaucaoAtual(d, c) : []).map((x) => ({ data: x.data, ordem: 1, novo: x.valor_novo }))]
    .sort((a, b) => a.data.localeCompare(b.data) || a.ordem - b.ordem);
  let total = soma(out);
  for (const e of eventos) {
    const valor = e.ordem ? e.novo - total : e.valor;
    if (valor) out.push({ data: e.data, valor });
    total += valor;
  }
  // o que não fecha com o valor atual (dados antigos) entra na última data, para a soma ser sempre a da garantia
  const resto = valorGarantia(d, c) - total;
  if (resto) out.push({ data: (out[out.length - 1] || {}).data || dataInicial, valor: resto });
  return out;
}

/**
 * Quanto falta depositar: o valor combinado (caução ou depósito do contrato ou da troca) ou, na caução com o aluguel já
 * corrigido, aluguéis × aluguel atual com bonificação, se for maior. Ex.: caução combinada R$ 5.400,00; aluguel corrigido
 * pede R$ 5.670,00; depositados R$ 2.000,00 e R$ 1.500,00 → falta R$ 2.170,00.
 */
export function garantiaADepositar(d, c, qual, hoje = C.hojeIso()) {
  const inicial = (qual === 'caucao' ? c.caucao_valor : c.deposito_valor) || 0;
  const depositos = depositosGarantiaDo(d, c, qual);
  const registrada = garantiaDepositada(c);
  // depois de registrada: a caução atual (inicial + correções + depósitos para completar) contra a corrigida pelos reajustes
  const ultima = qual === 'caucao' ? correcoesCaucaoAtual(d, c).pop() : null;
  const combinado = registrada && ultima ? ultima.valor_novo : inicial;
  // a caução corrigida pelos reajustes só existe com a regra "A caução acompanha o reajuste" (do sistema ou a especial do contrato)
  const sugerida = qual === 'caucao' && CR.regra('caucao_acompanha', c) && correcoesDo(d, c.id).some((x) => x.data_vigencia <= hoje) ? caucaoSugerida(d, c, hoje) : null;
  const corrigida = sugerida > combinado ? sugerida : null;
  // antes de registrada: o primeiro depósito é o da caução do contrato (ou da troca de garantia), sem os reajustes;
  // a diferença dos reajustes vem depois, como complemento (correção da caução, boleto ou depósito para completar)
  const necessaria = registrada ? (corrigida || combinado) : inicial;
  const depositado = registrada ? valorGarantia(d, c) : depositos.filter((x) => !x.complementar).reduce((s, x) => s + x.valor, 0);
  return { combinado, corrigida, necessaria, depositos, depositado, falta: Math.max(necessaria - depositado, 0) };
}

/**
 * Depósitos da caução (ou do depósito de garantia) que já cobrem o valor inicial, sem a garantia estar registrada como depositada:
 * devolve os campos a gravar e o texto do histórico, ou null (nada a fazer). Não grava.
 */
function depositosCompletam(d, c, qual) {
  const g = GARANTIAS_DEPOSITADAS[qual];
  if (garantiaDepositada(c)) return null;
  const s = garantiaADepositar(d, c, qual);
  const ultimo = s.depositos.filter((x) => !x.complementar).pop();
  if (!ultimo || !s.necessaria || s.falta > 0) return null;
  return { dados: { [g.pago]: ultimo.data, [g.comprovante]: ultimo.comprovante || null, [`${qual}_por_depositos`]: true },
    texto: `${c.inquilino_nome}: ${g.nome} completa (${C.reais(s.depositado)} em ${s.depositos.length} depósito(s))` };
}

/** Registra a garantia como depositada quando os depósitos já cobrem o valor inicial (``depositosCompletam``). */
function completarPorDepositos(d, c, qual, usuario) {
  const x = depositosCompletam(d, c, qual);
  if (!x) return false;
  atualizar(d, 'contratos', c.id, x.dados, usuario, x.texto);
  return true;
}

/**
 * Aluguel que entra na conta da caução (regra `caucao_base`): com bonificação (padrão; sem bonificação, o cheio) ou sempre o cheio.
 * Ex.: R$ 2.000,00 com 10% → R$ 1.800,00 (padrão) ou R$ 2.000,00.
 */
export const aluguelDaCaucao = (aluguel, c) => (CR.regra('caucao_base', c) === 'cheio' ? aluguel : aluguel - C.descontoPorPercentual(aluguel, percentualBonificacao(c)));

/** Caução sugerida: número de aluguéis × aluguel atual com bonificação (ou cheio, pela regra `caucao_base`). */
export function caucaoSugerida(d, c, dataRef = C.hojeIso()) {
  if (!(c.caucao_meses > 0)) return null;
  return c.caucao_meses * aluguelDaCaucao(aluguelAtual(d, c, dataRef), c);
}

/** Boleto à parte só com o complemento da caução: sem tarifa, sem NF, sem multa e juros, não é o boleto do aluguel do mês. */
export const ehComplementoCaucao = (cb) => cb.caucao_complemento > 0;
/** Boleto do aluguel do contrato na competência (o do complemento da caução não conta). */
export const boletoDoMes = (d, contratoId, comp) => d.cobrancas.find((x) => x.contrato_id === contratoId && x.competencia === comp && !ehBoletoAvulso(x)) || null;
/** Boleto de uma parcela de acordo de dívida (rotina D8): não é o aluguel do mês. */
export const ehParcelaAcordo = (cb) => !!cb.acordo_parcela_de;
/** Boleto do saldo devedor do cálculo final da saída (2026-11-20, ``saldo_saida_de`` = id do ``encerramentos``). */
export const ehSaldoSaida = (cb) => !!cb.saldo_saida_de;
/** Boleto à parte (complemento da caução, parcela de acordo ou saldo da saída): não é o boleto do aluguel do mês. */
export const ehBoletoAvulso = (cb) => ehComplementoCaucao(cb) || ehParcelaAcordo(cb) || ehSaldoSaida(cb);
/** Boleto sem multa e juros: o complemento da caução (garantia). O do saldo da saída tem a multa e os juros do contrato (2026-11-20). */
export const semMultaJuros = (cb) => ehComplementoCaucao(cb);
/** Boleto vencido trocado por um acordo: fica guardado, mas não se cobra mais (valem as parcelas do acordo). */
export const emAcordo = (cb) => cb.situacao === 'Em acordo';
/** Boleto em acordo fica como estava no dia do acordo: não recebe pagamento, ajuste nem ressarcimento (valem as parcelas do acordo). */
const MOTIVO_EM_ACORDO = (cb, oQue) => `O boleto de ${C.compBr(cb.competencia)} está em acordo: ${oQue}. Valem os boletos das parcelas do acordo (ou desfaça o acordo antes).`;
/** Boleto descontado da garantia no cálculo final da saída: não se cobra mais (``encerramentos``, ``quitado_saida``). */
export const quitadoNaSaida = (cb) => !!(cb.quitado_saida || cb.quitado_devolucao) && !cb.data_pagamento;
/** Boleto ainda a cobrar: não pago, sem carência, fora de acordo e não descontado no cálculo final da saída. */
// (também o descontado da garantia devolvida na troca de titular, ``quitado_devolucao``)
export const aCobrar = (cb) => !cb.data_pagamento && cb.situacao !== 'Carência' && !emAcordo(cb) && !cb.quitado_saida && !cb.quitado_devolucao;

/**
 * Caução depois de um reajuste ou novo valor do aluguel (correção posterior à última caução registrada): a necessária
 * (aluguéis × aluguel corrigido com bonificação; null se o contrato não diz quantos aluguéis), a já depositada,
 * o complemento a depositar e o boleto do complemento ainda não pago. Null quando não há correção pendente.
 */
export function complementoCaucao(d, c) {
  if (!CR.regra('caucao_acompanha', c)) return null; // regra do administrador (ou a regra especial do contrato): a caução fica com o valor do início
  // decisão do dono (2026-11-20): quem já informou a saída não recebe alerta nem boleto do complemento da caução
  // (o fim do vínculo da troca de titular não é saída: a caução continua com o novo titular)
  if (c.data_saida && !fimDeVinculo(d, c)) return null;
  // troca de titular com data futura: até o dia, a caução depositada está no contrato anterior (a correção do aluguel já é do novo)
  const g = herancaAgendada(d, c) && !garantiaNova(c) ? contratoHerdado(d, c) : c;
  if (!temCaucao(g) || !g.caucao_valor || !garantiaDepositada(g)) return null;
  const proprias = g === c ? [] : correcoesCaucaoAtual(d, c);
  // caução paga por boleto vale para o reajuste do boleto (``referente``), mesmo paga depois de um reajuste mais novo
  const ultimaCaucao = [...correcoesCaucaoAtual(d, g), ...proprias].map((x) => x.referente || x.data).sort().pop() || g.caucao_data || '';
  const correcao = correcoesDo(d, c.id).filter((x) => x.data_vigencia > ultimaCaucao).pop();
  if (!correcao) return null;
  const atual = proprias.length ? proprias[proprias.length - 1].valor_novo : valorGarantia(d, g);
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
 * Boleto(s) do complemento da caução, com o vencimento do primeiro aluguel corrigido (sem tarifa e sem NF).
 * ``comp``: competência em que está sendo gerado (ao gerar os boletos de um mês depois do aluguel corrigido, vai com o desse mês).
 * ``vencimento``: outra data (mais prazo); ``parcelas``: boletos mensais
 * (ex.: R$ 270,00 em 2 × R$ 135,00, vencendo em 10/12 e 10/01). Cada parcela paga soma na caução.
 * ``plano``: parcelamento negociado, cada boleto com a sua data e o seu valor ([{ vencimento, valor }]; a soma é o complemento).
 */
export function gerarBoletosCaucao(d, contratoId, usuario, comp = null, { vencimento = null, parcelas = 1, plano = null } = {}) {
  const c = buscar(d, 'contratos', contratoId);
  const x = complementoCaucao(d, c);
  if (!x) throw new Error('Não há correção do aluguel esperando a correção da caução.');
  if (x.boleto) throw new Error('O boleto do complemento da caução já foi gerado.');
  if (x.necessaria === null) throw new Error('Informe no contrato a quantos aluguéis a caução equivale.');
  if (!(x.complemento > 0)) throw new Error('A caução depositada já cobre o valor necessário.');
  const n = plano && plano.length ? plano.length : Math.trunc(Number(parcelas) || 1);
  if (n < 1 || n > 12) throw new Error('Parcelas da caução: de 1 a 12.');
  if (x.complemento < n) throw new C.ErroUsuario(`O complemento (${C.reais(x.complemento)}) é pequeno demais para ${n} boletos: nenhum pode ficar com R$ 0,00. Use menos parcelas.`);
  const dataOk = (v) => !!C.dataValida(v);
  if (vencimento && !dataOk(vencimento)) throw new Error('Informe o vencimento do boleto da caução.');
  if (plano && plano.length) {
    if (plano.some((p) => !dataOk(p.vencimento))) throw new Error('Informe o vencimento de cada boleto da caução.');
    if (plano.some((p) => !Number.isInteger(p.valor) || p.valor <= 0)) throw new Error('Cada boleto da caução precisa de um valor maior que zero.');
    const soma = plano.reduce((t, p) => t + p.valor, 0);
    if (soma !== x.complemento) throw new Error(`As parcelas somam ${C.reais(soma)}, mas o complemento é ${C.reais(x.complemento)}.`);
  }
  comp = comp && comp > x.competencia ? comp : x.competencia;
  const mesSeguinte = c.cobranca_mes_seguinte !== false;
  // vencimento escolhido: a competência acompanha (o boleto aparece no mês certo da tela Boletos)
  const compDoVencimento = (v) => (mesSeguinte ? C.somarMeses(v.slice(0, 7), -1) : v.slice(0, 7));
  const venc0 = vencimento || C.vencimentoDaCompetencia(comp, c.dia_vencimento || 10, mesSeguinte);
  const comp0 = vencimento ? compDoVencimento(venc0) : comp;
  const boletos = plano && plano.length ? plano.map((p) => ({ valor: p.valor, vencimento: p.vencimento, mes: compDoVencimento(p.vencimento) }))
    : C.parcelas(x.complemento, n).map((valor, k) => ({ valor, vencimento: C.somarMesesData(venc0, k), mes: C.somarMeses(comp0, k) }));
  let anterior = x.atual;
  return boletos.map(({ valor, vencimento: venc, mes }, k) => {
    const parcela = n > 1 ? `${k + 1}/${n}` : '';
    const cb = inserir(d, 'cobrancas', {
      contrato_id: c.id, competencia: mes, vencimento: venc,
      dias_cobrados: C.diasNoMes(mes), dias_mes: C.diasNoMes(mes), aluguel_mensal: 0, aluguel: 0, desconto: 0,
      iptu: 0, iptu_parcela: '', seguro: 0, seguro_parcela: '', taxa_boleto: 0, outros: valor, outros_descricao: `Complemento da caução${parcela ? ` (${parcela})` : ''}`,
      reserva_utilizada: 0, carencia: false, ressarcimento: 0, ressarcimento_descricao: '', ressarcimento_na_nf: false,
      caucao_complemento: valor, caucao_anterior: anterior, caucao_nova: anterior + valor, caucao_vigencia: x.correcao.data_vigencia, caucao_parcela: parcela,
      caucao_necessaria: x.necessaria, // com parcelas, a caução depois desta parcela (caucao_nova) não é a necessária
      multa_percentual: 0, juros_mensal_percentual: 0, // garantia nunca tem multa nem juros
      situacao: 'Em aberto', data_pagamento: null, valor_pago: null, dias_atraso: null, multa: null, juros: null, valor_nf: null,
    }, usuario, `Boleto do complemento da caução${parcela ? ` (${parcela})` : ''} gerado para ${c.inquilino_nome}: ${C.reais(valor)} (caução de ${C.reais(x.atual)} para ${C.reais(x.necessaria)})`);
    anterior += valor;
    return cb;
  });
}

/** Boletos do complemento da caução gerados para uma correção do aluguel (uma ou mais parcelas). */
export const boletosCaucaoDa = (d, correcao) => d.cobrancas.filter((x) => x.contrato_id === correcao.contrato_id && ehComplementoCaucao(x) && x.caucao_vigencia === correcao.data_vigencia)
  .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id - b.id);

/** As outras parcelas do mesmo complemento da caução (mesmo contrato e reajuste) que o boleto ``cb``. */
export const parcelasIrmasDoComplemento = (d, cb) => (ehComplementoCaucao(cb) ? d.cobrancas.filter((x) => x.id !== cb.id && x.contrato_id === cb.contrato_id && ehComplementoCaucao(x) && x.caucao_vigencia === cb.caucao_vigencia) : []);

/**
 * Excluir uma parcela do complemento da caução (mutirão 19/11): o "a completar" é pelo reajuste, não pelo valor; excluir só uma
 * deixaria a caução incompleta sem aviso. Com outra parcela paga ou no banco, é barrado (texto); senão, as outras saem juntas e o
 * complemento volta a "Caução a completar" (ex.: R$ 162,00 em 2 × R$ 81,00, as duas em aberto: excluir a 1ª tira as duas).
 */
export function motivoNaoExcluirParcelaCaucao(d, cb) {
  const irmas = parcelasIrmasDoComplemento(d, cb);
  const presa = irmas.find((x) => x.data_pagamento || emitidoNoBanco(x));
  if (!presa) return null;
  return `Este boleto é uma parcela do complemento da caução e a parcela ${presa.caucao_parcela || ''} ${presa.data_pagamento ? `já foi paga (${C.dataBr(presa.data_pagamento)})` : 'está emitida no banco'}: excluir só esta deixaria a caução incompleta sem aviso. ${presa.data_pagamento ? 'Desfaça antes o pagamento da outra parcela' : 'Cancele antes a outra parcela no banco'} (aí as parcelas saem juntas e o complemento volta a "Caução a completar", na tela Reajustes).`.replace('parcela  ', 'parcela ');
}
export function excluirParcelasIrmas(d, cb, usuario) {
  let n = 0;
  for (const x of parcelasIrmasDoComplemento(d, cb)) {
    if (x.data_pagamento || emitidoNoBanco(x) || !buscar(d, 'cobrancas', x.id)) continue;
    excluir(d, 'cobrancas', x.id, usuario, `Boleto do complemento da caução${x.caucao_parcela ? ` (${x.caucao_parcela})` : ''} excluído junto com a outra parcela (o complemento volta a "Caução a completar")`);
    n += 1;
  }
  return n;
}

/** Reajuste em que a caução depositada já cobre o necessário: registra a caução como corrigida, sem boleto. */
export function confirmarCaucaoSemComplemento(d, contratoId, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const x = complementoCaucao(d, c);
  if (!x || x.necessaria === null || x.complemento > 0) throw new Error('Esta caução precisa de complemento: gere o boleto.');
  return inserir(d, 'correcoes_garantia', { contrato_id: c.id, data: dataDaCorrecaoCaucao(d, c, x.correcao.data_vigencia), referente: x.correcao.data_vigencia,
    valor_anterior: x.atual, valor_novo: x.atual, complemento: 0,
    observacoes: `A caução depositada já cobre o necessário (${C.reais(x.necessaria)})` }, usuario, `Caução de ${c.inquilino_nome} confirmada em ${C.reais(x.atual)} (já cobre o reajuste)`);
}

/**
 * Data da correção da caução: nunca antes da data pedida, da última correção nem dos depósitos para completar
 * (o novo valor já inclui esses depósitos; depois dela eles somariam de novo).
 */
function dataDaCorrecaoCaucao(d, c, data) {
  const deps = depositosGarantiaDo(d, c, 'caucao').filter((x) => x.complementar).map((x) => x.data);
  return [data, (correcoesCaucaoAtual(d, c).pop() || {}).data || '', ...deps].sort().pop();
}

/**
 * Complemento da caução pago por depósito (sem boleto), na tela Reajustes: o valor inteiro do complemento, com a data
 * e o comprovante (opcional: fica o aviso para anexar). A caução passa ao valor necessário.
 */
export function registrarComplementoDepositado(d, contratoId, { data, arquivo = null }, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const x = complementoCaucao(d, c);
  if (!x) throw new Error('Não há complemento da caução a registrar.');
  if (x.boleto) throw new Error('Já há boleto do complemento da caução em aberto: dê baixa nele (ou exclua o boleto) antes.');
  if (x.necessaria === null || !(x.complemento > 0)) throw new Error('Esta caução não tem complemento a depositar.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) throw new Error('Informe a data do depósito.');
  return inserir(d, 'correcoes_garantia', { contrato_id: c.id, data: dataDaCorrecaoCaucao(d, c, data > x.correcao.data_vigencia ? data : x.correcao.data_vigencia), referente: x.correcao.data_vigencia,
    valor_anterior: x.atual, valor_novo: x.necessaria, complemento: x.complemento, comprovante: arquivo,
    observacoes: `Complemento depositado em ${C.dataBr(data)}` }, usuario, `Caução de ${c.inquilino_nome} corrigida para ${C.reais(x.necessaria)} (complemento de ${C.reais(x.complemento)} depositado${arquivo ? '' : ', sem comprovante'})`);
}

/** Caução a completar (tela Reajustes): complemento pendente de reajuste ou de novo valor negociado, ou boleto do complemento em aberto. */
export function caucoesACompletar(d) {
  return d.contratos.filter((c) => c.ativo !== false && temCaucao(c)).map((c) => ({ contrato: c, x: complementoCaucao(d, c),
    abertos: d.cobrancas.filter((cb) => cb.contrato_id === c.id && ehComplementoCaucao(cb) && !cb.data_pagamento).sort((a, b) => a.vencimento.localeCompare(b.vencimento)) }))
    .filter((y) => y.abertos.length || y.x)
    .sort((a, b) => a.contrato.inquilino_nome.localeCompare(b.contrato.inquilino_nome, 'pt-BR'));
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
  for (const a of aplicacoesEmVigor(d, c.id)) {
    const chave = a.recebedor ? `p:${a.recebedor}` : `e:${a.emitente_id}`;
    const x = aplicado.get(chave) || { emitente: recebedorDaAplicacao(d, a), aplicado: 0 };
    x.aplicado += a.valor;
    aplicado.set(chave, x);
  }
  const linhas = [...aplicado.values()];
  const soma = linhas.reduce((s, l) => s + l.aplicado, 0);
  return { total, linhas, soma, falta: total - soma, ok: total > 0 && soma >= total };
}

/**
 * Garantia em dinheiro do contrato que já saiu da empresa: devolvida na saída (cálculo final), na troca de titular com
 * garantia nova, ou passada ao novo titular (as aplicações são lançadas lá). A troca de garantia sem caução nem depósito
 * agora (ex.: caução → fiador) com a devolução registrada também conta.
 */
function garantiaJaSaiu(d, c) {
  if (c.garantia_transferida_para) return true;
  // cálculo final com saldo zero ou a cobrar: a garantia foi toda usada nos débitos, nada ficou guardado (2026-11-20)
  if (d.encerramentos.some((e) => e.contrato_id === c.id && (e.garantia_devolvida_em || (Number.isFinite(e.saldo) && e.saldo <= 0)))) return true;
  if (devolucoesDaTrocaDeTitular(d, c.id).length) return true;
  return !temCaucao(c) && !temDeposito(c) && trocasGarantiaDo(d, c.id).some((t) => devolucaoDaTrocaDeGarantia(d, t.id));
}

/**
 * Onde está guardada a caução e o depósito de garantia de cada inquilino (aba Caução do Financeiro): por empresa (ou outra pessoa),
 * quanto tem e de quem é, com a data de cada aplicação e de cada depósito do inquilino (depósito inicial, complementos e
 * correções da caução). Só as garantias que ainda estão com a empresa (devolvidas ficam de fora). Ex.: caução de Ana
 * R$ 3.800,00 (3.600,00 em 10/01/2025 + 200,00 em 15/01/2026) aplicada toda na ANK → ANK: Ana R$ 3.800,00.
 * Devolve { lugares: [{ chave, nome, pessoa, total, itens: [{ contrato, imovel, tipo, data, valor, comprovante, movimentos }] }],
 * semAplicar: [{ contrato, imovel, tipo, total, aplicado, falta, movimentos }], total, aplicado }.
 */
export function garantiasPorEmpresa(d) {
  const lugares = new Map();
  const semAplicar = [];
  let total = 0;
  let aplicado = 0;
  for (const c of d.contratos) {
    const aplic = aplicacoesEmVigor(d, c.id);
    if (!(temCaucao(c) || temDeposito(c) || aplic.length) || garantiaJaSaiu(d, c)) continue;
    const imovel = d.imoveis.find((i) => i.id === c.imovel_id) || null;
    const tipo = temCaucao(c) ? 'Caução' : temDeposito(c) ? 'Depósito de garantia' : (c.garantia_tipo || 'Garantia');
    const movimentos = movimentosGarantia(d, c);
    const sit = situacaoAplicacao(d, c);
    total += Math.max(sit.total, sit.soma);
    aplicado += sit.soma;
    for (const a of aplic) {
      const rec = recebedorDaAplicacao(d, a);
      const chave = a.recebedor ? `p:${a.recebedor}` : `e:${a.emitente_id}`;
      const l = lugares.get(chave) || { chave, nome: rec.nome, pessoa: !!rec.pessoa, total: 0, itens: [] };
      l.total += a.valor;
      l.itens.push({ contrato: c, imovel, tipo, data: a.data, valor: a.valor, comprovante: a.comprovante || null, observacoes: a.observacoes || '', movimentos });
      lugares.set(chave, l);
    }
    if (sit.falta > 0) semAplicar.push({ contrato: c, imovel, tipo, total: sit.total, aplicado: sit.soma, falta: sit.falta, movimentos });
  }
  const porNome = (a, b) => a.localeCompare(b, 'pt-BR');
  const lista = [...lugares.values()].sort((a, b) => a.pessoa - b.pessoa || porNome(a.nome, b.nome));
  for (const l of lista) l.itens.sort((a, b) => porNome(a.contrato.inquilino_nome, b.contrato.inquilino_nome) || String(a.data).localeCompare(String(b.data)));
  semAplicar.sort((a, b) => porNome(a.contrato.inquilino_nome, b.contrato.inquilino_nome));
  return { lugares: lista, semAplicar, total, aplicado };
}

/**
 * Aluguel em que a reserva começa: o mês marcado ("Usar a reserva no aluguel de"); em branco, o primeiro aluguel, que é o
 * mês de entrada. Mês (marcado ou de entrada) dentro da carência não tem aluguel: vale o 1º mês depois dela, senão a reserva
 * ficaria parada sem aviso. Ex.: entrada 07/06/2026 com 1 mês de carência → 07/2026 (em branco ou marcado 06/2026).
 */
export function competenciaReserva(contrato) {
  if (!(contrato.reserva_valor > 0)) return null;
  let comp = contrato.reserva_competencia || C.competenciaDe(contrato.data_entrada);
  const carencia = periodoCarencia(contrato);
  if (carencia && comp >= carencia[0] && comp <= carencia[1]) comp = C.somarMeses(carencia[1], 1);
  return comp;
}

/** ``ignorar``: id de um boleto, ou função (boleto) => true para os boletos que não contam (os que estão sendo recalculados). */
const ignorados = (ignorar) => (typeof ignorar === 'function' ? ignorar : (cb) => cb.id === ignorar);

/** Saldo da reserva: o valor menos o já usado nos boletos e o marcado como abatido fora do sistema (contratos antigos). */
export function saldoReserva(d, contrato, ignorarCobranca = null) {
  const fora = ignorados(ignorarCobranca);
  const usado = d.cobrancas.filter((cb) => cb.contrato_id === contrato.id && !fora(cb))
    .reduce((s, cb) => s + (cb.reserva_utilizada || 0), 0);
  return Math.max((contrato.reserva_valor || 0) - usado - (contrato.reserva_abatida_valor || 0) - (contrato.reserva_usada_anterior || 0), 0);
}

/** Reserva já usada em boletos pagos (não muda com o recálculo). */
const reservaUsadaPaga = (d, c) => d.cobrancas.filter((cb) => cb.contrato_id === c.id && cb.data_pagamento).reduce((s, cb) => s + (cb.reserva_utilizada || 0), 0);
/** Quanto ainda pode ser marcado como abatido fora do sistema: a reserva menos o já usado em boletos pagos. */
export const reservaParaMarcarAbatida = (d, c) => Math.max((c.reserva_valor || 0) - reservaUsadaPaga(d, c) - (c.reserva_usada_anterior || 0), 0);

/**
 * Contrato antigo: a reserva já foi abatida em aluguéis de antes do sistema. Marca o mês (AAAA-MM) e o valor;
 * a reserva sai dos boletos em aberto e não é mais usada. Ex.: reserva de R$ 500,00 abatida em 03/2024.
 */
export function marcarReservaAbatida(d, contratoId, { competencia, valor }, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  if (!(c.reserva_valor > 0)) throw new Error('Este contrato não tem reserva.');
  if (!C.competenciaValida(competencia, '')) throw new Error('Informe o mês em que a reserva foi abatida.');
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
 * do mês marcado em diante. Boleto já pago fica como está. É o único lugar que decide a reserva de cada boleto
 * (o boleto gerado ou recalculado vem sem ela): no boleto da carência nada; nos outros, até o total do boleto em dia
 * (com FCI e ressarcimento). Contrato sem reserva: tira a que tiver ficado nos boletos em aberto. Devolve quantos mudaram.
 */
export function realocarReserva(d, contrato, usuario) {
  return realocar(d, contrato, usuario).length;
}

/** O mesmo que ``realocarReserva``, devolvendo os ids dos boletos que mudaram. */
function realocar(d, contrato, usuario) {
  const abertos = d.cobrancas.filter((cb) => cb.contrato_id === contrato.id && !cb.data_pagamento && !emAcordo(cb) && !ehBoletoAvulso(cb))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));
  const livres = new Set(abertos.map((cb) => cb.id));
  const mudaram = [];
  for (const cb of abertos) {
    const disponivel = reservaParaCompetencia(d, contrato, cb.competencia, (x) => livres.has(x.id));
    const usar = cb.carencia ? 0 : C.totaisCobranca(cb, disponivel).reserva_utilizada;
    livres.delete(cb.id);
    if ((cb.reserva_utilizada || 0) !== usar) {
      atualizar(d, 'cobrancas', cb.id, { reserva_utilizada: usar }, usuario, `Boleto ${C.compBr(cb.competencia)}: reserva ${usar ? `de ${C.reais(usar)} aplicada` : 'retirada'}`);
      mudaram.push(cb.id);
    }
  }
  return mudaram;
}

/** Reserva que não foi usada no mês marcado (boleto já pago sem ela, ou mês fora do sistema): pede para escolher outro mês. */
export function alertaReservaParada(d, contrato) {
  const alvo = competenciaReserva(contrato);
  if (!alvo) return null;
  const saldo = saldoReserva(d, contrato);
  if (contrato.reserva_abatida_valor > 0 && !(saldo > 0)) return null; // já abatida fora do sistema
  const doContrato = d.cobrancas.filter((cb) => cb.contrato_id === contrato.id && !ehBoletoAvulso(cb));
  const presa = doContrato.find((cb) => cb.reserva_utilizada > 0 && cb.data_pagamento && cb.competencia > alvo);
  const alvoAberto = doContrato.find((cb) => cb.competencia === alvo && !cb.data_pagamento);
  if (presa && alvoAberto) {
    return { nivel: 'aviso', tipo: 'Reserva do imóvel', ancora: 'reserva',
      texto: `A reserva de ${C.reais(presa.reserva_utilizada)} está no boleto de ${C.compBr(presa.competencia)}, que já foi pago, mas deveria abater o de ${C.compBr(alvo)}. Para mudar: desfaça o pagamento de ${C.compBr(presa.competencia)} e salve o contrato em "Editar" (a reserva vai para o mês certo); ou deixe como está escolhendo ${C.compBr(presa.competencia)} em "Usar a reserva no aluguel de".` };
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

/** Apólices do inquilino: cada contrato tem a sua (a do anterior não passa para o próximo). */
export const segurosDoContrato = (d, contratoId) => d.seguros.filter((s) => contratoId && s.contrato_id === contratoId);

/** Apólice vigente do inquilino: a que cobre hoje; sem nenhuma, a de início mais recente (ou null). */
export function seguroVigente(d, contratoId, hoje = C.hojeIso()) {
  const lista = segurosDoContrato(d, contratoId).sort((a, b) => String(b.vigencia_inicio).localeCompare(String(a.vigencia_inicio)));
  return lista.find((s) => s.vigencia_inicio <= hoje && s.vigencia_fim >= hoje) || lista[0] || null;
}

/**
 * De qual apólice é um arquivo da pasta do seguro: { seguro, tipo: 'apolice' | 'outro', vigente } (ou null, arquivo solto).
 * O arquivo da apólice vigente só sai pelo × da própria apólice; o das anteriores e os outros arquivos, na lista de documentos.
 */
export function donoArquivoSeguro(d, contratoId, nome, hoje = C.hojeIso()) {
  const vig = seguroVigente(d, contratoId, hoje);
  for (const s of segurosDoContrato(d, contratoId)) {
    if (s.arquivo_apolice === nome) return { seguro: s, tipo: 'apolice', vigente: !!vig && vig.id === s.id };
    if ((s.outros_arquivos || []).includes(nome)) return { seguro: s, tipo: 'outro', vigente: !!vig && vig.id === s.id };
  }
  return null;
}

/** Tira o arquivo da apólice (fica o alerta para anexar de novo) ou um dos outros arquivos dela. */
export function tirarArquivoSeguro(d, seguroId, nome, usuario) {
  const s = buscar(d, 'seguros', seguroId);
  const vig = `vigência ${C.dataBr(s.vigencia_inicio)} a ${C.dataBr(s.vigencia_fim)}`;
  if (s.arquivo_apolice === nome) atualizar(d, 'seguros', s.id, { arquivo_apolice: null }, usuario, `Seguro (${vig}): arquivo da apólice apagado (${nome})`);
  else atualizar(d, 'seguros', s.id, { outros_arquivos: (s.outros_arquivos || []).filter((x) => x !== nome) }, usuario, `Seguro (${vig}): arquivo apagado (${nome})`);
}

/** Liga um arquivo anexado pela lista de documentos a uma apólice: como a apólice ou como outro documento dela. */
export function ligarArquivoSeguro(d, seguroId, nome, tipo, usuario) {
  const s = buscar(d, 'seguros', seguroId);
  const vig = `vigência ${C.dataBr(s.vigencia_inicio)} a ${C.dataBr(s.vigencia_fim)}`;
  if (tipo === 'apolice') {
    if (s.arquivo_apolice) throw new Error(`A apólice da ${vig} já tem arquivo: apague o atual (×) antes de anexar outro.`);
    atualizar(d, 'seguros', s.id, { arquivo_apolice: nome }, usuario, `Seguro (${vig}): arquivo da apólice anexado (${nome})`);
  } else atualizar(d, 'seguros', s.id, { outros_arquivos: [...(s.outros_arquivos || []), nome] }, usuario, `Seguro (${vig}): documento anexado (${nome})`);
}

// --------------------------------------------------------------------------
// FCI: fundo de conservação do imóvel
// --------------------------------------------------------------------------
/** O FCI só vale com o % preenchido no contrato (em branco: não cobra e não aparece). */
export const temFci = (c) => !!c && c.fci_percentual > 0;

/** FCI do mês: % sobre o aluguel bonificado do boleto (proporcional aos dias; zero na carência). Ex.: 5% de R$ 1.800,00 = R$ 90,00. */
export const fciDoMes = (c, aluguel, desconto) => (temFci(c) ? C.arred(((aluguel - desconto) * c.fci_percentual) / 100) : 0);

/**
 * Pagamentos do FCI: boletos pagos com FCI deste contrato e dos anteriores da troca de titular (o fundo continua com a locação),
 * mais os depósitos de antes do sistema lançados à mão na caixa do FCI (contrato.fci_previos: [{ data, valor }]).
 */
export function depositosFci(d, c) {
  const contratos = [c, ...cadeiaDeContratos(d, c).antes];
  const ids = new Set(contratos.map((x) => x.id));
  const previos = contratos.flatMap((x) => (x.fci_previos || []).map((p) => ({ cobranca_id: null, competencia: '', data: p.data, valor: p.valor, previo: true })));
  return d.cobrancas.filter((cb) => ids.has(cb.contrato_id) && cb.data_pagamento && cb.fci > 0)
    .map((cb) => ({ cobranca_id: cb.id, competencia: cb.competencia, data: cb.data_pagamento, valor: cb.fci }))
    .concat(previos.filter((p) => p.data && p.valor > 0))
    .sort((a, b) => a.data.localeCompare(b.data) || a.competencia.localeCompare(b.competencia));
}

/** Confere os depósitos anteriores digitados ([{ data, valor }], valor em centavos): linhas em branco saem; data e valor > 0 obrigatórios. */
export function validarFciPrevios(linhas) {
  const ok = [];
  for (const [i, x] of linhas.entries()) {
    if (!x.data && !x.valor) continue;
    if (!C.dataValida(x.data) || !(x.valor > 0)) throw new Error(`Linha ${i + 1}: preencha uma data que existe e um valor maior que zero.`);
    ok.push({ data: x.data, valor: x.valor });
  }
  return ok.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Saldo do FCI: soma do que foi pago e o valor corrigido mês a mês pelos índices guardados no contrato ({ 'AAAA-MM': % }).
 * Cada pagamento recebe os índices a partir do mês seguinte ao do pagamento, até o último mês seguido com índice.
 * O corrigido nunca fica abaixo do total pago (meses negativos, como no IGP-M, contam, mas não tiram do que foi pago).
 * Ex.: R$ 90,00 pagos em 05/10/2026, poupança de nov 0,67% e dez 0,68% → 90 × 1,0067 × 1,0068 = R$ 91,22.
 */
export function saldoFci(d, c, indices = c.fci_indices || {}) {
  let ate = null;
  const depositos = depositosFci(d, c).map((x) => {
    let fator = 1;
    let mes = C.somarMeses(x.data.slice(0, 7), 1);
    while (Number.isFinite(indices[mes])) {
      fator *= 1 + indices[mes] / 100;
      if (!ate || mes > ate) ate = mes;
      mes = C.somarMeses(mes, 1);
    }
    return { ...x, corrigido: C.arred(x.valor * fator) };
  });
  const total = depositos.reduce((s, x) => s + x.valor, 0);
  const corrigido = Math.max(depositos.reduce((s, x) => s + x.corrigido, 0), total);
  return { depositos, total, corrigido, ate, calculado_em: c.fci_calculado_em || null };
}

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

/** Valores das parcelas do IPTU parcelado (o que é repassado ao inquilino; com "valor fixo por parcela", o valor arredondado). */
const valoresIptu = (p) => (p.valor_parcela > 0 ? Array(p.num_parcelas).fill(p.valor_parcela) : dividirIptu(p, p.num_parcelas));
/**
 * Divisão do IPTU em parcelas: a nova (última menor, decisão de 2026-11-15) só do IPTU de 2027 em diante; o de 2026 e anteriores
 * já estava em andamento e continua com a antiga (diferença na 1ª), para os boletos em aberto não mudarem. O corte é o ano do
 * IPTU (fixo, não depende do contrato nem de data que mude).
 */
const IPTU_DIVISAO_NOVA_DESDE = 2027;
const dividirIptu = (p, n) => (Number(p.ano) >= IPTU_DIVISAO_NOVA_DESDE ? C.parcelas : C.parcelasAntigas)(p.valor_total, n);
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
    return [mes, dividirIptu(p, 12)[mes - 1]];
  }
  // o número da parcela sai direto da distância em meses até a competência da 1ª (uma parcela por mês)
  const primeira = competenciaDaParcela(p, 1, c);
  if (!primeira) return [null, 0];
  const n = C.mesesEntre(primeira, comp) + 1;
  if (!(n >= 1)) return [null, 0];
  const valores = valoresIptu(p);
  return n <= valores.length ? [n, valores[n - 1]] : [null, 0];
}

/**
 * O que é preciso para saber a parte dos inquilinos num IPTU, montado uma vez por cálculo: os contratos do imóvel (também
 * de quem já saiu), os boletos do aluguel deles por contrato e competência e os IPTUs do imóvel.
 */
/**
 * ``baseIptuDoImovel`` montada uma vez por imóvel dentro de um mesmo cálculo (calendário, resultados, guias a pagar, tela
 * IPTU's): ``basesIptu(d)`` devolve a função imóvel → base. Os boletos do aluguel são separados por contrato uma vez só
 * (antes, cada imóvel percorria todos os boletos: 150 imóveis × 8.850 boletos). Só para um cálculo: o banco não pode mudar no meio.
 */
export function basesIptu(d) {
  const bases = new Map();
  let porContrato = null;
  return (imovelId) => {
    if (!bases.has(imovelId)) {
      porContrato = porContrato || boletosDoAluguelPorContrato(d);
      bases.set(imovelId, baseIptuDoImovel(d, imovelId, porContrato));
    }
    return bases.get(imovelId);
  };
}

/** Boletos do aluguel (sem os avulsos) de cada contrato, na ordem da tabela: contrato_id → [boletos]. */
function boletosDoAluguelPorContrato(d) {
  const m = new Map();
  for (const cb of d.cobrancas) {
    if (ehBoletoAvulso(cb)) continue;
    const l = m.get(cb.contrato_id);
    if (l) l.push(cb); else m.set(cb.contrato_id, [cb]);
  }
  return m;
}

function baseIptuDoImovel(d, imovelId, porContrato = null) {
  const contratos = d.contratos.filter((c) => c.imovel_id === imovelId);
  const boletos = new Map();
  const guardar = (cb) => {
    const k = `${cb.contrato_id}|${cb.competencia}`;
    if (!boletos.has(k)) boletos.set(k, cb); // o mesmo que boletoDoMes: o primeiro
  };
  if (porContrato) {
    for (const id of new Set(contratos.map((c) => c.id))) for (const cb of porContrato.get(id) || []) guardar(cb);
  } else {
    const ids = new Set(contratos.map((c) => c.id));
    for (const cb of d.cobrancas) if (ids.has(cb.contrato_id) && !ehBoletoAvulso(cb)) guardar(cb);
  }
  return { contratos, boletos, iptus: d.iptus.filter((x) => x.imovel_id === imovelId) };
}

/**
 * Quanto do IPTU ``p`` o boleto cobrou: o IPTU gravado nele (também o alterado à mão), dividido entre os IPTUs do imóvel
 * que caem na competência, na proporção do que cada um cobraria (os centavos ficam no último). Um IPTU só: tudo dele.
 */
function iptuNoBoleto(cb, c, p, iptusDoImovel) {
  const total = cb.iptu || 0;
  if (!(total > 0)) return 0;
  const itens = iptusDoImovel.map((x) => [x, iptuNaCompetencia(x, cb.competencia, c)[1]]).filter(([, v]) => v > 0);
  const k = itens.findIndex(([x]) => x.id === p.id);
  if (k < 0) return 0;
  if (itens.length === 1) return total;
  const soma = itens.reduce((s, [, v]) => s + v, 0);
  const partes = itens.map(([, v]) => C.arred((total * v) / soma));
  partes[partes.length - 1] = total - partes.slice(0, -1).reduce((s, v) => s + v, 0);
  return partes[k];
}

/**
 * O que o inquilino do contrato ``c`` paga do IPTU ``p`` na competência ``comp`` (parcela de valor ``v``): a fonte é o que o
 * boleto do mês cobrou, também de quem já saiu e ficou inativo; sem boleto ainda, o que ele vai cobrar (só inquilino ativo):
 * proporcional aos dias ocupados (decisão de 2026-10-15), nada na carência sem IPTU. { contrato, comp, dias, diasMes, valor } ou null.
 */
function iptuDoInquilino(c, p, comp, v, base) {
  const cb = base.boletos.get(`${c.id}|${comp}`);
  if (cb) {
    const valor = iptuNoBoleto(cb, c, p, base.iptus);
    // o IPTU é sempre pelos dias reais (mesmo com o aluguel pelo mês comercial de 30 dias)
    return valor > 0 ? { contrato: c, comp, dias: C.diasOcupados(comp, c.data_entrada, c.data_saida), diasMes: C.diasNoMes(comp), valor } : null;
  }
  if (c.ativo === false || !c.cobrar_iptu) return null;
  // o mês já tem boleto do aluguel em outro contrato do imóvel com IPTU (ex.: troca de titular com boletos no anterior):
  // a parcela já está nele, não se prevê de novo (a soma dos inquilinos passava do IPTU)
  if (base.contratos.some((o) => o.id !== c.id && (base.boletos.get(`${o.id}|${comp}`) || {}).iptu > 0)) return null;
  const dias = C.diasOcupados(comp, c.data_entrada, c.data_saida);
  if (!dias || (emCarencia(c, comp) && !c.carencia_cobrar_iptu)) return null;
  return { contrato: c, comp, dias, diasMes: C.diasNoMes(comp), valor: C.aluguelProporcional(v, dias, C.diasNoMes(comp)) };
}

/**
 * Quanto da parcela n cada inquilino paga no boleto (``iptuDoInquilino``): o gravado no boleto do mês ou, ainda sem boleto,
 * proporcional aos dias ocupados (mês de entrada ou saída parcial; carência sem IPTU = nada). O resto é do proprietário.
 */
function inquilinosDaParcela(d, p, n, valor, base = baseIptuDoImovel(d, p.imovel_id)) {
  const lista = [];
  for (const c of base.contratos) {
    const comp = competenciaDaParcela(p, n, c);
    const x = comp && iptuDoInquilino(c, p, comp, valor, base);
    if (x) lista.push(x);
  }
  return lista;
}

/**
 * Parcelas do IPTU na prefeitura (o proprietário paga todas as guias). Em cada uma: a parte dos inquilinos (no boleto,
 * proporcional aos dias) e a parte do proprietário (dias vazios, IPTU não cobrado, carência). paga = guia paga.
 * Quitado à vista: uma linha só (cota única, com o valor pago à vista).
 * ``valor`` é a guia real da prefeitura (o total dividido); ``valorCobrado`` é o que vai ao boleto (com "valor fixo por parcela",
 * o arredondado). Decisão do dono (2026-11-20, mutirão 19/11 mensal-033): a sobra do arredondamento abate o custo do proprietário.
 * Ex.: guia de R$ 2.125,37 em 10 × R$ 213,00 (R$ 2.130,00): cada parcela da prefeitura sai pelo valor dividido e a sobra
 * de R$ 4,63 no ano fica como parte do proprietário negativa (``valorProprietario`` < 0). ``pagoInquilinoEm``: quando o
 * inquilino pagou a parcela inteira (último boleto pago), para os Resultados contarem a sobra sem a guia marcada como paga.
 */
export function parcelasIptu(d, p, base = null) {
  if (p.pago_avista) {
    const valor = p.valor_avista || p.valor_total;
    return [{ n: 0, rotulo: 'Cota única', comp: null, valor, inquilinos: [], valorInquilino: 0, valorProprietario: valor,
      vencimento: p.vencimento_primeira || null, proprietario: true, paga: p.data_quitacao || null }];
  }
  base = base || baseIptuDoImovel(d, p.imovel_id);
  const guias = dividirIptu(p, p.num_parcelas);
  return valoresIptu(p).map((cobrado, i) => {
    const valor = guias[i] ?? cobrado;
    const inquilinos = inquilinosDaParcela(d, p, i + 1, cobrado, base);
    const valorInquilino = Math.min(cobrado, inquilinos.reduce((s, x) => s + x.valor, 0));
    const pagos = inquilinos.map((x) => (base.boletos.get(`${x.contrato.id}|${x.comp}`) || {}).data_pagamento || null);
    return { n: i + 1, rotulo: `${i + 1}ª`, comp: inquilinos.length ? inquilinos[0].comp : null, mesBoleto: mesBoletoDaParcela(p, i + 1), valor, valorCobrado: cobrado,
      inquilinos, inquilino: inquilinos.length ? inquilinos[0].contrato : null, valorInquilino, valorProprietario: valor - valorInquilino,
      pagoInquilinoEm: pagos.length && pagos.every(Boolean) ? pagos.sort().pop() : null,
      vencimento: vencimentoParcela(p, i + 1), proprietario: valorInquilino < cobrado, paga: (p.pagas || {})[i + 1] || null };
  });
}

/**
 * IPTU quitado à vista pelo proprietário: o que os inquilinos pagam nos boletos, mês a mês (o gravado nos boletos, também
 * de quem já saiu; sem boleto ainda, o cálculo do boleto conforme "Inquilino que entrar": parcelas normais ou 1/12 nos meses
 * ocupados). Um item por mês de vencimento do boleto:
 * { mesBoleto, comp, n, rotulo, valor (soma dos inquilinos), inquilinos: [{ contrato, comp, dias, diasMes, valor }] }.
 * Vazio quando não é à vista ou "Não cobrar do inquilino".
 */
export function mesesIptuAvista(d, p, base = null) {
  if (!p.pago_avista) return [];
  const porMes = new Map();
  const umDoze = p.cobranca_inquilino === COBRANCA_IPTU_QUITADO[1];
  base = base || baseIptuDoImovel(d, p.imovel_id);
  for (const c of base.contratos) {
    for (let k = 0, comp = `${p.ano - 1}-01`; k < 36; k += 1, comp = C.somarMeses(comp, 1)) {
      const [n, v] = iptuNaCompetencia(p, comp, c);
      const x = n && iptuDoInquilino(c, p, comp, v, base);
      if (!x) continue;
      const mesBoleto = c.cobranca_mes_seguinte === false ? comp : C.somarMeses(comp, 1);
      const item = porMes.get(mesBoleto) || { mesBoleto, comp, n, rotulo: umDoze ? '1/12 (você pagou à vista)' : `${n}ª parcela (você pagou à vista)`, valor: 0, inquilinos: [] };
      item.valor += x.valor;
      item.inquilinos.push({ contrato: c, comp, dias: x.dias, diasMes: x.diasMes, valor: x.valor });
      porMes.set(mesBoleto, item);
    }
  }
  return [...porMes.values()].sort((a, b) => a.mesBoleto.localeCompare(b.mesBoleto));
}

/**
 * Mapa do IPTU quitado à vista (tela IPTU's): um item por mês do esquema de cobrança (as parcelas normais, ou os 12 meses
 * no 1/12 e quando não há esquema), com a parte do inquilino (o que ele paga no boleto) e a do proprietário (o que ele
 * arcou porque o imóvel estava vazio). Ex.: 10 × R$ 100 a partir do boleto de 03/2026, inquilino até 31/05: boletos de
 * 03 a 06 verdes (R$ 100 do inquilino), 07 a 12/2026 = R$ 100 do proprietário cada. Item: { mesBoleto, rotulo, valor,
 * valorInquilino, valorProprietario }.
 */
export function mapaIptuAvista(d, p, base = null) {
  if (!p.pago_avista) return [];
  const n = Number(p.num_parcelas) || 0;
  const primeiro = p.primeiro_vencimento_boleto || (p.primeira_competencia && C.somarMeses(p.primeira_competencia, 1));
  const esquema = p.cobranca_inquilino !== COBRANCA_IPTU_QUITADO[1] && n && primeiro
    ? valoresIptu(p).map((valor, k) => ({ mesBoleto: C.somarMeses(primeiro, k), rotulo: `${k + 1}ª parcela`, valor }))
    : dividirIptu(p, 12).map((valor, k) => ({ mesBoleto: C.somarMeses(`${p.ano}-01`, k + 1), rotulo: `1/12 (${String(k + 1).padStart(2, '0')}/${p.ano})`, valor }));
  const porMes = new Map(esquema.map((x) => [x.mesBoleto, { ...x, valorInquilino: 0 }]));
  for (const m of mesesIptuAvista(d, p, base)) {
    const it = porMes.get(m.mesBoleto) || { mesBoleto: m.mesBoleto, rotulo: m.rotulo.replace(' (você pagou à vista)', ''), valor: m.valor, valorInquilino: 0 };
    it.valorInquilino += m.valor;
    porMes.set(m.mesBoleto, it);
  }
  return [...porMes.values()].map((x) => ({ ...x, valorProprietario: Math.max(0, x.valor - x.valorInquilino) }))
    .sort((a, b) => a.mesBoleto.localeCompare(b.mesBoleto));
}

/**
 * Totais do IPTU no ano: quanto os inquilinos pagam nos boletos e quanto fica com o proprietário (e quanto dessa parte
 * ainda está em guia não paga). À vista: o inquilino paga conforme "Inquilino que entrar" (1/12 ou parcelas) nos meses ocupados.
 */
export function totaisIptu(d, p, base = null) {
  const ps = parcelasIptu(d, p, base);
  const inquilino = ps.reduce((s, x) => s + x.valorInquilino, 0) + mesesIptuAvista(d, p, base).reduce((s, x) => s + x.valor, 0);
  const custo = ps.reduce((s, x) => s + x.valor, 0);
  return { custo, inquilino, proprietario: custo - inquilino,
    emAberto: ps.filter((x) => x.proprietario && !x.paga).reduce((s, x) => s + x.valorProprietario, 0) };
}

/** Alertas de IPTU que o proprietário precisa pagar (imóvel vazio ou IPTU não cobrado do inquilino). */
/**
 * Guias de IPTU que o proprietário paga e ainda não pagou, vencidas ou vencendo em até ``dias`` dias (IPTU deste ano
 * e do anterior), por ordem de vencimento: { iptu, parcela, imovel, venc, estimado, faltam }.
 */
export function guiasIptuAPagar(d, hoje = C.hojeIso(), dias = 60) {
  const lista = [];
  const ano = Number(hoje.slice(0, 4));
  const baseDe = basesIptu(d);
  for (const p of d.iptus.filter((x) => x.ano >= ano - 1)) {
    const i = d.imoveis.find((x) => x.id === p.imovel_id);
    if (!i) continue;
    for (const pc of parcelasIptu(d, p, baseDe(p.imovel_id))) {
      if (!pc.proprietario || pc.paga) continue;
      const venc = pc.vencimento || `${mesBoletoDaParcela(p, Math.max(pc.n, 1)) || (p.primeira_competencia ? C.somarMeses(p.primeira_competencia, Math.max(pc.n, 1)) : `${p.ano}-02`)}-10`;
      const faltam = C.diasEntre(hoje, venc);
      if (faltam <= dias) lista.push({ iptu: p, parcela: pc, imovel: i, venc, estimado: !pc.vencimento, faltam });
    }
  }
  return lista.sort((a, b) => a.venc.localeCompare(b.venc) || a.imovel.nome.localeCompare(b.imovel.nome, 'pt-BR'));
}

export function alertasIptu(d, hoje = C.hojeIso()) {
  const lista = [];
  for (const { iptu: p, parcela: pc, imovel: i, venc, faltam } of guiasIptuAPagar(d, hoje, CR.regra('antecedencia_iptu'))) {
    lista.push({ nivel: faltam < 0 ? 'perigo' : 'aviso', tipo: 'IPTU do proprietário', imovel_id: i.id, imovel: i.nome, inquilino: '', ancora: 'iptu',
      texto: `IPTU ${p.ano} ${pc.rotulo} ${pc.n ? 'parcela' : ''} de ${C.reais(pc.valor)} ${faltam < 0 ? `venceu em ${C.dataBr(venc)}` : `vence em ${C.dataBr(venc)}`}${pc.vencimento ? '' : ' (vencimento estimado)'}. ${pc.n === 0 ? 'Pago à vista pelo proprietário.' : pc.valorInquilino ? `Sua parte: ${C.reais(pc.valorProprietario)} (o inquilino paga ${C.reais(pc.valorInquilino)} no boleto, pelos dias em que ocupou).` : 'Imóvel vazio ou sem cobrança de IPTU: a parcela é toda sua.'}`.replace('  ', ' ') });
  }
  return lista;
}

/**
 * Marca (ou desmarca, com data vazia) a parcela do IPTU paga pelo proprietário. n = 0: cota única.
 * Parcela paga pelo banco não se desmarca aqui (só a tela Banco, ao desfazer o destino: ``peloBanco``).
 */
export function marcarIptuPago(d, iptuId, n, data, usuario, { peloBanco = false } = {}) {
  const p = buscar(d, 'iptus', iptuId);
  if (!p) throw new C.ErroUsuario('IPTU não encontrado.');
  if (!data && !peloBanco && iptuPagoPeloBanco(d, p.id, n)) {
    throw new C.ErroUsuario(`IPTU ${p.ano} ${Number(n) === 0 ? 'cota única' : `${n}ª parcela`}: paga pelo banco. Para desfazer, desfaça o destino da movimentação na tela Banco.`);
  }
  if (Number(n) === 0) {
    atualizar(d, 'iptus', p.id, { data_quitacao: data || null }, usuario, data ? `IPTU ${p.ano} quitado em ${C.dataBr(data)}` : `IPTU ${p.ano}: quitação desfeita`);
    return;
  }
  const pagas = { ...(p.pagas || {}) };
  if (data) pagas[n] = data; else delete pagas[n];
  atualizar(d, 'iptus', p.id, { pagas }, usuario, data ? `IPTU ${p.ano} ${n}ª parcela paga pelo proprietário em ${C.dataBr(data)}` : `IPTU ${p.ano} ${n}ª parcela: pagamento desfeito`);
}

/**
 * Calcula (sem gravar) a cobrança de um contrato numa competência, sem a reserva: quem decide a reserva de cada boleto
 * é ``realocarReserva``, chamada depois de gerar ou recalcular.
 */
/** Continuação (troca de titular) que entra no dia 31: o anterior pagou 30/30 e este contrato não tem dia a pagar no mês. */
export function semDiaAPagar(c, comp) {
  if (!c.contrato_anterior_id || CR.regra('proporcional', c) !== 'mes_30' || C.diasOcupados(comp, c.data_entrada, c.data_saida) >= C.diasNoMes(comp)) return false;
  return C.diasComerciais(comp, c.data_entrada, c.data_saida, { continuacao: true }) === 0;
}

/**
 * Seguro proporcional aos dias no mês da entrada e no da saída (decisão do dono de 24/11/2026), pela mesma conta do aluguel
 * (regra `proporcional`). Ex.: parcela de R$ 30,00 e saída em 15/11 → R$ 15,00 no boleto de 11/2026; as parcelas seguintes não
 * são cobradas de ninguém (ficam com a empresa). Na troca de titular a apólice passa ao novo (``herdarSeguros``) e a parcela do
 * mês fica inteira com quem tem a apólice, como antes: a entrada do novo e a saída do anterior não são proporcionais.
 */
function seguroProporcionalNoMes(d, c, comp) {
  const entradaNoMes = !!c.data_entrada && c.data_entrada.slice(0, 7) === comp;
  const saidaNoMes = !!c.data_saida && c.data_saida.slice(0, 7) === comp;
  return (entradaNoMes && !c.contrato_anterior_id) || (saidaNoMes && !continuadoPor(d, c));
}

/**
 * Tarifa do boleto cobrada no contrato (decisão do dono de 24/11/2026: sempre cobrada por padrão): o valor próprio do contrato;
 * sem valor próprio, a regra `tarifa_padrao` (Regras do sistema, ou a regra especial do contrato); "Não cobrar tarifa do boleto"
 * marcado, nada. Ex.: regra R$ 8,50, contrato em branco → R$ 8,50; contrato com R$ 3,50 → R$ 3,50; marcado → R$ 0,00.
 */
export function tarifaDoContrato(c) {
  if (!c || c.nao_cobrar_tarifa) return 0;
  if (c.taxa_boleto > 0) return c.taxa_boleto;
  const padrao = CR.regra('tarifa_padrao', c);
  return padrao > 0 ? padrao : 0;
}
/** O contrato segue a tarifa padrão (sem valor próprio e sem "Não cobrar"). */
export const usaTarifaPadrao = (c) => !!c && !c.nao_cobrar_tarifa && !(c.taxa_boleto > 0);

/**
 * Tarifa padrão mudou: os boletos em aberto dos contratos que a seguem são refeitos. Pagos, emitidos no banco (ou com o PDF do
 * banco anexado), em acordo e alterados à mão na tarifa não mudam. ``filtroContrato``: só os contratos dessa regra (regra especial).
 * Devolve quantos boletos mudaram.
 */
export function recalcularTarifaPadrao(d, usuario, filtroContrato = () => true) {
  const ids = new Set(d.contratos.filter((c) => usaTarifaPadrao(c) && filtroContrato(c)).map((c) => c.id));
  return recalcularCobrancas(d, (cb) => ids.has(cb.contrato_id) && !emitidoNoBanco(cb) && !cb.boleto_pdf, usuario);
}

export function montarCobranca(d, contrato, comp) {
  const dias = C.diasOcupados(comp, contrato.data_entrada, contrato.data_saida);
  if (dias === 0 || trocaAguardaAditivo(d, contrato)) return null;
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
    ? parcelasDoMes(segurosDoContrato(d, contrato.id), comp,
      (s) => `Seguro${s.seguradora ? ` ${s.seguradora}` : ''}`)
    : [0, ''];
  const ressarc = ressarcimentosNoBoleto(d, contrato.id, comp);
  const r = C.calcularCobranca({
    competencia: comp, aluguelMensal: carencia ? 0 : aluguelAtual(d, contrato, `${comp}-01`),
    entrada: contrato.data_entrada, saida: contrato.data_saida,
    descontoPercentual: bonificacaoNaCompetencia(d, contrato, comp), iptu, seguro,
    seguroProporcional: seguroProporcionalNoMes(d, contrato, comp),
    taxaBoleto: cobra('taxa') ? tarifaDoContrato(contrato) : 0, contrato,
  });
  const seguroParcela = seguro && r.seguro < seguro ? `${seguroRot} proporcional ${r.dias_cobrados}/${r.dias_mes} dias de ${C.reais(seguro)}` : seguroRot;
  // troca de titular no dia 31: o anterior já pagou 30/30 e o novo não tem dia a pagar no mês (saida-016): sem boleto
  if (r.dias_cobrados === 0) return null;
  // o FCI do mês incompleto é sempre pelos dias reais (regra `proporcional`), também com o mês comercial de 30 dias
  // Ex.: entrada 15/02/2027, R$ 1.800,00 bonificado, FCI 5%: 14/28 → R$ 45,00 (e não 16/30 → R$ 48,00)
  const aluguelReal = r.dias_mes === diasMes ? r.aluguel : C.aluguelProporcional(r.aluguel_mensal, dias, diasMes);
  const descontoReal = r.dias_mes === diasMes ? r.desconto : C.descontoPorPercentual(aluguelReal, bonificacaoNaCompetencia(d, contrato, comp));
  return {
    contrato_id: contrato.id, competencia: comp,
    vencimento: vencimentoDoContrato(d, contrato, comp),
    dias_cobrados: r.dias_cobrados, dias_mes: r.dias_mes, aluguel_mensal: r.aluguel_mensal,
    aluguel: r.aluguel, desconto: r.desconto, iptu: r.iptu, iptu_parcela: iptuRots.join('; '), seguro: r.seguro,
    seguro_parcela: seguroParcela, taxa_boleto: r.taxa_boleto, fci: fciDoMes(contrato, aluguelReal, descontoReal), outros: 0, outros_descricao: '',
    reserva_utilizada: 0, carencia,
    ressarcimento: ressarc.valor, ressarcimento_descricao: ressarc.descricao, ressarcimento_na_nf: CR.regra('ressarcimento_na_nf') && ressarc.valor > 0,
    multa_percentual: contrato.multa_percentual || 0, juros_mensal_percentual: contrato.juros_mensal_percentual || 0,
    // carência sem nada a cobrar (a reserva não conta: ela nunca entra no boleto da carência)
    situacao: carencia && r.total_pontual <= 0 ? 'Carência' : 'Em aberto', data_pagamento: null, valor_pago: null, dias_atraso: null, multa: null, juros: null,
    valor_nf: null, banco: null,
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
      aplicarDiferencasPendentes(d, contrato.id, usuario); // diferença de pagamento a menos à espera do próximo boleto
      sincronizarMultas(d, contrato.id, usuario); // multa de notificação à espera do próximo boleto
      // a reserva do boleto novo (e a dos que já existiam, se gerou um mês anterior a eles) vai para o mês certo
      realocarReserva(d, contrato, usuario);
    }
  }
  // complemento da caução não sai sozinho: é gerado na tela Reajustes ("Caução a completar"), com vencimento e parcelas escolhidos
  return { geradas, existentes };
}

/**
 * Campos que o recálculo atualiza (o ajuste do mês, as observações e o vencimento alterado à mão ficam). A reserva
 * (``reserva_utilizada``) não está aqui: ela liga os meses do contrato e é redistribuída por ``realocarReserva`` no fim.
 */
const CAMPOS_RECALCULO = ['dias_cobrados', 'dias_mes', 'aluguel_mensal', 'aluguel', 'desconto', 'iptu', 'iptu_parcela', 'seguro',
  'seguro_parcela', 'taxa_boleto', 'fci', 'ressarcimento', 'ressarcimento_descricao', 'ressarcimento_na_nf', 'carencia', 'multa_percentual', 'juros_mensal_percentual', 'situacao'];

/**
 * Campos que "Alterar valores" grava e os do recálculo que ficam junto com cada um (o rótulo da parcela acompanha o valor;
 * aluguel, bonificação e FCI dependem um do outro). Pedido do dono de 24/11/2026: o seguro lançado depois não entrava no
 * boleto alterado à mão. Desde então o boleto guarda ``campos_manuais`` e o recálculo muda só o resto.
 * Ex.: IPTU digitado à mão em 11/2026 e seguro de R$ 30,00 lançado depois → o IPTU fica e o seguro entra.
 */
export const CAMPOS_MANUAIS = ['aluguel', 'desconto', 'iptu', 'seguro', 'taxa_boleto', 'fci', 'multa_percentual', 'juros_mensal_percentual'];
const JUNTOS_DO_MANUAL = {
  aluguel: ['aluguel', 'desconto', 'fci', 'dias_cobrados', 'dias_mes', 'aluguel_mensal'], desconto: ['aluguel', 'desconto', 'fci', 'dias_cobrados', 'dias_mes', 'aluguel_mensal'],
  fci: ['fci'], iptu: ['iptu', 'iptu_parcela'], seguro: ['seguro', 'seguro_parcela'], taxa_boleto: ['taxa_boleto'],
  multa_percentual: ['multa_percentual'], juros_mensal_percentual: ['juros_mensal_percentual'],
};
/** Campos que o recálculo pode mudar neste boleto; null: alterado à mão antes de 24/11/2026 (não se sabe o quê, fica como está). */
export function camposDoRecalculo(cb) {
  if (!cb.editado_manual) return CAMPOS_RECALCULO;
  if (!Array.isArray(cb.campos_manuais)) return null;
  const fora = new Set(cb.campos_manuais.flatMap((k) => JUNTOS_DO_MANUAL[k] || [k]));
  return CAMPOS_RECALCULO.filter((k) => !fora.has(k));
}

/**
 * Boleto em aberto alterado à mão antes de 24/11/2026 que não bate com o cadastro no IPTU ou no seguro (ex.: apólice lançada
 * depois de alterar o boleto): [{ rotulo, cadastro, boleto }]. Vazio: bate, ou o recálculo já cuida dele.
 */
export function divergenciasDoManual(d, cb) {
  if (!cb.editado_manual || camposDoRecalculo(cb) || cb.data_pagamento || emAcordo(cb) || ehBoletoAvulso(cb)) return [];
  const c = buscar(d, 'contratos', cb.contrato_id);
  const novo = c && montarCobranca(d, c, cb.competencia);
  if (!novo) return [];
  return [['iptu', 'IPTU'], ['seguro', 'Seguro obrigatório']].filter(([k]) => (novo[k] || 0) !== (cb[k] || 0))
    .map(([k, rotulo]) => ({ campo: k, rotulo, cadastro: novo[k] || 0, boleto: cb[k] || 0 }));
}

export function alertasBoletosManuais(d) {
  const lista = [];
  for (const cb of d.cobrancas) {
    if (!cb.editado_manual || cb.data_pagamento) continue;
    const dif = divergenciasDoManual(d, cb);
    if (!dif.length) continue;
    const c = buscar(d, 'contratos', cb.contrato_id);
    const i = buscar(d, 'imoveis', c.imovel_id);
    lista.push({ nivel: 'aviso', tipo: 'A verificar', contrato_id: c.id, imovel: i ? i.nome : '', inquilino: c.inquilino_nome,
      link: `#/cobranca/${cb.id}`, ancora: `boleto-${cb.id}`,
      texto: `Boleto de ${C.compBr(cb.competencia)} foi alterado à mão e não bate com o cadastro: ${dif.map((x) => `${x.rotulo} ${C.reais(x.cadastro)} no cadastro e ${C.reais(x.boleto)} no boleto`).join('; ')}. Abra o boleto e use "Voltar a calcular pelo cadastro" (ou corrija em "Alterar valores").` });
  }
  return lista;
}

/**
 * Boleto do aluguel de um mês em que o inquilino não ocupou nenhum dia (depois da saída ou antes da entrada), em aberto.
 * Fim do vínculo na troca de titular não conta: esses boletos passam ao novo titular no dia da troca.
 */
function boletoSemOcupacao(d, cb, c = buscar(d, 'contratos', cb.contrato_id)) {
  return !!c && !cb.data_pagamento && !emAcordo(cb) && !ehBoletoAvulso(cb)
    && C.diasOcupados(cb.competencia, c.data_entrada, c.data_saida) === 0 && !continuadoPor(d, c);
}

/**
 * Alertas dos boletos em aberto de mês sem nenhum dia ocupado (``boletoSemOcupacao``) que ficaram: emitido no C6 ou feito à
 * mão no banco com o PDF anexado (o banco ainda cobra: cancele lá e depois exclua), alterado à mão (o recálculo não exclui) ou
 * de antes desta conferência.
 */
export function alertasBoletosSemOcupacao(d) {
  const lista = [];
  for (const cb of d.cobrancas) {
    // boleto já pago de mês depois da saída (saída informada para antes de um mês pago): o valor volta ao inquilino ou é abatido
    // no cálculo final. Ex.: boleto de 11/2026 pago (R$ 1.800,00) e saída em 15/10/2026. Some quando o cálculo final é feito.
    if (cb.data_pagamento && !ehBoletoAvulso(cb)) {
      const c = buscar(d, 'contratos', cb.contrato_id);
      if (c && c.data_saida && c.data_saida < `${cb.competencia}-01` && !continuadoPor(d, c) && !encerramentoDo(d, c.id)) {
        const i = buscar(d, 'imoveis', c.imovel_id);
        lista.push({ nivel: 'aviso', tipo: 'A verificar', contrato_id: c.id, imovel: i ? i.nome : '', inquilino: c.inquilino_nome,
          link: `#/cobranca/${cb.id}`, ancora: `boleto-${cb.id}`,
          texto: `Boleto de ${C.compBr(cb.competencia)} foi pago (${C.reais(cb.valor_pago || 0)}), mas não tem nenhum dia ocupado (saída em ${C.dataBr(c.data_saida)}): devolva ao inquilino ou abata no cálculo final da saída.` });
      }
      continue;
    }
    if (emAcordo(cb) || ehBoletoAvulso(cb)) continue;
    const c = buscar(d, 'contratos', cb.contrato_id);
    if (!boletoSemOcupacao(d, cb, c)) continue;
    const i = buscar(d, 'imoveis', c.imovel_id);
    const motivo = c.data_saida && c.data_saida < `${cb.competencia}-01` ? `saída em ${C.dataBr(c.data_saida)}` : `entrada em ${C.dataBr(c.data_entrada)}`;
    const banco = emitidoNoBanco(cb);
    const aMao = !banco && !!cb.boleto_pdf; // feito à mão no site do banco, com o PDF anexado (24/11/2026)
    lista.push({ nivel: banco || aMao ? 'perigo' : 'aviso', tipo: banco || aMao ? 'Banco' : 'A verificar', contrato_id: c.id, imovel: i ? i.nome : '', inquilino: c.inquilino_nome,
      link: `#/cobranca/${cb.id}`, ancora: `boleto-${cb.id}`,
      texto: banco ? `Boleto de ${C.compBr(cb.competencia)} está emitido no C6, mas não tem nenhum dia ocupado (${motivo}): cancele no banco e depois exclua o boleto.`
        : aMao ? `Boleto de ${C.compBr(cb.competencia)} foi emitido à mão no banco (PDF anexado), mas não tem nenhum dia ocupado (${motivo}): cancele no banco e depois exclua o boleto.`
        : cb.editado_manual ? `Boleto de ${C.compBr(cb.competencia)} (alterado à mão) não tem nenhum dia ocupado (${motivo}): confira e exclua o boleto se não deve ser cobrado.`
          : `Boleto de ${C.compBr(cb.competencia)} não tem nenhum dia ocupado (${motivo}): exclua o boleto (ou recalcule os boletos em aberto do mês).` });
  }
  return lista;
}

/**
 * Recalcula os boletos em aberto depois de mudar o contrato, o IPTU ou o seguro, para que o boleto sempre bata
 * com o cadastro. Boleto alterado à mão ("Alterar valores"): os valores digitados ficam e o resto é recalculado
 * (``camposDoRecalculo``; o alterado antes de 24/11/2026 fica todo como está, só a reserva dele pode mudar de mês).
 * Boleto de mês sem nenhum dia ocupado (ex.: dezembro gerado e saída em 15/11) é excluído, com histórico, se não tem NF, não foi
 * emitido no C6 nem feito à mão no banco (PDF anexado) e não foi alterado à mão; esses ficam e aparecem nos alertas
 * (``alertasBoletosSemOcupacao``: cancelar no banco, ou conferir e excluir). Devolve quantos boletos mudaram.
 */
export function recalcularCobrancas(d, filtro, usuario) {
  const mudaram = new Set();
  // alterado à mão: só os campos que não foram digitados (``camposDoRecalculo``); antes de 24/11/2026, nada
  const abertos = (cb) => !cb.data_pagamento && !!camposDoRecalculo(cb) && !emAcordo(cb) && !ehBoletoAvulso(cb) && !cb.quitado_saida && !cb.quitado_devolucao;
  const lista = d.cobrancas.filter((cb) => abertos(cb) && filtro(cb)).sort((a, b) => a.competencia.localeCompare(b.competencia));
  const contratos = new Map();
  for (const cb of lista) {
    const c = buscar(d, 'contratos', cb.contrato_id);
    if (c) contratos.set(c.id, c);
    if (boletoSemOcupacao(d, cb, c)) {
      // fica (com alerta): emitido no C6, feito à mão no banco com o PDF anexado (o banco ainda cobra e o inquilino pode ter o
      // PDF) ou alterado à mão (o valor foi combinado: confira e exclua, como antes de 24/11/2026)
      if (!faturasDe(d, 'cobranca', cb.id, false).length && !emitidoNoBanco(cb) && !cb.boleto_pdf && !cb.editado_manual) {
        excluir(d, 'cobrancas', cb.id, usuario, `Boleto ${C.compBr(cb.competencia)} de ${c.inquilino_nome} excluído: nenhum dia ocupado no mês (${c.data_saida && c.data_saida < `${cb.competencia}-01` ? `saída em ${C.dataBr(c.data_saida)}` : `entrada em ${C.dataBr(c.data_entrada)}`})`);
        mudaram.add(cb.id);
      }
      continue;
    }
    const novo = c && montarCobranca(d, c, cb.competencia);
    if (!novo) continue;
    const dados = Object.fromEntries(camposDoRecalculo(cb).map((k) => [k, novo[k]]));
    if (Object.keys(atualizar(d, 'cobrancas', cb.id, dados, usuario, `Boleto ${C.compBr(cb.competencia)} recalculado pelo cadastro`)).length) mudaram.add(cb.id);
  }
  // boleto excluído (nenhum dia ocupado) que tinha diferença antiga ou multa de notificação: elas voltaram a esperar um boleto
  // (excluir as solta) e vão para o próximo em aberto; sem próximo (saída), entram nos débitos da saída (debitosDaSaida)
  if (mudaram.size) for (const c of contratos.values()) { aplicarDiferencasPendentes(d, c.id, usuario); sincronizarMultas(d, c.id, usuario); }
  // com os valores novos, a reserva de cada contrato é redistribuída pelos boletos em aberto dele
  for (const c of contratos.values()) for (const id of realocar(d, c, usuario)) mudaram.add(id);
  return mudaram.size;
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
 * O que um boleto JÁ PAGO devia ter recebido (o mesmo cálculo da confirmação: desconto se pagou em dia, multa e juros até o dia em
 * que pagou; a reserva abatida já sai do valor). Recebido acima disso foi pago a mais. Ex.: boleto de R$ 2.000,00 pago em dia duas
 * vezes → recebido R$ 4.000,00, devido R$ 2.000,00, a mais R$ 2.000,00.
 */
export function devidoDoPago(cb) {
  if (!cb || !cb.data_pagamento) return 0;
  const v = previstoNoPagamento(cb, cb.data_pagamento, { pagouEmDia: !!cb.pagou_em_dia, dataPagou: cb.data_pagou || null }).valor_devido;
  return Number.isFinite(v) ? v : 0;
}
/**
 * Devolução do pago a mais feita fora do extrato (ex.: Pix de outra conta, dinheiro): o recebido volta ao devido e o devolvido
 * fica anotado, como na devolução pelo extrato. Ex.: recebido R$ 3.100,00, devido R$ 3.000,00 → devolvido R$ 100,00 em 25/11.
 */
export function marcarDevolvidoAMao(d, cobrancaId, data, usuario) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  const falta = pagoAMaisDo(cb);
  if (!falta) throw new C.ErroUsuario('Este boleto não tem valor a devolver.');
  if (!C.dataValida(data)) throw new C.ErroUsuario('Informe o dia da devolução.');
  if (data < cb.data_pagamento) throw new C.ErroUsuario(`A devolução (${C.dataBr(data)}) é antes do pagamento (${C.dataBr(cb.data_pagamento)}).`);
  atualizar(d, 'cobrancas', cb.id, { valor_pago: cb.valor_pago - falta, valor_devolvido: (cb.valor_devolvido || 0) + falta }, usuario,
    `Devolução ao inquilino de ${C.reais(falta)} em ${C.dataBr(data)} (fora do extrato): recebido ${C.reais(cb.valor_pago)} → ${C.reais(cb.valor_pago - falta)}. A NF não muda`);
  return falta;
}

/** Quanto o boleto pago recebeu a mais do que devia (0 se não recebeu a mais). */
export const pagoAMaisDo = (cb) => (cb && cb.data_pagamento ? Math.max(0, (cb.valor_pago || 0) - devidoDoPago(cb)) : 0);

/**
 * Valor recebido diferente do previsto (caso excepcional): a NF não sai pelo cálculo. ``valorNf`` é digitado à mão
 * e precisa ser diferente do calculado; ``justificativa`` é obrigatória e fica só no sistema (histórico do boleto).
 */
export function conferirDivergencia(cb, r, valorPago, valorNf, justificativa) {
  if (!String(justificativa || '').trim()) throw new C.ErroUsuario('Informe a justificativa da divergência.');
  if (!(valorNf > 0)) throw new C.ErroUsuario('Informe o valor da NF.');
  if (valorNf === r.valor_nf) throw new C.ErroUsuario(`Altere o valor da NF: ele está igual ao calculado (${C.reais(r.valor_nf)}). Faça o cálculo à mão com o valor recebido de ${C.reais(valorPago)}.`);
}

/**
 * Não existe pagamento em parte (decisão do dono, 2026-11-20: "ou paga inteiro ou não paga"): valor recebido menor que o devido
 * é recusado e o boleto continua em aberto (multa e juros correm; a quitação é por acordo). Ex.: devido R$ 2.700,00, recebido
 * R$ 2.000,00 → recusado. O complemento da caução só aceita o valor exato do boleto.
 */
export const MOTIVO_PAGO_A_MENOS = (recebido, devido, extrato = false) => `O valor recebido (${C.reais(recebido)}) é menor que o devido (${C.reais(devido)}). Não existe pagamento em parte: o boleto continua em aberto${extrato ? ' e o dinheiro fica no extrato sem destino' : ''}. Para quitar, faça um acordo (tela de acordos).`;
export function conferirValorRecebido(cb, valorPago, devido, { extrato = false } = {}) {
  if (valorPago === null || valorPago === undefined) return;
  // (zero só no boleto de R$ 0,00, ex.: mês de carência sem nada a cobrar)
  if (!Number.isFinite(valorPago) || valorPago < 0 || (valorPago === 0 && devido > 0)) throw new C.ErroUsuario('Informe o valor que entrou na conta (maior que zero).');
  if (ehComplementoCaucao(cb) && valorPago !== devido) throw new C.ErroUsuario(`O complemento da caução só é pago pelo valor exato do boleto (${C.reais(devido)}); entrou ${C.reais(valorPago)}. Nada foi salvo.`);
  if (valorPago < devido) throw new C.ErroUsuario(MOTIVO_PAGO_A_MENOS(valorPago, devido, extrato));
}

export function registrarPagamento(d, cobrancaId, dataContabil, valorPago, usuario, { pagouEmDia = false, dataPagou = null, valorNf = null, justificativa = '' } = {}) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  if (emAcordo(cb)) throw new C.ErroUsuario(MOTIVO_EM_ACORDO(cb, 'não recebe pagamento'));
  // já pago: um segundo registro apagaria o primeiro (data, valor e situação); para corrigir, desfaça o pagamento antes
  if (cb.data_pagamento) throw new C.ErroUsuario(`O boleto de ${C.compBr(cb.competencia)} já está pago (${C.dataBr(cb.data_pagamento)}). Para corrigir, desfaça o pagamento antes.`);
  if (faturasDe(d, 'cobranca', cb.id).length) {
    throw new Error('Este boleto já tem NF emitida. Desfaça o pagamento antes de alterar.');
  }
  if (dataPagou && dataPagou > dataContabil) throw new Error('O dia em que pagou não pode ser depois da data contábil.');
  const r = previstoNoPagamento(cb, dataContabil, { pagouEmDia, dataPagou });
  conferirValorRecebido(cb, valorPago, r.valor_devido);
  const compensadoDepois = pagouEmDia && dataContabil > cb.vencimento;
  const caucao = ehComplementoCaucao(cb);
  const saldoSaida = ehSaldoSaida(cb); // boleto do saldo da saída: sem NF, como o complemento da caução
  // pago a mais com a NF no valor calculado (decisão do dono, 21/11/2026, mensal-009): a NF não muda e a diferença fica
  // anotada como "falta devolver" (a mesma conta do pago a mais pelo extrato, pagoAMaisDo). Ex.: devido R$ 3.000,00,
  // recebido R$ 3.100,00 → NF pelo cálculo e R$ 100,00 a devolver. NF digitada diferente: é o cálculo manual de antes.
  const aMais = valorPago !== null && valorPago !== undefined && valorPago > r.valor_devido && !caucao && (valorNf === null || valorNf === r.valor_nf) ? valorPago - r.valor_devido : 0;
  const manual = valorNf !== null && !caucao && !saldoSaida && !aMais;
  if (manual) conferirDivergencia(cb, r, valorPago, valorNf, justificativa);
  atualizar(d, 'cobrancas', cb.id, {
    data_pagamento: dataContabil, data_pagou: pagouEmDia ? null : (dataPagou || null), valor_pago: valorPago ?? r.valor_devido,
    dias_atraso: r.dias_atraso, multa: r.multa, juros: r.juros, valor_nf: caucao || saldoSaida ? 0 : manual ? valorNf : r.valor_nf, pagou_em_dia: compensadoDepois,
    situacao: r.pontual ? 'Paga em dia' : 'Paga com atraso', nf_manual: manual, divergencia: manual ? String(justificativa).trim() : null,
    ...(aMais ? { valor_a_mais: aMais } : {}),
  }, usuario, `${compensadoDepois ? `Pagamento confirmado (pagou em dia, entrou em ${C.dataBr(dataContabil)})` : 'Pagamento confirmado'}: boleto ${ehParcelaAcordo(cb) ? `do acordo ${cb.acordo_parcela || ''}`.trim() : C.compBr(cb.competencia)} de ${buscar(d, 'contratos', cb.contrato_id)?.inquilino_nome || 'inquilino'}${manual
    ? `. Recebido ${C.reais(valorPago)}, previsto ${C.reais(r.valor_devido)}; NF digitada ${C.reais(valorNf)} (calculada ${C.reais(r.valor_nf)}). Justificativa: ${String(justificativa).trim()}` : ''}${aMais
    ? `. Recebido ${C.reais(valorPago)}, previsto ${C.reais(r.valor_devido)}: ${C.reais(aMais)} a devolver ao inquilino (a NF não muda)${String(justificativa || '').trim() ? `. Motivo: ${String(justificativa).trim()}` : ''}` : ''}`);
  // complemento da caução pago: soma na caução atual (parcelas, em qualquer ordem); a data nunca fica antes da última correção
  if (caucao) {
    const c = buscar(d, 'contratos', cb.contrato_id);
    const atual = valorGarantia(d, c);
    const data = dataDaCorrecaoCaucao(d, c, cb.caucao_vigencia && cb.caucao_vigencia > dataContabil ? cb.caucao_vigencia : dataContabil);
    const x = inserir(d, 'correcoes_garantia', { contrato_id: cb.contrato_id, data, referente: cb.caucao_vigencia || null,
      valor_anterior: atual, valor_novo: atual + cb.caucao_complemento, complemento: cb.caucao_complemento,
      observacoes: `Boleto do complemento${cb.caucao_parcela ? ` (${cb.caucao_parcela})` : ''} pago em ${C.dataBr(dataContabil)}` },
    usuario, `Caução corrigida para ${C.reais(atual + cb.caucao_complemento)} (complemento pago)`);
    atualizar(d, 'cobrancas', cb.id, { caucao_correcao_id: x.id }, usuario, 'Correção da caução registrada');
  }
  // boleto do saldo da saída pago (na tela ou pelo extrato/banco que reconheceu o pagamento): marca sozinho o saldo cobrado
  // no roteiro da saída, na data do pagamento (decisão do dono, 2026-11-20)
  if (saldoSaida) {
    const e = buscar(d, 'encerramentos', cb.saldo_saida_de);
    if (e && !e.garantia_devolvida_em) marcarGarantiaDevolvida(d, e.id, dataPagou && !pagouEmDia ? dataPagou : dataContabil, usuario);
  }
  return r;
}

/*
 * Pagamento a menos de ANTES de 2026-11-20 (dados antigos): o boleto ficou "Paga em parte" (ou "Paga com atraso", no Pix atrasado
 * pelo valor do desconto) com ``diferenca_devida`` e a diferença foi (ou vai, quando o boleto for gerado) para o próximo boleto
 * do aluguel (``diferenca_no_boleto``). O boleto de destino guarda em ``diferencas_cobradas`` [{ cobranca_id, valor, texto }] o
 * que recebeu (como ``multas_notificacao``): ela fica presa a ele (o ajuste do mês não a apaga), sai da base de multa e juros e,
 * se ele for excluído, a diferença volta a ficar pendente. Pagamento novo a menos é recusado (``conferirValorRecebido``).
 */
export const textoDiferenca = (cb) => `Diferença do boleto ${C.compBr(cb.competencia)} (pago em parte)`;

/** Diferença antiga ainda sem boleto (nunca foi, ou o boleto de destino foi excluído). */
export const diferencaPendente = (d, cb) => cb.diferenca_devida > 0 && !!cb.data_pagamento && (!cb.diferenca_no_boleto || !buscar(d, 'cobrancas', cb.diferenca_no_boleto));

/** Põe as diferenças antigas de pagamentos a menos ainda sem boleto no próximo boleto do aluguel em aberto do contrato. */
export function aplicarDiferencasPendentes(d, contratoId, usuario) {
  const pendentes = d.cobrancas.filter((x) => x.contrato_id === contratoId && diferencaPendente(d, x))
    .sort((a, b) => a.competencia.localeCompare(b.competencia));
  let mudou = false;
  for (const cb of pendentes) {
    const destino = d.cobrancas.filter((x) => x.contrato_id === contratoId && x.competencia > cb.competencia && !ehBoletoAvulso(x) && aCobrar(x) && !emitidoNoBanco(x))
      .sort((a, b) => a.competencia.localeCompare(b.competencia))[0];
    if (!destino) continue;
    const descricao = [destino.outros_descricao, textoDiferenca(cb)].filter(Boolean).join('; ');
    const lista = [...(destino.diferencas_cobradas || []), { cobranca_id: cb.id, valor: cb.diferenca_devida, texto: textoDiferenca(cb) }];
    atualizar(d, 'cobrancas', destino.id, { outros: (destino.outros || 0) + cb.diferenca_devida, outros_descricao: descricao, diferencas_cobradas: lista }, usuario,
      `Boleto ${C.compBr(destino.competencia)}: + ${C.reais(cb.diferenca_devida)} da diferença do boleto ${C.compBr(cb.competencia)} (pago em parte)`);
    atualizar(d, 'cobrancas', cb.id, { diferenca_no_boleto: destino.id }, usuario, `Diferença de ${C.reais(cb.diferenca_devida)} cobrada no boleto ${C.compBr(destino.competencia)}`);
    mudou = true;
  }
  const c = mudou && buscar(d, 'contratos', contratoId);
  if (c) realocarReserva(d, c, usuario);
  return mudou;
}

/**
 * Tira do boleto de destino (em aberto) a diferença antiga que ele recebeu de ``origem``, só se ela ainda está lá (na lista
 * ``diferencas_cobradas`` ou, em dado antigo sem a lista, com o texto no motivo do ajuste). Devolve true se tirou.
 */
function tirarDiferencaDoDestino(d, origem, destino, usuario, motivo) {
  const texto = textoDiferenca(origem);
  const naLista = (destino.diferencas_cobradas || []).find((e) => e.cobranca_id === origem.id);
  const partes = String(destino.outros_descricao || '').split('; ');
  if (!naLista && !partes.includes(texto)) return false; // o ajuste já foi trocado: não mexe no valor (senão sobraria um desconto)
  const valor = naLista ? naLista.valor : origem.diferenca_devida;
  atualizar(d, 'cobrancas', destino.id, { outros: (destino.outros || 0) - valor, outros_descricao: partes.filter((x) => x !== texto).join('; '),
    diferencas_cobradas: (destino.diferencas_cobradas || []).filter((e) => e.cobranca_id !== origem.id) }, usuario,
  `Boleto ${C.compBr(destino.competencia)}: sai a diferença de ${C.reais(valor)} do boleto ${C.compBr(origem.competencia)} (${motivo})`);
  return true;
}

/** Pagamento em parte (antigo) desfeito: a diferença sai do boleto em que foi cobrada (se ele ainda está em aberto e ela ainda está lá). */
function retirarDiferenca(d, cb, usuario) {
  if (!(cb.diferenca_devida > 0)) return;
  const destino = cb.diferenca_no_boleto && buscar(d, 'cobrancas', cb.diferenca_no_boleto);
  if (destino && destino.data_pagamento) throw new C.ErroUsuario(`A diferença deste pagamento já foi cobrada no boleto de ${C.compBr(destino.competencia)}, que está pago: desfaça antes aquele pagamento.`);
  if (destino) tirarDiferencaDoDestino(d, cb, destino, usuario, 'pagamento desfeito');
  atualizar(d, 'cobrancas', cb.id, { diferenca_devida: null, diferenca_no_boleto: null }, usuario, 'Diferença do pagamento em parte retirada');
}

/**
 * Boleto em aberto que passa a outro contrato (troca de titular): a diferença antiga e a multa de notificação de quem sai
 * saem dele e voltam a ficar pendentes no contrato anterior (entram nos débitos dele, ``debitosDaSaida``).
 */
function limparDoAnterior(d, cb, anteriorId, usuario) {
  if (cb.data_pagamento || emitidoNoBanco(cb)) return;
  for (const e of [...(cb.diferencas_cobradas || [])]) {
    const origem = buscar(d, 'cobrancas', e.cobranca_id);
    if (!origem || origem.contrato_id !== anteriorId) continue;
    tirarDiferencaDoDestino(d, origem, buscar(d, 'cobrancas', cb.id), usuario, 'é de quem saiu: fica nos débitos dele');
    atualizar(d, 'cobrancas', origem.id, { diferenca_no_boleto: null }, usuario, `Diferença de ${C.reais(origem.diferenca_devida)} fica com o contrato anterior (troca de titular)`);
  }
  for (const e of [...(cb.multas_notificacao || [])]) {
    const n = buscar(d, 'notificacoes', e.notificacao_id);
    if (!n || n.contrato_id !== anteriorId) continue;
    const atual = buscar(d, 'cobrancas', cb.id);
    atualizar(d, 'cobrancas', cb.id, { outros: (atual.outros || 0) - e.valor, outros_descricao: String(atual.outros_descricao || '').split('; ').filter((x) => x !== e.texto).join('; '),
      multas_notificacao: (atual.multas_notificacao || []).filter((x) => x.notificacao_id !== n.id) }, usuario,
    `Boleto ${C.compBr(cb.competencia)}: sai a multa de ${C.reais(e.valor)} (${e.texto}), que é de quem saiu`);
    atualizar(d, 'notificacoes', n.id, { multa_cobranca_id: null }, usuario, `Multa da notificação de ${C.dataBr(n.data)} fica com o contrato anterior (troca de titular)`);
  }
}

/** Boleto excluído: a diferença antiga e a multa de notificação que estavam nele voltam a ficar pendentes (entram no próximo boleto ou nos débitos da saída). */
function soltarDoBoletoExcluido(d, cbId, usuario) {
  for (const x of d.cobrancas.filter((y) => y.diferenca_no_boleto === cbId)) atualizar(d, 'cobrancas', x.id, { diferenca_no_boleto: null }, usuario, `Diferença de ${C.reais(x.diferenca_devida)} do boleto ${C.compBr(x.competencia)} volta a esperar um boleto (o boleto em que estava foi excluído)`);
  for (const n of (d.notificacoes || []).filter((y) => y.multa_cobranca_id === cbId)) atualizar(d, 'notificacoes', n.id, { multa_cobranca_id: null }, usuario, `Multa da notificação de ${C.dataBr(n.data)} volta a esperar um boleto (o boleto em que estava foi excluído)`);
}

export function estornarPagamento(d, cobrancaId, usuario) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  if (cb) retirarDiferenca(d, cb, usuario);
  // boleto do saldo da saída: o "saldo cobrado" marcado pelo pagamento volta a ficar por fazer
  if (cb && ehSaldoSaida(cb)) {
    const e = buscar(d, 'encerramentos', cb.saldo_saida_de);
    if (e && e.garantia_devolvida_em && [cb.data_pagamento, cb.data_pagou].includes(e.garantia_devolvida_em)) marcarGarantiaDevolvida(d, e.id, '', usuario);
  }
  if (cb && cb.caucao_correcao_id) {
    const depois = d.correcoes_garantia.find((x) => x.contrato_id === cb.contrato_id && x.id > cb.caucao_correcao_id);
    if (depois) throw new Error(`A caução foi corrigida de novo depois deste pagamento (${C.dataBr(depois.data)}): desfaça antes o pagamento da parcela mais recente.`);
    if (buscar(d, 'correcoes_garantia', cb.caucao_correcao_id)) excluir(d, 'correcoes_garantia', cb.caucao_correcao_id, usuario, 'Correção da caução desfeita (pagamento do complemento desfeito)');
    atualizar(d, 'cobrancas', cb.id, { caucao_correcao_id: null }, usuario, 'Correção da caução desfeita');
  }
  cancelarFaturas(d, 'cobranca', cobrancaId, usuario);
  atualizar(d, 'cobrancas', cobrancaId, { data_pagamento: null, data_pagou: null, valor_pago: null, dias_atraso: null, multa: null,
    juros: null, valor_nf: null, pagou_em_dia: false, situacao: 'Em aberto', nf_manual: false, divergencia: null, movimentacao_id: null, pagamento_c6: null,
    ...(cb && (cb.valor_a_mais || cb.valor_devolvido) ? { valor_a_mais: null, valor_devolvido: null } : {}) }, usuario, 'Pagamento desfeito');
  // confirmado pelo extrato: a movimentação volta a "sem destino" (também a entrada a mais e a devolução ao inquilino ligadas a ele).
  // O comprovante sai junto, como no "Desfazer destino" (``desvincularMovimentacao``): a pasta dele vem do imóvel, que sai; a tela
  // apaga o arquivo que ficou sem uso (alterarApagandoAnexos) e ele é guardado de novo ao dar o destino certo.
  for (const m of (d.movimentacoes_banco || []).filter((x) => x.cobranca_id === Number(cobrancaId))) {
    atualizar(d, 'movimentacoes_banco', m.id, { cobranca_id: null, classificacao: null, imovel_id: null, classificada_em: null, classificada_por: null,
      ...(m.comprovante || m.comprovante_contador || m.comprovante_origem || m.nome_arquivo ? { comprovante: null, comprovante_contador: null, comprovante_origem: null, nome_arquivo: null } : {}),
      ...(m.pago_a_mais ? { pago_a_mais: false } : {}) }, usuario, 'Pagamento do boleto desfeito: movimentação volta a ficar sem destino');
  }
}

// --------------------------------------------------------------------------
// Faturas: numeração contínua na ordem em que o dinheiro entrou
// --------------------------------------------------------------------------
export const faturasDe = (d, tipo, id, soValidas = true) => d.faturas
  .filter((f) => f.origem_tipo === tipo && f.origem_id === id && (!soValidas || f.situacao === 'Emitida'))
  .sort((a, b) => a.id - b.id);

/**
 * Índice das NFs emitidas por origem, numa passada só: ``nfs(tipo, id)`` dá o mesmo que ``faturasDe(d, tipo, id)``.
 * Para telas e rotinas que procuram as NFs de muitos boletos: monte uma vez por desenho (as NFs mudam a cada gravação).
 * A origem é comparada como está gravada (número ou texto, em dados antigos), como em ``faturasDe``.
 */
export function indiceFaturas(d) {
  const porTipo = new Map();
  for (const f of d.faturas) {
    if (f.situacao !== 'Emitida') continue;
    let m = porTipo.get(f.origem_tipo);
    if (!m) porTipo.set(f.origem_tipo, (m = new Map()));
    const l = m.get(f.origem_id);
    if (l) l.push(f); else m.set(f.origem_id, [f]);
  }
  for (const m of porTipo.values()) for (const l of m.values()) l.sort((a, b) => a.id - b.id);
  // a lista devolvida é a do índice: só para ler
  return { nfs: (tipo, id) => (porTipo.get(tipo) && porTipo.get(tipo).get(id)) || [] };
}

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

/** Cobranças pagas e NFs avulsas que ainda não têm NF, na ordem do pagamento. ``indice``: ``indiceFaturas(d)``, se já montado. */
export function pendentesDeFatura(d, indice = indiceFaturas(d)) {
  const lista = [];
  for (const cb of d.cobrancas) {
    if (!cb.data_pagamento || !(cb.valor_nf > 0) || indice.nfs('cobranca', cb.id).length) continue;
    if (!geraNf(buscar(d, 'contratos', cb.contrato_id))) continue;
    lista.push({ tipo: 'cobranca', registro: cb, data: cb.data_pagamento });
  }
  for (const r of d.avulsas) {
    if (!indice.nfs('avulsa', r.id).length) lista.push({ tipo: 'avulsa', registro: r, data: r.data_pagamento });
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data) || a.tipo.localeCompare(b.tipo) || a.registro.id - b.registro.id);
}

/** Chave de um pagamento da fila de NF (para marcar na tela): "cobranca:12", "avulsa:3". */
export const chavePendente = (p) => `${p.tipo}:${p.registro.id}`;

/** Mês fechado: já virou (ex.: em 09/11/2026, outubro e antes). As NFs se numeram por mês fechado, do dia 1º ao último. */
export const mesFechado = (comp, hoje = C.hojeIso()) => comp < C.competenciaDe(hoje);

/** Entradas do Airbnb no extrato de um mês que ainda não receberam destino (o ganho não foi lançado nos imóveis). */
export const entradasAirbnbSemDestino = (d, comp) => (d.movimentacoes_banco || []).filter((m) => m.tipo === 'entrada' && !m.classificacao
  && String(m.data || '').slice(0, 7) === comp && /AIRBNB/i.test(`${m.titulo || ''} ${m.descricao || ''}`));

/**
 * Lembretes do Airbnb antes de numerar as NFs dos meses ``meses`` (só os fechados): entrada do Airbnb no extrato sem destino,
 * ganhos lançados sem a NF gerada, NF com soma desatualizada, ou nenhum ganho lançado. Lista de textos (vazia = tudo certo).
 */
export function lembretesAirbnb(d, meses, hoje = C.hojeIso()) {
  const out = [];
  // "nenhuma entrada lançada" só para quem tem Airbnb (imóvel do tipo ou algum ganho já lançado)
  const temAirbnb = d.imoveis.some((i) => i.tipo === 'airbnb') || (d.ganhos_airbnb || []).length > 0;
  for (const comp of [...new Set(meses)].filter((m) => mesFechado(m, hoje)).sort()) {
    const sem = entradasAirbnbSemDestino(d, comp);
    if (sem.length) out.push(`${sem.length} entrada(s) do Airbnb no extrato de ${C.compBr(comp)} ainda sem destino (${C.reais(sem.reduce((t, m) => t + m.valor, 0))}): dê o destino no Financeiro, dividindo entre os imóveis.`);
    const m = airbnbDoMes(d, comp);
    if (m.numerada) continue;
    if (m.total && !m.nf) out.push(`Os ganhos do Airbnb de ${C.compBr(comp)} (${C.reais(m.total)}) ainda não viraram NF: gere a NF do Airbnb.`);
    else if (m.divergente) out.push(`A NF do Airbnb de ${C.compBr(comp)} está com ${C.reais(m.nf.valor)}, mas os ganhos somam ${C.reais(m.total)}: acerte a NF do Airbnb.`);
    else if (!m.total && !sem.length && temAirbnb) out.push(`Nenhuma entrada do Airbnb lançada em ${C.compBr(comp)}. Se houve, lance antes de numerar.`);
  }
  return out;
}

export function ultimaFatura(d) {
  return d.faturas.reduce((m, f) => (!m || f.numero > m.numero ? f : m), null);
}

/**
 * Conta do aluguel proporcional pago com atraso, para as observações da NF (decisão do dono de 2026-11-24): a NF tem uma linha
 * só, "1 × total", e a conta fica escrita aqui. Ex.: entrada em 15/11/2026, aluguel de R$ 2.000,00, pago com atraso →
 * "Aluguel proporcional 16/30 × R$ 2.000,00 = R$ 1.066,67 + multa e juros por atraso R$ 115,77 = R$ 1.182,44".
 * Só sai quando as partes somam o valor da NF (senão a conta escrita não bateria com o total).
 */
export function contaDoProporcionalAtrasado(registro) {
  const aluguel = registro.aluguel || 0;
  const mensal = registro.aluguel_mensal || 0;
  if (!(aluguel > 0) || !(mensal > 0)) return '';
  const encargos = (registro.multa || 0) + (registro.juros || 0);
  const ressarcimento = registro.ressarcimento_na_nf && registro.ressarcimento > 0 ? registro.ressarcimento : 0;
  if (aluguel + encargos + ressarcimento !== registro.valor_nf) return '';
  const partes = [`Aluguel proporcional ${registro.dias_cobrados}/${registro.dias_mes} × ${C.reais(mensal)} = ${C.reais(aluguel)}`];
  if (encargos > 0) partes.push(`multa e juros por atraso ${C.reais(encargos)}`);
  if (ressarcimento > 0) partes.push(`${registro.ressarcimento_descricao || 'ressarcimento'} ${C.reais(ressarcimento)}`);
  return partes.length > 1 ? `${partes.join(' + ')} = ${C.reais(registro.valor_nf)}` : `${partes[0]} (pago depois do vencimento, sem o desconto de pontualidade)`;
}

/** Dados da fatura de uma cobrança ou recebimento: imóvel das empresas, tomador, período e valor. */
export function baseDaFatura(d, tipo, registro) {
  if (tipo === 'cobranca') {
    const contrato = buscar(d, 'contratos', registro.contrato_id);
    const imovel = buscar(d, 'imoveis', contrato.imovel_id);
    // parcela de acordo: o período é o dos aluguéis que ela paga (gravado no acordo), não o mês do vencimento
    const acordo = ehParcelaAcordo(registro) && registro.acordo_periodo;
    const [ini, fim] = acordo || C.periodoServico(registro.competencia, contrato.data_entrada, contrato.data_saida);
    const ref = acordo ? `acordo${registro.acordo_parcela ? ` ${registro.acordo_parcela}` : ''} (${registro.acordo_referente})` : '';
    // mês incompleto (entrada ou saída): a NF mostra a quantidade em dias do mês (ex.: 16/30), não "1 mês"
    // com o ajuste do mês na NF, o total não é só o aluguel: a linha sai como "1" (senão o valor unitário ficaria errado)
    const ajusteNf = C.ajusteNaNf(registro);
    const ajusteNaNf = !!ajusteNf;
    // pago com atraso (perda da bonificação, multa e juros na NF, regra de 16/10) ou com ressarcimento na NF: o total já não é
    // dias × aluguel, e a linha sai "1 × total" (decisão do dono de 2026-11-24, BOL-06). Ex.: entrada em 15/11/2026, aluguel de
    // R$ 2.000,00, 16/30 pago com atraso, total R$ 1.182,44 → "1 × R$ 1.182,44"; pago em dia continua "16/30 × R$ 2.000,00"
    const comAcrescimos = registro.dias_atraso > 0 || registro.multa > 0 || registro.juros > 0 || (registro.ressarcimento_na_nf && registro.ressarcimento > 0);
    const mesIncompleto = !acordo && !ajusteNaNf && registro.dias_cobrados > 0 && registro.dias_cobrados < registro.dias_mes;
    const proporcional = mesIncompleto && !comAcrescimos;
    // a linha continua uma só, com o total; a conta do proporcional pago com atraso vai nas observações (decisão do dono de 24/11)
    const contaProporcional = mesIncompleto && comAcrescimos ? contaDoProporcionalAtrasado(registro) : '';
    return {
      imovel, valor: registro.valor_nf, periodo_inicio: ini, periodo_fim: fim,
      ...(proporcional ? { dias: registro.dias_cobrados, dias_mes: registro.dias_mes } : {}),
      descricao: `${contrato.inquilino_nome} · ${imovel.nome} · ${ref || C.compBr(registro.competencia)}`,
      observacoes: registro.observacoes_nf || [ref ? `Parcela do ${ref}` : '', ajusteNaNf ? `Inclui ${ajustesDoBoleto(registro).map((a) => a.motivo).filter(Boolean).join('; ') || 'ajuste do mês'}: ${C.reais(ajusteNf)}` : '', contaProporcional].filter(Boolean).join('. '),
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
  const chave = (i) => C.semAcento(i.endereco).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || `#${i.id}`;
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
export function numerarFaturas(d, usuario, { forcar = false, ate = null, apenas = null } = {}) {
  let pendentes = pendentesDeFatura(d);
  if (ate) pendentes = pendentes.filter((p) => p.data <= ate);
  // só os pagamentos marcados na tela (chaves "cobranca:12", "avulsa:3")
  if (apenas) { const marcados = new Set(apenas); pendentes = pendentes.filter((p) => marcados.has(chavePendente(p))); }
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
        ...(base.dias ? { dias: base.dias, dias_mes: base.dias_mes } : {}),
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
export function registrarNfExterna(d, tipo, id, numero, emissao, usuario, hoje = C.hojeIso()) {
  const n = Number(numero);
  if (!Number.isInteger(n) || n < 1) throw new C.ErroUsuario('Informe o número da NF.');
  if (!C.dataValida(emissao)) throw new C.ErroUsuario('Informe a data de emissão da NF.');
  // NF já emitida não tem data depois de hoje (2026-11-20)
  if (emissao > hoje) throw new C.ErroUsuario(`A data de emissão (${C.dataBr(emissao)}) é depois de hoje (${C.dataBr(hoje)}). Informe o dia em que a NF foi emitida.`);
  if (d.faturas.some((f) => f.numero === n && f.situacao === 'Emitida')) throw new C.ErroUsuario(`Já existe NF nº ${numeroFatura(n)} emitida no sistema.`);
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
      ...(base.dias ? { dias: base.dias, dias_mes: base.dias_mes } : {}),
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
  if (d.faturas.some((f) => f.lote !== ciclo.lote && f.numero >= ciclo.de)) {
    throw new Error(`Há NFs de outra numeração com número ${numeroFatura(ciclo.de)} ou maior. Use "a partir do nº".`);
  }
  // com a conferência acima, as NFs de nº >= ciclo.de são exatamente as do ciclo: o mesmo caminho de "a partir do nº"
  desfazerNumeracao(d, ciclo.de, usuario, `Numeração desfeita: nº ${numeroFatura(ciclo.de)} a ${numeroFatura(ciclo.ate)}`);
  return ciclo;
}

/**
 * Desfaz a numeração a partir de um número: apaga todas as NFs com número igual ou maior (emitidas ou canceladas),
 * os pagamentos voltam para a fila e o próximo número volta a ser este. Serve para corrigir e numerar de novo.
 * É o único caminho que apaga NFs para renumerar ("Voltar a última numeração" passa por aqui).
 */
export function desfazerNumeracao(d, aPartirDe, usuario, descricao = null) {
  const n = Number(aPartirDe);
  if (!Number.isInteger(n) || n < 1) throw new Error('Número inválido.');
  const fs = d.faturas.filter((f) => f.numero >= n);
  if (!fs.length) throw new Error(`Não há NF com número ${numeroFatura(n)} ou maior.`);
  for (const f of fs) excluir(d, 'faturas', f.id, usuario, `NF nº ${numeroFatura(f.numero)} desfeita para numerar de novo`);
  registrar(d, usuario, 'Alteração', 'faturas', null, descricao || `Numeração desfeita a partir do nº ${numeroFatura(n)}`, { proxima_fatura: { de: d.proxima_fatura, para: n } });
  d.proxima_fatura = n;
  return new Set(fs.map((f) => f.numero)).size;
}

// --------------------------------------------------------------------------
// Alertas
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// Renovação, novo valor negociado e saída do inquilino
// --------------------------------------------------------------------------

/**
 * Registra renovação / repactuação e aplica no contrato (nova data, prazo indeterminado, novo aluguel). A nova data de término
 * leva junto o prazo em meses (ex.: 05/03/2024, renovado até 05/09/2028 → 54 meses), para o cadastro não ter duas datas de fim.
 */
export function registrarRenovacao(d, contratoId, dados, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  exigirAditivoDaTroca(d, c);
  // o prazo de antes fica guardado na renovação que o muda: o termo do novo valor que "não valeu" o devolve (CON-07, 2026-11-24)
  const mudaPrazo = !!dados.nova_vigencia_fim || dados.tipo === 'Passou a prazo indeterminado';
  const antes = mudaPrazo ? { vigencia_fim_anterior: c.vigencia_fim || null, prazo_meses_anterior: c.prazo_meses || null, prazo_tipo_anterior: c.prazo_tipo || null } : {};
  const r = inserir(d, 'renovacoes', { contrato_id: c.id, ...dados, ...antes }, usuario, dados.tipo);
  const mud = {};
  if (dados.tipo === 'Passou a prazo indeterminado') mud.prazo_tipo = 'Indeterminado';
  if (dados.nova_vigencia_fim) {
    Object.assign(mud, { vigencia_fim: dados.nova_vigencia_fim, prazo_tipo: 'Determinado' });
    const meses = prazoDoContrato(d, c);
    if (meses > 0 && meses !== c.prazo_meses) mud.prazo_meses = meses;
  }
  if (Object.keys(mud).length) atualizar(d, 'contratos', c.id, mud, usuario, dados.tipo);
  if (dados.novo_valor > 0) {
    // o operador diz a partir de qual aluguel vale o novo valor (decisão do dono, 16/11/2026); sem o mês, vale o da data
    // (dia 1º) ou o seguinte. Ex.: data 01/12/2026 → aluguel de 12/2026; data 15/12/2026 → 01/2027
    const desde = valeDesdeDaRenovacao(dados);
    const vigencia = C.competenciaValida(dados.vale_desde, '') ? `${desde}-01` : dados.data;
    const anterior = aluguelAtual(d, c, C.somarDias(vigencia, -1));
    const pctAntes = percentualBonificacao(c);
    const pctNovo = dados.novo_percentual;
    const mudaPct = pctNovo !== null && pctNovo !== undefined && pctNovo !== pctAntes;
    inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: vigencia, indice: 'Negociado', renovacao_id: r.id,
      percentual: anterior ? C.percentualPorDesconto(anterior, dados.novo_valor - anterior) : 0,
      valor_anterior: anterior, valor_novo: dados.novo_valor, observacoes: dados.tipo,
      // a bonificação nova também só vale deste aluguel em diante: os boletos de antes continuam com a anterior
      ...(mudaPct ? { bonificacao_anterior: pctAntes, bonificacao_percentual: pctNovo } : {}) }, usuario, `Novo valor negociado: ${C.reais(dados.novo_valor)} a partir do aluguel de ${C.compBr(desde)}`);
    // bonificação combinada junto com o novo valor (cheio, bonificado e %, como no contrato): vale para o contrato
    if (mudaPct) {
      atualizar(d, 'contratos', c.id, { desconto_pontualidade_percentual: pctNovo, bonificacao: pctNovo > 0 }, usuario, `Bonificação passa a ${String(pctNovo).replace('.', ',')}% a partir do aluguel de ${C.compBr(desde)} (novo valor negociado)`);
    }
    // os boletos em aberto desse mês em diante passam ao novo valor (os de antes e os pagos ficam como estão)
    recalcularCobrancas(d, (cb) => cb.contrato_id === c.id && cb.competencia >= desde, usuario);
    // termo aditivo do novo valor (pedido do dono, 2026-11-13): fica aguardando a assinatura (o aceite), anexada depois em
    // "Termos aditivos"; o e-mail da etapa manda o termo para assinar
    const modelo = modelosDe(d, 'aditivo_valor')[0];
    const pctFinal = pctNovo !== null && pctNovo !== undefined ? pctNovo : percentualBonificacao(c);
    if (modelo) {
      inserir(d, 'aditivos', { contrato_id: c.id, imovel_id: c.imovel_id || null, tipo: TIPO_ADITIVO_VALOR, data: C.hojeIso() < dados.data ? C.hojeIso() : dados.data,
        data_vigencia: vigencia, valor_anterior: anterior, valor_novo: dados.novo_valor, percentual: pctFinal, renovacao_id: r.id, numero: proximoNumeroAditivo(d, c),
        testemunhas: [], modelo_id: modelo.id > 0 ? modelo.id : null, texto: modelo.texto, arquivo: null,
        assunto: `Novo valor do aluguel: ${C.reais(anterior)} → ${C.reais(dados.novo_valor)}, a partir de ${C.dataBr(vigencia)}` },
      usuario, `${c.inquilino_nome}: termo aditivo do novo valor gerado (aguardando o aceite assinado)`);
    }
  }
  return r;
}

/**
 * Mês do primeiro aluguel com o novo valor negociado: o informado (``vale_desde``) ou, sem ele, o da data quando ela é dia 1º
 * e o seguinte nos outros dias (o aluguel de um mês usa o valor vigente no dia 1º). Ex.: 15/12/2026 → 2027-01.
 */
export function valeDesdeDaRenovacao(dados) {
  const informado = C.competenciaValida(dados.vale_desde, '');
  if (informado) return informado;
  const data = String(dados.data || C.hojeIso());
  return data.slice(8, 10) === '01' ? data.slice(0, 7) : C.somarMeses(data.slice(0, 7), 1);
}

/** Termo aditivo do novo valor criado com a renovação (o aceite), ou null. */
export const aditivoDaRenovacao = (d, renovacaoId) => d.aditivos.find((a) => a.renovacao_id === renovacaoId && a.tipo === TIPO_ADITIVO_VALOR) || null;

/** Exclui um registro de renovação e o novo valor negociado que ele criou. O prazo do contrato não volta sozinho. */
export function excluirRenovacao(d, renovacaoId, usuario) {
  const r = buscar(d, 'renovacoes', renovacaoId);
  if (!r) throw new Error('Registro não encontrado.');
  // o termo do novo valor ainda sem assinatura sai junto; já assinado (aceite anexado), precisa ser excluído antes, à mão
  const termo = aditivoDaRenovacao(d, r.id);
  if (termo && (termo.arquivo || termo.assinado_em || termo.perdido_em)) throw new Error('O termo aditivo do novo valor já foi assinado: exclua o termo em "Termos aditivos" antes.');
  if (termo) excluir(d, 'aditivos', termo.id, usuario, 'Termo aditivo do novo valor excluído com a renovação');
  for (const x of d.correcoes.filter((y) => y.renovacao_id === r.id)) {
    // a bonificação que mudou com o novo valor volta a ser a de antes (se ninguém a mudou depois)
    const c = buscar(d, 'contratos', x.contrato_id);
    if (c && x.bonificacao_anterior !== undefined && x.bonificacao_anterior !== null && percentualBonificacao(c) === x.bonificacao_percentual) {
      atualizar(d, 'contratos', c.id, { desconto_pontualidade_percentual: x.bonificacao_anterior, bonificacao: x.bonificacao_anterior > 0 }, usuario, `Bonificação volta a ${String(x.bonificacao_anterior).replace('.', ',')}% (novo valor negociado excluído)`);
    }
    excluir(d, 'correcoes', x.id, usuario, 'Novo valor negociado excluído com a renovação');
  }
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
  // garantia em dinheiro que sai (decisão da direção, 2026-11-13): é devolvida ao inquilino com a poupança; a troca guarda os
  // depósitos um a um (para a correção) e fica o alerta "Devolver garantia" até registrar a devolução
  const devolver = (temCaucao(c) || temDeposito(c)) && valorGarantia(d, c) > 0 && (garantiaDepositada(c) || somaDepositos(d, c, temCaucao(c) ? 'caucao' : 'deposito') > 0);
  const r = inserir(d, 'trocas_garantia', { contrato_id: c.id, data: dados.data, tipo_anterior: c.garantia_tipo || '', tipo_novo: dados.garantia_tipo,
    ...(devolver ? { devolucao_movimentos: movimentosGarantia(d, c) } : {}),
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
  if (devolucaoDaTrocaDeGarantia(d, t.id)) throw new Error('A devolução da garantia anterior já foi registrada: exclua a devolução antes de cancelar a troca.');
  // depósito da garantia nova ficaria gravado e invisível, ligado a uma troca que não existe mais (2026-11-20)
  const deps = (d.depositos_garantia || []).filter((x) => x.troca_id === t.id);
  if (deps.length) throw new C.ErroUsuario(`A garantia nova já tem ${deps.length === 1 ? 'um depósito' : `${deps.length} depósitos`} (${deps.map((x) => `${C.reais(x.valor)} em ${C.dataBr(x.data)}`).join(', ')}): exclua ${deps.length === 1 ? 'o depósito' : 'os depósitos'} antes de cancelar a troca.`);
  const aplic = aplicacoesDo(d, t.contrato_id).filter((a) => String(a.data || '') >= t.data);
  if (aplic.length) throw new C.ErroUsuario(`A garantia nova já tem aplicação registrada (${aplic.map((a) => `${C.reais(a.valor)} em ${C.dataBr(a.data)}`).join(', ')}): exclua antes de cancelar a troca.`);
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

/**
 * Ajustes do mês lançados à mão no boleto (``cobrancas.ajustes``: [{ id, valor, motivo }], valor + cobrança adicional,
 * − ressarcimento). Pedido do dono de 24/11/2026: mais de um no mesmo boleto. O campo ``outros`` continua sendo o total
 * (ajustes + multas de notificação + diferenças presas), e ``outros_descricao`` os textos, nessa ordem.
 * Ex.: + R$ 80,00 (conserto da torneira), − R$ 150,00 (reforma do banheiro) e − R$ 30,00 (acerto da água) → outros = − R$ 100,00.
 */
const fixosDoBoleto = (cb) => [...(cb.multas_notificacao || []), ...(cb.diferencas_cobradas || [])];
const somaValores = (l) => l.reduce((s, e) => s + (e.valor || 0), 0);
export function ajustesDoBoleto(cb) {
  if (Array.isArray(cb.ajustes)) return cb.ajustes;
  // boleto de antes de 24/11/2026: um ajuste só, o que sobra do total depois das multas e diferenças
  const fixos = fixosDoBoleto(cb);
  const resto = (cb.outros || 0) - somaValores(fixos);
  if (!resto || ehBoletoAvulso(cb)) return [];
  const textos = new Set(fixos.map((e) => e.texto));
  const motivo = String(cb.outros_descricao || '').split('; ').filter((x) => x && !textos.has(x)).join('; ');
  return [{ id: 1, valor: resto, motivo }];
}

/** Partes do campo ``outros`` para o demonstrativo e a descrição do boleto: [{ texto, valor }] (cada ajuste, multa e diferença). */
export function partesDosOutros(cb) {
  if (!cb.outros && !(cb.ajustes || []).length) return [];
  if (ehBoletoAvulso(cb)) return cb.outros ? [{ texto: cb.outros_descricao || '', valor: cb.outros }] : [];
  const partes = [...ajustesDoBoleto(cb).map((a) => ({ texto: a.motivo, valor: a.valor })), ...fixosDoBoleto(cb).map((e) => ({ texto: e.texto, valor: e.valor }))];
  // conta que não fecha (boleto alterado à mão em "Alterar valores"): uma linha só, com o total
  return somaValores(partes) === (cb.outros || 0) ? partes.filter((p) => p.valor) : [{ texto: cb.outros_descricao || '', valor: cb.outros }];
}

function conferirAjustavel(cb) {
  if (!cb) throw new C.ErroUsuario('Boleto não encontrado.');
  if (cb.data_pagamento) throw new Error('Este boleto já foi pago. Desfaça o pagamento antes de ajustar.');
  if (emAcordo(cb)) throw new C.ErroUsuario(MOTIVO_EM_ACORDO(cb, 'não pode ser ajustado'));
  if (ehBoletoAvulso(cb)) throw new C.ErroUsuario('Este boleto não é o do aluguel do mês: não recebe ajuste.');
}

/** Grava a lista de ajustes: ``outros`` = ajustes + multas + diferenças; o boleto não pode ficar negativo. */
function gravarAjustes(d, cb, ajustes, usuario, texto) {
  const fixos = fixosDoBoleto(cb);
  const outros = somaValores(ajustes) + somaValores(fixos);
  const sem = totais({ ...cb, outros: 0 }).total_sem_desconto;
  if (sem + outros < 0) {
    throw new C.ErroUsuario(`Os ressarcimentos (${C.reais(-somaValores(ajustes.filter((a) => a.valor < 0)))}) passam do boleto sem ajuste (${C.reais(sem)}): a sobra de ${C.reais(-(sem + outros))} não iria para lugar nenhum. Lance no máximo o valor do boleto aqui e o resto no boleto seguinte (ou devolva ao inquilino).`);
  }
  const descricao = [...ajustes.map((a) => a.motivo), ...fixos.map((e) => e.texto)].filter(Boolean).join('; ');
  atualizar(d, 'cobrancas', cb.id, { ajustes, outros, outros_descricao: descricao }, usuario, texto);
  const contrato = buscar(d, 'contratos', cb.contrato_id);
  if (contrato) realocarReserva(d, contrato, usuario); // o total do boleto mudou: a reserva acompanha
  return cb;
}

/** Acrescenta um ajuste ao boleto (valor + cobrança adicional, − ressarcimento). O motivo é obrigatório (fica no histórico). */
export function adicionarAjuste(d, cobrancaId, valor, motivo, usuario) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  conferirAjustavel(cb);
  const m = String(motivo || '').trim().replace(/;\s*/g, ', ');
  if (!valor) throw new C.ErroUsuario('Informe o valor do ajuste.');
  if (!m) throw new C.ErroUsuario('Informe o motivo do ajuste (fica no histórico).');
  const atuais = ajustesDoBoleto(cb);
  const id = atuais.reduce((x, a) => Math.max(x, a.id || 0), 0) + 1;
  return gravarAjustes(d, cb, [...atuais, { id, valor, motivo: m }], usuario,
    `${valor < 0 ? 'Ressarcimento' : 'Cobrança adicional'} de ${C.reais(Math.abs(valor))} no boleto ${C.compBr(cb.competencia)}: ${m}`);
}

/** Tira um ajuste do boleto (as multas de notificação e as diferenças presas continuam). */
export function retirarAjuste(d, cobrancaId, ajusteId, usuario) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  conferirAjustavel(cb);
  const atuais = ajustesDoBoleto(cb);
  const a = atuais.find((x) => x.id === Number(ajusteId));
  if (!a) throw new C.ErroUsuario('Este ajuste já foi retirado.');
  return gravarAjustes(d, cb, atuais.filter((x) => x !== a), usuario,
    `Ajuste do boleto ${C.compBr(cb.competencia)} retirado: ${a.valor < 0 ? 'ressarcimento' : 'cobrança adicional'} de ${C.reais(Math.abs(a.valor))} (${a.motivo})`);
}

/**
 * Troca todos os ajustes do boleto por um só (valor 0: tira todos). Multas de notificação e diferenças presas ficam.
 * Ex.: ``ajustarBoleto(d, id, -15000, 'Reforma do banheiro')`` → um ressarcimento de R$ 150,00.
 */
export function ajustarBoleto(d, cobrancaId, valor, motivo, usuario) {
  const cb = buscar(d, 'cobrancas', cobrancaId);
  conferirAjustavel(cb);
  const m = String(motivo || '').trim().replace(/;\s*/g, ', ');
  const texto = valor ? `${valor < 0 ? 'Ressarcimento' : 'Cobrança adicional'} de ${C.reais(Math.abs(valor))} no boleto ${C.compBr(cb.competencia)}${m ? `: ${m}` : ''}`
    : `Ajuste do boleto ${C.compBr(cb.competencia)} retirado`;
  return gravarAjustes(d, cb, valor ? [{ id: 1, valor, motivo: m }] : [], usuario, texto);
}

/**
 * Boletos ainda a cobrar do contrato (``aCobrar``): os que estão em acordo ficam de fora (valem as parcelas do acordo, que
 * entram), a carência também, e o complemento da caução, que é garantia e nunca entrou nela (não se desconta da caução).
 */
export const cobrancasEmAberto = (d, contratoId) => d.cobrancas.filter((cb) => cb.contrato_id === contratoId && aCobrar(cb) && !ehComplementoCaucao(cb) && !ehSaldoSaida(cb));

/**
 * Débitos de aluguel da saída (cálculo final e devolução da garantia na troca de titular), na ``data``: cada boleto a cobrar
 * (``cobrancasEmAberto``) pelo valor do dia: vencido = cheio + multa + juros até a data (``C.liquidar``); ainda não vencido = o
 * valor em dia (com a bonificação). Ex.: aluguel de R$ 2.000,00 (R$ 1.800,00 em dia) que vence 10/12 e saída em 15/11 → R$ 1.800,00;
 * dois aluguéis em acordo de R$ 4.200,00 → só as parcelas do acordo (R$ 4.200,00), nunca os dois boletos de novo.
 * Devolve { itens: [{ cobranca, valor, texto }], total }.
 */
/**
 * Multa da saída antes do fim do contrato (cláusula do modelo: 3 aluguéis, proporcional ao tempo que falta), só como
 * sugestão para o cálculo final (o operador inclui ou dispensa; a lei dispensa na transferência pelo empregador, art. 4º).
 * Proporção pelos dias que faltam do prazo; aluguel cheio vigente na saída. Sem prazo determinado, troca de titular ou saída
 * no fim: null. Ex.: aluguel R$ 2.000,00, contrato de 01/01/2026 a 01/07/2028 (30 meses), saída em 01/09/2027 (faltam 10)
 * → R$ 6.000,00 × 304/912 dias = R$ 2.000,00. Novo titular (troca de titular, decisão do dono de 2026-11-24, CON-04): o prazo
 * não recomeça, a proporção é pelo prazo do contrato original (início do primeiro da cadeia, fim por `fimDoContrato`, que já
 * vale a renovação do novo titular). Ex.: mesmo contrato, troca em 01/01/2027 e saída em 01/01/2028 → R$ 6.000,00 × 182/912 =
 * R$ 1.197,37. Devolve { valor, aluguel, inicio, fim, restam, total, herdado }.
 */
export function multaSaidaAntecipada(d, c) {
  if (!c || !c.data_saida || c.prazo_tipo === 'Indeterminado' || fimDeVinculo(d, c)) return null;
  const original = (c.contrato_anterior_id && cadeiaDeContratos(d, c).antes[0]) || c;
  const inicio = original.data_entrada || original.vigencia_inicio || c.data_entrada || c.vigencia_inicio;
  const fim = fimDoContrato(d, c);
  if (!inicio || !fim || c.data_saida >= fim || c.data_saida < inicio) return null;
  const total = C.diasEntre(inicio, fim);
  const restam = C.diasEntre(c.data_saida, fim);
  const aluguel = aluguelAtual(d, c, c.data_saida);
  if (!(total > 0) || !(aluguel > 0)) return null;
  return { valor: Math.round((3 * aluguel * restam) / total), aluguel, inicio, fim, restam, total, herdado: original !== c };
}

/** Nome do boleto na lista de débitos do cálculo final ("Aluguel 10/2026", "Parcela 2/3 do acordo (vence 10/12/2026)"). */
const nomeDebitoSaida = (cb) => (ehParcelaAcordo(cb) ? `Parcela ${cb.acordo_parcela || 'única'} do acordo (vence ${C.dataBr(cb.vencimento)})` : `Aluguel ${C.compBr(cb.competencia)}`);

export function debitosDaSaida(d, c, data = C.hojeIso()) {
  const itens = cobrancasEmAberto(d, c.id).sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || '')).map((cb) => {
    const venceu = C.vencido(cb.vencimento, data);
    const l = venceu ? C.liquidar(cb, data) : null;
    const valor = venceu ? l.valor_devido : totais(cb).a_pagar_pontual;
    const nome = nomeDebitoSaida(cb);
    const conta = venceu && (l.multa || l.juros) ? ` (com multa de ${C.reais(l.multa)} e juros de ${C.reais(l.juros)} até ${C.dataBr(data)})` : !venceu ? ' (ainda não venceu: valor em dia)' : '';
    return { cobranca: cb, valor, texto: `${nome} em aberto: ${C.reais(valor)}${conta}` };
  }).filter((x) => x.valor > 0);
  // o que esperava "o próximo boleto" e não tem mais boleto (a saída ou a troca de titular encerra a cobrança): a diferença de um
  // pagamento em parte antigo e a multa de notificação. Ex.: pagou R$ 1.100,00 de R$ 1.500,00 → "Diferença do boleto 10/2026 … R$ 400,00"
  for (const cb of d.cobrancas.filter((x) => x.contrato_id === c.id && diferencaPendente(d, x)).sort((a, b) => a.competencia.localeCompare(b.competencia))) {
    itens.push({ cobranca: null, valor: cb.diferenca_devida, texto: `${textoDiferenca(cb)}, ainda não cobrada: ${C.reais(cb.diferenca_devida)}` });
  }
  for (const n of (d.notificacoes || []).filter((x) => x.contrato_id === c.id && x.multa_valor > 0 && (!x.multa_cobranca_id || !buscar(d, 'cobrancas', x.multa_cobranca_id)))) {
    itens.push({ cobranca: null, valor: n.multa_valor, texto: `${textoMultaNotificacao(n)}, ainda não cobrada: ${C.reais(n.multa_valor)}` });
  }
  return { itens, total: itens.reduce((s, x) => s + x.valor, 0) };
}

/** O boleto que recebe a diferença (o mesmo de ``aplicarDiferencasPendentes``): o próximo aluguel a cobrar do contrato, ainda não emitido no banco; null se ainda não foi gerado. */
export const proximoBoletoAberto = (d, cb) => d.cobrancas.filter((x) => x.contrato_id === cb.contrato_id && x.id !== cb.id && x.competencia > cb.competencia && !ehBoletoAvulso(x) && aCobrar(x) && !emitidoNoBanco(x))
  .sort((a, b) => a.competencia.localeCompare(b.competencia) || a.id - b.id)[0] || null;

// Pix (ou boleto) pago depois do vencimento com o valor do desconto: de 16/11 a 19/11/2026 ficava pago e a diferença ia ao próximo
// boleto (``diferenca_devida``, os dados antigos continuam assim); desde 2026-11-20 é recusado como qualquer pagamento a menos.

/**
 * Cálculo final da saída: garantia corrigida pelo índice informado (ex.: poupança) menos os débitos. O FCI corrigido paga só
 * os reparos de danos (nunca aluguel ou contas): o que sobra dele volta ao inquilino e o dano que passar do FCI vira débito.
 * Ex.: FCI R$ 1.200,00 e danos R$ 800,00 → usa R$ 800,00 e devolve R$ 400,00; danos de R$ 1.500,00 → R$ 300,00 vão para os débitos.
 */
export function calcularEncerramento(garantia, indicePercentual, debitos, fci = 0, danos = 0, creditos = 0) {
  const corrigida = C.arred((garantia || 0) * (1 + (indicePercentual || 0) / 100));
  const fciUsado = Math.min(fci || 0, danos || 0);
  const fciDevolver = (fci || 0) - fciUsado;
  const danosAlemDoFci = (danos || 0) - fciUsado;
  // créditos do inquilino (ressarcimento do condomínio sem boleto onde abater, decisão do dono de 24/11/2026): somam ao saldo.
  // Ex.: garantia R$ 3.000,00 e crédito de R$ 50,00 → R$ 3.050,00; sem garantia, débitos R$ 300,00 e crédito R$ 50,00 → −R$ 250,00
  return { garantia_corrigida: corrigida, fci_usado: fciUsado, fci_devolver: fciDevolver, saldo: corrigida + fciDevolver - (debitos || 0) - danosAlemDoFci + (creditos || 0) };
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
export const CAMPOS_PESSOA = ['inquilino_tipo', 'inquilino_nome', 'inquilino_apelido', 'inquilino_telefone', 'inquilino_whatsapp', 'inquilino_email',
  'inquilino_cpf', 'inquilino_rg', 'responsavel_nome', 'responsavel_telefone', 'responsavel_email',
  'representante_nome', 'representante_cpf', 'representante_rg', 'representante_cargo', 'representante_telefone', 'representante_email',
  'solidario_nome', 'solidario_cpf', 'solidario_rg', 'solidario_telefone', 'solidario_email',
  ...['inquilino_', 'representante_', 'solidario_'].flatMap((p) => ['genero', 'nacionalidade', 'estado_civil', 'profissao', 'nascimento', 'endereco'].map((k) => p + k))];
/** Condições do contrato que servem de ponto de partida para o contrato no outro imóvel (são conferidas depois). */
const CAMPOS_CONDICOES = ['prazo_tipo', 'prazo_meses', 'renovacao_automatica', 'indice_correcao', 'aluguel_inicial', 'dia_vencimento',
  'cobranca_mes_seguinte', 'bonificacao', 'desconto_pontualidade_percentual', 'taxa_boleto', 'nao_cobrar_tarifa', 'multa_percentual', 'juros_mensal_percentual',
  'cobrar_iptu', 'cobrar_seguro', 'conta_iptu', 'conta_seguro', 'fci_percentual', 'fci_indice', 'gerar_nf', 'garantia_tipo', 'finalidade', 'atividade', 'perfil_regras_id'];

/** Dados da pessoa (sem as condições do contrato): a mesma pessoa alugando outro imóvel começa um contrato novo com eles. */
export const dadosDaPessoa = (c) => Object.fromEntries(CAMPOS_PESSOA.filter((k) => c[k] !== undefined && c[k] !== null).map((k) => [k, c[k]]));

/**
 * Condições do contrato anterior, para quem continua o contrato dele (ex.: troca de titular): prazo, índice, vencimento,
 * bonificação, multa e juros, contas, garantia e finalidade. O aluguel é o atual do anterior.
 */
export function condicoesDoContrato(d, anterior, data = null) {
  const contas = ['conta_agua', 'conta_energia', 'conta_gas', 'conta_condominio', 'conta_internet'];
  const out = Object.fromEntries([...CAMPOS_CONDICOES, ...contas].filter((k) => anterior[k] !== undefined && anterior[k] !== null && anterior[k] !== '').map((k) => [k, anterior[k]]));
  // aluguel cheio vigente na véspera da troca (sem data: o de hoje)
  out.aluguel_inicial = aluguelAtual(d, anterior, data ? C.somarDias(data, -1) : C.hojeIso());
  // aluguel com bonificação sobre o aluguel atual (o % do contrato continua)
  if (anterior.bonificacao !== false && percentualBonificacao(anterior) > 0) out.aluguel_bonificado = out.aluguel_inicial - C.descontoPorPercentual(out.aluguel_inicial, percentualBonificacao(anterior));
  // reserva dada na visita: é do contrato (o que o anterior já usou é descontado ao salvar)
  for (const k of ['reserva_valor', 'reserva_data', 'reserva_competencia']) if (anterior[k]) out[k] = anterior[k];
  // o reajuste continua no aniversário do contrato original
  out.data_base_correcao = dataBaseCorrecao(anterior);
  return out;
}

/** Outros contratos ativos da mesma pessoa (pelo CPF/CNPJ, ou pelo nome quando não há documento). */
export function outrosContratosDaPessoa(d, c, hoje = C.hojeIso()) {
  const doc = String(c.inquilino_cpf || '').replace(/\D/g, '');
  return d.contratos.filter((x) => x.id !== c.id && contratoAtivo(x, hoje) && (doc
    ? String(x.inquilino_cpf || '').replace(/\D/g, '') === doc
    : x.inquilino_nome.trim().toLocaleLowerCase('pt-BR') === c.inquilino_nome.trim().toLocaleLowerCase('pt-BR')));
}


/** Data em que o contrato sem imóvel será apagado (ex.: sem imóvel desde 10/10 → apagado em 17/10), ou null. */
export function dataApagarSemImovel(c) {
  return !c.imovel_id && c.sem_imovel_desde ? C.somarDias(c.sem_imovel_desde, CR.regra('dias_sem_imovel')) : null;
}

/** Contratos sem imóvel há 7 dias ou mais e sem boleto: são apagados ao abrir o sistema. */
export function contratosSemImovelVencidos(d, hoje = C.hojeIso()) {
  return d.contratos.filter((c) => { const data = dataApagarSemImovel(c); return data && data <= hoje && !d.cobrancas.some((x) => x.contrato_id === c.id); });
}

// --------------------------------------------------------------------------
// Fichas em análise (pedido do dono, 2026-11-09): o interessado manda os dados, a reserva e os documentos; a equipe analisa
// e aprova ou reprova. Aprovada, vira o contrato (Novo contrato já preenchido). Uma ficha pode ser para vários imóveis
// (só um deles, ou todos juntos), mas cada imóvel tem no máximo uma ficha aberta. Reprovada: a reserva é devolvida (data e
// comprovante) e os documentos pessoais são apagados 3 meses depois da decisão.
// --------------------------------------------------------------------------
export const MODOS_FICHA = ['Apenas um dos imóveis', 'Todos juntos'];
/** Campos de arquivo da ficha ligados a um lançamento (os demais documentos ficam soltos na pasta da ficha). */
export const CAMPOS_ARQUIVO_FICHA = ['comprovante_reserva', 'comprovante_devolucao', 'analise_serasa'];
/** Comprovantes de dinheiro da ficha: ficam mesmo depois de apagados os documentos pessoais da reprovada. */
export const COMPROVANTES_DINHEIRO_FICHA = ['comprovante_reserva', 'comprovante_devolucao'];
/** Proposta combinada na ficha (aluguel, vencimento, bonificação, garantia, prazo e o que está incluso): vai preenchida para cada contrato feito dela. */
export const CAMPOS_PROPOSTA_FICHA = ['aluguel_inicial', 'dia_vencimento', 'bonificacao', 'desconto_pontualidade_percentual', 'garantia_tipo', 'prazo_meses',
  'conta_iptu', 'conta_seguro', 'conta_agua', 'conta_energia', 'conta_gas', 'conta_internet', 'conta_condominio'];

/**
 * Documentos de renda conforme o tipo de renda da ficha (pedido do dono, 2026-11-14: cada interessado vê só a lista dele).
 * As chaves são as opções de "Tipo de renda" (RENDAS_FICHA, formularios.js; tests/fichas.test.mjs confere as duas listas).
 */
export const DOCUMENTOS_RENDA = {
  'Empregado (CLT)': ['3 últimos holerites', 'Carteira de trabalho digital (a página do contrato atual), baixada do aplicativo do governo'],
  'Servidor público': ['3 últimos contracheques, baixados do portal do órgão'],
  'Autônomo / profissional liberal': ['Extratos bancários dos 3 últimos meses, baixados em PDF do aplicativo do banco', 'Declaração do Imposto de Renda completa, com o recibo de entrega'],
  'Empresário / sócio': ['Pró-labore dos 3 últimos meses ou declaração do Imposto de Renda completa, com o recibo de entrega', 'Contrato social da empresa'],
  'Aposentado / pensionista': ['Extrato do benefício dos 3 últimos meses, baixado do Meu INSS (ou do órgão que paga)'],
  Outra: ['Comprovante da renda dos 3 últimos meses (explique a origem da renda)'],
};
/** Aviso junto da lista de documentos: arquivo original da fonte, conferido com ela (pedido do dono, 2026-11-14). */
export const DICA_DOCUMENTOS = 'Mande os arquivos em PDF como saem do aplicativo do banco, do empregador ou do site do governo (não foto de tela nem arquivo editado): os documentos podem ser conferidos diretamente com a fonte.';
const PJ = 'Pessoa jurídica (empresa)';
const casadoOuUniao = (estado) => ['Casado(a)', 'União estável'].includes(estado);
/** Interessado (pessoa física) casado ou em união estável: a ficha pede os dados e os documentos do cônjuge. */
export const fichaComConjuge = (f) => f.inquilino_tipo !== PJ && casadoOuUniao(f.inquilino_estado_civil);

/** Partes da lista de documentos da pessoa física (a página da ficha pela internet monta a lista com elas, conforme o que a pessoa escolhe). */
export const PARTES_DOCUMENTOS_PF = {
  inicio: ['Documento com foto e CPF (RG ou CNH)'],
  conjuge: ['Certidão de casamento ou declaração de união estável', 'Documento com foto e CPF do cônjuge ou companheiro(a)'],
  renda_padrao: ['Comprovante de renda dos 3 últimos meses'],
  fim: ['Comprovante de residência atual (conta de água, energia ou telefone)'],
};

/** Documentos que o interessado manda com a ficha. Ex.: CLT solteiro → documento com foto, 3 holerites, carteira digital, residência. */
export function documentosDaFicha(f) {
  if (f.inquilino_tipo === PJ) {
    return ['Contrato social e a última alteração', 'Cartão do CNPJ', 'Documento com foto e CPF do representante',
      'Faturamento dos 3 últimos meses (extratos bancários da empresa em PDF ou declaração do contador)', 'Comprovante de endereço da empresa'];
  }
  const p = PARTES_DOCUMENTOS_PF;
  return [...p.inicio, ...(fichaComConjuge(f) ? p.conjuge : []), ...(DOCUMENTOS_RENDA[f.renda_tipo] || p.renda_padrao), ...p.fim];
}

/** Fiador casado com separação total de bens por pacto antenupcial: o cônjuge não precisa assinar a fiança (CC art. 1.647). */
export const separacaoTotal = (x = {}) => /^Separação total/.test(x.regime_bens || '');

/** Documentos do fiador (``x``: os dados dele, sem o prefixo fiadorN_). Casado: também os do cônjuge, que assina a fiança. */
export const documentosDoFiador = (x = {}) => ['Documento com foto e CPF', 'Comprovante de renda dos 3 últimos meses', 'Comprovante de residência atual',
  'Matrícula atualizada (de até 30 dias) de um imóvel em nome dele',
  ...(casadoOuUniao(x.estado_civil) && separacaoTotal(x) ? ['Certidão de casamento com a anotação do pacto antenupcial (separação total de bens)']
    : casadoOuUniao(x.estado_civil) ? ['Certidão de casamento ou declaração de união estável', 'Documento com foto e CPF do cônjuge ou companheiro(a), que também assina a fiança']
    : !x.estado_civil ? ['Se for casado ou viver em união estável: a certidão e o documento com foto e CPF do cônjuge ou companheiro(a), que também assina a fiança'] : [])];

/** Quantos fiadores a ficha comporta (campos fiador1_…, fiador2_…, os mesmos nomes do Novo contrato). */
export const VAGAS_FIADOR_FICHA = 2;
/** Dados do fiador ``n`` da ficha, sem o prefixo (ex.: { nome, cpf, estado_civil, ... }). */
export function fiadorDaFicha(f, n) {
  const p = `fiador${n}_`;
  return Object.fromEntries(Object.entries(f).filter(([k]) => k.startsWith(p)).map(([k, v]) => [k.slice(p.length), v]));
}
/** Fiadores preenchidos na ficha: [{ n, ...dados }] (só os que têm nome). */
export const fiadoresDaFicha = (f) => Array.from({ length: VAGAS_FIADOR_FICHA }, (_, k) => ({ n: k + 1, ...fiadorDaFicha(f, k + 1) })).filter((x) => x.nome);

/** Imóveis da ficha que já têm contrato feito a partir dela: { imovel_id: contrato_id }. */
export function contratosDaFicha(d, f) {
  const out = {};
  for (const c of d.contratos) if (c.ficha_id === f.id && c.imovel_id) out[c.imovel_id] = c.id;
  return out;
}

/** Imóveis que ainda podem virar contrato desta ficha aprovada ("apenas um": nenhum depois do primeiro contrato). */
export function imoveisParaContrato(d, f) {
  if (f.situacao !== 'Aprovada') return [];
  const feitos = contratosDaFicha(d, f);
  if (f.modo_imoveis !== 'Todos juntos' && Object.keys(feitos).length) return [];
  // imóvel excluído depois (dado antigo: a exclusão hoje é barrada com a ficha aberta) não fica como contrato por fazer
  return (f.imoveis_ids || []).filter((id) => !feitos[id] && buscar(d, 'imoveis', id));
}

/** Ficha ainda aberta: em análise, ou aprovada com contrato por fazer. Ocupa os imóveis dela. */
export const fichaAberta = (d, f) => f.situacao === 'Em análise' || (f.situacao === 'Aprovada' && imoveisParaContrato(d, f).length > 0);

/** Outra ficha aberta para o imóvel (cada imóvel tem no máximo uma). */
export const fichaAbertaDoImovel = (d, imovelId, excetoId = null) => (d.fichas || []).find((f) => f.id !== excetoId && fichaAberta(d, f) && (f.imoveis_ids || []).includes(Number(imovelId))) || null;

/**
 * Ficha encerrada sem contrato: reprovada ou desistência ("Desistiu", pedido do dono, 2026-11-13: o interessado desistiu antes
 * de assinar). A reserva volta por inteiro (decisão de 2026-11-12) e os documentos pessoais saem depois do prazo.
 * As situações da ficha: Em análise, Aprovada, Reprovada, Desistiu.
 */
export const fichaSemContrato = (f) => f.situacao === 'Reprovada' || f.situacao === 'Desistiu';

/** Reserva de ficha reprovada (ou com desistência) que ainda não teve a devolução registrada. */
// com o termo aceito, a reserva retida por inteiro não fica "a devolver" (devolucaoDaReserva, mais abaixo)
export const devolucaoPendente = (f) => fichaSemContrato(f) && f.reserva_valor > 0 && !f.devolucao_data && devolucaoDaReserva(f).devolver > 0;

// --------------------------------------------------------------------------
// Termo de aceite da reserva (decisões do dono de 2026-11-24): antes do depósito, o interessado lê as condições e aceita pelo
// link (código no e-mail). O aceite guarda as condições do dia (`aceite_reserva.condicoes`): mudar as regras depois não muda
// o que a pessoa aceitou. Reprovada: devolve tudo. Desistência até `dias_arrependimento` dias do depósito (padrão 0: nenhum):
// devolve tudo; depois, a empresa fica com `retencao_pct` (padrão 100%, arras penitenciais, CC arts. 418 e 420; decisão do dono de
// 2026-11-24). Informação ou documento que não corresponde à realidade na conferência conta como desistência
// (`reprovada_conferencia`). A reserva é sempre abatida do 1º aluguel (competenciaReserva: em branco = mês de entrada).
// --------------------------------------------------------------------------
/** Condições da reserva pelas regras de agora (Sistema → Regras do sistema, grupo "Reserva e termo de aceite"). */
export const condicoesDaReservaAgora = () => ({
  retencao_pct: CR.regra('reserva_retencao_pct'), dias_arrependimento: CR.regra('reserva_dias_arrependimento'),
  dias_uteis_documentos: CR.regra('reserva_dias_uteis_documentos'), dias_validade: CR.regra('reserva_dias_validade'),
  dias_uteis_devolucao: CR.regra('reserva_dias_uteis_devolucao'),
});
/** Condições da ficha: as do termo aceito ou, sem aceite, as de agora. */
export const condicoesDaReserva = (f) => ({ ...condicoesDaReservaAgora(), ...(((f && f.aceite_reserva) || {}).condicoes || {}) });
/** Valor da reserva da ficha: o depositado ou, antes do depósito, o combinado no termo. */
export const valorDaReserva = (f) => (f.reserva_valor > 0 ? f.reserva_valor : f.reserva_combinada > 0 ? f.reserva_combinada : 0);
/** Quanto a empresa fica numa desistência depois do prazo. Ex.: R$ 500,00 com 40% → R$ 200,00. */
export const retencaoDaReserva = (valor, pct) => Math.round((valor || 0) * (Number(pct) || 0) / 100);

/**
 * Prazos contados do depósito da reserva (null sem a data do depósito). Ex.: depósito na quinta, 10/12/2026 → documentos até
 * 15/12/2026 (3 dias úteis) e reservado até 17/12/2026 (7 dias); desistência com tudo de volta até 17/12/2026 com 7 dias na regra,
 * ou nenhuma (arrependimento_ate null) com 0 dias, o padrão.
 */
export function prazosDaReserva(f) {
  if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(String(f.reserva_data || ''))) return null;
  const c = condicoesDaReserva(f);
  return { documentos_ate: C.somarDiasUteis(f.reserva_data, c.dias_uteis_documentos), vale_ate: C.somarDias(f.reserva_data, c.dias_validade),
    arrependimento_ate: c.dias_arrependimento > 0 ? C.somarDias(f.reserva_data, c.dias_arrependimento) : null };
}

/**
 * Quanto devolver da reserva: { reserva, devolver, reter, integral, motivo }. ``data``: o dia da desistência (padrão: o da
 * decisão; ficha ainda aberta: hoje, para mostrar "se desistir hoje"). Sem o termo aceito, devolve tudo (a pessoa não aceitou
 * a retenção). Ex.: reserva de R$ 500,00 com 100% e 0 dias → desistência em qualquer dia depois do depósito: devolve R$ 0,00 e
 * fica R$ 500,00; com 40% e 7 dias, depósito em 10/12/2026 e desistência em 20/12/2026 → devolve R$ 300,00, fica R$ 200,00.
 */
export function devolucaoDaReserva(f, { data = null, hoje = C.hojeIso() } = {}) {
  const reserva = f && f.reserva_valor > 0 ? f.reserva_valor : 0;
  const tudo = (motivo) => ({ reserva, devolver: reserva, reter: 0, integral: true, motivo });
  if (!reserva) return { reserva: 0, devolver: 0, reter: 0, integral: true, motivo: 'sem reserva' };
  if (!f.aceite_reserva) return tudo('sem o termo de aceite da reserva: devolve tudo');
  if (f.situacao === 'Reprovada' && !f.reprovada_conferencia) return tudo('ficha não aprovada: devolve tudo');
  const c = condicoesDaReserva(f);
  const quando = data || (fichaSemContrato(f) ? f.decisao_data : null) || hoje;
  const prazos = prazosDaReserva(f);
  if (prazos && prazos.arrependimento_ate && quando <= prazos.arrependimento_ate) return tudo(`desistência em até ${c.dias_arrependimento} dias do depósito: devolve tudo`);
  const reter = Math.min(retencaoDaReserva(reserva, c.retencao_pct), reserva);
  const porque = f.situacao === 'Reprovada' ? 'informação ou documento que não correspondeu à realidade na conferência (conta como desistência)' : 'desistência';
  const prazo = c.dias_arrependimento > 0 ? ` depois de ${c.dias_arrependimento} dias do depósito` : '';
  return { reserva, devolver: reserva - reter, reter, integral: reter === 0,
    motivo: `${porque}${prazo}: a empresa fica com ${reter >= reserva ? 'a reserva inteira' : C.pct(c.retencao_pct)} (${C.reais(reter)}), como no termo aceito em ${C.dataBr(String(f.aceite_reserva.em).slice(0, 10))}` };
}

/** Último dia para devolver a reserva (reprovada ou desistência): a decisão mais os dias úteis do termo. */
export const devolverReservaAte = (f) => (fichaSemContrato(f) && f.decisao_data ? C.somarDiasUteis(f.decisao_data, condicoesDaReserva(f).dias_uteis_devolucao) : null);

/** Ficha sem os documentos marcados como recebidos (pessoais, renda e residência). */
export const fichaSemDocumentos = (f) => !(f.doc_pessoais && f.doc_renda && f.doc_residencia);

/**
 * Guarda na ficha o aceite que veio do link (nuvem/aceite-reserva.mjs). Só a primeira vez de cada aceite (pelo instante):
 * devolve true se mudou.
 */
export function guardarAceiteReserva(d, fichaId, resposta, usuario) {
  const f = buscar(d, 'fichas', fichaId);
  if (!f || !resposta || !resposta.em) return false;
  if (f.aceite_reserva && f.aceite_reserva.em === resposta.em) return false;
  const campos = ['em', 'email', 'canal', 'ip', 'aparelho', 'assinatura', 'texto_aceito', 'texto_sha256', 'condicoes', 'reserva_valor', 'comprovante_em'];
  const aceite = Object.fromEntries(campos.filter((k) => resposta[k] !== undefined && resposta[k] !== null && resposta[k] !== '').map((k) => [k, resposta[k]]));
  atualizar(d, 'fichas', f.id, { aceite_reserva: aceite }, usuario,
    `Ficha de ${f.inquilino_nome}: termo de aceite da reserva aceito pelo link em ${C.dataHoraBr(resposta.em)} (e-mail ${resposta.email} confirmado pelo código)`);
  return true;
}

/**
 * Dia de onde contam os meses para apagar os dados da ficha reprovada (ou com desistência): a decisão ou, com reserva a devolver,
 * a devolução (decisão do dono de 2026-11-24, FIC-03: sem os dados não há como fazer o Pix de volta). Reserva ainda por devolver:
 * null (não apaga). Ex.: reprovada em 10/08/2026, reserva de R$ 500,00 devolvida em 05/10/2026 → conta de 05/10/2026.
 */
export const inicioPrazoApagarFicha = (f) => {
  if (!fichaSemContrato(f) || !f.decisao_data || devolucaoPendente(f)) return null;
  return f.devolucao_data && f.devolucao_data > f.decisao_data ? f.devolucao_data : f.decisao_data;
};

/** Ficha reprovada (ou com desistência) que espera a devolução da reserva para ter os dados apagados. */
export const apagarFichaEsperaDevolucao = (f) => fichaSemContrato(f) && !!f.decisao_data && !f.dados_apagados_em && devolucaoPendente(f);

/** Data em que os documentos da ficha reprovada (ou com desistência) são apagados (3 meses depois da decisão ou da devolução da reserva), ou null. */
export const dataApagarDocumentosFicha = (f) => (inicioPrazoApagarFicha(f) && !f.documentos_apagados_em ? C.somarMesesData(inicioPrazoApagarFicha(f), CR.regra('meses_documentos_ficha')) : null);

/**
 * Campos da ficha reprovada (ou com desistência) que ficam depois do prazo (LGPD: guardar só o necessário): o nome, as datas, a
 * situação e o motivo, a proposta (valores do imóvel, não da pessoa), as ligações (ids) e o dinheiro da reserva com os comprovantes.
 */
const FICHA_FICA = new Set(['id', 'inquilino_nome', 'inquilino_tipo', 'situacao', 'decisao_data', 'decisao_por', 'decisao_motivo', 'data_recebida',
  'imoveis_ids', 'modo_imoveis', 'pasta', 'documentos_apagados_em', 'reprovada_conferencia', 'link_aceite', 'dados_apagados_em', 'historico_limpo_em', 'documentos_no_contrato', 'criado_em', 'criado_por', 'alterado_em', 'alterado_por',
  ...COMPROVANTES_DINHEIRO_FICHA, ...CAMPOS_PROPOSTA_FICHA]);
const fichaFica = (k) => FICHA_FICA.has(k) || /^(reserva|devolucao)_/.test(k) || /_ids?$/.test(k);

/**
 * Apaga os dados pessoais da ficha reprovada (ou com desistência), no mesmo prazo dos documentos (regra `meses_documentos_ficha`):
 * CPF, RG, renda, endereço, contatos, fiadores e o que mais a pessoa informou saem da ficha, das linhas do histórico dela e dos
 * e-mails registrados para ela (o endereço de e-mail). Ficam o nome, as datas, a situação e o motivo e a reserva com os comprovantes.
 * Na nuvem, a faxina diária do servidor limpa depois o histórico guardado lá (esquecerFichasApagadas em nuvem/cofre.mjs, que
 * marca `historico_limpo_em`). Devolve a ficha.
 */
export function apagarDadosPessoaisDaFicha(d, fichaId, usuario, hoje = C.hojeIso()) {
  const f = buscar(d, 'fichas', fichaId);
  if (!f) throw new C.ErroUsuario('Ficha não encontrada.');
  if (!fichaSemContrato(f)) throw new C.ErroUsuario('Só a ficha reprovada ou com desistência tem os dados pessoais apagados.');
  // reserva com parte retida: o termo aceito fica, como prova do combinado (LGPD, art. 16, I, e art. 7º, VI)
  const retida = f.devolucao_valor > 0 && f.devolucao_valor < (f.reserva_valor || 0);
  // de onde contaram os meses (lido antes de apagar): a decisão ou a devolução da reserva (FIC-03)
  const desde = inicioPrazoApagarFicha(f) && inicioPrazoApagarFicha(f) !== f.decisao_data ? 'devolução da reserva' : 'decisão';
  const saem = Object.keys(f).filter((k) => !fichaFica(k) && !(retida && k === 'aceite_reserva') && f[k] !== null && f[k] !== undefined && f[k] !== '');
  for (const k of saem) f[k] = null;
  f.dados_apagados_em = hoje;
  // e-mails mandados para a pessoa: sai o endereço
  const emails = new Set();
  for (const e of d.envios_email || []) if (e.ficha_id === f.id && e.para) { emails.add(e.para); e.para = null; }
  const limparTexto = (t) => [...emails].reduce((s, x) => s.split(x).join('(apagado)'), String(t));
  const limparDetalhes = (det) => (det && typeof det === 'object' && !Array.isArray(det) ? Object.fromEntries(Object.entries(det).filter(([k]) => fichaFica(k))) : null);
  // linhas antigas do histórico: trocadas por cópias limpas (nunca mexer no objeto antigo, que a tela anterior ainda usa)
  d.historico = d.historico.map((h) => {
    if (h.tabela === 'fichas' && h.registro_id === f.id) return { ...h, detalhes: limparDetalhes(h.detalhes) };
    if (h.tabela === 'envios_email' && emails.size && (String(h.descricao || '').length || h.detalhes)) {
      const texto = JSON.stringify(h.detalhes || null);
      if ([...emails].some((x) => String(h.descricao || '').includes(x) || texto.includes(x))) return { ...h, descricao: limparTexto(h.descricao || ''), detalhes: h.detalhes ? JSON.parse(limparTexto(texto)) : null };
    }
    return h;
  });
  registrar(d, usuario, 'Alteração', 'fichas', f.id, `Ficha de ${f.inquilino_nome} (${f.situacao.toLocaleLowerCase('pt-BR')}): dados pessoais apagados (${CR.regra('meses_documentos_ficha')} meses depois da ${desde}; ficam o nome, as datas, a situação e a reserva)`, { campos_apagados: saem.length });
  return f;
}

/** Fichas reprovadas (ou com desistência) cujos documentos já saíram e os dados pessoais ainda não. */
export const fichasComDadosVencidos = (d, hoje = C.hojeIso()) => (d.fichas || []).filter((f) => inicioPrazoApagarFicha(f) && !f.dados_apagados_em
  && C.somarMesesData(inicioPrazoApagarFicha(f), CR.regra('meses_documentos_ficha')) <= hoje && f.documentos_apagados_em);

/** Fichas reprovadas com os documentos para apagar hoje. */
export const fichasComDocumentosVencidos = (d, hoje = C.hojeIso()) => (d.fichas || []).filter((f) => dataApagarDocumentosFicha(f) && dataApagarDocumentosFicha(f) <= hoje);

/** O que falta fazer nas fichas, para o Painel: [{ ficha, texto }]. */
export function pendenciasDasFichas(d, hoje = C.hojeIso()) {
  const out = [];
  for (const f of d.fichas || []) {
    if (f.situacao === 'Em análise') out.push({ ficha: f, texto: `ficha de ${f.inquilino_nome} em análise desde ${C.dataBr(f.data_recebida)}` });
    else if (imoveisParaContrato(d, f).length) out.push({ ficha: f, texto: `ficha de ${f.inquilino_nome} aprovada: falta fazer o contrato` });
    if (devolucaoPendente(f)) {
      const dv = devolucaoDaReserva(f);
      const ate = devolverReservaAte(f);
      out.push({ ficha: f, texto: `ficha de ${f.inquilino_nome} ${f.situacao === 'Desistiu' ? 'com desistência' : 'reprovada'}: registrar a devolução ${dv.integral ? `da reserva de ${C.reais(f.reserva_valor)}` : `de ${C.reais(dv.devolver)} da reserva de ${C.reais(f.reserva_valor)} (fica ${C.reais(dv.reter)}, como no termo)`}${ate ? (ate < hoje ? ` (o prazo era ${C.dataBr(ate)})` : ` até ${C.dataBr(ate)}`) : ''}` });
    }
    // termo aceito (2026-11-24): prazo dos documentos e validade da reserva, contados do depósito
    const pz = f.situacao === 'Em análise' && f.aceite_reserva ? prazosDaReserva(f) : null;
    if (pz && pz.documentos_ate < hoje && fichaSemDocumentos(f)) out.push({ ficha: f, texto: `ficha de ${f.inquilino_nome}: o prazo dos documentos acabou em ${C.dataBr(pz.documentos_ate)} e eles não estão marcados como recebidos: pelo termo, conta como desistência (${devolucaoDaReserva(f, { data: hoje }).devolver ? `devolve ${C.reais(devolucaoDaReserva(f, { data: hoje }).devolver)}` : 'a reserva fica com a empresa'}); registre em "Desistiu antes de assinar"` });
    else if (pz && pz.vale_ate < hoje) out.push({ ficha: f, texto: `ficha de ${f.inquilino_nome}: a reserva segurava o imóvel até ${C.dataBr(pz.vale_ate)} (decida a ficha)` });
  }
  return out;
}

/**
 * Dados da ficha para o Novo contrato (#/novo/contratos?ficha=ID): os da pessoa, a proposta (aluguel, vencimento,
 * bonificação e garantia) e, no primeiro contrato feito a partir dela, a reserva (valor, data e o comprovante, que vai
 * para a pasta do inquilino ao salvar).
 */
export function dadosDaFicha(d, f) {
  const primeiro = !Object.keys(contratosDaFicha(d, f)).length;
  const proposta = Object.fromEntries(CAMPOS_PROPOSTA_FICHA.filter((k) => f[k] !== undefined && f[k] !== null && f[k] !== '').map((k) => [k, f[k]]));
  if (proposta.aluguel_inicial > 0 && f.bonificacao !== false) proposta.aluguel_bonificado = proposta.aluguel_inicial - C.descontoPorPercentual(proposta.aluguel_inicial, f.desconto_pontualidade_percentual || 0);
  // reserva já devolvida (ficha reprovada e reaberta): não vai ao contrato, senão o 1º aluguel a abateria de novo
  const reserva = primeiro && f.reserva_valor > 0 && !(f.devolucao_valor > 0) && !f.devolucao_data ? { reserva_valor: f.reserva_valor, reserva_data: f.reserva_data, ...(f.comprovante_reserva && !f.documentos_no_contrato ? { comprovante_reserva: f.comprovante_reserva } : {}) } : {};
  // fiadores da ficha: os mesmos campos do Novo contrato (fiador1_nome...)
  const fiadores = Object.fromEntries(Object.entries(f).filter(([k, v]) => /^fiador\d+_/.test(k) && v !== undefined && v !== null && v !== ''));
  return { ...dadosDaPessoa(f), ...proposta, ...fiadores, ...reserva };
}

/** Ficha aprovada que ainda espera o contrato deste imóvel (o Novo contrato aberto pelo imóvel também a usa), ou null. */
export function fichaAprovadaDoImovel(d, imovelId) {
  const f = fichaAbertaDoImovel(d, imovelId);
  return f && imoveisParaContrato(d, f).includes(Number(imovelId)) ? f : null;
}

/**
 * Por que o contrato não pode ser cancelado por desistência antes da assinatura (null = pode). Cancelar apaga o contrato
 * e o que é dele (boletos ainda não pagos etc.); por isso só vale enquanto nada de dinheiro ou assinatura passou por ele.
 * Ex.: contrato gerado em 10/11/2026, ainda sem assinatura e sem boleto pago → null (pode cancelar).
 */
export function motivoSemDesistencia(d, c) {
  if (!c) return 'Inquilino não encontrado.';
  if (c.doc_contrato_em) return `O contrato de ${c.inquilino_nome} já foi assinado: a desistência agora é uma saída do inquilino (rescisão), não um cancelamento.`;
  if (c.contrato_anterior_id || d.contratos.some((x) => x.contrato_anterior_id === c.id)) return `O contrato de ${c.inquilino_nome} faz parte de uma troca de titular: não dá para cancelar por desistência.`;
  if (c.data_saida) return `O contrato de ${c.inquilino_nome} já tem data de saída.`;
  const boletos = d.cobrancas.filter((cb) => cb.contrato_id === c.id);
  if (boletos.some((cb) => cb.data_pagamento)) return `O contrato de ${c.inquilino_nome} tem boleto pago: desfaça o pagamento antes (ou trate como saída do inquilino).`;
  if (boletos.some((cb) => faturasDe(d, 'cobranca', cb.id, false).length)) return `O contrato de ${c.inquilino_nome} tem NF emitida.`;
  if (boletos.some((cb) => cb.banco && cb.banco.situacao === 'emitido')) return `O contrato de ${c.inquilino_nome} tem boleto emitido no C6 em aberto: cancele no banco antes.`;
  if (garantiaDepositada(c) || (d.depositos_garantia || []).some((x) => x.contrato_id === c.id)) return `O contrato de ${c.inquilino_nome} tem caução ou depósito de garantia registrado: devolva e exclua o registro antes.`;
  return null;
}

/** Contratos que caem juntos na desistência: os da ficha (todos os imóveis dela) ou só o contrato informado. */
export function contratosDaDesistencia(d, { fichaId = null, contratoId = null }) {
  const f = fichaId ? buscar(d, 'fichas', fichaId) : null;
  if (f) return d.contratos.filter((c) => c.ficha_id === f.id);
  const c = contratoId ? buscar(d, 'contratos', contratoId) : null;
  if (!c) return [];
  return c.ficha_id ? d.contratos.filter((x) => x.ficha_id === c.ficha_id) : [c];
}

/**
 * Conferências dos documentos do link da ficha (`fichas.conferencias_link`, por nome do arquivo; telas/fichas.js).
 * ``novas``: { nome: registro } (conferir-pdf.js `registroDaConferencia`, com o resumo SHA-256, quem e quando); a que já
 * estiver guardada fica (outro aparelho pode ter conferido e compactado antes). Devolve quantas entraram.
 */
export function guardarConferenciasDoLink(d, fichaId, novas, usuario) {
  const f = buscar(d, 'fichas', fichaId);
  if (!f) return 0;
  const atuais = f.conferencias_link || {};
  const entram = Object.fromEntries(Object.entries(novas || {}).filter(([nome]) => !atuais[nome]));
  const n = Object.keys(entram).length;
  if (n) atualizar(d, 'fichas', fichaId, { conferencias_link: { ...atuais, ...entram } }, usuario, `Conferência guardada de ${n} documento(s) mandado(s) pelo link`);
  return n;
}

/**
 * A compactação trocou o documento do link já conferido: guarda o resumo SHA-256 do arquivo novo (`sha256_compactado`) junto
 * da conferência, que continua sendo a do original. Grave ANTES de trocar o arquivo: se a troca falhar, o original ainda
 * bate com `sha256`. ``resumos``: { nome: sha256 do compactado }. Devolve quantas foram anotadas.
 */
export function registrarCompactacaoDoLink(d, fichaId, resumos, usuario, em = new Date().toISOString()) {
  const f = buscar(d, 'fichas', fichaId);
  if (!f || !f.conferencias_link) return 0;
  const lista = { ...f.conferencias_link };
  let n = 0;
  for (const [nome, sha] of Object.entries(resumos || {})) {
    if (!lista[nome] || !sha) continue;
    lista[nome] = { ...lista[nome], sha256_compactado: sha, compactado_em: em };
    n += 1;
  }
  if (n) atualizar(d, 'fichas', fichaId, { conferencias_link: lista }, usuario, `${n} documento(s) do link compactado(s) depois da conferência (resumo do arquivo novo guardado)`);
  return n;
}

/** Tira a conferência guardada de um documento do link (o arquivo mudou depois dela): a tela confere de novo o de agora. */
export function refazerConferenciaDoLink(d, fichaId, nome, usuario) {
  const f = buscar(d, 'fichas', fichaId);
  if (!f || !(f.conferencias_link || {})[nome]) return false;
  const { [nome]: antiga, ...resto } = f.conferencias_link; // eslint-disable-line no-unused-vars
  atualizar(d, 'fichas', fichaId, { conferencias_link: resto }, usuario, `Conferência de "${nome}" refeita: o arquivo tinha mudado depois da conferência`);
  return true;
}

/**
 * Desistência antes de assinar (pedido do dono, 2026-11-13): o interessado não segue. A ficha fica "Desistiu", com a
 * reserva para devolver por inteiro (devolução registrada depois, com data e comprovante, como na reprovada), e os
 * contratos feitos dela e ainda não assinados são cancelados (apagados com os boletos não pagos). Contrato sem ficha
 * (feito direto em Novo contrato): vira uma ficha "Desistiu" com os dados da pessoa, a proposta e a reserva.
 * ``arquivos``: nomes dos arquivos já copiados da pasta do inquilino para a pasta da ficha (a tela copia antes).
 * Ex.: reserva de R$ 1.000,00 em 05/11/2026, contrato gerado e não assinado, desistiu em 13/11/2026 → contrato apagado,
 * ficha "Desistiu" em 13/11/2026 e o alerta "registrar a devolução da reserva de R$ 1.000,00". Devolve a ficha.
 */
export function desistirAntesDeAssinar(d, { fichaId = null, contratoId = null, data, motivo = '', pasta = null, arquivos = [] }, usuario, hoje = C.hojeIso()) {
  let f = fichaId ? buscar(d, 'fichas', fichaId) : null;
  if (fichaId && !f) throw new C.ErroUsuario('Ficha não encontrada.');
  const contratos = contratosDaDesistencia(d, { fichaId, contratoId });
  if (!f && contratos[0] && contratos[0].ficha_id) f = buscar(d, 'fichas', contratos[0].ficha_id);
  if (!f && !contratos.length) throw new C.ErroUsuario('Inquilino não encontrado.');
  if (f && fichaSemContrato(f)) throw new C.ErroUsuario(`A ficha de ${f.inquilino_nome} já está encerrada (${f.situacao}).`);
  for (const c of contratos) { const m = motivoSemDesistencia(d, c); if (m) throw new C.ErroUsuario(m); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) throw new C.ErroUsuario('Informe a data da desistência.');
  if (data > hoje) throw new C.ErroUsuario('A desistência não pode ser numa data futura.');
  if (f && f.data_recebida && data < f.data_recebida) throw new C.ErroUsuario(`A desistência não pode ser antes de a ficha chegar (${C.dataBr(f.data_recebida)}).`);
  // a reserva e o comprovante dela ficaram no primeiro contrato (dadosDaFicha): voltam para a ficha
  const comReserva = contratos.find((c) => c.reserva_valor > 0) || null;
  const reserva = comReserva ? { reserva_valor: comReserva.reserva_valor, reserva_data: comReserva.reserva_data || null,
    comprovante_reserva: comReserva.comprovante_reserva && arquivos.includes(comReserva.comprovante_reserva) ? comReserva.comprovante_reserva : null } : {};
  const cancelados = contratos.map((c) => `${c.inquilino_nome}${c.imovel_id ? ` (${(buscar(d, 'imoveis', c.imovel_id) || {}).nome || 'imóvel'})` : ''}`);
  const nota = cancelados.length ? `Contrato não assinado cancelado: ${cancelados.join('; ')}.` : '';
  const decisao = { situacao: 'Desistiu', decisao_data: data, decisao_por: usuario, decisao_motivo: [String(motivo || '').trim(), nota].filter(Boolean).join(' ') };
  if (f) {
    const voltam = f.documentos_no_contrato ? { documentos_no_contrato: null, comprovante_reserva: f.comprovante_reserva || reserva.comprovante_reserva || null,
      analise_serasa: f.analise_serasa || arquivos.find((n) => /^analise-serasa-/i.test(n)) || null } : {};
    atualizar(d, 'fichas', f.id, { ...decisao, ...(comReserva ? { reserva_valor: reserva.reserva_valor, reserva_data: reserva.reserva_data } : {}), ...voltam }, usuario,
      `Ficha de ${f.inquilino_nome}: desistiu antes de assinar`);
  } else {
    const c = contratos[0];
    const proposta = Object.fromEntries(CAMPOS_PROPOSTA_FICHA.filter((k) => c[k] !== undefined && c[k] !== null && c[k] !== '').map((k) => [k, c[k]]));
    f = inserir(d, 'fichas', { ...dadosDaPessoa(c), ...proposta, ...reserva, data_recebida: c.reserva_data || data, imoveis_ids: c.imovel_id ? [c.imovel_id] : [],
      modo_imoveis: MODOS_FICHA[0], pasta, ...decisao, observacoes: 'Ficha criada na desistência, a partir do contrato não assinado.' }, usuario, `Ficha de ${c.inquilino_nome}: desistiu antes de assinar`);
  }
  for (const c of contratos) excluirContrato(d, c.id, usuario, `${c.inquilino_nome} (desistiu antes de assinar)`);
  return buscar(d, 'fichas', f.id);
}

/**
 * Contrato do novo titular com a troca já completada (boletos, fiadores, correções e garantia passaram do anterior para ele):
 * excluir apagaria o que era do anterior, e o anterior ficaria com a saída na véspera da troca, sem ser cobrado. Barrado (busca
 * de 24/11, CON-01): o mais seguro é corrigir o cadastro do novo titular. Antes de a troca se completar, a exclusão é livre e o
 * anterior volta a ser cobrado (``soltarSaidaDoAnterior``). Devolve o texto do motivo ou null.
 */
export function motivoNaoExcluirHerdeiro(d, c) {
  const a = contratoHerdado(d, c);
  if (!a || !c.heranca_transferida) return null;
  const quando = typeof c.heranca_transferida === 'string' && C.dataValida(c.heranca_transferida) ? ` em ${C.dataBr(c.heranca_transferida)}` : '';
  return `A troca de titular já foi completada${quando}: o que era de ${a.inquilino_nome} (boletos, fiadores, correções do aluguel, garantia) passou para ${c.inquilino_nome}. Excluir este contrato apagaria esses registros e ${a.inquilino_nome} ficaria sem cobrança. Corrija o cadastro em "Editar contrato" em vez de excluir.`;
}

/** Tabelas com contrato_id que não saem com o contrato: NFs (barradas antes) e os dados do banco (não se desfazem). */
const FICAM_SEM_O_CONTRATO = new Set(['contratos', 'faturas', 'movimentacoes_banco', 'pagamentos_banco']);

/**
 * Exclui o contrato e tudo o que pertence a ele: os registros de todas as tabelas (TABELAS) com o contrato_id dele (boletos,
 * fiadores, garantia e depósitos, vistorias, aditivos, cartas de reajuste, titularidades, acordos...). Os arquivos desses
 * registros deixam de ser usados (`arquivosReferenciados`) e a tela os apaga da pasta (`alterarApagandoAnexos`).
 */
export function excluirContrato(d, contratoId, usuario, descricao) {
  const c = buscar(d, 'contratos', contratoId);
  if (!c) return;
  const barrado = motivoNaoExcluirHerdeiro(d, c);
  if (barrado) throw new C.ErroUsuario(barrado);
  // troca de titular que não vai acontecer: o anterior volta a ser cobrado (a saída na véspera da troca sai)
  soltarSaidaDoAnterior(d, c, usuario, `o contrato de ${c.inquilino_nome}, novo titular, foi excluído`);
  // apólice que veio do contrato anterior (troca de titular) volta para ele, com o arquivo: não sai junto (item 17)
  for (const s of (d.seguros || []).filter((x) => x.contrato_id === c.id && x.herdado_de && buscar(d, 'contratos', x.herdado_de))) {
    atualizar(d, 'seguros', s.id, { contrato_id: s.herdado_de, herdado_de: null }, usuario, `Seguro volta para o contrato anterior (${c.inquilino_nome} excluído)`);
  }
  for (const t of Object.keys(TABELAS)) {
    if (FICAM_SEM_O_CONTRATO.has(t) || !Array.isArray(d[t])) continue;
    d[t].filter((x) => x && x.contrato_id === c.id).forEach((x) => excluir(d, t, x.id, usuario));
  }
  // a garantia que tinha passado a este contrato volta a ser do anterior (senão não passa a um novo titular)
  for (const a of d.contratos.filter((x) => x.garantia_transferida_para === c.id)) atualizar(d, 'contratos', a.id, { garantia_transferida_para: null }, usuario, `${a.inquilino_nome}: garantia volta para este contrato (${c.inquilino_nome} excluído)`);
  // a ficha que mandou os documentos para este contrato deixa de apontar para ele (senão o próximo contrato da ficha não
  // recebia o comprovante da reserva e a página da ficha mostrava um link para um contrato apagado)
  for (const f of (d.fichas || []).filter((x) => x && Number(x.documentos_no_contrato) === c.id)) atualizar(d, 'fichas', f.id, { documentos_no_contrato: null }, usuario, `Ficha de ${f.inquilino_nome}: o contrato que tinha recebido os documentos foi excluído`);
  excluir(d, 'contratos', c.id, usuario, descricao || c.inquilino_nome);
}

/** Relógios que o contrato tem: o que está como "Não tem" fica de fora; sem a informação, água e energia (gás só se tiver). */
export const relogiosDoContrato = (c) => RELOGIOS.map(([k]) => k).filter((k) => (c[`conta_${k}`] ? c[`conta_${k}`] !== SITUACOES[2] : k !== 'gas'));
/** A leitura dos relógios é obrigatória na vistoria e na saída? (regra do administrador; padrão: sim, como sempre foi) */
export const leituraObrigatoria = () => CR.regra('leitura_relogios_obrigatoria') !== false;
/** Relógios cuja leitura é obrigatória: os do contrato com a regra ligada (padrão); com ela desligada, nenhum. */
export const relogiosObrigatorios = (c) => (leituraObrigatoria() ? relogiosDoContrato(c) : []);

/**
 * Leitura de entrada ou de saída do inquilino (uma só por momento): cria ou atualiza. ``valores``: { agua, energia, gas }.
 * Com a leitura opcional (regra desligada) e tudo em branco, não cria leitura vazia (devolve null).
 */
export function gravarLeitura(d, c, momento, data, valores, usuario) {
  const falta = relogiosObrigatorios(c).filter((k) => !String(valores[k] || '').trim());
  if (falta.length) throw new Error(`Informe a leitura do relógio de ${falta.map((k) => RELOGIOS.find(([x]) => x === k)[1]).join(' e ')} (${momento.toLocaleLowerCase('pt-BR')}).`);
  const dados = { agua: valores.agua || '', energia: valores.energia || '', gas: valores.gas || '' };
  const atual = d.leituras.find((l) => l.contrato_id === c.id && l.momento === momento);
  if (!atual && !RELOGIOS.some(([k]) => String(dados[k]).trim())) return null;
  if (atual) return atualizar(d, 'leituras', atual.id, { ...dados, data, imovel_id: c.imovel_id || null }, usuario, `${momento}: ${textoLeitura(dados)}`);
  return registrarLeitura(d, { imovel_id: c.imovel_id || null, contrato_id: c.id, data, momento, ...dados, observacoes: '' }, usuario);
}
export const leituraDo = (d, contratoId, momento) => d.leituras.find((l) => l.contrato_id === contratoId && l.momento === momento) || null;

/**
 * Saída do inquilino, 1ª etapa: a data em que ele sai (avisou que sai em 30/11 → o boleto de novembro sai proporcional).
 * O cálculo final (garantia, débitos, leitura) vem depois. Também muda a data, enquanto não há cálculo final: quem já tinha
 * ficado inativo pela data antiga volta a ativo se, pela nova, ainda não deve sair (ex.: saída 15/10 mudada para 15/11, hoje
 * 09/11: ativo de novo, para o boleto de 01 a 15/11 sair).
 */
export function informarSaida(d, contratoId, data, usuario, hoje = C.hojeIso()) {
  const c = buscar(d, 'contratos', contratoId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) throw new Error('Informe a data de saída.');
  if (encerramentoDo(d, c.id)) throw new Error('A saída já tem o cálculo final: desfaça o cálculo antes de mudar a data.');
  if (c.data_entrada && data < c.data_entrada) throw new C.ErroUsuario('A saída não pode ser antes da entrada.');
  const reativar = c.ativo === false && !fimDeVinculo(d, c) && !deveDesativar(d, { ...c, ativo: true, data_saida: data }, hoje);
  const antes = c.data_saida;
  // saída adiada (ou antecipada) com a vistoria já marcada: a vistoria anda o mesmo tanto de dias (decisão do dono, 21/11/2026,
  // saida-007; a tela avisa para mandar o convite de novo). Ex.: saída 10/12 → 15/12 e vistoria 11/12 às 10:00 → 16/12 às 10:00.
  // O último boleto (ainda em aberto) é recalculado pelos dias novos e o acerto final fica para o cálculo final.
  const vistoria = antes && antes !== data && c.vistoria_saida_data ? C.somarDias(c.vistoria_saida_data, C.diasEntre(antes, data)) : null;
  atualizar(d, 'contratos', c.id, { data_saida: data, ...(reativar ? { ativo: true } : {}), ...(vistoria ? { vistoria_saida_data: vistoria, vistoria_saida_marcada_em: hoje } : {}) }, usuario,
    `Saída do inquilino em ${C.dataBr(data)}${antes && antes !== data ? ` (era ${C.dataBr(antes)})` : ''}${reativar ? ' (ativo de novo até a saída)' : ''}${vistoria ? `; vistoria de saída passa a ${C.dataBr(vistoria)}` : ''}`);
  desativarSeSaiu(d, c, usuario, hoje);
  return c;
}

/** Desfaz a data de saída (sem cálculo final): o inquilino volta a ativo. Também reativa quem foi marcado inativo sem data de saída. */
export function desfazerSaida(d, contratoId, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  if (encerramentoDo(d, c.id)) throw new Error('Desfaça antes o cálculo final da saída.');
  if (fimDeVinculo(d, c)) throw new Error('Fim do vínculo da troca de titular: não se desfaz aqui.');
  // a próxima saída começa do zero (2026-11-20): vistoria e leitura da saída desistida não podem fechar as etapas da nova
  const sobras = [];
  const vist = c.data_saida && vistoriasDo(d, c.id).find((v) => v.tipo === 'Saída');
  if (vist) sobras.push(`a vistoria de saída de ${C.dataBr(vist.data)}`);
  const leitura = c.data_saida && leituraDo(d, c.id, 'Saída do inquilino');
  if (leitura) sobras.push(`a leitura dos relógios da saída${leitura.data ? ` de ${C.dataBr(leitura.data)}` : ''}`);
  if (sobras.length) throw new C.ErroUsuario(`Exclua antes ${sobras.join(' e ')} (na página do inquilino): com a saída desfeita, elas fechariam as etapas da próxima saída. Se quiser guardar, baixe o PDF antes de excluir.`);
  // a data marcada da vistoria e o termo de devolução das chaves eram desta saída: saem junto
  atualizar(d, 'contratos', c.id, { data_saida: null, ativo: true, vistoria_saida_data: null, vistoria_saida_hora: null, vistoria_saida_marcada_em: null, termo_chaves_saida: null },
    usuario, 'Saída desfeita: inquilino ativo de novo');
  return c;
}

/**
 * Boletos do aluguel já pagos com menos dias do que o inquilino ocupa agora (saída desfeita ou adiada depois de pago o
 * proporcional): [{ cobranca, dias_pagos, dias_agora, diferenca }]. Não muda nada: a tela avisa. Ex.: aluguel de R$ 1.500,00,
 * saída em 15/10 com outubro pago proporcional (15 dias, R$ 750,00), saída desfeita → outubro agora tem 30 dias: faltam R$ 750,00.
 */
export function pagosComMenosDias(d, c) {
  const out = [];
  for (const cb of d.cobrancas.filter((x) => x.contrato_id === c.id && x.data_pagamento && !ehBoletoAvulso(x) && x.dias_cobrados < x.dias_mes)) {
    const novo = montarCobranca(d, c, cb.competencia);
    if (!novo || !(novo.dias_cobrados > cb.dias_cobrados)) continue;
    const diferenca = (novo.aluguel - novo.desconto) - ((cb.aluguel || 0) - (cb.desconto || 0));
    if (diferenca > 0) out.push({ cobranca: cb, dias_pagos: cb.dias_cobrados, dias_agora: novo.dias_cobrados, dias_mes: novo.dias_mes, diferenca });
  }
  return out;
}

/**
 * Imóvel lançado errado no contrato: troca para o certo, só enquanto não há boleto pago. As leituras, vistorias e
 * titularidades do inquilino acompanham.
 */
export function corrigirImovel(d, contratoId, imovelId, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const i = buscar(d, 'imoveis', imovelId);
  if (!i) throw new C.ErroUsuario('Escolha o imóvel certo.');
  if (c.imovel_id === i.id) throw new Error('O contrato já está neste imóvel.');
  if (d.cobrancas.some((cb) => cb.contrato_id === c.id && cb.data_pagamento)) throw new Error('Este contrato já tem boleto pago: o imóvel não pode mais ser trocado.');
  const antes = (buscar(d, 'imoveis', c.imovel_id) || {}).nome || 'sem imóvel';
  atualizar(d, 'contratos', c.id, { imovel_id: i.id, sem_imovel_desde: null }, usuario, `Imóvel corrigido: ${antes} → ${i.nome}`);
  for (const t of ['leituras', 'vistorias', 'titularidades']) for (const x of d[t].filter((y) => y.contrato_id === c.id)) atualizar(d, t, x.id, { imovel_id: i.id }, usuario, `Imóvel corrigido (${i.nome})`);
  return c;
}

/** `hoje` (a tela manda o dia de hoje): o cálculo final só depois da saída (o roteiro diz "depois da saída"). */
export function encerrarContrato(d, contratoId, dados, usuario, hoje = null) {
  const c = buscar(d, 'contratos', contratoId);
  const leitura = separarLeitura(dados);
  if (d.encerramentos.some((e) => e.contrato_id === c.id)) throw new Error('A saída deste inquilino já foi registrada.');
  if (dados.data_saida < c.data_entrada) throw new C.ErroUsuario('A saída não pode ser antes da entrada.');
  if (hoje && dados.data_saida > hoje) throw new C.ErroUsuario(`O cálculo final é feito depois que o inquilino sai: a saída é em ${C.dataBr(dados.data_saida)}. Volte a partir desse dia.`);
  // a leitura da saída é obrigatória (regra leitura_relogios_obrigatoria; desligada, pode ficar em branco) e é a mesma da
  // vistoria de saída (uma só): sem digitar aqui, vale a da vistoria
  if (leitura || !leituraDo(d, c.id, 'Saída do inquilino')) gravarLeitura(d, c, 'Saída do inquilino', dados.data_saida, leitura || {}, usuario);
  const calc = calcularEncerramento(dados.garantia_valor, dados.indice_percentual, dados.debitos, dados.fci_credito, dados.fci_danos, dados.creditos);
  // ressarcimentos do condomínio que entraram como crédito (linha mantida na descrição): o alerta sabe que já foram acertados
  const creditados = dados.creditos > 0 ? ressarcimentosCreditados(d, c, dados.creditos_descricao) : [];
  const r = inserir(d, 'encerramentos', { contrato_id: c.id, ...dados, ...calc, ressarcimentos_creditados: creditados }, usuario,
    `Saída de ${c.inquilino_nome} em ${C.dataBr(dados.data_saida)}: saldo ${C.reais(calc.saldo)}`);
  atualizar(d, 'contratos', c.id, { data_saida: dados.data_saida }, usuario, 'Saída do inquilino');
  desativarSeSaiu(d, c, usuario);
  // os boletos em aberto descontados nos débitos (linha "Aluguel MM/AAAA em aberto" mantida) não se cobram mais
  for (const cb of boletosDescontadosNaSaida(d, c, dados.debitos_descricao)) {
    atualizar(d, 'cobrancas', cb.id, { quitado_saida: r.id, situacao: 'Descontado da garantia' }, usuario,
      `Boleto ${C.compBr(cb.competencia)} descontado da garantia no cálculo final da saída`);
  }
  return r;
}

/** Boletos em aberto do contrato que o texto dos débitos do cálculo final desconta (linha "Aluguel 10/2026 em aberto: …" mantida). */
export function boletosDescontadosNaSaida(d, c, descricao) {
  const texto = String(descricao || '');
  if (!texto) return [];
  // a mesma lista dos débitos (o complemento da caução do mesmo mês tem o mesmo nome e não entra nos débitos)
  return cobrancasEmAberto(d, c.id).filter((cb) => texto.includes(`${nomeDebitoSaida(cb)} em aberto`));
}

/** Cálculo final desfeito: os boletos que ele descontava voltam a ser cobrados. */
export function liberarBoletosDaSaida(d, encerramentoId, usuario) {
  for (const cb of d.cobrancas.filter((x) => x.quitado_saida === Number(encerramentoId))) {
    atualizar(d, 'cobrancas', cb.id, { quitado_saida: null, situacao: cb.data_pagamento ? cb.situacao : 'Em aberto' }, usuario,
      `Boleto ${C.compBr(cb.competencia)} volta a ser cobrado (cálculo final desfeito)`);
  }
}

export const encerramentoDo = (d, contratoId) => d.encerramentos.find((e) => e.contrato_id === contratoId) || null;

// ---------------------------------------------------------------- boleto do saldo do cálculo final (decisão do dono, 2026-11-20)
/** Boleto do saldo devedor de um cálculo final (ou null). */
export const boletoDoSaldo = (d, e) => (e ? d.cobrancas.find((cb) => cb.saldo_saida_de === e.id) || null : null);

/**
 * Gera o boleto do saldo que o inquilino deve no cálculo final (o saldo devedor é cobrado por boleto: título executivo
 * extrajudicial). Boleto avulso (``ehBoletoAvulso``) como o do complemento da caução: o valor vai em ``outros``, sem aluguel,
 * por isso sem NF (o aluguel de cada mês já teve, ou tem, o boleto e a NF dele). Pago depois do vencimento, tem a multa e os
 * juros do contrato (decisão do dono, 2026-11-20), sem bonificação nem desconto. Pago, marca sozinho o saldo cobrado no
 * roteiro da saída (``registrarPagamento``). Pode ser emitido no C6 como os outros. Ex.: garantia R$ 2.000,00, débitos R$ 2.300,00 →
 * saldo −R$ 300,00 → boleto de R$ 300,00 com o vencimento escolhido.
 */
export function gerarBoletoDoSaldo(d, encerramentoId, vencimento, usuario, hoje = C.hojeIso()) {
  const e = buscar(d, 'encerramentos', Number(encerramentoId));
  if (!e) throw new Error('Cálculo final não encontrado.');
  const c = buscar(d, 'contratos', e.contrato_id);
  if (!c) throw new Error('Inquilino não encontrado.');
  if (!(e.saldo < 0)) throw new C.ErroUsuario('O saldo deste cálculo final não é a pagar pelo inquilino: não há boleto a gerar.');
  if (boletoDoSaldo(d, e)) throw new C.ErroUsuario('O boleto do saldo já foi gerado (veja os boletos do inquilino).');
  if (e.garantia_devolvida_em) throw new C.ErroUsuario(`O saldo já foi marcado como cobrado em ${C.dataBr(e.garantia_devolvida_em)}: desfaça a marcação antes de gerar o boleto.`);
  if (!C.dataValida(vencimento)) throw new C.ErroUsuario('Informe o vencimento do boleto do saldo.');
  if (vencimento < hoje) throw new C.ErroUsuario('O vencimento do boleto do saldo não pode ser antes de hoje.');
  const valor = -e.saldo;
  const mes = c.cobranca_mes_seguinte !== false ? C.somarMeses(vencimento.slice(0, 7), -1) : vencimento.slice(0, 7);
  return inserir(d, 'cobrancas', {
    contrato_id: c.id, competencia: mes, vencimento,
    dias_cobrados: C.diasNoMes(mes), dias_mes: C.diasNoMes(mes), aluguel_mensal: 0, aluguel: 0, desconto: 0,
    iptu: 0, iptu_parcela: '', seguro: 0, seguro_parcela: '', taxa_boleto: 0, fci: 0, outros: valor, outros_descricao: 'Saldo do cálculo final da saída',
    reserva_utilizada: 0, carencia: false, ressarcimento: 0, ressarcimento_descricao: '', ressarcimento_na_nf: false,
    multa_percentual: c.multa_percentual || 0, juros_mensal_percentual: c.juros_mensal_percentual || 0, saldo_saida_de: e.id,
    situacao: 'Em aberto', data_pagamento: null, valor_pago: null, dias_atraso: null, multa: null, juros: null, valor_nf: null, banco: null,
  }, usuario, `Boleto do saldo da saída de ${c.inquilino_nome}: ${C.reais(valor)}, vence em ${C.dataBr(vencimento)}`);
}

/** Por que o cálculo final não pode ser desfeito por causa do boleto do saldo (texto) ou null (em aberto: sai junto). */
export function motivoNaoDesfazerSaldo(d, e) {
  const cb = boletoDoSaldo(d, e);
  if (!cb) return null;
  if (cb.data_pagamento) return `O boleto do saldo (${C.reais(cb.outros)}) já foi pago em ${C.dataBr(cb.data_pagamento)}: desfaça o pagamento antes (na página do boleto) e depois desfaça o cálculo final.`;
  if (cb.banco && ['emitido', 'pago'].includes(cb.banco.situacao)) return `O boleto do saldo (${C.reais(cb.outros)}) foi emitido no C6: cancele no banco antes (na página do boleto) e depois desfaça o cálculo final.`;
  if (emAcordo(cb)) return 'O boleto do saldo entrou num acordo: desfaça o acordo antes e depois desfaça o cálculo final.';
  return null;
}

/** Cálculo final desfeito: o boleto do saldo em aberto sai junto (``motivoNaoDesfazerSaldo`` já barrou o pago ou no banco). */
export function excluirBoletoDoSaldo(d, encerramentoId, usuario) {
  for (const cb of d.cobrancas.filter((x) => x.saldo_saida_de === Number(encerramentoId))) {
    if (cb.data_pagamento || (cb.banco && ['emitido', 'pago'].includes(cb.banco.situacao)) || emAcordo(cb)) continue;
    excluir(d, 'cobrancas', cb.id, usuario, 'Boleto do saldo da saída excluído (cálculo final desfeito)');
  }
}

/**
 * Na saída, a garantia é devolvida pela conta em que foi depositada: o valor corrigido dividido na proporção do que foi
 * aplicado em cada lugar. Ex.: R$ 3.000,00 na ANK e R$ 2.400,00 com Maria; corrigida R$ 5.940,00 → ANK R$ 3.300,00 e
 * Maria R$ 2.640,00. [{ nome, pessoa, valor }]; vazio sem aplicações.
 */
/**
 * Quanto da garantia volta pelas contas em que foi aplicada no cálculo final: a corrigida menos os débitos e os reparos que
 * passaram do FCI (o FCI que sobra é devolvido à parte). Ex.: corrigida R$ 5.940,00 e débitos R$ 1.000,00 → R$ 4.940,00.
 */
export const garantiaADevolverNaSaida = (e) => Math.max(0, (e.garantia_corrigida || 0) - (e.debitos || 0) - Math.max((e.fci_danos || 0) - (e.fci_usado || 0), 0));

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
      : x.complemento > 0 ? `${inicio} A caução deve passar a ${C.reais(x.necessaria)} (${C.plural(c.caucao_meses, 'aluguel', 'aluguéis')} ${CR.regra('caucao_base', c) === 'cheio' || !percentualBonificacao(c) ? 'cheios' : 'com bonificação'}); já depositado ${C.reais(x.atual)}. Gere o boleto do complemento de ${C.reais(x.complemento)} na tela Reajustes.`
        : `${inicio} A caução depositada (${C.reais(x.atual)}) já cobre o necessário (${C.reais(x.necessaria)}). Confirme a caução na tela Reajustes para tirar este aviso.`;
  return { nivel: 'aviso', tipo: 'Correção da caução', ancora: 'garantia', texto };
}

function alertaAplicacao(d, c) {
  const s = situacaoAplicacao(d, c);
  if (!s.total || s.ok) return null;
  return { nivel: 'aviso', tipo: 'Aplicação da garantia',
    texto: `Garantia de ${C.reais(s.total)} não foi aplicada integralmente: ${s.soma ? `aplicado ${C.reais(s.soma)} (${s.linhas.map((l) => `${l.emitente.nome.split(/\s+/)[0]} ${C.reais(l.aplicado)}`).join(', ')}), ` : ''}falta aplicar ${C.reais(s.falta)}.` };
}

/** Saldo da saída acertado a partir deste dia sem comprovante vira aviso (antes não havia onde anexar). */
export const COMPROVANTE_SAIDA_DESDE = '2026-11-13';
/**
 * Depósitos registrados sem o comprovante (caução, depósito de garantia, reserva, complemento da caução, aplicação e o
 * saldo da saída): [{ texto, valor, data, tabela, id, campo, tipo }]. ``tipo`` dá o nome do arquivo (comprovante-caucao-AAAA-MM-DD.pdf).
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
  // depósitos registrados sem o comprovante (caução ou depósito de garantia em parcelas). Garantia com o comprovante no
  // contrato (ex.: herdada, com o comprovante anexado no contrato anterior): os depósitos do valor inicial já estão cobertos
  for (const [qual, texto, tipo] of [['caucao', 'depósito da caução', 'caucao'], ['deposito', 'depósito de garantia', 'deposito-garantia']]) {
    const coberto = c[GARANTIAS_DEPOSITADAS[qual].comprovante] && !c[`${qual}_por_depositos`];
    if ((qual === 'caucao' ? temCaucao(c) : temDeposito(c))) for (const x of depositosGarantiaDo(d, c, qual)) falta(!x.comprovante && !(coberto && !x.complementar), texto, x.valor, x.data, 'depositos_garantia', x.id, 'comprovante', tipo);
    // herdada, paga pelo anterior em depósitos ainda sem comprovante: cobrado aqui (o contrato de quem pagou já não tem alertas)
    const p = pagadorDaGarantia(d, c, qual);
    if (p.id !== c.id && c[`${qual}_por_depositos`]) {
      for (const x of depositosGarantiaDo(d, p, qual).filter((y) => !y.complementar)) falta(!x.comprovante, `${texto} pago por ${p.inquilino_nome}`, x.valor, x.data, 'depositos_garantia', x.id, 'comprovante', tipo);
    }
  }
  for (const x of correcoesGarantiaDo(d, c.id)) falta(!x.comprovante, 'complemento da caução', x.complemento, x.data, 'correcoes_garantia', x.id, 'comprovante', 'complemento-caucao');
  for (const x of d.aplicacoes.filter((a) => a.contrato_id === c.id)) falta(!x.comprovante, 'aplicação da garantia', x.valor, x.data, 'aplicacoes', x.id, 'comprovante', 'aplicacao-garantia');
  for (const x of devolucoesGarantiaDo(d, c.id)) falta(!x.comprovante, 'devolução da garantia', x.saldo, x.data, 'devolucoes_garantia', x.id, 'comprovante', 'devolucao-garantia');
  // saída: saldo do cálculo final já devolvido ao inquilino (ou pago por ele), sem o comprovante do banco; só as saídas
  // acertadas desde que o campo existe (as antigas não tinham onde anexar e não viram aviso)
  const e = encerramentoDo(d, c.id);
  if (e && e.garantia_devolvida_em >= COMPROVANTE_SAIDA_DESDE) falta(!e.comprovante, e.saldo > 0 ? 'devolução do saldo da saída' : 'pagamento do saldo da saída', Math.abs(e.saldo || 0), e.garantia_devolvida_em, 'encerramentos', e.id, 'comprovante', e.saldo > 0 ? 'devolucao-saldo' : 'pagamento-saldo');
  return out;
}

/** Anexa depois o comprovante que faltava (só os campos de comprovante de depósito). */
export function anexarComprovante(d, tabela, id, campo, arquivo, usuario) {
  const ok = { contratos: ['comprovante_caucao', 'comprovante_deposito', 'comprovante_reserva', 'termo_chaves_saida', 'contra_vistoria'], ...Object.fromEntries(TABELAS_COMPROVANTE.map((t) => [t, ['comprovante']])), encerramentos: ['comprovante', 'termo_assinado'], devolucoes_garantia: ['comprovante', 'termo_assinado'], acordos: ['termo_assinado'], notificacoes: ['arquivo_assinado', 'comprovante_baixa'] };
  if (!(ok[tabela] || []).includes(campo)) throw new Error('Comprovante desconhecido.');
  if (!arquivo) throw new Error('Escolha o arquivo do comprovante.');
  const r = buscar(d, tabela, id);
  if (!r) throw new Error(`${TABELAS[tabela]} não encontrado.`);
  atualizar(d, tabela, r.id, { [campo]: arquivo }, usuario, `Comprovante anexado: ${arquivo}`);
  const contratoId = tabela === 'contratos' ? r.id : r.contrato_id;
  if (['comprovante_caucao', 'comprovante_deposito'].includes(campo) || tabela === 'depositos_garantia') sincronizarGarantiaHerdeiro(d, contratoId, usuario);
}

/** Pasta (contrato) em que está o PDF do boleto emitido no banco: a do contrato em que foi anexado. */
export const pastaDoBoletoPdf = (cb) => cb.boleto_pdf_contrato || cb.contrato_id;

/**
 * PDF do boleto emitido à mão no banco (enquanto a API do C6 não sai, pedido do dono em 2026-11-24): anexa (ou troca) e guarda
 * o valor e o vencimento do boleto naquele momento, para avisar se o boleto mudar depois (``boletoPdfDesatualizado``).
 * Com ``arquivo`` null, tira o anexo (o arquivo é apagado por quem chama, alterarApagandoAnexos).
 */
export function anexarBoletoPdf(d, id, arquivo, usuario) {
  const cb = buscar(d, 'cobrancas', id);
  if (!cb) throw new C.ErroUsuario('Este boleto não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
  const c = buscar(d, 'contratos', cb.contrato_id);
  const quem = `${c ? c.inquilino_nome : 'boleto'}: boleto de ${C.compBr(cb.competencia)}`;
  if (!arquivo) {
    if (!cb.boleto_pdf) throw new C.ErroUsuario('Este boleto não tem PDF anexado.');
    return atualizar(d, 'cobrancas', cb.id, { boleto_pdf: null, boleto_pdf_contrato: null, boleto_pdf_valor: null, boleto_pdf_vencimento: null, boleto_pdf_pontual: null, boleto_pdf_multa: null, boleto_pdf_juros: null }, usuario, `${quem}, PDF do banco tirado (${cb.boleto_pdf})`);
  }
  return atualizar(d, 'cobrancas', cb.id, { boleto_pdf: arquivo, boleto_pdf_contrato: cb.contrato_id, boleto_pdf_valor: totais(cb).a_pagar_sem_desconto, boleto_pdf_vencimento: cb.vencimento,
    boleto_pdf_pontual: totais(cb).a_pagar_pontual, boleto_pdf_multa: cb.multa_percentual || 0, boleto_pdf_juros: cb.juros_mensal_percentual || 0 },
    usuario, `${quem}, PDF do banco ${cb.boleto_pdf ? 'trocado' : 'anexado'} (${arquivo})`);
}

/**
 * O boleto mudou depois de anexado o PDF do banco? Texto do que mudou ou ''. Ex.: anexado com R$ 2.500,00 e o ajuste do mês
 * acrescentou R$ 100,00 → "o valor era R$ 2.500,00 e agora é R$ 2.600,00".
 */
export function boletoPdfDesatualizado(cb) {
  if (!cb.boleto_pdf || cb.boleto_pdf_valor == null) return '';
  const dif = [];
  const valor = totais(cb).a_pagar_sem_desconto;
  if (valor !== cb.boleto_pdf_valor) dif.push(`o valor era ${C.reais(cb.boleto_pdf_valor)} e agora é ${C.reais(valor)}`);
  if (cb.boleto_pdf_vencimento && cb.boleto_pdf_vencimento !== cb.vencimento) dif.push(`o vencimento era ${C.dataBr(cb.boleto_pdf_vencimento)} e agora é ${C.dataBr(cb.vencimento)}`);
  // bonificação, multa e juros (guardados desde 24/11/2026; anexo de antes não tem e não é conferido): o valor cheio pode
  // continuar igual. Ex.: anexado com R$ 1.800,00 até o vencimento e a bonificação passou a R$ 100,00 → R$ 1.900,00
  const pontual = totais(cb).a_pagar_pontual;
  if (cb.boleto_pdf_pontual != null && valor === cb.boleto_pdf_valor && pontual !== cb.boleto_pdf_pontual) dif.push(`o valor até o vencimento era ${C.reais(cb.boleto_pdf_pontual)} e agora é ${C.reais(pontual)}`);
  if (cb.boleto_pdf_multa != null && (cb.multa_percentual || 0) !== cb.boleto_pdf_multa) dif.push(`a multa era ${C.pct(cb.boleto_pdf_multa)} e agora é ${C.pct(cb.multa_percentual || 0)}`);
  if (cb.boleto_pdf_juros != null && (cb.juros_mensal_percentual || 0) !== cb.boleto_pdf_juros) dif.push(`os juros eram ${C.pct(cb.boleto_pdf_juros)} ao mês e agora são ${C.pct(cb.juros_mensal_percentual || 0)}`);
  return dif.join('; ');
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
export function registrarDepositoGarantia(d, contratoId, qual, { data, valor, arquivo }, usuario, hoje = C.hojeIso()) {
  const c = buscar(d, 'contratos', contratoId);
  const g = GARANTIAS_DEPOSITADAS[qual];
  if (!c || !g) throw new Error('Contrato ou garantia não encontrados.');
  // já registrada (ex.: caução inicial depositada e o aluguel reajustado): depósito para completar o que falta
  const complementar = garantiaDepositada(c);
  if (complementar && !(garantiaADepositar(d, c, qual).falta > 0)) throw new Error(`${g.nome.charAt(0).toLocaleUpperCase('pt-BR')}${g.nome.slice(1)} já está completa.`);
  if (!C.dataValida(data)) throw new Error('Informe a data do depósito.');
  // depósito ainda não feito não entra: a poupança conta da data de cada depósito e o termo de quitação usa essa data
  if (data > hoje) throw new C.ErroUsuario(`A data do depósito (${C.dataBr(data)}) é depois de hoje (${C.dataBr(hoje)}). Registre o depósito no dia em que ele foi feito.`);
  if (!(valor > 0)) throw new Error('Informe o valor depositado.');
  // completar acima do que falta passaria do combinado (e pode passar do limite de 3 aluguéis da caução, Lei 8.245/91, art. 38, §2º)
  if (complementar) {
    const falta = garantiaADepositar(d, c, qual).falta;
    if (valor > falta) throw new C.ErroUsuario(`Falta completar só ${C.reais(falta)}; o depósito de ${C.reais(valor)} passa disso. Registre ${C.reais(falta)} e devolva a diferença ao inquilino (a caução não pode passar de 3 aluguéis: Lei 8.245/91, art. 38, §2º).`);
  } else {
    // depósitos do valor inicial: a soma não passa do combinado (erro de digitação viraria outra caução, 2026-11-20)
    const s = garantiaADepositar(d, c, qual);
    if (s.necessaria > 0 && valor > s.falta) {
      throw new C.ErroUsuario(`${s.falta > 0 ? `Falta depositar só ${C.reais(s.falta)}` : `A ${g.nome} combinada (${C.reais(s.necessaria)}) já está depositada`}; o depósito de ${C.reais(valor)} passa disso e a ${g.nome} ficaria em ${C.reais(s.depositado + valor)}. Confira o valor digitado${qual === 'caucao' ? ' (a caução não pode passar de 3 aluguéis: Lei 8.245/91, art. 38, §2º)' : ''}; se o combinado mudou, corrija antes o valor no contrato.`);
    }
  }
  const x = inserir(d, 'depositos_garantia', { contrato_id: c.id, imovel_id: c.imovel_id || null, qual, troca_id: trocaAtual(d, c), data, valor, comprovante: arquivo || null,
    ...(complementar ? { complementar: true } : {}) }, usuario,
    `${c.inquilino_nome}: ${g.nome}, depósito ${complementar ? 'para completar ' : ''}de ${C.reais(valor)} em ${C.dataBr(data)}${arquivo ? '' : ' (sem comprovante)'}`);
  if (!complementar) completarPorDepositos(d, c, qual, usuario);
  sincronizarGarantiaHerdeiro(d, c.id, usuario);
  return { deposito: x, ...garantiaADepositar(d, c, qual), completou: !complementar && garantiaDepositada(c) };
}

/** Depois de excluir um depósito: se a soma deixou de cobrir o necessário, a garantia volta a "a depositar". */
export function acertarGarantiaDepositada(d, contratoId, qual, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const g = GARANTIAS_DEPOSITADAS[qual];
  if (!c || !g || !c[`${qual}_por_depositos`]) return;
  // confere só os depósitos do valor inicial (os reajustes não desfazem a caução registrada)
  const iniciais = depositosGarantiaDo(d, c, qual).filter((x) => !x.complementar);
  const soma = iniciais.reduce((s, x) => s + x.valor, 0);
  const fim = iniciais[iniciais.length - 1];
  const novo = !fim || soma < ((qual === 'caucao' ? c.caucao_valor : c.deposito_valor) || 0)
    ? { [g.pago]: null, [g.comprovante]: null, [`${qual}_por_depositos`]: null } : { [g.pago]: fim.data, [g.comprovante]: fim.comprovante || null };
  atualizar(d, 'contratos', c.id, novo, usuario, `${c.inquilino_nome}: depósitos de ${g.nome} conferidos (${C.reais(soma)})`);
}

/** Pode remover o comprovante do depósito? Na caução, só sem correções registradas (elas partem do valor depositado). */
export const podeRemoverComprovanteGarantia = (d, c, qual) => !garantiaHerdada(d, c) && !!(c[GARANTIAS_DEPOSITADAS[qual].comprovante] || c[`${qual}_por_depositos`]) && (qual !== 'caucao' || !correcoesCaucaoAtual(d, c).length);

/**
 * Remove o comprovante do depósito (anexado errado): a garantia volta a "Incluir … e anexar comprovante".
 * Paga em depósitos: sai o último depósito (os outros continuam na lista, e podem ser excluídos lá).
 */
export function removerComprovanteGarantia(d, contratoId, qual, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const g = GARANTIAS_DEPOSITADAS[qual];
  if (!c || !g) throw new Error('Contrato ou garantia não encontrados.');
  if (!c[g.comprovante] && !c[`${qual}_por_depositos`]) throw new Error('Não há depósito registrado para remover.');
  if (garantiaHerdada(d, c)) throw new Error('Garantia herdada do contrato anterior: para mudar, use "Corrigir caução".');
  if (!podeRemoverComprovanteGarantia(d, c, qual)) throw new Error('Exclua antes as correções da caução.');
  const ultimo = c[`${qual}_por_depositos`] ? depositosGarantiaDo(d, c, qual).filter((x) => !x.complementar).pop() : null;
  if (ultimo) excluir(d, 'depositos_garantia', ultimo.id, usuario, `${c.inquilino_nome}: depósito de ${C.reais(ultimo.valor)} de ${C.dataBr(ultimo.data)} removido`);
  atualizar(d, 'contratos', c.id, { [g.pago]: null, [g.comprovante]: null, [`${qual}_por_depositos`]: null }, usuario,
    `${c.inquilino_nome}: comprovante de ${g.nome} removido (volta a depositar)`);
  sincronizarGarantiaHerdeiro(d, c.id, usuario);
}

/**
 * "×" ao lado do anexo: apaga só o comprovante (o lançamento continua e volta o alerta para anexar). Depósito da garantia
 * paga em parcelas: o contrato guarda a cópia do comprovante do último depósito, que é conferida de novo.
 */
export function removerAnexo(d, tabela, id, campo, usuario) {
  const ok = { contratos: ['comprovante_reserva', 'termo_chaves_saida', 'contra_vistoria'], ...Object.fromEntries(TABELAS_COMPROVANTE.map((t) => [t, ['comprovante']])), encerramentos: ['comprovante', 'termo_assinado'], devolucoes_garantia: ['comprovante', 'termo_assinado'], acordos: ['termo_assinado'], notificacoes: ['arquivo_assinado', 'comprovante_baixa'] };
  if (!(ok[tabela] || []).includes(campo)) throw new Error('Este arquivo não pode ser apagado por aqui.');
  const r = buscar(d, tabela, id);
  if (!r || !r[campo]) throw new Error('Arquivo não encontrado.');
  atualizar(d, tabela, r.id, { [campo]: null }, usuario, `Comprovante apagado: ${r[campo]}`);
  if (tabela === 'depositos_garantia') {
    if (!r.complementar) acertarGarantiaDepositada(d, r.contrato_id, r.qual, usuario);
    sincronizarGarantiaHerdeiro(d, r.contrato_id, usuario);
  }
}

/**
 * Editar um depósito da garantia (data, valor, comprovante). Depois confere se a soma ainda cobre o valor inicial
 * (ou passou a cobrir). Caução com correções: o valor dos depósitos iniciais não muda (as correções partem dele).
 */
export function editarDepositoGarantia(d, id, dados, usuario) {
  const x = buscar(d, 'depositos_garantia', id);
  if (!x) throw new Error('Depósito não encontrado.');
  if (!dados.data) throw new Error('Informe a data do depósito.');
  if (!(dados.valor > 0)) throw new Error('Informe o valor depositado.');
  const c = buscar(d, 'contratos', x.contrato_id);
  if (!x.complementar && dados.valor !== x.valor && x.qual === 'caucao' && garantiaDepositada(c) && correcoesCaucaoAtual(d, c).length) {
    throw new Error('A caução já tem correções: exclua antes as correções para mudar o valor deste depósito.');
  }
  atualizar(d, 'depositos_garantia', x.id, dados, usuario, `${c.inquilino_nome}: depósito de ${C.reais(dados.valor)} de ${C.dataBr(dados.data)} alterado`);
  if (!x.complementar) {
    if (c[`${x.qual}_por_depositos`]) acertarGarantiaDepositada(d, c.id, x.qual, usuario);
    else completarPorDepositos(d, c, x.qual, usuario);
  }
  sincronizarGarantiaHerdeiro(d, c.id, usuario);
  return buscar(d, 'depositos_garantia', x.id);
}

/** Arquivo do documento já assinado (contrato, vistoria, chaves): anexa ou, com ``arquivo`` null, apaga só o arquivo (continua assinado). */
export function arquivoDocumento(d, contratoId, campo, arquivo, usuario) {
  const doc = DOCUMENTOS_ENTRADA.find(([k]) => k === campo);
  if (!doc) throw new Error('Documento desconhecido.');
  const c = buscar(d, 'contratos', contratoId);
  if (!c[campo]) throw new Error('Este documento ainda não foi marcado como assinado.');
  atualizar(d, 'contratos', c.id, { [campoArquivoDoc(campo)]: arquivo || null }, usuario,
    `${c.inquilino_nome}: ${doc[1].toLocaleLowerCase('pt-BR')}, arquivo ${arquivo ? `anexado (${arquivo})` : 'apagado'}`);
}

/**
 * Depois de excluída a renovação (já sem o registro): volta o prazo gravado por ela (data de término, prazo em meses e tipo),
 * se o contrato ainda está com o prazo dela e ela guardou o de antes. Devolve o texto para a tela (o que voltou, ou o aviso).
 */
function prazoDaRenovacaoDesfeita(d, c, ren, usuario) {
  const indeterminado = ren.tipo === 'Passou a prazo indeterminado' && !ren.nova_vigencia_fim;
  if (!ren.nova_vigencia_fim && !indeterminado) return '';
  const guardou = Object.prototype.hasOwnProperty.call(ren, 'vigencia_fim_anterior') || Object.prototype.hasOwnProperty.call(ren, 'prazo_tipo_anterior');
  const aindaDela = ren.nova_vigencia_fim ? c.vigencia_fim === ren.nova_vigencia_fim : c.prazo_tipo === 'Indeterminado';
  if (!guardou || !aindaDela) {
    return ren.nova_vigencia_fim ? ` A data de término do contrato continua ${C.dataBr(c.vigencia_fim || ren.nova_vigencia_fim)} (gravada com a renovação, que saiu junto): confira em "Editar contrato".`
      : ' O contrato continua por prazo indeterminado (gravado com a renovação, que saiu junto): confira em "Editar contrato".';
  }
  const mud = { vigencia_fim: ren.vigencia_fim_anterior ?? null, prazo_meses: ren.prazo_meses_anterior ?? null, prazo_tipo: ren.prazo_tipo_anterior || 'Determinado' };
  atualizar(d, 'contratos', c.id, mud, usuario, `${c.inquilino_nome}: ${mud.vigencia_fim ? `término do contrato volta a ${C.dataBr(mud.vigencia_fim)}` : 'o prazo do contrato volta ao de antes'} (termo aditivo do novo valor não valeu)`);
  return mud.vigencia_fim ? ` A data de término do contrato volta a ${C.dataBr(mud.vigencia_fim)}, a de antes da renovação.` : ' O prazo do contrato volta ao de antes da renovação.';
}

/**
 * Termo aditivo anexado que NÃO valeu (arquivo errado ou sem a assinatura de todos; decisão do dono, 21/11/2026, saida-031):
 * tira o arquivo e desfaz o que ele mudou. O termo assinado por todos não passa por aqui: sai com aviso e a mudança continua.
 * - Vencimento (ex.: dia 10 → 15 desde 15/12): o cadastro volta ao dia 10 e os boletos em aberto desde dezembro também, mesmo
 *   os alterados à mão (os valores ficam) e os emitidos no banco (com aviso para cancelar e emitir de novo; decisão de 2026-11-24,
 *   BOL-08); os pagos (também os que o banco já deu como pagos) ficam.
 * - Novo valor: o novo valor negociado sai (a renovação que o criou é excluída) e os boletos em aberto voltam ao aluguel anterior;
 *   a data de término gravada junto volta à de antes (CON-07).
 * - Troca de titular: o contrato volta a esperar o termo (o titular anterior continua cobrando); se a troca já foi completada
 *   (boletos e garantia passados ao novo), não dá para desfazer sozinho.
 * ``excluirTermo``: apaga também o termo (senão ele volta a "aguardando assinatura"). Devolve o texto do que foi desfeito.
 */
export function desfazerAditivo(d, id, usuario, { excluirTermo = false } = {}) {
  const a = buscar(d, 'aditivos', id);
  if (!a) throw new Error('Termo aditivo não encontrado.');
  const c = buscar(d, 'contratos', a.contrato_id);
  const troca = a.tipo === TIPO_ADITIVO_TROCA || (!a.tipo && !!c.contrato_anterior_id);
  if (troca && c.heranca_transferida) throw new C.ErroUsuario(`A troca de titular já foi completada (boletos e garantia passaram a ${c.inquilino_nome}): não dá para desfazer sozinho. Fale com o administrador antes de excluir este termo.`);
  const tirar = () => (excluirTermo ? excluir(d, 'aditivos', a.id, usuario, `${c.inquilino_nome}: termo aditivo de ${C.dataBr(a.data)} excluído (não valeu: arquivo errado ou sem a assinatura de todos)`)
    : atualizar(d, 'aditivos', a.id, { arquivo: null, assinado_em: null, perdido_em: null, perdido_pendente: null }, usuario, `${c.inquilino_nome}: arquivo do termo aditivo de ${C.dataBr(a.data)} apagado (não valeu: volta a aguardar assinatura)`));
  if (a.tipo === TIPO_ADITIVO_VALOR && a.renovacao_id && buscar(d, 'renovacoes', a.renovacao_id)) {
    const ren = buscar(d, 'renovacoes', a.renovacao_id);
    atualizar(d, 'aditivos', a.id, { arquivo: null, assinado_em: null, perdido_em: null, perdido_pendente: null }, usuario, `${c.inquilino_nome}: termo aditivo do novo valor não valeu`);
    excluirRenovacao(d, a.renovacao_id, usuario); // exclui também o termo (agora sem assinatura)
    // a data de término (ou o prazo indeterminado) gravada com a renovação volta à de antes (decisão do dono de 2026-11-24,
    // CON-07). Ex.: contrato até 10/07/2027, renovado até 10/01/2030 com o novo valor, termo "não valeu" → volta a 10/07/2027.
    // Renovação antiga (sem o prazo de antes guardado) ou prazo mudado depois por outro caminho: só avisa para conferir.
    const prazo = prazoDaRenovacaoDesfeita(d, c, ren, usuario);
    recalcularCobrancas(d, (cb) => cb.contrato_id === c.id, usuario);
    marcarAditivos(d, c.id, usuario);
    return `O novo valor de ${C.reais(a.valor_novo)} saiu: o aluguel volta a ${C.reais(a.valor_anterior)} nos boletos em aberto.${prazo}`;
  }
  tirar();
  marcarAditivos(d, c.id, usuario);
  if (a.dia_novo && a.primeiro_vencimento && a.dia_anterior) {
    if (c.dia_vencimento === a.dia_novo) atualizar(d, 'contratos', c.id, { dia_vencimento: a.dia_anterior }, usuario, `${c.inquilino_nome}: vencimento volta ao dia ${a.dia_anterior} (termo aditivo não valeu)`);
    const mes = a.primeiro_vencimento.slice(0, 7);
    // todos os boletos em aberto que foram para o dia novo voltam (decisão do dono de 2026-11-24, BOL-08): também os alterados
    // à mão (só o vencimento muda; os valores digitados ficam) e o já emitido no banco, que fica com o aviso para cancelar no
    // banco e emitir de novo (alertaReemitirNoBanco) até alguém resolver. O que o banco já deu como pago não se mexe.
    let n = 0;
    const reemitir = [];
    for (const cb of d.cobrancas.filter((x) => x.contrato_id === c.id && !x.data_pagamento && !emAcordo(x) && !ehBoletoAvulso(x) && x.vencimento && x.vencimento.slice(0, 7) >= mes)) {
      const venc = `${cb.vencimento.slice(0, 7)}-${String(Math.min(a.dia_anterior, C.diasNoMes(cb.vencimento.slice(0, 7)))).padStart(2, '0')}`;
      if (venc === cb.vencimento) continue;
      if (cb.banco && cb.banco.situacao === 'pago') {
        registrar(d, usuario, 'Alteração', 'cobrancas', cb.id, `Boleto ${C.compBr(cb.competencia)} já pago no banco: o vencimento continua ${C.dataBr(cb.vencimento)}; o termo aditivo não valeu e o dia volta a ${a.dia_anterior} (confira este boleto)`, null, { contrato_id: c.id, imovel_id: c.imovel_id });
        continue;
      }
      const noBanco = emitidoNoBanco(cb);
      const marca = noBanco ? { reemitir_banco: { vencimento_banco: cb.banco.vencimento || cb.vencimento, vencimento: venc, motivo: `termo aditivo de troca do vencimento (dia ${a.dia_novo}) não valeu` } } : {};
      atualizar(d, 'cobrancas', cb.id, { vencimento: venc, ...marca }, usuario, `Boleto ${C.compBr(cb.competencia)}${cb.editado_manual ? ' (alterado à mão: os valores ficam)' : ''}: vencimento ${C.dataBr(cb.vencimento)} → ${C.dataBr(venc)} (termo aditivo não valeu)${noBanco ? `; emitido no banco com vencimento ${C.dataBr(marca.reemitir_banco.vencimento_banco)}: cancele no banco e emita de novo` : ''}`);
      if (noBanco) reemitir.push(`${C.compBr(cb.competencia)} (no banco vence ${C.dataBr(marca.reemitir_banco.vencimento_banco)}, agora ${C.dataBr(venc)})`);
      n += 1;
    }
    return `O vencimento volta ao dia ${a.dia_anterior}${n ? ` (${n} boleto(s) em aberto ajustado(s))` : ''}.${reemitir.length ? ` Atenção: ${reemitir.length === 1 ? 'o boleto' : 'os boletos'} ${reemitir.join('; ')} ${reemitir.length === 1 ? 'já foi emitido' : 'já foram emitidos'} no banco: cancele no banco e emita de novo com o vencimento novo (o aviso fica na página do inquilino e no Painel até resolver).` : ''}`;
  }
  if (troca) {
    // o fim do vínculo gravado ao anexar o termo sai: o anterior volta a ser cobrado até um termo novo ser anexado (CON-02)
    const anterior = contratoHerdado(d, c);
    if (aditivoDaTroca(d, c)) return `Sem este termo, a troca de titular continua valendo pelo outro termo assinado: ${c.inquilino_nome} continua no contrato.`;
    soltarSaidaDoAnterior(d, c, usuario, 'o termo da troca de titular não valeu');
    const boletos = tirarBoletosDoNovoTitular(d, c, anterior, usuario);
    return `Sem o termo assinado, a troca de titular volta a esperar por ele: ${anterior ? anterior.inquilino_nome : 'o titular anterior'} continua no contrato.${boletos}`;
  }
  return '';
}

/**
 * Termo da troca de titular que não valeu: o boleto do novo titular só existe depois do termo assinado (decisão do dono de
 * 24/11/2026). Os do novo ainda não pagos nem emitidos no banco saem; no mês deles o anterior volta a ser cobrado pelo mês cheio
 * (o boleto dele é recalculado em ``soltarSaidaDoAnterior`` ou gerado aqui, se o mês já tinha boleto só do novo). Pago, emitido
 * no banco ou em acordo: fica, anotado no Histórico, e o texto devolvido avisa (o mês pode estar cobrado dos dois).
 * Ex.: troca em 15/12, boletos de dezembro gerados (anterior 14/30, novo 16/30 = R$ 960,00) e termo apagado → o do novo sai e o
 * do anterior volta a R$ 1.800,00. Troca em 01/12 → o boleto de dezembro do novo sai e o anterior ganha o de dezembro, cheio.
 */
function tirarBoletosDoNovoTitular(d, n, a, usuario) {
  const doNovo = d.cobrancas.filter((cb) => cb.contrato_id === n.id && !ehBoletoAvulso(cb)).sort((x, y) => x.competencia.localeCompare(y.competencia));
  if (!doNovo.length) return '';
  const tirados = [];
  const ficam = [];
  for (const cb of doNovo) {
    const motivo = cb.data_pagamento ? `pago em ${C.dataBr(cb.data_pagamento)}` : emitidoNoBanco(cb) ? 'emitido no banco' : emAcordo(cb) ? 'em acordo' : '';
    if (motivo) {
      ficam.push(`${C.compBr(cb.competencia)} (${motivo})`);
      registrar(d, usuario, 'Alteração', 'cobrancas', cb.id, `Boleto ${C.compBr(cb.competencia)} de ${n.inquilino_nome} ${motivo}: fica, mas o termo da troca de titular não valeu e ${a ? a.inquilino_nome : 'o titular anterior'} volta a ser cobrado neste mês (confira este boleto)`, null, { contrato_id: n.id, imovel_id: n.imovel_id });
      continue;
    }
    excluir(d, 'cobrancas', cb.id, usuario, `Boleto ${C.compBr(cb.competencia)} de ${n.inquilino_nome} excluído: o termo da troca de titular não valeu (o boleto do novo titular só existe com o termo assinado)`);
    tirados.push(cb.competencia);
  }
  if (a) {
    // mês que só tinha o boleto do novo (troca no dia 1º): o anterior passa a ter o dele, como teria se o termo não existisse
    for (const comp of tirados) {
      if (boletoDoMes(d, a.id, comp) || a.ativo === false || !a.imovel_id) continue;
      const dados = montarCobranca(d, a, comp);
      if (dados) inserir(d, 'cobrancas', dados, usuario, `Boleto ${C.compBr(comp)} gerado para ${a.inquilino_nome} (o termo da troca de titular não valeu)`);
    }
    if (tirados.length) { aplicarDiferencasPendentes(d, a.id, usuario); sincronizarMultas(d, a.id, usuario); realocarReserva(d, a, usuario); }
  }
  return `${tirados.length ? ` ${tirados.length === 1 ? 'O boleto' : 'Os boletos'} de ${n.inquilino_nome} (${tirados.map(C.compBr).join(', ')}) ${tirados.length === 1 ? 'saiu' : 'saíram'} e ${a ? a.inquilino_nome : 'o titular anterior'} volta a ser cobrado pelo mês cheio.` : ''}${ficam.length ? ` Atenção: ${ficam.length === 1 ? 'o boleto' : 'os boletos'} de ${n.inquilino_nome} ${ficam.join(', ')} ${ficam.length === 1 ? 'ficou' : 'ficaram'}: confira, porque o mês pode estar cobrado dos dois.` : ''}`;
}

/** Termo aditivo assinado: apaga só o arquivo; o termo volta a "aguardando assinatura". */
export function removerArquivoAditivo(d, id, usuario) {
  const a = buscar(d, 'aditivos', id);
  if (!a || !a.arquivo) throw new Error('Arquivo não encontrado.');
  const c = buscar(d, 'contratos', a.contrato_id);
  atualizar(d, 'aditivos', a.id, { arquivo: null, assinado_em: null }, usuario, `${c.inquilino_nome}: arquivo do termo aditivo de ${C.dataBr(a.data)} apagado (volta a aguardar assinatura)`);
  marcarAditivos(d, c.id, usuario);
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
  return faltam <= CR.regra('antecedencia_fiador', c) ? { nivel: 'aviso', tipo: 'Fiador', texto: `O vínculo do fiador termina em ${C.dataBr(fim)} (${C.faltamDias(faltam)}). Providencie a renovação ou outra garantia.` } : null;
}

/**
 * Lembrete depois da saída do inquilino: pedir a volta da titularidade das contas (água, energia, gás) para o proprietário.
 * Some quando houver um protocolo "Volta para o proprietário" registrado a partir da data de saída.
 */
/** Protocolo da volta das contas ao proprietário registrado para esta saída (do contrato, ou do imóvel desde a saída). */
export const titularidadeDevolvida = (d, c) => d.titularidades.some((t) => t.imovel_id === c.imovel_id && t.tipo === 'Volta para o proprietário'
  && (t.contrato_id === c.id || String(t.data || '') >= String(c.data_saida || '')));

export function alertaTitularidade(d, c, hoje = C.hojeIso()) {
  // troca de titular: as contas passam para o novo titular (não voltam para o proprietário)
  if (fimDeVinculo(d, c)) return null;
  if (!c.data_saida || !c.imovel_id || c.data_saida > C.somarDias(hoje, CR.regra('titularidade_dias_antes')) || c.data_saida < C.somarDias(hoje, -CR.regra('titularidade_dias_depois'))) return null;
  if (titularidadeDevolvida(d, c)) return null;
  return { nivel: 'aviso', tipo: 'Titularidade', ancora: 'titularidade',
    texto: `${c.data_saida <= hoje ? 'O inquilino saiu' : 'O inquilino sai'} em ${C.dataBr(c.data_saida)}: peça a mudança de titularidade das contas (água, energia, gás) de volta para o proprietário e registre o protocolo.` };
}

export function alertasContrato(d, contrato, hoje = C.hojeIso()) {
  // troca de titular agendada: reajuste, garantia, reserva e o alerta da vigência continuam no contrato anterior até a data
  const ag = herancaAgendada(d, contrato, hoje);
  return [
    contrato.verificar ? { nivel: 'aviso', tipo: 'A verificar', texto: contrato.verificar } : null,
    ag ? null : alertaReajuste(d, contrato, hoje),
    ag ? null : alertaCaucao(d, contrato),
    ag ? null : alertaReservaParada(d, contrato) || (() => { const comp = competenciaReserva(contrato); const cb = comp && boletoDoMes(d, contrato.id, comp); return alertas.alertaReserva(contrato.reserva_valor, saldoReserva(d, contrato), comp, hoje, comp ? (cb ? cb.vencimento : vencimentoDoContrato(d, contrato, comp)) : null); })(),
    // fim do contrato só por ``fimDoContrato``; com a saída já informada não há renovação a negociar
    ag || contrato.prazo_tipo === 'Indeterminado' || contrato.data_saida ? null : alertas.alertaVigencia(fimDoContrato(d, contrato) || contrato.vigencia_fim, hoje, contrato),
    ag ? null : alertaFiador(d, contrato, hoje),
    ag ? null : alertaAplicacao(d, contrato),
    ag ? null : alertaComprovantes(d, contrato),
    alertaRotinaEntrada(d, contrato, hoje),
    alertaAssinaturaFaltante(d, contrato, hoje),
    alertaPerdaAConfirmar(d, contrato, hoje),
    alertaAditivoPerdidoAConfirmar(d, contrato),
    alertaAditivoHerdeiro(d, contrato),
    alertaAditivoAguardando(d, contrato),
    alertaCondominio(contrato, hoje),
    alertaSeguroSemQuemPaga(contrato),
    alertaRessarcimentoEmAcordo(d, contrato),
    alertaRessarcimentoSemComprovante(d, contrato),
    alertaTermoAcordo(d, contrato),
    alertaNotificacoes(d, contrato, hoje),
    alertaReemitirNoBanco(d, contrato),
  ].filter(Boolean);
}

/**
 * Depois da saída (2026-11-20): enquanto o roteiro da saída não fecha (fora a pasta física), continuam os avisos que ainda
 * dependem de alguém: comprovantes (ex.: o da devolução do saldo da saída), termo do acordo e notificações com prazo ou multa.
 * Só saídas do último ano (dados antigos importados não enchem o Painel). Fim de vínculo por troca de titular fica de fora.
 */
function alertasDaSaidaContinuam(d, c, hoje) {
  if (!c.data_saida || c.data_saida > hoje || c.data_saida < C.somarDias(hoje, -365) || fimDeVinculo(d, c)) return false;
  return roteiroSaida(d, c, hoje).some((e) => e.chave !== 'arquivo' && !e.feito);
}
function alertasDepoisDaSaida(d, c, hoje) {
  // o ressarcimento lançado para depois da saída ou da troca de titular continua avisando (não abateu em nenhum boleto)
  return [alertaComprovantes(d, c), alertaTermoAcordo(d, c), alertaNotificacoes(d, c, hoje), alertaRessarcimentoEmAcordo(d, c)].filter(Boolean);
}
/** Alertas do inquilino (Painel e página dele): os do contrato ativo ou, depois da saída, os que ainda continuam. */
export function alertasDoInquilino(d, c, hoje = C.hojeIso()) {
  if (contratoAtivo(c, hoje)) return alertasContrato(d, c, hoje);
  if (alertasDaSaidaContinuam(d, c, hoje)) return alertasDepoisDaSaida(d, c, hoje);
  // crédito de ressarcimento sem acertar continua avisando também depois do roteiro e na troca de titular (só saídas do último ano)
  const credito = c.data_saida && c.data_saida >= C.somarDias(hoje, -365) ? alertaCreditoRessarcimento(d, c) : null;
  return credito ? [credito] : [];
}

/**
 * Etapas do acordo de dívida (pedido do dono em 2026-11-15: o termo assinado é uma etapa e se anexa pelo sistema):
 * acordo registrado → termo do acordo assinado (arquivo) → parcelas pagas. Ex.: acordo de 10/11/2026 em 3 boletos, 1 pago,
 * sem termo → [✓ registrado, ⬜ termo, ⬜ 1 de 3 pagos].
 */
export function etapasDoAcordo(d, a) {
  const p = parcelasDoAcordo(d, a);
  const pagas = p.filter((cb) => cb.data_pagamento).length;
  return [
    { chave: 'registrado', titulo: 'Acordo registrado', feito: true, detalhe: `${C.dataBr(a.data)}: ${a.referente} em ${a.parcelas} boleto(s), total ${C.reais(a.valor_total)}` },
    { chave: 'termo', titulo: 'Termo do acordo assinado', feito: !!a.termo_assinado, detalhe: a.termo_assinado ? 'anexado (vai para a pasta física do inquilino)' : 'anexe o termo assinado pelo inquilino (PDF ou foto)' },
    { chave: 'parcelas', titulo: 'Parcelas pagas', feito: p.length > 0 && pagas === p.length, detalhe: `${pagas} de ${p.length} paga(s)` },
  ];
}

/** Acordo (não desfeito) ainda sem o termo assinado anexado: alerta até anexar. */
/**
 * Boleto emitido no banco cujo vencimento voltou no sistema (termo de troca do vencimento que não valeu, BOL-08): enquanto o
 * banco continuar com o vencimento antigo, avisa para cancelar no banco e emitir de novo. Some sozinho quando o boleto é
 * cancelado, emitido de novo, atualizado no banco ou pago. Ex.: "Boleto de 12/2026 de Maria Teste: emitido no banco com
 * vencimento 20/12/2026. Cancele no banco e emita de novo com vencimento 10/12/2026".
 */
export const boletosParaReemitir = (d, c) => d.cobrancas.filter((cb) => cb.contrato_id === c.id && cb.reemitir_banco && !cb.data_pagamento
  && cb.banco && cb.banco.situacao === 'emitido' && (cb.banco.vencimento || cb.reemitir_banco.vencimento_banco) === cb.reemitir_banco.vencimento_banco
  && cb.reemitir_banco.vencimento_banco !== cb.vencimento);
function alertaReemitirNoBanco(d, c) {
  const l = boletosParaReemitir(d, c).sort((x, y) => String(x.vencimento).localeCompare(String(y.vencimento)));
  if (!l.length) return null;
  return { nivel: 'perigo', tipo: 'Banco', link: `#/cobranca/${l[0].id}`,
    texto: `${l.map((cb) => `Boleto de ${C.compBr(cb.competencia)} de ${c.inquilino_nome}: emitido no banco com vencimento ${C.dataBr(cb.reemitir_banco.vencimento_banco)}. Cancele no banco e emita de novo com vencimento ${C.dataBr(cb.vencimento)}`).join('. ')} (${l[0].reemitir_banco.motivo || 'o vencimento mudou depois da emissão'}).` };
}

function alertaTermoAcordo(d, c) {
  const l = (d.acordos || []).filter((a) => a.contrato_id === c.id && !a.desfeito_em && !a.termo_assinado);
  if (!l.length) return null;
  const p = parcelasDoAcordo(d, l[0])[0];
  return { nivel: 'aviso', tipo: 'Termo do acordo', link: p ? `#/cobranca/${p.id}` : null,
    texto: `falta anexar o termo assinado do acordo de ${l.map((a) => C.dataBr(a.data)).join(', ')} (no boleto do acordo, "Etapas do acordo").` };
}

/** Termo aditivo registrado como perdido por quem não é administrador: aguarda o administrador confirmar ou recusar. */
function alertaAditivoPerdidoAConfirmar(d, c) {
  const l = d.aditivos.filter((a) => a.contrato_id === c.id && aditivoPerdido(a) && a.perdido_pendente);
  if (!l.length) return null;
  return { nivel: 'aviso', tipo: 'Documento perdido a confirmar', ancora: 'aditivos',
    texto: `${l.map((a) => `termo aditivo de ${C.dataBr(a.data)} (${a.assunto}) registrado como perdido por ${a.perdido_pendente} em ${C.dataBr(a.perdido_em)}`).join('; ')}. O administrador confirma ou recusa.` };
}

/**
 * Termo aditivo gerado pelo sistema e ainda sem o arquivo assinado: alerta até anexar. Ex.: "aditivo de 20/10/2026 (troca do vencimento)".
 * O termo da troca de titular já está no alerta "Aditivo da troca de titular" (um aviso só).
 */
function alertaAditivoAguardando(d, c) {
  const naTroca = !!alertaAditivoHerdeiro(d, c);
  const l = aditivosAguardando(d, c.id).filter((a) => !(naTroca && a.tipo === 'Troca de titular'));
  if (!l.length) return null;
  return { nivel: 'aviso', tipo: 'Aditivo aguardando assinatura', ancora: 'aditivos',
    texto: `${l.length > 1 ? `${l.length} termos aditivos aguardando` : 'Termo aditivo aguardando'} assinatura: ${l.map((a) => `${C.dataBr(a.data)} (${a.assunto})`).join('; ')}. Colha as assinaturas e anexe o arquivo assinado.` };
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
/**
 * Troca de titular: documento já registrado como perdido num contrato anterior da cadeia (o mais recente), para o novo não
 * ficar cobrando o que não há mais como marcar. Devolve { data, contrato } ou null (também se há assinado ou perda própria).
 */
export function perdaHerdada(d, c, campo) {
  if (!d || c[campoPerdidoDoc(campo)] || documentoEntrada(d, c, campo)) return null;
  const x = [...cadeiaDeContratos(d, c).antes].reverse().find((a) => a[campoPerdidoDoc(campo)]);
  return x ? { data: x[campoPerdidoDoc(campo)], contrato: x } : null;
}
/** Anexo com assinatura faltante (null se não há, ou se o documento já está assinado). */
export const documentoParcial = (d, c, campo) => (c[campoParcialDoc(campo)] && !documentoEntrada(d, c, campo) ? c[campoParcialDoc(campo)] : null);
/** Documento que ainda falta: nem assinado, nem perdido, nem anexado com assinatura faltante. */
/**
 * Quem "continua o contrato de" outro (troca de titular) não gera contrato, vistoria nem termo das chaves novos:
 * herda os do contrato original. Devolve o contrato anterior imediato, ou null.
 */
export const contratoHerdado = (d, c) => (d && c.contrato_anterior_id ? buscar(d, 'contratos', c.contrato_anterior_id) || null : null);
/** Contrato que continua este (troca de titular): o mesmo contrato passou para outra pessoa. Null se não há. */
/**
 * Troca de titular: o prazo não recomeça, continua o do contrato que o novo titular assumiu (o fim da vigência do anterior).
 * Ex.: contrato de 27/01/2026 a 27/07/2028, troca em 27/04/2026 → o novo titular fica até 27/07/2028. Sem anterior ou sem fim: null.
 */
export function fimDoPrazoHerdado(d, c) {
  const a = contratoHerdado(d, c);
  return a && a.prazo_tipo !== 'Indeterminado' && a.vigencia_fim ? a.vigencia_fim : null;
}
/** Última renovação que mexeu no prazo do contrato (nova data de término ou prazo indeterminado), ou null. */
const renovacaoDoPrazo = (d, c) => (c && c.id ? (d.renovacoes || [])
  .filter((r) => r.contrato_id === c.id && (r.nova_vigencia_fim || r.tipo === 'Passou a prazo indeterminado'))
  .sort(C.maisRecentePrimeiro)[0] || null : null);
/** Data da renovação que fixou o fim do contrato (a última, com nova data de término), ou null. */
export const fimRenovado = (d, c) => { const r = renovacaoDoPrazo(d, c); return (r && r.nova_vigencia_fim) || null; };
/**
 * Fim do contrato de prazo determinado, num lugar só (cadastro, normalizar e troca de titular):
 * 1º renovado com nova data de término: a da última renovação (ex.: 05/03/2024 + 30 meses = 05/09/2026, renovado até
 *    05/09/2028 → 05/09/2028, também ao editar o telefone no cadastro);
 * 2º troca de titular: o do contrato assumido (o prazo não recomeça, `fimDoPrazoHerdado`);
 * 3º senão: data de vigência inicial (sem ela, a do contrato) + prazo em meses. Null se não dá para calcular.
 */
export function fimDoContrato(d, c) {
  const renovado = fimRenovado(d, c);
  if (renovado) return renovado;
  const herdado = fimDoPrazoHerdado(d, c);
  if (herdado) return herdado;
  const inicio = c.data_entrada || c.vigencia_inicio;
  return inicio && c.prazo_meses > 0 ? C.fimDoPrazo(inicio, c.prazo_meses) : null;
}
/** Prazo em meses do contrato: renovado, do início até o fim da renovação (05/03/2024 a 05/09/2028 = 54); senão, o gravado. */
export function prazoDoContrato(d, c) {
  const inicio = c.data_entrada || c.vigencia_inicio;
  const renovado = fimRenovado(d, c);
  if (renovado && inicio && renovado > inicio) return C.mesesDoPrazo(inicio, renovado);
  return c.prazo_meses || C.mesesDoPrazo(inicio, c.vigencia_fim) || C.mesesDoPrazo(c.vigencia_inicio, c.vigencia_fim);
}
export const continuadoPor = (d, c) => d.contratos.find((x) => x.contrato_anterior_id === c.id) || null;
/**
 * Fim do vínculo (e não saída): o contrato passou para outro titular, que continua com as mesmas regras e documentos.
 * O inquilino anterior não sai do imóvel nem faz cálculo final; o vínculo dele termina na véspera da troca.
 */
export const fimDeVinculo = (d, c) => !!(c.data_saida && continuadoPor(d, c));

/**
 * Troca de titular ainda não feita (data futura ou termo aditivo sem assinatura): devolve a data da troca (ou null).
 * Até lá, boletos, garantia, seguro e reserva continuam com o anterior. Ex.: hoje 28/10/2026, troca em
 * 01/12/2026 → o anterior paga até 30/11/2026 e o primeiro boleto do novo é o de 12/2026.
 */
export function herancaAgendada(d, c, hoje = C.hojeIso()) {
  const data = c.data_entrada || c.vigencia_inicio;
  return c.contrato_anterior_id && !c.heranca_transferida && data && (data > hoje || !aditivoDaTroca(d, c)) && contratoHerdado(d, c) ? data : null;
}

/**
 * Termo aditivo da troca de titular assinado (com o arquivo) no contrato do novo titular, ou null. Vale o gerado pelo sistema
 * (tipo "Troca de titular") ou o registrado à mão como o da troca; o registrado antes de 09/11/2026 (sem tipo) também vale,
 * como valia. Outro termo assinado (ex.: troca do vencimento, tipo "Vencimento"; à mão, "Outro") não faz o contrato passar.
 */
export const aditivoDaTroca = (d, c) => aditivosDo(d, c.id).find((a) => !a.tipo || a.tipo === TIPO_ADITIVO_TROCA) || null;

/**
 * Troca de titular sem o termo aditivo assinado: o contrato ainda é do anterior, mesmo passada a data da troca. O novo não tem
 * boleto nem correção do aluguel e o anterior continua ativo. Ex.: troca em 01/11/2026, assinado em 10/11/2026 → só então passa.
 */
export const trocaAguardaAditivo = (d, c) => !!(c.contrato_anterior_id && !c.heranca_transferida && contratoHerdado(d, c) && !aditivoDaTroca(d, c));
/** Barra correção do aluguel no novo titular enquanto o termo não está assinado. */
function exigirAditivoDaTroca(d, c) {
  if (trocaAguardaAditivo(d, c)) throw new Error(`O contrato ainda é de ${contratoHerdado(d, c).inquilino_nome}: lance a correção lá. Passa para ${c.inquilino_nome} com o termo aditivo assinado.`);
}

/**
 * Troca de titular: termina o vínculo do inquilino anterior na véspera da data da alteração (ex.: troca em 01/10/2026 →
 * vínculo até 30/09/2026). Os boletos dele vão até essa data e os do novo titular começam na data da troca.
 */
/** Registros da garantia que pertencem ao contrato (passam ao novo titular junto com a caução ou o depósito). */
const TABELAS_GARANTIA = ['depositos_garantia', 'correcoes_garantia', 'aplicacoes', 'trocas_garantia'];
/**
 * Pagamento da garantia (decisão de 2026-11-13): o comprovante, a data paga e os depósitos iniciais ficam no contrato de quem
 * pagou; o herdeiro mostra "caução herdada de Fulano, paga em …" apontando para o arquivo do anterior (``*_contrato``).
 */
const CAMPOS_PAGAMENTO_GARANTIA = ['comprovante_caucao', 'caucao_por_depositos', 'caucao_pago_em', 'comprovante_deposito', 'deposito_por_depositos', 'deposito_pago_em'];
const pagamentoDoAnterior = (t, x) => t === 'depositos_garantia' && !x.complementar;

/**
 * Contrato herdado (troca de titular): traz do titular anterior, a partir da data da troca (a entrada do novo), o que é
 * do contrato e não da pessoa. Ex.: troca em 01/10/2026:
 * - fim do vínculo do anterior em 30/09/2026;
 * - reajuste: a data-base continua a do contrato original; correções do aluguel a partir de 01/10/2026 passam ao novo,
 *   e o aluguel inicial do novo é o vigente do anterior em 30/09/2026 (se o novo ainda não tem correções próprias);
 * - caução / depósito de garantia: valores, depósitos, correções, aplicações, trocas e fiadores atuais passam ao novo
 *   (se o novo ainda não tem garantia própria registrada); os comprovantes mudam de pasta (lista ``arquivos``);
 * - boletos do anterior a partir de 10/2026 passam ao novo (a NF sai com os dados do novo titular), também os já pagos
 *   ainda sem NF; em aberto, saem se o novo já tem o do mês. Os dois contratos são recalculados. Boleto com NF emitida
 *   fica com o anterior (``comNf``).
 * Uma vez por contrato (marca ``heranca_transferida``).
 */
export function transferirHeranca(d, novoId, usuario, hoje = C.hojeIso()) {
  const n = buscar(d, 'contratos', novoId);
  const a = n && contratoHerdado(d, n);
  const data = n && (n.data_entrada || n.vigencia_inicio);
  if (!a || !data || n.heranca_transferida) return null;
  const fim = C.somarDias(data, -1);
  const out = { anterior: a, data, arquivos: [], correcoes: 0, garantia: false, boletosMovidos: 0, boletosApagados: 0, comNf: 0, noBanco: 0 };
  const passa = (tabela, x, texto) => atualizar(d, tabela, x.id, { contrato_id: n.id }, usuario, `${texto} passa de ${a.inquilino_nome} para ${n.inquilino_nome} (troca de titular)`);
  // troca numa data futura ou sem o termo assinado: o contrato (boletos, garantia, seguro, reserva) continua com o anterior;
  // agora só a data-base do reajuste e, com o termo assinado, o fim do vínculo dele (o último boleto sai proporcional). O resto passa depois.
  const assinado = !!aditivoDaTroca(d, n);
  if (data > hoje || !assinado) {
    if (!assinado && a.data_saida === fim) atualizar(d, 'contratos', a.id, { data_saida: null }, usuario, `${a.inquilino_nome}: continua no contrato até o termo aditivo ser assinado`);
    if (assinado && a.data_saida !== fim) atualizar(d, 'contratos', a.id, { data_saida: fim }, usuario, `${a.inquilino_nome}: fim do vínculo em ${C.dataBr(fim)} (o contrato continua com ${n.inquilino_nome} a partir de ${C.dataBr(data)})`);
    if (!n.data_base_correcao) atualizar(d, 'contratos', n.id, { data_base_correcao: dataBaseCorrecao(a) }, usuario, `${n.inquilino_nome}: reajuste no aniversário do contrato de ${a.inquilino_nome}`);
    // termo assinado antes da data: os boletos do anterior dos meses depois da troca passam já ao novo (como a janela da ciência
    // promete), e não só no dia. Antes, "Gerar boletos" nesse meio-tempo cobrava o mês dos dois (pedido do dono de 24/11/2026).
    // Ex.: troca em 01/12, boleto de dezembro de João gerado em 20/11, termo anexado em 22/11 → o boleto passa a Maria (R$ 1.800,00)
    if (assinado) passarBoletosAoNovo(d, n, a, fim, usuario, out, { soAluguel: true });
    recalcularCobrancas(d, (cb) => cb.contrato_id === a.id || (assinado && cb.contrato_id === n.id), usuario);
    // a reserva já aparece no novo (valor, comprovante e o que foi usado), para não abater de novo; no dia, confere o uso outra vez
    return { ...out, agendada: true, aguardaAditivo: !assinado, arquivosReserva: herdarReserva(d, n, a, usuario) };
  }
  encerrarVinculoPorContinuacao(d, a.id, data, n.inquilino_nome, usuario);
  // aluguel e reajuste
  const mud = { heranca_transferida: data };
  if (!n.data_base_correcao) mud.data_base_correcao = dataBaseCorrecao(a);
  const semCorrecoesProprias = !correcoesDo(d, n.id).length;
  if (semCorrecoesProprias) mud.aluguel_inicial = aluguelAtual(d, a, fim);
  for (const x of correcoesDo(d, a.id).filter((y) => y.data_vigencia >= data)) { passa('correcoes', x, `Correção do aluguel de ${C.dataBr(x.data_vigencia)}`); out.correcoes += 1; }
  // garantia em dinheiro (e fiadores atuais)
  const garantiaPropria = n.comprovante_caucao || n.comprovante_deposito || n.caucao_por_depositos || n.deposito_por_depositos
    // a correção da caução feita antes do dia da troca completa a garantia herdada: não é garantia própria
    || TABELAS_GARANTIA.some((t) => t !== 'correcoes_garantia' && (d[t] || []).some((x) => x.contrato_id === n.id));
  // garantia nova (a do anterior é devolvida a ele): nada da garantia passa; o anterior registra a devolução
  if (!garantiaPropria && !garantiaNova(n) && a.garantia_tipo && a.garantia_tipo !== 'Sem garantia' && !a.garantia_transferida_para) {
    // o pagamento (comprovante, data paga e depósitos iniciais) é de quem pagou: fica no anterior e aparece no novo
    // (sincronizarGarantiaHerdeiro, logo abaixo); correções, complementos, aplicações e trocas passam ao novo
    for (const k of CAMPOS_GARANTIA) mud[k] = CAMPOS_PAGAMENTO_GARANTIA.includes(k) ? null : a[k] ?? null;
    for (const t of TABELAS_GARANTIA) {
      for (const x of (d[t] || []).filter((y) => y.contrato_id === a.id && !pagamentoDoAnterior(t, y))) {
        if (x.comprovante) out.arquivos.push(x.comprovante);
        passa(t, x, TABELAS[t]);
      }
    }
    for (const f of d.fiadores.filter((x) => x.contrato_id === a.id && (!x.data_saida || x.data_saida >= data))) passa('fiadores', f, `Fiador ${f.nome}`);
    atualizar(d, 'contratos', a.id, { garantia_transferida_para: n.id }, usuario, `${a.inquilino_nome}: garantia passa para ${n.inquilino_nome} (troca de titular)`);
    out.garantia = true;
  }
  atualizar(d, 'contratos', n.id, mud, usuario, `${n.inquilino_nome}: dados do contrato trazidos de ${a.inquilino_nome} (troca de titular em ${C.dataBr(data)})`);
  if (out.garantia) sincronizarGarantiaHerdeiro(d, a.id, usuario);
  // boletos a partir do mês seguinte ao fim do vínculo
  passarBoletosAoNovo(d, n, a, fim, usuario, out);
  out.arquivosReserva = herdarReserva(d, n, a, usuario, true);
  out.arquivosSeguro = herdarSeguros(d, n, a, usuario);
  recalcularCobrancas(d, (cb) => cb.contrato_id === a.id || cb.contrato_id === n.id, usuario);
  desativarSeSaiu(d, a, usuario);
  out.arquivos = [...new Set(out.arquivos)];
  return out;
}

/**
 * Boletos do anterior dos meses depois do fim do vínculo (``fim``, a véspera da troca) passam ao novo titular: também os pagos
 * ainda sem NF; em aberto, saem se o novo já tem o do mês (o emitido no banco fica até ser cancelado lá); com NF emitida e parcelas
 * de acordo ficam com o anterior. ``soAluguel`` (termo assinado antes da data): só os boletos do aluguel; complemento da caução e
 * saldo esperam o dia da troca, junto com a garantia. Conta em ``out`` (boletosMovidos, boletosApagados, comNf, noBanco).
 */
function passarBoletosAoNovo(d, n, a, fim, usuario, out, { soAluguel = false } = {}) {
  for (const cb of d.cobrancas.filter((x) => x.contrato_id === a.id && x.competencia > fim.slice(0, 7))) {
    if (soAluguel && ehBoletoAvulso(cb)) continue;
    if (ehComplementoCaucao(cb) && !out.garantia) continue;
    // parcela de acordo: é dívida de quem saiu (débitos até a véspera ficam com ele, decisão de 2026-10-27)
    if (ehParcelaAcordo(cb)) continue;
    if (faturasDe(d, 'cobranca', cb.id).length) { out.comNf += 1; continue; }
    if (!cb.data_pagamento && !ehBoletoAvulso(cb) && boletoDoMes(d, n.id, cb.competencia)) {
      // emitido no banco: apagar aqui deixaria o boleto valendo no banco; fica com o anterior até ser cancelado lá (2026-11-20)
      if (emitidoNoBanco(cb)) { out.noBanco += 1; continue; }
      excluir(d, 'cobrancas', cb.id, usuario, `Boleto ${C.compBr(cb.competencia)} de ${a.inquilino_nome} excluído: o de ${n.inquilino_nome} já existe (troca de titular)`);
      out.boletosApagados += 1;
    } else {
      // a multa de notificação e a diferença antiga de quem sai ficam com ele (débitos dele): o novo recebe o boleto limpo
      limparDoAnterior(d, cb, a.id, usuario);
      atualizar(d, 'cobrancas', cb.id, { contrato_id: n.id }, usuario, `Boleto ${C.compBr(cb.competencia)} passa de ${a.inquilino_nome} para ${n.inquilino_nome} (troca de titular)`);
      out.boletosMovidos += 1;
    }
  }
}

/**
 * Reserva dada na visita na troca de titular: é do contrato. O novo titular recebe o valor, a data e o mês de uso; o que
 * o anterior já usou (nos boletos que ficaram com ele, ou abatido fora do sistema) não volta a abater. Ex.: reserva de
 * R$ 500,00 já usada no 1º aluguel do anterior → saldo R$ 0,00 no novo. Devolve o comprovante a copiar ([nome] ou []).
 */
export function herdarReserva(d, n, a, usuario, forcar = false) {
  if (!(a.reserva_valor > 0) || (n.reserva_usada_anterior !== undefined && !forcar)) return [];
  const usada = d.cobrancas.filter((cb) => cb.contrato_id === a.id).reduce((t, cb) => t + (cb.reserva_utilizada || 0), 0) + (a.reserva_abatida_valor || 0) + (a.reserva_usada_anterior || 0);
  const res = { reserva_valor: a.reserva_valor, reserva_data: a.reserva_data || null, reserva_competencia: a.reserva_competencia || null,
    reserva_usada_anterior: Math.min(usada, a.reserva_valor), reserva_abatida_comp: null, reserva_abatida_valor: null };
  const copiar = !n.comprovante_reserva && a.comprovante_reserva ? [a.comprovante_reserva] : [];
  if (copiar.length) res.comprovante_reserva = a.comprovante_reserva;
  atualizar(d, 'contratos', n.id, res, usuario, `${n.inquilino_nome}: reserva de ${C.reais(a.reserva_valor)} do contrato (já usada ${C.reais(res.reserva_usada_anterior)} por ${a.inquilino_nome})`);
  return copiar;
}

/** Meses em que a reserva foi usada nos contratos anteriores até ``a`` (boletos ou abatida fora do sistema). Ex.: ['2026-06']. */
export function mesesUsoReserva(d, a) {
  const meses = [...cadeiaDeContratos(d, a).antes, a].flatMap((x) => [
    ...d.cobrancas.filter((cb) => cb.contrato_id === x.id && cb.reserva_utilizada > 0).map((cb) => cb.competencia),
    ...(x.reserva_abatida_valor > 0 && x.reserva_abatida_comp ? [x.reserva_abatida_comp] : [])]);
  return [...new Set(meses)].sort();
}

/**
 * O que passa ao novo titular quando o termo da troca é anexado (para a janela de ciência de quem anexa): textos curtos.
 * Ex.: ["Contrato, prazo e reajuste: continuam os de Fulano (o prazo não recomeça)", "Caução de R$ 4.000,00 …", …].
 */
export function resumoDaHeranca(d, n) {
  const a = contratoHerdado(d, n);
  if (!a) return [];
  const data = n.data_entrada || n.vigencia_inicio;
  const comp = data ? data.slice(0, 7) : null;
  const out = [`Contrato, prazo e reajuste: continuam os de ${a.inquilino_nome} (o prazo não recomeça; reajuste no aniversário do contrato original)`];
  // o mesmo corte de transferirHeranca: passam os boletos dos meses depois do fim do vínculo (véspera da troca)
  const corte = data ? C.somarDias(data, -1).slice(0, 7) : null;
  const boletos = corte ? d.cobrancas.filter((cb) => cb.contrato_id === a.id && cb.competencia > corte && !ehParcelaAcordo(cb) && !faturasDe(d, 'cobranca', cb.id, false).length) : [];
  out.push(boletos.length ? `Boletos a partir de ${C.compBr(C.somarMeses(corte, 1))} sem NF (${boletos.length}): passam para o nome de ${n.inquilino_nome}` : `Boletos: a partir de ${data ? C.dataBr(data) : 'a troca'} saem no nome de ${n.inquilino_nome}`);
  // troca no meio do mês: o boleto do mês da troca fica com o anterior (proporcional até a véspera) e o novo tem o dele
  if (data && data.slice(8, 10) !== '01') out.push(`Mês da troca (${C.compBr(comp)}): dividido entre os dois; ${a.inquilino_nome} paga até ${C.dataBr(C.somarDias(data, -1))} e ${n.inquilino_nome} a partir de ${C.dataBr(data)}, cada um no seu boleto`);
  const parcelas = d.cobrancas.filter((cb) => cb.contrato_id === a.id && ehParcelaAcordo(cb) && !cb.data_pagamento);
  if (parcelas.length) out.push(`Parcelas do acordo de dívida em aberto (${parcelas.length}): continuam no nome de ${a.inquilino_nome} (débitos até a véspera da troca são de quem sai)`);
  const g = textoGarantiaNaTroca(d, n, a);
  if (g) out.push(garantiaNova(n) ? g.nova : g.continua);
  const reserva = a.reserva_valor > 0 ? saldoReserva(d, a) : 0;
  if (reserva > 0) out.push(`Reserva: saldo de ${C.reais(reserva)} passa para ${n.inquilino_nome}`);
  const seguros = segurosAHerdar(d, n, a);
  if (seguros.length) out.push(`Seguro: apólice em vigência (${seguros.map((s) => `${C.dataBr(s.vigencia_inicio)} a ${C.dataBr(s.vigencia_fim)}`).join('; ')}) passa para ${n.inquilino_nome}; no histórico de ${a.inquilino_nome} ela continua aparecendo`);
  out.push(`${a.inquilino_nome} fica com fim do vínculo em ${data ? C.dataBr(C.somarDias(data, -1)) : 'a véspera da troca'} e continua respondendo pelo período até essa data`);
  out.push(`Contas de consumo: a empresa troca a titularidade para o nome de ${n.inquilino_nome} (autorização no termo)`);
  return out;
}

/**
 * Os dois textos da garantia na troca de titular (a janela de confirmação do termo mostra os dois para escolher), ou null
 * (sem garantia). Ex.: { continua: "Garantia: a mesma caução de R$ 2.430,00, paga por Ana em 08/06/2026 …", nova: "Garantia: nova …" }.
 */
export function textoGarantiaNaTroca(d, n, a = contratoHerdado(d, n)) {
  if (!a || !a.garantia_tipo || a.garantia_tipo === 'Sem garantia') return null;
  const dinheiro = temCaucao(a) || temDeposito(a);
  const qual = temCaucao(a) ? 'caucao' : 'deposito';
  const g = GARANTIAS_DEPOSITADAS[qual];
  const pago = dinheiro && garantiaDepositada(a) ? (a[g.pago] || (depositosGarantiaDo(d, a, qual).filter((x) => !x.complementar).pop() || {}).data) : null;
  const continua = dinheiro
    ? `Garantia: a mesma ${g.nome} de ${C.reais(valorGarantia(d, a))}${pago ? `, paga por ${a.inquilino_nome} em ${C.dataBr(pago)}` : ` (ainda sem comprovante: anexe no contrato de ${a.inquilino_nome})`}, passa a garantir ${n.inquilino_nome}. O comprovante e a data do pagamento continuam no contrato de ${a.inquilino_nome} e aparecem em ${n.inquilino_nome} como "herdada"; correções, complemento e aplicação passam a ser lançados em ${n.inquilino_nome}`
    : `Garantia: ${a.garantia_tipo} continua (os fiadores garantem ${n.inquilino_nome})`;
  const nova = `Garantia: nova (${dinheiro ? `a ${g.nome} de ${a.inquilino_nome} é devolvida a ele, com a correção; ` : ''}${n.inquilino_nome} presta a sua, com a data e o comprovante do depósito na página dele)`;
  return { continua, nova, dinheiro };
}

/** Apólices que passaram deste contrato ao novo titular na troca (continuam no histórico do anterior, só para consulta). */
export const segurosPassadosAoHerdeiro = (d, contratoId) => d.seguros.filter((s) => contratoId && s.herdado_de === contratoId && s.contrato_id !== contratoId);

/** Apólices do anterior ainda em vigência na troca de titular (fim da vigência na data da troca ou depois): vão ao herdeiro. */
const segurosAHerdar = (d, n, a) => {
  const data = n.data_entrada || n.vigencia_inicio;
  return data ? segurosDoContrato(d, a.id).filter((s) => s.vigencia_fim >= data) : [];
};

/**
 * Seguro na troca de titular: a locação continua, então a apólice em vigência (com a apólice e os outros arquivos) passa ao
 * novo titular; as que já tinham vencido antes da troca ficam com o anterior. Ex.: troca em 01/10/2026, apólice de
 * 16/10/2025 a 16/10/2026 → vai para o novo. Devolve os arquivos a mudar da pasta de seguro do anterior para a do novo.
 */
export function herdarSeguros(d, n, a, usuario) {
  const arquivos = [];
  for (const s of segurosAHerdar(d, n, a)) {
    arquivos.push(...[s.arquivo_apolice, ...(s.outros_arquivos || [])].filter(Boolean));
    atualizar(d, 'seguros', s.id, { contrato_id: n.id, herdado_de: a.id }, usuario, `Seguro (vigência ${C.dataBr(s.vigencia_inicio)} a ${C.dataBr(s.vigencia_fim)}) passa de ${a.inquilino_nome} para ${n.inquilino_nome} (troca de titular)`);
  }
  return [...new Set(arquivos)];
}

/** O contrato anterior ainda guarda a garantia em dinheiro (comprovante, depósitos, correções, aplicações) que é do herdeiro. */
const garantiaAHerdar = (d, a) => !!(a && (temCaucao(a) || temDeposito(a)) && !a.garantia_transferida_para
  && (a.comprovante_caucao || a.comprovante_deposito || a.caucao_por_depositos || a.deposito_por_depositos || TABELAS_GARANTIA.some((t) => (d[t] || []).some((x) => x.contrato_id === a.id))));

/**
 * Garantia já passada ao herdeiro (``garantia_transferida_para``) com lançamentos que ainda ficaram no contrato anterior:
 * aplicações e correções da caução registradas lá depois da troca (ex.: aplicação lançada pela página do titular anterior).
 * Os depósitos não entram: o comprovante deles aparece no herdeiro por sincronizarGarantiaHerdeiro.
 */
const LANCAMENTOS_GARANTIA_HERDADA = ['aplicacoes', 'correcoes_garantia'];
const lancamentosNoAnterior = (d, n, a) => (a && a.garantia_transferida_para === n.id
  ? LANCAMENTOS_GARANTIA_HERDADA.flatMap((t) => (d[t] || []).filter((x) => x.contrato_id === a.id).map((x) => ({ tabela: t, registro: x }))) : []);

/**
 * Boletos que ficaram no contrato anterior depois de a troca de titular já ter sido feita (ex.: importados depois, no nome
 * de quem saiu): os de competência depois do fim do vínculo são do novo titular, também os pagos e com NF (a NF guarda o
 * tomador de quando foi emitida). Ficam: o complemento da caução que não passou ao novo, e o boleto do aluguel de um mês
 * que o novo já tem (repetido: conferir à mão). Ex.: Bruno continua o contrato de Ana desde 01/07/2025; boletos de
 * 07/2025 a 08/2026 importados em Ana → passam a Bruno.
 */
function boletosNoAnterior(d, n, a) {
  if (!n.heranca_transferida || !a || (continuadoPor(d, a) || {}).id !== n.id) return [];
  const ultimoMes = C.somarDias(n.heranca_transferida, -1).slice(0, 7);
  return d.cobrancas.filter((cb) => cb.contrato_id === a.id && cb.competencia > ultimoMes && !ehParcelaAcordo(cb)
    && !(ehComplementoCaucao(cb) && a.garantia_transferida_para !== n.id)
    && (ehBoletoAvulso(cb) || !boletoDoMes(d, n.id, cb.competencia)));
}

/**
 * Herança já feita em que ficou faltando a garantia (ou lançamentos dela), a reserva (valor, comprovante ou o já usado) ou o
 * seguro do contrato anterior. Troca com data futura: só a reserva; o resto passa no dia.
 */
export function herancaIncompleta(d, c) {
  const feita = !!c.heranca_transferida;
  const a = (feita || herancaAgendada(d, c)) && contratoHerdado(d, c);
  if (!a) return null;
  const reserva = a.reserva_valor > 0 && (!(c.reserva_valor > 0) || (a.comprovante_reserva && !c.comprovante_reserva) || c.reserva_usada_anterior === undefined);
  if (!feita) return reserva ? { garantia: false, reserva, seguro: false, lancamentos: 0, anterior: false } : null;
  const garantia = !garantiaNova(c) && garantiaAHerdar(d, a) && continuadoPor(d, a) && continuadoPor(d, a).id === c.id;
  const seguro = segurosAHerdar(d, c, a).length > 0 && continuadoPor(d, a) && continuadoPor(d, a).id === c.id;
  const lancamentos = lancamentosNoAnterior(d, c, a).length;
  const anterior = !!pagamentoPerdidoNoAnterior(d, c, a);
  const boletos = boletosNoAnterior(d, c, a).length;
  return garantia || reserva || seguro || lancamentos || anterior || boletos ? { garantia, reserva, seguro, lancamentos, anterior, boletos } : null;
}

/**
 * Completa uma herança já feita: traz do contrato anterior a garantia em dinheiro que ficou nele (valores, comprovantes,
 * depósitos, correções, aplicações, trocas e fiadores atuais), somando ao que o herdeiro já tiver registrado, e a reserva
 * (se o herdeiro ficou sem). Devolve { arquivos (comprovantes a mudar de pasta), arquivosReserva (a copiar), garantia, reserva }.
 */
export function completarHeranca(d, novoId, usuario) {
  const n = buscar(d, 'contratos', novoId);
  const falta = n && herancaIncompleta(d, n);
  if (!falta) return null;
  const a = contratoHerdado(d, n);
  const out = { anterior: a, arquivos: [], arquivosReserva: [], arquivosSeguro: [], garantia: false, reserva: false, seguro: false, aplicacoes: 0, correcoes: 0, boletos: 0 };
  // boletos depois da troca que ficaram no anterior: passam ao novo titular (o pagamento consta de quem é o titular)
  if (falta.boletos) {
    let reservaUsada = 0;
    for (const cb of boletosNoAnterior(d, n, a)) {
      reservaUsada += cb.reserva_utilizada || 0;
      limparDoAnterior(d, cb, a.id, usuario); // multa e diferença de quem saiu ficam com ele
      atualizar(d, 'cobrancas', cb.id, { contrato_id: n.id }, usuario, `Boleto ${C.compBr(cb.competencia)} passa de ${a.inquilino_nome} para ${n.inquilino_nome} (titular desde ${C.dataBr(n.heranca_transferida)})`);
      out.boletos += 1;
    }
    // a reserva usada nesses boletos agora aparece neles, no novo: não conta de novo como usada pelo anterior
    if (reservaUsada && n.reserva_usada_anterior > 0) atualizar(d, 'contratos', n.id, { reserva_usada_anterior: Math.max(n.reserva_usada_anterior - reservaUsada, 0) }, usuario, `${n.inquilino_nome}: reserva usada nos boletos trazidos de ${a.inquilino_nome}`);
    recalcularCobrancas(d, (cb) => cb.contrato_id === n.id, usuario);
  }
  // lançamentos da garantia já herdada feitos depois no anterior (aplicação, correção da caução): passam, com o comprovante
  for (const { tabela, registro: x } of lancamentosNoAnterior(d, n, a)) {
    if (x.comprovante) out.arquivos.push(x.comprovante);
    atualizar(d, tabela, x.id, { contrato_id: n.id }, usuario, `${TABELAS[tabela]} de ${C.dataBr(x.data)} passa de ${a.inquilino_nome} para ${n.inquilino_nome} (garantia herdada)`);
    if (tabela === 'aplicacoes') out.aplicacoes += 1; else out.correcoes += 1;
  }
  if (falta.seguro) {
    out.arquivosSeguro = herdarSeguros(d, n, a, usuario);
    recalcularCobrancas(d, (cb) => cb.contrato_id === a.id || cb.contrato_id === n.id, usuario);
    out.seguro = true;
  }
  if (falta.garantia) {
    // valores da garantia: os do contrato (o que o herdeiro tiver e o anterior não, fica)
    const mud = {};
    // comprovante que o herdeiro já tem (anexado nele) fica; o do anterior só vem se faltar no herdeiro
    const proprio = (k) => ['comprovante_caucao', 'comprovante_deposito'].includes(k) && n[k];
    // o pagamento (comprovante, data, depósitos iniciais) fica no anterior e aparece no herdeiro (sincronizarGarantiaHerdeiro)
    for (const k of CAMPOS_GARANTIA) if (a[k] !== undefined && a[k] !== null && a[k] !== '' && !proprio(k) && !CAMPOS_PAGAMENTO_GARANTIA.includes(k)) mud[k] = a[k];
    const data = n.data_entrada || n.vigencia_inicio;
    const proprios = (d.depositos_garantia || []).filter((y) => y.contrato_id === n.id && !y.complementar);
    const passa = (t, x, texto) => atualizar(d, t, x.id, { contrato_id: n.id }, usuario, `${texto} passa de ${a.inquilino_nome} para ${n.inquilino_nome} (troca de titular)`);
    for (const t of TABELAS_GARANTIA) {
      for (const x of (d[t] || []).filter((y) => y.contrato_id === a.id && !pagamentoDoAnterior(t, y))) {
        if (x.comprovante) out.arquivos.push(x.comprovante);
        passa(t, x, TABELAS[t]);
      }
    }
    for (const f of d.fiadores.filter((x) => x.contrato_id === a.id && (!x.data_saida || !data || x.data_saida >= data))) passa('fiadores', f, `Fiador ${f.nome}`);
    // depósitos que o herdeiro tinha lançado por conta própria repetiam a caução (que é a herdada): saem, sem somar
    for (const x of proprios) excluir(d, 'depositos_garantia', x.id, usuario, `${n.inquilino_nome}: depósito de ${C.reais(x.valor)} de ${C.dataBr(x.data)} substituído pela caução herdada de ${a.inquilino_nome}`);
    // o comprovante próprio do herdeiro (anexado nele) fica; sem ele, vale o do anterior
    for (const [qual, g] of Object.entries(GARANTIAS_DEPOSITADAS)) if (!n[g.comprovante]) { mud[`${qual}_por_depositos`] = null; mud[g.pago] = null; }
    atualizar(d, 'contratos', n.id, mud, usuario, `${n.inquilino_nome}: garantia trazida de ${a.inquilino_nome} (troca de titular)`);
    atualizar(d, 'contratos', a.id, { garantia_transferida_para: n.id }, usuario, `${a.inquilino_nome}: garantia passa para ${n.inquilino_nome} (troca de titular)`);
    sincronizarGarantiaHerdeiro(d, a.id, usuario);
    out.garantia = true;
  }
  if (falta.anterior) out.comprovanteAnterior = restaurarPagamentoDoAnterior(d, n, a, usuario);
  if (falta.reserva) {
    out.arquivosReserva = herdarReserva(d, n, a, usuario, true);
    recalcularCobrancas(d, (cb) => cb.contrato_id === n.id, usuario);
    out.reserva = true;
  }
  out.arquivos = [...new Set(out.arquivos)];
  return out;
}

/**
 * Troca de titular: a garantia continua a mesma (passa ao novo titular; padrão, também nas trocas antigas) ou é nova
 * (``garantia_na_troca`` = 'nova'): a do anterior é devolvida a ele e o novo presta a sua, de qualquer tipo.
 */
export const garantiaNova = (c) => !!(c && c.garantia_na_troca === 'nova');
export const devolucoesGarantiaDo = (d, contratoId) => (d.devolucoes_garantia || []).filter((x) => x.contrato_id === contratoId);
/** Devolução na troca de titular (a do contrato anterior); as das trocas de garantia têm ``troca_id``. */
export const devolucoesDaTrocaDeTitular = (d, contratoId) => devolucoesGarantiaDo(d, contratoId).filter((x) => !x.troca_id);
export const devolucaoDaTrocaDeGarantia = (d, trocaId) => (d.devolucoes_garantia || []).find((x) => x.troca_id === trocaId) || null;

/**
 * Decisão da direção (2026-11-13): garantia em dinheiro (caução ou depósito) nunca passa de um inquilino a outro nem de uma
 * garantia a outra. Na troca de titular e na troca de garantia, a empresa saca o valor com a poupança e devolve a quem
 * depositou; quem entra (ou a garantia nova) faz o depósito do valor certo. Ex.: caução de João, R$ 3.800,00 depositados,
 * R$ 4.371,39 com a poupança → devolve R$ 4.371,39 a João; Maria deposita 2 × R$ 1.900,00 = R$ 3.800,00.
 * Diz se a garantia do contrato é das que se devolvem (a tela da troca de titular não oferece "continua a mesma").
 */
export const garantiaDevolvidaNaTroca = (c) => !!c && (temCaucao(c) || temDeposito(c));

/**
 * Trocas de garantia em que saiu caução ou depósito ainda não devolvido: [{ troca, valor }]. Só as trocas feitas depois da
 * decisão (guardam ``devolucao_movimentos``): as antigas ficam como estavam (o que houve está nas observações da troca).
 */
export const devolucoesDeTrocaPendentes = (d, c) => trocasGarantiaDo(d, c.id)
  .filter((t) => t.devolucao_movimentos && t.valor_anterior > 0 && !devolucaoDaTrocaDeGarantia(d, t.id))
  .map((t) => ({ troca: t, valor: t.valor_anterior }));

/**
 * Contrato anterior (troca de titular com garantia nova) com caução ou depósito ainda não devolvido: { herdeiro, valor } ou null.
 * Ex.: caução de Ana corrigida para R$ 5.670,00; Bruno assume em 15/11/2026 com garantia nova → devolver R$ 5.670,00 a Ana.
 */
export function devolucaoGarantiaPendente(d, a, hoje = C.hojeIso()) {
  const n = continuadoPor(d, a);
  if (!garantiaNova(n) || !(temCaucao(a) || temDeposito(a)) || devolucoesDaTrocaDeTitular(d, a.id).length) return null;
  // a troca ainda não aconteceu (data não chegou ou termo da troca sem assinatura): a garantia continua valendo (2026-11-20)
  if (herancaAgendada(d, n, hoje)) return null;
  const depositado = garantiaDepositada(a) || somaDepositos(d, a, temCaucao(a) ? 'caucao' : 'deposito') > 0;
  const valor = valorGarantia(d, a);
  return depositado && valor > 0 ? { herdeiro: n, valor } : null;
}

/**
 * Devolução da garantia ao titular anterior (troca com garantia nova): como no cálculo final da saída, a garantia corrigida
 * pela poupança menos os débitos dele. Ex.: R$ 5.670,00 + 1,20% = R$ 5.738,04; débitos R$ 300,00 → devolve R$ 5.438,04.
 * ``id``: edita a devolução já registrada. Com ``dados.troca_id``: devolução da caução ou do depósito que saiu numa troca de
 * garantia do mesmo inquilino (ex.: caução → fiador), do mesmo jeito.
 */
export function salvarDevolucaoGarantia(d, contratoId, dados, usuario, id = null) {
  const a = buscar(d, 'contratos', contratoId);
  const trocaId = dados.troca_id || (id && (buscar(d, 'devolucoes_garantia', id) || {}).troca_id) || null;
  const troca = trocaId ? buscar(d, 'trocas_garantia', trocaId) : null;
  if (trocaId) {
    if (!troca || troca.contrato_id !== a.id || !(troca.valor_anterior > 0)) throw new Error('Troca de garantia não encontrada, ou sem caução nem depósito a devolver.');
    if (!id && devolucaoDaTrocaDeGarantia(d, troca.id)) throw new Error('A devolução da garantia desta troca já foi registrada.');
  } else {
    if (!garantiaNova(continuadoPor(d, a))) throw new Error('A garantia deste contrato continua com o novo titular: não há devolução na troca.');
    if (!id && devolucoesDaTrocaDeTitular(d, a.id).length) throw new Error('A devolução da garantia já foi registrada.');
  }
  const { garantia_corrigida, saldo } = calcularEncerramento(dados.garantia_valor, dados.indice_percentual, dados.debitos, 0, 0, dados.creditos);
  // troca de titular: o ressarcimento do condomínio cujo boleto passou ao novo titular volta a quem pagou, como crédito (24/11/2026)
  const creditados = !trocaId && dados.creditos > 0 ? ressarcimentosCreditados(d, a, dados.creditos_descricao) : [];
  const reg = { ...dados, contrato_id: a.id, troca_id: trocaId, garantia_corrigida, saldo, ressarcimentos_creditados: creditados };
  const texto = `${a.inquilino_nome}: garantia devolvida em ${C.dataBr(dados.data)}, ${C.reais(saldo)} (${troca ? `troca de garantia de ${C.dataBr(troca.data)}` : 'troca de titular com garantia nova'})`;
  let r;
  if (id) { atualizar(d, 'devolucoes_garantia', id, reg, usuario, texto); r = buscar(d, 'devolucoes_garantia', id); } else r = inserir(d, 'devolucoes_garantia', reg, usuario, texto);
  // troca de titular: os boletos em aberto descontados nos débitos (linha "Aluguel MM/AAAA em aberto" mantida) não se cobram mais,
  // como no cálculo final da saída; excluir a devolução os libera. Na troca de garantia o inquilino continua (os boletos seguem).
  if (!trocaId) {
    liberarBoletosDaDevolucao(d, r.id, usuario);
    for (const cb of boletosDescontadosNaSaida(d, a, dados.debitos_descricao)) {
      atualizar(d, 'cobrancas', cb.id, { quitado_devolucao: r.id, situacao: 'Descontado da garantia' }, usuario, `Boleto ${C.compBr(cb.competencia)} descontado da garantia devolvida na troca de titular`);
    }
  }
  return r;
}

/** Devolução da garantia da troca de titular excluída (ou refeita): os boletos que ela descontava voltam a ser cobrados. */
export function liberarBoletosDaDevolucao(d, devolucaoId, usuario) {
  for (const cb of d.cobrancas.filter((x) => x.quitado_devolucao === Number(devolucaoId))) {
    atualizar(d, 'cobrancas', cb.id, { quitado_devolucao: null, situacao: cb.data_pagamento ? cb.situacao : 'Em aberto' }, usuario, `Boleto ${C.compBr(cb.competencia)} volta a ser cobrado (devolução da garantia desfeita)`);
  }
}

/**
 * Troca de titular com garantia nova, a partir da data da troca: devolver a garantia ao anterior e anexar o comprovante.
 * Fica no contrato anterior (já sem vínculo, por isso fora dos alertas dos contratos ativos).
 */
export function alertaDevolucaoGarantia(d, a, hoje = C.hojeIso()) {
  const p = devolucaoGarantiaPendente(d, a);
  if (p && (p.herdeiro.data_entrada || p.herdeiro.vigencia_inicio || hoje) <= hoje) {
    return { nivel: 'aviso', tipo: 'Devolver garantia', ancora: 'garantia',
      texto: `${p.herdeiro.inquilino_nome} assumiu o contrato com garantia nova: devolva ${temCaucao(a) ? 'a caução' : 'o depósito de garantia'} de ${C.reais(p.valor)} a ${a.inquilino_nome} (com a correção, descontados os débitos) e registre a devolução.` };
  }
  // troca de garantia do mesmo inquilino: a caução ou o depósito que saiu volta a ele, com a poupança
  const t = devolucoesDeTrocaPendentes(d, a)[0];
  if (t) {
    return { nivel: 'aviso', tipo: 'Devolver garantia', ancora: 'garantia',
      texto: `Garantia trocada em ${C.dataBr(t.troca.data)} (${t.troca.tipo_anterior} → ${t.troca.tipo_novo}): devolva ${C.reais(t.valor)} a ${a.inquilino_nome}, com a correção da poupança, e registre a devolução.` };
  }
  const x = devolucoesGarantiaDo(d, a.id).find((y) => !y.comprovante && y.saldo > 0);
  return x ? { nivel: 'aviso', tipo: 'Comprovante a buscar no banco', ancora: 'garantia',
    texto: `Anexe o comprovante: devolução da garantia a ${a.inquilino_nome} de ${C.reais(x.saldo)} (${C.dataBr(x.data)}).` } : null;
}

/**
 * Contrato que guarda a garantia em dinheiro de quem sai na troca de titular: o anterior, ou o novo quando a garantia já
 * passou a ele (a mesma garantia, com as correções e os complementos). Null sem caução nem depósito.
 * É de onde sai o valor com os rendimentos da poupança que entra no termo da troca (movimentosGarantia).
 */
export function contratoDaGarantiaNaTroca(d, n) {
  const a = contratoHerdado(d, n);
  if (!a) return null;
  const c = !garantiaNova(n) && garantiaHerdada(d, n) ? n : a;
  return temCaucao(c) || temDeposito(c) ? c : null;
}

/** Garantia do herdeiro que veio do contrato anterior (não se remove nem se desfaz: muda só por "Corrigir caução"). */
export const garantiaHerdada = (d, c) => { const a = contratoHerdado(d, c); return !!(a && a.garantia_transferida_para === c.id); };

/**
 * Garantia herdada cuidada no contrato do titular anterior: o que for anexado lá (comprovante do depósito da caução ou do
 * depósito de garantia, data do depósito) aparece no novo titular. O arquivo fica na pasta do anterior
 * (``comprovante_caucao_contrato`` / ``comprovante_deposito_contrato`` = id do anterior). Devolve o herdeiro atualizado ou null.
 */
export function sincronizarGarantiaHerdeiro(d, anteriorId, usuario, vistos = new Set()) {
  const a = buscar(d, 'contratos', anteriorId);
  const n = a && a.garantia_transferida_para && buscar(d, 'contratos', a.garantia_transferida_para);
  if (!n || vistos.has(a.id)) return null;
  vistos.add(a.id);
  const mud = {};
  for (const [qual, g] of Object.entries(GARANTIAS_DEPOSITADAS)) {
    // comprovante do anterior: o do contrato (que pode já vir de outro anterior, na 2ª troca) ou o do último depósito
    const dep = depositosGarantiaDo(d, a, qual).filter((x) => x.comprovante && !x.complementar).pop();
    const nome = a[g.comprovante] || (dep && dep.comprovante);
    const origem = a[g.comprovante] ? (a[`${g.comprovante}_contrato`] || a.id) : a.id;
    const apontava = n[`${g.comprovante}_contrato`];
    // o herdeiro tem o arquivo dele (garantia própria ou troca antiga, em que o comprovante foi para a pasta dele): só a data, se faltar
    if (n[g.comprovante] && !apontava && n[g.comprovante] !== nome) {
      if (!n[g.pago] && a[g.pago]) mud[g.pago] = a[g.pago];
      continue;
    }
    if (!nome) {
      // paga em depósitos com o comprovante ainda a buscar no banco: o herdeiro mostra "paga por Ana em …" (o comprovante
      // é cobrado no contrato de quem pagou: comprovantesPendentes)
      const ult = depositosGarantiaDo(d, a, qual).filter((x) => !x.complementar).pop();
      const pagoPeloAnterior = a[`${qual}_por_depositos`] && (ult || a[`${g.comprovante}_contrato`]) && (qual === 'caucao' ? temCaucao(a) : temDeposito(a));
      if (pagoPeloAnterior) {
        Object.assign(mud, { [g.comprovante]: null, [`${g.comprovante}_contrato`]: a[`${g.comprovante}_contrato`] || a.id, [g.pago]: a[g.pago] || (ult && ult.data) || null, [`${qual}_por_depositos`]: true });
        continue;
      }
      // o anterior não tem mais o pagamento (comprovante apagado, depósito desfeito): o herdeiro, que só apontava para ele,
      // volta a "sem comprovante" (também na 2ª troca: aponta para quem pagou, que já não tem o arquivo)
      const p = apontava && apontava !== n.id && buscar(d, 'contratos', apontava);
      const aindaTem = p && (n[g.comprovante]
        ? p[g.comprovante] === n[g.comprovante] || (d.depositos_garantia || []).some((x) => x.contrato_id === p.id && x.comprovante === n[g.comprovante])
        : !!p[`${qual}_por_depositos`]);
      if (apontava && apontava !== n.id && !aindaTem) Object.assign(mud, { [g.comprovante]: null, [`${g.comprovante}_contrato`]: null, [g.pago]: null, [`${qual}_por_depositos`]: null });
      continue;
    }
    // dados antigos: o arquivo foi para a pasta do herdeiro e ele o guarda como dele (com os depósitos): só a data, se faltar
    if (origem === n.id) {
      if (!n[g.pago] && a[g.pago] && n[g.comprovante]) mud[g.pago] = a[g.pago];
      continue;
    }
    mud[g.comprovante] = nome;
    mud[`${g.comprovante}_contrato`] = origem;
    mud[g.pago] = a[g.pago] || (dep && dep.data) || n[g.pago] || null;
    mud[`${qual}_por_depositos`] = null;
  }
  const mudou = Object.keys(mud).length > 0;
  if (mudou) atualizar(d, 'contratos', n.id, mud, usuario, `${n.inquilino_nome}: garantia atualizada pelo contrato de ${a.inquilino_nome} (troca de titular)`);
  // 2ª troca (Ana → Bruno → Carla): o que chega a Bruno segue para Carla
  if (n.garantia_transferida_para) sincronizarGarantiaHerdeiro(d, n.id, usuario, vistos);
  return mudou ? n : null;
}

/**
 * Trocas de titular feitas antes de 2026-11-13: o comprovante da garantia saiu do contrato anterior (ficou só no herdeiro).
 * Pelo histórico ("garantia passa para…"), o comprovante que o anterior tinha; o arquivo fica onde está (na pasta do herdeiro,
 * ``*_contrato``). Também a data paga que faltou no herdeiro. { contrato: {campos do anterior}, herdeiro: {campos} } ou null.
 */
function pagamentoPerdidoNoAnterior(d, n, a) {
  if (!a || a.garantia_transferida_para !== n.id || !(temCaucao(a) || temDeposito(a))) return null;
  const contrato = {};
  const herdeiro = {};
  for (const g of Object.values(GARANTIAS_DEPOSITADAS)) {
    if (!a[g.comprovante]) {
      const h = [...d.historico].reverse().find((x) => x.acao === 'Alteração' && x.tabela === 'contratos' && x.registro_id === a.id && /garantia passa para/.test(x.descricao || '')
        && x.detalhes && x.detalhes[g.comprovante] && x.detalhes[g.comprovante].de && !x.detalhes[g.comprovante].para);
      const nome = h && h.detalhes[g.comprovante].de;
      if (nome) {
        // onde o arquivo está hoje: no herdeiro (campo ou depósito que passou para ele) ou no contrato que o aponta
        const dep = (d.depositos_garantia || []).find((x) => x.comprovante === nome && x.contrato_id !== a.id);
        const onde = n[g.comprovante] === nome ? (n[`${g.comprovante}_contrato`] || n.id) : dep ? dep.contrato_id : n.id;
        contrato[g.comprovante] = nome;
        contrato[`${g.comprovante}_contrato`] = onde === a.id ? null : onde;
      }
    }
    if (a[g.pago] && !n[g.pago] && n[g.comprovante]) herdeiro[g.pago] = a[g.pago];
  }
  return Object.keys(contrato).length || Object.keys(herdeiro).length ? { contrato, herdeiro } : null;
}

/** Devolve ao contrato anterior o comprovante que saiu dele na troca (pagamentoPerdidoNoAnterior). Devolve os campos acertados. */
function restaurarPagamentoDoAnterior(d, n, a, usuario) {
  const x = pagamentoPerdidoNoAnterior(d, n, a);
  if (!x) return [];
  if (Object.keys(x.contrato).length) atualizar(d, 'contratos', a.id, x.contrato, usuario, `${a.inquilino_nome}: comprovante da garantia volta a aparecer aqui (é de quem pagou; vale também para ${n.inquilino_nome})`);
  if (Object.keys(x.herdeiro).length) atualizar(d, 'contratos', n.id, x.herdeiro, usuario, `${n.inquilino_nome}: data paga da garantia herdada de ${a.inquilino_nome}`);
  return [...Object.keys(x.contrato).filter((k) => !k.endsWith('_contrato')), ...Object.keys(x.herdeiro)];
}

/**
 * Contrato de quem pagou a garantia que este contrato usa: o anterior da troca de titular (o comprovante aponta para ele,
 * também na 2ª troca) ou o próprio contrato. Ex.: Bruno herdou a caução de Ana → Ana.
 */
export function pagadorDaGarantia(d, c, qual) {
  const g = GARANTIAS_DEPOSITADAS[qual];
  const id = g && c[`${g.comprovante}_contrato`];
  return (id && id !== c.id && buscar(d, 'contratos', id)) || c;
}

/**
 * "Corrigir data" da caução ou do depósito de garantia: a data em que foi paga. Na garantia herdada, a data é a do
 * pagamento feito pelo titular anterior: muda lá (no contrato de quem pagou) e aparece no herdeiro. Paga em depósitos:
 * muda a data do último depósito. Ex.: caução de Ana paga em 05/03/2024, aparecia 01/10/2026 → corrige para 05/03/2024.
 */
export function corrigirDataGarantiaPaga(d, contratoId, qual, data, usuario, hoje = C.hojeIso()) {
  const c = buscar(d, 'contratos', contratoId);
  const g = GARANTIAS_DEPOSITADAS[qual];
  if (!c || !g) throw new Error('Contrato ou garantia não encontrados.');
  if (!data || C.dataValida(data) !== data) throw new Error('Informe a data em que foi paga.');
  if (data > hoje) throw new Error('A data paga não pode ser depois de hoje.');
  const origem = pagadorDaGarantia(d, c, qual);
  if (!garantiaDepositada(origem) && !garantiaDepositada(c)) throw new Error(`Registre antes o depósito da ${g.nome}.`);
  const ultimo = origem[`${qual}_por_depositos`] ? depositosGarantiaDo(d, origem, qual).filter((x) => !x.complementar).pop() : null;
  if (ultimo) atualizar(d, 'depositos_garantia', ultimo.id, { data }, usuario, `${origem.inquilino_nome}: data do depósito de ${C.reais(ultimo.valor)} corrigida para ${C.dataBr(data)}`);
  atualizar(d, 'contratos', origem.id, { [g.pago]: data }, usuario, `${origem.inquilino_nome}: ${g.nome} paga em ${C.dataBr(data)} (data corrigida)`);
  if (origem.id !== c.id) atualizar(d, 'contratos', c.id, { [g.pago]: data }, usuario, `${c.inquilino_nome}: ${g.nome} herdada de ${origem.inquilino_nome}, paga em ${C.dataBr(data)} (data corrigida)`);
  sincronizarGarantiaHerdeiro(d, origem.id, usuario);
  return { origem };
}

/**
 * Na confirmação do termo da troca (antes de a troca acontecer): a garantia continua a mesma do anterior ou é nova.
 * Ex.: caução de Ana (R$ 3.000,00, paga em 05/03/2024) → "continua": Bruno mostra "caução herdada de Ana, paga em 05/03/2024";
 * "nova": a de Ana é devolvida a ela e Bruno deposita a sua (data e comprovante na página dele).
 */
export function mudarGarantiaNaTroca(d, novoId, escolha, usuario) {
  const n = buscar(d, 'contratos', novoId);
  const a = n && contratoHerdado(d, n);
  if (!a || !['continua', 'nova'].includes(escolha)) return false;
  if ((escolha === 'nova') === garantiaNova(n)) return false;
  if (n.heranca_transferida) throw new Error('A troca de titular já foi feita: a garantia não muda mais por aqui (use "Trocar garantia ou fiador").');
  const proprios = TABELAS_GARANTIA.some((t) => (d[t] || []).some((x) => x.contrato_id === n.id))
    || Object.values(GARANTIAS_DEPOSITADAS).some((g) => n[g.comprovante] && !n[`${g.comprovante}_contrato`]);
  if (escolha === 'continua' && proprios) throw new Error(`${n.inquilino_nome} já tem garantia própria registrada (depósito ou comprovante): exclua antes, ou mantenha a garantia nova.`);
  const mud = { garantia_na_troca: escolha };
  const entrada = n.data_entrada || n.vigencia_inicio || null;
  if (escolha === 'continua') for (const k of CAMPOS_GARANTIA) mud[k] = CAMPOS_PAGAMENTO_GARANTIA.includes(k) ? null : a[k] ?? null;
  else Object.assign(mud, { caucao_pago_em: null, deposito_pago_em: null, ...(temCaucao(n) ? { caucao_data: entrada } : {}), ...(temDeposito(n) ? { deposito_data: entrada } : {}) });
  atualizar(d, 'contratos', n.id, mud, usuario, escolha === 'nova'
    ? `${n.inquilino_nome}: garantia nova na troca de titular (a de ${a.inquilino_nome} é devolvida a ele)`
    : `${n.inquilino_nome}: a garantia continua a de ${a.inquilino_nome} (troca de titular)`);
  return true;
}

/**
 * A troca de titular não vai mais acontecer (o contrato do novo titular foi excluído, ou o termo da troca não valeu): o fim do
 * vínculo que a troca gravou no anterior sai e ele volta a ser cobrado. Ex.: troca em 01/12/2026 → a saída de 30/11/2026 de
 * João sai e o boleto de dezembro volta a ser dele. Só a saída que é a véspera da troca e sem cálculo final (saída de verdade fica).
 * ``motivo``: o texto do Histórico. Devolve o contrato anterior quando mudou algo, senão null.
 */
export function soltarSaidaDoAnterior(d, n, usuario, motivo) {
  const a = n && contratoHerdado(d, n);
  const data = n && (n.data_entrada || n.vigencia_inicio);
  if (!a || !data || a.data_saida !== C.somarDias(data, -1) || encerramentoDo(d, a.id)) return null;
  // o anterior pode ter sido inativado pela saída: volta a ativo (a saída era só a da troca)
  atualizar(d, 'contratos', a.id, { data_saida: null, ...(a.ativo === false ? { ativo: true } : {}) }, usuario,
    `${a.inquilino_nome}: continua no contrato (${motivo}); o fim do vínculo em ${C.dataBr(a.data_saida)} saiu`);
  recalcularCobrancas(d, (cb) => cb.contrato_id === a.id, usuario);
  return a;
}

export function encerrarVinculoPorContinuacao(d, anteriorId, data, novoNome, usuario) {
  const a = buscar(d, 'contratos', anteriorId);
  if (!a || !data) return null;
  const fim = C.somarDias(data, -1);
  if (a.data_saida && a.data_saida <= fim) return a;
  atualizar(d, 'contratos', a.id, { data_saida: fim }, usuario, `${a.inquilino_nome}: fim do vínculo em ${C.dataBr(fim)} (o contrato continua com ${novoNome})`);
  return a;
}
/** Documento que ainda falta: nem assinado, nem perdido, nem anexado com assinatura faltante, nem herdado do contrato original. */
export const documentoFalta = (d, c, campo) => !contratoHerdado(d, c) && !documentoEntrada(d, c, campo) && !documentoPerdido(d, c, campo) && !documentoParcial(d, c, campo)
  // "não se aplica" na rotina de entrada: não fica cobrando
  && !((c.rotina_entrada || {})[(ETAPAS_ENTRADA.find((e) => e[2] === campo) || [])[0]] || {}).pulada;

/** Troca de titular: o termo aditivo que coloca o novo titular no contrato é obrigatório (alerta até registrar um aditivo neste contrato). */
/**
 * Seguro contra incêndio sempre existe (decisão do dono de 2026-11-20): contrato em vigor gravado antes como "Não tem" pede que
 * se escolha quem paga (o inquilino, no boleto, ou a locadora, incluso no aluguel). Nada é mudado sozinho.
 */
export function alertaSeguroSemQuemPaga(c) {
  if (!c || c.conta_seguro !== SITUACOES[2] || c.ativo === false || c.data_saida) return null;
  return { nivel: 'aviso', tipo: 'Seguro contra incêndio',
    texto: 'O seguro contra incêndio é obrigatório e este contrato está como "Não tem": edite o contrato e escolha quem paga ("Por conta do inquilino" ou "Incluso no aluguel").' };
}

export function alertaAditivoHerdeiro(d, c) {
  const ant = contratoHerdado(d, c);
  if (!ant || c.ativo === false || c.data_saida || aditivoDaTroca(d, c)) return null;
  const gerado = aditivosAguardando(d, c.id).find((a) => a.tipo === TIPO_ADITIVO_TROCA);
  // a saída do anterior já foi lançada sem o termo (item 36): depois dela nenhum dos dois recebe boleto até o termo chegar
  const saida = ant.data_saida && !c.heranca_transferida
    ? ` Atenção: ${ant.inquilino_nome} já tem saída em ${C.dataBr(ant.data_saida)}; depois dessa data nenhum dos dois recebe boleto até o termo assinado ser anexado.` : '';
  return { nivel: 'perigo', tipo: 'Aditivo da troca de titular', ancora: 'aditivos',
    texto: (gerado ? `Termo de ${ant.inquilino_nome} para ${c.inquilino_nome}, de ${C.dataBr(gerado.data)}, aguardando assinatura: colha as assinaturas e anexe o arquivo assinado (em "Termos aditivos").`
      : `Este contrato continua o de ${ant.inquilino_nome}: registre o termo aditivo assinado que coloca ${c.inquilino_nome} como titular (em "Termos aditivos").`) + saida };
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

/**
 * Fonte única do que falta dos três documentos de entrada do inquilino ativo (antigo ou novo; próprio ou herdado):
 * [{ campo, nome, feito, situacao }], situacao 'falta' (não assinado) ou 'parcial' (anexado, falta assinatura de alguém).
 * Quem saiu, está inativo ou herdou de um titular anterior (marca-se lá) não tem pendência. Usada pelo alerta
 * "Rotina de entrada", pela faixa de cadastros incompletos e pela faixa no topo da página do inquilino.
 */
export function documentosPendentes(d, c) {
  if (c.ativo === false || c.data_saida) return [];
  return DOCUMENTOS_ENTRADA.map(([campo, nome, feito]) => ({ campo, nome, feito,
    situacao: documentoFalta(d, c, campo) ? 'falta' : documentoParcial(d, c, campo) ? 'parcial' : null })).filter((x) => x.situacao);
}

/** Alerta do que falta dos três documentos assinados; faz parte do alerta único "Rotina de entrada" (alertaRotinaEntrada). */
export function alertaDocumentosEntrada(c, d = null) {
  const falta = documentosPendentes(d, c).filter((x) => x.situacao === 'falta').map((x) => x.nome.toLocaleLowerCase('pt-BR'));
  return falta.length ? { nivel: 'aviso', tipo: 'Rotina de entrada', texto: `falta ${falta.join(', ')}.`, ancora: 'rotina' } : null;
}

/**
 * Troca de titular: contratos anteriores da cadeia que já não estão ativos. As pendências dos documentos deles (assinatura
 * faltante, perda a confirmar) aparecem no novo titular, senão sumiriam do painel. Com o anterior ativo, o aviso fica só nele.
 */
const anterioresEncerrados = (d, c, hoje) => (c.contrato_anterior_id ? cadeiaDeContratos(d, c).antes.filter((a) => !contratoAtivo(a, hoje)) : []);

/** Documento anexado com assinatura faltante: alerta até alguém anexar o arquivo com todas as assinaturas. */
function alertaAssinaturaFaltante(d, c, hoje = C.hojeIso()) {
  if (c.ativo === false || c.data_saida) return null;
  const doContrato = (x, onde) => DOCUMENTOS_ENTRADA.filter(([k]) => !c[k]).map(([k, t]) => [t, documentoParcial(d, x, k), onde]).filter(([, p]) => p);
  const l = [...doContrato(c, ''), ...anterioresEncerrados(d, c, hoje).flatMap((a) => doContrato(a, ` (no contrato de ${a.inquilino_nome})`))];
  if (!l.length) return null;
  return { nivel: 'aviso', tipo: 'Assinatura faltante', ancora: 'documentos',
    texto: `${l.map(([t, p, onde]) => `${t.toLocaleLowerCase('pt-BR')} anexado sem a assinatura de ${p.falta.join(', ')}${onde}${p.pendente ? ' (aguardando análise do administrador)' : ''}`).join('; ')}. Anexe o arquivo com todas as assinaturas.` };
}

/** Perda registrada por quem não é administrador: aguarda o administrador confirmar ou recusar. */
function alertaPerdaAConfirmar(d, c, hoje = C.hojeIso()) {
  const doContrato = (x, onde) => DOCUMENTOS_ENTRADA.filter(([k]) => !c[k] && documentoPerdido(d, x, k) && x[campoPerdidoPendente(k)])
    .map(([k, t]) => `${t.toLocaleLowerCase('pt-BR')} registrado como perdido por ${x[campoPerdidoPendente(k)]} em ${C.dataBr(x[campoPerdidoDoc(k)])}${onde}`);
  const l = [...doContrato(c, ''), ...anterioresEncerrados(d, c, hoje).flatMap((a) => doContrato(a, ` (no contrato de ${a.inquilino_nome})`))];
  if (!l.length) return null;
  return { nivel: 'aviso', tipo: 'Documento perdido a confirmar', ancora: 'documentos', texto: `${l.join('; ')}. O administrador confirma ou recusa.` };
}

/** Marca o documento como assinado (exige o nome do arquivo assinado já anexado) ou, sem data, volta a pendente. */
export function marcarDocumento(d, contratoId, campo, data, usuario, arquivo = null, hoje = C.hojeIso()) {
  const doc = DOCUMENTOS_ENTRADA.find(([k]) => k === campo);
  if (!doc) throw new Error('Documento desconhecido.');
  dataDaRotinaNaoFutura(data, hoje, `${doc[1]} ${doc[2]}`);
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

// --------------------------------------------------------------------------
// Rotina de entrada do inquilino novo: o passo a passo (reserva, contrato, garantia, vistoria, chaves, contas, seguro)
// --------------------------------------------------------------------------
/**
 * Contas que passam para o nome do inquilino: [etapa, campo do contrato, título, concessionária padrão, como reconhecer
 * o protocolo, só quando é "por conta do inquilino"]. Água e energia valem salvo "incluso no aluguel" ou "não tem".
 */
const CONTAS_ENTRADA = [
  ['agua', 'conta_agua', 'Transferência da água', 'Sanepar', /sanepar|[áa]gua/i, false],
  ['energia', 'conta_energia', 'Transferência da energia', 'Copel', /copel|energia|luz/i, false],
  ['gas', 'conta_gas', 'Transferência do gás', 'Supergasbras', /g[áa]s|ultragaz|liquig/i, true],
  ['condominio', 'conta_condominio', 'Transferência do condomínio', 'Condomínio', /condom/i, true],
];

/** Etapas da rotina de entrada, na ordem. ``doc``: documento assinado (marca-se anexando o arquivo, na caixa de documentos). */
export const ETAPAS_ENTRADA = [
  ['reserva', 'Depósito da reserva'],
  ['contrato_gerado', 'Gerar o contrato'],
  ['contrato_assinado', 'Contrato assinado', 'doc_contrato_em'],
  ['aditivo', 'Termo aditivo da troca de titular assinado'],
  ['garantia', 'Garantia'],
  ['vistoria_gerada', 'Gerar a vistoria de entrada'],
  ['chaves_gerado', 'Gerar o termo de entrega das chaves'],
  ['vistoria_assinada', 'Vistoria de entrada assinada', 'doc_vistoria_em'],
  // contra-vistoria (pedido do dono em 2026-11-15): o que o inquilino apontou de diferente da vistoria, no prazo da cláusula
  ['contra_vistoria', 'Contra-vistoria do inquilino'],
  ['chaves_assinado', 'Termo de entrega das chaves assinado', 'doc_chaves_em'],
  ...CONTAS_ENTRADA.map(([k, , t]) => [k, t]),
  ['seguro', 'Contratação do seguro'],
];

/**
 * Etapa "Contra-vistoria do inquilino" (pedido do dono em 2026-11-15): o inquilino tem 5 dias úteis desde a entrega das
 * chaves para apontar o que não está na vistoria de entrada (cláusula da vistoria, C.limiteVistoriaEntrada). Com o arquivo
 * anexado, feita na data em que ele mandou; dentro do prazo, aguardando; passado o prazo, continua pendente até alguém
 * anexar o que ele mandou ou marcar "Não houve" (decisão do dono em 2026-11-15: alguns inquilinos mandaram e precisa ir
 * para o sistema). Troca de titular: a do contrato anterior vale (a vistoria de entrada é a mesma).
 * Ex.: chaves em 02/03/2026 (segunda) → prazo até 09/03/2026; em 05/03 aguardando; em 10/03, sem arquivo, "prazo acabou".
 */
/**
 * Dia da entrega das chaves: o do termo das chaves assinado (``doc_chaves_em``) ou, sem ele, a data de entrada. Conta daí o
 * prazo da contra-vistoria (etapa e e-mail de boas-vindas). Ex.: entrada 01/12/2026 e termo de 04/12/2026 → 04/12/2026.
 */
export function dataDasChaves(c) {
  return termoDasChavesEm(c) || (c && c.data_entrada) || null;
}

/** Dia do termo de entrega das chaves assinado (``doc_chaves_em``), ou null enquanto não foi assinado. */
export function termoDasChavesEm(c) {
  const t = c && String(c.doc_chaves_em || '').slice(0, 10);
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function situacaoContraVistoria(d, c, hoje) {
  if (c.contra_vistoria) return { situacao: 'feita', data: c.contra_vistoria_em || null, texto: 'recebida' };
  const anterior = contratoHerdado(d, c);
  if (anterior) {
    const a = [...cadeiaDeContratos(d, c).antes].reverse().find((x) => x.contra_vistoria);
    return { situacao: 'feita', data: a ? a.contra_vistoria_em || null : null, texto: a ? `herdada de ${a.inquilino_nome}` : `herdado de ${anterior.inquilino_nome}` };
  }
  if (!c.data_entrada) return undefined;
  // sem o termo das chaves assinado, o prazo só corre depois da vigência inicial (antes, o inquilino ainda não tem as chaves)
  if (!termoDasChavesEm(c) && hoje < c.data_entrada) return { situacao: 'andamento', texto: `aguarda a entrega das chaves (vigência a partir de ${C.dataBr(c.data_entrada)}); o prazo de 5 dias úteis conta do termo das chaves assinado` };
  const limite = C.limiteVistoriaEntrada(dataDasChaves(c));
  if (hoje > limite) return { situacao: 'andamento', texto: `prazo acabou em ${C.dataBr(limite)}: anexe o que o inquilino mandou ou marque "Não houve"` };
  return { situacao: 'andamento', texto: `aguardando o inquilino até ${C.dataBr(limite)} (5 dias úteis da entrega das chaves)` };
}

/** Anexa a contra-vistoria do inquilino: o arquivo e a data em que ele mandou (troca o arquivo anterior, se houver). */
export function registrarContraVistoria(d, contratoId, { data, arquivo }, usuario, hoje = C.hojeIso()) {
  const c = buscar(d, 'contratos', contratoId);
  if (!c) throw new Error('Inquilino não encontrado.');
  if (!data) throw new C.ErroUsuario('Informe a data em que o inquilino mandou a contra-vistoria.');
  if (!arquivo) throw new C.ErroUsuario('Escolha o arquivo da contra-vistoria.');
  dataDaRotinaNaoFutura(data, hoje, 'Contra-vistoria');
  const entrada = c.data_entrada || c.vigencia_inicio;
  if (entrada && data < entrada) throw new C.ErroUsuario(`A contra-vistoria (${C.dataBr(data)}) não pode ser antes da entrada do inquilino (${C.dataBr(entrada)}).`);
  atualizar(d, 'contratos', c.id, { contra_vistoria: arquivo, contra_vistoria_em: data }, usuario,
    `${c.inquilino_nome}: contra-vistoria do inquilino recebida em ${C.dataBr(data)} (${arquivo})`);
}

/** Inquilino novo para a rotina: entrou há até 6 meses (ou ainda vai entrar). */
export const rotinaRecente = (c, hoje = C.hojeIso()) => !c.data_entrada || c.data_entrada >= C.somarMesesData(hoje, -6);

/**
 * Nome curto da companhia de água ou de energia do imóvel (ou da empresa, Empresas). Ex.: "… (SABESP)" → "Sabesp"; '' nas outras
 * contas. Serve para reconhecer o protocolo e dar o nome da etapa fora do Paraná (as expressões de CONTAS_ENTRADA são as daqui).
 */
const companhiaCurtaDaConta = (d, c, k) => (['agua', 'energia'].includes(k) ? nomeCurtoCompanhia(companhiaDoImovel(d, c, buscar(d, 'imoveis', c.imovel_id), k)) : '');
/** Reconhece o protocolo da conta ``k`` pelo nome da concessionária: a expressão de sempre ou o nome curto da companhia do cadastro. */
function reconheceConta(d, c, k, re) {
  const curta = companhiaCurtaDaConta(d, c, k).toLocaleLowerCase('pt-BR');
  return (nome) => re.test(nome || '') || (!!curta && String(nome || '').toLocaleLowerCase('pt-BR').includes(curta));
}

/**
 * Nome da concessionária da conta no imóvel: a dos protocolos já registrados, a da lista, a do cadastro (água e energia) ou a
 * padrão (ex.: Sanepar).
 */
function concessionariaDaConta(d, c, re, padrao, k = '') {
  const ok = k ? reconheceConta(d, c, k, re) : (x) => re.test(x || '');
  const t = d.titularidades.filter((x) => x.imovel_id === c.imovel_id && ok(x.concessionaria)).sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))[0];
  return (t && t.concessionaria) || lista(d, 'concessionarias').find((x) => re.test(x)) || (k && companhiaCurtaDaConta(d, c, k)) || padrao;
}

/**
 * Situação de cada etapa da rotina de entrada: [{ chave, titulo, situacao ('feita', 'pulada', 'andamento' ou 'pendente'),
 * data, texto, manual (marcada à mão, pode desfazer), doc (campo do documento assinado), concessionaria }].
 * O que já está registrado nas caixas da página (comprovante, documento assinado, protocolo, apólice) conta sozinho;
 * o resto é marcado à mão com a data (``rotina_entrada``). Etapas que não se aplicam ao contrato ficam de fora.
 * Ex.: contrato com água "por conta do inquilino" e protocolo da Sanepar "Concluído" em 05/11/2026 → feita em 05/11/2026.
 */
export function rotinaEntrada(d, c, hoje = C.hojeIso()) {
  const marcas = c.rotina_entrada || {};
  const anterior = contratoHerdado(d, c);
  const herdou = anterior ? `herdado de ${anterior.inquilino_nome}` : '';
  const antes = anterior ? [...cadeiaDeContratos(d, c).antes].reverse() : [];
  // marca à mão no contrato anterior (o mais recente da cadeia) de etapa que é do contrato e não da pessoa: vale para o novo
  const marcaAnterior = (chave) => {
    const a = antes.find((x) => (x.rotina_entrada || {})[chave]);
    if (!a) return null;
    const m = a.rotina_entrada[chave];
    return m.pulada ? { situacao: 'pulada', data: m.data, texto: `não se aplica (marcado em ${a.inquilino_nome})` } : { situacao: 'feita', data: m.data, texto: `marcada em ${a.inquilino_nome}` };
  };
  const feita = (data, texto = '') => ({ situacao: 'feita', data: data || null, texto });
  const andamento = (texto) => ({ situacao: 'andamento', texto });
  // etapa que é do contrato (gerar contrato, vistoria, termo das chaves, contra-vistoria, fiador): vale a situação dela no
  // contrato anterior; pendente lá, fica "pendente no contrato de Fulano" (antes aparecia feita, herdada, sem estar)
  let rotinaAnterior = null;
  const doAnterior = (chave) => {
    rotinaAnterior = rotinaAnterior || rotinaEntrada(d, anterior, hoje);
    const e = rotinaAnterior.find((x) => x.chave === chave);
    if (!e || ['feita', 'pulada'].includes(e.situacao)) return feita(e ? e.data : null, herdou);
    return andamento(`pendente no contrato de ${anterior.inquilino_nome}`);
  };
  const docAssinado = (k, chave) => {
    const doc = documentoEntrada(d, c, k);
    if (doc) return feita(doc.data, doc.contrato.id !== c.id ? `herdado de ${doc.contrato.inquilino_nome}` : (doc.arquivo ? '' : 'sem arquivo'));
    if (documentoPerdido(d, c, k)) return feita(documentoPerdido(d, c, k), 'registrado como perdido');
    const ph = perdaHerdada(d, c, k);
    if (ph) return feita(ph.data, `registrado como perdido em ${ph.contrato.inquilino_nome}`);
    const p = documentoParcial(d, c, k);
    if (p) return andamento(`falta assinatura: ${p.falta.join(', ')}`);
    const pa = antes.find((a) => documentoParcial(d, a, k));
    if (pa) return andamento(`falta assinatura no contrato de ${pa.inquilino_nome}: ${documentoParcial(d, pa, k).falta.join(', ')}`);
    const m = marcaAnterior(chave);
    if (m && m.situacao === 'pulada') return m;
    return anterior ? andamento(`herdado de ${anterior.inquilino_nome}: marque no contrato anterior`) : null;
  };
  // documento já baixado na caixa "Contrato, Vistoria, Termos e Aditivos" (assinado, perdido ou com assinatura faltante): já foi gerado
  const jaGerado = (k, texto) => (documentoEntrada(d, c, k) ? feita(null, texto)
    : documentoPerdido(d, c, k) ? feita(null, 'registrado como perdido') : documentoParcial(d, c, k) ? feita(null, 'anexado, falta assinatura') : undefined);
  const avaliar = {
    reserva: () => {
      if (anterior) return null;
      if (c.reserva_valor > 0) return c.comprovante_reserva ? feita(c.reserva_data, C.reais(c.reserva_valor)) : andamento(`${C.reais(c.reserva_valor)} sem comprovante`);
      return undefined;
    },
    contrato_gerado: () => (anterior ? doAnterior('contrato_gerado') : jaGerado('doc_contrato_em', 'contrato já assinado')),
    contrato_assinado: () => docAssinado('doc_contrato_em', 'contrato_assinado'),
    aditivo: () => {
      // só o termo da troca de titular (outro termo assinado não conta)
      const t = aditivoDaTroca(d, c);
      if (t) return feita(t.assinado_em || t.data, t.assunto); // a data em que foi assinado (não a da troca)
      return aditivosAguardando(d, c.id).some((a) => a.tipo === TIPO_ADITIVO_TROCA) ? andamento('gerado, aguardando assinatura') : undefined;
    },
    garantia: () => {
      if (anterior && !garantiaNova(c) && (garantiaHerdada(d, c) || herancaAgendada(d, c, hoje))) {
        const m = marcaAnterior('garantia');
        if (m) return m;
        const semDeposito = (temCaucao(c) || temDeposito(c)) && ![c, ...antes].some((x) => garantiaDepositada(x) || somaDepositos(d, x, temCaucao(c) ? 'caucao' : 'deposito') > 0);
        if (semDeposito) return andamento(`herdada de ${anterior.inquilino_nome}: falta o depósito`);
        return temCaucao(c) || temDeposito(c) ? feita(null, `herdada de ${anterior.inquilino_nome}`) : doAnterior('garantia');
      }
      if (temCaucao(c) || temDeposito(c)) {
        const qual = temCaucao(c) ? 'caucao' : 'deposito';
        if (garantiaDepositada(c)) return feita(c[GARANTIAS_DEPOSITADAS[qual].pago] || null, `${GARANTIAS_DEPOSITADAS[qual].nome} depositada`);
        const s = garantiaADepositar(d, c, qual);
        if (s.depositado) return andamento(`depositado ${C.reais(s.depositado)} de ${C.reais(s.combinado)}`);
      }
      return undefined;
    },
    vistoria_gerada: () => {
      // a vistoria de entrada que vale (própria ou, na troca de titular, a do contrato anterior: aparece como herdada)
      const v = vistoriaDeEntrada(d, c);
      if (v && v.contrato_id === c.id) return feita(v.data);
      return anterior ? doAnterior('vistoria_gerada') : jaGerado('doc_vistoria_em', 'vistoria já assinada');
    },
    chaves_gerado: () => (anterior ? doAnterior('chaves_gerado') : jaGerado('doc_chaves_em', 'termo já assinado')),
    vistoria_assinada: () => docAssinado('doc_vistoria_em', 'vistoria_assinada'),
    contra_vistoria: () => (anterior && !c.contra_vistoria && ![...antes].some((x) => x.contra_vistoria) ? doAnterior('contra_vistoria') : situacaoContraVistoria(d, c, hoje)),
    chaves_assinado: () => docAssinado('doc_chaves_em', 'chaves_assinado'),
    seguro: () => {
      const data = c.data_entrada || c.vigencia_inicio || '';
      const s = segurosDoContrato(d, c.id).filter((x) => !data || x.vigencia_fim >= data).sort((a, b) => String(a.vigencia_inicio).localeCompare(String(b.vigencia_inicio)))[0];
      if (s) return feita(s.data_contratacao || s.vigencia_inicio, [s.seguradora, s.apolice].filter(Boolean).join(' · '));
      // troca de titular ainda não feita: a apólice em vigência do anterior passa ao novo no dia
      if (anterior && herancaAgendada(d, c, hoje) && segurosDoContrato(d, anterior.id).some((x) => x.vigencia_fim >= data)) return feita(null, `apólice de ${anterior.inquilino_nome} passa na troca`);
      return marcaAnterior('seguro') || undefined;
    },
  };
  for (const [k, campo, , padrao, re, soInquilino] of CONTAS_ENTRADA) {
    avaliar[k] = () => {
      const sit = c[campo];
      if (soInquilino ? sit !== SITUACOES[0] : [SITUACOES[1], SITUACOES[2]].includes(sit)) return null;
      const ok = reconheceConta(d, c, k, re);
      const t = d.titularidades.filter((x) => x.contrato_id === c.id && x.tipo !== 'Volta para o proprietário' && ok(x.concessionaria))
        .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))[0];
      if (!t) return undefined;
      const prot = t.protocolo ? `protocolo ${t.protocolo}` : 'sem protocolo';
      const e = t.situacao === 'Concluído' ? feita(t.data, prot) : andamento(`${(t.situacao || 'solicitado').toLocaleLowerCase('pt-BR')}${t.data ? ` em ${C.dataBr(t.data)}` : ''} · ${prot}`);
      return { ...e, titularidade: t.id };
    };
  }
  const out = [];
  for (const [chave, titulo, doc] of ETAPAS_ENTRADA) {
    if (chave === 'aditivo' && !anterior) continue;
    if (chave === 'garantia' && c.garantia_tipo === 'Sem garantia') continue;
    if (chave === 'seguro' && c.conta_seguro === SITUACOES[2]) continue;
    const auto = avaliar[chave]();
    if (auto === null && !doc) continue; // não se aplica
    const conta = CONTAS_ENTRADA.find(([k]) => k === chave);
    const concessionaria = conta ? concessionariaDaConta(d, c, conta[4], conta[3], conta[0]) : null;
    const nome = chave === 'garantia' ? ({ 'Caução': 'Depósito da caução', 'Depósito garantia': 'Depósito de garantia', Fiador: 'Assinatura do fiador',
      'Fiador + depósito': 'Depósito de garantia e assinatura do fiador', 'Seguro fiança': 'Apólice do seguro fiança' })[c.garantia_tipo] || 'Garantia (tipo não informado)'
      : concessionaria ? `${titulo} (${concessionaria})` : titulo;
    const m = marcas[chave];
    // o registrado na página vale mais que a marca à mão; a data de "gerado" sem data própria vem da marca
    const e = auto && auto.situacao === 'feita' ? { ...auto, data: auto.data || (m && !m.pulada ? m.data : null) }
      : m && m.pulada ? { situacao: 'pulada', data: m.data, texto: chave === 'contra_vistoria' ? 'não houve' : 'não se aplica', manual: true }
        : m && m.data && !doc ? { situacao: 'feita', data: m.data, texto: `marcada por ${m.por || '-'}`, manual: true }
          : auto || { situacao: 'pendente', texto: '' };
    out.push({ chave, titulo: nome, doc: doc || null, concessionaria, ...e });
  }
  // última etapa (Arquivo impresso, 2026-11-15): montar a pasta física, depois de todas as outras; marca-se na tela da pasta
  if (AI.ligado()) {
    const m = AI.pastaMontada(d, c.id);
    const prontas = out.every((e) => ['feita', 'pulada'].includes(e.situacao));
    out.push({ chave: 'pasta_fisica', titulo: 'Montar a pasta física', doc: null, concessionaria: null,
      ...(m ? { situacao: 'feita', data: m.data, texto: m.por ? `por ${m.por}` : '' } : prontas ? { situacao: 'pendente', texto: '' } : { situacao: 'andamento', texto: 'aguardando as outras etapas' }) });
  }
  return out;
}

/** Resumo da rotina: { etapas, feitas, total, concluida } (pulada conta como resolvida). */
export function resumoRotinaEntrada(d, c, hoje = C.hojeIso()) {
  const etapas = rotinaEntrada(d, c, hoje);
  const feitas = etapas.filter((e) => ['feita', 'pulada'].includes(e.situacao)).length;
  return { etapas, feitas, total: etapas.length, concluida: feitas === etapas.length };
}

/**
 * Marca à mão uma etapa da rotina de entrada: feita na ``data``, ``pular`` (não se aplica) ou, sem os dois, volta a
 * pendente. Documento assinado não se marca aqui: precisa do arquivo (caixa "Contrato, Vistoria, Termos e Aditivos").
 */
/** Datas da rotina de entrada (etapa feita, documento assinado, contra-vistoria): nunca depois de hoje (mutirão 19/11, entrada-035). */
function dataDaRotinaNaoFutura(data, hoje, oque) {
  if (data && data > hoje) throw new C.ErroUsuario(`${oque}: a data (${C.dataBr(data)}) é depois de hoje (${C.dataBr(hoje)}). Confira o dia.`);
}

export function marcarEtapaEntrada(d, contratoId, chave, { data = null, pular = false } = {}, usuario, hoje = C.hojeIso()) {
  const etapa = ETAPAS_ENTRADA.find(([k]) => k === chave);
  if (!etapa) throw new Error('Etapa desconhecida.');
  dataDaRotinaNaoFutura(data, hoje, 'Etapa feita');
  if (etapa[2] && !pular) throw new Error('Documento assinado: anexe o arquivo assinado para marcar.');
  const c = buscar(d, 'contratos', contratoId);
  if (!c) throw new Error('Inquilino não encontrado.');
  const marcas = { ...(c.rotina_entrada || {}) };
  if (pular) marcas[chave] = { data: data || C.hojeIso(), por: usuario, pulada: true };
  else if (data) marcas[chave] = { data, por: usuario };
  else delete marcas[chave];
  atualizar(d, 'contratos', c.id, { rotina_entrada: Object.keys(marcas).length ? marcas : null }, usuario,
    `${c.inquilino_nome}: rotina de entrada · ${etapa[1].toLocaleLowerCase('pt-BR')} ${pular ? 'não se aplica' : data ? `feita em ${C.dataBr(data)}` : 'voltou a pendente'}`);
}

/** Documento de entrada gerado (contrato ou termo das chaves, ao baixar ou imprimir): marca a etapa uma vez, com a data de hoje. */
export function marcarGeradoNaRotina(d, contratoId, chave, usuario, hoje = C.hojeIso()) {
  const c = buscar(d, 'contratos', contratoId);
  if (!c || !['contrato_gerado', 'chaves_gerado'].includes(chave) || (c.rotina_entrada || {})[chave]) return false;
  marcarEtapaEntrada(d, c.id, chave, { data: hoje }, usuario);
  return true;
}

/**
 * Alerta único da rotina de entrada: documentos que faltam (todo inquilino ativo) e, para o inquilino novo (até 6 meses da
 * entrada), a troca de titularidade das contas (água, energia, gás, condomínio) até o protocolo "Concluído" ou a etapa marcada.
 * Troca de titular: quem está passando o contrato adiante não transfere mais contas para o próprio nome; os documentos
 * pendentes ficam no anterior, onde se marcam, e o novo titular só herda (documentoFalta).
 */
function alertaRotinaEntrada(d, c, hoje) {
  if (c.ativo === false || c.data_saida) return null;
  const docs = alertaDocumentosEntrada(c, d);
  const contas = c.imovel_id && rotinaRecente(c, hoje) && !continuadoPor(d, c)
    ? rotinaEntrada(d, c, hoje).filter((e) => CONTAS_ENTRADA.some(([k]) => k === e.chave) && ['pendente', 'andamento'].includes(e.situacao)) : [];
  if (!docs && !contas.length) return null;
  return { nivel: 'aviso', tipo: 'Rotina de entrada', ancora: 'rotina',
    texto: [docs && `Documentos: ${docs.texto}`,
      contas.length && `Falta efetivar a troca de titularidade: ${contas.map((e) => `${e.titulo.replace(/^Transferência d[aoe] /, '')}${e.situacao === 'andamento' ? ` (${e.texto})` : ''}`).join('; ')}.`].filter(Boolean).join(' ') };
}

/**
 * Guarda as taxas da poupança trazidas do Banco Central (poupanca.js, pedido do dono de 17/11): um registro por mês em
 * ``taxas_poupanca`` ({ mes: 'AAAA-MM', taxas: { 'AAAA-MM-DD': % } }). Taxa já guardada nunca é trocada (a mesma conta dá
 * sempre o mesmo resultado). Uma linha só no histórico. Devolve quantos dias entraram.
 * Ex.: { '2026-10-10': 0.5936, '2026-11-10': 0.6 } → registros de 2026-10 e 2026-11.
 */
export function guardarTaxasPoupanca(d, novas, usuario) {
  const porMes = new Map();
  for (const [dia, t] of Object.entries(novas || {})) {
    if (!C.dataValida(dia) || !Number.isFinite(t)) continue;
    if (!porMes.has(dia.slice(0, 7))) porMes.set(dia.slice(0, 7), []);
    porMes.get(dia.slice(0, 7)).push([dia, t]);
  }
  let n = 0;
  for (const [mes, lista] of [...porMes].sort((a, b) => a[0].localeCompare(b[0]))) {
    const r = d.taxas_poupanca.find((x) => x.mes === mes);
    const faltam = lista.filter(([dia]) => !(r && Number.isFinite((r.taxas || {})[dia])));
    if (!faltam.length) continue;
    n += faltam.length;
    const taxas = Object.fromEntries([...Object.entries((r && r.taxas) || {}), ...faltam].sort((a, b) => a[0].localeCompare(b[0])));
    if (r) r.taxas = taxas;
    else inserir(d, 'taxas_poupanca', { mes, taxas }, usuario, null, { historico: false });
  }
  if (n) registrar(d, usuario, 'Inclusão', 'taxas_poupanca', null, `Taxas da poupança do Banco Central guardadas (${n} dia(s))`, null, {}, false);
  return n;
}

const tamanhosVistos = new WeakMap();
/**
 * Tamanho dos dados (Sistema, pedido do dono de 17/11): bytes do banco inteiro como fica gravado (JSON), cada tabela
 * com o nº de registros e os bytes (da maior para a menor em registros), as linhas do histórico e os anexos ligados a
 * lançamentos (``arquivosReferenciados``; os anexados à mão nas caixas de arquivos não entram). Calculado uma vez por banco
 * (cada gravação monta outro objeto). Ex.: { bytes: 2.411.520, historico: { registros: 5.200, bytes: 1.300.000 },
 * tabelas: [{ tabela: 'faturas', nome: 'NF', registros: 1.800, bytes: 540.000 }, …], anexos: 640 }.
 */
export function tamanhoDoBanco(d) {
  if (tamanhosVistos.has(d)) return tamanhosVistos.get(d);
  const medir = (x) => new TextEncoder().encode(JSON.stringify(x ?? null)).length;
  const tabelas = Object.keys(d).filter((k) => Array.isArray(d[k]) && k !== 'historico')
    .map((k) => ({ tabela: k, nome: TABELAS[k] || k, registros: d[k].length, bytes: medir(d[k]) }))
    .sort((a, b) => b.registros - a.registros || b.bytes - a.bytes || a.nome.localeCompare(b.nome, 'pt-BR'));
  const r = { bytes: medir(d), historico: { registros: (d.historico || []).length, bytes: medir(d.historico || []) }, tabelas,
    registros: tabelas.reduce((s, t) => s + t.registros, 0), anexos: arquivosReferenciados(d).length };
  tamanhosVistos.set(d, r);
  return r;
}

/**
 * Arquivos anexados que algum lançamento usa: [{ escopo, id, nome }] (escopo e id da pasta, como nas caixas de arquivos:
 * "contrato", "assinados", "aditivos" e "seguro" pelo contrato). O que sair desta lista ao excluir ou desfazer
 * um lançamento é apagado da pasta.
 */
export function arquivosReferenciados(d) {
  const out = [];
  const vistos = new Set();
  // o mesmo PDF pode ser apontado por dois registros (pagamento pelo banco e a movimentação que o confirmou): entra uma vez
  const usa = (escopo, id, nome) => { const k = `${escopo}:${id}|${nome}`; if (nome && id && !vistos.has(k)) { vistos.add(k); out.push({ escopo, id, nome }); } };
  for (const c of d.contratos) {
    for (const k of ['comprovante_caucao', 'comprovante_deposito', 'comprovante_reserva', 'termo_chaves_saida', 'contra_vistoria']) usa('contrato', c[`${k}_contrato`] || c.id, c[k]);
    for (const [campo] of DOCUMENTOS_ENTRADA) {
      usa('assinados', c.id, c[campoArquivoDoc(campo)]);
      usa('assinados', c.id, (c[campoParcialDoc(campo)] || {}).arquivo);
    }
  }
  for (const t of TABELAS_COMPROVANTE) for (const x of d[t] || []) usa('contrato', x.contrato_id, x.comprovante);
  // termo de quitação assinado da saída: o × apaga o arquivo e ele entra na conferência e no ZIP da pessoa (2026-11-20)
  for (const x of d.encerramentos || []) usa('contrato', x.contrato_id, x.termo_assinado);
  for (const a of d.aditivos) usa('aditivos', a.contrato_id, a.arquivo);
  for (const x of d.documentos_locacao || []) usa('aditivos', x.contrato_id, x.arquivo); // outros documentos da locação assinados (2026-11-24, DOC-07)
  for (const a of d.acordos || []) usa('contrato', a.contrato_id, a.termo_assinado); // termo do acordo assinado (2026-11-15)
  for (const x of d.devolucoes_garantia || []) usa('contrato', x.contrato_id, x.termo_assinado); // recibo da devolução da garantia assinado (2026-11-21)
  // termo de quitação assinado da saída (estava fora: a limpeza "arquivos sem lançamento" o apagava, mutirão 19/11 fios-002)
  for (const x of d.encerramentos || []) usa('contrato', x.contrato_id, x.termo_assinado);
  // notificação ao inquilino (2026-11-17): a assinada e o comprovante da baixa (foto ou arquivo de que foi resolvido)
  for (const n of d.notificacoes || []) { usa('contrato', n.contrato_id, n.arquivo_assinado); usa('contrato', n.contrato_id, n.comprovante_baixa); }
  for (const x of d.cartas_reajuste || []) usa('aditivos', x.contrato_id, x.arquivo);
  // provas da cobrança (2026-11-24): os comprovantes de cada passo ou despesa, na pasta do inquilino
  for (const x of d.cobranca_registros || []) for (const nome of x.arquivos || []) usa('contrato', x.contrato_id, nome);
  // PDF do boleto emitido à mão no banco (2026-11-24): na pasta do inquilino em que foi anexado (a troca de titular muda o contrato_id)
  for (const cb of d.cobrancas || []) usa('contrato', pastaDoBoletoPdf(cb), cb.boleto_pdf);
  for (const v of d.vistorias) for (const nome of Object.values(v.fotos || {})) usa('contrato', v.contrato_id, nome);
  for (const s of d.seguros) for (const nome of [s.arquivo_apolice, ...(s.outros_arquivos || [])]) usa('seguro', s.contrato_id, nome);
  for (const f of d.fichas || []) for (const k of CAMPOS_ARQUIVO_FICHA) usa('ficha', f.id, f[k]);
  // comprovantes do banco: na pasta do imóvel (Contas pagas/<ano> ou IPTU (guias)/<ano>) e na pasta do contador
  for (const t of ['movimentacoes_banco', 'pagamentos_banco']) {
    for (const m of d[t] || []) {
      const p = pastaDoComprovante(d, m);
      if (p) usa(p.escopo, p.id, m.comprovante);
      const c = pastaContador(d, m);
      if (c) usa(c.escopo, c.id, m.comprovante_contador);
    }
  }
  return out;
}

/** Comprovantes da caução, depósito e reserva no contrato: tipo do nome do arquivo, data e texto. */
const COMPROVANTES_NO_CONTRATO = [
  ['comprovante_caucao', 'caucao', (c) => c.caucao_pago_em || c.caucao_data, 'comprovante da caução'],
  ['comprovante_deposito', 'deposito-garantia', (c) => c.deposito_pago_em || c.deposito_data, 'comprovante do depósito de garantia'],
  ['comprovante_reserva', 'reserva', (c) => c.reserva_data, 'comprovante da reserva'],
  // não é comprovante de dinheiro: o termo de devolução das chaves assinado na saída (B4), com o nome termo-devolucao-chaves-<data da saída>
  ['termo_chaves_saida', 'termo-devolucao-chaves', (c) => c.data_saida, 'termo de devolução das chaves assinado'],
  // contra-vistoria de entrada mandada pelo inquilino (2026-11-15), com a data em que ele mandou
  ['contra_vistoria', 'contra-vistoria', (c) => c.contra_vistoria_em, 'contra-vistoria do inquilino'],
];

/**
 * Comprovantes guardados na pasta do inquilino e o nome que devem ter (o tipo e a data do lançamento,
 * ex.: comprovante-caucao-2026-03-01): [{ contratoId, nome, esperado, rotulo }]. Arquivo da pasta de outro contrato (herdado) fica de fora.
 */
export function comprovantesComNome(d) {
  const out = [];
  const usa = (contratoId, nome, tipo, data, rotulo) => { if (nome && contratoId) out.push({ contratoId, nome, esperado: data ? `comprovante-${tipo}-${data}` : null, rotulo }); };
  for (const c of d.contratos) for (const [campo, tipo, data, rotulo] of COMPROVANTES_NO_CONTRATO) if (!c[`${campo}_contrato`]) usa(c.id, c[campo], tipo, data(c), rotulo);
  for (const x of d.depositos_garantia || []) usa(x.contrato_id, x.comprovante, x.qual === 'caucao' ? 'caucao' : 'deposito-garantia', x.data, `comprovante do depósito ${x.qual === 'caucao' ? 'da caução' : 'de garantia'} de ${C.reais(x.valor)} (${C.dataBr(x.data)})`);
  for (const x of d.correcoes_garantia) usa(x.contrato_id, x.comprovante, 'complemento-caucao', x.data, `comprovante do complemento da caução (${C.dataBr(x.data)})`);
  for (const x of d.aplicacoes) usa(x.contrato_id, x.comprovante, 'aplicacao-garantia', x.data, `comprovante da aplicação da garantia (${C.dataBr(x.data)})`);
  for (const x of d.devolucoes_garantia || []) usa(x.contrato_id, x.comprovante, 'devolucao-garantia', x.data, `comprovante da devolução da garantia (${C.dataBr(x.data)})`);
  for (const x of d.devolucoes_garantia || []) usa(x.contrato_id, x.termo_assinado, 'recibo-devolucao-garantia-assinado', x.data, `recibo da devolução da garantia assinado (${C.dataBr(x.data)})`);
  // termo de entrega do imóvel, acerto final e quitação assinado por todos (vai no e-mail do encerramento)
  for (const x of d.encerramentos) usa(x.contrato_id, x.termo_assinado, 'termo-quitacao-assinado', x.garantia_devolvida_em || x.data_saida, `termo de quitação assinado (${C.dataBr(x.garantia_devolvida_em || x.data_saida)})`);
  for (const x of d.encerramentos) usa(x.contrato_id, x.comprovante, x.saldo > 0 ? 'devolucao-saldo' : 'pagamento-saldo', x.garantia_devolvida_em, `comprovante ${x.saldo > 0 ? 'da devolução' : 'do pagamento'} do saldo da saída (${C.dataBr(x.garantia_devolvida_em)})`);
  return out;
}

/**
 * O nome bate com o lançamento? Aceita a cópia numerada que o sistema cria quando o nome já existe
 * (comprovante-caucao-2026-03-01 (2).pdf).
 */
export function nomeBate(nome, esperado) {
  if (!esperado) return true;
  const base = nome.replace(/\.[^.]*$/, '');
  return base === esperado || (base.startsWith(`${esperado} (`) && /^ \(\d+\)$/.test(base.slice(esperado.length)));
}

/** A que lançamento pertence cada arquivo (para a caixa de arquivos): Map "escopo:id|nome" → texto. */
export function rotulosDosArquivos(d) {
  const m = new Map();
  const poe = (escopo, id, nome, rotulo) => { if (nome && id) m.set(`${escopo}:${id}|${nome}`, rotulo); };
  for (const x of comprovantesComNome(d)) poe('contrato', x.contratoId, x.nome, x.rotulo);
  for (const c of d.contratos) {
    for (const [campo, nome] of DOCUMENTOS_ENTRADA) {
      poe('assinados', c.id, c[campoArquivoDoc(campo)], `${nome} assinado`);
      poe('assinados', c.id, (c[campoParcialDoc(campo)] || {}).arquivo, `${nome} (falta assinatura)`);
    }
  }
  for (const a of d.aditivos) poe('aditivos', a.contrato_id, a.arquivo, `termo aditivo${a.data ? ` (${C.dataBr(a.data)})` : ''}`);
  for (const x of d.documentos_locacao || []) poe('aditivos', x.contrato_id, x.arquivo, `${String(x.nome || 'documento').toLocaleLowerCase('pt-BR')} de ${C.dataBr(x.data)} assinado`);
  for (const a of d.acordos || []) poe('contrato', a.contrato_id, a.termo_assinado, `termo do acordo de ${C.dataBr(a.data)} assinado`);
  for (const x of d.devolucoes_garantia || []) poe('contrato', x.contrato_id, x.termo_assinado, `recibo da devolução da garantia de ${C.dataBr(x.data)} assinado`);
  for (const n of d.notificacoes || []) {
    poe('contrato', n.contrato_id, n.arquivo_assinado, `notificação de ${C.dataBr(n.data)} assinada (${n.assunto})`);
    poe('contrato', n.contrato_id, n.comprovante_baixa, `comprovante da baixa da notificação de ${C.dataBr(n.data)}${n.resolvida_em ? ` (resolvida em ${C.dataBr(n.resolvida_em)})` : ''}`);
  }
  for (const cb of d.cobrancas || []) poe('contrato', pastaDoBoletoPdf(cb), cb.boleto_pdf, `PDF do boleto emitido no banco (${C.compBr(cb.competencia)}, vence ${C.dataBr(cb.vencimento)})`);
  for (const x of d.cobranca_registros || []) for (const nome of x.arquivos || []) poe('contrato', x.contrato_id, nome, `prova da cobrança: ${String(x.tipo || '').toLowerCase()} de ${C.dataBr(x.data)}`);
  for (const x of d.cartas_reajuste || []) poe('aditivos', x.contrato_id, x.arquivo, `carta de reajuste de ${C.compBr(x.competencia)} (enviada em ${C.dataBr(x.enviada_em)})`);
  for (const v of d.vistorias) for (const nome of Object.values(v.fotos || {})) poe('contrato', v.contrato_id, nome, `foto da vistoria de ${String(v.tipo || '').toLowerCase()} (${C.dataBr(v.data)})`);
  for (const f of d.fichas || []) {
    poe('ficha', f.id, f.comprovante_reserva, `comprovante da reserva (${C.dataBr(f.reserva_data)})`);
    poe('ficha', f.id, f.comprovante_devolucao, `comprovante da devolução da reserva (${C.dataBr(f.devolucao_data)})`);
    poe('ficha', f.id, f.analise_serasa, 'análise do Serasa');
  }
  for (const s of d.seguros) {
    poe('seguro', s.contrato_id, s.arquivo_apolice, `apólice (vigência ${C.dataBr(s.vigencia_inicio)} a ${C.dataBr(s.vigencia_fim)})`);
    for (const nome of s.outros_arquivos || []) poe('seguro', s.contrato_id, nome, `outro arquivo da apólice (vigência ${C.dataBr(s.vigencia_inicio)} a ${C.dataBr(s.vigencia_fim)})`);
  }
  for (const t of ['movimentacoes_banco', 'pagamentos_banco']) {
    for (const x of d[t] || []) {
      const p = pastaDoComprovante(d, x);
      const c = pastaContador(d, x);
      const rotulo = rotuloDoComprovante(d, x);
      if (p) poe(p.escopo, p.id, x.comprovante, rotulo);
      if (c) poe(c.escopo, c.id, x.comprovante_contador, `cópia para o contador (${apelidoDaConta(d, contaDeOrigem(d, x))} ${C.compBr(mesDoDinheiro(d, x))}) · ${rotulo}`);
    }
  }
  return m;
}

/** O valor de um campo com o nome de arquivo trocado (texto, lista ou objeto de fotos); undefined se o nome não está nele. */
function trocarNomeNoValor(v, antigo, novo) {
  if (v === antigo) return novo;
  if (Array.isArray(v)) return v.includes(antigo) ? v.map((x) => (x === antigo ? novo : x)) : undefined;
  if (v && typeof v === 'object') {
    if (!Object.values(v).includes(antigo)) return undefined;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === antigo ? novo : x]));
  }
  return undefined;
}

/**
 * Anexo de uma pasta (escopo e código, como em arquivosReferenciados) que passou a se chamar `novo`: troca o nome só nos
 * lançamentos que apontam para ele naquela pasta (o mesmo nome em outra pasta é outro arquivo). Cada campo candidato é
 * conferido trocando e vendo se a referência daquela pasta aparece com o nome novo. `deste(tabela, id)`: só os lançamentos
 * deste aparelho (o do outro continua com o arquivo dele). Devolve quantos campos mudaram.
 */
export function renomearArquivoNoBanco(d, escopo, id, antigo, novo, usuario, deste = () => true) {
  const alvo = `${escopo}:${id}|${novo}`;
  const tem = () => arquivosReferenciados(d).some((x) => `${x.escopo}:${x.id}|${x.nome}` === alvo);
  if (!antigo || !novo || antigo === novo || tem()) return 0;
  const trocas = [];
  for (const [t, lista] of Object.entries(d)) {
    if (t === 'historico' || !Array.isArray(lista) || !TABELAS[t]) continue;
    for (const r of lista) {
      if (!r || typeof r !== 'object' || !deste(t, r.id)) continue;
      for (const [k, v] of Object.entries(r)) {
        const trocado = trocarNomeNoValor(v, antigo, novo);
        if (trocado === undefined) continue;
        r[k] = trocado; const daPasta = tem(); r[k] = v;
        if (daPasta) trocas.push([t, r.id, k, trocado]);
      }
    }
  }
  for (const [t, rid, k, valor] of trocas) atualizar(d, t, rid, { [k]: valor }, usuario, `Arquivo guardado como "${novo}" (já havia outro "${antigo}" na nuvem, de outro aparelho)`);
  return trocas.length;
}

/** Arquivo renomeado na pasta do inquilino: troca o nome em todos os lançamentos que apontam para ele. */
export function renomearReferencias(d, contratoId, antigo, novo, usuario) {
  const texto = `Arquivo renomeado para acompanhar o lançamento: ${antigo} → ${novo}`;
  for (const c of d.contratos) {
    for (const [campo] of COMPROVANTES_NO_CONTRATO) {
      if (c[campo] === antigo && (c[`${campo}_contrato`] || c.id) === contratoId) atualizar(d, 'contratos', c.id, { [campo]: novo }, usuario, texto);
    }
  }
  for (const t of TABELAS_COMPROVANTE) {
    for (const x of (d[t] || []).filter((y) => y.contrato_id === contratoId && y.comprovante === antigo)) atualizar(d, t, x.id, { comprovante: novo }, usuario, texto);
  }
}

const porDataAditivo = (a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id;
/**
 * Termos aditivos assinados do contrato (posteriores a ele, com o arquivo anexado), do mais recente ao mais antigo.
 * É o que vale para a troca de titular (o termo dela não pode ser dado como perdido).
 */
export const aditivosDo = (d, contratoId) => d.aditivos.filter((a) => a.contrato_id === contratoId && a.arquivo).sort(porDataAditivo);
/** Termo assinado, mas o papel se perdeu (sem arquivo): vale como assinado, salvo para a troca de titular. */
export const aditivoPerdido = (a) => !a.arquivo && !!a.perdido_em;
/** Termos que valem: assinados com o arquivo ou registrados como perdidos. Contam para "Possui termo aditivo" e para a troca do dia. */
export const aditivosValidos = (d, contratoId) => d.aditivos.filter((a) => a.contrato_id === contratoId && (a.arquivo || a.perdido_em)).sort(porDataAditivo);
/** Termos aditivos gerados pelo sistema que aguardam a assinatura (sem arquivo e sem registro de perda). */
export const aditivosAguardando = (d, contratoId) => d.aditivos.filter((a) => a.contrato_id === contratoId && !a.arquivo && !a.perdido_em).sort(porDataAditivo);

/**
 * Número do próximo termo aditivo: conta os termos de todos os contratos da cadeia (na troca de titular o contrato é o mesmo).
 * Ex.: o contrato de Pedro tem o 1º termo (troca do vencimento); Lúcia assume → o termo da troca é o 2º. Um termo excluído
 * não faz repetir o número de outro (vale o maior já usado).
 */
export function proximoNumeroAditivo(d, c) {
  const { antes, depois } = cadeiaDeContratos(d, c);
  const ids = new Set([c, ...antes, ...depois].map((x) => x.id));
  const l = d.aditivos.filter((a) => ids.has(a.contrato_id));
  return Math.max(l.length, ...l.map((a) => Number(a.numero) || 0)) + 1;
}

const aditivosDeVencimento = (d, contratoId) => d.aditivos.filter((a) => a.contrato_id === contratoId && (a.arquivo || a.perdido_em) && a.dia_novo && a.primeiro_vencimento)
  .sort((a, b) => a.primeiro_vencimento.localeCompare(b.primeiro_vencimento));

/**
 * Vencimento do boleto do aluguel de uma competência, pelo dia do cadastro. Antes do 1º vencimento de um termo aditivo
 * de troca do dia já assinado, vale o dia anterior. Ex.: dia 10 → 15 a partir de 15/12/2026: o boleto que vence em
 * novembro continua no dia 10; o de dezembro em diante, dia 15.
 */
export function vencimentoDoContrato(d, c, comp) {
  const mesSeguinte = c.cobranca_mes_seguinte !== false;
  const mesVenc = mesSeguinte ? C.somarMeses(comp, 1) : comp;
  const depois = aditivosDeVencimento(d, c.id).find((a) => a.primeiro_vencimento.slice(0, 7) > mesVenc);
  return C.vencimentoDaCompetencia(comp, depois ? depois.dia_anterior : c.dia_vencimento || 10, mesSeguinte);
}

/**
 * Mês de referência e vencimento juntos, para os campos de mês que escolhem um boleto (pedido do dono de 24/11/2026: o mês
 * de referência digitado como se fosse o do vencimento deixava a reserva, a carência e o novo valor no boleto errado).
 * Ex.: aluguel que vence no mês seguinte, dia 10 → "Referência 11/2026 – vence 10/12/2026". O boleto já gerado manda no
 * vencimento; sem ele, o do cadastro (``c`` pode ser o contrato ainda no formulário, sem id).
 */
export function referenciaEVencimento(d, c, comp) {
  if (!c || !C.competenciaValida(comp, '')) return '';
  const cb = c.id ? boletoDoMes(d, c.id, comp) : null;
  return `Referência ${C.compBr(comp)} – vence ${C.dataBr(cb ? cb.vencimento : vencimentoDoContrato(d, c, comp))}`;
}

/**
 * Termo aditivo de troca do dia assinado: o cadastro passa ao dia novo e os boletos em aberto que vencem a partir do
 * 1º vencimento do termo mudam de dia (os pagos e os já emitidos no banco ficam; estes ficam anotados no Histórico). Devolve quantos boletos mudaram.
 */
function aplicarAditivoVencimento(d, a, c, usuario) {
  if (c.dia_vencimento !== a.dia_novo) {
    atualizar(d, 'contratos', c.id, { dia_vencimento: a.dia_novo }, usuario, `${c.inquilino_nome}: vencimento passa ao dia ${a.dia_novo} (termo aditivo assinado)`);
  }
  const mes = a.primeiro_vencimento.slice(0, 7);
  let n = 0;
  for (const cb of d.cobrancas.filter((x) => x.contrato_id === c.id && !x.data_pagamento && !emAcordo(x) && !ehBoletoAvulso(x) && x.vencimento && x.vencimento.slice(0, 7) >= mes)) {
    const venc = `${cb.vencimento.slice(0, 7)}-${String(Math.min(a.dia_novo, C.diasNoMes(cb.vencimento.slice(0, 7)))).padStart(2, '0')}`;
    if (venc === cb.vencimento) continue;
    // boleto já emitido no banco não se mexe (o do banco e o PDF do inquilino continuariam no dia antigo): fica anotado
    if (emitidoNoBanco(cb)) {
      registrar(d, usuario, 'Alteração', 'cobrancas', cb.id, `Boleto ${C.compBr(cb.competencia)} emitido no banco: o vencimento continua ${C.dataBr(cb.vencimento)}; para passar a ${C.dataBr(venc)}, cancele no banco e emita de novo`, null, { contrato_id: c.id, imovel_id: c.imovel_id });
      continue;
    }
    atualizar(d, 'cobrancas', cb.id, { vencimento: venc }, usuario, `Boleto ${C.compBr(cb.competencia)}: vencimento ${C.dataBr(cb.vencimento)} → ${C.dataBr(venc)} (termo aditivo)`);
    n += 1;
  }
  return n;
}

/**
 * Gera (ou altera) o termo aditivo de troca do dia do vencimento, ainda sem assinatura. ``f``: data, dia_novo,
 * mes (AAAA-MM do 1º vencimento no dia novo), testemunhas, modelo_id e texto (o texto do modelo, que pode ser ajustado só neste termo).
 * Só muda o dia: não há cobrança nem desconto proporcional. Ao anexar o assinado, o cadastro e os boletos em aberto mudam (`aplicarAditivoVencimento`).
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
  dados.numero = proximoNumeroAditivo(d, c);
  return inserir(d, 'aditivos', dados, usuario, `${c.inquilino_nome}: termo aditivo de vencimento gerado (aguardando assinatura)`);
}

/**
 * Gera (ou altera) o termo aditivo de troca de inquilino (herança do contrato), ainda sem assinatura. Só no contrato que
 * continua o de outro titular. ``f``: data, testemunhas, modelo_id e texto. A troca vale a partir da entrada do novo
 * titular; o aluguel gravado é o vigente nessa data (ex.: troca em 27/04/2026 → aluguel de 27/04/2026).
 */
export function salvarAditivoTroca(d, contratoId, f, usuario, id = null) {
  const c = buscar(d, 'contratos', contratoId);
  const ant = contratoHerdado(d, c);
  const atual = id ? buscar(d, 'aditivos', id) : null;
  if (atual && atual.arquivo) throw new Error('Este termo aditivo já foi assinado e não pode mais ser alterado.');
  if (!ant) throw new Error('Este inquilino não continua o contrato de outro: o termo de troca de inquilino é gerado no contrato do novo titular.');
  if (!f.data) throw new Error('Informe a data do termo aditivo.');
  if (!String(f.texto || '').trim()) throw new Error('O texto do termo aditivo está vazio.');
  const troca = c.data_entrada || c.vigencia_inicio || f.data;
  // garantia nova: o valor da garantia do anterior (a devolver a ele) entra no termo
  const dados = { contrato_id: c.id, imovel_id: c.imovel_id || null, tipo: 'Troca de titular', data: f.data, aluguel: aluguelAtual(d, c, troca),
    garantia_anterior: garantiaNova(c) ? valorGarantia(d, ant) : null,
    // garantia em dinheiro de quem sai com os rendimentos da poupança até a troca: o que quem entra paga a quem sai (a
    // garantia continua) ou o que é devolvido a quem sai (garantia nova). Vem do Banco Central na tela e pode ser corrigido
    garantia_corrigida: f.garantia_corrigida > 0 ? f.garantia_corrigida : null,
    garantia_depositada: f.garantia_corrigida > 0 && contratoDaGarantiaNaTroca(d, c) ? valorGarantia(d, contratoDaGarantiaNaTroca(d, c)) : null,
    testemunhas: (f.testemunhas || []).filter((t) => t && t.nome), modelo_id: f.modelo_id ?? (atual ? atual.modelo_id : null), texto: String(f.texto),
    assunto: `Troca de titular: ${ant.inquilino_nome} → ${c.inquilino_nome}, a partir de ${C.dataBr(troca)}`, arquivo: null };
  if (atual) {
    atualizar(d, 'aditivos', atual.id, dados, usuario, `${c.inquilino_nome}: termo aditivo de ${C.dataBr(f.data)} alterado`);
    return atual;
  }
  dados.numero = proximoNumeroAditivo(d, c);
  return inserir(d, 'aditivos', dados, usuario, `${c.inquilino_nome}: termo aditivo de troca de inquilino gerado (aguardando assinatura)`);
}

/** Anexa o arquivo assinado ao termo gerado pelo sistema: passa a contar como termo aditivo registrado. */
export function assinarAditivo(d, id, { data, arquivo }, usuario) {
  const a = buscar(d, 'aditivos', id);
  const c = buscar(d, 'contratos', a.contrato_id);
  if (!data) throw new Error('Informe a data da assinatura.');
  if (!arquivo) throw new Error('Anexe o arquivo do termo aditivo assinado.');
  atualizar(d, 'aditivos', a.id, { arquivo, assinado_em: data, perdido_em: null, perdido_pendente: null }, usuario, `${c.inquilino_nome}: termo aditivo de ${C.dataBr(a.data)} assinado em ${C.dataBr(data)}`);
  marcarAditivos(d, c.id, usuario);
  if (a.dia_novo && a.primeiro_vencimento) aplicarAditivoVencimento(d, a, c, usuario);
  return a;
}

/**
 * Registra um termo aditivo já assinado: exige data, assunto e o arquivo anexado. Marca o contrato com "Possui termo aditivo".
 * ``perdido``: termo antigo assinado cujo papel se perdeu (sem arquivo; ``hoje`` = data do registro da perda). Quem não é
 * administrador fica aguardando a análise. Não vale como o termo da troca de titular.
 * ``tipo``: "Troca de titular" quando é o termo da troca (o novo titular assume o contrato com ele assinado); "Outro" para
 * outro assunto no contrato de quem ainda espera o termo da troca (não faz o contrato passar). Sem tipo: como antes.
 */
export function registrarAditivo(d, contratoId, { data, assunto, arquivo, perdido = false, tipo = null }, usuario, administrador = true, hoje = C.hojeIso()) {
  const c = buscar(d, 'contratos', contratoId);
  if (!data) throw new Error('Informe a data do termo aditivo.');
  if (!String(assunto || '').trim()) throw new Error('Informe o assunto do termo aditivo (ex.: troca do dia do vencimento).');
  if (!arquivo && !perdido) throw new Error('Anexe o arquivo do termo aditivo assinado.');
  const perda = perdido && !arquivo ? { perdido_em: hoje, perdido_pendente: administrador ? null : usuario } : {};
  const a = inserir(d, 'aditivos', { contrato_id: c.id, imovel_id: c.imovel_id || null, ...(tipo ? { tipo } : {}), data, assunto: String(assunto).trim(), arquivo: arquivo || null, ...perda }, usuario,
    `${c.inquilino_nome}: termo aditivo de ${C.dataBr(data)}${perda.perdido_em ? ` (perdido, registrado em ${C.dataBr(hoje)}${administrador ? '' : ', aguardando o administrador'})` : ''}`);
  marcarAditivos(d, c.id, usuario);
  return a;
}

/**
 * Termo aditivo gerado que não voltou assinado (o papel se perdeu): vale como assinado (conta como "Possui termo aditivo" e
 * a troca do dia passa a valer), sem arquivo. Sem data: desfaz (volta a "aguardando assinatura"; o dia do vencimento já
 * mudado não volta sozinho). O termo da troca de titular não pode ser dado como perdido. Quem não é administrador aguarda a análise
 * (a troca do dia só vale quando o administrador confirmar).
 * Ex.: troca do dia 10 → 15 a partir de 15/12/2026, gerada em 10/09/2026 e perdida → boletos em aberto desde 12/2026 no dia 15.
 */
export function marcarAditivoPerdido(d, id, data, usuario, administrador = true) {
  const a = buscar(d, 'aditivos', id);
  if (!a) throw new Error('Termo aditivo não encontrado.');
  const c = buscar(d, 'contratos', a.contrato_id);
  if (data) {
    if (a.arquivo) throw new Error('Este termo aditivo já tem o arquivo assinado.');
    if (a.tipo === 'Troca de titular') throw new Error('O termo aditivo da troca de titular não pode ser marcado como perdido: anexe o arquivo assinado.');
  }
  atualizar(d, 'aditivos', a.id, { perdido_em: data || null, perdido_pendente: data && !administrador ? usuario : null }, usuario,
    `${c.inquilino_nome}: termo aditivo de ${C.dataBr(a.data)} ${data ? `perdido (registrado em ${C.dataBr(data)}${administrador ? '' : ', aguardando o administrador'})` : 'não está mais como perdido'}`);
  marcarAditivos(d, c.id, usuario);
  if (data && administrador && a.dia_novo && a.primeiro_vencimento) aplicarAditivoVencimento(d, a, c, usuario);
  return a;
}

/** Análise do administrador da perda registrada por outro usuário: aceitar confirma; recusar desfaz (volta a aguardar assinatura). */
export function analisarAditivoPerdido(d, id, aceitar, usuario) {
  const a = buscar(d, 'aditivos', id);
  if (!a || !a.perdido_em) return null;
  if (!aceitar) return marcarAditivoPerdido(d, id, null, usuario);
  const c = buscar(d, 'contratos', a.contrato_id);
  atualizar(d, 'aditivos', a.id, { perdido_pendente: null }, usuario, `${c.inquilino_nome}: perda do termo aditivo de ${C.dataBr(a.data)} confirmada pelo administrador`);
  if (a.dia_novo && a.primeiro_vencimento) aplicarAditivoVencimento(d, a, c, usuario); // a troca do dia só vale agora
  return a;
}

/** "Possui termo aditivo" só vale com algum termo registrado (assinado ou perdido): acerta a marca depois de incluir ou excluir. */
export function marcarAditivos(d, contratoId, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  if (!c) return;
  const tem = aditivosValidos(d, c.id).length > 0;
  if (!!c.possui_aditivos !== tem) atualizar(d, 'contratos', c.id, { possui_aditivos: tem }, usuario, `${c.inquilino_nome}: ${tem ? 'possui' : 'não possui mais'} termo aditivo`);
}

const porDataVistoria = (a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id;
export const vistoriasDo = (d, contratoId) => d.vistorias.filter((v) => v.contrato_id === contratoId).sort(porDataVistoria);
/** Vistoria mais recente do imóvel (para começar a próxima a partir dela). */
export const ultimaVistoriaDoImovel = (d, imovelId) => d.vistorias.filter((v) => v.imovel_id === imovelId).sort(porDataVistoria)[0] || null;

/** Seguro obrigatório é do inquilino: cobra a apólice do inquilino atual do imóvel (o anterior leva a dele). */
export function alertaSeguroImovel(d, i, hoje = C.hojeIso()) {
  const atual = d.contratos.filter((c) => c.imovel_id === i.id && contratoAtivo(c, hoje) && !herancaAgendada(d, c, hoje)).sort((a, b) => String(b.data_entrada || '').localeCompare(String(a.data_entrada || '')))[0];
  if (!atual || atual.conta_seguro === SITUACOES[2]) return null; // contrato sem seguro ("não tem"): nada a cobrar
  const a = alertas.alertaSeguro(dataBaseCorrecao(atual), hoje, segurosDoContrato(d, atual.id), atual);
  return a && { ...a, contrato_id: atual.id, ancora: 'seguros' };
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
    const atuais = d.contratos.filter((c) => c.imovel_id === i.id && c.ativo !== false && contratoAtivo(c, hoje) && !herancaAgendada(d, c, hoje));
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
    const doInquilino = alertasDoInquilino(d, c, hoje);
    if (!doInquilino.length) continue;
    const imovel = buscar(d, 'imoveis', c.imovel_id);
    for (const a of doInquilino) {
      lista.push({ ...a, contrato_id: c.id, imovel: imovel ? imovel.nome : '', inquilino: c.inquilino_nome });
    }
  }
  for (const c of d.contratos) {
    const a = alertaTitularidade(d, c, hoje);
    const imovel = buscar(d, 'imoveis', c.imovel_id);
    if (a && imovel) lista.push({ ...a, imovel_id: imovel.id, imovel: imovel.nome, inquilino: c.inquilino_nome });
    // troca de titular com garantia nova: devolver a do anterior (o contrato dele já está sem vínculo)
    const dev = alertaDevolucaoGarantia(d, c, hoje);
    if (dev) lista.push({ ...dev, contrato_id: c.id, imovel: imovel ? imovel.nome : '', inquilino: c.inquilino_nome });
  }
  for (const i of d.imoveis) {
    const a = alertaSeguroImovel(d, i, hoje);
    if (a) lista.push({ ...a, imovel_id: i.id, imovel: i.nome, inquilino: (buscar(d, 'contratos', a.contrato_id) || {}).inquilino_nome || '' });
    if (i.verificar) lista.push({ nivel: 'aviso', tipo: 'A verificar', texto: i.verificar, imovel_id: i.id, imovel: i.nome, inquilino: '' });
  }
  lista.push(...alertasIptu(d, hoje));
  const banco = alertaBanco(d, hoje);
  if (banco) lista.push(banco);
  lista.push(...alertasBoletosSemOcupacao(d));
  lista.push(...alertasBoletosManuais(d));
  const pastas = AI.alertaPastas(d, hoje); // Arquivo impresso: um alerta só, com os números
  if (pastas) lista.push(pastas);
  for (const x of inadimplencia(d, hoje, { historico: false }).devedores) {
    const i = buscar(d, 'imoveis', x.contrato.imovel_id);
    lista.push({ nivel: x.diasMax >= CR.regra('dias_vermelho', x.contrato) ? 'perigo' : 'aviso', tipo: 'Inadimplência', contrato_id: x.contrato.id, imovel: i ? i.nome : '', inquilino: x.contrato.inquilino_nome,
      texto: `${C.plural(x.boletos.length, 'boleto vencido e não pago', 'boletos vencidos e não pagos')}, ${C.reais(x.totalHoje)} hoje (com multa e juros), o mais antigo há ${C.plural(x.diasMax, 'dia')}.${x.passo ? ` Próximo passo: ${x.passo.toLocaleLowerCase('pt-BR')}.` : ''}` });
  }
  return lista.sort((a, b) => estiloAlerta(d, a.tipo).prioridade - estiloAlerta(d, b.tipo).prioridade || ordem[a.nivel] - ordem[b.nivel]);
}

// --------------------------------------------------------------------------
// Aparência dos alertas: cor, ênfase e prioridade de cada tipo (editável em #/alertas-config)
// --------------------------------------------------------------------------
export const TIPOS_ALERTA = ['Vigência do contrato', 'Reajuste do aluguel', 'Inadimplência',
  'Seguro obrigatório', 'Seguro contra incêndio', 'IPTU do proprietário', 'Reserva do imóvel', 'Condomínio', 'Fiador', 'Aplicação da garantia', 'Correção da caução', 'Devolver garantia',
  'Titularidade', 'Rotina de entrada', 'Comprovante a buscar no banco', 'Incluir caução e anexar comprovante', 'Incluir depósito e anexar comprovante', 'Assinatura faltante', 'Documento perdido a confirmar', 'Aditivo da troca de titular', 'Aditivo aguardando assinatura', 'Termo do acordo', 'Notificação ao inquilino', 'Banco', 'Pasta física', 'A verificar'];
/** "Padrão" = cor pela gravidade do aviso (vermelho quando urgente, laranja quando aviso, azul quando informação). */
export const CORES_ALERTA = ['Padrão', 'Vermelho', 'Laranja', 'Amarelo', 'Verde', 'Azul', 'Roxo', 'Cinza'];
export const ENFASES_ALERTA = ['Normal', 'Forte', 'Discreta'];
/** Prioridade: 1 aparece primeiro; empate segue a gravidade. */
const PADRAO_ALERTA = { cor: 'Padrão', enfase: 'Normal', prioridade: 3 };
export const ESTILOS_ALERTA_PADRAO = {
  'Vigência do contrato': { cor: 'Vermelho', enfase: 'Forte', prioridade: 1 },
  'Reajuste do aluguel': { cor: 'Laranja', enfase: 'Forte', prioridade: 2 },
  'A verificar': { cor: 'Amarelo', enfase: 'Normal', prioridade: 3 },
};
/** Quanto tempo antes aparece cada alerta com prazo: a regra do sistema que o guarda (também em Regras do sistema). */
export const ANTECEDENCIA_ALERTA = {
  'Vigência do contrato': 'antecedencia_vigencia', 'Reajuste do aluguel': 'antecedencia_reajuste', 'Seguro obrigatório': 'antecedencia_seguro',
  'IPTU do proprietário': 'antecedencia_iptu', 'Reserva do imóvel': 'antecedencia_reserva', 'Fiador': 'antecedencia_fiador',
  'Notificação ao inquilino': 'notificacao_aviso_dias',
};
/** Antecedência do alerta do tipo: { chave, valor, padrao, unidade ('dias' | 'meses'), min, max } (null: alerta sem prazo). */
export function antecedenciaAlerta(tipo) {
  const chave = ANTECEDENCIA_ALERTA[tipo];
  const def = chave && CR.definicaoRegra(chave);
  return def ? { chave, valor: CR.regra(chave), padrao: def.padrao, unidade: /meses/.test(def.rotulo) ? 'meses' : /dias úteis/.test(def.rotulo) ? 'dias úteis' : 'dias', min: def.min, max: def.max } : null;
}
export const estiloAlerta = (d, tipo) => ({ ...PADRAO_ALERTA, ...ESTILOS_ALERTA_PADRAO[tipo], ...((d && d.estilos_alertas) || {})[tipo] });

/**
 * Grava a aparência escolhida para cada tipo de alerta (só o que difere do padrão do sistema) e, com ``antecedencias``
 * ({ tipo: número }), quanto tempo antes cada alerta com prazo aparece (fica nas Regras do sistema; ``'padrao'``: todas voltam ao padrão).
 * Ex.: { 'IPTU do proprietário': 30 } → a guia de 10/03 aparece em 08/02.
 */
export function salvarEstilosAlertas(d, estilos, usuario, antecedencias = null) {
  if (antecedencias) {
    const valores = { ...CR.escolhasDe(d) };
    for (const [tipo, chave] of Object.entries(ANTECEDENCIA_ALERTA)) {
      if (antecedencias === 'padrao') delete valores[chave];
      else if (tipo in antecedencias) valores[chave] = antecedencias[tipo];
    }
    salvarRegrasSistema(d, valores, usuario, 'Antecedência dos alertas');
  }
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
// Ordem das caixas de cada página, escolhida pelo administrador e vista por todos:
// d.ordem_caixas = { pagina: { grupo: [nomes das caixas na ordem] } }
// --------------------------------------------------------------------------
/**
 * Nova ordem das caixas visíveis, sem perder o lugar das que não aparecem agora (ex.: "Reserva" só existe em alguns
 * inquilinos): cada uma ausente volta logo depois da caixa que vinha antes dela na ordem guardada.
 * Ex.: guardada [A, B, R, C], na tela [C, A, B] → [C, A, B, R].
 */
export function juntarOrdem(guardada, visiveis) {
  const nova = [...visiveis];
  guardada.forEach((k, n) => {
    if (nova.includes(k)) return;
    const antes = guardada.slice(0, n).reverse().find((x) => nova.includes(x));
    nova.splice(antes === undefined ? 0 : nova.indexOf(antes) + 1, 0, k);
  });
  return nova;
}

/**
 * Ordem para desenhar as caixas que estão na tela (na ordem do sistema): as já guardadas seguem a ordem guardada,
 * ocupando os lugares delas; caixa nova (nunca arrumada) fica no lugar de sempre.
 * Ex.: na tela [A, B, N, C], guardada [C, A, B] → [C, A, N, B].
 */
export function ordenarCaixas(naTela, guardada = []) {
  const conhecidas = naTela.filter((k) => guardada.includes(k)).sort((a, b) => guardada.indexOf(a) - guardada.indexOf(b));
  return naTela.map((k) => (guardada.includes(k) ? conhecidas.shift() : k));
}

export const ordemGuardada = (d, pagina, grupo) => (((d && d.ordem_caixas) || {})[pagina] || {})[grupo] || [];

/** Grava a nova ordem das caixas de um grupo da página (fica no histórico). */
export function salvarOrdemCaixas(d, pagina, grupo, visiveis, usuario) {
  const antes = ordemGuardada(d, pagina, grupo);
  const nova = juntarOrdem(antes, visiveis);
  d.ordem_caixas = { ...(d.ordem_caixas || {}), [pagina]: { ...((d.ordem_caixas || {})[pagina] || {}), [grupo]: nova } };
  registrar(d, usuario, 'Alteração', null, null, `Ordem das caixas da página ${pagina}${grupo ? ` (${grupo})` : ''}: ${visiveis.join(' → ')}`, { ordem_caixas: { de: antes, para: nova } });
}

// --------------------------------------------------------------------------
// Boleto: textos para copiar no site do banco
// --------------------------------------------------------------------------
/** Tamanho máximo da descrição da cobrança no C6 (Bolepix). */
export const LIMITE_DESCRICAO_BOLETO = 100;

/**
 * Valor, desconto, juros ao dia e descrição no formato usado nos boletos (ex.: "ALUGUEL 3.644,45"). Decisão do dono de 24/11/2026:
 * os valores vão sem o "RS" (o banco não aceita o "$"), para caber nas 100 letras da descrição do C6. ``moeda``: o que vai antes de
 * cada valor (o e-mail do boleto usa "R$ " e não precisa caber em 100 letras: nada é encurtado).
 */
export function dadosBoleto(d, cb, { moeda = '' } = {}) {
  const rs = (v) => `${moeda}${C.reais(v, false)}`;
  const limite = moeda ? Infinity : LIMITE_DESCRICAO_BOLETO;
  const c = buscar(d, 'contratos', cb.contrato_id);
  const imovel = buscar(d, 'imoveis', c.imovel_id);
  const t = totais(cb);
  const linhas = [];
  if (ehComplementoCaucao(cb)) {
    linhas.push(`COMPLEMENTO DA CAUÇÃO${cb.caucao_parcela ? ` PARC. ${cb.caucao_parcela}` : ''} ${rs(cb.caucao_complemento)}`,
      cb.caucao_parcela ? `CAUÇÃO DEPOSITADA ${rs(cb.caucao_anterior)} APÓS ESTA PARC. ${rs(cb.caucao_nova)}` : `CAUÇÃO DEPOSITADA ${rs(cb.caucao_anterior)} NOVA CAUÇÃO ${rs(cb.caucao_nova)}`);
  }
  else if (ehSaldoSaida(cb)) linhas.push(`SALDO DO ACERTO FINAL DA LOCAÇÃO ${rs(t.a_pagar_sem_desconto)}`);
  else if (ehParcelaAcordo(cb)) linhas.push(`ACORDO ${cb.acordo_parcela || ''} ${rs(t.a_pagar_sem_desconto)}`.replace(/  +/g, ' '), `REF. ${(cb.acordo_referente || '').toLocaleUpperCase('pt-BR')}`.slice(0, 60));
  else if (cb.carencia) linhas.push(`CARÊNCIA DO ALUGUEL ${C.compBr(cb.competencia)}`);
  else linhas.push(cb.dias_cobrados < cb.dias_mes ? `ALUGUEL ${cb.dias_cobrados}/${cb.dias_mes} DIAS ${rs(cb.aluguel)}` : `ALUGUEL ${rs(cb.aluguel)}`);
  if (cb.desconto) linhas.push(`COM BONF. ${rs(cb.aluguel - cb.desconto)}`);
  const extras = [];
  if (cb.iptu) extras.push(`IPTU ${rs(cb.iptu)}`);
  if (cb.seguro) {
    const parc = /(\d+\/\d+)/.exec(cb.seguro_parcela || '');
    extras.push(`SEGURO${parc ? parc[1] : ''} ${rs(cb.seguro)}`);
  }
  if (cb.fci) extras.push(`FCI ${rs(cb.fci)}`);
  const iTarifa = extras.length;
  if (cb.taxa_boleto) extras.push(`TARIFA COBRANÇA ${rs(cb.taxa_boleto)}`);
  // cada ajuste do mês, multa de notificação e diferença numa parte (desde 24/11/2026 o boleto pode ter vários ajustes)
  for (const p of partesDosOutros(cb)) extras.push(`${(p.texto || (p.valor < 0 ? 'RESSARCIMENTO' : 'COBRANÇA ADICIONAL')).replace(/Multa por descumprimento da notificação de /g, 'Multa notif. ').toLocaleUpperCase('pt-BR')} ${p.valor < 0 ? `-${rs(-p.valor)}` : rs(p.valor)}`);
  if (cb.reserva_utilizada) extras.push(`RESERVA -${rs(cb.reserva_utilizada)}`);
  const iRessarc = extras.length;
  if (cb.ressarcimento) extras.push(`RESSARCIMENTO CONDOMÍNIO -${rs(cb.ressarcimento)}`);
  if (extras.length && !ehBoletoAvulso(cb)) linhas.push(extras.join(' '));
  // quando a descrição passa do limite do C6, encurta primeiro a tarifa ("TARIFA COBRANÇA" → "TAR. COBRANÇA" → "TAR. COBR." →
  // "TARIFA") e depois o ressarcimento ("RESSARC. CONDOMÍNIO" → "RESSARC. COND."), que fica no fim e era o primeiro a ser
  // cortado (conferência de 24/11/2026: aluguel, bonificação, IPTU, seguro, tarifa e ressarcimento davam 120 letras)
  const encurtar = [
    ...(cb.taxa_boleto ? ['TAR. COBRANÇA', 'TAR. COBR.', 'TARIFA'].map((x) => () => { extras[iTarifa] = `${x} ${rs(cb.taxa_boleto)}`; }) : []),
    ...(cb.ressarcimento ? ['RESSARC. CONDOMÍNIO', 'RESSARC. COND.'].map((x) => () => { extras[iRessarc] = `${x} -${rs(cb.ressarcimento)}`; }) : []),
  ];
  for (const passo of encurtar) {
    if (ehBoletoAvulso(cb) || linhas.join('\n').length <= limite) break;
    passo();
    linhas[linhas.length - 1] = extras.join(' ');
  }
  const valor = t.a_pagar_sem_desconto;
  return {
    pagador: c.inquilino_nome, documento_pagador: c.inquilino_cpf || '',
    numero_documento: ((imovel && imovel.nome) || '').toLocaleUpperCase('pt-BR').replace(/[^A-Z0-9]/g, '').slice(0, 15),
    vencimento: cb.vencimento, valor, desconto: Math.min(cb.desconto, valor),
    valor_com_desconto: t.a_pagar_pontual, multa_percentual: cb.multa_percentual,
    // com FCI, multa e juros são sobre o boleto sem o FCI: a multa vai em valor (R$), não em %
    multa_valor: t.base_multa !== valor ? C.arred((t.base_multa * (cb.multa_percentual || 0)) / 100) : null,
    juros_ao_dia: C.jurosAoDia(t.base_multa, cb.juros_mensal_percentual), descricao: linhas.join('\n'),
    // letras a mais que o C6 corta no fim da descrição (0 = cabe)
    excesso: moeda ? 0 : Math.max(0, linhas.join('\n').length - LIMITE_DESCRICAO_BOLETO),
  };
}

/**
 * Quebra os textos em linhas de até ``largura`` letras sem partir palavra nem valor (as instruções do boleto no C6: 4 linhas de 80).
 * Antes o corte era seco (``slice``) e podia sair "RS1.80" numa linha e "0,00" perdido. Palavra maior que a linha (raro) é cortada.
 * Ex.: linha de 95 letras → uma de até 80, terminando num espaço, e o resto na seguinte.
 */
export function quebrarLinhas(textos, largura) {
  const out = [];
  for (const t of textos) {
    let resto = String(t || '').trim().replace(/\s+/g, ' ');
    while (resto.length > largura) {
      const corte = resto.lastIndexOf(' ', largura);
      const ate = corte > 0 ? corte : largura;
      out.push(resto.slice(0, ate).trim());
      resto = resto.slice(ate).trim();
    }
    if (resto) out.push(resto);
  }
  return out;
}

// --------------------------------------------------------------------------
// Banco (C6): boleto com Pix pela API, por meio da ponte (ponte-c6/)
// --------------------------------------------------------------------------
// Formato da API "Bolepix" v2 do C6 (OpenAPI 1.2.0 oficial, em documentacao/c6-openapi/bolepix.yaml; resumo em documentacao/C6_CAMPOS_CONFIRMADOS.md).
// Os nomes dos campos ficam só em docs/js/mapa-c6.js (M): é lá que se ajusta se a API mudar.
//   Emissão: POST /v2/bank_slips { external_reference_id (26 caracteres A-Z0-9, nosso, nunca reutilizado), amount (NÚMERO em reais, ex.: 3644.45),
//     due_date 'AAAA-MM-DD' (≥ hoje), description (≤100), payer { name ≤40, tax_id (só dígitos), email ≤70, address { address ≤40, neighborhood, city, state, zip_code (8 dígitos) } },
//     payment_method { bank_slip { billing_scheme (carteira 15 produção / 21 sandbox), your_number (≤10 dígitos), instructions (≤4×80) }, pix { key (chave aleatória), type: 'EVP' } },
//     fees { fine_type FIXED_VALUE|PERCENTAGE, fine_value, fine_deadline, interest_type VALUE_PER_DAY|MONTHLY_PERCENTAGE, interest_value, interest_deadline,
//       discount_type VALUE_PER_DAY|MONTHLY_PERCENTAGE (não há desconto fixo até o vencimento), first_discount_value, first_discount_deadline },
//     days_after_due_date, payer_notification [{ channel EMAIL|SMS, destination, notification_date ISSUE_DATE|BEFORE_DUE_DATE|DUE_DATE|AFTER_DUE_DATE }], origin ≤20 }
//   Resposta: { id, external_reference_id, amount, due_date, payment_method { bank_slip { originator_id, billing_scheme, billing_type, digitable_line, bar_code, our_number, number },
//     pix { qr_code (copia e cola), image_content (PNG em base64), mime_type, reference } } }; a consulta traz também status (CREATED → WAITING_CONFIRMATION → PAID; CANCELED),
//     emission_date, denial_info e payer_notification[] (com status e sent_at). payments[] { amount (texto), external_payment_id, payment_date, credit_date, payment_type }
//     só vem na listagem GET /v2/bank_slips (a ponte junta na consulta). PATCH parcial: amount, due_date, description, days_after_due_date, payer{email,address}, payer_notification, fees, bank_slip{your_number, instructions}.
/** Situações do boleto no banco guardadas em ``cobrancas[].banco.situacao``. */
export const SITUACOES_BANCO = ['emitido', 'pago', 'cancelado', 'erro'];

/** Carteira do boleto (``billing_scheme``) de uma conta: a configurada ou a do ambiente. */
export const carteiraDaConta = (conta) => String(conta.carteira || M.CARTEIRAS[conta.ambiente] || M.CARTEIRAS.sandbox);

/** Centavos inteiros → número em reais com 2 casas, como a API pede (``amount: 150.00``). Ex.: 364445 → 3644.45. */
export const centavosParaReais = (c) => Number((Math.round(c || 0) / 100).toFixed(2));

/** Reais (número ou texto "150.00") → centavos inteiros. Ex.: 3644.45 → 364445. */
export const reaisParaCentavos = (v) => C.arred(Number(String(v ?? 0).replace(',', '.')) * 100);

export const configBanco = (d) => ({ ...CONFIG_BANCO_PADRAO, ...(d.config_banco || {}), contas: ((d.config_banco || {}).contas || []).map((x) => ({ ...CONTA_BANCO_PADRAO, ...x,
  notificar: { ...CONTA_BANCO_PADRAO.notificar, ...((x && x.notificar) || {}) }, negativacao: { ...CONTA_BANCO_PADRAO.negativacao, ...((x && x.negativacao) || {}) } })),
  ...(Array.isArray((d.config_banco || {}).contas_arquivo) ? { contas_arquivo: d.config_banco.contas_arquivo.map((x) => ({ ...x })) } : {}) });

/**
 * Contas de outros bancos, sem a ponte (mutirão 3000, venda 17): só recebem o extrato por arquivo (OFX ou CSV baixado no site ou
 * no aplicativo do banco), com as mesmas conferências de saldo e de lançamento repetido. Ficam em ``config_banco.contas_arquivo``
 * (campo que só existe depois da primeira conta assim: banco sem ele = nenhuma), cada uma { id, apelido, emitente_id, banco }.
 * Ex.: { id: 'itau', apelido: 'Itaú', emitente_id: 2, banco: 'Itaú' }. Não emitem boleto, não pagam e não falam com a ponte.
 */
export const contasSoArquivo = (d) => (Array.isArray((d.config_banco || {}).contas_arquivo) ? d.config_banco.contas_arquivo : []);
export const contaSoArquivo = (d, contaId) => contasSoArquivo(d).find((x) => x.id === contaId) || null;
/** Todas as contas que recebem extrato: as do C6 (ponte) e as de outros bancos (só arquivo). */
export const contasDoExtrato = (d) => [...((d.config_banco || {}).contas || []), ...contasSoArquivo(d)];

/** Inclui ou altera uma conta de outro banco (só extrato por arquivo). ``id`` em branco: sai do apelido (ex.: "Itaú" → "itau"). */
export function salvarContaArquivo(d, dados, usuario) {
  const cfg = configBanco(d);
  const apelido = String(dados.apelido || '').trim();
  const id = limparId(dados.id) || limparId(C.semAcento(apelido));
  if (!id) throw new C.ErroUsuario('Dê um apelido à conta (ex.: Itaú).');
  const emitenteId = dados.emitente_id ? Number(dados.emitente_id) : null;
  if (!emitenteId || !buscar(d, 'emitentes', emitenteId)) throw new C.ErroUsuario('Escolha a empresa dona da conta.');
  if (cfg.contas.some((x) => x.id === id)) throw new C.ErroUsuario(`O código "${id}" já é de uma conta do C6. Use outro apelido ou código.`);
  const atuais = cfg.contas_arquivo || [];
  const antes = atuais.find((x) => x.id === id) || null;
  const conta = { ...(antes || {}), id, apelido: apelido || id.toUpperCase(), emitente_id: emitenteId, banco: String(dados.banco || '').trim().slice(0, 60) };
  cfg.contas_arquivo = antes ? atuais.map((x) => (x.id === id ? conta : x)) : [...atuais, conta];
  d.config_banco = cfg;
  registrar(d, usuario, antes ? 'Alteração' : 'Inclusão', 'banco', null, `Conta de outro banco "${conta.apelido}" (${id}, extrato por arquivo) ${antes ? 'alterada' : 'incluída'}`, { conta: { de: antes, para: conta } });
  return conta;
}

/** Tira uma conta de outro banco. Com extrato já importado nela, não tira (as movimentações ficariam sem conta). */
export function excluirContaArquivo(d, contaId, usuario) {
  const cfg = configBanco(d);
  const conta = (cfg.contas_arquivo || []).find((x) => x.id === contaId);
  if (!conta) throw new C.ErroUsuario('Conta não encontrada.');
  const n = (d.movimentacoes_banco || []).filter((m) => m.conta_id === contaId).length;
  if (n) throw new C.ErroUsuario(`A conta ${conta.apelido} tem ${n} movimentação(ões) importada(s): não dá para tirar (o extrato ficaria sem conta).`);
  cfg.contas_arquivo = cfg.contas_arquivo.filter((x) => x.id !== contaId);
  d.config_banco = cfg;
  registrar(d, usuario, 'Exclusão', 'banco', null, `Conta de outro banco "${conta.apelido}" (${contaId}) tirada`, { conta: { de: conta, para: null } });
}

export const contaBanco = (d, contaId) => configBanco(d).contas.find((x) => x.id === contaId) || null;

/** Integração ligada e com pelo menos uma conta (a ponte deste navegador é conferida em banco.js → pontePronta). */
export function bancoAtivo(d) {
  const cfg = configBanco(d);
  return !!(cfg.ativo && cfg.contas.length);
}

/** Por que os botões do banco estão desabilitados (texto do ``title``); vazio quando a configuração compartilhada está pronta. */
export function motivoBancoInativo(d) {
  const cfg = configBanco(d);
  if (!cfg.contas.length) return 'Aguardando as chaves de acesso do C6: cadastre as contas em Sistema → Banco → Banco (C6)';
  if (!cfg.ativo) return 'Integração com o C6 desligada: ative em Sistema → Banco → Banco (C6)';
  return '';
}

const limparId = (x) => String(x || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

/** Grava a configuração geral compartilhada (ativar, conta padrão, modo de escolha). O endereço e a senha da ponte ficam no navegador. */
export function salvarConfigBanco(d, dados, usuario) {
  const antes = configBanco(d);
  const novo = { ...antes, ativo: dados.ativo === undefined ? antes.ativo : !!dados.ativo,
    conta_padrao_id: dados.conta_padrao_id === undefined ? antes.conta_padrao_id : limparId(dados.conta_padrao_id),
    modo_conta_boleto: MODOS_CONTA_BOLETO[dados.modo_conta_boleto] ? dados.modo_conta_boleto : (MODOS_CONTA_BOLETO[antes.modo_conta_boleto] ? antes.modo_conta_boleto : 'padrao') };
  if (novo.ativo && !novo.contas.length) throw new Error('Cadastre pelo menos uma conta antes de ativar a integração.');
  if (novo.conta_padrao_id && !novo.contas.some((x) => x.id === novo.conta_padrao_id)) throw new Error('A conta padrão não está na lista de contas.');
  d.config_banco = novo;
  // no Histórico, só os campos que mudaram, um por linha (o banco não se desfaz pelo Histórico: SEM_DESFAZER)
  const mudou = Object.fromEntries(['ativo', 'conta_padrao_id', 'modo_conta_boleto'].filter((k) => antes[k] !== novo[k]).map((k) => [k, { de: antes[k] ?? null, para: novo[k] ?? null }]));
  if (Object.keys(mudou).length) registrar(d, usuario, 'Alteração', 'banco', null, 'Configuração do banco (C6) alterada', mudou);
  return novo;
}

/** Inclui ou altera uma conta bancária da integração (``id`` = o mesmo da ponte, ex.: "ank"). */
export function salvarContaBanco(d, dados, usuario) {
  const cfg = configBanco(d);
  const id = limparId(dados.id);
  if (!id) throw new Error('Informe o identificador da conta na ponte (só letras e números, ex.: ank).');
  if (contasSoArquivo(d).some((x) => x.id === id)) throw new C.ErroUsuario(`O código "${id}" já é de uma conta de outro banco (extrato por arquivo). Use outro código.`);
  const emitenteId = dados.emitente_id ? Number(dados.emitente_id) : null;
  if (!emitenteId || !buscar(d, 'emitentes', emitenteId)) throw new Error('Escolha a empresa dona da conta.');
  const outra = cfg.contas.find((x) => x.id !== id && x.emitente_id === emitenteId);
  if (outra) throw new Error(`A empresa já está ligada à conta "${outra.id}".`);
  const antes = cfg.contas.find((x) => x.id === id) || null;
  // campo que não veio no formulário fica como estava (na tela vêm todos)
  const ou = (k, conv) => (dados[k] === undefined && antes ? antes[k] : conv(dados[k]));
  const ambiente = ou('ambiente', (v) => (v === 'producao' ? 'producao' : 'sandbox'));
  const tipo = 'EVP';
  const diasBaixa = dados.dias_baixa === '' || dados.dias_baixa === null || dados.dias_baixa === undefined ? (antes ? antes.dias_baixa : CONTA_BANCO_PADRAO.dias_baixa) : Number(dados.dias_baixa);
  if (!Number.isInteger(diasBaixa) || diasBaixa < 1) throw new C.ErroUsuario('Prazo depois do vencimento: informe quantos dias (pelo menos 1) o inquilino ainda pode pagar o boleto depois do vencimento; passado esse prazo, o banco encerra o boleto.');
  const carteira = ou('carteira', (v) => String(v || '').replace(/\D/g, ''));
  const marcado = (v) => v === true || v === '1' || v === 'on';
  const diasAntes = dados.desconto_dias_antes === undefined || dados.desconto_dias_antes === '' ? (antes ? antes.desconto_dias_antes : 0) : Number(dados.desconto_dias_antes);
  if (!Number.isInteger(diasAntes) || diasAntes < 0) throw new Error('Desconto até X dias antes do vencimento: informe um número inteiro (0 = até o dia do vencimento).');
  const diasNeg = dados.negativacao_dias === undefined || dados.negativacao_dias === '' ? (antes ? antes.negativacao.dias_atraso : CONTA_BANCO_PADRAO.negativacao.dias_atraso) : Number(dados.negativacao_dias);
  if (!Number.isInteger(diasNeg) || diasNeg < 1) throw new Error('Negativação: informe os dias de atraso (inteiro, pelo menos 1).');
  const tipoDesconto = Object.values(M.TIPOS_ENCARGO.desconto).includes(dados.tipo_desconto) ? dados.tipo_desconto : (antes ? antes.tipo_desconto : CONTA_BANCO_PADRAO.tipo_desconto);
  const notificar = {};
  for (const k of [...Object.keys(CANAIS_NOTIFICACAO), ...Object.keys(MOMENTOS_NOTIFICACAO)]) notificar[k] = dados[`notificar_${k}`] === undefined ? (antes ? !!antes.notificar[k] : CONTA_BANCO_PADRAO.notificar[k]) : marcado(dados[`notificar_${k}`]);
  // "Conferi o desconto no boleto de teste": vale só para o tipo marcado (trocar o tipo pede conferir de novo)
  const conferidoAntes = antes && antes.desconto_conferido && antes.desconto_conferido.tipo === tipoDesconto ? antes.desconto_conferido : null;
  const descontoConferido = dados.desconto_conferido_campo === undefined ? conferidoAntes
    : marcado(dados.desconto_conferido) ? (conferidoAntes || { tipo: tipoDesconto, em: C.hojeIso(), por: usuario || '' }) : null;
  const conta = { ...CONTA_BANCO_PADRAO, ...(antes || {}), id, apelido: ou('apelido', (v) => String(v || '').trim()) || id.toUpperCase(), emitente_id: emitenteId, ambiente, carteira,
    chave_pix: ou('chave_pix', (v) => String(v || '').trim()), tipo_chave_pix: tipo, dias_baixa: diasBaixa, instrucoes: ou('instrucoes', (v) => String(v || '').trim()),
    tipo_desconto: tipoDesconto, desconto_dias_antes: diasAntes, desconto_conferido: descontoConferido, notificar,
    negativacao: { ativa: dados.negativacao_ativa === undefined ? (antes ? !!antes.negativacao.ativa : false) : marcado(dados.negativacao_ativa), dias_atraso: diasNeg } };
  cfg.contas = antes ? cfg.contas.map((x) => (x.id === id ? conta : x)) : [...cfg.contas, conta];
  // a primeira conta vira a padrão (a escolha muda em Sistema → Banco → Emissão de boletos)
  if (!cfg.conta_padrao_id) cfg.conta_padrao_id = id;
  d.config_banco = cfg;
  registrar(d, usuario, antes ? 'Alteração' : 'Inclusão', 'banco', null, `Conta bancária "${conta.apelido}" (${id}) ${antes ? 'alterada' : 'incluída'} na integração C6`, { conta: { de: antes, para: conta } });
  return conta;
}

export function excluirContaBanco(d, contaId, usuario) {
  const cfg = configBanco(d);
  const conta = cfg.contas.find((x) => x.id === contaId);
  if (!conta) throw new Error('Conta não encontrada.');
  if (d.cobrancas.some((cb) => cb.banco && cb.banco.conta_id === contaId && cb.banco.situacao === 'emitido')) throw new Error('Há boletos emitidos nesta conta ainda em aberto no banco. Cancele-os ou aguarde o pagamento antes de tirar a conta.');
  cfg.contas = cfg.contas.filter((x) => x.id !== contaId);
  if (cfg.conta_padrao_id === contaId) cfg.conta_padrao_id = cfg.contas.length ? cfg.contas[0].id : '';
  if (!cfg.contas.length) cfg.ativo = false;
  d.config_banco = cfg;
  registrar(d, usuario, 'Exclusão', 'banco', null, `Conta bancária "${conta.apelido}" (${contaId}) tirada da integração C6`, { conta: { de: conta, para: null } });
}

/**
 * Conta padrão dos boletos (DECISOES.md 2026-11-05: por orientação do contador os boletos saem pela ANK e a JCK recebe o repasse
 * depois): a escolhida em Sistema → Banco (``conta_padrao_id``); sem escolha, a primeira. As outras contas ficam para extrato, comprovantes e pagamentos.
 */
export function contaEmissora(d) {
  const cfg = configBanco(d);
  return cfg.contas.find((x) => x.id === cfg.conta_padrao_id) || cfg.contas[0] || null;
}

/** Contas das empresas que participam do imóvel do boleto (ex.: ANK 50% / JCK 50% → as duas). */
export function contasDoImovel(d, cb) {
  const c = buscar(d, 'contratos', cb.contrato_id);
  const emitentes = new Set(c && c.imovel_id ? participacoesDo(d, c.imovel_id).map((p) => p.emitente_id) : []);
  return configBanco(d).contas.filter((x) => emitentes.has(x.emitente_id));
}

/**
 * Conta que emite este boleto sem perguntar: no modo 'padrao', a padrão; no modo 'escolher', null = a tela pergunta SEMPRE
 * (mesmo com uma só empresa no imóvel), pré-marcando ``contaPreMarcada``. Pedido do dono: escolher boleto a boleto é escolher mesmo.
 */
export function contaSugerida(d, cb) {
  if (configBanco(d).modo_conta_boleto !== 'escolher') return contaEmissora(d);
  return null;
}

/** Conta a vir marcada na pergunta: a da empresa do imóvel (se uma só), senão a padrão. */
export const contaPreMarcada = (d, cb) => (contasDoImovel(d, cb).length === 1 ? contasDoImovel(d, cb)[0] : contaEmissora(d));

/** Referência externa de 26 caracteres (A-Z e 0-9) exigida pelo C6: "B" + nº do boleto com 8 dígitos + instante em base 36. Nova a cada emissão. */
export function referenciaExterna(cb, agora = Date.now()) {
  const base = `B${String(cb.id).padStart(8, '0')}${agora.toString(36).toUpperCase()}`;
  return base.replace(/[^A-Z0-9]/g, '').padEnd(26, '0').slice(0, 26);
}

/** Uma emissão pedida há menos que isto, ainda sem resposta, bloqueia outra (outra aba ou outra pessoa emitindo o mesmo boleto). */
export const EMISSAO_EM_ANDAMENTO_MS = 3 * 60000;

/**
 * Antes de chamar a ponte: grava no boleto a emissão pendente (``emissao_pendente``: referência, conta, quando e quem), dentro de
 * ``alterar`` (uma gravação por vez: duas abas ou duas pessoas não emitem o mesmo boleto). Tentativa nova de uma emissão sem resposta
 * usa a MESMA referência e vai com ``repetir`` (a ponte confere no banco antes, e o banco nunca cria um 2º boleto).
 * Devolve { referencia, repetir }. Já emitido ou emissão em andamento há menos de 3 minutos: ErroUsuario.
 */
export function iniciarEmissaoBancaria(d, cbId, conta, usuario, agora = Date.now()) {
  const cb = buscar(d, 'cobrancas', cbId);
  if (!cb) throw new Error('Boleto não encontrado.');
  if (emitidoNoBanco(cb)) throw new C.ErroUsuario('Este boleto já foi emitido no banco (talvez em outra tela ou por outra pessoa). Atualize a página.');
  const p = cb.emissao_pendente;
  if (p && !p.incerto && agora - Date.parse(p.desde) < EMISSAO_EM_ANDAMENTO_MS) {
    throw new C.ErroUsuario(`Este boleto está sendo emitido agora${p.por ? ` por ${p.por}` : ''} (desde ${new Date(p.desde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}). Espere um minuto e atualize a página.`);
  }
  // a referência só é reaproveitada na mesma conta (outra conta = outra cobrança no banco)
  const mesma = p && p.referencia && p.conta_id === conta.id;
  const referencia = mesma ? p.referencia : referenciaExterna(cb, agora);
  atualizar(d, 'cobrancas', cb.id, { emissao_pendente: { referencia, conta_id: conta.id, desde: new Date(agora).toISOString(), por: usuario || '', incerto: false } }, usuario,
    mesma ? 'Emissão no C6 pedida de novo (mesma referência: o banco não cria outro boleto)' : 'Emissão no C6 pedida');
  return { referencia, repetir: !!mesma };
}

/** A emissão não chegou a ir ao banco (conferência do sistema): tira a emissão pendente. */
export function desistirDaEmissao(d, cbId, usuario) {
  const cb = buscar(d, 'cobrancas', cbId);
  if (cb && cb.emissao_pendente) atualizar(d, 'cobrancas', cb.id, { emissao_pendente: null }, usuario, 'Emissão no C6 não enviada');
}

/** Pega o que dá do endereço em uma linha do inquilino ("Rua X, 12, Bairro, Cidade/UF, CEP 80000-000"). */
export function partesDoEndereco(linha) {
  const t = String(linha || '').trim();
  if (!t) return null;
  const cep = (/(\d{5})-?(\d{3})/.exec(t) || [])[0] || '';
  const cidadeUf = /([^,]+)\/([A-Z]{2})\b/.exec(t);
  const partes = t.replace(/,?\s*CEP\s*[\d-]+/i, '').replace(cidadeUf ? cidadeUf[0] : '', '').split(',').map((x) => x.trim()).filter(Boolean);
  // a última parte é o bairro, a menos que seja só o número da casa ("Rua X, 10")
  const temBairro = partes.length > 1 && !/^\d/.test(partes[partes.length - 1]);
  return { address: (temBairro ? partes.slice(0, -1) : partes).join(', '), neighborhood: temBairro ? partes[partes.length - 1] : '',
    city: cidadeUf ? cidadeUf[1].trim() : '', state: cidadeUf ? cidadeUf[2] : '', zip_code: cep.replace(/\D/g, '') };
}

/**
 * Endereço do pagador para a API, inteiro de UMA fonte (antes misturava a rua do inquilino com a cidade e o CEP do imóvel): o do
 * cadastro do inquilino quando tem rua, cidade/UF e CEP; senão, o do imóvel. ``fonte``: 'inquilino' ou 'imovel'. Bairro que falta
 * não é inventado (o pedido avisa).
 */
export function enderecoDoPagador(c, imovel) {
  const doImovel = imovel ? { address: enderecoCompleto(imovel), neighborhood: imovel.bairro || '', city: imovel.cidade || '', state: imovel.uf || '', zip_code: String(imovel.cep || '').replace(/\D/g, '') } : {};
  const doInquilino = partesDoEndereco(c.inquilino_endereco) || {};
  const completo = ['address', 'city', 'state', 'zip_code'].every((k) => doInquilino[k]);
  const origem = completo ? doInquilino : doImovel;
  const r = { fonte: completo ? 'inquilino' : 'imovel' };
  for (const k of ['address', 'neighborhood', 'city', 'state', 'zip_code']) r[k] = origem[k] || '';
  return r;
}

const corta = (x, n) => String(x || '').trim().slice(0, n);

/** Canais e momentos que valem para um contrato: o padrão da conta, nenhum, ou o escolhido no contrato (campos notif_*). */
export function notificacaoDoContrato(conta, c) {
  const escolha = c.notificacao_banco || NOTIFICACAO_CONTRATO[0];
  if (escolha === NOTIFICACAO_CONTRATO[1]) return null;
  if (escolha === NOTIFICACAO_CONTRATO[2]) {
    const r = {};
    for (const k of [...Object.keys(CANAIS_NOTIFICACAO), ...Object.keys(MOMENTOS_NOTIFICACAO)]) r[k] = !!c[`notif_${k}`];
    return r;
  }
  return conta.notificar || CONTA_BANCO_PADRAO.notificar;
}

/**
 * Notificações ao pagador pedidas na emissão (``payer_notification[]``: canal, destino e momento), montadas sozinhas a partir da
 * configuração da conta e da exceção do contrato. E-mail usa o e-mail do inquilino; SMS, o telefone (só dígitos). Sem o contato, pula o canal.
 * Ex.: conta com e-mail + SMS na emissão e no vencimento, inquilino com os dois contatos → 4 notificações.
 */
export function notificacoesDoPagador(conta, c) {
  const cfg = notificacaoDoContrato(conta, c);
  if (!cfg) return [];
  const destinos = { email: cfg.email ? String(c.inquilino_email || '').trim() : '', sms: cfg.sms ? String(c.inquilino_telefone || '').replace(/\D/g, '') : '' };
  const r = [];
  for (const [canal, destino] of Object.entries(destinos)) {
    if (!destino) continue;
    for (const [k, [momento]] of Object.entries(MOMENTOS_NOTIFICACAO)) if (cfg[k]) r.push({ [M.NOTIFICACAO.canal]: M.NOTIFICACAO.canais[canal], [M.NOTIFICACAO.destino]: destino, [M.NOTIFICACAO.momento]: M.NOTIFICACAO.momentos[momento] });
  }
  return r;
}

/**
 * Pedido de emissão no formato da API do C6 (função pura, sem gravar). Usa ``dadosBoleto`` (valor sem desconto, desconto até o
 * vencimento, multa e juros ao dia) e o contrato/imóvel. Ex.: aluguel R$ 3.644,45, desconto R$ 364,45, multa 10%, juros 1% a.m. →
 * amount "3644.45", first_discount_value "364.45", fine_value "364.45" (FIXED_VALUE), interest_value "1.21" (VALUE_PER_DAY).
 * Os nomes dos campos vêm de ``mapa-c6.js`` (``M.CAMPOS``): é lá que se ajusta quando o YAML oficial for lido.
 */
export function pedidoBoletoC6(d, cb, conta, referencia = referenciaExterna(cb)) {
  if (!conta) throw new Error('Escolha a conta bancária que emite o boleto.');
  const K = M.CAMPOS;
  const L = M.LIMITES;
  const c = buscar(d, 'contratos', cb.contrato_id);
  const imovel = c.imovel_id ? buscar(d, 'imoveis', c.imovel_id) : null;
  const b = dadosBoleto(d, cb);
  const t = totais(cb);
  if (b.valor <= 0) throw new Error('Este boleto não tem valor a cobrar.');
  // em dia não há nada a pagar (ex.: a reserva cobre o aluguel bonificado): um boleto de R$ 200,00 com desconto de R$ 200,00
  // confundiria o inquilino. Quitado pela reserva (ou ressarcimento): não vai ao banco
  if (b.valor_com_desconto <= 0) throw new C.ErroUsuario(`O boleto de ${C.compBr(cb.competencia)} está quitado em dia (pela reserva ou pelo ressarcimento): não precisa ir ao banco. Só se o inquilino atrasar haveria diferença a cobrar.`);
  const taxId = String(c.inquilino_cpf || '').replace(/\D/g, '');
  if (!taxId) throw new Error(`Informe o CPF/CNPJ de ${c.inquilino_nome} no cadastro do inquilino: o banco exige o documento do pagador.`);
  const endereco = enderecoDoPagador(c, imovel);
  if (!endereco.zip_code || !endereco.city) throw new Error(`Complete o endereço de ${c.inquilino_nome} (cidade/UF e CEP) no cadastro do inquilino ou do imóvel: o banco exige o endereço do pagador.`);
  // Decisão do dono: o boleto sai pelo VALOR CHEIO (aluguel cheio + IPTU + seguro + tarifa…), com o desconto da bonificação em valor
  // fixo até o vencimento (ou até X dias antes, conforme a conta); multa em % e juros em % ao mês sobre o valor cheio, como o sistema
  // calcula. Quem paga atrasado perde o desconto (não é multa). Com FCI, multa e juros não incidem sobre o FCI: vão em valor (R$) e por dia.
  if (centavosParaReais(b.valor) > L.valor_maximo_reais) throw new Error(`O banco não emite boleto acima de R$ ${L.valor_maximo_reais.toLocaleString('pt-BR')}.`);
  const fees = encargosDoBoletoC6(d, cb, conta, b);
  void t;
  // instruções: as fixas da conta e depois a descrição do boleto, até 4 linhas de 80
  // dados do pagador nos limites da API (decisão de 2026-10-16): nome, rua e número, bairro e cidade até 40, e-mail até 70, sem "/"
  // no endereço. Nada é cortado: o campo que passa barra a emissão com o nome do campo e quantas letras tem, para abreviar no cadastro.
  const ondeEndereco = () => (endereco.fonte === 'inquilino' ? 'no endereço do cadastro do inquilino' : `no cadastro do imóvel${imovel ? ` ${imovel.nome}` : ''}`);
  const pagador = { nome: String(c.inquilino_nome || '').trim(), rua: String(endereco.address || '').trim(), cidade: String(endereco.city || '').trim(), email: String(c.inquilino_email || '').trim(),
    bairro: String(endereco.neighborhood || '').trim() };
  const problemas = [];
  if (!pagador.bairro) problemas.push(`falta o bairro do pagador: complete ${ondeEndereco()}${endereco.fonte === 'inquilino' ? ' (ex.: "Rua das Flores, 45, Centro, Curitiba/PR, CEP 80010-000")' : ''}`);
  for (const [k, rotulo, verbo, max, onde, semBarra] of [['nome', 'O nome do pagador', 'tem', L.nome, 'no cadastro do inquilino', false], ['rua', 'A rua e o número', 'têm', L.endereco, ondeEndereco('address'), true],
    ['bairro', 'O bairro', 'tem', L.bairro, ondeEndereco('neighborhood'), true], ['cidade', 'A cidade', 'tem', L.cidade, ondeEndereco('city'), true], ['email', 'O e-mail', 'tem', L.email, 'no cadastro do inquilino', false]]) {
    const v = pagador[k];
    if (v.length > max) problemas.push(`${rotulo} ${verbo} ${v.length} letras e o banco aceita até ${max} ("${v}"): abrevie ${onde}`);
    if (semBarra && v.includes('/')) problemas.push(`${rotulo} ${verbo} uma barra "/", que o banco não aceita ("${v}"): troque por espaço ou "-" ${onde}`);
  }
  if (endereco.zip_code.length !== 8) problemas.push(`O CEP tem ${endereco.zip_code.length} números e precisa ter 8 ("${endereco.zip_code}"): corrija ${ondeEndereco('zip_code')}`);
  if (problemas.length) throw new C.ErroUsuario(`O boleto de ${c.inquilino_nome} (${C.compBr(cb.competencia)}) não foi ao banco: ${problemas.join('; ')}. Ex.: "Avenida" → "Av.", "Professor" → "Prof.".`);
  // cada linha da instrução com até 80 letras, quebrada entre palavras (nunca no meio de um valor); até 4 linhas
  const instrucoes = quebrarLinhas([...String(conta.instrucoes || '').split('\n'), ...b.descricao.split('\n')], L.instrucao).slice(0, L.instrucoes);
  const boleto = { [K.carteira]: carteiraDaConta(conta), [K.seu_numero]: String(cb.id).slice(-L.seu_numero) };
  if (instrucoes.length) boleto[K.instrucoes] = instrucoes;
  const pedido = {
    [K.referencia]: referencia,
    [K.valor]: centavosParaReais(b.valor),
    [K.vencimento]: b.vencimento,
    // acima de 100 letras (a tela avisa), corta entre palavras, nunca no meio de um valor
    [K.descricao]: quebrarLinhas([b.descricao.replace(/\n/g, ' ')], L.descricao)[0] || '',
    // limites da API (nome, endereço, bairro e cidade 40, e-mail 70) conferidos acima, sem cortar; CEP com 8 dígitos, UF com 2 letras
    [K.pagador]: { [K.pagador_nome]: pagador.nome, [K.pagador_documento]: taxId,
      [K.pagador_endereco]: { [K.endereco_rua]: pagador.rua, [K.endereco_bairro]: pagador.bairro,
        [K.endereco_cidade]: pagador.cidade, [K.endereco_uf]: corta(endereco.state, 2).toUpperCase(), [K.endereco_cep]: endereco.zip_code },
      ...(pagador.email ? { [K.pagador_email]: pagador.email } : {}),
      // "phone" não é campo da API: a ponte usa só para conferir o destino dos SMS e o descarta antes de mandar ao banco
      ...(String(c.inquilino_telefone || '').replace(/\D/g, '') ? { phone: String(c.inquilino_telefone || '').replace(/\D/g, '') } : {}) },
    [K.forma]: { [K.boleto]: boleto },
    [K.dias_baixa]: diasBaixaDaConta(conta),
    [K.origem]: 'ADM-IMOVEIS',
  };
  if (Object.keys(fees).length) pedido[K.encargos] = fees;
  if (conta.chave_pix) pedido[K.forma][K.pix] = { [K.pix_chave]: conta.chave_pix, [K.pix_tipo]: 'EVP' };
  const notif = notificacoesDoPagador(conta, c);
  if (notif.length) pedido[M.NOTIFICACAO.campo] = notif;
  return pedido;
}

/**
 * Multa, juros e desconto (``fees``) do boleto no formato do C6, os mesmos na emissão e na alteração. Com FCI (ou base da multa
 * diferente do valor do boleto) multa e juros vão em reais; senão em %. Desconto da bonificação em reais até o vencimento.
 */
export function encargosDoBoletoC6(d, cb, conta, b = dadosBoleto(d, cb)) {
  const K = M.CAMPOS;
  const fees = {};
  // base da multa diferente do valor do boleto (FCI, ou regra `base_multa` = só o aluguel): multa e juros em reais
  if (cb.fci || b.multa_valor !== null) {
    if (b.multa_valor > 0) Object.assign(fees, { [K.multa_tipo]: M.TIPOS_ENCARGO.multa.valor, [K.multa_valor]: centavosParaReais(b.multa_valor), [K.multa_prazo]: 0 });
    if (b.juros_ao_dia > 0) Object.assign(fees, { [K.juros_tipo]: M.TIPOS_ENCARGO.juros.valor_dia, [K.juros_valor]: centavosParaReais(b.juros_ao_dia), [K.juros_prazo]: 0 });
  } else {
    if (b.multa_percentual > 0) Object.assign(fees, { [K.multa_tipo]: M.TIPOS_ENCARGO.multa.percentual, [K.multa_valor]: Number(b.multa_percentual), [K.multa_prazo]: 0 });
    if (cb.juros_mensal_percentual > 0) Object.assign(fees, { [K.juros_tipo]: M.TIPOS_ENCARGO.juros.percentual_mes, [K.juros_valor]: Number(cb.juros_mensal_percentual), [K.juros_prazo]: 0 });
  }
  // desconto em reais até o vencimento (first_discount_deadline = dias antes; 0 = até o dia do vencimento, como na v1 "dead_line").
  // discount_type é parametrizável por conta (padrão: primeiro valor do enum da API; confirmar no sandbox no 1º boleto de teste)
  if (b.desconto > 0) {
    const c = buscar(d, 'contratos', cb.contrato_id);
    if (b.desconto >= b.valor) throw new C.ErroUsuario(`O desconto do boleto de ${c.inquilino_nome} (${C.reais(b.desconto)}) não pode ser igual ou maior que o valor do boleto (${C.reais(b.valor)}).`);
    // trava combinada com o dono (16/11/2026): o tipo do desconto (VALUE_PER_DAY = "valor por dia de antecipação" na documentação)
    // pode virar um desconto de R$ 135 POR DIA; em produção só depois de um boleto de teste no sandbox mostrar o desconto certo
    if (!descontoLiberado(conta)) throw new C.ErroUsuario(`O boleto de ${c.inquilino_nome} (${C.compBr(cb.competencia)}) não foi ao banco: a conta ${conta.apelido || conta.id} está em produção e o tipo do desconto de pontualidade ainda não foi conferido num boleto de teste. Emita um boleto no sandbox, confira no PDF que o desconto sai de ${C.reais(b.desconto)} no total (e não por dia) e marque "Conferi o desconto no boleto de teste" na conta (Sistema → Banco → Banco (C6)).`);
    Object.assign(fees, { [K.desconto_tipo]: conta.tipo_desconto || CONTA_BANCO_PADRAO.tipo_desconto, [K.desconto_valor]: centavosParaReais(b.desconto), [K.desconto_prazo]: Number(conta.desconto_dias_antes) || 0 });
  }
  return fees;
}

/** O que o banco cobra além do valor (guardado na emissão e na alteração, para avisar quando o sistema mudar): desconto, multa e juros. */
const encargosParaComparar = (cb) => ({ desconto: totais(cb).a_pagar_sem_desconto - totais(cb).a_pagar_pontual, multa_percentual: Number(cb.multa_percentual) || 0, juros_mensal_percentual: Number(cb.juros_mensal_percentual) || 0 });

/**
 * O desconto de pontualidade pode ir ao banco por esta conta: no sandbox sempre (é o teste); em produção só depois de o
 * administrador conferir, num boleto de teste, que o desconto do tipo escolhido sai certo (``desconto_conferido.tipo``).
 */
export const descontoLiberado = (conta) => !conta || conta.ambiente !== 'producao'
  || !!(conta.desconto_conferido && conta.desconto_conferido.tipo === (conta.tipo_desconto || CONTA_BANCO_PADRAO.tipo_desconto));

/** Prazo do boleto depois do vencimento (``days_after_due_date``: o banco encerra a cobrança N dias depois): pelo menos 1. */
export const diasBaixaDaConta = (conta) => { const n = Number(conta && conta.dias_baixa); return Number.isInteger(n) && n >= 1 ? n : CONTA_BANCO_PADRAO.dias_baixa; };

/** Valor que o boleto leva ao banco: o total sem desconto (o desconto vai à parte, em ``fees``). */
export const valorNoBanco = (d, cb) => totais(cb).a_pagar_sem_desconto;

/**
 * Alteração a mandar ao banco (PATCH parcial) para o boleto no C6 ficar igual ao do sistema: valor, vencimento, descrição e os
 * encargos recalculados (desconto, multa e juros: antes iam os antigos).
 */
export function alteracaoBoletoC6(d, cb) {
  const b = dadosBoleto(d, cb);
  const conta = cb.banco && cb.banco.conta_id ? contaBanco(d, cb.banco.conta_id) : null;
  const fees = conta ? encargosDoBoletoC6(d, cb, conta, b) : {};
  return { [M.CAMPOS.valor]: centavosParaReais(valorNoBanco(d, cb)), [M.CAMPOS.vencimento]: b.vencimento, [M.CAMPOS.descricao]: b.descricao.replace(/\n/g, ' ').slice(0, M.LIMITES.descricao),
    ...(Object.keys(fees).length ? { [M.CAMPOS.encargos]: fees } : {}) };
}

/** Corpo do pedido de negativação do pagador (POST …/denial): ``{ deadline }`` = dias de atraso a partir dos quais negativar. */
export const pedidoNegativacaoC6 = (dias) => ({ [M.CAMPOS.negativacao_prazo]: Number(dias) });

/**
 * Situação da API → situação do sistema. CREATED = em aberto; WAITING_CONFIRMATION = o inquilino pagou mas o dinheiro ainda não
 * entrou (continua "emitido", a tela avisa); PAID = pago; CANCELED = cancelado. Outros textos caem no parecido.
 */
export function situacaoBancaria(status) {
  const s = String(status || '').toUpperCase();
  if (!s) return 'emitido';
  if (s === M.STATUS.aguardando_credito || /WAIT|PEND/.test(s)) return 'emitido';
  if (s === M.STATUS.pago || /PAID|LIQUID|SETTLED|RECEIV|BAIXA_?EFETIV/.test(s)) return 'pago';
  if (M.STATUS.cancelado.includes(s) || /CANCEL|REMOV|EXPIR|BAIXA/.test(s)) return 'cancelado';
  return 'emitido';
}

/** Pagou, mas o banco ainda não creditou (WAITING_CONFIRMATION). */
export const aguardandoCredito = (cb) => !!(cb.banco && /WAIT|PEND/.test(String(cb.banco.situacao_banco || '').toUpperCase()));

/** Lê a resposta da API (emissão, consulta ou item da listagem) e devolve só os campos que o sistema guarda. Aceita também a já normalizada. */
export function normalizarRespostaC6(resposta) {
  const Q = M.RESPOSTA;
  const r = resposta || {};
  const pm = r[Q.forma] || {};
  const bs = pm[Q.boleto] || {};
  const pix = pm[Q.pix] || {};
  // pagamentos vêm na listagem (payments[] { amount, payment_date, credit_date }); a ponte junta na consulta. O último é o que vale.
  const pgs = r[Q.pagamentos];
  const pg = Array.isArray(pgs) && pgs.length ? pgs[pgs.length - 1] : (r.payment || null);
  const pagoEm = r.payment_date || r.paid_at || (pg && pg[Q.pagamento_data]) || null;
  const creditoEm = r.credit_date || (pg && pg[Q.pagamento_credito]) || null;
  const N = M.NOTIFICACAO;
  // na consulta, notification_date vem como a DATA calculada do aviso (ex.: 2026-08-01); no pedido, é o momento (ISSUE_DATE…)
  const ehData = (x) => /^\d{4}-\d{2}-\d{2}/.test(String(x || ''));
  const notificacoes = Array.isArray(r[Q.notificacoes]) ? r[Q.notificacoes].map((n) => { const m = n[N.momento] || n.momento || ''; return { canal: n[N.canal] || n.canal || '', destino: n[N.destino] || n.destino || '', momento: ehData(m) ? '' : m, ...(ehData(m) ? { data: String(m).slice(0, 10) } : n.data ? { data: n.data } : {}), situacao: n[N.situacao] || n.situacao || '', enviada_em: n[N.enviada_em] || n.enviada_em || null }; })
    : (Array.isArray(r.notificacoes) ? r.notificacoes : null);
  const neg = r[Q.negativacao] || r.negativacao || null;
  return {
    id_externo: r[Q.referencia] || r.id_externo || null,
    id_banco: r[Q.id] || r.id_banco || null,
    nosso_numero: bs[Q.nosso_numero] || r.nosso_numero || null,
    linha_digitavel: bs[Q.linha_digitavel] || r.linha_digitavel || null,
    codigo_barras: bs[Q.codigo_barras] || r.codigo_barras || null,
    pix_copia_cola: pix[Q.pix_copia_cola] || r.pix_copia_cola || null,
    pix_qr_base64: pix[Q.pix_imagem] || r.pix_qr_base64 || null,
    pix_qr_mime: pix[Q.pix_imagem_tipo] || r.pix_qr_mime || (pix[Q.pix_imagem] ? 'image/png' : null),
    // identificadores para casar o extrato sem depender de valor e data: a referência do Pix (vem na emissão) e os ids dos pagamentos
    pix_referencia: pix[Q.pix_referencia] || r.pix_referencia || null,
    ids_pagamento: Array.isArray(pgs) ? [...new Set(pgs.flatMap((x) => [x && x[Q.pagamento_id], x && x[Q.pagamento_e2e]]).filter(Boolean).map(String))] : (Array.isArray(r.ids_pagamento) ? r.ids_pagamento : null),
    situacao: r.situacao && SITUACOES_BANCO.includes(r.situacao) ? r.situacao : situacaoBancaria(r[Q.situacao]),
    situacao_banco: r[Q.situacao] || r.situacao_banco || null,
    valor: r[Q.valor] !== undefined && r[Q.valor] !== null ? reaisParaCentavos(r[Q.valor]) : (r.valor ?? null),
    vencimento: r[Q.vencimento] || r.vencimento || null,
    pago_em: pagoEm ? String(pagoEm).slice(0, 10) : null,
    credito_em: creditoEm ? String(creditoEm).slice(0, 10) : null,
    valor_pago: r.paid_amount !== undefined ? reaisParaCentavos(r.paid_amount) : (pg && pg[Q.pagamento_valor] !== undefined ? reaisParaCentavos(pg[Q.pagamento_valor]) : (r.valor_pago ?? null)),
    notificacoes,
    // consulta: denial_info { status, date, errors[] }; agendamento: { status, denial_date }
    negativacao: neg && typeof neg === 'object' ? { situacao: neg[Q.negativacao_situacao] || neg.situacao || null, data: neg[Q.negativacao_data_consulta] || neg[Q.negativacao_data] || neg.data || null, pode_cancelar: neg[Q.negativacao_pode_cancelar] ?? neg.pode_cancelar ?? null,
      erro: Array.isArray(neg[Q.negativacao_erros]) && neg[Q.negativacao_erros].length ? neg[Q.negativacao_erros].map((x) => x && (x.message || x.details || x.type)).filter(Boolean).join('; ').slice(0, 300) : (neg.erro || null) } : null,
    // pago mais de uma vez (Pix e código de barras do mesmo boleto): soma e quantos pagamentos
    pagamentos: Array.isArray(pgs) ? pgs.length : null,
    valor_pago_total: Array.isArray(pgs) && pgs.length > 1 ? pgs.reduce((s, x) => s + (x[Q.pagamento_valor] !== undefined ? reaisParaCentavos(x[Q.pagamento_valor]) : 0), 0) : null,
  };
}

/**
 * Grava no boleto a resposta do banco (emissão ou consulta). ``extra``: conta_id, ambiente, pedido (o que foi enviado).
 * Fica no histórico; o pagamento no sistema NÃO é registrado aqui (quem confirma é o usuário, em ``registrarPagamento``).
 */
export function registrarBoletoBancario(d, cbId, resposta, usuario, extra = {}) {
  const cb = buscar(d, 'cobrancas', cbId);
  if (!cb) throw new Error('Boleto não encontrado.');
  const n = normalizarRespostaC6(resposta);
  const antes = cb.banco || {};
  // emissão nova depois de um cancelamento (ou referência externa diferente): a data de emissão é a de agora e a anterior fica guardada
  // só é emissão nova com outra referência: consultar logo depois de cancelar, com o banco ainda dizendo CREATED, continua "cancelado"
  const reemissao = !!antes.emitido_em && !!n.id_externo && !!antes.id_externo && n.id_externo !== antes.id_externo;
  if (antes.situacao === 'cancelado' && !reemissao && n.situacao === 'emitido') n.situacao = 'cancelado';
  const emissoesAnteriores = reemissao ? [...(antes.emissoes_anteriores || []), { emitido_em: antes.emitido_em, cancelado_em: antes.cancelado_em || null, id_externo: antes.id_externo || null, nosso_numero: antes.nosso_numero || null, linha_digitavel: antes.linha_digitavel || null }] : (antes.emissoes_anteriores || null);
  const banco = {
    provedor: 'c6', conta_id: extra.conta_id || antes.conta_id || null, ambiente: extra.ambiente || antes.ambiente || null,
    id_externo: n.id_externo || antes.id_externo || null, id_banco: n.id_banco || antes.id_banco || null, nosso_numero: n.nosso_numero || antes.nosso_numero || null,
    linha_digitavel: n.linha_digitavel || antes.linha_digitavel || null, codigo_barras: n.codigo_barras || antes.codigo_barras || null,
    pix_copia_cola: n.pix_copia_cola || antes.pix_copia_cola || null, pix_qr_base64: n.pix_qr_base64 || antes.pix_qr_base64 || null, pix_qr_mime: n.pix_qr_mime || antes.pix_qr_mime || null,
    pix_referencia: n.pix_referencia || (reemissao ? null : antes.pix_referencia) || null,
    ids_pagamento: [...new Set([...(reemissao ? [] : antes.ids_pagamento || []), ...(n.ids_pagamento || [])])],
    situacao: n.situacao, situacao_banco: n.situacao_banco, valor: n.valor ?? antes.valor ?? valorNoBanco(d, cb), vencimento: n.vencimento || antes.vencimento || cb.vencimento,
    emitido_em: antes.emitido_em && !reemissao ? antes.emitido_em : new Date().toISOString(), consultado_em: antes.emitido_em && !reemissao ? new Date().toISOString() : null,
    ...(emissoesAnteriores ? { emissoes_anteriores: emissoesAnteriores } : {}),
    pago_em: n.pago_em || antes.pago_em || null, credito_em: n.credito_em || antes.credito_em || null, valor_pago: n.valor_pago ?? antes.valor_pago ?? null, erro: null,
    // o que a consulta não traz (null) não apaga o que estava guardado (ex.: a data prevista da negativação)
    notificacoes: n.notificacoes || antes.notificacoes || null, negativacao: n.negativacao ? { ...(antes.negativacao || {}), ...Object.fromEntries(Object.entries(n.negativacao).filter(([, v]) => v !== null && v !== undefined)) } : (antes.negativacao || null),
    pagamentos_no_banco: n.pagamentos ?? antes.pagamentos_no_banco ?? null, valor_pago_total: n.valor_pago_total ?? antes.valor_pago_total ?? null,
    simulado: !!((resposta && resposta.simulado) || antes.simulado),
    // o que foi ao banco além do valor (bonificação, multa e juros): guardado na emissão e na alteração; a consulta não muda
    encargos: !antes.emitido_em || reemissao || extra.alterado ? encargosParaComparar(cb) : (antes.encargos || null),
  };
  const texto = { emitido: 'Boleto emitido no C6', pago: 'Banco informou o pagamento do boleto', cancelado: 'Boleto cancelado no C6' }[banco.situacao] || 'Situação do boleto no banco atualizada';
  // a emissão pendente acabou: o banco respondeu (a mesma referência ou a resposta de uma consulta)
  const pend = cb.emissao_pendente && (!n.id_externo || cb.emissao_pendente.referencia === n.id_externo) ? { emissao_pendente: null } : {};
  atualizar(d, 'cobrancas', cb.id, { banco, ...pend }, usuario, `${texto}${banco.linha_digitavel ? ` · linha digitável ${banco.linha_digitavel}` : ''}${banco.ambiente === 'sandbox' ? ' (sandbox: teste)' : ''}`);
  return banco;
}

/**
 * Emissão falhou: guarda o erro no boleto (o botão "Emitir" continua disponível). ``extra.incerto``: sem resposta (tempo esgotado,
 * conexão caída): o boleto PODE ter sido emitido; a emissão pendente fica, e a próxima tentativa usa a mesma referência ("Conferir no
 * banco"). Recusa clara do banco: a pendência sai. Boleto cancelado que falhou ao emitir de novo também mostra o erro.
 */
export function registrarErroBancario(d, cbId, erro, usuario, extra = {}) {
  const cb = buscar(d, 'cobrancas', cbId);
  const antes = cb.banco || {};
  const incerto = !!extra.incerto;
  const pend = cb.emissao_pendente ? { emissao_pendente: incerto ? { ...cb.emissao_pendente, incerto: true } : null } : {};
  // boleto já emitido: a falha fica só no histórico, sem apagar a linha digitável
  if (antes.situacao && antes.situacao !== 'erro' && antes.situacao !== 'cancelado') {
    if (Object.keys(pend).length) atualizar(d, 'cobrancas', cb.id, pend, usuario, 'Emissão no C6 sem resposta');
    registrar(d, usuario, 'Alteração', 'cobrancas', cb.id, `Falha ao falar com o banco: ${String(erro).slice(0, 300)}`, null, vinculos(d, 'cobrancas', cb));
    return cb.banco;
  }
  const banco = { ...antes, provedor: 'c6', conta_id: extra.conta_id || antes.conta_id || null, ambiente: extra.ambiente || antes.ambiente || null, situacao: 'erro', erro: String(erro).slice(0, 500), erro_em: new Date().toISOString(), incerto,
    ...(antes.situacao === 'cancelado' ? { cancelado_antes: true } : {}) };
  atualizar(d, 'cobrancas', cb.id, { banco, ...pend }, usuario, `${incerto ? 'Emissão no C6 sem resposta (pode ter sido emitido: confira no banco)' : 'Falha na emissão no C6'}: ${String(erro).slice(0, 300)}`);
  return banco;
}

/** Boleto cancelado no banco (pedido pelo usuário): mantém os dados para consulta, muda a situação. */
export function registrarCancelamentoBancario(d, cbId, usuario, resposta = null) {
  const cb = buscar(d, 'cobrancas', cbId);
  if (!cb.banco) throw new Error('Este boleto não foi emitido no banco.');
  const banco = { ...cb.banco, situacao: 'cancelado', situacao_banco: (resposta && resposta.status) || 'CANCELLED', cancelado_em: new Date().toISOString(), erro: null };
  atualizar(d, 'cobrancas', cb.id, { banco }, usuario, 'Boleto cancelado no C6');
  return banco;
}

/** Negativação do pagador agendada no banco (POST …/denial): guarda no boleto; só o administrador chama, com confirmação dupla. */
export function registrarNegativacao(d, cbId, resposta, usuario, dias) {
  const cb = buscar(d, 'cobrancas', cbId);
  if (!cb.banco || cb.banco.situacao !== 'emitido') throw new Error('Só um boleto emitido e em aberto no banco pode ser negativado.');
  if (aguardandoCredito(cb) || cb.data_pagamento) throw new C.ErroUsuario('Este boleto já foi pago (o banco ainda confirma o crédito, ou o pagamento já está registrado aqui): não pode ser negativado.');
  const conta = contaBanco(d, cb.banco.conta_id);
  if (!conta || !conta.negativacao.ativa) throw new Error('A negativação está desligada nesta conta (Sistema → Banco → Banco (C6)).');
  const r = resposta || {};
  const n = normalizarRespostaC6(r).negativacao || { situacao: r[M.RESPOSTA.negativacao_situacao] || null, data: r[M.RESPOSTA.negativacao_data] || null, pode_cancelar: null };
  const banco = { ...cb.banco, negativacao: { situacao: n.situacao || M.STATUS_NEGATIVACAO.agendada, data: n.data || null, dias_atraso: Number(dias) || null, pode_cancelar: n.pode_cancelar ?? true, agendada_em: new Date().toISOString(), cancelada_em: null } };
  atualizar(d, 'cobrancas', cb.id, { banco }, usuario, `Negativação do pagador agendada no C6${banco.negativacao.data ? ` para ${C.dataBr(banco.negativacao.data)}` : ''}`);
  return banco;
}

export function registrarCancelamentoNegativacao(d, cbId, usuario) {
  const cb = buscar(d, 'cobrancas', cbId);
  if (!cb.banco || !cb.banco.negativacao) throw new Error('Este boleto não tem negativação agendada.');
  const banco = { ...cb.banco, negativacao: { ...cb.banco.negativacao, situacao: M.STATUS_NEGATIVACAO.cancelamento_agendado, pode_cancelar: false, cancelada_em: new Date().toISOString() } };
  atualizar(d, 'cobrancas', cb.id, { banco }, usuario, 'Negativação do pagador cancelada no C6');
  return banco;
}

/** Boleto emitido e ainda em aberto no banco (não dá para excluir nem emitir de novo sem cancelar). */
export const emitidoNoBanco = (cb) => !!(cb.banco && ['emitido', 'pago'].includes(cb.banco.situacao));

/** Valores do boleto mudaram depois da emissão (recálculo, ajuste do mês): o banco ainda cobra o valor antigo. */
export function divergenciaBancaria(cb) {
  if (!cb.banco || cb.banco.situacao !== 'emitido' || cb.banco.valor === null || cb.banco.valor === undefined) return null;
  const atual = totais(cb).a_pagar_sem_desconto;
  // bonificação, multa ou juros mudaram depois da emissão (ex.: bonificação de 10% para 5%): o banco segue dando o desconto antigo
  const e = cb.banco.encargos;
  const agora = encargosParaComparar(cb);
  const encargosMudaram = !!e && (e.desconto !== agora.desconto || e.multa_percentual !== agora.multa_percentual || e.juros_mensal_percentual !== agora.juros_mensal_percentual);
  if (atual === cb.banco.valor && (!cb.banco.vencimento || cb.banco.vencimento === cb.vencimento) && !encargosMudaram) return null;
  return { no_banco: cb.banco.valor, no_sistema: atual, vencimento_banco: cb.banco.vencimento, vencimento_sistema: cb.vencimento, encargos_mudaram: encargosMudaram,
    desconto_banco: e ? e.desconto : null, desconto_sistema: agora.desconto };
}

/** Boletos do mês que podem ser emitidos no banco: em aberto, com valor, sem carência e ainda não emitidos (ou com erro/cancelados). */
export const boletosParaEmitir = (d, comp, hoje = C.hojeIso()) => boletosDoMesSemEmissao(d, comp).filter((cb) => cb.vencimento >= hoje);

/** Boletos do mês em aberto sem emissão que já venceram: o banco não aceita vencimento no passado (ficam de fora do "Emitir todos"). */
export const vencidosSemEmissao = (d, comp, hoje = C.hojeIso()) => boletosDoMesSemEmissao(d, comp).filter((cb) => cb.vencimento < hoje);

const boletosDoMesSemEmissao = (d, comp) => d.cobrancas.filter((cb) => cb.competencia === comp && aCobrar(cb)
  && totais(cb).a_pagar_sem_desconto > 0 && !emitidoNoBanco(cb)).sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id - b.id);

// --------------------------------------------------------------------------
// Resultados financeiros por imóvel
// --------------------------------------------------------------------------
/** Solicitações do inquilino (pequenos reparos e pedidos), das mais recentes para as mais antigas. */
export const solicitacoesDo = (d, contratoId) => d.solicitacoes.filter((x) => x.contrato_id === contratoId)
  .sort(C.maisRecentePrimeiro);

/**
 * Inquilinos para abrir uma solicitação: cada pessoa (mesmo CPF/CNPJ, ou mesmo nome sem documento) com os contratos ativos
 * dela (um por imóvel), em ordem de nome. ``incluirId``: contrato que entra mesmo inativo (solicitação antiga em edição).
 * Devolve [{ chave, nome, contratos: [{ id, imovel }] }] (imovel: nome do imóvel ou '').
 */
export function inquilinosParaSolicitacao(d, hoje, incluirId = null) {
  const porChave = new Map();
  const ativos = d.contratos.filter((c) => c.id === incluirId || (c.ativo !== false && contratoAtivo(c, hoje)));
  for (const c of ativos) {
    const doc = soDigitos(c.inquilino_cpf);
    const chave = doc ? `d${doc}` : `n${String(c.inquilino_nome || '').trim().toLocaleLowerCase('pt-BR')}`;
    const imovel = c.imovel_id ? (buscar(d, 'imoveis', c.imovel_id) || {}).nome || '' : '';
    if (!porChave.has(chave)) porChave.set(chave, { chave, nome: c.inquilino_nome, contratos: [] });
    porChave.get(chave).contratos.push({ id: c.id, imovel });
  }
  const lista = [...porChave.values()].sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  for (const p of lista) p.contratos.sort((a, b) => a.imovel.localeCompare(b.imovel, 'pt-BR'));
  return lista;
}

/** Quantas solicitações há em cada situação (sem situação conta como "Aberta"). */
export function resumoSolicitacoes(d) {
  const r = { Aberta: 0, 'Em andamento': 0, Concluída: 0, 'Não atendida': 0 };
  for (const x of d.solicitacoes) { const s = x.situacao || 'Aberta'; r[s] = (r[s] || 0) + 1; }
  return r;
}

// --------------------------------------------------------------------------
// Notificações ao inquilino (pedido do dono em 2026-11-17): o contrário da solicitação. A administradora notifica o inquilino
// para resolver algo num prazo em dias úteis (ex.: ar-condicionado instalado errado, 10 dias úteis); se não resolver, pode
// mandar outra notificação do mesmo assunto (ligada à anterior) e, em qualquer notificação já vencida, gerar a multa, com o
// valor digitado, que entra no próximo boleto do aluguel como cobrança adicional (fora da NF). Textos e modelos: notificacoes.js.
// --------------------------------------------------------------------------
/**
 * Situações: Rascunho (montada, ainda não enviada) → Aguardando resposta (enviada; o prazo corre) → Resolvida (baixa com a
 * data e o comprovante) ou Multa gerada; Reiterada = veio outra notificação do mesmo assunto depois dela; Cancelada.
 */
export const SITUACOES_NOTIFICACAO = ['Rascunho', 'Aguardando resposta', 'Reiterada', 'Multa gerada', 'Resolvida', 'Cancelada'];
/** Como a notificação chegou ao inquilino (o contrato aceita AR e e-mail). */
export const MEIOS_NOTIFICACAO = ['E-mail', 'Entregue em mãos (com assinatura)', 'Correios com aviso de recebimento (AR)', 'WhatsApp'];
const NOTIFICACAO_ABERTA = ['Aguardando resposta', 'Reiterada', 'Multa gerada'];
/**
 * Notificação "em aberto" nas contagens das telas (aba Notificações, botão "Em aberto", selo da página do inquilino): rascunho,
 * aguardando resposta ou multa gerada. A reiterada não conta: quem está aberta é a reiteração dela.
 */
export const notificacaoEmAberto = (n) => ['Rascunho', 'Aguardando resposta', 'Multa gerada'].includes((n && n.situacao) || 'Rascunho');

/** Data limite: a data da notificação mais o prazo em dias úteis. Ex.: 17/11/2026 + 10 → 02/12/2026 (20/11 é feriado nacional). */
export const limiteNotificacao = (data, dias) => C.somarDiasUteis(data, Number(dias) || 0);

/** Dias úteis de amanhã até o limite (0 = vence hoje); -1 se já passou. Ex.: hoje 27/11/2026 e limite 02/12/2026 → 3. */
export function diasUteisAte(hoje, limite) {
  if (!limite || hoje > limite) return -1;
  let n = 0;
  for (let x = C.somarDias(hoje, 1); x <= limite; x = C.somarDias(x, 1)) if (C.diaUtil(x)) n += 1;
  return n;
}

export const notificacoesDo = (d, contratoId) => (d.notificacoes || []).filter((x) => x.contrato_id === contratoId).sort(C.maisRecentePrimeiro);

/** A cadeia do mesmo assunto, da 1ª até esta (pelos ``anterior_id``). */
export function cadeiaDaNotificacao(d, n) {
  const out = [];
  const vistos = new Set();
  for (let x = n; x && !vistos.has(x.id); x = x.anterior_id ? buscar(d, 'notificacoes', x.anterior_id) : null) { vistos.add(x.id); out.unshift(x); }
  return out;
}
/** 1ª, 2ª, 3ª… notificação do assunto. */
export const numeroDaNotificacao = (d, n) => cadeiaDaNotificacao(d, n).length;

/**
 * Como está a notificação hoje: { situacao, aberta (prazo correndo ou vencido, sem baixa), vencida, restam (dias úteis até o
 * limite; -1 vencida), avisar (dentro do aviso da regra `notificacao_aviso_dias`), podeMulta, podeReiterar, podeBaixa }.
 * Ex.: limite 02/12/2026, aviso de 3 dias úteis: em 27/11 avisa (restam 3); em 03/12 está vencida e pode gerar a multa.
 */
export function estadoNotificacao(d, n, hoje = C.hojeIso()) {
  const situacao = n.situacao || 'Rascunho';
  const aberta = NOTIFICACAO_ABERTA.includes(situacao);
  const restam = diasUteisAte(hoje, n.data_limite);
  const vencida = aberta && restam < 0;
  const proxima = n.reiterada_por ? buscar(d, 'notificacoes', n.reiterada_por) : null;
  return {
    situacao, aberta, vencida, restam,
    avisar: aberta && situacao !== 'Reiterada' && !n.multa_valor && restam >= 0 && restam <= CR.regra('notificacao_aviso_dias', n),
    podeMulta: vencida && !(n.multa_valor > 0),
    podeReiterar: aberta && !(proxima && proxima.situacao !== 'Cancelada'),
    podeBaixa: aberta,
  };
}

/** Dados de uma notificação nova ou de um rascunho, conferidos: { data, prazo_dias, data_limite, ... }. */
function conferirNotificacao(d, dados) {
  const c = buscar(d, 'contratos', dados.contrato_id);
  if (!c) throw new C.ErroUsuario('Escolha o inquilino.');
  if (!C.dataValida(dados.data)) throw new C.ErroUsuario('Informe a data da notificação.');
  const prazo = Number(dados.prazo_dias);
  if (!Number.isInteger(prazo) || prazo < 1 || prazo > 90) throw new C.ErroUsuario('O prazo vai de 1 a 90 dias úteis.');
  const assunto = String(dados.assunto || '').trim();
  const texto = String(dados.texto || '').trim();
  if (!assunto) throw new C.ErroUsuario('Informe o assunto da notificação.');
  if (!texto) throw new C.ErroUsuario('Escreva o texto da notificação.');
  const pendente = /\[preencher: [^\]]*\]/.exec(texto);
  if (pendente) throw new C.ErroUsuario(`Complete o texto antes de salvar: ainda há "${pendente[0]}".`);
  const limite = limiteNotificacao(dados.data, prazo);
  // o texto diz a data limite: se o prazo ou a data mudaram depois de montar, a carta ficaria com a data errada
  if (!texto.includes(C.dataBr(limite))) throw new C.ErroUsuario(`O texto não traz a data limite certa (${C.dataBr(limite)}, ${prazo} dias úteis de ${C.dataBr(dados.data)}): clique em "Montar o texto de novo" ou corrija a data no texto.`);
  return { c, campos: { contrato_id: c.id, imovel_id: c.imovel_id || null, data: dados.data, modelo: String(dados.modelo || ''), assunto, texto,
    clausula: String(dados.clausula || '').trim(), prazo_dias: prazo, data_limite: limite } };
}

/**
 * Nova notificação (fica em Rascunho até ser enviada). ``anterior_id``: a notificação do mesmo assunto que esta reitera
 * (do mesmo contrato, ainda sem outra depois dela, não cancelada nem resolvida).
 */
export function criarNotificacao(d, dados, usuario) {
  const { c, campos } = conferirNotificacao(d, dados);
  const ant = dados.anterior_id ? buscar(d, 'notificacoes', dados.anterior_id) : null;
  if (dados.anterior_id && (!ant || ant.contrato_id !== c.id)) throw new C.ErroUsuario('A notificação anterior não é deste inquilino.');
  if (ant && !estadoNotificacao(d, ant).podeReiterar) throw new C.ErroUsuario(`A notificação de ${C.dataBr(ant.data)} já tem outra depois dela, ou está resolvida ou cancelada.`);
  const n = inserir(d, 'notificacoes', { ...campos, anterior_id: ant ? ant.id : null, reiterada_por: null, situacao: 'Rascunho', enviada_em: null, enviada_por: null,
    arquivo_assinado: null, resolvida_em: null, comprovante_baixa: null, observacao_baixa: '', multa_valor: null, multa_data: null, multa_cobranca_id: null,
    cancelada_em: null, motivo_cancelamento: '' }, usuario,
  `${c.inquilino_nome}: ${ant ? `${cadeiaDaNotificacao(d, ant).length + 1}ª notificação` : 'notificação'} de ${C.dataBr(campos.data)} (${campos.assunto}), prazo até ${C.dataBr(campos.data_limite)}`);
  if (ant) atualizar(d, 'notificacoes', ant.id, { reiterada_por: n.id }, usuario, `${c.inquilino_nome}: notificação de ${C.dataBr(ant.data)} reiterada pela de ${C.dataBr(n.data)}`);
  return n;
}

/** Muda o rascunho (data, prazo, assunto, texto): só antes de enviar. */
export function editarNotificacao(d, id, dados, usuario) {
  const n = buscar(d, 'notificacoes', id);
  if (!n) throw new C.ErroUsuario('Notificação não encontrada.');
  if (n.situacao !== 'Rascunho') throw new C.ErroUsuario('Notificação já enviada: o texto não muda mais. Se precisar, cancele e faça outra.');
  const { campos } = conferirNotificacao(d, { ...dados, contrato_id: n.contrato_id });
  // a assinada era do texto antigo: sai junto (o arquivo é apagado pela tela, alterarApagandoAnexos)
  const mudouTexto = campos.texto !== n.texto || campos.data !== n.data || campos.data_limite !== n.data_limite;
  atualizar(d, 'notificacoes', n.id, { ...campos, ...(mudouTexto && n.arquivo_assinado ? { arquivo_assinado: null } : {}) }, usuario, `Notificação de ${C.dataBr(campos.data)}: rascunho alterado`);
  return n;
}

/**
 * PDF da notificação assinado pelo programa do PC (assinatura digital) e baixado pelo "Baixar PDF assinado": vira a notificação
 * assinada (``arquivo_assinado``), como se fosse anexado à mão (busca de 24/11, DOC-02). Só se ainda não há assinada, a
 * notificação não foi cancelada e o texto não mudou depois do pedido (``pedidoEm``, ISO): mudar o rascunho apaga a assinada
 * (``editarNotificacao``), e o PDF pedido antes é do texto antigo. Devolve true se ligou.
 * Ex.: pedido em 17/11/2026 10:00, rascunho alterado às 11:00 → false (o assinado é do texto de antes).
 */
export function ligarNotificacaoAssinada(d, id, arquivo, pedidoEm, usuario) {
  const n = buscar(d, 'notificacoes', id);
  if (!n || !arquivo || !pedidoEm || n.arquivo_assinado || n.situacao === 'Cancelada') return false;
  const mudouDepois = (d.historico || []).some((h) => h.tabela === 'notificacoes' && Number(h.registro_id) === n.id && h.detalhes
    && ['texto', 'data', 'data_limite'].some((k) => h.detalhes[k]) && String(h.quando) > String(pedidoEm));
  if (mudouDepois) return false;
  anexarComprovante(d, 'notificacoes', n.id, 'arquivo_assinado', arquivo, usuario);
  return true;
}

/** Marca o envio (data e por onde): o prazo passa a correr ("Aguardando resposta"); a anterior do mesmo assunto fica "Reiterada". */
export function marcarNotificacaoEnviada(d, id, { data, meio }, usuario) {
  const n = buscar(d, 'notificacoes', id);
  if (!n) throw new C.ErroUsuario('Notificação não encontrada.');
  if (n.situacao !== 'Rascunho') throw new C.ErroUsuario(`Esta notificação já foi marcada como enviada${n.enviada_em ? ` em ${C.dataBr(n.enviada_em)}` : ''}.`);
  if (!C.dataValida(data)) throw new C.ErroUsuario('Informe a data do envio.');
  if (data < n.data) throw new C.ErroUsuario(`O envio não pode ser antes da data da notificação (${C.dataBr(n.data)}).`);
  if (!MEIOS_NOTIFICACAO.includes(meio)) throw new C.ErroUsuario('Escolha por onde a notificação foi enviada.');
  atualizar(d, 'notificacoes', n.id, { situacao: 'Aguardando resposta', enviada_em: data, enviada_por: meio }, usuario,
    `Notificação de ${C.dataBr(n.data)} enviada em ${C.dataBr(data)} (${meio}): prazo até ${C.dataBr(n.data_limite)}`);
  const ant = n.anterior_id ? buscar(d, 'notificacoes', n.anterior_id) : null;
  if (ant && ant.situacao === 'Aguardando resposta') atualizar(d, 'notificacoes', ant.id, { situacao: 'Reiterada' }, usuario, `Notificação de ${C.dataBr(ant.data)} reiterada (nova enviada em ${C.dataBr(data)})`);
  return n;
}

/**
 * Baixa: o inquilino resolveu (data, comprovante e observação). As anteriores do mesmo assunto que estavam "Reiterada"
 * também ficam resolvidas. A multa já gerada continua no boleto (para tirar: "Retirar a multa").
 */
export function darBaixaNotificacao(d, id, { data, comprovante = null, observacao = '' }, usuario) {
  const n = buscar(d, 'notificacoes', id);
  if (!n) throw new C.ErroUsuario('Notificação não encontrada.');
  if (!estadoNotificacao(d, n).podeBaixa) throw new C.ErroUsuario(n.situacao === 'Rascunho' ? 'Marque antes o envio da notificação.' : `Esta notificação está "${n.situacao}".`);
  if (!C.dataValida(data)) throw new C.ErroUsuario('Informe a data em que foi resolvido.');
  if (data < n.data) throw new C.ErroUsuario(`A data da baixa não pode ser antes da notificação (${C.dataBr(n.data)}).`);
  const obs = String(observacao || '').trim();
  atualizar(d, 'notificacoes', n.id, { situacao: 'Resolvida', resolvida_em: data, comprovante_baixa: comprovante || null, observacao_baixa: obs }, usuario,
    `Notificação de ${C.dataBr(n.data)} resolvida em ${C.dataBr(data)}${obs ? `: ${obs}` : ''}`);
  // as anteriores do mesmo assunto ainda abertas (reiteradas, com multa gerada ou aguardando) também se resolvem (2026-11-20)
  for (const a of cadeiaDaNotificacao(d, n).slice(0, -1).filter((x) => ['Reiterada', 'Multa gerada', 'Aguardando resposta'].includes(x.situacao))) {
    atualizar(d, 'notificacoes', a.id, { situacao: 'Resolvida', resolvida_em: data }, usuario, `Notificação de ${C.dataBr(a.data)} resolvida (baixa na de ${C.dataBr(n.data)})`);
  }
  return n;
}

/** Cancela (ex.: feita por engano). A anterior que esta reiterava volta a esperar a resposta. A multa já gerada sai antes (Retirar a multa). */
export function cancelarNotificacao(d, id, motivo, usuario, hoje = C.hojeIso()) {
  const n = buscar(d, 'notificacoes', id);
  if (!n) throw new C.ErroUsuario('Notificação não encontrada.');
  if (['Resolvida', 'Cancelada'].includes(n.situacao)) throw new C.ErroUsuario(`Esta notificação já está "${n.situacao}".`);
  if (n.multa_valor > 0) throw new C.ErroUsuario('Esta notificação tem multa gerada: retire a multa antes de cancelar.');
  const proxima = n.reiterada_por && buscar(d, 'notificacoes', n.reiterada_por);
  if (proxima && proxima.situacao !== 'Cancelada') throw new C.ErroUsuario(`Já existe a notificação de ${C.dataBr(proxima.data)} depois desta: cancele antes aquela.`);
  atualizar(d, 'notificacoes', n.id, { situacao: 'Cancelada', cancelada_em: hoje, motivo_cancelamento: String(motivo || '').trim() }, usuario,
    `Notificação de ${C.dataBr(n.data)} cancelada${motivo ? `: ${String(motivo).trim()}` : ''}`);
  const ant = n.anterior_id ? buscar(d, 'notificacoes', n.anterior_id) : null;
  if (ant && ant.reiterada_por === n.id) {
    atualizar(d, 'notificacoes', ant.id, { reiterada_por: null, ...(ant.situacao === 'Reiterada' ? { situacao: 'Aguardando resposta' } : {}) }, usuario,
      `Notificação de ${C.dataBr(ant.data)} volta a esperar a resposta (a de ${C.dataBr(n.data)} foi cancelada)`);
  }
  return n;
}

/** Exclui o rascunho (nunca enviado): a anterior que ele reiteraria fica livre para outra. A assinada sai junto (alterarApagandoAnexos). */
export function excluirNotificacao(d, id, usuario) {
  const n = buscar(d, 'notificacoes', id);
  if (!n) throw new C.ErroUsuario('Notificação não encontrada.');
  if (n.situacao !== 'Rascunho') throw new C.ErroUsuario('Só o rascunho (ainda não enviado) pode ser excluído. A enviada fica no histórico do inquilino: use "Cancelar".');
  const ant = n.anterior_id ? buscar(d, 'notificacoes', n.anterior_id) : null;
  if (ant && ant.reiterada_por === n.id) atualizar(d, 'notificacoes', ant.id, { reiterada_por: null }, usuario, `Notificação de ${C.dataBr(ant.data)}: rascunho da nova notificação excluído`);
  excluir(d, 'notificacoes', n.id, usuario, `Rascunho da notificação de ${C.dataBr(n.data)} excluído (${n.assunto})`);
}

/** Texto da multa no boleto (vai na descrição da cobrança adicional; não entra na NF). */
export const textoMultaNotificacao = (n) => `Multa por descumprimento da notificação de ${C.dataBr(n.data)}`;

/**
 * Boleto que recebe a multa: o próximo boleto do aluguel do contrato a cobrar, ainda não vencido na data da multa e não emitido
 * no banco (o emitido não muda), na ordem dos meses; null se ainda não foi gerado (a multa entra quando for). Ex.: multa em
 * 03/12/2026 → o boleto de 11/2026, que vence em 10/12/2026.
 */
export function boletoDaMulta(d, contratoId, data) {
  return d.cobrancas.filter((x) => x.contrato_id === contratoId && !ehBoletoAvulso(x) && aCobrar(x) && !emitidoNoBanco(x) && !C.vencido(x.vencimento, data))
    .sort((a, b) => a.competencia.localeCompare(b.competencia) || a.id - b.id)[0] || null;
}

/** Valor sugerido da multa: os aluguéis da regra `notificacao_multa_alugueis` (padrão 1 aluguel cheio de hoje). */
export const multaSugerida = (d, c, hoje = C.hojeIso()) => Math.round(aluguelAtual(d, c, hoje) * (Number(CR.regra('notificacao_multa_alugueis', c)) || 0));

/**
 * Multas das notificações nos boletos (o mesmo caminho da diferença de pagamento a menos: ``outros`` do boleto, fora da NF).
 * Cada boleto guarda em ``multas_notificacao`` [{ notificacao_id, valor }] o que recebeu. Aqui: tira do boleto em aberto a
 * multa que a notificação não tem mais (multa retirada ou desfeita pelo Histórico) e põe no próximo boleto a que ainda está
 * sem boleto (gerada antes de o boleto existir, ou o boleto foi excluído). Devolve quantos boletos mudaram.
 */
export function sincronizarMultas(d, contratoId, usuario) {
  let mudou = 0;
  const notifs = (d.notificacoes || []).filter((n) => n.contrato_id === contratoId);
  for (const cb of d.cobrancas.filter((x) => x.contrato_id === contratoId && (x.multas_notificacao || []).length && !x.data_pagamento && !emitidoNoBanco(x))) {
    const ficam = [];
    let tira = 0;
    const textos = [];
    for (const e of cb.multas_notificacao) {
      const n = buscar(d, 'notificacoes', e.notificacao_id);
      // (a multa é do contrato da notificação: num boleto de outro contrato, ex.: o que passou na troca de titular, ela sai)
      if (n && n.contrato_id === contratoId && n.multa_valor === e.valor && n.multa_cobranca_id === cb.id) ficam.push(e);
      else { tira += e.valor; textos.push(e.texto); }
    }
    if (!tira) continue;
    // uma ocorrência por multa retirada: duas notificações da mesma data têm o mesmo texto (2026-11-20)
    const partes = String(cb.outros_descricao || '').split('; ');
    for (const t of textos) { const k = partes.indexOf(t); if (k >= 0) partes.splice(k, 1); }
    const descricao = partes.filter(Boolean).join('; ');
    atualizar(d, 'cobrancas', cb.id, { outros: (cb.outros || 0) - tira, outros_descricao: descricao, multas_notificacao: ficam }, usuario,
      `Boleto ${C.compBr(cb.competencia)}: sai a multa de ${C.reais(tira)} (${textos.join('; ')})`);
    mudou += 1;
  }
  // multa desfeita pelo Histórico: a ligação com o boleto (gravada noutra linha) também sai
  for (const n of notifs.filter((x) => !(x.multa_valor > 0) && x.multa_cobranca_id)) atualizar(d, 'notificacoes', n.id, { multa_cobranca_id: null }, usuario, `Notificação de ${C.dataBr(n.data)}: sem multa no boleto`);
  for (const n of notifs.filter((x) => x.multa_valor > 0)) {
    const atual = n.multa_cobranca_id ? buscar(d, 'cobrancas', n.multa_cobranca_id) : null;
    if (atual && (atual.multas_notificacao || []).some((e) => e.notificacao_id === n.id)) continue;
    const destino = boletoDaMulta(d, contratoId, n.multa_data || C.hojeIso());
    if (!destino) { if (n.multa_cobranca_id) atualizar(d, 'notificacoes', n.id, { multa_cobranca_id: null }, usuario, `Multa da notificação de ${C.dataBr(n.data)}: espera o próximo boleto`); continue; }
    const texto = textoMultaNotificacao(n);
    atualizar(d, 'cobrancas', destino.id, { outros: (destino.outros || 0) + n.multa_valor, outros_descricao: [destino.outros_descricao, texto].filter(Boolean).join('; '),
      multas_notificacao: [...(destino.multas_notificacao || []), { notificacao_id: n.id, valor: n.multa_valor, texto }] }, usuario,
    `Boleto ${C.compBr(destino.competencia)}: + ${C.reais(n.multa_valor)} (${texto})`);
    atualizar(d, 'notificacoes', n.id, { multa_cobranca_id: destino.id }, usuario, `Multa da notificação de ${C.dataBr(n.data)} lançada no boleto ${C.compBr(destino.competencia)}`);
    mudou += 1;
  }
  const c = mudou && buscar(d, 'contratos', contratoId);
  if (c) realocarReserva(d, c, usuario); // o total do boleto mudou: a reserva acompanha
  return mudou;
}

/** O que o "Gerar multa" vai fazer, para a janela de confirmação: { sugerido, boleto (ou null: entra quando for gerado) }. */
export function previaMultaNotificacao(d, id, hoje = C.hojeIso()) {
  const n = buscar(d, 'notificacoes', id);
  const c = n && buscar(d, 'contratos', n.contrato_id);
  if (!n || !c) throw new C.ErroUsuario('Notificação não encontrada.');
  if (!estadoNotificacao(d, n, hoje).podeMulta) throw new C.ErroUsuario(n.multa_valor > 0 ? 'A multa desta notificação já foi gerada.' : `A multa só pode ser gerada depois do prazo (${C.dataBr(n.data_limite)}), com a notificação enviada e sem baixa.`);
  return { notificacao: n, contrato: c, sugerido: multaSugerida(d, c, hoje), boleto: boletoDaMulta(d, c.id, hoje) };
}

/**
 * Gera a multa (decisão do dono, 2026-11-17): o administrador digita o valor e ela entra no próximo boleto do aluguel como
 * cobrança adicional ("Multa por descumprimento da notificação de 17/11/2026"), fora da NF. Ex.: multa de R$ 2.000,00 em
 * 03/12/2026 → boleto de 11/2026 (vence 10/12/2026) passa de R$ 2.000,00 para R$ 4.000,00.
 */
export function gerarMultaNotificacao(d, id, valor, usuario, hoje = C.hojeIso()) {
  const { notificacao: n, contrato: c } = previaMultaNotificacao(d, id, hoje);
  if (!Number.isInteger(valor) || valor <= 0) throw new C.ErroUsuario('Digite o valor da multa.');
  atualizar(d, 'notificacoes', n.id, { situacao: 'Multa gerada', multa_valor: valor, multa_data: hoje, multa_cobranca_id: null }, usuario,
    `${c.inquilino_nome}: multa de ${C.reais(valor)} pela notificação de ${C.dataBr(n.data)} (prazo até ${C.dataBr(n.data_limite)})`);
  sincronizarMultas(d, c.id, usuario);
  return { notificacao: n, boleto: n.multa_cobranca_id ? buscar(d, 'cobrancas', n.multa_cobranca_id) : null };
}

/** Por que a multa não pode sair (boleto pago ou já no banco) ou null. */
function multaPresa(d, n) {
  const cb = n.multa_cobranca_id && buscar(d, 'cobrancas', n.multa_cobranca_id);
  if (cb && cb.data_pagamento) return `A multa já foi paga no boleto de ${C.compBr(cb.competencia)}: desfaça antes aquele pagamento.`;
  if (cb && emitidoNoBanco(cb)) return `O boleto de ${C.compBr(cb.competencia)}, com a multa, já está no banco: cancele lá antes de tirar a multa.`;
  return null;
}

/** Retira a multa (do boleto em aberto e da notificação): a notificação volta à situação de antes. */
export function retirarMultaNotificacao(d, id, usuario) {
  const n = buscar(d, 'notificacoes', id);
  if (!n || !(n.multa_valor > 0)) throw new C.ErroUsuario('Esta notificação não tem multa.');
  const presa = multaPresa(d, n);
  if (presa) throw new C.ErroUsuario(presa);
  const proxima = n.reiterada_por && buscar(d, 'notificacoes', n.reiterada_por);
  const antes = n.situacao !== 'Multa gerada' ? n.situacao : proxima && proxima.enviada_em && proxima.situacao !== 'Cancelada' ? 'Reiterada' : 'Aguardando resposta';
  atualizar(d, 'notificacoes', n.id, { situacao: antes, multa_valor: null, multa_data: null, multa_cobranca_id: null }, usuario, `Multa de ${C.reais(n.multa_valor)} da notificação de ${C.dataBr(n.data)} retirada`);
  sincronizarMultas(d, n.contrato_id, usuario);
}

/**
 * Alerta do Painel e da página do inquilino (um por contrato): prazo vencido (vermelho), prazo terminando nos próximos dias úteis
 * da regra `notificacao_aviso_dias` (lembrete), rascunho ainda não enviado e multa à espera do próximo boleto.
 */
function alertaNotificacoes(d, c, hoje) {
  const l = (d.notificacoes || []).filter((n) => n.contrato_id === c.id);
  if (!l.length) return null;
  const est = l.map((n) => [n, estadoNotificacao(d, n, hoje)]);
  const vencidas = est.filter(([n, e]) => e.podeMulta && n.situacao !== 'Reiterada');
  const vencendo = est.filter(([, e]) => e.avisar);
  const rascunhos = est.filter(([n]) => n.situacao === 'Rascunho');
  const semBoleto = l.filter((n) => n.multa_valor > 0 && !n.multa_cobranca_id);
  const texto = [
    ...vencidas.map(([n]) => `o prazo da notificação de ${C.dataBr(n.data)} (${n.assunto}) terminou em ${C.dataBr(n.data_limite)}: dê baixa se foi resolvido, mande outra notificação ou gere a multa`),
    ...vencendo.map(([n, e]) => `o prazo da notificação de ${C.dataBr(n.data)} (${n.assunto}) termina ${e.restam === 0 ? 'hoje' : `em ${C.dataBr(n.data_limite)} (${e.restam === 1 ? 'falta' : 'faltam'} ${C.plural(e.restam, 'dia útil', 'dias úteis')})`}: mande o lembrete ao inquilino`),
    ...rascunhos.map(([n]) => `a notificação de ${C.dataBr(n.data)} (${n.assunto}) ainda não foi enviada: imprima, assine, anexe a assinada e envie`),
    ...semBoleto.map((n) => `a multa de ${C.reais(n.multa_valor)} da notificação de ${C.dataBr(n.data)} entra no próximo boleto do aluguel, quando ele for gerado`),
  ];
  if (!texto.length) return null;
  const alvo = (vencidas[0] || vencendo[0] || rascunhos[0] || [semBoleto[0]])[0];
  return { nivel: vencidas.length ? 'perigo' : vencendo.length ? 'aviso' : 'info', tipo: 'Notificação ao inquilino', ancora: 'notificacoes',
    link: alvo ? `#/notificacao/${alvo.id}` : null, texto: `${texto.join('; ')}.`.replace(/^./, (x) => x.toLocaleUpperCase('pt-BR')) };
}

export const reformasDo =(d, imovelId) => d.reformas.filter((r) => r.imovel_id === imovelId)
  .sort(C.maisRecentePrimeiro);

// --------------------------------------------------------------------------
// Airbnb: ganhos lançados por imóvel (só imóvel vago); o Airbnb informa só o total, então a NF é UMA por mês, sem imóvel
// --------------------------------------------------------------------------
export const ganhosAirbnbDo = (d, imovelId) => (d.ganhos_airbnb || []).filter((g) => g.imovel_id === imovelId)
  .sort((a, b) => String(b.data_recebimento).localeCompare(String(a.data_recebimento)) || b.id - a.id);

/** NF avulsa do Airbnb de um mês de referência (criada por gerarNfAirbnb), ou null. */
export const nfAirbnbDe = (d, comp) => d.avulsas.find((a) => a.airbnb_competencia === comp) || null;

/** Ganhos do Airbnb de um mês de referência: { comp, ganhos, total, porImovel: [{ imovel, valor }], nf, numerada, divergente }. */
export function airbnbDoMes(d, comp) {
  const ganhos = (d.ganhos_airbnb || []).filter((g) => g.competencia === comp);
  const total = ganhos.reduce((t, g) => t + g.valor, 0);
  const por = new Map();
  for (const g of ganhos) por.set(g.imovel_id, (por.get(g.imovel_id) || 0) + g.valor);
  const porImovel = [...por].map(([id, valor]) => ({ imovel: buscar(d, 'imoveis', id), valor })).filter((x) => x.imovel)
    .sort((a, b) => a.imovel.nome.localeCompare(b.imovel.nome, 'pt-BR'));
  const nf = nfAirbnbDe(d, comp);
  const numerada = nf ? faturasDe(d, 'avulsa', nf.id) : [];
  return { comp, ganhos, total, porImovel, nf, numerada: numerada.length ? numerada[0].numero : null, divergente: !!nf && nf.valor !== total };
}

/**
 * Lança um ganho do Airbnb num imóvel. ``dados``: { data_recebimento, competencia (mês de referência), valor (centavos), observacoes, movimentacao_id }.
 * Só imóvel vago em algum dia do mês de referência; não entra em mês cuja NF do Airbnb já foi numerada.
 */
export function lancarGanhoAirbnb(d, imovelId, dados, usuario) {
  const i = buscar(d, 'imoveis', imovelId);
  if (!i) throw new C.ErroUsuario('Escolha o imóvel.');
  const comp = dados.competencia || C.competenciaDe(dados.data_recebimento || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dados.data_recebimento || ''))) throw new C.ErroUsuario('Informe a data em que o dinheiro entrou.');
  if (!/^\d{4}-\d{2}$/.test(String(comp || ''))) throw new C.ErroUsuario('Informe o mês de referência.');
  if (!(dados.valor > 0)) throw new C.ErroUsuario(`${i.nome}: informe o valor recebido do Airbnb.`);
  if (contasPermitidas(d, i.id, comp).motivo !== 'vago') throw new C.ErroUsuario(`${i.nome} não estava vago em ${C.compBr(comp)}: ganho do Airbnb só em imóvel vago.`);
  const m = airbnbDoMes(d, comp);
  if (m.numerada) throw new C.ErroUsuario(`A NF do Airbnb de ${C.compBr(comp)} já foi numerada (nº ${numeroFatura(m.numerada)}): lance no mês de referência seguinte.`);
  return inserir(d, 'ganhos_airbnb', { imovel_id: i.id, data_recebimento: dados.data_recebimento, competencia: comp, valor: dados.valor,
    observacoes: String(dados.observacoes || '').trim(), movimentacao_id: dados.movimentacao_id || null }, usuario, `${i.nome}: Airbnb de ${C.compBr(comp)} (${C.reais(dados.valor)})`);
}

/**
 * Cria ou acerta a NF avulsa do Airbnb do mês (sem imóvel, com os dados padrão do Airbnb): valor = soma dos ganhos lançados nos imóveis.
 * Só depois da virada do mês; NF já numerada não muda. Sem ganhos, apaga a NF ainda sem número. Devolve a NF (ou null).
 */
export function gerarNfAirbnb(d, comp, usuario, hoje = C.hojeIso()) {
  if (comp >= C.competenciaDe(hoje)) throw new C.ErroUsuario(`A NF do Airbnb de ${C.compBr(comp)} sai depois da virada do mês (a partir de ${C.dataBr(`${C.somarMeses(comp, 1)}-01`)}).`);
  const m = airbnbDoMes(d, comp);
  if (m.numerada) throw new C.ErroUsuario(`A NF do Airbnb de ${C.compBr(comp)} já foi numerada (nº ${numeroFatura(m.numerada)}).`);
  const [ini, fim] = C.limitesCompetencia(comp);
  if (!m.total) {
    if (m.nf) excluir(d, 'avulsas', m.nf.id, usuario, `NF do Airbnb de ${C.compBr(comp)} apagada (nenhum ganho lançado)`);
    return null;
  }
  const dados = { valor: m.total, data_pagamento: fim, periodo_inicio: ini, periodo_fim: fim };
  const detalhe = m.porImovel.map((x) => `${x.imovel.nome} ${C.reais(x.valor)}`).join(' + ');
  if (m.nf) {
    atualizar(d, 'avulsas', m.nf.id, dados, usuario, `NF do Airbnb de ${C.compBr(comp)}: ${C.reais(m.total)} (${detalhe})`);
    return m.nf;
  }
  const modelo = modeloAirbnb(d);
  return inserir(d, 'avulsas', { ...modelo, ...dados, imovel_id: null, airbnb_competencia: comp, descricao: `${modelo.descricao || 'Airbnb'} ${C.compBr(comp)}` },
    usuario, `NF do Airbnb de ${C.compBr(comp)}: ${C.reais(m.total)} (${detalhe})`);
}

/**
 * Situação de um imóvel para os custos (no mês de ``hoje``): vago (aceita Airbnb), alugado há pouco (aviso de conta nossa pendente
 * até 2 meses depois da entrada), conta incluída no contrato, ou o inquilino paga tudo. { motivo, rotulo, classe, airbnb, ate }.
 */
export function situacaoCustos(d, imovelId, hoje = C.hojeIso()) {
  const comp = C.competenciaDe(hoje);
  const p = contasPermitidas(d, imovelId, comp);
  const airbnb = p.motivo === 'vago' || contasPermitidas(d, imovelId, C.somarMeses(comp, -1)).motivo === 'vago';
  if (p.motivo === 'vago') return { motivo: 'vago', rotulo: 'vago', classe: 'ok', airbnb };
  if (p.motivo === 'alugou') {
    const ate = C.limitesCompetencia(C.somarMeses(C.competenciaDe(p.contrato.data_entrada), CR.regra('meses_depois_de_alugar')))[1];
    return { motivo: 'alugou', rotulo: `alugado em ${C.dataBr(p.contrato.data_entrada)}: veja se ficou conta nossa pendente (aviso até ${C.dataBr(ate)})`, classe: 'aviso', airbnb, ate };
  }
  if (p.motivo === 'incluso') return { motivo: 'incluso', rotulo: `${p.tipos.join(', ')}: incluso no contrato (nosso)`, classe: 'info', airbnb };
  return { motivo: 'inquilino', rotulo: '', classe: '', airbnb };
}

// --------------------------------------------------------------------------
// Impostos por imóvel: a NF de cada recebimento × a alíquota efetiva da empresa no mês da emissão
// (guia do contador, quando informada; senão a esperada). Sem NF ainda: 11,33% (PIS/COFINS + IRPJ + CSLL) estimado.
// --------------------------------------------------------------------------
export const aliquotaImpostos = () => Math.round(IMPOSTOS.reduce((t, x) => t + x.aliquota, 0) * 100) / 100;

/**
 * Fração do faturamento da empresa que vai para impostos no mês: { taxa, confirmado } (confirmado = as 3 guias do contador informadas).
 * ``cache``: { taxas: Map, faturamento: indiceFaturamento(d), nfs: indiceFaturas(d) }, montado a cada cálculo dos resultados.
 */
function taxaImpostos(d, emitenteId, mes, cache) {
  const chave = `${emitenteId}|${mes}`;
  if (cache.taxas.has(chave)) return cache.taxas.get(chave);
  const e = buscar(d, 'emitentes', emitenteId);
  const fatMes = e ? faturamentoNf(d, e.id, mes, cache.faturamento).valor : 0;
  let r = { taxa: aliquotaImpostos() / 100, confirmado: false };
  if (fatMes) {
    const tri = guiasDaEmpresa(d, e, mesesDoTrimestre(mes)[2], cache.faturamento);
    let taxa = 0;
    let confirmado = true;
    for (const x of IMPOSTOS) {
      const contador = guiaDo(d, e.id, x.imposto, x.mensal ? mes : trimestreDe(mes));
      if (!contador) confirmado = false;
      if (x.mensal) taxa += contador ? contador.valor / fatMes : x.aliquota / 100;
      else {
        const total = contador ? contador.valor : tri.guias.find((g) => g.imposto === x.imposto).esperado;
        taxa += tri.trimestre ? total / tri.trimestre : x.aliquota / 100;
      }
    }
    r = { taxa, confirmado };
  }
  cache.taxas.set(chave, r);
  return r;
}

/** Imposto das NFs de uma origem (boleto ou avulsa): { valor, confirmado }. Sem NF ainda: estimado sobre ``valorSemNf``. */
function impostoDaOrigem(d, tipo, id, valorSemNf, cache) {
  const fs = cache.nfs.nfs(tipo, id);
  if (!fs.length) return { valor: Math.round((valorSemNf * aliquotaImpostos()) / 100), confirmado: false };
  let v = 0;
  let ok = true;
  for (const f of fs) {
    const t = taxaImpostos(d, f.emitente_id, String(f.emissao || '').slice(0, 7), cache);
    v += f.valor * t.taxa;
    ok = ok && t.confirmado;
  }
  return { valor: Math.round(v), confirmado: ok };
}

/**
 * Quantos meses tem o período (de e até inclusive), contados de data a data, com a fração do último mês pelos dias.
 * Ex.: 20/11/2025 a 19/11/2026 → 12; 01/11/2026 a 30/11/2026 → 1; 01/11/2026 a 15/11/2026 → 0,5.
 */
export function mesesDoPeriodo(de, ate) {
  const fim = C.somarDias(ate, 1);
  let m = Math.max(0, C.mesesEntre(de.slice(0, 7), fim.slice(0, 7)));
  while (m > 0 && C.somarMesesData(de, m) > fim) m -= 1;
  const resto = C.somarMesesData(de, m);
  const dias = C.diasEntre(resto, fim);
  return m + (dias > 0 ? dias / C.diasNoMes(resto.slice(0, 7)) : 0);
}

/**
 * Resultado de cada imóvel num período (datas "AAAA-MM-DD", pelo dia em que o dinheiro entrou):
 * receita = aluguel recebido (valor da NF do boleto) + NFs avulsas do imóvel + ganhos do Airbnb; resultado (bruto) = receita − IPTU pago
 * pelo proprietário − contas pagas por nós; líquido = resultado − impostos (rateados pela NF de cada recebimento; a NF do Airbnb, pelos
 * ganhos de cada imóvel); lucro = líquido − reformas do período (a reforma vem depois do imposto: no lucro presumido ela não abate imposto).
 * Retorno anual = resultado anualizado ÷ (valor do imóvel + reformas).
 */
export function resultadosFinanceiros(d, de, ate) {
  // meses do período contados de data a data (20/11/2025 a 19/11/2026 = 12 meses; 01/11 a 30/11 = 1), não os meses do calendário tocados
  const meses = Math.max(1, mesesDoPeriodo(de, ate));
  const dentro = (x) => x && x >= de && x <= ate;
  const cache = { taxas: new Map(), faturamento: indiceFaturamento(d), nfs: indiceFaturas(d) };
  // separados por imóvel uma vez, na ordem das tabelas (antes, cada imóvel percorria todos os boletos, avulsas e contas):
  // os boletos pagos no período de cada imóvel (de todos os contratos e só dos que emitem NF) e as avulsas, ganhos e contas dele
  const porImovel = (lista, imovelDe) => {
    const m = new Map();
    for (const x of lista) { const k = imovelDe(x); const l = m.get(k); if (l) l.push(x); else m.set(k, [x]); }
    return (id) => m.get(id) || [];
  };
  const pagasDoPeriodo = d.cobrancas.filter((cb) => dentro(cb.data_pagamento));
  // contrato → imóveis (com código repetido, todos os que usam o código, como no filtro de antes)
  const imoveisDoContrato = (soNf) => {
    const m = new Map();
    for (const c of d.contratos) if (!soNf || geraNf(c)) m.set(c.id, [...(m.get(c.id) || []), c.imovel_id]);
    return m;
  };
  const porImovelDosBoletos = (soNf) => {
    const doContrato = imoveisDoContrato(soNf);
    const m = new Map();
    for (const cb of pagasDoPeriodo) {
      for (const im of new Set(doContrato.get(cb.contrato_id) || [])) { const l = m.get(im); if (l) l.push(cb); else m.set(im, [cb]); }
    }
    return (id) => m.get(id) || [];
  };
  const pagasNfDe = porImovelDosBoletos(true);
  const pagasTodasDe = porImovelDosBoletos(false);
  const avulsasDe = porImovel(d.avulsas.filter((a) => !a.airbnb_competencia && dentro(a.data_pagamento)), (a) => a.imovel_id);
  const ganhosDe = porImovel((d.ganhos_airbnb || []).filter((g) => dentro(g.data_recebimento)), (g) => g.imovel_id);
  const contasDe = porImovel(d.despesas.filter((x) => dentro(x.data_pagamento)), (x) => x.imovel_id);
  const iptusDe = porImovel(d.iptus, (x) => x.imovel_id);
  const baseDe = basesIptu(d);
  return d.imoveis.map((i) => {
    // boleto de controle (inquilino sem NF) não entra no resultado financeiro
    const pagas = pagasNfDe(i.id);
    const aluguel = pagas.reduce((s, cb) => s + (cb.valor_nf || 0), 0);
    const listaAvulsas = avulsasDe(i.id);
    const avulsas = listaAvulsas.reduce((s, a) => s + a.valor, 0);
    const ganhos = ganhosDe(i.id);
    const airbnb = ganhos.reduce((s, g) => s + g.valor, 0);
    let impostos = 0;
    let impostosEstimados = 0;
    const somar = (r) => { impostos += r.valor; if (!r.confirmado) impostosEstimados += r.valor; };
    for (const cb of pagas) if (cb.valor_nf > 0) somar(impostoDaOrigem(d, 'cobranca', cb.id, cb.valor_nf, cache));
    for (const a of listaAvulsas) somar(impostoDaOrigem(d, 'avulsa', a.id, a.valor, cache));
    for (const g of ganhos) {
      const nf = nfAirbnbDe(d, g.competencia);
      if (nf && nf.valor > 0) { const r = impostoDaOrigem(d, 'avulsa', nf.id, nf.valor, cache); somar({ valor: Math.round((r.valor * g.valor) / nf.valor), confirmado: r.confirmado }); } else somar({ valor: Math.round((g.valor * aliquotaImpostos()) / 100), confirmado: false });
    }
    let iptu = 0;
    // a parte do proprietário em cada guia paga no período (a do inquilino volta nos boletos), como em totaisIptu
    // (contratos, boletos e IPTUs do imóvel: montados uma vez, e só se o imóvel tem IPTU)
    for (const p of iptusDe(i.id)) {
      for (const pc of parcelasIptu(d, p, baseDe(i.id))) {
        if (pc.proprietario) { if (dentro(pc.paga)) iptu += pc.valorProprietario; }
        // parcela toda do inquilino, com o valor fixo arredondado (2026-11-20): a diferença para a guia real (sobra ou falta de
        // centavos) entra no custo quando a guia foi paga ou, sem ela marcada, quando o inquilino pagou o boleto
        else if (pc.valorProprietario && dentro(pc.paga || pc.pagoInquilinoEm)) iptu += pc.valorProprietario;
      }
      // à vista: o inquilino devolve nos boletos; sai do custo só o que ele já devolveu em boleto pago no período (caixa, não a
      // previsão do ano). Ex.: cota única de R$ 900,00 paga em 02/2026 e nenhum boleto pago ainda → IPTU de R$ 900,00 em fevereiro
      if (p.pago_avista) {
        const doAno = new RegExp(`IPTU ${p.ano}\\b`);
        iptu -= pagasTodasDe(i.id).filter((cb) => cb.iptu > 0 && doAno.test(cb.iptu_parcela || '')).reduce((s, cb) => s + cb.iptu, 0);
      }
    }
    const todasReformas = reformasDo(d, i.id);
    const reformasPeriodo = todasReformas.filter((r) => dentro(r.data)).reduce((s, r) => s + r.valor, 0);
    const investido = todasReformas.filter((r) => String(r.data) <= ate).reduce((s, r) => s + r.valor, 0);
    // contas pagas por nós + ressarcimentos de condomínio abatidos em boletos pagos no período (se não saíram da NF)
    const contas = contasDe(i.id).reduce((s, x) => s + x.valor, 0)
      + pagas.filter((cb) => !cb.ressarcimento_na_nf).reduce((s, cb) => s + (cb.ressarcimento || 0), 0);
    const receita = aluguel + avulsas + airbnb;
    const resultado = receita - iptu - contas;
    const liquido = resultado - impostos;
    const base = (i.valor_imovel || 0) + investido;
    return { imovel: i, receita, aluguel, avulsas, airbnb, iptu, contas, reformasPeriodo, investido, resultado, impostos, impostosEstimados, liquido,
      lucro: liquido - reformasPeriodo, base, meses, controle: imovelSoControle(d, i.id, ate),
      retornoAnual: base ? (resultado * 12 / meses / base) * 100 : null, retornoLiquido: base ? (liquido * 12 / meses / base) * 100 : null, mesesPagos: pagas.length };
  }).sort((a, b) => (b.retornoAnual ?? -Infinity) - (a.retornoAnual ?? -Infinity));
}

// --------------------------------------------------------------------------
// Contas pagas por nós (imóvel vago, ou contas incluídas no aluguel): abatem do resultado
// --------------------------------------------------------------------------
export const TIPOS_DESPESA = ['Água', 'Luz', 'Gás', 'Condomínio', 'Internet', 'Outra'];

export const despesasDo = (d, imovelId) => d.despesas.filter((x) => x.imovel_id === imovelId)
  .sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)) || String(b.data_pagamento).localeCompare(String(a.data_pagamento)) || b.id - a.id);

/**
 * Conta paga pelo banco lançada errada (decisão do dono, 2026-11-20): o administrador corrige só o lançamento da conta
 * (valor, mês de referência, imóvel); o pagamento no banco (``pagamentos_banco``) fica como foi feito. Ex.: conta de luz paga
 * pelo C6 com R$ 210,00, lançada como R$ 120,00 em 10/2026 no imóvel errado → R$ 210,00, 11/2026, no imóvel certo.
 */
export function corrigirContaPagaPeloBanco(d, despesaId, { valor, competencia, imovel_id }, usuario, papel = 'admin') {
  if (papel !== 'admin') throw new C.ErroUsuario('Só o administrador corrige uma conta paga pelo banco.');
  const x = buscar(d, 'despesas', Number(despesaId));
  if (!x) throw new Error('Conta não encontrada.');
  if (!x.pagamento_banco_id) throw new C.ErroUsuario('Esta conta não foi paga pelo banco: exclua e lance de novo.');
  if (!Number.isInteger(valor) || valor < 0) throw new C.ErroUsuario('Informe o valor da conta.');
  if (!C.competenciaValida(competencia)) throw new C.ErroUsuario('Informe o mês de referência da conta.');
  const im = buscar(d, 'imoveis', Number(imovel_id));
  if (!im) throw new C.ErroUsuario('Escolha o imóvel.');
  const mudou = [];
  if (valor !== x.valor) mudou.push(`valor ${C.reais(x.valor)} → ${C.reais(valor)}`);
  if (competencia !== x.competencia) mudou.push(`mês ${C.compBr(x.competencia)} → ${C.compBr(competencia)}`);
  if (im.id !== x.imovel_id) mudou.push(`imóvel ${(buscar(d, 'imoveis', x.imovel_id) || {}).nome || '?'} → ${im.nome}`);
  if (!mudou.length) throw new C.ErroUsuario('Nada mudou.');
  return atualizar(d, 'despesas', x.id, { valor, competencia, imovel_id: im.id }, usuario,
    `Conta paga pelo banco (pagamento nº ${x.pagamento_banco_id}) corrigida: ${mudou.join('; ')} (o pagamento no banco não muda)`);
}

/** Último valor lançado de cada tipo (para sugerir no próximo mês). */
export function ultimosValores(d, imovelId) {
  const out = {};
  for (const x of despesasDo(d, imovelId)) if (!(x.tipo in out)) out[x.tipo] = x;
  return out;
}

/** Contrato ocupando o imóvel no dia (pela entrada e saída). */
const ocupadoEm = (d, imovelId, dia) => d.contratos.some((c) => c.imovel_id === imovelId && c.data_entrada && c.data_entrada <= dia
  && (c.data_saida ? c.data_saida >= dia : c.ativo !== false));

/**
 * Algum dia de ``ini`` a ``fim`` sem contrato ocupando o imóvel (o mesmo que perguntar ``ocupadoEm`` dia a dia): junta os
 * períodos de entrada a saída dos contratos (sem saída: até o fim, se ativo) e procura um buraco.
 */
function vagoNoPeriodo(d, imovelId, ini, fim) {
  const periodos = d.contratos.filter((c) => c.imovel_id === imovelId && c.data_entrada && c.data_entrada <= fim && (c.data_saida ? c.data_saida >= ini : c.ativo !== false))
    .map((c) => [c.data_entrada, c.data_saida || fim]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let dia = ini; // primeiro dia ainda não coberto
  for (const [entrada, saida] of periodos) {
    if (entrada > dia) return true;
    if (saida >= dia) dia = C.somarDias(saida, 1);
    if (dia > fim) return false;
  }
  return dia <= fim;
}

/**
 * Imóvel vago no dia (ninguém ocupando, como em ``ocupadoEm``): { desde, dias, proximo }, ou null se está ocupado (painel de
 * Gestão). ``desde``: dia seguinte à última saída e ``dias``: quantos dias desde ela (null os dois se nunca teve inquilino);
 * ``proximo``: contrato já feito que entra depois do dia (ou null). Ex.: saída em 31/10/2026, dia 16/11/2026 → desde
 * 01/11/2026, há 16 dias; contrato novo com entrada em 01/12/2026 → proximo.
 */
export function imovelVago(d, imovelId, dia) {
  if (ocupadoEm(d, imovelId, dia)) return null;
  const doImovel = d.contratos.filter((c) => c.imovel_id === imovelId && c.data_entrada);
  const saida = doImovel.filter((c) => c.data_saida && c.data_saida < dia).map((c) => c.data_saida).sort().pop() || null;
  const proximo = doImovel.filter((c) => c.ativo !== false && c.data_entrada > dia).sort((a, b) => a.data_entrada.localeCompare(b.data_entrada))[0] || null;
  return { desde: saida ? C.somarDias(saida, 1) : null, dias: saida ? C.diasEntre(saida, dia) : null, proximo };
}
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
  if (vagoNoPeriodo(d, imovelId, ini, fim)) return { tipos: [...TIPOS_DESPESA], motivo: 'vago' };
  const limite = C.limitesCompetencia(C.somarMeses(comp, -CR.regra('meses_depois_de_alugar')))[0];
  const recente = d.contratos.find((c) => c.imovel_id === imovelId && c.data_entrada && c.data_entrada >= limite && c.data_entrada <= fim
    && !ocupadoEm(d, imovelId, C.somarDias(c.data_entrada, -1)));
  if (recente) return { tipos: [...TIPOS_DESPESA], motivo: 'alugou', contrato: recente };
  const atuais = d.contratos.filter((c) => c.imovel_id === imovelId && c.data_entrada && c.data_entrada <= fim && (c.data_saida ? c.data_saida >= ini : c.ativo !== false));
  const tipos = [...new Set(atuais.flatMap((c) => Object.entries(NOMES_CONTAS).filter(([k]) => c[k] === SITUACOES[1]).map(([, t]) => t)))];
  return { tipos, motivo: tipos.length ? 'incluso' : 'inquilino' };
}

/**
 * Lança várias contas do mesmo imóvel de uma vez. ``linhas``: [{ tipo, valor (centavos; null = em branco), data_pagamento, observacoes }].
 * R$ 0,00 com observação fica registrado: o imóvel foi verificado e não tem conta nossa no mês (conta para o fechamento).
 */
export function lancarDespesas(d, imovelId, competencia, linhas, usuario) {
  const i = buscar(d, 'imoveis', imovelId);
  if (!i) throw new Error('Imóvel não encontrado.');
  const obs = (l) => String(l.observacoes || '').trim();
  const semValor = linhas.filter((l) => l.valor === null && obs(l)).map((l) => l.tipo);
  if (semValor.length) throw new C.ErroUsuario(`${semValor.join(', ')}: informe o valor (0,00 se foi verificado e não há conta).`);
  // linha preenchida que não entraria: avisa qual é, em vez de descartar calada (2026-11-20)
  const negativa = linhas.find((l) => l.valor !== null && l.valor < 0);
  if (negativa) throw new C.ErroUsuario(`${negativa.tipo}: o valor (${C.reais(negativa.valor)}) não pode ser negativo.`);
  const zeroSemObs = linhas.find((l) => l.valor === 0 && !obs(l));
  if (zeroSemObs && linhas.some((l) => l !== zeroSemObs && (l.valor > 0 || (l.valor === 0 && obs(l))))) throw new C.ErroUsuario(`${zeroSemObs.tipo}: R$ 0,00 precisa de observação (ex.: "verificado, sem conta") ou deixe o valor em branco.`);
  const novas = linhas.filter((l) => l.valor > 0 || (l.valor === 0 && obs(l)));
  if (!novas.length) throw new C.ErroUsuario('Informe o valor de pelo menos uma conta (0,00 com observação para registrar que não há conta).');
  // qualquer imóvel aceita conta nossa (ex.: troca de titular, débito antigo); contasPermitidas só orienta a tela e o fechamento
  const ruim = novas.find((l) => !TIPOS_DESPESA.includes(l.tipo));
  if (ruim) throw new C.ErroUsuario(`Conta desconhecida: ${ruim.tipo}.`);
  const venc = novas.find((l) => l.vencimento && !/^\d{4}-\d{2}-\d{2}$/.test(l.vencimento));
  if (venc) throw new C.ErroUsuario(`${venc.tipo}: vencimento inválido.`);
  return novas.map((l) => inserir(d, 'despesas', { imovel_id: i.id, competencia, tipo: l.tipo, valor: l.valor, data_pagamento: l.data_pagamento || C.hojeIso(),
    vencimento: l.vencimento || null, observacoes: l.observacoes || '' }, usuario, `${i.nome}: ${l.tipo} de ${C.compBr(competencia)} ${l.valor ? `paga por nós (${C.reais(l.valor)})` : `verificada, sem conta (R$ 0,00: ${obs(l)})`}`));
}

// --------------------------------------------------------------------------
// Ressarcimento de condomínio: taxas do proprietário que o inquilino pagou no boleto do condomínio
// (Lei 8.245/91, art. 22, X: despesas extraordinárias). Abatem no boleto do aluguel do mês seguinte ao pagamento.
// --------------------------------------------------------------------------
export const inquilinoPagaCondominio = (c) => c.conta_condominio === SITUACOES[0];
export const ressarcimentosDo = (d, contratoId) => d.ressarcimentos.filter((r) => r.contrato_id === contratoId)
  .sort((a, b) => String(b.competencia_condominio).localeCompare(String(a.competencia_condominio)) || b.id - a.id);

/** Nomes para o campo Taxa do ressarcimento: os já escritos antes e, depois, as taxas mais comuns. */
const TAXAS_CONDOMINIO = ['Fundo de obras', 'Constituição do fundo de reserva', 'Chamada extra (obra)', 'Obra na estrutura / reforma',
  'Pintura de fachada', 'Equipamento de segurança / incêndio', 'Decoração / paisagismo das áreas comuns', 'Indenização trabalhista anterior à locação'];
export const taxasCondominioUsadas = (d) => [...new Set([...d.ressarcimentos.map((r) => r.descricao).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')), ...TAXAS_CONDOMINIO])];

/**
 * Mês de referência (competência, "aluguel de") do boleto que vence no mês ``mes`` ('AAAA-MM'), e o contrário. Os formulários
 * perguntam o mês do vencimento, que é o que a equipe vê no boleto (dados reais de 24/11/2026: "12/2026" digitado para o boleto
 * que vence em 05/12/2026 caía no boleto de referência 12/2026, que vence em janeiro). Ex.: vence no mês seguinte → vencimento
 * em 12/2026 = referência 11/2026; vence no próprio mês → 12/2026 = 12/2026.
 */
export const competenciaDoMesVencimento = (c, mes) => (mes ? (c && c.cobranca_mes_seguinte === false ? mes : C.somarMeses(mes, -1)) : null);
export const mesVencimentoDaCompetencia = (c, comp) => (comp ? (c && c.cobranca_mes_seguinte === false ? comp : C.somarMeses(comp, 1)) : null);

/** Texto do boleto de uma competência: "boleto de referência 11/2026, vence 05/12/2026" (e se ainda não foi gerado). */
export function textoBoletoDaCompetencia(d, c, comp) {
  if (!c || !comp) return '';
  const cb = boletoDoMes(d, c.id, comp);
  const venc = cb ? cb.vencimento : vencimentoDoContrato(d, c, comp);
  return `boleto de referência ${C.compBr(comp)}, vence ${C.dataBr(venc)}${cb ? (cb.data_pagamento ? ' (já pago)' : '') : ' (ainda não gerado)'}`;
}

/** Competência do boleto que vence no mês seguinte ao pagamento da taxa pelo inquilino. */
export function competenciaDoAbatimento(c, dataPagamento) {
  const vence = C.somarMeses(C.competenciaDe(dataPagamento), 1);
  return c.cobranca_mes_seguinte !== false ? C.somarMeses(vence, -1) : vence;
}

/**
 * Ressarcimento lançado sem a data do pagamento (o inquilino ainda não mandou o comprovante): o boleto previsto é o do mês
 * seguinte ao vencimento do boleto do condomínio, que vence no mês seguinte ao do condomínio. Ex.: condomínio de 11/2026
 * (vence em 05/12) → boleto que vence em 01/2027 (referência 12/2026, quando o aluguel vence no mês seguinte).
 */
export function competenciaDoAbatimentoPrevisto(c, compCondominio) {
  return C.competenciaValida(compCondominio) ? competenciaDoAbatimento(c, `${C.somarMeses(compCondominio, 1)}-01`) : null;
}

/**
 * O desconto do ressarcimento só entra no boleto com o pagamento do condomínio confirmado (data do pagamento posta). Sem ela,
 * o boleto sai sem o desconto, que entra quando a data for posta (com o boleto ainda em aberto). Decisão do dono, 24/11/2026.
 */
export const ressarcimentoConfirmado = (r) => !!(r && r.data_pagamento);

/** Ressarcimentos lançados sem o comprovante do pagamento do condomínio. */
export const ressarcimentosSemComprovante = (d, contratoId) => (d.ressarcimentos || []).filter((r) => r.contrato_id === contratoId && !ressarcimentoConfirmado(r));

/**
 * Aviso dos ressarcimentos sem o comprovante: o desconto ainda não entrou. Ex.: fundo de obras de R$ 150,00 do condomínio de
 * 11/2026, sem data → "entra no boleto que vence em 01/2027 só com a data do pagamento"; boleto já pago → saiu sem ele.
 */
export function alertaRessarcimentoSemComprovante(d, c) {
  const lista = ressarcimentosSemComprovante(d, c.id);
  if (!lista.length) return null;
  const partes = lista.map((r) => {
    const cb = r.competencia_abatimento && boletoDoMes(d, c.id, r.competencia_abatimento);
    const onde = r.competencia_abatimento ? `boleto que vence em ${C.compBr(mesVencimentoDaCompetencia(c, r.competencia_abatimento))}` : 'boleto do aluguel';
    return `${r.descricao} ${C.reais(r.valor)} (condomínio de ${C.compBr(r.competencia_condominio)}): ${cb && (cb.data_pagamento || emAcordo(cb)) ? `o ${onde} saiu sem o desconto` : cb ? `o ${onde} está sem o desconto até a data ser posta` : `entra no ${onde} só com a data do pagamento`}`;
  });
  return { nivel: 'info', tipo: 'Condomínio', ancora: 'ressarcimentos',
    texto: `Falta o comprovante do pagamento do condomínio: ${partes.join('; ')}. Quando o inquilino mandar, ponha a data do pagamento no ressarcimento (Editar).` };
}

/**
 * Taxas do condomínio abatidas no boleto, agrupadas pelo mês do condomínio, para o demonstrativo (pedido do dono de 24/11/2026:
 * uma linha por taxa, como na página do inquilino). Ex.: [{ mes: '2026-10', itens: [{ descricao: 'Extraordinárias', valor: 35318 },
 * { descricao: 'Fundo de reserva', valor: 10092 }] }]. Vazio se o que está lançado não soma o que o boleto abate (boleto antigo).
 */
export function taxasNoBoleto(d, cb) {
  if (!cb.ressarcimento) return [];
  const lista = (d.ressarcimentos || []).filter((r) => r.contrato_id === cb.contrato_id && r.competencia_abatimento === cb.competencia && ressarcimentoConfirmado(r));
  if (lista.reduce((t, r) => t + r.valor, 0) !== cb.ressarcimento) return [];
  const meses = [...new Set(lista.map((r) => r.competencia_condominio))].sort();
  return meses.map((mes) => ({ mes, itens: lista.filter((r) => r.competencia_condominio === mes)
    .map((r) => ({ descricao: r.descricao, valor: r.valor })).sort((a, b) => String(a.descricao).localeCompare(String(b.descricao), 'pt-BR')) }));
}

function ressarcimentosNoBoleto(d, contratoId, comp) {
  // só com o pagamento do condomínio confirmado (``ressarcimentoConfirmado``)
  const lista = (d.ressarcimentos || []).filter((r) => r.contrato_id === contratoId && r.competencia_abatimento === comp && ressarcimentoConfirmado(r));
  return { valor: lista.reduce((t, r) => t + r.valor, 0), descricao: lista.map((r) => `${r.descricao} (condomínio ${C.compBr(r.competencia_condominio)})`).join('; ') };
}

/**
 * Por que o contrato não terá boleto do aluguel no mês do abatimento (ressarcimento que não entraria em lugar nenhum), ou null.
 * Conferência de 24/11/2026: o ressarcimento de um mês depois da saída, ou depois da troca de titular (o boleto do mês é do
 * novo titular), ficava lançado e não abatia em nenhum boleto, sem aviso. Ex.: Maria sai em 20/11/2026 e o fundo de obras de
 * R$ 50,00 pago em 05/12 cairia no boleto de 12/2026, que não existe.
 * { motivo: 'troca' | 'saida' | 'entrada', data, novo? }
 */
export function semBoletoNoMes(d, c, comp) {
  if (!c || !comp || boletoDoMes(d, c.id, comp)) return null;
  if (C.diasOcupados(comp, c.data_entrada, c.data_saida) > 0) return null;
  if (c.data_entrada && `${comp}-31` < c.data_entrada) return { motivo: 'entrada', data: c.data_entrada };
  const novo = continuadoPor(d, c);
  return novo ? { motivo: 'troca', data: novo.data_entrada || novo.vigencia_inicio, novo } : { motivo: 'saida', data: c.data_saida };
}

/** Texto do motivo de ``semBoletoNoMes`` (para o formulário e o alerta). */
export function textoSemBoleto(s, comp) {
  if (s.motivo === 'troca') return `o boleto de ${C.compBr(comp)} já é de ${s.novo.inquilino_nome} (troca de titular em ${C.dataBr(s.data)})`;
  if (s.motivo === 'entrada') return `o contrato começa em ${C.dataBr(s.data)} e não tem boleto de ${C.compBr(comp)}`;
  return `o contrato termina em ${C.dataBr(s.data)} e não tem boleto de ${C.compBr(comp)}`;
}

/**
 * Ressarcimentos do condomínio que viram crédito do inquilino (decisões do dono de 24/11/2026): o mês do abatimento não tem
 * boleto deste contrato porque o inquilino já saiu ou porque o boleto passou ao novo titular. O dinheiro é de quem pagou: entra
 * como crédito no cálculo final da saída ou na devolução da garantia da troca de titular. Ex.: Maria pagou R$ 50,00 de fundo de
 * obras e o boleto de 12/2026 passou para Pedro → Pedro paga o boleto cheio e Maria recebe R$ 3.050,00 (garantia de R$ 3.000,00);
 * Maria saiu em 20/11 e pagou R$ 50,00 em 05/12 → com R$ 300,00 de débitos fica devendo R$ 250,00.
 */
export function ressarcimentosEmCredito(d, c) {
  if (!c) return [];
  return (d.ressarcimentos || []).filter((r) => r.contrato_id === c.id && ressarcimentoConfirmado(r) && r.competencia_abatimento && !boletoDoMes(d, c.id, r.competencia_abatimento))
    .filter((r) => { const s = semBoletoNoMes(d, c, r.competencia_abatimento); return s && s.motivo !== 'entrada'; })
    .sort((a, b) => String(a.data_pagamento).localeCompare(String(b.data_pagamento)) || a.id - b.id);
}

/** Linha do crédito na descrição do cálculo final (é por ela que se sabe qual ressarcimento entrou, ``ressarcimentosCreditados``). */
export const textoCreditoRessarcimento = (r) => `Ressarcimento do condomínio: ${r.descricao} (condomínio ${C.compBr(r.competencia_condominio)}, pago em ${C.dataBr(r.data_pagamento)}): ${C.reais(r.valor)}`;

/** Créditos do inquilino no cálculo final ou na devolução da garantia: { itens: [{ ressarcimento, valor, texto }], total }. */
export function creditosDaSaida(d, c) {
  const itens = ressarcimentosEmCredito(d, c).map((r) => ({ ressarcimento: r, valor: r.valor, texto: textoCreditoRessarcimento(r) }));
  return { itens, total: itens.reduce((t, x) => t + x.valor, 0) };
}

/** Ids dos ressarcimentos cuja linha (``textoCreditoRessarcimento``) ficou na descrição dos créditos. */
export function ressarcimentosCreditados(d, c, descricao) {
  const texto = String(descricao || '');
  return texto ? ressarcimentosEmCredito(d, c).filter((r) => texto.includes(textoCreditoRessarcimento(r))).map((r) => r.id) : [];
}

/**
 * Onde o crédito do ressarcimento é acertado: { tipo: 'saida' | 'devolucao', registro (o cálculo já feito, ou null), possivel }.
 * Troca de titular sem garantia em dinheiro a devolver (ex.: fiador): ``possivel`` false, a equipe devolve à parte.
 */
export function acertoDoCredito(d, c) {
  const n = continuadoPor(d, c);
  if (!n) return { tipo: 'saida', registro: encerramentoDo(d, c.id), possivel: true };
  const registro = devolucoesDaTrocaDeTitular(d, c.id)[0] || null;
  return { tipo: 'devolucao', registro, possivel: !!registro || (garantiaNova(n) && (temCaucao(c) || temDeposito(c))) };
}

/** Situação do crédito de um ressarcimento: 'incluido' (no cálculo feito), 'a_incluir' (cálculo por fazer), 'fora' (cálculo feito sem ele) ou 'a_parte'. */
export function situacaoDoCredito(d, c, r) {
  const a = acertoDoCredito(d, c);
  if (a.registro) return (a.registro.ressarcimentos_creditados || []).includes(r.id) ? 'incluido' : 'fora';
  return a.possivel ? 'a_incluir' : 'a_parte';
}

/**
 * Depois do Desfazer de um ressarcimento pelo Histórico (valor, mês do abatimento), põe os boletos em aberto do contrato de
 * novo de acordo com os ressarcimentos lançados: os meses que têm ressarcimento e os boletos que ainda mostram um.
 * Conferência de 24/11/2026: o Desfazer voltava o ressarcimento e o boleto continuava com o valor de antes. Ex.: R$ 50,00
 * mudado para R$ 80,00 e desfeito → o boleto de 11/2026 volta a abater R$ 50,00.
 */
export function reaplicarRessarcimentos(d, contratoId, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  if (!c) return;
  const meses = [...(d.ressarcimentos || []).filter((r) => r.contrato_id === c.id).map((r) => r.competencia_abatimento),
    ...d.cobrancas.filter((cb) => cb.contrato_id === c.id && cb.ressarcimento && !cb.data_pagamento).map((cb) => cb.competencia)];
  for (const comp of new Set(meses.filter(Boolean))) aplicarRessarcimentos(d, c, comp, usuario);
}

/**
 * Mês de condomínio mais antigo ainda não conferido (para o alerta e o fechamento), ou null. O alerta só cobra o mês que
 * acabou; ``ate`` deixa olhar até outro mês: o boleto do condomínio de um mês chega antes do fim dele (24/11/2026, dados
 * reais: o do Ascot de 11/2026, que vence em 05/12, chegou em 24/11 e o fechamento de 12/2026 dizia "nada a conferir").
 */
export function condominioAConferir(c, hoje = C.hojeIso(), { ate = null } = {}) {
  if (!inquilinoPagaCondominio(c) || !contratoAtivo(c, hoje)) return null;
  const ultimo = C.somarMeses(C.competenciaDe(hoje), -1); // o mês que acabou: o inquilino já pagou o condomínio dele
  const limite = ate || ultimo;
  const inicio = C.competenciaDe(c.data_entrada || hoje);
  const proximo = c.condominio_conferido_ate ? C.somarMeses(c.condominio_conferido_ate, 1) : (inicio > ultimo ? inicio : ultimo);
  return proximo && proximo <= limite ? proximo : null;
}

export function alertaCondominio(c, hoje = C.hojeIso()) {
  const mes = condominioAConferir(c, hoje);
  return mes ? { nivel: 'info', tipo: 'Condomínio', ancora: 'ressarcimentos',
    texto: `Confira o boleto do condomínio de ${C.compBr(mes)}${mes < C.somarMeses(C.competenciaDe(hoje), -1) ? ' em diante' : ''}: taxas do proprietário (fundo de obras, fundo de reserva, chamadas extras de obra…) pagas pelo inquilino devem ser ressarcidas no próximo boleto.` } : null;
}

/**
 * Coloca os ressarcimentos no boleto do mês do abatimento, se ele já existe e está em aberto. Boleto alterado à mão
 * recebe só o ressarcimento (os outros valores digitados ficam). Devolve o boleto, ou null se ainda não foi gerado.
 * Boleto em acordo não muda (fica como estava no dia do acordo): o ressarcimento continua lançado, à espera de outro mês
 * (``alertaRessarcimentoEmAcordo`` avisa). A reserva acompanha o novo total do boleto.
 */
export function aplicarRessarcimentos(d, contrato, comp, usuario) {
  const cb = boletoDoMes(d, contrato.id, comp);
  if (!cb || cb.data_pagamento || emAcordo(cb)) return cb || null;
  const r = ressarcimentosNoBoleto(d, contrato.id, comp);
  atualizar(d, 'cobrancas', cb.id, { ressarcimento: r.valor, ressarcimento_descricao: r.descricao, ressarcimento_na_nf: CR.regra('ressarcimento_na_nf') && r.valor > 0 },
    usuario, `Boleto ${C.compBr(comp)}: ressarcimento de condomínio ${r.valor ? C.reais(r.valor) : 'retirado'}`);
  realocarReserva(d, contrato, usuario);
  return cb;
}

/**
 * Depois da saída ou da troca de titular (o boleto do mês passou ao novo), o ressarcimento é crédito de quem pagou, no cálculo
 * final ou na devolução da garantia (decisões do dono de 24/11/2026; antes era só um aviso): avisa só o que ficou sem acertar
 * (cálculo feito sem o crédito, ou troca sem garantia em dinheiro a devolver). Com o cálculo por fazer, ele já vem preenchido.
 */
export function alertaCreditoRessarcimento(d, c) {
  for (const r of ressarcimentosEmCredito(d, c)) {
    const sit = situacaoDoCredito(d, c, r);
    const saida = acertoDoCredito(d, c).tipo === 'saida';
    if (sit === 'fora') {
      return { nivel: 'aviso', tipo: 'Condomínio', ancora: 'ressarcimentos',
        texto: `Ressarcimento de ${C.reais(r.valor)} (${r.descricao}) é crédito de ${c.inquilino_nome}, mas ${saida ? 'o cálculo final da saída foi feito' : 'a devolução da garantia (troca de titular) foi feita'} sem ele. ${saida ? 'Desfaça e refaça o cálculo final' : 'Edite a devolução da garantia e some o crédito'}, ou devolva o valor à parte.` };
    }
    if (sit === 'a_parte') {
      return { nivel: 'aviso', tipo: 'Condomínio', ancora: 'ressarcimentos',
        texto: `Ressarcimento de ${C.reais(r.valor)} (${r.descricao}) é crédito de ${c.inquilino_nome}: o boleto de ${C.compBr(r.competencia_abatimento)} passou ao novo titular e não há garantia em dinheiro a devolver na troca. Devolva o valor a ${c.inquilino_nome} à parte, ou abata num boleto em aberto dele.` };
    }
  }
  return null;
}

/**
 * Ressarcimento marcado para um boleto que está em acordo e não foi abatido nele: pede para escolher outro mês.
 * Ex.: boleto de 10/2026 em acordo e ressarcimento de R$ 50,00 lançado depois para 10/2026 → aviso para passar ao próximo boleto em aberto.
 */
export function alertaRessarcimentoEmAcordo(d, c) {
  const credito = alertaCreditoRessarcimento(d, c);
  if (credito) return credito;
  const meses = [...new Set((d.ressarcimentos || []).filter((r) => r.contrato_id === c.id && ressarcimentoConfirmado(r)).map((r) => r.competencia_abatimento))].sort();
  for (const comp of meses) {
    const cb = boletoDoMes(d, c.id, comp);
    // mês sem boleto deste contrato antes da entrada: o ressarcimento não abate em lugar nenhum (depois da saída ou da troca de
    // titular ele é crédito, acima)
    const sem = !cb && semBoletoNoMes(d, c, comp);
    if (sem && sem.motivo === 'entrada') {
      return { nivel: 'aviso', tipo: 'Condomínio', ancora: 'ressarcimentos',
        texto: `Ressarcimento de ${C.reais(ressarcimentosNoBoleto(d, c.id, comp).valor)} marcado para o boleto de ${C.compBr(comp)}, mas ${textoSemBoleto(sem, comp)}: não foi abatido em nenhum boleto. Em "Ressarcimentos", escolha um boleto em aberto deste contrato.` };
    }
    // ressarcimento maior que o boleto: o boleto fica em R$ 0,00 e a sobra não passa sozinha ao próximo. Ex.: aluguel R$ 2.000,00
    // (R$ 1.800,00 em dia) e fundo de obras de R$ 2.500,00 → R$ 700,00 a lançar no próximo boleto
    if (cb && !cb.data_pagamento && !emAcordo(cb)) {
      const sobra = -totais(cb).total_pontual;
      if (sobra > 0) {
        return { nivel: 'aviso', tipo: 'Condomínio', ancora: 'ressarcimentos',
          texto: `O ressarcimento do boleto de ${C.compBr(comp)} (${C.reais(cb.ressarcimento || 0)}) é maior que o boleto: ele fica em R$ 0,00 e sobram ${C.reais(sobra)}. Em "Ressarcimentos", diminua este e lance a sobra no próximo boleto em aberto.` };
      }
    }
    if (!cb || !emAcordo(cb)) continue;
    const falta = ressarcimentosNoBoleto(d, c.id, comp).valor - (cb.ressarcimento || 0);
    if (falta > 0) {
      return { nivel: 'aviso', tipo: 'Condomínio', ancora: 'ressarcimentos',
        texto: `Ressarcimento de ${C.reais(falta)} marcado para o boleto de ${C.compBr(comp)}, que está em acordo: não foi abatido. Em "Ressarcimentos", escolha o próximo boleto em aberto.` };
    }
  }
  return null;
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
 * Etapas do fechamento do mês ``mes`` (mês do calendário). Ex.: outubro/2026:
 * - a partir de 20/10: gerar os boletos do aluguel de 10/2026 (vencem em 11/2026), com a carta de quem reajusta em 10/2026;
 * - no mês: conferir os pagamentos dos boletos que vencem em outubro (aluguel de 09/2026), condomínio e contas;
 * - a partir de 01/11 (depois da virada): lançar as NFs avulsas e do Airbnb de outubro e numerar as NFs de outubro.
 * Cada etapa: { chave, titulo, pendentes, detalhe, link, feito, marcado, aPartirDe, prevista }. Toda etapa fica feita sozinha
 * quando não há pendência e também quando alguém marca (as duas valem para todas, inclusive "contas": decisão do dono E4,
 * 2026-11-07). Antes de ``aPartirDe``, a etapa pendente é só prevista. ``pendentes``: a lista de ``pendentesDeFatura(d)``,
 * quando já calculada no mesmo desenho (o Painel e os meses atrasados usam a mesma).
 */
export function etapasFechamento(d, mes, hoje = C.hojeIso(), { pendentes = null } = {}) {
  const comp = C.somarMeses(mes, -1); // aluguel do mês anterior: boletos que vencem neste mês
  const seguinte = C.somarMeses(mes, 1);
  const marcado = (chave) => d.fechamentos.find((f) => f.competencia === mes && f.etapa === chave) || null;
  const ativos = d.contratos.filter((c) => c.ativo !== false && c.imovel_id);
  // troca de titular à espera do termo assinado: o boleto ainda sai no contrato anterior (como em montarCobranca)
  const semBoleto = ativos.filter((c) => C.diasOcupados(mes, c.data_entrada, c.data_saida) > 0 && !boletoDoMes(d, c.id, mes) && !trocaAguardaAditivo(d, c) && !semDiaAPagar(c, mes));
  // o boleto à parte do complemento da caução não é aluguel: não conta como gerado nem como pagamento do mês
  const gerados = d.cobrancas.filter((x) => x.competencia === mes && !ehBoletoAvulso(x)).length;
  // boletos que vencem neste mês, pelo vencimento (contrato que cobra no próprio mês também entra) e com as parcelas de acordo;
  // o complemento da caução fica de fora (é garantia, tem a etapa própria em Reajustes)
  const doMes = d.cobrancas.filter((x) => String(x.vencimento || '').slice(0, 7) === mes && !ehComplementoCaucao(x));
  const emAberto = doMes.filter(aCobrar);
  const vencidos = emAberto.filter((x) => C.vencido(x.vencimento, hoje));
  // a carta vai junto com o boleto do próprio aluguel corrigido (o índice só sai no começo do mês do reajuste)
  const cartas = ativos.map((c) => reajusteNaCompetencia(d, c, mes, hoje)).filter((r) => r && r.faltaCarta);
  const air = airbnbDoMes(d, mes);
  // ganhos do Airbnb lançados sem a NF do mês (ou com a soma mudada): conta como 1 pendência da etapa das NFs
  const airPendente = air.total > 0 && !air.numerada && (!air.nf || air.divergente) ? 1 : 0;
  const nfs = (pendentes || pendentesDeFatura(d)).filter((x) => String(x.data).slice(0, 7) <= mes).length + airPendente;
  const dia20 = `${mes}-${String(CR.regra('dia_gerar_boletos')).padStart(2, '0')}`;
  // basta uma conta lançada no imóvel (do mês, ou paga no mês): nem todo imóvel tem todas as contas
  const lancou = (i) => d.despesas.some((x) => x.imovel_id === i.id && (x.competencia === mes || String(x.data_pagamento || '').slice(0, 7) === mes));
  const comConta = d.imoveis.filter((i) => contasPermitidas(d, i.id, mes).tipos.length);
  const contas = comConta.filter((i) => !lancou(i));
  const etapas = [
    { chave: 'boletos', titulo: `Gerar os boletos de ${C.compBr(mes)} (vencem em ${C.compBr(seguinte)}), a partir de ${C.dataBr(dia20)}`, pendentes: semBoleto.length, aPartirDe: dia20,
      detalhe: semBoleto.length ? `sem boleto: ${semBoleto.map((c) => c.inquilino_nome).join(', ')}` : `${gerados} boleto(s) gerado(s)`, link: `#/cobrancas?comp=${mes}` },
    { chave: 'cartas', titulo: `Corrigir os aluguéis de ${C.compBr(mes)} e enviar a carta de reajuste com o boleto`, pendentes: cartas.length, aPartirDe: dia20,
      detalhe: cartas.length ? `${cartas.length} carta(s) a enviar${cartas.some((r) => !r.corrigido) ? `, ${cartas.filter((r) => !r.corrigido).length} ainda sem correção` : ''}` : 'nenhuma carta pendente', link: `#/reajustes?mes=${mes}` },
    { chave: 'pagamentos', titulo: `Conferir os pagamentos dos boletos que vencem em ${C.compBr(mes)} (aluguel de ${C.compBr(comp)} e parcelas de acordo)`, pendentes: emAberto.length,
      // o "Abrir" mostra os boletos do aluguel de ``comp``: os contados que não estão nessa lista são ditos aqui (2026-11-20)
      detalhe: emAberto.length ? `${emAberto.length} em aberto${vencidos.length ? `, ${vencidos.length} vencido(s)` : ''}${(() => {
        const fora = emAberto.filter((x) => x.competencia !== comp);
        const nome = (x) => (buscar(d, 'contratos', x.contrato_id) || {}).inquilino_nome || 'sem inquilino';
        return fora.length ? `; fora da lista dos boletos de ${C.compBr(comp)}: ${fora.map((x) => `${nome(x)} (${ehParcelaAcordo(x) ? 'parcela de acordo' : `boleto de ${C.compBr(x.competencia)}`}, vence ${C.dataBr(x.vencimento)})`).join(', ')}` : '';
      })()}` : 'todos pagos', link: `#/cobrancas?comp=${comp}` },
    // extrato por arquivo (C6 ainda desligado ou conta de outro banco) também entra no fechamento (2026-11-20)
    ...(contasDoExtrato(d).length ? [(() => {
      const b = pendenciasBancoDoMes(d, mes, hoje);
      // mês já fechado: o extrato precisa chegar ao fim do mês; mês corrente: basta ter sido buscado nos últimos dias
      const buscado = (x) => (!x.importadoAte ? 'extrato ainda não buscado' : b.mesFechado ? `extrato buscado só até ${C.dataBr(x.importadoAte)}, falta até o fim do mês`
        : `extrato buscado em ${C.dataBr(x.importadoAte)}, há mais de ${CR.regra('dias_extrato_recente')} dias: busque de novo`);
      return { chave: 'banco', titulo: `Conferir o extrato de ${C.compBr(mes)} das contas (${b.porConta.map((x) => x.apelido).join(' e ') || 'banco'}) e dar destino às movimentações`,
        pendentes: b.semDestino + b.contasSemImportar.length, link: `#/banco?mes=${mes}`, contas: b.porConta,
        // comprovantes não baixados e pagamentos pelo banco sem resposta são só aviso: não seguram a etapa
        detalhe: b.porConta.length ? b.porConta.map((x) => `${x.apelido}: ${x.semImportar ? buscado(x) : x.semDestino ? `${x.semDestino} sem destino` : 'tudo com destino'}`).join(' · ')
          + (b.semComprovante ? ` · ${b.semComprovante} comprovante(s) não baixado(s)` : '') + (b.pagamentosPendentes ? ` · ${b.pagamentosPendentes} pagamento(s) pelo banco sem confirmação` : '')
          + (b.mesFechado ? '' : ` (no mês corrente, a etapa fica feita com o extrato buscado nos últimos ${CR.regra('dias_extrato_recente')} dias e tudo com destino)`) : 'nenhuma conta configurada' };
    })()] : []),
    { chave: 'nfs', titulo: `Lançar as NFs avulsas e do Airbnb de ${C.compBr(mes)} e numerar as NFs de ${C.compBr(mes)}, a partir de ${C.dataBr(`${seguinte}-01`)} (depois da virada do mês)`,
      pendentes: nfs, aPartirDe: `${seguinte}-01`, detalhe: [airPendente ? `gerar a NF do Airbnb (${C.reais(air.total)}) em Financeiro` : '', nfs - airPendente ? `${nfs - airPendente} pagamento(s) aguardando número` : ''].filter(Boolean).join(' · ') || 'nada aguardando número',
      link: airPendente ? `#/financeiro?mes=${mes}` : `#/faturas?mes=${mes}` },
    (() => {
      // o condomínio de ``comp`` (o boleto dele vence no começo de ``mes``) chega antes do fim de ``comp``: conta desde já,
      // e não só depois que o mês acaba (24/11/2026, dados reais: Ascot de 11/2026, vence em 05/12, chegou em 24/11)
      // (mês ainda por vir: a etapa fica prevista até o 1º dia dele, ``aPartirDe``)
      const conferir = ativos.filter((c) => condominioAConferir(c, hoje, { ate: comp }));
      // um botão por inquilino que paga o condomínio (o de cada imóvel), feito ou não: o "Abrir" leva sempre à caixa dos
      // ressarcimentos do inquilino certo, e não à lista dos inquilinos (antes, com zero ou vários, abria #/inquilinos)
      const pagam = ativos.filter((c) => inquilinoPagaCondominio(c) && contratoAtivo(c, hoje));
      const ordem = [...conferir, ...pagam.filter((c) => !conferir.includes(c))];
      return { chave: 'condominio', titulo: `Conferir as taxas do condomínio de ${C.compBr(comp)} (boleto do condomínio que vence em ${C.compBr(mes)}; ressarcimento ao inquilino)`, pendentes: conferir.length,
        aPartirDe: `${comp}-01`,
        detalhe: conferir.length ? `a conferir: ${conferir.map((c) => c.inquilino_nome).join(', ')}` : pagam.length ? 'nada a conferir' : 'nenhum inquilino paga o condomínio',
        link: ordem.length === 1 ? `#/contrato/${ordem[0].id}?ir=ressarcimentos` : null,
        contratos: ordem.length > 1 ? ordem.map((c) => ({ id: c.id, conferir: conferir.includes(c) })) : [] }; // com mais de um, a tela põe um botão por inquilino
    })(),
    { chave: 'contas', titulo: `Lançar as contas pagas por nós de ${C.compBr(mes)}`, pendentes: contas.length,
      detalhe: contas.length ? `sem lançamento: ${contas.map((i) => i.nome).join(', ')}` : comConta.length ? `${comConta.length} imóvel(is) com conta lançada` : 'nenhum imóvel com conta nossa', link: '#/resultados', imoveis: contas.map((i) => i.id) },
  ];
  for (const e of etapas) {
    e.marcado = marcado(e.chave);
    e.feito = !!e.marcado || !e.pendentes;
    e.prevista = !e.feito && !!e.aPartirDe && hoje < e.aPartirDe;
  }
  return etapas;
}

/** O Painel cobra as etapas atrasadas de até este número de meses anteriores (e nunca de antes da criação do banco de dados). */
export const MESES_FECHAMENTO_ATRASADO = 12;

/**
 * Etapas ainda não feitas dos fechamentos dos meses anteriores a ``mesAtual`` (do mais antigo ao mais novo), cada uma com
 * ``mes``. Ex.: em 07/11/2026, as NFs de 10/2026 e as contas de 09/2026 ainda não lançadas. Olha os meses desde a criação
 * do banco de dados (no máximo MESES_FECHAMENTO_ATRASADO), para não cobrar meses de antes do sistema.
 */
export function etapasAtrasadas(d, mesAtual, hoje = C.hojeIso(), { pendentes = null } = {}) {
  const inicio = [String(d.criado_em || '').slice(0, 7), C.somarMeses(mesAtual, -MESES_FECHAMENTO_ATRASADO)].sort().pop();
  const out = [];
  // os pagamentos à espera de NF são os mesmos em todos os meses: procurados uma vez só
  const pend = pendentes || pendentesDeFatura(d);
  for (let mes = inicio; mes < mesAtual; mes = C.somarMeses(mes, 1)) {
    out.push(...etapasFechamento(d, mes, hoje, { pendentes: pend }).filter((e) => !e.feito && !e.prevista).map((e) => ({ ...e, mes })));
  }
  return out;
}

/** Marca (ou desmarca) uma etapa do fechamento como feita. */
export function marcarEtapaFechamento(d, mes, etapa, feito, usuario) {
  const atual = d.fechamentos.find((f) => f.competencia === mes && f.etapa === etapa);
  if (feito && !atual) inserir(d, 'fechamentos', { competencia: mes, etapa, feito_em: C.hojeIso() }, usuario, `Fechamento de ${C.compBr(mes)}: etapa "${etapa}" feita`);
  if (!feito && atual) excluir(d, 'fechamentos', atual.id, usuario, `Fechamento de ${C.compBr(mes)}: etapa "${etapa}" desmarcada`);
}

/** Baixa em lote: confirma como "pagou em dia" os boletos escolhidos, com a data em que o dinheiro entrou. */
export function baixarEmLote(d, ids, dataContabil, usuario, { pagouEmDia = true, dataPagou = null } = {}) {
  const feitos = [];
  const pulados = [];
  for (const id of ids) {
    const cb = buscar(d, 'cobrancas', id);
    if (!cb || !aCobrar(cb)) { if (cb) pulados.push(cb); continue; }
    // atrasados em lote: todos pagaram no mesmo dia (``dataPagou``); multa e juros saem do cálculo de sempre, pelo valor previsto
    registrarPagamento(d, cb.id, dataContabil, null, usuario, { pagouEmDia, dataPagou: pagouEmDia ? null : dataPagou });
    feitos.push(cb);
  }
  return { feitos, pulados };
}

// --------------------------------------------------------------------------
// Calendário do mês: tudo que vence ou acontece no mês
// --------------------------------------------------------------------------
/** Situação de um boleto no calendário: [cor, texto]. Pago, em acordo, carência, vencido (``C.vencido``) ou em aberto. */
export function situacaoNoCalendario(cb, hoje = C.hojeIso()) {
  if (cb.data_pagamento) return ['ok', `pago em ${C.dataBr(cb.data_pagamento)}`];
  if (emAcordo(cb)) return ['neutra', 'em acordo'];
  if (cb.situacao === 'Carência') return ['neutra', 'carência'];
  return C.vencido(cb.vencimento, hoje) ? ['perigo', 'vencido'] : ['aviso', 'em aberto'];
}

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
      // sem boleto e com a troca de titular à espera do termo: nada previsto (o boleto sai no contrato anterior)
      if (!cb && trocaAguardaAditivo(d, c)) continue;
      const venc = cb ? cb.vencimento : vencimentoDoContrato(d, c, comp);
      if (!no(venc)) continue;
      // em acordo (valem as parcelas) e carência (nada a pagar) ficam neutros, nunca "vencido"
      const [situacao, estado] = !cb ? ['neutra', 'previsto'] : situacaoNoCalendario(cb, hoje);
      ev.push({ data: venc, tipo: 'Boleto', imovel_id: c.imovel_id, contrato_id: c.id, cobranca_id: cb ? cb.id : null, competencia: comp,
        texto: `${c.inquilino_nome} · aluguel de ${C.compBr(comp)}${cb ? ` · ${C.reais(totais(cb).a_pagar_pontual)}` : ' · boleto ainda não gerado'}${geraNf(c) ? '' : ' · boleto de controle'}`,
        situacao, estado });
    }
  }
  // boletos à parte: complemento da caução e parcelas de acordo
  for (const cb of d.cobrancas.filter((x) => ehBoletoAvulso(x) && no(x.vencimento))) {
    const c = buscar(d, 'contratos', cb.contrato_id);
    if (!c) continue;
    const [situacao, estado] = situacaoNoCalendario(cb, hoje);
    ev.push({ data: cb.vencimento, tipo: 'Boleto', imovel_id: c.imovel_id, contrato_id: c.id, cobranca_id: cb.id,
      texto: ehComplementoCaucao(cb) ? `${c.inquilino_nome} · complemento da caução · ${C.reais(cb.caucao_complemento)}`
        : `${c.inquilino_nome} · acordo${cb.acordo_parcela ? ` ${cb.acordo_parcela}` : ''} · ${C.reais(totais(cb).a_pagar_sem_desconto)}`,
      situacao, estado });
  }
  // IPTU na prefeitura (o IPTU cujas guias não vencem neste mês é pulado sem calcular a parte de cada inquilino)
  const baseDe = basesIptu(d);
  for (const p of d.iptus) {
    const primeira = p.vencimento_primeira;
    if (!primeira || primeira > fim) continue;
    const ultima = p.pago_avista ? primeira : C.somarMesesData(primeira, Math.max(0, Math.trunc(Number(p.num_parcelas) || 0) - 1));
    if (ultima < ini) continue;
    for (const pc of parcelasIptu(d, p, baseDe(p.imovel_id))) {
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
    const renovado = d.seguros.some((x) => x.contrato_id === s.contrato_id && x.vigencia_fim > s.vigencia_fim);
    ev.push({ data: s.vigencia_fim, tipo: 'Seguro', imovel_id: s.imovel_id, contrato_id: s.contrato_id, texto: `${nomeImovel(s.imovel_id)} · fim do seguro${s.seguradora ? ` ${s.seguradora}` : ''}`,
      situacao: renovado ? 'ok' : 'aviso', estado: renovado ? 'renovado' : 'renovar' });
  }
  for (const c of d.contratos.filter((x) => contratoAtivo(x, hoje) && x.imovel_id)) {
    // reajuste: no vencimento do boleto do próprio aluguel corrigido (é com ele que vai a carta)
    // troca de titular: o reajuste de antes da entrada do novo titular é do contrato anterior (como em ``reajustesAbertos``)
    const herdado = contratoHerdado(d, c) && c.data_entrada ? c.data_entrada.slice(0, 7) : '';
    for (const comp of [C.somarMeses(mes, -1), mes]) {
      if (comp < herdado) continue;
      const r = reajusteNaCompetencia(d, c, comp, hoje);
      if (!r) continue;
      const venc = vencimentoDoReajuste(d, c, comp);
      if (!no(venc)) continue;
      ev.push({ data: venc, tipo: 'Reajuste', imovel_id: c.imovel_id, contrato_id: c.id,
        texto: `${c.inquilino_nome} · carta de reajuste com este boleto · aluguel de ${C.compBr(comp)} corrigido (${r.anos} ano(s), ${c.indice_correcao || 'índice do contrato'})`,
        situacao: !r.faltaCarta ? 'ok' : r.corrigido ? 'neutra' : 'aviso', estado: !r.faltaCarta ? 'carta enviada' : r.corrigido ? 'enviar carta' : 'corrigir e enviar carta' });
    }
    const fimC = c.prazo_tipo !== 'Indeterminado' ? fimDoContrato(d, c) || c.vigencia_fim : null;
    if (no(fimC)) {
      ev.push({ data: fimC, tipo: 'Fim do contrato', imovel_id: c.imovel_id, contrato_id: c.id, texto: `${c.inquilino_nome} · fim do prazo do contrato`, situacao: 'aviso', estado: 'renovar ou sair' });
    }
    for (const f of d.fiadores.filter((x) => x.contrato_id === c.id && no(x.data_saida) && !x.substituido_por_id)) {
      ev.push({ data: f.data_saida, tipo: 'Fiador', imovel_id: c.imovel_id, contrato_id: c.id, texto: `${c.inquilino_nome} · fim do vínculo do fiador ${f.nome}`, situacao: 'aviso', estado: 'providenciar' });
    }
  }
  // fechamento do mês: no dia 20, gerar os boletos (vencem no mês seguinte); no dia 1º, as NFs do mês anterior (depois da
  // virada); no último dia, quantas etapas faltam (as ainda previstas não contam). Sem contrato nenhum (sistema começando),
  // não há fechamento: o Painel mostra os primeiros passos em vez de "Fechamento concluído"
  if (fim >= `${hoje.slice(0, 7)}-01` && d.contratos.length) {
    const pendentes = pendentesDeFatura(d);
    const etapas = etapasFechamento(d, mes, hoje, { pendentes });
    const passo = (e, fech) => ({ situacao: e.feito ? 'ok' : e.prevista ? 'neutra' : 'aviso', estado: e.feito ? 'feito' : e.prevista ? 'previsto' : 'a fazer', fechamento: fech });
    const bol = etapas.find((e) => e.chave === 'boletos');
    ev.push({ data: bol.aPartirDe, tipo: 'Fechamento', texto: `gerar os boletos de ${C.compBr(mes)} (vencem em ${C.compBr(C.somarMeses(mes, 1))})`, ...passo(bol, mes) });
    const anterior = C.somarMeses(mes, -1);
    const nf = etapasFechamento(d, anterior, hoje, { pendentes }).find((e) => e.chave === 'nfs');
    ev.push({ data: `${mes}-01`, tipo: 'Fechamento', texto: `NFs avulsas/Airbnb e numerar as NFs de ${C.compBr(anterior)}`, ...passo(nf, anterior) });
    const faltam = etapas.filter((e) => !e.feito && !e.prevista).length;
    ev.push({ data: fim, tipo: 'Fechamento', texto: faltam ? `${faltam === 1 ? 'falta' : 'faltam'} ${faltam} de ${C.plural(etapas.length, 'etapa')}` : 'concluído',
      situacao: faltam ? (fim < hoje ? 'perigo' : 'aviso') : 'ok', estado: faltam ? 'a fazer' : 'feito', fechamento: mes });
  }
  const ordem = { Boleto: 0, Reajuste: 1, IPTU: 2, Seguro: 3, 'Fim do contrato': 4, Fiador: 5, Fechamento: 6 };
  return ev.sort((a, b) => a.data.localeCompare(b.data) || ordem[a.tipo] - ordem[b.tipo] || a.texto.localeCompare(b.texto, 'pt-BR'));
}

// --------------------------------------------------------------------------
// Reajuste anual: corrigido no 13º mês, com a carta junto do boleto do aluguel já corrigido
// --------------------------------------------------------------------------
/**
 * Mês de aniversário do contrato (1º mês): o mês em que o inquilino entrou (data-base), seja qual for o dia
 * (dia 1º, 15 ou 30 contam igual). O reajuste vale no 13º mês: o aluguel do mesmo mês, um ano depois.
 */
export function mesDeAniversario(c) {
  const base = dataBaseCorrecao(c);
  if (!base) return null;
  // regra do administrador (`reajuste_inicio`): entrada depois do dia 1º → o 1º mês é o seguinte (nunca menos de 1 ano)
  return CR.regra('reajuste_inicio', c) === 'mes_seguinte' && base.slice(8, 10) !== '01' ? C.somarMeses(base.slice(0, 7), 1) : base.slice(0, 7);
}

/** Competência (aluguel de) do n-ésimo reajuste: o 13º mês, o 25º... */
export const competenciaDoReajuste = (c, n) => { const p = mesDeAniversario(c); return p ? C.somarMeses(p, 12 * n) : null; };

/**
 * Correção já registrada para o reajuste da competência: aceita registro de até 3 meses antes até 1 mês depois
 * (contratos que entraram no meio do mês e foram corrigidos pela regra antiga, no mês seguinte).
 */
const correcaoDoReajuste = (d, c, comp, lista = correcoesDo(d, c.id)) => lista.find((x) => x.data_vigencia >= `${C.somarMeses(comp, -3)}-01` && x.data_vigencia <= `${C.somarMeses(comp, 1)}-31`)
  // novo valor negociado (pedido do dono, 2026-11-13): substitui o reajuste em aberto, mesmo combinado meses depois do aniversário
  // (até o próximo). Ex.: reajuste de 08/2026 em aberto, novo valor negociado a partir de 01/11/2026 → o reajuste de 08/2026 sai da lista
  || lista.find((x) => x.indice === 'Negociado' && x.data_vigencia >= `${comp}-01` && x.data_vigencia < `${C.somarMeses(comp, 12)}-01`) || null;
const cartaDoReajuste = (d, c, comp, cartas = d.cartas_reajuste) => cartas.find((x) => x.contrato_id === c.id && x.competencia === comp) || null;

/**
 * Reajustes de antes deste aluguel seguiam a regra antiga (carta com o boleto anterior): os já corrigidos não pedem carta.
 * A partir dele, a carta vai junto com o boleto do próprio aluguel corrigido, porque o índice acumulado até o mês
 * anterior só sai no começo do mês do reajuste (depois de emitido o boleto anterior).
 */
export const CARTA_COM_BOLETO_CORRIGIDO_DESDE = '2026-11';

/**
 * Se a competência é a de um reajuste do contrato: { n, anos, competencia, corrigido, carta, comCarta, faltaCarta }.
 * Carta só nos reajustes do ano corrente ou cujo boleto ainda não venceu (``comCarta``); os anteriores pedem só a correção.
 * ``doContrato``: { correcoes, cartas } do contrato já separadas, quando vários anos são vistos de uma vez (``reajustesAbertos``).
 */
export function reajusteNaCompetencia(d, c, comp, hoje = C.hojeIso(), doContrato = null) {
  const p = mesDeAniversario(c);
  if (!p || c.prazo_tipo === 'Sem reajuste') return null;
  const meses = C.mesesEntre(p, comp);
  if (meses <= 0 || meses % 12 !== 0) return null;
  const n = meses / 12;
  let corrigido = correcaoDoReajuste(d, c, comp, doContrato ? doContrato.correcoes : undefined);
  let carta = cartaDoReajuste(d, c, comp, doContrato ? doContrato.cartas : undefined);
  // troca de titular no meio do mês do reajuste (ex.: reajuste de 03/2027 aplicado em João, Maria entra em 15/03/2027): a correção
  // ficou no anterior e o aluguel herdado já é o corrigido; conta como feita aqui (senão o reajuste seria aplicado duas vezes, CON-03)
  for (let a = contratoHerdado(d, c), voltas = 0; a && (!corrigido || !carta) && voltas < 10; a = contratoHerdado(d, a), voltas += 1) {
    corrigido = corrigido || correcaoDoReajuste(d, a, comp);
    carta = carta || cartaDoReajuste(d, a, comp);
  }
  // reajuste do fim do ano (decisão do dono de 2026-11-24, CON-06): a carta continua pedida até vencer o boleto que leva o
  // reajuste. Ex.: reajuste de 12/2026, boleto que vence 10/01/2027 → a carta é pedida até 10/01/2027
  const comCarta = comp.slice(0, 4) >= hoje.slice(0, 4)
    || (comp >= C.somarMeses(C.competenciaDe(hoje), -3) && ((v) => !!v && !C.vencido(v, hoje))(vencimentoDoReajuste(d, c, comp)));
  return { n, anos: n, competencia: comp, corrigido, carta, comCarta, faltaCarta: comCarta && !carta && !(corrigido && corrigido.indice === 'Negociado') && (!corrigido || comp >= CARTA_COM_BOLETO_CORRIGIDO_DESDE) };
}

/** Vencimento do boleto do aluguel corrigido (é com ele que vai a carta). */
export function vencimentoDoReajuste(d, c, comp) {
  const cb = boletoDoMes(d, c.id, comp);
  return cb ? cb.vencimento : vencimentoDoContrato(d, c, comp);
}

/** Próximo reajuste a tratar: o último que já devia ter acontecido (ou acontece no mês seguinte), sem correção ou sem carta. */
export function reajustePendente(d, c, hoje = C.hojeIso(), meses = 1) {
  const p = mesDeAniversario(c);
  if (!p) return null;
  const limite = C.somarMeses(C.competenciaDe(hoje), meses);
  const n = Math.floor(C.mesesEntre(p, limite) / 12);
  if (n < 1) return null;
  const r = reajusteNaCompetencia(d, c, competenciaDoReajuste(c, n), hoje);
  // troca de titular: reajuste de antes da entrada do novo titular é do contrato anterior (já está no aluguel herdado)
  if (r && contratoHerdado(d, c) && c.data_entrada && r.competencia < c.data_entrada.slice(0, 7)) return null;
  return r && (!r.corrigido || r.faltaCarta) ? r : null;
}

/**
 * Quem saiu (ou teve fim do vínculo na troca de titular) deve deixar de estar ativo: quando a data já passou e o boleto do
 * último mês já existe (para não deixar de gerar o aluguel proporcional desse mês). Só confere; não grava.
 */
export function deveDesativar(d, c, hoje = C.hojeIso()) {
  if (c.ativo === false || !c.data_saida || c.data_saida >= hoje) return false;
  if (c.imovel_id && !boletoDoMes(d, c.id, c.data_saida.slice(0, 7)) && C.diasOcupados(c.data_saida.slice(0, 7), c.data_entrada, c.data_saida) > 0) return false;
  return true;
}

/** Inativa quem saiu quando ``deveDesativar``; registra no histórico (``usuario`` vazio: "sistema"). */
export function desativarSeSaiu(d, c, usuario = null, hoje = C.hojeIso()) {
  if (!deveDesativar(d, c, hoje)) return false;
  atualizar(d, 'contratos', c.id, { ativo: false }, usuario || 'sistema', `${c.inquilino_nome}: inativo (${fimDeVinculo(d, c) ? 'fim do vínculo' : 'saída'} em ${C.dataBr(c.data_saida)})`);
  return true;
}

/**
 * Contrato renovado com nova data de término: o fim e o prazo são os da renovação. Até 09/11/2026 a edição do cadastro
 * gravava de volta o início + prazo (ex.: 05/03/2024, 30 meses, renovado até 05/09/2028 e editado o telefone → 05/09/2026)
 * e a renovação não mudava o prazo em meses. Devolve o que acertar ({ vigencia_fim, prazo_meses }) ou null. O fim só volta
 * quando é o início + prazo (o que a edição gravava). Só nos contratos ativos (os encerrados ficam como estão, no histórico).
 */
function acertoDaRenovacao(d, c) {
  const fim = c.ativo !== false && fimRenovado(d, c);
  if (!fim || c.prazo_tipo === 'Indeterminado') return null;
  const inicio = c.data_entrada || c.vigencia_inicio;
  const mud = {};
  if (c.vigencia_fim !== fim && inicio && c.prazo_meses > 0 && c.vigencia_fim === C.fimDoPrazo(inicio, c.prazo_meses)) mud.vigencia_fim = fim;
  const meses = prazoDoContrato(d, c);
  if ((mud.vigencia_fim || c.vigencia_fim) === fim && meses > 0 && meses !== c.prazo_meses) mud.prazo_meses = meses;
  return Object.keys(mud).length ? mud : null;
}

/**
 * Rotina de abertura (C9, 2026-11-07): regras de negócio que antes rodavam caladas em ``normalizar`` passam pelo histórico com o
 * usuário que abriu o sistema. Ex.: Maria saiu em 15/07 e o boleto de julho já existe → em 01/08 o contrato fica inativo
 * "por julio"; os depósitos da caução chegaram a R$ 4.050,00 → a caução fica registrada como depositada. Com
 * ``soConferir``, só conta o que mudaria (para a tela não gravar à toa). Devolve o número de ajustes.
 */
export function rotinaDeAbertura(d, usuario, { hoje = C.hojeIso(), soConferir = false } = {}) {
  let n = 0;
  for (const c of d.contratos) {
    // "possui termo aditivo" só com termo registrado (assinado ou perdido): a marca antiga (vencimento/garantia) sai
    if (!!c.possui_aditivos !== (aditivosValidos(d, c.id).length > 0)) { n += 1; if (!soConferir) marcarAditivos(d, c.id, usuario); }
    if (deveDesativar(d, c, hoje)) { n += 1; if (!soConferir) desativarSeSaiu(d, c, usuario, hoje); }
    const renovacao = acertoDaRenovacao(d, c);
    if (renovacao) {
      n += 1;
      const fim = C.dataBr(fimRenovado(d, c));
      if (!soConferir) atualizar(d, 'contratos', c.id, renovacao, usuario, `${c.inquilino_nome}: ${[renovacao.vigencia_fim && `fim do contrato volta ao da renovação (${fim})`,
        renovacao.prazo_meses && `prazo de ${renovacao.prazo_meses} meses, como na renovação até ${fim}`].filter(Boolean).join('; ')}`);
    }
    if (!(d.depositos_garantia || []).length) continue;
    for (const qual of ['caucao', 'deposito']) {
      if (!(qual === 'caucao' ? temCaucao(c) : temDeposito(c)) || !depositosCompletam(d, c, qual)) continue;
      n += 1;
      if (!soConferir) completarPorDepositos(d, c, qual, usuario);
    }
  }
  // adiamentos de alerta vencidos (ou de alerta que já não existe): saem, com histórico
  for (const x of adiamentosVencidos(d, hoje)) { n += 1; if (!soConferir) excluir(d, 'adiamentos_alerta', x.id, usuario, `Adiamento do alerta "${x.tipo}" encerrado (até ${C.dataBr(x.ate)})`); }
  // alerta desligado de inquilino ou imóvel que foi excluído: sai
  for (const x of desligamentosOrfaos(d)) { n += 1; if (!soConferir) excluir(d, 'alertas_desligados', x.id, usuario, `Alerta "${x.tipo}" desligado: o inquilino ou imóvel não existe mais`); }
  // movimentação do banco apontando para despesa, boleto, IPTU, guia ou reforma que não existe mais: perde o destino (item 20)
  for (const { m, campos } of vinculosBancoOrfaos(d)) {
    n += 1;
    if (!soConferir) atualizar(d, 'movimentacoes_banco', m.id, campos, usuario, `Movimentação de ${C.dataBr(m.data)} (${C.reais(m.valor)}): o destino foi excluído, volta a ficar sem destino`);
  }
  return n;
}

/** Destino de cada classificação do extrato: campo da movimentação e a tabela para onde ele aponta. */
const DESTINOS_MOVIMENTACAO = { conta_imovel: ['despesa_id', 'despesas'], boleto: ['cobranca_id', 'cobrancas'], iptu: ['iptu_id', 'iptus'], imposto: ['guia_imposto_id', 'guias_impostos'], reforma: ['reforma_id', 'reformas'] };
/** Movimentações com destino que sumiu: [{ m, campos }] (os campos a limpar; a classificação sai se era dela o destino). */
export function vinculosBancoOrfaos(d) {
  const ids = Object.fromEntries(Object.values(DESTINOS_MOVIMENTACAO).map(([, t]) => [t, new Set((d[t] || []).map((x) => x.id))]));
  const out = [];
  for (const m of d.movimentacoes_banco || []) {
    const campos = {};
    for (const [classe, [campo, t]] of Object.entries(DESTINOS_MOVIMENTACAO)) {
      if (!m[campo] || ids[t].has(m[campo])) continue;
      campos[campo] = null;
      if (campo === 'iptu_id') campos.iptu_parcela = null;
      // a devolução ao inquilino também aponta para o boleto (cobranca_id): sem ele, perde o destino
      if (m.classificacao === classe || (classe === 'boleto' && m.classificacao === 'devolucao_inquilino')) campos.classificacao = null;
    }
    if (Object.keys(campos).length) out.push({ m, campos });
  }
  return out;
}

/**
 * Alerta do reajuste do aluguel de X: no mês anterior, só o aviso (o índice acumulado até X-1 sai no começo de X);
 * no mês X, corrigir antes de gerar o boleto de X e mandar a carta junto com ele; depois disso, atrasado.
 */
function alertaReajuste(d, c, hoje) {
  const r = reajustePendente(d, c, hoje, CR.regra('antecedencia_reajuste', c));
  if (!r) return null;
  const mesHoje = C.competenciaDe(hoje);
  const indice = c.indice_correcao || 'índice do contrato';
  const comp = C.compBr(r.competencia);
  const venc = vencimentoDoReajuste(d, c, r.competencia);
  const comBoleto = `junto com o boleto do aluguel de ${comp} (vence em ${C.dataBr(venc)})`;
  if (r.corrigido) {
    return { nivel: C.vencido(venc, hoje) ? 'perigo' : 'aviso', tipo: 'Reajuste do aluguel',
      texto: `O aluguel de ${comp} já foi corrigido pelo ${indice}. Envie a carta de reajuste ${comBoleto}.` };
  }
  if (r.competencia < mesHoje) {
    return { nivel: 'perigo', tipo: 'Reajuste do aluguel',
      texto: `O aluguel de ${comp} (${r.anos} ano(s), 13º mês) já devia estar corrigido pelo ${indice}. Aplique a correção na tela Reajustes${r.comCarta ? ' e envie a carta' : ''}.` };
  }
  const ref = C.compBr(C.somarMeses(r.competencia, -1));
  return { nivel: 'aviso', tipo: 'Reajuste do aluguel',
    texto: r.competencia > mesHoje
      ? `O aluguel de ${comp} será corrigido pelo ${indice} (${r.anos} ano(s) de contrato). O índice acumulado até ${ref} sai no começo de ${comp}: aí aplique a correção e envie a carta ${comBoleto}.`
      : `Corrija o aluguel de ${comp} pelo ${indice} (${r.anos} ano(s) de contrato): informe o índice acumulado até ${ref} e aplique a correção antes de gerar o boleto. A carta vai ${comBoleto}.` };
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
  // só vale o acumulado até o mês anterior ao corrigido: um mais velho (ex.: só até 05/2025 para o reajuste de 06/2026) conta
  // como faltando (fica em `ultimo`, para a tela dizer até quando está cadastrado)
  const usados = partes.map((p) => { const x = indiceAcumulado(d, p, ref); return { indice: p, registro: x && x.mes_ref === ref ? x : null, ultimo: x }; });
  const faltando = usados.filter((u) => !u.registro).map((u) => u.indice);
  let escolhido = null;
  if (!faltando.length && usados.length) {
    const menor = /menor/i.test(nome);
    escolhido = usados.reduce((a, b) => (!a || (menor ? b.registro.percentual < a.registro.percentual : b.registro.percentual > a.registro.percentual) ? b : a), null);
  }
  const atual = aluguelAtual(d, c, C.somarDias(`${comp}-01`, -1));
  const pctBonif = percentualBonificacao(c);
  const bonif = (v) => v - C.descontoPorPercentual(v, pctBonif);
  // índice negativo: o aluguel fica igual, como diz o contrato (decisão do dono, 16/11/2026). Ex.: IGP-M -1,5% → 0%
  const doIndice = escolhido ? escolhido.registro.percentual : null;
  const pct = doIndice === null ? null : Math.max(doIndice, 0);
  const novo = pct === null ? null : C.aplicarCorrecao(atual, pct);
  return { indiceContrato: nome, usados, faltando, escolhido, percentual: pct, percentualDoIndice: doIndice, indiceNegativo: doIndice !== null && doIndice < 0 ? doIndice : null, atual, novo, atualBonificado: bonif(atual),
    novoBonificado: novo === null ? null : bonif(novo), bonificacao: pctBonif > 0, competencia: comp };
}

/**
 * Registra a correção do reajuste no contrato (vale a partir do dia 1º da competência). ``manual``: sem o índice
 * cadastrado (ex.: reajuste de ano anterior), o percentual ou o novo valor digitado ({ percentual } ou { valor_novo }).
 */
export function aplicarReajuste(d, contratoId, comp, usuario, manual = null) {
  const c = buscar(d, 'contratos', contratoId);
  exigirAditivoDaTroca(d, c);
  const r = calcularReajuste(d, c, comp);
  if (correcaoDoReajuste(d, c, comp)) throw new Error('Este reajuste já foi registrado.');
  const depois = correcoesDo(d, c.id).find((x) => x.data_vigencia > `${comp}-01`);
  if (depois) throw new Error(`Já existe correção posterior (${C.dataBr(depois.data_vigencia)}): desfaça-a antes de aplicar a de ${C.compBr(comp)}.`);
  // na ordem: o reajuste de um ano anterior ainda sem correção vem antes
  const herdado = contratoHerdado(d, c) && c.data_entrada ? c.data_entrada.slice(0, 7) : '';
  for (let n = 1, x = competenciaDoReajuste(c, 1); x && x < comp; n += 1, x = competenciaDoReajuste(c, n)) {
    if (x >= herdado && contratoAtivo(c, `${x}-01`) && !correcaoDoReajuste(d, c, x)) throw new Error(`Aplique antes o reajuste de ${C.compBr(x)}.`);
  }
  const digitado = manual && (manual.percentual !== null && manual.percentual !== undefined || manual.valor_novo > 0);
  if (!digitado && r.percentual === null) throw new Error(`Informe o índice acumulado de ${r.faltando.join(' e ') || c.indice_correcao || 'do contrato'} (até ${C.compBr(C.somarMeses(comp, -1))}) ou digite o % ou o novo valor.`);
  let { percentual, novo } = { percentual: r.percentual, novo: r.novo };
  if (digitado) {
    novo = manual.valor_novo > 0 ? manual.valor_novo : C.aplicarCorrecao(r.atual, manual.percentual);
    percentual = manual.valor_novo > 0 ? (r.atual ? C.percentualPorDesconto(r.atual, novo - r.atual) : 0) : manual.percentual;
  }
  // digitado com o índice cadastrado (ex.: IGP-M 4,37% arredondado para 4,5%): guarda também o % do índice, para a carta
  const indice = r.escolhido ? r.escolhido.indice : (r.indiceContrato || 'Informado');
  return inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: `${comp}-01`, indice, indice_contrato: r.indiceContrato,
    data_indice: r.escolhido ? r.escolhido.registro.mes_ref : null, percentual_indice: r.escolhido && (digitado || r.indiceNegativo !== null) ? r.percentualDoIndice : null,
    digitado: digitado || null, percentual, valor_anterior: r.atual, valor_novo: novo,
    observacoes: `Reajuste do 13º mês (${C.compBr(comp)})${digitado ? ', % ou valor digitado' : ''}` }, usuario, `Reajuste ${C.compBr(comp)}: ${C.reais(r.atual)} → ${C.reais(novo)} (${indice} ${C.pct(percentual)})`);
}

/**
 * Desfaz a correção de um reajuste (tela Reajustes): só a mais recente do contrato e sem complemento da caução já pago.
 * Os boletos do complemento ainda em aberto e a caução confirmada para este reajuste saem junto. Devolve a correção apagada.
 */
export function desfazerReajuste(d, correcaoId, usuario) {
  const x = buscar(d, 'correcoes', correcaoId);
  if (!x) throw new Error('Correção não encontrada.');
  if (x.indice === 'Negociado') throw new Error('Novo valor negociado: desfaça pela renovação, na página do inquilino.');
  const depois = correcoesDo(d, x.contrato_id).find((y) => y.data_vigencia > x.data_vigencia);
  if (depois) throw new Error(`Desfaça antes a correção mais recente (${C.dataBr(depois.data_vigencia)}).`);
  const boletos = boletosCaucaoDa(d, x);
  if (boletos.some((cb) => cb.data_pagamento)) throw new Error('Há boleto do complemento da caução já pago para este reajuste: desfaça o pagamento antes.');
  for (const cb of boletos) excluir(d, 'cobrancas', cb.id, usuario, `Boleto do complemento da caução${cb.caucao_parcela ? ` (${cb.caucao_parcela})` : ''} excluído (reajuste desfeito)`);
  for (const g of d.correcoes_garantia.filter((y) => y.contrato_id === x.contrato_id && y.data >= x.data_vigencia)) excluir(d, 'correcoes_garantia', g.id, usuario, 'Correção da caução desfeita (reajuste desfeito)');
  excluir(d, 'correcoes', x.id, usuario, `Reajuste de ${C.compBr(x.data_vigencia.slice(0, 7))} desfeito: volta a ${C.reais(x.valor_anterior)}`);
  return x;
}

/**
 * Todos os reajustes em aberto (sem correção, ou do ano corrente sem a carta), de qualquer ano, até 3 meses à frente:
 * a tela Reajustes é o único lugar onde eles são aplicados.
 */
export function reajustesAbertos(d, hoje = C.hojeIso(), { contratoId = null } = {}) {
  // `contratoId`: só os desse contrato (página do contrato), sem calcular os de todos os outros
  const ate = C.somarMeses(C.competenciaDe(hoje), 3);
  const lista = [];
  for (const c of d.contratos.filter((x) => (contratoId === null || x.id === contratoId) && x.ativo !== false && x.imovel_id && !trocaAguardaAditivo(d, x))) {
    const herdado = contratoHerdado(d, c) && c.data_entrada ? c.data_entrada.slice(0, 7) : '';
    let doContrato = null; // correções e cartas do contrato: separadas uma vez, e só se houver reajuste a olhar
    for (let n = 1, comp = competenciaDoReajuste(c, 1); comp && comp <= ate; n += 1, comp = competenciaDoReajuste(c, n)) {
      // troca de titular: reajuste de antes da entrada do novo titular é do contrato anterior
      if (comp < herdado || !contratoAtivo(c, `${comp}-01`)) continue;
      doContrato = doContrato || { correcoes: correcoesDo(d, c.id), cartas: d.cartas_reajuste.filter((x) => x.contrato_id === c.id) };
      const r = reajusteNaCompetencia(d, c, comp, hoje, doContrato);
      if (r && (!r.corrigido || r.faltaCarta)) lista.push({ contrato: c, ...r, calculo: calcularReajuste(d, c, comp) });
    }
  }
  return lista.sort((a, b) => a.competencia.localeCompare(b.competencia) || a.contrato.inquilino_nome.localeCompare(b.contrato.inquilino_nome, 'pt-BR'));
}

/**
 * Reajustes de uma competência (aluguel de), feitos ou não (painel de Gestão): os mesmos contratos de ``reajustesAbertos``
 * (ativo, com imóvel, sem troca de titular esperando o termo, ativo no mês e sem o reajuste do titular anterior), com
 * ``corrigido`` preenchido quando a correção já foi aplicada. Ex.: entrada em 10/11/2025 → reajuste no aluguel de 11/2026.
 */
export function reajustesDoMes(d, comp, hoje = C.hojeIso()) {
  const lista = [];
  for (const c of d.contratos.filter((x) => x.ativo !== false && x.imovel_id && !trocaAguardaAditivo(d, x))) {
    const herdado = contratoHerdado(d, c) && c.data_entrada ? c.data_entrada.slice(0, 7) : '';
    if (comp < herdado || !contratoAtivo(c, `${comp}-01`)) continue;
    const r = reajusteNaCompetencia(d, c, comp, hoje);
    if (r) lista.push({ contrato: c, ...r });
  }
  return lista.sort((a, b) => a.contrato.inquilino_nome.localeCompare(b.contrato.inquilino_nome, 'pt-BR'));
}

/** Reajustes já aplicados (correções pelo índice, sem os novos valores negociados), do mais recente ao mais antigo. */
export function reajustesFeitos(d) {
  return d.correcoes.filter((x) => x.indice !== 'Negociado').map((x) => ({ correcao: x, contrato: buscar(d, 'contratos', x.contrato_id) })).filter((x) => x.contrato)
    .sort((a, b) => b.correcao.data_vigencia.localeCompare(a.correcao.data_vigencia) || b.correcao.id - a.correcao.id);
}

/** Marca a carta de reajuste como enviada (ou desfaz). */
export function marcarCartaEnviada(d, contratoId, comp, enviada, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  const atual = cartaDoReajuste(d, c, comp);
  if (enviada && !atual) inserir(d, 'cartas_reajuste', { contrato_id: c.id, competencia: comp, enviada_em: C.hojeIso() }, usuario, `Carta de reajuste de ${C.compBr(comp)} enviada`);
  if (!enviada && atual) excluir(d, 'cartas_reajuste', atual.id, usuario, `Carta de reajuste de ${C.compBr(comp)}: envio desfeito`);
}

// --------------------------------------------------------------------------
// Inadimplência: boletos vencidos e não pagos, por inquilino, e histórico de atrasos
// --------------------------------------------------------------------------
/** Contrato encerrado (inativo ou com a saída do inquilino registrada): a inadimplência dele some (decisão do dono, C13, 2026-11-07). */
export const contratoEncerrado = (d, c) => c.ativo === false || !!encerramentoDo(d, c.id);

/**
 * Devedores: inquilinos com boleto vencido e não pago (carência sem valor não conta), com o valor de hoje
 * (multa e juros até hoje); contrato encerrado não entra (``contratoEncerrado``). Vencimento em dia não útil só vence
 * depois do próximo dia útil (``C.vencido``); os dias de atraso contam desde o vencimento. Histórico: pagamentos com atraso
 * nos últimos 12 meses, para ver quem costuma atrasar.
 */
export function inadimplencia(d, hoje = C.hojeIso(), { historico: comHistorico = true } = {}) {
  const porContrato = new Map();
  for (const cb of d.cobrancas) {
    // complemento da caução é garantia (tem o alerta "Caução a completar"), não dívida de aluguel: fica fora da inadimplência e da régua
    if (!aCobrar(cb) || ehComplementoCaucao(cb) || !C.vencido(cb.vencimento, hoje)) continue;
    const c = buscar(d, 'contratos', cb.contrato_id);
    if (!c || contratoEncerrado(d, c)) continue;
    if (!porContrato.has(c.id)) porContrato.set(c.id, { contrato: c, boletos: [] });
    const r = C.liquidar(cb, hoje);
    porContrato.get(c.id).boletos.push({ cobranca: cb, dias: C.diasEntre(cb.vencimento, hoje), valor: totais(cb).a_pagar_sem_desconto, hojeValor: r.valor_devido });
  }
  const devedores = [...porContrato.values()].map((x) => ({ ...x,
    boletos: x.boletos.sort((a, b) => a.cobranca.vencimento.localeCompare(b.cobranca.vencimento)),
    total: x.boletos.reduce((s, b) => s + b.valor, 0), totalHoje: x.boletos.reduce((s, b) => s + b.hojeValor, 0),
    diasMax: Math.max(...x.boletos.map((b) => b.dias)) })).map((x) => ({ ...x, passo: passoDaRegua(x.diasMax) }))
    .sort((a, b) => b.diasMax - a.diasMax || b.totalHoje - a.totalHoje);
  const desde = C.somarMeses(C.competenciaDe(hoje), -12);
  // ``{ historico: false }`` (alertas do Painel): só os devedores, sem percorrer os boletos pagos de cada inquilino
  const historico = !comHistorico ? [] : d.contratos.filter((c) => contratoAtivo(c, hoje) && c.imovel_id).map((c) => {
    const pagos = d.cobrancas.filter((cb) => cb.contrato_id === c.id && cb.data_pagamento && cb.vencimento.slice(0, 7) >= desde);
    const atrasados = pagos.filter((cb) => cb.dias_atraso > 0);
    return { contrato: c, pagos: pagos.length, atrasados: atrasados.length,
      mediaDias: atrasados.length ? Math.round(atrasados.reduce((s, cb) => s + cb.dias_atraso, 0) / atrasados.length) : 0,
      maiorAtraso: Math.max(0, ...atrasados.map((cb) => cb.dias_atraso)) };
  }).filter((x) => x.atrasados).sort((a, b) => b.atrasados - a.atrasados || b.mediaDias - a.mediaDias);
  return { devedores, historico, total: devedores.reduce((s, x) => s + x.total, 0), totalHoje: devedores.reduce((s, x) => s + x.totalHoje, 0) };
}

/** Faixas de atraso da Inadimplência (pedido do dono de 17/11): até quantos dias cada uma vai (a última não tem fim). */
export const FAIXAS_ATRASO = [{ ate: 30, nome: 'Até 30 dias' }, { ate: 60, nome: '31 a 60 dias' }, { ate: 90, nome: '61 a 90 dias' }, { ate: Infinity, nome: 'Mais de 90 dias' }];

/**
 * Boletos vencidos por tempo de atraso, a partir dos devedores de ``inadimplencia`` (que já usa ``aCobrar`` e ``C.vencido``):
 * em cada faixa, os boletos, os inquilinos (cada um conta uma vez por faixa), o valor do boleto e o do dia (multa e juros por
 * ``C.liquidar`` até hoje). Ex.: boleto de R$ 1.200,00 vencido há 45 dias → "31 a 60 dias": 1 boleto, R$ 1.200,00 em aberto e
 * R$ 1.242,00 hoje (multa 2% e juros 1% ao mês). Devolve [{ nome, ate, boletos, inquilinos, valor, valorHoje }].
 */
export function faixasDeAtraso(devedores) {
  const faixas = FAIXAS_ATRASO.map((f) => ({ ...f, boletos: 0, contratos: new Set(), valor: 0, valorHoje: 0 }));
  for (const x of devedores || []) {
    for (const b of x.boletos) {
      const f = faixas.find((y) => b.dias <= y.ate);
      f.boletos += 1;
      f.contratos.add(x.contrato.id);
      f.valor += b.valor;
      f.valorHoje += b.hojeValor;
    }
  }
  return faixas.map(({ contratos, ...f }) => ({ ...f, inquilinos: contratos.size }));
}

/**
 * Régua de cobrança (rotina D8, dono em 2026-11-07): só um aviso do que fazer, nada é enviado sozinho.
 * A partir do dia de atraso do boleto mais antigo: 1 → lembrete por e-mail; 10 → ligar; 30 → avaliar a negativação.
 */
export const REGUA_COBRANCA = [
  { dias: 30, passo: 'Avaliar a negativação' },
  { dias: 10, passo: 'Ligar para o inquilino' },
  { dias: 1, passo: 'Mandar o lembrete por e-mail' },
];
/** Régua em uso (regra `regua_cobranca`; padrão = REGUA_COBRANCA), do passo de mais dias para o de menos. */
export const reguaCobranca = () => [...CR.regra('regua_cobranca')].sort((a, b) => b.dias - a.dias);
export const passoDaRegua = (dias) => (reguaCobranca().find((x) => dias >= x.dias) || {}).passo || '';

// --------------------------------------------------------------------------
// Acordo de dívida (rotina D8): boletos vencidos viram boletos novos; não existe "baixar como perda"
// --------------------------------------------------------------------------
/** Boletos das parcelas do acordo, pela ordem de vencimento. */
export const parcelasDoAcordo = (d, a) => d.cobrancas.filter((cb) => cb.acordo_parcela_de === a.id).sort((x, y) => x.vencimento.localeCompare(y.vencimento) || x.id - y.id);
/** Boletos que o acordo substituiu. */
export const origensDoAcordo = (d, a) => d.cobrancas.filter((cb) => cb.acordo_id === a.id).sort((x, y) => x.vencimento.localeCompare(y.vencimento));
/** Como o boleto aparece nos textos do acordo: "ago/2026" (aluguel) ou "acordo 2/3" (parcela de um acordo anterior). */
const nomeNoAcordo = (cb) => (ehParcelaAcordo(cb) ? `acordo ${cb.acordo_parcela || ''}`.trim() : C.compBr(cb.competencia));

/**
 * Prévia do acordo: dívida de hoje (com multa e juros), o que vai na NF e os boletos novos.
 * Na NF vai a parte do aluguel mais a multa e os juros do acordo (``total`` − IPTU, seguro, tarifa e FCI dos boletos
 * originais), como no pagamento atrasado; o resto vai no boleto como "encargos do acordo". A reserva já abatida no boleto
 * original (e o ressarcimento que não sai da NF) entra na NF, como no pagamento normal (NF com o aluguel cheio): ex.
 * aluguel R$ 1.350,00 com R$ 500,00 de reserva, acordo de R$ 937,80 → NF de R$ 1.437,80.
 * Ex.: boleto de ago/2026 de R$ 1.350,00 (aluguel R$ 1.200,00 + IPTU R$ 100,00 + seguro R$ 50,00), acordo de
 * R$ 1.500,00 em 3 vencendo 10/12, 10/01 e 10/02: 3 boletos de R$ 500,00, cada um com R$ 450,00 na NF.
 */
export function previaAcordo(d, { contrato_id, ids, total, parcelas, primeiro_vencimento }, hoje = C.hojeIso()) {
  const c = buscar(d, 'contratos', Number(contrato_id));
  if (!c) throw new Error('Contrato não encontrado.');
  const lista = [...new Set((ids || []).map(Number))].map((id) => buscar(d, 'cobrancas', id));
  if (!lista.length || lista.some((cb) => !cb)) throw new Error('Escolha os boletos vencidos do acordo.');
  for (const cb of lista) {
    const nome = nomeNoAcordo(cb);
    if (cb.contrato_id !== c.id) throw new Error(`O boleto ${nome} é de outro inquilino.`);
    if (!aCobrar(cb) || !C.vencido(cb.vencimento, hoje)) throw new Error(`O boleto ${nome} não está vencido e em aberto.`);
    if (ehComplementoCaucao(cb)) throw new Error('O complemento da caução é garantia: não entra em acordo.');
    if (cb.banco && cb.banco.situacao === 'emitido') throw new Error(`O boleto ${nome} está emitido no C6: cancele no banco antes de fazer o acordo (senão o inquilino ainda pode pagá-lo).`);
  }
  lista.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const n = Math.trunc(Number(parcelas) || 0);
  if (n < 1 || n > 24) throw new Error('Parcelas do acordo: de 1 a 24.');
  if (!Number.isInteger(total) || total <= 0) throw new Error('Informe o valor total combinado.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(primeiro_vencimento || '') || primeiro_vencimento < hoje) throw new Error('Informe o vencimento do primeiro boleto do acordo (hoje ou depois).');
  const original = lista.reduce((s, cb) => s + totais(cb).a_pagar_sem_desconto, 0);
  const divida = lista.reduce((s, cb) => s + C.liquidar(cb, hoje).valor_devido, 0);
  // o que separa o pago da NF no pagamento atrasado normal (``C.liquidar``): IPTU, seguro, tarifa e FCI ficam fora; a reserva
  // já abatida e o ressarcimento que não sai da NF entram (NF com o aluguel cheio): pode dar negativo (NF maior que o pago)
  const foraDaNf = Math.min(total, lista.reduce((s, cb) => s + totais(cb).a_pagar_sem_desconto - (cb.aluguel || 0) + (cb.ressarcimento_na_nf ? cb.ressarcimento || 0 : 0) - C.ajusteNaNf(cb), 0));
  if (total < n) throw new C.ErroUsuario(`Com ${n} parcelas, o total precisa ser de pelo menos ${C.reais(n)} (nenhuma parcela pode ficar com R$ 0,00).`);
  const valores = C.parcelas(total, n);
  const fora = C.parcelas(foraDaNf, n);
  // o FCI dos boletos de origem continua sendo FCI nas parcelas (entra no fundo quando a parcela é paga e fica fora da multa):
  // sai da parte "fora da NF" de cada parcela. Ex.: aluguel R$ 2.000,00 + FCI R$ 90,00 → parcela com fci R$ 90,00
  const fciOrigem = Math.max(0, Math.min(lista.reduce((s, cb) => s + (cb.fci || 0), 0), foraDaNf, total));
  const fciPorParcela = C.parcelas(fciOrigem, n);
  let fciPendente = 0;
  const mesSeguinte = c.cobranca_mes_seguinte !== false;
  const boletos = valores.map((valor, k) => {
    const vencimento = C.somarMesesData(primeiro_vencimento, k);
    const outros = Math.min(fora[k], valor);
    const fci = Math.max(0, Math.min(fciPorParcela[k] + fciPendente, outros));
    fciPendente += fciPorParcela[k] - fci;
    return { valor, vencimento, competencia: mesSeguinte ? C.somarMeses(vencimento.slice(0, 7), -1) : vencimento.slice(0, 7), nf: valor - outros, outros: outros - fci, fci, parcela: n > 1 ? `${k + 1}/${n}` : '' };
  });
  const periodos = lista.map((cb) => (ehParcelaAcordo(cb) && cb.acordo_periodo) || C.periodoServico(cb.competencia, c.data_entrada, c.data_saida));
  const periodo = [periodos.map((x) => x[0]).sort()[0], periodos.map((x) => x[1]).sort().pop()];
  return { contrato: c, origens: lista, original, divida, total, foraDaNf, boletos, periodo, referente: lista.map(nomeNoAcordo).join(', ') };
}

/** Faz o acordo: os boletos vencidos ficam "Em acordo" (fora da inadimplência) e saem os boletos novos das parcelas. */
export function fazerAcordo(d, dados, usuario, hoje = C.hojeIso()) {
  const p = previaAcordo(d, dados, hoje);
  const c = p.contrato;
  const a = inserir(d, 'acordos', { contrato_id: c.id, data: hoje, referente: p.referente, valor_original: p.original, divida_na_data: p.divida,
    valor_total: p.total, parcelas: p.boletos.length, primeiro_vencimento: p.boletos[0].vencimento, observacoes: String(dados.observacoes || '').trim(), desfeito_em: null },
    usuario, `Acordo com ${c.inquilino_nome}: ${p.referente} (${C.reais(p.divida)} hoje) em ${p.boletos.length} boleto(s), total ${C.reais(p.total)}`);
  for (const cb of p.origens) atualizar(d, 'cobrancas', cb.id, { situacao: 'Em acordo', acordo_id: a.id }, usuario, `Boleto ${nomeNoAcordo(cb)} entrou no acordo de ${C.dataBr(hoje)}`);
  const parcelas = p.boletos.map((b) => inserir(d, 'cobrancas', {
    contrato_id: c.id, competencia: b.competencia, vencimento: b.vencimento,
    dias_cobrados: C.diasNoMes(b.competencia), dias_mes: C.diasNoMes(b.competencia), aluguel_mensal: 0, aluguel: b.nf, desconto: 0,
    iptu: 0, iptu_parcela: '', seguro: 0, seguro_parcela: '', taxa_boleto: 0, fci: b.fci || 0, outros: b.outros,
    outros_descricao: b.outros > 0 ? 'Encargos do acordo' : b.outros < 0 ? 'Reserva ou ressarcimento já abatido (entra na NF)' : '',
    reserva_utilizada: 0, carencia: false, ressarcimento: 0, ressarcimento_descricao: '', ressarcimento_na_nf: false,
    multa_percentual: c.multa_percentual || 0, juros_mensal_percentual: c.juros_mensal_percentual || 0,
    acordo_parcela_de: a.id, acordo_parcela: b.parcela, acordo_referente: p.referente, acordo_periodo: p.periodo,
    situacao: 'Em aberto', data_pagamento: null, valor_pago: null, dias_atraso: null, multa: null, juros: null, valor_nf: null, banco: null,
  }, usuario, `Boleto do acordo${b.parcela ? ` ${b.parcela}` : ''} de ${c.inquilino_nome}: ${C.reais(b.valor)}, vence em ${C.dataBr(b.vencimento)}`));
  return { acordo: a, parcelas };
}

/**
 * Acordo mais novo (não desfeito) que incluiu uma parcela deste: { acordo, parcela } ou null. Enquanto existir, este não se
 * desfaz (a parcela seria apagada e o acordo novo continuaria cobrando por ela: a dívida ficaria em dobro).
 */
export function acordoPosterior(d, a) {
  for (const p of parcelasDoAcordo(d, a)) {
    if (!emAcordo(p) || !p.acordo_id) continue;
    const b = buscar(d, 'acordos', p.acordo_id);
    if (b && !b.desfeito_em) return { acordo: b, parcela: p };
  }
  return null;
}

/**
 * Desfaz o acordo (só se nenhuma parcela foi paga nem emitida no C6, nem entrou num acordo mais novo): apaga as parcelas e os
 * boletos originais voltam a ser cobrados.
 */
export function desfazerAcordo(d, acordoId, usuario, hoje = C.hojeIso()) {
  const a = buscar(d, 'acordos', Number(acordoId));
  if (!a || a.desfeito_em) throw new Error('Acordo não encontrado.');
  const depois = acordoPosterior(d, a);
  if (depois) throw new C.ErroUsuario(`Desfaça antes o acordo de ${C.dataBr(depois.acordo.data)}, que inclui a parcela ${depois.parcela.acordo_parcela || 'única'}.`);
  const parcelas = parcelasDoAcordo(d, a);
  if (parcelas.some((cb) => cb.data_pagamento)) throw new Error('Uma parcela do acordo já foi paga: desfaça o pagamento antes.');
  if (parcelas.some((cb) => emitidoNoBanco(cb))) throw new Error('Uma parcela do acordo foi emitida no C6: cancele no banco antes.');
  // parcela descontada da garantia (cálculo final ou devolução na troca): a dívida já está acertada lá; desfazer o acordo a
  // faria ser cobrada de novo (CON-05)
  if (parcelas.some((cb) => cb.quitado_saida)) throw new C.ErroUsuario('Uma parcela do acordo já foi descontada da garantia no cálculo final da saída: desfaça antes o cálculo final.');
  if (parcelas.some((cb) => cb.quitado_devolucao)) throw new C.ErroUsuario('Uma parcela do acordo já foi descontada na devolução da garantia (troca de titular): desfaça antes essa devolução.');
  for (const cb of parcelas) excluir(d, 'cobrancas', cb.id, usuario, `Boleto do acordo${cb.acordo_parcela ? ` ${cb.acordo_parcela}` : ''} excluído (acordo desfeito)`);
  for (const cb of origensDoAcordo(d, a)) atualizar(d, 'cobrancas', cb.id, { situacao: 'Em aberto', acordo_id: null }, usuario, `Boleto ${nomeNoAcordo(cb)} volta a ser cobrado (acordo desfeito)`);
  return atualizar(d, 'acordos', a.id, { desfeito_em: hoje }, usuario, `Acordo de ${C.dataBr(a.data)} desfeito`);
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
/** Mês da tela Impostos onde está a guia de um período: mensal "2026-10" → 2026-10; trimestral "2026-T3" → 2026-09 (último mês do trimestre). */
export const mesDoPeriodoGuia = (periodo) => {
  const p = String(periodo || '');
  const t = /^(\d{4})-T([1-4])$/.exec(p);
  return t ? `${t[1]}-${String(Number(t[2]) * 3).padStart(2, '0')}` : p.slice(0, 7);
};

/**
 * Faturamento das NFs não canceladas por empresa e mês de emissão, numa passada só: Map empresa → Map mês → { valor, numeros }.
 * Montado a cada cálculo (impostos do mês, resultados), nunca guardado entre desenhos: as NFs mudam a cada gravação.
 */
export function indiceFaturamento(d) {
  const porEmpresa = new Map();
  for (const f of d.faturas) {
    if (f.situacao === 'Cancelada') continue;
    const comp = String(f.emissao || '').slice(0, 7);
    let e = porEmpresa.get(f.emitente_id);
    if (!e) porEmpresa.set(f.emitente_id, (e = new Map()));
    let x = e.get(comp);
    if (!x) e.set(comp, (x = { valor: 0, numeros: new Set() }));
    x.valor += f.valor;
    x.numeros.add(f.numero);
  }
  return porEmpresa;
}

/** Faturamento de NFs emitidas (não canceladas) de uma empresa num mês, pela data de emissão. ``indice``: ``indiceFaturamento(d)``. */
export function faturamentoNf(d, emitenteId, comp, indice = null) {
  if (indice) {
    const x = (indice.get(emitenteId) || new Map()).get(comp);
    return x ? { valor: x.valor, notas: x.numeros.size } : { valor: 0, notas: 0 };
  }
  const fs = d.faturas.filter((f) => f.emitente_id === emitenteId && f.situacao !== 'Cancelada' && String(f.emissao || '').slice(0, 7) === comp);
  return { valor: fs.reduce((t, f) => t + f.valor, 0), notas: new Set(fs.map((f) => f.numero)).size };
}

const guiaDo = (d, emitenteId, imposto, periodo) => d.guias_impostos.find((g) => g.emitente_id === emitenteId && g.imposto === imposto && g.periodo === periodo) || null;

/** Dia útil igual ou anterior à data (vencimento de tributo federal que cai em dia sem expediente bancário); feriados em calculos.js. */
export const diaUtilAteh = C.diaUtilAteh;
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
function excedenteLc224(d, emitenteId, comp, inicio, indice = null) {
  const ano = comp.slice(0, 4);
  const t = Number(trimestreDe(comp).slice(-1));
  const receita = (q) => mesesDoTrimestre(`${ano}-${String(q * 3).padStart(2, '0')}`).filter((m) => m <= comp).reduce((v, m) => v + faturamentoNf(d, emitenteId, m, indice).valor, 0);
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
function transportado(d, e, x, comp, indice = null) {
  const primeira = d.faturas.filter((f) => f.emitente_id === e.id && f.situacao !== 'Cancelada' && f.emissao).map((f) => f.emissao.slice(0, 7)).sort()[0];
  if (!primeira) return 0;
  const passo = x.mensal ? 1 : 3;
  const atual = x.mensal ? comp : mesesDoTrimestre(comp)[2];
  let saldo = 0;
  for (let m = x.mensal ? primeira : mesesDoTrimestre(primeira)[2]; m < atual; m = C.somarMeses(m, passo)) {
    const total = saldo + guiasDoPeriodo(d, e, m, indice).find((g) => g.imposto === x.imposto).esperado;
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
  const indice = indiceFaturamento(d);
  return d.emitentes.filter((e) => e.ativo || d.faturas.some((f) => f.emitente_id === e.id)).map((e) => {
    const r = guiasDaEmpresa(d, e, comp, indice);
    r.guias = r.guias.map((g) => {
      const anterior = transportado(d, e, g, comp, indice);
      const aPagar = g.esperado + anterior;
      return { ...g, transportado: anterior, aPagar, abaixoDoMinimo: aPagar > 0 && aPagar < MINIMO_GUIA };
    });
    return r;
  });
}

const guiasDoPeriodo = (d, e, comp, indice = null) => guiasDaEmpresa(d, e, comp, indice).guias;

/** Cálculo das guias de uma empresa no mês, sem o que vem de períodos anteriores. ``indice``: ``indiceFaturamento(d)``. */
function guiasDaEmpresa(d, e, comp, indice = null) {
  const meses = mesesDoTrimestre(comp).filter((m) => m <= comp);
  const tri = trimestreDe(comp);
  const mes = faturamentoNf(d, e.id, comp, indice);
  const porMes = meses.map((m) => ({ mes: m, ...faturamentoNf(d, e.id, m, indice) }));
  const trimestre = porMes.reduce((t, x) => t + x.valor, 0);
  // lucro presumido do trimestre: 32% do faturamento + 3,2% (10% de 32%) da parte acima do limite da LC 224
  const presumido = (imposto) => {
    const extra = mesesDoTrimestre(comp)[0] >= INICIO_LC224[imposto] ? excedenteLc224(d, e.id, comp, INICIO_LC224[imposto], indice) : 0;
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
  if (valor === null) {
    if (!atual) return;
    // guia já paga (ligada ao extrato ou a um pagamento pelo banco): apagar perderia a data do pagamento (2026-11-20)
    if (atual.paga_em || atual.movimentacao_id || atual.pagamento_banco_id) throw new C.ErroUsuario(`${texto} já está paga${atual.paga_em ? ` (${C.dataBr(atual.paga_em)})` : ''}: para apagar o valor, desfaça antes o destino do pagamento na tela Banco.`);
    excluir(d, 'guias_impostos', atual.id, usuario, `${texto}: valor do contador apagado`);
    return;
  }
  if (atual) atualizar(d, 'guias_impostos', atual.id, { valor }, usuario, `${texto}: ${C.reais(valor)}`);
  else inserir(d, 'guias_impostos', { emitente_id: emitenteId, imposto, periodo, valor }, usuario, `${texto}: ${C.reais(valor)}`);
}

// --------------------------------------------------------------------------
// Banco (C6), fase 2: extrato, comprovantes e pagamentos. Aqui fica só o que normalizar, arquivosReferenciados,
// etapasFechamento e todosAlertas precisam; as regras de conciliação estão em conciliacao.js (que importa este arquivo).
// --------------------------------------------------------------------------
/**
 * Campos novos de config_banco (os da base — ativo, provedor, ponte_url, senha_ponte, conta_padrao_id, contas — ficam como estão).
 * ``ultima_importacao`` é antigo: desde 2026-11-09 o "extrato importado até" fica na raiz, em ``d.extrato_importado_ate``
 * ({ conta: 'AAAA-MM-DD' }), porque config_banco só o administrador muda na nuvem e o operador também importa o extrato.
 */
export const CONFIG_BANCO_FASE2 = {
  pasta_contador: '_Contador', modelo_nome_comprovante: '{data} {empresa} {imovel} {tipo} {valor}',
  permitir_pagamentos: false, limite_pagamento: 0, ultima_importacao: {}, copiar_para_contador: true,
};

/**
 * Até que dia o extrato da conta já foi importado ('AAAA-MM-DD' ou null): ``d.extrato_importado_ate`` (campo da raiz, criado na
 * primeira importação) ou, em banco antigo ainda não normalizado, ``config_banco.ultima_importacao`` (vale a data mais nova).
 */
export function extratoImportadoAte(d, contaId) {
  const novo = ((d && d.extrato_importado_ate) || {})[contaId] || null;
  const antigo = (((d && d.config_banco) || {}).ultima_importacao || {})[contaId] || null;
  return novo && antigo ? (novo > antigo ? novo : antigo) : novo || antigo;
}
/** Movimentação sem destino há mais dias que isto vira alerta no Painel. */
export const DIAS_ALERTA_BANCO = 7;
/** No mês corrente, a etapa "Banco" do fechamento aceita o extrato buscado há até este número de dias (não precisa chegar até hoje). */
export const DIAS_EXTRATO_RECENTE = 7;

/** Id da pasta "<Imóvel>/Contas pagas/<ano>" (escopo contasano) e "<Imóvel>/IPTU (guias)/<ano>" (iptuano): igual a idGuiasDoAno. */
export const idPastaAno = (imovelId, ano) => Number(imovelId) * 10000 + Number(ano);
/** Id da pasta "_Contador/<Empresa>/<AAAA-MM>" (escopo contador). Ex.: empresa 1, '2026-11' → 1202611. */
export const idContador = (emitenteId, comp) => Number(emitenteId) * 1000000 + Number(String(comp).replace('-', ''));
export const decodificarIdContador = (id) => {
  const resto = String(Number(id) % 1000000).padStart(6, '0');
  return { emitenteId: Math.floor(Number(id) / 1000000), comp: `${resto.slice(0, 4)}-${resto.slice(4)}` };
};

// as do C6 e as de outros bancos (só extrato por arquivo): o extrato, o saldo e os comprovantes valem para as duas
export const contaBancaria = (d, contaId) => contasDoExtrato(d).find((c) => c.id === contaId) || null;
export const apelidoDaConta = (d, contaId) => {
  const c = contaBancaria(d, contaId);
  if (!c) return String(contaId || '').toUpperCase();
  const e = c.emitente_id ? buscar(d, 'emitentes', c.emitente_id) : null;
  return c.apelido || (e ? e.nome.split(' ')[0] : String(contaId).toUpperCase());
};
/**
 * Mês da pasta do contador: sempre o mês em que o dinheiro saiu/entrou. Movimentação do extrato: a data dela (a ponta que recebe uma
 * transferência usa a data da ponta que enviou); pagamento pelo banco: a data da movimentação ligada ou, sem ela, a data do pagamento.
 * Ex.: conta de 12/2026 paga em 28/11/2026 → pasta 2026-11 (não a competência).
 */
export function mesDoDinheiro(d, x) {
  const mov = d && x.movimentacao_id ? buscar(d, 'movimentacoes_banco', x.movimentacao_id) : null;
  const par = d && x.classificacao === 'transferencia' && x.tipo === 'entrada' && x.par_movimentacao_id ? buscar(d, 'movimentacoes_banco', x.par_movimentacao_id) : null;
  const data = (par && par.data) || (mov && mov.data) || x.data || x.pago_em || x.data_pagamento || '';
  return String(data).slice(0, 7) || C.hojeIso().slice(0, 7);
}
export const competenciaDoComprovante = (x, d = null) => mesDoDinheiro(d, x);

/** Conta de onde o dinheiro saiu: a própria; na ponta que recebe uma transferência entre as nossas contas, a conta da outra ponta. */
export function contaDeOrigem(d, x) {
  if (x.classificacao === 'transferencia' && x.tipo === 'entrada' && x.par_movimentacao_id) {
    const par = buscar(d, 'movimentacoes_banco', x.par_movimentacao_id);
    if (par) return par.conta_id;
  }
  return x.conta_id;
}

/**
 * Onde fica o PDF do comprovante no imóvel: IPTU → "IPTU (guias)/<ano do IPTU>" (iptuano); com imóvel → "Contas pagas/<ano da data>"
 * (contasano); sem imóvel → null (só na pasta do contador). Vale para movimentações e pagamentos pelo banco.
 */
export function pastaDoComprovante(d, x) {
  const iptuId = x.iptu_id || (x.origem && x.origem.tipo === 'iptu' ? x.origem.id : null);
  if (iptuId) {
    const p = buscar(d, 'iptus', iptuId);
    if (p) return { escopo: 'iptuano', id: idPastaAno(p.imovel_id, p.ano) };
  }
  if (!x.imovel_id) return null;
  const data = x.data || x.pago_em || x.data_pagamento || C.hojeIso();
  return { escopo: 'contasano', id: idPastaAno(x.imovel_id, String(data).slice(0, 4)) };
}

/**
 * Pasta do contador ("_Contador/<Empresa>/<AAAA-MM>"): a empresa da conta de onde o dinheiro saiu (transferência: a conta de origem),
 * no mês do dinheiro (``mesDoDinheiro``). null se a conta não tem empresa.
 */
export function pastaContador(d, x) {
  const c = contaBancaria(d, contaDeOrigem(d, x));
  if (!c || !c.emitente_id) return null;
  return { escopo: 'contador', id: idContador(c.emitente_id, mesDoDinheiro(d, x)) };
}

/** Etiqueta do comprovante na caixa de arquivos: "comprovante do banco ANK: Água 11/2026 (05/11/2026, R$ 123,45)". */
export function rotuloDoComprovante(d, x) {
  const conta = apelidoDaConta(d, x.conta_id);
  const data = x.data || x.pago_em || x.data_pagamento;
  const valor = C.reais(x.valor);
  if (x.origem) return `comprovante do pagamento pelo banco ${conta}: ${x.tipo_conta || 'conta'} ${C.compBr(x.competencia || competenciaDoComprovante(x))} (${data ? C.dataBr(data) : 'a pagar'}, ${valor})`;
  let oque = x.descricao || '';
  if (x.classificacao === 'conta_imovel') { const de = x.despesa_id ? buscar(d, 'despesas', x.despesa_id) : null; oque = de ? `${de.tipo} ${C.compBr(de.competencia)}` : 'conta do imóvel'; }
  else if (x.classificacao === 'boleto') { const cb = x.cobranca_id ? buscar(d, 'cobrancas', x.cobranca_id) : null; const c = cb ? buscar(d, 'contratos', cb.contrato_id) : null; oque = `aluguel${c ? ` de ${c.inquilino_nome}` : ''}${cb ? ` (${C.compBr(cb.competencia)})` : ''}${x.pago_a_mais ? ', pago a mais' : ''}`; }
  else if (x.classificacao === 'devolucao_inquilino') { const cb = x.cobranca_id ? buscar(d, 'cobrancas', x.cobranca_id) : null; const c = cb ? buscar(d, 'contratos', cb.contrato_id) : null; oque = `devolução${c ? ` a ${c.inquilino_nome}` : ' ao inquilino'}${cb ? ` (boleto ${C.compBr(cb.competencia)})` : ''}`; }
  else if (x.classificacao === 'iptu') { const p = x.iptu_id ? buscar(d, 'iptus', x.iptu_id) : null; oque = `IPTU${p ? ` ${p.ano}` : ''} ${x.iptu_parcela ? `${x.iptu_parcela}ª parcela` : 'cota única'}`; }
  else if (x.classificacao === 'imposto') oque = 'imposto da empresa';
  else if (x.classificacao === 'tarifa') oque = 'tarifa do banco';
  else if (x.classificacao === 'transferencia') oque = 'transferência entre as contas';
  else if (x.classificacao === 'airbnb') oque = 'Airbnb recebido';
  else if (x.classificacao === 'reforma') { const r = x.reforma_id ? buscar(d, 'reformas', x.reforma_id) : null; oque = `reforma${r ? ` (${r.descricao})` : ''}`; }
  return `comprovante do banco ${conta}: ${oque} (${data ? `${C.dataBr(data)}, ` : ''}${valor})`;
}

/**
 * Pendências do banco no mês (para o fechamento e os alertas): movimentações sem destino, sem comprovante, contas cujo extrato
 * ainda não foi buscado até o fim do mês (mês já fechado) ou nos últimos DIAS_EXTRATO_RECENTE dias (mês corrente: ex.: em
 * 07/11/2026, extrato buscado em 01/11 vale; em 30/10, não) e pagamentos enviados sem confirmação.
 */
export function pendenciasBancoDoMes(d, mes, hoje = C.hojeIso()) {
  const contas = contasDoExtrato(d); // as do C6 e as de outros bancos (extrato por arquivo)
  const fim = C.limitesCompetencia(mes)[1];
  const mesFechado = fim < hoje;
  const ate = mesFechado ? fim : C.somarDias(hoje, -CR.regra('dias_extrato_recente'));
  const movs = (d.movimentacoes_banco || []).filter((m) => String(m.data).slice(0, 7) === mes);
  const semDestinoDe = (id) => movs.filter((m) => m.conta_id === id && !m.classificacao).length;
  const porConta = contas.map((c) => {
    const importadoAte = extratoImportadoAte(d, c.id);
    return { id: c.id, apelido: apelidoDaConta(d, c.id), semDestino: semDestinoDe(c.id), importadoAte, semImportar: !importadoAte || importadoAte < ate };
  });
  const semComprovante = movs.filter((m) => m.classificacao && m.classificacao !== 'ignorar' && !m.comprovante && !m.comprovante_contador).length;
  const pagamentosPendentes = (d.pagamentos_banco || []).filter((p) => ['aguardando_aprovacao', 'agendado', 'erro'].includes(p.situacao)).length;
  return { semDestino: movs.filter((m) => !m.classificacao).length, semComprovante, contasSemImportar: porConta.filter((x) => x.semImportar).map((x) => x.id), pagamentosPendentes, porConta, mesFechado };
}

/**
 * Alerta "Banco" do Painel: movimentações sem destino há mais de DIAS_ALERTA_BANCO dias, pagamentos enviados sem confirmação e
 * pagamentos aprovados aqui cujo envio ao banco não se confirmou (a resposta se perdeu: "Atualizar situação"). Só com o banco ligado.
 */
export function alertaBanco(d, hoje = C.hojeIso()) {
  const cfg = d.config_banco || {};
  // movimentações do extrato valem com qualquer conta que recebe extrato (também por arquivo, com o C6 desligado);
  // os avisos dos pagamentos e boletos pelo banco, só com o C6 ligado (2026-11-20)
  const c6 = !!cfg.ativo;
  if (!c6 && !contasDoExtrato(d).length) return null;
  const limite = C.somarDias(hoje, -CR.regra('dias_alerta_banco'));
  const semDestino = (d.movimentacoes_banco || []).filter((m) => !m.classificacao && m.data <= limite);
  const semComprovante = (d.movimentacoes_banco || []).filter((m) => m.classificacao && m.classificacao !== 'ignorar' && !m.comprovante && !m.comprovante_contador && m.data <= limite);
  const enviados = c6 ? (d.pagamentos_banco || []).filter((p) => p.situacao === 'agendado' && (p.data_pagamento || hoje) < hoje) : [];
  const semEnvio = c6 ? (d.pagamentos_banco || []).filter((p) => p.situacao === 'aguardando_aprovacao') : [];
  const erros = c6 ? (d.pagamentos_banco || []).filter((p) => p.situacao === 'erro') : [];
  const abertosNoBanco = c6 ? pagosAquiAbertosNoBanco(d) : [];
  if (!semDestino.length && !semComprovante.length && !enviados.length && !semEnvio.length && !erros.length && !abertosNoBanco.length) return null;
  const partes = [];
  if (abertosNoBanco.length) {
    const c = buscar(d, 'contratos', abertosNoBanco[0].contrato_id);
    partes.push(`${abertosNoBanco.length} boleto(s) pago(s) aqui e ainda em aberto no C6${abertosNoBanco.some((cb) => cb.banco.negativacao && cb.banco.negativacao.pode_cancelar) ? ', com negativação agendada' : ''} (ex.: ${c ? c.inquilino_nome : ''} ${C.compBr(abertosNoBanco[0].competencia)}): o inquilino pode pagar de novo. Na página do boleto, "Consultar situação no banco" (se o banco já recebeu, acerta sozinho) ou "Cancelar no banco"`);
  }
  if (semDestino.length) partes.push(`${C.plural(semDestino.length, 'movimentação', 'movimentações')} do extrato sem destino há mais de ${CR.regra('dias_alerta_banco')} dias`);
  if (semComprovante.length) partes.push(`${semComprovante.length} comprovante(s) não baixado(s)`);
  if (enviados.length) partes.push(`${enviados.length} pagamento(s) enviado(s) ao banco sem confirmação de que foi pago (confirme pelo extrato ou, se o C6 cancelou, marque "Foi cancelado no C6")`);
  if (semEnvio.length) partes.push(`${semEnvio.length} pagamento(s) aprovado(s) aqui sem a confirmação de que chegou ao banco (em Pagamentos pelo banco, clique em "Atualizar situação")`);
  if (erros.length) partes.push(`${erros.length} pagamento(s) com erro no banco`);
  const soPagamentos = !semDestino.length && !semComprovante.length;
  const soAbertos = abertosNoBanco.length && !semDestino.length && !semComprovante.length && !enviados.length && !semEnvio.length && !erros.length;
  return { nivel: enviados.length || semEnvio.length || erros.length || abertosNoBanco.length ? 'aviso' : 'info', tipo: 'Banco', imovel: '', inquilino: '', ancora: null,
    link: soAbertos ? `#/cobranca/${abertosNoBanco[0].id}` : soPagamentos ? '#/banco/pagamentos' : '#/banco', texto: `${partes.join('; ')}.` };
}

/**
 * Boletos com o pagamento registrado aqui (à mão: Pix direto, dinheiro, extrato) que continuam em aberto no C6: o inquilino pode pagar
 * de novo ou ser negativado já tendo pago. Pago pela listagem do banco (``pagamento_c6``) ou consultado como pago não entra.
 */
export const pagosAquiAbertosNoBanco = (d) => d.cobrancas.filter((cb) => cb.data_pagamento && cb.banco && cb.banco.situacao === 'emitido' && !cb.pagamento_c6 && !aguardandoCredito(cb));

// --------------------------------------------------------------------------
// Busca global (campo do cabeçalho): imóvel, inquilino, CPF/CNPJ, telefone, nº da NF e valor de boleto
// --------------------------------------------------------------------------
/** Texto para comparar: minúsculas e sem acento ("João" → "joao"). */
export const textoDeBusca = (t) => C.semAcento(t).toLocaleLowerCase('pt-BR').trim();

/**
 * Busca em tudo o que o dono procura no dia a dia. Devolve grupos `{ tipo, itens: [{ titulo, detalhe, link, extra }] }`:
 * imóveis (nome, endereço, matrícula, contas), inquilinos atuais e antigos (nome, apelido, CPF/CNPJ, telefone, e-mail, solidário,
 * representante, fiador), NF pelo número ("77" ou "0077") e boletos pelo valor ("1.350,00": valor pontual, recebido ou da NF).
 * Ex.: "529" acha o inquilino cujo CPF começa por 529 e o imóvel cuja matrícula tem 529.
 */
export function buscarGlobal(d, texto, hoje = C.hojeIso()) {
  const q = textoDeBusca(texto);
  const digitos = soDigitos(texto);
  if (!q) return [];
  const bate = (...campos) => campos.some((v) => v && textoDeBusca(v).includes(q));
  // número: compara também só os dígitos (CPF com ou sem pontos, telefone com ou sem traço)
  const bateDigitos = (...campos) => digitos.length >= 3 && campos.some((v) => v && soDigitos(v).includes(digitos));
  const grupos = [];
  const imoveis = d.imoveis.filter((i) => bate(i.nome, i.endereco, i.complemento, i.cidade, i.matricula, i.sublote) || bateDigitos(i.matricula, i.copel_uc, i.sanepar_matricula, i.gas_relogio, i.cep))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((i) => {
      const atual = d.contratos.find((c) => c.imovel_id === i.id && contratoAtivo(c, hoje));
      return { titulo: i.nome, detalhe: `${enderecoCompleto(i)}${atual ? ` · ${atual.inquilino_nome}` : ' · vago'}`, link: `#/imovel/${i.id}` };
    });
  if (imoveis.length) grupos.push({ tipo: 'Imóveis', itens: imoveis });
  const fiadoresDe = (c) => d.fiadores.filter((f) => f.contrato_id === c.id);
  const contratos = d.contratos.filter((c) => bate(c.inquilino_nome, c.inquilino_apelido, c.inquilino_email, c.solidario_nome, c.representante_nome, c.responsavel_nome)
      || bateDigitos(c.inquilino_cpf, c.inquilino_telefone, c.solidario_cpf, c.representante_cpf, c.responsavel_telefone)
      || fiadoresDe(c).some((f) => bate(f.nome) || bateDigitos(f.cpf, f.telefone)))
    .sort((a, b) => Number(contratoAtivo(b, hoje)) - Number(contratoAtivo(a, hoje)) || a.inquilino_nome.localeCompare(b.inquilino_nome, 'pt-BR'))
    .map((c) => {
      const i = buscar(d, 'imoveis', c.imovel_id);
      const fiador = fiadoresDe(c).find((f) => bate(f.nome) || bateDigitos(f.cpf, f.telefone));
      const porque = fiador ? `fiador ${fiador.nome}` : bate(c.solidario_nome) || bateDigitos(c.solidario_cpf) ? `solidário ${c.solidario_nome}` : bate(c.representante_nome) || bateDigitos(c.representante_cpf) ? `representante ${c.representante_nome}` : '';
      return { titulo: c.inquilino_nome, detalhe: [i ? i.nome : 'sem imóvel', c.inquilino_cpf, porque].filter(Boolean).join(' · '), link: `#/contrato/${c.id}`,
        extra: contratoAtivo(c, hoje) ? '' : c.data_saida ? `saiu em ${C.dataBr(c.data_saida)}` : 'inativo' };
    });
  if (contratos.length) grupos.push({ tipo: 'Inquilinos', itens: contratos });
  // interessados das fichas em análise (e das já decididas): nome, CPF, telefone e e-mail (2026-11-20)
  const fichas = (d.fichas || []).filter((f) => bate(f.inquilino_nome, f.inquilino_email, f.representante_nome) || bateDigitos(f.inquilino_cpf, f.inquilino_telefone, f.representante_cpf))
    .sort((a, b) => String(b.data_recebida || '').localeCompare(String(a.data_recebida || '')) || a.inquilino_nome.localeCompare(b.inquilino_nome, 'pt-BR'))
    .map((f) => ({ titulo: f.inquilino_nome, detalhe: [(f.imoveis_ids || []).map((id) => (buscar(d, 'imoveis', id) || {}).nome).filter(Boolean).join(', '), f.inquilino_cpf, f.data_recebida ? `ficha de ${C.dataBr(f.data_recebida)}` : ''].filter(Boolean).join(' · '),
      link: `#/ficha/${f.id}`, extra: f.situacao || '' }));
  if (fichas.length) grupos.push({ tipo: 'Fichas em análise', itens: fichas });
  // NF: só por número, inteiro ("77" acha a 0077, não a 0770)
  if (/^\d{1,6}$/.test(q)) {
    const n = Number(q);
    const nfs = d.faturas.filter((f) => f.numero === n).map((f) => {
      const e = buscar(d, 'emitentes', f.emitente_id);
      const cb = f.cobranca_id ? buscar(d, 'cobrancas', f.cobranca_id) : null;
      const c = cb ? buscar(d, 'contratos', cb.contrato_id) : null;
      return { titulo: `NF nº ${numeroFatura(f.numero)}${e ? ` · ${e.nome}` : ''}`, detalhe: `${C.dataBr(f.emissao)} · ${C.reais(f.valor)}${c ? ` · ${c.inquilino_nome}` : ''}`, link: `#/imprimir/faturas?numero=${f.numero}`, extra: f.situacao === 'Emitida' ? '' : f.situacao };
    });
    if (nfs.length) grupos.push({ tipo: 'NFs', itens: nfs });
  }
  // valor em reais: boletos com esse valor pontual, recebido ou da NF (ex.: "1.350,00" ou "1350")
  let valor = null;
  try { valor = /^[\d.,]+$/.test(q) && /[,.]\d{1,2}$|^\d+$/.test(q) ? C.centavos(q) : null; } catch { valor = null; }
  if (valor > 0) {
    const boletos = d.cobrancas.filter((cb) => [totais(cb).a_pagar_pontual, totais(cb).a_pagar_sem_desconto, cb.valor_pago, cb.valor_nf].includes(valor))
      .sort((a, b) => b.competencia.localeCompare(a.competencia)).slice(0, 30).map((cb) => {
        const c = buscar(d, 'contratos', cb.contrato_id);
        const i = c ? buscar(d, 'imoveis', c.imovel_id) : null;
        return { titulo: `Boleto ${C.compBr(cb.competencia)} · ${c ? c.inquilino_nome : ''}`, detalhe: `${i ? `${i.nome} · ` : ''}vence ${C.dataBr(cb.vencimento)} · pontual ${C.reais(totais(cb).a_pagar_pontual)}${cb.data_pagamento ? ` · recebido ${C.reais(cb.valor_pago)} em ${C.dataBr(cb.data_pagamento)}` : ''}`, link: `#/cobranca/${cb.id}`, extra: cb.situacao };
      });
    if (boletos.length) grupos.push({ tipo: 'Boletos com esse valor', itens: boletos });
  }
  return grupos;
}

// --------------------------------------------------------------------------
// Lembrete ao inquilino (D3): texto pronto para e-mail (canal oficial) ou WhatsApp, conforme a fase do boleto
// --------------------------------------------------------------------------
/** Assinatura dos lembretes: a do cadastro da empresa ("Assinatura dos lembretes", Empresas); em branco, o nome da empresa. */
export const assinaturaLembrete = (d, c) => dadoDaEmpresa(d, c, 'assinatura_mensagens') || (locadorasDoContrato(d, c || {})[0] || {}).nome || '';

/**
 * Texto do lembrete de um boleto em aberto. Fase: ``antes`` (vence depois de hoje), ``dia`` (vence hoje) ou ``atrasado``
 * (valor de hoje com multa e juros). Vencimento em dia não útil: o prazo é o próximo dia útil (``C.limitePagamento``), e o
 * texto diz até quando pode pagar sem multa. Traz o Pix copia e cola e a linha digitável quando o boleto foi emitido no banco.
 * Ex.: boleto de 10/2026 (R$ 1.218,50 em dia) vencendo em 10/11; em 07/11 → "vence em 10/11/2026 … R$ 1.218,50".
 */
/** De quem e de que é o boleto, para os textos ao inquilino: { c, i, nome (apelido ou 1º nome), oQue ("do aluguel de 10/2026"), onde (" (Casa 3)") }. */
function boletoNoTexto(d, cb) {
  const c = buscar(d, 'contratos', cb.contrato_id);
  const i = c ? buscar(d, 'imoveis', c.imovel_id) : null;
  const nome = (c && (c.inquilino_apelido || c.inquilino_nome.split(' ')[0])) || '';
  const oQue = ehComplementoCaucao(cb) ? 'do complemento da caução' : ehSaldoSaida(cb) ? 'do saldo do acerto final do contrato'
    : ehParcelaAcordo(cb) ? `da parcela ${cb.acordo_parcela || ''} do acordo (${cb.acordo_referente || ''})`.replace(/  +/g, ' ') : `do aluguel de ${C.compBr(cb.competencia)}`;
  return { c, i, nome, oQue, onde: i ? ` (${i.nome})` : '' };
}

export function textoLembrete(d, cb, hoje = C.hojeIso()) {
  const { c, nome, oQue, onde } = boletoNoTexto(d, cb);
  const t = totais(cb);
  const limite = C.limitePagamento(cb.vencimento);
  const adiado = limite !== cb.vencimento;
  const fase = limite > hoje ? 'antes' : limite === hoje ? 'dia' : 'atrasado';
  const linhas = [`Olá, ${nome}!`, ''];
  const bonificacao = cb.desconto ? ' (já com a bonificação de pontualidade)' : '';
  // vencimento em sábado, domingo ou feriado: pode pagar sem multa até o próximo dia útil
  const naoUtil = adiado ? `, que não é dia útil: pode ser pago sem multa até ${C.dataBr(limite)}` : '';
  if (fase === 'antes') {
    const quando = cb.vencimento > hoje ? `vence em ${C.dataBr(cb.vencimento)}` : cb.vencimento === hoje ? `vence hoje, ${C.dataBr(cb.vencimento)}` : `venceu em ${C.dataBr(cb.vencimento)}`;
    linhas.push(`Lembrete: o boleto ${oQue}${onde} ${quando}${naoUtil}, no valor de ${C.reais(t.a_pagar_pontual)}${bonificacao}.`);
    if (!semMultaJuros(cb)) linhas.push(`${adiado ? `Depois de ${C.dataBr(limite)}` : 'Após o vencimento'}: ${C.reais(t.a_pagar_sem_desconto)} mais multa de ${C.pct(cb.multa_percentual)} e juros de ${C.pct(cb.juros_mensal_percentual)} ao mês.`);
  } else if (fase === 'dia') {
    linhas.push(adiado ? `Lembrete: o boleto ${oQue}${onde} venceu em ${C.dataBr(cb.vencimento)}, que não é dia útil, e pode ser pago sem multa até hoje, ${C.dataBr(limite)}, no valor de ${C.reais(t.a_pagar_pontual)}${bonificacao}.`
      : `Lembrete: o boleto ${oQue}${onde} vence hoje, ${C.dataBr(cb.vencimento)}, no valor de ${C.reais(t.a_pagar_pontual)}${bonificacao}.`);
    if (!semMultaJuros(cb)) linhas.push(`A partir de amanhã: ${C.reais(t.a_pagar_sem_desconto)} mais multa de ${C.pct(cb.multa_percentual)} e juros de ${C.pct(cb.juros_mensal_percentual)} ao mês.`);
  } else {
    const r = C.liquidar(cb, hoje);
    linhas.push(`O boleto ${oQue}${onde}, com vencimento em ${C.dataBr(cb.vencimento)}, consta em aberto (${C.plural(r.dias_atraso, 'dia')} de atraso).`);
    linhas.push(semMultaJuros(cb) ? `Valor: ${C.reais(r.valor_devido)}.` : `Valor para pagamento hoje (${C.dataBr(hoje)}): ${C.reais(r.valor_devido)} (${C.reais(t.a_pagar_sem_desconto)} + multa ${C.reais(r.multa)} + juros ${C.reais(r.juros)}). Em outro dia o valor muda: se precisar, pedimos que nos avise para atualizarmos.`);
    linhas.push('Se o pagamento já foi feito, por favor desconsidere esta mensagem e, se possível, nos envie o comprovante.');
  }
  const b = cb.banco || null;
  if (b && b.pix_copia_cola) linhas.push('', 'Pix copia e cola:', b.pix_copia_cola);
  if (b && b.linha_digitavel) linhas.push('', `Linha digitável do boleto: ${b.linha_digitavel}`);
  const assinatura = assinaturaLembrete(d, c);
  linhas.push('', 'Qualquer dúvida, estamos à disposição.', ...(assinatura ? ['', assinatura] : []));
  const assunto = fase === 'atrasado' ? `Boleto ${oQue} em aberto${onde}` : `Lembrete: boleto ${oQue}${onde} vence em ${C.dataBr(cb.vencimento)}`;
  return { fase, assunto, texto: linhas.join('\n'), email: (c && c.inquilino_email) || '', telefone: ((c && c.inquilino_telefone) || '').replace(/\D/g, '') };
}

/**
 * 2ª via com o valor do dia (pedido do dono de 17/11), para o boleto vencido e ainda a cobrar (``aCobrar`` e ``C.vencido``;
 * senão null): o valor para pagar em ``hoje`` com multa e juros por ``C.liquidar`` e o texto pronto ao inquilino. Não emite
 * boleto novo no banco: só calcula e escreve. Ex.: boleto de R$ 1.200,00 que venceu em 10/10/2026, em 24/11/2026 (45 dias):
 * multa 2% = R$ 24,00, juros 1% ao mês = R$ 18,00 → R$ 1.242,00.
 * Devolve { dias, original, multa, juros, valor, assunto, texto, email, telefone } (centavos).
 */
export function segundaVia(d, cb, hoje = C.hojeIso()) {
  if (!cb || !aCobrar(cb) || !C.vencido(cb.vencimento, hoje)) return null;
  const { c, nome, oQue, onde } = boletoNoTexto(d, cb);
  const r = C.liquidar(cb, hoje);
  const original = r.valor_devido - r.multa - r.juros;
  const linhas = [`Olá, ${nome}!`, '', `Segue a 2ª via do boleto ${oQue}${onde}, que venceu em ${C.dataBr(cb.vencimento)} (${C.plural(r.dias_atraso, 'dia')} de atraso), com o valor atualizado para pagamento hoje, ${C.dataBr(hoje)}:`, ''];
  linhas.push(`Valor do boleto: ${C.reais(original)}`);
  if (r.multa) linhas.push(`Multa (${C.pct(cb.multa_percentual)}): ${C.reais(r.multa)}`);
  if (r.juros) linhas.push(`Juros (${C.pct(cb.juros_mensal_percentual)} ao mês, ${C.plural(r.dias_atraso, 'dia')}): ${C.reais(r.juros)}`);
  linhas.push(`Total para pagar hoje: ${C.reais(r.valor_devido)}`, '', 'Este valor vale para pagamento hoje. Em outro dia ele muda: se for pagar depois, nos avise para atualizarmos.',
    'Se o pagamento já foi feito, por favor desconsidere esta mensagem e, se possível, nos envie o comprovante.');
  const b = cb.banco || null;
  if (b && b.pix_copia_cola) linhas.push('', 'Pix copia e cola:', b.pix_copia_cola);
  if (b && b.linha_digitavel) linhas.push('', `Linha digitável do boleto: ${b.linha_digitavel}`);
  const assinatura = assinaturaLembrete(d, c);
  linhas.push('', 'Qualquer dúvida, estamos à disposição.', ...(assinatura ? ['', assinatura] : []));
  return { dias: r.dias_atraso, original, multa: r.multa, juros: r.juros, valor: r.valor_devido,
    assunto: `2ª via: boleto ${oQue}${onde} com o valor de ${C.dataBr(hoje)}`, texto: linhas.join('\n'),
    email: (c && c.inquilino_email) || '', telefone: ((c && c.inquilino_telefone) || '').replace(/\D/g, '') };
}

// --------------------------------------------------------------------------
// Alertas adiáveis (D14): "adiar 7 dias" e "já estou cuidando" (só hoje: volta amanhã, pedido do dono), com quem marcou; o alerta some do Painel até a data
// --------------------------------------------------------------------------
export const DIAS_ADIAR_ALERTA = 7;
export const DIAS_CUIDANDO_ALERTA = 1; // 2026-11-07: o dono quer o alerta de volta no dia seguinte para resolver

/** Chave estável de um alerta (tipo + contrato/imóvel + âncora): o texto muda todo dia ("há 12 dias"), a chave não. */
export const chaveAlerta = (a) => [a.tipo, a.contrato_id || '', a.imovel_id || '', a.ancora || ''].join('|');

/** Adiamento em vigor para a chave (``ate`` >= hoje), ou null. */
export function adiamentoDe(d, chave, hoje = C.hojeIso()) {
  return (d.adiamentos_alerta || []).find((x) => x.chave === chave && x.ate >= hoje) || null;
}

/**
 * Todos os alertas com o campo ``adiamento`` preenchido nos adiados (o Painel mostra os demais e guarda os adiados recolhidos)
 * e ``desligado`` nos que alguém desligou para aquele inquilino ou imóvel (não aparecem até religar).
 */
export function alertasComAdiamento(d, hoje = C.hojeIso()) {
  return todosAlertas(d, hoje).map((a) => ({ ...a, chave: chaveAlerta(a), adiamento: adiamentoDe(d, chaveAlerta(a), hoje), desligado: desligamentoDe(d, a) }));
}

/**
 * Adia um alerta: ``modo`` "adiado" (7 dias) ou "cuidando" (só hoje, volta amanhã; quem marcou aparece no Painel). Troca o adiamento
 * anterior da mesma chave. Ex.: em 07/11/2026, "adiar 7 dias" esconde o alerta até 14/11/2026 (volta em 15/11).
 */
export function adiarAlerta(d, chave, modo, usuario, { hoje = C.hojeIso(), dias = null, tipo = '', quem = '' } = {}) {
  if (!['adiado', 'cuidando'].includes(modo)) throw new Error('Modo de adiamento desconhecido.');
  const n = dias || (modo === 'cuidando' ? DIAS_CUIDANDO_ALERTA : DIAS_ADIAR_ALERTA);
  const ate = C.somarDias(hoje, n - 1);
  const atual = (d.adiamentos_alerta || []).find((x) => x.chave === chave);
  const dados = { chave, tipo: tipo || chave.split('|')[0], modo, ate, quem: quem || usuario, em: hoje };
  const texto = `Alerta "${dados.tipo}" ${modo === 'cuidando' ? 'em cuidado por' : 'adiado por'} ${dados.quem} até ${C.dataBr(ate)}`;
  // devolve sempre o registro (``atualizar`` devolve só o que mudou: a tela lê ``ate``)
  if (!atual) return inserir(d, 'adiamentos_alerta', dados, usuario, texto);
  atualizar(d, 'adiamentos_alerta', atual.id, dados, usuario, texto);
  return buscar(d, 'adiamentos_alerta', atual.id);
}

/** Volta a mostrar o alerta (apaga o adiamento). */
export function voltarAlerta(d, chave, usuario) {
  const atual = (d.adiamentos_alerta || []).find((x) => x.chave === chave);
  if (atual) excluir(d, 'adiamentos_alerta', atual.id, usuario, `Alerta "${atual.tipo}" volta a aparecer`);
  return !!atual;
}

/** Adiamentos vencidos (``ate`` < hoje) ou de alertas que já não existem: apagados na rotina de abertura. */
export function adiamentosVencidos(d, hoje = C.hojeIso()) {
  const lista = d.adiamentos_alerta || [];
  if (!lista.length) return [];
  // só monta os alertas (caro) se sobrar adiamento ainda no prazo, para ver se o alerta dele ainda existe
  if (lista.every((x) => x.ate < hoje)) return [...lista];
  const chaves = new Set(todosAlertas(d, hoje).map(chaveAlerta));
  return lista.filter((x) => x.ate < hoje || !chaves.has(x.chave));
}

// --------------------------------------------------------------------------
// Alertas desligados (pedido do dono, 2026-11-13): um tipo de alerta deixa de aparecer para UM inquilino (ou para um imóvel, nos
// alertas que são do imóvel) até alguém religar. Ex.: "Seguro obrigatório" desligado para João da Loja 1: o Painel não cobra mais
// a apólice dele; os outros inquilinos continuam com o alerta, e quem entrar na Loja 1 depois também.
// --------------------------------------------------------------------------
/** De quem é o alerta: do inquilino (contrato), quando tem; senão, do imóvel. Alerta geral (ex.: extrato do banco) não tem alvo: não se desliga. */
export const alvoDoAlerta = (a) => (a.contrato_id ? { contrato_id: Number(a.contrato_id), imovel_id: null } : a.imovel_id ? { contrato_id: null, imovel_id: Number(a.imovel_id) } : null);

const mesmoAlvo = (x, tipo, alvo) => x.tipo === tipo && (x.contrato_id || null) === alvo.contrato_id && (x.imovel_id || null) === alvo.imovel_id;

/** O desligamento que esconde este alerta ({ tipo, contrato_id | imovel_id, quem, em }), ou null. */
export function desligamentoDe(d, a) {
  const alvo = alvoDoAlerta(a);
  return (alvo && (d.alertas_desligados || []).find((x) => mesmoAlvo(x, a.tipo, alvo))) || null;
}

/** "Loja 1 · João" (inquilino) ou "Loja 1" (imóvel): a quem o desligamento se refere. */
function nomeDoAlvo(d, alvo) {
  const c = alvo.contrato_id ? buscar(d, 'contratos', alvo.contrato_id) : null;
  const i = buscar(d, 'imoveis', c ? c.imovel_id : alvo.imovel_id);
  return [i && i.nome, c && c.inquilino_nome].filter(Boolean).join(' · ');
}

/**
 * Desliga um tipo de alerta para um inquilino (``alvo.contrato_id``) ou um imóvel (``alvo.imovel_id``), com quem desligou e quando.
 * Já desligado: devolve o que existe. Ex.: "Seguro obrigatório" de João (Loja 1) desligado por Ana em 13/11/2026.
 */
export function desligarAlerta(d, tipo, alvo, usuario, { hoje = C.hojeIso(), quem = '' } = {}) {
  if (!TIPOS_ALERTA.includes(tipo)) throw new Error('Tipo de alerta desconhecido.');
  const destino = alvoDoAlerta(alvo || {});
  if (!destino || !buscar(d, destino.contrato_id ? 'contratos' : 'imoveis', destino.contrato_id || destino.imovel_id)) throw new Error('Este alerta não é de um inquilino nem de um imóvel: não dá para desligar (use "Adiar").');
  const atual = (d.alertas_desligados || []).find((x) => mesmoAlvo(x, tipo, destino));
  if (atual) return atual;
  return inserir(d, 'alertas_desligados', { tipo, ...destino, quem: quem || usuario, em: hoje }, usuario, `Alerta "${tipo}" desligado para ${nomeDoAlvo(d, destino)}`);
}

/** Religa o alerta (apaga o desligamento): volta a aparecer se ainda estiver pendente. */
export function religarAlerta(d, id, usuario) {
  const atual = (d.alertas_desligados || []).find((x) => x.id === Number(id));
  if (atual) excluir(d, 'alertas_desligados', atual.id, usuario, `Alerta "${atual.tipo}" religado para ${nomeDoAlvo(d, alvoDoAlerta(atual))}`);
  return !!atual;
}

/**
 * Alertas desligados, para a lista de onde se religa: cada um com ``nome`` ("Loja 1 · João"), ``link`` e ``pendentes``
 * (quantos alertas ele está escondendo hoje; 0 = nada a avisar no momento). Com ``alvo``, só os daquele inquilino ou imóvel.
 */
export function alertasDesligados(d, hoje = C.hojeIso(), alvo = null, alertasDeHoje = null) {
  const destino = alvo && alvoDoAlerta(alvo);
  const regras = (d.alertas_desligados || []).filter((x) => !destino || mesmoAlvo(x, x.tipo, destino));
  if (!regras.length) return [];
  const hojeAlertas = alertasDeHoje || todosAlertas(d, hoje);
  return regras.map((x) => {
    const a = alvoDoAlerta(x);
    return { ...x, nome: nomeDoAlvo(d, a), link: a.contrato_id ? `#/contrato/${a.contrato_id}` : `#/imovel/${a.imovel_id}`,
      pendentes: hojeAlertas.filter((al) => { const b = alvoDoAlerta(al); return b && mesmoAlvo(x, al.tipo, b); }).length };
  }).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR') || x.tipo.localeCompare(y.tipo, 'pt-BR'));
}

/** Desligamentos de inquilino ou imóvel que já não existe: apagados na rotina de abertura. */
export const desligamentosOrfaos = (d) => (d.alertas_desligados || []).filter((x) => !(x.contrato_id ? buscar(d, 'contratos', x.contrato_id) : buscar(d, 'imoveis', x.imovel_id)));

/** Tipos de alerta que são do imóvel (os demais são do inquilino). */
export const TIPOS_ALERTA_DO_IMOVEL = ['IPTU do proprietário', 'Titularidade'];

// --------------------------------------------------------------------------
// Roteiro de saída do inquilino (D6): aviso prévio → vistoria → chaves → contas → cálculo final → garantia → último boleto
// --------------------------------------------------------------------------
/**
 * Etapas da saída, na ordem decidida pelo dono, cada uma com ``feito`` e um ``detalhe`` curto. Começa quando a data de saída
 * é informada (aviso prévio). Ex.: saída em 30/11/2026, hoje 07/11: aviso ✓, chaves ⬜ ("a partir de 30/11"), cálculo final ⬜.
 */
export function roteiroSaida(d, c, hoje = C.hojeIso()) {
  if (!c.data_saida || fimDeVinculo(d, c)) return [];
  const saiu = c.data_saida <= hoje;
  const vist = vistoriasDo(d, c.id).find((v) => v.tipo === 'Saída') || null;
  const leitura = leituraDo(d, c.id, 'Saída do inquilino');
  // o protocolo registrado (e não a falta do alerta, que some fora da janela de aviso: CON-08); sem imóvel, não há contas
  const titularidade = !!c.imovel_id && !titularidadeDevolvida(d, c);
  // leitura opcional (regra desligada): a etapa fecha só com a titularidade
  const contasOk = !titularidade && (!!leitura || !leituraObrigatoria());
  const e = encerramentoDo(d, c.id);
  // o que foi de fato depositado (caução só combinada não tem o que devolver, como no cálculo final: CON-09)
  const garantiaAntes = garantiaRecebida(d, c);
  const comp = C.competenciaDe(c.data_saida);
  const ultimo = boletoDoMes(d, c.id, comp);
  // o complemento da caução em aberto não segura a etapa do último boleto (é garantia, acerta-se no cálculo final)
  const abertos = d.cobrancas.filter((x) => x.contrato_id === c.id && aCobrar(x) && !ehComplementoCaucao(x) && (!ultimo || x.id !== ultimo.id));
  const garantia = (() => {
    if (!e) return { feito: false, detalhe: garantiaAntes > 0 ? `${C.reais(garantiaAntes)} a acertar no cálculo final` : 'sem caução ou depósito a devolver (confirma no cálculo final)' };
    if (e.garantia_devolvida_em) return { feito: true, detalhe: `${e.saldo >= 0 ? 'devolvida' : 'saldo acertado'} em ${C.dataBr(e.garantia_devolvida_em)}` };
    if (e.saldo > 0) return { feito: false, detalhe: `devolver ${C.reais(e.saldo)} ao inquilino` };
    if (e.saldo < 0) return { feito: false, detalhe: `cobrar ${C.reais(-e.saldo)} do inquilino (garantia não cobre os débitos)` };
    return { feito: true, detalhe: 'nada a devolver nem a cobrar' };
  })();
  // B3 (revisão jurídica): a vistoria de saída com data marcada, o convite por e-mail, se o inquilino veio e o prazo dele
  // para contestar o relatório (5 dias úteis do e-mail com a vistoria e as pendências, o da devolução das chaves)
  const convite = ultimoEnvioEmail(d, c.id, 'saida_vistoria');
  const relatorio = ultimoEnvioEmail(d, c.id, 'saida_chaves');
  const comoEnvio = (x) => (x.como === 'enviado' ? 'enviado' : 'aberto no Gmail');
  const res = vist ? resultadoVistoriaSaida(d, c) : null;
  const vistoriaDetalhe = vist
    ? [`feita em ${C.dataBr(vist.data)}`, vist.inquilino_presente ? `inquilino: ${vist.inquilino_presente.toLocaleLowerCase('pt-BR')}` : null,
      // B5: o valor de cada reparo, que vai para o cálculo final
      !res.pendencias.length ? 'sem pendências' : res.semValor ? `${res.pendencias.length} reparo(s); falta o valor de ${res.semValor}` : `${res.pendencias.length} reparo(s): ${C.reais(res.totalReparos)}`,
      relatorio ? `relatório ${comoEnvio(relatorio)} em ${C.dataBr(relatorio.data)}; ele pode contestar até ${C.dataBr(prazoContestarSaida(relatorio.data))}`
        : 'falta enviar o relatório ao inquilino (e-mail da devolução das chaves)']
    : [c.vistoria_saida_data ? `marcada para ${C.dataBr(c.vistoria_saida_data)}${c.vistoria_saida_hora ? ` às ${c.vistoria_saida_hora}` : ''}` : saiu ? 'ainda não registrada; data não marcada' : `a partir de ${C.dataBr(c.data_saida)}; data não marcada`,
      c.vistoria_saida_data ? (convite && convite.data >= (c.vistoria_saida_marcada_em || '') ? `convite ${comoEnvio(convite)} em ${C.dataBr(convite.data)}` : 'falta mandar o convite ao inquilino') : null];
  // B4: a etapa das chaves fecha com o termo de devolução assinado (saídas já acertadas antes do termo: pelo cálculo final)
  const termo = c.termo_chaves_saida;
  // o termo de devolução das chaves existe desde 13/11/2026: só as saídas de antes fecham a etapa pelo cálculo final
  const semTermoAntigo = !!c.data_saida && c.data_saida < '2026-11-13';
  return [
    { chave: 'aviso', titulo: 'Aviso prévio: data de saída informada', feito: true, detalhe: `saída em ${C.dataBr(c.data_saida)}` },
    { chave: 'vistoria', titulo: 'Vistoria de saída (com a leitura dos relógios)', feito: !!vist, detalhe: vistoriaDetalhe.filter(Boolean).join(' · ') },
    { chave: 'chaves', titulo: 'Devolução das chaves (termo assinado)', feito: !!termo || (saiu && !!e && semTermoAntigo),
      // só o termo assinado prova a devolução; sem ele, a data de saída é só a combinada (2026-11-20)
      detalhe: termo ? (saiu ? `chaves devolvidas (saída em ${C.dataBr(c.data_saida)}); termo de devolução assinado ✓` : `termo de devolução assinado ✓ (saída prevista para ${C.dataBr(c.data_saida)})`)
        : saiu ? (e && semTermoAntigo ? `saída em ${C.dataBr(c.data_saida)}; acertada sem termo (saída de antes do termo de devolução)` : `devolução prevista para ${C.dataBr(c.data_saida)}; falta anexar o termo de devolução assinado`) : `prevista para ${C.dataBr(c.data_saida)}` },
    { chave: 'contas', titulo: 'Contas: titularidade de volta ao proprietário e leitura final', feito: contasOk,
      detalhe: [titularidade ? 'falta o protocolo da volta da titularidade' : 'titularidade de volta ✓', leitura ? 'leitura da saída ✓' : leituraObrigatoria() ? 'falta a leitura dos relógios na saída' : 'sem a leitura dos relógios (não é obrigatória)'].join(' · ') },
    { chave: 'calculo', titulo: 'Cálculo final (garantia corrigida, débitos, FCI)', feito: !!e, detalhe: e ? `${e.saldo >= 0 ? 'a devolver' : 'a cobrar'} ${C.reais(Math.abs(e.saldo))}` : saiu ? 'pendente' : 'depois da saída' },
    { chave: 'garantia', titulo: 'Devolução da garantia (ou cobrança do saldo)', ...garantia },
    { chave: 'boleto', titulo: `Último boleto (aluguel de ${C.compBr(comp)}, proporcional)`, feito: !!ultimo && (!!ultimo.data_pagamento || quitadoNaSaida(ultimo) || emAcordo(ultimo)) && !abertos.length,
      detalhe: !ultimo ? 'ainda não gerado (tela Boletos)' : emAcordo(ultimo) ? (abertos.length ? `em acordo; ${abertos.length} boleto(s) em aberto (parcelas do acordo ou outros)` : 'em acordo; parcelas pagas') : quitadoNaSaida(ultimo) ? (abertos.length ? `descontado da garantia; ${abertos.length} outro(s) boleto(s) em aberto` : 'descontado da garantia no cálculo final') : ultimo.data_pagamento ? (abertos.length ? `pago; ${abertos.length} outro(s) boleto(s) em aberto` : `pago em ${C.dataBr(ultimo.data_pagamento)}`) : `em aberto, vence ${C.dataBr(ultimo.vencimento)}`, cobranca_id: ultimo ? ultimo.id : null },
    // arquivo físico (pedido do dono em 2026-11-12): imprimir o processo inteiro e guardar em papel por 10 anos depois do fim;
    // com a rotina Arquivo impresso ligada (2026-11-15), a pasta da saída se monta na tela da pasta, depois da devolução da garantia
    AI.ligado() ? (() => {
      const f = AI.saidaFechada(d, c);
      return { chave: 'arquivo', titulo: 'Montar a pasta física da saída', feito: !!f, pasta: true, pronta: !!garantia.feito,
        detalhe: f ? `pasta fechada em ${C.dataBr(f.data)}; guardar até ${C.dataBr(C.somarMesesData(c.data_saida, 120))} (10 anos)`
          : garantia.feito ? `escolha o que imprimir (sem comprovantes nem boletos); guardar até ${C.dataBr(C.somarMesesData(c.data_saida, 120))} (10 anos)` : 'depois da devolução da garantia (ou da cobrança do saldo)' };
    })()
      : { chave: 'arquivo', titulo: 'Arquivo físico: imprimir o processo e guardar em papel', feito: !!c.arquivo_fisico_em,
        detalhe: c.arquivo_fisico_em ? `arquivado em ${C.dataBr(c.arquivo_fisico_em)}` : `contrato, aditivos, vistorias, termos, cálculo final e comprovantes; guardar até ${C.dataBr(C.somarMesesData(c.data_saida, 120))} (10 anos)` },
  ];
}

/** Prazo do inquilino para contestar o relatório da vistoria de saída: 5 dias úteis do envio (cláusula da vistoria de saída). */
export const PRAZO_CONTESTAR_SAIDA = 5;
export const prazoContestarSaida = (envio) => C.somarDiasUteis(envio, PRAZO_CONTESTAR_SAIDA);

/** Último e-mail de uma etapa (aberto ou enviado) do contrato: registro de ``envios_email`` ou null. */
export function ultimoEnvioEmail(d, contratoId, chave) {
  return (d.envios_email || []).filter((x) => x.contrato_id === contratoId && x.chave === chave)
    .reduce((a, x) => (!a || x.data > a.data || (x.data === a.data && x.id > a.id) ? x : a), null);
}

/**
 * Vistoria de saída marcada (B3): data e hora combinadas com o inquilino, para o convite por e-mail e o termo de devolução das
 * chaves. ``data`` vazia desmarca. Ex.: saída em 10/03/2027, vistoria marcada para 12/03/2027 às 14:00.
 */
export function marcarVistoriaSaida(d, contratoId, data, hora, usuario, hoje = C.hojeIso()) {
  const c = buscar(d, 'contratos', contratoId);
  if (!c) throw new Error('Inquilino não encontrado.');
  if (!c.data_saida) throw new C.ErroUsuario('Informe antes a data de saída.');
  if (data && !C.dataValida(data)) throw new C.ErroUsuario('Informe a data da vistoria.');
  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new C.ErroUsuario('Informe a hora da vistoria (ex.: 14:00).');
  atualizar(d, 'contratos', c.id, { vistoria_saida_data: data || null, vistoria_saida_hora: data ? hora || null : null, vistoria_saida_marcada_em: data ? hoje : null }, usuario,
    data ? `${c.inquilino_nome}: vistoria de saída marcada para ${C.dataBr(data)}${hora ? ` às ${hora}` : ''}` : `${c.inquilino_nome}: data da vistoria de saída desmarcada`);
}

/**
 * Valor de cada reparo da vistoria de saída (B5), com o orçamento: ``lista`` [{ pendencia, valor (centavos, null = sem valor), orcamento,
 * pintura (opcional: é reparo de pintura), orcamento_valor (opcional: orçamento inteiro da pintura, em centavos) }].
 * Só as pendências atuais da vistoria ficam guardadas. Ex.: porta riscada R$ 350,00 + pintura da sala R$ 700,00 = R$ 1.050,00.
 */
export function valoresReparos(d, vistoriaId, lista, usuario) {
  const v = buscar(d, 'vistorias', vistoriaId);
  if (!v || v.tipo !== 'Saída') throw new Error('Vistoria de saída não encontrada.');
  const c = buscar(d, 'contratos', v.contrato_id);
  const atuais = new Set(resultadoVistoriaSaida(d, c).pendencias);
  const reparos = {};
  for (const x of lista) {
    if (!atuais.has(x.pendencia)) continue;
    if (x.valor !== null && !(Number.isInteger(x.valor) && x.valor >= 0)) throw new C.ErroUsuario(`Valor inválido em "${x.pendencia}".`);
    const ov = x.orcamento_valor === undefined ? null : x.orcamento_valor;
    if (ov !== null && !(Number.isInteger(ov) && ov >= 0)) throw new C.ErroUsuario(`Orçamento inválido em "${x.pendencia}".`);
    if (x.valor === null && !String(x.orcamento || '').trim() && ov === null) continue;
    // pintura (24/11/2026): a marca e o orçamento inteiro ficam guardados para a sugestão (K.sugestaoPintura) ao reabrir
    reparos[x.pendencia] = { valor: x.valor, orcamento: String(x.orcamento || '').trim(),
      ...(x.pintura !== undefined ? { pintura: !!x.pintura } : {}), ...(ov !== null ? { orcamento_valor: ov } : {}) };
  }
  const total = Object.values(reparos).reduce((s, x) => s + (x.valor || 0), 0);
  atualizar(d, 'vistorias', v.id, { reparos }, usuario, `${c.inquilino_nome}: valores dos reparos da vistoria de saída (${C.reais(total)})`);
}

/** Marca o processo do inquilino que saiu como impresso e guardado em papel (``data`` vazia desfaz). */
export function marcarArquivoFisico(d, contratoId, data, usuario) {
  const c = buscar(d, 'contratos', contratoId);
  if (!c) throw new Error('Inquilino não encontrado.');
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data.');
  atualizar(d, 'contratos', c.id, { arquivo_fisico_em: data || null }, usuario, data ? `${c.inquilino_nome}: processo impresso para o arquivo físico em ${C.dataBr(data)}` : `${c.inquilino_nome}: arquivo físico desmarcado`);
}

/** Marca a garantia como devolvida (ou o saldo cobrado) no cálculo final; ``data`` vazia desfaz. */
export function marcarGarantiaDevolvida(d, encerramentoId, data, usuario) {
  const e = buscar(d, 'encerramentos', encerramentoId);
  if (!e) throw new Error('Cálculo final não encontrado.');
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new C.ErroUsuario('Informe a data da devolução.');
  const c = buscar(d, 'contratos', e.contrato_id);
  const saida = e.data_saida || (c && c.data_saida);
  if (data && saida && data < saida) throw new C.ErroUsuario(`A data (${C.dataBr(data)}) é antes da saída (${C.dataBr(saida)}).`);
  atualizar(d, 'encerramentos', e.id, { garantia_devolvida_em: data || null }, usuario,
    data ? `${c ? `${c.inquilino_nome}: ` : ''}garantia ${e.saldo >= 0 ? 'devolvida' : 'saldo acertado'} em ${C.dataBr(data)}` : `${c ? `${c.inquilino_nome}: ` : ''}devolução da garantia desfeita`);
  return e;
}

/**
 * Os dois contratos são do mesmo inquilino? Pelo CPF/CNPJ (só os números) quando os dois têm; senão, pelo nome (sem acento,
 * maiúsculas ou espaços a mais). Ex.: renovação da Maria → sim; troca de titular da Maria para o Pedro → não.
 */
export function mesmaPessoaDoContrato(a, b) {
  const doc = (x) => String(x.inquilino_cpf || '').replace(/\D/g, '');
  if (doc(a) && doc(b)) return doc(a) === doc(b);
  const nome = (x) => String(x.inquilino_nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
  return !!nome(a) && nome(a) === nome(b);
}

// --------------------------------------------------------------------------
// Declaração anual de aluguéis para o IRPF do inquilino (D9): por empresa que emitiu as NFs, o aluguel efetivamente pago no ano
// --------------------------------------------------------------------------
/**
 * Valores que o inquilino pagou de aluguel no ano-calendário, por empresa emitente: as NFs emitidas (não canceladas) dos boletos
 * do contrato (e dos contratos anteriores da mesma cadeia que são da mesma pessoa: renovação), com emissão no ano. A NF é só o
 * aluguel (sem IPTU, seguro, tarifa e FCI), por isso serve de base. Ex.: 12 NFs de R$ 1.218,50 em 2026 → total R$ 14.622,00.
 * Troca de titular (decisão do dono, 21/11/2026, impressos-002): cada um declara só o que pagou. Ex.: Maria pagou jan a jun e
 * passou o contrato ao Pedro em julho → a declaração do Pedro tem só jul a dez; a da Maria (no contrato dela) tem jan a jun.
 */
export function declaracaoAnual(d, contratoId, ano) {
  const c = buscar(d, 'contratos', contratoId);
  if (!c) throw new Error('Inquilino não encontrado.');
  const ids = new Set([c.id]);
  // sobe a cadeia enquanto for a mesma pessoa; o primeiro contrato de outro titular (e os de antes dele) fica de fora
  for (const x of [...cadeiaDeContratos(d, c).antes].reverse()) { if (!mesmaPessoaDoContrato(x, c)) break; ids.add(x.id); }
  const cobrancas = new Map(d.cobrancas.filter((x) => ids.has(x.contrato_id)).map((x) => [x.id, x]));
  const nfs = d.faturas.filter((f) => f.situacao === 'Emitida' && f.origem_tipo === 'cobranca' && cobrancas.has(f.origem_id) && String(f.emissao).slice(0, 4) === String(ano))
    .sort((a, b) => a.emissao.localeCompare(b.emissao) || a.numero - b.numero);
  const porEmpresa = new Map();
  for (const f of nfs) {
    const cb = cobrancas.get(f.origem_id);
    if (!porEmpresa.has(f.emitente_id)) porEmpresa.set(f.emitente_id, { emitente: buscar(d, 'emitentes', f.emitente_id), itens: [], total: 0 });
    const g = porEmpresa.get(f.emitente_id);
    g.itens.push({ numero: f.numero, emissao: f.emissao, competencia: cb.competencia, valor: f.valor, pago_em: cb.data_pagamento });
    g.total += f.valor;
  }
  // aluguéis pagos no ano sem NF (boleto de controle): não entram na declaração (ela é pelas NFs), mas a tela avisa, para não
  // sair uma declaração de R$ 0,00 sem explicação (a forma de declarar esses fica com o contador, pendência D5)
  const comNf = new Set(nfs.map((f) => f.origem_id));
  const semNf = [...cobrancas.values()].filter((cb) => cb.data_pagamento && String(cb.data_pagamento).slice(0, 4) === String(ano) && !ehComplementoCaucao(cb) && !comNf.has(cb.id)
    && !faturasDe(d, 'cobranca', cb.id).length && !geraNf(buscar(d, 'contratos', cb.contrato_id)))
    .map((cb) => ({ competencia: cb.competencia, pago_em: cb.data_pagamento, valor: cb.valor_nf || 0 })).sort((a, b) => a.pago_em.localeCompare(b.pago_em));
  return { contrato: c, imovel: buscar(d, 'imoveis', c.imovel_id), ano: Number(ano), empresas: [...porEmpresa.values()].sort((a, b) => a.emitente.nome.localeCompare(b.emitente.nome, 'pt-BR')), total: nfs.reduce((s, f) => s + f.valor, 0),
    semNf, totalSemNf: semNf.reduce((s, x) => s + x.valor, 0) };
}

// --------------------------------------------------------------------------
// Regras do sistema escolhidas pelo administrador (definições e padrão em config-regras.js; tela em Sistema → Regras)
// --------------------------------------------------------------------------
export { regra, regrasDe, PADRAO_SISTEMA, DEFINICOES_REGRAS, GRUPOS_REGRAS, especiaisDiferentes } from './config-regras.js';

/**
 * Grava as regras ``valores`` ({ chave: valor }; o que faltar volta ao padrão do sistema): uma linha em ``config_regras`` por
 * regra diferente do padrão, pelo histórico. Devolve quantas regras mudaram. Ex.: { multa_padrao: 2 } (o padrão) apaga a linha.
 * A regra que fica em outra tela (`fora`, ex.: a assinatura digital) só muda por ``mudarRegraSistema`` dela mesma (``foraQueMuda``):
 * salvar a tela, voltar a uma versão, carregar o arquivo ou voltar ao padrão a deixam como está, mesmo se vier nos valores.
 */
export function salvarRegrasSistema(d, valores, usuario, motivo = 'Regras do sistema', foraQueMuda = null) {
  const limpos = {};
  for (const [k, v] of Object.entries(valores || {})) if (CR.definicaoRegra(k)) limpos[k] = CR.limparValorRegra(k, v);
  let mudou = 0;
  const antes = CR.regrasDe(d);
  const naNfAntes = antes.ressarcimento_na_nf;
  const tarifaAntes = antes.tarifa_padrao;
  for (const def of CR.DEFINICOES_REGRAS) {
    // a que fica em outra tela (`fora`, ex.: a assinatura digital) continua como está, salvo pelo botão dela (foraQueMuda)
    const novo = def.fora && def.chave !== foraQueMuda ? antes[def.chave] : def.chave in limpos ? limpos[def.chave] : def.padrao;
    const linha = d.config_regras.find((r) => r.chave === def.chave);
    const padrao = CR.mesmoValor(novo, def.padrao);
    if (linha && padrao) { excluir(d, 'config_regras', linha.id, usuario, `${motivo}: ${def.rotulo} volta ao padrão do sistema`); mudou += 1; }
    else if (linha && !CR.mesmoValor(linha.valor, novo)) { atualizar(d, 'config_regras', linha.id, { valor: novo }, usuario, `${motivo}: ${def.rotulo}`); mudou += 1; }
    else if (!linha && !padrao) { inserir(d, 'config_regras', { chave: def.chave, valor: novo }, usuario, `${motivo}: ${def.rotulo}`); mudou += 1; }
  }
  // as duas regras que ficavam fora daqui (regrasAntigasDe) já têm a linha própria (ou voltaram ao padrão): o campo antigo sai
  if (d.ressarcimento_abate_nf) { d.ressarcimento_abate_nf = false; mudou += 1; }
  if (d.config_banco && 'tolerancia_dias' in d.config_banco) { const { tolerancia_dias: antiga, ...resto } = d.config_banco; d.config_banco = resto; }
  CR.usarRegras(d);
  // ressarcimento na NF mudou: os boletos em aberto com ressarcimento passam a seguir a regra nova (os pagos não mudam)
  const naNf = CR.regra('ressarcimento_na_nf');
  if (naNf !== naNfAntes) for (const cb of d.cobrancas.filter((x) => !x.data_pagamento && x.ressarcimento > 0 && !!x.ressarcimento_na_nf !== naNf)) atualizar(d, 'cobrancas', cb.id, { ressarcimento_na_nf: naNf }, usuario, 'Ressarcimento na NF (regra do sistema)');
  // tarifa padrão mudou: os boletos em aberto de quem a segue acompanham (os da regra especial com tarifa própria, não)
  if (!CR.mesmoValor(CR.regra('tarifa_padrao'), tarifaAntes)) recalcularTarifaPadrao(d, usuario, (c) => !c.perfil_regras_id || CR.regra('tarifa_padrao', c) === CR.regra('tarifa_padrao'));
  return mudou;
}

/** Muda uma regra só, mantendo as outras como estão. */
export const mudarRegraSistema = (d, chave, valor, usuario) => salvarRegrasSistema(d, { ...CR.escolhasDe(d), [chave]: valor }, usuario, undefined, chave);

/** Volta todas as regras ao padrão do sistema (as regras do dono, no código). */
export const voltarRegrasAoPadrao = (d, usuario) => salvarRegrasSistema(d, {}, usuario, 'Regras do sistema (volta ao padrão)');

/** Guarda uma cópia das regras em uso com um nome (ex.: "Regras de nov/2026"), para voltar a ela depois. */
export function salvarVersaoRegras(d, nome, usuario) {
  const n = String(nome || '').trim().slice(0, 80);
  if (!n) throw new C.ErroUsuario('Dê um nome à versão das regras (ex.: "Regras de novembro de 2026").');
  return inserir(d, 'versoes_regras', { nome: n, salvo_em: new Date().toISOString(), salvo_por: usuario || '', valores: CR.regrasDe(d) }, usuario, `Versão das regras salva: ${n}`);
}

/** Volta às regras de uma versão salva (regra criada depois da versão fica no padrão do sistema). */
export function restaurarVersaoRegras(d, id, usuario) {
  const v = d.versoes_regras.find((x) => x.id === Number(id));
  if (!v) throw new C.ErroUsuario('Versão das regras não encontrada.');
  const valores = {};
  for (const [k, x] of Object.entries(v.valores || {})) if (CR.definicaoRegra(k)) { try { valores[k] = CR.limparValorRegra(k, x); } catch { /* fica o padrão */ } }
  return salvarRegrasSistema(d, valores, usuario, `Regras do sistema (volta à versão "${v.nome}")`);
}

// --------------------------------------------------------------------------
// Regras especiais (pedido do dono de 18/11/2026): grupos de regras com nome que alguns contratos seguem no lugar das regras do
// sistema. Ex.: "Regra especial A" com o proporcional pelos dias reais; o contrato escolhe "Regras do sistema" ou uma delas.
// Cada regra especial guarda só o que difere das regras do sistema: o resto acompanha as do sistema, mesmo se elas mudarem depois.
// --------------------------------------------------------------------------
/** Nome das regras que o contrato segue: "Regras do sistema" ou o nome da regra especial. */
export function nomeDasRegras(d, c) {
  const p = c && c.perfil_regras_id ? (d.perfis_regras || []).find((x) => x.id === Number(c.perfil_regras_id)) : null;
  return p ? p.nome : 'Regras do sistema';
}

/** Contratos (ativos e encerrados) que seguem a regra especial ``id``. */
export const contratosDoPerfil = (d, id) => d.contratos.filter((c) => Number(c.perfil_regras_id) === Number(id));

/** O que a regra especial muda em relação às regras do sistema de hoje: [{ def, valor, sistema }]. */
export function diferencasDoPerfil(d, p) {
  const v = CR.valoresDoPerfil(p);
  const sistema = CR.regrasDe(d);
  return CR.DEFINICOES_REGRAS.filter((def) => def.chave in v && !CR.mesmoValor(v[def.chave], sistema[def.chave]))
    .map((def) => ({ def, valor: v[def.chave], sistema: sistema[def.chave] }));
}

/**
 * Cria (``id`` vazio) ou altera uma regra especial: { nome, descricao, valores: { chave: valor } }. Só as regras que podem mudar
 * por contrato são guardadas, e só as diferentes das regras do sistema de hoje. Ex.: { nome: 'Regra especial A',
 * valores: { proporcional: 'dias_reais', multa_padrao: 2 } } com a multa do sistema em 2% → guarda só o proporcional.
 */
export function salvarPerfilRegras(d, id, { nome, descricao = '', valores = {} }, usuario) {
  const n = String(nome || '').trim().slice(0, 60);
  if (!n) throw new C.ErroUsuario('Dê um nome à regra especial (ex.: "Regra especial A" ou "Regra 15 dias").');
  if (/^regras? do sistema$/i.test(n)) throw new C.ErroUsuario('"Regras do sistema" é o nome das regras de todos: escolha outro nome.');
  const outro = (d.perfis_regras || []).find((x) => x.id !== Number(id) && x.nome.toLocaleLowerCase('pt-BR') === n.toLocaleLowerCase('pt-BR'));
  if (outro) throw new C.ErroUsuario(`Já existe uma regra especial chamada "${n}".`);
  const sistema = CR.regrasDe(d);
  const limpos = {};
  for (const [k, v] of Object.entries(valores || {})) {
    if (!CR.podePorContrato(k)) continue;
    const x = CR.limparValorRegra(k, v);
    if (!CR.mesmoValor(x, sistema[k])) limpos[k] = x;
  }
  const dados = { nome: n, descricao: String(descricao || '').trim().slice(0, 300), valores: limpos };
  const r = id ? buscar(d, 'perfis_regras', Number(id)) : null;
  if (id && !r) throw new C.ErroUsuario('Regra especial não encontrada.');
  const tarifaAntes = r ? (r.valores || {}).tarifa_padrao : undefined;
  const salvo = r ? (atualizar(d, 'perfis_regras', r.id, dados, usuario, `Regra especial "${n}" alterada`), r)
    : inserir(d, 'perfis_regras', { ...dados, criado_em: C.hojeIso() }, usuario, `Regra especial "${n}" criada`);
  CR.usarRegras(d);
  // tarifa da regra especial mudou: os boletos em aberto dos contratos dela que seguem a tarifa padrão acompanham (24/11/2026)
  if (r && !CR.mesmoValor(tarifaAntes, limpos.tarifa_padrao)) recalcularTarifaPadrao(d, usuario, (c) => c.perfil_regras_id === r.id);
  return salvo;
}

/** Exclui uma regra especial: os contratos que a seguiam voltam às regras do sistema (cada um com a linha no histórico). */
export function excluirPerfilRegras(d, id, usuario) {
  const p = buscar(d, 'perfis_regras', Number(id));
  if (!p) throw new C.ErroUsuario('Regra especial não encontrada.');
  const contratos = contratosDoPerfil(d, p.id);
  for (const c of contratos) atualizar(d, 'contratos', c.id, { perfil_regras_id: null }, usuario, `${c.inquilino_nome}: volta às regras do sistema (regra especial "${p.nome}" excluída)`);
  excluir(d, 'perfis_regras', p.id, usuario, `Regra especial "${p.nome}" excluída`);
  CR.usarRegras(d);
  // a regra especial tinha tarifa própria: os boletos em aberto dos contratos dela que seguem a tarifa padrão passam à do sistema
  if ('tarifa_padrao' in (p.valores || {}) && !CR.mesmoValor(p.valores.tarifa_padrao, CR.regra('tarifa_padrao'))) {
    const ids = new Set(contratos.map((c) => c.id));
    recalcularTarifaPadrao(d, usuario, (c) => ids.has(c.id));
  }
  return contratos.length;
}

/**
 * Valores que o Novo contrato traz preenchidos pelas regras (a ficha e a pessoa escolhida vêm por cima). Com ``perfil`` (id da
 * regra especial), os dela; o formulário também já vem com a regra especial escolhida.
 */
export function padroesNovoContrato(perfil = null) {
  const ctx = { perfil_regras_id: perfil ? Number(perfil) : null };
  const r = (k) => CR.regra(k, ctx);
  const out = { multa_percentual: r('multa_padrao'), juros_mensal_percentual: r('juros_padrao'), bonificacao: r('bonificacao_padrao'),
    cobranca_mes_seguinte: r('mes_seguinte_padrao'), conta_iptu: r('conta_iptu_padrao'), conta_seguro: r('conta_seguro_padrao') };
  if (CR.perfilDe(ctx)) out.perfil_regras_id = CR.perfilDe(ctx);
  if (r('bonificacao_percentual_padrao') !== null && r('bonificacao_padrao')) out.desconto_pontualidade_percentual = r('bonificacao_percentual_padrao');
  // tarifa do boleto: não vem preenchida; o contrato em branco segue a regra `tarifa_padrao` (tarifaDoContrato, 24/11/2026)
  if (r('fci_percentual_padrao') !== null) out.fci_percentual = r('fci_percentual_padrao');
  // o índice vem preenchido mesmo com o % em branco (o campo só aparece quando o % é digitado; sem %, o cadastro o apaga)
  if (r('fci_indice_padrao')) out.fci_indice = r('fci_indice_padrao');
  if (r('indice_padrao')) out.indice_correcao = r('indice_padrao');
  const prazo = prazoPadraoNovoContrato('Residencial', perfil);
  if (prazo !== null) out.prazo_meses = prazo;
  return out;
}

/**
 * Prazo (meses) que vem preenchido no Novo contrato conforme a finalidade: residencial pela regra `prazo_residencial_padrao`,
 * não residencial pela `prazo_comercial_padrao` (null = em branco, digitar em cada contrato). Ex.: comercial com a regra em 60 → 60.
 */
export function prazoPadraoNovoContrato(finalidade, perfil = null) {
  const ctx = { perfil_regras_id: perfil ? Number(perfil) : null };
  const v = CR.regra(finalidade === 'Não residencial' ? 'prazo_comercial_padrao' : 'prazo_residencial_padrao', ctx);
  return v === null || v === undefined || v === '' ? null : v;
}

/**
 * Avisos das regras ao salvar o contrato (só avisam: quem confirma, salva). Ex.: residencial de 24 meses, bonificação de 15%,
 * caução de 4 aluguéis, "Fiador + depósito".
 */
export function avisosLegaisDoContrato(dados) {
  const out = [];
  const r = (k) => CR.regra(k, dados); // regra especial escolhida no formulário (perfil_regras_id), se houver
  const residencial = (dados.finalidade || 'Residencial') === 'Residencial';
  if (residencial && dados.prazo_tipo !== 'Indeterminado' && dados.prazo_meses > 0 && dados.prazo_meses < 30) {
    out.push(`Contrato residencial de ${dados.prazo_meses} meses: com menos de 30 meses, no fim o contrato se prorroga e o imóvel só pode ser pedido de volta nos casos da lei ou depois de 5 anos (Lei 8.245/91, arts. 46 e 47).`);
  }
  const bon = dados.bonificacao === false ? 0 : Number(dados.desconto_pontualidade_percentual) || 0;
  if (bon > r('bonificacao_limite_aviso')) out.push(`Bonificação de ${C.pct(bon)}, acima de ${C.pct(r('bonificacao_limite_aviso'))}: quanto maior o desconto, maior o risco de um juiz tratar a perda dele como uma segunda multa e reduzir a cobrança (Código Civil, art. 413).`);
  if (Number(dados.multa_percentual) > 10) out.push(`Multa por atraso de ${C.pct(dados.multa_percentual)}: acima de 10% o juiz costuma reduzir (Lei de Usura, art. 9º; Código Civil, art. 413).`);
  if (Number(dados.juros_mensal_percentual) > 1) out.push(`Juros de ${C.pct(dados.juros_mensal_percentual)} ao mês: com pessoa física, acima de 1% ao mês pode ser reduzido (Código Civil, art. 406; Lei de Usura, art. 1º).`);
  const aluguel = Number(dados.aluguel_inicial) || 0;
  const garantia = dados.garantia_tipo === 'Caução' ? Number(dados.caucao_valor) || 0 : ['Depósito garantia', 'Fiador + depósito'].includes(dados.garantia_tipo) ? Number(dados.deposito_valor) || 0 : 0;
  const limite = r('caucao_limite_aviso');
  if (aluguel > 0 && garantia > 0) {
    // sempre pelo aluguel com bonificação (a leitura de risco: o juiz pode entender que o aluguel é o pago em dia), também com a
    // regra `caucao_base` = cheio. Ex.: 3 × R$ 2.000,00 = R$ 6.000,00 com bonificado de R$ 1.800,00 → passa de 3 × R$ 1.800,00
    const pctB = dados.bonificacao === false ? 0 : Number(dados.desconto_pontualidade_percentual) || 0;
    const base = aluguel - C.descontoPorPercentual(aluguel, pctB);
    if (garantia > limite * base) out.push(`${dados.garantia_tipo === 'Caução' ? 'Caução' : 'Depósito de garantia'} de ${C.reais(garantia)}, mais de ${limite} aluguéis (${C.reais(limite * base)}): a caução em dinheiro não pode passar de 3 meses de aluguel (Lei 8.245/91, art. 38, §2º) e pedir mais do que a lei permite é contravenção (art. 43, I).`);
  } else if (dados.garantia_tipo === 'Caução' && Number(dados.caucao_meses) > limite) {
    out.push(`Caução de ${dados.caucao_meses} aluguéis, mais de ${limite}: a caução em dinheiro não pode passar de 3 meses de aluguel (Lei 8.245/91, art. 38, §2º).`);
  }
  if (dados.garantia_tipo === 'Fiador + depósito' && r('aviso_fiador_deposito')) {
    out.push('"Fiador + depósito": os tribunais costumam tratar o depósito em dinheiro como caução; aí são duas garantias, o que a Lei 8.245/91 proíbe (art. 37, parágrafo único): risco de ter de devolver o depósito e de contravenção (art. 43, II).');
  }
  return out;
}

// --------------------------------------------------------------------------
// Cobrança: registros e provas (2026-11-24)
// --------------------------------------------------------------------------
// Cada passo e cada gasto da cobrança de um atraso (carta, e-mail, notificação, protesto, cartório, advogado…), com a data, o
// valor gasto, a descrição e os comprovantes (vários arquivos, na pasta do inquilino). Só guarda a prova para levar ao
// advogado: NADA daqui entra no boleto, na NF, no acordo nem no cálculo final da saída (decisão do dono pendente, ver
// documentacao/HONORARIOS_E_DESPESAS_DE_COBRANCA.md). Tabela `cobranca_registros`: { contrato_id, cobranca_id?, acordo_id?,
// data, tipo, valor (centavos, opcional), descricao, arquivos: [nomes] }.
export const TIPOS_REGISTRO_COBRANCA = ['Carta', 'E-mail', 'WhatsApp / ligação', 'Notificação', 'Protesto', 'Cartório', 'Advogado', 'Outro'];

/** Registros da cobrança de um contrato, do mais antigo para o mais novo (a ordem em que o advogado lê). */
export const registrosCobrancaDo = (d, contratoId) => (d.cobranca_registros || []).filter((x) => x.contrato_id === contratoId)
  .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')) || a.id - b.id);

/** Acordo de que o boleto faz parte (o boleto original que ele substituiu ou a parcela dele); null se nenhum. */
const acordoDoBoleto = (cb) => (cb && (cb.acordo_id || cb.acordo_parcela_de)) || null;

/** Registros ligados a um boleto: os do próprio boleto e os do acordo de que ele faz parte. */
export function registrosDoBoleto(d, cb) {
  const a = acordoDoBoleto(cb);
  return (d.cobranca_registros || []).filter((x) => x.cobranca_id === cb.id || (a && x.acordo_id === a))
    .sort((x, y) => String(x.data || '').localeCompare(String(y.data || '')) || x.id - y.id);
}

/**
 * A que o registro se refere, em texto. Ex.: "boleto de 10/2026 (vence 05/11/2026)", "acordo de 12/11/2026", "cobrança em geral".
 * Boleto ou acordo excluído depois: diz que foi excluído (o registro e a prova ficam).
 */
export function referenteDoRegistro(d, r) {
  if (r.cobranca_id) {
    const cb = buscar(d, 'cobrancas', r.cobranca_id);
    if (!cb) return 'boleto (excluído depois)';
    const qual = ehComplementoCaucao(cb) ? 'complemento da caução' : ehParcelaAcordo(cb) ? `parcela ${cb.acordo_parcela || ''} do acordo`.replace('  ', ' ') : C.compBr(cb.competencia);
    return `boleto de ${qual} (vence ${C.dataBr(cb.vencimento)})`;
  }
  if (r.acordo_id) {
    const a = buscar(d, 'acordos', r.acordo_id);
    return a ? `acordo de ${C.dataBr(a.data)}${a.desfeito_em ? ' (desfeito)' : ''}` : 'acordo (excluído depois)';
  }
  return 'cobrança em geral';
}

/** Soma do que foi gasto na cobrança (só para informar: não é cobrado de ninguém). */
export const gastoDaCobranca = (lista) => lista.reduce((s, x) => s + (Number(x.valor) || 0), 0);

/** Tira um arquivo da lista de um registro (o arquivo é apagado por quem chama, alterarApagandoAnexos). */
export function removerArquivoDoRegistro(d, id, nome, usuario) {
  const r = buscar(d, 'cobranca_registros', id);
  if (!r) throw new C.ErroUsuario('Este registro não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
  if (!(r.arquivos || []).includes(nome)) throw new C.ErroUsuario('Este arquivo já foi tirado do registro.');
  atualizar(d, 'cobranca_registros', r.id, { arquivos: r.arquivos.filter((x) => x !== nome) }, usuario, `Cobrança (${r.tipo} de ${C.dataBr(r.data)}): arquivo tirado: ${nome}`);
}
