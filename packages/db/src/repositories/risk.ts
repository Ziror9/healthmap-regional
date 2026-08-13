/**
 * Repositorio de leitura/escrita para o motor de risco (Fase 2).
 *
 * Unico lugar do projeto que sabe como os dados gold se transformam nos
 * insumos que packages/risk espera, e como os resultados de packages/risk
 * viram linhas de RiskComponenteValor/RiskScore. Nenhuma logica de calculo
 * mora aqui - so leitura, agregacao ciente de supressao, e escrita.
 */
import type { PrismaClient } from '@prisma/client';

export interface MunicipioRef {
  id: number;
  nome: string;
}

export interface CompetenciaRef {
  id: number;
  ano: number;
  mes: number;
  diasNoMes: number;
}

export interface RiskConfigComponenteRef {
  componente: 'PRESSAO_HOSPITALAR_ESTIMADA' | 'TENDENCIA' | 'SEVERIDADE' | 'VULNERABILIDADE';
  peso: number;
  indicadorDefinicaoId: string | null;
}

export interface RiskConfigRef {
  id: number;
  limiarVolumeMinimo: number;
  componentes: RiskConfigComponenteRef[];
}

/**
 * Agregado por municipio de internacao numa competencia, ja aplicando a
 * regra de supressao: se QUALQUER celula (faixa x sexo) contribuinte
 * estiver suprimida, o agregado inteiro vem null - nunca a soma parcial das
 * celulas visiveis (isso subestimaria o total silenciosamente). `bool_or`
 * no SQL e o que garante essa regra sem carregar cada celula pra memoria.
 */
export interface AgregadoInternacaoLocal {
  municipioId: number;
  pacientesDia: number | null;
  internacoesTotal: number | null;
}

export interface AgregadoInternacaoResidencia {
  municipioId: number;
  internacoesTotal: number | null;
}

export interface AgregadoCapacidadeLeitos {
  municipioId: number;
  leitosSusTotal: number;
}

export interface AgregadoPopulacao {
  municipioId: number;
  populacaoTotal: number;
}

export async function getMunicipios(prisma: PrismaClient): Promise<MunicipioRef[]> {
  return prisma.municipio.findMany({ select: { id: true, nome: true }, orderBy: { id: 'asc' } });
}

export async function getCompetencias(prisma: PrismaClient): Promise<CompetenciaRef[]> {
  return prisma.competencia.findMany({
    select: { id: true, ano: true, mes: true, diasNoMes: true },
    orderBy: { dataRef: 'asc' },
  });
}

export async function getRiskConfigsFase2(prisma: PrismaClient): Promise<RiskConfigRef[]> {
  const configs = await prisma.riskConfig.findMany({
    where: { componentes: { some: {} } },
    include: { componentes: { where: { ativo: true } } },
    orderBy: { id: 'asc' },
  });
  return configs.map((c) => ({
    id: c.id,
    limiarVolumeMinimo: c.limiarVolumeMinimo,
    componentes: c.componentes.map((comp) => ({
      componente: comp.componente,
      peso: Number(comp.peso),
      indicadorDefinicaoId: comp.indicadorDefinicaoId,
    })),
  }));
}

export async function getAgregadoInternacaoLocal(
  prisma: PrismaClient,
  competenciaId: number,
): Promise<AgregadoInternacaoLocal[]> {
  const linhas = await prisma.$queryRaw<
    { municipioId: number; pacientesDia: bigint | null; internacoesTotal: bigint | null }[]
  >`
    SELECT
      "municipioInternacaoId" AS "municipioId",
      CASE WHEN bool_or(suprimido) THEN NULL ELSE SUM("pacientesDia") END AS "pacientesDia",
      CASE WHEN bool_or(suprimido) THEN NULL ELSE SUM(internacoes) END AS "internacoesTotal"
    FROM gold."FatoInternacaoLocal"
    WHERE "competenciaId" = ${competenciaId}
    GROUP BY "municipioInternacaoId"
  `;
  return linhas.map((l) => ({
    municipioId: l.municipioId,
    pacientesDia: l.pacientesDia === null ? null : Number(l.pacientesDia),
    internacoesTotal: l.internacoesTotal === null ? null : Number(l.internacoesTotal),
  }));
}

export async function getAgregadoInternacaoResidencia(
  prisma: PrismaClient,
  competenciaId: number,
): Promise<AgregadoInternacaoResidencia[]> {
  const linhas = await prisma.$queryRaw<{ municipioId: number; internacoesTotal: bigint | null }[]>`
    SELECT
      "municipioResidenciaId" AS "municipioId",
      CASE WHEN bool_or(suprimido) THEN NULL ELSE SUM(internacoes) END AS "internacoesTotal"
    FROM gold."FatoInternacaoResidencia"
    WHERE "competenciaId" = ${competenciaId}
    GROUP BY "municipioResidenciaId"
  `;
  return linhas.map((l) => ({
    municipioId: l.municipioId,
    internacoesTotal: l.internacoesTotal === null ? null : Number(l.internacoesTotal),
  }));
}

/**
 * Mesma agregacao acima, mas somando TODAS as competencias de um ano de
 * uma vez - necessario porque IndicadorMunicipal tem grao anual
 * (municipioId + ano + indicadorDefinicaoId, ver @@unique no schema),
 * diferente de FatoInternacaoResidencia, que e mensal. Calcular a taxa por
 * competencia e gravar em IndicadorMunicipal sobrescreveria silenciosamente
 * o mes anterior a cada nova competencia processada - por isso a agregacao
 * precisa acontecer no grao certo ANTES de persistir, nao depois.
 * `bool_or(suprimido)` continua valendo por municipio, agora sobre todas as
 * celulas do ano inteiro: uma unica celula suprimida em qualquer mes torna
 * o total anual do municipio indisponivel (mesma regra de NULL != 0).
 */
export async function getAgregadoInternacaoResidenciaAnual(
  prisma: PrismaClient,
  ano: number,
): Promise<AgregadoInternacaoResidencia[]> {
  const linhas = await prisma.$queryRaw<{ municipioId: number; internacoesTotal: bigint | null }[]>`
    SELECT
      f."municipioResidenciaId" AS "municipioId",
      CASE WHEN bool_or(f.suprimido) THEN NULL ELSE SUM(f.internacoes) END AS "internacoesTotal"
    FROM gold."FatoInternacaoResidencia" f
    JOIN silver."Competencia" c ON c.id = f."competenciaId"
    WHERE c.ano = ${ano}
    GROUP BY f."municipioResidenciaId"
  `;
  return linhas.map((l) => ({
    municipioId: l.municipioId,
    internacoesTotal: l.internacoesTotal === null ? null : Number(l.internacoesTotal),
  }));
}

export async function getAgregadoCapacidadeLeitos(
  prisma: PrismaClient,
  competenciaId: number,
): Promise<AgregadoCapacidadeLeitos[]> {
  const linhas = await prisma.fatoCapacidadeLeitos.groupBy({
    by: ['municipioInternacaoId'],
    where: { competenciaId },
    _sum: { leitosSus: true },
  });
  return linhas.map((l) => ({
    municipioId: l.municipioInternacaoId,
    leitosSusTotal: l._sum.leitosSus ?? 0,
  }));
}

export async function getAgregadoPopulacao(prisma: PrismaClient, ano: number): Promise<AgregadoPopulacao[]> {
  const linhas = await prisma.populacao.groupBy({
    by: ['municipioId'],
    where: { ano },
    _sum: { populacao: true },
  });
  return linhas.map((l) => ({ municipioId: l.municipioId, populacaoTotal: l._sum.populacao ?? 0 }));
}

export interface RiskComponenteValorInput {
  municipioId: number;
  competenciaId: number;
  riskConfigId: number;
  componente: 'PRESSAO_HOSPITALAR_ESTIMADA' | 'TENDENCIA' | 'SEVERIDADE' | 'VULNERABILIDADE';
  valorBruto: number | null;
  valorNormalizado: number | null;
  natureza: 'OBSERVADO' | 'ESTIMATIVA' | 'PROJECAO';
  confiabilidade: 'ALTA' | 'MEDIA' | 'BAIXA';
  disponivel: boolean;
  origem: 'REAL' | 'DEMO';
}

/** Upsert sobre a chave de grao - idempotente: reexecutar o calculo para a mesma celula converge, nao duplica. */
export async function salvarRiskComponenteValor(prisma: PrismaClient, input: RiskComponenteValorInput): Promise<void> {
  await prisma.riskComponenteValor.upsert({
    where: {
      municipioId_competenciaId_riskConfigId_componente: {
        municipioId: input.municipioId,
        competenciaId: input.competenciaId,
        riskConfigId: input.riskConfigId,
        componente: input.componente,
      },
    },
    update: {
      valorBruto: input.valorBruto,
      valorNormalizado: input.valorNormalizado,
      natureza: input.natureza,
      confiabilidade: input.confiabilidade,
      disponivel: input.disponivel,
      origem: input.origem,
    },
    create: input,
  });
}

export interface RiskScoreInput {
  municipioId: number;
  competenciaId: number;
  riskConfigId: number;
  indice: number;
  classificacao: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO';
  confiabilidade: 'ALTA' | 'MEDIA' | 'BAIXA';
  natureza: 'OBSERVADO' | 'ESTIMATIVA' | 'PROJECAO';
  origem: 'REAL' | 'DEMO';
}

export async function salvarRiskScore(prisma: PrismaClient, input: RiskScoreInput): Promise<void> {
  await prisma.riskScore.upsert({
    where: {
      municipioId_competenciaId_riskConfigId: {
        municipioId: input.municipioId,
        competenciaId: input.competenciaId,
        riskConfigId: input.riskConfigId,
      },
    },
    update: {
      indice: input.indice,
      classificacao: input.classificacao,
      confiabilidade: input.confiabilidade,
      natureza: input.natureza,
      origem: input.origem,
    },
    create: input,
  });
}

export interface IndicadorMunicipalInput {
  municipioId: number;
  ano: number;
  indicadorDefinicaoId: string;
  valor: number;
  origem: 'REAL' | 'DEMO';
  execucaoId: string;
}

export async function salvarIndicadorMunicipal(prisma: PrismaClient, input: IndicadorMunicipalInput): Promise<void> {
  await prisma.indicadorMunicipal.upsert({
    where: {
      municipioId_ano_indicadorDefinicaoId: {
        municipioId: input.municipioId,
        ano: input.ano,
        indicadorDefinicaoId: input.indicadorDefinicaoId,
      },
    },
    update: { valor: input.valor, origem: input.origem, execucaoId: input.execucaoId },
    create: input,
  });
}
