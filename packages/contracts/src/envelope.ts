import { z } from 'zod';
import { EixoTerritorial, Natureza, Origem } from './enums.js';

/**
 * Envelope de proveniencia.
 *
 * Todo payload analitico da API deve ser embrulhado neste envelope. O objetivo
 * e tornar impossivel, por construcao, entregar um numero sem dizer de onde ele
 * veio e como foi produzido.
 *
 * Na Fase 0 o envelope existe apenas como contrato: nenhum endpoint analitico
 * foi implementado ainda. Os campos analiticos (competencia, fontes, versao do
 * Radar) entram na Fase 3, quando os endpoints existirem.
 */
export const provenanceSchema = z.object({
  origem: z.nativeEnum(Origem),
  natureza: z.nativeEnum(Natureza),
  eixoTerritorial: z.nativeEnum(EixoTerritorial).optional(),
  geradoEm: z.string().datetime(),
});

export type Provenance = z.infer<typeof provenanceSchema>;

export function envelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    meta: provenanceSchema,
  });
}

export type Envelope<T> = {
  data: T;
  meta: Provenance;
};
