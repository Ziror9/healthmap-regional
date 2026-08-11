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
