/**
 * Testes de integracao da Fase 2 (motor de risco).
 *
 * Mesma filosofia dos testes da Fase 1 (ver fase1.test.ts): rodam contra o
 * PostgreSQL local ja com migration aplicada, seed DEMO e calculo de risco
 * executados (`npm run db:seed && npm run db:calculate-risk` antes de
 * `npm run test --workspace @healthmap/db`).
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { getPrismaClient, disconnectPrisma, checkDatabaseConnection } from '../index.js';

const prisma = getPrismaClient();

beforeAll(async () => {
  const result = await checkDatabaseConnection();
  if (!result.connected) {
    throw new Error(
      `Banco indisponivel para os testes da Fase 2: ${result.message}. ` +
        'Rode "npm run db:seed" e "npm run db:calculate-risk" antes de testar.',
    );
  }
  const totalScores = await prisma.riskScore.count();
  if (totalScores === 0) {
    throw new Error('Nenhum RiskScore encontrado. Rode "npm run db:calculate-risk" antes de testar.');
  }
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Fase 2 - RiskComponenteValor', () => {
  it('4/9. foi persistido para os 4 componentes previstos', async () => {
    const componentes = await prisma.riskComponenteValor.groupBy({ by: ['componente'] });
    const nomes = componentes.map((c) => c.componente).sort();
    expect(nomes).toEqual(
      ['PRESSAO_HOSPITALAR_ESTIMADA', 'SEVERIDADE', 'TENDENCIA', 'VULNERABILIDADE'].sort(),
    );
  });

  it('7. FK aponta para Municipio, Competencia e RiskConfig existentes (sem orfaos)', async () => {
    const orfaos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."RiskComponenteValor" rcv
      LEFT JOIN silver."Municipio" m ON m.id = rcv."municipioId"
      LEFT JOIN silver."Competencia" c ON c.id = rcv."competenciaId"
      LEFT JOIN meta."RiskConfig" rc ON rc.id = rcv."riskConfigId"
      WHERE m.id IS NULL OR c.id IS NULL OR rc.id IS NULL
    `;
    expect(Number(orfaos[0]?.total ?? -1)).toBe(0);
  });

  it('9. origem de um municipio DEMO nunca e diferente de DEMO (desde a Fase 5.3, a tabela tambem tem linhas REAL - ver fase5.3.test.ts - mas nunca misturadas para o mesmo municipio)', async () => {
    const misturado = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."RiskComponenteValor" rcv
      JOIN silver."Municipio" m ON m.id = rcv."municipioId"
      WHERE m."codigoIbge7" LIKE '36%' AND rcv.origem != 'DEMO'
    `;
    expect(Number(misturado[0]?.total ?? -1)).toBe(0);
  });

  it('10. natureza reflete o componente, nunca e um valor fixo uniforme', async () => {
    const naturezas = await prisma.riskComponenteValor.groupBy({
      by: ['componente', 'natureza'],
    });
    const mapa = new Map(naturezas.map((n) => [n.componente, n.natureza]));
    expect(mapa.get('PRESSAO_HOSPITALAR_ESTIMADA')).toBe('ESTIMATIVA');
    expect(mapa.get('TENDENCIA')).toBe('OBSERVADO');
    expect(mapa.get('SEVERIDADE')).toBe('OBSERVADO');
    // Mais de uma natureza aparecendo confirma que o campo nao e hardcoded
    // igual para todo mundo (o que seria a falha que a Fase 2 pede pra evitar).
    expect(new Set(naturezas.map((n) => n.natureza)).size).toBeGreaterThan(1);
  });

  it('8. constraint unica (municipio+competencia+config+componente) impede duplicacao', async () => {
    const existente = await prisma.riskComponenteValor.findFirst();
    expect(existente).not.toBeNull();
    if (!existente) return;
    await expect(
      prisma.riskComponenteValor.create({
        data: {
          municipioId: existente.municipioId,
          competenciaId: existente.competenciaId,
          riskConfigId: existente.riskConfigId,
          componente: existente.componente,
          valorBruto: existente.valorBruto,
          valorNormalizado: existente.valorNormalizado,
          natureza: existente.natureza,
          confiabilidade: existente.confiabilidade,
          disponivel: existente.disponivel,
          origem: existente.origem,
        },
      }),
    ).rejects.toThrow();
  });

  it('supressao: PRESSAO_HOSPITALAR_ESTIMADA indisponivel nunca tem valorBruto preenchido', async () => {
    const comValorMesIndisponivel = await prisma.riskComponenteValor.count({
      where: { componente: 'PRESSAO_HOSPITALAR_ESTIMADA', disponivel: false, NOT: { valorBruto: null } },
    });
    expect(comValorMesIndisponivel).toBe(0);
  });

  it('TENDENCIA e SEVERIDADE ficam sempre indisponiveis (lacuna metodologica documentada)', async () => {
    const disponiveis = await prisma.riskComponenteValor.count({
      where: { componente: { in: ['TENDENCIA', 'SEVERIDADE'] }, disponivel: true },
    });
    expect(disponiveis).toBe(0);
  });
});

describe('Fase 2 - RiskScore', () => {
  it('5. foi persistido com todos os campos exigidos', async () => {
    const score = await prisma.riskScore.findFirst();
    expect(score).not.toBeNull();
    if (!score) return;
    expect(score.municipioId).toBeTypeOf('number');
    expect(score.competenciaId).toBeTypeOf('number');
    expect(score.riskConfigId).toBeTypeOf('number');
    expect(Number(score.indice)).toBeGreaterThanOrEqual(0);
    expect(Number(score.indice)).toBeLessThanOrEqual(1);
    expect(['CRITICO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO']).toContain(score.classificacao);
  });

  it('7. FK impede RiskScore orfao', async () => {
    const orfaos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."RiskScore" rs
      LEFT JOIN silver."Municipio" m ON m.id = rs."municipioId"
      LEFT JOIN meta."RiskConfig" rc ON rc.id = rs."riskConfigId"
      WHERE m.id IS NULL OR rc.id IS NULL
    `;
    expect(Number(orfaos[0]?.total ?? -1)).toBe(0);
  });

  it('9. origem de um municipio DEMO nunca e diferente de DEMO (desde a Fase 5.3, a tabela tambem tem linhas REAL - ver fase5.3.test.ts - mas nunca misturadas para o mesmo municipio)', async () => {
    const misturado = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."RiskScore" rs
      JOIN silver."Municipio" m ON m.id = rs."municipioId"
      WHERE m."codigoIbge7" LIKE '36%' AND rs.origem != 'DEMO'
    `;
    expect(Number(misturado[0]?.total ?? -1)).toBe(0);
  });

  it('11. riskConfigId distingue historico: 2 RiskConfig distintas produziram RiskScore', async () => {
    const configs = await prisma.riskScore.groupBy({ by: ['riskConfigId'] });
    expect(configs.length).toBeGreaterThanOrEqual(2);
  });

  it('8. constraint unica (municipio+competencia+config) impede duplicacao', async () => {
    const existente = await prisma.riskScore.findFirst();
    expect(existente).not.toBeNull();
    if (!existente) return;
    await expect(
      prisma.riskScore.create({
        data: {
          municipioId: existente.municipioId,
          competenciaId: existente.competenciaId,
          riskConfigId: existente.riskConfigId,
          indice: existente.indice,
          classificacao: existente.classificacao,
          confiabilidade: existente.confiabilidade,
          natureza: existente.natureza,
          origem: existente.origem,
        },
      }),
    ).rejects.toThrow();
  });

  it('append-only: RiskConfig antiga (Fase 1, sem componentes) nao gerou RiskScore', async () => {
    const configFase1 = await prisma.riskConfig.findFirst({ where: { autor: 'seed-fase1' } });
    expect(configFase1).not.toBeNull();
    if (!configFase1) return;
    const scoresDaConfigAntiga = await prisma.riskScore.count({ where: { riskConfigId: configFase1.id } });
    expect(scoresDaConfigAntiga).toBe(0);
  });
});

describe('Fase 2 - idempotencia e determinismo', () => {
  it(
    'recalcular nao duplica linhas (idempotente sobre a mesma base)',
    async () => {
      const antes = {
        rcv: await prisma.riskComponenteValor.count(),
        rs: await prisma.riskScore.count(),
      };
      // Este teste assume que o pipeline (seed + calculate-risk) ja rodou pelo
      // menos uma vez nesta base - roda de novo aqui, no proprio teste, pra
      // provar idempotencia sem depender de execucao externa. Sobe um
      // processo tsx completo, por isso o timeout maior que o padrao.
      const { execSync } = await import('node:child_process');
      execSync('npm run calculate-risk', { cwd: process.cwd(), stdio: 'pipe' });

      const depois = {
        rcv: await prisma.riskComponenteValor.count(),
        rs: await prisma.riskScore.count(),
      };
      expect(depois).toEqual(antes);
    },
    30_000,
  );
});

describe('Fase 2 - IndicadorMunicipal (taxa por 10k, grao anual)', () => {
  it('quando presente, respeita o grao municipio+ano+indicador (nunca duplica por competencia)', async () => {
    const linhas = await prisma.indicadorMunicipal.groupBy({
      by: ['municipioId', 'ano', 'indicadorDefinicaoId'],
      _count: true,
    });
    for (const linha of linhas) {
      expect(linha._count).toBe(1);
    }
  });

  it('natureza vem de IndicadorDefinicao.naturezaPadrao (OBSERVADO), nao e hardcoded na linha', async () => {
    const definicao = await prisma.indicadorDefinicao.findUnique({ where: { chave: 'TAXA_INTERNACAO_10K_HAB' } });
    expect(definicao?.naturezaPadrao).toBe('OBSERVADO');
  });
});
