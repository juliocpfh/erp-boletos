// Frente "mercado" (2026-11-16): o que era fixo da ANK no código (e-mail, assinaturas, conta da caução, locadora única,
// conta padrão dos boletos, Copel/Sanepar, Curitiba) passou ao cadastro da empresa. Para a ANK/JCK nada muda (resumos
// tirados ANTES da mudança, tests/mercado-fixo.mjs); para outra imobiliária, sai o que ela cadastrar. Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import { dadosDoEmail } from '../docs/js/email-dados.js';
import * as K from '../docs/js/contratos.js';
import { modeloEmail, montarEmail } from '../docs/js/modelos-email.js';
import * as R from '../docs/js/regras.js';
import { resumosGerados, textosGerados } from './mercado-fixo.mjs';

/** Resumo de cada texto gerado pelo cenário ANK/JCK com o código de ANTES da mudança (2026-11-16). */
const ANTES = {
  'contrato:Residencial:Maria Souza': 'cacdf38c56495cfa', // 24/11: + resumo em perguntas e respostas (#374) + tarifa do boleto (#376): só esses trechos mudam
  'contrato:Não residencial (comercial):Maria Souza': 'b47c975a0d744f63', // 24/11: + resumo em perguntas e respostas (#374) + tarifa do boleto (#376): só esses trechos mudam
  'locadoras:Maria Souza': 'c85480966d9c7b25',
  'representacao:Maria Souza': '264e192c61a07b4d',
  'cidade:Maria Souza': '377621052857a5ab',
  'contrato:Residencial:João Teste': 'ace9c1b6ecb39cdc', // 24/11: + resumo em perguntas e respostas (#374) + tarifa do boleto (#376): só esses trechos mudam
  'contrato:Não residencial (comercial):João Teste': 'a3bb7aeb5b05bd23', // 24/11: + resumo em perguntas e respostas (#374) + tarifa do boleto (#376): só esses trechos mudam
  'locadoras:João Teste': 'c85480966d9c7b25',
  'representacao:João Teste': '661b724dffaa2bb9',
  'cidade:João Teste': '377621052857a5ab',
  'email:ficha_envio': '16fae713ae62ca56',
  'email:ficha_aprovada': '911d169532402033', // mutirão 19/11 (lote E): sem "[preencher: valor_deposito]" na ficha
  'email:ficha_reprovada': '2ec4bc83fa516ae8',
  'email:ficha_devolucao': 'dede29cb5e188ee0',
  'email:contrato_assinar': 'c82dc0dcc10b4fe2',
  'email:contrato_assinado': '65654954ba3d9470', // mutirão 19/11 (lote E): "falta o depósito" sem a caução registrada
  'email:vistoria_assinada': 'f20a62fda5dbf4b4',
  'email:novo_valor': 'eab9c789f37c7c93',
  'email:aditivo_assinado': '548ec68b37e2cd44',
  'email:saida_aviso': 'c026d37a6466c076',
  'email:saida_vistoria': 'b6f5a0271f6b62c7',
  'email:saida_chaves': '354d50da0fb6ebba',
  'email:saida_calculo': '96b8482be28158a2',
  'email:saida_encerramento': '2d49059fc48148bb',
  'email:informe_ir': '71d02f294fa1f4be',
  'recibo:reserva:ficha': 'f488d655e0e2e151',
  'recibo:reserva:Maria Souza': '372d9a9245e9cb11',
  'recibo:reserva:João Teste': '5816468f00fd38ad',
  'recibo:devolucao_chaves:João Teste': '354c41db31cdeb74',
  'recibo:ficha:ficha': 'c1fb1b26d3b7215f',
  lembrete: '8efce35480e4a45e',
  conta_emissora: '30804615d55e104f',
};

test('ANK/JCK de hoje: contratos, e-mails, recibos, lembrete e conta dos boletos saem idênticos aos de antes', () => {
  const agora = resumosGerados();
  assert.deepEqual(Object.keys(agora).sort(), Object.keys(ANTES).sort());
  for (const [k, v] of Object.entries(ANTES)) assert.equal(agora[k], v, k);
  const t = textosGerados();
  assert.match(t['email:contrato_assinar'].texto, /Atenciosamente,\nAdministradora\nadministracao@ankjck\.com\.br$/);
  assert.match(t['email:contrato_assinar'].texto, /C\/C 36152656-3/);
  assert.match(t.lembrete.texto, /\n\nANK Administradora$/);
  assert.equal(t.conta_emissora, 'ank');
});

test('empresa gravada antes recebe uma vez os dados que eram fixos; empresa nova (formulário) fica em branco e não volta a ser preenchida', () => {
  const d = R.bancoVazio();
  R.normalizar(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  const jck = R.inserir(d, 'emitentes', { nome: 'JCK ADMINISTRADORA', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  R.normalizar(d);
  assert.equal(ank.assina_documentos, true);
  assert.equal(ank.email_contato, 'administracao@ankjck.com.br');
  assert.equal(jck.assina_documentos, false);
  assert.equal(jck.email_contato, undefined, 'e-mail e conta só na que assinava');
  assert.equal(jck.cidade_documentos, 'Curitiba');
  // o administrador desmarca e apaga o e-mail: normalizar não põe de volta
  Object.assign(ank, { assina_documentos: false, email_contato: null });
  R.normalizar(d);
  assert.equal(ank.assina_documentos, false);
  assert.equal(ank.email_contato, null);
  // empresa nova pelo formulário com "ANK" no nome: os campos vêm gravados (em branco), nada é preenchido
  const nova = R.inserir(d, 'emitentes', { nome: 'ANK IMÓVEIS', ativo: true, assina_documentos: false, email_contato: null, conta_deposito: null, cidade_documentos: null }, 'j');
  R.normalizar(d);
  assert.equal(nova.email_contato, null);
  assert.equal(nova.cidade_documentos, null);
});

/** Outra imobiliária: uma empresa só, de São Paulo, com os campos novos preenchidos. */
function outraImobiliaria(dados = {}) {
  const d = R.bancoVazio();
  R.normalizar(d);
  const e = R.inserir(d, 'emitentes', { nome: 'IMOBILIÁRIA EXEMPLO', razao_social: 'IMOBILIÁRIA EXEMPLO LTDA', cnpj: '11.222.333/0001-81', ativo: true, assina_documentos: true,
    cidade_documentos: 'São Paulo', energia_concessionaria: 'Enel Distribuição São Paulo (ENEL)', agua_concessionaria: 'Companhia de Saneamento Básico do Estado de São Paulo (SABESP)',
    email_contato: 'contato@exemplo.com.br', assinatura_email: 'Equipe Exemplo', assinatura_mensagens: 'Imobiliária Exemplo', conta_deposito: 'Banco 001 · Ag. 1234 · C/C 5678-9', uf_sede: 'SP', ...dados }, 'j');
  const i = R.inserir(d, 'imoveis', { nome: 'Casa 1', endereco: 'Rua Teste, 1', copel_uc: '999' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: e.id, percentual: 100 }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Paula Teste', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física', aluguel_inicial: 200000,
    dia_vencimento: 10, data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', prazo_meses: 30, prazo_tipo: 'Determinado', garantia_tipo: 'Caução', caucao_valor: 600000,
    conta_agua: 'Por conta do inquilino', conta_energia: 'Por conta do inquilino' }, 'j');
  R.normalizar(d);
  return { d, e, i, c };
}

const email = (d, chave, c) => montarEmail(modeloEmail(d, chave), dadosDoEmail(d, { contrato: c }, {}, '2026-11-12'));

test('outra imobiliária: contrato, e-mails e lembrete com os dados dela (nada da ANK, de Curitiba ou do Paraná)', () => {
  const { d, i, c } = outraImobiliaria();
  const dados = K.dadosDoContrato(d, c);
  assert.equal(dados.campos.cidade, 'São Paulo');
  assert.deepEqual(K.representacaoDoContrato(d, c, i), ['a Enel Distribuição São Paulo (ENEL), unidade consumidora nº 999', 'a Companhia de Saneamento Básico do Estado de São Paulo (SABESP)']);
  const e = email(d, 'contrato_assinar', c);
  assert.match(e.texto, /Banco 001 · Ag\. 1234 · C\/C 5678-9/);
  assert.match(e.texto, /Atenciosamente,\nEquipe Exemplo\ncontato@exemplo\.com\.br$/);
  assert.equal(dadosDoEmail(d, { contrato: c }, {}, '2026-11-12').campos.contas_concessionarias, 'água (Sabesp) e energia (Enel)');
  const tudo = JSON.stringify([dados.campos, e, email(d, 'contrato_assinado', c)]);
  assert.doesNotMatch(tudo, /ANK|ankjck|Curitiba|COPEL|SANEPAR|36152656/i);
  const cb = R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2026-12', vencimento: '2027-01-11', aluguel: 200000 }, 'j');
  assert.match(R.textoLembrete(d, cb, '2027-01-05').texto, /\n\nImobiliária Exemplo$/);
  // imóvel atendido por outra companhia: vale a do imóvel
  i.energia_concessionaria = 'o Departamento Municipal de Energia (DME)';
  assert.equal(K.representacaoDoContrato(d, c, i)[0], 'o Departamento Municipal de Energia (DME), unidade consumidora nº 999');
});

test('outra imobiliária sem os campos: e-mail pede a conta da caução e fecha com o nome da empresa; contrato sem companhia fixa', () => {
  const { d, i, c } = outraImobiliaria({ energia_concessionaria: null, agua_concessionaria: null, email_contato: null, assinatura_email: null, assinatura_mensagens: null, conta_deposito: null });
  const e = email(d, 'contrato_assinar', c);
  assert.match(e.texto, /\[preencher: conta_deposito\]/);
  assert.match(e.texto, /Atenciosamente,\nIMOBILIÁRIA EXEMPLO$/);
  assert.deepEqual(K.representacaoDoContrato(d, c, i), ['a companhia de energia elétrica, unidade consumidora nº 999', 'a companhia de água e esgoto']);
  const cb = R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2026-12', vencimento: '2027-01-11', aluguel: 200000 }, 'j');
  assert.match(R.textoLembrete(d, cb, '2027-01-05').texto, /\n\nIMOBILIÁRIA EXEMPLO$/);
});

test('nenhuma empresa marcada para assinar: os documentos saem pelas empresas do imóvel, sem procurar nome', () => {
  const { d, e, c } = outraImobiliaria({ assina_documentos: false });
  assert.deepEqual(K.locadorasDoContrato(d, c).map((x) => x.id), [e.id]);
  const outra = R.inserir(d, 'emitentes', { nome: 'ANK SEGUNDA', ativo: true, assina_documentos: false }, 'j');
  assert.ok(!K.locadorasDoContrato(d, c).includes(outra), 'o nome "ANK" não faz mais da empresa a locadora');
});

test('conta padrão dos boletos: a escolhida ou a primeira, sem procurar a de identificador "ank"', () => {
  const { d, e } = outraImobiliaria();
  const e2 = R.inserir(d, 'emitentes', { nome: 'OUTRA', ativo: true, assina_documentos: false }, 'j');
  R.salvarContaBanco(d, { id: 'loja', emitente_id: e.id }, 'j');
  R.salvarContaBanco(d, { id: 'ank', emitente_id: e2.id }, 'j');
  assert.equal(R.contaEmissora(d).id, 'loja', 'a conta "ank" cadastrada depois não vira a padrão');
});

test('"Cidade/UF" do imóvel: o Estado do imóvel, o do CEP ou o da sede da empresa (não mais "PR" fixo)', () => {
  const { d, e, i, c } = outraImobiliaria();
  Object.assign(i, { cidade: 'Campinas', bairro: 'Centro', uf: null, cep: null });
  assert.equal(K.cidadeUfDoImovel(d, i, c), 'Campinas/SP', 'imóvel sem Estado nem CEP: o da sede da empresa');
  assert.match(K.dadosDoContrato(d, c).campos.endereco_imovel, /Centro, Campinas\/SP$/);
  assert.match(dadosDoEmail(d, { contrato: c }, {}, '2026-11-12').campos.endereco, /Campinas\/SP$/);
  i.cep = '88010-000';
  assert.equal(K.cidadeUfDoImovel(d, i, c), 'Campinas/SC', 'com CEP: o Estado do CEP');
  i.uf = 'MG';
  assert.equal(K.cidadeUfDoImovel(d, i, c), 'Campinas/MG', 'com Estado no imóvel: o dele');
  Object.assign(i, { uf: null, cep: null });
  e.uf_sede = null;
  assert.equal(K.cidadeUfDoImovel(d, i, c), 'Campinas', 'nenhum Estado: só a cidade, sem inventar');
  assert.equal(K.cidadeUfDoImovel(d, { ...i, cidade: '' }, c), '');
  // empresa gravada antes do campo: fica com o que valia (PR); a gravada pelo formulário em branco não é preenchida
  const antiga = R.inserir(d, 'emitentes', { nome: 'ANTIGA', ativo: true, assina_documentos: false }, 'j');
  R.normalizar(d);
  assert.equal(antiga.uf_sede, 'PR');
  assert.equal(e.uf_sede, null);
});

test('nome curto da companhia (e-mails): a sigla entre parênteses', () => {
  assert.equal(K.nomeCurtoCompanhia('Companhia de Saneamento do Paraná (SANEPAR)'), 'Sanepar');
  assert.equal(K.nomeCurtoCompanhia('Light'), 'Light');
  assert.equal(K.nomeCurtoCompanhia(''), '');
});
