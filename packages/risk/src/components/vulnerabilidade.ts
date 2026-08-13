/**
 * VULNERABILIDADE (docs/risk-methodology.md #2.4).
 *
 * Documentado: "Fonte ainda nao definida (decisao adiada). A arquitetura ja
 * acomoda a definicao posterior: o componente aponta para um
 * IndicadorDefinicao configuravel [...]. Enquanto o indicador nao existir,
 * o indice e calculado com os pesos renormalizados sobre os componentes
 * disponiveis, e a ausencia e registrada e exibida."
 *
 * Este e o UNICO componente cuja indisponibilidade e documentada como
 * comportamento esperado/permanente ate a Fase 5, nao uma lacuna a
 * resolver agora. A funcao aceita um valor ja resolvido externamente
 * (via IndicadorMunicipal + RiskConfigComponente.indicadorDefinicaoId) -
 * quando nenhuma fonte estiver configurada (indicadorDefinicaoId nulo, ou
 * sem IndicadorMunicipal correspondente), fica indisponivel, exatamente
 * como o documento prescreve. Nenhuma fonte socioeconomica e inventada
 * aqui.
 */
import type { ComponenteResultado, Natureza } from '../types.js';
import { calcularConfiabilidade } from '../reliability.js';

export interface VulnerabilidadeInput {
  /** Resolvido externamente via IndicadorMunicipal, se um IndicadorDefinicao estiver configurado. null = fonte nao definida/sem dado. */
  valorIndicador: number | null;
  naturezaIndicador: Natureza;
  volume: number | null;
  limiarVolumeMinimo: number;
}

export function calcularVulnerabilidade(input: VulnerabilidadeInput): ComponenteResultado {
  if (input.valorIndicador === null) {
    return {
      componente: 'VULNERABILIDADE',
      disponivel: false,
      valorBruto: null,
      valorNormalizado: null,
      natureza: input.naturezaIndicador,
      confiabilidade: 'BAIXA',
      motivoIndisponibilidade:
        'fonte do indicador de vulnerabilidade ainda nao definida (docs/risk-methodology.md #2.4)',
    };
  }
  return {
    componente: 'VULNERABILIDADE',
    disponivel: true,
    valorBruto: input.valorIndicador,
    valorNormalizado: null,
    natureza: input.naturezaIndicador,
    confiabilidade: calcularConfiabilidade(input.volume ?? 0, input.limiarVolumeMinimo),
  };
}
