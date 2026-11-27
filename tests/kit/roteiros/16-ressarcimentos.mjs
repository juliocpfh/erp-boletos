// Kit de teste: tela Ressarcimentos (pedido do dono de 27/11/2026: "por condomínios e por inquilinos, para evitar entrar direto na
// página do inquilino"; chamada pelo Fechamento do mês e aba de Inquilinos). Prédio do kit com Nina (fundo de obras de R$ 150,00
// do condomínio de 10/2026) e Otávio (a conferir). Confere as duas vistas, a aba, o "Abrir" do fechamento e o "Lançar taxa"
// (já com o mês da tela). Só confere: não grava nada (o banco do kit fica igual).
const MES = '2026-10';

export default [
  {
    nome: 'Ressarcimentos por condomínio (prédio do kit)', rota: `#/ressarcimentos?mes=${MES}`, lugares: ['computador', 'celular', 'nuvem'],
    espera: ['Ressarcimentos do condomínio', 'Rua do Prédio do Kit, 500', 'Administradora Teste', 'Nina Condomínio Teste', 'Fundo de obras', 'R$ 150,00', 'Otávio Condomínio Teste', 'a conferir'],
  },
  {
    nome: 'Ressarcimentos por inquilino', rota: `#/ressarcimentos?mes=${MES}&ver=inquilino`, lugares: ['computador', 'celular'],
    espera: ['Por inquilino', 'Nina Condomínio Teste', 'Otávio Condomínio Teste', 'conferido até 09/2026'],
  },
  {
    nome: 'Aba Ressarcimentos em Inquilinos', rota: '#/inquilinos', lugares: ['computador'],
    async acoes(t) {
      const n = await t.pagina.locator('nav.abas a[href="#/ressarcimentos"]').count();
      t.conferir(n === 1, 'aba Ressarcimentos ao lado de Lista e Comunicações', `${n} link(s)`);
    },
  },
  {
    nome: 'Fechamento do mês abre a tela Ressarcimentos', rota: '#/fechamento?mes=2026-11', lugares: ['computador'],
    async acoes(t) {
      const n = await t.pagina.locator(`a[href="#/ressarcimentos?mes=${MES}"]`).count();
      t.conferir(n >= 1, 'etapa do condomínio com o "Abrir" para a tela', `${n} link(s)`);
    },
  },
  {
    nome: 'Lançar taxa pela tela volta para ela', rota: (k) => `#/novo/ressarcimentos?contrato=${k.ids.otavio}&de=ressarcimentos&mes=${MES}`, lugares: ['computador'],
    async acoes(t) {
      const mes = await t.pagina.locator('[name=competencia_condominio]').inputValue();
      t.conferir(mes === MES, 'já vem com o mês do condomínio da tela', mes);
    },
  },
];
