// Kit de teste: cálculo final com boleto descontado da caução (janela da PR #424, sem gravar) e ficha com o termo da reserva.

/** Clica no botão de salvar do formulário e responde às janelas até a "Confira o que vai acontecer" (devolve o texto dela). */
async function ateAJanelaDoDesconto(t) {
  // a leitura dos relógios é obrigatória e o índice da poupança vem do Banco Central (o kit corta a internet): digitados aqui
  await t.preencher('#app main [name="leitura_agua"]', '123');
  await t.preencher('#app main [name="leitura_energia"]', '456');
  await t.preencher('#app main [name="indice_percentual"]', '0');
  await t.pagina.locator('#app main form button:not([data-acao]):not([type="button"])').last().click();
  for (let i = 0; i < 5; i += 1) {
    const dlg = t.pagina.locator('dialog[open]').last();
    await dlg.waitFor({ timeout: 10000 });
    const texto = (await dlg.innerText()).replace(/\s+/g, ' ');
    if (/confira o que vai acontecer/i.test(texto)) return { dlg, texto };
    await dlg.locator('button[value="sim"]').click(); // aviso de antes (ex.: boleto do último mês ainda não gerado)
  }
  throw new Error('a janela "Confira o que vai acontecer" não apareceu');
}

export default [
  {
    nome: 'Cálculo final com boleto descontado da caução (Helena)', rota: (k) => `#/novo/encerramentos?contrato=${k.ids.helena}`,
    espera: ['Saída e cálculo final - Helena Cálculo Teste', 'Saída em 25/11/2026'],
    async acoes(t) {
      const { dlg, texto } = await ateAJanelaDoDesconto(t);
      for (const e of ['Aluguel 10/2026', 'R$ 1.800,00', 'CANCELE este boleto no banco', 'R$ 3.600,00']) t.conferir(texto.includes(e), `"${e}" na janela`, texto.slice(0, 220));
      t.conferir(await dlg.locator('button[value="sim"]').isDisabled(), '"Confirmar tudo" desligado antes de marcar "Já cancelei no banco"', 'o botão estava ligado');
      await dlg.locator('[data-nao]').click();
      await t.esperarTexto('Nada foi salvo');
      await t.pagina.locator('dialog[open] button').last().click(); // fecha o aviso "Nada foi salvo"
      const r = await t.pagina.evaluate(() => document.querySelectorAll('dialog[open]').length);
      t.conferir(r === 0, 'a janela fechada depois de "Voltar"', `${r} janela(s) aberta(s)`);
    },
    lugares: ['computador', 'celular', 'nuvem', 'pc'],
  },
  {
    nome: 'Ficha em análise com o termo da reserva (Igor)', rota: (k) => `#/ficha/${k.ids.ficha}`,
    espera: ['Ficha: Igor Ficha Teste', 'Em análise', 'termo aceito em 24/11/2026', 'Reserva de R$ 500,00', 'Aluguel R$ 1.900,00'],
  },
];
