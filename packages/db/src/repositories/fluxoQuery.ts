/**
 * Repositorio de LEITURA do fluxo assistencial (Fase 5.8) para a API.
 *
 * Le `gold.FatoFluxoInternacao` (grao anual, par ordenado residencia ->
 * internacao) ja materializado por etl/ingest_sih.py. Nenhuma agregacao de
 * fato bruto e nenhuma estimativa acontecem aqui: um par que nao existe na
 * tabela nao existe no dado, e um par suprimido continua suprimido
 * (`internacoes = null`, nunca 0).
 *
 * Mesma separacao de riskQuery.ts/radarQuery.ts: repositories/risk.ts serve
 * ao motor de calculo; este arquivo serve a API.
 *
 * PROVENIENCIA: `origem` e OBRIGATORIA em todas as funcoes daqui. Ate a
 * higienizacao pos-Fase 5.10 elas tinham default `?? 'REAL'`, e o service
 * podia devolver `meta.filtros.origem = null` enquanto a consulta filtrava
 * REAL - um numero sem proveniencia declarada (CLAUDE.md #2). Quem chama
 * precisa ter resolvido a origem antes, e e essa mesma origem resolvida que
 * vai para o `meta` da resposta. Cada item devolvido carrega ainda a
 * `origem` da propria linha do fato, nunca uma constante.
 */
import type { PrismaClient } from '@prisma/client';
import type { OrigemValor } from './riskQuery.js';

export interface FluxoMunicipioRef {
  id: number;
  nome: string;
  codigoIbge7: string;
}

export interface FluxoItem {
  municipio: FluxoMunicipioRef;
  internacoes: number | null;
  suprimido: boolean;
  /** true quando origem e destino sao o mesmo municipio (atendimento na propria cidade). */
  mesmoMunicipio: boolean;
  /** Proveniencia da linha do fato (coluna `origem` de FatoFluxoInternacao), nunca uma constante. */
  origem: OrigemValor;
}

/** Anos com pelo menos 1 par de fluxo carregado NA ORIGEM pedida - o seletor de ano nunca inventa um ano nem mistura origens. */
export async function getAnosComFluxo(prisma: PrismaClient, origem: OrigemValor): Promise<number[]> {
  const rows = await prisma.fatoFluxoInternacao.findMany({
    where: { origem },
    select: { ano: true },
    distinct: ['ano'],
    orderBy: { ano: 'asc' },
  });
  return rows.map((r) => r.ano);
}

const SELECT_MUNICIPIO = { select: { id: true, nome: true, codigoIbge7: true } } as const;

/** Para onde vao os pacientes que MORAM neste municipio (destinos), maior volume primeiro. */
export async function listFluxoPorOrigem(
  prisma: PrismaClient,
  filtros: { municipioId: number; ano: number; origem: OrigemValor },
): Promise<FluxoItem[]> {
  const rows = await prisma.fatoFluxoInternacao.findMany({
    where: {
      municipioResidenciaId: filtros.municipioId,
      ano: filtros.ano,
      origem: filtros.origem,
    },
    include: { municipioInternacao: SELECT_MUNICIPIO },
    orderBy: [{ internacoes: { sort: 'desc', nulls: 'last' } }],
  });

  return rows.map((r) => ({
    municipio: r.municipioInternacao,
    internacoes: r.suprimido ? null : r.internacoes,
    suprimido: r.suprimido,
    mesmoMunicipio: r.municipioInternacaoId === filtros.municipioId,
    origem: r.origem,
  }));
}

/** De onde vem os pacientes ATENDIDOS neste municipio (origens), maior volume primeiro. */
export async function listFluxoPorDestino(
  prisma: PrismaClient,
  filtros: { municipioId: number; ano: number; origem: OrigemValor },
): Promise<FluxoItem[]> {
  const rows = await prisma.fatoFluxoInternacao.findMany({
    where: {
      municipioInternacaoId: filtros.municipioId,
      ano: filtros.ano,
      origem: filtros.origem,
    },
    include: { municipioResidencia: SELECT_MUNICIPIO },
    orderBy: [{ internacoes: { sort: 'desc', nulls: 'last' } }],
  });

  return rows.map((r) => ({
    municipio: r.municipioResidencia,
    internacoes: r.suprimido ? null : r.internacoes,
    suprimido: r.suprimido,
    mesmoMunicipio: r.municipioResidenciaId === filtros.municipioId,
    origem: r.origem,
  }));
}

export interface ResumoFluxoMunicipio {
  /** Soma das internacoes dos pares NAO suprimidos com este municipio como residencia. */
  internacoesVisiveis: number;
  /** Parte dessas internacoes que ocorreu no proprio municipio. */
  internacoesNoProprioMunicipio: number;
  /** Parte que ocorreu em outro municipio. */
  internacoesForaDoMunicipio: number;
  /** Quantos pares origem->destino ficaram suprimidos (n<5) - o volume deles NAO entra nas somas acima. */
  paresSuprimidos: number;
  /** Quantos destinos distintos com volume visivel. */
  destinosVisiveis: number;
  /**
   * DERIVADO (nao e dado observado): internacoesForaDoMunicipio /
   * internacoesVisiveis. Calculado apenas sobre o volume visivel - os pares
   * suprimidos ficam de fora do numerador E do denominador. `null` quando nao
   * ha volume visivel algum (nunca 0, que seria "ninguem sai", conclusao
   * diferente de "nao da para saber").
   */
  taxaFluxoExternoVisivel: number | null;
}

/**
 * Resumo do fluxo de saida de um municipio. As somas cobrem SO os pares
 * visiveis: pares suprimidos sao contados a parte (`paresSuprimidos`) e nunca
 * imputados. Quem consome deve exibir a cobertura junto do numero.
 */
export async function getResumoFluxoMunicipio(
  prisma: PrismaClient,
  filtros: { municipioId: number; ano: number; origem: OrigemValor },
): Promise<ResumoFluxoMunicipio> {
  const destinos = await listFluxoPorOrigem(prisma, filtros);

  let internacoesNoProprioMunicipio = 0;
  let internacoesForaDoMunicipio = 0;
  let paresSuprimidos = 0;
  let destinosVisiveis = 0;

  for (const destino of destinos) {
    if (destino.suprimido || destino.internacoes === null) {
      paresSuprimidos += 1;
      continue;
    }
    destinosVisiveis += 1;
    if (destino.mesmoMunicipio) internacoesNoProprioMunicipio += destino.internacoes;
    else internacoesForaDoMunicipio += destino.internacoes;
  }

  const internacoesVisiveis = internacoesNoProprioMunicipio + internacoesForaDoMunicipio;
  return {
    internacoesVisiveis,
    internacoesNoProprioMunicipio,
    internacoesForaDoMunicipio,
    paresSuprimidos,
    destinosVisiveis,
    taxaFluxoExternoVisivel: internacoesVisiveis > 0 ? internacoesForaDoMunicipio / internacoesVisiveis : null,
  };
}

export interface PoloAtendimento {
  municipio: FluxoMunicipioRef;
  /** Proveniencia das linhas somadas neste polo - ver FluxoItem.origem. */
  origem: OrigemValor;
  /** Internacoes recebidas de residentes de OUTROS municipios (exclui o proprio). */
  internacoesRecebidasDeFora: number;
  /** Quantos municipios de origem distintos mandam pacientes para ca (pares visiveis). */
  municipiosDeOrigem: number;
}

/**
 * Polos de atendimento: municipios que mais recebem pacientes de FORA.
 * Responde "onde o estado concentra o tratamento oncologico" - a leitura de
 * primeiro nivel do fluxo. Exclui o atendimento do proprio municipio (que nao
 * e fluxo) e os pares suprimidos.
 */
export async function listPolosAtendimento(
  prisma: PrismaClient,
  filtros: { ano: number; limite?: number; origem: OrigemValor },
): Promise<PoloAtendimento[]> {
  const rows = await prisma.fatoFluxoInternacao.findMany({
    where: {
      ano: filtros.ano,
      origem: filtros.origem,
      suprimido: false,
      NOT: { municipioResidenciaId: { equals: prisma.fatoFluxoInternacao.fields.municipioInternacaoId } },
    },
    include: { municipioInternacao: SELECT_MUNICIPIO },
  });

  const porDestino = new Map<number, PoloAtendimento>();
  for (const row of rows) {
    if (row.internacoes === null) continue;
    const atual = porDestino.get(row.municipioInternacaoId) ?? {
      municipio: row.municipioInternacao,
      origem: row.origem,
      internacoesRecebidasDeFora: 0,
      municipiosDeOrigem: 0,
    };
    atual.internacoesRecebidasDeFora += row.internacoes;
    atual.municipiosDeOrigem += 1;
    porDestino.set(row.municipioInternacaoId, atual);
  }

  return [...porDestino.values()]
    .sort((a, b) => b.internacoesRecebidasDeFora - a.internacoesRecebidasDeFora)
    .slice(0, filtros.limite ?? 10);
}
