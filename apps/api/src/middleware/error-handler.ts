import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { HttpError, type ApiErrorBody } from '../types/http.js';

/**
 * Tratador de erros unico da API.
 *
 * Regra de seguranca: detalhes internos (stack, mensagem de driver) nunca vazam
 * para o cliente fora de desenvolvimento.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof HttpError) {
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message, details: error.details },
    };
    res.status(error.status).json(body);
    return;
  }

  console.error('[api] erro nao tratado:', error);

  const body: ApiErrorBody = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor.',
      details:
        env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
    },
  };

  res.status(500).json(body);
}
