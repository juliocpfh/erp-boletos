// Montagem do site publicado (tools/publicar-site.mjs, usada por .github/workflows/publicar-site.yml): lista de resumos
// (resumos.json) que o sw.js usa para baixar só o que mudou, JS/CSS compactados sem mudar os import, modulepreload no
// index.html, mesma data em todos os arquivos; vendor/, offline/ (versão PC) e sw.js como estão no repositório.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { montar, LISTA } from '../tools/publicar-site.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(RAIZ, 'docs');
const SW = fs.readFileSync(path.join(DOCS, 'sw.js'), 'utf8');
const regexDoSw = (nome) => new Function(`return ${SW.split(`const ${nome} = `)[1].split(';')[0]}`)();
const arquivos = (pasta, base = pasta) => fs.readdirSync(pasta, { withFileTypes: true }).flatMap((e) => (e.isDirectory()
  ? arquivos(path.join(pasta, e.name), base) : [path.relative(base, path.join(pasta, e.name)).split(path.sep).join('/')]));
const ler = (pasta, a) => fs.readFileSync(path.join(pasta, ...a.split('/')));

test('site montado para publicar: lista de resumos, compactação sem mudar os import, modulepreload e mesma data em tudo', () => {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  try {
    const data = new Date('2026-11-17T12:00:00.000Z');
    const r = montar({ saida, data });
    assert.ok(r.compactados > 50, 'compactou os módulos e o estilo');
    assert.equal(SW.split("const RESUMOS = '")[1].split("'")[0], LISTA, 'o sw.js procura a lista pelo mesmo nome');
    // lista: todo arquivo publicado (menos ela e os ocultos), com o resumo do conteúdo publicado
    const lista = JSON.parse(ler(saida, LISTA)).arquivos;
    const publicados = arquivos(saida).filter((a) => a !== LISTA && !a.startsWith('.'));
    assert.deepEqual(Object.keys(lista).sort(), publicados.sort());
    for (const a of publicados) assert.equal(lista[a], crypto.createHash('sha256').update(ler(saida, a)).digest('hex'), a);
    // a versão é a data de publicação: todos os arquivos com a mesma
    for (const a of arquivos(saida)) assert.equal(fs.statSync(path.join(saida, ...a.split('/'))).mtimeMs, data.getTime(), a);
    // vendor/, offline/ (CSP por hash e VERSAO_OFFLINE) e sw.js vão como estão
    for (const a of arquivos(DOCS).filter((x) => /^(vendor|offline)\//.test(x) || x === 'sw.js' || x === 'CNAME')) assert.ok(ler(saida, a).equals(ler(DOCS, a)), `${a} sem mudança`);
    // compactados: menores, e cada import() continua apontando para um arquivo que existe
    const js = arquivos(DOCS).filter((a) => /^js\/.+\.js$/.test(a));
    assert.ok(ler(saida, 'js/regras.js').length < ler(DOCS, 'js/regras.js').length * 0.85, 'regras.js menor');
    for (const a of js) {
      const texto = ler(saida, a).toString('utf8');
      for (const [, alvo] of texto.matchAll(/\bimport\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) assert.ok(fs.existsSync(path.join(saida, path.dirname(a), alvo)), `${a}: import('${alvo}')`);
    }
    // index.html: a mesma política de segurança (CSP) e um modulepreload para cada módulo da página
    const html = ler(saida, 'index.html').toString('utf8');
    const csp = (t) => /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(t)[1];
    assert.equal(csp(html), csp(fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8')));
    const preload = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
    assert.ok(preload.length > 40 && preload.includes('js/regras.js') && preload.includes('js/telas/acoes.js'));
    for (const m of preload) assert.ok(fs.existsSync(path.join(saida, m)), m);
    // a 1ª visita do sw.js lê os links do index.html (modulepreload incluído) e os import de cada módulo, já compactados:
    // só pelos import, a partir do js/app.js, também acha todos os módulos da página
    const LIGACOES = regexDoSw('LIGACOES'); const IMPORTS = regexDoSw('IMPORTS');
    const links = [...html.matchAll(LIGACOES)].map((m) => m[1]);
    for (const m of preload) assert.ok(links.includes(m), `a 1ª visita lê o link de ${m}`);
    const achados = new Set(); const fila = ['js/app.js'];
    while (fila.length) {
      const m = fila.shift();
      if (achados.has(m)) continue;
      achados.add(m);
      for (const [, rel] of ler(saida, m).toString('utf8').matchAll(IMPORTS)) fila.push(path.posix.normalize(path.posix.join(path.posix.dirname(m), rel)));
    }
    for (const m of preload) assert.ok(achados.has(m), `a 1ª visita guarda ${m}`);
  } finally { fs.rmSync(saida, { recursive: true, force: true }); }
});

test('--sem-compactar (para voltar atrás sem mexer no código): os arquivos vão como estão, com a lista e o modulepreload', () => {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  try {
    const r = montar({ saida, compactar: false });
    assert.equal(r.compactados, 0);
    for (const a of ['js/app.js', 'js/regras.js', 'css/estilo.css']) assert.ok(ler(saida, a).equals(ler(DOCS, a)), a);
    assert.ok(JSON.parse(ler(saida, LISTA)).arquivos['js/app.js']);
    assert.match(ler(saida, 'index.html').toString('utf8'), /<link rel="modulepreload" href="js\/regras\.js">/);
    assert.throws(() => montar({ saida: path.join(DOCS, 'saida'), compactar: false }), /dentro de docs/);
  } finally { fs.rmSync(saida, { recursive: true, force: true }); }
});
