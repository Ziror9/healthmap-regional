import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma como singleton, instanciado de forma preguicosa.
 *
 * Duas razoes para a inicializacao tardia:
 *
 * 1. Hot reload: em desenvolvimento os modulos sao recriados com frequencia.
 *    Sem o cache em globalThis, cada reload abriria um novo pool de conexoes ate
 *    esgotar o PostgreSQL.
 * 2. Ordem de setup: se `prisma generate` ainda nao rodou, instanciar o cliente
 *    no topo do modulo derrubaria a API inteira no import. Com a instanciacao
 *    tardia, o erro fica contido na verificacao de saude, que responde 503 com
 *    mensagem util em vez de o processo morrer.
 */
const globalForPrisma = globalThis as unknown as {
  healthmapPrisma?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.healthmapPrisma) {
    globalForPrisma.healthmapPrisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  return globalForPrisma.healthmapPrisma;
}

export async function disconnectPrisma(): Promise<void> {
  await globalForPrisma.healthmapPrisma?.$disconnect();
}
