// Mutirão 3000, 2ª rodada (17/11/2026), frente "banco de dados e sincronia": o que ficou de fora na 1ª rodada (lista dados.md).
// Dados fictícios.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as F from '../docs/js/formularios.js';
import * as R from '../docs/js/regras.js';
import { Cofre } from '../nuvem/cofre.mjs';

test('item 15: formulário aberto não volta o campo que outra pessoa mudou (só o que esta pessoa mexeu é gravado)', () => {
  const campos = [
    { nome: 'nome', rotulo: 'Nome', tipo: 'texto' },
    { nome: 'telefone', rotulo: 'Telefone', tipo: 'texto' },
    { nome: 'aluguel', rotulo: 'Aluguel', tipo: 'dinheiro' },
    { nome: 'ativo', rotulo: 'Ativo', tipo: 'simnao' },
  ];
  const aoAbrir = { id: 1, nome: 'Apto', telefone: '', aluguel: 200000, ativo: true };
  const valoresAoAbrir = F.paraFormulario(campos, aoAbrir);
  // enquanto o formulário estava aberto, outra pessoa mudou o telefone e o aluguel
  const agora = { ...aoAbrir, telefone: '(41) 99999-8888', aluguel: 210000 };
  // quem salva só mexeu no nome (o formulário dele ainda mostra o telefone vazio e o aluguel antigo)
  const dados = F.lerValores(campos, { ...valoresAoAbrir, nome: 'Apto 101' });
  const mantidos = F.manterMudancasDeOutros(campos, dados, valoresAoAbrir, F.paraFormulario(campos, agora));
  assert.deepEqual(mantidos, ['Telefone', 'Aluguel']);
  assert.deepEqual(dados, { nome: 'Apto 101', telefone: '(41) 99999-8888', aluguel: 210000, ativo: true });
});

test('item 15: o campo que as duas pessoas mudaram fica com o de quem salva por último (como antes)', () => {
  const campos = [{ nome: 'nome', rotulo: 'Nome', tipo: 'texto' }];
  const valoresAoAbrir = F.paraFormulario(campos, { nome: 'Apto' });
  const dados = F.lerValores(campos, { nome: 'Apto do dono' });
  const mantidos = F.manterMudancasDeOutros(campos, dados, valoresAoAbrir, F.paraFormulario(campos, { nome: 'Apto 101' }));
  assert.deepEqual(mantidos, []);
  assert.equal(dados.nome, 'Apto do dono');
  // sem nada guardado da abertura (formulário novo): nada muda
  assert.deepEqual(F.manterMudancasDeOutros(campos, dados, null, {}), []);
});

test('item 37: normalizar só preenche a caução vazia, respeita o zero e não depende da regra caucao_base', () => {
  const d = R.bancoVazio();
  d.config_regras = [{ chave: 'caucao_base', valor: 'cheio' }];
  const contrato = (id, caucao) => ({ id, garantia_tipo: 'Caução', caucao_meses: 3, aluguel_inicial: 60000, desconto_pontualidade_percentual: 10, data_entrada: '2026-01-10', ...caucao });
  d.contratos = [contrato(1, { caucao_valor: 0 }), contrato(2, { caucao_valor: null }), contrato(3, {})];
  R.normalizar(d);
  assert.equal(d.contratos[0].caucao_valor, 0, 'zero gravado de propósito fica');
  assert.equal(d.contratos[1].caucao_valor, 162000, '3 × R$ 540,00 (aluguel de R$ 600,00 com 10% de bonificação), mesmo com a regra "cheio"');
  assert.equal(d.contratos[2].caucao_valor, 162000);
  // a tela de cadastro continua seguindo a regra (contrato novo sem valor digitado)
  assert.equal(R.completarCaucao(contrato(4, { caucao_valor: null })).caucao_valor, 180000, 'regra "cheio": 3 × R$ 600,00');
});

test('item 39: o Desfazer volta a gravação inteira e a prévia mostra os campos e os boletos recalculados', () => {
  const d = R.bancoVazio();
  const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto 1', cidade: 'Curitiba' }, 'julio');
  const a = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ana Anterior', data_entrada: '2026-01-01', aluguel_inicial: 200000, dia_vencimento: 10, ativo: true }, 'julio');
  const n = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Bia Nova', data_entrada: '2026-06-01', aluguel_inicial: 200000, dia_vencimento: 10, ativo: true, contrato_anterior_id: a.id }, 'julio');
  const s = R.inserir(d, 'seguros', { contrato_id: a.id, seguradora: 'Seguradora Exemplo', vigencia_inicio: '2026-01-01', vigencia_fim: '2026-12-31' }, 'julio');
  // o seguro passou ao novo titular: contrato e "herdado de" mudam juntos, numa gravação só
  R.atualizar(d, 'seguros', s.id, { contrato_id: n.id, herdado_de: a.id }, 'julio', 'Seguro passa para Bia');
  const linha = d.historico.length - 1;
  assert.deepEqual(R.gravacaoDesfazivel(d, linha), [`${linha}:contrato_id`, `${linha}:herdado_de`]);
  // pedir só o contrato leva o "herdado de" junto: o seguro nunca volta para a Ana marcado como herdado dela mesma
  R.desfazerAlteracoes(d, [`${linha}:contrato_id`], 'admin');
  assert.equal(R.buscar(d, 'seguros', s.id).contrato_id, a.id);
  assert.equal(R.buscar(d, 'seguros', s.id).herdado_de, null);

  // aluguel de R$ 2.000,00 para R$ 2.100,00 e boleto em aberto recalculado; a prévia do Desfazer mostra a volta
  R.gerarCobrancas(d, '2026-03', 'julio');
  R.atualizar(d, 'contratos', a.id, { aluguel_inicial: 210000 }, 'julio', 'Aluguel corrigido');
  R.recalcularCobrancas(d, (cb) => cb.contrato_id === a.id, 'julio');
  const alt = d.historico.findLastIndex((h) => h.descricao === 'Aluguel corrigido');
  const aplicar = (db, itens) => {
    for (const { tabela, id } of R.desfazerAlteracoes(db, itens, 'admin')) if (tabela === 'contratos') R.recalcularCobrancas(db, (cb) => cb.contrato_id === id, 'admin');
  };
  const antes = structuredClone(d);
  const p = R.previaDoDesfazer(d, R.gravacaoDesfazivel(d, alt), aplicar, { valorTexto: (k, v) => (k === 'aluguel_inicial' ? `R$ ${(v / 100).toFixed(2)}` : String(v)) });
  assert.deepEqual(d, antes, 'a prévia não muda nada');
  assert.deepEqual(p.campos, ['Inquilino / contrato de Ana Anterior · aluguel_inicial: R$ 2100.00 → R$ 2000.00']);
  assert.deepEqual(p.boletos, ['Boleto 03/2026 de Ana Anterior: R$ 2.100,00 → R$ 2.000,00']);
});

// --- cofre de verdade (SQLite do Node) ----------------------------------------------------------------------------------
function sqlFalso() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    exec(q, ...p) {
      if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; }
      const l = db.prepare(q).all(...p).map((x) => ({ ...x }));
      return { toArray: () => l };
    },
  };
}
const transacaoDe = (sql) => (fn) => { sql.db.exec('BEGIN'); try { const r = fn(); sql.db.exec('COMMIT'); return r; } catch (e) { sql.db.exec('ROLLBACK'); throw e; } };
const DONO = 'dono@exemplo.com.br'; const SOCIA = 'socia@exemplo.com.br';
function cofreComImovel() {
  const sql = sqlFalso();
  const c = new Cofre(sql, transacaoDe(sql), () => new Date('2026-11-17T10:00:00-03:00'));
  c.importar({ formato: 'imoveis-v1', revisao: 1, listas: { tipos: ['Condomínio'] },
    usuarios: [{ id: 1, login: DONO, papel: 'admin', ativo: true }, { id: 2, login: 'socia', email: SOCIA, papel: 'admin', ativo: true }],
    imoveis: [{ id: 1, nome: 'Apto' }], historico: [] }, DONO);
  return c;
}
let n = 0;
const lote = (ops) => ({ id: `ap-r2-${String(n += 1).padStart(4, '0')}`, ops });
const imovel = (c) => c.tudo().imoveis[0];

test('item 14: no conflito fica o valor já gravado na nuvem e o outro vira proposta (não volta ao de antes)', () => {
  const c = cofreComImovel();
  c.aplicar(lote([{ op: 'alterar', tabela: 'imoveis', id: 1, campos: { nome: { antes: 'Apto', depois: 'Apto do dono' } } }]), DONO);
  const r = c.aplicar(lote([{ op: 'alterar', tabela: 'imoveis', id: 1, campos: { nome: { antes: 'Apto', depois: 'Apto 101' } } }]), SOCIA);
  assert.equal(r.conflitos.length, 1);
  assert.equal(imovel(c).nome, 'Apto do dono', 'todos continuam vendo o nome que o dono gravou');
  const [cf] = c.conflitosAbertos();
  assert.deepEqual([cf.atual, cf.proposto], ['Apto do dono', 'Apto 101']);
  c.resolver({ conflito: cf.id, escolha: 'proposto' }, DONO);
  assert.equal(imovel(c).nome, 'Apto 101');
  // fora das tabelas (raiz): o mesmo
  c.aplicar(lote([{ op: 'raiz', campo: 'listas', antes: { tipos: ['Condomínio'] }, depois: { tipos: ['Luz'] } }]), DONO);
  c.aplicar(lote([{ op: 'raiz', campo: 'listas', antes: { tipos: ['Condomínio'] }, depois: { tipos: ['Água'] } }]), SOCIA);
  assert.deepEqual(c.tudo().listas, { tipos: ['Luz'] });
});

test('item 35: escolher o valor de um campo que não existia faz o campo sumir (não fica null)', () => {
  const c = cofreComImovel();
  c.aplicar(lote([{ op: 'alterar', tabela: 'imoveis', id: 1, campos: { obs: { depois: 'Chave na portaria' } } }]), DONO);
  // a sócia apagou a observação que ela via (outra) sem saber da do dono: a proposta é "sem o campo"
  c.aplicar(lote([{ op: 'alterar', tabela: 'imoveis', id: 1, campos: { obs: { antes: 'Outra' } } }]), SOCIA);
  const [cf] = c.conflitosAbertos();
  assert.equal(cf.proposto, null);
  c.resolver({ conflito: cf.id, escolha: 'proposto' }, DONO);
  assert.ok(!('obs' in imovel(c)), 'o campo sumiu');
  // o campo não existia do lado da nuvem: escolher "atual" também o deixa sem o campo
  c.aplicar(lote([{ op: 'alterar', tabela: 'imoveis', id: 1, campos: { apelido: { antes: 'X', depois: 'Y' } } }]), SOCIA);
  const [cf2] = c.conflitosAbertos();
  assert.equal(cf2.atual, null);
  c.resolver({ conflito: cf2.id, escolha: 'atual' }, DONO);
  assert.ok(!('apelido' in imovel(c)));
});
