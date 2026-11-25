// Kit de teste: página do inquilino em cada caso (caução, fiador, acordo, proporcional, troca de titular, saída) e a notificação.
export default [
  { nome: 'Inquilino com caução (Ana)', rota: (k) => `#/contrato/${k.ids.ana}`, espera: ['Ana Caução Teste', 'Garantia: Caução', 'R$ 5.400,00'] },
  { nome: 'Inquilino com fiador e atraso (Bruno)', rota: (k) => `#/contrato/${k.ids.bruno}`, espera: ['Bruno Fiador Teste', 'Garantia: Fiador', 'Carlos Fiador Teste'] },
  { nome: 'Notificação "Aluguel em atraso" (Bruno)', rota: (k) => `#/notificacao/${k.ids.notificacao}`, espera: ['Aguardando resposta', 'Aluguel em atraso', '10/2026 10/11/2026 R$ 2.046,60 em aberto', 'Sem multa contratual'] },
  { nome: 'Inquilino com acordo (Carla)', rota: (k) => `#/contrato/${k.ids.carla}`, espera: ['Carla Acordo Teste', '11/2026 acordo 1/2 10/12/2026 R$ 2.059,86', '08/2026 10/09/2026 R$ 1.800,00 Em acordo'] },
  { nome: 'Inquilino com entrada no meio do mês (Diego)', rota: (k) => `#/contrato/${k.ids.diego}`, espera: ['Diego Proporcional Teste', 'R$ 900,00'] },
  { nome: 'Troca de titular: quem saiu (Elisa)', rota: (k) => `#/contrato/${k.ids.elisa}`, espera: ['Continuado por Fábio Novo Teste (01/11/2026', 'Entrada / fim do vínculo 01/07/2026 a 31/10/2026'] },
  { nome: 'Troca de titular: quem entrou (Fábio)', rota: (k) => `#/contrato/${k.ids.fabio}`, espera: ['Fábio Novo Teste', 'no contrato de Elisa Anterior Teste'] },
  { nome: 'Saída com cálculo final feito (Gabriel)', rota: (k) => `#/contrato/${k.ids.gabriel}`, espera: ['Encerrado', 'Saldo a devolver ao inquilino R$ 3.400,00'] },
];
