/**
 * Testes minimos obrigatorios da Fase 1.
 *
 * Sao testes de integracao: rodam contra o PostgreSQL local (o mesmo banco
 * de desenvolvimento, ja com a migration aplicada e o seed DEMO executado -
 * `npm run db:up && npm run prisma:migrate && npm run db:seed` antes de
 * `npm run test --workspace @healthmap/db`). Nao sobem um banco de teste
 * isolado: para o escopo da Fase 1 (validar schema + seed, nao performance
 * nem isolamento de CI), isso seria infraestrutura extra nao justificada.
 *
 * TypeScript (`npm run typecheck`) e ESLint (`npm run lint`) sao validados
 * como comandos separados, nao dentro desta suite - rodar tsc/eslint via
 * subprocesso de teste seria redundante e mais lento que os scripts nativos.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { getPrismaClient, disconnectPrisma, checkDatabaseConnection } from '../index.js';

const prisma = getPrismaClient();

beforeAll(async () => {
  const result = await checkDatabaseConnection();
  if (!result.connected) {
    throw new Error(
      `Banco indisponivel para os testes da Fase 1: ${result.message}. ` +
        'Rode "npm run db:up" e "npm run prisma:migrate" antes de testar.',
    );
  }
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Fase 1 - conexao e migration', () => {
  it('1. Prisma conecta ao banco', async () => {
    const result = await checkDatabaseConnection();
    expect(result.connected).toBe(true);
  });

  it('2. migration aplicou as tabelas esperadas nos 3 schemas', async () => {
    const rows = await prisma.$queryRaw<{ table_schema: string; total: bigint }[]>`
      SELECT table_schema, count(*) as total
      FROM information_schema.tables
      WHERE table_schema IN ('silver', 'gold', 'meta')
      GROUP BY table_schema
    `;
    const porSchema = Object.fromEntries(rows.map((r) => [r.table_schema, Number(r.total)]));
    expect(porSchema.silver).toBe(5);
    // 14 desde a Fase 5.6: 7 tabelas gold da Fase 1 + PopulacaoEstimada (Fase 5.2)
    // + 5 tabelas regionais (Fase 5.5) + FatoObitoResidencia (Fase 5.6).
    expect(porSchema.gold).toBe(14);
    expect(porSchema.meta).toBe(10);
  });
});

describe('Fase 1 - seed DEMO', () => {
  it('3. seed DEMO executou e populou as tabelas principais', async () => {
    const [municipios, competencias, populacao, residencia, local, leitos] = await Promise.all([
      prisma.municipio.count(),
      prisma.competencia.count(),
      prisma.populacao.count(),
      prisma.fatoInternacaoResidencia.count(),
      prisma.fatoInternacaoLocal.count(),
      prisma.fatoCapacidadeLeitos.count(),
    ]);
    expect(municipios).toBeGreaterThan(0);
    expect(competencias).toBeGreaterThan(0);
    expect(populacao).toBeGreaterThan(0);
    expect(residencia).toBeGreaterThan(0);
    expect(local).toBeGreaterThan(0);
    expect(leitos).toBeGreaterThan(0);
  });

  it('4. seed DEMO e deterministico (contagens fixas para a configuracao atual)', async () => {
    // Valores observados e estaveis para MUNICIPIOS/COMPETENCIAS/SEED_DETERMINISTICO
    // atuais em seed-demo.ts. Se a seed source mudar deliberadamente, estes
    // numeros devem ser atualizados junto. Filtra origem=DEMO explicitamente
    // desde a Fase 5: a mesma tabela agora tambem tem fatos REAL (ingestao
    // CNES), que nao devem contar aqui - ver fase5.test.ts para as
    // contagens REAL.
    const residencia = await prisma.fatoInternacaoResidencia.count({ where: { origem: 'DEMO' } });
    const local = await prisma.fatoInternacaoLocal.count({ where: { origem: 'DEMO' } });
    const leitos = await prisma.fatoCapacidadeLeitos.count({ where: { origem: 'DEMO' } });
    const populacao = await prisma.populacao.count({ where: { origem: 'DEMO' } });

    expect(residencia).toBe(1620);
    expect(local).toBe(1620);
    expect(leitos).toBe(360);
    expect(populacao).toBe(270);
  });

  it('5. todo fato possui execucaoId valido (linhagem sem orfaos)', async () => {
    const orfaosResidencia = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoInternacaoResidencia" f
      LEFT JOIN meta."IngestaoExecucao" e ON e.id = f."execucaoId"
      WHERE e.id IS NULL
    `;
    const orfaosLocal = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoInternacaoLocal" f
      LEFT JOIN meta."IngestaoExecucao" e ON e.id = f."execucaoId"
      WHERE e.id IS NULL
    `;
    expect(Number(orfaosResidencia[0]?.total ?? -1)).toBe(0);
    expect(Number(orfaosLocal[0]?.total ?? -1)).toBe(0);
  });

  it('6. origem DEMO esta corretamente registrada em todo fato', async () => {
    // Desde a segunda rodada da Fase 5, FatoInternacaoResidencia tambem tem
    // linhas REAL (ingestao SIH/SUS - ver docs/sih-methodology.md) - o que
    // continua valido nao e "a tabela e so DEMO", e sim "todo registro
    // DEMO tem origem='DEMO' corretamente marcada" (o inverso, verificado
    // abaixo). fase5.test.ts cobre a contraparte REAL explicitamente.
    const origensInvalidas = await prisma.fatoInternacaoResidencia.count({
      where: { NOT: { origem: { in: ['DEMO', 'REAL'] } } },
    });
    expect(origensInvalidas).toBe(0);

    const fonte = await prisma.fonteDados.findUnique({ where: { chave: 'GERADOR_DEMO' } });
    expect(fonte).not.toBeNull();

    // Desde a Fase 5 outras fontes REAL (IBGE, CNES) tambem tem
    // IngestaoExecucao legitimas - o que continua valendo e que TODA
    // execucao ligada a um fato DEMO aponta para GERADOR_DEMO, nao que
    // GERADOR_DEMO seja a unica fonte que já rodou no banco.
    const execucoesDeFatosDemo = await prisma.fatoInternacaoResidencia.findMany({
      where: { origem: 'DEMO' },
      select: { execucao: { select: { fonteDadosId: true } } },
      distinct: ['execucaoId'],
    });
    const fontesDosFatosDemo = new Set(execucoesDeFatosDemo.map((f) => f.execucao.fonteDadosId));
    expect(fontesDosFatosDemo).toEqual(new Set(['GERADOR_DEMO']));
  });
});

describe('Fase 1 - supressao (n < 5)', () => {
  it('7. nenhum registro nao-suprimido tem internacoes abaixo do limiar', async () => {
    const abaixoDoLimiarNaoSuprimido = await prisma.fatoInternacaoResidencia.count({
      where: { suprimido: false, internacoes: { lt: 5 } },
    });
    expect(abaixoDoLimiarNaoSuprimido).toBe(0);
  });

  it('8. todo registro suprimido tem as medidas sensiveis NULL', async () => {
    const suprimidoComMedida = await prisma.fatoInternacaoResidencia.count({
      where: {
        suprimido: true,
        OR: [{ internacoes: { not: null } }, { obitos: { not: null } }, { diasPermanencia: { not: null } }],
      },
    });
    expect(suprimidoComMedida).toBe(0);

    const existemSuprimidos = await prisma.fatoInternacaoResidencia.count({ where: { suprimido: true } });
    expect(existemSuprimidos).toBeGreaterThan(0);
  });
});

describe('Fase 1 - constraints', () => {
  it('9. constraint unica impede duplicar o grao de FatoInternacaoResidencia', async () => {
    const existente = await prisma.fatoInternacaoResidencia.findFirst();
    expect(existente).not.toBeNull();
    if (!existente) return;

    await expect(
      prisma.fatoInternacaoResidencia.create({
        data: {
          municipioResidenciaId: existente.municipioResidenciaId,
          competenciaId: existente.competenciaId,
          grupoCidId: existente.grupoCidId,
          faixaEtaria: existente.faixaEtaria,
          sexo: existente.sexo,
          internacoes: existente.internacoes,
          obitos: existente.obitos,
          diasPermanencia: existente.diasPermanencia,
          suprimido: existente.suprimido,
          origem: existente.origem,
          execucaoId: existente.execucaoId,
        },
      }),
    ).rejects.toThrow();
  });

  it('10. FK impede fato orfao (municipio inexistente)', async () => {
    const execucao = await prisma.ingestaoExecucao.findFirst();
    expect(execucao).not.toBeNull();
    if (!execucao) return;

    await expect(
      prisma.populacao.create({
        data: {
          municipioId: 999_999,
          ano: 2025,
          faixaEtaria: 'FX_00_09',
          sexo: 'MASCULINO',
          populacao: 100,
          origem: 'DEMO',
          execucaoId: execucao.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('indice parcial impede duas RiskConfig oficiais simultaneas', async () => {
    await prisma.$executeRaw`
      INSERT INTO meta."RiskConfig" ("metodoNormalizacao", "limiarVolumeMinimo", "vigenciaInicio", "oficial", "autor")
      VALUES ('TESTE', 1, now(), true, 'teste-vitest-1')
    `;
    try {
      await expect(
        prisma.$executeRaw`
          INSERT INTO meta."RiskConfig" ("metodoNormalizacao", "limiarVolumeMinimo", "vigenciaInicio", "oficial", "autor")
          VALUES ('TESTE2', 1, now(), true, 'teste-vitest-2')
        `,
      ).rejects.toThrow();
    } finally {
      await prisma.riskConfig.deleteMany({ where: { autor: { in: ['teste-vitest-1', 'teste-vitest-2'] } } });
    }
  });
});
