"""
Ingestao REAL do CNES (Cadastro Nacional de Estabelecimentos de Saude):
FatoCapacidadeLeitos (todos os municipios de SP encontrados na fonte) e
Estabelecimento (amostra limitada - ver secao "Estabelecimento" abaixo).

Uso, a partir da raiz do repositorio: python etl/ingest_cnes.py

FatoCapacidadeLeitos
--------------------
Fonte: GET /assistencia-a-saude/hospitais-e-leitos (paginado, filtro UF
quebrado no servidor - ver healthmap_etl/sources/cnes.py). Snapshot atual,
NAO historico por competencia (a fonte nao informa competencia) - anexado
a uma Competencia "atual" criada/reaproveitada para este proposito.

So dois TipoLeito sao gravados por municipio: UTI (campo especifico da
fonte) e OUTRO (total - UTI). CLINICO/CIRURGICO NAO sao gravados: a fonte
nao distingue esse recorte, e ratear os leitos "OUTRO" entre CLINICO e
CIRURGICO exigiria uma premissa nao documentada - preferimos a ausencia
completa das linhas a inventar uma proporcao.

Estabelecimento
----------------
Fonte: GET /cnes/estabelecimentos?codigo_uf=35 (paginado, limite real da
API: 20 registros/pagina). Cobertura EXAUSTIVA de SP exigiria centenas de
requisicoes - esta ingestao usa um numero de paginas limitado e documentado
(ver ESTABELECIMENTOS_MAX_PAGINAS abaixo e docs/fase-5-relatorio.md), nao e
o catalogo completo de estabelecimentos de SP.

`habilitacaoOncologica` e um campo NOT NULL no schema (packages/db/prisma/
schema.prisma) mas a fonte usada aqui nao informa habilitacao oncologica -
todo estabelecimento REAL carregado por este script recebe
habilitacaoOncologica = false com o significado explicito de "nao
determinado por esta fonte", nunca "confirmado sem habilitacao oncologica".
Nao usar este campo para filtrar estabelecimentos oncologicos ate uma fonte
real de habilitacao (registro proprio do CNES/SUS) ser integrada - ver
docs/known-limitations.md.
"""

from __future__ import annotations

import calendar
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg  # noqa: E402

from healthmap_etl import db, lineage, quality  # noqa: E402
from healthmap_etl.sources import cnes  # noqa: E402

VERSAO_PIPELINE = "ingest-cnes@1.0.0"
FONTE_CNES = "CNES_DEMAS"
ESTABELECIMENTOS_MAX_PAGINAS = 25  # 25 x 20 = ate 500 estabelecimentos reais (amostra, nao cobertura completa)


def obter_ou_criar_competencia_atual(conn: psycopg.Connection) -> tuple[int, int]:
    """Competencia do mes corrente - usada como 'snapshot atual' para dados sem competencia propria (leitos)."""
    hoje = date.today()
    ano, mes = hoje.year, hoje.month
    dias_no_mes = calendar.monthrange(ano, mes)[1]
    data_ref = date(ano, mes, 1)
    agora = datetime.now(timezone.utc)
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
        return row[0], ano


def run() -> None:
    conn = db.obter_conexao()
    try:
        lineage.upsert_fonte_dados(
            conn,
            chave=FONTE_CNES,
            nome="CNES - Cadastro Nacional de Estabelecimentos de Saude (via API DEMAS/Ministerio da Saude)",
            url="https://apidadosabertos.saude.gov.br/v1/",
            licenca="Dado publico (Lei de Acesso a Informacao 12.527/2011)",
            periodicidade="Snapshot (a fonte nao expoe historico por competencia)",
        )
        conn.commit()

        with conn.cursor() as cur:
            cur.execute('SELECT id, "codigoIbge7", nome FROM silver."Municipio" WHERE "codigoIbge7" LIKE %s', ("35%",))
            municipios_reais = cur.fetchall()
        municipio_id_por_nome = {cnes.normalizar_nome_municipio(nome): (mid, codigo) for mid, codigo, nome in municipios_reais}
        print(f"[cnes] {len(municipio_id_por_nome)} municipios reais carregados para cruzamento por nome")

        competencia_id, _ano = obter_ou_criar_competencia_atual(conn)
        print(f"[cnes] competencia snapshot atual: id={competencia_id}")

        _ingerir_leitos(conn, competencia_id, municipio_id_por_nome)
        _ingerir_estabelecimentos_amostra(conn, municipio_id_por_nome)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _ingerir_leitos(conn: psycopg.Connection, competencia_id: int, municipio_id_por_nome: dict[str, tuple[int, str]]) -> None:
    print("[cnes] buscando hospitais-e-leitos (Brasil, filtrado client-side para SP)...")
    registros = cnes.buscar_hospitais_leitos_brasil()
    print(f"[cnes] {len(registros)} registros recebidos (Brasil inteiro)")

    registros_sp = [r for r in registros if r.get("unidade_da_federacao_onde_fica_o_hospital") == "SP"]
    registros_sp = [r for r in registros_sp if not r.get("motivo_da_desabilitacao_do_hospital,_caso_esteja_desabilitado")]
    print(f"[cnes] {len(registros_sp)} registros de SP (ativos), antes de deduplicar")

    # BUG REAL da API (nao deste projeto): a paginacao por offset de
    # /assistencia-a-saude/hospitais-e-leitos nao e estavel - o mesmo
    # hospital reaparece em paginas diferentes com dados identicos
    # (confirmado: mesmo nome, endereco, CEP e contagem de leitos). Sem
    # deduplicar, os leitos de um mesmo hospital seriam somados varias
    # vezes, inflando a capacidade real em ordens de grandeza - ver
    # cnes.deduplicar_hospitais e etl/tests/test_cnes.py.
    registros_sp, duplicatas_removidas = cnes.deduplicar_hospitais(registros_sp)
    print(f"[cnes] {len(registros_sp)} registros de SP unicos ({duplicatas_removidas} duplicatas de paginacao removidas)")

    execucao = lineage.iniciar_execucao(
        conn, fonte_dados_chave=FONTE_CNES, competencia_id=competencia_id, versao_pipeline=VERSAO_PIPELINE
    )
    lineage.registrar_qualidade_check(
        conn, execucao_id=execucao.id, regra="hospital_deduplicado_paginacao_instavel",
        severidade="ALERTA", passou=duplicatas_removidas == 0, linhas_afetadas=duplicatas_removidas,
        detalhe=(
            "paginacao por offset de /assistencia-a-saude/hospitais-e-leitos nao e estavel - "
            "o mesmo hospital pode aparecer em mais de uma pagina; deduplicado por nome+endereco+CEP"
        ) if duplicatas_removidas else None,
    )

    agregados: dict[int, dict[str, float]] = {}
    nao_casados: list[str] = []
    for r in registros_sp:
        nome_norm = cnes.normalizar_nome_municipio(r.get("nome_do_municipio_onde_fica_o_hospital") or "")
        alvo = municipio_id_por_nome.get(nome_norm)
        if alvo is None:
            nao_casados.append(r.get("nome_do_municipio_onde_fica_o_hospital") or "?")
            continue
        municipio_id = alvo[0]

        total_geral = r.get("quantidade_total_de_leitos_do_hosptial") or 0
        total_sus = r.get("quantidade_total_de_leitos_sus_do_hosptial") or 0
        uti_geral = r.get("quantidade_de_leitos_de_uti_do_hosptial") or 0
        uti_sus = r.get("quantidade_de_leitos_de_uti_sus_do_hosptial") or 0

        bucket = agregados.setdefault(municipio_id, {"uti_sus": 0.0, "uti_total": 0.0, "outro_sus": 0.0, "outro_total": 0.0})
        bucket["uti_sus"] += uti_sus
        bucket["uti_total"] += uti_geral
        bucket["outro_sus"] += max(0.0, total_sus - uti_sus)
        bucket["outro_total"] += max(0.0, total_geral - uti_geral)

    lineage.registrar_qualidade_check(
        conn, execucao_id=execucao.id, regra="hospital_municipio_casado_por_nome",
        severidade="ALERTA", passou=len(nao_casados) == 0, linhas_afetadas=len(nao_casados),
        detalhe=f"nomes sem municipio correspondente: {sorted(set(nao_casados))[:10]}" if nao_casados else None,
    )

    gravados = 0
    with conn.cursor() as cur:
        for municipio_id, valores in agregados.items():
            for tipo, sus, total in (
                ("UTI", valores["uti_sus"], valores["uti_total"]),
                ("OUTRO", valores["outro_sus"], valores["outro_total"]),
            ):
                sus_i, total_i = int(round(sus)), int(round(total))
                ok_sus, det_sus = quality.check_nao_negativo(sus_i, "leitosSus")
                ok_tot, det_tot = quality.check_nao_negativo(total_i, "leitosTotais")
                if not (ok_sus and ok_tot):
                    lineage.registrar_qualidade_check(
                        conn, execucao_id=execucao.id, regra="leitos_nao_negativo",
                        severidade="BLOQUEANTE", passou=False, linhas_afetadas=1, detalhe=det_sus or det_tot,
                    )
                    execucao.linhas_rejeitadas += 1
                    continue
                cur.execute(
                    """
                    INSERT INTO gold."FatoCapacidadeLeitos"
                        ("municipioInternacaoId", "competenciaId", "tipoLeito", "leitosSus", "leitosTotais", origem, "execucaoId", "updatedAt")
                    VALUES (%s, %s, %s, %s, %s, 'REAL', %s, %s)
                    ON CONFLICT ("municipioInternacaoId", "competenciaId", "tipoLeito") DO UPDATE SET
                        "leitosSus" = EXCLUDED."leitosSus",
                        "leitosTotais" = EXCLUDED."leitosTotais",
                        origem = EXCLUDED.origem,
                        "execucaoId" = EXCLUDED."execucaoId",
                        "updatedAt" = EXCLUDED."updatedAt"
                    """,
                    (municipio_id, competencia_id, tipo, sus_i, total_i, execucao.id, datetime.now(timezone.utc)),
                )
                gravados += 1

    execucao.linhas_processadas = gravados
    execucao.finalizar(status="SUCESSO" if not nao_casados else "PARCIAL")
    conn.commit()
    print(f"[cnes] FatoCapacidadeLeitos: {gravados} linhas gravadas ({len(agregados)} municipios), {len(nao_casados)} hospital(is) sem municipio casado")


def _ingerir_estabelecimentos_amostra(conn: psycopg.Connection, municipio_id_por_nome: dict[str, tuple[int, str]]) -> None:
    print(f"[cnes] buscando amostra de estabelecimentos (ate {ESTABELECIMENTOS_MAX_PAGINAS} paginas x 20)...")
    estabelecimentos = cnes.buscar_estabelecimentos_sp(max_paginas=ESTABELECIMENTOS_MAX_PAGINAS)
    print(f"[cnes] {len(estabelecimentos)} estabelecimentos recebidos (amostra, nao cobertura completa)")

    execucao = lineage.iniciar_execucao(conn, fonte_dados_chave=FONTE_CNES, versao_pipeline=VERSAO_PIPELINE)

    codigos_cnes = [str(e.get("codigo_cnes") or "") for e in estabelecimentos]
    ok, detalhe = quality.check_sem_duplicidade(codigos_cnes, "codigo CNES")
    lineage.registrar_qualidade_check(
        conn, execucao_id=execucao.id, regra="estabelecimento_sem_duplicidade",
        severidade="BLOQUEANTE", passou=ok, detalhe=detalhe,
    )

    gravados = 0
    rejeitados = 0
    agora = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        for e in estabelecimentos:
            # JSON entrega codigo_cnes como numero - zfill reconstroi zeros a
            # esquerda que a serializacao numerica teria descartado.
            codigo_cnes_bruto = e.get("codigo_cnes")
            codigo_cnes = str(codigo_cnes_bruto).zfill(7) if codigo_cnes_bruto is not None else ""
            valido, det = quality.check_codigo_cnes(codigo_cnes)
            codigo_municipio_bruto = e.get("codigo_municipio")
            codigo_municipio_ibge6 = str(codigo_municipio_bruto).zfill(6) if codigo_municipio_bruto is not None else ""
            municipio_match = next(
                (v for v in municipio_id_por_nome.values() if v[1][:6] == codigo_municipio_ibge6),
                None,
            )
            if not valido or municipio_match is None:
                rejeitados += 1
                lineage.registrar_qualidade_check(
                    conn, execucao_id=execucao.id, regra="estabelecimento_codigo_e_municipio_validos",
                    severidade="ALERTA", passou=False, linhas_afetadas=1,
                    detalhe=det or f"municipio codigo_ibge6={codigo_municipio_ibge6!r} nao encontrado",
                )
                continue

            municipio_id = municipio_match[0]
            nome = e.get("nome_fantasia") or e.get("nome_razao_social") or f"CNES {codigo_cnes}"
            tipo = str(e.get("codigo_tipo_unidade") or "DESCONHECIDO")
            # Ausencia de motivo de desabilitacao = estabelecimento ativo (campo real da fonte).
            ativo = e.get("codigo_motivo_desabilitacao_estabelecimento") in (None, "")

            cur.execute(
                """
                INSERT INTO silver."Estabelecimento"
                    ("codigoCnes", nome, "municipioId", tipo, "habilitacaoOncologica", ativo, "updatedAt")
                VALUES (%s, %s, %s, %s, false, %s, %s)
                ON CONFLICT ("codigoCnes") DO UPDATE SET
                    nome = EXCLUDED.nome,
                    "municipioId" = EXCLUDED."municipioId",
                    tipo = EXCLUDED.tipo,
                    ativo = EXCLUDED.ativo,
                    "updatedAt" = EXCLUDED."updatedAt"
                """,
                (codigo_cnes, nome, municipio_id, tipo, ativo, agora),
            )
            gravados += 1

    execucao.linhas_processadas = gravados
    execucao.linhas_rejeitadas = rejeitados
    execucao.finalizar(status="SUCESSO" if rejeitados == 0 else "PARCIAL")
    conn.commit()
    print(f"[cnes] Estabelecimento: {gravados} gravados, {rejeitados} rejeitados (amostra limitada, ver docstring do script)")


if __name__ == "__main__":
    run()
