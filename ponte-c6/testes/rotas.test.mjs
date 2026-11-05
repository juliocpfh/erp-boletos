import assert from 'node:assert/strict';
import test from 'node:test';
import { rotasFase2, regexDoPadrao, montarPdfComprovante } from '../rotas-fase2.mjs';
import { gerarPdf, textoDoPdf } from '../pdf-minimo.mjs';
import { c6SimuladoDaConta } from '../c6-simulado.mjs';

const CONTAS = ['ank', 'jck'];
const registros = [];
const rotas = rotasFase2({
  c6DaConta: (conta) => (CONTAS.includes(conta) ? c6SimuladoDaConta(conta) : null),
  registrar: (t) => registros.push(t),
  empresas: { ank: 'ANK Administradora Ltda', jck: 'JCK Administradora Ltda' },
  agora: () => new Date(2026, 10, 5, 14, 30),
});

/** Faz o papel do servidor: acha a rota pelo método e caminho, extrai :params e chama o handler. */
async function pedir(metodo, url, corpo = null) {
  const [caminho, qs = ''] = url.split('?');
  const rota = rotas.find((r) => r.metodo === metodo && r.caminho.test(caminho));
  assert.ok(rota, `rota ${metodo} ${caminho} existe`);
  const params = rota.caminho.exec(caminho).groups;
  return rota.handler({ url, method: metodo }, { conta: params.conta, params, query: Object.fromEntries(new URLSearchParams(qs)), corpo });
}

test('regexDoPadrao: :conta e :grupo viram grupos nomeados; barra final opcional; não pega caminho parecido', () => {
  const re = regexDoPadrao('/contas/:conta/pagamentos/:grupo/itens');
  assert.deepEqual({ ...re.exec('/contas/ank/pagamentos/G1/itens').groups }, { conta: 'ank', grupo: 'G1' });
  assert.ok(re.test('/contas/ank/pagamentos/G1/itens/'));
  assert.equal(re.test('/contas/ank/pagamentos/G1/itens/X'), false);
  assert.equal(re.test('/contas/ank/pagamentos/G1'), false);
  assert.equal(rotas.length, 10);
  assert.ok(rotas.every((r) => r.caminho instanceof RegExp && typeof r.handler === 'function' && r.padrao.startsWith('/contas/:conta')));
});

test('GET /contas/:conta/extrato devolve os lançamentos do C6 com conta_id; datas inválidas → 400; conta desconhecida → 404', async () => {
  const r = await pedir('GET', '/contas/ank/extrato?de=2026-11-01&ate=2026-11-30');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.conta_id, 'ank');
  assert.equal(r.corpo.de, '2026-11-01');
  assert.equal(r.corpo.lancamentos.length, 8);
  assert.ok(r.corpo.lancamentos.every((l) => l.conta_id === 'ank' && l.reference && l.amount));
  assert.ok(registros.some((t) => /\[ank\] extrato/.test(t)));

  const ruim = await pedir('GET', '/contas/ank/extrato?de=01/11/2026&ate=2026-11-30');
  assert.equal(ruim.status, 400);
  assert.equal(ruim.corpo.codigo, 'validacao');
  assert.match(ruim.corpo.erro, /AAAA-MM-DD/);

  const semConta = await pedir('GET', '/contas/xyz/extrato?de=2026-11-01&ate=2026-11-30');
  assert.equal(semConta.status, 404);
  assert.equal(semConta.corpo.codigo, 'conta');

  // sem datas: últimos 30 dias, sem erro
  const padrao = await pedir('GET', '/contas/jck/extrato');
  assert.equal(padrao.status, 200);
  assert.ok(padrao.corpo.de < padrao.corpo.ate);
});

test('handler sem conta/params explícitos extrai da própria URL', async () => {
  const rota = rotas.find((r) => r.padrao === '/contas/:conta/saldo');
  const r = await rota.handler({ url: '/contas/jck/saldo?x=1' }, {});
  assert.equal(r.status, 200);
  assert.equal(r.corpo.conta_id, 'jck');
  assert.equal(r.corpo.currency_code, 'BRL');
});

test('boletos pagos, DDA e pagamentos pelas rotas', async () => {
  const pagos = await pedir('GET', '/contas/ank/boletos/pagos?de=2026-11-01&ate=2026-11-30&por=credit_date');
  assert.equal(pagos.status, 200);
  assert.equal(pagos.corpo.por, 'credit_date');
  assert.equal(pagos.corpo.boletos.length, 2);
  assert.ok(Array.isArray(pagos.corpo.boletos[0].payments));
  const porRuim = await pedir('GET', '/contas/ank/boletos/pagos?de=2026-11-01&ate=2026-11-30&por=x');
  assert.equal(porRuim.status, 400);

  const dda = await pedir('GET', '/contas/jck/dda');
  assert.equal(dda.corpo.items.length, 1);
  assert.equal(dda.corpo.items[0].overdue, true);

  const dec = await pedir('POST', '/contas/ank/pagamentos/decodificar', { items: [{ content: '33691991800000005000000003048720009765974213', amount: 50, description: 'Teste' }] });
  assert.equal(dec.status, 201);
  const g = dec.corpo.group_id;
  assert.ok(g);
  const itens = await pedir('GET', `/contas/ank/pagamentos/${g}/itens`);
  assert.equal(itens.corpo.items.length, 1);
  const decRuim = await pedir('POST', '/contas/ank/pagamentos/decodificar', [{ content: 'xx', amount: 50 }]);
  assert.equal(decRuim.status, 400);
  const rem = await pedir('DELETE', `/contas/ank/pagamentos/${g}/itens`, [itens.corpo.items[0].id]);
  assert.equal(rem.corpo.removidos, 1);
  assert.equal((await pedir('GET', `/contas/ank/pagamentos/${g}/itens`)).corpo.items.length, 0);
  const envSem = await pedir('POST', `/contas/ank/pagamentos/${g}/enviar`, {});
  assert.equal(envSem.status, 400);
  const env = await pedir('POST', `/contas/ank/pagamentos/${g}/enviar`, { uploader_name: 'Dono' });
  assert.deepEqual(env.corpo, { conta_id: 'ank', group_id: g, enviado: true });
  const naoExiste = await pedir('GET', '/contas/ank/pagamentos/NAOEXISTE/itens');
  assert.equal(naoExiste.status, 502);
  assert.equal(naoExiste.corpo.codigo, 'banco');
  assert.equal(naoExiste.corpo.status_banco, 404);
});

test('PDF mínimo: começa com %PDF-, termina com %%EOF e carrega o texto (com acento)', () => {
  const pdf = gerarPdf({ titulo: 'Título de teste', linhas: ['Valor: R$ 1.219,50', 'Descrição com (parênteses) e \\ barra'] });
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.match(pdf.toString('latin1'), /%%EOF\s*$/);
  assert.match(pdf.toString('latin1'), /\/Type \/Catalog/);
  assert.match(pdf.toString('latin1'), /xref\n0 7\n/);
  const texto = textoDoPdf(pdf);
  assert.match(texto, /Título de teste/);
  assert.match(texto, /1\.219,50/);
  assert.match(texto, /Descrição com \(parênteses\) e \\ barra/);
  // o startxref aponta para o "xref"
  const s = pdf.toString('latin1');
  const pos = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.equal(s.slice(pos, pos + 4), 'xref');
});

test('GET /contas/:conta/comprovante/:reference gera o PDF com data, valor, tipo, descrição, referência, Pix, conta e empresa', async () => {
  const ref = '019aeec0-a61a-8043-4a46-2f191aebdf9a';
  const r = await pedir('GET', `/contas/ank/comprovante/${ref}?data=2026-11-03`);
  assert.equal(r.status, 200);
  assert.ok(Buffer.isBuffer(r.pdf));
  assert.equal(r.pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.equal(r.nome, `comprovante-${ref}.pdf`);
  assert.equal(r.cabecalhos['X-Comprovante-Origem'], 'ponte');
  const texto = textoDoPdf(r.pdf);
  for (const trecho of ['03/11/2026', '1.219,50', 'Entrada', 'Pix recebido (QR Code)', 'MARIA EXEMPLO', ref, 'E33600000202611030912ANKEXEMPLO01', 'Conta: ANK', 'ANK Administradora Ltda', '05/11/2026 14:30']) {
    assert.ok(texto.includes(trecho), `PDF tem "${trecho}"`);
  }
  // sem a data: procura nos últimos 90 dias a partir de ate
  const r2 = await pedir('GET', `/contas/ank/comprovante/${ref}?de=2026-10-01&ate=2026-11-30`);
  assert.equal(r2.status, 200);
  // em JSON (para o site, que só fala JSON com a ponte)
  const j = await pedir('GET', `/contas/ank/comprovante/${ref}?data=2026-11-03&formato=json`);
  assert.equal(j.status, 200);
  assert.equal(j.corpo.origem, 'ponte');
  assert.equal(j.corpo.nome, r.nome);
  assert.equal(Buffer.from(j.corpo.pdf_base64, 'base64').subarray(0, 5).toString('latin1'), '%PDF-');
  assert.equal(j.corpo.lancamento.reference, ref);
  // não achou
  const nao = await pedir('GET', '/contas/ank/comprovante/nao-existe?data=2026-11-03');
  assert.equal(nao.status, 404);
  assert.equal(nao.corpo.codigo, 'nao_encontrado');
  // saída
  const saida = montarPdfComprovante({ reference: 'X', entry_date: '2026-11-05', amount: '123.45', operation_type: 'OUTGOING', transaction_type: 'PAYMENT', title: 'Pagamento de Boleto', description: 'SANEPAR' }, { conta: 'jck' });
  assert.match(textoDoPdf(saida), /Saída \(débito\) - Pagamento/);
  assert.match(textoDoPdf(saida), /- R\$ 123,45/);
  assert.match(textoDoPdf(saida), /Empresa: JCK/);
});
