// Decisões do dono de 24/11/2026 sobre a busca de 24/11, lote C: os lembretes da régua levam o PDF do boleto feito à mão no
// banco (DOC-05) e o papel do boleto do saldo da saída diz que há multa e juros depois do vencimento (BOL-05).
// Dados fictícios (CPF de teste 529.982.247-25, CNPJ 11.222.333/0001-81).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import { anexosProntos, avisoBoletoPdfDesatualizado } from '../docs/js/email-dados.js';
import { modeloEmail } from '../docs/js/modelos-email.js';
import * as R from '../docs/js/regras.js';
import { carregarSite, entrarComo } from './tela-falsa.mjs';

const T = await carregarSite();
const texto = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

function base() {
  const d = R.normalizar(R.bancoVazio());
  R.inserir(d, 'usuarios', { login: 'dono@exemplo.com.br', nome: 'Dono', papel: 'admin', ativo: true }, 'teste');
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com',
    data_entrada: '2026-03-01', vigencia_inicio: '2026-03-01', aluguel_inicial: 200000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 10, multa_percentual: 10, juros_mensal_percentual: 1 }, 'j');
  T.E.d = d;
  entrarComo(T.E, 'admin');
  return { d, c };
}

/** Boleto do aluguel em aberto, vencendo daqui a 3 dias (etapa "vence em 3 dias" da régua). */
function boletoDaqui3Dias(d, c) {
  const venc = C.somarDias(C.hojeIso(), 3);
  return R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: venc.slice(0, 7), vencimento: venc, dias_cobrados: 30, dias_mes: 30, aluguel_mensal: 200000,
    aluguel: 200000, desconto: 20000, iptu: 0, seguro: 0, taxa_boleto: 0, fci: 0, outros: 0, reserva_utilizada: 0, multa_percentual: 10, juros_mensal_percentual: 1, situacao: 'Em aberto' }, 'j');
}

test('DOC-05: os três lembretes da régua anexam o PDF do boleto feito à mão no banco (sem o PDF, nada)', () => {
  const { d, c } = base();
  const cb = boletoDaqui3Dias(d, c);
  for (const chave of ['cobranca_antes', 'cobranca_dia', 'cobranca_atraso']) {
    assert.deepEqual(anexosProntos(d, modeloEmail(d, chave), { contrato: c, cobranca: cb }), [], `${chave}: sem PDF anexado, sem anexo`);
  }
  R.anexarBoletoPdf(d, cb.id, 'boleto-banco.pdf', 'j');
  for (const chave of ['cobranca_antes', 'cobranca_dia', 'cobranca_atraso']) {
    assert.deepEqual(anexosProntos(d, modeloEmail(d, chave), { contrato: c, cobranca: cb }),
      [{ tipo: 'arquivo', escopo: 'contrato', id: c.id, nome: 'boleto-banco.pdf', rotulo: 'boleto emitido no banco (boleto-banco.pdf)' }], chave);
  }
});

test('DOC-05: PDF desatualizado tem o mesmo aviso do "Enviar boleto por e-mail"', () => {
  const { d, c } = base();
  const cb = boletoDaqui3Dias(d, c);
  R.anexarBoletoPdf(d, cb.id, 'boleto-banco.pdf', 'j');
  assert.equal(avisoBoletoPdfDesatualizado(cb), '');
  cb.aluguel = 210000; // R$ 2.000,00 → R$ 2.100,00 depois de anexado o PDF
  assert.equal(avisoBoletoPdfDesatualizado(cb), 'O boleto mudou depois que o PDF do banco foi anexado: o valor era R$ 2.000,00 e agora é R$ 2.100,00. O PDF anexado pode estar com o valor antigo.');
});

test('DOC-05: a prévia da régua mostra o PDF anexado (não "Sem anexo") e o aviso quando ele ficou velho', async () => {
  const { d, c } = base();
  const cb = boletoDaqui3Dias(d, c);
  const { telaRegua } = await import('../docs/js/telas/regua.js');
  assert.match(texto(await telaRegua()), /Sem anexo \(boleto não emitido no banco\)/, 'sem PDF continua dizendo que não há anexo');
  R.anexarBoletoPdf(d, cb.id, 'boleto-banco.pdf', 'j');
  let t = texto(await telaRegua());
  assert.match(t, /Anexos: boleto emitido no banco \(boleto-banco\.pdf\)/);
  assert.doesNotMatch(t, /Sem anexo/);
  assert.doesNotMatch(t, /O boleto mudou depois/);
  cb.aluguel = 210000;
  t = texto(await telaRegua());
  assert.match(t, /O boleto mudou depois que o PDF do banco foi anexado: o valor era R\$ 2\.000,00 e agora é R\$ 2\.100,00/);
});

test('BOL-05: o papel e a página do boleto do saldo da saída dizem que há multa e juros depois do vencimento (a conta não muda)', async () => {
  const { d, c } = base();
  // saldo de R$ 300,00 que vence 10/12/2026, pago em 20/12/2026: R$ 331,00 (multa R$ 30,00 + juros R$ 1,00)
  const cb = R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2026-11', vencimento: '2026-12-10', dias_cobrados: 30, dias_mes: 30, aluguel_mensal: 0, aluguel: 0,
    desconto: 0, iptu: 0, seguro: 0, taxa_boleto: 0, fci: 0, outros: 30000, outros_descricao: 'Saldo do cálculo final da saída', reserva_utilizada: 0,
    multa_percentual: 10, juros_mensal_percentual: 1, saldo_saida_de: 1, situacao: 'Em aberto' }, 'j');
  assert.ok(R.ehSaldoSaida(cb));
  const r = C.liquidar(cb, '2026-12-20');
  assert.deepEqual([r.valor_devido, r.multa, r.juros], [33100, 3000, 100]);
  const { demonstrativo, telaCobranca } = await import('../docs/js/telas/cobrancas.js');
  const papel = texto(demonstrativo(cb));
  assert.doesNotMatch(papel, /sem multa e juros/);
  assert.match(papel, /Após o vencimento: \+ multa de 10% \+ juros de 1% ao mês, pro rata dia\./);
  R.atualizar(d, 'cobrancas', cb.id, { data_pagamento: '2026-12-20', valor_pago: 33100, dias_atraso: 10, multa: 3000, juros: 100, situacao: 'Pago' }, 'j');
  const pagina = texto(telaCobranca(cb));
  assert.doesNotMatch(pagina, /não tem multa e juros/);
  assert.match(pagina, /Pago depois do vencimento, tem a multa e os juros do contrato/);
});
