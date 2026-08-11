import { z } from 'zod';

/** Estados possiveis de uma verificacao de saude do servico. */
export const healthStatusSchema = z.enum(['ok', 'degraded', 'error']);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

/** GET /health - liveness. Nao consulta dependencias externas. */
export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  service: z.literal('healthmap-api'),
  version: z.string(),
  environment: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** GET /health/ready - readiness. Verifica a conexao com o PostgreSQL. */
export const readinessResponseSchema = healthResponseSchema.extend({
  dependencies: z.object({
    database: z.object({
      status: healthStatusSchema,
      latencyMs: z.number().nonnegative().optional(),
      message: z.string().optional(),
    }),
  }),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
