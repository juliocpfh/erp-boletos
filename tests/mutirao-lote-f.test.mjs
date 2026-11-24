// Mutirão de 19–20/11, lotes F1 e F2 (contrato, vistoria, recibos e impressos). Dados fictícios (CPF e CNPJ de teste).
import assert from 'node:assert/strict';
import test from 'node:test';
import { sanearParametros } from '../docs/js/calculos.js';
import * as K from '../docs/js/contratos.js';
import * as M from '../docs/js/modelos-contrato.js';
import { montarRecibo, reciboDisponivel } from '../docs/js/recibos.js';
import * as R from '../docs/js/regras.js';

function base(extra = {}) {
  const d = R.bancoVazio();
  R.normalizar(d);
  R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true, endereco_sede: 'Rua A, 1',
    representante_nome: 'Maria', representante_genero: 'Feminino', representante_cargo: 'sócia administradora' }, 'j');
  const casa = R.inserir(d, 'imoveis', { nome: 'Casa 3', endereco: 'Rua X, 10', cidade: 'Curitiba', uf: 'PR' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: casa.id, inquilino_nome: 'Pedro Souza', inquilino_cpf: '529.982.247-25', inquilino_genero: 'Masculino',
    inquilino_estado_civil: 'Solteiro(a)', inquilino_profissao: 'engenheiro', inquilino_endereco: 'Rua Y', vigencia_inicio: '2026-09-05', vigencia_fim: '2029-03-05',
    data_entrada: '2026-09-05', prazo_meses: 30, aluguel_inicial: 350000, desconto_pontualidade_percentual: 10, dia_vencimento: 10, indice_correcao: 'IPCA',
    garantia_tipo: 'Caução', caucao_valor: 315000, caucao_meses: 1, finalidade: 'Residencial', descricao_objeto: 'a casa nº 3', ...extra }, 'j');
  return { d, c };
}
const texto = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : b.tipo === 'nova_pagina' ? '[nova página]' : b.linhas ? '[tabela]' : b.pessoas ? `[${b.pessoas.map((p) => `${p.papel} ${p.doc}${p.extra ? ` ${p.extra}` : ''}`).join(', ')}]` : '')).join('\n');
const contrato = (extra = {}, nome = 'Residencial') => {
  const { d, c } = base(extra);
  return texto(K.montarContrato(K.modelosDe(d).find((m) => m.nome === nome).texto, K.dadosDoContrato(d, c, { data: '2026-09-01' })));
};

test('vistoria de entrada: mesmo prazo do contrato (5 dias úteis da entrega das chaves); texto antigo de 3 dias vira o novo', () => {
  const { d, c } = base();
  const v = { tipo: 'Entrada', data: '2026-09-04', condicoes: '', itens: [] };
  assert.match(texto(K.vistoriaBlocos(d, c, v).blocos), /O LOCATÁRIO tem 5 \(cinco\) dias úteis, contados da entrega das chaves/);
  const antiga = texto(K.vistoriaBlocos(d, c, { ...v, texto_final: K.VISTORIA_FINAL_ANTIGA }).blocos);
  assert.doesNotMatch(antiga, /3 \(três\) dias/);
  assert.match(antiga, /5 \(cinco\) dias úteis/);
  // texto próprio continua como está
  assert.match(texto(K.vistoriaBlocos(d, c, { ...v, texto_final: 'Prazo combinado: 10 dias.' }).blocos), /Prazo combinado: 10 dias\./);
});

test('vistoria: cômodo do roteiro deixado em branco não sai como título solto', () => {
  const b = K.descritivoBlocos('## COZINHA\n- Piso:\n- Pia:\n## SALA\n- Piso: bom estado');
  assert.deepEqual(b.map((x) => x.runs.map((r) => r.t).join('')), ['SALA', '• Piso: bom estado']);
});

test('contrato sem fiador: "O LOCATÁRIO aceita"; com fiador: "e o FIADOR aceitam"; dois fiadores: procuradores no plural', () => {
  assert.match(contrato(), /O LOCATÁRIO aceita como válidas todas as comunicações/);
  const { d, c } = base({ garantia_tipo: 'Fiador', caucao_valor: null, caucao_meses: null });
  for (const nome of ['Ana Fiadora', 'Bia Fiadora']) R.inserir(d, 'fiadores', { contrato_id: c.id, nome, cpf: '529.982.247-25', genero: 'Feminino' }, 'j');
  const t = texto(K.montarContrato(K.modelosDe(d).find((m) => m.nome === 'Residencial').texto, K.dadosDoContrato(d, c, { data: '2026-09-01' })));
  assert.match(t, /O LOCATÁRIO e os FIADORES aceitam como válidas/);
  assert.match(t, /constitui os FIADORES seus procuradores,/);
  assert.match(t, /falência de qualquer dos fiadores, de sua exoneração/);
});

test('contrato: caução de 1 aluguel no singular; seguro incluso não diz que o inquilino paga o prêmio', () => {
  assert.match(contrato(), /equivalente a 1 \(um\) mês de aluguel\./);
  assert.match(contrato({ caucao_meses: 3, caucao_valor: 945000 }), /equivalente a 3 \(três\) meses de aluguel\./);
  const incluso = contrato({ conta_seguro: 'Incluso no aluguel' });
  assert.match(incluso, /seguro contra incêndio do imóvel é contratado pela LOCADORA e o seu custo já está incluído no valor do aluguel/);
  assert.doesNotMatch(incluso, /prêmios e despesas por sua exclusiva conta, cobrados juntamente com o aluguel/);
  assert.match(contrato({ conta_seguro: 'Por conta do inquilino' }), /prêmios e despesas por sua exclusiva conta, cobrados juntamente com o aluguel/);
});

test('contrato: "Parágrafo –" numera sozinho dentro da cláusula', () => {
  const dados = { campos: {}, condicoes: {}, quantidades: { locatarios: 1, locadoras: 1, fiadores: 0 }, assinaturas: [] };
  const t = texto(K.montarContrato('CLÁUSULA # – A.\n\n**Parágrafo** – x.\n\n**Parágrafo** – y.\n\nCLÁUSULA # – B.\n\n**Parágrafo** – z.', dados));
  assert.equal(t, 'CLÁUSULA 1ª – A.\nParágrafo primeiro – x.\nParágrafo segundo – y.\nCLÁUSULA 2ª – B.\nParágrafo único – z.');
  assert.doesNotMatch(contrato({ conta_condominio: 'Por conta do inquilino', conta_iptu: 'Por conta do inquilino' }), /Parágrafo –/);
});

test('modelo: {Campo} e {CAMPO} como nos e-mails; campo desconhecido é avisado', () => {
  const dados = { campos: { cidade: 'curitiba' }, condicoes: {}, quantidades: { locatarios: 1, locadoras: 1, fiadores: 0 }, assinaturas: [] };
  assert.equal(texto(K.montarContrato('{cidade} {Cidade} {CIDADE} {cidadee}', dados)), 'curitiba Curitiba CURITIBA [cidadee?]');
  assert.deepEqual(K.camposDesconhecidosDoModelo('{Locatarios} {ALUGUEL_CHEIO} {locatario} {data_troca}'), ['{locatario}']);
});

test('aditivos: "que tem por objeto o imóvel" (não "do imóvel o imóvel"); modelos gravados recebem as trocas uma vez', () => {
  for (const m of M.MODELOS_PADRAO.filter((x) => x.tipo)) assert.doesNotMatch(m.texto, /do imóvel \{objeto\}/);
  const antigo = 'Contrato de Locação {finalidade} do imóvel {objeto}, firmado em {data_contrato}. O LOCATÁRIO[se fiador] e {f:o FIADOR|os FIADORES}[fim] aceitam como válidas todas as comunicações. equivalente a {caucao_meses} meses de aluguel.';
  const novo = M.atualizarTextoModelo(antigo);
  assert.match(novo, /que tem por objeto \{objeto\}/);
  assert.match(novo, /aceitam\[senão\] aceita\[fim\] como válidas/);
  assert.match(novo, /\{caucao_meses_aluguel\} de aluguel/);
  assert.equal(M.atualizarTextoModelo(novo), novo);
});

test('inquilino empresa assina com o cargo; solidário com CNPJ é qualificado como empresa', () => {
  const { d, c } = base({ inquilino_tipo: 'Pessoa jurídica (empresa)', inquilino_nome: 'Padaria Teste Ltda', inquilino_cpf: '11.222.333/0001-81',
    representante_nome: 'Carla', representante_cargo: 'sócia administradora', solidario_nome: 'Mercado Teste Ltda', solidario_cpf: '11.222.333/0001-81', solidario_endereco: 'Rua Z, 5' });
  const dd = K.dadosDoContrato(d, c, { data: '2026-09-01' });
  assert.equal(dd.assinaturas.find((a) => a.papel === 'LOCATÁRIO').extra, 'CARLA – SÓCIA ADMINISTRADORA');
  assert.equal(dd.assinaturas.find((a) => a.papel === 'LOCATÁRIO SOLIDÁRIO').doc, 'CNPJ 11.222.333/0001-81');
  assert.match(dd.campos.solidario, /^MERCADO TESTE LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob nº 11\.222\.333\/0001-81/);
  assert.equal(K.rotuloDocumento('529.982.247-25'), 'CPF');
});

test('recibos: "Damos quitação"; reserva e caução do titular anterior não saem no novo titular', () => {
  const { d, c } = base({ reserva_valor: 50000, reserva_data: '2026-08-10', caucao_pago_em: '2026-09-01', comprovante_caucao: 'caucao.pdf' });
  assert.match(montarRecibo(d, 'reserva', { contrato: c }, '2026-09-01').depois[0], /^Damos quitação/);
  assert.match(montarRecibo(d, 'garantia', { contrato: c }, '2026-09-01').depois[0], /^Damos quitação/);
  const { id, ...resto } = c;
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Lúcia Nova', contrato_anterior_id: c.id, data_entrada: '2026-12-01', comprovante_caucao_contrato: c.id }, 'j');
  assert.match(reciboDisponivel(d, 'reserva', { contrato: novo }).motivo, /paga pelo titular anterior \(Pedro Souza\)/);
  assert.match(reciboDisponivel(d, 'garantia', { contrato: novo }).motivo, /quem pagou a garantia \(Pedro Souza\)/);
  assert.equal(reciboDisponivel(d, 'garantia', { contrato: c }).ok, true);
});

test('recibo da caução continua saindo depois da troca por fiador, enquanto não devolvida', () => {
  const { d, c } = base({ caucao_pago_em: '2026-09-01', comprovante_caucao: 'caucao.pdf' });
  R.trocarGarantia(d, c.id, { data: '2026-12-01', garantia_tipo: 'Fiador' }, 'j', { novos: [{ nome: 'Ana Fiadora', cpf: '529.982.247-25' }] });
  const atual = R.buscar(d, 'contratos', c.id);
  assert.equal(reciboDisponivel(d, 'garantia', { contrato: atual }).ok, true);
  const r = montarRecibo(d, 'garantia', { contrato: atual }, '2026-12-02');
  assert.equal(r.titulo, 'RECIBO DE CAUÇÃO EM DINHEIRO');
  assert.match(r.paragrafos[0], /R\$ 3\.150,00/);
});

test('link de volta da vistoria de saída passa no formato (tipo sem acento)', () => {
  const aqui = '#/vistoria/novo?contrato=3&tipo=Saida';
  assert.equal(sanearParametros({ voltar: decodeURIComponent(encodeURIComponent(aqui)) }).voltar, aqui);
});
