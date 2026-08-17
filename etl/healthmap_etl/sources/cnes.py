"""
Fonte: CNES (Cadastro Nacional de Estabelecimentos de Saude), via DEMAS -
API de Dados Abertos do Ministerio da Saude.

Documentacao: https://apidadosabertos.saude.gov.br/v1/
Sem chave/autenticacao. Dado publico (Lei de Acesso a Informacao).

Duas limitacoes REAIS da propria API oficial, descobertas ao integrar
(nao sao escolhas deste projeto):
  1. `/assistencia-a-saude/hospitais-e-leitos` nao tem filtro `uf`
     funcional (retorna 500 Internal Server Error para qualquer valor) -
     e preciso paginar o Brasil inteiro e filtrar client-side.
  2. Esse mesmo endpoint nao devolve codigo CNES nem codigo IBGE do
     municipio preenchido (campo `codigo_ibge_do_municipio` sempre nulo
     nas amostras de SP verificadas) - o cruzamento com Municipio precisa
     ser por nome do municipio + UF, normalizado.
"""

from __future__ import annotations

import unicodedata

import requests

_BASE_URL = "https://apidadosabertos.saude.gov.br"
_TIMEOUT_SEGUNDOS = 30
_LIMITE_LEITOS_POR_PAGINA = 1000
_LIMITE_PAGINAS_LEITOS = 200  # tampa de seguranca (200k registros) - o dataset real tem ~17-20k
_LIMITE_ESTABELECIMENTOS_POR_PAGINA = 20  # maximo aceito pela API


def normalizar_nome_municipio(nome: str) -> str:
    """Maiusculas, sem acento, sem espaco extra - para cruzar nomes de fontes diferentes sem depender de grafia identica."""
    sem_acento = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode("ascii")
    return " ".join(sem_acento.upper().split())


def deduplicar_hospitais(registros: list[dict]) -> tuple[list[dict], int]:
    """
    Remove reaparicoes do mesmo hospital causadas pela paginacao instavel de
    /assistencia-a-saude/hospitais-e-leitos (ver docstring do modulo). A fonte
    nao devolve codigo CNES neste endpoint, entao a chave natural disponivel e
    nome + endereco + CEP. Devolve (registros_unicos, quantidade_removida).
    """
    vistos: set[tuple[object, ...]] = set()
    unicos: list[dict] = []
    for r in registros:
        chave = (r.get("nome_do_hospital"), r.get("enderco_do_hospital"), r.get("numero_do_cep_do_hospital"))
        if chave in vistos:
            continue
        vistos.add(chave)
        unicos.append(r)
    return unicos, len(registros) - len(unicos)


def buscar_hospitais_leitos_brasil() -> list[dict]:
    """
    Pagina o dataset nacional inteiro (o filtro `uf` da API esta quebrado -
    ver docstring do modulo). O chamador filtra por UF depois.
    """
    todos: list[dict] = []
    offset = 0
    for _ in range(_LIMITE_PAGINAS_LEITOS):
        resposta = requests.get(
            f"{_BASE_URL}/assistencia-a-saude/hospitais-e-leitos",
            params={"limit": _LIMITE_LEITOS_POR_PAGINA, "offset": offset},
            timeout=60,
        )
        resposta.raise_for_status()
        pagina = resposta.json().get("hospitais_leitos", [])
        if not pagina:
            break
        todos.extend(pagina)
        if len(pagina) < _LIMITE_LEITOS_POR_PAGINA:
            break
        offset += _LIMITE_LEITOS_POR_PAGINA
    return todos


def buscar_estabelecimentos_sp(*, max_paginas: int) -> list[dict]:
    """
    Amostra limitada de estabelecimentos CNES de SP (limite real da API:
    20 registros/pagina - cobertura exaustiva de SP exigiria centenas de
    paginas). `max_paginas` limita explicitamente o volume desta execucao -
    ver docs/fase-5-relatorio.md para o numero de paginas usado e a
    justificativa de nao ser cobertura completa.
    """
    todos: list[dict] = []
    offset = 0
    for _ in range(max_paginas):
        resposta = requests.get(
            f"{_BASE_URL}/cnes/estabelecimentos",
            params={"codigo_uf": 35, "limit": _LIMITE_ESTABELECIMENTOS_POR_PAGINA, "offset": offset},
            timeout=_TIMEOUT_SEGUNDOS,
        )
        resposta.raise_for_status()
        pagina = resposta.json().get("estabelecimentos", [])
        if not pagina:
            break
        todos.extend(pagina)
        if len(pagina) < _LIMITE_ESTABELECIMENTOS_POR_PAGINA:
            break
        offset += _LIMITE_ESTABELECIMENTOS_POR_PAGINA
    return todos
