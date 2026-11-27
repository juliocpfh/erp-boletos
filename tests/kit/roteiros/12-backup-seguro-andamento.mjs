// Kit de teste: andamento do "Conectar" do backup seguro (pedido do dono de 27/11/2026: o botão parecia travado, sem dizer se deu
// certo). Cria a senha do backup (andamento + "Pronto"), desliga, conecta com a senha errada (aviso) e com a certa (passos na
// barra e "Pronto", sem refazer o backup completo da semana). Só no computador: em ?teste a pasta segura é a interna do navegador.
export default [
  {
    nome: 'Backup seguro: criar, conectar com senha errada e certa, com andamento', rota: '#/backup-seguro', lugares: ['computador'], limite: 90000,
    async acoes(t) {
      const SENHA = 'frase do backup do kit 2026';
      // guarda cada passo que aparece na barra (some no fim)
      await t.pagina.evaluate(() => {
        window.__passos = [];
        new MutationObserver(() => {
          const p = document.getElementById('progresso-backup');
          const txt = p && p.innerText.trim().split('\n')[0];
          if (txt && !window.__passos.includes(txt)) window.__passos.push(txt);
        }).observe(document.body, { childList: true, subtree: true, characterData: true });
      });
      const passos = () => t.pagina.evaluate(() => { const v = window.__passos; window.__passos = []; return v; });
      await t.clicar('[data-acao=escolherPastaSegura]');
      await t.esperarTexto('Crie a senha do backup');
      await t.preencher('form[data-form="configurarSeguro"] [name=senha]', SENHA);
      await t.preencher('form[data-form="configurarSeguro"] [name=senha2]', SENHA);
      await t.clicar('form[data-form="configurarSeguro"] button');
      await t.esperarTexto('Pronto: backup seguro ligado neste computador. Cópia de hoje e backup completo gravados');
      const criar = await passos();
      t.conferir(criar.includes('Criando a chave do backup…'), 'ao criar, a barra mostra os passos', JSON.stringify(criar));
      // desliga e conecta de novo à mesma pasta
      await t.clicar('[data-acao=desconectarSeguro]');
      await t.clicar('dialog[open] button[value=sim]');
      await t.esperarTexto('Escolher a pasta segura');
      await t.clicar('[data-acao=escolherPastaSegura]');
      await t.esperarTexto('Digite a senha do backup');
      await t.preencher('form[data-form="configurarSeguro"] [name=senha]', 'senha errada do kit');
      await t.clicar('form[data-form="configurarSeguro"] button');
      await t.esperarTexto('Senha do backup incorreta. Confira e digite de novo.');
      await t.clicar('dialog[open] button');
      t.conferir(!(await t.pagina.locator('form[data-form="configurarSeguro"] button').isDisabled()), 'senha errada: o botão "Conectar" volta a funcionar', 'ficou desligado');
      await passos();
      await t.preencher('form[data-form="configurarSeguro"] [name=senha]', SENHA);
      await t.clicar('form[data-form="configurarSeguro"] button');
      await t.esperarTexto('Pronto: backup seguro ligado neste computador. Cópia de hoje gravada na pasta segura');
      const conectar = await passos();
      t.conferir(conectar.includes('Conferindo a senha do backup…') && conectar.includes('Gravando a cópia de hoje na pasta segura…'),
        'ao conectar, a barra mostra "Conferindo a senha" e "Gravando a cópia de hoje"', JSON.stringify(conectar));
      t.conferir(!conectar.some((p) => p.startsWith('Baixando os anexos')), 'completo da semana já existe: não baixa os anexos de novo', JSON.stringify(conectar));
      // deixa como estava: desligado
      await t.clicar('[data-acao=desconectarSeguro]');
      await t.clicar('dialog[open] button[value=sim]');
      await t.esperarTexto('Escolher a pasta segura');
    },
  },
];
