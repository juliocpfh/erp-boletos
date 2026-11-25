// E-mails agendados, do lado das regras (puro: sem tela e sem nuvem). O envio em si é da nuvem (nuvem/agendados.mjs): quando
// o e-mail sai, o cron grava em `envios_email` o registro que a tela preparou ao agendar, com `agendado_id` e, às vezes, um
// `efeito` (o que o "Enviar agora" faria na hora: marcar a notificação como enviada, a decisão da régua, o comunicado, a
// carta de reajuste). O primeiro aparelho que abrir o Painel aplica o efeito (`aplicarEfeitos`) com a data do envio de verdade.
// Cancelar um agendado desfaz o que foi marcado ao agendar (`desfazerAgendamento`). Pedido do dono de 25/11/2026.
import * as C from './calculos.js';
import * as R from './regras.js';

/** O que cada situação da nuvem quer dizer, para a tela. */
export const SITUACOES_AGENDADO = { agendado: 'Agendado', enviando: 'Saindo agora', enviado: 'Enviado', falhou: 'Não saiu', cancelado: 'Cancelado' };

/** Dia e hora de Brasília de um instante: "sábado, 28/11/2026, às 08:00". */
export function quandoBr(instante) {
  const t = new Date(instante);
  if (Number.isNaN(t.getTime())) return '-';
  const dia = C.dataDeBrasilia(t);
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t);
  return `${C.DIAS_DA_SEMANA[C.paraData(dia).getUTCDay()]}, ${C.dataBr(dia)}, às ${hora}`;
}

/**
 * Avisos do Painel a partir da lista da nuvem: quantos esperam e quais não saíram. Ex.: 2 agendados e 1 com falha →
 * [{ tipo: 'erro', texto: '1 e-mail agendado não saiu: …' }, { tipo: 'info', texto: '2 e-mails agendados: o próximo sai …' }].
 */
export function avisosDoPainel(lista) {
  const l = Array.isArray(lista) ? lista : [];
  const falhas = l.filter((x) => x.situacao === 'falhou');
  const esperando = l.filter((x) => x.situacao === 'agendado' || x.situacao === 'enviando').sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
  const out = [];
  if (falhas.length) {
    out.push({ tipo: 'erro', texto: `${C.plural(falhas.length, 'e-mail agendado não saiu', 'e-mails agendados não saíram')}: ${falhas.slice(0, 3).map((x) => `${x.descricao || x.assunto} (para ${x.para}): ${x.erro || 'erro no envio'}`).join('; ')}${falhas.length > 3 ? '…' : ''}. Abra Envios agendados para tentar de novo ou cancelar.` });
  }
  if (esperando.length) out.push({ tipo: 'info', texto: `${C.plural(esperando.length, 'e-mail agendado', 'e-mails agendados')}: o próximo sai ${quandoBr(esperando[0].quando)} (${esperando[0].descricao || esperando[0].assunto}, para ${esperando[0].para}).` });
  return out;
}

/** Envios feitos pela nuvem com efeito ainda não aplicado. */
export const efeitosPendentes = (d) => (d.envios_email || []).filter((x) => x.agendado_id && x.efeito && typeof x.efeito === 'object' && !x.efeito_feito);

/**
 * Aplica o efeito de cada envio agendado que já saiu (com a data do envio, `data` do registro, que é a de Brasília). Cada efeito
 * confere o estado antes (outro aparelho pode ter aplicado): nada repete. Devolve quantos foram aplicados.
 */
export function aplicarEfeitos(d, usuario) {
  let n = 0;
  for (const e of efeitosPendentes(d)) {
    const ef = e.efeito;
    try {
      if (ef.tipo === 'notificacao') {
        const no = R.buscar(d, 'notificacoes', ef.notificacao_id);
        if (no && no.situacao === 'Rascunho' && e.data >= no.data) R.marcarNotificacaoEnviada(d, no.id, { data: e.data, meio: 'E-mail' }, usuario);
      } else if (ef.tipo === 'regua') {
        const dec = R.buscar(d, 'regua_emails', ef.decisao_id);
        if (dec && dec.situacao === 'agendado') R.atualizar(d, 'regua_emails', dec.id, { situacao: 'enviado', data: e.data, envio_id: e.id }, usuario, `Régua de cobrança: e-mail agendado enviado pela nuvem para ${e.para || ''}`);
      } else if (ef.tipo === 'comunicado') {
        const com = R.buscar(d, 'comunicados', ef.comunicado_id);
        const campo = ef.campo === 'lembrete_em' ? 'lembrete_em' : 'email_em';
        if (com && (com.destinos || []).some((y) => y.chave === ef.destino && y.agendado_id === e.agendado_id)) {
          R.atualizar(d, 'comunicados', com.id, { destinos: com.destinos.map((y) => (y.chave === ef.destino ? { ...semAgendado(y), [campo]: e.enviado_em || `${e.data}T12:00:00.000Z` } : { ...y })) }, usuario,
            `Comunicado "${com.titulo}": ${campo === 'email_em' ? 'e-mail' : 'lembrete'} agendado enviado pela nuvem`);
        }
      } else if (ef.tipo === 'carta') {
        const c = R.buscar(d, 'contratos', ef.contrato_id);
        if (c && !(d.cartas_reajuste || []).some((x) => x.contrato_id === c.id && x.competencia === ef.comp)) {
          R.marcarCartaEnviada(d, c.id, ef.comp, true, usuario);
          const carta = d.cartas_reajuste.find((x) => x.contrato_id === c.id && x.competencia === ef.comp);
          if (carta) R.atualizar(d, 'cartas_reajuste', carta.id, { enviada_em: e.data, ...(ef.arquivo ? { arquivo: ef.arquivo } : {}) }, usuario, 'Carta de reajuste enviada pela nuvem (e-mail agendado)');
        }
      }
    } catch (erro) {
      // efeito que não pôde ser aplicado (ex.: a notificação mudou de data) não segura os outros; fica anotado no envio
      R.atualizar(d, 'envios_email', e.id, { efeito_erro: String(erro.message || erro).slice(0, 200) }, usuario, null);
    }
    R.atualizar(d, 'envios_email', e.id, { efeito_feito: true }, usuario, null);
    n += 1;
  }
  return n;
}

const semAgendado = (y) => { const z = { ...y }; delete z.agendado_id; delete z.agendado_para; return z; };

/**
 * Cancelado na nuvem: desfaz o que foi marcado ao agendar (a decisão "agendado" da régua sai e o e-mail volta à fila; o
 * comunicado volta a mostrar a pessoa como "falta o e-mail"). `registro`: o que a nuvem devolveu do agendado.
 */
export function desfazerAgendamento(d, registro, agendadoId, usuario) {
  const ef = registro && registro.efeito;
  if (!ef) return false;
  if (ef.tipo === 'regua') {
    const dec = R.buscar(d, 'regua_emails', ef.decisao_id);
    if (dec && dec.situacao === 'agendado') { R.excluir(d, 'regua_emails', dec.id, usuario, 'Régua de cobrança: e-mail agendado cancelado (volta à lista)'); return true; }
  }
  if (ef.tipo === 'comunicado') {
    const com = R.buscar(d, 'comunicados', ef.comunicado_id);
    if (com && (com.destinos || []).some((y) => y.chave === ef.destino && y.agendado_id === agendadoId)) {
      R.atualizar(d, 'comunicados', com.id, { destinos: com.destinos.map((y) => (y.chave === ef.destino ? semAgendado(y) : { ...y })) }, usuario, `Comunicado "${com.titulo}": e-mail agendado cancelado`);
      return true;
    }
  }
  return false;
}

/** Quem tem um e-mail do comunicado agendado (não entra de novo no "Enviar a todos"). */
export const destinoAgendado = (x) => !!(x && x.agendado_id);

