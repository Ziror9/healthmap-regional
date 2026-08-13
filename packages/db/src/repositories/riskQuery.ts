/**
 * Repositorio de LEITURA do Radar de Risco para a API (Fase 3).
 *
 * Distinto de repositories/risk.ts (Fase 2: agrega fatos brutos e persiste
 * RiskComponenteValor/RiskScore para o motor de calculo). Este arquivo so
 * le RiskScore/RiskComponenteValor ja materializados - nenhuma agregacao de
 * FatoInternacaoResidencia/FatoInternacaoLocal acontece aqui, e portanto a
 * regra "supressao nunca vira zero" ja foi resolvida rio acima (Fase 2,
 * via bool_or no SQL de agregacao). Este modulo so precisa preservar o que
 * ja esta la: nunca trocar `disponivel=false`/`valorBruto=null` por 0.
 */
import type { PrismaClient } from '@prisma/client';

export type OrigemValor = 'REAL' | 'DEMO';
export type NaturezaValor = 'OBSERVADO' | 'ESTIMATIVA' | 'PROJECAO';
export type ConfiabilidadeValor = 'ALTA' | 'MEDIA' | 'BAIXA';
export type ClassificacaoValor = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO';
export type ComponenteValor = 'PRESSAO_HOSPITALAR_ESTIMADA' | 'TENDENCIA' | 'SEVERIDADE' | 'VULNERABILIDADE';

export interface RiskConfigMeta {
  id: number;
  oficial: boolean;
  autor: string;
  temComponentesAtivos: boolean;
}

export async function getRiskConfigMeta(prisma: PrismaClient, riskConfigId: number): Promise<RiskConfigMeta | null> {
  const config = await prisma.riskConfig.findUnique({
    where: { id: riskConfigId },
    include: { _count: { select: { componentes: { where: { ativo: true } } } } },
  });
  if (!config) return null;
  return { id: config.id, oficial: config.oficial, autor: config.autor, temComponentesAtivos: config._count.componentes > 0 };
}

/**
 * Resolve qual RiskConfig usar quando a API nao recebe `riskConfigId`.
 *
 * Regra documentada (docs/fase-3-relatorio.md): preferir a RiskConfig com
 * `oficial = true` (no maximo uma, garantida por indice unico parcial - ver
 * migration da Fase 1). Nenhuma config e oficial ainda em nenhum ambiente
 * DEMO conhecido nesta fase, entao o fallback e a config utilizavel mais
 * recente (maior id, com pelo menos 1 componente ativo - uma config sem
 * componentes nunca produz RiskScore, escolhe-la como default so devolveria
 * lista vazia sem necessidade). Isso NAO e uma nova regra de metodologia do
 * Radar - e so a escolha de qual versao ja calculada mostrar quando o
 * cliente nao pede uma especifica.
 */
export async function resolveDefaultRiskConfigId(prisma: PrismaClient): Promise<number | null> {
  const oficial = await prisma.riskConfig.findFirst({ where: { oficial: true }, orderBy: { id: 'desc' } });
  if (oficial) return oficial.id;

  const maisRecenteUtilizavel = await prisma.riskConfig.findFirst({
    where: { componentes: { some: { ativo: true } } },
    orderBy: { id: 'desc' },
  });
  return maisRecenteUtilizavel?.id ?? null;
}

/**
 * Origens distintas presentes no conjunto de RiskScore que um filtro
 * (competencia+riskConfig, sem origem) resolveria. Usado pelo service para
 * impedir mistura silenciosa de REAL/DEMO num ranking: se houver mais de 1
 * origem, a API pede para o cliente desambiguar em vez de devolver os dois
 * misturados numa mesma lista.
 */
export async function listOrigensDistintasRiskScore(
  prisma: PrismaClient,
  filtros: { competenciaId: number; riskConfigId: number },
): Promise<OrigemValor[]> {
  const grupos = await prisma.riskScore.groupBy({
    by: ['origem'],
    where: { competenciaId: filtros.competenciaId, riskConfigId: filtros.riskConfigId },
  });
  return grupos.map((g) => g.origem);
}

export interface RiskScoreListItem {
  municipioId: number;
  municipioNome: string;
  municipioCodigoIbge7: string;
  competenciaId: number;
  competenciaAno: number;
  competenciaMes: number;
  riskConfigId: number;
  indice: number;
  classificacao: ClassificacaoValor;
  confiabilidade: ConfiabilidadeValor;
  natureza: NaturezaValor;
  origem: OrigemValor;
}

export async function listRiskScores(
  prisma: PrismaClient,
  filtros: { competenciaId: number; riskConfigId: number; origem?: OrigemValor },
  paginacao: { skip: number; take: number },
): Promise<{ items: RiskScoreListItem[]; total: number }> {
  const where = {
    competenciaId: filtros.competenciaId,
    riskConfigId: filtros.riskConfigId,
    ...(filtros.origem === undefined ? {} : { origem: filtros.origem }),
  };

  const [rows, total] = await Promise.all([
    prisma.riskScore.findMany({
      where,
      include: {
        municipio: { select: { id: true, nome: true, codigoIbge7: true } },
        competencia: { select: { id: true, ano: true, mes: true } },
      },
      orderBy: [{ indice: 'desc' }, { municipioId: 'asc' }],
      skip: paginacao.skip,
      take: paginacao.take,
    }),
    prisma.riskScore.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      municipioId: r.municipio.id,
      municipioNome: r.municipio.nome,
      municipioCodigoIbge7: r.municipio.codigoIbge7,
      competenciaId: r.competencia.id,
      competenciaAno: r.competencia.ano,
      competenciaMes: r.competencia.mes,
      riskConfigId: r.riskConfigId,
      indice: Number(r.indice),
      classificacao: r.classificacao,
      confiabilidade: r.confiabilidade,
      natureza: r.natureza,
      origem: r.origem,
    })),
    total,
  };
}

/** Um unico RiskScore (municipio+competencia+riskConfig e a chave de grao - unique constraint). */
export async function getRiskScoreMunicipio(
  prisma: PrismaClient,
  filtros: { municipioId: number; competenciaId: number; riskConfigId: number; origem?: OrigemValor },
): Promise<RiskScoreListItem | null> {
  const r = await prisma.riskScore.findUnique({
    where: {
      municipioId_competenciaId_riskConfigId: {
        municipioId: filtros.municipioId,
        competenciaId: filtros.competenciaId,
        riskConfigId: filtros.riskConfigId,
      },
    },
    include: {
      municipio: { select: { id: true, nome: true, codigoIbge7: true } },
      competencia: { select: { id: true, ano: true, mes: true } },
    },
  });
  if (!r) return null;
  if (filtros.origem !== undefined && r.origem !== filtros.origem) return null;

  return {
    municipioId: r.municipio.id,
    municipioNome: r.municipio.nome,
    municipioCodigoIbge7: r.municipio.codigoIbge7,
    competenciaId: r.competencia.id,
    competenciaAno: r.competencia.ano,
    competenciaMes: r.competencia.mes,
    riskConfigId: r.riskConfigId,
    indice: Number(r.indice),
    classificacao: r.classificacao,
    confiabilidade: r.confiabilidade,
    natureza: r.natureza,
    origem: r.origem,
  };
}

/** Todas as linhas de RiskScore de um municipio (sem filtro de competencia/config) - usado no detalhe do municipio. */
export async function listRiskScoresDoMunicipio(
  prisma: PrismaClient,
  filtros: { municipioId: number; competenciaId?: number; riskConfigId?: number },
): Promise<RiskScoreListItem[]> {
  const rows = await prisma.riskScore.findMany({
    where: {
      municipioId: filtros.municipioId,
      ...(filtros.competenciaId === undefined ? {} : { competenciaId: filtros.competenciaId }),
      ...(filtros.riskConfigId === undefined ? {} : { riskConfigId: filtros.riskConfigId }),
    },
    include: {
      municipio: { select: { id: true, nome: true, codigoIbge7: true } },
      competencia: { select: { id: true, ano: true, mes: true } },
    },
    orderBy: [{ competenciaId: 'desc' }, { riskConfigId: 'desc' }],
  });

  return rows.map((r) => ({
    municipioId: r.municipio.id,
    municipioNome: r.municipio.nome,
    municipioCodigoIbge7: r.municipio.codigoIbge7,
    competenciaId: r.competencia.id,
    competenciaAno: r.competencia.ano,
    competenciaMes: r.competencia.mes,
    riskConfigId: r.riskConfigId,
    indice: Number(r.indice),
    classificacao: r.classificacao,
    confiabilidade: r.confiabilidade,
    natureza: r.natureza,
    origem: r.origem,
  }));
}

export interface RiskComponenteItem {
  componente: ComponenteValor;
  valorBruto: number | null;
  valorNormalizado: number | null;
  natureza: NaturezaValor;
  confiabilidade: ConfiabilidadeValor;
  disponivel: boolean;
  origem: OrigemValor;
}

/**
 * Componentes materializados de um municipio+competencia+config. Grao unico
 * por componente (@@unique no schema): no maximo 4 linhas (uma por
 * ComponenteRisco). `valorBruto`/`valorNormalizado` saem exatamente como
 * estao no banco - nulos permanecem nulos, nunca viram 0.
 */
export async function listRiskComponentes(
  prisma: PrismaClient,
  filtros: { municipioId: number; competenciaId: number; riskConfigId: number; origem?: OrigemValor },
): Promise<RiskComponenteItem[]> {
  const rows = await prisma.riskComponenteValor.findMany({
    where: {
      municipioId: filtros.municipioId,
      competenciaId: filtros.competenciaId,
      riskConfigId: filtros.riskConfigId,
      ...(filtros.origem === undefined ? {} : { origem: filtros.origem }),
    },
    orderBy: { componente: 'asc' },
  });

  return rows.map((r) => ({
    componente: r.componente,
    valorBruto: r.valorBruto === null ? null : Number(r.valorBruto),
    valorNormalizado: r.valorNormalizado === null ? null : Number(r.valorNormalizado),
    natureza: r.natureza,
    confiabilidade: r.confiabilidade,
    disponivel: r.disponivel,
    origem: r.origem,
  }));
}
