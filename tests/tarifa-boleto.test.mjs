import assert from 'node:assert/strict';
import test from 'node:test';
import * as K from '../docs/js/contratos.js';
import { atualizarTextoModelo, MODELOS_PADRAO, TARIFA_BOLETO } from '../docs/js/modelos-contrato.js';
import * as R from '../docs/js/regras.js';

// Tarifa do boleto de volta ao contrato (pedido do dono em 24/11/2026; desfaz a retirada de 2026-10-20). Dados fictícios.
const texto = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : `[${b.tipo}]`)).join('\n');
const banco = () => ({ emitentes: [{ id: 1, razao_social: 'EMPRESA LOCADORA EXEMPLO LTDA', cnpj: '11.222.333/0001-81', assina_documentos: true, uf_sede: 'PR', ativo: true }],
  participacoes: [], fiadores: [], titularidades: [], listas: {}, imoveis: [{ id: 1, nome: 'Casa', endereco: 'Rua das Flores, 120', cidade: 'Curitiba', uf: 'PR' }] });
const contrato = { id: 1, imovel_id: 1, inquilino_nome: 'Maria de Teste Souza', inquilino_cpf: '529.982.247-25', aluguel_inicial: 190000, dia_vencimento: 10,
  data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', vigencia_fim: '2029-05-31', prazo_meses: 30, garantia_tipo: 'Caução', caucao_meses: 2, finalidade: 'Residencial' };

test('os dois contratos têm a cláusula da tarifa, com o valor do cadastro do contrato', () => {
  for (const m of MODELOS_PADRAO.filter((x) => !x.tipo)) {
    const com = texto(K.montarContrato(m.texto, K.dadosDoContrato(banco(), { ...contrato, taxa_boleto: 350 })));
    assert.match(com, /O LOCATÁRIO reembolsará, junto com cada aluguel, a tarifa bancária de emissão do boleto, hoje de R\$ 3,50 \(três reais e cinquenta centavos\), pelo valor cobrado pelo banco\./, m.nome);
    const sem = texto(K.montarContrato(m.texto, K.dadosDoContrato(banco(), contrato)));
    assert.match(sem, /a tarifa bancária de emissão do boleto, pelo valor cobrado pelo banco\./, `${m.nome}: sem valor no cadastro, a cláusula fica sem o "hoje de"`);
    assert.doesNotMatch(sem, /\[tarifa_boleto\?\]|\{tarifa_boleto\}/);
  }
});

test('modelos já gravados recebem a cláusula uma vez; termos aditivos não', () => {
  const atual = MODELOS_PADRAO[0].texto;
  const antigo = atual.replace(`${TARIFA_BOLETO}\n\n`, '');
  assert.notEqual(antigo, atual);
  assert.equal(atualizarTextoModelo(antigo), atual);
  assert.equal(atualizarTextoModelo(atual), atual, 'não entra duas vezes');
  assert.equal(atualizarTextoModelo(antigo.replace(/\n/g, '\r\n')), atual, 'quebra de linha do Windows');
  for (const m of MODELOS_PADRAO.filter((x) => x.tipo)) assert.equal(atualizarTextoModelo(m.texto), m.texto, m.nome);
  const d = R.bancoVazio();
  d.modelos_contrato = [{ id: 1, nome: 'Residencial', texto: antigo, padrao: 'Residencial' }];
  R.normalizar(d);
  assert.equal((d.modelos_contrato[0].texto.match(/tarifa bancária de emissão do boleto/g) || []).length, 1);
});

test('o boleto cobra a tarifa do cadastro do contrato; o Novo contrato só traz a tarifa preenchida se a regra tiver valor', () => {
  // o boleto usa contrato.taxa_boleto (regras.js, gerarCobrancas); a regra "tarifa_padrao" vem em branco (sem tarifa) no padrão do sistema
  assert.equal(R.padroesNovoContrato().taxa_boleto, undefined, 'padrão do sistema: Novo contrato sem tarifa preenchida (decisão do dono pendente)');
});
