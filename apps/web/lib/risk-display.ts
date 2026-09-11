/**
 * Mapeamento de APRESENTACAO para os valores que a API ja devolve prontos
 * (classificacao, confiabilidade, natureza, origem).
 *
 * IMPORTANTE: nada aqui calcula risco, define corte de classificacao ou
 * threshold de confiabilidade - isso pertence exclusivamente a
 * packages/risk (ver CLAUDE.md, invariante 3: "unica implementacao").
 * Este modulo so decide como um valor JA CALCULADO pela API aparece na
 * tela (rotulo em portugues, icone, cor) - a mesma classificacao 'CRITICO'
 * sempre vira o mesmo rotulo/icone em qualquer pagina do produto.
 */
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from 'lucide-react';
import type { ClassificacaoRisco, ComponenteRisco, Confiabilidade, Natureza, Origem } from '@healthmap/contracts';

export interface TomVisual {
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}

export interface ClassificacaoDisplay extends TomVisual {
  /** 1 (muito baixo) a 5 (critico) - usado para nao depender so de cor (texto "Nivel X/5"). */
  nivel: number;
  icon: LucideIcon;
  /** Cor cheia da rampa sequencial, para o swatch do chip e da legenda (`bg-*`). */
  swatchClass: string;
  /** Mesma cor da rampa, para preenchimento de SVG no mapa (`fill-*`). */
  mapFillClass: string;
}

/**
 * REDESIGN (E1) - troca de paleta, nao de metodologia.
 *
 * A escala anterior era esmeralda -> azul -> ambar -> laranja -> vermelho: o
 * matiz ciclava e a luminancia subia e descia, entao a ordem entre dois
 * municipios nao era perceptivel e o mapa lia como confete. A rampa atual
 * (`--risk-1..5`, ver app/globals.css) varia principalmente em LUMINANCIA,
 * o que preserva a ordem sob daltonismo.
 *
 * O que NAO mudou: os rotulos, o nivel numerico e a classificacao em si, que
 * continua vindo pronta da API. Nenhum limiar do RiskScore e tocado - este
 * modulo e camada de apresentacao (CLAUDE.md, invariante 3).
 *
 * Verde saiu da escala de proposito: risco e uma grandeza ORDENADA, nao uma
 * dualidade bom/ruim. Verde fica reservado a estado (confiabilidade alta),
 * onde de fato significa "favoravel".
 */

const CLASSIFICACAO_DISPLAY: Record<ClassificacaoRisco, ClassificacaoDisplay> = {
  CRITICO: {
    label: 'Crítico',
    nivel: 5,
    icon: AlertOctagon,
    textClass: 'text-risk-5-ink',
    bgClass: 'bg-risk-5-bg',
    borderClass: 'border-risk-5-line',
    swatchClass: 'bg-risk-5',
    mapFillClass: 'fill-risk-5',
  },
  ALTO: {
    label: 'Alto',
    nivel: 4,
    icon: AlertTriangle,
    textClass: 'text-risk-4-ink',
    bgClass: 'bg-risk-4-bg',
    borderClass: 'border-risk-4-line',
    swatchClass: 'bg-risk-4',
    mapFillClass: 'fill-risk-4',
  },
  MEDIO: {
    label: 'Médio',
    nivel: 3,
    icon: AlertCircle,
    textClass: 'text-risk-3-ink',
    bgClass: 'bg-risk-3-bg',
    borderClass: 'border-risk-3-line',
    swatchClass: 'bg-risk-3',
    mapFillClass: 'fill-risk-3',
  },
  BAIXO: {
    label: 'Baixo',
    nivel: 2,
    icon: Info,
    textClass: 'text-risk-2-ink',
    bgClass: 'bg-risk-2-bg',
    borderClass: 'border-risk-2-line',
    swatchClass: 'bg-risk-2',
    mapFillClass: 'fill-risk-2',
  },
  MUITO_BAIXO: {
    label: 'Muito baixo',
    nivel: 1,
    icon: CheckCircle2,
    textClass: 'text-risk-1-ink',
    bgClass: 'bg-risk-1-bg',
    borderClass: 'border-risk-1-line',
    swatchClass: 'bg-risk-1',
    mapFillClass: 'fill-risk-1',
  },
};

/** Do mais critico para o menos critico - ordem de exibicao padrao (ex.: legenda da escala). */
export const CLASSIFICACAO_ORDEM: ClassificacaoRisco[] = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO'];

export function getClassificacaoDisplay(classificacao: ClassificacaoRisco): ClassificacaoDisplay {
  return CLASSIFICACAO_DISPLAY[classificacao];
}

export interface ConfiabilidadeDisplay extends TomVisual {
  icon: LucideIcon;
  descricao: string;
}

const CONFIABILIDADE_DISPLAY: Record<Confiabilidade, ConfiabilidadeDisplay> = {
  ALTA: {
    label: 'Alta confiabilidade',
    icon: ShieldCheck,
    textClass: 'text-success',
    bgClass: 'bg-success/10',
    borderClass: 'border-success/25',
    descricao: 'Volume de dados acima do limiar minimo configurado.',
  },
  MEDIA: {
    label: 'Confiabilidade média',
    icon: ShieldQuestion,
    textClass: 'text-warning',
    bgClass: 'bg-warning/10',
    borderClass: 'border-warning/25',
    descricao: 'Confiabilidade intermediaria.',
  },
  BAIXA: {
    label: 'Baixa confiabilidade',
    icon: ShieldAlert,
    textClass: 'text-danger',
    bgClass: 'bg-danger/10',
    borderClass: 'border-danger/25',
    descricao: 'Volume de dados abaixo do limiar minimo - o indice pode refletir ruido estatistico, nao a situacao real do municipio.',
  },
};

export function getConfiabilidadeDisplay(confiabilidade: Confiabilidade): ConfiabilidadeDisplay {
  return CONFIABILIDADE_DISPLAY[confiabilidade];
}

export interface NaturezaDisplay extends TomVisual {
  descricao: string;
}

const NATUREZA_DISPLAY: Record<Natureza, NaturezaDisplay> = {
  OBSERVADO: {
    label: 'Observado',
    descricao: 'Medido/contado diretamente a partir dos insumos.',
    textClass: 'text-muted-foreground',
    bgClass: 'bg-surface-muted',
    borderClass: 'border-border',
  },
  ESTIMATIVA: {
    label: 'Estimativa',
    descricao: 'Derivado por calculo que assume premissas (ex.: Pressao Hospitalar Estimada).',
    textClass: 'text-warning',
    bgClass: 'bg-warning/10',
    borderClass: 'border-warning/25',
  },
  PROJECAO: {
    label: 'Projeção',
    descricao: 'Valor futuro, produzido por metodo estatistico declarado, com incerteza.',
    textClass: 'text-info',
    bgClass: 'bg-info/10',
    borderClass: 'border-info/25',
  },
};

export function getNaturezaDisplay(natureza: Natureza): NaturezaDisplay {
  return NATUREZA_DISPLAY[natureza];
}

export interface OrigemDisplay extends TomVisual {
  descricao: string;
}

const ORIGEM_DISPLAY: Record<Origem, OrigemDisplay> = {
  DEMO: {
    label: 'DEMO',
    descricao:
      'Dado sintetico, gerado para desenvolvimento e demonstracao. Nao representa a situacao real de nenhum municipio.',
    textClass: 'text-warning',
    bgClass: 'bg-warning/10',
    borderClass: 'border-warning/30',
  },
  REAL: {
    label: 'REAL',
    descricao: 'Derivado de fonte oficial (SIH/SUS, CNES, IBGE), por pipeline de ingestao registrado.',
    textClass: 'text-muted-foreground',
    bgClass: 'bg-surface-muted',
    borderClass: 'border-border',
  },
};

export function getOrigemDisplay(origem: Origem): OrigemDisplay {
  return ORIGEM_DISPLAY[origem];
}

/**
 * Municipio (dimensao geografica) nao tem coluna Origem no schema - só os
 * fatos tem (ver docs/data-model.md #3). A distincao usa o prefixo do
 * codigoIbge7: `36` é o prefixo sintetico que o seed DEMO usa (nunca é UF
 * valida em nenhum estado, ver seed-demo.ts), `35` é a UF real de SP.
 * Necessário porque alguns dos 15 municipios DEMO ilustrativos reusam o
 * nome de um municipio REAL homônimo (ex.: "Campinas", "Bauru", "Santos")
 * - sem este indicador as duas linhas ficariam indistinguíveis pelo nome
 * no catálogo e no detalhe de município.
 */
export function inferOrigemMunicipio(codigoIbge7: string): Origem {
  return codigoIbge7.startsWith('36') ? 'DEMO' : 'REAL';
}

/** Rotulo em portugues para cada componente do Radar - so apresentacao, o valor vem sempre da API. */
const COMPONENTE_LABEL: Record<ComponenteRisco, string> = {
  PRESSAO_HOSPITALAR_ESTIMADA: 'Pressão Hospitalar Estimada',
  TENDENCIA: 'Tendência',
  SEVERIDADE: 'Severidade',
  VULNERABILIDADE: 'Vulnerabilidade',
};

export function getComponenteLabel(componente: ComponenteRisco): string {
  return COMPONENTE_LABEL[componente];
}

/**
 * Motivo de indisponibilidade de um componente do Radar quando
 * `disponivel = false`. RiskComponenteValor NAO persiste o motivo (so o
 * motor em memoria sabe, ver packages/risk/src/types.ts) - por isso este
 * mapeamento usa apenas fatos ja documentados em docs/risk-methodology.md
 * (quais componentes tem lacuna metodologica estrutural) e nao inventa
 * nada especifico da linha. Para PRESSAO_HOSPITALAR_ESTIMADA, que tem
 * formula completa, a causa so pode ser dado insuficiente na competencia
 * (supressao ou ausencia de capacidade de leitos) - texto generico e
 * honesto, sem apontar uma causa especifica que a API nao informa.
 */
const MOTIVO_INDISPONIBILIDADE: Record<ComponenteRisco, string> = {
  PRESSAO_HOSPITALAR_ESTIMADA:
    'Sem dado suficiente nesta competência: células com contagem abaixo do limiar de supressão (n < 5) ou ausência de capacidade de leitos registrada para o município.',
  TENDENCIA:
    'Metodologia ainda não definida: a janela móvel e o tratamento de sazonalidade da variação da taxa de internação não foram especificados (ver Metodologia).',
  SEVERIDADE:
    'Metodologia ainda não definida: a fórmula de composição dos sub-indicadores (permanência média, diárias de UTI, letalidade) não foi especificada (ver Metodologia).',
  // A fonte existe desde a Fase 5.4 (IPVS/SEADE); o texto anterior ainda a
  // chamava de "nao definida". Generico pelo mesmo motivo dos demais.
  VULNERABILIDADE: 'Sem valor de vulnerabilidade social (IPVS/SEADE) para o município nesta competência.',
};

export function getMotivoIndisponibilidade(componente: ComponenteRisco): string {
  return MOTIVO_INDISPONIBILIDADE[componente];
}
