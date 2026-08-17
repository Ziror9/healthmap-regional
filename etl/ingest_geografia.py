"""
Ingestao REAL da geografia de Sao Paulo: 645 municipios (IBGE) + 17
Departamentos Regionais de Saude (SES-SP).

Uso, a partir da raiz do repositorio: python etl/ingest_geografia.py

Idempotente: upsert por chave natural (RegiaoSaude.codigo,
Municipio.codigoIbge7) - reexecutar converge, nao duplica. Nao apaga nem
altera os 15 municipios/5 regioes DEMO (codigos sinteticos, sem colisao
verificada com os codigos IBGE reais - ver docs/fase-5-relatorio.md).
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from healthmap_etl import db, lineage, quality  # noqa: E402
from healthmap_etl.sources import drs_sp, ibge  # noqa: E402

VERSAO_PIPELINE = "ingest-geografia@1.0.0"
FONTE_IBGE = "IBGE_LOCALIDADES"
FONTE_DRS = "SESSP_DRS"


def centroide_aproximado(geometry: dict) -> tuple[float, float] | None:
    """
    Media simples de todos os vertices do poligono/multipoligono - uma
    aproximacao do centroide (nao o centroide de area exato, que exigiria
    integrar sobre o poligono). Suficiente como ponto de referencia
    territorial; documentado como aproximacao, nunca como coordenada
    medida em campo.
    """
    pontos: list[list[float]] = []

    def coletar(coords: object) -> None:
        if isinstance(coords, (list, tuple)) and coords and isinstance(coords[0], (int, float)):
            pontos.append(list(coords))  # type: ignore[arg-type]
        elif isinstance(coords, (list, tuple)):
            for item in coords:
                coletar(item)

    coletar(geometry.get("coordinates"))
    if not pontos:
        return None
    lats = [p[1] for p in pontos]
    lons = [p[0] for p in pontos]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def run() -> None:
    conn = db.obter_conexao()
    try:
        print("[geografia] buscando municipios (IBGE)...")
        municipios_ibge = ibge.listar_municipios_sp()
        print(f"[geografia] {len(municipios_ibge)} municipios recebidos do IBGE")

        print("[geografia] buscando malha territorial / GeoJSON (IBGE)...")
        malha = ibge.buscar_malha_municipios_sp()
        centroides: dict[str, tuple[float, float]] = {}
        for feature in malha["features"]:
            codigo = feature["properties"]["codarea"]
            centro = centroide_aproximado(feature["geometry"])
            if centro:
                centroides[codigo] = centro
        print(f"[geografia] {len(centroides)} centroides aproximados calculados")

        print("[geografia] carregando mapeamento DRS (SES-SP, referencia local)...")
        drs_por_municipio = {linha["codigo_ibge6"]: linha for linha in drs_sp.carregar_drs_por_municipio()}
        drs_distintos = drs_sp.listar_drs_distintos()
        print(f"[geografia] {len(drs_distintos)} DRS distintos")

        lineage.upsert_fonte_dados(
            conn,
            chave=FONTE_IBGE,
            nome="IBGE - API de Localidades e Malhas Territoriais",
            url="https://servicodados.ibge.gov.br/api/docs/localidades",
            licenca="Dado publico (Lei de Acesso a Informacao 12.527/2011)",
            periodicidade="Sob demanda",
        )
        lineage.upsert_fonte_dados(
            conn,
            chave=FONTE_DRS,
            nome="SES-SP - Departamentos Regionais de Saude",
            url="https://saude3.saude.sp.gov.br/departamentos-regionais-de-saude/regionais-de-saude/",
            licenca="Dado publico (Lei de Acesso a Informacao 12.527/2011)",
            periodicidade="Estavel (Decreto Estadual 51.433/2006)",
        )
        conn.commit()

        execucao = lineage.iniciar_execucao(conn, fonte_dados_chave=FONTE_IBGE, versao_pipeline=VERSAO_PIPELINE)

        # --- Qualidade (secao 14 do pedido da Fase 5: geografia) ---
        codigos7 = [m["codigo_ibge7"] for m in municipios_ibge]

        ok, detalhe = quality.check_sem_duplicidade(codigos7, "codigo IBGE7")
        lineage.registrar_qualidade_check(
            conn, execucao_id=execucao.id, regra="municipio_sem_duplicidade",
            severidade="BLOQUEANTE", passou=ok, detalhe=detalhe,
        )
        if not ok:
            execucao.finalizar(status="FALHA", mensagem_erro=detalhe)
            conn.commit()
            raise SystemExit(f"[geografia] check bloqueante falhou: {detalhe}")

        invalidos = [c for c in codigos7 if not quality.check_codigo_ibge7_sp(c)[0]]
        lineage.registrar_qualidade_check(
            conn, execucao_id=execucao.id, regra="codigo_ibge7_formato_uf",
            severidade="BLOQUEANTE", passou=len(invalidos) == 0, linhas_afetadas=len(invalidos),
            detalhe=f"codigos invalidos: {invalidos[:10]}" if invalidos else None,
        )
        if invalidos:
            execucao.finalizar(status="FALHA", mensagem_erro=f"{len(invalidos)} codigos IBGE invalidos")
            conn.commit()
            raise SystemExit(f"[geografia] {len(invalidos)} codigos IBGE invalidos")

        sem_drs = [m["codigo_ibge7"] for m in municipios_ibge if m["codigo_ibge7"][:6] not in drs_por_municipio]
        lineage.registrar_qualidade_check(
            conn, execucao_id=execucao.id, regra="municipio_possui_drs",
            severidade="ALERTA", passou=len(sem_drs) == 0, linhas_afetadas=len(sem_drs),
            detalhe=f"sem DRS mapeado: {sem_drs[:10]}" if sem_drs else None,
        )

        sem_coordenada = [m["codigo_ibge7"] for m in municipios_ibge if m["codigo_ibge7"] not in centroides]
        lineage.registrar_qualidade_check(
            conn, execucao_id=execucao.id, regra="municipio_possui_centroide",
            severidade="ALERTA", passou=len(sem_coordenada) == 0, linhas_afetadas=len(sem_coordenada),
            detalhe=f"sem centroide: {sem_coordenada[:10]}" if sem_coordenada else None,
        )

        # --- Carga: RegiaoSaude (17 DRS reais) ---
        agora = datetime.now(timezone.utc)
        regiao_id_por_numero: dict[str, int] = {}
        with conn.cursor() as cur:
            for drs in drs_distintos:
                codigo = f"DRS-{drs['numero']}"
                cur.execute(
                    """
                    INSERT INTO silver."RegiaoSaude" (codigo, nome, uf, "updatedAt")
                    VALUES (%s, %s, 'SP', %s)
                    ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, "updatedAt" = EXCLUDED."updatedAt"
                    RETURNING id
                    """,
                    (codigo, drs["nome"], agora),
                )
                row = cur.fetchone()
                assert row is not None
                regiao_id_por_numero[drs["numero"]] = row[0]
        print(f"[geografia] {len(regiao_id_por_numero)} RegiaoSaude (DRS reais) gravados")

        # --- Carga: Municipio (645 reais) ---
        gravados = 0
        rejeitados = 0
        with conn.cursor() as cur:
            for m in municipios_ibge:
                codigo7 = m["codigo_ibge7"]
                codigo6 = codigo7[:6]
                drs_linha = drs_por_municipio.get(codigo6)
                if drs_linha is None:
                    rejeitados += 1
                    continue
                regiao_id = regiao_id_por_numero[drs_linha["drs_numero"]]
                centro = centroides.get(codigo7)
                lat, lon = centro if centro else (None, None)

                cur.execute(
                    """
                    INSERT INTO silver."Municipio"
                        ("codigoIbge7", "codigoIbge6", nome, uf, "regiaoSaudeId", latitude, longitude, "updatedAt")
                    VALUES (%s, %s, %s, 'SP', %s, %s, %s, %s)
                    ON CONFLICT ("codigoIbge7") DO UPDATE SET
                        nome = EXCLUDED.nome,
                        "regiaoSaudeId" = EXCLUDED."regiaoSaudeId",
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        "updatedAt" = EXCLUDED."updatedAt"
                    """,
                    (codigo7, codigo6, m["nome"], regiao_id, lat, lon, agora),
                )
                gravados += 1
        print(f"[geografia] {gravados} municipios gravados, {rejeitados} rejeitados (sem DRS mapeado)")

        execucao.linhas_processadas = gravados
        execucao.linhas_rejeitadas = rejeitados
        execucao.finalizar(status="SUCESSO" if rejeitados == 0 else "PARCIAL")
        conn.commit()
        print(f"[geografia] IngestaoExecucao {execucao.id} concluida")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run()
