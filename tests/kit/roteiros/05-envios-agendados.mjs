// Kit de teste: tela "Envios agendados" (#/envios-agendados, 25/11/2026). Fora da nuvem explica que agendar só existe lá;
// na nuvem local (banco novo, Gmail simulado) a lista começa vazia. O caso com um e-mail agendado fica em outro roteiro.
export default [
  { nome: 'Envios agendados fora da nuvem', rota: '#/envios-agendados', lugares: ['computador', 'celular', 'pc'], espera: ['Envios agendados', 'só existe no sistema na nuvem'], naoEspera: ['Mudar a hora'] },
  { nome: 'Envios agendados na nuvem (lista vazia)', rota: '#/envios-agendados', lugares: ['nuvem'], espera: ['Envios agendados', 'Nenhum e-mail agendado'], naoEspera: ['só existe no sistema na nuvem'] },
  { nome: 'Comunicações com o link dos envios agendados (nuvem)', rota: '#/comunicacoes', lugares: ['nuvem'], espera: ['Comunicações', 'Envios agendados'] },
];
