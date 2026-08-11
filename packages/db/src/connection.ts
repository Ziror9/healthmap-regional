import { getPrismaClient } from './client.js';

export interface DatabaseConnectionResult {
  connected: boolean;
  latencyMs: number;
  message?: string;
}

/**
 * Verifica se o PostgreSQL responde.
 *
 * Usa SQL cru (SELECT 1) de proposito: na Fase 0 o schema ainda nao possui
 * entidades, entao nao ha modelo Prisma para consultar.
 */
export async function checkDatabaseConnection(): Promise<DatabaseConnectionResult> {
  const startedAt = performance.now();

  try {
    await getPrismaClient().$queryRaw`SELECT 1`;
    return {
      connected: true,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Math.round(performance.now() - startedAt),
      message: error instanceof Error ? error.message : 'Erro desconhecido de conexao',
    };
  }
}
