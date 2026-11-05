# Guia de modificação

## Adicionar um cadastro (nova tabela com formulário)
1. `docs/js/regras.js` → acrescente a tabela em `TABELAS` (`chave: 'Nome legível'`). `bancoVazio()`/`normalizar()` criam a lista sozinhos.
2. `docs/js/formularios.js` → crie a lista de campos com `campo(nome, rótulo, tipo, extra)`:
   ```js
   export const REFORMA = [
     campo('data', 'Data', 'data', { obrig: true }),
     campo('valor', 'Valor investido', 'dinheiro', { obrig: true }),
   ];
   ```
   Tipos usados: `texto`, `area`, `data`, `mes`, `dinheiro` (centavos), `pct`, `inteiro`, `opcao`, `simnao`, `tel`, `email`, `url`, `cpf`, `cnpj`, `cpfcnpj`, `cep`, `arquivo` (não entra em `ler`; grave em `ajustarAsync`; `<input type="file">` escrito à mão leva `accept="${ACEITA_DOCUMENTOS}"` de `telas/comum.js`, e `S.salvarArquivo` recusa página/script). Mostrar/esconder campo: `quando('campo', 'valor')`; só no novo / só na edição: `soNovo` / `soEditar`; seção que começa recolhida (abre sozinha se tiver algo preenchido): `{ secao, recolher: 'texto do botão' }`; caixa de uma linha que cresce: `area` com `linha: true`; texto com sugestões do que já foi digitado: `sugestoes: [...]`.
3. `docs/js/telas/cadastros.js` → entrada em `CADASTROS` (modelo: `reformas`):
   ```js
   reformas: {
     titulo: (r, q) => `Reforma - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
     campos: () => F.REFORMA,
     fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
     voltar: (r, q) => `#/imovel/${r ? r.imovel_id : q.imovel}?ir=reformas`,
   },
   ```
   Opcionais: `padrao`, `valores`, `ajustar` (validação/erros; lançar `Error` mantém o que foi digitado), `ajustarAsync` (ex.: gravar arquivos anexados antes de salvar, como em `seguros` e nos comprovantes via `guardarComprovantes`), `extraHtml` (HTML extra no formulário, ex.: campos de arquivo), `conferir` (avisos com confirmação), `confirmar` (async, janela própria antes de gravar; ex.: valores do contrato inicial), `salvar` (gravação própria), `depois`, `recalcular` (boletos em aberto), `destino`, `aviso`.
4. Links: novo `#/novo/<tabela>?...`; editar `#/editar/<tabela>/<id>`. A gravação genérica é `FORMULARIOS.cadastro`.
5. Exclusão: entrada em `TABELAS_EXCLUSAO` (`telas/acoes.js`) com `admin`, `checar`, `voltar`, `recalcular` ou `depois`. Campo com nome de arquivo: inclua-o em `arquivosReferenciados` (`regras.js`), para o anexo ser apagado junto com o lançamento. Se a tabela pertence a um contrato, inclua-a na cascata de `R.excluirContrato` (`regras.js`); se pertence a um imóvel, na de `ACOES.excluir`. Atenção: a exclusão chama `voltar(r)` sem `q`; não use `q.<campo>` sem conferir se `q` existe.

## Adicionar uma tela
1. Função `telaX(rota)` que devolve HTML em texto, no arquivo do assunto em `docs/js/telas/` (assunto novo: arquivo novo com a 1ª linha dizendo o que tem); exporte e registre em `TELAS` (`docs/js/telas.js`) com a chave da rota (`#/x/...` → `TELAS.x`). `rota.partes` = pedaços do caminho; `rota.q` = parâmetros, já passados por `C.sanearParametros`: parâmetro novo ganha uma entrada em `FORMATOS_PARAMETRO` (`calculos.js`), e mês/data usam `C.competenciaValida(rota.q.mes, padrão)`/`C.dataValida` (ver `TELAS.cobrancas`). `?ir=<id>` rola até o elemento e depois sai do endereço (`mostrar` em `app.js`).
2. Texto do usuário sempre com `esc()`; valores com `reais()`, `dataBr()`, `compBr()`. Registro que não existe: `naoEncontrado('Boleto não encontrado', '#/cobrancas', 'Ver os boletos')` (`telas/comum.js`). Tabela larga: dentro de `<div class="cartao rolagem">`; com a classe `responsiva` (1ª linha com `th`) vira cartões no celular.
3. Botões: `botao('acao', 'Texto', { id })` + função em `ACOES` (`telas/acoes.js`); o botão fica desabilitado enquanto a ação roda (`data-ocupado`), e `alterar` grava uma de cada vez. Formulários: `<form data-form="nome">` + função em `FORMULARIOS` (`telas/envios.js`). Componentes comuns (`botao`, `link`, `etiqueta`, `d`, `buscar`) vêm de `telas/comum.js`.
4. Menu: `MENU` em `docs/js/app.js` (o 3º item é a expressão que marca o menu ativo pela rota). Abas dentro de uma página: modelo `abasResultados`; caixa recolhida: `<details>` (ex.: `caixaHistorico`); com `id`, fica aberta ou fechada como estava depois de uma ação na mesma página (`mostrar` em `app.js`).
5. Telas de impressão: um tipo novo em `telaImprimir` (`#/imprimir/<tipo>`), que desenha sem o menu.

## Adicionar uma regra de negócio
1. Função pura em `docs/js/regras.js` (ou em `calculos.js` se só faz conta), recebendo o banco `d`:
   ```js
   export function marcarDocumento(d, contratoId, campo, data, usuario) {
     const c = buscar(d, 'contratos', contratoId);
     atualizar(d, 'contratos', c.id, { [campo]: data || null }, usuario, 'descrição para o histórico');
   }
   ```
2. Grave só por `inserir`/`atualizar`/`excluir` (eles registram o histórico). Na tela, chame dentro de `alterar((db) => ...)`.
3. Se a regra muda valores de boleto, inclua o campo em `CAMPOS_RECALCULO` e em `montarCobranca`.
4. Teste em `tests/regras.test.mjs` usando `base()` (banco de exemplo do próprio arquivo). Regra do banco (extrato, destino, comprovante, pagamento): em `docs/js/conciliacao.js`, com os dados no formato exato do C6 (`documentacao/c6-openapi/`), e teste em `tests/conciliacao.test.mjs`; o que o site pede à ponte vai em `banco-fase2.js` (e a resposta simulada em `?teste`, com dados de `simulado-banco.js`).

## Adicionar um relatório
| Tipo | Como fazer (exemplo existente) |
|---|---|
| Tela com tabela | Função em `regras.js` que devolve linhas + tela em `telas/` (`resultadosFinanceiros` + `telas/financeiro.js` → `telaResultados`) |
| Excel | `ACOES.excelResultados` (ExcelJS via `excelJs()` de `app.js`, download com `baixar()`) |
| PDF/impressão | Tipo novo em `telaImprimir` + CSS de `@media print` em `docs/css/estilo.css`; botão "Baixar PDF": `ACOES.baixarPdfTela` (seletor + nome de `nomeArquivoDoc`) |
| Documento Word | Blocos de `contratos.js` + `contratoDocx` (ex.: `documentoMontado` em `telas/documentos.js`) |

## Ligar o boleto com Pix do C6 (quando as chaves chegarem)
Hoje o sistema já tem tudo pronto; os botões "Emitir no C6" aparecem desabilitados com a explicação até a configuração ficar completa. Passo a passo, em ordem:
1. **Pedir ao C6**: o titular de cada conta (ANK e JCK) gera no Web Banking → perfil → "Integrações via API" → "Nova chave" o `client_id`, o `client_secret` e o par certificado/chave (`.crt` + `.key`), com permissão de boleto (escopos `v2.bankslip.read`, `v2.bankslip.write`, `v2.bankslip.pix.write`). Primeiro vêm as chaves de **sandbox** (teste: boletos sem valor, só seg–sex 7h–22h); as de produção vêm depois da homologação. A chave Pix usada no QR Code é uma **chave aleatória** cadastrada na conta.
2. **Instalar a ponte**: copie a pasta `ponte-c6` para o computador que emite (precisa do Node.js 20+). Copie `.env.exemplo` para `.env`, defina `PONTE_SENHA` (uma frase com pelo menos 20 caracteres: sem ela a ponte não sobe), `CONTAS=ank,jck`, a chave Pix aleatória de cada conta (`C6_ANK_CHAVE_PIX`: a ponte usa sempre esta no QR Code) e ligue `SIMULADO=1` por enquanto. Rode `node servidor.mjs`.
3. **No site**, como administrador: Dados e backup → "Banco (C6) — boleto com Pix": endereço `http://localhost:8765` e a mesma senha (os dois ficam **só neste computador**, no navegador; repita em cada computador que vai emitir), **Testar conexão** (deve responder "modo simulado"). Cadastre as contas (uma por empresa, identificador igual ao do `.env`; ambiente sandbox; chave Pix; avisos ao inquilino; negativação se quiser) e marque **Integração ativa**. Em Empresas, confira "Emissão de boletos no banco" (padrão: sempre pela ANK; ou escolher boleto a boleto).
4. **Treinar em modo simulado**: tela Boletos → "Emitir no C6" num boleto → aparecem linha digitável, Pix copia-e-cola e QR Code fictícios; "Simular pagamento (teste)" e depois "Consultar situação no banco" propõem registrar o pagamento. Nada vai ao banco.
5. **Colocar as chaves**: na ponte, pasta `contas/ank/` (e `contas/jck/`): `client_id.txt`, `client_secret.txt`, `certificado.crt`, `chave.key`, `ambiente.txt` = `sandbox`. Troque `SIMULADO=0` no `.env` e reinicie a ponte. "Testar conexão" deve mostrar "chaves ok · token ok" e os escopos; se faltar escopo, o aviso aparece ali.
6. **Primeiro boleto de teste no sandbox**: emita um boleto de um contrato de teste e confira: valor cheio, desconto até o vencimento (`first_discount_value`; se o banco recusar o `discount_type`, troque o "Tipo do desconto na API" da conta), multa e juros em %, avisos ao pagador. Cada chamada fica registrada em `ponte-c6/registros/`; `node servidor.mjs --roteiro` imprime o status e a resposta de cada teste do "Roteiro de Testes – C6 Developers v3.0" (AT_01, BP_01…BP_06) para enviar a `homologacaoapi@c6bank.com`.
7. **Produção**: com as chaves de produção, crie `contas/<id>/ambiente.txt` = `producao` (ou edite a conta no site para "Produção"), teste a conexão e emita o primeiro boleto real num valor pequeno. A carteira é automática (15 produção / 21 sandbox).
8. **Rotina**: "Emitir no C6 todos em aberto do mês" depois de gerar os boletos; "Conferir pagamentos no banco" alguns dias depois do vencimento (lista os pagos no banco e propõe registrar cada um, com a data de crédito como data contábil). O webhook do banco é opcional: precisa de endereço público e de um segredo na URL (`C6_ANK_WEBHOOK_TOKEN`, 32 hex; cadastrar no C6 `https://<ponte>/webhook/c6/ank/<segredo>`); o aviso só marca o boleto para reconsulta. Sem ele, a conferência resolve.
9. **Segurança da ponte** (resumo; detalhes em `ponte-c6/README.md`): só escuta neste computador (expor exige `EXPOR=1` e Cloudflare Access/Tailscale); lista fixa de origens; 10 senhas erradas bloqueiam o IP por 15 min; a ponte remonta o pedido de emissão só com campos conhecidos (CPF/CNPJ com dígito, valor até `C6_<ID>_VALOR_MAXIMO`, Pix da conta); registros sem dados pessoais e apagados em 30 dias; `SIMULADO=1` não sobe com conta em produção.
10. **Fase 2 (extrato, comprovantes, pagamentos)**: a ponte precisa das APIs "Saldo & Extrato" e, para pagar, "Agendamento de pagamentos" liberadas pelo C6; ligue `PAGAMENTOS=1` no `.env` só quando for pagar pelo sistema, e no site marque "Permitir preparar pagamentos pelo banco" com o limite por pagamento (caixa "Banco: conciliação e pagamentos" em Dados e backup; `caixaConfigBanco2`). Rotina do mês em `documentacao/MANUAL_BANCO.md`; cada passo pode ser treinado em `?teste` (ponte simulada dentro do site). Onde ajustar se a API mudar: `docs/js/mapa-c6.js` (e copiar para `ponte-c6/mapa-c6.mjs`); formato oficial em `documentacao/C6_CAMPOS_CONFIRMADOS.md` e `documentacao/c6-openapi/`.

## Checklist antes de alterar
- [ ] Ler a função e os testes da área (`tests/*.test.mjs`).
- [ ] Achar o trecho com `node tools/mapa.mjs <trecho>` e ler só ele.
- [ ] Rodar `node tools/checar.mjs` (sintaxe do app inteiro + testes; `node --check` não pega tudo nos módulos do navegador).
- [ ] Testar no navegador: `cd docs && python3 -m http.server 8000` e `http://localhost:8000/?teste`.
- [ ] Mudou `docs/js`, `docs/vendor`, `docs/css/estilo.css` ou o modelo xlsx: rodar `node tools/checar.mjs --offline` (senão `tests/offline.test.mjs` falha).
- [ ] Campo novo no banco: valor padrão ou migração em `normalizar`, se registros antigos precisarem dele. Nunca um segredo no JSON (senha/endereço da ponte: `lembrarPonte`; senha de usuário: `camposDeSenha`).
- [ ] Chamou um site novo (API externa)? Entra na `connect-src` da CSP em `docs/index.html` e em `tools/gerar-offline.mjs`, senão o navegador bloqueia. Mexeu na ponte? `node --test tests/ponte-c6.test.mjs` e `node --test "ponte-c6/testes/*.test.mjs"`.
- [ ] Não usar dados reais de inquilinos em testes.

## Arquivos que costumam mudar juntos
| Mudança | Arquivos |
|---|---|
| Campo novo de cadastro | `formularios.js` + (`regras.js` se entra em regra) + o arquivo do assunto em `telas/` (exibição) |
| Regra de boleto | `regras.js` (`montarCobranca`, `CAMPOS_RECALCULO`) + `calculos.js` + `tests/regras.test.mjs` |
| Tela nova | arquivo do assunto em `telas/` + `telas.js` (`TELAS`) + `app.js` (`MENU`) + `estilo.css` |
| Qualquer mudança em `docs/js` | `docs/offline/administracao-imoveis.html` (gerado) |
| Campo ou caminho da API do C6 | `docs/js/mapa-c6.js` + cópia idêntica `ponte-c6/mapa-c6.mjs` + `tests/banco.test.mjs`/`tests/ponte-c6.test.mjs`; rota nova da ponte: `ponte-c6/rotas-fase2.mjs` + `docs/js/banco-fase2.js` + dados fictícios em `ponte-c6/simulado/` copiados para `docs/js/simulado-banco.js` |

## Convenções
| Item | Padrão observado no código |
|---|---|
| Idioma | Português em nomes, comentários, mensagens e commits |
| Nomes | Funções `camelCase` (`montarCobranca`), constantes `MAIUSCULAS` (`TABELAS`), campos do banco `snake_case` (`data_entrada`) |
| Valores | Dinheiro em centavos inteiros; datas `'AAAA-MM-DD'`; competência `'AAAA-MM'` |
| Estilo | ES modules, 2 espaços, aspas simples, ponto e vírgula, HTML em template strings. Não há linter no repositório: siga o estilo do arquivo que estiver alterando |
| Atributos de evento | `data-acao`, `data-form`, `data-mostrar-se`, `data-mascara` |
| Commits, branches e PRs | Título em português descrevendo o que mudou; corpo com tópicos `- `; trailers `Co-Authored-By:` e `Claude-Session:` nos commits feitos com Claude. Trabalho em branch e merge por PR no GitHub; branches feitas pelo Claude: `claude/<nome>`; um branch cujo PR já foi mergeado é recriado a partir de `main` |
