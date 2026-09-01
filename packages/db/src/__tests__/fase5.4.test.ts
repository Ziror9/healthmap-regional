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

  it('a RiskConfig anterior (fase5.3-real) nao foi alterada (RiskConfig nunca muda apos uso)', async () => {
    const anterior = await prisma.riskConfig.findFirst({
      where: { autor: 'fase5.3-real' },
      include: { componentes: true },
    });
    expect(anterior).not.toBeNull();
    const vulnerabilidade = anterior?.componentes.find((c) => c.componente === 'VULNERABILIDADE');
    expect(vulnerabilidade?.indicadorDefinicaoId).toBeNull();
  });
});

describe('Fase 5.4 - Radar REAL com VULNERABILIDADE (cobertura ampliada)', () => {
  it('VULNERABILIDADE REAL esta disponivel para todos os 645 municipios (IPVS cobre 100%)', async () => {
    const disponivel = await prisma.riskComponenteValor.count({
      where: {
        origem: 'REAL',
        componente: 'VULNERABILIDADE',
        disponivel: true,
        riskConfig: { autor: 'fase5.4-real' },
      },
    });
    // 645 municipios x 4 competencias REAL
    expect(disponivel).toBe(645 * 4);
  });

  it('RiskScore REAL da config fase5.4-real cobre muito mais municipios que a config fase5.3-real (VULNERABILIDADE preenche a lacuna de PRESSAO suprimida)', async () => {
    const configAntiga = await prisma.riskConfig.findFirstOrThrow({ where: { autor: 'fase5.3-real' } });
    const configNova = await prisma.riskConfig.findFirstOrThrow({ where: { autor: 'fase5.4-real' } });
    const totalAntigo = await prisma.riskScore.count({ where: { origem: 'REAL', riskConfigId: configAntiga.id } });
    const totalNovo = await prisma.riskScore.count({ where: { origem: 'REAL', riskConfigId: configNova.id } });
    expect(totalNovo).toBeGreaterThan(totalAntigo);
    // com VULNERABILIDADE cobrindo 100% dos municipios, o Radar passa a
    // classificar a maioria deles (nao mais preso a disponibilidade de SIH+CNES)
    expect(totalNovo).toBeGreaterThan(2000);
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
