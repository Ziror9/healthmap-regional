"""
Ingestao REAL de capacidade de leitos POR COMPETENCIA (CNES, grupo LT, via
pySUS) - complementa `etl/ingest_cnes.py` (fonte DEMAS, so snapshot atual).

SO RODA DENTRO DO CONTAINER LINUX descrito em
etl/docker/Dockerfile.cnes_historico - mesmo bloqueio de pyreaddbc/Windows
do SIH (ver etl/healthmap_etl/sources/sih.py). Uso, a partir da raiz do
repositorio:

    docker build -f etl/docker/Dockerfile.cnes_historico -t healthmap-etl-cnes-historico .
    docker run --rm --env-file .env healthmap-etl-cnes-historico
    (.env deve apontar DATABASE_URL para host.docker.internal, nao localhost)

Por que isso importa: Pressao Hospitalar Estimada REAL precisa de SIH e
CNES na MESMA competencia (docs/sih-methodology.md #11.2) - a fonte DEMAS
usada em ingest_cnes.py so da um snapshot preso ao mes da ingestao, nunca
uma competencia passada. O grupo LT do CNES tem historico desde Out/2005,
o que finalmente permite casar leitos com as competencias que ja tem SIH
REAL (2024-02, 06, 08, 12 - mesma lista de etl/ingest_sih.py).

Grao de carga: municipio x competencia x tipoLeito (mesma chave natural de
FatoCapacidadeLeitos, ja usada por ingest_cnes.py) - agregado a partir de
linhas por estabelecimento x CODLEITO do arquivo LT. leitosSus = soma de
QT_SUS; leitosTotais = soma de QT_EXIST. Sem coluna de supressao nesta
tabela (capacidade operacional de estabelecimento, nao contagem de
pacientes - mesma decisao ja tomada pelo schema para ingest_cnes.py).

Idempotente: upsert por chave natural. Reexecutar para a mesma competencia
converge, nao duplica.

FASE 5.5: alem de FatoCapacidadeLeitos (por municipio), este script tambem
agrega o mesmo parquet por REGIAO DE SAUDE (FatoCapacidadeLeitosRegional).
Sem supressao aqui tambem (capacidade operacional, nao contagem de
pacientes) - ver docs/fase-5.5-relatorio.md.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pandas as pd  # noqa: E402
import psycopg  # noqa: E402

from healthmap_etl import db, lineage, quality  # noqa: E402
from healthmap_etl.sources import cnes_pysus  # noqa: E402

VERSAO_PIPELINE = "ingest-cnes-historico@1.0.0"
FONTE_CNES_HISTORICO = "DATASUS_CNES_LT"
UF = "SP"

# Mesmas competencias ja cobertas por SIH REAL (etl/ingest_sih.py) - e
# exatamente a sobreposicao que faltava para Pressao Hospitalar Estimada
# REAL (docs/sih-methodology.md #11.2). Ampliar exige so adicionar aqui E
# rodar etl/ingest_sih.py para a mesma competencia nova.
COMPETENCIAS_ALVO: list[tuple[int, int]] = [(2024, 2), (2024, 6), (2024, 8), (2024, 12)]

_COLUNAS_NECESSARIAS = ["CNES", "CODUFMUN", "TP_LEITO", "CODLEITO", "QT_SUS", "QT_EXIST"]


def obter_ou_criar_competencia(conn: psycopg.Connection, ano: int, mes: int) -> int:
    import calendar
    from datetime import date

    dias_no_mes = calendar.monthrange(ano, mes)[1]
    data_ref = date(ano, mes, 1)
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO silver."Competencia" (ano, mes, "dataRef", "diasNoMes")
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (ano, mes) DO UPDATE SET "diasNoMes" = EXCLUDED."diasNoMes"
            RETURNING id
            """,
            (ano, mes, data_ref, dias_no_mes),
        )
        row = cur.fetchone()
        assert row is not None
        return row[0]


def preparar_dataframe(caminho_parquet: str) -> tuple[pd.DataFrame, dict]:
    """Le o parquet LT e converte campos numericos (vem como string do DBC) - devolve o dataframe LIMPO por linha (CNES x CODLEITO), antes de qualquer agregacao, para ser reaproveitado no grao municipio e no grao regional (Fase 5.5)."""
    bruto = pd.read_parquet(caminho_parquet, columns=_COLUNAS_NECESSARIAS)
    total_bruto = len(bruto)

    duplicadas = int(bruto.duplicated(subset=["CNES", "CODLEITO"]).sum())
    if duplicadas:
        bruto = bruto.drop_duplicates(subset=["CNES", "CODLEITO"], keep="first")

    qt_sus_num = pd.to_numeric(bruto["QT_SUS"], errors="coerce")
    qt_exist_num = pd.to_numeric(bruto["QT_EXIST"], errors="coerce")
    sus_nao_numerico = int(qt_sus_num.isna().sum())
    exist_nao_numerico = int(qt_exist_num.isna().sum())

    limpo = bruto.assign(
        qtSus=qt_sus_num.fillna(0).clip(lower=0),
        qtExist=qt_exist_num.fillna(0).clip(lower=0),
        tipoLeito=bruto["TP_LEITO"].apply(cnes_pysus.mapear_tipo_leito),
        codigoIbge6=bruto["CODUFMUN"].astype(str).str.strip(),
    )

    estatisticas = {
        "total_bruto": total_bruto,
        "duplicadas_cnes_codleito_removidas": duplicadas,
        "qt_sus_nao_numerico": sus_nao_numerico,
        "qt_exist_nao_numerico": exist_nao_numerico,
    }
    return limpo, estatisticas


def agregar_por_municipio(limpo: pd.DataFrame) -> pd.DataFrame:
    agregado = limpo.groupby(["codigoIbge6", "tipoLeito"], as_index=False).agg(
        leitosSus=("qtSus", "sum"), leitosTotais=("qtExist", "sum")
    )
    agregado["leitosSus"] = agregado["leitosSus"].round().astype(int)
    agregado["leitosTotais"] = agregado["leitosTotais"].round().astype(int)
    return agregado


def agregar_por_regiao(limpo: pd.DataFrame, regiao_id_por_codigo6: dict[str, int]) -> tuple[pd.DataFrame, int]:
    """Mesmo dataframe limpo, agregado por RegiaoSaude em vez de municipio - grao independente (Fase 5.5)."""
    com_regiao = limpo.assign(regiaoSaudeId=limpo["codigoIbge6"].map(regiao_id_por_codigo6))
    sem_regiao = int(com_regiao["regiaoSaudeId"].isna().sum())
    com_regiao = com_regiao[com_regiao["regiaoSaudeId"].notna()]
    if com_regiao.empty:
        return com_regiao, sem_regiao

    agregado = com_regiao.groupby(["regiaoSaudeId", "tipoLeito"], as_index=False).agg(
        leitosSus=("qtSus", "sum"), leitosTotais=("qtExist", "sum")
    )
    agregado["regiaoSaudeId"] = agregado["regiaoSaudeId"].astype(int)
    agregado["leitosSus"] = agregado["leitosSus"].round().astype(int)
    agregado["leitosTotais"] = agregado["leitosTotais"].round().astype(int)
    return agregado, sem_regiao


def gravar(conn: psycopg.Connection, agregado: pd.DataFrame, competencia_id: int, execucao_id: str, municipio_id_por_codigo6: dict[str, int]) -> tuple[int, int]:
    agora = datetime.now(timezone.utc)
    gravados = 0
    rejeitados = 0
    with conn.cursor() as cur:
        for linha in agregado.itertuples(index=False):
            municipio_id = municipio_id_por_codigo6.get(linha.codigoIbge6)
            if municipio_id is None:
                rejeitados += 1
                continue
            ok_sus, det_sus = quality.check_nao_negativo(int(linha.leitosSus), "leitosSus")
            ok_tot, det_tot = quality.check_nao_negativo(int(linha.leitosTotais), "leitosTotais")
            if not (ok_sus and ok_tot):
                rejeitados += 1
                lineage.registrar_qualidade_check(
                    conn, execucao_id=execucao_id, regra="cnes_historico_leitos_nao_negativo",
                    severidade="BLOQUEANTE", passou=False, linhas_afetadas=1, detalhe=det_sus or det_tot,
                )
                continue
            cur.execute(
                """
                INSERT INTO gold."FatoCapacidadeLeitos"
                    ("municipioInternacaoId", "competenciaId", "tipoLeito", "leitosSus", "leitosTotais", origem, "execucaoId", "updatedAt")
                VALUES (%s, %s, %s::gold."TipoLeito", %s, %s, 'REAL', %s, %s)
                ON CONFLICT ("municipioInternacaoId", "competenciaId", "tipoLeito") DO UPDATE SET
                    "leitosSus" = EXCLUDED."leitosSus",
                    "leitosTotais" = EXCLUDED."leitosTotais",
                    origem = EXCLUDED.origem,
                    "execucaoId" = EXCLUDED."execucaoId",
                    "updatedAt" = EXCLUDED."updatedAt"
                """,
                (municipio_id, competencia_id, linha.tipoLeito, int(linha.leitosSus), int(linha.leitosTotais), execucao_id, agora),
            )
            gravados += 1
    return gravados, rejeitados


def gravar_regional(conn: psycopg.Connection, agregado: pd.DataFrame, competencia_id: int, execucao_id: str) -> int:
    agora = datetime.now(timezone.utc)
    gravados = 0
    with conn.cursor() as cur:
        for linha in agregado.itertuples(index=False):
            cur.execute(
                """
                INSERT INTO gold."FatoCapacidadeLeitosRegional"
                    ("regiaoSaudeInternacaoId", "competenciaId", "tipoLeito", "leitosSus", "leitosTotais", origem, "execucaoId", "updatedAt")
                VALUES (%s, %s, %s::gold."TipoLeito", %s, %s, 'REAL', %s, %s)
                ON CONFLICT ("regiaoSaudeInternacaoId", "competenciaId", "tipoLeito") DO UPDATE SET
                    "leitosSus" = EXCLUDED."leitosSus",
                    "leitosTotais" = EXCLUDED."leitosTotais",
                    origem = EXCLUDED.origem,
                    "execucaoId" = EXCLUDED."execucaoId",
                    "updatedAt" = EXCLUDED."updatedAt"
                """,
                (int(linha.regiaoSaudeId), competencia_id, linha.tipoLeito, int(linha.leitosSus), int(linha.leitosTotais), execucao_id, agora),
            )
            gravados += 1
    return gravados


def run() -> None:
    conn = db.obter_conexao()
    try:
        lineage.upsert_fonte_dados(
            conn,
            chave=FONTE_CNES_HISTORICO,
            nome="CNES - Cadastro Nacional de Estabelecimentos de Saude, grupo LT (Leitos), via pySUS/DATASUS",
            url="https://cnes.datasus.gov.br/",
            licenca="Dado publico (Lei de Acesso a Informacao 12.527/2011)",
            periodicidade="Mensal (historico desde Out/2005)",
        )
        conn.commit()

        with conn.cursor() as cur:
            cur.execute('SELECT id, "codigoIbge6" FROM silver."Municipio" WHERE "codigoIbge7" LIKE %s', ("35%",))
            municipio_id_por_codigo6 = {codigo6: mid for mid, codigo6 in cur.fetchall()}
            cur.execute('SELECT "codigoIbge6", "regiaoSaudeId" FROM silver."Municipio" WHERE "codigoIbge7" LIKE %s', ("35%",))
            regiao_id_por_codigo6 = {codigo6: regiao_id for codigo6, regiao_id in cur.fetchall()}
        print(f"[cnes-historico] {len(municipio_id_por_codigo6)} municipios REAL carregados para cruzamento por codigo IBGE6")

        print(f"[cnes-historico] listando arquivos LT disponiveis para {UF} no catalogo pysus...")
        arquivos_disponiveis = asyncio.run(cnes_pysus.listar_arquivos_lt(UF))
        print(f"[cnes-historico] {len(arquivos_disponiveis)} arquivos LT/{UF} encontrados no catalogo (todas as competencias)")

        resumo_geral = {
            "competencias_solicitadas": len(COMPETENCIAS_ALVO),
            "competencias_encontradas_no_catalogo": 0,
            "competencias_ausentes_no_catalogo": [],
            "linhas_gravadas": 0,
            "linhas_rejeitadas": 0,
        }

        for ano, mes in COMPETENCIAS_ALVO:
            alvo = next((a for a in arquivos_disponiveis if a.ano == ano and a.mes == mes), None)
            if alvo is None:
                print(f"[cnes-historico] competencia {ano}-{mes:02d}: AUSENTE no catalogo espelhado pelo pysus - pulando (nao inventado)")
                resumo_geral["competencias_ausentes_no_catalogo"].append(f"{ano}-{mes:02d}")
                continue
            resumo_geral["competencias_encontradas_no_catalogo"] += 1

            print(f"[cnes-historico] competencia {ano}-{mes:02d}: baixando {alvo.path}...")
            caminho_local = asyncio.run(cnes_pysus.baixar_arquivo_lt(alvo.path))

            print(f"[cnes-historico] competencia {ano}-{mes:02d}: lendo e agregando...")
            limpo, estatisticas = preparar_dataframe(caminho_local)
            agregado = agregar_por_municipio(limpo)
            estatisticas["linhas_agregadas_municipio_tipo"] = len(agregado)
            print(f"[cnes-historico] competencia {ano}-{mes:02d}: {estatisticas}")

            competencia_id = obter_ou_criar_competencia(conn, ano, mes)
            execucao = lineage.iniciar_execucao(
                conn, fonte_dados_chave=FONTE_CNES_HISTORICO, competencia_id=competencia_id, versao_pipeline=VERSAO_PIPELINE
            )

            lineage.registrar_qualidade_check(
                conn, execucao_id=execucao.id, regra="cnes_historico_sem_duplicidade_cnes_codleito",
                severidade="ALERTA", passou=estatisticas["duplicadas_cnes_codleito_removidas"] == 0,
                linhas_afetadas=estatisticas["duplicadas_cnes_codleito_removidas"],
                detalhe=f"{estatisticas['duplicadas_cnes_codleito_removidas']} linha(s) duplicada(s) (CNES+CODLEITO) removida(s)"
                if estatisticas["duplicadas_cnes_codleito_removidas"] else None,
            )
            lineage.registrar_qualidade_check(
                conn, execucao_id=execucao.id, regra="cnes_historico_qt_sus_numerico",
                severidade="ALERTA", passou=estatisticas["qt_sus_nao_numerico"] == 0,
                linhas_afetadas=estatisticas["qt_sus_nao_numerico"],
                detalhe=f"{estatisticas['qt_sus_nao_numerico']} valor(es) de QT_SUS nao numerico(s), tratado(s) como 0"
                if estatisticas["qt_sus_nao_numerico"] else None,
            )

            gravados, rejeitados = gravar(conn, agregado, competencia_id, execucao.id, municipio_id_por_codigo6)

            execucao.linhas_processadas = gravados
            execucao.linhas_rejeitadas = rejeitados
            execucao.finalizar(status="SUCESSO" if rejeitados == 0 else "PARCIAL")
            conn.commit()

            print(f"[cnes-historico] competencia {ano}-{mes:02d}: FatoCapacidadeLeitos={gravados} linhas gravadas, {rejeitados} rejeitadas")
            resumo_geral["linhas_gravadas"] += gravados
            resumo_geral["linhas_rejeitadas"] += rejeitados

            # Fase 5.5: mesmo dataframe limpo, agregado por RegiaoSaude - execucao propria (mesma logica de ingest_sih.py).
            agregado_regional, sem_regiao = agregar_por_regiao(limpo, regiao_id_por_codigo6)
            execucao_regional = lineage.iniciar_execucao(
                conn, fonte_dados_chave=FONTE_CNES_HISTORICO, competencia_id=competencia_id, versao_pipeline=VERSAO_PIPELINE
            )
            lineage.registrar_qualidade_check(
                conn, execucao_id=execucao_regional.id, regra="cnes_historico_regiao_conhecida",
                severidade="ALERTA", passou=sem_regiao == 0, linhas_afetadas=sem_regiao,
                detalhe=f"{sem_regiao} linha(s) sem regiao de saude mapeada" if sem_regiao else None,
            )
            gravados_regional = gravar_regional(conn, agregado_regional, competencia_id, execucao_regional.id)
            execucao_regional.linhas_processadas = gravados_regional
            execucao_regional.linhas_rejeitadas = sem_regiao
            execucao_regional.finalizar(status="SUCESSO" if sem_regiao == 0 else "PARCIAL")
            conn.commit()
            print(f"[cnes-historico] competencia {ano}-{mes:02d}: [REGIONAL] FatoCapacidadeLeitosRegional={gravados_regional} linhas gravadas")

        print("[cnes-historico] resumo final:")
        for chave, valor in resumo_geral.items():
            print(f"  {chave}: {valor}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run()
