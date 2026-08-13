import { z } from 'zod';
import { ClassificacaoRisco, ComponenteRisco, Confiabilidade, Natureza, Origem } from './enums.js';

/**
 * DTOs do Radar de Risco expostos pela API (Fase 3). Espelham RiskScore e
 * RiskComponenteValor ja materializados pelo motor da Fase 2
 * (packages/risk) - a API nunca recalcula nada, so le e formata.
 */

const municipioRefSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  codigoIbge7: z.string(),
});

const competenciaRefSchema = z.object({
  id: z.number().int(),
  ano: z.number().int(),
  mes: z.number().int(),
});

/** Uma linha do ranking do Radar (GET /api/risk) ou do detalhe de um municipio. */
export const riskScoreItemSchema = z.object({
  municipio: municipioRefSchema,
  competencia: competenciaRefSchema,
  riskConfigId: z.number().int(),
  indice: z.number().min(0).max(1),
  classificacao: z.nativeEnum(ClassificacaoRisco),
  confiabilidade: z.nativeEnum(Confiabilidade),
  natureza: z.nativeEnum(Natureza),
  origem: z.nativeEnum(Origem),
  /** RiskScore.createdAt - quando esta linha foi calculada (Fase 4: indicador de frescor). */
  calculadoEm: z.string().datetime(),
});
export type RiskScoreItemDTO = z.infer<typeof riskScoreItemSchema>;

/**
 * Componente materializado (GET /api/risk/:municipioId/components).
 * `valorBruto`/`valorNormalizado` nulos quando `disponivel = false` - nunca
 * 0. Nao ha campo de "motivo": RiskComponenteValor nao persiste o motivo de
 * indisponibilidade (so o motor em memoria o conhece, ver
 * packages/risk/src/types.ts), entao a API nao pode expor o que o banco nao
 * guarda.
 */
export const riskComponenteItemSchema = z.object({
  componente: z.nativeEnum(ComponenteRisco),
  valorBruto: z.number().nullable(),
  valorNormalizado: z.number().nullable(),
  natureza: z.nativeEnum(Natureza),
  confiabilidade: z.nativeEnum(Confiabilidade),
  disponivel: z.boolean(),
  origem: z.nativeEnum(Origem),
});
export type RiskComponenteItemDTO = z.infer<typeof riskComponenteItemSchema>;

/** Filtros aceitos por GET /api/risk, /api/risk/:municipioId e /components. */
export const riskFiltroQuerySchema = z.object({
  competenciaId: z.coerce.number().int().positive().optional(),
  riskConfigId: z.coerce.number().int().positive().optional(),
  origem: z.nativeEnum(Origem).optional(),
});
export type RiskFiltroQuery = z.infer<typeof riskFiltroQuerySchema>;

/** Descreve como os filtros de /api/risk foram resolvidos quando omitidos. */
export const riskFiltroResolvidoSchema = z.object({
  competenciaId: z.number().int(),
  riskConfigId: z.number().int().nullable(),
  origem: z.nativeEnum(Origem).nullable(),
});
export type RiskFiltroResolvidoDTO = z.infer<typeof riskFiltroResolvidoSchema>;
