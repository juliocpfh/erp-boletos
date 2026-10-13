// Backup seguro do administrador: uma segunda pasta (escolhida só no computador do administrador) que recebe
// uma cópia cifrada do banco a cada gravação e, uma vez por semana, um backup completo (banco + anexos).
//
// Cifragem: cada arquivo leva uma chave AES-GCM nova, guardada "embrulhada" com a chave pública RSA da pasta.
// A chave privada fica cifrada com a senha do backup (PBKDF2). Assim o sistema grava sem pedir senha,
// mas só quem sabe a senha abre um backup. Cada arquivo carrega a chave privada cifrada: para restaurar
// basta o arquivo e a senha, mesmo em outro computador ou sem conseguir entrar no sistema.

export const ARQUIVO_CHAVE = 'chave-do-backup.json';
export const PASTA_DIARIO = 'copias-diarias';
export const PASTA_SEMANAL = 'completos-semanais';
export const PASTA_PROGRAMA = 'programa';
export const EXTENSAO = '.bkp';
const MAGICO = 'IMOVEIS-BACKUP-SEGURO-1';
const ITERACOES = 310000;
export const MANTER_DIARIOS = 60;
export const MANTER_SEMANAIS = 8;
export const MANTER_MENSAIS = 12;
export const DIAS_ENTRE_COMPLETOS = 7;

const sutil = () => globalThis.crypto.subtle;
const b64 = (bytes) => {
  let s = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const deB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const aleatorio = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const texto = (t) => new TextEncoder().encode(t);

async function chaveDaSenha(senha, sal, iteracoes) {
  const base = await sutil().importKey('raw', texto(senha), 'PBKDF2', false, ['deriveKey']);
  return sutil().deriveKey({ name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Cria o par de chaves da pasta. A senha protege a chave privada (sem ela, nenhum backup abre). */
export async function criarChave(senha) {
  if (String(senha).length < 8) throw new Error('A senha do backup precisa ter pelo menos 8 caracteres.');
  const par = await sutil().generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['wrapKey', 'unwrapKey']);
  const sal = aleatorio(16);
  const iv = aleatorio(12);
  const privada = await sutil().exportKey('pkcs8', par.privateKey);
  const cifrada = await sutil().encrypt({ name: 'AES-GCM', iv }, await chaveDaSenha(senha, sal, ITERACOES), privada);
  return {
    formato: MAGICO, criada_em: new Date().toISOString(), iteracoes: ITERACOES,
    publica: b64(await sutil().exportKey('spki', par.publicKey)), privada_cifrada: b64(cifrada), sal: b64(sal), iv: b64(iv),
  };
}

async function abrirPrivada(chave, senha) {
  try {
    const bruta = await sutil().decrypt({ name: 'AES-GCM', iv: deB64(chave.iv) }, await chaveDaSenha(senha, deB64(chave.sal), chave.iteracoes), deB64(chave.privada_cifrada));
    return await sutil().importKey('pkcs8', bruta, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['unwrapKey']);
  } catch {
    throw new Error('Senha do backup incorreta.');
  }
}

export async function conferirSenha(chave, senha) {
  try {
    await abrirPrivada(chave, senha);
    return true;
  } catch {
    return false;
  }
}

/** Cifra ``bytes`` com a chave pública. ``info``: dados visíveis sem senha (tipo, data, nome do arquivo de dentro). */
export async function cifrar(chave, bytes, info = {}) {
  const publica = await sutil().importKey('spki', deB64(chave.publica), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
  const aes = await sutil().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = aleatorio(12);
  const conteudo = await sutil().encrypt({ name: 'AES-GCM', iv }, aes, bytes);
  const embrulhada = await sutil().wrapKey('raw', aes, publica, { name: 'RSA-OAEP' });
  const cabecalho = { ...info, criado_em: new Date().toISOString(), chave_embrulhada: b64(embrulhada), iv: b64(iv),
    chave: { iteracoes: chave.iteracoes, privada_cifrada: chave.privada_cifrada, sal: chave.sal, iv: chave.iv } };
  const topo = texto(`${MAGICO}\n${JSON.stringify(cabecalho)}\n`);
  const saida = new Uint8Array(topo.length + conteudo.byteLength);
  saida.set(topo, 0);
  saida.set(new Uint8Array(conteudo), topo.length);
  return saida;
}

/** Lê só o cabeçalho (tipo e data), sem senha. */
export function cabecalhoDe(bytes) {
  const u = new Uint8Array(bytes);
  const fim1 = u.indexOf(10);
  const fim2 = u.indexOf(10, fim1 + 1);
  if (fim1 < 0 || fim2 < 0 || new TextDecoder().decode(u.subarray(0, fim1)) !== MAGICO) throw new Error('Este arquivo não é um backup seguro deste sistema.');
  return { cabecalho: JSON.parse(new TextDecoder().decode(u.subarray(fim1 + 1, fim2))), inicio: fim2 + 1 };
}

export async function decifrar(bytes, senha) {
  const u = new Uint8Array(bytes);
  const { cabecalho, inicio } = cabecalhoDe(u);
  const privada = await abrirPrivada(cabecalho.chave, senha);
  const aes = await sutil().unwrapKey('raw', deB64(cabecalho.chave_embrulhada), privada, { name: 'RSA-OAEP' }, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  try {
    const dados = await sutil().decrypt({ name: 'AES-GCM', iv: deB64(cabecalho.iv) }, aes, u.subarray(inicio));
    return { info: cabecalho, dados: new Uint8Array(dados) };
  } catch {
    throw new Error('O arquivo de backup está danificado.');
  }
}

// --------------------------------------------------------------------------
// Quais cópias guardar
// --------------------------------------------------------------------------
const dataDoNome = (n) => (n.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';

/** Cópias diárias: as ``MANTER_DIARIOS`` mais recentes. */
export function diariosParaApagar(nomes) {
  const ord = [...nomes].sort();
  return ord.slice(0, Math.max(0, ord.length - MANTER_DIARIOS));
}

/** Completos: os ``MANTER_SEMANAIS`` mais recentes e, além deles, o último de cada mês dos ``MANTER_MENSAIS`` meses anteriores. */
export function semanaisParaApagar(nomes) {
  const ord = [...nomes].sort().reverse();
  const manter = new Set(ord.slice(0, MANTER_SEMANAIS));
  const meses = new Set();
  for (const n of ord) {
    const mes = dataDoNome(n).slice(0, 7);
    if (!mes || meses.has(mes)) continue;
    meses.add(mes);
    if (meses.size <= MANTER_MENSAIS + 1) manter.add(n);
  }
  return ord.filter((n) => !manter.has(n)).sort();
}

export function precisaCompleto(nomesSemanais, hojeIso) {
  const ultimo = [...nomesSemanais].map(dataDoNome).filter(Boolean).sort().at(-1);
  if (!ultimo) return true;
  return (Date.parse(hojeIso) - Date.parse(ultimo)) / 86400000 >= DIAS_ENTRE_COMPLETOS;
}

// --------------------------------------------------------------------------
// Gravação na pasta segura
// --------------------------------------------------------------------------
async function gravar(dir, nome, conteudo) {
  const fh = await dir.getFileHandle(nome, { create: true });
  const w = await fh.createWritable();
  await w.write(conteudo);
  await w.close();
}

async function nomesEm(dir) {
  const nomes = [];
  for await (const [n, h] of dir.entries()) if (h.kind === 'file' && n.endsWith(EXTENSAO)) nomes.push(n);
  return nomes;
}

export async function lerChave(dir) {
  try {
    const arq = await (await dir.getFileHandle(ARQUIVO_CHAVE)).getFile();
    const chave = JSON.parse(await arq.text());
    return chave.formato === MAGICO ? chave : null;
  } catch {
    return null;
  }
}

export const gravarChave = (dir, chave) => gravar(dir, ARQUIVO_CHAVE, JSON.stringify(chave, null, 1));

const hoje = () => new Date().toISOString().slice(0, 10);

/** Cópia do banco do dia (sobrescreve a do mesmo dia a cada gravação). */
export async function espelhar(dir, chave, dados) {
  const sub = await dir.getDirectoryHandle(PASTA_DIARIO, { create: true });
  const nome = `imoveis-dados-${hoje()}${EXTENSAO}`;
  await gravar(sub, nome, await cifrar(chave, texto(JSON.stringify(dados)), { tipo: 'diario', arquivo: 'imoveis-dados.json', revisao: dados.revisao }));
  for (const velho of diariosParaApagar(await nomesEm(sub))) await sub.removeEntry(velho);
  return nome;
}

/** Backup completo (ZIP do "Exportar tudo") cifrado. */
export async function gravarCompleto(dir, chave, zipBytes) {
  const sub = await dir.getDirectoryHandle(PASTA_SEMANAL, { create: true });
  const nome = `completo-${hoje()}${EXTENSAO}`;
  await gravar(sub, nome, await cifrar(chave, zipBytes, { tipo: 'completo', arquivo: 'imoveis-completo.zip' }));
  for (const velho of semanaisParaApagar(await nomesEm(sub))) await sub.removeEntry(velho);
  return nome;
}

export async function completoPendente(dir) {
  const sub = await dir.getDirectoryHandle(PASTA_SEMANAL, { create: true });
  return precisaCompleto(await nomesEm(sub), hoje());
}

/** Cópia do programa de arquivo único (abre sem internet). Fica sem cifrar: não tem dados. */
export async function gravarPrograma(dir, html) {
  const sub = await dir.getDirectoryHandle(PASTA_PROGRAMA, { create: true });
  await gravar(sub, 'administracao-imoveis.html', html);
}

/** Arquivos da pasta segura, do mais novo para o mais antigo. */
export async function listarBackups(dir) {
  const lista = [];
  for (const [pasta, tipo] of [[PASTA_DIARIO, 'Cópia diária (só o banco)'], [PASTA_SEMANAL, 'Completo (banco + anexos)']]) {
    let sub;
    try { sub = await dir.getDirectoryHandle(pasta); } catch { continue; }
    for await (const [n, h] of sub.entries()) {
      if (h.kind !== 'file' || !n.endsWith(EXTENSAO)) continue;
      const f = await h.getFile();
      lista.push({ pasta, nome: n, tipo, tamanho: f.size, alterado: f.lastModified });
    }
  }
  return lista.sort((a, b) => b.alterado - a.alterado);
}
