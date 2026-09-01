"""
Fonte: IPVS (Indice Paulista de Vulnerabilidade Social), Fundacao SEADE -
unica fonte de vulnerabilidade social identificada para o produto
(docs/risk-methodology.md #2.4 - "fonte ainda nao definida" desde a Fase 0).

DECISAO EXPLICITA DESTA FASE (5.4), registrada aqui e em
docs/fase-5.4-relatorio.md porque muda a natureza do dado gravado:

1. O unico recurso maquina-legivel encontrado com a classificacao IPVS e um
   SHAPEFILE por SETOR CENSITARIO (nao municipio) - 645 municipios de SP se
   decompoem em ~103 mil setores. Nao existe, na sessao em que isso foi
   pesquisado, um recurso oficial da SEADE ja agregado por municipio pronto
   para uso.
2. A pagina do recurso (repositorio.seade.gov.br) nao declara licenca
   ("Nenhuma Licenca Fornecida") - diferente de toda outra fonte REAL deste
   projeto, que cita explicitamente "dado publico, Lei de Acesso a
   Informacao". Tratado aqui como dado publico do governo do estado de SP
   (mesma familia de fonte de drs_sp_ibge.csv), mas SEM reivindicar uma
   licenca que a fonte nao declarou.
3. Por isso o municipio NAO recebe o "grupo IPVS" de nenhum setor
   especifico (isso seria escolher um representante arbitrario) - recebe
   uma MEDIA PONDERADA POR POPULACAO do C_IPVS (1-7, ordinal) de todos os
   setores do municipio com classificacao valida, aprovada explicitamente
   pelo usuario como aproximacao aceitavel. Isso e um CALCULO deste
   projeto, nao um produto oficial da SEADE - por isso a natureza gravada e
   ESTIMATIVA, nunca OBSERVADO (ver ingest_vulnerabilidade.py).
4. Populacao por setor vem de um arquivo SEPARADO e mais recente
   ("Populacao e Domicilio por Setor Censitario", Censo 2022) - os codigos
   de setor desse arquivo tem um sufixo 'P' que o arquivo do IPVS nao tem;
   o cruzamento remove esse sufixo. Cobertura de cruzamento: ~90% dos
   setores de cada arquivo encontram par no outro (confirmado nesta sessao,
   nao presumido) - o resto (setores sem par) e excluido do calculo
   ponderado do municipio a que pertence, nunca zerado nem inventado.

Arquivos grandes demais para versionar (soma ~100MB) - baixados sob demanda
para HEALTHMAP_BRONZE_DIR (.env, default "./data/bronze/ipvs"), nunca
commitados (mesma regra de data/bronze/ em geral, etl/README.md regra 2).
"""

from __future__ import annotations

import csv
import os
import zipfile
from pathlib import Path

import requests
from dbfread import DBF

_URL_IPVS_ZIP = (
    "https://repositorio.seade.gov.br/dataset/2be01068-49cc-4cc1-85b8-38bd867aefc4/"
    "resource/35c74698-a368-4f0c-8f14-3694896a9d74/download/ipvs_2022.zip"
)
_URL_POPULACAO_SETORES_CSV = (
    "https://repositorio.seade.gov.br/dataset/102a9d33-350e-446c-b2b0-d6f19e9cb250/"
    "resource/81c2241b-2a21-48b2-a865-9bd40d1de24f/download/censo2022_setores_censitarios.csv"
)

_NOME_DBF = "IPVS_2022.dbf"
_NOME_ZIP = "ipvs_2022.zip"
_NOME_POP_CSV = "censo2022_setores_censitarios.csv"


def diretorio_bronze() -> Path:
    """HEALTHMAP_BRONZE_DIR (.env) ou ./data/bronze - nunca versionado (ver etl/README.md)."""
    base = os.environ.get("HEALTHMAP_BRONZE_DIR", "./data/bronze")
    return Path(base) / "ipvs"


def garantir_arquivos_bronze(diretorio: Path) -> tuple[Path, Path]:
    """Baixa (se ausente) o shapefile do IPVS e o CSV de populacao por setor. Devolve (caminho_dbf, caminho_pop_csv)."""
    diretorio.mkdir(parents=True, exist_ok=True)
    caminho_dbf = diretorio / _NOME_DBF
    caminho_pop = diretorio / _NOME_POP_CSV

    if not caminho_dbf.exists():
        caminho_zip = diretorio / _NOME_ZIP
        if not caminho_zip.exists():
            resposta = requests.get(_URL_IPVS_ZIP, timeout=180)
            resposta.raise_for_status()
            caminho_zip.write_bytes(resposta.content)
        with zipfile.ZipFile(caminho_zip) as zf:
            zf.extractall(diretorio)

    if not caminho_pop.exists():
        resposta = requests.get(_URL_POPULACAO_SETORES_CSV, timeout=120)
        resposta.raise_for_status()
        caminho_pop.write_bytes(resposta.content)

    return caminho_dbf, caminho_pop


def carregar_ipvs_por_setor(caminho_dbf: Path) -> dict[str, dict]:
    """{codigo_setor (15 digitos): {codigo_ibge7, c_ipvs (int|None)}}. c_ipvs=None = 'Nao classificado' na fonte."""
    tabela = DBF(str(caminho_dbf), encoding="latin1")
    resultado: dict[str, dict] = {}
    for registro in tabela:
        codigo_setor = str(registro["CD_SETOR"])
        c_ipvs = registro["C_IPVS"]
        resultado[codigo_setor] = {
            "codigo_ibge7": str(registro["CD_MUN"]),
            "c_ipvs": int(c_ipvs) if c_ipvs is not None else None,
        }
    return resultado


def carregar_populacao_por_setor(caminho_csv: Path) -> dict[str, int]:
    """{codigo_setor (15 digitos, sufixo 'P' removido): populacao (v0001, total de pessoas)}."""
    resultado: dict[str, int] = {}
    with caminho_csv.open(encoding="latin1") as arquivo:
        leitor = csv.DictReader(arquivo, delimiter=";")
        for linha in leitor:
            codigo_com_sufixo = linha["cd_setor"]
            codigo_setor = codigo_com_sufixo[:-1] if codigo_com_sufixo.endswith("P") else codigo_com_sufixo
            populacao_str = (linha.get("v0001") or "").strip()
            if not populacao_str.isdigit():
                continue
            resultado[codigo_setor] = int(populacao_str)
    return resultado


def calcular_ipvs_ponderado_por_municipio(
    ipvs_por_setor: dict[str, dict],
    populacao_por_setor: dict[str, int],
) -> list[dict]:
    """
    Media ponderada por populacao do C_IPVS (1-7) por municipio - logica pura,
    separada do I/O para ser testavel sem os arquivos reais (ver
    etl/tests/test_vulnerabilidade.py). So entram setores com C_IPVS
    classificado E populacao conhecida (cruzamento por codigo de setor) -
    setores sem par em algum dos dois arquivos sao excluidos do calculo do
    seu municipio, nunca tratados como peso zero silencioso nem inventados.

    Devolve uma linha por municipio: {codigo_ibge7, valor (media ponderada),
    populacao_usada (soma dos pesos), setores_usados, setores_no_municipio
    (total de setores do municipio no arquivo IPVS, classificados ou nao -
    para dar visibilidade da cobertura real do calculo)}.
    """
    acumulado: dict[str, dict] = {}
    setores_no_municipio: dict[str, int] = {}

    for codigo_setor, dados_ipvs in ipvs_por_setor.items():
        codigo_ibge7 = dados_ipvs["codigo_ibge7"]
        setores_no_municipio[codigo_ibge7] = setores_no_municipio.get(codigo_ibge7, 0) + 1

        c_ipvs = dados_ipvs["c_ipvs"]
        populacao = populacao_por_setor.get(codigo_setor)
        if c_ipvs is None or populacao is None or populacao <= 0:
            continue

        bucket = acumulado.setdefault(codigo_ibge7, {"soma_ponderada": 0.0, "populacao_usada": 0, "setores_usados": 0})
        bucket["soma_ponderada"] += c_ipvs * populacao
        bucket["populacao_usada"] += populacao
        bucket["setores_usados"] += 1

    linhas: list[dict] = []
    for codigo_ibge7, bucket in acumulado.items():
        if bucket["populacao_usada"] <= 0:
            continue
        linhas.append(
            {
                "codigo_ibge7": codigo_ibge7,
                "valor": bucket["soma_ponderada"] / bucket["populacao_usada"],
                "populacao_usada": bucket["populacao_usada"],
                "setores_usados": bucket["setores_usados"],
                "setores_no_municipio": setores_no_municipio[codigo_ibge7],
            }
        )
    return linhas
