// Kit de teste: ficha pela internet com o que o sistema já tem (pedido do dono, 25/11/2026). Só na nuvem (o link é dela).
// A equipe gera o link de Igor; a página /ficha mostra "Já temos" com a profissão da ficha antiga dele e nada dos outros
// cadastros com o mesmo CPF de teste; o rascunho volta ao recarregar; depois de mandar fica "Em análise" sem editar e o
// rascunho sai do navegador; a equipe vê o que mudou e devolve; a pessoa reabre com tudo preenchido. Grava: fica no fim.

/** Espera o texto na página do link (até 20 s); senão falha dizendo qual texto. */
async function esperar(p, texto) {
  const fim = Date.now() + 20000;
  while (!(await p.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').includes(texto)) {
    if (Date.now() > fim) throw Object.assign(new Error(`não apareceu em 20 s na página do link`), { esperado: `"${texto}"` });
    await p.waitForTimeout(200);
  }
}

const rascunhos =(p) => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ficha-rascunho-')).length);

/** Responde "sim" à janela do sistema, se abrir (confirmação do botão). */
async function confirmarJanela(t) {
  const dlg = t.pagina.locator('dialog[open]').last();
  try { await dlg.waitFor({ timeout: 5000 }); } catch { return; }
  await dlg.locator('button[value="sim"]').click();
}

export default [
  {
    nome: 'Ficha pela internet: já temos, em análise, devolvida (Igor)', rota: (k) => `#/ficha/${k.ids.ficha}`, lugares: ['nuvem'], limite: 120000,
    async acoes(t) {
      // 1. a equipe gera o link e copia o endereço da janela
      await t.pagina.locator('button[data-acao="gerarLinkFicha"][data-pessoa="interessado"]').click();
      const caixa = t.pagina.locator('dialog[open] textarea[data-texto-link]');
      await caixa.waitFor({ timeout: 20000 });
      const url = ((await caixa.inputValue()).match(/https?:[^\s]+#[A-Za-z0-9_-]+/) || [])[0];
      t.conferir(!!url, 'o endereço do link na janela', await caixa.inputValue());
      await t.pagina.locator('dialog[open] button[value="sim"]').click();
      // 2. a pessoa abre o link: o campo vem com o que já temos, e nada de outra pessoa
      const p = await t.pagina.context().newPage();
      try {
        p.setDefaultTimeout(20000);
        await p.goto(url);
        await esperar(p, 'Já temos: Analista de testes');
        const prof = p.locator('[name="inquilino_profissao"]');
        t.conferir((await prof.inputValue()) === 'Analista de testes', 'profissão preenchida com "Analista de testes"', await prof.inputValue());
        const texto = await p.locator('body').innerText();
        for (const x of ['inquilino@exemplo.com.br', 'fiador@exemplo.com.br', '(41) 99999-0000', 'Carlos Fiador']) t.conferir(!texto.includes(x), `sem "${x}" (outra pessoa com o mesmo CPF)`, 'apareceu na página');
        // 3. rascunho: o que digitou volta ao recarregar
        await prof.fill('Engenheira de testes');
        await p.waitForTimeout(900);
        t.conferir((await rascunhos(p)) === 1, 'rascunho guardado no navegador', `${await rascunhos(p)} rascunho(s)`);
        await p.reload();
        await esperar(p, 'Recuperamos o que você tinha digitado');
        t.conferir((await p.locator('[name="inquilino_profissao"]').inputValue()) === 'Engenheira de testes', 'o rascunho de volta no campo', await p.locator('[name="inquilino_profissao"]').inputValue());
        // 4. manda: em análise, sem editar, e o rascunho sai
        await p.locator('#declaracao').check();
        await p.locator('#enviar').click();
        await esperar(p, 'Em análise pela nossa equipe');
        t.conferir(await p.locator('[name="inquilino_profissao"]').isDisabled(), 'campo travado depois de mandar', 'o campo continuava editável');
        t.conferir((await rascunhos(p)) === 0, 'rascunho apagado ao mandar', `${await rascunhos(p)} rascunho(s)`);
        await p.reload();
        await esperar(p, 'Em análise pela nossa equipe');
        t.conferir((await p.locator('#enviar').count()) === 0, 'sem o botão "Enviar meus dados" depois de recarregar', 'o botão voltou');
        // 5. a equipe vê o que mudou do que já tínhamos e devolve (a lista dos links fica guardada 1 min e meio: esquece antes; t.app não roda na nuvem, a CSP barra o eval)
        await t.pagina.evaluate(async () => (await import('/js/ficha-online.js')).esquecerLinks());
        await t.abrir(`#/ficha/${t.ids.ficha}`);
        await t.esperarTexto('Mudou do que já tínhamos: Profissão (tínhamos Analista de testes)', 20000);
        await t.pagina.locator('button[data-acao="liberarCorrecaoFicha"][data-pessoa="interessado"]').click();
        await confirmarJanela(t);
        await t.esperarTexto('a ficha voltou para a pessoa conferir', 20000);
        // 6. a pessoa reabre: devolvida, com tudo preenchido e editável
        await p.reload();
        await esperar(p, 'Devolvemos a sua ficha');
        const campo = p.locator('[name="inquilino_profissao"]');
        t.conferir((await campo.inputValue()) === 'Engenheira de testes' && !(await campo.isDisabled()), 'devolvida com "Engenheira de testes" e editável', `${await campo.inputValue()} (travado: ${await campo.isDisabled()})`);
        t.conferir((await p.locator('#enviar').count()) === 1, 'o botão "Enviar meus dados" de volta', 'sem o botão');
      } catch (e) {
        // o que a página da pessoa mostrava (a captura do kit é da aba do sistema)
        const tela = await p.locator('body').innerText().catch(() => '');
        throw Object.assign(new Error(`${e.message.split('\n')[0]}; a página do link mostra: ${tela.replace(/\s+/g, ' ').slice(0, 300)}`), { esperado: e.esperado });
      } finally {
        await p.close().catch(() => {});
      }
      await t.abrir(`#/ficha/${t.ids.ficha}`);
    },
    espera: ['Ficha: Igor Ficha Teste'],
  },
];
