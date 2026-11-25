// E-mails por etapa: botão "E-mail" nas etapas da ficha, da entrada e da saída (e no informe anual do IR), a janela com o
// texto preenchido (Copiar texto · Abrir no Gmail · Enviar agora) e a tela de edição dos modelos (Sistema → Comunicação E-mail).
// Modelos e preenchimento: modelos-email.js e email-dados.js. Envio direto: gmail.js (Worker, só na nuvem com o Gmail ligado).
import { alterar, aviso, baixar, confirmar, E, ir, login, mostrar, podeUsuario, voltarFecha } from '../app.js';
import * as S from '../armazenamento.js';
import * as BANCO from '../banco.js';
import * as C from '../calculos.js';
import { dataBr } from '../calculos.js';
import { anexosProntos, avisoBoletoPdfDesatualizado, dadosDoEmail, informesPendentes } from '../email-dados.js';
import { esc } from '../formularios.js';
import { desconectarGmail, emailLigado, enderecoParaConectar, enviarEmail, situacaoGmail } from '../gmail.js';
import { MODELOS_EMAIL, modeloEmail, montarEmail } from '../modelos-email.js';
import * as R from '../regras.js';
import { ACEITA_DOCUMENTOS, arquivoSumiu, botao, buscar, d, etiqueta, link, naoEncontrado, opera, pastaDoEscopo } from './comum.js';
import { pdfDoRecibo } from './documentos.js';
import { documentoParaAssinar } from './assinatura-documentos.js';
import * as AS from '../assinatura.js';

/** Endereço do Gmail para escrever: com o texto, enquanto couber no endereço (o navegador corta endereços muito longos). */
const LIMITE_ENDERECO = 7000;

/** Último envio registrado deste e-mail para o contrato ou a ficha (ou null); com ``alvo.aditivo``, só o daquele termo aditivo. */
export function ultimoEnvio(chave, alvo) {
  return (d().envios_email || []).filter((x) => x.chave === chave && ((alvo.contrato && x.contrato_id === Number(alvo.contrato)) || (alvo.ficha && x.ficha_id === Number(alvo.ficha)))
    && (!alvo.aditivo || x.aditivo_id === Number(alvo.aditivo)) && (!alvo.notificacao || x.notificacao_id === Number(alvo.notificacao)) && (!alvo.cobranca || x.cobranca_id === Number(alvo.cobranca)))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0] || null;
}

/** Botão "E-mail" de uma etapa, com a data do último envio. ``alvo``: { contrato: id } ou { ficha: id } (e { aditivo: id } no termo aditivo). */
export function botaoEmail(chave, alvo, texto = '✉ E-mail') {
  if (!opera() || !MODELOS_EMAIL.some((m) => m.chave === chave)) return '';
  const u = ultimoEnvio(chave, alvo);
  return `${botao('abrirEmail', texto, { chave, ...alvo }, 'secundario mini')}${u ? ` <span class="suave" title="${esc(u.como)}">${u.como === 'enviado' ? 'enviado' : 'aberto'} em ${dataBr(u.data)}</span>` : ''}`;
}

/**
 * Guarda o envio. E-mail só aberto no Gmail (sem envio): um registro por etapa, alvo e dia, sem linha no histórico; abrir de
 * novo no mesmo dia não grava outro (antes, cada clique era uma linha a mais, para sempre: item 48).
 */
const registrar = (chave, alvo, para, assunto, como, id = '') => alterar((db) => {
  const dados = { data: C.hojeIso(), chave, contrato_id: alvo.contrato ? Number(alvo.contrato) : null, ficha_id: alvo.ficha ? Number(alvo.ficha) : null, aditivo_id: alvo.aditivo ? Number(alvo.aditivo) : null,
    ...(alvo.notificacao ? { notificacao_id: Number(alvo.notificacao) } : {}), ...(alvo.cobranca ? { cobranca_id: Number(alvo.cobranca) } : {}), para, assunto, como, gmail_id: id || null };
  // notificação mandada pelo "Enviar agora": fica marcada como enviada por e-mail nesse dia (o prazo passa a correr)
  const n = como === 'enviado' && chave === 'notificacao_envio' && alvo.notificacao ? R.buscar(db, 'notificacoes', alvo.notificacao) : null;
  if (n && n.situacao === 'Rascunho') R.marcarNotificacaoEnviada(db, n.id, { data: dados.data, meio: 'E-mail' }, login());
  if (como !== 'enviado') {
    const ja = (db.envios_email || []).find((x) => x.como === como && x.data === dados.data && x.chave === chave && x.contrato_id === dados.contrato_id && x.ficha_id === dados.ficha_id && x.aditivo_id === dados.aditivo_id
      && (x.notificacao_id || null) === (dados.notificacao_id || null) && (x.cobranca_id || null) === (dados.cobranca_id || null));
    if (ja) return ja;
    return R.inserir(db, 'envios_email', dados, login(), null, { historico: false });
  }
  return R.inserir(db, 'envios_email', dados, login(), `E-mail "${assunto}" enviado para ${para || '(sem destinatário)'}`);
});

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

/** Lista dos anexos do sistema na janela: recibo (PDF) e comprovantes, marcados; recibo que ainda não pode sair diz o motivo. */
function listaProntos(prontos, ligado) {
  if (!prontos.length) return '';
  const linha = (a, k) => ((a.tipo === 'recibo' || a.tipo === 'digital') && !a.ok ? `<p class="suave">🧾 ${esc(a.rotulo)}: ${esc(a.motivo)}</p>`
    : `<p><label class="check"><input type="checkbox" name="pronto" value="${k}" checked> ${a.tipo === 'recibo' || a.tipo === 'digital' ? `🧾 ${esc(a.rotulo)} (PDF)` : `📎 ${esc(a.rotulo)}`}</label></p>`);
  const algum = prontos.some((a) => (a.tipo !== 'recibo' && a.tipo !== 'digital') || a.ok);
  return `<div class="cartao" style="margin:0 0 8px"><p><b>Anexos do sistema</b></p>${prontos.map(linha).join('')}
    ${algum ? `<p><button type="button" class="secundario mini" data-baixar-prontos>Baixar os marcados</button> <span class="suave">${ligado ? 'Vão juntos no "Enviar agora".' : 'Para o Gmail: baixe e anexe por lá.'}</span></p>` : ''}</div>`;
}

/**
 * O recibo do e-mail: com a assinatura digital ligada (regra assinatura_digital), só o PDF assinado pelo PC, baixado da fila
 * (o mesmo documento da página do recibo, pela chave); ainda não assinado, o e-mail não vai. Desligada (ou na ficha, que a
 * pessoa preenche), o PDF montado na hora, como antes.
 */
async function reciboParaEnviar(a, alvo) {
  if (!R.regra('assinatura_digital') || AS.SEM_ASSINATURA_DA_EMPRESA.includes(a.recibo)) { const r = await pdfDoRecibo(a.recibo, alvo); return { nome: r.nome, blob: r.blob }; }
  const p = AS.pedidoDe(await AS.fila({ fresca: true }), AS.chaveDoRecibo(a.recibo, alvo));
  if (!p || p.situacao !== 'assinado') throw new C.ErroUsuario(`O ${a.rotulo} ainda não foi assinado digitalmente${p && p.situacao === 'erro' ? ` (${p.erro})` : p ? ' (está na fila do PC)' : ''}: abra o recibo e use "Enviar para assinar", ou desmarque esse anexo. Nada foi enviado.`);
  return { nome: `${String(p.nome || 'documento.pdf').replace(/\.pdf$/i, '')} - assinado.pdf`, blob: await AS.baixarAssinado(p.id) };
}

/**
 * Contrato e termo aditivo assinados digitalmente pela empresa (``digital`` de anexosProntos, 2026-11-24): procura na fila.
 * Aditivo: a versão do texto de agora (pela chave); contrato: a mais nova (o e-mail não sabe o modelo e as testemunhas
 * escolhidos na página). Sem versão na fila (ou fora da nuvem), sai da lista: o contrato é anexado à mão, como antes.
 */
async function assinadosDaFila(prontos) {
  if (!prontos.some((a) => a.tipo === 'digital')) return prontos;
  let fila = null;
  try { if (E.nuvem) fila = await AS.fila({ fresca: true }); } catch { fila = null; }
  const out = [];
  for (const a of prontos) {
    if (a.tipo !== 'digital') { out.push(a); continue; }
    const c = fila && buscar('contratos', a.contrato);
    if (!c) continue;
    const doc = a.doc === 'aditivo' ? await documentoParaAssinar('aditivo', { id: a.id }) : null;
    if (a.doc === 'aditivo' && !doc) continue;
    const r = AS.assinadoParaEmail(fila, AS.prefixoDoDocumento(a.doc, { contrato: c, id: a.id }), doc ? doc.chave : null);
    if (!r.pedido) continue;
    out.push({ ...a, pedido: r.pedido.id, ok: r.ok, motivo: r.motivo, nome: `${String(r.pedido.nome || 'documento.pdf').replace(/\.pdf$/i, '')} - assinado.pdf`,
      // a data no horário daqui (assinado às 22h de 24/11 é 01h de 25/11 no horário universal)
      rotulo: r.ok && r.pedido.assinado_em ? `${a.rotulo} em ${C.dataHoraBr(r.pedido.assinado_em).split(',')[0]}` : a.rotulo });
  }
  return out;
}

/** Arquivos dos anexos marcados: o recibo vira PDF na hora; o comprovante é lido da pasta. [{ nome, blob }] */
async function arquivosProntos(dlg, prontos, objeto) {
  const out = [];
  for (const el of dlg.querySelectorAll('[name=pronto]:checked')) {
    const a = prontos[Number(el.value)];
    if (a.tipo === 'recibo') out.push(await reciboParaEnviar(a, a.alvo || objeto));
    else if (a.tipo === 'digital') out.push({ nome: a.nome, blob: await AS.baixarAssinado(a.pedido) });
    else if (a.tipo === 'boleto') {
      // boleto emitido no C6 (ex.: o do saldo da saída, 2026-11-20): o PDF vem pela ponte; o QR Code do Pix já está guardado
      const cb = buscar('cobrancas', a.id);
      const blob = cb && cb.banco ? (a.qual === 'pdf' ? await pdfDoBoleto(cb) : qrDoPix(cb.banco)) : null;
      if (!blob) throw new C.ErroUsuario(`Não consegui pegar o ${a.rotulo}: confira se a ponte do C6 está ligada neste computador, ou desmarque esse anexo.`);
      out.push({ nome: a.nome, blob });
    }
    else out.push({ nome: a.nome, blob: await S.abrirArquivo(await pastaDoEscopo(a.escopo, Number(a.id)), a.nome) });
  }
  return out;
}

/** PDF do boleto no C6, pela ponte deste computador (null se a ponte não responder). Igual ao da régua (telas/regua.js). */
async function pdfDoBoleto(cb) {
  let blob = null;
  try {
    await BANCO.chamarPonteCrua('GET', `/contas/${encodeURIComponent(cb.banco.conta_id)}/boletos/${encodeURIComponent(cb.banco.id_externo)}/pdf`, null, { fetch: async (url, o) => {
      const r = await fetch(url, o);
      if (!r.ok) return r;
      blob = await r.blob();
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    } });
  } catch { blob = null; }
  return blob;
}

function qrDoPix(b) {
  if (!b.pix_qr_base64) return null;
  const bin = atob(b.pix_qr_base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: b.pix_qr_mime || 'image/png' });
}

const campoPergunta = ([nome, rotulo, tipo], valor) => {
  if (tipo === 'area') return `<p><label>${esc(rotulo)}</label><textarea name="p_${nome}" rows="3">${esc(valor)}</textarea></p>`;
  const t = tipo === 'data' ? 'date' : tipo === 'ano' ? 'number' : 'text';
  return `<p><label>${esc(rotulo)}</label><input type="${t}" name="p_${nome}" value="${esc(valor)}"${tipo === 'ano' ? ' min="2020" max="2100" style="width:120px"' : ''}></p>`;
};

/**
 * Janela do e-mail: perguntas (redesenham o texto enquanto ele não for mexido à mão), destinatário, assunto e texto
 * editáveis, e os três botões. Fica aberta depois de copiar ou abrir o Gmail; fecha depois de enviar.
 */
async function janelaEmail(chave, alvo) {
  const modelo = modeloEmail(d(), chave);
  const reg = alvo.contrato ? buscar('contratos', alvo.contrato) : buscar('fichas', alvo.ficha);
  if (!modelo || !reg) throw new C.ErroUsuario('Este inquilino ou ficha não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
  const objeto = alvo.contrato ? { contrato: reg } : { ficha: reg };
  if (alvo.aditivo) {
    objeto.aditivo = buscar('aditivos', alvo.aditivo);
    if (!objeto.aditivo) throw new C.ErroUsuario('Este termo aditivo não existe mais (pode ter sido excluído). Atualize a página.');
  }
  if (alvo.notificacao) {
    objeto.notificacao = buscar('notificacoes', alvo.notificacao);
    if (!objeto.notificacao) throw new C.ErroUsuario('Esta notificação não existe mais (pode ter sido excluída). Atualize a página.');
  }
  if (alvo.cobranca) {
    objeto.cobranca = buscar('cobrancas', alvo.cobranca);
    if (!objeto.cobranca) throw new C.ErroUsuario('Este boleto não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
  }
  const inicio = dadosDoEmail(d(), objeto);
  const ligado = await emailLigado();
  const perguntas = (modelo.perguntas || []).map((p) => campoPergunta(p, inicio.perguntas[p[0]] ?? '')).join('');
  const prontos = await assinadosDaFila(anexosProntos(d(), modelo, objeto));
  const dlg = document.createElement('dialog');
  dlg.className = 'janela-erro janela-pergunta janela-email';
  dlg.innerHTML = `<form method="dialog"><h3><span>${esc(modelo.nome)} · ${esc(reg.inquilino_nome || '')}</span><button type="button" class="fechar-janela" data-fechar title="Fechar" aria-label="Fechar">✕</button></h3><div class="corpo">
    ${perguntas ? `<div class="cartao" style="margin:0 0 8px">${perguntas}</div>` : ''}
    <p class="suave">De: ${esc(inicio.remetente.assinatura || 'Administradora')}${inicio.remetente.email ? ` &lt;${esc(inicio.remetente.email)}&gt;` : ''}${modelo.anexos ? ` · Anexar: <b>${esc(modelo.anexos)}</b>` : ''}</p>
    ${listaProntos(prontos, ligado)}
    <p><label>Para</label><input type="email" name="para" value="${esc(inicio.para)}" multiple></p>
    ${inicio.para ? '' : '<p class="alerta aviso">Sem e-mail no cadastro: digite o destinatário.</p>'}
    <p><label>Assunto</label><input name="assunto"></p>
    <p><label>Texto <span class="suave">(pode alterar antes de enviar)</span></label><textarea name="texto" rows="16" spellcheck="true"></textarea></p>
    <p class="suave" data-editado hidden>Texto alterado à mão: as respostas acima não mudam mais o texto.</p>
    ${ligado ? `<p><label>${prontos.length ? 'Outros anexos' : 'Anexos'} para o "Enviar agora" <span class="suave">(PDF ou foto)</span></label><input type="file" name="anexos" multiple accept="${ACEITA_DOCUMENTOS}"></p>` : ''}
    ${ligado && modelo.anexoObrigatorio && !prontos.some((a) => a.tipo !== 'digital' || a.ok) ? `<p class="alerta aviso">Falta anexar: ${esc(modelo.anexos)}. Escolha o arquivo acima; sem ele o e-mail não sai.</p>` : ''}
    <p class="suave">${alvo.contrato && /saida_aviso/.test(chave) ? 'Confira no contrato do inquilino a multa da saída antecipada antes de enviar. ' : ''}${ligado ? '' : 'Envio direto ainda não ligado: use "Copiar texto" ou "Abrir no Gmail".'}</p>
  </div><div class="acoes" style="justify-content:flex-end;flex-wrap:wrap">
    <p class="alerta aviso-janela" data-aviso-janela role="status" aria-live="polite" hidden style="flex-basis:100%"></p>
    <button type="button" class="secundario" data-fechar>Fechar</button>
    <button type="button" class="secundario" data-copiar>Copiar texto</button>
    <button type="button" class="secundario" data-gmail>Abrir no Gmail</button>
    ${ligado ? '<button type="button" data-enviar>Enviar agora</button>' : ''}</div></form>`;
  document.body.appendChild(dlg);
  const q = (s) => dlg.querySelector(s);
  let editado = false;
  let assuntoEditado = false;
  let registrou = false;
  // aviso dos botões dentro da própria janela (no topo da página ele ficaria atrás dela, sem ninguém ver)
  const avisar = (texto, tipo = 'ok') => {
    const el = q('[data-aviso-janela]');
    el.className = `alerta aviso-janela ${tipo}`;
    el.textContent = texto;
    el.hidden = false;
    el.scrollIntoView({ block: 'nearest' });
  };
  const respostas = () => Object.fromEntries((modelo.perguntas || []).map(([n]) => [n, q(`[name=p_${n}]`).value]));
  const desenhar = () => {
    const e = montarEmail(modelo, dadosDoEmail(d(), objeto, respostas()));
    if (!assuntoEditado) q('[name=assunto]').value = e.assunto;
    if (!editado) q('[name=texto]').value = e.texto;
  };
  desenhar();
  q('[name=texto]').addEventListener('input', () => { editado = true; q('[data-editado]').hidden = false; });
  q('[name=assunto]').addEventListener('input', () => { assuntoEditado = true; });
  dlg.querySelectorAll('[name^=p_]').forEach((el) => el.addEventListener('input', desenhar));
  const atual = () => ({ para: q('[name=para]').value.trim(), assunto: q('[name=assunto]').value.trim(), texto: q('[name=texto]').value });
  const pendente = () => (/\[preencher: /.test(atual().texto + atual().assunto) ? 'Ainda há "[preencher: ...]" no texto: complete antes de mandar.' : '');
  dlg.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  const baixarProntos = q('[data-baixar-prontos]');
  if (baixarProntos) baixarProntos.addEventListener('click', async () => {
    baixarProntos.disabled = true;
    try {
      const lista = await arquivosProntos(dlg, prontos, objeto);
      if (!lista.length) { avisar('Marque pelo menos um anexo.', 'aviso'); return; }
      for (const a of lista) baixar(a.blob, a.nome);
    } catch (erro) {
      aviso(erro.message || 'Não consegui preparar os anexos.', 'erro');
    } finally { baixarProntos.disabled = false; }
  });
  q('[data-copiar]').addEventListener('click', async () => {
    const e = atual();
    const ok = await copiar(`${e.assunto}\n\n${e.texto}`);
    avisar(ok ? `Assunto e texto copiados: cole no e-mail.${pendente() ? ` ${pendente()}` : ''}` : 'O navegador não deixou copiar: selecione o texto e copie.', !ok || pendente() ? 'aviso' : 'ok');
  });
  q('[data-gmail]').addEventListener('click', async () => {
    const e = atual();
    if (pendente() && !(await confirmar(`${pendente()}\n\nAbrir o Gmail mesmo assim? O texto vai com o buraco, e você completa por lá.`, { titulo: 'Texto incompleto', sim: 'Abrir mesmo assim' }))) return;
    const comCorpo = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(e.para)}&su=${encodeURIComponent(e.assunto)}&body=${encodeURIComponent(e.texto)}`;
    const cabe = comCorpo.length <= LIMITE_ENDERECO;
    const copiado = await copiar(e.texto);
    // sem 'noopener' no open (com ele o navegador devolve null sempre e não se sabe se a aba abriu); o opener sai à mão
    const aba = window.open(cabe ? comCorpo : `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(e.para)}&su=${encodeURIComponent(e.assunto)}`, '_blank');
    if (!aba) { avisar(`O navegador bloqueou a aba do Gmail (bloqueador de janelas): permita janelas deste site e clique de novo, ou use "Copiar texto".${copiado ? ' O texto já foi copiado.' : ''}`, 'aviso'); return; }
    try { aba.opener = null; } catch { /* outra origem */ }
    await registrar(chave, alvo, e.para, e.assunto, 'aberto no Gmail');
    registrou = true;
    avisar(cabe ? 'Gmail aberto com o texto. Anexe os arquivos e envie por lá.' : copiado ? 'Gmail aberto. O texto é comprido para ir pelo endereço: ele foi copiado, cole no corpo do e-mail.' : 'Gmail aberto. Copie o texto da janela e cole no corpo do e-mail.', cabe ? 'ok' : 'aviso');
  });
  const enviar = q('[data-enviar]');
  if (enviar) enviar.addEventListener('click', async () => {
    const e = atual();
    if (!e.para) { avisar('Digite o e-mail do destinatário.', 'aviso'); return; }
    if (pendente()) { avisar(pendente(), 'aviso'); return; }
    // notificação: confere antes de mandar se o envio poderá ser marcado (senão o e-mail sairia e o prazo não correria)
    const n = chave === 'notificacao_envio' && alvo.notificacao ? buscar('notificacoes', alvo.notificacao) : null;
    if (n && n.situacao === 'Rascunho' && n.data > C.hojeIso()) { avisar(`A notificação está datada de ${dataBr(n.data)}, no futuro: o envio não poderia ser marcado. Corrija a data no rascunho (hoje ou antes) e mande depois.`, 'aviso'); return; }
    let arquivos;
    try {
      arquivos = [...await arquivosProntos(dlg, prontos, objeto), ...[...(q('[name=anexos]').files || [])].map((f) => ({ nome: f.name, blob: f }))];
    } catch (erro) { aviso(`Não consegui preparar os anexos: ${erro.message}`, 'erro'); return; }
    // e-mail que só existe para levar o arquivo (contrato para assinar): sem ele, não sai e não fica registrado
    if (!arquivos.length && modelo.anexoObrigatorio) { avisar(`Falta anexar: ${modelo.anexos}. Escolha o arquivo em "${prontos.length ? 'Outros anexos' : 'Anexos'}" e clique de novo. Nada foi enviado.`, 'aviso'); return; }
    // o que merece destaque na pergunta: texto que fala em anexo sem nenhum arquivo, e notificação sem a assinatura
    const alertas = [];
    if (!arquivos.length && modelo.anexos) alertas.push(`ATENÇÃO: o texto fala em anexo (${modelo.anexos}), mas nenhum arquivo vai junto. Anexe em "${prontos.length ? 'Outros anexos' : 'Anexos'}" antes de enviar.`);
    const marcados = [...dlg.querySelectorAll('[name=pronto]:checked')].map((el) => prontos[Number(el.value)]);
    // com a assinatura digital ligada, o PDF que vai é o assinado pelo PC (reciboParaEnviar): o alerta seria falso
    if (n && !n.arquivo_assinado && !R.regra('assinatura_digital') && marcados.some((a) => a.tipo === 'recibo' && a.recibo === 'notificacao')) alertas.push('ATENÇÃO: vai o PDF da notificação SEM a assinatura (a assinada não foi anexada na notificação). Ao enviar, a notificação fica marcada como enviada hoje e o prazo começa a correr.');
    if (!(await confirmar(`${alertas.length ? `${alertas.join('\n\n')}\n\n` : ''}O e-mail vai agora para ${e.para}${arquivos.length ? `, com ${arquivos.length} anexo(s)` : ', sem anexo'}.`, { titulo: alertas.length ? 'Enviar mesmo assim?' : 'Enviar o e-mail?', sim: 'Enviar agora', forte: alertas.length > 0 }))) return;
    enviar.disabled = true;
    try {
      const r = await enviarEmail({ para: e.para, assunto: e.assunto, texto: e.texto, anexos: arquivos });
      await registrar(chave, alvo, e.para, e.assunto, 'enviado', r.id);
      dlg.close();
      aviso(`E-mail enviado para ${e.para}. Fica em "Enviados" no Gmail.`);
      await mostrar();
    } catch (erro) {
      aviso(erro.message || 'O e-mail não foi enviado.', 'erro');
    } finally { enviar.disabled = false; }
  });
  // ao fechar, a página mostra a data do e-mail aberto no Gmail ao lado do botão
  dlg.addEventListener('close', () => { dlg.remove(); if (registrou) mostrar(); });
  voltarFecha(dlg);
  dlg.showModal();
}

/** Aviso da volta do Google (#/sistema-email?gmail=…, nuvem/worker.mjs AVISOS_VOLTA_GMAIL). */
const VOLTA_GMAIL = {
  ligado: ['ok', 'Gmail conectado. Faça um teste: abra o e-mail de uma etapa, ponha o seu próprio e-mail e clique em <b>Enviar agora</b>; ele aparece em "Enviados" no Gmail.'],
  cancelado: ['aviso', 'Você cancelou na tela do Google: nada foi ligado.'],
  recusado: ['erro', 'O pedido venceu ou foi aberto em outro navegador. Clique em <b>Conectar o Gmail</b> de novo e termine em até 10 minutos, no mesmo navegador.'],
  'sem-permissao': ['erro', 'Faltou marcar, na tela do Google, a caixa de <b>enviar e-mail em seu nome</b>. Clique em <b>Conectar o Gmail</b> de novo e marque essa caixa.'],
  credencial: ['erro', 'O Google não reconheceu o aplicativo: falta terminar a configuração do Gmail na nuvem. Peça ao técnico para conferir (para ele: segredos GMAIL_CLIENT_ID e GMAIL_CLIENT_SECRET no Cloudflare).'],
  retorno: ['erro', 'O endereço de retorno cadastrado no Google está diferente. Copie o endereço abaixo e mande ao técnico, para ele cadastrar no Google Cloud.'],
  'sem-rede': ['erro', 'Não deu para falar com o Google agora. Tente de novo daqui a pouco.'],
  erro: ['erro', 'Não deu para ligar o Gmail. Tente de novo; se repetir, peça ajuda ao técnico.'],
};

/**
 * Caixa "E-mail pelo Gmail" (Sistema → Comunicação E-mail, só administrador): situação, Conectar o Gmail / Desconectar e o endereço de
 * retorno para colar no Google Cloud. `volta`: o código que o Worker manda na volta do Google (?gmail=…).
 */
export async function caixaGmailHtml(volta = '') {
  if (!podeUsuario('admin')) return '';
  const topo = '<div class="cartao"><h2>E-mail pelo Gmail</h2>';
  if (!E.nuvem) {
    return `${topo}<p class="suave">O envio direto (botão <b>Enviar agora</b>) só existe no sistema na nuvem (erp.ankjck.com.br), onde o administrador liga o Gmail da empresa com o botão <b>Conectar o Gmail</b>. Aqui, os e-mails saem por <b>Copiar texto</b> ou <b>Abrir no Gmail</b>.</p></div>`;
  }
  const s = await situacaoGmail();
  const [tipo, texto] = VOLTA_GMAIL[volta] || [];
  const avisoVolta = texto ? `<div class="alerta ${tipo}">${texto}</div>` : '';
  if (!s) return `${topo}${avisoVolta}<p class="suave">Não deu para ver a situação agora (sem internet?). Recarregue a página para tentar de novo.</p></div>`;
  let situacao;
  if (s.origem === 'conta' && s.ligado) {
    situacao = `<p>${etiqueta('Ligado', 'ok')} Os e-mails saem pela conta <b>${esc(s.conta || '')}</b>${s.remetente && s.remetente !== s.conta ? `, com o remetente <b>${esc(s.remetente)}</b>` : ''}${s.ligado_em ? ` <span class="suave">(conectado em ${dataBr(String(s.ligado_em).slice(0, 10))})</span>` : ''}.</p>`;
  } else if (s.origem === 'segredo' && s.ligado) {
    situacao = `<p>${etiqueta('Ligado', 'ok')} Pelo jeito antigo (código colado no Cloudflare), com o remetente <b>${esc(s.remetente || '')}</b>.</p>
      <p class="suave">Para passar ao botão: clique em <b>Conectar o Gmail</b>. Depois disso o jeito antigo deixa de ser usado e o técnico pode apagá-lo da nuvem (para ele: segredo GMAIL_REFRESH_TOKEN no Cloudflare).</p>`;
  } else if (s.origem === 'simulado') {
    situacao = `<p>${etiqueta('Simulado', 'info')} Teste no computador: os e-mails só aparecem na janela do programa, nada vai ao Google.</p>`;
  } else {
    situacao = `<p>${etiqueta('Desligado', 'neutra')} Os e-mails saem por <b>Copiar texto</b> ou <b>Abrir no Gmail</b>.</p>`;
  }
  const ilegivel = s.ilegivel ? '<div class="alerta aviso">A autorização guardada não abre mais (a configuração do Google pode ter sido trocada). Clique em <b>Conectar o Gmail</b> de novo.</div>' : '';
  const falta = s.cliente ? '' : '<div class="alerta info">Falta terminar a configuração do Gmail na nuvem antes de conectar: peça ao técnico <span class="suave">(para ele: segredos GMAIL_CLIENT_ID e GMAIL_CLIENT_SECRET no Cloudflare)</span>.</div>';
  const botoes = s.origem === 'simulado' ? '' : `<p>${s.cliente ? botao('conectarGmail', s.origem === 'conta' && s.ligado ? 'Trocar a conta do Gmail' : 'Conectar o Gmail', {}, 'pequeno') : ''}
    ${s.origem === 'conta' ? botao('desconectarGmail', 'Desconectar', {}, 'perigo pequeno', 'Desconectar o Gmail? O botão "Enviar agora" some até alguém conectar de novo; a permissão também é retirada na conta do Google.') : ''}</p>`;
  const retorno = s.retorno ? `<p><label>Endereço de retorno <span class="suave">(para o técnico: Google Cloud, credencial, "URIs de redirecionamento autorizados")</span></label>
    <span class="nw"><input readonly value="${esc(s.retorno)}" data-retorno-gmail style="max-width:480px"> ${botao('copiarRetornoGmail', 'Copiar', {}, 'secundario pequeno')}</span></p>` : '';
  return `${topo}${avisoVolta}${ilegivel}
    <p class="suave">Com o Gmail conectado, os e-mails das etapas (boleto, NF, recibos, avisos) saem pelo botão <b>Enviar agora</b>, pela conta da empresa. Conectar é como entrar com o Google em qualquer site: <b>Conectar o Gmail → escolher a conta → Permitir</b>. O sistema só <b>envia</b>: não lê a caixa de entrada.</p>
    ${situacao}${falta}${botoes}${retorno}</div>`;
}

export const ACOES_EMAILS = {
  async conectarGmail() {
    const url = await enderecoParaConectar();
    aviso('Abrindo a tela do Google…', 'info');
    window.location.assign(url);
  },

  async desconectarGmail() {
    const r = await desconectarGmail();
    aviso(r.segredo_antigo ? 'Gmail desconectado. Atenção: o jeito antigo ainda está guardado na nuvem e continua enviando até o técnico apagá-lo (para ele: segredo GMAIL_REFRESH_TOKEN no Cloudflare).'
      : r.havia && !r.revogado ? 'Gmail desconectado aqui. O Google não confirmou a retirada da permissão: confira em Conta do Google → Segurança → Apps com acesso.' : 'Gmail desconectado.', r.segredo_antigo || (r.havia && !r.revogado) ? 'aviso' : 'ok');
    if (/[?&]gmail=/.test(window.location.hash)) ir('#/sistema-email'); else await mostrar();
  },

  async copiarRetornoGmail() {
    const campo = document.querySelector('[data-retorno-gmail]');
    if (!campo) return;
    if (await copiar(campo.value)) aviso('Endereço copiado. Mande ao técnico, para ele colar no Google Cloud.');
    else { campo.select(); aviso('O navegador não deixou copiar: o endereço ficou selecionado, é só copiar.', 'info'); }
  },

  async abrirEmail({ chave, contrato, ficha, aditivo, notificacao, cobranca }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode enviar e-mails. Peça ao administrador, se precisar.');
    await janelaEmail(chave, contrato ? { contrato: Number(contrato), ...(aditivo ? { aditivo: Number(aditivo) } : {}), ...(notificacao ? { notificacao: Number(notificacao) } : {}), ...(cobranca ? { cobranca: Number(cobranca) } : {}) } : { ficha: Number(ficha) });
  },

  /**
   * "Enviar boleto por e-mail" (página do boleto, 2026-11-24): abre a janela do e-mail com o PDF do banco anexado. Sem o PDF
   * (ou com o arquivo sumido da pasta) só avisa; boleto que mudou depois de anexado o PDF pergunta antes.
   */
  async enviarBoletoEmail({ id }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode enviar e-mails. Peça ao administrador, se precisar.');
    const cb = buscar('cobrancas', id);
    if (!cb) throw new C.ErroUsuario('Este boleto não existe mais (pode ter sido excluído por outra pessoa). Atualize a página.');
    if (!cb.boleto_pdf) throw new C.ErroUsuario('Anexe antes o PDF do boleto emitido no banco (botão "Anexar o PDF do boleto", nesta página). O e-mail vai com ele.');
    if (arquivoSumiu('contrato', R.pastaDoBoletoPdf(cb), cb.boleto_pdf)) throw new C.ErroUsuario(`O PDF do boleto (${cb.boleto_pdf}) sumiu da pasta: anexe de novo antes de enviar.`);
    const mudou = avisoBoletoPdfDesatualizado(cb);
    if (mudou && !(await confirmar(`${mudou}

Emita de novo no banco e troque o PDF, ou abra o e-mail mesmo assim.`, { titulo: 'PDF do boleto desatualizado', sim: 'Abrir o e-mail mesmo assim', forte: true }))) return;
    await janelaEmail('boleto_envio', { contrato: cb.contrato_id, cobranca: cb.id });
  },
  async restaurarModeloEmail({ chave }) {
    const m = (d().modelos_email || []).find((x) => x.chave === chave);
    if (m) await alterar((db) => R.excluir(db, 'modelos_email', m.id, login(), `Modelo de e-mail "${modeloEmail(db, chave).nome}" voltou ao texto padrão`));
    aviso('Texto padrão restaurado.');
    await mostrar();
  },
  /** Baixa os modelos em uso (para conferir ou guardar) num arquivo de texto. */
  baixarModelosEmail() {
    const t = MODELOS_EMAIL.map((p) => { const m = modeloEmail(d(), p.chave); return `=== ${m.nome} (${m.etapa}) ===\nAssunto: ${m.assunto}\n\n${m.texto}\n`; }).join('\n');
    baixar(new Blob([t], { type: 'text/plain;charset=utf-8' }), 'Modelos de e-mail.txt');
  },
};

export const FORMULARIOS_EMAILS = {
  async modeloEmail(form) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário só consulta: não pode alterar os modelos de e-mail.');
    const f = new FormData(form);
    const chave = String(f.get('chave') || '');
    const padrao = MODELOS_EMAIL.find((m) => m.chave === chave);
    if (!padrao) throw new Error('Modelo não encontrado.');
    const assunto = String(f.get('assunto') || '').trim();
    const texto = String(f.get('texto') || '').trim();
    if (!assunto || !texto) throw new C.ErroUsuario('Preencha o assunto e o texto do e-mail antes de salvar.');
    await alterar((db) => {
      const m = (db.modelos_email || []).find((x) => x.chave === chave);
      if (m) R.atualizar(db, 'modelos_email', m.id, { assunto, texto }, login(), `Modelo de e-mail "${padrao.nome}"`);
      else R.inserir(db, 'modelos_email', { chave, assunto, texto }, login(), `Modelo de e-mail "${padrao.nome}"`);
    });
    aviso('Modelo de e-mail salvo.');
    ir('#/modelos-email');
  },
};

const AJUDA = `<div class="cartao"><h2>Como escrever</h2>
  <p><b>{campo}</b> entra com o dado do inquilino ou da ficha: {nome} (primeiro nome), {locatario}, {documento}, {imovel}, {endereco}, {aluguel}, {aluguel_bonificado}, {bonificacao},
  {vencimento}, {garantia}, {tipo_deposito}, {valor_deposito}, {prazo}, {inicio}, {fim}, {indice}, {reserva}, {reserva_data}, {contas_texto}, {contas_concessionarias}, {primeiro_boleto},
  {data_chaves}, {data_limite_vistoria}, {data_saida}, {ano_saida}, {acerto}, {saldo}, {data_devolucao}, {informe}, {ano}, {conta_deposito} (conta para depósito da caução, do cadastro da empresa) e as respostas da janela ({prazo_assinatura}, {opcoes_entrega}, {data_aviso}, {data_vistoria}, {pendencias}).
  Na ficha: {inclusos}, {iptu_valor}, {seguro_valor}, {devolucao}, {devolucao_data}, {documentos_ficha}, {link}, {link_validade}, {link_fiador} (o do 1º fiador) e {links_fiadores} (uma linha para cada fiador com link).
  No termo aditivo: {aditivo_data}, {aditivo_assunto}, {valor_anterior}, {valor_novo}, {novo_inicio}, {novo_bonificado}. Na notificação: {notificacao_data}, {notificacao_numero}, {notificacao_assunto}, {notificacao_assunto_minusculo}, {prazo_notificacao}, {data_limite}.
  Nos e-mails da régua de cobrança, também os do boleto: {boleto_referente}, {vencimento_boleto}, {limite_pagamento}, {valor_em_dia}, {valor_cheio}, {multa_pct}, {juros_pct}, {valor_hoje}, {multa_hoje}, {juros_hoje}, {dias_atraso}, {data_hoje}, {pix}, {linha_digitavel}, {competencia_boleto} (mês de competência) e {descricao_boleto} (o descritivo do boleto) (condições nao_util, bonificacao_boleto, pix, linha_digitavel, multa_juros).
  Com a 1ª letra maiúscula ({Nome}) sai com maiúscula; todo em maiúsculas ({NOME}), em maiúsculas.</p>
  <p><b>[se condição]</b> texto <b>[senão]</b> outro <b>[fim]</b>: pj, caucao, deposito, dinheiro (caução ou depósito), fiador, seguro_fianca, sem_garantia, tem_garantia, contas, iptu, seguro_incendio,
  bonificacao, reserva, saida_antecipada, devolver, cobrar, garantia_depositada (caução ou depósito já registrado), inclusos, iptu_valor, seguro_valor, link, link_fiador, varios_fiadores,
  novo_bonificacao (termo do novo valor), reiteracao e vence_hoje (notificação). Também "[se não pj]". Qualquer campo serve de condição: "[se valor_deposito]" sai só quando o campo tem valor.</p>
  <p class="suave">O fecho ("Agradecemos e ficamos à disposição em caso de dúvidas." e a assinatura) entra sozinho no fim de todo e-mail.</p></div>`;

export function telaModelosEmail() {
  const etapas = [...new Set(MODELOS_EMAIL.map((m) => m.etapa))];
  const linha = (p) => { const m = modeloEmail(d(), p.chave); return `<tr><td><b>${esc(m.nome)}</b>${m.editado ? ' <span class="suave">(editado)</span>' : ''}<br><span class="suave">${esc(m.assunto)}</span></td><td class="nw">${esc(m.etapa)}</td>
    <td class="n nw">${opera() ? link(`#/modelo-email/${m.chave}`, 'Editar') : ''} ${opera() && m.editado ? botao('restaurarModeloEmail', 'Voltar ao texto padrão', { chave: m.chave }, 'secundario pequeno', `Trocar o texto de "${m.nome}" pelo padrão? As alterações se perdem.`) : ''}</td></tr>`; };
  return `<p class="suave"><a href="#/sistema-email">← Comunicação E-mail</a></p>
    <div class="cabecalho"><h1>Modelos de e-mail</h1>${botao('baixarModelosEmail', 'Baixar todos (TXT)', {}, 'secundario pequeno')}</div>
    <p class="suave">Um e-mail para cada etapa da ficha, da entrada e da saída do inquilino, a régua de cobrança (lembretes antes e no dia do vencimento, boleto em atraso), as notificações ao inquilino, o novo valor do aluguel, os termos aditivos e o informe anual do Imposto de Renda. O botão <b>✉ E-mail</b> de cada etapa abre o texto já preenchido para copiar, abrir no Gmail ou enviar.</p>
    <div class="cartao"><table><tr><th>E-mail</th><th>Etapa</th><th></th></tr>${etapas.map((e) => MODELOS_EMAIL.filter((m) => m.etapa === e).map(linha).join('')).join('')}</table></div>${AJUDA}`;
}

export function telaModeloEmail(chave) {
  const m = modeloEmail(d(), chave);
  if (!m) return naoEncontrado('Modelo não encontrado', '#/modelos-email', 'Ver os modelos de e-mail');
  return `<p class="suave"><a href="#/modelos-email">← Modelos de e-mail</a></p><h1>Modelo de e-mail: ${esc(m.nome)}</h1>
    <form class="cartao" data-form="modeloEmail"><input type="hidden" name="chave" value="${esc(m.chave)}">
      <p class="suave">Botão na etapa: <b>${esc(m.etapa)}</b>${m.anexos ? ` · lembrete de anexo: ${esc(m.anexos)}` : ''}</p>
      <p><label>Assunto</label><input name="assunto" value="${esc(m.assunto)}" required></p>
      <p><label>Texto (o fecho e a assinatura entram sozinhos no fim)</label><textarea name="texto" class="texto-modelo" spellcheck="true">${esc(m.texto)}</textarea></p>
      <div class="acoes"><button>Salvar</button><a class="botao secundario" href="#/modelos-email">Cancelar</a></div></form>${AJUDA}`;
}

/** Painel, em fevereiro e março: inquilinos que ainda não receberam o informe dos aluguéis do ano anterior. */
export function alertaInformeIr() {
  const { ano, contratos } = informesPendentes(d());
  if (!contratos.length) return '';
  return `<div class="alerta info"><b>Informe do Imposto de Renda de ${ano}:</b> enviar a ${contratos.length} inquilino(s) (de preferência até o fim de fevereiro):
    ${contratos.map((c) => `<a href="#/imprimir/declaracao?contrato=${c.id}&ano=${ano}">${esc(c.inquilino_nome)}</a>`).join(', ')}. Na declaração, use o botão ✉ E-mail.</div>`;
}
