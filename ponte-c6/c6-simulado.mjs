// C6 de mentira, para rodar a ponte sem banco (SIMULADO=1) e para os testes (sem rede).
// Implementa a MESMA interface do cliente real: `chamar(metodo, caminho, { query, corpo, aceitar }) → { status, corpo }`
// (corpo é objeto quando JSON e Buffer quando PDF) e respostas no formato exato dos YAMLs em documentacao/c6-openapi/.
//
// Uso:  import { c6SimuladoDaConta } from './c6-simulado.mjs';
//       const c6 = c6SimuladoDaConta('ank');          // mesma instância a cada chamada (guarda boletos emitidos e grupos)
//       const r = await c6.chamar('GET', '/v1/statement/', { query: { start_date: '2026-11-01', end_date: '2026-11-30' } });
// Ou:   criarC6Simulado({ conta: 'jck' })               // instância nova, com estado próprio
//
// Dados: ponte-c6/simulado/*.json (extrato, saldo, boletos pagos, DDA, itens de um grupo). O extrato é "redatado" para
// o período pedido: os lançamentos do JSON (novembro/2026) repetem-se em cada mês consultado, com o mesmo dia; fora de
// novembro/2026 a `reference` ganha o sufixo "-AAAAMM" para continuar única.
//
// Rotas simuladas: GET /v1/statement/ · GET /v1/statement/balance · GET|POST /v2/bank_slips · GET|PATCH /v2/bank_slips/{id}
// · GET /v2/bank_slips/{id}/pdf · PUT /v2/bank_slips/{id}/cancel · POST /v1/schedule_payments/decode · GET /v1/schedule_payments/query
// · GET|DELETE /v1/schedule_payments/{g}/items · DELETE /v1/schedule_payments/{g}/items/{id} · POST /v1/schedule_payments/submit
// · POST /v1/auth/ (token fictício). Qualquer outra → 404 { message }.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { diasEntre, hoje, somarDias } from './c6-datas.mjs';
import { gerarPdf } from './pdf-minimo.mjs';
// extrato redatado e leitura de um item: c6-comum.mjs, iguais aos do simulador do site (docs/js/banco-fase2.js, modo ?teste)
import { lancamentosNoPeriodo, itemLidoSimulado } from './c6-comum.mjs';

export { lancamentosNoPeriodo };

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'simulado');
const ler = (nome) => JSON.parse(fs.readFileSync(path.join(PASTA, nome), 'utf8'));
/** PNG 1x1 (base64) para o `image_content` do QR Code fictício. */
export const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Identificador de 26 caracteres [0-9A-Z], parecido com os ULIDs do C6. */
export const idSimulado = () => crypto.randomBytes(16).toString('base64').replace(/[^0-9A-Z]/gi, '').toUpperCase().padEnd(26, '0').slice(0, 26);

const resposta = (status, corpo = null) => ({ status, corpo });
const erro = (status, message) => resposta(status, { code: String(status), message });
/** Linha digitável (47 dígitos, formato "AAABC.CCCCX DDDDD.DDDDDY EEEEE.EEEEEZ K UUUUVVVVVVVVVV") a partir do código de barras; dígitos verificadores fictícios. */
const linhaDigitavel = (b) => `${b.slice(0, 4)}${b.slice(19, 20)}.${b.slice(20, 24)}1   ${b.slice(24, 29)}.${b.slice(29, 34)}2   ${b.slice(34, 39)}.${b.slice(39, 44)}3   ${b[4]}   ${b.slice(5, 19)}`;

export function criarC6Simulado({ conta = 'ank', agora = () => new Date() } = {}) {
  const extrato = ler('extrato.json')[conta]?.entries ?? [];
  const saldo = ler('saldo.json')[conta] ?? ler('saldo.json').ank;
  const boletos = (ler('boletos-pagos.json')[conta]?.content ?? []).map((b) => ({ ...b }));
  const dda = ler('dda.json')[conta] ?? { items: [] };
  const grupoFixo = ler('grupo-itens.json');
  const grupos = new Map([[grupoFixo.group_id, grupoFixo.items.map((i) => ({ ...i }))]]);
  let contadorNossoNumero = 3100;

  const boletoPor = (chave) => boletos.find((b) => b.id === chave || b.external_reference_id === chave) || null;
  const semPagamentos = ({ payments, ...resto }) => resto;

  const emitir = (corpo) => {
    const faltam = ['amount', 'due_date', 'description', 'payer', 'payment_method'].filter((k) => corpo?.[k] == null);
    if (faltam.length) return erro(400, `Campos obrigatórios ausentes: ${faltam.join(', ')}`);
    if (!(corpo.amount > 0)) return erro(400, 'amount deve ser maior que zero');
    if (corpo.external_reference_id && boletoPor(corpo.external_reference_id)) return erro(409, 'external_reference_id já utilizado');
    const id = idSimulado();
    const our_number = String(corpo.payment_method?.bank_slip?.our_number || ++contadorNossoNumero).padStart(10, '0');
    const valor = String(Math.round(corpo.amount * 100)).padStart(10, '0');
    // 44 dígitos: banco 336 + moeda 9 + DV 9 + fator de vencimento 9690 + valor (10) + campo livre (25 = cedente 12 + nosso número 10 + 000)
    const bar_code = `33699${'9690'}${valor.slice(-10)}${'000000304872'}${our_number.slice(-10)}000`;
    const comPix = !!corpo.payment_method?.pix?.key;
    const boleto = {
      id,
      external_reference_id: corpo.external_reference_id || idSimulado(),
      amount: corpo.amount,
      due_date: corpo.due_date,
      emission_date: hoje(),
      description: corpo.description,
      days_after_due_date: corpo.days_after_due_date ?? 30,
      status: 'CREATED',
      origin: corpo.origin ?? 'ERP',
      payer: corpo.payer,
      fees: corpo.fees,
      payer_notification: (corpo.payer_notification || []).map((n) => ({ ...n, status: 'SCHEDULED' })),
      payment_method: {
        bank_slip: {
          originator_id: '000000304872',
          billing_scheme: corpo.payment_method?.bank_slip?.billing_scheme ?? '21',
          billing_type: '3',
          digitable_line: linhaDigitavel(bar_code),
          bar_code,
          our_number,
          number: corpo.payment_method?.bank_slip?.your_number ?? our_number,
        },
        pix: comPix ? {
          qr_code: `00020126580014BR.GOV.BCB.PIX0136${corpo.payment_method.pix.key}5204000053039865406${corpo.amount.toFixed(2)}5802BR5909SIMULADO6008CURITIBA62070503***6304ABCD`,
          image_content: PNG_1X1,
          mime_type: 'image/png',
          reference: crypto.randomUUID(),
        } : {},
      },
      payments: [],
    };
    boletos.push(boleto);
    const { id: _id, external_reference_id, amount, due_date, payment_method } = boleto;
    return resposta(201, { id, external_reference_id, amount, due_date, payment_method });
  };

  const listarBoletos = (q) => {
    const filtro = ['payment_date', 'credit_date', 'due_date'].find((f) => q[`${f}_from`] || q[`${f}_to`]);
    if (!filtro) return erro(400, 'Informe um intervalo de datas (payment_date, due_date ou credit_date)');
    const de = q[`${filtro}_from`] ?? '0000-00-00';
    const ate = q[`${filtro}_to`] ?? '9999-12-31';
    if (de !== '0000-00-00' && ate !== '9999-12-31' && diasEntre(de, ate) > 60) return erro(400, 'O intervalo máximo entre datas é de 60 dias');
    const dentro = (d) => d && d >= de && d <= ate;
    let lista = boletos.filter((b) => (filtro === 'due_date' ? dentro(b.due_date) : (b.payments || []).some((p) => dentro(p[filtro]))));
    if (q.status) lista = lista.filter((b) => b.status === q.status);
    if (q.external_reference_id) lista = lista.filter((b) => b.external_reference_id === q.external_reference_id);
    const size = Math.min(100, Math.max(1, Number(q.size) || 20));
    const page = Math.max(0, Number(q.page) || 0);
    return resposta(200, { content: lista.slice(page * size, (page + 1) * size), total_elements: lista.length, total_pages: Math.ceil(lista.length / size), page, size });
  };

  const decodificar = (corpo) => {
    const items = Array.isArray(corpo?.items) ? corpo.items : null;
    if (!items?.length) return erro(400, 'items é obrigatório');
    const group_id = idSimulado();
    const lidos = items.map((it) => itemLidoSimulado(conta, it, { id: idSimulado(), group_id, hoje: hoje() }));
    grupos.set(group_id, lidos);
    return resposta(201, { group_id });
  };

  async function chamar(metodo, caminho, { query = {}, corpo = null } = {}) {
    const url = new URL(String(caminho), 'http://simulado.local');
    const q = { ...Object.fromEntries(url.searchParams), ...Object.fromEntries(Object.entries(query ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])) };
    const rota = url.pathname.replace(/\/+$/, '') || '/';
    const m = String(metodo).toUpperCase();
    const partes = rota.split('/').filter(Boolean);

    if (m === 'POST' && rota === '/v1/auth') return resposta(200, { access_token: `simulado-${idSimulado()}`, expires_in: 600, token_type: 'Bearer', scope: 'statement bank_slips schedule_payments' });

    if (m === 'GET' && rota === '/v1/statement') {
      const { start_date, end_date } = q;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(end_date ?? '')) return erro(400, 'start_date e end_date são obrigatórios (YYYY-MM-DD)');
      if (end_date < start_date) return erro(400, 'end_date deve ser igual ou posterior a start_date');
      if (diasEntre(start_date, end_date) > 30) return erro(400, 'O intervalo entre start_date e end_date não pode exceder 30 dias');
      return resposta(200, { entries: lancamentosNoPeriodo(extrato, start_date, end_date) });
    }
    if (m === 'GET' && rota === '/v1/statement/balance') return resposta(200, { ...saldo, date: hoje() });

    if (rota === '/v2/bank_slips') {
      if (m === 'GET') return listarBoletos(q);
      if (m === 'POST') return emitir(corpo);
    }
    if (partes[0] === 'v2' && partes[1] === 'bank_slips' && partes[2]) {
      const b = boletoPor(partes[2]);
      if (!b) return erro(404, 'Cobrança não encontrada');
      if (partes.length === 3 && m === 'GET') return resposta(200, semPagamentos(b));
      if (partes.length === 3 && m === 'PATCH') { Object.assign(b, corpo ?? {}, { payment_method: { ...b.payment_method, bank_slip: { ...b.payment_method.bank_slip, ...(corpo?.payment_method?.bank_slip ?? {}) } } }); return resposta(200, semPagamentos(b)); }
      if (partes[3] === 'pdf' && m === 'GET') {
        const pdf = gerarPdf({ titulo: 'Boleto simulado - C6 Bank', subtitulo: `Emitido em ${b.emission_date} (ambiente de teste, sem valor)`, linhas: [
          `Pagador: ${b.payer?.name ?? ''}`, `Valor: R$ ${Number(b.amount).toFixed(2).replace('.', ',')}`, `Vencimento: ${b.due_date}`, `Descrição: ${b.description ?? ''}`,
          `Linha digitável: ${b.payment_method.bank_slip.digitable_line}`, `Nosso número: ${b.payment_method.bank_slip.our_number}`, `Pix copia e cola: ${b.payment_method.pix?.qr_code ?? '(sem Pix)'}`] });
        return resposta(200, pdf);
      }
      if (partes[3] === 'cancel' && m === 'PUT') { b.status = 'CANCELED'; return resposta(204, null); }
      if (partes[3] === 'denial' && m === 'POST') return resposta(201, { id: b.id, external_reference_id: b.external_reference_id, status: 'SCHEDULED', denial_date: somarDias(b.due_date, Number(corpo?.deadline ?? 0)) });
      if (partes[3] === 'denial' && m === 'DELETE') return resposta(204, null);
    }

    if (partes[0] === 'v1' && partes[1] === 'schedule_payments') {
      if (partes[2] === 'decode' && m === 'POST') return decodificar(corpo);
      if (partes[2] === 'query' && m === 'GET') return resposta(200, { items: dda.items });
      if (partes[2] === 'submit' && m === 'POST') {
        if (!corpo?.group_id || !corpo?.uploader_name) return erro(400, 'group_id e uploader_name são obrigatórios');
        const itens = grupos.get(corpo.group_id);
        if (!itens) return erro(404, 'Grupo de pagamentos não encontrado');
        for (const it of itens) if (it.status === 'READ_DATA') it.status = 'SCHEDULED';
        return resposta(204, null);
      }
      const itens = grupos.get(partes[2]);
      if (partes[3] === 'items') {
        if (!itens) return erro(404, 'Grupo de pagamentos não encontrado');
        if (partes.length === 4 && m === 'GET') return resposta(200, { items: itens });
        if (partes.length === 4 && m === 'DELETE') {
          const ids = new Set((Array.isArray(corpo) ? corpo : []).map((x) => (typeof x === 'object' ? x.id : x)));
          grupos.set(partes[2], itens.filter((i) => !ids.has(i.id)));
          return resposta(204, null);
        }
        if (partes.length === 5 && m === 'DELETE') { grupos.set(partes[2], itens.filter((i) => i.id !== partes[4])); return resposta(204, null); }
      }
    }
    return erro(404, `Rota simulada não existe: ${m} ${rota}`);
  }

  return { conta, simulado: true, chamar, _estado: { boletos, grupos } };
}

const instancias = new Map();
/** Uma instância por conta, reaproveitada (o servidor usa esta quando SIMULADO=1). */
export function c6SimuladoDaConta(conta) {
  if (!instancias.has(conta)) instancias.set(conta, criarC6Simulado({ conta }));
  return instancias.get(conta);
}
