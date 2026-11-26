// Kit de teste: botão "Desligar o link" do termo de aceite da reserva (pedido do dono de 25/11/2026). Só na nuvem (o aceite pela
// internet não existe sem ela). Cria uma ficha em análise com reserva combinada de R$ 800,00, gera o link, confere que o
// botão aparece, desliga (com a pergunta) e confere que a caixa volta a oferecer "Gerar o link do aceite". Fica no fim: grava.
export default [
  {
    nome: 'Termo da reserva: gerar o link e desligar', rota: '#/', lugares: ['nuvem'], limite: 60000,
    async acoes(t) {
      const id = await t.pagina.evaluate(async () => {
        const A = await import('/js/app.js');
        const r = await A.alterar((db) => {
          const im = A.R.inserir(db, 'imoveis', { tipo: 'normal', nome: 'Kit Termo Desligar', endereco: 'Rua do Kit, 9', cidade: 'São Paulo', uf: 'SP' }, 'kit');
          return A.R.inserir(db, 'fichas', { inquilino_nome: 'Joana Link Teste', inquilino_cpf: '529.982.247-25', inquilino_tipo: 'Pessoa física', inquilino_email: 'joana@exemplo.com.br',
            imoveis_ids: [im.id], situacao: 'Em análise', data_recebida: '2026-11-25', aluguel_inicial: 200000, dia_vencimento: 10, garantia_tipo: 'Fiador', prazo_meses: 30, reserva_combinada: 80000 }, 'kit', 'Ficha do kit (termo)');
        });
        return r.id;
      });
      await t.abrir(`#/ficha/${id}`);
      await t.esperarTexto('Termo de aceite da reserva');
      await t.esperarTexto('Reserva de R$ 800,00');
      t.conferir((await t.pagina.locator('[data-acao=desligarLinkTermo]').count()) === 0, 'sem link, não há "Desligar o link"', 'o botão apareceu antes de existir link');
      await t.clicar('[data-acao=gerarLinkTermo]');
      await t.esperarTexto('por segurança, este link não fica guardado no sistema');
      await t.clicar('dialog[open] button[value=sim]');
      await t.esperarTexto('Desligar o link');
      await t.esperarTexto('Gerar novo link');
      await t.clicar('[data-acao=desligarLinkTermo]');
      await t.esperarTexto('Quem abrir o link não consegue mais dar o aceite');
      await t.clicar('dialog[open] button[value=sim]');
      await t.esperarTexto('Link do termo desligado');
      await t.esperarTexto('Gerar o link do aceite');
      t.conferir((await t.pagina.locator('[data-termo-reserva] [data-acao=desligarLinkTermo]').count()) === 0, 'a caixa volta ao começo (sem "Desligar o link")', 'o botão continua na caixa');
      // na nuvem, o registro do link ficou encerrado
      const lido = await t.pagina.evaluate(async (ficha) => (await (await fetch(`api/aceite-reserva/ler?ficha=${ficha}`, { cache: 'no-store' })).json()).link, id);
      t.conferir(!!(lido && lido.encerrado_em && !lido.resposta), 'link encerrado na nuvem, sem aceite', JSON.stringify(lido).slice(0, 120));
    },
  },
];
