import { z } from 'zod';

/**
 * Paginacao minima e uniforme para todo endpoint de listagem da Fase 3.
 * `page` comeca em 1. `pageSize` tem teto (200) para impedir que um cliente
 * baixe a tabela inteira de uma vez - o volume DEMO atual e pequeno, mas o
 * contrato precisa se sustentar quando a carga REAL (Fase 5) crescer.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
}
