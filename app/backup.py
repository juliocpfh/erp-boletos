"""Exportação e importação de todos os dados (banco + arquivos) num único ZIP."""
from __future__ import annotations

import datetime as dt
import shutil
import sqlite3
import tempfile
import zipfile
from pathlib import Path

NOME_BANCO = "banco.db"
PASTA_ARQUIVOS = "arquivos"
PASTA_MODELOS = "modelos"
PASTA_BACKUPS = "backups"
MANTER_BACKUPS_AUTOMATICOS = 15


def _copiar_banco(origem: Path, destino: Path) -> None:
    """Cópia consistente do banco, mesmo com o programa aberto."""
    fonte = sqlite3.connect(origem)
    alvo = sqlite3.connect(destino)
    try:
        fonte.backup(alvo)
    finally:
        alvo.close()
        fonte.close()


def exportar(pasta_dados: Path, destino_zip: Path) -> Path:
    pasta_dados = Path(pasta_dados)
    with tempfile.TemporaryDirectory() as tmp:
        copia = Path(tmp) / NOME_BANCO
        _copiar_banco(pasta_dados / NOME_BANCO, copia)
        with zipfile.ZipFile(destino_zip, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(copia, NOME_BANCO)
            for sub in (PASTA_ARQUIVOS, PASTA_MODELOS):
                base = pasta_dados / sub
                if not base.exists():
                    continue
                for arquivo in sorted(base.rglob("*")):
                    if arquivo.is_file():
                        zf.write(arquivo, arquivo.relative_to(pasta_dados).as_posix())
    return destino_zip


def nome_exportacao() -> str:
    return f"imoveis-{dt.datetime.now():%Y-%m-%d_%H-%M}.zip"


def validar_zip(caminho_zip: Path) -> None:
    with zipfile.ZipFile(caminho_zip) as zf:
        nomes = zf.namelist()
        if NOME_BANCO not in nomes:
            raise ValueError("O arquivo ZIP não contém o banco de dados (banco.db).")
        for nome in nomes:
            partes = Path(nome).parts
            if nome.startswith(("/", "\\")) or ".." in partes or (partes and ":" in partes[0]):
                raise ValueError(f"Caminho inválido dentro do ZIP: {nome}")
            if nome != NOME_BANCO and partes[0] not in (PASTA_ARQUIVOS, PASTA_MODELOS):
                raise ValueError(f"Arquivo inesperado dentro do ZIP: {nome}")


def importar(pasta_dados: Path, caminho_zip: Path) -> Path:
    """Substitui os dados atuais pelos do ZIP. Antes, salva um backup do que existia."""
    pasta_dados = Path(pasta_dados)
    validar_zip(caminho_zip)
    pasta_backups = pasta_dados / PASTA_BACKUPS
    pasta_backups.mkdir(parents=True, exist_ok=True)
    seguranca = pasta_backups / f"antes-da-importacao-{dt.datetime.now():%Y-%m-%d_%H-%M-%S}.zip"
    if (pasta_dados / NOME_BANCO).exists():
        exportar(pasta_dados, seguranca)

    with tempfile.TemporaryDirectory(dir=pasta_dados) as tmp:
        tmp = Path(tmp)
        with zipfile.ZipFile(caminho_zip) as zf:
            zf.extractall(tmp)
        teste = sqlite3.connect(tmp / NOME_BANCO)
        try:
            if teste.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("O banco de dados do ZIP está corrompido.")
            teste.execute("SELECT count(*) FROM imoveis").fetchone()
        except sqlite3.DatabaseError as exc:
            raise ValueError("O ZIP não contém um banco de dados deste programa.") from exc
        finally:
            teste.close()

        _copiar_banco(tmp / NOME_BANCO, pasta_dados / NOME_BANCO)
        for sub in (PASTA_ARQUIVOS, PASTA_MODELOS):
            if (pasta_dados / sub).exists():
                shutil.rmtree(pasta_dados / sub)
            if (tmp / sub).exists():
                shutil.move(str(tmp / sub), str(pasta_dados / sub))
            else:
                (pasta_dados / sub).mkdir()
    return seguranca


def backup_automatico(pasta_dados: Path) -> Path | None:
    """Cópia do banco ao abrir o programa; guarda as últimas 15."""
    pasta_dados = Path(pasta_dados)
    banco = pasta_dados / NOME_BANCO
    if not banco.exists():
        return None
    pasta = pasta_dados / PASTA_BACKUPS / "automaticos"
    pasta.mkdir(parents=True, exist_ok=True)
    destino = pasta / f"banco-{dt.datetime.now():%Y-%m-%d_%H-%M-%S}.db"
    _copiar_banco(banco, destino)
    antigos = sorted(pasta.glob("banco-*.db"))
    for velho in antigos[:-MANTER_BACKUPS_AUTOMATICOS]:
        velho.unlink()
    return destino
