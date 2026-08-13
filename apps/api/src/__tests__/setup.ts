/**
 * Infra compartilhada dos testes de integracao da Fase 3.
 *
 * Mesma filosofia dos testes de packages/db (fase1.test.ts/fase2.test.ts):
 * rodam contra o PostgreSQL local ja com migration, seed DEMO e calculo de
 * risco executados (`npm run db:seed && npm run db:calculate-risk` antes de
 * `npm run test --workspace @healthmap/api`). Sobe a app Express real
 * (createApp()) numa porta efemera e fala com ela por HTTP de verdade -
 * nao ha mock de Express nem de Prisma.
 *
 * `prisma` e exportado aqui APENAS para os testes arranjarem fixtures
 * (descobrir um municipioId/competenciaId/riskConfigId real para montar a
 * URL testada) - a API em si (controllers/services) nunca importa Prisma
 * diretamente, ver architecture-boundaries.test.ts.
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

import type { Server } from 'node:http';
import { checkDatabaseConnection, disconnectPrisma, getPrismaClient } from '@healthmap/db';
import { createApp } from '../app.js';

export const prisma = getPrismaClient();

let server: Server | undefined;
export let baseUrl = '';

export async function startTestServer(): Promise<void> {
  const conexao = await checkDatabaseConnection();
  if (!conexao.connected) {
    throw new Error(
      `Banco indisponivel para os testes da Fase 3: ${conexao.message}. ` +
        'Rode "npm run db:up" antes de testar.',
    );
  }

  const totalScores = await prisma.riskScore.count();
  if (totalScores === 0) {
    throw new Error(
      'Nenhum RiskScore encontrado. Rode "npm run db:seed" e "npm run db:calculate-risk" antes de testar a API.',
    );
  }

  const app = createApp();
  server = await new Promise<Server>((resolvePromise) => {
    const s = app.listen(0, () => resolvePromise(s));
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Falha ao obter a porta efemera do servidor de teste.');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

/** Envelope de listagem tipico ({ data: T[], meta: { pagination, ... } }) - so o suficiente para os testes. */
export interface ApiListEnvelope<T> {
  data: T[];
  meta: {
    pagination?: { page: number; pageSize: number; total: number; totalPages: number };
    filtros?: { competenciaId: number; riskConfigId: number | null; origem: string | null };
    [key: string]: unknown;
  };
}

/** Envelope de item unico ({ data: T | null, meta? }). */
export interface ApiItemEnvelope<T> {
  data: T;
  meta?: { filtros?: { competenciaId: number; riskConfigId: number | null; origem: string | null } };
}

export interface ApiErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

/** Cast tipado do corpo JSON de uma resposta de teste - res.json() do fetch global vem como unknown. */
export async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function stopTestServer(): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    if (!server) {
      resolvePromise();
      return;
    }
    server.close((err) => (err ? reject(err) : resolvePromise()));
  });
  await disconnectPrisma();
}
