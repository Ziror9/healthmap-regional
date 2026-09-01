/**
 * Calculo do Radar de Risco em grao REGIONAL (Fase 5.5) - RiskComponenteValorRegional
 * + RiskScoreRegional, sobre as 17 RegiaoSaude (DRS) de SP.
 *
 * Uso: npm run db:calculate-risk-regional (depois de etl/ingest_sih.py e
 * etl/ingest_cnes_historico.py - ambos ja gravam o grao regional junto do
 * municipal, ver docs/fase-5.5-relatorio.md)
 *
 * Mesma fronteira arquitetural de calculate-risk-real.ts: le gold via
 * packages/db, calcula via packages/risk (as MESMAS funcoes, grao nao
 * importa para o motor - ele so recebe numeros), persiste via packages/db.
 * Reaproveita a MESMA RiskConfig REAL (`fase5.4-real`) do grao municipal -
 * RiskConfig nao e "por grao", e so pesos + fonte de indicador.
 *
 * VULNERABILIDADE regional: media ponderada (pelo denominador municipal) dos
 * valores municipais de IPVS agrupados por regiao
 * (getIndicadorRegionalPorDefinicao) - segundo nivel de agregacao sobre o
 * mesmo calculo municipal da Fase 5.4, nunca uma nova fonte.
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
  getRegioes,
  getCompetencias,
  getAgregadoInternacaoLocalRegional,
  getAgregadoCapacidadeLeitosRegional,
  getIndicadorRegionalPorDefinicao,
  salvarRiskComponenteValorRegional,
  salvarRiskScoreRegional,
} from '../index.js';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const prisma = getPrismaClient();

const AUTOR_RISK_CONFIG_REAL = 'fase5.4-real';
const ANO_VULNERABILIDADE = 2022;

async function run(): Promise<void> {
  console.info('[risco-regional] iniciando calculo do Radar regional');

  const riskConfigRow = await prisma.riskConfig.findFirst({
    where: { autor: AUTOR_RISK_CONFIG_REAL },
    include: { componentes: true },
  });
  if (!riskConfigRow) {
    console.warn(`[risco-regional] nenhuma RiskConfig com autor "${AUTOR_RISK_CONFIG_REAL}" encontrada - rode calculate-risk-real primeiro.`);
    return;
  }
  const riskConfig: RiskConfigInput = {
    id: riskConfigRow.id,
    limiarVolumeMinimo: riskConfigRow.limiarVolumeMinimo,
    componentes: riskConfigRow.componentes.filter((c) => c.ativo).map((c) => ({ componente: c.componente, peso: Number(c.peso) })),
  };

  const regioes = await getRegioes(prisma);
  const competencias = await getCompetencias(prisma, { apenasReal: true });
  console.info(`[risco-regional] ${regioes.length} regioes, ${competencias.length} competencia(s) REAL`);

  const vulnerabilidadeComponente = riskConfigRow.componentes.find((c) => c.componente === 'VULNERABILIDADE');
  const vulnerabilidadePorRegiao = vulnerabilidadeComponente?.indicadorDefinicaoId
    ? new Map(
        (
          await getIndicadorRegionalPorDefinicao(prisma, {
            indicadorDefinicaoId: vulnerabilidadeComponente.indicadorDefinicaoId,
            ano: ANO_VULNERABILIDADE,
          })
        ).map((i) => [i.regiaoSaudeId, i]),
      )
    : new Map<number, { valor: number; denominador: number | null }>();
  console.info(`[risco-regional] VULNERABILIDADE: ${vulnerabilidadePorRegiao.size} regiao(oes) com indicador resolvido`);

  let componentesSalvos = 0;
  let scoresSalvos = 0;

  for (const competencia of competencias) {
    const [agregLocal, agregLeitos] = await Promise.all([
      getAgregadoInternacaoLocalRegional(prisma, competencia.id),
      getAgregadoCapacidadeLeitosRegional(prisma, competencia.id),
    ]);
    const localPorRegiao = new Map(agregLocal.map((a) => [a.regiaoSaudeId, a]));
    const leitosPorRegiao = new Map(agregLeitos.map((a) => [a.regiaoSaudeId, a]));

    const resultadosPorRegiao = new Map<number, ComponenteResultado[]>();
    for (const r of regioes) {
      const local = localPorRegiao.get(r.id);
      const leitos = leitosPorRegiao.get(r.id);

      const pressao = calcularPressaoHospitalarEstimada({
        pacientesDia: local?.pacientesDia ?? null,
        leitosSusTotal: leitos?.leitosSusTotal ?? null,
        diasNoMes: competencia.diasNoMes,
        internacoesTotal: local?.internacoesTotal ?? null,
        limiarVolumeMinimo: riskConfig.limiarVolumeMinimo,
      });
      const tendencia = calcularTendencia();
      const severidade = calcularSeveridade();
      const indicadorVulnerabilidade = vulnerabilidadePorRegiao.get(r.id);
      const vulnerabilidade = calcularVulnerabilidade({
        valorIndicador: indicadorVulnerabilidade?.valor ?? null,
        naturezaIndicador: 'ESTIMATIVA',
        volume: indicadorVulnerabilidade?.denominador ?? null,
        limiarVolumeMinimo: riskConfig.limiarVolumeMinimo,
      });

      resultadosPorRegiao.set(r.id, [pressao, tendencia, severidade, vulnerabilidade]);
    }

    normalizarComponentesNaCoorte(resultadosPorRegiao, 'MAIOR_PIOR');

    const indicesPorRegiao = new Map<number, number>();
    const scorePorRegiao = new Map<number, ReturnType<typeof calcularScore>>();

    for (const [regiaoSaudeId, resultados] of resultadosPorRegiao) {
      for (const r of resultados) {
        await salvarRiskComponenteValorRegional(prisma, {
          regiaoSaudeId,
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
      scorePorRegiao.set(regiaoSaudeId, score);
      if (score.disponivel && score.indice !== null) {
        indicesPorRegiao.set(regiaoSaudeId, score.indice);
      }
    }

    const classificacoes = classificarPorQuintil(indicesPorRegiao);

    for (const [regiaoSaudeId, score] of scorePorRegiao) {
      if (!score.disponivel || score.indice === null) continue;
      const classificacao = classificacoes.get(regiaoSaudeId);
      if (!classificacao) continue;
      await salvarRiskScoreRegional(prisma, {
        regiaoSaudeId,
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
      `[risco-regional] competencia ${competencia.ano}-${String(competencia.mes).padStart(2, '0')}: ` +
        `${indicesPorRegiao.size} regiao(oes) com indice disponivel`,
    );
  }

  console.info('[risco-regional] resumo:');
  console.info(`  RiskComponenteValorRegional: ${componentesSalvos} linhas`);
  console.info(`  RiskScoreRegional: ${scoresSalvos} linhas`);
  console.info('[risco-regional] concluido com sucesso.');
}

run()
  .then(async () => {
    await disconnectPrisma();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[risco-regional] falhou:', error);
    await disconnectPrisma();
    process.exit(1);
  });
