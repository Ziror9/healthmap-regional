"""
Ingestao REAL do SIH/SUS (Sistema de Informacoes Hospitalares), grupo RD
(AIH reduzida) - Ministerio da Saude / DATASUS, via pySUS.

SO RODA DENTRO DO CONTAINER LINUX descrito em etl/docker/Dockerfile.sih -
pysus depende de uma extensao C (pyreaddbc) sem wheel para Windows neste
projeto (ver etl/healthmap_etl/sources/sih.py). Uso, a partir da raiz do
repositorio:

    docker build -f etl/docker/Dockerfile.sih -t healthmap-etl-sih .
    docker run --rm --env-file .env healthmap-etl-sih

(o .env deve apontar DATABASE_URL para host.docker.internal, nao localhost -
ver etl/docker/README.md)

Grao de carga: municipio x competencia x grupoCid (fixo, C00-C97) x
faixaEtaria x sexo - agregado a partir de registros INDIVIDUAIS de AIH
(um por internacao). A agregacao acontece inteiramente neste script, antes
de qualquer escrita no banco: nenhum campo capaz de identificar um paciente
(N_AIH, CPF, CEP, data de nascimento) e persistido no banco da aplicacao -
so os agregados sao gravados, cumprindo o invariante do projeto (CLAUDE.md
#1: "Nao existe dado individual de paciente no banco da aplicacao").

Dois fatos sao gravados a partir do MESMO arquivo, por dois campos de
municipio distintos do SIH-RD (nunca combinados na mesma linha):
  - FatoInternacaoResidencia, chave MUNIC_RES (onde o paciente mora);
  - FatoInternacaoLocal, chave MUNIC_MOV (onde a internacao ocorreu).
Ver docs/sih-methodology.md para a decisao completa sobre os dois eixos.

Competencia usada: ANO_CMPT/MES_CMPT (competencia de PROCESSAMENTO da AIH,
o mesmo campo que da nome ao arquivo baixado) - nao DT_INTER/DT_SAIDA
(datas de internacao/alta, que podem cair em meses diferentes de
ANO_CMPT/MES_CMPT para internacoes longas).

Idempotente: upsert por chave natural (mesma unique constraint do schema).
Reexecutar para a mesma competencia converge, nao duplica.
"""

from __future__ import annotations

import asyncio
import calendar
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pandas as pd  # noqa: E402
import psycopg  # noqa: E402

from healthmap_etl import db, lineage, quality, sih_transform  # noqa: E402
from healthmap_etl.sources import sih  # noqa: E402

VERSAO_PIPELINE = "ingest-sih@1.1.0"
FONTE_SIH = "DATASUS_SIH_RD"
UF = "SP"

# Fase 5.1: expande o POC original (2024-01/02/03, so 2024-02 encontrado no
# catalogo) para o ano de 2024 inteiro. Nem toda competencia deste periodo
# necessariamente existe no catalogo espelhado pelo pysus - o script reporta
# exatamente o que encontrou, nunca preenche um mes ausente (ver docstring
# de healthmap_etl/sources/sih.py). 2024-02 ja ingerido antes desta fase e
# processado de novo aqui - o upsert por chave natural (ON CONFLICT DO
# UPDATE) garante convergencia, nunca duplicacao.
COMPETENCIAS_POC: list[tuple[int, int]] = [(2024, m) for m in range(1, 13)]

_COLUNAS_NECESSARIAS = [
    "N_AIH",
    "ANO_CMPT",
    "MES_CMPT",
    "MUNIC_RES",
    "MUNIC_MOV",
    "SEXO",
    "COD_IDADE",
    "IDADE",
    "DIAS_PERM",
    "MORTE",
    "DIAG_PRINC",
    "UTI_INT_TO",
]


def obter_ou_criar_competencia(conn: psycopg.Connection, ano: int, mes: int) -> int:
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


def _numero_nao_negativo(serie: "pd.Series", nome: str) -> "pd.Series":
    """Converte para numerico; valores nao numericos ou negativos viram NaN (a linha e rejeitada depois)."""
    numerico = pd.to_numeric(serie, errors="coerce")
    return numerico.where(numerico >= 0)


def carregar_e_normalizar(caminho_parquet: str, ano_arquivo: int, mes_arquivo: int) -> tuple[pd.DataFrame, dict]:
    """
    Le o parquet, filtra para o recorte C00-C97, normaliza os campos e
    devolve (dataframe pronto para agregar, estatisticas de rejeicao).
    Nenhuma coluna capaz de identificar o paciente sobrevive alem desta
    funcao.
    """
    bruto = pd.read_parquet(caminho_parquet, columns=_COLUNAS_NECESSARIAS)
    total_bruto = len(bruto)

    duplicadas_aih = int(bruto["N_AIH"].duplicated().sum())
    if duplicadas_aih:
        bruto = bruto.drop_duplicates(subset="N_AIH", keep="first")

    oncologico = bruto[bruto["DIAG_PRINC"].apply(sih_transform.eh_cid_oncologico)].copy()
    total_oncologico = len(oncologico)

    ano_mes = oncologico.apply(
        lambda r: sih_transform.extrair_ano_mes_competencia(r["ANO_CMPT"], r["MES_CMPT"]), axis=1
    )
    competencia_diverge = int((ano_mes != (ano_arquivo, mes_arquivo)).sum())

    oncologico["municipioResidenciaCodigo"] = oncologico["MUNIC_RES"].apply(sih_transform.normalizar_codigo_municipio6)
    oncologico["municipioInternacaoCodigo"] = oncologico["MUNIC_MOV"].apply(sih_transform.normalizar_codigo_municipio6)
    oncologico["sexo"] = oncologico["SEXO"].apply(sih_transform.mapear_sexo)
    oncologico["faixaEtaria"] = oncologico.apply(
        lambda r: sih_transform.calcular_faixa_etaria(r["COD_IDADE"], r["IDADE"]), axis=1
    )
    oncologico["obito"] = _numero_nao_negativo(oncologico["MORTE"], "MORTE").fillna(0).clip(upper=1).astype(int)
    oncologico["diasPermanencia"] = _numero_nao_negativo(oncologico["DIAS_PERM"], "DIAS_PERM")
    oncologico["diariasUti"] = _numero_nao_negativo(oncologico["UTI_INT_TO"], "UTI_INT_TO")

    # Diagnostico: as duas razoes podem coincidir na MESMA linha (ex.: um
    # registro pode ter faixa etaria indeterminada E permanencia invalida ao
    # mesmo tempo) - por isso NAO sao somadas para compor um total. O total
    # de rejeitados pre-agregacao, sem contagem dupla, e sempre
    # `total_oncologico - validos_para_agregacao` (calculado abaixo).
    sem_faixa_etaria = int(oncologico["faixaEtaria"].isna().sum())
    sem_dias_permanencia = int(oncologico["diasPermanencia"].isna().sum())

    valido = oncologico[oncologico["faixaEtaria"].notna() & oncologico["diasPermanencia"].notna()].copy()
    valido["diariasUti"] = valido["diariasUti"].fillna(0)

    estatisticas = {
        "total_bruto": total_bruto,
        "duplicadas_aih_removidas": duplicadas_aih,
        "total_oncologico_c00_c97": total_oncologico,
        "competencia_arquivo_diverge_do_registro": competencia_diverge,
        "diagnostico_sem_faixa_etaria_classificavel": sem_faixa_etaria,
        "diagnostico_sem_permanencia_valida": sem_dias_permanencia,
        "validos_para_agregacao": len(valido),
        "rejeitados_pre_agregacao": total_oncologico - len(valido),
    }
    return valido, estatisticas


def agregar_residencia(df: pd.DataFrame, municipio_id_por_codigo6: dict[str, int]) -> tuple[pd.DataFrame, int]:
    df = df.copy()
    df["municipioId"] = df["municipioResidenciaCodigo"].map(municipio_id_por_codigo6)
    sem_municipio = int(df["municipioId"].isna().sum())
    df = df[df["municipioId"].notna()]
    if df.empty:
        return df, sem_municipio

    agregado = (
        df.groupby(["municipioId", "faixaEtaria", "sexo"], as_index=False)
        .agg(internacoes=("N_AIH", "count"), obitos=("obito", "sum"), diasPermanencia=("diasPermanencia", "sum"))
    )
    agregado["municipioId"] = agregado["municipioId"].astype(int)
    return agregado, sem_municipio


def agregar_local(df: pd.DataFrame, municipio_id_por_codigo6: dict[str, int]) -> tuple[pd.DataFrame, int]:
    df = df.copy()
    df["municipioId"] = df["municipioInternacaoCodigo"].map(municipio_id_por_codigo6)
    sem_municipio = int(df["municipioId"].isna().sum())
    df = df[df["municipioId"].notna()]
    if df.empty:
        return df, sem_municipio

    agregado = (
        df.groupby(["municipioId", "faixaEtaria", "sexo"], as_index=False)
        .agg(
            internacoes=("N_AIH", "count"),
            obitos=("obito", "sum"),
            pacientesDia=("diasPermanencia", "sum"),
            diariasUti=("diariasUti", "sum"),
        )
    )
    agregado["municipioId"] = agregado["municipioId"].astype(int)
    return agregado, sem_municipio


LIMIAR_SUPRESSAO = 5


def _cell_valida(conn: psycopg.Connection, execucao_id: str, regra: str, campos: dict[str, int]) -> bool:
    """Reaproveita quality.check_nao_negativo por celula agregada (mesmo padrao de ingest_cnes.py) antes de gravar."""
    for campo, valor in campos.items():
        ok, detalhe = quality.check_nao_negativo(valor, campo)
        if not ok:
            lineage.registrar_qualidade_check(
                conn, execucao_id=execucao_id, regra=regra,
                severidade="BLOQUEANTE", passou=False, linhas_afetadas=1, detalhe=detalhe,
            )
            return False
    return True


def gravar_residencia(
    conn: psycopg.Connection, agregado: pd.DataFrame, competencia_id: int, grupo_cid_id: int, execucao_id: str
) -> tuple[int, int]:
    agora = datetime.now(timezone.utc)
    gravados = 0
    rejeitados = 0
    with conn.cursor() as cur:
        for linha in agregado.itertuples(index=False):
            suprimido = linha.internacoes < LIMIAR_SUPRESSAO
            if not suprimido and not _cell_valida(
                conn, execucao_id, "sih_residencia_valores_nao_negativos",
                {"internacoes": int(linha.internacoes), "obitos": int(linha.obitos), "diasPermanencia": int(linha.diasPermanencia)},
            ):
                rejeitados += 1
                continue
            cur.execute(
                """
                INSERT INTO gold."FatoInternacaoResidencia"
                    ("municipioResidenciaId", "competenciaId", "grupoCidId", "faixaEtaria", sexo,
                     internacoes, obitos, "diasPermanencia", suprimido, origem, "execucaoId", "updatedAt")
                VALUES (%s, %s, %s, %s::gold."FaixaEtaria", %s::gold."Sexo", %s, %s, %s, %s, 'REAL', %s, %s)
                ON CONFLICT ("municipioResidenciaId", "competenciaId", "grupoCidId", "faixaEtaria", sexo)
                DO UPDATE SET
                    internacoes = EXCLUDED.internacoes,
                    obitos = EXCLUDED.obitos,
                    "diasPermanencia" = EXCLUDED."diasPermanencia",
                    suprimido = EXCLUDED.suprimido,
                    origem = EXCLUDED.origem,
                    "execucaoId" = EXCLUDED."execucaoId",
                    "updatedAt" = EXCLUDED."updatedAt"
                """,
                (
                    int(linha.municipioId), competencia_id, grupo_cid_id, linha.faixaEtaria, linha.sexo,
                    None if suprimido else int(linha.internacoes),
                    None if suprimido else int(linha.obitos),
                    None if suprimido else int(linha.diasPermanencia),
                    suprimido, execucao_id, agora,
                ),
            )
            gravados += 1
    return gravados, rejeitados


def gravar_local(
    conn: psycopg.Connection, agregado: pd.DataFrame, competencia_id: int, grupo_cid_id: int, execucao_id: str
) -> tuple[int, int]:
    agora = datetime.now(timezone.utc)
    gravados = 0
    rejeitados = 0
    with conn.cursor() as cur:
        for linha in agregado.itertuples(index=False):
            suprimido = linha.internacoes < LIMIAR_SUPRESSAO
            if not suprimido and not _cell_valida(
                conn, execucao_id, "sih_local_valores_nao_negativos",
                {
                    "internacoes": int(linha.internacoes), "obitos": int(linha.obitos),
                    "pacientesDia": int(linha.pacientesDia), "diariasUti": int(linha.diariasUti),
                },
            ):
                rejeitados += 1
                continue
            cur.execute(
                """
                INSERT INTO gold."FatoInternacaoLocal"
                    ("municipioInternacaoId", "competenciaId", "grupoCidId", "faixaEtaria", sexo,
                     internacoes, "pacientesDia", "diariasUti", obitos, suprimido, origem, "execucaoId", "updatedAt")
                VALUES (%s, %s, %s, %s::gold."FaixaEtaria", %s::gold."Sexo", %s, %s, %s, %s, %s, 'REAL', %s, %s)
                ON CONFLICT ("municipioInternacaoId", "competenciaId", "grupoCidId", "faixaEtaria", sexo)
                DO UPDATE SET
                    internacoes = EXCLUDED.internacoes,
                    "pacientesDia" = EXCLUDED."pacientesDia",
                    "diariasUti" = EXCLUDED."diariasUti",
                    obitos = EXCLUDED.obitos,
                    suprimido = EXCLUDED.suprimido,
                    origem = EXCLUDED.origem,
                    "execucaoId" = EXCLUDED."execucaoId",
                    "updatedAt" = EXCLUDED."updatedAt"
                """,
                (
                    int(linha.municipioId), competencia_id, grupo_cid_id, linha.faixaEtaria, linha.sexo,
                    None if suprimido else int(linha.internacoes),
                    None if suprimido else int(linha.pacientesDia),
                    None if suprimido else int(linha.diariasUti),
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
            chave=FONTE_SIH,
            nome="SIH/SUS - Sistema de Informacoes Hospitalares do SUS, grupo RD (AIH reduzida), via pySUS",
            url="https://datasus.saude.gov.br/acesso-a-informacao/producao-hospitalar-sih-sus/",
            licenca="Dado publico (Lei de Acesso a Informacao 12.527/2011)",
            periodicidade="Mensal, com defasagem de publicacao/revisao retroativa (ver docs/known-limitations.md)",
        )
        conn.commit()

        with conn.cursor() as cur:
            cur.execute('SELECT id, "codigoIbge6" FROM silver."Municipio" WHERE "codigoIbge7" LIKE %s', ("35%",))
            municipio_id_por_codigo6 = {codigo6: mid for mid, codigo6 in cur.fetchall()}
            cur.execute('SELECT id FROM silver."GrupoCid" WHERE agrupamento = %s', ("TODAS_NEOPLASIAS_MALIGNAS",))
            grupo_cid_row = cur.fetchone()
            assert grupo_cid_row is not None, "GrupoCid TODAS_NEOPLASIAS_MALIGNAS nao encontrado - rode o seed primeiro"
            grupo_cid_id = grupo_cid_row[0]
        print(f"[sih] {len(municipio_id_por_codigo6)} municipios REAL carregados para cruzamento por codigo IBGE6")

        print(f"[sih] listando arquivos RD disponiveis para {UF} no catalogo pysus...")
        arquivos_disponiveis = asyncio.run(sih.listar_arquivos_rd(UF))
        print(f"[sih] {len(arquivos_disponiveis)} arquivos RD/{UF} encontrados no catalogo (todas as competencias)")

        resumo_geral = {
            "competencias_solicitadas": len(COMPETENCIAS_POC),
            "competencias_encontradas_no_catalogo": 0,
            "competencias_ausentes_no_catalogo": [],
            "competencias_processadas": 0,
            "registros_processados": 0,
            "registros_rejeitados": 0,
        }

        for ano, mes in COMPETENCIAS_POC:
            alvo = next((a for a in arquivos_disponiveis if a.ano == ano and a.mes == mes), None)
            if alvo is None:
                print(f"[sih] competencia {ano}-{mes:02d}: AUSENTE no catalogo espelhado pelo pysus - pulando (nao inventado)")
                resumo_geral["competencias_ausentes_no_catalogo"].append(f"{ano}-{mes:02d}")
                continue
            resumo_geral["competencias_encontradas_no_catalogo"] += 1

            print(f"[sih] competencia {ano}-{mes:02d}: baixando {alvo.path}...")
            caminho_local = asyncio.run(sih.baixar_arquivo_rd(alvo.path))

            print(f"[sih] competencia {ano}-{mes:02d}: lendo e normalizando...")
            valido, estatisticas = carregar_e_normalizar(caminho_local, ano, mes)
            print(f"[sih] competencia {ano}-{mes:02d}: {estatisticas}")

            competencia_id = obter_ou_criar_competencia(conn, ano, mes)

            execucao = lineage.iniciar_execucao(
                conn, fonte_dados_chave=FONTE_SIH, competencia_id=competencia_id, versao_pipeline=VERSAO_PIPELINE
            )

            lineage.registrar_qualidade_check(
                conn, execucao_id=execucao.id, regra="aih_sem_duplicidade",
                severidade="ALERTA", passou=estatisticas["duplicadas_aih_removidas"] == 0,
                linhas_afetadas=estatisticas["duplicadas_aih_removidas"],
                detalhe=f"{estatisticas['duplicadas_aih_removidas']} AIH duplicada(s) removida(s) antes da agregacao"
                if estatisticas["duplicadas_aih_removidas"] else None,
            )
            lineage.registrar_qualidade_check(
                conn, execucao_id=execucao.id, regra="competencia_arquivo_bate_com_registro",
                severidade="ALERTA", passou=estatisticas["competencia_arquivo_diverge_do_registro"] == 0,
                linhas_afetadas=estatisticas["competencia_arquivo_diverge_do_registro"],
                detalhe=f"{estatisticas['competencia_arquivo_diverge_do_registro']} registro(s) com ANO_CMPT/MES_CMPT diferente do arquivo"
                if estatisticas["competencia_arquivo_diverge_do_registro"] else None,
            )
            lineage.registrar_qualidade_check(
                conn, execucao_id=execucao.id, regra="sih_faixa_etaria_classificavel",
                severidade="ALERTA", passou=estatisticas["diagnostico_sem_faixa_etaria_classificavel"] == 0,
                linhas_afetadas=estatisticas["diagnostico_sem_faixa_etaria_classificavel"],
                detalhe="COD_IDADE fora do dicionario documentado (0/2/3/4) ou IDADE nao numerica - registro excluido, faixa nao adivinhada"
                if estatisticas["diagnostico_sem_faixa_etaria_classificavel"] else None,
            )

            agregado_residencia, sem_municipio_residencia = agregar_residencia(valido, municipio_id_por_codigo6)
            agregado_local, sem_municipio_local = agregar_local(valido, municipio_id_por_codigo6)

            lineage.registrar_qualidade_check(
                conn, execucao_id=execucao.id, regra="sih_municipio_residencia_conhecido",
                severidade="ALERTA", passou=sem_municipio_residencia == 0, linhas_afetadas=sem_municipio_residencia,
                detalhe=f"{sem_municipio_residencia} registro(s) com MUNIC_RES fora da base de 645 municipios de SP (paciente de outra UF)"
                if sem_municipio_residencia else None,
            )
            lineage.registrar_qualidade_check(
                conn, execucao_id=execucao.id, regra="sih_municipio_internacao_conhecido",
                severidade="ALERTA", passou=sem_municipio_local == 0, linhas_afetadas=sem_municipio_local,
                detalhe=f"{sem_municipio_local} registro(s) com MUNIC_MOV fora da base de 645 municipios de SP"
                if sem_municipio_local else None,
            )

            gravados_residencia, rejeitados_residencia = gravar_residencia(
                conn, agregado_residencia, competencia_id, grupo_cid_id, execucao.id
            )
            gravados_local, rejeitados_local = gravar_local(conn, agregado_local, competencia_id, grupo_cid_id, execucao.id)

            # rejeitados_pre_agregacao ja e um total sem contagem dupla (ver
            # carregar_e_normalizar). As rejeicoes de municipio/valores
            # invalidos sao POR EIXO (residencia e local agregam o mesmo
            # `valido` de forma independente) - somadas aqui como instancias
            # de celula rejeitadas, nao como registros unicos adicionais.
            rejeitados_total = (
                estatisticas["rejeitados_pre_agregacao"]
                + sem_municipio_residencia
                + sem_municipio_local
                + rejeitados_residencia
                + rejeitados_local
            )
            execucao.linhas_processadas = estatisticas["validos_para_agregacao"]
            execucao.linhas_rejeitadas = rejeitados_total
            execucao.finalizar(status="SUCESSO" if rejeitados_total == 0 else "PARCIAL")
            conn.commit()

            print(
                f"[sih] competencia {ano}-{mes:02d}: FatoInternacaoResidencia={gravados_residencia} celulas, "
                f"FatoInternacaoLocal={gravados_local} celulas, "
                f"{estatisticas['validos_para_agregacao']} registros validos, {rejeitados_total} rejeitados"
            )

            resumo_geral["competencias_processadas"] += 1
            resumo_geral["registros_processados"] += estatisticas["validos_para_agregacao"]
            resumo_geral["registros_rejeitados"] += rejeitados_total

        print("[sih] resumo final:")
        for chave, valor in resumo_geral.items():
            print(f"  {chave}: {valor}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run()
