# O que ainda falta no sistema (e como fazer)

Situação em 14/11/2026. Tudo o que foi feito até hoje já está no ar (PRs #232 a #236 aceitas, Cloudflare publicou sem erro e `ficha.ankjck.com.br` responde).

Marque com `[x]` o que for concluindo.

**Como usar (para o Claude, depois de um /clear):** o dono vai responder item por item, na ordem da tabela. A cada resposta: anote aqui o que ele decidiu (com a data), marque `[x]` no que foi concluído, leve a decisão de regra de negócio para `DECISOES.md` e, se virar mudança no sistema, confirme antes com um exemplo em reais e datas.

## Resumo

| # | O que falta | Quem faz | Tempo |
|---|---|---|---|
| 1 | Envio de e-mail pelo Gmail (o "Enviar agora" e os avisos por e-mail dependem dele) | você, no Google e no Cloudflare | 30 min |
| 2 | Aviso no celular (ficha pela internet) | você, no Cloudflare | 10 min |
| 3 | Teste da ficha pela internet com uma pessoa de verdade | você + um conhecido | 20 min |
| 4 | Conferências no celular (ícone, "Enviar agora", caução da troca) | você | 15 min |
| 5 | Banco C6 (boleto e extrato automáticos) | o C6 liberar as chaves | depende do C6 |
| 6 | Decisões que estão com você | você / contador | — |
| 7 | Aceitar a PR #231 (traz esta lista) | você | 1 min |
| 8 | Lembretes com data | você | — |
| 9 | Para conversar: programa no PC e pastas dos inquilinos sem o sistema | você + Claude | — |

---

## 1. Ligar o envio de e-mail pelo Gmail  `[ ]`

**Por que importa:** sem isto, o botão **Enviar agora** fica desligado (só "Copiar texto" e "Abrir no Gmail") e **os e-mails automáticos da ficha pela internet não saem** (para a pessoa: "recebemos seus dados", "falta documento", "pronta para assinar"; para a equipe: "chegou documento"). É o primeiro a fazer.

Leva uns 30 minutos, uma vez só. Precisa da conta Gmail da empresa, do computador com o projeto e do painel do Cloudflare. O passo a passo completo está em `LIGAR_GMAIL.md`; o resumo:

1. **Google Cloud** (<https://console.cloud.google.com>, entrando com a conta Gmail da empresa): Novo projeto `ERP Imoveis` → APIs e serviços → Biblioteca → **Gmail API** → Ativar.
2. **Tela de permissão OAuth**: tipo **Externo**, nome `ERP Imoveis`, e-mail da própria conta → em Público, **Publicar app** (se ficar em "Teste", para de funcionar em 7 dias).
3. **Credenciais** → Criar credenciais → **ID do cliente OAuth** → tipo **App para computador** → copie o **Client ID** e o **Client Secret**.
4. No computador, na pasta do projeto: `node tools/gmail-token.mjs` → cole os dois → o navegador abre: entre com a conta da empresa → "Avançado" → "Acessar ERP Imoveis" → **Permitir** → copie o **GMAIL_REFRESH_TOKEN** que aparece. (Não cole aqui no chat.)
5. **Remetente** `administracao@ankjck.com.br`: Gmail → Configurações → Contas e importação → **Enviar e-mail como** → adicionar, nome `Administradora`, confirmar pelo código que chega.
6. **SPF** (para não cair no spam): Cloudflare → `ankjck.com.br` → DNS → no TXT `v=spf1 ...` acrescente `include:_spf.google.com` antes do `~all` (nunca dois registros `v=spf1`).
7. **Cloudflare** → Workers & Pages → erp-boletos → Settings → Variables and secrets (quadro de cima) → Add, todos tipo **Secret**: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_REMETENTE` = `administracao@ankjck.com.br`, `GMAIL_NOME` = `Administradora` (e, se quiser cópia oculta de tudo, `GMAIL_CCO`) → Deploy.
8. **Teste:** abra uma ficha → botão de e-mail → **Enviar agora** para o seu próprio e-mail. Deve chegar com o PDF anexado e o remetente "Administradora".

Se quiser, faço os passos 1 a 3 e 5 a 7 junto com você no navegador (você entra na conta; eu não digito senhas).

---

## 2. Ligar o aviso no celular  `[ ]`

Quando alguém manda a ficha pelo link, a equipe recebe **e-mail** (depois do item 1). O aviso que aparece na tela do celular (como o do WhatsApp) ainda está desligado, porque precisa de duas "chaves" guardadas no Cloudflare.

**Passo a passo**
1. No computador, abra o PowerShell na pasta do projeto e rode:
   ```
   node tools/gerar-vapid.mjs | Out-File "$env:USERPROFILE\Documents\chaves-aviso.txt"
   ```
   Isso cria o arquivo `chaves-aviso.txt` em Documentos, com duas linhas: `VAPID_PUBLICA=...` e `VAPID_PRIVADA=...`. (Se preferir, peça para mim que eu gero o arquivo sem mostrar as chaves aqui.)
2. Entre em <https://dash.cloudflare.com> → **Workers & Pages** → **erp-boletos** → **Settings** → **Variables and secrets** (o quadro de cima, não o de "Build") → **Add**.
3. Cadastre três, todas do tipo **Secret** (tipo "Text" some na próxima publicação):

   | Nome | Valor |
   |---|---|
   | `VAPID_PUBLICA` | o texto depois de `VAPID_PUBLICA=` |
   | `VAPID_PRIVADA` | o texto depois de `VAPID_PRIVADA=` |
   | `VAPID_CONTATO` | `mailto:administracao@ankjck.com.br` |

4. Clique em **Deploy** (ou Save and deploy).
5. **Apague** o arquivo `chaves-aviso.txt` de Documentos (e da lixeira). A chave privada fica só no Cloudflare.
6. Em cada celular da equipe:
   - **iPhone** (iOS 16.4 ou mais novo): abra o sistema pelo **ícone na Tela de Início** (no Safari não funciona). Sem o ícone: Safari → `erp.ankjck.com.br` → Compartilhar → **Adicionar à Tela de Início**.
   - **Android**: pode ser pelo Chrome ou pelo aplicativo instalado.
   - Abra qualquer ficha em análise → em "🔔 Receber aviso neste aparelho…" toque em **Ligar** → **Permitir**.
7. Para testar: gere um link de uma ficha de teste (item 3) e mande um documento por ele. O celular deve tocar em até 1 minuto. Tocando no aviso, abre a ficha.

**Se der errado**
- "As notificações deste site estão bloqueadas": no celular, Ajustes → Notificações → Imóveis (iPhone) ou Chrome → Configurações do site → Notificações (Android) e libere.
- Se um dia trocar as chaves, cada celular aparece como "desligado": é só tocar em **Ligar** de novo.

---

## 3. Testar a ficha pela internet com uma pessoa de verdade  `[ ]`

Foi testado no computador, numa cópia do sistema. Falta um teste completo no endereço real e num celular de outra pessoa.

**Passo a passo (com um conhecido, ficha de teste)**
1. No sistema: **Fichas** → **Nova ficha** → nome do conhecido, telefone com WhatsApp, e-mail, imóvel vago qualquer, e marque a reserva (pode ser R$ 1,00, só para o teste).
2. Na página da ficha, caixa **Ficha pela internet** → **Gerar link** (o link vale 7 dias).
3. **Copiar / WhatsApp** → manda o texto pronto para o conhecido.
4. Peça para ele, no celular dele:
   - abrir o link (`ficha.ankjck.com.br/...`), preencher alguns campos e mandar;
   - enviar 1 ou 2 documentos (foto ou PDF);
   - baixar a ficha em PDF, assinar no gov.br (<https://assinador.iti.br>) e mandar de volta pelo mesmo link.
5. Confira que chegou o e-mail para a equipe (e o aviso no celular, se o item 1 já estiver feito).
6. Na ficha, confira:
   - os documentos aparecem com a marca da conferência (ex.: "assinado pelo gov.br" ou "⚠ possível montagem");
   - **Trazer para a ficha** abre uma janela: escolha os dados que entram e marque os documentos recebidos;
   - **Pedir o que falta** e **Mandar a ficha para assinar** mandam e-mail para a pessoa;
   - **Lembrar** gera o texto de lembrete no WhatsApp;
   - **Encerrar o link** faz o link parar de aceitar envios.
7. No fim, marque a ficha como "Desistiu" ou exclua, para não ficar no Painel.

Ponto que ainda não testei na tela depois das últimas correções: a janela do **Trazer para a ficha**. Se algo estranho aparecer, me mande um print.

---

## 4. Conferências rápidas no celular  `[ ]`

Coisas que funcionaram no computador mas não foram vistas num celular de verdade:

1. **Ícone do aplicativo** (PR #193): em **Empresas**, enquadre a logo e grave. No iPhone, apague o ícone da Tela de Início e adicione de novo para pegar o novo.
2. **"Enviar agora" com anexos** (recibos e e-mails por etapa, PR #204; depois do item 1): abra uma ficha ou contrato → botão de e-mail → **Enviar agora** para o seu próprio e-mail. Confira se chegou com o PDF anexado e com o remetente "Administradora".
3. **Caução na troca de titular** (PR #210): abra o **Painel** uma vez (ele corrige as trocas antigas sozinho) e depois confira cada contrato que teve troca de titular. Se a data paga da caução estiver errada, use **✎ corrigir data**.

---

## 5. Banco C6 (boleto e extrato automáticos)  `[ ]`

**Situação:** o sistema já está pronto para emitir boleto no C6, puxar o extrato e propor pagamentos. Falta o C6 liberar as chaves da API. A "ponte" (programa que fala com o banco) ainda não está instalada em computador nenhum. Ela só é instalada quando as chaves chegarem.

**O que fazer agora**
1. Cobrar o C6 **por escrito** (chat do C6 Empresas ou o gerente): "Preciso das credenciais da API de boletos (Bolepix) como Cliente Final, para sistema próprio". **14/11:** e-mail pronto em `EMAIL_C6_CREDENCIAIS.md` (todos os módulos, as duas empresas), para enviar a `homologacaoapi@c6bank.com` do e-mail de cadastro de cada empresa.
2. **Não** escolha um "Parceiro" de outra empresa na tela "Integrações via API" do Web Banking: daria acesso a um terceiro.
3. Quando o C6 mandar o ClientId, o ClientSecret e a pasta do certificado, me chame. A instalação segue `documentacao/LIGAR_C6.md`. **Nunca cole essas chaves no chat.**

**Decisão que fica para esse dia:** a descrição do boleto no C6 corta em 100 caracteres e as instruções em 4 linhas de 80. Diga se o corte automático serve.

---

## 6. Decisões que estão com você  `[ ]`

| Assunto | O que decidir | Quando |
|---|---|---|
| **D5, informe do IR** (pendente com o contador em 14/11) | Perguntar ao contador se o informe anual separa IPTU, seguro, multa e juros, mês a mês. Hoje mostra só o aluguel. **14/11:** mensagem de WhatsApp para o contador montada (junto com a DIMOB e a data do informe); aguardando a resposta. | já |
| **DIMOB** (pendente com o contador em 14/11) | Confirmar com o contador a entrega da DIMOB (empresa com patrimônio próprio pode ser obrigada). | já |
| ~~**Feriados sem banco**~~ | **Decidido em 14/11:** Carnaval e Corpus Christi contam como dia sem banco (o sistema já fazia assim). | feito |
| **Prazos da conferência do banco** | Confirmar os prazos de 45 dias e de 7 dias usados na conferência do extrato. | quando o C6 entrar |
| ~~**Pasta do OneDrive**~~ | **Decidido em 14/11:** aposentada (não é mais usada; backup seguro no disco C, copiado todo dia para o HD externo). Guardar uma última cópia no HD externo e apagar do OneDrive (e da lixeira do OneDrive). | feito |
| **CBS 2027** (aguardando desde 14/11; **retomar em 16/12/2026**) | O imposto novo substitui o PIS/COFINS em 2027. Exemplo: aluguel residencial de R$ 3.000,00 paga cerca de R$ 81,00 (hoje R$ 109,50). Antes de mudar a aba Impostos: alíquota final do Senado (até 15/12/2026); com o contador, se algum contrato antigo fica nos 3,65%; e se o aluguel passa a ser "valor + CBS". | depois de **15/12/2026** |
| **NF pelo governo (2027)** | Quando o governo definir o sistema da NF, ela passa a sair ao identificar o pagamento no extrato. | quando sair a regra |
| **Revisão jurídica** | Itens B3 a B6 do fluxo (ver `REVISAO_JURIDICA_CONTRATO.md`). **15/11:** B3 (convite e presença na vistoria de saída), B4 (termo de devolução das chaves) e B6 feitos. **B5:** falta confirmar a versão sem a escolha "consertar ele mesmo" depois da devolução das chaves (valor de cada pendência com orçamento, descontado da garantia ou cobrado). | quando puder |
| ~~**Nome do botão**~~ | **Decidido em 14/11:** "Corrigir caução" é o termo certo para pedir o dinheiro que completa a caução depois do aluguel corrigido. Fica como está. | feito |

---

## 7. Aceitar a PR #231  `[x]` (aceita em 14/11)

É só documentação (o aviso de NF dos boletos do mês e esta lista de pendências). O conflito com a `main` foi resolvido em 14/11. Pode aceitar: <https://github.com/juliocpfh/erp-boletos/pull/231>

---

## 8. Lembretes com data

- **08/11/2027**: vence a chave do atualizador do PC (`atualizador-pc`). O Cloudflare manda e-mail antes. Para renovar: Zero Trust → Access controls → **Service credentials** → `atualizador-pc` → **Refresh**.
- **15/12/2026**: prazo do Senado para a alíquota final da CBS. **Em 16/12/2026** retomar o item CBS 2027 (item 6): conferir a alíquota aprovada e falar com o contador antes de mudar a aba Impostos.

---

## 9. Para conversar (pedidos do dono em 14/11)  `[ ]`

1. **Programa de verdade no PC.** Hoje a "versão PC" é um arquivo HTML guardado na pasta do backup seguro, só para emergência (site fora do ar). O dono quer **um programa mesmo** (instalado, com ícone, abrindo como aplicativo do Windows). Conversar: o que ele espera do programa (funcionar sem internet o tempo todo? só abrir mais fácil?), se basta o aplicativo instalado pelo Chrome/Edge ("Instalar aplicativo", já existe) ou se precisa de um instalador próprio (ex.: Electron/Tauri), e como ficam os dados (nuvem ou no computador).
2. **Dados dos inquilinos em pastas, acessíveis sem o sistema.** O dono quer abrir os documentos de cada inquilino direto numa pasta do computador, sem precisar do sistema. Hoje os anexos ficam na nuvem (Cloudflare) e o backup seguro do disco C é **cifrado** (só abre com a senha, pelo sistema). Conversar: uma cópia **não cifrada** dos anexos, organizada por imóvel → inquilino (como era no OneDrive), atualizada sozinha no computador do escritório; com a planilha/PDF dos dados de cada um junto? Cuidado: pasta aberta = quem tiver o computador vê CPFs e documentos (BitLocker e HD externo guardado).

## Ficou de fora de propósito (não é defeito)

- "Movimentações sem destino" em Financeiro e Banco: fica como está até o C6 entrar em uso.
- Fechar o mês travando alterações, foto pela câmera e canal do inquilino: descartados ou adiados por você em 07/11.
- Régua de cobrança personalizada e contato automático: pedido para o futuro.
