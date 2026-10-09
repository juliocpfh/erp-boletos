"""Regras de negócio que consultam o banco: aluguel atual, geração de cobranças e alertas."""
from __future__ import annotations

import datetime as dt

from . import alertas, calculos, db
from .calculos import D, ZERO, arred, competencia_de, limites_competencia


def correcoes(con, contrato_id):
    return con.execute("SELECT * FROM correcoes_aluguel WHERE contrato_id = ? ORDER BY data_vigencia",
                       (contrato_id,)).fetchall()


def aluguel_atual(con, contrato, referencia=None) -> D:
    referencia = referencia or dt.date.today()
    return calculos.aluguel_vigente(contrato["aluguel_inicial"], correcoes(con, contrato["id"]), referencia)


def contrato_ativo(contrato, referencia) -> bool:
    saida = calculos.data(contrato["data_saida"])
    return saida is None or saida >= calculos.data(referencia)


def competencia_reserva(contrato) -> str | None:
    if D(contrato["reserva_valor"]) <= 0:
        return None
    return contrato["reserva_competencia"] or competencia_de(calculos.data(contrato["data_entrada"]))


def saldo_reserva(con, contrato, ignorar_cobranca=None) -> D:
    usado = ZERO
    for linha in con.execute("SELECT id, reserva_utilizada FROM cobrancas WHERE contrato_id = ?",
                             (contrato["id"],)):
        if linha["id"] != ignorar_cobranca:
            usado += D(linha["reserva_utilizada"])
    return max(arred(D(contrato["reserva_valor"]) - usado), ZERO)


def parcela_iptu(con, imovel_id, comp):
    total, rotulos = ZERO, []
    for i in con.execute("SELECT * FROM iptus WHERE imovel_id = ?", (imovel_id,)):
        n, valor = calculos.parcela_na_competencia(i["valor_total"], i["num_parcelas"],
                                                   i["primeira_competencia"], comp)
        if n:
            total += valor
            rotulos.append(f"IPTU {i['ano']} parc. {n}/{i['num_parcelas']}")
    return total, "; ".join(rotulos)


def parcela_seguro(con, contrato_id, comp):
    total, rotulos = ZERO, []
    for s in con.execute("SELECT * FROM seguros WHERE contrato_id = ?", (contrato_id,)):
        n, valor = calculos.parcela_na_competencia(s["valor_total"], s["num_parcelas"],
                                                   s["primeira_competencia"], comp)
        if n:
            total += valor
            rotulos.append(f"Seguro {s['seguradora'] or ''} parc. {n}/{s['num_parcelas']}".replace("  ", " "))
    return total, "; ".join(rotulos)


def montar_cobranca(con, contrato, comp) -> dict | None:
    """Calcula (sem gravar) a cobrança de um contrato numa competência."""
    inicio_mes, _ = limites_competencia(comp)
    dias = calculos.dias_ocupados(comp, contrato["data_entrada"], contrato["data_saida"])
    if dias == 0:
        return None
    iptu, iptu_rot = (parcela_iptu(con, contrato["imovel_id"], comp)
                      if contrato["cobrar_iptu"] else (ZERO, ""))
    seguro, seguro_rot = parcela_seguro(con, contrato["id"], comp)
    reserva = ZERO
    alvo = competencia_reserva(contrato)
    if alvo and comp >= alvo:
        reserva = saldo_reserva(con, contrato)
    res = calculos.calcular_cobranca(
        competencia=comp,
        aluguel_mensal=aluguel_atual(con, contrato, inicio_mes),
        entrada=contrato["data_entrada"], saida=contrato["data_saida"],
        desconto_percentual=contrato["desconto_pontualidade_percentual"],
        iptu=iptu, seguro=seguro, taxa_boleto=contrato["taxa_boleto"],
        reserva_disponivel=reserva)
    venc = calculos.vencimento_da_competencia(comp, contrato["dia_vencimento"] or 10,
                                              bool(contrato["cobranca_mes_seguinte"]))
    return {
        "contrato_id": contrato["id"], "competencia": comp, "vencimento": venc.isoformat(),
        "dias_cobrados": res["dias_cobrados"], "dias_mes": res["dias_mes"],
        "aluguel_mensal": res["aluguel_mensal"], "aluguel": res["aluguel"], "desconto": res["desconto"],
        "iptu": res["iptu"], "iptu_parcela": iptu_rot, "seguro": res["seguro"], "seguro_parcela": seguro_rot,
        "taxa_boleto": res["taxa_boleto"], "outros": ZERO, "reserva_utilizada": res["reserva_utilizada"],
        "multa_percentual": D(contrato["multa_percentual"]),
        "juros_mensal_percentual": D(contrato["juros_mensal_percentual"]),
        "situacao": "Em aberto",
    }


def gerar_cobrancas(con, comp, usuario) -> tuple[int, int]:
    """Gera as cobranças do mês para todos os contratos com ocupação na competência."""
    geradas = existentes = 0
    for contrato in con.execute("SELECT * FROM contratos ORDER BY id").fetchall():
        if con.execute("SELECT 1 FROM cobrancas WHERE contrato_id = ? AND competencia = ?",
                       (contrato["id"], comp)).fetchone():
            existentes += 1
            continue
        dados = montar_cobranca(con, contrato, comp)
        if dados:
            db.inserir(con, "cobrancas", dados, usuario,
                       f"Cobrança {comp[5:]}/{comp[:4]} gerada para {contrato['inquilino_nome']}")
            geradas += 1
    return geradas, existentes


def totais(cobranca) -> dict:
    return calculos.totais_cobranca(cobranca["aluguel"], cobranca["desconto"], cobranca["iptu"],
                                    cobranca["seguro"], cobranca["taxa_boleto"], cobranca["outros"],
                                    cobranca["reserva_utilizada"])


def registrar_pagamento(con, cobranca, data_pagamento, valor_pago, usuario) -> dict:
    res = calculos.liquidar(dict(cobranca), data_pagamento)
    dados = {
        "data_pagamento": calculos.data(data_pagamento).isoformat(),
        "valor_pago": arred(valor_pago) if valor_pago not in (None, "") else res["valor_devido"],
        "dias_atraso": res["dias_atraso"], "multa": res["multa"], "juros": res["juros"],
        "valor_nf": res["valor_nf"],
        "situacao": "Paga em dia" if res["pontual"] else "Paga com atraso",
    }
    db.atualizar(con, "cobrancas", cobranca["id"], dados, usuario, "Pagamento confirmado")
    return res


def estornar_pagamento(con, cobranca, usuario) -> None:
    cancelar_faturas(con, cobranca["id"], usuario)
    db.atualizar(con, "cobrancas", cobranca["id"],
                 {"data_pagamento": None, "valor_pago": None, "dias_atraso": None, "multa": None,
                  "juros": None, "valor_nf": None, "situacao": "Em aberto"},
                 usuario, "Pagamento desfeito")


def alertas_contrato(con, contrato, hoje) -> list[dict]:
    lista = []
    datas = [c["data_vigencia"] for c in correcoes(con, contrato["id"])]
    seguros = [dict(s) for s in con.execute("SELECT * FROM seguros WHERE contrato_id = ?", (contrato["id"],))]
    for a in (alertas.alerta_correcao(contrato["vigencia_inicio"], hoje, datas),
              alertas.alerta_seguro(contrato["vigencia_inicio"], hoje, seguros),
              alertas.alerta_reserva(contrato["reserva_valor"], saldo_reserva(con, contrato),
                                     competencia_reserva(contrato), hoje),
              alertas.alerta_vigencia(contrato["vigencia_fim"], hoje)):
        if a:
            lista.append(a)
    return lista


def todos_alertas(con, hoje=None) -> list[dict]:
    hoje = hoje or dt.date.today()
    resultado = []
    sql = ("SELECT c.*, i.nome AS imovel_nome FROM contratos c JOIN imoveis i ON i.id = c.imovel_id "
           "ORDER BY i.nome, c.inquilino_nome")
    for contrato in con.execute(sql).fetchall():
        if not contrato_ativo(contrato, hoje):
            continue
        for a in alertas_contrato(con, contrato, hoje):
            a.update(contrato_id=contrato["id"], imovel=contrato["imovel_nome"],
                     inquilino=contrato["inquilino_nome"])
            resultado.append(a)
    ordem = {"perigo": 0, "aviso": 1, "info": 2}
    return sorted(resultado, key=lambda a: ordem[a["nivel"]])


def participacoes(con, imovel_id):
    return con.execute(
        "SELECT ie.*, e.nome_curto, e.razao_social FROM imovel_emitentes ie "
        "JOIN emitentes e ON e.id = ie.emitente_id WHERE ie.imovel_id = ? ORDER BY ie.id",
        (imovel_id,)).fetchall()


def faturas_da_cobranca(con, cobranca_id, so_validas=True):
    sql = ("SELECT f.*, e.nome_curto, e.razao_social, e.cnpj, e.endereco AS emitente_endereco, "
           "e.municipio FROM faturas f JOIN emitentes e ON e.id = f.emitente_id WHERE f.cobranca_id = ?")
    if so_validas:
        sql += " AND f.situacao = 'Emitida'"
    return con.execute(sql + " ORDER BY f.id", (cobranca_id,)).fetchall()


def emitir_faturas(con, cobranca, emissao, usuario) -> int:
    """Emite uma fatura de locação por empresa, dividindo o valor da nota. Devolve o número."""
    if not cobranca["data_pagamento"]:
        raise ValueError("Confirme o pagamento antes de emitir as faturas.")
    if faturas_da_cobranca(con, cobranca["id"]):
        raise ValueError("As faturas desta cobrança já foram emitidas.")
    contrato = con.execute("SELECT * FROM contratos WHERE id = ?", (cobranca["contrato_id"],)).fetchone()
    partes = participacoes(con, contrato["imovel_id"])
    if not partes:
        raise ValueError("Cadastre no imóvel quais empresas emitem a fatura e o percentual de cada uma.")
    soma = sum(D(p["percentual"]) for p in partes)
    if soma != 100:
        raise ValueError(f"Os percentuais das empresas no imóvel somam {soma}%, e precisam somar 100%.")
    numero = int(db.ler_meta(con, "proxima_fatura", "1"))
    inicio, fim = calculos.periodo_servico(cobranca["competencia"], contrato["data_entrada"],
                                           contrato["data_saida"])
    valores = calculos.dividir(cobranca["valor_nf"], [p["percentual"] for p in partes])
    for parte, valor in zip(partes, valores):
        db.inserir(con, "faturas", {
            "cobranca_id": cobranca["id"], "emitente_id": parte["emitente_id"], "numero": numero,
            "emissao": calculos.data(emissao).isoformat(), "periodo_inicio": inicio.isoformat(),
            "periodo_fim": fim.isoformat(), "percentual": D(parte["percentual"]), "valor": valor,
        }, usuario, f"Fatura nº {numero:04d} emitida por {parte['nome_curto']}")
    db.gravar_meta(con, "proxima_fatura", str(numero + 1))
    con.commit()
    return numero


def cancelar_faturas(con, cobranca_id, usuario) -> None:
    for f in faturas_da_cobranca(con, cobranca_id):
        db.atualizar(con, "faturas", f["id"], {"situacao": "Cancelada"}, usuario,
                     f"Fatura nº {f['numero']:04d} cancelada")
