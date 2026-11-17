// Senhas: PBKDF2-SHA256 com sal aleatório. A senha nunca é gravada, só o resumo.
// O número de iterações fica gravado no usuário (senha_iteracoes): usuários antigos, sem o campo, foram
// gravados com ITERACOES_ANTIGAS e passam para o valor atual no próximo login (reforcarSenha).
export const ITERACOES_SENHA = 600000;
const ITERACOES_ANTIGAS = 150000;

/** Tamanho mínimo da senha dos usuários (uma frase curta é fácil de lembrar e difícil de adivinhar). */
export const SENHA_MINIMA = 10;
export const ERRO_SENHA_CURTA = `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres. Dica: use uma frase curta, como "casa azul 2026".`;
export const senhaCurta = (senha) => String(senha || '').length < SENHA_MINIMA;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function novoSal() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function resumoSenha(senha, sal, iteracoes = ITERACOES_SENHA) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(sal), iterations: iteracoes }, chave, 256);
  return hex(bits);
}

/** Campos de senha de um usuário novo ou que trocou a senha: { senha_sal, senha_hash, senha_iteracoes }. */
export async function camposDeSenha(senha) {
  const senha_sal = novoSal();
  return { senha_sal, senha_hash: await resumoSenha(senha, senha_sal), senha_iteracoes: ITERACOES_SENHA };
}

const iteracoesDe = (usuario) => Number(usuario.senha_iteracoes) || ITERACOES_ANTIGAS;

export async function conferirSenha(usuario, senha) {
  return !!usuario && usuario.senha_hash === await resumoSenha(senha, usuario.senha_sal, iteracoesDe(usuario));
}

/** SHA-256 em hex. */
export async function sha256(texto) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(texto))));
}

/**
 * Verificador da senha para ligar o programa do PC (nuvem/aparelhos.mjs), separado do resumo gravado no banco: outro sal, que
 * só a nuvem guarda (fora do JSON). Quem tem o banco aberto (o resumo `senha_hash`) não consegue mais um crachá sem saber a
 * senha. `marca` = SHA-256 do `senha_hash` em uso: senha trocada depois → o verificador não vale até entrar de novo no site.
 */
export async function verificadorDoAparelho(senha, senhaHash) {
  const sal = `aparelho:${novoSal()}`;
  return { sal, iteracoes: ITERACOES_SENHA, resumo: await resumoSenha(senha, sal), marca: await sha256(senhaHash) };
}

/** Depois de conferir a senha: se o resumo gravado é mais fraco que o atual, devolve os campos novos para gravar; senão null. */
export async function reforcarSenha(usuario, senha) {
  return iteracoesDe(usuario) >= ITERACOES_SENHA ? null : camposDeSenha(senha);
}

export const PAPEIS = { admin: 'Administrador', operador: 'Operador (edita)', consulta: 'Consulta (só vê)' };
const NIVEL = { consulta: 0, operador: 1, admin: 2 };

export function pode(usuario, papel) {
  return !!usuario && NIVEL[usuario.papel] >= NIVEL[papel];
}
