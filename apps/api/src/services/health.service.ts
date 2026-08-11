import { checkDatabaseConnection } from '@healthmap/db';
import type { HealthResponse, ReadinessResponse } from '@healthmap/contracts';
import { SERVICE_NAME, SERVICE_VERSION, env } from '../config/env.js';

/** Liveness: o processo esta de pe. Nao consulta dependencias externas. */
export function getLiveness(): HealthResponse {
  return {
    status: 'ok',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

/** Readiness: o processo esta de pe E o PostgreSQL responde. */
export async function getReadiness(): Promise<ReadinessResponse> {
  const database = await checkDatabaseConnection();

  return {
    ...getLiveness(),
    status: database.connected ? 'ok' : 'degraded',
    dependencies: {
      database: database.connected
        ? { status: 'ok', latencyMs: database.latencyMs }
        : { status: 'error', message: database.message },
    },
  };
}
