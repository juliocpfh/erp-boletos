// Tela "E-mails da régua" (#/regua, pelo botão no alto de Boletos; até 17/11/2026 ficava em Financeiro) (o alerta do Painel e o contador do botão ficam em telas.js: esta parte só carrega quando a tela abre): os e-mails de cobrança preparados pela régua
// (regua-email.js) esperando a autorização do administrador. Decisão do dono (16/11/2026): nada é enviado sozinho; cada e-mail
// tem a sua caixa, todas desmarcadas; "Enviar os selecionados (N)" mostra a lista final e pede confirmação. Sem a regra
// `regua_envio` ligada, só "Abrir no Gmail", "Copiar texto" e "Não enviar". Envio pelo Gmail da nuvem (gmail.js), como telas/emails.js.
import { alterar, aviso, confirmar, login, mostrar, podeUsuario } from '../app.js';
import * as BANCO from '../banco.js';
import * as C from '../calculos.js';
import { dataBr, reais } from '../calculos.js';
import { anexosProntos, dadosDoEmail } from '../email-dados.js';
import { esc } from '../formularios.js';
import { emailLigado, enviarEmail } from '../gmail.js';
import { modeloEmail, montarEmail } from '../modelos-email.js';
import * as G from '../regua-email.js';
import * as R from '../regras.js';
import { botao, buscar, d, link } from './comum.js';

const admin = () => podeUsuario('admin');
const SO_ADMIN = 'Só o administrador autoriza os e-mails da régua de cobrança.';
const LIMITE_ENDERECO = 7000; // igual ao de telas/emails.js: o navegador corta endereços muito longos

/** E-mail montado de um item da fila (texto do dia de hoje: valor com multa e juros de hoje). */
function emailDoItem(db, item) {
  const modelo = modeloEmail(db, item.modelo);
  const alvo = { contrato: item.contrato, cobranca: item.cobranca };
  return { modelo, alvo, ...montarEmail(modelo, dadosDoEmail(db, alvo)), prontos: anexosProntos(db, modelo, alvo) };
}

const nomeDo = (item) => `${item.imovel ? `${item.imovel.nome} · ` : ''}${item.contrato.inquilino_nome}`;
const referente = (cb) => (R.ehParcelaAcordo(cb) ? `acordo ${cb.acordo_parcela || ''}`.trim() : C.compBr(cb.competencia));

/** Linha de um e-mail da fila: caixa (desmarcada), inquilino, boleto, etapa, valor, para quem e a prévia do texto. */
function linhaDaFila(db, item, envio) {
  const e = emailDoItem(db, item);
  const pode = admin() && !!item.para;
  const anexos = e.prontos.map((a) => a.rotulo).join(', ');
  return `<tr>
    <td>${pode && envio ? `<input type="checkbox" data-regua="${esc(item.chave)}" title="Marcar para enviar">` : ''}</td>
    <td><a href="#/contrato/${item.contrato.id}"><b>${esc(nomeDo(item))}</b></a></td>
    <td><a href="#/cobranca/${item.cobranca.id}">${esc(referente(item.cobranca))}</a><br><span class="suave nw">vence ${dataBr(item.cobranca.vencimento)}</span></td>
    <td>${esc(item.etapa)}<br><span class="suave nw">desde ${dataBr(item.desde)}</span></td>
    <td class="n nw">${reais(item.valor)}</td>
    <td>${item.para ? esc(item.para) : '<span class="suave">sem e-mail</span>'}</td>
    <td><details><summary>${esc(e.assunto)}</summary><pre class="previa-email" style="white-space:pre-wrap;font:inherit;margin:6px 0">${esc(e.texto)}</pre>
      ${anexos ? `<p class="suave">Anexos: ${esc(anexos)}</p>` : '<p class="suave">Sem anexo (boleto não emitido no banco).</p>'}</details>
      ${item.avisos.map((a) => `<div class="alerta aviso" style="margin:4px 0">${esc(a)}</div>`).join('')}</td>
    <td class="nw">${admin() ? `${item.para ? `${botao('abrirReguaGmail', 'Abrir no Gmail', { chave: item.chave }, 'secundario mini')} ` : ''}${botao('copiarRegua', 'Copiar texto', { chave: item.chave }, 'secundario mini')}
      ${botao('recusarRegua', 'Não enviar', { chave: item.chave }, 'secundario mini', `Não enviar este e-mail para ${item.contrato.inquilino_nome} (${item.etapa})? Ele sai da lista e não volta.`)}` : ''}</td></tr>`;
}

/** Tela #/regua: a fila "Aguardando sua autorização" e o que foi decidido nos últimos 30 dias. */
export async function telaRegua() {
  const db = d();
  const hoje = C.hojeIso();
  const fila = G.filaRegua(db, hoje);
  const ligada = R.regra('regua_envio') === true;
  const gmail = ligada && admin() ? await emailLigado() : false;
  const envio = ligada && gmail;
  const dias = R.regra('regua_email_dias') || [];
  const tolerancia = R.regra('tolerancia_boleto_dias'); // o mesmo número do início da cobrança (G.inicioDaCobranca)
  // contratos numa regra especial com outro prazo do banco (G.inicioDaCobranca usa o de cada contrato): o texto diz quais
  const tolEspeciais = R.especiaisDiferentes(db, 'tolerancia_boleto_dias').map((x) => ` (na regra especial "${esc(x.nome)}": ${x.valor})`).join('');
  // contratos numa regra especial com outros dias (a fila já os usa, filaRegua): o texto diz quais
  const especiais = R.especiaisDiferentes(db, 'regua_email_dias').map((x) => `${esc(x.nome)}: ${(x.valor || []).length ? esc(x.valor.map(G.nomeDaEtapa).join('; ')) : 'nenhum dia'}`);
  const estado = !ligada ? 'O envio direto está <b>desligado</b> (Regras do sistema → "Régua de cobrança: botão Autorizar e enviar"): abra cada e-mail no Gmail ou copie o texto.'
    : !gmail ? 'O envio direto está ligado, mas o Gmail da empresa não está ligado nesta nuvem (ou você está sem internet): por enquanto, abra no Gmail ou copie o texto.'
      : 'Marque os e-mails que quer mandar e clique em "Enviar os selecionados": o sistema mostra a lista final e pede a sua confirmação.';
  const recentes = G.decididosRecentes(db, hoje);
  return `<h1>E-mails da régua</h1><div class="abas"><a href="#/cobrancas">← Boletos</a></div>
    <div class="cabecalho"><h2>E-mails da régua de cobrança: aguardando sua autorização</h2>${link('#/modelos-email', 'Textos dos e-mails')}</div>
    <p class="suave">O sistema prepara os e-mails ${dias.length ? `de cada boleto em aberto: ${esc(dias.map(G.nomeDaEtapa).join('; '))}` : `(nenhum dia escolhido nas Regras do sistema: nada é preparado${especiais.length ? ' para os contratos que as seguem' : ''})`}.${especiais.length ? ` Contratos com regra especial: ${especiais.join(' · ')}.` : ''} <b>Nada é enviado sozinho.</b>
      Boleto pago, em acordo ou de contrato encerrado sai da lista. A cobrança de atraso só aparece passados ${tolerancia} dia(s) úteis${tolEspeciais} do último dia para pagar (o prazo que o banco leva para creditar o boleto: regra "Extrato: entrada casa com o boleto até quantos dias úteis depois do último dia para pagar"). E-mail enviado ou marcado "Não enviar" não volta.${admin() ? '' : ' Só o administrador autoriza.'}</p>
    <div class="alerta ${envio ? 'info' : 'aviso'}">${estado}</div>
    <div class="cartao rolagem regua"><table>
      <tr><th>${admin() && envio && fila.some((x) => x.para) ? '<input type="checkbox" data-marcar-todas="regua" title="Marcar todos">' : ''}</th><th>Imóvel / inquilino</th><th>Boleto</th><th>Etapa</th><th class="n">Valor hoje</th><th>Para</th><th>Prévia do e-mail</th><th></th></tr>
      ${fila.map((x) => linhaDaFila(db, x, envio)).join('') || '<tr><td colspan="8" class="suave">Nenhum e-mail aguardando.</td></tr>'}</table>
      ${admin() && envio && fila.some((x) => x.para) ? `<div class="acoes" style="margin-top:10px">${botao('enviarReguaSelecionados', 'Enviar os selecionados (0)', {}, 'botao')}</div>` : ''}</div>
    <div class="cartao rolagem"><h2>Decididos nos últimos 30 dias</h2><table><tr><th>Data</th><th>Inquilino</th><th>Boleto</th><th>Etapa</th><th>O que foi feito</th></tr>
      ${recentes.map((x) => { const c = buscar('contratos', x.contrato_id); const cb = buscar('cobrancas', x.cobranca_id); return `<tr><td class="nw">${dataBr(x.data)}</td><td>${c ? esc(c.inquilino_nome) : '-'}</td>
        <td>${cb ? `<a href="#/cobranca/${cb.id}">${esc(referente(cb))}</a>` : '-'}</td><td>${esc(G.nomeDaEtapa(x.dias))}</td><td>${esc(G.SITUACOES_REGUA[x.situacao] || x.situacao)}${x.para ? ` <span class="suave">(${esc(x.para)})</span>` : ''}</td></tr>`; }).join('')
      || '<tr><td colspan="5" class="suave">Nada decidido nos últimos 30 dias.</td></tr>'}</table></div>`;
}

/** Item da fila ainda válido agora (com os dados de agora): boleto pago, em acordo ou já decidido em outra aba dá erro. */
function itemAtual(chave) {
  if (!admin()) throw new C.ErroUsuario(SO_ADMIN);
  const item = G.itemDaFila(d(), String(chave));
  if (!item) throw new C.ErroUsuario('Este e-mail saiu da lista (boleto pago, em acordo, já decidido ou a etapa passou). Atualize a tela.');
  return item;
}

/** PDF do boleto no C6, pela ponte deste computador (ou null, se a ponte não estiver ligada aqui). */
async function pdfDoBoletoC6(cb) {
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

/** Arquivos dos anexos do e-mail: o PDF do boleto (ponte) e o QR Code do Pix (guardado no boleto). Devolve { arquivos, faltou }. */
async function anexosDoItem(item, prontos) {
  const arquivos = [];
  const faltou = [];
  for (const a of prontos) {
    if (a.tipo !== 'boleto') continue;
    if (a.qual === 'pdf') {
      const blob = await pdfDoBoletoC6(item.cobranca);
      if (blob) arquivos.push({ nome: a.nome, blob }); else faltou.push(a.rotulo);
    } else if (a.qual === 'pix') {
      const b = item.cobranca.banco;
      const bin = atob(b.pix_qr_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      arquivos.push({ nome: a.nome, blob: new Blob([bytes], { type: b.pix_qr_mime || 'image/png' }) });
    }
  }
  return { arquivos, faltou };
}

/** Grava a decisão (e, quando o e-mail saiu ou foi aberto no Gmail, o registro em envios_email, como os e-mails das etapas). */
const decidir = (item, situacao, { para = '', assunto = '', gmailId = '' } = {}) => alterar((db) => {
  let envio = null;
  if (situacao !== 'recusado') {
    const como = situacao === 'enviado' ? 'enviado' : 'aberto no Gmail';
    envio = R.inserir(db, 'envios_email', { data: C.hojeIso(), chave: item.modelo, contrato_id: item.contrato.id, ficha_id: null, aditivo_id: null, cobranca_id: item.cobranca.id,
      para, assunto, como, gmail_id: gmailId || null }, login(), null, { historico: false });
  }
  return G.registrarDecisao(db, { cobranca_id: item.cobranca.id, contrato_id: item.contrato.id, dias: item.dias, situacao, para, assunto, envio_id: envio ? envio.id : null }, login());
});

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

export const ACOES_REGUA = {
  /** "Não enviar": sai da lista e não volta. */
  async recusarRegua({ chave }) {
    const item = itemAtual(chave);
    await decidir(item, 'recusado');
    aviso('Pronto: este e-mail não será enviado.');
    await mostrar();
  },
  async copiarRegua({ chave }) {
    const item = itemAtual(chave);
    const e = emailDoItem(d(), item);
    aviso(await copiar(`${e.assunto}\n\n${e.texto}`) ? 'Assunto e texto copiados: cole no e-mail. Depois de mandar, use "Abrir no Gmail" ou "Não enviar" para tirar da lista.' : 'O navegador não deixou copiar: abra a prévia e copie o texto.', 'info');
  },
  /** Abre o Gmail com o e-mail pronto (o administrador manda por lá) e tira da lista. */
  async abrirReguaGmail({ chave }) {
    const item = itemAtual(chave);
    const e = emailDoItem(d(), item);
    const comCorpo = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(item.para)}&su=${encodeURIComponent(e.assunto)}&body=${encodeURIComponent(e.texto)}`;
    const cabe = comCorpo.length <= LIMITE_ENDERECO;
    // sem 'noopener' no open (com ele o navegador devolve null sempre e não se sabe se a aba abriu); o opener sai à mão.
    // Aba bloqueada: o e-mail fica na lista (antes saía como "Aberto no Gmail" sem ter aberto; busca de 24/11, DOC-06)
    const aba = window.open(cabe ? comCorpo : `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(item.para)}&su=${encodeURIComponent(e.assunto)}`, '_blank');
    if (!aba) { aviso('O navegador bloqueou a aba do Gmail (bloqueador de janelas): permita janelas deste site e clique de novo, ou use "Copiar texto". O e-mail continua na lista.', 'aviso'); return; }
    try { aba.opener = null; } catch { /* outra origem */ }
    const copiado = cabe || await copiar(e.texto);
    await decidir(item, 'gmail', { para: item.para, assunto: e.assunto });
    aviso(`${cabe ? 'Gmail aberto com o texto.' : copiado ? 'Gmail aberto; o texto é comprido e foi copiado: cole no corpo do e-mail.' : 'Gmail aberto: copie o texto da prévia e cole no corpo do e-mail.'}${e.prontos.length ? ' Anexe o boleto e o QR Code (página do boleto) antes de mandar.' : ''}`, cabe ? 'ok' : 'aviso');
    await mostrar();
  },
  /**
   * "Enviar os selecionados (N)": só os marcados; mostra a lista final e pede a confirmação; manda um a um pelo Gmail da nuvem.
   * Cada um é conferido de novo na hora (boleto pago ou decidido em outra aba não sai).
   */
  async enviarReguaSelecionados() {
    if (!admin()) throw new C.ErroUsuario(SO_ADMIN);
    if (R.regra('regua_envio') !== true) throw new C.ErroUsuario('O envio direto da régua está desligado nas Regras do sistema: use "Abrir no Gmail".');
    if (!(await emailLigado())) throw new C.ErroUsuario('O Gmail da empresa não está ligado nesta nuvem (ou você está sem internet): use "Abrir no Gmail".');
    const chaves = [...document.querySelectorAll('input[data-regua]:checked')].map((x) => x.dataset.regua);
    if (!chaves.length) throw new C.ErroUsuario('Marque pelo menos um e-mail na lista.');
    const itens = chaves.map((k) => G.itemDaFila(d(), k)).filter((x) => x && x.para);
    if (!itens.length) throw new C.ErroUsuario('Os e-mails marcados saíram da lista (pago, em acordo ou já decidido). Atualize a tela.');
    const lista = itens.map((x) => `• ${nomeDo(x)}: boleto ${referente(x.cobranca)}, ${x.etapa}, ${reais(x.valor)} → ${x.para}`).join('\n');
    const fora = chaves.length - itens.length;
    if (!(await confirmar(`Vou enviar agora ${itens.length} e-mail(s) pelo Gmail da empresa:\n\n${lista}${fora ? `\n\n${fora} marcado(s) saíram da lista e não vão.` : ''}\n\nConfirma o envio?`, { titulo: 'Enviar os e-mails da régua', sim: `Enviar ${itens.length} e-mail(s)`, nao: 'Cancelar' }))) return;
    const enviados = [];
    const erros = [];
    const semAnexo = [];
    for (const k of itens.map((x) => x.chave)) {
      const item = G.itemDaFila(d(), k); // de novo: outra aba pode ter decidido enquanto a janela estava aberta
      if (!item) continue;
      try {
        const e = emailDoItem(d(), item);
        if (/\[preencher: /.test(e.texto + e.assunto)) throw new C.ErroUsuario('o texto tem "[preencher: ...]": confira o modelo em Modelos de e-mail');
        const { arquivos, faltou } = await anexosDoItem(item, e.prontos);
        const r = await enviarEmail({ para: item.para, assunto: e.assunto, texto: e.texto, anexos: arquivos });
        await decidir(item, 'enviado', { para: item.para, assunto: e.assunto, gmailId: r.id });
        enviados.push(item);
        if (faltou.length) semAnexo.push(`${item.contrato.inquilino_nome} (sem ${faltou.join(', ')})`);
      } catch (erro) {
        erros.push(`${item.contrato.inquilino_nome}: ${erro.message || erro}`);
      }
    }
    aviso([`${enviados.length} e-mail(s) enviado(s); ficam em "Enviados" no Gmail.`,
      semAnexo.length ? `Sem o PDF do boleto (a ponte do banco não respondeu neste computador; a linha digitável e o Pix foram no texto): ${semAnexo.join('; ')}.` : '',
      erros.length ? `Não enviados: ${erros.join('; ')}.` : ''].filter(Boolean).join(' '), erros.length ? 'erro' : semAnexo.length ? 'aviso' : 'ok');
    await mostrar();
  },
};
