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

/**
 * REDESIGN (E1): a escala era esmeralda -> azul -> ambar -> laranja ->
 * vermelho. O matiz ciclava e a luminancia nao era monotonica, entao o mapa
 * nao comunicava ORDEM - dois municipios de baldes vizinhos podiam parecer
 * mais distantes que dois de baldes opostos. Agora usa a mesma rampa
 * sequencial do Radar (`--risk-1..5`, ver app/globals.css): luminancia
 * decrescente, legivel sob daltonismo, e coerente entre mapa, legenda e chip
 * de classificacao.
 *
 * Os baldes em si (quantis sobre os valores disponiveis) NAO mudaram - so a
 * cor com que cada um e desenhado.
 */
export const FAIXAS_COR = ['fill-risk-1', 'fill-risk-2', 'fill-risk-3', 'fill-risk-4', 'fill-risk-5'] as const;
/**
 * As mesmas 5 faixas para elementos HTML (legenda). Precisa existir separada
 * porque `fill-*` pinta SVG e `bg-*` pinta bloco - usar a lista do mapa na
 * legenda deixa os swatches transparentes.
 */
export const FAIXAS_COR_SWATCH = ['bg-risk-1', 'bg-risk-2', 'bg-risk-3', 'bg-risk-4', 'bg-risk-5'] as const;
export const FAIXAS_LABEL = ['Muito baixo', 'Baixo', 'Médio', 'Alto', 'Muito alto'] as const;
/** Fora da rampa de proposito: ausencia de dado nunca deve parecer "valor baixo". */
export const COR_INDISPONIVEL = 'fill-unavailable-bg';

export interface EscalaQuantil {
  /** Cor (classe Tailwind) para um valor - `null`/indisponivel sempre cai em COR_INDISPONIVEL, nunca num balde. */
  corPara(valor: number | null, disponivel: boolean): string;
  /** Indice da faixa (0-4) de um valor - usado pela legenda para contar municipios por faixa. */
  faixaPara(valor: number): number;
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
    return { corPara: () => COR_INDISPONIVEL, faixaPara: () => 0, cortes: [] };
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
    faixaPara: balde,
    corPara: (valor, disponivel) => {
      if (!disponivel || valor === null) return COR_INDISPONIVEL;
      return FAIXAS_COR[balde(valor)]!;
    },
  };
}
