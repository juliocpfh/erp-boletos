# Rotina de melhoria — achados de 2026-11-07

Análise feita um dia depois de a nuvem entrar no ar. Cada item traz a evidência (arquivo:linha na data da análise; confira com
`node tools/mapa.mjs <trecho>` antes de mexer) e o que fazer. Marque `[x]` ao concluir e anote a PR.

## Como usar esta rotina
- Uma PR por item (ou por grupo pequeno do mesmo assunto). Antes de cada item: `node tools/checar.mjs`; teste no navegador em `?teste` e, para a nuvem, `node nuvem/local.mjs`.
- Ordem: bloco A inteiro primeiro (risco real, correções pequenas); depois B; C e D conforme o tempo. E são decisões do dono.
- Ao terminar um item, atualize `RESUMO.md`/`ARQUITETURA.md` só se o comportamento mudou; a versão sem internet só no "salvar".

## Respostas às três perguntas
1. **O app se atualiza sozinho?** Sim (`docs/sw.js`: confere cada arquivo com o site; sem internet usa a cópia). `index.html` pode atrasar até 10 min (cache do GitHub). "Atualizar agora" em Dados e backup.
2. **Versão sem internet ainda faz sentido?** Como está, não: abre a pasta do OneDrive, não a nuvem (`telas/admin.js` "escolha a mesma pasta"; `telas.js` "nada é guardado na internet") → dados velhos. O "usar sem internet" já é feito pelo aplicativo instalado + cópia cifrada + fila. Só serve para abrir um backup antigo sem GitHub/Cloudflare. Decisão em E1.
3. **Backup seguro no PC funciona com a nuvem?** Não, e não avisa: a cópia por gravação só existe no caminho da pasta (`app.js` `alterarAgora` sai antes no modo nuvem) e a rotina diária/semanal só roda em `abrirPasta`, nunca em `abrirNuvem`. O único backup é o diário do servidor, no mesmo balde R2 dos dados. "Importar ZIP" dá erro na nuvem (`pasta-nuvem.js`: o banco não é arquivo na raiz). Não há restauração pela tela. Correção em A3.

## A — Fazer primeiro (risco real, correções pequenas)
- [x] **A1. `normalizar` não roda na nuvem.** Feito em 2026-11-07 (PR #155): `Sincronia.atual()` aplica `normalizar` (opção do construtor) e `enviarAjustes()` manda as correções como um lote, chamado por `ajustesParaNuvem` (`app.js`) ao entrar, só pelo administrador (as correções mexem em campos de `SO_ADMIN`, A6); teste em `tests/sincronia.test.mjs`. Ver também C9 (regras de negócio dentro de `normalizar`).
- [x] **A2. Sessão em dois aparelhos gera conflito.** Feito em 2026-11-07 (PR #155): o cofre junta as listas de `usuarios[].sessoes` (o que um aparelho tirou some, o que os outros puseram fica; `MAX_SESSOES` em `nuvem.js` = `cofre.mjs`), nunca abre conflito; teste em `tests/sincronia.test.mjs`.
- [x] **A3. Backup seguro + restauração na nuvem.** Feito em 2026-11-07 (PR A3): (a) `abrirNuvem` chama `rotinaSegura()`; na nuvem a cópia cifrada é refeita a cada gravação e quando chega mudança de outro aparelho (`espelharSeguro` em `app.js`); (b) tela `#/backups-nuvem` (`telaBackupsNuvem`, `telas/nuvem.js`): os 30 diários do R2 pela pasta virtual `backups`, "Baixar" e "Voltar para este dia" (`E.nuvem.importar(…, { substituir: true })`, só administrador, com confirmação e sem fila pendente; `reabrirSessao` depois); o Worker só deixa o administrador ler `backups/` (têm as senhas de todos); (c) "Importar ZIP" some na nuvem (fica "Substituir os dados da nuvem pelos de uma pasta" e o texto de restaurar o backup seguro explica); (d) textos de `telas/admin.js` e `regras-texto.js`. Testes em `tests/nuvem.test.mjs` e `tests/sincronia.test.mjs`. D11 fica feito junto.
- [x] **A4. Tempo limite nos pedidos à nuvem.** Feito em 2026-11-07 (PR #156): `TEMPO_LIMITE` 30 s (`TEMPO_LIMITE_ANEXO` 120 s no PUT) em `nuvem.js` (`limiteDeTempo`, `erroDeRede`), usado por `apiDoSite`, `nuvemDisponivel` e `pasta-nuvem.js` (`pedir`); tempo esgotado vira status 0 (passageiro). Testes em `tests/sincronia.test.mjs` e `tests/pasta-nuvem.test.mjs`.
- [x] **A5. Erros 429/408 tratados como definitivos.** Feito em 2026-11-07 (PR #156): `passageiro` único em `nuvem.js` (408 e 429 passageiros; `pasta-nuvem.js` importa); anexo recusado de vez fica em `AnexosNuvem.naoEnviados` (IndexedDB, com o arquivo) e aparece em `#/conflitos` com "Baixar" e "Esquecer" (faixa do topo avisa).
- [x] **A6. Regras "só administrador" valem só na tela.** Feito em 2026-11-07 (PR A6-A8): `SO_ADMIN` em `cofre.mjs` (raiz: `config_banco`, `logo`, `ordem_caixas`, `ressarcimento_abate_nf`, `estilos_alertas`; excluir: `imoveis`, `contratos`, `encerramentos`, `vistorias`, `modelos_contrato`, `faturas`; tabela: `emitentes`), conferido em `aplicarOp`/`mudarRaiz`. Ficou de fora (campo dentro do registro, ver C2): aprovar pagamento e negativar. Teste em `tests/cofre.test.mjs`.
- [x] **A7. Login da tela não confere o e-mail do Access.** Feito em 2026-11-07 (PR A6-A8): `abrirNuvem` guarda `E.emailNuvem` (`saudeDaNuvem`, `nuvem.js`); `entrar` recusa usuário que não é desse e-mail (`usuarioDoEmail`, mesma regra de `papelDe` do cofre). Sem internet não confere (Access e cofrinho cobrem).
- [x] **A8. Senhas (resumo) e tokens de todos vão para todo aparelho.** Feito em 2026-11-07 (PR A6-A8): `usuarioParaAparelho` em `cofre.mjs` (`tudo` e `mudancas` recebem `quem`): quem não é administrador recebe os outros usuários só com `id, login, nome, email, papel, ativo, pendente`; `usuariosParaAcesso` (`cofrinho.js`) não grava mais `sessoes` em `acesso`. Testes em `tests/cofre.test.mjs` e `tests/cofrinho.test.mjs`.

## B — Velocidade e robustez (ajustes pequenos)
- [ ] **B1.** `puxar` regrava o banco inteiro cifrado a cada 30 s mesmo sem mudança (`nuvem.js` ~323; `cofrinho.js` cifra tudo). Gravar só se `r.mudancas.length || r.refazer`; manter o IndexedDB aberto (hoje abre/fecha a cada `ler`/`gravar`).
- [ ] **B2.** Cada gravação clona e compara o banco inteiro 2× (`Sincronia.alterar` + `diferencas` com `canon` por registro; `atual()` reaplica pendentes). Comparar `JSON.stringify` antes do `canon`; agrupar envios (~300 ms) num lote só.
- [ ] **B3.** Abertura: ~45 conferências com o servidor por abertura (`sw.js` + imports estáticos de `app.js`). Número de versão no `CACHE` + conferir só `index.html`/`versao.json`, ou `modulepreload`.
- [ ] **B4.** Painel na nuvem: `organizarPastasUmaVez`/`conferirArquivosUmaVez` (`telas.js`, `telas/comum.js`) fazem centenas de `api/lista/` só para arrumar pastas antigas do OneDrive. Pular `organizarPastas` na nuvem; `conferirArquivos` com uma listagem por prefixo (rota nova); Worker guarda papel por e-mail ~60 s.
- [ ] **B5.** `normalizar` (modo pasta) roda em toda gravação e a cada 30 s com laços ao quadrado (`regras.js` ~81, 162, 184-185). Usar `Set`/`Map`.
- [ ] **B6.** Servidor: `backupDoDia` + `limpar()` rodam dentro de cada POST (`cofre.mjs` ~497; `DELETE FROM log WHERE em <` sem índice). Alarme diário do Durable Object; índice em `log(em)`.
- [ ] **B7.** Worker publica sem testes; `checar.mjs` não roda `ponte-c6/testes/`. Comando de build do Workers Builds rodando `tests/nuvem|cofre|sincronia.test.mjs`; incluir a ponte no `checar.mjs`.
- [ ] **B8.** Testes que faltam: `alterarAgora` na nuvem, `entrar/destrancarNuvem/sair`, 429, tempo limite, sessões em dois aparelhos, `normalizar` na nuvem; `banco.js`/`banco-fase2.js`, `caixas.js`, `fatura.js`, `visualizador.js` sem teste.
- [ ] **B9.** Desfazer usa a posição no histórico (`regras.js` ~399): com dois aparelhos a posição pode apontar para outra entrada. Testar; se confirmar, código fixo por entrada.
- [ ] **B10.** Cabeçalhos: CSP só em `<meta>` (não impede embutir o site em outra página); `connect-src` libera `localhost:*`. Regra no Cloudflare com `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS; restringir à porta da ponte.
- [ ] **B11.** `dados/importar` faz backup "antes-da-substituicao" antes de conferir admin (`cofre.mjs` ~492) e esses backups não entram na faxina. Exigir admin antes; faxina guarda os 5 mais recentes.
- [ ] **B12.** `cartoesNoCelular` mede e aplica classe tabela a tabela (recalcula a página a cada uma, 2× por `mostrar`): medir todas, depois aplicar. Login na nuvem faz PBKDF2 2-3× (segundos no celular): mostrar "Entrando…".

## C — Inconsistências em fluxos (corrigir ao mexer no assunto)
**Pagamentos pelo banco** (`telas/banco.js`, `conciliacao.js`)
- [ ] **C1.** Pagamento aprovado antes de o banco ler o código fica sem saída: "Aprovar" aparece em todo rascunho (`banco.js:314`), "Enviar" exige lote, "Mandar ler" só aceita rascunho/erro (`:781`). Esconder "Aprovar" sem lote ou `lerNoBanco` aceitar aprovados.
- [ ] **C2.** Depois da aprovação a situação diz "Aguardando aprovação do administrador" (`conciliacao.js:28`); "Aprovar e enviar" aprova de novo com 2 janelas (+ app do C6 = 4 confirmações); `regras-texto.js:111` diz que se aprova "digitando o valor", mas "Aprovar" não pede nada. Deixar só "Aprovar e enviar"; renomear situação.
- [ ] **C3.** Pagamento enviado que o C6 não confirma nem recusa: sem como cancelar (`cancelarPagamento` com `noBanco` nunca é chamado) e o alerta fica para sempre (`regras.js` ~4826). Botão admin "Foi cancelado no C6".
- [ ] **C4.** "Cancelar"/"Descartar" dizem "Nada foi enviado ao banco", mas os códigos já foram ao C6 para leitura (`banco.js:318`, `:399`). Chamar `removerItensDoGrupo` ou corrigir o texto.

**Fechamento e Painel** (`regras.js` ~4130-4200, 4810-4835; `telas.js`)
- [ ] **C5.** Etapa "Banco" nunca fica feita no mês corrente (extrato precisa chegar até hoje). Cobrar "buscado há mais de X dias".
- [ ] **C6.** Ao virar o mês, só a etapa das NFs do mês anterior fica no Painel (`telas.js:206`). Trazer todas as pendentes.
- [ ] **C7.** `manual: true` que ninguém lê; `semComprovante`/`pagamentosPendentes` calculados e sem uso. Decidir ou apagar.
- [ ] **C8.** Fechamento conta o boleto do complemento da caução como aluguel (`gerados`/`doMes` só filtram pelo mês; `boletoDoMes` exclui). Excluir `ehComplementoCaucao`.

**Dados ao abrir / Desfazer**
- [ ] **C9.** `normalizar` aplica regras de negócio sem histórico: desativar quem saiu (`desativarSeSaiu` sem usuário), recalcular "possui aditivo", completar caução por depósitos (`regras.js` ~162-166). Na nuvem vira mudança enviada por quem abrir. Passar para rotina com usuário e histórico (manter as migrações).
- [ ] **C10.** Histórico desfaz `data_pagamento` de conta paga pelo banco e `paga_em` de guia (`SEM_DESFAZER` não cobre `despesas`, `iptus`, `guias_impostos`); a exclusão é barrada no mesmo caso (`acoes.js:64`). O "desfazer" da parcela do IPTU (`imovel.js:43`, `marcarIptuPago`) idem. Bloquear quando há `pagamento_banco_id`/`movimentacao_id`.

**Alertas** (`regras.js` ~2446, 2588, 3243-3265; `telas/contrato.js`)
- [ ] **C11.** Tipo "Correção do aluguel" configurável mas sem alerta; "Devolver garantia" existe e não é configurável. Trocar.
- [ ] **C12.** Aviso de documentos faltando em 5 lugares (alerta Rotina, faixa cadastros incompletos, faixa do inquilino, caixa Rotina, caixa Documentos); "Marcar assinado" 2× na mesma página. Uma fonte só.
- [ ] **C13.** Inadimplência nunca some (qualquer contrato, inclusive inativo/controle). Ver D8.

**Dados e backup — sobras do modo pasta** (`telas/admin.js`)
- [ ] **C14.** Na nuvem: `copiasEmConflito(E.pasta)` (OneDrive) ainda roda; "Substituir os dados da nuvem pelos de uma pasta" sempre visível; texto da pasta do contador (`banco.js:114`); aviso semanal "baixe o ZIP" planejado nunca feito. Esconder com `E.nuvem`; "Substituir" em lugar escondido.

**Textos e duplicações**
- [ ] **C15.** `regras-texto.js:59` "NFs não se apagam", mas admin apaga NF cancelada (`faturas.js:70`); 3 caminhos para refazer numeração (cancelar, voltar ciclo, desfazer a partir de um número). Atualizar o texto; talvez juntar os dois "desfazer".
- [ ] **C16.** Vistoria de saída informada 2× (lista em `formularios.js:454` e a vistoria registrada), sem conversar. Preencher a lista pela vistoria.
- [ ] **C17.** Parcela de IPTU marcada paga em 4 telas por 3 ações (`imovel.js:45`, `consultas.js:95`, `:136`, destino do extrato). Tabela `recebimentos` sempre zerada continua no filtro do Histórico.
- [ ] **C18.** Sem uso: `ACOES.cancelarAvulsa`, `ACOES.aplicarReajuste`; exportadas sem uso `prepararPagamento`, `esquecerPonte` (falta botão "Esquecer a ponte neste computador"), `idPastaContador`, `urlPdfBoleto`; `#/calendario` sem link; `FORMATOS_PARAMETRO` `competencia, mes_ref, seguro, empresa, vistoria` sem uso; `documentoDaTela` (`acoes.js` ~357) lê o endereço sem `sanearParametros` (regra 4).
- [ ] **C19.** Código repetido ponte × site: `janelas`=`janelasDe30Dias`, `centavosDoTexto`≈`centavosDoC6`, `somarDias`, `codigoDeBarrasDaLinha`≈`validarCodigoBarras`. Uma cópia conferida por teste (como `mapa-c6`).

## D — Funcionalidades (visão do dono; cada uma é um projeto pequeno)
- [ ] **D1.** Busca global (imóvel, inquilino, CPF, nº NF, valor) — hoje só em Inquilinos.
- [ ] **D2.** Painel com dinheiro e atalhos: a receber no mês, vencido hoje (R$), saldo ANK/JCK, NFs a numerar; "Registrar pagamento / Gerar boletos / Buscar extrato".
- [ ] **D3.** Lembrete ao inquilino com texto pronto (WhatsApp/e-mail; hoje o link abre vazio, `contrato.js:670`): antes do vencimento, no dia, atrasado, com valor e Pix.
- [ ] **D4.** Enviar carta de reajuste/documentos direto e marcar "enviada" sozinho.
- [ ] **D5.** Extrato automático das duas contas ao abrir + importar OFX/CSV do app do C6 enquanto as chaves não chegam.
- [ ] **D6.** Rotina de saída do inquilino passo a passo (aviso prévio, vistoria, chaves, contas, cálculo final, devolução da garantia, último boleto).
- [ ] **D7.** Tela de Boletos: filtros (em aberto/vencidos/pagos/sem NF), busca, pagamento em janela, baixa em lote também para atrasados.
- [ ] **D8.** Inadimplência com acordo (gera parcelas), baixa como perda com justificativa, régua de cobrança (D+1 lembrete, D+10 ligação, D+30 negativação).
- [ ] **D9.** Relatório do mês em PDF por empresa (recebido, a receber, inadimplência, custos, impostos) e declaração anual de aluguéis para o inquilino.
- [ ] **D10.** "Baixar ZIP do mês para o contador" (a pasta `_Contador` não existe mais para entregar).
- [x] **D11.** Restaurar backup pela tela (feito em A3: `#/backups-nuvem`).
- [ ] **D12.** Página do inquilino com índice/abas e caixas recolhidas.
- [ ] **D13.** "Fechar o mês" de verdade: trava alterações do mês (admin reabre) e gera o relatório D9.
- [ ] **D14.** Alertas adiáveis ("adiar 7 dias / já estou cuidando", com quem marcou) e central única de pendências (faixas + alertas + fechamento).
- [ ] **D15.** Celular: campo de foto com câmera (`capture`) para comprovante e vistoria; telas curtas "Registrar pagamento" e "Nova solicitação".
- [ ] **D16.** Canal do inquilino: formulário simples para abrir solicitação / 2ª via, caindo em Solicitações.

## E — Decisões do dono (não mexer sem resposta)
- [ ] **E1. Versão sem internet.** Proposta: tirar o botão de Dados e backup; gerar só como ferramenta de emergência do administrador (guardada com o backup seguro); parar de regenerar a cada "salvar" (3 MB por commit, teste que quebra em qualquer mudança de tela). Alternativa: manter, mas com aviso em destaque de que abre a pasta e não a nuvem.
- [ ] **E2. Pasta do OneDrive.** Aposentar como reserva depois de uns dias sem problema (já previsto em `nuvem/README.md`). Depende de A3 (segunda camada fora do Cloudflare).
- [ ] **E3. Pagamentos pelo banco.** Quantas confirmações o dono quer (hoje 4, ver C2).
- [ ] **E4. Etapa "contas" do fechamento** é manual ou automática? (C7)
