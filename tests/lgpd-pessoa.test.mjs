// Dados de uma pessoa pelo CPF e "Apagar tudo desta pessoa" 10 anos depois (decisão do dono, 17/11/2026). Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as P from '../docs/js/pessoa.js';
import * as R from '../docs/js/regras.js';

const CPF = '529.982.247-25'; const OUTRO = '111.444.777-35'; const FIADOR = '390.533.447-05';
function banco({ saida = '2016-03-31' } = {}) {
  const d = R.bancoVazio(); R.normalizar(d);
  const i = R.inserir(d, 'imoveis', { nome: 'Apto 1' }, 't');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Fulano de Teste', inquilino_cpf: CPF, inquilino_email: 'fulano@exemplo.com', data_entrada: '2014-04-01', data_saida: saida, fiador1_nome: 'Fiador Um', fiador1_cpf: FIADOR }, 't');
  const cb = R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2015-01', valor: 150000 }, 't');
  R.inserir(d, 'faturas', { numero: 7, origem_tipo: 'cobranca', origem_id: cb.id, tomador_nome: 'Fulano de Teste' }, 't');
  R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'Fiador Dois', cpf: OUTRO }, 't');
  const c2 = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Beltrano Teste', inquilino_cpf: OUTRO, data_entrada: '2016-05-01', solidario_nome: 'Fulano de Teste', solidario_cpf: CPF, solidario_telefone: '(41) 90000-0000' }, 't');
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Fulano de Teste', inquilino_cpf: CPF, situacao: 'Reprovada', decisao_data: '2013-02-01', fiadores: [{ nome: 'Fiador Três', cpf: OUTRO }] }, 't');
  R.inserir(d, 'envios_email', { ficha_id: f.id, para: 'fulano@exemplo.com', assunto: 'Ficha' }, 't');
  return { d, c, c2, f };
}

test('onde aparece e os dados da pessoa (exportar): contrato com o que é ligado, ficha, e o papel de solidário em outro contrato', () => {
  const { d, c, c2, f } = banco();
  const lugares = P.ondeAparece(d, '52998224725').map((x) => `${x.tabela}.${x.campo}`).sort();
  assert.deepEqual(lugares, ['contratos.inquilino_cpf', 'contratos.solidario_cpf', 'fichas.inquilino_cpf']);
  assert.deepEqual(P.ondeAparece(d, OUTRO).map((x) => `${x.tabela}.${x.campo}`).sort(), ['contratos.inquilino_cpf', 'fiadores.cpf', 'fichas.fiadores.0.cpf']);
  const x = P.dadosDaPessoa(d, CPF);
  assert.equal(x.nome, 'Fulano de Teste');
  assert.deepEqual(Object.keys(x.registros).sort(), ['cobrancas', 'contratos', 'envios_email', 'faturas', 'fiadores', 'fichas']);
  assert.deepEqual(x.registros.contratos.map((r) => r.id).sort(), [c.id, c2.id]);
  assert.ok(x.historico.length >= 6 && x.historico.every((h) => ['contratos', 'cobrancas', 'faturas', 'fiadores', 'fichas', 'envios_email'].includes(h.tabela)));
  assert.equal(x.registros.fichas[0].id, f.id);
  assert.deepEqual(P.dadosDaPessoa(d, '000').registros, {});
});

test('apagar só 10 anos depois do fim do último vínculo; contrato sem data de saída impede', () => {
  const { d } = banco();
  // Fulano: contrato até 31/03/2016, mas é solidário no contrato de Beltrano, que ainda vale
  let s = P.situacaoParaApagar(d, CPF, '2026-11-17');
  assert.equal(s.pode, false); assert.match(s.motivo, /Ainda vale/);
  d.contratos[1].data_saida = '2016-08-31';
  s = P.situacaoParaApagar(d, CPF, '2026-11-17');
  assert.equal(s.pode, true); assert.equal(s.libera_em, '2026-08-31');
  assert.equal(P.situacaoParaApagar(d, CPF, '2026-08-30').pode, false);
  assert.match(P.situacaoParaApagar(d, CPF, '2026-08-30').motivo, /a partir de 31\/08\/2026/);
  // exemplo do dono: contrato terminou em 31/03/2026 → libera em 31/03/2036
  const { d: d2 } = banco({ saida: '2026-03-31' }); d2.contratos[1].data_saida = '2016-08-31';
  assert.equal(P.situacaoParaApagar(d2, CPF, '2026-11-17').libera_em, '2036-03-31');
  assert.equal(P.situacaoParaApagar(d, '123', '2026-11-17').pode, false);
  // representante de uma empresa do cadastro: não apaga
  R.inserir(d, 'emitentes', { nome: 'Empresa', representante_cpf: CPF }, 't');
  assert.match(P.situacaoParaApagar(d, CPF, '2026-11-17').motivo, /empresa do cadastro/);
});

test('lista das pessoas que já podem ser apagadas', () => {
  const { d } = banco();
  d.contratos[1].data_saida = '2016-08-31';
  const lista = P.pessoasParaApagar(d, '2026-11-17');
  assert.deepEqual(lista.map((x) => x.nome), ['Fiador Um', 'Beltrano Teste', 'Fulano de Teste'], 'fiador do contrato (até 31/03/2016) antes; mesma data: ordem do nome');
  assert.deepEqual(P.pessoasParaApagar(d, '2026-01-01'), []);
});

test('apagar tudo desta pessoa: registros, ligados, campos dela nos outros e o histórico; fica uma linha sem nome nem CPF', () => {
  const { d, c, c2, f } = banco();
  d.contratos[1].data_saida = '2016-08-31';
  assert.throws(() => P.apagarPessoa(d, CPF, 'dono', '2026-01-01'), /só pode apagar a partir de/);
  const linhas = d.historico.length;
  const r = P.apagarPessoa(d, CPF, 'dono', '2026-11-17');
  // a nuvem manda só as linhas novas do fim do histórico (nuvem.js): as apagadas viram linhas vazias e entra uma no fim
  assert.equal(d.historico.length, linhas + 1);
  assert.ok(!d.contratos.some((x) => x.id === c.id), 'o contrato dela saiu');
  assert.ok(!d.fichas.some((x) => x.id === f.id), 'a ficha dela saiu');
  assert.equal(d.cobrancas.length, 0); assert.equal(d.faturas.length, 0); assert.equal(d.envios_email.length, 0);
  assert.equal(d.fiadores.length, 0, 'o fiador do contrato dela sai junto');
  const outro = d.contratos.find((x) => x.id === c2.id);
  assert.equal(outro.inquilino_nome, 'Beltrano Teste');
  assert.equal(outro.solidario_cpf, null); assert.equal(outro.solidario_nome, null); assert.equal(outro.solidario_telefone, null);
  const texto = JSON.stringify(d);
  for (const x of [CPF, 'Fulano de Teste', 'fulano@exemplo.com', '(41) 90000-0000']) assert.ok(!texto.includes(x), `${x} ainda está no banco`);
  const linha = d.historico.at(-1);
  assert.equal(linha.acao, P.ACAO_APAGAR);
  assert.deepEqual(linha.detalhes.contratos, [c.id]);
  assert.ok(r.saem.some((x) => x.tabela === 'faturas'));
  assert.equal(r.contratos[0].inquilino_nome, 'Fulano de Teste', 'a tela recebe o contrato de antes para apagar a pasta');
});

test('fiador dentro da ficha de outra pessoa: sai da lista', () => {
  const { d } = banco();
  // OUTRO = Beltrano (inquilino do 2º contrato, fiador no 1º e na ficha de Fulano)
  d.contratos.forEach((x) => { x.data_saida ||= '2016-08-31'; });
  P.apagarPessoa(d, OUTRO, 'dono', '2026-11-17');
  assert.deepEqual(d.fichas[0].fiadores, []);
  assert.ok(!JSON.stringify(d).includes(OUTRO));
  assert.ok(d.contratos.some((x) => x.inquilino_cpf === CPF), 'o contrato de Fulano fica');
});

test('registro que é dela e também ligado ao contrato dela conta uma vez só', () => {
  const { d, c } = banco();
  R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'Fulano de Teste', cpf: CPF }, 't');
  const p = P.partesDaPessoa(d, CPF);
  const chaves = [...p.proprios, ...p.ligados].map((x) => `${x.tabela}:${x.id}`);
  assert.equal(new Set(chaves).size, chaves.length);
});

test('comunicados: o aceite dela entra no ZIP e sai no "Apagar tudo"; o dos outros fica (mutirão 19/11, comunicacoes-011)', () => {
  const { d, c, c2 } = banco();
  d.contratos[1].data_saida = '2016-08-31';
  const resposta = { em: '2016-01-10T10:00:00Z', email: 'fulano@exemplo.com', ip: '200.1.2.3', assinatura: 'Fulano de Teste' };
  const com = R.inserir(d, 'comunicados', { titulo: 'Contatos', destinos: [
    { chave: `c${c.id}`, tipo: 'inquilino', contrato_id: c.id, fiador_id: null, nome: 'Fulano de Teste' },
    { chave: `c${c2.id}`, tipo: 'inquilino', contrato_id: c2.id, fiador_id: null, nome: 'Beltrano Teste' }] }, 't');
  R.atualizar(d, 'comunicados', com.id, { destinos: com.destinos.map((x, i) => (i === 0 ? { ...x, resposta } : x)) }, 't', 'respostas');
  const x = P.dadosDaPessoa(d, CPF);
  assert.equal(x.registros.comunicados.length, 1);
  assert.deepEqual(x.registros.comunicados[0].destinos.map((y) => y.nome), ['Fulano de Teste']);
  assert.equal(x.registros.comunicados[0].destinos[0].resposta.ip, '200.1.2.3');
  const hist = x.historico.filter((h) => h.tabela === 'comunicados');
  assert.equal(hist.length, 2);
  assert.ok(!JSON.stringify(hist).includes('Beltrano'), 'no ZIP não vai o item dos outros');
  P.apagarPessoa(d, CPF, 'dono', '2026-11-17');
  assert.deepEqual(R.buscar(d, 'comunicados', com.id).destinos.map((y) => y.nome), ['Beltrano Teste']);
  const texto = JSON.stringify(d);
  for (const v of ['Fulano de Teste', 'fulano@exemplo.com', '200.1.2.3']) assert.ok(!texto.includes(v), `${v} ainda está no banco`);
});

test('troca de titular: enquanto o contrato que continua o dela vale, não apaga; os 10 anos contam do fim do último (admin-007)', () => {
  const { d, c } = banco();
  d.contratos[1].data_saida = '2016-08-31';
  const novo = R.inserir(d, 'contratos', { imovel_id: c.imovel_id, inquilino_nome: 'Sucessor Teste', inquilino_cpf: '', data_entrada: '2016-04-01', contrato_anterior_id: c.id }, 't');
  let s = P.situacaoParaApagar(d, CPF, '2026-11-17');
  assert.equal(s.pode, false); assert.match(s.motivo, /Sucessor Teste.*troca de titular/);
  assert.ok(!P.pessoasParaApagar(d, '2026-11-17').some((x) => x.nome === 'Fulano de Teste'));
  novo.data_saida = '2020-05-31';
  s = P.situacaoParaApagar(d, CPF, '2026-11-17');
  assert.equal(s.pode, false); assert.match(s.motivo, /31\/05\/2030/);
  assert.equal(P.situacaoParaApagar(d, CPF, '2030-05-31').pode, true);
});

test('lista de 10 anos inclui quem só foi solidário (admin-018)', () => {
  const { d } = banco();
  const SOLID = '714.602.380-01';
  d.contratos[0].solidario_nome = 'Só Solidário'; d.contratos[0].solidario_cpf = SOLID;
  d.contratos[1].data_saida = '2016-08-31';
  assert.ok(P.pessoasParaApagar(d, '2026-11-17').some((x) => x.cpf === SOLID));
});
