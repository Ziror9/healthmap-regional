"""
Checks de qualidade reutilizaveis entre fontes REAL (secao 14 do pedido da
Fase 5). Cada funcao devolve (passou, detalhe) - nunca levanta excecao por
uma linha ruim isolada, para nao transformar toda inconsistencia em erro
fatal do pipeline inteiro (quem decide bloquear ou so alertar e o script de
ingestao, via lineage.registrar_qualidade_check com a severidade certa).

Implementa checks para geografia, CNES e (desde a segunda rodada da Fase 5)
SIH. Sexo/faixa-etaria/CID do SIH nao tem check dedicado aqui porque as
funcoes de healthmap_etl/sih_transform.py ja rejeitam (devolvem None/
IGNORADO) em vez de gravar um valor duvidoso - a validacao esta embutida na
propria transformacao, nao repetida aqui.
"""

from __future__ import annotations

import re

_IBGE7_RE = re.compile(r"^\d{7}$")
_CNES_RE = re.compile(r"^\d{7}$")

# Envelope aproximado do estado de Sao Paulo - usado so para pegar erro grosseiro
# de geocodificacao (ex.: coordenada trocada), nunca para validar limite exato.
_SP_LAT_MIN, _SP_LAT_MAX = -26.0, -19.0
_SP_LON_MIN, _SP_LON_MAX = -54.0, -43.0


def check_codigo_ibge7_sp(codigo: str) -> tuple[bool, str | None]:
    if not codigo or not _IBGE7_RE.match(codigo):
        return False, f"codigo IBGE7 fora do formato esperado (7 digitos numericos): {codigo!r}"
    if not codigo.startswith("35"):
        return False, f"codigo IBGE7 nao pertence a UF de Sao Paulo (prefixo 35): {codigo!r}"
    return True, None


def check_sem_duplicidade(chaves: list[str], rotulo: str) -> tuple[bool, str | None]:
    vistas: set[str] = set()
    duplicadas: set[str] = set()
    for chave in chaves:
        if chave in vistas:
            duplicadas.add(chave)
        vistas.add(chave)
    if duplicadas:
        amostra = sorted(duplicadas)[:10]
        return False, f"{len(duplicadas)} {rotulo}(s) duplicado(s), amostra: {amostra}"
    return True, None


def check_coordenada_dentro_sp(lat: float | None, lon: float | None) -> tuple[bool, str | None]:
    if lat is None or lon is None:
        return True, None  # campo opcional no schema - ausencia nao e erro de qualidade
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return False, f"coordenada fora do intervalo geografico valido: lat={lat}, lon={lon}"
    if not (_SP_LAT_MIN <= lat <= _SP_LAT_MAX) or not (_SP_LON_MIN <= lon <= _SP_LON_MAX):
        return False, f"coordenada fora da faixa esperada para SP: lat={lat}, lon={lon}"
    return True, None


def check_codigo_cnes(codigo: str) -> tuple[bool, str | None]:
    if not codigo or not _CNES_RE.match(codigo):
        return False, f"codigo CNES fora do formato esperado (7 digitos numericos): {codigo!r}"
    return True, None


def check_nao_negativo(valor: float | int | None, campo: str) -> tuple[bool, str | None]:
    if valor is not None and valor < 0:
        return False, f"{campo} negativo: {valor}"
    return True, None


def check_municipio_referenciado_existe(codigo_ibge: str | None, codigos_conhecidos: set[str]) -> tuple[bool, str | None]:
    if codigo_ibge is None:
        return False, "sem codigo de municipio associado"
    if codigo_ibge not in codigos_conhecidos:
        return False, f"municipio {codigo_ibge!r} nao encontrado na base de referencia (geografia)"
    return True, None


def check_competencia_arquivo_bate_com_registro(
    ano_arquivo: int, mes_arquivo: int, ano_registro: int, mes_registro: int
) -> tuple[bool, str | None]:
    """
    ANO_CMPT/MES_CMPT de cada registro do SIH-RD deveria bater com o
    ano/mes codificados no path do arquivo baixado (ex.: RDSP2402.parquet
    -> 2024/02) - discrepancia indicaria arquivo corrompido, renomeado
    incorretamente pela fonte, ou um registro de outra competencia
    misturado no arquivo (nao deveria acontecer, mas nao deve ser
    presumido sem checar).
    """
    if (ano_arquivo, mes_arquivo) != (ano_registro, mes_registro):
        return False, (
            f"competencia do registro ({ano_registro}-{mes_registro:02d}) diverge da "
            f"competencia do arquivo ({ano_arquivo}-{mes_arquivo:02d})"
        )
    return True, None
