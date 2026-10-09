"""Sistema de administração de imóveis locados."""
from __future__ import annotations

import os
import secrets
from pathlib import Path

from flask import Flask, abort, g, redirect, request, session, url_for

from . import backup, db, forms
from .calculos import data

PASTA_PADRAO = Path(__file__).resolve().parent.parent / "dados"


def create_app(pasta_dados=None, testing=False) -> Flask:
    app = Flask(__name__)
    pasta = Path(pasta_dados or os.environ.get("IMOVEIS_DADOS") or PASTA_PADRAO).resolve()
    for sub in ("", backup.PASTA_ARQUIVOS, backup.PASTA_MODELOS, backup.PASTA_BACKUPS):
        (pasta / sub).mkdir(parents=True, exist_ok=True)

    chave = pasta / ".chave_secreta"
    if not chave.exists():
        chave.write_text(secrets.token_hex(32))
    app.config.update(
        SECRET_KEY=chave.read_text().strip(),
        PASTA_DADOS=pasta,
        BANCO=pasta / backup.NOME_BANCO,
        PASTA_ARQUIVOS=pasta / backup.PASTA_ARQUIVOS,
        PASTA_MODELOS=pasta / backup.PASTA_MODELOS,
        MAX_CONTENT_LENGTH=500 * 1024 * 1024,
        TESTING=testing,
    )
    if not testing:
        backup.backup_automatico(pasta)
    db.inicializar(app.config["BANCO"])

    @app.before_request
    def abrir_banco():
        g.db = db.conectar(app.config["BANCO"])
        g.usuario = None
        if session.get("usuario_id"):
            g.usuario = g.db.execute("SELECT * FROM usuarios WHERE id = ? AND ativo = 1",
                                     (session["usuario_id"],)).fetchone()
            if g.usuario is None:
                session.clear()
        if request.method == "POST" and not app.config.get("SEM_CSRF"):
            token = session.get("_csrf")
            if not token or request.form.get("_csrf") != token:
                abort(400, "Formulário expirado. Volte, recarregue a página e tente de novo.")
        livres = {"static", "auth.login", "auth.primeiro_acesso"}
        if g.usuario is None and request.endpoint not in livres:
            return redirect(url_for("auth.login", proximo=request.full_path))
        return None

    @app.teardown_request
    def fechar_banco(_exc):
        con = g.pop("db", None)
        if con is not None:
            con.close()

    @app.context_processor
    def contexto():
        if "_csrf" not in session:
            session["_csrf"] = secrets.token_hex(16)
        info = {}
        if "db" in g:
            info = {
                "ultima_atualizacao": db.ler_meta(g.db, "ultima_atualizacao"),
                "ultima_atualizacao_por": db.ler_meta(g.db, "ultima_atualizacao_por"),
            }
        return {"csrf": session["_csrf"], "usuario": g.get("usuario"), "PAPEIS": forms.PAPEIS, **info}

    @app.template_filter("brl")
    def brl(valor):
        return "R$ " + (forms.numero_br(valor or 0))

    @app.template_filter("num")
    def num(valor):
        return forms.numero_br(valor)

    @app.template_filter("pct")
    def pct(valor):
        return forms.pct_br(valor or 0) + "%"

    @app.template_filter("databr")
    def databr(valor):
        if not valor:
            return "-"
        texto = str(valor)
        if len(texto) > 10:  # data e hora
            return f"{texto[8:10]}/{texto[5:7]}/{texto[:4]} {texto[11:16]}"
        d = data(texto)
        return d.strftime("%d/%m/%Y")

    @app.template_filter("compbr")
    def compbr(valor):
        if not valor:
            return "-"
        return f"{valor[5:7]}/{valor[:4]}"

    from .auth import bp as auth_bp
    from .views import bp as views_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(views_bp)
    return app
