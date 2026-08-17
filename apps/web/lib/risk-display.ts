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
}

const CLASSIFICACAO_DISPLAY: Record<ClassificacaoRisco, ClassificacaoDisplay> = {
  CRITICO: {
    label: 'Crítico',
    nivel: 5,
    icon: AlertOctagon,
    textClass: 'text-red-700',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
  },
  ALTO: {
    label: 'Alto',
    nivel: 4,
    icon: AlertTriangle,
    textClass: 'text-orange-700',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-200',
  },
  MEDIO: {
    label: 'Médio',
    nivel: 3,
    icon: AlertCircle,
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
  },
  BAIXO: {
    label: 'Baixo',
    nivel: 2,
    icon: Info,
    textClass: 'text-sky-700',
    bgClass: 'bg-sky-50',
    borderClass: 'border-sky-200',
  },
  MUITO_BAIXO: {
    label: 'Muito baixo',
    nivel: 1,
    icon: CheckCircle2,
    textClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
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
    textClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    descricao: 'Volume de dados acima do limiar minimo configurado.',
  },
  MEDIA: {
    label: 'Confiabilidade média',
    icon: ShieldQuestion,
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
    descricao: 'Confiabilidade intermediaria.',
  },
  BAIXA: {
    label: 'Baixa confiabilidade',
    icon: ShieldAlert,
    textClass: 'text-amber-800',
    bgClass: 'bg-amber-100',
    borderClass: 'border-amber-300',
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
    textClass: 'text-slate-700',
    bgClass: 'bg-slate-100',
    borderClass: 'border-slate-300',
  },
  ESTIMATIVA: {
    label: 'Estimativa',
    descricao: 'Derivado por calculo que assume premissas (ex.: Pressao Hospitalar Estimada).',
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
  },
  PROJECAO: {
    label: 'Projeção',
    descricao: 'Valor futuro, produzido por metodo estatistico declarado, com incerteza.',
    textClass: 'text-indigo-700',
    bgClass: 'bg-indigo-50',
    borderClass: 'border-indigo-200',
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
    textClass: 'text-violet-700',
    bgClass: 'bg-violet-50',
    borderClass: 'border-violet-200',
  },
  REAL: {
    label: 'REAL',
    descricao: 'Derivado de fonte oficial (SIH/SUS, CNES, IBGE), por pipeline de ingestao registrado.',
    textClass: 'text-slate-700',
    bgClass: 'bg-slate-100',
    borderClass: 'border-slate-300',
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
  VULNERABILIDADE: 'Fonte do indicador de vulnerabilidade social ainda não definida (ver Metodologia).',
};

export function getMotivoIndisponibilidade(componente: ComponenteRisco): string {
  return MOTIVO_INDISPONIBILIDADE[componente];
}
