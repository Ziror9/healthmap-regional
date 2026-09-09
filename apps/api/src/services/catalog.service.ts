/**
 * Servico de catalogo (municipios, regioes, competencias, indicadores).
 * So le via packages/db e monta a resposta - nenhuma query aqui.
 */
import {
  getPrismaClient,
  listMunicipios as dbListMunicipios,
  getMunicipioById as dbGetMunicipioById,
  listRegioesSaude as dbListRegioesSaude,
  listCompetencias as dbListCompetencias,
  listIndicadorDefinicoes as dbListIndicadorDefinicoes,
  listIndicadoresDoMunicipio,
  listRiskScoresDoMunicipio,
  getInternacoesAnuaisMunicipio,
  getObitosAnuaisMunicipio,
  getAnosComInternacaoResidenciaAnual,
  getAnosComObitoResidenciaReal,
  getAnosComIndicadorMunicipal,
  listInternacoesAnualPorMunicipio,
  listObitosAnualPorMunicipio,
  listIndicadorMunicipalTodos,
  listRiskScoreTodos,
  resolveDefaultRiskConfigId,
  getAnosComRiskScore,
  getCompetenciaMaisRecenteComRiskScorePorAno,
  type RadarMunicipalValor,
} from '@healthmap/db';
import { buildPaginationMeta, type PaginationQuery, type RadarMunicipalFiltroQuery, type RadarMunicipalIndicador } from '@healthmap/contracts';
import { HttpError } from '../types/http.js';
import type { CompetenciasFiltro, MunicipioDetalheFiltro, MunicipiosFiltro } from '../validation/query.js';

const prisma = getPrismaClient();

function toSkipTake(paginacao: PaginationQuery): { skip: number; take: number } {
  return { skip: (paginacao.page - 1) * paginacao.pageSize, take: paginacao.pageSize };
}

export async function listarMunicipios(paginacao: PaginationQuery, filtros: MunicipiosFiltro) {
  const { items, total } = await dbListMunicipios(prisma, filtros, toSkipTake(paginacao));
  return { data: items, meta: { pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, total) } };
}

export async function detalharMunicipio(municipioId: number, filtros: MunicipioDetalheFiltro) {
  const municipio = await dbGetMunicipioById(prisma, municipioId);
  if (!municipio) {
    throw new HttpError(404, 'MUNICIPIO_NAO_ENCONTRADO', `Municipio ${municipioId} nao existe.`);
  }

  const [riscos, indicadoresTodos, internacoesAnuaisTodas, obitosAnuaisTodas] = await Promise.all([
    listRiskScoresDoMunicipio(prisma, {
      municipioId,
      competenciaId: filtros.competenciaId,
      riskConfigId: filtros.riskConfigId,
    }),
    listIndicadoresDoMunicipio(prisma, municipioId),
    // Fase 5.7: totais brutos anuais (nao sao IndicadorMunicipal - sao o
    // fato agregado em si, ver packages/db/src/repositories/radarQuery.ts).
    getInternacoesAnuaisMunicipio(prisma, municipioId),
    getObitosAnuaisMunicipio(prisma, municipioId),
  ]);

  const indicadores =
    filtros.ano === undefined ? indicadoresTodos : indicadoresTodos.filter((i) => i.ano === filtros.ano);
  const internacoesAnuais =
    filtros.ano === undefined ? internacoesAnuaisTodas : internacoesAnuaisTodas.filter((i) => i.ano === filtros.ano);
  const obitosOncologicosAnuais =
    filtros.ano === undefined ? obitosAnuaisTodas : obitosAnuaisTodas.filter((i) => i.ano === filtros.ano);

  return {
    ...municipio,
    riscos: riscos.map((r) => ({
      competencia: { id: r.competenciaId, ano: r.competenciaAno, mes: r.competenciaMes },
      riskConfigId: r.riskConfigId,
      indice: r.indice,
      classificacao: r.classificacao,
      confiabilidade: r.confiabilidade,
      natureza: r.natureza,
      origem: r.origem,
    })),
    indicadores,
    internacoesAnuais,
    obitosOncologicosAnuais,
  };
}

export async function listarRegioes(paginacao: PaginationQuery) {
  const { items, total } = await dbListRegioesSaude(prisma, toSkipTake(paginacao));
  return { data: items, meta: { pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, total) } };
}

export async function listarCompetencias(paginacao: PaginationQuery, filtros: CompetenciasFiltro) {
  const { items, total } = await dbListCompetencias(prisma, filtros, toSkipTake(paginacao));
  return { data: items, meta: { pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, total) } };
}

export async function listarIndicadores(paginacao: PaginationQuery) {
  const { items, total } = await dbListIndicadorDefinicoes(prisma, toSkipTake(paginacao));
  return { data: items, meta: { pagination: buildPaginationMeta(paginacao.page, paginacao.pageSize, total) } };
}

// -----------------------------------------------------------------------------
// Radar Municipal (Fase 5.7) - GET /api/indicadores/municipios. Devolve os
// 645 municipios REAL de uma vez (nunca 1 requisicao por municipio) para o
// indicador selecionado. So orquestra o que ja existe (packages/db/src/
// repositories/radarQuery.ts) - nenhum calculo, nenhuma RiskConfig nova.
// -----------------------------------------------------------------------------

const UNIDADE_POR_INDICADOR: Record<RadarMunicipalIndicador, string> = {
  INTERNACOES: 'internações no ano',
  TAXA_INTERNACAO_10K_HAB: 'por 10.000 habitantes',
  OBITOS_ONCOLOGICOS: 'óbitos oncológicos no ano',
  TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB: 'por 10.000 habitantes',
  RISK_SCORE: 'índice do Radar (0–1)',
  VULNERABILIDADE: 'grupo IPVS (1=menor risco..7=maior risco)',
};

const INDICADOR_DEFINICAO_CHAVE: Record<'TAXA_INTERNACAO_10K_HAB' | 'TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB' | 'VULNERABILIDADE', string> = {
  TAXA_INTERNACAO_10K_HAB: 'TAXA_INTERNACAO_10K_HAB',
  TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB: 'TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB',
  VULNERABILIDADE: 'IPVS_MEDIA_PONDERADA_SETOR',
};

/** Resolve o ano a usar: o pedido pelo cliente (se existir na base) ou o mais recente disponivel. Nunca inventa um ano fora do que a base tem. */
function resolverAno(anoSolicitado: number | undefined, anosDisponiveis: number[]): number | null {
  if (anoSolicitado !== undefined) {
    if (!anosDisponiveis.includes(anoSolicitado)) {
      throw new HttpError(404, 'ANO_NAO_DISPONIVEL', `Nenhum dado para o ano ${anoSolicitado} com este indicador.`, { anosDisponiveis });
    }
    return anoSolicitado;
  }
  return anosDisponiveis.length > 0 ? anosDisponiveis[anosDisponiveis.length - 1]! : null;
}

function toRadarItemDTO(item: RadarMunicipalValor, origem: 'REAL' | 'DEMO' | null) {
  return {
    municipio: item.municipio,
    valor: item.valor,
    disponivel: item.disponivel,
    motivo: item.motivo,
    origem: item.disponivel ? origem : null,
  };
}

function respostaVazia(indicador: RadarMunicipalIndicador, anosDisponiveis: number[], riskConfigId: number | null) {
  return {
    data: [] as ReturnType<typeof toRadarItemDTO>[],
    meta: {
      filtros: {
        indicador,
        ano: null,
        anosDisponiveis,
        riskConfigId,
        origem: null,
        unidade: UNIDADE_POR_INDICADOR[indicador],
      },
    },
  };
}

export async function listarIndicadorMunicipios(filtro: RadarMunicipalFiltroQuery) {
  const { indicador } = filtro;
  const unidade = UNIDADE_POR_INDICADOR[indicador];
  const origem = filtro.origem ?? 'REAL';

  if (indicador === 'RISK_SCORE') {
    const riskConfigId = filtro.riskConfigId ?? (await resolveDefaultRiskConfigId(prisma));
    if (riskConfigId === null) return respostaVazia(indicador, [], null);

    const anosDisponiveis = await getAnosComRiskScore(prisma, riskConfigId, origem);
    const ano = resolverAno(filtro.ano, anosDisponiveis);
    if (ano === null) return respostaVazia(indicador, anosDisponiveis, riskConfigId);

    const competencia = await getCompetenciaMaisRecenteComRiskScorePorAno(prisma, riskConfigId, ano);
    if (!competencia) {
      return {
        data: [],
        meta: { filtros: { indicador, ano, anosDisponiveis, riskConfigId, origem: null, unidade } },
      };
    }

    const itens = await listRiskScoreTodos(prisma, { competenciaId: competencia.id, riskConfigId, origem });
    return {
      data: itens.map((i) => toRadarItemDTO(i, origem)),
      meta: { filtros: { indicador, ano, anosDisponiveis, riskConfigId, origem, unidade } },
    };
  }

  if (indicador === 'INTERNACOES') {
    // Os anos vem da MESMA tabela que produz os valores
    // (gold.FatoInternacaoResidenciaAnual, Fase 5.10) - antes vinham das
    // competencias REAL do SIH, uma fonte vizinha mas diferente. As duas
    // coincidem hoje, mas divergiriam num ano com competencias ingeridas e
    // agregacao anual ausente: o seletor ofereceria um ano em que todos os
    // 645 municipios apareceriam como indisponiveis. Oferecer um ano e
    // afirmar que ha dado nele.
    const anosDisponiveis = await getAnosComInternacaoResidenciaAnual(prisma);
    const ano = resolverAno(filtro.ano, anosDisponiveis);
    if (ano === null) return respostaVazia(indicador, anosDisponiveis, null);

    const itens = await listInternacoesAnualPorMunicipio(prisma, ano);
    return {
      data: itens.map((i) => toRadarItemDTO(i, origem)),
      meta: { filtros: { indicador, ano, anosDisponiveis, riskConfigId: null, origem, unidade } },
    };
  }

  if (indicador === 'OBITOS_ONCOLOGICOS') {
    const anosDisponiveis = await getAnosComObitoResidenciaReal(prisma);
    const ano = resolverAno(filtro.ano, anosDisponiveis);
    if (ano === null) return respostaVazia(indicador, anosDisponiveis, null);

    const itens = await listObitosAnualPorMunicipio(prisma, ano);
    return {
      data: itens.map((i) => toRadarItemDTO(i, origem)),
      meta: { filtros: { indicador, ano, anosDisponiveis, riskConfigId: null, origem, unidade } },
    };
  }

  // TAXA_INTERNACAO_10K_HAB | TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB | VULNERABILIDADE
  const indicadorDefinicaoId = INDICADOR_DEFINICAO_CHAVE[indicador];
  const anosDisponiveis = await getAnosComIndicadorMunicipal(prisma, indicadorDefinicaoId, origem);
  const ano = resolverAno(filtro.ano, anosDisponiveis);
  if (ano === null) return respostaVazia(indicador, anosDisponiveis, null);

  const itens = await listIndicadorMunicipalTodos(prisma, indicadorDefinicaoId, ano);
  return {
    data: itens.map((i) => toRadarItemDTO(i, origem)),
    meta: { filtros: { indicador, ano, anosDisponiveis, riskConfigId: null, origem, unidade } },
  };
}
