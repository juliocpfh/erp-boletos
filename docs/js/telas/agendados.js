// Tela "Envios agendados" (#/envios-agendados, pedido do dono de 25/11/2026): a lista dos e-mails agendados na nuvem
// (gmail.js: listaAgendados), com "Mudar a hora", "Tentar de novo" e "Cancelar"; e o aviso do Painel (preencherAvisoAgendados).
// As regras (situações, texto do dia e hora, efeitos de quem já saiu) ficam em agendados.js; o envio é da nuvem (nuvem/agendados.mjs).
import { alterar, aviso, confirmar, E, janela, login, mostrar } from '../app.js';
import * as AG from '../agendados.js';
import * as C from '../calculos.js';
import { esc } from '../formularios.js';
import * as GM from '../gmail.js';
import { botao, d, etiqueta, link, opera } from './comum.js';

const SO_NUVEM = 'Agendar e-mails só existe no sistema na nuvem (pela internet, com o Gmail ligado). Nesta versão os e-mails saem na hora, pelo botão de cada tela.';
const COR_SITUACAO = { agendado: 'aviso', enviando: 'aviso', enviado: 'ok', falhou: 'perigo', cancelado: 'neutra' };
const ABERTOS = new Set(['agendado', 'falhou']);

/** Efeitos de envios que a nuvem já fez e este aparelho ainda não aplicou (marcar a notificação como enviada etc.). */
async function aplicarPendentes() {
  if (!opera() || !AG.efeitosPendentes(d()).length) return 0;
  let n = 0;
  await alterar((db) => { n = AG.aplicarEfeitos(db, login()); });
  return n;
}

function linhaAgendado(x) {
  const sit = AG.SITUACOES_AGENDADO[x.situacao] || x.situacao || '-';
  const anexos = Array.isArray(x.anexos) && x.anexos.length ? `<br><span class="suave">Anexos: ${x.anexos.map(esc).join(', ')}</span>` : '';
  const erro = (x.situacao === 'falhou' || x.situacao === 'agendado') && x.erro ? `<br><span class="suave">${esc(x.erro)}</span>` : '';
  const quando = x.situacao === 'enviado' && x.enviado_em ? `${AG.quandoBr(x.enviado_em)}<br><span class="suave">marcado para ${AG.quandoBr(x.quando)}</span>`
    : x.situacao === 'cancelado' && x.cancelado_em ? `<s>${AG.quandoBr(x.quando)}</s><br><span class="suave">cancelado em ${C.dataBrDe(x.cancelado_em)}</span>` : AG.quandoBr(x.quando);
  const botoes = opera() && ABERTOS.has(x.situacao)
    ? `<span class="nw">${botao('mudarHoraAgendado', x.situacao === 'falhou' ? 'Tentar de novo' : 'Mudar a hora', { id: x.id })} ${botao('cancelarAgendado', 'Cancelar', { id: x.id })}</span>` : '';
  return `<tr><td>${quando}</td><td>${esc(x.para || '-')}</td><td>${esc(x.descricao || x.assunto || '-')}${x.descricao && x.assunto ? `<br><span class="suave">${esc(x.assunto)}</span>` : ''}${anexos}</td>
    <td>${etiqueta(sit, COR_SITUACAO[x.situacao] || 'neutra')}${erro}</td><td>${esc(x.por || '-')}</td><td>${botoes}</td></tr>`;
}

/** Tela "Envios agendados". */
export async function telaEnviosAgendados() {
  const topo = '<p class="suave"><a href="#/comunicacoes">← Comunicações</a></p><div class="cabecalho"><h1>Envios agendados</h1></div>';
  if (!E.nuvem) return `${topo}<div class="alerta info">${SO_NUVEM}</div>`;
  const aplicados = await aplicarPendentes().catch((e) => { aviso(`Envios agendados: ${e.message}`, 'aviso'); return 0; });
  const lista = await GM.listaAgendados();
  if (lista === null) return `${topo}<div class="alerta aviso">Não foi possível ler a lista na nuvem (sem internet ou acesso vencido). Tente de novo daqui a pouco.</div>`;
  // primeiro os que ainda vão sair (do mais próximo), depois os que já saíram ou foram cancelados (do mais recente)
  const abertos = lista.filter((x) => ['agendado', 'enviando', 'falhou'].includes(x.situacao)).sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
  const fechados = lista.filter((x) => !['agendado', 'enviando', 'falhou'].includes(x.situacao)).sort((a, b) => String(b.enviado_em || b.cancelado_em || b.quando).localeCompare(String(a.enviado_em || a.cancelado_em || a.quando)));
  const cab = '<tr><th>Quando</th><th>Para</th><th>O quê</th><th>Situação</th><th>Quem agendou</th><th></th></tr>';
  const tabela = (l) => `<table>${cab}${l.map(linhaAgendado).join('')}</table>`;
  const avisos = AG.avisosDoPainel(lista).filter((a) => a.tipo === 'erro').map((a) => `<div class="alerta erro">${esc(a.texto)}</div>`).join('');
  return `${topo}
    <p class="suave">E-mails marcados para sair mais tarde (fora do horário comercial). A nuvem envia sozinha na hora marcada, mesmo com o computador desligado.</p>
    ${aplicados ? `<div class="alerta ok">${C.plural(aplicados, 'envio já feito pela nuvem foi anotado', 'envios já feitos pela nuvem foram anotados')} no sistema.</div>` : ''}
    ${avisos}
    ${abertos.length ? `<div class="cartao"><h2>Esperando a hora</h2>${tabela(abertos)}</div>` : '<div class="cartao"><p>Nenhum e-mail agendado esperando a hora.</p></div>'}
    ${fechados.length ? `<div class="cartao"><h2>Já enviados ou cancelados</h2>${tabela(fechados)}</div>` : ''}
    ${!lista.length ? '<p class="suave">Nenhum e-mail agendado ainda. Ex.: um e-mail mandado no sábado às 21h pode ser agendado para segunda às 08:00.</p>' : ''}`;
}

/** Hora de Brasília (datetime-local, "2026-11-30T08:00") → instante ISO. Ex.: '2026-11-30T08:00' → '2026-11-30T11:00:00.000Z'. */
const instanteDeBrasilia = (v) => {
  const t = new Date(`${v}:00-03:00`);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};
/** Instante ISO → valor do datetime-local em Brasília. */
const campoDeBrasilia = (iso) => {
  const t = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return Number.isNaN(t.getTime()) ? '' : t.toISOString().slice(0, 16);
};

export const ACOES_AGENDADOS = {
  async mudarHoraAgendado({ id }) {
    const lista = (await GM.listaAgendados()) || [];
    const x = lista.find((y) => y.id === id);
    if (!x) throw new C.ErroUsuario('Este agendado não está mais na lista. Recarregue a tela.');
    const futuro = Date.now() + 5 * 60 * 1000;
    const inicial = x.situacao === 'falhou' || new Date(x.quando).getTime() < futuro ? campoDeBrasilia(new Date(futuro).toISOString()) : campoDeBrasilia(x.quando);
    const r = await janela({
      titulo: x.situacao === 'falhou' ? 'Tentar de novo' : 'Mudar a hora',
      html: `<p>${esc(x.descricao || x.assunto || '')} para <b>${esc(x.para || '')}</b>.</p>
        <label>Novo dia e hora (hora de Brasília)<input type="datetime-local" name="quando" value="${esc(inicial)}" required></label>`,
      sim: 'Salvar',
    });
    if (!r) return;
    const quando = instanteDeBrasilia(String((r.quando || [''])[0]));
    if (!quando) throw new C.ErroUsuario('Informe o dia e a hora.');
    if (new Date(quando).getTime() <= Date.now()) throw new C.ErroUsuario('Escolha um dia e hora que ainda não passaram.');
    const novo = await GM.mudarAgendado(id, quando);
    aviso(`E-mail agendado para ${AG.quandoBr((novo && novo.quando) || quando)}.`);
    await mostrar();
  },
  async cancelarAgendado({ id }) {
    const lista = (await GM.listaAgendados()) || [];
    const x = lista.find((y) => y.id === id);
    const qual = x ? `${x.descricao || x.assunto} para ${x.para}, marcado para ${AG.quandoBr(x.quando)}` : 'este e-mail';
    if (!(await confirmar(`Cancelar o envio de ${qual}?\n\nO e-mail não será enviado. Se quiser mandar depois, envie de novo pela tela de origem.`, { titulo: 'Cancelar o envio agendado', sim: 'Cancelar o envio', nao: 'Voltar', forte: true }))) return;
    const r = await GM.cancelarAgendado(id);
    if (r && r.registro) await alterar((db) => { AG.desfazerAgendamento(db, r.registro, id, login()); });
    aviso('Envio agendado cancelado.');
    await mostrar();
  },
};

/** Aviso do Painel: agendados esperando e os que não saíram (só na nuvem, para quem opera); aplica os efeitos pendentes. */
export function preencherAvisoAgendados() {
  if (!E.nuvem || !opera()) return;
  aplicarPendentes().catch(() => { /* tenta de novo na próxima abertura */ });
  GM.listaAgendados().then((lista) => {
    const el = document.getElementById('aviso-agendados');
    const l = AG.avisosDoPainel(lista);
    if (!el || !l.length) return;
    el.innerHTML = l.map((a) => `<div class="alerta ${a.tipo === 'erro' ? 'erro' : 'info'}">${esc(a.texto)} ${link('#/envios-agendados', 'Ver os envios agendados', 'botao pequeno')}</div>`).join('');
  }).catch(() => { /* sem internet: o aviso volta na próxima abertura */ });
}
