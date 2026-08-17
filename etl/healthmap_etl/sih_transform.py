"""
Funcoes puras de transformacao de registros individuais do SIH-RD (Sistema
de Informacoes Hospitalares, arquivo "reduzido" de AIH) para os conceitos do
schema do HealthMap. Deliberadamente sem dependencia de pandas/pysus - so
`str`/`int`/`re` - para que sejam testaveis em qualquer ambiente (inclusive
o Python do host, que nao consegue instalar pysus neste projeto - ver
etl/healthmap_etl/sources/sih.py) e para manter a logica de negocio
separada da orquestracao de I/O (download, leitura de parquet, escrita SQL).

Fonte dos campos: layout oficial do SIH-RD (dicionario de dados DATASUS/
PCDaS). Nenhum valor aqui e inventado - onde o dado de origem nao permite
classificar com confianca (ex.: COD_IDADE fora dos codigos documentados),
a funcao devolve None e o chamador deve REJEITAR o registro, nunca
adivinhar um valor.
"""

from __future__ import annotations

import re

_CID_ONCOLOGICO_RE = re.compile(r"^C(\d{2})\d*$")


def eh_cid_oncologico(diag_princ: str | None) -> bool:
    """
    Recorte C00-C97 (neoplasias malignas) ja estabelecido na Fase 2 -
    packages/db GrupoCid.codigoCidInicio='C00'/codigoCidFim='C97'. O SIH-RD
    grava DIAG_PRINC sem ponto (ex.: 'C509', 'C61') - o capitulo e sempre os
    2 digitos apos o 'C'.
    """
    if not diag_princ:
        return False
    m = _CID_ONCOLOGICO_RE.match(str(diag_princ).strip().upper())
    if not m:
        return False
    capitulo = int(m.group(1))
    return 0 <= capitulo <= 97


def mapear_sexo(codigo_sexo: str | None) -> str:
    """
    SEXO do SIH-RD: '1'=masculino, '3'=feminino (codificacao propria do
    SUS, nao e 1/2 como em outros sistemas). Qualquer outro valor (ausente,
    '0', ou codigo nao documentado) mapeia para o enum Sexo.IGNORADO ja
    existente no schema - nao e uma rejeicao, e a classificacao honesta
    para um valor que a propria fonte nao soube informar.
    """
    codigo = str(codigo_sexo).strip() if codigo_sexo is not None else ""
    if codigo == "1":
        return "MASCULINO"
    if codigo == "3":
        return "FEMININO"
    return "IGNORADO"


_FAIXAS_DECENAIS: list[tuple[int, int, str]] = [
    (0, 9, "FX_00_09"),
    (10, 19, "FX_10_19"),
    (20, 29, "FX_20_29"),
    (30, 39, "FX_30_39"),
    (40, 49, "FX_40_49"),
    (50, 59, "FX_50_59"),
    (60, 69, "FX_60_69"),
    (70, 79, "FX_70_79"),
]
_FAIXA_MAXIMA = "FX_80_MAIS"

# COD_IDADE documentado (dicionario SIH-RD, DATASUS/PCDaS): 0=ignorada,
# 2=dias, 3=meses, 4=anos. Qualquer outro codigo (ex.: '5', observado em
# ~0.04% dos registros de uma amostra real SP/2024-02) NAO esta documentado
# nesta fonte - tratado como indeterminado, nunca adivinhado.
_COD_IDADE_DIAS = "2"
_COD_IDADE_MESES = "3"
_COD_IDADE_ANOS = "4"


def calcular_faixa_etaria(cod_idade: str | None, idade: str | None) -> str | None:
    """
    Devolve a faixa decenal (FaixaEtaria, ja estabelecida na Fase 1) ou None
    quando o registro nao pode ser classificado com confianca - o chamador
    deve REJEITAR (nao incluir na agregacao), nunca supor uma faixa.
    """
    codigo = str(cod_idade).strip() if cod_idade is not None else ""
    if codigo in (_COD_IDADE_DIAS, _COD_IDADE_MESES):
        # Nascido ha menos de 1 ano - cai na faixa decenal mais baixa.
        return "FX_00_09"
    if codigo != _COD_IDADE_ANOS:
        return None  # '0' (ignorada) ou codigo nao documentado

    try:
        anos = int(str(idade).strip())
    except (TypeError, ValueError):
        return None
    if anos < 0:
        return None
    for minimo, maximo, faixa in _FAIXAS_DECENAIS:
        if minimo <= anos <= maximo:
            return faixa
    return _FAIXA_MAXIMA


def normalizar_codigo_municipio6(valor: str | int | None) -> str:
    """MUNIC_RES/MUNIC_MOV do SIH sao codigos IBGE de 6 digitos (sem o digito verificador do IBGE7)."""
    return str(valor).strip().zfill(6)


def extrair_ano_mes_competencia(ano_cmpt: str | int, mes_cmpt: str | int) -> tuple[int, int]:
    """ANO_CMPT/MES_CMPT do SIH-RD - competencia de processamento da AIH (nao a data de internacao/alta)."""
    return int(str(ano_cmpt).strip()), int(str(mes_cmpt).strip())
