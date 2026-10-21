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
- As tabelas são as chaves de `TABELAS` em `docs/js/regras.js` (ex.: `imoveis`, `contratos`, `cobrancas`, `faturas`, `emitentes`, `participacoes`, `fiadores`, `iptus`, `ressarcimentos`, `fechamentos`, `aditivos`, `solicitacoes`, `guias_impostos`…). `bancoVazio()` cria uma lista para cada uma.
- `id` de cada registro vem de `d.seq[tabela]` (em `inserir`).
- Dinheiro em **centavos inteiros**; datas `'AAAA-MM-DD'`; competência (mês de uso) `'AAAA-MM'`.
- `normalizar(d)` em `regras.js` migra bancos antigos ao abrir (campos renomeados, tabelas novas).

## Onde estão as regras
| Assunto | Arquivo → função |
|---|---|
| Gravar com histórico | `regras.js` → `inserir`, `atualizar`, `excluir`, `registrar`; desfazer pelo Histórico (só administrador, campo a campo, do mais recente ao mais antigo; boletos, NFs e usuários fora): `alteracoesDesfaziveis`, `desfazerAlteracoes`; `telas.js` → `desfazerItens` |
| Boleto do mês | `regras.js` → `montarCobranca`, `gerarCobrancas`, `recalcularCobrancas`, `boletoDoMes` (só o do aluguel); `calculos.js` → `calcularCobranca`, `totaisCobranca`. Complemento da caução (boleto à parte, campo `caucao_complemento`): `complementoCaucao`, `complementosCaucaoPendentes`, `gerarBoletoCaucao`, `ehComplementoCaucao`; ao pagar, `registrarPagamento` grava a correção da caução |
| Pagamento, multa, juros, valor da NF | `regras.js` → `registrarPagamento`, `baixarEmLote`; `calculos.js` → `liquidar`, `multaEJuros`, `valorNotaFiscal` |
| Numeração de NF | `regras.js` → `pendentesDeFatura`, `numerarFaturas`, `desfazerUltimaNumeracao`, `cancelarNumero`, `registrarNfExterna` |
| Reserva | `regras.js` → `reservaParaCompetencia`, `realocarReserva`, `alertaReservaParada` |
| IPTU | `regras.js` → `parcelasIptu` (parte do inquilino pelos dias e do proprietário), `totaisIptu`, `iptuNaCompetencia`, `competenciaDaParcela`, `alertasIptu` |
| Reajuste | `regras.js` → `mesDeAniversario`, `competenciaDoReajuste`, `reajusteNaCompetencia`, `calcularReajuste`, `aplicarReajuste`, `reajustesEntre`, `reajustesNaoCorrigidos` (tela Reajustes); aluguel inicial corrigido: `correcoesRecalculadas`, `recalcularCorrecoes`. Troca de garantia / fiador: `regras.js` → `trocarGarantia` (com os fiadores que entram, saem ou são corrigidos), `cancelarTrocaGarantia`; `formularios.js` → `trocaGarantia` |
| Ressarcimento de condomínio; contas pagas por nós | `regras.js` → `competenciaDoAbatimento`, `aplicarRessarcimentos`, `condominioAConferir`; `contasPermitidas`, `lancarDespesas` |
| Solicitações; ordem dos imóveis | `regras.js` → `solicitacoesDo`, `resumoSolicitacoes`; `telas.js` → `telaSolicitacoes`, `SITUACOES_SOLICITACAO`; `regras.js` → `imoveisPorEndereco` (mesmo endereço junto) |
| Saída do inquilino | `regras.js` → `encerrarContrato`, `calcularEncerramento` |
| Alertas e calendário | `regras.js` → `alertasContrato`, `todosAlertas` (ordem por `estiloAlerta`), `salvarEstilosAlertas`, `eventosDoMes`; `alertas.js`; `telas.js` → `classeAlerta` |
| Fechamento, resultados e impostos | `regras.js` → `etapasFechamento`, `resultadosFinanceiros`, `inadimplencia`; impostos: `impostosDoMes` (`IMPOSTOS`, adicional do IRPJ, `excedenteLc224`, guia abaixo de R$ 10 em `transportado`), `faturamentoNf`, `vencimentoGuia`/`diaUtilAteh` (feriados nacionais), `salvarGuiaImposto`; `telas.js` → `telaImpostos`, `abasResultados` |
| Validação de formulário | `formularios.js` → `ler`, `conferirDocumento`; `telas.js` → `CADASTROS.<tabela>.ajustar` e `conferir`; comprovantes (caução, depósito, reserva, aplicação, complemento) opcionais, com alerta até anexar: `COMPROVANTES_CONTRATO`, `conferirComprovantes`, `guardarComprovantes`, `regras.js` → `comprovantesPendentes`, `anexarComprovante`; valores do contrato inicial pedem duas confirmações: `confirmarValoresIniciais` (janela de `app.js` → `janela`); caução calculada: `ligarCaucao`, `regras.js` → `completarCaucao`; fiadores no cadastro do contrato: `formularios.js` → `fiadoresNoCadastro`, `vagasFiador` |
| Contrato e documentos | `contratos.js` → `dadosDoContrato`, `montarContrato`, `vistoriaBlocos`, `contratoDocx`; `regras.js` → `documentoEntrada` (próprio ou herdado; herdeiro nunca pendente: `contratoHerdado`, aditivo obrigatório `alertaAditivoHerdeiro`), `marcarDocumento`, `documentoPerdido`, `marcarDocumentoPerdido`, assinatura faltante `documentoParcial`/`anexarDocumentoParcial` (nomes de `partesDoContrato`), análise do administrador `analisarDocumento`, `registrarAditivo`, `cadeiaDeContratos`, `condicoesDoContrato`, `dadosDaPessoa`; locadora dos documentos (só ANK por enquanto): `contratos.js` → `locadorasDoContrato`; marca-d'água `marcaDagua`, assinaturas em conjuntos `gruposAssinatura`, "Página X de Y" `estiloRodape`. Exclusão e contrato sem imóvel: `regras.js` → `excluirContrato`, `contratosSemImovelVencidos`, `dataApagarSemImovel` (`DIAS_SEM_IMOVEL`); `telas.js` → `limparSemImovel` (ao abrir o Painel) |

## Fluxo típico: confirmar um pagamento
1. Tela `#/cobrancas` (`telas.js` → `telaCobrancas`) desenha o form `data-form="pagamento"`.
2. `app.js` captura o `submit` e chama `FORMULARIOS.pagamento(form)` em `telas.js`; um erro lançado abre a janela "Entendi" (`aviso(…, 'erro')` → `janelaErro`).
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
| ViaCEP | `telas.js` → `consultarCep` | `https://viacep.com.br/ws/<cep>/json/`; só preenche campos vazios, exceto o Estado (UF), que sempre segue o CEP; sem internet, `calculos.js` → `ufDoCep` |
| BrasilAPI (CNPJ) | `telas.js` → `consultarCnpj` | `https://brasilapi.com.br/api/cnpj/v1/<cnpj>` |
| Planilhas Excel | `fatura.js`, `telas.js` (`excelResultados`, `excelDoNumero`) | ExcelJS; modelo `docs/modelos/fatura-modelo.xlsx` ou o enviado pelo usuário |
| PDF | `telas.js` → `pdfDaFatura`; impressão do navegador | html2canvas + jsPDF |
| Word | `contratos.js` → `contratoDocx` | `.docx` montado à mão com JSZip |
| Emissor fiscal (NFS-e da prefeitura) | — | Não há integração no código, e o usuário decidiu não integrar com a prefeitura por enquanto. A NF oficial é emitida fora do sistema |
| Banco (boletos bancários) | `regras.js` → `dadosBoleto` | Só gera o texto/dados para copiar no banco; sem API bancária. API do C6 em estudo (fora do código): exige uma "ponte" com certificado mTLS, pois o C6 não aceita chamadas do navegador |

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
| Nomes de arquivo gerados pelo sistema | Os nomes atuais usam só ASCII (ex.: `vistoria-entrada-…jpg`, `contrato-de-locacao-assinado-2026-10-15.pdf` via `salvarAssinado`, `programa/administracao-imoveis.html`). Manter sem acento: a pasta interna do navegador (`?teste`) recusou nome com acento, e o usuário não precisa de acentos nos nomes. Para só listar arquivos use `pastaDoEscopo(escopo, id, false)`: abrir uma página não pode criar pasta vazia |
