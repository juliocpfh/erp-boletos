// Fatura de locação: na tela, no mesmo desenho da planilha (LOJA1.xlsx), e em Excel preenchido a partir do modelo.
import { dataBr, reais } from './calculos.js';
import { esc } from './formularios.js';
import { numeroFatura } from './regras.js';

// Larguras das colunas A..M e alturas das linhas 3..35 copiadas da planilha (em caracteres e pontos).
const LARGURAS = [2, 8, 6.8, 6.2, 8, 11.2, 4.7, 6.7, 5.8, 6, 13, 6, 15.5];
const ALTURAS = { 3: 50.25, 7: 9.95, 9: 9.95, 10: 20.1, 11: 20.1, 12: 20.1, 13: 9.95, 14: 9.95, 15: 9.95, 16: 30, 17: 30, 18: 30, 27: 30, 28: 30, 29: 30, 30: 30, 31: 30, 32: 3.75, 33: 20.1, 34: 20.1 };

const maiusc = (t) => String(t || '').toLocaleUpperCase('pt-BR');
const corta = (t, n) => String(t || '').slice(0, n);
/** Rótulo do documento do tomador na NF (tela e Excel): mais de 11 dígitos é CNPJ, senão CPF. */
export const rotuloDocumento = (f) => (String(f.tomador_documento || '').replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF');
/** Linhas da caixa grande de observações (linhas 27 a 31 da planilha), até 90 caracteres cada. */
export function linhasObservacoes(texto, porLinha = 90, maxLinhas = 5) {
  const linhas = [];
  for (const par of String(texto || '').split(/\r?\n/)) {
    let atual = '';
    // "R$" anda junto com o valor: a linha não termina em "R$" com o número na de baixo (ex.: "... por atraso R$" / "115,77")
    const palavras = par.split(/\s+/).filter(Boolean).reduce((ps, w) => { if (ps.at(-1) === 'R$') ps[ps.length - 1] += ` ${w}`; else ps.push(w); return ps; }, []);
    for (const palavra of palavras) {
      const p = palavra.slice(0, porLinha);
      if (atual && `${atual} ${p}`.length > porLinha) { linhas.push(atual); atual = p; } else atual = atual ? `${atual} ${p}` : p;
    }
    linhas.push(atual);
  }
  while (linhas.length && !linhas.at(-1)) linhas.pop();
  return linhas.slice(0, maxLinhas);
}

/** Quanto cabe em cada campo da NF (as células da planilha): o resto é cortado na tela, no PDF e no Excel. */
export const LIMITES_NF = { nome: 60, endereco: 70, municipio: 25, observacoes_por_linha: 90, observacoes_linhas: 5 };

const resumo = (t, n = 50) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/**
 * O que a NF vai cortar deste texto (nome, endereço, observações; o município só no Excel). Cada item:
 * ``{ campo, texto }``, com ``texto`` pronto para a tela. Ex.: nome com 75 letras →
 * 'Nome do cliente cortado: fica "MARIA … SOUZA" (cabe até 60 letras, tem 75; sai "DA SILVA").'
 * Aceita a NF gravada (``faturas``) ou os dados antes de numerar (``tomador_nome``, ``tomador_endereco``, ``observacoes``, ``municipio``).
 */
export function cortesDaFatura(f) {
  const cortes = [];
  const simples = (campo, chave, limite, onde = '') => {
    const t = String(f[chave] || ''); // a NF corta o texto como está gravado (corta)
    const sai = maiusc(t.slice(limite)).trim();
    if (!sai) return; // só espaços sobrando no fim: nada se perde
    const fica = maiusc(t.slice(0, limite)).trim();
    cortes.push({ campo, texto: `${campo} cortado${onde}: fica "${resumo(fica, 70)}" (cabe até ${limite} letras, tem ${t.trim().length}; sai "${resumo(sai)}").` });
  };
  simples('Nome do cliente', 'tomador_nome', LIMITES_NF.nome);
  simples('Endereço', 'tomador_endereco', LIMITES_NF.endereco);
  simples('Município', 'municipio', LIMITES_NF.municipio, ' no Excel');
  const obs = String(f.observacoes || '');
  const { observacoes_por_linha: porLinha, observacoes_linhas: maxLinhas } = LIMITES_NF;
  const todas = linhasObservacoes(obs, porLinha, Infinity);
  const sobram = todas.slice(maxLinhas).filter(Boolean);
  const grandes = obs.split(/\s+/).filter((p) => p.length > porLinha);
  if (sobram.length || grandes.length) {
    const partes = [];
    if (sobram.length) partes.push(`ficam de fora ${sobram.length} linha(s): "${resumo(sobram.join(' '))}"`);
    if (grandes.length) partes.push(`palavra com mais de ${porLinha} letras é cortada ("${resumo(grandes[0], 30)}")`);
    cortes.push({ campo: 'Observações', texto: `Observações cortadas: cabem ${maxLinhas} linhas de até ${porLinha} letras; ${partes.join('; ')}.` });
  }
  return cortes;
}

/**
 * Avisos de corte de várias NFs, um por número (as NFs de um número, uma por empresa, têm o mesmo tomador):
 * ex.: 'NF nº 0157: Endereço cortado: fica "RUA …" (cabe até 70 letras, tem 84; sai "APTO 12").'
 */
export function avisosDeCorte(faturas) {
  const vistos = new Set();
  const avisos = [];
  for (const f of faturas) {
    if (vistos.has(f.numero)) continue;
    vistos.add(f.numero);
    for (const c of cortesDaFatura(f)) avisos.push(`NF nº ${numeroFatura(f.numero)}: ${c.texto}`);
  }
  return avisos;
}

/**
 * Quantidade e valor unitário da linha da locação. Mês inteiro: "1" e o valor da NF. Mês incompleto (entrada ou saída, NF
 * com ``dias``/``dias_mes``): a fração do mês comercial e o valor do mês inteiro; o total continua o valor da NF.
 * Ex.: NF de R$ 960,00 com 16/30 → quantidade "16/30", unitário R$ 1.800,00, total R$ 960,00.
 */
export function quantidadeDaFatura(f) {
  if (!(f.dias > 0) || !(f.dias_mes > f.dias)) return { proporcional: false, quantidade: '1', unitario: f.valor };
  // o proporcional foi arredondado no centavo: entre os valores do mês que dão esta NF, o mais "redondo"
  // (R$ 1.066,67 com 16/30 → R$ 2.000,00, e não R$ 2.000,01)
  const base = Math.round((f.valor * f.dias_mes) / f.dias);
  const dao = [];
  for (let k = -3; k <= 3; k += 1) if (Math.round(((base + k) * f.dias) / f.dias_mes) === f.valor) dao.push(base + k);
  const redondo = (u) => (u % 100 === 0 ? 2 : u % 10 === 0 ? 1 : 0);
  const unitario = dao.length ? dao.sort((a, b) => redondo(b) - redondo(a) || Math.abs(a - base) - Math.abs(b - base))[0] : base;
  return { proporcional: true, quantidade: `${f.dias}/${f.dias_mes}`, unitario };
}

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
    10: [[1, '', 'be'], [3, '<b>NOME DO CLIENTE</b>', 'f-12 f-light'], [6, `<b>${esc(maiusc(corta(f.tomador_nome, LIMITES_NF.nome)))}</b>`, 'bd f-12 f-light duas-linhas'], [1, '<b>TELEFONE</b>', 'be bd f-10 f-light'], [2, `<b>${esc(f.tomador_telefone || '')}</b>`, 'bd f-11']],
    11: [[1, '', 'be'], [3, `<b>${rotuloDocumento(f)}</b>`, 'f-12 f-light'], [6, `<b>${esc(f.tomador_documento || '')}</b>`, 'bd f-12 f-light'], [1, '', 'be bd'], [2, '', 'bd']],
    12: [[1, '', 'be bb'], [3, '<b>ENDEREÇO</b>', 'bb f-12 f-light'], [6, `<b>${esc(maiusc(corta(f.tomador_endereco, LIMITES_NF.endereco)))}</b>`, 'bd bb f-12 f-light duas-linhas'], [1, '', 'be bd bb'], [2, '', 'bd bb']],
    13: [vazio(13, 'be bd bt bb')],
    14: [vazio(13, 'be bd bt bb')],
    15: [vazio(13, 'be bd bt preto')],
    16: [[4, '', 'be bt bb'], [2, '<b>PERÍODO DO SERVIÇO</b>', 'bt bb f-12 f-light'], [7, `<b>${periodo}</b>`, 'bt bb bd f-12 f-light']],
    17: [[1, '', 'be bt bb'], [12, '<b>DADOS DA LOCAÇÃO</b>', 'bt bb bd f-12 f-light']],
    18: [[1, '', 'be bd bt'], [1, '<b>ITEM</b>', 'be bd bt centro f-11 f-light'], [3, '<b>DESCRIÇÃO</b>', 'be bd bt centro f-11 f-light'], [1, '<b>MUNICÍPIO</b>', 'be bd bt centro f-11 f-light'], [1, '<b>UN</b>', 'be bd bt centro f-11 f-light'], [3, '<b>QUANTIDADE/MESES</b>', 'be bd bt centro f-11 f-light'], [2, '<b>VALOR UNITÁRIO</b>', 'be bd bt centro f-11 f-light'], [1, '<b>CUSTO TOTAL</b>', 'be bd bt bb centro f-11 f-light']],
    ...Object.fromEntries([19, 20, 21, 23, 24, 25].map((r) => [r, [[1, '', 'be bd'], [1, '', 'be bd'], [3, '', 'be bd'], [1, '', 'be bd'], [1, '', 'be bd'], [3, '', 'be bd'], [2, '', 'be bd'], [1, '', `be bd${r === 25 ? ' bb' : ''}`]]])),
    22: [[1, '', 'be bd'], [1, '1', 'be bd centro f-12 f-light'], [3, 'LOCAÇÃO DE IMÓVEL', 'be bd centro f-12 f-light'], [1, esc(maiusc(f.municipio)), 'be bd centro f-12 f-light'], [1, 'UN', 'be bd centro f-12 f-light'], [3, esc(quantidadeDaFatura(f).quantidade), 'be bd centro f-12 f-light'], [2, `<span class="moeda">${reais(quantidadeDaFatura(f).unitario)}</span>`, 'be bd f-12 f-light'], [1, `<span class="moeda">${reais(f.valor)}</span>`, 'be bd f-12 f-light']],
    26: [[1, '', 'be bt bb'], [5, '', 'bt bb'], [6, '<b>VALOR TOTAL DA FATURA</b>', 'be bd bt bb centro f-12 f-light'], [1, `<b class="moeda">${reais(f.valor)}</b>`, 'be bd bt bb f-12 f-light']],
    ...Object.fromEntries([27, 28, 29, 30, 31].map((r, n) => [r, [[1, '', 'be'], [12, esc(linhasObservacoes(f.observacoes)[n] || ''), 'bd f-11 f-light']]])),
    32: [vazio(13, 'be bd preto')],
    33: [[10, `RECEBEMOS DE ${esc(maiusc(f.tomador_nome))} AS LOCAÇÕES CONSTANTES NESSA FATURA INDICADA AO LADO`, 'be bd f-canhoto'], [3, '<b>FATURA DE LOCAÇÃO</b>', 'be bd centro f-12']],
    34: [[4, 'DATA DO RECEBIMENTO', 'be bd bt f-canhoto'], [6, 'IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', 'be bd bt f-canhoto'], [3, `<b>${num}</b>`, 'be bd bt centro f-12']],
    35: [[4, '', 'be bd bb'], [6, '', 'be bd bb'], [3, '', 'be bd bb']],
  };
}

/** Largura de cada coluna em pixels e da folha inteira: fixas, para toda NF sair do mesmo tamanho. */
const PX = LARGURAS.map((w) => Math.round(w * 7 + 5));
const LARGURA_TOTAL = PX.reduce((t, w) => t + w, 0);

export function faturaHtml(f, emitente) {
  const ls = linhas(f, emitente);
  const cols = PX.map((w) => `<col style="width:${w}px">`).join('');
  const corpo = Object.keys(ls).map(Number).sort((a, b) => a - b).map((r) => {
    const altura = ALTURAS[r] || 15;
    return `<tr style="height:${(altura * 4 / 3).toFixed(1)}px">${ls[r].map(([n, t, cls]) => `<td colspan="${n}" class="${cls}">${t}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="fatura-xls"><table style="width:${LARGURA_TOTAL}px"><colgroup>${cols}</colgroup>${corpo}</table></div>`;
}

/**
 * Texto que não cabe na célula (nome, endereço ou observação compridos) diminui a letra só daquela célula, em vez de
 * alargar a tabela ou esticar a linha: assim toda NF tem o mesmo tamanho na tela, na impressão e no PDF.
 * Chame depois que a fatura estiver na página (precisa medir).
 */
export function encaixarFaturas(raiz) {
  const diminuir = (td, fator) => {
    // mede tudo antes de mudar: o texto de dentro herda a letra da célula e encolheria duas vezes
    const els = [td, ...td.querySelectorAll('*')];
    const tamanhos = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
    els.forEach((el, k) => { el.style.fontSize = `${(tamanhos[k] * fator * 0.99).toFixed(2)}px`; });
  };
  for (const tabela of raiz.querySelectorAll('.fatura-xls table')) {
    for (const tr of tabela.rows) {
      const altura = parseFloat(tr.style.height) || 0;
      for (const td of tr.cells) {
        if (!td.textContent.trim()) continue;
        const faixa = document.createRange();
        faixa.selectNodeContents(td);
        const livre = td.clientWidth - 6; // 3px de margem de cada lado
        // nome e endereço compridos: se numa linha a letra ficaria pequena demais, passam a ocupar duas linhas
        if (td.classList.contains('duas-linhas') && faixa.getBoundingClientRect().width * 0.75 > livre) {
          td.style.whiteSpace = 'normal';
          td.style.lineHeight = '1.05';
        }
        const quebra = getComputedStyle(td).whiteSpace !== 'nowrap'; // texto em mais de uma linha: cuida da altura
        for (let i = 0; i < 12; i += 1) {
          const cx = faixa.getBoundingClientRect();
          const fator = quebra ? (altura && cx.height > altura - 2 ? 0.94 : 1) : (cx.width > livre ? Math.max(0.6, livre / cx.width) : 1);
          if (fator >= 1) break;
          diminuir(td, fator);
        }
      }
    }
  }
}

// --------------------------------------------------------------------------
// Excel preenchido a partir do modelo (o próprio arquivo da planilha)
// --------------------------------------------------------------------------
const mesmoNome = (a, b) => String(a || '').trim().toLocaleUpperCase('pt-BR') === String(b || '').trim().toLocaleUpperCase('pt-BR');

/**
 * Nome da aba de uma empresa no Excel da NF: o do cadastro ("Aba no modelo Excel") ou a 1ª palavra do nome
 * (ex.: "ANK Administradora" → "ANK"). O Excel aceita até 31 letras e não aceita : \ / ? * [ ].
 */
export function nomeDaAba(emitente) {
  const nome = String(emitente.aba_modelo || '').trim() || String(emitente.nome || '').trim().split(/\s+/)[0];
  return nome.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31).trim().toLocaleUpperCase('pt-BR') || 'NF';
}

/** Nomes pelos quais uma aba do modelo é desta empresa: o do cadastro e a 1ª palavra do nome. */
const nomesDaEmpresa = (e) => [e.aba_modelo, String(e.nome || '').trim().split(/\s+/)[0]].filter((n) => String(n || '').trim());

/**
 * Aba do modelo para a empresa: a que tem o nome dela; senão, uma que sobrou e não tem o nome de outra empresa desta NF
 * (de preferência nem de outra empresa cadastrada), que passa a se chamar como a empresa. ``null``: não sobrou aba.
 */
function abaDaEmpresa(wb, emitente, usadas, outrasDaNf, outrasCadastradas) {
  const livres = wb.worksheets.filter((w) => !usadas.has(w.id));
  const deQuem = (lista) => (w) => lista.some((e) => nomesDaEmpresa(e).some((n) => mesmoNome(w.name, n)));
  for (const n of nomesDaEmpresa(emitente)) {
    const ws = livres.find((w) => mesmoNome(w.name, n));
    if (ws) return ws; // aba com o nome da empresa: fica como está (ANK e JCK no modelo padrão)
  }
  const daNf = deQuem(outrasDaNf);
  const cadastradas = deQuem(outrasCadastradas);
  return livres.find((w) => !daNf(w) && !cadastradas(w)) || livres.find((w) => !daNf(w)) || null;
}

/** Dá à aba o nome da empresa, sem repetir o de outra aba (o Excel não aceita duas iguais): "ALFA", "ALFA 2"… */
function renomearAba(wb, ws, nome) {
  if (mesmoNome(ws.name, nome)) return;
  const ocupado = (n) => wb.worksheets.some((w) => w !== ws && mesmoNome(w.name, n));
  let final = nome;
  for (let k = 2; ocupado(final); k += 1) final = `${nome.slice(0, 31 - String(k).length - 1)} ${k}`;
  ws.name = final;
}

/**
 * Preenche o modelo com as faturas de um mesmo número (uma aba por empresa) e devolve o arquivo .xlsx.
 * As abas vêm das empresas cadastradas: a aba com o nome da empresa (no modelo padrão, ANK e JCK); empresa sem aba
 * no modelo usa uma que sobrou, ou uma cópia da 1ª aba do modelo, com o nome dela (``nomeDaAba``).
 * Abas que sobrarem no modelo são removidas.
 */
export async function faturaExcel(ExcelJS, modeloBuffer, faturas, emitentes) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(modeloBuffer);
  const usadas = new Set();
  const daNf = faturas.map((f) => emitentes.find((x) => x.id === f.emitente_id)).filter(Boolean);
  let molde = null; // o modelo sem nada preenchido, para copiar a aba quando faltar
  for (const f of faturas) {
    const e = emitentes.find((x) => x.id === f.emitente_id);
    if (!e) throw new Error('Empresa da NF não encontrada no cadastro de Empresas.');
    let ws = abaDaEmpresa(wb, e, usadas, daNf.filter((x) => x !== e), emitentes.filter((x) => x !== e));
    if (!ws) {
      if (!molde) { molde = new ExcelJS.Workbook(); await molde.xlsx.load(modeloBuffer); }
      const base = molde.worksheets[0];
      if (!base) throw new Error('O modelo Excel da NF não tem nenhuma aba.');
      ws = wb.addWorksheet(`NF ${wb.worksheets.length + 1}`);
      // a cópia leva células, estilos, larguras, alturas e células mescladas (o ExcelJS lê as mescladas em "mergeCells")
      ws.model = { ...base.model, mergeCells: base.model.merges, id: ws.id, name: ws.name };
    }
    renomearAba(wb, ws, nomeDaAba(e));
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
    set('E10', maiusc(corta(f.tomador_nome, LIMITES_NF.nome)));
    set('L10', f.tomador_telefone || '');
    set('B11', rotuloDocumento(f)); // como na tela: empresa (mais de 11 dígitos) é CNPJ
    set('E11', f.tomador_documento || '');
    set('E12', maiusc(corta(f.tomador_endereco, LIMITES_NF.endereco)));
    linhasObservacoes(f.observacoes).forEach((t, n) => set(`B${27 + n}`, t));
    set('G16', `${dataBr(f.periodo_inicio)} A ${dataBr(f.periodo_fim)}`);
    set('F22', maiusc(corta(f.municipio, LIMITES_NF.municipio)));
    const q = quantidadeDaFatura(f);
    if (q.proporcional) {
      // mês incompleto: quantidade "16/30" e valor do mês inteiro; o total é o valor da NF
      set('H22', q.quantidade);
      set('K22', q.unitario / 100);
      set('M22', valor);
    } else {
      set('K22', valor);
      set('M22', { formula: 'K22', result: valor });
    }
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
