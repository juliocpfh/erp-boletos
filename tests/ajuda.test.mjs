// Ajuda para quem está começando (docs/js/ajuda.js): primeiros passos do Painel, botão "?" das telas e o próximo passo
// das listas vazias. Dados de teste fictícios (CPF 529.982.247-25, CNPJ 11.222.333/0001-81).
import assert from 'node:assert/strict';
import test from 'node:test';

const guardado = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => (guardado.has(k) ? guardado.get(k) : null), setItem: (k, v) => guardado.set(k, String(v)), removeItem: (k) => guardado.delete(k) },
});
const AJ = await import('../docs/js/ajuda.js');

const HOJE = '2026-11-16';
const vazio = () => ({ emitentes: [], imoveis: [], contratos: [], cobrancas: [], faturas: [], historico: [] });
const comTudo = () => ({
  ...vazio(),
  emitentes: [{ id: 1, nome: 'Empresa Teste', cnpj: '11.222.333/0001-81' }],
  imoveis: [{ id: 1, nome: 'Apto 101' }],
  contratos: [{ id: 1, imovel_id: 1, inquilino_nome: 'Fulano de Teste', inquilino_cpf: '529.982.247-25', data_entrada: '2026-11-15' }],
  cobrancas: [{ id: 1, contrato_id: 1, competencia: '2026-11' }],
  historico: [{ acao: 'Exportação', descricao: 'Banco e arquivos exportados em ZIP' }],
});

test('primeiros passos: cada passo é marcado pelos dados (empresa, imóvel, contrato, boleto, ZIP ou backup seguro)', () => {
  const feitos = (db, op) => AJ.passosIniciais(db, { hoje: HOJE, ...op }).map((p) => p.feito);
  assert.deepEqual(feitos(vazio()), [false, false, false, false, false]);
  const db = comTudo();
  assert.deepEqual(feitos(db), [true, true, true, true, true]);
  db.historico = [];
  assert.deepEqual(feitos(db), [true, true, true, true, false], 'sem ZIP baixado, o backup falta');
  assert.deepEqual(feitos(db, { backupLigado: true }), [true, true, true, true, true], 'backup seguro ligado neste computador conta');
  db.historico = [{ acao: 'Exportação', descricao: 'Todos os dados exportados em planilha e PDF' }];
  assert.equal(feitos(db)[4], false, 'planilha e PDF não servem de backup (não voltam para o sistema)');
});

test('primeiros passos: o boleto leva ao mês do aluguel do contrato, nunca antes do mês passado', () => {
  const db = comTudo();
  db.cobrancas = [];
  const boleto = () => AJ.passosIniciais(db, { hoje: HOJE }).find((p) => p.chave === 'boleto');
  assert.equal(boleto().href, '#/cobrancas?comp=2026-11', 'entrou em 15/11/2026 → boletos de 11/2026');
  assert.match(boleto().botao, /11\/2026/);
  db.contratos[0].data_entrada = '2025-05-10';
  assert.equal(boleto().href, '#/cobrancas?comp=2026-10', 'contrato antigo → o mês passado (o que a tela Boletos abre)');
  db.contratos[0].data_entrada = '2027-01-05';
  assert.equal(boleto().href, '#/cobrancas?comp=2027-01');
});

test('primeiros passos: aparecem no sistema quase vazio, somem com tudo feito, no sistema cheio e com "Já sei usar"', () => {
  guardado.clear();
  const caixa = (db, op = {}) => AJ.caixaPrimeirosPassos(db, { quem: 'admin', pode: true, admin: true, hoje: HOJE, ...op });
  const html = caixa(vazio());
  assert.match(html, /Primeiros passos/);
  assert.match(html, /0 de 5 feitos/);
  assert.match(html, /href="#\/novo\/emitentes"/);
  assert.match(html, /Já sei usar/);
  // o contrato espera o imóvel; o boleto espera o contrato
  assert.match(html, /\(depois do passo 2\)/);
  assert.match(html, /\(depois do passo 3\)/);
  assert.doesNotMatch(html, /href="#\/novo\/contratos"/);

  const quase = comTudo();
  quase.historico = [];
  assert.match(caixa(quase), /4 de 5 feitos/);
  assert.match(caixa(quase), /✓/);
  assert.equal(caixa(comTudo()), '', 'os 5 feitos: some');

  // sistema já em uso (como o da ANK/JCK): nunca aparece, mesmo sem ZIP baixado
  const cheio = comTudo();
  cheio.historico = [];
  cheio.cobrancas = Array.from({ length: 300 }, (_, i) => ({ id: i + 1, contrato_id: 1, competencia: '2026-01' }));
  assert.equal(caixa(cheio), '');
  assert.equal(AJ.sistemaComecando(cheio), false);
  const muitosImoveis = vazio();
  muitosImoveis.imoveis = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, nome: `Imóvel ${i + 1}` }));
  assert.equal(caixa(muitosImoveis), '');

  // quem só consulta não vê; o operador não cadastra a empresa
  assert.equal(caixa(vazio(), { pode: false }), '');
  const operador = caixa(vazio(), { admin: false, quem: 'operador' });
  assert.match(operador, /o administrador faz/);
  assert.doesNotMatch(operador, /href="#\/novo\/emitentes"/);
  assert.match(operador, /href="#\/novo\/imoveis"/);

  // "Já sei usar": esconde só para este login; Sistema traz de volta
  assert.equal(AJ.caixaReabrirPassos(vazio(), 'admin'), '');
  AJ.esconderPassos('admin');
  assert.equal(caixa(vazio()), '');
  assert.match(caixa(vazio(), { quem: 'operador' }), /Primeiros passos/, 'outro login no mesmo navegador continua vendo');
  assert.match(AJ.caixaReabrirPassos(vazio(), 'admin'), /Mostrar os primeiros passos no Painel/);
  assert.equal(AJ.caixaReabrirPassos(comTudo(), 'admin'), '', 'tudo feito: não há o que reabrir');
  AJ.esconderPassos('admin', false);
  assert.match(caixa(vazio()), /Primeiros passos/);
});

test('ajuda "?": telas principais com texto completo, sem dados de pessoas e escapado', () => {
  for (const chave of ['painel', 'imoveis', 'imovel', 'inquilinos', 'contrato', 'cobrancas', 'faturas', 'banco', 'ficha', 'reajustes', 'iptu', 'dados']) {
    const a = AJ.AJUDA_TELAS[chave];
    assert.ok(a, `falta a ajuda de ${chave}`);
    assert.ok(a.serve.length > 40 && a.primeiro.length >= 2 && /\d/.test(a.exemplo), `ajuda de ${chave} incompleta (o exemplo precisa de datas ou valores)`);
    const texto = AJ.textoDaAjuda(chave);
    assert.match(texto, /Para que serve/);
    assert.doesNotMatch(texto, /\d{3}\.\d{3}\.\d{3}-\d{2}|ANK|JCK/, `ajuda de ${chave} com dado real`);
  }
  assert.equal(AJ.chaveDaAjuda('#/'), 'painel');
  assert.equal(AJ.chaveDaAjuda(''), 'painel');
  assert.equal(AJ.chaveDaAjuda('#/imovel/3?ir=iptu'), 'imovel');
  assert.equal(AJ.chaveDaAjuda('#/cobrancas?comp=2026-10'), 'cobrancas');
  assert.equal(AJ.chaveDaAjuda('#/novo/imoveis'), '', 'formulário não tem o "?"');
  assert.equal(AJ.chaveDaAjuda('#/constructor'), '', 'nome de propriedade do objeto não vira ajuda');
  assert.match(AJ.textoDaAjuda('iptu'), /IPTU&#39;s|IPTU/);
});

test('lista vazia: o próximo passo com botão, texto escapado', () => {
  const html = AJ.proximoPasso('Nenhum <b>imóvel</b>.', 'Comece & siga.', [['#/novo/imoveis', 'Cadastrar "o" primeiro'], false, '<button data-acao="x">pronto</button>']);
  assert.match(html, /Nenhum &lt;b&gt;imóvel&lt;\/b&gt;\./);
  assert.match(html, /Comece &amp; siga\./);
  assert.match(html, /<a class="botao pequeno" href="#\/novo\/imoveis">Cadastrar &quot;o&quot; primeiro<\/a>/);
  assert.match(html, /<button data-acao="x">pronto<\/button>/, 'botão já montado entra como veio');
  assert.doesNotMatch(AJ.proximoPasso('Nada.', ''), /class="acoes"/, 'sem botão, sem a barra');
});

test('calendário do Painel: sistema sem contrato nenhum não mostra "Fechamento concluído"', async () => {
  const R = await import('../docs/js/regras.js');
  const d = R.bancoVazio();
  assert.equal(R.eventosDoMes(d, '2026-11', HOJE).filter((e) => e.tipo === 'Fechamento').length, 0);
});
