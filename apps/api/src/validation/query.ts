/** Schemas de query string por endpoint. So parsing/validacao HTTP - nenhuma regra de negocio aqui. */
import { z } from 'zod';
import { paginationQuerySchema, riskFiltroQuerySchema, type PaginationQuery, type RiskFiltroQuery } from '@healthmap/contracts';
import { parseOrThrow } from './parse.js';

export function parsePagination(query: unknown): PaginationQuery {
  return parseOrThrow(paginationQuerySchema, query);
}

export function parseRiskFiltro(query: unknown): RiskFiltroQuery {
  return parseOrThrow(riskFiltroQuerySchema, query);
}

const municipiosFiltroSchema = z.object({
  regiaoSaudeId: z.coerce.number().int().positive().optional(),
});
export type MunicipiosFiltro = z.infer<typeof municipiosFiltroSchema>;
export function parseMunicipiosFiltro(query: unknown): MunicipiosFiltro {
  return parseOrThrow(municipiosFiltroSchema, query);
}

const competenciasFiltroSchema = z.object({
  ano: z.coerce.number().int().positive().optional(),
});
export type CompetenciasFiltro = z.infer<typeof competenciasFiltroSchema>;
export function parseCompetenciasFiltro(query: unknown): CompetenciasFiltro {
  return parseOrThrow(competenciasFiltroSchema, query);
}

const municipioDetalheFiltroSchema = z.object({
  competenciaId: z.coerce.number().int().positive().optional(),
  riskConfigId: z.coerce.number().int().positive().optional(),
  ano: z.coerce.number().int().positive().optional(),
});
export type MunicipioDetalheFiltro = z.infer<typeof municipioDetalheFiltroSchema>;
export function parseMunicipioDetalheFiltro(query: unknown): MunicipioDetalheFiltro {
  return parseOrThrow(municipioDetalheFiltroSchema, query);
}
