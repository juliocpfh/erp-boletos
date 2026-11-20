// Avisos antes de salvar: valores fora do padrão que pedem "Salvar assim mesmo?" (datas, aluguel, endereço, telefone,
// e-mail, leituras, seguro, IPTU, lançamentos repetidos). Cada cadastro liga o seu em CADASTROS.<tabela>.conferir.
import * as C from '../calculos.js';
import { compBr, dataBr, reais } from '../calculos.js';
import * as F from '../formularios.js';
import * as R from '../regras.js';
import { confirmar } from '../app.js';
import { CADASTROS, fiadoresMudancas } from './cadastros.js';
import { buscar, d } from './comum.js';

/** Avisos antes de salvar: valores fora do padrão. Quem confirma, salva; quem cancela, corrige. */
export async function confirmarAvisos(avisos) {
  if (avisos.length && !(await confirmar(`• ${avisos.join('\n• ')}\n\nSalvar assim mesmo?`, { titulo: 'Confira antes de salvar', sim: 'Salvar assim mesmo', nao: 'Voltar e corrigir' }))) {
    throw new C.ErroUsuario('Nada foi salvo. Corrija o que precisar e salve de novo.');
  }
}

// números dos avisos: regras do sistema (Dados e backup → Regras), padrão 60 dias, 30% e 90 dias
const diasFuturo = () => R.regra('dias_futuro');
const foraDoPadrao = () => R.regra('fora_do_padrao') / 100;

/** Avisos do cadastro do inquilino: aluguel muito diferente do anterior, imóvel ainda ocupado, entrada muito no futuro. */
export function conferirContrato(dados, r, q) {
  const out = [];
  const imovelId = r ? r.imovel_id : Number(dados.imovel_id || q.imovel) || null;
  const anterior = imovelId ? d().contratos.filter((x) => x.imovel_id === imovelId && (!r || x.id !== r.id))
    .sort((a, b) => String(b.data_entrada || '').localeCompare(String(a.data_entrada || '')))[0] : null;
  const base = r ? r.aluguel_inicial : anterior ? R.aluguelAtual(d(), anterior) : null;
  if (base && dados.aluguel_inicial && Math.abs(dados.aluguel_inicial - base) / base > foraDoPadrao() && (!r || dados.aluguel_inicial !== r.aluguel_inicial)) {
    const p = Math.round(((dados.aluguel_inicial - base) / base) * 100);
    out.push(`Aluguel de ${reais(dados.aluguel_inicial)} está ${Math.abs(p)}% ${p > 0 ? 'acima' : 'abaixo'} ${r ? 'do valor anterior' : `do aluguel atual do inquilino anterior (${anterior.inquilino_nome})`} de ${reais(base)}.`);
  }
  if (imovelId && dados.data_entrada) {
    // os dois períodos se cruzam, em qualquer ordem das datas (o outro pode começar no mesmo dia ou depois); a troca de titular
    // (o anterior e o que continua este) não conta
    const fimNovo = dados.data_saida || '9999-12-31';
    const anteriorId = Number(dados.contrato_anterior_id || (r && r.contrato_anterior_id)) || null;
    const ocupando = d().contratos.find((x) => x.imovel_id === imovelId && (!r || x.id !== r.id) && x.id !== anteriorId && (!r || Number(x.contrato_anterior_id) !== r.id)
      && x.data_entrada && x.data_entrada <= fimNovo && (x.data_saida ? x.data_saida >= dados.data_entrada : x.ativo !== false));
    if (ocupando && ocupando.data_entrada < dados.data_entrada) out.push(`${ocupando.inquilino_nome} ainda está neste imóvel em ${dataBr(dados.data_entrada)}${ocupando.data_saida ? ` (sai em ${dataBr(ocupando.data_saida)})` : ' (sem data de saída)'}.`);
    else if (ocupando) out.push(`${ocupando.inquilino_nome} já tem contrato neste imóvel com entrada em ${dataBr(ocupando.data_entrada)}${ocupando.data_saida ? ` (até ${dataBr(ocupando.data_saida)})` : ''}: os dois ficariam no imóvel ao mesmo tempo, e os dois gerando boleto.`);
  }
  // ficha em análise (ou aprovada) de outra pessoa para este imóvel: o contrato feito direto passaria por cima dela
  const fichaDeste = Number(dados.ficha_id || (r && r.ficha_id) || q?.ficha) || null;
  const ficha = imovelId ? R.fichaAbertaDoImovel(d(), imovelId, fichaDeste) : null;
  if (ficha && !r) out.push(`Há uma ficha ${ficha.situacao === 'Aprovada' ? 'aprovada' : 'em análise'} de ${ficha.inquilino_nome || 'outro interessado'} para este imóvel${ficha.reserva_valor > 0 ? `, com reserva de ${reais(ficha.reserva_valor)}` : ''}. Se o contrato é de outra pessoa, resolva a ficha antes (reprovar ou desistência devolve a reserva).`);
  if (dados.data_entrada && dados.data_entrada > C.somarDias(C.hojeIso(), diasFuturo())) out.push(`A entrada (${dataBr(dados.data_entrada)}) está a mais de ${diasFuturo()} dias no futuro.`);
  out.push(...R.avisosLegaisDoContrato(dados)); // prazo, bonificação, multa, juros, caução e garantia, com o artigo da lei
  // inquilino novo que emite NF num imóvel ainda sem empresa emitente: lembrar agora (sem isso a NF não é numerada)
  if (!r && imovelId && dados.gerar_nf !== false && !R.participacoesDo(d(), imovelId).length) {
    out.push(`O imóvel ${(buscar('imoveis', imovelId) || {}).nome || ''} ainda não tem empresa que emite a NF. Defina na página do imóvel para conseguir numerar as NFs.`);
  }
  // a reserva é paga antes de entrar: data muito depois da entrada costuma ser o ano errado (ex.: 10/11/2026 com entrada em 15/11/2025)
  if (dados.reserva_valor > 0 && dados.reserva_data && dados.data_entrada && dados.reserva_data > C.somarDias(dados.data_entrada, 31)) out.push(`A reserva tem data de ${dataBr(dados.reserva_data)}, mais de um mês depois da entrada (${dataBr(dados.data_entrada)}): confira o ano. Ela é abatida no 1º aluguel.`);
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

/**
 * Avisos ao alterar um boleto: vencimento fora do dia do contrato ou antes do mês do boleto (ex.: 01/01/2020 no boleto de
 * 10/2026), multa acima de 10% e juros acima de 1% ao mês (os mesmos limites do contrato, avisosLegaisDoContrato).
 */
export function conferirBoleto(dados, r) {
  const out = [];
  const c = buscar('contratos', r.contrato_id);
  if (dados.vencimento && c && c.dia_vencimento && Number(dados.vencimento.slice(8, 10)) !== c.dia_vencimento && dados.vencimento !== r.vencimento) {
    out.push(`O vencimento ${dataBr(dados.vencimento)} não cai no dia ${c.dia_vencimento}, que é o do contrato.`);
  }
  if (dados.vencimento && r.competencia && dados.vencimento < `${r.competencia}-01` && dados.vencimento !== r.vencimento) {
    out.push(`O vencimento ${dataBr(dados.vencimento)} é antes do mês do boleto (${compBr(r.competencia)}). Confira o ano.`);
  }
  if (Number(dados.multa_percentual) > 10 && dados.multa_percentual !== r.multa_percentual) out.push(`Multa por atraso de ${C.pct(dados.multa_percentual)}: acima de 10% o juiz costuma reduzir (Lei de Usura, art. 9º; Código Civil, art. 413).`);
  if (Number(dados.juros_mensal_percentual) > 1 && dados.juros_mensal_percentual !== r.juros_mensal_percentual) out.push(`Juros de ${C.pct(dados.juros_mensal_percentual)} ao mês: acima de 1% ao mês pode ser reduzido (Código Civil, art. 406; Lei de Usura, art. 1º).`);
  return out;
}

/** Pagamento com data muito para trás costuma ser ano digitado errado (ex.: 2025 em vez de 2026). */
const diasPassado = () => R.regra('dias_passado');

export const dataMuitoAntiga = (data, rotulo = 'A data') => (data && data < C.somarDias(C.hojeIso(), -diasPassado()) ? `${rotulo} (${dataBr(data)}) é de mais de ${diasPassado()} dias atrás. Confira o ano.` : '');

export const dataNoFuturo = (data, rotulo = 'A data') => (data && data > C.hojeIso() ? `${rotulo} (${dataBr(data)}) está no futuro.` : '');

const diferencaGrande = (novo, base) => base > 0 && novo > 0 && Math.abs(novo - base) / base > foraDoPadrao();

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
  const cid = r ? r.contrato_id : Number(q.contrato);
  const iid = (buscar('contratos', cid) || {}).imovel_id;
  const { vigencia_inicio: ini, vigencia_fim: fim } = dados;
  if (ini && fim && fim > ini) {
    const dias = C.diasEntre(ini, fim);
    if (dias < 330 || dias > 400) out.push(`A vigência (${dataBr(ini)} a ${dataBr(fim)}) tem ${dias} dias, não um ano.`);
  }
  const outros = d().seguros.filter((x) => x.imovel_id === iid && (!r || x.id !== r.id));
  // sobreposição só conta no mesmo inquilino (quem entra no meio da vigência do anterior precisa de apólice própria)
  const junto = ini && fim && outros.filter((x) => x.contrato_id === cid).find((x) => x.vigencia_inicio && x.vigencia_fim && x.vigencia_inicio < fim && x.vigencia_fim > ini);
  if (junto) out.push(`Já há seguro deste inquilino de ${dataBr(junto.vigencia_inicio)} a ${dataBr(junto.vigencia_fim)}, no mesmo período.`);
  const ant = outros.filter((x) => x.vigencia_inicio && x.vigencia_inicio < (ini || '')).sort((a, b) => b.vigencia_inicio.localeCompare(a.vigencia_inicio))[0];
  if (ant && diferencaGrande(dados.valor_total, ant.valor_total) && (!r || dados.valor_total !== r.valor_total)) out.push(`Valor de ${reais(dados.valor_total)} está ${pctDif(dados.valor_total, ant.valor_total)} do seguro anterior (${reais(ant.valor_total)}).`);
  // parcelas cobradas no aluguel fora da vigência (ex.: 1ª cobrança em 01/2020 de uma apólice de 2026, ou 60 parcelas num ano)
  const mudou = ['primeira_competencia', 'num_parcelas', 'vigencia_inicio', 'vigencia_fim'].some((k) => !r || dados[k] !== r[k]);
  const pri = dados.primeira_competencia;
  if (mudou && pri && ini && pri < ini.slice(0, 7)) out.push(`A 1ª parcela no aluguel de ${compBr(pri)} é antes do início da vigência (${dataBr(ini)}).`);
  if (mudou && pri && fim && dados.num_parcelas >= 1) {
    const ultima = C.somarMeses(pri, dados.num_parcelas - 1);
    if (ultima > fim.slice(0, 7)) out.push(`Em ${dados.num_parcelas} parcela(s) a partir de ${compBr(pri)}, a última fica no aluguel de ${compBr(ultima)}, depois do fim da vigência (${dataBr(fim)}).`);
  }
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
  const mudou = (k) => !r || dados[k] !== r[k];
  // a prefeitura parcela em até 12 vezes: 99 parcelas é número digitado errado (R$ 12,12 por mês durante 8 anos)
  if (dados.num_parcelas > 12 && mudou('num_parcelas')) out.push(`${dados.num_parcelas} parcelas: o IPTU costuma ser em até 12 (o inquilino pagaria por ${dados.num_parcelas} meses).`);
  // valor fixo por parcela: a soma das parcelas deve dar perto do total (ex.: R$ 5.000,00 × 10 = R$ 50.000,00 de um IPTU de R$ 1.200,00)
  if (dados.valor_parcela > 0 && dados.num_parcelas >= 1 && dados.valor_total > 0 && (mudou('valor_parcela') || mudou('num_parcelas') || mudou('valor_total'))) {
    const soma = dados.valor_parcela * dados.num_parcelas;
    if (Math.abs(soma - dados.valor_total) / dados.valor_total > 0.05) out.push(`Parcela fixa de ${reais(dados.valor_parcela)} × ${dados.num_parcelas} = ${reais(soma)}, ${pctDif(soma, dados.valor_total)} do total do IPTU (${reais(dados.valor_total)}).`);
  }
  // 1º boleto com IPTU longe do ano do IPTU (ex.: IPTU 2026 cobrado a partir de 1900)
  const anoBoleto = Number(String(dados.primeiro_vencimento_boleto || '').slice(0, 4));
  if (dados.ano && anoBoleto && Math.abs(anoBoleto - dados.ano) > 1 && (mudou('primeiro_vencimento_boleto') || mudou('ano'))) out.push(`O 1º boleto com IPTU (${compBr(dados.primeiro_vencimento_boleto)}) está longe do ano do IPTU (${dados.ano}).`);
  return out;
}

/** Avisos da renovação: término novo já passado, novo aluguel muito diferente do atual (ex.: R$ 1,00 ou 100 vezes o atual). */
export function conferirRenovacao(dados, r, q) {
  const c = buscar('contratos', r ? r.contrato_id : q.contrato);
  const out = [dataNoPassado(dados.nova_vigencia_fim, 'A nova data de término')];
  const atual = c ? R.aluguelAtual(d(), c) : 0;
  if (dados.novo_valor > 0 && diferencaGrande(dados.novo_valor, atual)) out.push(`Novo aluguel de ${reais(dados.novo_valor)} está ${pctDif(dados.novo_valor, atual)} do aluguel atual (${reais(atual)}). Os boletos em aberto são refeitos com ele e sai um termo aditivo.`);
  return out.filter(Boolean);
}

const dataNoPassado = (data, rotulo) => (data && data < C.hojeIso() ? `${rotulo} (${dataBr(data)}) já passou: o contrato aparece como vencido.` : '');

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
