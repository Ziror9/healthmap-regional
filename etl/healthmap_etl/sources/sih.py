"""
Fonte: SIH/SUS (Sistema de Informacoes Hospitalares do SUS), arquivo
"reduzido" de AIH (grupo RD) - Ministerio da Saude / DATASUS.

Implementado na Fase 5 (segunda rodada) via pySUS
(https://github.com/AlertaDengue/PySUS), que hoje busca os arquivos de um
bucket S3 publico mantido pelo projeto pySUS (catalogo "DuckLake"), nao
mais do FTP historico do DATASUS diretamente - o pySUS documenta isso como
espelho oficial dos mesmos arquivos publicados pelo DATASUS
(https://datasus.saude.gov.br/transferencia-de-arquivos/).

BLOQUEIO DE AMBIENTE (nao removido, so contornado): a dependencia nativa do
pySUS (`pyreaddbc`, para ler o formato .dbc historico) nao tem wheel
pre-compilado para Windows em nenhuma versao de Python testada - so sdist,
que exige compilador C (Microsoft Visual C++ Build Tools, ausente neste
ambiente). `pyreaddbc` TEM wheel pre-compilado para Linux (manylinux,
confirmado para cp311 nesta sessao). Por isso este modulo (e o script
`etl/ingest_sih.py` que o usa) so funciona dentro do container Linux
descrito em `etl/docker/Dockerfile.sih` - nunca no Python principal do
host Windows deste projeto. O import de `pysus` abaixo e deliberadamente
LOCAL a funcao (nao no topo do modulo), para que este arquivo continue
importavel (e sua interface, legivel) no host mesmo sem pysus instalado.

Limitacao real do catalogo, descoberta ao inspecionar (nao presumida):
o filtro de metadados do pysus (`group=`/`state=` em `PySUS.query()`) nao
retorna nenhum arquivo nesta versao (2.8.0) - os campos correspondentes no
catalogo DuckLake estao vazios. Os arquivos existem (confirmado por listagem
completa do dataset "sih" e filtragem pelo proprio `path`, que codifica
grupo/UF/ano/mes: `public/data/ftp/sih/{GRUPO}/{ANO}/{MES}/{UF}/...parquet`)
- por isso `listar_arquivos_rd` abaixo filtra pelo path diretamente, nao usa
o filtro de alto nivel `sih()`/`query(group=..., state=...)` que se mostrou
silenciosamente vazio.

A cobertura do espelho tambem NAO e continua: nem todo mes entre o mais
antigo e o mais recente arquivo existe para SP/RD (verificado: 152 arquivos
SP/RD entre 1992-01 e 2026-02, de ate ~408 meses possiveis no periodo) - a
causa (lacuna real do DATASUS vs. espelho pySUS ainda incompleto) nao foi
determinada nesta sessao e nao deve ser presumida. `listar_arquivos_rd`
reporta exatamente o que existe; NUNCA preenche um mes ausente.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_PATH_RD_RE = re.compile(r"^public/data/ftp/sih/RD/(\d{4})/(\d{2})/([A-Z]{2})/")


@dataclass(frozen=True)
class ArquivoSihRd:
    path: str
    ano: int
    mes: int
    uf: str


async def listar_arquivos_rd(uf: str) -> list[ArquivoSihRd]:
    """
    Lista os arquivos do grupo RD (AIH reduzida) disponiveis para uma UF no
    catalogo do pysus, direto do `path` (ver docstring do modulo sobre por
    que o filtro de alto nivel do pysus nao e usado). Nao baixa nada.
    """
    from pysus.api._impl.databases import PySUS  # import local - ver docstring do modulo

    async with PySUS() as p:
        await p.get_ducklake()
        datasets = await p._ducklake.datasets()
        sih_ds = next(d for d in datasets if d.name.lower() == "sih")
        arquivos = await sih_ds.query()

    encontrados: list[ArquivoSihRd] = []
    for arquivo in arquivos:
        m = _PATH_RD_RE.match(str(arquivo.path))
        if not m:
            continue
        ano, mes, arquivo_uf = int(m.group(1)), int(m.group(2)), m.group(3)
        if arquivo_uf != uf.upper():
            continue
        encontrados.append(ArquivoSihRd(path=str(arquivo.path), ano=ano, mes=mes, uf=arquivo_uf))
    return encontrados


async def baixar_arquivo_rd(caminho_catalogo: str) -> str:
    """Baixa um arquivo ja identificado por `listar_arquivos_rd` e devolve o caminho local do parquet."""
    from pysus.api._impl.databases import PySUS  # import local - ver docstring do modulo

    async with PySUS() as p:
        await p.get_ducklake()
        datasets = await p._ducklake.datasets()
        sih_ds = next(d for d in datasets if d.name.lower() == "sih")
        arquivos = await sih_ds.query()
        alvo = next(a for a in arquivos if str(a.path) == caminho_catalogo)
        baixado = await p.download(alvo)
        return str(baixado.path)
