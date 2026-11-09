// Código comum ao site (docs/js/c6-comum.js) e à ponte do C6 (ponte-c6/c6-comum.mjs): datas 'AAAA-MM-DD' sem fuso, divisão de
// um período em janelas de consulta, dinheiro no formato do C6, linha digitável → código de barras, o que pode ir num pagamento
// (validarItem, conferido do mesmo jeito no site e na ponte) e as peças dos simuladores (extrato redatado e leitura de um item).
// Só funções puras, sem imports.
// ATENÇÃO: os dois arquivos precisam ser IGUAIS (a ponte é copiada sozinha para o computador do usuário); tests/banco.test.mjs confere,
// como faz com mapa-c6. Mexeu num, copie para o outro.

/** '2026-01-30' + 2 → '2026-02-01' (dias pode ser negativo). */
export function somarDias(data, dias) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Confere 'AAAA-MM-DD' (e que a data existe). Lança Error em português. */
export function validarData(texto, nome = 'data') {
  if (typeof texto !== 'string' || !RE_DATA.test(texto)) throw new Error(`A ${nome} precisa estar no formato AAAA-MM-DD (recebi "${texto}").`);
  const d = new Date(`${texto}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== texto) throw new Error(`A ${nome} "${texto}" não existe no calendário.`);
  return texto;
}

/**
 * Divide [de, ate] em janelas seguidas de no máximo `dias` dias corridos cada (contando o 1º e o último dia); período vazio
 * ou invertido → []. Ex.: janelas('2026-10-01', '2026-10-31', 30) → [01/10–30/10, 31/10–31/10].
 */
export function janelas(de, ate, dias) {
  const lista = [];
  if (!de || !ate || de > ate || !(dias >= 1)) return lista;
  for (let inicio = de; inicio <= ate; inicio = somarDias(inicio, dias)) {
    const fim = somarDias(inicio, dias - 1);
    lista.push({ de: inicio, ate: fim < ate ? fim : ate });
  }
  return lista;
}

/**
 * Valor em reais → centavos inteiros: "1500.00" (texto do C6, ponto decimal), número (1500), "1500,5" e "1.234,56" (como no
 * Brasil, nos arquivos OFX antigos). Lança se estiver em branco ou não for valor. Ex.: "19.99" → 1999 (sem o erro de 19,99 × 100).
 */
export function centavosDoTexto(valor) {
  if (valor === null || valor === undefined || valor === '') throw new Error('Valor do banco em branco.');
  let n = valor;
  if (typeof valor !== 'number') {
    const s = String(valor).replace(/\s/g, '');
    n = Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.'));
  }
  if (!Number.isFinite(n)) throw new Error(`Valor do banco inválido: "${valor}".`);
  return Math.round(n * 100 + (n < 0 ? -1e-7 : 1e-7));
}

/** Só os dígitos ("123.456.789-00" → "12345678900"; linha digitável colada com pontos e espaços). Vazio/nulo → ''. Usado também nos cadastros do site. */
export const soDigitos = (texto) => String(texto || '').replace(/\D/g, '');

/**
 * Linha digitável (47 dígitos, boleto bancário; 48, arrecadação/concessionária) → código de barras de 44 dígitos (44 volta como está).
 * 47: AAABC.CCCCX DDDDD.DDDDDY EEEEE.EEEEEZ K UUUUVVVVVVVVVV → AAAB K UUUUVVVVVVVVVV CCCCC DDDDDDDDDD EEEEEEEEEE
 * 48: 4 blocos de 11 dígitos + 1 dígito verificador cada → os 4 blocos de 11 seguidos.
 */
export function codigoDeBarrasDaLinha(linha) {
  const d = soDigitos(linha);
  if (d.length === 44) return d;
  if (d.length === 47) return d.slice(0, 4) + d.slice(32, 33) + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
  if (d.length === 48) return d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
  throw new Error(`Código de barras ou linha digitável inválido: esperava 44, 47 ou 48 dígitos e recebi ${d.length}.`);
}

// --------------------------------------------------------------------------
// O que pode ir num pagamento (POST /v1/schedule_payments/decode): conferido igual na ponte (antes de chamar o banco) e no
// simulador do site (modo ?teste), para o teste no navegador recusar o mesmo que a ponte recusa.
// --------------------------------------------------------------------------
const RE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}$/;
const RE_TELEFONE = /^\+[1-9][0-9]\d{5,14}$/;
const RE_EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Que tipo de "content" é: 'codigo_barras' | 'br_code' | 'chave_pix' | null. Linhas digitáveis contam como código de barras. */
export function tipoDoContent(content) {
  const t = String(content ?? '').trim();
  if (!t) return null;
  if (t.startsWith('000201')) return t.length >= 32 && t.length <= 396 ? 'br_code' : null;
  const d = soDigitos(t);
  if (/^[\d.\s]+$/.test(t) && [44, 47, 48].includes(d.length)) return 'codigo_barras';
  if (/^\d{11}$/.test(t) || /^\d{14}$/.test(t) || RE_TELEFONE.test(t) || RE_EMAIL.test(t) || RE_EVP.test(t.toLowerCase())) return 'chave_pix';
  return null;
}

/** Normaliza o `content`: código de barras sempre com 44 dígitos; BR Code e chave Pix como vieram (sem espaços nas pontas). */
export function normalizarContent(content) {
  const tipo = tipoDoContent(content);
  const t = String(content ?? '').trim();
  if (tipo === 'codigo_barras') return codigoDeBarrasDaLinha(t);
  if (tipo === 'br_code' || tipo === 'chave_pix') return tipo === 'chave_pix' && RE_EVP.test(t.toLowerCase()) ? t.toLowerCase() : t;
  throw new Error(`Não reconheci o que pagar: "${t.slice(0, 40)}". Use o código de barras (44 dígitos) ou a linha digitável do boleto, o Pix copia e cola ou uma chave Pix (CPF/CNPJ, telefone +55…, e-mail ou chave aleatória).`);
}

/**
 * Valida e devolve o item no formato do C6: { content, amount, description?, transaction_date? }. Lança Error em português.
 * amount em reais com até 2 casas: 19.99 passa (19,99 × 100 dá 1998,9999… no computador; a conferência tolera esse resto).
 */
export function validarItem(item, posicao = 1) {
  if (!item || typeof item !== 'object') throw new Error(`Item ${posicao}: pagamento vazio.`);
  const content = normalizarContent(item.content);
  const valor = typeof item.amount === 'string' ? Number(item.amount.replace(',', '.')) : item.amount;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) throw new Error(`Item ${posicao}: o valor precisa ser um número maior que zero (recebi "${item.amount}").`);
  const centavos = Math.round(valor * 100);
  if (Math.abs(valor * 100 - centavos) >= 1e-6) throw new Error(`Item ${posicao}: o valor precisa ter no máximo 2 casas decimais (recebi ${valor}).`);
  if (valor > 5000000) throw new Error(`Item ${posicao}: valor acima do limite de R$ 5.000.000,00.`);
  const pronto = { content, amount: centavos / 100 };
  if (item.description != null && item.description !== '') {
    const description = String(item.description).trim();
    if (description.length > 100) throw new Error(`Item ${posicao}: a descrição tem ${description.length} caracteres; o máximo é 100.`);
    pronto.description = description;
  }
  if (item.transaction_date != null && item.transaction_date !== '') pronto.transaction_date = validarData(String(item.transaction_date), `data de pagamento do item ${posicao}`);
  return pronto;
}

// --------------------------------------------------------------------------
// Peças dos simuladores (C6 de mentira da ponte, c6-simulado.mjs, e ponte de mentira do site em ?teste, banco-fase2.js)
// --------------------------------------------------------------------------
const diasDoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/**
 * Extrato fictício redatado para o período: cada mês entre `de` e `ate` recebe os lançamentos de `entries`, no mesmo dia
 * (fora do mês original, `reference` e `local_reference` ganham o sufixo "-AAAAMM" para continuar únicos).
 */
export function lancamentosNoPeriodo(entries, de, ate) {
  const saida = [];
  for (let mes = de.slice(0, 7); mes <= ate.slice(0, 7); mes = somarDias(`${mes}-01`, 32).slice(0, 7)) {
    const [ano, m] = mes.split('-').map(Number);
    for (const e of entries) {
      const mesOriginal = e.entry_date.slice(0, 7);
      const dia = Math.min(Number(e.entry_date.slice(8, 10)), diasDoMes(ano, m));
      const entry_date = `${mes}-${String(dia).padStart(2, '0')}`;
      if (entry_date < de || entry_date > ate) continue;
      const sufixo = mes === mesOriginal ? '' : `-${mes.replace('-', '')}`;
      saida.push({ ...e, entry_date, created_at: `${entry_date}T${e.created_at.slice(11)}`, reference: `${e.reference}${sufixo}`, local_reference: `${e.local_reference}${sufixo}` });
    }
  }
  return saida.sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
}

const BANCOS = { 336: 'Banco C6', 341: 'Itaú Unibanco', '001': 'Banco do Brasil', 237: 'Bradesco', 104: 'Caixa Econômica Federal', '033': 'Santander' };

/**
 * O que o banco fictício "lê" de um item mandado ao decode: código de barras (44/47/48 dígitos) ou Pix (copia e cola ou chave)
 * → READ_DATA com beneficiário e vencimento de mentira; conteúdo que não é nada, valor zero ou chave "erro@…" → DECODE_ERROR.
 */
export function itemLidoSimulado(conta, it, { id, group_id, hoje }) {
  const tipo = tipoDoContent(it.content);
  const base = { id, group_id, content: it.content, amount: it.amount, description: it.description, transaction_date: it.transaction_date ?? hoje };
  if (!tipo || !(it.amount > 0)) return { ...base, product_type: tipo === 'codigo_barras' ? 'BOLETO' : 'PIX', status: 'DECODE_ERROR', error_message: `It was not possible to decode: ${it.content}` };
  if (String(it.content).includes('erro@')) return { ...base, product_type: 'PIX', status: 'DECODE_ERROR', error_message: `It was not possible to find key: ${it.content}` };
  const pagador = `${String(conta).toUpperCase()} Administradora Ltda`;
  if (tipo === 'codigo_barras') {
    const barras = normalizarContent(it.content);
    return { ...base, content: barras, bank_code: barras.slice(0, 3), bank_name: BANCOS[barras.slice(0, 3)] ?? 'Banco Exemplo', beneficiary_name: 'Beneficiário Exemplo Ltda', payer_name: pagador, due_date: base.transaction_date, overdue: false, product_type: 'BOLETO', status: 'READ_DATA' };
  }
  return { ...base, bank_code: '336', bank_name: 'Banco C6', beneficiary_name: 'Recebedor Pix Exemplo', payer_name: pagador, product_type: 'PIX', status: 'READ_DATA' };
}
