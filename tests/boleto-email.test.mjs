import assert from 'node:assert/strict';
import test from 'node:test';
import { anexosProntos, dadosDoEmail } from '../docs/js/email-dados.js';
import { modeloEmail, montarEmail } from '../docs/js/modelos-email.js';
import * as R from '../docs/js/regras.js';

// Boleto feito à mão no banco mandado por e-mail pelo sistema (pedido do dono em 2026-11-24). Dados fictícios.
function base() {
  const d = R.bancoVazio();
  R.normalizar(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com',
    data_entrada: '2026-10-01', vigencia_inicio: '2026-10-01', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 8, multa_percentual: 2, juros_mensal_percentual: 1 }, 'julio');
  R.gerarCobrancas(d, '2026-11', 'julio');
  return { d, c, cb: R.boletoDoMes(d, c.id, '2026-11') };
}
const temRef = (d, nome) => R.arquivosReferenciados(d).some((a) => a.nome === nome);

test('anexar o PDF do banco: entra nos arquivos do lançamento (conferência, limpeza) com rótulo; tirar solta o arquivo', () => {
  const { d, c, cb } = base();
  R.anexarBoletoPdf(d, cb.id, 'boleto-banco-2026-11.pdf', 'julio');
  assert.equal(cb.boleto_pdf, 'boleto-banco-2026-11.pdf');
  assert.equal(cb.boleto_pdf_contrato, c.id);
  assert.equal(cb.boleto_pdf_valor, R.totais(cb).a_pagar_sem_desconto);
  assert.ok(R.arquivosReferenciados(d).some((a) => a.escopo === 'contrato' && a.id === c.id && a.nome === 'boleto-banco-2026-11.pdf'));
  assert.match(R.rotulosDosArquivos(d).get(`contrato:${c.id}|boleto-banco-2026-11.pdf`), /PDF do boleto emitido no banco \(11\/2026, vence 10\/12\/2026\)/);
  R.anexarBoletoPdf(d, cb.id, null, 'julio');
  assert.equal(cb.boleto_pdf, null);
  assert.ok(!temRef(d, 'boleto-banco-2026-11.pdf'));
  assert.throws(() => R.anexarBoletoPdf(d, cb.id, null, 'julio'), /não tem PDF/);
});

test('excluir o boleto solta o PDF (é apagado junto); na troca de titular o PDF continua na pasta onde foi anexado', () => {
  const { d, c, cb } = base();
  R.anexarBoletoPdf(d, cb.id, 'boleto-banco-2026-11.pdf', 'julio');
  const outro = R.inserir(d, 'contratos', { imovel_id: c.imovel_id, inquilino_nome: 'José Exemplo', data_entrada: '2026-11-01', aluguel_inicial: 135000 }, 'julio');
  cb.contrato_id = outro.id; // o boleto passou ao novo titular
  assert.ok(R.arquivosReferenciados(d).some((a) => a.id === c.id && a.nome === 'boleto-banco-2026-11.pdf'));
  R.excluir(d, 'cobrancas', cb.id, 'julio');
  assert.ok(!temRef(d, 'boleto-banco-2026-11.pdf'));
});

test('boleto que muda depois de anexado o PDF avisa (valor e vencimento)', () => {
  const { d, cb } = base();
  R.anexarBoletoPdf(d, cb.id, 'boleto-banco-2026-11.pdf', 'julio');
  assert.equal(R.boletoPdfDesatualizado(cb), '');
  cb.vencimento = '2026-12-11';
  cb.aluguel += 10000;
  assert.match(R.boletoPdfDesatualizado(cb), /o valor era R\$ 1\.350,00 e agora é R\$ 1\.450,00; o vencimento era 10\/12\/2026 e agora é 11\/12\/2026/);
});

test('e-mail do boleto: descritivo, mês de competência, vencimento, valor em dia e depois, com o PDF anexado', () => {
  const { d, c, cb } = base();
  const modelo = modeloEmail(d, 'boleto_envio');
  assert.deepEqual(anexosProntos(d, modelo, { contrato: c, cobranca: cb }), [], 'sem PDF, nada para anexar');
  R.anexarBoletoPdf(d, cb.id, 'boleto-banco-2026-11.pdf', 'julio');
  const prontos = anexosProntos(d, modelo, { contrato: c, cobranca: cb });
  assert.deepEqual(prontos.map((a) => [a.tipo, a.escopo, a.id, a.nome]), [['arquivo', 'contrato', c.id, 'boleto-banco-2026-11.pdf']]);
  const dados = dadosDoEmail(d, { contrato: c, cobranca: cb }, {}, '2026-11-24');
  assert.equal(dados.para, 'maria@exemplo.com');
  const e = montarEmail(modelo, dados);
  assert.equal(e.assunto, 'Boleto do aluguel de 11/2026 (Rua Exemplo, 1) · vence em 10/12/2026');
  assert.match(e.texto, /Mês de competência: 11\/2026/);
  assert.match(e.texto, /Vencimento: 10\/12\/2026\n/);
  assert.match(e.texto, /Valor até o vencimento: R\$ 1\.242,00 \(com a bonificação\)/);
  assert.match(e.texto, /Valor depois do vencimento: R\$ 1\.350,00, mais multa de 2% e juros de 1% ao mês/);
  assert.match(R.dadosBoleto(d, cb).descricao, /^ALUGUEL RS1\.350,00\nCOM BONF\. RS1\.242,00$/, 'no banco fica RS (sem o $)');
  assert.match(e.texto, /DESCRITIVO\nALUGUEL R\$ 1\.350,00\nCOM BONF\. R\$ 1\.242,00\n/);
  assert.doesNotMatch(`${e.assunto}\n${e.texto}`, /\[preencher|\[se |\[fim\]|\{[a-z_]+\}/);
});

test('e-mail do boleto: vencimento em dia não útil e saldo da saída e complemento da caução (sem multa) mudam o texto', () => {
  const { d, c, cb } = base();
  cb.vencimento = '2027-01-10'; // domingo
  let e = montarEmail(modeloEmail(d, 'boleto_envio'), dadosDoEmail(d, { contrato: c, cobranca: cb }, {}, '2026-11-24'));
  assert.match(e.texto, /Vencimento: 10\/01\/2027 \(não é dia útil: vale até 11\/01\/2027\)/);
  cb.saldo_saida_de = 99;
  e = montarEmail(modeloEmail(d, 'boleto_envio'), dadosDoEmail(d, { contrato: c, cobranca: cb }, {}, '2026-11-24'));
  assert.match(e.assunto, /^Boleto do saldo do acerto final/);
  assert.match(e.texto, /multa de 2%/, 'o saldo da saída tem a multa do contrato (2026-11-20)');
  delete cb.saldo_saida_de;
  cb.caucao_complemento = 20000;
  assert.ok(R.ehComplementoCaucao(cb));
  e = montarEmail(modeloEmail(d, 'boleto_envio'), dadosDoEmail(d, { contrato: c, cobranca: cb }, {}, '2026-11-24'));
  assert.match(e.assunto, /^Boleto do complemento da caução/);
  assert.match(e.texto, /Valor depois do vencimento: R\$ [\d.,]+\n/);
  assert.doesNotMatch(e.texto, /multa de/);
});
