# Resumo do sistema — Administração de Imóveis (repo `erp-boletos`)

## O que faz
- Administra imóveis alugados de duas empresas (ANK e JCK, com percentual por imóvel nas NFs); nos documentos do inquilino, por enquanto, só a ANK é locadora.
- Cadastra imóveis (endereço pelo CEP), contratos (o contrato liga o inquilino ao imóvel), fiadores, garantias, IPTU, seguro e leituras de relógios.
- Gera os boletos mensais (aluguel proporcional, bonificação, IPTU, seguro, tarifa, reserva, ressarcimentos).
- Registra pagamentos (data contábil, multa e juros; valor recebido diferente do previsto pede justificativa e NF digitada à mão) e numera as NFs em sequência contínua, dividida entre as empresas.
- Emite documentos: contrato por modelo, vistoria, recibo de chaves, carta de reajuste, demonstrativo do boleto e termos aditivos de troca do vencimento e de troca de inquilino (tela, "Baixar PDF" e Word, com nome "Documento Imóvel - Inquilino - ano").
- Mostra alertas, calendário, fechamento do mês, inadimplência, resultados financeiros por imóvel e a guia de impostos esperada por empresa.
- O administrador muda a ordem das caixas de cada página (ícone ☰, todos veem); Dados e backup baixa todos os dados em planilha e PDF e as regras do sistema em TXT.
- Os dados ficam num arquivo JSON numa pasta do computador do usuário (ex.: OneDrive). Não há servidor.

## Módulos (`docs/js/`)
| Arquivo | Função |
|---|---|
| `app.js` | Estado global `E`, login/sessão, gravação (`alterar`), rotas, menu, eventos de formulário e botão, backup seguro na fila |
| `telas.js` + `telas/` | Rotas das telas (`TELAS`, em `telas.js`) e um arquivo por assunto em `telas/`: `comum`, `campos` (preenchimento automático), `imovel`, `contrato`, `cadastros` (`CADASTROS`), `avisos`, `fechamento`, `cobrancas`, `faturas`, `consultas`, `reajustes`, `financeiro`, `documentos`, `admin`, `envios` (`FORMULARIOS`), `acoes` (`ACOES`) |
| `regras.js` | Regras de negócio sobre o banco em memória: inserir/atualizar/excluir com histórico, boletos, NFs, reajuste, alertas, resultados |
| `calculos.js` | Funções puras: dinheiro em centavos, datas, competências, proporcional, multa/juros, valor da NF |
| `formularios.js` | Definição dos campos de cada cadastro, desenho do formulário, leitura/validação, máscaras CPF/CNPJ/CEP |
| `armazenamento.js` | Pasta via File System Access API: ler/gravar banco, backup diário, anexos, ZIP |
| `contratos.js` | Linguagem de modelos de contrato, extenso, vistoria/recibo, geração de HTML e `.docx` |
| `modelos-contrato.js` | Textos padrão dos contratos (residencial e não residencial) e do aditivo de vencimento (`tipo: 'aditivo'`) |
| `fatura.js` | Desenho da NF (HTML) e preenchimento do Excel a partir do modelo |
| `alertas.js` | Alertas de seguro, reserva e vigência (o do reajuste é de `regras.js`) |
| `caixas.js` | Ordem das caixas e setores de cada página (arrastar pelo ícone ☰, só administrador) |
| `exportar.js` | Todos os dados numa planilha Excel e num PDF (sem senhas e anexos) |
| `regras-texto.js` | `REGRAS_TEXTO`: as regras de negócio em texto objetivo, baixado em Dados e backup (TXT) |
| `auth.js` | Senhas PBKDF2-SHA256 e papéis (admin, operador, consulta) |
| `backup-seguro.js` | Segunda pasta cifrada do administrador (RSA-OAEP + AES-GCM) |

## Stack
| Item | Valor |
|---|---|
| Linguagem | JavaScript (ES modules), HTML, CSS — sem framework, sem etapa de build no site |
| "Banco" | Um arquivo `imoveis-dados.json` na pasta escolhida (objeto com uma lista por tabela) |
| Navegador | Chrome ou Edge no computador (usa `showDirectoryPicker`) |
| Bibliotecas (cópias locais em `docs/vendor/`) | `exceljs.min.js`, `jszip.min.js`, `html2canvas.min.js`, `jspdf.umd.min.js` |
| Ferramentas | Node (testes `node:test`), `esbuild@0.24.0` via `npx` só para gerar a versão offline |
| Versões das bibliotecas em `docs/vendor/` | NÃO CONFIRMADO (arquivos minificados, sem registro de versão no repo) |
| Versão do Node | 22 (usada nos testes) |

## Rodar, testar e publicar
| Tarefa | Comando / passo |
|---|---|
| Rodar local | `cd docs && python3 -m http.server 8000` e abrir `http://localhost:8000/?teste` (pasta interna do navegador, sem escolher pasta) |
| Conferir (sintaxe + testes) | `node tools/checar.mjs` (134 testes na última execução); testes sozinhos: `node --test tests/*.mjs` |
| Achar código | `node tools/mapa.mjs <trecho>` (função → arquivo e linha) |
| Versão sem internet | `node tools/checar.mjs --offline` (usa `tools/gerar-offline.mjs`) → `docs/offline/administracao-imoveis.html`; `tests/offline.test.mjs` falha se ela ficar desatualizada |
| Publicar | Merge em `main`; o GitHub Pages serve a pasta `docs/` (segundo `README.md`). Configuração do Pages: NÃO CONFIRMADO no código |

Atenção: `docs/` é a raiz do site publicado; tudo o que estiver lá fica acessível pelo endereço do Pages. Por isso esta documentação fica em `documentacao/`.

## Estado atual
| Pronto (no código) |
|---|
| Imóveis, contratos ("Novo contrato" é o único vínculo com o imóvel, obrigatório; "Corrigir imóvel" só sem boleto pago; contrato antigo sem imóvel: "Apagar" em Inquilinos ou apagado sozinho em 7 dias), saída em duas etapas (data de saída, depois cálculo final; inativo só pela saída), leitura dos relógios obrigatória na vistoria de entrada e de saída, fiadores (incluídos, trocados ou tirados pela troca de garantia, que pode ser cancelada), garantias (caução calculada por aluguéis × bonificado; caução e depósito registrados em depósitos de valores diferentes, comprovante opcional com alerta até anexar, completos ao somar o valor do contrato; reajustes viram complemento, tratado só na tela Reajustes ("Caução a completar": boleto à vista por padrão ou, com "Parcelar caução complementar", uma data e um valor por parcela; ou depósito); aplicação na empresa ou na conta de outra pessoa, e a devolução sai de onde foi depositado; fiador, seguro fiança) e reserva com comprovante (marcável como já abatida em aluguel antigo), carência, IPTU por ano com guias (inquilino paga os dias ocupados, o resto é do proprietário; tela do ano com as guias a pagar em cima, um quadradinho colorido por mês até a última parcela (ex.: jan do ano seguinte), o vermelho marca a guia paga, e o clipe ao lado do imóvel anexa a guia), matrícula anexada e excluída na lista de Imóveis (pasta "Matrículas"; a caixa no imóvel é só para ver), seguro do inquilino (apólice na pasta dele; pode salvar sem o arquivo, com alerta; documentos ligados à vigência; passa ao novo titular na troca; telefone da assistência), FCI (fundo de conservação: % do bonificado no boleto, depósitos anteriores lançados à mão, correção pelo Banco Central, crédito para danos na saída), solicitações dos inquilinos (tela própria com resumo por situação) |
| Boletos mensais, baixa individual e em lote (por vencimento), exclusão dos selecionados (não pagos), recálculo pelo cadastro, boleto de controle (sem NF), boleto separado do complemento da caução (sem tarifa e sem NF; uma ou mais parcelas, geradas na tela Reajustes); boletos do mês gerados a partir do dia 20, vencendo no mês seguinte |
| NFs: numeradas depois da virada do mês (com avulsas e Airbnb lançadas), numeração contínua, divisão entre empresas, cancelar, voltar numeração, NF externa, avulsa (Airbnb), PDF e Excel |
| Reajuste anual (13º mês a partir do mês de entrada) aplicado e desfeito só na tela Reajustes (em aberto de qualquer ano, na ordem; sem índice, % digitado com o valor sugerido; 3 últimos reajustados e todo o histórico), página do inquilino só com o histórico; índices acumulados, carta (só no ano corrente, com o depósito adicional da caução) junto com o boleto do aluguel já corrigido; a caução acompanha o aluguel corrigido e é corrigida ao pagar o complemento; corrigir o aluguel inicial refaz os reajustes em cadeia |
| Contrato por modelo (prazo conta da data de vigência inicial), vistoria por modelo do imóvel com fotos (botões de estado por cômodo, "Não se aplica" tira o item do modelo, rascunho guardado até salvar, textos de abertura e final editáveis), recibo de chaves, carta de reajuste (logo de fundo em todas as páginas, na tela e na impressão; ao marcar enviada, o PDF fica na pasta "Aditivos, correções e comunicação" do inquilino); documentos de entrada marcados como assinados só com o arquivo anexado, anexados com assinatura faltante ou registrados como perdidos (de operador, aguardam o administrador); termos aditivos ("Possui termo aditivo" só com termo anexado; aditivo de vencimento gerado por modelo editável, aguardando assinatura, com alerta no Painel); troca de titular ("Continua o contrato de": data da troca, fim do vínculo do anterior, condições/aluguel/reserva/garantia travados e trazidos do anterior, garantia cuidada no contrato anterior, aditivo obrigatório); assinaturas em conjuntos e "Página X de Y" |
| Resultados por imóvel em tabela compacta (receita e despesas somadas; contas pagas por nós, inclusive R$ 0,00 com observação para "verificado, sem conta", e ressarcimentos de condomínio), Excel; aba Impostos (PIS/COFINS mensal, IRPJ/CSLL trimestral com adicional e LC 224, vencimentos, valor do contador) |
| Painel (imóveis, contratos ativos, boletos em dia/vencidos, pagamentos aguardando NF, aviso com mais alertas, solicitações), calendário (boletos no dia 20, NFs do mês anterior no dia 1º, o que falta no último dia), fechamento do mês (etapas previstas até a data liberada), cadastros incompletos (botões "Completar dados" e "Ver documentos"), inadimplência, histórico de alterações (administrador desfaz alterações de cadastro), alertas com cor/ênfase/prioridade editáveis |
| Usuários e papéis, backup diário, ZIP, backup seguro cifrado, versão sem internet; excluir lançamento apaga o arquivo anexado e "Procurar arquivos sem lançamento" limpa os que sobraram; caixa de arquivos mostra todos, os de lançamento com etiqueta e sem "Excluir"; ao abrir o Painel, os arquivos dos lançamentos são conferidos (o que está em outra pasta volta; o que sumiu vira alerta para anexar de novo); botão de excluir único (quadradinho vermelho com ×); nome do comprovante acompanha a data do lançamento. Preenchimento automático: CEP antes do endereço (imóvel) e CEP que monta o endereço de uma linha das pessoas (campo virtual `<prefixo>cep_busca`); CNPJ traz razão social, fantasia, endereço, telefone, e-mail e representante (BrasilAPI); CPF/CNPJ certo mostra "✓ válido" ao sair do campo; no inquilino, documento e RG/inscrição estadual vêm logo depois do tipo, e o nome vira "Razão social" na empresa; índices acumulados IGP-M, IPCA, INPC e IGP-DI trazidos do Banco Central na tela Reajustes para conferir (`SERIES_BC`; os outros, ex. IVAR, digitados com aviso). Avisos antes de salvar (`conferir` em `CADASTROS`): datas no futuro ou de mais de 90 dias atrás, endereço sem número, telefone/e-mail suspeitos, leitura menor que a anterior, seguro fora de 1 ano ou sobreposto, IPTU/seguro 30% fora do anterior, lançamento repetido |

| Em andamento |
|---|
| Nenhum item em andamento no código (sem `TODO`/`FIXME`). Fora do código: integração com a API do C6 (Bolepix, só pela ANK), pesquisada e aguardando as credenciais de teste do C6 (pedido do usuário, 2026-10-16) |

Ver também: `documentacao/ARQUITETURA.md`, `documentacao/DECISOES.md`, `documentacao/GUIA_DE_MODIFICACAO.md`.
