// Ficha cadastral pela internet (nuvem/ficha-publica.mjs): link criado pela equipe, página pública com a chave, envio dos
// dados e dos documentos, desistência, prazo, e o que é recusado (sem chave, chave errada, arquivo que não é PDF/foto,
// campo fora do formulário). Dados fictícios (CPF de teste).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as FP from '../nuvem/ficha-publica.mjs';
import * as W from '../nuvem/worker.mjs';
import { r2Falso } from './r2-falso.mjs';

const ERP = 'http://localhost:8787';
const FICHA = 'https://ficha.ankjck.com.br';
const PASTA = 'arquivos/Fichas em analise/Maria Souza (ficha 14-11-2026)';
const FORMULARIO = [
  { secao: 'Seus dados' },
  { nome: 'inquilino_nome', rotulo: 'Nome completo', tipo: 'texto', obrig: true },
  { nome: 'inquilino_cpf', rotulo: 'CPF', tipo: 'cpf' },
  { nome: 'inquilino_estado_civil', rotulo: 'Estado civil', tipo: 'opcao', opcoes: ['Solteiro(a)', 'Casado(a)'] },
  { nome: 'renda_mensal', rotulo: 'Renda mensal', tipo: 'dinheiro' },
  { nome: 'inquilino_nascimento', rotulo: 'Nascimento', tipo: 'data' },
  { secao: 'Cônjuge', mostrarSe: { campo: 'inquilino_estado_civil', valores: ['Casado(a)'] } },
  { nome: 'conjuge_nome', rotulo: 'Nome do cônjuge', tipo: 'texto', mostrarSe: { campo: 'inquilino_estado_civil', valores: ['Casado(a)'] } },
];
const PDF = new TextEncoder().encode('%PDF-1.4 teste');

function ambiente() {
  const env = { MODO_TESTE: '1', EMAIL_TESTE: 'dono@exemplo.com.br', ORIGEM: ERP, URL_FICHA: `${FICHA}/`, HOST_FICHA: 'ficha.ankjck.com.br', DADOS: r2Falso() };
  const equipe = (metodo, caminho, corpo) => W.atender(new Request(`${ERP}/api/ficha-online/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : typeof corpo === 'string' || corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo),
    headers: metodo !== 'GET' ? { 'X-Sistema': 'imoveis', Origin: ERP } : {},
  }), env);
  const avisos = [];
  const publico = (chave, metodo, caminho, corpo, cab = {}) => FP.atenderFicha(new Request(`${FICHA}/api/publico/${caminho}`, {
    method: metodo, body: corpo === undefined ? undefined : typeof corpo === 'string' || corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo),
    headers: { ...(chave ? { 'X-Ficha-Token': chave } : {}), ...(metodo !== 'GET' ? { 'X-Ficha': '1', Origin: FICHA } : {}), ...cab },
  }), env, { avisar: async (_env, reg, evento) => { avisos.push([reg.pessoa, evento]); } });
  return { env, equipe, publico, avisos };
}

async function criar(ctx, extra = {}) {
  const r = await ctx.equipe('POST', 'link', {
    ficha_id: 7, pessoa: 'interessado', pasta: PASTA, formulario: FORMULARIO, valores: { inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25', campo_estranho: 'x' },
    contexto: { empresa: 'ANK', nome: 'Maria Souza', imovel: 'Rua das Flores, 120', reserva: 'R$ 1.000,00', documentos: ['Documento com foto e CPF (RG ou CNH)', '3 últimos holerites'], dica: 'PDF original' },
    ...extra,
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.match(d.url, /^https:\/\/ficha\.ankjck\.com\.br\/#[A-Za-z0-9_-]{43}$/);
  return d.url.split('#')[1];
}

test('equipe cria o link; a página lê o contexto e os dados já sabidos; a chave não fica guardada', async () => {
  const ctx = ambiente();
  const chave = await criar(ctx);
  const r = await ctx.publico(chave, 'GET', 'ficha');
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.contexto.imovel, 'Rua das Flores, 120');
  assert.deepEqual(d.valores, { inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25' }, 'campo fora do formulário não entra');
  assert.equal(d.situacao, 'Aguardando');
  const guardado = [...ctx.env.DADOS.m.keys()];
  assert.ok(guardado.includes('publico/fichas/7/interessado.json'));
  assert.ok(!guardado.some((k) => k.includes(chave)), 'só o hash da chave');
  assert.ok(![...ctx.env.DADOS.m.values()].some((o) => new TextDecoder().decode(o.dados).includes(chave)));
  // sem chave, chave errada: recusa
  assert.equal((await ctx.publico(null, 'GET', 'ficha')).status, 404);
  assert.equal((await ctx.publico('A'.repeat(43), 'GET', 'ficha')).status, 404);
  // a página: CSP com nonce, sem nada de fora
  const pag = await FP.atenderFicha(new Request(`${FICHA}/`), ctx.env);
  assert.equal(pag.status, 200);
  assert.match(pag.headers.get('Content-Security-Policy'), /script-src 'nonce-[^']+'; .*connect-src 'self'/);
  assert.match(await pag.text(), /<script nonce="[A-Za-z0-9_-]+">/);
});

test('envio dos dados: conferidos pelo tipo, exige a declaração e os obrigatórios; vira resposta, não muda a ficha', async () => {
  const ctx = ambiente();
  const chave = await criar(ctx);
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'Maria' } })).status, 400, 'sem a declaração');
  assert.match((await (await ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: '' }, declaracao: true })).json()).erro, /Preencha: Nome completo/);
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'Maria', inquilino_estado_civil: 'Viúva' }, declaracao: true })).status, 400, 'opção fora da lista');
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'Maria', renda_mensal: 12.5 }, declaracao: true })).status, 400, 'centavos inteiros');
  const ok = await ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'Maria Souza', renda_mensal: 1500000, inquilino_nascimento: '1990-05-01', inquilino_estado_civil: 'Casado(a)', conjuge_nome: 'Pedro', outro: 'x' }, declaracao: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(ctx.avisos, [['interessado', 'enviou']]);
  const lista = await (await ctx.equipe('GET', 'lista?ficha=7')).json();
  const link = lista.links[0];
  assert.equal(link.situacao, 'Respondida');
  assert.equal(link.hash, undefined, 'a equipe não recebe o hash');
  assert.deepEqual(link.respostas[0].valores, { inquilino_nome: 'Maria Souza', renda_mensal: 1500000, inquilino_nascimento: '1990-05-01', inquilino_estado_civil: 'Casado(a)', conjuge_nome: 'Pedro' });
  // a página mostra o que foi enviado por último
  assert.equal((await (await ctx.publico(chave, 'GET', 'ficha')).json()).valores.renda_mensal, 1500000);
  // gravação sem o cabeçalho da página: recusada
  assert.equal((await FP.atenderFicha(new Request(`${FICHA}/api/publico/ficha/desistir`, { method: 'POST', headers: { 'X-Ficha-Token': chave } }), ctx.env)).status, 403);
});

test('documentos: só PDF, JPG ou PNG pelos bytes, até 10 MB, com nome dado pelo servidor na pasta da ficha', async () => {
  const ctx = ambiente();
  const chave = await criar(ctx);
  const r = await ctx.publico(chave, 'PUT', `ficha/arquivo?documento=${encodeURIComponent('3 últimos holerites')}&nome=holerite%20outubro.pdf`, PDF);
  assert.equal(r.status, 200);
  const doDia = (k) => k.startsWith(PASTA + '/link-3-ultimos-holerites-' + new Date().toISOString().slice(0, 10) + '-') && /-[0-9a-f]{6}\.pdf$/.test(k);
  assert.equal([...ctx.env.DADOS.m.keys()].filter(doDia).length, 1);
  assert.equal((await ctx.publico(chave, 'PUT', `ficha/arquivo?documento=${encodeURIComponent('3 últimos holerites')}&nome=b.pdf`, PDF)).status, 200);
  assert.equal([...ctx.env.DADOS.m.keys()].filter(doDia).length, 2, 'não apaga o anterior');
  assert.equal((await ctx.publico(chave, 'PUT', `ficha/arquivo?documento=${encodeURIComponent('Documento com foto e CPF (RG ou CNH)')}&nome=a.html`, new TextEncoder().encode('<html><script>'))).status, 415);
  assert.equal((await ctx.publico(chave, 'PUT', 'ficha/arquivo?documento=Qualquer%20coisa', PDF)).status, 400, 'documento fora da lista');
  assert.equal((await ctx.publico(chave, 'PUT', `ficha/arquivo?documento=${encodeURIComponent('Documento com foto e CPF (RG ou CNH)')}`, new Uint8Array(FP.MAX_DOCUMENTO + 1).fill(0x25))).status, 413);
  // pessoa física: documento de outro tipo de renda (a pessoa mudou o tipo na página) é aceito
  const comListas = ambiente();
  const ch = await criar(comListas, { contexto: { documentos: ['Documento com foto e CPF (RG ou CNH)'], listas: { inicio: ['Documento com foto e CPF (RG ou CNH)'], conjuge: [], renda_padrao: [], fim: [], renda: { 'Aposentado / pensionista': ['Extrato do benefício'] } } } });
  assert.equal((await comListas.publico(ch, 'PUT', `ficha/arquivo?documento=${encodeURIComponent('Extrato do benefício')}`, PDF)).status, 200);
  // a ficha assinada muda a situação
  assert.equal((await ctx.publico(chave, 'PUT', 'ficha/arquivo?documento=assinada&nome=ficha.pdf', PDF)).status, 200);
  const d = await (await ctx.publico(chave, 'GET', 'ficha')).json();
  assert.equal(d.situacao, 'Assinada');
  assert.deepEqual(d.arquivos.map((a) => a.documento), ['3 últimos holerites', '3 últimos holerites', 'Ficha cadastral assinada']);
  assert.deepEqual(ctx.avisos.map((x) => x[1]), ['documento', 'documento', 'assinou']);
});

test('equipe: falta documento, assinar, PDF para baixar, link renovado e encerrado; prazo de 7 dias', async () => {
  const ctx = ambiente();
  const chave = await criar(ctx);
  assert.equal((await ctx.equipe('POST', 'atualizar', { ficha_id: 7, pessoa: 'interessado', situacao: 'Falta documento', faltando: ['Comprovante de residência'] })).status, 200);
  let d = await (await ctx.publico(chave, 'GET', 'ficha')).json();
  assert.deepEqual([d.situacao, d.faltando], ['Falta documento', ['Comprovante de residência']]);
  assert.equal((await ctx.equipe('POST', 'atualizar', { ficha_id: 7, pessoa: 'interessado', situacao: 'Desistiu' })).status, 400, 'desistência é só da pessoa');
  assert.equal((await ctx.equipe('PUT', 'pdf?ficha=7&pessoa=interessado', new TextEncoder().encode('não é pdf'))).status, 400);
  assert.equal((await ctx.equipe('PUT', 'pdf?ficha=7&pessoa=interessado', PDF)).status, 200);
  const pdf = await ctx.publico(chave, 'GET', 'ficha/pdf');
  assert.equal(pdf.headers.get('Content-Type'), 'application/pdf');
  // renovar: a chave antiga deixa de valer, as respostas continuam
  await ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'Maria Souza' }, declaracao: true });
  const nova = await criar(ctx);
  assert.equal((await ctx.publico(chave, 'GET', 'ficha')).status, 404);
  d = await (await ctx.publico(nova, 'GET', 'ficha')).json();
  assert.equal(d.enviado_em !== null, true);
  // prazo vencido: lê, mas não grava
  const reg = JSON.parse(new TextDecoder().decode(ctx.env.DADOS.m.get('publico/fichas/7/interessado.json').dados));
  reg.vence_em = new Date(Date.now() - 86400000).toISOString();
  await ctx.env.DADOS.put('publico/fichas/7/interessado.json', JSON.stringify(reg));
  assert.equal((await (await ctx.publico(nova, 'GET', 'ficha')).json()).vencido, true);
  assert.equal((await ctx.publico(nova, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'M' }, declaracao: true })).status, 410);
  // 30 dias depois do prazo, nem lê; 90 dias depois, o registro sai na próxima lista da equipe
  reg.vence_em = new Date(Date.now() - 31 * 86400000).toISOString();
  await ctx.env.DADOS.put('publico/fichas/7/interessado.json', JSON.stringify(reg));
  assert.equal((await ctx.publico(nova, 'GET', 'ficha')).status, 410);
  reg.vence_em = new Date(Date.now() - 91 * 86400000).toISOString();
  await ctx.env.DADOS.put('publico/fichas/7/interessado.json', JSON.stringify(reg));
  assert.deepEqual((await (await ctx.equipe('GET', 'lista')).json()).links, []);
  assert.ok(![...ctx.env.DADOS.m.keys()].some((k) => k.startsWith('publico/fichas/7/') || k.startsWith('publico/tokens/')), 'registro, PDF e ponteiro saíram');
  // de volta no prazo para o resto do teste
  reg.vence_em = new Date(Date.now() + 86400000).toISOString();
  await ctx.env.DADOS.put('publico/fichas/7/interessado.json', JSON.stringify(reg));
  // encerrado: nem lê
  await ctx.equipe('POST', 'atualizar', { ficha_id: 7, pessoa: 'interessado', situacao: 'Encerrado' });
  assert.equal((await ctx.publico(nova, 'GET', 'ficha')).status, 404);
});

test('desistência pelo link: a equipe vê e recebe o aviso; depois não grava mais', async () => {
  const ctx = ambiente();
  const chave = await criar(ctx);
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/desistir')).status, 200);
  assert.deepEqual(ctx.avisos, [['interessado', 'desistiu']]);
  const resumo = await (await ctx.equipe('GET', 'lista')).json();
  assert.equal(resumo.links[0].situacao, 'Desistiu');
  assert.ok(resumo.links[0].desistiu_em);
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'M' }, declaracao: true })).status, 409);
});

test('o endereço da ficha não abre o sistema; as rotas da equipe pedem login e papel', async () => {
  const ctx = ambiente();
  // no endereço da ficha, /api/dados/… não existe
  const r = await W.default.fetch(new Request(`${FICHA}/api/dados/tudo`), ctx.env);
  assert.equal(r.status, 404);
  // a pasta precisa ser da ficha
  const fora = await ctx.equipe('POST', 'link', { ficha_id: 7, pessoa: 'interessado', pasta: 'arquivos/Imovel 1', formulario: FORMULARIO, contexto: {} });
  assert.equal(fora.status, 400);
  const subir = await ctx.equipe('POST', 'link', { ficha_id: 7, pessoa: 'interessado', pasta: 'arquivos/Fichas em analise/../Imovel', formulario: FORMULARIO, contexto: {} });
  assert.equal(subir.status, 400);
  // equipe sem o cabeçalho do sistema: recusado
  const semCab = await W.atender(new Request(`${ERP}/api/ficha-online/link`, { method: 'POST', body: '{}' }), ctx.env);
  assert.equal(semCab.status, 403);
  // fora do computador, sem Access: recusa
  assert.equal((await W.atender(new Request('https://erp.ankjck.com.br/api/ficha-online/lista'), { ...ctx.env })).status, 503);
});

test('página: o script não tem barra invertida (ela some ao servir a página e o documento da lista virava "d0")', async () => {
  const ctx = ambiente();
  const html = await (await FP.atenderFicha(new Request(`${FICHA}/`), ctx.env)).text();
  const script = html.slice(html.indexOf('<script'), html.lastIndexOf('</script>'));
  // no código-fonte: o texto da página (do "const PAGINA" até o fim) não pode ter barra invertida
  const fonte = (await import('node:fs')).readFileSync(new URL('../nuvem/ficha-publica.mjs', import.meta.url), 'utf8');
  assert.ok(!fonte.slice(fonte.indexOf('const PAGINA = `')).includes(String.fromCharCode(92)), 'barra invertida no texto da página');
  assert.match(script, /listaDesenhada\[Number\(qual\.slice\(1\)\)\]/, 'o documento enviado é o nome da lista desenhada');
});

test('ficha nova com o código de uma ficha que saiu (outra pasta): o link começa do zero, sem os arquivos da antiga', async () => {
  const ctx = ambiente();
  const chave = await criar(ctx);
  assert.equal((await ctx.publico(chave, 'PUT', 'ficha/arquivo?documento=outro&nome=antigo.pdf', PDF)).status, 200);
  assert.equal((await ctx.publico(chave, 'POST', 'ficha/enviar', { valores: { inquilino_nome: 'Maria Souza' }, declaracao: true })).status, 200);
  // mesma ficha (mesma pasta): o link renovado guarda o que já veio
  const renovada = await criar(ctx);
  assert.equal((await (await ctx.publico(renovada, 'GET', 'ficha')).json()).arquivos.length, 1);
  // outra ficha com o mesmo código: nada da antiga
  const nova = await criar(ctx, { pasta: 'arquivos/Fichas em analise/Joao Lima (ficha 16-11-2026)' });
  const d = await (await ctx.publico(nova, 'GET', 'ficha')).json();
  assert.equal(d.arquivos.length, 0);
  assert.equal(d.enviado_em, null);
  assert.equal(d.situacao, 'Aguardando');
  ctx.avisos.length = 0;
  assert.equal((await ctx.publico(nova, 'PUT', 'ficha/arquivo?documento=outro&nome=novo.pdf', PDF)).status, 200);
  assert.deepEqual(ctx.avisos, [['interessado', 'documento']], 'o primeiro documento da ficha nova avisa');
  assert.equal((await ctx.publico(renovada, 'GET', 'ficha')).status, 404, 'o link da antiga não vale mais');
});

test('política de privacidade: página pública no endereço da ficha, sem script, sem precisar do armazenamento', async () => {
  const r = await FP.atenderFicha(new Request('https://ficha.ankjck.com.br/privacidade'), {});
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type'), /text\/html/);
  assert.match(r.headers.get('Content-Security-Policy'), /default-src 'none'/);
  const html = await r.text();
  assert.match(html, /Política de privacidade/);
  assert.match(html, /não lê/);
  assert.doesNotMatch(html, /<script/);
  // outro método continua recusado
  const p = await FP.atenderFicha(new Request('https://ficha.ankjck.com.br/privacidade', { method: 'POST' }), { DADOS: {} });
  assert.equal(p.status, 404);
});

test('entrada-007: mandar de novo (manter) deixa o link antigo valendo e não muda a validade; encerrar mata os dois', async () => {
  const ctx = ambiente();
  const primeira = await criar(ctx);
  const ler = () => JSON.parse(new TextDecoder().decode(ctx.env.DADOS.m.get('publico/fichas/7/interessado.json').dados));
  const vence = ler().vence_em;
  // um dia depois: a validade continua a do primeiro link
  const reg = ler(); reg.vence_em = new Date(Date.parse(vence) - 86400000).toISOString(); await ctx.env.DADOS.put('publico/fichas/7/interessado.json', JSON.stringify(reg));
  const venceAntes = ler().vence_em;
  const r = await ctx.equipe('POST', 'link', { ficha_id: 7, pessoa: 'interessado', pasta: PASTA, formulario: FORMULARIO, valores: {}, contexto: { nome: 'Maria Souza' }, manter: true });
  const { url, vence_em: venceNovo } = await r.json();
  const segunda = url.split('#')[1];
  assert.equal(venceNovo, venceAntes, 'mesma validade');
  assert.equal((await ctx.publico(primeira, 'GET', 'ficha')).status, 200, 'o antigo continua abrindo');
  assert.equal((await ctx.publico(segunda, 'GET', 'ficha')).status, 200);
  assert.equal((await (await ctx.equipe('GET', 'lista')).json()).links[0].hashes, undefined, 'os hashes não vão à equipe');
  // "Gerar novo link" (sem manter): troca de vez, os dois antigos param
  const terceira = await criar(ctx);
  assert.equal((await ctx.publico(primeira, 'GET', 'ficha')).status, 404);
  assert.equal((await ctx.publico(segunda, 'GET', 'ficha')).status, 404);
  assert.equal((await ctx.publico(terceira, 'GET', 'ficha')).status, 200);
  // manter com o link vencido: começa outro prazo e o antigo para
  const v = ler(); v.vence_em = new Date(Date.now() - 1000).toISOString(); await ctx.env.DADOS.put('publico/fichas/7/interessado.json', JSON.stringify(v));
  const quarta = await criar(ctx, { manter: true });
  assert.ok(ler().vence_em > new Date().toISOString());
  assert.equal((await ctx.publico(terceira, 'GET', 'ficha')).status, 404);
  // encerrar: nenhum abre e os ponteiros saem
  const quinta = await criar(ctx, { manter: true });
  await ctx.equipe('POST', 'atualizar', { ficha_id: 7, pessoa: 'interessado', situacao: 'Encerrado' });
  assert.equal((await ctx.publico(quarta, 'GET', 'ficha')).status, 404);
  assert.equal((await ctx.publico(quinta, 'GET', 'ficha')).status, 404);
  assert.ok(![...ctx.env.DADOS.m.keys()].some((k) => k.startsWith('publico/tokens/')), 'sem ponteiros sobrando');
});
