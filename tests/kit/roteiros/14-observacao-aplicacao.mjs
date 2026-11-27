// Kit de teste: garantia com falta aplicar (pedido do dono de 27/11/2026: "permitir colocar observações do porquê não foi
// aplicado, com a data do registro"). Ana tem a caução de R$ 5.400,00 depositada e nada aplicado: na garantia aparece
// "Por que ainda não foi aplicado", anota uma observação (fica com a data de hoje do kit, 25/11/2026), confere e tira
// (deixa o banco do kit como estava).
const caixa = (t) => t.pagina.locator('.notas-aplicacao');

export default [
  {
    nome: 'Aplicação da garantia: anotar e tirar a observação (Ana)', rota: (k) => `#/contrato/${k.ids.ana}?ir=garantia`, lugares: ['computador', 'celular', 'nuvem'], limite: 60000,
    async acoes(t) {
      await t.esperarTexto('Por que ainda não foi aplicado');
      t.conferir((await caixa(t).innerText()).includes('nenhuma observação'), 'começa sem observação', (await caixa(t).innerText()).slice(0, 200));
      await caixa(t).locator('[data-acao=anotarAplicacao]').click();
      const dlg = t.pagina.locator('dialog[open]').last();
      await dlg.locator('[name=texto]').fill('Aguardando o inquilino mandar o comprovante');
      await dlg.locator('button[value="sim"]').click();
      await t.pagina.waitForFunction(() => /Aguardando o inquilino mandar o comprovante/.test((document.querySelector('.notas-aplicacao') || {}).textContent || ''), null, { timeout: 15000 });
      const com = await caixa(t).innerText();
      t.conferir(/\d{2}\/\d{2}\/\d{4} · Aguardando o inquilino mandar o comprovante/.test(com), 'observação com a data do registro', com.slice(0, 200));
      await caixa(t).locator('[data-acao=retirarNotaAplicacao]').click();
      await t.pagina.locator('dialog[open]').last().locator('button[value="sim"]').click();
      await t.pagina.waitForFunction(() => /nenhuma observação/.test((document.querySelector('.notas-aplicacao') || {}).textContent || ''), null, { timeout: 15000 });
      t.conferir(true, 'observação tirada', '');
    },
  },
];
