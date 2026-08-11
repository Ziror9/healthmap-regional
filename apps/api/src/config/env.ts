import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Carrega as variaveis de ambiente a partir do .env na raiz do monorepo.
 * Um unico .env evita divergencia entre a URL usada pelo Prisma e a usada pela API.
 */
loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL nao definida: copie .env.example para .env'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[api] configuracao de ambiente invalida:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

/** Versao exposta no health check. Mantida junto do package.json do repositorio. */
export const SERVICE_NAME = 'healthmap-api' as const;
export const SERVICE_VERSION = '0.0.0' as const;
