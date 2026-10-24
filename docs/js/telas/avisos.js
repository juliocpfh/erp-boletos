// Avisos antes de salvar: valores fora do padrão que pedem "Salvar assim mesmo?" (datas, aluguel, endereço, telefone,
// e-mail, leituras, seguro, IPTU, lançamentos repetidos). Cada cadastro liga o seu em CADASTROS.<tabela>.conferir.
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import * as F from '../formularios.js';
import * as R from '../regras.js';
import { CADASTROS, fiadoresMudancas } from './cadastros.js';
import { buscar, d } from './comum.js';

/** Avisos antes de salvar: valores fora do padrão. Quem confirma, salva; quem cancela, corrige. */
export function confirmarAvisos(avisos) {
  if (avisos.length && !confirm(`Confira antes de salvar:\n\n• ${avisos.join('\n• ')}\n\nSalvar assim mesmo?`)) {
    throw new Error('Nada foi salvo. Corrija o que precisar e salve de novo.');
  }
}

const DIAS_FUTURO = 60;

const FORA_DO_PADRAO = 0.3;

/** Avisos do cadastro do inquilino: aluguel muito diferente do anterior, imóvel ainda ocupado, entrada muito no futuro. */
export function conferirContrato(dados, r, q) {
  const out = [];
  const imovelId = r ? r.imovel_id : Number(dados.imovel_id || q.vincular || q.imovel) || null;
  const anterior = imovelId ? d().contratos.filter((x) => x.imovel_id === imovelId && (!r || x.id !== r.id))
    .sort((a, b) => String(b.data_entrada || '').localeCompare(String(a.data_entrada || '')))[0] : null;
  const base = r ? r.aluguel_inicial : anterior ? R.aluguelAtual(d(), anterior) : null;
  if (base && dados.aluguel_inicial && Math.abs(dados.aluguel_inicial - base) / base > FORA_DO_PADRAO && (!r || dados.aluguel_inicial !== r.aluguel_inicial)) {
    const p = Math.round(((dados.aluguel_inicial - base) / base) * 100);
    out.push(`Aluguel de ${reais(dados.aluguel_inicial)} está ${Math.abs(p)}% ${p > 0 ? 'acima' : 'abaixo'} ${r ? 'do valor anterior' : `do aluguel atual do inquilino anterior (${anterior.inquilino_nome})`} de ${reais(base)}.`);
  }
  if (imovelId && dados.data_entrada) {
    const ocupando = d().contratos.find((x) => x.imovel_id === imovelId && (!r || x.id !== r.id) && x.id !== dados.contrato_anterior_id && x.data_entrada && x.data_entrada < dados.data_entrada
      && (x.data_saida ? x.data_saida >= dados.data_entrada : x.ativo !== false));
    if (ocupando) out.push(`${ocupando.inquilino_nome} ainda está neste imóvel em ${dataBr(dados.data_entrada)}${ocupando.data_saida ? ` (sai em ${dataBr(ocupando.data_saida)})` : ' (sem data de saída)'}.`);
  }
  if (dados.data_entrada && dados.data_entrada > C.somarDias(C.hojeIso(), DIAS_FUTURO)) out.push(`A entrada (${dataBr(dados.data_entrada)}) está a mais de ${DIAS_FUTURO} dias no futuro.`);
  if (dados.vigencia_inicio && dados.data_entrada && Math.abs(C.diasEntre(dados.vigencia_inicio, dados.data_entrada)) > 31) out.push(`O início do contrato (${dataBr(dados.vigencia_inicio)}) e a entrada (${dataBr(dados.data_entrada)}) estão a mais de um mês de distância.`);
  const antigo = r ? CADASTROS.contratos.valores(r) : null;
  for (const [prefixo, quem] of pessoasDoContrato(dados)) out.push(...conferirPessoa(dados, antigo, prefixo, quem));
  const doc = F.soDigitos(dados.inquilino_cpf || '');
  for (const f of [...fiadoresMudancas.novos, ...fiadoresMudancas.alterados]) {
    out.push(...conferirPessoa(f, f.id ? buscar('fiadores', f.id) : null, '', `do fiador ${f.nome}`));
    if (doc && F.soDigitos(f.cpf || '') === doc) out.push(`O CPF do fiador ${f.nome} é o mesmo do inquilino.`);
  }
  return out;
}

/** Avisos ao alterar um boleto: vencimento fora do dia do contrato. */
export function conferirBoleto(dados, r) {
  const out = [];
  const c = buscar('contratos', r.contrato_id);
  if (dados.vencimento && c && c.dia_vencimento && Number(dados.vencimento.slice(8, 10)) !== c.dia_vencimento && dados.vencimento !== r.vencimento) {
    out.push(`O vencimento ${dataBr(dados.vencimento)} não cai no dia ${c.dia_vencimento}, que é o do contrato.`);
  }
  return out;
}

/** Pagamento com data muito para trás costuma ser ano digitado errado (ex.: 2025 em vez de 2026). */
const DIAS_PASSADO = 90;

export const dataMuitoAntiga = (data, rotulo = 'A data') => (data && data < C.somarDias(C.hojeIso(), -DIAS_PASSADO) ? `${rotulo} (${dataBr(data)}) é de mais de ${DIAS_PASSADO} dias atrás. Confira o ano.` : '');

export const dataNoFuturo = (data, rotulo = 'A data') => (data && data > C.hojeIso() ? `${rotulo} (${dataBr(data)}) está no futuro.` : '');

const diferencaGrande = (novo, base) => base > 0 && novo > 0 && Math.abs(novo - base) / base > FORA_DO_PADRAO;

const pctDif = (novo, base) => { const p = Math.round(((novo - base) / base) * 100); return `${Math.abs(p)}% ${p > 0 ? 'acima' : 'abaixo'}`; };

/**
 * Avisos dos dados de uma pessoa (inquilino, representante, solidário, fiador): endereço sem número, telefone com
 * quantidade errada de números, e-mail com erro comum de digitação. Só o que mudou em relação ao que já estava salvo.
 */
export function conferirPessoa(dados, antigo, prefixo, quem) {
  const out = [];
  const mudou = (k) => dados[k] && String(dados[k]) !== String((antigo || {})[k] ?? '');
  const end = `${prefixo}endereco`;
  if (mudou(end) && !/\d/.test(String(dados[end]).replace(/CEP\s*[\d.-]+/i, ''))) out.push(`Endereço ${quem} sem número: "${dados[end]}".`);
  const tel = `${prefixo}telefone`;
  const n = F.soDigitos(dados[tel] || '').replace(/^55(?=\d{10,11}$)/, '');
  if (mudou(tel) && n.length !== 10 && n.length !== 11) out.push(`Telefone ${quem} com ${n.length} números (o certo é DDD + 8 ou 9 números).`);
  const email = `${prefixo}email`;
  if (mudou(email) && /\.(con|cmo|comm|om)$|@(gmial|gmal|gmai|gamil|gnail|hotmial|hotmal|hotmai|hotnail|yaho|outlok)\.|@gmail\.com\.br$/i.test(dados[email])) out.push(`E-mail ${quem} parece ter erro de digitação: ${dados[email]}.`);
  return out;
}

/** Pessoas do cadastro do contrato: [prefixo, quem], só as preenchidas (os fiadores já saíram dos dados: ficam em fiadoresMudancas). */
function pessoasDoContrato(dados) {
  const pj = dados.inquilino_tipo === 'Pessoa jurídica (empresa)';
  return [['inquilino_', 'do inquilino'], ...(pj ? [['representante_', 'do representante']] : []), ...(dados.solidario_nome ? [['solidario_', 'do solidário']] : [])];
}

/** Avisos do seguro: vigência que não é de um ano, outro seguro no mesmo período, valor muito diferente do anterior. */
export function conferirSeguro(dados, r, q) {
  const out = [];
  const iid = r ? r.imovel_id : Number(q.imovel);
  const { vigencia_inicio: ini, vigencia_fim: fim } = dados;
  if (ini && fim && fim > ini) {
    const dias = C.diasEntre(ini, fim);
    if (dias < 330 || dias > 400) out.push(`A vigência (${dataBr(ini)} a ${dataBr(fim)}) tem ${dias} dias, não um ano.`);
  }
  const outros = d().seguros.filter((x) => x.imovel_id === iid && (!r || x.id !== r.id));
  const junto = ini && fim && outros.find((x) => x.vigencia_inicio && x.vigencia_fim && x.vigencia_inicio < fim && x.vigencia_fim > ini);
  if (junto) out.push(`Já há seguro deste imóvel de ${dataBr(junto.vigencia_inicio)} a ${dataBr(junto.vigencia_fim)}, no mesmo período.`);
  const ant = outros.filter((x) => x.vigencia_inicio && x.vigencia_inicio < (ini || '')).sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0];
  if (ant && diferencaGrande(dados.valor_total, ant.valor_total) && (!r || dados.valor_total !== r.valor_total)) out.push(`Valor de ${reais(dados.valor_total)} está ${pctDif(dados.valor_total, ant.valor_total)} do seguro anterior (${reais(ant.valor_total)}).`);
  return out;
}

/** Avisos do IPTU: ano longe do atual, total muito diferente do ano anterior. */
export function conferirIptu(dados, r, q) {
  const out = [];
  const iid = r ? r.imovel_id : Number(q.imovel);
  const atual = Number(C.hojeIso().slice(0, 4));
  if (dados.ano && Math.abs(dados.ano - atual) > 1 && (!r || dados.ano !== r.ano)) out.push(`O ano ${dados.ano} está longe do ano atual (${atual}).`);
  const ant = d().iptus.filter((p) => p.imovel_id === iid && p.ano < dados.ano).sort((a, b) => b.ano - a.ano)[0];
  if (ant && diferencaGrande(dados.valor_total, ant.valor_total) && (!r || dados.valor_total !== r.valor_total)) out.push(`Total de ${reais(dados.valor_total)} está ${pctDif(dados.valor_total, ant.valor_total)} do IPTU ${ant.ano} (${reais(ant.valor_total)}).`);
  return out;
}

/** Leitura do relógio como número (ex.: "1.234,5" → 1234.5); texto que não é número fica de fora. */
const numeroLeitura = (v) => { const t = String(v ?? '').trim().replace(/\./g, '').replace(',', '.'); return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null; };

/** Avisos da leitura: data no futuro, relógio com número menor que o da leitura anterior do imóvel. */
export function conferirLeitura(dados, r, q) {
  const iid = r ? r.imovel_id : Number(q.imovel);
  const antes = d().leituras.filter((x) => x.imovel_id === iid && (!r || x.id !== r.id) && x.data && x.data <= dados.data).sort((a, b) => b.data.localeCompare(a.data));
  return [dataNoFuturo(dados.data, 'A data da leitura'), ...F.LEITURAS.map(([k, rotulo]) => {
    const novo = numeroLeitura(dados[k]);
    const ant = antes.find((x) => numeroLeitura(x[k]) !== null);
    return novo !== null && ant && novo < numeroLeitura(ant[k]) ? `${rotulo}: ${dados[k]} é menor que a leitura de ${dataBr(ant.data)} (${ant[k]}).` : '';
  })].filter(Boolean);
}

/** Avisos do ressarcimento: pagamento no futuro ou muito antigo, mesmo valor já lançado para o mesmo mês do condomínio. */
export function conferirRessarcimento(dados, r, q) {
  const cid = r ? r.contrato_id : Number(q.contrato);
  const igual = d().ressarcimentos.find((x) => x.contrato_id === cid && (!r || x.id !== r.id) && x.competencia_condominio === dados.competencia_condominio && x.valor === dados.valor);
  return [dataNoFuturo(dados.data_pagamento, 'A data do pagamento'), dataMuitoAntiga(dados.data_pagamento, 'A data do pagamento'),
    igual ? `Já há ressarcimento de ${reais(igual.valor)} do condomínio de ${compBr(igual.competencia_condominio)} (${igual.descricao}). Não está repetido?` : ''].filter(Boolean);
}

/** Avisos da NF avulsa: data no futuro, outra NF avulsa com a mesma data e o mesmo valor. */
export function conferirAvulsa(dados, r) {
  const igual = d().avulsas.find((x) => (!r || x.id !== r.id) && x.data_pagamento === dados.data_pagamento && x.valor === dados.valor);
  return [dataNoFuturo(dados.data_pagamento, 'A data em que o dinheiro entrou'),
    igual ? `Já há NF avulsa de ${reais(igual.valor)} em ${dataBr(igual.data_pagamento)} (${igual.tomador_nome}). Não está repetida?` : ''].filter(Boolean);
}
