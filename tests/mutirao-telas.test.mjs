// Mutirão de correções das telas: lista dos links da ficha guardada por um minuto e meio, conferência do arquivo do banco
// pela data e pelo tamanho (sem ler tudo a cada 30 s), expressões que o Safari antigo não entende e formulário de filtro.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import * as S from '../docs/js/armazenamento.js';
import { conferirArquivo } from '../docs/js/conferir-pdf.js';
import * as FO from '../docs/js/ficha-online.js';
import * as R from '../docs/js/regras.js';

const raiz = new URL('../docs/js/', import.meta.url);
const arquivosJs = (pasta = raiz) => readdirSync(pasta, { withFileTypes: true }).flatMap((x) => (x.isDirectory()
  ? arquivosJs(new URL(`${x.name}/`, pasta)) : x.name.endsWith('.js') ? [new URL(x.name, pasta)] : []));

test('nenhum arquivo do site usa "olhar para trás" em expressão regular (o Safari antes do 16.4 não abria o sistema)', () => {
  for (const arq of arquivosJs()) {
    assert.doesNotMatch(readFileSync(arq, 'utf8'), /\(\?<[!=]/, String(arq).split('/docs/js/')[1]);
  }
});

test('conferência do PDF: lê o trecho comprimido e não confunde o "stream" de "endstream" com o começo de outro trecho', async () => {
  const texto = (t) => [...new TextEncoder().encode(t)];
  const trecho = (t) => [...texto('<< /Type /ObjStm /Filter /FlateDecode >>\nstream\n'), ...deflateSync(Buffer.from(t)), ...texto('\nendstream\nendobj\n')];
  // "endstream" seguido de fim de linha (como nos PDFs de verdade) duas vezes, com um segundo trecho depois do primeiro
  const bytes = new Uint8Array([...texto('%PDF-1.7\n'), ...trecho('<< /Producer (Canva) >>'), ...trecho('<< /Creator (Canva) /CreationDate (D:20261101100000) >>'), ...texto('%%EOF\n')]);
  const r = await conferirArquivo(bytes);
  assert.equal(r.programa, 'Canva');
  assert.equal(r.sinais[0].nivel, 'alerta');
});

test('formulário aberto: o filtro e a busca (data-form="ir") não contam', () => {
  const comum = readFileSync(new URL('telas/comum.js', raiz), 'utf8');
  assert.match(comum, /export const SELETOR_FORMULARIO = 'main form\[data-form\]:not\(\[data-form="ir"\]\)';/);
  const app = readFileSync(new URL('app.js', raiz), 'utf8');
  assert.doesNotMatch(app, /querySelector\('main form\[data-form\]'\)/, 'app.js usa o seletor de comum.js');
});

test('links da ficha: a lista fica guardada um minuto e meio e as ações da ficha fazem buscar de novo', async () => {
  const pedidos = [];
  let links = [{ ficha_id: 1, pessoa: 'interessado', situacao: 'Aberto' }];
  const json = (corpo) => ({ ok: true, redirected: false, headers: { get: () => 'application/json' }, json: async () => corpo });
  FO.configurarFichaOnline({ base: 'api/ficha-online/', buscar: async (url, op = {}) => { pedidos.push(`${op.method || 'GET'} ${url}`); return json(url.includes('lista') ? { links } : { ok: true }); } });
  try {
    FO.esquecerLinks();
    assert.equal(FO.linksGuardados(), null, 'nada guardado ainda');
    const primeira = await FO.linksRecentes();
    assert.equal(pedidos.length, 1);
    assert.equal(await FO.linksRecentes(), primeira, 'segunda vez em seguida: a guardada, sem ir à nuvem');
    assert.equal(FO.linksGuardados(), primeira);
    assert.equal(pedidos.length, 1);
    // a lista de uma ficha é guardada à parte da lista de todas
    await FO.linksRecentes(7);
    assert.deepEqual(pedidos, ['GET api/ficha-online/lista', 'GET api/ficha-online/lista?ficha=7']);
    // passado um minuto e meio, busca de novo (e a velha ainda serve para desenhar na hora)
    links = [{ ficha_id: 1, pessoa: 'interessado', situacao: 'Respondido' }];
    assert.equal(FO.linksGuardados(), primeira);
    const nova = await FO.linksRecentes(null, Date.now() + FO.VALIDADE_LINKS + 1);
    assert.equal(nova[0].situacao, 'Respondido');
    assert.equal(pedidos.length, 3);
    // conferir sempre vai à nuvem
    await FO.linksNaNuvem();
    assert.equal(pedidos.length, 4);
    // ação da ficha (pedir documento, encerrar, gerar link, guardar o PDF): esquece tudo
    await FO.atualizarLinkNaNuvem({ ficha_id: 1, pessoa: 'interessado', situacao: 'Encerrado' });
    assert.equal(FO.linksGuardados(), null);
    assert.equal(FO.linksGuardados(7), null);
    await FO.linksRecentes();
    assert.equal(pedidos.length, 6, 'depois da ação, a lista vem da nuvem de novo');
    await FO.criarLinkNaNuvem({ ficha_id: 1 });
    assert.equal(FO.linksGuardados(), null);
  } finally { FO.configurarFichaOnline({ buscar: (...a) => fetch(...a) }); FO.esquecerLinks(); }
});

test('links da ficha: lista pedida antes de uma ação e que chega depois dela não fica guardada', async () => {
  let soltar;
  const json = (corpo) => ({ ok: true, redirected: false, headers: { get: () => 'application/json' }, json: async () => corpo });
  FO.configurarFichaOnline({ buscar: async (url) => { if (url.includes('lista')) await new Promise((ok) => { soltar = ok; }); return json(url.includes('lista') ? { links: [{ pessoa: 'interessado', situacao: 'Aberto' }] } : {}); } });
  try {
    FO.esquecerLinks();
    const lista = FO.linksNaNuvem();
    await FO.atualizarLinkNaNuvem({ ficha_id: 1, pessoa: 'interessado', situacao: 'Encerrado' });
    soltar();
    assert.equal((await lista).length, 1);
    assert.equal(FO.linksGuardados(), null, 'a lista de antes da ação está velha: não é guardada');
  } finally { FO.configurarFichaOnline({ buscar: (...a) => fetch(...a) }); FO.esquecerLinks(); }
});

/** Pasta de mentira com o arquivo do banco: ``gravar`` troca o conteúdo e a data, como outro computador faria. */
function pastaComBanco(dados, modificado = 1000) {
  const estado = { texto: JSON.stringify(dados), modificado, leituras: 0 };
  const arquivo = () => ({ lastModified: estado.modificado, size: estado.texto.length, text: async () => { estado.leituras += 1; return estado.texto; } });
  return {
    estado,
    gravar(novo, quando) { estado.texto = JSON.stringify(novo); estado.modificado = quando; },
    getFileHandle: async (nome) => { if (nome !== S.ARQUIVO_BANCO) throw new Error('não existe'); return { getFile: async () => arquivo() }; },
  };
}

test('arquivo do banco: a data e o tamanho dizem se mudou, sem ler o conteúdo; gravação de outro computador é vista', async () => {
  const banco = R.bancoVazio();
  const pasta = pastaComBanco(banco, 1000);
  const lido = await S.lerBanco(pasta);
  const assinatura = S.assinaturaLida(lido);
  assert.ok(assinatura, 'o banco lido sabe de qual arquivo saiu');
  assert.equal(pasta.estado.leituras, 1);
  assert.equal(await S.assinaturaDoBanco(pasta), assinatura, 'arquivo parado: mesma data e tamanho');
  assert.equal(pasta.estado.leituras, 1, 'conferir a data não lê o conteúdo');
  // outro computador grava (data nova, mesmo que o tamanho seja igual)
  pasta.gravar(banco, 2000);
  assert.notEqual(await S.assinaturaDoBanco(pasta), assinatura);
  // mesma data, tamanho diferente (relógio de outro computador): também é mudança
  pasta.gravar({ ...banco, revisao: 12345678 }, 1000);
  assert.notEqual(await S.assinaturaDoBanco(pasta), assinatura);
  // pasta fora do ar: sem assinatura (quem confere lê o arquivo, como antes)
  assert.equal(await S.assinaturaDoBanco({ getFileHandle: async () => { throw new Error('pasta indisponível'); } }), null);
  assert.equal(S.assinaturaLida({}), null, 'objeto que não veio de lerBanco não tem assinatura');
});
