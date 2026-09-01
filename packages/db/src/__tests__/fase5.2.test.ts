/**
 * Testes de integracao da Fase 5.2 (populacao REAL: estimativa anual IBGE,
 * tabela SIDRA 6579, e o indicador TAXA_INTERNACAO_10K_HAB calculado sobre
 * ela + SIH REAL).
 *
 * Mesma filosofia de fase5.test.ts: rodam contra o PostgreSQL local ja com
 * `python etl/ingest_populacao.py` e `npm run db:calculate-indicadores-real`
 * executados (alem da ingestao SIH REAL via Docker, ver etl/README.md).
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { getPrismaClient, disconnectPrisma, checkDatabaseConnection, getAgregadoPopulacaoEstimada } from '../index.js';

const prisma = getPrismaClient();

beforeAll(async () => {
  const result = await checkDatabaseConnection();
  if (!result.connected) {
    throw new Error(`Banco indisponivel para os testes da Fase 5.2: ${result.message}.`);
  }
  const total = await prisma.populacaoEstimada.count({ where: { origem: 'REAL' } });
  if (total === 0) {
    throw new Error('Nenhuma PopulacaoEstimada REAL encontrada. Rode "python etl/ingest_populacao.py" antes de testar.');
  }
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Fase 5.2 - PopulacaoEstimada REAL (IBGE, tabela 6579)', () => {
  it('existem linhas REAL para os 645 municipios em pelo menos um ano', async () => {
    const anos = await prisma.populacaoEstimada.findMany({ where: { origem: 'REAL' }, select: { ano: true }, distinct: ['ano'] });
    expect(anos.length).toBeGreaterThan(0);
    for (const { ano } of anos) {
      const total = await prisma.populacaoEstimada.count({ where: { origem: 'REAL', ano } });
      expect(total).toBe(645);
    }
  });

  it('todo registro REAL aponta para um municipio REAL (nunca para municipio DEMO)', async () => {
    const misturado = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."PopulacaoEstimada" p
      JOIN silver."Municipio" m ON m.id = p."municipioId"
      WHERE p.origem = 'REAL' AND m."codigoIbge7" NOT LIKE '35%'
    `;
    expect(Number(misturado[0]?.total ?? -1)).toBe(0);
  });

  it('nenhuma populacaoTotal REAL e negativa ou zero (fonte nunca publica municipio despovoado)', async () => {
    const invalidos = await prisma.populacaoEstimada.count({ where: { origem: 'REAL', populacaoTotal: { lte: 0 } } });
    expect(invalidos).toBe(0);
  });

  it('todo registro REAL tem execucaoId valido (linhagem sem orfaos)', async () => {
    const orfaos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."PopulacaoEstimada" p
      LEFT JOIN meta."IngestaoExecucao" e ON e.id = p."execucaoId"
      WHERE p.origem = 'REAL' AND e.id IS NULL
    `;
    expect(Number(orfaos[0]?.total ?? -1)).toBe(0);
  });

  it('constraint unica (municipio+ano) rejeita insert duplicado (prova de idempotencia)', async () => {
    const existente = await prisma.populacaoEstimada.findFirstOrThrow({ where: { origem: 'REAL' } });
    await expect(
      prisma.populacaoEstimada.create({
        data: {
          municipioId: existente.municipioId,
          ano: existente.ano,
          populacaoTotal: existente.populacaoTotal,
          origem: existente.origem,
          execucaoId: existente.execucaoId,
        },
      }),
    ).rejects.toThrow();
  });

  it('getAgregadoPopulacaoEstimada devolve o mesmo total gravado para um municipio conhecido', async () => {
    const linha = await prisma.populacaoEstimada.findFirstOrThrow({ where: { origem: 'REAL' } });
    const agregado = await getAgregadoPopulacaoEstimada(prisma, linha.ano);
    const doMunicipio = agregado.find((a) => a.municipioId === linha.municipioId);
    expect(doMunicipio?.populacaoTotal).toBe(linha.populacaoTotal);
  });
});

describe('Fase 5.2 - TAXA_INTERNACAO_10K_HAB REAL (IndicadorMunicipal)', () => {
  it('IndicadorDefinicao TAXA_INTERNACAO_10K_HAB existe (reaproveitada do DEMO, mesma definicao)', async () => {
    const definicao = await prisma.indicadorDefinicao.findUnique({ where: { chave: 'TAXA_INTERNACAO_10K_HAB' } });
    expect(definicao).not.toBeNull();
  });

  it('todo IndicadorMunicipal REAL de TAXA_INTERNACAO_10K_HAB tem denominador (populacao) preenchido', async () => {
    const semDenominador = await prisma.indicadorMunicipal.count({
      where: { origem: 'REAL', indicadorDefinicaoId: 'TAXA_INTERNACAO_10K_HAB', denominador: null },
    });
    expect(semDenominador).toBe(0);
  });

  it('todo IndicadorMunicipal REAL de TAXA_INTERNACAO_10K_HAB aponta para um municipio REAL', async () => {
    const misturado = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."IndicadorMunicipal" i
      JOIN silver."Municipio" m ON m.id = i."municipioId"
      WHERE i.origem = 'REAL' AND i."indicadorDefinicaoId" = 'TAXA_INTERNACAO_10K_HAB' AND m."codigoIbge7" NOT LIKE '35%'
    `;
    expect(Number(misturado[0]?.total ?? -1)).toBe(0);
  });

  it('valor e denominador sao sempre positivos (nunca uma taxa negativa ou populacao <= 0)', async () => {
    const invalidos = await prisma.indicadorMunicipal.count({
      where: {
        origem: 'REAL',
        indicadorDefinicaoId: 'TAXA_INTERNACAO_10K_HAB',
        OR: [{ valor: { lte: 0 } }, { denominador: { lte: 0 } }],
      },
    });
    expect(invalidos).toBe(0);
  });
});
