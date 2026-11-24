import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as R from '../docs/js/regras.js';
import { TABELAS_CONHECIDAS } from '../nuvem/cofre.mjs';

// Cobrança: registros e provas (pedido do dono em 2026-11-24): guarda os passos e os gastos da cobrança com os comprovantes,
// sem somar em nada (boleto, NF, acordo, cálculo final). Dados fictícios.
function base() {
  const d = R.bancoVazio();
  R.normalizar(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-08-01', vigencia_inicio: '2026-08-01', aluguel_inicial: 180000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 0, bonificacao: false, multa_percentual: 2, juros_mensal_percentual: 1 }, 'julio');
  for (const m of ['2026-08', '2026-09', '2026-10']) R.gerarCobrancas(d, m, 'julio');
  return { d, c, cb: R.boletoDoMes(d, c.id, '2026-09') };
}
const registro = (d, campos) => R.inserir(d, 'cobranca_registros', { data: '2026-11-05', tipo: 'Carta', valor: null, descricao: 'Carta com AR', arquivos: [], ...campos }, 'julio');

test('tabela nova: no banco vazio, na nuvem (TABELAS_CONHECIDAS) e a lista de arquivos sempre existe', () => {
  const d = R.bancoVazio();
  assert.deepEqual(d.cobranca_registros, []);
  assert.ok(TABELAS_CONHECIDAS.includes('cobranca_registros'));
  d.cobranca_registros.push({ id: 1, contrato_id: 1, data: '2026-11-01', tipo: 'Carta' }, { id: 2, contrato_id: 1, data: '2026-11-02', tipo: 'Outro', arquivos: 'carta.pdf' });
  R.normalizar(d);
  assert.deepEqual(d.cobranca_registros.map((x) => x.arquivos), [[], ['carta.pdf']]);
});

test('os comprovantes entram nos arquivos do lançamento (rótulo, conferência, limpeza); tirar um solta só ele', () => {
  const { d, c, cb } = base();
  const r = registro(d, { contrato_id: c.id, cobranca_id: cb.id, valor: 2850, arquivos: ['cobranca-carta-2026-11-05-carta.pdf', 'cobranca-carta-2026-11-05-ar.jpg'] });
  const refs = R.arquivosReferenciados(d).filter((a) => a.escopo === 'contrato' && a.id === c.id).map((a) => a.nome);
  assert.ok(refs.includes('cobranca-carta-2026-11-05-carta.pdf') && refs.includes('cobranca-carta-2026-11-05-ar.jpg'));
  assert.equal(R.rotulosDosArquivos(d).get(`contrato:${c.id}|cobranca-carta-2026-11-05-ar.jpg`), 'prova da cobrança: carta de 05/11/2026');
  R.removerArquivoDoRegistro(d, r.id, 'cobranca-carta-2026-11-05-ar.jpg', 'julio');
  assert.deepEqual(R.buscar(d, 'cobranca_registros', r.id).arquivos, ['cobranca-carta-2026-11-05-carta.pdf']);
  assert.ok(!R.arquivosReferenciados(d).some((a) => a.nome === 'cobranca-carta-2026-11-05-ar.jpg'));
  assert.throws(() => R.removerArquivoDoRegistro(d, r.id, 'cobranca-carta-2026-11-05-ar.jpg', 'julio'), /já foi tirado/);
  // excluir o contrato leva os registros (e os arquivos deles saem da lista: são apagados junto)
  R.excluirContrato(d, c.id, 'julio');
  assert.equal(d.cobranca_registros.length, 0);
});

test('nada soma: boleto, NF, débitos da saída e o boleto que vence ficam iguais com registros de R$ 545,00', () => {
  const { d, c, cb } = base();
  const antes = { total: R.totais(cb), outros: cb.outros, liquido: C.liquidar(cb, '2026-11-20'), saida: JSON.stringify(R.debitosDaSaida(d, c, '2026-11-20')) };
  registro(d, { contrato_id: c.id, cobranca_id: cb.id, tipo: 'Protesto', valor: 4500 });
  registro(d, { contrato_id: c.id, tipo: 'Advogado', valor: 50000, descricao: 'Honorários do advogado (só anotado)' });
  R.recalcularCobrancas(d, (x) => x.contrato_id === c.id, 'julio');
  assert.deepEqual(R.totais(cb), antes.total);
  assert.equal(cb.outros, antes.outros);
  assert.deepEqual(C.liquidar(cb, '2026-11-20'), antes.liquido);
  assert.equal(JSON.stringify(R.debitosDaSaida(d, c, '2026-11-20')), antes.saida);
  assert.equal(R.gastoDaCobranca(R.registrosCobrancaDo(d, c.id)), 54500);
});

test('lista do inquilino em ordem de data; no boleto, os dele e os do acordo de que ele faz parte; texto do "referente a"', () => {
  const { d, c, cb } = base();
  const out = R.boletoDoMes(d, c.id, '2026-10');
  const a = R.inserir(d, 'acordos', { contrato_id: c.id, data: '2026-11-12', referente: 'aluguéis de 09 e 10/2026', parcelas: 2, valor_total: 370000, divida_na_data: 370000 }, 'julio');
  cb.acordo_id = a.id;
  const r3 = registro(d, { contrato_id: c.id, acordo_id: a.id, data: '2026-11-20', tipo: 'E-mail' });
  const r1 = registro(d, { contrato_id: c.id, cobranca_id: cb.id, data: '2026-10-15', tipo: 'WhatsApp / ligação' });
  const r2 = registro(d, { contrato_id: c.id, cobranca_id: out.id, data: '2026-11-01' });
  assert.deepEqual(R.registrosCobrancaDo(d, c.id).map((x) => x.id), [r1.id, r2.id, r3.id]);
  assert.deepEqual(R.registrosDoBoleto(d, cb).map((x) => x.id), [r1.id, r3.id]);
  assert.deepEqual(R.registrosDoBoleto(d, out).map((x) => x.id), [r2.id]);
  assert.equal(R.referenteDoRegistro(d, r1), `boleto de 09/2026 (vence ${C.dataBr(cb.vencimento)})`);
  assert.equal(R.referenteDoRegistro(d, r3), 'acordo de 12/11/2026');
  assert.equal(R.referenteDoRegistro(d, { contrato_id: c.id }), 'cobrança em geral');
  R.excluir(d, 'cobrancas', out.id, 'julio');
  assert.equal(R.referenteDoRegistro(d, r2), 'boleto (excluído depois)', 'o boleto sai, o registro e a prova ficam');
});

test('endereços do registro: ?cobranca= e ?acordo= aceitos só com número', () => {
  assert.deepEqual(C.sanearParametros({ contrato: '3', cobranca: '12', acordo: '4' }), { contrato: '3', cobranca: '12', acordo: '4' });
  assert.deepEqual(C.sanearParametros({ contrato: '3', cobranca: '12<x>', acordo: 'abc' }), { contrato: '3' });
});

test('formulário e telas: tipos da lista, campo de vários arquivos com accept, aviso de que nada é cobrado', () => {
  const cad = fs.readFileSync(new URL('../docs/js/telas/cadastros.js', import.meta.url), 'utf8');
  assert.match(cad, /name="arquivos_novos" multiple accept="\$\{ACEITA_DOCUMENTOS\}"/);
  assert.match(cad, /não entra no boleto, na NF, no acordo nem no cálculo final/);
  assert.deepEqual(R.TIPOS_REGISTRO_COBRANCA.slice(0, 2), ['Carta', 'E-mail']);
  for (const t of ['Notificação', 'Protesto', 'Cartório', 'Advogado', 'Outro']) assert.ok(R.TIPOS_REGISTRO_COBRANCA.includes(t), t);
});
