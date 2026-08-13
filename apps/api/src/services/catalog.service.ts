/**
 * Servico de catalogo (municipios, regioes, competencias, indicadores).
 * So le via packages/db e monta a resposta - nenhuma query aqui.
 */
import {
  getPrismaClient,
  listMunicipios as dbListMunicipios,
  getMunicipioById as dbGetMunicipioById,
  listRegioesSaude as dbListRegioesSaude,
  listCompetencias as dbListCompetencias,
  listIndicadorDefinicoes as dbListIndicadorDefinicoes,
  listIndicadoresDoMunicipio,
  listRiskScoresDoMunicipio,
} from '@healthmap/db';
import { buildPaginationMeta, type PaginationQuery } from '@healthmap/contracts';
import { HttpError } from '../types/http.js';
import type { CompetenciasFiltro, MunicipioDetalheFiltro, MunicipiosFiltro } from '../validation/query.js';

const prisma = getPrismaClient();

function toSkipTake(paginacao: PaginationQuery): { skip: number; take: number } {
  return { skip: (paginacao.page - 1) * paginacao.pageSize, take: paginacao.pageSize };
}

export async function listarMunicipios(paginacao: PaginationQuery, filtros: MunicipiosFiltro) {
  const { items, total } = await dbListMunicipios(prisma, filtros, toSkipTake(paginacao));
  return { data: items, meta: { pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, total) } };
}

export async function detalharMunicipio(municipioId: number, filtros: MunicipioDetalheFiltro) {
  const municipio = await dbGetMunicipioById(prisma, municipioId);
  if (!municipio) {
    throw new HttpError(404, 'MUNICIPIO_NAO_ENCONTRADO', `Municipio ${municipioId} nao existe.`);
  }

  const [riscos, indicadoresTodos] = await Promise.all([
    listRiskScoresDoMunicipio(prisma, {
      municipioId,
      competenciaId: filtros.competenciaId,
      riskConfigId: filtros.riskConfigId,
    }),
    listIndicadoresDoMunicipio(prisma, municipioId),
  ]);

  const indicadores =
    filtros.ano === undefined ? indicadoresTodos : indicadoresTodos.filter((i) => i.ano === filtros.ano);

  return {
    ...municipio,
    riscos: riscos.map((r) => ({
      competencia: { id: r.competenciaId, ano: r.competenciaAno, mes: r.competenciaMes },
      riskConfigId: r.riskConfigId,
      indice: r.indice,
      classificacao: r.classificacao,
      confiabilidade: r.confiabilidade,
      natureza: r.natureza,
      origem: r.origem,
    })),
    indicadores,
  };
}

export async function listarRegioes(paginacao: PaginationQuery) {
  const { items, total } = await dbListRegioesSaude(prisma, toSkipTake(paginacao));
  return { data: items, meta: { pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, total) } };
}

export async function listarCompetencias(paginacao: PaginationQuery, filtros: CompetenciasFiltro) {
  const { items, total } = await dbListCompetencias(prisma, filtros, toSkipTake(paginacao));
  return { data: items, meta: { pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, total) } };
}

export async function listarIndicadores(paginacao: PaginationQuery) {
  const { items, total } = await dbListIndicadorDefinicoes(prisma, toSkipTake(paginacao));
  return { data: items, meta: { pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, total) } };
}
