// Link da ficha pela internet (decisão de 2026-11-16): o endereço com a chave da pessoa não fica no banco (só a validade);
// fica só na memória da aba que gerou. normalizar apaga o url antigo; o e-mail só leva o link gerado nesta aba.
import assert from 'node:assert/strict';
import test from 'node:test';
import { dadosDoEmail } from '../docs/js/email-dados.js';
import * as FO from '../docs/js/ficha-online.js';
import * as R from '../docs/js/regras.js';

function base() {
  const d = R.bancoVazio();
  const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Apto A' }, 'teste');
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Interessado Teste', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física',
    data_recebida: '2026-11-12', situacao: 'Em análise', modo_imoveis: 'Apenas um dos imóveis', imoveis_ids: [i.id] }, 'teste');
  return { d, f };
}

test('normalizar apaga o endereço do link guardado nas fichas antigas e mantém a validade', () => {
  const { d, f } = base();
  f.links_ficha = { interessado: { url: 'https://ficha.ankjck.com.br/#chave-secreta', vence_em: '2026-11-21T10:00:00.000Z', criado_em: '2026-11-14T10:00:00.000Z', por: 'dono' } };
  R.normalizar(d);
  assert.deepEqual(R.buscar(d, 'fichas', f.id).links_ficha, { interessado: { vence_em: '2026-11-21T10:00:00.000Z', criado_em: '2026-11-14T10:00:00.000Z', por: 'dono' } });
  assert.doesNotMatch(JSON.stringify(d), /chave-secreta/);
});

test('o histórico não guarda os links da ficha', () => {
  const { d, f } = base();
  R.atualizar(d, 'fichas', f.id, { links_ficha: { interessado: { url: 'https://ficha.ankjck.com.br/#chave-secreta', vence_em: '2026-11-21T10:00:00.000Z' } } }, 'teste', 'Link gerado');
  assert.doesNotMatch(JSON.stringify(d.historico), /chave-secreta/);
});

test('o e-mail de envio da ficha só leva o link gerado nesta aba (no banco não há endereço)', () => {
  const { d, f } = base();
  f.links_ficha = { interessado: { vence_em: '2026-11-21T10:00:00.000Z', criado_em: '2026-11-14T10:00:00.000Z', por: 'dono' } };
  FO.esquecerUrlsDosLinks();
  assert.equal(dadosDoEmail(d, { ficha: f }, {}, '2026-11-14').campos.link, '');
  FO.lembrarUrlDoLink(f.id, 'interessado', { url: 'https://ficha.ankjck.com.br/#nova', vence_em: '2099-11-21T10:00:00.000Z' });
  f.links_ficha.interessado.vence_em = '2099-11-21T10:00:00.000Z';
  assert.equal(dadosDoEmail(d, { ficha: f }, {}, '2026-11-14').campos.link, 'https://ficha.ankjck.com.br/#nova');
  // link encerrado não vai mais
  f.links_ficha.interessado.encerrado = true;
  assert.equal(dadosDoEmail(d, { ficha: f }, {}, '2026-11-14').campos.link, '');
  FO.esquecerUrlsDosLinks();
  assert.equal(FO.urlDoLink(f.id, 'interessado'), null);
});
