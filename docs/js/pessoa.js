// Dados de uma pessoa pelo CPF (LGPD, art. 18): onde ela aparece, exportar tudo e, 10 anos depois do fim do último contrato
// (ou da ficha sem contrato), apagar tudo dela de uma vez (decisão do dono, 17/11/2026, DECISOES.md). Puro: sem tela nem pasta.
// A tela fica em telas/pessoa.js; a nuvem limpa o histórico guardado lá ao receber a linha ACAO_APAGAR (nuvem/cofre.mjs).
import { soDigitos } from './c6-comum.js';
import * as C from './calculos.js';
import * as R from './regras.js';

/** Anos de guarda depois do fim do último contrato (Código Civil, art. 205: prazo geral de 10 anos). */
export const ANOS_GUARDA = 10;
/** Ação da linha do histórico que pede à nuvem para apagar também o que ela guarda desses registros (igual em nuvem/cofre.mjs). */
export const ACAO_APAGAR = 'Apagar pessoa (LGPD)';
/** Campos que guardam CPF ou CNPJ. */
const CAMPO_DOC = /(^|_)(cpf|cnpj|cpfcnpj|documento)(_|$)/;
/** Registro que é "da pessoa" (sai inteiro, com o que é ligado a ele) quando o CPF está neste campo. */
const DONO = { contratos: 'inquilino_cpf', fichas: 'inquilino_cpf', fiadores: 'cpf' };
/** Onde a pessoa aparecer impede apagar (vínculo que continua): representante de empresa, usuário do sistema. */
const VINCULO_ATIVO = { emitentes: 'empresa do cadastro (Empresas)', usuarios: 'usuário do sistema' };
const SEM_TABELA = new Set(['arquivos', 'banco', 'listas']);
const SAI = Symbol('sai'); // item de lista que sai (apagarPessoa)

const tabelasDe = (d) => Object.keys(R.TABELAS).filter((t) => !SEM_TABELA.has(t) && Array.isArray(d[t]));
export const documentoValido = (cpf) => [11, 14].includes(soDigitos(cpf).length);

/** Todos os lugares onde o CPF/CNPJ aparece: [{ tabela, id, campo }] (campo com caminho: "fiadores.0.cpf" dentro de listas). */
export function ondeAparece(d, cpf) {
  const alvo = soDigitos(cpf);
  if (!documentoValido(alvo)) return [];
  const out = [];
  const procurar = (v, caminho, achou) => {
    if (Array.isArray(v)) { v.forEach((x, i) => { if (x && typeof x === 'object') procurar(x, `${caminho}${i}.`, achou); }); return; }
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' && CAMPO_DOC.test(k) && soDigitos(x) === alvo) achou(`${caminho}${k}`);
      else if (x && typeof x === 'object') procurar(x, `${caminho}${k}.`, achou);
    }
  };
  for (const t of tabelasDe(d)) for (const r of d[t]) if (r && typeof r === 'object') procurar(r, '', (campo) => out.push({ tabela: t, id: r.id, campo }));
  return out;
}

/** Nome da pessoa (do registro em que ela é dona, ou do campo de nome do papel dela), para a tela. */
function nomeDa(d, achados) {
  const nomes = [];
  for (const a of achados) {
    const r = R.buscar(d, a.tabela, a.id);
    if (!r) continue;
    if (DONO[a.tabela] === a.campo) return r.inquilino_nome || r.nome || '';
    const partes = a.campo.split('.');
    let obj = r; for (const k of partes.slice(0, -1)) obj = obj?.[k];
    const campo = partes.at(-1);
    const pre = campo.replace(/(cpf|cnpj|cpfcnpj|documento)$/, '');
    nomes.push(obj?.[`${pre}nome`] || obj?.[campo.replace(/^cpf_/, 'nome_')] || (partes.length > 1 ? obj?.nome : '') || '');
  }
  return nomes.find(Boolean) || '';
}

/**
 * O que é da pessoa: contratos em que ela é a inquilina (e tudo o que é ligado a eles), fichas dela (e os e-mails delas),
 * registros de fiador e os outros registros em que aparece (como solidário, representante, cônjuge, fiador dentro de uma ficha).
 */
export function partesDaPessoa(d, cpf) {
  const achados = ondeAparece(d, cpf);
  const contratos = new Set(); const fichas = new Set(); const proprios = []; const outros = []; const bloqueios = [];
  for (const a of achados) {
    if (VINCULO_ATIVO[a.tabela]) { bloqueios.push(`aparece como ${VINCULO_ATIVO[a.tabela]}`); continue; }
    if (DONO[a.tabela] === a.campo) {
      if (a.tabela === 'contratos') contratos.add(a.id); else if (a.tabela === 'fichas') fichas.add(a.id);
      proprios.push(a);
    } else outros.push(a);
  }
  const ligados = []; // registros que saem junto com os contratos e fichas dela
  const dela = new Set(proprios.map((x) => `${x.tabela}:${x.id}`));
  for (const t of tabelasDe(d)) {
    for (const r of d[t]) {
      if (!r || dela.has(`${t}:${r.id}`)) continue;
      if ((r.contrato_id && contratos.has(Number(r.contrato_id))) || (t === 'envios_email' && r.ficha_id && fichas.has(Number(r.ficha_id)))) ligados.push({ tabela: t, id: r.id });
    }
  }
  // NF do boleto de um contrato dela (a NF guarda o boleto, não o contrato)
  const boletos = new Set(ligados.filter((x) => x.tabela === 'cobrancas').map((x) => x.id));
  for (const f of d.faturas || []) if (f.origem_tipo === 'cobranca' && boletos.has(Number(f.origem_id)) && !ligados.some((x) => x.tabela === 'faturas' && x.id === f.id)) ligados.push({ tabela: 'faturas', id: f.id });
  const saem = new Set([...proprios, ...ligados].map((x) => `${x.tabela}:${x.id}`));
  // respostas aos comunicados (nome, contatos, IP, aparelho, assinatura): ficam dentro do comunicado, na lista `destinos`, pelo
  // contrato (inquilino) ou pelo fiador; o comunicado continua, só sai o item dela
  // (o solidário e o representante são dela pelo CPF do papel naquele contrato, não pelo dono do contrato: no contrato dela o
  // solidário é outra pessoa, e ela pode ser a solidária do contrato de outro)
  const fiadoresDela = new Set(proprios.filter((x) => x.tabela === 'fiadores').map((x) => Number(x.id)));
  const alvo = soDigitos(cpf);
  const papelDela = (x) => {
    const c = R.buscar(d, 'contratos', x.contrato_id);
    return !!c && soDigitos(c[`${x.tipo}_cpf`] || '') === alvo;
  };
  const destinos = [];
  for (const com of d.comunicados || []) {
    for (const x of com.destinos || []) {
      if (!x) continue;
      const dela = x.tipo === 'fiador' ? fiadoresDela.has(Number(x.fiador_id))
        : (x.tipo === 'solidario' || x.tipo === 'representante') ? papelDela(x)
        : contratos.has(Number(x.contrato_id));
      if (dela) destinos.push({ comunicado_id: com.id, chave: x.chave });
    }
  }
  return { achados, contratos: [...contratos], fichas: [...fichas], proprios, ligados, outros: outros.filter((x) => !saem.has(`${x.tabela}:${x.id}`)), destinos, bloqueios, nome: nomeDa(d, achados) };
}

/**
 * Tudo o que o sistema tem da pessoa, para "Dados desta pessoa": { nome, registros: { tabela: [registro] }, historico, anexos }.
 * Ficam de fora as senhas e sessões (usuários não entram).
 */
export function dadosDaPessoa(d, cpf) {
  const p = partesDaPessoa(d, cpf);
  const registros = {};
  const chaves = new Set();
  for (const x of [...p.proprios, ...p.ligados, ...p.outros]) {
    const k = `${x.tabela}:${x.id}`;
    if (chaves.has(k)) continue;
    const r = R.buscar(d, x.tabela, x.id);
    if (r) { chaves.add(k); (registros[x.tabela] ||= []).push(r); }
  }
  const contratos = new Set(p.contratos);
  const historico = (d.historico || []).filter((h) => chaves.has(`${h.tabela}:${Number(h.registro_id)}`) || (h.contrato_id && contratos.has(Number(h.contrato_id))));
  // comunicados: só o item dela (o aceite), nunca o dos outros; o Histórico do comunicado, também só com o item dela
  const chavesCom = chavesDosComunicados(p);
  for (const com of d.comunicados || []) {
    const minhas = chavesCom.get(com.id);
    if (!minhas) continue;
    (registros.comunicados ||= []).push({ id: com.id, titulo: com.titulo, criado_em: com.criado_em, destinos: (com.destinos || []).filter((x) => x && minhas.has(x.chave)) });
  }
  for (const h of d.historico || []) {
    const minhas = h.tabela === 'comunicados' && chavesCom.get(Number(h.registro_id));
    if (minhas && !historico.includes(h)) historico.push({ ...h, detalhes: destinosNosDetalhes(h.detalhes, (x) => minhas.has(x.chave)) });
  }
  const fichas = new Set(p.fichas);
  const anexos = R.arquivosReferenciados(d).filter((a) => (a.escopo === 'ficha' ? fichas.has(Number(a.id)) : contratos.has(Number(a.id))));
  return { nome: p.nome, achados: p.achados, registros, historico, anexos, partes: p };
}

/** { comunicado_id → Set(chave do item dela) }. */
function chavesDosComunicados(p) {
  const m = new Map();
  for (const x of p.destinos || []) { if (!m.has(x.comunicado_id)) m.set(x.comunicado_id, new Set()); m.get(x.comunicado_id).add(x.chave); }
  return m;
}

/** Cópia dos detalhes de uma linha do Histórico do comunicado com a lista `destinos` filtrada (inclusão: a lista; alteração: de/para). */
function destinosNosDetalhes(det, fica) {
  if (!det || typeof det !== 'object' || !('destinos' in det)) return det;
  const filtrar = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && fica(x)) : v);
  const v = det.destinos;
  const novo = v && typeof v === 'object' && !Array.isArray(v) && ('de' in v || 'para' in v) ? { ...v, de: filtrar(v.de), para: filtrar(v.para) } : filtrar(v);
  return { ...det, destinos: novo };
}

/** Contratos que continuam o contrato `id` pela troca de titular (contrato_anterior_id), em cadeia: [contrato]. */
function sucessores(d, id) {
  const out = []; const vistos = new Set([Number(id)]);
  let fila = [Number(id)];
  while (fila.length) {
    const prox = [];
    for (const c of d.contratos || []) if (c.contrato_anterior_id && fila.includes(Number(c.contrato_anterior_id)) && !vistos.has(c.id)) { vistos.add(c.id); out.push(c); prox.push(c.id); }
    fila = prox;
  }
  return out;
}

/** Data em que termina cada vínculo da pessoa: [{ texto, fim }] (fim null = ainda vale ou sem data). */
function vinculos(d, p) {
  const out = [];
  const contrato = (id) => R.buscar(d, 'contratos', id);
  const fimContrato = (c) => (c && c.data_saida ? c.data_saida : null);
  const nomeC = (c) => (c ? `${c.inquilino_nome || 'contrato'}${c.data_entrada ? ` (entrada em ${C.dataBr(c.data_entrada)})` : ''}` : 'contrato excluído');
  const vistos = new Set();
  const usar = (texto, fim) => { const k = `${texto}|${fim}`; if (!vistos.has(k)) { vistos.add(k); out.push({ texto, fim }); } };
  for (const id of p.contratos) {
    const c = contrato(id); usar(`contrato de ${nomeC(c)}`, fimContrato(c));
    // troca de titular: o contrato novo continua este (vistoria de entrada, garantia e boletos ficam aqui); os 10 anos contam do
    // fim do último da cadeia, e enquanto ele vale não se apaga
    for (const s of sucessores(d, id)) usar(`contrato de ${nomeC(s)}, que continua o dela (troca de titular)`, fimContrato(s));
  }
  for (const id of p.fichas) {
    const f = R.buscar(d, 'fichas', id);
    const feitos = (d.contratos || []).filter((c) => Number(c.ficha_id) === id);
    if (feitos.length) for (const c of feitos) usar(`contrato de ${nomeC(c)}`, fimContrato(c));
    else usar(`ficha de ${f.inquilino_nome || 'interessado'} (${f.situacao || 'sem situação'})`, f.decisao_data || f.data_recebida || null);
  }
  for (const x of [...p.proprios.filter((y) => y.tabela === 'fiadores'), ...p.outros]) {
    const r = R.buscar(d, x.tabela, x.id);
    if (!r) continue;
    if (x.tabela === 'contratos') { usar(`contrato de ${nomeC(r)} (como ${x.campo.replace(/_?(cpf|cnpj|documento)$/, '').replace(/_/g, ' ') || 'parte'})`, fimContrato(r)); continue; }
    if (x.tabela === 'fichas') { usar(`ficha de ${r.inquilino_nome || 'interessado'} (como fiador)`, (d.contratos || []).find((c) => Number(c.ficha_id) === r.id)?.data_saida || r.decisao_data || r.data_recebida || null); continue; }
    if (r.contrato_id) { const c = contrato(r.contrato_id); usar(`${x.tabela === 'fiadores' ? 'fiador do contrato' : `${R.TABELAS[x.tabela] || x.tabela} do contrato`} de ${nomeC(c)}`, fimContrato(c)); continue; }
    usar(`${R.TABELAS[x.tabela] || x.tabela} nº ${r.id}`, r.data || r.data_emissao || r.vencimento || r.decisao_data || null);
  }
  return out;
}

/**
 * Pode apagar tudo da pessoa? Só ANOS_GUARDA anos depois do fim do último vínculo (contrato, fiança ou ficha sem contrato).
 * { pode, libera_em, motivo, vinculos }. Ex.: contrato terminou em 31/03/2026 → libera em 31/03/2036.
 */
export function situacaoParaApagar(d, cpf, hoje = C.hojeIso()) {
  const p = partesDaPessoa(d, cpf);
  if (!p.achados.length) return { pode: false, libera_em: null, motivo: 'Este CPF/CNPJ não aparece em nenhum cadastro.', vinculos: [] };
  if (p.bloqueios.length) return { pode: false, libera_em: null, motivo: `A pessoa ${[...new Set(p.bloqueios)].join(' e ')}: tire de lá antes.`, vinculos: [] };
  const v = vinculos(d, p);
  const aberto = v.find((x) => !x.fim);
  if (aberto) return { pode: false, libera_em: null, motivo: `Ainda vale (ou está sem data de fim): ${aberto.texto}.`, vinculos: v };
  const ultimo = v.map((x) => x.fim).sort().at(-1);
  const libera = C.somarMesesData(ultimo, ANOS_GUARDA * 12);
  return libera <= hoje
    ? { pode: true, libera_em: libera, motivo: '', vinculos: v }
    : { pode: false, libera_em: libera, motivo: `A lei manda guardar ${ANOS_GUARDA} anos depois do fim do último vínculo (${C.dataBr(ultimo)}): só pode apagar a partir de ${C.dataBr(libera)}.`, vinculos: v };
}

/** Pessoas que já podem ser apagadas (10 anos depois do fim do último vínculo): [{ cpf, nome, libera_em, vinculos }]. */
export function pessoasParaApagar(d, hoje = C.hojeIso()) {
  const docs = new Map();
  // todos os papéis: inquilino, interessado da ficha, fiador e também solidário, cônjuge, representante (e o fiador dentro da ficha)
  const juntar = (v) => {
    if (Array.isArray(v)) { v.forEach((x) => { if (x && typeof x === 'object') juntar(x); }); return; }
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' && CAMPO_DOC.test(k)) { const n = soDigitos(x); if (documentoValido(n) && !docs.has(n)) docs.set(n, x); }
      else if (x && typeof x === 'object') juntar(x);
    }
  };
  for (const t of Object.keys(DONO)) for (const r of d[t] || []) if (r && typeof r === 'object') juntar(r);
  const out = [];
  for (const [n, cpf] of docs) {
    const s = situacaoParaApagar(d, n, hoje);
    if (s.pode) out.push({ cpf, nome: partesDaPessoa(d, n).nome, libera_em: s.libera_em, vinculos: s.vinculos });
  }
  return out.sort((a, b) => a.libera_em.localeCompare(b.libera_em) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}

/** Prefixo ou sufixo dos campos da mesma pessoa num registro de outra (solidario_cpf → solidario_*, cpf_conjuge → *_conjuge). */
function camposDoPapel(r, campo) {
  const m = /^(.*_)?(cpf|cnpj|cpfcnpj|documento)(_.*)?$/.exec(campo);
  const pre = m && m[1]; const suf = m && m[3];
  return Object.keys(r).filter((k) => k === campo || (pre && k.startsWith(pre)) || (suf && k.endsWith(suf)));
}

/**
 * Apaga tudo da pessoa (só depois do prazo: situacaoParaApagar): os registros dela e os ligados a eles saem do banco, os campos
 * dela nos registros de outros ficam vazios, e as linhas do histórico desses registros saem. Fica UMA linha no histórico, sem
 * nome nem CPF, com os códigos (a nuvem a usa para apagar também o histórico guardado lá). Devolve { saem, limpos, contratos,
 * fichas } para a tela apagar as pastas (contratos e fichas, antes de sair do banco: `antes`).
 */
export function apagarPessoa(d, cpf, usuario, hoje = C.hojeIso()) {
  const s = situacaoParaApagar(d, cpf, hoje);
  if (!s.pode) throw new C.ErroUsuario(s.motivo || 'Esta pessoa ainda não pode ser apagada.');
  const p = partesDaPessoa(d, cpf);
  const antes = { contratos: p.contratos.map((id) => ({ ...R.buscar(d, 'contratos', id) })), fichas: p.fichas.map((id) => ({ ...R.buscar(d, 'fichas', id) })) };
  const saem = [...p.proprios, ...p.ligados].map((x) => ({ tabela: x.tabela, id: x.id }));
  const chave = new Set(saem.map((x) => `${x.tabela}:${x.id}`));
  // campos dela em registros de outros: ficam vazios (ou sai o item da lista, como o fiador dentro da ficha)
  const limpos = []; const camposLimpos = new Map();
  for (const x of p.outros) {
    const r = R.buscar(d, x.tabela, x.id);
    if (!r) continue;
    const partes = x.campo.split('.');
    if (partes.length > 1) {
      // dentro de uma lista (ex.: fichas.fiadores): o item dela sai da lista (marcado aqui; as marcas saem depois do laço)
      let lista = r; for (const k of partes.slice(0, -2)) lista = lista?.[k];
      const i = Number(partes.at(-2));
      if (Array.isArray(lista) && Number.isInteger(i)) lista[i] = SAI;
      const set = camposLimpos.get(`${x.tabela}:${x.id}`) || new Set(); set.add(partes[0]); camposLimpos.set(`${x.tabela}:${x.id}`, set);
    } else {
      const campos = camposDoPapel(r, x.campo);
      for (const k of campos) r[k] = null;
      const set = camposLimpos.get(`${x.tabela}:${x.id}`) || new Set(); campos.forEach((k) => set.add(k)); camposLimpos.set(`${x.tabela}:${x.id}`, set);
    }
    if (!limpos.some((y) => y.tabela === x.tabela && y.id === x.id)) limpos.push({ tabela: x.tabela, id: x.id });
  }
  const tirarMarcas = (v) => { if (Array.isArray(v)) { for (let i = v.length - 1; i >= 0; i -= 1) if (v[i] === SAI) v.splice(i, 1); else tirarMarcas(v[i]); } else if (v && typeof v === 'object') Object.values(v).forEach(tirarMarcas); };
  for (const x of limpos) tirarMarcas(R.buscar(d, x.tabela, x.id));
  // comunicados: sai o item dela (o aceite com contatos, IP e assinatura); o comunicado fica para os outros
  const chavesCom = chavesDosComunicados(p);
  for (const com of d.comunicados || []) {
    const minhas = chavesCom.get(com.id);
    if (!minhas) continue;
    com.destinos = (com.destinos || []).filter((x) => !(x && minhas.has(x.chave)));
    limpos.push({ tabela: 'comunicados', id: com.id });
  }
  for (const t of new Set(saem.map((x) => x.tabela))) d[t] = d[t].filter((r) => !chave.has(`${t}:${r.id}`));
  const contratos = new Set(p.contratos);
  // histórico: as linhas dos registros que saíram viram uma linha vazia (o tamanho da lista não muda: a nuvem manda só as linhas
  // novas do fim, nuvem.js; lá as linhas somem de vez e os aparelhos baixam de novo); nas dos registros limpos, saem os campos
  // dela. Sempre cópias novas: a tela anterior usa as antigas
  d.historico = (d.historico || []).map((h) => {
      if (chave.has(`${h.tabela}:${Number(h.registro_id)}`) || (h.contrato_id && contratos.has(Number(h.contrato_id)))) {
        return { quando: h.quando, usuario: null, acao: 'Apagado (LGPD)', tabela: null, registro_id: null, descricao: '(dados de uma pessoa apagados)', detalhes: null, imovel_id: null, contrato_id: null };
      }
      const minhas = h.tabela === 'comunicados' && chavesCom.get(Number(h.registro_id));
      if (minhas) return { ...h, detalhes: destinosNosDetalhes(h.detalhes, (x) => !minhas.has(x.chave)) };
      const set = camposLimpos.get(`${h.tabela}:${Number(h.registro_id)}`);
      if (!set || !h.detalhes || typeof h.detalhes !== 'object') return h;
      return { ...h, detalhes: Object.fromEntries(Object.entries(h.detalhes).filter(([k]) => !set.has(k))) };
    });
  R.registrar(d, usuario, ACAO_APAGAR, null, null,
    `Dados de uma pessoa apagados (${ANOS_GUARDA} anos depois do fim do último vínculo): ${saem.length} registro(s) excluído(s) e ${limpos.length} limpo(s). Sem nome nem CPF, como manda a LGPD.`,
    { registros: saem, limpos, contratos: p.contratos, fichas: p.fichas });
  return { saem, limpos, ...antes };
}
