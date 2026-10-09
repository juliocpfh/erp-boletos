"""Fluxo completo pelo navegador simulado: cadastro, cobrança, pagamento, fatura, exportação."""
import io
import re
import zipfile
from decimal import Decimal as Dec

import pytest

from app import create_app


@pytest.fixture
def app(tmp_path):
    app = create_app(tmp_path / "dados", testing=True)
    app.config["SEM_CSRF"] = True
    return app


@pytest.fixture
def cli(app):
    c = app.test_client()
    c.post("/primeiro-acesso", data={"nome": "Julio", "login": "julio", "senha": "segredo1", "senha2": "segredo1"})
    return c


def banco(app):
    from app import db
    return db.conectar(app.config["BANCO"])


def cadastrar_base(cli):
    cli.post("/empresas/nova", data={"nome_curto": "ANK ADMINISTRADORA", "razao_social": "ANK ADMINISTRADORA DE BENS LTDA",
                                     "cnpj": "58.492.818/0001-59", "municipio": "CURITIBA", "ativo": "1"})
    cli.post("/empresas/nova", data={"nome_curto": "JCK ADMINISTRADORA", "razao_social": "JCK ADMINISTRADORA DE BENS LTDA",
                                     "cnpj": "58.522.768/0001-05", "municipio": "CURITIBA", "ativo": "1"})
    r = cli.post("/imoveis/novo", data={"nome": "Loja 1", "endereco": "Rua Prof. Nilo Brandão, 117",
                                        "complemento": "Loja 1", "cidade": "Curitiba",
                                        "anuncio_link": "www.exemplo.com.br/anuncio"})
    iid = int(re.search(r"/imoveis/(\d+)", r.headers["Location"]).group(1))
    cli.post(f"/imoveis/{iid}/empresas", data={"emitente_id": "1", "percentual": "50"})
    cli.post(f"/imoveis/{iid}/empresas", data={"emitente_id": "2", "percentual": "50"})
    r = cli.post(f"/imoveis/{iid}/contratos/novo", data={
        "inquilino_nome": "Carmem Beatriz Herrera", "inquilino_apelido": "Carmem",
        "inquilino_telefone": "41 99623-7614", "inquilino_whatsapp": "1", "inquilino_cpf": "801.830.109-30",
        "data_entrada": "2026-06-07", "vigencia_inicio": "2026-06-07", "aluguel_inicial": "1.350,00",
        "dia_vencimento": "10", "cobranca_mes_seguinte": "1", "desconto_pontualidade_valor": "135,00",
        "taxa_boleto": "3,50", "multa_percentual": "10", "juros_mensal_percentual": "1", "cobrar_iptu": "1",
        "garantia_tipo": "Caução", "caucao_valor": "2.700,00", "reserva_valor": "500,00"})
    cid = int(re.search(r"/contratos/(\d+)", r.headers["Location"]).group(1))
    cli.post(f"/imoveis/{iid}/iptu/novo", data={"ano": "2026", "valor_total": "1.000,00", "num_parcelas": "10",
                                                "primeira_competencia": "2026-02"})
    cli.post(f"/contratos/{cid}/seguro/novo", data={"seguradora": "Porto", "vigencia_inicio": "2026-06-07",
                                                    "vigencia_fim": "2027-06-06", "valor_total": "360,00",
                                                    "num_parcelas": "12", "primeira_competencia": "2026-06"})
    return iid, cid


def test_login_obrigatorio_e_primeiro_acesso(app):
    c = app.test_client()
    assert c.get("/").status_code == 302
    assert "/primeiro-acesso" in c.get("/login").headers["Location"]


def test_fluxo_completo(app, cli, tmp_path):
    iid, cid = cadastrar_base(cli)
    con = banco(app)
    contrato = con.execute("SELECT * FROM contratos WHERE id = ?", (cid,)).fetchone()
    assert Dec(contrato["desconto_pontualidade_percentual"]) == Dec("10")  # calculado a partir do valor
    assert contrato["pasta"] == "Carmem Beatriz Herrera (07-06-2026 a -)"
    assert (app.config["PASTA_ARQUIVOS"] / "Loja 1" / contrato["pasta"]).is_dir()
    assert con.execute("SELECT anuncio_link FROM imoveis").fetchone()[0] == "https://www.exemplo.com.br/anuncio"

    # Junho: mês de entrada, proporcional 24/30, usa a reserva
    cli.post("/cobrancas/gerar", data={"competencia": "2026-06"})
    cb = con.execute("SELECT * FROM cobrancas WHERE competencia = '2026-06'").fetchone()
    assert cb["dias_cobrados"] == 24 and Dec(cb["aluguel"]) == Dec("1080.00")
    assert Dec(cb["desconto"]) == Dec("108.00")
    assert Dec(cb["iptu"]) == Dec("100.00") and Dec(cb["seguro"]) == Dec("30.00")
    assert Dec(cb["reserva_utilizada"]) == Dec("500.00")
    assert cb["vencimento"] == "2026-07-10"
    assert "Carmem" in cli.get(f"/cobrancas/{cb['id']}").get_data(as_text=True)

    # Pagou em dia: NF = aluguel - desconto, faturas 50/50
    cli.post(f"/cobrancas/{cb['id']}/pagamento", data={"data_pagamento": "2026-07-10"})
    cb = con.execute("SELECT * FROM cobrancas WHERE id = ?", (cb["id"],)).fetchone()
    assert cb["situacao"] == "Paga em dia" and Dec(cb["valor_nf"]) == Dec("972.00")
    cli.post("/empresas", data={"proxima_fatura": "143"})
    cli.post(f"/cobrancas/{cb['id']}/faturas", data={"emissao": "2026-08-03"})
    faturas = con.execute("SELECT * FROM faturas ORDER BY id").fetchall()
    assert [f["numero"] for f in faturas] == [143, 143]
    assert [Dec(f["valor"]) for f in faturas] == [Dec("486.00"), Dec("486.00")]
    assert faturas[0]["periodo_inicio"] == "2026-06-07"
    pagina = cli.get(f"/cobrancas/{cb['id']}/faturas/imprimir").get_data(as_text=True)
    assert "FATURA DE LOCAÇÃO" in pagina and "Nº 0143" in pagina and "CARMEM BEATRIZ HERRERA" in pagina

    # Julho: mês cheio, pagou com 10 dias de atraso
    cli.post("/cobrancas/gerar", data={"competencia": "2026-07"})
    jul = con.execute("SELECT * FROM cobrancas WHERE competencia = '2026-07'").fetchone()
    assert Dec(jul["aluguel"]) == Dec("1350.00") and Dec(jul["reserva_utilizada"]) == 0
    cli.post(f"/cobrancas/{jul['id']}/pagamento", data={"data_pagamento": "2026-08-20"})
    jul = con.execute("SELECT * FROM cobrancas WHERE id = ?", (jul["id"],)).fetchone()
    # aberto sem desconto: 1350 + 100 + 30 + 3,50 = 1483,50; multa 148,35; juros 4,95 (10 dias)
    assert jul["dias_atraso"] == 10 and Dec(jul["multa"]) == Dec("148.35") and Dec(jul["juros"]) == Dec("4.95")
    assert Dec(jul["valor_nf"]) == Dec("1350") + Dec("148.35") + Dec("4.95")

    # Modelo XML da nota
    modelo = b"<Nota><Numero>{{numero_fatura}}</Numero><Cnpj>{{emitente_cnpj}}</Cnpj><Tomador>{{inquilino_nome}}</Tomador><Valor>{{valor_fatura}}</Valor></Nota>"
    cli.post("/dados/modelo-xml", data={"modelo": (io.BytesIO(modelo), "nfse.xml")}, content_type="multipart/form-data")
    xml = cli.get(f"/faturas/{faturas[0]['id']}/xml").get_data(as_text=True)
    assert xml == "<Nota><Numero>0143</Numero><Cnpj>58492818000159</Cnpj><Tomador>Carmem Beatriz Herrera</Tomador><Valor>486.00</Valor></Nota>"

    # Anexo de arquivo na pasta do inquilino
    cli.post(f"/arquivos/contrato/{cid}", data={"arquivos": (io.BytesIO(b"pdf"), "Contrato.pdf")},
             content_type="multipart/form-data")
    assert (app.config["PASTA_ARQUIVOS"] / "Loja 1" / contrato["pasta"] / "Contrato.pdf").exists()

    # Saída do inquilino renomeia a pasta
    dados = dict(contrato)
    dados.update(data_saida="2026-12-15", aluguel_inicial="1350", desconto_pontualidade_percentual="10",
                 inquilino_whatsapp="1", cobranca_mes_seguinte="1", cobrar_iptu="1")
    dados = {k: ("" if v is None else str(v)) for k, v in dados.items()}
    cli.post(f"/contratos/{cid}/editar", data=dados)
    pasta = con.execute("SELECT pasta FROM contratos WHERE id = ?", (cid,)).fetchone()[0]
    assert pasta == "Carmem Beatriz Herrera (07-06-2026 a 15-12-2026)"
    assert (app.config["PASTA_ARQUIVOS"] / "Loja 1" / pasta / "Contrato.pdf").exists()

    # Histórico com quem e o quê
    hist = con.execute("SELECT * FROM auditoria WHERE tabela = 'contratos' AND acao = 'Alteração'").fetchall()
    assert hist and hist[-1]["usuario"] == "julio" and "data_saida" in hist[-1]["detalhes"]
    assert con.execute("SELECT valor FROM meta WHERE chave = 'ultima_atualizacao_por'").fetchone()[0] == "julio"

    # Todas as telas abrem
    for url in ["/", "/imoveis", f"/imoveis/{iid}", f"/contratos/{cid}", "/cobrancas?competencia=2026-07",
                "/historico", "/dados", "/empresas", "/usuarios", "/cobrancas/imprimir?competencia=2026-06",
                "/faturas/imprimir?competencia=2026-06", f"/contratos/{cid}/correcao/nova", f"/contratos/{cid}/editar"]:
        assert cli.get(url).status_code == 200, url

    # Exportar e importar em outra pasta (outro computador)
    zip_bytes = cli.get("/dados/exportar").data
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        nomes = zf.namelist()
    assert "banco.db" in nomes and any(n.endswith("Contrato.pdf") for n in nomes)

    outro = create_app(tmp_path / "outro", testing=True)
    outro.config["SEM_CSRF"] = True
    c2 = outro.test_client()
    c2.post("/primeiro-acesso", data={"nome": "Outro", "login": "outro", "senha": "segredo2", "senha2": "segredo2"})
    r = c2.post("/dados/importar", data={"zip": (io.BytesIO(zip_bytes), "dados.zip"), "confirmo": "sim"},
                content_type="multipart/form-data")
    assert r.status_code == 302
    con2 = banco(outro)
    assert con2.execute("SELECT count(*) FROM cobrancas").fetchone()[0] == 2
    assert (outro.config["PASTA_ARQUIVOS"] / "Loja 1" / pasta / "Contrato.pdf").exists()
    assert list((outro.config["PASTA_DADOS"] / "backups").glob("antes-da-importacao-*.zip"))
    c2 = outro.test_client()
    r = c2.post("/login", data={"login": "julio", "senha": "segredo1"})
    assert r.status_code == 302 and "/login" not in r.headers["Location"]


def test_alerta_de_correcao_aparece_no_painel(app, cli):
    import datetime as dt
    iid, cid = cadastrar_base(cli)
    con = banco(app)
    hoje = dt.date.today()
    inicio = (hoje.replace(year=hoje.year - 1) + dt.timedelta(days=20)).isoformat()
    con.execute("UPDATE contratos SET vigencia_inicio = ? WHERE id = ?", (inicio, cid))
    con.commit()
    pagina = cli.get("/").get_data(as_text=True)
    assert "Correção do aluguel" in pagina


def test_perfil_consulta_nao_altera(app, cli):
    cli.post("/usuarios/novo", data={"login": "maria", "nome": "Maria", "papel": "consulta", "ativo": "1",
                                     "senha": "segredo3"})
    c = app.test_client()
    c.post("/login", data={"login": "maria", "senha": "segredo3"})
    assert c.get("/imoveis").status_code == 200
    assert c.post("/imoveis/novo", data={"nome": "X", "endereco": "Y"}).status_code == 403
    assert c.get("/usuarios").status_code == 403


def test_csrf_bloqueia_formulario_sem_token(tmp_path):
    app = create_app(tmp_path / "d", testing=True)
    c = app.test_client()
    assert c.post("/primeiro-acesso", data={"nome": "a", "login": "a", "senha": "123456", "senha2": "123456"}).status_code == 400


def test_importacao_rejeita_zip_invalido(app, cli):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("../fora.txt", "x")
        zf.writestr("banco.db", "x")
    r = cli.post("/dados/importar", data={"zip": (io.BytesIO(buf.getvalue()), "x.zip"), "confirmo": "sim"},
                 content_type="multipart/form-data")
    assert r.status_code == 302
    assert not (app.config["PASTA_DADOS"].parent / "fora.txt").exists()
    assert cli.get("/").status_code == 200  # dados atuais continuam funcionando
