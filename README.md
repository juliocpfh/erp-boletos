# Administração de Imóveis

Sistema web para administrar imóveis alugados: inquilinos, cobrança mensal, faturas de locação e documentos.

**Endereço:** https://juliocpfh.github.io/erp-boletos/

Não precisa instalar nada. O sistema abre no navegador, mas **os dados ficam numa pasta do seu computador**, que você escolhe. Pode ser uma pasta do OneDrive, para usar os mesmos dados em outro computador. Nada é guardado na internet: o endereço acima só entrega as telas.

## Como usar

1. Abra o endereço no **Google Chrome** ou no **Microsoft Edge**, no computador. Firefox, Safari e celular não conseguem gravar em pastas.
2. Crie uma pasta, por exemplo `OneDrive\Imoveis`, e clique em **Escolher a pasta dos dados**. O navegador pede permissão para editar a pasta: autorize.
3. Na primeira vez, crie o usuário administrador. Os demais usuários são cadastrados em **Usuários**.
4. Nos próximos acessos, o navegador lembra a pasta e só pede para confirmar a permissão.

## O que fica na pasta

| Na pasta | Conteúdo |
|---|---|
| `imoveis-dados.json` | O banco de dados. Cada alteração é gravada na hora. |
| `backups/` | Uma cópia por dia (últimos 30 dias) e uma cópia antes de cada importação. |
| `arquivos/<Imóvel>/` | `Documentos do imóvel` (matrícula, IPTU), `Anúncio` (fotos) e uma pasta por inquilino: `Nome (entrada a saída)`. |
| `modelos/fatura-modelo.xlsx` | Opcional: modelo Excel da fatura enviado em Dados e backup. |

Em **Dados e backup** é possível baixar tudo (banco e anexos) em um ZIP e importar um ZIP em outra pasta.

## Mais de um computador ou usuário

- Antes de gravar, o sistema relê o arquivo da pasta e aplica a alteração sobre a versão mais nova. A cada 30 segundos (e ao voltar para a janela) ele confere se alguém mudou os dados.
- Se duas pessoas gravarem exatamente ao mesmo tempo em computadores diferentes, o OneDrive pode criar uma cópia em conflito (`imoveis-dados-NOME-PC.json`). O sistema avisa em Dados e backup.
- O login separa permissões (Administrador, Operador, Consulta) e registra quem alterou o quê no Histórico. Quem tem acesso à pasta consegue abrir o arquivo diretamente, então o login não substitui a proteção da pasta.

## Regras principais

- **Aluguel proporcional:** no mês de entrada ou saída, aluguel e desconto de pontualidade são proporcionais aos dias.
- **Reserva:** o valor dado na visita é abatido no primeiro aluguel ou no mês escolhido.
- **Multa e juros:** multa % sobre o aluguel sem desconto e juros % ao mês pro rata dia, mostrados separados com percentual e valor.
- **Valor da nota:** pago em dia = aluguel − desconto; pago com atraso = aluguel + multa + juros. IPTU, seguro e tarifa do boleto não entram.
- **Numeração das faturas:** ao confirmar o pagamento com a data em que o dinheiro entrou, ele vai para a fila. Em **Numerar faturas**, os pagamentos recebem números contínuos e crescentes na ordem das datas de pagamento, e a data de emissão é a data do pagamento. Um pagamento com data anterior à última fatura emitida só é numerado com confirmação. Números cancelados não são reaproveitados.
- **Empresas:** cada imóvel define as empresas que emitem a fatura e o percentual de cada uma (ex.: ANK 50% e JCK 50%). As faturas de um pagamento têm o mesmo número, uma por empresa.
- **Airbnb:** um grupo Airbnb reúne as unidades e tem o cliente que aparece na fatura. Cada recebimento entra na mesma sequência de numeração.
- **Fatura:** a tela e a impressão seguem o desenho da planilha LOJA1. Também é possível baixar cada fatura (ou todas do mês) em Excel, preenchido a partir do modelo.
- **Alertas:** correção um mês antes do aniversário do contrato, renovação do seguro, uso da reserva e fim da vigência.

## Publicar o endereço (uma vez)

No GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`, pasta `/docs`, e salvar. Em alguns minutos o endereço acima passa a funcionar. Cada alteração enviada para `main` atualiza o sistema.

## Desenvolvimento

O código fica em `docs/` (HTML, CSS e JavaScript, sem etapa de build). Para testar localmente:

```
cd docs && python3 -m http.server 8000
```

Abra `http://localhost:8000/?teste` para usar uma pasta interna do navegador, sem escolher pasta. Testes das regras de cálculo e numeração:

```
node --test tests/*.test.mjs
```
