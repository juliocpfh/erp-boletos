// Pedidos do dono de 27/11/2026: sem o aviso "Correção da caução" depois de gerado o boleto do complemento,
// e observações (com a data) de por que a garantia ainda não foi aplicada inteira.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

function base() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK', ativo: true }, 'julio');
  const casa = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 2', endereco: 'Rua Teste, 10', cidade: 'Curitiba' }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Joana Teste', inquilino_cpf: '529.982.247-25',
    data_entrada: '2025-03-01', vigencia_inicio: '2025-03-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, taxa_boleto: 850, garantia_tipo: 'Caução', caucao_valor: 540000, caucao_data: '2025-03-01',
    caucao_meses: 3, comprovante_caucao: 'c.pdf' }, 'julio');
  return { d, c, ank };
}

test('correção da caução: avisa antes do boleto e some depois de gerado', () => {
  const { d, c } = base();
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-03-01', indice: 'IGP-M', percentual: 5, valor_anterior: 200000, valor_novo: 210000 }, 'julio');
  const tem = () => R.alertasContrato(d, c, '2026-03-05').some((a) => a.tipo === 'Correção da caução');
  assert.ok(tem(), 'sem boleto: avisa para gerar o complemento de R$ 270,00');
  R.gerarBoletosCaucao(d, c.id, 'julio');
  assert.ok(!tem(), 'boleto do complemento gerado: sem o aviso');
});

test('falta aplicar: observação com a data do registro, no alerta, e retirar', () => {
  const { d, c, ank } = base();
  R.inserir(d, 'aplicacoes', { contrato_id: c.id, data: '2025-03-02', emitente_id: ank.id, valor: 300000 }, 'julio');
  R.anotarAplicacao(d, c.id, '  Aguardando o inquilino depositar o restante ', 'julio', '2026-11-27');
  const x = R.buscar(d, 'contratos', c.id);
  assert.deepEqual(R.notasAplicacao(x), [{ data: '2026-11-27', texto: 'Aguardando o inquilino depositar o restante', usuario: 'julio' }]);
  const a = R.alertasContrato(d, x, '2026-11-27').find((y) => y.tipo === 'Aplicação da garantia');
  assert.match(a.texto, /falta aplicar R\$ 2\.400,00\. Observação de 27\/11\/2026: Aguardando o inquilino/);
  assert.throws(() => R.anotarAplicacao(d, c.id, '   ', 'julio'), /Escreva a observação/);
  R.retirarNotaAplicacao(d, c.id, 0, 'julio');
  assert.deepEqual(R.notasAplicacao(R.buscar(d, 'contratos', c.id)), []);
});
