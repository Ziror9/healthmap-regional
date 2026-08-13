import { z } from 'zod';

/** Dimensao Competencia (schema `silver`). `dataRef` sai como data ISO (YYYY-MM-DD). */
export const competenciaSchema = z.object({
  id: z.number().int(),
  ano: z.number().int(),
  mes: z.number().int(),
  dataRef: z.string(),
  diasNoMes: z.number().int(),
});
export type CompetenciaDTO = z.infer<typeof competenciaSchema>;
