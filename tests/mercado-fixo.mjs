// Cenário fixo de uma empresa como a de hoje (ANK + JCK, dados fictícios) e tudo o que ele gera em texto: contratos,
// e-mails, recibos, carta, lembrete e conta dos boletos. tests/mercado.test.mjs confere que nada mudou (resumo de cada texto)
// depois de tirar do código o que era fixo da ANK (e-mail, conta da caução, Copel/Sanepar, Curitiba, "locadora única").
import { createHash } from 'node:crypto';
import { dadosDoEmail } from '../docs/js/email-dados.js';
import * as K from '../docs/js/contratos.js';
import { MODELOS_EMAIL, modeloEmail, montarEmail } from '../docs/js/modelos-email.js';
import { TIPOS_RECIBO, montarRecibo, reciboDisponivel } from '../docs/js/recibos.js';
import * as R from '../docs/js/regras.js';

/** Banco com ANK e JCK (nomes como os de hoje, CNPJ de teste), dois imóveis (um sem cidade), contrato com caução e ficha. */
export function cenario() {
  const d = R.bancoVazio();
  R.normalizar(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true,
    endereco_sede: 'Rua Exemplo, nº 10, Centro, Curitiba, Paraná', representante_nome: 'Ana Teste', representante_cargo: 'sócia administradora' }, 'j');
  const jck = R.inserir(d, 'emitentes', { nome: 'JCK ADMINISTRADORA', razao_social: 'JCK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'j');
  // dados antigos: as empresas ainda sem os campos novos (como estão gravadas hoje); normalizar acerta
  for (const e of d.emitentes) for (const k of Object.keys(e)) if (!['id', 'nome', 'razao_social', 'cnpj', 'municipio', 'ativo', 'endereco_sede', 'representante_nome', 'representante_cargo', 'criado_em', 'criado_por', 'alterado_em', 'alterado_por'].includes(k)) delete e[k];
  const i = R.inserir(d, 'imoveis', { nome: 'Flores 3', endereco: 'Rua das Flores, 120', complemento: 'Apto 3', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR',
    copel_uc: '12345', copel_medidor: 'M1', sanepar_matricula: '777', sanepar_hidrometro: 'A9' }, 'j');
  const semCidade = R.inserir(d, 'imoveis', { nome: 'Loja 9', endereco: 'Rua Sem Cidade, 9' }, 'j');
  for (const im of [i, semCidade]) {
    R.inserir(d, 'participacoes', { imovel_id: im.id, emitente_id: ank.id, percentual: 50 }, 'j');
    R.inserir(d, 'participacoes', { imovel_id: im.id, emitente_id: jck.id, percentual: 50 }, 'j');
  }
  const comum = { inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com', inquilino_tipo: 'Pessoa física',
    aluguel_inicial: 250000, desconto_pontualidade_percentual: 8, dia_vencimento: 10, data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', vigencia_fim: '2029-05-31', prazo_meses: 30, prazo_tipo: 'Determinado',
    garantia_tipo: 'Caução', caucao_meses: 3, caucao_valor: 690000, indice_correcao: 'IPCA', reserva_valor: 50000, reserva_data: '2026-11-12', finalidade: 'Residencial',
    conta_agua: 'Por conta do inquilino', conta_energia: 'Por conta do inquilino', conta_iptu: 'Por conta do inquilino', conta_seguro: 'Por conta do inquilino', conta_gas: 'Por conta do inquilino' };
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria Souza', ...comum }, 'j');
  const c2 = R.inserir(d, 'contratos', { imovel_id: semCidade.id, inquilino_nome: 'João Teste', ...comum, finalidade: 'Não residencial', atividade: 'comércio', data_saida: '2027-06-15' }, 'j');
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física', imoveis_ids: [i.id], aluguel_inicial: 250000,
    desconto_pontualidade_percentual: 8, dia_vencimento: 10, garantia_tipo: 'Caução', reserva_valor: 50000, reserva_data: '2026-11-12', situacao: 'Em análise' }, 'j');
  const cb = R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2026-12', vencimento: '2027-01-11', aluguel: 250000, desconto: 20000, multa_percentual: 2, juros_mensal_percentual: 1 }, 'j');
  R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2027-06-15', garantia_valor: 690000, garantia_corrigida: 698510, debitos: 195198, saldo: 503312 }, 'j');
  // contas do banco cadastradas como hoje: a JCK primeiro, sem conta padrão escolhida (cai na "ank")
  d.config_banco.contas = [{ ...R.CONTA_BANCO_PADRAO, id: 'jck', apelido: 'JCK', emitente_id: jck.id }, { ...R.CONTA_BANCO_PADRAO, id: 'ank', apelido: 'ANK', emitente_id: ank.id }];
  d.config_banco.conta_padrao_id = '';
  R.normalizar(d);
  return { d, c, c2, f, cb };
}

const resumo = (x) => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 16);

/** Tudo o que o cenário gera, pelo nome: { 'contrato:...': texto, ... }. */
export function textosGerados() {
  const { d, c, c2, f, cb } = cenario();
  const out = {};
  for (const cc of [c, c2]) {
    for (const m of K.modelosDe(d)) out[`contrato:${m.nome}:${cc.inquilino_nome}`] = K.montarContrato(m.texto, K.dadosDoContrato(d, cc, { data: '2026-11-20' }));
    out[`locadoras:${cc.inquilino_nome}`] = K.locadorasDoContrato(d, cc).map((e) => e.nome);
    out[`representacao:${cc.inquilino_nome}`] = K.representacaoDoContrato(d, cc, R.buscar(d, 'imoveis', cc.imovel_id));
    out[`cidade:${cc.inquilino_nome}`] = K.dadosDoContrato(d, cc).campos.cidade;
  }
  for (const m of MODELOS_EMAIL) {
    if (m.boleto || m.notificacao) continue; // régua de cobrança (2026-11-16) e notificação (2026-11-17), depois do resumo: tests/regua-email.test.mjs, tests/notificacoes.test.mjs
    const alvo = m.chave.startsWith('ficha') ? { ficha: f } : { contrato: c };
    out[`email:${m.chave}`] = montarEmail(modeloEmail(d, m.chave), dadosDoEmail(d, alvo, {}, '2026-11-12'));
  }
  for (const tipo of Object.keys(TIPOS_RECIBO)) {
    for (const alvo of [{ ficha: f }, { contrato: c }, { contrato: c2 }]) {
      if (!reciboDisponivel(d, tipo, alvo).ok) continue;
      const r = montarRecibo(d, tipo, alvo, '2026-11-20');
      out[`recibo:${tipo}:${alvo.ficha ? 'ficha' : alvo.contrato.inquilino_nome}`] = { ...r, emitente: r.emitente.nome };
    }
  }
  out.lembrete = R.textoLembrete(d, cb, '2027-01-05');
  out.conta_emissora = (R.contaEmissora(d) || {}).id;
  return out;
}

export const resumosGerados = () => Object.fromEntries(Object.entries(textosGerados()).map(([k, v]) => [k, resumo(v)]));

if (process.argv[2] === '--mostrar') console.log(JSON.stringify(process.argv[3] === 'resumos' ? resumosGerados() : textosGerados(), null, 2));
