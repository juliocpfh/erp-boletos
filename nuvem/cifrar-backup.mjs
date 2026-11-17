// Backup diário da nuvem cifrado com a chave pública do backup seguro do administrador (o mesmo formato de docs/js/backup-seguro.js:
// cada arquivo leva uma chave AES-GCM nova, "embrulhada" com a chave pública RSA, e a chave privada cifrada pela senha do backup).
// O servidor só tem a chave pública (e a privada já cifrada, que vai em todo arquivo): grava sem senha, mas só quem sabe a senha
// do backup abre. Abre igual a um backup seguro (Backups da nuvem → Voltar para este dia, ou Dados e backup → Restaurar).
// tests/lgpd-nuvem.test.mjs confere que docs/js/backup-seguro.js (decifrar) abre o que sai daqui.

export const MAGICO = 'IMOVEIS-BACKUP-SEGURO-1'; // igual a docs/js/backup-seguro.js
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

const b64 = (bytes) => {
  let s = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const deB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const texto = (t) => new TextEncoder().encode(t);

/**
 * Confere a chave mandada pelo administrador (o conteúdo de chave-do-backup.json, que não tem segredo aberto) e devolve só os
 * campos que o servidor guarda. Chave errada: lança Error com a mensagem para a tela.
 */
export async function chaveDoBackupValida(c) {
  if (!c || typeof c !== 'object' || c.formato !== MAGICO) throw new Error('Esta não é a chave de um backup seguro deste sistema.');
  const it = Number(c.iteracoes);
  if (!Number.isInteger(it) || it < 100000 || it > 2000000) throw new Error('A chave do backup seguro está danificada.');
  for (const k of ['publica', 'privada_cifrada', 'sal', 'iv']) if (typeof c[k] !== 'string' || c[k].length > 8000 || !B64.test(c[k])) throw new Error('A chave do backup seguro está danificada.');
  try {
    await crypto.subtle.importKey('spki', deB64(c.publica), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
  } catch { throw new Error('A chave do backup seguro está danificada.'); }
  return { formato: MAGICO, criada_em: typeof c.criada_em === 'string' ? c.criada_em.slice(0, 40) : null, iteracoes: it, publica: c.publica, privada_cifrada: c.privada_cifrada, sal: c.sal, iv: c.iv };
}

/** Resumo curto da chave pública (para a tela dizer qual chave está ligada, sem mostrar a chave). */
export async function resumoDaChave(chave) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', deB64(chave.publica)));
  return [...h.slice(0, 6)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Cifra `bytes` (igual a cifrar de docs/js/backup-seguro.js). `info`: o que fica legível sem senha (tipo, revisão). */
export async function cifrarBackup(chave, bytes, info = {}) {
  const sutil = crypto.subtle;
  const publica = await sutil.importKey('spki', deB64(chave.publica), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey']);
  const aes = await sutil.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const embrulhada = await sutil.wrapKey('raw', aes, publica, { name: 'RSA-OAEP' });
  const cabecalho = { ...info, criado_em: new Date().toISOString(), protegido: 1, chave_embrulhada: b64(embrulhada), iv: b64(iv),
    chave: { iteracoes: chave.iteracoes, privada_cifrada: chave.privada_cifrada, sal: chave.sal, iv: chave.iv } };
  const cabecalhoBytes = texto(JSON.stringify(cabecalho));
  const conteudo = new Uint8Array(await sutil.encrypt({ name: 'AES-GCM', iv, additionalData: cabecalhoBytes }, aes, bytes));
  const prefixo = texto(`${MAGICO}\n`);
  const saida = new Uint8Array(prefixo.length + cabecalhoBytes.length + 1 + conteudo.length);
  saida.set(prefixo, 0);
  saida.set(cabecalhoBytes, prefixo.length);
  saida[prefixo.length + cabecalhoBytes.length] = 10;
  saida.set(conteudo, prefixo.length + cabecalhoBytes.length + 1);
  return saida;
}
