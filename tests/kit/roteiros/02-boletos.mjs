// Kit de teste: boletos (lista do mês, tarifa, PDF do banco, atraso com multa e juros, proporcional, parcela de acordo).
// Valores fixos: o banco do kit é montado em 25/11/2026 e o navegador fica com o relógio nesse dia.
export default [
  { nome: 'Boletos de 11/2026', rota: '#/cobrancas?comp=2026-11', espera: ['Boletos de 11/2026', 'Ana Caução Teste', 'R$ 1.808,50', 'Diego Proporcional Teste', 'R$ 900,00'] },
  {
    nome: 'Boleto com tarifa e PDF do banco (Ana)', rota: (k) => `#/cobranca/${k.ids.anaBoleto}`,
    espera: ['Boleto 11/2026', 'Em aberto', 'Aluguel R$ 1.800,00', 'Tarifa de emissão do boleto R$ 8,50', 'Total sem desconto R$ 1.808,50', 'Vencimento 10/12/2026', 'boleto-11-2026.pdf'],
  },
  {
    nome: 'Boleto atrasado: multa e juros (Bruno)', rota: (k) => `#/cobranca/${k.ids.brunoAtrasado}`,
    espera: ['Boleto 10/2026', 'Vencida', 'Se for pago hoje (25/11/2026): R$ 2.049,90', '15 dias de atraso: multa 2% = R$ 40,00; juros 1% a.m. = R$ 9,90'],
  },
  { nome: 'Boleto proporcional (Diego, entrada em 16/11)', rota: (k) => `#/cobranca/${k.ids.diegoBoleto}`, espera: ['Aluguel proporcional: 15 de 30 dias de R$ 1.800,00 R$ 900,00', 'Total sem desconto R$ 900,00'] },
  { nome: 'Parcela do acordo com honorários (Carla)', rota: (k) => `#/cobranca/${k.ids.acordoParcela}`, espera: ['R$ 2.059,86', 'Honorários'] },
];
