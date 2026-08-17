"""
Fonte: IBGE (Instituto Brasileiro de Geografia e Estatistica).

API de Localidades - documentacao oficial:
https://servicodados.ibge.gov.br/api/docs/localidades
Sem chave/autenticacao. Dado publico (Lei de Acesso a Informacao).
"""

from __future__ import annotations

import requests

_BASE_LOCALIDADES = "https://servicodados.ibge.gov.br/api/v1/localidades"
_BASE_MALHAS = "https://servicodados.ibge.gov.br/api/v3/malhas"
_TIMEOUT_SEGUNDOS = 30
_CODIGO_UF_SP = 35


def listar_municipios_sp() -> list[dict]:
    """
    Lista oficial dos 645 municipios de Sao Paulo, com codigo IBGE de 7
    digitos. Fonte: GET /api/v1/localidades/estados/35/municipios
    """
    resposta = requests.get(f"{_BASE_LOCALIDADES}/estados/{_CODIGO_UF_SP}/municipios", timeout=_TIMEOUT_SEGUNDOS)
    resposta.raise_for_status()
    return [{"codigo_ibge7": str(m["id"]), "nome": m["nome"]} for m in resposta.json()]


def buscar_malha_municipios_sp() -> dict:
    """
    GeoJSON com os limites territoriais dos 645 municipios de SP.
    Fonte: GET /api/v3/malhas/estados/35 (qualidade minima - suficiente
    para um mapa coropletico pequeno, arquivo final ~300KB em vez de
    varios MB da qualidade maxima).
    Cada feature.properties.codarea e o codigo IBGE de 7 digitos - mesma
    chave de Municipio.codigoIbge7.
    """
    parametros = {
        "formato": "application/vnd.geo+json",
        "qualidade": "minima",
        "intrarregiao": "municipio",
    }
    resposta = requests.get(f"{_BASE_MALHAS}/estados/{_CODIGO_UF_SP}", params=parametros, timeout=60)
    resposta.raise_for_status()
    return resposta.json()
