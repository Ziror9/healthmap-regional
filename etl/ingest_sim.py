"""
Ingestao REAL de mortalidade oncologica (SIM/DATASUS, grupo DO, via pySUS) -
Fase 5.6. Alimenta gold.FatoObitoResidencia, insumo do indicador
TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB (ver calculate-indicadores-mortalidade-real.ts).

SO RODA DENTRO DO CONTAINER LINUX descrito em etl/docker/Dockerfile.sim -
mesmo bloqueio de pyreaddbc/Windows do SIH (ver etl/healthmap_etl/sources/sih.py).
Uso, a partir da raiz do repositorio:

    docker build -f etl/docker/Dockerfile.sim -t healthmap-etl-sim .
    docker run --rm --env-file .env healthmap-etl-sim
    (.env deve apontar DATABASE_URL para host.docker.internal, nao localhost)

Diferenca de grao em relacao ao SIH: o SIM disponibiliza UM arquivo por ANO,
BRASIL INTEIRO (nao por UF/mes como SIH-RD/CNES-LT) - as 12 competencias de
um ano estao todas dentro do mesmo arquivo, distinguidas por DTOBITO. O
filtro para SP e o recorte por competencia acontecem depois do download,
client-side.

Pipeline (nesta ordem - decisao registrada em docs/fase-5.6-relatorio.md):
  1. baixar arquivo do ano (Brasil inteiro);
  2. filtrar CAUSABAS oncologico (C00-C97, mesma funcao do SIH) + SP (CODMUNRES prefixo 35);
  3. deduplicar pela chave natural (CODMUNRES, DTOBITO, SEXO, IDADE, CAUSABAS, HORAOBITO),
     ordenado por DTRECEBIM desc / DTRECORIGA desc, keep='first' (cobre tanto
     revisao real quanto duplicata identica - ver validacao desta fase);
  4. validar municipio (CODMUNRES sem par em silver.Municipio -> rejeitar, ALERTA,
     nunca um "if == 350000" hardcoded - qualquer codigo sem correspondencia cai aqui);
  5. derivar o ano do obito a partir de DTOBITO (sim_transform.py - registro nao
     classificavel -> rejeitado, nunca adivinhado);
  6. agregar por municipio x ano (grupoCid fixo, TODAS_NEOPLASIAS_MALIGNAS) -
     grao ANUAL, decisao tomada apos a supressao fina (competencia x faixaEtaria
     x sexo) ter suprimido quase todos os municipios mesmo com totais anuais
     robustos (celulas finas com poucos obitos sao a norma, nao a excecao,
     nesta causa de obito) - ver docs/fase-5.6-relatorio.md;
  7. suprimir n<5 uma unica vez, sobre o total anual ja agregado (mesma regra
     de FatoInternacaoResidencia, decidida no grao final, nao herdada de uma
     agregacao mais fina);
  8. gravar gold.FatoObitoResidencia, upsert por chave natural (idempotente).

sim_transform.py tambem expõe mapear_sexo_sim/calcular_faixa_etaria_sim,
testadas e mantidas como referencia reutilizavel, mas NAO chamadas por este
pipeline - o grao gravado nao tem faixaEtaria/sexo (ver decisao acima).

TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB e OBSERVADO e NUNCA entra no RiskScore -
este script so grava o FATO (insumo); o calculo do indicador e responsabilidade
exclusiva de calculate-indicadores-mortalidade-real.ts (packages/risk), e nada
aqui toca RiskConfig/RiskComponenteValor/RiskScore.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pandas as pd  # noqa: E402
import psycopg  # noqa: E402

from healthmap_etl import db, lineage, quality, sim_transform  # noqa: E402
from healthmap_etl.sources import sim_pysus  # noqa: E402

VERSAO_PIPELINE = "ingest-sim@1.0.0"
FONTE_SIM = "DATASUS_SIM_DO"
UF_PREFIXO_IBGE = "35"  # Sao Paulo

# Fase 5.6: 2023 e o ano validado nas 3 rodadas de investigacao desta fase.
# 2024 adicionado depois: o IBGE (tabela 6579, ver etl/ingest_populacao.py)
# NAO publica estimativa de populacao para 2023 (confirmado - resposta
# vazia da API, ano de transicao pos-Censo 2022) - sem populacao 2023,
# TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB nao tem denominador para esse ano.
# 2023 continua carregado (fatos REAL validos, uteis por si so), mas o
# indicador so fica calculavel a partir de 2024. Ampliar para outros anos e
# so adicionar aqui - mesma mecanica de COMPETENCIAS_POC do SIH.
ANOS_ALVO: list[int] = [2023, 2024]

_COLUNAS_NECESSARIAS = [
    "CODMUNRES", "DTOBITO", "HORAOBITO", "SEXO", "IDADE", "CAUSABAS",
    "DTRECEBIM", "DTRECORIGA",
]


def carregar_filtrar_deduplicar(caminho_parquet: str) -> tuple[pd.DataFrame, dict]:
    """Le o parquet nacional, filtra oncologico+SP, deduplica pela chave natural. Devolve (dataframe, estatisticas)."""
    bruto = pd.read_parquet(caminho_parquet, columns=_COLUNAS_NECESSARIAS)
    total_bruto = len(bruto)

    sp = bruto[bruto["CODMUNRES"].astype(str).str.startswith(UF_PREFIXO_IBGE)].copy()
    onco_sp = sp[sp["CAUSABAS"].apply(sim_transform.eh_cid_oncologico)].copy()
    total_onco_sp = len(onco_sp)

    # Dedup via funcao pura (healthmap_etl/sim_transform.py) - mesma regra
    # testada em etl/tests/test_sim_transform.py, nenhuma segunda
    # implementacao aqui.
    registros_unicos, duplicados = sim_transform.deduplicar_por_chave_natural(onco_sp.to_dict("records"))
    deduplicado = pd.DataFrame.from_records(registros_unicos) if registros_unicos else onco_sp.iloc[0:0]

    estatisticas = {
        "total_bruto_brasil": total_bruto,
        "total_oncologico_sp_pre_dedup": total_onco_sp,
        "duplicados_removidos": duplicados,
        "total_oncologico_sp_pos_dedup": len(deduplicado),
    }
    return deduplicado, estatisticas


def transformar(df: pd.DataFrame, municipio_id_por_codigo6: dict[str, int]) -> tuple[pd.DataFrame, dict]:
    """Valida municipio + deriva o ano do obito (DTOBITO). Linhas nao classificaveis sao rejeitadas (nunca adivinhadas)."""
    df = df.copy()
    df["codigoIbge6"] = df["CODMUNRES"].apply(sim_transform.normalizar_codigo_municipio6)
    df["municipioId"] = df["codigoIbge6"].map(municipio_id_por_codigo6)
    sem_municipio = df[df["municipioId"].isna()]["codigoIbge6"].tolist()

    df["competencia"] = df["DTOBITO"].apply(sim_transform.extrair_ano_mes_competencia)
    sem_data_obito = int(df["competencia"].isna().sum())

    valido = df[df["municipioId"].notna() & df["competencia"].notna()].copy()
    valido["municipioId"] = valido["municipioId"].astype(int)
    valido["ano"] = valido["competencia"].apply(lambda c: c[0])

    estatisticas = {
        "sem_municipio_correspondente": sorted(set(sem_municipio)),
        "sem_data_obito_valida": sem_data_obito,
        "validos_para_agregacao": len(valido),
        "rejeitados_total": len(df) - len(valido),
    }
    return valido, estatisticas


def agregar(valido: pd.DataFrame) -> pd.DataFrame:
    """Grao ANUAL: municipio x ano (grupoCid fixo) - soma direta dos obitos individuais, sem quebra por competencia/faixaEtaria/sexo."""
    return (
        valido.groupby(["ano", "municipioId"], as_index=False)
        .size()
        .rename(columns={"size": "obitos"})
    )


def gravar(conn: psycopg.Connection, agregado_ano: pd.DataFrame, grupo_cid_id: int, execucao_id: str) -> tuple[int, int]:
    agora = datetime.now(timezone.utc)
    gravados = 0
    rejeitados = 0
    with conn.cursor() as cur:
        for linha in agregado_ano.itertuples(index=False):
            suprimido = sim_transform.esta_suprimido(int(linha.obitos))
            if not suprimido:
                ok, detalhe = quality.check_nao_negativo(int(linha.obitos), "obitos")
                if not ok:
                    rejeitados += 1
                    lineage.registrar_qualidade_check(
                        conn, execucao_id=execucao_id, regra="sim_obitos_nao_negativo",
                        severidade="BLOQUEANTE", passou=False, linhas_afetadas=1, detalhe=detalhe,
                    )
                    continue
            cur.execute(
                """
                INSERT INTO gold."FatoObitoResidencia"
                    ("municipioResidenciaId", ano, "grupoCidId", obitos, suprimido, origem, "execucaoId", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, 'REAL', %s, %s)
                ON CONFLICT ("municipioResidenciaId", ano, "grupoCidId")
                DO UPDATE SET
                    obitos = EXCLUDED.obitos,
                    suprimido = EXCLUDED.suprimido,
                    origem = EXCLUDED.origem,
                    "execucaoId" = EXCLUDED."execucaoId",
                    "updatedAt" = EXCLUDED."updatedAt"
                """,
                (
                    int(linha.municipioId), int(linha.ano), grupo_cid_id,
                    None if suprimido else int(linha.obitos),
                    suprimido, execucao_id, agora,
                ),
            )
            gravados += 1
    return gravados, rejeitados


def run() -> None:
    conn = db.obter_conexao()
    try:
        lineage.upsert_fonte_dados(
            conn,
            chave=FONTE_SIM,
            nome="SIM/SUS - Sistema de Informacoes sobre Mortalidade, grupo DO (Declaracao de Obito), via pySUS",
            url="https://datasus.saude.gov.br/acesso-a-informacao/mortalidade-desde-1996-pela-cid-10/",
            licenca="Dado publico (Lei de Acesso a Informacao 12.527/2011)",
            periodicidade="Anual, com defasagem de publicacao/revisao retroativa",
        )
        conn.commit()

        with conn.cursor() as cur:
            cur.execute('SELECT id, "codigoIbge6" FROM silver."Municipio" WHERE "codigoIbge7" LIKE %s', ("35%",))
            municipio_id_por_codigo6 = {codigo6: mid for mid, codigo6 in cur.fetchall()}
            cur.execute('SELECT id FROM silver."GrupoCid" WHERE agrupamento = %s', ("TODAS_NEOPLASIAS_MALIGNAS",))
            grupo_cid_row = cur.fetchone()
            assert grupo_cid_row is not None, "GrupoCid TODAS_NEOPLASIAS_MALIGNAS nao encontrado - rode o seed primeiro"
            grupo_cid_id = grupo_cid_row[0]
        print(f"[sim] {len(municipio_id_por_codigo6)} municipios REAL carregados para cruzamento por codigo IBGE6")

        print("[sim] listando arquivos DO disponiveis no catalogo pysus...")
        arquivos_disponiveis = asyncio.run(sim_pysus.listar_arquivos_do())
        print(f"[sim] {len(arquivos_disponiveis)} arquivos DO encontrados no catalogo (todos os anos)")

        resumo_geral = {
            "anos_solicitados": len(ANOS_ALVO),
            "anos_encontrados_no_catalogo": 0,
            "anos_ausentes_no_catalogo": [],
            "anos_processados": 0,
            "linhas_gravadas": 0,
            "linhas_rejeitadas": 0,
        }

        for ano in ANOS_ALVO:
            alvo = next((a for a in arquivos_disponiveis if a.ano == ano), None)
            if alvo is None:
                print(f"[sim] ano {ano}: AUSENTE no catalogo espelhado pelo pysus - pulando (nao inventado)")
                resumo_geral["anos_ausentes_no_catalogo"].append(ano)
                continue
            resumo_geral["anos_encontrados_no_catalogo"] += 1

            print(f"[sim] ano {ano}: baixando {alvo.path}...")
            caminho_local = asyncio.run(sim_pysus.baixar_arquivo_do(alvo.path))

            print(f"[sim] ano {ano}: filtrando (oncologico+SP) e deduplicando...")
            deduplicado, stats_dedup = carregar_filtrar_deduplicar(caminho_local)
            print(f"[sim] ano {ano}: {stats_dedup}")

            print(f"[sim] ano {ano}: validando municipio e derivando ano do obito (DTOBITO)...")
            valido, stats_transform = transformar(deduplicado, municipio_id_por_codigo6)
            print(f"[sim] ano {ano}: {stats_transform}")

            agregado = agregar(valido)

            execucao = lineage.iniciar_execucao(conn, fonte_dados_chave=FONTE_SIM, versao_pipeline=VERSAO_PIPELINE)

            lineage.registrar_qualidade_check(
                conn, execucao_id=execucao.id, regra="sim_sem_duplicidade_chave_natural",
                severidade="ALERTA", passou=stats_dedup["duplicados_removidos"] == 0,
                linhas_afetadas=stats_dedup["duplicados_removidos"],
                detalhe=f"{stats_dedup['duplicados_removidos']} registro(s) duplicado(s) removido(s) (chave natural)"
                if stats_dedup["duplicados_removidos"] else None,
            )
            lineage.registrar_qualidade_check(
                conn, execucao_id=execucao.id, regra="sim_municipio_residencia_conhecido",
                severidade="ALERTA", passou=len(stats_transform["sem_municipio_correspondente"]) == 0,
                linhas_afetadas=len(stats_transform["sem_municipio_correspondente"]),
                detalhe=f"codigos CODMUNRES sem correspondencia em Municipio: {stats_transform['sem_municipio_correspondente'][:10]}"
                if stats_transform["sem_municipio_correspondente"] else None,
            )

            gravados, rejeitados = gravar(conn, agregado, grupo_cid_id, execucao.id)

            execucao.linhas_processadas = gravados
            execucao.linhas_rejeitadas = rejeitados
            execucao.finalizar(status="SUCESSO" if rejeitados == 0 else "PARCIAL")
            conn.commit()

            print(f"[sim] ano {ano}: FatoObitoResidencia={gravados} celulas gravadas (municipio x ano), {rejeitados} rejeitadas")
            resumo_geral["anos_processados"] += 1
            resumo_geral["linhas_gravadas"] += gravados
            resumo_geral["linhas_rejeitadas"] += rejeitados

        print("[sim] resumo final:")
        for chave, valor in resumo_geral.items():
            print(f"  {chave}: {valor}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run()
