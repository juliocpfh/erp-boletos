// Kit de teste: acertos de 25/11/2026 (boleto quitado pela reserva, termo do acordo refeito, janela da 2ª via e o Sair que
// apaga do navegador o que ficou da assinatura do contrato).

export default [
  {
    nome: 'Boleto quitado pela reserva (Júlia)', rota: (k) => `#/cobranca/${k.ids.juliaBoleto}`,
    espera: ['Quitado pela reserva', 'A reserva de R$ 1.800,00 cobre o boleto inteiro', 'Registrar a quitação pela reserva', 'A nota fiscal sai pelo aluguel em dia (R$ 1.800,00)'],
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
];
