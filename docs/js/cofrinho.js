// Cópia local cifrada (dados na nuvem): o que fica guardado no aparelho (banco, fila, anexos sem internet) é cifrado com uma
// chave do aparelho (AES-GCM), e essa chave só abre com a senha do sistema (PBKDF2, uma "embrulhada" por usuário que entrou aqui).
// Com o login lembrado, a chave fica guardada junto (até Sair ou vencer); ao Sair ela é apagada e a cópia fica trancada.
// Fica aberta só a lista de usuários ("acesso"), para a tela de login funcionar sem internet (as senhas lá já são embaralhadas).

export const ITERACOES = 600000; // como auth.js
/** Chaves do IndexedDB que não são cifradas (não têm dados dos inquilinos). */
export const ABERTAS = ['aparelho', 'n', 'faixas', 'acesso', 'embrulhos', 'chave-sessao', 'aguardando-dados', 'aguardando-anexos'];

const sub = () => globalThis.crypto.subtle;
const bytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const texto = new TextEncoder();

async function derivar(senha, sal, iteracoes = ITERACOES) {
  const base = await sub().importKey('raw', texto.encode(senha), 'PBKDF2', false, ['deriveKey']);
  return sub().deriveKey({ name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256' }, base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

export const novaChave = () => sub().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

/** Embrulha a chave do aparelho com a senha de um usuário. */
export async function embrulhar(chave, senha, iteracoes = ITERACOES) {
  const sal = bytes(16);
  const dados = new Uint8Array(await sub().wrapKey('raw', chave, await derivar(senha, sal, iteracoes), 'AES-KW'));
  return { sal, dados, iteracoes };
}

/** Abre a chave com a senha; senha errada (ou trocada depois) dá null. */
export async function desembrulhar(emb, senha) {
  try {
    return await sub().unwrapKey('raw', emb.dados, await derivar(senha, emb.sal, emb.iteracoes || ITERACOES), 'AES-KW', { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  } catch { return null; }
}

/** Cifra um valor (objeto/lista/texto ou Blob). */
export async function cifrar(chave, valor) {
  const iv = bytes(12);
  if (valor instanceof Blob) {
    const dados = new Uint8Array(await sub().encrypt({ name: 'AES-GCM', iv }, chave, await valor.arrayBuffer()));
    return { __cifrado: 1, tipo: 'blob', mime: valor.type || '', iv, dados };
  }
  const dados = new Uint8Array(await sub().encrypt({ name: 'AES-GCM', iv }, chave, texto.encode(JSON.stringify(valor))));
  return { __cifrado: 1, tipo: 'json', iv, dados };
}

export async function decifrar(chave, v) {
  const claro = await sub().decrypt({ name: 'AES-GCM', iv: v.iv }, chave, v.dados);
  return v.tipo === 'blob' ? new Blob([claro], { type: v.mime }) : JSON.parse(new TextDecoder().decode(claro));
}

/** Só o necessário para a tela de login (sem dados de inquilinos nem os tokens de sessão, que ficam só na cópia cifrada). */
export const usuariosParaAcesso = (usuarios = []) => usuarios.map((u) => ({
  id: u.id, login: u.login, nome: u.nome, email: u.email, papel: u.papel, ativo: u.ativo, pendente: u.pendente,
  senha_sal: u.senha_sal, senha_hash: u.senha_hash, senha_iteracoes: u.senha_iteracoes,
}));

/**
 * Guarda cifrado por cima de outro guarda (IndexedDB). Sem chave (trancado): ler devolve undefined e gravar não grava
 * (fica só na memória até alguém entrar com a senha). Ao gravar o banco, guarda aberta a lista de usuários para o login.
 */
export function guardarCifrado(cru, obterChave) {
  return {
    async ler(k) {
      const v = await cru.ler(k);
      if (ABERTAS.includes(k) || v === undefined || v === null) return v;
      if (!v || !v.__cifrado) return v; // cópia antiga, ainda sem cifra: lê e regrava cifrada na próxima vez
      const chave = obterChave();
      if (!chave) return undefined;
      try { return await decifrar(chave, v); } catch { return undefined; } // chave de outra época: como se não houvesse cópia
    },
    async gravar(k, v) {
      if (ABERTAS.includes(k)) return cru.gravar(k, v);
      if (k === 'base' && v?.usuarios) await cru.gravar('acesso', usuariosParaAcesso(v.usuarios));
      // quantos lotes/anexos esperam envio fica aberto: outro usuário não pode entrar trocando a chave e perder isso
      if (k === 'pendentes') await cru.gravar('aguardando-dados', (v || []).length);
      if (k === 'fila-anexos') await cru.gravar('aguardando-anexos', (v || []).length);
      const chave = obterChave();
      if (!chave) return undefined;
      return cru.gravar(k, await cifrar(chave, v));
    },
    apagar: (k) => cru.apagar?.(k),
  };
}

/**
 * Chave do aparelho: guardada aberta só durante o login lembrado (`chave-sessao`, até `ate`), embrulhada por usuário.
 * `entrar(login, senha)`: abre (ou cria, na 1ª vez deste aparelho) e guarda para a sessão. `sair()`: apaga a da sessão.
 */
export class Cofrinho {
  constructor(cru) { this.cru = cru; this.chave = null; }

  async daSessao(sessaoValida) {
    const s = await this.cru.ler('chave-sessao');
    if (s && sessaoValida && s.ate > Date.now()) { this.chave = s.chave; return this.chave; }
    if (s) await this.cru.apagar?.('chave-sessao');
    this.chave = null;
    return null;
  }

  /**
   * Abre a chave com a senha. Devolve { chave, nova } — `nova`: este usuário não tinha a chave embrulhada e não havia como
   * abri-la (a cópia antiga fica ilegível e é baixada de novo da nuvem).
   */
  async entrar(login, senha, ateMs, iteracoes = ITERACOES) {
    const emb = (await this.cru.ler('embrulhos')) || {};
    let chave = emb[login] ? await desembrulhar(emb[login], senha) : null;
    let nova = false;
    if (!chave) {
      // sem embrulho deste usuário (ou a senha mudou): usa a chave aberta da sessão, se houver; senão cria outra
      chave = this.chave || (await this.cru.ler('chave-sessao'))?.chave || null;
      if (!chave) {
        nova = Object.keys(emb).length > 0 || !!(await this.cru.ler('base'));
        const esperando = Number(await this.cru.ler('aguardando-dados') || 0) + Number(await this.cru.ler('aguardando-anexos') || 0);
        if (nova && esperando) {
          throw Object.assign(new Error('Este aparelho tem mudanças de outro usuário que ainda não foram para a nuvem. Peça para quem as fez entrar aqui com internet; depois você entra.'), { esperado: true });
        }
        chave = await novaChave();
      }
      emb[login] = await embrulhar(chave, senha, iteracoes);
      await this.cru.gravar('embrulhos', emb);
    }
    this.chave = chave;
    await this.cru.gravar('chave-sessao', { chave, ate: ateMs });
    return { chave, nova };
  }

  async sair() {
    this.chave = null;
    await this.cru.apagar?.('chave-sessao');
  }
}
