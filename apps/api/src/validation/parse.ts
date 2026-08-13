import { z } from 'zod';
import { HttpError } from '../types/http.js';

/**
 * Valida `input` contra `schema` e devolve o valor tipado, ou lanca
 * HttpError 400 com os issues do Zod em `details` - nunca a excecao crua do
 * Zod, nunca stack trace (error-handler so expoe `details` como esta aqui,
 * dado ja seguro para o cliente).
 */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Parametros invalidos.', result.error.flatten());
  }
  return result.data as z.infer<T>;
}

const idParamSchema = z.coerce.number().int().positive();

/** Valida um parametro de rota (:id) como inteiro positivo. Express tipa req.params como string | string[]. */
export function parseIdParam(value: string | string[] | undefined, nomeParam: string): number {
  const result = typeof value === 'string' ? idParamSchema.safeParse(value) : { success: false as const };
  if (!result.success) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Parametro de rota invalido: "${nomeParam}" deve ser um numero inteiro positivo.`,
    );
  }
  return result.data;
}
