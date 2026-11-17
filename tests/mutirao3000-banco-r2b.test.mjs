// Mutirão 3000, 2ª rodada, frente banco (parte 2): extrato em CSV, conferência do saldo ("faltam lançamentos" / "importado em dobro"),
// avisos do banco (quais boletos reconsultar) e painel de saúde (aguardando crédito, emissões a conferir, último token na ponte).
// Dados fictícios: aluguel R$ 1.350, bonificação 10%, tarifa R$ 3,50 → em dia R$ 1.218,50. CPF de teste 529.982.247-25.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as R from '../docs/js/regras.js';
import * as Z from '../docs/js/conciliacao.js';
import * as P from '../ponte-c6/servidor.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'banco-r2b-'));
test.after(() => { P.trocarTransporteParaTeste(null); fs.rmSync(tmp, { recursive: true, force: true }); });

function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua A, 117', cidade: 'Curitiba', uf: 'PR', cep: '80000-000', bairro: 'Centro' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const a = R.inserir(d, 'contratos', { inquilino_cpf: '529.982.247-25', data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, taxa_boleto: 350, multa_percentual: 10, juros_mensal_percentual: 1, imovel_id: loja.id, inquilino_nome: 'Ana Teste' }, 'j');
  d.config_banco = { ativo: true, provedor: 'c6', conta_padrao_id: 'ank', contas: [{ id: 'ank', apelido: 'ANK', emitente_id: ank.id, ambiente: 'sandbox' }] };
  R.normalizar(d);
  R.gerarCobrancas(d, '2026-07', 'j');
  return { d, cbA: d.cobrancas.find((x) => x.contrato_id === a.id) };
}
const lanc = (id, data, valor, descricao = 'PIX') => ({ id_externo: id, data, valor_centavos: valor, tipo: valor < 0 ? 'saida' : 'entrada', descricao, fonte: 'ofx' });

// ---------------------------------------------------------------- 3: CSV
test('3: CSV com linhas da conta antes dos títulos, ";" e saldo do mais novo para o mais antigo', () => {
  const csv = '﻿Conta corrente;12345-6\nPeríodo;01/11/2026 a 05/11/2026\n\nData lançamento;Título;Descrição;Valor (R$);Saldo (R$)\n'
    + '05/11/2026;Pix enviado;SANEPAR AGUA;-123,45;6.095,05\n03/11/2026;Pix recebido;"PIX RECEBIDO ANA; LOJA 1";1.218,50;6.218,50\n01/11/2026;Tarifa;TARIFA PACOTE;-0,00;\nTotal;;;;\n';
  const r = Z.lerCsv(csv);
  assert.deepEqual([r.de, r.ate, r.lancamentos.length], ['2026-11-03', '2026-11-05', 2]);
  const [s, e] = r.lancamentos;
  assert.deepEqual([s.data, s.valor_centavos, s.tipo, e.valor_centavos, e.tipo, e.fonte], ['2026-11-05', -12345, 'saida', 121850, 'entrada', 'csv']);
  assert.deepEqual([e.descricao, e.titulo], ['PIX RECEBIDO ANA; LOJA 1', 'Pix recebido']);
  // saldo antes do 1º lançamento (03/11) e depois do último (05/11)
  assert.deepEqual(r.saldo, { inicio: { data: '2026-11-03', valor: 500000 }, fim: { data: '2026-11-05', valor: 609505 } });
  // importar o mesmo arquivo de novo não repete
  const { d } = base();
  assert.equal(Z.importarExtrato(d, 'ank', r.lancamentos, 'j', { hoje: '2026-11-10' }).novas.length, 2);
  assert.equal(Z.importarExtrato(d, 'ank', Z.lerCsv(csv).lancamentos, 'j', { hoje: '2026-11-10' }).novas.length, 0);
});

test('3: CSV com entrada e saída em colunas separadas, "," e data AAAA-MM-DD; colunas desconhecidas dizem os nomes procurados', () => {
  const r = Z.lerCsv('Data,Historico,Credito,Debito\n2026-11-02,PIX RECEBIDO,"1.218,50",\n2026-11-04,BOLETO COPEL,,"200,00"\n');
  assert.deepEqual(r.lancamentos.map((l) => [l.data, l.valor_centavos]), [['2026-11-02', 121850], ['2026-11-04', -20000]]);
  assert.equal(r.saldo, null);
  assert.throws(() => Z.lerCsv('Dia;Quanto\n01/11/2026;10,00\n'), (e) => /Não reconheci as colunas/.test(e.message) && /"data lancamento"/.test(e.message) && /"valor"/.test(e.message) && /"credito"/.test(e.message));
  assert.deepEqual([Z.centavosDoCsv('(10,00)'), Z.centavosDoCsv('15,00 D'), Z.centavosDoCsv('R$ 1.234,56'), Z.centavosDoCsv('-1234.56')], [-1000, -1500, 123456, -123456]);
});

test('3: OFX traz o saldo do fim do período (LEDGERBAL)', () => {
  const ofx = '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>123456</BANKACCTFROM><BANKTRANLIST><DTSTART>20261101<DTEND>20261130'
    + '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261103<TRNAMT>1218.50<FITID>F1<MEMO>PIX RECEBIDO</STMTTRN></BANKTRANLIST>'
    + '<LEDGERBAL><BALAMT>6218.50<DTASOF>20261130</LEDGERBAL><AVAILBAL><BALAMT>1.00</AVAILBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
  assert.deepEqual(Z.lerOfx(ofx).saldo, { data: '2026-11-30', valor: 621850 });
});

// ---------------------------------------------------------------- 3: conferência do saldo
test('3: conferência do saldo: ponto de partida, bate, faltam lançamentos e importado em dobro', () => {
  const { d } = base();
  // 1ª vez: o saldo vira o ponto de partida
  assert.equal(Z.registrarSaldo(d, 'ank', { data: '2026-10-31', valor: 500000, fonte: 'ofx' }, 'j').situacao, 'primeira');
  Z.importarExtrato(d, 'ank', [lanc('a1', '2026-11-03', 121850), lanc('a2', '2026-11-05', -20000, 'COPEL')], 'j', { hoje: '2026-12-01' });
  // R$ 5.000 + 1.218,50 − 200 = R$ 6.018,50
  assert.equal(Z.registrarSaldo(d, 'ank', { data: '2026-11-30', valor: 601850, fonte: 'ofx' }, 'j').situacao, 'ok');
  assert.deepEqual(d.saldos_banco.ank.ancora, { data: '2026-11-30', valor: 601850, fonte: 'ofx' });
  // dezembro: o banco tem R$ 1.218,50 a mais (faltou importar a entrada): faltam lançamentos, o ponto de partida fica
  const f = Z.registrarSaldo(d, 'ank', { data: '2026-12-15', valor: 723700, fonte: 'ofx' }, 'j');
  assert.deepEqual([f.situacao, f.esperado, f.diferenca], ['faltam', 601850, 121850]);
  assert.equal(d.saldos_banco.ank.ancora.data, '2026-11-30');
  // a mesma entrada importada duas vezes (OFX e CSV com descrições sem nada em comum): importado em dobro
  Z.importarExtrato(d, 'ank', [lanc('b1', '2026-12-10', 121850, 'PIX RECEBIDO')], 'j', { hoje: '2026-12-20' });
  Z.importarExtrato(d, 'ank', [lanc('b2', '2026-12-10', 121850, 'TED BRUNO'), lanc('b3', '2026-12-10', 121850, 'OUTRO')], 'j', { hoje: '2026-12-20' });
  const dobro = Z.registrarSaldo(d, 'ank', { data: '2026-12-15', valor: 723700, fonte: 'ofx' }, 'j');
  assert.equal(dobro.situacao, 'dobro');
  assert.equal(dobro.repetidos.length, 2);
  // apagando as cópias, confere de novo e bate
  for (const id of dobro.repetidos) Z.apagarCopiaRepetida(d, id, 'j');
  assert.equal(d.saldos_banco.ank.ultima.situacao, 'ok');
  assert.throws(() => Z.apagarCopiaRepetida(d, d.movimentacoes_banco.find((m) => m.id_externo === 'b1').id, 'j'), /não é uma cópia/);
});

test('3: CSV com a coluna de saldo confere sozinho (sem ponto de partida); saldo da API só com o extrato buscado até hoje', () => {
  const { d } = base();
  Z.importarExtrato(d, 'ank', [lanc('a1', '2026-11-03', 121850)], 'j', { hoje: '2026-11-10' });
  assert.equal(Z.registrarSaldo(d, 'ank', { data: '2026-11-03', valor: 621850, inicio: { data: '2026-11-03', valor: 500000 }, fonte: 'csv' }, 'j').situacao, 'ok');
  // extrato importado só até 09/11 e hoje é 20/11: não confere, pede para buscar antes
  assert.equal(Z.registrarSaldo(d, 'ank', { data: '2026-11-20', valor: 621850, fonte: 'api' }, 'j', { hoje: '2026-11-20' }).situacao, 'sem_extrato');
  // buscado hoje (20/11, importado até 19/11) com uma entrada de hoje: o saldo de agora menos o de hoje é o do fim de ontem
  Z.importarExtrato(d, 'ank', [lanc('a2', '2026-11-20', 10000)], 'j', { de: '2026-11-10', ate: '2026-11-20', hoje: '2026-11-20' });
  const r = Z.registrarSaldo(d, 'ank', { data: '2026-11-20', valor: 631850, fonte: 'api' }, 'j', { hoje: '2026-11-20' });
  assert.equal(r.situacao, 'ok');
  assert.equal(d.saldos_banco.ank.ultima.valor_banco, 631850);
});

// ---------------------------------------------------------------- 1: avisos do banco
test('1: avisos do banco: só os boletos nossos avisados depois da última leitura, não pagos aqui nem cancelados', () => {
  const { d, cbA } = base();
  cbA.banco = { conta_id: 'ank', id_externo: 'B0000000AAAAAAAAAAAAAAAAAA', situacao: 'emitido' };
  const avisos = [{ external_reference_id: 'B0000000AAAAAAAAAAAAAAAAAA', recebida_em: '2026-08-10T12:00:00.000Z' }, { external_reference_id: 'DE_OUTRO_SISTEMA', recebida_em: '2026-08-10T12:00:00.000Z' }];
  assert.deepEqual(Z.boletosAvisados(d, avisos, '2026-08-10T00:00:00.000Z').map((x) => x.id), [cbA.id]);
  assert.deepEqual(Z.boletosAvisados(d, avisos, '2026-08-10T12:00:00.000Z'), [], 'já lido');
  cbA.banco.situacao = 'cancelado';
  assert.deepEqual(Z.boletosAvisados(d, avisos, ''), []);
  // pago no banco e não aqui: é o que a tela propõe registrar
  cbA.banco.situacao = 'pago';
  assert.deepEqual(Z.pagosNoBancoSemRegistro(d, 'ank').map((x) => x.id), [cbA.id]);
  R.registrarPagamento(d, cbA.id, '2026-08-10', R.totais(cbA).a_pagar_pontual, 'j');
  assert.deepEqual(Z.pagosNoBancoSemRegistro(d, 'ank'), []);
});

// ---------------------------------------------------------------- 4: painel de saúde
test('4: saúde do banco: aguardando crédito há mais de 2 dias úteis e emissão com erro ou sem resposta', () => {
  const { d, cbA } = base();
  cbA.banco = { conta_id: 'ank', id_externo: 'B1', situacao: 'emitido', situacao_banco: 'WAITING_CONFIRMATION', pago_em: '2026-11-10' }; // terça
  assert.deepEqual(Z.saudeDoBanco(d, '2026-11-12').aguardando, [], 'quinta: ainda no prazo');
  assert.deepEqual(Z.saudeDoBanco(d, '2026-11-13').aguardando.map((x) => x.id), [cbA.id], 'sexta: passou de 2 dias úteis');
  cbA.banco = { conta_id: 'ank', situacao: 'erro', erro: 'O banco respondeu 400' };
  assert.deepEqual(Z.saudeDoBanco(d, '2026-11-13').comErro.map((x) => x.id), [cbA.id]);
  Z.importarExtrato(d, 'ank', [lanc('a1', '2026-11-03', 121850)], 'j', { hoje: '2026-11-10' });
  const [conta] = Z.saudeDoBanco(d, '2026-11-13').contas;
  assert.equal(conta.importado_ate, '2026-11-03');
  assert.match(conta.ultima_importacao, /^\d{4}-\d{2}-\d{2}T/);
});

test('4: a ponte diz quando pegou o último token (nunca o token)', async () => {
  const crt = path.join(tmp, 'c.crt'); const key = path.join(tmp, 'c.key');
  fs.writeFileSync(crt, 'x'); fs.writeFileSync(key, 'x');
  const cfg = { simulado: false, pagamentos: false, software: { nome: 't', versao: '1' }, pastaRegistros: '' };
  const conta = { id: 'saude1', ambiente: 'sandbox', client_id: 'a', client_secret: 'b', certificado: crt, chave: key, url_base: 'https://y', valor_maximo: 50000, versao_boleto: 'v2' };
  P.trocarTransporteParaTeste(async (url) => (url.includes('/auth') ? { status: 200, dados: { access_token: 'segredo-do-token', expires_in: 600, scope: 'v2.bankslip.read' } } : { status: 404, dados: {} }));
  const antes = Date.now();
  const s = await P.saudeDaConta(cfg, conta);
  assert.equal(s.token, 'ok');
  assert.ok(Date.parse(s.ultimo_token_em) >= antes - 1000);
  assert.doesNotMatch(JSON.stringify(s), /segredo-do-token/);
});
