// Telas, formulários e botões rodando no Node com um navegador de mentira (tests/tela-falsa.mjs): o caminho do clique
// até a gravação, sem desenhar nada. Dados de teste fictícios.
import assert from 'node:assert/strict';
import test from 'node:test';
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
