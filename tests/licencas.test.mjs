// Licenças por chave (nuvem/licencas.mjs): chave, ficha, ativação de uso único, renovação somando o prazo, situação
// numa data (aviso, carência, só leitura, apagar), limites do plano e certificado Ed25519 conferido sem internet.
// Empresa e CNPJ fictícios (CNPJ de teste 11.222.333/0001-81).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as L from '../nuvem/licencas.mjs';

const CNPJ = '11.222.333/0001-81';
const fixo = (n) => (b) => { b.fill(n); return b; };
const ficha = (plano = 'anual2', criada = '2027-01-10', extra = {}) => L.novaFicha({ plano, vendedor: 'Carlos@Exemplo.com.br', criada, cliente: 'Silva Patrimonial', ...extra });
const ativada = (plano = 'anual2', hoje = '2027-01-20') => L.ativar(ficha(plano), { empresa: 'silva', nome: 'Silva Patrimonial Ltda', cnpjs: [CNPJ], hoje, por: 'maria@exemplo.com.br' });

test('chave: formato IMOV-XXXX-XXXX-XXXX-XXXX, sem O/0/I/1, e normalização do que o cliente digita', () => {
  for (let i = 0; i < 200; i += 1) {
    const c = L.sortearChave();
    assert.match(c, /^IMOV-[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
    assert.equal(L.normalizarChave(c), c);
  }
  assert.equal(L.ALFABETO.length, 32);
  assert.ok(!/[O0I1]/.test(L.ALFABETO));
  assert.equal(L.sortearChave(fixo(0)), 'IMOV-AAAA-AAAA-AAAA-AAAA');
  assert.equal(L.normalizarChave(' imov 7k4q-m9tx 2bhd-r8wc '), 'IMOV-7K4Q-M9TX-2BHD-R8WC');
  assert.equal(L.normalizarChave('7K4QM9TX2BHDR8WC'), 'IMOV-7K4Q-M9TX-2BHD-R8WC');
  assert.equal(L.normalizarChave('IMOV-7K4Q-M9TX-2BHD-R8W0'), '', 'zero não existe na chave');
  assert.equal(L.normalizarChave('IMOV-7K4Q'), '');
  assert.equal(L.fimDaChave('IMOV-7K4Q-M9TX-2BHD-R8WC'), 'IMOV-…-R8WC');
});

test('datas: soma de meses no fim do mês e dias entre datas', () => {
  assert.equal(L.somarMeses('2027-01-20', 24), '2029-01-20');
  assert.equal(L.somarMeses('2027-01-31', 1), '2027-02-28');
  assert.equal(L.somarMeses('2028-01-31', 1), '2028-02-29');
  assert.equal(L.somarMeses('2029-04-20', -1), '2029-03-20');
  assert.equal(L.somarDias('2029-01-20', 15), '2029-02-04');
  assert.equal(L.diasEntre('2028-11-21', '2029-01-20'), 60);
  assert.equal(L.hojeBR(new Date('2027-01-21T02:30:00Z')), '2027-01-20', 'meia-noite em Brasília ainda é o dia anterior');
  assert.throws(() => L.somarDias('2027-02-30', 1), /Data inválida/);
});

test('ficha da chave: plano, limites do plano básico, vendedor e prazo de 90 dias para usar', () => {
  const f = ficha();
  assert.equal(f.plano, 'anual2');
  assert.deepEqual(f.duracao, { meses: 24 });
  assert.deepEqual(f.limites, { imoveis: 20, inquilinos: 20, usuarios: 4, cnpjs: 2 });
  assert.equal(f.vendedor, 'carlos@exemplo.com.br');
  assert.equal(f.usar_ate, '2027-04-10');
  assert.equal(f.usada_por, null);
  assert.equal(f.revogada, null);
  assert.deepEqual(L.novaFicha({ plano: 'anual', vendedor: 'x@exemplo.com.br', criada: '2027-01-10', limites: { imoveis: 50 } }).limites.imoveis, 50);
  assert.throws(() => L.novaFicha({ plano: 'vitalicio', vendedor: 'x', criada: '2027-01-10' }), /Plano desconhecido/);
  assert.throws(() => L.novaFicha({ plano: 'anual', vendedor: 'x', criada: '2027-01-10', limites: { usuarios: 0 } }), /Limite inválido/);
  assert.deepEqual(L.PLANOS.teste.duracao, { dias: 30 });
  assert.deepEqual(L.PLANOS.mensal.duracao, { meses: 1 });
});

test('ativar: 20/01/2027 por 2 anos → até 20/01/2029; a chave só serve uma vez', () => {
  const { ficha: f, licenca } = ativada();
  assert.equal(licenca.ate, '2029-01-20');
  assert.equal(licenca.inicio, '2027-01-20');
  assert.deepEqual(licenca.cnpjs, ['11222333000181']);
  assert.equal(f.usada_por, 'silva');
  assert.equal(f.usada_em, '2027-01-20');
  assert.throws(() => L.ativar(f, { empresa: 'souza', nome: 'Souza', cnpjs: [CNPJ], hoje: '2027-01-21' }, { silva: 'Silva Patrimonial Ltda' }),
    /já foi usada pela empresa Silva Patrimonial Ltda em 20\/01\/2027/);
});

test('ativar: chave revogada, vencida sem uso (90 dias), CNPJ inválido e mais de 2 CNPJs são recusados', () => {
  const f = ficha('anual', '2027-01-10');
  const dados = { empresa: 'silva', nome: 'Silva', cnpjs: [CNPJ], hoje: '2027-04-11' };
  assert.throws(() => L.ativar(f, dados), /venceu sem ser usada em 10\/04\/2027/);
  assert.doesNotThrow(() => L.ativar(f, { ...dados, hoje: '2027-04-10' }));
  const rev = L.revogar(f, { motivo: 'e-mail errado', por: 'dono@exemplo.com.br', hoje: '2027-01-11' });
  assert.throws(() => L.ativar(rev, { ...dados, hoje: '2027-01-12' }), /cancelada/);
  assert.throws(() => L.ativar(f, { ...dados, hoje: '2027-01-12', cnpjs: ['11.222.333/0001-82'] }), /CNPJ inválido/);
  assert.throws(() => L.ativar(f, { ...dados, hoje: '2027-01-12', cnpjs: [CNPJ, '11.444.777/0001-61', '45.723.174/0001-10'] }), /no máximo 2 empresas/);
  assert.equal(L.ativar(f, { ...dados, hoje: '2027-01-12', cnpjs: [CNPJ, '11222333000181'] }).licenca.cnpjs.length, 1, 'CNPJ repetido conta uma vez');
  assert.throws(() => L.ativar(f, { ...dados, hoje: '2027-01-12', empresa: 'Silva Ltda' }), /Código da empresa/);
  assert.throws(() => L.ativar(null, { ...dados, hoje: '2027-01-12' }), /não encontrada/);
});

test('renovar antes de vencer soma à data antiga; depois de vencer conta da renovação', () => {
  const { licenca } = ativada();
  const antes = L.renovar(licenca, ficha('anual', '2029-01-05'), { hoje: '2029-01-10' });
  assert.equal(antes.licenca.ate, '2030-01-20', 'não perde os 10 dias');
  assert.equal(antes.licenca.chaves.length, 2);
  assert.equal(antes.ficha.usada_por, 'silva');
  const depois = L.renovar(licenca, ficha('anual', '2029-02-01'), { hoje: '2029-02-10' });
  assert.equal(depois.licenca.ate, '2030-02-10');
  assert.throws(() => L.renovar(licenca, antes.ficha, { hoje: '2029-01-11' }), /já foi usada/);
  const casa = L.licencaIlimitada({ empresa: 'ankjck', nome: 'ANK/JCK', hoje: '2026-11-15' });
  assert.throws(() => L.renovar(casa, ficha('anual', '2029-01-05'), { hoje: '2029-01-10' }), /não vence/);
});

test('situação: avisos 60/30/7 dias, carência de 15 dias, só leitura de 05/02/2029 e apagar em 20/04/2029', () => {
  const { licenca } = ativada();
  const s = (d) => L.situacao(licenca, d);
  assert.equal(s('2028-11-20').estado, 'ativa');
  assert.deepEqual([s('2028-11-21').estado, s('2028-11-21').aviso], ['aviso', 60]);
  assert.equal(s('2028-12-21').aviso, 30);
  assert.equal(s('2029-01-13').aviso, 7);
  assert.equal(s('2029-01-19').aviso, 7);
  assert.equal(s('2029-01-19').pode_gravar, true);
  assert.equal(s('2029-01-20').estado, 'carencia');
  assert.equal(s('2029-02-04').estado, 'carencia');
  assert.equal(s('2029-02-04').pode_gravar, true);
  assert.equal(s('2029-02-05').estado, 'so_leitura');
  assert.equal(s('2029-02-05').pode_gravar, false);
  assert.equal(s('2029-04-19').estado, 'so_leitura');
  assert.equal(s('2029-04-20').estado, 'apagar');
  const m = L.marcos('2029-01-20');
  assert.deepEqual(m.avisos_apagar, ['2029-03-20', '2029-04-05', '2029-04-15'], 'e-mails antes de apagar');
  assert.deepEqual(m.avisos_vencimento, ['2028-11-21', '2028-12-21', '2029-01-13']);
  assert.match(L.fraseDaSituacao(s('2029-01-25')), /Renove até 04\/02\/2029/);
  assert.match(L.fraseDaSituacao(s('2029-02-05')), /apagados em 20\/04\/2029/);
});

test('situação: revogada fica só em leitura; licença da casa nunca vence; sem licença não grava', () => {
  const { licenca } = ativada();
  const rev = L.revogar(licenca, { motivo: 'pagamento estornado', por: 'dono@exemplo.com.br', hoje: '2027-03-01' });
  assert.deepEqual([L.situacao(rev, '2027-03-02').estado, L.situacao(rev, '2027-03-02').pode_gravar], ['revogada', false]);
  assert.throws(() => L.revogar(rev, { motivo: 'de novo', hoje: '2027-03-02' }), /Já estava revogada/);
  assert.throws(() => L.revogar(licenca, { motivo: ' ', hoje: '2027-03-02' }), /motivo/);
  const casa = L.licencaIlimitada({ empresa: 'ankjck', nome: 'ANK/JCK', hoje: '2026-11-15' });
  assert.deepEqual(L.situacao(casa, '2099-12-31'), { estado: 'ativa', pode_gravar: true, ilimitada: true, ate: null });
  assert.throws(() => L.revogar(casa, { motivo: 'x', hoje: '2027-01-01' }), /casa/);
  assert.equal(L.situacao(null, '2027-01-01').pode_gravar, false);
});

test('cortesia soma dias ao vencimento (ou a hoje, se já venceu) e pede motivo', () => {
  const { licenca } = ativada();
  assert.equal(L.darCortesia(licenca, { dias: 30, motivo: 'atraso no suporte', por: 'dono@exemplo.com.br', hoje: '2028-06-01' }).ate, '2029-02-19');
  const vencida = L.darCortesia(licenca, { dias: 10, motivo: 'negociação', hoje: '2029-02-10' });
  assert.equal(vencida.ate, '2029-02-20');
  assert.equal(L.situacao(vencida, '2029-02-10').pode_gravar, true, 'volta a gravar');
  assert.equal(vencida.cortesias.length, 1);
  assert.throws(() => L.darCortesia(licenca, { dias: 0, motivo: 'x', hoje: '2028-06-01' }), /de 1 a 366/);
  assert.throws(() => L.darCortesia(licenca, { dias: 5, motivo: '', hoje: '2028-06-01' }), /motivo/);
});

test('limites: avisa com 18 de 20, barra só o cadastro novo; licença da casa sem limites', () => {
  const { licenca } = ativada();
  const uso = { imoveis: 18, inquilinos: 20, usuarios: 3, cnpjs: 2 };
  const c = L.conferirLimites(licenca, uso);
  assert.deepEqual(c.imoveis, { usado: 18, limite: 20, perto: true, cheio: false, passou: false });
  assert.equal(c.inquilinos.cheio, true);
  assert.equal(c.usuarios.perto, false);
  assert.equal(L.podeCadastrar(licenca, uso, 'imoveis'), true);
  assert.equal(L.podeCadastrar(licenca, uso, 'inquilinos'), false);
  assert.equal(L.podeCadastrar(licenca, uso, 'cnpjs'), false);
  assert.equal(L.conferirLimites(licenca, { imoveis: 25 }).imoveis.passou, true, 'acima do limite (ex.: plano menor na renovação) continua existindo');
  const casa = L.licencaIlimitada({ empresa: 'ankjck', nome: 'ANK/JCK', hoje: '2026-11-15' });
  assert.equal(L.podeCadastrar(casa, { imoveis: 5000 }, 'imoveis'), true);
  assert.throws(() => L.podeCadastrar(licenca, uso, 'boletos'), /desconhecido/);
});

test('CNPJ: dígitos verificadores', () => {
  assert.equal(L.cnpjValido(CNPJ), true);
  assert.equal(L.cnpjValido('11222333000181'), true);
  assert.equal(L.cnpjValido('11.222.333/0001-80'), false);
  assert.equal(L.cnpjValido('00000000000000'), false);
});

test('certificado Ed25519: confere sem internet, recusa data esticada, outra chave e outra empresa', async () => {
  const { privada, publica } = await L.gerarParDeChaves();
  const { licenca } = ativada();
  const cert = await L.assinarCertificado(licenca, JSON.stringify(privada), '2027-01-20');
  const r = await L.conferirCertificado(cert, publica, '2027-06-01', { empresa: 'silva' });
  assert.equal(r.ok, true);
  assert.equal(r.dados.ate, '2029-01-20');
  assert.equal(r.dados.empresa, 'silva');
  assert.equal(r.situacao.estado, 'ativa');
  assert.equal((await L.conferirCertificado(cert, publica, '2029-02-05')).situacao.estado, 'so_leitura', 'sem internet também cai no só leitura');
  assert.ok(!JSON.stringify(r.dados).includes('maria'), 'certificado sem e-mail de pessoas');
  // alguém troca a data dentro do certificado
  const [corpo, assinatura] = cert.split('.');
  const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString());
  const esticado = `${Buffer.from(JSON.stringify({ ...dados, ate: '2039-01-20' })).toString('base64url')}.${assinatura}`;
  assert.equal((await L.conferirCertificado(esticado, publica, '2027-06-01')).ok, false);
  const outra = await L.gerarParDeChaves();
  assert.equal((await L.conferirCertificado(cert, outra.publica, '2027-06-01')).ok, false);
  assert.equal((await L.conferirCertificado(cert, publica, '2027-06-01', { empresa: 'souza' })).ok, false);
  assert.equal((await L.conferirCertificado('lixo', publica, '2027-06-01')).ok, false);
  assert.equal((await L.conferirCertificado('', publica, '2027-06-01')).ok, false);
  const rev = await L.assinarCertificado(L.revogar(licenca, { motivo: 'fraude', hoje: '2027-02-01' }), privada, '2027-02-01');
  assert.equal((await L.conferirCertificado(rev, publica, '2027-02-02')).situacao.estado, 'revogada');
  await assert.rejects(() => L.assinarCertificado(licenca, '', '2027-01-20'), /LICENCA_CHAVE_PRIVADA/);
});
