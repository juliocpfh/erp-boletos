// E-mails por etapa: botão "E-mail" nas etapas da ficha, da entrada e da saída (e no informe anual do IR), a janela com o
// texto preenchido (Copiar texto · Abrir no Gmail · Enviar agora) e a tela de edição dos modelos (Dados e backup).
// Modelos e preenchimento: modelos-email.js e email-dados.js. Envio direto: gmail.js (Worker, só na nuvem com o Gmail ligado).
import { alterar, aviso, baixar, ir, login, mostrar } from '../app.js';
import * as S from '../armazenamento.js';
import * as C from '../calculos.js';
import { dataBr } from '../calculos.js';
import { anexosProntos, dadosDoEmail, informesPendentes } from '../email-dados.js';
import { esc } from '../formularios.js';
import { emailLigado, enviarEmail } from '../gmail.js';
import { MODELOS_EMAIL, modeloEmail, montarEmail } from '../modelos-email.js';
import * as R from '../regras.js';
import { ACEITA_DOCUMENTOS, botao, buscar, d, link, naoEncontrado, opera, pastaDoEscopo } from './comum.js';
import { pdfDoRecibo } from './documentos.js';

/** Endereço do Gmail para escrever: com o texto, enquanto couber no endereço (o navegador corta endereços muito longos). */
const LIMITE_ENDERECO = 7000;

/** Último envio registrado deste e-mail para o contrato ou a ficha (ou null). */
export function ultimoEnvio(chave, alvo) {
  return (d().envios_email || []).filter((x) => x.chave === chave && ((alvo.contrato && x.contrato_id === Number(alvo.contrato)) || (alvo.ficha && x.ficha_id === Number(alvo.ficha))))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0] || null;
}

/** Botão "E-mail" de uma etapa, com a data do último envio. ``alvo``: { contrato: id } ou { ficha: id }. */
export function botaoEmail(chave, alvo, texto = '✉ E-mail') {
  if (!opera() || !MODELOS_EMAIL.some((m) => m.chave === chave)) return '';
  const u = ultimoEnvio(chave, alvo);
  return `${botao('abrirEmail', texto, { chave, ...alvo }, 'secundario mini')}${u ? ` <span class="suave" title="${esc(u.como)}">${u.como === 'enviado' ? 'enviado' : 'aberto'} em ${dataBr(u.data)}</span>` : ''}`;
}

const registrar = (chave, alvo, para, assunto, como, id = '') => alterar((db) => R.inserir(db, 'envios_email', {
  data: C.hojeIso(), chave, contrato_id: alvo.contrato ? Number(alvo.contrato) : null, ficha_id: alvo.ficha ? Number(alvo.ficha) : null, para, assunto, como, gmail_id: id || null,
}, login(), `E-mail "${assunto}" ${como === 'enviado' ? 'enviado' : 'aberto no Gmail'} para ${para || '(sem destinatário)'}`));

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

/** Lista dos anexos do sistema na janela: recibo (PDF) e comprovantes, marcados; recibo que ainda não pode sair diz o motivo. */
function listaProntos(prontos, ligado) {
  if (!prontos.length) return '';
  const linha = (a, k) => (a.tipo === 'recibo' && !a.ok ? `<p class="suave">🧾 ${esc(a.rotulo)}: ${esc(a.motivo)}</p>`
    : `<p><label class="check"><input type="checkbox" name="pronto" value="${k}" checked> ${a.tipo === 'recibo' ? `🧾 ${esc(a.rotulo)} (PDF)` : `📎 ${esc(a.rotulo)}`}</label></p>`);
  const algum = prontos.some((a) => a.tipo !== 'recibo' || a.ok);
  return `<div class="cartao" style="margin:0 0 8px"><p><b>Anexos do sistema</b></p>${prontos.map(linha).join('')}
    ${algum ? `<p><button type="button" class="secundario mini" data-baixar-prontos>Baixar os marcados</button> <span class="suave">${ligado ? 'Vão juntos no "Enviar agora".' : 'Para o Gmail: baixe e anexe por lá.'}</span></p>` : ''}</div>`;
}

/** Arquivos dos anexos marcados: o recibo vira PDF na hora; o comprovante é lido da pasta. [{ nome, blob }] */
async function arquivosProntos(dlg, prontos, objeto) {
  const out = [];
  for (const el of dlg.querySelectorAll('[name=pronto]:checked')) {
    const a = prontos[Number(el.value)];
    if (a.tipo === 'recibo') { const r = await pdfDoRecibo(a.recibo, objeto); out.push({ nome: r.nome, blob: r.blob }); }
    else out.push({ nome: a.nome, blob: await S.abrirArquivo(await pastaDoEscopo(a.escopo, Number(a.id)), a.nome) });
  }
  return out;
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
  if (!modelo || !reg) throw new Error('Inquilino ou ficha não encontrado.');
  const objeto = alvo.contrato ? { contrato: reg } : { ficha: reg };
  const inicio = dadosDoEmail(d(), objeto);
  const ligado = await emailLigado();
  const perguntas = (modelo.perguntas || []).map((p) => campoPergunta(p, inicio.perguntas[p[0]] ?? '')).join('');
  const prontos = anexosProntos(d(), modelo, objeto);
  const dlg = document.createElement('dialog');
  dlg.className = 'janela-erro janela-pergunta janela-email';
  dlg.innerHTML = `<form method="dialog"><h3>${esc(modelo.nome)} · ${esc(reg.inquilino_nome || '')}</h3><div class="corpo">
    ${perguntas ? `<div class="cartao" style="margin:0 0 8px">${perguntas}</div>` : ''}
    <p class="suave">De: Administradora &lt;administracao@ankjck.com.br&gt;${modelo.anexos ? ` · Anexar: <b>${esc(modelo.anexos)}</b>` : ''}</p>
    ${listaProntos(prontos, ligado)}
    <p><label>Para</label><input type="email" name="para" value="${esc(inicio.para)}" multiple></p>
    ${inicio.para ? '' : '<p class="alerta aviso">Sem e-mail no cadastro: digite o destinatário.</p>'}
    <p><label>Assunto</label><input name="assunto"></p>
    <p><label>Texto <span class="suave">(pode alterar antes de enviar)</span></label><textarea name="texto" rows="16" spellcheck="true"></textarea></p>
    <p class="suave" data-editado hidden>Texto alterado à mão: as respostas acima não mudam mais o texto.</p>
    ${ligado ? `<p><label>${prontos.length ? 'Outros anexos' : 'Anexos'} para o "Enviar agora" <span class="suave">(PDF ou foto)</span></label><input type="file" name="anexos" multiple accept="${ACEITA_DOCUMENTOS}"></p>` : ''}
    <p class="suave">${alvo.contrato && /saida_aviso/.test(chave) ? 'Confira no contrato do inquilino a multa da saída antecipada antes de enviar. ' : ''}${ligado ? '' : 'Envio direto ainda não ligado: use "Copiar texto" ou "Abrir no Gmail".'}</p>
  </div><div class="acoes" style="justify-content:flex-end;flex-wrap:wrap">
    <button type="button" class="secundario" data-fechar>Fechar</button>
    <button type="button" class="secundario" data-copiar>Copiar texto</button>
    <button type="button" class="secundario" data-gmail>Abrir no Gmail</button>
    ${ligado ? '<button type="button" data-enviar>Enviar agora</button>' : ''}</div></form>`;
  document.body.appendChild(dlg);
  const q = (s) => dlg.querySelector(s);
  let editado = false;
  let registrou = false;
  const respostas = () => Object.fromEntries((modelo.perguntas || []).map(([n]) => [n, q(`[name=p_${n}]`).value]));
  const desenhar = () => {
    const e = montarEmail(modelo, dadosDoEmail(d(), objeto, respostas()));
    q('[name=assunto]').value = e.assunto;
    if (!editado) q('[name=texto]').value = e.texto;
  };
  desenhar();
  q('[name=texto]').addEventListener('input', () => { editado = true; q('[data-editado]').hidden = false; });
  dlg.querySelectorAll('[name^=p_]').forEach((el) => el.addEventListener('input', desenhar));
  const atual = () => ({ para: q('[name=para]').value.trim(), assunto: q('[name=assunto]').value.trim(), texto: q('[name=texto]').value });
  const pendente = () => (/\[preencher: /.test(atual().texto + atual().assunto) ? 'Ainda há "[preencher: ...]" no texto: complete antes de mandar.' : '');
  q('[data-fechar]').addEventListener('click', () => dlg.close());
  const baixarProntos = q('[data-baixar-prontos]');
  if (baixarProntos) baixarProntos.addEventListener('click', async () => {
    baixarProntos.disabled = true;
    try {
      const lista = await arquivosProntos(dlg, prontos, objeto);
      if (!lista.length) { aviso('Marque pelo menos um anexo.', 'aviso'); return; }
      for (const a of lista) baixar(a.blob, a.nome);
    } catch (erro) {
      aviso(erro.message || 'Não consegui preparar os anexos.', 'erro');
    } finally { baixarProntos.disabled = false; }
  });
  q('[data-copiar]').addEventListener('click', async () => {
    const e = atual();
    aviso(await copiar(`${e.assunto}\n\n${e.texto}`) ? `Assunto e texto copiados: cole no e-mail.${pendente() ? ` ${pendente()}` : ''}` : 'O navegador não deixou copiar: selecione o texto e use Ctrl+C.', pendente() ? 'aviso' : 'ok');
  });
  q('[data-gmail]').addEventListener('click', async () => {
    const e = atual();
    const comCorpo = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(e.para)}&su=${encodeURIComponent(e.assunto)}&body=${encodeURIComponent(e.texto)}`;
    const cabe = comCorpo.length <= LIMITE_ENDERECO;
    const copiado = await copiar(e.texto);
    window.open(cabe ? comCorpo : `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(e.para)}&su=${encodeURIComponent(e.assunto)}`, '_blank', 'noopener');
    await registrar(chave, alvo, e.para, e.assunto, 'aberto no Gmail');
    registrou = true;
    aviso(cabe ? 'Gmail aberto com o texto. Anexe os arquivos e envie por lá.' : copiado ? 'Gmail aberto. O texto é comprido para ir pelo endereço: ele foi copiado, cole no corpo do e-mail.' : 'Gmail aberto. Copie o texto da janela e cole no corpo do e-mail.', cabe ? 'ok' : 'aviso');
  });
  const enviar = q('[data-enviar]');
  if (enviar) enviar.addEventListener('click', async () => {
    const e = atual();
    if (!e.para) { aviso('Digite o e-mail do destinatário.', 'aviso'); return; }
    if (pendente()) { aviso(pendente(), 'aviso'); return; }
    let arquivos;
    try {
      arquivos = [...await arquivosProntos(dlg, prontos, objeto), ...[...(q('[name=anexos]').files || [])].map((f) => ({ nome: f.name, blob: f }))];
    } catch (erro) { aviso(`Não consegui preparar os anexos: ${erro.message}`, 'erro'); return; }
    if (!confirm(`Enviar agora para ${e.para}${arquivos.length ? `, com ${arquivos.length} anexo(s)` : ', sem anexo'}?`)) return;
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
  dlg.showModal();
}

export const ACOES_EMAILS = {
  async abrirEmail({ chave, contrato, ficha }) {
    if (!opera()) throw new Error('Seu usuário não pode enviar e-mails.');
    await janelaEmail(chave, contrato ? { contrato: Number(contrato) } : { ficha: Number(ficha) });
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
    if (!opera()) throw new Error('Seu usuário não pode alterar os modelos.');
    const f = new FormData(form);
    const chave = String(f.get('chave') || '');
    const padrao = MODELOS_EMAIL.find((m) => m.chave === chave);
    if (!padrao) throw new Error('Modelo não encontrado.');
    const assunto = String(f.get('assunto') || '').trim();
    const texto = String(f.get('texto') || '').trim();
    if (!assunto || !texto) throw new Error('Preencha o assunto e o texto.');
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
  {data_chaves}, {data_limite_vistoria}, {data_saida}, {acerto}, {saldo}, {data_devolucao}, {informe}, {ano} e as respostas da janela ({prazo_assinatura}, {opcoes_entrega}, {data_aviso}, {data_vistoria}, {pendencias}).
  Com a 1ª letra maiúscula ({Nome}) sai com maiúscula; todo em maiúsculas ({NOME}), em maiúsculas.</p>
  <p><b>[se condição]</b> texto <b>[senão]</b> outro <b>[fim]</b>: pj, caucao, deposito, dinheiro (caução ou depósito), fiador, seguro_fianca, sem_garantia, tem_garantia, contas, iptu, seguro_incendio,
  bonificacao, reserva, saida_antecipada, devolver, cobrar. Também "[se não pj]".</p>
  <p class="suave">O fecho ("Agradecemos e ficamos à disposição em caso de dúvidas." e a assinatura) entra sozinho no fim de todo e-mail.</p></div>`;

export function telaModelosEmail() {
  const etapas = [...new Set(MODELOS_EMAIL.map((m) => m.etapa))];
  const linha = (p) => { const m = modeloEmail(d(), p.chave); return `<tr><td><b>${esc(m.nome)}</b>${m.editado ? ' <span class="suave">(editado)</span>' : ''}<br><span class="suave">${esc(m.assunto)}</span></td><td class="nw">${esc(m.etapa)}</td>
    <td class="n nw">${opera() ? link(`#/modelo-email/${m.chave}`, 'Editar') : ''} ${opera() && m.editado ? botao('restaurarModeloEmail', 'Voltar ao texto padrão', { chave: m.chave }, 'secundario pequeno', `Trocar o texto de "${m.nome}" pelo padrão? As alterações se perdem.`) : ''}</td></tr>`; };
  return `<p class="suave"><a href="#/dados">← Dados e backup</a></p>
    <div class="cabecalho"><h1>Modelos de e-mail</h1>${botao('baixarModelosEmail', 'Baixar todos (TXT)', {}, 'secundario pequeno')}</div>
    <p class="suave">Um e-mail para cada etapa da ficha, da entrada e da saída do inquilino, e o informe anual do Imposto de Renda. O botão <b>✉ E-mail</b> de cada etapa abre o texto já preenchido para copiar, abrir no Gmail ou enviar.</p>
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
