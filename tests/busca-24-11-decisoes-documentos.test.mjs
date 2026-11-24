import assert from 'node:assert/strict';
import test from 'node:test';
import * as AI from '../docs/js/arquivo-impresso.js';
import * as CR from '../docs/js/config-regras.js';
import * as K from '../docs/js/contratos.js';
import * as DL from '../docs/js/documentos-locacao.js';
import * as R from '../docs/js/regras.js';
import { TABELAS_CONHECIDAS } from '../nuvem/cofre.mjs';

// Decisão do dono de 24/11/2026 (busca de 24/11, pergunta 8, DOC-07, opção (a)): os documentos de "Outros documentos da
// locação" ficam registrados no contrato, com a via assinada; a prorrogação assinada muda a data de término.
function base() {
  const d = R.bancoVazio();
  CR.usarRegras(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const apto = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto 2', endereco: 'Rua das Flores, 100', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: apto.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  // contrato de 31/05/2024, 36 meses: vai até 31/05/2027
  const c = R.inserir(d, 'contratos', { imovel_id: apto.id, inquilino_nome: 'Ana Souza', inquilino_cpf: '529.982.247-25', garantia_tipo: 'Caução', caucao_valor: 600000,
    data_entrada: '2024-05-31', vigencia_inicio: '2024-05-31', vigencia_fim: '2027-05-31', prazo_meses: 36, prazo_tipo: 'Determinado', aluguel_inicial: 200000, dia_vencimento: 10,
    conta_agua: 'Incluso no aluguel', conta_energia: 'Incluso no aluguel', conta_gas: 'Não tem', conta_condominio: 'Não tem', conta_seguro: 'Não tem' }, 'julio');
  return { d, c };
}
const modelo = (d, tipo) => K.modelosDe(d, tipo)[0];
const gerar = (d, c, tipo, valores, data = '2027-05-02') => DL.registrarDocumento(d, c.id, { tipo, modelo: modelo(d, tipo), valores, data, fim: R.fimDoContrato(d, c) }, 'julio');
const PRORROGACAO = { numero_aditivo: '', novo_prazo_meses: '24', nova_data_inicio: '2027-06-01', nova_data_fim: '2029-05-31' };

test('prorrogação: registrada como termo aditivo (com o número), a data só muda com a via assinada e volta ao tirar o arquivo', () => {
  const { d, c } = base();
  // já existe o 1º termo aditivo (troca do vencimento, assinado): a prorrogação é o 2º
  R.inserir(d, 'aditivos', { contrato_id: c.id, imovel_id: c.imovel_id, numero: 1, tipo: 'Vencimento', data: '2025-02-10', assunto: 'troca do vencimento', arquivo: 'aditivo-1.pdf' }, 'julio');
  assert.equal(R.fimDoContrato(d, c), '2027-05-31');
  const { tabela, registro: a } = gerar(d, c, 'aditivo_prazo', PRORROGACAO);
  assert.equal(tabela, 'aditivos');
  assert.equal(a.numero, 2);
  assert.equal(a.tipo, 'Prorrogação do prazo');
  assert.equal(a.campos.nova_data_fim, '2029-05-31', 'os campos digitados ficam gravados');
  assert.equal(a.assunto, 'Prorrogação do prazo: 24 meses, de 01/06/2027 a 31/05/2029');
  assert.ok(R.aditivosAguardando(d, c.id).some((x) => x.id === a.id), 'fica aguardando a assinatura');
  assert.equal(R.proximoNumeroAditivo(d, c), 3, 'conta no número do próximo termo aditivo');
  // gerar de novo, ainda sem assinatura: o mesmo termo muda (sem gastar outro número)
  const outra = gerar(d, c, 'aditivo_prazo', { ...PRORROGACAO, numero_aditivo: '2', nova_data_fim: '2029-05-31' });
  assert.equal(outra.registro.id, a.id);
  assert.equal(d.aditivos.length, 2);
  // antes de anexar, a data não muda
  assert.equal(R.fimDoContrato(d, c), '2027-05-31');
  // o texto sai com o número e a data nova
  const texto = K.montarContrato(a.texto, K.dadosDoDocumento(d, c, 'aditivo_prazo', a.campos, { data: a.data, fim: a.fim })).map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : '')).join(' ');
  assert.match(texto, /2º TERMO ADITIVO/);
  assert.match(texto, /31 de maio de 2029/);

  // via assinada anexada: o término passa a 31/05/2029 (cadastro, R.fimDoContrato e o prazo em meses)
  R.assinarAditivo(d, a.id, { data: '2027-05-20', arquivo: 'termo-aditivo-2-prorrogacao.pdf' }, 'julio');
  assert.equal(DL.aplicarProrrogacao(d, a.id, 'julio'), 'A data de término do contrato passou a 31/05/2029.');
  assert.equal(R.fimDoContrato(d, c), '2029-05-31');
  assert.equal(c.vigencia_fim, '2029-05-31');
  assert.equal(c.prazo_meses, 60);
  assert.equal(d.renovacoes.length, 1);
  assert.equal(DL.termoDaRenovacao(d, d.renovacoes[0]).id, a.id, 'a renovação é a do termo (só sai pelo termo)');
  assert.equal(DL.aplicarProrrogacao(d, a.id, 'julio'), '', 'não aplica duas vezes');
  assert.equal(d.renovacoes.length, 1);
  assert.ok(AI.itensDaPasta(d, c).some((i) => i.vaga === `aditivo:${a.id}`), 'o arquivo impresso conta o termo assinado');

  // tirar o arquivo (não valeu): a data volta a 31/05/2027 e o termo volta a aguardar a assinatura
  assert.equal(DL.desfazerProrrogacao(d, a.id, 'julio'), 'A data de término do contrato volta a 31/05/2027.');
  R.desfazerAditivo(d, a.id, 'julio', { excluirTermo: false });
  assert.equal(R.fimDoContrato(d, c), '2027-05-31');
  assert.equal(c.vigencia_fim, '2027-05-31');
  assert.equal(c.prazo_meses, 36);
  assert.equal(d.renovacoes.length, 0);
  assert.ok(R.aditivosAguardando(d, c.id).some((x) => x.id === a.id));

  // assinado de novo e depois o termo excluído (não valeu): a data volta de novo
  R.assinarAditivo(d, a.id, { data: '2027-05-21', arquivo: 'termo-aditivo-2-prorrogacao.pdf' }, 'julio');
  DL.aplicarProrrogacao(d, a.id, 'julio');
  assert.equal(R.fimDoContrato(d, c), '2029-05-31');
  DL.desfazerProrrogacao(d, a.id, 'julio');
  R.desfazerAditivo(d, a.id, 'julio', { excluirTermo: true });
  assert.equal(R.fimDoContrato(d, c), '2027-05-31');
  assert.equal(c.vigencia_fim, '2027-05-31');
  assert.ok(!d.aditivos.some((x) => x.id === a.id));
});

test('prorrogação sem a nova data: assinar não muda o término e avisa', () => {
  const { d, c } = base();
  const { registro: a } = gerar(d, c, 'aditivo_prazo', { ...PRORROGACAO, nova_data_fim: '' });
  assert.equal(a.numero, 1);
  R.assinarAditivo(d, a.id, { data: '2027-05-20', arquivo: 'termo.pdf' }, 'julio');
  assert.match(DL.aplicarProrrogacao(d, a.id, 'julio'), /sem a nova data de término/);
  assert.equal(R.fimDoContrato(d, c), '2027-05-31');
});

test('distrato e declaração: registrados no contrato com a via assinada; não mudam data nenhuma nem o número dos termos', () => {
  const { d, c } = base();
  const dis = gerar(d, c, 'distrato', { data_saida: '2026-12-15', multa_combinada: '' });
  const dec = gerar(d, c, 'declaracao_pagamentos', { periodo_inicio: '2024-05-31', periodo_fim: '2026-10-31' });
  assert.equal(dis.tabela, 'documentos_locacao');
  assert.equal(dec.tabela, 'documentos_locacao');
  assert.equal(dis.registro.assunto, 'Distrato: entrega das chaves em 15/12/2026, multa dispensada');
  assert.deepEqual(dec.registro.campos, { periodo_inicio: '2024-05-31', periodo_fim: '2026-10-31' });
  assert.equal(DL.documentosDo(d, c.id).length, 2);
  // o mesmo documento gerado de novo, igual e ainda sem assinatura, não se repete; com outro campo, é outro registro (histórico)
  assert.equal(gerar(d, c, 'distrato', { data_saida: '2026-12-15', multa_combinada: '' }).registro.id, dis.registro.id);
  assert.notEqual(gerar(d, c, 'distrato', { data_saida: '2026-12-20', multa_combinada: '500' }).registro.id, dis.registro.id);
  assert.equal(DL.documentosDo(d, c.id).length, 3);
  assert.equal(R.proximoNumeroAditivo(d, c), 1, 'não são termos aditivos');
  DL.anexarDocumento(d, dis.registro.id, { data: '2026-11-25', arquivo: 'distrato-assinado.pdf' }, 'julio');
  DL.anexarDocumento(d, dec.registro.id, { data: '2026-11-25', arquivo: 'declaracao-assinada.pdf' }, 'julio');
  assert.equal(R.fimDoContrato(d, c), '2027-05-31');
  assert.equal(c.vigencia_fim, '2027-05-31');
  assert.equal(c.data_saida, undefined, 'o distrato não informa a saída sozinho');
  assert.equal(d.renovacoes.length, 0);
  // o anexo é conhecido (conferência, limpeza, excluir apaga) e entra na pasta física
  const refs = R.arquivosReferenciados(d).filter((x) => x.escopo === 'aditivos' && x.id === c.id).map((x) => x.nome);
  assert.deepEqual(refs.sort(), ['declaracao-assinada.pdf', 'distrato-assinado.pdf']);
  assert.match(R.rotulosDosArquivos(d).get(`aditivos:${c.id}|distrato-assinado.pdf`), /^termo de rescisão amigável \(distrato\) de 02\/05\/2027 assinado$/);
  const vagas = AI.itensDaPasta(d, c).map((i) => i.vaga);
  assert.ok(vagas.includes(`documento:${dis.registro.id}`) && vagas.includes(`documento:${dec.registro.id}`));
  // tirar a via assinada: o arquivo deixa de ser usado (sai da pasta) e o documento volta a aguardar
  DL.tirarArquivoDocumento(d, dis.registro.id, 'julio');
  assert.ok(!R.arquivosReferenciados(d).some((x) => x.nome === 'distrato-assinado.pdf'));
  assert.equal(dis.registro.arquivo, null);
  assert.throws(() => DL.anexarDocumento(d, dis.registro.id, { data: '2026-11-25', arquivo: '' }, 'julio'), /Anexe o arquivo assinado/);
});

test('tabela nova: no banco, nos bancos antigos, na nuvem e na exclusão do contrato', () => {
  assert.ok(R.TABELAS.documentos_locacao);
  assert.ok(TABELAS_CONHECIDAS.includes('documentos_locacao'));
  const antigo = R.bancoVazio();
  delete antigo.documentos_locacao;
  R.normalizar(antigo);
  assert.deepEqual(antigo.documentos_locacao, []);
  const { d, c } = base();
  gerar(d, c, 'aviso_desocupacao', { data_saida_prevista: '2026-12-31' });
  R.excluirContrato(d, c.id, 'julio');
  assert.equal(d.documentos_locacao.length, 0);
});
