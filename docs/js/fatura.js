// Fatura de locação: na tela, no mesmo desenho da planilha (LOJA1.xlsx), e em Excel preenchido a partir do modelo.
import { dataBr, reais } from './calculos.js';
import { esc } from './formularios.js';
import { numeroFatura } from './regras.js';

// Larguras das colunas A..M e alturas das linhas 3..35 copiadas da planilha (em caracteres e pontos).
const LARGURAS = [2, 8, 6.8, 6.2, 8, 11.2, 4.7, 6.7, 5.8, 6, 13, 6, 15.5];
const ALTURAS = { 3: 50.25, 7: 9.95, 9: 9.95, 10: 20.1, 11: 20.1, 12: 20.1, 13: 9.95, 14: 9.95, 15: 9.95, 16: 30, 17: 30, 18: 30, 27: 30, 28: 30, 29: 30, 30: 30, 31: 30, 32: 3.75, 33: 20.1, 34: 20.1 };

const maiusc = (t) => String(t || '').toLocaleUpperCase('pt-BR');

/**
 * Linhas da fatura. Cada célula: [colspan, conteúdo, classes]. As classes de borda imitam a planilha:
 * be/bd/bt/bb = borda esquerda/direita/topo/base.
 */
function linhas(f, emitente) {
  const num = `Nº ${numeroFatura(f.numero)}`;
  const periodo = `${dataBr(f.periodo_inicio)} A ${dataBr(f.periodo_fim)}`;
  const vazio = (n, cls = '') => [n, '', cls];
  return {
    3: [[1, '', 'be bt'], [9, `<span class="f-empresa">${esc(maiusc(emitente.nome))}</span>`, 'bt bd'], [3, '<b class="f-titulo">FATURA DE LOCAÇÃO</b>', 'be bt bd centro']],
    4: [[1, '', 'be'], [9, esc(emitente.razao_social), 'bd f-12'], [3, `<span class="f-num">${num}</span>`, 'be bd centro topo']],
    5: [[1, '', 'be'], [9, esc(emitente.cnpj ? `CNPJ ${emitente.cnpj}` : ''), 'bd f-12'], [3, `<span class="f-12 f-light">Emissão: ${dataBr(f.emissao)}</span>`, 'be bd centro topo']],
    6: [[1, '', 'be bb'], [9, esc(emitente.endereco || ''), 'bd bb f-12 f-light'], [3, '', 'be bd bb']],
    7: [vazio(13, 'be bd bt bb')],
    8: [[1, '', 'be bt'], [9, 'TOMADOR DE SERVIÇO', 'bt bd f-11'], [1, '', 'be bd bt'], [2, '', 'bt bd']],
    9: [[1, '', 'be'], [9, '', 'bd'], [1, '', 'be bd'], [2, '', 'bd']],
    10: [[1, '', 'be'], [3, '<b>NOME DO CLIENTE</b>', 'f-12 f-light'], [6, `<b>${esc(maiusc(f.tomador_nome))}</b>`, 'bd f-12 f-light'], [1, '<b>TELEFONE</b>', 'be bd f-10 f-light'], [2, `<b>${esc(f.tomador_telefone || '')}</b>`, 'bd f-11']],
    11: [[1, '', 'be'], [3, '<b>CPF</b>', 'f-12 f-light'], [6, `<b>${esc(f.tomador_documento || '')}</b>`, 'bd f-12 f-light'], [1, '', 'be bd'], [2, '', 'bd']],
    12: [[1, '', 'be bb'], [3, '<b>ENDEREÇO</b>', 'bb f-12 f-light'], [6, `<b>${esc(maiusc(f.tomador_endereco))}</b>`, 'bd bb f-12 f-light'], [1, '', 'be bd bb'], [2, '', 'bd bb']],
    13: [vazio(13, 'be bd bt bb')],
    14: [vazio(13, 'be bd bt bb')],
    15: [vazio(13, 'be bd bt preto')],
    16: [[4, '', 'be bt bb'], [2, '<b>PERÍODO DO SERVIÇO</b>', 'bt bb f-12 f-light'], [7, `<b>${periodo}</b>`, 'bt bb bd f-12 f-light']],
    17: [[1, '', 'be bt bb'], [12, '<b>DADOS DA LOCAÇÃO</b>', 'bt bb bd f-12 f-light']],
    18: [[1, '', 'be bd bt'], [1, '<b>ITEM</b>', 'be bd bt centro f-11 f-light'], [3, '<b>DESCRIÇÃO</b>', 'be bd bt centro f-11 f-light'], [1, '<b>MUNICÍPIO</b>', 'be bd bt centro f-11 f-light'], [1, '<b>UN</b>', 'be bd bt centro f-11 f-light'], [3, '<b>QUANTIDADE/MESES</b>', 'be bd bt centro f-11 f-light'], [2, '<b>VALOR UNITÁRIO</b>', 'be bd bt centro f-11 f-light'], [1, '<b>CUSTO TOTAL</b>', 'be bd bt bb centro f-11 f-light']],
    ...Object.fromEntries([19, 20, 21, 23, 24, 25].map((r) => [r, [[1, '', 'be bd'], [1, '', 'be bd'], [3, '', 'be bd'], [1, '', 'be bd'], [1, '', 'be bd'], [3, '', 'be bd'], [2, '', 'be bd'], [1, '', `be bd${r === 25 ? ' bb' : ''}`]]])),
    22: [[1, '', 'be bd'], [1, '1', 'be bd centro f-12 f-light'], [3, 'LOCAÇÃO DE IMÓVEL', 'be bd centro f-12 f-light'], [1, esc(maiusc(f.municipio)), 'be bd centro f-12 f-light'], [1, 'UN', 'be bd centro f-12 f-light'], [3, '1', 'be bd centro f-12 f-light'], [2, `<span class="moeda">${reais(f.valor)}</span>`, 'be bd f-12 f-light'], [1, `<span class="moeda">${reais(f.valor)}</span>`, 'be bd f-12 f-light']],
    26: [[1, '', 'be bt bb'], [5, '', 'bt bb'], [6, '<b>VALOR TOTAL DA FATURA</b>', 'be bd bt bb centro f-12 f-light'], [1, `<b class="moeda">${reais(f.valor)}</b>`, 'be bd bt bb f-12 f-light']],
    ...Object.fromEntries([27, 28, 29, 30, 31].map((r) => [r, [[13, '', 'be bd']]])),
    32: [vazio(13, 'be bd preto')],
    33: [[10, `RECEBEMOS DE ${esc(maiusc(f.tomador_nome))} AS LOCAÇÕES CONSTANTES NESSA FATURA INDICADA AO LADO`, 'be bd f-canhoto'], [3, '<b>FATURA DE LOCAÇÃO</b>', 'be bd centro f-12']],
    34: [[4, 'DATA DO RECEBIMENTO', 'be bd bt f-canhoto'], [6, 'IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', 'be bd bt f-canhoto'], [3, `<b>${num}</b>`, 'be bd bt centro f-12']],
    35: [[4, '', 'be bd bb'], [6, '', 'be bd bb'], [3, '', 'be bd bb']],
  };
}

export function faturaHtml(f, emitente) {
  const ls = linhas(f, emitente);
  const cols = LARGURAS.map((w) => `<col style="width:${(w * 7 + 5).toFixed(0)}px">`).join('');
  const corpo = Object.keys(ls).map(Number).sort((a, b) => a - b).map((r) => {
    const altura = ALTURAS[r] || 15;
    return `<tr style="height:${(altura * 4 / 3).toFixed(1)}px">${ls[r].map(([n, t, cls]) => `<td colspan="${n}" class="${cls}">${t}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="fatura-xls"><table><colgroup>${cols}</colgroup>${corpo}</table></div>`;
}

// --------------------------------------------------------------------------
// Excel preenchido a partir do modelo (o próprio arquivo da planilha)
// --------------------------------------------------------------------------
function abaDaEmpresa(wb, emitente, usadas) {
  const livres = wb.worksheets.filter((w) => !usadas.has(w.id));
  const porNome = (nome) => livres.find((w) => w.name.trim().toLocaleUpperCase('pt-BR') === nome.trim().toLocaleUpperCase('pt-BR'));
  return (emitente.aba_modelo && porNome(emitente.aba_modelo))
    || porNome(emitente.nome.split(/\s+/)[0])
    || livres[0];
}

/**
 * Preenche o modelo com as faturas de um mesmo número (uma aba por empresa) e devolve o arquivo .xlsx.
 * Abas que sobrarem no modelo são removidas.
 */
export async function faturaExcel(ExcelJS, modeloBuffer, faturas, emitentes) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(modeloBuffer);
  const usadas = new Set();
  for (const f of faturas) {
    const e = emitentes.find((x) => x.id === f.emitente_id);
    const ws = abaDaEmpresa(wb, e, usadas);
    if (!ws) throw new Error('O modelo Excel tem menos abas do que empresas nesta fatura.');
    usadas.add(ws.id);
    const num = `Nº ${numeroFatura(f.numero)}`;
    const valor = f.valor / 100;
    const set = (ref, v) => { ws.getCell(ref).value = v; };
    set('B3', maiusc(e.nome));
    set('B4', e.razao_social || '');
    set('B5', e.cnpj ? `CNPJ ${e.cnpj}` : '');
    set('B6', e.endereco || '');
    set('L4', num);
    set('L5', `Emissão: ${dataBr(f.emissao)}`);
    set('E10', maiusc(f.tomador_nome));
    set('L10', f.tomador_telefone || '');
    set('E11', f.tomador_documento || '');
    set('E12', maiusc(f.tomador_endereco));
    set('G16', `${dataBr(f.periodo_inicio)} A ${dataBr(f.periodo_fim)}`);
    set('F22', maiusc(f.municipio));
    set('K22', valor);
    set('M22', { formula: 'K22', result: valor });
    set('M26', { formula: 'M22', result: valor });
    set('A33', `RECEBEMOS DE ${maiusc(f.tomador_nome)} AS LOCAÇÕES CONSTANTES NESSA FATURA INDICADA AO LADO`);
    set('L34', num);
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToWidth = 1;
    ws.pageSetup.fitToHeight = 1;
  }
  for (const ws of [...wb.worksheets]) if (!usadas.has(ws.id)) wb.removeWorksheet(ws.id);
  wb.calcProperties.fullCalcOnLoad = true;
  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
