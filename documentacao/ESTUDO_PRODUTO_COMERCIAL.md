# Estudo: transformar o sistema em produto comercial (2026-11-11)

Pesquisa feita em 11/11/2026 (bancos e concorrentes pela internet; o resto pela leitura do código). Marcação: **[C]** confirmado em fonte, **[I]** inferência, **n/c** não confirmado. Preços de concorrentes quase nunca são públicos: trate os valores como aproximados.

## 1. Conclusão em uma página

- **Há um nicho sem dono:** locador com carteira própria (empresa patrimonial ou pessoa física "grande locador", 5 a 200 imóveis), que emite NF de locação, cobra pelo próprio banco e precisa dos impostos. Os sistemas de imobiliária giram em torno de repasse a terceiros; os de proprietário (Alugo, Rentos) miram pessoa física, sem NF e com o dinheiro passando pela plataforma. Não achamos produto que anuncie "locador PJ + NF + boleto no próprio banco + impostos" [I, a partir da pesquisa].
- **A reforma tributária abre a janela:** CBS/IBS sobre locação a partir de 2027, NFS-e nacional com código de locação, pessoa física com mais de 3 imóveis e receita acima de R$ 240 mil/ano virando contribuinte. Poucos sistemas anunciam isso.
- **O sistema já tem o difícil** (regras de locação testadas, NF, banco com conciliação, funcionamento sem internet) **e não tem o básico de produto** (vários clientes, cadastro, cobrança automática ao inquilino, portal, assinatura eletrônica).
- **Não é preciso reescrever.** O maior trabalho é: (1) vários clientes separados, (2) regras do dono virarem configurações, (3) a ponte do banco sair do computador do usuário, (4) comunicação automática com o inquilino.

## 2. Bancos com API nos moldes do que montamos

| Instituição | Contrata direto? | Cobre | Custo conhecido | Observação |
|---|---|---|---|---|
| **Inter Empresas** | Sim, pelo internet banking [C] | Boleto com QR, Pix, extrato/saldo, pagamentos, Pix Automático [C] | Conta grátis; boleto ~R$ 2,49 com 30 grátis/mês (fonte terceira) | Mesmo modelo técnico do C6 (certificado) |
| **Itaú** | Sim, via gerente [C] | Boleto, Bolecode, Pix [C]; extrato/pagamentos n/c | Negociado | Ativação lenta |
| **Bradesco** | Sim, portal + contrato de cobrança [C] | Boleto com e sem QR, Pix, extrato [C] | n/c | Boleto com QR não deixa alterar vencimento/juros [C] |
| **Banco do Brasil** | Sim, portal + convênio [C] | Boleto, Pix no boleto, aviso de pagamento, boleto com Pix Automático [C] | n/c | Portal mais aberto dos grandes |
| **Santander** | Sim, portal + gerente [C] | Boleto, Pix, pagamento de contas, extrato [C] | n/c | Usa o certificado A1 da NF-e |
| **Sicoob** | Sim, portal [C] | Cobrança, Pix, conta corrente, pagamento de boletos [C] | Varia por cooperativa | Comum no interior [I] |
| **Sicredi** | Sim, portal + chamado [C] | Boleto híbrido, Pix [C] | Varia por cooperativa | |
| **BTG Empresas** | Sim, portal [C] | Boleto com QR, Pix, extrato [C] | Conforme plano | |
| **Cora** | Sim [C] | Boleto com QR [C]; extrato n/c | Boleto pago R$ 1,70 [C] | Sem suporte garantido à API |
| **Asaas** | Sim, cadastro online | Boleto com Pix, aviso de pagamento, pagamento de contas, **subcontas e divisão do recebimento** [C] | R$ 1,99 por boleto/Pix recebido [C] | Não é o banco do cliente: ele passa a receber no Asaas |
| **Efí** | Sim, cadastro online | Boleto/Pix, aviso de pagamento, divisão, Pix Automático [C] | Boleto R$ 3,45; Pix 1,19% [C] | Aceita pessoa física |
| **Iugu** | Sim, com plano | Boleto, Pix, Pix Automático [C] | Pix 0,99%, boleto R$ 2,19 + mensalidade [C] | |
| Caixa, Safra, Nubank PJ | Fraca ou não encontrada | | | Deixar por último |
| Stark Bank, Celcoin | Porte corporativo | | | Não é para o começo |

**Dois caminhos para um produto com vários clientes:**
1. **Banco do próprio cliente** (como o C6 hoje): sem taxa de intermediário, o dinheiro cai na conta dele; cada banco é uma integração nova e o cliente precisa pedir as chaves ao banco.
2. **Conta de pagamento com subcontas** (Asaas, Efí): o cliente começa em minutos, sem convênio; paga R$ 2 a 3,50 por boleto e o dinheiro passa por lá.

**O que é padrão e o que não é:** o Pix (cobrança, aviso de pagamento, recorrência) segue o padrão do Banco Central: muda só o certificado e o endereço. Boleto não tem padrão: cada banco é um adaptador. O nosso `mapa-c6.js` já isola os nomes de campo, o que facilita criar um mapa por banco.

**Pix Automático** (o inquilino autoriza uma vez e o aluguel é debitado todo mês) serve para aluguel; Inter, Efí, Iugu, BB e Sicredi oferecem por API [C]. Ponto a conferir: valor que muda todo mês (multa, IPTU, bonificação) contra o valor máximo autorizado [I].

**Ordem recomendada:** 1) Inter; 2) Asaas (ou Efí); 3) Sicoob e Sicredi; 4) Banco do Brasil ou Itaú (ou um intermediário como a TecnoSpeed para os grandes bancos).

## 3. O que o mercado já tem

| Sistema | Para quem | Preço (aprox.) | Fraqueza citada |
|---|---|---|---|
| Superlógica Imobi | Imobiliária média/grande | a partir de R$ 229/mês | Suporte lento, falhas (Reclame Aqui) |
| Imobzi | Imobiliária pequena/média | a partir de R$ 129/mês | Suporte |
| Loft (ex-Vista) | Imobiliárias | CRM R$ 129,90; locação por % do aluguel | Sem aplicativo |
| Jetimob | Imobiliária pequena/média | sob consulta (planos de 50/250/750 contratos) | Preço fechado, extras pagos; NFS-e "em breve" |
| Kenlo | Imobiliária média/grande | sob consulta | Caro, suporte demorado |
| Imoview | Imobiliárias e donos de imóveis | não publicado | Porte alto |
| Group Software | 100+ contratos | não publicado | |
| **Alugo** | Proprietário e pequena imobiliária | R$ 39,90 (1 imóvel) · R$ 129,90 (30) · R$ 199,90 (100) + taxa por aluguel | Sem NF, nada para empresa, dinheiro passa por eles |
| Rentos | Proprietário pessoa física | por uso | Sem boleto bancário confirmado |
| QuintoAndar | Serviço completo | até 9,3% do aluguel | Não é sistema |

**Todo concorrente tem (obrigatório para competir):** boleto e Pix com baixa automática · reajuste por índice · régua de cobrança por e-mail e WhatsApp · contrato com assinatura eletrônica · portal ou aplicativo do inquilino · DIMOB e informe de rendimentos · vistoria · vários usuários na nuvem · (para imobiliária) repasse ao proprietário.

**Diferenciais hoje no mercado:** garantia própria, repasse instantâneo, inteligência artificial no contrato, conciliação bancária de verdade, NFS-e de locação, seguro integrado, antecipação de aluguel.

## 4. Nós contra o mercado

| Item | Nós hoje | Mercado |
|---|---|---|
| Boleto com Pix | Sim (C6, aguardando chaves) | Sim |
| Baixa automática do pagamento | Propõe e o usuário confirma | Automática |
| Reajuste por índice, carta | Sim | Sim |
| Régua de cobrança | Só aviso para nós | E-mail/WhatsApp automáticos |
| Contrato por modelo, aditivos, vistoria | Sim, completo | Sim |
| Assinatura eletrônica | Não (anexa o assinado) | Sim |
| Portal do inquilino | Não | Sim |
| NF de locação por empresa, com percentual | **Sim** | Raro |
| Impostos por empresa | **Sim** | Raro |
| Extrato, destino de cada movimentação, comprovantes, pagamentos com aprovação | **Sim** | Raro (conciliação é diferencial) |
| Funciona sem internet | **Sim** | Ninguém |
| Ficha em análise, rotina de entrada e saída, cálculo final com caução corrigida | **Sim**, detalhado | Parcial |
| DIMOB / informe | Declaração anual do inquilino | Sim |
| Repasse a proprietário terceiro | Não (só ANK→JCK) | Sim (imobiliárias) |
| Vários clientes | Não | Sim |

### Pontos fortes
1. Regras de locação profundas e testadas (460 testes): proporcional, bonificação, caução e complemento, troca de titular, acordo, cálculo final.
2. Locador empresa: NF, divisão entre empresas, impostos, comprovantes para o contador.
3. Banco de verdade: extrato, conciliação, pagamentos com dupla aprovação.
4. Funciona sem internet e como aplicativo instalado.
5. Custo de servidor quase zero (Cloudflare) e segurança já auditada.

### Gargalos
1. **Um cliente só.** Um cofre, quatro e-mails na lista de entrada, nomes ANK/JCK e "ANK Administradora" espalhados. É o maior trabalho. A boa notícia: o cofre na nuvem já é uma unidade isolada; dá para criar um por cliente.
2. **Regras do dono fixas no código** (reajuste no 13º mês, bonificação, reserva, multa/juros, régua de 1/10/30 dias). Para vender, viram configurações por cliente.
3. **Ponte do banco no computador do usuário.** Cliente comum não instala programa: a ponte precisa ir para a nuvem, guardando as chaves de cada cliente com segurança.
4. **Tudo carregado na memória do navegador.** Bom até umas centenas de imóveis por cliente (medido: gravação em ~90 ms com 5 anos de dados). Para o nicho de 5 a 200 imóveis não é problema; para imobiliária grande seria.
5. **As regras rodam no navegador;** o servidor confere quem pode gravar, mas não refaz as contas. Com clientes desconhecidos, as contas críticas (número da NF, pagamento) precisam ser conferidas também no servidor.
6. **Falta o básico de comunicação:** envio automático de e-mail, WhatsApp, portal do inquilino, assinatura eletrônica, baixa automática.
7. **Operação de produto:** cadastro e cobrança da assinatura, importação dos dados do cliente novo, suporte, termos de uso e LGPD (seremos operadores de dados de terceiros), monitoramento.
8. **Equipe:** hoje o sistema depende de uma pessoa. Suporte é a queixa nº 1 contra os concorrentes: é oportunidade e também risco.

## 5. O que é e o que não é necessário

**Necessário:**
- Vários clientes separados (um cofre por cliente, cadastro, login próprio).
- Configurações no lugar das regras fixas.
- Ponte do banco na nuvem + segundo meio de cobrança (Inter e/ou Asaas).
- E-mail automático (boleto do mês, régua, etapas de entrada e saída) e baixa automática.
- NFS-e nacional e CBS/IBS de 2027 (já na fila, ver memória do projeto).
- Termos de uso, política de privacidade, contrato de tratamento de dados.
- Importação de planilha para o cliente novo.

**Não é necessário (agora):**
- Reescrever em outra linguagem ou trocar o banco de dados.
- Aplicativo de loja (o instalável atual basta).
- Integrar todos os bancos.
- Repasse a terceiros e DIMOB de imobiliária, se o alvo for o locador próprio.
- Garantia própria, antecipação de aluguel, CRM de vendas, anúncios em portais.

**Pode vir depois:** portal do inquilino, assinatura eletrônica (Clicksign, ZapSign, D4Sign: integração simples), WhatsApp, Pix Automático.

## 6. Enviar e-mail direto do sistema: viabilidade

| Caminho | Como é | Esforço | Custo |
|---|---|---|---|
| **1. Copiar / abrir no Gmail** | O sistema monta assunto e texto; você cola ou o Gmail abre preenchido; anexo à mão | Pequeno (é o que entra agora) | Zero |
| **2. Envio pelo nosso servidor** (serviço de e-mail ligado ao Worker, remetente `@ankjck.com.br`) | Botão "Enviar": vai com o PDF anexado (contrato, boleto, carta), fica registrado no histórico do inquilino; respostas chegam na caixa normal | Médio: 2 a 3 PRs + 3 registros no DNS (que já está no Cloudflare) | Em geral grátis até alguns milhares por mês (conferir o plano do serviço escolhido) |
| **3. Pela conta do Gmail (API do Google)** | Sai da própria caixa e aparece em "Enviados" | Médio a alto: projeto no Google Cloud e autorização por usuário | Zero |

**Recomendação:** caminho 2, com cópia oculta para a caixa da empresa (assim fica guardado no Gmail também). Não é complicado: a parte da nuvem já existe. Só funciona com internet; sem internet o e-mail fica na fila, como as outras mudanças. O mesmo motor serve depois para o envio **automático** (boleto do mês, lembrete da régua, carta de reajuste), que é o que os concorrentes têm.

## 7. Caminho sugerido

| Fase | O que | Serve para nós hoje? |
|---|---|---|
| **0** | Modelos de e-mail por etapa → envio direto → régua e boleto do mês automáticos → baixa automática → NFS-e nacional/CBS 2027 | Sim, tudo |
| **1** | Regras viram configurações; vários clientes (um cofre por cliente, cadastro, login); ponte na nuvem; Inter e Asaas | Parcial |
| **2** | Piloto com 2 ou 3 locadores conhecidos: importação, suporte, termos/LGPD, cobrança da assinatura | Não |
| **3** | Portal do inquilino, assinatura eletrônica, DIMOB/informe, Pix Automático, WhatsApp | Parcial |

Referência de preço para o nicho: Alugo cobra R$ 129,90 (30 imóveis) e R$ 199,90 (100) mais taxa por aluguel; Imobzi a partir de R$ 129; Superlógica a partir de R$ 229. Um preço público e sem taxa por aluguel já seria diferencial.

## 8. Pontos a confirmar
- Com o contador: obrigatoriedade e data da NFS-e nacional para locadora de imóvel próprio (fontes divergem: 01/12/2026, 01/01/2027; a Prefeitura de SP diz que não exige NFS-e municipal para o que não é serviço).
- Tarifas e contratação de cada banco (a maior parte veio de manuais de terceiros).
- Número de imobiliárias (~70 mil, sem fonte primária) e tamanho real do nicho de locadores com carteira própria.

## Fontes principais
Inter: developers.inter.co · BB: developers.bb.com.br · Santander: santander.com.br/empresas/cash/api · Sicredi: sicredi.com.br/site/pixpj/api-pix · BTG: developer.btgmaisbusiness.com · Cora: cora.com.br/termos-e-condicoes-de-apis · Asaas: asaas.com/precos-e-taxas, docs.asaas.com · Efí: sejaefi.com.br/tarifas, dev.efipay.com.br · Stark: docs.starkbank.com · Pluggy: docs.pluggy.ai · Bacen: guia do Pix Automático · manuais de integração da Omie e da CIGAM (Itaú, Bradesco, BB, Santander, BTG) · jetimob.com/planos · usealugo.com.br/planos · loft.com.br/para-imobiliarias/adm-imoveis · universalsoftware.com.br · groupsoftware.com.br · b2bstack.com.br (Superlógica, Imobzi, Rentos) · reclameaqui.com.br (Superlógica) · prefeitura.sp.gov.br (SC 09/2026) · LC 214/2025.
