// Mensagens aos inquilinos (pedido do dono de 26/11/2026), em Inquilinos → Comunicações: escrever um e-mail e/ou uma mensagem
// de WhatsApp com os campos que o sistema preenche ({nome}, {imovel}, {aluguel}…), escolher para quem vai (um, alguns ou todos;
// inquilinos, solidários, representantes e fiadores dos contratos ativos) e enviar: o e-mail pelo Gmail da empresa (na nuvem;
// fora do horário comercial, agendado), o WhatsApp um por um, com o texto copiado. Regras e campos: mensagens.js.
// Telas: #/comunicacoes?ver=escrever (&tema=<pronto> | &modelo=<salvo> | &id=<mensagem a copiar> | &contrato=<já marcado>),
// #/comunicacoes?ver=mensagem&id=<id> (o envio).
import { alterar, aviso, confirmar, E, ir, janela, login, mostrar } from '../app.js';
import * as C from '../calculos.js';
import * as CM from '../comunicados.js';
import * as K from '../contratos.js';
import { esc } from '../formularios.js';
import * as GM from '../gmail.js';
import * as MS from '../mensagens.js';
import * as R from '../regras.js';
import { botao, buscar, d, etiqueta, link, naoEncontrado, opera } from './comum.js';
import { logoReduzida } from './comunicacoes.js';
import { avisoForaDoHorario, perguntarQuando } from './horario.js';

const SO_CONSULTA = 'Seu usuário só consulta: não pode enviar mensagens.';
const SO_NUVEM_EMAIL = 'O e-mail direto só sai no sistema pela internet (nuvem), com o Gmail da empresa ligado. Aqui, use o WhatsApp.';
const voltar = '<p class="suave"><a href="#/comunicacoes">← Comunicações</a></p>';
const quadro = (rotulo, n, cor = '') => `<div class="numero-cartao"><div class="suave">${rotulo}</div><div class="numero${cor ? ` ${cor}` : ''}">${n}</div></div>`;
const papel = (tipo) => (CM.PAPEIS[tipo] ? ` <span class="suave">(${CM.PAPEIS[tipo]})</span>` : '');

/** Texto de partida: modelo pronto (`tema`), modelo salvo (`modelo`), mensagem antiga (`id`) ou o aviso geral. */
function textoDePartida(q) {
  if (q.modelo) { const m = buscar('modelos_mensagem', Number(q.modelo)); if (m) return { ...m, valor: `s:${m.id}`, origem: `modelo "${m.nome}"` }; }
  if (q.id) { const m = buscar('mensagens', Number(q.id)); if (m) return { nome: '', assunto: m.assunto, texto: m.texto, whatsapp: m.whatsapp, titulo: m.titulo, origem: `texto da mensagem "${m.titulo}"`, valor: '' }; }
  const chave = MS.MODELOS[q.tema] ? q.tema : 'aviso';
  return { ...MS.MODELOS[chave], valor: `p:${chave}`, origem: `modelo "${MS.MODELOS[chave].nome}"` };
}

/** Os modelos para o seletor: prontos e salvos (com os textos, para a tela trocar sem recarregar). */
function modelosDoSeletor() {
  return [...Object.entries(MS.MODELOS).map(([k, m]) => ({ valor: `p:${k}`, nome: m.nome, assunto: m.assunto, texto: m.texto, whatsapp: m.whatsapp })),
    ...(d().modelos_mensagem || []).map((m) => ({ valor: `s:${m.id}`, nome: `${m.nome} (salvo)`, assunto: m.assunto || '', texto: m.texto || '', whatsapp: m.whatsapp || '' }))];
}

/** Telefone da empresa para o campo {telefone_empresa}: o da última mensagem ou do último comunicado. */
function telefoneDaEmpresa() {
  const ultimo = [...(d().mensagens || []), ...(d().comunicados || [])].filter((x) => x.telefone_empresa).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))[0];
  return ultimo ? ultimo.telefone_empresa : K.dadoDaEmpresa(d(), {}, 'telefone') || '';
}

export function telaEscreverMensagem(q = {}) {
  if (!opera()) return `${voltar}<div class="alerta erro">${SO_CONSULTA}</div>`;
  const lista = MS.pessoas(d());
  if (!lista.length) return `${voltar}<h1>Nova mensagem</h1><div class="alerta aviso">Não há inquilino com contrato ativo hoje: a mensagem não teria para quem ir.</div>`;
  const m = textoDePartida(q);
  const marcadas = new Set(q.contrato ? [`c${Number(q.contrato)}`] : []);
  const email = K.dadoDaEmpresa(d(), {}, 'email_contato') || '';
  const campo = (c) => `<button type="button" class="secundario mini" data-inserir="{${c.campo}}" title="${esc(`${c.rotulo}. Ex.: ${c.exemplo}`)}">${esc(c.rotulo)}</button>`;
  const cond = (c) => `<button type="button" class="secundario mini" data-inserir="[se ${c.condicao}]…[fim]" title="${esc(`Trecho que só aparece quando quem recebe ${c.rotulo}`)}">só se ${esc(c.rotulo)}</button>`;
  const linha = (p) => `<tr data-pessoa data-tipo="${esc(p.tipo)}" data-busca="${esc(`${p.nome} ${p.imovel ? p.imovel.nome : ''}`.toLowerCase())}">
      <td><label><input type="checkbox" name="pessoa" value="${esc(p.chave)}"${marcadas.has(p.chave) ? ' checked' : ''}> <b>${esc(p.nome)}</b>${papel(p.tipo)}</label></td>
      <td>${esc(p.imovel ? p.imovel.nome : '-')}</td><td>${p.email ? esc(p.email) : etiqueta('sem e-mail', 'aviso')}</td><td>${CM.telefoneWhats(p.telefone) ? esc(CM.telefoneBr(p.telefone)) : etiqueta('sem celular', 'aviso')}</td></tr>`;
  const modelos = modelosDoSeletor();
  return `${voltar}<h1>Nova mensagem aos inquilinos</h1>
    <form data-form="criarMensagem" data-mensagem-form class="cartao">
      <p><label>Começar de um modelo</label><select data-modelo-mensagem data-modelos="${esc(JSON.stringify(modelos))}">${m.valor ? '' : `<option value="">${esc(m.origem)}</option>`}${modelos.map((x) => `<option value="${esc(x.valor)}"${x.valor === m.valor ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>
        <span class="suave">Trocar o modelo troca o assunto e os textos abaixo.</span></p>
      <p><label>Nome da mensagem (só para você achar depois)</label><input name="titulo" value="${esc(m.titulo || '')}" placeholder="Ex.: Manutenção do elevador 12/2026" style="width:100%"></p>
      <div class="cartao" style="margin:8px 0"><p><b>Campos que o sistema preenche para cada pessoa</b> <span class="suave">(clique para pôr onde está o cursor)</span></p>
        <p class="acoes" style="flex-wrap:wrap">${MS.CAMPOS.map(campo).join(' ')}</p>
        <p class="acoes" style="flex-wrap:wrap">${MS.CONDICOES.map(cond).join(' ')}</p>
        <p class="suave">Ex.: "Olá, {nome}." vira "Olá, Ana." para a Ana e "Olá, Bruno." para o Bruno. Texto entre colchetes, como [data], é para você completar: a mensagem não sai com ele.</p></div>
      <p><label>Assunto do e-mail</label><input name="assunto" value="${esc(m.assunto || '')}" style="width:100%"></p>
      <p><label>Texto do e-mail</label><textarea name="texto" rows="12" style="width:100%">${esc(m.texto || '')}</textarea><span class="suave">Deixe em branco para mandar só pelo WhatsApp. O parágrafo que começa com "Atenção" sai em destaque.</span></p>
      <p><label>Mensagem do WhatsApp</label><textarea name="whatsapp" rows="4" style="width:100%">${esc(m.whatsapp || '')}</textarea><span class="suave">Deixe em branco para mandar só por e-mail.</span></p>
      <div class="grade">
        <p><label>E-mail da empresa ({email_empresa})</label><input type="email" name="email_empresa" value="${esc(email)}"></p>
        <p><label>Telefone da empresa ({telefone_empresa})</label><input type="tel" name="telefone_empresa" value="${esc(telefoneDaEmpresa())}" placeholder="(41) 0000-0000"></p>
      </div>
      <h2>Para quem vai</h2>
      <p class="acoes" style="flex-wrap:wrap"><button type="button" class="secundario pequeno" data-marcar="inquilino">Todos os inquilinos</button>
        <button type="button" class="secundario pequeno" data-marcar="todos">Todos (com fiadores, solidários e representantes)</button>
        <button type="button" class="secundario pequeno" data-marcar="nenhum">Nenhum</button>
        <input type="search" data-filtro-pessoas placeholder="Procurar por nome ou imóvel" style="min-width:220px"></p>
      <p><b data-contagem-pessoas>${marcadas.size} pessoa(s) escolhida(s)</b> <span class="suave">de ${lista.length} com contrato ativo.</span></p>
      <div class="rolagem"><table><tr><th>Pessoa</th><th>Imóvel</th><th>E-mail</th><th>Celular</th></tr>${lista.map(linha).join('')}</table></div>
      <div class="acoes" style="margin-top:12px;flex-wrap:wrap"><button type="button" class="secundario" data-previa-mensagem>Ver como fica</button>
        <button type="button" class="secundario" data-salvar-modelo>Salvar como modelo</button>
        <button>Continuar para o envio</button> ${link('#/comunicacoes', 'Cancelar')}</div>
      <p class="suave">"Continuar" não envia nada: na próxima tela você vê cada pessoa e escolhe "Enviar e-mail a todos" e "WhatsApp a todos".${E.nuvem ? '' : ` ${SO_NUVEM_EMAIL}`}</p></form>`;
}

/** Lista das mensagens (na página Comunicações). */
export function cartoesMensagens() {
  const lista = [...(d().mensagens || [])].sort((a, b) => b.id - a.id);
  const nova = opera() ? link('#/comunicacoes?ver=escrever', 'Nova mensagem', 'botao pequeno') : '';
  if (!lista.length) {
    return `<div class="cartao"><div class="cabecalho"><h2>Mensagens aos inquilinos</h2>${nova}</div>
      <p class="suave">Escreva um e-mail ou WhatsApp para um, alguns ou todos os inquilinos, com campos que o sistema preenche para cada um. Ex.: "Olá, {nome}, no dia 05/12 haverá manutenção no {imovel_curto}."</p></div>`;
  }
  return `<div class="cartao"><div class="cabecalho"><h2>Mensagens aos inquilinos</h2>${nova}</div><div class="rolagem"><table><tr><th>Mensagem</th><th>Criada em</th><th class="n">Pessoas</th><th>Enviadas</th><th></th></tr>
    ${lista.slice(0, 30).map((m) => { const r = MS.resumo(m); return `<tr><td><b>${esc(m.titulo)}</b></td><td>${C.dataHoraBr(m.criado_em)}</td><td class="n">${r.total}</td>
      <td>${[r.email && `${r.email} por e-mail`, r.whats && `${r.whats} por WhatsApp`, r.agendados && `${r.agendados} agendado(s)`].filter(Boolean).join(' · ') || '<span class="suave">nenhuma</span>'}</td>
      <td>${link(`#/comunicacoes?ver=mensagem&id=${m.id}`, 'Abrir', 'botao pequeno')}</td></tr>`; }).join('')}</table></div></div>`;
}

/** Modelos de mensagem (na página Modelos de Comunicações). */
export function cartoesModelosMensagem() {
  const usar = (q) => (opera() ? link(`#/comunicacoes?ver=escrever&${q}`, 'Usar este modelo', 'botao pequeno') : '');
  const salvos = d().modelos_mensagem || [];
  return `<h2>Modelos de mensagem</h2>
    ${Object.entries(MS.MODELOS).map(([k, m]) => `<div class="cartao"><div class="cabecalho"><h2>${esc(m.nome)}</h2>${usar(`tema=${k}`)}</div>
      <p class="suave">Assunto: ${esc(m.assunto)}</p><pre class="texto-modelo">${esc(m.texto)}</pre>
      <details><summary>WhatsApp</summary><pre class="texto-modelo">${esc(m.whatsapp)}</pre></details></div>`).join('')}
    ${salvos.map((m) => `<div class="cartao"><div class="cabecalho"><h2>${esc(m.nome)} <span class="suave">(salvo)</span></h2><div class="acoes">${usar(`modelo=${m.id}`)}
      ${opera() ? botao('excluirModeloMensagem', 'Excluir', { id: m.id }, 'perigo pequeno', `Excluir o modelo "${m.nome}"? As mensagens já feitas com ele não mudam.`) : ''}</div></div>
      ${m.assunto ? `<p class="suave">Assunto: ${esc(m.assunto)}</p>` : ''}${m.texto ? `<pre class="texto-modelo">${esc(m.texto)}</pre>` : ''}
      ${m.whatsapp ? `<details><summary>WhatsApp</summary><pre class="texto-modelo">${esc(m.whatsapp)}</pre></details>` : ''}</div>`).join('')}
    <p class="suave">Para salvar um modelo seu: em "Nova mensagem", escreva o texto e toque em "Salvar como modelo".</p>`;
}

/** A mensagem: cada pessoa, o que já saiu e os botões de envio. */
export function telaMensagem(id) {
  const msg = buscar('mensagens', id);
  if (!msg) return naoEncontrado('Mensagem não encontrada', '#/comunicacoes', 'Ver as comunicações');
  const r = MS.resumo(msg);
  const nada = !msg.destinos.some((x) => x.email_em || x.whats_em || x.agendado_id);
  const linha = (x) => {
    const p = MS.pessoaDoDestino(d(), x);
    const s = MS.situacaoDe(x);
    const envios = [x.email_em && `e-mail ${C.dataHoraBr(x.email_em)}`, x.agendado_id && !x.email_em && `e-mail agendado para ${C.dataHoraBr(x.agendado_para)}`, x.whats_em && `WhatsApp ${C.dataHoraBr(x.whats_em)}`].filter(Boolean).join('<br>');
    const acoes = opera() && p ? `${msg.texto ? botao('emailMensagem', 'E-mail', { id: msg.id, chave: x.chave }) : ''} ${msg.whatsapp ? botao('whatsMensagem', 'WhatsApp', { id: msg.id, chave: x.chave }) : ''}` : '';
    return `<tr><td>${p ? `<b>${esc(p.nome)}</b>${papel(x.tipo)}` : '<span class="suave">saiu do cadastro</span>'}</td><td>${esc(p && p.imovel ? p.imovel.nome : '')}</td>
      <td>${p ? [p.email, CM.telefoneBr(p.telefone)].filter(Boolean).map(esc).join('<br>') || '<span class="suave">sem contato</span>' : ''}</td>
      <td>${etiqueta(s.texto, s.cor)}</td><td class="suave">${envios || '-'}</td><td class="nw">${acoes}</td></tr>`;
  };
  return `${voltar}<div class="cabecalho"><h1>${esc(msg.titulo)}</h1><div class="acoes">${opera() ? link(`#/comunicacoes?ver=escrever&id=${msg.id}`, 'Usar o texto numa nova', 'botao secundario pequeno') : ''}
      ${opera() && nada ? botao('excluirMensagem', 'Excluir', { id: msg.id }, 'perigo pequeno', `Excluir a mensagem "${msg.titulo}"? Nada foi enviado ainda.`) : ''}</div></div>
    <p class="suave">Criada em ${C.dataHoraBr(msg.criado_em)}${msg.texto ? ` · assunto: ${esc(msg.assunto)}` : ''}</p>
    ${msg.texto && !E.nuvem ? `<div class="alerta aviso">${SO_NUVEM_EMAIL}</div>` : ''}
    <div class="cartao"><div class="numeros-cartao">${quadro('Pessoas', r.total)}${quadro('Por e-mail', r.email, 'ok')}${quadro('Pelo WhatsApp', r.whats, 'ok')}${r.agendados ? quadro('Agendados', r.agendados) : ''}${quadro('Não enviados', r.nada)}</div>
      ${opera() ? `<p class="acoes">${msg.texto ? botao('emailTodosMensagem', '✉ Enviar e-mail a todos', { id: msg.id }, 'pequeno') : ''} ${msg.whatsapp ? botao('whatsTodosMensagem', 'WhatsApp a todos', { id: msg.id }) : ''} ${botao('previaMensagem', 'Ver como fica', { id: msg.id })}</p>` : ''}
      <p class="suave">"Enviar e-mail a todos" manda só para quem ainda não recebeu por e-mail. O WhatsApp abre a conversa de cada pessoa com a mensagem copiada: é só colar e enviar.</p></div>
    <div class="cartao rolagem"><table><tr><th>Pessoa</th><th>Imóvel</th><th>Contatos no cadastro</th><th>Situação</th><th>Enviado</th><th></th></tr>${msg.destinos.map(linha).join('')}</table></div>`;
}

// ---------------------------------------------------------------------------
// Prévia e envio
// ---------------------------------------------------------------------------
/** Textos prontos de uma pessoa: { assunto, texto, whatsapp, falta: [campos sem dado] }. */
function textosDe(msg, p) {
  const dados = MS.camposDe(d(), msg, p, C.hojeBrasilia());
  const assunto = msg.assunto ? MS.preencher(msg.assunto, dados) : '';
  const texto = msg.texto ? MS.preencher(msg.texto, dados) : '';
  const whatsapp = msg.whatsapp ? MS.preencher(msg.whatsapp, dados) : '';
  return { assunto, texto, whatsapp, falta: MS.faltando(`${assunto}\n${texto}\n${whatsapp}`) };
}

let logo = null;
async function logoDoEmail() {
  if (logo === null) logo = await logoReduzida().catch(() => '');
  return logo;
}
const imagemDaLogo = (url) => { const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(url || ''); return m ? [{ cid: 'logo', tipo: m[1], base64: m[2] }] : []; };

/** O miolo do e-mail (sem <html> e <body>) para a prévia na própria janela (o texto já vem escapado por htmlDoEmail). */
const corpoDoEmail = (html, lg) => html.replace(/^[\s\S]*?<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '').replace('cid:logo', esc(lg || ''));

async function htmlDe(texto) {
  const e = CM.empresasDoTopo(d());
  const lg = await logoDoEmail();
  return { html: CM.htmlDoEmail(texto, { empresas: e.nomes, cnpjs: e.cnpjs, cidade: e.cidade, logo: !!lg }), logo: lg };
}

/** Janela da prévia: o e-mail e o WhatsApp da 1ª pessoa e quem tem problema (dado faltando, sem e-mail, sem celular). */
async function mostrarPrevia(msg, lista) {
  if (!lista.length) throw new C.ErroUsuario('Escolha pelo menos uma pessoa para ver como fica.');
  const p = lista[0];
  const t = textosDe(msg, p);
  const { html, logo: lg } = await htmlDe(t.texto);
  const problemas = lista.map((x) => {
    const y = textosDe(msg, x);
    const avisos = [y.falta.length && `falta no cadastro: ${y.falta.join(', ')}`, msg.texto && !x.email && 'sem e-mail', msg.whatsapp && !CM.telefoneWhats(x.telefone) && 'sem celular'].filter(Boolean);
    return avisos.length ? `<li><b>${esc(x.nome)}</b>: ${esc(avisos.join('; '))}</li>` : '';
  }).join('');
  await janela({
    titulo: `Como fica (com os dados de ${p.nome})`, sim: 'Fechar', nao: null,
    html: `${problemas ? `<div class="alerta aviso" data-problemas-mensagem><b>Atenção:</b><ul>${problemas}</ul><span class="suave">Quem tem dado faltando não recebe até corrigir o cadastro (ou tirar o campo do texto).</span></div>` : ''}
      ${msg.texto ? `<p><b>Assunto:</b> <span data-previa-assunto>${esc(t.assunto)}</span></p>
      <div data-previa-email style="max-height:380px;overflow:auto;border:1px solid var(--borda);border-radius:8px">${corpoDoEmail(html, lg)}</div>` :'<p class="suave">Sem e-mail (só WhatsApp).</p>'}
      ${msg.whatsapp ? `<h3>WhatsApp</h3><pre class="texto-modelo" data-previa-whats>${esc(t.whatsapp)}</pre>` : ''}
      <p class="suave">${C.plural(lista.length, 'pessoa escolhida', 'pessoas escolhidas')}.</p>`,
  });
}

function exigir() {
  if (!opera()) throw new C.ErroUsuario(SO_CONSULTA);
}

async function enviarEmails(msg, alvos) {
  if (!E.nuvem) throw new C.ErroUsuario(SO_NUVEM_EMAIL);
  if (!(await GM.emailLigado())) throw new C.ErroUsuario('O envio pelo Gmail não está ligado (Sistema → Comunicação E-mail → Conectar o Gmail).');
  const quando = await perguntarQuando({ resumo: `${C.plural(alvos.length, 'e-mail', 'e-mails')} da mensagem "${msg.titulo}".` });
  if (!quando) return { ok: 0, falhas: [], cancelado: true };
  const agendado = quando.modo === 'agendar' ? quando.rotulo : '';
  let ok = 0; const falhas = [];
  for (const [n, x] of alvos.entries()) {
    const p = MS.pessoaDoDestino(d(), x);
    if (!p) continue;
    aviso(`Enviando ${n + 1} de ${alvos.length}: ${p.nome}…`, 'info');
    try {
      if (!p.email) throw new C.ErroUsuario('sem e-mail no cadastro');
      const t = textosDe(msg, p);
      if (t.falta.length) throw new C.ErroUsuario(`falta um dado no cadastro (${t.falta.join(', ')}): o e-mail não foi enviado`);
      const { html, logo: lg } = await htmlDe(t.texto);
      const m = { para: p.email, assunto: t.assunto, texto: t.texto, html, imagens: imagemDaLogo(lg) };
      const registro = { chave: 'mensagem', contrato_id: x.contrato_id || null, ficha_id: null, aditivo_id: null, mensagem_id: msg.id, para: m.para, assunto: m.assunto };
      if (agendado) {
        const r = await GM.agendarEmail({ ...m, quando: quando.quando, registro: { ...registro, usuario: login(), efeito: { tipo: 'mensagem', mensagem_id: msg.id, destino: x.chave } }, descricao: `Mensagem "${msg.titulo}" · ${p.nome}` });
        await alterar((db) => {
          const c = R.buscar(db, 'mensagens', msg.id);
          R.atualizar(db, 'mensagens', c.id, { destinos: c.destinos.map((y) => (y.chave === x.chave ? { ...y, agendado_id: r.id, agendado_para: r.quando } : { ...y })) }, login(), `Mensagem "${c.titulo}": e-mail agendado para ${agendado}`);
        });
      } else {
        const r = await GM.enviarEmail(m);
        await alterar((db) => {
          MS.marcarEnvio(db, msg.id, x.chave, 'email_em', login());
          R.inserir(db, 'envios_email', { ...registro, data: C.hojeBrasilia(), como: 'enviado', gmail_id: (r && r.id) || null }, login(), `E-mail "${m.assunto}" enviado para ${m.para}`);
        });
      }
      ok += 1;
    } catch (e) { falhas.push(`${p.nome}: ${e.message}`); }
  }
  return { ok, falhas, agendado };
}

/** WhatsApp um por um: a pessoa da vez, com a mensagem para copiar e o botão que abre a conversa; "Próximo" segue a fila. */
async function filaWhatsapp(msgId, fila) {
  for (let i = 0; i < fila.length; i += 1) {
    const msg = buscar('mensagens', msgId);
    const x = msg.destinos.find((y) => y.chave === fila[i].chave);
    const p = x ? MS.pessoaDoDestino(d(), x) : null;
    if (!p) continue;
    const t = textosDe(msg, p);
    if (t.falta.length) { aviso(`${p.nome}: falta um dado no cadastro (${t.falta.join(', ')}). Pulado.`, 'aviso'); continue; }
    const tel = CM.telefoneWhats(p.telefone);
    let abriu = false;
    const resp = await janela({
      titulo: `WhatsApp ${i + 1} de ${fila.length}: ${p.nome}${CM.PAPEIS[x.tipo] ? ` (${CM.PAPEIS[x.tipo]})` : ''}`, sim: i + 1 < fila.length ? 'Próximo' : 'Terminar', nao: 'Parar',
      html: `${avisoForaDoHorario()}<p><textarea rows="6" readonly data-texto style="width:100%">${esc(t.whatsapp)}</textarea></p>
        <p class="acoes">${tel ? `<a class="botao pequeno" target="_blank" rel="noopener noreferrer" href="https://wa.me/${tel}" data-zap>Copiar e abrir o WhatsApp (${esc(CM.telefoneBr(p.telefone))})</a>` : '<span class="suave">Sem celular no cadastro: copie e mande de outro jeito.</span>'}
        <button type="button" class="secundario pequeno" data-copiar>Copiar a mensagem</button></p>
        <p class="suave">No WhatsApp, cole a mensagem (segure e escolha Colar) e envie. Depois volte aqui e toque em "${i + 1 < fila.length ? 'Próximo' : 'Terminar'}".</p>`,
      ligar: (dlg) => {
        const copiar = async () => { try { await navigator.clipboard.writeText(dlg.querySelector('[data-texto]').value); return true; } catch { dlg.querySelector('[data-texto]').select(); return false; } };
        dlg.querySelector('[data-copiar]').addEventListener('click', async (ev) => { if (await copiar()) ev.target.textContent = 'Copiado ✓'; abriu = true; });
        const zap = dlg.querySelector('[data-zap]');
        if (zap) zap.addEventListener('click', () => { copiar(); abriu = true; });
      },
    });
    if (abriu) await alterar((db) => { MS.marcarEnvio(db, msgId, x.chave, 'whats_em', login()); });
    if (!resp) break;
  }
  await mostrar();
}

const resultado = async ({ ok, falhas, agendado, cancelado }) => {
  if (cancelado) return;
  if (falhas.length) await janela({ titulo: `${ok} ${agendado ? 'agendado(s)' : 'enviado(s)'}, ${falhas.length} com problema`, sim: 'Fechar', nao: null, html: `<ul>${falhas.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` });
  else aviso(agendado ? `${ok} e-mail(s) agendado(s) para ${agendado}: saem sozinhos pela nuvem.` : `${ok} e-mail(s) enviado(s).`);
  await mostrar();
};

export const ACOES_MENSAGENS = {
  async emailTodosMensagem({ id }) {
    exigir();
    const msg = buscar('mensagens', Number(id));
    const { alvos, sem, fora } = MS.filaDoEnvio(d(), msg, 'email');
    const saiu = fora ? ` ${fora} pessoa(s) saíram do cadastro e ficam de fora.` : '';
    if (!alvos.length) { aviso(`Não há e-mail para enviar: ${sem.length ? `${sem.length} pessoa(s) sem e-mail no cadastro (use o WhatsApp)` : 'todos já receberam'}.${saiu}`, 'info'); return; }
    if (!(await confirmar(`Enviar o e-mail para ${alvos.length} pessoa(s)?${sem.length ? ` ${sem.length} sem e-mail ficam para o WhatsApp.` : ''}${saiu}`, { titulo: 'Enviar e-mail a todos', sim: 'Enviar' }))) return;
    await resultado(await enviarEmails(msg, alvos));
  },
  async emailMensagem({ id, chave }) {
    exigir();
    const msg = buscar('mensagens', Number(id));
    const x = msg && msg.destinos.find((y) => y.chave === chave);
    const p = x && MS.pessoaDoDestino(d(), x);
    if (!p) throw new C.ErroUsuario('Esta pessoa saiu do cadastro.');
    if (!p.email) throw new C.ErroUsuario(`${p.nome} não tem e-mail no cadastro. Use o WhatsApp.`);
    if (x.email_em && !(await confirmar(`${p.nome} já recebeu este e-mail em ${C.dataHoraBr(x.email_em)}. Enviar de novo?`, { titulo: 'Já enviado', sim: 'Enviar de novo' }))) return;
    if (x.agendado_id && !x.email_em && !(await confirmar(`Já há um e-mail agendado para ${p.nome}. Enviar outro?`, { titulo: 'Já agendado', sim: 'Enviar outro' }))) return;
    const r = await enviarEmails(msg, [x]);
    if (!r.cancelado && r.falhas.length) throw new C.ErroUsuario(r.falhas[0]);
    if (!r.cancelado) { aviso(r.agendado ? `E-mail para ${p.nome} agendado para ${r.agendado}.` : `E-mail enviado para ${p.nome}.`); await mostrar(); }
  },
  async whatsTodosMensagem({ id }) {
    exigir();
    const msg = buscar('mensagens', Number(id));
    const { alvos, sem, fora } = MS.filaDoEnvio(d(), msg, 'whats');
    if (!alvos.length) { aviso(`Ninguém na fila do WhatsApp: ${sem.length ? `${sem.length} pessoa(s) sem celular no cadastro` : 'todos já receberam'}.${fora ? ` ${fora} saíram do cadastro.` : ''}`, 'info'); return; }
    await filaWhatsapp(msg.id, alvos);
  },
  async whatsMensagem({ id, chave }) {
    exigir();
    const msg = buscar('mensagens', Number(id));
    const x = msg && msg.destinos.find((y) => y.chave === chave);
    if (!x || !MS.pessoaDoDestino(d(), x)) throw new C.ErroUsuario('Esta pessoa saiu do cadastro.');
    await filaWhatsapp(msg.id, [x]);
  },
  async previaMensagem({ id }) {
    const msg = buscar('mensagens', Number(id));
    await mostrarPrevia(msg, msg.destinos.map((x) => MS.pessoaDoDestino(d(), x)).filter(Boolean));
  },
  async excluirMensagem({ id }) {
    exigir();
    const msg = buscar('mensagens', Number(id));
    if (!msg) throw new C.ErroUsuario('Esta mensagem já foi excluída.');
    if (msg.destinos.some((x) => x.email_em || x.whats_em || x.agendado_id)) throw new C.ErroUsuario('Esta mensagem já foi enviada (ou agendada) para alguém: não dá para excluir.');
    await alterar((db) => { if (R.buscar(db, 'mensagens', msg.id)) R.excluir(db, 'mensagens', msg.id, login(), `Mensagem "${msg.titulo}" excluída (nada tinha sido enviado)`); });
    aviso('Mensagem excluída.');
    ir('#/comunicacoes');
  },
  async excluirModeloMensagem({ id }) {
    exigir();
    const m = buscar('modelos_mensagem', Number(id));
    if (!m) return;
    await alterar((db) => { R.excluir(db, 'modelos_mensagem', m.id, login(), `Modelo de mensagem "${m.nome}" excluído`); });
    aviso('Modelo excluído.');
    await mostrar();
  },
};

/** O que está escrito no formulário agora. */
function lerFormulario(form) {
  const f = new FormData(form);
  const v = (k) => String(f.get(k) || '');
  return { titulo: v('titulo'), assunto: v('assunto'), texto: v('texto'), whatsapp: v('whatsapp'), email_empresa: v('email_empresa').trim().toLowerCase(), telefone_empresa: CM.telefoneBr(v('telefone_empresa').trim()), chaves: f.getAll('pessoa').map(String) };
}

export const FORMULARIOS_MENSAGENS = {
  async criarMensagem(form) {
    exigir();
    const dados = lerFormulario(form);
    const base = MS.novaMensagem(d(), dados);
    const msg = await alterar((db) => R.inserir(db, 'mensagens', { ...base, criado_por: login() }, login(), `Mensagem "${base.titulo}" para ${base.destinos.length} pessoa(s)`));
    aviso('Mensagem pronta. Confira e envie.');
    ir(`#/comunicacoes?ver=mensagem&id=${msg.id}`);
  },
};

/** Liga a tela "Nova mensagem": campos que entram no cursor, modelo, escolha das pessoas, prévia e "Salvar como modelo". */
export function ligarMensagem(raiz) {
  const form = raiz.querySelector('[data-mensagem-form]');
  if (!form) return;
  let alvo = form.querySelector('[name=texto]');
  for (const el of form.querySelectorAll('[name=assunto], [name=texto], [name=whatsapp]')) el.addEventListener('focus', () => { alvo = el; });
  for (const b of form.querySelectorAll('[data-inserir]')) {
    b.addEventListener('click', () => {
      const t = b.dataset.inserir;
      const ini = alvo.selectionStart ?? alvo.value.length; const fim = alvo.selectionEnd ?? ini;
      alvo.value = alvo.value.slice(0, ini) + t + alvo.value.slice(fim);
      alvo.focus();
      const pos = t.includes('…') ? ini + t.indexOf('…') : ini + t.length;
      alvo.setSelectionRange(pos, t.includes('…') ? pos + 1 : pos);
      alvo.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  const sel = form.querySelector('[data-modelo-mensagem]');
  const modelos = sel ? JSON.parse(sel.dataset.modelos || '[]') : [];
  if (sel) {
    let antes = sel.value;
    sel.addEventListener('change', async () => {
      const m = modelos.find((x) => x.valor === sel.value);
      if (!m || sel.value === antes) return;
      const mexeu = ['assunto', 'texto', 'whatsapp'].some((k) => form.querySelector(`[name=${k}]`).value.trim() !== (modelos.find((x) => x.valor === antes) || {})[k]);
      if (mexeu && !(await confirmar('Trocar o modelo apaga o assunto e os textos que você escreveu. Trocar?', { titulo: 'Trocar o modelo', sim: 'Trocar' }))) { sel.value = antes; return; }
      for (const k of ['assunto', 'texto', 'whatsapp']) form.querySelector(`[name=${k}]`).value = m[k] || '';
      antes = sel.value;
    });
  }
  const caixas = () => [...form.querySelectorAll('[name=pessoa]')];
  const contar = () => { form.querySelector('[data-contagem-pessoas]').textContent = `${caixas().filter((c) => c.checked).length} pessoa(s) escolhida(s)`; };
  form.addEventListener('change', (ev) => { if (ev.target.name === 'pessoa') contar(); });
  for (const b of form.querySelectorAll('[data-marcar]')) {
    b.addEventListener('click', () => {
      const qual = b.dataset.marcar;
      for (const c of caixas()) {
        const tr = c.closest('tr');
        if (tr.hidden && qual !== 'nenhum') continue; // com a busca, marca só os que aparecem
        c.checked = qual === 'todos' || (qual === 'inquilino' && tr.dataset.tipo === 'inquilino') || (qual === 'inquilino' && c.checked && tr.dataset.tipo !== 'inquilino');
      }
      contar();
    });
  }
  const filtro = form.querySelector('[data-filtro-pessoas]');
  if (filtro) {
    filtro.addEventListener('input', () => {
      const q = filtro.value.trim().toLowerCase();
      for (const tr of form.querySelectorAll('tr[data-pessoa]')) tr.hidden = !!q && !tr.dataset.busca.includes(q);
    });
    filtro.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.preventDefault(); });
  }
  const erro = (e) => aviso(e.message, e instanceof C.ErroUsuario ? 'aviso' : 'erro');
  form.querySelector('[data-previa-mensagem]').addEventListener('click', () => {
    const dados = lerFormulario(form);
    const escolhidas = new Set(dados.chaves);
    mostrarPrevia(dados, MS.pessoas(d()).filter((p) => escolhidas.has(p.chave))).catch(erro);
  });
  form.querySelector('[data-salvar-modelo]').addEventListener('click', async () => {
    try {
      const dados = lerFormulario(form);
      if (!dados.texto.trim() && !dados.whatsapp.trim()) throw new C.ErroUsuario('Escreva o texto do e-mail ou do WhatsApp antes de salvar o modelo.');
      const x = [dados.assunto, dados.texto, dados.whatsapp].flatMap(MS.camposDesconhecidos);
      if (x.length) throw new C.ErroUsuario(`O sistema não conhece ${x.map((n) => `{${n}}`).join(', ')}.`);
      const r = await janela({ titulo: 'Salvar como modelo', sim: 'Salvar', nao: 'Cancelar', html: `<p><label>Nome do modelo</label><input name="nome" value="${esc(dados.titulo)}" required style="width:100%"></p><p class="suave">O modelo guarda o assunto e os textos (não as pessoas).</p>` });
      if (!r) return;
      const nome = String((r.nome || [])[0] || '').trim();
      if (!nome) throw new C.ErroUsuario('Dê um nome ao modelo.');
      await alterar((db) => R.inserir(db, 'modelos_mensagem', { nome, assunto: dados.assunto.trim(), texto: dados.texto.trim(), whatsapp: dados.whatsapp.trim() }, login(), `Modelo de mensagem "${nome}" salvo`));
      aviso(`Modelo "${nome}" salvo. Aparece em "Começar de um modelo" e em Comunicações → Modelos.`);
    } catch (e) { erro(e); }
  });
}
