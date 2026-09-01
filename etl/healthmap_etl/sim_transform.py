"""
Funcoes puras de transformacao de registros individuais do SIM (Sistema de
Informacoes sobre Mortalidade, grupo DO - Declaracao de Obito) para os
conceitos do schema do HealthMap. Mesma filosofia de sih_transform.py: sem
pandas/pysus, testavel em qualquer ambiente, nunca adivinha um valor que a
fonte nao permite classificar com confianca.

Recorte oncologico (C00-C97): REAPROVEITA eh_cid_oncologico de
sih_transform.py por import direto - o campo de origem (CAUSABAS no SIM,
DIAG_PRINC no SIH) tem o mesmo formato (CID-10 sem ponto, capitulo nos 2
digitos apos o 'C'), confirmado nesta fase contra dado real (C419, C189,
C01...) - nao ha motivo para uma segunda implementacao da mesma regra.

SEXO e IDADE tem encoding PROPRIO do SIM, diferente do SIH - confirmado
contra o arquivo real (SIM 2023, Brasil) antes de escrever este modulo,
nunca presumido a partir da convencao do SIH:
  - SEXO: '1'=masculino (803.200 no arquivo de referencia), '2'=feminino
    (661.884), '0'=ignorado (526). NAO e '1'/'3' como no SIH-RD.
  - IDADE: sempre 3 digitos. 1o digito = unidade: '0'-'3' = menos de 1 ano
    (minutos/horas/dias/meses - todos caem na faixa decenal mais baixa),
    '4' = anos (2 digitos seguintes, 00-99), '5' = anos 100+ (2 digitos
    seguintes + 100), '9' = idade ignorada (observado '999' no arquivo de
    referencia). Qualquer digito fora desse conjunto documentado -> None,
    o chamador rejeita, nunca adivinha.
"""

from __future__ import annotations

# Reaproveitada sem nenhuma mudanca - ver docstring do modulo.
from .sih_transform import eh_cid_oncologico  # noqa: F401

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

_IDADE_DIGITOS_MENOS_DE_1_ANO = {"0", "1", "2", "3"}
_IDADE_DIGITO_ANOS = "4"
_IDADE_DIGITO_ANOS_MAIS_100 = "5"


def mapear_sexo_sim(codigo_sexo: str | None) -> str:
    """SEXO do SIM: '1'=masculino, '2'=feminino - confirmado contra dado real (ver docstring do modulo). Resto -> IGNORADO."""
    codigo = str(codigo_sexo).strip() if codigo_sexo is not None else ""
    if codigo == "1":
        return "MASCULINO"
    if codigo == "2":
        return "FEMININO"
    return "IGNORADO"


def calcular_faixa_etaria_sim(idade: str | None) -> str | None:
    """
    IDADE do SIM (3 digitos, 1o = unidade) -> FaixaEtaria decenal, ou None
    se nao classificavel com confianca (o chamador deve REJEITAR o
    registro, nunca supor uma faixa).
    """
    codigo = str(idade).strip() if idade is not None else ""
    if len(codigo) != 3 or not codigo.isdigit():
        return None

    digito_unidade = codigo[0]
    if digito_unidade in _IDADE_DIGITOS_MENOS_DE_1_ANO:
        return "FX_00_09"

    if digito_unidade == _IDADE_DIGITO_ANOS:
        anos = int(codigo[1:])
    elif digito_unidade == _IDADE_DIGITO_ANOS_MAIS_100:
        anos = 100 + int(codigo[1:])
    else:
        return None  # '9' (ignorada) ou digito nao documentado

    for minimo, maximo, faixa in _FAIXAS_DECENAIS:
        if minimo <= anos <= maximo:
            return faixa
    return _FAIXA_MAXIMA


_LIMIAR_SUPRESSAO = 5


def esta_suprimido(quantidade: int) -> bool:
    """Regra de supressao n<5, identica a usada em FatoInternacaoResidencia/Local - centralizada aqui para ser testavel e reutilizada por ingest_sim.py."""
    return quantidade < _LIMIAR_SUPRESSAO


def deduplicar_por_chave_natural(registros: list[dict]) -> tuple[list[dict], int]:
    """
    Deduplica por (CODMUNRES, DTOBITO, SEXO, IDADE, CAUSABAS, HORAOBITO),
    mantendo a versao mais recentemente recebida - mesmo padrao (pure
    Python, lista de dicts) de cnes.py:deduplicar_hospitais, para ser
    testavel sem pandas/banco. Ordena por (DTRECEBIM, DTRECORIGA) desc antes
    de deduplicar; se as datas empatarem (caso real encontrado na validacao
    desta fase: duplicata identica, mesmas datas), mantem a primeira
    ocorrencia da ordenacao - resultado deterministico mesmo sem sinal de
    revisao para desempatar. Devolve (lista deduplicada, quantidade removida).
    """
    campos_chave = ("CODMUNRES", "DTOBITO", "SEXO", "IDADE", "CAUSABAS", "HORAOBITO")

    ordenados = sorted(
        registros,
        key=lambda r: (str(r.get("DTRECEBIM") or ""), str(r.get("DTRECORIGA") or "")),
        reverse=True,
    )

    vistos: set[tuple] = set()
    unicos: list[dict] = []
    for registro in ordenados:
        chave = tuple(registro.get(campo) for campo in campos_chave)
        if chave in vistos:
            continue
        vistos.add(chave)
        unicos.append(registro)

    removidos = len(registros) - len(unicos)
    return unicos, removidos


def normalizar_codigo_municipio6(valor: str | int | None) -> str:
    """CODMUNRES do SIM e codigo IBGE de 6 digitos - mesmo formato/semantica de MUNIC_RES no SIH."""
    return str(valor).strip().zfill(6)


def extrair_ano_mes_competencia(dtobito: str | None) -> tuple[int, int] | None:
    """
    DTOBITO (DDMMAAAA) e a PROPRIA competencia - o SIM nao tem a ambiguidade
    do SIH entre data do evento e competencia de processamento (nao ha
    ANO_CMPT/MES_CMPT separado). Confirmado contra o layout real (formato
    de 8 digitos, ex. '11102023'). Devolve None se o formato nao bater -
    o chamador rejeita, nunca adivinha a competencia.
    """
    valor = str(dtobito).strip() if dtobito is not None else ""
    if len(valor) != 8 or not valor.isdigit():
        return None
    mes = int(valor[2:4])
    ano = int(valor[4:8])
    if not (1 <= mes <= 12):
        return None
    return ano, mes
