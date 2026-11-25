// Kit de teste: cálculo final com a multa pela falta do aviso de 30 dias mudada à mão (25/11/2026). Mário avisou em 10/11 e saiu
// em 25/11 (15 dias): sugestão R$ 900,00; "Usar" e depois "Débitos" em R$ 600,00 → a descrição acompanha o valor. Não grava.

const LINHA_SUGERIDA = 'Multa pela falta do aviso de 30 dias: R$ 900,00 (avisou em 10/11/2026, 15 dia(s) antes da saída; R$ 1.800,00 × 15/30 dias que faltaram)';
const LINHA_AJUSTADA = 'Multa pela falta do aviso de 30 dias (valor ajustado à mão: R$ 600,00; sugerido R$ 900,00)';

export default [
  {
    nome: 'Cálculo final: multa do aviso mudada à mão (Mário)', rota: (k) => `#/novo/encerramentos?contrato=${k.ids.mario}`,
    espera: ['Saída e cálculo final - Mário Aviso Teste', 'Multa sugerida pela saída', 'Falta do aviso de 30 dias', 'Usar R$ 900,00'],
    async acoes(t) {
      const debitos = t.pagina.locator('#app main form [name="debitos"]');
      const desc = t.pagina.locator('#app main form [name="debitos_descricao"]');
      await t.clicar('Usar R$ 900,00');
      await t.esperarTexto('Incluída nos débitos');
      t.conferir((await debitos.inputValue()).includes('900,00'), 'Débitos com R$ 900,00 depois do "Usar"', await debitos.inputValue());
      t.conferir((await desc.inputValue()).includes(LINHA_SUGERIDA), 'a linha da multa sugerida na descrição', await desc.inputValue());
      await t.preencher('#app main form [name="debitos"]', '600,00');
      await debitos.blur();
      const texto = await desc.inputValue();
      t.conferir(texto.includes(LINHA_AJUSTADA), `a descrição "${LINHA_AJUSTADA}"`, texto);
      t.conferir(!texto.includes('R$ 900,00 (avisou'), 'a conta antiga fora da descrição', texto);
      // tirar a multa dos débitos (R$ 0,00): some a linha e o botão "Usar" volta
      await t.preencher('#app main form [name="debitos"]', '0,00');
      await debitos.blur();
      const semMulta = await desc.inputValue();
      t.conferir(!semMulta.includes('Multa pela falta do aviso'), 'a linha da multa fora da descrição com Débitos em R$ 0,00', semMulta);
      await t.esperarTexto('Usar R$ 900,00');
    },
  },
];
