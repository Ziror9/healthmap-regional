/**
 * Repositorio de leitura do catalogo geografico e de indicadores (Fase 3).
 *
 * So leitura das dimensoes `silver` (Municipio, RegiaoSaude, Competencia) e
 * do catalogo `meta` (IndicadorDefinicao) e dos valores ja materializados
 * (IndicadorMunicipal). Nenhuma agregacao de fato bruto acontece aqui -
 * essas tabelas nao carregam supressao (sao referencia, nao contagem).
 */
import type { PrismaClient } from '@prisma/client';

export interface Paginacao {
  skip: number;
  take: number;
}

export interface RegiaoSaudeRow {
  id: number;
  codigo: string;
  nome: string;
  uf: string;
}

export interface MunicipioRow {
  id: number;
  codigoIbge7: string;
  nome: string;
  uf: string;
  latitude: number | null;
  longitude: number | null;
  regiaoSaude: RegiaoSaudeRow;
}

export async function listMunicipios(
  prisma: PrismaClient,
  filtros: { regiaoSaudeId?: number },
  paginacao: Paginacao,
): Promise<{ items: MunicipioRow[]; total: number }> {
  const where = filtros.regiaoSaudeId === undefined ? {} : { regiaoSaudeId: filtros.regiaoSaudeId };

  const [rows, total] = await Promise.all([
    prisma.municipio.findMany({
      where,
      include: { regiaoSaude: { select: { id: true, codigo: true, nome: true, uf: true } } },
      orderBy: { nome: 'asc' },
      skip: paginacao.skip,
      take: paginacao.take,
    }),
    prisma.municipio.count({ where }),
  ]);

  return {
    items: rows.map((m) => ({
      id: m.id,
      codigoIbge7: m.codigoIbge7,
      nome: m.nome,
      uf: m.uf,
      latitude: m.latitude === null ? null : Number(m.latitude),
      longitude: m.longitude === null ? null : Number(m.longitude),
      regiaoSaude: m.regiaoSaude,
    })),
    total,
  };
}

/** Fase 5.5 - valida a existencia de uma RegiaoSaude antes de resolver o Radar regional. */
export async function getRegiaoSaudeById(prisma: PrismaClient, regiaoSaudeId: number): Promise<RegiaoSaudeRow | null> {
  return prisma.regiaoSaude.findUnique({
    where: { id: regiaoSaudeId },
    select: { id: true, codigo: true, nome: true, uf: true },
  });
}

export async function getMunicipioById(prisma: PrismaClient, municipioId: number): Promise<MunicipioRow | null> {
  const m = await prisma.municipio.findUnique({
    where: { id: municipioId },
    include: { regiaoSaude: { select: { id: true, codigo: true, nome: true, uf: true } } },
  });
  if (!m) return null;
  return {
    id: m.id,
    codigoIbge7: m.codigoIbge7,
    nome: m.nome,
    uf: m.uf,
    latitude: m.latitude === null ? null : Number(m.latitude),
    longitude: m.longitude === null ? null : Number(m.longitude),
    regiaoSaude: m.regiaoSaude,
  };
}

export async function listRegioesSaude(
  prisma: PrismaClient,
  paginacao: Paginacao,
): Promise<{ items: RegiaoSaudeRow[]; total: number }> {
  const [items, total] = await Promise.all([
    prisma.regiaoSaude.findMany({
      select: { id: true, codigo: true, nome: true, uf: true },
      orderBy: { nome: 'asc' },
      skip: paginacao.skip,
      take: paginacao.take,
    }),
    prisma.regiaoSaude.count(),
  ]);
  return { items, total };
}

export interface CompetenciaRow {
  id: number;
  ano: number;
  mes: number;
  /** YYYY-MM-DD. */
  dataRef: string;
  diasNoMes: number;
}

function formatarDataRef(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export async function listCompetencias(
  prisma: PrismaClient,
  filtros: { ano?: number },
  paginacao: Paginacao,
): Promise<{ items: CompetenciaRow[]; total: number }> {
  const where = filtros.ano === undefined ? {} : { ano: filtros.ano };

  const [rows, total] = await Promise.all([
    prisma.competencia.findMany({
      where,
      orderBy: { dataRef: 'asc' },
      skip: paginacao.skip,
      take: paginacao.take,
    }),
    prisma.competencia.count({ where }),
  ]);

  return {
    items: rows.map((c) => ({
      id: c.id,
      ano: c.ano,
      mes: c.mes,
      dataRef: formatarDataRef(c.dataRef),
      diasNoMes: c.diasNoMes,
    })),
    total,
  };
}

export async function getCompetenciaById(prisma: PrismaClient, competenciaId: number): Promise<CompetenciaRow | null> {
  const c = await prisma.competencia.findUnique({ where: { id: competenciaId } });
  if (!c) return null;
  return { id: c.id, ano: c.ano, mes: c.mes, dataRef: formatarDataRef(c.dataRef), diasNoMes: c.diasNoMes };
}

/** Competencia mais recente por dataRef - usada como default quando a API nao recebe competenciaId. */
export async function getCompetenciaMaisRecente(prisma: PrismaClient): Promise<CompetenciaRow | null> {
  const c = await prisma.competencia.findFirst({ orderBy: { dataRef: 'desc' } });
  if (!c) return null;
  return { id: c.id, ano: c.ano, mes: c.mes, dataRef: formatarDataRef(c.dataRef), diasNoMes: c.diasNoMes };
}

export interface IndicadorDefinicaoRow {
  chave: string;
  nome: string;
  fonte: string;
  unidade: string;
  periodicidade: string;
  direcao: 'MAIOR_PIOR' | 'MENOR_PIOR';
  eixoTerritorial: 'RESIDENCIA' | 'INTERNACAO';
  naturezaPadrao: 'OBSERVADO' | 'ESTIMATIVA' | 'PROJECAO';
  notaMetodologica: string | null;
  ativo: boolean;
  /** Calculado: existe pelo menos 1 IndicadorMunicipal para esta definicao. */
  disponivel: boolean;
}

export async function listIndicadorDefinicoes(
  prisma: PrismaClient,
  paginacao: Paginacao,
): Promise<{ items: IndicadorDefinicaoRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.indicadorDefinicao.findMany({
      include: { _count: { select: { indicadoresMunicipais: true } } },
      orderBy: { chave: 'asc' },
      skip: paginacao.skip,
      take: paginacao.take,
    }),
    prisma.indicadorDefinicao.count(),
  ]);

  return {
    items: rows.map((d) => ({
      chave: d.chave,
      nome: d.nome,
      fonte: d.fonte,
      unidade: d.unidade,
      periodicidade: d.periodicidade,
      direcao: d.direcao,
      eixoTerritorial: d.eixoTerritorial,
      naturezaPadrao: d.naturezaPadrao,
      notaMetodologica: d.notaMetodologica,
      ativo: d.ativo,
      disponivel: d._count.indicadoresMunicipais > 0,
    })),
    total,
  };
}

export interface IndicadorMunicipalRow {
  indicadorDefinicaoId: string;
  ano: number;
  valor: number;
  denominador: number | null;
  origem: 'REAL' | 'DEMO';
}

/** Todas as linhas de IndicadorMunicipal de um municipio - usado no detalhe (GET /api/municipios/:id). */
export async function listIndicadoresDoMunicipio(
  prisma: PrismaClient,
  municipioId: number,
): Promise<IndicadorMunicipalRow[]> {
  const rows = await prisma.indicadorMunicipal.findMany({
    where: { municipioId },
    orderBy: [{ ano: 'desc' }, { indicadorDefinicaoId: 'asc' }],
  });
  return rows.map((r) => ({
    indicadorDefinicaoId: r.indicadorDefinicaoId,
    ano: r.ano,
    valor: Number(r.valor),
    denominador: r.denominador === null ? null : Number(r.denominador),
    origem: r.origem,
  }));
}
