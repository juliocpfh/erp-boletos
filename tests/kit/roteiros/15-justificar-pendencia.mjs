// Kit de teste: justificar uma pendência do cadastro (pedido do dono de 27/11/2026: "um botãozinho ao lado do Completar, de
// justificar a falta ... para dar baixa na pendência", com o porquê e o responsável). Em Pendências, a linha de Ana: Justificar
// "inquilino: estado civil", com motivo e responsável; a pendência sai da linha e vai para "Pendências justificadas" com a
// data; Desfazer a devolve (deixa o banco do kit como estava).
const ITEM = 'inquilino: estado civil';
const linhaAna = (t) => t.pagina.locator('#app main tr', { hasText: 'Ana Caução Teste' }).filter({ has: t.pagina.locator('[data-acao=justificarPendencia]') });

export default [
  {
    nome: 'Pendências: justificar e desfazer (Ana)', rota: '#/pendencias', lugares: ['computador', 'celular', 'nuvem'], limite: 60000,
    async acoes(t) {
      await t.esperarTexto('Cadastros incompletos');
      t.conferir((await linhaAna(t).innerText()).includes(ITEM), 'Ana com a pendência do estado civil', (await linhaAna(t).innerText()).slice(0, 200));
      await linhaAna(t).locator('[data-acao=justificarPendencia]').click();
      const dlg = t.pagina.locator('dialog[open]').last();
      await dlg.locator(`input[name=item][value="${ITEM}"]`).check();
      await dlg.locator('[name=texto]').fill('Inquilina não quis informar');
      await dlg.locator('[name=responsavel]').fill('Diretoria Teste');
      await dlg.locator('button[value="sim"]').click();
      await t.pagina.waitForSelector('#justificadas', { timeout: 15000 });
      await t.pagina.evaluate(() => { const x = document.querySelector('#justificadas details'); if (x) x.open = true; });
      const just = await t.pagina.locator('#justificadas').innerText();
      t.conferir(just.includes('Inquilina não quis informar') && just.includes('Diretoria Teste') && /\d{2}\/\d{2}\/\d{4}/.test(just), 'justificada com motivo, responsável e data', just.slice(0, 300));
      t.conferir(!(await linhaAna(t).innerText()).includes(ITEM), 'a pendência saiu da linha de Ana', (await linhaAna(t).innerText()).slice(0, 200));
      await t.pagina.locator('#justificadas [data-acao=desfazerJustificativa]').first().click();
      await t.pagina.locator('dialog[open]').last().locator('button[value="sim"]').click();
      await t.pagina.waitForFunction(() => !document.querySelector('#justificadas'), null, { timeout: 15000 });
      t.conferir((await linhaAna(t).innerText()).includes(ITEM), 'Desfazer devolve a pendência', '');
    },
  },
];
