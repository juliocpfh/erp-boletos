# O que ainda falta no sistema (e como fazer)

Situação em 17/11/2026. Tudo o que foi feito até hoje está no ar (até a PR #296, mutirão 3000).

Marque com `[x]` o que for concluindo.

**Como usar (para o Claude, depois de um /clear):** o dono vai responder item por item, na ordem da tabela. A cada resposta: anote aqui o que ele decidiu (com a data), marque `[x]` no que foi concluído, leve a decisão de regra de negócio para `DECISOES.md` e, se virar mudança no sistema, confirme antes com um exemplo em reais e datas.

## Resumo

| # | O que falta | Quem faz | Tempo |
|---|---|---|---|
| 1 | Envio de e-mail pelo Gmail (o "Enviar agora" e os avisos por e-mail dependem dele): o botão **Conectar o Gmail** está pronto (17/11); falta você ligar | você, no Google e no Cloudflare | 30 min |
| ~~2~~ | ~~Aviso no celular (ficha pela internet)~~ **concluído em 17/11** | — | — |
| 3 | Teste da ficha pela internet com uma pessoa de verdade | você + um conhecido | 20 min |
| 4 | Conferências no celular: falta só o "Enviar agora" (depois do Gmail); ícone e caução da troca conferidos em 15/11 | você | 5 min |
| 5 | Banco C6 (boleto e extrato automáticos) | o C6 liberar as chaves | depende do C6 |
| 6 | Decisões que estão com você | você / contador | — |
| 7 | Aceitar a PR #231 (traz esta lista) | você | 1 min |
| 8 | Lembretes com data | você | — |
| ~~9~~ | ~~Programa no PC~~ **concluído em 17/11** (instalado em 16/11; chave antiga apagada em 17/11, item 9e) | — | — |
| 11 | Mutirão de 16/11: conferências e regra de limite feitas em 16/11; a 2ª rodada entrou no mutirão 3000 (item 13) | Claude | — |
| 13 | Mutirão 3000 (16–17/11): 366 erros confirmados, correções nas PRs #267–#283; conferências e decisões suas no item 13 | você + Claude | 20 min |

**Próximos passos (atualizado em 17/11):** já feitos: o aviso no celular (item 2), a limpeza da chave antiga do PC (item 9e) e o botão **Conectar o Gmail** (item 1, feito pelo Claude). Agora: (1) aceitar a PR do botão do Gmail e **ligar o Gmail** (item 1, passo a passo em `LIGAR_GMAIL.md`; posso fazer junto com você no navegador); (2) conferir o **Enviar agora** com anexos (item 4); (3) item 3, teste da ficha com um conhecido; (4) conferências do mutirão 3000 (item 13). Em 16/12: CBS 2027.

---

## 1. Ligar o envio de e-mail pelo Gmail  `[ ]`

**Decisão do dono em 16/11: "Entrar com o Google".** **Feito em 17/11 (Claude):** o botão **Conectar o Gmail** em **Dados e backup → E-mail pelo Gmail** (só administrador): **Conectar o Gmail → escolher a conta → Permitir**, como em qualquer site. A nuvem guarda a autorização cifrada (nunca no banco nem no navegador), renova sozinha, mostra a conta ligada e tem **Desconectar**. Não precisa mais rodar nada no computador nem colar código no Cloudflare. É o mesmo caminho do produto para vender (cada cliente só clica; ver `ESTUDO_PRODUTO_COMERCIAL.md`, seção 6). **Falta você** (com o Claude junto no navegador, se quiser). **Não cadastrar cartão** no Google Cloud: o "teste gratuito"/faturamento que ele oferece não é preciso, a Gmail API é gratuita. Descartado por ora: mandar pelo serviço do produto com o endereço do cliente ("alias": só com domínio próprio e linhas no DNS).

**Por que importa:** sem isto, o botão **Enviar agora** fica desligado (só "Copiar texto" e "Abrir no Gmail") e **os e-mails automáticos da ficha pela internet não saem** (para a pessoa: "recebemos seus dados", "falta documento", "pronta para assinar"; para a equipe: "chegou documento"). É o primeiro a fazer.

Leva uns 30 minutos, uma vez só, no computador. Precisa da conta Gmail da empresa e do painel do Cloudflare. O passo a passo completo está em `LIGAR_GMAIL.md`; o resumo:

1. **Google Cloud** (<https://console.cloud.google.com>, entrando com a conta Gmail da empresa): Novo projeto `ERP Imoveis` → APIs e serviços → Biblioteca → **Gmail API** → Ativar.
2. **Tela de permissão OAuth**: tipo **Externo**, nome `ERP Imoveis`, e-mail da própria conta → em Público, **Publicar app** (se ficar em "Teste", para de funcionar em 7 dias).
3. **Credenciais** → Criar credenciais → **ID do cliente OAuth** → tipo **Aplicativo da Web** → em "URIs de redirecionamento autorizados" cole `https://erp.ankjck.com.br/api/email/google/retorno` (o sistema mostra este endereço, com botão Copiar, em Dados e backup → E-mail pelo Gmail) → copie o **Client ID** e o **Client Secret**. (Não cole aqui no chat.)
4. **Cloudflare** → Workers & Pages → erp-boletos → Settings → Variables and secrets (quadro de cima) → Add, tipo **Secret**: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REMETENTE` = `administracao@ankjck.com.br`, `GMAIL_NOME` = `Administradora` (e, se quiser cópia oculta de tudo, `GMAIL_CCO`) → Deploy.
5. **Remetente** `administracao@ankjck.com.br`: Gmail → Configurações → Contas e importação → **Enviar e-mail como** → adicionar, nome `Administradora`, confirmar pelo código que chega.
6. **SPF** (para não cair no spam): Cloudflare → `ankjck.com.br` → DNS → no TXT `v=spf1 ...` acrescente `include:_spf.google.com` antes do `~all` (nunca dois registros `v=spf1`).
7. **No sistema** (no computador, no Chrome): Dados e backup → E-mail pelo Gmail → **Conectar o Gmail** → escolha a conta da empresa → "Avançado" → "Acessar ERP Imoveis" → marque a permissão de enviar e-mail → **Permitir**. Volta sozinho para o sistema com "Gmail conectado" e a caixa mostra "Ligado: os e-mails saem pela conta …".
8. **Teste:** abra uma ficha → botão de e-mail → **Enviar agora** para o seu próprio e-mail. Deve chegar com o PDF anexado e o remetente "Administradora".

Se quiser, faço os passos 1 a 3 e 5 a 7 junto com você no navegador (você entra na conta; eu não digito senhas).

---

## 2. Ligar o aviso no celular  `[x]` (conferido pelo dono em 17/11)

**17/11, conferido pelo dono:** aplicativo instalado de verdade no S23 (Chrome → Instalar aplicativo), **Desligar → Ligar** e o aviso de um documento mandado por link de teste tocou. O histórico abaixo fica só como registro.

**16/11:** chaves cadastradas no Cloudflare e aviso ligado no celular do dono (Samsung S23 Ultra, Android; passos 1 a 6). PR #263 (aceita) corrigiu a ficha; mesmo assim **nada tocou** (nem dados, nem documento, nem desistência): o envio do aviso falha em silêncio. PR #264: a nuvem limpa as chaves (espaço, quebra de linha, "NOME=" colados juntos, suspeita principal) e o botão **Testar o aviso** diz na tela onde está o erro. **16/11, depois da #264: o "Testar o aviso" funcionou** (as chaves coladas eram o defeito). Na mesma PR seguinte: o aviso mostra a logo escolhida em Empresas e, na barra de cima do Android, uma casinha (o Android só aceita silhueta de uma cor: figura colorida vira quadrado branco). **Falta o dono:** instalar como aplicativo de verdade (Chrome → ⋮ → **Instalar aplicativo**, não "Adicionar à tela inicial"), abrir pelo ícone e, numa ficha, **Desligar** → **Ligar**: assim o aviso sai com o nome do sistema (não o endereço do site) e, ao tocar, abre o aplicativo (não o navegador); depois mandar um documento por um link de teste e ver se toca. Antes: no celular, fechar e abrir o aplicativo → ficha → **Desligar neste aparelho** → **Ligar** → **Testar o aviso** → mandar ao Claude a mensagem que aparece. Conferir também no S23: Configurações → Aplicativos → o aplicativo (ou o Chrome) → Notificações ligadas e Bateria "Sem restrições"; Bateria → Limites de uso em segundo plano: fora de "Apps em suspensão". Histórico: No teste o celular não tocou: a ficha nova herdou o arquivo de uma ficha de teste antiga com o mesmo número, e o aviso só toca no primeiro documento; na mesma hora o "Documento inválido" barrava o documento com foto e a renda. Os dois foram corrigidos na PR "Ficha pela internet: documentos aceitos e link sem herança". **Falta (depois do merge):** apagar `Documentos\chaves-aviso.txt` (e da lixeira), se ainda não apagou; gerar um link novo numa ficha de teste, mandar um documento e conferir se o celular toca.

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

1. [x] **Ícone do aplicativo** (conferido pelo dono em 15/11: deu certo) (PR #193): em **Empresas**, enquadre a logo e grave. No iPhone, apague o ícone da Tela de Início e adicione de novo para pegar o novo.
2. [ ] **"Enviar agora" com anexos** (recibos e e-mails por etapa, PR #204; depois do item 1): abra uma ficha ou contrato → botão de e-mail → **Enviar agora** para o seu próprio e-mail. Confira se chegou com o PDF anexado e com o remetente "Administradora".
3. [x] **Caução na troca de titular** (conferido pelo dono em 15/11: deu certo) (PR #210): abra o **Painel** uma vez (ele corrige as trocas antigas sozinho) e depois confira cada contrato que teve troca de titular. Se a data paga da caução estiver errada, use **✎ corrigir data**.

---

## 5. Banco C6 (boleto e extrato automáticos)  `[ ]`

**Situação:** o sistema já está pronto para emitir boleto no C6, puxar o extrato e propor pagamentos. Falta o C6 liberar as chaves da API. A "ponte" (programa que fala com o banco) ainda não está instalada em computador nenhum. Ela só é instalada quando as chaves chegarem.

**O que fazer agora**
1. Cobrar o C6 **por escrito** (chat do C6 Empresas ou o gerente): "Preciso das credenciais da API de boletos (Bolepix) como Cliente Final, para sistema próprio". **14/11:** e-mail pronto em `EMAIL_C6_CREDENCIAIS.md` (todos os módulos, as duas empresas), para enviar a `homologacaoapi@c6bank.com` do e-mail de cadastro de cada empresa.
2. **Não** escolha um "Parceiro" de outra empresa na tela "Integrações via API" do Web Banking: daria acesso a um terceiro.
3. Quando o C6 mandar o ClientId, o ClientSecret e a pasta do certificado, me chame. A instalação segue `documentacao/LIGAR_C6.md`. **Nunca cole essas chaves no chat.**

**Ao instalar a ponte (desde o mutirão 3000, PR #280):** no `.env` da ponte, `ORIGENS=https://erp.ankjck.com.br`; se usar o Tunnel do Cloudflare, também `HOSTS=banco.ankjck.com.br` (sem isso a ponte recusa o Tunnel e o webhook). A ponte não sobe com a senha do exemplo: escolha uma frase própria com 20+ caracteres. Numa conta de produção, boleto com desconto só sai depois de marcar "Conferi o desconto no boleto de teste (sandbox)" (o C6 tem o tipo de desconto "por dia", que daria desconto demais).

**Decisão que fica para esse dia:** a descrição do boleto no C6 corta em 100 caracteres e as instruções em 4 linhas de 80. Diga se o corte automático serve.

---

## 6. Decisões que estão com você  `[ ]`

| Assunto | O que decidir | Quando |
|---|---|---|
| **D5, informe do IR** (pendente com o contador em 14/11) | Perguntar ao contador se o informe anual separa IPTU, seguro, multa e juros, mês a mês. Hoje mostra só o aluguel. **15/11:** mensagem enviada ao contador (junto com a DIMOB e a data do informe); aguardando a resposta. | já |
| **DIMOB** (pendente com o contador em 14/11) | Confirmar com o contador a entrega da DIMOB (empresa com patrimônio próprio pode ser obrigada). | já |
| ~~**Feriados sem banco**~~ | **Decidido em 14/11:** Carnaval e Corpus Christi contam como dia sem banco (o sistema já fazia assim). | feito |
| **Prazos da conferência do banco** | Confirmar os prazos de 45 dias e de 7 dias usados na conferência do extrato. | quando o C6 entrar |
| ~~**Pasta do OneDrive**~~ | **Decidido em 14/11:** aposentada (não é mais usada; backup seguro no disco C, copiado todo dia para o HD externo). Guardar uma última cópia no HD externo e apagar do OneDrive (e da lixeira do OneDrive). | feito |
| **CBS 2027** (aguardando desde 14/11; **retomar em 16/12/2026**) | O imposto novo substitui o PIS/COFINS em 2027. Exemplo: aluguel residencial de R$ 3.000,00 paga cerca de R$ 81,00 (hoje R$ 109,50). Antes de mudar a aba Impostos: alíquota final do Senado (até 15/12/2026); com o contador, se algum contrato antigo fica nos 3,65%; e se o aluguel passa a ser "valor + CBS". | depois de **15/12/2026** |
| **NF pelo governo (2027)** | Quando o governo definir o sistema da NF, ela passa a sair ao identificar o pagamento no extrato. | quando sair a regra |
| **Revisão jurídica** | Itens B3 a B6 do fluxo (ver `REVISAO_JURIDICA_CONTRATO.md`). **15/11:** B3, B4, B5 e B6 feitos (B5 sem a escolha "consertar ele mesmo" depois da devolução das chaves). Itens B da revisão jurídica concluídos. | feito |
| ~~**Nome do botão**~~ | **Decidido em 14/11:** "Corrigir caução" é o termo certo para pedir o dinheiro que completa a caução depois do aluguel corrigido. Fica como está. | feito |

---

## 7. Aceitar a PR #231  `[x]` (aceita em 14/11)

É só documentação (o aviso de NF dos boletos do mês e esta lista de pendências). O conflito com a `main` foi resolvido em 14/11. Pode aceitar: <https://github.com/juliocpfh/erp-boletos/pull/231>

---

## 8. Lembretes com data

- ~~**08/11/2027**: vence a chave do atualizador do PC (`atualizador-pc`)~~ **Não vale mais (17/11):** a chave foi apagada no Cloudflare (item 9e, passo 3); o computador entra com o crachá. Se o Cloudflare mandar e-mail sobre ela, pode ignorar.
- **15/12/2026**: prazo do Senado para a alíquota final da CBS. **Em 16/12/2026** retomar o item CBS 2027 (item 6): conferir a alíquota aprovada e falar com o contador antes de mudar a aba Impostos.

---

## 9. Programa no PC e pastas dos inquilinos (pedidos do dono em 14/11)  `[x]` (concluído em 17/11)

**Explicado em 15/11** (pedido do dono: clicar num ícone, abrir o sistema e ver no Windows, em pastas, os documentos e comprovantes de cada inquilino, atualizados sozinhos com a nuvem).

**Onde estão as coisas hoje:**
- **Dados e arquivos:** na nuvem (Cloudflare). Os arquivos já ficam lá organizados por imóvel → Inquilinos → nome da pessoa, como era no OneDrive.
- **No computador:** só a pasta do **backup seguro** (no disco C, a que foi escolhida em Dados e backup → Backup seguro). Lá dentro: `copias-diarias/` (o banco de cada dia), `semanal/` (banco + anexos, uma vez por semana) e `programa/` (a "versão PC", `administracao-imoveis.html`). **Tudo cifrado**: o Windows não abre, só o sistema com a senha do backup. Por isso a versão PC não parece um programa: ela é só a reserva para o dia em que o site cair.
- **Quem atualiza essa pasta:** o próprio sistema, quando está aberto no computador, e o **atualizador do PC** (`atualizador-pc`, Agendador do Windows, às 20h e ao entrar no Windows). Ele traz só os dados, cifrados; **não traz os arquivos dos inquilinos**.

**Proposta (para fazer na sequência):**
- [x] **9a. Ícone que abre o sistema** (instalado pelo dono em 15/11; você faz, não precisa programar): no Chrome, em `erp.ankjck.com.br`, menu ⋮ → **Transmitir, salvar e compartilhar → Instalar página como app** (no Edge: **Aplicativos → Instalar este site como aplicativo**). Fica um ícone na área de trabalho e na barra de tarefas; abre em janela própria e funciona mesmo com o site, o Cloudflare ou a internet fora do ar, com os dados da última vez que o sistema foi aberto naquele aparelho.
- [x] **9b. Cópia aberta dos arquivos no computador** (feito em 15/11): subpasta **`Arquivos dos imoveis`** dentro de `C:\Users\Julio\Imoveis` (a pasta do backup seguro), sem cifrar, como no sistema (imóvel → Inquilinos → pessoa). Abrir, imprimir e copiar à vontade; o que for posto ou mudado lá não vai para o sistema. Atualiza sozinha: (A) logo depois de anexar, apagar ou mover neste computador; (B) de hora em hora pelo atualizador do PC; (C) botão **Atualizar a pasta agora** em Dados e backup → Backup seguro. Decisões do dono: sem BitLocker (só ele usa o computador, com senha, e antivírus sempre atualizado); risco de exposição e LGPD aceitos.
  - **Feito em 15/11** (atualizador copiado, tarefa instalada; 1ª rodada: `arquivos=298`). Era: copiar os arquivos novos do atualizador para `C:\Users\Julio\Documents\Imoveis chave\atualizador-pc` (`atualizador.mjs`, `instalar-tarefa.cmd`, `desinstalar-tarefa.cmd`, `rodar-escondido.vbs`; o `.env` fica) e rodar `instalar-tarefa.cmd` **como administrador**. Posso fazer a cópia para você. Depois, conferir: aparece a pasta `Arquivos dos imoveis` e o `ultima-atualizacao.txt` termina com `arquivos=…`.
- [x] **9d. Anexo abre sem internet no computador** (15/11): sem internet, o sistema abre o arquivo da cópia aberta (pode ser a versão da última atualização da pasta). No celular continua precisando de internet.
- [x] **9c. Rotina "Arquivo impresso" (pasta física do inquilino)** (feito em 15/11; proposta aprovada em `PROPOSTA_ARQUIVO_IMPRESSO.md`, com as suas 12 respostas):
  - Liga e desliga em **Dados e backup → Regras do sistema** ("Arquivo impresso"); começa **ligada**. Lista de todos em **Dados e backup → Arquivo impresso**.
  - **Entrada:** última etapa "Montar a pasta física" (depois das outras). **Saída:** a etapa do roteiro vira "Montar a pasta física da saída", depois da devolução da garantia. **Durante:** aviso de documento novo (termo aditivo, carta de reajuste, termo de acordo assinado, notificação) e de arquivo trocado, no Painel (um alerta só) e no alto da página do inquilino.
  - Tela da pasta com caixinhas, **Ver a capa e imprimir tudo** (capa + documentos numa impressão só; depois "Saiu tudo certo?") e **Já está tudo em papel**. Fora da pasta: NF, comprovantes, boletos, WhatsApp, documentos de renda e Serasa, fotos da vistoria, apólices e e-mails.
  - **Troca de titular:** passo 1 com o que falta da pasta do anterior e a caixinha "Pus a pasta de fulano dentro".
  - **Falta você (depois do merge):** abrir **Dados e backup → Arquivo impresso** e, para cada inquilino, conferir a pasta de papel: o que já está nela, marque e use "Já está tudo em papel"; o que falta, "Ver a capa e imprimir tudo". Termo do acordo: no boleto do acordo, "Termo para assinar" gera o termo (inquilino, fiadores e 2 testemunhas assinam) e "anexar o termo assinado" guarda o assinado; enquanto faltar, o Painel avisa. Arquivo posto à mão na pasta do inquilino (ex.: notificação) aparece no Painel na abertura seguinte do sistema.
- [x] **9e. Programa do PC sem chave de serviço** (feito em 15/11, etapa 1 da proposta de licença; concluído pelo dono em 17/11): o computador entra com o **seu e-mail e senha do sistema** e recebe um "crachá" que só lê, guardado cifrado pelo Windows; aparece em **Usuários → Aparelhos ligados** com o botão **Desligar**. **Atenção (15/11, correção):** a conta da senha passou a ser feita no computador (o Cloudflare recusaria a conta no servidor), então só o programa novo entra: use o `.exe` desta versão ou os arquivos novos de `atualizador-pc/`; o programa antigo avisa "este programa do computador é antigo".
  1. [x] (feito em 16/11; teste deu a mensagem certa) No Cloudflare, criar a regra **Bypass** do caminho `erp.ankjck.com.br/api/aparelho` (passo a passo em `nuvem/README.md`, "Programa do PC: regra Bypass no Access"). Teste: abrir `https://erp.ankjck.com.br/api/aparelho/saude` sem login mostra "Este computador não está ligado ao sistema".
  2. Copiar para `C:\Users\Julio\Documents\Imoveis chave\atualizador-pc` os arquivos novos (`atualizador.mjs`, `ligar.mjs`, `ligar-computador.cmd`) e dar dois cliques em `ligar-computador.cmd`: abre uma página no navegador; e-mail, senha e a pasta (já vem preenchida) → **Ligar**.
  3. [x] (feito pelo dono em 17/11: `.env` apagado, chave de serviço `atualizador-pc`, política "Atualizador" e segredo `SERVICOS` apagados no Cloudflare; o lembrete de 08/11/2027 do item 8 deixa de valer) No dia seguinte, com `ok` em `ultima-atualizacao.txt`: apagar o `.env` dessa pasta e, no Cloudflare, a chave de serviço `atualizador-pc`, a política "Atualizador" e o segredo `SERVICOS` do Worker.
  - **Etapa 2: programa num arquivo só, sem instalar o Node** (feito em 15/11; falta você, depois do merge, ~5 min). Pode fazer no lugar do passo 2 acima (ou depois dele: o computador já ligado continua ligado):
    - [x] **Instalado pelo dono em 16/11** (`.exe`; 1ª rodada 16/11 13:04 UTC: `ok`, `arquivos=298`). Passo 3 acima feito em 17/11.
    1. Uns 10 minutos depois do merge, baixe `Instalar-Administracao-de-Imoveis.exe` em https://github.com/juliocpfh/erp-boletos/releases/tag/programa-pc (uns 90 MB; o GitHub gera sozinho).
    2. Dois cliques. No aviso azul "O Windows protegeu o computador" (o programa não tem assinatura, como combinado no item 11 da proposta): **Mais informações → Executar assim mesmo**. Se perguntar "Deseja permitir?", **Sim**.
    3. Ele cria as três tarefas (20h, ao entrar e de hora em hora, no lugar das antigas), liga o computador se ainda não estiver ligado (página do navegador: e-mail, senha, pasta) e faz a primeira atualização. Deve terminar com **Pronto**.
    4. Confira `ultima-atualizacao.txt` com `ok`. Depois de um dia certo, a pasta `Imoveis chave\atualizador-pc` e o Node podem ser apagados do computador.
    - Testado em 15/11 com o `.exe` de verdade: ajuda, versão, aviso de computador não ligado, atualização completa contra uma nuvem de teste (crachá cifrado pelo Windows) e a rodada sem janela. **Não testado** (não dava sem mexer no seu Windows): criar as tarefas de verdade, a pergunta "Deseja permitir?" e o aviso azul. Se algo falhar, a janela diz o quê; o jeito antigo (Node) continua funcionando.
    - Continua faltando: assinatura (antes do primeiro cliente de fora), o programa se atualizar sozinho e o link para baixar dentro do sistema.

## 10. Anexar a contra-vistoria de entrada  `[x]` (feito em 15/11)

**Pedido do dono em 15/11.** Lugar próprio para anexar a **contra-vistoria de entrada** (o que o inquilino encontrou de diferente da vistoria de entrada). Decisões do dono: vira etapa da entrada, logo abaixo de "Vistoria de entrada assinada", com prazo, e entra na pasta física.
- **Prazo:** 5 dias úteis da entrega das chaves (cláusula da vistoria). Ex.: chaves em 13/11/2026 → até 23/11/2026 (20/11 é feriado).
- **Na etapa:** data em que o inquilino mandou + arquivo (PDF, foto ou o e-mail salvo em PDF) → **Anexar**. Se ele avisar que não vai mandar, **Não houve**.
- **Passado o prazo sem nada anexado:** a etapa continua pendente ("prazo acabou em …: anexe o que o inquilino mandou ou marque Não houve") até alguém anexar ou marcar **Não houve** (mudado a pedido do dono em 15/11: alguns inquilinos mandaram contra-vistoria e ela precisa ir para o sistema). No inquilino novo, segura a montagem da pasta física até isso.
- **Falta você (depois do merge):** nos inquilinos que mandaram contra-vistoria, anexe na etapa (página do inquilino → Rotina de entrada); nos outros, clique em **Não houve**.
- **Troca de titular:** vale a contra-vistoria do contrato anterior.

## 11. Mutirão de correções de 15–16/11 (onde paramos)  `[ ]`

Revisão em 4 frentes achou 58 problemas; as correções entraram na `main` em 16/11 pelas PRs #250 (ponte C6), #251 (servidor da nuvem), #252 (regras), #253 (`.exe` + programa do PC), #254 (telas) e #255 (sincronia e aplicativo sem internet). Cloudflare publicou sem erro. Lista completa em `ROTINA_DE_MELHORIA.md` ("Mutirão de 2026-11-16").

**Conferências depois do merge (o dono estava fazendo quando parou):**
- [x] **A.** Anexar duas vezes o mesmo arquivo em "Arquivos do inquilino": os dois aparecem e abrem (conferido em 16/11).
- [x] (conferido em 16/11) **B.** Ficha pela internet: Fichas → ficha de teste → **Gerar link** → abrir no celular e enviar 1 foto ou PDF. Certo: a página confirma e o documento aparece na ficha. No fim, **Encerrar o link**.
- [x] (conferido em 16/11) **C1.** No celular, abrir um anexo em PDF e apertar o **Voltar** do aparelho. Certo: o PDF fecha e a página continua a mesma.
- [x] (conferido em 16/11) **C2.** Fechar o aplicativo, ligar o modo avião e abrir de novo. Certo: abre com os dados.

**Falta você:**
- [x] **Cloudflare (feito em 16/11):** limite de pedidos na ficha pública, regra `Ficha publica - limite` (host `ficha.ankjck.com.br`, caminho começando por `/api/publico/`). No plano grátis a janela é fixa: ficou **20 pedidos em 10 segundos por IP, bloqueio de 10 segundos** (a regra grátis única está usada; a trava opcional de `/api/aparelho/entrar` do `nuvem/README.md` fica sem regra própria, o cofre já limita as senhas).
- [x] **Programa do PC (16/11):** regra Bypass criada e `.exe` instalado (ver item 9e).

**2ª rodada (Claude, quando o dono pedir; sempre a partir da `main`, sem empilhar):** carregar as telas raras só quando usadas (nº 23), compactar o código no GitHub (nº 24), faixas de código do primeiro acesso numa ida só (nº 37), a tela de ressarcimento barrar mês com boleto em acordo, verificador separado da senha para o crachá do PC (hoje quem tem o banco aberto consegue um crachá só de leitura), Voltar do celular nas janelas de confirmação. Ficou de fora por segurança: adiar a regravação do banco no aparelho (nº 29).

**Ideia do dono em 16/11:** compactar os anexos. Feita no mesmo dia (item 12).

## 12. Compactação dos anexos (feita em 16/11, PRs #257, #258 e #261)  `[x]` (conferida em 16/11)

O sistema agora diminui sozinho, ao anexar, as fotos e os PDFs escaneados, sem guardar o original. PDF com texto (do banco, de um sistema, do Word) fica como está, e PDF com assinatura digital (gov.br, ICP-Brasil, banco) nunca é mexido. Os documentos mandados pelo link da ficha diminuem quando alguém abre a ficha no sistema, logo depois da conferência (o alerta "⚠ possível montagem" continua). Enquanto um PDF escaneado é compactado, o topo da tela mostra "página 3 de 10… Aguarde". Liga e desliga em Dados e backup → Regras do sistema → "Compactar anexos".

**16/11, PR #261 (pedido do dono):** ao compactar todos, o aviso do topo mostra o andamento geral em % (ex.: "Compactando os anexos: 45% (135 de 298 arquivos…)") e o arquivo da vez no fim.

**Conferido pelo dono em 16/11:**
- [x] **A. Anexos que já estavam no sistema (5 a 10 min):** Dados e backup → **Compactar os anexos que já estão no sistema** → confirmar. Deixe a tela aberta até o fim. Certo: no fim aparece quantos foram compactados e quanto diminuiu (ex.: "40 de 298 arquivo(s) compactado(s): de 350,0 MB para 60,0 MB").
  - **Resultado (16/11): 167 olhados, 0 compactados, e está certo.** Antes: 298 arquivos, 161 MB (71 PDFs assinados, 48 MB; 27 PDFs com texto, 29 MB; 136 pequenos, 20 MB; 60 PDFs escaneados, 60 MB). Os escaneados já vieram com uns 300 KB por página, o mesmo que a compactação daria, e o sistema só troca se ficar 15% menor. Apertar mais os escaneados (letra menos nítida) ganharia no máximo 20 a 30 MB: o dono não pediu.
- [x] **B. Anexo novo:** (16/11: a foto abriu na mesma posição da galeria; o sistema respeita a posição gravada pelo celular e não gira o papel sozinho. Ideia, se o dono pedir: botão "Girar" antes de anexar.) anexe uma foto grande (3 a 4 MB, tirada no celular) em qualquer inquilino. Certo: na lista de arquivos ela aparece com algumas centenas de KB (ex.: 400 KB) e abre de pé, sem estar virada.

## 13. Mutirão 3000 (16–17/11)  `[ ]`

Revisão em 8 frentes (regras, banco C6, segurança, dados, telas, teste de ponta a ponta, desempenho, venda): **366 erros confirmados**, cada um com a prova, em `MUTIRAO_3000.md`. Correções nas PRs #267 a #283, todas na `main` e publicadas.

**Decisões suas (16–17/11), já aplicadas:** Pix pago depois do vencimento com o valor de desconto perde o desconto e a diferença (mais multa e juros) vai ao boleto seguinte; boleto pago pelo código de barras e creditado em até 3 dias úteis não é atraso; pagamento a menos fica "Paga em parte" e a diferença vai ao boleto seguinte; índice negativo mantém o aluguel; renovação negociada pergunta o mês a partir do qual vale; todo mês conta 30 dias (entrada em 15/02 = 16/30); NF do mês incompleto com quantidade "16/30"; ficha reprovada ou desistência tem os dados pessoais apagados no prazo dos documentos; exclusão grande com dupla confirmação digitando APAGAR; formulário alterado pergunta "Sair sem salvar?"; link da ficha aparece uma vez só (reenviar gera outro).

**Conferir no uso (5 min cada):**
- [ ] Uma NF de aluguel proporcional: quantidade "16/30", unitário do mês inteiro, total proporcional. (Só dá para conferir no próximo inquilino com entrada no meio do mês.)
- [x] Sair e entrar de novo: pede o código do login da internet de novo (normal agora). (Conferido 17/11.)
- [ ] Trocar a senha de um usuário: os computadores ligados pelo programa do PC desse usuário precisam ser ligados de novo.
- [x] Painel: alertas mostram 5 de cada tipo e "Ver todos". (Conferido 17/11.)

**Falta você (Cloudflare, opcional):** pôr `DONO_EMAIL` nas variáveis do Worker (com a nuvem vazia, só esse e-mail faz a primeira carga); criar o aplicativo do Access para `vendas.ankjck.com.br`.

**Decisões que ficaram com você:**
- Devolução de Pix ao inquilino: o valor pago do boleto diminui (e a NF?) ou fica como está e a devolução só aparece no extrato?
- Publicar o site pelo GitHub Actions (permite o aplicativo baixar só os arquivos que mudaram).
- Impedimentos de venda que são projetos grandes (vários clientes no mesmo sistema, login próprio, proprietário de terceiros com repasse, DIMOB, importar planilha, outros bancos, portal do inquilino, assinatura eletrônica): ver `MUTIRAO_3000.md`, frente "mercado".

**2ª rodada do mutirão 3000 (17/11), na `main` pelas PRs #285–#298:** tela **Gestão** (Financeiro, com PDF); **régua de cobrança** (Boletos → botão "E-mails da régua", no alto da tela; até 17/11 ficava em Financeiro: prepara 3 dias antes, no dia, 3 e 10 dias depois; só envia os que o administrador marcar e autorizar, com a regra `regua_envio` ligada); **banco automático** (avisos do C6, ligação pelo código do Pix, extrato CSV com conferência do saldo, Saúde do banco); **primeiros passos** e botão "?" nas telas; 192 mensagens de erro em português simples; **LGPD**: backups da nuvem cifrados, tela **Acessos**, "Dados de uma pessoa" (ZIP pelo CPF) e "Apagar tudo desta pessoa" só 10 anos depois do fim do contrato; lixeira de anexos (30 dias) e cópia de cada hora do backup seguro (2 dias). Decisões de 17/11 aplicadas: conflito fica com o valor já gravado na nuvem; troca de titular esperando o termo não apaga mais a saída; caução R$ 0,00 de propósito fica; Desfazer volta a alteração inteira, com prévia dos boletos que mudam. Parte 3 de dados (PR #298): a nuvem passa só os campos mudados, a fila sem internet grava cada lote uma vez, a gravação copia só as tabelas que usa (no banco grande, de ~215 ms para ~5 ms) e recusas ligadas aparecem juntas em Conflitos.

**Conferir no uso (2ª rodada):**
- [x] Abrir o sistema uma vez no computador do administrador com o backup seguro ligado (o backup da nuvem passa a sair cifrado; "Voltar para este dia" pede a senha do backup). (17/11: reconheceu ao entrar.)
- [x] Financeiro → Gestão: números do mês e o PDF. (17/11: tudo ok.)
- [x] E-mails da régua: a lista do dia, tudo desmarcado. (Conferido 17/11; a pedido do dono, o botão "E-mails da régua" passou de Financeiro para o alto da tela **Boletos**; o "← Boletos" da régua volta para lá.)
- [ ] Notificações ao inquilino (PR #300, depois do aceite): conferir no celular a caixa Notificações ao inquilino, abrir uma notificação e o Gerar multa depois do prazo (no computador já foi testado).
- [ ] Gmail (PR #299): aceitar e ligar com o Claude (item 1).

**Relatório do trabalho para o contratante:** https://claude.ai/artifact/FNTqKJrMNp8sZGYywrmyHt

## Ficou de fora de propósito (não é defeito)

- "Movimentações sem destino" em Financeiro e Banco: fica como está até o C6 entrar em uso.
- Fechar o mês travando alterações, foto pela câmera e canal do inquilino: descartados ou adiados por você em 07/11.
- Abertura na nuvem sem copiar o banco e a nuvem usando menos memória (desempenho, itens 14 e 15 do mutirão 3000): ficaram de fora por segurança. A correção automática dos dados antigos (`normalizar`) mexe no próprio banco; dividir o banco entre "como está na nuvem" e "o que a tela vê" faria essas correções sumirem do que vai para a nuvem. O ganho é pequeno (~65 ms ao abrir).
- Régua de cobrança: em 17/11 o dono pediu que ela prepare os e-mails, mas **nada é enviado sem a autorização dele** (2ª rodada do mutirão 3000).
