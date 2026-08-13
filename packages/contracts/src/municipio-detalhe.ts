import { z } from 'zod';
import { municipioResumoSchema } from './geo.js';
import { indicadorMunicipalItemSchema } from './indicador.js';
import { riskScoreItemSchema } from './risk.js';

/**
 * GET /api/municipios/:municipioId. `riscos`/`indicadores` sao todas as
 * linhas ja materializadas disponiveis para o municipio (ou o subconjunto
 * filtrado por competenciaId/riskConfigId/ano, quando informados) - cada uma
 * carregando sua propria origem/natureza, sem nenhuma agregacao entre elas.
 * `riscoMunicipio` reaproveita riskScoreItemSchema mas remove o campo
 * `municipio` (redundante: o municipio ja e o objeto pai).
 */
export const riscoDoMunicipioSchema = riskScoreItemSchema.omit({ municipio: true });
export type RiscoDoMunicipioDTO = z.infer<typeof riscoDoMunicipioSchema>;

export const municipioDetalheSchema = municipioResumoSchema.extend({
  riscos: z.array(riscoDoMunicipioSchema),
  indicadores: z.array(indicadorMunicipalItemSchema),
});
export type MunicipioDetalheDTO = z.infer<typeof municipioDetalheSchema>;
