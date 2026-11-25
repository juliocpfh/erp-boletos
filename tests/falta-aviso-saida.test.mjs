// Multa pela falta do aviso de 30 dias na saída (contrato: 1 mês de aluguel e encargos; Lei 8.245/91, art. 6º), só como
// sugestão do cálculo final (regra falta_aviso_saida: proporcional aos dias que faltaram, padrão; mês inteiro; não sugerir).
// Se couber também a multa da saída antecipada, vale só a maior das duas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as CR from '../docs/js/config-regras.js';
import * as R from '../docs/js/regras.js';

function base(extra = {}) {
  const d = R.bancoVazio();
  R.normalizar(d);
  const i = R.inserir(d, 'imoveis', { nome: 'Flores 3', endereco: 'Rua das Flores, 120' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria de Teste', inquilino_cpf: '529.982.247-25', aluguel_inicial: 180000,
    dia_vencimento: 10, data_entrada: '2024-01-01', vigencia_inicio: '2024-01-01', prazo_meses: 30, prazo_tipo: 'Indeterminado', ...extra }, 'j');
  return { d, c };
}
const sair = (d, c, saida, aviso, hoje = '2026-11-10') => { R.informarSaida(d, c.id, saida, 'j', hoje, aviso); return R.buscar(d, 'contratos', c.id); };

test('regra nova com padrão proporcional, explicação, consequência e lei', () => {
  const r = CR.DEFINICOES_REGRAS.find((x) => x.chave === 'falta_aviso_saida');
  assert.equal(r.padrao, 'proporcional');
  assert.deepEqual(r.opcoes.map((o) => o[0]), ['proporcional', 'mes_inteiro', 'nao_sugerir']);
  assert.match(r.lei, /art\. 6º/);
  assert.ok(r.explica && r.consequencia);
  assert.ok(CR.podePorContrato('falta_aviso_saida'), 'vale a regra especial do contrato');
});

test('avisou 30 dias antes: sem multa', () => {
  const { d, c } = base();
  const x = sair(d, c, '2026-12-10', { data: '2026-11-10' });
  assert.equal(x.aviso_saida_data, '2026-11-10');
  assert.equal(R.multaFaltaAviso(d, x), null);
  assert.equal(R.multaFaltaAviso(d, sair(d, c, '2026-12-20', { data: '2026-11-10' })), null, '40 dias: sem multa');
});

test('avisou 15 dias antes (10/11 → 25/11): R$ 1.800,00 × 15/30 = R$ 900,00; mês inteiro = R$ 1.800,00', () => {
  const { d, c } = base();
  const x = sair(d, c, '2026-11-25', { data: '2026-11-10' });
  const m = R.multaFaltaAviso(d, x);
  assert.equal(m.antecedencia, 15);
  assert.equal(m.faltaram, 15);
  assert.equal(m.valor, 90000);
  CR.usarRegras({ config_regras: [{ chave: 'falta_aviso_saida', valor: 'mes_inteiro' }] });
  try { assert.equal(R.multaFaltaAviso(d, x).valor, 180000); } finally { CR.usarRegras(null); }
  CR.usarRegras({ config_regras: [{ chave: 'falta_aviso_saida', valor: 'nao_sugerir' }] });
  try { assert.equal(R.multaFaltaAviso(d, x), null); } finally { CR.usarRegras(null); }
});

test('adiar a saída para completar os 30 dias tira a multa', () => {
  const { d, c } = base();
  sair(d, c, '2026-11-25', { data: '2026-11-10' });
  const x = sair(d, c, '2026-12-10', undefined); // "Adiar ou mudar a data" sem mexer no aviso: fica o gravado
  assert.equal(x.aviso_saida_data, '2026-11-10');
  assert.equal(R.multaFaltaAviso(d, x), null);
});

test('sem aviso: 1 mês de aluguel e encargos (IPTU e seguro do último boleto de mês inteiro)', () => {
  const { d, c } = base();
  R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2026-10', vencimento: '2026-11-10', aluguel: 180000, desconto: 0, iptu: 12000, seguro: 3000, dias_cobrados: 30, dias_mes: 30 }, 'j');
  R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2026-11', vencimento: '2026-12-10', aluguel: 150000, desconto: 0, iptu: 10000, seguro: 2500, dias_cobrados: 25, dias_mes: 30 }, 'j');
  const x = sair(d, c, '2026-11-25', { sem: true });
  assert.equal(x.aviso_saida_sem, true);
  assert.equal(x.aviso_saida_data, null);
  const m = R.multaFaltaAviso(d, x);
  assert.equal(m.sem_aviso, true);
  assert.equal(m.faltaram, 30);
  assert.equal(m.encargos, 15000);
  assert.equal(m.valor, 195000);
});

test('sem a data do aviso registrada: nada sugerido; desfazer a saída limpa o aviso', () => {
  const { d, c } = base();
  const x = sair(d, c, '2026-11-25', undefined);
  assert.equal(R.multaFaltaAviso(d, x), null);
  sair(d, c, '2026-11-25', { data: '2026-11-10' });
  R.desfazerSaida(d, c.id, 'j');
  const y = R.buscar(d, 'contratos', c.id);
  assert.equal(y.aviso_saida_data, null);
  assert.equal(y.aviso_saida_sem, false);
});

test('aviso depois da saída ou antes da entrada é recusado', () => {
  const { d, c } = base();
  assert.throws(() => sair(d, c, '2026-11-25', { data: '2026-11-26' }), /depois da data de saída/);
  assert.throws(() => sair(d, c, '2026-11-25', { data: '2023-12-31' }), /antes da entrada/);
});

test('contrato ainda no prazo: antecipada e falta do aviso não se somam, vale a maior', () => {
  // aluguel R$ 1.800,00, 30 meses de 01/01/2026 a 01/07/2028; saída em 01/09/2027 (faltam 10 meses) → antecipada R$ 1.800,00
  const { d, c } = base({ data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01', prazo_tipo: 'Determinado' });
  let x = sair(d, c, '2027-09-01', { data: '2027-08-17' }); // 15 dias de aviso → R$ 900,00
  let m = R.multasDaSaida(d, x);
  assert.equal(m.antecipada.valor, 180000);
  assert.equal(m.aviso.valor, 90000);
  assert.equal(m.vale, 'antecipada');
  // saída em 01/06/2028 (falta 1 mês: antecipada ≈ R$ 177,63) sem aviso (R$ 1.800,00) → vale a do aviso
  x = sair(d, c, '2028-06-01', { sem: true }, '2028-05-20');
  m = R.multasDaSaida(d, x);
  assert.ok(m.antecipada.valor < m.aviso.valor);
  assert.equal(m.aviso.valor, 180000);
  assert.equal(m.vale, 'aviso');
  // avisou 30 dias antes: só a antecipada
  x = sair(d, c, '2027-09-01', { data: '2027-08-02' }, '2027-08-02');
  m = R.multasDaSaida(d, x);
  assert.equal(m.aviso, null);
  assert.equal(m.vale, 'antecipada');
});

test('descrição da multa acompanha o valor gravado: sugerida R$ 900,00, gravada R$ 600,00 (25/11)', () => {
  const { d, c } = base();
  const x = sair(d, c, '2026-11-25', { data: '2026-11-10' });
  const sugerida = R.linhaDaMultaSaida(d, x, 'aviso');
  assert.equal(sugerida, 'Multa pela falta do aviso de 30 dias: R$ 900,00 (avisou em 10/11/2026, 15 dia(s) antes da saída; R$ 1.800,00 × 15/30 dias que faltaram)');
  assert.equal(R.linhaDaMultaSaida(d, x, 'aviso', 90000), sugerida, 'pelo valor sugerido, a conta inteira');
  const ajustada = R.linhaDaMultaSaida(d, x, 'aviso', 60000);
  assert.equal(ajustada, 'Multa pela falta do aviso de 30 dias (valor ajustado à mão: R$ 600,00; sugerido R$ 900,00)');
  assert.equal(R.linhaDaMultaSaida(d, x, 'antecipada', 60000), '', 'contrato sem prazo: sem multa da saída antecipada');
  // a troca na descrição: só a linha da multa muda; sem a linha (o operador mudou o texto), fica como está
  const desc = `Aluguel 11/2026: R$ 1.500,00\n${sugerida}`;
  assert.equal(R.trocarLinhaDaMulta(desc, sugerida, ajustada), `Aluguel 11/2026: R$ 1.500,00\n${ajustada}`);
  assert.equal(R.trocarLinhaDaMulta(desc, sugerida, ''), 'Aluguel 11/2026: R$ 1.500,00', 'multa tirada dos débitos: some a linha');
  assert.equal(R.trocarLinhaDaMulta('Multa combinada com o inquilino: R$ 500,00', sugerida, ajustada), null);
});

test('saída antecipada mudada à mão: a descrição também acompanha', () => {
  const { d, c } = base({ data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01', prazo_tipo: 'Determinado' });
  const x = sair(d, c, '2027-09-01', { data: '2027-08-02' }, '2027-08-02');
  assert.match(R.linhaDaMultaSaida(d, x, 'antecipada'), /^Multa pela saída antecipada: R\$ 1\.800,00 \(3 aluguéis de R\$ 1\.800,00, proporcional aos \d+ de \d+ dias que faltavam para 01\/07\/2028\)$/);
  assert.equal(R.linhaDaMultaSaida(d, x, 'antecipada', 120000), 'Multa pela saída antecipada (valor ajustado à mão: R$ 1.200,00; sugerido R$ 1.800,00)');
});
