# Kit de teste automático

Faz sozinho a parte repetitiva do teste de tela de cada PR e devolve só "passou" ou "falhou em tal tela: o quê".
O olhar humano fica para o texto e a aparência da tela que mudou.

```
node tools/kit-teste.mjs                      # tudo: computador, celular, nuvem (2 abas), versão PC e links (~3 min)
node tools/kit-teste.mjs --rapido             # só computador e celular, 60 páginas de links (~1 min)
node tools/kit-teste.mjs --lugares nuvem,pc   # escolher os lugares
node tools/kit-teste.mjs --telas boleto       # só os roteiros com "boleto" no nome ou no arquivo (sem o percorredor de links)
node tools/kit-teste.mjs --manter             # navegador com janela e servidores abertos no fim, para olhar (Ctrl+C fecha)
node tools/kit-teste.mjs --textos             # guarda o texto de cada tela na pasta temporária (ajuda a escrever roteiro)
node tools/kit-teste.mjs --links 300          # quantas páginas o percorredor de links abre (padrão 150)
node tools/kit-teste.mjs --limite 20          # limite total em minutos (padrão 15)
```

Roda na pasta onde está, ou seja, na branch da PR em teste. Código de saída 0 quando tudo passa e 1 quando algo falha.

## O que ele faz

1. **Banco fictício** (`tests/kit/banco.mjs`), montado pelas próprias regras (`regras.js`, `normalizar`, gerar boleto,
   acordo, troca de titular, cálculo final) no dia fixo **25/11/2026**. O navegador fica com o relógio parado nesse dia
   (fuso de Brasília), então os valores nas telas não mudam de um dia para o outro. Casos:
   caução com boleto em aberto, PDF do banco e tarifa de R$ 8,50 (Ana); fiador e boleto atrasado com a notificação
   "Aluguel em atraso" (Bruno); acordo com honorários (Carla); entrada em 16/11, proporcional 15/30 (Diego); troca de
   titular Elisa → Fábio; saída com cálculo final feito (Gabriel, R$ 3.400,00 a devolver); saída hoje com boleto a
   descontar da caução (Helena, janela da #424); ficha em análise com o termo da reserva aceito (Igor).
   Só o CPF 529.982.247-25 e o CNPJ 11.222.333/0001-81. `tests/kit-banco.test.mjs` (no `checar`) confere que ele
   continua sendo montado.
2. **Sobe tudo em portas livres, ao acaso:** o site (`docs/`, servidor dentro do próprio kit), a nuvem local
   (`nuvem/local.mjs`, banco novo na pasta temporária, `SIMULAR_GMAIL=1`, o banco entra pela carga inicial) e a versão PC
   gerada na pasta temporária (cópia de `gerar-offline.mjs` que grava fora de `docs/offline/`; depois o arquivo fica em LF
   com os resumos da CSP refeitos, senão no Windows a CSP barra tudo por causa do CRLF).
3. **Navegador:** Playwright com o Edge instalado (ou o Chrome, ou o Chromium do Playwright). O Playwright não entra no
   repositório: o kit usa o que já está no cache do `npx` (o mesmo das sessões de teste) ou, se não houver, instala só
   o pacote em `%LOCALAPPDATA%\erp-boletos-kit` (fora do Git). `KIT_PLAYWRIGHT` (pasta do pacote) e `KIT_NAVEGADOR`
   (caminho do .exe) escolhem outro.
4. **Em cada lugar** (computador 1280 px, celular 375×812, nuvem, versão PC): entra com o login do kit e abre cada
   roteiro; confere que a tela abriu (sem "erro na tela" nem "não encontrado"), o texto esperado, nenhum erro no console
   fora da lista `CONHECIDOS` (no topo de `tools/kit-teste.mjs`, cada um com o porquê) e, no celular, nada saindo pela
   lateral. A internet fica cortada (Banco Central, CEP): nada depende dela.
5. **Nuvem com duas abas:** muda o telefone de Bruno na aba A, confere que chega à aba B (dados e tela) e que
   `#/conflitos` fica vazio nas duas.
6. **Links:** percorre os links internos (`#/…`) a partir das telas dos roteiros (limite de páginas) e roda
   `node --test tests/links-parametros.test.mjs`.
7. **Segurança do teste:** antes de qualquer script da página, os links `imoveis-…:` (chamam o programa instalado do
   dono e travam o navegador) e a impressão são barrados; cada passo tem limite de 30 s e o kit inteiro um limite total.
   Tudo o que o kit abre fica guardado pelo **PID** e só isso é parado no fim, no erro ou no Ctrl+C (nunca pelo nome).

## Saída

```
Computador: passou (22 telas, 1 min 42 s)
Celular: falhou em 1 (22 telas, 17 s)
  - Boleto atrasado: multa e juros (Bruno) (#/cobranca/3): esperado "Se for pago hoje (25/11/2026): R$ 2.049,90";
    apareceu: não está na tela; na tela: "Se for pago hoje (25/11/2026): R$ 2.050,56 (15 dias de atraso: …"
    captura: C:\Users\…\Temp\kit-teste-XXXX\capturas\celular-boleto-atrasado-multa-e-juros-bruno.png
Nuvem: passou (22 telas, 2 abas, 23 s)
Versão PC: passou (22 telas, 17 s)
Links: passou (150 páginas percorridas no computador; teste dos parâmetros ok)
Tempo total: 2 min 51 s · FALHOU
```

## Como acrescentar um roteiro (toda PR nova acrescenta os passos da tela dela)

Os roteiros ficam em `tests/kit/roteiros/*.mjs` (rodam em ordem pelo nome do arquivo). Cada arquivo exporta uma lista:

```js
// tests/kit/roteiros/05-minha-tela.mjs
export default [
  // só abrir e conferir textos (string: tem de aparecer igual; RegExp: tem de bater)
  { nome: 'Boleto de Ana', rota: (k) => `#/cobranca/${k.ids.anaBoleto}`, espera: ['Tarifa de emissão do boleto R$ 8,50'], naoEspera: ['R$ 0,00'] },
  // com ações: clicar, preencher, responder a janela e conferir
  {
    nome: 'Minha janela nova', rota: (k) => `#/contrato/${k.ids.bruno}`, lugares: ['computador', 'celular'],
    async acoes(t) {
      await t.clicar('Meu botão novo');                 // texto do botão ou seletor CSS
      await t.esperarTexto('Confira o que vai acontecer');
      t.conferir(await t.pagina.locator('dialog[open] button[value="sim"]').isDisabled(), 'botão desligado', 'estava ligado');
    },
  },
];
```

Campos: `nome` (aparece na saída), `rota` (texto `#/…` ou função que recebe o kit: `k.ids.<caso>`, `k.HOJE`), `espera`,
`naoEspera`, `lugares` (padrão: todos), `limite` (ms, padrão 30 000) e `acoes(t)`. Em `t`: `pagina` (Playwright),
`ids`, `lugar`, `abrir(rota)`, `texto()`, `clicar(alvo)`, `preencher(seletor, valor)`, `esperarTexto(texto)`,
`conferir(ok, esperado, apareceu)` e `app(fn, arg)` (roda `fn(A, arg)` na página com `A` = `docs/js/app.js`; não
existe na versão PC). Para descobrir o texto exato de uma tela: `--textos --telas <nome>`.

Caso novo no banco: acrescente em `montarBanco()` (`tests/kit/banco.mjs`), devolva o código em `ids` e, se for um valor
importante, uma linha em `tests/kit-banco.test.mjs`. Ações que gravam mudam o banco para os roteiros seguintes do
mesmo lugar: prefira "Voltar"/"Cancelar" ou ponha o roteiro no fim.

Valor esperado que mudou de propósito (regra nova): atualize o roteiro na mesma PR e diga na descrição.
