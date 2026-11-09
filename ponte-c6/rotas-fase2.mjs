// Rotas da fase 2 da ponte (extrato, saldo, boletos pagos, DDA, pagamentos agendados e comprovante gerado pela ponte).
// O servidor (ponte-c6/servidor.mjs) monta estas rotas; aqui não há HTTP, só a lógica.
//
// CONTRATO PARA O SERVIDOR
//   import { rotasFase2 } from './rotas-fase2.mjs';
//   const rotas = rotasFase2({ c6DaConta, registrar, empresas });
//     c6DaConta(conta)  → objeto { conta, chamar(metodo, caminho, { query, corpo, aceitar }) → { status, corpo } } já autenticado
//                         para a conta ('ank', 'jck'…); pode ser async; devolve null/undefined ou lança se a conta não existe.
//     registrar(texto)  → log (opcional).
//     empresas          → { ank: 'ANK Administradora Ltda', … } nome que sai no comprovante (opcional; padrão: id em maiúsculas).
//   Cada rota: { metodo: 'GET'|'POST'|'DELETE', padrao: '/contas/:conta/extrato', caminho: RegExp (grupos nomeados), handler }
//     handler(req, { conta, query, corpo, params }) → Promise<{ status, corpo }>            (JSON)
//                                                     | Promise<{ status, pdf: Buffer, nome, cabecalhos }>  (application/pdf)
//     - `query`  objeto com os parâmetros da URL (strings); `corpo` o JSON já lido (ou null); `params` os grupos do regex
//       (se o servidor não passar `params`/`conta`, o handler extrai da própria req.url com o regex).
//     - O handler nunca lança: erro de validação → { status: 400, corpo: { erro, codigo: 'validacao' } };
//       conta desconhecida → 404 'conta'; recusa do banco → 502 { erro, codigo: 'banco', status_banco } ; falha interna → 500 'interno'.
//     - A senha da ponte, o CORS e o limite de pagamentos (PAGAMENTOS=1) são conferidos pelo servidor, antes de chamar o handler.
//
// ROTAS (todas sob /contas/:conta; :conta ∈ CONTAS)
//   GET    /extrato?de&ate                  → { conta_id, de, ate, lancamentos: [entry do C6 + conta_id] }  (padrão: últimos 30 dias)
//   GET    /saldo                           → { conta_id, date, currency_code, available, locked, future, charges, limit{…}, total_available, … }
//   GET    /boletos/pagos?de&ate&por        → { conta_id, de, ate, por, boletos: content[] do C6 (com payments[]) }  por = payment_date (padrão) | credit_date | due_date
//   GET    /dda                             → { conta_id, items: [...] }
//   POST   /pagamentos/decodificar          corpo { items: [{ content, amount, description, transaction_date }] } (ou a lista direto) → 201 { conta_id, group_id }
//   GET    /pagamentos/:grupo/itens         → { conta_id, group_id, items: [...] }
//   DELETE /pagamentos/:grupo/itens         corpo ['id', …] | [{ id }] | { ids: [...] } → { conta_id, group_id, removidos }
//   DELETE /pagamentos/:grupo/itens/:item   → { conta_id, group_id, removidos: 1 }
//   POST   /pagamentos/:grupo/enviar        corpo { uploader_name } → { conta_id, group_id, enviado: true }
//   GET    /comprovante/:reference?data|de&ate[&formato=json]
//          → PDF gerado pela ponte com os dados do lançamento do extrato (cabeçalho X-Comprovante-Origem: ponte; nome comprovante-<ref>.pdf)
//            `data` = dia do lançamento (procura ±1 dia); sem ela procura em de..ate (padrão: últimos 90 dias). 404 se não achar.
//            :reference = o reference do C6 ou, para a linha que só veio do arquivo OFX do app, a referência local (local_reference).
//            formato=json → { conta_id, reference, nome, origem: 'ponte', pdf_base64, lancamento } (para o site, que só fala JSON com a ponte)

import { extrato, saldo } from './c6-extrato.mjs';
import { listarPagos } from './c6-boletos-listar.mjs';
import { decodificar, itensDoGrupo, removerItens, removerItem, enviarParaAprovacao, dda } from './c6-pagamentos.mjs';
import { gerarPdf } from './pdf-minimo.mjs';
import { hoje, somarDias, validarData, centavosDoTexto, reaisBr, dataBr } from './c6-datas.mjs';

const TIPOS = {
  PAYMENT: 'Pagamento', TRANSFER: 'Transferência', PAYMENT_REVERSAL: 'Estorno de pagamento', DIRECT_DEBIT_AGREEMENT: 'Débito automático',
  CREDIT_PIX_PAYMENT_RECEIVED: 'Pix recebido', CREDIT_QRCODE_PIX_PAYMENT_RECEIVED: 'Pix recebido (QR Code)', DEBIT_PIX_PAYMENT_REALIZED: 'Pix enviado',
  CREDIT_PIX_DEVOLUTION_RECEIVED: 'Devolução de Pix recebida', DEBIT_PIX_DEVOLUTION_SENT: 'Devolução de Pix enviada', VEHICLE_TAX: 'Imposto de veículo',
  CREDIT_CARD_SALE: 'Venda no cartão de crédito', DEBIT_CARD_SALE: 'Venda no cartão de débito', FUND: 'Fundo/investimento', OTHER: 'Outro',
};

const erro = (status, mensagem, codigo, extra = {}) => ({ status, corpo: { erro: mensagem, codigo, ...extra } });

/** '/contas/:conta/pagamentos/:grupo/itens' → /^\/contas\/(?<conta>[^/]+)\/pagamentos\/(?<grupo>[^/]+)\/itens\/?$/ */
export const regexDoPadrao = (padrao) => new RegExp(`^${padrao.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, '(?<$1>[^/]+)')}/?$`);

const decodificarParam = (v) => { try { return decodeURIComponent(v); } catch { return v; } };

/** PDF do comprovante de um lançamento do extrato (o C6 não oferece PDF por lançamento; a ponte gera um). */
export function montarPdfComprovante(l, { conta, empresa = String(conta ?? '').toUpperCase(), agora = new Date() } = {}) {
  const entrada = l.operation_type === 'INCOMING';
  const valor = reaisBr(centavosDoTexto(l.amount));
  const quando = `${String(agora.getDate()).padStart(2, '0')}/${String(agora.getMonth() + 1).padStart(2, '0')}/${agora.getFullYear()} ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  const linhas = [
    `Empresa: ${empresa}`,
    `Conta: ${String(conta ?? '').toUpperCase()} (C6 Bank)`,
    `Data do lançamento: ${dataBr(l.entry_date)}${l.created_at ? `  (registrado em ${dataBr(String(l.created_at).slice(0, 10))} ${String(l.created_at).slice(11, 16)})` : ''}`,
    `Tipo: ${entrada ? 'Entrada (crédito)' : 'Saída (débito)'} - ${TIPOS[l.transaction_type] ?? l.transaction_type ?? ''}`,
    `Valor: ${entrada ? '+' : '-'} R$ ${valor}`,
    '',
    `Título: ${l.title ?? ''}`,
    `Descrição: ${l.description ?? ''}`,
    '',
    `Referência do lançamento (C6): ${l.reference ?? ''}`,
    l.local_reference ? `Referência local (C6): ${l.local_reference}` : null,
    l.end_to_end_id ? `Identificador Pix (end to end): ${l.end_to_end_id}` : null,
  ].filter((x) => x !== null);
  return gerarPdf({
    titulo: 'Comprovante de movimentação bancária',
    subtitulo: `Gerado pela Ponte C6 em ${quando}, a partir do extrato da conta. Não substitui o comprovante emitido pelo banco.`,
    linhas,
    rodape: `Conta ${String(conta ?? '').toUpperCase()} · ref. ${l.reference ?? ''}`,
  });
}

export function rotasFase2({ c6DaConta, registrar = () => {}, empresas = {}, agora = () => new Date() }) {
  if (typeof c6DaConta !== 'function') throw new Error('rotasFase2 precisa de c6DaConta(conta).');
  const hojeTxt = () => hoje();

  /** Monta uma rota: valida a conta, chama `fn` e traduz erros para { status, corpo }. */
  const rota = (metodo, padrao, fn) => {
    const caminho = regexDoPadrao(padrao);
    return {
      metodo, padrao, caminho,
      async handler(req, { conta, query = {}, corpo = null, params = {} } = {}) {
        const daUrl = caminho.exec(String(req?.url ?? '').split('?')[0])?.groups ?? {};
        const p = Object.fromEntries(Object.entries({ ...daUrl, ...params }).map(([k, v]) => [k, decodificarParam(String(v))]));
        const contaId = String(conta ?? p.conta ?? '').toLowerCase();
        try {
          const c6 = contaId ? await c6DaConta(contaId) : null;
          if (!c6) return erro(404, `A conta "${contaId}" não está configurada na ponte.`, 'conta');
          return await fn({ c6, conta: contaId, query: query ?? {}, corpo, params: p });
        } catch (e) {
          if (e?.status >= 400) {
            registrar(`[${contaId}] ${metodo} ${padrao}: o banco respondeu ${e.status}: ${e.message}`);
            return erro(502, e.message, 'banco', { status_banco: e.status });
          }
          if (e?.constructor === Error) return erro(400, e.message, 'validacao'); // Error "puro" = validação nossa; TypeError etc. = defeito
          registrar(`[${contaId}] ${metodo} ${padrao}: erro interno: ${e?.stack ?? e}`);
          return erro(500, 'A ponte teve um erro interno. Veja o registro no computador da ponte.', 'interno');
        }
      },
    };
  };

  const periodo = (query, diasPadrao) => {
    const ate = query.ate ? validarData(String(query.ate), 'data final') : hojeTxt();
    const de = query.de ? validarData(String(query.de), 'data inicial') : somarDias(ate, -diasPadrao);
    return { de, ate };
  };

  return [
    rota('GET', '/contas/:conta/extrato', async ({ c6, conta, query }) => {
      const { de, ate } = periodo(query, 30);
      const r = await extrato(c6, { de, ate });
      registrar(`[${conta}] extrato ${de}..${ate}: ${r.lancamentos.length} lançamentos`);
      return { status: 200, corpo: { ...r, conta_id: conta, lancamentos: r.lancamentos.map((l) => ({ ...l, conta_id: conta })) } };
    }),

    rota('GET', '/contas/:conta/saldo', async ({ c6, conta }) => ({ status: 200, corpo: { ...(await saldo(c6)), conta_id: conta } })),

    rota('GET', '/contas/:conta/boletos/pagos', async ({ c6, conta, query }) => {
      const { de, ate } = periodo(query, 30);
      const por = query.por ? String(query.por) : 'payment_date';
      const boletos = await listarPagos(c6, { de, ate, por, status: query.status ? String(query.status) : null });
      return { status: 200, corpo: { conta_id: conta, de, ate, por, boletos } };
    }),

    rota('GET', '/contas/:conta/dda', async ({ c6, conta }) => ({ status: 200, corpo: { conta_id: conta, ...(await dda(c6)) } })),

    rota('POST', '/contas/:conta/pagamentos/decodificar', async ({ c6, conta, corpo }) => {
      const itens = Array.isArray(corpo) ? corpo : corpo?.items ?? corpo?.itens;
      const r = await decodificar(c6, itens);
      registrar(`[${conta}] pagamentos enviados para leitura: grupo ${r.group_id} (${itens.length} itens)`);
      return { status: 201, corpo: { conta_id: conta, ...r } };
    }),

    rota('GET', '/contas/:conta/pagamentos/:grupo/itens', async ({ c6, conta, params }) => ({ status: 200, corpo: { conta_id: conta, ...(await itensDoGrupo(c6, params.grupo)) } })),

    rota('DELETE', '/contas/:conta/pagamentos/:grupo/itens', async ({ c6, conta, params, corpo }) => {
      const ids = Array.isArray(corpo) ? corpo : corpo?.ids ?? corpo?.items ?? [];
      return { status: 200, corpo: { conta_id: conta, ...(await removerItens(c6, params.grupo, ids)) } };
    }),

    rota('DELETE', '/contas/:conta/pagamentos/:grupo/itens/:item', async ({ c6, conta, params }) => ({ status: 200, corpo: { conta_id: conta, ...(await removerItem(c6, params.grupo, params.item)) } })),

    rota('POST', '/contas/:conta/pagamentos/:grupo/enviar', async ({ c6, conta, params, corpo }) => {
      const r = await enviarParaAprovacao(c6, params.grupo, corpo?.uploader_name ?? corpo?.nome);
      registrar(`[${conta}] grupo ${params.grupo} enviado para aprovação por ${corpo?.uploader_name ?? corpo?.nome}`);
      return { status: 200, corpo: { conta_id: conta, ...r } };
    }),

    rota('GET', '/contas/:conta/comprovante/:reference', async ({ c6, conta, params, query }) => {
      const reference = params.reference;
      let de; let ate;
      if (query.data) { const d = validarData(String(query.data), 'data'); de = somarDias(d, -1); ate = somarDias(d, 1); }
      else ({ de, ate } = periodo(query, 90));
      const { lancamentos } = await extrato(c6, { de, ate });
      // pelo reference; linha que só veio do arquivo OFX do app chega com a referência local (local_reference)
      const l = lancamentos.find((x) => x.reference === reference) || lancamentos.find((x) => x.local_reference && x.local_reference === reference);
      if (!l) return erro(404, `Não achei o lançamento ${reference} no extrato de ${dataBr(de)} a ${dataBr(ate)}. Informe a data (?data=AAAA-MM-DD).`, 'nao_encontrado');
      const pdf = montarPdfComprovante(l, { conta, empresa: empresas[conta], agora: agora() });
      const nome = `comprovante-${String(reference).replace(/[^A-Za-z0-9_-]/g, '')}.pdf`;
      if (String(query.formato).toLowerCase() === 'json') return { status: 200, corpo: { conta_id: conta, reference, nome, origem: 'ponte', pdf_base64: pdf.toString('base64'), lancamento: { ...l, conta_id: conta } } };
      return { status: 200, pdf, nome, cabecalhos: { 'X-Comprovante-Origem': 'ponte', 'Content-Disposition': `attachment; filename="${nome}"` } };
    }),
  ];
}
