// Banco fictício do kit de teste (node tools/kit-teste.mjs): montado pelas próprias regras do sistema (docs/js/regras.js,
// inserir, gerar boleto, acordo, troca de titular, cálculo final, normalizar), num dia fixo (HOJE), para os valores esperados
// nas telas não mudarem de um dia para o outro. Só dados fictícios (CPF 529.982.247-25, CNPJ 11.222.333/0001-81).
// Caso novo: acrescente em montarBanco() e devolva o código em `ids`; o roteiro da tela lê `kit.ids.<nome>`.
import { camposDeSenha } from '../../docs/js/auth.js';
import * as C from '../../docs/js/calculos.js';
import * as NT from '../../docs/js/notificacoes.js';
import * as R from '../../docs/js/regras.js';

/** Dia do teste: o navegador fica com o relógio neste instante (12h de Brasília) e o banco é montado nele. */
export const HOJE = '2026-11-25';
export const INSTANTE = '2026-11-25T15:00:00.000Z';
export const FUSO = 'America/Sao_Paulo';
export const LOGIN = 'kit@exemplo.com.br'; // também o e-mail da nuvem local (EMAIL_TESTE): o cofre exige um administrador com ele
export const SENHA = 'frase do kit de teste 2026';
export const CPF = '529.982.247-25';
export const CNPJ = '11.222.333/0001-81';

/** Roda `fn` com o relógio do Node parado no INSTANTE (as regras usam new Date() para "hoje" e para as datas do histórico). */
async function noDiaDoTeste(fn) {
  const Real = globalThis.Date;
  const base = Real.parse(INSTANTE);
  const inicio = Real.now();
  class DataDoTeste extends Real {
    constructor(...a) { super(...(a.length ? a : [base + (Real.now() - inicio)])); }
    static now() { return base + (Real.now() - inicio); }
  }
  const tz = process.env.TZ;
  process.env.TZ = FUSO;
  globalThis.Date = DataDoTeste;
  try { return await fn(); } finally { globalThis.Date = Real; if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; }
}

/** Monta o banco. Devolve { banco, ids } (ids: códigos dos registros que os roteiros abrem). */
export function montarBanco() {
  return noDiaDoTeste(async () => {
    const u = 'kit';
    const d = R.bancoVazio();
    R.normalizar(d);
    R.inserir(d, 'usuarios', { login: LOGIN, email: LOGIN, nome: 'Dono do Kit', papel: 'admin', ativo: true, ...(await camposDeSenha(SENHA)), criado_em: new Date().toISOString() }, u, 'Administrador do kit de teste');
    const emp = R.inserir(d, 'emitentes', { nome: 'EMPRESA TESTE', razao_social: 'EMPRESA TESTE ADMINISTRADORA LTDA', cnpj: CNPJ, municipio: 'CURITIBA', endereco_sede: 'Rua Exemplo, 1', ativo: true,
      representante_nome: 'Ana Teste', email_contato: 'empresa@exemplo.com.br', conta_deposito: 'EMPRESA TESTE · Banco 336 (C6) · Ag. 0001 · C/C 1234-5 · Pix CNPJ 11.222.333/0001-81' }, u);
    const ids = { empresa: emp.id };
    let n = 0;
    const imovel = (nome) => {
      n += 1;
      const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome, endereco: `Rua do Kit, ${n * 10}`, complemento: `Casa ${n}`, bairro: 'Centro', cidade: 'Curitiba', uf: 'PR', cep: '80000-000' }, u);
      R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: emp.id, percentual: 100 }, u);
      return i;
    };
    const contrato = (i, campos) => R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_cpf: CPF, inquilino_tipo: 'Pessoa física', inquilino_email: 'inquilino@exemplo.com.br',
      inquilino_telefone: '(41) 99999-0000', prazo_meses: 30, prazo_tipo: 'Determinado', aluguel_inicial: 180000, bonificacao: false, dia_vencimento: 10, cobranca_mes_seguinte: true,
      multa_percentual: 2, juros_mensal_percentual: 1, finalidade: 'Residencial', garantia_tipo: 'Fiador', nao_cobrar_tarifa: true, ...campos }, u);
    const boleto = (c, comp) => R.inserir(d, 'cobrancas', R.montarCobranca(d, R.buscar(d, 'contratos', c.id), comp), u, `Boleto ${comp} (kit)`);
    const pagar = (cb) => R.registrarPagamento(d, cb.id, cb.vencimento, R.totais(cb).a_pagar_pontual, u, { pagouEmDia: true });
    const notificarAtraso = (c, data) => {
      const x = { data, prazo_dias: 10 };
      const t = NT.textoDoModelo(d, c, x, 'atraso');
      const nt = R.criarNotificacao(d, { contrato_id: c.id, modelo: 'atraso', ...x, assunto: t.assunto, clausula: t.clausula, texto: t.texto }, u);
      R.marcarNotificacaoEnviada(d, nt.id, { data, meio: 'E-mail' }, u);
      return nt;
    };

    // 1. Contrato com caução; boleto 11/2026 em aberto (vence 10/12) com o PDF do banco anexado e a tarifa de R$ 8,50
    const ana = contrato(imovel('Kit Caução'), { inquilino_nome: 'Ana Caução Teste', data_entrada: '2026-11-01', vigencia_inicio: '2026-11-01', vigencia_fim: '2029-04-30',
      garantia_tipo: 'Caução', caucao_valor: 540000, nao_cobrar_tarifa: false, taxa_boleto: 850 });
    R.inserir(d, 'depositos_garantia', { contrato_id: ana.id, qual: 'caucao', valor: 540000, data: '2026-11-01' }, u);
    const anaNov = boleto(ana, '2026-11');
    R.anexarBoletoPdf(d, anaNov.id, 'boleto-11-2026.pdf', u);
    Object.assign(ids, { ana: ana.id, anaBoleto: anaNov.id });

    // 2. Contrato com fiador; boleto 10/2026 atrasado (venceu 10/11) com a notificação "Aluguel em atraso"; 11/2026 em aberto
    const bruno = contrato(imovel('Kit Fiador'), { inquilino_nome: 'Bruno Fiador Teste', aluguel_inicial: 200000, data_entrada: '2026-09-01', vigencia_inicio: '2026-09-01', vigencia_fim: '2029-02-28' });
    R.inserir(d, 'fiadores', { contrato_id: bruno.id, nome: 'Carlos Fiador Teste', cpf: CPF, email: 'fiador@exemplo.com.br' }, u);
    pagar(boleto(bruno, '2026-09'));
    const brunoOut = boleto(bruno, '2026-10');
    boleto(bruno, '2026-11');
    const notif = notificarAtraso(bruno, '2026-11-20');
    Object.assign(ids, { bruno: bruno.id, brunoAtrasado: brunoOut.id, notificacao: notif.id });

    // 3. Acordo com honorários (boletos 08 e 09/2026 com mais de 30 dias, aviso por escrito e advogado registrados)
    const carla = contrato(imovel('Kit Acordo'), { inquilino_nome: 'Carla Acordo Teste', data_entrada: '2026-08-01', vigencia_inicio: '2026-08-01', vigencia_fim: '2029-01-31' });
    const ago = boleto(carla, '2026-08');
    const set = boleto(carla, '2026-09');
    pagar(boleto(carla, '2026-10'));
    boleto(carla, '2026-11');
    R.inserir(d, 'cobranca_registros', { contrato_id: carla.id, data: '2026-10-20', tipo: 'Notificação', descricao: 'Aviso por e-mail', arquivos: [] }, u);
    R.inserir(d, 'cobranca_registros', { contrato_id: carla.id, data: '2026-11-12', tipo: 'Advogado', advogado: 'Dr. Exemplo Teste, OAB/PR 12.345', descricao: 'Advogado atuando', arquivos: [] }, u);
    const total = C.liquidar(ago, HOJE).valor_devido + C.liquidar(set, HOJE).valor_devido;
    const { acordo, parcelas } = R.fazerAcordo(d, { contrato_id: carla.id, ids: [ago.id, set.id], total, parcelas: 2, primeiro_vencimento: '2026-12-10', cobranca: { honorarios: true } }, u, HOJE);
    Object.assign(ids, { carla: carla.id, acordo: acordo.id, acordoParcela: parcelas[0].id });

    // 4. Entrada no meio do mês: 16/11/2026 → 15 de 30 dias (proporcional)
    const diego = contrato(imovel('Kit Proporcional'), { inquilino_nome: 'Diego Proporcional Teste', data_entrada: '2026-11-16', vigencia_inicio: '2026-11-16', vigencia_fim: '2029-05-15' });
    const diegoNov = boleto(diego, '2026-11');
    Object.assign(ids, { diego: diego.id, diegoBoleto: diegoNov.id });

    // 5. Troca de titular: Elisa sai e Fábio entra em 01/11/2026 (termo da troca assinado, garantia fiador)
    const imElisa = imovel('Kit Troca');
    const elisa = contrato(imElisa, { inquilino_nome: 'Elisa Anterior Teste', data_entrada: '2026-07-01', vigencia_inicio: '2026-07-01', vigencia_fim: '2028-12-31' });
    for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) pagar(boleto(elisa, m));
    const { id: _id, ...resto } = R.buscar(d, 'contratos', elisa.id); // eslint-disable-line no-unused-vars
    const fabio = R.inserir(d, 'contratos', { ...resto, inquilino_nome: 'Fábio Novo Teste', contrato_anterior_id: elisa.id, data_entrada: '2026-11-01', vigencia_inicio: '2026-11-01', garantia_na_troca: 'nova' }, u);
    R.inserir(d, 'aditivos', { contrato_id: fabio.id, imovel_id: imElisa.id, tipo: 'Troca de titular', data: '2026-10-25', assunto: 'Troca de titular', texto: 'Termo da troca (kit)', arquivo: 'termo-troca.pdf' }, u);
    R.transferirHeranca(d, fabio.id, u, HOJE);
    boleto(R.buscar(d, 'contratos', fabio.id), '2026-11');
    Object.assign(ids, { elisa: elisa.id, fabio: fabio.id });

    // 6. Saída com cálculo final: Gabriel saiu em 15/11/2026; caução R$ 4.000,00 − pintura R$ 600,00 = R$ 3.400,00 a devolver
    const gabriel = contrato(imovel('Kit Saída'), { inquilino_nome: 'Gabriel Saída Teste', data_entrada: '2026-05-01', vigencia_inicio: '2026-05-01', vigencia_fim: '2028-10-31',
      garantia_tipo: 'Caução', caucao_valor: 400000 });
    R.inserir(d, 'depositos_garantia', { contrato_id: gabriel.id, qual: 'caucao', valor: 400000, data: '2026-05-01' }, u);
    for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) pagar(boleto(gabriel, m));
    R.atualizar(d, 'contratos', gabriel.id, { data_saida: '2026-11-15' }, u);
    const enc = R.encerrarContrato(d, gabriel.id, { data_saida: '2026-11-15', garantia_valor: 400000, indice_percentual: 0, debitos: 60000, debitos_descricao: 'Pintura: R$ 600,00',
      fci_credito: 0, fci_danos: 0, creditos: 0, vistoria_saida: 'Não feita', leitura_agua: '100', leitura_energia: '200' }, u, HOJE);
    Object.assign(ids, { gabriel: gabriel.id, encerramento: enc.id });

    // 7. Saída hoje ainda sem cálculo final: Helena, caução R$ 5.400,00 e o boleto 10/2026 de R$ 1.800,00 em aberto (PDF do banco)
    const helena = contrato(imovel('Kit Cálculo final'), { inquilino_nome: 'Helena Cálculo Teste', data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', vigencia_fim: '2028-11-30',
      garantia_tipo: 'Caução', caucao_valor: 540000, multa_percentual: 0, juros_mensal_percentual: 0, dia_vencimento: 14 });
    R.inserir(d, 'depositos_garantia', { contrato_id: helena.id, qual: 'caucao', valor: 540000, data: '2026-06-01' }, u);
    for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) pagar(boleto(helena, m));
    const helOut = boleto(helena, '2026-10');
    R.anexarBoletoPdf(d, helOut.id, 'boleto-10-2026.pdf', u);
    R.atualizar(d, 'contratos', helena.id, { data_saida: HOJE }, u);
    Object.assign(ids, { helena: helena.id, helenaBoleto: helOut.id });

    // 8. Ficha em análise com o termo da reserva aceito (reserva combinada de R$ 500,00), num imóvel vago
    const vago = imovel('Kit Ficha');
    const ficha = R.inserir(d, 'fichas', { inquilino_nome: 'Igor Ficha Teste', inquilino_cpf: CPF, inquilino_tipo: 'Pessoa física', inquilino_email: 'ficha@exemplo.com.br',
      imoveis_ids: [vago.id], situacao: 'Em análise', data_recebida: '2026-11-23', aluguel_inicial: 190000, dia_vencimento: 10, garantia_tipo: 'Fiador', prazo_meses: 30,
      reserva_combinada: 50000, requisitos: 'Renda de pelo menos 3 vezes o aluguel' }, u);
    R.guardarAceiteReserva(d, ficha.id, { em: '2026-11-24T13:00:00.000Z', email: 'ficha@exemplo.com.br', ip: '203.0.113.7', aparelho: 'Kit/1.0',
      texto_aceito: 'TERMO DE ACEITE DA RESERVA DE IMÓVEL (kit de teste)', texto_sha256: 'a'.repeat(64), condicoes: R.condicoesDaReservaAgora(), reserva_valor: 50000 }, u);
    Object.assign(ids, { ficha: ficha.id, imovelVago: vago.id });

    R.normalizar(d);
    d.revisao = (d.revisao || 0) + 1;
    return { banco: d, ids };
  });
}
