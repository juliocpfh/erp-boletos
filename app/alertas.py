"""Alertas do painel: correção anual, seguro, reserva e fim de vigência."""
from __future__ import annotations

import datetime as dt

from .calculos import D, competencia_de, data, somar_anos, somar_meses

ANTECEDENCIA_CORRECAO = 30   # avisar um mês antes do aniversário do contrato
ANTECEDENCIA_SEGURO = 30
ANTECEDENCIA_VIGENCIA = 60


def aniversarios(inicio: dt.date, hoje: dt.date) -> tuple[dt.date | None, dt.date]:
    """Último aniversário já ocorrido (ou None no 1º ano) e o próximo."""
    anos = 1
    ultimo = None
    while somar_anos(inicio, anos) <= hoje:
        ultimo = somar_anos(inicio, anos)
        anos += 1
    return ultimo, somar_anos(inicio, anos)


def alerta_correcao(inicio, hoje, datas_correcoes) -> dict | None:
    inicio, hoje = data(inicio), data(hoje)
    if not inicio:
        return None
    corrigidas = [data(d) for d in datas_correcoes]
    ultimo, proximo = aniversarios(inicio, hoje)

    def ja_corrigido(aniv):
        # considera feita a correção registrada a partir de um mês antes do aniversário
        return any(c >= aniv - dt.timedelta(days=31) for c in corrigidas)

    if ultimo and not ja_corrigido(ultimo):
        return {"nivel": "perigo", "tipo": "Correção do aluguel",
                "texto": f"Contrato fez aniversário em {ultimo:%d/%m/%Y} e a correção ainda não foi registrada."}
    faltam = (proximo - hoje).days
    if faltam <= ANTECEDENCIA_CORRECAO and not ja_corrigido(proximo):
        return {"nivel": "aviso", "tipo": "Correção do aluguel",
                "texto": f"Aniversário do contrato em {proximo:%d/%m/%Y} (faltam {faltam} dias). "
                         "Avise o inquilino que o aluguel será corrigido."}
    return None


def alerta_seguro(inicio, hoje, seguros) -> dict | None:
    """``seguros``: lista de dicionários com ``vigencia_fim``."""
    hoje = data(hoje)
    fins = [data(s["vigencia_fim"]) for s in seguros if s.get("vigencia_fim")]
    if not fins:
        return {"nivel": "aviso", "tipo": "Seguro obrigatório",
                "texto": "Nenhum seguro cadastrado para este contrato."}
    fim = max(fins)
    faltam = (fim - hoje).days
    if faltam < 0:
        return {"nivel": "perigo", "tipo": "Seguro obrigatório",
                "texto": f"Seguro vencido em {fim:%d/%m/%Y}. Renove a apólice."}
    if faltam <= ANTECEDENCIA_SEGURO:
        return {"nivel": "aviso", "tipo": "Seguro obrigatório",
                "texto": f"Seguro vence em {fim:%d/%m/%Y} (faltam {faltam} dias). Providencie a renovação."}
    inicio = data(inicio)
    if inicio:
        _, proximo = aniversarios(inicio, hoje)
        if (proximo - hoje).days <= ANTECEDENCIA_SEGURO and fim <= proximo + dt.timedelta(days=15):
            return {"nivel": "aviso", "tipo": "Seguro obrigatório",
                    "texto": f"Aniversário do contrato em {proximo:%d/%m/%Y}: confira a renovação do seguro."}
    return None


def alerta_reserva(reserva_valor, saldo, competencia_alvo, hoje) -> dict | None:
    if D(reserva_valor) <= 0 or D(saldo) <= 0 or not competencia_alvo:
        return None
    hoje = data(hoje)
    proxima = somar_meses(competencia_de(hoje), 1)
    ano, mes = competencia_alvo.split("-")
    if competencia_alvo <= proxima:
        return {"nivel": "info", "tipo": "Reserva do imóvel",
                "texto": f"Reserva de R$ {D(saldo):,.2f} será usada para abater a cobrança de {mes}/{ano}."
                .replace(",", "X").replace(".", ",").replace("X", ".")}
    return None


def alerta_vigencia(vigencia_fim, hoje) -> dict | None:
    fim, hoje = data(vigencia_fim), data(hoje)
    if not fim:
        return None
    faltam = (fim - hoje).days
    if faltam < 0:
        return {"nivel": "aviso", "tipo": "Vigência do contrato",
                "texto": f"Vigência terminou em {fim:%d/%m/%Y}. Renove ou registre a saída."}
    if faltam <= ANTECEDENCIA_VIGENCIA:
        return {"nivel": "aviso", "tipo": "Vigência do contrato",
                "texto": f"Vigência termina em {fim:%d/%m/%Y} (faltam {faltam} dias)."}
    return None
