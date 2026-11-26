// Mutirão de 19–20/11 (documentacao/arquivo/mutirao-19-11/lote-C.md): prazo do contrato não residencial, regra de número inteiro e
// login da internet vencido na faixa do topo. Dados fictícios.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import * as CR from '../docs/js/config-regras.js';
import * as N from '../docs/js/nuvem.js';
import * as R from '../docs/js/regras.js';
import * as K from '../nuvem/cofre.mjs';
import { r2Falso } from './r2-falso.mjs';

test('fios-004 / admin-004: o prazo do Novo contrato segue a regra da finalidade', () => {
  const d = R.normalizar(R.bancoVazio());
  CR.usarRegras(d);
  try {
    assert.equal(R.padroesNovoContrato().prazo_meses, 30, 'residencial: regra de 30 meses');
    assert.equal(R.prazoPadraoNovoContrato('Residencial'), 30);
    assert.equal(R.prazoPadraoNovoContrato('Não residencial'), null, 'não residencial em branco: digitar em cada contrato');
    R.salvarRegrasSistema(d, { ...CR.escolhasDe(d), prazo_comercial_padrao: 60 }, 'admin');
    CR.usarRegras(d);
    assert.equal(R.prazoPadraoNovoContrato('Não residencial'), 60, 'regra do não residencial em 60 meses');
    assert.equal(R.prazoPadraoNovoContrato('Residencial'), 30, 'o residencial continua com a regra dele');
  } finally { CR.usarRegras(null); }
});

test('admin-015: regra de número inteiro recusa "2,5" e "1.5" em vez de arredondar', () => {
  assert.throws(() => CR.limparValorRegra('prazo_residencial_padrao', 2.5), /número inteiro/);
  assert.equal(CR.limparValorRegra('prazo_residencial_padrao', 36), 36);
  assert.equal(CR.limparValorRegra('multa_padrao', 2.5), 2.5, 'porcentagem continua aceitando vírgula');
});

// ---------------------------------------------------------------------------------------------------------------------
function novoCofreDO() {
  const db = new DatabaseSync(':memory:');
  const sql = { exec(q, ...p) { if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; } const l = db.prepare(q).all(...p).map((x) => ({ ...x })); return { toArray: () => l }; } };
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  return new K.CofreDO({ storage: { sql, transactionSync: tx } }, { DADOS: r2Falso() });
}
const DONO = 'dono@exemplo.com.br';
function apiPara(cofre, estado) {
  return async (metodo, rota, corpo) => {
    if (estado.vencido) throw new N.ErroNuvem('Seu acesso pela internet venceu. Recarregue a página para entrar de novo (código no e-mail).', 401);
    const r = await cofre.fetch(new Request(`https://cofre/${rota}`, { method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: { 'X-Email-Conferido': DONO } }));
    const dados = await r.json();
    if (!r.ok) throw new N.ErroNuvem(dados.erro, r.status, dados);
    return dados;
  };
}
const guardarMemoria = (m = new Map()) => ({ m, ler: async (k) => structuredClone(m.get(k)), gravar: async (k, v) => { m.set(k, structuredClone(v)); }, apagar: async (k) => { m.delete(k); } });
const TABELAS = Object.entries(R.bancoVazio()).filter(([k, v]) => Array.isArray(v) && k !== 'historico').map(([k]) => k);

test('nuvem-008: login da internet vencido fica marcado (a faixa avisa) e a mudança continua guardada até entrar de novo', async () => {
  const d = R.bancoVazio();
  R.inserir(d, 'usuarios', { login: DONO, nome: 'Dono', papel: 'admin', ativo: true }, 'teste');
  const estado = { vencido: false };
  const s = new N.Sincronia({ api: apiPara(novoCofreDO(), estado), guardar: guardarMemoria(), normalizar: R.normalizar, agrupar: 1, tabelas: TABELAS });
  await s.iniciar(); await s.importar(d); await s.sincronizar();
  assert.equal(s.acessoVencido, false);
  estado.vencido = true;
  await s.alterar((db) => { R.inserir(db, 'imoveis', { nome: 'Apto 604' }, DONO); });
  await s.sincronizar();
  assert.equal(s.acessoVencido, true, 'a faixa mostra "acesso venceu", não "esperando internet"');
  assert.ok(s.pendentesQtd() > 0, 'a mudança fica guardada no aparelho');
  estado.vencido = false;
  await s.sincronizar();
  assert.equal(s.acessoVencido, false);
  assert.equal(s.pendentesQtd(), 0, 'sobe depois de entrar de novo');
});
