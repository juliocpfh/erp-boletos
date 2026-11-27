// Kit de teste: outro usuário no mesmo computador (pedido do dono de 27/11/2026). Quem entrou antes fechou a tela sem "Sair" e o
// login da internet (Cloudflare Access) continuou no e-mail dele: o novo usuário, com a senha certa, não é mais barrado. O sistema
// pergunta "Trocar de usuário neste computador", guarda só o login (nunca a senha) e encerra o login da internet; de volta, a tela
// de login vem preenchida. Só na nuvem (sem ela não há login da internet). Aqui (localhost) não há Access para encerrar: o kit
// confere a pergunta, o aviso e a tela preenchida, e entra de novo no fim.
export default [
  {
    nome: 'Outro usuário no computador: troca o login da internet em vez de barrar', rota: '#/', lugares: ['nuvem'], limite: 60000,
    async acoes(t) {
      const { LOGIN, SENHA } = t.kit;
      await t.clicar('[data-acao=sair]');
      await t.pagina.locator('form[data-form="login"]').waitFor({ timeout: 15000 });
      // o login da internet ficou com outra pessoa (ela fechou a tela sem "Sair")
      await t.pagina.evaluate(async () => { const A = await import('/js/app.js'); await A.E.saudeNuvem; A.E.emailNuvem = 'quem-saiu@exemplo.com.br'; });
      // senha errada continua sendo recusada (não pergunta nada)
      await t.preencher('#ent_login', LOGIN);
      await t.preencher('#ent_senha', 'senha errada do kit');
      await t.clicar('form[data-form="login"] button:not([data-acao])');
      await t.pagina.locator('dialog[open]').waitFor({ timeout: 20000 });
      const erro = await t.pagina.locator('dialog[open]').innerText();
      t.conferir(erro.includes('Login ou senha incorretos.') && !erro.includes('acesso pela internet'), 'senha errada: só "Login ou senha incorretos", sem a troca', erro.slice(0, 200));
      await t.clicar('dialog[open] button');
      // senha certa: pergunta e troca (antes: "Você entrou na internet como …: use o usuário desse e-mail")
      await t.pagina.waitForTimeout(2500); // espera da 2ª tentativa (contagem de senhas erradas)
      await t.preencher('#ent_senha', SENHA);
      await t.clicar('form[data-form="login"] button:not([data-acao])');
      await t.pagina.locator('dialog[open]').waitFor({ timeout: 20000 });
      const janela = await t.pagina.locator('dialog[open]').innerText();
      t.conferir(janela.includes('ainda está com o acesso pela internet de quem-saiu@exemplo.com.br'), 'explica de quem é o acesso', janela.slice(0, 200));
      t.conferir(!/use o usuário desse e-mail/.test(await t.texto()), 'sem a trava antiga', 'a trava antiga apareceu');
      await t.clicar('dialog[open] button[value=sim]');
      await t.esperarTexto('Neste endereço de teste não há login da internet para trocar');
      const guardado = await t.pagina.evaluate(() => localStorage.getItem('imoveis-troca-login'));
      t.conferir(guardado && guardado.includes(LOGIN) && !guardado.includes(SENHA), 'guarda só o login, sem a senha', String(guardado));
      // de volta (como depois do código do e-mail): a tela de login vem com o login preenchido
      await t.pagina.reload();
      await t.pagina.locator('form[data-form="login"]').waitFor({ timeout: 20000 });
      await t.esperarTexto('Acesso pela internet trocado');
      t.conferir(await t.pagina.locator('#ent_login').inputValue() === LOGIN, 'login preenchido', await t.pagina.locator('#ent_login').inputValue());
      await t.preencher('#ent_senha', SENHA);
      await t.clicar('form[data-form="login"] button:not([data-acao])');
      await t.pagina.waitForFunction(() => !document.querySelector('form[data-form="login"]') && document.querySelector('#app nav'), null, { timeout: 30000 });
      t.conferir(await t.pagina.evaluate(() => localStorage.getItem('imoveis-troca-login')) === null, 'ao entrar, o login guardado sai', 'continuou guardado');
    },
  },
];
