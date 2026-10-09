import datetime as dt
from decimal import Decimal as Dec

import pytest

from app import alertas, calculos as c


def test_converte_valores_brasileiros():
    assert c.D("1.234,56") == Dec("1234.56")
    assert c.D("R$ 1.350,00") == Dec("1350.00")
    assert c.D("10%") == Dec("10")
    assert c.D("") == 0
    with pytest.raises(ValueError):
        c.D("abc")


def test_aluguel_proporcional_entrada_dia_7_em_mes_de_30_dias():
    # Entrou dia 7 de junho (30 dias): paga 24 dias (7 a 30)
    dias = c.dias_ocupados("2026-06", "2026-06-07")
    assert dias == 24
    assert c.aluguel_proporcional(Dec("1500"), dias, 30) == Dec("1200.00")


def test_aluguel_proporcional_na_saida_e_meses_cheios():
    assert c.dias_ocupados("2026-07", "2025-01-01", "2026-07-10") == 10
    assert c.dias_ocupados("2026-07", "2025-01-01") == 31
    assert c.dias_ocupados("2026-08", "2025-01-01", "2026-07-10") == 0
    assert c.aluguel_proporcional(Dec("1350"), 31, 31) == Dec("1350.00")


def test_desconto_percentual_e_valor_atrelados():
    assert c.desconto_por_percentual(Dec("1350"), Dec("10")) == Dec("135.00")
    assert c.percentual_por_desconto(Dec("1350"), Dec("135")) == Dec("10.0000")
    assert c.percentual_por_desconto(0, 10) == 0


def test_parcelas_somam_o_total_e_sobra_vai_para_a_primeira():
    p = c.parcelas(Dec("1000"), 3)
    assert p == [Dec("333.34"), Dec("333.33"), Dec("333.33")]
    assert sum(p) == Dec("1000")
    assert c.parcelas(100, 0) == []


def test_parcela_na_competencia():
    assert c.parcela_na_competencia(Dec("1000"), 10, "2026-02", "2026-02") == (1, Dec("100.00"))
    assert c.parcela_na_competencia(Dec("1000"), 10, "2026-02", "2026-11") == (10, Dec("100.00"))
    assert c.parcela_na_competencia(Dec("1000"), 10, "2026-02", "2026-12") == (None, 0)
    assert c.parcela_na_competencia(Dec("1000"), 10, "2026-02", "2026-01") == (None, 0)


def test_competencias_e_vencimento():
    assert c.somar_meses("2026-12", 1) == "2027-01"
    assert c.somar_meses("2026-01", -1) == "2025-12"
    assert c.meses_entre("2025-11", "2026-02") == 3
    assert c.vencimento_da_competencia("2026-07", 10) == dt.date(2026, 8, 10)
    assert c.vencimento_da_competencia("2026-07", 10, mes_seguinte=False) == dt.date(2026, 7, 10)
    assert c.vencimento_da_competencia("2026-01", 31) == dt.date(2026, 2, 28)


def test_correcao_e_aluguel_vigente():
    assert c.aplicar_correcao(Dec("1350"), Dec("4.5")) == Dec("1410.75")
    hist = [{"data_vigencia": "2026-03-01", "valor_novo": "1410.75"},
            {"data_vigencia": "2027-03-01", "valor_novo": "1480.00"}]
    assert c.aluguel_vigente("1350", hist, "2026-02-28") == Dec("1350.00")
    assert c.aluguel_vigente("1350", hist, "2026-03-01") == Dec("1410.75")
    assert c.aluguel_vigente("1350", hist, "2027-05-01") == Dec("1480.00")


def test_cobranca_completa_mes_de_entrada():
    r = c.calcular_cobranca(competencia="2026-06", aluguel_mensal="1500", entrada="2026-06-07",
                            desconto_percentual="10", iptu="80", seguro="25.50", taxa_boleto="3.50")
    assert r["aluguel"] == Dec("1200.00")
    assert r["desconto"] == Dec("120.00")          # desconto também proporcional
    assert r["total_sem_desconto"] == Dec("1309.00")
    assert r["total_pontual"] == Dec("1189.00")
    assert r["a_pagar_pontual"] == Dec("1189.00")


def test_reserva_abate_a_cobranca():
    r = c.calcular_cobranca(competencia="2026-07", aluguel_mensal="1000", entrada="2026-01-01",
                            desconto_percentual="0", reserva_disponivel="300")
    assert r["reserva_utilizada"] == Dec("300.00")
    assert r["a_pagar_pontual"] == Dec("700.00")
    r = c.calcular_cobranca(competencia="2026-07", aluguel_mensal="200", entrada="2026-01-01",
                            reserva_disponivel="300")
    assert r["reserva_utilizada"] == Dec("200.00")   # nunca usa mais que o valor da cobrança
    assert r["a_pagar_pontual"] == 0


def test_multa_e_juros_pro_rata():
    dias, multa, juros = c.multa_e_juros(Dec("1000"), "2026-08-10", "2026-08-25", 10, 1)
    assert dias == 15
    assert multa == Dec("100.00")
    assert juros == Dec("5.00")
    assert c.multa_e_juros(1000, "2026-08-10", "2026-08-10", 10, 1) == (0, 0, 0)


def test_nota_fiscal_pontual_e_atrasada():
    assert c.valor_nota_fiscal(1350, 135) == Dec("1215.00")
    assert c.valor_nota_fiscal(1350, 135, 140, 5, pontual=False) == Dec("1495.00")


def test_liquidar_pontual_e_atrasado():
    cob = {"aluguel": "1350", "desconto": "135", "iptu": "100", "seguro": "30", "taxa_boleto": "5",
           "outros": "0", "reserva_utilizada": "0", "vencimento": "2026-08-10",
           "multa_percentual": "10", "juros_mensal_percentual": "1"}
    em_dia = c.liquidar(cob, "2026-08-10")
    assert em_dia["pontual"] and em_dia["valor_devido"] == Dec("1350.00")
    assert em_dia["valor_nf"] == Dec("1215.00")
    atraso = c.liquidar(cob, "2026-08-20")
    # aberto sem desconto 1485; multa 148,50; juros 1485 * 1% * 10/30 = 4,95
    assert atraso["multa"] == Dec("148.50") and atraso["juros"] == Dec("4.95")
    assert atraso["valor_devido"] == Dec("1638.45")
    assert atraso["valor_nf"] == Dec("1350") + Dec("148.50") + Dec("4.95")


def test_divisao_da_fatura_entre_empresas():
    assert c.dividir(Dec("1350"), [50, 50]) == [Dec("675.00"), Dec("675.00")]
    partes = c.dividir(Dec("1215.01"), [50, 50])
    assert sum(partes) == Dec("1215.01")
    assert c.periodo_servico("2026-07", "2025-01-01") == (dt.date(2026, 7, 1), dt.date(2026, 7, 31))
    assert c.periodo_servico("2026-06", "2026-06-07") == (dt.date(2026, 6, 7), dt.date(2026, 6, 30))


def test_alerta_de_correcao_um_mes_antes_do_aniversario():
    assert alertas.alerta_correcao("2025-11-01", "2026-09-15", []) is None
    a = alertas.alerta_correcao("2025-11-01", "2026-10-05", [])
    assert a and a["nivel"] == "aviso" and "01/11/2026" in a["texto"]
    a = alertas.alerta_correcao("2025-11-01", "2026-11-20", [])
    assert a and a["nivel"] == "perigo"
    assert alertas.alerta_correcao("2025-11-01", "2026-11-20", ["2026-11-01"]) is None
    assert alertas.alerta_correcao("2025-11-01", "2026-10-05", ["2026-10-20"]) is None


def test_alerta_de_seguro():
    assert alertas.alerta_seguro("2025-11-01", "2026-10-05", [])["texto"].startswith("Nenhum")
    a = alertas.alerta_seguro("2025-11-01", "2026-10-05", [{"vigencia_fim": "2026-10-31"}])
    assert a and "vence" in a["texto"]
    assert alertas.alerta_seguro("2025-11-01", "2026-10-05", [{"vigencia_fim": "2026-09-30"}])["nivel"] == "perigo"
    assert alertas.alerta_seguro("2025-03-01", "2026-10-05", [{"vigencia_fim": "2027-03-01"}]) is None


def test_alerta_de_reserva():
    a = alertas.alerta_reserva("500", "500", "2026-11", "2026-10-05")
    assert a and "11/2026" in a["texto"] and "500,00" in a["texto"]
    assert alertas.alerta_reserva("500", "0", "2026-11", "2026-10-05") is None
    assert alertas.alerta_reserva("500", "500", "2027-03", "2026-10-05") is None


def test_aniversario_29_de_fevereiro():
    ultimo, proximo = alertas.aniversarios(dt.date(2024, 2, 29), dt.date(2025, 3, 1))
    assert ultimo == dt.date(2025, 2, 28) and proximo == dt.date(2026, 2, 28)
