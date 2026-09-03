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

export interface CompetenciaComDadosRef {
  id: number;
  ano: number;
  mes: number;
}

/**
 * Competencia mais recente (por dataRef) que tem pelo menos 1 RiskScore
 * para o riskConfig informado - usada como default do Radar em vez da
 * competencia mais recente por data (catalog.ts:getCompetenciaMaisRecente),
 * que pode ser uma competencia so geografica/de capacidade sem nenhum
 * RiskScore calculado (ex.: snapshot do CNES carimbado no mes corrente da
 * ingestao). Sem isso, abrir o Radar sem filtro nenhum resolve para uma
 * competencia sem dado e devolve lista vazia mesmo havendo RiskScore
 * calculado em competencias anteriores.
 */
export async function getCompetenciaMaisRecenteComRiskScore(
  prisma: PrismaClient,
  riskConfigId: number,
  /**
   * Quando o cliente pede uma origem explicitamente, a competencia default
   * precisa ser uma que tenha RiskScore DAQUELA origem. Sem isso a resolucao
   * pode escolher uma competencia que so tem score da outra origem e devolver
   * lista vazia mesmo havendo dado - situacao real no banco atual, onde a
   * config REAL (fase5.4-real) tambem recebeu scores DEMO de competencias
   * mais recentes. Omitido = comportamento original (qualquer origem).
   */
  origem?: OrigemValor,
): Promise<CompetenciaComDadosRef | null> {
  const competenciasComScore = await prisma.riskScore.findMany({
    where: { riskConfigId, ...(origem === undefined ? {} : { origem }) },
    select: { competenciaId: true },
    distinct: ['competenciaId'],
  });
  if (competenciasComScore.length === 0) return null;

  const competencia = await prisma.competencia.findFirst({
    where: { id: { in: competenciasComScore.map((c) => c.competenciaId) } },
    orderBy: { dataRef: 'desc' },
    select: { id: true, ano: true, mes: true },
  });
  return competencia;
}

/**
 * Competencia mais recente (por dataRef) DENTRO de um ano especifico que tem
 * RiskScore para o riskConfig informado - usada pelo Radar Municipal (Fase
 * 5.7) para resolver "ano" em algo que RiskScore entende (RiskScore e por
 * competencia/mes, nao tem grao anual proprio; nao inventamos um "RiskScore
 * anual" novo, so escolhemos qual competencia ja calculada mostrar quando o
 * usuario filtra por ano - mesma filosofia de getCompetenciaMaisRecenteComRiskScore).
 */
export async function getCompetenciaMaisRecenteComRiskScorePorAno(
  prisma: PrismaClient,
  riskConfigId: number,
  ano: number,
): Promise<CompetenciaComDadosRef | null> {
  const competenciasComScore = await prisma.riskScore.findMany({
    where: { riskConfigId, competencia: { ano } },
    select: { competenciaId: true },
    distinct: ['competenciaId'],
  });
  if (competenciasComScore.length === 0) return null;

  const competencia = await prisma.competencia.findFirst({
    where: { id: { in: competenciasComScore.map((c) => c.competenciaId) } },
    orderBy: { dataRef: 'desc' },
    select: { id: true, ano: true, mes: true },
  });
  return competencia;
}

/** Anos distintos com pelo menos 1 RiskScore REAL para o riskConfig informado - "anos disponiveis" do Radar Municipal. */
export async function getAnosComRiskScore(
  prisma: PrismaClient,
  riskConfigId: number,
  origem: OrigemValor = 'REAL',
): Promise<number[]> {
  const rows = await prisma.riskScore.findMany({
    where: { riskConfigId, origem },
    select: { competencia: { select: { ano: true } } },
    distinct: ['competenciaId'],
  });
  return [...new Set(rows.map((r) => r.competencia.ano))].sort((a, b) => a - b);
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
  /** RiskScore.createdAt em ISO - indicador de frescor (Fase 4), nunca fabricado no frontend. */
  calculadoEm: string;
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
      calculadoEm: r.createdAt.toISOString(),
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
    calculadoEm: r.createdAt.toISOString(),
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
    calculadoEm: r.createdAt.toISOString(),
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

// -----------------------------------------------------------------------------
// Grao REGIONAL (Fase 5.5) - mesmas funcoes acima, lendo RiskScoreRegional/
// RiskComponenteValorRegional em vez de RiskScore/RiskComponenteValor. Mesma
// regra de nunca trocar disponivel=false/valorBruto=null por 0.
// -----------------------------------------------------------------------------

export async function getCompetenciaMaisRecenteComRiskScoreRegional(
  prisma: PrismaClient,
  riskConfigId: number,
): Promise<CompetenciaComDadosRef | null> {
  const competenciasComScore = await prisma.riskScoreRegional.findMany({
    where: { riskConfigId },
    select: { competenciaId: true },
    distinct: ['competenciaId'],
  });
  if (competenciasComScore.length === 0) return null;

  const competencia = await prisma.competencia.findFirst({
    where: { id: { in: competenciasComScore.map((c) => c.competenciaId) } },
    orderBy: { dataRef: 'desc' },
    select: { id: true, ano: true, mes: true },
  });
  return competencia;
}

export async function listOrigensDistintasRiskScoreRegional(
  prisma: PrismaClient,
  filtros: { competenciaId: number; riskConfigId: number },
): Promise<OrigemValor[]> {
  const grupos = await prisma.riskScoreRegional.groupBy({
    by: ['origem'],
    where: { competenciaId: filtros.competenciaId, riskConfigId: filtros.riskConfigId },
  });
  return grupos.map((g) => g.origem);
}

export interface RiskScoreRegionalListItem {
  regiaoSaudeId: number;
  regiaoSaudeNome: string;
  regiaoSaudeCodigo: string;
  competenciaId: number;
  competenciaAno: number;
  competenciaMes: number;
  riskConfigId: number;
  indice: number;
  classificacao: ClassificacaoValor;
  confiabilidade: ConfiabilidadeValor;
  natureza: NaturezaValor;
  origem: OrigemValor;
  calculadoEm: string;
}

function toRiskScoreRegionalListItem(r: {
  regiaoSaude: { id: number; nome: string; codigo: string };
  competencia: { id: number; ano: number; mes: number };
  riskConfigId: number;
  indice: unknown;
  classificacao: ClassificacaoValor;
  confiabilidade: ConfiabilidadeValor;
  natureza: NaturezaValor;
  origem: OrigemValor;
  createdAt: Date;
}): RiskScoreRegionalListItem {
  return {
    regiaoSaudeId: r.regiaoSaude.id,
    regiaoSaudeNome: r.regiaoSaude.nome,
    regiaoSaudeCodigo: r.regiaoSaude.codigo,
    competenciaId: r.competencia.id,
    competenciaAno: r.competencia.ano,
    competenciaMes: r.competencia.mes,
    riskConfigId: r.riskConfigId,
    indice: Number(r.indice),
    classificacao: r.classificacao,
    confiabilidade: r.confiabilidade,
    natureza: r.natureza,
    origem: r.origem,
    calculadoEm: r.createdAt.toISOString(),
  };
}

export async function listRiskScoresRegional(
  prisma: PrismaClient,
  filtros: { competenciaId: number; riskConfigId: number; origem?: OrigemValor },
  paginacao: { skip: number; take: number },
): Promise<{ items: RiskScoreRegionalListItem[]; total: number }> {
  const where = {
    competenciaId: filtros.competenciaId,
    riskConfigId: filtros.riskConfigId,
    ...(filtros.origem === undefined ? {} : { origem: filtros.origem }),
  };

  const [rows, total] = await Promise.all([
    prisma.riskScoreRegional.findMany({
      where,
      include: {
        regiaoSaude: { select: { id: true, nome: true, codigo: true } },
        competencia: { select: { id: true, ano: true, mes: true } },
      },
      orderBy: [{ indice: 'desc' }, { regiaoSaudeId: 'asc' }],
      skip: paginacao.skip,
      take: paginacao.take,
    }),
    prisma.riskScoreRegional.count({ where }),
  ]);

  return { items: rows.map(toRiskScoreRegionalListItem), total };
}

export async function getRiskScoreRegiao(
  prisma: PrismaClient,
  filtros: { regiaoSaudeId: number; competenciaId: number; riskConfigId: number; origem?: OrigemValor },
): Promise<RiskScoreRegionalListItem | null> {
  const r = await prisma.riskScoreRegional.findUnique({
    where: {
      regiaoSaudeId_competenciaId_riskConfigId: {
        regiaoSaudeId: filtros.regiaoSaudeId,
        competenciaId: filtros.competenciaId,
        riskConfigId: filtros.riskConfigId,
      },
    },
    include: {
      regiaoSaude: { select: { id: true, nome: true, codigo: true } },
      competencia: { select: { id: true, ano: true, mes: true } },
    },
  });
  if (!r) return null;
  if (filtros.origem !== undefined && r.origem !== filtros.origem) return null;
  return toRiskScoreRegionalListItem(r);
}

export async function listRiskComponentesRegiao(
  prisma: PrismaClient,
  filtros: { regiaoSaudeId: number; competenciaId: number; riskConfigId: number; origem?: OrigemValor },
): Promise<RiskComponenteItem[]> {
  const rows = await prisma.riskComponenteValorRegional.findMany({
    where: {
      regiaoSaudeId: filtros.regiaoSaudeId,
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
