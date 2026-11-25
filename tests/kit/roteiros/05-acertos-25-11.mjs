// Kit de teste: acertos de 25/11/2026 (boleto quitado pela reserva, termo do acordo refeito, janela da 2ª via e o Sair que
// apaga do navegador o que ficou da assinatura do contrato).

export default [
  {
    nome: 'Boleto quitado pela reserva (Júlia)', rota: (k) => `#/cobranca/${k.ids.juliaBoleto}`,
    espera: ['Quitado pela reserva', 'A reserva de R$ 1.800,00 cobre o boleto inteiro', 'Registrar a quitação pela reserva', 'A nota fiscal sai pelo aluguel em dia (R$ 1.800,00)', 'No vencimento (10/12/2026) a quitação é registrada sozinha'],
    naoEspera: ['Confirmar pagamento', '2ª via com o valor de hoje', 'Lembrar o inquilino'],
  },
  {
    nome: 'Lista de boletos com o quitado pela reserva', rota: '#/cobrancas?comp=2026-11',
    espera: ['Júlia Reserva Teste', 'Quitado pela reserva', 'Registrar a quitação'],
  },
  {
    nome: 'Termo do acordo refeito cita o 1º acordo (Lia)', rota: (k) => `#/imprimir/recibo?tipo=acordo&contrato=${k.ids.lia}&id=${k.ids.acordoRefeito}`,
    espera: ['TERMO DE CONFISSÃO DE DÍVIDA E ACORDO DE PAGAMENTO', 'inclui R$ 374,40 de honorários e R$ 73,50 de despesas de cobrança do acordo de 24/08/2026'],
  },
  {
    nome: 'Termo do 1º acordo não cita acordo anterior (Lia)', rota: (k) => `#/imprimir/recibo?tipo=acordo&contrato=${k.ids.lia}&id=${k.ids.acordoAntigo}`,
    espera: ['TERMO DE CONFISSÃO DE DÍVIDA E ACORDO DE PAGAMENTO'], naoEspera: ['do acordo de 24/08/2026'],
  },
  {
    nome: '2ª via sem erro no console e com os botões ligados (Bruno)', rota: (k) => `#/cobranca/${k.ids.brunoAtrasado}`,
    async acoes(t) {
      await t.clicar('2ª via com o valor de hoje');
      await t.esperarTexto('Para pagar hoje');
      const dlg = t.pagina.locator('dialog[open]').last();
      const email = await dlg.locator('[data-enviar=email]').getAttribute('href');
      t.conferir(/^mailto:/.test(email || ''), 'botão do e-mail com o endereço mailto:', email);
      const zap = await dlg.locator('[data-enviar=whatsapp]').getAttribute('href');
      t.conferir(/^https:\/\/wa\.me\//.test(zap || ''), 'botão do WhatsApp com o link wa.me', zap);
      await dlg.locator('[name=texto]').fill('Texto mudado no teste');
      const depois = await dlg.locator('[data-enviar=email]').getAttribute('href');
      t.conferir((depois || '').includes(encodeURIComponent('Texto mudado no teste')), 'o e-mail acompanha o texto editado', depois);
      await dlg.locator('button[value="sim"]').click();
      const abertas = await t.pagina.evaluate(() => document.querySelectorAll('dialog[open]').length);
      t.conferir(abertas === 0, 'a janela fechada pelo "Fechar"', `${abertas} janela(s) aberta(s)`);
    },
  },
  {
    nome: 'Sair apaga o que ficou da assinatura do contrato', rota: '#/', lugares: ['computador', 'celular', 'nuvem'],
    async acoes(t) {
      const r = await t.app((A) => {
        localStorage.setItem('assinatura-contrato-1', JSON.stringify({ modelo: '1', t1: 'Testemunha Teste', c1: '529.982.247-25' }));
        localStorage.setItem('caixas-recolhidas:kit', '[]');
        A.esquecerDadosDoNavegador();
        const sobrou = localStorage.getItem('assinatura-contrato-1');
        const outra = localStorage.getItem('caixas-recolhidas:kit');
        localStorage.removeItem('caixas-recolhidas:kit');
        return { sobrou, outra };
      });
      t.conferir(r.sobrou === null, 'assinatura-contrato-1 apagado', String(r.sobrou));
      t.conferir(r.outra === '[]', 'o resto do navegador continua (caixas recolhidas)', String(r.outra));
    },
  },
  {
    // o Painel (aberto ao entrar e de novo aqui) registra sozinho a quitação do boleto que venceu em 10/11 (25/11/2026)
    nome: 'Quitação pela reserva registrada sozinha no vencimento (Kauã)', rota: '#/',
    async acoes(t) {
      const rota = `#/cobranca/${t.ids.kauaBoleto}`;
      for (let i = 0; i < 20; i += 1) {
        await t.abrir(rota);
        if ((await t.texto()).includes('Pago em')) break;
        await t.abrir('#/');
        await new Promise((r) => setTimeout(r, 500));
      }
      await t.esperarTexto('Pago em');
      const texto = await t.texto();
      for (const e of ['Quitado pela reserva', '10/11/2026', 'R$ 1.800,00']) t.conferir(texto.includes(e), `"${e}" no boleto`, texto.slice(0, 300));
      t.conferir(!texto.includes('Registrar a quitação pela reserva'), 'sem o botão de registrar (já registrada)', 'o botão continua');
    },
  },
  {
    // "Guarda e avisa" (25/11/2026): ao Sair com vistoria pela metade, a pergunta; "Guardar" deixa o rascunho, "Apagar" tira;
    // o que ficou da assinatura do contrato sai sempre. Entra de novo no fim (último roteiro).
    nome: 'Sair com vistoria pela metade: guardar ou apagar', rota: '#/', lugares: ['computador', 'celular', 'nuvem', 'pc'], limite: 90000,
    async acoes(t) {
      const p = t.pagina;
      const chave = 'vistoria-1-entrada-nova';
      const guardar = () => p.evaluate((k) => {
        localStorage.setItem(k, JSON.stringify({ campos: { descritivo: 'Sala com piso de madeira' }, itens: {} }));
        localStorage.setItem('assinatura-contrato-1', JSON.stringify({ modelo: '1', t1: 'Testemunha Teste', c1: '529.982.247-25' }));
      }, chave);
      const ler = (k) => p.evaluate((x) => localStorage.getItem(x), k);
      const entrarDeNovo = async () => {
        await p.waitForSelector('form[data-form="login"]', { timeout: 20000 });
        await p.fill('#ent_login', t.kit.LOGIN);
        await p.fill('#ent_senha', t.kit.SENHA);
        await p.click('form[data-form="login"] button:not([data-acao])');
        await p.waitForFunction(() => !document.querySelector('form[data-form="login"]') && document.querySelector('#app nav'), null, { timeout: 30000, polling: 200 });
        await t.esperarDesenho();
      };
      const sairRespondendo = async (botao) => {
        await p.evaluate(() => document.querySelector('[data-acao="sair"]').click()); // no celular o link fica no menu
        const dlg = p.locator('dialog[open]').last();
        await dlg.waitFor({ timeout: 10000 });
        const texto = (await dlg.innerText()).replace(/\s+/g, ' ');
        t.conferir(texto.includes('Há uma vistoria pela metade neste aparelho. Apagar ou guardar para continuar depois?'), 'a pergunta da vistoria', texto.slice(0, 200));
        await dlg.locator(botao).click();
      };
      await guardar();
      await sairRespondendo('[data-nao]'); // Guardar para continuar depois
      await entrarDeNovo();
      t.conferir(await ler(chave) !== null, 'rascunho guardado', 'o rascunho sumiu');
      t.conferir(await ler('assinatura-contrato-1') === null, 'assinatura-contrato-1 apagado ao sair', 'ficou no navegador');
      await guardar();
      await sairRespondendo('button[value="sim"]'); // Apagar
      await entrarDeNovo();
      t.conferir(await ler(chave) === null, 'rascunho apagado', 'o rascunho ficou');
    },
  },
];
