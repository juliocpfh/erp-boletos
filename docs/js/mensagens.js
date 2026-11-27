// Mensagens aos inquilinos (pedido do dono de 26/11/2026): e-mail e WhatsApp escritos pela equipe para um, alguns ou todos os
// inquilinos (e, se quiser, solidários, representantes e fiadores), com campos que o sistema troca pelos dados de cada pessoa
// ({nome}, {imovel}, {aluguel}…). Diferente do comunicado (comunicados.js), não tem link nem resposta: só o texto. Puro (sem tela
// nem nuvem): a tela é telas/mensagens.js.
//
// Tabela `mensagens`: { id, titulo, assunto, texto, whatsapp, email_empresa, telefone_empresa, criado_em, criado_por,
//   destinos: [{ chave ('c<contrato>' | 's<contrato>' | 'r<contrato>' | 'f<fiador>'), tipo, contrato_id, fiador_id, email_em,
//   whats_em, agendado_id, agendado_para }] }. O nome da pessoa não fica guardado na mensagem (vem do cadastro: LGPD).
// Tabela `modelos_mensagem`: { id, nome, assunto, texto, whatsapp } (modelos salvos pela equipe, além dos prontos de MODELOS).
import * as C from './calculos.js';
import * as CM from './comunicados.js';
import { preencherEmail } from './modelos-email.js';
import * as R from './regras.js';

/**
 * Campos que o sistema preenche para cada pessoa, na ordem em que aparecem para escolher. Ex.: {nome} → "Ana".
 * `exemplo` é o que aparece na ajuda (dados fictícios).
 */
export const CAMPOS = [
  { campo: 'nome', rotulo: 'Primeiro nome', exemplo: 'Ana' },
  { campo: 'nome_completo', rotulo: 'Nome completo', exemplo: 'Ana Souza Teste' },
  { campo: 'imovel', rotulo: 'Endereço do imóvel', exemplo: 'Rua Exemplo, 100, apto 101, Centro, Curitiba/PR' },
  { campo: 'imovel_curto', rotulo: 'Nome do imóvel', exemplo: 'Apto 101' },
  { campo: 'locatario', rotulo: 'Inquilino do contrato (para o fiador)', exemplo: 'Ana Souza Teste' },
  { campo: 'aluguel', rotulo: 'Aluguel atual (cheio)', exemplo: 'R$ 2.000,00' },
  { campo: 'aluguel_em_dia', rotulo: 'Aluguel pago em dia (com bonificação)', exemplo: 'R$ 1.800,00' },
  { campo: 'dia_vencimento', rotulo: 'Dia do vencimento', exemplo: '10' },
  { campo: 'inicio_contrato', rotulo: 'Início do contrato', exemplo: '01/03/2025' },
  { campo: 'fim_contrato', rotulo: 'Fim do contrato', exemplo: '28/02/2028' },
  { campo: 'empresas', rotulo: 'Nome da empresa', exemplo: 'ANK e JCK' },
  { campo: 'email_empresa', rotulo: 'E-mail da empresa', exemplo: 'administracao@exemplo.com.br' },
  { campo: 'telefone_empresa', rotulo: 'Telefone da empresa', exemplo: '(41) 3333-0000' },
  { campo: 'hoje', rotulo: 'Data de hoje', exemplo: '26/11/2026' },
];

/** Condições para [se x]…[senão]…[fim]: o papel de quem recebe. */
export const CONDICOES = [
  { condicao: 'inquilino', rotulo: 'é o inquilino' },
  { condicao: 'fiador', rotulo: 'é o fiador' },
  { condicao: 'solidario', rotulo: 'é o inquilino solidário' },
  { condicao: 'representante', rotulo: 'é o representante da empresa' },
];

const FECHO = 'Cordialmente,\n{empresas}\n{telefone_empresa}';

/** Modelos prontos (a equipe muda o texto antes de mandar ou salva o seu em `modelos_mensagem`). */
export const MODELOS = {
  aviso: {
    nome: 'Aviso geral',
    assunto: 'Aviso da administração ({imovel_curto})',
    texto: `Olá, {nome}.

Escreva aqui o aviso.

Qualquer dúvida, estamos à disposição.

${FECHO}`,
    whatsapp: 'Olá, {nome}! Aqui é a {empresas}. Escreva aqui o aviso. Qualquer dúvida, ligue para {telefone_empresa}.',
  },
  manutencao: {
    nome: 'Manutenção ou falta de água/luz',
    assunto: 'Aviso de manutenção ({imovel_curto})',
    texto: `Olá, {nome}.

Avisamos que no dia [data] haverá [manutenção / falta de água / falta de luz] no {imovel_curto}, das [hora] às [hora].

Pedimos desculpas pelo transtorno.

${FECHO}`,
    whatsapp: 'Olá, {nome}! Aqui é a {empresas}. Aviso: no dia [data] haverá [manutenção] no {imovel_curto}, das [hora] às [hora]. Desculpe o transtorno.',
  },
  vencimento: {
    nome: 'Lembrete do vencimento',
    assunto: 'Lembrete: aluguel vence no dia {dia_vencimento}',
    texto: `Olá, {nome}.

Lembramos que o aluguel do {imovel_curto} vence no dia {dia_vencimento}. Pago até o vencimento, o valor é {aluguel_em_dia}.

Se já pagou, desconsidere esta mensagem.

${FECHO}`,
    whatsapp: 'Olá, {nome}! Lembrete da {empresas}: o aluguel do {imovel_curto} vence no dia {dia_vencimento} ({aluguel_em_dia} até o vencimento). Se já pagou, desconsidere.',
  },
  festas: {
    nome: 'Boas festas',
    assunto: 'Boas festas!',
    texto: `Olá, {nome}.

Desejamos a você e à sua família um feliz Natal e um ótimo ano novo!

Obrigado pela confiança.

${FECHO}`,
    whatsapp: 'Olá, {nome}! A {empresas} deseja a você e à sua família um feliz Natal e um ótimo ano novo!',
  },
};

/** Texto "[x]" que a equipe deixou para completar no modelo (ex.: "[data]"): a mensagem não sai com ele. */
export function marcasParaCompletar(texto) {
  const t = String(texto || '').replace(/\[(se [^\]]+|senão|fim|preencher: [a-z_]+)\]/g, '');
  return [...new Set((t.match(/\[[^\]\n]{1,40}\]/g) || []))];
}

/** Campos {x} do texto que o sistema não conhece. Ex.: "Olá, {nomee}" → ['nomee']. */
export function camposDesconhecidos(texto) {
  const conhecidos = new Set(CAMPOS.map((c) => c.campo));
  return [...new Set([...String(texto || '').matchAll(/\{([A-Za-z_]+)\}/g)].map((m) => m[1].toLowerCase()).filter((n) => !conhecidos.has(n)))];
}

/** Quem pode receber: os mesmos do comunicado (contratos ativos: inquilino, solidário, representante e fiadores). */
export const pessoas = (d, hoje = C.hojeIso()) => CM.destinatarios(d, hoje);

/** A pessoa de hoje de um destino da mensagem (nome e contatos do cadastro), ou null se saiu do cadastro. */
export const pessoaDoDestino = (d, x) => CM.pessoaDoDestino(d, x);

/**
 * Campos e condições de uma pessoa (`p`: item de `pessoas`/`pessoaDoDestino`; `msg`: a mensagem, com o e-mail e o telefone da
 * empresa). Ex.: Ana, contrato com aluguel de R$ 2.000,00 e bonificação de 10% → { aluguel: 'R$ 2.000,00', aluguel_em_dia:
 * 'R$ 1.800,00', … }. Campo sem dado fica vazio (o texto mostra "[preencher: x]" e a mensagem não sai).
 */
export function camposDe(d, msg, p, hoje = C.hojeIso()) {
  const e = CM.empresasDoTopo(d);
  const end = CM.enderecoDoImovel(p.imovel);
  const c = p.contrato;
  let aluguel = 0; let emDia = 0;
  if (c) {
    aluguel = R.aluguelAtual(d, c, hoje) || 0;
    emDia = c.bonificacao === false ? aluguel : aluguel - C.descontoPorPercentual(aluguel, R.percentualBonificacao(c));
  }
  const fim = c && c.prazo_tipo !== 'Indeterminado' ? R.fimDoContrato(d, c) : '';
  return {
    campos: {
      nome: String(p.nome || '').trim().split(/\s+/)[0], nome_completo: String(p.nome || '').trim(),
      imovel: end.longo || end.curto, imovel_curto: end.curto || end.longo, locatario: c ? c.inquilino_nome : '',
      aluguel: aluguel ? C.reais(aluguel) : '', aluguel_em_dia: emDia ? C.reais(emDia) : '',
      dia_vencimento: c && c.dia_vencimento ? String(c.dia_vencimento) : '',
      inicio_contrato: c && (c.data_entrada || c.vigencia_inicio) ? C.dataBr(c.data_entrada || c.vigencia_inicio) : '',
      fim_contrato: fim ? C.dataBr(fim) : c && c.prazo_tipo === 'Indeterminado' ? 'prazo indeterminado' : '',
      empresas: e.curto || e.nomes.join(' e '), email_empresa: (msg && msg.email_empresa) || '', telefone_empresa: (msg && msg.telefone_empresa) || '',
      hoje: C.dataBr(hoje),
    },
    condicoes: { inquilino: p.tipo === 'inquilino', fiador: p.tipo === 'fiador', solidario: p.tipo === 'solidario', representante: p.tipo === 'representante' },
  };
}

/** Texto pronto de uma pessoa. */
export const preencher = (texto, dados) => preencherEmail(texto, dados);

/** O que falta no texto já preenchido (campo sem dado no cadastro). Ex.: "Olá, [preencher: telefone_empresa]" → ['telefone_empresa']. */
export const faltando = (texto) => [...new Set([...String(texto || '').matchAll(/\[preencher: ([a-z_]+)\]/g)].map((m) => m[1]))];

/**
 * Nova mensagem para as pessoas escolhidas (`chaves`, de `pessoas`). Sem nome nos destinos (vem do cadastro). Ex.:
 * chaves ['c12', 'f5'] → destinos [{ chave: 'c12', tipo: 'inquilino', contrato_id: 12 }, { chave: 'f5', tipo: 'fiador', … }].
 */
export function novaMensagem(d, { titulo, assunto, texto, whatsapp, email_empresa, telefone_empresa, chaves }, hoje = C.hojeIso()) {
  const escolhidas = new Set(chaves || []);
  const destinos = pessoas(d, hoje).filter((p) => escolhidas.has(p.chave)).map((p) => ({ chave: p.chave, tipo: p.tipo, contrato_id: p.contrato_id, fiador_id: p.fiador_id }));
  if (!destinos.length) throw new C.ErroUsuario('Escolha pelo menos uma pessoa para receber a mensagem.');
  if (!String(texto || '').trim() && !String(whatsapp || '').trim()) throw new C.ErroUsuario('Escreva o texto do e-mail ou a mensagem do WhatsApp.');
  if (String(texto || '').trim() && !String(assunto || '').trim()) throw new C.ErroUsuario('Escreva o assunto do e-mail.');
  for (const t of [assunto, texto, whatsapp]) {
    const x = camposDesconhecidos(t);
    if (x.length) throw new C.ErroUsuario(`O sistema não conhece ${x.map((n) => `{${n}}`).join(', ')}. Use um dos campos da lista (ex.: {nome}).`);
    const m = marcasParaCompletar(t);
    if (m.length) throw new C.ErroUsuario(`Complete o texto antes: ${m.join(', ')}.`);
  }
  return {
    titulo: String(titulo || '').trim() || String(assunto || '').trim() || 'Mensagem aos inquilinos',
    assunto: String(assunto || '').trim(), texto: String(texto || '').trim(), whatsapp: String(whatsapp || '').trim(),
    email_empresa: String(email_empresa || '').trim(), telefone_empresa: String(telefone_empresa || '').trim(),
    criado_em: new Date().toISOString(), destinos,
  };
}

/** Situação de uma pessoa da mensagem. */
export function situacaoDe(x) {
  if (x.email_em && x.whats_em) return { texto: 'E-mail e WhatsApp', cor: 'ok' };
  if (x.email_em) return { texto: 'E-mail enviado', cor: 'ok' };
  if (x.whats_em) return { texto: 'WhatsApp enviado', cor: 'ok' };
  if (x.agendado_id) return { texto: 'E-mail agendado', cor: 'info' };
  return { texto: 'Não enviado', cor: 'neutra' };
}

/** Números do quadro. */
export function resumo(msg) {
  const ds = (msg && msg.destinos) || [];
  return { total: ds.length, email: ds.filter((x) => x.email_em).length, whats: ds.filter((x) => x.whats_em).length, agendados: ds.filter((x) => x.agendado_id && !x.email_em).length, nada: ds.filter((x) => !x.email_em && !x.whats_em && !x.agendado_id).length };
}

/**
 * Fila do "Enviar e-mail a todos" (`canal` 'email') ou do "WhatsApp a todos" ('whats'): quem ainda não recebeu por aquele
 * canal e continua no cadastro. { alvos, sem (no cadastro, mas sem e-mail ou celular), fora (saíram do cadastro) }.
 */
export function filaDoEnvio(d, msg, canal) {
  const ds = ((msg && msg.destinos) || []).filter((x) => (canal === 'email' ? !x.email_em && !x.agendado_id : !x.whats_em));
  const ativos = ds.filter((x) => pessoaDoDestino(d, x));
  const fora = ds.length - ativos.length;
  const tem = (x) => { const p = pessoaDoDestino(d, x); return canal === 'email' ? !!p.email : !!CM.telefoneWhats(p.telefone); };
  return { alvos: ativos.filter(tem), sem: ativos.filter((x) => !tem(x)), fora };
}

/** Marca o envio de uma pessoa (dentro de alterar). `campo`: 'email_em' | 'whats_em'. Sem nome no histórico (LGPD). */
export function marcarEnvio(db, msgId, chave, campo, usuario, quando = new Date().toISOString()) {
  const m = R.buscar(db, 'mensagens', msgId);
  if (!m) return false;
  R.atualizar(db, 'mensagens', m.id, { destinos: m.destinos.map((y) => {
    if (y.chave !== chave) return { ...y };
    const z = { ...y, [campo]: quando };
    if (campo === 'email_em') { delete z.agendado_id; delete z.agendado_para; }
    return z;
  }) }, usuario, `Mensagem "${m.titulo}": ${campo === 'email_em' ? 'e-mail' : 'WhatsApp'} enviado`);
  return true;
}
