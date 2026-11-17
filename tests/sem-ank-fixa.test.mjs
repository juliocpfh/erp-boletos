// Mutirão 3000 (17/11/2026), itens que o dono mandou executar: o que era fixo da ANK no código passa a vir do cadastro ou de uma
// regra, com o padrão de hoje. Venda 20 (concessionárias), 17 (OFX de outro banco), 8 (contato do aviso no celular), 49 (leitura
// dos relógios configurável) e telas 48 (Internet "Não tem" no contrato novo). Dados fictícios (CPF e CNPJ de teste).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as CR from '../docs/js/config-regras.js';
import * as K from '../docs/js/contratos.js';
import * as F from '../docs/js/formularios.js';
import * as R from '../docs/js/regras.js';
import * as Z from '../docs/js/conciliacao.js';
import { autorizacaoVapid, b64url, contatoVapid, deB64url } from '../nuvem/push.mjs';

const CNPJ = '11.222.333/0001-81';
function base({ empresa = {} } = {}) {
  const d = R.bancoVazio();
  const e = R.inserir(d, 'emitentes', { nome: 'Empresa Teste', razao_social: 'EMPRESA TESTE LTDA', cnpj: CNPJ, ativo: true, ...empresa }, 'teste');
  const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Casa 1', endereco: 'Rua A, 1', cidade: 'Cidade' }, 'teste');
  R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: e.id, percentual: 100 }, 'teste');
  R.normalizar(d);
  return { d, e, i };
}
const contrato = (d, i, extra = {}) => R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ana Teste', inquilino_cpf: '529.982.247-25', data_entrada: '2026-11-02',
  vigencia_inicio: '2026-11-02', aluguel_inicial: 200000, dia_vencimento: 10, garantia_tipo: 'Sem garantia', ...extra }, 'teste');

// --------------------------------------------------------------------------- telas 48
test('telas 48: contrato e ficha novos vêm com a Internet "Não tem"; gás, condomínio e o resto continuam "Por conta do inquilino"', () => {
  assert.equal(F.contaPadrao('conta_internet'), 'Não tem');
  for (const lista of [F.CONTRATO, F.FICHA_FIM]) {
    const padrao = (nome) => (lista.find((c) => c.nome === nome) || {}).padrao;
    assert.equal(padrao('conta_internet'), 'Não tem');
    for (const k of ['conta_agua', 'conta_energia', 'conta_gas', 'conta_condominio']) assert.equal(padrao(k), 'Por conta do inquilino', k);
  }
  // com "Não tem": a internet não entra na representação do contrato nem vira etapa da rotina de entrada
  const { d, i } = base();
  const c = contrato(d, i, { conta_agua: 'Por conta do inquilino', conta_energia: 'Por conta do inquilino', conta_gas: 'Não tem', conta_condominio: 'Não tem', conta_internet: 'Não tem' });
  assert.ok(!K.representacaoDoContrato(d, c, i).some((x) => /internet/i.test(x)));
  assert.ok(!R.rotinaEntrada(d, c, '2026-11-05').some((e) => /internet/i.test(`${e.chave} ${e.titulo}`)));
  // quem escolhe "Por conta do inquilino" continua com a cláusula do provedor (o contrato já gravado não muda)
  const c2 = contrato(d, i, { inquilino_nome: 'Bia Teste', conta_internet: 'Por conta do inquilino' });
  assert.ok(K.representacaoDoContrato(d, c2, i).some((x) => /provedor de internet/.test(x)));
});

// --------------------------------------------------------------------------- venda 49
test('venda 49: leitura dos relógios é regra; padrão obrigatória (como hoje), desligada pode ficar em branco', () => {
  const def = CR.definicaoRegra('leitura_relogios_obrigatoria');
  assert.equal(def.padrao, true);
  assert.equal(def.tipo, 'simnao');
  for (const k of ['explica', 'consequencia', 'lei']) assert.ok(def[k] && def[k].length > 20, k);
  const { d, i } = base();
  const c = contrato(d, i, { conta_agua: 'Por conta do inquilino', conta_energia: 'Por conta do inquilino', conta_gas: 'Não tem' });
  try {
    CR.usarRegras(d);
    assert.deepEqual(R.relogiosObrigatorios(c), ['agua', 'energia']);
    assert.throws(() => R.gravarLeitura(d, c, 'Entrada do inquilino', '2026-11-02', { agua: '123' }, 'teste'), /relógio de energia/);
    // desligada pelo administrador
    d.config_regras = [{ chave: 'leitura_relogios_obrigatoria', valor: false }];
    CR.usarRegras(d);
    assert.deepEqual(R.relogiosObrigatorios(c), []);
    assert.equal(R.gravarLeitura(d, c, 'Entrada do inquilino', '2026-11-02', {}, 'teste'), null);
    assert.equal(d.leituras.length, 0); // não cria leitura vazia
    R.gravarLeitura(d, c, 'Entrada do inquilino', '2026-11-02', { agua: '123' }, 'teste'); // só a água: aceita
    assert.equal(R.leituraDo(d, c.id, 'Entrada do inquilino').agua, '123');
    // saída sem leitura: a etapa "Contas" não pede a leitura
    R.atualizar(d, 'contratos', c.id, { data_saida: '2026-12-15' }, 'teste');
    const contas = R.roteiroSaida(d, R.buscar(d, 'contratos', c.id), '2026-12-20').find((x) => x.chave === 'contas');
    assert.match(contas.detalhe, /não é obrigatória/);
    d.config_regras = [];
    CR.usarRegras(d);
    assert.match(R.roteiroSaida(d, R.buscar(d, 'contratos', c.id), '2026-12-20').find((x) => x.chave === 'contas').detalhe, /falta a leitura dos relógios/);
  } finally {
    CR.usarRegras(null);
  }
});

// --------------------------------------------------------------------------- venda 20
test('venda 20: lista de concessionárias pelo Estado da empresa; a do Paraná continua o padrão', () => {
  const PR = ['Copel', 'Sanepar', 'Supergasbras', 'Condomínio'];
  // banco novo sem empresa: a do Paraná (sem gravar: ainda não se sabe o Estado)
  const v = R.bancoVazio();
  R.normalizar(v);
  assert.equal(v.listas.concessionarias, undefined);
  assert.deepEqual(R.lista(v, 'concessionarias'), PR);
  // empresa do Paraná (e a empresa gravada antes do campo "Estado da sede", que fica com PR)
  assert.deepEqual(base({ empresa: { uf_sede: 'PR', assina_documentos: true } }).d.listas.concessionarias, PR);
  assert.deepEqual(base().d.listas.concessionarias, PR);
  // outra imobiliária, em SP: as companhias do cadastro dela
  const { d, i } = base({ empresa: { uf_sede: 'SP', assina_documentos: true, energia_concessionaria: 'Enel Distribuição São Paulo (ENEL)',
    agua_concessionaria: 'Companhia de Saneamento Básico do Estado de São Paulo (SABESP)' } });
  assert.deepEqual(d.listas.concessionarias, ['Enel', 'Sabesp', 'Condomínio']);
  // a rotina de entrada usa o nome dela e reconhece o protocolo da Sabesp
  const c = contrato(d, i, { conta_agua: 'Por conta do inquilino', conta_energia: 'Por conta do inquilino' });
  const agua = () => R.rotinaEntrada(d, c, '2026-11-05').find((e) => e.chave === 'agua');
  assert.match(agua().titulo, /\(Sabesp\)/);
  R.inserir(d, 'titularidades', { imovel_id: i.id, contrato_id: c.id, concessionaria: 'Sabesp', tipo: 'Para o inquilino', situacao: 'Concluído', data: '2026-11-04', protocolo: '999' }, 'teste');
  assert.equal(agua().situacao, 'feita');
  // lista já gravada (a da ANK) não muda ao normalizar de novo
  d.listas.concessionarias = PR;
  R.normalizar(d);
  assert.deepEqual(d.listas.concessionarias, PR);
});

// --------------------------------------------------------------------------- venda 8
test('venda 8: contato do aviso no celular vem do servidor (sem o e-mail da ANK fixo)', async () => {
  assert.equal(contatoVapid({ VAPID_CONTATO: 'mailto:avisos@exemplo.com.br' }), 'mailto:avisos@exemplo.com.br');
  assert.equal(contatoVapid({ VAPID_CONTATO: ' avisos@exemplo.com.br ' }), 'mailto:avisos@exemplo.com.br');
  assert.equal(contatoVapid({ GMAIL_REMETENTE: 'contato@exemplo.com.br' }), 'mailto:contato@exemplo.com.br');
  assert.equal(contatoVapid({ VAPID_CONTATO: 'errado', AVISOS_EQUIPE: 'x, equipe@exemplo.com.br' }), 'mailto:equipe@exemplo.com.br');
  assert.equal(contatoVapid({}), null);
  // sem contato: o aviso vai sem o "sub" (nunca o e-mail da ANK)
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const cab = await autorizacaoVapid({ VAPID_PUBLICA: b64url(pub), VAPID_PRIVADA: jwk.d }, 'https://fcm.googleapis.com/fcm/send/abc');
  const corpo = JSON.parse(new TextDecoder().decode(deB64url(cab.match(/t=[^.]+\.([^.]+)\./)[1])));
  assert.equal(corpo.sub, undefined);
  assert.doesNotMatch(cab, /ankjck/);
});

// --------------------------------------------------------------------------- venda 17
const ofx = (conta, linhas, saldo = null) => `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>${conta}</ACCTID></BANKACCTFROM><BANKTRANLIST><DTSTART>20261101</DTSTART><DTEND>20261115</DTEND>
${linhas.map(([fitid, valor, data, memo]) => `<STMTTRN><FITID>${fitid}</FITID><TRNAMT>${valor}</TRNAMT><DTPOSTED>${data.replace(/-/g, '')}100000[-3:BRT]</DTPOSTED><TRNTYPE>${valor.startsWith('-') ? 'DEBIT' : 'CREDIT'}</TRNTYPE><MEMO>${memo}</MEMO></STMTTRN>`).join('\n')}
</BANKTRANLIST>${saldo ? `<LEDGERBAL><BALAMT>${saldo[0]}</BALAMT><DTASOF>${saldo[1].replace(/-/g, '')}</DTASOF></LEDGERBAL>` : ''}</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('venda 17: extrato OFX numa conta de outro banco (sem a ponte), com as conferências de saldo e de repetido', () => {
  const { d, e, i } = base();
  d.config_banco = { ...d.config_banco, ativo: true, conta_padrao_id: 'ank', contas: [{ id: 'ank', apelido: 'ANK', emitente_id: e.id, ambiente: 'sandbox' }] };
  R.normalizar(d);
  assert.equal('contas_arquivo' in R.configBanco(d), false); // quem não tem conta de outro banco: nada muda
  const c = contrato(d, i);
  R.gerarCobrancas(d, '2026-11', 'teste');
  const cb = d.cobrancas.find((x) => x.contrato_id === c.id);
  // o administrador cadastra a conta do outro banco (o código sai do apelido)
  const conta = R.salvarContaArquivo(d, { apelido: 'Itaú', banco: 'Itaú', emitente_id: e.id }, 'teste');
  assert.equal(conta.id, 'itau');
  assert.throws(() => R.salvarContaBanco(d, { id: 'itau', emitente_id: e.id }, 'teste'), /outro banco/);
  assert.throws(() => R.salvarContaArquivo(d, { apelido: 'ANK', emitente_id: e.id }, 'teste'), /conta do C6/);
  // a parte do C6 não vê a conta: emissão, ponte e integração continuam só com a ank
  assert.deepEqual(R.configBanco(d).contas.map((x) => x.id), ['ank']);
  assert.equal(R.contaEmissora(d).id, 'ank');
  assert.equal(R.contaBancaria(d, 'itau').apelido, 'Itaú');
  // importa o arquivo do Itaú: entra, sem ligar nada sozinho (nem a entrada do valor exato do boleto)
  const valorBoleto = (R.totais ? R.totais(cb).a_pagar_pontual : cb.valor) / 100;
  const r = Z.lerOfx(ofx('4455', [['A1', valorBoleto.toFixed(2), '2026-11-05', 'PIX RECEBIDO ANA TESTE'], ['A2', '-50.00', '2026-11-06', 'TARIFA']], ['1000.00', '2026-11-15']));
  const imp = Z.importarExtrato(d, 'itau', r.lancamentos, 'teste', { de: r.de, ate: r.ate, contaDoArquivo: r.conta, hoje: '2026-11-20' });
  assert.equal(imp.novas.length, 2);
  assert.ok(imp.novas.every((m) => m.conta_id === 'itau' && m.classificacao === null && m.cobranca_id === null));
  assert.equal(R.buscar(d, 'cobrancas', cb.id).data_pagamento, null);
  assert.equal(R.extratoImportadoAte(d, 'itau'), '2026-11-15');
  // o mesmo arquivo de novo: nada em dobro; arquivo de outra conta: recusado
  assert.equal(Z.importarExtrato(d, 'itau', r.lancamentos, 'teste', { contaDoArquivo: r.conta, hoje: '2026-11-20' }).novas.length, 0);
  assert.throws(() => Z.importarExtrato(d, 'itau', Z.lerOfx(ofx('9999', [['B1', '10.00', '2026-11-07', 'X']])).lancamentos, 'teste', { contaDoArquivo: '9999' }), /de nº 4455/);
  // a conferência do saldo do arquivo vale também aqui
  assert.equal(Z.registrarSaldo(d, 'itau', { data: '2026-11-15', valor: 100000, fonte: 'ofx' }, 'teste').situacao, 'primeira');
  // a conta entra nas pendências do mês (extrato sem destino) e não pode ser tirada com extrato importado
  assert.ok(R.pendenciasBancoDoMes(d, '2026-11', '2026-11-20').porConta.some((x) => x.id === 'itau' && x.semDestino === 2));
  assert.throws(() => R.excluirContaArquivo(d, 'itau', 'teste'), /movimentação/);
  // conta nova de outro banco, ainda sem extrato: sai
  R.salvarContaArquivo(d, { apelido: 'Caixa', banco: 'Caixa', emitente_id: e.id }, 'teste');
  R.excluirContaArquivo(d, 'caixa', 'teste');
  assert.deepEqual(R.contasSoArquivo(d).map((x) => x.id), ['itau']);
});
