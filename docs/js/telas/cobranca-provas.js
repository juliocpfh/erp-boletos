// Cobrança: registros e provas (pedido do dono em 2026-11-24). Na página do boleto vencido (e do acordo) e na página do inquilino:
// cada passo e cada gasto da cobrança (carta, e-mail, notificação, protesto, cartório, advogado…) com os comprovantes, e o ZIP com
// a lista em PDF e todos os arquivos para levar ao advogado. Os registros são a base dos honorários e das despesas de cobrança, que
// entram SÓ no acordo e no cálculo final, por escolha (caixa do fim deste arquivo; nunca no boleto do mês nem na NF, 24/11/2026).
// Regras: regras.js ("Cobrança: registros e provas"); formulário: CADASTROS.cobranca_registros (cadastros.js).
import { alterar, aviso, baixar, jsPdf, jsZip, login, mostrar } from '../app.js';
import * as S from '../armazenamento.js';
import * as C from '../calculos.js';
import { dataBr, reais } from '../calculos.js';
import { esc } from '../formularios.js';
import * as R from '../regras.js';
import { AVISO_PROVAS_COBRANCA } from './cadastros.js';
import { alterarApagandoAnexos, arquivoSumiu, botao, buscar, d, link, opera, pastaDoEscopo } from './comum.js';

const comArquivos = (r) => (r.arquivos || []).map((nome) => `<span class="nw"><a href="#" data-acao="abrirArquivo" data-escopo="contrato" data-id="${r.contrato_id}" data-nome="${esc(nome)}" title="${esc(nome)}">📎 ${esc(nome)}</a>${arquivoSumiu('contrato', r.contrato_id, nome) ? ' <span class="etiqueta aviso">sumiu da pasta</span>' : ''}${opera()
  ? ` ${botao('removerArquivoCobranca', 'tirar', { id: r.id, nome }, 'secundario mini', `Tirar o arquivo "${nome}" deste registro? Ele é apagado da pasta (o registro continua).`).replace('<button ', '<button title="Tirar só este arquivo" ')}` : ''}</span>`).join('<br>');

/** Tabela dos registros (do mais antigo para o mais novo), com o "a que se refere" quando ``comReferente``; ``boletoId``: o Editar volta ao boleto. */
function tabelaRegistros(lista, comReferente, boletoId = null) {
  if (!lista.length) return '<p class="suave">Nenhum registro ainda.</p>';
  return `<div class="rolagem"><table><tr><th>Data</th><th>O que foi feito</th>${comReferente ? '<th>Referente a</th>' : ''}<th>Descrição</th><th class="n">Gasto</th><th>Comprovantes</th><th></th></tr>
    ${lista.map((r) => `<tr><td class="nw">${dataBr(r.data)}</td><td>${esc(r.tipo)}</td>${comReferente ? `<td>${r.cobranca_id && buscar('cobrancas', r.cobranca_id) ? link(`#/cobranca/${r.cobranca_id}?ir=provas`, esc(R.referenteDoRegistro(d(), r)), '') : esc(R.referenteDoRegistro(d(), r))}</td>` : ''}
      <td class="pre">${r.advogado ? `<b>Advogado: ${esc(r.advogado)}</b>
` : ''}${esc(r.descricao || '')}</td><td class="n">${r.valor ? reais(r.valor) : '-'}</td><td>${comArquivos(r) || '<span class="suave">sem arquivo</span>'}</td>
      <td class="n nw">${opera() ? `${link(`#/editar/cobranca_registros/${r.id}${boletoId ? `?cobranca=${boletoId}` : ''}`, 'Editar')} ${botao('excluir', '×', { tabela: 'cobranca_registros', id: r.id }, 'x-excluir', `Excluir este registro da cobrança${(r.arquivos || []).length ? ` e ${C.plural(r.arquivos.length, 'o arquivo', 'os arquivos')} dele` : ''}?`)}` : ''}</td></tr>`).join('')}
    </table></div>
    ${R.gastoDaCobranca(lista) ? `<p class="suave">Gasto anotado: <b>${reais(R.gastoDaCobranca(lista))}</b> (não é cobrado do inquilino).</p>` : ''}`;
}

/** O boleto mostra a caixa: vencido e não pago, em acordo, parcela de acordo, ou já com registros. */
const mostraNoBoleto = (cb, lista) => lista.length || R.emAcordo(cb) || R.ehParcelaAcordo(cb) || (!cb.data_pagamento && C.vencido(cb.vencimento, C.hojeIso()));

/** Caixa "Cobrança: registros e provas" na página do boleto (os do boleto e os do acordo de que ele faz parte). */
export function caixaProvasBoleto(cb) {
  const lista = R.registrosDoBoleto(d(), cb);
  if (!mostraNoBoleto(cb, lista)) return '';
  const acordo = cb.acordo_id || cb.acordo_parcela_de;
  const novo = (q, texto, cls = 'botao') => link(`#/novo/cobranca_registros?contrato=${cb.contrato_id}&${q}`, texto, cls);
  return `<div class="cartao nao-imprimir" id="provas"><div class="cabecalho"><h2>Cobrança: registros e provas</h2>${opera() ? `<span class="acoes">${novo(`cobranca=${cb.id}`, '+ Registrar passo ou despesa')}${acordo ? ` ${novo(`acordo=${acordo}`, '+ Registrar no acordo', 'botao secundario')}` : ''}</span>` : ''}</div>
    <p class="suave">${esc(AVISO_PROVAS_COBRANCA)} Todos os registros deste inquilino e o botão para baixar tudo junto ficam na ${link(`#/contrato/${cb.contrato_id}?ir=provas-cobranca`, 'página do inquilino', '')}.</p>
    ${tabelaRegistros(lista, !!acordo, cb.id)}</div>`;
}

/** Caixa na página do inquilino: todos os registros e o ZIP para o advogado. Sem registros e sem nada vencido, não aparece. */
export function caixaProvasContrato(c) {
  const lista = R.registrosCobrancaDo(d(), c.id);
  const hoje = C.hojeIso();
  const temAtraso = d().cobrancas.some((cb) => cb.contrato_id === c.id && ((!cb.data_pagamento && C.vencido(cb.vencimento, hoje)) || R.emAcordo(cb)));
  if (!lista.length && !temAtraso) return '';
  return `<div class="cartao" id="provas-cobranca"><div class="cabecalho"><h2>Cobrança: registros e provas</h2><span class="acoes">${opera() ? link(`#/novo/cobranca_registros?contrato=${c.id}`, '+ Registrar passo ou despesa') : ''}
      ${lista.length ? botao('zipProvasCobranca', '⬇ Baixar tudo (ZIP para o advogado)', { contrato: c.id }, 'secundario') : ''}</span></div>
    <p class="suave">${esc(AVISO_PROVAS_COBRANCA)} O ZIP traz a lista em PDF (data, o que foi feito, valor, descrição) e todos os comprovantes.</p>
    ${tabelaRegistros(lista, true)}</div>`;
}

/** Texto em Latin-1 (o jsPDF sem fonte própria não desenha outros caracteres; sai sem eles). */
const latino = (s) => String(s ?? '').replace(/[^\u0009\u000a -ÿ–—‘’“”•…]/g, '');

/** PDF com a lista dos registros, na ordem em que aconteceram, e o nome de cada arquivo dentro do ZIP. */
export function pdfDasProvas(JsPDF, d, c, lista, nomesNoZip) {
  const pdf = new JsPDF({ unit: 'mm', format: 'a4' });
  const M = 14; const L = 210 - 2 * M; const FIM = 297 - 16;
  let y = M;
  const escrever = (texto, { tam = 9, negrito = false, recuo = 0, depois = 0 } = {}) => {
    pdf.setFont('helvetica', negrito ? 'bold' : 'normal');
    pdf.setFontSize(tam);
    const altura = tam * 0.45;
    for (const linha of pdf.splitTextToSize(latino(texto), L - recuo)) {
      if (y + altura > FIM) { pdf.addPage(); y = M; }
      pdf.text(linha, M + recuo, y + altura * 0.8);
      y += altura;
    }
    y += depois;
  };
  const i = R.buscar(d, 'imoveis', c.imovel_id);
  escrever('Cobrança: registros e provas', { tam: 15, negrito: true, depois: 1.5 });
  escrever(`Inquilino: ${c.inquilino_nome}${c.inquilino_cpf ? ` (${c.inquilino_cpf})` : ''}`, { tam: 10 });
  if (i) escrever(`Imóvel: ${i.nome}${i.endereco ? ` · ${i.endereco}` : ''}`, { tam: 10 });
  escrever(`Contrato: ${dataBr(c.data_entrada || c.vigencia_inicio)}${c.data_saida ? ` a ${dataBr(c.data_saida)}` : ''} · gerado em ${C.agoraBr()}`, { tam: 10, depois: 2 });
  escrever(`${lista.length} registro(s). Gasto anotado: ${reais(R.gastoDaCobranca(lista))} (registrado como prova; não foi cobrado do inquilino). Os comprovantes estão na pasta "Comprovantes" deste ZIP.`, { depois: 4 });
  lista.forEach((r, n) => {
    if (y + 20 > FIM) { pdf.addPage(); y = M; }
    escrever(`${n + 1}. ${dataBr(r.data)} · ${r.tipo}${r.valor ? ` · gasto ${reais(r.valor)}` : ''}`, { tam: 10, negrito: true, depois: 0.5 });
    escrever(`Referente a: ${R.referenteDoRegistro(d, r)}`, { recuo: 4 });
    if (r.advogado) escrever(`Advogado: ${r.advogado}`, { recuo: 4 });
    if (r.descricao) escrever(r.descricao, { recuo: 4 });
    const arqs = (r.arquivos || []).map((nome) => nomesNoZip.get(`${r.id}|${nome}`) || `${nome} (não encontrado na pasta)`);
    escrever(arqs.length ? `Comprovantes: ${arqs.join('; ')}` : 'Sem comprovante anexado.', { recuo: 4, depois: 3 });
  });
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(latino(`${c.inquilino_nome} · página ${p} de ${total}`), 210 - M, 297 - 8, { align: 'right' });
  }
  return pdf.output('blob');
}

export const ACOES_PROVAS = {
  async removerArquivoCobranca({ id, nome }) {
    await alterarApagandoAnexos((db) => R.removerArquivoDoRegistro(db, Number(id), nome, login()));
    aviso('Arquivo tirado do registro.');
    await mostrar();
  },

  /** ZIP para o advogado: "Lista da cobranca.pdf" e a pasta "Comprovantes" (cada arquivo com o número do registro na frente). */
  async zipProvasCobranca({ contrato }) {
    const c = buscar('contratos', contrato);
    if (!c) throw new C.ErroUsuario('Este inquilino não existe mais. Atualize a página.');
    const lista = R.registrosCobrancaDo(d(), c.id);
    if (!lista.length) throw new C.ErroUsuario('Nenhum registro da cobrança para baixar.');
    const [JSZip, JsPDF] = await Promise.all([jsZip(), jsPdf()]);
    const zip = new JSZip();
    const nomes = new Map();
    const faltam = [];
    let dir = null;
    try { dir = await pastaDoEscopo('contrato', c.id, false); } catch { /* pasta ainda não existe */ }
    for (const [n, r] of lista.entries()) {
      for (const nome of r.arquivos || []) {
        try {
          const conteudo = await S.lerConteudo(await dir.getFileHandle(nome));
          const noZip = `Comprovantes/${String(n + 1).padStart(2, '0')} ${S.limparNome(nome)}`;
          zip.file(noZip, conteudo);
          nomes.set(`${r.id}|${nome}`, noZip);
        } catch { faltam.push(nome); }
      }
    }
    zip.file('Lista da cobranca.pdf', pdfDasProvas(JsPDF, d(), c, lista, nomes));
    const arquivo = S.limparNome(`Cobranca ${c.inquilino_nome} ${C.hojeIso()}.zip`);
    baixar(await zip.generateAsync({ type: 'blob' }), arquivo);
    await alterar((db) => R.registrar(db, login(), 'Exportação', 'contratos', c.id, `Cobrança de ${c.inquilino_nome}: registros e provas baixados em ZIP (${lista.length} registro(s), ${nomes.size} arquivo(s))`, null, {}, false));
    aviso(`ZIP baixado: ${arquivo} (${C.plural(lista.length, 'registro')}, ${C.plural(nomes.size, 'arquivo')}).${faltam.length ? ` Não achei na pasta: ${faltam.join(', ')}.` : ''}`, faltam.length ? 'aviso' : 'ok');
  },
};

// --------------------------------------------------------------------------
// Honorários e despesas de cobrança no acordo e no cálculo final (aprovados em 24/11/2026)
// --------------------------------------------------------------------------
const usarOuNao = (nome) => `<span class="nw"><label class="check-mini"><input type="radio" name="${nome}" value="1"> Usar</label>
  <label class="check-mini"><input type="radio" name="${nome}" value="0" checked> Não cobrar</label></span>`;

/**
 * Caixa "Honorários e despesas de cobrança" do acordo (``onde`` = 'acordo') e do cálculo final ('saida'): a sugestão dos
 * honorários (quando cabem) e cada despesa com comprovante, cada uma com "Usar" / "Não cobrar" (vem "Não cobrar": nunca
 * entra sozinha), e o campo dos honorários fixados na ação. Nunca no boleto do mês nem na NF.
 */
export function caixaCobrancaHtml(c, boletos, hoje, onde) {
  const s = R.sugestaoHonorarios(d(), c, boletos, hoje);
  const desp = R.despesasCobraveis(d(), c);
  const ondeTexto = onde === 'acordo' ? 'somam ao total combinado, divididos pelos boletos do acordo, fora da NF e sem multa nem juros' : 'somam aos débitos ao salvar, cada um na sua linha da descrição (não some à mão no campo "Débitos")';
  const hon = s.cabe ? `<span data-hon-texto>${esc(s.texto)}: <b>${reais(s.valor)}</b></span><br>${usarOuNao('cob_honorarios')}`
    : `<span class="suave">Honorários do advogado: não cabem (${esc(s.faltam.join('; '))}).</span>`;
  return `<div class="caixa-cobranca" data-caixa-cobranca style="border:1px solid var(--borda, #ddd);border-radius:6px;padding:8px 10px;margin:10px 0">
    <b>Honorários e despesas de cobrança</b><br><small class="suave">Só no acordo e no cálculo final da saída, nunca no boleto do mês nem na NF. Os marcados em "Usar" ${ondeTexto}. Honorários: ${String(s.percentual).replace('.', ',')}% sobre o valor de hoje dos boletos com mais de ${s.dias} dias de atraso, com aviso antes e advogado que atuou registrado.</small>
    <p style="margin:6px 0">${hon}</p>
    ${desp.cobraveis.map((x) => `<p style="margin:6px 0">${esc(x.texto)}: <b>${reais(x.valor)}</b><br>${usarOuNao(`cob_despesa_${x.registro.id}`)}</p>`).join('')}
    ${!desp.cobraveis.length ? '<p class="suave" style="margin:6px 0">Nenhuma despesa de cobrança com comprovante a cobrar.</p>' : ''}
    ${desp.semComprovante.length ? `<p class="suave" style="margin:6px 0">Sem comprovante anexado (não pode ser cobrado): ${desp.semComprovante.map((r) => `${esc(r.tipo)} de ${dataBr(r.data)} (${reais(r.valor)})`).join('; ')}. Anexe o comprovante no registro para cobrar.</p>` : ''}
    <details><summary>Honorários da ação judicial (despejo ou fixados pelo juiz)</summary>
      <p class="suave" style="margin:6px 0">O sistema não calcula: no despejo, 20% quando o inquilino paga para ficar; nas demais ações, o que o juiz fixar. Não some com os honorários de fora da Justiça.</p>
      <div class="acoes"><p><label>Valor fixado</label><input name="cob_judicial" inputmode="decimal" data-dinheiro style="width:140px"></p>
      <p style="flex:1"><label>Processo e decisão</label><input name="cob_judicial_texto" placeholder="Ex.: despejo nº 0001234-56.2026.8.16.0001, purgação da mora, 20%"></p></div></details></div>`;
}

/** O que foi escolhido na caixa, de um FormData ou da resposta da janela ({ nome: [valores] }), para ``R.cobrancaEscolhida``. */
export function escolhaDaCobranca(fonte) {
  const fd = typeof FormData !== 'undefined' && fonte instanceof FormData;
  const valor = (k) => String((fd ? fonte.getAll(k) : fonte[k] || [])[0] ?? '');
  const chaves = fd ? [...new Set(fonte.keys())] : Object.keys(fonte || {});
  const t = valor('cob_judicial').trim();
  let judicial = 0;
  if (t) {
    try { judicial = C.centavos(t); } catch { throw new C.ErroUsuario('Honorários da ação: valor inválido (ex.: 740,00).'); }
  }
  return {
    honorarios: valor('cob_honorarios') === '1',
    despesas: chaves.filter((k) => /^cob_despesa_\d+$/.test(k) && valor(k) === '1').map((k) => Number(k.slice('cob_despesa_'.length))),
    judicial, judicial_texto: valor('cob_judicial_texto'),
  };
}
