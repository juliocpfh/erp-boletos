# Arquitetura

## Camadas
| Camada | Arquivos | Fala com |
|---|---|---|
| Interface (HTML em texto) | `docs/js/telas.js`, `docs/js/formularios.js`, `docs/css/estilo.css`, `docs/index.html` | chama `regras.js` dentro de `alterar()`; lê `E.d` direto para desenhar |
| Aplicação (estado, rotas, eventos) | `docs/js/app.js` | `telas.js` (TELAS/FORMULARIOS/ACOES), `armazenamento.js`, `backup-seguro.js` |
| Regras de negócio | `docs/js/regras.js`, `docs/js/alertas.js`, `docs/js/contratos.js` | `calculos.js`; recebem o banco `d` como parâmetro (não tocam em disco nem em DOM, exceto `contratos.js`, que só gera texto/HTML/DOCX) |
| Cálculo puro | `docs/js/calculos.js` | nada (só funções) |
| Dados | `docs/js/armazenamento.js` | File System Access API e IndexedDB (atalho da pasta) |

Regra prática: `regras.js` e `calculos.js` rodam no Node (são os testados em `tests/`). `telas.js` e `app.js` só rodam no navegador.

## Mapa de pastas
| Caminho | Responsabilidade |
|---|---|
| `docs/` | Raiz do site (GitHub Pages). Tudo que o navegador carrega |
| `docs/js/` | Código do sistema (ver `documentacao/RESUMO.md`) |
| `docs/css/estilo.css` | Estilo único, inclusive impressão (`@media print`) |
| `docs/vendor/` | Bibliotecas de terceiros copiadas (Excel, ZIP, PDF, captura de tela) |
| `docs/modelos/fatura-modelo.xlsx` | Modelo Excel da NF (abas por empresa) |
| `docs/offline/administracao-imoveis.html` | Programa inteiro em um arquivo (gerado, não editar) |
| `tools/gerar-offline.mjs`, `tools/fontes-offline.mjs` | Gera o arquivo offline e calcula o hash das fontes |
| `tests/*.test.mjs` | Testes `node:test` de regras, cálculos, contratos, formulários, backup e offline |

Na pasta de dados do usuário (não no repo): `imoveis-dados.json`, `backups/`, `arquivos/<imóvel>/...`, `modelos/` (ver `README.md`).

## Modelo de dados
- O banco é um objeto: `{ formato: 'imoveis-v1', revisao, seq, historico, listas, estilos_alertas, <tabela>: [ ... ] }` (`estilos_alertas`: aparência escolhida para cada tipo de alerta).
- As tabelas são as chaves de `TABELAS` em `docs/js/regras.js` (ex.: `imoveis`, `contratos`, `cobrancas`, `faturas`, `emitentes`, `participacoes`, `fiadores`, `iptus`, `ressarcimentos`, `fechamentos`, `aditivos`…). `bancoVazio()` cria uma lista para cada uma.
- `id` de cada registro vem de `d.seq[tabela]` (em `inserir`).
- Dinheiro em **centavos inteiros**; datas `'AAAA-MM-DD'`; competência (mês de uso) `'AAAA-MM'`.
- `normalizar(d)` em `regras.js` migra bancos antigos ao abrir (campos renomeados, tabelas novas).

## Onde estão as regras
| Assunto | Arquivo → função |
|---|---|
| Gravar com histórico | `regras.js` → `inserir`, `atualizar`, `excluir`, `registrar` |
| Boleto do mês | `regras.js` → `montarCobranca`, `gerarCobrancas`, `recalcularCobrancas`; `calculos.js` → `calcularCobranca`, `totaisCobranca` |
| Pagamento, multa, juros, valor da NF | `regras.js` → `registrarPagamento`, `baixarEmLote`; `calculos.js` → `liquidar`, `multaEJuros`, `valorNotaFiscal` |
| Numeração de NF | `regras.js` → `pendentesDeFatura`, `numerarFaturas`, `desfazerUltimaNumeracao`, `cancelarNumero`, `registrarNfExterna` |
| Reserva | `regras.js` → `reservaParaCompetencia`, `realocarReserva`, `alertaReservaParada` |
| IPTU | `regras.js` → `parcelasIptu`, `iptuNaCompetencia`, `competenciaDaParcela`, `alertasIptu` |
| Reajuste | `regras.js` → `mesDeAniversario`, `competenciaDoReajuste`, `reajusteNaCompetencia`, `calcularReajuste`, `aplicarReajuste` |
| Ressarcimento de condomínio | `regras.js` → `competenciaDoAbatimento`, `aplicarRessarcimentos`, `condominioAConferir` |
| Contas pagas por nós | `regras.js` → `contasPermitidas`, `lancarDespesas` |
| Saída do inquilino | `regras.js` → `encerrarContrato`, `calcularEncerramento` |
| Alertas e calendário | `regras.js` → `alertasContrato`, `todosAlertas` (ordem por `estiloAlerta`), `salvarEstilosAlertas`, `eventosDoMes`; `alertas.js`; `telas.js` → `classeAlerta` |
| Fechamento e resultados | `regras.js` → `etapasFechamento`, `resultadosFinanceiros`, `inadimplencia` |
| Validação de formulário | `formularios.js` → `ler`, `conferirDocumento`; `telas.js` → `CADASTROS.<tabela>.ajustar` e `conferir` |
| Contrato e documentos | `contratos.js` → `dadosDoContrato`, `montarContrato`, `vistoriaBlocos`, `contratoDocx`; `regras.js` → `documentoEntrada` (próprio ou herdado), `marcarDocumento`, `registrarAditivo`, `cadeiaDeContratos`, `condicoesDoContrato`, `dadosDaPessoa` |

## Fluxo típico: confirmar um pagamento
1. Tela `#/cobrancas` (`telas.js` → `telaCobrancas`) desenha o form `data-form="pagamento"`.
2. `app.js` captura o `submit` e chama `FORMULARIOS.pagamento(form)` em `telas.js`.
3. `FORMULARIOS.pagamento` valida e chama `alterar((db) => R.registrarPagamento(db, id, data, …))`.
4. `alterar` (`app.js`): relê `imoveis-dados.json`; se a `revisao` do disco mudou, troca `E.d` pela versão do disco; clona; aplica a função.
5. `registrarPagamento` usa `C.liquidar` e grava via `atualizar` → `registrar` adiciona a linha em `d.historico`.
6. `alterar` soma `revisao`, grava o arquivo (`S.gravarBanco`), faz o backup diário (1x por sessão) e espelha no backup seguro, se ligado.
7. `mostrar()` redesenha a tela a partir de `E.d`.

## Integrações externas
| Integração | Onde | Observação |
|---|---|---|
| Pasta local / OneDrive | `armazenamento.js` | O OneDrive só sincroniza a pasta; o código não fala com ele. Cópias em conflito são detectadas por nome (`copiasEmConflito`) |
| GitHub Pages | — | Hospeda `docs/` (README). Não há backend |
| ViaCEP | `telas.js` → `consultarCep` | `https://viacep.com.br/ws/<cep>/json/`; só preenche campos vazios |
| BrasilAPI (CNPJ) | `telas.js` → `consultarCnpj` | `https://brasilapi.com.br/api/cnpj/v1/<cnpj>` |
| Planilhas Excel | `fatura.js`, `telas.js` (`excelResultados`, `excelDoNumero`) | ExcelJS; modelo `docs/modelos/fatura-modelo.xlsx` ou o enviado pelo usuário |
| PDF | `telas.js` → `pdfDaFatura`; impressão do navegador | html2canvas + jsPDF |
| Word | `contratos.js` → `contratoDocx` | `.docx` montado à mão com JSZip |
| Emissor fiscal (NFS-e da prefeitura) | — | Não há integração no código, e o usuário decidiu não integrar com a prefeitura por enquanto. A NF oficial é emitida fora do sistema |
| Banco (boletos bancários) | `regras.js` → `dadosBoleto` | Só gera o texto/dados para copiar no banco; sem API bancária |

## Pontos sensíveis (mexer só com teste)
| Ponto | Por quê |
|---|---|
| `app.js` → `alterar` | Toda gravação passa por aqui; controla concorrência por `revisao` |
| `regras.js` → `normalizar` | Migra bancos reais antigos; remover um passo quebra dados existentes |
| Chaves de `TABELAS` e nomes de campos | Viram chaves no JSON do usuário; renomear exige migração em `normalizar` |
| Centavos (`calculos.js` → `arred`, `centavos`) | Arredondamento afeta boleto, NF e totais |
| `numerarFaturas` / `d.proxima_fatura` | Numeração fiscal contínua; número cancelado não volta |
| `montarCobranca` + `CAMPOS_RECALCULO` | O recálculo sobrescreve boletos em aberto (exceto `editado_manual`) |
| Reserva (`reservaParaCompetencia`, `realocarReserva`) | Já teve dois bugs corrigidos; há testes específicos em `tests/regras.test.mjs` |
| Reajuste (`mesDeAniversario`) | Regra de negócio definida pelo usuário (ver `documentacao/DECISOES.md`) |
| `auth.js` e `backup-seguro.js` | Mudar parâmetros de cifragem/iterações invalida senhas e backups já gravados |
| `tools/fontes-offline.mjs` | O hash decide se o teste do offline passa; inclui `docs/js`, `docs/vendor`, `docs/css/estilo.css`, o modelo xlsx e `tools/gerar-offline.mjs`. Usa caminhos com `/` e quebras de linha LF, para o mesmo hash no Windows (CRLF do Git) e no Linux |
| Nomes de arquivo gerados pelo sistema | Os nomes atuais usam só ASCII (ex.: `vistoria-entrada-…jpg`, `contrato-de-locacao-assinado-2026-10-15.pdf` via `salvarAssinado`, `programa/administracao-imoveis.html`). Manter sem acento: a pasta interna do navegador (`?teste`) recusou nome com acento, e o usuário não precisa de acentos nos nomes |
