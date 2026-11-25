// Outros documentos da locação registrados no contrato (decisão do dono de 24/11/2026, DOC-07, opção (a)): cada documento
// gerado em "Gerar documento" (modelos-documentos.js) fica gravado com o tipo, a data e os campos digitados, e recebe a via
// assinada. Os dois que são termo aditivo no texto ("# {numero_aditivo} TERMO ADITIVO": prorrogação do prazo e troca de
// garantia) entram na tabela `aditivos` (número do próximo termo, "Aguardando assinatura", arquivo impresso e e-mail do termo
// assinado como os outros termos); os demais (distrato, avisos, autorização de obra, declaração, aviso ao fiador) na tabela
// `documentos_locacao`. A prorrogação assinada muda a data de término do contrato por uma renovação ligada ao termo
// (`aplicarProrrogacao`); tirar o arquivo (termo que não valeu) ou excluir o termo volta à data de antes (`desfazerProrrogacao`).
// Funções puras sobre o banco (tests/busca-24-11-decisoes-documentos.test.mjs); gravação só por inserir/atualizar/excluir.
import * as C from './calculos.js';
import { TIPOS_DOCUMENTO } from './modelos-documentos.js';
import * as R from './regras.js';

/** Tipos que são termo aditivo no texto, com o tipo gravado no termo (tabela `aditivos`). */
export const TIPOS_ADITIVO_DOCUMENTO = { aditivo_prazo: 'Prorrogação do prazo', aditivo_garantia: 'Troca de garantia' };
export const ehTermoAditivo = (tipo) => Object.prototype.hasOwnProperty.call(TIPOS_ADITIVO_DOCUMENTO, tipo);
/** Termo aditivo de prorrogação gerado por "Outros documentos" (o que muda a data de término quando assinado). */
export const ehProrrogacao = (a) => !!(a && a.documento === 'aditivo_prazo');

const porData = (a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id;
const curto = (t, n = 90) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

/** Assunto do registro (lista do contrato, arquivo impresso e histórico). Ex.: prorrogação → "Prorrogação do prazo: 24 meses, de 01/06/2027 a 31/05/2029". */
export function assuntoDoDocumento(tipo, v = {}) {
  const data = (k) => (C.dataValida(v[k]) ? C.dataBr(v[k]) : '___');
  switch (tipo) {
    case 'aditivo_prazo': return `Prorrogação do prazo${Number(v.novo_prazo_meses) > 0 ? `: ${Number(v.novo_prazo_meses)} meses,` : ':'} de ${data('nova_data_inicio')} a ${data('nova_data_fim')}`;
    case 'aditivo_garantia': return `Troca de garantia a partir de ${data('data_troca')}${v.garantia_nova ? `: ${curto(v.garantia_nova, 60)}` : ''}`;
    case 'distrato': return `Distrato: entrega das chaves em ${data('data_saida')}${String(v.multa_combinada || '').trim() ? `, multa de R$ ${String(v.multa_combinada).trim()}` : ', multa dispensada'}`;
    case 'aviso_desocupacao': return `Aviso de desocupação: entrega prevista em ${data('data_saida_prevista')}${v.transferencia_empregador ? ', sem multa (transferência pelo empregador)' : ''}`;
    case 'notificacao_desocupacao': return `Notificação para desocupar até ${data('data_limite')}`;
    case 'autorizacao_obra': return `Autorização de obra${v.descricao_obra ? `: ${curto(v.descricao_obra, 60)}` : ''}${C.dataValida(v.prazo_obra) ? ` (até ${data('prazo_obra')})` : ''}`;
    case 'declaracao_pagamentos': return `Declaração de pagamentos em dia de ${data('periodo_inicio')} a ${data('periodo_fim')}`;
    case 'aviso_fiador': return `Aviso ao fiador${String(v.valor_debito || '').trim() ? `: R$ ${String(v.valor_debito).trim()} em atraso` : ''}${C.dataValida(v.prazo_pagamento) ? `, pagar até ${data('prazo_pagamento')}` : ''}`;
    default: return (TIPOS_DOCUMENTO[tipo] || {}).nome || 'Documento';
  }
}

/** Termo aditivo deste tipo ainda sem assinatura no contrato (gerar de novo o atualiza, sem gastar outro número). */
export const termoAguardando = (d, contratoId, tipo) => (d.aditivos || [])
  .filter((a) => a.contrato_id === contratoId && a.documento === tipo && !a.arquivo && !a.perdido_em).sort(porData)[0] || null;

/** Documentos registrados do contrato (fora os termos aditivos), do mais recente ao mais antigo. */
export const documentosDo = (d, contratoId) => (d.documentos_locacao || []).filter((x) => x.contrato_id === contratoId).sort(porData);

/**
 * Registra o documento gerado. ``modelo``: { id, texto } (o texto fica guardado: a via impressa e a assinada são as mesmas,
 * mesmo que o modelo mude depois); ``valores``: os campos digitados; ``data``: a data do documento; ``fim``: o fim do contrato
 * usado no texto. Devolve { tabela, registro }. Termo aditivo: entra em `aditivos` com o número (o digitado ou o próximo) e,
 * havendo um do mesmo tipo aguardando assinatura, é ele que muda. Outro documento: um registro por geração (o mesmo documento,
 * com os mesmos campos e a mesma data, ainda sem assinatura, não se repete).
 */
export function registrarDocumento(d, contratoId, { tipo, modelo, valores = {}, data, fim = null }, usuario) {
  const c = R.buscar(d, 'contratos', contratoId);
  if (!c) throw new C.ErroUsuario('Inquilino não encontrado.');
  const def = TIPOS_DOCUMENTO[tipo];
  if (!def || !modelo) throw new C.ErroUsuario('Modelo de documento não encontrado.');
  const campos = Object.fromEntries(def.campos.map(([k]) => [k, String(valores[k] ?? '').trim()]));
  const dataDoc = C.dataValida(data, C.hojeIso());
  const base = { contrato_id: c.id, imovel_id: c.imovel_id || null, documento: tipo, data: dataDoc, campos, modelo_doc: modelo.id, texto: String(modelo.texto || ''), fim: fim || null };
  if (ehTermoAditivo(tipo)) {
    const pendente = termoAguardando(d, c.id, tipo);
    const numero = Number(campos.numero_aditivo) > 0 ? Math.trunc(Number(campos.numero_aditivo)) : (pendente && pendente.numero) || R.proximoNumeroAditivo(d, c);
    campos.numero_aditivo = String(numero);
    const dados = { ...base, campos, tipo: TIPOS_ADITIVO_DOCUMENTO[tipo], numero, assunto: assuntoDoDocumento(tipo, campos), testemunhas: [], arquivo: null,
      ...(tipo === 'aditivo_prazo' ? { nova_vigencia_fim: C.dataValida(campos.nova_data_fim) || null } : {}) };
    if (pendente) {
      R.atualizar(d, 'aditivos', pendente.id, dados, usuario, `${c.inquilino_nome}: ${numero}º termo aditivo (${dados.tipo.toLocaleLowerCase('pt-BR')}) gerado de novo, aguardando assinatura`);
      return { tabela: 'aditivos', registro: pendente };
    }
    return { tabela: 'aditivos', registro: R.inserir(d, 'aditivos', dados, usuario, `${c.inquilino_nome}: ${numero}º termo aditivo (${dados.tipo.toLocaleLowerCase('pt-BR')}) gerado, aguardando assinatura`) };
  }
  const igual = documentosDo(d, c.id).find((x) => x.documento === tipo && !x.arquivo && x.data === dataDoc && x.texto === base.texto
    && JSON.stringify(x.campos || {}) === JSON.stringify(campos));
  if (igual) return { tabela: 'documentos_locacao', registro: igual };
  const r = R.inserir(d, 'documentos_locacao', { ...base, nome: def.nome, assunto: assuntoDoDocumento(tipo, campos), arquivo: null, assinado_em: null }, usuario,
    `${c.inquilino_nome}: ${def.nome} gerado (${C.dataBr(dataDoc)})`);
  return { tabela: 'documentos_locacao', registro: r };
}

/** Menor motivo aceito na retomada pelo art. 47 (o advogado pede uma justificativa crível e fundada, não uma palavra). */
export const MOTIVO_MINIMO = 30;

/** Notificação para desocupação: vai por carta com AR, e o AR devolvido é o arquivo anexado (a data é a do recebimento). */
export const ehNotificacaoComAr = (x) => !!(x && x.documento === 'notificacao_desocupacao');

/**
 * Prazos da notificação para desocupação (advogado, 24/11/2026, item 6.5): o prazo de 30 dias conta do recebimento da carta
 * (a data do AR anexado); a data limite escrita vale para o recebimento até 30 dias antes dela. Para pedir a liminar, a ação de
 * despejo é proposta em até 30 dias do fim desse prazo (Lei 8.245/91, art. 59, § 1º, VIII). Ex.: data limite 31/12/2026 e
 * AR de 10/12/2026 → desocupar até 09/01/2027, ação até 08/02/2027. Sem o AR: { recebida: null } e as datas pela data limite.
 */
export function prazosDaNotificacao(x) {
  const limite = C.dataValida((x && x.campos && x.campos.data_limite) || '');
  const recebida = x && x.arquivo ? C.dataValida(x.assinado_em || '') || null : null;
  const pelaCarta = recebida ? C.somarDias(recebida, 30) : '';
  const desocupar = [limite, pelaCarta].filter(Boolean).sort().pop() || '';
  return { recebida, desocupar: desocupar || null, acaoAte: desocupar ? C.somarDias(desocupar, 30) : null };
}

/** Anexa a via assinada de um documento (fora os termos aditivos, que passam por "Marcar assinado" dos termos). */
export function anexarDocumento(d, id, { data, arquivo }, usuario) {
  const x = R.buscar(d, 'documentos_locacao', id);
  if (!x) throw new C.ErroUsuario('Documento não encontrado.');
  if (!C.dataValida(data)) throw new C.ErroUsuario('Informe a data da assinatura.');
  if (!arquivo) throw new C.ErroUsuario('Anexe o arquivo assinado.');
  const c = R.buscar(d, 'contratos', x.contrato_id);
  R.atualizar(d, 'documentos_locacao', x.id, { arquivo, assinado_em: data }, usuario, `${c ? c.inquilino_nome : 'Contrato'}: ${x.nome} de ${C.dataBr(x.data)} ${ehNotificacaoComAr(x) ? 'recebida (AR)' : 'assinado'} em ${C.dataBr(data)}`);
  return x;
}

/** Tira a via assinada (o arquivo sai da pasta por alterarApagandoAnexos): o documento volta a aguardar a assinatura. */
export function tirarArquivoDocumento(d, id, usuario) {
  const x = R.buscar(d, 'documentos_locacao', id);
  if (!x || !x.arquivo) throw new C.ErroUsuario('Arquivo não encontrado.');
  const c = R.buscar(d, 'contratos', x.contrato_id);
  R.atualizar(d, 'documentos_locacao', x.id, { arquivo: null, assinado_em: null }, usuario, `${c ? c.inquilino_nome : 'Contrato'}: arquivo assinado do ${x.nome} de ${C.dataBr(x.data)} apagado (volta a aguardar assinatura)`);
}

/**
 * Prorrogação assinada (com o arquivo): a data de término do contrato passa à do termo, como numa renovação (é registrada uma,
 * ligada ao termo, e `R.fimDoContrato` passa a dar a data nova). Ex.: contrato até 31/05/2027, termo nº 2 até 31/05/2029
 * assinado em 20/05/2027 → término 31/05/2029. Devolve o texto para o aviso ('' quando não é prorrogação ou já foi aplicada).
 */
export function aplicarProrrogacao(d, aditivoId, usuario) {
  const a = R.buscar(d, 'aditivos', aditivoId);
  if (!ehProrrogacao(a) || !a.arquivo) return '';
  if (a.renovacao_id && R.buscar(d, 'renovacoes', a.renovacao_id)) return '';
  const c = R.buscar(d, 'contratos', a.contrato_id);
  const nova = C.dataValida(a.nova_vigencia_fim);
  if (!nova) return 'O termo foi gerado sem a nova data de término: a data de término do contrato não mudou (gere o termo de novo com a data, ou registre a renovação).';
  const inicio = c.data_entrada || c.vigencia_inicio;
  if (inicio && nova <= inicio) return `A nova data de término (${C.dataBr(nova)}) é antes da entrada: a data de término do contrato não mudou.`;
  const antes = { vigencia_fim: c.vigencia_fim ?? null, prazo_meses: c.prazo_meses ?? null, prazo_tipo: c.prazo_tipo ?? null };
  const r = R.registrarRenovacao(d, c.id, { tipo: 'Renovado com nova data de término', data: a.assinado_em || C.hojeIso(), nova_vigencia_fim: nova, aditivo_id: a.id,
    observacoes: `${a.numero || ''}º termo aditivo de prorrogação do prazo, assinado` }, usuario);
  R.atualizar(d, 'aditivos', a.id, { renovacao_id: r.id, prazo_antes: antes }, usuario, `${c.inquilino_nome}: prorrogação assinada, término do contrato passa a ${C.dataBr(nova)}`);
  return `A data de término do contrato passou a ${C.dataBr(nova)}.`;
}

/**
 * Prorrogação que não valeu (arquivo tirado ou termo excluído): a renovação ligada a ela sai e a data de término volta à de antes
 * (a de outra renovação que ainda exista, ou a gravada antes do termo). Ex.: 31/05/2029 → 31/05/2027. Devolve o texto para o aviso.
 */
export function desfazerProrrogacao(d, aditivoId, usuario) {
  const a = R.buscar(d, 'aditivos', aditivoId);
  if (!ehProrrogacao(a) || !a.renovacao_id) return '';
  const c = R.buscar(d, 'contratos', a.contrato_id);
  const ren = R.buscar(d, 'renovacoes', a.renovacao_id);
  const antes = { ...(a.prazo_antes || {}) };
  if (ren) R.excluirRenovacao(d, ren.id, usuario);
  R.atualizar(d, 'aditivos', a.id, { renovacao_id: null, prazo_antes: null }, usuario, `${c.inquilino_nome}: prorrogação do termo aditivo de ${C.dataBr(a.data)} desfeita`);
  // alguém mudou o término depois (outra renovação ou "Editar contrato"): fica como está
  if (!ren || c.vigencia_fim !== ren.nova_vigencia_fim) return '';
  const outra = R.fimRenovado(d, c);
  const mud = outra ? { vigencia_fim: outra, prazo_tipo: 'Determinado', prazo_meses: R.prazoDoContrato(d, c) }
    : { vigencia_fim: antes.vigencia_fim ?? null, prazo_meses: antes.prazo_meses ?? null, prazo_tipo: antes.prazo_tipo ?? 'Determinado' };
  R.atualizar(d, 'contratos', c.id, mud, usuario, `${c.inquilino_nome}: término do contrato volta a ${mud.vigencia_fim ? C.dataBr(mud.vigencia_fim) : 'prazo indeterminado'} (prorrogação não valeu)`);
  const fim = R.fimDoContrato(d, c) || mud.vigencia_fim;
  return mud.prazo_tipo === 'Indeterminado' ? 'O contrato volta a prazo indeterminado.' : `A data de término do contrato volta a ${C.dataBr(fim)}.`;
}

/** Renovação criada por um termo de prorrogação que ainda existe (só sai tirando o arquivo do termo). */
export const termoDaRenovacao = (d, ren) => (ren && ren.aditivo_id ? (d.aditivos || []).find((a) => a.id === ren.aditivo_id && a.renovacao_id === ren.id) || null : null);
