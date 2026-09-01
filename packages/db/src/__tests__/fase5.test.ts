/**
 * Testes de integracao da Fase 5 (ingestao REAL: geografia IBGE, DRS-SP,
 * CNES leitos/estabelecimentos).
 *
 * Mesma filosofia das fases anteriores (ver fase1.test.ts / fase2.test.ts):
 * rodam contra o PostgreSQL local ja com a ingestao REAL executada
 * (`python etl/ingest_geografia.py && python etl/ingest_cnes.py`, alem do
 * `db:seed`/`db:calculate-risk` de sempre) antes de
 * `npm run test --workspace @healthmap/db`.
 *
 * Idempotencia de ingestao e verificada via constraint de banco (mesma
 * abordagem de fase1.test.ts/fase2.test.ts para RiskComponenteValor/
 * RiskScore/FatoInternacaoResidencia): uma constraint unica que rejeita
 * insert duplicado prova que um upsert por chave natural (o que os scripts
 * Python fazem via ON CONFLICT) converge sem duplicar linhas, sem precisar
 * reexecutar um pipeline de rede inteiro dentro da suite de testes.
 */
import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { getPrismaClient, disconnectPrisma, checkDatabaseConnection } from '../index.js';

const prisma = getPrismaClient();

const GEOJSON_PATH = resolve(process.cwd(), '../../apps/web/public/geo/sp-municipios.geojson');

interface GeoJsonFeature {
  properties: { codarea: string };
}
interface GeoJsonCollection {
  features: GeoJsonFeature[];
}

beforeAll(async () => {
  const result = await checkDatabaseConnection();
  if (!result.connected) {
    throw new Error(
      `Banco indisponivel para os testes da Fase 5: ${result.message}. ` +
        'Rode "python etl/ingest_geografia.py" e "python etl/ingest_cnes.py" antes de testar.',
    );
  }
  const municipiosReais = await prisma.municipio.count({ where: { codigoIbge7: { startsWith: '35' } } });
  if (municipiosReais === 0) {
    throw new Error('Nenhum municipio REAL encontrado. Rode "python etl/ingest_geografia.py" antes de testar.');
  }
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Fase 5 - Geografia REAL (IBGE + DRS-SP)', () => {
  it('645 municipios REAL de SP foram carregados (codigoIbge7 iniciado em 35)', async () => {
    const total = await prisma.municipio.count({ where: { codigoIbge7: { startsWith: '35' } } });
    expect(total).toBe(645);
  });

  it('17 RegiaoSaude (DRS) reais foram carregadas (codigo DRS-xx)', async () => {
    const total = await prisma.regiaoSaude.count({ where: { codigo: { startsWith: 'DRS-' } } });
    expect(total).toBe(17);
  });

  it('nenhum codigoIbge7 duplicado', async () => {
    const duplicados = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM (
        SELECT "codigoIbge7" FROM silver."Municipio" GROUP BY "codigoIbge7" HAVING count(*) > 1
      ) t
    `;
    expect(Number(duplicados[0]?.total ?? -1)).toBe(0);
  });

  it('nenhum codigoIbge6 duplicado (DEMO e REAL coexistem sem colisao de prefixo)', async () => {
    const duplicados = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM (
        SELECT "codigoIbge6" FROM silver."Municipio" GROUP BY "codigoIbge6" HAVING count(*) > 1
      ) t
    `;
    expect(Number(duplicados[0]?.total ?? -1)).toBe(0);
  });

  it('DEMO (prefixo 36) e REAL (prefixo 35) sao os 2 unicos prefixos de UF presentes', async () => {
    const municipios = await prisma.municipio.findMany({ select: { codigoIbge7: true } });
    const prefixos = new Set(municipios.map((m) => m.codigoIbge7.slice(0, 2)));
    expect(prefixos).toEqual(new Set(['35', '36']));
  });

  it('constraint unica de codigoIbge7 rejeita insert duplicado (prova de idempotencia)', async () => {
    const existente = await prisma.municipio.findFirstOrThrow({ where: { codigoIbge7: { startsWith: '35' } } });
    await expect(
      prisma.municipio.create({
        data: {
          codigoIbge7: existente.codigoIbge7,
          codigoIbge6: '999999',
          nome: 'duplicata-teste',
          uf: 'SP',
          regiaoSaudeId: existente.regiaoSaudeId,
        },
      }),
    ).rejects.toThrow();
  });

  it('todo municipio REAL aponta para uma RegiaoSaude REAL existente (sem orfaos)', async () => {
    const orfaos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM silver."Municipio" m
      LEFT JOIN silver."RegiaoSaude" r ON r.id = m."regiaoSaudeId"
      WHERE m."codigoIbge7" LIKE '35%' AND r.id IS NULL
    `;
    expect(Number(orfaos[0]?.total ?? -1)).toBe(0);
  });

  it('coordenadas presentes, quando existem, estao dentro da faixa geografica de SP', async () => {
    const foraDaFaixa = await prisma.municipio.count({
      where: {
        codigoIbge7: { startsWith: '35' },
        OR: [{ latitude: { lt: -26 } }, { latitude: { gt: -19 } }, { longitude: { lt: -54 } }, { longitude: { gt: -43 } }],
      },
    });
    expect(foraDaFaixa).toBe(0);
  });
});

describe('Fase 5 - GeoJSON estatico (apps/web/public/geo/sp-municipios.geojson)', () => {
  it('todo codarea do GeoJSON tem um Municipio REAL correspondente no banco (join key)', async () => {
    const raw = readFileSync(GEOJSON_PATH, 'utf-8');
    const geojson = JSON.parse(raw) as GeoJsonCollection;
    expect(geojson.features.length).toBe(645);

    const codigosGeoJson = new Set(geojson.features.map((f) => f.properties.codarea));
    const municipiosReais = await prisma.municipio.findMany({
      where: { codigoIbge7: { startsWith: '35' } },
      select: { codigoIbge7: true },
    });
    const codigosBanco = new Set(municipiosReais.map((m) => m.codigoIbge7));

    expect(codigosGeoJson).toEqual(codigosBanco);
  });
});

describe('Fase 5 - CNES: FatoCapacidadeLeitos REAL', () => {
  it('existem linhas REAL de capacidade de leitos', async () => {
    const total = await prisma.fatoCapacidadeLeitos.count({ where: { origem: 'REAL' } });
    expect(total).toBeGreaterThan(0);
  });

  it('todo registro REAL aponta para um municipio REAL (residencia/internacao nunca mistura DEMO com REAL)', async () => {
    const misturado = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoCapacidadeLeitos" f
      JOIN silver."Municipio" m ON m.id = f."municipioInternacaoId"
      WHERE f.origem = 'REAL' AND m."codigoIbge7" NOT LIKE '35%'
    `;
    expect(Number(misturado[0]?.total ?? -1)).toBe(0);
  });

  it('nenhum leito REAL tem contagem negativa', async () => {
    const negativos = await prisma.fatoCapacidadeLeitos.count({
      where: { origem: 'REAL', OR: [{ leitosSus: { lt: 0 } }, { leitosTotais: { lt: 0 } }] },
    });
    expect(negativos).toBe(0);
  });

  it('todo registro REAL tem execucaoId valido (linhagem sem orfaos)', async () => {
    const orfaos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoCapacidadeLeitos" f
      LEFT JOIN meta."IngestaoExecucao" e ON e.id = f."execucaoId"
      WHERE f.origem = 'REAL' AND e.id IS NULL
    `;
    expect(Number(orfaos[0]?.total ?? -1)).toBe(0);
  });

  it('constraint unica (municipio+competencia+tipoLeito) rejeita insert duplicado (prova de idempotencia)', async () => {
    const existente = await prisma.fatoCapacidadeLeitos.findFirstOrThrow({ where: { origem: 'REAL' } });
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

  it('DEMO e REAL nunca aparecem na mesma competencia (nao se misturam)', async () => {
    const misturadas = await prisma.$queryRaw<{ competenciaId: number; total: bigint }[]>`
      SELECT "competenciaId", count(DISTINCT origem) as total
      FROM gold."FatoCapacidadeLeitos"
      GROUP BY "competenciaId"
      HAVING count(DISTINCT origem) > 1
    `;
    expect(misturadas).toEqual([]);
  });
});

describe('Fase 5 - CNES: Estabelecimento REAL (amostra)', () => {
  it('existem estabelecimentos REAL carregados', async () => {
    const total = await prisma.estabelecimento.count();
    expect(total).toBeGreaterThan(0);
  });

  it('todo codigoCnes tem 7 digitos numericos', async () => {
    const estabelecimentos = await prisma.estabelecimento.findMany({ select: { codigoCnes: true } });
    const invalidos = estabelecimentos.filter((e) => !/^\d{7}$/.test(e.codigoCnes));
    expect(invalidos).toEqual([]);
  });

  it('habilitacaoOncologica e sempre false (fonte nao distingue - nunca inferido como confirmado)', async () => {
    const comHabilitacao = await prisma.estabelecimento.count({ where: { habilitacaoOncologica: true } });
    expect(comHabilitacao).toBe(0);
  });

  it('todo estabelecimento aponta para um municipio REAL existente (sem orfaos)', async () => {
    const orfaos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM silver."Estabelecimento" e
      LEFT JOIN silver."Municipio" m ON m.id = e."municipioId"
      WHERE m.id IS NULL OR m."codigoIbge7" NOT LIKE '35%'
    `;
    expect(Number(orfaos[0]?.total ?? -1)).toBe(0);
  });

  it('constraint unica de codigoCnes rejeita insert duplicado (prova de idempotencia)', async () => {
    const existente = await prisma.estabelecimento.findFirstOrThrow();
    await expect(
      prisma.estabelecimento.create({
        data: {
          codigoCnes: existente.codigoCnes,
          nome: 'duplicata-teste',
          municipioId: existente.municipioId,
          tipo: existente.tipo,
          habilitacaoOncologica: false,
          ativo: true,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Fase 5 - Proveniencia (FonteDados / IngestaoExecucao)', () => {
  it('FonteDados REAL (IBGE, DRS-SP, CNES) estao registradas com URL e licenca', async () => {
    const chaves = ['IBGE_LOCALIDADES', 'SESSP_DRS', 'CNES_DEMAS'];
    for (const chave of chaves) {
      const fonte = await prisma.fonteDados.findUnique({ where: { chave } });
      expect(fonte, `FonteDados ${chave} deveria existir`).not.toBeNull();
      expect(fonte?.url).toBeTruthy();
      expect(fonte?.licenca).toBeTruthy();
    }
  });

  it('toda IngestaoExecucao de fonte REAL tem competencia, status e timestamps coerentes', async () => {
    const execucoes = await prisma.ingestaoExecucao.findMany({
      where: { fonteDadosId: { in: ['IBGE_LOCALIDADES', 'SESSP_DRS', 'CNES_DEMAS'] } },
    });
    expect(execucoes.length).toBeGreaterThan(0);
    for (const execucao of execucoes) {
      expect(['SUCESSO', 'PARCIAL', 'FALHA', 'INICIADA']).toContain(execucao.status);
      expect(execucao.versaoPipeline).toBeTruthy();
      expect(execucao.iniciadoEm).toBeInstanceOf(Date);
    }
  });

  it('nenhuma IngestaoExecucao de fonte REAL ficou parada em INICIADA (todo pipeline finaliza)', async () => {
    const presas = await prisma.ingestaoExecucao.count({
      where: { fonteDadosId: { in: ['IBGE_LOCALIDADES', 'SESSP_DRS', 'CNES_DEMAS'] }, status: 'INICIADA' },
    });
    expect(presas).toBe(0);
  });
});

describe('Fase 5 - Qualidade (QualidadeCheck)', () => {
  it('checks de qualidade da geografia foram registrados com severidade valida', async () => {
    const checks = await prisma.qualidadeCheck.findMany({
      where: { ingestaoExecucao: { fonteDadosId: 'IBGE_LOCALIDADES' } },
    });
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) {
      expect(['BLOQUEANTE', 'ALERTA']).toContain(check.severidade);
    }
  });

  it('o check bloqueante de duplicidade de municipio passou (senao a ingestao teria abortado)', async () => {
    const check = await prisma.qualidadeCheck.findFirst({
      where: { regra: 'municipio_sem_duplicidade' },
      orderBy: { createdAt: 'desc' },
    });
    expect(check).not.toBeNull();
    expect(check?.severidade).toBe('BLOQUEANTE');
    expect(check?.passou).toBe(true);
  });

  it('o achado de deduplicacao de paginacao do CNES ficou registrado como ALERTA (nao bloqueante)', async () => {
    const check = await prisma.qualidadeCheck.findFirst({
      where: { regra: 'hospital_deduplicado_paginacao_instavel' },
      orderBy: { createdAt: 'desc' },
    });
    expect(check).not.toBeNull();
    expect(check?.severidade).toBe('ALERTA');
  });
});

describe('Fase 5 - separacao DEMO x REAL (nunca se misturam)', () => {
  it('FatoCapacidadeLeitos: origem e sempre DEMO ou REAL, nunca outro valor', async () => {
    const origens = await prisma.fatoCapacidadeLeitos.groupBy({ by: ['origem'] });
    const nomes = origens.map((o) => o.origem).sort();
    expect(nomes).toEqual(['DEMO', 'REAL']);
  });

  it('todo Municipio DEMO (prefixo 36) so aparece em fatos DEMO', async () => {
    const municipiosDemo = await prisma.municipio.findMany({
      where: { codigoIbge7: { startsWith: '36' } },
      select: { id: true },
    });
    const idsDemo = municipiosDemo.map((m) => m.id);
    const leitosRealEmMunicipioDemo = await prisma.fatoCapacidadeLeitos.count({
      where: { municipioInternacaoId: { in: idsDemo }, origem: 'REAL' },
    });
    expect(leitosRealEmMunicipioDemo).toBe(0);
  });

  it('todo Municipio REAL (prefixo 35) so aparece em fatos REAL de FatoCapacidadeLeitos', async () => {
    const municipiosReais = await prisma.municipio.findMany({
      where: { codigoIbge7: { startsWith: '35' } },
      select: { id: true },
    });
    const idsReais = municipiosReais.map((m) => m.id);
    const leitosDemoEmMunicipioReal = await prisma.fatoCapacidadeLeitos.count({
      where: { municipioInternacaoId: { in: idsReais }, origem: 'DEMO' },
    });
    expect(leitosDemoEmMunicipioReal).toBe(0);
  });
});

describe('Fase 5 - regressao DEMO (Fase 1/2 continuam intactas apos a ingestao REAL)', () => {
  it('seed DEMO permanece deterministico (mesmas contagens da Fase 1, mesmo com REAL presente)', async () => {
    const residencia = await prisma.fatoInternacaoResidencia.count({ where: { origem: 'DEMO' } });
    const local = await prisma.fatoInternacaoLocal.count({ where: { origem: 'DEMO' } });
    const populacao = await prisma.populacao.count({ where: { origem: 'DEMO' } });
    expect(residencia).toBe(1620);
    expect(local).toBe(1620);
    expect(populacao).toBe(270);
  });

  it('FatoCapacidadeLeitos DEMO permanece com as 360 linhas originais da Fase 1', async () => {
    const leitosDemo = await prisma.fatoCapacidadeLeitos.count({ where: { origem: 'DEMO' } });
    expect(leitosDemo).toBe(360);
  });

  it('RiskScore DEMO continua calculado (Fase 2 nao foi afetada pela ingestao REAL)', async () => {
    const total = await prisma.riskScore.count({ where: { origem: 'DEMO' } });
    expect(total).toBeGreaterThan(0);
  });
});

/**
 * Testes do SIH/SUS REAL (segunda rodada da Fase 5, docs/sih-methodology.md).
 * Requer que `docker run ... healthmap-etl-sih` (ver etl/README.md) ja
 * tenha rodado nesta base - ao contrario de geografia/CNES, SIH nao roda no
 * Python do host (pysus exige Linux, ver etl/healthmap_etl/sources/sih.py),
 * entao nao pode ser reexecutado automaticamente por este teste.
 */
describe('Fase 5 - SIH/SUS REAL (FatoInternacaoResidencia/Local)', () => {
  beforeAll(async () => {
    const total = await prisma.fatoInternacaoResidencia.count({ where: { origem: 'REAL' } });
    if (total === 0) {
      throw new Error(
        'Nenhum FatoInternacaoResidencia REAL encontrado. Rode a ingestao SIH via Docker antes de testar - ver etl/README.md.',
      );
    }
  });

  it('existem fatos REAL nos dois eixos (residencia e internacao)', async () => {
    const residencia = await prisma.fatoInternacaoResidencia.count({ where: { origem: 'REAL' } });
    const local = await prisma.fatoInternacaoLocal.count({ where: { origem: 'REAL' } });
    expect(residencia).toBeGreaterThan(0);
    expect(local).toBeGreaterThan(0);
  });

  it('todo fato REAL aponta para grupoCid C00-C97 (recorte oncologico preservado)', async () => {
    const grupo = await prisma.grupoCid.findFirstOrThrow({ where: { agrupamento: 'TODAS_NEOPLASIAS_MALIGNAS' } });
    const forasDoRecorte = await prisma.fatoInternacaoResidencia.count({
      where: { origem: 'REAL', NOT: { grupoCidId: grupo.id } },
    });
    expect(forasDoRecorte).toBe(0);
  });

  it('supressao: nenhum registro nao-suprimido tem internacoes abaixo do limiar (n<5)', async () => {
    const residenciaAbaixoNaoSuprimido = await prisma.fatoInternacaoResidencia.count({
      where: { origem: 'REAL', suprimido: false, internacoes: { lt: 5 } },
    });
    const localAbaixoNaoSuprimido = await prisma.fatoInternacaoLocal.count({
      where: { origem: 'REAL', suprimido: false, internacoes: { lt: 5 } },
    });
    expect(residenciaAbaixoNaoSuprimido).toBe(0);
    expect(localAbaixoNaoSuprimido).toBe(0);
  });

  it('supressao: todo registro suprimido tem as medidas sensiveis NULL (NULL nunca vira 0)', async () => {
    const residenciaSuprimidoComMedida = await prisma.fatoInternacaoResidencia.count({
      where: {
        origem: 'REAL',
        suprimido: true,
        OR: [{ internacoes: { not: null } }, { obitos: { not: null } }, { diasPermanencia: { not: null } }],
      },
    });
    const localSuprimidoComMedida = await prisma.fatoInternacaoLocal.count({
      where: {
        origem: 'REAL',
        suprimido: true,
        OR: [{ internacoes: { not: null } }, { pacientesDia: { not: null } }, { diariasUti: { not: null } }, { obitos: { not: null } }],
      },
    });
    expect(residenciaSuprimidoComMedida).toBe(0);
    expect(localSuprimidoComMedida).toBe(0);

    const existemSuprimidos = await prisma.fatoInternacaoResidencia.count({ where: { origem: 'REAL', suprimido: true } });
    expect(existemSuprimidos).toBeGreaterThan(0);
  });

  it('todo fato REAL aponta para um municipio REAL existente (nunca para municipio DEMO)', async () => {
    const residenciaEmMunicipioDemo = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoInternacaoResidencia" f
      JOIN silver."Municipio" m ON m.id = f."municipioResidenciaId"
      WHERE f.origem = 'REAL' AND m."codigoIbge7" NOT LIKE '35%'
    `;
    const localEmMunicipioDemo = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoInternacaoLocal" f
      JOIN silver."Municipio" m ON m.id = f."municipioInternacaoId"
      WHERE f.origem = 'REAL' AND m."codigoIbge7" NOT LIKE '35%'
    `;
    expect(Number(residenciaEmMunicipioDemo[0]?.total ?? -1)).toBe(0);
    expect(Number(localEmMunicipioDemo[0]?.total ?? -1)).toBe(0);
  });

  it('todo fato REAL tem execucaoId valido, apontando para a fonte DATASUS_SIH_RD (linhagem sem orfaos)', async () => {
    const orfaos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoInternacaoResidencia" f
      LEFT JOIN meta."IngestaoExecucao" e ON e.id = f."execucaoId"
      WHERE f.origem = 'REAL' AND e.id IS NULL
    `;
    expect(Number(orfaos[0]?.total ?? -1)).toBe(0);

    const fontesDosFatosReal = await prisma.fatoInternacaoResidencia.findMany({
      where: { origem: 'REAL' },
      select: { execucao: { select: { fonteDadosId: true } } },
      distinct: ['execucaoId'],
    });
    const fontes = new Set(fontesDosFatosReal.map((f) => f.execucao.fonteDadosId));
    expect(fontes).toEqual(new Set(['DATASUS_SIH_RD']));
  });

  it('constraint unica (municipio+competencia+grupoCid+faixaEtaria+sexo) rejeita insert duplicado (prova de idempotencia)', async () => {
    const existente = await prisma.fatoInternacaoResidencia.findFirstOrThrow({ where: { origem: 'REAL' } });
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

  it('municipios de residencia e de internacao nunca se misturam na mesma linha (eixos sempre separados)', async () => {
    // Confirma a garantia estrutural: FatoInternacaoResidencia so tem
    // municipioResidenciaId (nao ha coluna de internacao na mesma linha) e
    // vice-versa - o teste em si documenta essa separacao verificando que
    // ambas as tabelas tem cardinalidade de municipios diferente (municipio
    // de internacao concentra em menos municipios-polo, municipio de
    // residencia se espalha por muito mais municipios - ver
    // docs/sih-methodology.md #2).
    const municipiosResidencia = await prisma.fatoInternacaoResidencia.findMany({
      where: { origem: 'REAL' },
      select: { municipioResidenciaId: true },
      distinct: ['municipioResidenciaId'],
    });
    const municipiosLocal = await prisma.fatoInternacaoLocal.findMany({
      where: { origem: 'REAL' },
      select: { municipioInternacaoId: true },
      distinct: ['municipioInternacaoId'],
    });
    expect(municipiosResidencia.length).toBeGreaterThan(municipiosLocal.length);
  });

  it('SIH e CNES REAL agora compartilham competencia (Fase 5.3: etl/ingest_cnes_historico.py, grupo LT via pySUS)', async () => {
    // Ate a Fase 5.2 esta intersecao era vazia (docs/sih-methodology.md #9,
    // #11.2) - a fonte CNES/DEMAS usada em ingest_cnes.py so da um snapshot
    // atual. A Fase 5.3 ingere CNES historico (grupo LT) para as mesmas
    // competencias do SIH REAL, o que passa a permitir
    // PRESSAO_HOSPITALAR_ESTIMADA REAL - ver fase5.3.test.ts para a prova
    // completa. Este teste so documenta que a limitacao original nao vale
    // mais, evitando que ela volte a ser assumida silenciosamente por engano.
    const competenciasComSih = await prisma.fatoInternacaoLocal.findMany({
      where: { origem: 'REAL' },
      select: { competenciaId: true },
      distinct: ['competenciaId'],
    });
    const competenciasComLeitos = await prisma.fatoCapacidadeLeitos.findMany({
      where: { origem: 'REAL' },
      select: { competenciaId: true },
      distinct: ['competenciaId'],
    });
    const idsComSih = new Set(competenciasComSih.map((c) => c.competenciaId));
    const idsComLeitos = new Set(competenciasComLeitos.map((c) => c.competenciaId));
    const intersecao = [...idsComSih].filter((id) => idsComLeitos.has(id));
    expect(intersecao.length).toBeGreaterThan(0);
  });
});
