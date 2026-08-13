import { z } from 'zod';

/**
 * Forma unica de erro da API (todas as rotas). Centralizado aqui para que
 * apps/web possa tipar o parsing de uma resposta de erro sem redefinir a
 * forma - `apps/api/src/types/http.ts` usa este mesmo contrato em
 * `ApiErrorBody`.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorDTO = z.infer<typeof apiErrorSchema>;
