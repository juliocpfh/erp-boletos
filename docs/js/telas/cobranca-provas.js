// Cobrança: registros e provas (pedido do dono em 2026-11-24). Na página do boleto vencido (e do acordo) e na página do inquilino:
// cada passo e cada gasto da cobrança (carta, e-mail, notificação, protesto, cartório, advogado…) com os comprovantes, e o ZIP com
// a lista em PDF e todos os arquivos para levar ao advogado. Só guarda a prova: nada daqui soma no boleto, na NF, no acordo nem no
// cálculo final (a cobrança de honorários e despesas espera a decisão do dono, documentacao/HONORARIOS_E_DESPESAS_DE_COBRANCA.md).
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
      <td class="pre">${esc(r.descricao || '')}</td><td class="n">${r.valor ? reais(r.valor) : '-'}</td><td>${comArquivos(r) || '<span class="suave">sem arquivo</span>'}</td>
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
