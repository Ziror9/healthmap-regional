/**
 * Calculo do indicador TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB sobre a base REAL
 * (Fase 5.6, fonte SIM/DATASUS).
 *
 * Uso, a partir da raiz do repositorio: npm run db:calculate-indicadores-mortalidade-real
 * (rodar depois de etl/ingest_sim.py e etl/ingest_populacao.py)
 *
 * Mesma fronteira de calculate-indicadores-real.ts (Fase 5.2): le gold via
 * packages/db, calcula via packages/risk (calcularTaxaPor10k - a MESMA
 * funcao ja usada para taxa de internacao, NENHUMA funcao nova/duplicada
 * de "taxa de mortalidade"), persiste via packages/db.
 *
 * DECISAO METODOLOGICA EXPLICITA (Fase 5.6): este indicador e OBSERVADO e
 * NUNCA entra no RiskScore/RiskScoreRegional. Este script NAO toca
 * RiskConfig, RiskConfigComponente, RiskComponenteValor(Regional) nem
 * RiskScore(Regional) - so grava IndicadorMunicipal. Qualquer proposta
 * futura de incorporar mortalidade ao Radar e uma decisao metodologica
 * separada, fora do escopo desta fase.
 *
 * Mortalidade POPULACIONAL (obitos / populacao residente) NAO deve ser
 * interpretada como letalidade HOSPITALAR (obitos / internados) - sao
 * conceitos epidemiologicos distintos, ver docs/fase-5.6-relatorio.md.
 *
 * Populacao: mesma resolucao de calculate-indicadores-real.ts (Populacao/
 * Censo se existir para o ano, senao PopulacaoEstimada) - nenhuma tabela
 * de populacao nova.
 *
 * Idempotente: upsert por chave de grao (mesma logica de salvarIndicadorMunicipal).
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { calcularTaxaPor10k } from '@healthmap/risk';
import {
  getPrismaClient,
  disconnectPrisma,
  getMunicipios,
  getAnosComObitoResidenciaReal,
  getAgregadoObitoResidenciaAnual,
  getAgregadoPopulacao,
  getAgregadoPopulacaoEstimada,
  salvarIndicadorMunicipal,
} from '../index.js';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const prisma = getPrismaClient();

const FONTE_CALCULO = 'HEALTHMAP_CALCULO_INDICADORES';
const INDICADOR_CHAVE = 'TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB';

async function garantirIndicadorDefinicao(): Promise<void> {
  await prisma.indicadorDefinicao.upsert({
    where: { chave: INDICADOR_CHAVE },
    update: {},
    create: {
      chave: INDICADOR_CHAVE,
      nome: 'Taxa de mortalidade oncologica por 10.000 habitantes',
      fonte: 'SIM/DATASUS, grupo DO (Declaracao de Obito), recorte C00-C97',
      unidade: 'por 10.000 habitantes',
      periodicidade: 'ANUAL',
      direcao: 'MAIOR_PIOR',
      eixoTerritorial: 'RESIDENCIA',
      naturezaPadrao: 'OBSERVADO',
      notaMetodologica:
        'Obitos por neoplasia maligna (C00-C97) na populacao residente, por 10 mil habitantes ' +
        '(mesma formula de TAXA_INTERNACAO_10K_HAB - calcularTaxaPor10k, packages/risk). ' +
        'IMPORTANTE: mortalidade POPULACIONAL (obitos / populacao residente) e um conceito ' +
        'epidemiologico DIFERENTE de letalidade HOSPITALAR (obitos / pacientes internados) - ' +
        'nao devem ser confundidos nem comparados diretamente. Este indicador e OBSERVADO e ' +
        'nao entra no RiskScore (decisao metodologica explicita da Fase 5.6, ' +
        'docs/fase-5.6-relatorio.md) - qualquer incorporacao futura ao Radar exige decisao separada.',
      ativo: true,
    },
  });
}

async function run(): Promise<void> {
  console.info('[indicadores-mortalidade-real] iniciando calculo de TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB');

  await garantirIndicadorDefinicao();

  // Mesma FonteDados "passo de calculo" ja usada por calculate-indicadores-real.ts
  // (Fase 5.2) - os insumos (FatoObitoResidencia via SIM, populacao via IBGE)
  // ja tem sua propria linhagem, gravada pelos scripts Python que os ingeriram.
  await prisma.fonteDados.upsert({
    where: { chave: FONTE_CALCULO },
    update: {},
    create: {
      chave: FONTE_CALCULO,
      nome: 'HealthMap - motor de calculo de indicadores (packages/risk)',
      url: null,
      licenca: null,
      periodicidade: 'Sob demanda (reprocessamento manual, ver roadmap Fase 6)',
    },
  });

  const execucao = await prisma.ingestaoExecucao.create({
    data: {
      fonteDadosId: FONTE_CALCULO,
      status: 'INICIADA',
      versaoPipeline: 'calculate-indicadores-mortalidade-real@1.0.0',
      iniciadoEm: new Date(),
    },
  });

  const municipios = await getMunicipios(prisma, { apenasReal: true });
  const anosDistintos = await getAnosComObitoResidenciaReal(prisma);
  console.info(`[indicadores-mortalidade-real] ${municipios.length} municipios REAL, ${anosDistintos.length} ano(s) com FatoObitoResidencia REAL: ${anosDistintos.join(', ')}`);

  let indicadoresSalvos = 0;
  let municipiosSemPopulacao = 0;
  let municipiosSuprimidosOuSemDado = 0;

  for (const ano of anosDistintos) {
    const [agregObitoAnual, agregPopCenso, agregPopEstimada] = await Promise.all([
      getAgregadoObitoResidenciaAnual(prisma, ano),
      getAgregadoPopulacao(prisma, ano),
      getAgregadoPopulacaoEstimada(prisma, ano),
    ]);
    const obitoAnualPorMunicipio = new Map(agregObitoAnual.map((a) => [a.municipioId, a]));
    const popCensoPorMunicipio = new Map(agregPopCenso.map((a) => [a.municipioId, a]));
    const popEstimadaPorMunicipio = new Map(agregPopEstimada.map((a) => [a.municipioId, a]));
    const fontePopUsada = popCensoPorMunicipio.size > 0 ? 'Populacao (Censo)' : 'PopulacaoEstimada (estimativa anual IBGE)';
    console.info(`[indicadores-mortalidade-real] ano ${ano}: fonte de populacao = ${fontePopUsada}`);

    for (const m of municipios) {
      const populacaoTotal = popCensoPorMunicipio.get(m.id)?.populacaoTotal ?? popEstimadaPorMunicipio.get(m.id)?.populacaoTotal ?? 0;
      if (populacaoTotal <= 0) {
        municipiosSemPopulacao += 1;
        continue;
      }
      const taxa = calcularTaxaPor10k(obitoAnualPorMunicipio.get(m.id)?.obitosTotal ?? null, populacaoTotal);
      if (taxa === null) {
        municipiosSuprimidosOuSemDado += 1;
        continue; // celula suprimida (n<5) ou sem FatoObitoResidencia REAL neste ano - nunca vira 0
      }

      await salvarIndicadorMunicipal(prisma, {
        municipioId: m.id,
        ano,
        indicadorDefinicaoId: INDICADOR_CHAVE,
        valor: taxa,
        denominador: populacaoTotal,
        origem: 'REAL',
        execucaoId: execucao.id,
      });
      indicadoresSalvos += 1;
    }
  }

  await prisma.ingestaoExecucao.update({
    where: { id: execucao.id },
    data: {
      status: 'SUCESSO',
      linhasProcessadas: indicadoresSalvos,
      linhasRejeitadas: municipiosSemPopulacao + municipiosSuprimidosOuSemDado,
      finalizadoEm: new Date(),
    },
  });

  console.info('[indicadores-mortalidade-real] resumo:');
  console.info(`  IndicadorMunicipal REAL (${INDICADOR_CHAVE}): ${indicadoresSalvos} linhas`);
  console.info(`  municipios sem populacao (censo nem estimativa) no ano: ${municipiosSemPopulacao}`);
  console.info(`  municipios suprimidos (n<5) ou sem obito registrado no ano: ${municipiosSuprimidosOuSemDado}`);
  console.info('[indicadores-mortalidade-real] concluido com sucesso. RiskScore NAO foi alterado.');
}

run()
  .then(async () => {
    await disconnectPrisma();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[indicadores-mortalidade-real] falhou:', error);
    await disconnectPrisma();
    process.exit(1);
  });
