/**
 * TENDENCIA (docs/risk-methodology.md #2.2).
 *
 * Documentado: "Variacao da taxa por 10 mil habitantes em janela movel, com
 * tratamento de sazonalidade." Eixo: RESIDENCIA. Natureza: OBSERVADO.
 *
 * LACUNA METODOLOGICA (nao inventada): o documento nomeia o indicador base
 * (taxa por 10 mil habitantes) mas NAO define:
 *   - o tamanho da janela movel;
 *   - o metodo de tratamento de sazonalidade.
 * Nao ha, alem disso, dados suficientes na base DEMO da Fase 1 (6
 * competencias de um unico ano) para detectar sazonalidade de forma
 * significativa, mesmo que um metodo fosse escolhido.
 *
 * Por isso o componente TENDENCIA fica estruturalmente pronto mas SEMPRE
 * indisponivel nesta fase - calcular uma "variacao" sem janela nem
 * tratamento de sazonalidade definidos seria simular uma formula
 * provisoria como se fosse oficial, o que a Fase 2 explicitamente proibe.
 *
 * O QUE E COMPUTAVEL e exposto: a taxa por 10.000 habitantes em si (sem a
 * variacao/janela/sazonalidade) e um indicador OBSERVADO bem definido -
 * calculateTaxaPor10k() abaixo. E usado por packages/db para materializar
 * um IndicadorMunicipal (natureza OBSERVADO, eixo RESIDENCIA), nao como
 * RiskComponenteValor.
 */
import type { ComponenteResultado } from '../types.js';

export function calcularTendencia(): ComponenteResultado {
  return {
    componente: 'TENDENCIA',
    disponivel: false,
    valorBruto: null,
    valorNormalizado: null,
    natureza: 'OBSERVADO',
    confiabilidade: 'BAIXA',
    motivoIndisponibilidade:
      'janela movel e tratamento de sazonalidade nao definidos em docs/risk-methodology.md; ' +
      'base DEMO da Fase 1 tambem nao cobre mais de um ano-calendario',
  };
}

/**
 * Taxa de internacoes por 10.000 habitantes - o indicador OBSERVADO que
 * fundamenta TENDENCIA, mas sem a variacao/janela/sazonalidade (ver acima).
 * Eixo RESIDENCIA. `internacoes: null` = celula suprimida -> indicador
 * indisponivel (NULL != 0, nao vira taxa 0).
 */
export function calcularTaxaPor10k(internacoes: number | null, populacao: number): number | null {
  if (internacoes === null) return null;
  if (populacao <= 0) return null;
  return (internacoes / populacao) * 10_000;
}
