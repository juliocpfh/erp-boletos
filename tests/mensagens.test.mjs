// Mensagens aos inquilinos (pedido do dono de 26/11/2026): campos que o sistema preenche para cada pessoa, quem recebe, o que
// barra o envio (campo desconhecido, "[data]" a completar, dado faltando no cadastro) e o agendado que sai pela nuvem. Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as AG from '../docs/js/agendados.js';
import * as MS from '../docs/js/mensagens.js';
import * as R from '../docs/js/regras.js';

function banco() {
  const d = R.bancoVazio();
  d.emitentes.push({ id: 1, nome: 'ANK', razao_social: 'ANK Administradora Ltda', cnpj: '11.222.333/0001-81', ativo: true, cidade_documentos: 'Curitiba', uf_sede: 'PR' });
  d.imoveis.push({ id: 1, nome: 'Apto 101', endereco: 'Rua Exemplo, 100', complemento: 'apto 101', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' });
  d.imoveis.push({ id: 2, nome: 'Casa 7', endereco: 'Rua Teste, 7', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' });
  d.contratos.push({ id: 12, imovel_id: 1, inquilino_nome: 'Ana Souza Teste', inquilino_email: 'ana@exemplo.com.br', inquilino_telefone: '(41) 99999-0000', inquilino_whatsapp: true,
    data_entrada: '2025-03-01', vigencia_inicio: '2025-03-01', prazo_meses: 36, aluguel_inicial: 200000, desconto_pontualidade_percentual: 10, dia_vencimento: 10, garantia_tipo: 'Fiador' });
  d.contratos.push({ id: 13, imovel_id: 2, inquilino_nome: 'Bruno Sem Email', inquilino_telefone: '(41) 98888-0000', data_entrada: '2026-01-01', prazo_tipo: 'Indeterminado', aluguel_inicial: 150000, bonificacao: false, dia_vencimento: 5 });
  d.contratos.push({ id: 14, imovel_id: 1, inquilino_nome: 'Saiu Antes', data_entrada: '2020-01-01', data_saida: '2021-01-01' });
  d.fiadores.push({ id: 5, contrato_id: 12, nome: 'Diego Fiador', email: 'diego@exemplo.com.br', telefone: '41977776666' });
  return d;
}

const HOJE = '2026-11-26';
const EMPRESA = { email_empresa: 'administracao@exemplo.com.br', telefone_empresa: '(41) 3333-0000' };

test('cada pessoa recebe o texto com os dados dela', () => {
  const d = banco();
  const lista = MS.pessoas(d, HOJE);
  assert.deepEqual(lista.map((p) => p.chave), ['c12', 'f5', 'c13'], 'só contratos ativos; o fiador junto do contrato');
  const texto = 'Olá, {nome}.[se fiador] Você é fiador de {locatario}.[fim] Aluguel {aluguel}, em dia {aluguel_em_dia}, vence dia {dia_vencimento}. Contrato de {inicio_contrato} a {fim_contrato}. {empresas} · {telefone_empresa}';
  const ana = MS.preencher(texto, MS.camposDe(d, EMPRESA, lista[0], HOJE));
  assert.equal(ana, 'Olá, Ana. Aluguel R$ 2.000,00, em dia R$ 1.800,00, vence dia 10. Contrato de 01/03/2025 a 01/03/2028. ANK · (41) 3333-0000');
  const diego = MS.preencher(texto, MS.camposDe(d, EMPRESA, lista[1], HOJE));
  assert.match(diego, /^Olá, Diego\. Você é fiador de Ana Souza Teste\./);
  const bruno = MS.preencher(texto, MS.camposDe(d, EMPRESA, lista[2], HOJE));
  assert.match(bruno, /Aluguel R\$ 1\.500,00, em dia R\$ 1\.500,00, vence dia 5\. Contrato de 01\/01\/2026 a prazo indeterminado\./, 'sem bonificação: em dia = cheio');
  assert.equal(MS.preencher('{imovel} / {imovel_curto} / {hoje}', MS.camposDe(d, EMPRESA, lista[0], HOJE)), 'Rua Exemplo, 100, apto 101, Centro, Curitiba/PR / Apto 101 / 26/11/2026');
  // dado faltando: aparece "[preencher: …]" e a tela não manda
  assert.deepEqual(MS.faltando(MS.preencher('Ligue {telefone_empresa}', MS.camposDe(d, {}, lista[0], HOJE))), ['telefone_empresa']);
});

test('todos os campos da lista são preenchidos (nenhum fica sem dado num contrato completo)', () => {
  const d = banco();
  const p = MS.pessoas(d, HOJE)[0];
  const texto = MS.CAMPOS.map((c) => `{${c.campo}}`).join(' ');
  assert.deepEqual(MS.faltando(MS.preencher(texto, MS.camposDe(d, EMPRESA, p, HOJE))), []);
  for (const [k, m] of Object.entries(MS.MODELOS)) {
    for (const t of [m.assunto, m.texto, m.whatsapp]) assert.deepEqual(MS.camposDesconhecidos(t), [], `modelo ${k} só usa campos conhecidos`);
  }
});

test('nova mensagem: só as pessoas escolhidas, sem nome guardado; o que barra', () => {
  const d = banco();
  const msg = MS.novaMensagem(d, { assunto: 'Aviso', texto: 'Olá, {nome}.', whatsapp: '', ...EMPRESA, chaves: ['c12', 'c13', 'c99'] }, HOJE);
  assert.deepEqual(msg.destinos, [{ chave: 'c12', tipo: 'inquilino', contrato_id: 12, fiador_id: null }, { chave: 'c13', tipo: 'inquilino', contrato_id: 13, fiador_id: null }]);
  assert.equal(msg.titulo, 'Aviso', 'sem nome, o título é o assunto');
  assert.ok(!JSON.stringify(msg.destinos).includes('Ana'), 'o nome vem do cadastro, não fica na mensagem');
  const erro = (dados, re) => assert.throws(() => MS.novaMensagem(d, { assunto: 'A', texto: 'x', ...EMPRESA, chaves: ['c12'], ...dados }, HOJE), re);
  erro({ chaves: [] }, /Escolha pelo menos uma pessoa/);
  erro({ texto: '', whatsapp: '' }, /Escreva o texto/);
  erro({ assunto: '' }, /assunto/);
  erro({ texto: 'Olá, {nomee}' }, /não conhece \{nomee\}/);
  erro({ texto: MS.MODELOS.manutencao.texto }, /Complete o texto antes: \[data\]/);
  assert.doesNotThrow(() => MS.novaMensagem(d, { assunto: '', texto: '', whatsapp: 'Oi {nome}[se fiador] (fiador)[fim]', ...EMPRESA, chaves: ['f5'] }, HOJE), 'só WhatsApp não pede assunto; [se]…[fim] não conta como "a completar"');
});

test('fila do envio: quem não recebeu, quem não tem contato e quem saiu', () => {
  const d = banco();
  const msg = R.inserir(d, 'mensagens', MS.novaMensagem(d, { assunto: 'A', texto: 'x', whatsapp: 'y', ...EMPRESA, chaves: ['c12', 'c13', 'f5'] }, HOJE), 'teste');
  let f = MS.filaDoEnvio(d, msg, 'email');
  assert.deepEqual(f.alvos.map((x) => x.chave), ['c12', 'f5']);
  assert.deepEqual(f.sem.map((x) => x.chave), ['c13'], 'Bruno sem e-mail');
  MS.marcarEnvio(d, msg.id, 'c12', 'email_em', 'teste', '2026-11-26T13:00:00.000Z');
  f = MS.filaDoEnvio(d, R.buscar(d, 'mensagens', msg.id), 'email');
  assert.deepEqual(f.alvos.map((x) => x.chave), ['f5']);
  assert.deepEqual(MS.filaDoEnvio(d, R.buscar(d, 'mensagens', msg.id), 'whats').alvos.map((x) => x.chave), ['c12', 'f5', 'c13']);
  // o fiador sai do cadastro: fica de fora
  d.fiadores = [];
  f = MS.filaDoEnvio(d, R.buscar(d, 'mensagens', msg.id), 'email');
  assert.equal(f.fora, 1);
  assert.deepEqual(MS.resumo(R.buscar(d, 'mensagens', msg.id)), { total: 3, email: 1, whats: 0, agendados: 0, nada: 2 });
  assert.ok(!d.historico.some((h) => /Ana|Diego|Bruno/.test(h.descricao || '')), 'histórico sem nomes');
});

test('e-mail agendado: sai pela nuvem e marca a pessoa; cancelado volta a "não enviado"', () => {
  const d = banco();
  const msg = R.inserir(d, 'mensagens', MS.novaMensagem(d, { assunto: 'A', texto: 'x', ...EMPRESA, chaves: ['c12', 'f5'] }, HOJE), 'teste');
  R.atualizar(d, 'mensagens', msg.id, { destinos: msg.destinos.map((y) => ({ ...y, agendado_id: `ag-${y.chave}`, agendado_para: '2026-11-27T11:00:00.000Z' })) }, 'teste');
  assert.equal(MS.situacaoDe(R.buscar(d, 'mensagens', msg.id).destinos[0]).texto, 'E-mail agendado');
  R.inserir(d, 'envios_email', { data: '2026-11-27', chave: 'mensagem', contrato_id: 12, mensagem_id: msg.id, para: 'ana@exemplo.com.br', como: 'enviado', agendado_id: 'ag-c12', enviado_em: '2026-11-27T11:00:05.000Z',
    efeito: { tipo: 'mensagem', mensagem_id: msg.id, destino: 'c12' } }, 'nuvem');
  assert.equal(AG.aplicarEfeitos(d, 'teste'), 1);
  const ana = R.buscar(d, 'mensagens', msg.id).destinos[0];
  assert.equal(ana.email_em, '2026-11-27T11:00:05.000Z');
  assert.equal(ana.agendado_id, undefined);
  assert.equal(AG.aplicarEfeitos(d, 'teste'), 0, 'não repete');
  assert.ok(AG.desfazerAgendamento(d, { efeito: { tipo: 'mensagem', mensagem_id: msg.id, destino: 'f5' } }, 'ag-f5', 'teste'));
  assert.equal(MS.situacaoDe(R.buscar(d, 'mensagens', msg.id).destinos[1]).texto, 'Não enviado');
});
