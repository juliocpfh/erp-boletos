// Cofre dos dados na nuvem (Durable Object com SQLite): recebe as filas de mudanças de cada aparelho, uma por vez, em ordem.
// Cada registro (contrato, boleto…) é uma linha; cada campo sabe quem o mudou por último. Mesmo campo mudado em dois aparelhos
// sem se verem = conflito: fica o valor já gravado e o outro vira proposta até o administrador escolher (DECISOES.md, 2026-11-17).
// Também: faixas de códigos por aparelho (sem internet não repete), contador da NF (só com internet), backup diário no R2.
// A lógica fica em `Cofre` (recebe `sql` e `transacao`) para os testes rodarem no Node com node:sqlite.
// Crachás do programa do PC (aparelhos ligados): aparelhos.mjs, numa tabela própria. Gmail ligado pelo botão: gmail-conta.mjs.
import { Aparelhos, ErroAparelho } from './aparelhos.mjs';
import { ContaGmail } from './gmail-conta.mjs';
import { faxinaDosLinks } from './ficha-publica.mjs';
import { faxinaDaLixeira } from './lixeira.mjs';
import { chaveDoBackupValida, cifrarBackup, resumoDaChave } from './cifrar-backup.mjs';

export const FORMATO = 'imoveis-v1';
export const MAX_OPS = 2000;
export const MAX_REGISTRO = 1024 * 1024; // um registro (a logo tem ~270 KB)
export const MAX_FAIXA = 20000; // uma importação grande pede a faixa do tamanho dela antes de gravar (nuvem.js reservarFaixas)
export const MAX_TABELAS_FAIXA = 200; // tabelas num pedido só de faixas (garantirFaixas em nuvem.js; hoje são ~60)
export const DIAS_LOG = 60; // aparelho parado há mais tempo baixa tudo de novo
export const MANTER_BACKUPS = 30;
export const DIAS_EXCLUIDOS = 180; // cópia de registro apagado (para conflito "excluído") guardada por até 180 dias
export const DIAS_CONFLITOS_RESOLVIDOS = 90;
export const MANTER_SUBSTITUICOES = 5; // cópias "antes-da-substituicao" guardadas
const INTERVALO_FAXINA_MS = 3600000; // sem alarme (testes, nuvem local): a faxina roda no máximo 1× por hora, dentro de um POST
/** Campos da raiz que só o servidor controla (o aparelho não manda; mudam a cada gravação e dariam conflito à toa). */
export const RAIZ_DO_SERVIDOR = ['formato', 'revisao', 'atualizado_em', 'atualizado_por', 'seq', 'revisao_so_sessao', 'historico', '_nuvem'];
/**
 * Contadores que só andam com internet (número da NF): o lote só muda se o valor que o aparelho viu ainda for o atual;
 * senão o lote inteiro volta (409, `contador: true`) e o aparelho refaz com o número novo. Ou pelo `contador()`.
 */
export const CONTADORES = ['proxima_fatura'];
/** Segredos que nunca ficam nos dados (regra 8 do CLAUDE.md; normalizar também apaga). */
const SEGREDOS = ['senha_ponte', 'ponte_url'];
/** Campos da senha (os de camposDeSenha em docs/js/auth.js): qualquer papel troca a própria senha. */
const CAMPOS_SENHA = ['senha_sal', 'senha_hash', 'senha_iteracoes'];
/** O que o operador pode mudar no próprio usuário (trocar a senha); o resto de "usuarios" é do administrador. */
const USUARIO_PROPRIO = [...CAMPOS_SENHA, 'sessoes', 'pendente'];
/** Sessões lembradas por usuário (igual a MAX_SESSOES de docs/js/nuvem.js; tests/sincronia.test.mjs confere). */
export const MAX_SESSOES = 10;
const NIVEL = { consulta: 1, operador: 2, admin: 3 };
/**
 * O que só o administrador muda (a tela já esconde, com podeUsuario('admin'); aqui a nuvem garante, seja qual for o aparelho).
 * `raiz`: campos da raiz; `excluir`: tabelas cujos registros só ele apaga; `tabela`: tabelas que só ele mexe (além de `usuarios`, acima).
 */
export const SO_ADMIN = {
  raiz: ['config_banco', 'logo', 'ordem_caixas', 'ressarcimento_abate_nf', 'estilos_alertas'],
  excluir: ['imoveis', 'contratos', 'encerramentos', 'vistorias', 'modelos_contrato', 'faturas'],
  tabela: ['emitentes', 'config_regras', 'versoes_regras'],
};
/**
 * Ações "só do administrador" que ficam dentro de tabelas que o operador também muda (item 13 da lista de segurança): o cofre
 * confere o registro antes e depois da mudança e recusa o lote inteiro se quem não é administrador fez uma delas. Cada regra
 * devolve true quando a mudança é do administrador. `antes` é null num registro novo.
 * - contratos: confirmar a perda de um documento de entrada (o operador registra a perda, que fica "aguardando o administrador")
 *   e aceitar o documento com assinatura faltante (campos <doc>_perdido_em/_perdido_pendente e <doc>_parcial de regras.js);
 * - aditivos: confirmar a perda do termo aditivo (perdido_em sem perdido_pendente);
 * - pagamentos_banco: aprovar o pagamento (aprovado_por/aprovado_em, sair de "rascunho" para a fila do banco);
 * - cobrancas: agendar ou cancelar a negativação do pagador (banco.negativacao.agendada_em/cancelada_em).
 */
const valorDe = (r, k) => (r && r[k] !== undefined ? r[k] : null);
const vazioDe = (v) => v === null || v === undefined || v === '';
const DOC_PERDIDO = /^(doc_[a-z]+)_perdido_em$/; // DOCUMENTOS_ENTRADA de regras.js: doc_contrato_em → doc_contrato_perdido_em
export const REGRAS_DO_ADMIN = [
  { tabela: 'contratos', nome: 'confirmar a perda de um documento', viola: (antes, depois) => Object.keys(depois || {}).some((k) => {
    const m = DOC_PERDIDO.exec(k); if (!m || vazioDe(depois[k])) return false;
    const pend = `${m[1]}_perdido_pendente`;
    // perda que passa a valer sem ficar aguardando o administrador
    return vazioDe(depois[pend]) && (vazioDe(valorDe(antes, k)) || !vazioDe(valorDe(antes, pend)));
  }) },
  { tabela: 'contratos', nome: 'aceitar um documento sem todas as assinaturas', viola: (antes, depois) => Object.keys(depois || {}).some((k) => {
    if (!/^doc_[a-z]+_parcial$/.test(k)) return false;
    const p = depois[k]; const a = valorDe(antes, k);
    return !!p && typeof p === 'object' && !p.pendente && !(a && typeof a === 'object' && !a.pendente);
  }) },
  { tabela: 'aditivos', nome: 'confirmar a perda do termo aditivo', viola: (antes, depois) => !vazioDe(valorDe(depois, 'perdido_em')) && vazioDe(valorDe(depois, 'perdido_pendente'))
    && (vazioDe(valorDe(antes, 'perdido_em')) || !vazioDe(valorDe(antes, 'perdido_pendente'))) },
  { tabela: 'pagamentos_banco', nome: 'aprovar pagamentos', viola: (antes, depois) => ['aprovado_por', 'aprovado_em'].some((k) => !igual(valorDe(antes, k), valorDe(depois, k)) && !vazioDe(valorDe(depois, k)))
    || (valorDe(antes, 'situacao') !== 'aguardando_aprovacao' && valorDe(depois, 'situacao') === 'aguardando_aprovacao') },
  { tabela: 'cobrancas', nome: 'negativar ou cancelar a negativação', viola: (antes, depois) => ['agendada_em', 'cancelada_em'].some((k) => {
    const n = (r) => (r && r.banco && typeof r.banco === 'object' && r.banco.negativacao && typeof r.banco.negativacao === 'object' ? r.banco.negativacao[k] ?? null : null);
    return !igual(n(antes), n(depois)) && !vazioDe(n(depois));
  }) },
];
/** Lança 403 se a mudança (registro antes → depois) é uma das ações só do administrador. */
export function conferirRegrasDoAdmin(tabela, antes, depois) {
  const r = REGRAS_DO_ADMIN.find((x) => x.tabela === tabela && x.viola(antes, depois));
  if (r) throw new ErroCofre(403, `Só o administrador pode ${r.nome}. Peça a ele (nada desta gravação entrou).`);
}
const NOMES_PROIBIDOS = ['__proto__', 'constructor', 'prototype'];
/**
 * As tabelas do sistema (as de TABELAS em docs/js/regras.js; tests/seguranca-nuvem.test.mjs confere): mudança numa tabela que
 * não está aqui nem já existe no cofre é recusada (senão qualquer operador criaria tabelas com qualquer nome em todos os aparelhos).
 * Tabela nova no sistema = entrar aqui também.
 */
export const TABELAS_CONHECIDAS = ['imoveis', 'contratos', 'correcoes', 'seguros', 'iptus', 'titularidades', 'cobrancas', 'recebimentos', 'faturas', 'emitentes',
  'participacoes', 'usuarios', 'fiadores', 'aplicacoes', 'correcoes_garantia', 'depositos_garantia', 'devolucoes_garantia', 'renovacoes', 'trocas_garantia',
  'leituras', 'encerramentos', 'avulsas', 'reformas', 'solicitacoes', 'notificacoes', 'fichas', 'indices_acumulados', 'cartas_reajuste', 'modelos_contrato', 'vistorias',
  'aditivos', 'despesas', 'ganhos_airbnb', 'ressarcimentos', 'fechamentos', 'guias_impostos', 'modelos_email', 'envios_email', 'movimentacoes_banco',
  'regua_emails',
  'pagamentos_banco', 'adiamentos_alerta', 'alertas_desligados', 'acordos', 'pastas_fisicas', 'config_regras', 'versoes_regras', 'taxas_poupanca'];
/** Fora do administrador, o número da próxima NF só anda para a frente, e no máximo isto de uma vez (numerar um lote grande). */
export const MAX_SALTO_NF = 300;
/** Gravação por usuário num dia (Brasília): mudanças e bytes. Passou, as próximas esperam o dia seguinte (contra encher o cofre). */
export const COTA_DIA = { ops: 100000, bytes: 80 * 1024 * 1024 };
/** E-mails pela conta da empresa por usuário num dia. */
export const MAX_EMAILS_DIA = 150;
/**
 * Registro de acessos (quem baixou o banco inteiro, abriu ou mexeu em arquivos, baixou backups, mandou e-mail, usou a ficha
 * pela internet, ligou o programa do PC): guardado pelos dias da regra `dias_registro_acessos` (config-regras.js; padrão e
 * limites iguais aos de lá, tests/lgpd-acessos.test.mjs confere) e mostrado ao administrador na tela Acessos.
 */
export const DIAS_ACESSOS = { padrao: 180, min: 30, max: 730 };
export const MAX_ACESSOS_POR_ENVIO = 200;
/**
 * Linha do histórico de "Apagar tudo desta pessoa" (10 anos depois do fim do último contrato; docs/js/pessoa.js, ACAO_APAGAR):
 * vinda do administrador, o cofre apaga também o que guarda desses registros (esquecerApagados) e manda os aparelhos baixarem
 * tudo de novo (log 'refazer'), para a cópia deles também sair.
 */
export const ACAO_APAGAR_PESSOA = 'Apagar pessoa (LGPD)';
/**
 * Chaves de negócio que não repetem (dois aparelhos fazendo a mesma coisa antes de um ver o do outro, ou um deles sem internet):
 * registro novo com a mesma chave de um que já está na nuvem é recusado, e o lote inteiro volta (como código repetido; a tela
 * mostra em Conflitos). `so`: só os registros que contam (o boleto do complemento da caução e as parcelas de acordo não são o
 * aluguel do mês: boletoDoMes/ehBoletoAvulso de regras.js); `usa`: campos que `so` lê. Chave com campo vazio não conta.
 */
export const CHAVES_UNICAS = {
  cobrancas: { campos: ['contrato_id', 'competencia'], usa: ['caucao_complemento', 'acordo_parcela_de'], so: (r) => !(Number(r.caucao_complemento) > 0) && !r.acordo_parcela_de, nome: 'O boleto do aluguel deste contrato neste mês' },
  movimentacoes_banco: { campos: ['conta_id', 'id_externo'], nome: 'Este lançamento do extrato' },
  correcoes: { campos: ['contrato_id', 'data_vigencia'], nome: 'A correção do aluguel deste contrato nesta data' },
  encerramentos: { campos: ['contrato_id'], nome: 'O cálculo final da saída deste contrato' },
  leituras: { campos: ['contrato_id', 'momento'], so: (r) => ['Entrada do inquilino', 'Saída do inquilino'].includes(r.momento), nome: 'A leitura dos relógios deste momento do contrato' },
  guias_impostos: { campos: ['emitente_id', 'imposto', 'periodo'], nome: 'A guia deste imposto, empresa e período' },
};
/** Chave de negócio de um registro (texto) ou null (tabela sem chave, registro que não conta ou campo vazio). */
export function chaveUnica(tabela, r) {
  const def = Object.hasOwn(CHAVES_UNICAS, tabela) ? CHAVES_UNICAS[tabela] : null;
  if (!def || !r || (def.so && !def.so(r))) return null;
  const v = def.campos.map((c) => r[c]);
  return v.some((x) => x === null || x === undefined || x === '') ? null : JSON.stringify(v);
}
/** Tabelas que existem sempre (mesmo antes do primeiro registro): uma mudança "raiz" com esse nome trocaria a tabela inteira. */
const TABELAS_SEMPRE = ['usuarios', ...SO_ADMIN.tabela];

export class ErroCofre extends Error {
  constructor(status, mensagem, extra = {}) { super(mensagem); this.status = status; this.extra = extra; }
}
/** Lote que exclui vários registros juntos (ex.: o contrato e os boletos dele) e esbarrou num registro mudado em outro aparelho. */
class ExclusaoEmGrupo extends Error {
  constructor(disputados) { super('exclusão em grupo disputada'); this.disputados = disputados; }
}

/** JSON com as chaves em ordem: dois valores iguais dão o mesmo texto. */
export function canon(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
}
const igual = (a, b) => canon(a) === canon(b);
/** Registro igual a não ser por campos nulos que um tem e o outro nem tem (normalizar completa `banco: null` só na tela): item 43. */
const semNulos = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) : o);
const igualSemNulos = (a, b) => igual(semNulos(a), semNulos(b));
const objetoSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/**
 * Campo que é objeto (parcelas pagas do IPTU, "extrato importado até" de cada conta…) mudado em dois aparelhos em subchaves
 * diferentes: junta as duas mudanças em vez de abrir conflito (itens 12 e 13). Mesma subchave com valores diferentes: undefined
 * (aí é conflito de verdade).
 */
export function juntarSubchaves(antes, depois, atual) {
  const a = antes === undefined || antes === null ? {} : antes;
  if (![a, depois, atual].every(objetoSimples)) return undefined;
  const r = { ...atual };
  for (const k of new Set([...Object.keys(a), ...Object.keys(depois)])) {
    if (igual(a[k], depois[k])) continue; // este aparelho não mexeu nesta subchave
    if (!igual(a[k], atual[k]) && !igual(atual[k], depois[k])) return undefined; // os dois mexeram nela
    if (depois[k] === undefined) delete r[k]; else r[k] = depois[k];
  }
  return r;
}

function semSegredos(v) {
  if (!v || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(semSegredos);
  const r = {};
  for (const [k, x] of Object.entries(v)) if (!SEGREDOS.includes(k) && !NOMES_PROIBIDOS.includes(k)) r[k] = semSegredos(x);
  return r;
}

const nomeTabela = (t) => {
  if (typeof t !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(t) || t === 'historico' || RAIZ_DO_SERVIDOR.includes(t)) throw new ErroCofre(400, `Tabela inválida: ${String(t).slice(0, 40)}`);
  return t;
};
const nomeCampo = (c) => {
  if (typeof c !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,59}$/.test(c) || NOMES_PROIBIDOS.includes(c)) throw new ErroCofre(400, `Campo inválido: ${String(c).slice(0, 60)}`);
  return c;
};
const codigo = (id) => {
  if (!Number.isSafeInteger(id) || id < 1) throw new ErroCofre(400, 'Código do registro inválido.');
  return id;
};
/** Tabelas cuja alteração vai inteira na fila (as outras vão só com os campos que mudaram, item 33). */
const LOG_INTEIRO = new Set(['usuarios', 'fichas', 'envios_email']);
/** Só o que mudou de um registro: { campos: { nome: valor novo }, apagados: [nome] } (linha "campos" da fila, item 33). */
export function camposMudados(antes, depois) {
  const campos = {}; const apagados = [];
  for (const [k, v] of Object.entries(depois)) if (JSON.stringify(v) !== JSON.stringify(antes[k])) campos[k] = v;
  for (const k of Object.keys(antes)) if (!(k in depois)) apagados.push(k);
  return apagados.length ? { campos, apagados } : { campos };
}
const texto = (v) => {
  const t = JSON.stringify(v ?? null);
  if (t.length > MAX_REGISTRO) throw new ErroCofre(413, 'Registro grande demais.');
  return t;
};

export class Cofre {
  /**
   * @param {{exec: (q: string, ...p: any[]) => {toArray: () => any[]}}} sql  ctx.storage.sql no Cloudflare
   * @param {(fn: () => any) => any} transacao  ctx.storage.transactionSync no Cloudflare
   * @param {() => Date} relogio
   */
  constructor(sql, transacao, relogio = () => new Date()) {
    this.sql = sql; this.transacao = transacao; this.relogio = relogio;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS registros (tabela TEXT NOT NULL, id INTEGER NOT NULL, dados TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}', ordem INTEGER NOT NULL, PRIMARY KEY (tabela, id));
      CREATE TABLE IF NOT EXISTS tabelas (nome TEXT PRIMARY KEY, proximo INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS raiz (campo TEXT PRIMARY KEY, valor TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}');
      CREATE TABLE IF NOT EXISTS historico (n INTEGER PRIMARY KEY AUTOINCREMENT, dados TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, tabela TEXT, id INTEGER, dados TEXT, por TEXT, em TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lotes (lote TEXT PRIMARY KEY, resposta TEXT NOT NULL, em TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conflitos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, tabela TEXT NOT NULL, reg_id TEXT NOT NULL, campo TEXT NOT NULL,
        atual TEXT, por_atual TEXT, proposto TEXT, por_proposto TEXT, em TEXT NOT NULL, resolvido_em TEXT, escolha TEXT, resolvido_por TEXT);
      CREATE TABLE IF NOT EXISTS excluidos (tabela TEXT NOT NULL, id INTEGER NOT NULL, dados TEXT NOT NULL, por TEXT, em TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS controle (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS emails_enviados (n INTEGER PRIMARY KEY AUTOINCREMENT, por TEXT NOT NULL, em TEXT NOT NULL, para TEXT NOT NULL, assunto TEXT, anexos TEXT);
      CREATE TABLE IF NOT EXISTS cotas (chave TEXT PRIMARY KEY, ops INTEGER NOT NULL, bytes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS acessos (n INTEGER PRIMARY KEY AUTOINCREMENT, em TEXT NOT NULL, email TEXT NOT NULL, rota TEXT NOT NULL, bytes INTEGER, ip TEXT, origem TEXT, resultado INTEGER);
      CREATE INDEX IF NOT EXISTS acessos_em ON acessos (em);
      CREATE INDEX IF NOT EXISTS log_em ON log (em);
      CREATE INDEX IF NOT EXISTS lotes_em ON lotes (em);
      CREATE INDEX IF NOT EXISTS registros_ordem ON registros (ordem);
      CREATE INDEX IF NOT EXISTS conflitos_abertos ON conflitos (tabela, reg_id, campo) WHERE resolvido_em IS NULL;`);
    // os dois últimos índices entram também em cofre que já existia (IF NOT EXISTS: roda a cada abertura sem repetir)
    this.maiorOrdem = null; // maior `ordem` de registros, guardada durante um lote (proximaOrdem)
    this.chaves = new Map(); // chaves únicas já lidas no lote: tabela → { porChave, porId }
    this.dono = ''; // e-mail do dono (DONO_EMAIL do Worker): com o cofre vazio, só ele faz a primeira carga
  }

  /** Chaves únicas (CHAVES_UNICAS) dos registros de uma tabela, lidas uma vez por lote (json_extract: sem abrir o registro inteiro). */
  chavesDe(tabela) {
    if (!Object.hasOwn(CHAVES_UNICAS, tabela)) return null;
    let m = this.chaves.get(tabela);
    if (!m) {
      const def = CHAVES_UNICAS[tabela];
      const campos = [...new Set([...def.campos, ...(def.usa || [])])];
      m = { porChave: new Map(), porId: new Map() };
      for (const l of this.q(`SELECT id, ${campos.map((c) => `json_extract(dados, '$.${c}') AS ${c}`).join(', ')} FROM registros WHERE tabela = ?`, tabela)) this.anotarChave(m, tabela, l.id, l);
      this.chaves.set(tabela, m);
    }
    return m;
  }

  anotarChave(m, tabela, id, r) {
    const velha = m.porId.get(id);
    if (velha !== undefined && m.porChave.get(velha) === id) m.porChave.delete(velha);
    m.porId.delete(id);
    const k = r ? chaveUnica(tabela, r) : null;
    if (k === null) return;
    m.porId.set(id, k);
    if (!m.porChave.has(k)) m.porChave.set(k, id);
  }

  /** Ordem do próximo registro novo: lê a maior uma vez por lote (não a cada registro) e segue contando na memória. */
  proximaOrdem() {
    if (this.maiorOrdem === null) this.maiorOrdem = Number(this.q('SELECT MAX(ordem) AS m FROM registros')[0]?.m || 0);
    this.maiorOrdem += 1;
    return this.maiorOrdem;
  }

  q(consulta, ...p) { return this.sql.exec(consulta, ...p).toArray(); }
  agora() { return this.relogio().toISOString(); }
  vazio() { return !this.q('SELECT 1 AS x FROM registros LIMIT 1').length && !this.q('SELECT 1 AS x FROM raiz LIMIT 1').length; }
  ultimoSeq() { return Number(this.q('SELECT MAX(seq) AS m FROM log')[0]?.m || 0); } // limpar() nunca apaga a última linha
  controle(chave, valor) {
    if (valor === undefined) return this.q('SELECT valor FROM controle WHERE chave = ?', chave)[0]?.valor ?? null;
    this.sql.exec('INSERT INTO controle (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', chave, String(valor));
    return valor;
  }
  /**
   * Tabela e campo da raiz não se misturam: "raiz" com nome de tabela trocaria a tabela inteira nos outros aparelhos (passando
   * por cima das regras de usuários e de SO_ADMIN), e tabela com nome de campo da raiz (config_banco, logo…) o apagaria no `tudo()`.
   */
  ehTabela(nome) {
    return TABELAS_SEMPRE.includes(nome) || this.q('SELECT 1 AS x FROM tabelas WHERE nome = ?', nome).length > 0
      || this.q('SELECT 1 AS x FROM registros WHERE tabela = ? LIMIT 1', nome).length > 0;
  }
  tabelaDeRegistros(t) {
    const nome = nomeTabela(t);
    if (CONTADORES.includes(nome) || SO_ADMIN.raiz.includes(nome) || this.q('SELECT 1 AS x FROM raiz WHERE campo = ?', nome).length) {
      throw new ErroCofre(400, `"${nome}" é um campo da configuração geral, não uma tabela.`);
    }
    if (!TABELAS_CONHECIDAS.includes(nome) && !this.q('SELECT 1 AS x FROM tabelas WHERE nome = ?', nome).length) {
      throw new ErroCofre(400, `Tabela desconhecida: ${nome}. Atualize o sistema (recarregue a página) e tente de novo.`);
    }
    return nome;
  }
  registrarLog(tipo, tabela, id, dados, por) {
    this.sql.exec('INSERT INTO log (tipo, tabela, id, dados, por, em) VALUES (?, ?, ?, ?, ?, ?)', tipo, tabela, id, dados === undefined ? null : texto(dados), por, this.agora());
  }

  // -------------------------------------------------------------------------
  // Quem é e o que pode (papel do usuário do sistema ligado ao e-mail do Access)
  // -------------------------------------------------------------------------
  papelDe(email) {
    const e = String(email || '').toLowerCase();
    const usuarios = this.q("SELECT dados FROM registros WHERE tabela = 'usuarios'").map((r) => JSON.parse(r.dados));
    // cofre vazio: quem passou pelo Access faz a primeira carga (com DONO_EMAIL no Worker, só o dono)
    if (!usuarios.length) return !this.dono || this.dono === e ? 'admin' : null;
    const u = usuarios.find((x) => x.ativo !== false && [x.login, x.email].some((v) => String(v || '').toLowerCase() === e));
    return u ? { papel: u.papel, id: u.id } : null;
  }
  exigir(email, nivel) {
    const p = this.papelDe(email);
    const papel = typeof p === 'string' ? p : p?.papel;
    if (!papel) throw new ErroCofre(403, 'Este e-mail não está ligado a nenhum usuário ativo do sistema (cadastre o e-mail em Usuários).');
    if ((NIVEL[papel] || 0) < NIVEL[nivel]) throw new ErroCofre(403, 'Seu usuário não pode fazer isso.');
    return { papel, id: typeof p === 'string' ? null : p.id };
  }

  // -------------------------------------------------------------------------
  // Carga inicial e cópia completa
  // -------------------------------------------------------------------------
  importar(d, email, { substituir = false, manterUsuarios = false } = {}) {
    if (!d || typeof d !== 'object' || d.formato !== FORMATO) throw new ErroCofre(400, 'Não é um banco deste sistema.');
    // sem um administrador ativo, o cofre ficaria "vazio de usuários" e qualquer e-mail do Access viraria administrador
    if (!(Array.isArray(d.usuarios) ? d.usuarios : []).some((u) => u && u.ativo !== false && !u.pendente && u.papel === 'admin')) {
      throw new ErroCofre(400, 'Este banco não tem nenhum administrador ativo: não pode entrar na nuvem.');
    }
    if (this.vazio()) this.exigir(email, 'admin');
    if (!this.vazio()) {
      if (!substituir) throw new ErroCofre(409, 'A nuvem já tem dados. Para trocar tudo, confirme a substituição.');
      this.exigir(email, 'admin');
    }
    this.conferirRepetidos(d);
    return this.transacao(() => {
      // "Voltar para este dia": os usuários ficam como estão hoje (desativado não volta ativo, senha trocada não volta)
      const usuariosDeHoje = manterUsuarios && !this.vazio() ? this.q("SELECT id, dados FROM registros WHERE tabela = 'usuarios' ORDER BY ordem") : null;
      // `tabelas` (o próximo código de cada uma) fica: as faixas já entregues aos aparelhos continuam valendo depois de
      // "Voltar para este dia" ou "Substituir…", senão dois aparelhos ganhariam os mesmos códigos (o próximo nunca volta)
      if (!this.vazio()) {
        for (const t of ['registros', 'raiz', 'historico', 'conflitos', 'excluidos']) this.sql.exec(`DELETE FROM ${t}`);
      }
      let n = 0;
      if (usuariosDeHoje) {
        for (const u of usuariosDeHoje) this.sql.exec('INSERT INTO registros (tabela, id, dados, ordem) VALUES (?, ?, ?, ?)', 'usuarios', u.id, u.dados, n += 1);
      }
      for (const [chave, valor] of Object.entries(d)) {
        if (usuariosDeHoje && chave === 'usuarios') continue;
        if (chave === 'historico') {
          for (const h of Array.isArray(valor) ? valor : []) this.sql.exec('INSERT INTO historico (dados) VALUES (?)', texto(semSegredos(h)));
        } else if (Array.isArray(valor) && valor.every((r) => r && typeof r === 'object' && Number.isSafeInteger(r.id))) {
          const t = nomeTabela(chave);
          let maior = Number(d.seq?.[t] || 0);
          for (const r of valor) {
            this.sql.exec('INSERT INTO registros (tabela, id, dados, ordem) VALUES (?, ?, ?, ?)', t, codigo(r.id), texto(semSegredos(r)), n += 1);
            maior = Math.max(maior, r.id);
          }
          this.sql.exec('INSERT INTO tabelas (nome, proximo) VALUES (?, ?) ON CONFLICT(nome) DO UPDATE SET proximo = MAX(proximo, excluded.proximo)', t, maior + 1);
        } else if (!RAIZ_DO_SERVIDOR.includes(chave)) {
          this.sql.exec('INSERT INTO raiz (campo, valor) VALUES (?, ?)', nomeCampo(chave), texto(semSegredos(valor)));
        }
      }
      this.controle('revisao', Number(d.revisao || 0));
      for (const k of ['atualizado_em', 'atualizado_por']) if (typeof d[k] === 'string') this.controle(k, d[k]);
      this.registrarLog('importacao', null, null, undefined, email);
      // lote feito por quem ainda não tinha visto esta carga (celular sem internet) é recusado: entraria por cima do backup
      this.controle('epoca', this.ultimoSeq());
      return { ok: true, seq: this.ultimoSeq() };
    });
  }

  /** Código repetido numa tabela do banco a importar: recusa antes de mexer em qualquer coisa, dizendo onde (item 34). */
  conferirRepetidos(d) {
    if (!d || typeof d !== 'object') return;
    for (const [chave, valor] of Object.entries(d)) {
      if (chave === 'historico' || !Array.isArray(valor) || !valor.every((r) => r && typeof r === 'object' && Number.isSafeInteger(r.id))) continue;
      const vistos = new Set();
      for (const r of valor) {
        if (vistos.has(r.id)) throw new ErroCofre(400, `O banco tem dois registros com o código ${r.id} em ${String(chave).slice(0, 40)}: nada foi trocado. Corrija o arquivo (ou peça ajuda) antes de importar.`);
        vistos.add(r.id);
      }
    }
  }

  /**
   * Usuário como vai para um aparelho que não é de administrador: os outros usuários sem senha (resumo) nem tokens de sessão;
   * só o próprio usuário vai inteiro (o login é conferido no aparelho). `quem` = { papel, id } de exigir(); sem quem, vai tudo (backup).
   */
  usuarioParaAparelho(u, quem) {
    if (!quem || quem.papel === 'admin' || !u || u.id === quem.id) return u;
    const { id, login, nome, email, papel, ativo, pendente } = u;
    return { id, login, nome, email, papel, ativo, pendente };
  }

  /** O banco inteiro no formato do arquivo de hoje (o sistema abre igual), com o ponto da fila em `_nuvem.seq`. */
  tudo(quem = null) {
    if (this.vazio()) throw new ErroCofre(404, 'Ainda não há dados na nuvem.');
    const d = { formato: FORMATO, revisao: Number(this.controle('revisao') || 0), atualizado_em: this.controle('atualizado_em'), atualizado_por: this.controle('atualizado_por') };
    for (const r of this.q('SELECT campo, valor FROM raiz')) d[r.campo] = JSON.parse(r.valor);
    d.seq = {}; // o maior código já usado ou reservado em faixa: quem ainda não usa faixa não repete código
    for (const t of this.q('SELECT nome, proximo FROM tabelas ORDER BY nome')) { d[t.nome] = []; d.seq[t.nome] = Number(t.proximo) - 1; }
    for (const r of this.q('SELECT tabela, id, dados FROM registros ORDER BY ordem')) {
      (d[r.tabela] ||= []).push(r.tabela === 'usuarios' ? this.usuarioParaAparelho(JSON.parse(r.dados), quem) : JSON.parse(r.dados));
      d.seq[r.tabela] = Math.max(d.seq[r.tabela] || 0, r.id);
    }
    d.historico = this.q('SELECT dados FROM historico ORDER BY n').map((r) => JSON.parse(r.dados));
    d._nuvem = { seq: this.ultimoSeq(), conflitos: this.conflitosAbertos(quem) };
    return d;
  }

  /** O que mudou desde `desde` (para o aparelho se atualizar). Parado demais: { refazer: true } e ele baixa tudo. */
  mudancas(desde, quem = null, limite = 2000, formato = 1) {
    const d = Number(desde);
    if (!Number.isSafeInteger(d) || d < 0) throw new ErroCofre(400, 'Parâmetro "desde" inválido.');
    const menor = Number(this.q('SELECT MIN(seq) AS m FROM log')[0]?.m || 0);
    const ultimo = this.ultimoSeq();
    // carga, substituição ou limpeza do histórico (LGPD: 'refazer'): o aparelho baixa tudo de novo e a cópia velha dele sai
    if (d > ultimo || (menor && d < menor - 1) || this.q("SELECT 1 AS x FROM log WHERE seq > ? AND tipo IN ('importacao', 'refazer') LIMIT 1", d).length) return { refazer: true, seq: ultimo };
    const linhas = this.q('SELECT seq, tipo, tabela, id, dados, por, em FROM log WHERE seq > ? ORDER BY seq LIMIT ?', d, limite);
    // aparelho na versão de antes (sem `formato=2`) não conhece "campos": recebe o registro como está agora (ou nada, se ele
    // foi apagado depois: a exclusão vem mais adiante na fila)
    const atuais = new Map();
    const registroAgora = (tabela, id) => {
      const k = `${tabela}:${id}`;
      if (!atuais.has(k)) { const r = this.q('SELECT dados FROM registros WHERE tabela = ? AND id = ?', tabela, id)[0]; atuais.set(k, r ? JSON.parse(r.dados) : null); }
      return atuais.get(k);
    };
    return {
      seq: linhas.length ? linhas[linhas.length - 1].seq : d,
      mais: linhas.length === limite,
      mudancas: linhas.map((l) => {
        let dados = l.dados === null ? null : JSON.parse(l.dados);
        let { tipo } = l;
        if (tipo === 'campos' && Number(formato) < 2) {
          dados = registroAgora(l.tabela, l.id);
          if (!dados) return null;
          tipo = 'registro';
        }
        if (tipo === 'registro' && l.tabela === 'usuarios') dados = this.usuarioParaAparelho(dados, quem);
        return { seq: l.seq, tipo, tabela: l.tabela, id: l.id, dados, por: l.por, em: l.em };
      }).filter(Boolean),
      conflitos: this.conflitosAbertos(quem),
      revisao: Number(this.controle('revisao') || 0), atualizado_em: this.controle('atualizado_em'), atualizado_por: this.controle('atualizado_por'),
    };
  }

  /** Conflitos em aberto; os de usuários (com dados de acesso) só vão para o administrador. `quem` = { papel } de exigir(). */
  conflitosAbertos(quem = null) {
    return this.q('SELECT id, tipo, tabela, reg_id, campo, atual, por_atual, proposto, por_proposto, em FROM conflitos WHERE resolvido_em IS NULL ORDER BY id')
      .filter((c) => !quem || quem.papel === 'admin' || c.tabela !== 'usuarios')
      .map((c) => {
        let proposto = c.proposto === null ? null : JSON.parse(c.proposto);
        // lote em disputa: aos aparelhos vai só o resumo (a gravação inteira fica no cofre para a escolha)
        if (c.tipo === 'lote' && proposto) proposto = { lote: proposto.lote, mudancas: (proposto.ops || []).filter((o) => o.op !== 'historico').length, excluidos: (proposto.ops || []).filter((o) => o.op === 'excluir').length };
        return { ...c, atual: c.atual === null ? null : JSON.parse(c.atual), proposto };
      });
  }

  // -------------------------------------------------------------------------
  // Fila de mudanças de um aparelho
  // -------------------------------------------------------------------------
  /**
   * lote = { id: 'aparelho-n', ops: [ {op:'inserir', tabela, id, dados} | {op:'alterar', tabela, id, campos:{c:{antes, depois}}}
   *   | {op:'excluir', tabela, id, base} | {op:'raiz', campo, antes, depois} | {op:'historico', entrada} ] }
   * Repetir o mesmo lote (internet caiu antes da resposta) devolve a mesma resposta, sem aplicar de novo.
   */
  aplicar(lote, email) {
    if (!lote || typeof lote.id !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(lote.id)) throw new ErroCofre(400, 'Lote sem identificação.');
    const ja = this.q('SELECT resposta FROM lotes WHERE lote = ?', lote.id)[0];
    if (ja) return { ...JSON.parse(ja.resposta), repetido: true };
    if (!Array.isArray(lote.ops) || lote.ops.length > MAX_OPS) throw new ErroCofre(400, `Lote inválido (até ${MAX_OPS} mudanças).`);
    if (this.vazio()) throw new ErroCofre(409, 'A nuvem ainda não tem dados: faça a carga inicial.');
    const quem = this.exigir(email, 'consulta');
    const epoca = Number(this.controle('epoca') || 0);
    if (Number.isSafeInteger(lote.base) && lote.base < epoca) {
      throw new ErroCofre(409, 'Os dados da nuvem foram trocados (volta a um backup ou substituição) depois que esta mudança foi feita neste aparelho: ela não entrou. Confira e faça de novo o que ainda precisar.');
    }
    if (typeof lote.em === 'string' && Date.parse(lote.em) < this.relogio().getTime() - DIAS_LOG * 86400000) {
      // a nuvem só se lembra dos lotes recebidos nos últimos DIAS_LOG dias: um lote mais velho poderia entrar de novo (item 49)
      throw new ErroCofre(409, `Esta mudança ficou mais de ${DIAS_LOG} dias esperando neste aparelho: ela não entrou. Confira e faça de novo o que ainda precisar.`);
    }
    if (quem.papel === 'consulta' && !this.soProprioAcesso(lote.ops, quem)) throw new ErroCofre(403, 'Seu usuário não pode fazer isso.');
    const contarCota = this.conferirCota(email, lote.ops);
    const emGrupo = lote.ops.filter((o) => o?.op !== 'historico').length > 1 && lote.ops.some((o) => o?.op === 'excluir');
    try {
      return this.transacao(() => {
        this.maiorOrdem = null; // cada lote lê a maior ordem de novo (lote desfeito por erro não deixa número velho)
        this.chaves = new Map(); // chaves únicas (CHAVES_UNICAS) conferidas neste lote
        contarCota();
        const resultados = []; const novosConflitos = [];
        for (const op of lote.ops) resultados.push(this.aplicarOp(op, email, quem, novosConflitos));
        // "Apagar tudo desta pessoa" do administrador: depois das exclusões do lote, sai também o que o cofre guarda delas
        if (quem.papel === 'admin') for (const op of lote.ops) if (op?.op === 'historico' && op.entrada?.acao === ACAO_APAGAR_PESSOA) this.esquecerApagados(op.entrada.detalhes, email);
        // exclusão em grupo (contrato e boletos, imóvel e despesas…) é tudo ou nada: um registro disputado segura o lote inteiro,
        // senão a nuvem apagaria uma parte e deixaria, por exemplo, boleto sem contrato (mutirão 3000, item 2)
        const disputados = novosConflitos.filter((c) => c.tipo === 'exclusao');
        if (emGrupo && disputados.length) throw new ExclusaoEmGrupo(disputados.map((c) => ({ tabela: c.tabela, id: Number(c.reg_id) })));
        return this.fecharLote(lote, email, resultados, novosConflitos);
      });
    } catch (e) {
      if (!(e instanceof ExclusaoEmGrupo)) throw e;
      return this.transacao(() => this.loteEmDisputa(lote, email, e.disputados));
    }
  }

  fecharLote(lote, email, resultados, novosConflitos) {
    if (lote.ops.length) {
      this.controle('revisao', Number(this.controle('revisao') || 0) + 1);
      this.controle('atualizado_em', this.agora());
      this.controle('atualizado_por', email);
    }
    const resposta = { ok: true, seq: this.ultimoSeq(), resultados, conflitos: novosConflitos };
    this.sql.exec('INSERT INTO lotes (lote, resposta, em) VALUES (?, ?, ?)', lote.id, JSON.stringify(resposta), this.agora());
    return resposta;
  }

  /**
   * Nada do lote vale: vira um conflito só ("lote"), com a gravação inteira guardada. O administrador escolhe "excluir"
   * (aplica o lote todo, como se ninguém tivesse mudado nada) ou "manter" (descarta o lote todo).
   */
  loteEmDisputa(lote, email, disputados) {
    const principal = lote.ops.filter((o) => o?.op === 'excluir').at(-1); // excluirContrato apaga o contrato por último
    const atual = disputados.map(({ tabela, id }) => {
      const r = this.q('SELECT dados, meta FROM registros WHERE tabela = ? AND id = ?', tabela, id)[0];
      return { tabela, id, dados: r ? JSON.parse(r.dados) : null, por: r ? this.ultimoAutor(r.meta) : null };
    });
    let conflito;
    try {
      conflito = this.abrirConflito('lote', principal.tabela, principal.id, '*', atual, atual[0]?.por || null, { lote: lote.id, ops: lote.ops }, email);
    } catch (e) {
      if (e instanceof ErroCofre && e.status === 413) throw new ErroCofre(409, 'Esta exclusão mexe em registros que outro aparelho mudou: nada foi excluído. Atualize a página e exclua de novo.');
      throw e;
    }
    return this.fecharLote(lote, email, lote.ops.map(() => ({ ok: false, conflito: true })), [conflito]);
  }

  /** Cota do dia (COTA_DIA) do usuário: recusa (429) se este lote passaria dela; devolve a função que conta o lote (na transação). */
  conferirCota(email, ops) {
    const chave = `${hojeBrasilia(this.relogio())}|${String(email).toLowerCase()}`;
    const bytes = JSON.stringify(ops).length;
    const usado = this.q('SELECT ops, bytes FROM cotas WHERE chave = ?', chave)[0] || { ops: 0, bytes: 0 };
    if (Number(usado.ops) + ops.length > COTA_DIA.ops || Number(usado.bytes) + bytes > COTA_DIA.bytes) {
      throw new ErroCofre(429, 'Limite de gravação do dia atingido para este usuário: as mudanças ficam guardadas neste aparelho e sobem amanhã. Se for engano, fale com o administrador.');
    }
    return () => this.sql.exec('INSERT INTO cotas (chave, ops, bytes) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET ops = ops + excluded.ops, bytes = bytes + excluded.bytes', chave, ops.length, bytes);
  }

  /**
   * O que o usuário de consulta grava: a própria entrada e saída (sessões do login), a própria senha (trocar, ou o login regravar
   * a do padrão antigo) e a linha do histórico dessa troca. Qualquer outra mudança é recusada.
   */
  soProprioAcesso(ops, quem) {
    const alteracoes = ops.filter((o) => o?.op !== 'historico');
    const proprias = alteracoes.every((o) => o?.op === 'alterar' && o.tabela === 'usuarios' && o.id === quem.id && o.campos && typeof o.campos === 'object'
      && Object.keys(o.campos).every((c) => c === 'sessoes' || CAMPOS_SENHA.includes(c)));
    if (!proprias) return false;
    const trocouSenha = alteracoes.some((o) => Object.keys(o.campos).some((c) => CAMPOS_SENHA.includes(c)));
    return ops.filter((o) => o?.op === 'historico').every((o) => trocouSenha && o.entrada?.tabela === 'usuarios' && Number(o.entrada?.registro_id) === quem.id);
  }

  aplicarOp(op, email, quem, novosConflitos) {
    if (!op || typeof op !== 'object') throw new ErroCofre(400, 'Mudança inválida.');
    if (op.op === 'historico') {
      if (!op.entrada || typeof op.entrada !== 'object' || Array.isArray(op.entrada)) throw new ErroCofre(400, 'Histórico inválido.');
      // linha do histórico de algo que só o administrador muda (o "Desfazer" dele aplicaria o valor da linha): só dele
      const tabelaH = String(op.entrada.tabela || '');
      if (quem.papel !== 'admin' && (SO_ADMIN.tabela.includes(tabelaH) || SO_ADMIN.raiz.includes(tabelaH)
        || (tabelaH === 'usuarios' && Number(op.entrada.registro_id) !== quem.id))) throw new ErroCofre(403, `Só o administrador registra mudanças em ${tabelaH}.`);
      const entrada = { ...semSegredos(op.entrada), email_nuvem: email }; // quem gravou de verdade (o login do Access)
      this.sql.exec('INSERT INTO historico (dados) VALUES (?)', texto(entrada));
      this.registrarLog('historico', null, null, entrada, email);
      return { ok: true };
    }
    if (op.op === 'raiz') return this.mudarRaiz(op, email, quem, novosConflitos);
    const tabela = this.tabelaDeRegistros(op.tabela);
    const id = codigo(op.id);
    if (tabela === 'usuarios' && quem.papel !== 'admin') {
      const soSenha = op.op === 'alterar' && id === quem.id && Object.keys(op.campos || {}).every((c) => USUARIO_PROPRIO.includes(c));
      if (!soSenha) throw new ErroCofre(403, 'Só o administrador muda usuários (cada um pode trocar a própria senha).');
    }
    if (quem.papel !== 'admin') {
      if (SO_ADMIN.tabela.includes(tabela)) throw new ErroCofre(403, `Só o administrador altera ${tabela}.`);
      if (op.op === 'excluir' && SO_ADMIN.excluir.includes(tabela)) throw new ErroCofre(403, `Só o administrador exclui registros de ${tabela}.`);
    }
    const atual = this.q('SELECT dados, meta FROM registros WHERE tabela = ? AND id = ?', tabela, id)[0];
    if (op.op === 'inserir') {
      const dados = semSegredos(op.dados);
      if (!dados || typeof dados !== 'object' || Array.isArray(dados) || dados.id !== id) throw new ErroCofre(400, 'Registro novo inválido.');
      for (const c of Object.keys(dados)) nomeCampo(c);
      if (quem.papel !== 'admin') conferirRegrasDoAdmin(tabela, null, dados);
      if (atual) {
        if (igual(JSON.parse(atual.dados), dados)) return { ok: true, repetido: true };
        throw new ErroCofre(409, `Código ${id} já usado em ${tabela} (aparelho sem faixa de códigos?).`);
      }
      const chaves = this.chavesDe(tabela);
      if (chaves) {
        const k = chaveUnica(tabela, dados); const outro = k === null ? undefined : chaves.porChave.get(k);
        if (outro !== undefined && outro !== id) {
          throw new ErroCofre(409, `${CHAVES_UNICAS[tabela].nome} já existe na nuvem (código ${outro}), feito em outro aparelho. Nada desta gravação entrou: confira o que já está lá antes de fazer de novo.`, { repetido: { tabela, id: outro } });
        }
      }
      if (!this.q('SELECT 1 AS x FROM tabelas WHERE nome = ?', tabela).length) this.sql.exec('INSERT INTO tabelas (nome, proximo) VALUES (?, ?)', tabela, id + 1);
      const meta = Object.fromEntries(Object.keys(dados).map((c) => [c, { por: email, em: this.agora() }]));
      this.sql.exec('INSERT INTO registros (tabela, id, dados, meta, ordem) VALUES (?, ?, ?, ?, ?)', tabela, id, texto(dados), JSON.stringify(meta), this.proximaOrdem());
      this.sql.exec('UPDATE tabelas SET proximo = MAX(proximo, ?) WHERE nome = ?', id + 1, tabela);
      if (chaves) this.anotarChave(chaves, tabela, id, dados);
      this.registrarLog('registro', tabela, id, dados, email);
      return { ok: true };
    }
    if (op.op === 'excluir') {
      if (!atual) return { ok: true, ja_excluido: true };
      const dados = JSON.parse(atual.dados);
      if (op.base !== undefined && !igualSemNulos(dados, semSegredos(op.base))) {
        // outro aparelho mudou o registro depois que este o viu: não exclui até alguém escolher
        novosConflitos.push(this.abrirConflito('exclusao', tabela, id, '*', dados, this.ultimoAutor(atual.meta), null, email));
        return { ok: false, conflito: true };
      }
      this.excluirRegistro(tabela, id, dados, email);
      return { ok: true };
    }
    if (op.op === 'alterar') {
      const campos = op.campos && typeof op.campos === 'object' ? Object.entries(op.campos) : [];
      if (!campos.length) return { ok: true };
      if (campos.some(([c]) => c === 'id')) throw new ErroCofre(400, 'O código do registro não muda.');
      if (!atual) {
        const apagado = this.q('SELECT por FROM excluidos WHERE tabela = ? AND id = ? ORDER BY rowid DESC LIMIT 1', tabela, id)[0];
        if (!apagado) throw new ErroCofre(404, `Registro ${tabela} ${id} não existe.`);
        const proposta = Object.fromEntries(campos.map(([c, v]) => [nomeCampo(c), semSegredos(v?.depois)]));
        novosConflitos.push(this.abrirConflito('excluido', tabela, id, '*', null, apagado.por, proposta, email));
        return { ok: false, conflito: true };
      }
      const dados = JSON.parse(atual.dados); const meta = JSON.parse(atual.meta || '{}');
      let mudou = false; let conflito = false; let trocouSenha = false;
      for (const [c, v] of campos) {
        nomeCampo(c);
        const antes = semSegredos(v?.antes); const depois = semSegredos(v?.depois);
        if (tabela === 'usuarios' && c === 'sessoes') {
          // sessões (tokens de login) de vários aparelhos: junta as listas em vez de disputar (cada aparelho só sabe das suas);
          // o que este aparelho tirou (sair) some, o que os outros puseram fica
          const tirados = new Set((Array.isArray(antes) ? antes : []).filter((t) => !(Array.isArray(depois) ? depois : []).includes(t)));
          const juntas = [...new Set([...(Array.isArray(dados[c]) ? dados[c] : []), ...(Array.isArray(depois) ? depois : [])])].filter((t) => !tirados.has(t)).slice(-MAX_SESSOES);
          if (igual(dados[c], juntas)) continue;
          dados[c] = juntas; meta[c] = { por: email, em: this.agora() };
          mudou = true; continue;
        }
        if (tabela === 'usuarios' && CAMPOS_SENHA.includes(c)) {
          // senha: nunca vira conflito (o resumo iria para a tela de conflitos); vale a última troca
          if (igual(dados[c], depois)) continue;
          if (!v || !('depois' in v)) delete dados[c]; else dados[c] = depois;
          meta[c] = { por: email, em: this.agora() };
          if (c === 'senha_hash') trocouSenha = !('senha_iteracoes' in op.campos);
          mudou = true; continue;
        }
        const aberto = this.q("SELECT id FROM conflitos WHERE resolvido_em IS NULL AND tipo = 'campo' AND tabela = ? AND reg_id = ? AND campo = ?", tabela, String(id), c)[0];
        if (aberto) { // campo já em disputa: vira mais uma proposta, nada vale até a escolha
          novosConflitos.push(this.abrirConflito('campo', tabela, id, c, dados[c], meta[c]?.por || null, depois, email));
          conflito = true; continue;
        }
        if (igual(dados[c], depois)) continue; // já está assim
        if (igual(dados[c], antes)) {
          if (!v || !('depois' in v)) delete dados[c]; else dados[c] = depois; // sem "depois" = campo apagado
          meta[c] = { por: email, em: this.agora() };
          mudou = true; continue;
        }
        const junto = juntarSubchaves(antes, depois, dados[c]);
        if (junto !== undefined) { dados[c] = junto; meta[c] = { por: email, em: this.agora() }; mudou = true; continue; }
        // mudado aqui e lá: fica o valor já gravado na nuvem e o deste aparelho vira proposta para o administrador escolher
        // (decisão do dono de 2026-11-17, item 14 do mutirão 3000; antes o campo voltava ao valor que este aparelho tinha visto)
        novosConflitos.push(this.abrirConflito('campo', tabela, id, c, dados[c], meta[c]?.por || null, depois, email));
        conflito = true;
      }
      if (mudou && quem.papel !== 'admin') conferirRegrasDoAdmin(tabela, JSON.parse(atual.dados), dados);
      if (mudou) {
        if (this.chaves.has(tabela)) this.anotarChave(this.chaves.get(tabela), tabela, id, dados);
        this.sql.exec('UPDATE registros SET dados = ?, meta = ? WHERE tabela = ? AND id = ?', texto(dados), JSON.stringify(meta), tabela, id);
        // na fila só os campos que mudaram (item 33 do mutirão 3000: o aparelho já tem o resto; antes ia o registro inteiro, ex.:
        // o modelo de contrato de 50 KB a cada campo). Vão inteiros: usuários (a cópia deles muda conforme quem pede) e fichas e
        // e-mails registrados (a faxina dos dados pessoais da ficha, limparRastros, acha nas cópias o que saiu)
        if (LOG_INTEIRO.has(tabela)) this.registrarLog('registro', tabela, id, dados, email);
        else this.registrarLog('campos', tabela, id, camposMudados(JSON.parse(atual.dados), dados), email);
      }
      // senha trocada (não o reforço do login, que muda também as voltas): os computadores ligados por esse usuário param
      if (trocouSenha) this.desligarAparelhosDe(id, email);
      return conflito ? { ok: false, conflito: true } : { ok: true };
    }
    throw new ErroCofre(400, `Tipo de mudança desconhecido: ${String(op.op).slice(0, 20)}`);
  }

  mudarRaiz(op, email, quem, novosConflitos) {
    const campo = nomeCampo(op.campo);
    if (RAIZ_DO_SERVIDOR.includes(campo)) return { ok: true, ignorado: true };
    if (this.ehTabela(campo)) throw new ErroCofre(400, `"${campo}" é uma tabela: as mudanças vão registro a registro (a tabela inteira não pode ser trocada de uma vez).`);
    if (CONTADORES.includes(campo)) {
      const linha = this.q('SELECT valor FROM raiz WHERE campo = ?', campo)[0];
      if (!igual(linha ? JSON.parse(linha.valor) : undefined, op.antes)) throw new ErroCofre(409, 'O número da NF mudou em outro aparelho: refaça com o número novo.', { contador: true });
      if (quem.papel !== 'admin') {
        const de = Number(op.antes); const para = Number(op.depois);
        if (!Number.isSafeInteger(para) || !(para > de) || para - de > MAX_SALTO_NF) throw new ErroCofre(403, 'Só o administrador volta ou pula a numeração da NF.');
      }
      this.gravarRaiz(campo, op.depois, email);
      return { ok: true };
    }
    if (SO_ADMIN.raiz.includes(campo) && quem.papel !== 'admin') throw new ErroCofre(403, `Só o administrador muda ${campo === 'ordem_caixas' ? 'a ordem das caixas' : campo}.`);
    const linha = this.q('SELECT valor, meta FROM raiz WHERE campo = ?', campo)[0];
    const atual = linha ? JSON.parse(linha.valor) : undefined;
    const antes = semSegredos(op.antes); const depois = semSegredos(op.depois);
    if (igual(atual, depois)) return { ok: true };
    const aberto = this.q("SELECT id FROM conflitos WHERE resolvido_em IS NULL AND tabela = '_raiz' AND campo = ?", campo)[0];
    const junto = !aberto && !igual(atual, antes) ? juntarSubchaves(antes, depois, atual) : undefined;
    if (junto !== undefined) { this.gravarRaiz(campo, junto, email); return { ok: true }; }
    if (aberto || !igual(atual, antes)) {
      // fica o valor já gravado; o deste aparelho é a proposta (item 14)
      novosConflitos.push(this.abrirConflito('campo', '_raiz', 0, campo, atual, linha ? JSON.parse(linha.meta || '{}').por || null : null, depois, email));
      return { ok: false, conflito: true };
    }
    this.gravarRaiz(campo, depois, email);
    return { ok: true };
  }

  /** Valor inteiro de uma regra do sistema escolhida pelo administrador (tabela config_regras), ou undefined (vale o padrão). */
  regraNumero(chave) {
    for (const r of this.q("SELECT dados FROM registros WHERE tabela = 'config_regras'")) {
      try { const x = JSON.parse(r.dados); if (x.chave === chave && Number.isInteger(x.valor)) return x.valor; } catch { /* linha estragada */ }
    }
    return undefined;
  }

  /** Desliga os crachás do programa do PC de um usuário (a tabela é de aparelhos.mjs; sem ela, nada a fazer). */
  desligarAparelhosDe(usuarioId, email) {
    try {
      this.sql.exec('UPDATE aparelhos SET desligado_em = ?, desligado_por = ? WHERE usuario_id = ? AND desligado_em IS NULL', this.agora(), `senha trocada (${String(email).toLowerCase()})`, usuarioId);
    } catch { /* cofre sem a tabela de aparelhos (testes) */ }
  }

  gravarRaiz(campo, valor, email) {
    this.sql.exec('INSERT INTO raiz (campo, valor, meta) VALUES (?, ?, ?) ON CONFLICT(campo) DO UPDATE SET valor = excluded.valor, meta = excluded.meta', campo, texto(valor), JSON.stringify({ por: email, em: this.agora() }));
    this.registrarLog('raiz', null, null, { campo, valor }, email);
  }

  excluirRegistro(tabela, id, dados, email) {
    // usuário apagado: a cópia guardada vai sem senha nem sessões (item 31)
    const guardar = tabela === 'usuarios' ? Object.fromEntries(Object.entries(dados).filter(([k]) => !USUARIO_PROPRIO.includes(k))) : dados;
    this.sql.exec('INSERT INTO excluidos (tabela, id, dados, por, em) VALUES (?, ?, ?, ?, ?)', tabela, id, texto(guardar), email, this.agora());
    this.sql.exec('DELETE FROM registros WHERE tabela = ? AND id = ?', tabela, id);
    if (this.chaves.has(tabela)) this.anotarChave(this.chaves.get(tabela), tabela, id, null);
    this.registrarLog('exclusao', tabela, id, undefined, email);
  }

  ultimoAutor(metaTexto) {
    const meta = JSON.parse(metaTexto || '{}');
    return Object.values(meta).sort((a, b) => String(b?.em).localeCompare(String(a?.em)))[0]?.por || null;
  }

  abrirConflito(tipo, tabela, id, campo, atual, porAtual, proposto, porProposto) {
    this.sql.exec('INSERT INTO conflitos (tipo, tabela, reg_id, campo, atual, por_atual, proposto, por_proposto, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      tipo, tabela, String(id), campo, atual === undefined ? null : texto(atual), porAtual, proposto === undefined ? null : texto(proposto), porProposto, this.agora());
    const novo = this.q('SELECT MAX(id) AS id FROM conflitos')[0].id;
    this.registrarLog('conflito', tabela, Number(id) || null, { conflito: novo, tipo, campo }, porProposto);
    return { id: novo, tipo, tabela, reg_id: String(id), campo };
  }

  /**
   * Escolha de um conflito: { conflito, escolha }.
   * campo: 'atual' | 'proposto' (para todos os conflitos abertos do mesmo campo de uma vez) · exclusao: 'excluir' | 'manter'
   * · excluido: 'manter_excluido' | 'recriar' (volta o registro apagado com a mudança proposta).
   */
  resolver({ conflito, escolha } = {}, email) {
    this.exigir(email, 'admin'); // decisão do dono (2026-11-09): o conflito para e só o administrador escolhe
    return this.transacao(() => {
      const c = this.q('SELECT * FROM conflitos WHERE id = ? AND resolvido_em IS NULL', Number(conflito))[0];
      if (!c) throw new ErroCofre(404, 'Conflito não encontrado ou já resolvido.');
      const fechar = (ids) => { for (const i of ids) this.sql.exec('UPDATE conflitos SET resolvido_em = ?, escolha = ?, resolvido_por = ? WHERE id = ?', this.agora(), String(escolha), email, i); };
      const id = Number(c.reg_id);
      if (c.tipo === 'campo') {
        if (!['atual', 'proposto'].includes(escolha)) throw new ErroCofre(400, 'Escolha "atual" ou "proposto".');
        // valor escolhido que era "campo que não existia" (guardado como vazio no banco do cofre): o campo some, em vez de
        // ficar gravado como null (item 35; regras que testam "=== undefined" mudariam de comportamento)
        const escolhido = escolha === 'atual' ? c.atual : c.proposto;
        const ausente = escolhido === null || escolhido === undefined;
        const valor = ausente ? undefined : JSON.parse(escolhido);
        if (c.tabela === '_raiz') {
          if (!ausente) this.gravarRaiz(c.campo, valor, email);
          else { this.sql.exec('DELETE FROM raiz WHERE campo = ?', c.campo); this.registrarLog('raiz', null, null, { campo: c.campo }, email); }
        } else {
          const r = this.q('SELECT dados, meta FROM registros WHERE tabela = ? AND id = ?', c.tabela, id)[0];
          if (r) {
            const dados = JSON.parse(r.dados); const meta = JSON.parse(r.meta || '{}');
            if (ausente) delete dados[c.campo]; else dados[c.campo] = valor;
            meta[c.campo] = { por: email, em: this.agora() };
            this.sql.exec('UPDATE registros SET dados = ?, meta = ? WHERE tabela = ? AND id = ?', texto(dados), JSON.stringify(meta), c.tabela, id);
            this.registrarLog('registro', c.tabela, id, dados, email);
          }
        }
        fechar(this.q('SELECT id FROM conflitos WHERE resolvido_em IS NULL AND tipo = ? AND tabela = ? AND reg_id = ? AND campo = ?', c.tipo, c.tabela, c.reg_id, c.campo).map((x) => x.id));
      } else if (c.tipo === 'exclusao') {
        if (!['excluir', 'manter'].includes(escolha)) throw new ErroCofre(400, 'Escolha "excluir" ou "manter".');
        const r = this.q('SELECT dados FROM registros WHERE tabela = ? AND id = ?', c.tabela, id)[0];
        if (escolha === 'excluir' && r) this.excluirRegistro(c.tabela, id, JSON.parse(r.dados), email);
        fechar([c.id]);
      } else if (c.tipo === 'lote') {
        if (!['excluir', 'manter'].includes(escolha)) throw new ErroCofre(400, 'Escolha "excluir" (vale a gravação inteira) ou "manter" (nada dela vale).');
        if (escolha === 'excluir') {
          const quem = this.exigir(email, 'admin'); const novos = [];
          this.maiorOrdem = null; this.chaves = new Map();
          for (const op of JSON.parse(c.proposto || '{}').ops || []) {
            const { base, ...semBase } = op; // vale como se ninguém tivesse mudado os registros
            this.aplicarOp(op.op === 'excluir' ? semBase : op, email, quem, novos);
          }
        }
        fechar([c.id]);
      } else if (c.tipo === 'excluido') {
        if (!['manter_excluido', 'recriar'].includes(escolha)) throw new ErroCofre(400, 'Escolha "manter_excluido" ou "recriar".');
        if (escolha === 'recriar' && !this.q('SELECT 1 AS x FROM registros WHERE tabela = ? AND id = ?', c.tabela, id).length) {
          const ap = this.q('SELECT dados FROM excluidos WHERE tabela = ? AND id = ? ORDER BY rowid DESC LIMIT 1', c.tabela, id)[0];
          const dados = { ...JSON.parse(ap.dados), ...JSON.parse(c.proposto || '{}'), id };
          this.sql.exec('INSERT INTO registros (tabela, id, dados, ordem) VALUES (?, ?, ?, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM registros))', c.tabela, id, texto(dados));
          this.registrarLog('registro', c.tabela, id, dados, email);
        }
        fechar([c.id]);
      }
      this.registrarLog('resolvido', c.tabela, id || null, { conflito: c.id, escolha }, email);
      this.controle('revisao', Number(this.controle('revisao') || 0) + 1);
      this.controle('atualizado_em', this.agora());
      this.controle('atualizado_por', email);
      return { ok: true, seq: this.ultimoSeq() };
    });
  }

  /** Faixa de códigos novos de uma tabela para um aparelho usar mesmo sem internet (nunca repete entre aparelhos). */
  faixa({ tabela, quantidade = 200, tabelas } = {}, email) {
    this.exigir(email, 'operador');
    // várias de uma vez (primeiro acesso de um aparelho: ~60 tabelas numa ida só, em vez de um pedido por tabela):
    // `tabelas` = { nome: quantidade }; resposta { faixas: [{ tabela, inicio, fim }] }, todas na mesma transação
    if (tabelas !== undefined) {
      const pedidos = tabelas && typeof tabelas === 'object' && !Array.isArray(tabelas) ? Object.entries(tabelas) : null;
      if (!pedidos || !pedidos.length || pedidos.length > MAX_TABELAS_FAIXA) throw new ErroCofre(400, 'Pedido de faixas inválido.');
      const lista = pedidos.map(([t, q]) => [this.tabelaDeRegistros(t), q]);
      return this.transacao(() => ({ faixas: lista.map(([t, q]) => this.reservarFaixa(t, q)) }));
    }
    const t = this.tabelaDeRegistros(tabela);
    return this.transacao(() => this.reservarFaixa(t, quantidade));
  }

  /** Reserva a faixa de uma tabela (dentro da transação de quem chama). */
  reservarFaixa(t, quantidade) {
    const qtd = Math.min(MAX_FAIXA, Math.max(1, Math.floor(Number(quantidade) || 0)));
    const maior = Number(this.q('SELECT MAX(id) AS m FROM registros WHERE tabela = ?', t)[0]?.m || 0);
    const proximo = Math.max(Number(this.q('SELECT proximo FROM tabelas WHERE nome = ?', t)[0]?.proximo || 1), maior + 1);
    this.sql.exec('INSERT INTO tabelas (nome, proximo) VALUES (?, ?) ON CONFLICT(nome) DO UPDATE SET proximo = excluded.proximo', t, proximo + qtd);
    return { tabela: t, inicio: proximo, fim: proximo + qtd - 1 };
  }

  /** Próximo número de um contador (NF): só com internet, um pedido de cada vez, nunca repete. */
  contador({ nome } = {}, email) {
    this.exigir(email, 'operador');
    if (!CONTADORES.includes(nome)) throw new ErroCofre(400, 'Contador desconhecido.');
    return this.transacao(() => {
      const linha = this.q('SELECT valor FROM raiz WHERE campo = ?', nome)[0];
      const numero = Number(linha ? JSON.parse(linha.valor) : 1) || 1;
      this.gravarRaiz(nome, numero + 1, email);
      return { numero, seq: this.ultimoSeq() };
    });
  }

  /**
   * E-mail pela conta da empresa: registra quem mandou, para quem, o assunto e os nomes dos anexos (não o texto), com limite
   * por usuário e por dia (MAX_EMAILS_DIA). Só operador ou administrador.
   */
  registrarEmail({ para = [], assunto = '', anexos = [] } = {}, email) {
    this.exigir(email, 'operador');
    const inicioDoDia = new Date(Date.parse(`${hojeBrasilia(this.relogio())}T00:00:00-03:00`)).toISOString();
    const n = Number(this.q('SELECT COUNT(*) AS n FROM emails_enviados WHERE por = ? AND em >= ?', String(email).toLowerCase(), inicioDoDia)[0].n);
    if (n >= MAX_EMAILS_DIA) throw new ErroCofre(429, `Limite de ${MAX_EMAILS_DIA} e-mails por dia para este usuário. Tente amanhã ou fale com o administrador.`);
    this.sql.exec('INSERT INTO emails_enviados (por, em, para, assunto, anexos) VALUES (?, ?, ?, ?, ?)', String(email).toLowerCase(), this.agora(),
      (Array.isArray(para) ? para : []).map(String).join(', ').slice(0, 2000), String(assunto).slice(0, 300),
      JSON.stringify((Array.isArray(anexos) ? anexos : []).map((a) => String(a).slice(0, 200)).slice(0, 30)));
    return { ok: true, registro: Number(this.q('SELECT MAX(n) AS n FROM emails_enviados')[0].n) };
  }

  /** Chave pública do backup seguro do administrador (cifrar-backup.mjs), ou null: os backups diários saem abertos. */
  chaveDoBackup() {
    const t = this.controle('chave_backup');
    try { return t ? JSON.parse(t) : null; } catch { return null; }
  }

  /**
   * O administrador liga (ou troca) a chave dos backups da nuvem: { chave } = o conteúdo de chave-do-backup.json da pasta do
   * backup seguro (só a parte pública e a privada já cifrada pela senha do backup). { chave: null } desliga. Devolve o estado.
   */
  async ligarChaveDoBackup({ chave } = {}, email) {
    this.exigir(email, 'admin');
    if (chave === null) { this.sql.exec("DELETE FROM controle WHERE chave = 'chave_backup'"); return { ligada: false }; }
    let valida;
    try { valida = await chaveDoBackupValida(chave); } catch (e) { throw new ErroCofre(400, e.message); }
    const atual = this.chaveDoBackup();
    if (!atual || atual.publica !== valida.publica) this.controle('chave_backup', JSON.stringify({ ...valida, ligada_em: this.agora(), ligada_por: String(email).toLowerCase() }));
    return { ligada: true, resumo: await resumoDaChave(valida), ligada_em: this.chaveDoBackup().ligada_em };
  }

  /**
   * Rastros dos dados pessoais que saíram de um registro (LGPD): os aparelhos limpam o registro e o histórico deles
   * (R.apagarDadosPessoaisDaFicha), mas o servidor guarda também as linhas do histórico, a fila (cópia do registro a cada
   * mudança), a cópia de registro excluído e os valores dos conflitos. Aqui saem deles os campos que o registro já não tem
   * (vazios agora) e os textos que eles tinham (CPF, e-mail, telefone…), também nos e-mails registrados para ele
   * (`ligacao`: o campo de envios_email que aponta para o registro). Os backups diários antigos saem sozinhos em MANTER_BACKUPS dias.
   * Devolve quantas linhas mudaram.
   */
  limparRastros(tabela, id, ligacao = null) {
    const r = this.q('SELECT dados FROM registros WHERE tabela = ? AND id = ?', tabela, id)[0];
    if (!r) return 0;
    const atual = JSON.parse(r.dados);
    const fica = (k) => !vazioDe(atual[k]);
    const sairam = new Set(); // textos que estavam nos campos que saíram (para tirar também das descrições)
    const anotar = (v) => { // só textos: número (renda em centavos…) trocado dentro de outro número estragaria o valor
      if (v === null || v === undefined) return;
      if (typeof v === 'object') { for (const x of Object.values(v)) anotar(x); return; }
      const t = typeof v === 'string' ? v.trim() : '';
      if (t.length >= 5 && sairam.size < 2000) sairam.add(t);
    };
    const anotarSaiu = (reg) => { if (objetoSimples(reg)) for (const [k, v] of Object.entries(reg)) if (!fica(k)) anotar(v); };
    const limparDet = (det) => {
      if (!objetoSimples(det)) return det ?? null;
      const out = {};
      for (const [k, v] of Object.entries(det)) { if (fica(k)) out[k] = v; else anotar(v); }
      return out;
    };
    const chaveH = (h) => objetoSimples(h) && h.tabela === tabela && Number(h.registro_id) === id;
    let n = 0;
    // 1) as cópias do registro na fila (log) e nos excluídos: os textos que saíram, e a cópia vira a de agora
    for (const l of this.q("SELECT seq, tipo, dados FROM log WHERE tipo IN ('registro', 'campos') AND tabela = ? AND id = ?", tabela, id)) {
      const antes = JSON.parse(l.dados || 'null');
      anotarSaiu(l.tipo === 'campos' ? antes?.campos : antes);
      this.sql.exec("UPDATE log SET tipo = 'registro', dados = ? WHERE seq = ?", r.dados, l.seq); n += 1;
    }
    for (const x of this.q('SELECT rowid AS rid, dados FROM excluidos WHERE tabela = ? AND id = ?', tabela, id)) { anotarSaiu(JSON.parse(x.dados)); this.sql.exec('DELETE FROM excluidos WHERE rowid = ?', x.rid); n += 1; }
    // 2) as linhas do histórico do registro (na tabela e na fila): saem os campos que o registro não tem mais
    const linhasH = this.q("SELECT n, dados FROM historico WHERE json_extract(dados, '$.tabela') = ? AND CAST(json_extract(dados, '$.registro_id') AS INTEGER) = ?", tabela, id);
    const filaH = this.q("SELECT seq, dados FROM log WHERE tipo = 'historico' AND json_extract(dados, '$.tabela') = ? AND CAST(json_extract(dados, '$.registro_id') AS INTEGER) = ?", tabela, id);
    const semCampos = (h) => (chaveH(h) ? { ...h, detalhes: limparDet(h.detalhes) } : h);
    const novasH = linhasH.map((l) => [l.n, semCampos(JSON.parse(l.dados))]);
    const novasF = filaH.map((l) => [l.seq, semCampos(JSON.parse(l.dados))]);
    // 3) e-mails registrados para ele: o endereço sai do registro (os aparelhos já tiraram) e de tudo que o guardava
    const emails = ligacao ? this.q(`SELECT id, dados FROM registros WHERE tabela = 'envios_email' AND json_extract(dados, '$.${ligacao}') = ?`, id) : [];
    for (const e of emails) {
      for (const l of this.q("SELECT tipo, dados FROM log WHERE tipo IN ('registro', 'campos') AND tabela = 'envios_email' AND id = ?", e.id)) {
        const x = JSON.parse(l.dados || 'null');
        anotar(l.tipo === 'campos' ? x?.campos?.para : x?.para);
      }
      for (const x of this.q("SELECT dados FROM excluidos WHERE tabela = 'envios_email' AND id = ?", e.id)) anotar(JSON.parse(x.dados)?.para);
      const reg = JSON.parse(e.dados); anotar(reg.para);
      if (!vazioDe(reg.para)) { reg.para = null; this.sql.exec("UPDATE registros SET dados = ? WHERE tabela = 'envios_email' AND id = ?", texto(reg), e.id); }
      this.sql.exec("UPDATE log SET tipo = 'registro', dados = ? WHERE tipo IN ('registro', 'campos') AND tabela = 'envios_email' AND id = ?", texto(reg), e.id);
    }
    const idsEmail = new Set(emails.map((e) => e.id));
    // textos que saíram: tirados das descrições e detalhes das linhas do histórico do registro e dos e-mails dele
    // (menos o que continua no registro: o apelido igual ao nome não apaga o nome das descrições)
    const ficaram = Object.values(atual).filter((v) => typeof v === 'string' && v.trim()).map((v) => v.toLocaleLowerCase('pt-BR'));
    const textos = [...sairam].filter((x) => !ficaram.some((v) => v.includes(x.toLocaleLowerCase('pt-BR')))).sort((a, b) => b.length - a.length);
    const tirarTextos = (h) => {
      if (typeof h === 'string') return textos.reduce((t, x) => t.split(x).join('(apagado)'), h);
      if (Array.isArray(h)) return h.map(tirarTextos);
      if (objetoSimples(h)) return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, tirarTextos(v)]));
      return h;
    };
    const tocar = (h) => chaveH(h) || (objetoSimples(h) && h.tabela === 'envios_email' && idsEmail.has(Number(h.registro_id)));
    const deEmails = idsEmail.size ? this.q("SELECT n, dados FROM historico WHERE json_extract(dados, '$.tabela') = 'envios_email'").map((l) => [l.n, JSON.parse(l.dados)]).filter(([, h]) => tocar(h)) : [];
    const filaEmails = idsEmail.size ? this.q("SELECT seq, dados FROM log WHERE tipo = 'historico' AND json_extract(dados, '$.tabela') = 'envios_email'").map((l) => [l.seq, JSON.parse(l.dados)]).filter(([, h]) => tocar(h)) : [];
    for (const [k, h] of [...novasH, ...deEmails]) { this.sql.exec('UPDATE historico SET dados = ? WHERE n = ?', texto(tirarTextos(h)), k); n += 1; }
    for (const [k, h] of [...novasF, ...filaEmails]) { this.sql.exec('UPDATE log SET dados = ? WHERE seq = ?', texto(tirarTextos(h)), k); n += 1; }
    // 4) conflitos do registro: os valores que saíram
    for (const c of this.q('SELECT id, campo, atual, proposto FROM conflitos WHERE tabela = ? AND reg_id = ?', tabela, String(id))) {
      const limpar = (v) => {
        if (v === null) return null;
        const x = JSON.parse(v);
        if (c.campo !== '*') return fica(c.campo) ? v : texto(null);
        return texto(objetoSimples(x) ? limparDet(x) : x);
      };
      this.sql.exec('UPDATE conflitos SET atual = ?, proposto = ? WHERE id = ?', limpar(c.atual), limpar(c.proposto), c.id); n += 1;
    }
    return n;
  }

  /**
   * "Apagar tudo desta pessoa": { registros: [{tabela, id}] excluídos, limpos: [{tabela, id}] com os campos dela vazios, contratos: [id] }.
   * Dos excluídos (só os que não existem mais) saem as linhas do histórico, as cópias na fila, a cópia de excluído e os conflitos;
   * dos contratos, também as linhas do histórico dos lançamentos dele; dos limpos, os campos que saíram (limparRastros).
   * O aviso de exclusão na fila fica (o aparelho atrasado ainda precisa saber que o registro saiu). Devolve quantas linhas saíram.
   */
  esquecerApagados(det, email) {
    const lista = (v) => (Array.isArray(v) ? v : []).filter((x) => x && typeof x.tabela === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(x.tabela) && Number.isSafeInteger(Number(x.id))).slice(0, 20000);
    const existe = (t, id) => this.q('SELECT 1 AS x FROM registros WHERE tabela = ? AND id = ?', t, id).length > 0;
    let n = 0;
    const apagar = (consulta, ...p) => { n += this.q(`SELECT COUNT(*) AS n FROM ${consulta}`, ...p)[0].n; this.sql.exec(`DELETE FROM ${consulta}`, ...p); };
    const doRegistro = "json_extract(dados, '$.tabela') = ? AND CAST(json_extract(dados, '$.registro_id') AS INTEGER) = ?";
    for (const { tabela, id } of lista(det?.registros)) {
      const i = Number(id);
      if (existe(tabela, i)) continue;
      apagar(`historico WHERE ${doRegistro}`, tabela, i);
      apagar(`log WHERE tipo = 'historico' AND ${doRegistro}`, tabela, i);
      apagar("log WHERE tipo = 'registro' AND tabela = ? AND id = ?", tabela, i);
      apagar('excluidos WHERE tabela = ? AND id = ?', tabela, i);
      apagar('conflitos WHERE tabela = ? AND reg_id = ?', tabela, String(i));
    }
    for (const id of (Array.isArray(det?.contratos) ? det.contratos : []).map(Number).filter((x) => Number.isSafeInteger(x) && !existe('contratos', x))) {
      apagar("historico WHERE CAST(json_extract(dados, '$.contrato_id') AS INTEGER) = ?", id);
      apagar("log WHERE tipo = 'historico' AND CAST(json_extract(dados, '$.contrato_id') AS INTEGER) = ?", id);
    }
    for (const { tabela, id } of lista(det?.limpos)) n += this.limparRastros(tabela, Number(id));
    this.registrarLog('refazer', null, null, undefined, email);
    return n;
  }

  /**
   * Fichas reprovadas ou com desistência que já tiveram os dados pessoais apagados nos aparelhos (dados_apagados_em) e ainda
   * não na nuvem: limpa os rastros (limparRastros) e marca a ficha com `historico_limpo_em` (vai para os aparelhos pela fila).
   * Roda na faxina diária. Devolve os códigos das fichas limpas.
   */
  esquecerFichasApagadas(por = 'servidor (faxina LGPD)') {
    const fichas = this.q(`SELECT id, dados FROM registros WHERE tabela = 'fichas' AND json_extract(dados, '$.situacao') IN ('Reprovada', 'Desistiu')
      AND json_extract(dados, '$.dados_apagados_em') IS NOT NULL AND json_extract(dados, '$.historico_limpo_em') IS NULL`);
    const feitas = [];
    for (const f of fichas) {
      this.transacao(() => {
        this.limparRastros('fichas', f.id, 'ficha_id');
        const dados = { ...JSON.parse(f.dados), historico_limpo_em: hojeBrasilia(this.relogio()) };
        const meta = JSON.parse(this.q("SELECT meta FROM registros WHERE tabela = 'fichas' AND id = ?", f.id)[0]?.meta || '{}');
        meta.historico_limpo_em = { por, em: this.agora() };
        this.sql.exec("UPDATE registros SET dados = ?, meta = ? WHERE tabela = 'fichas' AND id = ?", texto(dados), JSON.stringify(meta), f.id);
        this.registrarLog('registro', 'fichas', f.id, dados, por);
        this.controle('revisao', Number(this.controle('revisao') || 0) + 1);
      });
      feitas.push(f.id);
    }
    if (feitas.length) this.registrarLog('refazer', null, null, undefined, por); // os aparelhos baixam de novo: a cópia velha do histórico deles sai
    return feitas;
  }

  // -------------------------------------------------------------------------
  // Registro de acessos (tela Acessos do administrador)
  // -------------------------------------------------------------------------
  /** Anota um acesso: { email, rota, bytes, ip, origem ('site' | 'pc'), resultado (código HTTP), em }. */
  anotarAcesso({ email, rota, bytes = null, ip = '', origem = 'site', resultado = 200, em = null } = {}) {
    const agora = this.relogio().getTime();
    const quando = typeof em === 'string' && Math.abs(Date.parse(em) - agora) < 86400000 ? new Date(Date.parse(em)).toISOString() : this.agora();
    const tamanho = bytes === null || bytes === undefined || !Number.isSafeInteger(Number(bytes)) ? null : Number(bytes);
    this.sql.exec('INSERT INTO acessos (em, email, rota, bytes, ip, origem, resultado) VALUES (?, ?, ?, ?, ?, ?, ?)', quando,
      String(email || '').toLowerCase().slice(0, 200) || '(sem login)', String(rota || '').slice(0, 600), tamanho,
      String(ip || '').slice(0, 60), ['site', 'pc'].includes(origem) ? origem : 'site', Number.isInteger(Number(resultado)) ? Number(resultado) : null);
  }

  /** Acessos juntados pelo Worker (só ele chama: a rota não está entre as que o site repassa ao cofre). */
  registrarAcessos({ acessos = [] } = {}) {
    const lista = Array.isArray(acessos) ? acessos.slice(0, MAX_ACESSOS_POR_ENVIO) : [];
    this.transacao(() => { for (const a of lista) if (a && typeof a === 'object') this.anotarAcesso(a); });
    return { ok: true, anotados: lista.length };
  }

  /** Dias que o registro de acessos fica guardado: a regra do administrador (config_regras), dentro dos limites. */
  diasAcessos() {
    const l = this.q("SELECT json_extract(dados, '$.valor') AS v FROM registros WHERE tabela = 'config_regras' AND json_extract(dados, '$.chave') = 'dias_registro_acessos' LIMIT 1")[0];
    const v = Number(l?.v);
    return Number.isInteger(v) && v >= DIAS_ACESSOS.min && v <= DIAS_ACESSOS.max ? v : DIAS_ACESSOS.padrao;
  }

  /**
   * Acessos para a tela (só administrador), do mais novo ao mais velho: { de, ate ('AAAA-MM-DD', Brasília), email, antes (n, para
   * ver os mais velhos), limite }. Devolve também o resumo por pessoa no período (quantos, quanto baixou e quantos recusados).
   */
  listarAcessos({ de = '', ate = '', email: filtro = '', antes = '', limite = 200 } = {}, email) {
    this.exigir(email, 'admin');
    const conds = []; const p = [];
    const dia = (t) => (/^\d{4}-\d{2}-\d{2}$/.test(String(t)) ? String(t) : '');
    if (dia(de)) { conds.push('em >= ?'); p.push(new Date(`${dia(de)}T00:00:00-03:00`).toISOString()); }
    if (dia(ate)) { conds.push('em < ?'); p.push(new Date(Date.parse(`${dia(ate)}T00:00:00-03:00`) + 86400000).toISOString()); }
    if (filtro) { conds.push('email = ?'); p.push(String(filtro).toLowerCase().slice(0, 200)); }
    const onde = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const n = Math.min(500, Math.max(1, Number(limite) || 200));
    const antesN = Number(antes);
    const linhas = this.q(`SELECT n, em, email, rota, bytes, ip, origem, resultado FROM acessos ${onde ? `${onde} AND` : 'WHERE'} n < ? ORDER BY n DESC LIMIT ?`,
      ...p, Number.isSafeInteger(antesN) && antesN > 0 ? antesN : Number.MAX_SAFE_INTEGER, n + 1);
    const resumo = this.q(`SELECT email, COUNT(*) AS acessos, COALESCE(SUM(bytes), 0) AS bytes, SUM(CASE WHEN resultado >= 400 THEN 1 ELSE 0 END) AS recusados FROM acessos ${onde} GROUP BY email ORDER BY bytes DESC`, ...p);
    const emails = this.q('SELECT DISTINCT email FROM acessos ORDER BY email').map((x) => x.email);
    return { acessos: linhas.slice(0, n), mais: linhas.length > n, resumo, emails, dias: this.diasAcessos() };
  }

  /**
   * Limpa o que já não precisa: fila com mais de DIAS_LOG dias, lotes repetidos antigos, registros excluídos (DIAS_EXCLUIDOS) e
   * conflitos resolvidos (DIAS_CONFLITOS_RESOLVIDOS), cotas e registro de e-mails com mais de um ano, e os rastros das
   * fichas reprovadas com os dados pessoais apagados (esquecerFichasApagadas).
   */
  limpar() {
    const antes = (dias) => new Date(this.relogio().getTime() - dias * 86400000).toISOString();
    const limite = antes(DIAS_LOG);
    this.sql.exec('DELETE FROM log WHERE em < ? AND seq < (SELECT MAX(seq) FROM log)', limite);
    this.sql.exec('DELETE FROM lotes WHERE em < ?', limite);
    // registros apagados guardados (dados pessoais, LGPD): saem depois de DIAS_EXCLUIDOS, salvo os de um conflito aberto (item 31)
    this.sql.exec(`DELETE FROM excluidos WHERE em < ? AND NOT EXISTS (SELECT 1 FROM conflitos c WHERE c.resolvido_em IS NULL
      AND c.tabela = excluidos.tabela AND c.reg_id = CAST(excluidos.id AS TEXT))`, antes(DIAS_EXCLUIDOS));
    this.sql.exec('DELETE FROM conflitos WHERE resolvido_em IS NOT NULL AND resolvido_em < ?', antes(DIAS_CONFLITOS_RESOLVIDOS)); // item 32
    this.sql.exec('DELETE FROM cotas WHERE chave < ?', hojeBrasilia(new Date(this.relogio().getTime() - 3 * 86400000)));
    this.sql.exec('DELETE FROM emails_enviados WHERE em < ?', antes(365));
    // fichas reprovadas com os dados pessoais já apagados nos aparelhos: saem também do histórico guardado aqui (LGPD)
    try { this.esquecerFichasApagadas(); } catch (e) { console.error('limpeza das fichas reprovadas', e); }
    this.sql.exec('DELETE FROM acessos WHERE em < ?', antes(this.diasAcessos())); // registro de acessos: pelo prazo da regra
  }
}

// ---------------------------------------------------------------------------
// Durable Object (Cloudflare): um só cofre ("principal") para o banco inteiro
// ---------------------------------------------------------------------------
export function hojeBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

/** Próximas HORA_MANUTENCAO h (Brasília) depois de `agora`: quando o alarme diário do cofre roda (backup do dia + faxina). */
export const HORA_MANUTENCAO = 3;
export function proximaManutencao(agora = new Date()) {
  const hoje = new Date(`${hojeBrasilia(agora)}T${String(HORA_MANUTENCAO).padStart(2, '0')}:00:00-03:00`);
  return hoje > agora ? hoje : new Date(hoje.getTime() + 86400000);
}

/** Apaga do R2 os backups mais antigos que casam com `padrao`, deixando os `manter` mais recentes (nomes com a data: ordem alfabética = cronológica). */
async function faxinaDeBackups(r2, padrao, manter) {
  const nomes = [];
  let cursor;
  do {
    const r = await r2.list({ prefix: 'backups/imoveis-dados-', cursor });
    nomes.push(...r.objects.map((o) => o.key).filter((k) => padrao.test(k)));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  nomes.sort();
  const velhos = nomes.slice(0, Math.max(0, nomes.length - manter));
  if (velhos.length) await r2.delete(velhos);
}

/**
 * Cópia completa no R2 uma vez por dia (horário de Brasília), guardando as MANTER_BACKUPS mais recentes.
 * `forcarNome` ('antes-da-substituicao'): cópia extra, sempre feita; dessas ficam as MANTER_SUBSTITUICOES mais recentes.
 */
export async function backupDoDia(cofre, r2, agora = new Date(), forcarNome = '') {
  const dia = hojeBrasilia(agora);
  if (!forcarNome && cofre.controle('ultimo_backup') === dia) return false;
  if (cofre.vazio()) return false;
  // com a chave do backup seguro ligada (o administrador manda: ligarChaveDoBackup), o arquivo sai cifrado (.bkp): o banco inteiro,
  // com CPFs e os resumos das senhas, nunca fica aberto no R2. Sem chave, o JSON aberto de antes.
  const chave = cofre.chaveDoBackup();
  const base = `backups/imoveis-dados-${forcarNome ? `${dia}-${forcarNome}` : dia}`;
  const d = cofre.tudo();
  if (chave) {
    const bytes = await cifrarBackup(chave, new TextEncoder().encode(JSON.stringify(d)), { tipo: 'diario', origem: 'nuvem', arquivo: 'imoveis-dados.json', revisao: d.revisao });
    await r2.put(`${base}.bkp`, bytes, { httpMetadata: { contentType: 'application/octet-stream' } });
    await r2.delete(`${base}.json`); // a cópia aberta do mesmo dia (feita antes de ligar a chave) não fica
  } else {
    await r2.put(`${base}.json`, JSON.stringify(d), { httpMetadata: { contentType: 'application/json' } });
  }
  if (forcarNome) {
    await faxinaDeBackups(r2, new RegExp(`^backups/imoveis-dados-\\d{4}-\\d{2}-\\d{2}-${forcarNome}\\.(json|bkp)$`), MANTER_SUBSTITUICOES);
    return true;
  }
  cofre.controle('ultimo_backup', dia);
  await faxinaDeBackups(r2, /^backups\/imoveis-dados-\d{4}-\d{2}-\d{2}\.(json|bkp)$/, MANTER_BACKUPS);
  return true;
}

const resposta = (status, dados) => new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/**
 * Só o Worker chama (binding COFRE); o e-mail vem dele, já conferido no login do Access.
 * Backup do dia e faxina da fila rodam no alarme diário (HORA_MANUTENCAO, Brasília), fora dos pedidos. Se o alarme não rodou
 * (ou o ambiente não tem alarme), o primeiro POST do dia ainda faz o backup, e a faxina roda no máximo uma vez por hora.
 */
export class CofreDO {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.cofre = new Cofre(ctx.storage.sql, (fn) => ctx.storage.transactionSync(fn));
    this.cofre.dono = String(env?.DONO_EMAIL || '').trim().toLowerCase();
    this.aparelhos = new Aparelhos(this.cofre);
    this.gmail = new ContaGmail(this.cofre, ErroCofre);
    this.alarmeMarcado = false;
  }

  temAlarme() { return typeof this.ctx?.storage?.setAlarm === 'function'; }

  /** Garante o alarme diário (uma vez por instância do objeto; o alarme se remarca ao rodar). */
  async marcarAlarme(agora = new Date()) {
    if (this.alarmeMarcado || !this.temAlarme()) return;
    this.alarmeMarcado = true;
    try {
      if (!(await this.ctx.storage.getAlarm?.())) await this.ctx.storage.setAlarm(proximaManutencao(agora));
    } catch (e) { console.error(e); this.alarmeMarcado = false; }
  }

  /** Backup do dia (se ainda não há) e faxina. `so` = 'backup' | 'faxina' | 'tudo'. */
  async manutencao(agora = new Date(), so = 'tudo') {
    const c = this.cofre;
    if (so !== 'faxina' && this.env.DADOS) await backupDoDia(c, this.env.DADOS, agora);
    if (so !== 'backup') {
      c.limpar(); c.controle('ultima_faxina', agora.toISOString());
      // R2: lixeira dos anexos apagados (regra dias_lixeira_anexos, padrão 30 dias) e links da ficha passados da guarda (LGPD)
      if (this.env.DADOS) {
        await faxinaDaLixeira(this.env.DADOS, agora, c.regraNumero('dias_lixeira_anexos')).catch((e) => console.error('lixeira', e));
        await faxinaDosLinks(this.env).catch((e) => console.error('links da ficha', e));
      }
    }
  }

  /** Alarme diário do Durable Object (Cloudflare chama). */
  async alarm() {
    const agora = new Date();
    try { await this.manutencao(agora, 'tudo'); } catch (e) { console.error(e); }
    if (this.temAlarme()) await this.ctx.storage.setAlarm(proximaManutencao(agora));
  }

  /** Depois de um POST: o que o alarme não cobriu. Barato: uma leitura em `controle` para cada decisão. */
  async depoisDeGravar(agora = new Date()) {
    await this.marcarAlarme(agora);
    const c = this.cofre;
    if (this.env.DADOS && c.controle('ultimo_backup') !== hojeBrasilia(agora)) await backupDoDia(c, this.env.DADOS, agora);
    if (this.temAlarme()) return; // a faxina é do alarme
    const ultima = Date.parse(c.controle('ultima_faxina') || '') || 0;
    if (agora.getTime() - ultima >= INTERVALO_FAXINA_MS) await this.manutencao(agora, 'faxina');
  }

  async fetch(request) {
    const url = new URL(request.url);
    const email = request.headers.get('X-Email-Conferido') || '';
    const corpo = async () => { try { return await request.json(); } catch { throw new ErroCofre(400, 'Pedido inválido.'); } };
    try {
      const c = this.cofre; const rota = url.pathname;
      const deOnde = { ip: request.headers.get('X-Ip') || '', origem: request.headers.get('X-Origem') === 'pc' ? 'pc' : 'site' };
      let r;
      // programa do PC, sem o login do Access: o Worker só manda estas duas a partir de /api/aparelho/ (atenderAparelho)
      if (rota === '/aparelho/entrar' && request.method === 'POST') {
        const pedido = await corpo(); const ip = request.headers.get('X-Ip') || '';
        // a entrada com senha (não o 1º passo, que só pede o sal) fica no registro de acessos, também a recusada
        const anotar = (resultado) => { if (pedido?.senha !== undefined && pedido?.senha !== null) this.cofre.anotarAcesso({ email: pedido?.email, rota: `aparelho/entrar (${String(pedido?.computador || '').slice(0, 60)})`, ip, origem: 'pc', resultado, bytes: 0 }); };
        try { const feito = await this.aparelhos.entrar(pedido, ip); anotar(200); return resposta(200, feito); } catch (e) { anotar(e?.status || 500); throw e; }
      }
      if (rota === '/registrar-acessos' && request.method === 'POST') return resposta(200, this.cofre.registrarAcessos(await corpo()));
      if (rota === '/aparelho/conferir' && request.method === 'POST') { const c = await corpo(); return resposta(200, await this.aparelhos.conferir(c?.cracha, c?.versao)); }
      // a conta do Gmail (refresh token cifrado): só o Worker chega aqui (gmail.mjs, contaGuardada), também nos avisos da ficha
      if (rota === '/gmail/conta' && request.method === 'GET') return resposta(200, { conta: this.gmail.conta() });
      if (!email) throw new ErroCofre(401, 'Sem login.');
      if (rota === '/aparelhos' && request.method === 'GET') r = this.aparelhos.lista(c.exigir(email, 'consulta'));
      else if (rota === '/desligar-aparelho' && request.method === 'POST') r = this.aparelhos.desligar(await corpo(), c.exigir(email, 'consulta'), email);
      else if (rota === '/verificador-aparelho' && request.method === 'POST') r = await this.aparelhos.guardarVerificador(await corpo(), c.exigir(email, 'consulta'));
      else if (rota === '/papel' && request.method === 'GET') {
        // o Worker pede 'admin' para os backups (banco inteiro, com as senhas de todos): nível desconhecido é recusado, nunca vira 'consulta'
        const nivel = url.searchParams.get('nivel');
        if (!Object.hasOwn(NIVEL, nivel || '')) throw new ErroCofre(400, 'Nível de acesso desconhecido.');
        r = c.exigir(email, nivel);
      }
      else if (rota === '/tudo' && request.method === 'GET') {
        // o banco inteiro: fica no registro de acessos, com o tamanho
        const texto = JSON.stringify(c.tudo(c.exigir(email, 'consulta')));
        c.anotarAcesso({ email, rota: 'dados/tudo', bytes: texto.length, ...deOnde });
        return new Response(texto, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
      else if (rota === '/acessos' && request.method === 'GET') r = c.listarAcessos(Object.fromEntries(url.searchParams), email);
      else if (rota === '/mudancas' && request.method === 'GET') r = c.mudancas(url.searchParams.get('desde'), c.exigir(email, 'consulta'), undefined, Number(url.searchParams.get('formato')) || 1);
      else if (rota === '/conflitos' && request.method === 'GET') r = { conflitos: c.conflitosAbertos(c.exigir(email, 'consulta')) };
      else if (rota === '/registrar-email' && request.method === 'POST') r = c.registrarEmail(await corpo(), email);
      else if (rota === '/gmail/estado-novo' && request.method === 'POST') r = this.gmail.novoEstado(await corpo(), email);
      else if (rota === '/gmail/estado-usar' && request.method === 'POST') r = this.gmail.usarEstado(await corpo(), email);
      else if (rota === '/gmail/guardar' && request.method === 'POST') r = this.gmail.guardar(await corpo(), email);
      else if (rota === '/gmail/apagar' && request.method === 'POST') r = this.gmail.apagar(email);
      else if (rota === '/chave-backup' && request.method === 'POST') r = await c.ligarChaveDoBackup(await corpo(), email);
      else if (rota === '/lote' && request.method === 'POST') r = c.aplicar(await corpo(), email);
      else if (rota === '/resolver' && request.method === 'POST') r = c.resolver(await corpo(), email);
      else if (rota === '/faixa' && request.method === 'POST') r = c.faixa(await corpo(), email);
      else if (rota === '/contador' && request.method === 'POST') r = c.contador(await corpo(), email);
      else if (rota === '/importar' && request.method === 'POST') {
        const pedido = await corpo();
        if (!c.vazio()) {
          // só o administrador substitui, e a cópia de antes só é feita para quem pode (senão qualquer login encheria o R2)
          if (pedido.substituir !== true) throw new ErroCofre(409, 'A nuvem já tem dados. Para trocar tudo, confirme a substituição.');
          c.exigir(email, 'admin');
          c.conferirRepetidos(pedido.dados); // antes da cópia "antes da substituição": banco com código repetido nem começa
          if (this.env.DADOS) await backupDoDia(c, this.env.DADOS, new Date(), 'antes-da-substituicao');
        }
        r = c.importar(pedido.dados, email, { substituir: pedido.substituir === true, manterUsuarios: pedido.manterUsuarios === true });
        c.anotarAcesso({ email, rota: pedido.substituir === true ? (pedido.manterUsuarios === true ? 'dados/importar (voltar para um backup)' : 'dados/importar (substituir)') : 'dados/importar (carga inicial)', ...deOnde });
      } else throw new ErroCofre(404, 'Não encontrado.');
      if (request.method === 'POST') await this.depoisDeGravar();
      return resposta(200, r);
    } catch (e) {
      if (e instanceof ErroCofre) return resposta(e.status, { erro: e.message, ...e.extra });
      if (e instanceof ErroAparelho) return resposta(e.status, { erro: e.message });
      console.error(e);
      return resposta(500, { erro: 'Erro no cofre da nuvem.' });
    }
  }
}
