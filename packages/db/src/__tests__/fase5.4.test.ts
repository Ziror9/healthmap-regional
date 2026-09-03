/**
 * Testes de integracao da Fase 5.4 (vulnerabilidade social via IPVS/SEADE,
 * media ponderada por populacao por municipio, e a ativacao do componente
 * VULNERABILIDADE do Radar REAL).
 *
 * Mesma filosofia de fase5.3.test.ts: rodam contra o PostgreSQL local ja
 * com `python etl/ingest_vulnerabilidade.py` e `npm run db:calculate-risk-real`
 * (versao pos-Fase-5.4) executados.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { getPrismaClient, disconnectPrisma, checkDatabaseConnection, getIndicadorMunicipalPorDefinicao } from '../index.js';

const prisma = getPrismaClient();
const INDICADOR_VULNERABILIDADE = 'IPVS_MEDIA_PONDERADA_SETOR';

beforeAll(async () => {
  const result = await checkDatabaseConnection();
  if (!result.connected) {
    throw new Error(`Banco indisponivel para os testes da Fase 5.4: ${result.message}.`);
  }
  const total = await prisma.indicadorMunicipal.count({ where: { indicadorDefinicaoId: INDICADOR_VULNERABILIDADE } });
  if (total === 0) {
    throw new Error('Nenhum IndicadorMunicipal de IPVS encontrado. Rode "python etl/ingest_vulnerabilidade.py" antes de testar.');
  }
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Fase 5.4 - IPVS (vulnerabilidade social, media ponderada por municipio)', () => {
  it('IndicadorDefinicao existe com natureza ESTIMATIVA (aproximacao, nao produto oficial da SEADE)', async () => {
    const definicao = await prisma.indicadorDefinicao.findUnique({ where: { chave: INDICADOR_VULNERABILIDADE } });
    expect(definicao).not.toBeNull();
    expect(definicao?.naturezaPadrao).toBe('ESTIMATIVA');
    expect(definicao?.direcao).toBe('MAIOR_PIOR');
  });

  it('existe uma linha REAL para todos os 645 municipios (todo municipio tem >=1 setor classificavel)', async () => {
    const total = await prisma.indicadorMunicipal.count({
      where: { indicadorDefinicaoId: INDICADOR_VULNERABILIDADE, origem: 'REAL' },
    });
    expect(total).toBe(645);
  });

  it('todo valor esta no intervalo valido do IPVS (1 a 7, media ponderada de um C_IPVS ordinal)', async () => {
    const foraDoIntervalo = await prisma.indicadorMunicipal.count({
      where: { indicadorDefinicaoId: INDICADOR_VULNERABILIDADE, OR: [{ valor: { lt: 1 } }, { valor: { gt: 7 } }] },
    });
    expect(foraDoIntervalo).toBe(0);
  });

  it('todo registro tem denominador (populacao usada no calculo) preenchido e positivo', async () => {
    const semDenominador = await prisma.indicadorMunicipal.count({
      where: { indicadorDefinicaoId: INDICADOR_VULNERABILIDADE, OR: [{ denominador: null }, { denominador: { lte: 0 } }] },
    });
    expect(semDenominador).toBe(0);
  });

  it('todo registro aponta para um municipio REAL (nunca DEMO)', async () => {
    const misturado = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."IndicadorMunicipal" im
      JOIN silver."Municipio" m ON m.id = im."municipioId"
      WHERE im."indicadorDefinicaoId" = ${INDICADOR_VULNERABILIDADE} AND m."codigoIbge7" NOT LIKE '35%'
    `;
    expect(Number(misturado[0]?.total ?? -1)).toBe(0);
  });

  it('getIndicadorMunicipalPorDefinicao devolve o mesmo valor gravado para um municipio conhecido', async () => {
    const linha = await prisma.indicadorMunicipal.findFirstOrThrow({
      where: { indicadorDefinicaoId: INDICADOR_VULNERABILIDADE },
    });
    const resultado = await getIndicadorMunicipalPorDefinicao(prisma, {
      indicadorDefinicaoId: INDICADOR_VULNERABILIDADE,
      ano: linha.ano,
    });
    const doMunicipio = resultado.find((r) => r.municipioId === linha.municipioId);
    expect(doMunicipio?.valor).toBeCloseTo(Number(linha.valor), 6);
  });
});

describe('Fase 5.4 - RiskConfig REAL v2 (fase5.4-real) - VULNERABILIDADE ativada', () => {
  it('existe uma RiskConfig com autor "fase5.4-real" cujo componente VULNERABILIDADE aponta para o IPVS', async () => {
    const riskConfig = await prisma.riskConfig.findFirst({
      where: { autor: 'fase5.4-real' },
      include: { componentes: true },
    });
    expect(riskConfig).not.toBeNull();
    expect(riskConfig?.oficial).toBe(false);
    const vulnerabilidade = riskConfig?.componentes.find((c) => c.componente === 'VULNERABILIDADE');
    expect(vulnerabilidade?.indicadorDefinicaoId).toBe(INDICADOR_VULNERABILIDADE);
  });

  /**
   * ATUALIZADO na Fase 5.10. O teste original verificava que a config
   * "fase5.3-real" nao havia sido alterada - mas essa config nunca existiu
   * em nenhum commit (ver cabecalho de fase5.3.test.ts). O principio que ele
   * queria proteger ("RiskConfig nunca muda apos uso") continua valido e e
   * testado aqui de forma observavel: reexecutar o calculo REAL nao cria uma
   * config nova nem duplica a existente.
   */
  it('RiskConfig nunca muda apos uso: existe uma unica config REAL, e as configs DEMO do seed seguem separadas', async () => {
    const configsReal = await prisma.riskConfig.findMany({ where: { autor: 'fase5.4-real' } });
    expect(configsReal.length).toBe(1);

    // Fase 5.10 (isolamento REAL/DEMO): nenhuma linha DEMO pode viver dentro
    // da config REAL - calculate-risk-demo.ts so enxerga as configs do seed.
    const demoNaConfigReal = await prisma.riskScore.count({
      where: { origem: 'DEMO', riskConfigId: configsReal[0]!.id },
    });
    const componentesDemoNaConfigReal = await prisma.riskComponenteValor.count({
      where: { origem: 'DEMO', riskConfigId: configsReal[0]!.id },
    });
    expect(demoNaConfigReal).toBe(0);
    expect(componentesDemoNaConfigReal).toBe(0);
  });
});

describe('Fase 5.4 - Radar REAL com VULNERABILIDADE (cobertura ampliada)', () => {
  it('VULNERABILIDADE REAL esta disponivel para todos os 645 municipios, em todas as competencias REAL (IPVS cobre 100%)', async () => {
    // Fase 5.10: o numero de competencias REAL nao e fixo (eram 4, hoje sao
    // 12 - o catalogo do pySUS passou a servir o ano completo). O invariante
    // que importa e "IPVS cobre 100% dos municipios em TODA competencia
    // calculada", entao o esperado e derivado do proprio banco em vez de
    // hardcoded - assim o teste nao volta a quebrar quando a cobertura mudar.
    const competenciasComRadarReal = await prisma.riskComponenteValor.findMany({
      where: { origem: 'REAL', riskConfig: { autor: 'fase5.4-real' } },
      select: { competenciaId: true },
      distinct: ['competenciaId'],
    });
    const municipiosReal = await prisma.municipio.count({ where: { codigoIbge7: { startsWith: '35' } } });

    const disponivel = await prisma.riskComponenteValor.count({
      where: {
        origem: 'REAL',
        componente: 'VULNERABILIDADE',
        disponivel: true,
        riskConfig: { autor: 'fase5.4-real' },
      },
    });
    expect(competenciasComRadarReal.length).toBeGreaterThan(0);
    expect(disponivel).toBe(municipiosReal * competenciasComRadarReal.length);
  });

  /**
   * ATUALIZADO na Fase 5.10. O teste original comparava a cobertura da
   * config REAL com a da "fase5.3-real" - config que nunca existiu. O
   * resultado que ele queria demonstrar (VULNERABILIDADE preenche a lacuna
   * deixada por PRESSAO suprimida, levando o Radar a classificar todos os
   * municipios) e verificavel diretamente, sem depender da config fantasma.
   */
  it('com VULNERABILIDADE cobrindo 100%, o Radar REAL classifica TODOS os municipios, mesmo onde PRESSAO esta indisponivel', async () => {
    const configNova = await prisma.riskConfig.findFirstOrThrow({ where: { autor: 'fase5.4-real' } });
    const municipiosReal = await prisma.municipio.count({ where: { codigoIbge7: { startsWith: '35' } } });

    const competencias = await prisma.riskScore.findMany({
      where: { origem: 'REAL', riskConfigId: configNova.id },
      select: { competenciaId: true },
      distinct: ['competenciaId'],
    });
    const totalScores = await prisma.riskScore.count({ where: { origem: 'REAL', riskConfigId: configNova.id } });

    // Todo municipio REAL tem score em toda competencia calculada.
    expect(totalScores).toBe(municipiosReal * competencias.length);

    // E isso acontece apesar de PRESSAO estar indisponivel na maioria das
    // competencias (CNES historico so cobre parte delas) - prova de que a
    // renormalizacao de pesos sobre os componentes disponiveis esta operando.
    const pressaoIndisponivel = await prisma.riskComponenteValor.count({
      where: { origem: 'REAL', riskConfigId: configNova.id, componente: 'PRESSAO_HOSPITALAR_ESTIMADA', disponivel: false },
    });
    expect(pressaoIndisponivel).toBeGreaterThan(0);
  });

  it('a classificacao por quintil produz uma distribuicao equilibrada sobre a coorte REAL ampliada', async () => {
    const configNova = await prisma.riskConfig.findFirstOrThrow({ where: { autor: 'fase5.4-real' } });
    const competencia = await prisma.competencia.findFirstOrThrow({ where: { ano: 2024, mes: 2 } });
    const porClassificacao = await prisma.riskScore.groupBy({
      by: ['classificacao'],
      where: { origem: 'REAL', riskConfigId: configNova.id, competenciaId: competencia.id },
      _count: true,
    });
    expect(porClassificacao.length).toBe(5); // CRITICO..MUITO_BAIXO, todos presentes
    for (const grupo of porClassificacao) {
      // quintil de ~645 municipios: nenhum grupo deveria ficar vazio ou dominante
      expect(grupo._count).toBeGreaterThan(50);
    }
  });
});
