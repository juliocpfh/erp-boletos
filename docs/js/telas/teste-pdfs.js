// TELA TEMPORÁRIA (pedido do dono em 20/11/2026, item 1 de documentacao/PENDENCIAS_4000.md): "Teste dos PDFs" (#/teste-pdfs),
// só para o administrador, com um botão por PDF que o sistema gera, agrupados por assunto, para o dono abrir cada um no
// computador e no celular e anotar o que mudar. APAGAR DEPOIS DO TESTE: este arquivo, a rota 'teste-pdfs' (telas.js), a
// entrada testePdfs de PARTES_ADIADAS (telas/comum.js), 'js/telas/teste-pdfs.js' em ADIADOS (sw.js) e o link em Dados e backup
// (telas/admin.js). Nada aqui grava no banco: usa o primeiro registro que serve e diz qual é; sem registro, diz o que cadastrar.
import { aviso, baixar, podeUsuario } from '../app.js';
import * as C from '../calculos.js';
import { compBr, dataBr } from '../calculos.js';
import * as K from '../contratos.js';
import { esc } from '../formularios.js';
import * as REC from '../recibos.js';
import * as R from '../regras.js';
import { pdfDaCarta, pdfDoRecibo } from './documentos.js';
import { botao, buscar, d, link } from './comum.js';
import { cartaReajuste } from './reajustes.js';

const nomeContrato = (c) => { const i = buscar('imoveis', c.imovel_id); return `${i ? `${i.nome} · ` : ''}${c.inquilino_nome}`; };
const nomeFicha = (f) => `ficha nº ${f.id} · ${f.inquilino_nome || 'sem nome'}`;
const abrir = (hash) => link(hash, 'Abrir', 'botao pequeno');

/** Primeiro contrato (ou ficha) em que o recibo pode sair: { alvo, usado } ou { motivo }. */
function alvoDoRecibo(tipo) {
  const db = d();
  let motivo = '';
  const tenta = (alvo, usado) => { const r = REC.reciboDisponivel(db, tipo, alvo); if (r.ok) return { alvo, usado }; motivo = motivo || r.motivo; return null; };
  if (['ficha', 'ficha_fiador', 'devolucao_reserva'].includes(tipo) || tipo === 'reserva') {
    for (const f of db.fichas || []) { const x = tenta({ ficha: f, ...(tipo === 'ficha_fiador' ? { fiador: 1 } : {}) }, nomeFicha(f)); if (x) return x; }
  }
  if (tipo === 'acordo') {
    for (const a of db.acordos || []) { const c = buscar('contratos', a.contrato_id); const x = c && tenta({ contrato: c, acordo: a.id, id: a.id }, `${nomeContrato(c)} · acordo nº ${a.id}`); if (x) return x; }
  } else if (tipo === 'notificacao') {
    for (const n of db.notificacoes || []) { const c = buscar('contratos', n.contrato_id); const x = c && tenta({ contrato: c, id: n.id }, `${nomeContrato(c)} · notificação nº ${n.id}`); if (x) return x; }
  } else if (!['ficha', 'ficha_fiador', 'devolucao_reserva'].includes(tipo)) {
    for (const c of db.contratos) { const x = tenta({ contrato: c }, nomeContrato(c)); if (x) return x; }
  }
  return { motivo: motivo || 'Nenhum registro no banco.' };
}

/** O que cadastrar para cada recibo, quando nenhum registro serve. */
const FALTA_RECIBO = {
  reserva: 'uma ficha em análise (ou contrato) com o valor e a data da reserva',
  devolucao_reserva: 'uma ficha com reserva e a devolução registrada (data e comprovante)',
  garantia: 'um contrato com caução ou depósito em dinheiro já depositado',
  devolucao_garantia: 'uma devolução da garantia registrada, com saldo devolvido (troca de garantia ou de titular)',
  devolucao_chaves: 'um contrato com a data de saída',
  quitacao: 'um contrato com o cálculo final da saída e o saldo acertado',
  acordo: 'um acordo de dívida (não desfeito)',
  notificacao: 'uma notificação ao inquilino (não cancelada)',
  ficha: 'uma ficha em análise',
  ficha_fiador: 'uma ficha em análise com fiador',
};

const linhaFalta = (falta, motivo = '') => `<span class="suave">Sem registro que sirva. Cadastre ${esc(falta)}.${motivo ? ` (${esc(motivo)})` : ''}</span>`;

/** Recibos e termos (recibos.js): a página de impressão e o PDF que vai anexado no e-mail. */
function itensRecibos() {
  return Object.entries(REC.TIPOS_RECIBO).map(([tipo, nome]) => {
    const r = alvoDoRecibo(tipo);
    if (!r.alvo) return [nome, linhaFalta(FALTA_RECIBO[tipo] || 'o registro', r.motivo), ''];
    const a = r.alvo;
    const q = a.ficha ? `ficha=${a.ficha.id}${a.fiador ? `&fiador=${a.fiador}` : ''}` : `contrato=${a.contrato.id}${a.id ? `&id=${a.id}` : ''}`;
    const dados = { tipo, ...(a.ficha ? { ficha: a.ficha.id } : { contrato: a.contrato.id }), ...(a.fiador ? { fiador: a.fiador } : {}), ...(a.id ? { id: a.id } : {}) };
    return [nome, esc(r.usado), `${abrir(`#/imprimir/recibo?tipo=${tipo}&${q}`)} ${botao('testePdfRecibo', 'PDF anexado no e-mail', dados)}`];
  });
}

/** Contrato, termos aditivos, chaves e vistorias (desenhados pelo modelo: Baixar PDF e Word na página). */
function itensContrato() {
  const db = d();
  const c = db.contratos[0];
  const out = [];
  out.push(['Contrato de locação', c ? esc(nomeContrato(c)) : linhaFalta('um contrato'), c ? abrir(`#/imprimir/contrato?contrato=${c.id}`) : '']);
  const aditivo = (tipo, nome) => {
    const a = (db.aditivos || []).find((x) => x.texto && (tipo ? x.tipo === tipo : ![K.TIPO_ADITIVO_TROCA, K.TIPO_ADITIVO_VALOR].includes(x.tipo)));
    const ca = a && buscar('contratos', a.contrato_id);
    out.push([nome, ca ? `${esc(nomeContrato(ca))} · aditivo nº ${esc(a.numero || a.id)}` : linhaFalta(`um termo aditivo (${nome.replace('Termo aditivo ', '')}) feito pelo sistema`), ca ? abrir(`#/imprimir/aditivo?id=${a.id}`) : '']);
  };
  aditivo(null, 'Termo aditivo de vencimento');
  aditivo(K.TIPO_ADITIVO_VALOR, 'Termo aditivo de novo valor');
  aditivo(K.TIPO_ADITIVO_TROCA, 'Termo aditivo de troca de titular');
  out.push(['Termo de entrega das chaves', c ? esc(nomeContrato(c)) : linhaFalta('um contrato'), c ? abrir(`#/imprimir/chaves?contrato=${c.id}`) : '']);
  for (const tipo of ['Entrada', 'Saída']) {
    const v = (db.vistorias || []).find((x) => x.tipo === tipo && buscar('contratos', x.contrato_id));
    out.push([`Vistoria de ${tipo.toLocaleLowerCase('pt-BR')}`, v ? `${esc(nomeContrato(buscar('contratos', v.contrato_id)))}${v.data ? ` · ${dataBr(v.data)}` : ''}` : linhaFalta(`uma vistoria de ${tipo.toLocaleLowerCase('pt-BR')}`), v ? abrir(`#/imprimir/vistoria?id=${v.id}`) : '']);
  }
  return out;
}

/** Demonstrativos dos boletos (um de cada espécie) e as NFs. */
function itensBoletosNf() {
  const db = d();
  const out = [];
  const especies = [
    ['Demonstrativo do boleto do aluguel', (cb) => !R.ehBoletoAvulso(cb) && !R.ehSaldoSaida(cb) && !R.emAcordo(cb), 'um boleto de aluguel'],
    ['Demonstrativo do complemento da caução', (cb) => R.ehComplementoCaucao(cb), 'um boleto de complemento da caução'],
    ['Demonstrativo da parcela de acordo', (cb) => R.ehParcelaAcordo(cb), 'um acordo com parcelas'],
    ['Demonstrativo do saldo da saída', (cb) => R.ehSaldoSaida(cb), 'um cálculo final com saldo cobrado por boleto'],
  ];
  for (const [nome, serve, falta] of especies) {
    const cb = db.cobrancas.find((x) => serve(x) && buscar('contratos', x.contrato_id));
    out.push([nome, cb ? `${esc(nomeContrato(buscar('contratos', cb.contrato_id)))} · ${compBr(cb.competencia)} · venc. ${dataBr(cb.vencimento)}` : linhaFalta(falta),
      cb ? `${abrir(`#/imprimir/demonstrativos?ids=${cb.id}`)} ${link(`#/cobranca/${cb.id}`, 'Na tela do boleto', 'botao secundario pequeno')}` : '']);
  }
  const comp = db.cobrancas.map((x) => x.competencia).sort().at(-1);
  out.push(['Todos os demonstrativos de um mês', comp ? `mês de referência ${compBr(comp)}` : linhaFalta('boletos'), comp ? abrir(`#/imprimir/demonstrativos?comp=${comp}`) : '']);
  const f = db.faturas.find((x) => x.situacao === 'Emitida');
  const e = f && buscar('emitentes', f.emitente_id);
  out.push(['NF (nota fiscal de aluguel)', f ? `NF nº ${esc(R.numeroFatura(f.numero))} · ${dataBr(f.emissao)}${e ? ` · ${esc(e.nome)}` : ''}` : linhaFalta('uma NF emitida'),
    f ? `${abrir(`#/imprimir/faturas?numero=${f.numero}`)} ${botao('pdf', 'Baixar PDF', { id: f.id })}` : '']);
  const mes = f && f.emissao.slice(0, 7);
  out.push(['Todas as NFs de um mês (ZIP com os PDFs)', f ? `emitidas em ${compBr(mes)}` : linhaFalta('uma NF emitida'), f ? botao('pdfMes', 'Baixar o ZIP', { mes }) : '']);
  return out;
}

/** Primeiro reajuste com carta (do ano passado até daqui a 2 meses): { c, comp } ou null. */
function reajusteComCarta() {
  const hoje = C.hojeIso();
  const ate = C.somarMeses(C.competenciaDe(hoje), 2);
  for (const c of d().contratos) {
    for (let n = 1; n <= 40; n++) {
      const comp = R.competenciaDoReajuste(c, n);
      if (!comp || comp > ate) break;
      if (comp.slice(0, 4) < String(Number(hoje.slice(0, 4)) - 1)) continue;
      if (R.reajusteNaCompetencia(d(), c, comp) && cartaReajuste(c, comp).includes('class="carta"')) return { c, comp };
    }
  }
  return null;
}

/** Cartas, declaração do IR e relatórios. */
function itensCartasRelatorios() {
  const db = d();
  const out = [];
  const r = reajusteComCarta();
  out.push(['Carta de reajuste', r ? `${esc(nomeContrato(r.c))} · reajuste de ${compBr(r.comp)}` : linhaFalta('um contrato com reajuste neste ano ou no próximo e o índice do mês já informado'),
    r ? `${abrir(`#/imprimir/carta?contrato=${r.c.id}&comp=${r.comp}`)} ${botao('testePdfCarta', 'PDF guardado na pasta / e-mail', { contrato: r.c.id, comp: r.comp })}` : '']);
  let ir = null;
  const anos = [...new Set(db.faturas.map((f) => Number(String(f.emissao).slice(0, 4))))].sort((a, b) => b - a);
  for (const ano of anos) {
    ir = db.contratos.filter((c) => R.geraNf(c)).map((c) => ({ c, ano })).find((x) => R.declaracaoAnual(db, x.c.id, ano).empresas.length);
    if (ir) break;
  }
  out.push(['Declaração anual de aluguéis (IR)', ir ? `${esc(nomeContrato(ir.c))} · ano ${ir.ano}` : linhaFalta('um contrato com NF de aluguel emitida'), ir ? abrir(`#/imprimir/declaracao?contrato=${ir.c.id}&ano=${ir.ano}`) : '']);
  const mes = C.competenciaDe(C.hojeIso());
  out.push(['Resumo de gestão do mês', `mês ${compBr(mes)}`, `${botao('relatorioGestao', 'Baixar PDF', { mes })} ${link(`#/gestao?mes=${mes}`, 'Na tela Gestão', 'botao secundario pequeno')}`]);
  out.push(['Todos os dados (planilha e PDF)', 'o banco inteiro', `${link('#/dados', 'Em Dados e backup', 'botao secundario pequeno')} <span class="suave">(botão "Baixar todos os dados em planilha e PDF"; ele anota a exportação no histórico)</span>`]);
  return out;
}

const GRUPOS = [
  ['Contrato, termos aditivos, chaves e vistorias', itensContrato],
  ['Recibos, termos de quitação, acordo, notificação e ficha', itensRecibos],
  ['Boletos (demonstrativos) e NF', itensBoletosNf],
  ['Cartas, declaração do IR e relatórios', itensCartasRelatorios],
];

export function telaTestePdfs() {
  if (!podeUsuario('admin')) return '<div class="alerta erro">Só o administrador abre o teste dos PDFs.</div>';
  const grupos = GRUPOS.map(([titulo, itens]) => {
    let linhas;
    try { linhas = itens(); } catch (e) { return `<div class="cartao"><h2>${esc(titulo)}</h2><div class="alerta erro">Erro ao montar a lista: ${esc(e.message)}</div></div>`; }
    return `<div class="cartao"><h2>${esc(titulo)}</h2><table><tr><th>PDF</th><th>Registro usado</th><th>Abrir</th></tr>
      ${linhas.map(([nome, usado, botoes]) => `<tr><td><b>${esc(nome)}</b></td><td>${usado}</td><td class="acoes">${botoes || ''}</td></tr>`).join('')}</table></div>`;
  }).join('');
  return `<div class="cabecalho"><h1>Teste dos PDFs (página temporária)</h1><div class="acoes">${link('#/dados', 'Voltar a Dados e backup', 'botao secundario')}</div></div>
    <div class="alerta info">Abra cada PDF <b>no computador e no celular (Android)</b>, confira se sai certo e anote os textos a mudar. "Abrir" leva à página do documento, com <b>Imprimir</b> e <b>Baixar PDF</b>; o botão ao lado baixa o PDF do mesmo jeito que vai anexado no e-mail ou guardado na pasta. Esta página não grava nada (só o "Baixar PDF" do contrato e do termo das chaves marca, como sempre, a etapa "gerado" no roteiro da entrada, se ainda não estava). Ela será apagada depois do teste.</div>
    ${grupos}`;
}

export const ACOES_TESTE_PDFS = {
  async testePdfRecibo({ tipo, ficha, contrato, id, fiador }) {
    const f = ficha ? buscar('fichas', ficha) : null;
    const c = contrato ? buscar('contratos', contrato) : null;
    if (!f && !c) throw new C.ErroUsuario('Registro não encontrado.');
    aviso('Gerando o PDF…', 'info');
    const r = await pdfDoRecibo(tipo, f ? { ficha: f, ...(fiador ? { fiador: Number(fiador) } : {}) } : { contrato: c, ...(id ? { acordo: Number(id), id: Number(id) } : {}) });
    baixar(r.blob, r.nome);
  },
  async testePdfCarta({ contrato, comp }) {
    const c = buscar('contratos', contrato);
    if (!c) throw new C.ErroUsuario('Inquilino não encontrado.');
    aviso('Gerando o PDF…', 'info');
    const r = await pdfDaCarta(c, comp);
    if (!r) throw new C.ErroUsuario('A carta não sai: falta o índice do mês.');
    baixar(r.blob, r.nome);
  },
};
