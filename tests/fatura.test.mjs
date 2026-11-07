// Fatura de locação (docs/js/fatura.js): quebra das observações, HTML no desenho da planilha (texto do usuário escapado,
// valores em reais) e Excel preenchido a partir do modelo (com um ExcelJS falso: aba por empresa, abas sobrando removidas).
import assert from 'node:assert/strict';
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
  // mais empresas do que abas: erro claro
  await assert.rejects(F.faturaExcel(excelFalso(['ANK']), new Uint8Array([1]), [fatura(), fatura({ emitente_id: 2 })], [ANK, JCK]), /menos abas do que empresas/);
});
