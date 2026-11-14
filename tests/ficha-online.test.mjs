// Ficha pela internet, lado do sistema (docs/js/ficha-online.js): o formulário de cada pessoa, o que vai preenchido, o
// contexto do link (proposta, documentos) e o texto do WhatsApp. Dados fictícios (CPF de teste).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as FO from '../docs/js/ficha-online.js';
import { formularioValido, valoresValidos } from '../nuvem/ficha-publica.mjs';
import * as R from '../docs/js/regras.js';

function base() {
  const d = R.bancoVazio();
  R.normalizar(d);
  R.inserir(d, 'emitentes', { nome: 'ANK', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', ativo: true }, 'j');
  const i = R.inserir(d, 'imoveis', { nome: 'Flores 3', endereco: 'Rua das Flores, 120', complemento: 'Apto 3', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR' }, 'j');
  const f = R.inserir(d, 'fichas', { inquilino_nome: 'Maria Souza', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física', inquilino_telefone: '(41) 99999-0000',
    imoveis_ids: [i.id], situacao: 'Em análise', aluguel_inicial: 250000, garantia_tipo: 'Fiador', fiador1_nome: 'Ana Lima', reserva_valor: 100000, reserva_data: '2026-11-12' }, 'j');
  return { d, f };
}

test('formulário do interessado: dados da pessoa, renda, cônjuge e moradores; sem solidário, tipo nem CEP', () => {
  const { f } = base();
  const form = FO.formularioDaFicha(f, 'interessado');
  const nomes = form.filter((c) => c.nome).map((c) => c.nome);
  assert.equal(nomes[0], 'inquilino_nome', 'o nome primeiro');
  for (const k of ['inquilino_cpf', 'inquilino_estado_civil', 'renda_tipo', 'renda_mensal', 'conjuge_nome', 'moradores']) assert.ok(nomes.includes(k), k);
  assert.ok(!nomes.some((k) => /^(solidario_|inquilino_tipo|responsavel_|representante_)|cep_busca/.test(k)));
  assert.deepEqual(form.filter((c) => c.obrig).map((c) => c.nome), ['inquilino_nome', 'inquilino_cpf']);
  // o servidor aceita o formulário como o sistema manda
  assert.doesNotThrow(() => formularioValido(form));
  // empresa: dados da empresa e do representante; sem o tipo de renda de pessoa física
  const pj = FO.formularioDaFicha({ ...f, inquilino_tipo: 'Pessoa jurídica (empresa)' }, 'interessado');
  assert.equal(pj[0].secao, 'Dados da empresa');
  assert.ok(pj.some((c) => c.nome === 'representante_nome'));
  assert.ok(!pj.some((c) => c.nome === 'renda_tipo'));
  assert.equal(pj.find((c) => c.nome === 'renda_mensal').rotulo, 'Faturamento mensal médio');
});

test('formulário do fiador, valores já sabidos e contexto do link', () => {
  const { d, f } = base();
  assert.deepEqual(FO.pessoasDaFicha(f), ['interessado', 'fiador1']);
  const form = FO.formularioDaFicha(f, 'fiador1');
  assert.ok(form.every((c) => !c.nome || c.nome.startsWith('fiador1_')));
  assert.ok(form.some((c) => c.nome === 'fiador1_nome_conjuge' && c.mostrarSe.campo === 'fiador1_estado_civil'));
  assert.deepEqual(FO.valoresDaFicha(f, form), { fiador1_nome: 'Ana Lima' });
  const pedido = FO.pedidoDoLink(d, f, 'interessado', 'Maria Souza (ficha 14-11-2026)');
  assert.equal(pedido.pasta, 'arquivos/Fichas em analise/Maria Souza (ficha 14-11-2026)');
  assert.equal(pedido.contexto.reserva, 'R$ 1.000,00');
  assert.match(pedido.contexto.imovel, /Rua das Flores, 120, Apto 3, Centro, Curitiba\/PR/);
  assert.ok(pedido.contexto.listas.renda['Empregado (CLT)'].includes('3 últimos holerites'));
  assert.deepEqual(valoresValidos(formularioValido(pedido.formulario), pedido.valores), pedido.valores, 'os valores passam na conferência do servidor');
  const fia = FO.contextoDaFicha(d, f, 'fiador1');
  assert.equal(fia.de, 'Maria Souza');
  assert.equal(fia.reserva, '', 'o fiador não vê a reserva');
  assert.deepEqual(fia.proposta, []);
  assert.equal(FO.telefoneWhatsapp(f, 'interessado'), '5541999990000');
  assert.match(FO.textoWhatsapp(f, 'interessado', { url: 'https://ficha.ankjck.com.br/#x', vence_em: '2026-11-21T10:00:00.000Z' }), /^Olá, Maria! Segue o link da sua ficha cadastral, que vale até 21\/11\/2026: https:\/\/ficha/);
});

test('trazer para a ficha: só os valores preenchidos, e as marcas dos documentos que chegaram', () => {
  const { f } = base();
  const l = {
    pessoa: 'interessado',
    formulario: [{ nome: 'inquilino_profissao', tipo: 'texto' }, { nome: 'renda_mensal', tipo: 'dinheiro' }, { nome: 'inquilino_rg', tipo: 'texto' }],
    respostas: [{ em: '2026-11-14T10:00:00Z', valores: { inquilino_profissao: 'Gerente', renda_mensal: 1500000, inquilino_rg: null, fora: 'x' } }],
    arquivos: [{ documento: '3 últimos holerites' }, { documento: 'Comprovante de residência atual (conta de água, energia ou telefone)' }, { documento: 'Ficha cadastral assinada' }],
  };
  assert.deepEqual(FO.dadosParaFicha(f, l), { inquilino_profissao: 'Gerente', renda_mensal: 1500000, doc_renda: true, doc_residencia: true, doc_ficha: true });
  // lembrete com o que falta
  const t = FO.textoWhatsapp(f, 'interessado', { url: 'https://ficha.ankjck.com.br/#x', vence_em: '2026-11-21T10:00:00Z' }, { lembrete: true, faltando: ['Comprovante de residência'] });
  assert.match(t, /^Olá, Maria! Passando para lembrar da sua ficha cadastral\. Falta: Comprovante de residência\. O link vale até 21\/11\/2026/);
  assert.match(t, /a reserva é devolvida por inteiro/);
});
