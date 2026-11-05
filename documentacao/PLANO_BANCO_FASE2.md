# Plano — Integração C6 Bank, fase 2: extratos, comprovantes, conciliação e pagamentos
====================================================================

## 0. Resumo do pedido e do que já existe

Pedido do dono: (a) ler o extrato das duas contas (ANK e JCK) separadamente; (b) baixar o comprovante (PDF) de cada movimentação, dar o nome certo e guardar na pasta do PC para mandar ao contador; (c) atrelar cada movimentação a um imóvel e a uma conta do imóvel (água, luz, IPTU, condomínio…); (d) pagar as contas dos imóveis pelo ERP; (e) confirmar o pagamento de boletos/NF pelo extrato; (f) comprovantes anexados no imóvel e nas contas do imóvel.

O que o ERP já tem e o plano reaproveita (caminhos absolutos):
- Contas do imóvel: tabela `despesas` (`TABELAS.despesas: 'Conta paga por nós'`), `TIPOS_DESPESA = ['Água','Luz','Gás','Condomínio','Internet','Outra']`, `contasPermitidas(d, imovelId, comp)` e `lancarDespesas(d, imovelId, competencia, linhas, usuario)` em `/home/user/erp-boletos/docs/js/regras.js` (linhas ~3290-3346); tela `#/contas/<imovel>` = `telaContas(rota)` em `/home/user/erp-boletos/docs/js/telas/financeiro.js` (linha 44); `FORMULARIOS.lancarContas` em `telas/envios.js`; exclusão `TABELAS_EXCLUSAO.despesas: {}` em `telas/acoes.js` (linha 59); a etapa `contas` do fechamento (`etapasFechamento`, regras.js ~3421) considera lançado "uma conta do mês ou paga no mês".
- Pagamento de boleto: `registrarPagamento(d, cobrancaId, dataContabil, valorPago, usuario, { pagouEmDia, dataPagou, valorNf, justificativa })` (regras.js 1159), `previstoNoPagamento`, `conferirDivergencia` (valor diferente → fluxo `memoria.pagamentoDivergente` + `#/cobranca/ID?ir=pagamento` em `FORMULARIOS.pagamento`, envios.js 382), `estornarPagamento` (1190), `baixarEmLote` (3472), `faturasDe`.
- IPTU: `parcelasIptu(d, p)` devolve `{ n, rotulo, valor, proprietario, valorProprietario, vencimento, paga }`; `marcarIptuPago(d, iptuId, n, data, usuario)` grava `iptus.pagas[n] = data` (n=0 → `data_quitacao`); guias na pasta `IPTU (guias)/<ano>` (escopo `iptuano`, id = `idGuiasDoAno(imovelId, ano) = imovelId*10000+ano`, `telas/comum.js` 113).
- Impostos: `guias_impostos` (`salvarGuiaImposto`), tela `telaImpostos`.
- Pastas e anexos (`telas/comum.js`): `SUBPASTAS = { imovel: 'Matrículas', matricula, anuncio: 'Anúncio', iptu: 'IPTU (guias)', reformas: 'Reformas' }`, `pastaDoEscopo(escopo, id, criar)` (324), `chavePasta` (131), `vinculoDoEscopo` (128), `imovelDoEscopo` (115), `listaArquivos` (655), `caixaArquivos(escopo, id, titulo, ancora, ajuda, dentro, enviar)` (633), `anexosEmUso`, `alterarApagandoAnexos(fn)` (313), `apagarAnexos`, `conferirArquivos` (387 — ATENÇÃO: hoje pula tudo que não é de contrato: `if (vistos.has(chave) || !buscar('contratos', a.id)) continue;`), `semAcentoArquivo`, `extensao`; `ACOES.enviarArquivos/abrirArquivo/baixarArquivo/excluirArquivo` (acoes.js 1255-1296); `S.salvarArquivo(dir, File)` numera repetidos "(2)", `S.limparNome`, `S.subpasta`, `S.lerConteudo`. Em regras.js: `arquivosReferenciados(d)` (2839) e `rotulosDosArquivos(d)` (2890) — todo campo novo de arquivo entra nos dois.
- Gravação: `alterar((db) => …)` (`app.js` 89, fila), `inserir/atualizar/excluir/registrar` (regras.js 257-295), `OCULTOS`, `SEM_DESFAZER` (301). Papéis: `podeUsuario('admin'|'operador')` (`auth.js`: consulta 0, operador 1, admin 2). Janela de confirmação: `janela({ titulo, html, sim, nao, forte, ligar })` (app.js 228) devolve `{ campo: [valores] }` ou null. Avisos: `aviso(texto, 'ok'|'info'|'aviso'|'erro')`.
- Rotas: `TELAS` em `/home/user/erp-boletos/docs/js/telas.js` (`contas: (rota) => telaContas(rota)` etc.); `MENU` em `app.js` 392; `?ir=<id>` rola até a âncora.
- Emitentes/participações: `emitentes` (ANK, JCK), `participacoesDo(d, imovelId)` → `[{ emitente_id, percentual }]`; `config_banco.contas[].emitente_id` liga conta bancária ↔ empresa.
- Testes: `node:test`, fixture `base()` em `tests/regras.test.mjs` e `tests/rotina.test.mjs` (CPF 529.982.247-25, CNPJ 11.222.333/0001-81); `node tools/checar.mjs` (esbuild + testes), `--offline` regenera a versão sem internet (o hash em `tools/fontes-offline.mjs` inclui todo `docs/js`, inclusive arquivos novos). Modo `?teste`: pasta OPFS `teste-imoveis`, recusa nomes com acento.

Decisões de negócio já registradas que o plano respeita: contas pagas por nós só nos casos de `contasPermitidas` (DECISOES 2026-10-13); R$ 0,00 só com observação; nomes de arquivo sem acento; comprovante anexado tem etiqueta 🔗 e não tem "Excluir" na caixa (apaga-se no lançamento); boletos emitidos só pela ANK (DECISOES 2026-10-16) — mas as DUAS contas têm extrato e pagam contas.

--------------------------------------------------------------------
## 1. Modelo de dados
--------------------------------------------------------------------

### 1.1 Tabelas novas (acrescentar em `TABELAS`, regras.js)
```js
movimentacoes_banco: 'Movimentação bancária',
pagamentos_banco: 'Pagamento pelo banco',
```
`bancoVazio()`/`normalizar()` criam as listas sozinhos (laço sobre `TABELAS`).

**`movimentacoes_banco`** (uma linha por lançamento do extrato; nunca editada à mão nos campos do banco):
| campo | tipo | observação |
|---|---|---|
| `id` | nº | seq |
| `conta_id` | `'ank'`/`'jck'` | id em `config_banco.contas[].id` |
| `id_externo` | texto | id do lançamento no C6 (vem da ponte). Sem id, a ponte gera `sha1(data|valor|tipo|descricao|ordem_no_dia)` — único por `(conta_id, id_externo)` |
| `data` | `'AAAA-MM-DD'` | data do lançamento (a ponte converte para data local) |
| `valor` | centavos inteiros, sempre > 0 | sinal fica em `tipo` |
| `tipo` | `'entrada'`/`'saida'` | |
| `descricao` | texto | como veio do banco (ex.: "PAGAMENTO BOLETO SANEPAR") |
| `contrapartida` | `{ nome, documento }` ou null | quem pagou/recebeu, se o banco informa |
| `categoria_banco` | texto | PIX, BOLETO, TED, TARIFA, … (como veio) |
| `nosso_numero` | texto ou null | só em liquidação de boleto nosso (quando o C6 informa) |
| `saldo_apos` | centavos ou null | |
| `importada_em` | ISO | |
| `classificacao` | uma de `CLASSIFICACOES` (abaixo) ou null | null = "sem destino" (pendente) |
| `imovel_id` | nº ou null | |
| `despesa_id` | nº ou null | conta do imóvel criada/ligada (`despesas`) |
| `cobranca_id` | nº ou null | boleto cujo pagamento foi confirmado por esta movimentação |
| `iptu_id`, `iptu_parcela` | nº/nº ou null | parcela paga (n; 0 = cota única) |
| `guia_imposto_id` | nº ou null | |
| `pagamento_banco_id` | nº ou null | pagamento feito pelo ERP que gerou esta saída |
| `par_movimentacao_id` | nº ou null | transferência entre as duas contas: a outra ponta |
| `nome_arquivo` | texto ou null | nome escolhido pelo usuário (sem extensão) |
| `comprovante` | texto ou null | nome do PDF na pasta do imóvel (escopo `contasano` ou `iptuano`) |
| `comprovante_contador` | texto ou null | nome do PDF na pasta do contador (escopo `contador`) |
| `comprovante_origem` | `'banco'`/`'ponte'`/`'manual'` ou null | PDF do C6, gerado pela ponte, ou anexado do PC |
| `observacoes` | texto | |
| `classificada_em`, `classificada_por` | ISO / login | |

```js
export const CLASSIFICACOES = {
  conta_imovel: 'Conta do imóvel (água, luz, gás, condomínio, internet, outra)',
  boleto: 'Aluguel recebido (boleto)',
  iptu: 'IPTU pago na prefeitura',
  imposto: 'Imposto da empresa (PIS/COFINS, IRPJ, CSLL)',
  tarifa: 'Tarifa do banco',
  transferencia: 'Transferência entre as nossas contas',
  outro: 'Outro (só comprovante, sem imóvel)',
  ignorar: 'Não é nosso / ignorar',
};
```

**`pagamentos_banco`** (conta do imóvel paga pelo ERP; nunca automático):
| campo | observação |
|---|---|
| `id`, `conta_id`, `imovel_id` | |
| `origem` | `{ tipo: 'despesa'|'iptu'|'guia_imposto'|'avulso', id, n }` (`n` = parcela do IPTU) |
| `tipo_conta` | um de `TIPOS_DESPESA` ou `'IPTU'`/`'Imposto'` |
| `competencia` | `'AAAA-MM'` (mês da conta) |
| `forma` | `'boleto'` (código de barras / linha digitável) ou `'pix'` (chave ou copia-e-cola) |
| `codigo_barras` | só dígitos (44, 47 ou 48) ou null |
| `chave_pix`, `pix_copia_cola` | texto ou null |
| `beneficiario` | `{ nome, documento }` |
| `valor` | centavos |
| `vencimento`, `data_pagamento` | datas (pagamento = quando o banco deve pagar; padrão hoje) |
| `situacao` | `'rascunho'` → `'aguardando_aprovacao'` → `'agendado'` → `'pago'` ; `'erro'` ; `'cancelado'` |
| `criado_por`, `criado_em`, `aprovado_por`, `aprovado_em`, `enviado_em` | |
| `id_externo` | id do pagamento na ponte/C6 (preenchido ao enviar) |
| `referencia` | `'erp-<id>'`: chave de idempotência que a ponte usa para nunca pagar duas vezes |
| `pago_em`, `erro` | |
| `movimentacao_id` | saída do extrato que confirmou |
| `comprovante`, `comprovante_contador` | PDF do pagamento (mesmas pastas do item 2) |

### 1.2 Campos novos em tabelas existentes
- `despesas`: `movimentacao_id` (null), `pagamento_banco_id` (null), `comprovante` (nome do PDF na pasta `Contas pagas/<ano>`; cópia do nome em `movimentacoes_banco.comprovante` quando veio do extrato — a fonte da verdade é a movimentação; a despesa guarda para a tela `#/contas` listar sem procurar).
- `cobrancas`: `movimentacao_id` (null) — pagamento confirmado pelo extrato. `estornarPagamento` passa a zerar `movimentacao_id` e a devolver a movimentação a "sem destino" (limpa `cobranca_id`/`classificacao`).
- `iptus`: nada novo (`pagas[n]` continua); o comprovante da parcela fica na movimentação (`iptu_id`+`iptu_parcela`), na pasta `IPTU (guias)/<ano>` (escopo `iptuano` já existente).
- `config_banco` (novos, com padrão em `CONFIG_BANCO_PADRAO`): `pasta_contador: '_Contador'`, `modelo_nome_comprovante: '{data} {empresa} {imovel} {tipo} {valor}'`, `tolerancia_dias: 3` (conciliação de boletos), `permitir_pagamentos: false`, `limite_pagamento: 0` (0 = sem limite; centavos), `ultima_importacao: {}` (`{ ank: 'AAAA-MM-DD' }`), `copiar_para_contador: true`.

### 1.3 `normalizar()` (acrescentar no fim; nunca remover)
```js
// Fase 2 do banco: extrato, conciliação e pagamentos
d.config_banco = { ...CONFIG_BANCO_PADRAO, ...d.config_banco }; // já feito pela base; garante os campos novos
if (!d.config_banco.ultima_importacao || typeof d.config_banco.ultima_importacao !== 'object') d.config_banco.ultima_importacao = {};
for (const m of d.movimentacoes_banco) { if (m.classificacao === undefined) m.classificacao = null; if (m.valor < 0) { m.valor = -m.valor; m.tipo = 'saida'; } }
for (const p of d.pagamentos_banco) if (!p.referencia) p.referencia = `erp-${p.id}`;
// despesa ligada a movimentação que sumiu (ex.: importação refeita) perde o vínculo
for (const x of d.despesas) if (x.movimentacao_id && !d.movimentacoes_banco.some((m) => m.id === x.movimentacao_id)) x.movimentacao_id = null;
```
- `SEM_DESFAZER`: acrescentar `'movimentacoes_banco'`, `'pagamentos_banco'` (dados do banco e pagamentos não se desfazem pelo Histórico).
- `OCULTOS`: nada novo (a senha da ponte está em `config_banco`, que não é tabela; o pacote base deve garantir que, ao salvar a configuração, o `registrar(...)` não ponha `senha_ponte` em `detalhes`).
- Ids de pasta (puros, em regras.js, para A e C usarem o mesmo cálculo):
```js
export const idPastaAno = (imovelId, ano) => imovelId * 10000 + ano;            // igual a idGuiasDoAno (comum.js)
export const idContador = (emitenteId, comp) => emitenteId * 1000000 + Number(String(comp).replace('-', '')); // 1, '2026-11' → 1202611
export const decodificarIdContador = (id) => ({ emitenteId: Math.floor(id / 1000000), comp: `${String(id % 1000000).slice(0, 4)}-${String(id % 1000000).slice(4)}` });
```

### 1.4 Regras puras (arquivo NOVO `docs/js/conciliacao.js`, roda no Node, testado)
Por que arquivo novo: `regras.js` tem ~4.000 linhas e está sendo editado pelo pacote base; `alertas.js`/`contratos.js` já são regras em arquivos separados. `conciliacao.js` importa `regras.js` (`inserir`, `atualizar`, `excluir`, `buscar`, `registrar`, `registrarPagamento`, `previstoNoPagamento`, `totais`, `marcarIptuPago`, `lancarDespesas`, `contasPermitidas`, `participacoesDo`, `boletoDoMes`, `idPastaAno`, `idContador`, `CLASSIFICACOES`) e `calculos.js`; `regras.js` NÃO importa `conciliacao.js` (sem ciclo). Em `regras.js` ficam só o que `arquivosReferenciados`/`rotulosDosArquivos`/`etapasFechamento`/`todosAlertas` precisam (laços simples sobre `d.movimentacoes_banco`).

Assinaturas (contrato fixo entre pacotes):
```js
// Importação
export function importarExtrato(d, contaId, lancamentos, usuario, { de = null, ate = null } = {})
// lancamentos: [{ id_externo, data, valor_centavos, tipo, descricao, contrapartida, categoria, nosso_numero, saldo_apos }] (formato da ponte, item 5)
// → { novas: [mov], repetidas: n, conta }  — repetida = mesmo (conta_id, id_externo); grava config_banco.ultima_importacao[contaId] = ate || hoje
//   usa inserir() por linha (histórico: "Extrato ANK: 10/2026 · entrada R$ 1.219,50 · PAGAMENTO BOLETO…"); lança Error se a conta não existe em config_banco.contas
export const contaDo = (d, contaId) => d.config_banco.contas.find((c) => c.id === contaId) || null
export const empresaDaConta = (d, contaId) => emitente ligado (buscar emitentes por contaDo(...).emitente_id) || null
export function contaSugeridaDoImovel(d, imovelId) // participação de maior % cuja empresa tem conta; empate/sem → config_banco.conta_padrao_id || contas[0].id

// Consulta
export function movimentacoesDo(d, { conta_id = null, mes = null, imovel_id = null, filtro = 'todas' } = {})
// filtro: 'todas' | 'pendentes' (classificacao null) | 'entradas' | 'saidas' | 'sem_comprovante' (classificada, não 'ignorar'/'transferencia', sem comprovante); ordem: data desc, id desc
export function resumoBanco(d, contaId, mes) // → { entradas, saidas, total, pendentes, semComprovante, importadoAte }
export const SITUACOES_PAGAMENTO = { rascunho: 'Rascunho', aguardando_aprovacao: 'Aguardando aprovação do administrador', agendado: 'Enviado ao banco (agendado)', pago: 'Pago', erro: 'Erro no banco', cancelado: 'Cancelado' }

// Nome do comprovante
export function nomeComprovante(d, mov, { modelo = d.config_banco.modelo_nome_comprovante, extensao = '.pdf' } = {})
// tokens: {data} AAAA-MM-DD · {empresa} apelido da conta ou nome curto do emitente (ANK/JCK) · {imovel} nome do imóvel ou 'Geral' · {tipo} tipo da despesa / 'Aluguel <inquilino>' / 'IPTU <ano> <n>a parcela' / 'Imposto …' / 'Tarifa' / 'Transferencia' / 'Outro' · {valor} '1.234,56' · {mes} AAAA-MM da competência · {contrapartida}
// resultado SEM ACENTO (normalize NFD + remove ̀-ͯ), sem caracteres proibidos (S.limparNome equivalente puro: [<>:"/\\|?*]), espaços simples, máx. 120 chars + extensão. Ex.: "2026-11-05 ANK Loja 1 Agua 123,45.pdf"
export const nomeSemAcento = (texto) => …  // exportado para testes e para a tela

// Sugestões
export function sugerirDestino(d, mov)
// → { classificacao, imovel_id, tipo_despesa, cobranca_id, iptu: { id, n }, motivo, confianca: 'alta'|'media'|'baixa' } ou null. Ordem:
//  1) saída com pagamento_banco pendente de mesmo conta/valor/data±2 → classificacao do pagamento (confianca alta)
//  2) nosso_numero == cb.banco.nosso_numero (se existir; "a confirmar" com a base) → 'boleto' alta
//  3) texto da descricao/contrapartida contém sanepar_matricula / copel_uc / gas_relogio / administradora_nome / inscricao_iptu / nome do imóvel → 'conta_imovel' (tipo pelo campo: Água/Luz/Gás/Condomínio) ou 'iptu' (média)
//  4) memória: última movimentação já classificada com a mesma contrapartida.documento ou mesma descricao "normalizada" (sem números) → repete imóvel/tipo (média)
//  5) entrada com valor igual a um boleto em aberto (conciliarBoletos) → 'boleto' (alta se único)
//  6) descricao com 'TARIFA'/'TAR ' → 'tarifa'; contrapartida.documento == CNPJ da outra conta → 'transferencia' (alta)
export function conciliarBoletos(d, movs, { dias = d.config_banco.tolerancia_dias } = {})
// só entradas; para cada boleto em aberto (sem data_pagamento, situacao != 'Carência'): bate se nosso_numero igual OU (valor == totais(cb).a_pagar_pontual e data <= vencimento + dias) OU (valor == previstoNoPagamento(cb, data).valor_devido) ; → [{ movimentacao_id, cobranca_id, certeza: 'exata'|'provavel', previsto, pagouEmDia }]; dois boletos com o mesmo valor no mesmo intervalo → ambos 'provavel' (nunca automático)

// Vínculos (todos registram histórico; todos lançam Error em português se inválido)
export function vincularMovimentacao(d, movId, destino, usuario)
// destino: { classificacao, imovel_id, tipo_despesa, competencia, observacoes, iptu_id, iptu_parcela, guia_imposto_id, par_movimentacao_id, nome_arquivo }
//  'conta_imovel' → lancarDespesas(d, imovel_id, competencia, [{ tipo, valor: mov.valor, data_pagamento: mov.data, observacoes }], usuario) (respeita contasPermitidas; mensagem da regra sobe para a tela) e liga despesa.movimentacao_id/mov.despesa_id
//  'iptu' → exige parcela em aberto e proprietario; marcarIptuPago(d, iptu_id, n, mov.data, usuario)
//  'imposto' → liga guia_imposto_id (se dado) e grava data_pagamento na guia (campo novo `paga_em` em guias_impostos, opcional)
//  'transferencia' → liga par (a outra movimentação, se achada por valor/data na outra conta) e marca as duas
//  'boleto' → use confirmarPagamentoPeloExtrato (lança Error se chamado por aqui)
//  movimentação já classificada → Error 'Esta movimentação já tem destino. Desfaça antes.'
export function confirmarPagamentoPeloExtrato(d, movId, cobrancaId, usuario, { pagouEmDia = false, valorNf = null, justificativa = '' } = {})
// → { divergente: true, previsto, recebido } SEM GRAVAR quando mov.valor != previsto.valor_devido e valorNf === null (a tela segue o fluxo de divergência existente e chama de novo com valorNf/justificativa);
//   senão registrarPagamento(d, cb.id, mov.data, mov.valor, usuario, { pagouEmDia, valorNf, justificativa }) + cb.movimentacao_id + mov.cobranca_id/imovel_id/classificacao 'boleto'. Erros: já paga, já tem NF, mov não é entrada, mov já usada.
export function desvincularMovimentacao(d, movId, usuario)
// desfaz o que vincular fez: despesa criada por ela é excluída (só se não tem pagamento_banco), IPTU volta a em aberto (marcarIptuPago com ''), boleto NÃO: Error 'Desfaça o pagamento do boleto na tela Boletos' (estornarPagamento limpa o vínculo). Mantém comprovantes já baixados? Não: devolve a lista de arquivos que ficaram sem uso → a tela usa alterarApagandoAnexos.
export function registrarComprovante(d, movId, { comprovante = null, comprovante_contador = null, origem = 'banco', nome_arquivo = null }, usuario)
export function removerComprovante(d, movId, usuario) // zera os três campos (a tela apaga os arquivos via alterarApagandoAnexos)
export function escopoDoComprovante(d, mov) // → { escopo: 'contasano'|'iptuano'|'contador', id } onde o PDF do imóvel fica (iptu → iptuano com idPastaAno(imovel, ano do IPTU); demais com imóvel → contasano idPastaAno(imovel, ano da data); sem imóvel → só contador)
export function escopoContador(d, mov) // → { escopo: 'contador', id: idContador(emitente_id da conta, competência (mes da data)) } ou null se a conta não tem empresa

// Pagamentos (nunca automáticos)
export function validarCodigoBarras(texto) // → só dígitos; aceita 44 (código) ou 47 (linha digitável de boleto) ou 48 (arrecadação/concessionária); Error em português se não
export function prepararPagamento(d, dados, usuario) // dados: { conta_id, imovel_id, origem, tipo_conta, competencia, forma, codigo_barras|chave_pix|pix_copia_cola, beneficiario, valor, vencimento, data_pagamento } → inserir 'aguardando_aprovacao' com referencia 'erp-<id>'; Error se !config_banco.permitir_pagamentos, valor <= 0, acima de limite_pagamento, conta inexistente, imóvel inexistente, mesma conta+código+valor já 'agendado'/'pago' (duplicidade)
export function aprovarPagamento(d, pagId, aprovador) // 'aguardando_aprovacao' → 'agendado'? NÃO: a aprovação só marca aprovado_por/aprovado_em e devolve o pedido pronto para a ponte; a situação vira 'agendado' em marcarPagamentoEnviado. Error se já aprovado/situação errada.
export function marcarPagamentoEnviado(d, pagId, { id_externo, situacao = 'agendado', erro = null }, usuario)
export function atualizarPagamento(d, pagId, { situacao, pago_em = null, erro = null }, usuario)
// ao virar 'pago': origem 'despesa' → atualizar despesa { data_pagamento: pago_em, pagamento_banco_id }; origem 'avulso' → lancarDespesas (cria a conta); origem 'iptu' → marcarIptuPago; origem 'guia_imposto' → paga_em
export function cancelarPagamento(d, pagId, usuario) // só rascunho/aguardando_aprovacao/erro (agendado: depende da ponte cancelar; a tela chama a ponte antes)
export function conciliarPagamentoComExtrato(d, pagId, movId, usuario) // liga os dois; movimentação fica classificada pela origem do pagamento
export function pagamentosDo(d, { imovel_id = null, situacao = null, conta_id = null } = {})
export function pendenciasBanco(d, mes) // → { semDestino: n, semComprovante: n, contasSemImportar: ['ank'], pagamentosPendentes: n } (usado em etapasFechamento e todosAlertas)
```

Em `regras.js` (pacote A) além de TABELAS/normalizar:
- `arquivosReferenciados`: `for (const m of d.movimentacoes_banco) { usa(escopoImovel(m).escopo, escopoImovel(m).id, m.comprovante); usa('contador', idContador(...), m.comprovante_contador); }` e o mesmo para `pagamentos_banco` (`comprovante`, `comprovante_contador`). Como `escopoDoComprovante` está em conciliacao.js, duplicar o cálculo mínimo em regras.js como função interna `pastaDoComprovante(d, m)` (ou mover essa função pura para regras.js e reexportar em conciliacao.js — preferível: fica em regras.js e conciliacao.js reexporta).
- `rotulosDosArquivos`: etiqueta "comprovante do banco ANK: Água 11/2026 (05/11/2026, R$ 123,45)"; contador: "cópia para o contador (ANK 11/2026)".
- `etapasFechamento`: nova etapa `{ chave: 'banco', titulo: 'Conferir o extrato de ${compBr(mes)} das contas (ANK e JCK) e dar destino às movimentações', pendentes: semDestino + contasSemImportar.length, detalhe: 'ANK: 3 sem destino · JCK: extrato ainda não buscado' , link: '#/banco?mes=…', manual: false, contas: [...] }`, só se `d.config_banco.ativo`. Colocar depois de 'pagamentos'.
- `todosAlertas`: `alertaBanco(d, hoje)` → `{ nivel: 'info', tipo: 'Banco', texto: 'N movimentações do extrato sem destino; M comprovantes não baixados.', ancora: null }` com `imovel: ''`, link tratado em `linkAlerta` (tipo 'Banco' → `#/banco`). Só se `config_banco.ativo`.
- `estornarPagamento`: limpar `movimentacao_id` do boleto e `cobranca_id`/`classificacao`/`imovel_id` da movimentação (volta a pendente).
- `TABELAS_EXCLUSAO.despesas` (acoes.js, pacote C): `depois: (db, r) => { mov ligada → atualizar mov { despesa_id: null, classificacao: null } }`; checar: Error se `r.pagamento_banco_id` com situação agendado/pago ('Esta conta foi paga pelo banco; não pode ser excluída.').
- Cascata `ACOES.excluir` de imóveis (acoes.js 656): movimentações do imóvel ficam com `imovel_id: null, classificacao: null, despesa_id: null` (nunca apagar o extrato).

--------------------------------------------------------------------
## 2. Pastas dos comprovantes
--------------------------------------------------------------------
Dentro de `arquivos/` (S.PASTA_ARQUIVOS):
- Do imóvel: `arquivos/<Imóvel>/Contas pagas/<ano>/<nome>.pdf` — escopo novo **`contasano`**, id = `idPastaAno(imovelId, ano)`; `SUBPASTAS.contas = 'Contas pagas'`; em `pastaDoEscopo`: `if (escopo === 'contasano') return S.subpasta(raiz, [i.pasta || i.nome, SUBPASTAS.contas, String(id % 10000)], criar);`; `imovelDoEscopo` trata `contasano` como `iptuano`; `chavePasta` idem (`[i.pasta||i.nome, 'Contas pagas', ano].join('/')`).
- IPTU: `arquivos/<Imóvel>/IPTU (guias)/<ano>/` (escopo `iptuano` existente).
- Contador: `arquivos/_Contador/<Empresa>/<AAAA-MM>/<nome>.pdf` — escopo novo **`contador`**, id = `idContador(emitenteId, comp)`; `PASTA_CONTADOR = d().config_banco.pasta_contador || '_Contador'`; nome da empresa = `S.limparNome(emitente.nome)`; `pastaDoEscopo`: `if (escopo === 'contador') { const { emitenteId, comp } = R.decodificarIdContador(id); return S.subpasta(raiz, [PASTA_CONTADOR, buscar('emitentes', emitenteId).nome, comp], criar); }`; `vinculoDoEscopo('contador')` → `{}` (sem imóvel); `chavePasta` → `_Contador/<Empresa>/<comp>`.
- O "_" no nome deixa a pasta no topo e separada dos imóveis. VERIFICAR (pacote C) que `organizarPastas`/`limparSemImovel` (comum.js) não mexem em pastas que não sejam de imóvel cadastrado nem `Sem imóvel` — hoje só percorrem as pastas conhecidas; confirmar lendo `organizarPastas` (~comum.js 480-560) antes de criar `_Contador`.
- Mesmo arquivo gravado duas vezes (imóvel e contador) via `S.salvarArquivo(dir, new File([blob], nome, { type: 'application/pdf' }))` — ele numera "(2)" se já existir; os dois nomes finais ficam nos campos. `copiar_para_contador: false` desliga a cópia.
- `arquivosReferenciados` + `rotulosDosArquivos` + `conferirArquivos` + `alterarApagandoAnexos` passam a cobrir os dois escopos. **Correção obrigatória em `conferirArquivos` (comum.js 395)**: trocar `!buscar('contratos', a.id)` por `!existeDonoDoEscopo(a.escopo, a.id)` (`escopoDoContrato` → contrato existe; `iptuano`/`contasano` → imóvel existe; `contador` → emitente existe); `arquivosFaltando` ganha `escopo`/`id` genéricos e `alertaArquivosFaltando` mostra "comprovante do banco …" com link `#/banco`. `ancoraDoArquivo` devolve `'banco'` para esses escopos.
- `listaArquivos('contasano', id)`: tabela padrão, com etiqueta 🔗 e sem Excluir (apaga-se pela movimentação). `caixaArquivos('contasano', idPastaAno(i.id, ano), 'Comprovantes de <ano>', 'comprovantes-<ano>', '', true, false)` na caixa do imóvel (sem "Anexar": o anexo manual é pela linha da movimentação ou da conta).
- Nomes: sempre `nomeComprovante` (sem acento, `?teste` recusa acento). Renomear depois (o usuário mudou o nome): `renomearComprovante(mov, novoNome)` na tela (comum.js: abrir, salvar com o novo nome, remover o antigo, `registrarComprovante`) — reaproveita o padrão de `acertarNomesDosComprovantes`.

--------------------------------------------------------------------
## 3. Telas
--------------------------------------------------------------------
Arquivo NOVO `docs/js/telas/banco.js` (1ª linha: `// Banco: extrato das contas (#/banco), destino das movimentações, comprovantes, caixa do imóvel e pagamentos pelo banco.`). Exporta `telaBanco`, `caixaBancoImovel`, `caixaPagarPeloBanco`, `caixaConfigBanco2`, `ACOES_BANCO`, `FORMULARIOS_BANCO`. Importa `conciliacao.js` (`import * as Z`), `banco.js` (cliente da ponte), `comum.js`, `app.js`. NÃO importa `acoes.js`/`envios.js` (eles é que fazem `Object.assign(ACOES, ACOES_BANCO)` / `Object.assign(FORMULARIOS, FORMULARIOS_BANCO)` — uma linha cada).

### 3.1 `#/banco` — `telaBanco(rota)`; `rota.q`: `conta` ('ank'|'jck'; padrão `conta_padrao_id` ou a 1ª), `mes` (padrão mês atual), `filtro`, `imovel` (filtra), `busca`
- Se `!config_banco.ativo` ou sem contas: cartão "O banco ainda não está configurado. Vá em Dados e backup → Banco (C6)." com link.
- Cabeçalho: `<h1>Banco</h1>`; abas por conta (modelo `abasResultados` em financeiro.js): "ANK · Banco C6" | "JCK · Banco C6"; navegação de mês (← mês →, como `telaFechamento`); botões: `botao('buscarExtrato', 'Buscar o extrato de <mês> no banco', { conta, mes }, 'botao')` (opera), `botao('saldoBanco', 'Ver saldo', …)`.
- Faixa de situação da ponte: `Z`/`banco.js` `pontePronta()` → "Ponte ligada" (etiqueta ok) ou aviso em texto simples: "A ponte com o banco não respondeu. Abra o programa 'Ponte C6' neste computador e tente de novo. Você ainda pode ver o que já foi importado."
- Números (como `telaInadimplencia`): Entradas · Saídas · Sem destino · Sem comprovante · "extrato buscado até DD/MM".
- Filtros (links `botao pequeno`): Todas | Sem destino | Entradas | Saídas | Sem comprovante; campo de busca (form `data-form="buscaBanco"`).
- Tabela `class="cobrancas responsiva"` dentro de `.cartao.rolagem`, 1ª linha `th`: Data | Movimentação | Valor | Destino | Comprovante | (ações).
  - Movimentação: `descricao` em negrito, `contrapartida.nome` embaixo em `.suave`, `categoria_banco` como etiqueta neutra; se sem destino e há sugestão: etiqueta info "parece: Loja 1 · Água" + botão "Usar sugestão".
  - Valor: entrada em verde (`+ R$`), saída normal (`− R$`).
  - Destino: "Loja 1 · Água 11/2026" (link `#/contas/<imovel>`) · "Aluguel Maria Exemplo · boleto 10/2026" (link `#/cobranca/ID`) · "IPTU 2026 · 3ª parcela" (link `#/imovel/ID?ir=iptu`) · "Tarifa do banco" · "Transferência ANK → JCK" · "Ignorada" (riscado) · "— sem destino" (etiqueta aviso).
  - Comprovante: 📎 nome (abre: `abrirArquivo` com escopo/id da movimentação) + "×" (remove só o arquivo, volta "⚠ baixar comprovante") ; ou `botao('nomearComprovante', 'Nomear e baixar comprovante', { id })`; se a ponte está desligada: `label.enviar` "Anexar do PC" (`data-upload="movbanco:<id>"`, tratado em `ACOES_BANCO.enviarArquivos`? Não: `ACOES.enviarArquivos` é genérico por escopo; criar ação própria `data-upload-mov` ligada em `FORMULARIOS_BANCO`/evento no `ligar` da tela, ou reaproveitar `enviarArquivos` com escopo `movbanco` que `pastaDoEscopo` resolve para a pasta da movimentação — escolher a 2ª: `pastaDoEscopo('movbanco', movId)` → `escopoDoComprovante`).
  - Ações (opera): `Atrelar a imóvel/conta` · (entrada) `É o pagamento do boleto…` · `Outro destino ▾` (tarifa, transferência, imposto, outro, ignorar) · se classificada: `botao('desvincularMov', '×', { id }, 'x-excluir', 'Desfazer o destino desta movimentação?')`.
- Rodapé: `<p class="suave">` explicando: "Busque o extrato uma vez por mês (ou quando quiser). Cada linha precisa de um destino: um imóvel e a conta (água, luz…), um boleto recebido, o IPTU, um imposto, tarifa ou transferência entre as contas. O comprovante é baixado do banco com o nome padrão e guardado na pasta do imóvel (Contas pagas/ano) e na pasta do contador (_Contador/Empresa/AAAA-MM)."

Janelas (`janela()` de app.js):
- **Atrelar a imóvel/conta** (`ACOES_BANCO.atrelarMov({ id })`): `<select name="imovel">` (sugestão pré-marcada; opção "— sem imóvel"), `<select name="tipo">` (TIPOS_DESPESA + "IPTU" + "Imposto da empresa" + "Tarifa do banco" + "Transferência" + "Outro"), `<input type="month" name="competencia">` (padrão mês da data), ao escolher IPTU: `<select name="parcela">` com as parcelas do proprietário em aberto (`ligar(dlg)` troca), `<textarea name="obs">`, checkbox `baixar` "Baixar o comprovante do banco e guardar com o nome padrão" (marcado), `<input name="nome">` com `nomeComprovante` (editável; `ligar` recalcula ao mudar imóvel/tipo, só se o usuário não digitou). Confirmar → `alterar((db) => Z.vincularMovimentacao(db, id, destino, login()))`; se `baixar`: `baixarEGuardarComprovante(mov)` (item abaixo). Erro de `contasPermitidas` vira `aviso(e.message, 'erro')` (janela "Entendi"), com a dica: "Se a conta é do inquilino mas foi paga por nós, escolha 'Outro' e escreva o motivo."
- **É o pagamento do boleto…** (`ACOES_BANCO.pagamentoPeloExtrato({ id })`): lista de `conciliarBoletos` com rádio (exatas primeiro, com etiqueta "bate certinho"/"provável"), mais `<select>` "Outro boleto em aberto" (vencimento no mês ±1); mostra "Recebido R$ X em DD/MM · Previsto para esta data R$ Y"; checkbox "pagou em dia, o banco só compensou depois" (sugerido quando valor == a_pagar_pontual e data > vencimento); botão "Confirmar pagamento". Fluxo: `Z.confirmarPagamentoPeloExtrato`; se `divergente` → segunda janela com justificativa (igual a `FORMULARIOS.pagamento`) e, em seguida, `memoria.pagamentoDivergente = { id: cb.id, data: mov.data, valor: mov.valor, pagouEmDia, justificativa, movimentacao_id }` + `ir('#/cobranca/ID?ir=pagamento')`; `FORMULARIOS.pagamentoNf` (envios.js) passa a ligar `movimentacao_id` quando presente (1 linha: após registrarPagamento, `if (p.movimentacao_id) Z.ligarMovimentacaoAoBoleto(db, p.movimentacao_id, p.id, login())` — função pequena em conciliacao.js).
- **Nomear e baixar comprovante** (`ACOES_BANCO.nomearComprovante({ id })`): mostra o nome proposto (`nomeComprovante`) num `<input name="nome">`, as duas pastas de destino em texto ("Loja 1 / Contas pagas / 2026" e "_Contador / ANK / 2026-11"), checkbox "também baixar para a pasta Downloads do PC" (desmarcado). Confirmar → `baixarEGuardarComprovante(mov, nome, { download })`: `banco.js.baixarComprovante(conta, id_externo)` → Blob; `S.salvarArquivo(await pastaDoEscopo(esc.escopo, esc.id), new File([blob], nome))`, idem contador; `alterar(Z.registrarComprovante(...))`; `download` → `baixar(blob, nome)`. Falha da ponte → aviso: "Não consegui baixar do banco agora. Você pode anexar o PDF do PC pelo botão 'Anexar do PC'."
- **Baixar comprovantes do mês**: `botao('comprovantesDoMes', 'Baixar todos os comprovantes de <mês> sem comprovante', { conta, mes })` — laço sobre `sem_comprovante` com nome padrão (para quem já deu destino a tudo). Mostra "12 baixados, 2 falharam: …".
- **Buscar extrato** (`ACOES_BANCO.buscarExtrato({ conta, mes })`): `de` = 1º do mês (ou `ultima_importacao[conta] + 1 dia` se dentro do mês), `ate` = min(último dia, hoje); `banco.js.lerExtrato(conta, de, ate)` → `alterar((db) => Z.importarExtrato(db, conta, r.lancamentos, login(), { de, ate }))` → `aviso('ANK: 12 movimentações novas, 30 já estavam.')`; depois, sugestões não gravam nada (só aparecem).

### 3.2 Caixa no imóvel — `caixaBancoImovel(i)` (chamada em `telaImovel`, imovel.js, logo após `caixaIptu(i)`; id `banco`)
"Banco: movimentações e comprovantes deste imóvel": tabela dos últimos 12 meses de `movimentacoesDo(d, { imovel_id })` (Data | Conta ANK/JCK | O que é | Valor | Comprovante 📎), total por ano; lista "Contas lançadas sem comprovante" (despesas do imóvel sem `comprovante`) com link "Procurar no extrato" → `#/banco?imovel=ID&filtro=pendentes`; `caixaArquivos('contasano', idPastaAno(i.id, ano), 'Comprovantes de <ano>', …, true, false)` para o ano atual (anos anteriores em `<details>`); pagamentos pelo banco do imóvel com situação (`SITUACOES_PAGAMENTO`) e botão "Atualizar situação". Em `tabelaIptu(p)` (imovel.js 41-45): ao lado de "Paga", se `config_banco.ativo && permitir_pagamentos && podeUsuario('admin')`: `botao('pagarPeloBanco', 'Pagar pelo banco', { origem: 'iptu', id: p.id, n: pc.n, imovel: i.id })`; se a parcela tem movimentação ligada: 📎 do comprovante.

### 3.3 `#/contas/<imóvel>` (financeiro.js `telaContas`)
- Na tabela "Lançamentos": coluna "Comprovante" (📎 nome ou "⚠ sem comprovante" com link `#/banco?imovel=…`) e etiqueta "pelo banco" quando `pagamento_banco_id`.
- Novo cartão antes dos lançamentos: `caixaPagarPeloBanco(i, comp)` (de banco.js): form `data-form="pagarPeloBanco"`: Conta a pagar (select TIPOS_DESPESA), Mês da conta, Valor, Vencimento, Forma (boleto/pix), Código de barras ou linha digitável (`inputmode=numeric`; `validarCodigoBarras` ao digitar mostra "47 dígitos ✓"), Chave Pix, Beneficiário, Conta que paga (select ANK/JCK, pré `contaSugeridaDoImovel`), botão "Preparar pagamento" (opera) → `prepararPagamento` → situação "Aguardando aprovação do administrador". Lista dos pagamentos do imóvel com: situação, `botao('aprovarPagamento', 'Aprovar e enviar ao banco', { id }, 'botao')` (só admin), `botao('cancelarPagamento', 'Cancelar', …)`, `botao('situacaoPagamento', 'Atualizar situação', { id })`, 📎 comprovante quando pago.
- Texto: "Nada é pago sozinho. Primeiro alguém prepara o pagamento; depois o administrador confere e aprova; só então o pedido vai ao banco. Depois de pago, a conta entra em 'Contas pagas por nós' com o comprovante."

### 3.4 Fluxo "Aprovar e enviar ao banco" (dupla confirmação, admin)
1. `if (!podeUsuario('admin')) throw new Error('Só o administrador aprova pagamentos.')`; se `!config_banco.permitir_pagamentos`: Error "Os pagamentos pelo banco estão desligados em Dados e backup → Banco."
2. Janela 1 (`forte: true`): resumo completo — conta que paga (ANK/JCK e saldo atual, se a ponte responder), beneficiário, valor em negrito, vencimento, data do pagamento, código de barras formatado em blocos, imóvel e conta. Botão "Conferi, continuar".
3. Janela 2 (`forte`): "Para confirmar, digite o valor exatamente como aparece: 1.234,56" (`<input name="confirmo">`); confere `C.centavos(confirmo) === p.valor`; botão "PAGAR". Qualquer diferença cancela sem gravar.
4. `alterar(Z.aprovarPagamento(db, id, login()))` → `banco.js.enviarPagamento(conta, pedido)` → `alterar(Z.marcarPagamentoEnviado(db, id, { id_externo, situacao }))`. Falha de rede DEPOIS de enviar: a ponte é idempotente por `referencia` (item 5); a tela mostra "Não tive resposta do banco. Clique em 'Atualizar situação' antes de tentar de novo." e NÃO reenvia sozinha.
5. "Atualizar situação" → `consultarPagamento` → `atualizarPagamento`; ao virar `pago`: baixa o comprovante do pagamento (`comprovantePagamento`) com `nomeComprovante` e guarda nas duas pastas; a despesa é criada/atualizada pela regra. Na próxima importação do extrato, `sugerirDestino` casa a saída com o pagamento (regra 1) e `conciliarPagamentoComExtrato` liga.
6. Histórico: `inserir`/`atualizar` já registram; a descrição inclui "Pagamento de R$ … a <beneficiário> aprovado por <admin>" e, em `detalhes`, o código de barras.

### 3.5 Fechamento (`telaFechamento`, fechamento.js)
Etapa `banco` vem de `etapasFechamento` (A). Acrescentar em fechamento.js (como já faz para `contas`): `e.chave === 'banco' && e.contas ? links "Abrir ANK" / "Abrir JCK" (#/banco?conta=…&mes=…&filtro=pendentes)`. Nada mais.

### 3.6 Boletos (`telaCobrancas`, cobrancas.js) — opcional, 1 bloco
Se `config_banco.ativo`: `const sug = Z.conciliarBoletos(d(), Z.movimentacoesDo(d(), { filtro: 'pendentes' })).filter(exatas do mês)`; alerta info: "N entradas do extrato parecem ser boletos deste mês ainda não confirmados. `link('#/banco?filtro=entradas', 'Conferir no Banco')`".

### 3.7 Dados e backup (`telaDados`, admin.js)
O cartão "Banco (C6)" é do pacote base. Fase 2 acrescenta UMA chamada `caixaConfigBanco2()` (banco.js) dentro/abaixo dele com: Pasta do contador (texto, padrão `_Contador`), Modelo do nome do comprovante (texto, com a legenda dos tokens e um exemplo ao vivo), Tolerância de dias na conciliação (número), "Permitir pagamentos pelo banco" (checkbox, só admin, com texto "Desligado, ninguém consegue preparar nem aprovar pagamentos"), Limite por pagamento (dinheiro, 0 = sem limite). `FORMULARIOS_BANCO.configBanco2` grava via `alterar((db) => Z.salvarConfigBanco2(db, campos, login()))` (função em conciliacao.js que faz `Object.assign(db.config_banco, …)` + `registrar(db, usuario, 'Alteração', 'banco', null, 'Configuração do banco (fase 2) alterada', detalhesSemSenha)`).

### 3.8 Rotas, menu, CSS
- `telas.js`: `import { telaBanco } from './telas/banco.js';` + `banco: (rota) => telaBanco(rota),`.
- `app.js` `MENU`: inserir `['#/banco', 'Banco', '^banco']` depois de `['#/faturas', 'NF', …]`.
- `estilo.css`: `.mov-entrada { color: var(--ok); }`, `.mov-saida {}`, `.banco-sugestao` (etiqueta info clicável), `.codigo-barras { font-family: monospace; letter-spacing: .5px; }`; tabela já usa `.cobrancas.responsiva`.
- `caixas.js`/`arrumarCaixas` reconhece caixas por `id`/`data-caixa`: dar `id="banco"` e `data-caixa="banco"` nas caixas novas.

--------------------------------------------------------------------
## 4. Segurança
--------------------------------------------------------------------
- Credenciais do C6 (certificado mTLS, client id/secret) SÓ na ponte (`ponte-c6/certificados/`, `ponte-c6/.env`, ambos no `.gitignore`); o site guarda só `ponte_url` e `senha_ponte` (já na base). Nunca copiar segredos para `d` nem para o histórico (`detalhesSemSenha`).
- A ponte só escuta em `127.0.0.1`, exige `X-Senha-Ponte`, e só aceita rotas de pagamento se `PAGAMENTOS=1` no `.env` (defesa em profundidade: ERP e ponte precisam estar ligados). `LIMITE_PAGAMENTO_CENTAVOS` opcional na ponte, independente do limite do ERP.
- Pagamentos: só `podeUsuario('admin')` aprova (UI) — e a regra `aprovarPagamento` grava `aprovado_por`; preparar pode ser operador. Dupla confirmação (resumo + digitar o valor). Nunca há laço automático de pagamento: toda chamada `POST /pagamentos` nasce de um clique em "PAGAR".
- Idempotência: `referencia = 'erp-<id>'` enviada à ponte, que guarda `ponte-c6/registros/pagamentos.json` (`referencia → id_externo`) e devolve o mesmo `id_externo` se receber de novo (nunca paga duas vezes). Uma segunda tentativa no ERP só acontece se `situacao` ∈ {erro} e o admin clicar de novo.
- Tudo no histórico (`inserir`/`atualizar`): importação, destino, comprovante, preparação, aprovação, envio, situação, cancelamento. `SEM_DESFAZER` cobre as duas tabelas.
- Dados do extrato não são editáveis na tela (só destino/comprovante/observações). Exclusão de movimentação: não existe (há "Ignorar"); admin pode "Reimportar o mês" (apaga as não classificadas do mês e importa de novo) — opcional, fase 2.1.
- Comprovantes gravados só com `nomeComprovante` (sem acento, sem caracteres proibidos); nada de HTML sem `esc()` (descrições vêm do banco: SEMPRE `esc(m.descricao)`).

--------------------------------------------------------------------
## 5. Rotas da ponte (`ponte-c6/`, Node; pacote B) e cliente `docs/js/banco.js`
--------------------------------------------------------------------
Convenções: JSON UTF-8; dinheiro em `*_centavos` inteiros; datas `'AAAA-MM-DD'` já convertidas para o dia local; erros `{ erro: 'texto em português simples', codigo }` com HTTP 4xx/5xx; cabeçalho `X-Senha-Ponte` em todas; `:id` ∈ CONTAS (`ank`,`jck`).

| Rota | Entrada | Saída |
|---|---|---|
| `GET /contas/:id/saldo` | — | `{ saldo_centavos, data, hora }` |
| `GET /contas/:id/extrato?de&ate` | datas (máx. 93 dias; a ponte pagina no C6) | `{ conta_id, de, ate, lancamentos: [{ id_externo, data, valor_centavos (>0), tipo: 'entrada'|'saida', descricao, contrapartida: { nome, documento } | null, categoria, nosso_numero | null, saldo_apos_centavos | null, tem_comprovante: bool }] }` ordem data asc |
| `GET /contas/:id/comprovantes/:idMov` | `idMov` = `id_externo` | `application/pdf` (bytes). Cabeçalho `X-Comprovante-Origem: banco|ponte`. Se o C6 não tem PDF para o tipo, a ponte gera um PDF simples (pdfkit ou texto→PDF mínimo) com os dados do lançamento e `origem: 'ponte'`; 404 `{ erro: 'Comprovante não disponível no banco.' }` se nem isso |
| `POST /contas/:id/pagamentos` | `{ referencia, forma: 'boleto'|'pix', codigo_barras | chave_pix | pix_copia_cola, valor_centavos, data_pagamento, descricao, beneficiario }` | `201 { id_externo, situacao: 'agendado'|'pago'|'erro', agendado_para, erro }`; `referencia` repetida → `200` com o mesmo `id_externo` (idempotente); `403` se `PAGAMENTOS!=1`; `422` validação |
| `GET /contas/:id/pagamentos/:idExterno` | — | `{ id_externo, situacao: 'agendado'|'pago'|'erro'|'cancelado', pago_em, valor_centavos, erro, tem_comprovante }` |
| `DELETE /contas/:id/pagamentos/:idExterno` | — | `{ situacao: 'cancelado' }` ou `409` se já pago |
| `GET /contas/:id/pagamentos/:idExterno/comprovante` | — | `application/pdf` |
| `GET /saude` | — | `{ ok: true, simulado: bool, contas: ['ank','jck'], pagamentos: bool, versao }` (já pode existir na base; manter) |

Modo SIMULADO (`SIMULADO=1`): sem C6; dados em `ponte-c6/simulado/ank.json` e `jck.json` (lançamentos fictícios com CPF 529.982.247-25 / CNPJ 11.222.333/0001-81: "PAGAMENTO BOLETO SANEPAR MATR 123456", "PIX RECEBIDO MARIA EXEMPLO" de R$ 1.219,50 no dia 10, "TARIFA PACOTE", "TED PARA JCK ADMINISTRADORA", "IPTU PREFEITURA CURITIBA 3/10"…), gerados para o mês pedido (mesmos valores, datas no mês); comprovante PDF gerado; pagamento vira `pago` na 2ª consulta; `pagamentos.json` de idempotência igual ao real. Permite o teste no navegador em `?teste`.

Cliente `docs/js/banco.js` (acrescentar; `chamarPonte(contaId, metodo, caminho, corpo)` é da base e devolve JSON):
```js
export async function pontePronta()                 // GET /saude → objeto ou null (não lança)
export async function lerSaldo(contaId)             // → { saldo, data }  (centavos renomeados para o padrão do ERP)
export async function lerExtrato(contaId, de, ate)  // → { lancamentos: [...] } (campos como a rota; a ponte já normaliza)
export async function baixarPdfDaPonte(contaId, caminho)   // fetch com os mesmos cabeçalhos de chamarPonte, aceita application/pdf → Blob (chamarPonte só trata JSON)
export const baixarComprovante = (contaId, idMov) => baixarPdfDaPonte(contaId, `/comprovantes/${encodeURIComponent(idMov)}`)
export async function enviarPagamento(contaId, pedido)      // POST → { id_externo, situacao, agendado_para, erro }
export async function consultarPagamento(contaId, idExterno)
export async function cancelarPagamentoNaPonte(contaId, idExterno)
export const comprovantePagamento = (contaId, idExterno) => baixarPdfDaPonte(contaId, `/pagamentos/${idExterno}/comprovante`)
```
Erros de rede viram `Error('A ponte com o banco não respondeu. Abra o programa "Ponte C6" neste computador e tente de novo.')`; erros da ponte repassam `erro` em português.

--------------------------------------------------------------------
## 6. Divisão em 3 pacotes paralelos (+ passo 0 e integração)
--------------------------------------------------------------------
**Passo 0 (antes de paralelizar, 1 agente, ~1h, branch `claude/banco-fase2`)** — fixa os contratos no código para o esbuild não quebrar nos outros pacotes:
- Criar `docs/js/conciliacao.js` com TODAS as assinaturas do item 1.4 exportadas (corpo mínimo: `throw new Error('Em construção')` ou implementação trivial) e `CLASSIFICACOES`, `SITUACOES_PAGAMENTO`.
- Em `regras.js`: `TABELAS` (2 linhas), `idPastaAno/idContador/decodificarIdContador`, `CONFIG_BANCO_PADRAO` com os campos novos (coordenar com a base; se a base ainda não foi mergeada, partir do branch dela).
- Em `docs/js/banco.js`: as funções do item 5 como stubs que lançam.
- Confirmar com o pacote base os campos de `cb.banco` (usar `nosso_numero` e `id_externo`).
A partir daí, A, B e C trabalham em branches próprios a partir de `claude/banco-fase2`; merge na ordem A → B → C (A e B não tocam arquivos de C; C só acrescenta linhas em arquivos que A toca? NÃO — ver lista; único arquivo em comum: nenhum).

**Pacote A — regras + testes + normalizar** (arquivos: `docs/js/conciliacao.js`, `docs/js/regras.js` [TABELAS, normalizar, SEM_DESFAZER, arquivosReferenciados, rotulosDosArquivos, pastaDoComprovante, etapasFechamento etapa 'banco', alertaBanco + todosAlertas, estornarPagamento], `tests/conciliacao.test.mjs` (novo), `tests/regras.test.mjs` (1 teste de normalizar/arquivosReferenciados), `docs/js/regras-texto.js` (seção "Banco e conciliação" em REGRAS_TEXTO), `documentacao/DECISOES.md` (linhas das decisões: nome do comprovante, pastas, pagamento com dupla confirmação, nunca automático)).

**Pacote B — ponte + cliente** (arquivos: `ponte-c6/**` [rotas novas, `simulado/`, `registros/` no .gitignore, `tests/*.test.mjs` da ponte com `node:test` e `SIMULADO=1`, README da ponte com os passos de instalação em português simples], `docs/js/banco.js`). Não toca telas nem regras.

**Pacote C — telas** (arquivos: `docs/js/telas/banco.js` (novo), `docs/js/telas.js` (import + 1 rota), `docs/js/app.js` (MENU, 1 linha), `docs/js/telas/acoes.js` (import + `Object.assign(ACOES, ACOES_BANCO)` + `TABELAS_EXCLUSAO.despesas.checar/depois` + cascata de imóveis), `docs/js/telas/envios.js` (import + `Object.assign(FORMULARIOS, FORMULARIOS_BANCO)` + 1 linha em `pagamentoNf`), `docs/js/telas/comum.js` (escopos `contasano`, `contador`, `movbanco`; `conferirArquivos` genérico; `ancoraDoArquivo`; `linkAlerta` tipo 'Banco'), `docs/js/telas/imovel.js` (caixaBancoImovel + botão IPTU), `docs/js/telas/financeiro.js` (coluna comprovante + caixaPagarPeloBanco), `docs/js/telas/fechamento.js` (links por conta), `docs/js/telas/cobrancas.js` (alerta opcional), `docs/js/telas/admin.js` (1 linha caixaConfigBanco2), `docs/css/estilo.css`). Até A entregar, C programa contra os stubs do passo 0 e testa a tela com dados colocados à mão em `E.d.movimentacoes_banco` pelo console em `?teste`.

**Integração (1 agente, depois dos 3 merges):** `node tools/checar.mjs --offline`; teste no navegador (item 7); `/atualizar-docs` (ARQUITETURA: linhas "Banco (extrato, conciliação, pagamentos)" e "Integrações externas → Banco"; GUIA: "Adicionar um escopo de pasta"; CLAUDE.md "Armadilhas": `conferirArquivos` agora cobre escopos de imóvel/contador); lembrar o usuário de baixar a versão sem internet.

Contratos entre pacotes (resumo): A↔C: assinaturas do item 1.4 + nomes dos campos do item 1.1/1.2 + `idPastaAno/idContador` + chaves de escopo `'contasano'`,`'contador'`,`'movbanco'` + etapa `'banco'` com `e.contas`. B↔C: funções do item 5 em `banco.js` e formato dos lançamentos. A↔B: formato dos lançamentos (`importarExtrato` recebe exatamente o array `lancamentos` da ponte; renomeia `valor_centavos`→`valor`, `categoria`→`categoria_banco`, `saldo_apos_centavos`→`saldo_apos`).

--------------------------------------------------------------------
## 7. Testes
--------------------------------------------------------------------
`tests/conciliacao.test.mjs` (node:test; `base()` com ANK e JCK — CNPJ 11.222.333/0001-81 e 11.222.333/0001-81 com nomes diferentes —, `config_banco.contas = [{ id:'ank', apelido:'ANK', emitente_id: ank.id }, { id:'jck', … }]`, imóvel "Loja 1" com `sanepar_matricula: '123456'`, `copel_uc: '7890'`, contrato Maria Exemplo CPF 529.982.247-25 com boletos gerados):
1. `importarExtrato`: 3 lançamentos → 3 novas; repetir → 0 novas/3 repetidas; mesmo `id_externo` em `jck` → nova (contas separadas); `valor_centavos` negativo normaliza; conta inexistente lança; `ultima_importacao` gravada; histórico com N inclusões.
2. `nomeComprovante`: "2026-11-05 ANK Loja 1 Agua 123,45.pdf"; com acento no imóvel ("Sobreloja Água") sai sem acento; modelo configurável `{mes} {imovel} {tipo}`; sem imóvel → "Geral"; aluguel → "Aluguel Maria Exemplo"; caracteres proibidos removidos; limite de 120.
3. `sugerirDestino`: descrição com "123456" → Loja 1/Água (média); "PIX RECEBIDO MARIA EXEMPLO" R$ 1.219,50 no vencimento → boleto (alta); "TARIFA" → tarifa; memória por contrapartida; documento da outra conta → transferência.
4. `conciliarBoletos`: valor pontual até vencimento+3 → exata; valor com multa/juros em data posterior (via `previstoNoPagamento`) → exata; dois boletos iguais → ambos 'provavel'; `nosso_numero` igual vence o valor; saída nunca casa.
5. `confirmarPagamentoPeloExtrato`: grava `data_pagamento = mov.data`, `valor_pago`, `cb.movimentacao_id`, `mov.cobranca_id`; divergente devolve `{ divergente }` sem gravar; com `valorNf`+justificativa grava `nf_manual`; segunda confirmação lança; `estornarPagamento` limpa os dois lados.
6. `vincularMovimentacao` conta_imovel: cria despesa `{ tipo, competencia, valor, data_pagamento }` ligada; imóvel ocupado com conta "Por conta do inquilino" → Error com o texto de `lancarDespesas`; `desvincularMovimentacao` exclui a despesa criada e devolve os arquivos a apagar; IPTU: parcela paga em `pagas[n]` e desfeita no desvincular; transferência liga o par; já classificada lança.
7. `arquivosReferenciados`/`rotulosDosArquivos`: comprovante aparece com `{ escopo: 'contasano', id: idPastaAno(1, 2026), nome }` e `{ escopo: 'contador', id: idContador(ank.id, '2026-11') }`; IPTU → `iptuano`; etiqueta em português.
8. Pagamentos: `prepararPagamento` recusa com `permitir_pagamentos=false`, valor 0, acima do limite, código de barras com 30 dígitos; cria `aguardando_aprovacao` com `referencia 'erp-<id>'`; duplicado (mesmo código+valor agendado) recusa; `aprovarPagamento` só de aguardando; `marcarPagamentoEnviado` → agendado; `atualizarPagamento` pago → despesa criada com `data_pagamento = pago_em` e `pagamento_banco_id`; origem iptu → `pagas[n]`; `cancelarPagamento` só nas situações permitidas; `conciliarPagamentoComExtrato` liga e classifica.
9. `etapasFechamento(d, mes)` tem etapa `banco` com `pendentes` = sem destino + contas sem extrato; `todosAlertas` traz 'Banco' só com `config_banco.ativo`.
10. `normalizar` em banco antigo (sem as tabelas, `config_banco` da base) cria tudo; `SEM_DESFAZER` impede `alteracoesDesfaziveis` de listar movimentações.
11. `validarCodigoBarras`: 44/47/48 dígitos passam (com pontos/espaços removidos), 46 falha, letras falham.

Ponte (`ponte-c6/tests/rotas.test.mjs`, `SIMULADO=1`, servidor em porta aleatória): sem `X-Senha-Ponte` → 401; `/extrato` devolve o formato (centavos inteiros, tipo, data ISO, ordenado); `/comprovantes/:id` devolve `application/pdf` começando com `%PDF`; `POST /pagamentos` sem `PAGAMENTOS=1` → 403; com → 201 e repetir a mesma `referencia` → 200 com o mesmo `id_externo` e só UM registro em `pagamentos.json`; `GET /pagamentos/:id` passa de agendado a pago; `/saude`.

Navegador (`cd docs && python3 -m http.server 8000` + `SIMULADO=1 PAGAMENTOS=1 node ponte-c6/servidor.mjs`; abrir `http://localhost:8000/?teste`): (1) Dados e backup → Banco: ligar, ponte_url `http://localhost:8765`, contas ank/jck ligadas a ANK/JCK, "Permitir pagamentos" ligado; (2) `#/banco` ANK → "Buscar o extrato" → linhas aparecem com sugestões; (3) "Usar sugestão" na água → confere `#/contas/<Loja 1>` e a pasta `arquivos/Loja 1/Contas pagas/2026/2026-11-05 ANK Loja 1 Agua 123,45.pdf` (listar via caixa do imóvel) e `arquivos/_Contador/ANK/2026-11/`; (4) entrada Maria Exemplo → "É o pagamento do boleto…" → boleto fica "Paga em dia" em `#/cobrancas`; (5) `#/contas/<Loja 1>` → preparar pagamento de Luz R$ 200,00 com linha digitável de 47 dígitos → "Aprovar e enviar" (duas janelas, digitar 200,00) → "Atualizar situação" → Pago → despesa lançada com 📎; (6) `#/fechamento` mostra a etapa Banco; (7) excluir a despesa da água → o PDF some das duas pastas (alterarApagandoAnexos) e a movimentação volta a "sem destino"; (8) desligar a ponte → `#/banco` abre, mostra o aviso em texto simples e "Anexar do PC" funciona; (9) celular (760px): tabela vira cartões. Playwright se disponível.

--------------------------------------------------------------------
## 8. Textos das telas (português simples)
--------------------------------------------------------------------
- Menu: "Banco". Título: "Banco". Abas: "ANK · conta no C6", "JCK · conta no C6".
- Botões: "Buscar o extrato de novembro/2026 no banco" · "Ver saldo" · "Atrelar a imóvel/conta" · "É o pagamento do boleto…" · "Nomear e baixar comprovante" · "Anexar do PC" · "Usar sugestão" · "Desfazer o destino" (×) · "Baixar todos os comprovantes do mês" · "Preparar pagamento" · "Aprovar e enviar ao banco" · "PAGAR" · "Cancelar" · "Atualizar situação".
- Etiquetas: "sem destino" · "sem comprovante" · "parece: Loja 1 · Água" · "bate certinho" / "provável" · "pelo banco" · "Aguardando aprovação do administrador" · "Enviado ao banco (agendado)" · "Pago" · "Erro no banco" · "Cancelado" · "Ignorada" · "Ponte ligada" / "Ponte desligada".
- Avisos: "ANK: 12 movimentações novas, 30 já estavam." · "Comprovante guardado em Loja 1 › Contas pagas › 2026 e em _Contador › ANK › 2026-11." · "A ponte com o banco não respondeu. Abra o programa 'Ponte C6' neste computador e tente de novo. O que já foi importado continua aqui." · "Esta movimentação já tem destino. Desfaça antes." · "Desfaça o pagamento do boleto na tela Boletos (botão 'Desfazer pagamento')." · "Só o administrador aprova pagamentos." · "Os pagamentos pelo banco estão desligados em Dados e backup → Banco." · "O valor digitado não é igual ao do pagamento. Nada foi enviado." · "Não tive resposta do banco. Clique em 'Atualizar situação' antes de tentar de novo." · "Em 11/2026 o inquilino paga Água, conforme o contrato. Se mesmo assim foi paga por nós, escolha 'Outro' e escreva o motivo."
- Ajuda da tela Banco: "Cada linha do extrato precisa de um destino: um imóvel e a conta (água, luz, gás, condomínio, internet), um boleto de aluguel recebido, o IPTU, um imposto, tarifa do banco ou transferência entre as nossas contas. O comprovante é baixado do banco com o nome padrão (data, empresa, imóvel, conta e valor) e guardado na pasta do imóvel e na pasta do contador."
- Ajuda de pagamentos: "Nada é pago sozinho. Alguém prepara o pagamento, o administrador confere e aprova em duas etapas, e só então o pedido vai ao banco. Depois de pago, a conta entra em 'Contas pagas por nós' com o comprovante."

--------------------------------------------------------------------
## 9. Riscos e armadilhas já conhecidas
--------------------------------------------------------------------
- `conferirArquivos` pula tudo que não é de contrato (comum.js 395): sem a generalização, os comprovantes não são conferidos — e `arquivosFaltando` assume `contrato_id`.
- Nomes com acento são recusados em `?teste`: `nomeComprovante` e qualquer nome de pasta nova (`Contas pagas`, `_Contador`, nome da empresa via `S.limparNome`) — a pasta pode ter acento ("Matrículas" já tem), o arquivo não.
- `pastaDoEscopo(escopo, id, false)` ao só listar (abrir a página não cria pasta vazia — DECISOES 2026-10-16).
- Excluir despesa/movimentação deve passar por `alterarApagandoAnexos` para o PDF sair das duas pastas; arquivo gravado duas vezes entra duas vezes em `arquivosReferenciados`.
- A ponte converte datas para o dia local (o C6 pode mandar UTC: 23h vira o dia seguinte).
- Transferência ANK→JCK aparece nos dois extratos: classificar como `transferencia` e ligar o par, para não virar "conta do imóvel" duas vezes.
- `regras.js` está sendo editado pela base (normalizar, CONFIG_BANCO_PADRAO): partir do branch da base; conflitos triviais em `normalizar`.
- `tests/offline.test.mjs` falha até `node tools/checar.mjs --offline` (arquivos novos entram no hash).
- Idempotência da ponte é o que impede pagar duas vezes numa queda de rede; testar explicitamente.
- `registrarPagamento` lança se o boleto já tem NF; `confirmarPagamentoPeloExtrato` deve mostrar esse erro em português e não deixar a movimentação meio-ligada (toda a gravação acontece dentro de um único `alterar`).

### Critical Files for Implementation
- /home/user/erp-boletos/docs/js/regras.js (TABELAS, normalizar, arquivosReferenciados/rotulosDosArquivos, registrarPagamento/estornarPagamento, lancarDespesas/contasPermitidas, marcarIptuPago, etapasFechamento, todosAlertas)
- /home/user/erp-boletos/docs/js/conciliacao.js (NOVO: regras puras de extrato, conciliação, comprovantes e pagamentos)
- /home/user/erp-boletos/docs/js/telas/comum.js (pastaDoEscopo, chavePasta, vinculoDoEscopo, conferirArquivos, listaArquivos, alterarApagandoAnexos — escopos `contasano`, `contador`, `movbanco`)
- /home/user/erp-boletos/docs/js/telas/banco.js (NOVO: #/banco, caixa do imóvel, pagar pelo banco, ACOES_BANCO/FORMULARIOS_BANCO) + /home/user/erp-boletos/docs/js/telas/financeiro.js e /home/user/erp-boletos/docs/js/telas/imovel.js
- /home/user/erp-boletos/docs/js/banco.js e ponte-c6/ (rotas extrato/comprovantes/pagamentos/saldo com modo SIMULADO) + /home/user/erp-boletos/tests/conciliacao.test.mjs
