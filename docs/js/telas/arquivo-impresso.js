// Tela do Arquivo impresso (pasta física de cada inquilino, decisão do dono em 2026-11-15): a lista de todos os inquilinos
// (#/arquivo-impresso), a pasta de um inquilino com as caixinhas (#/pasta-fisica/<id>), a página de impressão com a capa e
// os documentos (#/pasta-impressao/<id>) e a caixa da página do inquilino. As regras ficam em arquivo-impresso.js.
import { alterar, aviso, baixar, ir, login, mostrar } from '../app.js';
import * as AI from '../arquivo-impresso.js';
import * as S from '../armazenamento.js';
import * as C from '../calculos.js';
import { dataBr } from '../calculos.js';
import { esc } from '../formularios.js';
import * as REC from '../recibos.js';
import * as R from '../regras.js';
import { botao, buscar, carregarParte, d, endereco, etiqueta, link, memoria, naoEncontrado, opera, pastaDoEscopo } from './comum.js';
import { reciboHtml } from './documentos.js';
import { cartaReajuste } from './reajustes.js';

const DESLIGADA = '<div class="alerta info">A rotina <b>Arquivo impresso</b> está desligada. Para ligar: Dados e backup → Regras do sistema → "Arquivo impresso (pasta física de cada inquilino)".</div>';
const SITUACAO_ITEM = { impresso: 'impresso', ja_tinha: 'já estava em papel', fora: 'fora da pasta' };

/** Nomes dos arquivos soltos na pasta do inquilino (a lista é da nuvem ou do disco; sem pasta, nenhum). */
async function soltosDe(c) {
  try { return (await S.listar(await pastaDoEscopo('contrato', c.id, false))).map((a) => a.nome); } catch { return []; }
}

const nomeImovel = (c) => (buscar('imoveis', c.imovel_id) || {}).nome || 'sem imóvel';

// --------------------------------------------------------------------------
// Lista de todos os inquilinos (Dados e backup → Arquivo impresso; link do alerta do Painel)
// --------------------------------------------------------------------------
export function telaArquivoImpresso(q = {}) {
  const topo = '<p class="suave"><a href="#/dados">← Dados e backup</a></p><h1>Arquivo impresso</h1>';
  if (!AI.ligado()) return `${topo}${DESLIGADA}`;
  const hoje = C.hojeIso();
  const todos = q.todos === '1';
  const linhas = AI.contratosDaRotina(d(), hoje).map((c) => ({ c, s: AI.situacaoPasta(d(), c, hoje) }))
    .sort((a, b) => Number(b.s.precisa) - Number(a.s.precisa) || nomeImovel(a.c).localeCompare(nomeImovel(b.c), 'pt-BR'));
  const visiveis = linhas.filter((x) => todos || x.s.precisa);
  const tipo = (s) => (s.precisa ? 'aviso' : s.aguardando ? 'neutra' : 'ok');
  return `${topo}
    <p class="suave">A pasta de papel de cada inquilino: o que imprimir na entrada, quando chega documento novo importante (termo aditivo, carta de reajuste, termo de acordo, notificação) e na saída. Notas fiscais, comprovantes, boletos, documentos de renda, fotos, apólices e e-mails não vão para a pasta. Arquivo solto novo na pasta do inquilino aparece ao abrir a pasta dele.</p>
    <div class="acoes" style="margin-bottom:10px"><span class="suave">Mostrar:</span> ${link('#/arquivo-impresso', 'Com pendência', `botao ${todos ? 'secundario ' : ''}pequeno`)} ${link('#/arquivo-impresso?todos=1', 'Todos', `botao ${todos ? '' : 'secundario '}pequeno`)}</div>
    <div class="cartao"><table class="responsiva"><tr><th>Inquilino</th><th>Imóvel</th><th>Situação</th><th></th></tr>
    ${visiveis.map(({ c, s }) => `<tr><td><a href="#/contrato/${c.id}">${esc(c.inquilino_nome)}</a></td><td>${esc(nomeImovel(c))}</td>
      <td>${etiqueta(AI.textoSituacao(s), tipo(s))}</td><td class="n">${link(`#/pasta-fisica/${c.id}`, 'Abrir', 'botao pequeno')}</td></tr>`).join('')
      || `<tr><td colspan="4" class="suave">${todos ? 'Nenhum inquilino ativo.' : 'Nenhuma pasta com pendência.'}</td></tr>`}</table>
    <p class="suave">${linhas.filter((x) => x.s.precisa).length} com pendência de ${linhas.length} inquilino(s) acompanhado(s).</p></div>`;
}

// --------------------------------------------------------------------------
// Caixa na página do inquilino: documento novo, arquivo trocado, pasta a montar
// --------------------------------------------------------------------------
export function caixaPastaFisica(c) {
  if (!AI.ligado() || !AI.contratosDaRotina(d()).includes(c)) return '';
  const s = AI.situacaoPasta(d(), c);
  if (!s.precisa) return '';
  const lista = (l, fim = '') => `<ul style="margin:4px 0 6px 18px">${l.map((i) => `<li>${esc(i.rotulo)}${i.data ? ` (${dataBr(i.data)})` : ''}${fim}</li>`).join('')}</ul>`;
  const novos = s.novos.length ? `<br>Documento novo para a pasta:${lista(s.novos)}` : '';
  const trocados = s.trocados.length ? `<br>Arquivo trocado depois de impresso (imprima o novo e tire o antigo da pasta):${lista(s.trocados)}` : '';
  const rapidos = opera() && s.montada && (s.novos.length || s.trocados.length)
    ? `${botao('pastaRapida', 'Já está em papel', { contrato: c.id, como: 'ja_tinha' }, 'secundario pequeno', 'Marcar estes documentos como já impressos na pasta?')}
       ${s.novos.length ? botao('pastaRapida', 'Não vai para a pasta', { contrato: c.id, como: 'fora' }, 'secundario pequeno', 'Os documentos novos não vão para a pasta de papel? O aviso some para eles.') : ''}` : '';
  return `<div class="alerta info" id="pasta-fisica"><b>Pasta física:</b> ${esc(AI.textoSituacao(s))}.${novos}${trocados}
    <div class="acoes" style="margin-top:6px">${link(`#/pasta-fisica/${c.id}`, s.montada ? 'Imprimir (com a capa nova)' : 'Montar a pasta física', 'botao pequeno')} ${rapidos}</div></div>`;
}

// --------------------------------------------------------------------------
// A pasta de um inquilino: as caixinhas, "Imprimir tudo" e "Já está tudo em papel"
// --------------------------------------------------------------------------
const abrirItem = (i, c) => {
  if (i.tipo === 'arquivo') return `<a href="#" data-acao="abrirArquivo" data-escopo="${esc(i.escopo)}" data-id="${esc(i.pasta)}" data-nome="${esc(i.nome)}" title="Abrir ${esc(i.nome)}">abrir</a>`;
  if (i.tipo === 'recibo') return `<a href="#/imprimir/recibo?tipo=${i.recibo}&contrato=${c.id}">abrir</a>`;
  if (i.tipo === 'carta') return `<a href="#/imprimir/carta?contrato=${c.id}&comp=${i.comp}">abrir</a>`;
  return i.link ? `<a href="${i.link}">abrir</a>` : '';
};

function linhasDoGrupo(itens, reg, c, nome) {
  return itens.map((i) => {
    const r = reg.get(i.vaga);
    const trocado = r && i.tipo === 'arquivo' && r.situacao !== 'fora' && r.nome !== i.nome;
    const marcado = r ? trocado : i.marcado;
    const sit = trocado ? etiqueta('arquivo trocado: imprimir o novo', 'aviso')
      : r ? etiqueta(`${SITUACAO_ITEM[r.situacao] || r.situacao} em ${dataBr(r.data)}${r.por ? ` por ${r.por}` : ''}`, r.situacao === 'fora' ? 'neutra' : 'ok') : etiqueta('novo', 'info');
    return `<tr><td style="width:28px"><input type="checkbox" name="${nome}" value="${esc(i.vaga)}"${marcado ? ' checked' : ''}${opera() ? '' : ' disabled'} aria-label="${esc(i.rotulo)}"></td>
      <td>${esc(i.rotulo)}${i.data ? ` <span class="suave">(${dataBr(i.data)})</span>` : ''}${i.tipo === 'vistoria' ? ' <span class="suave">· imprimir à parte</span>' : ''}</td><td>${sit}</td><td class="n">${abrirItem(i, c)}</td></tr>`;
  }).join('');
}

function tabelaDaPasta(itens, reg, c, nome = 'vaga') {
  return AI.GRUPOS_PASTA.map(([g, titulo]) => {
    const l = itens.filter((i) => i.grupo === g);
    return l.length ? `<tr><th colspan="4" style="text-align:left">${esc(titulo.toLocaleUpperCase('pt-BR'))}</th></tr>${linhasDoGrupo(l, reg, c, nome)}` : '';
  }).join('');
}

export async function telaPastaFisica(id) {
  const c = buscar('contratos', id);
  if (!c) return naoEncontrado('Inquilino não encontrado', '#/arquivo-impresso', 'Ver o Arquivo impresso');
  const topo = `<p class="suave"><a href="#/contrato/${c.id}">← ${esc(c.inquilino_nome)}</a> · <a href="#/arquivo-impresso">Arquivo impresso</a></p>`;
  if (!AI.ligado()) return `${topo}<h1>Pasta física</h1>${DESLIGADA}`;
  const hoje = C.hojeIso();
  const s = AI.situacaoPasta(d(), c, hoje, await soltosDe(c));
  const a = s.anterior;
  const faltaA = a ? AI.faltaDoAnterior(d(), a, await soltosDe(a)) : [];
  const i = buscar('imoveis', c.imovel_id);
  memoria.pastaTela = { contrato: c.id, itens: s.itens, momento: s.montada && s.momento !== 'saida' ? 'durante' : s.momento, anterior: a ? { id: a.id, itens: faltaA } : null };
  const momento = { entrada: 'Entrada', inicio: 'Primeira montagem (o que já existe)', durante: 'Documentos novos', saida: 'Saída', heranca: 'Troca de titular' }[s.momento];
  const espera = s.aguardando ? `<div class="alerta aviso">${s.momento === 'saida' ? 'A saída ainda não terminou (falta a devolução da garantia ou a cobrança do saldo).' : 'A entrada ainda não terminou (há etapas da rotina de entrada pendentes).'} Dá para montar a pasta mesmo assim; o que chegar depois aparece como documento novo.</div>` : '';
  const fiadores = R.fiadoresDoContrato(d(), c.id).map((f) => f.nome).filter(Boolean);
  const passo1 = a ? `<div class="cartao"><h2>Passo 1 · Pasta de ${esc(a.inquilino_nome)} (contrato anterior)</h2>
      <p class="suave">Troca de titular: ${esc(c.inquilino_nome)} continua o contrato de ${esc(a.inquilino_nome)} (desde ${dataBr(a.data_entrada)}). O contrato, a vistoria de entrada e o termo das chaves são herdados: ficam na pasta de ${esc(a.inquilino_nome)}.</p>
      ${faltaA.length ? `<p>${faltaA.length} documento(s) de ${esc(a.inquilino_nome)} ainda não estão em papel:</p><div class="rolagem"><table class="compacta">${tabelaDaPasta(faltaA, new Map(), a, 'anterior')}</table></div>` : `<p>${etiqueta(`pasta de ${a.inquilino_nome} em dia`, 'ok')}</p>`}
      <label style="display:block;margin-top:8px"><input type="checkbox" name="guardada" value="1"${opera() ? '' : ' disabled'}> Pus a pasta de <b>${esc(a.inquilino_nome)}</b> dentro da pasta de <b>${esc(c.inquilino_nome)}</b> ("herdado de ${esc(a.inquilino_nome)}")</label></div>` : '';
  const passo2 = a ? `<h2>Passo 2 · Documentos de ${esc(c.inquilino_nome)}</h2>` : '';
  const acoes = opera() ? `<div class="acoes" style="margin-top:10px">${botao('pastaImprimir', 'Ver a capa e imprimir tudo', { contrato: c.id }, 'botao')}
      ${botao('pastaPapel', 'Já está tudo em papel', { contrato: c.id }, 'secundario', 'Marcar os documentos marcados como já impressos na pasta (sem imprimir)? Os desmarcados ficam "fora da pasta".')}</div>
      <p class="suave">Marcado = vai para o papel agora. Ao confirmar, o que ficou desmarcado e ainda não estava na pasta passa a "fora da pasta" (não avisa de novo).</p>` : '';
  return `${topo}<h1>Pasta física · ${esc(c.inquilino_nome)} <span class="suave">· ${esc(i ? `${i.nome} (${endereco(i)})` : 'sem imóvel')}</span></h1>
    <p class="suave">${esc(momento)} · contrato de ${dataBr(c.data_entrada)}${R.fimDoContrato(d(), c) ? ` a ${dataBr(R.fimDoContrato(d(), c))}` : ''}${c.garantia_tipo ? ` · garantia: ${esc(c.garantia_tipo)}` : ''}${fiadores.length ? ` · fiador: ${esc(fiadores.join(', '))}` : ''}${c.data_saida ? ` · saída em ${dataBr(c.data_saida)}, guardar até ${dataBr(AI.guardarAte(c))}` : ''}</p>
    ${espera}
    <form id="pasta-fisica" onsubmit="return false">${passo1}${passo2}
      <div class="cartao"><p class="suave">Escolha o que vai para o papel. O importante já vem marcado; o que já está na pasta vem desmarcado.</p>
      <div class="rolagem"><table class="compacta">${tabelaDaPasta(s.itens, s.reg, c) || '<tr><td class="suave">Nenhum documento para a pasta ainda.</td></tr>'}</table></div>${acoes}</div></form>`;
}

/** O que foi escolhido na tela da pasta: { contrato, vagas, anterior, guardada }. */
function escolhaDaTela(el) {
  const form = el.closest('form') || document.getElementById('pasta-fisica');
  const f = new FormData(form);
  return { contrato: Number(el.dataset.contrato), vagas: f.getAll('vaga'), anterior: f.getAll('anterior'), guardada: f.get('guardada') === '1' };
}

/**
 * Itens para gravar: os escolhidos com ``situacao``; os mostrados e desmarcados que ainda não tinham decisão, "fora".
 * O que já estava na pasta e ficou desmarcado não muda.
 */
function itensParaGravar(itens, escolhidos, reg, situacao) {
  const out = [];
  for (const i of itens) {
    if (escolhidos.includes(i.vaga)) out.push({ ...i, situacao });
    else if (!reg.has(i.vaga)) out.push({ ...i, situacao: 'fora' });
  }
  return out;
}

async function gravarEscolha(sel, situacao) {
  const t = memoria.pastaTela;
  if (!t || t.contrato !== sel.contrato) throw new C.ErroUsuario('Abra a pasta do inquilino de novo e escolha os documentos.');
  if (!sel.vagas.length && !sel.anterior.length && !sel.guardada) throw new C.ErroUsuario('Marque pelo menos um documento.');
  await alterar((db) => {
    const itens = itensParaGravar(t.itens, sel.vagas, AI.registrados(db, t.contrato), situacao);
    const anterior = t.anterior ? { contrato_id: t.anterior.id, itens: itensParaGravar(t.anterior.itens, sel.anterior, AI.registrados(db, t.anterior.id), situacao), guardada: sel.guardada } : null;
    AI.registrarPasta(db, t.contrato, { momento: anterior && anterior.guardada && !AI.pastaMontada(db, t.contrato) ? 'heranca' : t.momento, itens, anterior }, login());
  });
}

export const ACOES_PASTA = {
  /** Pasta física: guarda o que foi escolhido e abre a página de impressão (capa + documentos). */
  pastaImprimir(dados, el) {
    const sel = escolhaDaTela(el);
    if (!sel.vagas.length && !sel.anterior.length) throw new C.ErroUsuario('Marque pelo menos um documento para imprimir.');
    memoria.pastaFisica = sel;
    ir(`#/pasta-impressao/${sel.contrato}`);
  },
  /** Pasta física: os marcados já estão em papel (sem imprimir). */
  async pastaPapel(dados, el) {
    await gravarEscolha(escolhaDaTela(el), 'ja_tinha');
    aviso('Pasta física atualizada: documentos marcados como já em papel.');
    await mostrar();
  },
  /** Página de impressão: "Saiu tudo certo": marca como impresso. */
  async pastaImpressa({ contrato }) {
    const sel = memoria.pastaFisica;
    if (!sel || sel.contrato !== Number(contrato)) throw new C.ErroUsuario('Abra a pasta do inquilino de novo e escolha os documentos.');
    await gravarEscolha(sel, 'impresso');
    memoria.pastaFisica = null;
    aviso('Pasta física marcada como impressa.');
    ir(`#/pasta-fisica/${contrato}`);
  },
  /** Caixa da página do inquilino: documentos novos (e trocados) já em papel, ou novos que não vão para a pasta. */
  async pastaRapida({ contrato, como }) {
    await alterar((db) => {
      const c = R.buscar(db, 'contratos', Number(contrato));
      const s = AI.situacaoPasta(db, c);
      const itens = [...s.novos, ...(como === 'fora' ? [] : s.trocados)].map((i) => ({ ...i, situacao: como === 'fora' ? 'fora' : 'ja_tinha' }));
      AI.registrarPasta(db, c.id, { momento: 'durante', itens }, login());
    });
    await mostrar();
  },
  /** Página de impressão: baixa o arquivo que o navegador não imprime (ex.: Word). */
  async pastaBaixar({ escopo, id, nome }) {
    baixar(await S.abrirArquivo(await pastaDoEscopo(escopo, Number(id)), nome), nome);
  },
};

// --------------------------------------------------------------------------
// Página de impressão: capa (folha-resumo) e os documentos, numa impressão só
// --------------------------------------------------------------------------
const imprimivel = (i) => i.tipo === 'recibo' || i.tipo === 'carta' || (i.tipo === 'arquivo' && /^(application\/pdf|image\/)/.test(S.tipoParaAbrir(i.nome)));

function capaHtml(c, escolhidos, reg, { anteriorDentro = null, falta = [] }) {
  const i = buscar('imoveis', c.imovel_id);
  const fiadores = R.fiadoresDoContrato(d(), c.id).map((f) => f.nome).filter(Boolean);
  const novos = new Set(escolhidos.map((x) => x.vaga));
  // a lista inteira: o que já está na pasta (impresso ou já em papel) e o que entra agora
  const naPasta = [...reg.values()].filter((r) => r.situacao !== 'fora' && !novos.has(r.vaga)).map((r) => ({ ...r, data: null, dataPasta: r.data }));
  const linhas = [...naPasta, ...escolhidos.map((x) => ({ ...x, novo: true }))];
  const fim = R.fimDoContrato(d(), c);
  return `<div class="pasta-capa">
    ${d().logo ? `<p style="text-align:right"><img src="${esc(d().logo)}" alt="Logo" style="max-height:60px"></p>` : ''}
    <h2 style="margin:0 0 12px">Pasta do inquilino</h2>
    <p><b>${c.inquilino_tipo === 'Pessoa jurídica (empresa)' ? 'Inquilino' : 'Inquilino(a)'}:</b> ${esc(c.inquilino_nome)}${c.inquilino_cpf ? ` · ${c.inquilino_tipo === 'Pessoa jurídica (empresa)' ? 'CNPJ' : 'CPF'} ${esc(c.inquilino_cpf)}` : ''}<br>
      <b>Imóvel:</b> ${esc(i ? `${i.nome} · ${endereco(i)}` : '-')}<br>
      <b>Contrato:</b> ${dataBr(c.data_entrada)}${fim ? ` a ${dataBr(fim)}` : ''}${c.garantia_tipo ? ` · <b>Garantia:</b> ${esc(c.garantia_tipo)}` : ''}<br>
      <b>Fiador:</b> ${esc(fiadores.join(', ') || '—')}
      ${c.data_saida ? `<br><b>Saída:</b> ${dataBr(c.data_saida)}` : ''}
      ${anteriorDentro ? `<br><b>Dentro desta pasta:</b> pasta de ${esc(anteriorDentro.inquilino_nome)} (contrato anterior, ${dataBr(anteriorDentro.data_entrada)} a ${dataBr(anteriorDentro.data_saida)})` : ''}</p>
    <table class="pasta-lista"><tr><th>Nº</th><th>Documento</th><th>Data</th><th>Págs</th></tr>
      ${linhas.map((x, n) => `<tr><td>${n + 1}</td><td>${esc(x.rotulo)}${x.novo ? ' <b>(novo)</b>' : ''}${x.tipo === 'vistoria' || (x.novo && x.tipo === 'arquivo' && !imprimivel(x)) ? ' · imprimir à parte' : ''}</td>
        <td>${x.data ? dataBr(x.data) : x.dataPasta ? `na pasta desde ${dataBr(x.dataPasta)}` : '-'}</td><td data-paginas="${esc(x.vaga)}">${x.novo && (x.tipo === 'recibo' || x.tipo === 'carta') ? '1' : ''}</td></tr>`).join('')}</table>
    ${falta.length ? `<p style="margin-top:10px"><b>Impressos agora para a pasta de ${esc(falta[0].dono)}:</b> ${falta.map((x) => esc(x.rotulo)).join('; ')}.</p>` : ''}
    <p style="margin-top:18px">Montada em ${dataBr(C.hojeIso())} por ${esc(login())}</p>
    <p style="margin-top:22px">Conferido por: ______________________________ em ____/____/________</p>
    <p class="suave" style="margin-top:14px">${c.data_saida ? `Guardar até ${dataBr(AI.guardarAte(c))} (10 anos depois da saída).` : 'Guardar até 10 anos depois da saída do inquilino.'}</p></div>`;
}

function documentoHtml(i, c) {
  if (i.tipo === 'recibo') {
    try { return `<div class="pasta-doc">${reciboHtml(REC.montarRecibo(d(), i.recibo, { contrato: c }))}<p class="pasta-copia">Cópia da locadora</p></div>`; } catch (e) { return `<div class="pasta-doc"><p>${esc(i.rotulo)}: ${esc(e.message)}</p></div>`; }
  }
  if (i.tipo === 'carta') return `<div class="pasta-doc">${cartaReajuste(c, i.comp)}</div>`;
  if (i.tipo === 'arquivo' && imprimivel(i)) return `<div class="pasta-doc" data-pasta-arquivo data-escopo="${esc(i.escopo)}" data-id="${esc(i.pasta)}" data-nome="${esc(i.nome)}" data-vaga="${esc(i.vaga)}"><p class="nao-imprimir suave">Carregando ${esc(i.rotulo)}…</p></div>`;
  return '';
}

export function telaPastaImpressao(id) {
  const c = buscar('contratos', id);
  const sel = memoria.pastaFisica;
  const t = memoria.pastaTela;
  if (!c || !sel || sel.contrato !== c.id || !t || t.contrato !== c.id) {
    return naoEncontrado('Escolha os documentos na pasta do inquilino', c ? `#/pasta-fisica/${c.id}` : '#/arquivo-impresso', 'Abrir a pasta');
  }
  const escolhidos = t.itens.filter((i) => sel.vagas.includes(i.vaga));
  const a = t.anterior ? buscar('contratos', t.anterior.id) : null;
  const doAnterior = a ? t.anterior.itens.filter((i) => sel.anterior.includes(i.vaga)) : [];
  const reg = AI.registrados(d(), c.id);
  const montagens = AI.montagensDe(d(), c.id);
  const dentro = a && (sel.guardada || montagens.some((m) => m.pasta_anterior && m.pasta_anterior.contrato_id === a.id)) ? a : null;
  const aParte = [...doAnterior.map((i) => ({ ...i, dono: a })), ...escolhidos.map((i) => ({ ...i, dono: c }))].filter((i) => !imprimivel(i));
  const separador = doAnterior.length ? `<div class="pasta-doc"><h2>Pasta de ${esc(a.inquilino_nome)}</h2><p>Documentos que faltavam na pasta de ${esc(a.inquilino_nome)} (contrato anterior): ${doAnterior.map((i) => esc(i.rotulo)).join('; ')}.</p></div>` : '';
  return `<div class="impressao pasta-impressao" data-pasta-impressao>
    <div class="nao-imprimir">
      <p class="suave"><a href="#/pasta-fisica/${c.id}">← Pasta de ${esc(c.inquilino_nome)}</a></p>
      <div class="acoes" style="margin:8px 0"><button data-acao="imprimir">Imprimir tudo</button> <a class="botao secundario" href="#/pasta-fisica/${c.id}">Voltar</a></div>
      ${aParte.length ? `<div class="alerta aviso"><b>Imprimir à parte</b> (o navegador não junta estes na impressão): ${aParte.map((i) => (i.tipo === 'arquivo' ? `${esc(i.rotulo)} ${botao('pastaBaixar', 'Baixar', { escopo: i.escopo, id: i.pasta, nome: i.nome }, 'secundario mini')}` : `${esc(i.rotulo)} ${i.link ? link(i.link, 'Abrir', 'botao secundario mini') : ''}`)).join(' · ')}</div>` : ''}
      <div class="alerta info" id="pasta-confirmar"><b>Saiu tudo certo na impressora?</b> Só depois de conferir as folhas.
        <div class="acoes" style="margin-top:6px">${botao('pastaImpressa', 'Sim, marcar como impresso', { contrato: c.id }, 'pequeno')} <button type="button" class="secundario pequeno" data-acao="imprimir">Não, imprimir de novo</button></div></div>
    </div>
    ${capaHtml(c, escolhidos, reg, { anteriorDentro: dentro, falta: doAnterior.map((i) => ({ ...i, dono: a.inquilino_nome })) })}
    ${separador}${doAnterior.map((i) => documentoHtml(i, a)).join('')}
    ${escolhidos.map((i) => documentoHtml(i, c)).join('')}
  </div>`;
}

/** Depois de desenhar a página de impressão: põe cada PDF (página a página) e cada foto no lugar, e conta as páginas na capa. */
export async function ligarPastaImpressao(raiz) {
  const pagina = raiz.querySelector('[data-pasta-impressao]');
  if (!pagina) return;
  window.addEventListener('afterprint', () => { const x = document.getElementById('pasta-confirmar'); if (x) { x.classList.add('destaque'); x.scrollIntoView({ block: 'center' }); } }, { once: true });
  let pdfjs = null;
  for (const caixa of pagina.querySelectorAll('[data-pasta-arquivo]')) {
    const { escopo, id, nome, vaga } = caixa.dataset;
    const conta = (n) => { const td = pagina.querySelector(`[data-paginas="${CSS.escape(vaga)}"]`); if (td) td.textContent = String(n); };
    try {
      const arq = await S.abrirArquivo(await pastaDoEscopo(escopo, Number(id)), nome);
      const tipo = S.tipoParaAbrir(nome);
      if (tipo.startsWith('image/')) {
        const img = document.createElement('img');
        img.className = 'pasta-pagina';
        img.alt = nome;
        img.src = URL.createObjectURL(new Blob([arq], { type: tipo }));
        caixa.replaceChildren(img);
        conta(1);
        continue;
      }
      pdfjs = pdfjs || await (await carregarParte(() => import('../visualizador.js'))).carregarPdfJs();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await arq.arrayBuffer()), isEvalSupported: false }).promise;
      const telas = [];
      for (let n = 1; n <= pdf.numPages; n += 1) {
        const p = await pdf.getPage(n);
        const vista = p.getViewport({ scale: 1240 / p.getViewport({ scale: 1 }).width }); // A4 a ~150 dpi
        const tela = document.createElement('canvas');
        tela.className = 'pasta-pagina';
        tela.width = Math.floor(vista.width); tela.height = Math.floor(vista.height);
        await p.render({ canvasContext: tela.getContext('2d'), viewport: vista }).promise;
        telas.push(tela);
      }
      caixa.replaceChildren(...telas);
      conta(pdf.numPages);
      pdf.destroy?.();
    } catch (e) {
      caixa.innerHTML = `<p class="alerta aviso">Não consegui pôr ${esc(nome)} na impressão (${esc(e.message)}). Imprima à parte.</p>`;
    }
  }
}
