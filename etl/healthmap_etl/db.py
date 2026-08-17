"""
Conexao direta ao PostgreSQL para o ETL.

ADR-001 #6 (docs/adr/001-architecture.md): "Python escreve no banco,
TypeScript le". O ETL NAO passa por packages/db - essa fronteira e exclusiva
da aplicacao TypeScript. Le o mesmo DATABASE_URL da raiz do monorepo (o
mesmo que Prisma/API usam), para nunca apontar para um banco diferente por
acidente.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
from dotenv import load_dotenv

_RAIZ_REPO = Path(__file__).resolve().parents[2]


def _carregar_env() -> None:
    load_dotenv(_RAIZ_REPO / ".env")


def _url_conexao() -> str:
    """
    DATABASE_URL do .env tem `?schema=public` (convencao do Prisma) - o
    psycopg/libpq nao reconhece esse parametro de query. O ETL nunca
    depende de search_path: todo SQL qualifica o schema explicitamente
    (silver./gold./meta.), entao a query string e simplesmente descartada.
    """
    _carregar_env()
    bruta = os.environ["DATABASE_URL"]
    partes = urlsplit(bruta)
    return urlunsplit((partes.scheme, partes.netloc, partes.path, "", ""))


def obter_conexao() -> psycopg.Connection:
    return psycopg.connect(_url_conexao())
