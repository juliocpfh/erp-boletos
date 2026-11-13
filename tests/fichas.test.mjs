// Fichas em análise (regras.js): imóveis da ficha (apenas um / todos juntos), uma ficha aberta por imóvel, pendências do
// Painel, dados que vão para o Novo contrato e o prazo de 3 meses para apagar os documentos da reprovada.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as R from '../docs/js/regras.js';

function base() {
  const d = R.bancoVazio();
  const a = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto A' }, 'teste');
  const b = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto B' }, 'teste');
  const c = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto C' }, 'teste');
  const ficha = (extra) => R.inserir(d, 'fichas', { inquilino_nome: 'Interessado Teste', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física',
    data_recebida: '2026-11-12', situacao: 'Em análise', modo_imoveis: 'Apenas um dos imóveis', imoveis_ids: [a.id], ...extra }, 'teste');
  return { d, a, b, c, ficha };
}

test('ficha aberta ocupa os imóveis dela: cada imóvel com no máximo uma ficha por vez', () => {
  const { d, a, b, c, ficha } = base();
  const f = ficha({ imoveis_ids: [a.id, b.id] });
  assert.equal(R.fichaAbertaDoImovel(d, a.id).id, f.id);
  assert.equal(R.fichaAbertaDoImovel(d, b.id).id, f.id);
  assert.equal(R.fichaAbertaDoImovel(d, c.id), null);
  assert.equal(R.fichaAbertaDoImovel(d, a.id, f.id), null, 'a própria ficha não conta (edição)');
  R.atualizar(d, 'fichas', f.id, { situacao: 'Reprovada', decisao_data: '2026-11-14' }, 'teste');
  assert.equal(R.fichaAbertaDoImovel(d, a.id), null, 'reprovada libera o imóvel');
});

test('aprovada "apenas um": um contrato fecha a ficha; "todos juntos": um contrato para cada imóvel', () => {
  const { d, a, b, ficha } = base();
  const um = ficha({ imoveis_ids: [a.id, b.id], situacao: 'Aprovada', decisao_data: '2026-11-14' });
  assert.deepEqual(R.imoveisParaContrato(d, um), [a.id, b.id]);
  assert.ok(R.fichaAberta(d, um), 'aprovada sem contrato ainda ocupa os imóveis');
  R.inserir(d, 'contratos', { imovel_id: b.id, inquilino_nome: 'Interessado Teste', ficha_id: um.id }, 'teste');
  assert.deepEqual(R.imoveisParaContrato(d, um), [], 'apenas um: o primeiro contrato encerra');
  assert.ok(!R.fichaAberta(d, um));

  const { d: d2, a: a2, b: b2, ficha: ficha2 } = base();
  const todos = ficha2({ imoveis_ids: [a2.id, b2.id], modo_imoveis: 'Todos juntos', situacao: 'Aprovada', decisao_data: '2026-11-14' });
  R.inserir(d2, 'contratos', { imovel_id: a2.id, inquilino_nome: 'Interessado Teste', ficha_id: todos.id }, 'teste');
  assert.deepEqual(R.imoveisParaContrato(d2, todos), [b2.id], 'todos juntos: falta o contrato do outro imóvel');
  assert.equal(R.fichaAbertaDoImovel(d2, b2.id).id, todos.id);
  assert.equal(R.fichaAbertaDoImovel(d2, a2.id).id, todos.id, 'a ficha continua aberta até o último contrato');
});

test('em análise não tem contrato a fazer', () => {
  const { d, ficha } = base();
  assert.deepEqual(R.imoveisParaContrato(d, ficha()), []);
});

test('Novo contrato a partir da ficha: dados da pessoa e, só no primeiro contrato, a reserva', () => {
  const { d, a, b, ficha } = base();
  const f = ficha({ imoveis_ids: [a.id, b.id], modo_imoveis: 'Todos juntos', situacao: 'Aprovada', reserva_valor: 50000, reserva_data: '2026-11-10', inquilino_telefone: '(41) 99999-0000', doc_ficha: true });
  const dados = R.dadosDaFicha(d, f);
  assert.equal(dados.inquilino_nome, 'Interessado Teste');
  assert.equal(dados.inquilino_cpf, '529.982.247-25');
  assert.equal(dados.reserva_valor, 50000);
  assert.equal(dados.reserva_data, '2026-11-10');
  assert.equal(dados.doc_ficha, undefined, 'o que é só da análise não vai para o contrato');
  assert.equal(dados.situacao, undefined);
  R.inserir(d, 'contratos', { imovel_id: a.id, inquilino_nome: 'Interessado Teste', ficha_id: f.id, reserva_valor: 50000 }, 'teste');
  assert.equal(R.dadosDaFicha(d, f).reserva_valor, undefined, 'a reserva vai só para o primeiro contrato');
});

test('reprovada com reserva: pendência de devolução até registrar; documentos apagados 3 meses depois da decisão', () => {
  const { d, ficha } = base();
  const f = ficha({ situacao: 'Reprovada', decisao_data: '2026-11-14', reserva_valor: 50000 });
  assert.ok(R.devolucaoPendente(f));
  assert.ok(R.pendenciasDasFichas(d).some((p) => /devolução da reserva de R\$ 500,00/.test(p.texto)));
  assert.equal(R.dataApagarDocumentosFicha(f), '2027-02-14', '14/11/2026 + 3 meses');
  assert.deepEqual(R.fichasComDocumentosVencidos(d, '2027-02-13'), []);
  assert.equal(R.fichasComDocumentosVencidos(d, '2027-02-14').length, 1);
  R.atualizar(d, 'fichas', f.id, { devolucao_data: '2026-11-20', devolucao_valor: 50000, documentos_apagados_em: '2027-02-14' }, 'teste');
  const g = R.buscar(d, 'fichas', f.id);
  assert.ok(!R.devolucaoPendente(g));
  assert.equal(R.dataApagarDocumentosFicha(g), null, 'já apagados: não apaga de novo');
  assert.deepEqual(R.pendenciasDasFichas(d), []);
});

test('pendências do Painel: em análise e aprovada sem contrato', () => {
  const { d, a, b, ficha } = base();
  ficha();
  ficha({ inquilino_nome: 'Outro Teste', imoveis_ids: [b.id], situacao: 'Aprovada', decisao_data: '2026-11-14' });
  const textos = R.pendenciasDasFichas(d).map((p) => p.texto);
  assert.deepEqual(textos, ['ficha de Interessado Teste em análise desde 12/11/2026', 'ficha de Outro Teste aprovada: falta fazer o contrato']);
  assert.ok(a);
});

test('comprovantes da ficha são arquivos ligados a ela (apagados se a ficha sair)', () => {
  const { d, ficha } = base();
  const f = ficha({ situacao: 'Reprovada', decisao_data: '2026-11-14', reserva_valor: 50000, reserva_data: '2026-11-10', comprovante_reserva: 'comprovante-reserva-2026-11-10.pdf', devolucao_data: '2026-11-20', comprovante_devolucao: 'comprovante-devolucao-reserva-2026-11-20.pdf' });
  const usados = R.arquivosReferenciados(d).filter((x) => x.escopo === 'ficha');
  assert.deepEqual(usados.map((x) => [x.id, x.nome]), [[f.id, 'comprovante-reserva-2026-11-10.pdf'], [f.id, 'comprovante-devolucao-reserva-2026-11-20.pdf']]);
  assert.match(R.rotulosDosArquivos(d).get(`ficha:${f.id}|comprovante-reserva-2026-11-10.pdf`), /comprovante da reserva/);
});

test('proposta da ficha (aluguel, vencimento, bonificação e garantia) e comprovante da reserva vão para o Novo contrato', () => {
  const { d, a, b, ficha } = base();
  const f = ficha({ imoveis_ids: [a.id, b.id], modo_imoveis: 'Todos juntos', situacao: 'Aprovada', aluguel_inicial: 200000, dia_vencimento: 10, bonificacao: true,
    desconto_pontualidade_percentual: 10, garantia_tipo: 'Caução', reserva_valor: 50000, reserva_data: '2026-11-10', comprovante_reserva: 'comprovante-reserva-2026-11-10.pdf', analise_serasa: 'analise-serasa-2026-11-10.pdf' });
  const dados = R.dadosDaFicha(d, f);
  assert.equal(dados.aluguel_inicial, 200000);
  assert.equal(dados.aluguel_bonificado, 180000, 'R$ 2.000,00 com 10% → R$ 1.800,00');
  assert.equal(dados.dia_vencimento, 10);
  assert.equal(dados.garantia_tipo, 'Caução');
  assert.equal(dados.comprovante_reserva, 'comprovante-reserva-2026-11-10.pdf');
  assert.equal(dados.analise_serasa, undefined, 'o Serasa vai para a pasta do inquilino, não para um campo do contrato');
  R.inserir(d, 'contratos', { imovel_id: a.id, inquilino_nome: 'Interessado Teste', ficha_id: f.id }, 'teste');
  const segundo = R.dadosDaFicha(d, f);
  assert.equal(segundo.aluguel_inicial, 200000, 'a proposta vale para todos os contratos da ficha');
  assert.equal(segundo.comprovante_reserva, undefined);
  const sem = R.dadosDaFicha(d, ficha({ imoveis_ids: [b.id], aluguel_inicial: 150000, bonificacao: false, desconto_pontualidade_percentual: 0 }));
  assert.equal(sem.aluguel_bonificado, undefined, 'sem bonificação não há aluguel bonificado');
  assert.equal(sem.bonificacao, false);
});

test('Novo contrato aberto pelo imóvel acha a ficha aprovada que espera o contrato dele', () => {
  const { d, a, b, ficha } = base();
  const f = ficha({ imoveis_ids: [a.id], situacao: 'Aprovada', decisao_data: '2026-11-14' });
  assert.equal(R.fichaAprovadaDoImovel(d, a.id).id, f.id);
  assert.equal(R.fichaAprovadaDoImovel(d, String(a.id)).id, f.id, 'o id vem do endereço (texto)');
  assert.equal(R.fichaAprovadaDoImovel(d, b.id), null);
  ficha({ imoveis_ids: [b.id] });
  assert.equal(R.fichaAprovadaDoImovel(d, b.id), null, 'em análise ainda não vira contrato');
  R.inserir(d, 'contratos', { imovel_id: a.id, inquilino_nome: 'Interessado Teste', ficha_id: f.id }, 'teste');
  assert.equal(R.fichaAprovadaDoImovel(d, a.id), null, 'com o contrato feito, a ficha não é usada de novo');
});

test('desistência antes de assinar: contrato não assinado cancelado, ficha "Desistiu" e reserva para devolver por inteiro', () => {
  const { d, a, ficha } = base();
  const f = ficha({ situacao: 'Aprovada', decisao_data: '2026-11-12', reserva_valor: 100000, reserva_data: '2026-11-05', comprovante_reserva: 'comprovante-reserva-2026-11-05.pdf' });
  const c = R.inserir(d, 'contratos', { imovel_id: a.id, inquilino_nome: 'Interessado Teste', ficha_id: f.id, reserva_valor: 100000, reserva_data: '2026-11-05',
    comprovante_reserva: 'comprovante-reserva-2026-11-05.pdf', aluguel_inicial: 200000 }, 'teste');
  R.atualizar(d, 'fichas', f.id, { documentos_no_contrato: c.id, comprovante_reserva: null }, 'teste');
  R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2026-12', vencimento: '2026-12-10', valor_total: 100000 }, 'teste');
  assert.equal(R.motivoSemDesistencia(d, c), null);
  const salva = R.desistirAntesDeAssinar(d, { fichaId: f.id, data: '2026-11-13', motivo: 'Achou outro imóvel', arquivos: ['comprovante-reserva-2026-11-05.pdf', 'analise-serasa-2026-11-06.pdf'] }, 'teste', '2026-11-13');
  assert.equal(salva.situacao, 'Desistiu');
  assert.equal(salva.comprovante_reserva, 'comprovante-reserva-2026-11-05.pdf', 'o comprovante volta para a ficha');
  assert.equal(salva.analise_serasa, 'analise-serasa-2026-11-06.pdf');
  assert.equal(salva.documentos_no_contrato, null);
  assert.match(salva.decisao_motivo, /Achou outro imóvel.*cancelado/);
  assert.ok(!R.buscar(d, 'contratos', c.id), 'contrato cancelado');
  assert.ok(!d.cobrancas.some((x) => x.contrato_id === c.id), 'boletos não pagos saem junto');
  assert.ok(R.devolucaoPendente(salva));
  assert.match(R.pendenciasDasFichas(d).map((p) => p.texto).join(), /desistência: registrar a devolução da reserva de R\$ 1\.000,00/);
  assert.equal(R.dataApagarDocumentosFicha(salva), '2027-02-13', 'documentos apagados 3 meses depois, como na reprovada');
  assert.equal(R.fichaAbertaDoImovel(d, a.id), null, 'o imóvel fica livre');
});

test('desistência: contrato assinado ou com boleto pago não se cancela; contrato sem ficha vira ficha "Desistiu"', () => {
  const { d, a } = base();
  const assinado = R.inserir(d, 'contratos', { imovel_id: a.id, inquilino_nome: 'Assinado Teste', doc_contrato_em: '2026-11-10' }, 'teste');
  assert.match(R.motivoSemDesistencia(d, assinado), /já foi assinado/);
  const pago = R.inserir(d, 'contratos', { imovel_id: a.id, inquilino_nome: 'Pago Teste' }, 'teste');
  R.inserir(d, 'cobrancas', { contrato_id: pago.id, competencia: '2026-12', vencimento: '2026-12-10', valor_total: 100000, data_pagamento: '2026-12-10' }, 'teste');
  assert.match(R.motivoSemDesistencia(d, pago), /boleto pago/);
  assert.throws(() => R.desistirAntesDeAssinar(d, { contratoId: pago.id, data: '2026-11-13' }, 'teste', '2026-11-13'), /boleto pago/);

  const solto = R.inserir(d, 'contratos', { imovel_id: a.id, inquilino_nome: 'Direto Teste', inquilino_cpf: '529.982.247-25', reserva_valor: 50000, reserva_data: '2026-11-01',
    comprovante_reserva: 'comprovante-reserva-2026-11-01.pdf', aluguel_inicial: 150000 }, 'teste');
  assert.throws(() => R.desistirAntesDeAssinar(d, { contratoId: solto.id, data: '2026-11-20' }, 'teste', '2026-11-13'), /data futura/);
  const f = R.desistirAntesDeAssinar(d, { contratoId: solto.id, data: '2026-11-13', pasta: 'Direto Teste (ficha 01-11-2026)', arquivos: ['comprovante-reserva-2026-11-01.pdf'] }, 'teste', '2026-11-13');
  assert.equal(f.situacao, 'Desistiu');
  assert.equal(f.inquilino_cpf, '529.982.247-25');
  assert.equal(f.reserva_valor, 50000);
  assert.equal(f.comprovante_reserva, 'comprovante-reserva-2026-11-01.pdf');
  assert.equal(f.aluguel_inicial, 150000);
  assert.deepEqual(f.imoveis_ids, [a.id]);
  assert.ok(!R.buscar(d, 'contratos', solto.id));
});
