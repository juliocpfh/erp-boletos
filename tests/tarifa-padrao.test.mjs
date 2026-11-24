import assert from 'node:assert/strict';
import test from 'node:test';
import * as CR from '../docs/js/config-regras.js';
import * as K from '../docs/js/contratos.js';
import * as R from '../docs/js/regras.js';

// Decisão do dono de 24/11/2026: a tarifa do boleto é sempre cobrada por padrão. Contrato sem valor próprio cobra a regra
// `tarifa_padrao`; em cada contrato dá para pôr outro valor ou marcar "Não cobrar tarifa do boleto". Pagos e emitidos no banco
// não mudam. Dados fictícios (CPF e CNPJ de teste).
function base() {
  const d = R.normalizar(R.bancoVazio());
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK LTDA', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  const contrato = (nome, extra = {}) => {
    const i = R.inserir(d, 'imoveis', { nome, endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'j');
    R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: ank.id, percentual: 100 }, 'j');
    return R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: `Inquilino ${nome}`, inquilino_cpf: '529.982.247-25', data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01',
      aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true, taxa_boleto: 0, garantia_tipo: 'Fiador', ...extra }, 'j');
  };
  return { d, padrao: contrato('A'), proprio: contrato('B', { taxa_boleto: 350 }), nao: contrato('C', { nao_cobrar_tarifa: true }) };
}
const tarifa = (d, c, comp) => R.boletoDoMes(d, c.id, comp).taxa_boleto;

test('contrato sem valor próprio cobra a tarifa padrão; valor próprio vale; "Não cobrar" não cobra', () => {
  const { d, padrao, proprio, nao } = base();
  try {
    R.salvarRegrasSistema(d, { tarifa_padrao: 850 }, 'admin');
    assert.deepEqual([R.tarifaDoContrato(padrao), R.tarifaDoContrato(proprio), R.tarifaDoContrato(nao)], [850, 350, 0]);
    R.gerarCobrancas(d, '2026-11', 'j');
    assert.deepEqual([tarifa(d, padrao, '2026-11'), tarifa(d, proprio, '2026-11'), tarifa(d, nao, '2026-11')], [850, 350, 0]);
    // texto do contrato: a cláusula da tarifa sai com o valor que vale para o contrato
    const campos = (c) => K.dadosDoContrato(d, c, { data: '2026-01-01' }).campos || K.dadosDoContrato(d, c, { data: '2026-01-01' });
    const texto = (c) => JSON.stringify(campos(c));
    assert.match(texto(padrao), /oito reais e cinquenta centavos/);
    assert.match(texto(proprio), /três reais e cinquenta centavos/);
    assert.doesNotMatch(texto(nao), /reais e cinquenta centavos/);
  } finally { CR.usarRegras(null); }
});

test('regra sem valor (em branco): ninguém sem valor próprio paga tarifa, como antes', () => {
  const { d, padrao, proprio } = base();
  R.gerarCobrancas(d, '2026-11', 'j');
  assert.deepEqual([tarifa(d, padrao, '2026-11'), tarifa(d, proprio, '2026-11')], [0, 350]);
});

test('tarifa padrão mudada: refaz os boletos em aberto de quem a segue; pagos e emitidos no banco não mudam', () => {
  const { d, padrao, proprio } = base();
  try {
    R.gerarCobrancas(d, '2026-10', 'j');
    R.gerarCobrancas(d, '2026-11', 'j');
    R.gerarCobrancas(d, '2026-12', 'j');
    R.registrarPagamento(d, R.boletoDoMes(d, padrao.id, '2026-10').id, '2026-11-10', null, 'j');
    R.atualizar(d, 'cobrancas', R.boletoDoMes(d, padrao.id, '2026-11').id, { banco: { situacao: 'emitido' } }, 'j');
    R.salvarRegrasSistema(d, { tarifa_padrao: 850 }, 'admin');
    assert.equal(tarifa(d, padrao, '2026-10'), 0, 'pago não muda');
    assert.equal(tarifa(d, padrao, '2026-11'), 0, 'emitido no banco não muda');
    assert.equal(tarifa(d, padrao, '2026-12'), 850, 'em aberto acompanha');
    assert.equal(R.totais(R.boletoDoMes(d, padrao.id, '2026-12')).a_pagar_pontual, 200000 + 850);
    assert.equal(tarifa(d, proprio, '2026-12'), 350, 'valor próprio não muda');
  } finally { CR.usarRegras(null); }
});

test('marcar "Não cobrar tarifa" ou pôr valor próprio no contrato muda os boletos em aberto dele no recálculo', () => {
  const { d, padrao } = base();
  try {
    R.salvarRegrasSistema(d, { tarifa_padrao: 850 }, 'admin');
    R.gerarCobrancas(d, '2026-12', 'j');
    R.atualizar(d, 'contratos', padrao.id, { nao_cobrar_tarifa: true }, 'j');
    R.recalcularCobrancas(d, (cb) => cb.contrato_id === padrao.id, 'j');
    assert.equal(tarifa(d, padrao, '2026-12'), 0);
    R.atualizar(d, 'contratos', padrao.id, { nao_cobrar_tarifa: false, taxa_boleto: 500 }, 'j');
    R.recalcularCobrancas(d, (cb) => cb.contrato_id === padrao.id, 'j');
    assert.equal(tarifa(d, padrao, '2026-12'), 500);
  } finally { CR.usarRegras(null); }
});
