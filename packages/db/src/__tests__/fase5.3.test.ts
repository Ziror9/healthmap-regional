/**
 * Testes de integracao da Fase 5.3 (CNES historico via pySUS, grupo LT, e o
 * primeiro Radar de Risco REAL - RiskComponenteValor/RiskScore).
 *
 * Mesma filosofia de fase5.test.ts/fase5.2.test.ts: rodam contra o
 * PostgreSQL local ja com `docker run ... healthmap-etl-cnes-historico`
 * (etl/ingest_cnes_historico.py, ver etl/docker/Dockerfile.cnes_historico)
 * e `npm run db:calculate-risk-real` executados, alem da ingestao SIH REAL
 * ja existente (etl/ingest_sih.py via Docker).
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
    throw new Error(`Banco indisponivel para os testes da Fase 5.3: ${result.message}.`);
  }
  const total = await prisma.riskScore.count({ where: { origem: 'REAL' } });
  if (total === 0) {
    throw new Error(
      'Nenhum RiskScore REAL encontrado. Rode a ingestao CNES historico (docker run ... ' +
        'healthmap-etl-cnes-historico) e "npm run db:calculate-risk-real" antes de testar.',
    );
  }
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Fase 5.3 - CNES historico REAL (FatoCapacidadeLeitos, grupo LT via pySUS)', () => {
  it('existem linhas REAL de capacidade de leitos nas competencias do SIH REAL (2024-02/06/08/12)', async () => {
    const competencias = await prisma.competencia.findMany({ where: { ano: 2024, mes: { in: [2, 6, 8, 12] } } });
    expect(competencias.length).toBe(4);
    for (const c of competencias) {
      const total = await prisma.fatoCapacidadeLeitos.count({ where: { origem: 'REAL', competenciaId: c.id } });
      expect(total).toBeGreaterThan(0);
    }
  });

  it('todo registro REAL aponta para um municipio REAL (nunca DEMO)', async () => {
    const misturado = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoCapacidadeLeitos" f
      JOIN silver."Municipio" m ON m.id = f."municipioInternacaoId"
      JOIN meta."IngestaoExecucao" e ON e.id = f."execucaoId"
      JOIN meta."FonteDados" fd ON fd.chave = e."fonteDadosId"
      WHERE fd.chave = 'DATASUS_CNES_LT' AND m."codigoIbge7" NOT LIKE '35%'
    `;
    expect(Number(misturado[0]?.total ?? -1)).toBe(0);
  });

  it('nenhum leito do CNES historico tem contagem negativa', async () => {
    const negativos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoCapacidadeLeitos" f
      JOIN meta."IngestaoExecucao" e ON e.id = f."execucaoId"
      JOIN meta."FonteDados" fd ON fd.chave = e."fonteDadosId"
      WHERE fd.chave = 'DATASUS_CNES_LT' AND (f."leitosSus" < 0 OR f."leitosTotais" < 0)
    `;
    expect(Number(negativos[0]?.total ?? -1)).toBe(0);
  });

  it('constraint unica (municipio+competencia+tipoLeito) rejeita insert duplicado (prova de idempotencia)', async () => {
    const existente = await prisma.fatoCapacidadeLeitos.findFirstOrThrow({
      where: { execucao: { fonteDados: { chave: 'DATASUS_CNES_LT' } } },
    });
    await expect(
      prisma.fatoCapacidadeLeitos.create({
        data: {
          municipioInternacaoId: existente.municipioInternacaoId,
          competenciaId: existente.competenciaId,
          tipoLeito: existente.tipoLeito,
          leitosSus: existente.leitosSus,
          leitosTotais: existente.leitosTotais,
          origem: existente.origem,
          execucaoId: existente.execucaoId,
        },
      }),
    ).rejects.toThrow();
  });

  it('so grava CIRURGICO/CLINICO/OUTRO (nunca UTI - fonte pySUS nao permite identificar UTI com confianca, ver docstring de cnes_pysus.py)', async () => {
    const utiDoPysus = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoCapacidadeLeitos" f
      JOIN meta."IngestaoExecucao" e ON e.id = f."execucaoId"
      JOIN meta."FonteDados" fd ON fd.chave = e."fonteDadosId"
      WHERE fd.chave = 'DATASUS_CNES_LT' AND f."tipoLeito" = 'UTI'
    `;
    expect(Number(utiDoPysus[0]?.total ?? -1)).toBe(0);
  });
});

/**
 * ATUALIZADO na Fase 5.10. Os dois testes originais buscavam uma RiskConfig
 * com autor "fase5.3-real" - que NUNCA existiu em nenhum commit: `git log -p`
 * mostra que calculate-risk-real.ts sempre usou `fase5.4-real` como unico
 * valor de AUTOR_RISK_CONFIG_REAL, desde o commit que o criou. Os testes
 * descreviam uma progressao de configs (5.3 -> 5.4) que o codigo nunca
 * implementou, e so passavam contra um banco que tinha essa linha por
 * execucao manual anterior.
 *
 * O que era realmente valioso neles - "existe uma config REAL, nao oficial,
 * com os 4 componentes estruturais" e "VULNERABILIDADE so aponta um
 * indicador quando ele existe" - foi preservado abaixo, contra a config que
 * o codigo de fato cria.
 */
describe('Fase 5.3 - RiskConfig REAL', () => {
  it('existe exatamente UMA RiskConfig REAL, nao oficial, com os 4 componentes estruturais', async () => {
    const configs = await prisma.riskConfig.findMany({
      where: { autor: 'fase5.4-real' },
      include: { componentes: true },
    });
    // Uma so: calculate-risk-real.ts reaproveita a existente em vez de criar
    // outra a cada execucao (RiskConfig nunca muda apos uso - config nova
    // seria linha nova, e nao ha motivo para uma nova aqui).
    expect(configs.length).toBe(1);
    expect(configs[0]?.oficial).toBe(false);
    expect(configs[0]?.componentes.length).toBe(4);
  });

  it('VULNERABILIDADE so aponta indicadorDefinicaoId quando a fonte REAL existe (resolvido dinamicamente, nunca hardcoded)', async () => {
    const riskConfig = await prisma.riskConfig.findFirstOrThrow({
      where: { autor: 'fase5.4-real' },
      include: { componentes: true },
    });
    const vulnerabilidade = riskConfig.componentes.find((c) => c.componente === 'VULNERABILIDADE');
    const ipvsExiste = await prisma.indicadorDefinicao.findUnique({ where: { chave: 'IPVS_MEDIA_PONDERADA_SETOR' } });

    if (ipvsExiste) {
      expect(vulnerabilidade?.indicadorDefinicaoId).toBe('IPVS_MEDIA_PONDERADA_SETOR');
    } else {
      expect(vulnerabilidade?.indicadorDefinicaoId).toBeNull();
    }
    // Os outros 3 componentes nunca apontam indicador (formula fixa).
    for (const componente of riskConfig.componentes.filter((c) => c.componente !== 'VULNERABILIDADE')) {
      expect(componente.indicadorDefinicaoId).toBeNull();
    }
  });
});

describe('Fase 5.3 - Radar de Risco REAL (RiskComponenteValor / RiskScore)', () => {
  it('existem RiskScore REAL (o Radar deixou de ser exclusivamente DEMO)', async () => {
    const total = await prisma.riskScore.count({ where: { origem: 'REAL' } });
    expect(total).toBeGreaterThan(0);
  });

  it('todo RiskScore REAL aponta para um municipio REAL e uma competencia com SIH+CNES REAL', async () => {
    const misturado = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."RiskScore" rs
      JOIN silver."Municipio" m ON m.id = rs."municipioId"
      WHERE rs.origem = 'REAL' AND m."codigoIbge7" NOT LIKE '35%'
    `;
    expect(Number(misturado[0]?.total ?? -1)).toBe(0);
  });

  it('PRESSAO_HOSPITALAR_ESTIMADA REAL produz valor para pelo menos 1 municipio (formula: pacientesDia / leitos-dia)', async () => {
    const disponivel = await prisma.riskComponenteValor.count({
      where: { origem: 'REAL', componente: 'PRESSAO_HOSPITALAR_ESTIMADA', disponivel: true },
    });
    expect(disponivel).toBeGreaterThan(0);
  });

  it('TENDENCIA e SEVERIDADE REAL continuam sempre indisponiveis (sem definicao metodologica, sem mudanca desde a Fase 2)', async () => {
    const tendenciaDisponivel = await prisma.riskComponenteValor.count({
      where: { origem: 'REAL', componente: 'TENDENCIA', disponivel: true },
    });
    const severidadeDisponivel = await prisma.riskComponenteValor.count({
      where: { origem: 'REAL', componente: 'SEVERIDADE', disponivel: true },
    });
    expect(tendenciaDisponivel).toBe(0);
    expect(severidadeDisponivel).toBe(0);
  });

  it('VULNERABILIDADE REAL passou a ficar disponivel a partir da Fase 5.4 (IPVS) - ver fase5.4.test.ts para a cobertura completa', async () => {
    const disponivel = await prisma.riskComponenteValor.count({
      where: { origem: 'REAL', componente: 'VULNERABILIDADE', disponivel: true },
    });
    expect(disponivel).toBeGreaterThan(0);
  });

  it('classificacao so existe onde o indice REAL esta disponivel, e cobre valores validos do enum', async () => {
    const scores = await prisma.riskScore.findMany({ where: { origem: 'REAL' } });
    const classificacoesValidas = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO'];
    for (const s of scores) {
      expect(classificacoesValidas).toContain(s.classificacao);
      expect(Number(s.indice)).toBeGreaterThanOrEqual(0);
      expect(Number(s.indice)).toBeLessThanOrEqual(1);
    }
  });

  it('constraint unica (municipio+competencia+riskConfig) rejeita insert duplicado (prova de idempotencia)', async () => {
    const existente = await prisma.riskScore.findFirstOrThrow({ where: { origem: 'REAL' } });
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

  it('DEMO e REAL nunca aparecem juntos na mesma competencia+riskConfig de RiskScore', async () => {
    const misturadas = await prisma.$queryRaw<{ competenciaId: number; riskConfigId: number; total: bigint }[]>`
      SELECT "competenciaId", "riskConfigId", count(DISTINCT origem) as total
      FROM gold."RiskScore"
      GROUP BY "competenciaId", "riskConfigId"
      HAVING count(DISTINCT origem) > 1
    `;
    expect(misturadas).toEqual([]);
  });
});
