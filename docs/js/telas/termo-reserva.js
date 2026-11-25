// Termo de aceite da reserva na página da ficha (decisões do dono de 2026-11-24): a caixa "1º passo" (condições, termo, link
// do aceite, e-mail e PDF), a leitura do aceite na nuvem (copiado para a ficha) e os botões. Regras em regras.js ("Termo de
// aceite da reserva"), texto em recibos.js (termoDaReserva), nuvem em nuvem/aceite-reserva.mjs, pedido em termo-reserva.js.
import { alterar, aviso, E, janela, login, mostrar } from '../app.js';
import * as C from '../calculos.js';
import { dataBr, reais } from '../calculos.js';
import * as FO from '../ficha-online.js';
import { esc } from '../formularios.js';
import * as REC from '../recibos.js';
import * as R from '../regras.js';
import * as TR from '../termo-reserva.js';
import { logoReduzida } from './comunicacoes.js';
import { botaoEmail } from './emails.js';
import { botao, buscar, d, etiqueta, link, opera } from './comum.js';

/** Regra da desistência para a equipe. Ex.: 100% e 0 dias → "desistência depois do depósito: a reserva fica com a empresa". */
function desistenciaResumo(c, valor) {
  const reter = Math.min(R.retencaoDaReserva(valor, c.retencao_pct), valor);
  if (!reter) return 'desistência: devolve tudo';
  const fica = reter >= valor ? 'a reserva fica com a empresa' : `a empresa fica com ${C.pct(c.retencao_pct)} (${reais(reter)})`;
  return c.dias_arrependimento > 0 ? `desistência em até ${c.dias_arrependimento} dias do depósito: devolve tudo; depois, ${fica}` : `desistência depois do depósito: ${fica}`;
}

const quando = (iso) => C.dataHoraBr(iso).slice(0, 17).replace(', ', ' ');

/** Prazos e "se desistir hoje", para a caixa (ficha com o termo aceito e o depósito registrado). */
function prazosHtml(f) {
  const pz = R.prazosDaReserva(f);
  if (!pz) return `<div class="alerta info"><b>Falta o depósito da reserva de ${reais(R.valorDaReserva(f))}.</b> Quando chegar, registre o valor, a data e o comprovante em "Editar". Os prazos do termo contam do depósito.</div>`;
  if (R.fichaSemContrato(f) || f.situacao === 'Aprovada') return '';
  const hoje = C.hojeIso();
  const dv = R.devolucaoDaReserva(f, { data: hoje });
  const c = R.condicoesDaReserva(f);
  const passou = (x) => (x < hoje ? ` ${etiqueta('passou', 'aviso')}` : '');
  return `<ul>
    <li>Documentos até <b>${dataBr(pz.documentos_ate)}</b> (${C.plural(c.dias_uteis_documentos, 'dia útil', 'dias úteis')} do depósito)${passou(pz.documentos_ate)}${pz.documentos_ate < hoje && R.fichaSemDocumentos(f) ? ' · os documentos não estão marcados como recebidos: pelo termo, conta como desistência (use "Desistiu antes de assinar")' : ''}${pz.documentos_ate >= hoje ? ` · se faltar documento, a equipe fala com a pessoa ${pz.aviso_documentos_em ? `em <b>${dataBr(pz.aviso_documentos_em)}</b> e ` : ''}no último dia` : ''}</li>
    <li>O imóvel fica reservado até <b>${dataBr(pz.vale_ate)}</b>${passou(pz.vale_ate)}</li>
    <li>${pz.arrependimento_ate ? `Desistência com tudo de volta até <b>${dataBr(pz.arrependimento_ate)}</b>; hoje, se` : 'Sem prazo de devolução total; se'} desistir: ${dv.integral ? `devolve ${reais(dv.devolver)} (tudo)` : dv.devolver === 0 ? `a reserva de ${reais(dv.reter)} fica com a empresa` : `devolve <b>${reais(dv.devolver)}</b> e a empresa fica com ${reais(dv.reter)}`}</li></ul>`;
}

/** Caixa do termo na página da ficha. Ficha encerrada sem aceite: nada. */
export function caixaTermoReserva(f) {
  const a = f.aceite_reserva;
  if (!a && (f.situacao !== 'Em análise' || !opera())) return '';
  const pdf = REC.reciboDisponivel(d(), 'termo_reserva', { ficha: f }).ok ? link(`#/imprimir/recibo?tipo=termo_reserva&ficha=${f.id}`, a ? '🧾 Termo aceito (PDF)' : '🧾 Termo para assinar (PDF)', '') : '';
  const titulo = '<h2>Termo de aceite da reserva</h2>';
  if (a) {
    return `<div class="cartao" data-termo-reserva="${f.id}">${titulo}
      <p>${etiqueta('✓ termo aceito', 'ok')} em <b>${esc(quando(a.em))}</b>, pelo link, com o e-mail <b>${esc(a.email)}</b> confirmado pelo código${a.assinatura ? ' e assinatura na tela' : ''}. ${pdf}</p>
      <p class="suave">Reserva de ${reais(a.reserva_valor || R.valorDaReserva(f))}, abatida do 1º aluguel · ${a.condicoes ? esc(desistenciaResumo(a.condicoes, a.reserva_valor || R.valorDaReserva(f))) : ''}</p>
      ${prazosHtml(f)}</div>`;
  }
  const valor = R.valorDaReserva(f);
  if (!valor) {
    return `<div class="cartao" data-termo-reserva="${f.id}">${titulo}<p class="suave">1º passo, antes do depósito: mande as condições do imóvel e o termo da reserva para a pessoa aceitar. Preencha antes a <b>Reserva combinada</b> (em ${link(`#/editar/fichas/${f.id}`, 'Editar', '')}), com o aluguel, o vencimento, a garantia e o que está incluso.</p></div>`;
  }
  const c = R.condicoesDaReservaAgora();
  const vale = f.link_aceite && String(f.link_aceite.vence_em) > new Date().toISOString() ? f.link_aceite : null;
  const naAba = TR.urlDoAceite(f.id);
  const botoes = !E.nuvem ? '<span class="suave">Sem a nuvem, mande o termo em PDF (no e-mail) para a pessoa assinar e anexe o assinado na pasta da ficha.</span>'
    : `${botao('gerarLinkTermo', vale ? 'Gerar novo link' : 'Gerar o link do aceite', { id: f.id }, vale ? 'secundario pequeno' : 'pequeno', vale ? 'Gerar um link novo? O link atual deixa de valer.' : '')}
      ${vale && naAba ? botao('compartilharLinkTermo', 'Copiar / WhatsApp', { id: f.id }, 'secundario pequeno') : ''}`;
  return `<div class="cartao" data-termo-reserva="${f.id}">${titulo}
    <p><b>1º passo, antes do depósito:</b> a pessoa recebe as condições do imóvel e o termo da reserva${E.nuvem ? ', confirma o e-mail com um código e dá o aceite pelo link' : ', assina o termo (gov.br ou à mão) e devolve'}. Depois ela deposita a reserva.</p>
    <p class="suave">Reserva de <b>${reais(valor)}</b>, abatida do 1º aluguel · documentos em ${C.plural(c.dias_uteis_documentos, 'dia útil', 'dias úteis')} do depósito · reservado por ${c.dias_validade} dias · ficha não aprovada: devolve tudo · ${esc(desistenciaResumo(c, valor))} (o termo avisa em destaque antes do aceite e do pagamento) · devolução (quando houver) em ${C.plural(c.dias_uteis_devolucao, 'dia útil', 'dias úteis')}. <a href="#/regras">Regras do sistema</a></p>
    <details><summary class="suave">Ver o termo como a pessoa vai ler</summary><pre class="texto-modelo">${esc(REC.textoDoTermo(REC.termoDaReserva(d(), f)))}</pre></details>
    <p class="acoes">${botoes} ${botaoEmail('ficha_termo_reserva', { ficha: f.id }, '✉ E-mail: condições e termo da reserva')} ${pdf}</p>
    <p class="suave" data-situacao-aceite>${vale ? `Link até ${dataBr(String(vale.vence_em).slice(0, 10))}.${naAba ? '' : ' Para mandar de novo, gere outro (o endereço só aparece na hora em que é gerado).'}` : ''}</p></div>`;
}

/** Depois de desenhar a ficha: lê o link na nuvem; aceite novo vai para a ficha (e a página é desenhada de novo). */
export async function ligarTermoReserva(raiz) {
  const caixa = raiz.querySelector('[data-termo-reserva]');
  if (!caixa || !E.nuvem) return;
  const id = Number(caixa.dataset.termoReserva);
  const f = buscar('fichas', id);
  if (!f || !f.link_aceite || f.aceite_reserva) return; // já aceito: nada a buscar
  let l;
  try { l = await TR.lerAceiteNaNuvem(id); } catch (e) { const s = caixa.querySelector('[data-situacao-aceite]'); if (s) s.textContent = `Não foi possível ler o link na nuvem: ${e.message}`; return; }
  if (!l) return;
  if (l.resposta && (!f.aceite_reserva || f.aceite_reserva.em !== l.resposta.em) && opera()) {
    let mudou = false;
    await alterar((db) => { mudou = R.guardarAceiteReserva(db, id, l.resposta, login()); });
    if (mudou) { aviso(`${f.inquilino_nome} aceitou o termo da reserva. Agora é esperar o depósito.`); await mostrar(); }
    return;
  }
  const s = caixa.querySelector('[data-situacao-aceite]');
  if (s && !l.resposta && caixa.isConnected) {
    s.innerHTML = `${l.encerrado_em ? etiqueta('link encerrado', 'neutra') : Date.parse(l.vence_em) < Date.now() ? etiqueta('link vencido', 'aviso') : etiqueta(l.aberto_em ? 'aberto, sem aceite ainda' : 'ainda não aberto', 'info')}
      <span class="suave">${l.aberto_em ? ` · aberto em ${esc(quando(l.aberto_em))}` : ''}${l.codigo_enviado_para ? ` · código pedido para ${esc(l.codigo_enviado_para)}` : ''} · link até ${dataBr(String(l.vence_em).slice(0, 10))}</span>`;
  }
}

/** Janela com o link: copiar e WhatsApp (o link só existe nesta aba). */
async function janelaDoAceite(f, l) {
  const tel = FO.telefoneWhatsapp(f, 'interessado');
  await janela({
    titulo: `Termo da reserva: ${f.inquilino_nome}`, sim: 'Fechar', nao: 'Voltar',
    html: `<p>Vale até <b>${dataBr(String(l.vence_em).slice(0, 10))}</b>. É só desta pessoa: não publique.</p>
      <p class="texto-aviso"><b>Copie agora:</b> por segurança, este link não fica guardado no sistema. Se você mandar agora o e-mail "Condições e termo da reserva" (botão na ficha), ele já leva o link.</p>
      <p><textarea rows="5" readonly data-texto-link style="width:100%">${esc(TR.textoWhatsappAceite(f, l))}</textarea></p>
      <p class="acoes"><button type="button" class="secundario pequeno" data-copiar-link>Copiar a mensagem</button>
      ${tel ? `<a class="botao pequeno" target="_blank" rel="noopener noreferrer" href="https://wa.me/${tel}" data-abrir-zap>Copiar e abrir o WhatsApp</a>` : '<span class="suave">Sem telefone cadastrado para o WhatsApp.</span>'}</p>`,
    ligar: (dlg) => {
      const copiar = async () => { try { await navigator.clipboard.writeText(dlg.querySelector('[data-texto-link]').value); return true; } catch { dlg.querySelector('[data-texto-link]').select(); return false; } };
      dlg.querySelector('[data-copiar-link]').addEventListener('click', async (ev) => { if (await copiar()) ev.target.textContent = 'Copiado ✓'; });
      const zap = dlg.querySelector('[data-abrir-zap]');
      if (zap) zap.addEventListener('click', () => { copiar(); });
    },
  });
}

export const ACOES_TERMO = {
  /** Cria o link do termo na nuvem, guarda na ficha só a validade e mostra para copiar ou mandar. */
  async gerarLinkTermo({ id }) {
    if (!opera()) throw new C.ErroUsuario('Seu usuário não pode gerar o link do termo.');
    if (!E.nuvem) throw new C.ErroUsuario('O aceite pela internet só funciona no sistema na nuvem.');
    const f = buscar('fichas', id);
    if (!f) throw new C.ErroUsuario('Ficha não encontrada.');
    if (f.aceite_reserva) throw new C.ErroUsuario('O termo desta ficha já foi aceito.');
    if (!(R.valorDaReserva(f) > 0)) throw new C.ErroUsuario('Preencha a reserva combinada (em "Editar") antes do termo.');
    const l = await TR.criarLinkDoAceite(TR.pedidoDoAceite(d(), f, await logoReduzida()));
    TR.lembrarUrlDoAceite(f.id, l);
    await alterar((db) => R.atualizar(db, 'fichas', f.id, { link_aceite: { vence_em: l.vence_em, criado_em: new Date().toISOString(), por: login() } }, login(),
      `Link do termo da reserva de ${f.inquilino_nome} gerado (vale até ${dataBr(String(l.vence_em).slice(0, 10))})`));
    await mostrar();
    await janelaDoAceite(buscar('fichas', id), l);
  },
  async compartilharLinkTermo({ id }) {
    const f = buscar('fichas', id);
    const l = f && TR.urlDoAceite(f.id);
    if (!l) throw new C.ErroUsuario('O endereço só aparece na hora em que é gerado: gere um novo link.');
    await janelaDoAceite(f, l);
  },
};
