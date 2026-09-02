/**
 * Repositorio de LEITURA do Radar Municipal (Fase 5.7) para a API.
 *
 * So orquestra e decora com metadado de municipio (nome/codigoIbge7) o que
 * ja existe: repositories/risk.ts (agregados brutos ja cientes de supressao,
 * usados pelos scripts de calculo) e repositories/riskQuery.ts (RiskScore ja
 * materializado). Nenhuma agregacao de fato bruto e nenhuma formula nova
 * vive aqui - so leitura em bloco para os 645 municipios de uma vez (nunca
 * 1 requisicao por municipio).
 */
import type { PrismaClient } from '@prisma/client';
import { listMunicipios } from './catalog.js';
import {
  getAgregadoInternacaoResidenciaAnual,
  getAgregadoObitoResidenciaAnual,
  getAnosComObitoResidenciaReal,
  getCompetencias,
  getIndicadorMunicipalPorDefinicao,
} from './risk.js';
import { listRiskScores, type OrigemValor } from './riskQuery.js';

export interface RadarMunicipalMunicipioRef {
  id: number;
  nome: string;
  codigoIbge7: string;
}

export interface RadarMunicipalValor {
  municipio: RadarMunicipalMunicipioRef;
  valor: number | null;
  disponivel: boolean;
  motivo: string | null;
}

const MOTIVO_SEM_FATO = 'Sem registro para este município neste ano.';
const MOTIVO_SUPRIMIDO = 'Suprimido: menos de 5 casos em pelo menos uma célula do ano (regra de privacidade, nunca vira zero).';
const MOTIVO_SEM_INDICADOR = 'Indicador não calculado para este município neste ano.';

/** Os 645 municipios REAL (nunca DEMO - nenhum dos 6 indicadores do Radar Municipal tem fonte DEMO). */
async function listarMunicipiosReal(prisma: PrismaClient): Promise<RadarMunicipalMunicipioRef[]> {
  const { items } = await listMunicipios(prisma, {}, { skip: 0, take: 1000 });
  return items.filter((m) => m.codigoIbge7.startsWith('35')).map((m) => ({ id: m.id, nome: m.nome, codigoIbge7: m.codigoIbge7 }));
}

function montarLista(
  municipios: RadarMunicipalMunicipioRef[],
  valorPorMunicipio: Map<number, { valor: number | null; existe: boolean }>,
  motivoSemDado: string,
): RadarMunicipalValor[] {
  return municipios.map((municipio) => {
    const entrada = valorPorMunicipio.get(municipio.id);
    if (entrada === undefined) {
      return { municipio, valor: null, disponivel: false, motivo: motivoSemDado };
    }
    if (entrada.valor === null) {
      return { municipio, valor: null, disponivel: false, motivo: MOTIVO_SUPRIMIDO };
    }
    return { municipio, valor: entrada.valor, disponivel: true, motivo: null };
  });
}

/** Internacoes REAL (total bruto anual, `gold.FatoInternacaoResidencia`) - reaproveita getAgregadoInternacaoResidenciaAnual (Fase 2/5.2), ja com bool_or(suprimido). */
export async function listInternacoesAnualPorMunicipio(prisma: PrismaClient, ano: number): Promise<RadarMunicipalValor[]> {
  const [agregado, municipios] = await Promise.all([getAgregadoInternacaoResidenciaAnual(prisma, ano), listarMunicipiosReal(prisma)]);
  const porMunicipio = new Map(agregado.map((a) => [a.municipioId, { valor: a.internacoesTotal, existe: true }]));
  return montarLista(municipios, porMunicipio, MOTIVO_SEM_FATO);
}

/** Obitos oncologicos REAL (total bruto anual, `gold.FatoObitoResidencia`, ja no grao anual - Fase 5.6) - reaproveita getAgregadoObitoResidenciaAnual. */
export async function listObitosAnualPorMunicipio(prisma: PrismaClient, ano: number): Promise<RadarMunicipalValor[]> {
  const [agregado, municipios] = await Promise.all([getAgregadoObitoResidenciaAnual(prisma, ano), listarMunicipiosReal(prisma)]);
  const porMunicipio = new Map(agregado.map((a) => [a.municipioId, { valor: a.obitosTotal, existe: true }]));
  return montarLista(municipios, porMunicipio, MOTIVO_SEM_FATO);
}

/**
 * Qualquer IndicadorMunicipal ja materializado (TAXA_INTERNACAO_10K_HAB,
 * TAXA_MORTALIDADE_ONCOLOGICA_10K_HAB, IPVS_MEDIA_PONDERADA_SETOR) para
 * todos os municipios REAL num ano - reaproveita getIndicadorMunicipalPorDefinicao
 * (Fase 5.3/5.4/5.6), nenhuma formula nova.
 */
export async function listIndicadorMunicipalTodos(
  prisma: PrismaClient,
  indicadorDefinicaoId: string,
  ano: number,
): Promise<RadarMunicipalValor[]> {
  const [linhas, municipios] = await Promise.all([
    getIndicadorMunicipalPorDefinicao(prisma, { indicadorDefinicaoId, ano }),
    listarMunicipiosReal(prisma),
  ]);
  const porMunicipio = new Map(linhas.map((l) => [l.municipioId, { valor: l.valor, existe: true }]));
  return montarLista(municipios, porMunicipio, MOTIVO_SEM_INDICADOR);
}

/**
 * RiskScore REAL para todos os municipios numa competencia+riskConfig -
 * reaproveita listRiskScores (Fase 3), nenhum recalculo. `valor` e o indice
 * (escala 0-1, ja normalizado por packages/risk).
 */
export async function listRiskScoreTodos(
  prisma: PrismaClient,
  filtros: { competenciaId: number; riskConfigId: number; origem?: OrigemValor },
): Promise<RadarMunicipalValor[]> {
  const [{ items }, municipios] = await Promise.all([
    listRiskScores(prisma, filtros, { skip: 0, take: 1000 }),
    listarMunicipiosReal(prisma),
  ]);
  const porMunicipio = new Map(items.map((i) => [i.municipioId, { valor: i.indice, existe: true }]));
  return montarLista(municipios, porMunicipio, 'RiskScore não calculado para este município nesta competência.');
}

export interface TotalAnualMunicipio {
  ano: number;
  total: number | null;
  disponivel: boolean;
}

/**
 * Totais brutos anuais (internacoes ou obitos) de UM municipio, para todos
 * os anos REAL disponiveis - usado no painel de detalhe do Radar Municipal
 * (GET /api/municipios/:id, clique no mapa). Reaproveita os mesmos agregados
 * anuais acima; so filtra para 1 municipio em vez de devolver os 645.
 */
export async function getInternacoesAnuaisMunicipio(prisma: PrismaClient, municipioId: number): Promise<TotalAnualMunicipio[]> {
  const competencias = await getCompetencias(prisma, { apenasReal: true });
  const anos = [...new Set(competencias.map((c) => c.ano))].sort((a, b) => a - b);
  const porAno = await Promise.all(
    anos.map(async (ano) => {
      const agregado = await getAgregadoInternacaoResidenciaAnual(prisma, ano);
      const linha = agregado.find((a) => a.municipioId === municipioId);
      return { ano, total: linha?.internacoesTotal ?? null, disponivel: linha !== undefined && linha.internacoesTotal !== null };
    }),
  );
  return porAno;
}

export async function getObitosAnuaisMunicipio(prisma: PrismaClient, municipioId: number): Promise<TotalAnualMunicipio[]> {
  const anos = await getAnosComObitoResidenciaReal(prisma);
  const porAno = await Promise.all(
    anos.map(async (ano) => {
      const agregado = await getAgregadoObitoResidenciaAnual(prisma, ano);
      const linha = agregado.find((a) => a.municipioId === municipioId);
      return { ano, total: linha?.obitosTotal ?? null, disponivel: linha !== undefined && linha.obitosTotal !== null };
    }),
  );
  return porAno;
}
