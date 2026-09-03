/**
 * Calculo do indicador TAXA_INTERNACAO_10K_HAB sobre a base REAL (Fase 5.2).
 *
 * Uso, a partir da raiz do repositorio: npm run db:calculate-indicadores-real
 * (rodar depois de etl/ingest_sih.py e etl/ingest_populacao.py)
 *
 * Mesma fronteira de calculate-risk-demo.ts (Fase 2): le dados gold via
 * packages/db, chama o motor puro de packages/risk (calcularTaxaPor10k - a
 * MESMA funcao usada pelo DEMO, nenhuma segunda implementacao da formula),
 * persiste de volta via packages/db. Nunca calcula RiskScore/
 * RiskComponenteValor REAL aqui - a Pressao Hospitalar Estimada REAL
 * continua estruturalmente indisponivel (SIH e CNES REAL nao compartilham
 * competencia, ver docs/sih-methodology.md #11.2); este script so
 * materializa o indicador OBSERVADO isolado (taxa bruta), que nao depende
 * do CNES.
 *
 * Populacao: prefere Populacao (Censo, grao municipio x ano x faixaEtaria x
 * sexo) quando o ano tem linha REAL; cai para PopulacaoEstimada (estimativa
 * anual, total por municipio, sem quebra etaria/sexo - ver Fase 5.2) caso
 * contrario. Nenhuma das duas e inventada: se nenhuma tiver o ano, o
 * municipio e pulado (reportado no resumo), nunca preenchido com 0/fallback.
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
  getAnosComInternacaoResidenciaAnual,
  getAgregadoInternacaoResidenciaAnualDireto,
  getAgregadoPopulacao,
  getAgregadoPopulacaoEstimada,
  salvarIndicadorMunicipal,
} from '../index.js';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const prisma = getPrismaClient();

const FONTE_CALCULO = 'HEALTHMAP_CALCULO_INDICADORES';

async function run(): Promise<void> {
  console.info('[indicadores-real] iniciando calculo de indicadores REAL');

  // FonteDados dedicada ao PASSO DE CALCULO em si (nunca a uma ingestao
  // externa) - mesmo raciocinio de calculate-risk-demo.ts reaproveitando
  // GERADOR_DEMO: os insumos (FatoInternacaoResidencia via SIH,
  // PopulacaoEstimada via IBGE) ja tem sua propria linhagem, gravada pelos
  // scripts Python que os ingeriram (ver etl/ingest_sih.py,
  // etl/ingest_populacao.py). Esta execucao registra so a etapa de
  // COMPOSICAO desses insumos num indicador, que e responsabilidade
  // exclusiva de packages/risk (CLAUDE.md #3).
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
      versaoPipeline: 'calculate-indicadores-real@1.0.0',
      iniciadoEm: new Date(),
    },
  });

  const municipios = await getMunicipios(prisma, { apenasReal: true });
  // Fase 5.10: os anos vem de FatoInternacaoResidenciaAnual (agregado do dado
  // bruto pelo ETL) em vez das competencias REAL - o insumo da taxa passou a
  // ser o total anual, nao a soma de celulas ja suprimidas.
  const anosDistintos = await getAnosComInternacaoResidenciaAnual(prisma);
  console.info(`[indicadores-real] ${municipios.length} municipios REAL, ${anosDistintos.length} ano(s) com competencia REAL: ${anosDistintos.join(', ')}`);

  let indicadoresSalvos = 0;
  let municipiosSemPopulacao = 0;

  for (const ano of anosDistintos) {
    const [agregResidenciaAnual, agregPopCenso, agregPopEstimada] = await Promise.all([
      getAgregadoInternacaoResidenciaAnualDireto(prisma, ano),
      getAgregadoPopulacao(prisma, ano),
      getAgregadoPopulacaoEstimada(prisma, ano),
    ]);
    const residenciaAnualPorMunicipio = new Map(agregResidenciaAnual.map((a) => [a.municipioId, a]));
    const popCensoPorMunicipio = new Map(agregPopCenso.map((a) => [a.municipioId, a]));
    const popEstimadaPorMunicipio = new Map(agregPopEstimada.map((a) => [a.municipioId, a]));
    const fontePopUsada = popCensoPorMunicipio.size > 0 ? 'Populacao (Censo)' : 'PopulacaoEstimada (estimativa anual IBGE)';
    console.info(`[indicadores-real] ano ${ano}: fonte de populacao = ${fontePopUsada}`);

    for (const m of municipios) {
      const populacaoTotal = popCensoPorMunicipio.get(m.id)?.populacaoTotal ?? popEstimadaPorMunicipio.get(m.id)?.populacaoTotal ?? 0;
      if (populacaoTotal <= 0) {
        municipiosSemPopulacao += 1;
        continue;
      }
      const taxa = calcularTaxaPor10k(residenciaAnualPorMunicipio.get(m.id)?.internacoesTotal ?? null, populacaoTotal);
      if (taxa === null) continue; // celula suprimida (n<5) ou sem FatoInternacaoResidencia REAL neste ano - nunca vira 0

      await salvarIndicadorMunicipal(prisma, {
        municipioId: m.id,
        ano,
        indicadorDefinicaoId: 'TAXA_INTERNACAO_10K_HAB',
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
      linhasRejeitadas: municipiosSemPopulacao,
      finalizadoEm: new Date(),
    },
  });

  console.info('[indicadores-real] resumo:');
  console.info(`  IndicadorMunicipal REAL (taxa/10k): ${indicadoresSalvos} linhas`);
  console.info(`  municipios sem populacao (censo nem estimativa) no ano: ${municipiosSemPopulacao}`);
  console.info('[indicadores-real] concluido com sucesso.');
}

run()
  .then(async () => {
    await disconnectPrisma();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[indicadores-real] falhou:', error);
    await disconnectPrisma();
    process.exit(1);
  });
