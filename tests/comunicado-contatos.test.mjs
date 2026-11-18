// Comunicado com confirmação de contatos (pedido do dono em 2026-11-18): link da equipe (nuvem/contatos-publico.mjs), página
// pública, código no e-mail, aceite com prova (IP, aparelho, texto), e o lado do site (comunicados.js): quem recebe, textos e a
// volta da resposta para o cadastro. E-mail com a logo (gmail.mjs, HTML + imagem cid). Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as CP from '../nuvem/contatos-publico.mjs';
import * as FP from '../nuvem/ficha-publica.mjs';
import * as G from '../nuvem/gmail.mjs';
import * as W from '../nuvem/worker.mjs';
import * as CM from '../docs/js/comunicados.js';
import * as R from '../docs/js/regras.js';
import { r2Falso } from './r2-falso.mjs';

const ERP = 'http://localhost:8787';
const FICHA = 'https://ficha.ankjck.com.br';

function ambiente() {
  const env = { MODO_TESTE: '1', EMAIL_TESTE: 'dono@exemplo.com.br', ORIGEM: ERP, URL_FICHA: `${FICHA}/`, HOST_FICHA: 'ficha.ankjck.com.br', SIMULAR_GMAIL: '1', GMAIL_REMETENTE: 'administracao@exemplo.com.br', DADOS: r2Falso() };
  const equipe = (metodo, caminho, corpo) => W.atender(new Request(`${ERP}/api/contatos/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: ERP } : {},
  }), env);
  const publico = (chave, metodo, caminho, corpo, cab = {}) => FP.atenderFicha(new Request(`${FICHA}/api/publico/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    headers: { ...(chave ? { 'X-Ficha-Token': chave } : {}), ...(metodo !== 'GET' ? { 'X-Ficha': '1', Origin: FICHA } : {}), 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'Teste/1.0', ...cab },
  }), env);
  return { env, equipe, publico };
}

const CONTEXTO = {
  empresas: ['ANK Administradora Ltda', 'JCK Imóveis Ltda'], cnpjs: ['11.222.333/0001-81'], cidade: 'Curitiba/PR', logo: '',
  titulo: 'Novo e-mail da administração', nome: 'Ana Teste', tipo: 'inquilino', imovel: 'Rua Exemplo, 100, apto 101', desde: '03/2025',
  email: 'ana@exemplo.com.br', telefone: '(41) 99999-0000', whatsapp: true, prazo: '2099-11-28', aviso: 'Nossos e-mails saem de administracao@exemplo.com.br.',
  ciencia: 'Li e concordo.', email_empresa: 'administracao@exemplo.com.br', telefone_empresa: '(41) 3333-0000',
};

/** Pega o código do "e-mail" simulado (o assunto tem o código). */
async function comCodigo(fn) {
  const linhas = []; const velho = console.log;
  console.log = (...a) => { linhas.push(a.join(' ')); };
  try { await fn(); } finally { console.log = velho; }
  const m = linhas.join('\n').match(/Seu código de confirmação: (\d{6})/);
  return m ? m[1] : null;
}

async function criar(ctx, destino = 'c12', contexto = CONTEXTO) {
  const r = await ctx.equipe('POST', 'link', { comunicado_id: 3, destino, contexto });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.match(d.url, /^https:\/\/ficha\.ankjck\.com\.br\/contatos#[A-Za-z0-9_-]{43}$/);
  return d.url.split('#')[1];
}

test('link de contatos: a página lê o contexto e anota a abertura de cada canal', async () => {
  const ctx = ambiente();
  const chave = await criar(ctx);
  const r = await ctx.publico(chave, 'GET', 'contatos', undefined, { 'X-Canal': 'whatsapp' });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.contexto.nome, 'Ana Teste');
  assert.equal(d.resposta, null);
  await ctx.publico(chave, 'GET', 'contatos', undefined, { 'X-Canal': 'whatsapp' }); // a mesma abertura não repete
  const lista = await (await ctx.equipe('GET', 'lista?comunicado=3')).json();
  assert.equal(lista.links.length, 1);
  assert.equal(lista.links[0].aberturas.length, 1);
  assert.equal(lista.links[0].aberturas[0].canal, 'whatsapp');
  assert.ok(!('hash' in lista.links[0]) && !('codigo' in lista.links[0]), 'a equipe não recebe o hash nem o código');
  assert.equal((await ctx.publico('x'.repeat(43), 'GET', 'contatos')).status, 404);
  assert.equal((await ctx.equipe('POST', 'link', { comunicado_id: 3, destino: '../x', contexto: CONTEXTO })).status, 400);
});

test('confirmação: código no e-mail digitado, erro conta tentativa, aceite guarda IP, aparelho e o texto', async () => {
  const ctx = ambiente();
  const chave = await criar(ctx);
  const sem = await ctx.publico(chave, 'POST', 'contatos/confirmar', { email: 'nova@exemplo.com.br', codigo: '123456', telefone: '41988887777', melhor: 'WhatsApp', ciente: true });
  assert.equal(sem.status, 400, 'sem pedir o código antes');
  const codigo = await comCodigo(async () => assert.equal((await ctx.publico(chave, 'POST', 'contatos/codigo', { email: 'Nova@Exemplo.com.br' })).status, 200));
  assert.match(codigo, /^\d{6}$/);
  assert.equal((await ctx.publico(chave, 'POST', 'contatos/codigo', { email: 'nova@exemplo.com.br' })).status, 429, 'um por minuto');
  const base = { email: 'nova@exemplo.com.br', telefone: '(41) 98888-7777', whatsapp: true, melhor: 'WhatsApp', ciente: true };
  const errado = await ctx.publico(chave, 'POST', 'contatos/confirmar', { ...base, codigo: codigo === '000000' ? '111111' : '000000' });
  assert.equal(errado.status, 400);
  assert.equal((await ctx.publico(chave, 'POST', 'contatos/confirmar', { ...base, codigo, ciente: false })).status, 400, 'sem a ciência');
  assert.equal((await ctx.publico(chave, 'POST', 'contatos/confirmar', { ...base, codigo, email: 'outro@exemplo.com.br' })).status, 400, 'e-mail diferente do código');
  const ok = await ctx.publico(chave, 'POST', 'contatos/confirmar', { ...base, codigo, assinatura: 'data:image/png;base64,iVBORw0KGgo=' }, { 'X-Canal': 'email' });
  assert.equal(ok.status, 200);
  const [l] = (await (await ctx.equipe('GET', 'lista?comunicado=3')).json()).links;
  assert.equal(l.resposta.email, 'nova@exemplo.com.br');
  assert.equal(l.resposta.telefone, '41988887777');
  assert.equal(l.resposta.ip, '203.0.113.7');
  assert.equal(l.resposta.aparelho, 'Teste/1.0');
  assert.equal(l.resposta.canal, 'email');
  assert.match(l.resposta.texto_aceito, /Li e concordo/);
  assert.match(l.resposta.texto_sha256, /^[0-9a-f]{64}$/);
  const pagina = await (await ctx.publico(chave, 'GET', 'contatos')).json();
  assert.equal(pagina.resposta.email, 'nova@exemplo.com.br');
  assert.ok(!('ip' in pagina.resposta), 'a página não devolve o IP');
});

test('link encerrado ou trocado deixa de valer; assinatura que não é PNG é recusada', async () => {
  const ctx = ambiente();
  const velha = await criar(ctx);
  const nova = await criar(ctx);
  assert.equal((await ctx.publico(velha, 'GET', 'contatos')).status, 404);
  assert.equal((await ctx.publico(nova, 'GET', 'contatos')).status, 200);
  const codigo = await comCodigo(() => ctx.publico(nova, 'POST', 'contatos/codigo', { email: 'ana@exemplo.com.br' }));
  const r = await ctx.publico(nova, 'POST', 'contatos/confirmar', { email: 'ana@exemplo.com.br', codigo, telefone: '41999990000', melhor: 'E-mail', ciente: true, assinatura: 'data:text/html;base64,PGI+' });
  assert.equal(r.status, 400);
  assert.equal((await ctx.equipe('POST', 'encerrar', { comunicado_id: 3, destino: 'c12' })).status, 200);
  assert.equal((await ctx.publico(nova, 'GET', 'contatos')).status, 404);
});

test('página dos contatos: só com nonce, sem nada de fora', async () => {
  const r = await FP.atenderFicha(new Request(`${FICHA}/contatos`), { DADOS: r2Falso() });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Security-Policy'), /script-src 'nonce-/);
  const html = await r.text();
  assert.ok(!/https?:\/\/(?!www\.w3)/.test(html.replace(/location\.host/g, '')), 'nenhum endereço de fora');
});

test('e-mail com a logo: texto e HTML (alternative) com a imagem no related', () => {
  const v = G.validarEnvio({ para: 'a@exemplo.com.br', assunto: 'Oi', texto: 'oi', html: '<p>oi <img src="cid:logo"></p>', imagens: [{ cid: 'logo', tipo: 'image/png', base64: 'iVBORw0KGgo=' }] });
  const mime = G.montarMime({ de: 'adm@exemplo.com.br', ...v, fronteira: 'F' });
  assert.match(mime, /multipart\/alternative; boundary="F_alt"/);
  assert.match(mime, /multipart\/related; boundary="F_rel"/);
  assert.match(mime, /Content-ID: <logo>/);
  assert.throws(() => G.validarEnvio({ para: 'a@exemplo.com.br', assunto: 'Oi', texto: 'oi', html: '<p>x</p>', imagens: [{ cid: 'logo', tipo: 'text/html', base64: 'PGI+' }] }), /Imagem/);
  const sem = G.montarMime({ de: 'adm@exemplo.com.br', ...G.validarEnvio({ para: 'a@exemplo.com.br', assunto: 'Oi', texto: 'oi' }) });
  assert.ok(!/multipart/.test(sem), 'sem HTML continua só texto');
});

function banco() {
  const d = R.bancoVazio();
  d.emitentes.push({ id: 1, nome: 'ANK', razao_social: 'ANK Administradora Ltda', cnpj: '11.222.333/0001-81', ativo: true, cidade_documentos: 'Curitiba', uf_sede: 'PR' });
  d.imoveis.push({ id: 1, nome: 'Apto 101', endereco: 'Rua Exemplo, 100', complemento: 'apto 101', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' });
  d.contratos.push({ id: 12, imovel_id: 1, inquilino_nome: 'Ana Teste', inquilino_email: 'ana@exemplo.com.br', inquilino_telefone: '(41) 99999-0000', inquilino_whatsapp: true, data_entrada: '2025-03-01', garantia_tipo: 'Fiador' });
  d.contratos.push({ id: 13, imovel_id: 1, inquilino_nome: 'Saiu Antes', data_entrada: '2020-01-01', data_saida: '2021-01-01' });
  d.fiadores.push({ id: 5, contrato_id: 12, nome: 'Diego Fiador', email: 'diego@exemplo.com.br', telefone: '41977776666' });
  return d;
}

test('quem recebe: inquilinos e fiadores dos contratos ativos; textos do fiador', () => {
  const d = banco();
  const lista = CM.destinatarios(d, '2026-11-18');
  assert.deepEqual(lista.map((p) => p.chave), ['c12', 'f5']);
  const com = CM.novoComunicado(d, 'contatos', { prazo: '2026-11-28', email_empresa: 'administracao@exemplo.com.br', telefone_empresa: '(41) 3333-0000' }, '2026-11-18');
  const texto = CM.preencher(com.texto, CM.camposDe(d, com, lista[1], 'https://x/contatos#k'));
  assert.match(texto, /Olá, Diego\./);
  assert.match(texto, /contrato de locação de Ana Teste, do qual você é fiador/);
  assert.match(texto, /até 28\/11\/2026/);
  assert.ok(!/\[preencher/.test(texto));
  const ctx = CM.contextoDoLink(d, com, lista[0]);
  assert.equal(ctx.desde, '03/2025');
  assert.deepEqual(ctx.cnpjs, ['11.222.333/0001-81']);
  assert.ok(() => CP.contextoValido(ctx));
  assert.equal(CM.linkDoCanal('https://x/contatos#k', 'whatsapp'), 'https://x/contatos?c=w#k');
  const html = CM.htmlDoEmail('Olá.\n\nhttps://x#k\n\nAtenção: o Pix não muda.', { empresas: ['A <b>'], link: 'https://x#k', logo: true });
  assert.match(html, /cid:logo/);
  assert.match(html, /Confirmar meus contatos/);
  assert.ok(!html.includes('A <b>'), 'nome escapado');
});

test('resposta volta ao cadastro uma vez (contrato e fiador), com histórico', () => {
  const d = banco();
  const com = R.inserir(d, 'comunicados', CM.novoComunicado(d, 'contatos', { prazo: '2026-11-28', email_empresa: 'a@exemplo.com.br', telefone_empresa: '(41) 3333-0000' }, '2026-11-18'), 'teste');
  const links = [
    { destino: 'c12', aberto_em: '2026-11-18T15:00:00Z', resposta: { em: '2026-11-18T15:40:00Z', email: 'ana.nova@exemplo.com.br', telefone: '41988887777', whatsapp: true, melhor: 'WhatsApp' } },
    { destino: 'f5', aberto_em: '2026-11-18T16:00:00Z', resposta: { em: '2026-11-18T16:10:00Z', email: 'diego@exemplo.com.br', telefone: '41977776666', whatsapp: false, melhor: 'E-mail' } },
  ];
  assert.equal(CM.juntarRespostas(d, com.id, links, 'teste'), 1, 'só a Ana mudou');
  assert.equal(R.buscar(d, 'contratos', 12).inquilino_email, 'ana.nova@exemplo.com.br');
  assert.equal(R.buscar(d, 'contratos', 12).inquilino_telefone, '(41) 98888-7777');
  const c = R.buscar(d, 'comunicados', com.id);
  assert.equal(CM.resumo(c).confirmaram, 2);
  assert.equal(CM.resumo(c).mudaram, 1);
  assert.equal(CM.juntarRespostas(d, com.id, links, 'teste'), 0, 'não aplica de novo');
});
