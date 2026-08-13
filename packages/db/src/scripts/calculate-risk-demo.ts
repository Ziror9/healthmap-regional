/**
 * Orquestracao do calculo de risco (Fase 2) sobre a base DEMO.
 *
 * Uso, a partir da raiz do repositorio: npm run db:calculate-risk
 * (rodar depois de npm run db:seed)
 *
 * Este script E a fronteira que le dados gold via packages/db, chama o
 * motor puro de packages/risk, e persiste os resultados de volta via
 * packages/db. packages/risk nunca ve Prisma; este script nunca calcula
 * nada sozinho - toda matematica vive em packages/risk.
 *
 * Idempotente: toda escrita e upsert sobre a chave de grao (mesma logica
 * do seed). Reexecutar para a mesma competencia + RiskConfig converge,
 * nao duplica. Reexecutar com uma RiskConfig NOVA cria linhas novas
 * (append-only), preservando o historico das configs anteriores.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import {
  calcularPressaoHospitalarEstimada,
  calcularTaxaPor10k,
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
  getRiskConfigsFase2,
  getAgregadoInternacaoLocal,
  getAgregadoInternacaoResidenciaAnual,
  getAgregadoCapacidadeLeitos,
  getAgregadoPopulacao,
  salvarRiskComponenteValor,
  salvarRiskScore,
  salvarIndicadorMunicipal,
} from '../index.js';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const prisma = getPrismaClient();

async function run(): Promise<void> {
  console.info('[risco] iniciando calculo de risco sobre a base DEMO');

  // Lineage: reaproveita a fonte GERADOR_DEMO (tudo aqui deriva, em ultima
  // instancia, da mesma base sintetica) numa IngestaoExecucao propria para
  // esta etapa de calculo - mesmo padrao ja usado pelo seed para a carga
  // de referencia (nao ha, e nao se justifica criar, uma FonteDados nova
  // so para "motor de calculo").
  const execucaoRisco = await prisma.ingestaoExecucao.upsert({
    where: { id: 'demo-execucao-risco-fase2' },
    update: {},
    create: {
      id: 'demo-execucao-risco-fase2',
      fonteDadosId: 'GERADOR_DEMO',
      status: 'SUCESSO',
      versaoPipeline: 'calculate-risk-demo@1.0.0',
      iniciadoEm: new Date(),
      finalizadoEm: new Date(),
    },
  });

  const municipios = await getMunicipios(prisma);
  const competencias = await getCompetencias(prisma);
  const riskConfigs = await getRiskConfigsFase2(prisma);

  if (riskConfigs.length === 0) {
    console.warn('[risco] nenhuma RiskConfig com componentes encontrada - rode "npm run db:seed" primeiro.');
    return;
  }
  console.info(`[risco] ${municipios.length} municipios, ${competencias.length} competencias, ${riskConfigs.length} RiskConfig(s)`);

  let indicadoresSalvos = 0;
  let componentesSalvos = 0;
  let scoresSalvos = 0;

  // --- TENDENCIA: so a taxa OBSERVADA por 10k e computavel (ver
  // packages/risk/src/components/tendencia.ts). IndicadorMunicipal tem
  // grao ANUAL (municipioId+ano+indicadorDefinicaoId - ver @@unique no
  // schema), diferente do grao mensal dos fatos de origem: por isso a
  // agregacao acontece uma vez por ano (nao por competencia, o que
  // sobrescreveria mes a mes silenciosamente) e fica fora do loop abaixo,
  // que e por competencia.
  const anosDistintos = [...new Set(competencias.map((c) => c.ano))];
  for (const ano of anosDistintos) {
    const [agregResidenciaAnual, agregPopAnual] = await Promise.all([
      getAgregadoInternacaoResidenciaAnual(prisma, ano),
      getAgregadoPopulacao(prisma, ano),
    ]);
    const residenciaAnualPorMunicipio = new Map(agregResidenciaAnual.map((a) => [a.municipioId, a]));
    const popAnualPorMunicipio = new Map(agregPopAnual.map((a) => [a.municipioId, a]));

    for (const m of municipios) {
      const taxa = calcularTaxaPor10k(
        residenciaAnualPorMunicipio.get(m.id)?.internacoesTotal ?? null,
        popAnualPorMunicipio.get(m.id)?.populacaoTotal ?? 0,
      );
      if (taxa === null) continue;
      await salvarIndicadorMunicipal(prisma, {
        municipioId: m.id,
        ano,
        indicadorDefinicaoId: 'TAXA_INTERNACAO_10K_HAB',
        valor: taxa,
        origem: 'DEMO',
        execucaoId: execucaoRisco.id,
      });
      indicadoresSalvos += 1;
    }
  }

  for (const competencia of competencias) {
    const [agregLocal, agregLeitos] = await Promise.all([
      getAgregadoInternacaoLocal(prisma, competencia.id),
      getAgregadoCapacidadeLeitos(prisma, competencia.id),
    ]);

    const localPorMunicipio = new Map(agregLocal.map((a) => [a.municipioId, a]));
    const leitosPorMunicipio = new Map(agregLeitos.map((a) => [a.municipioId, a]));

    for (const riskConfig of riskConfigs) {
      const riskConfigInput: RiskConfigInput = {
        id: riskConfig.id,
        limiarVolumeMinimo: riskConfig.limiarVolumeMinimo,
        componentes: riskConfig.componentes.map((c) => ({ componente: c.componente, peso: c.peso })),
      };

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
        // Nenhuma RiskConfigComponente desta fase aponta indicadorDefinicaoId
        // para VULNERABILIDADE (fonte nao definida - risk-methodology.md #2.4):
        // fica sempre indisponivel, exatamente como documentado.
        const vulnerabilidade = calcularVulnerabilidade({
          valorIndicador: null,
          naturezaIndicador: 'ESTIMATIVA',
          volume: null,
          limiarVolumeMinimo: riskConfig.limiarVolumeMinimo,
        });

        resultadosPorMunicipio.set(m.id, [pressao, tendencia, severidade, vulnerabilidade]);
      }

      // direcaoVulnerabilidade e inerte nesta execucao: sem indicador
      // configurado, VULNERABILIDADE nunca fica disponivel, entao nunca
      // entra na normalizacao por coorte.
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
            origem: 'DEMO',
          });
          componentesSalvos += 1;
        }

        const score = calcularScore(resultados, riskConfigInput);
        scorePorMunicipio.set(municipioId, score);
        if (score.disponivel && score.indice !== null) {
          indicesPorMunicipio.set(municipioId, score.indice);
        }
      }

      const classificacoes = classificarPorQuintil(indicesPorMunicipio);

      for (const [municipioId, score] of scorePorMunicipio) {
        if (!score.disponivel || score.indice === null) continue;
        const classificacao = classificacoes.get(municipioId);
        if (!classificacao) continue; // nao deveria acontecer (todo indice entra na coorte) - nunca inventar uma classificacao
        await salvarRiskScore(prisma, {
          municipioId,
          competenciaId: competencia.id,
          riskConfigId: riskConfig.id,
          indice: score.indice,
          classificacao,
          confiabilidade: score.confiabilidade,
          natureza: score.natureza,
          origem: 'DEMO',
        });
        scoresSalvos += 1;
      }
    }

    console.info(`[risco] competencia ${competencia.ano}-${String(competencia.mes).padStart(2, '0')} processada`);
  }

  console.info('[risco] resumo:');
  console.info(`  IndicadorMunicipal (taxa/10k): ${indicadoresSalvos} linhas`);
  console.info(`  RiskComponenteValor: ${componentesSalvos} linhas`);
  console.info(`  RiskScore: ${scoresSalvos} linhas`);
  console.info('[risco] concluido com sucesso.');
}

run()
  .then(async () => {
    await disconnectPrisma();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('[risco] falhou:', error);
    await disconnectPrisma();
    process.exit(1);
  });
