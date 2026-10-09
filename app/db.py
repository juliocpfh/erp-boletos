"""Banco de dados SQLite, gravação com histórico (auditoria) e data da última atualização."""
from __future__ import annotations

import datetime as dt
import json
import sqlite3
from decimal import Decimal

VERSAO_ESQUEMA = 1

ESQUEMA = """
CREATE TABLE IF NOT EXISTS meta (
    chave TEXT PRIMARY KEY,
    valor TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY,
    login TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    senha_hash TEXT NOT NULL,
    papel TEXT NOT NULL DEFAULT 'operador',
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT
);

CREATE TABLE IF NOT EXISTS imoveis (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    endereco TEXT NOT NULL,
    complemento TEXT, bairro TEXT, cidade TEXT, cep TEXT,
    matricula TEXT, cartorio TEXT, inscricao_iptu TEXT,
    copel_uc TEXT, sanepar_matricula TEXT,
    condominio_nome TEXT, condominio_contato TEXT,
    anuncio_link TEXT, anuncio_data TEXT,
    observacoes TEXT,
    pasta TEXT
);

CREATE TABLE IF NOT EXISTS contratos (
    id INTEGER PRIMARY KEY,
    imovel_id INTEGER NOT NULL REFERENCES imoveis(id),
    inquilino_nome TEXT NOT NULL, inquilino_apelido TEXT,
    inquilino_telefone TEXT, inquilino_whatsapp INTEGER DEFAULT 0,
    inquilino_email TEXT, inquilino_cpf TEXT, inquilino_rg TEXT,
    responsavel_nome TEXT, responsavel_telefone TEXT, responsavel_email TEXT,
    data_entrada TEXT NOT NULL, data_saida TEXT,
    vigencia_inicio TEXT NOT NULL, vigencia_fim TEXT,
    aluguel_inicial TEXT NOT NULL,
    dia_vencimento INTEGER NOT NULL DEFAULT 10,
    cobranca_mes_seguinte INTEGER NOT NULL DEFAULT 1,
    desconto_pontualidade_percentual TEXT DEFAULT '0',
    taxa_boleto TEXT DEFAULT '0',
    multa_percentual TEXT DEFAULT '10',
    juros_mensal_percentual TEXT DEFAULT '1',
    indice_correcao TEXT,
    cobrar_iptu INTEGER NOT NULL DEFAULT 1,
    garantia_tipo TEXT,
    caucao_valor TEXT, caucao_data TEXT, caucao_indice TEXT,
    caucao_valor_corrigido TEXT, caucao_data_correcao TEXT,
    fiador_nome TEXT, fiador_cpf TEXT, fiador_rg TEXT, fiador_telefone TEXT,
    fiador_email TEXT, fiador_endereco TEXT,
    reserva_valor TEXT, reserva_data TEXT, reserva_competencia TEXT,
    observacoes TEXT,
    pasta TEXT
);

CREATE TABLE IF NOT EXISTS correcoes_aluguel (
    id INTEGER PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    data_vigencia TEXT NOT NULL,
    indice TEXT, percentual TEXT,
    valor_anterior TEXT, valor_novo TEXT NOT NULL,
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS seguros (
    id INTEGER PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    seguradora TEXT, apolice TEXT, data_contratacao TEXT,
    vigencia_inicio TEXT NOT NULL, vigencia_fim TEXT NOT NULL,
    valor_total TEXT NOT NULL, num_parcelas INTEGER NOT NULL DEFAULT 1,
    primeira_competencia TEXT NOT NULL,
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS iptus (
    id INTEGER PRIMARY KEY,
    imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
    ano INTEGER NOT NULL,
    valor_total TEXT NOT NULL, num_parcelas INTEGER NOT NULL DEFAULT 1,
    primeira_competencia TEXT NOT NULL,
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS titularidades (
    id INTEGER PRIMARY KEY,
    imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
    contrato_id INTEGER REFERENCES contratos(id) ON DELETE SET NULL,
    concessionaria TEXT NOT NULL,
    tipo TEXT, protocolo TEXT, data TEXT, situacao TEXT,
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS cobrancas (
    id INTEGER PRIMARY KEY,
    contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    competencia TEXT NOT NULL,
    vencimento TEXT NOT NULL,
    dias_cobrados INTEGER, dias_mes INTEGER,
    aluguel_mensal TEXT, aluguel TEXT, desconto TEXT,
    iptu TEXT, iptu_parcela TEXT, seguro TEXT, seguro_parcela TEXT,
    taxa_boleto TEXT, outros TEXT, outros_descricao TEXT,
    reserva_utilizada TEXT,
    multa_percentual TEXT, juros_mensal_percentual TEXT,
    data_pagamento TEXT, valor_pago TEXT,
    dias_atraso INTEGER, multa TEXT, juros TEXT, valor_nf TEXT,
    situacao TEXT NOT NULL DEFAULT 'Em aberto',
    observacoes TEXT,
    UNIQUE (contrato_id, competencia)
);

CREATE TABLE IF NOT EXISTS emitentes (
    id INTEGER PRIMARY KEY,
    nome_curto TEXT NOT NULL,
    razao_social TEXT NOT NULL,
    cnpj TEXT, endereco TEXT, municipio TEXT,
    ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS imovel_emitentes (
    id INTEGER PRIMARY KEY,
    imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
    emitente_id INTEGER NOT NULL REFERENCES emitentes(id),
    percentual TEXT NOT NULL,
    UNIQUE (imovel_id, emitente_id)
);

CREATE TABLE IF NOT EXISTS faturas (
    id INTEGER PRIMARY KEY,
    cobranca_id INTEGER NOT NULL REFERENCES cobrancas(id) ON DELETE CASCADE,
    emitente_id INTEGER NOT NULL REFERENCES emitentes(id),
    numero INTEGER NOT NULL,
    emissao TEXT NOT NULL,
    periodo_inicio TEXT, periodo_fim TEXT,
    percentual TEXT, valor TEXT NOT NULL,
    situacao TEXT NOT NULL DEFAULT 'Emitida'
);

CREATE TABLE IF NOT EXISTS auditoria (
    id INTEGER PRIMARY KEY,
    quando TEXT NOT NULL,
    usuario TEXT,
    acao TEXT NOT NULL,
    tabela TEXT,
    registro_id INTEGER,
    imovel_id INTEGER,
    contrato_id INTEGER,
    descricao TEXT,
    detalhes TEXT
);
CREATE INDEX IF NOT EXISTS idx_auditoria_quando ON auditoria(quando);
"""

NOMES_TABELAS = {
    "imoveis": "Imóvel", "contratos": "Contrato/Inquilino", "correcoes_aluguel": "Correção de aluguel",
    "seguros": "Seguro", "iptus": "IPTU", "titularidades": "Troca de titularidade",
    "cobrancas": "Cobrança", "emitentes": "Empresa emitente", "imovel_emitentes": "Participação no imóvel",
    "faturas": "Fatura de locação", "usuarios": "Usuário", "arquivos": "Arquivo", "banco": "Banco de dados",
}


def agora() -> str:
    return dt.datetime.now().isoformat(timespec="seconds")


def conectar(caminho) -> sqlite3.Connection:
    con = sqlite3.connect(caminho, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def inicializar(caminho) -> None:
    con = conectar(caminho)
    try:
        con.executescript(ESQUEMA)
        if not ler_meta(con, "criado_em"):
            gravar_meta(con, "criado_em", agora())
        if not ler_meta(con, "proxima_fatura"):
            gravar_meta(con, "proxima_fatura", "1")
        gravar_meta(con, "versao_esquema", str(VERSAO_ESQUEMA))
        con.commit()
    finally:
        con.close()


def ler_meta(con, chave, padrao=None):
    linha = con.execute("SELECT valor FROM meta WHERE chave = ?", (chave,)).fetchone()
    return linha["valor"] if linha else padrao


def gravar_meta(con, chave, valor) -> None:
    con.execute("INSERT INTO meta (chave, valor) VALUES (?, ?) "
                "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", (chave, valor))


def _texto(valor):
    if isinstance(valor, Decimal):
        return format(valor, "f")
    return valor


def _normalizar(dados: dict) -> dict:
    return {k: _texto(v) for k, v in dados.items()}


def registrar(con, usuario, acao, tabela=None, registro_id=None, descricao=None,
              detalhes=None, imovel_id=None, contrato_id=None, altera_dados=True) -> None:
    """Grava uma linha no histórico e marca a última atualização do banco."""
    quando = agora()
    con.execute(
        "INSERT INTO auditoria (quando, usuario, acao, tabela, registro_id, imovel_id, contrato_id,"
        " descricao, detalhes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (quando, usuario, acao, tabela, registro_id, imovel_id, contrato_id, descricao,
         json.dumps(detalhes, ensure_ascii=False, default=str) if detalhes else None))
    if altera_dados:
        gravar_meta(con, "ultima_atualizacao", quando)
        gravar_meta(con, "ultima_atualizacao_por", usuario or "")


def _vinculos(con, tabela, linha) -> tuple:
    """Descobre imóvel e contrato de um registro, para filtrar o histórico."""
    linha = dict(linha)
    if tabela == "imoveis":
        return linha["id"], None
    if tabela == "contratos":
        return linha["imovel_id"], linha["id"]
    if tabela == "faturas":
        linha = dict(con.execute("SELECT contrato_id FROM cobrancas WHERE id = ?", (linha["cobranca_id"],)).fetchone() or {})
    if "contrato_id" in linha and linha["contrato_id"]:
        c = con.execute("SELECT imovel_id FROM contratos WHERE id = ?", (linha["contrato_id"],)).fetchone()
        return (linha.get("imovel_id") or (c["imovel_id"] if c else None)), linha["contrato_id"]
    return linha.get("imovel_id"), None


def inserir(con, tabela, dados: dict, usuario, descricao=None) -> int:
    dados = _normalizar(dados)
    colunas = ", ".join(dados)
    marcas = ", ".join("?" for _ in dados)
    cur = con.execute(f"INSERT INTO {tabela} ({colunas}) VALUES ({marcas})", tuple(dados.values()))
    novo_id = cur.lastrowid
    linha = con.execute(f"SELECT * FROM {tabela} WHERE id = ?", (novo_id,)).fetchone()
    imovel_id, contrato_id = _vinculos(con, tabela, linha)
    registrar(con, usuario, "Inclusão", tabela, novo_id, descricao,
              {k: v for k, v in dados.items() if v not in (None, "") and k != "senha_hash"},
              imovel_id, contrato_id)
    con.commit()
    return novo_id


def atualizar(con, tabela, registro_id, dados: dict, usuario, descricao=None) -> dict:
    """Atualiza só o que mudou e guarda no histórico o valor antigo e o novo."""
    dados = _normalizar(dados)
    antes = con.execute(f"SELECT * FROM {tabela} WHERE id = ?", (registro_id,)).fetchone()
    if antes is None:
        raise LookupError(f"{tabela} {registro_id} não encontrado")
    mudancas = {}
    for campo, novo in dados.items():
        velho = antes[campo]
        if (velho if velho is not None else "") != (novo if novo is not None else ""):
            if str(velho) != str(novo):
                mudancas[campo] = {"de": velho, "para": novo}
    if mudancas:
        sets = ", ".join(f"{c} = ?" for c in mudancas)
        con.execute(f"UPDATE {tabela} SET {sets} WHERE id = ?",
                    tuple(dados[c] for c in mudancas) + (registro_id,))
        imovel_id, contrato_id = _vinculos(con, tabela, antes)
        visiveis = {k: v for k, v in mudancas.items() if k != "senha_hash"}
        if "senha_hash" in mudancas:
            visiveis["senha"] = "alterada"
        registrar(con, usuario, "Alteração", tabela, registro_id, descricao, visiveis,
                  imovel_id, contrato_id)
        con.commit()
    return mudancas


def excluir(con, tabela, registro_id, usuario, descricao=None) -> None:
    antes = con.execute(f"SELECT * FROM {tabela} WHERE id = ?", (registro_id,)).fetchone()
    if antes is None:
        return
    imovel_id, contrato_id = _vinculos(con, tabela, antes)
    con.execute(f"DELETE FROM {tabela} WHERE id = ?", (registro_id,))
    registrar(con, usuario, "Exclusão", tabela, registro_id, descricao,
              {k: antes[k] for k in antes.keys() if antes[k] not in (None, "") and k != "senha_hash"},
              imovel_id, contrato_id)
    con.commit()
