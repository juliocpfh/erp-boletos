// Termo de aceite da reserva pela internet (decisões do dono de 2026-11-24): o que o sistema manda para o link (o termo de
// recibos.js termoDaReserva, as condições e a conta do depósito), a mensagem do WhatsApp e a conversa com a nuvem
// (nuvem/aceite-reserva.mjs, rotas /api/aceite-reserva/…). O aceite volta para a ficha por R.guardarAceiteReserva.
// O endereço do link (com a chave depois do "#") só fica na memória desta aba, como o da ficha pela internet.
import * as C from './calculos.js';
import * as K from './contratos.js';
import * as REC from './recibos.js';
import * as R from './regras.js';

/** Corpo do pedido que cria o link do termo. ``logo``: data URL já reduzida (ou ''). */
export function pedidoDoAceite(d, f, logo = '') {
  const t = REC.termoDaReserva(d, f);
  const imovel = (f.imoveis_ids || []).map((id) => R.buscar(d, 'imoveis', id)).find(Boolean);
  return {
    ficha_id: f.id,
    contexto: {
      empresa: t.empresa, cnpj: t.cnpj, logo, nome: f.inquilino_nome || '', imovel: (t.itens[0] || [])[1] || '', email: f.inquilino_email || '',
      reserva_valor: t.reserva_valor, reserva: C.reais(t.reserva_valor), condicoes: t.condicoes, termo: REC.textoDoTermo(t), ciencia: t.ciencia,
      aviso: t.aviso, deposito: t.deposito, email_empresa: K.dadoDaEmpresa(d, { imovel_id: imovel ? imovel.id : null }, 'email_contato') || '',
    },
  };
}

/** Mensagem do WhatsApp com o link. Ex.: "Olá, Maria! Seguem as condições do imóvel e o termo da reserva (R$ 500,00) …". */
export function textoWhatsappAceite(f, link) {
  const nome = String(f.inquilino_nome || '').trim().split(/\s+/)[0];
  const valor = R.valorDaReserva(f);
  return `Olá${nome ? `, ${nome}` : ''}! Seguem as condições do imóvel e o termo da reserva${valor ? ` (${C.reais(valor)}, abatida do 1º aluguel)` : ''}. Leia e, se estiver de acordo, dê o aceite por este link, só seu, que vale até ${C.dataBrDe(link.vence_em)}: ${link.url}
Depois do aceite, mandamos a conta para o depósito.${REC.avisoDaDesistencia(R.condicoesDaReservaAgora(), valor) ? ' Atenção: leia a regra da desistência antes de depositar.' : ''} Qualquer dúvida, é só responder.`;
}

const urls = new Map(); // ficha → { url, vence_em } (só nesta aba)
export const lembrarUrlDoAceite = (fichaId, link) => urls.set(Number(fichaId), link);
export function urlDoAceite(fichaId) {
  const l = urls.get(Number(fichaId));
  return l && String(l.vence_em) > new Date().toISOString() ? l : null;
}
export const esquecerUrlsDoAceite = () => urls.clear();

const cfg = { base: 'api/aceite-reserva/', buscar: (...a) => fetch(...a) };
/** Só para os testes. */
export function configurarAceite(opcoes = {}) { Object.assign(cfg, opcoes); }

async function pedir(caminho, op = {}) {
  let r;
  try {
    r = await cfg.buscar(`${cfg.base}${caminho}`, { cache: 'no-store', credentials: 'same-origin', ...op, headers: { ...(op.method && op.method !== 'GET' ? { 'X-Sistema': 'imoveis', 'Content-Type': 'application/json' } : {}), ...(op.headers || {}) } });
  } catch { throw new C.ErroUsuario('Sem internet: o termo pela internet precisa de conexão.'); }
  const tipo = r.headers.get('content-type') || '';
  if (r.redirected || !tipo.includes('json')) throw new C.ErroUsuario('A nuvem não respondeu (entre de novo no sistema e tente outra vez).');
  const dados = await r.json();
  if (!r.ok) throw new C.ErroUsuario(dados.erro || 'A nuvem recusou o pedido.');
  return dados;
}

// fim_expediente: a nuvem conta a validade de amanhã quando o link é criado depois do horário comercial (regra fim_expediente_hora)
export const criarLinkDoAceite = (corpo) => pedir('link', { method: 'POST', body: JSON.stringify({ ...corpo, fim_expediente: C.fimDoExpediente() }) });
export const lerAceiteNaNuvem = (fichaId) => pedir(`ler?ficha=${Number(fichaId)}`).then((r) => r.link || null);
export const encerrarAceiteNaNuvem = (fichaId) => pedir('encerrar', { method: 'POST', body: JSON.stringify({ ficha_id: Number(fichaId) }) });
