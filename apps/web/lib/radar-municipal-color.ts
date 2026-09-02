import type { RadarMunicipalItemDTO } from '@healthmap/contracts';

/**
 * Escala de cor por quantil para o Radar Municipal (Fase 5.7) - apresentacao
 * pura, client-side. Diferente de packages/risk/src/normalization.ts (que
 * calcula percentil como parte da METODOLOGIA do RiskScore, persistido no
 * banco): esta funcao so decide em qual dos 5 baldes visuais um valor JA
 * CALCULADO cai, para colorir o mapa/legenda - nenhum indicador e computado
 * ou alterado aqui, e nada daqui e persistido.
 *
 * Baseada na distribuicao real dos valores disponiveis (quantis), nao em
 * cortes fixos arbitrarios - mesmo raciocinio ja adotado por
 * classificarPorQuintil (packages/risk/src/score.ts) para o RiskScore.
 */

export const FAIXAS_COR = ['fill-emerald-300', 'fill-sky-300', 'fill-amber-300', 'fill-orange-300', 'fill-red-300'] as const;
export const FAIXAS_LABEL = ['Muito baixo', 'Baixo', 'Médio', 'Alto', 'Muito alto'] as const;
export const COR_INDISPONIVEL = 'fill-muted';

export interface EscalaQuantil {
  /** Cor (classe Tailwind) para um valor - `null`/indisponivel sempre cai em COR_INDISPONIVEL, nunca num balde. */
  corPara(valor: number | null, disponivel: boolean): string;
  /** Pontos de corte usados (para a legenda) - vazio se nao houver dado suficiente para 5 baldes distintos. */
  cortes: number[];
}

/** Constroi a escala a partir dos itens JA retornados pela API (nenhum recalculo de indicador, so particiona valores existentes). */
export function construirEscalaQuantil(itens: RadarMunicipalItemDTO[]): EscalaQuantil {
  const valores = itens
    .filter((i): i is RadarMunicipalItemDTO & { valor: number } => i.disponivel && i.valor !== null)
    .map((i) => i.valor)
    .sort((a, b) => a - b);

  if (valores.length === 0) {
    return { corPara: () => COR_INDISPONIVEL, cortes: [] };
  }

  const cortes = [0.2, 0.4, 0.6, 0.8].map((p) => {
    const indice = Math.min(valores.length - 1, Math.floor(p * valores.length));
    return valores[indice]!;
  });

  function balde(valor: number): number {
    for (let i = 0; i < cortes.length; i += 1) {
      if (valor <= cortes[i]!) return i;
    }
    return FAIXAS_COR.length - 1;
  }

  return {
    cortes,
    corPara: (valor, disponivel) => {
      if (!disponivel || valor === null) return COR_INDISPONIVEL;
      return FAIXAS_COR[balde(valor)]!;
    },
  };
}
