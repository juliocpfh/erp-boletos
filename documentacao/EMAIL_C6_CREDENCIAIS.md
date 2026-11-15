# E-mail ao C6 pedindo as credenciais da API (14/11/2026)

Enviar **um e-mail por empresa**, do e-mail de cadastro de cada uma, para `homologacaoapi@c6bank.com`.
Trocar o que está entre colchetes. Nunca mande senha, ClientSecret nem certificado por e-mail.

---

**Assunto:** Liberação das credenciais da API (Cliente Final): [RAZÃO SOCIAL], CNPJ [CNPJ]

Prezados,

Sou [SEU NOME], [CARGO] da **[RAZÃO SOCIAL]**, CNPJ **[CNPJ]**, correntista do C6 Empresas (agência [AGÊNCIA], conta [CONTA]).

Fizemos o cadastro no portal de desenvolvedores (developers.c6bank.com.br) na semana de 16/10/2026 e já reclamamos da demora. Até hoje não recebemos as credenciais. Por isso escrevo direto a vocês.

**O que pedimos:** acesso como **Cliente Final** (sistema próprio, de uso interno; não somos software house nem parceiro). Queremos as credenciais de **sandbox** e de **produção**, com o certificado, para **todos os módulos da API** disponíveis para conta PJ:

1. Boleto com Pix (Bolepix, `/v2/bank_slips`): emitir, consultar, listar, alterar, PDF, cancelar e negativação;
2. Boleto de cobrança (v1), enquanto ainda estiver ativo;
3. Pix: cobrança imediata e com vencimento, consulta de recebimentos e webhook;
4. Pix Automático;
5. Saldo e extrato (`/v1/statement`);
6. Agendamento de pagamentos (`/v1/schedule_payments`);
7. Notificações por webhook (`/v1/webhooks`, serviços BANK_SLIP e BANK_SLIP_PIX);
8. C6 Pay (checkout e transações/recebíveis), se estiver disponível para a nossa conta.

**Para que vamos usar:** a empresa administra imóveis próprios alugados. Temos um sistema interno, feito sob medida para nós, que:
- emite os boletos de aluguel no C6 (valor cheio, com desconto até o vencimento, multa e juros);
- busca o extrato todo dia e confere sozinho o que foi pago;
- prepara os pagamentos das contas dos imóveis. Nenhum pagamento sai sem a confirmação de uma pessoa da empresa.

As chaves e o certificado ficam guardados só num computador da empresa, num programa que fala com a API de vocês. Nunca ficam no site nem com terceiros.

**Quem está me ajudando:** o sistema está sendo feito por nós com a ajuda do **Claude**, assistente de inteligência artificial da empresa **Anthropic**. Ele escreve o programa conforme a documentação oficial de vocês (os arquivos OpenAPI do portal) e não tem acesso às chaves: eu instalo e guardo as credenciais pessoalmente.

**Dúvidas que precisamos que respondam:**
1. Temos duas empresas do mesmo grupo, **[RAZÃO SOCIAL DA OUTRA]** (CNPJ [CNPJ DA OUTRA]), que também está pedindo o mesmo acesso por e-mail. São dois cadastros separados ou um só pode cobrir os dois CNPJs?
2. Qual é a validade do certificado e como se renova?
3. Na tela "Integrações via API" do Web Banking, o campo "Parceiro" só mostra empresas de fora. Como gerar a chave de produção para sistema próprio sem escolher um parceiro?
4. Qual é o limite de requisições por minuto em produção?

Peço a gentileza de um retorno com prazo. Se precisarem de algum documento, envio na hora.

Atenciosamente,
[SEU NOME]
[CARGO], [RAZÃO SOCIAL]
[TELEFONE]
