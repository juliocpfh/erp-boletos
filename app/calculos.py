"""Regras de cálculo da cobrança mensal de aluguel.

Todas as funções trabalham com Decimal e arredondam em centavos (meio para cima),
para que os valores batam com os do boleto e da nota fiscal.
"""
from __future__ import annotations

import calendar
import datetime as dt
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

CENTAVO = Decimal("0.01")
ZERO = Decimal("0.00")


# --------------------------------------------------------------------------- #
# Conversões
# --------------------------------------------------------------------------- #
def D(valor) -> Decimal:
    """Converte número, texto em formato brasileiro ("1.234,56") ou None em Decimal."""
    if valor is None or valor == "":
        return Decimal("0")
    if isinstance(valor, Decimal):
        return valor
    if isinstance(valor, (int, float)):
        return Decimal(str(valor))
    texto = str(valor).strip().replace("R$", "").replace("%", "").replace(" ", "")
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    try:
        return Decimal(texto)
    except InvalidOperation as exc:
        raise ValueError(f"Valor inválido: {valor!r}") from exc


def arred(valor) -> Decimal:
    return D(valor).quantize(CENTAVO, rounding=ROUND_HALF_UP)


def data(valor) -> dt.date | None:
    if valor in (None, ""):
        return None
    if isinstance(valor, dt.datetime):
        return valor.date()
    if isinstance(valor, dt.date):
        return valor
    return dt.date.fromisoformat(str(valor)[:10])


# --------------------------------------------------------------------------- #
# Competências (mês de referência no formato AAAA-MM)
# --------------------------------------------------------------------------- #
def competencia_de(d: dt.date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def separar_competencia(comp: str) -> tuple[int, int]:
    ano, mes = comp.split("-")[:2]
    return int(ano), int(mes)


def somar_meses(comp: str, meses: int) -> str:
    ano, mes = separar_competencia(comp)
    total = ano * 12 + (mes - 1) + meses
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def meses_entre(inicio: str, fim: str) -> int:
    a1, m1 = separar_competencia(inicio)
    a2, m2 = separar_competencia(fim)
    return (a2 - a1) * 12 + (m2 - m1)


def dias_no_mes(comp: str) -> int:
    ano, mes = separar_competencia(comp)
    return calendar.monthrange(ano, mes)[1]


def limites_competencia(comp: str) -> tuple[dt.date, dt.date]:
    ano, mes = separar_competencia(comp)
    return dt.date(ano, mes, 1), dt.date(ano, mes, dias_no_mes(comp))


def somar_anos(d: dt.date, anos: int) -> dt.date:
    try:
        return d.replace(year=d.year + anos)
    except ValueError:  # 29/02 em ano não bissexto
        return d.replace(year=d.year + anos, day=28)


def vencimento_da_competencia(comp: str, dia: int, mes_seguinte: bool = True) -> dt.date:
    """Data de vencimento da cobrança de uma competência.

    Com ``mes_seguinte`` o aluguel do mês é pago no mês seguinte (aluguel vencido).
    Dias inexistentes (ex.: 31 em abril) passam para o último dia do mês.
    """
    alvo = somar_meses(comp, 1) if mes_seguinte else comp
    ano, mes = separar_competencia(alvo)
    return dt.date(ano, mes, min(int(dia), dias_no_mes(alvo)))


# --------------------------------------------------------------------------- #
# Aluguel proporcional e desconto de pontualidade
# --------------------------------------------------------------------------- #
def dias_ocupados(comp: str, entrada, saida=None) -> int:
    """Quantos dias da competência o inquilino ocupou o imóvel (dia de entrada e de saída contam)."""
    inicio_mes, fim_mes = limites_competencia(comp)
    entrada, saida = data(entrada), data(saida)
    inicio = max(inicio_mes, entrada) if entrada else inicio_mes
    fim = min(fim_mes, saida) if saida else fim_mes
    if fim < inicio:
        return 0
    return (fim - inicio).days + 1


def aluguel_proporcional(valor_mensal, dias: int, dias_mes: int) -> Decimal:
    if dias >= dias_mes:
        return arred(valor_mensal)
    return arred(D(valor_mensal) * dias / dias_mes)


def desconto_por_percentual(base, percentual) -> Decimal:
    return arred(D(base) * D(percentual) / 100)


def percentual_por_desconto(base, valor) -> Decimal:
    base = D(base)
    if base == 0:
        return Decimal("0")
    return (D(valor) * 100 / base).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


# --------------------------------------------------------------------------- #
# Parcelamentos (IPTU e seguro)
# --------------------------------------------------------------------------- #
def parcelas(total, quantidade: int) -> list[Decimal]:
    """Divide um valor em parcelas; a diferença de centavos fica na primeira."""
    quantidade = int(quantidade or 0)
    if quantidade <= 0:
        return []
    total = arred(total)
    base = (total / quantidade).quantize(CENTAVO, rounding=ROUND_HALF_UP)
    lista = [base] * quantidade
    lista[0] = total - base * (quantidade - 1)
    return lista


def parcela_na_competencia(total, quantidade: int, primeira_competencia: str, comp: str):
    """Retorna (número da parcela, valor) cobrado na competência, ou (None, 0)."""
    if not primeira_competencia or not quantidade:
        return None, ZERO
    indice = meses_entre(primeira_competencia, comp)
    lista = parcelas(total, quantidade)
    if 0 <= indice < len(lista):
        return indice + 1, lista[indice]
    return None, ZERO


# --------------------------------------------------------------------------- #
# Correção de valores (aluguel e caução)
# --------------------------------------------------------------------------- #
def aplicar_correcao(valor, percentual) -> Decimal:
    return arred(D(valor) * (1 + D(percentual) / 100))


def aluguel_vigente(aluguel_inicial, correcoes, referencia) -> Decimal:
    """Valor do aluguel numa data, a partir do histórico de correções.

    ``correcoes`` é uma lista de dicionários com ``data_vigencia`` e ``valor_novo``.
    """
    referencia = data(referencia)
    valor = arred(aluguel_inicial)
    for c in sorted(correcoes, key=lambda c: str(c["data_vigencia"])):
        if data(c["data_vigencia"]) <= referencia:
            valor = arred(c["valor_novo"])
    return valor


# --------------------------------------------------------------------------- #
# Composição da cobrança
# --------------------------------------------------------------------------- #
def totais_cobranca(aluguel, desconto, iptu=0, seguro=0, taxa_boleto=0, outros=0,
                    reserva_disponivel=0) -> dict:
    """Soma os itens da cobrança e aplica a reserva (sinal pago na visita), se houver."""
    aluguel, desconto = arred(aluguel), arred(desconto)
    encargos = arred(D(iptu) + D(seguro) + D(taxa_boleto) + D(outros))
    total_sem_desconto = aluguel + encargos
    total_pontual = total_sem_desconto - desconto
    reserva = min(arred(reserva_disponivel), max(total_pontual, ZERO))
    return {
        "encargos": encargos,
        "total_sem_desconto": total_sem_desconto,
        "total_pontual": total_pontual,
        "reserva_utilizada": reserva,
        "a_pagar_pontual": total_pontual - reserva,
        "a_pagar_sem_desconto": max(total_sem_desconto - reserva, ZERO),
    }


def calcular_cobranca(*, competencia: str, aluguel_mensal, entrada, saida=None,
                      desconto_percentual=0, iptu=0, seguro=0, taxa_boleto=0,
                      outros=0, reserva_disponivel=0) -> dict:
    """Calcula a cobrança de uma competência, já com aluguel e desconto proporcionais."""
    dias_mes = dias_no_mes(competencia)
    dias = dias_ocupados(competencia, entrada, saida)
    aluguel = aluguel_proporcional(aluguel_mensal, dias, dias_mes)
    desconto = desconto_por_percentual(aluguel, desconto_percentual)
    resultado = {
        "competencia": competencia,
        "dias_cobrados": dias,
        "dias_mes": dias_mes,
        "aluguel_mensal": arred(aluguel_mensal),
        "aluguel": aluguel,
        "desconto": desconto,
        "iptu": arred(iptu),
        "seguro": arred(seguro),
        "taxa_boleto": arred(taxa_boleto),
        "outros": arred(outros),
    }
    resultado.update(totais_cobranca(aluguel, desconto, iptu, seguro, taxa_boleto, outros,
                                     reserva_disponivel))
    return resultado


# --------------------------------------------------------------------------- #
# Pagamento: multa, juros e nota fiscal
# --------------------------------------------------------------------------- #
def multa_e_juros(base, vencimento, pagamento, multa_percentual, juros_mensal_percentual):
    """Multa fixa sobre o valor em aberto e juros simples pro rata dia (mês de 30 dias)."""
    vencimento, pagamento = data(vencimento), data(pagamento)
    dias = (pagamento - vencimento).days
    if dias <= 0:
        return 0, ZERO, ZERO
    multa = arred(D(base) * D(multa_percentual) / 100)
    juros = arred(D(base) * D(juros_mensal_percentual) / 100 * dias / 30)
    return dias, multa, juros


def valor_nota_fiscal(aluguel, desconto, multa=0, juros=0, pontual=True) -> Decimal:
    """Base da NF de serviço: só o aluguel.

    Pontual: aluguel com o desconto de pontualidade.
    Em atraso: aluguel cheio (perde o desconto) mais multa e juros.
    IPTU, seguro e tarifa de cobrança não entram.
    """
    if pontual:
        return arred(D(aluguel) - D(desconto))
    return arred(D(aluguel) + D(multa) + D(juros))


def liquidar(cobranca: dict, pagamento) -> dict:
    """Calcula quanto o inquilino deve pagar numa data e o valor da nota fiscal."""
    totais = totais_cobranca(cobranca["aluguel"], cobranca["desconto"], cobranca["iptu"],
                             cobranca["seguro"], cobranca["taxa_boleto"], cobranca["outros"],
                             cobranca.get("reserva_utilizada") or 0)
    dias, multa, juros = multa_e_juros(totais["a_pagar_sem_desconto"], cobranca["vencimento"],
                                       pagamento, cobranca["multa_percentual"],
                                       cobranca["juros_mensal_percentual"])
    pontual = dias == 0
    devido = totais["a_pagar_pontual"] if pontual else totais["a_pagar_sem_desconto"] + multa + juros
    return {
        "dias_atraso": dias,
        "pontual": pontual,
        "multa": multa,
        "juros": juros,
        "valor_devido": arred(devido),
        "valor_nf": valor_nota_fiscal(cobranca["aluguel"], cobranca["desconto"], multa, juros, pontual),
    }


# --------------------------------------------------------------------------- #
# Fatura de locação dividida entre as empresas proprietárias
# --------------------------------------------------------------------------- #
def dividir(total, percentuais) -> list[Decimal]:
    """Divide um valor pelos percentuais; a sobra de centavos fica com a última parte."""
    total = arred(total)
    partes = [arred(total * D(p) / 100) for p in percentuais]
    if partes and sum(D(p) for p in percentuais) == 100:
        partes[-1] = total - sum(partes[:-1])
    return partes


def periodo_servico(comp: str, entrada, saida=None) -> tuple[dt.date, dt.date]:
    """Período de ocupação dentro da competência (ex.: 07/03 a 31/03 no mês de entrada)."""
    inicio, fim = limites_competencia(comp)
    entrada, saida = data(entrada), data(saida)
    if entrada and entrada > inicio:
        inicio = entrada
    if saida and saida < fim:
        fim = saida
    return inicio, fim
