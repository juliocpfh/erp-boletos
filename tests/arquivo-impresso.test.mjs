import assert from 'node:assert/strict';
import test from 'node:test';
import * as AI from '../docs/js/arquivo-impresso.js';
import * as CR from '../docs/js/config-regras.js';
import * as R from '../docs/js/regras.js';

// Arquivo impresso (pasta física do inquilino), decisões do dono de 2026-11-15 (documentacao/PROPOSTA_ARQUIVO_IMPRESSO.md).
function base(entrada = '2026-06-07') {
  const d = R.bancoVazio();
  CR.usarRegras(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto 2', endereco: 'Rua das Flores, 100', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Ana Souza', inquilino_cpf: '529.982.247-25', garantia_tipo: 'Caução', caucao_valor: 600000, caucao_data: entrada,
    data_entrada: entrada, vigencia_inicio: entrada, aluguel_inicial: 200000, dia_vencimento: 10, reserva_valor: 50000, reserva_data: '2026-05-25',
    conta_agua: 'Incluso no aluguel', conta_energia: 'Incluso no aluguel', conta_gas: 'Não tem', conta_condominio: 'Não tem', conta_seguro: 'Não tem' }, 'julio');
  return { d, c };
}
const vagas = (l) => l.map((i) => i.vaga);
const marcar = (itens, situacao = 'impresso') => itens.map((i) => ({ ...i, situacao: i.marcado ? situacao : 'fora' }));

test('o que vai para a pasta: contrato, termos, aditivos, cartas, documentos da pessoa e recibos; nunca renda, comprovantes, NF, fotos ou seguro', () => {
  const { d, c } = base();
  R.marcarDocumento(d, c.id, 'doc_contrato_em', '2026-06-05', 'julio', 'contrato-assinado.pdf');
  R.marcarDocumento(d, c.id, 'doc_vistoria_em', '2026-06-07', 'julio', 'vistoria-assinada.pdf');
  R.marcarDocumento(d, c.id, 'doc_chaves_em', '2026-06-07', 'julio', 'chaves-assinado.pdf');
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-06-08', valor: 600000, arquivo: 'comprovante-caucao-2026-06-08.pdf' }, 'julio');
  R.inserir(d, 'aditivos', { contrato_id: c.id, imovel_id: c.imovel_id, numero: 2, data: '2027-02-10', assunto: 'troca do vencimento', arquivo: 'aditivo-2.pdf' }, 'julio');
  R.inserir(d, 'cartas_reajuste', { contrato_id: c.id, competencia: '2027-06', enviada_em: '2027-05-05' }, 'julio');
  R.inserir(d, 'seguros', { imovel_id: c.imovel_id, contrato_id: c.id, seguradora: 'Seg', vigencia_inicio: '2026-06-07', vigencia_fim: '2027-06-07', arquivo_apolice: 'apolice.pdf' }, 'julio');
  const soltos = ['link-documento-com-foto-e-cpf-rg-ou-cnh-2026-05-20-ab12cd.pdf', 'link-comprovante-de-residencia-atual-2026-05-20-ab12cd.pdf',
    'link-3-ultimos-holerites-2026-05-20-ab12cd.pdf', 'link-autonomo-declaracao-do-imposto-de-renda-2026.pdf', 'analise-serasa.pdf',
    'comprovante-caucao-2026-06-08.pdf', 'boleto-2026-07.pdf', 'NF 0077.pdf', 'planta-apto2.pdf'];
  const itens = AI.itensDaPasta(d, c, soltos);
  assert.deepEqual(vagas(itens), ['doc:doc_contrato_em', 'doc:doc_vistoria_em', 'doc:doc_chaves_em', 'aditivo:' + d.aditivos[0].id, 'carta:2027-06',
    'solto:link-comprovante-de-residencia-atual-2026-05-20-ab12cd.pdf', 'solto:link-documento-com-foto-e-cpf-rg-ou-cnh-2026-05-20-ab12cd.pdf',
    'recibo:reserva', 'recibo:garantia', 'solto:planta-apto2.pdf']);
  assert.equal(itens[0].rotulo, 'Contrato de locação assinado');
  assert.equal(itens[1].rotulo, 'Vistoria de entrada assinada');
  assert.equal(itens.find((i) => i.vaga === 'carta:2027-06').tipo, 'carta', 'carta sem arquivo: o sistema monta');
  assert.equal(itens.find((i) => i.vaga === 'solto:planta-apto2.pdf').marcado, false, 'arquivo que o sistema não conhece vem desmarcado');
  assert.ok(itens.filter((i) => i.vaga !== 'solto:planta-apto2.pdf').every((i) => i.marcado));
  // sem a lista da pasta (Painel), os arquivos soltos ficam de fora
  assert.ok(!AI.itensDaPasta(d, c).some((i) => i.solto));
  assert.equal(AI.classificarSolto('RG Ana.jpg'), 'pessoa');
  assert.equal(AI.classificarSolto('link-assinada-2026-05-20-ab12cd.pdf'), 'pessoa', 'ficha assinada pela internet');
  assert.equal(AI.classificarSolto('notificacao-atraso-2027-03-05.pdf'), 'outros');
});

test('primeira rodada: inquilino antigo fica "a montar"; documento novo e arquivo trocado depois de montada; um alerta só', () => {
  const { d, c } = base('2026-01-07');
  const hoje = '2027-03-01';
  R.marcarDocumento(d, c.id, 'doc_contrato_em', '2026-01-05', 'julio', 'contrato-assinado.pdf');
  let s = AI.situacaoPasta(d, c, hoje);
  assert.equal(s.momento, 'inicio');
  assert.equal(s.precisa, true);
  assert.match(AI.alertaPastas(d, hoje).texto, /^1 inquilino\(s\) com a pasta física a montar\.$/);
  assert.equal(AI.alertaPastas(d, hoje).link, '#/arquivo-impresso');
  assert.ok(R.todosAlertas(d, hoje).some((a) => a.tipo === 'Pasta física'));
  AI.registrarPasta(d, c.id, { momento: 'inicio', itens: marcar(s.itens, 'ja_tinha'), data: '2027-03-01' }, 'julio');
  s = AI.situacaoPasta(d, c, hoje);
  assert.equal(s.precisa, false);
  assert.match(AI.textoSituacao(s), /em dia \(montada em 01\/03\/2027\)/);
  assert.equal(AI.alertaPastas(d, hoje), null);
  // termo aditivo novo: aviso de documento novo
  const a = R.inserir(d, 'aditivos', { contrato_id: c.id, imovel_id: c.imovel_id, numero: 2, data: '2027-03-10', assunto: 'troca do vencimento', arquivo: 'aditivo-2.pdf' }, 'julio');
  s = AI.situacaoPasta(d, c, '2027-03-11');
  assert.equal(s.momento, 'durante');
  assert.deepEqual(vagas(s.novos), [`aditivo:${a.id}`]);
  assert.match(AI.alertaPastas(d, '2027-03-11').texto, /1 com documento novo para imprimir/);
  AI.registrarPasta(d, c.id, { momento: 'durante', itens: marcar(s.novos), data: '2027-03-11' }, 'julio');
  assert.equal(AI.situacaoPasta(d, c, '2027-03-11').precisa, false);
  // "não vai": some de vez
  const carta = R.inserir(d, 'cartas_reajuste', { contrato_id: c.id, competencia: '2027-01', enviada_em: '2026-12-05' }, 'julio');
  assert.equal(AI.situacaoPasta(d, c, '2027-03-11').novos.length, 1);
  AI.registrarPasta(d, c.id, { momento: 'durante', itens: AI.situacaoPasta(d, c, '2027-03-11').novos.map((i) => ({ ...i, situacao: 'fora' })), data: '2027-03-12' }, 'julio');
  assert.equal(AI.situacaoPasta(d, c, '2027-03-12').precisa, false, `carta ${carta.id} fora da pasta`);
  // contrato assinado trocado por outro arquivo depois de impresso: aviso para reimprimir
  R.atualizar(d, 'contratos', c.id, { doc_contrato_arquivo: 'contrato-assinado (2).pdf' }, 'julio');
  s = AI.situacaoPasta(d, c, '2027-03-12');
  assert.deepEqual(vagas(s.trocados), ['doc:doc_contrato_em']);
  assert.match(AI.alertaPastas(d, '2027-03-12').texto, /1 com arquivo trocado/);
  assert.equal(d.pastas_fisicas.length, 3);
  assert.ok(d.historico.some((h) => /Ana Souza: pasta física \(o que já existia\)/.test(h.descricao || h.texto || JSON.stringify(h))));
});

test('entrada recente: a etapa "Montar a pasta física" espera as outras e fica feita ao montar', () => {
  const { d, c } = base('2027-02-01');
  const hoje = '2027-02-20';
  const etapa = () => R.rotinaEntrada(d, c, hoje).find((e) => e.chave === 'pasta_fisica');
  assert.equal(etapa().situacao, 'andamento');
  assert.equal(AI.situacaoPasta(d, c, hoje).aguardando, true);
  assert.equal(AI.alertaPastas(d, hoje), null, 'aguardando: sem alerta');
  assert.throws(() => R.marcarEtapaEntrada(d, c.id, 'pasta_fisica', { data: hoje }, 'julio'), /Etapa desconhecida/, 'não se marca à mão');
  AI.registrarPasta(d, c.id, { momento: 'entrada', itens: [{ vaga: 'recibo:reserva', rotulo: 'Recibo da reserva', situacao: 'impresso' }], data: hoje }, 'julio');
  assert.equal(etapa().situacao, 'feita');
  assert.equal(etapa().data, hoje);
});

test('troca de titular: conferir a pasta do anterior, pô-la dentro da nova e imprimir o que falta', () => {
  const { d, c } = base('2026-01-07');
  R.marcarDocumento(d, c.id, 'doc_contrato_em', '2026-01-05', 'julio', 'contrato-assinado.pdf');
  R.inserir(d, 'aditivos', { contrato_id: c.id, imovel_id: c.imovel_id, numero: 1, data: '2026-05-10', assunto: 'troca do vencimento', arquivo: 'aditivo-1.pdf' }, 'julio');
  const { id, ...resto } = c;
  const novo = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Lúcia Lima', contrato_anterior_id: c.id, data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01',
    doc_contrato_em: null, doc_contrato_arquivo: null, reserva_valor: 0 }, 'julio');
  R.inserir(d, 'aditivos', { contrato_id: novo.id, imovel_id: novo.imovel_id, tipo: 'Troca de titular', numero: 2, data: '2026-11-25', assunto: 'Troca de titular', texto: 'termo', arquivo: 'termo-troca.pdf' }, 'julio');
  R.transferirHeranca(d, novo.id, 'julio', '2026-12-01');
  const hoje = '2027-07-01';
  assert.ok(!AI.contratosDaRotina(d, hoje).includes(c), 'o anterior não aparece sozinho na lista');
  const s = AI.situacaoPasta(d, novo, hoje);
  assert.equal(s.momento, 'heranca');
  assert.equal(s.anterior.id, c.id);
  assert.match(AI.textoSituacao(s), /conferir a pasta de Ana Souza/);
  assert.ok(!vagas(s.itens).includes('doc:doc_contrato_em'), 'o contrato herdado fica na pasta do anterior');
  const falta = AI.faltaDoAnterior(d, c);
  assert.deepEqual(vagas(falta), ['doc:doc_contrato_em', `aditivo:${d.aditivos[0].id}`, 'recibo:reserva']);
  AI.registrarPasta(d, novo.id, { momento: 'heranca', itens: marcar(s.itens), anterior: { contrato_id: c.id, itens: marcar(falta), guardada: true }, data: hoje }, 'julio');
  assert.equal(AI.herancaPendente(d, novo, hoje), null);
  assert.equal(AI.faltaDoAnterior(d, c).length, 0, 'o que faltava do anterior ficou impresso');
  assert.deepEqual(AI.montagensDe(d, novo.id)[0].pasta_anterior, { contrato_id: c.id, guardada_em: hoje });
  assert.equal(AI.situacaoPasta(d, novo, hoje).precisa, false);
});

test('regra desligada: sem etapa, sem alerta e a saída volta à etapa simples', () => {
  const { d, c } = base('2026-01-07');
  R.mudarRegraSistema(d, 'arquivo_impresso', false, 'admin');
  assert.equal(AI.ligado(), false);
  assert.equal(AI.alertaPastas(d, '2027-03-01'), null);
  assert.ok(!R.rotinaEntrada(d, c, '2027-03-01').some((e) => e.chave === 'pasta_fisica'));
  R.informarSaida(d, c.id, '2027-02-28', 'julio', '2027-02-01');
  assert.equal(R.roteiroSaida(d, c, '2027-03-01').find((x) => x.chave === 'arquivo').titulo, 'Arquivo físico: imprimir o processo e guardar em papel');
  CR.usarRegras(null);
});

test('saída: a pasta espera a devolução da garantia', () => {
  const { d, c } = base('2026-01-07');
  R.informarSaida(d, c.id, '2027-02-28', 'julio', '2027-02-01');
  const s = AI.situacaoPasta(d, c, '2027-03-01');
  assert.equal(s.momento, 'saida');
  assert.equal(s.aguardando, true);
  assert.match(AI.textoSituacao(s), /aguardando a devolução da garantia/);
  assert.equal(AI.guardarAte(c), '2037-02-28');
  assert.ok(AI.contratosDaRotina(d, '2027-03-01').includes(c), 'saiu, mas a pasta ainda não fechou');
  AI.registrarPasta(d, c.id, { momento: 'saida', itens: [{ vaga: 'recibo:reserva', situacao: 'impresso' }], data: '2027-03-20' }, 'julio');
  assert.ok(!AI.contratosDaRotina(d, '2027-03-21').includes(c));
  assert.equal(R.roteiroSaida(d, c, '2027-03-21').find((x) => x.chave === 'arquivo').feito, true);
});
