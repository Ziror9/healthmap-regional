import { z } from 'zod';

/**
 * Dimensoes geograficas (schema `silver`). Sem Origem/Natureza: sao
 * referencia territorial, nao um numero medido - o eixo de proveniencia se
 * aplica aos fatos (`gold`), nao a geografia em si.
 */
export const regiaoSaudeSchema = z.object({
  id: z.number().int(),
  codigo: z.string(),
  nome: z.string(),
  uf: z.string(),
});
export type RegiaoSaudeDTO = z.infer<typeof regiaoSaudeSchema>;

export const municipioResumoSchema = z.object({
  id: z.number().int(),
  codigoIbge7: z.string(),
  nome: z.string(),
  uf: z.string(),
  regiaoSaude: regiaoSaudeSchema,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
export type MunicipioResumoDTO = z.infer<typeof municipioResumoSchema>;
