/**
 * @healthmap/db
 *
 * Fronteira unica de acesso a dados do HealthMap Regional.
 *
 * REGRA ARQUITETURAL (ADR-001): nenhum SQL e nenhuma chamada Prisma devem
 * existir fora deste package. apps/api consome repositorios daqui. Essa
 * disciplina e o que torna viavel a migracao futura para Oracle (OCI) sem
 * reescrever a aplicacao.
 *
 * Fase 0: apenas o cliente e a verificacao de conexao.
 * Fase 1: schema de dominio.
 * Fase 2: repositorio de leitura/escrita para o motor de risco.
 */
export { getPrismaClient, disconnectPrisma } from './client.js';
export { checkDatabaseConnection } from './connection.js';
export type { DatabaseConnectionResult } from './connection.js';
export * from './repositories/risk.js';
