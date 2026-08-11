import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Log minimo de requisicoes.
 *
 * Nao e a trilha de auditoria do produto. A auditoria de consultas e exportacoes
 * exigida pela governanca (AuditLog) entra na Fase 6 e registra ator, filtros
 * aplicados e recurso acessado.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (env.LOG_LEVEL === 'error' || env.LOG_LEVEL === 'warn') {
    next();
    return;
  }

  const startedAt = Date.now();

  res.on('finish', () => {
    console.info(
      `[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`,
    );
  });

  next();
}
