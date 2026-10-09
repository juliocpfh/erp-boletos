# Administração de Imóveis

Programa para administrar imóveis locados: cadastro de imóveis e inquilinos, cobrança mensal
(aluguel, IPTU, seguro, taxa de boleto, desconto de pontualidade, reserva), confirmação de
pagamento com multa e juros, emissão das faturas de locação divididas entre as empresas,
alertas, histórico de alterações e arquivos de cada imóvel e inquilino.

Ele funciona no navegador, mas roda no seu computador. Os dados ficam numa pasta `dados`
ao lado do programa e podem ser levados para outro computador num arquivo ZIP.

## Instalar e abrir (Windows)

1. Instale o Python 3 (https://www.python.org/downloads/). Na instalação, marque
   **"Add python.exe to PATH"**.
2. Baixe este programa (botão verde **Code → Download ZIP** no GitHub) e descompacte numa pasta,
   por exemplo `C:\Imoveis`.
3. Dê dois cliques em **`iniciar.bat`**. Na primeira vez ele instala o que precisa (leva um minuto).
4. O navegador abre sozinho em `http://127.0.0.1:8080`. Na primeira vez, crie o usuário administrador.

Para encerrar, feche a janela preta. Para usar de novo, dois cliques em `iniciar.bat`.

**Outros computadores da mesma rede**: abra com **`iniciar-rede.bat`**. A janela mostra um
endereço como `http://192.168.0.10:8080`; os outros computadores acessam esse endereço no
navegador, cada um com seu login. (O Windows pode pedir para liberar o acesso no firewall.)

Linux/macOS: `./iniciar.sh` (ou `./iniciar.sh --rede`).

## Primeiros passos

1. **Empresas**: cadastre as empresas que emitem as faturas (ex.: ANK e JCK) e o número da
   próxima fatura.
2. **Imóveis → Novo imóvel**: nome, endereço, matrícula, IPTU, link do último anúncio.
   Na página do imóvel, defina as empresas e o percentual de cada uma (ex.: 50% / 50%),
   lance o IPTU do ano, registre os protocolos de troca de titularidade e anexe as fotos do anúncio.
3. **Novo inquilino**: nome, apelido, telefone (com marcação de WhatsApp), e-mail, CPF, RG, datas,
   aluguel, vencimento, desconto de pontualidade (em % ou R$), multa, juros, garantia (caução ou
   fiador) e reserva. Depois cadastre o seguro obrigatório e anexe contrato, vistoria etc.
4. **Cobranças do mês**: escolha o mês, gere as cobranças e imprima os demonstrativos.
   Quando o inquilino pagar, informe a data e clique em **Confirmar**: o sistema mostra se foi em
   dia ou com atraso e calcula o valor da nota. Depois clique em **Emitir** e imprima as faturas.

## Como os valores são calculados

- **Aluguel proporcional**: dias ocupados no mês ÷ dias do mês. Entrou dia 7 num mês de 30 dias:
  paga 24/30 do aluguel. O desconto de pontualidade também é proporcional.
- **Aluguel atual**: aluguel inicial com as correções registradas. A cobrança de um mês usa o
  valor que vale no dia 1º daquele mês.
- **IPTU e seguro**: o total é dividido nas parcelas (a diferença de centavos fica na 1ª) e cada
  parcela entra na cobrança do mês correspondente.
- **Reserva**: abate a cobrança do mês escolhido (ou do primeiro aluguel).
- **Vencimento**: por padrão o aluguel do mês vence no mês seguinte (aluguel de julho vence em agosto).
  Pode ser mudado em cada contrato.
- **Atraso**: perde o desconto; multa (%) sobre o valor em aberto e juros (% ao mês) pro rata dia.
- **Nota fiscal / fatura**: pagou em dia = aluguel − desconto; atrasou = aluguel + multa + juros.
  IPTU, seguro e tarifa não entram. O valor é dividido entre as empresas pelo percentual do imóvel,
  e as faturas das empresas de uma mesma cobrança recebem o mesmo número.

## Alertas (Painel)

- Correção do aluguel: 30 dias antes do aniversário do contrato, e enquanto não for registrada.
- Seguro: vencendo em 30 dias, vencido, não cadastrado ou no aniversário do contrato.
- Reserva: quando será usada para abater uma cobrança.
- Vigência do contrato terminando em 60 dias.

## Dados, arquivos e backup

```
dados/
  banco.db                 banco de dados
  arquivos/
    Loja 1/
      Documentos do imóvel/    matrícula, cadastro do IPTU
      Anúncio/                 fotos do último anúncio
      Carmem Beatriz Herrera (07-06-2026 a -)/    contrato, vistoria, apólices, notificações
  modelos/nfse.xml         modelo XML da nota (opcional)
  backups/                 cópias automáticas
```

- Tudo é salvo na hora; o topo da tela mostra a data da última atualização e quem fez.
- A pasta do inquilino é renomeada sozinha quando a data de saída é preenchida.
- **Histórico** mostra cada alteração: quem, quando, valor antigo e valor novo.
- **Dados e backup → Baixar ZIP** gera um arquivo com banco e anexos. No outro computador,
  **Importar** esse ZIP (substitui os dados de lá, guardando antes uma cópia em `backups`).
- Ao abrir, o programa guarda uma cópia do banco em `backups/automaticos` (15 últimas).

## Usuários

- **Administrador**: tudo, inclusive usuários, empresas e importação.
- **Operador**: cadastra, altera, confirma pagamentos e emite faturas.
- **Consulta**: só visualiza.

## Modelo XML da nota

Em **Dados e backup**, envie o XML da nota com os campos que mudam escritos entre chaves duplas,
como `{{valor_fatura}}` ou `{{inquilino_cpf}}`. A lista de campos aparece na própria tela;
há um exemplo em `exemplos/modelo-nfse-exemplo.xml`. Cada fatura emitida ganha o botão **XML**.

## Para desenvolvedores

```
python -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/python -m pytest
```

Código: `app/calculos.py` (regras de cálculo), `app/alertas.py`, `app/servicos.py`,
`app/views.py` (telas), `app/db.py` (banco e histórico), `app/backup.py` (ZIP),
`app/notafiscal.py` (XML a partir do modelo).
