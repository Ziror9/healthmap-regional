import type {
  ApiErrorDTO,
  CompetenciaDTO,
  FluxoFiltroResolvidoDTO,
  FluxoMunicipioDTO,
  PoloAtendimentoDTO,
  IndicadorDefinicaoDTO,
  MunicipioDetalheDTO,
  MunicipioResumoDTO,
  PaginationMeta,
  RadarMunicipalFiltroResolvidoDTO,
  RadarMunicipalIndicador,
  RadarMunicipalItemDTO,
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

const MUNICIPIOS_PAGE_SIZE_MAXIMO = 200;

/**
 * Todos os municipios do catalogo, paginando por baixo dos panos.
 *
 * A API limita `pageSize` a 200 (teto deliberado contra paginas
 * ilimitadas, ver packages/contracts/src/pagination.ts) - mas o catalogo
 * geografico tem 660 municipios (645 REAL da Fase 5 + 15 DEMO), acima
 * desse teto. Paginas que precisam do catalogo INTEIRO (mapa, agrupamento
 * por regiao, busca/listagem de municipios) nao podem chamar getMunicipios
 * com pageSize:200 e tratar o resultado como se fosse tudo - isso corta os
 * municipios REAL que vem depois na ordenacao alfabetica (`orderBy: nome`)
 * silenciosamente, sem erro. Esta funcao busca todas as paginas e junta.
 */
export async function getTodosMunicipios(
  params: { regiaoSaudeId?: number } = {},
): Promise<MunicipioResumoDTO[]> {
  const primeira = await getMunicipios({ ...params, page: 1, pageSize: MUNICIPIOS_PAGE_SIZE_MAXIMO });
  const { totalPages } = primeira.meta.pagination;
  if (totalPages <= 1) return primeira.data;

  const demaisPaginas = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, indice) =>
      getMunicipios({ ...params, page: indice + 2, pageSize: MUNICIPIOS_PAGE_SIZE_MAXIMO }),
    ),
  );
  return [primeira, ...demaisPaginas].flatMap((resposta) => resposta.data);
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

/**
 * TODAS as linhas de RiskScore da competencia/config resolvidas, paginando por
 * baixo dos panos - mesmo motivo de getTodosMunicipios: `/api/risk` limita
 * pageSize a 200, mas a base REAL tem 645 municipios. Chamar com pageSize:200
 * e tratar como se fosse tudo devolve so os 200 de maior indice (a API ordena
 * por indice desc), o que enviesa qualquer KPI de media/contagem e deixa 445
 * municipios sem cor no mapa.
 */
export async function getTodosRisk(params: RiskFiltros = {}): Promise<RiskListEnvelope> {
  const primeira = await getRisk({ ...params, page: 1, pageSize: MUNICIPIOS_PAGE_SIZE_MAXIMO });
  const { totalPages } = primeira.meta.pagination;
  if (totalPages <= 1) return primeira;

  const demais = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, indice) =>
      getRisk({ ...params, page: indice + 2, pageSize: MUNICIPIOS_PAGE_SIZE_MAXIMO }),
    ),
  );
  return { data: [primeira, ...demais].flatMap((r) => r.data), meta: primeira.meta };
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

/** Radar Municipal (Fase 5.7). Sem paginacao: devolve os 645 municipios REAL de uma vez para o indicador selecionado - nao pagina (nunca 1 requisicao por municipio). */
export interface RadarMunicipalEnvelope {
  data: RadarMunicipalItemDTO[];
  meta: { filtros: RadarMunicipalFiltroResolvidoDTO };
}

/** Fluxo assistencial (Fase 5.8) - residencia -> internacao, grao anual. */
export interface FluxoMunicipioEnvelope {
  data: FluxoMunicipioDTO | null;
  meta: { filtros: FluxoFiltroResolvidoDTO };
}

export interface PolosEnvelope {
  data: PoloAtendimentoDTO[];
  meta: { filtros: FluxoFiltroResolvidoDTO };
}

export async function getFluxoMunicipio(
  municipioId: number,
  params: { ano?: number } = {},
): Promise<FluxoMunicipioEnvelope> {
  return fetchApi(`/api/fluxo/municipios/${municipioId}${toQueryString(params)}`);
}

export async function getPolosAtendimento(params: { ano?: number; limite?: number } = {}): Promise<PolosEnvelope> {
  return fetchApi(`/api/fluxo/polos${toQueryString(params)}`);
}

export async function getIndicadorMunicipios(params: {
  indicador: RadarMunicipalIndicador;
  ano?: number;
  riskConfigId?: number;
  origem?: 'REAL' | 'DEMO';
}): Promise<RadarMunicipalEnvelope> {
  return fetchApi(`/api/indicadores/municipios${toQueryString(params)}`);
}
