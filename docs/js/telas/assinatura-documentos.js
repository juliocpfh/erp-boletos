// Assinatura digital da empresa no contrato, nos termos aditivos e na carta de reajuste (pedido de 24/11/2026): o PDF marcado
// para assinar, a chave de cada documento na fila, a caixa "Enviar para assinar / Baixar PDF assinado" na página e as ações.
// Os recibos e termos de quitação continuam em telas/documentos.js (caixaAssinatura); a fila e o programa do PC são os mesmos.
// A empresa assina só a parte dela: o inquilino, os fiadores e as testemunhas continuam assinando como antes (à mão, ou pelo
// gov.br no próprio PDF), e o arquivo assinado por todos continua sendo anexado no sistema.
import { aviso, baixar, E, mostrar } from '../app.js';
import * as S from '../armazenamento.js';
import * as AS from '../assinatura.js';
import * as C from '../calculos.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { botao, buscar, d, opera, pastaDoEscopo } from './comum.js';
import { documentoMontado, nomeArquivoDoc, pdfDaCarta, pdfDoDocumento } from './documentos.js';
import { cartaReajuste } from './reajustes.js';

/** Tipo do documento pela página: #/imprimir/carta → carta_reajuste; #/imprimir/contrato e #/imprimir/aditivo. */
const TIPO_DA_PAGINA = { carta: 'carta_reajuste', contrato: 'contrato', aditivo: 'aditivo' };

/** A página aberta: [tipo, parâmetros]. Ex.: "#/imprimir/aditivo?id=5" → ['aditivo', { id: '5' }]. */
function documentoDaPagina() {
  const [caminho, consulta] = location.hash.replace(/^#\/?/, '').split('?');
  return [TIPO_DA_PAGINA[caminho.split('/')[1]] || '', C.sanearParametros(Object.fromEntries(new URLSearchParams(consulta || '')))];
}

/** Texto da carta para o resumo da chave, sem a data do dia (a carta sai com a data de hoje; a assinada guarda a dela). */
const textoDaCarta = (c, comp) => cartaReajuste(c, comp).replace(/<p class="carta-data">[\s\S]*?<\/p>/, '');

/** A LOCADORA que assina com o certificado: a do CNPJ do certificado (se o PC já contou qual é) ou a primeira. */
function locadoraQueAssina(blocos, cert) {
  const locadoras = blocos.filter((b) => b.tipo === 'assinaturas').flatMap((b) => b.pessoas).filter((p) => /^LOCADORA/.test(p.papel || ''));
  const cnpj = String(cert?.cnpj || '').replace(/\D/g, '');
  if (!cnpj) return { pessoa: locadoras[0] || null, outra: false };
  const pessoa = locadoras.find((p) => String(p.doc || '').replace(/\D/g, '') === cnpj) || null;
  return { pessoa, outra: !pessoa && locadoras.length > 0 };
}

/**
 * O documento da página, pronto para a fila: { tipo, c, alvo, prefixo, chave, titulo, nome, blocos?, rodape?, assinadoPorTodos }.
 * Null se não existe (ou é o exemplo de um modelo). Ex.: aditivo 5 → chave "doc:aditivo:c12:a5:v…", nome "Termo aditivo 2 … .pdf".
 */
export async function documentoParaAssinar(tipo, q) {
  if (tipo === 'carta_reajuste') {
    const c = buscar('contratos', q.contrato);
    if (!c || !C.competenciaValida(q.comp)) return null;
    const html = textoDaCarta(c, q.comp);
    if (!html.includes('class="carta"')) return null; // falta o índice: não há carta
    const alvo = { contrato: c, comp: q.comp };
    return { tipo, c, alvo, prefixo: AS.prefixoDoDocumento(tipo, alvo), chave: AS.chaveDoDocumento(tipo, alvo, html),
      titulo: `Carta de reajuste ${C.compBr(q.comp)} · ${c.inquilino_nome}`, nome: `${nomeArquivoDoc('Carta reajuste', c, q.comp)}.pdf`, assinadoPorTodos: false };
  }
  if (tipo !== 'contrato' && tipo !== 'aditivo') return null;
  const m = await documentoMontado(tipo, q);
  if (!m || m.exemplo || (tipo === 'aditivo' && !m.a)) return null;
  const alvo = { contrato: m.c, ...(tipo === 'aditivo' ? { id: m.a.id } : {}) };
  const doc = R.documentoEntrada(d(), m.c, 'doc_contrato_em');
  return { tipo, c: m.c, alvo, blocos: m.blocos, rodape: m.rodape, prefixo: AS.prefixoDoDocumento(tipo, alvo),
    chave: AS.chaveDoDocumento(tipo, alvo, JSON.stringify([m.blocos, m.rodape])),
    titulo: `${tipo === 'aditivo' ? `Termo aditivo${m.a.numero ? ` ${m.a.numero}` : ''} de ${C.dataBr(m.a.data)}` : 'Contrato de locação'} · ${m.c.inquilino_nome}`,
    nome: `${m.arquivo || `${m.nome} - ${m.c.inquilino_nome}`}.pdf`.replace(/[\\/:*?"<>|]/g, '-'),
    // já assinado por todos (o arquivo anexado): não há mais o que mandar para assinar
    assinadoPorTodos: tipo === 'aditivo' ? !!m.a.arquivo : !!(doc && doc.arquivo && doc.contrato.id === m.c.id) };
}

/**
 * PDF para a fila. Contrato e aditivo: o documento da tela, copiado fora dela (a tela não muda), com a linha da LOCADORA que
 * assina marcada (data-assina-empresa na .ct-assina: o programa do PC põe o selo ali). Carta: sem linha (o selo vai na página final).
 */
async function pdfParaAssinar(doc, cert) {
  if (doc.tipo === 'carta_reajuste') return (await pdfDaCarta(doc.c, doc.alvo.comp, { paraAssinar: true })).blob;
  const tela = document.querySelector('.impressao .contrato');
  if (!tela) throw new Error('Documento não encontrado.');
  const caixa = document.createElement('div');
  caixa.className = 'impressao';
  caixa.style.cssText = 'position:absolute;left:-10000px;top:0;width:860px';
  const copia = tela.cloneNode(true);
  // como o "Baixar PDF": na largura da tela, ou na da folha quando a tela é estreita (celular)
  copia.style.maxWidth = 'none';
  if (tela.offsetWidth >= 700) copia.style.width = `${tela.offsetWidth}px`;
  const { pessoa } = locadoraQueAssina(doc.blocos, cert);
  if (pessoa) {
    const linha = [...copia.querySelectorAll('.ct-assina')].find((x) => (x.querySelector('b')?.textContent || '').trim() === String(pessoa.nome || '').trim());
    if (linha) linha.setAttribute('data-assina-empresa', '');
  }
  caixa.append(copia);
  document.body.append(caixa);
  try {
    return await pdfDoDocumento(copia, doc.rodape, { assinatura: { logo: d().logo } });
  } finally {
    caixa.remove();
  }
}

const COMO_ASSINAM = {
  contrato: 'A empresa assina digitalmente só a parte dela: o selo fica na linha da LOCADORA e a página "Assinatura digital" vai no fim. O inquilino, os fiadores e as testemunhas assinam como hoje (à mão ou pelo gov.br, no próprio PDF assinado pela empresa) e o contrato assinado por todos continua sendo anexado na página do inquilino. O e-mail "Contrato para assinar" leva o PDF assinado pela empresa.',
  aditivo: 'A empresa assina digitalmente só a parte dela: o selo fica na linha da LOCADORA e a página "Assinatura digital" vai no fim. As outras partes assinam como hoje (à mão ou pelo gov.br, no próprio PDF assinado pela empresa) e o termo assinado por todos continua sendo anexado em "Termos aditivos". O e-mail do termo para assinar leva o PDF assinado pela empresa.',
  carta_reajuste: 'A carta é só para ciência do inquilino: só a empresa assina, e o selo vai na página "Assinatura digital" no fim. O "✉ Enviar por e-mail" passa a levar a carta assinada.',
};

/**
 * Caixa da assinatura digital na página do contrato, do termo aditivo ou da carta de reajuste (regra `assinatura_digital`):
 * "Enviar para assinar", a situação na fila do PC e, assinado, "Baixar PDF assinado". Texto mudado depois da assinatura:
 * avisa que a assinada é a versão de antes. Desligada, sem acesso de operador ou já assinado por todos, nada aparece.
 */
export async function caixaAssinaturaDoc(tipo, q) {
  if (!R.regra('assinatura_digital') || !opera()) return '';
  const doc = await documentoParaAssinar(tipo, q);
  if (!doc || doc.assinadoPorTodos) return '';
  if (!E.nuvem) return '<div class="alerta info nao-imprimir">Assinatura digital: só pelo sistema na internet (a fila fica na nuvem e o PC com o certificado assina).</div>';
  let fila = null;
  try { fila = await AS.fila(); } catch (e) { return `<div class="alerta aviso nao-imprimir">Assinatura digital: ${esc(e.message)}</div>`; }
  const p = AS.pedidoDe(fila, doc.chave);
  const antiga = p ? null : AS.pedidosDoDocumento(fila, doc.prefixo).find((x) => x.situacao === 'assinado');
  const s = AS.situacaoDoPedido(p, fila.pc);
  const cert = fila.pc?.certificado;
  const outra = doc.blocos && locadoraQueAssina(doc.blocos, cert).outra;
  const assinado = p && p.situacao === 'assinado';
  return `<div class="cartao nao-imprimir" style="margin:0 0 12px"><p><b>Assinatura digital da empresa</b> · <span class="etiqueta ${s.cor}">${esc(s.texto)}</span></p>
    ${antiga ? `<p class="alerta aviso">O documento mudou depois da assinatura de ${esc(C.dataHoraBr(antiga.assinado_em))}: a versão assinada é a de antes. Envie de novo para assinar este texto.</p>` : ''}
    ${outra ? `<p class="alerta aviso">O certificado anexado é de ${esc(cert.nome)}${cert.cnpj ? ` (CNPJ ${esc(cert.cnpj)})` : ''}, que não é LOCADORA neste documento: o selo vai só na página "Assinatura digital" do fim.</p>` : ''}
    <p class="acoes">${assinado ? `${botao('assinaturaDocBaixar', 'Baixar PDF assinado', { pedido: p.id }, '')} ` : ''}
      ${botao('assinaturaDocPedir', p ? 'Enviar de novo para assinar' : 'Enviar para assinar', {}, assinado ? 'secundario pequeno' : '')}
      ${p && !assinado ? botao('assinaturaCancelar', 'Tirar da fila', { id: p.id }, 'secundario pequeno') : ''}
      ${botao('assinaturaAtualizar', 'Atualizar', {}, 'secundario pequeno')}</p>
    <p class="suave">Confira o documento abaixo (ou pelo "Baixar PDF", que sai sem a assinatura) antes de enviar para assinar. ${esc(COMO_ASSINAM[tipo])} Enviar de novo troca a versão que está na fila (e a assinada antes).</p></div>`;
}

/**
 * O PDF assinado do documento, para o e-mail: { blob, nome } ou { motivo } (não assinado: o e-mail leva o de sempre).
 * Null com a assinatura desligada ou fora da nuvem.
 */
export async function assinadoDoDocumento(tipo, q) {
  if (!R.regra('assinatura_digital') || !E.nuvem) return null;
  const doc = await documentoParaAssinar(tipo, q);
  if (!doc) return null;
  let fila = null;
  try { fila = await AS.fila({ fresca: true }); } catch (e) { return { motivo: e.message }; }
  const r = AS.assinadoParaEmail(fila, doc.prefixo, doc.chave);
  if (!r.ok) return { motivo: r.motivo || 'não foi enviado para assinar' };
  return { blob: await AS.baixarAssinado(r.pedido.id), nome: `${String(r.pedido.nome || doc.nome).replace(/\.pdf$/i, '')} - assinado.pdf` };
}

/** Manda o documento da página para a fila; as outras versões dele saem da fila (a de antes da mudança do texto). */
export async function pedirAssinaturaDoc() {
  const [tipo, q] = documentoDaPagina();
  const doc = await documentoParaAssinar(tipo, q);
  if (!doc) throw new C.ErroUsuario('Este documento não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
  aviso('Montando o PDF para assinar…', 'info');
  const fila = await AS.fila({ fresca: true });
  const blob = await pdfParaAssinar(doc, fila.pc?.certificado);
  const novo = await AS.pedirAssinatura(blob, { titulo: doc.titulo, chave: doc.chave, nome: doc.nome, contrato: doc.c.id });
  for (const x of AS.pedidosDoDocumento(fila, doc.prefixo).filter((y) => !novo || y.id !== novo.id)) {
    try { await AS.cancelarAssinatura(x.id); } catch { /* fica na fila; o e-mail usa o desta versão */ }
  }
  aviso('Enviado para assinar: o programa do PC com o certificado assina em cerca de 1 minuto (se estiver ligado).', 'ok');
  await mostrar();
}

/** Baixa o PDF assinado e guarda uma cópia na pasta do inquilino. */
export async function baixarAssinaturaDoc(pedido) {
  const blob = await AS.baixarAssinado(pedido);
  const [tipo, q] = documentoDaPagina();
  const doc = await documentoParaAssinar(tipo, q);
  const p = ((await AS.fila()).pedidos || []).find((x) => x.id === pedido) || {};
  const nome = `${S.limparNome(String(p.nome || (doc && doc.nome) || 'documento-assinado.pdf').replace(/\.pdf$/i, ''))} - assinado.pdf`;
  if (doc) { try { await S.escreverTexto(await pastaDoEscopo('contrato', doc.c.id), nome, blob); } catch (e) { aviso(`O PDF foi baixado, mas não consegui guardar a cópia na pasta: ${e.message}`, 'aviso'); } }
  baixar(blob, nome);
}
