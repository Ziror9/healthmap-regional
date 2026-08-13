/**
 * Servico do Radar de Risco (Fase 3).
 *
 * Responsavel por resolver os filtros (competencia/riskConfig/origem) quando
 * o cliente nao os informa, e por montar a resposta a partir do que
 * packages/db devolve. NUNCA recalcula indice, componente ou classificacao -
 * so le RiskScore/RiskComponenteValor ja materializados pela Fase 2
 * (packages/risk). Nenhuma query Prisma/SQL vive aqui.
 */
import {
  getPrismaClient,
  getMunicipioById,
  getCompetenciaById,
  getCompetenciaMaisRecente,
  getRiskConfigMeta,
  resolveDefaultRiskConfigId,
  listOrigensDistintasRiskScore,
  listRiskScores,
  getRiskScoreMunicipio,
  listRiskComponentes,
  type OrigemValor,
  type RiskScoreListItem,
} from '@healthmap/db';
import {
  buildPaginationMeta,
  type PaginationQuery,
  type RiskFiltroQuery,
  type RiskFiltroResolvidoDTO,
  type RiskScoreItemDTO,
} from '@healthmap/contracts';
import { HttpError } from '../types/http.js';

const prisma = getPrismaClient();

interface FiltrosResolvidos {
  competenciaId: number;
  /** null = nenhuma RiskConfig utilizavel existe ainda (ausencia de dados, nao erro). */
  riskConfigId: number | null;
  /** Origem a aplicar no WHERE - so definida quando o cliente informa explicitamente. */
  origemParaFiltro?: OrigemValor;
  /** Origem efetivamente presente no resultado (explicita ou deduzida) - so para `meta`. */
  origemResolvida: OrigemValor | null;
}

/**
 * Resolve competencia/riskConfig/origem quando omitidos pelo cliente.
 * Comportamento documentado em docs/fase-3-relatorio.md #5 (proveniencia):
 *
 * - competenciaId ausente -> competencia mais recente por dataRef;
 * - riskConfigId ausente -> RiskConfig oficial (se existir) ou, na
 *   ausencia (nenhuma config e oficial nesta fase), a config utilizavel
 *   mais recente (maior id com componentes ativos);
 * - origem ausente -> nao filtra por origem, mas verifica quantas origens
 *   distintas existem no resultado. Mais de uma -> 409, pede para o
 *   cliente desambiguar (nunca mistura REAL/DEMO silenciosamente numa
 *   mesma lista). Nenhum valor e hardcoded: a origem exibida em `meta`
 *   sempre vem do dado, nunca de uma constante no codigo.
 */
async function resolverFiltros(query: RiskFiltroQuery): Promise<FiltrosResolvidos> {
  let competenciaId: number;
  if (query.competenciaId !== undefined) {
    const competencia = await getCompetenciaById(prisma, query.competenciaId);
    if (!competencia) {
      throw new HttpError(404, 'COMPETENCIA_NAO_ENCONTRADA', `Competencia ${query.competenciaId} nao existe.`);
    }
    competenciaId = competencia.id;
  } else {
    const maisRecente = await getCompetenciaMaisRecente(prisma);
    if (!maisRecente) {
      throw new HttpError(404, 'COMPETENCIA_NAO_ENCONTRADA', 'Nenhuma competencia cadastrada no banco.');
    }
    competenciaId = maisRecente.id;
  }

  let riskConfigId: number | null;
  if (query.riskConfigId !== undefined) {
    const config = await getRiskConfigMeta(prisma, query.riskConfigId);
    if (!config) {
      throw new HttpError(404, 'RISK_CONFIG_NAO_ENCONTRADA', `RiskConfig ${query.riskConfigId} nao existe.`);
    }
    riskConfigId = config.id;
  } else {
    riskConfigId = await resolveDefaultRiskConfigId(prisma);
  }

  let origemResolvida: OrigemValor | null = query.origem ?? null;
  if (query.origem === undefined && riskConfigId !== null) {
    const origens = await listOrigensDistintasRiskScore(prisma, { competenciaId, riskConfigId });
    if (origens.length > 1) {
      throw new HttpError(
        409,
        'ORIGEM_AMBIGUA',
        'Mais de uma origem (REAL e DEMO) esta presente para esta competencia/riskConfig. ' +
          'Informe o parametro "origem" (REAL ou DEMO) para desambiguar.',
        { origensPresentes: origens },
      );
    }
    origemResolvida = origens[0] ?? null;
  }

  return { competenciaId, riskConfigId, origemParaFiltro: query.origem, origemResolvida };
}

function toFiltroDTO(filtros: FiltrosResolvidos): RiskFiltroResolvidoDTO {
  return { competenciaId: filtros.competenciaId, riskConfigId: filtros.riskConfigId, origem: filtros.origemResolvida };
}

function toItemDTO(item: RiskScoreListItem): RiskScoreItemDTO {
  return {
    municipio: { id: item.municipioId, nome: item.municipioNome, codigoIbge7: item.municipioCodigoIbge7 },
    competencia: { id: item.competenciaId, ano: item.competenciaAno, mes: item.competenciaMes },
    riskConfigId: item.riskConfigId,
    indice: item.indice,
    classificacao: item.classificacao,
    confiabilidade: item.confiabilidade,
    natureza: item.natureza,
    origem: item.origem,
  };
}

/** GET /api/risk - ranking de municipios para a competencia/riskConfig resolvidos. */
export async function listarRisk(query: RiskFiltroQuery, paginacao: PaginationQuery) {
  const filtros = await resolverFiltros(query);

  if (filtros.riskConfigId === null) {
    return {
      data: [] as RiskScoreItemDTO[],
      meta: { filtros: toFiltroDTO(filtros), pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, 0) },
    };
  }

  const skip = (paginacao.page - 1) * paginacao.pageSize;
  const { items, total } = await listRiskScores(
    prisma,
    { competenciaId: filtros.competenciaId, riskConfigId: filtros.riskConfigId, origem: filtros.origemParaFiltro },
    { skip, take: paginacao.pageSize },
  );

  return {
    data: items.map(toItemDTO),
    meta: { filtros: toFiltroDTO(filtros), pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, total) },
  };
}

/** GET /api/risk/:municipioId - RiskScore de um municipio na competencia/riskConfig resolvidos (ou null - ausencia de dados). */
export async function detalharRiskMunicipio(municipioId: number, query: RiskFiltroQuery) {
  const municipio = await getMunicipioById(prisma, municipioId);
  if (!municipio) {
    throw new HttpError(404, 'MUNICIPIO_NAO_ENCONTRADO', `Municipio ${municipioId} nao existe.`);
  }

  const filtros = await resolverFiltros(query);
  if (filtros.riskConfigId === null) {
    return { data: null, meta: { filtros: toFiltroDTO(filtros) } };
  }

  const score = await getRiskScoreMunicipio(prisma, {
    municipioId,
    competenciaId: filtros.competenciaId,
    riskConfigId: filtros.riskConfigId,
    origem: filtros.origemParaFiltro,
  });

  return { data: score ? toItemDTO(score) : null, meta: { filtros: toFiltroDTO(filtros) } };
}

/** GET /api/risk/:municipioId/components - componentes materializados de um municipio. */
export async function listarComponentesRiskMunicipio(municipioId: number, query: RiskFiltroQuery) {
  const municipio = await getMunicipioById(prisma, municipioId);
  if (!municipio) {
    throw new HttpError(404, 'MUNICIPIO_NAO_ENCONTRADO', `Municipio ${municipioId} nao existe.`);
  }

  const filtros = await resolverFiltros(query);
  if (filtros.riskConfigId === null) {
    return { data: [], meta: { filtros: toFiltroDTO(filtros) } };
  }

  const componentes = await listRiskComponentes(prisma, {
    municipioId,
    competenciaId: filtros.competenciaId,
    riskConfigId: filtros.riskConfigId,
    origem: filtros.origemParaFiltro,
  });

  return { data: componentes, meta: { filtros: toFiltroDTO(filtros) } };
}
