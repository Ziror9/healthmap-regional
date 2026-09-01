"""
Fonte: SIM (Sistema de Informacoes sobre Mortalidade), grupo DO (Declaracao
de Obito) - Ministerio da Saude / DATASUS, via pySUS.

Mesmo mecanismo/bloqueio de ambiente ja documentado em
etl/healthmap_etl/sources/sih.py (pyreaddbc so tem wheel Linux) - so
funciona dentro de um container Linux dedicado
(etl/docker/Dockerfile.sim). Import de pysus deliberadamente local a
funcao, mesmo motivo.

Confirmado ao vivo nesta sessao (nao presumido): dataset "sim" no mesmo
catalogo DuckLake ja usado pelo SIH, caminho
`public/data/ftp/sim/DO/{ANO}/_/BR/DOBR{ANO}.parquet` - UM arquivo por ano,
BRASIL INTEIRO (diferente do SIH/CNES-LT, que ja vem por UF) - o filtro
para SP acontece depois de baixar, client-side, por CODMUNRES (ver
etl/ingest_sim.py). Catalogo cobre 1996-2024 neste mirror (ha tambem um
mirror mais recente, "dadosgov", com anos adicionais - nao usado aqui
porque o mirror "ftp" ja cobre o periodo desta fase).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ArquivoSimDo:
    path: str
    ano: int


async def listar_arquivos_do() -> list[ArquivoSimDo]:
    """Lista os arquivos do grupo DO (mirror ftp, Brasil inteiro por ano) disponiveis no catalogo do pysus. Nao baixa nada."""
    from pysus.api._impl.databases import PySUS  # import local - so existe no container, ver docstring do modulo

    async with PySUS() as p:
        await p.get_ducklake()
        datasets = await p._ducklake.datasets()
        sim_ds = next(d for d in datasets if d.name.lower() == "sim")
        arquivos = await sim_ds.query()

    encontrados: list[ArquivoSimDo] = []
    for arquivo in arquivos:
        caminho = str(arquivo.path)
        if not caminho.startswith("public/data/ftp/sim/DO/"):
            continue
        if not caminho.endswith("/BR/" + caminho.rsplit("/", 1)[-1]):
            continue
        partes = caminho.split("/")
        # public/data/ftp/sim/DO/{ANO}/_/BR/DOBR{ANO}.parquet
        try:
            ano = int(partes[5])
        except (IndexError, ValueError):
            continue
        encontrados.append(ArquivoSimDo(path=caminho, ano=ano))
    return encontrados


async def baixar_arquivo_do(caminho_catalogo: str) -> str:
    """Baixa um arquivo ja identificado por `listar_arquivos_do` e devolve o caminho local do parquet."""
    from pysus.api._impl.databases import PySUS  # import local - ver docstring do modulo

    async with PySUS() as p:
        await p.get_ducklake()
        datasets = await p._ducklake.datasets()
        sim_ds = next(d for d in datasets if d.name.lower() == "sim")
        arquivos = await sim_ds.query()
        alvo = next(a for a in arquivos if str(a.path) == caminho_catalogo)
        baixado = await p.download(alvo)
        return str(baixado.path)
