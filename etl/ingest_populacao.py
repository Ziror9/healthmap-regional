"""
Ingestao REAL da estimativa anual de populacao (IBGE, tabela SIDRA 6579,
"Estimativas de Populacao Residente") - insumo do denominador de
TAXA_INTERNACAO_10K_HAB para os anos que ja tem SIH/SUS REAL ingerido
(ver etl/ingest_sih.py). O calculo do indicador em si NAO acontece aqui -
so o insumo (populacao) e gravado; packages/risk (TypeScript) e quem calcula
a taxa, via calculate-indicadores-real.ts (CLAUDE.md: "o ETL entrega
insumos... nao calcula o indice").

Uso, a partir da raiz do repositorio: python etl/ingest_populacao.py

Por que uma tabela nova (PopulacaoEstimada), nao Populacao: a fonte so
publica o TOTAL por municipio/ano - sem quebra por faixaEtaria/sexo, que so
existe em ano de Censo (tabela 9514, nao ingerida nesta fase). Forcar essa
estimativa em Populacao (onde faixaEtaria/sexo sao NOT NULL) exigiria
inventar uma distribuicao que a fonte nao da - ver comentario do model
PopulacaoEstimada em packages/db/prisma/schema.prisma.

Idempotente: upsert por chave natural (municipioId, ano) - reexecutar
converge, nao duplica.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from healthmap_etl import db, lineage, quality  # noqa: E402
from healthmap_etl.sources import ibge  # noqa: E402

VERSAO_PIPELINE = "ingest-populacao@1.0.0"
FONTE_POPULACAO = "IBGE_POPULACAO_ESTIMADA"

# Fase 5.2: os mesmos anos ja cobertos por SIH/SUS REAL (2024, ver
# ingest_sih.py::COMPETENCIAS_POC) + 2025, buscado de forma oportunista -
# se a fonte ainda nao publicou a estimativa de um ano, o script reporta a
# ausencia e segue (nunca inventa nem interpola).
# Fase 5.6: 2023 adicionado - e o ano do SIM REAL (etl/ingest_sim.py), sem
# populacao 2023 o indicador TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB nao tem
# denominador (achado ao rodar calculate-indicadores-mortalidade-real.ts
# pela primeira vez: 0 municipios com populacao 2023 no banco).
ANOS_SOLICITADOS: list[int] = [2023, 2024, 2025]


def run() -> None:
    conn = db.obter_conexao()
    try:
        lineage.upsert_fonte_dados(
            conn,
            chave=FONTE_POPULACAO,
            nome="IBGE - Estimativas de Populacao Residente (tabela SIDRA 6579)",
            url="https://sidra.ibge.gov.br/tabela/6579",
            licenca="Dado publico (Lei de Acesso a Informacao 12.527/2011)",
            periodicidade="Anual",
        )
        conn.commit()

        with conn.cursor() as cur:
            cur.execute('SELECT id, "codigoIbge7" FROM silver."Municipio" WHERE "codigoIbge7" LIKE %s', ("35%",))
            municipio_id_por_codigo7 = {codigo7: mid for mid, codigo7 in cur.fetchall()}
        print(f"[populacao] {len(municipio_id_por_codigo7)} municipios REAL carregados para cruzamento por codigo IBGE7")

        print(f"[populacao] buscando estimativa anual (IBGE tabela 6579) para {ANOS_SOLICITADOS}...")
        linhas = ibge.buscar_populacao_estimada_sp(ANOS_SOLICITADOS)
        anos_recebidos = sorted({linha["ano"] for linha in linhas})
        anos_ausentes = [ano for ano in ANOS_SOLICITADOS if ano not in anos_recebidos]
        print(
            f"[populacao] {len(linhas)} linhas (municipio x ano) recebidas - "
            f"anos com dado: {anos_recebidos}, ausentes no periodo solicitado: {anos_ausentes}"
        )

        execucao = lineage.iniciar_execucao(conn, fonte_dados_chave=FONTE_POPULACAO, versao_pipeline=VERSAO_PIPELINE)

        lineage.registrar_qualidade_check(
            conn, execucao_id=execucao.id, regra="populacao_ano_solicitado_disponivel",
            severidade="ALERTA", passou=len(anos_ausentes) == 0, linhas_afetadas=len(anos_ausentes),
            detalhe=f"anos sem estimativa publicada pela fonte no periodo solicitado: {anos_ausentes}" if anos_ausentes else None,
        )

        chaves_municipio_ano = [f"{linha['codigo_ibge7']}-{linha['ano']}" for linha in linhas]
        ok_dup, detalhe_dup = quality.check_sem_duplicidade(chaves_municipio_ano, "municipio-ano")
        lineage.registrar_qualidade_check(
            conn, execucao_id=execucao.id, regra="populacao_sem_duplicidade",
            severidade="BLOQUEANTE", passou=ok_dup, detalhe=detalhe_dup,
        )
        if not ok_dup:
            execucao.finalizar(status="FALHA", mensagem_erro=detalhe_dup)
            conn.commit()
            raise SystemExit(f"[populacao] check bloqueante falhou: {detalhe_dup}")

        gravados = 0
        rejeitados = 0
        with conn.cursor() as cur:
            for linha in linhas:
                municipio_id = municipio_id_por_codigo7.get(linha["codigo_ibge7"])
                ok_valor, detalhe_valor = quality.check_nao_negativo(linha["populacao_total"], "populacaoTotal")
                if municipio_id is None or not ok_valor:
                    rejeitados += 1
                    lineage.registrar_qualidade_check(
                        conn, execucao_id=execucao.id, regra="populacao_municipio_e_valor_validos",
                        severidade="ALERTA", passou=False, linhas_afetadas=1,
                        detalhe=detalhe_valor or f"municipio codigo_ibge7={linha['codigo_ibge7']!r} nao encontrado",
                    )
                    continue
                cur.execute(
                    """
                    INSERT INTO gold."PopulacaoEstimada"
                        ("municipioId", ano, "populacaoTotal", origem, "execucaoId")
                    VALUES (%s, %s, %s, 'REAL', %s)
                    ON CONFLICT ("municipioId", ano) DO UPDATE SET
                        "populacaoTotal" = EXCLUDED."populacaoTotal",
                        origem = EXCLUDED.origem,
                        "execucaoId" = EXCLUDED."execucaoId"
                    """,
                    (municipio_id, linha["ano"], linha["populacao_total"], execucao.id),
                )
                gravados += 1

        execucao.linhas_processadas = gravados
        execucao.linhas_rejeitadas = rejeitados
        execucao.finalizar(status="SUCESSO" if rejeitados == 0 and not anos_ausentes else "PARCIAL")
        conn.commit()
        print(f"[populacao] PopulacaoEstimada: {gravados} linhas gravadas, {rejeitados} rejeitadas")
        print(f"[populacao] IngestaoExecucao {execucao.id} concluida")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run()
