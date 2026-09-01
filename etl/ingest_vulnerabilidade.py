"""
Ingestao REAL do indicador de vulnerabilidade social (IPVS/SEADE) - primeira
fonte para o componente VULNERABILIDADE do Radar, sem definicao desde a
Fase 0 (docs/risk-methodology.md #2.4).

Uso, a partir da raiz do repositorio: python etl/ingest_vulnerabilidade.py
(baixa os arquivos automaticamente para HEALTHMAP_BRONZE_DIR/ipvs na
primeira execucao - ver etl/healthmap_etl/sources/seade_ipvs.py).

DECISAO METODOLOGICA (aprovada explicitamente pelo usuario - ver
docs/fase-5.4-relatorio.md): a fonte oficial (IPVS, Fundacao SEADE) so
existe em grao de setor censitario, nao municipio. Este script calcula uma
MEDIA PONDERADA POR POPULACAO do C_IPVS por municipio - uma aproximacao
deste projeto, nao um produto oficial da SEADE. Por isso:
  - natureza = ESTIMATIVA (nunca OBSERVADO) - a IndicadorDefinicao criada
    aqui documenta isso explicitamente em notaMetodologica;
  - origem = REAL (os insumos - classificacao IPVS e populacao por setor -
    sao dado oficial; so a agregacao para municipio e nossa);
  - denominador grava a populacao efetivamente usada no calculo (soma dos
    setores com par nos dois arquivos), para auditabilidade.

Idempotente: upsert por chave natural (municipioId, ano, indicadorDefinicaoId).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from healthmap_etl import db, lineage, quality  # noqa: E402
from healthmap_etl.sources import seade_ipvs  # noqa: E402

VERSAO_PIPELINE = "ingest-vulnerabilidade@1.0.0"
FONTE_IPVS = "SEADE_IPVS"
INDICADOR_CHAVE = "IPVS_MEDIA_PONDERADA_SETOR"
ANO_REFERENCIA = 2022  # ano do IPVS/Censo usado (proximo IPVS so no Censo seguinte)


def run() -> None:
    conn = db.obter_conexao()
    try:
        print("[vulnerabilidade] garantindo arquivos em HEALTHMAP_BRONZE_DIR (baixa se ausente)...")
        diretorio = seade_ipvs.diretorio_bronze()
        caminho_dbf, caminho_pop = seade_ipvs.garantir_arquivos_bronze(diretorio)

        print("[vulnerabilidade] lendo IPVS por setor censitario...")
        ipvs_por_setor = seade_ipvs.carregar_ipvs_por_setor(caminho_dbf)
        print(f"[vulnerabilidade] {len(ipvs_por_setor)} setores no arquivo IPVS")

        print("[vulnerabilidade] lendo populacao por setor censitario...")
        populacao_por_setor = seade_ipvs.carregar_populacao_por_setor(caminho_pop)
        print(f"[vulnerabilidade] {len(populacao_por_setor)} setores no arquivo de populacao")

        print("[vulnerabilidade] calculando media ponderada por municipio...")
        linhas = seade_ipvs.calcular_ipvs_ponderado_por_municipio(ipvs_por_setor, populacao_por_setor)
        print(f"[vulnerabilidade] {len(linhas)} municipios com pelo menos 1 setor classificavel")

        lineage.upsert_fonte_dados(
            conn,
            chave=FONTE_IPVS,
            nome="IPVS - Indice Paulista de Vulnerabilidade Social (Fundacao SEADE), agregado por municipio via media ponderada por populacao (Fase 5.4)",
            url="https://repositorio.seade.gov.br/dataset/social/resource/35c74698-a368-4f0c-8f14-3694896a9d74",
            licenca="Dado publico do governo do estado de SP - licenca nao declarada na pagina do recurso nesta sessao (ver docstring de seade_ipvs.py)",
            periodicidade="Decenal (proximo Censo)",
        )
        lineage.upsert_indicador_definicao(
            conn,
            chave=INDICADOR_CHAVE,
            nome="Indice de Vulnerabilidade Social (IPVS/SEADE, media ponderada por populacao)",
            fonte="Fundacao SEADE (IPVS 2022, setor censitario) + Censo 2022 (populacao por setor), agregado por este projeto",
            unidade="grupo IPVS (1=menor vulnerabilidade .. 7=maior vulnerabilidade), media ponderada",
            periodicidade="Decenal (proximo Censo)",
            direcao="MAIOR_PIOR",
            eixo_territorial="RESIDENCIA",
            natureza_padrao="ESTIMATIVA",
            nota_metodologica=(
                "SEADE so publica IPVS por setor censitario, nao por municipio - este valor e uma "
                "MEDIA PONDERADA POR POPULACAO dos C_IPVS (1-7) dos setores do municipio, calculada "
                "por este projeto (nao um produto oficial da SEADE). Setores sem classificacao "
                "('Nao classificado' na fonte) ou sem populacao correspondente sao excluidos do "
                "calculo do seu municipio, nunca zerados ou inventados - ver denominador (populacao "
                "efetivamente usada) e docs/fase-5.4-relatorio.md para a cobertura exata."
            ),
        )
        conn.commit()

        with conn.cursor() as cur:
            cur.execute('SELECT id, "codigoIbge7" FROM silver."Municipio" WHERE "codigoIbge7" LIKE %s', ("35%",))
            municipio_id_por_codigo7 = {codigo7: mid for mid, codigo7 in cur.fetchall()}
        print(f"[vulnerabilidade] {len(municipio_id_por_codigo7)} municipios REAL carregados para cruzamento por codigo IBGE7")

        execucao = lineage.iniciar_execucao(conn, fonte_dados_chave=FONTE_IPVS, versao_pipeline=VERSAO_PIPELINE)

        total_setores = sum(l["setores_no_municipio"] for l in linhas)
        total_setores_usados = sum(l["setores_usados"] for l in linhas)
        taxa_cobertura = total_setores_usados / total_setores if total_setores else 0.0
        lineage.registrar_qualidade_check(
            conn, execucao_id=execucao.id, regra="ipvs_taxa_cobertura_setores",
            severidade="ALERTA", passou=taxa_cobertura >= 0.8, linhas_afetadas=total_setores - total_setores_usados,
            detalhe=f"{total_setores_usados}/{total_setores} setores usados no calculo ponderado ({taxa_cobertura:.1%})",
        )

        gravados = 0
        rejeitados = 0
        with conn.cursor() as cur:
            for linha in linhas:
                municipio_id = municipio_id_por_codigo7.get(linha["codigo_ibge7"])
                ok_valor, detalhe_valor = quality.check_nao_negativo(linha["valor"], "valor")
                if municipio_id is None or not ok_valor:
                    rejeitados += 1
                    lineage.registrar_qualidade_check(
                        conn, execucao_id=execucao.id, regra="ipvs_municipio_e_valor_validos",
                        severidade="ALERTA", passou=False, linhas_afetadas=1,
                        detalhe=detalhe_valor or f"municipio codigo_ibge7={linha['codigo_ibge7']!r} nao encontrado",
                    )
                    continue
                cur.execute(
                    """
                    INSERT INTO gold."IndicadorMunicipal"
                        ("municipioId", ano, "indicadorDefinicaoId", valor, denominador, origem, "execucaoId")
                    VALUES (%s, %s, %s, %s, %s, 'REAL', %s)
                    ON CONFLICT ("municipioId", ano, "indicadorDefinicaoId") DO UPDATE SET
                        valor = EXCLUDED.valor,
                        denominador = EXCLUDED.denominador,
                        origem = EXCLUDED.origem,
                        "execucaoId" = EXCLUDED."execucaoId"
                    """,
                    (municipio_id, ANO_REFERENCIA, INDICADOR_CHAVE, linha["valor"], linha["populacao_usada"], execucao.id),
                )
                gravados += 1

        execucao.linhas_processadas = gravados
        execucao.linhas_rejeitadas = rejeitados
        execucao.finalizar(status="SUCESSO" if rejeitados == 0 else "PARCIAL")
        conn.commit()
        print(f"[vulnerabilidade] IndicadorMunicipal REAL: {gravados} gravados, {rejeitados} rejeitados")
        print(f"[vulnerabilidade] cobertura de setores no calculo: {total_setores_usados}/{total_setores} ({taxa_cobertura:.1%})")
        print(f"[vulnerabilidade] IngestaoExecucao {execucao.id} concluida")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run()
