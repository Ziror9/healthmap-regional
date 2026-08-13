import type {
  ApiErrorDTO,
  CompetenciaDTO,
  IndicadorDefinicaoDTO,
  MunicipioDetalheDTO,
  MunicipioResumoDTO,
  PaginationMeta,
  RegiaoSaudeDTO,
  RiskComponenteItemDTO,
  RiskFiltroResolvidoDTO,
  RiskScoreItemDTO,
} from '@healthmap/contracts';

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

function toQueryString(params: object): string {
  const usp = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== '') usp.set(chave, String(valor));
  }
  const query = usp.toString();
  return query ? `?${query}` : '';
}

export interface ListEnvelope<T> {
  data: T[];
  meta: { pagination: PaginationMeta } & Record<string, unknown>;
}

export interface RiskListEnvelope {
  data: RiskScoreItemDTO[];
  meta: { filtros: RiskFiltroResolvidoDTO; pagination: PaginationMeta };
}

export interface RiskItemEnvelope {
  data: RiskScoreItemDTO | null;
  meta: { filtros: RiskFiltroResolvidoDTO };
}

export interface RiskComponentesEnvelope {
  data: RiskComponenteItemDTO[];
  meta: { filtros: RiskFiltroResolvidoDTO };
}

export interface MunicipioDetalheEnvelope {
  data: MunicipioDetalheDTO;
}

/** Filtros de leitura do Radar - espelha packages/contracts/src/risk.ts (riskFiltroQuerySchema). */
export interface RiskFiltros {
  competenciaId?: number;
  riskConfigId?: number;
  origem?: 'REAL' | 'DEMO';
}

export async function getMunicipios(
  params: { page?: number; pageSize?: number; regiaoSaudeId?: number } = {},
): Promise<ListEnvelope<MunicipioResumoDTO>> {
  return fetchApi(`/api/municipios${toQueryString(params)}`);
}

export async function getMunicipio(
  municipioId: number,
  params: { competenciaId?: number; riskConfigId?: number; ano?: number } = {},
): Promise<MunicipioDetalheEnvelope> {
  return fetchApi(`/api/municipios/${municipioId}${toQueryString(params)}`);
}

export async function getRegioes(params: { page?: number; pageSize?: number } = {}): Promise<ListEnvelope<RegiaoSaudeDTO>> {
  return fetchApi(`/api/regioes${toQueryString(params)}`);
}

export async function getCompetencias(
  params: { page?: number; pageSize?: number; ano?: number } = {},
): Promise<ListEnvelope<CompetenciaDTO>> {
  return fetchApi(`/api/competencias${toQueryString(params)}`);
}

export async function getIndicadores(
  params: { page?: number; pageSize?: number } = {},
): Promise<ListEnvelope<IndicadorDefinicaoDTO>> {
  return fetchApi(`/api/indicadores${toQueryString(params)}`);
}

export async function getRisk(params: RiskFiltros & { page?: number; pageSize?: number } = {}): Promise<RiskListEnvelope> {
  return fetchApi(`/api/risk${toQueryString(params)}`);
}

export async function getRiskMunicipio(municipioId: number, params: RiskFiltros = {}): Promise<RiskItemEnvelope> {
  return fetchApi(`/api/risk/${municipioId}${toQueryString(params)}`);
}

export async function getRiskComponentes(
  municipioId: number,
  params: RiskFiltros = {},
): Promise<RiskComponentesEnvelope> {
  return fetchApi(`/api/risk/${municipioId}/components${toQueryString(params)}`);
}
