// Kit de teste: mensagens aos inquilinos (pedido do dono de 26/11/2026). Em Comunicações → "Nova mensagem": modelo "Lembrete do
// vencimento", campo {nome} posto no cursor, "Todos os inquilinos", prévia com os dados da 1ª pessoa (sem "[preencher: …]"),
// "Continuar para o envio", WhatsApp um por um (copiar marca "WhatsApp enviado") e, na nuvem (Gmail simulado), "Enviar e-mail a
// todos". Fica no fim: grava (uma mensagem nova em cada lugar).
export default [
  {
    nome: 'Comunicações: lista das mensagens e o botão "Nova mensagem"', rota: '#/comunicacoes',
    espera: ['Mensagens aos inquilinos', 'Nova mensagem', 'Comunicados com link (confirmação de contatos)'],
  },
  {
    nome: 'Modelos: os modelos de mensagem prontos', rota: '#/comunicacoes?ver=modelos',
    espera: ['Modelos de mensagem', 'Lembrete do vencimento', 'Lembramos que o aluguel do {imovel_curto} vence no dia {dia_vencimento}'],
  },
  {
    nome: 'Nova mensagem: escrever, escolher, ver como fica e enviar', rota: '#/comunicacoes?ver=escrever&tema=vencimento', limite: 90000,
    async acoes(t) {
      await t.esperarTexto('Nova mensagem aos inquilinos');
      await t.esperarTexto('Campos que o sistema preenche para cada pessoa');
      t.conferir(await t.pagina.locator('[name=assunto]').inputValue() === 'Lembrete: aluguel vence no dia {dia_vencimento}', 'assunto do modelo escolhido', await t.pagina.locator('[name=assunto]').inputValue());
      // campo posto onde está o cursor (no começo do WhatsApp)
      await t.pagina.locator('[name=whatsapp]').focus();
      await t.pagina.locator('[name=whatsapp]').evaluate((el) => el.setSelectionRange(0, 0));
      await t.clicar('[data-inserir="{nome_completo}"]');
      t.conferir((await t.pagina.locator('[name=whatsapp]').inputValue()).startsWith('{nome_completo}Olá, {nome}!'), 'campo no cursor', (await t.pagina.locator('[name=whatsapp]').inputValue()).slice(0, 40));
      await t.preencher('[name=whatsapp]', 'Olá, {nome}! Lembrete da {empresas}: o aluguel do {imovel_curto} vence no dia {dia_vencimento}.');
      await t.preencher('[name=telefone_empresa]', '(41) 3333-0000');
      await t.preencher('[name=email_empresa]', 'administracao@exemplo.com.br');
      await t.preencher('[name=titulo]', 'Kit lembrete');
      // sem ninguém escolhido, a prévia avisa
      await t.clicar('[data-previa-mensagem]');
      await t.esperarTexto('Escolha pelo menos uma pessoa para ver como fica');
      await t.clicar('[data-marcar=inquilino]');
      const n = Number((await t.pagina.locator('[data-contagem-pessoas]').innerText()).match(/\d+/)[0]);
      t.conferir(n >= 3, 'todos os inquilinos marcados', `${n} marcados`);
      t.conferir(await t.pagina.locator('tr[data-tipo=fiador] [name=pessoa]:checked').count() === 0, 'fiadores fora de "Todos os inquilinos"', 'fiador marcado');
      // a busca esconde quem não bate
      await t.preencher('[data-filtro-pessoas]', 'zzz-ninguem');
      t.conferir(await t.pagina.locator('tr[data-pessoa]:not([hidden])').count() === 0, 'busca esconde quem não bate', 'continuou aparecendo');
      await t.preencher('[data-filtro-pessoas]', '');
      await t.pagina.locator('[data-filtro-pessoas]').dispatchEvent('input');
      await t.clicar('[data-previa-mensagem]');
      await t.pagina.locator('dialog[open] [data-previa-email]').waitFor({ timeout: 10000 });
      const previa = await t.pagina.locator('dialog[open]').innerText();
      t.conferir(/Lembrete: aluguel vence no dia \d+/.test(previa), 'assunto preenchido na prévia', previa.slice(0, 200));
      t.conferir(/Olá, \S+! Lembrete da .+ vence no dia \d+\./.test(previa), 'WhatsApp preenchido na prévia', previa.slice(0, 300));
      t.conferir(!previa.includes('{nome}') && !previa.includes('{dia_vencimento}'), 'nenhum {campo} sobrando', previa.slice(0, 300));
      await t.clicar('dialog[open] button[value=sim]');
      // salvar como modelo: aparece no seletor da próxima vez
      await t.clicar('[data-salvar-modelo]');
      await t.pagina.locator('dialog[open] input[name=nome]').fill('Kit modelo salvo');
      await t.clicar('dialog[open] button[value=sim]');
      await t.esperarTexto('Modelo "Kit modelo salvo" salvo');
      await t.clicar('form[data-mensagem-form] button:not([type])');
      await t.esperarTexto('Mensagem pronta. Confira e envie.');
      await t.esperarTexto('Kit lembrete');
      await t.esperarTexto(`Não enviados ${n}`);
      // WhatsApp um por um: copiar marca a pessoa; "Parar" fecha a fila
      await t.clicar('[data-acao=whatsTodosMensagem]');
      await t.pagina.locator('dialog[open] [data-copiar]').waitFor({ timeout: 10000 }); // título da janela em maiúsculas: "WHATSAPP 1 DE …"
      await t.clicar('dialog[open] [data-copiar]');
      await t.clicar('dialog[open] [data-nao]');
      await t.esperarTexto('WhatsApp enviado');
      if (t.lugar === 'nuvem') {
        await t.clicar('[data-acao=emailTodosMensagem]');
        await t.esperarTexto('Enviar o e-mail para');
        await t.clicar('dialog[open] button[value=sim]');
        await t.esperarTexto('E-mail enviado', 30000);
        // registro do envio, com o contrato (aparece no histórico do inquilino)
        const ok = await t.pagina.evaluate(async () => { const A = await import('/js/app.js'); return A.E.d.envios_email.filter((x) => x.chave === 'mensagem' && x.contrato_id && x.como === 'enviado').length; });
        t.conferir(ok > 0, 'e-mail registrado em envios_email', `${ok} registro(s)`);
      } else {
        await t.esperarTexto('O e-mail direto só sai no sistema pela internet');
      }
    },
  },
];
