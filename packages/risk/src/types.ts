/**
 * Tipos do motor de risco. Definidos localmente (nao importados de
 * @prisma/client nem de @healthmap/contracts) porque packages/risk nao pode
 * depender de Prisma (regra arquitetural) e @healthmap/contracts existe para
 * o contrato HTTP web<->api, nao para o I/O interno do motor. Os valores de
 * string espelham os enums do Prisma (packages/db/prisma/schema.prisma) -
 * cada lado mantem sua propria definicao de tipo por design (ver comentario
 * equivalente em schema.prisma sobre Origem/Natureza).
 */

export type Origem = 'REAL' | 'DEMO';
export type Natureza = 'OBSERVADO' | 'ESTIMATIVA' | 'PROJECAO';
export type Confiabilidade = 'ALTA' | 'MEDIA' | 'BAIXA';
export type ClassificacaoRisco = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO';
export type Direcao = 'MAIOR_PIOR' | 'MENOR_PIOR';

/** Espelha packages/risk COMPONENTES_PREVISTOS / meta.ComponenteRisco no schema. */
export const COMPONENTES_PREVISTOS = [
  'PRESSAO_HOSPITALAR_ESTIMADA',
  'TENDENCIA',
  'SEVERIDADE',
  'VULNERABILIDADE',
] as const;
export type ComponenteRisco = (typeof COMPONENTES_PREVISTOS)[number];

/** Peso de um componente numa versao de metodologia (RiskConfigComponente). */
export interface ComponenteConfig {
  componente: ComponenteRisco;
  /** 0-1. O motor renormaliza sobre os componentes disponiveis - nao precisa somar 1. */
  peso: number;
}

/**
 * Configuracao explicita recebida pelo motor (equivalente a RiskConfig +
 * RiskConfigComponente materializados). Nunca ha peso hardcoded no motor -
 * tudo entra por aqui.
 */
export interface RiskConfigInput {
  id: number;
  limiarVolumeMinimo: number;
  componentes: ComponenteConfig[];
}

/** Resultado do calculo de um componente para um municipio+competencia. */
export interface ComponenteResultado {
  componente: ComponenteRisco;
  disponivel: boolean;
  valorBruto: number | null;
  /** Preenchido por normalizarComponentes(), null antes disso ou quando indisponivel. */
  valorNormalizado: number | null;
  natureza: Natureza;
  confiabilidade: Confiabilidade;
  /** Preenchido apenas quando disponivel = false. */
  motivoIndisponibilidade?: string;
}

/** Resultado final do indice composto para um municipio+competencia+config. */
export interface RiskScoreResultado {
  disponivel: boolean;
  indice: number | null;
  classificacao: ClassificacaoRisco | null;
  confiabilidade: Confiabilidade;
  natureza: Natureza;
  motivoIndisponibilidade?: string;
}

/** Identifica univocamente uma celula municipio+competencia dentro de uma coorte. */
export interface ChaveCoorte {
  municipioId: number;
  competenciaId: number;
}
