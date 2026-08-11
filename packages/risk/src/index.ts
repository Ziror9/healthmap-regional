/**
 * @healthmap/risk
 *
 * Implementacao UNICA do Radar de Risco Regional.
 *
 * FASE 0: nenhum algoritmo implementado. Este package existe agora apenas para
 * fixar a fronteira arquitetural: quando o calculo chegar (Fase 2), ele vive
 * aqui e em nenhum outro lugar. O ETL (etl/) entrega insumos normalizaveis; a
 * API (apps/api) le resultados materializados; nenhum dos dois recalcula o
 * indice por conta propria.
 *
 * Conceito e metodologia: docs/risk-methodology.md
 *
 * Avisos que acompanham o indice em qualquer superficie do produto:
 *  - e um indice analitico e EXPERIMENTAL;
 *  - nao e diagnostico medico, risco clinico individual nem avaliacao de
 *    qualidade assistencial;
 *  - os pesos sao configuraveis e versionados (RiskConfig), e nenhum conjunto
 *    de pesos e oficial ate ser calibrado e validado.
 */

export const RISK_ENGINE_STATUS = 'not-implemented' as const;

/** Componentes previstos para a versao 0.1 do indice (definicao na Fase 2). */
export const COMPONENTES_PREVISTOS = [
  'PRESSAO_HOSPITALAR_ESTIMADA',
  'TENDENCIA',
  'SEVERIDADE',
  'VULNERABILIDADE',
] as const;

export type ComponenteRisco = (typeof COMPONENTES_PREVISTOS)[number];
