// Aparelhos ligados (crachá do aparelho): o programa do PC (atualizador-pc/) entra com e-mail e senha do sistema e recebe um
// crachá sorteado, que só lê (dados, backups, lista e arquivos, versão PC). O cofre guarda só o hash do crachá, numa tabela
// própria (fora dos registros: nunca vai para o JSON nem para os aparelhos). O crachá vale o papel do usuário que ligou
// (usuário desativado = crachá para), pode ser desligado em Usuários e vence se o computador ficar 90 dias sem usar.
// A senha é conferida como no site (docs/js/auth.js): a conta pesada (PBKDF2) é feita no computador da pessoa, nunca aqui
// (o Cloudflare Workers recusa PBKDF2 acima de 100.000 voltas, e as senhas são gravadas com 150.000 ou 600.000). Em dois passos,
// pela mesma rota: 1) e-mail sem senha → { desafio: { sal, iteracoes } }; 2) e-mail + `pbkdf2:<resumo>` → o cofre compara com o
// resumo gravado, em tempo constante, com limite de tentativas. A senha em si nunca chega à nuvem. Limite conhecido: quem já
// tem o resumo gravado de um usuário (administrador, backup aberto) consegue um crachá, que só lê, sem saber a senha.
// Decisão do dono em 15/11/2026 (documentacao/PROPOSTA_LICENCA_E_PROGRAMA_PC.md, seção 8, item 10).

export const DIAS_SEM_USO = 90; // parado mais que isso: o crachá para e o computador entra de novo
export const MAX_ITERACOES = 2000000; // trava contra um usuário gravado com voltas demais (o cofre pararia)
const ITERACOES_ANTIGAS = 150000; // iguais a docs/js/auth.js (usuário sem senha_iteracoes)
const ITERACOES_PADRAO = 600000;
const MINUTO = 60000;
/**
 * Tentativas erradas por janela (sem o Access na frente, a porta é pública). Por e-mail e por endereço de internet: passou, espera.
 * No total (somando todo mundo): passou, ninguém fica de fora; cada tentativa só demora ATRASO_GERAL (quem tenta de muitos
 * lugares anda devagar, e o dono continua entrando).
 */
export const LIMITES = {
  email: { max: 5, janela: 15 * MINUTO },
  ip: { max: 10, janela: 15 * MINUTO },
  geral: { max: 50, janela: 60 * MINUTO },
};
export const ATRASO_GERAL = 2000;
const FORMATO_RESUMO = /^pbkdf2:([0-9a-f]{64})$/;
export const PREFIXO = 'ap1_';
const FORMATO_CRACHA = /^ap1_[A-Za-z0-9_-]{43}$/;
export const crachaValido = (t) => FORMATO_CRACHA.test(String(t || ''));

export class ErroAparelho extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const hashDoCracha = async (t) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))));

/** Compara sem parar no primeiro caractere diferente. */
function mesmoTexto(a, b) {
  const x = String(a); const y = String(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) dif |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return dif === 0;
}

/** Nome do computador como aparece em Usuários: sem caracteres de controle, até 60 letras. */
export function nomeDoComputador(t) {
  // eslint-disable-next-line no-control-regex
  const n = String(t || '').replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 60);
  if (!n) throw new ErroAparelho(400, 'Falta o nome do computador.');
  return n;
}

export class Aparelhos {
  /** @param {import('./cofre.mjs').Cofre} cofre  usa o sql, o relógio e os usuários do cofre */
  constructor(cofre) {
    this.c = cofre;
    /** A espera do limite geral (trocada nos testes). */
    this.esperar = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
    cofre.sql.exec(`CREATE TABLE IF NOT EXISTS aparelhos (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL UNIQUE, computador TEXT NOT NULL,
        usuario_id INTEGER NOT NULL, ligado_por TEXT NOT NULL, ligado_em TEXT NOT NULL, ultimo_uso TEXT NOT NULL, desligado_em TEXT, desligado_por TEXT);
      CREATE TABLE IF NOT EXISTS tentativas_aparelho (chave TEXT PRIMARY KEY, falhas INTEGER NOT NULL, desde TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS segredo_aparelho (id INTEGER PRIMARY KEY CHECK (id = 1), valor TEXT NOT NULL);`);
  }

  agora() { return this.c.relogio(); }

  usuarios() { return this.c.q("SELECT dados FROM registros WHERE tabela = 'usuarios'").map((r) => JSON.parse(r.dados)); }
  /** Usuário que pode ligar um computador (ativo e já aprovado), pelo login ou pelo e-mail. */
  usuarioPorEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e) return null;
    return this.usuarios().find((u) => u.ativo !== false && !u.pendente && [u.login, u.email].some((v) => String(v || '').toLowerCase() === e)) || null;
  }
  usuarioPorId(id) { return this.usuarios().find((u) => u.id === id && u.ativo !== false && !u.pendente) || null; }

  // ---------------------------------------------------------------------------
  // Limite de tentativas
  // ---------------------------------------------------------------------------
  tentativas(chave, janela) {
    const l = this.c.q('SELECT falhas, desde FROM tentativas_aparelho WHERE chave = ?', chave)[0];
    if (!l || this.agora().getTime() - Date.parse(l.desde) >= janela) return { falhas: 0, desde: this.agora().toISOString() };
    return { falhas: Number(l.falhas), desde: l.desde };
  }
  chavesDe(email, ip) {
    return [['email', `email:${String(email || '').trim().toLowerCase().slice(0, 200)}`], ['ip', ip ? `ip:${String(ip).slice(0, 60)}` : ''], ['geral', 'geral']].filter(([, k]) => k);
  }
  /** Tira as linhas vencidas (a maior janela já passou): a tabela não cresce com e-mails e endereços que nunca mais voltam. */
  limparTentativas() {
    const maior = Math.max(...Object.values(LIMITES).map((l) => l.janela));
    this.c.sql.exec('DELETE FROM tentativas_aparelho WHERE desde < ?', new Date(this.agora().getTime() - maior).toISOString());
  }
  /**
   * Recusa (429) se o e-mail ou o endereço passou do limite; senão conta esta tentativa já (antes de conferir: pedidos ao mesmo
   * tempo não escapam). O total não recusa ninguém: devolve quantos milissegundos esta tentativa deve esperar (0 = nada).
   */
  contarTentativa(email, ip) {
    this.limparTentativas();
    const chaves = this.chavesDe(email, ip);
    let atraso = 0;
    for (const [tipo, chave] of chaves) {
      const { max, janela } = LIMITES[tipo];
      const t = this.tentativas(chave, janela);
      if (t.falhas < max) continue;
      if (tipo === 'geral') { atraso = ATRASO_GERAL; continue; }
      const min = Math.max(1, Math.ceil((Date.parse(t.desde) + janela - this.agora().getTime()) / MINUTO));
      throw new ErroAparelho(429, `Muitas tentativas erradas. Espere ${min} minuto${min > 1 ? 's' : ''} e tente de novo.`);
    }
    for (const [tipo, chave] of chaves) {
      const t = this.tentativas(chave, LIMITES[tipo].janela);
      this.c.sql.exec('INSERT INTO tentativas_aparelho (chave, falhas, desde) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET falhas = excluded.falhas, desde = excluded.desde', chave, t.falhas + 1, t.desde);
    }
    return atraso;
  }
  /** Deu certo: a tentativa não conta (o e-mail e o endereço ficam zerados). */
  esquecerTentativa(email, ip) {
    for (const [tipo, chave] of this.chavesDe(email, ip)) {
      if (tipo === 'geral') this.c.sql.exec('UPDATE tentativas_aparelho SET falhas = MAX(0, falhas - 1) WHERE chave = ?', chave);
      else this.c.sql.exec('DELETE FROM tentativas_aparelho WHERE chave = ?', chave);
    }
  }

  // ---------------------------------------------------------------------------
  // Ligar, conferir, listar e desligar
  // ---------------------------------------------------------------------------
  /** Sal de mentira para e-mail que não existe: sempre o mesmo para o mesmo e-mail (não dá para saber, pelo sal, quem tem cadastro). */
  async salDeMentira(email) {
    let seg = this.c.q('SELECT valor FROM segredo_aparelho WHERE id = 1')[0]?.valor;
    if (!seg) {
      seg = hex(crypto.getRandomValues(new Uint8Array(32)));
      this.c.sql.exec('INSERT OR IGNORE INTO segredo_aparelho (id, valor) VALUES (1, ?)', seg);
    }
    return (await hashDoCracha(`${seg}:${email}`)).slice(0, 32);
  }

  /**
   * Passo 1 (sem `senha`): devolve { desafio: { sal, iteracoes } } para o computador fazer a conta da senha lá.
   * Passo 2 (`senha` = 'pbkdf2:<resumo em hex>'): confere e devolve o crachá novo (o texto só aparece aqui, uma vez).
   * `ip` vem do Worker (CF-Connecting-IP).
   */
  async entrar(pedido, ip = '') {
    const email = String(pedido?.email || '').trim().toLowerCase();
    const semSenha = pedido?.senha === undefined || pedido?.senha === null;
    const senha = semSenha ? '' : String(pedido.senha);
    if (!email || email.length > 200 || senha.length > 500 || (!semSenha && !senha)) throw new ErroAparelho(400, 'Informe o e-mail e a senha do sistema.');
    const u = this.usuarioPorEmail(email);
    const iteracoes = u ? Number(u.senha_iteracoes) || ITERACOES_ANTIGAS : ITERACOES_PADRAO;
    if (semSenha) return { desafio: { sal: String(u?.senha_sal || await this.salDeMentira(email)), iteracoes: Math.min(iteracoes, MAX_ITERACOES) } };
    const computador = nomeDoComputador(pedido?.computador);
    const resumo = FORMATO_RESUMO.exec(senha)?.[1];
    if (!resumo) throw new ErroAparelho(400, 'Este programa do computador é antigo e não consegue mais entrar: baixe a versão nova do programa (Administracao-de-Imoveis.exe) e ligue de novo.');
    const atraso = this.contarTentativa(email, ip);
    if (atraso) await this.esperar(atraso);
    // sem usuário, compara do mesmo jeito (com um resumo que nunca bate)
    const certo = mesmoTexto(resumo, String(u?.senha_hash || '').toLowerCase() || '0'.repeat(64));
    if (!u || !u.senha_hash || iteracoes > MAX_ITERACOES || !certo) throw new ErroAparelho(401, 'E-mail ou senha errados.');
    this.esquecerTentativa(email, ip);
    const cracha = PREFIXO + b64url(crypto.getRandomValues(new Uint8Array(32)));
    const agora = this.agora().toISOString();
    this.c.sql.exec('INSERT INTO aparelhos (hash, computador, usuario_id, ligado_por, ligado_em, ultimo_uso) VALUES (?, ?, ?, ?, ?, ?)',
      await hashDoCracha(cracha), computador, u.id, String(u.login || u.email).toLowerCase(), agora, agora);
    const id = Number(this.c.q('SELECT MAX(id) AS m FROM aparelhos')[0].m);
    return { cracha, id, computador, login: u.login || u.email, nome: u.nome || '', papel: u.papel };
  }

  /** Crachá → { email, papel, aparelho }. Desligado, parado há 90 dias ou de usuário desativado: recusa. Marca o último uso. */
  async conferir(cracha) {
    const naoVale = new ErroAparelho(401, 'Este computador não está mais ligado ao sistema. Ligue de novo com o e-mail e a senha (abra o programa do computador com --ligar, ou ligar-computador.cmd).');
    if (!crachaValido(cracha)) throw naoVale;
    const a = this.c.q('SELECT * FROM aparelhos WHERE hash = ? AND desligado_em IS NULL', await hashDoCracha(cracha))[0];
    if (!a) throw naoVale;
    const agora = this.agora();
    if (agora.getTime() - Date.parse(a.ultimo_uso) > DIAS_SEM_USO * 24 * 60 * MINUTO) {
      this.c.sql.exec('UPDATE aparelhos SET desligado_em = ?, desligado_por = ? WHERE id = ?', agora.toISOString(), `parado ${DIAS_SEM_USO} dias`, a.id);
      throw naoVale;
    }
    const u = this.usuarioPorId(Number(a.usuario_id));
    if (!u) throw new ErroAparelho(403, 'O usuário que ligou este computador foi desativado no sistema. Ligue de novo com outro usuário.');
    if (agora.getTime() - Date.parse(a.ultimo_uso) > MINUTO) this.c.sql.exec('UPDATE aparelhos SET ultimo_uso = ? WHERE id = ?', agora.toISOString(), a.id);
    return { email: String(u.login || u.email).toLowerCase(), papel: u.papel, aparelho: Number(a.id) };
  }

  /** Os ligados: o administrador vê todos; os outros, só os que eles mesmos ligaram. `quem` = { papel, id } de exigir(). */
  lista(quem) {
    const nomes = new Map(this.usuarios().map((u) => [u.id, u]));
    const limite = this.agora().getTime() - DIAS_SEM_USO * 24 * 60 * MINUTO;
    return {
      aparelhos: this.c.q('SELECT id, computador, usuario_id, ligado_por, ligado_em, ultimo_uso FROM aparelhos WHERE desligado_em IS NULL ORDER BY ligado_em')
        .filter((a) => quem?.papel === 'admin' || Number(a.usuario_id) === quem?.id)
        .map((a) => {
          const u = nomes.get(Number(a.usuario_id));
          return { id: Number(a.id), computador: a.computador, usuario_id: Number(a.usuario_id), ligado_por: a.ligado_por, nome: u?.nome || a.ligado_por,
            ligado_em: a.ligado_em, ultimo_uso: a.ultimo_uso, parado: Date.parse(a.ultimo_uso) < limite, usuario_ativo: !!(u && u.ativo !== false && !u.pendente) };
        }),
    };
  }

  /** Desliga na hora (o Worker guarda o "vale" por até 1 minuto). Administrador desliga qualquer um; os outros, os próprios. */
  desligar(pedido, quem, email) {
    const id = Number(pedido?.id);
    const a = Number.isSafeInteger(id) && this.c.q('SELECT id, usuario_id FROM aparelhos WHERE id = ? AND desligado_em IS NULL', id)[0];
    if (!a) throw new ErroAparelho(404, 'Este computador já estava desligado.');
    if (quem?.papel !== 'admin' && Number(a.usuario_id) !== quem?.id) throw new ErroAparelho(403, 'Só o administrador desliga o computador ligado por outra pessoa.');
    this.c.sql.exec('UPDATE aparelhos SET desligado_em = ?, desligado_por = ? WHERE id = ?', this.agora().toISOString(), String(email || '').toLowerCase(), id);
    return { ok: true };
  }
}
