"""
Fonte: Departamentos Regionais de Saude (DRS) de Sao Paulo.

Diferente de ibge.py, esta fonte NAO e uma chamada de API ao vivo: e uma
tabela de referencia estatica e pequena (645 linhas), extraida uma vez de
um documento oficial e versionada em etl/reference-data/drs_sp_ibge.csv.
Justificativa e procedencia completas: etl/reference-data/README.md.

Reextrair a cada execucao do ETL a partir do PDF original nao traria mais
confiabilidade (a fonte e uma tabela de referencia que so muda se o
Decreto Estadual que define os DRS mudar) e tornaria o pipeline fragil a
disponibilidade continua daquele PDF especifico.
"""

from __future__ import annotations

import csv
from pathlib import Path

_CSV_PATH = Path(__file__).resolve().parents[2] / "reference-data" / "drs_sp_ibge.csv"


def carregar_drs_por_municipio() -> list[dict]:
    """Devolve uma linha por municipio: {codigo_ibge6, drs_numero, drs_nome}."""
    with _CSV_PATH.open(encoding="utf-8") as arquivo:
        return list(csv.DictReader(arquivo))


def listar_drs_distintos() -> list[dict]:
    """Os 17 DRS distintos (numero + nome), na ordem numerica."""
    linhas = carregar_drs_por_municipio()
    vistos: dict[str, str] = {}
    for linha in linhas:
        vistos[linha["drs_numero"]] = linha["drs_nome"]
    return [{"numero": numero, "nome": vistos[numero]} for numero in sorted(vistos)]
