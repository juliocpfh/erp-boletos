// Fatura de locação (docs/js/fatura.js): quebra das observações, HTML no desenho da planilha (texto do usuário escapado,
// valores em reais) e Excel preenchido a partir do modelo (com um ExcelJS falso: aba por empresa, abas sobrando removidas).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as F from '../docs/js/fatura.js';

const ANK = { id: 1, nome: 'ANK Administradora', razao_social: 'ANK ADMINISTRADORA LTDA', cnpj: '11.222.333/0001-81', endereco: 'Rua A, 1', aba_modelo: '' };
const JCK = { id: 2, nome: 'JCK Administradora', razao_social: 'JCK ADMINISTRADORA LTDA', cnpj: '11.222.333/0001-81', aba_modelo: 'Jck ' };
const fatura = (extra = {}) => ({
  numero: 157, emitente_id: 1, emissao: '2026-11-07', periodo_inicio: '2026-10-01', periodo_fim: '2026-10-31', valor: 364445, municipio: 'Curitiba',
  tomador_nome: 'maria exemplo <da silva>', tomador_documento: '529.982.247-25', tomador_telefone: '(41) 99999-0000', tomador_endereco: 'Rua das Flores, 45', observacoes: 'Aluguel de outubro\nPix na chave', ...extra,
});

test('linhasObservacoes: respeita 90 caracteres por linha, parágrafos, no máximo 5 linhas e palavras maiores que a linha', () => {
  assert.deepEqual(F.linhasObservacoes('Aluguel de outubro\nPix na chave'), ['Aluguel de outubro', 'Pix na chave']);
  assert.deepEqual(F.linhasObservacoes(''), []);
  assert.deepEqual(F.linhasObservacoes('  \n\n'), [], 'linhas vazias no fim somem');
  const longa = Array.from({ length: 30 }, (_, i) => `palavra${i}`).join(' ');
  const linhas = F.linhasObservacoes(longa);
  assert.ok(linhas.every((l) => l.length <= 90));
  assert.equal(linhas.join(' '), longa, 'nada se perde na quebra');
  assert.equal(F.linhasObservacoes(Array(10).fill('x').join('\n')).length, 5);
  assert.deepEqual(F.linhasObservacoes('a'.repeat(100), 10), ['aaaaaaaaaa'], 'palavra maior que a linha é cortada');
  assert.deepEqual(F.linhasObservacoes('um dois tres', 8), ['um dois', 'tres']);
});

test('faturaHtml: número com 4 dígitos, empresa e tomador em maiúsculas e escapados, valor em reais, período e observações nas linhas certas', () => {
  const html = F.faturaHtml(fatura(), ANK);
  assert.match(html, /Nº 0157/);
  assert.match(html, /ANK ADMINISTRADORA<\/span>/);
  assert.match(html, /CNPJ 11\.222\.333\/0001-81/);
  assert.match(html, /MARIA EXEMPLO &lt;DA SILVA&gt;/, 'texto do usuário passa por esc()');
  assert.doesNotMatch(html, /<da silva>/i);
  assert.equal((html.match(/R\$ 3\.644,45/g) || []).length, 3, 'unitário, total do item e total da fatura');
  assert.match(html, /01\/10\/2026 A 31\/10\/2026/);
  assert.match(html, /Emissão: 07\/11\/2026/);
  assert.match(html, /CURITIBA/);
  assert.match(html, /Aluguel de outubro<\/td>/);
  assert.match(html, /Pix na chave<\/td>/);
  assert.match(html, /RECEBEMOS DE MARIA EXEMPLO &lt;DA SILVA&gt; AS LOCAÇÕES/);
  assert.equal((html.match(/<tr /g) || []).length, 33, 'linhas 3 a 35 da planilha');
  const semCnpj = F.faturaHtml(fatura(), { ...ANK, cnpj: '' });
  assert.doesNotMatch(semCnpj, /CNPJ/);
  const nomeLongo = F.faturaHtml(fatura({ tomador_nome: 'A'.repeat(80) }), ANK);
  assert.match(nomeLongo, new RegExp(`<b>${'A'.repeat(60)}</b>`), 'nome do cliente cortado em 60 na linha 10');
});

/** ExcelJS falso: só o que faturaExcel usa. */
function excelFalso(nomesDasAbas) {
  class Workbook {
    constructor() {
      this.worksheets = nomesDasAbas.map((name, i) => ({ id: i + 1, name, celulas: {}, pageSetup: {}, getCell(ref) { const c = this.celulas; return { set value(v) { c[ref] = v; }, get value() { return c[ref]; } }; } }));
      this.calcProperties = {};
      this.xlsx = { load: async (buf) => { this.carregado = buf; }, writeBuffer: async () => new TextEncoder().encode('xlsx') };
    }
    removeWorksheet(id) { this.worksheets = this.worksheets.filter((w) => w.id !== id); }
  }
  const lib = { Workbook };
  lib.ultimo = () => lib.wb;
  const Orig = Workbook;
  lib.Workbook = class extends Orig { constructor() { super(); lib.wb = this; } };
  return lib;
}

test('faturaExcel: uma aba por empresa (pelo nome da aba do cadastro ou pela 1ª palavra do nome), células preenchidas, abas que sobram removidas', async () => {
  const lib = excelFalso(['ANK', ' JCK ', 'Modelo']);
  const blob = await F.faturaExcel(lib, new Uint8Array([1]), [fatura(), fatura({ emitente_id: 2, valor: 100000 })], [ANK, JCK]);
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const wb = lib.ultimo();
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['ANK', ' JCK '], 'a aba "Modelo" sobrou e foi removida');
  const [ank, jck] = wb.worksheets;
  assert.equal(ank.celulas.B3, 'ANK ADMINISTRADORA');
  assert.equal(ank.celulas.L4, 'Nº 0157');
  assert.equal(ank.celulas.E10, 'MARIA EXEMPLO <DA SILVA>', 'no Excel não há HTML: sem escape');
  assert.equal(ank.celulas.E11, '529.982.247-25');
  assert.equal(ank.celulas.K22, 3644.45, 'em reais na planilha');
  assert.deepEqual(ank.celulas.M22, { formula: 'K22', result: 3644.45 });
  assert.equal(ank.celulas.B27, 'Aluguel de outubro');
  assert.equal(ank.celulas.B28, 'Pix na chave');
  assert.equal(ank.celulas.G16, '01/10/2026 A 31/10/2026');
  assert.equal(ank.pageSetup.fitToPage, true);
  assert.equal(jck.celulas.K22, 1000);
  assert.equal(jck.celulas.B5, 'CNPJ 11.222.333/0001-81');
  assert.equal(wb.calcProperties.fullCalcOnLoad, true);
  // mais empresas do que abas: a que falta vira cópia da 1ª aba do modelo (teste com o ExcelJS de verdade, abaixo)
});

// ---------------------------------------------------------------------------------------------------------------
// Texto cortado na NF (Regras 31): avisa qual campo e como fica
// ---------------------------------------------------------------------------------------------------------------
test('cortesDaFatura: nome, endereço, município (só no Excel) e observações que não cabem; texto curto não avisa', () => {
  assert.deepEqual(F.cortesDaFatura(fatura()), [], 'NF comum: nada cortado');
  const nome = 'Maria Exemplo de Souza Albuquerque Pereira dos Santos Oliveira Lima';
  assert.ok(nome.length > 60);
  const [c] = F.cortesDaFatura(fatura({ tomador_nome: nome }));
  assert.equal(c.campo, 'Nome do cliente');
  assert.match(c.texto, /^Nome do cliente cortado: fica "MARIA EXEMPLO DE SOUZA/);
  assert.match(c.texto, new RegExp(`cabe até 60 letras, tem ${nome.length}; sai "${nome.slice(60).trim().toLocaleUpperCase('pt-BR')}"`));
  const end = 'Rua Professora Doutora Maria das Graças Albuquerque, 1234, apto 1201, bloco B, Água Verde';
  const [e] = F.cortesDaFatura(fatura({ tomador_endereco: end }));
  assert.equal(e.campo, 'Endereço');
  assert.match(e.texto, /cabe até 70 letras/);
  assert.match(e.texto, /sai "[^"]*ÁGUA VERDE"/);
  assert.deepEqual(F.cortesDaFatura(fatura({ tomador_nome: `${'A'.repeat(60)}   ` })), [], 'só espaços sobrando: nada se perde');
  const [m] = F.cortesDaFatura(fatura({ municipio: 'São José dos Pinhais do Norte Grande' }));
  assert.match(m.texto, /^Município cortado no Excel/);
  // observações: 7 linhas → as 2 últimas ficam de fora; palavra com mais de 90 letras é cortada
  const [o] = F.cortesDaFatura(fatura({ observacoes: ['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete'].join('\n') }));
  assert.equal(o.campo, 'Observações');
  assert.match(o.texto, /cabem 5 linhas de até 90 letras; ficam de fora 2 linha\(s\): "seis sete"/);
  const [p] = F.cortesDaFatura(fatura({ observacoes: `Chave ${'x'.repeat(95)}` }));
  assert.match(p.texto, /palavra com mais de 90 letras é cortada/);
  assert.deepEqual(F.cortesDaFatura(fatura({ observacoes: 'a\n\n\n\n\n\n\n' })), [], 'linhas em branco no fim não contam');
});

test('avisosDeCorte: um aviso por número (as NFs de cada empresa têm o mesmo tomador), com o número da NF', () => {
  const longo = { tomador_endereco: 'Rua Professora Doutora Maria das Graças Albuquerque, 1234, apto 1201, bloco B, Água Verde' };
  const avisos = F.avisosDeCorte([fatura(longo), fatura({ ...longo, emitente_id: 2 }), fatura({ numero: 158 })]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /^NF nº 0157: Endereço cortado: fica "RUA PROFESSORA/);
});

test('faturaHtml: os limites da tela são os mesmos do aviso (LIMITES_NF) e a tabela continua com largura fixa', () => {
  const html = F.faturaHtml(fatura({ tomador_endereco: 'R'.repeat(100) }), ANK);
  assert.match(html, new RegExp(`<b>${'R'.repeat(F.LIMITES_NF.endereco)}</b>`));
  assert.match(html, /<table style="width:\d+px">/, 'nunca width: auto');
});

// ---------------------------------------------------------------------------------------------------------------
// Excel com o ExcelJS de verdade e o modelo padrão (Venda 24): as abas vêm das empresas cadastradas
// ---------------------------------------------------------------------------------------------------------------
const ExcelJS = createRequire(import.meta.url)('../docs/vendor/exceljs.min.js');
const MODELO = fs.readFileSync(new URL('../docs/modelos/fatura-modelo.xlsx', import.meta.url));
const ALFA = { id: 3, nome: 'Alfa Imóveis', razao_social: 'ALFA IMOVEIS LTDA', cnpj: '11.222.333/0001-81', aba_modelo: '' };

async function abrir(blob) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()));
  return wb;
}

test('nomeDaAba: aba do cadastro ou 1ª palavra do nome, em maiúsculas, sem os caracteres que o Excel recusa', () => {
  assert.equal(F.nomeDaAba(ANK), 'ANK');
  assert.equal(F.nomeDaAba(JCK), 'JCK');
  assert.equal(F.nomeDaAba(ALFA), 'ALFA');
  assert.equal(F.nomeDaAba({ nome: 'X', aba_modelo: 'Loja: Centro/Sul' }), 'LOJA  CENTRO SUL');
  assert.equal(F.nomeDaAba({ nome: 'A'.repeat(40) }).length, 31);
});

test('faturaExcel (modelo padrão): ANK e JCK como hoje; empresa sem aba usa a que sobrou ou uma cópia, com o nome dela', async () => {
  // ANK e JCK: as abas do modelo, como sempre
  let wb = await abrir(await F.faturaExcel(ExcelJS, MODELO, [fatura(), fatura({ emitente_id: 2, valor: 100000 })], [ANK, JCK]));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['ANK', 'JCK']);
  assert.equal(wb.getWorksheet('ANK').getCell('B3').value, 'ANK ADMINISTRADORA');
  assert.equal(wb.getWorksheet('JCK').getCell('K22').value, 1000);
  assert.equal(wb.getWorksheet('ANK').getCell('B11').value, 'CPF', 'pessoa física');
  // tomador empresa: "CNPJ" no Excel, como na tela (o modelo dizia sempre "CPF")
  wb = await abrir(await F.faturaExcel(ExcelJS, MODELO, [fatura({ tomador_documento: '11.222.333/0001-81' })], [ANK, JCK]));
  assert.equal(wb.getWorksheet('ANK').getCell('B11').value, 'CNPJ');
  assert.equal(wb.getWorksheet('ANK').getCell('E11').value, '11.222.333/0001-81');
  assert.match(F.faturaHtml(fatura({ tomador_documento: '11.222.333/0001-81' }), ANK), /<b>CNPJ<\/b>/, 'mesma regra da tela');
  assert.equal(F.rotuloDocumento(fatura()), 'CPF');
  // só a ANK: a aba JCK sobra e sai
  wb = await abrir(await F.faturaExcel(ExcelJS, MODELO, [fatura()], [ANK, JCK]));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['ANK']);
  // outra imobiliária (só a Alfa cadastrada): usa a 1ª aba do modelo, com o nome da empresa
  wb = await abrir(await F.faturaExcel(ExcelJS, MODELO, [fatura({ emitente_id: 3 })], [ALFA]));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['ALFA']);
  assert.equal(wb.worksheets[0].getCell('B3').value, 'ALFA IMÓVEIS');
  // Alfa e JCK, com a ANK cadastrada: a Alfa fica com a aba que sobrou (ANK), a JCK com a dela
  wb = await abrir(await F.faturaExcel(ExcelJS, MODELO, [fatura({ emitente_id: 3 }), fatura({ emitente_id: 2 })], [ANK, JCK, ALFA]));
  assert.deepEqual(wb.worksheets.map((w) => w.name).sort(), ['ALFA', 'JCK']);
  assert.equal(wb.getWorksheet('JCK').getCell('B3').value, 'JCK ADMINISTRADORA');
  assert.equal(wb.getWorksheet('ALFA').getCell('B3').value, 'ALFA IMÓVEIS');
  // três empresas na mesma NF e o modelo com duas abas: a 3ª é cópia da 1ª aba, com o mesmo desenho
  wb = await abrir(await F.faturaExcel(ExcelJS, MODELO, [fatura(), fatura({ emitente_id: 2 }), fatura({ emitente_id: 3, valor: 50000 })], [ANK, JCK, ALFA]));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['ANK', 'JCK', 'ALFA']);
  const alfa = wb.getWorksheet('ALFA');
  const ank = wb.getWorksheet('ANK');
  assert.equal(alfa.getCell('B3').value, 'ALFA IMÓVEIS');
  assert.equal(alfa.getCell('K22').value, 500);
  assert.equal(alfa.getCell('L3').value, 'FATURA DE LOCAÇÃO', 'textos fixos do modelo vieram na cópia');
  assert.deepEqual([...alfa.model.merges].sort(), [...ank.model.merges].sort(), 'células mescladas iguais às da 1ª aba');
  assert.equal(alfa.getColumn(13).width, ank.getColumn(13).width);
  // duas empresas com a mesma 1ª palavra: a 2ª aba ganha um número (o Excel não aceita nomes repetidos)
  const ALFA2 = { ...ALFA, id: 4, nome: 'Alfa Locações' };
  wb = await abrir(await F.faturaExcel(ExcelJS, MODELO, [fatura({ emitente_id: 3 }), fatura({ emitente_id: 4 })], [ALFA, ALFA2]));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['ALFA', 'ALFA 2']);
});
