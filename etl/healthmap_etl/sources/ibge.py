"""
Fonte: IBGE (Instituto Brasileiro de Geografia e Estatistica).

API de Localidades - documentacao oficial:
https://servicodados.ibge.gov.br/api/docs/localidades
API de Agregados (SIDRA) - documentacao oficial:
https://servicodados.ibge.gov.br/api/docs/agregados
Sem chave/autenticacao. Dado publico (Lei de Acesso a Informacao).
"""

from __future__ import annotations

import requests

_BASE_LOCALIDADES = "https://servicodados.ibge.gov.br/api/v1/localidades"
_BASE_MALHAS = "https://servicodados.ibge.gov.br/api/v3/malhas"
_BASE_AGREGADOS = "https://servicodados.ibge.gov.br/api/v3/agregados"
_TIMEOUT_SEGUNDOS = 30
_CODIGO_UF_SP = 35

# Tabela SIDRA 6579 ("Estimativas de Populacao Residente"), variavel 9324
# ("Populacao residente estimada") - publicada anualmente pelo IBGE para
# calculo do FPM, nivel municipio (N6). So o TOTAL por municipio/ano - sem
# quebra por idade/sexo (essa quebra so existe em ano de Censo, tabela 9514,
# nao ingerida nesta fase - ver etl/ingest_populacao.py).
_TABELA_POPULACAO_ESTIMADA = 6579
_VARIAVEL_POPULACAO_ESTIMADA = 9324


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


def _parse_populacao_estimada(corpo: list) -> list[dict]:
    """
    Logica pura de parsing da resposta da API de Agregados (separada da
    chamada de rede para ser testavel sem mock de HTTP - mesmo padrao de
    ingest_geografia.centroide_aproximado). Devolve uma linha por
    (municipio, ano) - so para as combinacoes em que a serie tem valor
    numerico: a API devolve "..." (ou outro marcador nao numerico) para
    ano/municipio sem estimativa publicada, tratado aqui como AUSENTE, nunca
    como zero ou interpolado.
    """
    if not corpo:
        return []
    linhas: list[dict] = []
    for serie_localidade in corpo[0]["resultados"][0]["series"]:
        codigo_ibge7 = serie_localidade["localidade"]["id"]
        for ano_str, valor_str in serie_localidade["serie"].items():
            valor = (valor_str or "").strip()
            if not valor.isdigit():
                continue
            linhas.append({"codigo_ibge7": codigo_ibge7, "ano": int(ano_str), "populacao_total": int(valor)})
    return linhas


def buscar_populacao_estimada_sp(anos: list[int]) -> list[dict]:
    """
    Estimativa anual de populacao residente por municipio de SP (tabela
    SIDRA 6579, variavel 9324).
    Fonte: GET /api/v3/agregados/6579/periodos/{anos}/variaveis/9324?localidades=N6[N3[35]]
    """
    if not anos:
        return []
    periodos = "|".join(str(ano) for ano in anos)
    resposta = requests.get(
        f"{_BASE_AGREGADOS}/{_TABELA_POPULACAO_ESTIMADA}/periodos/{periodos}/variaveis/{_VARIAVEL_POPULACAO_ESTIMADA}",
        params={"localidades": f"N6[N3[{_CODIGO_UF_SP}]]"},
        timeout=60,
    )
    resposta.raise_for_status()
    return _parse_populacao_estimada(resposta.json())
