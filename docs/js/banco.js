// Cliente da ponte do banco (ponte-c6/servidor.mjs): o navegador não fala com o C6 direto (a API exige certificado mTLS),
// então o site chama a ponte, um programinha Node no computador do usuário, que guarda as chaves de cada conta (ANK, JCK…).
// Tudo é genérico por conta: ``chamarPonte(contaId, metodo, caminho, corpo)`` → ``<ponte_url>/contas/<contaId><caminho>``.
// Boleto hoje; extrato, comprovantes e pagamento de contas depois, com as mesmas peças.
// Dinheiro no sistema é em centavos inteiros; a conversão para o formato da API fica em regras.js (``pedidoBoletoC6``,
// ``normalizarRespostaC6``). Este arquivo não grava nada no banco de dados: quem grava é a tela, com ``alterar((db) => …)``.
import * as S from './armazenamento.js';
import * as R from './regras.js';

/** Cabeçalho com a senha da ponte (combinada no .env dela: PONTE_SENHA). */
export const CABECALHO_SENHA = 'X-Senha-Ponte';

/** Tempo máximo de espera por resposta da ponte (o banco pode demorar). */
const TEMPO_LIMITE_MS = 30000;

/**
 * Consultas que a ponte faz em várias chamadas ao banco, uma depois da outra (1 ano de extrato são 13 chamadas de até 25 s cada;
 * a lista de boletos vem em páginas): esperar só 30 s fazia o site desistir com a ponte ainda trabalhando.
 */
export const TEMPO_LIMITE_LONGO_MS = 5 * 60000;
const ROTAS_DEMORADAS = /^\/(extrato|boletos\/pagos|boletos|comprovante\/[^/?]+)\/?(\?|$)/;

/**
 * Emissão e alteração: a ponte pode levar até 25 s pelo token, 25 s para conferir se o boleto já existe (nova tentativa) e 25 s pelo
 * pedido. Desistir em 30 s deixava o banco emitir sem o site gravar nada.
 */
export const TEMPO_LIMITE_EMISSAO_MS = 90000;

/** Tempo de espera padrão de uma rota da conta: 5 minutos nas consultas de extrato, comprovante e listas de boletos; 90 s na emissão; 30 s no resto. */
export const tempoLimiteDaRota = (metodo, caminho) => {
  const m = String(metodo).toUpperCase();
  const c = `/${String(caminho).replace(/^\/+/, '')}`;
  if (m === 'GET' && ROTAS_DEMORADAS.test(c)) return TEMPO_LIMITE_LONGO_MS;
  if (m === 'POST' && /^\/boletos(\/[^/?]+\/alterar)?\/?(\?|$)/.test(c)) return TEMPO_LIMITE_EMISSAO_MS;
  return TEMPO_LIMITE_MS;
};

/**
 * Endereço e senha da ponte DESTE navegador (IndexedDB, como o atalho da pasta): o JSON compartilhado na pasta/OneDrive não leva
 * a senha. Cada computador que usa o banco informa os dois em Dados e backup.
 */
const PONTE_PADRAO = { ponte_url: 'http://localhost:8765', senha_ponte: '' };
let local = { ponte_url: '', senha_ponte: '' };

/** Lê a ponte lembrada neste navegador (chamado ao abrir o sistema; ``app.js``). */
export async function carregarPonteLocal() {
  try {
    const p = lembraNoNavegador() ? await S.ponteLembrada() : null;
    local = { ponte_url: String((p && p.ponte_url) || ''), senha_ponte: String((p && p.senha_ponte) || '') };
  } catch { local = { ponte_url: '', senha_ponte: '' }; }
  return { ...local };
}

/** A versão PC (arquivo aberto do disco, file:): o IndexedDB é de todo HTML aberto do disco, então a ponte fica só na memória. */
const lembraNoNavegador = () => typeof indexedDB !== 'undefined' && !(typeof location !== 'undefined' && location.protocol === 'file:');

/** http:// só para este computador (a senha viaja aberta pela rede); outro computador, só https:// (ex.: Cloudflare Tunnel). */
export function enderecoDaPonteValido(url) {
  if (!url) return true;
  if (/^https:\/\//i.test(url)) return true;
  const m = /^http:\/\/([^/:]+|\[[^\]]+\])(:\d+)?(\/|$)/i.exec(url);
  return !!m && ['localhost', '127.0.0.1', '[::1]'].includes(m[1].toLowerCase());
}

/** Guarda o endereço e a senha da ponte só neste navegador. */
export async function salvarPonteLocal({ ponte_url, senha_ponte }) {
  const url = String(ponte_url || '').trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) throw new Error('O endereço da ponte começa com http:// ou https:// (ex.: http://localhost:8765).');
  if (!enderecoDaPonteValido(url)) throw new Error('Ponte em outro computador só com https:// (ex.: https://banco.ankjck.com.br): com http:// a senha viajaria aberta pela rede. http:// só para este computador (http://localhost:8765).');
  local = { ponte_url: url, senha_ponte: String(senha_ponte || '') };
  if (lembraNoNavegador()) await S.lembrarPonte({ ...local });
  return { ...local };
}

/** Ao sair do sistema: a senha da ponte sai deste navegador (o endereço fica); quem entrar depois digita de novo. */
export async function esquecerSenhaDaPonte() {
  local = { ...local, senha_ponte: '' };
  if (lembraNoNavegador()) await S.lembrarPonte({ ...local });
}

/** Apaga o endereço e a senha da ponte deste navegador (ex.: computador emprestado ou ponte trocada). */
export async function esquecerPonteLocal() {
  local = { ponte_url: '', senha_ponte: '' };
  if (typeof indexedDB !== 'undefined') await S.esquecerPonte();
}

/** Endereço e senha da ponte deste navegador (a senha não sai daqui, exceto no cabeçalho da chamada). */
export const ponteLocal = () => ({ ...PONTE_PADRAO, ...local, ponte_url: local.ponte_url, configurada: !!local.ponte_url });

/** Configuração da integração: a compartilhada (``d.config_banco``) mais a ponte deste navegador. */
export const configuracaoBanco = (d) => ({ ...R.configBanco(d), ...(local.ponte_url ? { ponte_url: local.ponte_url, senha_ponte: local.senha_ponte } : { ponte_url: '', senha_ponte: '' }) });

/** Integração ligada, com contas e com a ponte informada neste navegador: dá para chamar a ponte. */
export const pontePronta = (d) => R.bancoAtivo(d) && !!local.ponte_url;

/** Mensagem curta para o ``title`` dos botões desabilitados. */
export const motivoIndisponivel = (d) => R.motivoBancoInativo(d) || (!local.ponte_url ? 'Informe o endereço e a senha da ponte neste computador (Dados e backup → Banco (C6))' : '');

function urlDaPonte(cfg, caminho) {
  const base = String(cfg.ponte_url || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('Falta o endereço e a senha da ponte neste computador (Dados e backup → Banco (C6)).');
  return `${base}${caminho.startsWith('/') ? '' : '/'}${caminho}`;
}

/** Erro devolvido pela ponte ou pelo banco, com o texto que veio deles. */
export class ErroPonte extends Error {
  constructor(mensagem, { status = 0, detalhes = null } = {}) {
    super(mensagem);
    this.name = 'ErroPonte';
    this.status = status;
    this.detalhes = detalhes;
  }
}

/**
 * Chamada crua à ponte (qualquer caminho). Devolve o JSON da resposta; erro vira ``ErroPonte`` com mensagem em português.
 * ``cfg`` é a configuração do banco (``configuracaoBanco(d)``); ``opcoes.fetch`` permite trocar o fetch nos testes.
 */
export async function chamarPonteCrua(metodo, caminho, corpo = null, opcoes = {}) {
  const cfg = ponteLocal();
  const url = urlDaPonte(cfg, caminho);
  const f = opcoes.fetch || fetch;
  const controlador = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controlador ? setTimeout(() => controlador.abort(), opcoes.tempoLimite || TEMPO_LIMITE_MS) : null;
  let resposta;
  try {
    resposta = await f(url, {
      method: metodo, mode: 'cors', signal: controlador ? controlador.signal : undefined,
      headers: { Accept: 'application/json', ...(corpo !== null ? { 'Content-Type': 'application/json' } : {}), ...(cfg.senha_ponte ? { [CABECALHO_SENHA]: cfg.senha_ponte } : {}) },
      body: corpo !== null ? JSON.stringify(corpo) : undefined,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new ErroPonte(`A ponte em ${cfg.ponte_url} não respondeu a tempo. Confira se ela está ligada e se o banco está no ar.`);
    throw new ErroPonte(`Não consegui falar com a ponte em ${cfg.ponte_url}. Ela está ligada neste computador? (${e && e.message ? e.message : e})`);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const texto = await resposta.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { erro: texto.slice(0, 300) }; }
  if (!resposta.ok) {
    const msg = (dados && (dados.erro || dados.mensagem || dados.message)) || `A ponte respondeu com erro ${resposta.status}.`;
    // só o 401 é a senha da ponte; o 403 da ponte traz o motivo dele (ex.: rotas de pagamento desligadas)
    if (resposta.status === 401) throw new ErroPonte('A ponte recusou a senha. Confira a senha da ponte em Dados e backup → Banco (C6) e no .env da ponte.', { status: resposta.status, detalhes: dados });
    throw new ErroPonte(msg, { status: resposta.status, detalhes: dados });
  }
  return dados;
}

/** Chamada a um serviço de uma conta: ``chamarPonte('ank', 'POST', '/boletos', pedido)`` → ``POST <ponte>/contas/ank/boletos``. */
export function chamarPonte(contaId, metodo, caminho, corpo = null, opcoes = {}) {
  if (!contaId) throw new Error('Conta bancária não informada.');
  return chamarPonteCrua(metodo, `/contas/${encodeURIComponent(contaId)}${caminho.startsWith('/') ? '' : '/'}${caminho}`, corpo, { tempoLimite: tempoLimiteDaRota(metodo, caminho), ...opcoes });
}

/**
 * Saúde da ponte e das contas: ``{ ponte: true, versao, simulado, contas: { ank: { configurado, faltam: [...], ambiente, certificado, token }, ... } }``.
 * Enquanto não houver chaves, cada conta vem com ``configurado: false`` e a lista do que falta.
 */
export const saudePonte = (d, opcoes = {}) => { void d; return chamarPonteCrua('GET', '/saude', null, opcoes); };

/** Saúde de uma conta só (``GET /contas/:conta/saude``). */
export const saudeConta = (d, contaId, opcoes = {}) => { void d; return chamarPonte(contaId, 'GET', '/saude', null, opcoes); };

/**
 * Emite o boleto com Pix no banco pela conta escolhida. Devolve ``{ pedido, resposta, conta }``: a resposta crua do banco (a tela
 * grava com ``R.registrarBoletoBancario``). Não grava nada aqui.
 */
export async function emitirBoleto(d, cb, conta, { referencia = null, repetir = false, ...opcoes } = {}) {
  if (!pontePronta(d)) throw new Error(motivoIndisponivel(d));
  if (R.emitidoNoBanco(cb)) throw new Error('Este boleto já foi emitido no banco. Cancele no banco antes de emitir de novo.');
  const pedido = referencia ? R.pedidoBoletoC6(d, cb, conta, referencia) : R.pedidoBoletoC6(d, cb, conta);
  // ``repetir``: nova tentativa com a mesma referência; a ponte confere no banco antes e devolve o boleto que já existir
  const resposta = await chamarPonte(conta.id, 'POST', '/boletos', repetir ? { ...pedido, repetir: true } : pedido, opcoes);
  return { pedido, resposta, conta };
}

/** Falha da emissão sem resposta certa (o boleto PODE ter sido emitido): a ponte não respondeu, o tempo acabou ou a ponte avisou. */
export const emissaoIncerta = (e) => e instanceof ErroPonte && (!e.status || e.status === 504 || !!(e.detalhes && e.detalhes.detalhes && e.detalhes.detalhes.incerto));

const idNoBanco = (cb) => {
  const id = cb.banco && (cb.banco.id_externo || cb.banco.id_banco);
  if (!id) throw new Error('Este boleto não foi emitido no banco.');
  return encodeURIComponent(id);
};

/** Consulta a situação no banco (``GET /contas/:conta/boletos/:id``). Devolve a resposta crua. */
export function consultarBoleto(d, cb, opcoes = {}) {
  if (!pontePronta(d)) throw new Error(motivoIndisponivel(d));
  return chamarPonte(cb.banco && cb.banco.conta_id, 'GET', `/boletos/${idNoBanco(cb)}`, null, opcoes);
}

/** Cancela no banco (``POST /contas/:conta/boletos/:id/cancelar``). A tela pede confirmação antes. */
export function cancelarBoleto(d, cb, opcoes = {}) {
  if (!pontePronta(d)) throw new Error(motivoIndisponivel(d));
  return chamarPonte(cb.banco && cb.banco.conta_id, 'POST', `/boletos/${idNoBanco(cb)}/cancelar`, {}, opcoes);
}

/**
 * Altera no banco o valor, o vencimento e a descrição (``POST /contas/:conta/boletos/:id/alterar`` → PATCH no C6, teste BP_02).
 * Padrão: manda o que o sistema calcula hoje (``R.alteracaoBoletoC6``). Se o banco recusar, o caminho é cancelar e emitir outro.
 */
export function alterarBoleto(d, cb, mudancas = R.alteracaoBoletoC6(d, cb), opcoes = {}) {
  if (!pontePronta(d)) throw new Error(motivoIndisponivel(d));
  return chamarPonte(cb.banco && cb.banco.conta_id, 'POST', `/boletos/${idNoBanco(cb)}/alterar`, mudancas, opcoes);
}

/** Agenda a negativação do pagador no birô (``POST /contas/:conta/boletos/:id/negativar`` → POST …/denial). Só administrador, com confirmação dupla na tela. */
export function negativarBoleto(d, cb, dias, opcoes = {}) {
  if (!pontePronta(d)) throw new Error(motivoIndisponivel(d));
  const conta = R.contaBanco(d, cb.banco && cb.banco.conta_id);
  if (!conta || !conta.negativacao.ativa) throw new Error('A negativação está desligada nesta conta (Dados e backup → Banco (C6)).');
  return chamarPonte(cb.banco && cb.banco.conta_id, 'POST', `/boletos/${idNoBanco(cb)}/negativar`, R.pedidoNegativacaoC6(dias), opcoes);
}

/** Cancela a negativação agendada (``POST /contas/:conta/boletos/:id/negativar/cancelar`` → DELETE …/denial). */
export function cancelarNegativacao(d, cb, opcoes = {}) {
  if (!pontePronta(d)) throw new Error(motivoIndisponivel(d));
  return chamarPonte(cb.banco && cb.banco.conta_id, 'POST', `/boletos/${idNoBanco(cb)}/negativar/cancelar`, {}, opcoes);
}

/** Lista boletos da conta no banco por intervalo de datas (``GET /contas/:conta/boletos?due_date_from=…&due_date_to=…``, até 60 dias). */
export function listarBoletos(d, contaId, filtros, opcoes = {}) {
  if (!pontePronta(d)) throw new Error(motivoIndisponivel(d));
  return chamarPonte(contaId, 'GET', `/boletos?${new URLSearchParams(filtros)}`, null, opcoes);
}

/** Páginas da listagem lidas no máximo (100 boletos cada). A ponte nova já devolve tudo numa página só. */
export const MAX_PAGINAS_LISTA = 10;

/**
 * Todas as páginas da listagem (``content[]``; ``total_pages``), até MAX_PAGINAS_LISTA páginas de 100. Se o banco tiver mais, a lista
 * vem com ``incompleto: true`` e ``total`` (quantos o banco tem), para a tela avisar em vez de concluir com metade.
 */
export async function listarTodosBoletos(d, contaId, filtros, opcoes = {}) {
  const itens = [];
  let r = null;
  for (let pagina = 0; pagina < MAX_PAGINAS_LISTA; pagina += 1) {
    r = await listarBoletos(d, contaId, { ...filtros, page: pagina, size: 100 }, opcoes);
    itens.push(...(Array.isArray(r.content) ? r.content : Array.isArray(r.bank_slips) ? r.bank_slips : []));
    if (!(Number(r.total_pages) > pagina + 1)) return itens;
  }
  itens.incompleto = true;
  itens.total = Number(r && r.total_elements) || null;
  return itens;
}

/** Endereço da imagem do QR Code do Pix guardada no boleto (``data:`` URL), ou vazio. */
export const imagemQrPix = (cb) => (cb.banco && cb.banco.pix_qr_base64 ? `data:${cb.banco.pix_qr_mime || 'image/png'};base64,${cb.banco.pix_qr_base64}` : '');
