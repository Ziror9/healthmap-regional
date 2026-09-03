/**
 * Servico do fluxo assistencial (Fase 5.8).
 *
 * So resolve filtros (ano) e monta a resposta a partir do que
 * packages/db/src/repositories/fluxoQuery.ts devolve. Nenhuma query aqui,
 * nenhuma estimativa: par ausente e ausente, par suprimido continua
 * suprimido.
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
import type { FluxoFiltroQuery } from '@healthmap/contracts';
import { HttpError } from '../types/http.js';

const prisma = getPrismaClient();

/** Ano pedido (se existir na base) ou o mais recente disponivel. Nunca um ano inventado. */
async function resolverAno(anoSolicitado: number | undefined): Promise<{ ano: number | null; anosDisponiveis: number[] }> {
  const anosDisponiveis = await getAnosComFluxo(prisma);
  if (anoSolicitado !== undefined) {
    if (!anosDisponiveis.includes(anoSolicitado)) {
      throw new HttpError(404, 'ANO_NAO_DISPONIVEL', `Nenhum fluxo carregado para o ano ${anoSolicitado}.`, { anosDisponiveis });
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

  const { ano, anosDisponiveis } = await resolverAno(filtro.ano);
  const filtrosResolvidos = { ano, anosDisponiveis, origem: filtro.origem ?? null };

  if (ano === null) {
    return { data: null, meta: { filtros: filtrosResolvidos } };
  }

  const alvo = { municipioId, ano, origem: filtro.origem };
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
  const { ano, anosDisponiveis } = await resolverAno(filtro.ano);
  const filtrosResolvidos = { ano, anosDisponiveis, origem: filtro.origem ?? null };

  if (ano === null) {
    return { data: [], meta: { filtros: filtrosResolvidos } };
  }

  const polos = await listPolosAtendimento(prisma, { ano, limite: filtro.limite, origem: filtro.origem });
  return { data: polos, meta: { filtros: filtrosResolvidos } };
}
