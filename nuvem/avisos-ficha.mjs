// Avisos da ficha pela internet (pedido do dono em 2026-11-14: "notificar via e-mail e/ou celular a cada etapa"):
// - para a pessoa (e-mail pelo Gmail da empresa): recebemos seus dados, recebemos a ficha assinada, recebemos seu aviso de
//   desistência, falta documento, a ficha está pronta para assinar. O link não vai no e-mail (o servidor não guarda a chave):
//   o texto pede para abrir o mesmo link que a pessoa recebeu.
// - para a equipe: e-mail na caixa da empresa (AVISOS_EQUIPE, ou o próprio remetente do Gmail) e aviso no celular
//   (push.mjs), quando a pessoa manda os dados, o primeiro documento, a ficha assinada ou desiste.
// Sem o Gmail ligado, os e-mails não saem; sem as chaves VAPID, o aviso no celular não sai: o Painel continua avisando.
import { contaGuardada, emailValido, enviarEmail, estadoEmail } from './gmail.mjs';
import { avisarAparelhos } from './push.mjs';

const primeiro = (n) => String(n || '').trim().split(/\s+/)[0] || '';

/**
 * E-mail da pessoa do link: só o que a equipe pôs na ficha (o digitado no link não vale: quem tem o link faria o Gmail da
 * empresa escrever para um endereço qualquer). Sem e-mail na ficha, a pessoa não recebe o aviso por e-mail.
 */
export function emailDaPessoa(registro) {
  const campo = registro.pessoa === 'interessado' ? 'inquilino_email' : `${registro.pessoa}_email`;
  const e = String((registro.valores_iniciais || {})[campo] || '').trim();
  return emailValido(e) ? e : '';
}

/** Aviso no celular aparece na tela bloqueada: sem nome nem imóvel (LGPD); o detalhe aparece ao abrir a ficha. */
export const AVISO_CELULAR = { titulo: 'Ficha pela internet', texto: 'Chegou novidade por um link de ficha. Toque para abrir.' };

/**
 * Textos dos avisos de um evento: { pessoa: { assunto, texto } | null, equipe: { titulo, texto } | null }.
 * Eventos: enviou, documento, assinou, desistiu (da pessoa); falta, assinar (da equipe, pelo sistema).
 */
export function textosDoAviso(registro, evento, detalhe = '') {
  const c = registro.contexto || {};
  const nome = c.nome || 'interessado';
  const quem = `${nome}${registro.pessoa === 'interessado' ? '' : ' (fiador)'}`;
  const ola = `Olá${primeiro(nome) ? `, ${primeiro(nome)}` : ''}!`;
  const fecho = `\n\nAgradecemos e ficamos à disposição em caso de dúvidas.\n\nAtenciosamente,\n${c.empresa || 'Administradora'}`;
  const imovel = c.imovel ? ` (${c.imovel})` : '';
  const qual = registro.pessoa === 'interessado' ? 'sua ficha cadastral' : 'a ficha do fiador';
  const voltar = 'Abra o mesmo link que você recebeu por e-mail ou WhatsApp.';
  const out = { pessoa: null, equipe: null };
  if (evento === 'enviou') {
    if ((registro.respostas || []).length === 1) out.pessoa = { assunto: `Recebemos ${qual}${imovel}`, texto: `${ola}\n\nRecebemos os seus dados. Agora conferimos tudo e, se faltar algo, avisamos. Se ainda faltar mandar algum documento, use o mesmo link.${fecho}` };
    out.equipe = { titulo: `${quem} mandou os dados`, texto: `${quem} preencheu a ficha pela internet${imovel}. Confira e traga para a ficha.` };
  } else if (evento === 'documento') {
    if ((registro.arquivos || []).length === 1) out.equipe = { titulo: `${quem} começou a mandar documentos`, texto: `Primeiro documento pelo link: ${detalhe}.` };
  } else if (evento === 'assinou') {
    // só a primeira ficha assinada avisa (mandar de novo não repete os e-mails)
    if ((registro.arquivos || []).filter((a) => /assinada/.test(a.documento)).length > 1) return out;
    out.pessoa = { assunto: `Recebemos ${qual} assinada${imovel}`, texto: `${ola}\n\nRecebemos a ficha assinada. Avisaremos o resultado da análise.${fecho}` };
    out.equipe = { titulo: `${quem} mandou a ficha assinada`, texto: `A ficha assinada chegou pelo link${imovel}. Confira a assinatura na página da ficha.` };
  } else if (evento === 'desistiu') {
    out.pessoa = { assunto: `Recebemos seu aviso${imovel}`, texto: `${ola}\n\nRecebemos o seu aviso de que não vai seguir com a análise. Sem problema${c.reserva ? `: a reserva de ${c.reserva} é devolvida por inteiro, na conta de onde veio o depósito` : ''}.${fecho}` };
    out.equipe = { titulo: `${quem} não vai seguir`, texto: `${quem} avisou pelo link que não vai seguir com a análise. Registre a desistência na ficha${c.reserva ? ` e devolva a reserva de ${c.reserva}` : ''}.` };
  } else if (evento === 'falta') {
    out.pessoa = { assunto: `Falta um documento: ${qual}${imovel}`, texto: `${ola}\n\nPara seguir com a análise, falta:\n${(registro.faltando || []).map((x) => `- ${x}`).join('\n')}\n\n${voltar} Lá aparece o que falta e o campo para mandar.${fecho}` };
  } else if (evento === 'assinar') {
    out.pessoa = { assunto: `${qual[0].toUpperCase()}${qual.slice(1)} está pronta para assinar${imovel}`, texto: `${ola}\n\nConferimos os dados. ${voltar} Baixe a ficha em PDF, assine pelo gov.br (gratuito, em assinador.iti.br) ou à mão e mande pelo mesmo link, em "Ficha assinada".${fecho}` };
  }
  return out;
}

/** Manda os avisos do evento (e-mail para a pessoa e para a equipe; celular da equipe). Falha de um não impede o outro. */
export async function avisar(env, registro, evento, detalhe = '', { buscar = fetch } = {}) {
  const t = textosDoAviso(registro, evento, detalhe);
  const simular = env.SIMULAR_GMAIL === '1' && /\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(env.ORIGEM || ''));
  const conta = simular ? null : await contaGuardada(env); // a ligada pelo botão (cofre) ou, sem ela, o segredo antigo
  const gmail = estadoEmail(env, { simular, conta });
  const feitos = [];
  const url = `${String(env.ORIGEM || 'https://erp.ankjck.com.br').replace(/\/$/, '')}/#/ficha/${registro.ficha_id}`;
  if (t.pessoa && gmail.ligado) {
    const para = emailDaPessoa(registro);
    if (para) {
      try { await enviarEmail(env, { para, assunto: t.pessoa.assunto, texto: t.pessoa.texto }, { buscar, simular, conta }); feitos.push('pessoa'); } catch (e) { console.warn('aviso por e-mail à pessoa', e.message); }
    }
  }
  if (t.equipe) {
    const equipe = String(env.AVISOS_EQUIPE || gmail.remetente || '').split(',').map((x) => x.trim()).filter(emailValido);
    if (gmail.ligado && equipe.length) {
      try { await enviarEmail(env, { para: equipe.join(','), assunto: `Ficha pela internet: ${t.equipe.titulo}`, texto: `${t.equipe.texto}\n\nAbrir a ficha: ${url}` }, { buscar, simular, conta }); feitos.push('equipe'); } catch (e) { console.warn('aviso por e-mail à equipe', e.message); }
    }
    try { if (await avisarAparelhos(env, { ...AVISO_CELULAR, url: `./#/ficha/${registro.ficha_id}`, tag: `ficha-${registro.ficha_id}` }, { buscar })) feitos.push('celular'); } catch (e) { console.warn('aviso no celular', e.message); }
  }
  return feitos;
}
