// Kit de teste: contra-vistoria pendente no contrato anterior (pedido do dono de 27/11/2026: "se o inquilino não apresentou, ela
// continua pendente no contrato herdado" e não havia onde dar baixa: a rotina do anterior sai da página depois da troca). Fábio
// herdou de Elisa, que não mandou contra-vistoria: na página de Fábio aparecem o "Anexar" e o "Não houve", que gravam no contrato
// de Elisa. Marca "Não houve", confere, desfaz e confere que voltou (deixa o banco do kit como estava).
const linha = (t) => t.pagina.locator('#rotina tr', { hasText: 'Contra-vistoria do inquilino' });
const abrirRotina = (t) => t.pagina.evaluate(() => { const r = document.getElementById('rotina'); if (r) r.open = true; });

export default [
  {
    nome: 'Contra-vistoria herdada: "Não houve" na página de quem entrou (Fábio)', rota: (k) => `#/contrato/${k.ids.fabio}`, lugares: ['computador', 'nuvem'], limite: 60000,
    async acoes(t) {
      await abrirRotina(t);
      const antes = await linha(t).innerText();
      t.conferir(antes.includes('pendente no contrato de Elisa Anterior Teste'), 'contra-vistoria pendente no contrato de Elisa', antes.slice(0, 200));
      t.conferir(antes.includes('Fica registrado no contrato de Elisa Anterior Teste'), 'avisa que grava no contrato de Elisa', antes.slice(0, 200));
      t.conferir((await linha(t).locator('form[data-form="contraVistoria"] input[type=file]').count()) === 1, 'dá para anexar o arquivo daqui', 'sem o campo do arquivo');
      await linha(t).locator('[data-acao=pularEtapaEntrada]').click();
      await t.esperarTexto('não houve (marcado em Elisa Anterior Teste)');
      await abrirRotina(t);
      t.conferir((await linha(t).locator('[data-acao=pularEtapaEntrada]').count()) === 0, 'depois do "Não houve", o botão some', 'o botão continua');
      await linha(t).locator('[data-acao=desfazerEtapaEntrada]').click();
      await t.pagina.waitForFunction(() => [...document.querySelectorAll('#rotina tr')].some((tr) => /Contra-vistoria do inquilino/.test(tr.textContent) && /pendente no contrato de Elisa/.test(tr.textContent)), null, { timeout: 15000 });
      await abrirRotina(t);
      t.conferir((await linha(t).innerText()).includes('pendente no contrato de Elisa Anterior Teste'), 'Desfazer volta a pendente', (await linha(t).innerText()).slice(0, 200));
    },
  },
];
