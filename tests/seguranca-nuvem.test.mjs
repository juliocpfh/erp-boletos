// Segurança da nuvem (mutirão de 16/11): tabelas conhecidas, conflitos sem senha, troca de senha desliga os computadores,
// numeração da NF, histórico de tabela do administrador, faxina de excluídos, cota do dia, cofre vazio, e-mail só operador e
// registrado, backups só para o administrador, extensões perigosas (também no mover), lixeira, limite por endereço no
// /api/aparelho, e a ficha pela internet (PDF sem link, prazo vencido, faxina). Dados fictícios.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Cofre, CofreDO, TABELAS_CONHECIDAS, MAX_SALTO_NF, DIAS_EXCLUIDOS, COTA_DIA, MAX_EMAILS_DIA } from '../nuvem/cofre.mjs';
import * as W from '../nuvem/worker.mjs';
import { faxinaDaLixeira, caminhoNaLixeira } from '../nuvem/lixeira.mjs';
import { faxinaDosLinks, guardarPdf, lerFichaPublica, hashDaChave } from '../nuvem/ficha-publica.mjs';
import { copiavel, planoCopia } from '../docs/js/copia-aberta.js';
import { nomeAnexavel } from '../docs/js/armazenamento.js';
import * as R from '../docs/js/regras.js';
import { r2Falso } from './r2-falso.mjs';

function sqlFalso() {
  const db = new DatabaseSync(':memory:');
  return {
    db,
    exec(q, ...p) {
      if (!p.length && q.trim().split(';').filter((x) => x.trim()).length > 1) { db.exec(q); return { toArray: () => [] }; }
      const linhas = db.prepare(q).all(...p).map((l) => ({ ...l }));
      return { toArray: () => linhas };
    },
  };
}
const tx = (sql) => (fn) => { sql.db.exec('BEGIN'); try { const r = fn(); sql.db.exec('COMMIT'); return r; } catch (e) { sql.db.exec('ROLLBACK'); throw e; } };
let hora = new Date('2026-11-16T10:00:00-03:00');
const DONO = 'dono@exemplo.com.br'; const OPERADOR = 'operador@exemplo.com.br'; const CONSULTA = 'consulta@exemplo.com.br';
const banco = () => ({
  formato: 'imoveis-v1', proxima_fatura: 157,
  usuarios: [
    { id: 1, login: DONO, papel: 'admin', ativo: true, senha_hash: 'h1' },
    { id: 3, login: OPERADOR, papel: 'operador', ativo: true, senha_hash: 'h3', senha_sal: 's3', senha_iteracoes: 600000 },
    { id: 4, login: CONSULTA, papel: 'consulta', ativo: true, senha_hash: 'h4' },
  ],
  emitentes: [{ id: 1, nome: 'Empresa Teste', pix: 'chave-certa' }],
  fichas: [{ id: 7, inquilino_nome: 'Interessado Teste', inquilino_cpf: '529.982.247-25' }],
  historico: [],
});
const novo = () => { const sql = sqlFalso(); const c = new Cofre(sql, tx(sql), () => hora); c.importar(banco(), DONO); return c; };
let n = 0;
const lote = (ops) => ({ id: `pc-lote-${String(n += 1).padStart(5, '0')}`, ops });

test('as tabelas conhecidas do cofre são as tabelas do sistema; tabela inventada é recusada', () => {
  const d = R.bancoVazio(); R.normalizar(d);
  const doSistema = Object.keys(d).filter((k) => Array.isArray(d[k]) && k !== 'historico').sort();
  assert.deepEqual([...TABELAS_CONHECIDAS].sort(), doSistema, 'tabela nova em regras.js também entra em TABELAS_CONHECIDAS (nuvem/cofre.mjs)');
  const c = novo();
  assert.throws(() => c.aplicar(lote([{ op: 'inserir', tabela: 'lixo_qualquer', id: 5000, dados: { id: 5000 } }]), OPERADOR), /Tabela desconhecida/);
  assert.throws(() => c.faixa({ tabela: 'lixo_qualquer' }, OPERADOR), /Tabela desconhecida/);
  assert.equal(c.aplicar(lote([{ op: 'inserir', tabela: 'acordos', id: 1, dados: { id: 1 } }]), OPERADOR).ok, true);
});

test('senha nunca vira conflito, conflito de usuários só para o administrador, e trocar a senha desliga os computadores', () => {
  const c = novo();
  c.sql.exec('CREATE TABLE IF NOT EXISTS aparelhos (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL UNIQUE, computador TEXT NOT NULL, usuario_id INTEGER NOT NULL, ligado_por TEXT NOT NULL, ligado_em TEXT NOT NULL, ultimo_uso TEXT NOT NULL, desligado_em TEXT, desligado_por TEXT)');
  c.sql.exec("INSERT INTO aparelhos (hash, computador, usuario_id, ligado_por, ligado_em, ultimo_uso) VALUES ('x', 'PC', 3, 'operador', '2026-11-01', '2026-11-16')");
  // dois aparelhos trocaram a senha sem se ver: vale a última, sem conflito com os resumos
  c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 3, campos: { senha_hash: { antes: 'h3', depois: 'cccc' } } }]), OPERADOR);
  const r = c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 3, campos: { senha_hash: { antes: 'h3', depois: 'dddd' } } }]), OPERADOR);
  assert.equal(r.ok, true);
  assert.deepEqual(r.conflitos, []);
  assert.equal(c.tudo().usuarios.find((u) => u.id === 3).senha_hash, 'dddd');
  assert.ok(c.q('SELECT desligado_em FROM aparelhos WHERE usuario_id = 3')[0].desligado_em, 'computador do operador desligado');
  // conflito em outro campo de usuários: o administrador vê, o consulta não
  c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 4, campos: { nome: { antes: undefined, depois: 'A' } } }]), DONO);
  c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 4, campos: { nome: { antes: undefined, depois: 'B' } } }]), DONO);
  assert.ok(c.conflitosAbertos(c.exigir(DONO, 'consulta')).some((x) => x.tabela === 'usuarios'));
  assert.ok(!c.conflitosAbertos(c.exigir(CONSULTA, 'consulta')).some((x) => x.tabela === 'usuarios'));
  assert.ok(!c.tudo(c.exigir(CONSULTA, 'consulta'))._nuvem.conflitos.some((x) => x.tabela === 'usuarios'));
});

test('o reforço da senha no login (muda as voltas) não desliga os computadores', () => {
  const c = novo();
  c.sql.exec('CREATE TABLE IF NOT EXISTS aparelhos (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL UNIQUE, computador TEXT NOT NULL, usuario_id INTEGER NOT NULL, ligado_por TEXT NOT NULL, ligado_em TEXT NOT NULL, ultimo_uso TEXT NOT NULL, desligado_em TEXT, desligado_por TEXT)');
  c.sql.exec("INSERT INTO aparelhos (hash, computador, usuario_id, ligado_por, ligado_em, ultimo_uso) VALUES ('y', 'PC', 1, 'dono', '2026-11-01', '2026-11-16')");
  c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 1, campos: { senha_hash: { antes: 'h1', depois: 'novo' }, senha_iteracoes: { antes: undefined, depois: 600000 } } }]), DONO);
  assert.equal(c.q('SELECT desligado_em FROM aparelhos WHERE usuario_id = 1')[0].desligado_em, null);
});

test('número da NF: fora do administrador só anda para a frente, e no máximo MAX_SALTO_NF de uma vez', () => {
  const c = novo();
  assert.throws(() => c.aplicar(lote([{ op: 'raiz', campo: 'proxima_fatura', antes: 157, depois: 9000 }]), OPERADOR), /Só o administrador/);
  assert.throws(() => c.aplicar(lote([{ op: 'raiz', campo: 'proxima_fatura', antes: 157, depois: 150 }]), OPERADOR), /Só o administrador/);
  assert.equal(c.aplicar(lote([{ op: 'raiz', campo: 'proxima_fatura', antes: 157, depois: 160 }]), OPERADOR).ok, true);
  assert.equal(c.aplicar(lote([{ op: 'raiz', campo: 'proxima_fatura', antes: 160, depois: 160 + MAX_SALTO_NF }]), OPERADOR).ok, true);
  assert.equal(c.aplicar(lote([{ op: 'raiz', campo: 'proxima_fatura', antes: 160 + MAX_SALTO_NF, depois: 100 }]), DONO).ok, true, 'o administrador desfaz a numeração');
});

test('histórico de tabela que só o administrador muda (o Desfazer aplicaria o valor da linha) só vem dele', () => {
  const c = novo();
  const falsa = { quando: hora.toISOString(), usuario: DONO, acao: 'Alteração', tabela: 'emitentes', registro_id: 1, detalhes: { pix: { de: 'chave-do-golpista', para: 'chave-certa' } } };
  assert.throws(() => c.aplicar(lote([{ op: 'historico', entrada: falsa }]), OPERADOR), /Só o administrador/);
  assert.throws(() => c.aplicar(lote([{ op: 'historico', entrada: { ...falsa, tabela: 'usuarios', registro_id: 1 } }]), OPERADOR), /Só o administrador/);
  assert.equal(c.aplicar(lote([{ op: 'historico', entrada: { ...falsa, tabela: 'contratos', registro_id: 1 } }]), OPERADOR).ok, true);
  assert.equal(c.aplicar(lote([{ op: 'historico', entrada: falsa }]), DONO).ok, true);
});

test('faxina: excluídos (com CPF) e conflitos resolvidos saem depois do prazo', () => {
  const c = novo();
  // excluir a ficha (com os documentos pessoais) é só do administrador, como na tela (telas/fichas.js)
  assert.throws(() => c.aplicar(lote([{ op: 'excluir', tabela: 'fichas', id: 7 }]), OPERADOR), (e) => e.status === 403, 'operador não exclui ficha');
  c.aplicar(lote([{ op: 'excluir', tabela: 'fichas', id: 7 }]), DONO);
  assert.equal(c.q('SELECT COUNT(*) AS n FROM excluidos')[0].n, 1);
  const antes = hora;
  hora = new Date(antes.getTime() + 10 * 86400000); c.limpar();
  assert.equal(c.q('SELECT COUNT(*) AS n FROM excluidos')[0].n, 1, 'dentro do prazo fica');
  hora = new Date(antes.getTime() + (DIAS_EXCLUIDOS + 1) * 86400000); c.limpar();
  assert.equal(c.q('SELECT COUNT(*) AS n FROM excluidos')[0].n, 0);
  assert.doesNotMatch(JSON.stringify(c.q('SELECT * FROM excluidos')), /529\.982\.247-25/);
  hora = antes;
});

test('cota do dia por usuário: passou, o lote é recusado (429) e nada é gravado', () => {
  const c = novo();
  const grande = 'x'.repeat(1024 * 1024 - 100);
  const voltas = Math.ceil(COTA_DIA.bytes / (1024 * 1024)) + 1;
  let recusado = null;
  for (let i = 0; i < voltas && !recusado; i += 1) {
    try { c.aplicar(lote([{ op: 'historico', entrada: { tabela: 'contratos', registro_id: 1, descricao: grande } }]), OPERADOR); } catch (e) { recusado = e; }
  }
  assert.equal(recusado?.status, 429);
  // outro usuário continua gravando
  assert.equal(c.aplicar(lote([{ op: 'historico', entrada: { tabela: 'contratos', registro_id: 1, descricao: 'ok' } }]), DONO).ok, true);
});

test('cofre vazio: com DONO_EMAIL só o dono faz a primeira carga; banco sem administrador ativo não entra', () => {
  const sql = sqlFalso(); const c = new Cofre(sql, tx(sql), () => hora);
  c.dono = DONO;
  assert.throws(() => c.exigir('qualquer@exemplo.org', 'admin'), /não está ligado/);
  assert.equal(c.exigir(DONO, 'admin').papel, 'admin');
  assert.throws(() => c.importar(banco(), 'qualquer@exemplo.org'), /não está ligado/);
  const semAdmin = { ...banco(), usuarios: [{ id: 3, login: OPERADOR, papel: 'operador', ativo: true }] };
  assert.throws(() => c.importar(semAdmin, DONO), /nenhum administrador ativo/);
  assert.equal(c.importar(banco(), DONO).ok, true);
  assert.throws(() => c.importar(semAdmin, DONO, { substituir: true }), /nenhum administrador ativo/);
});

test('mutirão 19/11 (nuvem-001/003): a carga só entra se um administrador ativo dela tem o e-mail de quem a faz (senão ninguém entraria)', () => {
  const sql = sqlFalso(); const c = new Cofre(sql, tx(sql), () => hora);
  // pasta antiga com login curto e sem e-mail de acesso: recusada com a explicação, nada gravado
  const curto = { ...banco(), usuarios: [{ id: 1, login: 'julio', papel: 'admin', ativo: true, senha_hash: 'h1' }] };
  assert.throws(() => c.importar(curto, DONO), (e) => e.status === 400 && /nenhum administrador ativo tem o login ou o e-mail de acesso dono@exemplo\.com\.br/.test(e.message));
  assert.equal(c.vazio(), true);
  // o mesmo usuário com o e-mail de acesso preenchido entra (e depois o dono é reconhecido)
  const comEmail = { ...banco(), usuarios: [{ id: 1, login: 'julio', email: DONO, papel: 'admin', ativo: true, senha_hash: 'h1' }] };
  assert.equal(c.importar(comEmail, DONO).ok, true);
  assert.equal(c.exigir(DONO, 'admin').papel, 'admin');
  // substituir pela pasta errada também é recusado
  assert.throws(() => c.importar(curto, DONO, { substituir: true }), /nenhum administrador ativo tem/);
});

test('mutirão 19/11 (nuvem-002): o administrador não troca o próprio login e e-mail para algo que não seja o e-mail com que entra', () => {
  const c = novo();
  assert.throws(() => c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 1, campos: { login: { antes: DONO, depois: 'julio' } } }]), DONO), (e) => e.status === 409 && /tem de continuar dono@exemplo\.com\.br/.test(e.message));
  assert.equal(c.exigir(DONO, 'admin').papel, 'admin', 'continua entrando');
  // trocar o login mantendo o e-mail de acesso igual passa
  assert.equal(c.aplicar(lote([{ op: 'alterar', tabela: 'usuarios', id: 1, campos: { login: { antes: DONO, depois: 'julio' }, email: { antes: undefined, depois: DONO } } }]), DONO).ok, true);
  assert.equal(c.exigir(DONO, 'admin').papel, 'admin');
});

test('e-mail pela conta da empresa: só operador, registrado (destino, assunto, anexos), com limite por dia', () => {
  const c = novo();
  assert.throws(() => c.registrarEmail({ para: ['qualquer@exemplo.org'], assunto: 'Oi' }, CONSULTA), /não pode/);
  for (let i = 0; i < MAX_EMAILS_DIA; i += 1) c.registrarEmail({ para: ['maria@exemplo.com.br'], assunto: `Aviso ${i}`, anexos: ['boleto.pdf'] }, OPERADOR);
  assert.throws(() => c.registrarEmail({ para: ['maria@exemplo.com.br'], assunto: 'Mais um' }, OPERADOR), (e) => e.status === 429);
  const linha = c.q('SELECT * FROM emails_enviados ORDER BY n LIMIT 1')[0];
  assert.equal(linha.por, OPERADOR); assert.equal(linha.para, 'maria@exemplo.com.br'); assert.match(linha.anexos, /boleto\.pdf/);
});

// --------------------------------------------------------------------------- Worker (com o cofre de verdade e um R2 em memória)
function nuvem() {
  const sql = sqlFalso();
  const r2 = r2Falso();
  const dobj = new CofreDO({ storage: { sql, transactionSync: tx(sql) } }, { DADOS: r2 });
  dobj.cofre.importar(banco(), DONO);
  const COFRE = { idFromName: (x) => x, get: () => ({ fetch: (req) => dobj.fetch(req) }) };
  const env = (email) => ({ MODO_TESTE: '1', EMAIL_TESTE: email, ORIGEM: 'http://localhost', DADOS: r2, COFRE, SIMULAR_GMAIL: '1', GMAIL_REMETENTE: 'empresa@exemplo.com.br' });
  const pedir = (email, metodo, rota, { corpo, cab = {} } = {}) => W.atender(new Request(`http://localhost/api/${rota}`, {
    method: metodo, body: corpo, headers: { 'X-Sistema': 'imoveis', ...(typeof corpo === 'string' ? { 'Content-Type': 'application/json' } : {}), ...cab },
  }), env(email));
  W.esquecerPapeis(); W.esquecerCrachas(); W.esquecerPedidosPorIp();
  return { r2, dobj, pedir };
}

test('worker: consulta não manda e-mail; o do operador fica registrado no cofre', async () => {
  const { dobj, pedir } = nuvem();
  const corpo = JSON.stringify({ para: 'qualquer@exemplo.org', assunto: 'Teste', texto: 'Olá', anexos: [{ nome: 'a.pdf', tipo: 'application/pdf', base64: 'JVBERg==' }] });
  assert.equal((await pedir(CONSULTA, 'POST', 'email/enviar', { corpo })).status, 403);
  assert.equal((await pedir(OPERADOR, 'POST', 'email/enviar', { corpo })).status, 200);
  assert.equal(dobj.cofre.q('SELECT COUNT(*) AS n FROM emails_enviados')[0].n, 1);
});

test('worker: lista dos backups só para o administrador; extensão perigosa recusada (também no mover); apagar vai para a lixeira', async () => {
  const { r2, pedir } = nuvem();
  await r2.put('backups/imoveis-dados-2026-11-08.json', '{}');
  await r2.put('arquivos/Imovel 1/Inquilinos/contrato.pdf', 'pdf');
  await r2.put('arquivos/Imovel 1/nota.txt', 'texto');
  assert.equal((await pedir(CONSULTA, 'GET', 'lista/backups/')).status, 403);
  assert.equal((await pedir(DONO, 'GET', 'lista/backups/')).status, 200);
  for (const nome of ['comprovante.pdf.exe', 'abrir.hta', 'atalho.lnk', 'planta.svg.', 'pagina.xht', 'desenho.svgz']) {
    assert.equal((await pedir(OPERADOR, 'PUT', `arquivos/Imovel 1/${encodeURIComponent(nome)}`, { corpo: new Uint8Array([1, 2]) })).status, 415, nome);
  }
  assert.equal((await pedir(OPERADOR, 'POST', 'mover', { corpo: JSON.stringify({ de: 'arquivos/Imovel 1/nota.txt', para: 'arquivos/Imovel 1/nota.html' }) })).status, 415);
  assert.ok(r2.m.has('arquivos/Imovel 1/nota.txt'));
  // apagar a pasta inteira: os arquivos vão para a lixeira (somem do lugar, não do R2)
  assert.equal((await pedir(OPERADOR, 'POST', 'apagar', { corpo: JSON.stringify({ caminho: 'arquivos/Imovel 1/Inquilinos' }) })).status, 200);
  assert.ok(!r2.m.has('arquivos/Imovel 1/Inquilinos/contrato.pdf'));
  const naLixeira = caminhoNaLixeira('arquivos/Imovel 1/Inquilinos/contrato.pdf', new Date());
  assert.ok(r2.m.has(naLixeira));
  assert.equal((await pedir(OPERADOR, 'DELETE', 'arquivos/Imovel%201/nota.txt')).status, 200);
  assert.ok(r2.m.has(caminhoNaLixeira('arquivos/Imovel 1/nota.txt', new Date())));
  // a lixeira não é alcançada pelas rotas do site e sai depois de 30 dias
  assert.equal((await pedir(DONO, 'GET', `${naLixeira.split('/').map(encodeURIComponent).join('/')}`)).status, 404);
  assert.equal(await faxinaDaLixeira(r2, new Date(Date.now() + 10 * 86400000)), 0);
  assert.ok(await faxinaDaLixeira(r2, new Date(Date.now() + 31 * 86400000)) >= 2);
  assert.ok(!r2.m.has(naLixeira));
});

test('worker: /api/aparelho/ tem limite por endereço antes de ir ao cofre; crachá recusado não volta ao cofre', async () => {
  const { dobj, pedir } = nuvem();
  let idas = 0;
  const original = dobj.fetch.bind(dobj);
  dobj.fetch = (req) => { idas += 1; return original(req); };
  const cracha = `ap1_${'A'.repeat(43)}`;
  const st = [];
  for (let i = 0; i < 5; i += 1) st.push((await pedir(DONO, 'GET', 'aparelho/saude', { cab: { Authorization: `Bearer ${cracha}`, 'CF-Connecting-IP': '203.0.113.9' } })).status);
  assert.deepEqual(st, [401, 401, 401, 401, 401]);
  assert.equal(idas, 1, 'o mesmo crachá inventado foi ao cofre uma vez só');
  const entrar = [];
  for (let i = 0; i < W.LIMITE_APARELHO.entrar + 2; i += 1) entrar.push((await pedir(DONO, 'POST', 'aparelho/entrar', { corpo: JSON.stringify({ email: `x${i}@exemplo.com.br`, computador: 'PC' }), cab: { 'CF-Connecting-IP': '203.0.113.10' } })).status);
  assert.equal(entrar.at(-1), 429);
});

test('cópia aberta e anexos no site: programas e páginas ficam de fora (também com ponto no fim)', () => {
  for (const nome of ['planta.svg.', 'pagina.xht', 'desenho.svgz', 'x.exe', 'y.hta', 'z.lnk']) assert.equal(nomeAnexavel(nome), false, nome);
  for (const nome of ['contrato.pdf', 'foto.jpg', 'planilha.xlsx']) assert.equal(nomeAnexavel(nome), true, nome);
  assert.equal(copiavel('arquivos/a/x.exe'), false);
  assert.deepEqual(planoCopia([{ caminho: 'a/ok.pdf', tamanho: 1 }, { caminho: 'a/ruim.exe', tamanho: 1 }]).baixar, ['a/ok.pdf']);
});

test('ficha pela internet: PDF sem link não é gravado; link vencido mostra só a situação; faxina sem abrir a lista', async () => {
  const r2 = r2Falso(); const env = { DADOS: r2 };
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 10, 10]);
  const req = new Request('https://erp/api/ficha-online/pdf?ficha=9&pessoa=interessado', { method: 'PUT', body: pdf });
  await assert.rejects(guardarPdf(req, env, new URL(req.url)), /Link não encontrado/);
  assert.equal(r2.m.has('publico/fichas/9/interessado.pdf'), false);
  // link vencido ontem: a página não recebe CPF nem renda
  const chave = 'C'.repeat(43); const hash = await hashDaChave(chave);
  const reg = { ficha_id: 9, pessoa: 'interessado', hash, contexto: { empresa: 'Empresa Teste', nome: 'Maria Exemplo', imovel: 'Rua Teste, 1', proposta: [], documentos: [] },
    formulario: [{ nome: 'inquilino_cpf', rotulo: 'CPF', tipo: 'cpf' }], valores_iniciais: { inquilino_cpf: '529.982.247-25' }, respostas: [], arquivos: [{ documento: 'RG', em: 'x' }],
    situacao: 'Aguardando', vence_em: new Date(Date.now() - 86400000).toISOString(), faltando: [] };
  await r2.put('publico/fichas/9/interessado.json', JSON.stringify(reg));
  await r2.put(`publico/tokens/${hash}`, JSON.stringify({ ficha_id: 9, pessoa: 'interessado' }));
  const r = await (await lerFichaPublica(new Request('https://ficha/api/publico/ficha', { headers: { 'X-Ficha-Token': chave } }), env)).json();
  assert.equal(r.vencido, true);
  assert.doesNotMatch(JSON.stringify(r), /529\.982\.247-25|Rua Teste/);
  // faxina: passado da guarda, sai o registro, o ponteiro e o PDF; PDF solto também
  await r2.put('publico/fichas/10/interessado.pdf', pdf);
  await r2.put('publico/fichas/9/interessado.json', JSON.stringify({ ...reg, vence_em: new Date(Date.now() - 100 * 86400000).toISOString() }));
  assert.ok(await faxinaDosLinks(env) >= 2);
  assert.equal([...r2.m.keys()].filter((k) => k.startsWith('publico/')).length, 0);
});
