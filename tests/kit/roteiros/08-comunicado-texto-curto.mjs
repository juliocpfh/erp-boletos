// Kit de teste: modelo do comunicado de contatos com os textos curtos (25/11/2026). A página dos modelos (Comunicações → Modelos)
// mostra o e-mail novo, com o aviso contra golpe inteiro, e não mostra mais o texto comprido. Não grava.
export default [
  {
    nome: 'Comunicado de contatos: texto curto no modelo', rota: '#/comunicacoes?ver=modelos',
    espera: ['Atualização de contatos e novo e-mail da empresa', 'Nossos e-mails (boletos e avisos) agora saem de {email_empresa}', 'Confirme seus contatos até {prazo} (leva 2 minutos)',
      'Nunca pedimos pagamento em outra conta. Na dúvida, ligue para {telefone_empresa}.'],
    naoEspera: ['Atenciosamente', 'Precisamos que você confirme'],
  },
];
