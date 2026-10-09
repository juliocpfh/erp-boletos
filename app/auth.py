"""Login, senhas e cadastro de usuários."""
from __future__ import annotations

from functools import wraps

from flask import Blueprint, abort, flash, g, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from . import db, forms

bp = Blueprint("auth", __name__)

NIVEL = {"consulta": 0, "operador": 1, "admin": 2}
SENHA_MINIMA = 6


def pode(papel: str) -> bool:
    return g.get("usuario") is not None and NIVEL[g.usuario["papel"]] >= NIVEL[papel]


def exige(papel):
    """Restringe a rota ao perfil indicado ou superior."""
    def decorador(func):
        @wraps(func)
        def envolvida(*args, **kwargs):
            if not pode(papel):
                abort(403)
            return func(*args, **kwargs)
        return envolvida
    return decorador


def escrita(func):
    """Qualquer alteração (POST) exige perfil de operador ou administrador."""
    @wraps(func)
    def envolvida(*args, **kwargs):
        if request.method == "POST" and not pode("operador"):
            abort(403)
        return func(*args, **kwargs)
    return envolvida


def nome_usuario() -> str:
    return g.usuario["login"] if g.get("usuario") else "sistema"


@bp.app_context_processor
def permissoes():
    return {"pode": pode}


@bp.route("/login", methods=["GET", "POST"])
def login():
    if not g.db.execute("SELECT 1 FROM usuarios LIMIT 1").fetchone():
        return redirect(url_for("auth.primeiro_acesso"))
    if request.method == "POST":
        login_ = request.form.get("login", "").strip().lower()
        usuario = g.db.execute("SELECT * FROM usuarios WHERE login = ? AND ativo = 1", (login_,)).fetchone()
        if usuario and check_password_hash(usuario["senha_hash"], request.form.get("senha", "")):
            session.clear()
            session["usuario_id"] = usuario["id"]
            db.registrar(g.db, usuario["login"], "Login", "usuarios", usuario["id"], "Entrou no sistema",
                        altera_dados=False)
            g.db.commit()
            proximo = request.args.get("proximo") or ""
            return redirect(proximo if proximo.startswith("/") and not proximo.startswith("//")
                            else url_for("views.painel"))
        flash("Login ou senha incorretos.", "erro")
    return render_template("login.html")


@bp.route("/sair")
def sair():
    session.clear()
    return redirect(url_for("auth.login"))


@bp.route("/primeiro-acesso", methods=["GET", "POST"])
def primeiro_acesso():
    """Cria o primeiro administrador quando o banco ainda não tem usuários."""
    if g.db.execute("SELECT 1 FROM usuarios LIMIT 1").fetchone():
        return redirect(url_for("auth.login"))
    if request.method == "POST":
        login_ = request.form.get("login", "").strip().lower()
        senha = request.form.get("senha", "")
        if not login_ or not request.form.get("nome", "").strip():
            flash("Preencha nome e login.", "erro")
        elif len(senha) < SENHA_MINIMA or senha != request.form.get("senha2"):
            flash(f"A senha precisa ter pelo menos {SENHA_MINIMA} caracteres e as duas precisam ser iguais.", "erro")
        else:
            novo = db.inserir(g.db, "usuarios", {
                "login": login_, "nome": request.form["nome"].strip(),
                "senha_hash": generate_password_hash(senha), "papel": "admin", "ativo": 1,
                "criado_em": db.agora()}, login_, "Primeiro administrador criado")
            session.clear()
            session["usuario_id"] = novo
            return redirect(url_for("views.painel"))
    return render_template("primeiro_acesso.html")


@bp.route("/minha-senha", methods=["GET", "POST"])
def minha_senha():
    if request.method == "POST":
        nova = request.form.get("nova", "")
        if not check_password_hash(g.usuario["senha_hash"], request.form.get("atual", "")):
            flash("Senha atual incorreta.", "erro")
        elif len(nova) < SENHA_MINIMA or nova != request.form.get("nova2"):
            flash(f"A nova senha precisa ter pelo menos {SENHA_MINIMA} caracteres e as duas precisam ser iguais.", "erro")
        else:
            db.atualizar(g.db, "usuarios", g.usuario["id"], {"senha_hash": generate_password_hash(nova)},
                         nome_usuario(), "Trocou a própria senha")
            flash("Senha alterada.", "ok")
            return redirect(url_for("views.painel"))
    return render_template("minha_senha.html")


@bp.route("/usuarios")
@exige("admin")
def usuarios():
    lista = g.db.execute("SELECT * FROM usuarios ORDER BY nome").fetchall()
    return render_template("usuarios.html", usuarios=lista)


@bp.route("/usuarios/novo", methods=["GET", "POST"])
@bp.route("/usuarios/<int:uid>", methods=["GET", "POST"])
@exige("admin")
def usuario_form(uid=None):
    registro = g.db.execute("SELECT * FROM usuarios WHERE id = ?", (uid,)).fetchone() if uid else None
    if uid and registro is None:
        abort(404)
    valores, erros = forms.para_formulario(forms.USUARIO, registro), {}
    if request.method == "POST":
        dados, erros = forms.ler(forms.USUARIO, request.form)
        valores = request.form
        dados["login"] = (dados.get("login") or "").lower()
        senha = request.form.get("senha", "")
        if senha:
            if len(senha) < SENHA_MINIMA:
                erros["senha"] = f"Mínimo de {SENHA_MINIMA} caracteres"
            else:
                dados["senha_hash"] = generate_password_hash(senha)
        elif not registro:
            erros["senha"] = "Informe uma senha inicial"
        repetido = g.db.execute("SELECT id FROM usuarios WHERE login = ? AND id != ?",
                                (dados["login"], uid or 0)).fetchone()
        if repetido:
            erros["login"] = "Já existe um usuário com este login"
        if registro and registro["id"] == g.usuario["id"] and (dados["papel"] != "admin" or not dados["ativo"]):
            erros["papel"] = "Você não pode tirar o seu próprio acesso de administrador"
        if not erros:
            if registro:
                db.atualizar(g.db, "usuarios", uid, dados, nome_usuario(), f"Usuário {dados['login']}")
            else:
                dados["criado_em"] = db.agora()
                db.inserir(g.db, "usuarios", dados, nome_usuario(), f"Usuário {dados['login']}")
            flash("Usuário salvo.", "ok")
            return redirect(url_for("auth.usuarios"))
    return render_template("usuario_form.html", campos=forms.USUARIO, valores=valores, erros=erros,
                           registro=registro)
