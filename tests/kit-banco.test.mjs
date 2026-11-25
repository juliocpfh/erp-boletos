// O banco fictício do kit de teste (tests/kit/banco.mjs, usado por node tools/kit-teste.mjs) continua sendo montado pelas
// regras e com os valores que os roteiros esperam nas telas. Se uma regra mudou de propósito, atualize o banco e os roteiros.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as FO from '../docs/js/ficha-online.js';
import * as R from '../docs/js/regras.js';
import { HOJE, montarBanco } from './kit/banco.mjs';

test('banco do kit: monta pelas regras, só com os documentos de teste, e com os casos que os roteiros abrem', async () => {
  const { banco: d, ids } = await montarBanco();
  const cpfs = new Set(JSON.stringify(d).match(/\d{3}\.\d{3}\.\d{3}-\d{2}/g));
  assert.deepEqual([...cpfs], ['529.982.247-25']);
  const cb = (id) => R.buscar(d, 'cobrancas', id);
  assert.equal(R.totais(cb(ids.anaBoleto)).a_pagar_sem_desconto, 180850, 'R$ 1.800,00 + tarifa de R$ 8,50');
  assert.equal(cb(ids.anaBoleto).boleto_pdf, 'boleto-11-2026.pdf');
  assert.deepEqual(C.liquidar(cb(ids.brunoAtrasado), HOJE).valor_devido, 204990, 'multa R$ 40,00 + juros R$ 9,90');
  assert.equal(R.totais(cb(ids.diegoBoleto)).a_pagar_sem_desconto, 90000, '15 de 30 dias');
  assert.ok(R.buscar(d, 'acordos', ids.acordo).honorarios > 0);
  assert.equal(R.buscar(d, 'contratos', ids.fabio).heranca_transferida, '2026-11-01');
  assert.equal(R.buscar(d, 'encerramentos', ids.encerramento).saldo, 340000);
  assert.equal(R.buscar(d, 'notificacoes', ids.notificacao).situacao, 'Aguardando resposta');
  assert.ok(R.buscar(d, 'fichas', ids.ficha).aceite_reserva);
  // o link da ficha de Igor vem com a profissão da ficha antiga dele; nada dos outros cadastros com o mesmo CPF de teste
  const v = FO.valoresDoLink(d, R.buscar(d, 'fichas', ids.ficha), 'interessado');
  assert.equal(v.inquilino_profissao, 'Analista de testes');
  assert.equal(v.inquilino_email, 'ficha@exemplo.com.br');
  assert.equal(v.inquilino_telefone, undefined, 'o telefone é dos contratos de Ana, Bruno…: outra pessoa');
  assert.equal(d.usuarios.filter((u) => u.papel === 'admin' && u.ativo).length, 1);
});

test('banco do kit: casos de 25/11 (reserva que quita o boleto e acordo refeito)', async () => {
  const { banco: d, ids } = await montarBanco();
  const cb = (id) => R.buscar(d, 'cobrancas', id);
  // reserva de R$ 2.000,00 que quita o boleto de R$ 1.800,00 (25/11/2026)
  assert.equal(cb(ids.juliaBoleto).situacao, 'Quitado pela reserva');
  assert.equal(cb(ids.juliaBoleto).reserva_utilizada, 180000);
  assert.equal(R.aCobrar(cb(ids.juliaBoleto)), false);
  // Kauã: venceu em 10/11 e a quitação fica para o Painel registrar sozinho
  assert.equal(cb(ids.kauaBoleto).vencimento, '2026-11-10');
  assert.equal(cb(ids.kauaBoleto).data_pagamento, null);
  assert.deepEqual(R.quitacoesPelaReservaAte(d, HOJE).map((x) => x.id), [ids.kauaBoleto]);
  // acordo refeito: as parcelas novas trazem os honorários e a carta de R$ 73,50 do 1º acordo
  const a1 = R.buscar(d, 'acordos', ids.acordoAntigo);
  assert.ok(a1.honorarios > 0 && a1.despesas_cobranca[0].valor === 7350);
  const enc = R.parcelasDoAcordo(d, R.buscar(d, 'acordos', ids.acordoRefeito)).flatMap((x) => x.encargos_cobranca || []).reduce((s, e) => s + e.valor, 0);
  assert.equal(enc, a1.honorarios + 7350);
});
