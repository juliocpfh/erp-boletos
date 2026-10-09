"""Definição dos campos de cada cadastro e conversão dos valores digitados."""
from __future__ import annotations

import datetime as dt
import re

from .calculos import D, arred


def campo(nome, rotulo, tipo="texto", obrig=False, opcoes=None, ajuda=None, largura=None, **extra):
    return {"nome": nome, "rotulo": rotulo, "tipo": tipo, "obrig": obrig, "opcoes": opcoes or [],
            "ajuda": ajuda, "largura": largura, **extra}


def secao(titulo):
    return {"secao": titulo}


INDICES = ["IGP-M", "IPCA", "INPC", "IVAR", "IGP-DI", "Poupança", "Outro"]

IMOVEL = [
    secao("Identificação"),
    campo("nome", "Nome do imóvel", obrig=True, ajuda="Ex.: Loja 1 - Nilo Brandão"),
    campo("endereco", "Endereço", obrig=True, largura="largo"),
    campo("complemento", "Complemento"),
    campo("bairro", "Bairro"),
    campo("cidade", "Cidade (município)"),
    campo("cep", "CEP"),
    secao("Registros"),
    campo("matricula", "Matrícula"),
    campo("cartorio", "Cartório de registro"),
    campo("inscricao_iptu", "Inscrição imobiliária (IPTU)"),
    campo("copel_uc", "Unidade consumidora Copel"),
    campo("sanepar_matricula", "Matrícula Sanepar"),
    campo("condominio_nome", "Condomínio / administradora"),
    campo("condominio_contato", "Contato do condomínio"),
    secao("Último anúncio"),
    campo("anuncio_link", "Link do último anúncio", "url", largura="largo"),
    campo("anuncio_data", "Data do anúncio", "data"),
    secao("Observações"),
    campo("observacoes", "Observações", "area"),
]

CONTRATO = [
    secao("Inquilino (responsável pelo contrato)"),
    campo("inquilino_nome", "Nome completo", obrig=True, largura="largo"),
    campo("inquilino_apelido", "Apelido"),
    campo("inquilino_telefone", "Telefone", "tel"),
    campo("inquilino_whatsapp", "Este telefone é WhatsApp", "simnao"),
    campo("inquilino_email", "E-mail", "email"),
    campo("inquilino_cpf", "CPF / CNPJ"),
    campo("inquilino_rg", "RG"),
    campo("responsavel_nome", "Outro contato (se houver)"),
    campo("responsavel_telefone", "Telefone do contato", "tel"),
    campo("responsavel_email", "E-mail do contato", "email"),
    secao("Datas"),
    campo("data_entrada", "Data de entrada", "data", obrig=True),
    campo("data_saida", "Data de saída", "data", ajuda="Deixe em branco enquanto o inquilino estiver no imóvel"),
    campo("vigencia_inicio", "Início da vigência do contrato", "data", obrig=True,
          ajuda="O aniversário desta data define a correção anual"),
    campo("vigencia_fim", "Fim da vigência", "data"),
    secao("Valores e cobrança"),
    campo("aluguel_inicial", "Aluguel inicial (valor histórico)", "dinheiro", obrig=True),
    campo("dia_vencimento", "Dia do vencimento", "inteiro", obrig=True, padrao=10),
    campo("cobranca_mes_seguinte", "O aluguel do mês vence no mês seguinte", "simnao", padrao=1,
          ajuda="Marcado: aluguel de julho vence em agosto (aluguel vencido)"),
    campo("desconto_pontualidade_percentual", "Desconto de pontualidade (%)", "pct", vinculo="desconto"),
    campo("desconto_pontualidade_valor", "Desconto de pontualidade (R$)", "dinheiro", virtual=True,
          vinculo="desconto", ajuda="Preencha o % ou o valor: um calcula o outro"),
    campo("taxa_boleto", "Taxa de emissão do boleto (R$)", "dinheiro"),
    campo("multa_percentual", "Multa por atraso (%)", "pct", padrao="10"),
    campo("juros_mensal_percentual", "Juros por atraso (% ao mês)", "pct", padrao="1"),
    campo("indice_correcao", "Índice de correção", "opcao", opcoes=INDICES),
    campo("cobrar_iptu", "Cobrar IPTU do inquilino", "simnao", padrao=1),
    secao("Garantia"),
    campo("garantia_tipo", "Tipo de garantia", "opcao",
          opcoes=["Caução", "Fiador", "Seguro fiança", "Sem garantia"]),
    campo("caucao_valor", "Valor da caução", "dinheiro"),
    campo("caucao_data", "Data em que a caução foi dada", "data"),
    campo("caucao_indice", "Índice de correção da caução", "opcao", opcoes=INDICES),
    campo("caucao_valor_corrigido", "Valor corrigido da caução", "dinheiro"),
    campo("caucao_data_correcao", "Data da correção da caução", "data"),
    campo("fiador_nome", "Fiador - nome"),
    campo("fiador_cpf", "Fiador - CPF"),
    campo("fiador_rg", "Fiador - RG"),
    campo("fiador_telefone", "Fiador - telefone", "tel"),
    campo("fiador_email", "Fiador - e-mail", "email"),
    campo("fiador_endereco", "Fiador - endereço", largura="largo"),
    secao("Reserva dada na visita"),
    campo("reserva_valor", "Valor da reserva", "dinheiro"),
    campo("reserva_data", "Data da reserva", "data"),
    campo("reserva_competencia", "Usar a reserva no aluguel de", "mes",
          ajuda="Em branco: usa no primeiro aluguel"),
    secao("Observações"),
    campo("observacoes", "Observações", "area"),
]

CORRECAO = [
    campo("data_vigencia", "Vale a partir de", "data", obrig=True,
          ajuda="A cobrança de um mês usa o valor vigente no dia 1º daquele mês"),
    campo("indice", "Índice", "opcao", opcoes=INDICES),
    campo("percentual", "Percentual do índice (%)", "pct",
          ajuda="Informe o percentual ou o novo valor"),
    campo("valor_novo", "Novo valor do aluguel", "dinheiro"),
    campo("observacoes", "Observações", "area"),
]

SEGURO = [
    campo("seguradora", "Seguradora"),
    campo("apolice", "Nº da apólice"),
    campo("data_contratacao", "Data de contratação", "data"),
    campo("vigencia_inicio", "Início da vigência", "data", obrig=True),
    campo("vigencia_fim", "Fim da vigência", "data", obrig=True),
    campo("valor_total", "Valor total", "dinheiro", obrig=True),
    campo("num_parcelas", "Número de parcelas", "inteiro", obrig=True, padrao=1),
    campo("primeira_competencia", "Cobrar 1ª parcela no aluguel de", "mes", obrig=True),
    campo("observacoes", "Observações", "area"),
]

IPTU = [
    campo("ano", "Ano", "inteiro", obrig=True),
    campo("valor_total", "Valor total do IPTU", "dinheiro", obrig=True),
    campo("num_parcelas", "Número de parcelas", "inteiro", obrig=True, padrao=10),
    campo("primeira_competencia", "Cobrar 1ª parcela no aluguel de", "mes", obrig=True),
    campo("observacoes", "Observações", "area"),
]

TITULARIDADE = [
    campo("concessionaria", "Concessionária", "opcao", obrig=True,
          opcoes=["Copel", "Sanepar", "Supergasbras", "Condomínio", "Outra"]),
    campo("contrato_id", "Inquilino", "opcao", ajuda="Deixe em branco se a conta voltou para o proprietário"),
    campo("tipo", "Tipo", "opcao", opcoes=["Para o inquilino", "Volta para o proprietário"]),
    campo("protocolo", "Nº do protocolo"),
    campo("data", "Data", "data"),
    campo("situacao", "Situação", "opcao", opcoes=["Solicitado", "Concluído", "Pendente"]),
    campo("observacoes", "Observações", "area"),
]

EMITENTE = [
    campo("nome_curto", "Nome no topo da fatura", obrig=True, ajuda="Ex.: ANK ADMINISTRADORA"),
    campo("razao_social", "Razão social", obrig=True, largura="largo"),
    campo("cnpj", "CNPJ"),
    campo("endereco", "Endereço", largura="largo"),
    campo("municipio", "Município (para a fatura)", padrao="CURITIBA"),
    campo("ativo", "Ativa", "simnao", padrao=1),
]

PAPEIS = {"admin": "Administrador", "operador": "Operador (edita)", "consulta": "Consulta (só vê)"}

USUARIO = [
    campo("login", "Login", obrig=True),
    campo("nome", "Nome", obrig=True),
    campo("papel", "Perfil", "opcao", obrig=True, opcoes=list(PAPEIS.items())),
    campo("ativo", "Ativo", "simnao", padrao=1),
]


# --------------------------------------------------------------------------- #
def numero_br(valor, casas=2) -> str:
    if valor in (None, ""):
        return ""
    texto = f"{D(valor):,.{casas}f}"
    return texto.replace(",", "X").replace(".", ",").replace("X", ".")


def pct_br(valor) -> str:
    if valor in (None, ""):
        return ""
    texto = numero_br(valor, 4).rstrip("0").rstrip(",")
    return texto or "0"


def para_formulario(campos, registro=None) -> dict:
    """Valores de um registro do banco no formato que aparece nos campos da tela."""
    valores = {}
    for c in campos:
        if "nome" not in c:
            continue
        nome = c["nome"]
        if registro is None or nome not in registro.keys():
            v = c.get("padrao") if registro is None else None
        else:
            v = registro[nome]
        if v is None:
            v = ""
        if c["tipo"] == "dinheiro" and v != "":
            v = numero_br(v)
        elif c["tipo"] == "pct" and v != "":
            v = pct_br(v)
        valores[nome] = v
    return valores


def ler(campos, form) -> tuple[dict, dict]:
    """Converte o formulário enviado. Devolve (dados para gravar, erros por campo)."""
    dados, erros = {}, {}
    for c in campos:
        if "nome" not in c:
            continue
        nome, tipo = c["nome"], c["tipo"]
        bruto = (form.get(nome) or "").strip()
        if tipo == "simnao":
            dados[nome] = 1 if form.get(nome) in ("1", "on", "sim") else 0
            continue
        if not bruto:
            if c["obrig"]:
                erros[nome] = "Campo obrigatório"
            dados[nome] = None
            continue
        try:
            if tipo == "dinheiro":
                dados[nome] = arred(bruto)
            elif tipo == "pct":
                dados[nome] = D(bruto)
            elif tipo == "inteiro":
                dados[nome] = int(D(bruto))
            elif tipo == "data":
                dados[nome] = dt.date.fromisoformat(bruto).isoformat()
            elif tipo == "mes":
                if not re.fullmatch(r"\d{4}-\d{2}", bruto):
                    raise ValueError
                dados[nome] = bruto
            elif tipo == "url":
                if not bruto.lower().startswith(("http://", "https://")):
                    bruto = "https://" + bruto
                if " " in bruto or "." not in bruto:
                    raise ValueError
                dados[nome] = bruto
            elif tipo == "opcao" and nome.endswith("_id"):
                dados[nome] = int(bruto)
            else:
                dados[nome] = bruto
        except (ValueError, ArithmeticError):
            erros[nome] = "Valor inválido"
    for c in campos:
        if c.get("virtual"):
            dados.pop(c["nome"], None)
    return dados, erros
