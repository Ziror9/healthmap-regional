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
  getRegiaoSaudeById,
  getCompetenciaById,
  getCompetenciaMaisRecente,
  getCompetenciaMaisRecenteComRiskScore,
  getCompetenciaMaisRecenteComRiskScoreRegional,
  getRiskConfigMeta,
  resolveDefaultRiskConfigId,
  listOrigensDistintasRiskScore,
  listOrigensDistintasRiskScoreRegional,
  listRiskScores,
  listRiskScoresRegional,
  getRiskScoreMunicipio,
  getRiskScoreRegiao,
  listRiskComponentes,
  listRiskComponentesRegiao,
  type OrigemValor,
  type RiskScoreListItem,
  type RiskScoreRegionalListItem,
} from '@healthmap/db';
import {
  buildPaginationMeta,
  type PaginationQuery,
  type RiskFiltroQuery,
  type RiskFiltroResolvidoDTO,
  type RiskScoreItemDTO,
  type RiskScoreRegionalItemDTO,
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
 * - riskConfigId ausente -> RiskConfig oficial (se existir) ou, na
 *   ausencia (nenhuma config e oficial nesta fase), a config utilizavel
 *   mais recente (maior id com componentes ativos). Resolvido ANTES da
 *   competencia porque o default de competencia depende dele.
 * - competenciaId ausente -> competencia mais recente por dataRef QUE TEM
 *   RiskScore calculado para o riskConfig resolvido (nunca a mais recente
 *   por data pura e simples: uma competencia pode existir so por causa de
 *   uma ingestao geografica/de capacidade - ex. snapshot do CNES carimbado
 *   no mes corrente da ingestao - sem nenhum RiskScore, o que faria o
 *   Radar abrir vazio por padrao mesmo com dado calculado em competencias
 *   anteriores). Se nenhuma competencia tiver RiskScore para o riskConfig
 *   resolvido (ou riskConfigId for null), cai no fallback antigo
 *   (mais recente por data) - o EmptyState explica a ausencia de dado.
 * - origem ausente -> nao filtra por origem, mas verifica quantas origens
 *   distintas existem no resultado. Mais de uma -> 409, pede para o
 *   cliente desambiguar (nunca mistura REAL/DEMO silenciosamente numa
 *   mesma lista). Nenhum valor e hardcoded: a origem exibida em `meta`
 *   sempre vem do dado, nunca de uma constante no codigo.
 */
/**
 * `grao` escolhe qual RiskScore consultar para resolver a competencia
 * default e a ambiguidade de origem - municipal (Fase 3) ou regional (Fase
 * 5.5). RiskConfig e o mesmo objeto para os dois graos (pesos + fonte de
 * indicador nao variam por grao), so a resolucao de competencia/origem usa
 * a tabela de RiskScore certa.
 */
async function resolverFiltros(query: RiskFiltroQuery, grao: 'municipal' | 'regional' = 'municipal'): Promise<FiltrosResolvidos> {
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

  let competenciaId: number;
  if (query.competenciaId !== undefined) {
    const competencia = await getCompetenciaById(prisma, query.competenciaId);
    if (!competencia) {
      throw new HttpError(404, 'COMPETENCIA_NAO_ENCONTRADA', `Competencia ${query.competenciaId} nao existe.`);
    }
    competenciaId = competencia.id;
  } else {
    const maisRecenteComDado =
      riskConfigId === null
        ? null
        : grao === 'regional'
          ? await getCompetenciaMaisRecenteComRiskScoreRegional(prisma, riskConfigId)
          : await getCompetenciaMaisRecenteComRiskScore(prisma, riskConfigId);
    const maisRecente = maisRecenteComDado ?? (await getCompetenciaMaisRecente(prisma));
    if (!maisRecente) {
      throw new HttpError(404, 'COMPETENCIA_NAO_ENCONTRADA', 'Nenhuma competencia cadastrada no banco.');
    }
    competenciaId = maisRecente.id;
  }

  let origemResolvida: OrigemValor | null = query.origem ?? null;
  if (query.origem === undefined && riskConfigId !== null) {
    const origens =
      grao === 'regional'
        ? await listOrigensDistintasRiskScoreRegional(prisma, { competenciaId, riskConfigId })
        : await listOrigensDistintasRiskScore(prisma, { competenciaId, riskConfigId });
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
    calculadoEm: item.calculadoEm,
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

// -----------------------------------------------------------------------------
// Grao REGIONAL (Fase 5.5) - mesmas 3 operacoes acima (ranking, detalhe,
// componentes), trocando municipio por RegiaoSaude. Mesma regra: nunca
// recalcula nada, so le RiskScoreRegional/RiskComponenteValorRegional ja
// materializados por calculate-risk-regional.ts.
// -----------------------------------------------------------------------------

function toItemDTORegional(item: RiskScoreRegionalListItem): RiskScoreRegionalItemDTO {
  return {
    regiaoSaude: { id: item.regiaoSaudeId, nome: item.regiaoSaudeNome, codigo: item.regiaoSaudeCodigo },
    competencia: { id: item.competenciaId, ano: item.competenciaAno, mes: item.competenciaMes },
    riskConfigId: item.riskConfigId,
    indice: item.indice,
    classificacao: item.classificacao,
    confiabilidade: item.confiabilidade,
    natureza: item.natureza,
    origem: item.origem,
    calculadoEm: item.calculadoEm,
  };
}

/** GET /api/risk/regioes - ranking de regioes de saude para a competencia/riskConfig resolvidos. */
export async function listarRiskRegional(query: RiskFiltroQuery, paginacao: PaginationQuery) {
  const filtros = await resolverFiltros(query, 'regional');

  if (filtros.riskConfigId === null) {
    return {
      data: [] as RiskScoreRegionalItemDTO[],
      meta: { filtros: toFiltroDTO(filtros), pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, 0) },
    };
  }

  const skip = (paginacao.page - 1) * paginacao.pageSize;
  const { items, total } = await listRiskScoresRegional(
    prisma,
    { competenciaId: filtros.competenciaId, riskConfigId: filtros.riskConfigId, origem: filtros.origemParaFiltro },
    { skip, take: paginacao.pageSize },
  );

  return {
    data: items.map(toItemDTORegional),
    meta: { filtros: toFiltroDTO(filtros), pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, total) },
  };
}

/** GET /api/risk/regioes/:regiaoSaudeId - RiskScore de uma regiao na competencia/riskConfig resolvidos. */
export async function detalharRiskRegiao(regiaoSaudeId: number, query: RiskFiltroQuery) {
  const regiao = await getRegiaoSaudeById(prisma, regiaoSaudeId);
  if (!regiao) {
    throw new HttpError(404, 'REGIAO_SAUDE_NAO_ENCONTRADA', `RegiaoSaude ${regiaoSaudeId} nao existe.`);
  }

  const filtros = await resolverFiltros(query, 'regional');
  if (filtros.riskConfigId === null) {
    return { data: null, meta: { filtros: toFiltroDTO(filtros) } };
  }

  const score = await getRiskScoreRegiao(prisma, {
    regiaoSaudeId,
    competenciaId: filtros.competenciaId,
    riskConfigId: filtros.riskConfigId,
    origem: filtros.origemParaFiltro,
  });

  return { data: score ? toItemDTORegional(score) : null, meta: { filtros: toFiltroDTO(filtros) } };
}

/** GET /api/risk/regioes/:regiaoSaudeId/components - componentes materializados de uma regiao. */
export async function listarComponentesRiskRegiao(regiaoSaudeId: number, query: RiskFiltroQuery) {
  const regiao = await getRegiaoSaudeById(prisma, regiaoSaudeId);
  if (!regiao) {
    throw new HttpError(404, 'REGIAO_SAUDE_NAO_ENCONTRADA', `RegiaoSaude ${regiaoSaudeId} nao existe.`);
  }

  const filtros = await resolverFiltros(query, 'regional');
  if (filtros.riskConfigId === null) {
    return { data: [], meta: { filtros: toFiltroDTO(filtros) } };
  }

  const componentes = await listRiskComponentesRegiao(prisma, {
    regiaoSaudeId,
    competenciaId: filtros.competenciaId,
    riskConfigId: filtros.riskConfigId,
    origem: filtros.origemParaFiltro,
  });

  return { data: componentes, meta: { filtros: toFiltroDTO(filtros) } };
}
