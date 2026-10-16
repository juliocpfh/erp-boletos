// Contratos de locação gerados a partir de modelos de texto preenchidos pelo cadastro.
// Saída: HTML (imprimir / salvar em PDF) e .docx (Word) com a logo de fundo, a logo na capa e o rodapé das empresas.
import * as C from './calculos.js';
import { MODELOS_PADRAO } from './modelos-contrato.js';

// --------------------------------------------------------------------------
// Números, valores e datas por extenso
// --------------------------------------------------------------------------
const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (r) partes.push(r < 20 ? UNIDADES[r] : DEZENAS[Math.floor(r / 10)] + (r % 10 ? ` e ${UNIDADES[r % 10]}` : ''));
  return partes.join(' e ');
}

/** Número inteiro por extenso (1350 → "mil trezentos e cinquenta"). */
export function numeroPorExtenso(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const grupos = [];
  for (let x = n; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);
  const nomes = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
  const partes = [];
  grupos.forEach((g, i) => {
    if (!g) return;
    let t = i === 1 && g === 1 ? '' : ate999(g);
    if (i > 0) t = `${t} ${nomes[i][g === 1 ? 0 : 1]}`.trim();
    partes.unshift({ t, g, i });
  });
  // "e" antes do último grupo quando ele é menor que 100 ou é centena redonda (mil e quinhentos; mil trezentos e cinquenta)
  return partes.map((p, k) => (k === 0 ? p.t : `${partes[k].i === 0 && (p.g < 100 || p.g % 100 === 0) ? 'e ' : ''}${p.t}`)).join(' ');
}

/** Valor em centavos por extenso: 388889 → "três mil, oitocentos e oitenta e oito reais e oitenta e nove centavos". */
export function reaisPorExtenso(centavos) {
  const r = Math.floor(Math.abs(centavos) / 100);
  const c = Math.abs(centavos) % 100;
  const partes = [];
  if (r) partes.push(`${numeroPorExtenso(r)}${r >= 1000000 && r % 1000000 === 0 ? ' de' : ''} ${r === 1 ? 'real' : 'reais'}`);
  if (c) partes.push(`${numeroPorExtenso(c)} ${c === 1 ? 'centavo' : 'centavos'}`);
  return partes.join(' e ') || 'zero reais';
}

/** "R$ 3.500,00 (três mil e quinhentos reais)" */
export const valorComExtenso = (centavos) => `R$ ${C.reais(centavos, false)} (${reaisPorExtenso(centavos)})`;
/** "30 (trinta)" */
export const numeroComExtenso = (n) => `${n} (${numeroPorExtenso(n)})`;
/** "2% (dois por cento)" */
export function percentualComExtenso(p) {
  const n = Number(p) || 0;
  const inteiro = Math.trunc(n);
  const dec = Math.round((n - inteiro) * 100);
  const extenso = dec ? `${numeroPorExtenso(inteiro)} vírgula ${numeroPorExtenso(dec)}` : numeroPorExtenso(inteiro);
  return `${C.pct(n)} (${extenso} por cento)`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "05 de setembro de 2026" */
export const dataPorExtenso = (iso) => (iso ? `${iso.slice(8, 10)} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}` : '');

const ORD_UNID = ['', 'primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'sétima', 'oitava', 'nona'];
const ORD_DEZ = ['', 'décima', 'vigésima', 'trigésima', 'quadragésima', 'quinquagésima', 'sexagésima', 'septuagésima', 'octogésima', 'nonagésima'];
/** Ordinal feminino: 19 → "décima nona". */
export const ordinalPorExtenso = (n) => [ORD_DEZ[Math.floor(n / 10)], ORD_UNID[n % 10]].filter(Boolean).join(' ');

// --------------------------------------------------------------------------
// Qualificação das partes
// --------------------------------------------------------------------------
// Sexo "Neutro" ou em branco: o texto usa a forma neutra (brasileiro(a), portador(a)...).
const fem = (p) => p.genero === 'Feminino';
const neutro = (p) => !['Masculino', 'Feminino'].includes(p.genero);
const gen = (p, m, f) => (neutro(p) ? `${m}(${f.slice(-1)})` : fem(p) ? f : m);
const flexao = (p) => (neutro(p) ? 'o(a)' : fem(p) ? 'a' : 'o');
/** "solteiro" / "solteira" a partir de "Solteiro(a)". */
const estadoCivil = (p) => {
  const e = String(p.estado_civil || '').toLowerCase();
  if (!e) return '';
  if (e === 'união estável') return 'em união estável';
  return e.replace(/o\(a\)$/, flexao(p));
};
/** "brasileiro" / "brasileira" (qualquer nacionalidade terminada em o/a segue o gênero). */
const nacionalidade = (p) => {
  const n = String(p.nacionalidade || '').trim().toLowerCase();
  if (!n) return '';
  if (/(o|a)$/.test(n) && !/\(/.test(n)) return n.replace(/(o|a)$/, flexao(p));
  return n.replace(/o\(a\)$/, flexao(p));
};

/**
 * Qualificação de uma pessoa física: "NOME, brasileiro, solteiro, gerente de marketing, portador do RG nº X e CPF nº Y,
 * nascido na data de 25 de outubro de 1978, residente e domiciliado à Rua Z".
 */
export function qualificarPessoa(p) {
  const partes = [String(p.nome || '').toLocaleUpperCase('pt-BR'), nacionalidade(p), estadoCivil(p), p.profissao];
  const docs = [p.rg && `RG nº ${p.rg}`, p.cpf && `CPF nº ${p.cpf}`].filter(Boolean).join(' e ');
  if (docs) partes.push(`${gen(p, 'portador', 'portadora')} do ${docs}`);
  if (p.nascimento) partes.push(`${gen(p, 'nascido', 'nascida')} na data de ${dataPorExtenso(p.nascimento)}`);
  if (p.endereco) partes.push(`${gen(p, 'residente e domiciliado', 'residente e domiciliada')} à ${p.endereco}`);
  return partes.filter(Boolean).join(', ');
}

/** Pessoa a partir dos campos com prefixo (inquilino_, solidario_, representante_). */
const pessoaDe = (r, prefixo) => ({ nome: r[`${prefixo}nome`], genero: r[`${prefixo}genero`], nacionalidade: r[`${prefixo}nacionalidade`],
  estado_civil: r[`${prefixo}estado_civil`], profissao: r[`${prefixo}profissao`], rg: r[`${prefixo}rg`], cpf: r[`${prefixo}cpf`],
  nascimento: r[`${prefixo}nascimento`], endereco: r[`${prefixo}endereco`] });

/** Qualificação de uma empresa locadora ou locatária, com o representante. */
function qualificarEmpresa(nome, cnpj, sede, rep, cargo) {
  const partes = [`${String(nome || '').toLocaleUpperCase('pt-BR')}, pessoa jurídica de direito privado`];
  if (cnpj) partes.push(`inscrita no CNPJ sob nº ${cnpj}`);
  if (sede) partes.push(`com sede na ${sede}`);
  let t = partes.join(', ');
  if (rep && rep.nome) t += `, neste ato representada por ${cargo ? `${gen(rep, 'seu', 'sua').replace('seu(a)', 'seu(sua)')} ${cargo}` : 'seu representante legal'}: ${qualificarPessoa(rep)}`;
  return t;
}

// --------------------------------------------------------------------------
// Dados do contrato para o modelo
// --------------------------------------------------------------------------
const ENCARGOS = [['conta_agua', 'água e esgoto'], ['conta_energia', 'energia elétrica'], ['conta_gas', 'gás'], ['conta_internet', 'internet'],
  ['conta_condominio', 'taxas de condomínio'], ['conta_iptu', 'IPTU'], ['conta_seguro', 'seguro incêndio']];
const lista = (itens) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`);

/** Texto do índice do contrato, com o nome e a fonte certos (IPCA é do IBGE; IGP-M, da FGV). */
export function textoIndice(nome) {
  const DESC = {
    IPCA: 'IPCA (Índice Nacional de Preços ao Consumidor Amplo), do IBGE',
    'IGP-M': 'IGP-M (Índice Geral de Preços do Mercado), da Fundação Getulio Vargas',
    INPC: 'INPC (Índice Nacional de Preços ao Consumidor), do IBGE',
    'IGP-DI': 'IGP-DI (Índice Geral de Preços – Disponibilidade Interna), da Fundação Getulio Vargas',
    IVAR: 'IVAR (Índice de Variação de Aluguéis Residenciais), da Fundação Getulio Vargas',
  };
  const n = String(nome || '');
  const partes = n.replace(/\(.*\)/, '').split('/').map((x) => x.trim()).filter(Boolean);
  if (partes.length > 1) {
    const qual = /menor/i.test(n) ? 'o menor' : 'o maior';
    return `${qual} entre o ${partes.map((p) => DESC[p] || p).join(' e o ')}, apurados no período`;
  }
  return `o ${DESC[n] || n || 'índice previsto neste contrato'}`;
}

/**
 * Monta tudo que o modelo usa: campos de texto ({campo}), condições ([se x]) e quantidades (singular/plural).
 * ``extra``: data da assinatura e testemunhas informadas na hora de gerar.
 */
export function dadosDoContrato(d, c, extra = {}) {
  const R = { buscar: (t, id) => d[t].find((x) => x.id === Number(id)) };
  const imovel = R.buscar('imoveis', c.imovel_id) || {};
  const partes = d.participacoes.filter((p) => p.imovel_id === imovel.id).map((p) => R.buscar('emitentes', p.emitente_id)).filter(Boolean);
  const locadoras = partes.length ? partes : d.emitentes.filter((e) => e.ativo);
  const pj = c.inquilino_tipo === 'Pessoa jurídica (empresa)';
  const locatarios = [];
  if (pj) locatarios.push(qualificarEmpresa(c.inquilino_nome, c.inquilino_cpf, c.inquilino_endereco, pessoaDe(c, 'representante_'), c.representante_cargo));
  else locatarios.push(qualificarPessoa(pessoaDe(c, 'inquilino_')));
  const fiadores = d.fiadores.filter((f) => f.contrato_id === c.id && !f.substituido_por_id && (!f.data_saida || f.data_saida >= (extra.data || C.hojeIso())));
  const temFiador = ['Fiador', 'Fiador + depósito'].includes(c.garantia_tipo) && fiadores.length > 0;
  const aluguel = c.aluguel_inicial || 0;
  const pctBonif = c.bonificacao === false ? 0 : (c.desconto_pontualidade_percentual || 0);
  const bonificado = aluguel - C.descontoPorPercentual(aluguel, pctBonif);
  const inquilinoPaga = ENCARGOS.filter(([k]) => (c[k] || (k === 'conta_iptu' ? (c.cobrar_iptu ? 'Por conta do inquilino' : '') : '')) === 'Por conta do inquilino').map(([, t]) => t);
  const inclusos = ENCARGOS.filter(([k]) => c[k] === 'Incluso no aluguel').map(([, t]) => t);
  const endereco = [imovel.endereco, imovel.complemento].filter(Boolean).join(', ');
  const situado = [endereco, imovel.bairro, imovel.cidade ? `${imovel.cidade}/${imovel.uf || 'PR'}` : ''].filter(Boolean).join(', ');
  const caucaoMeses = c.caucao_meses || (c.caucao_valor && aluguel ? Math.round(c.caucao_valor / bonificado) : 0);
  const campos = {
    locadoras: locadoras.map((e) => qualificarEmpresa(e.razao_social || e.nome, e.cnpj, e.endereco_sede || e.endereco, pessoaDe(e, 'representante_'), e.representante_cargo)).join('; e '),
    locatarios: locatarios.join('; e '),
    solidario: c.solidario_nome ? qualificarPessoa(pessoaDe(c, 'solidario_')) : '',
    fiadores: fiadores.map((f) => qualificarPessoa(f)).join('; e '),
    fiadores_imoveis: fiadores.filter((f) => f.imovel_garantia).map((f) => (fiadores.length > 1 ? `${f.nome.toLocaleUpperCase('pt-BR')}: ${f.imovel_garantia}` : f.imovel_garantia)).join('; '),
    inquilino_nome: String(c.inquilino_nome || '').toLocaleUpperCase('pt-BR'),
    objeto: `${c.descricao_objeto || 'o imóvel'}, no endereço ${situado}`,
    imovel_nome: imovel.nome || '',
    endereco_imovel: situado,
    finalidade: c.finalidade === 'Não residencial' ? `não residencial${c.atividade ? `, para a atividade de ${c.atividade}` : ''}` : 'residencial',
    atividade: c.atividade || '',
    prazo_meses: numeroComExtenso(c.prazo_meses || C.mesesDoPrazo(c.vigencia_inicio, c.vigencia_fim) || 0),
    data_inicio: dataPorExtenso(c.vigencia_inicio),
    data_fim: dataPorExtenso(c.vigencia_fim),
    aluguel_bonificado: valorComExtenso(bonificado),
    aluguel_cheio: valorComExtenso(aluguel),
    bonificacao_percentual: percentualComExtenso(pctBonif),
    dia_vencimento: numeroComExtenso(c.dia_vencimento || 10),
    indice: textoIndice(c.indice_correcao),
    multa: percentualComExtenso(c.multa_percentual ?? 2),
    juros: percentualComExtenso(c.juros_mensal_percentual ?? 1),
    tarifa_boleto: c.taxa_boleto ? valorComExtenso(c.taxa_boleto) : '',
    encargos_inquilino: lista([...inquilinoPaga, 'telefone', 'dedetização', 'limpeza de calhas']),
    encargos_inclusos: lista(inclusos),
    caucao_valor: valorComExtenso(c.caucao_valor || 0),
    caucao_meses: numeroComExtenso(caucaoMeses || 0),
    deposito_valor: valorComExtenso(c.deposito_valor || 0),
    deposito_uso: c.deposito_uso || '',
    cidade: imovel.cidade || 'Curitiba',
    data_assinatura: dataPorExtenso(extra.data || C.hojeIso()),
  };
  const condicoes = {
    fiador: temFiador, caucao: c.garantia_tipo === 'Caução', deposito: ['Depósito garantia', 'Fiador + depósito'].includes(c.garantia_tipo),
    seguro_fianca: c.garantia_tipo === 'Seguro fiança', sem_garantia: !c.garantia_tipo || c.garantia_tipo === 'Sem garantia',
    solidario: !!c.solidario_nome, pj, residencial: c.finalidade !== 'Não residencial', nao_residencial: c.finalidade === 'Não residencial',
    bonificacao: pctBonif > 0, iptu_inquilino: inquilinoPaga.includes('IPTU'), seguro_inquilino: inquilinoPaga.includes('seguro incêndio'),
    tem_incluso: inclusos.length > 0, tarifa_boleto: !!c.taxa_boleto, area_comum: !!imovel.area_comum, imovel_fiador: !!campos.fiadores_imoveis,
    varios_fiadores: fiadores.length > 1, varias_locadoras: locadoras.length > 1,
    indeterminado: c.prazo_tipo === 'Indeterminado', testemunhas: !!(extra.testemunhas && extra.testemunhas.some((t) => t.nome)),
  };
  const assinaturas = [
    ...locadoras.map((e) => ({ nome: (e.razao_social || e.nome).toLocaleUpperCase('pt-BR'), doc: e.cnpj ? `CNPJ ${e.cnpj}` : '', papel: 'LOCADORA',
      extra: e.representante_nome ? `${e.representante_nome.toLocaleUpperCase('pt-BR')} – ${(e.representante_cargo || 'representante').toLocaleUpperCase('pt-BR')}` : '' })),
    { nome: campos.inquilino_nome, doc: c.inquilino_cpf ? `${pj ? 'CNPJ' : 'CPF'} ${c.inquilino_cpf}` : '', papel: 'LOCATÁRIO',
      extra: pj && c.representante_nome ? `${c.representante_nome.toLocaleUpperCase('pt-BR')} – REPRESENTANTE` : '' },
    ...(c.solidario_nome ? [{ nome: c.solidario_nome.toLocaleUpperCase('pt-BR'), doc: c.solidario_cpf ? `CPF ${c.solidario_cpf}` : '', papel: 'LOCATÁRIO SOLIDÁRIO' }] : []),
    ...(temFiador ? fiadores.map((f, i) => ({ nome: f.nome.toLocaleUpperCase('pt-BR'), doc: f.cpf ? `CPF ${f.cpf}` : '', papel: fiadores.length > 1 ? `FIADOR ${i + 1}` : 'FIADOR' })) : []),
    ...((extra.testemunhas || []).filter((t) => t.nome).map((t, i) => ({ nome: t.nome.toLocaleUpperCase('pt-BR'), doc: t.cpf ? `CPF ${t.cpf}` : '', papel: `TESTEMUNHA ${i + 1}` }))),
  ];
  // o solidário assina como "LOCATÁRIO SOLIDÁRIO"; no texto o locatário continua no singular
  return { campos, condicoes, quantidades: { locatarios: 1, locadoras: locadoras.length, fiadores: fiadores.length },
    assinaturas, locadoras, rodape: d.emitentes.filter((e) => e.ativo).map((e) => `${(e.razao_social || e.nome).toLocaleUpperCase('pt-BR')} – CNPJ ${e.cnpj || ''}`) };
}

/** Campos que ficaram em branco no cadastro e o contrato usa (para avisar antes de imprimir). */
export function pendenciasDoContrato(d, c) {
  const falta = [];
  const pessoa = (pref, rotulo, cond = true) => {
    if (!cond) return;
    for (const [k, t] of [['estado_civil', 'estado civil'], ['profissao', 'profissão'], ['cpf', 'CPF'], ['endereco', 'endereço']]) if (!c[`${pref}${k}`]) falta.push(`${rotulo}: ${t}`);
  };
  if (c.inquilino_tipo === 'Pessoa jurídica (empresa)') {
    if (!c.inquilino_cpf) falta.push('empresa: CNPJ');
    if (!c.inquilino_endereco) falta.push('empresa: endereço da sede');
    pessoa('representante_', 'representante');
  } else pessoa('inquilino_', 'inquilino');
  pessoa('solidario_', 'solidário', !!c.solidario_nome);
  if (!c.descricao_objeto) falta.push('descrição do imóvel no contrato');
  if (!c.vigencia_inicio || (c.prazo_tipo !== 'Indeterminado' && !c.vigencia_fim)) falta.push('datas do contrato');
  if (!c.indice_correcao) falta.push('índice de correção');
  if (['Fiador', 'Fiador + depósito'].includes(c.garantia_tipo) && !d.fiadores.some((f) => f.contrato_id === c.id && !f.substituido_por_id)) falta.push('fiador');
  const imovel = d.imoveis.find((i) => i.id === c.imovel_id);
  const emp = d.participacoes.filter((p) => imovel && p.imovel_id === imovel.id).map((p) => d.emitentes.find((e) => e.id === p.emitente_id)).filter(Boolean);
  for (const e of (emp.length ? emp : d.emitentes.filter((x) => x.ativo))) {
    if (!e.representante_nome) falta.push(`${e.nome}: representante que assina (em Empresas)`);
    if (!e.endereco_sede) falta.push(`${e.nome}: endereço da sede (em Empresas)`);
  }
  return falta;
}

// --------------------------------------------------------------------------
// Modelo de texto → blocos (título, seção, parágrafo, assinaturas)
// --------------------------------------------------------------------------
/**
 * Linguagem dos modelos:
 * - {campo}: texto do cadastro (ex.: {aluguel_bonificado}). {s:singular|plural} escolhe pela quantidade de locatários;
 *   {l:...|...} pela de locadoras; {f:...|...} pela de fiadores. {cl:nome} cita o número de uma cláusula marcada.
 * - [se condição] ... [senão] ... [fim]: trecho que só entra quando a condição vale ("[se não fiador]" também).
 * - Linha "# Título", "## SEÇÃO", "> texto alinhado à direita". "CLÁUSULA #" numera sozinha ("CLÁUSULA #multa" guarda o nome);
 *   "#i." numera os itens do início. **negrito**. Linha [assinaturas]: quadro de assinaturas.
 */
export function montarContrato(texto, dados) {
  let t = String(texto).replace(/\r\n/g, '\n');
  // condições (das mais internas para fora)
  const cond = (expr) => {
    const e = expr.trim();
    const neg = /^não\s+/i.test(e);
    const nome = e.replace(/^não\s+/i, '').trim();
    const v = nome in dados.condicoes ? dados.condicoes[nome] : !!dados.campos[nome];
    return neg ? !v : v;
  };
  const re = /\[se ([^\]]+)\]((?:(?!\[se )[\s\S])*?)\[fim\]/;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const [sim, nao = ''] = m[2].split('[senão]');
    t = t.slice(0, m.index) + (cond(m[1]) ? sim : nao) + t.slice(m.index + m[0].length);
  }
  // numeração de cláusulas e itens
  let n = 0;
  let item = 0;
  const rotulos = {};
  t = t.replace(/CL[ÁA]USULA #([a-z_]*)/gi, (x, nome) => { n += 1; if (nome) rotulos[nome] = n; return `CLÁUSULA ${n}ª`; });
  t = t.replace(/(^|\n)(\s*\**)#i\./g, (x, a, b) => { item += 1; return `${a}${b}${item}.`; });
  // campos
  const q = dados.quantidades;
  t = t.replace(/\{([slf]):([^|}]*)\|([^}]*)\}/g, (x, k, um, varios) => ((k === 's' ? q.locatarios : k === 'l' ? q.locadoras : q.fiadores) > 1 ? varios : um));
  t = t.replace(/\{cl:([a-z_]+)\}/gi, (x, nome) => (rotulos[nome] ? `${rotulos[nome]}ª (${ordinalPorExtenso(rotulos[nome])})` : `[cláusula ${nome}?]`));
  t = t.replace(/\{([a-z_]+)\}/g, (x, nome) => (nome in dados.campos ? dados.campos[nome] : `[${nome}?]`));
  // blocos
  const blocos = [];
  for (const parte of t.split(/\n\s*\n/)) {
    const linha = parte.replace(/\s*\n\s*/g, ' ').trim();
    if (!linha) continue;
    if (linha === '[assinaturas]') blocos.push({ tipo: 'assinaturas', pessoas: dados.assinaturas });
    else if (linha.startsWith('## ')) blocos.push({ tipo: 'secao', runs: negritos(linha.slice(3)) });
    else if (linha.startsWith('# ')) blocos.push({ tipo: 'titulo', runs: negritos(linha.slice(2)) });
    else if (linha.startsWith('> ')) blocos.push({ tipo: 'direita', runs: negritos(linha.slice(2)) });
    else blocos.push({ tipo: 'paragrafo', runs: negritos(linha) });
  }
  return blocos;
}

/** "texto **negrito** texto" → [{t, b}] */
function negritos(s) {
  return s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p) => (p.startsWith('**') ? { t: p.slice(2, -2), b: true } : { t: p, b: false }));
}

// --------------------------------------------------------------------------
// HTML (tela, imprimir e salvar em PDF)
// --------------------------------------------------------------------------
const escH = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const runsHtml = (runs) => runs.map((r) => (r.b ? `<b>${escH(r.t)}</b>` : escH(r.t))).join('');

/**
 * Marca-d'água (logo bem suave) em todas as páginas. Na tela: um fundo que repete a logo a cada altura de folha A4.
 * Na impressão / PDF: a imagem fica fixa no centro, e o navegador a repete em cada página impressa.
 */
export function marcaDagua(logo) {
  if (!logo) return '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="210" height="297"><image href="${escH(logo)}" x="42" y="98" width="126" height="100" preserveAspectRatio="xMidYMid meet"/></svg>`;
  const fundo = `data:image/svg+xml;base64,${btoa(svg)}`;
  return `<div class="ct-marcas" style="background-image:url('${fundo}')"></div><img class="ct-marca" src="${escH(logo)}" alt="">`;
}

export function contratoHtml(blocos, { logo, rodape }) {
  const corpo = blocos.map((b) => {
    if (b.tipo === 'titulo') return `<h1 class="ct-titulo">${runsHtml(b.runs)}</h1>`;
    if (b.tipo === 'secao') return `<h2 class="ct-secao">${runsHtml(b.runs)}</h2>`;
    if (b.tipo === 'direita') return `<p class="ct-direita">${runsHtml(b.runs)}</p>`;
    if (b.tipo === 'subsecao') return `<h3 class="ct-subsecao">${runsHtml(b.runs)}</h3>`;
    if (b.tipo === 'item') return `<p class="ct-item">${runsHtml(b.runs)}</p>`;
    if (b.tipo === 'tabela') {
      return `<table class="ct-tabela"><tr>${b.cabecalho.map((h) => `<th>${escH(h)}</th>`).join('')}</tr>${b.linhas.map((l, i) => `<tr class="${b.destaques && b.destaques[i] ? 'ct-destaque' : ''}">${l.map((x) => `<td>${escH(x)}</td>`).join('')}</tr>`).join('')}</table>`;
    }
    if (b.tipo === 'fotos') {
      return `<div class="ct-fotos ${b.grande ? 'ct-fotos-grande' : ''}">${b.fotos.map((f) => `<figure><img src="${escH(f.src)}" alt="${escH(f.legenda)}"><figcaption>${escH(f.legenda)}</figcaption></figure>`).join('')}</div>`;
    }
    if (b.tipo === 'assinaturas') {
      return `<div class="ct-assinaturas">${b.pessoas.map((p) => `<div class="ct-assina"><div class="ct-linha"></div><b>${escH(p.nome)}</b>${p.doc ? `<br>${escH(p.doc)}` : ''}${p.extra ? `<br>${escH(p.extra)}` : ''}<br>${escH(p.papel)}</div>`).join('')}</div>`;
    }
    return `<p class="ct-par">${runsHtml(b.runs)}</p>`;
  }).join('');
  return `<div class="contrato">
    ${marcaDagua(logo)}
    <div class="ct-rodape">${rodape.map(escH).join('<br>')}</div>
    ${logo ? `<p class="ct-capa"><img src="${escH(logo)}" alt="Logo"></p>` : ''}
    <table class="ct-pagina"><tbody><tr><td>${corpo}</td></tr></tbody><tfoot><tr><td><div class="ct-espaco-rodape"></div></td></tr></tfoot></table></div>`;
}

// --------------------------------------------------------------------------
// Word (.docx): logo de fundo bem suave, logo na capa, rodapé com as empresas e CNPJs
// --------------------------------------------------------------------------
const escX = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const EMU_CM = 360000;

const runX = (r, extra = '') => `<w:r><w:rPr>${r.b ? '<w:b/>' : ''}${extra}</w:rPr><w:t xml:space="preserve">${escX(r.t)}</w:t></w:r>`;
const parX = (runs, { alinhar = 'both', antes = 0, depois = 120, recuo = 0, rPr = '' } = {}) => `<w:p><w:pPr><w:spacing w:before="${antes}" w:after="${depois}" w:line="300" w:lineRule="auto"/>${recuo ? `<w:ind w:firstLine="${recuo}"/>` : ''}<w:jc w:val="${alinhar}"/></w:pPr>${runs.map((r) => runX(r, rPr)).join('')}</w:p>`;

function imagemX(id, rId, larguraCm, alturaCm, { ancora = false, transparencia = 0 } = {}) {
  const cx = Math.round(larguraCm * EMU_CM);
  const cy = Math.round(alturaCm * EMU_CM);
  const pic = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="logo${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rId}">${transparencia ? `<a:alphaModFix amt="${Math.round((1 - transparencia) * 100000)}"/>` : ''}</a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
  if (!ancora) return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Logo ${id}"/>${pic}</wp:inline></w:drawing></w:r>`;
  return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">`
    + '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV>'
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="Marca ${id}"/><wp:cNvGraphicFramePr/>${pic}</wp:anchor></w:drawing></w:r>`;
}

/**
 * Gera o .docx. ``logo``: { bytes (PNG), marca (PNG já clareado, para o fundo), largura, altura } ou null.
 * Marca-d'água: logo grande no centro de todas as páginas, atrás do texto (a imagem já vem clareada, então fica suave em qualquer leitor).
 */
export async function contratoDocx(JSZip, blocos, { logo, rodape, titulo }) {
  const prop = logo ? logo.altura / logo.largura : 0;
  const corpo = [];
  const midias = []; // fotos (JPEG) do documento
  let idDesenho = 10;
  const foto = (f, larguraCm) => {
    midias.push(f.bytes);
    const n = midias.length;
    return imagemX((idDesenho += 1), `rIdFoto${n}`, larguraCm, larguraCm * (f.altura / f.largura));
  };
  const celula = (conteudo, largura, { cab = false, destaque = false, borda = true } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${largura}" w:type="dxa"/>`
    + `${borda ? '' : '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>'}`
    + `${cab ? '<w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/>' : destaque ? '<w:shd w:val="clear" w:color="auto" w:fill="FEF3C7"/>' : ''}</w:tcPr>${conteudo}</w:tc>`;
  const parCel = (t, { b = false, centro = false, rPr = '' } = {}) => `<w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="260" w:lineRule="auto"/>${centro ? '<w:jc w:val="center"/>' : ''}</w:pPr>${runX({ t, b }, rPr)}</w:p>`;
  if (logo) corpo.push(`<w:p><w:pPr><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr>${imagemX(1, 'rIdLogo', 4, 4 * prop)}</w:p>`);
  for (const b of blocos) {
    if (b.tipo === 'titulo') corpo.push(parX(b.runs.map((r) => ({ ...r, b: true })), { alinhar: 'center', depois: 360, rPr: '<w:u w:val="single"/><w:sz w:val="26"/>' }));
    else if (b.tipo === 'secao') corpo.push(parX(b.runs.map((r) => ({ ...r, b: true })), { alinhar: 'center', antes: 240, depois: 160, rPr: '<w:u w:val="single"/>' }));
    else if (b.tipo === 'direita') corpo.push(parX(b.runs, { alinhar: 'right', antes: 240, depois: 480 }));
    else if (b.tipo === 'subsecao') corpo.push(parX(b.runs.map((r) => ({ ...r, b: true })), { alinhar: 'left', antes: 200, depois: 60 }).replace('<w:pPr>', '<w:pPr><w:keepNext/>'));
    else if (b.tipo === 'item') corpo.push(parX(b.runs, { alinhar: 'left', depois: 40 }));
    else if (b.tipo === 'assinaturas') {
      for (const p of b.pessoas) {
        corpo.push(parX([{ t: '_____________________________________________', b: false }], { alinhar: 'center', antes: 600, depois: 0 }));
        const linhas = [{ t: p.nome, b: true }, ...[p.doc, p.extra, p.papel].filter(Boolean).map((t) => ({ t, b: false }))];
        corpo.push(`<w:p><w:pPr><w:keepLines/><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr>${linhas.map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + runX(l)).join('')}</w:p>`);
      }
    } else if (b.tipo === 'tabela') {
      const total = 9000;
      const larguras = b.cabecalho.length === 4 ? [2900, 1500, 1500, 3100] : [3200, 1800, 4000];
      const grade = `<w:tblGrid>${larguras.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
      const bordas = `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((x) => `<w:${x} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`).join('')}</w:tblBorders>`;
      const linhas = [`<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.cabecalho.map((h, i) => celula(parCel(h, { b: true, rPr: '<w:sz w:val="20"/>' }), larguras[i], { cab: true })).join('')}</w:tr>`,
        ...b.linhas.map((l, n) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${l.map((x, i) => celula(parCel(x, { rPr: '<w:sz w:val="20"/>' }), larguras[i], { destaque: b.destaques && b.destaques[n] })).join('')}</w:tr>`)];
      corpo.push(`<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${bordas}<w:tblLayout w:type="fixed"/></w:tblPr>${grade}${linhas.join('')}</w:tbl>`);
      corpo.push('<w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>');
    } else if (b.tipo === 'fotos') {
      if (b.grande) {
        for (const f of b.fotos) {
          corpo.push(`<w:p><w:pPr><w:spacing w:before="120" w:after="40"/><w:jc w:val="center"/></w:pPr>${foto(f, 12)}</w:p>`);
          corpo.push(parX([{ t: f.legenda, b: false }], { alinhar: 'center', depois: 160, rPr: '<w:i/><w:sz w:val="18"/>' }));
        }
      } else {
        const pares = [];
        for (let i = 0; i < b.fotos.length; i += 2) pares.push(b.fotos.slice(i, i + 2));
        const linhas = pares.map((par) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${[0, 1].map((i) => celula(par[i]
          ? `<w:p><w:pPr><w:spacing w:before="80" w:after="20"/><w:jc w:val="center"/></w:pPr>${foto(par[i], 7.2)}</w:p>${parCel(par[i].legenda, { centro: true, rPr: '<w:i/><w:sz w:val="18"/>' })}`
          : '<w:p/>', 4500, { borda: false })).join('')}</w:tr>`);
        corpo.push(`<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>${linhas.join('')}</w:tbl>`);
      }
    } else corpo.push(parX(b.runs, { recuo: 567 }));
  }
  const sect = '<w:sectPr><w:headerReference w:type="default" r:id="rIdCab"/><w:footerReference w:type="default" r:id="rIdRod"/>'
    + '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1701" w:left="1701" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${corpo.join('')}${sect}</w:body></w:document>`;
  const cabecalho = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}><w:p>${logo ? imagemX(2, 'rIdMarca', 14, 14 * prop, { ancora: true }) : ''}</w:p></w:hdr>`;
  const rodapeX = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${rodape.map((linha, i) => `<w:p><w:pPr>${i === 0 ? '<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="999999"/></w:pBdr>' : ''}<w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">${escX(linha)}</w:t></w:r></w:p>`).join('')}</w:ftr>`;
  const estilos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>';
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
    + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escX(titulo || 'Contrato de locação')}</dc:title></cp:coreProperties>`);
  const img = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rIdEstilos" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '<Relationship Id="rIdCab" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
    + '<Relationship Id="rIdRod" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
    + `${logo ? `<Relationship Id="rIdLogo" Type="${img}" Target="media/logo.png"/>` : ''}`
    + `${midias.map((m, i) => `<Relationship Id="rIdFoto${i + 1}" Type="${img}" Target="media/foto${i + 1}.jpeg"/>`).join('')}</Relationships>`);
  zip.file('word/_rels/header1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + `${logo ? `<Relationship Id="rIdMarca" Type="${img}" Target="media/marca.png"/>` : ''}</Relationships>`);
  zip.file('word/document.xml', documento);
  zip.file('word/styles.xml', estilos);
  zip.file('word/header1.xml', cabecalho);
  zip.file('word/footer1.xml', rodapeX);
  midias.forEach((m, i) => zip.file(`word/media/foto${i + 1}.jpeg`, m));
  if (logo) {
    zip.file('word/media/logo.png', logo.bytes);
    zip.file('word/media/marca.png', logo.marca || logo.bytes);
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** Modelos do banco; na primeira vez, os padrões (Residencial e Não residencial). */
export const modelosDe = (d) => (d.modelos_contrato && d.modelos_contrato.length ? d.modelos_contrato : MODELOS_PADRAO.map((m, i) => ({ id: -(i + 1), ...m })));

// --------------------------------------------------------------------------
// Vistoria e recibo de entrega das chaves (mesmo papel timbrado do contrato)
// --------------------------------------------------------------------------
export const VISTORIA_INTRO = 'O presente relatório acusará as condições do imóvel; a ausência de qualquer observação indicará que está funcionando sem avarias.';
export const VISTORIA_CONDICOES = `Imóvel entregue limpo.
Parte elétrica e hidráulica em perfeito funcionamento, exceto os pontos descritos acima.
Pintura, pisos, portas, janelas, vidros e móveis em bom estado, exceto os pontos descritos acima e/ou registrados nas fotos da vistoria.`;

const p = (t) => ({ tipo: 'paragrafo', runs: negritos(t) });
const it = (t) => ({ tipo: 'item', runs: negritos(t) });
const linhasDe = (texto) => String(texto || '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);

/** Cabeçalho comum: imóvel, locadoras e locatário. */
function cabecalhoDoc(d, c, dados) {
  const imovel = d.imoveis.find((i) => i.id === c.imovel_id) || {};
  const pj = c.inquilino_tipo === 'Pessoa jurídica (empresa)';
  const descr = c.descricao_objeto ? `${c.descricao_objeto.charAt(0).toLocaleUpperCase('pt-BR')}${c.descricao_objeto.slice(1)}, no endereço ` : '';
  return [
    it(`**IMÓVEL:** ${descr}${dados.campos.endereco_imovel || imovel.nome || ''}`),
    it(`**${dados.locadoras.length > 1 ? 'LOCADORAS' : 'LOCADORA'}:** ${dados.locadoras.map((e) => `${(e.razao_social || e.nome).toLocaleUpperCase('pt-BR')}${e.cnpj ? `, CNPJ ${e.cnpj}` : ''}`).join('; ')}`),
    it(`**LOCATÁRIO:** ${dados.campos.inquilino_nome}${c.inquilino_cpf ? `, ${pj ? 'CNPJ' : 'CPF'} ${c.inquilino_cpf}` : ''}${c.solidario_nome ? `; **LOCATÁRIO SOLIDÁRIO:** ${c.solidario_nome.toLocaleUpperCase('pt-BR')}${c.solidario_cpf ? `, CPF ${c.solidario_cpf}` : ''}` : ''}`),
  ];
}

/** Texto do descritivo: "## CÔMODO" vira subtítulo, "- item" vira marcador, as demais linhas ficam como estão. */
export function descritivoBlocos(texto) {
  // item do roteiro que ficou sem preencher ("- Piso e rodapé:") não sai no documento
  return linhasDe(texto).filter((l) => !/^[-•*]\s+[^:]*:$/.test(l)).map((l) => {
    if (l.startsWith('## ')) return { tipo: 'subsecao', runs: negritos(l.slice(3).toLocaleUpperCase('pt-BR')) };
    if (/^[-•*]\s+/.test(l)) return it(`• ${l.replace(/^[-•*]\s+/, '')}`);
    return it(l);
  });
}

/**
 * Vistoria de entrada ou de saída. ``v``: registro da tabela vistorias; ``leitura``: leitura dos relógios do dia (ou null).
 * Assinam as locadoras, o locatário, o solidário e os fiadores.
 */
export const SITUACOES_VISTORIA = ['Novo', 'Ótimo', 'Bom', 'Marcas de uso', 'Avaria', 'Não funciona', 'Não se aplica'];
const GRAU = { Novo: 0, 'Ótimo': 1, Bom: 2, 'Marcas de uso': 3, Avaria: 4, 'Não funciona': 5 };
/** Na saída, o item piorou em relação à entrada? */
export const piorou = (entrada, saida) => GRAU[saida] !== undefined && GRAU[entrada] !== undefined && GRAU[saida] > GRAU[entrada];

export const FOTOS_VISTORIA = [['fachada', 'Fachada'], ['agua', 'Relógio de água'], ['energia', 'Relógio de energia'], ['gas', 'Relógio de gás'], ['disjuntores', 'Quadro de disjuntores']];

/** Modelo de vistoria do imóvel (texto): "## Cômodo" e um item por linha. Linha terminada em ":" (ex.: "Móvel:") fica de fora. */
export function lerModeloVistoria(texto) {
  const comodos = [];
  for (const l of linhasDe(texto)) {
    if (l.startsWith('## ')) comodos.push({ comodo: l.slice(3).trim(), itens: [] });
    else if (!/:$/.test(l)) {
      if (!comodos.length) comodos.push({ comodo: 'Geral', itens: [] });
      comodos.at(-1).itens.push(l.replace(/^[-•*]\s+/, ''));
    }
  }
  return comodos.filter((x) => x.itens.length);
}

/** Itens marcados na vistoria agrupados por cômodo, na ordem em que aparecem. */
function itensPorComodo(itens) {
  const grupos = [];
  for (const x of itens || []) {
    if (!x.situacao && !x.obs) continue;
    let g = grupos.find((y) => y.comodo === x.comodo);
    if (!g) grupos.push((g = { comodo: x.comodo, itens: [] }));
    g.itens.push(x);
  }
  return grupos;
}

/**
 * Vistoria de entrada ou de saída. ``v``: registro da tabela vistorias; ``leitura``: leitura dos relógios do dia (ou null);
 * ``fotos``: { fachada, agua, energia, gas, disjuntores } com { src, bytes, largura, altura } (as que existirem).
 * ``entradaItens``: na saída, os itens da vistoria de entrada (para comparar).
 */
export function vistoriaBlocos(d, c, v, leitura = null, fotos = {}, entradaItens = null) {
  const dados = dadosDoContrato(d, c, { data: v.data });
  const saida = v.tipo === 'Saída';
  const blocos = [{ tipo: 'titulo', runs: negritos(`VISTORIA DE ${saida ? 'SAÍDA' : 'ENTRADA'}`) }, ...cabecalhoDoc(d, c, dados)];
  blocos.push(it(`**DATA DA VISTORIA:** ${dataPorExtenso(v.data)}`));
  blocos.push(p(`${VISTORIA_INTRO} ${v.link_fotos ? `Para mais detalhes, verifique a íntegra das fotos no link compartilhado por e-mail: ${v.link_fotos}` : 'Para mais detalhes, verifique as fotos em anexo.'}`));
  if (fotos.fachada) blocos.push({ tipo: 'fotos', grande: true, fotos: [{ ...fotos.fachada, legenda: 'Fachada do imóvel' }] });
  if (saida && v.comparar_com) blocos.push(p(`Esta vistoria de saída compara o imóvel com a vistoria de entrada de ${dataPorExtenso(v.comparar_com)}. Os itens marcados como **DIFERENÇA** são de responsabilidade do LOCATÁRIO, conforme o contrato.`));
  const chaves = linhasDe(v.chaves);
  if (chaves.length) blocos.push({ tipo: 'secao', runs: negritos(saida ? 'CHAVES E CONTROLES DEVOLVIDOS' : 'CHAVES E CONTROLES ENTREGUES') }, ...chaves.map((l) => it(`• ${l}`)));
  if (leitura) {
    const rel = [['agua', 'Água'], ['energia', 'Energia'], ['gas', 'Gás']].filter(([k]) => leitura[k]).map(([k, t]) => `${t}: ${leitura[k]}`);
    if (rel.length) blocos.push({ tipo: 'secao', runs: negritos('LEITURA DOS RELÓGIOS') }, it(rel.join('   ·   ')));
  }
  const registros = FOTOS_VISTORIA.filter(([k]) => k !== 'fachada' && fotos[k]).map(([k, t]) => ({ ...fotos[k], legenda: t }));
  if (registros.length) blocos.push({ tipo: 'secao', runs: negritos('REGISTROS: RELÓGIOS E QUADRO DE DISJUNTORES') }, { tipo: 'fotos', fotos: registros });
  blocos.push({ tipo: 'secao', runs: negritos('DESCRITIVO DO IMÓVEL') });
  const grupos = itensPorComodo(v.itens);
  const daEntrada = new Map((entradaItens || []).map((x) => [`${x.comodo}|${x.item}`, x.situacao]));
  for (const g of grupos) {
    blocos.push({ tipo: 'subsecao', runs: negritos(g.comodo.toLocaleUpperCase('pt-BR')) });
    if (saida && entradaItens) {
      const linhas = g.itens.map((x) => [x.item, daEntrada.get(`${x.comodo}|${x.item}`) || '—', x.situacao || '—', x.obs || '']);
      blocos.push({ tipo: 'tabela', cabecalho: ['Item', 'Na entrada', 'Na saída', 'Observação'], linhas,
        destaques: g.itens.map((x) => piorou(daEntrada.get(`${x.comodo}|${x.item}`), x.situacao)) });
    } else blocos.push({ tipo: 'tabela', cabecalho: ['Item', 'Situação', 'Observação'], linhas: g.itens.map((x) => [x.item, x.situacao || '—', x.obs || '']) });
  }
  if (grupos.length && linhasDe(v.descritivo).length) blocos.push({ tipo: 'subsecao', runs: negritos('OUTRAS OBSERVAÇÕES') });
  blocos.push(...descritivoBlocos(v.descritivo));
  if (saida && entradaItens && grupos.some((g) => g.itens.some((x) => piorou(daEntrada.get(`${x.comodo}|${x.item}`), x.situacao)))) {
    blocos.push(it('Os itens destacados pioraram em relação à vistoria de entrada.'));
  }
  blocos.push({ tipo: 'secao', runs: negritos('CONDIÇÕES GERAIS') }, ...linhasDe(v.condicoes).map(it));
  if (!saida) {
    blocos.push(it(`O LOCATÁRIO tem ${numeroComExtenso(v.prazo_dias || 3)} dias, a contar desta data, para apontar por escrito qualquer ponto não registrado nesta vistoria; depois disso, ela vale como aceita.`));
    blocos.push(it('O imóvel deve ser devolvido nas mesmas condições descritas neste documento.'));
  }
  blocos.push({ tipo: 'direita', runs: negritos(`${dados.campos.cidade}, ${dados.campos.data_assinatura}.`) });
  blocos.push({ tipo: 'assinaturas', pessoas: dados.assinaturas.filter((a) => !a.papel.startsWith('TESTEMUNHA')) });
  return { blocos, rodape: dados.rodape };
}

/** Recibo de entrega das chaves ao locatário (com espaço para data e hora do recebimento). */
export function reciboChavesBlocos(d, c, chaves, data = '') {
  const dados = dadosDoContrato(d, c, { data: data || undefined });
  const blocos = [{ tipo: 'titulo', runs: negritos('RECIBO DE ENTREGA DAS CHAVES') }, ...cabecalhoDoc(d, c, dados)];
  blocos.push(p(`O LOCATÁRIO declara, para os devidos fins, que neste ato recebe as chaves do imóvel acima descrito, locado conforme o contrato de locação assinado, e que, a partir deste momento, é responsável pela sua utilização e conservação, assumindo as obrigações civis que forem de sua responsabilidade.`));
  blocos.push({ tipo: 'secao', runs: negritos('RELAÇÃO DE CHAVES E CONTROLES ENTREGUES') }, ...(linhasDe(chaves).length ? linhasDe(chaves).map((l) => it(`• ${l}`)) : [it('• ______________________________________________'), it('• ______________________________________________')]));
  blocos.push(it(data ? `Data do recebimento: ${dataPorExtenso(data)}, às ____:____.` : 'Data do recebimento: _____/_____/_________, às ____:____.'));
  blocos.push({ tipo: 'assinaturas', pessoas: dados.assinaturas.filter((a) => ['LOCATÁRIO', 'LOCATÁRIO SOLIDÁRIO', 'LOCADORA'].includes(a.papel)) });
  return { blocos, rodape: dados.rodape };
}
