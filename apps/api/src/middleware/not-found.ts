import type { Request, Response } from 'express';
import type { ApiErrorBody } from '../types/http.js';

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: {
      code: 'NOT_FOUND',
      message: `Rota nao encontrada: ${req.method} ${req.originalUrl}`,
    },
  };

  res.status(404).json(body);
}
