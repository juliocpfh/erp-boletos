"""Geração do XML da nota fiscal de serviço a partir de um modelo.

O modelo é um arquivo XML comum (``dados/modelos/nfse.xml``) onde os campos que
mudam a cada nota são escritos como ``{{nome_do_campo}}``. A lista de campos
disponíveis está em ``CAMPOS``.
"""
from __future__ import annotations

import datetime as dt
import re
from xml.sax.saxutils import escape

from .calculos import D, arred, data

NOME_MODELO = "nfse.xml"

CAMPOS = {
    "numero_fatura": "Número da fatura (0142)",
    "numero_fatura_simples": "Número da fatura sem zeros (142)",
    "emitente_razao_social": "Razão social da empresa que emite",
    "emitente_nome_curto": "Nome curto da empresa (ANK, JCK...)",
    "emitente_cnpj": "CNPJ da empresa, só números",
    "emitente_municipio": "Município da empresa / do serviço",
    "percentual_empresa": "Percentual da empresa no imóvel (50.00)",
    "valor_fatura": "Valor desta fatura = parte da empresa (1234.56)",
    "valor_fatura_br": "Valor desta fatura (1.234,56)",
    "periodo_inicio_br": "Início do período do serviço (DD/MM/AAAA)",
    "periodo_fim_br": "Fim do período do serviço (DD/MM/AAAA)",
    "numero_cobranca": "Número interno da cobrança",
    "data_emissao": "Data de emissão (AAAA-MM-DD)",
    "data_emissao_br": "Data de emissão (DD/MM/AAAA)",
    "competencia": "Competência (AAAA-MM)",
    "competencia_br": "Competência (MM/AAAA)",
    "data_pagamento": "Data do pagamento (AAAA-MM-DD)",
    "data_pagamento_br": "Data do pagamento (DD/MM/AAAA)",
    "valor_nf": "Valor da nota (1234.56)",
    "valor_nf_br": "Valor da nota (1.234,56)",
    "aluguel": "Aluguel cobrado (1234.56)",
    "desconto": "Desconto de pontualidade aplicado (1234.56)",
    "multa": "Multa (1234.56)",
    "juros": "Juros (1234.56)",
    "pontual": "S se pagou em dia, N se atrasou",
    "discriminacao": "Texto descritivo do serviço",
    "inquilino_nome": "Nome do inquilino (tomador)",
    "inquilino_cpf": "CPF/CNPJ do inquilino, só números",
    "inquilino_email": "E-mail do inquilino",
    "inquilino_telefone": "Telefone do inquilino, só números",
    "imovel_nome": "Nome do imóvel",
    "imovel_endereco": "Endereço do imóvel",
    "imovel_bairro": "Bairro",
    "imovel_cidade": "Cidade",
    "imovel_cep": "CEP, só números",
}


def _num(valor) -> str:
    return format(arred(valor), "f")


def _br(valor) -> str:
    return f"{arred(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _digitos(texto) -> str:
    return re.sub(r"\D", "", texto or "")


def valores(cobranca, contrato, imovel, fatura, emitente) -> dict:
    hoje = data(fatura["emissao"])
    pagamento = data(cobranca["data_pagamento"])
    ano, mes = cobranca["competencia"].split("-")
    pontual = not cobranca["dias_atraso"]
    desconto = D(cobranca["desconto"]) if pontual else D(0)
    texto = (f"Locação do imóvel {imovel['nome']} - {imovel['endereco']}, "
             f"referente a {mes}/{ano}. Aluguel R$ {_br(cobranca['aluguel'])}")
    if pontual and desconto:
        texto += f", desconto de pontualidade R$ {_br(desconto)}"
    if not pontual:
        texto += (f", multa R$ {_br(cobranca['multa'] or 0)}, juros R$ {_br(cobranca['juros'] or 0)}"
                  f" ({cobranca['dias_atraso']} dias de atraso)")
    texto += "."
    inicio, fim = data(fatura["periodo_inicio"]), data(fatura["periodo_fim"])
    return {
        "numero_fatura": f"{fatura['numero']:04d}",
        "numero_fatura_simples": str(fatura["numero"]),
        "emitente_razao_social": emitente["razao_social"] or "",
        "emitente_nome_curto": emitente["nome_curto"] or "",
        "emitente_cnpj": _digitos(emitente["cnpj"]),
        "emitente_municipio": emitente["municipio"] or imovel["cidade"] or "",
        "percentual_empresa": _num(fatura["percentual"]),
        "valor_fatura": _num(fatura["valor"]),
        "valor_fatura_br": _br(fatura["valor"]),
        "periodo_inicio_br": inicio.strftime("%d/%m/%Y") if inicio else "",
        "periodo_fim_br": fim.strftime("%d/%m/%Y") if fim else "",
        "numero_cobranca": str(cobranca["id"]),
        "data_emissao": hoje.isoformat(),
        "data_emissao_br": hoje.strftime("%d/%m/%Y"),
        "competencia": cobranca["competencia"],
        "competencia_br": f"{mes}/{ano}",
        "data_pagamento": pagamento.isoformat() if pagamento else "",
        "data_pagamento_br": pagamento.strftime("%d/%m/%Y") if pagamento else "",
        "valor_nf": _num(cobranca["valor_nf"] or 0),
        "valor_nf_br": _br(cobranca["valor_nf"] or 0),
        "aluguel": _num(cobranca["aluguel"]),
        "desconto": _num(desconto),
        "multa": _num(cobranca["multa"] or 0),
        "juros": _num(cobranca["juros"] or 0),
        "pontual": "S" if pontual else "N",
        "discriminacao": texto,
        "inquilino_nome": contrato["inquilino_nome"] or "",
        "inquilino_cpf": _digitos(contrato["inquilino_cpf"]),
        "inquilino_email": contrato["inquilino_email"] or "",
        "inquilino_telefone": _digitos(contrato["inquilino_telefone"]),
        "imovel_nome": imovel["nome"] or "",
        "imovel_endereco": imovel["endereco"] or "",
        "imovel_bairro": imovel["bairro"] or "",
        "imovel_cidade": imovel["cidade"] or "",
        "imovel_cep": _digitos(imovel["cep"]),
    }


def preencher(modelo: str, campos: dict) -> str:
    """Troca cada ``{{campo}}`` pelo valor (com escape de XML). Campo desconhecido é erro."""
    faltando = set()

    def troca(m):
        nome = m.group(1)
        if nome not in campos:
            faltando.add(nome)
            return m.group(0)
        return escape(str(campos[nome]))

    resultado = re.sub(r"\{\{\s*(\w+)\s*\}\}", troca, modelo)
    if faltando:
        raise ValueError("Campos desconhecidos no modelo: " + ", ".join(sorted(faltando)))
    return resultado


def exemplo() -> dict:
    """Valores fictícios, usados para validar um modelo enviado."""
    return {nome: "1" for nome in CAMPOS}
