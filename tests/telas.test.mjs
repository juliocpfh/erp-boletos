// Telas, formulários e botões rodando no Node com um navegador de mentira (tests/tela-falsa.mjs): o caminho do clique
// até a gravação, sem desenhar nada. Dados de teste fictícios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { esc } from '../docs/js/formularios.js';
import { bancoComUsuarios, carregarSite, elemento, entrarComo, internet, janelas, ouvintes, pagina, pedidos, porId } from './tela-falsa.mjs';

const T = await carregarSite();
const { E, R } = T;
const COMUM = await import('../docs/js/telas/comum.js');

/** Envia o formulário falso como o Enter/botão faria (o ouvinte de submit de app.js) e devolve o botão dele. */
async function enviar(nome, campos = [], dataset = {}) {
  const botao = elemento('button');
  const form = elemento('form', { dataset: { form: nome, ...dataset }, campos, querySelector: () => botao });
  await ouvintes.submit[0]({ target: { closest: () => form }, preventDefault() {} });
  return botao;
}

test('envio de formulário: "Cancelar" numa confirmação devolve o botão; trocar de tela deixa apagado até a nova aparecer', async () => {
  bancoComUsuarios(R, E);
  entrarComo(E, 'admin');
  location.hash = '#/reajustes';
  T.FORMULARIOS.__cancelou = async () => {}; // ex.: aplicarReajusteManual com Cancelar no confirm
  T.FORMULARIOS.__trocouDeTela = async () => T.ir('#/painel-teste');
  T.FORMULARIOS.__erro = async () => { throw new T.C.ErroUsuario('Digite o % da correção.'); };
  T.FORMULARIOS.__redesenhou = async () => T.mostrar();
  try {
    assert.equal((await enviar('__cancelou')).disabled, false, 'cancelou: o botão (e o Enter) voltam a funcionar');
    assert.equal((await enviar('__erro')).disabled, false, 'erro: o botão volta');
    assert.equal((await enviar('__trocouDeTela')).disabled, true, 'foi para outra tela: não dá para enviar duas vezes');
    location.hash = '#/reajustes';
    assert.equal((await enviar('__redesenhou')).disabled, true, 'a tela foi desenhada de novo: o botão novo é outro');
    // o caso de verdade: Reajustes, 4,5%, "Aplicar correção" e Cancelar na pergunta para corrigir o %
    globalThis.confirm = () => false;
    const botao = await enviar('aplicarReajusteManual', [['percentual', '4,5']], { contrato: '1', comp: '2026-11', atual: '150000', pctIndice: '' });
    assert.equal(botao.disabled, false);
  } finally {
    globalThis.confirm = () => true;
    for (const k of ['__cancelou', '__trocouDeTela', '__erro', '__redesenhou']) delete T.FORMULARIOS[k];
    janelas.splice(0).forEach((j) => j.remove());
    location.hash = '#/';
  }
});

/** Um inquilino com o nome dado, e boletos de junho e julho/2026 vencidos e em aberto. */
function comInquilino(nome) {
  const d = bancoComUsuarios(R, E);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'teste');
  const loja = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Loja 1', endereco: 'Rua Exemplo, 1', cidade: 'Curitiba' }, 'teste');
  R.inserir(d, 'participacoes', { imovel_id: loja.id, emitente_id: ank.id, percentual: 100 }, 'teste');
  const c = R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: nome, inquilino_cpf: '529.982.247-25', inquilino_email: 'contato@exemplo.com.br',
    data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', aluguel_inicial: 135000, dia_vencimento: 10, cobranca_mes_seguinte: true,
    taxa_boleto: 350, multa_percentual: 10, juros_mensal_percentual: 1 }, 'teste');
  for (const comp of ['2026-06', '2026-07']) R.gerarCobrancas(d, comp, 'teste');
  return { d, c, loja, cb: R.boletoDoMes(d, c.id, '2026-07') };
}

/** Abre a janela pelo botão, devolve o HTML dela e clica em Cancelar/Fechar. */
async function htmlDaJanela(clique) {
  const antes = janelas.length;
  const fim = clique();
  assert.equal(janelas.length, antes + 1, 'abriu a janela');
  const j = janelas.at(-1);
  j.close();
  await fim;
  return j.innerHTML;
}

test('janelas com o nome do inquilino no título: o nome aparece uma vez escapado (Pão & Cia D\'Ávila, não "&amp;amp;")', async () => {
  const nome = "Pão & Cia D'Ávila";
  const { c, cb } = comInquilino(nome);
  entrarComo(E, 'admin');
  const certo = esc(nome); // Pão &amp; Cia D&#39;Ávila
  const titulo = (html) => (html.match(/<h3>(.*?)<\/h3>/) || [])[1];
  assert.equal(titulo(await htmlDaJanela(() => T.ACOES.pagarBoleto({ id: cb.id }))), `Confirmar pagamento · ${certo}`);
  assert.equal(titulo(await htmlDaJanela(() => T.ACOES.fazerAcordo({ contrato: c.id }))), `Acordo · ${certo}`);
  assert.match(titulo(await htmlDaJanela(() => T.ACOES.lembrete({ id: cb.id }))), new RegExp(` · ${certo}$`));
  // nenhuma chamada de janela escapa o título por conta própria (janela já escapa: escapar antes mostra "&amp;" na tela)
  const pasta = fileURLToPath(new URL('../docs/js/', import.meta.url));
  for (const arq of fs.readdirSync(pasta, { recursive: true }).filter((x) => x.endsWith('.js') && !x.startsWith('offline'))) {
    const texto = fs.readFileSync(path.join(pasta, arq), 'utf8');
    for (const m of texto.matchAll(/janela\(\{\s*titulo:\s*(`[^`]*`|'[^']*')/g)) assert.doesNotMatch(m[1], /esc\(/, `${arq}: ${m[1]}`);
  }
});

test('tarefa em segundo plano do Painel: só desenha a tela de novo na mesma página e sem formulário aberto', async () => {
  bancoComUsuarios(R, E);
  entrarComo(E, 'admin');
  const redesenhou = async (comecou, agora, formulario) => {
    location.hash = agora;
    pagina.formulario = formulario;
    porId.app.innerHTML = 'tela de antes';
    await COMUM.redesenharSeLivre(comecou);
    pagina.formulario = false;
    return porId.app.innerHTML !== 'tela de antes';
  };
  try {
    assert.equal(await redesenhou('#/', '#/', false), true, 'continua no Painel: mostra o que mudou');
    assert.equal(await redesenhou('#/', '#/', true), false, 'abriu um formulário: o que ele digita não some');
    assert.equal(await redesenhou('#/', '#/novo/contratos', false), false, 'foi para outra página: não mexe');
  } finally { location.hash = '#/'; }
});

test('operador abre o Painel: contrato sem imóvel há 7 dias fica (excluir contrato é do administrador; a nuvem recusaria)', async () => {
  const d = bancoComUsuarios(R, E);
  const c = R.inserir(d, 'contratos', { imovel_id: null, inquilino_nome: 'Fulano Teste', sem_imovel_desde: '2026-01-05', data_entrada: '2026-01-05' }, 'teste');
  assert.equal(R.contratosSemImovelVencidos(d).length, 1, 'o contrato está vencido para a limpeza');
  entrarComo(E, 'operador');
  porId.mensagens = elemento('div');
  await COMUM.limparSemImovel();
  assert.ok(R.buscar(E.d, 'contratos', c.id), 'o contrato continua');
  assert.doesNotMatch(porId.mensagens.innerHTML, /Apagado/, 'sem o aviso falso de "Apagado(s)…"');
});

test('NF: "Corrigir e numerar de novo" só para o administrador (desfazer a numeração apaga NFs)', async () => {
  const { d, c } = comInquilino('Maria Exemplo');
  R.registrarPagamento(d, R.boletoDoMes(d, c.id, '2026-06').id, '2026-07-10', null, 'teste');
  R.numerarFaturas(d, 'teste');
  assert.ok(R.ultimaFatura(d), 'há NF numerada');
  const rota = { partes: ['faturas'], q: { mes: '2026-07' } };
  entrarComo(E, 'admin');
  assert.match(await T.TELAS.faturas(rota), /Corrigir e numerar de novo/);
  entrarComo(E, 'operador');
  const html = await T.TELAS.faturas(rota);
  assert.doesNotMatch(html, /Corrigir e numerar de novo|desfazerUltimaNumeracao|data-form="desfazerNumeracao"/);
  assert.match(html, /cancelarNumero/, 'o operador continua cancelando uma NF (o número fica cancelado, nada é apagado)');
  await assert.rejects(T.ACOES.desfazerUltimaNumeracao({}), T.C.ErroUsuario);
  await assert.rejects(T.FORMULARIOS.desfazerNumeracao({ campos: [['numero', '1']] }), T.C.ErroUsuario);
  assert.equal(d.faturas.length, E.d.faturas.length);
  assert.ok(E.d.faturas.every((f) => f.situacao === 'Emitida'), 'nenhuma NF desfeita');
});

test('salvar a edição de um registro que outra pessoa excluiu: avisa e não cria um registro novo solto', async () => {
  const { c } = comInquilino('Maria Exemplo');
  entrarComo(E, 'admin');
  const r = R.inserir(E.d, 'ressarcimentos', { contrato_id: c.id, descricao: 'Fundo de obras', valor: 15000, competencia_condominio: '2026-10' }, 'teste');
  const form = { campos: [['descricao', 'Fundo de obras'], ['valor', '150,00'], ['competencia_condominio', '2026-10']] };
  R.excluir(E.d, 'ressarcimentos', r.id, 'outra@exemplo.com.br', 'excluído no outro computador');
  const excluido = { name: 'ErroUsuario', message: 'Este registro foi excluído por outra pessoa; nada foi salvo.' };
  await assert.rejects(T.FORMULARIOS.cadastro(form, { partes: ['editar', 'ressarcimentos', String(r.id)], q: { contrato: String(c.id) } }), excluido);
  assert.equal(E.d.ressarcimentos.length, 0, 'nada foi criado');
  // cadastro que monta os fixos com o contrato do endereço (correção do aluguel): antes dava erro de programa
  await assert.rejects(T.FORMULARIOS.cadastro({ campos: [] }, { partes: ['editar', 'correcoes', '999'], q: { contrato: '999' } }), excluido);
});

test('formulário que só leva a outra tela (data-form="ir"): endereço com os campos preenchidos, saneados', async () => {
  const { enderecoDoFormulario } = await import('../docs/js/telas/envios.js');
  assert.equal(enderecoDoFormulario('cobrancas', [['comp', '2026-11']]), '#/cobrancas?comp=2026-11');
  assert.equal(enderecoDoFormulario('cobrancas', [['comp', '2026-11'], ['ordem', 'vencimento'], ['busca', '  Maria Exemplo ']]), '#/cobrancas?comp=2026-11&ordem=vencimento&busca=Maria+Exemplo');
  assert.equal(enderecoDoFormulario('resultados', [['de', '2026-01-01'], ['ate', '']]), '#/resultados?de=2026-01-01', 'campo vazio fica de fora');
  assert.equal(enderecoDoFormulario('faturas', [['mes', '2026-13"><img src=x>']]), '#/faturas', 'mês fora do formato: a tela usa o padrão');
  assert.equal(enderecoDoFormulario('buscar', [['q', 'Pão & Cia']]), '#/buscar?q=P%C3%A3o+%26+Cia');
  assert.equal(enderecoDoFormulario('buscar', [['q', 'x'.repeat(150)]]), `#/buscar?q=${'x'.repeat(100)}`, 'busca de até 100 letras');
  assert.equal(enderecoDoFormulario('buscar', [['q', '   ']]), '#/buscar');
  assert.equal(enderecoDoFormulario('banco', [['conta', 'ank'], ['mes', '2026-10']]), '#/banco?conta=ank&mes=2026-10');
  assert.throws(() => enderecoDoFormulario('#/fora', []), /destino/);
  // o envio de verdade: Boletos → "Ir" para outubro (os parâmetros chegam à tela pelo mesmo caminho de sempre)
  location.hash = '#/cobrancas?comp=2026-11';
  await enviar('ir', [['comp', '2026-10']], { ir: 'cobrancas' });
  assert.equal(location.hash, '#/cobrancas?comp=2026-10');
  location.hash = '#/';
  // nenhuma tela usa um data-form que não existe (ex.: os antigos irMes, buscaGlobal, filtroHistorico)
  const pasta = fileURLToPath(new URL('../docs/js/', import.meta.url));
  for (const arq of fs.readdirSync(pasta, { recursive: true }).filter((x) => x.endsWith('.js') && !x.startsWith('offline'))) {
    for (const m of fs.readFileSync(path.join(pasta, arq), 'utf8').matchAll(/<form[^>]*data-form="(\w+)"/g)) assert.ok(T.FORMULARIOS[m[1]], `${arq}: data-form="${m[1]}" sem FORMULARIOS.${m[1]}`);
  }
});

test('Reajustes: o acumulado do Banco Central é guardado na sessão por índice e mês; falha ou mês sem índice pergunta de novo', async () => {
  const { acumuladoNoBancoCentral } = await import('../docs/js/telas/campos.js');
  const IGPM = 189;
  // série mensal de nov/2025 a out/2026 (1% ao mês); `faltaOutubro` = o índice do último mês ainda não saiu
  const serie = (faltaOutubro) => Array.from({ length: faltaOutubro ? 11 : 12 }, (_, k) => {
    const m = T.C.somarMeses('2025-11', k);
    return { data: `01/${m.slice(5, 7)}/${m.slice(0, 4)}`, valor: '1.00' };
  });
  let resposta = () => { throw new TypeError('sem internet'); };
  internet.responder = (url) => resposta(url);
  const pedidosAntes = pedidos.length;
  const perguntas = () => pedidos.length - pedidosAntes;
  try {
    await assert.rejects(acumuladoNoBancoCentral(IGPM, '2026-10'), TypeError);
    resposta = () => new Response(JSON.stringify(serie(true)));
    assert.deepEqual(await acumuladoNoBancoCentral(IGPM, '2026-10'), { falta: ['2026-10'] }, 'sem internet antes: pergunta de novo');
    resposta = () => new Response(JSON.stringify(serie(false)));
    const r = await acumuladoNoBancoCentral(IGPM, '2026-10');
    assert.equal(r.de, '2025-11');
    assert.equal(perguntas(), 3, 'faltava outubro: perguntou de novo');
    assert.deepEqual(await acumuladoNoBancoCentral(IGPM, '2026-10'), r, 'a tela desenhada de novo usa o que já veio');
    assert.equal(perguntas(), 3);
    await acumuladoNoBancoCentral(433, '2026-10'); // outro índice (IPCA): pergunta
    assert.equal(perguntas(), 4);
  } finally {
    internet.responder = () => { throw new TypeError('sem internet'); };
  }
});
