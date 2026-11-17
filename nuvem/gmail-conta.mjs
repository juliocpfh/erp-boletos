// Gmail ligado pelo botão "Conectar o Gmail" (lado do cofre): a conta ligada (refresh token JÁ CIFRADO pelo Worker, gmail.mjs,
// e o e-mail da conta) e os pedidos de ligação em andamento (state de uso único, 10 minutos, ligado ao administrador que pediu,
// com o verificador do PKCE). Tabelas próprias, fora dos registros: nunca vão para o JSON, para os aparelhos nem para os backups.
// Só o administrador liga, troca ou desliga. A leitura da conta (rota interna /gmail/conta) só o Worker alcança (o site chega
// ao cofre só pelas rotas de ROTAS_COFRE em worker.mjs) e o que sai dela continua cifrado.
import { VALIDADE_ESTADO, cifradoValido, emailValido } from './gmail.mjs';

export const MAX_ESTADOS_POR_PESSOA = 5; // pedidos abertos ao mesmo tempo (clicou várias vezes): o mais velho sai
const RE_HASH = /^[0-9a-f]{64}$/;
const RE_VERIFICADOR = /^[A-Za-z0-9_-]{43,128}$/;
const RECUSADO = 'Pedido de ligação do Gmail inválido, já usado ou vencido. Clique em "Conectar o Gmail" de novo.';

export class ContaGmail {
  /**
   * @param {import('./cofre.mjs').Cofre} cofre  usa o sql, o relógio e o exigir (papel) do cofre
   * @param {new (status: number, mensagem: string) => Error} Erro  ErroCofre (sem importar cofre.mjs: um importaria o outro)
   */
  constructor(cofre, Erro) {
    this.c = cofre; this.Erro = Erro;
    cofre.sql.exec(`CREATE TABLE IF NOT EXISTS gmail_estados (hash TEXT PRIMARY KEY, email TEXT NOT NULL, verificador TEXT NOT NULL, ate INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS gmail_conta (id INTEGER PRIMARY KEY CHECK (id = 1), cifrado TEXT NOT NULL, email TEXT, ligado_em TEXT NOT NULL, ligado_por TEXT NOT NULL);`);
  }

  agora() { return this.c.relogio().getTime(); }

  /** Guarda um pedido de ligação: `hash` = SHA-256 do state (o state em si só existe no endereço do Google). */
  novoEstado({ hash, verificador } = {}, email) {
    this.c.exigir(email, 'admin');
    if (!RE_HASH.test(String(hash || '')) || !RE_VERIFICADOR.test(String(verificador || ''))) throw new this.Erro(400, 'Pedido inválido.');
    const quem = String(email).toLowerCase();
    const agora = this.agora();
    this.c.sql.exec('DELETE FROM gmail_estados WHERE ate <= ?', agora);
    const abertos = this.c.q('SELECT hash FROM gmail_estados WHERE email = ? ORDER BY ate DESC', quem);
    for (const x of abertos.slice(MAX_ESTADOS_POR_PESSOA - 1)) this.c.sql.exec('DELETE FROM gmail_estados WHERE hash = ?', x.hash);
    this.c.sql.exec('INSERT OR REPLACE INTO gmail_estados (hash, email, verificador, ate) VALUES (?, ?, ?, ?)', hash, quem, verificador, agora + VALIDADE_ESTADO);
    return { ok: true };
  }

  /**
   * Gasta o pedido (uma vez só: sai da tabela mesmo quando recusado). Recusa state desconhecido, vencido ou de outra pessoa
   * (o mesmo administrador que clicou em Conectar precisa voltar do Google). Devolve { verificador }.
   */
  usarEstado({ hash } = {}, email) {
    this.c.exigir(email, 'admin');
    if (!RE_HASH.test(String(hash || ''))) throw new this.Erro(400, RECUSADO);
    const e = this.c.q('SELECT email, verificador, ate FROM gmail_estados WHERE hash = ?', hash)[0];
    if (e) this.c.sql.exec('DELETE FROM gmail_estados WHERE hash = ?', hash);
    if (!e || Number(e.ate) <= this.agora() || e.email !== String(email).toLowerCase()) throw new this.Erro(400, RECUSADO);
    return { verificador: e.verificador };
  }

  /** Guarda (ou troca) a conta ligada. `cifrado`: o refresh token cifrado pelo Worker; `conta`: o e-mail da conta Google. */
  guardar({ cifrado, conta } = {}, email) {
    this.c.exigir(email, 'admin');
    if (!cifradoValido(cifrado)) throw new this.Erro(400, 'Autorização do Gmail inválida.');
    if (conta !== null && conta !== undefined && !emailValido(conta)) throw new this.Erro(400, 'E-mail da conta Google inválido.');
    const ligado_em = this.c.relogio().toISOString();
    this.c.sql.exec('INSERT OR REPLACE INTO gmail_conta (id, cifrado, email, ligado_em, ligado_por) VALUES (1, ?, ?, ?, ?)', cifrado, conta || null, ligado_em, String(email).toLowerCase());
    return { ok: true, conta: conta || null, ligado_em };
  }

  /** A conta ligada (com o refresh token cifrado) ou null. Só para o Worker (rota interna). */
  conta() {
    const r = this.c.q('SELECT cifrado, email, ligado_em, ligado_por FROM gmail_conta WHERE id = 1')[0];
    return r ? { cifrado: r.cifrado, email: r.email, ligado_em: r.ligado_em, ligado_por: r.ligado_por } : null;
  }

  /** Desconectar: apaga a conta e devolve a que estava (o Worker revoga no Google). */
  apagar(email) {
    this.c.exigir(email, 'admin');
    const antes = this.conta();
    this.c.sql.exec('DELETE FROM gmail_conta');
    this.c.sql.exec('DELETE FROM gmail_estados');
    return { conta: antes };
  }
}
