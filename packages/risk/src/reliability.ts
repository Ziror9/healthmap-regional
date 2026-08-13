/**
 * Confiabilidade por volume (docs/risk-methodology.md #5).
 *
 * "Municipios com volume abaixo de um limiar recebem marcacao de
 * confiabilidade baixa. [...] Municipios com confiabilidade baixa sao
 * exibidos com marcacao distinta e nao ocupam o topo do ranking por padrao."
 *
 * LACUNA METODOLOGICA (documentada, nao inventada): o documento define
 * apenas o corte de BAIXA (abaixo do limiar). Nao ha um segundo limiar que
 * distinga ALTA de MEDIA. Por isso esta funcao NUNCA retorna 'MEDIA' - fazer
 * isso exigiria inventar um segundo corte que a metodologia nao especifica.
 * Ver docs/known-limitations.md.
 */
import type { Confiabilidade } from './types.js';

export function calcularConfiabilidade(volume: number, limiarVolumeMinimo: number): Confiabilidade {
  return volume < limiarVolumeMinimo ? 'BAIXA' : 'ALTA';
}
