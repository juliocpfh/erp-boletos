// Comunicados a todos os inquilinos (pedido do dono em 2026-11-18): modelos, quem recebe (inquilinos e fiadores dos contratos
// ativos), textos do e-mail (com a versão com a logo) e do WhatsApp, situação de cada pessoa e o que muda no cadastro quando
// ela confirma os contatos. Puro (sem tela nem nuvem): a tela é telas/comunicacoes.js; o link público, nuvem/contatos-publico.mjs.
//
// Tabela `comunicados`: { id, modelo, titulo, assunto, texto, whatsapp, aviso, ciencia, prazo, email_empresa, telefone_empresa,
//   criado_em, criado_por, destinos: [{ chave ('c<contrato>' | 'f<fiador>'), tipo, contrato_id, fiador_id, nome, url, link_em,
//   email_em, whats_em, lembrete_em, aberto_em, confirmado_em, resposta, aplicado_em }] }.
import * as C from './calculos.js';
import { preencherEmail } from './modelos-email.js';
import * as R from './regras.js';

export const ASSINATURA_LEGAL = 'Pelo contrato de locação, as comunicações enviadas ao e-mail e ao endereço cadastrados são válidas, e as partes se obrigam a avisar qualquer mudança, inclusive de e-mail.';

/** Modelos prontos (a equipe pode mudar o texto de cada comunicado antes de enviar). */
export const MODELOS = {
  contatos: {
    nome: 'Atualização de contatos e novo e-mail da empresa',
    titulo: 'Novo e-mail da administração e confirmação dos seus contatos',
    assunto: 'Confirme seus contatos ({imovel_curto})',
    texto: `Olá, {nome}.

Aqui é a administração [se fiador]do contrato de locação de {locatario}, do qual você é fiador(a), no imóvel {imovel}[senão]do seu imóvel: {imovel}[fim].

A partir de agora, nossos e-mails (boletos, avisos e documentos) saem do endereço {email_empresa}. Salve esse endereço nos seus contatos e confira também a caixa de spam.

Precisamos que você confirme seus contatos até {prazo}. Leva 2 minutos:

{link}

Pelo contrato, as mensagens enviadas para o e-mail e o telefone cadastrados valem como recebidas. Se você não atualizar, continuaremos usando os contatos que temos hoje.

Atenção: a conta e a chave Pix para pagamento não mudam. Nunca pedimos pagamento em outra conta. Na dúvida, ligue para {telefone_empresa}.

Atenciosamente,
{empresas}`,
    whatsapp: `Olá, {nome}! Aqui é a {empresas}, administração [se fiador]da locação de {locatario} ({imovel_curto})[senão]do seu imóvel ({imovel_curto})[fim].
Nosso novo e-mail é {email_empresa}. Confirme seus contatos até {prazo}: {link}
A conta e o Pix de pagamento não mudam. Na dúvida, ligue para {telefone_empresa}.`,
    lembrete: `Olá, {nome}! Ainda não recebemos a confirmação dos seus contatos ([se fiador]locação de {locatario}, [fim]{imovel_curto}). O prazo vai até {prazo}: {link}
Nosso e-mail é {email_empresa}. A conta e o Pix de pagamento não mudam.`,
    aviso: `A partir de agora, os e-mails da administração (boletos, avisos, notificações, recibos e documentos) saem do endereço {email_empresa}. Confira com a administração qualquer mensagem de outro endereço que diga falar em nosso nome.

Pelo contrato de locação, as comunicações e notificações enviadas ao e-mail e ao endereço cadastrados são válidas, e você se comprometeu a avisar qualquer mudança de endereço, inclusive de e-mail. Por isso pedimos que confirme ou atualize abaixo o seu e-mail e o seu celular.

Até você nos informar outro contato, continuaremos usando os contatos do seu cadastro, e as mensagens enviadas a eles serão consideradas recebidas. Manter esses contatos atualizados e acompanhar as mensagens que chegam por eles, inclusive na caixa de spam, fica sob a sua responsabilidade.

A conta e a chave Pix para pagamento não mudam. Nunca pedimos pagamento em outra conta. Em caso de dúvida, ligue para {telefone_empresa} antes de pagar.`,
    ciencia: 'Li e concordo: os e-mails da administração saem de {email_empresa}; o e-mail e o celular acima são os meus contatos atuais; as mensagens enviadas a eles valem como recebidas; e vou avisar a administração se eles mudarem.',
  },
};

/** Telefone para mostrar. Ex.: "41999990000" → "(41) 99999-0000". */
export function telefoneBr(t) {
  const n = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return String(t || '');
}
/** Telefone para o WhatsApp (só números, com o 55); vazio se não dá. */
export function telefoneWhats(t) {
  const n = String(t || '').replace(/\D/g, '');
  return n.length >= 10 ? (n.length <= 11 ? `55${n}` : n) : '';
}

/** Empresas que aparecem no topo (as ativas): nomes, CNPJs e a cidade da sede. */
export function empresasDoTopo(d) {
  const ativas = (d.emitentes || []).filter((e) => e.ativo !== false);
  const cidade = (ativas.find((e) => e.cidade_documentos) || {}).cidade_documentos || '';
  const uf = (ativas.find((e) => e.uf_sede) || {}).uf_sede || '';
  return {
    nomes: ativas.map((e) => String(e.razao_social || e.nome || '').trim()).filter(Boolean),
    cnpjs: ativas.map((e) => String(e.cnpj || '').trim()).filter(Boolean),
    cidade: [cidade, uf].filter(Boolean).join('/'),
    curto: ativas.map((e) => String(e.nome || e.razao_social || '').trim()).filter(Boolean).join(' e '),
  };
}

/**
 * Quem recebe: o inquilino de cada contrato ativo e os fiadores atuais dele. Ordem: imóvel, depois inquilino antes do fiador.
 * Ex.: contrato 12 (Ana, Apto 101) com o fiador 5 (Diego) → [{ chave: 'c12', tipo: 'inquilino' }, { chave: 'f5', tipo: 'fiador' }].
 */
export function destinatarios(d, hoje = C.hojeIso()) {
  const lista = [];
  const ativos = d.contratos.filter((c) => R.contratoAtivo(c, hoje))
    .map((c) => ({ c, i: c.imovel_id ? R.buscar(d, 'imoveis', c.imovel_id) : null }))
    .sort((a, b) => String(a.i ? a.i.nome : '~').localeCompare(String(b.i ? b.i.nome : '~'), 'pt-BR'));
  for (const { c, i } of ativos) {
    lista.push({ chave: `c${c.id}`, tipo: 'inquilino', contrato_id: c.id, fiador_id: null, nome: c.inquilino_nome, email: c.inquilino_email || '', telefone: c.inquilino_telefone || '', whatsapp: !!c.inquilino_whatsapp, imovel: i, contrato: c });
    for (const f of R.fiadoresDo(d, c.id, hoje)) {
      lista.push({ chave: `f${f.id}`, tipo: 'fiador', contrato_id: c.id, fiador_id: f.id, nome: f.nome, email: f.email || '', telefone: f.telefone || '', whatsapp: false, imovel: i, contrato: c });
    }
  }
  return lista;
}

/** Endereço do imóvel por extenso (rua, complemento, bairro, cidade/UF) e o curto (o nome do imóvel). */
export function enderecoDoImovel(i) {
  if (!i) return { longo: '', curto: '' };
  const cidade = [i.cidade, i.uf].filter(Boolean).join('/');
  return { longo: [R.enderecoCompleto(i), i.bairro, cidade].filter(Boolean).join(', '), curto: i.nome || R.enderecoCompleto(i) };
}

/** Campos e condições para preencher os textos de um destinatário (`p`: item de destinatarios; `com`: o comunicado). */
export function camposDe(d, com, p, link = '') {
  const e = empresasDoTopo(d);
  const end = enderecoDoImovel(p.imovel);
  return {
    campos: {
      nome: String(p.nome || '').trim().split(/\s+/)[0], nome_completo: p.nome, imovel: end.longo || end.curto, imovel_curto: end.curto || end.longo,
      locatario: p.contrato ? p.contrato.inquilino_nome : '', prazo: C.dataBr(com.prazo), link,
      email_empresa: com.email_empresa, telefone_empresa: com.telefone_empresa, empresas: e.curto || e.nomes.join(' e '),
    },
    condicoes: { fiador: p.tipo === 'fiador' },
  };
}
export const preencher = (texto, dados) => preencherEmail(texto, dados);

/** Contexto mandado para o link (o que a página mostra). `logo`: data URL já reduzida (ou ''). */
export function contextoDoLink(d, com, p, logo = '') {
  const e = empresasDoTopo(d);
  const dados = camposDe(d, com, p);
  const c = p.contrato;
  return {
    empresas: e.nomes, cnpjs: e.cnpjs, cidade: e.cidade, logo, titulo: com.titulo,
    nome: p.nome, tipo: p.tipo, imovel: dados.campos.imovel, desde: c && c.data_entrada ? C.compBr(String(c.data_entrada).slice(0, 7)) : '',
    locatario: p.tipo === 'fiador' && c ? c.inquilino_nome : '', email: p.email, telefone: p.telefone, whatsapp: !!p.whatsapp,
    prazo: com.prazo, aviso: preencher(com.aviso, dados), ciencia: preencher(com.ciencia, dados),
    email_empresa: com.email_empresa, telefone_empresa: com.telefone_empresa,
  };
}

/** Endereço do link para cada canal (o canal vai antes do "#": a página anota por onde a pessoa abriu). */
export function linkDoCanal(url, canal) {
  const s = String(url || '');
  const i = s.indexOf('#');
  if (i < 0) return s;
  return `${s.slice(0, i)}?c=${canal === 'whatsapp' ? 'w' : 'e'}${s.slice(i)}`;
}

/** Situação de uma pessoa do comunicado. Ex.: confirmou → { texto: 'Confirmou', cor: 'ok' }. */
export function situacaoDe(x) {
  if (!x) return { texto: 'Sem link', cor: 'neutra', peso: 4 };
  if (x.confirmado_em) return { texto: 'Confirmou', cor: 'ok', peso: 0 };
  if (x.aberto_em) return { texto: 'Abriu, não confirmou', cor: 'aviso', peso: 2 };
  if (x.email_em || x.whats_em) return { texto: 'Não abriu', cor: 'perigo', peso: 1 };
  return { texto: 'Não enviado', cor: 'neutra', peso: 3 };
}

/** Números do quadro. */
export function resumo(com) {
  const ds = com.destinos || [];
  return {
    total: ds.length, confirmaram: ds.filter((x) => x.confirmado_em).length,
    abriram: ds.filter((x) => x.aberto_em && !x.confirmado_em).length,
    naoAbriram: ds.filter((x) => !x.aberto_em && !x.confirmado_em && (x.email_em || x.whats_em)).length,
    naoEnviados: ds.filter((x) => !x.email_em && !x.whats_em && !x.confirmado_em).length,
    mudaram: ds.filter((x) => x.resposta && x.resposta.mudou).length,
  };
}

/**
 * O que muda no cadastro com a resposta: { tabela, id, dados } ou null (nada mudou). Ex.: o inquilino do contrato 12 trocou o
 * celular → { tabela: 'contratos', id: 12, dados: { inquilino_telefone: '(41) 98888-0000', inquilino_whatsapp: true } }.
 */
export function mudancaNoCadastro(d, x) {
  const r = x && x.resposta;
  if (!r) return null;
  const tel = telefoneBr(r.telefone);
  const mesmoTel = (a) => String(a || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '') === String(r.telefone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (x.tipo === 'fiador') {
    const f = R.buscar(d, 'fiadores', x.fiador_id);
    if (!f) return null;
    const dados = {};
    if (String(f.email || '').trim().toLowerCase() !== r.email) dados.email = r.email;
    if (!mesmoTel(f.telefone)) dados.telefone = tel;
    return Object.keys(dados).length ? { tabela: 'fiadores', id: f.id, dados } : null;
  }
  const c = R.buscar(d, 'contratos', x.contrato_id);
  if (!c) return null;
  const dados = {};
  if (String(c.inquilino_email || '').trim().toLowerCase() !== r.email) dados.inquilino_email = r.email;
  if (!mesmoTel(c.inquilino_telefone)) dados.inquilino_telefone = tel;
  if (!!c.inquilino_whatsapp !== !!r.whatsapp) dados.inquilino_whatsapp = !!r.whatsapp;
  return Object.keys(dados).length ? { tabela: 'contratos', id: c.id, dados } : null;
}

const soNumeros = (v) => String(v || '').replace(/\D/g, '');

/**
 * Outros cadastros ativos da mesma pessoa (mesmo CPF/CNPJ): os outros contratos ativos do inquilino, ou os outros contratos
 * ativos em que o fiador é fiador. Ex.: Ana (CPF 529.982.247-25) aluga os contratos 12 e 15; a resposta do link do 12 →
 * [{ tipo: 'inquilino', contrato_id: 15 }]. Sem CPF no cadastro, nada (não dá para saber se é a mesma pessoa).
 */
export function mesmaPessoaEmOutrosContratos(d, x, hoje = C.hojeIso()) {
  if (x.tipo === 'fiador') {
    const f = R.buscar(d, 'fiadores', x.fiador_id);
    const doc = f ? soNumeros(f.cpf) : '';
    if (!doc) return [];
    return (d.fiadores || []).filter((g) => g.id !== f.id && soNumeros(g.cpf) === doc && g.contrato_id)
      .filter((g) => { const c = R.buscar(d, 'contratos', g.contrato_id); return c && R.contratoAtivo(c, hoje) && R.fiadoresDo(d, c.id, hoje).some((h) => h.id === g.id); })
      .map((g) => ({ tipo: 'fiador', contrato_id: g.contrato_id, fiador_id: g.id }));
  }
  const c = R.buscar(d, 'contratos', x.contrato_id);
  const doc = c ? soNumeros(c.inquilino_cpf) : '';
  if (!doc) return [];
  return d.contratos.filter((o) => o.id !== c.id && soNumeros(o.inquilino_cpf) === doc && R.contratoAtivo(o, hoje))
    .map((o) => ({ tipo: 'inquilino', contrato_id: o.id, fiador_id: null }));
}

/** A pessoa do comunicado ainda está no cadastro e ativa hoje (contrato ativo; o fiador, ainda fiador dele). */
export function destinoAtivo(d, x, hoje = C.hojeIso()) {
  const c = x && R.buscar(d, 'contratos', x.contrato_id);
  if (!c || !R.contratoAtivo(c, hoje)) return false;
  if (x.tipo !== 'fiador') return true;
  return R.fiadoresDo(d, c.id, hoje).some((f) => f.id === x.fiador_id);
}

/**
 * Junta a lista da nuvem ao comunicado (dentro de alterar): abertura, confirmação e resposta; quem confirmou tem o cadastro
 * atualizado (uma vez; o antigo fica no histórico). Devolve quantos cadastros mudaram.
 */
export function juntarRespostas(db, comId, links, usuario) {
  const com = R.buscar(db, 'comunicados', comId);
  if (!com) return 0;
  const porChave = new Map((links || []).map((l) => [l.destino, l]));
  let mudaram = 0;
  const destinos = (com.destinos || []).map((x) => {
    const l = porChave.get(x.chave);
    if (!l) return { ...x };
    const novo = { ...x, aberto_em: l.aberto_em || x.aberto_em || null, aberturas: l.aberturas || x.aberturas || [] };
    if (l.resposta && l.resposta.em !== (x.resposta && x.resposta.em)) {
      novo.confirmado_em = l.resposta.em;
      novo.resposta = { ...l.resposta };
      novo.aplicado_em = null;
    }
    return novo;
  });
  for (const x of destinos) {
    if (!x.resposta || x.aplicado_em) continue;
    // o mesmo CPF em outro contrato ativo (quem aluga dois imóveis, o fiador de dois contratos) recebe os mesmos contatos
    const ms = [x, ...mesmaPessoaEmOutrosContratos(db, x)].map((y) => mudancaNoCadastro(db, { ...y, resposta: x.resposta })).filter(Boolean);
    x.resposta = { ...x.resposta, mudou: ms.length > 0 };
    for (const m of ms) {
      R.atualizar(db, m.tabela, m.id, m.dados, usuario, `${x.nome}: contatos confirmados pelo link do comunicado "${com.titulo}"`);
      mudaram += 1;
    }
    x.aplicado_em = new Date().toISOString();
  }
  if (JSON.stringify(destinos) !== JSON.stringify(com.destinos)) R.atualizar(db, 'comunicados', com.id, { destinos }, usuario, `Comunicado "${com.titulo}": respostas atualizadas`);
  return mudaram;
}

/** Novo comunicado a partir de um modelo, com todos os destinatários de hoje. */
export function novoComunicado(d, modelo, { prazo, email_empresa, telefone_empresa }, hoje = C.hojeIso()) {
  const m = MODELOS[modelo];
  if (!m) throw new C.ErroUsuario('Modelo de comunicado não encontrado.');
  return {
    modelo, titulo: m.titulo, assunto: m.assunto, texto: m.texto, whatsapp: m.whatsapp, lembrete: m.lembrete, aviso: m.aviso, ciencia: m.ciencia,
    prazo, email_empresa, telefone_empresa, criado_em: new Date().toISOString(),
    destinos: destinatarios(d, hoje).map((p) => ({ chave: p.chave, tipo: p.tipo, contrato_id: p.contrato_id, fiador_id: p.fiador_id, nome: p.nome })),
  };
}

/** O destinatário de hoje (com contrato, imóvel e contatos atuais) de uma pessoa do comunicado. */
export function pessoaDoDestino(d, x) {
  const c = R.buscar(d, 'contratos', x.contrato_id);
  if (!c) return null;
  const i = c.imovel_id ? R.buscar(d, 'imoveis', c.imovel_id) : null;
  if (x.tipo === 'fiador') {
    const f = R.buscar(d, 'fiadores', x.fiador_id);
    if (!f) return null;
    return { ...x, nome: f.nome, email: f.email || '', telefone: f.telefone || '', whatsapp: false, imovel: i, contrato: c };
  }
  return { ...x, nome: c.inquilino_nome, email: c.inquilino_email || '', telefone: c.inquilino_telefone || '', whatsapp: !!c.inquilino_whatsapp, imovel: i, contrato: c };
}

const escH = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Versão do e-mail com a logo e a identificação da empresa (o texto simples vai junto, para quem não abre HTML).
 * Parágrafo que é só o link vira botão; o que começa por "Atenção" vira a caixa amarela. `logo`: true se vai a imagem cid:logo.
 */
export function htmlDoEmail(texto, { empresas = [], cnpjs = [], cidade = '', link = '', logo = false, botao = 'Confirmar meus contatos', rodape = '' } = {}) {
  const pars = String(texto || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const corpo = pars.map((p) => {
    if (link && p === link) return `<p style="text-align:center;margin:22px 0"><a href="${escH(link)}" style="background:#1e3a8a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold;display:inline-block">${escH(botao)}</a></p>`;
    if (/^Atenção/i.test(p)) return `<p style="background:#fff7e6;border-left:4px solid #b45309;padding:10px 12px;color:#5c3b00">${escH(p).replace(/\n/g, '<br>')}</p>`;
    return `<p style="margin:0 0 14px">${escH(p).replace(/\n/g, '<br>')}</p>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f5f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #d9dde3;border-radius:10px;font-family:Arial,Helvetica,sans-serif;color:#1f2933;font-size:15px;line-height:1.55">
<tr><td style="background:#e8edfb;padding:16px 20px;border-radius:10px 10px 0 0">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo ? '<td style="padding-right:14px"><img src="cid:logo" alt="Logo" style="max-height:56px;max-width:140px;display:block"></td>' : ''}
<td><div style="font-weight:bold;color:#1e3a8a">${escH(empresas.join(' e '))}</div>${cnpjs.length ? `<div style="font-size:12px;color:#1e3a8a">CNPJ ${escH(cnpjs.join(' · '))}${cidade ? ` · ${escH(cidade)}` : ''}</div>` : ''}</td></tr></table></td></tr>
<tr><td style="padding:20px">${corpo}</td></tr>
<tr><td style="padding:12px 20px;border-top:1px solid #d9dde3;font-size:12px;color:#616e7c">${escH(rodape || [empresas.join(' e '), cnpjs.length ? `CNPJ ${cnpjs.join(' · ')}` : '', cidade].filter(Boolean).join(' · '))}</td></tr>
</table></td></tr></table></body></html>`;
}
