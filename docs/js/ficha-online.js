// Ficha cadastral pela internet, do lado do sistema (pedido do dono em 2026-11-14): monta o que vai para o link de cada
// pessoa da ficha (o formulário com os campos da ficha, o que já se sabe, o imóvel, a proposta e a lista de documentos) e fala
// com a nuvem (rotas /api/ficha-online/… do Worker, nuvem/ficha-publica.mjs). Só existe na nuvem (E.nuvem).
// As funções de montar são puras (tests/ficha-online.test.mjs). Não importe nada de telas/.
import * as C from './calculos.js';
import * as F from './formularios.js';
import * as REC from './recibos.js';
import * as R from './regras.js';

const PJ = 'Pessoa jurídica (empresa)';
/** Pessoas que podem ter link: o interessado e até dois fiadores. */
export const PESSOAS_LINK = ['interessado', 'fiador1', 'fiador2'];
export const nomeDaPessoa = (f, pessoa) => (pessoa === 'interessado' ? f.inquilino_nome : R.fiadorDaFicha(f, pessoa.slice(6)).nome || `fiador ${pessoa.slice(6)}`);

/** Pessoas da ficha que recebem link: o interessado e os fiadores (com fiador na garantia e nenhum preenchido: o fiador 1). */
export function pessoasDaFicha(f) {
  const fiadores = R.fiadoresDaFicha(f).map((x) => `fiador${x.n}`);
  return ['interessado', ...(fiadores.length ? fiadores : R.temFiador(f) ? ['fiador1'] : [])];
}

// campos que a pessoa não preenche no link: os do sistema (tipo, avisos, contato extra), o CEP (sem busca na página) e o solidário
const FORA_DO_LINK = /^(inquilino_tipo|inquilino_whatsapp|responsavel_|solidario_|usar_endereco|representante_usar_endereco|.*cep_busca$)/;
const PARTES_DO_LINK = { 'Interessado (quem vai assinar o contrato)': 'Seus dados', 'Representante da empresa (pessoa física)': 'Representante (quem assina pela empresa)' };
const SEMPRE_OBRIGATORIOS = ['inquilino_nome', 'inquilino_cpf'];

/** O campo vale para esta pessoa? Resolve as condições ligadas ao tipo de inquilino (fixo no link). */
function resolverTipo(c, tipo) {
  const m = c.mostrarSe;
  if (m && m.campo === 'inquilino_tipo') {
    if (!m.valores.includes(tipo)) return null;
    const { mostrarSe, ...resto } = c;
    c = resto;
  }
  if (c.rotuloSe && c.rotuloSe.campo === 'inquilino_tipo') {
    const { rotuloSe, ...resto } = c;
    c = rotuloSe.valor === tipo ? { ...resto, rotulo: rotuloSe.rotulo } : resto;
  }
  return c;
}

const paraLink = (c, obrig = false) => (c.secao
  ? { secao: c.secao, ...(c.mostrarSe ? { mostrarSe: c.mostrarSe } : {}) }
  : { nome: c.nome, rotulo: c.rotulo, tipo: c.tipo === 'cpfcnpj' ? 'cpfcnpj' : c.tipo, ajuda: c.ajuda || '', obrig: obrig || !!c.obrig, largo: !!c.largo,
    ...(c.opcoes ? { opcoes: c.opcoes } : {}), ...(c.mostrarSe ? { mostrarSe: c.mostrarSe } : {}) });

/** Campos do link: os da ficha (dados da pessoa, renda, cônjuge, moradores) ou os do fiador ``fiadorN``. */
export function formularioDaFicha(f, pessoa) {
  const tipo = f.inquilino_tipo || 'Pessoa física';
  if (pessoa === 'interessado') {
    // dados da pessoa (sem o inquilino solidário, que a equipe cuida) e a renda, o cônjuge e quem vai morar
    const pessoaCampos = F.camposDaPessoa(R.CAMPOS_PESSOA).map((c) => resolverTipo(c, tipo)).filter(Boolean)
      .filter((c) => (c.secao ? c.secao !== 'Inquilino solidário' : !c.quebra && !FORA_DO_LINK.test(c.nome)));
    const renda = F.FICHA_RENDA.map((c) => resolverTipo(c, tipo)).filter(Boolean);
    const titulo = (s) => (s === 'Interessado (quem vai assinar o contrato)' && tipo === PJ ? 'Dados da empresa' : PARTES_DO_LINK[s] || s);
    // o nome primeiro; as explicações dos campos da pessoa são para a equipe (contrato, NF): no link, sem elas
    const nome = pessoaCampos.find((c) => c.nome === 'inquilino_nome');
    const ordenados = [pessoaCampos[0], nome, ...pessoaCampos.slice(1).filter((c) => c !== nome)].map((c) => (c.secao ? c : { ...c, ajuda: '' }));
    return [...ordenados, ...renda].map((c) => (c.secao ? { ...c, secao: titulo(c.secao) } : c))
      .map((c) => paraLink(c, SEMPRE_OBRIGATORIOS.includes(c.nome)));
  }
  const n = Number(String(pessoa).replace('fiador', ''));
  const p = `fiador${n}_`;
  const campos = F.FICHA_FIADORES.filter((c) => c.secao ? false : c.nome.startsWith(p) && !/cep_busca$/.test(c.nome))
    // a condição "garantia com fiador" já valeu para ter o link; as explicações são para a equipe (menos a do imóvel)
    .map(({ mostrarSe, ...c }) => (/_imovel_garantia$/.test(c.nome) ? c : { ...c, ajuda: '' }));
  const conjuge = campos.filter((c) => /_(nome_conjuge|cpf_conjuge|rg_conjuge)$/.test(c.nome));
  const casado = { campo: `${p}estado_civil`, valores: ['Casado(a)', 'União estável'] };
  return [{ secao: 'Seus dados' },
    ...campos.filter((c) => !conjuge.includes(c) && !/_imovel_garantia$/.test(c.nome)).map((c) => paraLink(c, [`${p}nome`, `${p}cpf`].includes(c.nome))),
    { secao: 'Cônjuge ou companheiro(a) (também assina a fiança)', mostrarSe: casado },
    ...conjuge.map((c) => paraLink({ ...c, mostrarSe: casado })),
    { secao: 'Imóvel do fiador' },
    ...campos.filter((c) => /_imovel_garantia$/.test(c.nome)).map((c) => paraLink(c))];
}

/** O que já se sabe da pessoa (para vir preenchido no link). */
export const valoresDaFicha = (f, formulario) => Object.fromEntries(formulario.filter((c) => c.nome && f[c.nome] !== undefined && f[c.nome] !== null && f[c.nome] !== '').map((c) => [c.nome, f[c.nome]]));

/** Contexto do link: empresa, nome, imóvel, proposta, reserva e a lista de documentos da pessoa. */
export function contextoDaFicha(d, f, pessoa) {
  const r = REC.montarRecibo(d, 'ficha', { ficha: f });
  const e = r.emitente || {};
  const imoveis = (f.imoveis_ids || []).map((id) => R.buscar(d, 'imoveis', id)).filter(Boolean)
    .map((i) => [R.enderecoCompleto(i), i.bairro, i.cidade ? `${i.cidade}/${i.uf || 'PR'}` : ''].filter(Boolean).join(', '));
  const fiador = pessoa !== 'interessado';
  return {
    empresa: e.razao_social || e.nome || '', nome: nomeDaPessoa(f, pessoa), imovel: imoveis.join(' ou '), tipo: f.inquilino_tipo || 'Pessoa física',
    reserva: !fiador && f.reserva_valor > 0 ? C.reais(f.reserva_valor) : '', de: fiador ? f.inquilino_nome : '',
    proposta: fiador ? [] : REC.itensDaProposta(f),
    documentos: fiador ? R.documentosDoFiador(R.fiadorDaFicha(f, pessoa.slice(6))) : R.documentosDaFicha(f),
    // pessoa física: a página refaz a lista quando a pessoa escolhe o tipo de renda e o estado civil
    ...(!fiador && f.inquilino_tipo !== PJ ? { listas: { ...R.PARTES_DOCUMENTOS_PF, renda: R.DOCUMENTOS_RENDA } } : {}),
    dica: R.DICA_DOCUMENTOS,
  };
}

/** Pasta da ficha na nuvem (onde os documentos mandados pelo link aparecem). */
export const pastaNaNuvem = (f, nomePasta) => `arquivos/Fichas em analise/${nomePasta}`;

/** Corpo do pedido que cria o link. */
export function pedidoDoLink(d, f, pessoa, nomePasta) {
  const formulario = formularioDaFicha(f, pessoa);
  return { ficha_id: f.id, pessoa, pasta: pastaNaNuvem(f, nomePasta), formulario, valores: valoresDaFicha(f, formulario), contexto: contextoDaFicha(d, f, pessoa) };
}

/**
 * Texto do WhatsApp com o link. Ex.: "Olá, Maria! Segue o link da sua ficha cadastral (vale até 21/11/2026): …".
 * ``lembrete``: lembrar quem ainda não terminou; ``faltando``: o que falta (aparece no texto).
 */
export function textoWhatsapp(f, pessoa, link, { lembrete = false, faltando = [] } = {}) {
  const nome = String(nomeDaPessoa(f, pessoa) || '').trim().split(/\s+/)[0];
  const fiador = pessoa !== 'interessado';
  const qual = fiador ? `da ficha do fiador${f.inquilino_nome ? ` (locação de ${f.inquilino_nome})` : ''}` : 'da sua ficha cadastral';
  const validade = C.dataBr(String(link.vence_em).slice(0, 10));
  if (lembrete) {
    return `Olá${nome ? `, ${nome}` : ''}! Passando para lembrar ${qual}${faltando.length ? `. Falta: ${faltando.join('; ')}` : ''}. O link vale até ${validade}: ${link.url}
Se preferir não seguir, é só avisar por lá${!fiador && f.reserva_valor > 0 ? ': a reserva é devolvida por inteiro' : ''}.`;
  }
  return `Olá${nome ? `, ${nome}` : ''}! Segue o link ${qual}, que vale até ${validade}: ${link.url}
Pelo link você preenche os dados, manda os documentos e, depois, a ficha assinada (pelo gov.br ou à mão). Qualquer dúvida, é só responder.`;
}

/** Documentos do link (a lista da pessoa como ela está agora na ficha; com as partes, conforme a renda e o estado civil). */
export function documentosDoLink(f, l) {
  if (l.pessoa !== 'interessado') return R.documentosDoFiador(R.fiadorDaFicha(f, l.pessoa.slice(6)));
  return R.documentosDaFicha(f);
}

/**
 * O que entra na ficha ao "Trazer": os valores preenchidos do último envio (os vazios não apagam o que a ficha tem) e as
 * marcas de documento recebido, pelos documentos que chegaram (ex.: holerite → comprovante de renda; ficha assinada).
 */
export function dadosParaFicha(f, l) {
  const ultimo = (l.respostas || []).at(-1);
  const campos = new Set((l.formulario || []).filter((c) => c.nome).map((c) => c.nome));
  const out = {};
  if (ultimo) for (const [k, v] of Object.entries(ultimo.valores || {})) if (campos.has(k) && v !== null && v !== undefined && v !== '') out[k] = v;
  if (l.pessoa === 'interessado') {
    const docs = (l.arquivos || []).map((a) => a.documento);
    const renda = new Set([...Object.values(R.DOCUMENTOS_RENDA).flat(), ...R.PARTES_DOCUMENTOS_PF.renda_padrao, 'Faturamento dos 3 últimos meses (extratos bancários da empresa em PDF ou declaração do contador)']);
    if (docs.some((x) => /^Documento com foto/.test(x) || /^Contrato social|^Cartão do CNPJ/.test(x))) out.doc_pessoais = true;
    if (docs.some((x) => renda.has(x))) out.doc_renda = true;
    if (docs.some((x) => /residência|endereço da empresa/i.test(x))) out.doc_residencia = true;
    if (docs.some((x) => /assinada/.test(x))) out.doc_ficha = true;
  }
  return out;
}

/** Telefone para o WhatsApp (só números, com o 55). */
export function telefoneWhatsapp(f, pessoa) {
  const t = String((pessoa === 'interessado' ? f.inquilino_telefone : R.fiadorDaFicha(f, pessoa.slice(6)).telefone) || '').replace(/\D/g, '');
  return t.length >= 10 ? (t.length <= 11 ? `55${t}` : t) : '';
}

// ---------------------------------------------------------------------------
// Conversa com a nuvem
// ---------------------------------------------------------------------------
const cfg = { base: 'api/ficha-online/', buscar: (...a) => fetch(...a) };
/** Só para os testes. */
export function configurarFichaOnline(opcoes = {}) { Object.assign(cfg, opcoes); }

async function pedir(caminho, op = {}) {
  let r;
  try {
    r = await cfg.buscar(`${cfg.base}${caminho}`, { cache: 'no-store', credentials: 'same-origin', ...op, headers: { ...(op.method && op.method !== 'GET' ? { 'X-Sistema': 'imoveis' } : {}), ...(op.headers || {}) } });
  } catch { throw new C.ErroUsuario('Sem internet: a ficha pela internet precisa de conexão.'); }
  const tipo = r.headers.get('content-type') || '';
  if (r.redirected || !tipo.includes('json')) throw new C.ErroUsuario('A nuvem não respondeu (entre de novo no sistema e tente outra vez).');
  const dados = await r.json();
  if (!r.ok) throw new C.ErroUsuario(dados.erro || 'A nuvem recusou o pedido.');
  return dados;
}

export const criarLinkNaNuvem = (corpo) => pedir('link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
export const guardarPdfNaNuvem = (fichaId, pessoa, blob) => pedir(`pdf?ficha=${Number(fichaId)}&pessoa=${encodeURIComponent(pessoa)}`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: blob });
export const linksNaNuvem = (fichaId = null) => pedir(`lista${fichaId ? `?ficha=${Number(fichaId)}` : ''}`).then((r) => r.links || []);
export const atualizarLinkNaNuvem = (corpo) => pedir('atualizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
