/**
 * Testes de integracao da Fase 5.5 (grao REGIONAL - fatos e Radar por
 * RegiaoSaude/DRS, com supressao independente do grao municipal).
 *
 * Mesma filosofia das fases anteriores: rodam contra o PostgreSQL local ja
 * com a ingestao SIH/CNES-historico REAL (que agora tambem grava o grao
 * regional) e `npm run db:calculate-risk-regional` executados.
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
    throw new Error(`Banco indisponivel para os testes da Fase 5.5: ${result.message}.`);
  }
  const total = await prisma.riskScoreRegional.count({ where: { origem: 'REAL' } });
  if (total === 0) {
    throw new Error(
      'Nenhum RiskScoreRegional REAL encontrado. Rode a ingestao SIH/CNES-historico via Docker e ' +
        '"npm run db:calculate-risk-regional" antes de testar.',
    );
  }
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Fase 5.5 - Fatos regionais REAL (supressao independente do grao municipal)', () => {
  it('FatoInternacaoResidenciaRegional/Local tem MUITO menos supressao que o grao municipal (a razao de existir desta fase)', async () => {
    const competencia = await prisma.competencia.findFirstOrThrow({ where: { ano: 2024, mes: 2 } });

    const celulasRegionaisResidencia = await prisma.fatoInternacaoResidenciaRegional.count({
      where: { competenciaId: competencia.id, origem: 'REAL' },
    });
    const suprimidasRegionaisResidencia = await prisma.fatoInternacaoResidenciaRegional.count({
      where: { competenciaId: competencia.id, origem: 'REAL', suprimido: true },
    });
    const taxaSupressaoRegional = suprimidasRegionaisResidencia / celulasRegionaisResidencia;

    const celulasMunicipaisResidencia = await prisma.fatoInternacaoResidencia.count({
      where: { competenciaId: competencia.id, origem: 'REAL' },
    });
    const suprimidasMunicipaisResidencia = await prisma.fatoInternacaoResidencia.count({
      where: { competenciaId: competencia.id, origem: 'REAL', suprimido: true },
    });
    const taxaSupressaoMunicipal = suprimidasMunicipaisResidencia / celulasMunicipaisResidencia;

    expect(celulasRegionaisResidencia).toBeGreaterThan(0);
    expect(taxaSupressaoRegional).toBeLessThan(taxaSupressaoMunicipal);
  });

  it('nenhum registro REAL aponta para uma RegiaoSaude DEMO (nunca mistura)', async () => {
    const misturado = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoInternacaoResidenciaRegional" f
      JOIN silver."RegiaoSaude" r ON r.id = f."regiaoSaudeResidenciaId"
      WHERE f.origem = 'REAL' AND r.codigo NOT LIKE 'DRS-%'
    `;
    expect(Number(misturado[0]?.total ?? -1)).toBe(0);
  });

  it('supressao: nenhum registro nao-suprimido tem internacoes abaixo do limiar (n<5) - mesma regra do grao municipal', async () => {
    const abaixoNaoSuprimido = await prisma.fatoInternacaoResidenciaRegional.count({
      where: { origem: 'REAL', suprimido: false, internacoes: { lt: 5 } },
    });
    expect(abaixoNaoSuprimido).toBe(0);
  });

  it('FatoCapacidadeLeitosRegional cobre as 17 RegiaoSaude reais em cada competencia (sem supressao, capacidade operacional)', async () => {
    const competencias = await prisma.competencia.findMany({ where: { ano: 2024, mes: { in: [2, 6, 8, 12] } } });
    for (const c of competencias) {
      const regioesDistintas = await prisma.fatoCapacidadeLeitosRegional.findMany({
        where: { competenciaId: c.id, origem: 'REAL' },
        select: { regiaoSaudeInternacaoId: true },
        distinct: ['regiaoSaudeInternacaoId'],
      });
      expect(regioesDistintas.length).toBe(17);
    }
  });

  it('constraint unica (regiao+competencia+grupoCid+faixaEtaria+sexo) rejeita insert duplicado (prova de idempotencia)', async () => {
    const existente = await prisma.fatoInternacaoResidenciaRegional.findFirstOrThrow({ where: { origem: 'REAL' } });
    await expect(
      prisma.fatoInternacaoResidenciaRegional.create({
        data: {
          regiaoSaudeResidenciaId: existente.regiaoSaudeResidenciaId,
          competenciaId: existente.competenciaId,
          grupoCidId: existente.grupoCidId,
          faixaEtaria: existente.faixaEtaria,
          sexo: existente.sexo,
          internacoes: existente.internacoes,
          origem: existente.origem,
          execucaoId: existente.execucaoId,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Fase 5.5 - Radar de Risco Regional (RiskComponenteValorRegional / RiskScoreRegional)', () => {
  it('as 17 RegiaoSaude REAL tem RiskScore em cada uma das 4 competencias (cobertura completa - a supressao deixou de ser o gargalo)', async () => {
    const competencias = await prisma.competencia.findMany({ where: { ano: 2024, mes: { in: [2, 6, 8, 12] } } });
    for (const c of competencias) {
      const total = await prisma.riskScoreRegional.count({ where: { origem: 'REAL', competenciaId: c.id } });
      expect(total).toBe(17);
    }
  });

  it('todo RiskScoreRegional aponta para uma RegiaoSaude REAL, nunca DEMO', async () => {
    const misturado = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."RiskScoreRegional" rs
      JOIN silver."RegiaoSaude" r ON r.id = rs."regiaoSaudeId"
      WHERE rs.origem = 'REAL' AND r.codigo NOT LIKE 'DRS-%'
    `;
    expect(Number(misturado[0]?.total ?? -1)).toBe(0);
  });

  it('PRESSAO_HOSPITALAR_ESTIMADA regional tem cobertura muito maior que o grao municipal (19 RiskScore em todas as competencias vs dezenas so aqui)', async () => {
    const disponivel = await prisma.riskComponenteValorRegional.count({
      where: { origem: 'REAL', componente: 'PRESSAO_HOSPITALAR_ESTIMADA', disponivel: true },
    });
    // 17 regioes x 4 competencias = 68 possiveis. bool_or(suprimido) ainda exige
    // as 18 celulas (9 faixaEtaria x 2 sexo) da regiao sem nenhuma suprimida no
    // mes - real, nao 100%, mas uma fracao bem maior que o grao municipal
    // (onde so 1 unico municipio conseguia isso por ANO inteiro, Fase 5.2).
    expect(disponivel).toBeGreaterThan(20);
  });

  it('VULNERABILIDADE regional (media ponderada do IPVS municipal) esta disponivel para todas as regioes', async () => {
    const disponivel = await prisma.riskComponenteValorRegional.count({
      where: { origem: 'REAL', componente: 'VULNERABILIDADE', disponivel: true },
    });
    expect(disponivel).toBe(17 * 4);
  });

  it('classificacao cobre uma distribuicao razoavel sobre 17 regioes (nao concentrada num unico valor)', async () => {
    const competencia = await prisma.competencia.findFirstOrThrow({ where: { ano: 2024, mes: 2 } });
    const classificacoesDistintas = await prisma.riskScoreRegional.findMany({
      where: { origem: 'REAL', competenciaId: competencia.id },
      select: { classificacao: true },
      distinct: ['classificacao'],
    });
    expect(classificacoesDistintas.length).toBeGreaterThan(1);
  });

  it('constraint unica (regiao+competencia+riskConfig) rejeita insert duplicado (prova de idempotencia)', async () => {
    const existente = await prisma.riskScoreRegional.findFirstOrThrow({ where: { origem: 'REAL' } });
    await expect(
      prisma.riskScoreRegional.create({
        data: {
          regiaoSaudeId: existente.regiaoSaudeId,
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
});
