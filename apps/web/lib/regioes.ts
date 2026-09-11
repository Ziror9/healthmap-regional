import type { ClassificacaoRisco, ComponenteRisco } from '@healthmap/contracts';

/**
 * Logica pura da pagina de Regioes de Saude (redesign E6).
 *
 * A pagina mostra o RADAR REGIONAL (Fase 5.5, `RiskScoreRegional`): um indice
 * calculado no grao da DRS, sobre o dado bruto regional. Nada aqui calcula,
 * media ou agrega indice - so indexa o que a API devolveu e cruza cada
 * municipio com a DRS a que pertence, para pintar o mapa com a classificacao
 * DA REGIAO.
 */

export interface ScoreRegionalMinimo {
  regiaoSaude: { id: number; nome: string; codigo: string };
  indice: number;
  classificacao: ClassificacaoRisco;
}

export interface MunicipioComRegiao {
  id: number;
  nome: string;
  codigoIbge7: string;
  regiaoSaude: { id: number; nome: string };
}

/** `?regiao=` da URL. Invalido vira "nenhuma selecao" em vez de quebrar a tela. */
export function interpretarRegiaoId(valor: string | null): number | undefined {
  if (valor === null) return undefined;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : undefined;
}

export function indexarPorRegiao<T extends ScoreRegionalMinimo>(scores: readonly T[]): Map<number, T> {
  const mapa = new Map<number, T>();
  for (const score of scores) mapa.set(score.regiaoSaude.id, score);
  return mapa;
}

/** Municipios de cada DRS, em ordem alfabetica (com acento, pt-BR). */
export function agruparMunicipiosPorRegiao<M extends MunicipioComRegiao>(municipios: readonly M[]): Map<number, M[]> {
  const grupos = new Map<number, M[]>();
  for (const municipio of municipios) {
    const lista = grupos.get(municipio.regiaoSaude.id) ?? [];
    lista.push(municipio);
    grupos.set(municipio.regiaoSaude.id, lista);
  }
  for (const lista of grupos.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return grupos;
}

/** Maior indice primeiro; empate pelo nome, para a ordem nao depender da resposta. */
export function ordenarPorIndice<T extends ScoreRegionalMinimo>(scores: readonly T[]): T[] {
  return [...scores].sort(
    (a, b) => b.indice - a.indice || a.regiaoSaude.nome.localeCompare(b.regiaoSaude.nome, 'pt-BR'),
  );
}

/** Quantas DRS em cada faixa - contagem da classificacao que a API ja devolveu, nenhum limiar aqui. */
export function contarPorClassificacao(scores: readonly ScoreRegionalMinimo[]): Record<ClassificacaoRisco, number> {
  const contagem: Record<ClassificacaoRisco, number> = { CRITICO: 0, ALTO: 0, MEDIO: 0, BAIXO: 0, MUITO_BAIXO: 0 };
  for (const score of scores) contagem[score.classificacao] += 1;
  return contagem;
}

/**
 * Motivo de indisponibilidade de um componente NO GRAO REGIONAL. A API nao
 * persiste o motivo da linha (ver `getMotivoIndisponibilidade` em
 * risk-display.ts), entao o texto so usa fatos documentados e nao aponta uma
 * causa especifica que ela nao informa. Separado do texto municipal porque
 * aquele fala em "o municipio" e, para vulnerabilidade, ainda descreve a
 * fonte como indefinida - o IPVS entrou na Fase 5.4.
 */
const MOTIVO_REGIONAL: Record<ComponenteRisco, string> = {
  PRESSAO_HOSPITALAR_ESTIMADA:
    'Sem dado suficiente nesta competência para a região: contagem abaixo do limiar de supressão (n < 5) ou capacidade de leitos não registrada. O histórico de leitos do CNES cobre 4 das 12 competências de 2024.',
  TENDENCIA:
    'Metodologia ainda não definida: a janela móvel e o tratamento de sazonalidade não foram especificados (ver Metodologia).',
  SEVERIDADE:
    'Metodologia ainda não definida: a composição dos sub-indicadores (permanência, UTI, letalidade) não foi especificada (ver Metodologia).',
  VULNERABILIDADE: 'Sem valor de vulnerabilidade social (IPVS) para a região nesta competência.',
};

export function motivoIndisponibilidadeRegional(componente: ComponenteRisco): string {
  return MOTIVO_REGIONAL[componente];
}
