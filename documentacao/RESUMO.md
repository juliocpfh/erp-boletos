# Resumo do sistema — Administração de Imóveis (repo `erp-boletos`)

## O que faz
- Administra imóveis alugados de duas empresas (ANK e JCK, com percentual por imóvel nas NFs); nos documentos do inquilino, por enquanto, só a ANK é locadora.
- Cadastra imóveis (com Estado/UF pelo CEP), contratos (o contrato liga o inquilino ao imóvel), fiadores, garantias, IPTU, seguro e leituras de relógios.
- Gera os boletos mensais (aluguel proporcional, bonificação, IPTU, seguro, tarifa, reserva, ressarcimentos).
- Registra pagamentos (data contábil, multa e juros; valor recebido diferente do previsto pede justificativa e NF digitada à mão) e numera as NFs em sequência contínua, dividida entre as empresas.
- Emite documentos: contrato por modelo, vistoria, recibo de chaves, carta de reajuste, demonstrativo do boleto e termo aditivo de troca do vencimento (tela, "Baixar PDF" e Word, com nome "Documento Imóvel - Inquilino - ano").
- Mostra alertas, calendário, fechamento do mês, inadimplência, resultados financeiros por imóvel e a guia de impostos esperada por empresa.
- O administrador muda a ordem das caixas de cada página (ícone ☰, todos veem); Dados e backup baixa todos os dados em planilha e PDF.
- Os dados ficam num arquivo JSON numa pasta do computador do usuário (ex.: OneDrive). Não há servidor.

## Módulos (`docs/js/`)
| Arquivo | Função |
|---|---|
| `app.js` | Estado global `E`, login/sessão, gravação (`alterar`), rotas, menu, eventos de formulário e botão, backup seguro na fila |
| `telas.js` | Todas as telas (`TELAS`), cadastros (`CADASTROS`), envio de formulários (`FORMULARIOS`), botões (`ACOES`) |
| `regras.js` | Regras de negócio sobre o banco em memória: inserir/atualizar/excluir com histórico, boletos, NFs, reajuste, alertas, resultados |
| `calculos.js` | Funções puras: dinheiro em centavos, datas, competências, proporcional, multa/juros, valor da NF |
| `formularios.js` | Definição dos campos de cada cadastro, desenho do formulário, leitura/validação, máscaras CPF/CNPJ/CEP |
| `armazenamento.js` | Pasta via File System Access API: ler/gravar banco, backup diário, anexos, ZIP |
| `contratos.js` | Linguagem de modelos de contrato, extenso, vistoria/recibo, geração de HTML e `.docx` |
| `modelos-contrato.js` | Textos padrão dos contratos (residencial e não residencial) e do aditivo de vencimento (`tipo: 'aditivo'`) |
| `fatura.js` | Desenho da NF (HTML) e preenchimento do Excel a partir do modelo |
| `alertas.js` | Alertas de correção, seguro, reserva e vigência |
| `caixas.js` | Ordem das caixas e setores de cada página (arrastar pelo ícone ☰, só administrador) |
| `exportar.js` | Todos os dados numa planilha Excel e num PDF (sem senhas e anexos) |
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
| Imóveis, contratos ("Novo contrato" é o único vínculo com o imóvel, obrigatório; "Corrigir imóvel" só sem boleto pago; contrato antigo sem imóvel: "Apagar" em Inquilinos ou apagado sozinho em 7 dias), saída em duas etapas (data de saída, depois cálculo final; inativo só pela saída), leitura dos relógios obrigatória na vistoria de entrada e de saída, fiadores (incluídos, trocados ou tirados pela troca de garantia, que pode ser cancelada), garantias (caução calculada por aluguéis × bonificado; caução e depósito registrados em depósitos de valores diferentes, comprovante opcional com alerta até anexar, completos ao somar o valor do contrato; reajustes viram complemento, tratado só na tela Reajustes ("Caução a completar": boleto com vencimento e parcelas escolhidos ou depósito); aplicação na empresa ou na conta de outra pessoa, e a devolução sai de onde foi depositado; fiador, seguro fiança) e reserva com comprovante (marcável como já abatida em aluguel antigo), carência, IPTU por ano com guias (inquilino paga os dias ocupados, o resto é do proprietário; tela do ano com as guias a pagar em cima e um quadradinho colorido por mês, o vermelho marca a guia paga), matrícula anexada e excluída na lista de Imóveis (a caixa "Documentos do imóvel" é só para ver), seguro (só salva com o arquivo da apólice; telefone da assistência), solicitações dos inquilinos (tela própria com resumo por situação) |
| Boletos mensais, baixa individual e em lote (por vencimento), exclusão dos selecionados (não pagos), recálculo pelo cadastro, boleto de controle (sem NF), boleto separado do complemento da caução (sem tarifa e sem NF; uma ou mais parcelas, geradas na tela Reajustes) |
| NFs: numeração contínua, divisão entre empresas, cancelar, voltar numeração, NF externa, avulsa (Airbnb), PDF e Excel |
| Reajuste anual (13º mês a partir do mês de entrada) aplicado e desfeito só na tela Reajustes (em aberto de qualquer ano, na ordem; sem índice, % digitado com o valor sugerido; 3 últimos reajustados e todo o histórico), página do inquilino só com o histórico; índices acumulados, carta (só no ano corrente, com o depósito adicional da caução) junto com o boleto do aluguel já corrigido; a caução acompanha o aluguel corrigido e é corrigida ao pagar o complemento; corrigir o aluguel inicial refaz os reajustes em cadeia |
| Contrato por modelo (prazo conta da data de vigência inicial), vistoria por modelo do imóvel com fotos (botões de estado por cômodo, "Não se aplica" tira o item do modelo, rascunho guardado até salvar, textos de abertura e final editáveis), recibo de chaves, carta de reajuste (logo de fundo em todas as páginas, na tela e na impressão); documentos de entrada marcados como assinados só com o arquivo anexado, anexados com assinatura faltante ou registrados como perdidos (de operador, aguardam o administrador); termos aditivos ("Possui termo aditivo" só com termo anexado; aditivo de vencimento gerado por modelo editável, aguardando assinatura); troca de titular ("Continua o contrato de": data da troca, fim do vínculo do anterior, condições/aluguel/reserva/garantia travados e trazidos do anterior, garantia cuidada no contrato anterior, aditivo obrigatório); assinaturas em conjuntos e "Página X de Y" |
| Resultados por imóvel em tabela compacta (receita e despesas somadas; contas pagas por nós, inclusive R$ 0,00 com observação para "verificado, sem conta", e ressarcimentos de condomínio), Excel; aba Impostos (PIS/COFINS mensal, IRPJ/CSLL trimestral com adicional e LC 224, vencimentos, valor do contador) |
| Painel (imóveis, contratos ativos, boletos em dia/vencidos, pagamentos aguardando NF, aviso com mais alertas, solicitações), calendário (com atalho para o fechamento do mês), fechamento do mês, cadastros incompletos (botões "Completar dados" e "Ver documentos"), inadimplência, histórico de alterações (administrador desfaz alterações de cadastro), alertas com cor/ênfase/prioridade editáveis |
| Usuários e papéis, backup diário, ZIP, backup seguro cifrado, versão sem internet; excluir lançamento apaga o arquivo anexado e "Procurar arquivos sem lançamento" limpa os que sobraram; caixa de arquivos mostra todos, os de lançamento com etiqueta e sem "Excluir"; nome do comprovante acompanha a data do lançamento |

| Em andamento |
|---|
| Nenhum item em andamento no código (sem `TODO`/`FIXME`). Fora do código: integração com a API do C6 (Bolepix, só pela ANK), pesquisada e aguardando as credenciais de teste do C6 (pedido do usuário, 2026-10-16) |

Ver também: `documentacao/ARQUITETURA.md`, `documentacao/DECISOES.md`, `documentacao/GUIA_DE_MODIFICACAO.md`.
