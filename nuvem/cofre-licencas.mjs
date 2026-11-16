// Cofre das licenças (Durable Object com SQLite, separado dos cofres com os dados dos clientes): fichas das chaves,
// licenças das empresas, equipe de vendas e histórico. Rotas do painel do vendedor (painel-vendas.mjs) e as que o
// sistema do cliente vai chamar (ativar, renovar, certificado). As regras ficam em licencas.mjs (puras).
// A chave secreta que assina os certificados só existe como segredo do Worker (LICENCA_CHAVE_PRIVADA, JWK Ed25519).
// O vendedor nunca vê dados dos clientes (inquilinos, contratos): só empresa, plano, datas e situação.

import * as L from './licencas.mjs';

/** Papéis do painel. Gerentes vêm do segredo GERENTES_VENDAS (no começo, só o dono); vendedores, da tabela `equipe`. */
export const PAPEIS = { vendedor: 1, gerente: 2 };
export const MAX_LISTA = 500;
const MAX_CORPO = 64 * 1024;

const json = (status, dados) => new Response(JSON.stringify(dados), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

const emailDe = (t) => String(t || '').trim().toLowerCase();
const emailValido = (e) => /^[^\s@]{1,100}@[^\s@]{1,100}\.[^\s@]{2,30}$/.test(e);

/** A lógica do cofre (recebe `sql` e `transacao`, como `Cofre` em cofre.mjs, para os testes rodarem no Node). */
export class CofreLicencas {
  /**
   * @param {{exec: (q: string, ...p: any[]) => {toArray: () => any[]}}} sql  ctx.storage.sql no Cloudflare
   * @param {(fn: () => any) => any} transacao  ctx.storage.transactionSync no Cloudflare
   * @param {{gerentes?: string, chavePrivada?: string, relogio?: () => Date, aleatorio?: (b: Uint8Array) => Uint8Array}} opcoes
   */
  constructor(sql, transacao, { gerentes = '', chavePrivada = '', relogio = () => new Date(), aleatorio } = {}) {
    this.sql = sql; this.transacao = transacao; this.relogio = relogio; this.aleatorio = aleatorio; this.chavePrivada = chavePrivada;
    this.gerentes = String(gerentes).split(',').map(emailDe).filter(Boolean);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS chaves (chave TEXT PRIMARY KEY, dados TEXT NOT NULL, vendedor TEXT NOT NULL, criada TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS licencas (empresa TEXT PRIMARY KEY, dados TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS equipe (email TEXT PRIMARY KEY, dados TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS historico (id INTEGER PRIMARY KEY AUTOINCREMENT, em TEXT NOT NULL, por TEXT NOT NULL, acao TEXT NOT NULL, chave TEXT, empresa TEXT, detalhe TEXT)`);
  }

  q(consulta, ...p) { return this.sql.exec(consulta, ...p).toArray(); }
  hoje() { return L.hojeBR(this.relogio()); }
  registrar(por, acao, { chave = null, empresa = null, detalhe = null } = {}) {
    this.sql.exec('INSERT INTO historico (em, por, acao, chave, empresa, detalhe) VALUES (?, ?, ?, ?, ?, ?)', this.relogio().toISOString(), por, acao, chave, empresa, detalhe ? JSON.stringify(detalhe) : null);
  }

  ficha(chave) { const l = this.q('SELECT dados FROM chaves WHERE chave = ?', chave)[0]; return l ? JSON.parse(l.dados) : null; }
  gravarFicha(f) { this.sql.exec('INSERT INTO chaves (chave, dados, vendedor, criada) VALUES (?, ?, ?, ?) ON CONFLICT(chave) DO UPDATE SET dados = excluded.dados', f.chave, JSON.stringify(f), f.vendedor, f.criada); }
  licenca(empresa) { const l = this.q('SELECT dados FROM licencas WHERE empresa = ?', empresa)[0]; return l ? JSON.parse(l.dados) : null; }
  gravarLicenca(x) { this.sql.exec('INSERT INTO licencas (empresa, dados) VALUES (?, ?) ON CONFLICT(empresa) DO UPDATE SET dados = excluded.dados', x.empresa, JSON.stringify(x)); }
  nomesDasEmpresas() { return Object.fromEntries(this.q('SELECT empresa, dados FROM licencas').map((l) => [l.empresa, JSON.parse(l.dados).nome])); }

  // ---------------------------------------------------------------- equipe
  /** Papel de quem entrou no painel: 'gerente', 'vendedor' ou '' (sem acesso). */
  papel(email) {
    const e = emailDe(email);
    if (!e) return '';
    if (this.gerentes.includes(e)) return 'gerente';
    const l = this.q('SELECT dados FROM equipe WHERE email = ?', e)[0];
    const v = l ? JSON.parse(l.dados) : null;
    return v && v.ativo ? v.papel : '';
  }
  membro(email) {
    const e = emailDe(email);
    if (this.gerentes.includes(e)) return { email: e, papel: 'gerente', planos: Object.keys(L.PLANOS), ativo: true, fixo: true };
    const l = this.q('SELECT dados FROM equipe WHERE email = ?', e)[0];
    return l ? JSON.parse(l.dados) : null;
  }
  exigir(email, nivel) {
    const p = this.papel(email);
    if (!p) throw new L.ErroLicenca(403, 'Este e-mail não tem acesso ao painel de vendas.');
    if (PAPEIS[p] < PAPEIS[nivel]) throw new L.ErroLicenca(403, 'Só o gerente pode fazer isto.');
    return p;
  }

  equipe(email) {
    this.exigir(email, 'gerente');
    const fixos = this.gerentes.map((g) => this.membro(g));
    return [...fixos, ...this.q('SELECT dados FROM equipe ORDER BY email').map((l) => JSON.parse(l.dados)).filter((m) => !this.gerentes.includes(m.email))];
  }

  /** Cadastra ou muda um vendedor (gerente). `planos`: os que ele pode vender. */
  gravarMembro(email, { email: quem, papel = 'vendedor', planos, ativo = true, nome = '' } = {}) {
    this.exigir(email, 'gerente');
    const e = emailDe(quem);
    if (!emailValido(e)) throw new L.ErroLicenca(400, 'E-mail inválido.');
    if (this.gerentes.includes(e)) throw new L.ErroLicenca(400, 'Os gerentes fixos ficam no segredo GERENTES_VENDAS do Worker.');
    if (!PAPEIS[papel]) throw new L.ErroLicenca(400, 'Papel desconhecido.');
    const lista = Array.isArray(planos) && planos.length ? planos : Object.keys(L.PLANOS);
    if (lista.some((p) => !L.PLANOS[p])) throw new L.ErroLicenca(400, 'Plano desconhecido.');
    const m = { email: e, nome: String(nome).trim().slice(0, 120), papel, planos: [...new Set(lista)], ativo: !!ativo };
    return this.transacao(() => {
      this.sql.exec('INSERT INTO equipe (email, dados) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET dados = excluded.dados', e, JSON.stringify(m));
      this.registrar(emailDe(email), 'equipe', { detalhe: m });
      return m;
    });
  }

  // ---------------------------------------------------------------- chaves
  /** Gera uma chave nova. Vendedor: só os planos liberados para ele e os limites do plano; gerente: pode mudar os limites. */
  gerar(email, pedido = {}) {
    const papel = this.exigir(email, 'vendedor');
    const m = this.membro(email);
    if (!m.planos.includes(pedido.plano)) throw new L.ErroLicenca(403, 'Este plano não está liberado para você.');
    if (pedido.limites && papel !== 'gerente') throw new L.ErroLicenca(403, 'Só o gerente muda os limites do plano.');
    if (pedido.email && !emailValido(emailDe(pedido.email))) throw new L.ErroLicenca(400, 'E-mail do cliente inválido.');
    return this.transacao(() => {
      let f;
      for (let i = 0; i < 5 && (!f || this.ficha(f.chave)); i += 1) {
        f = L.novaFicha({ ...pedido, vendedor: emailDe(email), criada: this.hoje(), aleatorio: this.aleatorio });
      }
      if (this.ficha(f.chave)) throw new L.ErroLicenca(500, 'Não foi possível sortear uma chave nova. Tente de novo.');
      f.criada_em = this.relogio().toISOString();
      this.gravarFicha(f);
      this.registrar(emailDe(email), 'gerar', { chave: f.chave, detalhe: { plano: f.plano, cliente: f.cliente } });
      return f;
    });
  }

  /** Lista para o painel: vendedor vê só as chaves que gerou; gerente vê tudo. `filtro`: 'vence60' (vence nos próximos 60 dias). */
  lista(email, { filtro = '' } = {}) {
    const papel = this.exigir(email, 'vendedor');
    const hoje = this.hoje();
    const linhas = papel === 'gerente'
      ? this.q('SELECT dados FROM chaves ORDER BY criada DESC, chave LIMIT ?', MAX_LISTA)
      : this.q('SELECT dados FROM chaves WHERE vendedor = ? ORDER BY criada DESC, chave LIMIT ?', emailDe(email), MAX_LISTA);
    const nomes = this.nomesDasEmpresas();
    const chaves = linhas.map((l) => JSON.parse(l.dados)).map((f) => ({
      ...f, empresa_nome: f.usada_por ? nomes[f.usada_por] || f.usada_por : '',
      estado: f.revogada ? 'revogada' : f.usada_por ? 'usada' : hoje > f.usar_ate ? 'vencida' : 'livre',
    }));
    const minhas = new Set(chaves.map((c) => c.usada_por).filter(Boolean));
    let licencas = this.q('SELECT dados FROM licencas ORDER BY empresa').map((l) => JSON.parse(l.dados))
      .filter((x) => papel === 'gerente' || minhas.has(x.empresa))
      .map((x) => ({ ...x, situacao: L.situacao(x, hoje) }));
    if (filtro === 'vence60') licencas = licencas.filter((x) => !x.ilimitada && !x.revogada && L.diasEntre(hoje, x.ate) <= 60 && x.situacao.estado !== 'apagar');
    return { hoje, papel, chaves, licencas };
  }

  /** Revoga uma chave não usada, ou a licença de uma empresa (gerente). Pede o motivo; fica no histórico. */
  revogar(email, { chave, empresa, motivo } = {}) {
    this.exigir(email, 'gerente');
    const por = emailDe(email); const hoje = this.hoje();
    return this.transacao(() => {
      if (empresa) {
        const x = this.licenca(empresa);
        if (!x) throw new L.ErroLicenca(404, 'Empresa sem licença.');
        const nova = L.revogar(x, { motivo, por, hoje });
        this.gravarLicenca(nova);
        this.registrar(por, 'revogar licença', { empresa, detalhe: { motivo } });
        return { licenca: nova };
      }
      const f = this.ficha(L.normalizarChave(chave));
      if (!f) throw new L.ErroLicenca(404, 'Chave não encontrada.');
      if (f.usada_por) throw new L.ErroLicenca(409, `Esta chave já foi usada pela empresa ${f.usada_por}: revogue a licença da empresa.`);
      const nova = L.revogar(f, { motivo, por, hoje });
      this.gravarFicha(nova);
      this.registrar(por, 'revogar chave', { chave: f.chave, detalhe: { motivo } });
      return { ficha: nova };
    });
  }

  /** Prazo extra (cortesia) para uma empresa (gerente). */
  cortesia(email, { empresa, dias, motivo } = {}) {
    this.exigir(email, 'gerente');
    const por = emailDe(email);
    return this.transacao(() => {
      const x = this.licenca(empresa);
      if (!x) throw new L.ErroLicenca(404, 'Empresa sem licença.');
      const nova = L.darCortesia(x, { dias, motivo, por, hoje: this.hoje() });
      this.gravarLicenca(nova);
      this.registrar(por, 'cortesia', { empresa, detalhe: { dias: Number(dias), motivo, ate: nova.ate } });
      return { licenca: nova };
    });
  }

  /** Licença da casa (sem prazo e sem limites), para o dono (gerente). */
  casa(email, { empresa, nome, cnpjs } = {}) {
    this.exigir(email, 'gerente');
    const por = emailDe(email);
    return this.transacao(() => {
      if (this.licenca(empresa)) throw new L.ErroLicenca(409, 'Esta empresa já tem licença.');
      const x = L.licencaIlimitada({ empresa, nome, cnpjs, hoje: this.hoje() });
      this.gravarLicenca(x);
      this.registrar(por, 'licença da casa', { empresa });
      return { licenca: x };
    });
  }

  /**
   * Texto do e-mail da chave, para reenviar (o painel abre no programa de e-mail; o envio direto pelo Gmail fica para depois).
   * Vendedor só reenvia as chaves que gerou.
   */
  reenviar(email, { chave, para } = {}) {
    const papel = this.exigir(email, 'vendedor');
    const f = this.ficha(L.normalizarChave(chave));
    if (!f || (papel !== 'gerente' && f.vendedor !== emailDe(email))) throw new L.ErroLicenca(404, 'Chave não encontrada.');
    if (f.revogada) throw new L.ErroLicenca(409, 'Esta chave foi revogada.');
    const destino = emailDe(para || f.email);
    if (!emailValido(destino)) throw new L.ErroLicenca(400, 'Informe o e-mail do cliente.');
    this.registrar(emailDe(email), 'reenviar', { chave: f.chave, detalhe: { para: destino } });
    const limites = f.limites;
    return {
      para: destino,
      assunto: `Sua chave de licença: ${f.nome_plano}`,
      texto: [
        `Olá${f.cliente ? `, ${f.cliente}` : ''}!`, '',
        `Sua chave de licença (${f.nome_plano}): ${f.chave}`, '',
        `Ela vale para até ${limites.imoveis} imóveis, ${limites.inquilinos} inquilinos com contrato ativo, ${limites.usuarios} usuários e ${limites.cnpjs} empresas (CNPJs).`,
        `Use a chave até ${L.dataBR(f.usar_ate)}: depois dessa data, sem ter sido usada, ela deixa de valer.`, '',
        'Para começar, abra o sistema, entre em Ativar e cole a chave.', '',
        'A chave só serve uma vez. Guarde este e-mail.',
      ].join('\n'),
    };
  }

  historico(email, { chave, empresa } = {}) {
    this.exigir(email, 'gerente');
    const linhas = chave ? this.q('SELECT * FROM historico WHERE chave = ? ORDER BY id DESC LIMIT 200', chave)
      : empresa ? this.q('SELECT * FROM historico WHERE empresa = ? ORDER BY id DESC LIMIT 200', empresa)
        : this.q('SELECT * FROM historico ORDER BY id DESC LIMIT 200');
    return linhas.map((l) => ({ ...l, detalhe: l.detalhe ? JSON.parse(l.detalhe) : null }));
  }

  // ---------------------------------------------------------------- sistema do cliente
  /**
   * Ativação (o sistema do cliente chama, com o administrador já conferido): marca a chave e cria a licença.
   * Devolve a licença, a situação e o certificado assinado que o sistema guarda.
   */
  async ativar({ chave, empresa, nome, cnpjs, por } = {}) {
    this.exigirAssinatura();
    const hoje = this.hoje();
    const r = this.transacao(() => {
      if (this.licenca(empresa)) throw new L.ErroLicenca(409, 'Esta empresa já tem licença: use Renovar.');
      const f = this.ficha(L.normalizarChave(chave));
      const { ficha, licenca } = L.ativar(f, { empresa, nome, cnpjs, hoje, por }, this.nomesDasEmpresas());
      this.gravarFicha(ficha); this.gravarLicenca(licenca);
      this.registrar(emailDe(por) || 'sistema', 'ativar', { chave: ficha.chave, empresa, detalhe: { ate: licenca.ate } });
      return licenca;
    });
    return this.resposta(r, hoje);
  }

  /** Renovação com uma chave nova: o prazo soma (licencas.mjs, `renovar`). */
  async renovar({ chave, empresa, por } = {}) {
    this.exigirAssinatura();
    const hoje = this.hoje();
    const r = this.transacao(() => {
      const f = this.ficha(L.normalizarChave(chave));
      const { ficha, licenca } = L.renovar(this.licenca(empresa), f, { hoje }, this.nomesDasEmpresas());
      this.gravarFicha(ficha); this.gravarLicenca(licenca);
      this.registrar(emailDe(por) || 'sistema', 'renovar', { chave: ficha.chave, empresa, detalhe: { ate: licenca.ate } });
      return licenca;
    });
    return this.resposta(r, hoje);
  }

  /** Sem a chave de assinatura, nem começa: a chave do cliente não pode ser gasta sem o certificado voltar. */
  exigirAssinatura() {
    if (!this.chavePrivada) throw new L.ErroLicenca(503, 'Servidor de licenças sem a chave de assinatura (LICENCA_CHAVE_PRIVADA).');
  }

  /** Licença atual e certificado novo (o sistema confere a cada abertura com internet: pega cortesia e revogação). */
  async certificado({ empresa } = {}) {
    const x = this.licenca(empresa);
    if (!x) throw new L.ErroLicenca(404, 'Sistema sem licença. Ative com a sua chave.');
    return this.resposta(x, this.hoje());
  }

  async resposta(licenca, hoje) {
    const { chaves, cortesias, ativada_por, ...visivel } = licenca; // eslint-disable-line no-unused-vars
    return { licenca: visivel, situacao: L.situacao(licenca, hoje), certificado: await L.assinarCertificado(licenca, this.chavePrivada, hoje) };
  }

  // ---------------------------------------------------------------- pedidos
  /**
   * Atende um pedido já conferido pelo Worker. `X-Email-Conferido`: quem entrou (painel: login do Access; cliente: o administrador).
   * Rotas do painel: eu, planos, lista, equipe, historico (GET) · gerar, revogar, cortesia, reenviar, equipe, casa (POST).
   * Rotas do sistema do cliente: cliente/ativar, cliente/renovar (POST) · cliente/certificado (GET); `X-Empresa`: a empresa do login.
   */
  async atender(request) {
    const url = new URL(request.url);
    const rota = url.pathname.replace(/^\/+/, '');
    const email = emailDe(request.headers.get('X-Email-Conferido'));
    const m = request.method;
    try {
      if (!email) throw new L.ErroLicenca(401, 'Pedido sem login.');
      let corpo = {};
      if (m === 'POST') {
        const t = await request.text();
        if (t.length > MAX_CORPO) throw new L.ErroLicenca(413, 'Pedido grande demais.');
        try { corpo = t ? JSON.parse(t) : {}; } catch { throw new L.ErroLicenca(400, 'Pedido inválido.'); }
        if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new L.ErroLicenca(400, 'Pedido inválido.');
      }
      if (rota.startsWith('cliente/')) {
        const empresa = String(request.headers.get('X-Empresa') || '');
        const dados = { ...corpo, empresa, por: email };
        if (rota === 'cliente/ativar' && m === 'POST') return json(200, await this.ativar(dados));
        if (rota === 'cliente/renovar' && m === 'POST') return json(200, await this.renovar(dados));
        if (rota === 'cliente/certificado' && m === 'GET') return json(200, await this.certificado(dados));
        return json(404, { erro: 'Não encontrado.' });
      }
      const busca = Object.fromEntries(url.searchParams);
      if (m === 'GET') {
        if (rota === 'eu') { const papel = this.exigir(email, 'vendedor'); return json(200, { email, papel, planos: this.membro(email).planos }); }
        if (rota === 'planos') { this.exigir(email, 'vendedor'); return json(200, { planos: L.PLANOS, limites: L.LIMITES_PADRAO }); }
        if (rota === 'lista') return json(200, this.lista(email, busca));
        if (rota === 'equipe') return json(200, { equipe: this.equipe(email) });
        if (rota === 'historico') return json(200, { historico: this.historico(email, busca) });
      }
      if (m === 'POST') {
        if (rota === 'gerar') return json(200, { ficha: this.gerar(email, corpo) });
        if (rota === 'revogar') return json(200, this.revogar(email, corpo));
        if (rota === 'cortesia') return json(200, this.cortesia(email, corpo));
        if (rota === 'reenviar') return json(200, this.reenviar(email, corpo));
        if (rota === 'equipe') return json(200, { membro: this.gravarMembro(email, corpo) });
        if (rota === 'casa') return json(200, this.casa(email, corpo));
      }
      return json(404, { erro: 'Não encontrado.' });
    } catch (e) {
      if (e instanceof L.ErroLicenca) return json(e.status, { erro: e.message });
      console.error(e);
      return json(500, { erro: 'Erro no servidor de licenças.' });
    }
  }
}

/** O Durable Object (Cloudflare). Um só, com nome fixo: `env.LICENCAS.idFromName('licencas')`. */
export class CofreLicencasDO {
  constructor(ctx, env) {
    this.cofre = new CofreLicencas(ctx.storage.sql, (fn) => ctx.storage.transactionSync(fn), {
      gerentes: env.GERENTES_VENDAS || '', chavePrivada: env.LICENCA_CHAVE_PRIVADA || '',
    });
  }

  fetch(request) { return this.cofre.atender(request); }
}

/**
 * Pedido ao cofre das licenças a partir do Worker (painel ou, depois, o sistema do cliente).
 * `email` sempre conferido antes (login); `empresa` só nas rotas cliente/ e tirada do login, nunca do que o navegador manda.
 */
export function pedirAoCofreDeLicencas(env, rota, { method = 'GET', corpo, email, empresa = '', busca = '' } = {}) {
  if (!env.LICENCAS) return Promise.resolve(json(503, { erro: 'Worker sem o cofre das licenças ligado (binding LICENCAS).' }));
  const cofre = env.LICENCAS.get(env.LICENCAS.idFromName('licencas'));
  return cofre.fetch(new Request(`https://licencas/${rota}${busca}`, {
    method, body: corpo, headers: { 'Content-Type': 'application/json', 'X-Email-Conferido': email, 'X-Empresa': empresa },
  }));
}
