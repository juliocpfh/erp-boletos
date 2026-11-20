// Mutirão de 19–20/11, lote D (ficha pela internet, fichas e comunicados): conferência do que a pessoa digita no link da
// ficha (CPF, e-mail, telefone, nascimento), documento pedido que chega sai do "Falta mandar", código que não saiu não conta,
// comprovante anotado, a mesma pessoa em dois contratos, histórico do comunicado sem a lista inteira, e-mail da ficha
// reprovada com a reserva já devolvida. Dados fictícios (CPF de teste 529.982.247-25).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as CP from '../nuvem/contatos-publico.mjs';
import * as FP from '../nuvem/ficha-publica.mjs';
import * as W from '../nuvem/worker.mjs';
import * as CM from '../docs/js/comunicados.js';
import * as FO from '../docs/js/ficha-online.js';
import * as ED from '../docs/js/email-dados.js';
import * as ME from '../docs/js/modelos-email.js';
import * as R from '../docs/js/regras.js';
import { r2Falso } from './r2-falso.mjs';

const ERP = 'http://localhost:8787';
const FICHA = 'https://ficha.ankjck.com.br';

// ---------------------------------------------------------------------------
// Ficha pela internet: o que a pessoa digita
// ---------------------------------------------------------------------------
test('ficha pela internet: CPF com dígitos errados, e-mail incompleto, telefone sem DDD e nascimento no futuro são recusados', () => {
  const f = [
    { nome: 'inquilino_cpf', rotulo: 'CPF', tipo: 'cpf' }, { nome: 'inquilino_email', rotulo: 'E-mail', tipo: 'email' },
    { nome: 'inquilino_telefone', rotulo: 'Telefone', tipo: 'tel' }, { nome: 'inquilino_nascimento', rotulo: 'Nascimento', tipo: 'data' },
    { nome: 'renda_desde_data', rotulo: 'Desde', tipo: 'data' }, { nome: 'fiador_doc', rotulo: 'CPF ou CNPJ', tipo: 'cpfcnpj' },
  ];
  const ok = FP.valoresValidos(f, { inquilino_cpf: '52998224725', inquilino_email: 'Carlos@Exemplo.com.br', inquilino_telefone: '41999990001', inquilino_nascimento: '1990-05-10', fiador_doc: '11222333000181' }, { conferir: true });
  assert.equal(ok.inquilino_cpf, '529.982.247-25');
  assert.equal(ok.inquilino_email, 'carlos@exemplo.com.br');
  assert.equal(ok.inquilino_telefone, '(41) 99999-0001');
  assert.equal(ok.fiador_doc, '11.222.333/0001-81');
  assert.throws(() => FP.valoresValidos(f, { inquilino_cpf: '11111111111' }, { conferir: true }), /CPF inválido/);
  assert.throws(() => FP.valoresValidos(f, { inquilino_email: 'email-errado' }, { conferir: true }), /E-mail incompleto/);
  assert.throws(() => FP.valoresValidos(f, { inquilino_telefone: '123' }, { conferir: true }), /10 ou 11 números/);
  assert.throws(() => FP.valoresValidos(f, { inquilino_nascimento: '2099-01-01' }, { conferir: true }), /data do passado/);
  // data que não é de nascimento pode ser futura; os valores da equipe (sem conferir) passam como estão
  assert.equal(FP.valoresValidos(f, { renda_desde_data: '2099-01-01' }, { conferir: true }).renda_desde_data, '2099-01-01');
  assert.equal(FP.valoresValidos(f, { inquilino_cpf: '11111111111' }).inquilino_cpf, '11111111111');
});

test('trazer para a ficha: o que não passa na conferência é apontado e o CPF vem com pontos', () => {
  assert.match(FO.problemaDoEnviado({ tipo: 'cpf' }, '11111111111'), /CPF inválido/);
  assert.equal(FO.problemaDoEnviado({ tipo: 'cpf' }, '529.982.247-25'), '');
  assert.match(FO.problemaDoEnviado({ tipo: 'email' }, 'email-errado'), /E-mail/);
  assert.match(FO.problemaDoEnviado({ tipo: 'tel' }, '123'), /Telefone/);
  assert.match(FO.problemaDoEnviado({ tipo: 'data', nome: 'inquilino_nascimento' }, '2030-01-01', '2026-11-20'), /futuro/);
  assert.equal(FO.problemaDoEnviado({ tipo: 'data', nome: 'renda_desde' }, '2030-01-01', '2026-11-20'), '');
  assert.equal(FO.formatarEnviado({ tipo: 'cpf' }, '52998224725'), '529.982.247-25');
  assert.equal(FO.formatarEnviado({ tipo: 'tel' }, '41999990000'), '(41) 99999-0000');
});

function ambienteFicha() {
  const env = { MODO_TESTE: '1', EMAIL_TESTE: 'dono@exemplo.com.br', ORIGEM: ERP, URL_FICHA: `${FICHA}/`, HOST_FICHA: 'ficha.ankjck.com.br', DADOS: r2Falso() };
  const equipe = (metodo, caminho, corpo) => W.atender(new Request(`${ERP}/api/ficha-online/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: ERP } : {},
  }), env);
  const publico = (chave, metodo, caminho, corpo) => FP.atenderFicha(new Request(`${FICHA}/api/publico/${caminho}`, {
    method: metodo, body: corpo, headers: { 'X-Ficha-Token': chave, ...(metodo !== 'GET' ? { 'X-Ficha': '1', Origin: FICHA } : {}) },
  }), env);
  return { env, equipe, publico };
}

test('ficha pela internet: o documento pedido que chega sai do "Falta mandar"; zerada a lista, volta a "Respondida"', async () => {
  const ctx = ambienteFicha();
  const docs = ['Documento com foto e CPF (RG ou CNH)', 'Extrato do FGTS'];
  const r = await ctx.equipe('POST', 'link', {
    ficha_id: 9, pessoa: 'interessado', pasta: 'arquivos/Fichas em analise/Carlos Teste (ficha 19-11-2026)', formulario: [{ nome: 'inquilino_nome', rotulo: 'Nome', tipo: 'texto' }], valores: {},
    contexto: { empresa: 'ANK', nome: 'Carlos Teste', imovel: 'Rua Exemplo, 100', documentos: docs },
  });
  const chave = (await r.json()).url.split('#')[1];
  assert.equal((await ctx.equipe('POST', 'atualizar', { ficha_id: 9, pessoa: 'interessado', situacao: 'Falta documento', faltando: docs })).status, 200);
  const pdf = new TextEncoder().encode('%PDF-1.4 teste');
  const um = await (await ctx.publico(chave, 'PUT', `ficha/arquivo?documento=${encodeURIComponent(docs[0])}&nome=rg.pdf`, pdf)).json();
  assert.equal(um.situacao, 'Falta documento');
  assert.deepEqual(um.faltando, ['Extrato do FGTS']);
  const dois = await (await ctx.publico(chave, 'PUT', `ficha/arquivo?documento=${encodeURIComponent(docs[1])}&nome=fgts.pdf`, pdf)).json();
  assert.equal(dois.situacao, 'Respondida');
  assert.deepEqual(dois.faltando, []);
  // o Painel sabe quando chegou o último arquivo (para dizer "mandou documentos" e não "mandou dados")
  const lista = await (await ctx.equipe('GET', 'lista')).json();
  assert.ok(lista.links[0].ultimo_arquivo);
});

test('política de privacidade cita o endereço de internet, o aparelho e a assinatura guardados na confirmação de contatos', async () => {
  const t = await FP.paginaPrivacidade().text();
  assert.match(t, /endereço de internet \(IP\)/);
  assert.match(t, /assinatura desenhada/);
  assert.match(t, /ERP Imoveis/);
});

// ---------------------------------------------------------------------------
// Confirmação de contatos (página pública)
// ---------------------------------------------------------------------------
const CONTEXTO = {
  empresas: ['ANK Administradora Ltda'], cnpjs: ['11.222.333/0001-81'], cidade: 'Curitiba/PR', logo: '', titulo: 'Novo e-mail', nome: 'Diego Teste', tipo: 'fiador',
  imovel: 'Rua Exemplo, 100', email: 'diego@exemplo.com.br', telefone: '(41) 99999-0000', whatsapp: false, prazo: '2099-11-28', aviso: 'Nossos e-mails mudaram.',
  ciencia: 'Li e concordo.', email_empresa: 'administracao@exemplo.com.br', telefone_empresa: '(41) 3333-0000',
};
function ambienteContatos() {
  const env = { MODO_TESTE: '1', EMAIL_TESTE: 'dono@exemplo.com.br', ORIGEM: ERP, URL_FICHA: `${FICHA}/`, HOST_FICHA: 'ficha.ankjck.com.br', SIMULAR_GMAIL: '1', GMAIL_REMETENTE: 'administracao@exemplo.com.br', DADOS: r2Falso() };
  const equipe = (metodo, caminho, corpo) => W.atender(new Request(`${ERP}/api/contatos/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo), headers: metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: ERP } : {},
  }), env);
  const publico = (chave, metodo, caminho, corpo) => FP.atenderFicha(new Request(`${FICHA}/api/publico/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    headers: { 'X-Ficha-Token': chave, ...(metodo !== 'GET' ? { 'X-Ficha': '1', Origin: FICHA } : {}), 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'Teste/1.0' },
  }), env);
  return { env, equipe, publico };
}
/** Roda ``fn`` pegando o que o Gmail simulado escreveria; ``falhar``: o envio dá erro. */
async function comEmail(fn, { falhar = false } = {}) {
  const linhas = []; const velho = console.log; const aviso = console.warn;
  console.log = (...a) => { if (falhar) throw new Error('Gmail fora do ar'); linhas.push(a.join(' ')); };
  console.warn = () => {};
  try { await fn(); } finally { console.log = velho; console.warn = aviso; }
  return linhas.join('\n');
}

test('contatos: código que não saiu (falha no e-mail) não conta no limite nem obriga a esperar 1 minuto', async () => {
  const ctx = ambienteContatos();
  const chave = (await (await ctx.equipe('POST', 'link', { comunicado_id: 4, destino: 'f5', contexto: CONTEXTO })).json()).url.split('#')[1];
  let status;
  await comEmail(async () => { status = (await ctx.publico(chave, 'POST', 'contatos/codigo', { email: 'diego@exemplo.com.br' })).status; }, { falhar: true });
  assert.equal(status, 502);
  let lista = await (await ctx.equipe('GET', 'lista?comunicado=4')).json();
  assert.equal(lista.links[0].codigos_enviados, 0, 'o pedido que falhou saiu da conta');
  const saida = await comEmail(async () => { status = (await ctx.publico(chave, 'POST', 'contatos/codigo', { email: 'diego@exemplo.com.br' })).status; });
  assert.equal(status, 200, 'pode pedir de novo na hora');
  const codigo = saida.match(/Seu código de confirmação: (\d{6})/)[1];
  lista = await (await ctx.equipe('GET', 'lista?comunicado=4')).json();
  assert.equal(lista.links[0].codigos_enviados, 1);
  // confirma: o comprovante sai com o celular formatado e fica anotado (quem reabre o link vê que saiu)
  let resp;
  const mails = await comEmail(async () => {
    resp = await (await ctx.publico(chave, 'POST', 'contatos/confirmar', { email: 'diego@exemplo.com.br', codigo, telefone: '41988887777', melhor: 'E-mail', ciente: true })).json();
  });
  assert.equal(resp.comprovante, true);
  assert.match(mails, /Comprovante: contatos confirmados/);
  const pagina = await (await ctx.publico(chave, 'GET', 'contatos')).json();
  assert.equal(pagina.resposta.comprovante, true);
});

test('contatos: telefone do comprovante formatado', () => {
  assert.equal(CP.foneBr('41999990000'), '(41) 99999-0000');
  assert.equal(CP.foneBr('554133330000'), '(41) 3333-0000');
});

test('contatos: a página não tem barra invertida no script e a assinatura sai em tinta escura sobre branco', async () => {
  const html = await CP.paginaDosContatos().text();
  const script = html.slice(html.indexOf('<script'), html.lastIndexOf('</script>'));
  assert.ok(!script.includes('\\'), 'sem barra invertida no script');
  assert.match(script, /strokeStyle = '#111111'/);
  assert.match(script, /fillStyle = '#ffffff'/);
  assert.match(script, /ligue para /);
});

// ---------------------------------------------------------------------------
// Comunicados (site)
// ---------------------------------------------------------------------------
function bancoComDoisContratos() {
  const d = R.normalizar({});
  const i1 = R.inserir(d, 'imoveis', { nome: 'Apto 101', endereco: 'Rua Exemplo, 100' }, 'teste');
  const i2 = R.inserir(d, 'imoveis', { nome: 'Apto 202', endereco: 'Rua Exemplo, 100' }, 'teste');
  const base = { inquilino_nome: 'Ana Teste', inquilino_cpf: '529.982.247-25', inquilino_email: 'ana@exemplo.com.br', inquilino_telefone: '(41) 99999-0000', data_entrada: '2026-01-10', aluguel_inicial: 150000, dia_vencimento: 10 };
  const c1 = R.inserir(d, 'contratos', { ...base, imovel_id: i1.id }, 'teste');
  const c2 = R.inserir(d, 'contratos', { ...base, imovel_id: i2.id }, 'teste');
  return { d, c1, c2 };
}

test('comunicado: quem aluga dois imóveis confirma um link e os dois contratos recebem os contatos novos', () => {
  const { d, c1, c2 } = bancoComDoisContratos();
  assert.ok(R.contratoAtivo(c1, '2026-11-20'));
  assert.deepEqual(CM.mesmaPessoaEmOutrosContratos(d, { tipo: 'inquilino', contrato_id: c1.id }, '2026-11-20').map((x) => x.contrato_id), [c2.id]);
  const com = R.inserir(d, 'comunicados', { titulo: 'Contatos', prazo: '2099-11-28', destinos: [{ chave: `c${c1.id}`, tipo: 'inquilino', contrato_id: c1.id, nome: 'Ana Teste' }, { chave: `c${c2.id}`, tipo: 'inquilino', contrato_id: c2.id, nome: 'Ana Teste' }] }, 'teste');
  const n = CM.juntarRespostas(d, com.id, [{ destino: `c${c1.id}`, aberto_em: '2026-11-20T10:00:00Z', resposta: { em: '2026-11-20T10:05:00Z', email: 'ana.nova@exemplo.com.br', telefone: '41988887777', whatsapp: true } }], 'teste');
  assert.equal(n, 2);
  assert.equal(R.buscar(d, 'contratos', c2.id).inquilino_email, 'ana.nova@exemplo.com.br');
  assert.equal(R.buscar(d, 'contratos', c2.id).inquilino_telefone, '(41) 98888-7777');
});

test('comunicado no histórico: só a pessoa que mudou, sem a assinatura e o texto aceito', () => {
  const pessoas = Array.from({ length: 40 }, (_, k) => ({ chave: `c${k + 1}`, nome: `Pessoa ${k + 1}`, resposta: k < 20 ? { em: 'x', assinatura: `data:image/png;base64,${'A'.repeat(5000)}`, texto_aceito: 'T'.repeat(7000) } : null }));
  const depois = pessoas.map((x) => (x.chave === 'c30' ? { ...x, email_em: '2026-11-20T10:00:00Z' } : x));
  const h = R.destinosParaHistorico(pessoas, depois);
  assert.equal(h.de.length, 1);
  assert.equal(h.para.length, 1);
  assert.equal(h.para[0].email_em, '2026-11-20T10:00:00Z');
  const comAss = R.destinosParaHistorico(pessoas, pessoas.map((x) => (x.chave === 'c1' ? { ...x, aplicado_em: 'y' } : x)));
  assert.equal(comAss.para[0].resposta.assinatura, '(guardado só no comunicado)');
  assert.ok(JSON.stringify(comAss).length < 2000, 'sem a lista inteira nem as imagens');
});

test('comunicado: o texto do e-mail e do WhatsApp diz "ligue para" o telefone', () => {
  const m = CM.MODELOS.contatos;
  for (const t of [m.texto, m.whatsapp, m.aviso]) assert.match(t, /ligue para \{telefone_empresa\}/);
});

test('e-mail "ficha reprovada": com a reserva já devolvida diz a data; sem devolução, mantém o prazo de 24 horas úteis', () => {
  const d = R.normalizar({});
  const base = { id: 1, inquilino_nome: 'Carlos Teste', imoveis_ids: [], reserva_valor: 100000, situacao: 'Reprovada' };
  const modelo = ME.modeloEmail(d, 'ficha_reprovada');
  const sem = ME.preencherEmail(modelo.texto, ED.dadosDoEmail(d, { ficha: base }));
  assert.match(sem, /será devolvida em até 24 horas úteis/);
  const com = ME.preencherEmail(modelo.texto, ED.dadosDoEmail(d, { ficha: { ...base, devolucao_data: '2026-11-18', devolucao_valor: 100000 } }));
  assert.match(com, /já foi devolvida em 18\/11\/2026/);
  assert.doesNotMatch(com, /será devolvida/);
});
