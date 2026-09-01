"""
Fonte: CNES (Cadastro Nacional de Estabelecimentos de Saude), grupo LT
(Leitos) - Ministerio da Saude / DATASUS, via pySUS.

Diferente de `cnes.py` (API DEMAS, snapshot atual, sem historico por
competencia - ver docs/fase-5.1-relatorio.md #5), este modulo le o mesmo
espelho pySUS/DuckLake ja usado por `sih.py` (ver docstring la para o
bloqueio de ambiente/Windows, identico aqui: so funciona dentro do
container Linux `etl/docker/Dockerfile.cnes_historico`). O grupo LT tem
capacidade de leitos POR COMPETENCIA, desde Out/2005 - e o que falta para
Pressao Hospitalar Estimada REAL ter uma fonte de leitos na MESMA
competencia do SIH REAL (ver docs/sih-methodology.md #11.2).

Confirmado ao vivo nesta sessao (nao presumido), rodando dentro do
container: dataset "cnes" no catalogo DuckLake, path
`public/data/ftp/cnes/LT/{ANO}/{MES:02d}/{UF}/LT{UF}{AAMM}.parquet`. Arquivo
LT/SP existe para as 4 competencias de 2024 ja cobertas por SIH REAL
(02, 06, 08, 12).

Colunas relevantes do parquet (uma linha por estabelecimento x CODLEITO):
CNES, CODUFMUN (IBGE6), TP_LEITO, CODLEITO, QT_EXIST, QT_SUS, COMPETEN.
QT_SUS vem como STRING (formato fixo do DBC historico) - conversao numerica
e responsabilidade de quem agrega (`etl/ingest_cnes_historico.py`), nao
deste modulo.

TP_LEITO: dicionario oficial confirmado contra a ferramenta de indicadores
do proprio CNES (cnes2.datasus.gov.br/Mod_Ind_Tipo_Leito.asp) - 1=Cirurgico,
2=Clinico, 3=Complementar, 4=Obstetrico, 5=Pediatrico, 6=Outras
Especialidades, 7=Hospital Dia. O schema do produto (TipoLeito) so modela
CLINICO/CIRURGICO/UTI/OUTRO. "Complementar" (3) inclui leitos de UTI, mas
tambem outros leitos complementares (isolamento etc.) - distinguir UTI
exigiria o subcodigo CODLEITO, que a propria Portaria SAES/MS reclassificou
mais de uma vez (2019, 2023) e nao foi possivel confirmar com uma fonte
unica e estavel nesta sessao. Por isso, mesma decisao conservadora ja
tomada por `cnes.py` (DEMAS) ao nao ratear CLINICO/CIRURGICO sem base
documentada: aqui os codigos 3-7 mapeiam para OUTRO, nunca para UTI -
UTI so e gravada pela fonte DEMAS (`ingest_cnes.py`), onde a fonte
declara o campo diretamente, sem inferencia. Isso nao afeta a formula de
Pressao Hospitalar Estimada, que soma leitosSus de TODOS os tipoLeito por
municipio+competencia (packages/db: getAgregadoCapacidadeLeitos).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_PATH_LT_RE = re.compile(r"^public/data/ftp/cnes/LT/(\d{4})/(\d{2})/([A-Z]{2})/")

TP_LEITO_PARA_TIPO_LEITO: dict[str, str] = {
    "1": "CIRURGICO",
    "2": "CLINICO",
}
"""Codigos ausentes daqui (3,4,5,6,7) mapeiam para OUTRO - ver docstring do modulo."""


@dataclass(frozen=True)
class ArquivoCnesLt:
    path: str
    ano: int
    mes: int
    uf: str


async def listar_arquivos_lt(uf: str) -> list[ArquivoCnesLt]:
    """Lista os arquivos do grupo LT (leitos) disponiveis para uma UF no catalogo do pysus. Nao baixa nada."""
    from pysus.api._impl.databases import PySUS  # import local - so existe no container, ver docstring do modulo

    async with PySUS() as p:
        await p.get_ducklake()
        datasets = await p._ducklake.datasets()
        cnes_ds = next(d for d in datasets if d.name.lower() == "cnes")
        arquivos = await cnes_ds.query()

    encontrados: list[ArquivoCnesLt] = []
    for arquivo in arquivos:
        m = _PATH_LT_RE.match(str(arquivo.path))
        if not m:
            continue
        ano, mes, arquivo_uf = int(m.group(1)), int(m.group(2)), m.group(3)
        if arquivo_uf != uf.upper():
            continue
        encontrados.append(ArquivoCnesLt(path=str(arquivo.path), ano=ano, mes=mes, uf=arquivo_uf))
    return encontrados


async def baixar_arquivo_lt(caminho_catalogo: str) -> str:
    """Baixa um arquivo ja identificado por `listar_arquivos_lt` e devolve o caminho local do parquet."""
    from pysus.api._impl.databases import PySUS  # import local - ver docstring do modulo

    async with PySUS() as p:
        await p.get_ducklake()
        datasets = await p._ducklake.datasets()
        cnes_ds = next(d for d in datasets if d.name.lower() == "cnes")
        arquivos = await cnes_ds.query()
        alvo = next(a for a in arquivos if str(a.path) == caminho_catalogo)
        baixado = await p.download(alvo)
        return str(baixado.path)


def mapear_tipo_leito(tp_leito: str) -> str:
    """TP_LEITO (string, 1-7) -> TipoLeito do schema. Ver TP_LEITO_PARA_TIPO_LEITO acima."""
    return TP_LEITO_PARA_TIPO_LEITO.get(str(tp_leito), "OUTRO")
