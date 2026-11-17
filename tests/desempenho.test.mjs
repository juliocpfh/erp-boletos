// Desempenho (mutirão de 16/11/2026, frente "desempenho e uso sem internet"): o que ficou mais rápido tem de dar exatamente
// o mesmo resultado de antes. Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as S from '../docs/js/armazenamento.js';
import * as R from '../docs/js/regras.js';

/** Pasta falsa em memória (File System Access API): cada gravação muda a data do arquivo. */
function pastaFalsa({ porCima = null } = {}) {
  const arquivos = new Map(); let relogio = 1000;
  return {
    arquivos,
    async getFileHandle(nome, { create } = {}) {
      if (!arquivos.has(nome) && !create) throw new Error('não existe');
      return {
        getFile: async () => { const a = arquivos.get(nome); return { lastModified: a.data, size: Buffer.byteLength(a.texto), text: async () => a.texto }; },
        createWritable: async () => {
          let texto = '';
          return {
            write: async (c) => { texto += typeof c === 'string' ? c : await c.text(); },
            close: async () => { relogio += 1; arquivos.set(nome, { texto: porCima ? porCima(texto) : texto, data: relogio }); },
          };
        },
      };
    },
  };
}

test('banco gravado sem recuo, lido igual, e a gravação devolve a assinatura do arquivo que gravou', async () => {
  const pasta = pastaFalsa();
  const d = R.bancoVazio();
  R.inserir(d, 'imoveis', { nome: 'Sala 1', valor_imovel: 12345678 }, 'teste');
  const assinatura = await S.gravarBanco(pasta, d);
  const texto = pasta.arquivos.get(S.ARQUIVO_BANCO).texto;
  assert.equal(texto, JSON.stringify(d), 'sem recuo (23% menor no banco grande)');
  assert.equal(assinatura, await S.assinaturaDoBanco(pasta), 'a mesma assinatura que a conferência de 30 s vê');
  const lido = await S.lerBanco(pasta);
  assert.deepEqual(lido.imoveis, d.imoveis);
  assert.equal(S.assinaturaLida(lido), assinatura);
});

test('outro computador grava por cima no mesmo instante (tamanho diferente do escrito): sem assinatura, a próxima gravação lê o disco', async () => {
  const pasta = pastaFalsa({ porCima: (t) => `${t} ` });
  assert.equal(await S.gravarBanco(pasta, R.bancoVazio()), null);
});
