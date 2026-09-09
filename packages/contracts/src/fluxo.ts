import { z } from 'zod';
import { Origem } from './enums.js';

/**
 * Fluxo assistencial (Fase 5.8) - para onde os residentes de um municipio vao
 * se internar, e de onde vem os pacientes atendidos num municipio.
 *
 * Fonte: `gold.FatoFluxoInternacao` (SIH/SUS, par ordenado residencia ->
 * internacao, grao anual). `internacoes = null` sempre que `suprimido = true`
 * (n<5) - nunca 0, porque "menos de 5 pacientes" e diferente de "nenhum
 * paciente".
 */
const fluxoMunicipioRefSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  codigoIbge7: z.string(),
});

export const fluxoItemSchema = z.object({
  municipio: fluxoMunicipioRefSchema,
  internacoes: z.number().int().nullable(),
  suprimido: z.boolean(),
  /** Atendimento na propria cidade - nao e deslocamento. */
  mesmoMunicipio: z.boolean(),
  /**
   * Proveniencia por item (CLAUDE.md #2), mesmo padrao de RiskScoreItemDTO e
   * RadarMunicipalItemDTO. Vem da coluna `origem` da propria linha do fato -
   * nunca de uma constante no codigo.
   *
   * Nao ha campo `natureza`: fatos brutos do gold nao a persistem (e sempre
   * OBSERVADO por construcao, ver o comentario do enum Natureza no
   * schema.prisma). O unico numero DERIVADO desta area e
   * `taxaFluxoExternoVisivel`, rotulado como tal no resumo e na UI.
   */
  origem: z.nativeEnum(Origem),
});
export type FluxoItemDTO = z.infer<typeof fluxoItemSchema>;

/**
 * Resumo de saida de um municipio. Todos os totais cobrem SOMENTE os pares
 * visiveis; `paresSuprimidos` diz quanto ficou de fora, para que o numero
 * nunca seja lido como completo.
 */
export const fluxoResumoSchema = z.object({
  internacoesVisiveis: z.number().int(),
  internacoesNoProprioMunicipio: z.number().int(),
  internacoesForaDoMunicipio: z.number().int(),
  paresSuprimidos: z.number().int(),
  destinosVisiveis: z.number().int(),
  /** DERIVADO (nao observado): fora / visiveis. `null` quando nao ha volume visivel. */
  taxaFluxoExternoVisivel: z.number().nullable(),
});
export type FluxoResumoDTO = z.infer<typeof fluxoResumoSchema>;

export const fluxoMunicipioSchema = z.object({
  municipio: fluxoMunicipioRefSchema,
  ano: z.number().int(),
  /** Destinos (para onde vao os residentes). */
  saidas: z.array(fluxoItemSchema),
  /** Origens (de onde vem quem e atendido aqui). */
  entradas: z.array(fluxoItemSchema),
  resumo: fluxoResumoSchema,
});
export type FluxoMunicipioDTO = z.infer<typeof fluxoMunicipioSchema>;

export const poloAtendimentoSchema = z.object({
  municipio: fluxoMunicipioRefSchema,
  internacoesRecebidasDeFora: z.number().int(),
  municipiosDeOrigem: z.number().int(),
  /** Proveniencia por item - ver fluxoItemSchema.origem. */
  origem: z.nativeEnum(Origem),
});
export type PoloAtendimentoDTO = z.infer<typeof poloAtendimentoSchema>;

export const fluxoFiltroQuerySchema = z.object({
  ano: z.coerce.number().int().positive().optional(),
  origem: z.nativeEnum(Origem).optional(),
  limite: z.coerce.number().int().positive().max(50).optional(),
});
export type FluxoFiltroQuery = z.infer<typeof fluxoFiltroQuerySchema>;

/**
 * Como os filtros do fluxo foram resolvidos. `ano` continua nullable (pode
 * nao haver nenhum ano carregado para a origem pedida), mas `origem` NAO:
 * a API sempre aplica uma origem concreta na consulta (REAL por padrao) e
 * precisa declarar qual foi. Devolver `null` aqui, como acontecia ate a
 * higienizacao pos-5.10, dizia "nenhuma origem" enquanto o repositorio
 * filtrava REAL por baixo dos panos.
 */
export const fluxoFiltroResolvidoSchema = z.object({
  ano: z.number().int().nullable(),
  anosDisponiveis: z.array(z.number().int()),
  origem: z.nativeEnum(Origem),
});
export type FluxoFiltroResolvidoDTO = z.infer<typeof fluxoFiltroResolvidoSchema>;
