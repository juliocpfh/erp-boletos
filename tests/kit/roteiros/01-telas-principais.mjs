// Kit de teste: as telas principais abrem sem erro e mostram os casos do banco do kit (tests/kit/banco.mjs).
export default [
  { nome: 'Painel', rota: '#/', espera: ['Painel', 'Fichas em análise: ficha de Igor Ficha Teste'] },
  { nome: 'Inquilinos', rota: '#/inquilinos', espera: ['Ana Caução Teste', 'Bruno Fiador Teste', 'Fábio Novo Teste'] },
  { nome: 'Fichas', rota: '#/inquilinos?ir=fichas', espera: ['Igor Ficha Teste'] },
  { nome: 'Imóveis', rota: '#/imoveis', espera: ['Kit Caução', 'Kit Ficha'] },
  { nome: 'Notificações', rota: '#/notificacoes', espera: ['Bruno Fiador Teste', 'Aguardando resposta'] },
  { nome: 'Regras do sistema', rota: '#/regras', espera: ['Regras do sistema', 'o boleto vai a R$ 2.308,50'] },
  { nome: 'Sistema', rota: '#/dados', espera: ['Sistema'] },
];
