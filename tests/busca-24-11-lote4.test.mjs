// Busca de erros de 24/11, lote 4 (nuvem, regras configuráveis e telas/links): registro de acessos da fila da assinatura,
// assinatura digital que não muda ao voltar a uma versão das regras nem ao carregar o arquivo, caução que não acompanha o
// reajuste, índice do FCI, textos das regras especiais, mês do link para o Banco e do calendário, termo do novo valor por
// endereço e comprovantes das linhas só do CSV. Dados fictícios (CPF de teste 529.982.247-25, CNPJ 11.222.333/0001-81).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as CR from '../docs/js/config-regras.js';
import * as Z from '../docs/js/conciliacao.js';
import * as R from '../docs/js/regras.js';
import { cenario } from './mercado-fixo.mjs';
import { carregarSite, entrarComo } from './tela-falsa.mjs';
import { rotaDoRegistro } from '../nuvem/worker.mjs';

const T = await carregarSite();
const comAdmin = (d) => { R.inserir(d, 'usuarios', { login: 'dono@exemplo.com.br', nome: 'Dono', papel: 'admin', ativo: true }, 'teste'); T.E.d = d; entrarComo(T.E, 'admin'); return d; };
const texto = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('NUV-01: a fila da assinatura digital entra no registro de Acessos (a consulta da fila, não)', async () => {
  assert.deepEqual(rotaDoRegistro('assinaturas/abc123.pdf', 'GET'), ['assinaturas/abc123.pdf', false], 'baixou o recibo');
  assert.deepEqual(rotaDoRegistro('assinaturas/abc123/assinado', 'PUT'), ['PUT assinaturas/abc123/assinado', true], 'devolveu o assinado');
  assert.deepEqual(rotaDoRegistro('assinaturas', 'POST'), ['POST assinaturas', true], 'mandou para a fila');
  assert.deepEqual(rotaDoRegistro('assinaturas/abc123', 'DELETE'), ['DELETE assinaturas/abc123', true], 'tirou da fila');
  assert.equal(rotaDoRegistro('assinaturas', 'GET'), null, 'a consulta da fila (a cada minuto e a cada Painel) fica de fora');
  const { descreverAcesso } = await import('../docs/js/telas/nuvem.js');
  assert.match(descreverAcesso('PUT assinaturas/abc123/assinado'), /^Assinatura digital: devolveu o documento assinado/);
  assert.match(descreverAcesso('assinaturas/abc123.pdf'), /^Assinatura digital: baixou o documento abc123\.pdf/);
  assert.match(descreverAcesso('POST assinaturas'), /mandou um documento para a fila/);
  assert.match(descreverAcesso('DELETE assinaturas/abc123'), /tirou da fila/);
});

test('NUV-02/REG-01: voltar a uma versão das regras e carregar o arquivo das regras não mexem na assinatura digital', () => {
  const d = R.normalizar(R.bancoVazio());
  // ligada e salva na versão A; desligada depois (certificado removido); voltar à versão A não a liga de novo
  R.mudarRegraSistema(d, 'assinatura_digital', true, 'admin');
  R.salvarVersaoRegras(d, 'Regras de novembro', 'admin');
  R.mudarRegraSistema(d, 'assinatura_digital', false, 'admin');
  R.mudarRegraSistema(d, 'multa_padrao', 5, 'admin');
  R.restaurarVersaoRegras(d, d.versoes_regras.at(-1).id, 'admin');
  assert.equal(CR.regrasDe(d).assinatura_digital, false, 'continua desligada');
  assert.equal(CR.regrasDe(d).multa_padrao, CR.PADRAO_SISTEMA.multa_padrao, 'o resto volta à versão');
  // o contrário: versão salva com ela desligada, ligada depois → continua ligada
  R.salvarVersaoRegras(d, 'Sem assinatura', 'admin');
  R.mudarRegraSistema(d, 'assinatura_digital', true, 'admin');
  R.restaurarVersaoRegras(d, d.versoes_regras.at(-1).id, 'admin');
  assert.equal(CR.regrasDe(d).assinatura_digital, true, 'continua ligada');
  // arquivo das regras de outro sistema (com a assinatura desligada): não a desliga
  const outro = R.normalizar(R.bancoVazio());
  R.mudarRegraSistema(outro, 'multa_padrao', 3, 'admin');
  R.salvarRegrasSistema(d, CR.lerArquivoDasRegras(JSON.stringify(CR.arquivoDasRegras(outro))), 'admin', 'Regras do sistema (arquivo carregado)');
  assert.equal(CR.regrasDe(d).assinatura_digital, true, 'o arquivo não desliga');
  assert.equal(CR.regrasDe(d).multa_padrao, 3, 'mas as regras do arquivo entram');
  // e o botão da caixa do certificado continua mudando
  R.mudarRegraSistema(d, 'assinatura_digital', false, 'admin');
  assert.equal(CR.regrasDe(d).assinatura_digital, false);
});

test('REG-06: a tela Regras do sistema não conta a assinatura digital como regra mudada', async () => {
  const d = comAdmin(R.normalizar(R.bancoVazio()));
  R.mudarRegraSistema(d, 'assinatura_digital', true, 'admin');
  const tela = texto(await T.TELAS.regras({ partes: ['regras'], q: {} }));
  assert.match(tela, /Hoje todas as regras estão no padrão do sistema/);
  assert.doesNotMatch(tela, /Assinatura digital dos recibos/);
});

test('REG-02: com "A caução acompanha o reajuste" = Não, a página não pede o complemento da caução', () => {
  const d = R.normalizar(R.bancoVazio());
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua X, 1' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'j');
  // caução de 2 aluguéis bonificados (2 × R$ 1.215,00 = R$ 2.430,00) depositada em 07/06/2026; aluguel R$ 1.350,00 → R$ 1.400,00 em 07/09/2026
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Maria Teste', inquilino_cpf: '529.982.247-25', data_entrada: '2026-06-07', vigencia_inicio: '2026-06-07',
    aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true, desconto_pontualidade_percentual: 10, garantia_tipo: 'Caução', caucao_valor: 243000, caucao_meses: 2, caucao_data: '2026-06-07' }, 'j');
  R.registrarDepositoGarantia(d, c.id, 'caucao', { data: '2026-06-07', valor: 243000, arquivo: 'a.pdf' }, 'j');
  R.inserir(d, 'correcoes', { contrato_id: c.id, data_vigencia: '2026-09-07', indice: 'IPCA', valor_anterior: 135000, valor_novo: 140000, percentual: 3.7 }, 'j');
  assert.equal(R.garantiaADepositar(d, c, 'caucao', '2026-11-24').falta, 9000, 'com a regra ligada (padrão) faltam R$ 90,00');
  R.mudarRegraSistema(d, 'caucao_acompanha', false, 'j');
  assert.equal(R.complementoCaucao(d, c), null);
  const s = R.garantiaADepositar(d, c, 'caucao', '2026-11-24');
  assert.equal(s.falta, 0, 'a caução fica com o valor do início: nada falta');
  assert.equal(s.necessaria, 243000);
});

test('REG-04: o índice do FCI das regras vem preenchido mesmo com o % em branco', () => {
  const d = R.normalizar(R.bancoVazio());
  R.mudarRegraSistema(d, 'fci_indice_padrao', 'IPCA', 'admin');
  const p = R.padroesNovoContrato();
  assert.equal(p.fci_indice, 'IPCA');
  assert.ok(!('fci_percentual' in p), 'o % continua em branco');
});

test('REG-05: textos de Inadimplência, Reajustes e E-mails da régua dizem o valor da regra especial', async () => {
  const d = comAdmin(R.normalizar(R.bancoVazio()));
  const A = R.inserir(d, 'perfis_regras', { nome: 'Regra especial A', valores: { dias_vermelho: 10, reajuste_inicio: 'mes_seguinte', regua_email_dias: [-3, 0, 3] } }, 'admin');
  R.mudarRegraSistema(d, 'regua_email_dias', [], 'admin');
  CR.usarRegras(d);
  assert.deepEqual(R.especiaisDiferentes(d, 'dias_vermelho').map((x) => [x.nome, x.valor]), [['Regra especial A', 10]]);
  assert.deepEqual(R.especiaisDiferentes(d, 'multa_padrao'), [], 'regra que a especial não muda');
  const fin = texto(T.TELAS.inadimplencia({ partes: ['inadimplencia'], q: {} }));
  assert.match(fin, new RegExp(`A partir de ${R.regra('dias_vermelho')} dias de atraso em vermelho \\(na regra especial "Regra especial A": 10 dias\\)`));
  const rea = texto(T.TELAS.reajustes({ partes: ['reajustes'], q: {} }));
  assert.match(rea, /Na regra especial "Regra especial A": o 1º mês é o seguinte/);
  const regua = texto(await T.TELAS.regua({ partes: ['regua'], q: {} }));
  assert.match(regua, /nada é preparado para os contratos que as seguem/);
  assert.match(regua, /Contratos com regra especial: Regra especial A: /);
  assert.ok(A.id);
});

test('TEL-01: "Conferir pagamentos no banco" abre o Banco no mês do vencimento dos boletos', async () => {
  const { d, c } = cenario();
  comAdmin(d);
  d.config_banco = { ativo: true, provedor: 'c6', conta_padrao_id: 'ank', contas: [{ id: 'ank', apelido: 'ANK', emitente_id: d.emitentes[0].id, ambiente: 'sandbox' }] };
  const B = await import('../docs/js/banco.js');
  await B.salvarPonteLocal({ ponte_url: 'http://localhost:8765', senha_ponte: 'frase-de-teste-com-mais-de-20' });
  // aluguel de 01/2027 vence em 10/02/2027 (contrato comum): o Banco abre em 02/2027
  R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2027-01', vencimento: '2027-02-10', aluguel: 250000, banco: { situacao: 'emitido' } }, 'j');
  const TC = await import('../docs/js/telas/banco-c6.js');
  assert.match(TC.botoesMesC6('2027-01'), /href="#\/banco\?mes=2027-02&amp;ir=conferir-boletos"|href="#\/banco\?mes=2027-02&ir=conferir-boletos"/);
  // contrato que cobra o mês do vencimento: aluguel de 03/2027 vence em 10/03/2027 → Banco em 03/2027
  R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2027-03', vencimento: '2027-03-10', aluguel: 250000, banco: { situacao: 'emitido' } }, 'j');
  assert.match(TC.botoesMesC6('2027-03'), /mes=2027-03&(amp;)?ir=conferir-boletos/);
  await B.esquecerPonteLocal();
});

test('TEL-02: no calendário, boleto ainda não gerado de contrato que cobra o mês do vencimento leva aos Boletos do próprio mês', async () => {
  const { d, c } = cenario();
  comAdmin(d);
  R.atualizar(d, 'contratos', c.id, { cobranca_mes_seguinte: false }, 'j');
  const ev = R.eventosDoMes(d, '2027-03', '2027-02-01').find((e) => e.tipo === 'Boleto' && e.contrato_id === c.id && !e.cobranca_id);
  assert.equal(ev.competencia, '2027-03');
  const { calendarioDoPainel } = await import('../docs/js/telas/consultas.js');
  const html = calendarioDoPainel('2027-03', '2027-02-01');
  assert.ok(html.includes('#/cobrancas?comp=2027-03'), 'vai para os Boletos de 03/2027');
});

test('TEL-03/TEL-04: termo do novo valor por endereço mostra o aviso (sem erro) e a ação sem botão saiu', () => {
  const { d, c } = cenario();
  comAdmin(d);
  R.registrarRenovacao(d, c.id, { data: '2027-06-07', tipo: 'Novo valor negociado', novo_valor: 260000 }, 'j');
  const a = d.aditivos.find((x) => x.tipo === 'Novo valor');
  assert.ok(a, 'o termo do novo valor existe');
  const tela = texto(T.TELAS.aditivo({ partes: ['aditivo', String(a.id)], q: {} }));
  assert.match(tela, /Este termo é gerado pelo novo valor do aluguel e não se edita aqui/);
  assert.doesNotMatch(tela, /troca do dia do vencimento/);
  assert.equal(T.ACOES.removerArquivoAditivo, undefined, 'só a ação que pergunta se o termo valeu fica');
});

test('BAN-05: linha só do arquivo CSV não vai à ponte para gerar comprovante', () => {
  const csv = { fonte: 'csv', id_externo: 'csv:2026-11-05|-1500|tarifa|1' };
  assert.equal(Z.referenciaNoBanco(csv), null, 'sem identificador do banco');
  assert.equal(Z.soDoCsv(csv), true);
  assert.equal(Z.referenciaNoBanco({ fonte: 'csv', id_externo: 'csv:ABC', local_reference: 'ABC' }), 'ABC', 'com a referência local, vai');
  assert.equal(Z.referenciaNoBanco({ fonte: 'ofx', id_externo: 'FIT1' }), 'FIT1', 'OFX como antes');
  assert.equal(Z.referenciaNoBanco({ fonte: 'api', id_externo: 'f1' }), 'f1', 'API como antes');
  assert.equal(Z.soDoCsv({ fonte: 'ofx+api', id_externo: 'f1' }), false, 'juntada com a API passa a funcionar');
});
