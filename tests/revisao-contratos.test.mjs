// Revisão de 09/11/2026 (contratos): renovação no cadastro, termo da troca com o fiador, vistoria de saída de quem herdou,
// extenso, numeração dos termos aditivos, exclusão do contrato, termo da troca assinado e datas por extenso.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as K from '../docs/js/contratos.js';
import * as R from '../docs/js/regras.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const texto = (blocos) => blocos.map((b) => (b.runs ? b.runs.map((r) => r.t).join('') : b.linhas ? '[tabela]' : `[${(b.pessoas || []).map((p) => p.papel).join(', ')}]`)).join('\n');

/** Formulário "Editar contrato" (valores → ajustar) num processo à parte (app.js não roda no Node). */
function editarNoCadastro(d, id, mudancas = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cadastro-'));
  const arquivo = path.join(pasta, 'banco.json');
  fs.writeFileSync(arquivo, JSON.stringify(d));
  try {
    execFileSync(process.execPath, [path.join(AQUI, 'cadastro-contrato-node.mjs'), arquivo, String(id), JSON.stringify(mudancas)], { stdio: 'ignore', timeout: 60000 });
    return JSON.parse(fs.readFileSync(`${arquivo}.saida.json`, 'utf8'));
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

function casa() {
  const d = R.bancoVazio();
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true, endereco_sede: 'Rua A, 1',
    representante_nome: 'Maria', representante_genero: 'Feminino', representante_cargo: 'sócia' }, 'j');
  const i = R.inserir(d, 'imoveis', { nome: 'Casa 3', endereco: 'Rua X, 10', cidade: 'Curitiba' }, 'j');
  R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: ank.id, percentual: 100 }, 'j');
  return { d, i };
}

// --------------------------------------------------------------------------
// 1. Renovação: o fim do contrato não volta ao início + prazo ao editar o cadastro
// --------------------------------------------------------------------------
function renovado() {
  const { d, i } = casa();
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Pedro Souza', inquilino_cpf: '529.982.247-25', telefone: '41 3333-0000', data_entrada: '2024-03-05',
    vigencia_inicio: '2024-03-05', prazo_tipo: 'Determinado', prazo_meses: 30, vigencia_fim: '2026-09-05', aluguel_inicial: 300000, dia_vencimento: 10,
    garantia_tipo: 'Sem garantia', bonificacao: false }, 'j');
  R.registrarRenovacao(d, c.id, { data: '2026-09-05', tipo: 'Renovado com nova data de término', nova_vigencia_fim: '2028-09-05' }, 'j');
  return { d, i, c };
}

test('renovação: leva o fim e o prazo juntos (05/03/2024 a 05/09/2028 = 54 meses), um fim só para o contrato', () => {
  const { d, c } = renovado();
  assert.equal(c.vigencia_fim, '2028-09-05');
  assert.equal(c.prazo_meses, 54, 'o prazo acompanha a renovação (não ficam duas verdades)');
  assert.equal(R.fimDoContrato(d, c), '2028-09-05');
  assert.equal(R.prazoDoContrato(d, c), 54);
  // sem renovação: início + prazo
  const { d: d2, i } = casa();
  const s = R.inserir(d2, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ana', data_entrada: '2026-09-05', vigencia_inicio: '2026-09-01', prazo_tipo: 'Determinado', prazo_meses: 30 }, 'j');
  assert.equal(R.fimDoContrato(d2, s), '2029-03-05', 'conta da data de vigência inicial');
  // "Passou a prazo indeterminado" depois da renovação: a nova data deixa de valer
  R.registrarRenovacao(d, c.id, { data: '2028-09-05', tipo: 'Passou a prazo indeterminado' }, 'j');
  assert.equal(c.prazo_tipo, 'Indeterminado');
  assert.equal(R.fimDoContrato(d, { ...c, prazo_tipo: 'Determinado', prazo_meses: 60 }), '2029-03-05');
});

test('renovação: editar só o telefone no cadastro mantém o fim da renovação (05/09/2028)', () => {
  const { d, c } = renovado();
  const r = editarNoCadastro(d, c.id, { telefone: '41 99999-0000' });
  assert.deepEqual(r.erros, {});
  assert.equal(r.dados.vigencia_fim, '2028-09-05', 'não volta a 05/09/2026 (início + 30 meses)');
  assert.equal(r.dados.prazo_meses, 54);
  // renovação gravada antes desta correção (prazo ainda 30): o formulário já mostra e grava 54 meses
  c.prazo_meses = 30;
  const antigo = editarNoCadastro(d, c.id, { telefone: '41 99999-0000' });
  assert.deepEqual(antigo.erros, {});
  assert.equal(antigo.dados.vigencia_fim, '2028-09-05');
  assert.equal(antigo.dados.prazo_meses, 54);
  // mudar o prazo de um contrato renovado: avisa que o fim muda pela renovação
  const mudou = editarNoCadastro(d, c.id, { prazo_meses: 36 });
  assert.match(mudou.erros.prazo_meses || '', /renovado até 05\/09\/2028/);
  // contrato sem renovação: o prazo continua mandando no fim
  const { d: d2, i } = casa();
  const s = R.inserir(d2, 'contratos', { imovel_id: i.id, inquilino_nome: 'Ana', inquilino_cpf: '529.982.247-25', data_entrada: '2026-09-05', vigencia_inicio: '2026-09-05',
    prazo_tipo: 'Determinado', prazo_meses: 30, vigencia_fim: '2029-03-05', aluguel_inicial: 200000, dia_vencimento: 10, garantia_tipo: 'Sem garantia', bonificacao: false }, 'j');
  const outro = editarNoCadastro(d2, s.id, { prazo_meses: 36 });
  assert.deepEqual(outro.erros, {});
  assert.equal(outro.dados.vigencia_fim, '2029-09-05');
});

test('renovação: troca de titular continua com o fim do contrato assumido; renovado, vale a renovação', () => {
  const { d, i, c } = renovado();
  const n = R.inserir(d, 'contratos', { imovel_id: i.id, contrato_anterior_id: c.id, inquilino_nome: 'Lúcia Prado', inquilino_cpf: '529.982.247-25', data_entrada: '2027-04-01',
    vigencia_inicio: '2027-04-01', prazo_tipo: 'Determinado', prazo_meses: 30, vigencia_fim: '2028-09-05', aluguel_inicial: 300000, dia_vencimento: 10, garantia_tipo: 'Sem garantia', bonificacao: false }, 'j');
  assert.equal(R.fimDoContrato(d, n), '2028-09-05', 'o prazo não recomeça na troca');
  const r = editarNoCadastro(d, n.id, { telefone: '41 98888-0000' });
  assert.deepEqual(r.erros, {});
  assert.equal(r.dados.vigencia_fim, '2028-09-05');
  R.inserir(d, 'aditivos', { contrato_id: n.id, imovel_id: i.id, tipo: 'Troca de titular', data: '2027-04-01', assunto: 'Troca', arquivo: 'termo.pdf' }, 'j');
  R.registrarRenovacao(d, n.id, { data: '2028-09-05', tipo: 'Renovado com nova data de término', nova_vigencia_fim: '2030-09-05' }, 'j');
  assert.equal(R.fimDoContrato(d, n), '2030-09-05');
  assert.equal(editarNoCadastro(d, n.id, { telefone: '41 97777-0000' }).dados.vigencia_fim, '2030-09-05');
});

test('renovação: contrato que perdeu o fim da renovação ao ser editado volta ao fim renovado na rotina de abertura', () => {
  const { d, c } = renovado();
  // o que a edição antiga gravava: início + prazo (05/09/2026), com o prazo de antes da renovação
  Object.assign(c, { vigencia_fim: '2026-09-05', prazo_meses: 30 });
  assert.ok(R.rotinaDeAbertura(d, 'julio', { soConferir: true }) >= 1);
  R.rotinaDeAbertura(d, 'julio');
  assert.equal(c.vigencia_fim, '2028-09-05');
  assert.equal(c.prazo_meses, 54);
  assert.ok(d.historico.some((h) => /renovação/.test(h.descricao) && /05\/09\/2028/.test(h.descricao)), 'passa pelo histórico');
  assert.equal(R.rotinaDeAbertura(d, 'julio', { soConferir: true }), 0, 'uma vez só');
});

// --------------------------------------------------------------------------
// 2. Termo aditivo da troca de titular com o fiador do contrato (que ainda está no contrato de quem sai)
// --------------------------------------------------------------------------
function trocaComFiador(garantia = 'continua') {
  const { d, i } = casa();
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Pedro Souza', inquilino_cpf: '529.982.247-25', inquilino_genero: 'Masculino', data_entrada: '2026-01-10',
    vigencia_inicio: '2026-01-10', vigencia_fim: '2028-07-10', prazo_meses: 30, aluguel_inicial: 275000, desconto_pontualidade_percentual: 9.090909090909092, dia_vencimento: 10,
    indice_correcao: 'IPCA', garantia_tipo: 'Fiador', finalidade: 'Residencial', descricao_objeto: 'a casa nº 3' }, 'j');
  R.inserir(d, 'fiadores', { contrato_id: c.id, nome: 'José Fiador', cpf: '529.982.247-25', genero: 'Masculino' }, 'j');
  const n = R.inserir(d, 'contratos', { imovel_id: i.id, contrato_anterior_id: c.id, inquilino_nome: 'Lúcia Prado', inquilino_cpf: '529.982.247-25', inquilino_genero: 'Feminino',
    data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', vigencia_fim: '2028-07-10', prazo_meses: 30, aluguel_inicial: 275000, desconto_pontualidade_percentual: 9.090909090909092,
    dia_vencimento: 10, indice_correcao: 'IPCA', garantia_tipo: 'Fiador', garantia_na_troca: garantia, finalidade: 'Residencial', descricao_objeto: 'a casa nº 3' }, 'j');
  const modelo = K.modelosDe(d, 'aditivo_troca')[0];
  const a = R.salvarAditivoTroca(d, n.id, { data: '2026-11-20', texto: modelo.texto }, 'j');
  return { d, c, n, a };
}

test('termo da troca de titular com a garantia que continua: o fiador do contrato concorda e assina', () => {
  const { d, n, a } = trocaComFiador();
  const t = texto(K.montarContrato(a.texto, K.dadosDoAditivo(d, n, a)));
  assert.match(t, /FIADOR: JOSÉ FIADOR/, 'o fiador é parte do termo');
  assert.match(t, /O FIADOR declara conhecer e aceitar a substituição do locatário e garante as obrigações do LOCATÁRIO ENTRANTE/, 'cláusula em que ele concorda');
  assert.match(t, /\[LOCADORA, LOCATÁRIO SAINTE, LOCATÁRIO ENTRANTE, FIADOR\]/);
  assert.doesNotMatch(t, /DA GARANTIA\nDISPOSIÇÕES FINAIS/, '"DA GARANTIA" não fica vazia');
  assert.equal(K.fiadoresDaTroca(d, n, a.data).map((f) => f.nome).join(), 'José Fiador');
});

test('termo da troca com garantia nova: o fiador de quem sai não entra (só o de quem entra)', () => {
  const { d, n, a } = trocaComFiador('nova');
  let t = texto(K.montarContrato(a.texto, K.dadosDoAditivo(d, n, a)));
  assert.doesNotMatch(t, /JOSÉ FIADOR/);
  R.inserir(d, 'fiadores', { contrato_id: n.id, nome: 'Ana Lima', cpf: '529.982.247-25', genero: 'Feminino' }, 'j');
  t = texto(K.montarContrato(a.texto, K.dadosDoAditivo(d, n, a)));
  assert.match(t, /ANA LIMA/);
  assert.doesNotMatch(t, /JOSÉ FIADOR/);
});

// --------------------------------------------------------------------------
// 3. Vistoria de saída de quem herdou o contrato: compara com a vistoria de entrada do contrato (no titular anterior)
// --------------------------------------------------------------------------
function herdeiroQueSai() {
  const { d, i } = casa();
  const a = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Pedro Souza', data_entrada: '2025-01-10', vigencia_inicio: '2025-01-10', vigencia_fim: '2027-07-10',
    aluguel_inicial: 300000, garantia_tipo: 'Sem garantia', data_saida: '2026-03-31' }, 'j');
  const entrada = R.inserir(d, 'vistorias', { contrato_id: a.id, imovel_id: i.id, tipo: 'Entrada', data: '2025-01-10', chaves: '2 chaves da porta', itens: [
    { comodo: 'Sala', item: 'Piso', situacao: 'Avaria', obs: 'piso trincado (já estava)' },
    { comodo: 'Sala', item: 'Paredes', situacao: 'Novo' }] }, 'j');
  const n = R.inserir(d, 'contratos', { imovel_id: i.id, contrato_anterior_id: a.id, inquilino_nome: 'Lúcia Prado', data_entrada: '2026-04-01', vigencia_inicio: '2026-04-01',
    vigencia_fim: '2027-07-10', aluguel_inicial: 300000, garantia_tipo: 'Sem garantia', heranca_transferida: '2026-04-01', data_saida: '2026-10-31' }, 'j');
  const saida = R.inserir(d, 'vistorias', { contrato_id: n.id, imovel_id: i.id, tipo: 'Saída', data: '2026-10-31', itens: [
    { comodo: 'Sala', item: 'Piso', situacao: 'Avaria', obs: 'piso trincado' },
    { comodo: 'Sala', item: 'Paredes', situacao: 'Marcas de uso', obs: 'furos' }] }, 'j');
  return { d, i, a, n, entrada, saida };
}

test('vistoria de saída de quem herdou: compara com a de entrada do contrato (Pedro, 10/01/2025)', () => {
  const { d, n, entrada } = herdeiroQueSai();
  assert.equal(K.vistoriaDeEntrada(d, n).id, entrada.id, 'sobe a cadeia até a vistoria de entrada do contrato');
  const r = K.resultadoVistoriaSaida(d, n);
  assert.equal(r.texto, 'Com pendências');
  assert.deepEqual(r.pendencias, ['Sala – Paredes (Marcas de uso: furos)'], 'as paredes pioraram; o piso já estava trincado');
  // documento da saída com a tabela "Na entrada / Na saída"
  const t = texto(K.vistoriaBlocos(d, n, r.vistoria, null, {}, K.vistoriaDeEntrada(d, n).itens).blocos);
  assert.match(t, /\[tabela\]/);
  assert.match(t, /Os itens destacados pioraram em relação à vistoria de entrada\./);
});

test('vistoria de entrada própria feita na troca de titular: vale ela (é o estado em que o novo titular recebeu)', () => {
  const { d, i, n } = herdeiroQueSai();
  const propria = R.inserir(d, 'vistorias', { contrato_id: n.id, imovel_id: i.id, tipo: 'Entrada', data: '2026-04-01', itens: [
    { comodo: 'Sala', item: 'Piso', situacao: 'Avaria', obs: 'piso trincado' },
    { comodo: 'Sala', item: 'Paredes', situacao: 'Marcas de uso', obs: 'furos do Pedro' }] }, 'j');
  assert.equal(K.vistoriaDeEntrada(d, n).id, propria.id);
  assert.equal(K.resultadoVistoriaSaida(d, n).texto, 'Sem pendências');
  // terceiro titular sem vistoria própria: vale a mais recente da cadeia (a de Lúcia, feita na troca)
  const x = R.inserir(d, 'contratos', { imovel_id: i.id, contrato_anterior_id: n.id, inquilino_nome: 'Rita Alves', data_entrada: '2026-11-01', vigencia_inicio: '2026-11-01',
    vigencia_fim: '2027-07-10', aluguel_inicial: 300000, garantia_tipo: 'Sem garantia' }, 'j');
  assert.equal(K.vistoriaDeEntrada(d, x).id, propria.id);
  // sem nenhuma vistoria de entrada na cadeia: nenhuma
  const { d: d2, i: i2 } = casa();
  const s = R.inserir(d2, 'contratos', { imovel_id: i2.id, inquilino_nome: 'Ana', data_entrada: '2026-01-01', vigencia_inicio: '2026-01-01' }, 'j');
  assert.equal(K.vistoriaDeEntrada(d2, s), null);
});

// --------------------------------------------------------------------------
// 4. Extenso: o percentual sai do número escrito no documento; "um milhão e mil"
// --------------------------------------------------------------------------
test('percentual por extenso: lido do número como sai no documento', () => {
  assert.equal(K.percentualComExtenso(100 / 11), '9,0909% (nove vírgula zero novecentos e nove por cento)');
  assert.equal(K.percentualComExtenso(1.05), '1,05% (um vírgula zero cinco por cento)');
  assert.equal(K.percentualComExtenso(4.5), '4,5% (quatro vírgula cinco por cento)');
  assert.equal(K.percentualComExtenso(0.5), '0,5% (zero vírgula cinco por cento)');
  assert.equal(K.percentualComExtenso(0.033), '0,033% (zero vírgula zero trinta e três por cento)');
  // os que já saíam certos continuam iguais
  assert.equal(K.percentualComExtenso(2), '2% (dois por cento)');
  assert.equal(K.percentualComExtenso(1), '1% (um por cento)');
  assert.equal(K.percentualComExtenso(10), '10% (dez por cento)');
  assert.equal(K.percentualComExtenso(0.33), '0,33% (zero vírgula trinta e três por cento)');
  assert.equal(K.percentualComExtenso(3.39), '3,39% (três vírgula trinta e nove por cento)');
  assert.equal(K.percentualComExtenso(12.75), '12,75% (doze vírgula setenta e cinco por cento)');
  assert.equal(K.percentualComExtenso(0), '0% (zero por cento)');
});

test('valores por extenso: "um milhão e mil"; os que já saíam certos continuam iguais', () => {
  assert.equal(K.numeroPorExtenso(1001000), 'um milhão e mil');
  assert.equal(K.valorComExtenso(100100000), 'R$ 1.001.000,00 (um milhão e mil reais)');
  assert.equal(K.numeroPorExtenso(1100000), 'um milhão e cem mil');
  assert.equal(K.numeroPorExtenso(2500000), 'dois milhões e quinhentos mil');
  // iguais a antes
  assert.equal(K.valorComExtenso(1), 'R$ 0,01 (um centavo)');
  assert.equal(K.valorComExtenso(99), 'R$ 0,99 (noventa e nove centavos)');
  assert.equal(K.valorComExtenso(101), 'R$ 1,01 (um real e um centavo)');
  assert.equal(K.valorComExtenso(200110), 'R$ 2.001,10 (dois mil e um reais e dez centavos)');
  assert.equal(K.valorComExtenso(100000000), 'R$ 1.000.000,00 (um milhão de reais)');
  assert.equal(K.valorComExtenso(200000000), 'R$ 2.000.000,00 (dois milhões de reais)');
  assert.equal(K.valorComExtenso(200000100), 'R$ 2.000.001,00 (dois milhões e um reais)');
  assert.equal(K.valorComExtenso(1234567890), 'R$ 12.345.678,90 (doze milhões trezentos e quarenta e cinco mil seiscentos e setenta e oito reais e noventa centavos)');
  assert.equal(K.valorComExtenso(10100000), 'R$ 101.000,00 (cento e um mil reais)');
  assert.equal(K.valorComExtenso(110100), 'R$ 1.101,00 (mil cento e um reais)');
  for (const [n, t] of [[100, 'cem'], [101, 'cento e um'], [1000, 'mil'], [1001, 'mil e um'], [1100, 'mil e cem'], [1250, 'mil duzentos e cinquenta'],
    [100001, 'cem mil e um'], [1000000, 'um milhão'], [1000001, 'um milhão e um'], [2000100, 'dois milhões e cem'], [1234000, 'um milhão duzentos e trinta e quatro mil'],
    [1200300, 'um milhão duzentos mil e trezentos'], [21000, 'vinte e um mil']]) assert.equal(K.numeroPorExtenso(n), t, String(n));
  for (const [n, t] of [[1, 'primeira'], [11, 'décima primeira'], [21, 'vigésima primeira'], [99, 'nonagésima nona']]) assert.equal(K.ordinalPorExtenso(n), t);
});

// --------------------------------------------------------------------------
// 5. Numeração dos termos aditivos: continua na troca de titular (é o mesmo contrato)
// --------------------------------------------------------------------------
test('numeração do termo aditivo conta os termos de todos os contratos da cadeia', () => {
  const { d, i } = casa();
  const a = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Pedro Souza', data_entrada: '2025-01-10', vigencia_inicio: '2025-01-10', vigencia_fim: '2027-07-10',
    aluguel_inicial: 300000, dia_vencimento: 10, garantia_tipo: 'Sem garantia' }, 'j');
  const v = R.salvarAditivoVencimento(d, a.id, { data: '2025-06-01', dia_novo: 15, mes: '2025-07', texto: K.modelosDe(d, 'aditivo')[0].texto }, 'j');
  R.assinarAditivo(d, v.id, { data: '2025-06-02', arquivo: 'x.pdf' }, 'j');
  assert.equal(v.numero, 1);
  const n = R.inserir(d, 'contratos', { imovel_id: i.id, contrato_anterior_id: a.id, inquilino_nome: 'Lúcia Prado', data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01',
    vigencia_fim: '2027-07-10', aluguel_inicial: 300000, dia_vencimento: 15, garantia_tipo: 'Sem garantia' }, 'j');
  const t = R.salvarAditivoTroca(d, n.id, { data: '2026-11-20', texto: K.modelosDe(d, 'aditivo_troca')[0].texto }, 'j');
  assert.equal(t.numero, 2);
  assert.match(texto(K.montarContrato(t.texto, K.dadosDoAditivo(d, n, t))), /^2º TERMO ADITIVO/);
  R.assinarAditivo(d, t.id, { data: '2026-11-21', arquivo: 'troca.pdf' }, 'j');
  const v2 = R.salvarAditivoVencimento(d, n.id, { data: '2027-01-05', dia_novo: 20, mes: '2027-02', texto: K.modelosDe(d, 'aditivo')[0].texto }, 'j');
  assert.equal(v2.numero, 3);
  // termo excluído antes de assinar não faz repetir o número do seguinte
  R.excluir(d, 'aditivos', v.id, 'j');
  assert.equal(R.salvarAditivoVencimento(d, n.id, { data: '2027-02-05', dia_novo: 25, mes: '2027-03', texto: 'x' }, 'j').numero, 4);
});
