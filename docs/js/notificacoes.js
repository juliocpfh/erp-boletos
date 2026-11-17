// Notificação AO inquilino (pedido do dono em 2026-11-17): modelos com o texto pronto, a cláusula do contrato citada, o prazo
// em dias úteis e a data limite. Funções puras (rodam no Node, tests/notificacoes.test.mjs). As gravações (criar, enviar, dar
// baixa, reiterar, gerar a multa no próximo boleto) ficam em regras.js ("Notificações ao inquilino"); a tela em
// telas/notificacoes.js; o PDF para assinar é o tipo `notificacao` de recibos.js; os e-mails, `notificacao_envio` e
// `notificacao_lembrete` (modelos-email.js). Mesma linguagem dos e-mails: {campo} e [se x]...[senão]...[fim].
//
// Base legal: o locatário deve usar o imóvel como combinado e tratá-lo como se fosse seu (Lei 8.245/91, art. 23, II), não
// modificar a forma interna ou externa sem o consentimento prévio e por escrito do locador (art. 23, VI) e cumprir a convenção
// e o regulamento do condomínio (art. 23, X); a infração do contrato permite a rescisão (art. 9º, II); a notificação constitui
// em mora quem não tem prazo certo (Código Civil, art. 397, parágrafo único); a multa contratual (cláusula penal) não passa
// da obrigação principal e o juiz pode reduzi-la se for excessiva (Código Civil, arts. 408 a 413).
import * as C from './calculos.js';
import * as K from './contratos.js';
import { preencherEmail } from './modelos-email.js';
import * as R from './regras.js';

/**
 * Cláusulas do contrato que a notificação cita: o trecho que identifica cada uma no texto do contrato montado e, se não for
 * achada (contrato antigo, modelo editado), o texto que vai no lugar do número.
 */
const CLAUSULAS = {
  obra: { busca: /não poderá modificar a estrutura/i, sem: 'a cláusula do contrato que proíbe modificar o imóvel sem autorização por escrito' },
  conservacao: { busca: /obriga-se por todas as outras/i, sem: 'a cláusula do contrato sobre a conservação do imóvel' },
  finalidade: { busca: /DO OBJETO E SUA FINALIDADE/i, sem: 'o item do contrato sobre o objeto e a finalidade da locação', item: true },
  sublocacao: { busca: /Não é permitida a transferência deste contrato/i, sem: 'a cláusula do contrato sobre cessão e sublocação' },
  multa: { busca: /Fica estipulada a multa no valor/i, sem: 'a cláusula de multa do contrato' },
};

const PRAZO_E_MULTA = `Fica o LOCATÁRIO notificado a, no prazo de {prazo} contados desta notificação, ou seja, até {data_limite}, {providencia}, e a avisar a LOCADORA quando terminar, para a conferência.

Não cumprida a providência no prazo, fica o LOCATÁRIO sujeito à multa prevista no contrato ({clausula_multa}), sem prejuízo da reparação dos danos e das demais medidas previstas no contrato e na lei, inclusive a rescisão da locação por infração contratual (Lei 8.245/91, artigo 9º, inciso II).`;

/**
 * Modelos de notificação: ``chave``, ``nome`` (o assunto, na lista), ``clausula`` (chave de CLAUSULAS citada como {clausula})
 * e ``texto``. O texto já vem com o caso mais comum preenchido (o que aconteceu e o que fazer) para ajustar ao caso real;
 * "[preencher: …]" precisa ser trocado antes de salvar.
 */
export const MODELOS_NOTIFICACAO = [
  {
    chave: 'obra', nome: 'Instalação irregular ou obra sem autorização (ex.: ar-condicionado)', clausula: 'obra',
    texto: `Pela presente, a LOCADORA NOTIFICA o LOCATÁRIO de que foi constatada no imóvel acima a instalação de aparelho de ar-condicionado em desacordo com as regras do imóvel e sem a prévia autorização por escrito da LOCADORA ([preencher: descreva o que foi feito, ex.: furo na fachada e tubulação aparente]).

O contrato de locação proíbe modificar o imóvel ou fazer obras e transformações sem a prévia autorização por escrito da LOCADORA ({clausula}), e a Lei do Inquilinato obriga o locatário a não modificar a forma interna ou externa do imóvel sem esse consentimento (Lei 8.245/91, artigo 23, inciso VI).

${PRAZO_E_MULTA.replace('{providencia}', 'regularizar a instalação, por sua conta, desfazendo o que foi feito de forma irregular e devolvendo o imóvel ao estado anterior, ou apresentar à LOCADORA o pedido de autorização com a forma correta de instalar')}`,
  },
  {
    chave: 'barulho', nome: 'Barulho ou perturbação do sossego', clausula: 'multa',
    texto: `Pela presente, a LOCADORA NOTIFICA o LOCATÁRIO de que recebeu reclamações de barulho e perturbação do sossego vindas do imóvel acima ([preencher: datas, horários e o que foi relatado]).

O locatário deve usar o imóvel como combinado, respeitar os vizinhos e cumprir a convenção e o regulamento do condomínio, quando houver (Lei 8.245/91, artigo 23, incisos II e X; Código Civil, artigo 1.277).

${PRAZO_E_MULTA.replace('{providencia}', 'cessar imediatamente a perturbação e respeitar os horários de silêncio')}`,
  },
  {
    chave: 'condominio', nome: 'Animal ou regras do condomínio', clausula: 'multa',
    texto: `Pela presente, a LOCADORA NOTIFICA o LOCATÁRIO de que foi informada do descumprimento das regras do condomínio no imóvel acima ([preencher: o que aconteceu, ex.: animal solto nas áreas comuns, sujeira deixada pelo animal]).

O locatário deve cumprir integralmente a convenção e o regulamento interno do condomínio (Lei 8.245/91, artigo 23, inciso X), e responde pelas multas que o condomínio aplicar por sua causa.

${PRAZO_E_MULTA.replace('{providencia}', 'corrigir a situação e passar a cumprir as regras do condomínio')}`,
  },
  {
    chave: 'conservacao', nome: 'Sujeira ou falta de conservação', clausula: 'conservacao',
    texto: `Pela presente, a LOCADORA NOTIFICA o LOCATÁRIO de que foi constatada a falta de conservação e limpeza do imóvel acima ([preencher: o que foi visto, ex.: acúmulo de lixo no quintal, calhas entupidas]).

O contrato obriga o LOCATÁRIO a manter o imóvel em boas condições de higiene, limpeza e conservação ({clausula}), e a lei manda tratá-lo com o mesmo cuidado como se fosse seu e reparar os danos que causar (Lei 8.245/91, artigo 23, incisos II e V).

${PRAZO_E_MULTA.replace('{providencia}', 'fazer a limpeza e os reparos necessários, por sua conta')}`,
  },
  {
    chave: 'uso', nome: 'Uso do imóvel diferente do combinado', clausula: 'finalidade',
    texto: `Pela presente, a LOCADORA NOTIFICA o LOCATÁRIO de que foi constatado o uso do imóvel acima de forma diferente da combinada no contrato ([preencher: o que foi visto, ex.: comércio funcionando em imóvel residencial, mais moradores que o combinado]).

O imóvel foi alugado só para a finalidade escrita no contrato ({clausula}), e a lei obriga o locatário a usá-lo para o uso convencionado (Lei 8.245/91, artigo 23, inciso II). Cessão, sublocação ou empréstimo dependem de consentimento prévio e por escrito da LOCADORA (Lei 8.245/91, artigo 13).

${PRAZO_E_MULTA.replace('{providencia}', 'voltar a usar o imóvel somente como combinado no contrato')}`,
  },
  {
    chave: 'generica', nome: 'Outro assunto (texto livre)', clausula: 'multa',
    texto: `Pela presente, a LOCADORA NOTIFICA o LOCATÁRIO de que [preencher: descreva o que aconteceu].

Isso descumpre [preencher: a cláusula do contrato ou a obrigação descumprida], e o locatário deve cumprir todas as obrigações do contrato e da lei (Lei 8.245/91, artigo 23).

${PRAZO_E_MULTA.replace('{providencia}', '[preencher: o que o inquilino deve fazer]')}`,
  },
];

/** Modelo da 2ª, 3ª… notificação do mesmo assunto: cita a anterior, a data dela e o prazo que já passou. */
export const MODELO_REITERACAO = {
  chave: 'reiteracao', nome: 'Nova notificação sobre o mesmo assunto',
  texto: `Pela presente, a LOCADORA REITERA a notificação de {anterior_data}[se anterior_envio] (recebida pelo LOCATÁRIO em {anterior_envio})[fim], sobre {anterior_assunto}, cujo prazo terminou em {anterior_limite} sem que a providência pedida fosse cumprida.

Fica o LOCATÁRIO novamente notificado a, no prazo de {prazo} contados desta notificação, ou seja, até {data_limite}, cumprir integralmente o que foi pedido naquela notificação, e a avisar a LOCADORA quando terminar, para a conferência.

O descumprimento do prazo anterior já sujeita o LOCATÁRIO à multa prevista no contrato ({clausula_multa}). Não cumprida a providência também neste novo prazo, a multa será cobrada no boleto do aluguel, sem prejuízo da reparação dos danos e das demais medidas previstas no contrato e na lei, inclusive a rescisão da locação por infração contratual (Lei 8.245/91, artigo 9º, inciso II).`,
};

export const modeloNotificacao = (chave) => (chave === MODELO_REITERACAO.chave ? MODELO_REITERACAO : MODELOS_NOTIFICACAO.find((m) => m.chave === chave) || null);

/** "10 (dez) dias úteis"; "1 (um) dia útil". */
export const prazoPorExtenso = (dias) => `${dias} (${K.numeroPorExtenso(dias)}) ${dias === 1 ? 'dia útil' : 'dias úteis'}`;

/** Blocos do contrato do inquilino montado com o modelo da finalidade dele (residencial ou não); [] se não der para montar. */
function blocosDoContrato(d, c) {
  try {
    const modelos = K.modelosDe(d);
    const nao = c.finalidade === 'Não residencial';
    const m = modelos.find((x) => (nao ? /não residencial/i : /^residencial/i).test(String(x.nome || ''))) || modelos[0];
    return m ? K.montarContrato(m.texto, K.dadosDoContrato(d, c, { data: c.vigencia_inicio || c.data_entrada || C.hojeIso() })) : [];
  } catch { return []; }
}

/**
 * Número da cláusula no contrato do inquilino (montado pelo modelo do sistema), com o assunto. Ex.: "cláusula 12ª (décima
 * segunda) do contrato"; sem achar: o texto descritivo. ``blocos``: os do contrato (para não montar de novo a cada cláusula).
 */
export function clausulaCitada(d, c, chave, blocos = blocosDoContrato(d, c)) {
  const cl = CLAUSULAS[chave];
  if (!cl) return '';
  for (const b of blocos) {
    const t = (b.runs || []).map((r) => r.t).join('');
    if (!cl.busca.test(t)) continue;
    const n = cl.item ? /^\s*(\d+)\./.exec(t) : /^CLÁUSULA (\d+)ª/.exec(t);
    if (n) return `${cl.item ? 'item' : 'cláusula'} ${n[1]}${cl.item ? '' : 'ª'} do contrato`;
  }
  return cl.sem;
}

/**
 * Campos do texto: { campos, condicoes } para preencherEmail. ``n``: { data, prazo_dias, anterior_id } (a notificação em
 * preparo). Ex.: 17/11/2026 com 10 dias úteis → data_limite "02/12/2026" (20/11 é feriado), prazo "10 (dez) dias úteis".
 */
export function camposDaNotificacao(d, c, n, modelo) {
  const blocos = blocosDoContrato(d, c);
  const limite = R.limiteNotificacao(n.data, n.prazo_dias);
  const ant = n.anterior_id ? R.buscar(d, 'notificacoes', n.anterior_id) : null;
  const campos = {
    data: C.dataBr(n.data), prazo: prazoPorExtenso(n.prazo_dias), data_limite: C.dataBr(limite),
    clausula: modelo && modelo.clausula ? clausulaCitada(d, c, modelo.clausula, blocos) : '',
    clausula_multa: clausulaCitada(d, c, 'multa', blocos),
    anterior_data: ant ? C.dataBr(ant.data) : '', anterior_envio: ant && ant.enviada_em ? C.dataBr(ant.enviada_em) : '',
    anterior_limite: ant ? C.dataBr(ant.data_limite) : '', anterior_assunto: ant ? String(ant.assunto || '').toLocaleLowerCase('pt-BR') : '',
  };
  return { campos, condicoes: { anterior_envio: !!campos.anterior_envio } };
}

/**
 * Texto pronto da notificação para o modelo (ou a reiteração, com ``anterior_id``): { assunto, texto, clausula, data_limite }.
 * ``clausula``: o que fica anotado na notificação (a do assunto e a da multa).
 */
export function textoDoModelo(d, c, n, chave) {
  const modelo = n.anterior_id ? MODELO_REITERACAO : modeloNotificacao(chave) || MODELOS_NOTIFICACAO.at(-1);
  const dados = camposDaNotificacao(d, c, n, modelo);
  const ant = n.anterior_id ? R.buscar(d, 'notificacoes', n.anterior_id) : null;
  const texto = preencherEmail(modelo.texto, dados).replace(/\[preencher: (anterior_[a-z]+)\]/g, '');
  return {
    assunto: ant ? ant.assunto : modelo.nome.replace(/ \(ex\.: [^)]*\)$/, '').replace(/ \(texto livre\)$/, ''),
    texto, clausula: [dados.campos.clausula, dados.campos.clausula_multa].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join('; '),
    data_limite: R.limiteNotificacao(n.data, n.prazo_dias),
  };
}

/** Ainda há "[preencher: …]" no texto? Devolve o 1º trecho (para a mensagem) ou ''. */
export const falta = (texto) => { const m = /\[preencher: [^\]]*\]/.exec(String(texto || '')); return m ? m[0] : ''; };
