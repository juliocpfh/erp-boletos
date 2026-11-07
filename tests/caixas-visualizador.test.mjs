// Partes sem DOM de docs/js/caixas.js (nome que identifica cada caixa) e docs/js/visualizador.js (quando abrir o anexo na tela).
// O arrastar das caixas e o desenho do PDF precisam do navegador (document, pdf.js): ficam fora.
import assert from 'node:assert/strict';
import test from 'node:test';

// os dois módulos tocam window/location ao carregar ou ao rodar: um mínimo falso para importar
globalThis.window = globalThis.window || { addEventListener() {}, innerHeight: 800, matchMedia: null };
globalThis.location = globalThis.location || { protocol: 'https:', search: '' };
const { limparTitulo } = await import('../docs/js/caixas.js');
const { usarVisualizador } = await import('../docs/js/visualizador.js');

test('limparTitulo: o mesmo nome em todas as fichas (sem números, datas, R$, parênteses e o que vem depois de " · " ou ": ")', () => {
  assert.equal(limparTitulo('Contrato e valores'), 'Contrato e valores');
  assert.equal(limparTitulo('Boletos de nov/2026 (3 em aberto)'), 'Boletos');
  assert.equal(limparTitulo('Resultados · R$ 3.644,45'), 'Resultados');
  assert.equal(limparTitulo('Garantia: caução de R$ 1.500,00'), 'Garantia');
  assert.equal(limparTitulo('Apto 604 - Maria Exemplo'), 'Apto Maria Exemplo');
  assert.equal(limparTitulo('Inquilinos deste imóvel'), 'Inquilinos deste imóvel');
  assert.equal(limparTitulo('Calendário de 11/2026'), 'Calendário', 'preposição solta no fim sai');
  assert.equal(limparTitulo(''), '');
  assert.equal(limparTitulo(null), '');
  assert.equal(limparTitulo('x'.repeat(100)).length, 60);
});

test('usarVisualizador: celular (tela estreita ou toque) abre na tela; computador e versão PC (file:) abrem/baixam como antes', () => {
  const com = (matches, protocol = 'https:') => {
    globalThis.location.protocol = protocol;
    globalThis.window.matchMedia = () => ({ matches });
    return usarVisualizador();
  };
  assert.equal(com(true), true);
  assert.equal(com(false), false);
  assert.equal(com(true, 'file:'), false, 'a versão PC não tem o pdf.js');
  globalThis.location.protocol = 'https:';
  globalThis.window.matchMedia = undefined;
  assert.equal(usarVisualizador(), false, 'navegador sem matchMedia: não quebra');
});
