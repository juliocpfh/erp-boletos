"""Pastas de arquivos por imóvel e por inquilino.

Estrutura dentro de ``dados/arquivos``::

    <Imóvel>/
        Documentos do imóvel/      matrícula, cadastro do IPTU...
        Anúncio/                   fotos do último anúncio
        <Inquilino> (07-01-2025 a -)/   contrato, vistoria, apólices, notificações...
"""
from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

from .calculos import data

PASTA_DOCS_IMOVEL = "Documentos do imóvel"
PASTA_ANUNCIO = "Anúncio"
EXTENSOES_FOTO = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def limpar_nome(nome: str) -> str:
    """Remove caracteres que o Windows não aceita em nomes de pasta/arquivo."""
    nome = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "-", str(nome or "")).strip().rstrip(". ")
    return nome[:120] or "sem nome"


def nome_pasta_imovel(imovel) -> str:
    return limpar_nome(imovel["nome"])


def nome_pasta_contrato(contrato) -> str:
    entrada = data(contrato["data_entrada"])
    saida = data(contrato["data_saida"])
    texto_entrada = entrada.strftime("%d-%m-%Y") if entrada else "-"
    texto_saida = saida.strftime("%d-%m-%Y") if saida else "-"
    return limpar_nome(f"{contrato['inquilino_nome']} ({texto_entrada} a {texto_saida})")


def _renomear(origem: Path, destino: Path) -> Path:
    if origem != destino and origem.exists() and not destino.exists():
        origem.rename(destino)
    destino.mkdir(parents=True, exist_ok=True)
    return destino


def pasta_imovel(raiz: Path, imovel) -> Path:
    """Garante a pasta do imóvel (renomeando se o nome mudou) e devolve o caminho."""
    nova = raiz / nome_pasta_imovel(imovel)
    antiga = raiz / imovel["pasta"] if imovel["pasta"] else nova
    caminho = _renomear(antiga, nova)
    (caminho / PASTA_DOCS_IMOVEL).mkdir(exist_ok=True)
    (caminho / PASTA_ANUNCIO).mkdir(exist_ok=True)
    return caminho


def pasta_contrato(raiz: Path, imovel, contrato) -> Path:
    base = pasta_imovel(raiz, imovel)
    nova = base / nome_pasta_contrato(contrato)
    antiga = base / contrato["pasta"] if contrato["pasta"] else nova
    return _renomear(antiga, nova)


def caminho_seguro(base: Path, relativo: str) -> Path:
    """Resolve um caminho relativo garantindo que ele fica dentro de ``base``."""
    alvo = (base / relativo).resolve()
    if base.resolve() not in alvo.parents and alvo != base.resolve():
        raise ValueError("Caminho fora da pasta permitida")
    return alvo


def listar(pasta: Path) -> list[dict]:
    if not pasta.exists():
        return []
    itens = []
    for p in sorted(pasta.iterdir(), key=lambda p: p.name.lower()):
        if p.is_file():
            itens.append({"nome": p.name, "tamanho": p.stat().st_size,
                          "foto": p.suffix.lower() in EXTENSOES_FOTO})
    return itens


def salvar_upload(pasta: Path, arquivo) -> str:
    """Grava um arquivo enviado sem sobrescrever outro com o mesmo nome."""
    pasta.mkdir(parents=True, exist_ok=True)
    nome = limpar_nome(os.path.basename(arquivo.filename or "arquivo"))
    destino = pasta / nome
    base, ext = os.path.splitext(nome)
    n = 2
    while destino.exists():
        destino = pasta / f"{base} ({n}){ext}"
        n += 1
    arquivo.save(destino)
    return destino.name


def remover(pasta: Path, nome: str) -> None:
    alvo = caminho_seguro(pasta, nome)
    if alvo.is_file():
        alvo.unlink()
    elif alvo.is_dir():
        shutil.rmtree(alvo)
