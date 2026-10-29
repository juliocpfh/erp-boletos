// Todos os dados numa planilha Excel (uma aba por cadastro) e num PDF (uma ficha por registro), para ler e guardar.
// Não serve para voltar os dados ao sistema: para isso existe o ZIP.
import * as C from './calculos.js';
import * as F from './formularios.js';
import { TABELAS } from './regras.js';

// Tipo de cada campo, tirado dos formulários de cadastro (o primeiro que aparece vale): diz o que é dinheiro.
const CAMPOS = new Map();
for (const v of Object.values(F)) {
  if (!Array.isArray(v)) continue;
  for (const c of v) if (c && c.nome && c.rotulo && !CAMPOS.has(c.nome)) CAMPOS.set(c.nome, { tipo: c.tipo });
}

/** Campos que nunca saem do sistema (resumo e sal da senha). */
const SECRETO = /senha|hash|(^|_)sal$/;
// Campos em centavos que não estão nos formulários (calculados nos boletos, NFs, saídas…)
const DINHEIRO = /^(valor|aluguel|desconto|iptu|seguro|taxa_boleto|outros|multa|juros|ressarcimento|reserva|caucao|deposito|complemento|debitos|total|saldo|credito|abatimento|devolucao|garantia)(_|$)/;
const NAO_DINHEIRO = /(_percentual|_descricao|_parcela|_parcelas|_data|_comp|_competencia|_na_nf|_tipo|_id|_comprovante|_inscricao|_mes|_ano|_dias|_texto|_obs)$/;

export const ehDinheiro = (nome) => (CAMPOS.has(nome) ? CAMPOS.get(nome).tipo === 'dinheiro' : DINHEIRO.test(nome) && !NAO_DINHEIRO.test(nome));

// Formulário de cada cadastro: o rótulo da coluna vem dele (o mesmo campo pode ter outro nome em outro cadastro)
const FORM_DA_TABELA = { imoveis: F.IMOVEL, contratos: F.CONTRATO, correcoes: F.CORRECAO, seguros: F.SEGURO, iptus: F.IPTU,
  titularidades: F.TITULARIDADE, cobrancas: F.COBRANCA, fiadores: F.FIADOR, aplicacoes: F.APLICACAO, correcoes_garantia: F.CORRECAO_GARANTIA, devolucoes_garantia: F.DEVOLUCAO_GARANTIA,
  renovacoes: F.RENOVACAO, encerramentos: F.ENCERRAMENTO, avulsas: F.AVULSA, emitentes: F.EMITENTE, usuarios: F.USUARIO,
  reformas: F.REFORMA, solicitacoes: F.SOLICITACAO, ressarcimentos: F.RESSARCIMENTO, leituras: F.LEITURA };

/** Nome da coluna: o rótulo no formulário do cadastro ou o nome do campo escrito por extenso (ex.: valor_pago → Valor pago). */
export function rotuloCampo(nome, tabela = '') {
  if (nome === 'id') return 'Nº';
  const doForm = (FORM_DA_TABELA[tabela] || []).find((c) => c && c.nome === nome && c.rotulo);
  if (doForm) return doForm.rotulo.replace(/\s*\*$/, '');
  const t = nome.replace(/_/g, ' ');
  return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1);
}

/** Valor como fica na planilha: dinheiro em reais (número), datas no formato brasileiro, sim/não, listas em texto. */
export function valorCelula(nome, v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return ehDinheiro(nome) && Number.isInteger(v) ? v / 100 : v;
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 32000);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return C.dataBr(s);
  if (/^\d{4}-\d{2}$/.test(s)) return C.compBr(s);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return new Date(s).toLocaleString('pt-BR');
  return s.slice(0, 32000);
}

/** Valor como fica no PDF (texto): dinheiro com R$. */
export const valorTexto = (nome, v) => {
  const x = valorCelula(nome, v);
  return typeof x === 'number' && ehDinheiro(nome) && Number.isInteger(v) ? C.reais(v) : String(x);
};

/**
 * Cadastros para exportar: [{ tabela, titulo, colunas: [{ nome, rotulo, dinheiro }], registros }].
 * Inclui todas as tabelas do banco (sem os campos de senha) e, com ``historico``, o histórico de alterações.
 */
export function dadosParaExportar(d, { historico = true } = {}) {
  const lista = [];
  for (const [tabela, titulo] of Object.entries(TABELAS)) {
    const registros = d[tabela];
    if (!Array.isArray(registros)) continue;
    const nomes = ['id']; // o número do registro vem primeiro
    for (const r of registros) for (const k of Object.keys(r)) if (!SECRETO.test(k) && !nomes.includes(k)) nomes.push(k);
    lista.push({ tabela, titulo, registros, colunas: nomes.map((nome) => ({ nome, rotulo: rotuloCampo(nome, tabela), dinheiro: ehDinheiro(nome) })) });
  }
  if (historico) {
    lista.push({ tabela: 'historico', titulo: 'Histórico de alterações', registros: [...(d.historico || [])].reverse(),
      colunas: [['quando', 'Quando'], ['usuario', 'Usuário'], ['acao', 'Ação'], ['tabela', 'Cadastro'], ['registro_id', 'Nº do registro'], ['descricao', 'Descrição']]
        .map(([nome, rotulo]) => ({ nome, rotulo, dinheiro: false })) });
  }
  return lista;
}

/** Nome de aba aceito pelo Excel: até 31 letras, sem / \ ? * [ ] : e sem repetir. */
export function nomeAba(titulo, usados) {
  const base = titulo.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
  let nome = base;
  for (let n = 2; usados.has(nome.toLowerCase()); n += 1) nome = `${base.slice(0, 27)} (${n})`;
  usados.add(nome.toLowerCase());
  return nome;
}

/** Planilha com uma aba de resumo e uma aba por cadastro. */
export async function planilhaDeTudo(ExcelJS, d) {
  const wb = new ExcelJS.Workbook();
  const lista = dadosParaExportar(d);
  const resumo = wb.addWorksheet('Resumo');
  resumo.columns = [{ header: 'Cadastro', width: 40 }, { header: 'Registros', width: 12 }];
  resumo.addRow([`Todos os dados em ${new Date().toLocaleString('pt-BR')}`, '']);
  for (const t of lista) resumo.addRow([t.titulo, t.registros.length]);
  resumo.getRow(1).font = { bold: true };
  const usados = new Set(['resumo']);
  for (const t of lista) {
    const ws = wb.addWorksheet(nomeAba(t.titulo, usados));
    ws.columns = t.colunas.map((c) => ({ header: c.rotulo, key: c.nome, width: Math.min(40, Math.max(10, c.rotulo.length + 2)), style: c.dinheiro ? { numFmt: '"R$" #,##0.00' } : {} }));
    for (const r of t.registros) ws.addRow(t.colunas.map((c) => valorCelula(c.nome, r[c.nome])));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Título de cada registro no PDF (ex.: "Inquilino / contrato nº 12 · Maria"). */
function tituloRegistro(t, r) {
  const nome = r.inquilino_nome || r.nome || r.descricao || r.assunto || r.tomador_nome || '';
  return `${t.titulo} nº ${r.id ?? '-'}${nome ? ` · ${String(nome).slice(0, 80)}` : ''}`;
}

// As fontes padrão do PDF só têm letras latinas: emojis e outros símbolos saem.
const latino = (s) => String(s).replace(/[^\u0009\u000a -ÿ–—‘’“”•…]/g, '');

/** PDF com uma ficha por registro (só os campos preenchidos). O histórico de alterações fica só na planilha. */
export function pdfDeTudo(JsPDF, d) {
  const pdf = new JsPDF({ unit: 'mm', format: 'a4' });
  const M = 12; const L = 210 - 2 * M; const FIM = 297 - 14;
  let y = M;
  const pular = (h) => { if (y + h > FIM) { pdf.addPage(); y = M; } };
  const escrever = (texto, { tam = 8, negrito = false, recuo = 0, depois = 0 } = {}) => {
    pdf.setFont('helvetica', negrito ? 'bold' : 'normal');
    pdf.setFontSize(tam);
    const altura = tam * 0.42;
    for (const linha of pdf.splitTextToSize(latino(texto), L - recuo)) {
      pular(altura);
      pdf.text(linha, M + recuo, y + altura * 0.8);
      y += altura;
    }
    y += depois;
  };
  escrever('Administração de Imóveis · todos os dados', { tam: 14, negrito: true, depois: 1 });
  escrever(`Gerado em ${new Date().toLocaleString('pt-BR')}. Só os campos preenchidos; o histórico de alterações está na planilha.`, { depois: 4 });
  for (const t of dadosParaExportar(d, { historico: false }).filter((x) => x.registros.length)) { // cadastros vazios ficam de fora
    pular(14);
    escrever(`${t.titulo} (${t.registros.length})`, { tam: 12, negrito: true, depois: 2 });
    for (const r of t.registros) {
      pular(10);
      escrever(tituloRegistro(t, r), { tam: 9, negrito: true, depois: 0.5 });
      for (const c of t.colunas) {
        const v = r[c.nome];
        if (c.nome === 'id' || v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
        let txt = valorTexto(c.nome, v);
        if (txt.length > 600) txt = `${txt.slice(0, 600)}…`;
        escrever(`${c.rotulo}: ${txt}`, { recuo: 3 });
      }
      y += 2.5;
    }
    y += 3;
  }
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(`Página ${p} de ${total}`, 210 - M, 297 - 7, { align: 'right' });
  }
  return pdf.output('blob');
}
