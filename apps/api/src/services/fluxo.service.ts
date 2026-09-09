/**
 * Servico do fluxo assistencial (Fase 5.8).
 *
 * So resolve filtros (ano e origem) e monta a resposta a partir do que
 * packages/db/src/repositories/fluxoQuery.ts devolve. Nenhuma query aqui,
 * nenhuma estimativa: par ausente e ausente, par suprimido continua
 * suprimido.
 *
 * A origem e resolvida EXPLICITAMENTE aqui (ver ORIGEM_PADRAO abaixo) e a
 * mesma resolucao vai para a consulta e para `meta.filtros.origem` - nunca
 * um filtro implicito no repositorio com meta dizendo outra coisa.
 */
import {
  getPrismaClient,
  getMunicipioById,
  getAnosComFluxo,
  listFluxoPorOrigem,
  listFluxoPorDestino,
  getResumoFluxoMunicipio,
  listPolosAtendimento,
} from '@healthmap/db';
import type { FluxoFiltroQuery, FluxoFiltroResolvidoDTO, Origem } from '@healthmap/contracts';
import { HttpError } from '../types/http.js';

const prisma = getPrismaClient();

/**
 * Origem aplicada quando o cliente nao pede nenhuma.
 *
 * Diferente de risk.service.ts, que DEDUZ a origem do conjunto de RiskScore
 * resolvido (e responde 409 quando ha mais de uma), aqui a origem e uma
 * escolha declarada: o produto e REAL-first desde a Fase 5.9, e
 * `gold.FatoFluxoInternacao` so tem linhas REAL. O ponto em comum com
 * risk.service.ts - e o que esta correcao garante - e que a origem
 * efetivamente aplicada no WHERE e sempre a mesma que aparece em
 * `meta.filtros.origem`. Antes o repositorio filtrava REAL por default e o
 * meta declarava `null`.
 */
const ORIGEM_PADRAO: Origem = 'REAL';

/** Origem explicita do cliente ou o padrao REAL - nunca indefinida, nunca implicita. */
function resolverOrigem(origemSolicitada: Origem | undefined): Origem {
  return origemSolicitada ?? ORIGEM_PADRAO;
}

/**
 * Ano pedido (se existir na base PARA AQUELA ORIGEM) ou o mais recente
 * disponivel. Nunca um ano inventado. A origem entra aqui de proposito:
 * "anos disponiveis" de REAL e de DEMO sao conjuntos diferentes, e oferecer
 * um ano que so existe na outra origem devolveria lista vazia sem explicacao.
 */
async function resolverAno(
  anoSolicitado: number | undefined,
  origem: Origem,
): Promise<{ ano: number | null; anosDisponiveis: number[] }> {
  const anosDisponiveis = await getAnosComFluxo(prisma, origem);
  if (anoSolicitado !== undefined) {
    if (!anosDisponiveis.includes(anoSolicitado)) {
      throw new HttpError(
        404,
        'ANO_NAO_DISPONIVEL',
        `Nenhum fluxo ${origem} carregado para o ano ${anoSolicitado}.`,
        { anosDisponiveis, origem },
      );
    }
    return { ano: anoSolicitado, anosDisponiveis };
  }
  return { ano: anosDisponiveis[anosDisponiveis.length - 1] ?? null, anosDisponiveis };
}

/** GET /api/fluxo/municipios/:municipioId - saidas, entradas e resumo de um municipio. */
export async function detalharFluxoMunicipio(municipioId: number, filtro: FluxoFiltroQuery) {
  const municipio = await getMunicipioById(prisma, municipioId);
  if (!municipio) {
    throw new HttpError(404, 'MUNICIPIO_NAO_ENCONTRADO', `Municipio ${municipioId} nao existe.`);
  }

  const origem = resolverOrigem(filtro.origem);
  const { ano, anosDisponiveis } = await resolverAno(filtro.ano, origem);
  const filtrosResolvidos: FluxoFiltroResolvidoDTO = { ano, anosDisponiveis, origem };

  if (ano === null) {
    return { data: null, meta: { filtros: filtrosResolvidos } };
  }

  const alvo = { municipioId, ano, origem };
  const [saidas, entradas, resumo] = await Promise.all([
    listFluxoPorOrigem(prisma, alvo),
    listFluxoPorDestino(prisma, alvo),
    getResumoFluxoMunicipio(prisma, alvo),
  ]);

  return {
    data: {
      municipio: { id: municipio.id, nome: municipio.nome, codigoIbge7: municipio.codigoIbge7 },
      ano,
      saidas,
      entradas,
      resumo,
    },
    meta: { filtros: filtrosResolvidos },
  };
}

/** GET /api/fluxo/polos - municipios que mais recebem pacientes de fora (leitura de primeiro nivel). */
export async function listarPolosAtendimento(filtro: FluxoFiltroQuery) {
  const origem = resolverOrigem(filtro.origem);
  const { ano, anosDisponiveis } = await resolverAno(filtro.ano, origem);
  const filtrosResolvidos: FluxoFiltroResolvidoDTO = { ano, anosDisponiveis, origem };

  if (ano === null) {
    return { data: [], meta: { filtros: filtrosResolvidos } };
  }

  const polos = await listPolosAtendimento(prisma, { ano, limite: filtro.limite, origem });
  return { data: polos, meta: { filtros: filtrosResolvidos } };
}
