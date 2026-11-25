// Ficha pela internet com o que o sistema já tem (pedido do dono, 25/11/2026): o link vem preenchido com a ficha e os outros
// cadastros da mesma pessoa ("Já temos: … corrija se mudou"), nunca com dados de outra parte; o campo deixado vazio não apaga o
// que já sabíamos; depois de mandar fica em análise; devolvida, volta preenchida. Dados fictícios (CPF de teste).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as FO from '../docs/js/ficha-online.js';
import * as R from '../docs/js/regras.js';
import * as FP from '../nuvem/ficha-publica.mjs';
import * as W from '../nuvem/worker.mjs';
import { r2Falso } from './r2-falso.mjs';

const CPF = '529.982.247-25';

function banco() {
  const d = R.bancoVazio();
  R.normalizar(d);
  const i = R.inserir(d, 'imoveis', { nome: 'Flores 3', endereco: 'Rua das Flores, 120', cidade: 'Curitiba', uf: 'PR' }, 'j');
  // Maria já foi inquilina (contrato antigo) e a ficha nova só tem nome, CPF e e-mail
  R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria Souza', inquilino_cpf: CPF, inquilino_rg: '12.345.678-9', inquilino_profissao: 'Professora',
    inquilino_estado_civil: 'Casado(a)', inquilino_telefone: '(41) 99999-0000', inquilino_nascimento: '1990-05-01' }, 'j');
  // o mesmo CPF digitado (por engano) no cadastro de outra pessoa: não pode aparecer no link de Maria
  R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Pedro Outro', inquilino_cpf: CPF, inquilino_endereco: 'Rua de Outra Pessoa, 1', inquilino_email: 'pedro@exemplo.com.br' }, 'j');
  // o fiador já foi fiador de outro contrato
  R.inserir(d, 'fiadores', { contrato_id: 1, nome: 'Ana Lima', cpf: CPF, rg: '98.765.432-1', profissao: 'Engenheira', estado_civil: 'Viúvo(a) inventado' }, 'j');
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Maria Souza', inquilino_cpf: CPF, inquilino_tipo: 'Pessoa física', inquilino_email: 'maria@exemplo.com.br',
    imoveis_ids: [i.id], situacao: 'Em análise', garantia_tipo: 'Fiador', fiador1_nome: 'Ana Lima', fiador1_cpf: CPF, doc_pessoais: true }, 'j');
  return { d, f };
}

test('link do interessado: a ficha primeiro, os vazios dos outros cadastros da mesma pessoa; nada de outra pessoa com o mesmo CPF', () => {
  const { d, f } = banco();
  const v = FO.valoresDoLink(d, f, 'interessado');
  assert.equal(v.inquilino_email, 'maria@exemplo.com.br', 'o da ficha vale');
  assert.equal(v.inquilino_profissao, 'Professora');
  assert.equal(v.inquilino_rg, '12.345.678-9');
  assert.equal(v.inquilino_estado_civil, 'Casado(a)');
  assert.equal(v.inquilino_nascimento, '1990-05-01');
  assert.equal(v.inquilino_endereco, undefined, 'endereço do Pedro (outro nome) não entra');
  assert.ok(!JSON.stringify(v).includes('pedro@'), 'nada do Pedro');
  assert.ok(!JSON.stringify(v).includes('Ana Lima') && !JSON.stringify(v).includes('98.765.432-1'), 'nada do fiador no link do interessado');
  assert.deepEqual(FO.pedidoDoLink(d, f, 'interessado', 'Maria').valores, v, 'é o que vai no pedido do link');
  assert.deepEqual(FO.contextoDaFicha(d, f, 'interessado').recebidos, ['Documentos pessoais']);
});

test('link do fiador: só os dados do fiador (do cadastro de fiadores), com o prefixo do link; opção fora da lista não vai', () => {
  const { d, f } = banco();
  const v = FO.valoresDoLink(d, f, 'fiador1');
  assert.equal(v.fiador1_rg, '98.765.432-1');
  assert.equal(v.fiador1_profissao, 'Engenheira');
  assert.equal(v.fiador1_estado_civil, undefined, 'valor que não está nas opções do campo');
  assert.ok(Object.keys(v).every((k) => k.startsWith('fiador1_')), 'só campos do fiador');
  assert.ok(!JSON.stringify(v).includes('Professora') && !JSON.stringify(v).includes('Maria'), 'nada do interessado');
  assert.deepEqual(FO.contextoDaFicha(d, f, 'fiador1').recebidos, [], 'as marcas de documento são do interessado');
});

// ---------------------------------------------------------------------------
// nuvem: o que a página recebe
// ---------------------------------------------------------------------------
const ERP = 'http://localhost:8787';
const FICHA = 'https://ficha.ankjck.com.br';
const PASTA = 'arquivos/Fichas em analise/Maria Souza (ficha 25-11-2026)';
function ambiente() {
  const env = { MODO_TESTE: '1', EMAIL_TESTE: 'dono@exemplo.com.br', ORIGEM: ERP, URL_FICHA: `${FICHA}/`, HOST_FICHA: 'ficha.ankjck.com.br', DADOS: r2Falso() };
  const equipe = (metodo, caminho, corpo) => W.atender(new Request(`${ERP}/api/ficha-online/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: ERP } : {},
  }), env);
  const publico = (chave, metodo, caminho, corpo) => FP.atenderFicha(new Request(`${FICHA}/api/publico/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : typeof corpo === 'string' || corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo),
    headers: { 'X-Ficha-Token': chave, ...(metodo !== 'GET' ? { 'X-Ficha': '1', Origin: FICHA } : {}) },
  }), env);
  return { env, equipe, publico };
}
const chaveDe = async (r) => (await r.json()).url.split('#')[1];

test('página: "já temos" de cada pessoa só no link dela; campo vazio no envio não apaga o que já sabíamos', async () => {
  const { d, f } = banco();
  const ctx = ambiente();
  const ch = await chaveDe(await ctx.equipe('POST', 'link', FO.pedidoDoLink(d, f, 'interessado', 'Maria Souza (ficha 25-11-2026)')));
  const chF = await chaveDe(await ctx.equipe('POST', 'link', FO.pedidoDoLink(d, f, 'fiador1', 'Maria Souza (ficha 25-11-2026)')));
  const lido = await (await ctx.publico(ch, 'GET', 'ficha')).json();
  assert.equal(lido.ja_temos.inquilino_profissao, 'Professora');
  assert.equal(lido.valores.inquilino_profissao, 'Professora', 'o campo vem preenchido');
  assert.deepEqual(lido.contexto.recebidos, ['Documentos pessoais']);
  const fiador = await (await ctx.publico(chF, 'GET', 'ficha')).json();
  const texto = JSON.stringify(fiador);
  assert.ok(!texto.includes('Professora') && !texto.includes('12.345.678-9') && !texto.includes('maria@'), 'o link do fiador não traz os dados do interessado');
  assert.equal(fiador.ja_temos.fiador1_rg, '98.765.432-1');
  // envia sem a profissão (campo apagado): a página continua com a profissão que já tínhamos; a equipe vê que confirmou
  const v = { ...lido.valores, inquilino_profissao: null, inquilino_telefone: '(41) 98888-7777' };
  assert.equal((await ctx.publico(ch, 'POST', 'ficha/enviar', { valores: v, declaracao: true })).status, 200);
  const depois = await (await ctx.publico(ch, 'GET', 'ficha')).json();
  assert.equal(depois.valores.inquilino_profissao, 'Professora');
  assert.ok(depois.em_analise_em);
  const l = (await (await ctx.equipe('GET', 'lista?ficha=' + f.id)).json()).links.find((x) => x.pessoa === 'interessado');
  assert.deepEqual(l.respostas[0].corrigiu, ['inquilino_telefone']);
  assert.deepEqual(l.respostas[0].ja_tinhamos, { inquilino_telefone: '(41) 99999-0000' });
  assert.ok(l.em_analise_em);
  // link renovado com a ficha em análise continua travado
  const ch2 = await chaveDe(await ctx.equipe('POST', 'link', FO.pedidoDoLink(d, f, 'interessado', 'Maria Souza (ficha 25-11-2026)')));
  assert.equal((await ctx.publico(ch2, 'POST', 'ficha/enviar', { valores: v, declaracao: true })).status, 409);
  // devolvida pela equipe com o que a ficha tem agora: volta preenchida e aceita o envio de novo
  assert.equal((await ctx.equipe('POST', 'atualizar', { ficha_id: f.id, pessoa: 'interessado', liberar: true, valores: FO.valoresDoLink(d, f, 'interessado', l.formulario) })).status, 200);
  const devolvida = await (await ctx.publico(ch2, 'GET', 'ficha')).json();
  assert.equal(devolvida.em_analise_em, null);
  assert.equal(devolvida.valores.inquilino_telefone, '(41) 98888-7777', 'com o que ela mandou');
  assert.equal(devolvida.ja_temos.inquilino_telefone, '(41) 99999-0000');
  assert.equal((await ctx.publico(ch2, 'POST', 'ficha/enviar', { valores: devolvida.valores, declaracao: true })).status, 200);
});

test('registro de antes de 25/11 (sem em_analise_em) com envio: conta como em análise desde o último envio', () => {
  assert.equal(FP.emAnalise({ respostas: [{ em: '2026-11-20T10:00:00.000Z' }] }), '2026-11-20T10:00:00.000Z');
  assert.equal(FP.emAnalise({ respostas: [{ em: 'x' }], em_analise_em: null }), null, 'devolvida');
  assert.equal(FP.emAnalise({ respostas: [] }), null);
  assert.deepEqual(FP.valoresParaPagina({ valores_iniciais: { a: 'x', b: 'y' }, respostas: [{ valores: { a: null, b: 'z' } }] }), { a: 'x', b: 'z' });
});

test('página: rascunho no aparelho apagado ao mandar e na ficha em análise; "Já temos" embaixo do campo; sem barra invertida', async () => {
  const pag = await (await FP.atenderFicha(new Request(`${FICHA}/`), { DADOS: r2Falso() })).text();
  assert.match(pag, /localStorage\.removeItem/);
  assert.match(pag, /F\.conferido_em \|\| F\.em_analise_em \|\| F\.vencido/);
  assert.match(pag, /Já temos: <b>/);
  assert.match(pag, /Em análise pela nossa equipe/);
  assert.ok(!pag.slice(pag.indexOf('<script')).includes('\\'));
});
