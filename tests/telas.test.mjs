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
    // (a pergunta é a janela do sistema, não a caixa do navegador: Cancelar = fechar a janela)
    const antes = janelas.length;
    const enviando = enviar('aplicarReajusteManual', [['percentual', '4,5']], { contrato: '1', comp: '2026-11', atual: '150000', pctIndice: '' });
    for (let i = 0; i < 50 && janelas.length === antes; i += 1) await new Promise((ok) => { setTimeout(ok, 5); });
    assert.equal(janelas.length, antes + 1, 'a pergunta abriu na janela do sistema');
    assert.match(janelas.at(-1).innerHTML, /Aplicar correção/);
    janelas.at(-1).close();
    const botao = await enviando;
    assert.equal(botao.disabled, false);
  } finally {
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

test('calendário no celular: lista por semana (domingo a sábado, dentro do mês), aberta na semana de hoje, com o texto de cada item', async () => {
  const { listaDasSemanas } = await import('../docs/js/telas/consultas.js');
  const porDia = new Map([['2026-11-10', [{ texto: 'Boleto <Loja 1>' }]], ['2026-11-17', [{ texto: 'IPTU Casa 2' }, { texto: 'Seguro Casa 2' }]]]);
  const item = (e) => `<div>${esc(e.texto)}</div>`;
  const html = listaDasSemanas('2026-11', '2026-11-17', porDia, item);
  const semanas = html.split('<details').slice(1);
  assert.equal(semanas.length, 5, 'novembro/2026: 01–07, 08–14, 15–21, 22–28, 29–30');
  assert.match(semanas[0], /Semana de 01\/11 a 07\/11[\s\S]*nada[\s\S]*Nada nesta semana/);
  assert.match(semanas[1], /1 item[\s\S]*ter, 10\/11[\s\S]*Boleto &lt;Loja 1&gt;/);
  assert.match(semanas[2], /^ class="cal-semana" open>[\s\S]*esta semana[\s\S]*2 itens[\s\S]*ter, 17\/11 · hoje/);
  assert.equal((html.match(/ open>/g) || []).length, 1, 'só uma semana aberta');
  assert.match(semanas[4], /Semana de 29\/11 a 30\/11/);
  // outro mês: abre a primeira semana com algo
  assert.match(listaDasSemanas('2026-11', '2026-12-05', porDia, item).split('<details')[2], /^ class="cal-semana" open>/);
});

test('nenhuma pergunta usa a caixa do navegador ("localhost diz…"): confirm, alert e prompt passam pela janela do sistema', () => {
  const pasta = fileURLToPath(new URL('../docs/js/', import.meta.url));
  for (const arq of fs.readdirSync(pasta, { recursive: true }).filter((x) => x.endsWith('.js') && !x.startsWith('offline') && !x.startsWith('vendor'))) {
    const texto = fs.readFileSync(path.join(pasta, arq), 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
    assert.doesNotMatch(texto, /(?<![\w.$])(window\.)?(confirm|alert|prompt)\(/, `${arq}: use confirmar()/janela() de app.js`);
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

test('mutirão 3000 (telas): pagamento depois de hoje é recusado; contrato novo pelo imóvel sem gás nem condomínio começa com "Não tem"', async () => {
  const { pagamentoNaoFuturo } = await import('../docs/js/telas/envios.js');
  const { contasDoImovel } = await import('../docs/js/telas/cadastros.js');
  assert.throws(() => pagamentoNaoFuturo('2999-12-31'), (e) => e instanceof T.C.ErroUsuario && /depois de hoje/.test(e.message));
  assert.throws(() => pagamentoNaoFuturo('2026-01-10', '2999-01-01'), /depois de hoje/);
  assert.doesNotThrow(() => pagamentoNaoFuturo('2026-01-10'));
  assert.deepEqual(contasDoImovel({ nome: 'Loja 1' }), { conta_gas: 'Não tem', conta_condominio: 'Não tem' });
  assert.deepEqual(contasDoImovel({ nome: 'Apto 2', gas_relogio: '123', administradora_nome: 'Administradora Exemplo' }), {});
});

test('exclusão grande (decisão do dono, 2026-11-16): contrato mostra o nome e o que sai e Cancelar não apaga; imóvel com inquilino é recusado antes de perguntar', async () => {
  const { c, loja } = comInquilino('Fulano de Teste');
  entrarComo(E, 'admin');
  const { oQueSaiNaExclusao } = await import('../docs/js/telas/acoes.js');
  const r = oQueSaiNaExclusao(E.d, 'contratos', c);
  assert.ok(r.itens.includes('2 boletos'), r.itens.join(' | '));
  const antes = janelas.length;
  await assert.rejects(T.ACOES.excluir({ tabela: 'imoveis', id: loja.id }), /tem inquilinos/);
  assert.equal(janelas.length, antes, 'imóvel com inquilino: nenhuma janela aberta');
  const fim = T.ACOES.excluir({ tabela: 'contratos', id: c.id });
  await new Promise((ok) => { setTimeout(ok, 5); });
  const j = janelas.at(-1);
  assert.match(j.innerHTML, /Fulano de Teste/);
  assert.match(j.innerHTML, /2 boletos/);
  j.close();
  await fim;
  assert.ok(R.buscar(E.d, 'contratos', c.id), 'cancelou: o contrato continua');
});

test('telas: erro esperado de quem usa é C.ErroUsuario (aparece na tela, não vai ao console); Error só nos erros de programa ou de fora', () => {
  // cada `throw new Error(` que fica nas telas tem um motivo; o resto (campo faltando, permissão, registro excluído…) é ErroUsuario
  const PERMITIDOS = [
    'Modelo da NF não encontrado.', 'Documento não encontrado.', 'E.seguroErro', 'Empresa ou mês inválido.', 'Alternativa: "Cancelar no banco"',
    'Este boleto não é fictício.', 'Não consegui gerar o comprovante pelo banco agora', 'Os pagamentos ficaram como rascunho, mas o banco não respondeu',
    'Clique em "Atualizar situação" para ver o que o banco tem', 'Não tive resposta do banco.', "'Modelo não encontrado.'", 'Formulário sem a tela de destino',
    'A nuvem recusou (erro', "'Backup desconhecido.'",
  ];
  const pasta = fileURLToPath(new URL('../docs/js/telas/', import.meta.url));
  const sobra = [];
  for (const arq of fs.readdirSync(pasta).filter((x) => x.endsWith('.js'))) {
    for (const linha of fs.readFileSync(path.join(pasta, arq), 'utf8').split('\n')) {
      if (linha.includes('throw new Error(') && !PERMITIDOS.some((p) => linha.includes(p))) sobra.push(`${arq}: ${linha.trim().slice(0, 120)}`);
    }
  }
  assert.deepEqual(sobra, [], 'use throw new C.ErroUsuario(...) com o que a pessoa deve fazer; se for erro de programa, ponha o trecho em PERMITIDOS');
});

test('ressarcimento para o boleto de um mês em acordo é recusado na tela (o boleto em acordo não muda)', async () => {
  const { c, cb } = comInquilino('Maria Exemplo');
  entrarComo(E, 'admin');
  R.buscar(E.d, 'cobrancas', cb.id).situacao = 'Em acordo'; // 07/2026 entrou num acordo
  const rota = { partes: ['novo', 'ressarcimentos'], q: { contrato: String(c.id) } };
  const campos = (mes) => ({ campos: [['competencia_condominio', '2026-06'], ['descricao', 'Fundo de obras'], ['valor', '150,00'], ['data_pagamento', '2026-06-05'], ['competencia_abatimento', mes]] });
  const r = await T.FORMULARIOS.cadastro(campos('2026-07'), rota);
  assert.match(r.erros.competencia_abatimento, /07\/2026 está em acordo/);
  assert.equal(E.d.ressarcimentos.length, 0, 'nada foi gravado');
  // outro mês, em aberto, passa
  const { CADASTROS } = await import('../docs/js/telas/cadastros.js');
  const erros = {};
  CADASTROS.ressarcimentos.ajustar({ valor: 15000, data_pagamento: '2026-06-05', competencia_abatimento: '2026-06' }, erros, null, null, rota.q);
  assert.deepEqual(erros, {}, 'o boleto de 06/2026 recebe');
});

test('na nuvem, o login com senha manda por trás o verificador do programa do PC (uma vez por senha em cada navegador)', async () => {
  const antes = E.nuvem;
  E.nuvem = {}; // só para mandarVerificadorDoAparelho saber que está na nuvem
  pedidos.length = 0;
  internet.responder = () => new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
  try {
    assert.equal(await T.mandarVerificadorDoAparelho('dono@exemplo.com.br', 'senha do dono 2026', 'a'.repeat(64)), true);
    assert.deepEqual(pedidos, ['api/dados/verificador-aparelho']);
    assert.equal(await T.mandarVerificadorDoAparelho('dono@exemplo.com.br', 'senha do dono 2026', 'a'.repeat(64)), false, 'mesma senha: não manda de novo');
    assert.equal(await T.mandarVerificadorDoAparelho('dono@exemplo.com.br', 'senha nova do dono', 'b'.repeat(64)), true, 'senha trocada: manda');
    E.nuvem = null;
    assert.equal(await T.mandarVerificadorDoAparelho('dono@exemplo.com.br', 'x', 'c'.repeat(64)), false, 'fora da nuvem: nada');
    assert.equal(pedidos.length, 2);
  } finally {
    E.nuvem = antes;
    internet.responder = () => { throw new TypeError('sem internet'); };
  }
});

test('telas raras carregadas só quando usadas (2ª rodada do mutirão de 16/11): fora da abertura, com as ações e formulários pelo nome', async () => {
  // a abertura (import estático a partir de app.js) não chega às partes adiadas
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'js');
  const vistos = new Set();
  const andar = (arq) => {
    if (vistos.has(arq)) return;
    vistos.add(arq);
    for (const [, rel] of fs.readFileSync(arq, 'utf8').matchAll(/\b(?:from|import)\s*['"](\.{1,2}\/[^'"]+\.js)['"]/g)) andar(path.resolve(path.dirname(arq), rel));
  };
  andar(path.join(raiz, 'app.js'));
  const sw = fs.readFileSync(path.join(raiz, '..', 'sw.js'), 'utf8');
  const arquivos = { pessoa: 'telas/pessoa.js', regras: 'telas/regras-sistema.js', regua: 'telas/regua.js', nuvem: 'telas/nuvem.js' };
  assert.deepEqual(Object.keys(COMUM.PARTES_ADIADAS).sort(), Object.keys(arquivos).sort());
  for (const [qual, arq] of Object.entries(arquivos)) {
    assert.equal(vistos.has(path.join(raiz, arq)), false, `${arq} fica fora da abertura`);
    assert.ok(sw.includes(`'js/${arq}'`), `${arq} está em ADIADOS do sw.js (sem internet)`);
    const m = await COMUM.parteAdiada(qual);
    const p = COMUM.PARTES_ADIADAS[qual];
    for (const [tipo, todos] of [['acoes', T.ACOES], ['formularios', T.FORMULARIOS]]) {
      if (!p[tipo]) continue;
      const [objeto, nomes] = p[tipo];
      assert.deepEqual([...nomes].sort(), Object.keys(m[objeto]).sort(), `${objeto}: a lista de PARTES_ADIADAS é a mesma da parte`);
      for (const n of nomes) assert.equal(typeof todos[n], 'function', `${n} chega pelo nome`);
    }
  }
  assert.equal(vistos.has(path.join(raiz, 'pessoa.js')), false, 'pessoa.js (LGPD) também');
  // o clique passa para a função de verdade (carrega a parte na hora)
  const parte = await COMUM.parteAdiada('regras');
  const antes = parte.ACOES_REGRAS.baixarArquivoRegras;
  let chamou = null;
  parte.ACOES_REGRAS.baixarArquivoRegras = (dados) => { chamou = dados; };
  try {
    await T.ACOES.baixarArquivoRegras({ x: '1' });
    assert.deepEqual(chamou, { x: '1' });
  } finally { parte.ACOES_REGRAS.baixarArquivoRegras = antes; }
});

test('mutirão 19/11 (lote K): exclusão do contrato barrada com boleto emitido no C6, boleto ligado ao extrato ou troca de titular; ficha com reserva não devolvida', async () => {
  const { d, c, cb, loja } = comInquilino('Fulano de Teste');
  entrarComo(E, 'admin');
  const { motivoNaoExcluirContrato, origemDaImpressao, descricaoDaExclusao } = await import('../docs/js/telas/acoes.js');
  assert.equal(motivoNaoExcluirContrato(d, c), null);
  cb.banco = { situacao: 'emitido' };
  assert.match(motivoNaoExcluirContrato(d, c), /emitido no C6/);
  cb.banco = null;
  d.movimentacoes_banco.push({ id: 900, conta_id: 1, data: '2026-11-10', tipo: 'entrada', valor: 180000, classificacao: 'boleto', cobranca_id: cb.id });
  assert.match(motivoNaoExcluirContrato(d, c), /desfaça o destino das movimentações/);
  d.movimentacoes_banco.length = 0;
  R.inserir(d, 'contratos', { imovel_id: loja.id, inquilino_nome: 'Beltrano Novo', contrato_anterior_id: c.id, data_entrada: '2026-08-01' }, 'teste');
  assert.match(motivoNaoExcluirContrato(d, c), /continua com Beltrano Novo/);
  // ficha com reserva de R$ 1.000,00 recebida e não devolvida: a exclusão é recusada antes de qualquer pergunta
  const f = R.inserir(E.d, 'fichas', { inquilino_nome: 'Ciclano Ficha', situacao: 'Reprovada', reserva_valor: 100000, reserva_data: '2026-11-05' }, 'teste');
  const antes = janelas.length;
  await assert.rejects(T.ACOES.excluir({ tabela: 'fichas', id: f.id }), /reserva de R\$\s1\.000,00 recebida e não devolvida/);
  assert.equal(janelas.length, antes);
  // "Voltar" da impressão aberta em aba nova e o texto do Histórico na exclusão
  assert.equal(origemDaImpressao('#/imprimir/faturas?mes=2026-01'), '#/faturas?mes=2026-01');
  assert.equal(origemDaImpressao('#/imprimir/demonstrativos?comp=2026-07&ids=1,2'), '#/cobrancas?comp=2026-07');
  assert.equal(origemDaImpressao('#/imprimir/recibo?tipo=garantia&contrato=7'), '#/contrato/7');
  assert.equal(descricaoDaExclusao(d, 'cobrancas', cb), 'Boleto de 07/2026 · Fulano de Teste');
});
