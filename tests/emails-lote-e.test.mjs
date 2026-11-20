// Mutirão de 19/11, lote E (e-mails e notificações): acerto final igual ao termo de quitação, caução ainda não depositada,
// ficha sem valor da caução, chaves entregues depois da entrada, multa da saída antecipada e trechos novos nos modelos gravados.
import assert from 'node:assert/strict';
import test from 'node:test';
import { dadosDoEmail } from '../docs/js/email-dados.js';
import { atualizarTextoEmail, modeloEmail, montarEmail } from '../docs/js/modelos-email.js';
import * as REC from '../docs/js/recibos.js';
import * as R from '../docs/js/regras.js';

function base(extra = {}) {
  const d = R.bancoVazio();
  R.normalizar(d);
  R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  R.normalizar(d);
  const i = R.inserir(d, 'imoveis', { nome: 'Flores 3', endereco: 'Rua das Flores, 120', complemento: 'Apto 3', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com', inquilino_tipo: 'Pessoa física',
    aluguel_inicial: 250000, desconto_pontualidade_percentual: 8, dia_vencimento: 10, data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', prazo_meses: 30, prazo_tipo: 'Determinado',
    garantia_tipo: 'Caução', caucao_meses: 2, caucao_valor: 486000, indice_correcao: 'IPCA', conta_agua: 'Por conta do inquilino', conta_energia: 'Por conta do inquilino', ...extra }, 'j');
  return { d, c, i };
}
const texto = (d, chave, alvo, hoje = '2026-11-20') => montarEmail(modeloEmail(d, chave), dadosDoEmail(d, alvo, {}, hoje)).texto;

test('acerto final com FCI: o e-mail traz as mesmas linhas do termo de quitação e a conta fecha', () => {
  const { d, c } = base({ data_saida: '2027-06-30' });
  // garantia corrigida R$ 5.940,00, FCI R$ 1.200,00, reparos R$ 800,00 pagos com o FCI, débitos R$ 1.000,00 → saldo R$ 5.340,00
  const e = R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2027-06-30', garantia_valor: 486000, garantia_corrigida: 594000, fci_credito: 120000, fci_danos: 80000,
    fci_usado: 80000, debitos: 100000, saldo: 534000 }, 'j');
  const linhas = REC.linhasDoAcerto(e);
  assert.deepEqual(linhas.map((x) => x[0]), ['Garantia depositada', 'Garantia corrigida até 30/06/2027', 'FCI corrigido (crédito do locatário)', '(-) Reparos pagos pelo FCI', '(-) Débitos', '= Saldo a devolver']);
  const t = texto(d, 'saida_calculo', { contrato: c });
  assert.match(t, /\(-\) Reparos pagos pelo FCI: R\$ 800,00/);
  assert.match(t, /= Saldo a devolver: R\$ 5\.340,00/);
  // a conta da lista fecha: 5.940 + 1.200 − 800 − 1.000 = 5.340
  assert.equal(594000 + 120000 - 80000 - 100000, 534000);
  // o termo de quitação usa as mesmas linhas (só os rótulos do fim mudam)
  assert.deepEqual(REC.linhasDoAcerto(e, { quitacao: true }).map((x) => x[1]), linhas.map((x) => x[1]));
  // saldo a cobrar: dados para pagar, sem prometer boleto que o sistema não gera
  const e2 = R.atualizar(d, 'encerramentos', e.id, { saldo: -30000 }, 'j');
  assert.ok(e2);
  const t2 = texto(d, 'saida_calculo', { contrato: c });
  assert.doesNotMatch(t2, /Segue o boleto do saldo/);
  assert.match(t2, /Falta pagar o saldo de R\$ 300,00/);
});

test('contrato assinado: "Recebemos a caução" só com o depósito registrado; antes, "falta o depósito"', () => {
  const { d, c } = base();
  assert.match(texto(d, 'contrato_assinado', { contrato: c }), /Falta o depósito da caução de R\$ 4\.860,00/);
  assert.doesNotMatch(texto(d, 'contrato_assinado', { contrato: c }), /Recebemos também/);
  R.atualizar(d, 'contratos', c.id, { comprovante_caucao: 'comprovante-caucao.pdf', caucao_data: '2026-11-25', caucao_pago_em: '2026-11-25' }, 'j');
  assert.match(texto(d, 'contrato_assinado', { contrato: R.buscar(d, 'contratos', c.id) }), /Recebemos também a caução de R\$ 4\.860,00 \(recibo e comprovante anexos\)/);
});

test('ficha aprovada com caução: sem o valor (a ficha não tem) e sem "[preencher"', () => {
  const { d, i } = base();
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física', imoveis_ids: [i.id], aluguel_inicial: 250000, dia_vencimento: 10, garantia_tipo: 'Caução', situacao: 'Em análise' }, 'j');
  const t = texto(d, 'ficha_aprovada', { ficha: f });
  assert.doesNotMatch(t, /\[preencher/);
  assert.match(t, /depósito da caução/);
});

test('boas-vindas e contra-vistoria: prazo contado do termo das chaves assinado, não da entrada', () => {
  const { d, c } = base({ doc_chaves_em: '2026-12-04' });
  assert.equal(R.dataDasChaves(c), '2026-12-04');
  const t = texto(d, 'vistoria_assinada', { contrato: c });
  assert.match(t, /chaves foram entregues em 04\/12\/2026/);
  assert.match(t, /até 11\/12\/2026 \(5 dias úteis\)/);
  assert.equal(R.dataDasChaves({ data_entrada: '2026-12-01' }), '2026-12-01');
});

test('multa da saída antecipada: 3 aluguéis proporcionais ao tempo que falta, só como sugestão', () => {
  // aluguel R$ 2.000,00, 30 meses de 01/01/2026 a 01/07/2028, saída em 01/09/2027 (faltam 10 meses) → R$ 2.000,00
  const { d, c } = base({ aluguel_inicial: 200000, data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01', data_saida: '2027-09-01' });
  const m = R.multaSaidaAntecipada(d, c);
  assert.equal(m.valor, 200000);
  assert.equal(m.fim, '2028-07-01');
  assert.equal(R.multaSaidaAntecipada(d, { ...c, data_saida: '2028-07-01' }), null, 'saída no fim: sem multa');
  assert.equal(R.multaSaidaAntecipada(d, { ...c, prazo_tipo: 'Indeterminado' }), null);
});

test('modelos já editados recebem os trechos novos (só se o trecho antigo estiver igual)', () => {
  const antigo = 'Olá![se dinheiro] Recebemos também a {tipo_deposito} de {valor_deposito} (recibo e comprovante anexos).[fim] Fim.';
  const novo = atualizarTextoEmail('contrato_assinado', antigo);
  assert.match(novo, /\[se garantia_depositada\]/);
  assert.equal(atualizarTextoEmail('contrato_assinado', novo), novo, 'não troca duas vezes');
  assert.equal(atualizarTextoEmail('contrato_assinado', 'Texto meu, sem o trecho.'), 'Texto meu, sem o trecho.');
  const { d } = base();
  R.inserir(d, 'modelos_email', { chave: 'ficha_envio', assunto: 'x', texto: 'Link do fiador (encaminhe para ele): {link_fiador}' }, 'j');
  assert.equal(modeloEmail(d, 'ficha_envio').texto, '{links_fiadores}');
});
