// Comunicações (pedido do dono em 2026-11-18): aba de Inquilinos com os comunicados a todos (#/comunicacoes), as solicitações
// e as notificações (atalhos para as páginas delas) e os modelos. O comunicado de contatos: cada inquilino e fiador ativo
// recebe um link só dele (e-mail com a logo, pelo Gmail; WhatsApp, um por um, com o texto copiado), confirma os contatos
// na página pública (nuvem/contatos-publico.mjs) e a resposta volta para o cadastro ao abrir esta tela.
// Regras e textos: comunicados.js.
import { alterar, aviso, confirmar, E, ir, janela, login, mostrar } from '../app.js';
import * as C from '../calculos.js';
import { dataBr } from '../calculos.js';
import * as CM from '../comunicados.js';
import * as K from '../contratos.js';
import { esc } from '../formularios.js';
import * as GM from '../gmail.js';
import { limiteDeTempo } from '../nuvem.js';
import * as R from '../regras.js';
import { botao, buscar, d, etiqueta, link, naoEncontrado, opera } from './comum.js';
import { avisoForaDoHorario, perguntarQuando } from './horario.js';

const SO_CONSULTA = 'Seu usuário só consulta: não pode enviar comunicados.';
const SO_NUVEM = 'O comunicado com link só funciona no sistema pela internet (nuvem).';
const DIAS_PRAZO = 10;

/** Abas de Inquilinos: Lista e Comunicações. */
export const abasInquilinos = (atual) => `<nav class="abas">${link('#/inquilinos', 'Lista', atual === 'lista' ? 'ativo' : '')}${link('#/comunicacoes', 'Comunicações', atual === 'comunicacoes' ? 'ativo' : '')}</nav>`;

/** Atalhos dentro de Comunicações (também no topo das páginas de solicitações e de notificações). */
export function atalhosComunicacoes(atual) {
  const sol = R.resumoSolicitacoes(d());
  const abertasSol = (sol.Aberta || 0) + (sol['Em andamento'] || 0);
  const notAbertas = (d().notificacoes || []).filter(R.notificacaoEmAberto);
  const abertasNot = notAbertas.length;
  const vencidasNot = notAbertas.filter((n) => R.estadoNotificacao(d(), n).vencidaSemMulta).length;
  const b = (hash, texto, chave) => link(hash, texto, `botao ${atual === chave ? '' : 'secundario '}pequeno`);
  // (os comunicados a todos são a própria aba "Comunicações": sem botão repetido aqui)
  return `${abasInquilinos('comunicacoes')}<div class="acoes" style="margin-bottom:12px;flex-wrap:wrap">
    ${b('#/solicitacoes', `Solicitações${abertasSol ? ` (${abertasSol})` : ''}`, 'solicitacoes')}
    ${b('#/notificacoes', `Notificações${abertasNot ? ` (${abertasNot}${vencidasNot ? ` · ${vencidasNot} com prazo vencido` : ''})` : ''}`, 'notificacoes')} ${b('#/comunicacoes?ver=modelos', 'Modelos', 'modelos')}</div>`;
}

// ---------------------------------------------------------------------------
// Nuvem (rotas /api/contatos/… do Worker)
// ---------------------------------------------------------------------------
const cfg = { base: 'api/contatos/', buscar: (...a) => fetch(...a) };
export function configurarComunicacoes(opcoes = {}) { Object.assign(cfg, opcoes); }
async function pedir(caminho, op = {}) {
  let r;
  try {
    r = await cfg.buscar(`${cfg.base}${caminho}`, { cache: 'no-store', credentials: 'same-origin', signal: limiteDeTempo(30000), ...op,
      headers: { ...(op.method && op.method !== 'GET' ? { 'X-Sistema': 'imoveis', 'Content-Type': 'application/json' } : {}) } });
  } catch { throw new C.ErroUsuario('Sem internet: o comunicado precisa de conexão.'); }
  const tipo = r.headers.get('content-type') || '';
  if (r.redirected || !tipo.includes('json')) throw new C.ErroUsuario('A nuvem não respondeu (entre de novo no sistema e tente outra vez).');
  const dados = await r.json();
  if (!r.ok) throw new C.ErroUsuario(dados.erro || 'A nuvem recusou o pedido.');
  return dados;
}

// lista da nuvem guardada por um minuto e meio por comunicado (a tela redesenha sem ir à nuvem a cada vez)
const guardadas = new Map(); // id → { em, links }
const VALIDADE = 90000;

/** Busca a situação na nuvem e traz as respostas (cadastro atualizado). Devolve quantos cadastros mudaram. */
async function atualizarDaNuvem(comId, { forcar = false } = {}) {
  if (!E.nuvem) return 0;
  const g = guardadas.get(comId);
  if (!forcar && g && Date.now() - g.em < VALIDADE) return 0;
  const { links } = await pedir(`lista?comunicado=${Number(comId)}`);
  guardadas.set(comId, { em: Date.now(), links });
  let mudaram = 0;
  const com = buscar('comunicados', comId);
  const novidade = (links || []).some((l) => { const x = (com.destinos || []).find((y) => y.chave === l.destino); return x && ((l.aberto_em && !x.aberto_em) || (l.resposta && l.resposta.em !== (x.resposta && x.resposta.em)) || (x.resposta && !x.aplicado_em)); });
  if (novidade) await alterar((db) => { mudaram = CM.juntarRespostas(db, comId, links, login()); });
  return mudaram;
}

// ---------------------------------------------------------------------------
// Logo (reduzida uma vez por abertura): data URL PNG (ou JPEG, se a PNG passar do limite)
// ---------------------------------------------------------------------------
let logoGuardada = null; // { origem, url }
export async function logoReduzida() {
  const origem = d().logo || '';
  if (!origem) return '';
  if (logoGuardada && logoGuardada.origem === origem) return logoGuardada.url;
  let url = '';
  try {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = origem; });
    const escala = Math.min(1, 320 / img.naturalWidth, 160 / img.naturalHeight);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * escala)); cv.height = Math.max(1, Math.round(img.naturalHeight * escala));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    url = cv.toDataURL('image/png');
    if (url.length > 110000) {
      const ctx = cv.getContext('2d'); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      url = cv.toDataURL('image/jpeg', 0.85);
    }
    if (url.length > 110000) url = '';
  } catch { url = ''; }
  logoGuardada = { origem, url };
  return url;
}
const imagemDaLogo = (url) => { const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(url || ''); return m ? [{ cid: 'logo', tipo: m[1], base64: m[2] }] : []; };

// ---------------------------------------------------------------------------
// Telas
// ---------------------------------------------------------------------------
const quadro = (rotulo, n, cor = '') => `<div class="numero-cartao"><div class="suave">${rotulo}</div><div class="numero${cor ? ` ${cor}` : ''}">${n}</div></div>`;

export async function telaComunicacoes(q = {}) {
  if (q.ver === 'modelos') return telaModelosComunicado();
  if (q.ver === 'novo') return telaNovoComunicado(q);
  const lista = [...(d().comunicados || [])].sort((a, b) => b.id - a.id);
  if (q.ver === 'editar' && q.id) return telaNovoComunicado(q, Number(q.id));
  if (q.id) return telaComunicado(Number(q.id));
  // fora da nuvem o comunicado não tem como ser enviado (o link é da nuvem): não oferece criar
  const podeCriar = opera() && E.nuvem;
  return `<div class="cabecalho"><h1>Comunicações</h1><div class="acoes">${E.nuvem ? link('#/envios-agendados', 'Envios agendados') : ''} ${podeCriar ? link('#/comunicacoes?ver=novo', 'Novo comunicado a todos', 'botao') : ''}</div></div>
    ${atalhosComunicacoes('comunicados')}
    ${lista.length ? lista.map((com) => cartaoComunicado(com)).join('') : `<div class="cartao"><p>Nenhum comunicado enviado ainda.</p>
      <p class="suave">O comunicado vai para todos os inquilinos e fiadores com contrato ativo, cada um com um link só dele, por e-mail e por WhatsApp. Ex.: "Atualização de contatos e novo e-mail da empresa".</p>
      ${podeCriar ? link('#/comunicacoes?ver=novo', 'Novo comunicado a todos', 'botao') : opera() ? `<p class="suave">${SO_NUVEM}</p>` : ''}</div>`}`;
}

/** Nada saiu ainda (nenhum e-mail, WhatsApp, lembrete, abertura nem confirmação): o comunicado pode ser corrigido ou excluído. */
const nadaEnviado = (com) => !(com.destinos || []).some((x) => x.email_em || x.whats_em || x.lembrete_em || x.aberto_em || x.confirmado_em);

function cartaoComunicado(com) {
  const r = CM.resumo(com);
  const vencido = com.prazo < C.hojeIso();
  return `<div class="cartao"><div class="cabecalho"><h2>${esc(com.titulo)}</h2>${etiqueta(vencido ? `prazo acabou em ${dataBr(com.prazo)}` : `prazo ${dataBr(com.prazo)}`, vencido ? 'neutra' : 'aviso')}</div>
    <p class="suave">Criado em ${C.dataHoraBr(com.criado_em)} · ${r.total} pessoa(s)</p>
    <div class="numeros-cartao">${quadro('Confirmaram', r.confirmaram, 'ok')}${quadro('Abriram', r.abriram)}${quadro('Não abriram', r.naoAbriram, r.naoAbriram ? 'perigo' : '')}${quadro('Não enviados', r.naoEnviados)}</div>
    <p class="acoes">${link(`#/comunicacoes?id=${com.id}`, 'Abrir', 'botao pequeno')}</p></div>`;
}

function telaNovoComunicado(q, editarId = null) {
  if (!opera()) return `<div class="alerta erro">${SO_CONSULTA}</div>`;
  const voltar = '<p class="suave"><a href="#/comunicacoes">← Comunicações</a></p>';
  if (!E.nuvem) return `${voltar}<h1>Novo comunicado a todos</h1><div class="alerta aviso">${SO_NUVEM}</div>`;
  const editado = editarId ? buscar('comunicados', editarId) : null;
  if (editarId && !editado) return naoEncontrado('Comunicado não encontrado', '#/comunicacoes', 'Ver as comunicações');
  if (editado && !nadaEnviado(editado)) return `${voltar}<h1>${esc(editado.titulo)}</h1><div class="alerta aviso">Este comunicado já foi enviado (ou alguém já abriu o link): não dá mais para mudar. Crie um novo, se precisar.</div>`;
  const chave = editado ? editado.modelo : CM.MODELOS[q.tema] ? q.tema : 'contatos';
  const m = { ...(CM.MODELOS[chave] || CM.MODELOS.contatos), ...(editado ? Object.fromEntries(['titulo', 'assunto', 'texto', 'whatsapp', 'lembrete', 'aviso', 'ciencia'].map((k) => [k, editado[k] || ''])) : {}) };
  const pessoas = editado ? editado.destinos : CM.destinatarios(d());
  if (!pessoas.length) return `${voltar}<h1>Novo comunicado a todos</h1><div class="alerta aviso">Não há inquilino com contrato ativo hoje: o comunicado não teria para quem ir.</div>`;
  const prazo = editado ? editado.prazo : C.somarDias(C.inicioDoPrazoAgora(), DIAS_PRAZO); // ex.: 18/11 às 10h → 28/11; às 21h → 29/11 (regra fim_expediente_hora)
  const email = editado ? editado.email_empresa : K.dadoDaEmpresa(d(), {}, 'email_contato') || 'administracao@ankjck.com.br';
  // telefone: o do comunicado editado ou o do último comunicado gravado (não precisa digitar toda vez)
  const ultimo = [...(d().comunicados || [])].sort((a, b) => b.id - a.id).find((x) => x.telefone_empresa);
  const telefone = editado ? editado.telefone_empresa : ultimo ? ultimo.telefone_empresa : '';
  const area = (nome, rotulo, valor, linhas, ajuda = '') => `<p><label>${rotulo}</label><textarea name="${nome}" rows="${linhas}" style="width:100%">${esc(valor)}</textarea>${ajuda ? `<span class="suave">${ajuda}</span>` : ''}</p>`;
  const semContato = editado ? [] : pessoas.filter((p) => !p.email && !CM.telefoneWhats(p.telefone));
  const comLink = editado ? editado.destinos.filter((x) => x.url).length : 0;
  return `${voltar}<h1>${editado ? 'Corrigir o comunicado' : 'Novo comunicado a todos'}</h1>
    <form data-form="criarComunicado" class="cartao"><input type="hidden" name="modelo" value="${esc(chave)}">${editado ? `<input type="hidden" name="id" value="${editado.id}">` : ''}
      <p><b>Modelo:</b> ${esc((CM.MODELOS[chave] || CM.MODELOS.contatos).nome)}</p>
      <p><b>Vai para ${pessoas.length} pessoa(s):</b> ${pessoas.filter((p) => p.tipo === 'inquilino').length} inquilino(s), ${pessoas.filter((p) => p.tipo === 'solidario').length} solidário(s), ${pessoas.filter((p) => p.tipo === 'representante').length} representante(s) de empresa e ${pessoas.filter((p) => p.tipo === 'fiador').length} fiador(es) dos contratos ativos${editado ? ' do dia em que foi criado' : ' de hoje'}.
        ${semContato.length ? `<br>${etiqueta(`${semContato.length} sem e-mail nem celular`, 'aviso')} ${esc(semContato.map((p) => p.nome).join(', '))}: o link aparece para você copiar e mandar de outro jeito.` : ''}</p>
      ${comLink ? `<div class="alerta aviso">${comLink} link(s) já gerado(s) deixam de valer ao salvar (são gerados de novo, com o texto corrigido, no envio).</div>` : ''}
      <div class="grade">
        <p><label>Prazo para confirmar</label><input type="date" name="prazo" value="${esc(prazo)}" required></p>
        <p><label>E-mail da empresa (o novo)</label><input type="email" name="email_empresa" value="${esc(email)}" required></p>
        <p><label>Telefone da empresa para dúvidas</label><input type="tel" name="telefone_empresa" value="${esc(telefone)}" placeholder="(41) 0000-0000" required><span class="suave">O mesmo para as duas empresas. Aparece no aviso contra golpe: "na dúvida, ligue para …".</span></p>
      </div>
      <details><summary>Textos (pode mudar antes de criar)</summary>
        <p class="suave">Campos que o sistema preenche: {nome}, {imovel}, {imovel_curto}, {locatario}, {prazo}, {link}, {email_empresa}, {telefone_empresa}, {empresas}; [se fiador]…[senão]…[fim] muda o texto do fiador.</p>
        <p><label>Título (aparece na página)</label><input name="titulo" value="${esc(m.titulo)}" style="width:100%"></p>
        <p><label>Assunto do e-mail</label><input name="assunto" value="${esc(m.assunto)}" style="width:100%"></p>
        ${area('texto', 'Texto do e-mail', m.texto, 14, 'O parágrafo só com {link} vira o botão "Confirmar meus contatos"; o que começa com "Atenção" sai em destaque.')}
        ${area('whatsapp', 'Mensagem do WhatsApp', m.whatsapp, 4)}
        ${area('lembrete', 'Lembrete (WhatsApp e e-mail)', m.lembrete, 4)}
        ${area('aviso', 'Aviso que a pessoa lê na página', m.aviso, 12)}
        ${area('ciencia', 'Frase da caixa "Li e concordo"', m.ciencia, 3)}
      </details>
      <div class="acoes" style="margin-top:12px"><button>${editado ? 'Salvar as correções' : 'Criar o comunicado'}</button> ${link(editado ? `#/comunicacoes?id=${editado.id}` : '#/comunicacoes', 'Cancelar')}</div>
      <p class="suave">${editado ? 'Salvar' : 'Criar'} não envia nada: na próxima tela você vê a prévia e escolhe "Enviar e-mail a todos" e "WhatsApp a todos".</p></form>`;
}

function telaModelosComunicado() {
  return `<div class="cabecalho"><h1>Comunicações</h1></div>${atalhosComunicacoes('modelos')}
    ${Object.entries(CM.MODELOS).map(([chave, m]) => `<div class="cartao"><div class="cabecalho"><h2>${esc(m.nome)}</h2>${opera() && E.nuvem ? link(`#/comunicacoes?ver=novo&tema=${chave}`, 'Usar este modelo', 'botao pequeno') : ''}</div>
      <p class="suave">Assunto: ${esc(m.assunto)}</p><pre class="texto-modelo">${esc(m.texto)}</pre>
      <details><summary>Aviso da página e frase do aceite</summary><pre class="texto-modelo">${esc(m.aviso)}\n\n☐ ${esc(m.ciencia)}</pre></details>
      <details><summary>WhatsApp e lembrete</summary><pre class="texto-modelo">${esc(m.whatsapp)}\n\n${esc(m.lembrete)}</pre></details></div>`).join('')}
    <p class="suave">Cada comunicado guarda o texto com que foi criado; dá para ajustar o texto ao criar um comunicado novo.</p>`;
}

async function telaComunicado(id) {
  const com0 = buscar('comunicados', id);
  if (!com0) return naoEncontrado('Comunicado não encontrado', '#/comunicacoes', 'Ver as comunicações');
  let erroNuvem = '';
  // a lista da nuvem só responde a quem opera: quem só consulta vê o que já foi trazido, sem a faixa de erro
  if (opera()) { try { await atualizarDaNuvem(id); } catch (e) { erroNuvem = e.message; } }
  // o código de confirmação vai pelo Gmail da empresa: desligado, ninguém consegue confirmar (nem quem recebeu pelo WhatsApp)
  const gmailDesligado = E.nuvem && opera() && !(await gmailLigado());
  const com = buscar('comunicados', id);
  const r = CM.resumo(com);
  const ordem = [...com.destinos].sort((a, b) => CM.situacaoDe(a).peso - CM.situacaoDe(b).peso);
  const linha = (x) => {
    const s = CM.situacaoDe(x);
    const p = CM.pessoaDoDestino(d(), x);
    const imovel = p && p.imovel ? p.imovel.nome : '';
    const contatos = p ? [p.email, CM.telefoneBr(p.telefone)].filter(Boolean).map(esc).join('<br>') : '<span class="suave">saiu do cadastro</span>';
    const quando = x.confirmado_em ? ` ${C.dataHoraBr(x.confirmado_em)}` : x.aberto_em ? ` ${C.dataHoraBr(x.aberto_em)}` : '';
    const envios = [x.email_em && `e-mail ${C.dataHoraBr(x.email_em)}`, x.whats_em && `WhatsApp ${C.dataHoraBr(x.whats_em)}`, x.lembrete_em && `lembrete ${C.dataHoraBr(x.lembrete_em)}`].filter(Boolean).join('<br>');
    const acoes = x.confirmado_em ? link(`#/aceite-contatos?id=${com.id}&chave=${x.chave}`, 'Ver aceite')
      : opera() && p ? `${botao('emailComunicado', 'E-mail', { id: com.id, chave: x.chave })} ${botao('whatsComunicado', 'WhatsApp', { id: com.id, chave: x.chave })} ${botao('linkComunicado', 'Copiar link', { id: com.id, chave: x.chave })}
        ${x.url ? `<br>${botao('novoLinkComunicado', 'Gerar novo link', { id: com.id, chave: x.chave }, 'secundario mini', `Gerar um link novo para ${x.nome}? O link atual deixa de valer e a contagem de códigos recomeça.`)} ${botao('desligarLinkComunicado', 'Desligar o link', { id: com.id, chave: x.chave }, 'secundario mini', `Desligar o link de ${x.nome}? A pessoa não consegue mais abrir (para mandar de novo, o sistema gera outro).`)}`
    : x.link_desligado_em ? `<br><span class="suave">link desligado em ${C.dataHoraBr(x.link_desligado_em)}</span>` : ''}` : '';
    return `<tr><td><b>${esc(x.nome)}</b>${CM.PAPEIS[x.tipo] ? ` <span class="suave">(${CM.PAPEIS[x.tipo]})</span>` : ''}</td><td>${esc(imovel)}</td><td>${contatos}</td>
      <td>${etiqueta(s.texto, s.cor)}<span class="suave">${quando}</span>${x.resposta && x.resposta.mudou ? `<br>${etiqueta('mudou o contato', 'info')}` : ''}${x.resposta ? `<br><span class="suave">melhor: ${esc(x.resposta.melhor)}</span>` : ''}</td>
      <td class="suave">${envios || '-'}</td><td class="nw">${acoes}</td></tr>`;
  };
  const pendentes = com.destinos.filter((x) => !x.confirmado_em).length;
  return `<p class="suave"><a href="#/comunicacoes">← Comunicações</a></p>
    <div class="cabecalho"><h1>${esc(com.titulo)}</h1>${etiqueta(`prazo ${dataBr(com.prazo)}`, com.prazo < C.hojeIso() ? 'neutra' : 'aviso')}</div>
    ${!E.nuvem ? `<div class="alerta aviso">${SO_NUVEM}</div>` : ''}${erroNuvem ? `<div class="alerta aviso">Situação de agora não veio da nuvem: ${esc(erroNuvem)}</div>` : ''}
    ${gmailDesligado ? `<div class="alerta perigo"><b>O envio pelo Gmail está desligado.</b> Para confirmar, a pessoa recebe um código por e-mail: sem o Gmail ligado ninguém consegue confirmar, nem quem recebeu o link pelo WhatsApp. Ligue em Sistema → Comunicação E-mail → Conectar o Gmail.</div>` : ''}
    ${opera() && E.nuvem && nadaEnviado(com) ? `<p class="acoes">${link(`#/comunicacoes?ver=editar&id=${com.id}`, 'Corrigir prazo, telefone e textos', 'botao secundario pequeno')} ${botao('excluirComunicado', 'Excluir comunicado', { id: com.id }, 'perigo pequeno', `Excluir o comunicado "${com.titulo}"? Nada foi enviado ainda.`)}</p>` : ''}
    <div class="cartao"><div class="numeros-cartao">${quadro('Confirmaram', r.confirmaram, 'ok')}${quadro('Abriram', r.abriram)}${quadro('Não abriram', r.naoAbriram, r.naoAbriram ? 'perigo' : '')}${quadro('Não enviados', r.naoEnviados)}${quadro('Mudaram o contato', r.mudaram)}</div>
      ${opera() ? `<p class="acoes">${botao('emailTodosComunicado', '✉ Enviar e-mail a todos', { id: com.id }, 'pequeno')} ${botao('whatsTodosComunicado', 'WhatsApp a todos', { id: com.id })}
        ${pendentes && com.destinos.some((x) => !x.confirmado_em && (x.email_em || x.whats_em)) ? botao('lembrarComunicado', 'Lembrar quem falta', { id: com.id }) : ''} ${botao('previaComunicado', 'Ver como o inquilino vê', { id: com.id })} ${botao('atualizarComunicado', 'Atualizar situação', { id: com.id })}</p>` : ''}
      <p class="suave">"Enviar e-mail a todos" manda só para quem ainda não recebeu por e-mail. O WhatsApp abre a conversa de cada pessoa com a mensagem copiada: é só colar e enviar. Quem confirma tem o e-mail e o celular atualizados no cadastro (o anterior fica no Histórico).</p></div>
    <div class="cartao rolagem"><table><tr><th>Pessoa</th><th>Imóvel</th><th>Contatos no cadastro</th><th>Situação</th><th>Enviado</th><th></th></tr>${ordem.map(linha).join('')}</table></div>`;
}

/** Comprovante do aceite (para imprimir ou salvar em PDF). */
export function telaAceiteContatos(q = {}) {
  const com = buscar('comunicados', Number(q.id));
  const x = com && com.destinos.find((y) => y.chave === q.chave);
  if (!x || !x.resposta) return naoEncontrado('Aceite não encontrado', com ? `#/comunicacoes?id=${com.id}` : '#/comunicacoes', com ? 'Ver o comunicado' : 'Ver as comunicações');
  const r = x.resposta;
  const e = CM.empresasDoTopo(d());
  const linhas = [['Pessoa', `${x.nome}${CM.PAPEIS[x.tipo] ? ` (${CM.PAPEIS[x.tipo]})` : ''}`], ['Confirmado em', C.dataHoraBr(r.em)], ['E-mail', `${r.email} (confirmado por código enviado a ele)`],
    ['Celular', `${CM.telefoneBr(r.telefone)}${r.whatsapp ? ' (WhatsApp)' : ''}`], ['Melhor forma de contato', r.melhor], ['Aberto por', r.canal === 'whatsapp' ? 'link do WhatsApp' : r.canal === 'email' ? 'link do e-mail' : 'link direto'],
    ['Endereço de internet (IP)', r.ip || '-'], ['Aparelho', r.aparelho || '-'], ['Código do texto (SHA-256)', r.texto_sha256 || '-']];
  return `<p class="suave nao-imprimir"><a href="#/comunicacoes?id=${com.id}">← ${esc(com.titulo)}</a> · ${botao('imprimir', 'Imprimir / salvar em PDF', {}, 'pequeno')}</p>
    <div class="cartao folha-aceite">${d().logo ? `<p><img src="${esc(d().logo)}" alt="Logo" style="max-height:60px"></p>` : ''}
      <p><b>${esc(e.nomes.join(' e '))}</b>${e.cnpjs.length ? `<br><span class="suave">CNPJ ${esc(e.cnpjs.join(' · '))}</span>` : ''}</p>
      <h1>Comprovante de confirmação de contatos e ciência</h1>
      <table>${linhas.map(([a, b]) => `<tr><th style="text-align:left;width:34%">${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table>
      ${r.assinatura ? `<p><b>Assinatura na tela:</b><br><img src="${esc(r.assinatura)}" alt="Assinatura" style="max-width:320px;border-bottom:1px solid #999"></p>` : '<p class="suave">Sem assinatura desenhada (aceite pela caixa "Li e concordo" e pelo código no e-mail).</p>'}
      <h2>Texto que a pessoa leu e aceitou</h2><pre class="texto-modelo">${esc(r.texto_aceito || '')}</pre>
      ${(x.aberturas || []).length ? `<p class="suave">Aberturas do link: ${x.aberturas.map((a) => `${C.dataHoraBr(a.em)} (${a.canal === 'whatsapp' ? 'WhatsApp' : a.canal === 'email' ? 'e-mail' : 'direto'})`).join('; ')}.</p>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------
function exigir() {
  if (!opera()) throw new C.ErroUsuario(SO_CONSULTA);
  if (!E.nuvem) throw new C.ErroUsuario(SO_NUVEM);
}

/** O Gmail da empresa está ligado? (na dúvida, sem resposta, conta como ligado: o envio confere de novo) */
async function gmailLigado() {
  try { return !!(await GM.emailLigado()); } catch { return true; }
}

/** Antes de mandar link pelo WhatsApp (ou copiar): com o Gmail desligado o código não sai e ninguém consegue confirmar. */
async function seguirSemGmail() {
  if (await gmailLigado()) return true;
  return confirmar('O envio pelo Gmail está desligado: a pessoa abre o link, mas não recebe o código por e-mail e não consegue confirmar. Ligue o Gmail antes (Sistema → Comunicação E-mail → Conectar o Gmail). Mandar assim mesmo?', { titulo: 'Gmail desligado', sim: 'Mandar assim mesmo' });
}

/** O link da pessoa (cria na nuvem na primeira vez e guarda no comunicado). ``novo``: troca o link (o anterior deixa de valer). */
async function linkDe(com, x, { novo = false } = {}) {
  if (x.url && !novo) return x.url;
  const p = CM.pessoaDoDestino(d(), x);
  if (!p) throw new C.ErroUsuario(`${x.nome}: o contrato ou o fiador não está mais no cadastro.`);
  const { url } = await pedir('link', { method: 'POST', body: JSON.stringify({ comunicado_id: com.id, destino: x.chave, contexto: CM.contextoDoLink(d(), com, p, await logoReduzida()) }) });
  await alterar((db) => {
    const c = R.buscar(db, 'comunicados', com.id);
    R.atualizar(db, 'comunicados', c.id, { destinos: c.destinos.map((y) => (y.chave === x.chave ? { ...y, url, link_em: new Date().toISOString(), link_desligado_em: null } : { ...y })) }, login(), `Comunicado "${c.titulo}": ${novo ? 'link novo' : 'link'} de ${x.nome}`);
  });
  return url;
}

async function marcar(comId, chave, campo) {
  await alterar((db) => {
    const c = R.buscar(db, 'comunicados', comId);
    R.atualizar(db, 'comunicados', c.id, { destinos: c.destinos.map((y) => (y.chave === chave ? { ...y, [campo]: new Date().toISOString() } : { ...y })) }, login(), `Comunicado "${c.titulo}": ${campo === 'email_em' ? 'e-mail' : campo === 'whats_em' ? 'WhatsApp' : 'lembrete'} enviado`);
  });
}

/** Monta o e-mail de uma pessoa (texto e HTML com a logo). `lembrete`: o texto do lembrete no lugar do e-mail. */
async function emailDe(com, x, { lembrete = false } = {}) {
  const p = CM.pessoaDoDestino(d(), x);
  const url = CM.linkDoCanal(await linkDe(com, x), 'email');
  const dados = CM.camposDe(d(), com, p, url);
  const e = CM.empresasDoTopo(d());
  const logo = await logoReduzida();
  const texto = lembrete ? `${CM.preencher(com.lembrete, dados)}\n\n${CM.preencher('Atenciosamente,\n{empresas}', dados)}` : CM.preencher(com.texto, dados);
  const assunto = `${lembrete ? 'Lembrete: ' : ''}${CM.preencher(com.assunto, dados)}`;
  const html = CM.htmlDoEmail(lembrete ? texto.replace(url, `\n\n${url}\n\n`) : texto, { empresas: e.nomes, cnpjs: e.cnpjs, cidade: e.cidade, link: url, logo: !!logo });
  return { para: p.email, assunto, texto, html, imagens: imagemDaLogo(logo) };
}

async function enviarEmails(com, alvos, { lembrete = false } = {}) {
  if (!(await GM.emailLigado())) throw new C.ErroUsuario('O envio pelo Gmail não está ligado (Sistema → Comunicação E-mail → Conectar o Gmail).');
  // fora do horário comercial: agendar todos para o próximo horário (sai sozinho pela nuvem) ou enviar agora mesmo
  const quando = await perguntarQuando({ resumo: `${C.plural(alvos.length, 'e-mail', 'e-mails')} do comunicado "${com.titulo}".` });
  if (!quando) return { ok: 0, falhas: [], cancelado: true };
  const agendado = quando.modo === 'agendar' ? quando.rotulo : '';
  let ok = 0; const falhas = [];
  for (const [n, x] of alvos.entries()) {
    aviso(`Enviando ${n + 1} de ${alvos.length}: ${x.nome}…`, 'info');
    try {
      const m = await emailDe(buscar('comunicados', com.id), x, { lembrete });
      // dado faltando no cadastro (ex.: contrato "Sem imóvel"): não sai e-mail com buraco
      const buraco = /\[preencher: ([a-z_]+)\]/.exec(`${m.assunto}\n${m.texto}`);
      if (buraco) throw new C.ErroUsuario(`falta um dado no cadastro (${buraco[1]}): o e-mail não foi enviado`);
      if (agendado) {
        // quando sair, o Painel marca o e-mail (ou o lembrete) da pessoa com a hora de verdade (agendados.js, aplicarEfeitos)
        const registro = { chave: lembrete ? 'comunicado_lembrete' : 'comunicado', contrato_id: x.contrato_id || null, ficha_id: null, aditivo_id: null, comunicado_id: com.id, para: m.para, assunto: m.assunto, usuario: login(),
          efeito: { tipo: 'comunicado', comunicado_id: com.id, destino: x.chave, campo: lembrete ? 'lembrete_em' : 'email_em' } };
        const r = await GM.agendarEmail({ ...m, quando: quando.quando, registro, descricao: `Comunicado "${com.titulo}" · ${x.nome}` });
        await alterar((db) => {
          const c = R.buscar(db, 'comunicados', com.id);
          R.atualizar(db, 'comunicados', c.id, { destinos: c.destinos.map((y) => (y.chave === x.chave ? { ...y, agendado_id: r.id, agendado_para: r.quando } : { ...y })) }, login(), `Comunicado "${c.titulo}": e-mail de ${x.nome} agendado para ${agendado}`);
        });
      } else {
        await GM.enviarEmail(m);
        await marcar(com.id, x.chave, lembrete ? 'lembrete_em' : 'email_em');
      }
      ok += 1;
    } catch (e) { falhas.push(`${x.nome}: ${e.message}`); }
  }
  return { ok, falhas, agendado };
}

/** Janela do WhatsApp: a pessoa da vez, com a mensagem para copiar e o botão que abre a conversa; "Próximo" segue a fila. */
async function filaWhatsapp(comId, fila, { lembrete = false } = {}) {
  for (let i = 0; i < fila.length; i += 1) {
    const com = buscar('comunicados', comId);
    const x = com.destinos.find((y) => y.chave === fila[i].chave);
    const p = x ? CM.pessoaDoDestino(d(), x) : null;
    if (!p) continue; // contrato ou fiador excluído depois do envio: pula
    if (CM.preencher(lembrete ? com.lembrete : com.whatsapp, CM.camposDe(d(), com, p, 'x')).includes('[preencher: ')) {
      aviso(`${x.nome}: falta um dado no cadastro (a mensagem sairia com "[preencher: …]"). Pulado.`, 'aviso');
      continue;
    }
    const tel = p ? CM.telefoneWhats(p.telefone) : '';
    const url = CM.linkDoCanal(await linkDe(com, x), 'whatsapp');
    const texto = CM.preencher(lembrete ? com.lembrete : com.whatsapp, CM.camposDe(d(), com, p, url));
    let abriu = false;
    const resp = await janela({
      titulo: `WhatsApp ${i + 1} de ${fila.length}: ${x.nome}${CM.PAPEIS[x.tipo] ? ` (${CM.PAPEIS[x.tipo]})` : ''}`, sim: i + 1 < fila.length ? 'Próximo' : 'Terminar', nao: 'Parar',
      html: `${avisoForaDoHorario()}<p><textarea rows="6" readonly data-texto style="width:100%">${esc(texto)}</textarea></p>
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
    if (abriu) await marcar(comId, x.chave, lembrete ? 'lembrete_em' : 'whats_em');
    if (!resp) break;
  }
  await mostrar();
}

export const ACOES_COMUNICACOES = {
  async atualizarComunicado({ id }) {
    exigir();
    const n = await atualizarDaNuvem(Number(id), { forcar: true });
    aviso(n ? `${n} cadastro(s) atualizado(s) com os contatos confirmados.` : 'Situação atualizada.');
    await mostrar();
  },
  async emailTodosComunicado({ id }) {
    exigir();
    const com = buscar('comunicados', Number(id));
    // só quem continua no cadastro (contrato ativo, fiador ainda fiador), como no lembrete
    const { alvos, sem, fora } = CM.filaDoEnvio(d(), com, 'email');
    const saiu = fora ? ` ${fora} pessoa(s) que não confirmaram ficam de fora: já saíram (contrato encerrado, fiador trocado ou excluído).` : '';
    if (!alvos.length) { aviso(`Não há e-mail para enviar: ${sem.length ? `${sem.length} pessoa(s) sem e-mail no cadastro (use o WhatsApp)` : 'todos já receberam'}.${saiu}`, 'info'); return; }
    if (!(await confirmar(`Enviar o e-mail com o link para ${alvos.length} pessoa(s)?${sem.length ? ` ${sem.length} sem e-mail ficam para o WhatsApp.` : ''}${saiu}`, { titulo: 'Enviar e-mail a todos', sim: 'Enviar' }))) return;
    const { ok, falhas, agendado, cancelado } = await enviarEmails(com, alvos);
    if (cancelado) return;
    if (falhas.length) await janela({ titulo: `${ok} ${agendado ? 'agendado(s)' : 'enviado(s)'}, ${falhas.length} com problema`, sim: 'Fechar', nao: null, html: `<ul>${falhas.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` });
    else aviso(agendado ? `${ok} e-mail(s) agendado(s) para ${agendado}: saem sozinhos pela nuvem.` : `${ok} e-mail(s) enviado(s).`);
    await mostrar();
  },
  async emailComunicado({ id, chave }) {
    exigir();
    const com = buscar('comunicados', Number(id));
    const x = com.destinos.find((y) => y.chave === chave);
    if (!(CM.pessoaDoDestino(d(), x) || {}).email) throw new C.ErroUsuario(`${x.nome} não tem e-mail no cadastro. Use o WhatsApp ou copie o link.`);
    const { ok, falhas, agendado, cancelado } = await enviarEmails(com, [x], { lembrete: !!x.email_em });
    if (cancelado) return;
    if (falhas.length) throw new C.ErroUsuario(falhas[0]);
    aviso(ok ? (agendado ? `E-mail para ${x.nome} agendado para ${agendado}: sai sozinho pela nuvem.` : `E-mail enviado para ${x.nome}.`) : 'Nada enviado.');
    await mostrar();
  },
  async whatsTodosComunicado({ id }) {
    exigir();
    const com = buscar('comunicados', Number(id));
    const { alvos: fila, fora } = CM.filaDoEnvio(d(), com, 'whats');
    if (!fila.length) { aviso(`Todos já receberam pelo WhatsApp (ou já confirmaram).${fora ? ` ${fora} pessoa(s) que não confirmaram ficam de fora: já saíram.` : ''}`, 'info'); return; }
    if (!(await seguirSemGmail())) return;
    await filaWhatsapp(com.id, fila);
  },
  async whatsComunicado({ id, chave }) {
    exigir();
    const com = buscar('comunicados', Number(id));
    const x = com.destinos.find((y) => y.chave === chave);
    if (!(await seguirSemGmail())) return;
    await filaWhatsapp(com.id, [x], { lembrete: !!x.whats_em });
  },
  async lembrarComunicado({ id }) {
    exigir();
    const com = buscar('comunicados', Number(id));
    const recebeu = com.destinos.filter((x) => !x.confirmado_em && (x.email_em || x.whats_em));
    // só quem ainda está no cadastro, com o contrato ativo (e o fiador ainda fiador): ex-inquilino não recebe lembrete
    const falta = recebeu.filter((x) => CM.destinoAtivo(d(), x));
    const fora = recebeu.length - falta.length;
    if (!falta.length) { aviso(fora ? `Ninguém para lembrar: ${fora} pessoa(s) que não confirmaram já saíram (contrato encerrado, fiador trocado ou excluído).` : 'Ninguém para lembrar: mande primeiro o e-mail ou o WhatsApp.', 'info'); return; }
    const porEmail = falta.filter((x) => (CM.pessoaDoDestino(d(), x) || {}).email);
    const resp = await janela({
      titulo: `Lembrar ${falta.length} pessoa(s) que não confirmaram`, sim: 'Lembrar', nao: 'Cancelar',
      html: `<p><label><input type="checkbox" name="email" value="1" checked> Por e-mail (${porEmail.length})</label></p><p><label><input type="checkbox" name="whats" value="1" checked> Pelo WhatsApp, um por um (${falta.length})</label></p>
        ${fora ? `<p class="suave">${fora} pessoa(s) que não confirmaram ficam de fora: já saíram (contrato encerrado, fiador trocado ou excluído).</p>` : ''}`,
    });
    if (!resp) return;
    if (resp.email && porEmail.length) {
      const { ok, falhas, agendado, cancelado } = await enviarEmails(com, porEmail, { lembrete: true });
      if (!cancelado) aviso(`${ok} lembrete(s) por e-mail${agendado ? ` agendado(s) para ${agendado}` : ''}${falhas.length ? `; ${falhas.length} com problema` : ''}.`, falhas.length ? 'aviso' : 'ok');
    }
    if (resp.whats && (await seguirSemGmail())) await filaWhatsapp(com.id, falta, { lembrete: true });
    else await mostrar();
  },
  async linkComunicado({ id, chave }) {
    exigir();
    const com = buscar('comunicados', Number(id));
    const x = com.destinos.find((y) => y.chave === chave);
    if (!(await seguirSemGmail())) return;
    const url = await linkDe(com, x);
    await janela({ titulo: `Link de ${x.nome}`, sim: 'Fechar', nao: null, html: `<p>É só desta pessoa: não publique.</p><p><textarea rows="3" readonly style="width:100%">${esc(url)}</textarea></p>` });
    await mostrar();
  },
  /** Link novo para a pessoa (o anterior deixa de valer; a contagem de códigos recomeça). */
  async novoLinkComunicado({ id, chave }) {
    exigir();
    const com = buscar('comunicados', Number(id));
    const x = com && com.destinos.find((y) => y.chave === chave);
    if (!x) throw new C.ErroUsuario('Pessoa não encontrada no comunicado.');
    const url = await linkDe(com, x, { novo: true });
    await janela({ titulo: `Link novo de ${x.nome}`, sim: 'Fechar', nao: null, html: `<p>O link anterior deixou de valer. Mande este (é só desta pessoa: não publique).</p><p><textarea rows="3" readonly style="width:100%">${esc(url)}</textarea></p>` });
    await mostrar();
  },
  /** Desliga o link mandado (ex.: à pessoa errada): ela não abre mais; para mandar de novo, o sistema gera outro. */
  async desligarLinkComunicado({ id, chave }) {
    exigir();
    const com = buscar('comunicados', Number(id));
    const x = com && com.destinos.find((y) => y.chave === chave);
    if (!x) throw new C.ErroUsuario('Pessoa não encontrada no comunicado.');
    await pedir('encerrar', { method: 'POST', body: JSON.stringify({ comunicado_id: com.id, destino: x.chave }) });
    await alterar((db) => {
      const c = R.buscar(db, 'comunicados', com.id);
      R.atualizar(db, 'comunicados', c.id, { destinos: c.destinos.map((y) => (y.chave === x.chave ? { ...y, url: null, link_desligado_em: new Date().toISOString() } : { ...y })) }, login(), `Comunicado "${c.titulo}": link de ${x.nome} desligado`);
    });
    aviso(`Link de ${x.nome} desligado.`);
    await mostrar();
  },
  /** Excluir o comunicado enquanto nada foi enviado (os links gerados são desligados na nuvem). */
  async excluirComunicado({ id }) {
    exigir();
    const com = buscar('comunicados', Number(id));
    if (!com) throw new C.ErroUsuario('Este comunicado já foi excluído.');
    if (!nadaEnviado(com)) throw new C.ErroUsuario('Este comunicado já foi enviado (ou alguém já abriu o link): não dá para excluir.');
    for (const x of com.destinos.filter((y) => y.url)) await pedir('encerrar', { method: 'POST', body: JSON.stringify({ comunicado_id: com.id, destino: x.chave }) }).catch(() => {});
    await alterar((db) => { if (R.buscar(db, 'comunicados', com.id)) R.excluir(db, 'comunicados', com.id, login(), `Comunicado "${com.titulo}" excluído (nada tinha sido enviado)`); });
    aviso('Comunicado excluído.');
    ir('#/comunicacoes');
  },
  async previaComunicado({ id }) {
    const com = buscar('comunicados', Number(id));
    const x = com.destinos.find((y) => CM.pessoaDoDestino(d(), y));
    if (!x) throw new C.ErroUsuario('Nenhuma pessoa do comunicado está no cadastro.');
    const p = CM.pessoaDoDestino(d(), x);
    const exemplo = 'https://ficha.ankjck.com.br/contatos#exemplo';
    const dados = CM.camposDe(d(), com, p, exemplo);
    const e = CM.empresasDoTopo(d());
    const logo = await logoReduzida();
    const html = CM.htmlDoEmail(CM.preencher(com.texto, dados), { empresas: e.nomes, cnpjs: e.cnpjs, cidade: e.cidade, link: exemplo, logo: !!logo }).replace('cid:logo', logo);
    const ctx = CM.contextoDoLink(d(), com, p, logo);
    await janela({
      titulo: `Prévia (com os dados de ${x.nome})`, sim: 'Fechar', nao: null,
      html: `<p><b>Assunto:</b> ${esc(CM.preencher(com.assunto, dados))}</p>
        <iframe sandbox title="Prévia do e-mail" style="width:100%;height:420px;border:1px solid var(--borda);border-radius:8px;background:#fff" srcdoc="${esc(html)}"></iframe>
        <h3>WhatsApp</h3><pre class="texto-modelo">${esc(CM.preencher(com.whatsapp, dados))}</pre>
        <h3>Página do link</h3><div class="cartao" style="margin:0">${logo ? `<p style="text-align:center"><img src="${esc(logo)}" alt="Logo" style="max-height:70px"></p>` : ''}
          <p style="text-align:center"><b>${esc(ctx.empresas.join(' e '))}</b><br><span class="suave">CNPJ ${esc(ctx.cnpjs.join(' · '))}${ctx.cidade ? ` · ${esc(ctx.cidade)}` : ''}</span></p>
          <p><b>Olá, ${esc(String(ctx.nome).split(' ')[0])}</b> <span class="suave">· ${esc(ctx.imovel)}${ctx.desde ? ` · contrato desde ${esc(ctx.desde)}` : ''}</span></p>
          <pre class="texto-modelo">${esc(ctx.aviso)}</pre><p class="suave">Depois: e-mail, celular, se é WhatsApp, melhor forma de contato, o código enviado ao e-mail, a caixa abaixo e a assinatura com o dedo (opcional).</p>
          <p>☐ ${esc(ctx.ciencia)}</p></div>`,
    });
  },
};

export const FORMULARIOS_COMUNICACOES = {
  async criarComunicado(form) {
    if (!opera()) throw new C.ErroUsuario(SO_CONSULTA);
    if (!E.nuvem) throw new C.ErroUsuario(SO_NUVEM);
    const f = new FormData(form);
    const prazo = C.dataValida(String(f.get('prazo') || ''), '');
    if (!prazo || prazo < C.hojeIso()) throw new C.ErroUsuario('Escolha um prazo de hoje em diante.');
    const email = String(f.get('email_empresa') || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new C.ErroUsuario('Confira o e-mail da empresa.');
    const tel = String(f.get('telefone_empresa') || '').trim();
    if (String(tel).replace(/\D/g, '').length < 10) throw new C.ErroUsuario('Informe o telefone da empresa com DDD.');
    const editarId = Number(f.get('id') || 0);
    if (editarId) {
      // correção enquanto nada foi enviado: prazo, telefone, e-mail e textos; os links já gerados saem (são feitos de novo no envio)
      const antes = buscar('comunicados', editarId);
      if (!antes) throw new C.ErroUsuario('Este comunicado foi excluído.');
      if (!nadaEnviado(antes)) throw new C.ErroUsuario('Este comunicado já foi enviado (ou alguém já abriu o link): não dá mais para mudar.');
      const textos = Object.fromEntries(['titulo', 'assunto', 'texto', 'whatsapp', 'lembrete', 'aviso', 'ciencia'].map((k) => [k, String(f.get(k) || '').trim() || antes[k]]));
      for (const x of antes.destinos.filter((y) => y.url)) await pedir('encerrar', { method: 'POST', body: JSON.stringify({ comunicado_id: antes.id, destino: x.chave }) }).catch(() => {});
      await alterar((db) => {
        const c = R.buscar(db, 'comunicados', editarId);
        R.atualizar(db, 'comunicados', c.id, { ...textos, prazo, email_empresa: email, telefone_empresa: CM.telefoneBr(tel), destinos: c.destinos.map(({ url, link_em, ...y }) => y) }, login(), `Comunicado "${textos.titulo}" corrigido antes do envio`); // eslint-disable-line no-unused-vars
      });
      guardadas.delete(editarId);
      aviso('Comunicado corrigido. Confira a prévia e envie.');
      ir(`#/comunicacoes?id=${editarId}`);
      return;
    }
    const base = CM.novoComunicado(d(), String(f.get('modelo') || 'contatos'), { prazo, email_empresa: email, telefone_empresa: CM.telefoneBr(tel) });
    if (!base.destinos.length) throw new C.ErroUsuario('Não há inquilino com contrato ativo hoje.');
    for (const k of ['titulo', 'assunto', 'texto', 'whatsapp', 'lembrete', 'aviso', 'ciencia']) { const v = String(f.get(k) || '').trim(); if (v) base[k] = v; }
    const com = await alterar((db) => R.inserir(db, 'comunicados', { ...base, criado_por: login() }, login(), `Comunicado "${base.titulo}" para ${base.destinos.length} pessoa(s)`));
    aviso('Comunicado criado. Confira a prévia e envie.');
    ir(`#/comunicacoes?id=${com.id}`);
  },
};
