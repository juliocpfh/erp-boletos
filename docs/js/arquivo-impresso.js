// Arquivo impresso (pasta física de cada inquilino), decisão do dono em 2026-11-15 (documentacao/arquivo/PROPOSTA_ARQUIVO_IMPRESSO.md):
// o que vai para o papel (entrada, documento novo durante o contrato, saída e troca de titular), o que já foi impresso
// (tabela `pastas_fisicas`), o que é novo e o que foi trocado depois de impresso. Funções puras (tests/arquivo-impresso.test.mjs);
// a tela fica em telas/arquivo-impresso.js. Liga e desliga pela regra `arquivo_impresso` (Regras do sistema).
//
// Nunca entram: NF, comprovantes de pagamento, boletos, WhatsApp, documentos de renda da ficha (imposto de renda, holerites,
// extratos, pró-labore, carteira de trabalho, Serasa), fotos da vistoria, apólices do seguro e e-mails.
// Este módulo e regras.js importam um ao outro: aqui nada usa R fora de funções (só na hora da chamada).
import * as C from './calculos.js';
import * as CR from './config-regras.js';
import * as R from './regras.js';

/** A rotina está ligada (Regras do sistema → Arquivo impresso)? */
export const ligado = () => !!CR.regra('arquivo_impresso');

/**
 * Arquivos de cada pasta de inquilino lidos neste aparelho (conferência do Painel, a cada abertura, ou ao abrir a pasta):
 * contratoId → nomes. Com eles, o arquivo solto novo (ex.: notificação posta na pasta) também avisa no Painel e na página.
 */
const soltosConhecidos = new Map();
/** Muda a cada lista anotada ou esquecida: a tela que guarda os alertas (alertasDaTela, telas/comum.js) refaz a conta. */
export let versaoSoltos = 0;
export const anotarSoltos = (contratoId, nomes) => { soltosConhecidos.set(Number(contratoId), [...nomes]); versaoSoltos += 1; };
export const esquecerSoltos = () => { soltosConhecidos.clear(); versaoSoltos += 1; };

/** Grupos da lista, na ordem da pasta. */
export const GRUPOS_PASTA = [
  ['contrato', 'Contrato e termos'],
  ['pessoa', 'Documentos da pessoa'],
  ['recibos', 'Recibos (cópia da locadora)'],
  ['saida', 'Saída'],
  ['outros', 'Escolher se quiser (vêm desmarcados)'],
];

/** Momentos em que a pasta é montada ou completada (campo `momento` de `pastas_fisicas`). */
export const MOMENTOS = { entrada: 'entrada', inicio: 'o que já existia', durante: 'documento novo', saida: 'saída', heranca: 'troca de titular' };
/** Montagens que contam como "pasta montada" (a da saída também: quem saiu antes de ligar a rotina monta tudo de uma vez). */
const MONTADA = ['entrada', 'inicio', 'heranca', 'saida'];

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// arquivo solto na pasta do inquilino (não é de nenhum lançamento): pelo nome
// renda e análise de crédito: nunca (só serviram para aprovar a ficha); depois os documentos da pessoa; por fim pagamentos e conversas
const RENDA = /imposto|irpf|recibo-de-entrega|holerite|contracheque|extrato|pro-?labore|carteira-de-trabalho|ctps|serasa|faturamento|beneficio|renda/;
const PESSOA = /documento-com-foto|(^|-)(rg|cnh|cpf|cnpj)(-|$)|identidade|certidao|uniao-estavel|residencia|endereco|contrato-social|ficha|^link-(fiador-d+-)?assinada/;
const PAGAMENTO = /comprovante|boleto|nota-fiscal|(^|-)nfs?e?(-|$)|fatura|whatsapp/;

/** Arquivo solto: 'nunca' (fica fora), 'pessoa' (documento da pessoa, marcado) ou 'outros' (desmarcado). */
export function classificarSolto(nome) {
  const n = semAcento(nome).replace(/.[^.]*$/, '').replace(/[^a-z0-9]+/g, '-');
  if (RENDA.test(n)) return 'nunca';
  if (PESSOA.test(n)) return 'pessoa';
  return PAGAMENTO.test(n) ? 'nunca' : 'outros';
}

/**
 * Rótulo de um arquivo solto: o nome sem a extensão, sem a data e o código que a ficha pela internet põe.
 * Ex.: link-documento-com-foto-e-cpf-rg-ou-cnh-2025-12-15-ab12cd.pdf → "Documento com foto e cpf rg ou cnh (pela internet)".
 */
function rotuloSolto(nome) {
  const pelaInternet = /^link-/.test(nome);
  const t = String(nome).replace(/\.[^.]*$/, '').replace(/^link-/, '').replace(/-\d{4}-\d{2}-\d{2}(-[0-9a-f]{6})?(-\d+)?$/, '').replace(/[-_]+/g, ' ').trim();
  return `${t.charAt(0).toLocaleUpperCase('pt-BR')}${t.slice(1)}${pelaInternet ? ' (pela internet)' : ''}`;
}

/**
 * Tudo o que pode ir para a pasta de papel do contrato, na ordem: [{ vaga, grupo, rotulo, data, tipo, escopo, pasta, nome,
 * marcado, recibo?, comp?, link? }]. ``vaga`` diz que documento é (estável: `doc:doc_contrato_em`, `aditivo:12`, `carta:2027-03`,
 * `recibo:garantia`, `solto:<nome>`): é por ela que se sabe o que já foi impresso e o que foi trocado (mesma vaga, outro arquivo).
 * ``tipo``: 'arquivo' (anexado), 'recibo' ou 'carta' (o sistema monta na hora), 'vistoria' (imprimir à parte pelo link).
 * ``soltos``: nomes dos arquivos da pasta do inquilino (sem eles, os arquivos soltos ficam de fora: a lista do Painel não abre pastas).
 * Documento herdado na troca de titular (contrato, vistoria e termo das chaves do anterior) fica na pasta do anterior.
 */
export function itensDaPasta(d, c, soltos = null) {
  const out = [];
  const poe = (x) => out.push({ marcado: true, tipo: 'arquivo', ...x });
  for (const [campo, nome, feito] of R.DOCUMENTOS_ENTRADA) {
    const arq = c[R.campoArquivoDoc(campo)];
    if (arq) poe({ vaga: `doc:${campo}`, grupo: 'contrato', rotulo: `${nome} ${feito}`, data: c[campo] || null, escopo: 'assinados', pasta: c.id, nome: arq });
    // contra-vistoria do inquilino (2026-11-15): logo depois da vistoria de entrada
    if (campo === 'doc_vistoria_em' && c.contra_vistoria) poe({ vaga: 'contra_vistoria', grupo: 'contrato', rotulo: 'Contra-vistoria do inquilino', data: c.contra_vistoria_em || null, escopo: 'contrato', pasta: c.id, nome: c.contra_vistoria });
  }
  for (const a of d.aditivos.filter((x) => x.contrato_id === c.id && x.arquivo).sort((x, y) => String(x.data).localeCompare(String(y.data)) || x.id - y.id)) {
    poe({ vaga: `aditivo:${a.id}`, grupo: 'contrato', rotulo: `Termo aditivo${a.numero ? ` nº ${a.numero}` : ''}${a.assunto ? ` (${a.assunto})` : a.tipo ? ` (${a.tipo.toLocaleLowerCase('pt-BR')})` : ''}`, data: a.data || null, escopo: 'aditivos', pasta: c.id, nome: a.arquivo });
  }
  // outros documentos da locação assinados (distrato, avisos, autorização de obra, declaração, aviso ao fiador; 2026-11-24,
  // DOC-07): uma vaga por documento registrado (a prorrogação e a troca de garantia são termos aditivos, logo acima)
  for (const x of (d.documentos_locacao || []).filter((y) => y.contrato_id === c.id && y.arquivo).sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.id - b.id)) {
    poe({ vaga: `documento:${x.id}`, grupo: 'contrato', rotulo: `${x.nome || 'Documento'} de ${C.dataBr(x.data)} assinado`, data: x.assinado_em || x.data || null, escopo: 'aditivos', pasta: c.id, nome: x.arquivo });
  }
  // termo do acordo de dívida assinado (anexado no boleto do acordo, etapa "Termo do acordo assinado")
  for (const a of (d.acordos || []).filter((x) => x.contrato_id === c.id && x.termo_assinado)) {
    poe({ vaga: `acordo:${a.id}`, grupo: 'contrato', rotulo: `Termo do acordo de ${C.dataBr(a.data)} assinado (${a.referente})`, data: a.data, escopo: 'contrato', pasta: c.id, nome: a.termo_assinado });
  }
  // recibo da devolução da garantia assinado pela pessoa (troca de garantia ou de titular, 2026-11-21): uma vaga por devolução
  for (const x of (d.devolucoes_garantia || []).filter((y) => y.contrato_id === c.id && y.termo_assinado).sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.id - b.id)) {
    poe({ vaga: `devolucao-garantia:${x.id}`, grupo: 'contrato', rotulo: `Recibo da devolução da garantia de ${C.dataBr(x.data)} assinado`, data: x.data, escopo: 'contrato', pasta: c.id, nome: x.termo_assinado });
  }
  // notificação ao inquilino assinada (2026-11-17): uma vaga por notificação (o comprovante da baixa, foto, não vai para o papel)
  for (const n of (d.notificacoes || []).filter((x) => x.contrato_id === c.id && x.arquivo_assinado && x.situacao !== 'Cancelada').sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.id - b.id)) {
    poe({ vaga: `notificacao:${n.id}`, grupo: 'contrato', rotulo: `Notificação de ${C.dataBr(n.data)} assinada (${n.assunto})`, data: n.data, escopo: 'contrato', pasta: c.id, nome: n.arquivo_assinado });
  }
  // carta de reajuste (pelo índice ou pelo novo valor negociado): a anexada ou, sem arquivo, a que o sistema monta
  for (const x of (d.cartas_reajuste || []).filter((y) => y.contrato_id === c.id).sort((a, b) => String(a.competencia).localeCompare(String(b.competencia)))) {
    const base = { vaga: `carta:${x.competencia}`, grupo: 'contrato', rotulo: `Carta de reajuste de ${C.compBr(x.competencia)}${x.enviada_em ? ` (enviada em ${C.dataBr(x.enviada_em)})` : ''}`, data: x.enviada_em || null };
    poe(x.arquivo ? { ...base, escopo: 'aditivos', pasta: c.id, nome: x.arquivo } : { ...base, tipo: 'carta', comp: x.competencia, nome: `carta-${x.competencia}` });
  }
  const pessoa = [];
  const outros = [];
  if (soltos) {
    const usados = new Set(R.arquivosReferenciados(d).filter((x) => x.escopo === 'contrato' && x.id === c.id).map((x) => x.nome));
    for (const nome of [...soltos].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
      if (usados.has(nome)) continue;
      const tipo = classificarSolto(nome);
      if (tipo === 'nunca') continue;
      (tipo === 'pessoa' ? pessoa : outros).push({ vaga: `solto:${nome}`, grupo: tipo, rotulo: rotuloSolto(nome), data: null, escopo: 'contrato', pasta: c.id, nome, marcado: tipo === 'pessoa', solto: true });
    }
  }
  pessoa.forEach(poe);
  // recibos que o sistema emite (a via assinada fica com o inquilino): só quando já podem sair
  const herdado = R.contratoHerdado(d, c);
  if (!herdado && c.reserva_valor > 0 && c.reserva_data) {
    poe({ vaga: 'recibo:reserva', grupo: 'recibos', rotulo: `Recibo da reserva (${C.reais(c.reserva_valor)})`, data: c.reserva_data, tipo: 'recibo', recibo: 'reserva', nome: 'recibo-reserva' });
  }
  // garantia herdada (trocas antigas): o recibo é de quem pagou, na pasta dele
  if ((R.temCaucao(c) || R.temDeposito(c)) && garantiaPaga(d, c) && R.pagadorDaGarantia(d, c, R.temCaucao(c) ? 'caucao' : 'deposito').id === c.id) {
    const qual = R.temCaucao(c) ? 'caução' : 'depósito de garantia';
    poe({ vaga: 'recibo:garantia', grupo: 'recibos', rotulo: `Recibo da ${qual}`, data: (R.temCaucao(c) ? c.caucao_pago_em || c.caucao_data : c.deposito_pago_em || c.deposito_data) || null, tipo: 'recibo', recibo: 'garantia', nome: 'recibo-garantia' });
  }
  if (c.data_saida && !R.fimDeVinculo(d, c)) {
    const v = R.vistoriasDo(d, c.id).find((x) => x.tipo === 'Saída');
    if (v) poe({ vaga: `vistoria:${v.id}`, grupo: 'saida', rotulo: `Vistoria de saída (${C.dataBr(v.data)})`, data: v.data, tipo: 'vistoria', link: `#/imprimir/vistoria?id=${v.id}`, nome: `vistoria-${v.id}` });
    if (c.termo_chaves_saida) poe({ vaga: 'termo_chaves_saida', grupo: 'saida', rotulo: 'Termo de devolução das chaves assinado', data: c.data_saida, escopo: 'contrato', pasta: c.termo_chaves_saida_contrato || c.id, nome: c.termo_chaves_saida });
    const e = R.encerramentoDo(d, c.id);
    if (e && e.termo_assinado) poe({ vaga: `quitacao:${e.id}`, grupo: 'saida', rotulo: 'Termo de quitação assinado', data: e.garantia_devolvida_em || e.data_saida || c.data_saida, escopo: 'contrato', pasta: c.id, nome: e.termo_assinado });
  }
  outros.forEach(poe);
  return out;
}

/** Garantia em dinheiro paga (depositada ou com depósitos registrados): o recibo já pode sair. */
function garantiaPaga(d, c) {
  if (R.garantiaDepositada(c)) return true;
  const qual = R.temCaucao(c) ? 'caucao' : 'deposito';
  return R.depositosGarantiaDo(d, c, qual).some((x) => !x.complementar);
}

/** Montagens da pasta do contrato, da mais antiga à mais recente. */
export const montagensDe = (d, contratoId) => (d.pastas_fisicas || []).filter((x) => x.contrato_id === contratoId)
  .sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.id - b.id);

/** O que já foi decidido de cada vaga (a última decisão vale): Map vaga → { ...item, data, por, momento }. */
export function registrados(d, contratoId) {
  const m = new Map();
  for (const x of montagensDe(d, contratoId)) for (const i of x.itens || []) m.set(i.vaga, { ...i, data: x.data, por: x.por, momento: x.momento });
  return m;
}

/** Primeira montagem que conta como pasta montada (null se ainda não foi montada). */
export const pastaMontada = (d, contratoId) => montagensDe(d, contratoId).find((x) => MONTADA.includes(x.momento)) || null;
/** Pasta fechada na saída: a montagem da saída ou, antes da rotina, a etapa simples "Arquivo físico" marcada à mão. */
export const saidaFechada = (d, c) => montagensDe(d, c.id).find((x) => x.momento === 'saida') || (c.arquivo_fisico_em ? { data: c.arquivo_fisico_em, por: '', momento: 'saida', itens: [] } : null);

/** Etapa da devolução da garantia (ou da cobrança do saldo) da saída já feita: a pasta da saída pode fechar. */
export function saidaPronta(d, c, hoje = C.hojeIso()) {
  const g = R.roteiroSaida(d, c, hoje).find((x) => x.chave === 'garantia');
  return !!(g && g.feito);
}

/**
 * A entrada terminou (todas as etapas da rotina, menos a da pasta, feitas ou "não se aplica")? Inquilino antigo (entrou há
 * mais de 6 meses) conta como terminado: é a primeira rodada, com o que já existe.
 */
export function entradaPronta(d, c, hoje = C.hojeIso()) {
  if (!R.rotinaRecente(c, hoje)) return true;
  return R.rotinaEntrada(d, c, hoje).filter((e) => e.chave !== 'pasta_fisica').every((e) => ['feita', 'pulada'].includes(e.situacao));
}

/**
 * Troca de titular: a pasta do anterior ainda não foi posta dentro da do novo? Devolve o contrato anterior ou null.
 * Só depois que o contrato passou (termo da troca assinado).
 */
export function herancaPendente(d, c, hoje = C.hojeIso()) {
  const a = R.contratoHerdado(d, c);
  if (!a || R.herancaAgendada(d, c, hoje)) return null;
  return montagensDe(d, c.id).some((x) => x.pasta_anterior && x.pasta_anterior.contrato_id === a.id) ? null : a;
}

/** Itens do anterior que ainda não estão em papel (passo 1 da troca de titular). */
export function faltaDoAnterior(d, a, soltos = null) {
  const reg = registrados(d, a.id);
  return itensDaPasta(d, a, soltos).filter((i) => !reg.has(i.vaga));
}

/**
 * Situação da pasta do contrato: { momento ('entrada', 'inicio', 'durante', 'saida' ou 'heranca'), precisa (há o que fazer),
 * aguardando (a entrada ou a saída ainda não terminou), montada, novos, trocados, anterior, itens, reg }.
 * ``novos``: o que ainda não foi decidido depois de montada (aviso "documento novo"); ``trocados``: impresso com outro arquivo.
 * Ex.: pasta de Ana montada em 16/12/2026; termo aditivo nº 2 anexado em 10/02/2027 → momento 'durante', novos = [termo nº 2].
 */
export function situacaoPasta(d, c, hoje = C.hojeIso(), soltos = null) {
  const itens = itensDaPasta(d, c, soltos || soltosConhecidos.get(c.id) || null);
  const reg = registrados(d, c.id);
  const montada = pastaMontada(d, c.id);
  const anterior = herancaPendente(d, c, hoje);
  const comSaida = !!c.data_saida && !R.fimDeVinculo(d, c);
  const fechada = comSaida ? saidaFechada(d, c) : null;
  const novos = itens.filter((i) => !reg.has(i.vaga));
  const trocados = itens.filter((i) => {
    const r = reg.get(i.vaga);
    return r && i.tipo === 'arquivo' && i.marcado && r.situacao !== 'fora' && r.nome !== i.nome;
  });
  let momento;
  let aguardando = false;
  if (comSaida && !fechada && (c.data_saida <= hoje || montada)) {
    momento = 'saida';
    aguardando = !saidaPronta(d, c, hoje);
  } else if (!montada) {
    momento = anterior ? 'heranca' : R.rotinaRecente(c, hoje) ? 'entrada' : 'inicio';
    aguardando = !entradaPronta(d, c, hoje);
  } else momento = 'durante';
  const fechou = comSaida && !!fechada;
  const precisa = !aguardando && !fechou && (momento !== 'durante' || novos.length > 0 || trocados.length > 0 || !!anterior);
  return { momento, precisa, aguardando, montada, fechada, novos: montada ? novos : [], trocados, anterior, itens, reg };
}

/** Contratos que a rotina acompanha: os ativos (com a saída ainda a fechar) e, por fora, nada mais (ex-inquilinos só pela troca). */
export function contratosDaRotina(d, hoje = C.hojeIso()) {
  return d.contratos.filter((c) => c.ativo !== false && !R.fimDeVinculo(d, c)
    && (R.contratoAtivo(c, hoje) || (c.data_saida && !saidaFechada(d, c))));
}

/** Texto curto da situação (lista Arquivo impresso e caixa da página do inquilino). */
export function textoSituacao(s) {
  if (s.aguardando) return s.momento === 'saida' ? 'aguardando a devolução da garantia' : 'aguardando as outras etapas da entrada';
  if (s.fechada && !s.precisa) return `fechada na saída em ${C.dataBr(s.fechada.data)}`;
  if (s.momento === 'saida') return 'montar a pasta da saída';
  if (s.momento === 'heranca' || (s.anterior && !s.montada)) return `conferir a pasta de ${s.anterior.inquilino_nome} e montar a nova`;
  if (!s.montada) return `falta montar (${s.itens.filter((i) => i.marcado).length} documento(s))`;
  const partes = [];
  if (s.anterior) partes.push(`conferir a pasta de ${s.anterior.inquilino_nome}`);
  if (s.novos.length) partes.push(`${s.novos.length} documento(s) novo(s)`);
  if (s.trocados.length) partes.push(`${s.trocados.length} arquivo(s) trocado(s)`);
  return partes.length ? partes.join('; ') : `em dia (montada em ${C.dataBr(s.montada.data)})`;
}

/**
 * Alerta único do Painel (decisão do dono: um só, com os números): null se não há nada ou se a rotina está desligada.
 * Ex.: "3 inquilino(s) com a pasta física a montar; 1 com documento novo para imprimir."
 */
export function alertaPastas(d, hoje = C.hojeIso()) {
  if (!ligado()) return null;
  let montar = 0; let novos = 0; let trocados = 0; let saida = 0;
  for (const c of contratosDaRotina(d, hoje)) {
    const s = situacaoPasta(d, c, hoje);
    if (!s.precisa) continue;
    if (s.momento === 'saida') saida += 1;
    else if (!s.montada || s.anterior) montar += 1;
    else { if (s.novos.length) novos += 1; if (s.trocados.length) trocados += 1; }
  }
  const partes = [];
  if (montar) partes.push(`${montar} inquilino(s) com a pasta física a montar`);
  if (novos) partes.push(`${novos} com documento novo para imprimir`);
  if (trocados) partes.push(`${trocados} com arquivo trocado (imprimir a versão nova)`);
  if (saida) partes.push(`${saida} saída(s) com a pasta a fechar`);
  if (!partes.length) return null;
  return { nivel: 'info', tipo: 'Pasta física', imovel: '', inquilino: '', ancora: null, link: '#/arquivo-impresso', texto: `${partes.join('; ')}.` };
}

/** Guardar a pasta até: 10 anos depois da saída (Código Civil, art. 205). */
export const guardarAte = (c) => (c.data_saida ? C.somarMesesData(c.data_saida, 120) : null);

/**
 * Registra uma montagem da pasta (Imprimir tudo → "saiu tudo certo", "Já está em papel" ou "Não vai"): uma linha em
 * `pastas_fisicas` com cada item e a situação ('impresso', 'ja_tinha' ou 'fora'). Na troca de titular, ``anterior`` registra
 * também o que se imprimiu da pasta do anterior e que ela foi posta dentro da nova (``guardada``).
 * Ex.: registrarPasta(d, 7, { momento: 'entrada', itens: [{ vaga: 'doc:doc_contrato_em', …, situacao: 'impresso' }] }, 'julio').
 */
export function registrarPasta(d, contratoId, { momento, itens, anterior = null, data = C.hojeIso() }, usuario) {
  const c = R.buscar(d, 'contratos', contratoId);
  if (!c) throw new Error('Inquilino não encontrado.');
  if (!MOMENTOS[momento]) throw new Error('Momento da pasta desconhecido.');
  const limpa = (l) => (l || []).map((i) => ({ vaga: String(i.vaga), rotulo: String(i.rotulo || ''), nome: i.nome || null, escopo: i.escopo || null, pasta: i.pasta || null,
    situacao: ['impresso', 'ja_tinha', 'fora'].includes(i.situacao) ? i.situacao : 'impresso' }));
  const resumo = (l) => { const n = (s) => l.filter((i) => i.situacao === s).length; return [n('impresso') && `${n('impresso')} impresso(s)`, n('ja_tinha') && `${n('ja_tinha')} já em papel`, n('fora') && `${n('fora')} fora da pasta`].filter(Boolean).join(', '); };
  let pastaAnterior = null;
  if (anterior) {
    const a = R.buscar(d, 'contratos', anterior.contrato_id);
    if (!a) throw new Error('Contrato anterior não encontrado.');
    const la = limpa(anterior.itens);
    if (la.length) R.inserir(d, 'pastas_fisicas', { contrato_id: a.id, momento: 'inicio', data, por: usuario, itens: la, pasta_anterior: null }, usuario, `${a.inquilino_nome}: pasta física completada na troca de titular (${resumo(la)})`);
    if (anterior.guardada) pastaAnterior = { contrato_id: a.id, guardada_em: data };
  }
  const l = limpa(itens);
  if (!l.length && !pastaAnterior) throw new C.ErroUsuario('Nada para marcar.');
  return R.inserir(d, 'pastas_fisicas', { contrato_id: c.id, momento, data, por: usuario, itens: l, pasta_anterior: pastaAnterior }, usuario,
    `${c.inquilino_nome}: pasta física (${MOMENTOS[momento]}) · ${[resumo(l), pastaAnterior && `pasta de ${R.buscar(d, 'contratos', pastaAnterior.contrato_id).inquilino_nome} posta dentro`].filter(Boolean).join('; ')}`);
}
