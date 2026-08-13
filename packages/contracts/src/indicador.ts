import { z } from 'zod';
import { EixoTerritorial, IndicadorDirecao, Natureza, Origem } from './enums.js';

/**
 * Catalogo de indicadores plugaveis (GET /api/indicadores). `disponivel`
 * e calculado pela API (existe pelo menos 1 IndicadorMunicipal para essa
 * definicao) - nao e um campo do banco, evita o cliente ter que descobrir
 * isso fazendo uma segunda chamada.
 */
export const indicadorDefinicaoSchema = z.object({
  chave: z.string(),
  nome: z.string(),
  fonte: z.string(),
  unidade: z.string(),
  periodicidade: z.string(),
  direcao: z.nativeEnum(IndicadorDirecao),
  eixoTerritorial: z.nativeEnum(EixoTerritorial),
  naturezaPadrao: z.nativeEnum(Natureza),
  notaMetodologica: z.string().nullable(),
  ativo: z.boolean(),
  disponivel: z.boolean(),
});
export type IndicadorDefinicaoDTO = z.infer<typeof indicadorDefinicaoSchema>;

/** Um valor de IndicadorMunicipal (usado no detalhe de municipio). */
export const indicadorMunicipalItemSchema = z.object({
  indicadorDefinicaoId: z.string(),
  ano: z.number().int(),
  valor: z.number(),
  denominador: z.number().nullable(),
  origem: z.nativeEnum(Origem),
});
export type IndicadorMunicipalItemDTO = z.infer<typeof indicadorMunicipalItemSchema>;
