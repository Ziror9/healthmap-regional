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

/**
 * Total anual bruto (internacoes ou obitos oncologicos) - Fase 5.7. Nao e
 * IndicadorMunicipal (nao passou por calcularTaxaPor10k), e o fato agregado
 * em si. `total=null` sempre que `disponivel=false` (supressao n<5).
 */
export const totalAnualItemSchema = z.object({
  ano: z.number().int(),
  total: z.number().int().nullable(),
  disponivel: z.boolean(),
});
export type TotalAnualItemDTO = z.infer<typeof totalAnualItemSchema>;

export const municipioDetalheSchema = municipioResumoSchema.extend({
  riscos: z.array(riscoDoMunicipioSchema),
  indicadores: z.array(indicadorMunicipalItemSchema),
  internacoesAnuais: z.array(totalAnualItemSchema),
  obitosOncologicosAnuais: z.array(totalAnualItemSchema),
});
export type MunicipioDetalheDTO = z.infer<typeof municipioDetalheSchema>;
