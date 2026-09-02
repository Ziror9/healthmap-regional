import { z } from 'zod';
import { Origem } from './enums.js';

/**
 * Radar Municipal (Fase 5.7) - visualizacao territorial interativa dos 645
 * municipios de SP, coloridos por um indicador a escolha. NUNCA calcula
 * nada: cada "indicador" selecionavel aqui e uma leitura direta de um dado
 * ja materializado por uma fase anterior (SIH, SIM, packages/risk, IPVS) -
 * ver packages/db/src/repositories/radarQuery.ts para de onde cada um vem.
 *
 * `RISK_SCORE` e `VULNERABILIDADE` reaproveitam RiskScore/IndicadorMunicipal
 * ja existentes; nao criam nenhuma nova RiskConfig nem recalculam nada.
 */
export const radarMunicipalIndicador = [
  'INTERNACOES',
  'TAXA_INTERNACAO_10K_HAB',
  'OBITOS_ONCOLOGICOS',
  'TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB',
  'RISK_SCORE',
  'VULNERABILIDADE',
] as const;
export const radarMunicipalIndicadorSchema = z.enum(radarMunicipalIndicador);
export type RadarMunicipalIndicador = z.infer<typeof radarMunicipalIndicadorSchema>;

const municipioRefSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  codigoIbge7: z.string(),
});

/**
 * Uma linha do mapa/ranking (GET /api/indicadores/municipios). `valor=null`
 * sempre que `disponivel=false` - supressao (n<5) ou ausencia de dado nesse
 * ano nunca viram 0 (CLAUDE.md: "Nenhum numero sai da API sem proveniencia" +
 * regra de supressao). `motivo` so preenchido quando indisponivel, para o
 * tooltip distinguir "suprimido" de "sem dado".
 */
export const radarMunicipalItemSchema = z.object({
  municipio: municipioRefSchema,
  valor: z.number().nullable(),
  disponivel: z.boolean(),
  motivo: z.string().nullable(),
  origem: z.nativeEnum(Origem).nullable(),
});
export type RadarMunicipalItemDTO = z.infer<typeof radarMunicipalItemSchema>;

export const radarMunicipalFiltroQuerySchema = z.object({
  indicador: radarMunicipalIndicadorSchema,
  ano: z.coerce.number().int().positive().optional(),
  riskConfigId: z.coerce.number().int().positive().optional(),
  origem: z.nativeEnum(Origem).optional(),
});
export type RadarMunicipalFiltroQuery = z.infer<typeof radarMunicipalFiltroQuerySchema>;

/** Como o filtro foi resolvido - inclui os anos efetivamente disponiveis para ESTE indicador (nunca inventados no frontend). */
export const radarMunicipalFiltroResolvidoSchema = z.object({
  indicador: radarMunicipalIndicadorSchema,
  ano: z.number().int().nullable(),
  anosDisponiveis: z.array(z.number().int()),
  riskConfigId: z.number().int().nullable(),
  origem: z.nativeEnum(Origem).nullable(),
  unidade: z.string(),
});
export type RadarMunicipalFiltroResolvidoDTO = z.infer<typeof radarMunicipalFiltroResolvidoSchema>;
