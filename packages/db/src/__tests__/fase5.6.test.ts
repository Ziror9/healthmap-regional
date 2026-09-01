/**
 * Testes de integracao da Fase 5.6 (mortalidade oncologica REAL - SIM/DATASUS).
 *
 * Mesma filosofia das fases anteriores: rodam contra o PostgreSQL local ja
 * com `docker run ... healthmap-etl-sim` (etl/ingest_sim.py) e
 * `npm run db:calculate-indicadores-mortalidade-real` executados.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import { getPrismaClient, disconnectPrisma, checkDatabaseConnection } from '../index.js';

const prisma = getPrismaClient();
const INDICADOR_CHAVE = 'TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB';

beforeAll(async () => {
  const result = await checkDatabaseConnection();
  if (!result.connected) {
    throw new Error(`Banco indisponivel para os testes da Fase 5.6: ${result.message}.`);
  }
  const total = await prisma.fatoObitoResidencia.count({ where: { origem: 'REAL' } });
  if (total === 0) {
    throw new Error(
      'Nenhum FatoObitoResidencia REAL encontrado. Rode a ingestao SIM via Docker ' +
        '(healthmap-etl-sim) e "npm run db:calculate-indicadores-mortalidade-real" antes de testar.',
    );
  }
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('Fase 5.6 - migration e estrutura de gold.FatoObitoResidencia', () => {
  it('a tabela existe e aceita consulta (migration aplicada)', async () => {
    const total = await prisma.fatoObitoResidencia.count();
    expect(total).toBeGreaterThan(0);
  });

  it('FK aponta para Municipio, GrupoCid e IngestaoExecucao existentes (sem orfaos)', async () => {
    const orfaos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoObitoResidencia" f
      LEFT JOIN silver."Municipio" m ON m.id = f."municipioResidenciaId"
      LEFT JOIN silver."GrupoCid" g ON g.id = f."grupoCidId"
      LEFT JOIN meta."IngestaoExecucao" e ON e.id = f."execucaoId"
      WHERE m.id IS NULL OR g.id IS NULL OR e.id IS NULL
    `;
    expect(Number(orfaos[0]?.total ?? -1)).toBe(0);
  });

  it('constraint unica (municipio+ano+grupoCid) rejeita insert duplicado (prova de idempotencia)', async () => {
    const existente = await prisma.fatoObitoResidencia.findFirstOrThrow({ where: { origem: 'REAL' } });
    await expect(
      prisma.fatoObitoResidencia.create({
        data: {
          municipioResidenciaId: existente.municipioResidenciaId,
          ano: existente.ano,
          grupoCidId: existente.grupoCidId,
          obitos: existente.obitos,
          suprimido: existente.suprimido,
          origem: existente.origem,
          execucaoId: existente.execucaoId,
        },
      }),
    ).rejects.toThrow();
  });

  it('todo registro aponta para GrupoCid TODAS_NEOPLASIAS_MALIGNAS (recorte oncologico preservado)', async () => {
    const grupo = await prisma.grupoCid.findFirstOrThrow({ where: { agrupamento: 'TODAS_NEOPLASIAS_MALIGNAS' } });
    const foraDoRecorte = await prisma.fatoObitoResidencia.count({
      where: { origem: 'REAL', NOT: { grupoCidId: grupo.id } },
    });
    expect(foraDoRecorte).toBe(0);
  });

  it('todo registro REAL aponta para um municipio REAL, nunca DEMO', async () => {
    const misturado = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) as total FROM gold."FatoObitoResidencia" f
      JOIN silver."Municipio" m ON m.id = f."municipioResidenciaId"
      WHERE f.origem = 'REAL' AND m."codigoIbge7" NOT LIKE '35%'
    `;
    expect(Number(misturado[0]?.total ?? -1)).toBe(0);
  });
});

describe('Fase 5.6 - carga e supressao (2023)', () => {
  it('existem celulas REAL para 2023 (ano validado no spike)', async () => {
    const total = await prisma.fatoObitoResidencia.count({
      where: { origem: 'REAL', ano: 2023 },
    });
    expect(total).toBeGreaterThan(0);
  });

  it('supressao: nenhum registro nao-suprimido tem obitos abaixo do limiar (n<5)', async () => {
    const abaixoNaoSuprimido = await prisma.fatoObitoResidencia.count({
      where: { origem: 'REAL', suprimido: false, obitos: { lt: 5 } },
    });
    expect(abaixoNaoSuprimido).toBe(0);
  });

  it('supressao: todo registro suprimido tem obitos NULL (NULL nunca vira 0)', async () => {
    const suprimidoComValor = await prisma.fatoObitoResidencia.count({
      where: { origem: 'REAL', suprimido: true, obitos: { not: null } },
    });
    expect(suprimidoComValor).toBe(0);

    const existemSuprimidos = await prisma.fatoObitoResidencia.count({ where: { origem: 'REAL', suprimido: true } });
    expect(existemSuprimidos).toBeGreaterThan(0);
  });

  it('cobertura municipal de 2023 bate com a esperada pelo spike (~565/645 municipios nao suprimidos, supressao decidida no total anual)', async () => {
    const naoSuprimidos = await prisma.fatoObitoResidencia.count({
      where: { origem: 'REAL', suprimido: false, ano: 2023 },
    });
    // grao ja e anual (municipio x ano x grupoCid) - a linha JA E o total do
    // municipio no ano, entao esta contagem deve bater diretamente com o
    // "565/645 (87,6%)" validado no spike (ver docs/fase-5.6-relatorio.md),
    // com pequena tolerancia por diferencas de catalogo/dedup entre as rodadas.
    expect(naoSuprimidos).toBeGreaterThan(500);
    expect(naoSuprimidos).toBeLessThanOrEqual(645);
  });
});

describe('Fase 5.6 - indicador TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB', () => {
  it('IndicadorDefinicao existe com natureza OBSERVADO', async () => {
    const definicao = await prisma.indicadorDefinicao.findUnique({ where: { chave: INDICADOR_CHAVE } });
    expect(definicao).not.toBeNull();
    expect(definicao?.naturezaPadrao).toBe('OBSERVADO');
    expect(definicao?.direcao).toBe('MAIOR_PIOR');
  });

  it('existem linhas REAL de IndicadorMunicipal para este indicador', async () => {
    const total = await prisma.indicadorMunicipal.count({ where: { indicadorDefinicaoId: INDICADOR_CHAVE, origem: 'REAL' } });
    expect(total).toBeGreaterThan(0);
  });

  it('todo registro tem denominador (populacao) preenchido e positivo', async () => {
    const semDenominador = await prisma.indicadorMunicipal.count({
      where: { indicadorDefinicaoId: INDICADOR_CHAVE, OR: [{ denominador: null }, { denominador: { lte: 0 } }] },
    });
    expect(semDenominador).toBe(0);
  });

  it('valor da taxa e sempre positivo (nunca 0 - celula suprimida nunca vira taxa 0)', async () => {
    const invalidos = await prisma.indicadorMunicipal.count({
      where: { indicadorDefinicaoId: INDICADOR_CHAVE, valor: { lte: 0 } },
    });
    expect(invalidos).toBe(0);
  });

  it('cobertura de municipios com indicador disponivel esta na faixa esperada pelo spike (proximo de 565, tolerancia por diferenca de ano/fonte de populacao)', async () => {
    // O indicador so materializa em 2024, nao em 2023: o IBGE nao publica
    // estimativa de populacao para 2023 (ano de transicao pos-Censo,
    // confirmado via API - ver etl/ingest_populacao.py), entao TODO
    // municipio falha o denominador nesse ano - FatoObitoResidencia 2023
    // continua REAL e valido (ver describe acima), so o indicador (que
    // depende de populacao) nao tem onde materializar.
    const total = await prisma.indicadorMunicipal.count({ where: { indicadorDefinicaoId: INDICADOR_CHAVE, origem: 'REAL', ano: 2024 } });
    // o spike validou 2023 (565/645, 87,6%) antes de descobrirmos a lacuna
    // de populacao 2023 - 2024 e um ano de mortalidade diferente, espera-se
    // a mesma ordem de grandeza, nao o mesmo numero exato.
    expect(total).toBeGreaterThan(500);
    expect(total).toBeLessThanOrEqual(645);
  });
});

describe('Fase 5.6 - RiskScore NAO foi alterado', () => {
  it('nenhum RiskConfigComponente aponta para TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB (fora do Radar por decisao explicita)', async () => {
    const total = await prisma.riskConfigComponente.count({ where: { indicadorDefinicaoId: INDICADOR_CHAVE } });
    expect(total).toBe(0);
  });

  it('o conjunto de componentes do Radar continua exatamente os 4 originais (nenhum "MORTALIDADE" foi adicionado)', async () => {
    const componentesDistintos = await prisma.riskConfigComponente.findMany({
      select: { componente: true },
      distinct: ['componente'],
    });
    const nomes = componentesDistintos.map((c) => c.componente).sort();
    expect(nomes).toEqual(['PRESSAO_HOSPITALAR_ESTIMADA', 'SEVERIDADE', 'TENDENCIA', 'VULNERABILIDADE']);
  });

  it('FonteDados da mortalidade (DATASUS_SIM_DO) existe, mas nenhum RiskConfig referencia indicadorDefinicaoId de mortalidade', async () => {
    const fonteSim = await prisma.fonteDados.findUnique({ where: { chave: 'DATASUS_SIM_DO' } });
    expect(fonteSim).not.toBeNull();

    const componentesComIndicadorDeMortalidade = await prisma.riskConfigComponente.count({
      where: { indicadorDefinicaoId: INDICADOR_CHAVE },
    });
    expect(componentesComIndicadorDeMortalidade).toBe(0);
  });
});
