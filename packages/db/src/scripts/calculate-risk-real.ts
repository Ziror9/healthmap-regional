/**
 * Calculo do Radar de Risco (RiskComponenteValor + RiskScore) sobre a base
 * REAL (Fase 5.3) - so passa a existir porque etl/ingest_cnes_historico.py
 * (CNES, grupo LT via pySUS) finalmente da capacidade de leitos REAL na
 * MESMA competencia do SIH REAL (docs/sih-methodology.md #11.2, resolvido).
 *
 * Uso: npm run db:calculate-risk-real (depois de etl/ingest_sih.py e
 * etl/ingest_cnes_historico.py)
 *
 * Mesma fronteira arquitetural de calculate-risk-demo.ts (Fase 2): le gold
 * via packages/db, calcula via packages/risk (as MESMAS funcoes, nenhuma
 * segunda implementacao - CLAUDE.md #3), persiste via packages/db.
 *
 * PRESSAO_HOSPITALAR_ESTIMADA (Fase 5.3) e VULNERABILIDADE (Fase 5.4, via
 * IPVS/SEADE - ver etl/ingest_vulnerabilidade.py) produzem valor aqui.
 * TENDENCIA/SEVERIDADE seguem sempre indisponiveis (sem definicao
 * metodologica, sem mudanca desde a Fase 2). VULNERABILIDADE so fica
 * disponivel para um municipio se `IndicadorMunicipal` (IPVS,
 * indicadorDefinicaoId configurado na RiskConfig) tiver uma linha para
 * ele - resolvido dinamicamente, nao hardcoded.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import {
  calcularPressaoHospitalarEstimada,
  calcularTendencia,
  calcularSeveridade,
  calcularVulnerabilidade,
  normalizarComponentesNaCoorte,
  calcularScore,
  classificarPorQuintil,
  type ComponenteResultado,
  type RiskConfigInput,
} from '@healthmap/risk';
import {
  getPrismaClient,
  disconnectPrisma,
  getMunicipios,
  getCompetencias,
  getAgregadoInternacaoLocal,
  getAgregadoCapacidadeLeitos,
  getIndicadorMunicipalPorDefinicao,
  salvarRiskComponenteValor,
  salvarRiskScore,
} from '../index.js';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const prisma = getPrismaClient();

const AUTOR_RISK_CONFIG_REAL = 'fase5.4-real';
const INDICADOR_VULNERABILIDADE = 'IPVS_MEDIA_PONDERADA_SETOR';
const ANO_VULNERABILIDADE = 2022; // ano do Censo/IPVS usado - ver etl/ingest_vulnerabilidade.py

async function obterOuCriarRiskConfigReal() {
  const existente = await prisma.riskConfig.findFirst({
    where: { autor: AUTOR_RISK_CONFIG_REAL },
    include: { componentes: true },
  });
  if (existente) return existente;

  // VULNERABILIDADE so aponta para o indicador se ele ja existir - torna o
  // script robusto independente da ordem de execucao dos ingest_*.py
  // (rodar antes de etl/ingest_vulnerabilidade.py so deixa o componente sem
  // fonte configurada, igual ao comportamento anterior a Fase 5.4).
  const indicadorVulnerabilidade = await prisma.indicadorDefinicao.findUnique({
    where: { chave: INDICADOR_VULNERABILIDADE },
  });

  const PESO_IGUAL = 0.25;
  const criada = await prisma.riskConfig.create({
    data: {
      metodoNormalizacao: 'PERCENTIL_COORTE',
      limiarVolumeMinimo: 30,
      vigenciaInicio: new Date(),
      oficial: false,
      autor: AUTOR_RISK_CONFIG_REAL,
      notaVersao:
        'Config REAL da Fase 5.4 - pesos iguais (0.25 por componente), mesma logica das duas ' +
        'configs DEMO da Fase 2 (nenhum peso oficial documentado em risk-methodology.md; peso ' +
        'igual e a unica distribuicao que nao expressa julgamento de importancia relativa). ' +
        (indicadorVulnerabilidade
          ? `VULNERABILIDADE aponta para ${INDICADOR_VULNERABILIDADE} (IPVS/SEADE, media ponderada ` +
            'por populacao por municipio, natureza ESTIMATIVA - ver docs/fase-5.4-relatorio.md).'
          : 'VULNERABILIDADE estruturalmente presente, sem indicadorDefinicaoId configurado - fica ' +
            'indisponivel ate etl/ingest_vulnerabilidade.py ser executado.'),
      componentes: {
        create: (['PRESSAO_HOSPITALAR_ESTIMADA', 'TENDENCIA', 'SEVERIDADE', 'VULNERABILIDADE'] as const).map(
          (componente) => ({
            componente,
            peso: PESO_IGUAL,
            ativo: true,
            indicadorDefinicaoId: componente === 'VULNERABILIDADE' ? (indicadorVulnerabilidade?.chave ?? null) : null,
          }),
        ),
      },
    },
    include: { componentes: true },
  });
  console.info(`[risco-real] RiskConfig REAL criada: id=${criada.id}`);
  return criada;
}

async function run(): Promise<void> {
  console.info('[risco-real] iniciando calculo do Radar sobre a base REAL');

  const riskConfigRow = await obterOuCriarRiskConfigReal();
  const riskConfig: RiskConfigInput = {
    id: riskConfigRow.id,
    limiarVolumeMinimo: riskConfigRow.limiarVolumeMinimo,
    componentes: riskConfigRow.componentes
      .filter((c) => c.ativo)
      .map((c) => ({ componente: c.componente, peso: Number(c.peso) })),
  };

  const municipios = await getMunicipios(prisma, { apenasReal: true });
  const competencias = await getCompetencias(prisma, { apenasReal: true });
  console.info(`[risco-real] ${municipios.length} municipios REAL, ${competencias.length} competencia(s) REAL`);

  const vulnerabilidadeComponente = riskConfigRow.componentes.find((c) => c.componente === 'VULNERABILIDADE');
  const vulnerabilidadePorMunicipio = vulnerabilidadeComponente?.indicadorDefinicaoId
    ? new Map(
        (
          await getIndicadorMunicipalPorDefinicao(prisma, {
            indicadorDefinicaoId: vulnerabilidadeComponente.indicadorDefinicaoId,
            ano: ANO_VULNERABILIDADE,
          })
        ).map((i) => [i.municipioId, i]),
      )
    : new Map<number, { valor: number; denominador: number | null }>();
  console.info(`[risco-real] VULNERABILIDADE: ${vulnerabilidadePorMunicipio.size} municipio(s) com indicador resolvido`);

  let componentesSalvos = 0;
  let scoresSalvos = 0;

  for (const competencia of competencias) {
    const [agregLocal, agregLeitos] = await Promise.all([
      getAgregadoInternacaoLocal(prisma, competencia.id),
      getAgregadoCapacidadeLeitos(prisma, competencia.id),
    ]);
    const localPorMunicipio = new Map(agregLocal.map((a) => [a.municipioId, a]));
    const leitosPorMunicipio = new Map(agregLeitos.map((a) => [a.municipioId, a]));

    const resultadosPorMunicipio = new Map<number, ComponenteResultado[]>();
    for (const m of municipios) {
      const local = localPorMunicipio.get(m.id);
      const leitos = leitosPorMunicipio.get(m.id);

      const pressao = calcularPressaoHospitalarEstimada({
        pacientesDia: local?.pacientesDia ?? null,
        leitosSusTotal: leitos?.leitosSusTotal ?? null,
        diasNoMes: competencia.diasNoMes,
        internacoesTotal: local?.internacoesTotal ?? null,
        limiarVolumeMinimo: riskConfig.limiarVolumeMinimo,
      });
      const tendencia = calcularTendencia();
      const severidade = calcularSeveridade();
      // Resolvido dinamicamente via IndicadorMunicipal (IPVS/SEADE, Fase 5.4)
      // - null (indisponivel) se o componente nao tiver indicadorDefinicaoId
      // configurado, ou se o municipio nao tiver linha (nenhum setor
      // classificavel, ver etl/ingest_vulnerabilidade.py).
      const indicadorVulnerabilidade = vulnerabilidadePorMunicipio.get(m.id);
      const vulnerabilidade = calcularVulnerabilidade({
        valorIndicador: indicadorVulnerabilidade?.valor ?? null,
        naturezaIndicador: 'ESTIMATIVA',
        volume: indicadorVulnerabilidade?.denominador ?? null,
        limiarVolumeMinimo: riskConfig.limiarVolumeMinimo,
      });

      resultadosPorMunicipio.set(m.id, [pressao, tendencia, severidade, vulnerabilidade]);
    }

    normalizarComponentesNaCoorte(resultadosPorMunicipio, 'MAIOR_PIOR');

    const indicesPorMunicipio = new Map<number, number>();
    const scorePorMunicipio = new Map<number, ReturnType<typeof calcularScore>>();

    for (const [municipioId, resultados] of resultadosPorMunicipio) {
      for (const r of resultados) {
        await salvarRiskComponenteValor(prisma, {
          municipioId,
          competenciaId: competencia.id,
          riskConfigId: riskConfig.id,
          componente: r.componente,
          valorBruto: r.valorBruto,
          valorNormalizado: r.valorNormalizado,
          natureza: r.natureza,
          confiabilidade: r.confiabilidade,
          disponivel: r.disponivel,
          origem: 'REAL',
        });
        componentesSalvos += 1;
      }

      const score = calcularScore(resultados, riskConfig);
      scorePorMunicipio.set(municipioId, score);
      if (score.disponivel && score.indice !== null) {
        indicesPorMunicipio.set(municipioId, score.indice);
      }
    }

    const classificacoes = classificarPorQuintil(indicesPorMunicipio);

    for (const [municipioId, score] of scorePorMunicipio) {
      if (!score.disponivel || score.indice === null) continue;
      const classificacao = classificacoes.get(municipioId);
      if (!classificacao) continue; // nao deveria acontecer - nunca inventar uma classificacao
      await salvarRiskScore(prisma, {
        municipioId,
        competenciaId: competencia.id,
        riskConfigId: riskConfig.id,
        indice: score.indice,
        classificacao,
        confiabilidade: score.confiabilidade,
        natureza: score.natureza,
        origem: 'REAL',
      });
      scoresSalvos += 1;
    }

    console.info(
      `[risco-real] competencia ${competencia.ano}-${String(competencia.mes).padStart(2, '0')}: ` +
        `${indicesPorMunicipio.size} municipio(s) com indice disponivel`,
    );
  }

  console.info('[risco-real] resumo:');
  console.info(`  RiskComponenteValor REAL: ${componentesSalvos} linhas`);
  console.info(`  RiskScore REAL: ${scoresSalvos} linhas`);
  console.info('[risco-real] concluido com sucesso.');
}

run()
  .then(async () => {
    await disconnectPrisma();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[risco-real] falhou:', error);
    await disconnectPrisma();
    process.exit(1);
  });
