// Senhas: PBKDF2-SHA256 com sal aleatório. A senha nunca é gravada, só o resumo.
const ITERACOES = 150000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function novoSal() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function resumoSenha(senha, sal) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(sal), iterations: ITERACOES }, chave, 256);
  return hex(bits);
}

export async function conferirSenha(usuario, senha) {
  return usuario && usuario.senha_hash === await resumoSenha(senha, usuario.senha_sal);
}

export const PAPEIS = { admin: 'Administrador', operador: 'Operador (edita)', consulta: 'Consulta (só vê)' };
const NIVEL = { consulta: 0, operador: 1, admin: 2 };

export function pode(usuario, papel) {
  return !!usuario && NIVEL[usuario.papel] >= NIVEL[papel];
}
