// Cópia local cifrada (docs/js/cofrinho.js): chave aberta só com a senha, nada legível no aparelho sem ela, lista de
// usuários aberta para o login, outro usuário não apaga mudanças não enviadas. Iterações baixas só para o teste ser rápido.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as K from '../docs/js/cofrinho.js';

const IT = 1000;
const cruFalso = () => { const m = new Map(); return { m, ler: async (k) => m.get(k), gravar: async (k, v) => { m.set(k, v); }, apagar: async (k) => { m.delete(k); } }; };
const legivel = (cru) => JSON.stringify([...cru.m.entries()].filter(([k]) => !['acesso', 'chave-sessao', 'embrulhos'].includes(k)), (k, v) => (v instanceof Uint8Array ? `[${v.length} bytes]` : v));
const banco = { formato: 'imoveis-v1', usuarios: [{ id: 1, login: 'dono', nome: 'Dono', papel: 'admin', ativo: true, senha_hash: 'h' }], contratos: [{ id: 1, inquilino_nome: 'Maria Exemplo', cpf: '529.982.247-25' }] };

test('chave embrulhada: abre com a senha certa, não abre com a errada', async () => {
  const chave = await K.novaChave();
  const emb = await K.embrulhar(chave, 'frase certa de teste', IT);
  assert.ok(await K.desembrulhar(emb, 'frase certa de teste'));
  assert.equal(await K.desembrulhar(emb, 'frase errada'), null);
  const c = await K.cifrar(chave, { a: 1 });
  assert.deepEqual(await K.decifrar(chave, c), { a: 1 });
  const b = await K.decifrar(chave, await K.cifrar(chave, new Blob(['FOTO'], { type: 'image/jpeg' })));
  assert.equal(await b.text(), 'FOTO');
  assert.equal(b.type, 'image/jpeg');
});

test('nada dos inquilinos fica legível no aparelho; a lista de usuários fica aberta para o login', async () => {
  const cru = cruFalso();
  const cof = new K.Cofrinho(cru);
  const g = K.guardarCifrado(cru, () => cof.chave);
  await cof.entrar('dono', 'frase certa de teste', Date.now() + 3600e3, IT);
  await g.gravar('base', banco);
  await g.gravar('pendentes', [{ id: 'x', ops: [{ op: 'alterar', tabela: 'contratos', id: 1, campos: { inquilino_nome: { antes: 'Maria Exemplo', depois: 'Maria E.' } } }] }]);
  await g.gravar('anexo:1', new Blob(['comprovante de Maria Exemplo']));
  assert.doesNotMatch(legivel(cru), /Maria|529\.982/, 'nem nome nem CPF em texto');
  assert.deepEqual((await cru.ler('acesso')).map((u) => u.login), ['dono']);
  assert.equal(await cru.ler('aguardando-dados'), 1);
  assert.deepEqual((await g.ler('base')).contratos[0].inquilino_nome, 'Maria Exemplo');
  // saiu: trancado (ler não abre, gravar não grava)
  await cof.sair();
  assert.equal(await g.ler('base'), undefined);
  await g.gravar('base', { ...banco, contratos: [] });
  assert.equal((await K.decifrar((await K.Cofrinho.prototype.entrar.call(new K.Cofrinho(cru), 'dono', 'frase certa de teste', Date.now() + 1e6, IT)).chave, cru.m.get('base'))).contratos.length, 1, 'gravar trancado não sobrescreveu');
});

test('login lembrado usa a chave guardada; vencido ou sem sessão, tranca', async () => {
  const cru = cruFalso();
  const a = new K.Cofrinho(cru);
  await a.entrar('dono', 'frase certa de teste', Date.now() + 3600e3, IT);
  const b = new K.Cofrinho(cru); // recarregou a página
  assert.ok(await b.daSessao(true));
  assert.equal(await new K.Cofrinho(cru).daSessao(false), null, 'sem sessão válida');
  assert.equal(await cru.ler('chave-sessao'), undefined, 'e apaga a chave');
  await a.entrar('dono', 'frase certa de teste', Date.now() - 1, IT);
  assert.equal(await new K.Cofrinho(cru).daSessao(true), null, 'vencida');
});

test('outro usuário no mesmo aparelho: com a chave aberta, ganha a sua; sem ela, só entra se não houver mudança esperando envio', async () => {
  const cru = cruFalso();
  const cof = new K.Cofrinho(cru);
  const g = K.guardarCifrado(cru, () => cof.chave);
  await cof.entrar('dono', 'senha do dono 123', Date.now() + 3600e3, IT);
  await g.gravar('base', banco);
  await cof.entrar('socia', 'senha da socia 123', Date.now() + 3600e3, IT); // entrou com o dono ainda logado
  await cof.sair();
  const r = await cof.entrar('socia', 'senha da socia 123', Date.now() + 3600e3, IT);
  assert.equal(r.nova, false);
  assert.equal((await g.ler('base')).contratos.length, 1, 'a sócia abre a mesma cópia');
  // dono saiu com uma mudança na fila (sem internet); chega alguém que nunca entrou aqui
  await g.gravar('pendentes', [{ id: 'y', ops: [] }]);
  await cof.sair();
  await assert.rejects(cof.entrar('novo', 'senha do novo 123', Date.now() + 3600e3, IT), /ainda não foram para a nuvem/);
  // depois que a fila foi enviada, o novo entra (chave nova; a cópia antiga é baixada de novo)
  await cof.entrar('dono', 'senha do dono 123', Date.now() + 3600e3, IT);
  await g.gravar('pendentes', []);
  await cof.sair();
  const n = await cof.entrar('novo', 'senha do novo 123', Date.now() + 3600e3, IT);
  assert.equal(n.nova, true);
  assert.equal(await g.ler('base'), undefined, 'cópia antiga ilegível: baixa de novo da nuvem');
});
