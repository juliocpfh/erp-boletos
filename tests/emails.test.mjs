import assert from 'node:assert/strict';
import test from 'node:test';
import { dadosDoEmail } from '../docs/js/email-dados.js';
import { FECHO, MODELOS_EMAIL, modeloEmail, montarEmail, preencherEmail } from '../docs/js/modelos-email.js';
import * as R from '../docs/js/regras.js';

function base(extra = {}) {
  const d = R.bancoVazio();
  R.normalizar(d);
  const i = R.inserir(d, 'imoveis', { nome: 'Flores 3', endereco: 'Rua das Flores, 120', complemento: 'Apto 3', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }, 'j');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25', inquilino_email: 'maria@exemplo.com', inquilino_tipo: 'Pessoa física',
    aluguel_inicial: 250000, desconto_pontualidade_percentual: 8, dia_vencimento: 10, data_entrada: '2026-12-01', vigencia_inicio: '2026-12-01', prazo_meses: 30, prazo_tipo: 'Determinado',
    garantia_tipo: 'Caução', caucao_meses: 3, caucao_valor: 690000, indice_correcao: 'IPCA', reserva_valor: 50000, reserva_data: '2026-11-12',
    conta_agua: 'Por conta do inquilino', conta_energia: 'Por conta do inquilino', conta_iptu: 'Por conta do inquilino', conta_seguro: 'Por conta do inquilino', ...extra }, 'j');
  return { d, c, i };
}
const texto = (d, chave, alvo, resp) => montarEmail(modeloEmail(d, chave), dadosDoEmail(d, alvo, resp, '2026-11-12'));

test('preencher: condições, maiúsculas e campo vazio marcado para preencher', () => {
  const dados = { campos: { nome: 'maria', x: '' }, condicoes: { pj: false } };
  assert.equal(preencherEmail('Olá, {Nome}[se pj] (empresa)[senão]![fim] {X}', dados), 'Olá, Maria! [preencher: x]');
  assert.equal(preencherEmail('[se não pj]PF[fim] {NOME}', dados), 'PF MARIA');
});

test('todo e-mail fecha agradecendo e sem campo sobrando, em todos os casos de garantia e de pessoa', () => {
  for (const garantia_tipo of ['Caução', 'Fiador', 'Seguro fiança', 'Sem garantia', 'Depósito garantia']) {
    for (const inquilino_tipo of ['Pessoa física', 'Pessoa jurídica (empresa)']) {
      const { d, c } = base({ garantia_tipo, inquilino_tipo, representante_nome: 'Ana Lima', data_saida: '2026-12-15' });
      R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2026-12-15', garantia_valor: 690000, garantia_corrigida: 698510, debitos: 195198, saldo: 503312 }, 'j');
      for (const m of MODELOS_EMAIL) {
        if (m.chave.startsWith('ficha')) continue;
        const e = texto(d, m.chave, { contrato: c }, { informe: 'x' });
        assert.ok(e.texto.endsWith(FECHO), m.chave);
        assert.doesNotMatch(e.texto, /\[se |\[fim\]|\[senão\]|\{[a-z_]+\}/i, `${m.chave} ${garantia_tipo}`);
        assert.doesNotMatch(e.assunto, /\[preencher/, m.chave);
      }
    }
  }
});

test('envio da ficha: depois da reserva, condições e documentos conforme pessoa e garantia', () => {
  const { d, i } = base();
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Maria Souza', inquilino_tipo: 'Pessoa física', imoveis_ids: [i.id], aluguel_inicial: 250000, desconto_pontualidade_percentual: 8,
    dia_vencimento: 10, garantia_tipo: 'Fiador', reserva_valor: 50000, reserva_data: '2026-11-12', situacao: 'Em análise' }, 'j');
  const e = texto(d, 'ficha_envio', { ficha: f });
  assert.match(e.assunto, /^Rua das Flores, 120 – Apto 3: ficha cadastral/);
  assert.match(e.texto, /Recebemos o depósito da reserva de R\$ 500,00 em 12\/11\/2026/);
  assert.match(e.texto, /bonificação de R\$ 200,00 para pagamento até o vencimento \(R\$ 2\.300,00\)/);
  assert.match(e.texto, /Contas de água e energia: por conta do locatário/);
  assert.match(e.texto, /DO FIADOR[\s\S]*cônjuge ou companheiro/);
  assert.match(e.texto, /Lei Geral de Proteção de Dados/);
  assert.doesNotMatch(e.texto, /depósito da caução/, 'fiador: sem caução nos passos');
  f.inquilino_tipo = 'Pessoa jurídica (empresa)';
  assert.match(texto(d, 'ficha_envio', { ficha: f }).texto, /Contrato social/);
  const rep = texto(d, 'ficha_reprovada', { ficha: f }).texto;
  assert.match(rep, /devolvida em até 24 horas úteis/);
  assert.doesNotMatch(rep, /outro imóvel no seu perfil/);
});

test('contrato para assinar: conta da caução só com caução; saída antecipada cita a multa; acerto com o saldo', () => {
  const { d, c } = base();
  const a = texto(d, 'contrato_assinar', { contrato: c }, { prazo_assinatura: '2026-11-24' });
  assert.match(a.texto, /até 24\/11\/2026/);
  assert.match(a.texto, /36152656-3[\s\S]*58\.492\.818\/0001-59/);
  assert.match(a.texto, /Reajuste anual pelo IPCA/);
  c.garantia_tipo = 'Fiador';
  assert.doesNotMatch(texto(d, 'contrato_assinar', { contrato: c }).texto, /36152656/);
  c.garantia_tipo = 'Caução';
  c.data_saida = '2027-06-15';
  assert.match(texto(d, 'saida_aviso', { contrato: c }).texto, /antes do fim do prazo \(01\/06\/2029\) tem multa de 3 aluguéis/);
  R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2027-06-15', garantia_valor: 690000, garantia_corrigida: 698510, debitos: 195198, debitos_descricao: 'Pintura da sala: R$ 650,00', saldo: 503312 }, 'j');
  const s = texto(d, 'saida_calculo', { contrato: c }).texto;
  assert.match(s, /= Saldo a devolver: R\$ 5\.033,12/);
  assert.match(s, /Pintura da sala/);
  assert.match(s, /informe a chave Pix/);
  const v = texto(d, 'vistoria_assinada', { contrato: c }).texto;
  assert.match(v, /até 08\/12\/2026 \(5 dias úteis\)/);
});

test('modelo editado em Dados e backup vale no lugar do padrão', () => {
  const { d, c } = base();
  d.modelos_email.push({ id: 1, chave: 'ficha_reprovada', assunto: 'Ficha – {imovel}', texto: 'Oi, {nome}.' });
  assert.equal(texto(d, 'ficha_reprovada', { contrato: c }).texto, `Oi, Maria.\n\n${FECHO}`);
});

test('informe do IR: em fevereiro e março, inquilinos com NF no ano anterior que ainda não receberam o e-mail', async () => {
  const { informesPendentes } = await import('../docs/js/email-dados.js');
  const { d, c } = base();
  const cb = R.inserir(d, 'cobrancas', { contrato_id: c.id, competencia: '2026-12', vencimento: '2027-01-10' }, 'j');
  R.inserir(d, 'faturas', { situacao: 'Emitida', origem_tipo: 'cobranca', origem_id: cb.id, emissao: '2026-12-28', valor: 230000, numero: 1 }, 'j');
  assert.deepEqual(informesPendentes(d, '2027-01-20').contratos, [], 'em janeiro ainda não');
  assert.deepEqual(informesPendentes(d, '2027-02-01').contratos.map((x) => x.id), [c.id]);
  R.inserir(d, 'envios_email', { chave: 'informe_ir', contrato_id: c.id, data: '2027-02-03', como: 'enviado' }, 'j');
  assert.deepEqual(informesPendentes(d, '2027-02-05').contratos, []);
  assert.equal(informesPendentes(d, '2027-04-01').ano, null, 'depois de março sai do Painel');
});

test('documento assinado por todos vai anexo: contrato, vistoria, chaves, termo aditivo e termo de quitação', async () => {
  const { anexosProntos } = await import('../docs/js/email-dados.js');
  const { d, c } = base();
  const nomes = (chave, alvo = { contrato: c }) => anexosProntos(d, modeloEmail(d, chave), alvo).filter((a) => a.tipo === 'arquivo').map((a) => `${a.escopo}:${a.nome}`);
  assert.deepEqual(nomes('contrato_assinado'), [], 'sem o arquivo assinado, nada');
  c.doc_contrato_parcial = { data: '2026-11-20', arquivo: 'contrato-parcial.pdf', falta: ['LOCADORA'] };
  assert.deepEqual(nomes('contrato_assinado'), [], 'faltando assinatura, não vai');
  Object.assign(c, { doc_contrato_em: '2026-11-21', doc_contrato_arquivo: 'contrato-assinado.pdf', doc_vistoria_em: '2026-12-01', doc_vistoria_arquivo: 'vistoria.pdf', doc_chaves_em: '2026-12-01', doc_chaves_arquivo: 'chaves.pdf' });
  assert.deepEqual(nomes('contrato_assinado'), ['assinados:contrato-assinado.pdf']);
  assert.deepEqual(nomes('vistoria_assinada'), ['assinados:vistoria.pdf', 'assinados:chaves.pdf']);
  assert.match(texto(d, 'contrato_assinado', { contrato: c }).texto, /assinado por todas as partes: você e a locadora/);
  const a = R.inserir(d, 'aditivos', { contrato_id: c.id, data: '2027-03-01', assunto: 'troca do dia do vencimento', arquivo: 'aditivo.pdf', assinado_em: '2027-03-02' }, 'j');
  assert.deepEqual(nomes('aditivo_assinado', { contrato: c, aditivo: a }), ['aditivos:aditivo.pdf']);
  assert.match(texto(d, 'aditivo_assinado', { contrato: c, aditivo: a }).texto, /termo aditivo de 01\/03\/2027 \(troca do dia do vencimento\) foi assinado por todas as partes/);
  const e = R.inserir(d, 'encerramentos', { contrato_id: c.id, data_saida: '2029-06-01', saldo: 0, termo_assinado: 'comprovante-termo-quitacao-assinado-2029-06-01.pdf' }, 'j');
  assert.deepEqual(nomes('saida_encerramento'), [`contrato:${e.termo_assinado}`]);
});
