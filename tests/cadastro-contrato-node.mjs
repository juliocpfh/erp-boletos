// Roda o formulário "Editar contrato" (CADASTROS.contratos: valores → ajustar) no Node, com um DOM de mentira.
// app.js não roda no Node (usa window/document): este arquivo roda num processo à parte, chamado pelos testes.
// Uso: node tests/cadastro-contrato-node.mjs <banco.json> <id do contrato> <mudanças em JSON>
// Grava em <banco.json>.saida.json { dados, erros }: o que o formulário gravaria e as mensagens de erro.
import fs from 'node:fs';

const nada = () => {};
const el = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : el), apply: () => el, construct: () => el, set: () => true });
globalThis.window = globalThis;
globalThis.document = { addEventListener: nada, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => el, body: el, documentElement: el, head: el, title: '', cookie: '' };
globalThis.localStorage = { getItem: () => null, setItem: nada, removeItem: nada };
globalThis.sessionStorage = globalThis.localStorage;
try { globalThis.navigator = { serviceWorker: null, userAgent: 'node', storage: {} }; } catch { /* Node novo: navigator só leitura */ }
globalThis.location = { hash: '', search: '', href: 'http://localhost/', origin: 'http://localhost', hostname: 'localhost', pathname: '/', protocol: 'http:' };
globalThis.addEventListener = nada;
globalThis.history = { back: nada, replaceState: nada };
globalThis.matchMedia = () => ({ matches: false, addEventListener: nada });
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.FormData = class { get() { return ''; } };
// a abertura do app (sem tela de verdade) falha sozinha: não interessa aqui
process.on('uncaughtException', nada);
process.on('unhandledRejection', nada);

const [arquivo, id, mudancas] = process.argv.slice(2);
const { E } = await import('../docs/js/app.js');
const R = await import('../docs/js/regras.js');
const { CADASTROS } = await import('../docs/js/telas/cadastros.js');
E.d = R.normalizar(JSON.parse(fs.readFileSync(arquivo, 'utf8')));
const c = R.buscar(E.d, 'contratos', Number(id));
const cfg = CADASTROS.contratos;
const dados = { ...cfg.valores(c), ...JSON.parse(mudancas || '{}') };
delete dados.id;
const erros = {};
cfg.ajustar(dados, erros, c, {}, {});
fs.writeFileSync(`${arquivo}.saida.json`, JSON.stringify({ dados, erros }));
process.exit(0);
