/**
 * Enums de proveniencia e dominio compartilhados.
 *
 * DECISAO ARQUITETURAL (ADR-001): a proveniencia de um numero e descrita em
 * dois eixos ortogonais, e nao em um enum unico. A interface continua exibindo
 * os quatro rotulos exigidos (REAL / DEMO / ESTIMATIVA / PROJECAO), derivando-os
 * da combinacao dos dois eixos.
 *
 *   Origem   -> de onde vieram os insumos
 *   Natureza -> como o numero foi produzido
 */

/** De onde vieram os insumos do dado. */
export const Origem = {
  /** Dado derivado de fonte oficial (SIH/SUS, CNES, IBGE). */
  REAL: 'REAL',
  /** Dado sintetico, gerado para desenvolvimento e demonstracao. */
  DEMO: 'DEMO',
} as const;
export type Origem = (typeof Origem)[keyof typeof Origem];

/** Como o numero foi produzido. */
export const Natureza = {
  /** Medido/contado diretamente a partir dos insumos. */
  OBSERVADO: 'OBSERVADO',
  /** Derivado por calculo que assume premissas (ex.: Pressao Hospitalar Estimada). */
  ESTIMATIVA: 'ESTIMATIVA',
  /** Valor futuro, produzido por metodo estatistico declarado. */
  PROJECAO: 'PROJECAO',
} as const;
export type Natureza = (typeof Natureza)[keyof typeof Natureza];

/**
 * Eixo territorial do indicador.
 * Regra inegociavel do projeto: indicadores populacionais usam RESIDENCIA,
 * indicadores de pressao/capacidade usam INTERNACAO. Nunca misturar.
 */
export const EixoTerritorial = {
  RESIDENCIA: 'RESIDENCIA',
  INTERNACAO: 'INTERNACAO',
} as const;
export type EixoTerritorial = (typeof EixoTerritorial)[keyof typeof EixoTerritorial];

/**
 * Enums do dominio do Radar de Risco (Fase 2), replicados aqui para o
 * contrato HTTP - mesma logica de duplicacao intencional de Origem/Natureza
 * (ver packages/db/prisma/schema.prisma e packages/risk/src/types.ts: cada
 * lado/camada mantem sua propria definicao de tipo, nao importa a de outro
 * package. Fase 3 e o primeiro consumidor HTTP desses valores.
 */

export const ComponenteRisco = {
  PRESSAO_HOSPITALAR_ESTIMADA: 'PRESSAO_HOSPITALAR_ESTIMADA',
  TENDENCIA: 'TENDENCIA',
  SEVERIDADE: 'SEVERIDADE',
  VULNERABILIDADE: 'VULNERABILIDADE',
} as const;
export type ComponenteRisco = (typeof ComponenteRisco)[keyof typeof ComponenteRisco];

export const ClassificacaoRisco = {
  CRITICO: 'CRITICO',
  ALTO: 'ALTO',
  MEDIO: 'MEDIO',
  BAIXO: 'BAIXO',
  MUITO_BAIXO: 'MUITO_BAIXO',
} as const;
export type ClassificacaoRisco = (typeof ClassificacaoRisco)[keyof typeof ClassificacaoRisco];

export const Confiabilidade = {
  ALTA: 'ALTA',
  MEDIA: 'MEDIA',
  BAIXA: 'BAIXA',
} as const;
export type Confiabilidade = (typeof Confiabilidade)[keyof typeof Confiabilidade];

/** Direcao de um IndicadorDefinicao: se valor maior ou menor representa pior situacao. */
export const IndicadorDirecao = {
  MAIOR_PIOR: 'MAIOR_PIOR',
  MENOR_PIOR: 'MENOR_PIOR',
} as const;
export type IndicadorDirecao = (typeof IndicadorDirecao)[keyof typeof IndicadorDirecao];
