// Telas da notificação ao inquilino (2026-11-17) no navegador de mentira (tests/tela-falsa.mjs): caixa na página do inquilino,
// nova notificação com o texto pronto, salvar, página com as etapas, PDF, lista e a janela do "Gerar multa". Dados fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bancoComUsuarios, elemento, entrarComo, janelas, ouvintes } from './tela-falsa.mjs';
import { carregarSite } from './tela-falsa.mjs';

const T = await carregarSite();
const { E, R, C } = T;

async function enviar(nome, campos = [], dataset = {}) {
  const botao = elemento('button');
  const form = elemento('form', { dataset: { form: nome, ...dataset }, campos, querySelector: () => botao });
  await ouvintes.submit[0]({ target: { closest: () => form }, preventDefault() {} });
}

const S = await import('../docs/js/armazenamento.js');

async function base() {
  const d = bancoComUsuarios(R, E);
  const ank = R.inserir(d, 'emitentes', { nome: 'ANK ADMINISTRADORA', razao_social: 'ANK ADMINISTRADORA DE BENS LTDA', cnpj: '11.222.333/0001-81', municipio: 'CURITIBA', ativo: true }, 'teste');
  const i = R.inserir(d, 'imoveis', { tipo: 'normal', nome: 'Flores 3', endereco: 'Rua das Flores, 120', cidade: 'Curitiba', uf: 'PR' }, 'teste');
  R.inserir(d, 'participacoes', { imovel_id: i.id, emitente_id: ank.id, percentual: 100 }, 'teste');
  const c = R.inserir(d, 'contratos', { imovel_id: i.id, inquilino_nome: 'Pão & Cia', inquilino_cpf: '529.982.247-25', inquilino_email: 'contato@exemplo.com.br',
    data_entrada: '2026-06-01', vigencia_inicio: '2026-06-01', aluguel_inicial: 200000, bonificacao: false, dia_vencimento: 10, cobranca_mes_seguinte: true, finalidade: 'Residencial' }, 'teste');
  R.gerarCobrancas(d, C.competenciaDe(C.hojeIso()), 'teste'); // vence no mês que vem: sempre o próximo a cobrar
  entrarComo(E, 'admin');
  await S.gravarBanco(E.pasta, d); // o arquivo dos dados na pasta temporária (a gravação da tela relê dele)
  return { d, c };
}

const rota = (partes, q = {}) => ({ partes, q });

test('nova notificação: texto pronto com a data limite, salvar o rascunho, página com as etapas e o PDF', async () => {
  const { c } = await base();
  const contrato = await T.TELAS.contrato(rota(['contrato', String(c.id)]));
  assert.match(contrato, /id="notificacoes"[\s\S]*Notificações ao inquilino[\s\S]*#\/notificacao-nova\?contrato=/);
  const nova = await T.TELAS['notificacao-nova'](rota(['notificacao-nova'], { contrato: String(c.id), tema: 'obra', data: '2026-11-17', prazo: '10' }));
  assert.match(nova, /Data limite: <b>02\/12\/2026<\/b>.*feriado\(s\) 20\/11\/2026/);
  assert.match(nova, /<textarea[^>]*name="texto"[^>]*>Pela presente, a LOCADORA NOTIFICA/);
  assert.match(nova, /Pão &amp; Cia/, 'nome escapado');
  assert.match(nova, /name="clausula_conferida"[^>]*required/, 'conferência da cláusula obrigatória (decisão do dono, 17/11/2026)');
  const t = R.buscar(E.d, 'contratos', c.id) && (await import('../docs/js/notificacoes.js')).textoDoModelo(E.d, c, { data: '2026-11-17', prazo_dias: 10 }, 'obra');
  const antes = (E.d.notificacoes || []).length;
  await enviar('salvarNotificacao', [['contrato', String(c.id)], ['tema', 'obra'], ['data', '2026-11-17'], ['prazo', '10'], ['assunto', t.assunto],
    ['clausula', t.clausula], ['texto', t.texto.replace(/[preencher: [^]]*]/g, 'furo na fachada')]]);
  assert.equal((E.d.notificacoes || []).length, antes, 'sem marcar a conferência da cláusula não salva');
  await enviar('salvarNotificacao', [['contrato', String(c.id)], ['tema', 'obra'], ['data', '2026-11-17'], ['prazo', '10'], ['assunto', t.assunto], ['clausula', t.clausula], ['clausula_conferida', '1'],
    ['texto', t.texto.replace(/\[preencher: [^\]]*\]/g, 'furo na fachada')]]);
  const n = E.d.notificacoes.at(-1);
  assert.ok(n, 'gravou');
  assert.equal(n.data_limite, '2026-12-02');
  assert.equal(location.hash, `#/notificacao/${n.id}`);
  const pagina = await T.TELAS.notificacao(rota(['notificacao', String(n.id)]));
  assert.match(pagina, new RegExp(`#/imprimir/recibo\\?tipo=notificacao&contrato=${c.id}&id=${n.id}`));
  assert.match(pagina, /Marcar como enviada/);
  assert.match(pagina, /data-acao="abrirEmail"[^>]*data-chave="notificacao_envio"[^>]*data-notificacao="\d+"/);
  assert.match(pagina, /anexar a assinada|Anexar a notificação assinada/);
  const pdf = await T.TELAS.imprimir(rota(['imprimir', 'recibo'], { tipo: 'notificacao', contrato: String(c.id), id: String(n.id) }));
  assert.match(pdf, /NOTIFICAÇÃO EXTRAJUDICIAL[\s\S]*Data limite[\s\S]*02\/12\/2026/);
  assert.match(await T.TELAS.notificacoes(rota(['notificacoes'])), /Pão &amp; Cia[\s\S]*Rascunho/);
  location.hash = '#/';
});

test('prazo vencido: página em vermelho com "Gerar multa" (sugere 1 aluguel) e a janela mostra o valor, o boleto e o mês; Cancelar não grava', async () => {
  const { c } = await base();
  const NT = await import('../docs/js/notificacoes.js');
  const n = await T.alterar((db) => {
    const t = NT.textoDoModelo(db, c, { data: '2026-10-01', prazo_dias: 10 }, 'barulho');
    const x = R.criarNotificacao(db, { contrato_id: c.id, data: '2026-10-01', prazo_dias: 10, assunto: t.assunto, texto: t.texto.replace(/\[preencher: [^\]]*\]/g, 'festas depois das 22h') }, 'teste');
    R.marcarNotificacaoEnviada(db, x.id, { data: '2026-10-01', meio: 'E-mail' }, 'teste');
    return x;
  });
  const pagina = await T.TELAS.notificacao(rota(['notificacao', String(n.id)]));
  assert.match(pagina, /alerta perigo[\s\S]*Prazo vencido em 16\/10\/2026/, '01/10 + 10 dias úteis, com o feriado de 12/10');
  assert.match(pagina, /data-form="multaNotificacao"[\s\S]*value="2\.000,00"/);
  assert.match(pagina, /Nova notificação sobre o mesmo assunto \(2ª\)/);
  const cb = R.boletoDaMulta(E.d, c.id, C.hojeIso());
  const antes = janelas.length;
  const fim = enviar('multaNotificacao', [['valor', '1.500,00']], { id: String(n.id) });
  for (let i = 0; i < 50 && janelas.length === antes; i += 1) await new Promise((ok) => { setTimeout(ok, 5); });
  const j = janelas.at(-1);
  assert.match(j.innerHTML, /Multa de <b>R\$ 1\.500,00<\/b>/);
  assert.match(j.innerHTML, new RegExp(`boleto do aluguel de <b>${C.compBr(cb.competencia).replace('/', '\\/')}</b>`));
  assert.match(j.innerHTML, /passa de R\$ 2\.000,00 para <b>R\$ 3\.500,00<\/b>/);
  assert.match(j.innerHTML, /não entra na NF/);
  j.close();
  await fim;
  assert.equal(R.buscar(E.d, 'notificacoes', n.id).multa_valor, null, 'Cancelar não gera a multa');
  janelas.splice(0).forEach((x) => x.remove());
});
