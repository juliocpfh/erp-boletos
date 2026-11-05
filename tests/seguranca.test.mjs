// Segurança: parâmetros do endereço, anexos que podem ser abertos/anexados e senhas (achados A1, A2 e M7 da auditoria).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as S from '../docs/js/armazenamento.js';
import * as A from '../docs/js/auth.js';

test('competenciaValida e dataValida: só o formato AAAA-MM / AAAA-MM-DD; o resto vira o padrão', () => {
  assert.equal(C.competenciaValida('2026-01', '2025-12'), '2026-01');
  assert.equal(C.competenciaValida('2026-13', '2025-12'), '2025-12');
  assert.equal(C.competenciaValida('2026-01"><img src=x onerror=alert(1)>', '2025-12'), '2025-12');
  assert.equal(C.competenciaValida('', '2025-12'), '2025-12');
  assert.equal(C.competenciaValida(undefined, '2025-12'), '2025-12');
  assert.equal(C.dataValida('2026-02-28', 'x'), '2026-02-28');
  assert.equal(C.dataValida('2026-2-8', 'x'), 'x');
  assert.equal(C.dataValida('2026-02-28T00:00', 'x'), 'x');
  assert.equal(C.dataValida(null), '');
});

test('sanearParametros: descarta os parâmetros conhecidos fora do formato e mantém os demais', () => {
  const q = C.sanearParametros({
    comp: '2026-01"><script>alert(1)</script>', mes: '2026-03', ordem: 'valor', filtro: 'sem_destino',
    imovel: '12', contrato: '3; drop', ids: '1,2,3', numeros: '1,,2', de: 'iptu', ate: '2026-01-31', ir: 'seguros',
    voltar: '#/vistoria/5?x=1', busca: 'José "da" Silva <b>', texto: 'livre',
  });
  assert.deepEqual(q, {
    mes: '2026-03', ordem: 'valor', filtro: 'sem_destino', imovel: '12', ids: '1,2,3', de: 'iptu', ate: '2026-01-31', ir: 'seguros',
    voltar: '#/vistoria/5?x=1', busca: 'José "da" Silva <b>', texto: 'livre',
  });
  assert.equal(C.sanearParametros({ ordem: 'vencimento"><b>' }).ordem, undefined);
  assert.equal(C.sanearParametros({ de: '2026-01-01' }).de, '2026-01-01');
  assert.equal(C.sanearParametros({ de: 'javascript:alert(1)' }).de, undefined);
  assert.equal(C.sanearParametros({ voltar: 'javascript:alert(1)' }).voltar, undefined);
  assert.equal(C.sanearParametros({ ano: '2026' }).ano, '2026');
  assert.equal(C.sanearParametros({ ano: '20260' }).ano, undefined);
  assert.deepEqual(C.sanearParametros(null), {});
});

test('anexos: página e script não podem ser anexados; só PDF e foto abrem na aba nova', () => {
  for (const n of ['comprovante.html', 'planta.svg', 'x.HTM', 'a.xhtml', 'a.xml', 'a.mht', 'a.mhtml', 'a.js', 'a.mjs', 'nota.pdf.html']) {
    assert.equal(S.nomeAnexavel(n), false, n);
  }
  for (const n of ['contrato.pdf', 'foto.JPG', 'planilha.xlsx', 'doc.docx', 'tudo.zip', 'sem-extensao']) assert.equal(S.nomeAnexavel(n), true, n);
  assert.equal(S.tipoParaAbrir('contrato.pdf'), 'application/pdf');
  assert.equal(S.tipoParaAbrir('Foto.JPG'), 'image/jpeg');
  assert.equal(S.tipoParaAbrir('a.png'), 'image/png');
  assert.equal(S.tipoParaAbrir('a.webp'), 'image/webp');
  assert.equal(S.tipoParaAbrir('a.gif'), 'image/gif');
  assert.equal(S.tipoParaAbrir('a.svg'), '');
  assert.equal(S.tipoParaAbrir('a.html'), '');
  assert.equal(S.tipoParaAbrir('planilha.xlsx'), '');
  assert.equal(S.tipoParaAbrir(''), '');
  assert.match(S.ERRO_TIPO_ARQUIVO, /não pode ser anexado/);
});

test('senhas: 600 mil iterações gravadas no usuário; usuário antigo (150 mil) confere e é reforçado no login', async () => {
  assert.equal(A.ITERACOES_SENHA, 600000);
  const campos = await A.camposDeSenha('frase bem longa 2026');
  assert.equal(campos.senha_iteracoes, 600000);
  assert.equal(campos.senha_hash.length, 64);
  assert.equal(await A.conferirSenha(campos, 'frase bem longa 2026'), true);
  assert.equal(await A.conferirSenha(campos, 'frase bem longa 2025'), false);
  assert.equal(await A.conferirSenha(null, 'x'), false);
  assert.equal(await A.reforcarSenha(campos, 'frase bem longa 2026'), null, 'já está no padrão atual: nada a regravar');
  // usuário gravado antes do campo senha_iteracoes: resumo com 150 mil iterações
  const sal = A.novoSal();
  const antigo = { senha_sal: sal, senha_hash: await A.resumoSenha('senha123', sal, 150000) };
  assert.equal(await A.conferirSenha(antigo, 'senha123'), true);
  const reforco = await A.reforcarSenha(antigo, 'senha123');
  assert.equal(reforco.senha_iteracoes, 600000);
  assert.equal(await A.conferirSenha({ ...antigo, ...reforco }, 'senha123'), true);
  assert.equal(A.senhaCurta('123456789'), true);
  assert.equal(A.senhaCurta('1234567890'), false);
  assert.match(A.ERRO_SENHA_CURTA, /10 caracteres/);
});
