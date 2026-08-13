import type { ApiErrorDTO } from '@healthmap/contracts';

/**
 * Cliente HTTP minimo para apps/api. So fala com a API por fetch - nunca
 * importa @healthmap/db nem @prisma/client (fronteira arquitetural: o
 * frontend nao acessa o banco diretamente, ver
 * apps/api/src/__tests__/architecture-boundaries.test.ts).
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });

  if (!res.ok) {
    const body: ApiErrorDTO | null = await res.json().catch(() => null);
    throw new ApiRequestError(
      body?.error.message ?? `Erro ${res.status} ao consultar ${path}`,
      res.status,
      body?.error.code,
    );
  }

  return res.json() as Promise<T>;
}
