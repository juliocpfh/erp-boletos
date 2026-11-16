// Licenças por chave (etapa 5 da proposta, documentacao/PROPOSTA_LICENCA_E_PROGRAMA_PC.md): regras puras, sem Cloudflare.
// Chave curta sorteada (IMOV-XXXX-XXXX-XXXX-XXXX), ficha da chave, ativação (uso único), renovação somando o prazo,
// situação numa data (ativa, aviso, carência, só leitura, apagar, revogada), limites do plano e certificado assinado
// (Ed25519, WebCrypto) que o sistema do cliente confere sozinho, também sem internet. Datas 'AAAA-MM-DD'.

/** Letras e números da chave: sem O/0 e I/1 (confundem). 32 símbolos = 5 bits cada; 16 símbolos = 80 bits sorteados. */
export const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PREFIXO = 'IMOV';
export const DIAS_CHAVE_NAO_USADA = 90; // chave esquecida numa gaveta não vale para sempre
export const DIAS_CARENCIA = 15; // vencida em 20/01 → tudo funciona até 04/02; só leitura de 05/02
export const MESES_ATE_APAGAR = 3; // vencida em 20/01/2029 → apagar em 20/04/2029
export const AVISOS_VENCIMENTO = [60, 30, 7]; // dias antes do vencimento
export const AVISOS_APAGAR = [{ meses: 1 }, { dias: 15 }, { dias: 5 }]; // antes de apagar: 20/03, 05/04 e 15/04
export const PERTO_DO_LIMITE = 0.9; // avisa com 18 de 20
export const VERSAO_CERTIFICADO = 1;

/** Limites do plano básico (decisão do dono, 15/11/2026): o que mais pesa. */
export const LIMITES_PADRAO = Object.freeze({ imoveis: 20, inquilinos: 20, usuarios: 4, cnpjs: 2 });
export const ITENS_LIMITE = { imoveis: 'imóveis', inquilinos: 'inquilinos com contrato ativo', usuarios: 'usuários', cnpjs: 'empresas (CNPJs)' };

/** Planos à venda. Planos maiores seguem o mesmo molde (só mudam os limites). */
export const PLANOS = Object.freeze({
  teste: { nome: 'Teste grátis (30 dias)', duracao: { dias: 30 } },
  mensal: { nome: 'Mensal', duracao: { meses: 1 } },
  anual: { nome: 'Anual', duracao: { meses: 12 } },
  anual2: { nome: 'Anual ×2', duracao: { meses: 24 } },
  anual3: { nome: 'Anual ×3', duracao: { meses: 36 } },
});

export class ErroLicenca extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
export function dataValida(d) {
  const m = RE_DATA.exec(String(d || ''));
  if (!m) return false;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3];
}
const exigirData = (d, nome = 'data') => { if (!dataValida(d)) throw new ErroLicenca(400, `Data inválida (${nome}).`); return d; };
const utc = (d) => { const [a, m, dia] = d.split('-').map(Number); return new Date(Date.UTC(a, m - 1, dia)); };
const texto = (t) => t.toISOString().slice(0, 10);

/** Hoje no horário de Brasília ('AAAA-MM-DD'). */
export const hojeBR = (agora = new Date()) => agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export function somarDias(d, dias) {
  const t = utc(exigirData(d)); t.setUTCDate(t.getUTCDate() + dias); return texto(t);
}

/** Soma meses; dia que não existe no mês final vira o último dia (31/01 + 1 mês = 28/02). */
export function somarMeses(d, meses) {
  const [a, m, dia] = exigirData(d).split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12); const mes = total % 12;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return texto(new Date(Date.UTC(ano, mes, Math.min(dia, ultimo))));
}

export const somarDuracao = (d, { meses = 0, dias = 0 } = {}) => somarDias(somarMeses(d, meses), dias);
export const diasEntre = (de, ate) => Math.round((utc(exigirData(ate)) - utc(exigirData(de))) / 86400000);
export const dataBR = (d) => (dataValida(d) ? d.split('-').reverse().join('/') : '');

// ---------------------------------------------------------------------------
// Chave
// ---------------------------------------------------------------------------
/** Sorteia uma chave nova. `aleatorio(bytes)` preenche os bytes (crypto.getRandomValues; nos testes, um sorteio fixo). */
export function sortearChave(aleatorio = (b) => crypto.getRandomValues(b)) {
  const bytes = aleatorio(new Uint8Array(16));
  const letras = Array.from(bytes, (b) => ALFABETO[b % 32]).join(''); // 256 é múltiplo de 32: sem sorteio torto
  return `${PREFIXO}-${letras.match(/.{4}/g).join('-')}`;
}

/** Chave como o cliente digitou (minúsculas, espaços, sem traços) → formato certo, ou '' se não é uma chave. */
export function normalizarChave(t) {
  const limpo = String(t || '').toUpperCase().replace(/[\s-]/g, '');
  const corpo = limpo.startsWith(PREFIXO) ? limpo.slice(PREFIXO.length) : limpo;
  if (corpo.length !== 16 || [...corpo].some((c) => !ALFABETO.includes(c))) return '';
  return `${PREFIXO}-${corpo.match(/.{4}/g).join('-')}`;
}

/** Só o fim da chave, para listas e certificado ("IMOV-…-R8WC"). */
export const fimDaChave = (chave) => `${PREFIXO}-…-${String(chave).slice(-4)}`;

// ---------------------------------------------------------------------------
// Ficha da chave
// ---------------------------------------------------------------------------
function limitesDe(base = {}) {
  const r = { ...LIMITES_PADRAO };
  for (const k of Object.keys(LIMITES_PADRAO)) {
    if (base[k] === undefined || base[k] === null || base[k] === '') continue;
    const n = Number(base[k]);
    if (!Number.isSafeInteger(n) || n < 1 || n > 100000) throw new ErroLicenca(400, `Limite inválido: ${ITENS_LIMITE[k]}.`);
    r[k] = n;
  }
  return r;
}

const curto = (v, max) => String(v ?? '').trim().slice(0, max);

/**
 * Ficha de uma chave nova: plano, duração, limites, quem vendeu, quando foi gerada e até quando pode ser usada.
 * `usada_por`/`usada_em` ficam vazios até a ativação; `revogada` até alguém revogar.
 */
export function novaFicha({ plano, vendedor, criada, limites, cliente, email, observacao, chave, aleatorio } = {}) {
  const p = PLANOS[plano];
  if (!p) throw new ErroLicenca(400, 'Plano desconhecido.');
  if (!curto(vendedor, 200)) throw new ErroLicenca(400, 'Falta quem gerou a chave.');
  exigirData(criada, 'gerada em');
  return {
    chave: chave || sortearChave(aleatorio),
    plano, nome_plano: p.nome, duracao: { ...p.duracao }, limites: limitesDe(limites),
    vendedor: curto(vendedor, 200).toLowerCase(), criada, usar_ate: somarDias(criada, DIAS_CHAVE_NAO_USADA),
    cliente: curto(cliente, 120), email: curto(email, 200).toLowerCase(), observacao: curto(observacao, 300),
    usada_por: null, usada_em: null, revogada: null,
  };
}

/** Por que esta chave não serve hoje ('' = serve). */
export function problemaDaChave(ficha, hoje, nomes = {}) {
  if (!ficha) return 'Chave não encontrada. Confira as letras e números.';
  if (ficha.revogada) return 'Esta chave foi cancelada. Fale com o suporte.';
  if (ficha.usada_por) return `Esta chave já foi usada pela empresa ${nomes[ficha.usada_por] || ficha.usada_por} em ${dataBR(ficha.usada_em)}.`;
  if (hoje > ficha.usar_ate) return `Esta chave venceu sem ser usada em ${dataBR(ficha.usar_ate)}. Fale com quem a vendeu.`;
  return '';
}

// ---------------------------------------------------------------------------
// CNPJ (até LIMITES.cnpjs por chave)
// ---------------------------------------------------------------------------
export function cnpjValido(c) {
  const d = String(c || '').replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((t, p, i) => t + p * Number(d[i]), 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}
const soDigitos = (c) => String(c || '').replace(/\D/g, '');

function cnpjsDe(lista, limite) {
  const r = [...new Set((Array.isArray(lista) ? lista : []).map(soDigitos).filter(Boolean))];
  if (!r.length) throw new ErroLicenca(400, 'Informe o CNPJ da empresa.');
  const errado = r.find((c) => !cnpjValido(c));
  if (errado) throw new ErroLicenca(400, `CNPJ inválido: ${errado}.`);
  if (r.length > limite) throw new ErroLicenca(400, `Esta licença vale para no máximo ${limite} empresas (CNPJs).`);
  return r;
}

// ---------------------------------------------------------------------------
// Licença: ativar, renovar, cortesia, revogar
// ---------------------------------------------------------------------------
const RE_EMPRESA = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const empresaValida = (e) => RE_EMPRESA.test(String(e || ''));

/**
 * Ativa uma chave para uma empresa nova. Devolve a ficha da chave já marcada como usada e a licença.
 * Ex.: ativada em 20/01/2027 por 2 anos → vale até 20/01/2029.
 */
export function ativar(ficha, { empresa, nome, cnpjs, hoje, por }, nomes = {}) {
  exigirData(hoje, 'hoje');
  const problema = problemaDaChave(ficha, hoje, nomes);
  if (problema) throw new ErroLicenca(409, problema);
  if (!empresaValida(empresa)) throw new ErroLicenca(400, 'Código da empresa inválido (letras minúsculas, números e traço).');
  if (!curto(nome, 120)) throw new ErroLicenca(400, 'Informe o nome da empresa.');
  const licenca = {
    empresa, nome: curto(nome, 120), cnpjs: cnpjsDe(cnpjs, ficha.limites.cnpjs),
    plano: ficha.plano, nome_plano: ficha.nome_plano, limites: { ...ficha.limites },
    inicio: hoje, ate: somarDuracao(hoje, ficha.duracao), ilimitada: false,
    chaves: [{ chave: ficha.chave, em: hoje, de: hoje, ate: somarDuracao(hoje, ficha.duracao) }],
    cortesias: [], revogada: null, ativada_por: curto(por, 200).toLowerCase(),
  };
  return { ficha: { ...ficha, usada_por: empresa, usada_em: hoje }, licenca };
}

/**
 * Renova com uma chave nova: o prazo soma. Renovou antes de vencer → soma à data antiga (não perde dias);
 * depois de vencer → conta da data da renovação. O plano e os limites passam a ser os da chave nova.
 * Ex.: vale até 20/01/2029, renovou em 10/01/2029 por 1 ano → até 20/01/2030.
 */
export function renovar(licenca, ficha, { hoje }, nomes = {}) {
  exigirData(hoje, 'hoje');
  if (!licenca) throw new ErroLicenca(404, 'Empresa sem licença.');
  if (licenca.ilimitada) throw new ErroLicenca(409, 'Esta licença não vence: não precisa renovar.');
  if (licenca.revogada) throw new ErroLicenca(409, 'Licença suspensa. Fale com o suporte.');
  const problema = problemaDaChave(ficha, hoje, nomes);
  if (problema) throw new ErroLicenca(409, problema);
  if (licenca.cnpjs.length > ficha.limites.cnpjs) throw new ErroLicenca(409, `A chave nova vale para ${ficha.limites.cnpjs} empresas (CNPJs) e este sistema tem ${licenca.cnpjs.length}.`);
  const de = licenca.ate > hoje ? licenca.ate : hoje;
  const ate = somarDuracao(de, ficha.duracao);
  return {
    ficha: { ...ficha, usada_por: licenca.empresa, usada_em: hoje },
    licenca: {
      ...licenca, plano: ficha.plano, nome_plano: ficha.nome_plano, limites: { ...ficha.limites }, ate,
      chaves: [...licenca.chaves, { chave: ficha.chave, em: hoje, de, ate }],
    },
  };
}

/** Prazo extra dado pelo gerente (ex.: +30 dias), com motivo. Soma ao vencimento (ou a hoje, se já venceu). */
export function darCortesia(licenca, { dias, motivo, por, hoje }) {
  exigirData(hoje, 'hoje');
  const n = Number(dias);
  if (!Number.isSafeInteger(n) || n < 1 || n > 366) throw new ErroLicenca(400, 'Dias de cortesia: de 1 a 366.');
  if (!curto(motivo, 300)) throw new ErroLicenca(400, 'Informe o motivo da cortesia.');
  if (licenca.ilimitada) throw new ErroLicenca(409, 'Esta licença não vence.');
  if (licenca.revogada) throw new ErroLicenca(409, 'Licença revogada: não recebe cortesia.');
  const de = licenca.ate > hoje ? licenca.ate : hoje;
  const ate = somarDias(de, n);
  return { ...licenca, ate, cortesias: [...licenca.cortesias, { dias: n, motivo: curto(motivo, 300), por: curto(por, 200).toLowerCase(), em: hoje, de, ate }] };
}

/** Revoga (chave ou licença): pede o motivo. Licença revogada fica só em leitura, nunca apaga dados. */
export function revogar(item, { motivo, por, hoje }) {
  exigirData(hoje, 'hoje');
  if (!curto(motivo, 300)) throw new ErroLicenca(400, 'Informe o motivo da revogação.');
  if (item.revogada) throw new ErroLicenca(409, 'Já estava revogada.');
  if (item.ilimitada) throw new ErroLicenca(409, 'A licença da casa não pode ser revogada.');
  return { ...item, revogada: { em: hoje, por: curto(por, 200).toLowerCase(), motivo: curto(motivo, 300) } };
}

/** Licença da casa (o dono): sem prazo e sem limites. */
export function licencaIlimitada({ empresa, nome, cnpjs = [], hoje }) {
  if (!empresaValida(empresa)) throw new ErroLicenca(400, 'Código da empresa inválido.');
  return {
    empresa, nome: curto(nome, 120) || empresa, cnpjs: [...new Set(cnpjs.map(soDigitos).filter(Boolean))],
    plano: 'casa', nome_plano: 'Licença da casa (ilimitada)', limites: null, inicio: exigirData(hoje, 'hoje'), ate: null,
    ilimitada: true, chaves: [], cortesias: [], revogada: null,
  };
}

// ---------------------------------------------------------------------------
// Situação numa data
// ---------------------------------------------------------------------------
/** Datas de cada passo depois do vencimento. Vencida em 20/01/2029 → carência até 04/02, só leitura de 05/02, apagar em 20/04. */
export function marcos(ate) {
  const apagar = somarMeses(ate, MESES_ATE_APAGAR);
  return {
    carencia_ate: somarDias(ate, DIAS_CARENCIA),
    so_leitura_desde: somarDias(ate, DIAS_CARENCIA + 1),
    apagar_em: apagar,
    avisos_apagar: AVISOS_APAGAR.map((a) => (a.meses ? somarMeses(apagar, -a.meses) : somarDias(apagar, -a.dias))),
    avisos_vencimento: AVISOS_VENCIMENTO.map((d) => somarDias(ate, -d)),
  };
}

/**
 * Situação da licença em `hoje`:
 * - `ativa` · `aviso` (faltam 60, 30 ou 7 dias ou menos: `aviso` = 60 | 30 | 7) · `carencia` (venceu, 15 dias com tudo funcionando)
 * - `so_leitura` (vê, imprime e exporta; não grava nada novo) · `apagar` (3 meses depois do vencimento) · `revogada` (só leitura)
 * `pode_gravar` diz se o cofre aceita gravações.
 */
export function situacao(licenca, hoje) {
  exigirData(hoje, 'hoje');
  if (!licenca) return { estado: 'sem_licenca', pode_gravar: false };
  if (licenca.revogada) return { estado: 'revogada', pode_gravar: false, revogada: licenca.revogada, ate: licenca.ate };
  if (licenca.ilimitada) return { estado: 'ativa', pode_gravar: true, ilimitada: true, ate: null };
  const m = marcos(licenca.ate);
  const faltam = diasEntre(hoje, licenca.ate);
  const base = { ate: licenca.ate, dias_restantes: faltam, ...m };
  if (faltam > 0) {
    const aviso = [...AVISOS_VENCIMENTO].sort((a, b) => a - b).find((d) => faltam <= d) || 0;
    return { ...base, estado: aviso ? 'aviso' : 'ativa', aviso, pode_gravar: true };
  }
  if (hoje <= m.carencia_ate) return { ...base, estado: 'carencia', pode_gravar: true };
  if (hoje < m.apagar_em) return { ...base, estado: 'so_leitura', pode_gravar: false };
  return { ...base, estado: 'apagar', pode_gravar: false };
}

/** Frase curta para a tela. */
export function fraseDaSituacao(s) {
  switch (s.estado) {
    case 'ativa': return s.ilimitada ? 'Licença da casa: sem vencimento.' : `Licença válida até ${dataBR(s.ate)}.`;
    case 'aviso': return `Sua licença vence em ${dataBR(s.ate)}. Renove para não ficar só em leitura.`;
    case 'carencia': return `Licença vencida em ${dataBR(s.ate)}. Renove até ${dataBR(s.carencia_ate)}.`;
    case 'so_leitura': return `Licença vencida em ${dataBR(s.ate)}: só leitura. Você pode ver e exportar tudo. Os dados serão apagados em ${dataBR(s.apagar_em)}.`;
    case 'apagar': return `Licença vencida em ${dataBR(s.ate)}: prazo de guarda terminou em ${dataBR(s.apagar_em)}.`;
    case 'revogada': return 'Licença suspensa. Fale com o suporte.';
    default: return 'Sistema sem licença. Ative com a sua chave.';
  }
}

// ---------------------------------------------------------------------------
// Limites do plano
// ---------------------------------------------------------------------------
/**
 * Confere o uso contra os limites. `uso` = { imoveis, inquilinos, usuarios, cnpjs } (números).
 * Cada item: { usado, limite, perto (18 de 20), cheio (não cabe mais um), passou }. Barra só o cadastro novo (`podeCadastrar`).
 */
export function conferirLimites(licenca, uso = {}) {
  const r = {};
  for (const k of Object.keys(LIMITES_PADRAO)) {
    const usado = Math.max(0, Number(uso[k]) || 0);
    if (!licenca || licenca.ilimitada || !licenca.limites) { r[k] = { usado, limite: null, perto: false, cheio: false, passou: false }; continue; }
    const limite = licenca.limites[k];
    r[k] = { usado, limite, perto: usado >= Math.ceil(limite * PERTO_DO_LIMITE), cheio: usado >= limite, passou: usado > limite };
  }
  return r;
}

/** Cabe mais um (imóvel, inquilino, usuário, CNPJ)? Nunca tira o que já existe. */
export function podeCadastrar(licenca, uso, item) {
  if (!ITENS_LIMITE[item]) throw new ErroLicenca(400, 'Item de limite desconhecido.');
  const c = conferirLimites(licenca, uso)[item];
  return c.limite === null || c.usado < c.limite;
}

// ---------------------------------------------------------------------------
// Certificado assinado (Ed25519): o sistema do cliente guarda e confere sozinho, também sem internet
// ---------------------------------------------------------------------------
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (t) => Uint8Array.from(atob(String(t).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(t).length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const ALG = { name: 'Ed25519' };

/** Par de chaves novo (JWK): a privada vai para o segredo do Worker (LICENCA_CHAVE_PRIVADA); a pública, para o código. */
export async function gerarParDeChaves() {
  const par = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  return { privada: await crypto.subtle.exportKey('jwk', par.privateKey), publica: await crypto.subtle.exportKey('jwk', par.publicKey) };
}

const jwkDe = (j) => (typeof j === 'string' ? JSON.parse(j) : j);
const importar = (jwk, uso) => crypto.subtle.importKey('jwk', jwkDe(jwk), ALG, false, [uso]);

/** O que vai no certificado (nada de dados de pessoas: só empresa, CNPJs, plano, limites e datas). */
export function dadosDoCertificado(licenca, emitido) {
  return {
    v: VERSAO_CERTIFICADO, empresa: licenca.empresa, nome: licenca.nome, cnpjs: licenca.cnpjs,
    plano: licenca.plano, nome_plano: licenca.nome_plano, limites: licenca.limites, inicio: licenca.inicio, ate: licenca.ate,
    ilimitada: !!licenca.ilimitada, revogada: !!licenca.revogada, emitido: exigirData(emitido, 'emitido'),
  };
}

/** Certificado = "<dados em base64url>.<assinatura em base64url>". */
export async function assinarCertificado(licenca, jwkPrivada, emitido) {
  if (!jwkPrivada) throw new ErroLicenca(503, 'Servidor de licenças sem a chave de assinatura (LICENCA_CHAVE_PRIVADA).');
  const corpo = b64url(new TextEncoder().encode(JSON.stringify(dadosDoCertificado(licenca, emitido))));
  const assinatura = await crypto.subtle.sign(ALG, await importar(jwkPrivada, 'sign'), new TextEncoder().encode(corpo));
  return `${corpo}.${b64url(assinatura)}`;
}

/**
 * Confere o certificado com a chave pública (sem internet) e diz a situação em `hoje`.
 * Qualquer letra mudada (ex.: alguém "esticando" a data) faz a assinatura não bater: { ok: false }.
 * `empresa` (opcional): o certificado precisa ser desta empresa.
 */
export async function conferirCertificado(certificado, jwkPublica, hoje, { empresa } = {}) {
  const partes = String(certificado || '').split('.');
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { ok: false, motivo: 'Certificado de licença inválido.' };
  let ok = false; let dados;
  try {
    ok = await crypto.subtle.verify(ALG, await importar(jwkPublica, 'verify'), deB64url(partes[1]), new TextEncoder().encode(partes[0]));
    if (ok) dados = JSON.parse(new TextDecoder().decode(deB64url(partes[0])));
  } catch { ok = false; }
  if (!ok || !dados || dados.v !== VERSAO_CERTIFICADO) return { ok: false, motivo: 'Certificado de licença inválido (a assinatura não confere).' };
  if (empresa && dados.empresa !== empresa) return { ok: false, motivo: 'Este certificado é de outra empresa.' };
  const licenca = { ...dados, revogada: dados.revogada ? { motivo: 'revogada' } : null };
  return { ok: true, dados, situacao: situacao(licenca, hoje) };
}
