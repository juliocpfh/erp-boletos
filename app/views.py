"""Telas do sistema."""
from __future__ import annotations

import datetime as dt
import json
import os
import platform
import subprocess
import tempfile
from pathlib import Path

from flask import (Blueprint, Response, abort, after_this_request, current_app, flash, g, redirect,
                   render_template, request, send_file, url_for)

from . import arquivos, backup, calculos, db, forms, notafiscal, servicos
from .auth import escrita, exige, nome_usuario, pode
from .calculos import D, competencia_de, somar_meses

bp = Blueprint("views", __name__)


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def obter(tabela, registro_id):
    linha = g.db.execute(f"SELECT * FROM {tabela} WHERE id = ?", (registro_id,)).fetchone()
    if linha is None:
        abort(404)
    return linha


def hoje() -> dt.date:
    return dt.date.today()


def historico(where="1=1", params=(), limite=50):
    linhas = g.db.execute(f"SELECT * FROM auditoria WHERE {where} ORDER BY id DESC LIMIT ?",
                          (*params, limite)).fetchall()
    resultado = []
    for h in linhas:
        item = dict(h)
        item["tabela_nome"] = db.NOMES_TABELAS.get(h["tabela"], h["tabela"] or "")
        item["detalhes"] = json.loads(h["detalhes"]) if h["detalhes"] else {}
        resultado.append(item)
    return resultado


def sincronizar_pasta_imovel(imovel) -> Path:
    caminho = arquivos.pasta_imovel(current_app.config["PASTA_ARQUIVOS"], imovel)
    if imovel["pasta"] != caminho.name:
        g.db.execute("UPDATE imoveis SET pasta = ? WHERE id = ?", (caminho.name, imovel["id"]))
        g.db.commit()
    return caminho


def sincronizar_pasta_contrato(contrato) -> Path:
    imovel = obter("imoveis", contrato["imovel_id"])
    sincronizar_pasta_imovel(imovel)
    imovel = obter("imoveis", contrato["imovel_id"])
    caminho = arquivos.pasta_contrato(current_app.config["PASTA_ARQUIVOS"], imovel, contrato)
    if contrato["pasta"] != caminho.name:
        g.db.execute("UPDATE contratos SET pasta = ? WHERE id = ?", (caminho.name, contrato["id"]))
        g.db.commit()
    return caminho


def form_generico(tabela, campos, titulo, voltar, registro=None, fixos=None, descricao=None,
                  ajustar=None):
    """Tela de cadastro/edição simples usada por seguros, IPTU, titularidade etc."""
    valores, erros = forms.para_formulario(campos, registro), {}
    if request.method == "POST":
        if not pode("operador"):
            abort(403)
        dados, erros = forms.ler(campos, request.form)
        valores = request.form
        if ajustar and not erros:
            ajustar(dados, erros)
        if not erros:
            dados.update(fixos or {})
            if registro:
                db.atualizar(g.db, tabela, registro["id"], dados, nome_usuario(), descricao)
            else:
                db.inserir(g.db, tabela, dados, nome_usuario(), descricao)
            flash("Salvo.", "ok")
            return redirect(voltar)
        flash("Confira os campos destacados.", "erro")
    return render_template("form.html", campos=campos, valores=valores, erros=erros, titulo=titulo,
                           voltar=voltar, registro=registro)


def excluir_registro(tabela, registro, voltar, descricao=None):
    if request.method != "POST" or not pode("operador"):
        abort(403)
    db.excluir(g.db, tabela, registro["id"], nome_usuario(), descricao)
    flash("Excluído.", "ok")
    return redirect(voltar)


# --------------------------------------------------------------------------- #
# Painel
# --------------------------------------------------------------------------- #
@bp.route("/")
def painel():
    comp = somar_meses(competencia_de(hoje()), -1)
    resumo = {
        "imoveis": g.db.execute("SELECT count(*) FROM imoveis").fetchone()[0],
        "contratos": sum(1 for c in g.db.execute("SELECT * FROM contratos").fetchall()
                         if servicos.contrato_ativo(c, hoje())),
        "abertas": g.db.execute("SELECT count(*) FROM cobrancas WHERE situacao = 'Em aberto'").fetchone()[0],
        "vencidas": g.db.execute("SELECT count(*) FROM cobrancas WHERE situacao = 'Em aberto' AND vencimento < ?",
                                 (hoje().isoformat(),)).fetchone()[0],
    }
    return render_template("painel.html", alertas=servicos.todos_alertas(g.db, hoje()), resumo=resumo,
                           comp=comp, criado_em=db.ler_meta(g.db, "criado_em"),
                           historico=historico(limite=10))


# --------------------------------------------------------------------------- #
# Imóveis
# --------------------------------------------------------------------------- #
@bp.route("/imoveis")
def imoveis():
    lista = []
    for i in g.db.execute("SELECT * FROM imoveis ORDER BY nome").fetchall():
        contratos = g.db.execute("SELECT * FROM contratos WHERE imovel_id = ? ORDER BY data_entrada DESC",
                                 (i["id"],)).fetchall()
        atual = next((c for c in contratos if servicos.contrato_ativo(c, hoje())), None)
        lista.append({"imovel": i, "atual": atual,
                      "aluguel": servicos.aluguel_atual(g.db, atual) if atual else None})
    return render_template("imoveis.html", lista=lista)


@bp.route("/imoveis/novo", methods=["GET", "POST"])
@bp.route("/imoveis/<int:iid>/editar", methods=["GET", "POST"])
@escrita
def imovel_form(iid=None):
    registro = obter("imoveis", iid) if iid else None
    valores, erros = forms.para_formulario(forms.IMOVEL, registro), {}
    if request.method == "POST":
        dados, erros = forms.ler(forms.IMOVEL, request.form)
        valores = request.form
        if not erros:
            if registro:
                db.atualizar(g.db, "imoveis", iid, dados, nome_usuario(), dados["nome"])
            else:
                iid = db.inserir(g.db, "imoveis", dados, nome_usuario(), dados["nome"])
            sincronizar_pasta_imovel(obter("imoveis", iid))
            flash("Imóvel salvo.", "ok")
            return redirect(url_for("views.imovel", iid=iid))
        flash("Confira os campos destacados.", "erro")
    return render_template("form.html", campos=forms.IMOVEL, valores=valores, erros=erros,
                           titulo="Editar imóvel" if registro else "Novo imóvel",
                           voltar=url_for("views.imovel", iid=iid) if iid else url_for("views.imoveis"),
                           registro=registro)


@bp.route("/imoveis/<int:iid>")
def imovel(iid):
    i = obter("imoveis", iid)
    pasta = sincronizar_pasta_imovel(i)
    i = obter("imoveis", iid)
    contratos = []
    for c in g.db.execute("SELECT * FROM contratos WHERE imovel_id = ? ORDER BY data_entrada DESC",
                          (iid,)).fetchall():
        contratos.append({"c": c, "ativo": servicos.contrato_ativo(c, hoje()),
                          "aluguel": servicos.aluguel_atual(g.db, c),
                          "pasta": arquivos.nome_pasta_contrato(c)})
    iptus = []
    for p in g.db.execute("SELECT * FROM iptus WHERE imovel_id = ? ORDER BY ano DESC", (iid,)).fetchall():
        valores = calculos.parcelas(p["valor_total"], p["num_parcelas"])
        lista = [(n + 1, somar_meses(p["primeira_competencia"], n), v) for n, v in enumerate(valores)]
        iptus.append({"p": p, "parcelas": lista})
    titularidades = g.db.execute(
        "SELECT t.*, c.inquilino_nome FROM titularidades t LEFT JOIN contratos c ON c.id = t.contrato_id "
        "WHERE t.imovel_id = ? ORDER BY t.data DESC, t.id DESC", (iid,)).fetchall()
    return render_template(
        "imovel.html", i=i, contratos=contratos, iptus=iptus, titularidades=titularidades,
        participacoes=servicos.participacoes(g.db, iid),
        emitentes=g.db.execute("SELECT * FROM emitentes WHERE ativo = 1 ORDER BY nome_curto").fetchall(),
        docs=arquivos.listar(pasta / arquivos.PASTA_DOCS_IMOVEL),
        fotos=arquivos.listar(pasta / arquivos.PASTA_ANUNCIO),
        pasta=pasta, historico=historico("imovel_id = ?", (iid,)))


@bp.route("/imoveis/<int:iid>/excluir", methods=["POST"])
@exige("admin")
def imovel_excluir(iid):
    i = obter("imoveis", iid)
    if g.db.execute("SELECT 1 FROM contratos WHERE imovel_id = ?", (iid,)).fetchone():
        flash("Este imóvel tem inquilinos cadastrados. Exclua os contratos antes.", "erro")
        return redirect(url_for("views.imovel", iid=iid))
    g.db.execute("DELETE FROM imovel_emitentes WHERE imovel_id = ?", (iid,))
    db.excluir(g.db, "imoveis", iid, nome_usuario(), i["nome"])
    flash("Imóvel excluído. A pasta de arquivos foi mantida no disco.", "ok")
    return redirect(url_for("views.imoveis"))


@bp.route("/imoveis/<int:iid>/empresas", methods=["POST"])
@escrita
def imovel_empresa(iid):
    obter("imoveis", iid)
    try:
        emitente_id = int(request.form["emitente_id"])
        percentual = D(request.form["percentual"])
    except (KeyError, ValueError):
        flash("Escolha a empresa e informe o percentual.", "erro")
        return redirect(url_for("views.imovel", iid=iid) + "#empresas")
    existente = g.db.execute("SELECT id FROM imovel_emitentes WHERE imovel_id = ? AND emitente_id = ?",
                             (iid, emitente_id)).fetchone()
    if existente:
        db.atualizar(g.db, "imovel_emitentes", existente["id"], {"percentual": percentual}, nome_usuario())
    else:
        db.inserir(g.db, "imovel_emitentes", {"imovel_id": iid, "emitente_id": emitente_id,
                                              "percentual": percentual}, nome_usuario())
    return redirect(url_for("views.imovel", iid=iid) + "#empresas")


@bp.route("/participacao/<int:pid>/excluir", methods=["POST"])
@escrita
def participacao_excluir(pid):
    p = obter("imovel_emitentes", pid)
    return excluir_registro("imovel_emitentes", p, url_for("views.imovel", iid=p["imovel_id"]) + "#empresas")


# IPTU ------------------------------------------------------------------------
@bp.route("/imoveis/<int:iid>/iptu/novo", methods=["GET", "POST"])
@bp.route("/iptu/<int:pid>", methods=["GET", "POST"])
def iptu_form(iid=None, pid=None):
    registro = obter("iptus", pid) if pid else None
    iid = registro["imovel_id"] if registro else iid
    i = obter("imoveis", iid)
    return form_generico("iptus", forms.IPTU, f"IPTU - {i['nome']}", url_for("views.imovel", iid=iid) + "#iptu",
                         registro, {"imovel_id": iid}, f"IPTU de {i['nome']}")


@bp.route("/iptu/<int:pid>/excluir", methods=["POST"])
def iptu_excluir(pid):
    p = obter("iptus", pid)
    return excluir_registro("iptus", p, url_for("views.imovel", iid=p["imovel_id"]) + "#iptu")


# Troca de titularidade -----------------------------------------------------------
def campos_titularidade(iid):
    contratos = g.db.execute("SELECT id, inquilino_nome FROM contratos WHERE imovel_id = ? "
                             "ORDER BY data_entrada DESC", (iid,)).fetchall()
    campos = [dict(c) for c in forms.TITULARIDADE]
    for c in campos:
        if c.get("nome") == "contrato_id":
            c["opcoes"] = [(str(x["id"]), x["inquilino_nome"]) for x in contratos]
    return campos


@bp.route("/imoveis/<int:iid>/titularidade/nova", methods=["GET", "POST"])
@bp.route("/titularidade/<int:tid>", methods=["GET", "POST"])
def titularidade_form(iid=None, tid=None):
    registro = obter("titularidades", tid) if tid else None
    iid = registro["imovel_id"] if registro else iid
    i = obter("imoveis", iid)
    voltar = request.args.get("voltar") or url_for("views.imovel", iid=iid) + "#titularidade"
    if not registro and request.args.get("contrato"):
        registro_padrao = {"contrato_id": request.args["contrato"]}
    else:
        registro_padrao = None
    resposta = form_generico("titularidades", campos_titularidade(iid), f"Troca de titularidade - {i['nome']}",
                             voltar, registro, {"imovel_id": iid}, f"Titularidade em {i['nome']}")
    if registro_padrao and request.method == "GET":
        return render_template("form.html", campos=campos_titularidade(iid),
                               valores={**forms.para_formulario(forms.TITULARIDADE), **registro_padrao},
                               erros={}, titulo=f"Troca de titularidade - {i['nome']}", voltar=voltar,
                               registro=None)
    return resposta


@bp.route("/titularidade/<int:tid>/excluir", methods=["POST"])
def titularidade_excluir(tid):
    t = obter("titularidades", tid)
    return excluir_registro("titularidades", t, url_for("views.imovel", iid=t["imovel_id"]) + "#titularidade")


# --------------------------------------------------------------------------- #
# Contratos / inquilinos
# --------------------------------------------------------------------------- #
@bp.route("/imoveis/<int:iid>/contratos/novo", methods=["GET", "POST"])
@bp.route("/contratos/<int:cid>/editar", methods=["GET", "POST"])
@escrita
def contrato_form(iid=None, cid=None):
    registro = obter("contratos", cid) if cid else None
    iid = registro["imovel_id"] if registro else iid
    i = obter("imoveis", iid)
    base_desconto = servicos.aluguel_atual(g.db, registro) if registro else None
    valores, erros = forms.para_formulario(forms.CONTRATO, registro), {}
    if registro:
        valores["desconto_pontualidade_valor"] = forms.numero_br(
            calculos.desconto_por_percentual(base_desconto, registro["desconto_pontualidade_percentual"]))
    if request.method == "POST":
        dados, erros = forms.ler(forms.CONTRATO, request.form)
        valores = request.form
        valor_desc = (request.form.get("desconto_pontualidade_valor") or "").strip()
        if not erros and dados.get("desconto_pontualidade_percentual") is None and valor_desc:
            base = base_desconto or dados["aluguel_inicial"]
            dados["desconto_pontualidade_percentual"] = calculos.percentual_por_desconto(base, valor_desc)
        if not erros:
            if not 1 <= (dados["dia_vencimento"] or 0) <= 31:
                erros["dia_vencimento"] = "Informe um dia entre 1 e 31"
            if dados["data_saida"] and dados["data_saida"] < dados["data_entrada"]:
                erros["data_saida"] = "A saída não pode ser antes da entrada"
        if not erros:
            for chave in ("desconto_pontualidade_percentual", "taxa_boleto", "multa_percentual",
                          "juros_mensal_percentual"):
                if dados[chave] is None:
                    dados[chave] = D(0)
            dados["imovel_id"] = iid
            if registro:
                db.atualizar(g.db, "contratos", cid, dados, nome_usuario(), dados["inquilino_nome"])
            else:
                cid = db.inserir(g.db, "contratos", dados, nome_usuario(), dados["inquilino_nome"])
            sincronizar_pasta_contrato(obter("contratos", cid))
            flash("Contrato salvo.", "ok")
            return redirect(url_for("views.contrato", cid=cid))
        flash("Confira os campos destacados.", "erro")
    return render_template("form.html", campos=forms.CONTRATO, valores=valores, erros=erros,
                           titulo=("Editar inquilino / contrato" if registro else "Novo inquilino / contrato")
                           + f" - {i['nome']}",
                           voltar=url_for("views.contrato", cid=cid) if cid else url_for("views.imovel", iid=iid),
                           registro=registro, base_desconto=base_desconto)


@bp.route("/contratos/<int:cid>")
def contrato(cid):
    c = obter("contratos", cid)
    i = obter("imoveis", c["imovel_id"])
    pasta = sincronizar_pasta_contrato(c)
    c = obter("contratos", cid)
    aluguel = servicos.aluguel_atual(g.db, c)
    cobrancas = g.db.execute("SELECT * FROM cobrancas WHERE contrato_id = ? ORDER BY competencia DESC",
                             (cid,)).fetchall()
    return render_template(
        "contrato.html", c=c, i=i, aluguel=aluguel,
        desconto=calculos.desconto_por_percentual(aluguel, c["desconto_pontualidade_percentual"]),
        correcoes=servicos.correcoes(g.db, cid),
        seguros=g.db.execute("SELECT * FROM seguros WHERE contrato_id = ? ORDER BY vigencia_inicio DESC",
                             (cid,)).fetchall(),
        cobrancas=[{"c": x, "t": servicos.totais(x)} for x in cobrancas],
        titularidades=g.db.execute("SELECT * FROM titularidades WHERE contrato_id = ? ORDER BY data DESC",
                                   (cid,)).fetchall(),
        alertas=servicos.alertas_contrato(g.db, c, hoje()) if servicos.contrato_ativo(c, hoje()) else [],
        saldo_reserva=servicos.saldo_reserva(g.db, c), comp_reserva=servicos.competencia_reserva(c),
        arquivos=arquivos.listar(pasta), pasta=pasta, historico=historico("contrato_id = ?", (cid,)))


@bp.route("/contratos/<int:cid>/excluir", methods=["POST"])
@exige("admin")
def contrato_excluir(cid):
    c = obter("contratos", cid)
    db.excluir(g.db, "contratos", cid, nome_usuario(), c["inquilino_nome"])
    flash("Contrato excluído. A pasta de arquivos foi mantida no disco.", "ok")
    return redirect(url_for("views.imovel", iid=c["imovel_id"]))


# Correção do aluguel -------------------------------------------------------------
@bp.route("/contratos/<int:cid>/correcao/nova", methods=["GET", "POST"])
def correcao_form(cid):
    c = obter("contratos", cid)

    def ajustar(dados, erros):
        anterior = servicos.aluguel_atual(g.db, c, calculos.data(dados["data_vigencia"]) - dt.timedelta(days=1))
        dados["valor_anterior"] = anterior
        if dados.get("valor_novo") is None and dados.get("percentual") is None:
            erros["percentual"] = "Informe o percentual ou o novo valor"
        elif dados.get("valor_novo") is None:
            dados["valor_novo"] = calculos.aplicar_correcao(anterior, dados["percentual"])
        elif dados.get("percentual") is None:
            dados["percentual"] = (calculos.percentual_por_desconto(anterior, D(dados["valor_novo"]) - anterior)
                                   if anterior else D(0))

    registro = {"indice": c["indice_correcao"]} if request.method == "GET" else None
    if registro:
        valores = forms.para_formulario(forms.CORRECAO)
        valores["indice"] = c["indice_correcao"] or ""
        return render_template("form.html", campos=forms.CORRECAO, valores=valores, erros={},
                               titulo=f"Correção do aluguel - {c['inquilino_nome']}",
                               voltar=url_for("views.contrato", cid=cid),
                               registro=None, aviso=f"Aluguel atual: R$ {forms.numero_br(servicos.aluguel_atual(g.db, c))}")
    return form_generico("correcoes_aluguel", forms.CORRECAO, f"Correção do aluguel - {c['inquilino_nome']}",
                         url_for("views.contrato", cid=cid), None, {"contrato_id": cid},
                         f"Correção do aluguel de {c['inquilino_nome']}", ajustar)


@bp.route("/correcao/<int:rid>/excluir", methods=["POST"])
def correcao_excluir(rid):
    r = obter("correcoes_aluguel", rid)
    return excluir_registro("correcoes_aluguel", r, url_for("views.contrato", cid=r["contrato_id"]))


# Seguro ----------------------------------------------------------------------------
@bp.route("/contratos/<int:cid>/seguro/novo", methods=["GET", "POST"])
@bp.route("/seguro/<int:sid>", methods=["GET", "POST"])
def seguro_form(cid=None, sid=None):
    registro = obter("seguros", sid) if sid else None
    cid = registro["contrato_id"] if registro else cid
    c = obter("contratos", cid)
    return form_generico("seguros", forms.SEGURO, f"Seguro obrigatório - {c['inquilino_nome']}",
                         url_for("views.contrato", cid=cid) + "#seguros", registro, {"contrato_id": cid},
                         f"Seguro de {c['inquilino_nome']}")


@bp.route("/seguro/<int:sid>/excluir", methods=["POST"])
def seguro_excluir(sid):
    s = obter("seguros", sid)
    return excluir_registro("seguros", s, url_for("views.contrato", cid=s["contrato_id"]) + "#seguros")


# --------------------------------------------------------------------------- #
# Arquivos
# --------------------------------------------------------------------------- #
def pasta_do_escopo(escopo, rid):
    if escopo in ("imovel", "anuncio"):
        i = obter("imoveis", rid)
        base = sincronizar_pasta_imovel(i)
        sub = arquivos.PASTA_DOCS_IMOVEL if escopo == "imovel" else arquivos.PASTA_ANUNCIO
        ancora = "#documentos" if escopo == "imovel" else "#anuncio"
        return base / sub, {"imovel_id": rid}, url_for("views.imovel", iid=rid) + ancora
    if escopo == "contrato":
        c = obter("contratos", rid)
        return (sincronizar_pasta_contrato(c), {"imovel_id": c["imovel_id"], "contrato_id": rid},
                url_for("views.contrato", cid=rid) + "#arquivos")
    abort(404)


@bp.route("/arquivos/<escopo>/<int:rid>", methods=["POST"])
@escrita
def arquivo_enviar(escopo, rid):
    pasta, vinculo, voltar = pasta_do_escopo(escopo, rid)
    nomes = [arquivos.salvar_upload(pasta, f) for f in request.files.getlist("arquivos") if f.filename]
    if nomes:
        db.registrar(g.db, nome_usuario(), "Inclusão", "arquivos", None,
                     f"Arquivo(s) anexado(s) em {pasta.relative_to(current_app.config['PASTA_ARQUIVOS'])}",
                     {"arquivos": nomes}, **vinculo)
        g.db.commit()
        flash(f"{len(nomes)} arquivo(s) anexado(s).", "ok")
    return redirect(voltar)


@bp.route("/arquivos/<escopo>/<int:rid>/ver/<path:nome>")
def arquivo_ver(escopo, rid, nome):
    pasta, _, _ = pasta_do_escopo(escopo, rid)
    try:
        alvo = arquivos.caminho_seguro(pasta, nome)
    except ValueError:
        abort(404)
    if not alvo.is_file():
        abort(404)
    return send_file(alvo, as_attachment=request.args.get("baixar") == "1", download_name=alvo.name)


@bp.route("/arquivos/<escopo>/<int:rid>/excluir/<path:nome>", methods=["POST"])
@escrita
def arquivo_excluir(escopo, rid, nome):
    pasta, vinculo, voltar = pasta_do_escopo(escopo, rid)
    try:
        arquivos.remover(pasta, nome)
    except ValueError:
        abort(404)
    db.registrar(g.db, nome_usuario(), "Exclusão", "arquivos", None, f"Arquivo excluído: {nome}",
                 {"arquivo": nome}, **vinculo)
    g.db.commit()
    flash("Arquivo excluído.", "ok")
    return redirect(voltar)


@bp.route("/arquivos/<escopo>/<int:rid>/abrir", methods=["POST"])
def arquivo_abrir_pasta(escopo, rid):
    """Abre a pasta no Explorador de Arquivos (só no computador onde o programa roda)."""
    pasta, _, voltar = pasta_do_escopo(escopo, rid)
    if request.remote_addr not in ("127.0.0.1", "::1"):
        flash(f"A pasta fica no computador principal: {pasta}", "info")
        return redirect(voltar)
    try:
        if platform.system() == "Windows":
            os.startfile(pasta)  # type: ignore[attr-defined]
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(pasta)])
        else:
            subprocess.Popen(["xdg-open", str(pasta)])
    except OSError:
        flash(f"Não consegui abrir a pasta. Ela fica em: {pasta}", "erro")
    return redirect(voltar)


# --------------------------------------------------------------------------- #
# Cobranças do mês, pagamentos e faturas
# --------------------------------------------------------------------------- #
def competencia_pedida():
    comp = request.values.get("competencia") or somar_meses(competencia_de(hoje()), -1)
    try:
        calculos.separar_competencia(comp)
    except ValueError:
        abort(400)
    return comp[:7]


@bp.route("/cobrancas")
def cobrancas():
    comp = competencia_pedida()
    linhas = g.db.execute(
        "SELECT cb.*, c.inquilino_nome, c.inquilino_apelido, c.imovel_id, i.nome AS imovel_nome "
        "FROM cobrancas cb JOIN contratos c ON c.id = cb.contrato_id JOIN imoveis i ON i.id = c.imovel_id "
        "WHERE cb.competencia = ? ORDER BY i.nome, c.inquilino_nome", (comp,)).fetchall()
    lista = [{"c": x, "t": servicos.totais(x), "faturas": servicos.faturas_da_cobranca(g.db, x["id"])}
             for x in linhas]
    pendentes = [c for c in g.db.execute("SELECT * FROM contratos").fetchall()
                 if calculos.dias_ocupados(comp, c["data_entrada"], c["data_saida"]) > 0
                 and not any(x["c"]["contrato_id"] == c["id"] for x in lista)]
    soma = {k: sum((x["t"][k] for x in lista), D(0)) for k in ("total_pontual", "a_pagar_pontual")}
    soma["nf"] = sum((D(x["c"]["valor_nf"]) for x in lista), D(0))
    return render_template("cobrancas.html", comp=comp, lista=lista, pendentes=pendentes, soma=soma,
                           anterior=somar_meses(comp, -1), proxima=somar_meses(comp, 1), hoje=hoje())


@bp.route("/cobrancas/gerar", methods=["POST"])
@escrita
def cobrancas_gerar():
    comp = competencia_pedida()
    geradas, existentes = servicos.gerar_cobrancas(g.db, comp, nome_usuario())
    flash(f"{geradas} cobrança(s) gerada(s) para {comp[5:]}/{comp[:4]}."
          + (f" {existentes} já existia(m) e não foi(ram) alterada(s)." if existentes else ""), "ok")
    return redirect(url_for("views.cobrancas", competencia=comp))


@bp.route("/cobrancas/imprimir")
def cobrancas_imprimir():
    comp = competencia_pedida()
    ids = [r["id"] for r in g.db.execute(
        "SELECT cb.id FROM cobrancas cb JOIN contratos c ON c.id = cb.contrato_id "
        "JOIN imoveis i ON i.id = c.imovel_id WHERE competencia = ? ORDER BY i.nome", (comp,))]
    return render_template("demonstrativos.html", itens=[dados_cobranca(x) for x in ids], comp=comp)


def dados_cobranca(cbid):
    cb = obter("cobrancas", cbid)
    c = obter("contratos", cb["contrato_id"])
    i = obter("imoveis", c["imovel_id"])
    simulacao = calculos.liquidar(dict(cb), hoje()) if not cb["data_pagamento"] else None
    return {"cb": cb, "c": c, "i": i, "t": servicos.totais(cb), "simulacao": simulacao,
            "faturas": servicos.faturas_da_cobranca(g.db, cbid, so_validas=False)}


@bp.route("/cobrancas/<int:cbid>")
def cobranca(cbid):
    dados = dados_cobranca(cbid)
    return render_template("cobranca.html", **dados, hoje=hoje(),
                           tem_modelo=(current_app.config["PASTA_MODELOS"] / notafiscal.NOME_MODELO).exists())


CAMPOS_COBRANCA = [
    forms.campo("vencimento", "Vencimento", "data", obrig=True),
    forms.campo("aluguel", "Aluguel", "dinheiro", obrig=True),
    forms.campo("desconto", "Desconto de pontualidade", "dinheiro"),
    forms.campo("iptu", "IPTU", "dinheiro"),
    forms.campo("seguro", "Seguro", "dinheiro"),
    forms.campo("taxa_boleto", "Taxa do boleto", "dinheiro"),
    forms.campo("outros", "Outros valores", "dinheiro"),
    forms.campo("outros_descricao", "Descrição de outros valores"),
    forms.campo("reserva_utilizada", "Reserva utilizada", "dinheiro"),
    forms.campo("observacoes", "Observações", "area"),
]


@bp.route("/cobrancas/<int:cbid>/editar", methods=["GET", "POST"])
def cobranca_editar(cbid):
    cb = obter("cobrancas", cbid)
    if cb["data_pagamento"]:
        flash("Desfaça o pagamento antes de alterar os valores.", "erro")
        return redirect(url_for("views.cobranca", cbid=cbid))
    c = obter("contratos", cb["contrato_id"])

    def ajustar(dados, erros):
        for k in ("desconto", "iptu", "seguro", "taxa_boleto", "outros", "reserva_utilizada"):
            dados[k] = dados[k] if dados[k] is not None else D(0)
        disponivel = servicos.saldo_reserva(g.db, c, ignorar_cobranca=cbid)
        if dados["reserva_utilizada"] > disponivel:
            erros["reserva_utilizada"] = f"Saldo da reserva disponível: R$ {forms.numero_br(disponivel)}"

    return form_generico("cobrancas", CAMPOS_COBRANCA,
                         f"Cobrança {cb['competencia'][5:]}/{cb['competencia'][:4]} - {c['inquilino_nome']}",
                         url_for("views.cobranca", cbid=cbid), cb, None, "Valores da cobrança alterados", ajustar)


@bp.route("/cobrancas/<int:cbid>/excluir", methods=["POST"])
@escrita
def cobranca_excluir(cbid):
    cb = obter("cobrancas", cbid)
    if servicos.faturas_da_cobranca(g.db, cbid):
        flash("Esta cobrança tem faturas emitidas. Desfaça o pagamento antes.", "erro")
        return redirect(url_for("views.cobranca", cbid=cbid))
    db.excluir(g.db, "cobrancas", cbid, nome_usuario(), f"Cobrança {cb['competencia']}")
    flash("Cobrança excluída. Você pode gerá-la de novo na tela do mês.", "ok")
    return redirect(url_for("views.cobrancas", competencia=cb["competencia"]))


@bp.route("/cobrancas/<int:cbid>/pagamento", methods=["POST"])
@escrita
def cobranca_pagamento(cbid):
    cb = obter("cobrancas", cbid)
    voltar = request.form.get("voltar") or url_for("views.cobranca", cbid=cbid)
    if not voltar.startswith("/"):
        voltar = url_for("views.cobranca", cbid=cbid)
    try:
        data_pag = dt.date.fromisoformat(request.form.get("data_pagamento", ""))
        valor = request.form.get("valor_pago", "").strip()
        valor = calculos.arred(valor) if valor else None
    except ValueError:
        flash("Informe a data do pagamento.", "erro")
        return redirect(voltar)
    if cb["data_pagamento"]:
        servicos.estornar_pagamento(g.db, cb, nome_usuario())
        cb = obter("cobrancas", cbid)
    res = servicos.registrar_pagamento(g.db, cb, data_pag, valor, nome_usuario())
    if res["pontual"]:
        flash(f"Pagamento confirmado em dia. Valor da nota: R$ {forms.numero_br(res['valor_nf'])}.", "ok")
    else:
        flash(f"Pagamento com {res['dias_atraso']} dia(s) de atraso: multa R$ {forms.numero_br(res['multa'])}, "
              f"juros R$ {forms.numero_br(res['juros'])}. Valor da nota: R$ {forms.numero_br(res['valor_nf'])}.",
              "aviso")
    return redirect(voltar)


@bp.route("/cobrancas/<int:cbid>/estornar", methods=["POST"])
@escrita
def cobranca_estornar(cbid):
    cb = obter("cobrancas", cbid)
    servicos.estornar_pagamento(g.db, cb, nome_usuario())
    flash("Pagamento desfeito. Faturas emitidas para esta cobrança foram canceladas.", "ok")
    return redirect(url_for("views.cobranca", cbid=cbid))


@bp.route("/cobrancas/<int:cbid>/faturas", methods=["POST"])
@escrita
def faturas_emitir(cbid):
    cb = obter("cobrancas", cbid)
    voltar = request.form.get("voltar") or url_for("views.cobranca", cbid=cbid)
    if not voltar.startswith("/"):
        voltar = url_for("views.cobranca", cbid=cbid)
    try:
        emissao = dt.date.fromisoformat(request.form.get("emissao") or hoje().isoformat())
        numero = servicos.emitir_faturas(g.db, cb, emissao, nome_usuario())
        flash(f"Faturas nº {numero:04d} emitidas.", "ok")
    except ValueError as erro:
        flash(str(erro), "erro")
    return redirect(voltar)


@bp.route("/cobrancas/faturas-do-mes", methods=["POST"])
@escrita
def faturas_emitir_mes():
    comp = competencia_pedida()
    emissao = dt.date.fromisoformat(request.form.get("emissao") or hoje().isoformat())
    emitidas, problemas = 0, []
    for cb in g.db.execute("SELECT * FROM cobrancas WHERE competencia = ? AND data_pagamento IS NOT NULL",
                           (comp,)).fetchall():
        if servicos.faturas_da_cobranca(g.db, cb["id"]):
            continue
        try:
            servicos.emitir_faturas(g.db, cb, emissao, nome_usuario())
            emitidas += 1
        except ValueError as erro:
            c = obter("contratos", cb["contrato_id"])
            problemas.append(f"{c['inquilino_nome']}: {erro}")
    flash(f"Faturas emitidas para {emitidas} cobrança(s).", "ok")
    for p in problemas:
        flash(p, "erro")
    return redirect(url_for("views.cobrancas", competencia=comp))


@bp.route("/cobrancas/<int:cbid>/faturas/imprimir")
def faturas_imprimir(cbid):
    dados = dados_cobranca(cbid)
    faturas = [f for f in dados["faturas"] if f["situacao"] == "Emitida"]
    if not faturas:
        flash("Ainda não há faturas emitidas para esta cobrança.", "erro")
        return redirect(url_for("views.cobranca", cbid=cbid))
    return render_template("faturas.html", **{**dados, "faturas": faturas})


@bp.route("/faturas/imprimir")
def faturas_imprimir_mes():
    comp = competencia_pedida()
    blocos = []
    for cb in g.db.execute("SELECT id FROM cobrancas WHERE competencia = ? ORDER BY id", (comp,)):
        dados = dados_cobranca(cb["id"])
        validas = [f for f in dados["faturas"] if f["situacao"] == "Emitida"]
        if validas:
            blocos.append({**dados, "faturas": validas})
    return render_template("faturas_mes.html", blocos=blocos, comp=comp)


@bp.route("/faturas/<int:fid>/xml")
def fatura_xml(fid):
    f = obter("faturas", fid)
    modelo = current_app.config["PASTA_MODELOS"] / notafiscal.NOME_MODELO
    if not modelo.exists():
        flash("Nenhum modelo de XML cadastrado. Envie o modelo na tela Dados e backup.", "erro")
        return redirect(url_for("views.cobranca", cbid=f["cobranca_id"]))
    dados = dados_cobranca(f["cobranca_id"])
    emitente = obter("emitentes", f["emitente_id"])
    campos = notafiscal.valores(dados["cb"], dados["c"], dados["i"], f, emitente)
    try:
        xml = notafiscal.preencher(modelo.read_text(encoding="utf-8"), campos)
    except ValueError as erro:
        flash(str(erro), "erro")
        return redirect(url_for("views.cobranca", cbid=f["cobranca_id"]))
    nome = arquivos.limpar_nome(f"Fatura {f['numero']:04d} {emitente['nome_curto']} {dados['c']['inquilino_nome']}.xml")
    return Response(xml, mimetype="application/xml",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{_url(nome)}"})


def _url(texto):
    from urllib.parse import quote
    return quote(texto)


# --------------------------------------------------------------------------- #
# Empresas emitentes
# --------------------------------------------------------------------------- #
@bp.route("/empresas", methods=["GET", "POST"])
def emitentes():
    if request.method == "POST":
        if not pode("admin"):
            abort(403)
        try:
            numero = int(request.form["proxima_fatura"])
            if numero < 1:
                raise ValueError
        except (KeyError, ValueError):
            flash("Número inválido.", "erro")
            return redirect(url_for("views.emitentes"))
        anterior = db.ler_meta(g.db, "proxima_fatura")
        db.gravar_meta(g.db, "proxima_fatura", str(numero))
        db.registrar(g.db, nome_usuario(), "Alteração", "faturas", None, "Próximo número de fatura",
                     {"proxima_fatura": {"de": anterior, "para": numero}})
        g.db.commit()
        flash("Numeração atualizada.", "ok")
        return redirect(url_for("views.emitentes"))
    return render_template("emitentes.html",
                           emitentes=g.db.execute("SELECT * FROM emitentes ORDER BY nome_curto").fetchall(),
                           proxima=db.ler_meta(g.db, "proxima_fatura", "1"))


@bp.route("/empresas/nova", methods=["GET", "POST"])
@bp.route("/empresas/<int:eid>", methods=["GET", "POST"])
@exige("admin")
def emitente_form(eid=None):
    registro = obter("emitentes", eid) if eid else None
    return form_generico("emitentes", forms.EMITENTE, "Empresa emitente", url_for("views.emitentes"),
                         registro, None, "Empresa emitente")


# --------------------------------------------------------------------------- #
# Histórico
# --------------------------------------------------------------------------- #
@bp.route("/historico")
def historico_tela():
    filtros, params = ["1=1"], []
    if request.args.get("usuario"):
        filtros.append("usuario = ?")
        params.append(request.args["usuario"])
    if request.args.get("tabela"):
        filtros.append("tabela = ?")
        params.append(request.args["tabela"])
    if request.args.get("de"):
        filtros.append("quando >= ?")
        params.append(request.args["de"])
    if request.args.get("ate"):
        filtros.append("quando <= ?")
        params.append(request.args["ate"] + "T23:59:59")
    if request.args.get("texto"):
        filtros.append("(descricao LIKE ? OR detalhes LIKE ?)")
        params += [f"%{request.args['texto']}%"] * 2
    usuarios = [r[0] for r in g.db.execute("SELECT DISTINCT usuario FROM auditoria ORDER BY usuario")]
    return render_template("historico.html", historico=historico(" AND ".join(filtros), params, 500),
                           usuarios=usuarios, tabelas=db.NOMES_TABELAS)


# --------------------------------------------------------------------------- #
# Dados: exportar/importar ZIP e modelo de XML
# --------------------------------------------------------------------------- #
@bp.route("/dados")
def dados():
    pasta = current_app.config["PASTA_DADOS"]
    tamanho = sum(p.stat().st_size for p in (pasta / backup.PASTA_ARQUIVOS).rglob("*") if p.is_file())
    modelo = current_app.config["PASTA_MODELOS"] / notafiscal.NOME_MODELO
    return render_template("dados.html", pasta=pasta, tamanho=tamanho,
                           criado_em=db.ler_meta(g.db, "criado_em"), tem_modelo=modelo.exists(),
                           campos_xml=notafiscal.CAMPOS)


@bp.route("/dados/exportar")
@exige("operador")
def exportar():
    tmp = Path(tempfile.mkstemp(suffix=".zip")[1])
    backup.exportar(current_app.config["PASTA_DADOS"], tmp)
    db.registrar(g.db, nome_usuario(), "Exportação", "banco", None, "Banco e arquivos exportados em ZIP",
                 altera_dados=False)
    g.db.commit()

    @after_this_request
    def apagar(resposta):
        try:
            tmp.unlink()
        except OSError:
            pass
        return resposta

    return send_file(tmp, as_attachment=True, download_name=backup.nome_exportacao())


@bp.route("/dados/importar", methods=["POST"])
@exige("admin")
def importar():
    arquivo = request.files.get("zip")
    if not arquivo or not arquivo.filename:
        flash("Escolha o arquivo ZIP.", "erro")
        return redirect(url_for("views.dados"))
    if request.form.get("confirmo") != "sim":
        flash("Marque a confirmação: a importação substitui todos os dados deste computador.", "erro")
        return redirect(url_for("views.dados"))
    tmp = Path(tempfile.mkstemp(suffix=".zip")[1])
    arquivo.save(tmp)
    usuario = nome_usuario()
    g.db.close()
    g.pop("db")
    try:
        copia = backup.importar(current_app.config["PASTA_DADOS"], tmp)
    except (ValueError, OSError, Exception) as erro:  # noqa: BLE001 - mostrar qualquer falha ao usuário
        flash(f"Importação cancelada: {erro}", "erro")
        return redirect(url_for("views.dados"))
    finally:
        tmp.unlink(missing_ok=True)
    con = db.conectar(current_app.config["BANCO"])
    try:
        db.registrar(con, usuario, "Importação", "banco", None,
                     f"Dados importados de ZIP. Cópia dos dados anteriores: {copia.name}", altera_dados=False)
        con.commit()
    finally:
        con.close()
    flash(f"Dados importados. Os dados anteriores foram guardados em backups/{copia.name}. "
          "Entre de novo com um usuário do banco importado.", "ok")
    return redirect(url_for("auth.sair"))


@bp.route("/dados/modelo-xml", methods=["POST"])
@exige("admin")
def modelo_xml():
    arquivo = request.files.get("modelo")
    destino = current_app.config["PASTA_MODELOS"] / notafiscal.NOME_MODELO
    if request.form.get("remover"):
        destino.unlink(missing_ok=True)
        flash("Modelo removido.", "ok")
    elif arquivo and arquivo.filename:
        texto = arquivo.read().decode("utf-8-sig")
        try:
            notafiscal.preencher(texto, notafiscal.exemplo())
        except ValueError as erro:
            flash(str(erro), "erro")
            return redirect(url_for("views.dados"))
        destino.write_text(texto, encoding="utf-8")
        db.registrar(g.db, nome_usuario(), "Alteração", "banco", None, "Modelo XML da nota fiscal enviado")
        g.db.commit()
        flash("Modelo de XML salvo.", "ok")
    return redirect(url_for("views.dados"))


@bp.route("/dados/modelo-xml")
def modelo_xml_baixar():
    destino = current_app.config["PASTA_MODELOS"] / notafiscal.NOME_MODELO
    if not destino.exists():
        abort(404)
    return send_file(destino, as_attachment=True, download_name=notafiscal.NOME_MODELO)
