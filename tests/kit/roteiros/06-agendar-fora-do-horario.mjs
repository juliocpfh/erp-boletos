// Kit de teste: e-mail ao inquilino fora do horário comercial (pedido do dono de 25/11/2026). Na nuvem local (Gmail simulado),
// o relógio do navegador vai para sexta 27/11/2026 às 21h30: "Enviar agora" de um e-mail de etapa de Bruno pergunta "Agendar para amanhã
// (sábado), 28/11, às 8h"; agendado, aparece em Envios agendados; a rodada do cron (rota só local /__agendados/rodar) com
// sábado 8h05 manda o e-mail e a lista mostra "Enviado". No fim, o relógio volta ao dia do kit. Fica por último: grava.
const SEXTA_NOITE = '2026-11-28T00:30:00.000Z'; // 27/11/2026 às 21h30 em Brasília
const SABADO_8H05 = '2026-11-28T11:05:00.000Z';

export default [
  {
    // sem a nuvem (?teste, como a versão PC) não há "Enviar agora" do Gmail: a pergunta é aberta direto, para ver "Agendar" desligado
    nome: 'Fora do horário sem a nuvem: "Agendar" desligado, com a explicação', rota: '#/', lugares: ['computador', 'celular'],
    async acoes(t) {
      const volta = new Date(t.kit?.INSTANTE || '2026-11-25T15:00:00.000Z');
      await t.pagina.clock.setSystemTime(new Date(SEXTA_NOITE));
      try {
        await t.pagina.evaluate(() => { import('/js/telas/horario.js').then((m) => { window.__kitQuando = m.perguntarQuando({ resumo: 'O e-mail vai para inquilino@exemplo.com.br.' }); }); });
        await t.esperarTexto('Agendar só funciona no sistema na nuvem');
        await t.esperarTexto('Agendar para amanhã (sábado), 28/11, às 8h');
        t.conferir(await t.pagina.locator('dialog[open] input[name=modo][value=agendar]').isDisabled(), '"Agendar" desligado', 'estava ligado');
        t.conferir(await t.pagina.locator('dialog[open] input[name=modo][value=agora]').isChecked(), '"Enviar agora mesmo" marcado', 'desmarcado');
        await t.clicar('dialog[open] button[data-nao]');
        t.conferir(await t.pagina.evaluate(() => window.__kitQuando) === null, 'Cancelar devolve nada', 'devolveu uma escolha');
      } finally {
        await t.pagina.clock.setSystemTime(volta);
      }
    },
  },
  {
    nome: 'Fora do horário: aviso na janela e pergunta de agendar (nuvem)', rota: (k) => `#/contrato/${k.ids.bruno}`, lugares: ['nuvem'], limite: 60000,
    async acoes(t) {
      const volta = new Date(t.kit?.INSTANTE || '2026-11-25T15:00:00.000Z');
      await t.pagina.clock.setSystemTime(new Date(SEXTA_NOITE));
      try {
        await t.clicar('[data-acao=abrirEmail]');
        await t.esperarTexto('Agora é fora do horário comercial');
        // o e-mail do contrato pede o PDF e tem "[preencher: indice]": texto curto e um PDF de mentira
        await t.preencher('dialog[open] textarea[name=texto]', 'Olá, Bruno. Segue o contrato para assinatura.');
        await t.pagina.locator('dialog[open] input[name=anexos]').setInputFiles({ name: 'contrato-kit.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%kit\n') });
        await t.clicar('dialog[open] button[data-enviar]');
        await t.esperarTexto('Agendar para amanhã (sábado), 28/11, às 8h');
        t.conferir(await t.pagina.locator('dialog[open] input[name=modo][value=agendar]').isChecked(), '"Agendar" já marcado', 'estava desmarcado');
        await t.clicar('dialog[open] button[value=sim]');
        await t.esperarTexto('E-mail agendado para amanhã (sábado), 28/11, às 8h');
        await t.abrir('#/envios-agendados');
        await t.esperarTexto('Mudar a hora');
        // a rodada do cron com sábado 8h05: o e-mail sai (Gmail simulado) e vira "Enviado"
        const feito = await t.pagina.evaluate(async (agora) => (await fetch(`/__agendados/rodar?agora=${encodeURIComponent(agora)}`)).json(), SABADO_8H05);
        t.conferir(feito.enviados === 1, '1 e-mail enviado pela rodada do cron', JSON.stringify(feito));
        await t.abrir('#/envios-agendados');
        await t.esperarTexto('Enviado');
      } finally {
        await t.pagina.clock.setSystemTime(volta);
      }
    },
  },
];
