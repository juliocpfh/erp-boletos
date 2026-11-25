// Horário comercial nos envios ao inquilino e ao fiador (pedido do dono de 25/11/2026): fora dele, cada envio pergunta
// "Agendar para <próximo horário comercial>" (já marcado) ou "Enviar agora mesmo". O agendado sai sozinho pela nuvem
// (gmail.js agendarEmail → nuvem/agendados.mjs). Sem a nuvem, a opção de agendar aparece desligada, com a explicação.
// O WhatsApp e o "Abrir no Gmail" só mostram o aviso (avisoForaDoHorario): não dá para agendar o que sai por fora.
import { janela } from '../app.js';
import * as C from '../calculos.js';
import { esc } from '../formularios.js';
import { podeAgendar } from '../gmail.js';

/** Aviso (HTML) para a janela do WhatsApp ou do Gmail, ou '' no horário comercial. */
export function avisoForaDoHorario(agora = new Date()) {
  const h = C.horarioComercialAgora(agora);
  if (h.dentro) return '';
  return `<p class="alerta aviso" data-fora-do-horario>Agora é fora do horário comercial (${esc(C.textoHorarioComercial())}). O comum é falar com o inquilino só no horário: o próximo é ${esc(h.rotulo)}.</p>`;
}

/**
 * Pergunta antes de mandar e-mail ao inquilino ou fiador. No horário comercial não pergunta: { modo: 'agora', perguntou: false }
 * (quem chama faz a confirmação de sempre). Fora dele: { modo: 'agora', perguntou: true } (já confirmado), { modo: 'agendar',
 * quando: ISO, rotulo } ou null (Cancelar). `resumo`: o que vai (ex.: 'O e-mail vai para ana@exemplo.com.br, com 1 anexo.');
 * `alertas`: textos de atenção que já iam na confirmação (ficam em cima).
 */
export async function perguntarQuando({ resumo = '', alertas = [], agora = new Date() } = {}) {
  const h = C.horarioComercialAgora(agora);
  if (h.dentro) return { modo: 'agora', perguntou: false };
  const pode = await podeAgendar();
  const r = await janela({
    titulo: 'Fora do horário comercial', sim: 'Confirmar', nao: 'Cancelar', forte: alertas.length > 0,
    html: `${alertas.map((a) => `<p class="alerta aviso">${esc(a)}</p>`).join('')}
      <p>Agora é fora do horário comercial (${esc(C.textoHorarioComercial())}).${resumo ? ` ${esc(resumo)}` : ''}</p>
      <p><label><input type="radio" name="modo" value="agendar"${pode ? ' checked' : ' disabled'}> <b>Agendar para ${esc(h.rotulo)}</b> <span class="suave">(sai sozinho pela nuvem, mesmo com o computador desligado)</span></label></p>
      ${pode ? '' : '<p class="suave" data-sem-agendar>Agendar só funciona no sistema na nuvem (erp.ankjck.com.br), com o Gmail da empresa ligado. Aqui, envie agora ou cancele.</p>'}
      <p><label><input type="radio" name="modo" value="agora"${pode ? '' : ' checked'}> Enviar agora mesmo</label></p>
      <p class="suave">Mesmo enviado mais tarde, o registro fica com a data do dia em que o e-mail sair.</p>`,
  });
  if (!r) return null;
  if ((r.modo || [])[0] === 'agendar' && pode) return { modo: 'agendar', perguntou: true, quando: h.quando.toISOString(), rotulo: h.rotulo };
  return { modo: 'agora', perguntou: true };
}
