/**
 * Verificacao manual de conexao com o banco (criterio de teste 4 da Fase 0).
 * Uso, a partir da raiz do repositorio:  npm run db:check
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { checkDatabaseConnection, disconnectPrisma } from '../index.js';

config({ path: resolve(process.cwd(), '../../.env') });
config({ path: resolve(process.cwd(), '.env') });

const result = await checkDatabaseConnection();

if (result.connected) {
  console.info(`[db] conexao OK (${result.latencyMs} ms)`);
  await disconnectPrisma();
  process.exit(0);
}

console.error(`[db] falha na conexao: ${result.message}`);
console.error('[db] verifique se o container subiu (npm run db:up) e se DATABASE_URL esta correta.');
await disconnectPrisma();
process.exit(1);
