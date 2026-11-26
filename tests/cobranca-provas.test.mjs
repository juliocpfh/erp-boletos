import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as C from '../docs/js/calculos.js';
import * as R from '../docs/js/regras.js';
import { TABELAS_CONHECIDAS } from '../nuvem/cofre.mjs';

// Cobrança: registros e provas (pedido do dono em 2026-11-24): guarda os passos e os gastos da cobrança com os comprovantes.
// Desde a aprovação do advogado e do dono (24/11), honorários e despesas somam SÓ no acordo e no cálculo final, quando
// escolhidos ("Usar"); nunca no boleto do mês, na NF, na base da multa nem nos débitos sugeridos. Dados fictícios.
function base() {
  const d = R.bancoVazio();
  R.normalizar(d);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'julio');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'julio');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'julio');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Exemplo', inquilino_cpf: '529.982.247-25',
    data_entrada: '2026-08-01', vigencia_inicio: '2026-08-01', aluguel_inicial: 180000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    desconto_pontualidade_percentual: 0, bonificacao: false, multa_percentual: 2, juros_mensal_percentual: 1 }, 'julio');
  for (const m of ['2026-08', '2026-09', '2026-10']) R.gerarCobrancas(d, m, 'julio');
  return { d, c, cb: R.boletoDoMes(d, c.id, '2026-09') };
}
const registro = (d, campos) => R.inserir(d, 'cobranca_registros', { data: '2026-11-05', tipo: 'Carta', valor: null, descricao: 'Carta com AR', arquivos: [], ...campos }, 'julio');

test('tabela nova: no banco vazio, na nuvem (TABELAS_CONHECIDAS) e a lista de arquivos sempre existe', () => {
  const d = R.bancoVazio();
  assert.deepEqual(d.cobranca_registros, []);
  assert.ok(TABELAS_CONHECIDAS.includes('cobranca_registros'));
  d.cobranca_registros.push({ id: 1, contrato_id: 1, data: '2026-11-01', tipo: 'Carta' }, { id: 2, contrato_id: 1, data: '2026-11-02', tipo: 'Outro', arquivos: 'carta.pdf' });
  R.normalizar(d);
  assert.deepEqual(d.cobranca_registros.map((x) => x.arquivos), [[], ['carta.pdf']]);
});

test('os comprovantes entram nos arquivos do lançamento (rótulo, conferência, limpeza); tirar um solta só ele', () => {
  const { d, c, cb } = base();
  const r = registro(d, { contrato_id: c.id, cobranca_id: cb.id, valor: 2850, arquivos: ['cobranca-carta-2026-11-05-carta.pdf', 'cobranca-carta-2026-11-05-ar.jpg'] });
  const refs = R.arquivosReferenciados(d).filter((a) => a.escopo === 'contrato' && a.id === c.id).map((a) => a.nome);
  assert.ok(refs.includes('cobranca-carta-2026-11-05-carta.pdf') && refs.includes('cobranca-carta-2026-11-05-ar.jpg'));
  assert.equal(R.rotulosDosArquivos(d).get(`contrato:${c.id}|cobranca-carta-2026-11-05-ar.jpg`), 'prova da cobrança: carta de 05/11/2026');
  R.removerArquivoDoRegistro(d, r.id, 'cobranca-carta-2026-11-05-ar.jpg', 'julio');
  assert.deepEqual(R.buscar(d, 'cobranca_registros', r.id).arquivos, ['cobranca-carta-2026-11-05-carta.pdf']);
  assert.ok(!R.arquivosReferenciados(d).some((a) => a.nome === 'cobranca-carta-2026-11-05-ar.jpg'));
  assert.throws(() => R.removerArquivoDoRegistro(d, r.id, 'cobranca-carta-2026-11-05-ar.jpg', 'julio'), /já foi tirado/);
  // excluir o contrato leva os registros (e os arquivos deles saem da lista: são apagados junto)
  R.excluirContrato(d, c.id, 'julio');
  assert.equal(d.cobranca_registros.length, 0);
});

test('registro sozinho não soma: boleto, NF, débitos da saída e o boleto que vence ficam iguais com registros de R$ 545,00', () => {
  const { d, c, cb } = base();
  const antes = { total: R.totais(cb), outros: cb.outros, liquido: C.liquidar(cb, '2026-11-20'), saida: JSON.stringify(R.debitosDaSaida(d, c, '2026-11-20')) };
  registro(d, { contrato_id: c.id, cobranca_id: cb.id, tipo: 'Protesto', valor: 4500 });
  registro(d, { contrato_id: c.id, tipo: 'Advogado', valor: 50000, descricao: 'Honorários do advogado (só anotado)' });
  R.recalcularCobrancas(d, (x) => x.contrato_id === c.id, 'julio');
  assert.deepEqual(R.totais(cb), antes.total);
  assert.equal(cb.outros, antes.outros);
  assert.deepEqual(C.liquidar(cb, '2026-11-20'), antes.liquido);
  assert.equal(JSON.stringify(R.debitosDaSaida(d, c, '2026-11-20')), antes.saida);
  assert.equal(R.gastoDaCobranca(R.registrosCobrancaDo(d, c.id)), 54500);
});

test('lista do inquilino em ordem de data; no boleto, os dele e os do acordo de que ele faz parte; texto do "referente a"', () => {
  const { d, c, cb } = base();
  const out = R.boletoDoMes(d, c.id, '2026-10');
  const a = R.inserir(d, 'acordos', { contrato_id: c.id, data: '2026-11-12', referente: 'aluguéis de 09 e 10/2026', parcelas: 2, valor_total: 370000, divida_na_data: 370000 }, 'julio');
  cb.acordo_id = a.id;
  const r3 = registro(d, { contrato_id: c.id, acordo_id: a.id, data: '2026-11-20', tipo: 'E-mail' });
  const r1 = registro(d, { contrato_id: c.id, cobranca_id: cb.id, data: '2026-10-15', tipo: 'WhatsApp / ligação' });
  const r2 = registro(d, { contrato_id: c.id, cobranca_id: out.id, data: '2026-11-01' });
  assert.deepEqual(R.registrosCobrancaDo(d, c.id).map((x) => x.id), [r1.id, r2.id, r3.id]);
  assert.deepEqual(R.registrosDoBoleto(d, cb).map((x) => x.id), [r1.id, r3.id]);
  assert.deepEqual(R.registrosDoBoleto(d, out).map((x) => x.id), [r2.id]);
  assert.equal(R.referenteDoRegistro(d, r1), `boleto de 09/2026 (vence ${C.dataBr(cb.vencimento)})`);
  assert.equal(R.referenteDoRegistro(d, r3), 'acordo de 12/11/2026');
  assert.equal(R.referenteDoRegistro(d, { contrato_id: c.id }), 'cobrança em geral');
  R.excluir(d, 'cobrancas', out.id, 'julio');
  assert.equal(R.referenteDoRegistro(d, r2), 'boleto (excluído depois)', 'o boleto sai, o registro e a prova ficam');
});

test('endereços do registro: ?cobranca= e ?acordo= aceitos só com número', () => {
  assert.deepEqual(C.sanearParametros({ contrato: '3', cobranca: '12', acordo: '4' }), { contrato: '3', cobranca: '12', acordo: '4' });
  assert.deepEqual(C.sanearParametros({ contrato: '3', cobranca: '12<x>', acordo: 'abc' }), { contrato: '3' });
});

test('formulário e telas: tipos da lista, campo de vários arquivos com accept, aviso de que nada é cobrado', () => {
  const cad = fs.readFileSync(new URL('../docs/js/telas/cadastros.js', import.meta.url), 'utf8');
  assert.match(cad, /name="arquivos_novos" multiple accept="\$\{ACEITA_DOCUMENTOS\}"/);
  assert.match(cad, /só no acordo e no cálculo final da saída, quando alguém escolher "Usar": nunca entra no boleto do mês nem na NF/);
  assert.match(cad, /erros\.advogado = 'Informe o advogado que atuou/);
  assert.deepEqual(R.TIPOS_REGISTRO_COBRANCA.slice(0, 2), ['Carta', 'E-mail']);
  for (const t of ['Notificação', 'Protesto', 'Cartório', 'Advogado', 'Outro']) assert.ok(R.TIPOS_REGISTRO_COBRANCA.includes(t), t);
});

// ---------------------------------------------------------------- honorários e despesas de cobrança (aprovados em 24/11/2026)
const HOJE = '2026-11-24'; // ago/2026 venceu 10/09 (75 dias), set/2026 venceu 10/10 (45 dias), out/2026 venceu 10/11 (14 dias)
function comProvas() {
  const x = base();
  const { d, c, cb } = x;
  const ago = R.boletoDoMes(d, c.id, '2026-08');
  const out = R.boletoDoMes(d, c.id, '2026-10');
  const carta = registro(d, { contrato_id: c.id, cobranca_id: cb.id, data: '2026-10-20', tipo: 'Carta', valor: 2850, descricao: 'Carta com AR', arquivos: ['cobranca-carta-ar.pdf'] });
  const protesto = registro(d, { contrato_id: c.id, cobranca_id: cb.id, data: '2026-11-10', tipo: 'Protesto', valor: 4500, descricao: 'Protesto no 2º Tabelionato', arquivos: ['cobranca-protesto.pdf'] });
  const semComprovante = registro(d, { contrato_id: c.id, data: '2026-11-11', tipo: 'Cartório', valor: 1000, descricao: 'Certidão', arquivos: [] });
  const adv = registro(d, { contrato_id: c.id, data: '2026-11-12', tipo: 'Advogado', valor: null, advogado: 'Dr. Exemplo Teste, OAB/PR 12.345', descricao: 'Notificação assinada' });
  return { ...x, ago, out, carta, protesto, semComprovante, adv };
}

test('honorários: só com mais de 30 dias de atraso, aviso antes e advogado registrado; 10% do valor de hoje dos atrasados', () => {
  const { d, c, cb } = base();
  const ago = R.boletoDoMes(d, c.id, '2026-08');
  const out = R.boletoDoMes(d, c.id, '2026-10');
  let s = R.sugestaoHonorarios(d, c, [ago, cb, out], HOJE);
  assert.equal(s.cabe, false);
  assert.equal(s.faltam.length, 2, 'falta o aviso e o advogado');
  registro(d, { contrato_id: c.id, cobranca_id: cb.id, data: '2026-10-20', tipo: 'Carta' });
  const semNome = registro(d, { contrato_id: c.id, data: '2026-11-12', tipo: 'Advogado', advogado: '' });
  s = R.sugestaoHonorarios(d, c, [ago, cb, out], HOJE);
  assert.deepEqual(s.faltam, ['falta o nome do advogado no registro "Advogado"']);
  R.atualizar(d, 'cobranca_registros', semNome.id, { advogado: 'Dr. Exemplo Teste, OAB/PR 12.345' }, 'julio');
  s = R.sugestaoHonorarios(d, c, [ago, cb, out], HOJE);
  assert.equal(s.cabe, true);
  // out/2026 tem só 14 dias de atraso: fica fora da base
  assert.deepEqual(s.boletos.map((x) => x.competencia), ['2026-08', '2026-09']);
  const baseHoje = C.liquidar(ago, HOJE).valor_devido + C.liquidar(cb, HOJE).valor_devido;
  assert.equal(s.base, baseHoje);
  assert.equal(s.valor, Math.round(baseHoje / 10));
  assert.match(s.texto, /^Honorários de advogado \(10% de R\$ .+, cobrança fora da Justiça; advogado: Dr\. Exemplo Teste, OAB\/PR 12\.345\)$/);
  // só o boleto de 14 dias: não cabe
  assert.equal(R.sugestaoHonorarios(d, c, [out], HOJE).cabe, false);
  // aviso depois do advogado não conta
  const d2 = base();
  registro(d2.d, { contrato_id: d2.c.id, data: '2026-11-15', tipo: 'Carta' });
  registro(d2.d, { contrato_id: d2.c.id, data: '2026-11-12', tipo: 'Advogado', advogado: 'Dr. Exemplo Teste' });
  assert.equal(R.sugestaoHonorarios(d2.d, d2.c, [d2.cb], HOJE).cabe, false);
});

test('exemplo do dono: débito atualizado de R$ 2.000,00 com 45 dias, advogado atuando → honorários de R$ 200,00', () => {
  const { d, c } = base();
  const cb = { id: 999, contrato_id: c.id, competencia: '2026-09', vencimento: '2026-10-10', aluguel: 200000, desconto: 0, outros: 0, multa_percentual: 0, juros_mensal_percentual: 0 };
  registro(d, { contrato_id: c.id, data: '2026-10-20', tipo: 'Notificação' });
  registro(d, { contrato_id: c.id, data: '2026-11-12', tipo: 'Advogado', advogado: 'Dr. Exemplo Teste, OAB/PR 12.345' });
  const s = R.sugestaoHonorarios(d, c, [cb], HOJE);
  assert.equal(s.cabe, true);
  assert.equal(s.base, 200000);
  assert.equal(s.valor, 20000);
});

test('despesas: só com valor E comprovante, pelo valor exato; o advogado não é despesa', () => {
  const { d, c, carta, protesto, semComprovante } = comProvas();
  const disp = R.despesasCobraveis(d, c);
  assert.deepEqual(disp.cobraveis.map((x) => [x.registro.id, x.valor]), [[carta.id, 2850], [protesto.id, 4500]]);
  assert.deepEqual(disp.semComprovante.map((x) => x.id), [semComprovante.id]);
  assert.equal(disp.cobraveis[1].texto, 'Despesa de cobrança: protesto de 10/11/2026 (Protesto no 2º Tabelionato), pelo comprovante');
  assert.throws(() => R.cobrancaEscolhida(d, c, [], { despesas: [semComprovante.id] }, HOJE), /não pode mais ser cobrada/);
  assert.equal(R.cobrancaEscolhida(d, c, [], {}, HOJE).total, 0, 'nada escolhido = nada cobrado');
});

test('acordo: honorários e despesas escolhidos somam em linhas próprias, fora da NF e da multa; termo com as linhas', async () => {
  const { d, c, cb, ago, carta, protesto } = comProvas();
  const dados = { contrato_id: c.id, ids: [ago.id, cb.id], parcelas: 2, primeiro_vencimento: '2026-12-10' };
  const divida = C.liquidar(ago, HOJE).valor_devido + C.liquidar(cb, HOJE).valor_devido;
  const sem = R.previaAcordo(d, { ...dados, total: divida }, HOJE);
  const hon = R.sugestaoHonorarios(d, c, [ago, cb], HOJE).valor;
  assert.equal(hon, Math.round(divida / 10));
  const com = R.previaAcordo(d, { ...dados, total: divida, cobranca: { honorarios: true, despesas: [carta.id, protesto.id] } }, HOJE);
  assert.equal(com.cobranca.total, hon + 7350);
  assert.equal(com.totalComCobranca, divida + hon + 7350);
  assert.deepEqual(com.boletos.map((b) => b.nf), sem.boletos.map((b) => b.nf), 'a NF das parcelas não muda');
  assert.equal(com.boletos.reduce((s, b) => s + b.valor, 0), divida + hon + 7350);
  // honorários fora da Justiça + os da ação ao mesmo tempo: não; ação sem processo: não
  assert.throws(() => R.previaAcordo(d, { ...dados, total: divida, cobranca: { honorarios: true, judicial: 74000, judicial_texto: 'despejo' } }, HOJE), /Escolha um só/);
  assert.throws(() => R.previaAcordo(d, { ...dados, total: divida, cobranca: { judicial: 74000 } }, HOJE), /informe o processo/);

  const { acordo, parcelas } = R.fazerAcordo(d, { ...dados, total: divida, cobranca: { honorarios: true, despesas: [carta.id, protesto.id] } }, 'julio', HOJE);
  assert.equal(acordo.valor_total, divida + hon + 7350);
  assert.equal(acordo.valor_combinado, divida);
  assert.equal(acordo.honorarios, hon);
  assert.deepEqual(acordo.despesas_cobranca.map((x) => [x.registro_id, x.valor]), [[carta.id, 2850], [protesto.id, 4500]]);
  const p1 = parcelas[0];
  const enc = p1.encargos_cobranca.reduce((s, e) => s + e.valor, 0);
  assert.ok(enc > 0);
  assert.deepEqual(R.partesDosOutros(p1).slice(-p1.encargos_cobranca.length).map((x) => x.texto), p1.encargos_cobranca.map((e) => e.texto), 'cada um na sua linha');
  // base da multa e NF sem os honorários e as despesas
  const semEnc = { ...p1, outros: p1.outros - enc, encargos_cobranca: [] };
  assert.equal(R.totais(p1).base_multa, R.totais(semEnc).base_multa);
  assert.equal(R.totais(p1).a_pagar_sem_desconto, R.totais(semEnc).a_pagar_sem_desconto + enc);
  const atrasado = C.liquidar(p1, '2027-01-20');
  assert.equal(atrasado.multa, C.liquidar(semEnc, '2027-01-20').multa);
  assert.equal(atrasado.juros, C.liquidar(semEnc, '2027-01-20').juros);
  assert.equal(atrasado.valor_nf, C.liquidar(semEnc, '2027-01-20').valor_nf);
  assert.equal(C.ajusteNaNf({ ...p1, outros_na_nf: true }), p1.outros - enc, 'nem com "o ajuste entra na NF" os honorários vão à NF');
  // pago: a NF (e o Excel da NF, que sai dela) fica com o valor sem honorários nem despesas
  R.registrarPagamento(d, p1.id, '2026-12-10', R.totais(p1).a_pagar_pontual, 'julio');
  assert.equal(R.buscar(d, 'cobrancas', p1.id).valor_nf, sem.boletos[0].nf);
  // termo do acordo: linhas separadas e o total com tudo
  const REC = await import('../docs/js/recibos.js');
  const t = REC.montarRecibo(d, 'acordo', { contrato: c, acordo: acordo.id }, HOJE);
  const linhas = t.tabela.map(([a]) => a);
  assert.ok(linhas.includes('HONORÁRIOS E DESPESAS DE COBRANÇA'));
  assert.ok(linhas.some((x) => /^Honorários de advogado \(10%/.test(x)));
  assert.ok(linhas.some((x) => /^Despesa de cobrança: carta de 20\/10\/2026/.test(x)));
  assert.deepEqual(t.tabela.find(([a]) => a === 'Aluguéis e encargos combinados'), ['Aluguéis e encargos combinados', C.reais(divida)]);
  assert.deepEqual(t.tabela.find(([a]) => a === 'Total do acordo'), ['Total do acordo', C.reais(divida + hon + 7350)]);
  assert.match(t.paragrafos[1], /e aos honorários de advogado e despesas de cobrança pagas a terceiros, pelo valor exato dos comprovantes \(Código Civil, artigos 389, 395 e 404\)/);
  // cobradas no acordo: não aparecem de novo
  assert.equal(R.despesasCobraveis(d, c).cobraveis.length, 0);
});

test('acordo desfeito: as despesas voltam a poder ser cobradas', () => {
  const { d, c, cb, ago, carta } = comProvas();
  const { acordo } = R.fazerAcordo(d, { contrato_id: c.id, ids: [ago.id, cb.id], total: 400000, parcelas: 1, primeiro_vencimento: '2026-12-10', cobranca: { despesas: [carta.id] } }, 'julio', HOJE);
  assert.ok(!R.despesasCobraveis(d, c).cobraveis.some((x) => x.registro.id === carta.id));
  R.desfazerAcordo(d, acordo.id, 'julio', HOJE);
  assert.ok(R.despesasCobraveis(d, c).cobraveis.some((x) => x.registro.id === carta.id));
});

test('boleto do mês: nunca leva honorários nem despesas, mesmo depois de um acordo que os cobrou', () => {
  const { d, c, cb, ago, carta } = comProvas();
  R.fazerAcordo(d, { contrato_id: c.id, ids: [ago.id, cb.id], total: 400000, parcelas: 1, primeiro_vencimento: '2026-12-10', cobranca: { honorarios: true, despesas: [carta.id] } }, 'julio', HOJE);
  R.gerarCobrancas(d, '2026-11', 'julio');
  R.recalcularCobrancas(d, (x) => x.contrato_id === c.id, 'julio');
  for (const x of d.cobrancas.filter((y) => y.contrato_id === c.id && !R.ehBoletoAvulso(y))) {
    assert.ok(!(x.encargos_cobranca || []).length, `boleto ${x.competencia}`);
    assert.ok(!/Honorários|Despesa de cobrança/.test(x.outros_descricao || ''), `boleto ${x.competencia}`);
  }
  assert.equal(R.boletoDoMes(d, c.id, '2026-11').outros || 0, 0);
});

test('cálculo final: os escolhidos somam aos débitos em linhas próprias; os débitos sugeridos (debitosDaSaida) não mudam', () => {
  const { d, c, carta, protesto } = comProvas();
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-20' }, 'julio');
  const deb = R.debitosDaSaida(d, c, HOJE);
  const antes = JSON.stringify(deb);
  const sug = { honorarios: R.sugestaoHonorarios(d, c, R.cobrancasEmAberto(d, c.id), HOJE), ...R.despesasCobraveis(d, c) };
  assert.equal(sug.honorarios.cabe, true);
  assert.equal(JSON.stringify(R.debitosDaSaida(d, c, HOJE)), antes, 'a sugestão não entra sozinha nos débitos');
  const dados = { data_saida: '2026-11-20', leitura_agua: '1', leitura_energia: '2', garantia_valor: 0, indice_percentual: 0, debitos: deb.total,
    debitos_descricao: deb.itens.map((x) => x.texto).join('\n'), fci_credito: 0, fci_danos: 0, creditos: 0 };
  assert.throws(() => R.encerrarContrato(d, c.id, { ...dados, cobranca: { honorarios: true, judicial: 50000, judicial_texto: 'despejo' } }, 'julio', HOJE), /Escolha um só/);
  const e = R.encerrarContrato(d, c.id, { ...dados, cobranca: { honorarios: true, despesas: [protesto.id] } }, 'julio', HOJE);
  assert.equal(e.honorarios, sug.honorarios.valor);
  assert.equal(e.debitos, deb.total + sug.honorarios.valor + 4500);
  assert.equal(e.saldo, -(deb.total + sug.honorarios.valor + 4500));
  const linhas = e.debitos_descricao.split('\n');
  assert.equal(linhas.at(-2), `${sug.honorarios.texto}: ${C.reais(sug.honorarios.valor)}`);
  assert.match(linhas.at(-1), /^Despesa de cobrança: protesto de 10\/11\/2026 .*: R\$ 45,00$/);
  assert.ok(!('cobranca' in e));
  assert.deepEqual(e.despesas_cobranca.map((x) => x.registro_id), [protesto.id]);
  // a carta continua livre; o protesto, não
  assert.deepEqual(R.despesasCobraveis(d, c).cobraveis.map((x) => x.registro.id), [carta.id]);
  // os boletos em aberto continuam descontados pelo texto (as linhas novas não atrapalham)
  assert.equal(d.cobrancas.filter((x) => x.contrato_id === c.id && x.quitado_saida === e.id).length, deb.itens.filter((x) => x.cobranca).length);
});

test('cálculo final sem escolha: igual a antes (nada entra sozinho)', () => {
  const { d, c } = comProvas();
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-20' }, 'julio');
  const e = R.encerrarContrato(d, c.id, { data_saida: '2026-11-20', leitura_agua: '1', leitura_energia: '2', garantia_valor: 0, indice_percentual: 0, debitos: 1000, fci_credito: 0, fci_danos: 0 }, 'julio', HOJE);
  assert.equal(e.debitos, 1000);
  assert.equal(e.honorarios, 0);
  assert.deepEqual(e.despesas_cobranca, []);
});

test('regras dos honorários: 10% e 30 dias, por contrato, com explicação, consequência e lei', async () => {
  const CR = await import('../docs/js/config-regras.js');
  const p = CR.DEFINICOES_REGRAS.find((x) => x.chave === 'honorarios_percentual');
  const dias = CR.DEFINICOES_REGRAS.find((x) => x.chave === 'honorarios_dias_atraso');
  assert.equal(p.padrao, 10);
  assert.equal(dias.padrao, 30);
  for (const x of [p, dias]) {
    assert.ok(x.explica && x.consequencia && x.lei, x.chave);
    assert.ok(CR.REGRAS_POR_CONTRATO.has(x.chave), x.chave);
  }
  assert.match(p.lei, /arts\. 389, 395 e 404/);
  assert.match(p.lei, /REsp 1\.274\.629/);
});

test('acordo quebrado: honorários nunca de novo sobre a mesma dívida (decisão de 25/11); os do 1º acordo continuam na parcela', () => {
  const { d, c, cb, ago, out } = comProvas();
  // 1º acordo (24/11) com honorários, parcela única que vence 10/12/2026 e não é paga
  const { acordo, parcelas } = R.fazerAcordo(d, { contrato_id: c.id, ids: [ago.id, cb.id], total: 400000, parcelas: 1, primeiro_vencimento: '2026-12-10', cobranca: { honorarios: true } }, 'julio', HOJE);
  const p = parcelas[0];
  assert.ok(acordo.honorarios > 0);
  assert.equal(R.totais(p).a_pagar_sem_desconto, 400000 + acordo.honorarios, 'os honorários do 1º acordo continuam devidos na parcela');
  assert.equal(R.parcelaJaComHonorarios(d, p), true);
  // em 20/01/2027 (41 dias de atraso da parcela): só a parcela → não sugere
  const s = R.sugestaoHonorarios(d, c, [p], '2027-01-20');
  assert.equal(s.cabe, false);
  assert.deepEqual(s.faltam, ['as parcelas de acordo atrasadas já tiveram honorários no acordo: não se cobram de novo sobre a mesma dívida']);
  // com o boleto de 10/2026 (fora do acordo, 71 dias): a base é só ele
  const s2 = R.sugestaoHonorarios(d, c, [p, out], '2027-01-20');
  assert.equal(s2.cabe, true);
  assert.equal(s2.base, C.liquidar(out, '2027-01-20').valor_devido);
  assert.deepEqual(s2.boletos.map((x) => x.id), [out.id]);
  // novo acordo refazendo a parcela, sem honorários: a parcela dele também não volta a ter honorários depois
  assert.throws(() => R.previaAcordo(d, { contrato_id: c.id, ids: [p.id], total: 450000, parcelas: 1, primeiro_vencimento: '2027-02-10', cobranca: { honorarios: true } }, '2027-01-20'), /não cabem/);
  const b = R.fazerAcordo(d, { contrato_id: c.id, ids: [p.id], total: 450000, parcelas: 1, primeiro_vencimento: '2027-02-10' }, 'julio', '2027-01-20');
  assert.equal(R.parcelaJaComHonorarios(d, b.parcelas[0]), true, 'a dívida do 2º acordo já teve honorários no 1º');
  assert.equal(R.sugestaoHonorarios(d, c, [b.parcelas[0]], '2027-04-20').cabe, false);
  // acordo sem honorários: a parcela atrasada pode ter (é a 1ª vez)
  const x = comProvas();
  const semHon = R.fazerAcordo(x.d, { contrato_id: x.c.id, ids: [x.ago.id, x.cb.id], total: 400000, parcelas: 1, primeiro_vencimento: '2026-12-10' }, 'julio', HOJE);
  assert.equal(R.sugestaoHonorarios(x.d, x.c, [semHon.parcelas[0]], '2027-01-20').cabe, true);
});

test('cálculo final depois do acordo quebrado: a parcela com honorários fica fora da base', () => {
  const { d, c, cb, ago } = comProvas();
  R.fazerAcordo(d, { contrato_id: c.id, ids: [ago.id, cb.id], total: 400000, parcelas: 1, primeiro_vencimento: '2026-12-10', cobranca: { honorarios: true } }, 'julio', HOJE);
  R.atualizar(d, 'contratos', c.id, { data_saida: '2026-11-30' }, 'julio');
  const s = R.sugestaoHonorarios(d, c, R.cobrancasEmAberto(d, c.id), '2027-01-20');
  // a base é só o boleto de 10/2026 (fora do acordo), não a parcela
  const out = R.boletoDoMes(d, c.id, '2026-10');
  assert.deepEqual(s.boletos.map((x) => x.id), [out.id]);
});

test('acordo quebrado refeito: honorários e despesas da parcela antiga passam à nova em encargos_cobranca (sem multa e juros, fora da NF)', () => {
  const { d, c, cb, ago, carta } = comProvas();
  const a1 = R.fazerAcordo(d, { contrato_id: c.id, ids: [ago.id, cb.id], total: 400000, parcelas: 1, primeiro_vencimento: '2026-12-10', cobranca: { honorarios: true, despesas: [carta.id] } }, 'julio', HOJE);
  const velha = a1.parcelas[0];
  const encVelha = velha.encargos_cobranca.reduce((s, e) => s + e.valor, 0);
  assert.equal(encVelha, a1.acordo.honorarios + 2850);
  const dia = '2027-01-20';
  const divida = C.liquidar(velha, dia).valor_devido;
  // em 1 boleto: leva os mesmos honorários e a mesma despesa, com o mesmo texto
  const p1 = R.previaAcordo(d, { contrato_id: c.id, ids: [velha.id], total: divida, parcelas: 1, primeiro_vencimento: '2027-02-10' }, dia);
  assert.equal(p1.herdadoTotal, encVelha);
  assert.deepEqual(p1.boletos[0].encargos.map((e) => [e.texto, e.valor]), velha.encargos_cobranca.map((e) => [e.texto, e.valor]));
  assert.equal(p1.boletos[0].valor, divida, 'o total não muda: os herdados já estão na dívida');
  // em 3 boletos: divididos na proporção, a soma fecha
  const p3 = R.previaAcordo(d, { contrato_id: c.id, ids: [velha.id], total: divida, parcelas: 3, primeiro_vencimento: '2027-02-10' }, dia);
  assert.equal(p3.boletos.reduce((s, b) => s + b.encargos.reduce((x, e) => x + e.valor, 0), 0), encVelha);
  assert.ok(p3.boletos.every((b) => b.encargos.length === 2));
  // gravado: a multa e os juros do boleto novo não contam sobre os herdados
  const a2 = R.fazerAcordo(d, { contrato_id: c.id, ids: [velha.id], total: divida, parcelas: 1, primeiro_vencimento: '2027-02-10' }, 'julio', dia);
  const nova = a2.parcelas[0];
  assert.equal(nova.encargos_cobranca.reduce((s, e) => s + e.valor, 0), encVelha);
  assert.equal(a2.acordo.honorarios, 0, 'não são honorários novos');
  const semEnc = { ...nova, outros: nova.outros - encVelha, encargos_cobranca: [] };
  assert.equal(R.totais(nova).base_multa, R.totais(semEnc).base_multa);
  const atraso = C.liquidar(nova, '2027-03-12');
  assert.equal(atraso.multa, C.liquidar(semEnc, '2027-03-12').multa);
  assert.equal(atraso.juros, C.liquidar(semEnc, '2027-03-12').juros);
  assert.equal(atraso.valor_nf, C.liquidar(semEnc, '2027-03-12').valor_nf);
  assert.ok(!/^Encargos do acordo/.test(nova.outros_descricao) || nova.outros > encVelha, 'sem "Encargos do acordo" vazio');
});

test('termo do acordo refeito cita os honorários e as despesas do 1º acordo que entraram nas parcelas novas (25/11/2026)', async () => {
  const REC = await import('../docs/js/recibos.js');
  const { d, c, cb, ago, carta } = comProvas();
  const a1 = R.fazerAcordo(d, { contrato_id: c.id, ids: [ago.id, cb.id], total: 400000, parcelas: 1, primeiro_vencimento: '2026-12-10', cobranca: { honorarios: true, despesas: [carta.id] } }, 'julio', HOJE);
  const velha = a1.parcelas[0];
  const dia = '2027-01-20';
  const a2 = R.fazerAcordo(d, { contrato_id: c.id, ids: [velha.id], total: C.liquidar(velha, dia).valor_devido, parcelas: 2, primeiro_vencimento: '2027-02-10' }, 'julio', dia);
  const lista = REC.cobrancaDeAcordoAnterior(d, a2.acordo);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].acordo.id, a1.acordo.id);
  assert.equal(lista[0].honorarios, a1.acordo.honorarios);
  assert.equal(lista[0].despesas, 2850);
  const frase = REC.fraseDeAcordoAnterior(lista);
  assert.equal(frase, `${C.reais(a1.acordo.honorarios)} de honorários e R$ 28,50 de despesas de cobrança do acordo de ${C.dataBr(a1.acordo.data)}`);
  const termo = REC.montarRecibo(d, 'acordo', { contrato: c, acordo: a2.acordo.id }, dia);
  assert.ok(termo.paragrafos.some((p) => p.includes(`inclui ${frase}`)), 'o termo do 2º acordo cita o 1º');
  // o 1º acordo não cita acordo anterior
  assert.equal(REC.cobrancaDeAcordoAnterior(d, a1.acordo).length, 0);
  assert.ok(!REC.montarRecibo(d, 'acordo', { contrato: c, acordo: a1.acordo.id }, HOJE).paragrafos.some((p) => p.includes('do acordo de')));
});
