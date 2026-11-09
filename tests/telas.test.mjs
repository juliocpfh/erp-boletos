// Telas, formulários e botões rodando no Node com um navegador de mentira (tests/tela-falsa.mjs): o caminho do clique
// até a gravação, sem desenhar nada. Dados de teste fictícios.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { esc } from '../docs/js/formularios.js';
import { bancoComUsuarios, carregarSite, elemento, entrarComo, janelas, ouvintes } from './tela-falsa.mjs';

const T = await carregarSite();
const { E, R } = T;

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
