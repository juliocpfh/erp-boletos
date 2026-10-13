# Administração de Imóveis

Sistema web para administrar imóveis alugados: inquilinos, cobrança mensal, faturas de locação e documentos.

**Endereço:** https://juliocpfh.github.io/erp-boletos/

Não precisa instalar nada. O sistema abre no navegador, mas **os dados ficam numa pasta do seu computador**, que você escolhe. Pode ser uma pasta do OneDrive, para usar os mesmos dados em outro computador. Nada é guardado na internet: o endereço acima só entrega as telas.

## Como usar

1. Abra o endereço no **Google Chrome** ou no **Microsoft Edge**, no computador. Firefox, Safari e celular não conseguem gravar em pastas.
2. Crie uma pasta, por exemplo `OneDrive\Imoveis`, e clique em **Escolher a pasta dos dados**. O navegador pede permissão para editar a pasta: autorize.
3. Na primeira vez, crie o usuário administrador. Os demais usuários clicam em **Pedir acesso** na tela de login, e o administrador aprova (ou recusa) em **Usuários**, onde também cria e bloqueia usuários.
4. Nos próximos acessos, o navegador lembra a pasta e só pede para confirmar a permissão.
5. O login fica lembrado neste navegador, em todas as abas, por 12 horas sem uso, até clicar em **Sair**.

## Sem internet (arquivo único)

Em **Dados e backup → Baixar a versão sem internet** você baixa `Administração de Imóveis.html`: o programa inteiro num único arquivo (código, componentes de Excel/ZIP/PDF e modelo da NF). Guarde no computador e abra com dois cliques no Chrome ou no Edge. Funciona sem internet e mesmo se o site sair do ar; os dados são os mesmos (escolha a mesma pasta). Quando o programa receber melhorias, baixe o arquivo de novo.

O site e o arquivo único não dependem de nenhum outro serviço: os componentes de terceiros ficam em `docs/vendor/`.

## O que fica na pasta

| Na pasta | Conteúdo |
|---|---|
| `imoveis-dados.json` | O banco de dados. Cada alteração é gravada na hora. |
| `backups/` | Uma cópia por dia (últimos 30 dias) e uma cópia antes de cada importação. |
| `arquivos/<Imóvel>/` | `Documentos do imóvel` (matrícula), `IPTU (guias)`, `Seguro (apólices)`, `Reformas`, `Anúncio` (fotos) e uma pasta por inquilino: `Nome (entrada a saída)`. |
| `modelos/fatura-modelo.xlsx` | Opcional: modelo Excel da fatura enviado em Dados e backup. |

Em **Dados e backup** é possível baixar tudo (banco e anexos) em um ZIP e importar um ZIP em outra pasta.

## Mais de um computador ou usuário

- Antes de gravar, o sistema relê o arquivo da pasta e aplica a alteração sobre a versão mais nova. A cada 30 segundos (e ao voltar para a janela) ele confere se alguém mudou os dados.
- Se duas pessoas gravarem exatamente ao mesmo tempo em computadores diferentes, o OneDrive pode criar uma cópia em conflito (`imoveis-dados-NOME-PC.json`). O sistema avisa em Dados e backup.
- O login separa permissões (Administrador, Operador, Consulta) e registra quem alterou o quê no Histórico. Quem tem acesso à pasta consegue abrir o arquivo diretamente, então o login não substitui a proteção da pasta.

## Regras principais

- **Aluguel proporcional:** no mês de entrada ou saída, aluguel e desconto de pontualidade são proporcionais aos dias.
- **Reserva:** o valor dado na visita é abatido no primeiro aluguel ou no mês escolhido.
- **Bonificação:** digite o aluguel com bonificação e o % é calculado (ou o contrário). O desconto bate no centavo com o valor digitado.
- **Carência:** meses sem aluguel, escolhendo se cobra IPTU, seguro e tarifa nesse período.
- **Multa e juros:** multa % sobre o valor sem desconto e juros % ao mês pro rata dia, como o banco cobra no próprio boleto. A NF de um pagamento atrasado sai com a multa e os juros.
- **Data contábil:** ao confirmar o pagamento, informe o dia em que o dinheiro entrou na conta (é a data da NF, e pode ser alguns dias depois do pagamento). "Pagou em dia" tira multa e juros quando o banco só compensou depois do vencimento. Se atrasou de verdade, informe também o dia em que pagou.
- **IPTU proporcional:** no mês de entrada ou saída, a parcela do IPTU é proporcional aos dias, como o aluguel.
- **Boletos acompanham o cadastro:** ao mudar contrato, correção, IPTU ou seguro, os boletos em aberto são recalculados (os alterados à mão ficam como estão).
- **Valor da nota:** pago em dia = aluguel − desconto; pago com atraso = aluguel + multa + juros. IPTU, seguro e tarifa do boleto não entram.
- **Numeração das faturas:** os pagamentos recebem números contínuos e crescentes na ordem da data contábil. Um pagamento com data anterior à última NF só é numerado com confirmação. Uma NF pode ser cancelada (o número não volta) e a cancelada pode ser apagada da lista. "Voltar a última numeração" devolve à fila os pagamentos do último ciclo numerado, com o que foi preenchido, para corrigir, incluir um pagamento de data intermediária e numerar de novo com os mesmos números (dá para voltar ciclos anteriores). Inquilino marcado "sem NF" só tem o pagamento controlado.
- **Empresas:** cada imóvel define as empresas que emitem a fatura e o percentual de cada uma (ex.: ANK 50% e JCK 50%). As faturas de um pagamento têm o mesmo número, uma por empresa.
- **Airbnb:** é lançado como NF avulsa, com a data em que o dinheiro entrou, e entra na mesma sequência. Os antigos grupos Airbnb foram convertidos sozinhos em NFs avulsas.
- **Fatura:** a tela e a impressão seguem o desenho da planilha LOJA1, com as observações na caixa grande. Dá para imprimir ou exportar as selecionadas ou todas do mês, em PDF (um arquivo por empresa, "ANK Loja 1 0123.pdf") ou em Excel.
- **IPTU:** informe o vencimento da 1ª parcela na prefeitura e o primeiro mês de cobrança ao inquilino (os dois podem ser alterados se a prefeitura mudar a entrega do carnê); as parcelas seguem mês a mês pelo número de parcelas, sempre pelo valor parcelado (mesmo se o proprietário pagou à vista com desconto: a diferença fica com ele). Quando o imóvel está vazio (ou o IPTU não é cobrado do inquilino), a parcela fica com o proprietário, com alerta 15 dias antes do vencimento até ser marcada como paga. Se o proprietário quitou à vista, escolhe-se como cobrar do inquilino que entrar depois.
- **Resultados:** retorno de cada imóvel sobre o valor do imóvel + reformas, a partir dos pagamentos registrados.
- **Alertas:** correção, seguro, reserva, fim da vigência, fiador com vínculo terminando, garantia não aplicada integralmente, IPTU do proprietário e pedido de volta da titularidade depois da saída do inquilino.

## Publicar o endereço (uma vez)

No GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, branch `main`, pasta `/docs`, e salvar. Em alguns minutos o endereço acima passa a funcionar. Cada alteração enviada para `main` atualiza o sistema.

## Desenvolvimento

O código fica em `docs/` (HTML, CSS e JavaScript, sem etapa de build). Para testar localmente:

```
cd docs && python3 -m http.server 8000
```

Abra `http://localhost:8000/?teste` para usar uma pasta interna do navegador, sem escolher pasta. Depois de mudar o código, gere de novo a versão sem internet (o teste avisa se ela ficar desatualizada):

```
node tools/gerar-offline.mjs
```

Testes das regras de cálculo e numeração:

```
node --test tests/*.test.mjs
```
