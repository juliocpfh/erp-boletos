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
   Tipos usados: `texto`, `area`, `data`, `mes`, `dinheiro` (centavos), `pct`, `inteiro`, `opcao`, `simnao`, `tel`, `email`, `cpf`, `cnpj`, `cpfcnpj`, `cep`. Mostrar/esconder campo: `quando('campo', 'valor')`.
3. `docs/js/telas.js` → entrada em `CADASTROS` (modelo: `reformas`):
   ```js
   reformas: {
     titulo: (r, q) => `Reforma - ${buscar('imoveis', r ? r.imovel_id : q.imovel).nome}`,
     campos: () => F.REFORMA,
     fixos: (r, q) => (r ? {} : { imovel_id: Number(q.imovel) }),
     voltar: (r, q) => `#/imovel/${r ? r.imovel_id : q.imovel}?ir=reformas`,
   },
   ```
   Opcionais: `padrao`, `valores`, `ajustar` (validação/erros), `conferir` (avisos com confirmação), `salvar` (gravação própria), `depois`, `recalcular` (boletos em aberto), `destino`, `aviso`.
4. Links: novo `#/novo/<tabela>?...`; editar `#/editar/<tabela>/<id>`. A gravação genérica é `FORMULARIOS.cadastro`.
5. Exclusão: entrada em `TABELAS_EXCLUSAO` (`telas.js`) com `admin`, `checar`, `voltar`, `recalcular` ou `depois`. Se a tabela pertence a um contrato ou imóvel, inclua-a na exclusão em cascata de `ACOES.excluir`.

## Adicionar uma tela
1. `telas.js` → função `telaX(rota)` que devolve HTML em texto; registre em `TELAS` com a chave da rota (`#/x/...` → `TELAS.x`). `rota.partes` = pedaços do caminho; `rota.q` = parâmetros. `?ir=<id>` rola até o elemento e depois sai do endereço (`mostrar` em `app.js`).
2. Texto do usuário sempre com `esc()`; valores com `reais()`, `dataBr()`, `compBr()`.
3. Botões: `botao('acao', 'Texto', { id })` + função em `ACOES`. Formulários: `<form data-form="nome">` + função em `FORMULARIOS`.
4. Menu: `MENU` em `docs/js/app.js` (o 3º item é a expressão que marca o menu ativo pela rota).
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
4. Teste em `tests/regras.test.mjs` usando `base()` (banco de exemplo do próprio arquivo).

## Adicionar um relatório
| Tipo | Como fazer (exemplo existente) |
|---|---|
| Tela com tabela | Função em `regras.js` que devolve linhas + tela em `telas.js` (`resultadosFinanceiros` + `telaResultados`) |
| Excel | `ACOES.excelResultados` (ExcelJS via `excelJs()` de `app.js`, download com `baixar()`) |
| PDF/impressão | Tipo novo em `telaImprimir` + CSS de `@media print` em `docs/css/estilo.css` |
| Documento Word | Blocos de `contratos.js` + `contratoDocx` (ex.: `documentoMontado` em `telas.js`) |

## Checklist antes de alterar
- [ ] Ler a função e os testes da área (`tests/*.test.mjs`).
- [ ] Achar o trecho com `node tools/mapa.mjs <trecho>` e ler só ele.
- [ ] Rodar `node tools/checar.mjs` (sintaxe do app inteiro + testes; `node --check` não pega tudo nos módulos do navegador).
- [ ] Testar no navegador: `cd docs && python3 -m http.server 8000` e `http://localhost:8000/?teste`.
- [ ] Mudou `docs/js`, `docs/vendor`, `docs/css/estilo.css` ou o modelo xlsx: rodar `node tools/checar.mjs --offline` (senão `tests/offline.test.mjs` falha).
- [ ] Campo novo no banco: valor padrão ou migração em `normalizar`, se registros antigos precisarem dele.
- [ ] Não usar dados reais de inquilinos em testes.

## Arquivos que costumam mudar juntos
| Mudança | Arquivos |
|---|---|
| Campo novo de cadastro | `formularios.js` + (`regras.js` se entra em regra) + `telas.js` (exibição) |
| Regra de boleto | `regras.js` (`montarCobranca`, `CAMPOS_RECALCULO`) + `calculos.js` + `tests/regras.test.mjs` |
| Tela nova | `telas.js` + `app.js` (`MENU`) + `estilo.css` |
| Qualquer mudança em `docs/js` | `docs/offline/administracao-imoveis.html` (gerado) |

## Convenções
| Item | Padrão observado no código |
|---|---|
| Idioma | Português em nomes, comentários, mensagens e commits |
| Nomes | Funções `camelCase` (`montarCobranca`), constantes `MAIUSCULAS` (`TABELAS`), campos do banco `snake_case` (`data_entrada`) |
| Valores | Dinheiro em centavos inteiros; datas `'AAAA-MM-DD'`; competência `'AAAA-MM'` |
| Estilo | ES modules, 2 espaços, aspas simples, ponto e vírgula, HTML em template strings. Não há linter no repositório: siga o estilo do arquivo que estiver alterando |
| Atributos de evento | `data-acao`, `data-form`, `data-mostrar-se`, `data-mascara` |
| Commits | Título em português descrevendo o que mudou; corpo com tópicos `- `; trailers `Co-Authored-By:` e `Claude-Session:` nos commits feitos com Claude |
| Branches/PRs | Trabalho em branch e merge por PR no GitHub. Branches feitas pelo Claude: `claude/<nome>`; um branch cujo PR já foi mergeado é recriado a partir de `main` |
