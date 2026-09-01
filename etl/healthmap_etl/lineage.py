"""
Proveniencia (FonteDados / IngestaoExecucao / QualidadeCheck) - mesmo padrao
ja usado pelos seeds DEMO em TypeScript (packages/db/src/scripts/seed-demo.ts),
agora para a ingestao REAL em Python. Toda linha `gold` escrita pelo ETL real
aponta para uma IngestaoExecucao criada aqui - "de onde veio este dado?" e
sempre respondivel sem olhar o codigo do ETL (secao 13 do pedido da Fase 5).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

import psycopg


def _novo_id() -> str:
    # Prisma gera cuid() quando o INSERT vem do Prisma Client - o ETL escreve
    # SQL direto (nunca passa por packages/db, ver db.py), entao gera seu
    # proprio identificador unico para as colunas String @id. uuid4 nao
    # colide com os cuids gerados pelo lado TypeScript.
    return str(uuid.uuid4())


def upsert_fonte_dados(
    conn: psycopg.Connection,
    *,
    chave: str,
    nome: str,
    url: str | None,
    licenca: str | None,
    periodicidade: str,
    defasagem_esperada_dias: int | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO meta."FonteDados"
                (chave, nome, url, licenca, periodicidade, "defasagemEsperadaDias", ativo)
            VALUES (%s, %s, %s, %s, %s, %s, true)
            ON CONFLICT (chave) DO UPDATE SET
                nome = EXCLUDED.nome,
                url = EXCLUDED.url,
                licenca = EXCLUDED.licenca,
                periodicidade = EXCLUDED.periodicidade,
                "defasagemEsperadaDias" = EXCLUDED."defasagemEsperadaDias"
            """,
            (chave, nome, url, licenca, periodicidade, defasagem_esperada_dias),
        )


def upsert_indicador_definicao(
    conn: psycopg.Connection,
    *,
    chave: str,
    nome: str,
    fonte: str,
    unidade: str,
    periodicidade: str,
    direcao: str,
    eixo_territorial: str,
    natureza_padrao: str,
    nota_metodologica: str | None = None,
) -> None:
    """
    Cria/atualiza uma linha de meta."IndicadorDefinicao" a partir do ETL -
    ate a Fase 5.4 todo IndicadorDefinicao era criado por seed-demo.ts
    (TypeScript). Um indicador REAL novo (ex.: vulnerabilidade social) pode
    nao ter equivalente DEMO nenhum, entao o proprio ETL precisa garantir
    que a definicao existe antes de gravar IndicadorMunicipal que aponte
    para ela (FK).
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO meta."IndicadorDefinicao"
                (chave, nome, fonte, unidade, periodicidade, direcao, "eixoTerritorial", "naturezaPadrao", "notaMetodologica", ativo)
            VALUES (%s, %s, %s, %s, %s, %s::meta."IndicadorDirecao", %s::meta."EixoTerritorial", %s::meta."Natureza", %s, true)
            ON CONFLICT (chave) DO UPDATE SET
                nome = EXCLUDED.nome,
                fonte = EXCLUDED.fonte,
                unidade = EXCLUDED.unidade,
                periodicidade = EXCLUDED.periodicidade,
                direcao = EXCLUDED.direcao,
                "eixoTerritorial" = EXCLUDED."eixoTerritorial",
                "naturezaPadrao" = EXCLUDED."naturezaPadrao",
                "notaMetodologica" = EXCLUDED."notaMetodologica"
            """,
            (chave, nome, fonte, unidade, periodicidade, direcao, eixo_territorial, natureza_padrao, nota_metodologica),
        )


@dataclass
class Execucao:
    """Uma IngestaoExecucao em andamento - contadores acumulam conforme o pipeline processa linhas."""

    id: str
    conn: psycopg.Connection = field(repr=False)
    linhas_processadas: int = 0
    linhas_rejeitadas: int = 0

    def finalizar(self, *, status: str, mensagem_erro: str | None = None) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                UPDATE meta."IngestaoExecucao"
                SET status = %s,
                    "linhasProcessadas" = %s,
                    "linhasRejeitadas" = %s,
                    "finalizadoEm" = %s,
                    "mensagemErro" = %s
                WHERE id = %s
                """,
                (status, self.linhas_processadas, self.linhas_rejeitadas, datetime.now(timezone.utc), mensagem_erro, self.id),
            )


def iniciar_execucao(
    conn: psycopg.Connection,
    *,
    fonte_dados_chave: str,
    versao_pipeline: str,
    competencia_id: int | None = None,
    hash_insumos: str | None = None,
) -> Execucao:
    exec_id = _novo_id()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO meta."IngestaoExecucao"
                (id, "fonteDadosId", "competenciaId", status, "hashInsumos", "versaoPipeline", "iniciadoEm")
            VALUES (%s, %s, %s, 'INICIADA', %s, %s, %s)
            """,
            (exec_id, fonte_dados_chave, competencia_id, hash_insumos, versao_pipeline, datetime.now(timezone.utc)),
        )
    return Execucao(id=exec_id, conn=conn)


def registrar_qualidade_check(
    conn: psycopg.Connection,
    *,
    execucao_id: str,
    regra: str,
    severidade: str,
    passou: bool,
    linhas_afetadas: int | None = None,
    detalhe: str | None = None,
) -> None:
    if severidade not in ("BLOQUEANTE", "ALERTA"):
        raise ValueError(f"severidade invalida: {severidade!r} (esperado BLOQUEANTE ou ALERTA)")
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO meta."QualidadeCheck"
                (id, "ingestaoExecucaoId", regra, severidade, passou, "linhasAfetadas", detalhe)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (_novo_id(), execucao_id, regra, severidade, passou, linhas_afetadas, detalhe),
        )
