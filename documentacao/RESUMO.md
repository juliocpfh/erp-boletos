# Resumo do sistema — Administração de Imóveis (repo `erp-boletos`)

## O que faz
- Administra imóveis alugados de duas empresas locadoras (ex.: ANK e JCK, com percentual por imóvel).
- Cadastra imóveis, inquilinos (contratos), fiadores, garantias, IPTU, seguro e leituras de relógios.
- Gera os boletos mensais (aluguel proporcional, bonificação, IPTU, seguro, tarifa, reserva, ressarcimentos).
- Registra pagamentos (data contábil, multa e juros) e numera as NFs em sequência contínua, dividida entre as empresas.
- Emite documentos: contrato por modelo, vistoria, recibo de chaves e carta de reajuste (tela/PDF e Word).
- Mostra alertas, calendário, fechamento do mês, inadimplência e resultados financeiros por imóvel.
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
| `modelos-contrato.js` | Textos padrão dos contratos (residencial e não residencial) |
| `fatura.js` | Desenho da NF (HTML) e preenchimento do Excel a partir do modelo |
| `alertas.js` | Alertas de correção, seguro, reserva e vigência |
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
| Conferir (sintaxe + testes) | `node tools/checar.mjs` (69 testes na última execução); testes sozinhos: `node --test tests/*.mjs` |
| Achar código | `node tools/mapa.mjs <trecho>` (função → arquivo e linha) |
| Versão sem internet | `node tools/checar.mjs --offline` (usa `tools/gerar-offline.mjs`) → `docs/offline/administracao-imoveis.html`; `tests/offline.test.mjs` falha se ela ficar desatualizada |
| Publicar | Merge em `main`; o GitHub Pages serve a pasta `docs/` (segundo `README.md`). Configuração do Pages: NÃO CONFIRMADO no código |

Atenção: `docs/` é a raiz do site publicado; tudo o que estiver lá fica acessível pelo endereço do Pages. Por isso esta documentação fica em `documentacao/`.

## Estado atual
| Pronto (no código) |
|---|
| Imóveis, inquilinos, fiadores, garantias (caução, depósito, fiador, seguro fiança), reserva, carência, IPTU por ano com guias, seguro |
| Boletos mensais, baixa individual e em lote (por vencimento), recálculo pelo cadastro, boleto de controle (sem NF) |
| NFs: numeração contínua, divisão entre empresas, cancelar, voltar numeração, NF externa, avulsa (Airbnb), PDF e Excel |
| Reajuste anual (13º mês a partir do mês de entrada), índices acumulados, carta |
| Contrato por modelo, vistoria por modelo do imóvel com fotos, recibo de chaves, documentos de entrada |
| Resultados por imóvel (com contas pagas por nós e ressarcimentos de condomínio), Excel |
| Calendário, fechamento do mês, cadastros incompletos, inadimplência, histórico de alterações |
| Usuários e papéis, backup diário, ZIP, backup seguro cifrado, versão sem internet |

| Em andamento |
|---|
| Nenhum item em andamento encontrado no código (sem `TODO`/`FIXME`). Nenhuma pendência informada pelo usuário |

Ver também: `documentacao/ARQUITETURA.md`, `documentacao/DECISOES.md`, `documentacao/GUIA_DE_MODIFICACAO.md`.
