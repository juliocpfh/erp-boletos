#!/usr/bin/env node
// Ponte entre o site (navegador) e a API do C6 Bank. Só módulos nativos do Node (https, http, crypto, fs): nada para instalar.
//
// Por que existe: a API do C6 exige certificado mTLS e um token OAuth2 (client_credentials), e o navegador não consegue
// apresentar certificado de cliente nem guardar as chaves com segurança. Esta ponte roda no computador do usuário, guarda as
// chaves de CADA CONTA (ex.: ANK e JCK) e expõe rotas simples para o site:
//   GET  /saude                                   → situação da ponte e de cada conta (configurado? certificado? token? sandbox/produção)
//   GET  /contas                                  → lista das contas e sua situação
//   GET  /contas/:conta/saude                     → situação de uma conta
//   POST /contas/:conta/boletos                   → emite um boleto com Pix (bolepix)       [C6: POST /v2/bank_slips]
//   GET  /contas/:conta/boletos/:id               → consulta a situação                      [C6: GET  /v2/bank_slips/:id]
//   POST /contas/:conta/boletos/:id/cancelar      → cancela no banco                         [C6: PUT  /v2/bank_slips/:id/cancel]
//   GET  /contas/:conta/boletos/:id/pdf           → PDF do boleto                            [C6: GET  /v2/bank_slips/:id/pdf]
//   POST /webhook/c6/:conta                       → recebe avisos do banco (pagamento) e guarda em notificacoes/<conta>.jsonl
//   GET  /contas/:conta/notificacoes?desde=…      → avisos guardados (o site pode consultar)
// Modo SIMULADO=1: responde com dados fictícios, sem falar com o banco (para testar as telas antes de ter as chaves);
//   POST /contas/:conta/simulado/pagar/:id marca um boleto fictício como pago.
// Estrutura pensada para crescer: cada serviço (boletos hoje; extrato, comprovantes, pagamentos depois) é uma entrada em
// SERVICOS, com suas rotas relativas a /contas/:conta. Veja README.md.
//
// FORMATO DA API DO C6: OpenAPI oficial 1.2.0 (documentacao/c6-openapi/*.yaml; resumo em documentacao/C6_CAMPOS_CONFIRMADOS.md).
// Caminhos, campos e situações ficam só em mapa-c6.mjs (M) — cópia idêntica de docs/js/mapa-c6.js, que o site usa.
//   - URLs: produção https://baas-api.c6bank.info · sandbox https://baas-api-sandbox.c6bank.info (mTLS nos dois; sandbox de boleto seg–sex 7h–22h)
//   - Token (AT_01): POST /v1/auth/ form-urlencoded grant_type=client_credentials&client_id&client_secret → { access_token, expires_in, token_type: 'Bearer', scope }
//     Escopos do Bolepix: v2.bankslip.read, v2.bankslip.write, v2.bankslip.pix.write (faltando: 403). Renovado aqui 1 minuto antes de vencer.
//   - Cabeçalhos: Authorization: Bearer …, partner-software-name, partner-software-version (opcionais). Erros em RFC 7807 (title/detail repassados ao site).
//   - Boleto v2 ("Bolepix"), roteiro oficial: BP_01 POST /v2/bank_slips (201) · BP_02 PATCH …/{id} (200, parcial) · BP_03 GET …/{id} (200)
//     · BP_04 GET …/{id}/pdf (200, application/pdf) · BP_05 PUT …/{id}/cancel (204) · BP_06 GET /v2/bank_slips?<intervalo de datas, ≤60 dias> (200, content[] com payments[])
//     · negativação POST/DELETE …/{id}/denial. A v1 (/v1/bank_slips) ainda existe em algumas contas: C6_<ID>_VERSAO_BOLETO=v1 troca o prefixo (campos da v1 diferem).
//   - Webhook (API de notificações): POST /v1/webhooks { url, service: 'BANK_SLIP_PIX' }; o aviso NÃO tem assinatura → o site só reconsulta o boleto.
//   - Cada chamada ao banco fica registrada em registros/ (status e corpo) para preencher o roteiro de homologação (node servidor.mjs --roteiro).
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as M from './mapa-c6.mjs';
import { c6SimuladoDaConta } from './c6-simulado.mjs';
import { listarPaginas } from './c6-boletos-listar.mjs';
import { rotasFase2 } from './rotas-fase2.mjs';

export const VERSAO = '0.1.0';
const PASTA = path.dirname(fileURLToPath(import.meta.url));

// --------------------------------------------------------------------------
// Configuração (.env na pasta da ponte ou variáveis de ambiente)
// --------------------------------------------------------------------------
/** Lê um arquivo .env simples (CHAVE=valor, # comentários) sem sobrescrever o que já está no ambiente. */
export function lerEnv(arquivo, env = process.env) {
  if (!fs.existsSync(arquivo)) return env;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha);
    if (!m || linha.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (env[m[1]] === undefined) env[m[1]] = v;
  }
  return env;
}

export const URLS_C6 = M.URLS;

const lerArquivoSeExiste = (p) => (p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '');

/**
 * Configuração de uma conta: variáveis C6_<ID>_CLIENT_ID, C6_<ID>_CLIENT_SECRET, C6_<ID>_CERTIFICADO, C6_<ID>_CHAVE,
 * C6_<ID>_SENHA_CHAVE, C6_<ID>_AMBIENTE (sandbox|producao), ou arquivos na pasta contas/<id>/
 * (client_id.txt, client_secret.txt, certificado.crt, chave.key, ambiente.txt). O que estiver na variável vale primeiro.
 */
export function configDaConta(id, env, pastaContas) {
  const P = `C6_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_`;
  const pasta = path.join(pastaContas, id);
  const arq = (nome) => path.join(pasta, nome);
  const caminhoCert = env[`${P}CERTIFICADO`] || (fs.existsSync(arq('certificado.crt')) ? arq('certificado.crt') : fs.existsSync(arq('certificado.pem')) ? arq('certificado.pem') : '');
  const caminhoChave = env[`${P}CHAVE`] || (fs.existsSync(arq('chave.key')) ? arq('chave.key') : fs.existsSync(arq('chave.pem')) ? arq('chave.pem') : '');
  const ambiente = (env[`${P}AMBIENTE`] || lerArquivoSeExiste(arq('ambiente.txt')) || 'sandbox').toLowerCase() === 'producao' ? 'producao' : 'sandbox';
  return {
    id, ambiente,
    client_id: env[`${P}CLIENT_ID`] || lerArquivoSeExiste(arq('client_id.txt')),
    client_secret: env[`${P}CLIENT_SECRET`] || lerArquivoSeExiste(arq('client_secret.txt')),
    certificado: caminhoCert, chave: caminhoChave, senha_chave: env[`${P}SENHA_CHAVE`] || '',
    url_base: env[`${P}URL_BASE`] || URLS_C6[ambiente],
    webhook_token: env[`${P}WEBHOOK_TOKEN`] || lerArquivoSeExiste(arq('webhook_token.txt')), // 32 hex: sem ele o webhook da conta fica desligado
    valor_maximo: Number(env[`${P}VALOR_MAXIMO`] || lerArquivoSeExiste(arq('valor_maximo.txt')) || 50000), // reais, por boleto
    empresa: env[`${P}EMPRESA`] || lerArquivoSeExiste(arq('empresa.txt')) || id.toUpperCase(),
    versao_boleto: (env[`${P}VERSAO_BOLETO`] || lerArquivoSeExiste(arq('versao_boleto.txt')) || 'v2').toLowerCase() === 'v1' ? 'v1' : 'v2', // v1: campos diferentes, só para contas antigas
    chave_pix: env[`${P}CHAVE_PIX`] || lerArquivoSeExiste(arq('chave_pix.txt')), // só informativo: a chave usada vem do pedido do site
  };
}

export function carregarConfig(env = process.env) {
  const ids = String(env.CONTAS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const pastaContas = path.resolve(PASTA, env.PASTA_CONTAS || 'contas');
  // sem CONTAS no .env, cada subpasta de contas/ é uma conta
  const lista = ids.length ? ids : (fs.existsSync(pastaContas) ? fs.readdirSync(pastaContas, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase()) : []);
  const host = env.PONTE_HOST || env.HOST || '127.0.0.1';
  const exposta = !['127.0.0.1', 'localhost', '::1'].includes(host);
  const cfg = {
    porta: Number(env.PONTE_PORTA || 8765),
    host, exposta, expor: ['1', 'true', 'sim'].includes(String(env.EXPOR || '').toLowerCase()),
    // lista FIXA de origens que podem chamar a ponte (CORS); "*" nunca é aceito
    origens: String(env.ORIGENS || env.PONTE_ORIGEM || 'http://localhost:8000,http://127.0.0.1:8000,https://juliocpfh.github.io').split(',').map((x) => x.trim()).filter((x) => x && x !== '*'),
    senha: env.PONTE_SENHA || '',
    simulado: ['1', 'true', 'sim'].includes(String(env.SIMULADO || '').toLowerCase()),
    pagamentos: ['1', 'true', 'sim'].includes(String(env.PAGAMENTOS || '').toLowerCase()), // libera as rotas de pagamento (fase 2)
    retencao_registros_dias: Number(env.RETENCAO_REGISTROS_DIAS || 30),
    https: env.PONTE_HTTPS_CERT && env.PONTE_HTTPS_CHAVE ? { cert: env.PONTE_HTTPS_CERT, key: env.PONTE_HTTPS_CHAVE } : null,
    software: { nome: env.PONTE_NOME_SOFTWARE || 'administracao-imoveis', versao: env.PONTE_VERSAO_SOFTWARE || VERSAO },
    pastaNotificacoes: path.resolve(PASTA, env.PASTA_NOTIFICACOES || 'notificacoes'),
    pastaRegistros: env.PASTA_REGISTROS === '' ? '' : path.resolve(PASTA, env.PASTA_REGISTROS || 'registros'),
    contas: Object.fromEntries(lista.map((id) => [id, configDaConta(id, env, pastaContas)])),
  };
  validarConfig(cfg);
  return cfg;
}

/** Regras que impedem a ponte de subir errada (lançam erro com a explicação). */
export function validarConfig(cfg) {
  if (cfg.simulado && Object.values(cfg.contas).some((c) => c.ambiente === 'producao')) {
    throw new Error('SIMULADO=1 não pode valer com uma conta em produção: ou tire SIMULADO, ou deixe as contas em sandbox (C6_<ID>_AMBIENTE=sandbox / contas/<id>/ambiente.txt).');
  }
  if (cfg.exposta && !cfg.expor) throw new Error(`PONTE_HOST=${cfg.host} expõe a ponte fora deste computador. Se for isso mesmo, defina EXPOR=1 e proteja o acesso (Cloudflare Access ou Tailscale); senão use 127.0.0.1.`);
  if (String(cfg.senha).length < 20) throw new Error('PONTE_SENHA precisa ter pelo menos 20 caracteres (uma frase): defina no .env. A mesma senha vai no site, em Dados e backup → Banco (C6).');
  for (const c of Object.values(cfg.contas)) {
    if (c.webhook_token && !/^[0-9a-f]{32}$/i.test(c.webhook_token)) throw new Error(`C6_${c.id.toUpperCase()}_WEBHOOK_TOKEN precisa ter 32 caracteres hexadecimais (gere com: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))").`);
    if (!(c.valor_maximo > 0)) throw new Error(`C6_${c.id.toUpperCase()}_VALOR_MAXIMO precisa ser um valor em reais maior que zero.`);
  }
}

/** Permissão dos arquivos de credencial (Linux/macOS): avisa quando outros usuários do computador conseguem ler. */
export function permissaoAberta(caminho) {
  try {
    if (process.platform === 'win32' || !caminho || !fs.existsSync(caminho)) return false;
    return (fs.statSync(caminho).mode & 0o077) !== 0;
  } catch { return false; }
}

/** Validade do certificado mTLS da conta: { valido_ate: 'AAAA-MM-DD', dias } ou null se não deu para ler. */
export function validadeCertificado(conta) {
  try {
    if (!conta.certificado || !fs.existsSync(conta.certificado) || typeof crypto.X509Certificate !== 'function') return null;
    const cert = new crypto.X509Certificate(fs.readFileSync(conta.certificado));
    const ate = new Date(cert.validTo);
    return { valido_ate: ate.toISOString().slice(0, 10), dias: Math.floor((ate - Date.now()) / 86400000), emitido_para: cert.subject.split('\n').find((l) => l.startsWith('CN=')) || '' };
  } catch { return null; }
}

/** O que falta para uma conta funcionar de verdade (lista vazia = configurada). */
export function faltamNaConta(conta) {
  const faltam = [];
  if (!conta.client_id) faltam.push('client_id');
  if (!conta.client_secret) faltam.push('client_secret');
  if (!conta.certificado) faltam.push('certificado (arquivo .crt/.pem)');
  else if (!fs.existsSync(conta.certificado)) faltam.push('certificado: arquivo não encontrado');
  if (!conta.chave) faltam.push('chave privada (arquivo .key/.pem)');
  else if (!fs.existsSync(conta.chave)) faltam.push('chave privada: arquivo não encontrado');
  const v = validadeCertificado(conta);
  if (v && v.dias < 0) faltam.push(`certificado vencido em ${v.valido_ate}: gere outro no Web Banking do C6 (Integrações via API)`);
  return faltam;
}

// --------------------------------------------------------------------------
// Chamadas ao C6: token OAuth2 (renovado sozinho) e requisições com certificado mTLS
// --------------------------------------------------------------------------
const tokens = new Map(); // id da conta → { token, expira }
const MARGEM_TOKEN_MS = 60000;

function pedir(url, { metodo = 'GET', cabecalhos = {}, corpo = null, conta = null, binario = false } = {}) {
  return new Promise((resolver, falhar) => {
    const u = new URL(url);
    const opcoes = { method: metodo, hostname: u.hostname, port: u.port || 443, path: `${u.pathname}${u.search}`, headers: { ...cabecalhos }, timeout: 25000 };
    if (conta) {
      opcoes.cert = fs.readFileSync(conta.certificado);
      opcoes.key = fs.readFileSync(conta.chave);
      if (conta.senha_chave) opcoes.passphrase = conta.senha_chave;
    }
    if (corpo !== null) opcoes.headers['Content-Length'] = Buffer.byteLength(corpo);
    const req = https.request(opcoes, (res) => {
      const partes = [];
      res.on('data', (p) => partes.push(p));
      res.on('end', () => {
        const buf = Buffer.concat(partes);
        if (binario) return resolver({ status: res.statusCode, tipo: res.headers['content-type'] || '', corpo: buf });
        const texto = buf.toString('utf8');
        let dados = null;
        try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { texto }; }
        resolver({ status: res.statusCode, tipo: res.headers['content-type'] || '', dados });
      });
    });
    req.on('timeout', () => req.destroy(new Error('O banco não respondeu a tempo.')));
    req.on('error', falhar);
    if (corpo !== null) req.write(corpo);
    req.end();
  });
}

/** Escopos exigidos pelo Bolepix (roteiro oficial). Faltando algum, as chamadas voltam 403. */
export const ESCOPOS_BOLEPIX = M.ESCOPOS;

/** Token da conta, pedindo um novo quando não há ou está perto de vencer. */
export async function obterToken(conta, forcar = false, cfg = null) {
  const atual = tokens.get(conta.id);
  if (!forcar && atual && atual.expira - MARGEM_TOKEN_MS > Date.now()) return atual.token;
  const corpo = new URLSearchParams({ grant_type: 'client_credentials', client_id: conta.client_id, client_secret: conta.client_secret }).toString();
  const r = await pedir(`${conta.url_base}${M.CAMINHOS.token}`, { metodo: 'POST', corpo, conta, cabecalhos: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } }); // roteiro AT_01: POST /auth
  registrarChamada(cfg, conta, 'POST', M.CAMINHOS.token, r.status, r.dados ? { ...r.dados, access_token: r.dados.access_token ? '(oculto)' : undefined } : null);
  if (r.status >= 300 || !r.dados || !r.dados.access_token) {
    throw new ErroHttp(502, `O banco não liberou o token (${r.status}): ${resumo(r.dados)}`);
  }
  const expiraEm = Number(r.dados.expires_in || 300) * 1000;
  const scope = r.dados.scope ?? r.dados.scopes ?? '';
  tokens.set(conta.id, { token: r.dados.access_token, expira: Date.now() + expiraEm, escopos: Array.isArray(scope) ? scope : String(scope).split(/[\s,]+/).filter(Boolean) });
  return r.dados.access_token;
}

// --------------------------------------------------------------------------
// Registro de cada chamada ao banco (ponte-c6/registros/AAAA-MM-DD.jsonl, fora do Git): o roteiro de homologação do C6 pede o
// status code e o response body de cada teste (AT_01, BP_01…BP_06). `node servidor.mjs --roteiro` ou GET /roteiro mostra o último de cada.
// --------------------------------------------------------------------------
/** Código do teste do roteiro oficial a que a chamada corresponde. */
export function testeDoRoteiro(metodo, caminho) {
  const c = caminho.split('?')[0];
  if (/\/auth\/?$/.test(c)) return 'AT_01';
  if (/\/bank_slips\/?$/.test(c)) return metodo === 'POST' ? 'BP_01' : 'BP_06';
  if (/\/bank_slips\/[^/]+\/pdf\/?$/.test(c)) return 'BP_04';
  if (/\/bank_slips\/[^/]+\/cancel\/?$/.test(c)) return 'BP_05';
  if (/\/bank_slips\/[^/]+\/?$/.test(c)) return metodo === 'PATCH' ? 'BP_02' : 'BP_03';
  if (/\/webhooks\/?$/.test(c)) return 'WH_01';
  return '';
}

/** Tira dados pessoais e segredos do que vai para o registro: CPF/CNPJ (11 ou 14 dígitos) mascarados, tokens e chaves ocultos. */
export function mascarar(texto) {
  return String(texto)
    .replace(/"(access_token|client_secret|refresh_token|private_key|senha|password)"\s*:\s*"[^"]*"/gi, '"$1":"(oculto)"')
    .replace(/Bearer [A-Za-z0-9._~+/=-]+/g, 'Bearer (oculto)')
    .replace(/\b(\d{3})\d{5}(\d{3})\b/g, '$1*****$2') // CPF: 529*****725
    .replace(/\b(\d{2})\d{9}(\d{3})\b/g, '$1*********$2') // CNPJ: 11*********181
    .replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2'); // e-mail: m***@exemplo.com.br
}

function registrarChamada(cfg, conta, metodo, caminho, status, corpo) {
  if (!cfg || !cfg.pastaRegistros) return;
  try {
    fs.mkdirSync(cfg.pastaRegistros, { recursive: true });
    // só o essencial (o roteiro pede status e corpo; o corpo guardado é o resumo sem dados pessoais): id, referência e erro resumido
    const o = corpo && typeof corpo === 'object' ? corpo : null;
    const erroResumido = status >= 300 ? mascarar(typeof corpo === 'string' ? corpo : resumo(corpo)).slice(0, 300) : null;
    const linha = { quando: new Date().toISOString(), conta: conta.id, ambiente: conta.ambiente, teste: testeDoRoteiro(metodo, caminho), metodo, caminho: caminho.split('?')[0], status,
      id: o && o.id ? String(o.id) : null, external_reference_id: o && o.external_reference_id ? String(o.external_reference_id) : null, status_banco: o && o.status ? String(o.status) : null, erro: erroResumido };
    fs.appendFileSync(path.join(cfg.pastaRegistros, `${linha.quando.slice(0, 10)}.jsonl`), `${JSON.stringify(linha)}\n`);
  } catch (e) { console.error(`Não deu para gravar o registro da chamada: ${e.message}`); }
}

/** Apaga arquivos .jsonl de registros e notificações com mais de ``dias`` dias (chamado ao subir a ponte). */
export function apagarAntigos(cfg, dias = cfg.retencao_registros_dias || 30) {
  const limite = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  let apagados = 0;
  for (const pasta of [cfg.pastaRegistros, cfg.pastaNotificacoes]) {
    if (!pasta || !fs.existsSync(pasta)) continue;
    for (const a of fs.readdirSync(pasta)) {
      const data = (/(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(a) || [])[1];
      if (data && data < limite) { fs.unlinkSync(path.join(pasta, a)); apagados += 1; }
    }
  }
  return apagados;
}

/** Últimos registros por teste do roteiro (e os últimos ``n`` de cada), lendo os arquivos de registros/. */
export function registrosDoRoteiro(cfg, n = 3) {
  if (!fs.existsSync(cfg.pastaRegistros)) return {};
  const linhas = fs.readdirSync(cfg.pastaRegistros).filter((a) => a.endsWith('.jsonl')).sort().flatMap((a) => fs.readFileSync(path.join(cfg.pastaRegistros, a), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
  const porTeste = {};
  for (const l of linhas) (porTeste[l.teste || 'outros'] = porTeste[l.teste || 'outros'] || []).push(l);
  for (const k of Object.keys(porTeste)) porTeste[k] = porTeste[k].slice(-n);
  return porTeste;
}

const NOMES_TESTES = { AT_01: 'Geração do token de sessão', BP_01: 'Criar cobrança Bolepix', BP_02: 'Atualizar cobrança Bolepix', BP_03: 'Consultar cobrança Bolepix', BP_04: 'Consultar PDF de cobrança Bolepix', BP_05: 'Cancelar cobrança (baixa)', BP_06: 'Listar cobranças Bolepix', WH_01: 'Cadastro do webhook' };

/** Texto do roteiro para o terminal: status e corpo da resposta do último registro de cada teste. */
export function textoRoteiro(cfg) {
  const r = registrosDoRoteiro(cfg, 1);
  const linhas = ['Roteiro de Testes – C6 Developers v3.0: último resultado registrado de cada teste (envie para homologacaoapi@c6bank.com)', ''];
  for (const [codigo, nome] of Object.entries(NOMES_TESTES)) {
    const u = (r[codigo] || [])[0];
    linhas.push(`${codigo} – ${nome}`);
    linhas.push(u ? `  ${u.quando} · conta ${u.conta} (${u.ambiente}) · ${u.metodo} ${u.caminho}\n  Status Code: ${u.status}\n  Response Body (resumo): ${JSON.stringify({ id: u.id, external_reference_id: u.external_reference_id, status: u.status_banco, erro: u.erro })}` : '  (ainda não executado pela ponte)');
    linhas.push('');
  }
  return linhas.join('\n');
}

/** Texto curto do erro do banco: RFC 7807 (title/detail) quando vier assim, senão o JSON cortado. */
const resumo = (x) => {
  if (!x) return '(sem corpo)';
  if (typeof x === 'object' && (x.detail || x.title)) return [x.title, x.detail, x.correlation_id ? `(correlation_id ${x.correlation_id})` : ''].filter(Boolean).join(' · ').slice(0, 400);
  return JSON.stringify(x).slice(0, 300);
};

/** Chamada autenticada à API do C6; se o token foi recusado (401), pede outro e tenta de novo uma vez. */
export async function chamarC6(cfg, conta, metodo, caminho, corpo = null, { binario = false, tentativa = 0 } = {}) {
  const token = await obterToken(conta, tentativa > 0, cfg);
  const cabecalhos = { Authorization: `Bearer ${token}`, Accept: binario ? 'application/pdf' : 'application/json',
    'partner-software-name': cfg.software.nome, 'partner-software-version': cfg.software.versao };
  if (corpo !== null) cabecalhos['Content-Type'] = 'application/json';
  const r = await pedir(`${conta.url_base}${caminho}`, { metodo, cabecalhos, corpo: corpo !== null ? JSON.stringify(corpo) : null, conta, binario });
  registrarChamada(cfg, conta, metodo, caminho, r.status, binario ? `(${r.corpo ? r.corpo.length : 0} bytes, ${r.tipo})` : r.dados);
  if (r.status === 401 && tentativa === 0) return chamarC6(cfg, conta, metodo, caminho, corpo, { binario, tentativa: 1 });
  if (r.status === 403) throw new ErroHttp(502, `O banco recusou (403): o usuário da API não tem o escopo necessário (${ESCOPOS_BOLEPIX.join(', ')}). Peça ao C6 para liberar. ${resumo(r.dados)}`, r.dados);
  if (r.status >= 300) throw new ErroHttp(r.status === 404 ? 404 : 502, `O banco respondeu ${r.status}: ${resumo(r.dados)}`, r.dados);
  return r;
}

// --------------------------------------------------------------------------
// Modo simulado: boletos fictícios em memória (para testar a tela sem o banco)
// --------------------------------------------------------------------------
const simulados = new Map(); // "conta|id" → boleto fictício no formato da resposta do C6
const digitos = (n) => Array.from(crypto.randomBytes(n), (b) => String(b % 10)).join('');

/**
 * Boleto fictício no formato exato da consulta do C6 (OpenAPI 1.2.0): linha digitável com 47 dígitos no desenho dos boletos,
 * código de barras com 44, Pix copia-e-cola parecido com o real, QR em SVG (o banco manda PNG), payer_notification com status.
 */
export function respostaSimulada(contaId, pedido, ambiente = 'sandbox') {
  const codigoBarras = `336${digitos(41)}`; // 336 = código do C6 na compensação
  const campo = (a, b) => `${a}.${b}`;
  const linhaDigitavel = `${campo(codigoBarras.slice(0, 5), codigoBarras.slice(5, 10))} ${campo(codigoBarras.slice(10, 15), digitos(6))} ${campo(digitos(5), digitos(6))} ${digitos(1)} ${digitos(14)}`;
  const valor = Number(pedido[M.CAMPOS.valor] || 0).toFixed(2);
  const txid = crypto.randomUUID().replace(/-/g, '').slice(0, 25).toUpperCase();
  const pixCopiaCola = `00020126580014br.gov.bcb.pix0136${crypto.randomUUID()}5204000053039865406${valor}5802BR5915SIMULADO ${contaId.toUpperCase().slice(0, 6)}6008CURITIBA62290525${txid}6304${digitos(4)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#fff"/><rect x="10" y="10" width="40" height="40" fill="#000"/><rect x="110" y="10" width="40" height="40" fill="#000"/><rect x="10" y="110" width="40" height="40" fill="#000"/><rect x="20" y="20" width="20" height="20" fill="#fff"/><rect x="120" y="20" width="20" height="20" fill="#fff"/><rect x="20" y="120" width="20" height="20" fill="#fff"/><text x="80" y="88" font-family="sans-serif" font-size="13" text-anchor="middle">QR SIMULADO</text><text x="80" y="104" font-family="sans-serif" font-size="10" text-anchor="middle">R$ ${valor}</text></svg>`;
  const bs = (pedido[M.CAMPOS.forma] || {})[M.CAMPOS.boleto] || {};
  const pix = (pedido[M.CAMPOS.forma] || {})[M.CAMPOS.pix] || null;
  return {
    id: crypto.randomUUID(), external_reference_id: pedido[M.CAMPOS.referencia] || `S${digitos(25)}`, status: M.STATUS.criado,
    amount: Number(valor), due_date: pedido[M.CAMPOS.vencimento], emission_date: new Date().toISOString().slice(0, 10), description: pedido[M.CAMPOS.descricao] || '',
    days_after_due_date: pedido[M.CAMPOS.dias_baixa] ?? null, payer: pedido[M.CAMPOS.pagador], fees: pedido[M.CAMPOS.encargos] || {}, origin: pedido[M.CAMPOS.origem] || null,
    payment_method: {
      bank_slip: { originator_id: 'SIMULADO', billing_scheme: bs[M.CAMPOS.carteira] || M.CARTEIRAS[ambiente], billing_type: pix ? 'HYBRID' : 'BANK_SLIP', digitable_line: linhaDigitavel, bar_code: codigoBarras,
        our_number: digitos(10), number: bs[M.CAMPOS.seu_numero] || '' },
      ...(pix ? { pix: { qr_code: pixCopiaCola, image_content: Buffer.from(svg, 'utf8').toString('base64'), mime_type: 'image/svg+xml', reference: txid } } : {}),
    },
    denial_info: null,
    payer_notification: (pedido[M.NOTIFICACAO.campo] || []).map((n) => ({ ...n, status: 'SCHEDULED', sent_at: null })),
    simulado: true,
  };
}

/** A resposta da EMISSÃO no C6 traz menos campos que a consulta: id, referência, valor, vencimento e payment_method. */
const respostaEmissao = (r) => ({ id: r.id, external_reference_id: r.external_reference_id, amount: r.amount, due_date: r.due_date, payment_method: r.payment_method, simulado: true });

// --------------------------------------------------------------------------
// Serviços por conta (rotas relativas a /contas/:conta). Para crescer: acrescente uma entrada (ex.: extrato) com suas rotas.
// --------------------------------------------------------------------------
export class ErroHttp extends Error {
  constructor(status, mensagem, detalhes = null) { super(mensagem); this.status = status; this.detalhes = detalhes; }
}

const chaveSim = (conta, id) => `${conta.id}|${id}`;

const versao = (conta) => conta.versao_boleto || 'v2';

// --------------------------------------------------------------------------
// Pedido de emissão: a ponte é o lugar de confiança. Monta o corpo final SÓ com campos conhecidos (mapa-c6), nos limites da API,
// com a chave Pix da conta (nunca a do navegador), valor até C6_<ID>_VALOR_MAXIMO e avisos só para o e-mail/telefone do pagador.
// --------------------------------------------------------------------------
/** CPF (11 dígitos) ou CNPJ (14) com dígitos verificadores válidos. */
export function documentoValido(digitos) {
  const d = String(digitos || '');
  if (/^(\d)\1+$/.test(d)) return false;
  const dv = (base, pesos) => { const s = base.split('').reduce((t, c, i) => t + Number(c) * pesos[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  if (d.length === 11) {
    const p1 = dv(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const p2 = dv(d.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return Number(d[9]) === p1 && Number(d[10]) === p2;
  }
  if (d.length === 14) {
    const p1 = dv(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const p2 = dv(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return Number(d[12]) === p1 && Number(d[13]) === p2;
  }
  return false;
}

const texto = (v, max) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
/**
 * Dado do pagador nos limites da API: passou do limite (ou tem "/" no endereço, que o C6 recusa) → 400 com o campo e o tamanho.
 * Nunca corta (decisão de 2026-10-16): o site já confere antes; aqui é a segunda barreira.
 */
const textoNoLimite = (v, max, rotulo, { semBarra = false } = {}) => {
  const t = v === undefined || v === null ? '' : String(v).trim();
  if (t.length > max) throw new ErroHttp(400, `${rotulo} tem ${t.length} caracteres; o banco aceita até ${max}. Abrevie no cadastro.`);
  if (semBarra && t.includes('/')) throw new ErroHttp(400, `${rotulo} tem uma barra "/", que o banco não aceita. Corrija no cadastro.`);
  return t;
};
const numero2 = (v) => { const n = Number(v); if (!Number.isFinite(n)) return null; return Number(n.toFixed(2)); };
const inteiro = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : null; };
const RE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * Corpo final para POST /v2/bank_slips a partir do pedido do site: allowlist estrita (o resto é descartado) + validações.
 * Lança ErroHttp 400 com a explicação. ``conta`` dá a carteira, a chave Pix e o valor máximo.
 */
export function montarPedidoSeguro(pedido, conta) {
  if (!pedido || typeof pedido !== 'object') throw new ErroHttp(400, 'Pedido vazio.');
  const K = M.CAMPOS;
  const L = M.LIMITES;
  const ref = texto(pedido[K.referencia], 26);
  if (!/^[A-Z0-9]{26}$/.test(ref)) throw new ErroHttp(400, `${K.referencia} precisa ter 26 caracteres (A-Z, 0-9).`);
  const valor = numero2(pedido[K.valor]);
  if (!(valor > 0)) throw new ErroHttp(400, `O valor (${K.valor}) precisa ser maior que zero.`);
  if (valor > conta.valor_maximo) throw new ErroHttp(400, `O valor R$ ${valor.toFixed(2)} passa do máximo da conta ${conta.id} (R$ ${Number(conta.valor_maximo).toFixed(2)}, C6_${conta.id.toUpperCase()}_VALOR_MAXIMO).`);
  if (valor > L.valor_maximo_reais) throw new ErroHttp(400, 'Valor acima do máximo da API.');
  const vencimento = texto(pedido[K.vencimento], 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento) || Number.isNaN(Date.parse(vencimento))) throw new ErroHttp(400, `${K.vencimento} precisa ser AAAA-MM-DD.`);
  const descricao = texto(pedido[K.descricao], L.descricao);
  if (!descricao) throw new ErroHttp(400, `Falta o campo "${K.descricao}" no pedido.`);
  const pg = pedido[K.pagador];
  if (!pg || typeof pg !== 'object') throw new ErroHttp(400, `Falta o campo "${K.pagador}" no pedido.`);
  const nome = textoNoLimite(pg[K.pagador_nome], L.nome, 'O nome do pagador');
  if (!nome) throw new ErroHttp(400, 'Falta o nome do pagador.');
  const doc = String(pg[K.pagador_documento] || '').replace(/\D/g, '');
  if (!documentoValido(doc)) throw new ErroHttp(400, 'CPF/CNPJ do pagador inválido (confira os dígitos no cadastro do inquilino).');
  const end = pg[K.pagador_endereco] && typeof pg[K.pagador_endereco] === 'object' ? pg[K.pagador_endereco] : {};
  const endereco = { [K.endereco_rua]: textoNoLimite(end[K.endereco_rua], L.endereco, 'A rua e o número do pagador', { semBarra: true }), [K.endereco_bairro]: textoNoLimite(end[K.endereco_bairro], L.bairro, 'O bairro do pagador', { semBarra: true }),
    [K.endereco_cidade]: textoNoLimite(end[K.endereco_cidade], L.cidade, 'A cidade do pagador', { semBarra: true }),
    [K.endereco_uf]: texto(end[K.endereco_uf], 2).toUpperCase(), [K.endereco_cep]: String(end[K.endereco_cep] || '').replace(/\D/g, '').slice(0, 8) };
  for (const [k, v] of Object.entries(endereco)) if (!v) throw new ErroHttp(400, `Falta o campo "${k}" no endereço do pagador.`);
  if (endereco[K.endereco_cep].length !== 8) throw new ErroHttp(400, 'CEP do pagador precisa ter 8 dígitos.');
  if (!/^[A-Z]{2}$/.test(endereco[K.endereco_uf])) throw new ErroHttp(400, 'UF do pagador precisa ter 2 letras.');
  const email = textoNoLimite(pg[K.pagador_email], L.email, 'O e-mail do pagador');
  if (email && !RE_EMAIL.test(email)) throw new ErroHttp(400, 'E-mail do pagador inválido.');
  const telefone = String(pg.phone || '').replace(/\D/g, '').slice(0, 13); // não vai ao banco: só confere o destino dos SMS
  const pagador = { [K.pagador_nome]: nome, [K.pagador_documento]: doc, [K.pagador_endereco]: endereco, ...(email ? { [K.pagador_email]: email } : {}) };
  // forma de pagamento: carteira da conta (ou a do ambiente), nosso controle, instruções cortadas; Pix SEMPRE com a chave da conta
  const pmIn = pedido[K.forma] && typeof pedido[K.forma] === 'object' ? pedido[K.forma] : {};
  const bsIn = pmIn[K.boleto] && typeof pmIn[K.boleto] === 'object' ? pmIn[K.boleto] : {};
  const seuNumero = String(bsIn[K.seu_numero] || '').replace(/\D/g, '').slice(0, L.seu_numero);
  const instrucoes = Array.isArray(bsIn[K.instrucoes]) ? bsIn[K.instrucoes].map((x) => texto(x, L.instrucao)).filter(Boolean).slice(0, L.instrucoes) : [];
  const boleto = { [K.carteira]: String(bsIn[K.carteira] || '').replace(/\D/g, '') || M.CARTEIRAS[conta.ambiente] || M.CARTEIRAS.sandbox, ...(seuNumero ? { [K.seu_numero]: seuNumero } : {}), ...(instrucoes.length ? { [K.instrucoes]: instrucoes } : {}) };
  const forma = { [K.boleto]: boleto };
  if (pmIn[K.pix] && conta.chave_pix) forma[K.pix] = { [K.pix_chave]: conta.chave_pix, [K.pix_tipo]: 'EVP' };
  // encargos: só os campos conhecidos, com os tipos permitidos
  const fIn = pedido[K.encargos] && typeof pedido[K.encargos] === 'object' ? pedido[K.encargos] : null;
  let fees = null;
  if (fIn) {
    fees = {};
    const tipos = { [K.multa_tipo]: Object.values(M.TIPOS_ENCARGO.multa), [K.juros_tipo]: Object.values(M.TIPOS_ENCARGO.juros), [K.desconto_tipo]: Object.values(M.TIPOS_ENCARGO.desconto) };
    for (const [k, permitidos] of Object.entries(tipos)) if (fIn[k] !== undefined) { if (!permitidos.includes(fIn[k])) throw new ErroHttp(400, `${k} inválido.`); fees[k] = fIn[k]; }
    for (const k of [K.multa_valor, K.juros_valor, K.desconto_valor]) if (fIn[k] !== undefined) { const n = numero2(fIn[k]); if (!(n >= 0)) throw new ErroHttp(400, `${k} inválido.`); fees[k] = n; }
    for (const k of [K.multa_prazo, K.juros_prazo, K.desconto_prazo]) if (fIn[k] !== undefined) { const n = inteiro(fIn[k]); if (n === null) throw new ErroHttp(400, `${k} inválido.`); fees[k] = n; }
    if (!Object.keys(fees).length) fees = null;
  }
  // avisos ao pagador: só EMAIL para o e-mail do pagador e SMS para o telefone do pagador; momentos conhecidos
  const N = M.NOTIFICACAO;
  const nIn = Array.isArray(pedido[N.campo]) ? pedido[N.campo] : [];
  const avisos = [];
  for (const n of nIn.slice(0, 8)) {
    if (!n || typeof n !== 'object') continue;
    const canal = n[N.canal]; const destino = texto(n[N.destino], 70); const momento = n[N.momento];
    if (!Object.values(N.canais).includes(canal) || !Object.values(N.momentos).includes(momento)) throw new ErroHttp(400, 'Aviso ao pagador com canal ou momento inválido.');
    if (canal === N.canais.email && (!email || destino !== email)) throw new ErroHttp(400, 'Aviso por e-mail só para o e-mail do próprio pagador.');
    if (canal === N.canais.sms && (!telefone || destino.replace(/\D/g, '') !== telefone)) throw new ErroHttp(400, 'Aviso por SMS só para o telefone do próprio pagador.');
    avisos.push({ [N.canal]: canal, [N.destino]: canal === N.canais.sms ? telefone : email, [N.momento]: momento });
  }
  const final = { [K.referencia]: ref, [K.valor]: valor, [K.vencimento]: vencimento, [K.descricao]: descricao, [K.pagador]: pagador, [K.forma]: forma };
  const diasBaixa = pedido[K.dias_baixa] === undefined ? null : inteiro(pedido[K.dias_baixa]);
  if (diasBaixa !== null) final[K.dias_baixa] = diasBaixa;
  if (fees) final[K.encargos] = fees;
  if (avisos.length) final[N.campo] = avisos;
  const origem = texto(pedido[K.origem], L.origem).replace(/[^A-Za-z0-9 _-]/g, '');
  if (origem) final[K.origem] = origem;
  return final;
}

/** Itens de uma listagem do C6 (``content[]``). */
const itensDaLista = (dados) => (Array.isArray(dados) ? dados : (dados && (dados[M.RESPOSTA.lista] || dados.bank_slips || dados.items)) || []);

/** Consulta no C6 juntando os pagamentos (que só vêm na listagem) quando o boleto consta como pago ou aguardando crédito. */
async function consultarNoC6(cfg, conta, id) {
  const r = await chamarC6(cfg, conta, 'GET', M.CAMINHOS.boleto(id, versao(conta)));
  const dados = r.dados || {};
  const st = String(dados[M.RESPOSTA.situacao] || '').toUpperCase();
  if ((st === M.STATUS.pago || st === M.STATUS.aguardando_credito) && !Array.isArray(dados[M.RESPOSTA.pagamentos]) && dados[M.RESPOSTA.vencimento]) {
    try {
      const q = new URLSearchParams({ external_reference_id: id, due_date_from: dados[M.RESPOSTA.vencimento], due_date_to: dados[M.RESPOSTA.vencimento], size: '20' });
      const lista = await chamarC6(cfg, conta, 'GET', `${M.CAMINHOS.boletos(versao(conta))}?${q}`);
      const achado = itensDaLista(lista.dados).find((x) => x && x[M.RESPOSTA.referencia] === id);
      if (achado && Array.isArray(achado[M.RESPOSTA.pagamentos])) dados[M.RESPOSTA.pagamentos] = achado[M.RESPOSTA.pagamentos];
    } catch (e) { dados.aviso_pagamentos = `Não deu para ler a data do pagamento na listagem: ${e.message}`; }
  }
  return dados;
}

const simuladoOuErro = (conta, id) => {
  const r = simulados.get(chaveSim(conta, id));
  if (!r) throw new ErroHttp(404, 'Boleto fictício não encontrado na ponte (ela foi reiniciada? no modo simulado os boletos ficam só na memória).');
  return r;
};

export const SERVICOS = {
  boletos: {
    descricao: 'Boleto com Pix (bolepix)',
    rotas: [
      // BP_01 emitir
      { metodo: 'POST', padrao: /^\/boletos\/?$/, async executar({ cfg, conta, corpo }) {
        const pedido = montarPedidoSeguro(corpo, conta);
        if (cfg.simulado) {
          // o mesmo external_reference_id devolve a cobrança já feita
          const existente = simulados.get(chaveSim(conta, pedido[M.CAMPOS.referencia]));
          if (existente) return { status: 200, dados: { ...respostaEmissao(existente), ambiente: conta.ambiente } };
          const r = respostaSimulada(conta.id, pedido, conta.ambiente);
          simulados.set(chaveSim(conta, r.external_reference_id), r);
          return { status: 201, dados: { ...respostaEmissao(r), ambiente: conta.ambiente } };
        }
        exigirConfigurada(conta);
        const r = await chamarC6(cfg, conta, 'POST', M.CAMINHOS.boletos(versao(conta)), pedido);
        return { status: 201, dados: { ...r.dados, ambiente: conta.ambiente } };
      } },
      // BP_06 listar (um intervalo de datas obrigatório, até 60 dias; status, external_reference_id, page, size)
      { metodo: 'GET', padrao: /^\/boletos\/?$/, async executar({ cfg, conta, query }) {
        if (cfg.simulado) {
          let itens = [...simulados.entries()].filter(([k]) => k.startsWith(`${conta.id}|`)).map(([, v]) => v);
          if (query.get('status')) itens = itens.filter((x) => x.status === query.get('status'));
          if (query.get('external_reference_id')) itens = itens.filter((x) => x.external_reference_id === query.get('external_reference_id'));
          const size = Math.min(100, Number(query.get('size') || 20));
          const page = Number(query.get('page') || 0);
          return { status: 200, dados: { content: itens.slice(page * size, page * size + size), total_elements: itens.length, total_pages: Math.ceil(itens.length / size), page, size, ambiente: conta.ambiente } };
        }
        exigirConfigurada(conta);
        const filtros = {};
        for (const k of M.FILTROS_LISTA) if (k !== 'page' && k !== 'size' && query.get(k)) filtros[k] = query.get(k);
        if (!Object.keys(filtros).some((k) => /_from$/.test(k))) throw new ErroHttp(400, 'Informe um intervalo de datas (ex.: payment_date_from e payment_date_to, até 60 dias).');
        // a listagem do C6 é uma só (c6-boletos-listar.mjs, a mesma da conferência da fase 2): todas as páginas de uma vez, sem repetir
        const c6 = { conta: conta.id, async chamar(metodo, caminho, { query: q = {} } = {}) { const r = await chamarC6(cfg, conta, metodo, `${caminho}?${new URLSearchParams(q)}`); return { status: r.status, corpo: r.dados }; } };
        const content = await listarPaginas(c6, filtros, { caminho: M.CAMINHOS.boletos(versao(conta)) });
        return { status: 200, dados: { content, total_elements: content.length, total_pages: 1, page: 0, size: content.length, ambiente: conta.ambiente } };
      } },
      // BP_03 consultar
      { metodo: 'GET', padrao: /^\/boletos\/([A-Za-z0-9_-]+)\/?$/, async executar({ cfg, conta, params }) {
        if (cfg.simulado) return { status: 200, dados: { ...simuladoOuErro(conta, params[0]), ambiente: conta.ambiente } };
        exigirConfigurada(conta);
        return { status: 200, dados: { ...(await consultarNoC6(cfg, conta, params[0])), ambiente: conta.ambiente } };
      } },
      // BP_02 atualizar (parcial): amount, due_date, description, days_after_due_date, payer{email,address}, payer_notification, fees, bank_slip{your_number, instructions}
      { metodo: 'POST', padrao: /^\/boletos\/([A-Za-z0-9_-]+)\/alterar\/?$/, async executar({ cfg, conta, params, corpo }) {
        const K = M.CAMPOS;
        const mudancas = {};
        const aceitos = [K.valor, K.vencimento, K.descricao, K.dias_baixa, K.pagador, M.NOTIFICACAO.campo, K.encargos, K.forma, K.origem];
        for (const k of aceitos) if (corpo && corpo[k] !== undefined) mudancas[k] = corpo[k];
        if (mudancas[K.vencimento] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(mudancas[K.vencimento]))) throw new ErroHttp(400, `${K.vencimento} precisa ser AAAA-MM-DD.`);
        if (mudancas[K.valor] !== undefined && !(Number(mudancas[K.valor]) > 0)) throw new ErroHttp(400, `${K.valor} precisa ser maior que zero.`);
        if (mudancas[K.descricao] !== undefined) mudancas[K.descricao] = String(mudancas[K.descricao]).slice(0, M.LIMITES.descricao);
        if (!Object.keys(mudancas).length) throw new ErroHttp(400, `Informe o que alterar (${aceitos.join(', ')}).`);
        if (cfg.simulado) {
          const r = simuladoOuErro(conta, params[0]);
          if (r.status !== M.STATUS.criado) throw new ErroHttp(409, 'Só um boleto em aberto pode ser alterado.');
          if (mudancas[K.valor] !== undefined) r.amount = Number(Number(mudancas[K.valor]).toFixed(2));
          if (mudancas[K.vencimento] !== undefined) r.due_date = mudancas[K.vencimento];
          if (mudancas[K.descricao] !== undefined) r.description = mudancas[K.descricao];
          if (mudancas[K.dias_baixa] !== undefined) r.days_after_due_date = mudancas[K.dias_baixa];
          return { status: 200, dados: { ...r, ambiente: conta.ambiente } };
        }
        exigirConfigurada(conta);
        const r = await chamarC6(cfg, conta, 'PATCH', M.CAMINHOS.boleto(params[0], versao(conta)), mudancas);
        const dados = r.dados && r.dados[M.RESPOSTA.referencia] ? r.dados : await consultarNoC6(cfg, conta, params[0]);
        return { status: 200, dados: { ...dados, ambiente: conta.ambiente } };
      } },
      // BP_05 cancelar (baixa): 204 no banco; devolvemos a consulta depois
      { metodo: 'POST', padrao: /^\/boletos\/([A-Za-z0-9_-]+)\/cancelar\/?$/, async executar({ cfg, conta, params }) {
        if (cfg.simulado) {
          const r = simuladoOuErro(conta, params[0]);
          if (r.status === M.STATUS.pago) throw new ErroHttp(409, 'Este boleto já foi pago: não dá para cancelar.');
          r.status = M.STATUS.cancelado[0];
          for (const n of r.payer_notification || []) if (n.status !== 'SENT') n.status = 'CANCELED';
          return { status: 200, dados: { ...r, ambiente: conta.ambiente } };
        }
        exigirConfigurada(conta);
        await chamarC6(cfg, conta, 'PUT', M.CAMINHOS.cancelar(params[0], versao(conta)), null);
        let dados = { [M.RESPOSTA.referencia]: params[0], [M.RESPOSTA.situacao]: M.STATUS.cancelado[0] };
        try { dados = await consultarNoC6(cfg, conta, params[0]); } catch { /* fica o status local */ }
        return { status: 200, dados: { ...dados, ambiente: conta.ambiente } };
      } },
      // BP_04 PDF (application/pdf)
      { metodo: 'GET', padrao: /^\/boletos\/([A-Za-z0-9_-]+)\/pdf\/?$/, async executar({ cfg, conta, params }) {
        if (cfg.simulado) throw new ErroHttp(501, 'No modo simulado não há PDF.');
        exigirConfigurada(conta);
        const r = await chamarC6(cfg, conta, 'GET', M.CAMINHOS.pdf(params[0], versao(conta)), null, { binario: true });
        if (/json/i.test(r.tipo)) {
          let j = null;
          try { j = JSON.parse(r.corpo.toString('utf8')); } catch { /* não é JSON */ }
          const b64 = j && (j.base64_pdf_file || j.pdf || j.file);
          if (b64) return { status: 200, binario: Buffer.from(b64, 'base64'), tipo: 'application/pdf' };
        }
        return { status: 200, binario: r.corpo, tipo: 'application/pdf' };
      } },
      // negativação do pagador: POST …/denial { deadline: dias de atraso } → 201 { id, external_reference_id, status, denial_date }
      { metodo: 'POST', padrao: /^\/boletos\/([A-Za-z0-9_-]+)\/negativar\/?$/, async executar({ cfg, conta, params, corpo }) {
        const dias = corpo && Number(corpo[M.CAMPOS.negativacao_prazo]);
        if (!Number.isInteger(dias) || dias < 0) throw new ErroHttp(400, `Informe ${M.CAMPOS.negativacao_prazo} (dias de atraso, inteiro).`);
        if (cfg.simulado) {
          const r = simuladoOuErro(conta, params[0]);
          if (r.status !== M.STATUS.criado) throw new ErroHttp(409, 'Só um boleto em aberto pode ser negativado.');
          const data = new Date(`${r.due_date}T12:00:00Z`); data.setUTCDate(data.getUTCDate() + dias);
          r.denial_info = { status: M.STATUS_NEGATIVACAO.agendada, denial_date: data.toISOString().slice(0, 10), can_cancel: true };
          return { status: 201, dados: { id: r.id, external_reference_id: r.external_reference_id, status: r.denial_info.status, denial_date: r.denial_info.denial_date, ambiente: conta.ambiente } };
        }
        exigirConfigurada(conta);
        const r = await chamarC6(cfg, conta, 'POST', M.CAMINHOS.negativacao(params[0], versao(conta)), { [M.CAMPOS.negativacao_prazo]: dias });
        return { status: 201, dados: { ...r.dados, ambiente: conta.ambiente } };
      } },
      { metodo: 'POST', padrao: /^\/boletos\/([A-Za-z0-9_-]+)\/negativar\/cancelar\/?$/, async executar({ cfg, conta, params }) {
        if (cfg.simulado) {
          const r = simuladoOuErro(conta, params[0]);
          if (!r.denial_info || !r.denial_info.can_cancel) throw new ErroHttp(409, 'Não há negativação que possa ser cancelada.');
          r.denial_info = { ...r.denial_info, status: M.STATUS_NEGATIVACAO.cancelamento_agendado, can_cancel: false };
          return { status: 200, dados: { ...r, ambiente: conta.ambiente } };
        }
        exigirConfigurada(conta);
        await chamarC6(cfg, conta, 'DELETE', M.CAMINHOS.negativacao(params[0], versao(conta)), null);
        return { status: 200, dados: { ...(await consultarNoC6(cfg, conta, params[0])), ambiente: conta.ambiente } };
      } },
      // só no modo simulado: marca o boleto fictício como pago (corpo opcional { payment_date, credit_date, amount, aguardando })
      { metodo: 'POST', padrao: /^\/simulado\/pagar\/([A-Za-z0-9_-]+)\/?$/, async executar({ cfg, conta, params, corpo }) {
        if (!cfg.simulado) throw new ErroHttp(404, 'Rota só do modo simulado.');
        const r = simuladoOuErro(conta, params[0]);
        const hoje = new Date().toISOString().slice(0, 10);
        r.status = corpo && corpo.aguardando ? M.STATUS.aguardando_credito : M.STATUS.pago;
        // como na listagem do C6: payments[] { amount (texto), external_payment_id, payment_date, credit_date, payment_type }
        r.payments = [{ amount: Number(corpo && corpo.amount !== undefined ? corpo.amount : r.amount).toFixed(2), external_payment_id: crypto.randomUUID(),
          payment_date: (corpo && corpo.payment_date) || hoje, credit_date: (corpo && corpo.credit_date) || (corpo && corpo.payment_date) || hoje, payment_type: 'PIX' }];
        return { status: 200, dados: { ...r, ambiente: conta.ambiente } };
      } },
    ],
  },
  notificacoes: {
    descricao: 'Avisos recebidos do banco pelo webhook',
    rotas: [
      { metodo: 'GET', padrao: /^\/notificacoes\/?$/, async executar({ cfg, conta, query }) {
        const desde = query.get('desde') || '';
        return { status: 200, dados: { conta: conta.id, notificacoes: lerNotificacoes(cfg, conta.id).filter((n) => !desde || n.recebida_em >= desde) } };
      } },
    ],
  },
  // Próximos serviços (outros agentes): extrato, comprovantes, pagamentos. Modelo: { descricao, rotas: [{ metodo, padrao, executar }] }
};

function exigirConfigurada(conta) {
  const faltam = faltamNaConta(conta);
  if (faltam.length) throw new ErroHttp(503, `A conta "${conta.id}" ainda não tem as chaves da API do C6. Faltam: ${faltam.join(', ')}. Para testar sem o banco, ligue SIMULADO=1 no .env da ponte.`);
}

// --------------------------------------------------------------------------
// Webhook do banco: guarda cada aviso em notificacoes/<conta>.jsonl (um JSON por linha)
// --------------------------------------------------------------------------
// Cadastro no C6: POST /v1/webhooks { url, service: 'BANK_SLIP_PIX' } (consulta GET /v1/webhooks?service=…, DELETE idem). O aviso NÃO tem
// assinatura nem cabeçalho de autenticação, então é só um sinal: o site reconsulta o boleto (GET) antes de registrar o pagamento.
// Aviso: { service, status: 'CREATED'|'WAITING_CONFIRMATION'|'PAID'|'CANCELED', information: '<JSON em texto> { id, external_reference_id,
//   amount, status, emission_date, due_date, … }' }. Para o C6 chamar esta rota a ponte precisa de um endereço público (túnel ou
// servidor); sem isso, os botões "Consultar situação" e "Conferir pagamentos no banco" resolvem.
/** Guarda só o que importa do aviso (a referência a reconsultar e a situação), num arquivo por dia. */
function guardarNotificacao(cfg, contaId, corpo) {
  fs.mkdirSync(cfg.pastaNotificacoes, { recursive: true });
  let info = null;
  try { info = corpo && typeof corpo[M.AVISO_WEBHOOK.dados] === 'string' ? JSON.parse(corpo[M.AVISO_WEBHOOK.dados]) : (corpo && corpo[M.AVISO_WEBHOOK.dados]) || null; } catch { info = null; }
  const ref = (info && info[M.AVISO_WEBHOOK.dados_referencia]) || (corpo && corpo.external_reference_id) || null;
  if (!ref || !/^[A-Z0-9]{1,40}$/.test(String(ref))) throw new ErroHttp(400, 'Aviso sem external_reference_id reconhecível.');
  const n = { recebida_em: new Date().toISOString(), conta: contaId, external_reference_id: String(ref), status: corpo && corpo[M.AVISO_WEBHOOK.situacao] ? String(corpo[M.AVISO_WEBHOOK.situacao]).slice(0, 40) : null, reconsultar: true };
  fs.appendFileSync(path.join(cfg.pastaNotificacoes, `${contaId}-${n.recebida_em.slice(0, 10)}.jsonl`), `${JSON.stringify(n)}\n`);
  return n;
}

export function lerNotificacoes(cfg, contaId) {
  if (!fs.existsSync(cfg.pastaNotificacoes)) return [];
  return fs.readdirSync(cfg.pastaNotificacoes).filter((a) => a === `${contaId}.jsonl` || (a.startsWith(`${contaId}-`) && a.endsWith('.jsonl'))).sort()
    .flatMap((a) => fs.readFileSync(path.join(cfg.pastaNotificacoes, a), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
}

// --------------------------------------------------------------------------
// Saúde
// --------------------------------------------------------------------------
export async function saudeDaConta(cfg, conta, testarToken = true) {
  const faltam = faltamNaConta(conta);
  const v = validadeCertificado(conta);
  const r = { id: conta.id, ambiente: conta.ambiente, versao_boleto: conta.versao_boleto, configurado: faltam.length === 0, faltam, webhook: !!conta.webhook_token, valor_maximo: conta.valor_maximo,
    certificado: faltam.some((f) => /certificado|chave/.test(f)) ? 'faltando' : 'ok', certificado_valido_ate: v ? v.valido_ate : null, certificado_dias: v ? v.dias : null,
    avisos: v && v.dias >= 0 && v.dias <= 30 ? [`O certificado vence em ${v.dias} dia(s) (${v.valido_ate}): gere outro no Web Banking do C6 antes disso.`] : [], token: null, simulado: cfg.simulado };
  if ([conta.certificado, conta.chave].some(permissaoAberta)) r.avisos.push('O certificado ou a chave privada podem ser lidos por outros usuários deste computador: rode chmod 600 neles.');
  if (cfg.simulado) { r.token = 'simulado'; return r; }
  if (!r.configurado || !testarToken) return r;
  try {
    await obterToken(conta, false, cfg);
    r.token = 'ok';
    const escopos = (tokens.get(conta.id) || {}).escopos || [];
    r.escopos = escopos;
    const faltamEscopos = ESCOPOS_BOLEPIX.filter((e) => escopos.length && !escopos.includes(e));
    if (faltamEscopos.length) r.avisos.push(`Faltam escopos na credencial: ${faltamEscopos.join(', ')} (as chamadas do boleto voltariam 403; peça ao C6).`);
  } catch (e) {
    r.token = 'falhou';
    r.erro_token = e.message;
  }
  return r;
}

export async function saude(cfg, testarToken = true) {
  const contas = {};
  for (const conta of Object.values(cfg.contas)) contas[conta.id] = await saudeDaConta(cfg, conta, testarToken);
  const lista = Object.values(contas);
  const faltam = [];
  if (!lista.length) faltam.push('nenhuma conta configurada (CONTAS=ank,jck no .env ou subpastas em contas/)');
  for (const c of lista) if (!c.configurado && !cfg.simulado) faltam.push(`conta ${c.id}: ${c.faltam.join(', ')}`);
  return { ponte: true, versao: VERSAO, simulado: cfg.simulado, faixa: cfg.simulado ? 'MODO SIMULADO: boletos e extratos fictícios, nada vai ao banco' : null, exposta: cfg.exposta, pagamentos: cfg.pagamentos, aviso: cfg.exposta ? 'PONTE EXPOSTA fora deste computador: proteja com Cloudflare Access ou Tailscale.' : null,
    senha_exigida: !!cfg.senha, configurado: lista.length > 0 && faltam.length === 0, faltam, contas, servicos: Object.keys(SERVICOS), registros: !!cfg.pastaRegistros };
}

/** Saúde mínima, para quem não tem a senha: só diz se está configurada, simulada e exposta. */
export async function saudeMinima(cfg) {
  const s = await saude(cfg, false);
  return { ponte: true, configurado: s.configurado, simulado: s.simulado, exposta: s.exposta, senha_exigida: s.senha_exigida };
}

// --------------------------------------------------------------------------
// Servidor HTTP (CORS restrito às origens configuradas; senha no cabeçalho X-Senha-Ponte)
// --------------------------------------------------------------------------
const CABECALHO_SENHA = 'x-senha-ponte';

function cors(cfg, req, res) {
  const origem = req.headers.origin;
  if (origem && (cfg.origens.includes('*') || cfg.origens.includes(origem))) {
    res.setHeader('Access-Control-Allow-Origin', origem);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', `Content-Type, Accept, ${CABECALHO_SENHA}`);
  res.setHeader('Access-Control-Max-Age', '600');
  // o Chrome exige isto para um site público (GitHub Pages) chamar um endereço local
  if (req.method === 'OPTIONS') res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

// Tentativas de senha: atraso progressivo (1 s, 2 s, 4 s… até 8 s) e, após 10 erros seguidos do mesmo IP, 15 minutos sem atender
const TENTATIVAS_MAX = 10;
const BLOQUEIO_MS = 15 * 60000;
const tentativas = new Map(); // ip → { erros, bloqueadoAte }
/** IP de quem chama: o que o Cloudflare informa (CF-Connecting-IP), senão o do socket. */
const ipDe = (req) => String(req.headers['cf-connecting-ip'] || (req.socket && req.socket.remoteAddress) || 'desconhecido').slice(0, 64);
/** Segundos de espera antes de responder a mais uma senha errada deste IP (0 no primeiro erro). */
export const atrasoDe = (ip) => { const t = tentativas.get(ip); return t && t.erros ? Math.min(8, 2 ** (t.erros - 1)) : 0; };
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
export function bloqueado(ip, agora = Date.now()) {
  const t = tentativas.get(ip);
  if (t && t.bloqueadoAte && t.bloqueadoAte > agora) return Math.ceil((t.bloqueadoAte - agora) / 60000);
  if (t && t.bloqueadoAte && t.bloqueadoAte <= agora) tentativas.delete(ip);
  return 0;
}
export function registrarTentativa(ip, acertou, agora = Date.now()) {
  if (acertou) { tentativas.delete(ip); return; }
  const t = tentativas.get(ip) || { erros: 0, bloqueadoAte: 0 };
  t.erros += 1;
  if (t.erros >= TENTATIVAS_MAX) { t.bloqueadoAte = agora + BLOQUEIO_MS; t.erros = 0; console.error(`${new Date(agora).toISOString()} ${ip}: ${TENTATIVAS_MAX} senhas erradas, bloqueado por 15 minutos`); }
  else console.error(`${new Date(agora).toISOString()} ${ip}: senha errada (${t.erros})`);
  tentativas.set(ip, t);
}

const responderJson = (res, status, dados) => {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(corpo) });
  res.end(corpo);
};

function lerCorpo(req, maximo = 256 * 1024) {
  return new Promise((resolver, falhar) => {
    const partes = [];
    let tamanho = 0;
    req.on('data', (p) => { tamanho += p.length; if (tamanho > maximo) { req.destroy(); falhar(new ErroHttp(413, 'Pedido grande demais.')); } partes.push(p); });
    req.on('end', () => {
      const texto = Buffer.concat(partes).toString('utf8');
      if (!texto.trim()) return resolver(null);
      try { resolver(JSON.parse(texto)); } catch { falhar(new ErroHttp(400, 'O corpo do pedido não é um JSON válido.')); }
    });
    req.on('error', falhar);
  });
}

const senhaConfere = (cfg, req) => {
  if (!cfg.senha) return false;
  const dada = String(req.headers[CABECALHO_SENHA] || '');
  const a = Buffer.from(dada);
  const b = Buffer.from(cfg.senha);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// --------------------------------------------------------------------------
// Fase 2 (extrato, saldo, boletos pagos, DDA, pagamentos, comprovante): rotas de rotas-fase2.mjs montadas sobre um cliente
// autenticado por conta ({ conta, chamar(metodo, caminho, { query, corpo, aceitar }) → { status, corpo } }); no modo simulado,
// o C6 de mentira de c6-simulado.mjs. As rotas de pagamento só existem com PAGAMENTOS=1 no .env.
// --------------------------------------------------------------------------
const clientesC6 = new Map();

/** Cliente real de uma conta no formato que a fase 2 espera (não lança em 4xx/5xx: devolve { status, corpo }). */
function c6RealDaConta(cfg, conta) {
  const chave = `${conta.id}|${conta.url_base}`;
  if (clientesC6.has(chave)) return clientesC6.get(chave);
  const cliente = {
    conta: conta.id,
    async chamar(metodo, caminho, { query = {}, corpo = null, aceitar = 'application/json' } = {}) {
      exigirConfigurada(conta);
      const q = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]));
      const binario = /pdf/i.test(aceitar);
      const token = await obterToken(conta, false, cfg);
      const cabecalhos = { Authorization: `Bearer ${token}`, Accept: aceitar, 'partner-software-name': cfg.software.nome, 'partner-software-version': cfg.software.versao };
      if (corpo !== null) cabecalhos['Content-Type'] = 'application/json';
      const r = await pedir(`${conta.url_base}${caminho}${q.toString() ? `?${q}` : ''}`, { metodo, cabecalhos, corpo: corpo !== null ? JSON.stringify(corpo) : null, conta, binario });
      registrarChamada(cfg, conta, metodo, caminho, r.status, binario ? `(${r.corpo ? r.corpo.length : 0} bytes)` : r.dados);
      return { status: r.status, corpo: binario ? r.corpo : r.dados };
    },
  };
  clientesC6.set(chave, cliente);
  return cliente;
}

function montarFase2(cfg) {
  return rotasFase2({
    c6DaConta: (id) => { const conta = cfg.contas[id]; if (!conta) return null; return cfg.simulado ? c6SimuladoDaConta(id) : c6RealDaConta(cfg, conta); },
    registrar: (t) => console.log(`${new Date().toISOString()} ${t}`),
    empresas: Object.fromEntries(Object.values(cfg.contas).map((c) => [c.id, c.empresa])),
  });
}

/** Atende uma rota da fase 2 se o caminho for dela; devolve false se não for. */
async function atenderFase2(cfg, req, res, caminho, url) {
  if (!cfg.rotasFase2) cfg.rotasFase2 = montarFase2(cfg);
  const rota = cfg.rotasFase2.find((r) => r.metodo === req.method && r.caminho.test(caminho));
  if (!rota) return false;
  if (/\/pagamentos\//.test(rota.padrao) && !cfg.pagamentos) throw new ErroHttp(403, 'As rotas de pagamento estão desligadas nesta ponte (PAGAMENTOS=1 no .env liga).');
  const params = rota.caminho.exec(caminho).groups || {};
  const corpo = req.method === 'POST' || req.method === 'DELETE' ? await lerCorpo(req) : null;
  const r = await rota.handler(req, { conta: params.conta, params, query: Object.fromEntries(url.searchParams), corpo });
  if (r.pdf) {
    res.writeHead(r.status, { 'Content-Type': 'application/pdf', 'Content-Length': r.pdf.length, ...(r.cabecalhos || {}) });
    res.end(r.pdf);
    return true;
  }
  responderJson(res, r.status, r.corpo);
  return true;
}

/** Trata um pedido HTTP. Exportado para os testes. */
export async function tratar(cfg, req, res) {
  cors(cfg, req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://ponte');
  const caminho = url.pathname.replace(/\/+$/, '') || '/';
  try {
    // webhook do banco: sem a senha da ponte (quem chama é o C6), sem CORS
    // o endereço do webhook leva um segredo (C6_<ID>_WEBHOOK_TOKEN); sem o segredo configurado, a rota nem existe
    let m = /^\/webhook\/c6\/([a-z0-9_-]+)\/([0-9a-f]{32})$/i.exec(caminho);
    if (m || caminho.startsWith('/webhook/')) {
      const conta = m && cfg.contas[m[1]];
      const ok = conta && conta.webhook_token && Buffer.from(m[2].toLowerCase()).length === Buffer.from(conta.webhook_token.toLowerCase()).length && crypto.timingSafeEqual(Buffer.from(m[2].toLowerCase()), Buffer.from(conta.webhook_token.toLowerCase()));
      if (!ok) throw new ErroHttp(404, 'Rota não existe.');
      if (req.method !== 'POST') throw new ErroHttp(405, 'Use POST.');
      const corpo = await lerCorpo(req, 64 * 1024);
      const n = guardarNotificacao(cfg, m[1], corpo);
      console.log(`${new Date().toISOString()} webhook ${m[1]}: ${n.external_reference_id} ${n.status || ''} (reconsultar)`);
      res.writeHead(204);
      return res.end();
    }
    const ip = ipDe(req);
    const minutos = bloqueado(ip);
    if (minutos) throw new ErroHttp(429, `Muitas senhas erradas: tente de novo em ${minutos} minuto(s).`);
    const comSenha = senhaConfere(cfg, req);
    const semSenhaNoPedido = !req.headers[CABECALHO_SENHA];
    if (!comSenha && !semSenhaNoPedido) { const atraso = atrasoDe(ip); registrarTentativa(ip, false); if (atraso && !cfg.sem_atraso) await esperar(atraso * 1000); }
    if (comSenha) registrarTentativa(ip, true);
    if ((caminho === '/saude' || caminho === '/') && req.method === 'GET') {
      // sem a senha: só o essencial (configurada? simulada? exposta?); com a senha: contas, escopos, validade do certificado
      return responderJson(res, 200, comSenha ? await saude(cfg, url.searchParams.get('token') !== '0') : await saudeMinima(cfg));
    }
    if (!comSenha) throw new ErroHttp(401, 'Senha da ponte incorreta ou ausente (cabeçalho X-Senha-Ponte).');
    if (caminho === '/roteiro') { if (req.method !== 'GET') throw new ErroHttp(405, 'Use GET.'); return responderJson(res, 200, { testes: NOMES_TESTES, registros: registrosDoRoteiro(cfg, Number(url.searchParams.get('n') || 3)), texto: textoRoteiro(cfg) }); }
    if (caminho === '/contas') { if (req.method !== 'GET') throw new ErroHttp(405, 'Use GET.'); return responderJson(res, 200, { contas: Object.values((await saude(cfg, false)).contas) }); }
    m = /^\/contas\/([a-z0-9_-]+)(\/.*)?$/.exec(caminho);
    if (!m) throw new ErroHttp(404, `Rota não existe: ${req.method} ${caminho}`);
    const conta = cfg.contas[m[1]];
    if (!conta) throw new ErroHttp(404, `Conta "${m[1]}" não configurada na ponte (CONTAS=${Object.keys(cfg.contas).join(',') || 'vazio'}).`);
    const resto = m[2] || '/';
    if (await atenderFase2(cfg, req, res, caminho, url)) return undefined;
    if (resto === '/saude' || resto === '/') { if (req.method !== 'GET') throw new ErroHttp(405, 'Use GET.'); return responderJson(res, 200, await saudeDaConta(cfg, conta)); }
    for (const servico of Object.values(SERVICOS)) {
      for (const rota of servico.rotas) {
        const mr = rota.padrao.exec(resto);
        if (!mr || rota.metodo !== req.method) continue;
        const corpo = req.method === 'POST' || req.method === 'DELETE' ? await lerCorpo(req) : null;
        const r = await rota.executar({ cfg, conta, params: mr.slice(1), corpo, query: url.searchParams });
        if (r.binario) { res.writeHead(r.status, { 'Content-Type': r.tipo, 'Content-Length': r.binario.length }); return res.end(r.binario); }
        return responderJson(res, r.status, r.dados);
      }
    }
    throw new ErroHttp(404, `Rota não existe: ${req.method} ${caminho}`);
  } catch (e) {
    const status = e instanceof ErroHttp ? e.status : 500;
    if (status >= 500) console.error(`${new Date().toISOString()} ${req.method} ${caminho}: ${e.stack || e.message}`);
    // 500: nada do que aconteceu dentro da ponte vai para fora (caminhos de disco, pilha); o detalhe fica no console
    return responderJson(res, status, status >= 500 && !(e instanceof ErroHttp) ? { erro: 'A ponte teve um erro interno. Veja o console da ponte.' } : { erro: e.message, detalhes: e.detalhes || null });
  }
}

export function criarServidor(cfg) {
  const ouvinte = (req, res) => tratar(cfg, req, res);
  if (cfg.https) return https.createServer({ cert: fs.readFileSync(cfg.https.cert), key: fs.readFileSync(cfg.https.key) }, ouvinte);
  return http.createServer(ouvinte);
}

async function principal() {
  lerEnv(path.join(PASTA, '.env'));
  let cfg;
  try { cfg = carregarConfig(); } catch (e) { console.error(`A ponte não subiu: ${e.message}`); process.exitCode = 1; return null; }
  if (process.argv.includes('--roteiro')) { console.log(textoRoteiro(cfg)); return null; }
  const apagados = apagarAntigos(cfg);
  if (apagados) console.log(`${apagados} arquivo(s) de registro com mais de ${cfg.retencao_registros_dias} dias apagado(s).`);
  const servidor = criarServidor(cfg);
  servidor.listen(cfg.porta, cfg.host, async () => {
    const s = await saude(cfg, false);
    console.log(`Ponte C6 v${VERSAO} em ${cfg.https ? 'https' : 'http'}://${cfg.host}:${cfg.porta}${cfg.simulado ? ' · MODO SIMULADO (sem falar com o banco)' : ''}`);
    if (cfg.exposta) console.log('\n' + '!'.repeat(78) + '\n!!  PONTE EXPOSTA FORA DESTE COMPUTADOR (EXPOR=1). Qualquer um que alcance esta porta pode tentar a senha.\n!!  Proteja o acesso com Cloudflare Access ou Tailscale e use HTTPS (PONTE_HTTPS_CERT/CHAVE).\n' + '!'.repeat(78) + '\n');
    console.log(`Origens aceitas: ${cfg.origens.join(', ')} · senha da ponte: ${cfg.senha ? 'exigida' : 'NÃO definida (defina PONTE_SENHA no .env)'}`);
    if (cfg.pastaRegistros) console.log(`Cada chamada ao banco fica registrada em ${cfg.pastaRegistros} (status, id e erro; sem dados pessoais; ${cfg.retencao_registros_dias} dias). node servidor.mjs --roteiro mostra o resumo para a homologação.`);
    if (cfg.pagamentos) console.log('Rotas de pagamento (fase 2) LIGADAS (PAGAMENTOS=1): a ponte monta lotes para aprovação no app do C6.');
    if (!Object.keys(cfg.contas).length) console.log('Nenhuma conta configurada: defina CONTAS=ank,jck no .env e as chaves de cada uma (veja README.md).');
    for (const c of Object.values(s.contas)) console.log(`Conta ${c.id} (${c.ambiente}): ${c.configurado ? 'chaves ok' : `faltam ${c.faltam.join(', ')}`}`);
  });
  return servidor;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) principal();
